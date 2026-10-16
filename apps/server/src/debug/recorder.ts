import { performance } from "node:perf_hooks";
import type { Client } from "colyseus";
import { DEBUG_CLIENT_SAMPLE_INTERVAL_MS, normalizeMapData } from "@karayel/shared";
import { getClientBufferedAmount, type DebugRoomCounts, type DebugRoomInfo } from "../rooms/MatchRoom.js";
import type { DebugPerfFrame, DebugTickSections, DebugTickWire, MatchRecorderHooks } from "./hooks.js";
import type { SeededRoomRuntime } from "./room-runtime.js";
import { createRecordingId, type DebugRecordingStore, type DebugRecordingSummary } from "./store.js";
import type { ProcessSampler } from "./process-sampler.js";

/**
 * Mac kaydedicisi ("ucus kaydi"): her mac icin iki sey.
 *
 * 1. Performans zaman cizelgesi, saniyede bir satir: tick suresi (ortalama,
 *    p50, p95, en buyuk), bolum sureleri (eski yedi bolum + bedenler,
 *    efsanevi etkiler, efsanevi vuruslar, gec mesajlar, tel/gonderim,
 *    perf), sayaclar, varlik sayilari, tel istatistigi (istemci basina bayt,
 *    gonderilen snapshot hizi, kuyruk yuzunden atlanan kareler), surec
 *    (olay dongusu, GC, CPU, bellek). Ayrica dalga ozetleri, esigi asan
 *    tick'ler (o anki sayilarla) ve izinli istemcilerin olcum ornekleri.
 * 2. Belirlenimci yeniden oynatma kaydi: tohum, kurulum secenekleri,
 *    katilim/ayrilma/yeniden baglanma, her mesaj (tick'iyle ve saatiyle),
 *    her tick'in suresi ve saati, bes saniyede bir durum parmak izi.
 *    `tools/debug/replay-profile.mjs` maci gercek `MatchRoom` ile birebir
 *    oynatiyor.
 *
 * Tick yolunda yalnizca bellek: sayi ekleme ve toplama. Saniyede bir
 * satir kuruluyor; parcalar otuz saniyede bir (ya da tampon dolunca)
 * diske, sikistirma is parcacigi havuzunda.
 */
export const DEBUG_RECORDING_VERSION = 1;
/** Parmak izi araligi (tick): 60 Hz'de bes saniye. */
export const DEBUG_FINGERPRINT_EVERY_TICKS = 300;
export const DEBUG_FLUSH_INTERVAL_MS = 30_000;
/** Bellekteki parca bu boyu asinca beklemeden diske. */
const FLUSH_PENDING_CHARS = 512 * 1024;
const TAPE_LINE_TICKS = 600;
/** Mac basina yazilan en fazla spike satiri; saniyede en fazla bes. */
const MAX_SPIKES = 1500;
const MAX_SPIKES_PER_SECOND = 5;
const MAX_CLIENT_SAMPLES_PER_SESSION = 2000;
const CLIENT_SAMPLE_MIN_GAP_MS = Math.floor(DEBUG_CLIENT_SAMPLE_INTERVAL_MS * 0.6);
/** Tick histogrami: 0,1 ms kovalar, 0-200 ms; ustu son kovada. */
const HIST_BUCKETS = 2001;

export type MatchRecorderConfig = {
  store: DebugRecordingStore;
  sampler: ProcessSampler;
  /** Tick bu sureyi (ms) asarsa "spike". */
  spikeMs: number;
  /** Tick araligi bunu (ms) asarsa olay dongusu takilmasi ("loop" spike). */
  loopStallMs: number;
  /** Tek kaydin sikistirilmis ust siniri; asilinca yeniden oynatma kaydi duruyor. */
  maxRecordingBytes: number;
  /** Tek kayittaki en fazla girdi olayi. */
  maxEvents: number;
  serverVersion: string;
  now?: () => number;
};

type RoomLike = {
  roomId: string;
  clients: ArrayLike<Client> & Iterable<Client>;
  runtime: SeededRoomRuntime | { seeded: boolean; seed: number };
  getDebugCounts(): DebugRoomCounts;
  getDebugInfo(): DebugRoomInfo;
  getDebugFingerprint(): string;
  broadcastPatch?: () => unknown;
};

const SECTION_KEYS = ["spawn", "towers", "projectiles", "enemies", "bodies", "legendary", "procs", "cooldowns", "ultimates", "snapshot", "wire", "latest", "perf", "other"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const r2 = (value: number) => Math.round(value * 100) / 100;
const r3 = (value: number) => Math.round(value * 1000) / 1000;

/** FNV-1a 32 bit, iki farkli taban: 64 bit'lik iz (hex). */
export function fingerprintHash(text: string) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

function percentileSorted(values: Float64Array, count: number, p: number) {
  if (count === 0) return 0;
  const index = Math.min(count - 1, Math.max(0, Math.ceil(p * count) - 1));
  return values[index];
}

function histogramPercentile(histogram: Uint32Array, total: number, p: number) {
  if (total === 0) return 0;
  const target = Math.ceil(total * p);
  let seen = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index];
    if (seen >= target) return index / 10;
  }
  return (histogram.length - 1) / 10;
}

type SessionWire = { bytes: number; secBytes: number; skipped: number; secSkipped: number; bufMax: number };
type ClientStats = { samples: number; lastAt: number; fpsSum: number; fpsN: number; fpsMin: number; ftMax: number; lodMax: number; pingMax: number };
type WaveAcc = { wave: number; startTick: number; startAt: number; ticks: number; sum: number; max: number; spikes: number; enemiesMax: number; projectilesMax: number; sections: Record<SectionKey, number> };

function emptySections(): Record<SectionKey, number> {
  return { spawn: 0, towers: 0, projectiles: 0, enemies: 0, bodies: 0, legendary: 0, procs: 0, cooldowns: 0, ultimates: 0, snapshot: 0, wire: 0, latest: 0, perf: 0, other: 0 };
}

export class MatchRecorder implements MatchRecorderHooks {
  readonly id: string;
  readonly createdAt: number;
  private readonly store: DebugRecordingStore;
  private readonly config: MatchRecorderConfig;
  private readonly now: () => number;
  private readonly lines: string[] = [];
  private pendingChars = 0;
  private lastFlushAt: number;
  private flushScheduled = false;
  private disposed = false;
  private discarded = false;

  // --- yeniden oynatma kaydi ---
  private ticks = 0;
  private tapeStart = 0;
  private tapeDt: number[] = [];
  private tapeClock: number[] = [];
  private lastClock: number;
  private events = 0;
  private fingerprints = 0;
  private tapeOn = true;
  private tapeTruncated = false;
  private readonly names = new Map<string, string>();
  private readonly secrets = new Map<string, string>();

  // --- saniye ---
  private secIndex = 0;
  private secStartMono = -1;
  private firstMono = 0;
  private secTicks = new Float64Array(256);
  private secN = 0;
  private secSum = 0;
  private secMax = 0;
  private secDtSum = 0;
  private secDtMax = 0;
  private secSections = emptySections();
  private secSectionMax = emptySections();
  private secOps = { ts: 0, tc: 0, aoe: 0, ch: 0, de: 0 };
  private secWire = { db: 0, fb: 0, lb: 0, df: 0, ff: 0, lf: 0, skip: 0, sends: 0, snapBytes: 0 };
  private secPatchMs = 0;
  private secPatchN = 0;
  private secRecUs = 0;
  private secRecMaxUs = 0;
  private readonly sessions = new Map<string, SessionWire>();
  private readonly clientStats = new Map<string, ClientStats>();

  // --- mac ozeti ---
  private readonly histogram = new Uint32Array(HIST_BUCKETS);
  private histTotal = 0;
  private tickSum = 0;
  private tickMax = 0;
  private dtMaxAll = 0;
  private elMaxAll = 0;
  private spikeLines = 0;
  private secSpikes = 0;
  private spikeCount = 0;
  private spikeMax = 0;
  private worstSecond?: { i: number; p95: number; max: number; wave: number };
  private wave?: WaveAcc;
  private lastCounts?: DebugRoomCounts;
  private maxEnemies = 0;
  private maxProjectiles = 0;
  private maxPlayers = 0;
  private wireBytes = 0;
  private wireSkipped = 0;
  private maxKbps = 0;
  private recUsSum = 0;
  private recUsMax = 0;
  private recTicks = 0;
  private droppedMessages = 0;
  private secDropped = 0;
  private lastInfo?: DebugRoomInfo;

  constructor(private readonly room: RoomLike, options: unknown, config: MatchRecorderConfig) {
    this.config = config;
    this.store = config.store;
    this.now = config.now ?? Date.now;
    const runtime = room.runtime as SeededRoomRuntime;
    this.createdAt = runtime.createdAt ?? this.now();
    this.lastClock = this.createdAt;
    this.lastFlushAt = this.now();
    this.id = createRecordingId(this.createdAt, room.roomId);
    runtime.tape = { onSeats: (count) => this.event({ e: "seats", n: count }) };
    const header = {
      k: "hdr",
      v: DEBUG_RECORDING_VERSION,
      id: this.id,
      roomId: room.roomId,
      seed: runtime.seed,
      createdAt: this.createdAt,
      options: this.pseudonymizeOptions(options, "create"),
      fpEvery: DEBUG_FINGERPRINT_EVERY_TICKS,
      spikeMs: config.spikeMs,
      server: { version: config.serverVersion, node: process.version, region: process.env.FLY_REGION ?? "", machine: process.env.FLY_MACHINE_ID ?? "" }
    };
    this.push(JSON.stringify(header));
    this.store.begin(this.id, this.buildSummary("live"));
    this.wrapPatch();
  }

  // --- kancalar: tick yolu ---

  tickStart(deltaUs: number, now: number) {
    if (!this.tapeOn) return;
    this.tapeDt.push(deltaUs);
    this.tapeClock.push(now - this.lastClock);
    this.lastClock = now;
  }

  tickEnd(totalMs: number, frame: DebugPerfFrame | undefined, sections: DebugTickSections, wire: DebugTickWire) {
    const recStart = performance.now();
    this.ticks += 1;
    const runtime = this.room.runtime as SeededRoomRuntime;
    const dtMs = runtime.lastDeltaUs / 1000;
    const mono = runtime.mono();
    if (this.secStartMono < 0) {
      // Monoton saatin tick oncesi kismi (dt ilk tick'te eklendi).
      this.secStartMono = mono;
      this.firstMono = mono - dtMs;
    }
    this.secDtSum += dtMs;
    if (dtMs > this.secDtMax) this.secDtMax = dtMs;
    // Oda tick'i: yalnizca mac basladiysa olculuyor (lobi tick'i bos).
    if (frame) {
      if (this.secN < this.secTicks.length) this.secTicks[this.secN] = totalMs;
      this.secN += 1;
      this.secSum += totalMs;
      if (totalMs > this.secMax) this.secMax = totalMs;
      const bucket = Math.min(HIST_BUCKETS - 1, Math.round(totalMs * 10));
      this.histogram[bucket] += 1;
      this.histTotal += 1;
      this.tickSum += totalMs;
      if (totalMs > this.tickMax) this.tickMax = totalMs;
      const s = this.secSections;
      const m = this.secSectionMax;
      const add = (key: SectionKey, value: number) => {
        s[key] += value;
        if (value > m[key]) m[key] = value;
      };
      add("spawn", frame.spawnMs);
      add("towers", frame.towersMs);
      add("projectiles", frame.projectilesMs);
      // Bedenler ve efsanevi etkiler eski dusman bolumunun icindeydi; ayri.
      add("enemies", Math.max(0, frame.enemiesMs - sections.bodiesMs - sections.legendaryMs));
      add("bodies", sections.bodiesMs);
      add("legendary", sections.legendaryMs);
      add("procs", sections.procsMs);
      add("cooldowns", frame.cooldownsMs);
      add("ultimates", frame.ultimatesMs);
      add("snapshot", frame.snapshotMs);
      add("wire", sections.wireMs);
      add("latest", sections.latestMs);
      add("perf", sections.perfMs);
      const known = frame.spawnMs + frame.towersMs + frame.projectilesMs + frame.enemiesMs + sections.procsMs + frame.cooldownsMs + frame.ultimatesMs
        + frame.snapshotMs + sections.wireMs + sections.latestMs + sections.perfMs;
      add("other", Math.max(0, totalMs - known));
      const ops = this.secOps;
      ops.ts += frame.targetSearches;
      ops.tc += frame.targetChecks;
      ops.aoe += frame.aoeChecks;
      ops.ch += frame.chainChecks;
      ops.de += frame.damageEvents;
      const w = this.secWire;
      w.db += wire.deltaBytes;
      w.fb += wire.fullBytes;
      w.lb += wire.legacyBytes;
      w.df += wire.deltaFrames;
      w.ff += wire.fullFrames;
      w.lf += wire.legacyFrames;
      w.skip += wire.skipped;
      if (wire.deltaFrames + wire.fullFrames + wire.legacyFrames > 0) w.sends += 1;
      if (frame.snapshotBytes > 0) w.snapBytes = frame.snapshotBytes;
      if (totalMs >= this.config.spikeMs) this.recordSpike("tick", totalMs, dtMs, frame, sections, wire);
    }
    if (dtMs >= this.config.loopStallMs && this.ticks > 2) this.recordSpike("loop", totalMs, dtMs, frame, sections, wire);
    if (this.tapeOn && this.ticks % DEBUG_FINGERPRINT_EVERY_TICKS === 0) this.recordFingerprint();
    if (this.tapeOn && this.tapeDt.length >= TAPE_LINE_TICKS) this.flushTape();
    if (mono - this.secStartMono >= 1000) this.closeSecond(mono);
    const recMs = performance.now() - recStart;
    const recUs = recMs * 1000;
    this.secRecUs += recUs;
    if (recUs > this.secRecMaxUs) this.secRecMaxUs = recUs;
    this.recUsSum += recUs;
    if (recUs > this.recUsMax) this.recUsMax = recUs;
    this.recTicks += 1;
  }

  wireSkip(sessionId: string) {
    const session = this.session(sessionId);
    session.skipped += 1;
    session.secSkipped += 1;
  }

  // --- kancalar: girdiler ---

  message(sessionId: string, type: string, message: Record<string, unknown>, at: number) {
    this.event({ e: "msg", c: at, s: sessionId, y: type, m: message });
  }

  join(client: Client, options: Record<string, unknown>, at: number, accepted = true) {
    // Reddedilen giris odaya dokunmadan firlatiyor: govdesiz, yalnizca iz.
    if (!accepted) {
      this.event({ e: "join", c: at, s: client.sessionId, rejected: 1 });
      return;
    }
    this.event({ e: "join", c: at, s: client.sessionId, o: this.pseudonymizeOptions(options, "join") });
    this.wrapClient(client);
  }

  /** Kovanin reddettigi mesaj: yan etkisi yok, kayda girmiyor; yalnizca sayiliyor. */
  dropped(sessionId: string, type: string) {
    this.droppedMessages += 1;
    this.secDropped += 1;
    void sessionId;
    void type;
  }

  /** Baska odanin kurulumu bu odayi yerinden etti (kimsesiz oda). */
  evicted() {
    this.event({ e: "evict" });
  }

  leave(sessionId: string, consented: boolean, at: number) {
    this.event({ e: "leave", c: at, s: sessionId, ok: consented });
  }

  reconnect(client: Client, ok: boolean, at: number) {
    this.event({ e: "rc", c: at, s: client.sessionId, ok });
    if (ok) this.wrapClient(client);
  }

  clientSample(sessionId: string, sample: Record<string, unknown>) {
    if (this.disposed) return;
    const now = this.now();
    let stats = this.clientStats.get(sessionId);
    if (!stats) {
      stats = { samples: 0, lastAt: 0, fpsSum: 0, fpsN: 0, fpsMin: Number.POSITIVE_INFINITY, ftMax: 0, lodMax: 0, pingMax: 0 };
      this.clientStats.set(sessionId, stats);
    }
    // Sunucu tarafi hiz siniri: bes saniyelik ornek, biraz pay.
    if (now - stats.lastAt < CLIENT_SAMPLE_MIN_GAP_MS || stats.samples >= MAX_CLIENT_SAMPLES_PER_SESSION) return;
    stats.lastAt = now;
    stats.samples += 1;
    const fps = typeof sample.fps === "number" ? sample.fps : undefined;
    if (fps !== undefined) {
      stats.fpsSum += fps;
      stats.fpsN += 1;
    }
    const fpsMin = typeof sample.fpsMin === "number" ? sample.fpsMin : fps;
    if (fpsMin !== undefined && fpsMin < stats.fpsMin) stats.fpsMin = fpsMin;
    if (typeof sample.ftMax === "number" && sample.ftMax > stats.ftMax) stats.ftMax = sample.ftMax;
    if (typeof sample.lodMax === "number" && sample.lodMax > stats.lodMax) stats.lodMax = sample.lodMax;
    if (typeof sample.pingMax === "number" && sample.pingMax > stats.pingMax) stats.pingMax = sample.pingMax;
    this.push(JSON.stringify({ k: "cli", t: this.ticks, at: now, s: sessionId, wave: this.lastCounts?.wave ?? 0, ...sample }));
  }

  discard() {
    this.disposed = true;
    this.discarded = true;
    this.lines.length = 0;
    this.store.forget(this.id);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const runtime = this.room.runtime as SeededRoomRuntime;
    if (this.secN > 0 || this.secDtSum > 0) this.closeSecond(runtime.mono());
    this.closeWave();
    // Son iz: ayrilmalar dahil her seyden sonra (yeniden oynatma da sonda bakiyor).
    if (this.tapeOn) this.recordFingerprint(true);
    this.flushTape();
    this.lastInfo = this.safeInfo();
    this.push(JSON.stringify({ k: "end", t: this.ticks, at: this.now(), info: this.lastInfo, truncated: this.tapeTruncated }));
    this.flush("ended");
    this.store.end(this.id);
  }

  /** Panel suren maci acinca: bellekteki satirlar beklemeden diske. */
  flushNow() {
    if (this.disposed) return;
    this.flushTape();
    this.flush("live");
  }

  /** Cikista bekleyen satirlar (esanli yazim). */
  drainForExit() {
    if (this.discarded) return "";
    this.flushTape();
    const text = this.lines.length > 0 ? `${this.lines.join("\n")}\n` : "";
    this.lines.length = 0;
    this.pendingChars = 0;
    this.store.writeSummary(this.id, this.buildSummary(this.disposed ? "ended" : "interrupted"));
    return text;
  }

  // --- ic isler ---

  private event(fields: Record<string, unknown>) {
    if (!this.tapeOn || this.disposed) return;
    this.events += 1;
    if (this.events > this.config.maxEvents) {
      this.truncateTape("events");
      return;
    }
    this.push(JSON.stringify({ k: "ev", t: this.ticks, ...fields }));
  }

  private truncateTape(reason: string) {
    if (!this.tapeOn) return;
    this.flushTape();
    this.tapeOn = false;
    this.tapeTruncated = true;
    this.push(JSON.stringify({ k: "trunc", t: this.ticks, reason }));
  }

  private flushTape() {
    if (this.tapeDt.length === 0) return;
    this.push(JSON.stringify({ k: "tk", t0: this.tapeStart, dt: this.tapeDt, c: this.tapeClock }));
    this.tapeStart += this.tapeDt.length;
    this.tapeDt = [];
    this.tapeClock = [];
  }

  private recordFingerprint(final = false) {
    const started = performance.now();
    let hash = "";
    try {
      hash = fingerprintHash(this.room.getDebugFingerprint());
    } catch {
      hash = "error";
    }
    this.fingerprints += 1;
    const counts = this.lastCounts;
    this.push(JSON.stringify({ k: "fp", t: this.ticks, h: hash, w: counts?.wave ?? 0, ms: r3(performance.now() - started), ...(final ? { fin: 1 } : {}) }));
  }

  private recordSpike(kind: "tick" | "loop", totalMs: number, dtMs: number, frame: DebugPerfFrame | undefined, sections: DebugTickSections, wire: DebugTickWire) {
    this.spikeCount += 1;
    const ms = kind === "tick" ? totalMs : dtMs;
    if (ms > this.spikeMax) this.spikeMax = ms;
    if (this.wave && kind === "tick") this.wave.spikes += 1;
    // Satir sinirli: sayi ozette tam, ayrinti mac basina ve saniye basina sinirli.
    if (this.spikeLines >= MAX_SPIKES || this.secSpikes >= MAX_SPIKES_PER_SECOND) return;
    this.spikeLines += 1;
    this.secSpikes += 1;
    let counts: DebugRoomCounts | undefined;
    try {
      counts = this.room.getDebugCounts();
    } catch {
      counts = undefined;
    }
    const s = frame ? {
      spawn: r3(frame.spawnMs),
      towers: r3(frame.towersMs),
      projectiles: r3(frame.projectilesMs),
      enemies: r3(Math.max(0, frame.enemiesMs - sections.bodiesMs - sections.legendaryMs)),
      bodies: r3(sections.bodiesMs),
      legendary: r3(sections.legendaryMs),
      procs: r3(sections.procsMs),
      cooldowns: r3(frame.cooldownsMs),
      ultimates: r3(frame.ultimatesMs),
      snapshot: r3(frame.snapshotMs),
      wire: r3(sections.wireMs),
      latest: r3(sections.latestMs),
      perf: r3(sections.perfMs)
    } : undefined;
    let dominant = "";
    if (s) {
      let best = -1;
      for (const [key, value] of Object.entries(s)) if (value > best) { best = value; dominant = key; }
    }
    this.push(JSON.stringify({
      k: "spike",
      kind,
      t: this.ticks,
      at: this.now(),
      ms: r3(ms),
      tick: r3(totalMs),
      dt: r3(dtMs),
      dom: kind === "loop" ? "eventLoop" : dominant,
      s,
      ops: frame ? { ts: frame.targetSearches, tc: frame.targetChecks, aoe: frame.aoeChecks, ch: frame.chainChecks, de: frame.damageEvents } : undefined,
      w: { db: wire.deltaBytes, fb: wire.fullBytes, skip: wire.skipped },
      e: counts,
      pr: this.config.sampler.latest
    }));
  }

  private closeSecond(mono: number) {
    const counts = this.safeCounts();
    this.lastCounts = counts;
    const n = this.secN;
    const stored = Math.min(n, this.secTicks.length);
    const sorted = this.secTicks.subarray(0, stored).slice().sort();
    const avg = (key: SectionKey) => (n > 0 ? r3(this.secSections[key] / n) : 0);
    const sec: Record<string, number> = {};
    const secMax: Record<string, number> = {};
    for (const key of SECTION_KEYS) {
      sec[key] = avg(key);
      secMax[key] = r3(this.secSectionMax[key]);
    }
    const elapsed = Math.max(1, mono - this.secStartMono);
    const sessionBytes: Record<string, number> = {};
    const sessionSkips: Record<string, number> = {};
    const sessionBuf: Record<string, number> = {};
    let totalBytes = 0;
    for (const client of this.room.clients) {
      const session = this.session(client.sessionId);
      const buffered = getClientBufferedAmount(client);
      if (buffered > session.bufMax) session.bufMax = buffered;
      sessionBuf[client.sessionId] = buffered;
    }
    for (const [sessionId, session] of this.sessions) {
      if (session.secBytes > 0 || session.secSkipped > 0) {
        sessionBytes[sessionId] = session.secBytes;
        if (session.secSkipped > 0) sessionSkips[sessionId] = session.secSkipped;
      }
      totalBytes += session.secBytes;
      session.secBytes = 0;
      session.secSkipped = 0;
    }
    this.wireBytes += totalBytes;
    this.wireSkipped += this.secWire.skip;
    const kbps = r2(totalBytes / 1024 / (elapsed / 1000));
    if (kbps > this.maxKbps) this.maxKbps = kbps;
    const process = this.config.sampler.latest;
    if (process.elMax > this.elMaxAll) this.elMaxAll = process.elMax;
    if (this.secDtMax > this.dtMaxAll) this.dtMaxAll = this.secDtMax;
    const p50 = r3(percentileSorted(sorted, stored, 0.5));
    const p95 = r3(percentileSorted(sorted, stored, 0.95));
    const max = r3(this.secMax);
    const ticksThisSecond = this.countTicksThisSecond();
    const line = {
      k: "sec",
      i: this.secIndex,
      t: this.ticks,
      at: this.lastClock,
      up: r2((mono - this.firstMono) / 1000),
      wave: counts?.wave ?? 0,
      ph: counts?.phase ?? "",
      n,
      tn: ticksThisSecond,
      dt: r3(ticksThisSecond > 0 ? this.secDtSum / ticksThisSecond : 0),
      dtMax: r3(this.secDtMax),
      tk: { avg: n > 0 ? r3(this.secSum / n) : 0, p50, p95, max },
      s: sec,
      sm: secMax,
      ops: { ...this.secOps },
      e: counts,
      w: {
        hz: r2(this.secWire.sends / (elapsed / 1000)),
        db: this.secWire.db,
        fb: this.secWire.fb,
        lb: this.secWire.lb,
        df: this.secWire.df,
        ff: this.secWire.ff,
        lf: this.secWire.lf,
        skip: this.secWire.skip,
        snapB: this.secWire.snapBytes,
        kbps,
        out: sessionBytes,
        skips: sessionSkips,
        dropped: this.secDropped,
        buf: sessionBuf
      },
      patch: { ms: r3(this.secPatchMs), n: this.secPatchN },
      pr: process,
      rec: { us: r2(this.recTicksThisSecond() > 0 ? this.secRecUs / this.recTicksThisSecond() : 0), maxUs: r2(this.secRecMaxUs) }
    };
    this.push(JSON.stringify(line));
    if (n > 0 && (!this.worstSecond || p95 > this.worstSecond.p95)) this.worstSecond = { i: this.secIndex, p95, max, wave: counts?.wave ?? 0 };
    this.trackWave(counts, n, sec);
    if (counts) {
      if (counts.enemies > this.maxEnemies) this.maxEnemies = counts.enemies;
      if (counts.projectiles > this.maxProjectiles) this.maxProjectiles = counts.projectiles;
      if (counts.players > this.maxPlayers) this.maxPlayers = counts.players;
    }
    this.secIndex += 1;
    this.secStartMono = mono;
    this.secN = 0;
    this.secSum = 0;
    this.secMax = 0;
    this.secDtSum = 0;
    this.secDtMax = 0;
    this.secSections = emptySections();
    this.secSectionMax = emptySections();
    this.secOps = { ts: 0, tc: 0, aoe: 0, ch: 0, de: 0 };
    this.secWire = { db: 0, fb: 0, lb: 0, df: 0, ff: 0, lf: 0, skip: 0, sends: 0, snapBytes: 0 };
    this.secPatchMs = 0;
    this.secPatchN = 0;
    this.secRecUs = 0;
    this.secRecMaxUs = 0;
    this.secSpikes = 0;
    this.secDropped = 0;
    this.secTickMark = this.ticks;
    this.secRecMark = this.recTicks;
    // Diske yazim tick'in disinda: satirlarin birlestirilmesi ve sikistirma
    // siradaki olay dongusu turunda.
    if (!this.flushScheduled && (this.pendingChars >= FLUSH_PENDING_CHARS || this.now() - this.lastFlushAt >= DEBUG_FLUSH_INTERVAL_MS)) {
      this.flushScheduled = true;
      this.lastFlushAt = this.now();
      setImmediate(() => {
        this.flushScheduled = false;
        if (!this.disposed) this.flush("live");
      });
    }
  }

  private secTickMark = 0;
  private secRecMark = 0;

  private countTicksThisSecond() {
    return this.ticks - this.secTickMark;
  }

  private recTicksThisSecond() {
    return this.recTicks - this.secRecMark;
  }

  private trackWave(counts: DebugRoomCounts | undefined, n: number, sec: Record<string, number>) {
    if (!counts) return;
    if (!this.wave || this.wave.wave !== counts.wave) {
      this.closeWave();
      this.wave = { wave: counts.wave, startTick: this.ticks, startAt: this.lastClock, ticks: 0, sum: 0, max: 0, spikes: 0, enemiesMax: 0, projectilesMax: 0, sections: emptySections() };
    }
    const wave = this.wave;
    wave.ticks += n;
    wave.sum += (sec.spawn + sec.towers + sec.projectiles + sec.enemies + sec.bodies + sec.legendary + sec.procs + sec.cooldowns + sec.ultimates + sec.snapshot + sec.wire + sec.latest + sec.perf + sec.other) * n;
    for (const key of SECTION_KEYS) wave.sections[key] += sec[key] * n;
    if (this.secMax > wave.max) wave.max = this.secMax;
    if (counts.enemies > wave.enemiesMax) wave.enemiesMax = counts.enemies;
    if (counts.projectiles > wave.projectilesMax) wave.projectilesMax = counts.projectiles;
  }

  private closeWave() {
    const wave = this.wave;
    if (!wave) return;
    this.wave = undefined;
    const sections: Record<string, number> = {};
    for (const key of SECTION_KEYS) sections[key] = wave.ticks > 0 ? r3(wave.sections[key] / wave.ticks) : 0;
    this.push(JSON.stringify({
      k: "wave",
      wave: wave.wave,
      t0: wave.startTick,
      t1: this.ticks,
      at: wave.startAt,
      durS: r2((this.lastClock - wave.startAt) / 1000),
      ticks: wave.ticks,
      avg: wave.ticks > 0 ? r3(wave.sum / wave.ticks) : 0,
      max: r3(wave.max),
      spikes: wave.spikes,
      enemiesMax: wave.enemiesMax,
      projectilesMax: wave.projectilesMax,
      s: sections
    }));
  }

  private session(sessionId: string) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { bytes: 0, secBytes: 0, skipped: 0, secSkipped: 0, bufMax: 0 };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /** Istemciye giden her baytin sayaci: Colyseus her gonderimi `raw`dan geciriyor. */
  private wrapClient(client: Client) {
    const target = client as Client & { raw?: (...args: unknown[]) => unknown; __debugWrapped?: boolean };
    if (typeof target.raw !== "function" || target.__debugWrapped) return;
    const original = target.raw.bind(client);
    const session = this.session(client.sessionId);
    target.__debugWrapped = true;
    target.raw = (...args: unknown[]) => {
      const data = args[0] as { byteLength?: number; length?: number } | undefined;
      const size = data?.byteLength ?? data?.length ?? 0;
      session.bytes += size;
      session.secBytes += size;
      return original(...args);
    };
  }

  /** Durum yamasi (Colyseus sema) tick'in disinda kodlaniyor; suresi ayri. */
  private wrapPatch() {
    const room = this.room;
    if (typeof room.broadcastPatch !== "function") return;
    const original = room.broadcastPatch.bind(room);
    room.broadcastPatch = () => {
      const started = performance.now();
      try {
        return original();
      } finally {
        this.secPatchMs += performance.now() - started;
        this.secPatchN += 1;
      }
    };
  }

  private safeCounts() {
    try {
      return this.room.getDebugCounts();
    } catch {
      return undefined;
    }
  }

  private safeInfo() {
    try {
      return this.room.getDebugInfo();
    } catch {
      return this.lastInfo;
    }
  }

  private push(line: string) {
    if (this.discarded) return;
    this.lines.push(line);
    this.pendingChars += line.length + 1;
  }

  private flush(status: "live" | "ended") {
    if (this.discarded) return;
    this.lastFlushAt = this.now();
    if (status === "live") this.lastInfo = this.safeInfo() ?? this.lastInfo;
    if (this.lines.length > 0) {
      const text = `${this.lines.join("\n")}\n`;
      this.lines.length = 0;
      this.pendingChars = 0;
      void this.store.append(this.id, text);
    }
    // Tek kaydin siniri: asilinca yeniden oynatma kaydi duruyor, cizelge suruyor.
    if (this.tapeOn && this.store.sizeOf(this.id) > this.config.maxRecordingBytes) this.truncateTape("size");
    this.store.writeSummary(this.id, this.buildSummary(status));
  }

  buildSummary(status: DebugRecordingSummary["status"]): DebugRecordingSummary {
    const info = this.lastInfo;
    let clientSamples = 0;
    let fpsSum = 0;
    let fpsN = 0;
    let fpsMin = Number.POSITIVE_INFINITY;
    let ftMax = 0;
    let lodMax = 0;
    let pingMax = 0;
    for (const stats of this.clientStats.values()) {
      clientSamples += stats.samples;
      fpsSum += stats.fpsSum;
      fpsN += stats.fpsN;
      if (stats.fpsMin < fpsMin) fpsMin = stats.fpsMin;
      if (stats.ftMax > ftMax) ftMax = stats.ftMax;
      if (stats.lodMax > lodMax) lodMax = stats.lodMax;
      if (stats.pingMax > pingMax) pingMax = stats.pingMax;
    }
    return {
      id: this.id,
      roomId: this.room.roomId,
      runId: info?.runId,
      createdAt: this.createdAt,
      updatedAt: this.now(),
      endedAt: status === "ended" ? this.now() : undefined,
      status,
      // Odanin saatiyle (kayittaki son tick): uretimde duvar saati.
      durationS: Math.max(0, Math.round((this.lastClock - this.createdAt) / 1000)),
      stage: info?.stage,
      mode: info?.mode,
      operators: info?.operators,
      players: this.maxPlayers || info?.operators.length,
      wave: info?.wave,
      result: info ? (info.result || (status === "ended" ? (info.gameStarted ? "abandoned" : "lobby") : "")) : undefined,
      tick: {
        avg: this.histTotal > 0 ? r3(this.tickSum / this.histTotal) : 0,
        p50: histogramPercentile(this.histogram, this.histTotal, 0.5),
        p95: histogramPercentile(this.histogram, this.histTotal, 0.95),
        p99: histogramPercentile(this.histogram, this.histTotal, 0.99),
        max: r3(this.tickMax),
        count: this.histTotal
      },
      loop: { dtMax: r3(this.dtMaxAll), elMax: this.elMaxAll },
      worstSecond: this.worstSecond,
      spikes: this.spikeCount,
      spikeMaxMs: r3(this.spikeMax),
      client: {
        clients: this.clientStats.size,
        samples: clientSamples,
        fpsAvg: fpsN > 0 ? r2(fpsSum / fpsN) : undefined,
        fpsMin: Number.isFinite(fpsMin) ? fpsMin : undefined,
        ftMax: ftMax || undefined,
        lodMax: clientSamples > 0 ? lodMax : undefined,
        pingMax: pingMax || undefined
      },
      wire: { bytes: this.wireBytes, maxKbps: this.maxKbps, skipped: this.wireSkipped, droppedMessages: this.droppedMessages },
      maxEnemies: this.maxEnemies,
      maxProjectiles: this.maxProjectiles,
      bytes: this.store.sizeOf(this.id),
      replay: { events: this.events, ticks: this.ticks, truncated: this.tapeTruncated, fingerprints: this.fingerprints },
      recorderUs: { avg: this.recTicks > 0 ? r2(this.recUsSum / this.recTicks) : 0, max: r2(this.recUsMax) },
      server: this.config.serverVersion
    };
  }

  /**
   * Kayittaki secenekler: ad, oda adi ve sahip sirri takma adla. Esitlik
   * korunuyor (yeniden baglanma ayni adi, solo sahipligi ayni sirri
   * karsilastiriyor); degerin kendisi diske inmiyor.
   */
  private pseudonymizeOptions(raw: unknown, kind: "create" | "join") {
    if (typeof raw !== "object" || raw === null) return {};
    const source = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    // `null` da yok sayiliyor: oda `??` ile ikisini ayni okuyor.
    const has = (key: string) => Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null;
    // Ham deger degil, odanin okudugu anlam: sayi/mantik/kisa metin aynen;
    // turu tutmayan deger `false` (oda onu da gecersiz sayiyor ve `??`
    // varsayilanina dusmuyor -- `undefined`a cevirmek anlami degistirirdi).
    for (const key of ["mapScale", "stage", "wireDelta"]) {
      if (has(key)) out[key] = typeof source[key] === "number" && Number.isFinite(source[key]) ? source[key] : false;
    }
    for (const key of ["autoStart", "creative", "tutorial"]) {
      if (has(key)) out[key] = source[key] === true;
    }
    if (has("characterId")) {
      const value = source.characterId;
      // Gecerli kimlikler kisa; uzun metin hicbir kimlige esit degil, bos metin de.
      out.characterId = typeof value === "string" ? (value.length <= 32 ? value : "") : false;
    }
    // Harita yalnizca kurulumda okunuyor: odanin kendi duzeltmesinden gecmis hali.
    if (kind === "create" && has("mapData")) out.mapData = normalizeMapData(source.mapData);
    if (typeof source.playerName === "string") {
      // Odanin kendi kirpmasi (`getJoinPlayerName`): ayni kirpilmis ad ayni takma ad.
      const name = source.playerName.slice(0, 20);
      if (name) {
        let alias = this.names.get(name);
        if (!alias) {
          alias = `P${this.names.size + 1}`;
          this.names.set(name, alias);
        }
        out.playerName = alias;
      } else {
        out.playerName = "";
      }
    }
    if (typeof source.roomName === "string") out.roomName = source.roomName.trim() ? "Room" : "";
    if (typeof source.ownerSecret === "string") {
      const secret = source.ownerSecret;
      // Odanin kurali: 16-128 karakter; disindaki gecersiz sayiliyor.
      if (secret.length >= 16 && secret.length <= 128) {
        let alias = this.secrets.get(secret);
        if (!alias) {
          alias = `replay-owner-secret-${String(this.secrets.size + 1).padStart(4, "0")}`;
          this.secrets.set(secret, alias);
        }
        out.ownerSecret = alias;
      } else {
        out.ownerSecret = "x";
      }
    }
    return out;
  }
}
