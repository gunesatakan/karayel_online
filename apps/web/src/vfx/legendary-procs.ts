import { GAME_SPEED_MULTIPLIER, LEGENDARY_EFFECTS, type LegendaryEffect, type LegendaryProcMessage } from "@karayel/shared";
import type { FlashSink } from "./flash-pool";
import { clamp01, hashNoise, strokeRing, type VfxGraphics } from "./kit";
import type { VfxLod } from "./lod";

/**
 * Efsanevi vurus etkilerinin cizimi (`legendary:procs` yayini; tik basina bir dizi).
 *
 * Dil oyunun geri kalaniyla ayni: ince keskin cizgiler, kisa flas, birkac
 * kivilcim cizgisi. Parilti, yildiz, yaldiz yok. Her etkinin kendi rengi
 * var, ama hepsi ince ve kisa: kalabalikta ekrani bogmamali.
 *
 * Iki tur kayit:
 * - Anlik (zincir, patlama, infaz, parcalanma patlamasi, kronal geri odeme):
 *   mesajin konumunda, 160-300 ms.
 * - Yapisik (dondurma cercevesi, catlak, kronal iz, bag, cekim): dusmanin
 *   **o anki** cizim konumunda, sure boyunca; dusman kaybolunca bitiyor.
 *   Konum her karede `lookup`tan (oyunda dusman sprite'i, galeride yuruyucu).
 *
 * Sinirlar: ayni anda en fazla `LEGENDARY_TRANSIENT_CAP` anlik ve
 * `LEGENDARY_ATTACHED_CAP` yapisik kayit; dolunca en eskisi gidiyor. LOD
 * yukseldikce sinirlar yariya iniyor ve ikincil ayrinti (kivilcim, uc
 * flaslari, kertikler, ikinci halka) dusuyor. Azaltilmis harekette cizgiler
 * sabit: buyume, nabiz, kayan kesik yok; anlik isaretler daha kisa.
 *
 * Sureler mesajda oyun ms'si; duvar saatine `GAME_SPEED_MULTIPLIER` ile.
 * Cizim Graphics'i her karede temizleyip yeniden ciziyor; nesne acilmiyor.
 */

export const LEGENDARY_TRANSIENT_CAP = 24;
export const LEGENDARY_ATTACHED_CAP = 32;

/** Etkilerin rengi: cekirdek (acik) ve kenar (koyu ton). */
export const LEGENDARY_COLORS: Readonly<Record<LegendaryEffect, { core: number; edge: number }>> = {
  chain: { core: 0xf0fdff, edge: 0x38bdf8 },
  blast: { core: 0xfef3c7, edge: 0xf59e0b },
  freeze: { core: 0xe0f2fe, edge: 0x7dd3fc },
  execute: { core: 0xf8fafc, edge: 0xdc2626 },
  shatter: { core: 0xe2e8f0, edge: 0x94a3b8 },
  chrono: { core: 0xede9fe, edge: 0xa78bfa },
  link: { core: 0xccfbf1, edge: 0x2dd4bf },
  gravity: { core: 0xe0e7ff, edge: 0x818cf8 }
};

/** Anlik isaretlerin duvar suresi (ms): normal / azaltilmis hareket. */
const TRANSIENT_MS = {
  chain: [170, 140],
  blast: [260, 180],
  execute: [240, 180],
  shatterBurst: [280, 180],
  chronoPayback: [260, 180]
} as const;

/** Cekim halkalarinin donusu (ms). */
const GRAVITY_LOOP_MS = 700;

export type LegendaryEnemySpot = { x: number; y: number; size: number };
export type LegendaryEnemyLookup = (id: string) => LegendaryEnemySpot | undefined;

export type LegendaryProcOptions = {
  /** Oyunda `VfxLod`; galeride sabit bir seviye. */
  lod?: Pick<VfxLod, "level">;
  reducedMotion?: () => boolean;
  flash?: FlashSink;
  /** Bulunamayan dusmanin yedek boyu (dunya birimi). */
  fallbackEnemySize?: number;
};

type Instance = {
  kind: LegendaryEffect;
  /** Ikinci evre: parcalanmanin patlamasi, kronal geri odeme. */
  burst: boolean;
  attached: boolean;
  x: number;
  y: number;
  e?: string;
  e2?: string;
  points?: number[];
  r: number;
  bornAt: number;
  durationMs: number;
  seed: number;
  still: boolean;
};

const wallMs = (gameMs: number | undefined) => (gameMs !== undefined && Number.isFinite(gameMs) && gameMs > 0 ? gameMs / GAME_SPEED_MULTIPLIER : 0);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Telin temizlenmesi: bilinmeyen etki ya da bozuk konum dusuyor. */
export function sanitizeLegendaryProc(message: unknown): LegendaryProcMessage | undefined {
  if (!message || typeof message !== "object") return undefined;
  const raw = message as Partial<LegendaryProcMessage>;
  if (!LEGENDARY_EFFECTS.includes(raw.k as LegendaryEffect) || !finite(raw.x) || !finite(raw.y)) return undefined;
  return raw as LegendaryProcMessage;
}

export class LegendaryProcVfx {
  private readonly transients: Instance[] = [];
  private readonly attached: Instance[] = [];
  private drewLastFrame = false;
  private seedCounter = 0;

  constructor(
    private readonly top: VfxGraphics & { clear(): unknown },
    private readonly ground: VfxGraphics & { clear(): unknown },
    private readonly options: LegendaryProcOptions = {}
  ) {}

  private get lodLevel() {
    return this.options.lod?.level ?? 0;
  }

  private get reducedMotion() {
    return this.options.reducedMotion?.() ?? false;
  }

  get liveCount() {
    return this.transients.length + this.attached.length;
  }

  clear() {
    this.transients.length = 0;
    this.attached.length = 0;
    this.top.clear();
    this.ground.clear();
    this.drewLastFrame = false;
  }

  /** Yayini kayda cevirir; `now` cizimin saatiyle ayni (oyunda performance.now). */
  emit(message: LegendaryProcMessage, now: number) {
    const still = this.reducedMotion;
    const pick = (pair: readonly [number, number]) => pair[still ? 1 : 0];
    const seed = (this.seedCounter = (this.seedCounter + 1) % 100000) * 7.31 + message.x * 0.013 + message.y * 0.029;
    const base = { x: message.x, y: message.y, e: message.e, e2: message.e2, bornAt: now, seed, still, burst: false, attached: false, r: finite(message.r) ? message.r : 0 };
    let instance: Instance | undefined;
    switch (message.k) {
      case "chain": {
        const points = Array.isArray(message.p) ? message.p.filter(finite) : [];
        if (points.length < 4) return;
        instance = { ...base, kind: "chain", points, durationMs: pick(TRANSIENT_MS.chain) };
        if (this.options.flash) {
          // Uc flaslari: her halkada kucuk bir beyaz nokta; LOD'da yalnizca ilk ve son.
          const last = points.length / 2 - 1;
          for (let index = 0; index <= last; index += 1) {
            if (this.lodLevel >= 1 && index !== 0 && index !== last) continue;
            this.flashAt(points[index * 2], points[index * 2 + 1], LEGENDARY_COLORS.chain.core, 10, 4, 120, now, 0.85);
          }
        }
        break;
      }
      case "blast":
        if (!(base.r > 0)) return;
        instance = { ...base, kind: "blast", durationMs: pick(TRANSIENT_MS.blast) };
        this.flashAt(base.x, base.y, LEGENDARY_COLORS.blast.core, base.r * 0.55, still ? base.r * 0.55 : base.r * 0.85, 110, now, 0.8);
        break;
      case "execute":
        instance = { ...base, kind: "execute", durationMs: pick(TRANSIENT_MS.execute) };
        this.flashAt(base.x, base.y, LEGENDARY_COLORS.execute.core, 18, still ? 18 : 6, 140, now, 0.9);
        break;
      case "shatter":
        if (message.f === 1) {
          if (!(base.r > 0)) return;
          instance = { ...base, kind: "shatter", burst: true, durationMs: pick(TRANSIENT_MS.shatterBurst) };
          this.flashAt(base.x, base.y, LEGENDARY_COLORS.shatter.core, 12, still ? 12 : 5, 120, now, 0.75);
        } else {
          if (!message.e) return;
          instance = { ...base, kind: "shatter", attached: true, durationMs: Math.max(120, wallMs(message.ms)) };
        }
        break;
      case "chrono":
        if (message.f === 1) {
          instance = { ...base, kind: "chrono", burst: true, durationMs: pick(TRANSIENT_MS.chronoPayback) };
          this.flashAt(base.x, base.y, LEGENDARY_COLORS.chrono.core, 16, still ? 16 : 6, 150, now, 0.8);
        } else {
          if (!message.e) return;
          instance = { ...base, kind: "chrono", attached: true, durationMs: Math.max(120, wallMs(message.ms)) };
        }
        break;
      case "freeze":
        if (!message.e) return;
        instance = { ...base, kind: "freeze", attached: true, durationMs: Math.max(120, wallMs(message.ms)) };
        break;
      case "link":
        if (!message.e || !message.e2) return;
        instance = { ...base, kind: "link", attached: true, durationMs: Math.max(120, wallMs(message.ms)) };
        break;
      case "gravity":
        if (!message.e || !(base.r > 0)) return;
        instance = { ...base, kind: "gravity", attached: true, durationMs: Math.max(120, wallMs(message.ms)) };
        break;
    }
    if (!instance) return;
    if (instance.attached) {
      // Ayni dusmanda ayni etki: yenisi eskisinin yerini aliyor (sure tazeleniyor).
      const existing = this.attached.findIndex((entry) => entry.kind === instance.kind && entry.e === instance.e && entry.burst === instance.burst);
      if (existing >= 0) this.attached.splice(existing, 1);
      this.attached.push(instance);
      const cap = this.lodLevel >= 2 ? LEGENDARY_ATTACHED_CAP / 2 : LEGENDARY_ATTACHED_CAP;
      while (this.attached.length > cap) this.attached.shift();
    } else {
      this.transients.push(instance);
      const cap = this.lodLevel >= 2 ? LEGENDARY_TRANSIENT_CAP / 2 : LEGENDARY_TRANSIENT_CAP;
      while (this.transients.length > cap) this.transients.shift();
    }
  }

  private flashAt(x: number, y: number, tint: number, sizeFrom: number, sizeTo: number, durationMs: number, now: number, alpha: number) {
    this.options.flash?.flash({ x, y, texture: "glow", tint, alpha, sizeFrom, sizeTo, durationMs, bornAt: now });
  }

  /** Karenin cizimi; `lookup` dusmanin o anki konumunu veriyor. */
  render(now: number, lookup: LegendaryEnemyLookup) {
    if (this.transients.length === 0 && this.attached.length === 0) {
      if (this.drewLastFrame) {
        this.top.clear();
        this.ground.clear();
        this.drewLastFrame = false;
      }
      return;
    }
    this.top.clear();
    this.ground.clear();
    this.drewLastFrame = true;
    const lod = this.lodLevel;
    for (let index = this.transients.length - 1; index >= 0; index -= 1) {
      const instance = this.transients[index];
      const life = (now - instance.bornAt) / instance.durationMs;
      if (life >= 1) {
        this.transients.splice(index, 1);
        continue;
      }
      // Gecikmeli kayit (oyunda oynatma gecikmesi): vakti gelene kadar cizilmiyor.
      if (life < 0) continue;
      this.drawTransient(instance, life, lod);
    }
    const fallback = this.options.fallbackEnemySize ?? 30;
    for (let index = this.attached.length - 1; index >= 0; index -= 1) {
      const instance = this.attached[index];
      const life = (now - instance.bornAt) / instance.durationMs;
      if (life < 0) continue;
      const spot = instance.e ? lookup(instance.e) : undefined;
      const partner = instance.kind === "link" && instance.e2 ? lookup(instance.e2) : undefined;
      if (life >= 1 || !spot || (instance.kind === "link" && !partner)) {
        this.attached.splice(index, 1);
        continue;
      }
      const size = spot.size > 0 ? spot.size : fallback;
      this.drawAttached(instance, clamp01(life), now, lod, spot.x, spot.y, size, partner);
    }
  }

  // ------------------------------------------------------------------ anlik

  private drawTransient(instance: Instance, life: number, lod: number) {
    const g = this.top;
    const fade = 1 - life;
    const { core, edge } = LEGENDARY_COLORS[instance.kind];
    if (instance.kind === "chain") {
      const points = instance.points ?? [];
      // Kirik cizgi: hareketli kipte iki kez yeniden kiriliyor (titreme), sabitte tek sekil.
      const frame = instance.still ? 0 : Math.floor(life * 3);
      const kinks = lod >= 2 ? 1 : 3;
      for (let index = 0; index + 3 < points.length; index += 2) {
        const segment = jagged(points[index], points[index + 1], points[index + 2], points[index + 3], kinks, instance.seed + index * 13.7 + frame * 5.1);
        if (lod < 2) {
          g.lineStyle(4, edge, 0.32 * fade);
          strokePolyline(g, segment);
        }
        g.lineStyle(lod >= 3 ? 1.5 : 2, core, 0.95 * fade);
        strokePolyline(g, segment);
      }
      return;
    }
    if (instance.kind === "blast") {
      const r = instance.r;
      const grow = instance.still ? 1 : 0.35 + 0.65 * easeOut(Math.min(1, life * 1.6));
      g.lineStyle(instance.still ? 1.5 : 2 - life, core, 0.9 * fade);
      strokeRing(g, instance.x, instance.y, r * grow);
      if (lod < 2) {
        g.lineStyle(1, edge, 0.4 * fade);
        strokeRing(g, instance.x, instance.y, r * grow * 0.92);
      }
      if (lod < 1) {
        // Kivilcim cizgileri: alti kisa isin, halkayla birlikte disari.
        g.lineStyle(1.2, edge, 0.85 * fade);
        for (let spark = 0; spark < 6; spark += 1) {
          const angle = (spark / 6) * Math.PI * 2 + hashNoise(instance.seed + spark) * 0.6;
          const from = r * (instance.still ? 0.45 : 0.25 + 0.55 * life);
          const to = from + r * 0.22;
          g.lineBetween(instance.x + Math.cos(angle) * from, instance.y + Math.sin(angle) * from, instance.x + Math.cos(angle) * to, instance.y + Math.sin(angle) * to);
        }
      }
      return;
    }
    if (instance.kind === "execute") {
      // Tek capraz kesik: ilk 60 ms'de cekiliyor (sabitte hemen tam), sonra soner.
      const reach = 22;
      const angle = -0.62 + (hashNoise(instance.seed) - 0.5) * 0.4;
      const drawn = instance.still ? 1 : clamp01(life / 0.25);
      const dx = Math.cos(angle) * reach;
      const dy = Math.sin(angle) * reach;
      const x1 = instance.x - dx;
      const y1 = instance.y - dy;
      const x2 = x1 + dx * 2 * drawn;
      const y2 = y1 + dy * 2 * drawn;
      if (lod < 2) {
        g.lineStyle(5, edge, 0.4 * fade);
        g.lineBetween(x1, y1, x2, y2);
      }
      g.lineStyle(2.2, core, fade);
      g.lineBetween(x1, y1, x2, y2);
      return;
    }
    if (instance.kind === "shatter") {
      // Sarapnel: dairesel kisa cizgiler, merkezden r'ye.
      const count = lod >= 1 ? 5 : 8;
      const r = instance.r;
      g.lineStyle(1.3, core, 0.9 * fade);
      for (let shard = 0; shard < count; shard += 1) {
        const angle = (shard / count) * Math.PI * 2 + hashNoise(instance.seed + shard * 3.3) * 0.7;
        const travel = instance.still ? 0.5 : 0.15 + 0.85 * easeOut(life);
        const length = r * (instance.still ? 0.3 : 0.18);
        const from = r * travel - length;
        const to = r * travel;
        g.lineBetween(
          instance.x + Math.cos(angle) * Math.max(0, from), instance.y + Math.sin(angle) * Math.max(0, from),
          instance.x + Math.cos(angle) * to, instance.y + Math.sin(angle) * to
        );
      }
      return;
    }
    if (instance.kind === "chrono") {
      // Geri odeme: kertikler iceri kapaniyor (sabitte yerinde), merkezde flas.
      const count = lod >= 2 ? 4 : 6;
      const outer = instance.still ? 18 : 26 - 16 * easeOut(life);
      g.lineStyle(1.4, core, 0.9 * fade);
      for (let tick = 0; tick < count; tick += 1) {
        const angle = (tick / count) * Math.PI * 2 - Math.PI / 2;
        g.lineBetween(
          instance.x + Math.cos(angle) * outer, instance.y + Math.sin(angle) * outer,
          instance.x + Math.cos(angle) * (outer - 7), instance.y + Math.sin(angle) * (outer - 7)
        );
      }
      if (lod < 2) {
        g.lineStyle(1, edge, 0.5 * fade);
        strokeRing(g, instance.x, instance.y, outer + 2);
      }
    }
  }

  // --------------------------------------------------------------- yapisik

  private drawAttached(instance: Instance, life: number, now: number, lod: number, x: number, y: number, size: number, partner?: LegendaryEnemySpot) {
    const g = this.top;
    const { core, edge } = LEGENDARY_COLORS[instance.kind];
    // Son %20'de sonuyor; sabit kipte de (yalnizca alfa, hareket yok).
    const fade = life > 0.8 ? (1 - life) / 0.2 : 1;
    if (instance.kind === "freeze") {
      // Kose ayraclari ve kisa nisan cizgileri: ilk 90 ms'de iceri oturuyor.
      const settle = instance.still ? 1 : clamp01((now - instance.bornAt) / 90);
      const half = size * 0.6 * (1.3 - 0.3 * settle);
      const arm = half * 0.42;
      g.lineStyle(1.5, core, 0.95 * fade);
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const cx = x + sx * half;
          const cy = y + sy * half;
          g.lineBetween(cx, cy, cx - sx * arm, cy);
          g.lineBetween(cx, cy, cx, cy - sy * arm);
        }
      }
      if (lod < 1) {
        g.lineStyle(1, edge, 0.75 * fade);
        const inner = half * 0.55;
        const outer = half * 0.85;
        g.lineBetween(x - outer, y, x - inner, y);
        g.lineBetween(x + inner, y, x + outer, y);
        g.lineBetween(x, y - outer, x, y - inner);
        g.lineBetween(x, y + inner, x, y + outer);
      }
      return;
    }
    if (instance.kind === "shatter") {
      // Catlak: dusmanin ustunde iki-uc ince kirik cizgi, sabit.
      const count = lod >= 2 ? 2 : 3;
      const reach = size * 0.46;
      g.lineStyle(1, core, 0.8 * fade);
      for (let crack = 0; crack < count; crack += 1) {
        const angle = (crack / count) * Math.PI * 2 + hashNoise(instance.seed + crack) * 1.2;
        const bend = angle + (hashNoise(instance.seed + crack * 7.7) - 0.5) * 0.9;
        const startR = reach * 0.12;
        const midR = reach * 0.55;
        const sx = x + Math.cos(angle) * startR;
        const sy = y + Math.sin(angle) * startR;
        const mx = x + Math.cos(angle) * midR;
        const my = y + Math.sin(angle) * midR;
        g.lineBetween(sx, sy, mx, my);
        g.lineBetween(mx, my, x + Math.cos(bend) * reach, y + Math.sin(bend) * reach);
      }
      return;
    }
    if (instance.kind === "chrono") {
      // Kadran: ince halka, kertikler ve surenin dolan yayi; ibre yalnizca hareketli kipte.
      const radius = size * 0.72;
      g.lineStyle(1, edge, 0.5 * fade);
      strokeRing(g, x, y, radius);
      const ticks = lod >= 2 ? 4 : 12;
      g.lineStyle(1, edge, 0.7 * fade);
      for (let tick = 0; tick < ticks; tick += 1) {
        const angle = (tick / ticks) * Math.PI * 2 - Math.PI / 2;
        const inner = radius - (tick % 3 === 0 ? 4 : 2.5);
        g.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      }
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * Math.max(0.001, life);
      g.lineStyle(1.6, core, 0.9 * fade);
      g.beginPath();
      g.arc(x, y, radius + 2.5, start, end, false);
      g.strokePath();
      if (!instance.still && lod < 2) {
        g.lineStyle(1.4, core, 0.95 * fade);
        g.lineBetween(x + Math.cos(end) * (radius - 5), y + Math.sin(end) * (radius - 5), x + Math.cos(end) * (radius + 5), y + Math.sin(end) * (radius + 5));
      }
      return;
    }
    if (instance.kind === "link" && partner) {
      // Ince kesik bag: iki dusmanin o anki konumu arasinda; kesikler yavasca kayiyor.
      const dx = partner.x - x;
      const dy = partner.y - y;
      const length = Math.hypot(dx, dy);
      if (length < 1) return;
      const ux = dx / length;
      const uy = dy / length;
      const dash = 6;
      const gap = 4;
      const period = dash + gap;
      const offset = instance.still || lod >= 2 ? 0 : ((now - instance.bornAt) * 0.02) % period;
      g.lineStyle(1.2, core, 0.75 * fade);
      for (let at = -period + offset; at < length; at += period) {
        const from = Math.max(0, at);
        const to = Math.min(length, at + dash);
        if (to <= from) continue;
        g.lineBetween(x + ux * from, y + uy * from, x + ux * to, y + uy * to);
      }
      if (lod < 1) {
        g.fillStyle(edge, 0.9 * fade);
        for (const end of [{ x, y }, partner]) {
          g.fillTriangle(end.x, end.y - 3, end.x + 3, end.y, end.x, end.y + 3);
          g.fillTriangle(end.x, end.y - 3, end.x - 3, end.y, end.x, end.y + 3);
        }
      }
      return;
    }
    if (instance.kind === "gravity") {
      // Iceri kapanan iki ince halka (yer yuzeyinde, dusmanlarin altinda);
      // sabit kipte tek halka ve iceri bakan kertikler.
      const ground = this.ground;
      const r = instance.r;
      if (instance.still) {
        ground.lineStyle(1, edge, 0.4 * fade);
        strokeRing(ground, x, y, r);
      } else {
        const rings = lod >= 2 ? 1 : 2;
        for (let ring = 0; ring < rings; ring += 1) {
          const phase = (((now - instance.bornAt) / GRAVITY_LOOP_MS) + ring / rings) % 1;
          const radius = r * (1 - 0.75 * phase);
          ground.lineStyle(1, edge, (0.12 + 0.4 * phase) * fade);
          strokeRing(ground, x, y, radius);
        }
      }
      if (lod < 1 || instance.still) {
        ground.lineStyle(1.2, core, 0.6 * fade);
        for (let tick = 0; tick < 4; tick += 1) {
          const angle = (tick / 4) * Math.PI * 2 + Math.PI / 4;
          ground.lineBetween(x + Math.cos(angle) * r, y + Math.sin(angle) * r, x + Math.cos(angle) * (r - 6), y + Math.sin(angle) * (r - 6));
        }
      }
    }
  }
}

function easeOut(value: number) {
  const t = clamp01(value);
  return 1 - (1 - t) * (1 - t);
}

/** Iki nokta arasinda kirik bir cizgi: uclar sabit, ara noktalar dik yonde kayik. */
function jagged(x1: number, y1: number, x2: number, y2: number, kinks: number, seed: number) {
  const points: number[] = [x1, y1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const amplitude = Math.min(12, length * 0.2);
  for (let index = 1; index <= kinks; index += 1) {
    const t = index / (kinks + 1);
    const offset = (hashNoise(seed + index * 1.93) - 0.5) * 2 * amplitude;
    points.push(x1 + dx * t + nx * offset, y1 + dy * t + ny * offset);
  }
  points.push(x2, y2);
  return points;
}

function strokePolyline(g: VfxGraphics, points: readonly number[]) {
  for (let index = 0; index + 3 < points.length; index += 2) {
    g.lineBetween(points[index], points[index + 1], points[index + 2], points[index + 3]);
  }
}
