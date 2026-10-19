import { getSurgeBandSpan, getVerticalSurgeBand, projectOntoSurgeBand, type SurgeBandGeometry } from "./surge-absorption.js";

/**
 * Karsi atak cesitleri: tablo, dalga plani, yon geometrisi ve tel kodlari.
 *
 * Alti cesit, hepsi ayni yone bagimsiz serit geometrisini kullaniyor
 * (`surge-absorption.ts`): bir kalkis kenari, birim yol yonu, uzunluk ve
 * genislik. Bes cesit gectigi yapilari bir kez vuruyor (zirh delinir,
 * yalnizca yapilar); Siper dalgasi (`aegis`) hic vurmuyor, kulelerin
 * atislarini on cizgisinde durduruyor.
 *
 * Butun sayilar burada; sunucu, istemci ve testler ayni tablodan okuyor.
 * 1. asama hic degismiyor (plan zari atilmiyor).
 */
export type CounterSurgeKind = "band" | "lance" | "wall" | "sweep" | "slash" | "aegis";

export const COUNTER_SURGE_KINDS: readonly CounterSurgeKind[] = ["band", "lance", "wall", "sweep", "slash", "aegis"];

/**
 * Yol yonu: `down` ust kenardan asagi; `right` sol kenardan saga, `left` sag
 * kenardan sola; `downRight` sol ust koseden sag alt koseye, `downLeft` sag
 * ust koseden sol alt koseye (on cizgi yola dik).
 */
export type CounterSurgeTravel = "down" | "right" | "left" | "downRight" | "downLeft";

export type CounterSurgeKindSpec = {
  /** Yon ailesi: ustten, yandan (zarla taraf) ya da caprazdan (zarla kose). */
  route: "down" | "side" | "diagonal";
  /** Genislik, hucre (yola dik olculur). */
  widthCells: number;
  /** Kucuk haritada genislik haritanin yarisina kirpiliyor (perde, siper). */
  halfMapClamp: boolean;
  /** Haritayi gecme suresi, oyun suresi ms; 0: dalganin grunt yurume hizi (siper). */
  crossMs: number;
  /** Kalkistan once giris kenarindaki uyari, oyun suresi ms. */
  telegraphMs: number;
  /** `getCounterSurgeDamageRatio(wave)` carpani; 0 hasar yok. */
  damageMultiplier: number;
  /** Secilme agirligi. */
  weight: number;
  /** Cesidin acildigi asama. */
  firstStage: number;
};

/**
 * Cesit tablosu.
 *
 * | cesit | yol | genislik | gecis | uyari | hasar |
 * | band  | ustten | 3 sutun | 32 sn | 3 sn | x1,0 |
 * | lance | ustten | 1 sutun | 9 sn | 2,5 sn | x0,8 |
 * | wall  | ustten | 6 sutun (yari harita) | 60 sn | 4 sn | x1,0 |
 * | sweep | yandan | 3 satir | 26 sn | 3 sn | x1,0 |
 * | slash | caprazdan | 3 hucre | 30 sn | 3 sn | x0,9 |
 * | aegis | ustten | 6 sutun (yari harita) | grunt hizi | 3 sn | yok |
 */
export const COUNTER_SURGE_KIND_TABLE: Readonly<Record<CounterSurgeKind, Readonly<CounterSurgeKindSpec>>> = {
  band: { route: "down", widthCells: 3, halfMapClamp: false, crossMs: 32_000, telegraphMs: 3000, damageMultiplier: 1, weight: 3, firstStage: 2 },
  lance: { route: "down", widthCells: 1, halfMapClamp: false, crossMs: 9000, telegraphMs: 2500, damageMultiplier: 0.8, weight: 3, firstStage: 2 },
  wall: { route: "down", widthCells: 6, halfMapClamp: true, crossMs: 60_000, telegraphMs: 4000, damageMultiplier: 1, weight: 2, firstStage: 2 },
  sweep: { route: "side", widthCells: 3, halfMapClamp: false, crossMs: 26_000, telegraphMs: 3000, damageMultiplier: 1, weight: 3, firstStage: 2 },
  slash: { route: "diagonal", widthCells: 3, halfMapClamp: false, crossMs: 30_000, telegraphMs: 3000, damageMultiplier: 0.9, weight: 2, firstStage: 3 },
  aegis: { route: "down", widthCells: 6, halfMapClamp: true, crossMs: 0, telegraphMs: 3000, damageMultiplier: 0, weight: 2, firstStage: 3 }
};

/** Karsi atagin basladigi asama ve dalga (2. asama, 4. dalga). */
export const COUNTER_SURGE_FIRST_STAGE = 2;
export const COUNTER_SURGE_FIRST_WAVE = 4;

/**
 * Dalga basina sayi: asamaya gore bir tane kesin, ikincisi bu olasilikla.
 * 2. asama 1; 3. asama 1 + %35; 4. asama 1 + %65; 5. asama 2.
 */
export const COUNTER_SURGE_SECOND_CHANCE_BY_STAGE: Readonly<Record<number, number>> = { 2: 0, 3: 0.35, 4: 0.65, 5: 1 };
/** Ayni anda haritada en fazla bu kadar serit; dolunca planlanan sonraki atlaniyor. */
export const COUNTER_SURGE_MAX_ACTIVE = 2;
/** Ayni anda en fazla bir siper. */
export const COUNTER_SURGE_MAX_ACTIVE_AEGIS = 1;

/**
 * Seridin dalganin hangi diliminde basladigi (gercek dogum sirasina gore).
 * Tek serit: %25-60. Iki serit: ilki %15-40, ikincisi %50-80 (ayri anlar).
 */
export const COUNTER_SURGE_START_MIN_SHARE = 0.25;
export const COUNTER_SURGE_START_SPAN_SHARE = 0.35;
export const COUNTER_SURGE_PAIR_WINDOWS: readonly (readonly [number, number])[] = [[0.15, 0.25], [0.5, 0.3]];

/** Yapinin azami canina gore hasar payi; dalgayla buyuyor (bkz. `getCounterSurgeDamageRatio`). */
export const COUNTER_SURGE_DAMAGE_RATIO_BASE = 0.45;
export const COUNTER_SURGE_DAMAGE_RATIO_PER_WAVE = 0.025;
export const COUNTER_SURGE_DAMAGE_RATIO_MAX = 0.9;

/**
 * Seridin basladigi dalgaya gore hasar payi (cesit carpanindan once). Serit
 * bu payi kalkarken aliyor ve bir sonraki dalgaya sarksa da onu koruyor.
 * 4. dalga %45, 12. dalga %65, 20. dalga %85, tavan %90.
 */
export function getCounterSurgeDamageRatio(wave: number) {
  const steps = Number.isFinite(wave) ? wave - COUNTER_SURGE_FIRST_WAVE : 0;
  const ratio = COUNTER_SURGE_DAMAGE_RATIO_BASE + COUNTER_SURGE_DAMAGE_RATIO_PER_WAVE * steps;
  return Math.max(COUNTER_SURGE_DAMAGE_RATIO_BASE, Math.min(COUNTER_SURGE_DAMAGE_RATIO_MAX, ratio));
}

/** Cesidin yapiya verdigi pay: dalganin orani x cesit carpani. */
export function getCounterSurgeKindDamageRatio(kind: CounterSurgeKind, wave: number) {
  return getCounterSurgeDamageRatio(wave) * COUNTER_SURGE_KIND_TABLE[kind].damageMultiplier;
}

/** Bu dalgada karsi atak olabilir mi (asama ve ilk dalga kapisi). */
export function isCounterSurgeWave(stage: number, wave: number) {
  return Math.floor(stage) >= COUNTER_SURGE_FIRST_STAGE && Math.floor(wave) >= COUNTER_SURGE_FIRST_WAVE;
}

/**
 * Dalgadaki serit sayisi; `roll` 0..1 zar (ikinci serit icin). Kapinin
 * altinda 0. 5. asamanin ustu 5. asamanin sayisi.
 */
export function getCounterSurgeCount(stage: number, wave: number, roll: number) {
  if (!isCounterSurgeWave(stage, wave)) return 0;
  const second = COUNTER_SURGE_SECOND_CHANCE_BY_STAGE[Math.min(5, Math.floor(stage))] ?? 0;
  return roll < second ? 2 : 1;
}

/** Asamada acik cesitler (tablo sirasiyla). */
export function getCounterSurgeKindsForStage(stage: number): CounterSurgeKind[] {
  const s = Math.floor(stage);
  if (!(s >= COUNTER_SURGE_FIRST_STAGE)) return [];
  return COUNTER_SURGE_KINDS.filter((kind) => s >= COUNTER_SURGE_KIND_TABLE[kind].firstStage);
}

/**
 * Cesidin haritaya sigdirilmis genisligi (hucre). Perde ve siper kucuk
 * haritada yari genislige kirpiliyor; yandan gelen satir sayisina, capraz
 * kisa kenara sigiyor.
 */
export function getCounterSurgeWidthCells(kind: CounterSurgeKind, cols: number, rows: number) {
  const spec = COUNTER_SURGE_KIND_TABLE[kind];
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  if (spec.route === "side") return Math.max(1, Math.min(spec.widthCells, r));
  if (spec.route === "diagonal") return Math.max(1, Math.min(spec.widthCells, c, r));
  const limit = spec.halfMapClamp ? Math.max(1, Math.floor(c / 2)) : c;
  return Math.max(1, Math.min(spec.widthCells, limit));
}

/**
 * Seridin vurabilecegi hucre araligi (dahil), genislik ekseninde: ustten
 * gelende sutunlar, yandan gelende satirlar. Yandan gelen serit ust (dogum)
 * ve alt (nexus) satira tasmiyor: oralarda yapi yok, serit bosa gecerdi.
 * Caprazda `undefined` (kaydirma `getCounterSurgeDiagonalOffsetLimit`ten).
 */
export function getCounterSurgeCellRange(kind: CounterSurgeKind, cols: number, rows: number, width: number) {
  const route = COUNTER_SURGE_KIND_TABLE[kind].route;
  if (route === "diagonal") return undefined;
  if (route === "side") {
    const r = Math.max(1, Math.floor(rows));
    const inner = r - width >= 2;
    return { lo: inner ? 1 : 0, hi: inner ? r - 2 : r - 1 };
  }
  return { lo: 0, hi: Math.max(0, Math.floor(cols) - 1) };
}

/**
 * Seridin kalkabilecegi ilk ve son serit indeksi (sutun ya da satir),
 * kirpilmadan once.
 *
 * Adil serit: baslangic, seridin hucre araligindan genisligin bir eksigi
 * kadar disari tasabiliyor ve sonra haritaya kirpiliyor
 * (`clipCounterSurgeLane`). Boylece her sutun (yandan gelende her satir)
 * tam `genislik` baslangic tarafindan ortuluyor: kenar sutunu ortadaki
 * kadar sik vuruluyor, yalnizca kenarda gorunen serit daha dar. Eskiden
 * baslangic yalnizca tam sigan konumlardan seciliyordu ve ortadaki sutun
 * kenardakinin uc-alti kati sik vuruluyordu.
 *
 * Caprazda indeks, ana kosegene gore kaydirma (hucre; eksi de olabilir).
 */
export function getCounterSurgeLaneRange(kind: CounterSurgeKind, cols: number, rows: number, width: number) {
  const range = getCounterSurgeCellRange(kind, cols, rows, width);
  if (!range) {
    const limit = getCounterSurgeDiagonalOffsetLimit(cols, rows, width);
    return { min: -limit, max: limit };
  }
  return { min: range.lo - (Math.max(1, Math.floor(width)) - 1), max: range.hi };
}

/**
 * Kirpilmamis baslangictan haritadaki serit: sol (ust) indeks ve gorunen
 * genislik. Caprazda kaydirma aynen, genislik aynen (cizim ve vurus
 * haritanin disini zaten gormuyor).
 */
export function clipCounterSurgeLane(kind: CounterSurgeKind, cols: number, rows: number, start: number, width: number) {
  const w = Math.max(1, Math.floor(width));
  const range = getCounterSurgeCellRange(kind, cols, rows, w);
  if (!range) {
    const limit = getCounterSurgeDiagonalOffsetLimit(cols, rows, w);
    return { lane: Math.max(-limit, Math.min(limit, quantizeDiagonalOffset(start))), width: w };
  }
  const from = Math.max(range.lo, Math.floor(start));
  const to = Math.min(range.hi, Math.floor(start) + w - 1);
  if (to < from) return { lane: Math.max(range.lo, Math.min(range.hi, Math.floor(start))), width: 1 };
  return { lane: from, width: to - from + 1 };
}

/** Capraz kaydirmanin cozunurlugu: hucre basina bu kadar adim (ceyrek hucre). */
export const COUNTER_SURGE_DIAGONAL_OFFSET_STEPS = 4;

function quantizeDiagonalOffset(value: number) {
  return Number.isFinite(value) ? Math.round(value * COUNTER_SURGE_DIAGONAL_OFFSET_STEPS) / COUNTER_SURGE_DIAGONAL_OFFSET_STEPS : 0;
}

/**
 * Capraz seridin ana kosegene gore en buyuk kaydirmasi (hucre, iki yone).
 *
 * Kosegene dik eksende hucre merkezlerinin en uzagi kose hucresi:
 * `R = (c*r - (c+r)/2) / hypot(c, r)`; sinir `K = R + genislik/2`.
 * Kaydirma `[-K, K]` icinde esit (ceyrek hucre adimiyla) secilince her
 * hucre merkezi `genislik / 2K` olasilikla seridin icinde kaliyor: ana
 * kosegen eskisi gibi her seferinde vurulmuyor, karsi koselerdeki hucreler
 * artik vurulabiliyor.
 */
export function getCounterSurgeDiagonalOffsetLimit(cols: number, rows: number, width: number) {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const reach = (c * r - (c + r) / 2) / Math.hypot(c, r);
  return Math.max(0, Math.ceil((reach + Math.max(1, width) / 2) * COUNTER_SURGE_DIAGONAL_OFFSET_STEPS) / COUNTER_SURGE_DIAGONAL_OFFSET_STEPS);
}

export type PlannedCounterSurge = {
  /** Gercek dogum sirasinda bu dogumla birlikte uyari basliyor. */
  atSpawn: number;
  kind: CounterSurgeKind;
  travel: CounterSurgeTravel;
  /**
   * Serit indeksi: ustten gelende sol sutun, yandan gelende ust satir;
   * caprazda ana kosegene gore kaydirma (hucre, eksi olabilir).
   */
  lane: number;
  /** Genislik, hucre: haritaya sigdirilmis ve kenarda kirpilmis (gorunen genislik). */
  width: number;
};

export type CounterSurgePlanInput = {
  stage: number;
  wave: number;
  /** Dalganin gercek dogum sayisi. */
  spawnCount: number;
  cols: number;
  rows: number;
  random: () => number;
};

function pickWeighted(pool: readonly CounterSurgeKind[], random: () => number) {
  const total = pool.reduce((sum, kind) => sum + COUNTER_SURGE_KIND_TABLE[kind].weight, 0);
  let roll = random() * total;
  for (const kind of pool) {
    roll -= COUNTER_SURGE_KIND_TABLE[kind].weight;
    if (roll < 0) return kind;
  }
  return pool[pool.length - 1];
}

function pickTravel(kind: CounterSurgeKind, roll: number): CounterSurgeTravel {
  const route = COUNTER_SURGE_KIND_TABLE[kind].route;
  if (route === "side") return roll < 0.5 ? "right" : "left";
  if (route === "diagonal") return roll < 0.5 ? "downRight" : "downLeft";
  return "down";
}

const OPPOSITE_TRAVEL: Readonly<Record<CounterSurgeTravel, CounterSurgeTravel>> = {
  down: "down", right: "left", left: "right", downRight: "downLeft", downLeft: "downRight"
};

/**
 * Dalganin karsi atak plani. Kapinin altinda bos (zar atilmiyor).
 *
 * Zar sirasi sabit: sayi, sonra serit basina cesit, yon, serit ve an. Iki
 * serit ayni dalgada cesitte ya da yonde ayrisiyor: ikincisinin havuzundan
 * ilkinin cesidi cikiyor; ancak yonu degisebilen cesit (yandan, capraz)
 * kalabiliyor ve o zaman ters yonden geliyor. Iki siper hic yok. Anlar
 * dalganin ayri dilimlerinde (`COUNTER_SURGE_PAIR_WINDOWS`), ikincisi hep sonra.
 */
export function planCounterSurges(input: CounterSurgePlanInput): PlannedCounterSurge[] {
  const stage = Math.floor(input.stage);
  const wave = Math.floor(input.wave);
  const spawnCount = Math.floor(input.spawnCount);
  if (!isCounterSurgeWave(stage, wave) || !(spawnCount >= 1)) return [];
  const random = input.random;
  const cols = Math.max(1, Math.floor(input.cols));
  const rows = Math.max(1, Math.floor(input.rows));
  let count = getCounterSurgeCount(stage, wave, random());
  // Iki ayri an icin en az iki dogum gerek.
  if (spawnCount < 2) count = Math.min(count, 1);
  const kinds = getCounterSurgeKindsForStage(stage);
  const planned: PlannedCounterSurge[] = [];
  for (let index = 0; index < count; index += 1) {
    const first = planned[0];
    const pool = first
      ? kinds.filter((kind) => kind !== first.kind || COUNTER_SURGE_KIND_TABLE[kind].route !== "down")
      : kinds;
    if (pool.length === 0) break;
    const kind = pickWeighted(pool, random);
    const travelRoll = random();
    const travel = first && first.kind === kind ? OPPOSITE_TRAVEL[first.travel] : pickTravel(kind, travelRoll);
    const fullWidth = getCounterSurgeWidthCells(kind, cols, rows);
    const range = getCounterSurgeLaneRange(kind, cols, rows, fullWidth);
    // Adil serit: kenara tasan baslangic kirpiliyor (bkz. `getCounterSurgeLaneRange`).
    // Caprazda kaydirma surekli (ceyrek hucreye yuvarli), digerlerinde tam sayi baslangic.
    const laneRoll = random();
    const start = COUNTER_SURGE_KIND_TABLE[kind].route === "diagonal"
      ? range.min + laneRoll * (range.max - range.min)
      : range.min + Math.floor(laneRoll * (range.max - range.min + 1));
    const clipped = clipCounterSurgeLane(kind, cols, rows, start, fullWidth);
    const lane = clipped.lane;
    const width = clipped.width;
    const [minShare, spanShare] = count === 1
      ? [COUNTER_SURGE_START_MIN_SHARE, COUNTER_SURGE_START_SPAN_SHARE]
      : COUNTER_SURGE_PAIR_WINDOWS[index];
    let atSpawn = Math.max(0, Math.min(spawnCount - 1, Math.floor(spawnCount * (minShare + spanShare * random()))));
    if (first && atSpawn <= first.atSpawn) atSpawn = Math.min(spawnCount - 1, first.atSpawn + 1);
    if (first && atSpawn <= first.atSpawn) break;
    planned.push({ atSpawn, kind, travel, lane, width });
  }
  return planned;
}

/**
 * Seridin dunya geometrisi (yon, kalkis kenarinin orta noktasi, uzunluk,
 * genislik). Ustten gelen bugunku seritle bire bir ayni (`getVerticalSurgeBand`).
 * Yandan gelen: `lane` ust satir, harita boyunca. Capraz: kose kosegeni
 * boyunca, on cizgi yola dik; ilerleme 0'da on cizgi kalkis kosesinden,
 * 1'de karsi koseden geciyor. Caprazda `lane` orta hattin ana kosegenden
 * kaydirmasi (hucre, `getCounterSurgeDiagonalOffsetLimit` icinde); serit
 * kismen haritanin disinda kalabiliyor, disarisi hicbir seyi vurmuyor.
 */
export function getCounterSurgeGeometry(
  travel: CounterSurgeTravel,
  lane: number,
  widthCells: number,
  origin: { x: number; y: number },
  gridSize: number,
  cols: number,
  rows: number,
  out?: SurgeBandGeometry
): SurgeBandGeometry {
  const band = out ?? { originX: 0, originY: 0, dirX: 0, dirY: 1, length: 0, width: 0 };
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const mapWidth = c * gridSize;
  const mapHeight = r * gridSize;
  const width = Math.max(1, widthCells) * gridSize;
  if (travel === "right" || travel === "left") {
    const row = Math.max(0, Math.min(r - Math.max(1, Math.floor(widthCells)), Math.floor(lane)));
    band.originX = travel === "right" ? origin.x : origin.x + mapWidth;
    band.originY = origin.y + row * gridSize + width / 2;
    band.dirX = travel === "right" ? 1 : -1;
    band.dirY = 0;
    band.length = mapWidth;
    band.width = width;
    return band;
  }
  if (travel === "downRight" || travel === "downLeft") {
    const length = Math.hypot(mapWidth, mapHeight);
    band.dirX = (travel === "downRight" ? mapWidth : -mapWidth) / length;
    band.dirY = mapHeight / length;
    // Kaydirma genislik ekseninde (dirY, -dirX): orta hat ana kosegene paralel
    // kayiyor, on cizgi ayni (haritanin yol eksenindeki izdusumu degismiyor).
    const limit = getCounterSurgeDiagonalOffsetLimit(c, r, widthCells);
    const offset = Number.isFinite(lane) ? Math.max(-limit, Math.min(limit, quantizeDiagonalOffset(lane))) * gridSize : 0;
    band.originX = (travel === "downRight" ? origin.x : origin.x + mapWidth) + band.dirY * offset;
    band.originY = origin.y - band.dirX * offset;
    band.length = length;
    band.width = width;
    return band;
  }
  const col = Math.max(0, Math.min(c - Math.max(1, Math.floor(widthCells)), Math.floor(lane)));
  const vertical = getVerticalSurgeBand(origin, gridSize, col, Math.max(1, Math.floor(widthCells)), r);
  if (!out) return vertical;
  band.originX = vertical.originX;
  band.originY = vertical.originY;
  band.dirX = vertical.dirX;
  band.dirY = vertical.dirY;
  band.length = vertical.length;
  band.width = vertical.width;
  return band;
}

/**
 * Yapi seridin genisligine biniyor mu. Eksene paralel seritte yapinin ayak
 * izi (yari genislik `halfW`, yari yukseklik `halfH`) genislik eksenine
 * izdusuruluyor: 0,5 birimden fazla bindiyse vuruluyor; ince kenar yapisi
 * (duvar, izdusumu 0) sinirda da sayiliyor. Bugunku dikey seridin kuralinin
 * aynisi. Caprazda yapinin merkezi genisligin icinde olmali.
 */
export function isStructureInSurgeWidth(band: SurgeBandGeometry, x: number, y: number, halfW: number, halfH: number) {
  const span = getSurgeBandSpan(band);
  const across = projectOntoSurgeBand(band, x, y).across;
  const diagonal = band.dirX !== 0 && band.dirY !== 0;
  const extent = diagonal ? 0 : Math.max(0, halfW) * Math.abs(band.dirY) + Math.max(0, halfH) * Math.abs(band.dirX);
  if (extent <= 0) return across >= span.from - 0.5 && across <= span.to + 0.5;
  return across + extent > span.from + 0.5 && across - extent < span.to - 0.5;
}

/**
 * Bir dogru parcasinin seridin on cizgisini (on cizgi konumunda, seridin tam
 * genisligi boyunca) kestigi parametre (0..1); kesmiyorsa `undefined`.
 *
 * Parcanin iki ucu on cizginin ayri yanlarinda olmali. `frontAtStart` ve
 * `frontAtEnd` uclarin olculdugu on cizgi konumu (yol, dunya birimi):
 * hareketsiz bir hat icin ikisi ayni; hareket eden mermi icin onceki ve
 * simdiki tikin on cizgisi (siper de ilerliyor). On cizginin tam ustundeki
 * nokta "arkada" sayiliyor. Siper atisi durdurmak icin bunu kullaniyor.
 */
export function getSurgeFrontCrossing(
  band: SurgeBandGeometry,
  frontAtStart: number,
  frontAtEnd: number,
  x1: number, y1: number, x2: number, y2: number
): number | undefined {
  const side1 = (x1 - band.originX) * band.dirX + (y1 - band.originY) * band.dirY - frontAtStart;
  const side2 = (x2 - band.originX) * band.dirX + (y2 - band.originY) * band.dirY - frontAtEnd;
  if ((side1 > 0) === (side2 > 0)) return undefined;
  const t = side1 / (side1 - side2);
  const across1 = x1 * band.dirY - y1 * band.dirX;
  const across2 = x2 * band.dirY - y2 * band.dirX;
  const across = across1 + (across2 - across1) * t;
  const centre = band.originX * band.dirY - band.originY * band.dirX;
  const half = band.width / 2;
  return across >= centre - half && across <= centre + half ? t : undefined;
}

/**
 * Siperin gecis suresi (oyun ms): harita boyu, dalganin grunt yurume hiziyla
 * (dunya birimi / oyun saniyesi). Dusmanlar arkasinda ilerleyebiliyor.
 */
export function getAegisCrossMs(lengthWorld: number, gruntSpeedPerSecond: number) {
  if (!(lengthWorld > 0) || !(gruntSpeedPerSecond > 0)) return COUNTER_SURGE_KIND_TABLE.band.crossMs;
  return (lengthWorld / gruntSpeedPerSecond) * 1000;
}

/**
 * Siperin on cizgileri (counter-surge `drawAegis`): on cizgide `rim`
 * kalinliginda soguk kenar, onunde `edgeOffset` uzakta `edge` kalinliginda
 * ince cizgi. Sunucu mermiyi cizilen yuzde durduruyor (`getAegisFrontFace`):
 * ikisi ayni sayilardan.
 */
export const AEGIS_FRONT_STROKES = { rim: 2.4, edgeOffset: 1.5, edge: 1 } as const;

/**
 * On cizgiden cizilen yuze (dunya birimi): sert kenarin (alfa 0,95) yarisi,
 * iki yanda. Onundeki ince cizgi (alfa 0,55) soluk bir parilti, govde degil
 * (mermilerin olcumundeki esik: alfa >= 0,6).
 */
export function getAegisFrontFace() {
  return AEGIS_FRONT_STROKES.rim / 2;
}

/**
 * Siperin govdesi ve uclarindaki iki direk (counter-surge `drawAegis`):
 * govde on cizginin `bodyCells` kare gerisine kadar (yari saydam, alfa
 * 0,5-0,55: govde degil); direk seridin iki ucunda `postCells` kare
 * genisliginde dolu (alfa 0,92), govdenin arkasindan (`postReach x direk`
 * geride) on cizginin `postReach x direk` onune; yanlarinda ve onunde
 * `postRim` kalinliginda kenar cizgisi (alfa 0,9). Sunucu mermiyi
 * direklerde de durduruyor (`getAegisPostOutline`): ikisi ayni sayilardan.
 */
export const AEGIS_DRAWN = { bodyCells: 0.9, postCells: 0.28, postReach: 0.3, postRim: 1.2 } as const;

/**
 * Bir diregin cizilen govdesinin dis bukey zarfi, diregin merkezine (seridin
 * ucu, on cizgi) gore: `[yanal, ileri]` ciftleri saat yonunun tersine
 * (yanal seridin genisligi boyunca, ileri seridin yonunde). Dolu direk ve
 * kenar cizgileri; yan ve on cizgilerin birlesmedigi iki on kosede zarf
 * cizimden en fazla `postRim / 4` (0,3) disarida. Arka uc govdenin
 * arkasinda (cizim haritanin kenarinda kirpiliyorsa zarf kirpilmiyor:
 * kirpilan kisim haritanin disinda).
 */
export function getAegisPostOutline(gridSize: number): number[] {
  const half = (gridSize * AEGIS_DRAWN.postCells) / 2;
  const rim = AEGIS_DRAWN.postRim / 2;
  const reach = gridSize * AEGIS_DRAWN.postCells * AEGIS_DRAWN.postReach;
  const back = -(gridSize * AEGIS_DRAWN.bodyCells + reach);
  return [-half - rim, back, half + rim, back, half + rim, reach, half, reach + rim, -half, reach + rim, -half - rim, reach];
}

// --- Tel kodlari ---------------------------------------------------------------------

/** Cesidin tel kodu (`k`): `band` 0 ve telde yazilmiyor (eski kayit = bugunku serit). */
export const COUNTER_SURGE_KIND_CODES: Readonly<Record<CounterSurgeKind, number>> = { band: 0, lance: 1, wall: 2, sweep: 3, slash: 4, aegis: 5 };
/** Yonun tel kodu (`d`): `down` 0 ve telde yazilmiyor. */
export const COUNTER_SURGE_TRAVEL_CODES: Readonly<Record<CounterSurgeTravel, number>> = { down: 0, right: 1, left: 2, downRight: 3, downLeft: 4 };

const KIND_BY_CODE: readonly CounterSurgeKind[] = ["band", "lance", "wall", "sweep", "slash", "aegis"];
const TRAVEL_BY_CODE: readonly CounterSurgeTravel[] = ["down", "right", "left", "downRight", "downLeft"];

/** Tel kodundan cesit; bilinmeyen ya da eksik kod bugunku serit (`band`). Tahsis yok. */
export function decodeCounterSurgeKind(code: unknown): CounterSurgeKind {
  return typeof code === "number" && Number.isInteger(code) ? KIND_BY_CODE[code] ?? "band" : "band";
}

/** Tel kodundan yon; bilinmeyen ya da eksik kod `down`. */
export function decodeCounterSurgeTravel(code: unknown): CounterSurgeTravel {
  return typeof code === "number" && Number.isInteger(code) ? TRAVEL_BY_CODE[code] ?? "down" : "down";
}

/**
 * `surge:block`: siperin bu arada durdurdugu atislar (seyrek; saniyede en
 * fazla birkac mesaj). `a`: durma noktalari, seridin genislik ekseninde
 * dusuk kenardan hucre cinsinden (on cizgi istemcide zaten biliniyor).
 */
export type CounterSurgeBlockMessage = { id: number; a: number[] };
/** Bir `surge:block` mesajinda en fazla bu kadar nokta. */
export const SURGE_BLOCK_MAX_POINTS = 6;
/** Iki `surge:block` mesaji arasinda en az bu kadar duvar saati (ms). */
export const SURGE_BLOCK_MESSAGE_INTERVAL_MS = 250;
