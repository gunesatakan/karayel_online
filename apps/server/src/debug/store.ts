import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzip, gzipSync } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);

/**
 * Mac kayitlarinin diski.
 *
 * Her mac iki dosya: `<id>.ndjson.gz` (kayit; her yazim ayri bir gzip
 * uyesi, art arda eklenmis uyeler gecerli tek bir gzip akisi) ve
 * `<id>.json` (panelin listesi icin kucuk ozet). Yazim tick'in disinda:
 * sikistirma is parcacigi havuzunda (`zlib.gzip`), ekleme `fs/promises`.
 * Surec cokerse son yazima kadar olan kisim okunabilir kalir (yarim kayit).
 *
 * Saklama: 30 gun; toplam boyut siniri asilinca en eski kayit once siliniyor.
 * Suren kayitlar silinmiyor. Disk hatasi sunucuyu asla dusurmuyor.
 */
export const DEBUG_RECORDING_ID_PATTERN = /^\d{8}-\d{6}-[A-Za-z0-9_-]{1,40}$/;
export const DEBUG_RECORDER_RETENTION_DAYS = 30;
/**
 * Varsayilan toplam: 600 MB (~1 000 tam mac). Fly diski 2 GB'a buyutuldu
 * (2026-10-16); telemetri ayni diskte 500 MB'a kadar kullanabiliyor, ikisi
 * birlikte ~1,1 GB ve bos yer korumasina bol pay kaliyor.
 */
export const DEBUG_RECORDER_MAX_TOTAL_BYTES = 600 * 1024 * 1024;
/**
 * Diskte en az bu kadar bos yer kalsin. Fly diski telemetriyle paylasiliyor
 * ve boyu depodan bilinmiyor: toplam sinirdan bagimsiz ikinci emniyet. Bos
 * yer bunun altina inince en eski kayitlar siliniyor, yetmezse yeni parca
 * atiliyor (oyun ve telemetri diski doldurmasin).
 */
export const DEBUG_RECORDER_MIN_FREE_BYTES = 128 * 1024 * 1024;
const FREE_CHECK_INTERVAL_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DebugRecordingSummary = {
  id: string;
  roomId: string;
  runId?: string;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  status: "live" | "ended" | "interrupted";
  durationS: number;
  stage?: number;
  mode?: string;
  operators?: string[];
  players?: number;
  wave?: number;
  result?: string;
  tick?: { avg: number; p50: number; p95: number; p99: number; max: number; count: number };
  loop?: { dtMax: number; elMax: number };
  worstSecond?: { i: number; p95: number; max: number; wave: number };
  spikes?: number;
  spikeMaxMs?: number;
  client?: { clients: number; samples: number; fpsAvg?: number; fpsMin?: number; ftMax?: number; lodMax?: number; pingMax?: number };
  wire?: { bytes: number; maxKbps: number; skipped: number; droppedMessages?: number };
  maxEnemies?: number;
  maxProjectiles?: number;
  bytes: number;
  replay?: { events: number; ticks: number; truncated: boolean; fingerprints: number };
  recorderUs?: { avg: number; max: number };
  server?: string;
};

export function resolveDebugRecorderDir(env: NodeJS.ProcessEnv = process.env) {
  if (env.DEBUG_RECORDER_DIR) return resolve(env.DEBUG_RECORDER_DIR);
  return existsSync("/data") ? "/data/debug" : resolve("data/debug");
}

export type DebugRecordingStoreOptions = {
  dir: string;
  maxTotalBytes?: number;
  retentionDays?: number;
  minFreeBytes?: number;
  /** Testler: bos yer olcusu (bayt). */
  freeBytes?: () => Promise<number | undefined>;
  now?: () => number;
  log?: (message: string) => void;
};

export class DebugRecordingStore {
  readonly dir: string;
  readonly maxTotalBytes: number;
  readonly retentionDays: number;
  readonly minFreeBytes: number;
  private readonly freeBytes: () => Promise<number | undefined>;
  private lastFreeCheck = 0;
  private lastFree?: number;
  private lowSpaceLogged = false;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly summaries = new Map<string, DebugRecordingSummary>();
  private readonly sizes = new Map<string, number>();
  private readonly active = new Set<string>();
  /** Dosya basina sirali yazim zinciri: uyeler sirayla eklenmeli. */
  private readonly chains = new Map<string, Promise<void>>();
  /** Henuz diske inmemis parcalar (cikista esanli yazim icin). */
  private readonly pendingChunks = new Map<string, string[]>();
  /**
   * Yazilmakta olan parca (sikistiriliyor ya da ekleniyor). `appendFile`
   * bitene kadar burada: surec arada kapanirsa `flushSync` onu yeniden yaziyor.
   */
  private readonly inFlightChunks = new Map<string, string>();
  /** Diske inmemis son ozet; yalnizca basarili yazimdan sonra siliniyor. */
  private readonly pendingSummaries = new Map<string, DebugRecordingSummary>();
  private summaryWriting = new Set<string>();
  private pruning?: Promise<void>;
  private readonly removing = new Set<string>();
  private diskErrorLogged = false;
  private ready?: Promise<void>;
  readonly stats = { chunks: 0, bytesWritten: 0, diskErrors: 0, droppedChunks: 0, pruned: 0 };

  constructor(options: DebugRecordingStoreOptions) {
    this.dir = options.dir;
    this.maxTotalBytes = options.maxTotalBytes ?? DEBUG_RECORDER_MAX_TOTAL_BYTES;
    this.retentionDays = options.retentionDays ?? DEBUG_RECORDER_RETENTION_DAYS;
    this.minFreeBytes = options.minFreeBytes ?? DEBUG_RECORDER_MIN_FREE_BYTES;
    this.freeBytes = options.freeBytes ?? (async () => {
      try {
        const info = await statfs(this.dir);
        return Number(info.bavail) * Number(info.bsize);
      } catch {
        return undefined;
      }
    });
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((message) => console.warn(message));
  }

  dataPath(id: string) {
    return join(this.dir, `${id}.ndjson.gz`);
  }

  summaryPath(id: string) {
    return join(this.dir, `${id}.json`);
  }

  /** Dizini ve eski ozetleri yukler; yarim kalmis (canli gorunen) kayitlar "interrupted". */
  init() {
    this.ready ??= (async () => {
      try {
        await mkdir(this.dir, { recursive: true });
        const names = await readdir(this.dir);
        for (const name of names) {
          const match = /^(.+)\.ndjson\.gz$/.exec(name);
          if (!match || !DEBUG_RECORDING_ID_PATTERN.test(match[1])) continue;
          const id = match[1];
          try {
            const info = await stat(join(this.dir, name));
            this.sizes.set(id, info.size);
          } catch {
            // Silinmis olabilir.
          }
        }
        for (const name of names) {
          const match = /^(.+)\.json$/.exec(name);
          if (!match || !DEBUG_RECORDING_ID_PATTERN.test(match[1]) || this.active.has(match[1])) continue;
          try {
            const summary = JSON.parse(await readFile(join(this.dir, name), "utf8")) as DebugRecordingSummary;
            if (summary.status === "live") summary.status = "interrupted";
            summary.bytes = this.sizes.get(match[1]) ?? summary.bytes ?? 0;
            this.summaries.set(match[1], summary);
          } catch {
            // Bozuk ozet: kaydin kendisi yine indirilebilir.
          }
        }
        for (const id of this.sizes.keys()) {
          if (!this.summaries.has(id) && !this.active.has(id)) {
            this.summaries.set(id, { id, roomId: id.slice(16), createdAt: parseIdTime(id), updatedAt: parseIdTime(id), status: "interrupted", durationS: 0, bytes: this.sizes.get(id) ?? 0 });
          }
        }
      } catch (error) {
        this.logDiskError(error);
      }
    })();
    return this.ready;
  }

  begin(id: string, summary: DebugRecordingSummary) {
    this.active.add(id);
    this.summaries.set(id, summary);
  }

  end(id: string) {
    this.active.delete(id);
  }

  isActive(id: string) {
    return this.active.has(id);
  }

  /** Yalnizca bellekte: kurulamayan odanin kaydi. */
  forget(id: string) {
    this.active.delete(id);
    this.summaries.delete(id);
    this.pendingSummaries.delete(id);
    this.pendingChunks.delete(id);
    this.inFlightChunks.delete(id);
    this.chains.delete(id);
  }

  list() {
    // Boyut ozetten sonra yazilan parcalari da saysin.
    for (const [id, summary] of this.summaries) summary.bytes = this.sizes.get(id) ?? summary.bytes ?? 0;
    return Array.from(this.summaries.values());
  }

  get(id: string) {
    const summary = this.summaries.get(id);
    if (summary) summary.bytes = this.sizes.get(id) ?? summary.bytes ?? 0;
    return summary;
  }

  totalBytes() {
    let total = 0;
    for (const size of this.sizes.values()) total += size;
    return total;
  }

  sizeOf(id: string) {
    return this.sizes.get(id) ?? 0;
  }

  /** Bir parca ekler: sikistirma ve yazim sirayla, tick'in disinda. */
  append(id: string, chunk: string) {
    if (chunk.length === 0) return Promise.resolve();
    let pending = this.pendingChunks.get(id);
    if (!pending) {
      pending = [];
      this.pendingChunks.set(id, pending);
    }
    pending.push(chunk);
    const previous = this.chains.get(id) ?? this.init();
    const next = previous.then(async () => {
      const queue = this.pendingChunks.get(id);
      if (!queue || queue.length === 0) return;
      const text = queue.join("");
      queue.length = 0;
      // Metin dosyaya inene kadar kaybolmasin (cikista `flushSync`).
      this.inFlightChunks.set(id, text);
      try {
        if (this.totalBytes() > this.maxTotalBytes) await this.prune();
        if (this.totalBytes() > this.maxTotalBytes || !(await this.hasFreeSpace())) {
          this.stats.droppedChunks += 1;
          return;
        }
        const compressed = await gzipAsync(text, { level: 6 });
        await appendFile(this.dataPath(id), compressed);
        this.sizes.set(id, (this.sizes.get(id) ?? 0) + compressed.length);
        this.stats.chunks += 1;
        this.stats.bytesWritten += compressed.length;
      } catch (error) {
        this.logDiskError(error);
      } finally {
        if (this.inFlightChunks.get(id) === text) this.inFlightChunks.delete(id);
      }
    });
    const settled: Promise<void> = next.catch(() => undefined).then(() => {
      // Zincir bittiyse ve bekleyen yoksa kayit birakiliyor (sizinti yok).
      if (this.chains.get(id) === settled && (this.pendingChunks.get(id)?.length ?? 0) === 0) {
        this.chains.delete(id);
        this.pendingChunks.delete(id);
      }
    });
    this.chains.set(id, settled);
    return settled;
  }

  /** Diskte yer var mi; yoksa once en eski bitmis kayitlar siliniyor. */
  private async hasFreeSpace() {
    const now = this.now();
    if (now - this.lastFreeCheck < FREE_CHECK_INTERVAL_MS && this.lastFree !== undefined && this.lastFree >= this.minFreeBytes) return true;
    this.lastFreeCheck = now;
    let free = await this.freeBytes();
    if (free === undefined) return true;
    if (free < this.minFreeBytes) {
      const oldest = Array.from(this.sizes.keys())
        .filter((id) => !this.active.has(id))
        .sort((a, b) => (this.summaries.get(a)?.createdAt ?? parseIdTime(a)) - (this.summaries.get(b)?.createdAt ?? parseIdTime(b)));
      for (const id of oldest) {
        if (free >= this.minFreeBytes) break;
        const size = this.sizes.get(id) ?? 0;
        await this.remove(id);
        free = (await this.freeBytes()) ?? free + size;
      }
      if (free < this.minFreeBytes && !this.lowSpaceLogged) {
        this.lowSpaceLogged = true;
        this.log(`[debug-recorder] diskte yer az (${Math.round(free / 1048576)} MB); kayit parcalari atiliyor (bir kez yaziliyor)`);
      }
    }
    this.lastFree = free;
    return free >= this.minFreeBytes;
  }

  /** Bekleyen yazimlar bitti mi (testler, indirme oncesi). */
  async drain(id?: string) {
    const ids = id ? [id] : Array.from(this.chains.keys());
    await Promise.all(ids.map((key) => this.chains.get(key)));
    // Disk hatasinda ozet bekleyende kalir; sonsuza kadar beklenmiyor.
    for (let attempt = 0; attempt < 50 && (this.pendingSummaries.size > 0 || this.summaryWriting.size > 0); attempt += 1) {
      await this.flushSummaries();
      await new Promise((resolveTurn) => setImmediate(resolveTurn));
    }
  }

  writeSummary(id: string, summary: DebugRecordingSummary) {
    summary.bytes = this.sizes.get(id) ?? summary.bytes ?? 0;
    this.summaries.set(id, summary);
    this.pendingSummaries.set(id, summary);
    void this.flushSummaries();
  }

  private async flushSummaries() {
    for (const [id, summary] of Array.from(this.pendingSummaries)) {
      if (this.summaryWriting.has(id)) continue;
      this.summaryWriting.add(id);
      let written = false;
      try {
        await (this.ready ?? this.init());
        const target = this.summaryPath(id);
        const temp = `${target}.tmp`;
        await writeFile(temp, JSON.stringify(summary));
        await rename(temp, target);
        written = true;
      } catch (error) {
        this.logDiskError(error);
      } finally {
        this.summaryWriting.delete(id);
      }
      // Yalnizca yazilan ozet siliniyor; arada yenisi geldiyse o bekliyor.
      // Hata olduysa ozet bekleyende kaliyor (cikista `flushSync` yazar).
      if (written && this.pendingSummaries.get(id) === summary) this.pendingSummaries.delete(id);
      if (written && this.pendingSummaries.has(id)) void this.flushSummaries();
    }
  }

  /** Cikista: bekleyen parcalar ve ozetler esanli yaziliyor. */
  flushSync(extra?: Map<string, string>) {
    try {
      mkdirSync(this.dir, { recursive: true });
    } catch {
      return;
    }
    const chunks = new Map<string, string[]>();
    // Once yazilmakta olan parca (sira korunuyor), sonra kuyruk.
    for (const [id, text] of this.inFlightChunks) chunks.set(id, [text]);
    this.inFlightChunks.clear();
    for (const [id, queue] of this.pendingChunks) {
      if (queue.length === 0) continue;
      const list = chunks.get(id) ?? [];
      list.push(...queue.splice(0));
      chunks.set(id, list);
    }
    for (const [id, text] of extra ?? []) {
      const list = chunks.get(id) ?? [];
      list.push(text);
      chunks.set(id, list);
    }
    for (const [id, list] of chunks) {
      try {
        const compressed = gzipSync(list.join(""), { level: 6 });
        appendFileSync(this.dataPath(id), compressed);
        this.sizes.set(id, (this.sizes.get(id) ?? 0) + compressed.length);
      } catch (error) {
        this.logDiskError(error);
      }
    }
    for (const [id, summary] of this.pendingSummaries) {
      try {
        const target = this.summaryPath(id);
        // Ayri gecici ad: yarim kalmis async yazimin gecici dosyasiyla carpismasin.
        writeFileSync(`${target}.sync.tmp`, JSON.stringify(summary));
        renameSync(`${target}.sync.tmp`, target);
      } catch (error) {
        this.logDiskError(error);
      }
    }
    this.pendingSummaries.clear();
  }

  /**
   * Saklama: suresi gecenler, sonra toplam sinir asildikca en eskiler.
   * Suren kayit silinmiyor.
   */
  prune() {
    // Tek seferde bir temizlik: es zamanli cagrilar ayni isi bekliyor.
    this.pruning ??= this.runPrune().finally(() => {
      this.pruning = undefined;
    });
    return this.pruning;
  }

  private async runPrune() {
    await (this.ready ?? this.init());
    const cutoff = this.now() - this.retentionDays * DAY_MS;
    const candidates = Array.from(new Set([...this.sizes.keys(), ...this.summaries.keys()]))
      .filter((id) => !this.active.has(id))
      .map((id) => ({ id, at: this.summaries.get(id)?.createdAt ?? parseIdTime(id) }))
      .sort((a, b) => a.at - b.at);
    for (const candidate of candidates) {
      if (candidate.at >= cutoff && this.totalBytes() <= this.maxTotalBytes) break;
      await this.remove(candidate.id);
    }
  }

  async remove(id: string) {
    // Ayni kayit iki kez silinmesin (temizlik ve bos yer korumasi ust uste).
    if (this.removing.has(id) || (!this.sizes.has(id) && !this.summaries.has(id))) return;
    this.removing.add(id);
    try {
      await this.removeFiles(id);
    } finally {
      this.removing.delete(id);
    }
  }

  private async removeFiles(id: string) {
    for (const path of [this.dataPath(id), this.summaryPath(id)]) {
      try {
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.logDiskError(error);
      }
    }
    this.sizes.delete(id);
    this.summaries.delete(id);
    this.pendingSummaries.delete(id);
    this.pendingChunks.delete(id);
    this.chains.delete(id);
    this.stats.pruned += 1;
  }

  private logDiskError(error: unknown) {
    this.stats.diskErrors += 1;
    if (this.diskErrorLogged) return;
    this.diskErrorLogged = true;
    this.log(`[debug-recorder] disk hatasi (bir kez yaziliyor): ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** `YYYYMMDD-HHMMSS-oda` kimliginin zamani (UTC). */
export function parseIdTime(id: string) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(id);
  if (!match) return 0;
  const [, y, mo, d, h, mi, s] = match;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

export function createRecordingId(createdAt: number, roomId: string) {
  const date = new Date(createdAt).toISOString();
  const compact = `${date.slice(0, 4)}${date.slice(5, 7)}${date.slice(8, 10)}-${date.slice(11, 13)}${date.slice(14, 16)}${date.slice(17, 19)}`;
  const safeRoom = String(roomId || "room").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "room";
  return `${compact}-${safeRoom}`;
}
