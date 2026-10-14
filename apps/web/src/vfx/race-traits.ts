import type Phaser from "phaser";
import {
  BUG_BURROWER,
  FALLEN_SOUL_DRAWER,
  FOURTH_FOLD_JUMP,
  GAME_SPEED_MULTIPLIER,
  GOLEM_PETRIFY,
  MEKA_SHIELD_THROWER,
  decodeRaceTrait,
  getBurrowTelegraphStart,
  getSoulDrawerMultipliers,
  type MekaShieldBlockMessage,
  type MekaShieldSnapshot,
  type RaceMechanicId,
  type RaceSoulDrawMessage,
  type RaceTrait
} from "@karayel/shared";

/**
 * Irk mekaniklerinin istemcisi: telin okunmasi, cizim ve ilk gorulme
 * bildirimleri. Kurallar `@karayel/shared` (races/race-mechanics).
 *
 * Dil agir ve sert: tas levhalar, soguk kenarli ince kalkan, kirik toprak,
 * soluk ruh izi, sert kenarli kaydirilmis hayalet, katlanma kirisigi.
 * Parilti, yildiz, yumusak isilti yok; renkler yere indirilmis tonlar.
 *
 * Cizim fonksiyonlari Graphics'i temizlemiyor (cagiran temizliyor) ve
 * karede nesne acmiyor; gecici efektler sabit boyutlu bir halkada.
 */

// --- Renkler (doygunluk sinirli; vfx sert dil testi) ---------------------------------

/** Golem Taslasma levhalari: tas gri-kahve, koyu derz, tek yonden isik. */
export const PETRIFY_PLATE_COLOR = 0x6b6358;
export const PETRIFY_SEAM_COLOR = 0x221f1b;
export const PETRIFY_LIGHT_COLOR = 0x9a9184;
/** Meka kalkani: siperin dili (koyu govde, soguk kenar, beyaz-soguk cekirdek). */
export const MEKA_SHIELD_BODY_COLOR = 0x1c2a3a;
export const MEKA_SHIELD_RIM_COLOR = 0xa9bfcc;
export const MEKA_SHIELD_EDGE_COLOR = 0xe9f3f8;
/** Kazici: toz, kirik toprak ve catlagin isik alan kenari. */
export const BURROW_DUST_COLOR = 0x6e604c;
export const BURROW_CRACK_COLOR = 0x1d1812;
export const BURROW_CRACK_EDGE_COLOR = 0x9a8262;
/** Ruh cekici: soluk, neredeyse gri ruh izi ve yigin kertikleri. */
export const SOUL_WISP_COLOR = 0xd8dde6;
export const SOUL_MARK_COLOR = 0x8e8aa3;
/** 4. boyut: sonuk mor-gri hayalet ve katlanma kirisigi. */
export const PHASE_GHOST_COLOR = 0x8a7fc0;
export const FOLD_MARK_COLOR = 0x9d93c4;

/** Butun irk cizim renkleri (testler sert dili buradan da okuyor). */
export const RACE_TRAIT_COLORS: readonly number[] = [
  PETRIFY_PLATE_COLOR, PETRIFY_SEAM_COLOR, PETRIFY_LIGHT_COLOR,
  MEKA_SHIELD_BODY_COLOR, MEKA_SHIELD_RIM_COLOR, MEKA_SHIELD_EDGE_COLOR,
  BURROW_DUST_COLOR, BURROW_CRACK_COLOR, BURROW_CRACK_EDGE_COLOR,
  SOUL_WISP_COLOR, SOUL_MARK_COLOR, PHASE_GHOST_COLOR, FOLD_MARK_COLOR
];

// --- Tel ----------------------------------------------------------------------------

/** Dusman kaydinin irk alanlari, temizlenmis. Hic alan yoksa `undefined`. */
export type RaceTraitView = {
  trait?: RaceTrait;
  /** Golem Taslasma yigini. */
  petrify: number;
  /** Yer altinda: cikis hucresi ve cikis ani (sunucu saati). */
  burrow?: { col: number; row: number; emergeAt: number };
  /** Ruh cekici yigini. */
  drawer: number;
  /** Fazda (hedeflenemez, yari saydam). */
  phased: boolean;
  /** Katlanma uyarisi: hedef ve sicrama ani (sunucu saati). */
  fold?: { x: number; y: number; at: number };
};

type RaceWireFields = { rt?: unknown; ga?: unknown; bu?: unknown; ds?: unknown; ph?: unknown; fj?: unknown };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function readTriple(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const [a, b, c] = value;
  return finite(a) && finite(b) && finite(c) ? [a, b, c] : undefined;
}

/**
 * Kaydin irk alanlari. Eski sunucu (alan yok) ve bozuk veri: alan yok
 * sayiliyor. Hic alan yoksa `undefined` (karede nesne acilmiyor).
 */
export function readRaceTraitView(enemy: RaceWireFields): RaceTraitView | undefined {
  if (enemy.rt === undefined && enemy.ga === undefined && enemy.bu === undefined
    && enemy.ds === undefined && enemy.ph === undefined && enemy.fj === undefined) return undefined;
  const trait = decodeRaceTrait(enemy.rt);
  const petrify = finite(enemy.ga) ? Math.max(0, Math.min(GOLEM_PETRIFY.maxStacks, Math.floor(enemy.ga))) : 0;
  const drawer = finite(enemy.ds) ? Math.max(0, Math.min(FALLEN_SOUL_DRAWER.maxStacks, Math.floor(enemy.ds))) : 0;
  const bu = readTriple(enemy.bu);
  const fj = readTriple(enemy.fj);
  return {
    trait,
    petrify,
    burrow: bu ? { col: Math.floor(bu[0]), row: Math.floor(bu[1]), emergeAt: bu[2] } : undefined,
    drawer,
    phased: enemy.ph === true,
    fold: fj ? { x: fj[0], y: fj[1], at: fj[2] } : undefined
  };
}

/** Govdenin boy carpani: ruh cekici yiginla buyuyor (+%6 / yigin). */
export function getRaceBodyScale(view: RaceTraitView | undefined) {
  return view && view.drawer > 0 ? getSoulDrawerMultipliers(view.drawer).size : 1;
}

/**
 * Can cubugunun azami cani. Statik kayittaki azami can dogumdaki deger;
 * ruh cekicinin buyuyen cani telde yigin olarak geliyor.
 */
export function getRaceMaxHpScale(view: RaceTraitView | undefined) {
  return view && view.drawer > 0 ? getSoulDrawerMultipliers(view.drawer).hp : 1;
}

/** Catlaklarin ilerlemesi (0..1): uyari evresinde buyuyor, oncesinde `undefined`. */
export function getBurrowTelegraphProgress(emergeAt: number, serverTime: number) {
  const start = getBurrowTelegraphStart(emergeAt);
  if (!(serverTime >= start)) return undefined;
  return Math.max(0, Math.min(1, (serverTime - start) / Math.max(1, emergeAt - start)));
}

/** Katlanma uyarisinin ilerlemesi (0..1). */
export function getFoldWarningProgress(at: number, serverTime: number) {
  const span = FOURTH_FOLD_JUMP.warningMs / GAME_SPEED_MULTIPLIER;
  return Math.max(0, Math.min(1, 1 - (at - serverTime) / span));
}

/** Snapshot'taki gecerli meka kalkanlari (en fazla 32); kayitlar kopyalanmiyor. */
export const MEKA_SHIELD_READ_MAX = 32;

export function readMekaShields(raw: unknown, out: MekaShieldSnapshot[]): MekaShieldSnapshot[] {
  out.length = 0;
  if (!Array.isArray(raw)) return out;
  for (const shield of raw) {
    if (out.length >= MEKA_SHIELD_READ_MAX) break;
    if (!shield || typeof shield !== "object") continue;
    const { id, x1, y1, x2, y2, ms } = shield as Partial<MekaShieldSnapshot>;
    if (![id, x1, y1, x2, y2, ms].every(finite)) continue;
    out.push(shield as MekaShieldSnapshot);
  }
  return out;
}

/** `race:block` temizligi: gecerli konum (0..1) yoksa `undefined`. */
export function sanitizeMekaBlockMessage(raw: unknown): MekaShieldBlockMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { id, a } = raw as { id?: unknown; a?: unknown };
  if (!finite(id) || !Array.isArray(a)) return undefined;
  const points: number[] = [];
  for (const value of a) {
    if (points.length >= 8) break;
    if (finite(value) && value >= 0 && value <= 1) points.push(value);
  }
  return points.length > 0 ? { id, a: points } : undefined;
}

/** `race:soul` temizligi. */
export function sanitizeSoulDrawMessage(raw: unknown): RaceSoulDrawMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { x, y, to, n } = raw as Partial<RaceSoulDrawMessage>;
  if (!finite(x) || !finite(y) || typeof to !== "string" || to.length === 0 || to.length > 64) return undefined;
  return { x, y, to, n: finite(n) ? Math.max(0, Math.min(FALLEN_SOUL_DRAWER.maxStacks, Math.floor(n))) : 0 };
}

// --- Bildirimler ------------------------------------------------------------------

/** Ilk gorulme bildiriminin anahtari (mekanik basina macta bir kez). */
export const RACE_MECHANIC_NOTICE_KEYS: Readonly<Record<RaceMechanicId, string>> = {
  petrify: "scene.race.petrify",
  thrower: "scene.race.thrower",
  burrower: "scene.race.burrower",
  drawer: "scene.race.drawer",
  phaser: "scene.race.phaser",
  folder: "scene.race.folder"
};

/** Mekanik basina macta bir kez; yeni macta `reset`. */
export class RaceMechanicNotices {
  private readonly seen = new Set<RaceMechanicId>();

  note(id: RaceMechanicId) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    return true;
  }

  reset() {
    this.seen.clear();
  }
}

/** Telden okunan durumdan gorulen mekanik (bildirim icin); yoksa `undefined`. */
export function getVisibleRaceMechanic(view: RaceTraitView): RaceMechanicId | undefined {
  if (view.petrify > 0) return "petrify";
  if (view.burrow) return "burrower";
  if (view.phased) return "phaser";
  if (view.fold) return "folder";
  if (view.trait === "drawer") return "drawer";
  return undefined;
}

// --- Cizim --------------------------------------------------------------------------

type DrawOptions = { now: number; reducedMotion: boolean };

/** Kimlikten sabit karma (gorunum dusmana bagli, karede degismiyor). */
export function raceSeed(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619) >>> 0;
  return hash;
}

const noise = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Taslasma: govdenin cevresinde koseli tas levhalar. Yigin arttikca levha
 * sayisi, kalinligi ve opakligi artiyor; tavanda govdeyi saran kalin bir
 * kabuk. Hareket yok (tas).
 */
export function drawPetrifyPlating(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, stacks: number, seed: number) {
  if (!(stacks > 0)) return;
  const t = Math.max(0, Math.min(1, stacks / GOLEM_PETRIFY.maxStacks));
  const plates = 3 + Math.round(t * 9);
  const radius = Math.max(7, size * 0.48);
  const thickness = 1.4 + t * Math.max(2.5, size * 0.12);
  const alpha = 0.38 + 0.52 * t;
  const step = (Math.PI * 2) / 12;
  const turn = noise(seed) * Math.PI * 2;
  for (let index = 0; index < plates; index += 1) {
    // Levhalar 12 yuvadan karma sirayla doluyor: once dagitik, sonra kapali kabuk.
    const slot = (index * 5 + (seed % 12)) % 12;
    const a0 = turn + slot * step + step * 0.08;
    const a1 = a0 + step * 0.84;
    const inner = radius - thickness * 0.4;
    const outer = radius + thickness * (0.6 + noise(seed + index) * 0.4);
    graphics.fillStyle(PETRIFY_PLATE_COLOR, alpha);
    graphics.beginPath();
    graphics.moveTo(x + Math.cos(a0) * inner, y + Math.sin(a0) * inner);
    graphics.lineTo(x + Math.cos(a0) * outer, y + Math.sin(a0) * outer);
    graphics.lineTo(x + Math.cos(a1) * outer, y + Math.sin(a1) * outer);
    graphics.lineTo(x + Math.cos(a1) * inner, y + Math.sin(a1) * inner);
    graphics.closePath();
    graphics.fillPath();
    // Ust pah: isik ust soldan.
    if (Math.sin((a0 + a1) / 2) < 0) {
      graphics.lineStyle(1, PETRIFY_LIGHT_COLOR, alpha * 0.9);
      graphics.lineBetween(x + Math.cos(a0) * outer, y + Math.sin(a0) * outer, x + Math.cos(a1) * outer, y + Math.sin(a1) * outer);
    }
    graphics.lineStyle(1, PETRIFY_SEAM_COLOR, alpha);
    graphics.lineBetween(x + Math.cos(a0) * inner, y + Math.sin(a0) * inner, x + Math.cos(a0) * outer, y + Math.sin(a0) * outer);
  }
}

/** Ucan kalkanin konumu (0..1 ilerleme): duz cizgi ve alcak bir yay (sert, ekran yukarisi). */
export function getMekaShieldFlightPoint(shield: MekaShieldSnapshot, progress: number, cellSize: number) {
  const p = Math.max(0, Math.min(1, progress));
  const cx = (shield.x1 + shield.x2) / 2;
  const cy = (shield.y1 + shield.y2) / 2;
  const ox = shield.ox ?? cx;
  const oy = shield.oy ?? cy;
  const lift = cellSize * 0.7 * 4 * p * (1 - p);
  return { x: ox + (cx - ox) * p, y: oy + (cy - oy) * p - lift };
}

/**
 * Meka kalkani. Ucarken (`flight` 0..1): kucuk sert kenarli bir levha yay
 * cizerek iniyor ve havada donmuyor; inince ince, uzun parca: koyu govde,
 * iki uzun kenarda soguk kenar, uclarda dik kertik. Omrun son anlarinda
 * soluyor (dogrusal).
 */
export function drawMekaShield(
  graphics: Phaser.GameObjects.Graphics,
  shield: MekaShieldSnapshot,
  flight: number | undefined,
  cellSize: number,
  { now, reducedMotion }: DrawOptions
) {
  const dx = shield.x2 - shield.x1;
  const dy = shield.y2 - shield.y1;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  if (flight !== undefined && flight < 1) {
    const point = getMekaShieldFlightPoint(shield, flight, cellSize);
    const half = Math.max(3, cellSize * 0.22) * (0.5 + flight * 0.5);
    const thick = Math.max(1.5, cellSize * 0.07);
    graphics.fillStyle(MEKA_SHIELD_BODY_COLOR, 0.95);
    quad(graphics, point.x - ux * half, point.y - uy * half, point.x + ux * half, point.y + uy * half, nx, ny, thick + 1);
    graphics.fillStyle(MEKA_SHIELD_RIM_COLOR, 0.9);
    quad(graphics, point.x - ux * half, point.y - uy * half, point.x + ux * half, point.y + uy * half, nx, ny, thick * 0.45);
    return;
  }
  const fade = Math.max(0, Math.min(1, shield.ms / 220));
  const alpha = fade;
  const half = Math.max(2, cellSize * 0.075);
  graphics.fillStyle(MEKA_SHIELD_BODY_COLOR, 0.88 * alpha);
  quad(graphics, shield.x1, shield.y1, shield.x2, shield.y2, nx, ny, half + 1);
  const pulse = reducedMotion ? 0.9 : 0.78 + 0.16 * (0.5 + 0.5 * Math.sin(now / 110));
  graphics.lineStyle(Math.max(1, half * 0.5), MEKA_SHIELD_RIM_COLOR, pulse * alpha);
  graphics.lineBetween(shield.x1 + nx * (half + 1), shield.y1 + ny * (half + 1), shield.x2 + nx * (half + 1), shield.y2 + ny * (half + 1));
  graphics.lineBetween(shield.x1 - nx * (half + 1), shield.y1 - ny * (half + 1), shield.x2 - nx * (half + 1), shield.y2 - ny * (half + 1));
  graphics.lineStyle(1, MEKA_SHIELD_EDGE_COLOR, 0.75 * alpha);
  graphics.lineBetween(shield.x1, shield.y1, shield.x2, shield.y2);
  const tick = half + Math.max(3, cellSize * 0.1);
  graphics.lineStyle(1.6, MEKA_SHIELD_RIM_COLOR, alpha);
  graphics.lineBetween(shield.x1 - nx * tick, shield.y1 - ny * tick, shield.x1 + nx * tick, shield.y1 + ny * tick);
  graphics.lineBetween(shield.x2 - nx * tick, shield.y2 - ny * tick, shield.x2 + nx * tick, shield.y2 + ny * tick);
}

function quad(graphics: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, nx: number, ny: number, half: number) {
  graphics.beginPath();
  graphics.moveTo(ax + nx * half, ay + ny * half);
  graphics.lineTo(bx + nx * half, by + ny * half);
  graphics.lineTo(bx - nx * half, by - ny * half);
  graphics.lineTo(ax - nx * half, ay - ny * half);
  graphics.closePath();
  graphics.fillPath();
}

/** Ucus ilerlemesi: telin kalan ucus suresinden (yerel saatte akiyor). */
export function getMekaShieldFlightProgress(remainingMs: number) {
  const total = MEKA_SHIELD_THROWER.flightMs / GAME_SPEED_MULTIPLIER;
  return Math.max(0, Math.min(1, 1 - remainingMs / total));
}

/** Kalkanin durdurdugu atisin kisa sert parlamasi (siperin isareti, kalkanin uzerinde). */
export const MEKA_IMPACT_MS = 300;
const MEKA_IMPACT_SLOTS = 12;

export class MekaShieldImpacts {
  private readonly xs = new Float64Array(MEKA_IMPACT_SLOTS);
  private readonly ys = new Float64Array(MEKA_IMPACT_SLOTS);
  private readonly ux = new Float64Array(MEKA_IMPACT_SLOTS);
  private readonly uy = new Float64Array(MEKA_IMPACT_SLOTS);
  private readonly at = new Float64Array(MEKA_IMPACT_SLOTS).fill(Number.NEGATIVE_INFINITY);
  private next = 0;

  /** Kalkanin `along` (0..1) noktasinda parlama. */
  add(shield: { x1: number; y1: number; x2: number; y2: number }, along: number, now: number) {
    const dx = shield.x2 - shield.x1;
    const dy = shield.y2 - shield.y1;
    const length = Math.hypot(dx, dy);
    if (!(length > 0) || !Number.isFinite(along)) return;
    const slot = this.next;
    this.xs[slot] = shield.x1 + dx * along;
    this.ys[slot] = shield.y1 + dy * along;
    this.ux[slot] = dx / length;
    this.uy[slot] = dy / length;
    this.at[slot] = now;
    this.next = (slot + 1) % MEKA_IMPACT_SLOTS;
  }

  active(now: number) {
    for (let index = 0; index < MEKA_IMPACT_SLOTS; index += 1) if (now - this.at[index] < MEKA_IMPACT_MS) return true;
    return false;
  }

  draw(graphics: Phaser.GameObjects.Graphics, cellSize: number, now: number, reducedMotion: boolean) {
    for (let index = 0; index < MEKA_IMPACT_SLOTS; index += 1) {
      const age = now - this.at[index];
      if (!(age >= 0 && age < MEKA_IMPACT_MS)) continue;
      const life = 1 - age / MEKA_IMPACT_MS;
      const x = this.xs[index];
      const y = this.ys[index];
      const ux = this.ux[index];
      const uy = this.uy[index];
      const nx = -uy;
      const ny = ux;
      const half = cellSize * 0.3;
      graphics.lineStyle(2.5, MEKA_SHIELD_EDGE_COLOR, life);
      graphics.lineBetween(x - ux * half, y - uy * half, x + ux * half, y + uy * half);
      const r = cellSize * 0.16 * (reducedMotion ? 1 : 1 + (1 - life) * 0.7);
      graphics.lineStyle(1.4, MEKA_SHIELD_RIM_COLOR, 0.9 * life);
      graphics.lineBetween(x + nx * r, y + ny * r, x + ux * r, y + uy * r);
      graphics.lineBetween(x + ux * r, y + uy * r, x - nx * r, y - ny * r);
      graphics.lineBetween(x - nx * r, y - ny * r, x - ux * r, y - uy * r);
      graphics.lineBetween(x - ux * r, y - uy * r, x + nx * r, y + ny * r);
    }
  }
}

/**
 * Yer altindaki kazicinin izi: yerin hafifce kabarmasi (koyu kirik toprak
 * parcalari). Konum yer altindaki konumu takip ediyor; LOD dusukken yok.
 */
export function drawBurrowFurrow(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, seed: number, { now, reducedMotion }: DrawOptions) {
  const radius = Math.max(5, size * 0.32);
  const shift = reducedMotion ? 0 : Math.floor(now / 140);
  graphics.lineStyle(1.2, BURROW_DUST_COLOR, 0.45);
  graphics.strokeEllipse(x, y, radius * 1.8, radius * 1.0);
  for (let index = 0; index < 7; index += 1) {
    const n = noise(seed + index * 7 + shift);
    const angle = n * Math.PI * 2;
    const r = radius * (0.25 + noise(seed + index * 3 + shift) * 0.75);
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r * 0.6;
    const chunk = Math.max(2, size * 0.09);
    graphics.fillStyle(index % 2 === 0 ? BURROW_CRACK_EDGE_COLOR : BURROW_DUST_COLOR, 0.6);
    graphics.fillRect(px - chunk / 2, py - chunk / 2, chunk, chunk);
  }
}

/**
 * Cikis catlaklari: hucrenin ortasindan kirik cizgiler, uyari ilerledikce
 * uzuyor ve kalinlasiyor; kenarlari isik alan toprak. Herkes goruyor.
 */
export function drawBurrowCracks(graphics: Phaser.GameObjects.Graphics, x: number, y: number, cellSize: number, progress: number, seed: number) {
  const p = Math.max(0, Math.min(1, progress));
  const arms = 5;
  const reach = cellSize * (0.22 + 0.3 * p);
  // Hucrenin kenari: kirik zemin hangi karede, uzaktan da secilsin (koseli, sert).
  graphics.lineStyle(1.2, BURROW_CRACK_EDGE_COLOR, 0.25 + 0.4 * p);
  graphics.strokeRect(x - cellSize * 0.46, y - cellSize * 0.46, cellSize * 0.92, cellSize * 0.92);
  graphics.fillStyle(BURROW_CRACK_COLOR, 0.25 + 0.35 * p);
  graphics.fillRect(x - cellSize * 0.12, y - cellSize * 0.12, cellSize * 0.24, cellSize * 0.24);
  for (let arm = 0; arm < arms; arm += 1) {
    let angle = (arm / arms) * Math.PI * 2 + noise(seed + arm) * 0.8;
    let px = x;
    let py = y;
    const segments = 3;
    for (let segment = 0; segment < segments; segment += 1) {
      angle += (noise(seed + arm * 11 + segment) - 0.5) * 0.9;
      const length = (reach / segments) * (0.8 + noise(seed + arm * 5 + segment) * 0.4);
      const qx = px + Math.cos(angle) * length;
      const qy = py + Math.sin(angle) * length;
      graphics.lineStyle(Math.max(1, 2.6 * p * (1 - segment / segments) + 0.8), BURROW_CRACK_COLOR, 0.9);
      graphics.lineBetween(px, py, qx, qy);
      // Isik alan kenar: koyu zeminde de okunsun diye catlagin asil gorunen kismi.
      graphics.lineStyle(1.4, BURROW_CRACK_EDGE_COLOR, 0.5 + 0.4 * p);
      graphics.lineBetween(px + 1, py + 1, qx + 1, qy + 1);
      px = qx;
      py = qy;
    }
  }
}

/** Ruh cekicinin yigin kertikleri: govdenin ustunde, yigin basina bir kucuk kare (beserli iki sira). */
export function drawSoulDrawerMark(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, stacks: number) {
  const radius = Math.max(7, size * 0.5);
  // Cekici her zaman bir ince halkayla secilsin: "once bunu oldur".
  graphics.lineStyle(1.2, SOUL_MARK_COLOR, 0.75);
  graphics.strokeCircle(x, y, radius + 2);
  if (!(stacks > 0)) return;
  const pip = Math.max(2, size * 0.075);
  const gap = pip * 0.6;
  for (let index = 0; index < stacks; index += 1) {
    const row = index < 5 ? 0 : 1;
    const column = index % 5;
    const px = x - (5 * pip + 4 * gap) / 2 + column * (pip + gap);
    const py = y - radius - 6 - row * (pip + gap);
    graphics.fillStyle(SOUL_WISP_COLOR, 0.9);
    graphics.fillRect(px, py, pip, pip);
  }
}

/**
 * Faz: govdenin iki yaninda sert kenarli kaydirilmis hayalet (kare cerceve),
 * kaydirma 90 ms'lik basamaklarla (titreme degil, kesik atlama). Govdenin
 * kendisi cagiranda yari saydam.
 */
export function drawPhaseGhost(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, seed: number, { now, reducedMotion }: DrawOptions) {
  const half = Math.max(6, size * 0.42);
  const step = reducedMotion ? 0 : Math.floor(now / 90);
  const offset = size * (0.1 + 0.08 * noise(seed + step));
  for (const sign of [-1, 1]) {
    const gx = x + sign * offset;
    graphics.lineStyle(1.4, PHASE_GHOST_COLOR, sign < 0 ? 0.75 : 0.45);
    graphics.strokeRect(gx - half, y - half, half * 2, half * 2);
  }
  graphics.lineStyle(1, PHASE_GHOST_COLOR, 0.5);
  graphics.lineBetween(x - half - offset, y, x + half + offset, y);
}

/**
 * Katlanma uyarisi: hedef hucrede dort kose ayraci iceri dogru daraliyor,
 * ortada sicramaya kalan sureyle dolan kare.
 */
export function drawFoldWarning(graphics: Phaser.GameObjects.Graphics, x: number, y: number, cellSize: number, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const half = cellSize * (0.5 - 0.18 * p);
  const arm = half * 0.45;
  graphics.lineStyle(1.8, FOLD_MARK_COLOR, 0.55 + 0.4 * p);
  for (let corner = 0; corner < 4; corner += 1) {
    const sx = corner & 1 ? 1 : -1;
    const sy = corner & 2 ? 1 : -1;
    const cx = x + sx * half;
    const cy = y + sy * half;
    graphics.lineBetween(cx, cy, cx - sx * arm, cy);
    graphics.lineBetween(cx, cy, cx, cy - sy * arm);
  }
  const core = cellSize * 0.14 * p;
  graphics.fillStyle(FOLD_MARK_COLOR, 0.7);
  graphics.fillRect(x - core, y - core, core * 2, core * 2);
}

// --- Gecici efektler ---------------------------------------------------------------

type TransientKind = 0 | 1 | 2 | 3;
/** Kazma tozu, cikis patlamasi, katlanma kirisigi, ruh izi. */
export const RACE_TRANSIENT = { dig: 0, emerge: 1, fold: 2, wisp: 3 } as const;
const TRANSIENT_MS: readonly number[] = [420, 460, 280, 620];
const TRANSIENT_SLOTS = 32;

/**
 * Sabit halkada gecici irk efektleri. Ruh izinin ucu cekicinin canli
 * konumunu `resolve` ile okuyor (cekici yururken iz onu izliyor).
 */
export class RaceTransientEffects {
  private readonly kind = new Uint8Array(TRANSIENT_SLOTS);
  private readonly xs = new Float64Array(TRANSIENT_SLOTS);
  private readonly ys = new Float64Array(TRANSIENT_SLOTS);
  private readonly dxs = new Float64Array(TRANSIENT_SLOTS);
  private readonly dys = new Float64Array(TRANSIENT_SLOTS);
  private readonly at = new Float64Array(TRANSIENT_SLOTS).fill(Number.NEGATIVE_INFINITY);
  private readonly targets: (string | undefined)[] = new Array(TRANSIENT_SLOTS);
  private next = 0;

  /** `dx`/`dy`: katlanmada sicrama yonu; ruh izinde son bilinen hedef konumu. */
  add(kind: TransientKind, x: number, y: number, now: number, dx = 0, dy = 0, target?: string) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const slot = this.next;
    this.kind[slot] = kind;
    this.xs[slot] = x;
    this.ys[slot] = y;
    this.dxs[slot] = dx;
    this.dys[slot] = dy;
    this.targets[slot] = target;
    this.at[slot] = now;
    this.next = (slot + 1) % TRANSIENT_SLOTS;
  }

  active(now: number) {
    for (let index = 0; index < TRANSIENT_SLOTS; index += 1) {
      if (now - this.at[index] < TRANSIENT_MS[this.kind[index]]) return true;
    }
    return false;
  }

  clear() {
    this.at.fill(Number.NEGATIVE_INFINITY);
  }

  draw(
    graphics: Phaser.GameObjects.Graphics,
    cellSize: number,
    now: number,
    options: { reducedMotion: boolean; resolve?: (id: string) => { x: number; y: number } | undefined }
  ) {
    for (let index = 0; index < TRANSIENT_SLOTS; index += 1) {
      const kind = this.kind[index];
      const age = now - this.at[index];
      const span = TRANSIENT_MS[kind];
      if (!(age >= 0 && age < span)) continue;
      const t = age / span;
      const life = 1 - t;
      const x = this.xs[index];
      const y = this.ys[index];
      const motion = options.reducedMotion ? 0.5 : t;
      if (kind === RACE_TRANSIENT.dig || kind === RACE_TRANSIENT.emerge) {
        const emerge = kind === RACE_TRANSIENT.emerge;
        const ring = cellSize * (emerge ? 0.3 + 0.55 * motion : 0.25 + 0.4 * motion);
        graphics.lineStyle(emerge ? 2.2 : 1.6, BURROW_DUST_COLOR, 0.7 * life);
        graphics.strokeEllipse(x, y, ring * 2, ring * 1.2);
        const chunks = emerge ? 8 : 6;
        for (let chunk = 0; chunk < chunks; chunk += 1) {
          const angle = (chunk / chunks) * Math.PI * 2 + noise(index * 31 + chunk) * 0.6;
          const reach = ring * (emerge ? 1.15 : 0.9);
          const size = Math.max(1.5, cellSize * (emerge ? 0.09 : 0.06)) * (0.6 + 0.4 * life);
          graphics.fillStyle(chunk % 3 === 0 ? BURROW_CRACK_EDGE_COLOR : BURROW_CRACK_COLOR, 0.85 * life);
          graphics.fillRect(x + Math.cos(angle) * reach - size / 2, y + Math.sin(angle) * reach * 0.6 - size / 2, size, size);
        }
        if (emerge) drawBurrowCracks(graphics, x, y, cellSize, life, index * 17);
      } else if (kind === RACE_TRANSIENT.fold) {
        // Kirisik: sicrama yonune dik uc kisa paralel cizgi, merkeze dogru siklasiyor.
        const length = Math.hypot(this.dxs[index], this.dys[index]);
        const ux = length > 0 ? this.dxs[index] / length : 0;
        const uy = length > 0 ? this.dys[index] / length : 1;
        const nx = -uy;
        const ny = ux;
        const half = cellSize * 0.45;
        const spacing = cellSize * 0.16 * (1 - motion * 0.7);
        graphics.lineStyle(1.6, FOLD_MARK_COLOR, 0.9 * life);
        for (let line = -1; line <= 1; line += 1) {
          const cx = x + ux * spacing * line;
          const cy = y + uy * spacing * line;
          graphics.lineBetween(cx - nx * half, cy - ny * half, cx + nx * half, cy + ny * half);
        }
      } else {
        const target = this.targets[index];
        const live = target ? options.resolve?.(target) : undefined;
        const tx = live?.x ?? this.dxs[index];
        const ty = live?.y ?? this.dys[index];
        const head = Math.min(1, t * 1.6);
        const hx = x + (tx - x) * head;
        const hy = y + (ty - y) * head;
        graphics.lineStyle(1, SOUL_WISP_COLOR, 0.5 * life);
        graphics.lineBetween(x, y, hx, hy);
        const square = Math.max(1.5, cellSize * 0.07);
        graphics.fillStyle(SOUL_WISP_COLOR, 0.85 * life);
        graphics.fillRect(hx - square / 2, hy - square / 2, square, square);
      }
    }
  }
}

/** Kazicinin cikis hucresindeki uyari evresinin uzunlugu (duvar saati ms). */
export function getBurrowTelegraphWallMs() {
  return BUG_BURROWER.telegraphMs / GAME_SPEED_MULTIPLIER;
}
