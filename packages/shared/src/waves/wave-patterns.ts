import type { EnemyType } from "../index.js";
import { getEnemyExp } from "../index.js";
import { getEffectiveHp, getEnemyKillGold, getEnemySpawnHealth } from "../balance/champion.js";
import { FINAL_WAVE, SIEGE_FIRST_WAVE, getWaveAirMode, getWaveEnemyTypeWeights, getWaveSpawnIntervalMs } from "../balance/index.js";

/**
 * Dalga paternleri: dalganin dusman karisimi ve dogum ritmi.
 *
 * Eskiden her dalga ayni tarifin buyumus haliydi: ayni zar, ayni esikler,
 * ayni aralik; yalnizca sayi ve can buyuyordu. Sahibinin istegi: dalgalarla
 * karisim ve patern degissin. Her dalga bir patern seciyor; patern iki seyi
 * birden degistiriyor:
 *
 * - **Karisim**, butce payi olarak: "dalganin efektif caninin %65'i kosucu".
 *   Sayi paydan cikiyor: kosucu ince oldugu icin ayni butceye daha cok kosucu
 *   sigiyor (surude kalabalik), brute kalin oldugu icin daha az (zirhli kolda
 *   seyrek). Dalganin toplam efektif cani bugunku karisimla ayni kaliyor.
 * - **Ritim**: dogum araligi, yigin (grup) sayisi ve aradaki sessizlik, giris
 *   sutunlari.
 *
 * Odul de butcede: dalganin toplam oldurme altini ve deneyimi bugunku
 * karisimin beklenen toplamina olcekleniyor (`goldScale`, `expScale`); surude
 * kosucu basina daha az, zirhli kolda brute basina daha cok.
 *
 * Asama irkin tadini katiyor: her asamanin patern agirliklari ve tur
 * carpanlari ayri (`STAGE_WAVE_FLAVOR`). Sürü gercekten suru halinde, Düşüş
 * zirhli kola ve kiskaca yaslaniyor.
 *
 * Kurallar:
 * - Hava dalgalari yerinde: 5. ve 10. dalga hep "Hava akini", 15. ve 20.
 *   dalga hep "Karma hucum" (`getWaveAirMode` degismedi).
 * - Erken dalgalar sade: her paternin bir ilk dalgasi var; 1. dalga hep dengeli.
 * - Ayni patern uc dalga ust uste gelmiyor.
 * - Her sey oda tohumundan, ayri bir zar akisiyla (`createWavePatternRandom`):
 *   ayni tohum ayni dalga dizisi, ayni karisim, ayni sira.
 * - Sampiyon ve ozel dusmanlar eskisi gibi: plan yalnizca normal dogumlarin
 *   turunu, araligini ve giris sutununu veriyor.
 */
export type WavePatternId =
  | "balanced"
  | "trickle"
  | "swarm"
  | "ranged"
  | "rush"
  | "armored"
  | "pincer"
  | "burst"
  | "airRaid"
  | "airMixed";

/** Kara paternleri: zarla secilenler. Hava paternleri dalga numarasindan. */
export type GroundWavePatternId = Exclude<WavePatternId, "airRaid" | "airMixed">;

export const WAVE_PATTERN_IDS: readonly WavePatternId[] = ["balanced", "trickle", "swarm", "ranged", "rush", "armored", "pincer", "burst", "airRaid", "airMixed"];
export const GROUND_WAVE_PATTERN_IDS: readonly GroundWavePatternId[] = ["balanced", "trickle", "swarm", "ranged", "rush", "armored", "pincer", "burst"];

/**
 * Giris sutunlari:
 * - `spread`: ust satirin herhangi bir bos sutunu (eski davranis).
 * - `lane`: her yigin (ya da her `WAVE_PATTERN_LANE_CHUNK` dogum) dar bir
 *   seritten; serit tohumla.
 * - `flanks`: tek dogumlar sol, ciftler sag ceyrekten (iki kanat).
 */
export type WaveEntry = "spread" | "lane" | "flanks";

export type WavePatternSpec = {
  /**
   * Butce paylari (dalganin efektif caninin payi). Verilmezse bugunku
   * karisim (`getWaveEnemyTypeWeights`) -- dengeli.
   */
  shares?: Readonly<Partial<Record<EnemyType, number>>>;
  /** Surekli akista dogum araliginin carpani (dalganin taban araligina gore). */
  intervalScale: number;
  /** Yigin sayisi; 1 surekli akis. */
  groups: number;
  /** Yigin icindeki aralik carpani (yalnizca `groups > 1`). */
  groupIntervalScale: number;
  entry: WaveEntry;
  /**
   * Yigin ici sira: bu turler (bu sirayla) her `WAVE_PATTERN_ORDER_CHUNK`
   * dogumluk parcanin onunde. Menzilli tacizde piyade perdesi, zirhli kolda
   * brute'lar onde.
   */
  order?: readonly EnemyType[];
  /** Paternin secilebildigi ilk dalga (erken dalgalar sade). */
  minWave: number;
  /**
   * Dalga ici tempo: dogum hizi taban hizin `from` katiyla basliyor,
   * dalganin `peakAt` payinda (0..1) `to` katina cikiyor ve sonra orada
   * kaliyor. Verilirse yigin ici aralik yerine bu egri gecerli.
   */
  ramp?: { from: number; to: number; peakAt: number };
};

/**
 * Patern tablosu.
 *
 * | patern   | karisim (butce payi)            | ritim                         | giris  | ilk |
 * | balanced | bugunku karisim                 | taban aralik                  | dagink | 1   |
 * | trickle  | bugunku karisim                 | aralik x1,45 (uzun, seyrek)   | dagink | 2   |
 * | swarm    | kosucu %65, grunt %35           | aralik x0,6 (kalabalik)       | dagink | 3   |
 * | ranged   | nisanci %60, grunt %40 (onde)   | taban aralik                  | dagink | 4   |
 * | rush     | bugunku karisim                 | aralik x0,65 (sik)            | dagink | 4   |
 * | armored  | brute %75, kusatma %15, nis. %10| aralik x1,5 (seyrek, kalin)   | serit  | 6   |
 * | pincer   | bugunku karisim                 | 2 yigin, yigin ici x0,45      | kanat  | 7   |
 * | burst    | bugunku karisim                 | 3 yigin, yigin ici x0,3       | serit  | 9   |
 * | airRaid  | bugunku karisim (hepsi ucuyor)  | taban aralik                  | dagink | 5,10|
 * | airMixed | bugunku karisim (yarisi ucuyor) | taban aralik                  | dagink |15,20|
 *
 * Yiginli paternlerde yiginlar arasi sessizlik yok: yigin ici aralik butun
 * dalgada gecerli, dalga surekli akistan cok daha kisa surede geliyor
 * (`WAVE_PATTERN_PAUSE_MAX_MS` artik kullanilmiyor, eski kayitlar icin duruyor).
 */
export const WAVE_PATTERN_TABLE: Readonly<Record<WavePatternId, Readonly<WavePatternSpec>>> = {
  balanced: { intervalScale: 1, groups: 1, groupIntervalScale: 1, entry: "spread", minWave: 1 },
  trickle: { intervalScale: 1.45, groups: 1, groupIntervalScale: 1, entry: "spread", minWave: 2 },
  swarm: { shares: { runner: 0.65, grunt: 0.35 }, intervalScale: 0.6, groups: 1, groupIntervalScale: 1, entry: "spread", minWave: 3 },
  ranged: { shares: { shooter: 0.6, grunt: 0.4 }, intervalScale: 1, groups: 1, groupIntervalScale: 1, entry: "spread", order: ["grunt"], minWave: 4 },
  rush: { intervalScale: 0.65, groups: 1, groupIntervalScale: 1, entry: "spread", minWave: 4 },
  armored: { shares: { brute: 0.75, siege: 0.15, shooter: 0.1 }, intervalScale: 1.5, groups: 1, groupIntervalScale: 1, entry: "lane", order: ["brute"], minWave: 6 },
  pincer: { intervalScale: 1, groups: 2, groupIntervalScale: 0.45, entry: "flanks", minWave: 7, ramp: { from: 1.5, to: 3, peakAt: 0.5 } },
  burst: { intervalScale: 1, groups: 3, groupIntervalScale: 0.3, entry: "lane", minWave: 9, ramp: { from: 2, to: 4, peakAt: 0.5 } },
  airRaid: { intervalScale: 1, groups: 1, groupIntervalScale: 1, entry: "spread", minWave: 1 },
  airMixed: { intervalScale: 1, groups: 1, groupIntervalScale: 1, entry: "spread", minWave: 1 }
};

export type StageWaveFlavor = {
  /** Kara paternlerinin secilme agirligi; yazilmayan 0 (hic gelmez). */
  patterns: Readonly<Partial<Record<GroundWavePatternId, number>>>;
  /** Tur carpanlari: butce paylari bununla carpilip yeniden olceklenir. */
  types: Readonly<Partial<Record<EnemyType, number>>>;
};

/**
 * Asamanin tadi: patern agirliklari ve tur carpanlari (indeks asama numarasi).
 *
 * | asama            | irk          | yaslandigi paternler           | tur tadi                    |
 * | 1 Taş Kuşatma    | golem        | dengeli, zirhli kol, sizma     | brute, kusatma +            |
 * | 2 Çelik Hat      | meka         | menzilli taciz, dengeli, sizma | nisanci, kusatma +          |
 * | 3 Sürü           | uzay bocegi  | suru, baskin, kiskac, patlama  | kosucu ++, brute -          |
 * | 4 Düşüş          | dusmus       | zirhli kol, kiskac, menzilli   | brute, nisanci +; kosucu -  |
 * | 5 Katlanma       | 4. boyut     | patlama, kiskac, baskin        | nisanci, kosucu +           |
 */
export const STAGE_WAVE_FLAVOR: Readonly<Record<number, Readonly<StageWaveFlavor>>> = {
  1: {
    patterns: { balanced: 4, armored: 3, trickle: 2, swarm: 1, ranged: 1, rush: 1, pincer: 1, burst: 1 },
    types: { brute: 1.35, siege: 1.2, runner: 0.75 }
  },
  2: {
    patterns: { ranged: 3, balanced: 3, trickle: 2, armored: 2, rush: 1, swarm: 1, pincer: 1, burst: 1 },
    types: { shooter: 1.3, siege: 1.3, runner: 0.85 }
  },
  3: {
    patterns: { swarm: 4, rush: 3, pincer: 2, burst: 2, balanced: 2, ranged: 1, trickle: 0.5, armored: 0.5 },
    types: { runner: 1.6, grunt: 1.1, shooter: 0.8, brute: 0.6 }
  },
  4: {
    patterns: { armored: 3, pincer: 3, ranged: 2, balanced: 2, burst: 2, rush: 1, swarm: 1, trickle: 1 },
    types: { brute: 1.25, shooter: 1.25, runner: 0.8 }
  },
  5: {
    patterns: { burst: 3, pincer: 3, rush: 2, ranged: 2, armored: 2, swarm: 2, balanced: 1, trickle: 1 },
    types: { shooter: 1.15, runner: 1.15, grunt: 0.9 }
  }
};

/** Dalga sayisinin bugunkune gore en az ve en cok kati (performans ve okunurluk siniri). */
export const WAVE_PATTERN_MIN_COUNT_FACTOR = 0.45;
export const WAVE_PATTERN_MAX_COUNT_FACTOR = 1.8;
/** Yiginlar arasi sessizligin tavani ve en kisa dogum araligi (oyun ms). */
export const WAVE_PATTERN_PAUSE_MAX_MS = 8000;
export const WAVE_PATTERN_MIN_INTERVAL_MS = 90;
/** Sira kuralinin parca boyu (`order`) ve serit girisinin yigin disindaki parca boyu. */
export const WAVE_PATTERN_ORDER_CHUNK = 6;
export const WAVE_PATTERN_LANE_CHUNK = 8;
/** Bir onceki dalganin paterni bu carpanla seciliyor (cesitlilik); ucuncu tekrar hic yok. */
export const WAVE_PATTERN_REPEAT_WEIGHT = 0.4;

const ENEMY_TYPE_ORDER: readonly EnemyType[] = ["grunt", "shooter", "runner", "brute", "siege"];

function getStageFlavor(stage: number): StageWaveFlavor {
  const s = Math.max(1, Math.min(5, Math.floor(Number.isFinite(stage) ? stage : 1)));
  return STAGE_WAVE_FLAVOR[s] ?? STAGE_WAVE_FLAVOR[1];
}

/**
 * Tohumlu zar (mulberry32), dalga basina ayri dizi. `createSpecialRandom`dan
 * farkli bir karistirma: ayni tohum ozel dusman ve patern zarlarini
 * birbirine baglamiyor.
 */
export function createWavePatternRandom(seed: number, wave: number) {
  let state = (Math.imul((seed >>> 0) ^ 0x51ed270b, 0x2c1b3c6d) ^ Math.imul(Math.floor(wave) + 7, 0x297a2d39)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bu dalgada secilebilen kara paternleri ve agirliklari (asama ve ilk dalga kapisi). */
export function getWavePatternCandidates(stage: number, wave: number): Array<{ pattern: GroundWavePatternId; weight: number }> {
  const flavor = getStageFlavor(stage);
  const w = Math.floor(wave);
  const list: Array<{ pattern: GroundWavePatternId; weight: number }> = [];
  for (const pattern of GROUND_WAVE_PATTERN_IDS) {
    const weight = flavor.patterns[pattern] ?? 0;
    if (weight > 0 && w >= WAVE_PATTERN_TABLE[pattern].minWave) list.push({ pattern, weight });
  }
  return list;
}

/**
 * Dalga dizisinin paternleri, 1. dalgadan `upTo`ya (indeks `wave - 1`).
 *
 * Her dalga kendi zarinin ilk cekimiyle seciyor; bir onceki dalganin paterni
 * `WAVE_PATTERN_REPEAT_WEIGHT` ile kisiliyor, iki dalgadir ayni olan patern
 * havuzdan cikiyor. Hava dalgalari zar atmadan.
 */
export function getWavePatternSequence(stage: number, seed: number, upTo = FINAL_WAVE): WavePatternId[] {
  const sequence: WavePatternId[] = [];
  const last = Math.max(1, Math.floor(upTo));
  for (let wave = 1; wave <= last; wave += 1) {
    const air = getWaveAirMode(wave);
    if (air === "all") { sequence.push("airRaid"); continue; }
    if (air === "mixed") { sequence.push("airMixed"); continue; }
    const previous = sequence[wave - 2];
    const twice = previous !== undefined && sequence[wave - 3] === previous;
    const pool = getWavePatternCandidates(stage, wave)
      .filter((entry) => !(twice && entry.pattern === previous))
      .map((entry) => ({ pattern: entry.pattern, weight: entry.pattern === previous ? entry.weight * WAVE_PATTERN_REPEAT_WEIGHT : entry.weight }));
    if (wave === 1 || pool.length === 0) { sequence.push("balanced"); continue; }
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = createWavePatternRandom(seed, wave)() * total;
    let picked = pool[pool.length - 1].pattern;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll < 0) { picked = entry.pattern; break; }
    }
    sequence.push(picked);
  }
  return sequence;
}

/** Tek dalganin paterni (dizinin `wave`. elemani). */
export function getWavePattern(stage: number, wave: number, seed: number): WavePatternId {
  const w = Math.max(1, Math.floor(Number.isFinite(wave) ? wave : 1));
  return getWavePatternSequence(stage, seed, w)[w - 1];
}

/**
 * Paternin bu asama ve dalgadaki butce paylari (toplam 1). Kusatma
 * `SIEGE_FIRST_WAVE`ten once yok: payi grunt'a gidiyor.
 */
export function getWavePatternShares(pattern: WavePatternId, stage: number, wave: number): Map<EnemyType, number> {
  const spec = WAVE_PATTERN_TABLE[pattern];
  const raw = new Map<EnemyType, number>();
  if (spec.shares) {
    for (const type of ENEMY_TYPE_ORDER) {
      const share = spec.shares[type] ?? 0;
      if (share > 0) raw.set(type, share);
    }
  } else {
    // Bugunku karisim birim olasiligi; butce payina efektif canla cevriliyor.
    for (const { type, weight } of getWaveEnemyTypeWeights(wave)) {
      if (weight > 0) raw.set(type, weight * getUnitEffectiveHp(type, wave));
    }
  }
  if (wave < SIEGE_FIRST_WAVE && raw.has("siege")) {
    raw.set("grunt", (raw.get("grunt") ?? 0) + (raw.get("siege") ?? 0));
    raw.delete("siege");
  }
  const flavor = getStageFlavor(stage).types;
  let total = 0;
  for (const [type, share] of raw) {
    const value = share * (flavor[type] ?? 1);
    raw.set(type, value);
    total += value;
  }
  const shares = new Map<EnemyType, number>();
  for (const type of ENEMY_TYPE_ORDER) {
    const value = raw.get(type);
    if (value !== undefined && value > 0 && total > 0) shares.set(type, value / total);
  }
  return shares;
}

function getUnitEffectiveHp(type: EnemyType, wave: number) {
  return getEffectiveHp(getEnemySpawnHealth(type, wave));
}

/** Bugunku karisimla bir dogumun beklenen degerleri (kara; hava ayni oranda dusuyor). */
export function getDefaultWaveSlotBudget(wave: number) {
  let effectiveHp = 0;
  let gold = 0;
  let exp = 0;
  for (const { type, weight } of getWaveEnemyTypeWeights(wave)) {
    effectiveHp += weight * getUnitEffectiveHp(type, wave);
    gold += weight * getEnemyKillGold(type);
    exp += weight * getEnemyExp(wave, type, "ground");
  }
  return { effectiveHp, gold, exp };
}

export type WavePatternPlan = {
  stage: number;
  wave: number;
  pattern: WavePatternId;
  /** Bugunku sayi (harita olcegi ve oyuncu sayisi dahil): butcenin olcusu. */
  baseSlotCount: number;
  /** Paternin orijinal dogum sayisi; sampiyon ve ozel dusmanlar bunun uzerine. */
  slotCount: number;
  /** Orijinal dogum sirasinda her dogumun turu (uzunluk `slotCount`). */
  types: EnemyType[];
  /** Normal dogumun oldurme altini ve deneyim carpani (dalga toplami bugunku beklenene esit). */
  goldScale: number;
  expScale: number;
  groups: number;
  groupSize: number;
  /** Akistaki (ya da yigin icindeki) aralik, oyun ms. */
  intervalMs: number;
  /** Yiginlar arasi sessizlik, oyun ms; surekli akista 0. */
  pauseMs: number;
  /** Dalganin taban araligi (oyun ms); tempo egrisi bunun katlariyla. */
  baseIntervalMs: number;
  /** Dalga ici tempo egrisi (bkz. `WavePatternSpec.ramp`); yoksa sabit aralik. */
  ramp?: { from: number; to: number; peakAt: number };
  entry: WaveEntry;
  /** Serit girisinin merkezleri, 0..1 (sutun payi). */
  lanes: number[];
};

export type WavePatternPlanInput = {
  stage: number;
  wave: number;
  /** Bugunku dogum sayisi (`getArenaWaveEnemyCount`). */
  baseSlotCount: number;
  /** Oda tohumu. */
  seed: number;
};

/**
 * Dalganin patern plani: patern, sayi, tur sirasi, odul carpanlari ve ritim.
 *
 * Sayi: her turun dogum sayisi `pay x butce / birim efektif can`, butce
 * bugunku karisimin `baseSlotCount` dogumluk beklenen efektif cani. Toplam
 * `WAVE_PATTERN_MIN/MAX_COUNT_FACTOR` icinde kirpiliyor. Tam sayiya en buyuk
 * kalanla iniyor; sira tohumlu zarla karistiriliyor, sonra `order` kurali.
 */
export function planWavePattern(input: WavePatternPlanInput): WavePatternPlan {
  const stage = Math.max(1, Math.floor(Number.isFinite(input.stage) ? input.stage : 1));
  const wave = Math.max(1, Math.floor(Number.isFinite(input.wave) ? input.wave : 1));
  const base = Math.max(1, Math.floor(Number.isFinite(input.baseSlotCount) ? input.baseSlotCount : 1));
  const seed = Math.floor(Number.isFinite(input.seed) ? input.seed : 0) >>> 0;
  const pattern = getWavePattern(stage, wave, seed);
  const spec = WAVE_PATTERN_TABLE[pattern];
  const random = createWavePatternRandom(seed, wave);
  // Ilk cekim paterni secti (dizi ayni zarla); karisim ve ritim ondan sonra.
  random();

  const shares = getWavePatternShares(pattern, stage, wave);
  const slotBudget = getDefaultWaveSlotBudget(wave);
  const budget = base * slotBudget.effectiveHp;
  const exact: Array<{ type: EnemyType; count: number }> = [];
  let exactTotal = 0;
  for (const [type, share] of shares) {
    const count = (share * budget) / getUnitEffectiveHp(type, wave);
    exact.push({ type, count });
    exactTotal += count;
  }
  const factor = Math.max(WAVE_PATTERN_MIN_COUNT_FACTOR, Math.min(WAVE_PATTERN_MAX_COUNT_FACTOR, exactTotal / base));
  const scale = exactTotal > 0 ? (factor * base) / exactTotal : 1;
  const slotCount = Math.max(1, Math.round(factor * base));
  // En buyuk kalan: toplam tam olarak `slotCount`.
  const counts = exact.map((entry) => ({ type: entry.type, value: entry.count * scale, count: Math.floor(entry.count * scale) }));
  let assigned = counts.reduce((sum, entry) => sum + entry.count, 0);
  const byRemainder = [...counts].sort((left, right) => (right.value - right.count) - (left.value - left.count));
  for (let index = 0; assigned < slotCount && byRemainder.length > 0; index += 1) {
    byRemainder[index % byRemainder.length].count += 1;
    assigned += 1;
  }
  for (let index = byRemainder.length - 1; assigned > slotCount && index >= 0; index -= 1) {
    if (byRemainder[index].count > 0) { byRemainder[index].count -= 1; assigned -= 1; }
  }

  const types: EnemyType[] = [];
  for (const entry of counts) for (let index = 0; index < entry.count; index += 1) types.push(entry.type);
  while (types.length < slotCount) types.push("grunt");
  for (let index = types.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = types[index];
    types[index] = types[swap];
    types[swap] = held;
  }
  if (spec.order && spec.order.length > 0) {
    const rank = (type: EnemyType) => {
      const at = spec.order!.indexOf(type);
      return at < 0 ? spec.order!.length : at;
    };
    for (let start = 0; start < types.length; start += WAVE_PATTERN_ORDER_CHUNK) {
      const chunk = types.slice(start, start + WAVE_PATTERN_ORDER_CHUNK).map((type, index) => ({ type, index }));
      chunk.sort((left, right) => rank(left.type) - rank(right.type) || left.index - right.index);
      for (let index = 0; index < chunk.length; index += 1) types[start + index] = chunk[index].type;
    }
  }

  // Odul: dalganin toplami bugunku beklenen toplam.
  let gold = 0;
  let exp = 0;
  for (const type of types) {
    gold += getEnemyKillGold(type);
    exp += getEnemyExp(wave, type, "ground");
  }
  const goldScale = gold > 0 ? (base * slotBudget.gold) / gold : 1;
  const expScale = exp > 0 ? (base * slotBudget.exp) / exp : 1;

  // Ritim.
  const baseInterval = getWaveSpawnIntervalMs(wave);
  const groups = Math.max(1, Math.min(spec.groups, slotCount));
  const groupSize = Math.max(1, Math.ceil(slotCount / groups));
  const flowInterval = Math.max(WAVE_PATTERN_MIN_INTERVAL_MS, baseInterval * spec.intervalScale);
  let intervalMs = flowInterval;
  // Yiginlar arasinda sessizlik yok (sahibinin istegi: dalga basladiysa
  // dusman hic beklemeden gelmeli). Yiginli paternler (Kiskac, Yigin baskin)
  // yigin ici sik araligi butun dalgaya yayiyor: dalga cok daha kisa surede
  // geliyor, yani bunlar "hizli, zorlayici" dalgalar. Yigin sayisi yalnizca
  // giris seritlerini belirliyor.
  const pauseMs = 0;
  if (groups > 1) {
    intervalMs = Math.max(WAVE_PATTERN_MIN_INTERVAL_MS, baseInterval * spec.groupIntervalScale);
  }
  // Tempo egrisi varsa `intervalMs` tepe hizin araligi (en sik an).
  if (spec.ramp) intervalMs = Math.max(WAVE_PATTERN_MIN_INTERVAL_MS, baseInterval / spec.ramp.to);
  const laneCount = Math.max(groups, 4);
  const lanes: number[] = [];
  for (let index = 0; index < laneCount; index += 1) lanes.push(0.15 + 0.7 * random());

  return {
    stage,
    wave,
    pattern,
    baseSlotCount: base,
    slotCount,
    types,
    goldScale: Math.round(goldScale * 10000) / 10000,
    expScale: Math.round(expScale * 10000) / 10000,
    groups,
    groupSize,
    intervalMs: Math.round(intervalMs),
    baseIntervalMs: Math.round(baseInterval),
    ...(spec.ramp ? { ramp: { ...spec.ramp } } : {}),
    pauseMs: Math.round(pauseMs),
    entry: spec.entry,
    lanes
  };
}

/** Orijinal sirada `slot`. dogumun turu (dizinin disinda kalan sira basa sariyor). */
export function getWavePatternSlotType(plan: WavePatternPlan, slot: number): EnemyType {
  const length = plan.types.length;
  if (length === 0) return "grunt";
  const index = Math.max(0, Math.floor(slot));
  return plan.types[index % length];
}

/**
 * `slot`. dogumdan sonraki bekleme (oyun ms). Yiginlar arasi sessizlik yok.
 * Tempo egrisi olan paternde (Kiskac, Yigin baskin) hiz dalganin basinda
 * `from` katindan dalganin ortasina dogru `to` katina cikiyor; yoksa sabit aralik.
 */
export function getWavePatternSlotDelayMs(plan: WavePatternPlan, slot: number) {
  const ramp = plan.ramp;
  if (!ramp || !(plan.baseIntervalMs > 0)) return plan.intervalMs;
  const progress = plan.slotCount > 1 ? Math.min(1, Math.max(0, Math.floor(slot) / (plan.slotCount - 1))) : 1;
  const t = ramp.peakAt > 0 ? Math.min(1, progress / ramp.peakAt) : 1;
  const speed = ramp.from + (ramp.to - ramp.from) * t;
  return Math.max(WAVE_PATTERN_MIN_INTERVAL_MS, Math.round(plan.baseIntervalMs / speed));
}

/** `slot`tan baslayan `slots` dogumun beklemelerinin toplami (sampiyonun bosalttigi araliklar dahil). */
export function getWavePatternDelayMs(plan: WavePatternPlan, slot: number, slots: number) {
  let total = 0;
  const count = Math.max(1, Math.floor(slots));
  for (let index = 0; index < count; index += 1) total += getWavePatternSlotDelayMs(plan, slot + index);
  return total;
}

/**
 * `slot`. dogumun tercih ettigi giris sutunlari (dahil aralik). Sunucu bos
 * sutunlari bununla suzuyor; aralikta bos sutun yoksa butun satira donuyor.
 */
export function getWavePatternEntryColumns(plan: WavePatternPlan, slot: number, cols: number): { from: number; to: number } {
  const c = Math.max(1, Math.floor(cols));
  const index = Math.max(0, Math.floor(slot));
  if (plan.entry === "flanks") {
    const span = Math.max(1, Math.floor(c / 4));
    return index % 2 === 0 ? { from: 0, to: span - 1 } : { from: c - span, to: c - 1 };
  }
  if (plan.entry === "lane" && plan.lanes.length > 0) {
    const group = plan.groups > 1 ? Math.floor(index / plan.groupSize) : Math.floor(index / WAVE_PATTERN_LANE_CHUNK);
    const centre = plan.lanes[group % plan.lanes.length] * c;
    const half = Math.max(1, Math.round(c / 8));
    const from = Math.max(0, Math.min(c - 1, Math.round(centre) - half));
    const to = Math.max(from, Math.min(c - 1, Math.round(centre) + half - 1));
    return { from, to };
  }
  return { from: 0, to: c - 1 };
}

/** Planin toplam butcesi (kara, odul carpanlari dahil): testler ve olcum icin. */
export function getWavePatternBudget(plan: WavePatternPlan) {
  let effectiveHp = 0;
  let gold = 0;
  let exp = 0;
  for (const type of plan.types) {
    effectiveHp += getUnitEffectiveHp(type, plan.wave);
    gold += getEnemyKillGold(type) * plan.goldScale;
    exp += getEnemyExp(plan.wave, type, "ground") * plan.expScale;
  }
  return { effectiveHp, gold, exp };
}
