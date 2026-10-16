import { DEBUG_CLIENT_SAMPLE_INTERVAL_MS, DEBUG_CLIENT_SECTIONS, debugClientSectionField, type DebugClientSection } from "@karayel/shared";

/**
 * Mac kaydedicisinin istemci tarafi: bes saniyede bir kucuk bir olcum ornegi
 * (`debug:client`), ayni oda baglantisindan. Sunucu ornegi o macin kaydina
 * yaziyor (`apps/server/src/debug/recorder.ts`); "oyun kasiyor" sikayetinde
 * sebebin istemci mi (kare, efekt, sekme), ag mi (tampon, ping) yoksa sunucu
 * mu oldugu ayni zaman ekseninde gorunuyor.
 *
 * Izin: yalnizca anonim veri ayari acik oyuncudan (`isTelemetryActive`).
 * Ayar kapaliyken hicbir sey toplanmiyor ve gitmiyor; ayar her pencerenin
 * basinda yeniden soruluyor. Icerik `PRIVACY.md`de yazili: kare hizi ve
 * sureleri, efekt seviyesi, snapshot alimi, ping, JS yigini, kaba cihaz
 * sinifi (DPR, tuval boyu, cekirdek, bellek, tarayici/isletim sistemi
 * ailesi), sekme gizlenmesi ve WebGL baglam kaybi. Ad, kimlik, tam UA
 * dizesi, ekran karti adi yok.
 *
 * Bu dosya tarayiciya baglanmiyor: saat, izin, gonderim ve cihaz bilgisi
 * enjekte ediliyor ki node testinde calissin. Kablolama `GameScene`de.
 */
export type MatchDebugDevice = {
  dpr?: number;
  cw?: number;
  ch?: number;
  cores?: number;
  memGb?: number;
  device?: string;
  browser?: string;
  os?: string;
  renderer?: string;
};

export type MatchDebugEnv = {
  now: () => number;
  /** Izin: `isTelemetryActive`. Her pencere basinda soruluyor. */
  isEnabled: () => boolean;
  send: (sample: Record<string, number | string>) => void;
  device?: () => MatchDebugDevice;
  /** `performance.memory` (Chromium); yoksa tanimsiz. */
  heap?: () => { usedMb: number; limitMb: number } | undefined;
  intervalMs?: number;
};

const SECTION_SET = new Set<string>(DEBUG_CLIENT_SECTIONS);
const LONG_FRAME_MS = 50;
const MAX_FRAME_SAMPLES = 2048;
const r1 = (value: number) => Math.round(value * 10) / 10;
const r2 = (value: number) => Math.round(value * 100) / 100;

export class MatchDebugSampler {
  private readonly env: MatchDebugEnv;
  private readonly intervalMs: number;
  private enabled: boolean;
  private windowStart: number;
  private seq = 0;
  // kare
  private frames = new Float32Array(MAX_FRAME_SAMPLES);
  private frameCount = 0;
  private frameSum = 0;
  private frameMax = 0;
  private longFrames = 0;
  private secondStart: number;
  private secondFrames = 0;
  private fpsMin = Number.POSITIVE_INFINITY;
  // bolumler
  private sectionSum = new Map<string, number>();
  private sectionCount = new Map<string, number>();
  private sectionMax = new Map<string, number>();
  // LOD
  private lod = 0;
  private lodMax = 0;
  private lodChanges = 0;
  private lodSeen = false;
  // snapshot
  private snapshots = 0;
  private lastSnapshotAt = 0;
  private gapMax = 0;
  private bufLen = 0;
  private bufMax = 0;
  private droppedBase?: number;
  private droppedLast = 0;
  private starve = 0;
  private everSnapshot = false;
  // ag
  private pingSum = 0;
  private pingCount = 0;
  private pingMax = 0;
  private queueKb = 0;
  // sekme ve baglam
  private hidden = 0;
  private hiddenMs = 0;
  private hiddenSince?: number;
  private contextLost = 0;

  constructor(env: MatchDebugEnv) {
    this.env = env;
    this.intervalMs = env.intervalMs ?? DEBUG_CLIENT_SAMPLE_INTERVAL_MS;
    this.enabled = safe(() => env.isEnabled(), false);
    this.windowStart = env.now();
    this.secondStart = this.windowStart;
  }

  get active() {
    return this.enabled;
  }

  /** Kare araligi (ms); her karede. */
  noteFrame(frameMs: number, now = this.env.now()) {
    if (!this.enabled || !Number.isFinite(frameMs) || frameMs <= 0) return;
    // Sekme gizliyken gelen dev aralik kare degil (ayri sayiliyor).
    if (this.hiddenSince !== undefined) return;
    if (this.frameCount < MAX_FRAME_SAMPLES) this.frames[this.frameCount] = frameMs;
    this.frameCount += 1;
    this.frameSum += frameMs;
    if (frameMs > this.frameMax) this.frameMax = frameMs;
    if (frameMs >= LONG_FRAME_MS) this.longFrames += 1;
    this.secondFrames += 1;
    if (now - this.secondStart >= 1000) {
      const fps = (this.secondFrames * 1000) / (now - this.secondStart);
      if (fps < this.fpsMin) this.fpsMin = fps;
      this.secondStart = now;
      this.secondFrames = 0;
    }
  }

  noteSection(section: string, ms: number) {
    if (!this.enabled || !SECTION_SET.has(section) || !Number.isFinite(ms)) return;
    this.sectionSum.set(section, (this.sectionSum.get(section) ?? 0) + ms);
    this.sectionCount.set(section, (this.sectionCount.get(section) ?? 0) + 1);
    if (ms > (this.sectionMax.get(section) ?? 0)) this.sectionMax.set(section, ms);
  }

  noteLod(level: number) {
    if (!this.enabled) return;
    if (this.lodSeen && level !== this.lod) this.lodChanges += 1;
    this.lodSeen = true;
    this.lod = level;
    if (level > this.lodMax) this.lodMax = level;
  }

  /** Snapshot geldi: tampon boyu ve (birikimli) dusen kare sayaci. */
  noteSnapshot(bufferLength: number, droppedTotal: number, now = this.env.now()) {
    if (!this.enabled) return;
    this.everSnapshot = true;
    this.snapshots += 1;
    if (this.lastSnapshotAt > 0) {
      const gap = now - this.lastSnapshotAt;
      if (gap > this.gapMax && this.hiddenSince === undefined) this.gapMax = gap;
    }
    this.lastSnapshotAt = now;
    this.bufLen = bufferLength;
    if (bufferLength > this.bufMax) this.bufMax = bufferLength;
    this.droppedBase ??= droppedTotal;
    this.droppedLast = droppedTotal;
  }

  /** Oynatilacak kare yok (tampon bos ya da saat hazir degil), mac basladiktan sonra. */
  noteStarve() {
    if (!this.enabled || !this.everSnapshot || this.hiddenSince !== undefined) return;
    this.starve += 1;
  }

  notePing(ms: number, queueKb = 0) {
    if (!this.enabled || !Number.isFinite(ms)) return;
    this.pingSum += ms;
    this.pingCount += 1;
    if (ms > this.pingMax) this.pingMax = ms;
    if (queueKb > this.queueKb) this.queueKb = queueKb;
  }

  noteVisibility(hidden: boolean, now = this.env.now()) {
    if (hidden) {
      if (this.hiddenSince === undefined) {
        this.hiddenSince = now;
        if (this.enabled) this.hidden += 1;
      }
      return;
    }
    if (this.hiddenSince !== undefined) {
      if (this.enabled) this.hiddenMs += now - this.hiddenSince;
      this.hiddenSince = undefined;
      // Gizli kalan sure kare olcusunu bozmasin.
      this.secondStart = now;
      this.secondFrames = 0;
      this.lastSnapshotAt = 0;
    }
  }

  noteContextLost() {
    if (this.enabled) this.contextLost += 1;
  }

  /** Her karede: pencere dolduysa ornegi yollar. Gonderildiyse ornegi dondurur. */
  tick(now = this.env.now()) {
    if (now - this.windowStart < this.intervalMs) return undefined;
    const wasEnabled = this.enabled;
    const sample = wasEnabled ? this.build(now) : undefined;
    this.reset(now);
    // Izin pencere basinda yeniden: kapatilan ayar bir sonraki ornekten itibaren.
    this.enabled = safe(() => this.env.isEnabled(), false);
    if (sample && this.enabled) {
      try {
        this.env.send(sample);
      } catch {
        // Baglanti kapaniyor olabilir; olcum oyunu bozmasin.
      }
      return sample;
    }
    return undefined;
  }

  private build(now: number) {
    const windowMs = now - this.windowStart;
    const stored = Math.min(this.frameCount, MAX_FRAME_SAMPLES);
    const sorted = Array.from(this.frames.subarray(0, stored)).sort((a, b) => a - b);
    const pick = (p: number) => (stored === 0 ? 0 : sorted[Math.min(stored - 1, Math.max(0, Math.ceil(p * stored) - 1))]);
    const sample: Record<string, number | string> = {
      seq: this.seq,
      win: Math.round(windowMs),
      frames: this.frameCount,
      fps: this.frameSum > 0 ? r1((this.frameCount * 1000) / this.frameSum) : 0,
      fpsMin: Number.isFinite(this.fpsMin) ? r1(this.fpsMin) : this.frameSum > 0 ? r1((this.frameCount * 1000) / this.frameSum) : 0,
      ftP50: r1(pick(0.5)),
      ftP95: r1(pick(0.95)),
      ftMax: r1(this.frameMax),
      long: this.longFrames
    };
    for (const section of DEBUG_CLIENT_SECTIONS) {
      const count = this.sectionCount.get(section) ?? 0;
      if (count === 0) continue;
      const field = debugClientSectionField(section as DebugClientSection);
      sample[field] = r2((this.sectionSum.get(section) ?? 0) / count);
      sample[`${field}Max`] = r1(this.sectionMax.get(section) ?? 0);
    }
    if (this.lodSeen) {
      sample.lod = this.lod;
      sample.lodMax = this.lodMax;
      sample.lodChanges = this.lodChanges;
    }
    sample.snapN = this.snapshots;
    sample.bufLen = this.bufLen;
    sample.bufMax = this.bufMax;
    sample.drops = this.droppedBase === undefined ? 0 : Math.max(0, this.droppedLast - this.droppedBase);
    sample.starve = this.starve;
    sample.gapMax = Math.round(this.gapMax);
    if (this.pingCount > 0) {
      sample.ping = Math.round(this.pingSum / this.pingCount);
      sample.pingMax = Math.round(this.pingMax);
      sample.queueKb = Math.round(this.queueKb);
    }
    const heap = safe(() => this.env.heap?.(), undefined);
    if (heap) {
      sample.heapMb = Math.round(heap.usedMb);
      sample.heapLimitMb = Math.round(heap.limitMb);
    }
    const device = safe(() => this.env.device?.(), undefined) ?? {};
    for (const [key, value] of Object.entries(device)) {
      if (typeof value === "number" && Number.isFinite(value)) sample[key] = value;
      else if (typeof value === "string" && value) sample[key] = value.slice(0, 24);
    }
    sample.hidden = this.hidden;
    sample.hiddenMs = Math.round(this.hiddenMs + (this.hiddenSince !== undefined ? now - this.hiddenSince : 0));
    sample.ctxLost = this.contextLost;
    this.seq += 1;
    return sample;
  }

  private reset(now: number) {
    this.windowStart = now;
    this.frameCount = 0;
    this.frameSum = 0;
    this.frameMax = 0;
    this.longFrames = 0;
    this.fpsMin = Number.POSITIVE_INFINITY;
    this.secondStart = now;
    this.secondFrames = 0;
    this.sectionSum.clear();
    this.sectionCount.clear();
    this.sectionMax.clear();
    this.lodMax = this.lod;
    this.lodChanges = 0;
    this.snapshots = 0;
    this.gapMax = 0;
    this.bufMax = this.bufLen;
    this.droppedBase = this.droppedLast;
    this.starve = 0;
    this.pingSum = 0;
    this.pingCount = 0;
    this.pingMax = 0;
    this.queueKb = 0;
    this.hidden = 0;
    this.hiddenMs = 0;
    if (this.hiddenSince !== undefined) this.hiddenSince = now;
    this.contextLost = 0;
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Tarayici ailesi: yalnizca aile adi, surum ve tam dize yok. */
export function browserFamily(userAgent: string) {
  if (/SamsungBrowser/i.test(userAgent)) return "samsung";
  if (/Edg\//i.test(userAgent)) return "edge";
  if (/OPR\/|Opera/i.test(userAgent)) return "opera";
  if (/Firefox\//i.test(userAgent)) return "firefox";
  if (/Chrome\/|CriOS\//i.test(userAgent)) return "chrome";
  if (/Safari\//i.test(userAgent)) return "safari";
  return "other";
}

export function osFamily(userAgent: string, maxTouchPoints = 0) {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  if (/CrOS/i.test(userAgent)) return "chromeos";
  if (/Linux/i.test(userAgent)) return "linux";
  return "other";
}
