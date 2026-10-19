import type { EnemyRace } from "../combat.js";
import { GAME_SPEED_MULTIPLIER } from "../tower-stats/index.js";

/**
 * Irk mekanikleri: her irkin kendine ozgu bir davranisi.
 *
 * | irk | mekanik | kim |
 * | golem | Taslasma: her dogrudan vurus +1 zirh (kalici, +200 tavan) | butun golemler (sampiyon dahil) |
 * | meka | Kalkan atici: kuleye 2 hucre kalkan firlatir, atislari keser | yer mekalarinin ~%25'i |
 * | uzay bocegi | Kazici: bir kez yer altina girip 4-7 satir ileride cikar | yer boceklerinin ~%15'i |
 * | dusmus | Ruh cekici: yakinda olen dusmustan yigin (can, hiz, boy) | ~%20 |
 * | 4. boyut | Faz kaymasi (~%25) ya da katlanma sicramasi (~%20) | ikisi birden asla |
 *
 * Butun sayilar burada; sunucu, istemci ve testler ayni tablodan okuyor.
 * Sureler oyun suresi (ms): sunucu `scaleGameDuration` ile duvar saatine
 * ceviriyor. Mesafeler hucre cinsinden.
 *
 * Ozellik dagitimi dogumun parcasi: dusmanin sira numarasi ve odanin patern
 * tohumundan turetilen bir karma; `Math.random` cekilmiyor, yani oteki zar
 * akislari kaymiyor. Sampiyon ve ozel dusman (golem haric) ozellik almiyor.
 */
export type RaceTrait = "thrower" | "burrower" | "drawer" | "phaser" | "folder";

export const RACE_TRAITS: readonly RaceTrait[] = ["thrower", "burrower", "drawer", "phaser", "folder"];

/** Tel kodu (`rt`): ozelliksiz dusmanda alan hic yok. */
export const RACE_TRAIT_CODES: Readonly<Record<RaceTrait, number>> = { thrower: 1, burrower: 2, drawer: 3, phaser: 4, folder: 5 };

const TRAIT_BY_CODE: readonly (RaceTrait | undefined)[] = [undefined, "thrower", "burrower", "drawer", "phaser", "folder"];

/** Tel kodundan ozellik; bilinmeyen ya da eksik kod `undefined` (eski/yeni surum farki). */
export function decodeRaceTrait(code: unknown): RaceTrait | undefined {
  return typeof code === "number" && Number.isInteger(code) ? TRAIT_BY_CODE[code] : undefined;
}

/** Ozelligin ait oldugu irk (kodeks ve bildirim icin). */
export const RACE_TRAIT_RACE: Readonly<Record<RaceTrait, EnemyRace>> = {
  thrower: "meka",
  burrower: "spaceBug",
  drawer: "fallen",
  phaser: "fourthDimensional",
  folder: "fourthDimensional"
};

// --- Golem: Taslasma ---------------------------------------------------------------

/**
 * Her dogrudan hasar ani (mermi, isin tiki, alan vurusu, yetenek) golemin
 * zirhina +1 ekliyor; azalmiyor, taban zirhin ustune en fazla +200. Durum
 * tikleri (yanik, kanama, zehir: `status:` kaynakli) sayilmiyor. Zirh
 * `100 / (100 + zirh)` ile carpiyor: cok sik vuran kule (Debug Lazer) agir
 * ve seyrek vurandan cok daha fazla eriyor.
 */
export const GOLEM_PETRIFY = {
  armorPerHit: 1,
  maxStacks: 200
} as const;

/**
 * Hasar kaynagi Taslasma yigini veriyor mu. Durum tikleri (`status:burn`,
 * `status:bleed`, ileride zehir) ve Zeynep'in yanan zemin tiki
 * (`zeynep-3-burn`, alan uzerinde sureli hasar) sayilmiyor; mermi, isin
 * tiki, alan vurusu, yetenek ve ulti sayiliyor.
 */
export function countsAsGolemPetrifyHit(sourceDefinitionId: string) {
  return !sourceDefinitionId.startsWith("status:") && sourceDefinitionId !== "zeynep-3-burn";
}

/** Bir vurustan sonra yigin (tavanda durur). */
export function addGolemPetrifyStack(stacks: number) {
  const current = Number.isFinite(stacks) ? Math.max(0, Math.floor(stacks)) : 0;
  return Math.min(GOLEM_PETRIFY.maxStacks, current + 1);
}

// --- Meka: Kalkan atici ------------------------------------------------------------

export const MEKA_SHIELD_THROWER = {
  share: 0.25,
  /** Saldiran kuleye bu kadar hucre yakinlasinca atiyor. */
  triggerRangeCells: 4,
  /** Kalkan atandan kuleye dogru bu kadar hucre ucup iniyor. */
  throwDistanceCells: 2,
  /** Kalkanin boyu (hucre), atis yonune dik, inis noktasinda ortali. */
  lengthCells: 2,
  /** Havadaki yol (oyun ms); bu surede kalkan henuz atis kesmiyor. */
  flightMs: 400,
  /** Indikten sonra omru (oyun ms). */
  lifetimeMs: 3000,
  /** Atandan atana bekleme (oyun ms), atis anindan. */
  cooldownMs: 8000,
  /** Hazir atici yakin kuleyi bu araliktan sik aramiyor (oyun ms). */
  checkIntervalMs: 200
} as const;

/**
 * Inmis meka kalkaninin cizimi (race-traits `drawMekaShield`): koyu govde
 * cizginin iki yaninda `max(2, kare x 0,075) + 1`, iki uzun kenarinda
 * `max(1, yarim x 0,5)` kalinliginda kenar cizgisi (merkezi govdenin
 * kenarinda). Sunucu mermiyi cizilen yuzde durduruyor (`getMekaShieldFace`):
 * ikisi ayni sayilardan.
 */
export const MEKA_SHIELD_DRAWN = { halfRatio: 0.075, minHalf: 2, frame: 1, rimRatio: 0.5, minRim: 1 } as const;

/** Kalkanin cizilen yari kalinligi (kenar cizgisinin merkezine kadar, dunya birimi). */
export function getMekaShieldDrawnHalf(cellSize: number) {
  return Math.max(MEKA_SHIELD_DRAWN.minHalf, cellSize * MEKA_SHIELD_DRAWN.halfRatio);
}

/** Kenar cizgisinin kalinligi. */
export function getMekaShieldRimWidth(cellSize: number) {
  return Math.max(MEKA_SHIELD_DRAWN.minRim, getMekaShieldDrawnHalf(cellSize) * MEKA_SHIELD_DRAWN.rimRatio);
}

/** Cizginin merkezinden kalkanin cizilen yuzune (kenar cizgisinin dis yani): mermi burada duruyor. */
export function getMekaShieldFace(cellSize: number) {
  return getMekaShieldDrawnHalf(cellSize) + MEKA_SHIELD_DRAWN.frame + getMekaShieldRimWidth(cellSize) / 2;
}

export type MekaShieldGeometry = { cx: number; cy: number; x1: number; y1: number; x2: number; y2: number };

/**
 * Kalkanin inis noktasi ve parcasi. Atandan kuleye 2 hucre; kule daha
 * yakinsa kulenin yarim hucre onunde iniyor (kalkan kulenin arkasina
 * dusmesin). Parca atis yonune dik, 2 hucre boyunda, inis noktasinda
 * ortali; atis capraz gelirse parca da capraz.
 */
export function getMekaShieldGeometry(fromX: number, fromY: number, towerX: number, towerY: number, cellSize: number): MekaShieldGeometry | undefined {
  const dx = towerX - fromX;
  const dy = towerY - fromY;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0) || !(cellSize > 0)) return undefined;
  const ux = dx / distance;
  const uy = dy / distance;
  const travel = Math.min(MEKA_SHIELD_THROWER.throwDistanceCells * cellSize, Math.max(cellSize * 0.5, distance - cellSize * 0.5));
  const cx = fromX + ux * travel;
  const cy = fromY + uy * travel;
  const half = (MEKA_SHIELD_THROWER.lengthCells * cellSize) / 2;
  // Dik yon: (-uy, ux).
  return { cx, cy, x1: cx - uy * half, y1: cy + ux * half, x2: cx + uy * half, y2: cy - ux * half };
}

/**
 * Atis hatti (A->B) bir parcayi (C-D) kesiyor mu; kesiyorsa A->B uzerindeki
 * parametre (0..1). Paralel ya da degmeyen hat `undefined`. Tahsis yok.
 */
export function getSegmentCrossingT(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): number | undefined {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denominator = rx * sy - ry * sx;
  if (denominator === 0) return undefined;
  const qx = cx - ax;
  const qy = cy - ay;
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : undefined;
}

/** Sahadaki meka kalkani (tel). `f`: havadaki kalan ms ve atis noktasi `ox`/`oy` (yalnizca ucarken). */
export type MekaShieldSnapshot = {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Indikten sonra kalan omur (ucarken tam omur). */
  ms: number;
  f?: number;
  ox?: number;
  oy?: number;
};

/** `race:block`: meka kalkaninin durdurdugu atislar; `a` parca boyunca 0..1 konum. */
export type MekaShieldBlockMessage = { id: number; a: number[] };

// --- Uzay bocegi: Kazici -----------------------------------------------------------

export const BUG_BURROWER = {
  share: 0.15,
  /** Bu satira varinca ya da `digDelayMs` dolunca kaziyor (hangisi once). */
  digRow: 1,
  digDelayMs: 1500,
  /** Yer altindaki yol (oyun ms). */
  undergroundMs: 3500,
  /** Kazdigi satirdan bu kadar satir ileride cikiyor. */
  emergeMinRows: 4,
  emergeMaxRows: 7,
  /** Nexus satirinin bu kadar satir yakininda asla cikmiyor. */
  nexusClearRows: 2,
  /** Kenarlardan en az bu kadar hucre iceride cikiyor. */
  edgeMarginCells: 1,
  /** Cikistan bu kadar once cikis hucresinde catlaklar (herkes gorur). */
  telegraphMs: 1500
} as const;

export type RaceGridCell = { col: number; row: number };

/**
 * Catlak uyarisinin basladigi an (duvar saati, sunucu saatiyle ayni olcek):
 * cikis anindan oyun suresiyle 1,5 sn once. Telde yalnizca cikis ani gidiyor.
 */
export function getBurrowTelegraphStart(emergeAt: number) {
  return emergeAt - BUG_BURROWER.telegraphMs / GAME_SPEED_MULTIPLIER;
}

/** Cikis hucresinin sinirlari (dahil). Satir araligi bossa `undefined`. */
export function getBurrowEmergenceBounds(cols: number, rows: number) {
  const margin = BUG_BURROWER.edgeMarginCells;
  const minCol = margin;
  const maxCol = Math.floor(cols) - 1 - margin;
  const minRow = margin;
  // Nexus satiri `rows - 1`; "2 satir yakininda degil" = en az 3 satir uzakta.
  const maxRow = Math.min(Math.floor(rows) - 1 - margin, Math.floor(rows) - 1 - (BUG_BURROWER.nexusClearRows + 1));
  if (maxCol < minCol || maxRow < minRow) return undefined;
  return { minCol, maxCol, minRow, maxRow };
}

/**
 * Kazicinin cikis hucresi. Satir: kazdigi satirdan 4-7 ileride (zar),
 * sinira kirpili; sutun: zarla, kenar payi icinde. Hucre doluysa (yapi)
 * sinirlar icinde en yakin bos hucre; hic yoksa `undefined` (kazdigi yerde
 * cikar). `random` kazicinin kendi zari.
 */
export function pickBurrowEmergence(input: {
  row: number;
  cols: number;
  rows: number;
  random: () => number;
  isFree: (col: number, row: number) => boolean;
}): RaceGridCell | undefined {
  const bounds = getBurrowEmergenceBounds(input.cols, input.rows);
  if (!bounds) return undefined;
  const span = BUG_BURROWER.emergeMaxRows - BUG_BURROWER.emergeMinRows + 1;
  const forward = BUG_BURROWER.emergeMinRows + Math.min(span - 1, Math.floor(input.random() * span));
  const row = Math.max(bounds.minRow, Math.min(bounds.maxRow, Math.floor(input.row) + forward));
  const colSpan = bounds.maxCol - bounds.minCol + 1;
  const col = bounds.minCol + Math.min(colSpan - 1, Math.floor(input.random() * colSpan));
  return findNearestFreeCell(col, row, bounds, input.isFree);
}

/**
 * Sinirlar icinde en yakin bos hucre: once kendisi, sonra halka halka
 * (Chebyshev), halkada oklid mesafesine gore; esitlikte satir, sonra sutun
 * sirasi (belirlenimli).
 */
export function findNearestFreeCell(
  col: number,
  row: number,
  bounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  isFree: (col: number, row: number) => boolean
): RaceGridCell | undefined {
  const inside = (c: number, r: number) => c >= bounds.minCol && c <= bounds.maxCol && r >= bounds.minRow && r <= bounds.maxRow;
  if (inside(col, row) && isFree(col, row)) return { col, row };
  const maxRing = Math.max(bounds.maxCol - bounds.minCol, bounds.maxRow - bounds.minRow) + 1;
  for (let ring = 1; ring <= maxRing; ring += 1) {
    let best: RaceGridCell | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let r = row - ring; r <= row + ring; r += 1) {
      for (let c = col - ring; c <= col + ring; c += 1) {
        if (Math.max(Math.abs(c - col), Math.abs(r - row)) !== ring || !inside(c, r)) continue;
        const distance = (c - col) * (c - col) + (r - row) * (r - row);
        if (distance >= bestDistance || !isFree(c, r)) continue;
        best = { col: c, row: r };
        bestDistance = distance;
      }
    }
    if (best) return best;
  }
  return undefined;
}

// --- Dusmus: Ruh cekici ------------------------------------------------------------

export const FALLEN_SOUL_DRAWER = {
  share: 0.2,
  /** Bu yaricapta (hucre) olen dusmus yigin veriyor. */
  radiusCells: 2.5,
  /** Yigin basina: azami can (ayni kadar iyilesme), yurume hizi ve boy. */
  hpPerStack: 0.08,
  speedPerStack: 0.04,
  sizePerStack: 0.06,
  maxStacks: 10
} as const;

/** Yigina gore carpanlar (taban degerlere gore). */
export function getSoulDrawerMultipliers(stacks: number) {
  const n = Number.isFinite(stacks) ? Math.max(0, Math.min(FALLEN_SOUL_DRAWER.maxStacks, Math.floor(stacks))) : 0;
  return {
    hp: 1 + n * FALLEN_SOUL_DRAWER.hpPerStack,
    speed: 1 + n * FALLEN_SOUL_DRAWER.speedPerStack,
    size: 1 + n * FALLEN_SOUL_DRAWER.sizePerStack
  };
}

/** `race:soul`: olen dusmustan ruh cekiciye ince ruh izi. */
export type RaceSoulDrawMessage = { x: number; y: number; to: string; n: number };

// --- 4. boyut: Faz kaymasi ve katlanma sicramasi -----------------------------------

export const FOURTH_PHASE_SHIFT = {
  share: 0.25,
  /** Her bu kadar oyun ms'de bir (fazin basindan basina). Ilk faz dogumdan bu kadar sonra. */
  intervalMs: 6000,
  /** Fazda kalma suresi: hedeflenemez, hasar almaz, yari saydam, yurumeye devam. */
  durationMs: 1500
} as const;

export const FOURTH_FOLD_JUMP = {
  share: 0.2,
  /** Sicramalar arasi (oyun ms). Ilk sicrama dogumdan bu kadar sonra. */
  intervalMs: 7000,
  /** Gezinme yonunde bu kadar hucre ileri. */
  distanceCells: 3,
  /** Sicramadan bu kadar once hedefte uyari isareti. */
  warningMs: 800,
  /** Nexus satirinin bu kadar satir yakinina asla sicramiyor. */
  nexusClearRows: 1
} as const;

/** Gezinme yonu: hucre adimi (-1/0/1). Bilinmiyorsa asagi (nexusa dogru). */
export function getFoldDirection(step: { fromCol: number; fromRow: number; toCol: number; toRow: number } | undefined) {
  if (!step) return { dc: 0, dr: 1 };
  const dc = Math.sign(step.toCol - step.fromCol);
  const dr = Math.sign(step.toRow - step.fromRow);
  return dc === 0 && dr === 0 ? { dc: 0, dr: 1 } : { dc, dr };
}

/**
 * Katlanma hedefi: gezinme yonunde 3 hucre; hedef yapi doluysa, haritanin
 * disindaysa ya da nexusa fazla yakinsa 2, sonra 1 hucre deneniyor. Hat bir
 * Metal Kalkan'i kesiyorsa sicrama iptal (kisaltma yok). Hic olmuyorsa
 * `undefined`.
 */
export function pickFoldDestination(input: {
  col: number;
  row: number;
  dc: number;
  dr: number;
  cols: number;
  rows: number;
  isFree: (col: number, row: number) => boolean;
  crossesShield: (toCol: number, toRow: number) => boolean;
}): RaceGridCell | undefined {
  const maxRow = Math.floor(input.rows) - 1 - (FOURTH_FOLD_JUMP.nexusClearRows + 1);
  const full = { col: input.col + input.dc * FOURTH_FOLD_JUMP.distanceCells, row: input.row + input.dr * FOURTH_FOLD_JUMP.distanceCells };
  if (input.crossesShield(full.col, full.row)) return undefined;
  for (let distance = FOURTH_FOLD_JUMP.distanceCells; distance >= 1; distance -= 1) {
    const col = input.col + input.dc * distance;
    const row = input.row + input.dr * distance;
    if (col < 0 || col >= input.cols || row < 0 || row > maxRow) continue;
    if (!input.isFree(col, row)) continue;
    return { col, row };
  }
  return undefined;
}

// --- Dagitim -----------------------------------------------------------------------

/** 32 bit karma (FNV-1a benzeri karistirma); tohum + sira numarasindan ozellik tohumu. */
export function hashRaceTraitSeed(matchSeed: number, serial: number) {
  let h = (Math.floor(matchSeed) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (Math.floor(serial) >>> 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Ozelligin kendi zari (mulberry32). Oda zarindan bagimsiz. */
export function createRaceRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dogumda ozellik zari. Sampiyon ve ozel dusman hic almiyor. Kalkan atici,
 * kazici ve katlanan yalnizca yerde (ucan bir kazici ya da yol yonunde
 * sicrayan ucan dusman anlamsiz); faz ve ruh cekici ucanda da olabilir.
 * 4. boyutta tek zar: once faz payi, sonra katlanma payi; ikisi birden asla.
 */
export function rollRaceTrait(race: EnemyRace, input: { seed: number; champion?: boolean; special?: boolean; air?: boolean }): RaceTrait | undefined {
  if (input.champion || input.special) return undefined;
  const roll = createRaceRandom(input.seed)();
  if (race === "meka") return !input.air && roll < MEKA_SHIELD_THROWER.share ? "thrower" : undefined;
  if (race === "spaceBug") return !input.air && roll < BUG_BURROWER.share ? "burrower" : undefined;
  if (race === "fallen") return roll < FALLEN_SOUL_DRAWER.share ? "drawer" : undefined;
  if (race === "fourthDimensional") {
    if (roll < FOURTH_PHASE_SHIFT.share) return "phaser";
    if (roll < FOURTH_PHASE_SHIFT.share + FOURTH_FOLD_JUMP.share) return input.air ? undefined : "folder";
  }
  return undefined;
}

/** Irkin bildirim/kodeks anahtari: her irkin bir mekanigi (golem tum golemlerde). */
export type RaceMechanicId = "petrify" | RaceTrait;

export const RACE_MECHANIC_IDS: readonly RaceMechanicId[] = ["petrify", "thrower", "burrower", "drawer", "phaser", "folder"];
