import type Phaser from "phaser";
import type { CounterSurgeHitMessage, CounterSurgeSnapshot, SpecialEnemyKind } from "@karayel/shared";

// Karsi atak seritlerinin cizimi ve geometrisi `counter-surge.ts`te; eski
// cagiranlar (sahne, testler) buradan da okuyabiliyor.
export {
  AegisImpacts,
  COUNTER_SURGE_NOTICE_KEYS,
  COUNTER_SURGE_SOUND_CUES,
  COUNTER_SURGE_STYLES,
  createCounterSurgeBand,
  drawCounterSurge,
  getCounterSurgeAlertPoint,
  getCounterSurgeBand,
  getSurgeBandPoint,
  readCounterSurges,
  sanitizeSurgeBlockMessage,
  SURGE_COLOR,
  SURGE_EDGE_COLOR,
  type CounterSurgeBand,
  type CounterSurgeBandSegment
} from "./counter-surge";

/**
 * Ozel dusmanlar (kule avcisi, isitici, enerji yiyici) ve karsi atak:
 * istemcinin isaretleri ve telin temizlenmesi. Seritlerin cizimi
 * `counter-surge.ts`te.
 *
 * Govde normal irk cizimi; burasi yalnizca ustune binen isareti ciziyor.
 * Dil agir ve sert: kose ayraclari, kesik halka, altigen, duz kenarli serit.
 * Parilti, yildiz, yaldiz yok; renkler yere indirilmis tonlar (doygunluk
 * sinirli), parlak olan yalnizca beyaz-sicak kenar cizgisi.
 *
 * Cizim fonksiyonlari Graphics'i temizlemiyor: cagiran temizliyor (dusmanin
 * kendi yuzeyi). Karede nesne acilmiyor.
 */

/** Kule avcisi: kizil nisan ayraclari. */
export const HUNTER_MARK_COLOR = 0xc8473a;
/** Isitici: turuncu isi halkasi. */
export const HEATER_MARK_COLOR = 0xc8743e;
/** Enerji yiyici: camgobegi altigen ve emme hatti. */
export const EATER_MARK_COLOR = 0x3fa7b5;
/** Emme hattinin cekirdegi: beyaz-sicak, hafif soguk. */
export const EATER_CORE_COLOR = 0xe6f6f8;
export const SPECIAL_MARK_COLORS: Readonly<Record<SpecialEnemyKind, number>> = {
  harvester: 0xe0ad52,
  bomber: 0xff782e,
  hunter: HUNTER_MARK_COLOR,
  heater: HEATER_MARK_COLOR,
  eater: EATER_MARK_COLOR
};

/** Bir `surge:hit` mesajinda okunan en fazla vurus (bozuk ya da asiri buyuk mesaja karsi). */
export const SURGE_HIT_MAX_ENTRIES = 96;
const MAX_ID_LENGTH = 64;

export function isSpecialEnemyKind(value: unknown): value is SpecialEnemyKind {
  return value === "harvester" || value === "bomber" || value === "hunter" || value === "heater" || value === "eater";
}

/**
 * `surge:hit` mesajini temizler. Eski/yeni sunucu farki ya da bozuk veri:
 * gecersiz kayit atlaniyor, hic gecerli vurus yoksa `undefined`.
 */
export function sanitizeSurgeHitMessage(raw: unknown): CounterSurgeHitMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const message = raw as { id?: unknown; hits?: unknown };
  const id = typeof message.id === "number" && Number.isFinite(message.id) ? message.id : undefined;
  if (id === undefined || !Array.isArray(message.hits)) return undefined;
  const hits: CounterSurgeHitMessage["hits"] = [];
  const seen = new Set<string>();
  for (const entry of message.hits) {
    if (hits.length >= SURGE_HIT_MAX_ENTRIES) break;
    if (!entry || typeof entry !== "object") continue;
    const { towerId, amount } = entry as { towerId?: unknown; amount?: unknown };
    if (typeof towerId !== "string" || towerId.length === 0 || towerId.length > MAX_ID_LENGTH) continue;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) continue;
    // Yapi basina bir vurus: ayni yapi iki kez gelirse ikincisi atlaniyor.
    if (seen.has(towerId)) continue;
    seen.add(towerId);
    hits.push({ towerId, amount: Math.round(amount) });
  }
  return hits.length > 0 ? { id, hits } : undefined;
}

/**
 * Snapshot'taki ilk gecerli serit. Alan yoksa, dizi bossa ya da kayit
 * bozuksa `undefined` (gorsel kalkiyor). Kayit kopyalanmiyor.
 */
export function readCounterSurge(surges: unknown): CounterSurgeSnapshot | undefined {
  if (!Array.isArray(surges)) return undefined;
  for (const surge of surges) {
    if (!surge || typeof surge !== "object") continue;
    const { id, col, w, p } = surge as Partial<CounterSurgeSnapshot>;
    if (typeof id !== "number" || !Number.isFinite(id)) continue;
    if (typeof col !== "number" || !Number.isFinite(col)) continue;
    if (typeof w !== "number" || !Number.isFinite(w) || w < 1) continue;
    if (typeof p !== "number" || !Number.isFinite(p)) continue;
    return surge as CounterSurgeSnapshot;
  }
  return undefined;
}

/**
 * Iki snapshot arasinda seridin ilerlemesi: ayni kimlikli ve ikisi de kalkmis
 * seritte `p` dogrusal. Uyari evresi ve yeni serit oldugu gibi. Snapshot ~60
 * ms'de bir geliyor; ara deger on kenarin her karede yumusak ilerlemesi.
 */
export function interpolateCounterSurges(
  previous: readonly CounterSurgeSnapshot[] | undefined,
  next: CounterSurgeSnapshot[] | undefined,
  alpha: number
): CounterSurgeSnapshot[] | undefined {
  if (!next || next.length === 0 || !previous || previous.length === 0) return next;
  const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  let changed = false;
  const result = next.map((surge) => {
    if (surge.warn || !Number.isFinite(surge.p)) return surge;
    const old = previous.find((candidate) => candidate.id === surge.id);
    if (!old || old.warn || !Number.isFinite(old.p) || old.p > surge.p) return surge;
    changed = true;
    return { ...surge, p: old.p + (surge.p - old.p) * t };
  });
  return changed ? result : next;
}

/**
 * Ilk gorulme bildirimleri: tur basina macta bir kez, karsi atak serit
 * basina bir kez. Yeni macta `reset`.
 */
export class SpecialThreatNotices {
  private readonly kinds = new Set<SpecialEnemyKind>();
  private readonly surges = new Set<number>();

  /** Tur ilk kez goruldu mu (true donerse bildirim gosterilmeli). */
  noteKind(kind: SpecialEnemyKind) {
    if (this.kinds.has(kind)) return false;
    this.kinds.add(kind);
    return true;
  }

  noteSurge(id: number) {
    if (this.surges.has(id)) return false;
    // Macta dalga basina en fazla iki serit; yine de sinirsiz buyumesin.
    if (this.surges.size > 128) this.surges.clear();
    this.surges.add(id);
    return true;
  }

  reset() {
    this.kinds.clear();
    this.surges.clear();
  }
}

type DrawOptions = {
  now: number;
  reducedMotion: boolean;
};

/**
 * Ozel dusmanin isareti; govdenin cevresinde. `size` ekrandaki govde capi,
 * `heaterRadius` isiticinin etki yaricapi (dunya birimi).
 */
export function drawSpecialEnemyMarker(
  graphics: Phaser.GameObjects.Graphics,
  kind: SpecialEnemyKind,
  x: number,
  y: number,
  size: number,
  heaterRadius: number,
  options: DrawOptions
) {
  if (kind === "harvester") return;
  if (kind === "bomber") {
    graphics.lineStyle(2, SPECIAL_MARK_COLORS.bomber, 0.85);
    graphics.strokeCircle(x, y, Math.max(8, size * 0.55));
    graphics.lineBetween(x, y - size * 0.55, x + 4, y - size * 0.55 - 5);
  }
  else if (kind === "hunter") drawHunterBrackets(graphics, x, y, size, options);
  else if (kind === "heater") drawHeaterRing(graphics, x, y, size, heaterRadius, options);
  else drawEaterHex(graphics, x, y, size, options);
}

/** Kule avcisi: dort kose ayraci, yavas ve sert bir nefes (olcek degil, saydamlik). */
function drawHunterBrackets(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, { now, reducedMotion }: DrawOptions) {
  const half = Math.max(8, size * 0.5) + 2;
  const arm = Math.max(3, half * 0.42);
  const alpha = reducedMotion ? 0.9 : 0.74 + 0.2 * Math.sin(now / 170);
  graphics.lineStyle(Math.max(1.4, size * 0.06), HUNTER_MARK_COLOR, alpha);
  for (let corner = 0; corner < 4; corner += 1) {
    const sx = corner & 1 ? 1 : -1;
    const sy = corner & 2 ? 1 : -1;
    const cx = x + sx * half;
    const cy = y + sy * half;
    graphics.lineBetween(cx, cy, cx - sx * arm, cy);
    graphics.lineBetween(cx, cy, cx, cy - sy * arm);
  }
  // Ustte kisa nisan kertigi: "hedefi var" (kuleye yuruyor).
  graphics.lineBetween(x, y - half - arm * 0.7, x, y - half + arm * 0.2);
}

const HEATER_DASHES = 16;

/**
 * Isitici: etki yaricapinda soluk kesik halka (oyuncu tehlike alanini
 * goruyor) ve govdede uc yay; yaylarin yaricapi hafifce titriyor (isi
 * dalgalanmasi), donmuyor.
 */
function drawHeaterRing(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, radius: number, { now, reducedMotion }: DrawOptions) {
  if (radius > 0) {
    graphics.fillStyle(HEATER_MARK_COLOR, 0.05);
    graphics.fillCircle(x, y, radius);
    graphics.lineStyle(1, HEATER_MARK_COLOR, 0.32);
    const step = (Math.PI * 2) / HEATER_DASHES;
    for (let index = 0; index < HEATER_DASHES; index += 2) {
      graphics.beginPath();
      graphics.arc(x, y, radius, index * step, (index + 1) * step, false);
      graphics.strokePath();
    }
  }
  const bodyRadius = Math.max(7, size * 0.5);
  const wobble = reducedMotion ? 0 : Math.sin(now / 240) * bodyRadius * 0.06;
  graphics.lineStyle(Math.max(1.2, size * 0.05), HEATER_MARK_COLOR, 0.72);
  for (let arc = 0; arc < 3; arc += 1) {
    const start = -Math.PI / 2 + (arc * Math.PI * 2) / 3 + 0.35;
    graphics.beginPath();
    graphics.arc(x, y, bodyRadius + wobble, start, start + 1.35, false);
    graphics.strokePath();
  }
}

/** Enerji yiyici: govdeyi saran duz kenarli altigen. */
function drawEaterHex(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, { now, reducedMotion }: DrawOptions) {
  const radius = Math.max(7, size * 0.54);
  const alpha = reducedMotion ? 0.82 : 0.7 + 0.16 * Math.sin(now / 210);
  graphics.lineStyle(Math.max(1.3, size * 0.055), EATER_MARK_COLOR, alpha);
  graphics.beginPath();
  for (let index = 0; index <= 6; index += 1) {
    const angle = (index * Math.PI) / 3;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) graphics.moveTo(px, py);
    else graphics.lineTo(px, py);
  }
  graphics.closePath();
  graphics.strokePath();
}

const DRAIN_PULSES = 3;
const DRAIN_PULSE_MS = 760;

/**
 * Emme hatti: binadan yiyiciye. Genis soluk omuz, ince beyaz-sicak cekirdek;
 * hat boyunca binadan yiyiciye akan uc kare nabiz (enerji cekiliyor) ve
 * binanin cevresinde kose ayraclari. `targetSize` binanin ekrandaki capi.
 */
export function drawEaterDrain(
  graphics: Phaser.GameObjects.Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  targetSize: number,
  { now, reducedMotion }: DrawOptions
) {
  graphics.lineStyle(5, EATER_MARK_COLOR, 0.18);
  graphics.lineBetween(fromX, fromY, toX, toY);
  graphics.lineStyle(1.6, EATER_CORE_COLOR, 0.78);
  graphics.lineBetween(fromX, fromY, toX, toY);

  const phase = reducedMotion ? 0 : (now % DRAIN_PULSE_MS) / DRAIN_PULSE_MS;
  for (let index = 0; index < DRAIN_PULSES; index += 1) {
    const f = (phase + index / DRAIN_PULSES) % 1;
    // Binadan (0) yiyiciye (1): enerji yiyiciye akiyor.
    const px = toX + (fromX - toX) * f;
    const py = toY + (fromY - toY) * f;
    graphics.fillStyle(EATER_MARK_COLOR, 0.9 - f * 0.45);
    graphics.fillRect(px - 2, py - 2, 4, 4);
  }

  const half = Math.max(8, targetSize * 0.5);
  const arm = Math.max(3, half * 0.35);
  graphics.lineStyle(1.5, EATER_MARK_COLOR, 0.8);
  for (let corner = 0; corner < 4; corner += 1) {
    const sx = corner & 1 ? 1 : -1;
    const sy = corner & 2 ? 1 : -1;
    const cx = toX + sx * half;
    const cy = toY + sy * half;
    graphics.lineBetween(cx, cy, cx - sx * arm, cy);
    graphics.lineBetween(cx, cy, cx, cy - sy * arm);
  }
}

