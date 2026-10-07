import express, { type Express, type Request, type Response, type Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { appendFileSync, createReadStream, existsSync, mkdirSync } from "node:fs";
import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { FixedWindowRateLimiter, ipRateKey, readClientIp } from "./rate-limit.js";

/**
 * Kapali oyun testinin kendi telemetrisi: hata raporu ve temel kullanim verisi.
 *
 * Ucuncu taraf servis yok; olaylar bu sunucuya geliyor ve gunluk JSON satiri
 * dosyalarina ekleniyor (`events-YYYY-MM-DD.jsonl`). Amac oyuncularin nerede
 * oldugunu, ne sectigini, nerede biraktigini ve hangi hatalari gordugunu
 * gormek.
 *
 * Kimlik yok: istemci rastgele bir kurulum kimligi (UUID) ve sayfa basina bir
 * oturum kimligi yolluyor. IP yalnizca bellekte, hiz siniri icin tutuluyor;
 * diske hicbir zaman yazilmiyor.
 *
 * Disk hatasi sunucuyu asla dusurmuyor: bir kez loglanip olay atiliyor, oyun
 * devam ediyor. Fly volume yoksa veri konteynerin diskinde duruyor ve her
 * deploy'da siliniyor; sunucu yine calisiyor.
 */

export const TELEMETRY_MAX_BODY_BYTES = 16 * 1024;
export const TELEMETRY_MAX_EVENTS_PER_REQUEST = 20;
export const TELEMETRY_RATE_LIMIT_PER_MINUTE = 30;
/**
 * Butun istemcilerin toplami: dakikada en fazla bu kadar olay kabul ediliyor.
 * IP basina sinir tek kaynagi tutuyor; cok adresli bir sel (IPv6 bloklari,
 * vekil havuzu) yine de diski ve tamponu doldurmasin.
 */
export const TELEMETRY_GLOBAL_EVENTS_PER_MINUTE = 3000;
/** Gunluk yazim kotasi (bayt, JSON satirlari). Asilinca gunun geri kalani 429. */
export const TELEMETRY_DAILY_BYTE_QUOTA = 50 * 1024 * 1024;
export const TELEMETRY_FLUSH_INTERVAL_MS = 3000;
export const TELEMETRY_MAX_TOTAL_BYTES = 500 * 1024 * 1024;
export const TELEMETRY_RETENTION_DAYS = 90;
export const TELEMETRY_SUMMARY_DEFAULT_DAYS = 7;
const MAX_BUFFERED_LINES = 5000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FILE_PATTERN = /^events-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * Varsayilan izinli kaynaklar: yerel gelistirme (her port, telefon testi icin
 * yerel ag dahil), Vercel'deki web istemcisi ve itch.io cercevesi. Yeni yerler
 * (ozel alan adi, portal) `TELEMETRY_ALLOWED_ORIGINS` ile ekleniyor (virgulle
 * ayrilmis, `*` joker); liste varsayilanlara ekleniyor, onlari silmiyor.
 * Yalnizca `/telemetry` icin: genel `cors()` ve Colyseus herkese acik kaliyor.
 *
 * Yerel adresler duz ifade: joker (`http://10.*`) harf de kabul ettigi icin
 * `http://10.evil.example` gibi bir alan adi yerel ag sanilirdi. Burada
 * yalnizca rakamli adres ve istege bagli rakamli port geciyor.
 */
export const DEFAULT_TELEMETRY_ORIGINS: ReadonlyArray<string | RegExp> = [
  /^https?:\/\/localhost(:\d{1,5})?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d{1,5})?$/,
  /^http:\/\/\[::1\](:\d{1,5})?$/,
  /^https?:\/\/192\.168(\.\d{1,3}){2}(:\d{1,5})?$/,
  /^https?:\/\/10(\.\d{1,3}){3}(:\d{1,5})?$/,
  "https://*.vercel.app",
  // itch.io'nun HTML oyun cercevesi bu kaynaklardan yukleniyor.
  "https://html.itch.zone",
  "https://html-classic.itch.zone",
  "https://v6p9d9t4.ssl.hwcdn.net"
];

// --- sema ----------------------------------------------------------------

type FieldRule = (value: unknown) => unknown;

const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

const text = (max: number): FieldRule => (value) => {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(CONTROL_CHARS, " ").slice(0, max);
  return cleaned.length > 0 ? cleaned : undefined;
};

const ident = (max: number): FieldRule => (value) =>
  typeof value === "string" && value.length > 0 && value.length <= max && ID_PATTERN.test(value) ? value : undefined;

const int = (min: number, max: number): FieldRule => (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : undefined;
};

const num = (min: number, max: number): FieldRule => (value) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return undefined;
  return Math.round(value * 100) / 100;
};

const bool: FieldRule = (value) => (typeof value === "boolean" ? value : undefined);

const oneOf = (...values: string[]): FieldRule => (value) =>
  typeof value === "string" && values.includes(value) ? value : undefined;

const identList = (maxItems: number, maxLength: number): FieldRule => (value) => {
  if (!Array.isArray(value)) return undefined;
  const rule = ident(maxLength);
  const out: string[] = [];
  for (const entry of value.slice(0, maxItems)) {
    const id = rule(entry);
    if (typeof id === "string") out.push(id);
  }
  return out;
};

const towerList = (maxItems: number): FieldRule => (value) => {
  if (!Array.isArray(value)) return undefined;
  const idRule = ident(48);
  const levelRule = int(0, 999);
  const out: Array<{ id: string; lvl: number }> = [];
  for (const entry of value.slice(0, maxItems)) {
    if (!entry || typeof entry !== "object") continue;
    const id = idRule((entry as { id?: unknown }).id);
    const lvl = levelRule((entry as { lvl?: unknown }).lvl);
    if (typeof id === "string" && typeof lvl === "number") out.push({ id, lvl });
  }
  return out;
};

type EventSchema = { required: readonly string[]; fields: Record<string, FieldRule> };

const MODE = oneOf("solo", "coop", "creative");
const STAGE = int(0, 99);
const OPERATOR = ident(32);
const RUN_ID = ident(40);
const WAVE = int(0, 999);
const DURATION_S = int(0, 7 * 24 * 3600);
const PING = int(0, 60_000);

export const TELEMETRY_EVENT_SCHEMAS: Record<string, EventSchema> = {
  session_start: {
    required: [],
    fields: {
      device: oneOf("mobile", "tablet", "desktop"),
      vw: int(0, 20_000),
      vh: int(0, 20_000),
      dpr: num(0, 10),
      lang: (value) => (typeof value === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(value) ? value : undefined),
      pwa: bool,
      iframe: bool,
      host: (value) => (typeof value === "string" && value.length <= 80 && /^[A-Za-z0-9.-]+$/.test(value) ? value.toLowerCase() : undefined)
    }
  },
  run_start: {
    required: ["rid", "mode"],
    fields: { rid: RUN_ID, mode: MODE, stage: STAGE, op: OPERATOR, players: int(1, 16), resumed: bool }
  },
  run_end: {
    required: ["rid", "outcome"],
    fields: {
      rid: RUN_ID,
      outcome: oneOf("win", "loss", "abandoned"),
      mode: MODE,
      stage: STAGE,
      op: OPERATOR,
      players: int(1, 16),
      wave: WAVE,
      dur: DURATION_S,
      hp: int(0, 10_000_000),
      maxHp: int(0, 10_000_000),
      cards: identList(80, 48),
      items: identList(80, 48),
      equipped: identList(80, 48),
      towers: towerList(60),
      goldLeft: int(0, 1_000_000_000),
      goldSpent: int(0, 1_000_000_000),
      kills: int(0, 100_000_000),
      leaks: int(0, 10_000_000),
      pingAvg: PING,
      pingMax: PING,
      fpsAvg: num(0, 1000),
      srid: ident(40)
    }
  },
  abandon: {
    required: ["rid"],
    fields: { rid: RUN_ID, wave: WAVE, reason: oneOf("hidden", "closed", "menu"), dur: DURATION_S, mode: MODE, stage: STAGE, op: OPERATOR }
  },
  error: {
    required: ["msg"],
    fields: {
      msg: text(300),
      stack: text(1500),
      kind: oneOf("error", "rejection", "phaser", "connect"),
      scene: text(48),
      wave: WAVE,
      rid: RUN_ID
    }
  },
  perf: {
    required: ["rid", "wave"],
    fields: {
      rid: RUN_ID,
      wave: WAVE,
      stage: STAGE,
      dur: DURATION_S,
      fpsAvg: num(0, 1000),
      fpsMin: num(0, 1000),
      pingAvg: PING,
      pingMax: PING,
      tickAvg: num(0, 60_000),
      tickMax: num(0, 60_000)
    }
  }
};

export type StoredTelemetryEvent = {
  /** Sunucunun alis zamani (ms); dosyanin gunu buradan. */
  at: number;
  iid: string;
  sid: string;
  ver?: string;
  t: string;
  ts?: number;
  [field: string]: unknown;
};

const INSTALL_ID = ident(64);
const SESSION_ID = ident(64);
const VERSION = text(40);
const CLIENT_TS = int(0, 9_000_000_000_000);

/** Tek olayi semaya gore temizler; bilinmeyen alan atiliyor, zorunlu alan yoksa olay yok. */
export function sanitizeTelemetryEvent(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const type = typeof source.t === "string" ? source.t : undefined;
  const schema = type && Object.hasOwn(TELEMETRY_EVENT_SCHEMAS, type) ? TELEMETRY_EVENT_SCHEMAS[type] : undefined;
  if (!type || !schema) return undefined;
  const event: Record<string, unknown> = { t: type };
  const ts = CLIENT_TS(source.ts);
  if (ts !== undefined) event.ts = ts;
  for (const [field, rule] of Object.entries(schema.fields)) {
    if (!Object.hasOwn(source, field)) continue;
    const value = rule(source[field]);
    if (value !== undefined) event[field] = value;
  }
  for (const field of schema.required) {
    if (event[field] === undefined) return undefined;
  }
  return event;
}

/**
 * Istek govdesini temizler: `{ iid, sid, ver, events: [...] }`.
 * Govde bicimi bozuksa `undefined`; tek tek gecersiz olaylar sayilip atiliyor.
 */
export function sanitizeTelemetryBatch(body: unknown, now = Date.now()):
  { events: StoredTelemetryEvent[]; dropped: number } | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const source = body as Record<string, unknown>;
  const iid = INSTALL_ID(source.iid);
  const sid = SESSION_ID(source.sid);
  if (typeof iid !== "string" || typeof sid !== "string" || !Array.isArray(source.events)) return undefined;
  const ver = VERSION(source.ver);
  const events: StoredTelemetryEvent[] = [];
  let dropped = Math.max(0, source.events.length - TELEMETRY_MAX_EVENTS_PER_REQUEST);
  for (const raw of source.events.slice(0, TELEMETRY_MAX_EVENTS_PER_REQUEST)) {
    const event = sanitizeTelemetryEvent(raw);
    if (!event) {
      dropped += 1;
      continue;
    }
    const stored: StoredTelemetryEvent = { at: now, iid, sid, t: event.t as string };
    if (typeof ver === "string") stored.ver = ver;
    Object.assign(stored, event);
    events.push(stored);
  }
  return { events, dropped };
}

// --- kaynak (CORS) ---------------------------------------------------------

export function parseAllowedOrigins(raw: string | undefined, defaults: ReadonlyArray<string | RegExp> = DEFAULT_TELEMETRY_ORIGINS) {
  const extra = (raw ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  return [...defaults, ...extra].map((pattern) => {
    if (pattern instanceof RegExp) return pattern;
    if (pattern === "*") return /^.*$/;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[A-Za-z0-9.-]*");
    return new RegExp(`^${escaped}$`, "i");
  });
}

export function isOriginAllowed(origin: string, rules: readonly RegExp[]) {
  return origin.length <= 200 && rules.some((rule) => rule.test(origin));
}

// --- hiz siniri ---------------------------------------------------------------

/**
 * Sabit pencereli sayac; anahtar IP (IPv6 icin /64), yalnizca bellekte.
 * Temizlik `startPruning` zamanlayicisinda; `hit` anahtar basina sabit is.
 */
export class TelemetryRateLimiter extends FixedWindowRateLimiter {
  constructor(limit = TELEMETRY_RATE_LIMIT_PER_MINUTE, windowMs = RATE_WINDOW_MS, now: () => number = Date.now) {
    super(limit, windowMs, now);
  }
}

/**
 * Butun istemcilerin ortak butcesi: dakikalik olay sayisi ve gunluk bayt.
 *
 * IP basina sinirin ustunde ikinci kapi. Asilinca istek 429 ile cevaplanip
 * atiliyor; dakika ya da gun donunce kendiliginden aciliyor.
 */
export class TelemetryBudget {
  private minuteStart = Number.NEGATIVE_INFINITY;
  private minuteEvents = 0;
  private day = "";
  private dayBytes = 0;

  constructor(
    private readonly eventsPerMinute = TELEMETRY_GLOBAL_EVENTS_PER_MINUTE,
    private readonly bytesPerDay = TELEMETRY_DAILY_BYTE_QUOTA,
    private readonly now: () => number = Date.now
  ) {}

  /** Pencerelerden biri zaten dolu mu; govde okunmadan once soruluyor. */
  exhausted() {
    this.roll();
    return this.minuteEvents >= this.eventsPerMinute || this.dayBytes >= this.bytesPerDay;
  }

  /** Olaylari butceye yazar; sigmiyorsa hicbirini almaz ve `false` doner. */
  take(events: number, bytes: number) {
    this.roll();
    if (this.minuteEvents + events > this.eventsPerMinute || this.dayBytes + bytes > this.bytesPerDay) return false;
    this.minuteEvents += events;
    this.dayBytes += bytes;
    return true;
  }

  private roll() {
    const now = this.now();
    if (now - this.minuteStart >= RATE_WINDOW_MS) {
      this.minuteStart = now;
      this.minuteEvents = 0;
    }
    const day = dayKey(now);
    if (day !== this.day) {
      this.day = day;
      this.dayBytes = 0;
    }
  }
}

// --- depo --------------------------------------------------------------------

export function resolveTelemetryDir(env: NodeJS.ProcessEnv = process.env) {
  if (env.TELEMETRY_DIR) return resolve(env.TELEMETRY_DIR);
  return existsSync("/data") ? "/data/telemetry" : resolve("data/telemetry");
}

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export type TelemetryStoreOptions = {
  dir: string;
  maxTotalBytes?: number;
  retentionDays?: number;
  flushIntervalMs?: number;
  now?: () => number;
  log?: (message: string) => void;
};

/**
 * Tamponlu JSONL yazicisi.
 *
 * Olaylar bellekte birikiyor ve birkac saniyede bir gunun dosyasina ekleniyor.
 * Her disk islemi try/catch icinde: hata bir kez loglaniyor, o tampon
 * atiliyor ve sunucu devam ediyor. Toplam boyut sinirini asan yazim da
 * atiliyor (bir kez loglanir); eski dosyalar saklama suresinden sonra siliniyor.
 */
export class TelemetryStore {
  readonly dir: string;
  private readonly maxTotalBytes: number;
  private readonly retentionDays: number;
  private readonly flushIntervalMs: number;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private pending = new Map<string, string[]>();
  private pendingLines = 0;
  private flushing?: Promise<void>;
  private totalBytes?: number;
  private diskErrorLogged = false;
  private sizeCapLogged = false;
  private overflowLogged = false;
  private timers: NodeJS.Timeout[] = [];
  /** Tani icin sayaclar; testler ve ozet okuyor. */
  readonly stats = { written: 0, droppedDisk: 0, droppedSize: 0, droppedOverflow: 0, diskErrors: 0 };

  constructor(options: TelemetryStoreOptions) {
    this.dir = options.dir;
    this.maxTotalBytes = options.maxTotalBytes ?? TELEMETRY_MAX_TOTAL_BYTES;
    this.retentionDays = options.retentionDays ?? TELEMETRY_RETENTION_DAYS;
    this.flushIntervalMs = options.flushIntervalMs ?? TELEMETRY_FLUSH_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((message) => console.warn(message));
  }

  /** Periyodik yazim ve temizlik; zamanlayicilar sureci acik tutmuyor. */
  start() {
    if (this.timers.length > 0) return;
    const flush = setInterval(() => void this.flush(), this.flushIntervalMs);
    const prune = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    flush.unref();
    prune.unref();
    this.timers.push(flush, prune);
    void this.prune();
  }

  stop() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  append(events: readonly StoredTelemetryEvent[]) {
    for (const event of events) {
      if (this.pendingLines >= MAX_BUFFERED_LINES) {
        this.stats.droppedOverflow += 1;
        if (!this.overflowLogged) {
          this.overflowLogged = true;
          this.log("[telemetry] tampon dolu; yeni olaylar atiliyor");
        }
        continue;
      }
      const key = dayKey(event.at);
      let lines = this.pending.get(key);
      if (!lines) {
        lines = [];
        this.pending.set(key, lines);
      }
      lines.push(`${JSON.stringify(event)}\n`);
      this.pendingLines += 1;
    }
  }

  get bufferedCount() {
    return this.pendingLines;
  }

  /** Tamponu diske yazar; ayni anda tek yazim. */
  async flush() {
    while (this.flushing) await this.flushing;
    if (this.pendingLines === 0) return;
    const batch = this.pending;
    this.pending = new Map();
    this.pendingLines = 0;
    this.overflowLogged = false;
    this.flushing = this.writeBatch(batch).finally(() => {
      this.flushing = undefined;
    });
    await this.flushing;
  }

  /** Surec kapanirken: esanli yazim (`exit` dinleyicisi beklemiyor). */
  flushSync() {
    if (this.pendingLines === 0) return;
    const batch = this.pending;
    this.pending = new Map();
    this.pendingLines = 0;
    try {
      mkdirSync(this.dir, { recursive: true });
      for (const [day, lines] of batch) {
        const data = lines.join("");
        if (!this.reserve(Buffer.byteLength(data), lines.length)) continue;
        appendFileSync(join(this.dir, `events-${day}.jsonl`), data, "utf8");
        this.stats.written += lines.length;
      }
    } catch (error) {
      this.diskError(error, 0);
    }
  }

  private async writeBatch(batch: Map<string, string[]>) {
    try {
      await mkdir(this.dir, { recursive: true });
      if (this.totalBytes === undefined) this.totalBytes = await this.measure();
    } catch (error) {
      this.diskError(error, [...batch.values()].reduce((sum, lines) => sum + lines.length, 0));
      return;
    }
    for (const [day, lines] of batch) {
      const data = lines.join("");
      const bytes = Buffer.byteLength(data);
      if (!this.reserve(bytes, lines.length)) continue;
      try {
        await appendFile(join(this.dir, `events-${day}.jsonl`), data, "utf8");
        this.stats.written += lines.length;
        this.diskErrorLogged = false;
      } catch (error) {
        this.totalBytes = Math.max(0, (this.totalBytes ?? bytes) - bytes);
        this.diskError(error, lines.length);
      }
    }
  }

  /** Boyut sinirini kontrol eder ve yeri ayirir. */
  private reserve(bytes: number, lines: number) {
    const total = this.totalBytes ?? 0;
    if (total + bytes > this.maxTotalBytes) {
      this.stats.droppedSize += lines;
      if (!this.sizeCapLogged) {
        this.sizeCapLogged = true;
        this.log(`[telemetry] toplam boyut siniri (${Math.round(this.maxTotalBytes / 1024 / 1024)} MB) asildi; yazim durdu`);
      }
      return false;
    }
    this.totalBytes = total + bytes;
    return true;
  }

  private diskError(error: unknown, lines: number) {
    this.stats.diskErrors += 1;
    this.stats.droppedDisk += lines;
    if (this.diskErrorLogged) return;
    this.diskErrorLogged = true;
    const message = error instanceof Error ? error.message : String(error);
    this.log(`[telemetry] disk hatasi, olaylar atildi (${this.dir}): ${message}`);
  }

  private async listDataFiles() {
    try {
      const names = await readdir(this.dir);
      return names.map((name) => ({ name, match: FILE_PATTERN.exec(name) })).filter((entry) => entry.match)
        .map((entry) => ({ name: entry.name, day: entry.match![1] }));
    } catch {
      return [];
    }
  }

  private async measure() {
    let total = 0;
    for (const file of await this.listDataFiles()) {
      try {
        total += (await stat(join(this.dir, file.name))).size;
      } catch {
        // Dosya arada silindiyse sayilmiyor.
      }
    }
    return total;
  }

  /** Saklama suresini gecen gunleri siler ve toplam boyutu yeniden olcer. */
  async prune() {
    const cutoff = dayKey(this.now() - this.retentionDays * DAY_MS);
    for (const file of await this.listDataFiles()) {
      if (file.day >= cutoff) continue;
      try {
        await unlink(join(this.dir, file.name));
      } catch (error) {
        this.diskError(error, 0);
      }
    }
    this.totalBytes = await this.measure();
    if (this.totalBytes < this.maxTotalBytes) this.sizeCapLogged = false;
  }

  /** Son `days` gunun var olan dosyalari, eskiden yeniye. */
  async filesForLastDays(days: number) {
    const from = dayKey(this.now() - (days - 1) * DAY_MS);
    const to = dayKey(this.now());
    const files = (await this.listDataFiles()).filter((file) => file.day >= from && file.day <= to);
    files.sort((left, right) => left.day.localeCompare(right.day));
    return { from, to, paths: files.map((file) => join(this.dir, file.name)) };
  }
}

// --- ozet --------------------------------------------------------------------

type Histogram = Record<string, Record<string, number>>;
type RateRow = { runs: number; wins: number; losses: number; abandoned: number; winRate: number | null };
type RunTrack = { stage?: number; op?: string; mode?: string; lastWave: number; outcome?: string; started: boolean };

export type TelemetrySummary = {
  from: string;
  to: string;
  days: number;
  files: number;
  events: number;
  badLines: number;
  sessions: number;
  installs: number;
  devices: Record<string, number>;
  runs: { started: number; win: number; loss: number; abandoned: number; unfinished: number; creative: number };
  deathWaves: Histogram;
  quitWaves: Histogram;
  winRate: { byStage: Record<string, RateRow>; byOperator: Record<string, RateRow> };
  topCards: Array<{ id: string; count: number }>;
  topItems: Array<{ id: string; count: number }>;
  topErrors: Array<{ msg: string; frame: string; count: number; sessions: number }>;
  perfByWave: Record<string, { samples: number; fpsAvg: number | null; fpsMin: number | null; pingAvg: number | null; pingMax: number | null; tickAvg: number | null }>;
};

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function bumpHistogram(histogram: Histogram, stage: number | undefined, wave: number) {
  const stageKey = String(stage ?? 0);
  const row = histogram[stageKey] ?? (histogram[stageKey] = {});
  row[String(wave)] = (row[String(wave)] ?? 0) + 1;
}

function rateRow(row: RateRow | undefined): RateRow {
  return row ?? { runs: 0, wins: 0, losses: 0, abandoned: 0, winRate: null };
}

function topOf(map: Map<string, number>, limit: number) {
  return [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit).map(([id, count]) => ({ id, count }));
}

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const average = (sum: number, count: number) => (count > 0 ? round(sum / count) : null);

/**
 * JSONL dosyalarindan kucuk bir ozet; dosyalar satir satir akiyor.
 * Yaratici kosular kazanma orani, olum ve birakma dalgalarina girmiyor.
 */
export async function summarizeTelemetryFiles(paths: readonly string[], range: { from: string; to: string; days: number }): Promise<TelemetrySummary> {
  const sessions = new Set<string>();
  const installs = new Set<string>();
  const devices = new Map<string, number>();
  const runs = new Map<string, RunTrack>();
  const cards = new Map<string, number>();
  const items = new Map<string, number>();
  const errors = new Map<string, { msg: string; frame: string; count: number; sessions: Set<string> }>();
  const perf = new Map<string, { samples: number; fpsSum: number; fpsN: number; minSum: number; minN: number; pingSum: number; pingN: number; pingMax: number | null; tickSum: number; tickN: number }>();
  let events = 0;
  let badLines = 0;

  const track = (event: StoredTelemetryEvent) => {
    // Kosu kimligi rastgele ve sayfa yenilemesinde korunuyor (istemci
    // `sessionStorage`); oturum kimligi degisse de ayni kosu tek satir.
    const key = String(event.rid);
    let run = runs.get(key);
    if (!run) {
      run = { lastWave: 0, started: false };
      runs.set(key, run);
    }
    if (typeof event.stage === "number" && run.stage === undefined) run.stage = event.stage;
    if (typeof event.op === "string" && run.op === undefined) run.op = event.op;
    if (typeof event.mode === "string" && run.mode === undefined) run.mode = event.mode;
    if (typeof event.wave === "number") run.lastWave = Math.max(run.lastWave, event.wave);
    return run;
  };

  for (const path of paths) {
    const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line) continue;
        let event: StoredTelemetryEvent;
        try {
          event = JSON.parse(line) as StoredTelemetryEvent;
        } catch {
          badLines += 1;
          continue;
        }
        if (!event || typeof event !== "object" || typeof event.t !== "string") {
          badLines += 1;
          continue;
        }
        events += 1;
        if (typeof event.sid === "string") sessions.add(event.sid);
        if (typeof event.iid === "string") installs.add(event.iid);
        switch (event.t) {
          case "session_start":
            if (typeof event.device === "string") bump(devices, event.device);
            break;
          case "run_start":
            track(event).started = true;
            break;
          case "abandon":
            track(event);
            break;
          case "run_end": {
            const run = track(event);
            const outcome = String(event.outcome);
            // Kazanma ya da kaybetme kesin; birakma onlari ezmiyor.
            if (run.outcome !== "win" && run.outcome !== "loss") run.outcome = outcome;
            if (run.mode !== "creative" && (outcome === "win" || outcome === "loss")) {
              for (const id of Array.isArray(event.cards) ? event.cards : []) if (typeof id === "string") bump(cards, id);
              for (const id of Array.isArray(event.items) ? event.items : []) if (typeof id === "string") bump(items, id);
            }
            break;
          }
          case "perf": {
            track(event);
            const wave = typeof event.wave === "number" ? String(event.wave) : "0";
            let row = perf.get(wave);
            if (!row) {
              row = { samples: 0, fpsSum: 0, fpsN: 0, minSum: 0, minN: 0, pingSum: 0, pingN: 0, pingMax: null, tickSum: 0, tickN: 0 };
              perf.set(wave, row);
            }
            row.samples += 1;
            if (typeof event.fpsAvg === "number") { row.fpsSum += event.fpsAvg; row.fpsN += 1; }
            if (typeof event.fpsMin === "number") { row.minSum += event.fpsMin; row.minN += 1; }
            if (typeof event.pingAvg === "number") { row.pingSum += event.pingAvg; row.pingN += 1; }
            if (typeof event.pingMax === "number") row.pingMax = Math.max(row.pingMax ?? 0, event.pingMax);
            if (typeof event.tickAvg === "number") { row.tickSum += event.tickAvg; row.tickN += 1; }
            break;
          }
          case "error": {
            const msg = typeof event.msg === "string" ? event.msg : "";
            const frame = typeof event.stack === "string" ? (event.stack.split("\n").find((part) => part.trim()) ?? "").trim() : "";
            const key = `${msg}\n${frame}`;
            let row = errors.get(key);
            if (!row) {
              row = { msg, frame, count: 0, sessions: new Set() };
              errors.set(key, row);
            }
            row.count += 1;
            if (typeof event.sid === "string") row.sessions.add(event.sid);
            break;
          }
          default:
            break;
        }
      }
    } catch {
      // Okunamayan dosya ozetten dusuyor; endpoint yine cevap veriyor.
      badLines += 1;
    } finally {
      lines.close();
    }
  }

  const summary: TelemetrySummary = {
    ...range,
    files: paths.length,
    events,
    badLines,
    sessions: sessions.size,
    installs: installs.size,
    devices: Object.fromEntries(devices),
    runs: { started: 0, win: 0, loss: 0, abandoned: 0, unfinished: 0, creative: 0 },
    deathWaves: {},
    quitWaves: {},
    winRate: { byStage: {}, byOperator: {} },
    topCards: topOf(cards, 20),
    topItems: topOf(items, 20),
    topErrors: [...errors.values()].sort((left, right) => right.count - left.count).slice(0, 20)
      .map((row) => ({ msg: row.msg, frame: row.frame, count: row.count, sessions: row.sessions.size })),
    perfByWave: {}
  };

  for (const run of runs.values()) {
    if (!run.started && !run.outcome) continue;
    if (run.started) summary.runs.started += 1;
    if (run.mode === "creative") {
      summary.runs.creative += 1;
      continue;
    }
    const outcome = run.outcome === "win" || run.outcome === "loss" || run.outcome === "abandoned" ? run.outcome : undefined;
    if (outcome) summary.runs[outcome] += 1;
    else summary.runs.unfinished += 1;
    if (outcome === "loss") bumpHistogram(summary.deathWaves, run.stage, run.lastWave);
    // Birakma: kazanma ya da kaybetmeyle bitmeyen her kosu, gorulen son dalgasiyla.
    if (outcome !== "win" && outcome !== "loss") bumpHistogram(summary.quitWaves, run.stage, run.lastWave);
    const rows: Array<[Record<string, RateRow>, string]> = [[summary.winRate.byStage, String(run.stage ?? 0)]];
    if (run.op) rows.push([summary.winRate.byOperator, run.op]);
    for (const [table, key] of rows) {
      const row = rateRow(table[key]);
      row.runs += 1;
      if (outcome === "win") row.wins += 1;
      else if (outcome === "loss") row.losses += 1;
      else row.abandoned += 1;
      row.winRate = row.wins + row.losses > 0 ? round(row.wins / (row.wins + row.losses), 3) : null;
      table[key] = row;
    }
  }

  for (const [wave, row] of [...perf.entries()].sort((left, right) => Number(left[0]) - Number(right[0]))) {
    summary.perfByWave[wave] = {
      samples: row.samples,
      fpsAvg: average(row.fpsSum, row.fpsN),
      fpsMin: average(row.minSum, row.minN),
      pingAvg: average(row.pingSum, row.pingN),
      pingMax: row.pingMax,
      tickAvg: average(row.tickSum, row.tickN)
    };
  }
  return summary;
}

// --- HTTP --------------------------------------------------------------------

export type TelemetryOptions = {
  dir?: string;
  allowedOrigins?: string;
  adminToken?: string;
  rateLimitPerMinute?: number;
  /** Butun istemcilerin dakikalik olay siniri. */
  globalEventsPerMinute?: number;
  /** Gunluk yazim kotasi (bayt). */
  dailyByteQuota?: number;
  maxTotalBytes?: number;
  retentionDays?: number;
  flushIntervalMs?: number;
  now?: () => number;
  log?: (message: string) => void;
  /** `false`: zamanlayicilar ve cikis yazimi kurulmuyor (testler). */
  autoStart?: boolean;
};

export type TelemetryService = {
  router: Router;
  store: TelemetryStore;
  stop: () => void;
};

/**
 * Istemci IP'si yalnizca hiz siniri icin; Fly vekili gercek adresi
 * `Fly-Client-IP` basliginda veriyor. IPv6 /64 onekiyle sayiliyor.
 */
function clientKey(request: Request) {
  return ipRateKey(readClientIp(request.headers, request.socket.remoteAddress));
}

/** Olaylarin diske yazilacak boyu (JSON satiri + satir sonu), kota icin. */
function storedBytes(events: readonly StoredTelemetryEvent[]) {
  let bytes = 0;
  for (const event of events) bytes += Buffer.byteLength(JSON.stringify(event)) + 1;
  return bytes;
}

function readBody(request: Request, limit: number): Promise<Buffer | "too-large"> {
  return new Promise((resolvePromise, reject) => {
    const declared = Number(request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      request.resume();
      resolvePromise("too-large");
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    request.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        resolvePromise("too-large");
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (done) return;
      done = true;
      resolvePromise(Buffer.concat(chunks));
    });
    request.on("error", (error) => {
      if (done) return;
      done = true;
      reject(error);
    });
  });
}

function tokenMatches(header: string | undefined, token: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(header.slice(7).trim()).digest();
  const expected = createHash("sha256").update(token).digest();
  return timingSafeEqual(given, expected);
}

export function createTelemetry(options: TelemetryOptions = {}): TelemetryService {
  const now = options.now ?? Date.now;
  const store = new TelemetryStore({
    dir: options.dir ?? resolveTelemetryDir(),
    maxTotalBytes: options.maxTotalBytes,
    retentionDays: options.retentionDays,
    flushIntervalMs: options.flushIntervalMs,
    now,
    log: options.log
  });
  const origins = parseAllowedOrigins(options.allowedOrigins);
  const limiter = new TelemetryRateLimiter(options.rateLimitPerMinute ?? TELEMETRY_RATE_LIMIT_PER_MINUTE, RATE_WINDOW_MS, now);
  const budget = new TelemetryBudget(
    options.globalEventsPerMinute ?? TELEMETRY_GLOBAL_EVENTS_PER_MINUTE,
    options.dailyByteQuota ?? TELEMETRY_DAILY_BYTE_QUOTA,
    now
  );
  const adminToken = options.adminToken?.trim() || undefined;
  const router = express.Router();

  /** Izinli kaynaga CORS basliklari; kaynaksiz istek (curl, sunucu) serbest. */
  const applyCors = (request: Request, response: Response) => {
    const origin = request.headers.origin;
    response.setHeader("Vary", "Origin");
    if (!origin) return true;
    if (!isOriginAllowed(origin, origins)) return false;
    response.setHeader("Access-Control-Allow-Origin", origin);
    return true;
  };

  router.options("/", (request, response) => {
    if (!applyCors(request, response)) {
      response.status(403).end();
      return;
    }
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Max-Age", "86400");
    response.status(204).end();
  });

  router.post("/", (request, response) => {
    if (!applyCors(request, response)) {
      request.resume();
      response.status(403).end();
      return;
    }
    // Ortak butce doluysa govde hic okunmuyor.
    if (!limiter.hit(clientKey(request)) || budget.exhausted()) {
      request.resume();
      response.setHeader("Retry-After", "60");
      response.status(429).end();
      return;
    }
    readBody(request, TELEMETRY_MAX_BODY_BYTES).then((body) => {
      if (body === "too-large") {
        response.status(413).end();
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        response.status(400).end();
        return;
      }
      const batch = sanitizeTelemetryBatch(parsed, now());
      if (!batch) {
        response.status(400).end();
        return;
      }
      // Dakikalik olay ya da gunluk bayt butcesine sigmayan istek atiliyor.
      if (batch.events.length > 0 && !budget.take(batch.events.length, storedBytes(batch.events))) {
        response.setHeader("Retry-After", "60");
        response.status(429).end();
        return;
      }
      store.append(batch.events);
      response.status(204).end();
    }).catch(() => {
      if (!response.headersSent) response.status(400).end();
    });
  });

  router.get("/summary", (request, response) => {
    // Jeton yoksa ucun varligi bile gorunmuyor.
    if (!adminToken) {
      response.status(404).end();
      return;
    }
    if (!tokenMatches(request.headers.authorization, adminToken)) {
      response.status(401).end();
      return;
    }
    const requested = Number(request.query.days);
    const days = Number.isFinite(requested) ? Math.min(TELEMETRY_RETENTION_DAYS, Math.max(1, Math.floor(requested))) : TELEMETRY_SUMMARY_DEFAULT_DAYS;
    void (async () => {
      try {
        await store.flush();
        const files = await store.filesForLastDays(days);
        const summary = await summarizeTelemetryFiles(files.paths, { from: files.from, to: files.to, days });
        response.setHeader("Cache-Control", "no-store");
        response.json(summary);
      } catch {
        if (!response.headersSent) response.status(500).end();
      }
    })();
  });

  const onExit = () => store.flushSync();
  if (options.autoStart !== false) {
    store.start();
    limiter.startPruning();
    process.once("exit", onExit);
  }

  return {
    router,
    store,
    stop: () => {
      store.stop();
      limiter.stopPruning();
      process.off("exit", onExit);
    }
  };
}

/**
 * `index.ts`'in tek kancasi: `/telemetry`'yi genel `cors()`'tan once baglar
 * (telemetri kendi kaynak listesini uyguluyor). Ayarlar ortamdan.
 */
export function installTelemetry(app: Express, env: NodeJS.ProcessEnv = process.env) {
  const service = createTelemetry({
    dir: resolveTelemetryDir(env),
    allowedOrigins: env.TELEMETRY_ALLOWED_ORIGINS,
    adminToken: env.TELEMETRY_ADMIN_TOKEN
  });
  app.use("/telemetry", service.router);
  return service;
}
