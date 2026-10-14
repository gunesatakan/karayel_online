import type { EnemyType } from "../index.js";
import { CHAMPION_MIN_REPLACED, getWaveChampionPlan } from "../balance/champion.js";
import { getWaveEnemyCount } from "../balance/index.js";
import { TOWER_GRID_SIZE } from "../index.js";

/**
 * Ozel dusmanlar ve karsi atak: 2. asamadan itibaren normal dalganin icinde.
 *
 * Dort mekanik, hicbiri kendi dalgasini kurmuyor:
 * - Kule avcisi: sampiyonun 1,5 kati canli, nexusa degil en yakin kuleye/binaya yuruyor.
 * - Isitici: normal yolda yuruyor, yanindan gectigi kuleyi isitiyor.
 * - Enerji yiyici: yandan (sol/sag kenar) giriyor, enerji binasini emip yikiyor.
 * - Karsi atak: dusman degil; ust kenardan inen, gectigi yapilari yakan enerji seridi.
 *
 * 1. asama hic degismiyor: oyuncu once temel dili ogreniyor. Butun sayilar
 * burada; sunucu ve testler ayni tablodan okuyor.
 */
export type SpecialEnemyKind = "hunter" | "heater" | "eater" | "bomber" | "harvester";

export const SPECIAL_ENEMY_KINDS: readonly SpecialEnemyKind[] = ["hunter", "heater", "eater", "bomber"];

/** Ozel dusmanlarin ve karsi atagin basladigi asama. */
export const SPECIAL_ENEMIES_FIRST_STAGE = 2;

/**
 * Turun ilk gorundugu dalga, asamaya gore (indeks asama numarasi).
 *
 * 2. asamada sira ogretici: 1-2. dalga yalnizca isitici (kuleyi ezmiyor,
 * yalnizca isitiyor), 3. dalgadan enerji yiyici, 6. dalgadan -- sampiyonla
 * ayni dalga -- kule avcisi. Sonraki asamalarda erkene cekiliyor.
 */
export const SPECIAL_KIND_FIRST_WAVE: Readonly<Record<SpecialEnemyKind, Readonly<Record<number, number>>>> = {
  heater: { 2: 1, 3: 1, 4: 1, 5: 1 },
  eater: { 2: 3, 3: 2, 4: 1, 5: 1 },
  hunter: { 2: 6, 3: 4, 4: 3, 5: 2 },
  harvester: {},
  bomber: { 2: 8, 3: 6, 4: 4, 5: 3 }
};

/**
 * Turun secilme agirligi. Avci sampiyon canli oldugu icin en seyrek;
 * isitici en sik (tek basina en az tehlikeli olan).
 */
export const SPECIAL_KIND_WEIGHTS: Readonly<Record<SpecialEnemyKind, number>> = { heater: 3, eater: 2, hunter: 1, bomber: 1, harvester: 0 };

/** Side raids are additional packs; independent of ordinary special-slot budgets. */
export const HARVESTER_QUOTA = 20;
export const HARVESTER_GATHER_PER_SECOND = 4;
export function getHarvesterRaidCount(wave: number) {
  return Number.isFinite(wave) && wave >= 3 ? Math.min(24, 6 + 2 * Math.floor(wave / 3)) : 0;
}

export const BOMBER_RADIUS_CELLS = 1.5;
export const BOMBER_HP_MULTIPLIER = 6;
export const BOMBER_ARMOR_MULTIPLIER = 4;

/** Raw structure damage, before armor. A killed bomber releases half its charge. */
export function getBomberExplosionDamage(wave: number, killed = false) {
  const steps = Number.isFinite(wave) ? Math.max(0, Math.floor(wave) - 1) : 0;
  return (100 + steps * 15) * (killed ? 0.5 : 1);
}

/** Bir dalgada en fazla kac kule avcisi; asamaya gore. Sahibinin istegiyle iki kat (once 1/1/2/2). */
export const TOWER_HUNTER_MAX_PER_WAVE: Readonly<Record<number, number>> = { 2: 2, 3: 2, 4: 4, 5: 4 };

/**
 * Ozel dusmanlarin dalganin orijinal dogumlarindan yerine gecebilecegi en
 * yuksek pay. Dalga hicbir zaman yalnizca ozel dusmandan olusmasin. Sayilar
 * iki katina cikinca 0,35'ten 0,5'e: kucuk erken dalgalarda iki katin daha
 * cogu sigsin. Normal payin tabani (`SPECIAL_MIN_NORMAL_SHARE`) ayni.
 */
export const SPECIAL_MAX_SLOT_SHARE = 0.5;

/**
 * Sampiyon ve ozel dusmanlar ciktiktan sonra dalganin orijinal dogumlarinin
 * en az bu kadari normal dusman olarak kalmali.
 */
export const SPECIAL_MIN_NORMAL_SHARE = 0.4;

/** Isitici ve enerji yiyicinin yerine gectigi normal dogum sayisi. */
export const SPECIAL_REPLACED_SLOTS = 1;

/** Isitici ve enerji yiyicinin govde turu: dalganin "normal" dusmani. */
export const SPECIAL_BASE_TYPE: EnemyType = "grunt";

// --- Kule avcisi ---------------------------------------------------------------

/**
 * Avcinin yapiya bir vurusunun **tabani** (zirhtan ve dalga carpanindan once).
 * Kadans normal yapi vurusuyla ayni (`TOWER_HUNTER_ATTACK_INTERVAL_MS`).
 *
 * Uzerine butun dusman -> yapi hasarinin ortak dalga carpani biniyor
 * (`getEnemyStructureDamageMultiplier`: 1. dalga x1,25, 20. dalga x2,5).
 * Olcu: kule cani seviyeyle degil kart ve esyayla buyuyor (taban 100, zirh 3).
 * 10. dalgada 14 x 1,84 = 25,8 ham, 22,8 net: 100 canli kule 5 vurusta,
 * 160 canli (kartli) kule 8 vurusta devriliyor; 20. dalgada 35 ham, 32 net:
 * 4 ve 5 vurus. Kusatmanin yapi carpani avciya binmiyor: kusatma turundeki
 * avci kuleyi tek vurusta indirirdi.
 */
export const TOWER_HUNTER_HIT_DAMAGE = 14;
export const TOWER_HUNTER_ATTACK_INTERVAL_MS = 850;

/**
 * Yol alaninda duvar (ya da hedef olmayan bir yapi) gecmenin bedeli, hucre
 * cinsinden. Cok buyuk: once duvarsiz ulasilabilen hedefler, onlar yoksa en
 * az duvar kirilarak ulasilan, esitlikte en kisa yol.
 */
export const SPECIAL_ROUTE_BLOCKER_COST = 100_000;

/**
 * Avcinin dayanikliligi, o dalganin sampiyonuna gore: can (kalkan ve
 * yenilenme de ayni katla) sampiyonun 1,5 kati, zirh turunun 3 kati (grunt
 * 5 -> 15, kusatma 8 -> 24). Odul butcede kaliyor; yalnizca govde kalinlasiyor.
 */
export const TOWER_HUNTER_HP_MULTIPLIER = 1.5;
export const TOWER_HUNTER_ARMOR_MULTIPLIER = 3;

export type TowerHunterBudget = {
  type: EnemyType;
  /**
   * O dalganin **sampiyonunun** kati: ayni turden normal dusmana gore can,
   * kalkan ve yenilenme. Avcinin kendi kati bunun `TOWER_HUNTER_HP_MULTIPLIER`
   * kati (bkz. `getSpecialEnemyDurability`).
   */
  hpMultiple: number;
  /** Yerine gectigi normal dogum sayisi. */
  replaced: number;
  gold: number;
  exp: number;
  leakDamage: number;
  reputation: number;
};

/**
 * Avcinin butcesi: o dalganin sampiyon plani (`getWaveChampionPlan`) ile
 * birebir ayni kat ve odul; sampiyonun ilk dalgasindan once de hesaplaniyor.
 * Tam hava dalgasinda ve cok kucuk dalgada sampiyon plani yok; o zaman avci
 * da yok. Avcinin gercek cani bu katin `TOWER_HUNTER_HP_MULTIPLIER` kati.
 */
export function getTowerHunterBudget(wave: number, slotCount: number): TowerHunterBudget | undefined {
  const plan = getWaveChampionPlan(wave, slotCount, { firstWave: 1 });
  if (!plan) return undefined;
  return {
    type: plan.type,
    hpMultiple: plan.hpMultiple,
    replaced: plan.replaced,
    gold: plan.gold,
    exp: plan.exp,
    leakDamage: plan.leakDamage,
    reputation: plan.reputation
  };
}

// --- Enerji yiyici -------------------------------------------------------------

/** Normal dusmanin cani kati. Sahibinin istegiyle uc kat (once 1,5). Zirh turununki. */
export const ENERGY_EATER_HP_MULTIPLIER = 4.5;

/**
 * Saniyede emilen enerji. Reaktorun deposu 480: dolu bir reaktor ~15 sn'de
 * bosaliyor, yani yiyiciyi oldurmek icin zaman var.
 */
export const ENERGY_EATER_DRAIN_PER_SECOND = 32;

/**
 * Bos bir binada bile en az bu kadar emme (oyun ms): yikim aninda olmasin,
 * istemci emme isinini gostersin ve oyuncu ne oldugunu gorsun.
 */
export const ENERGY_EATER_MIN_CONTACT_MS = 1000;

/** Enerji yiyicinin dogabilecegi en alt satir: tabandan bu kadar satir yukarisi. */
export const ENERGY_EATER_SPAWN_BOTTOM_MARGIN_ROWS = 4;

// --- Isitici ---------------------------------------------------------------------

/** Isiticinin etki yaricapi, hucre cinsinden (merkezden merkeze). */
export const HEATER_RADIUS_CELLS = 1.5;

/**
 * Saniyede eklenen isi, kulenin kilit esiginin payi olarak (esik 100 ise
 * saniyede 12 derece). Taban soguma saniyede 3: yaninda duran isitici kuleyi
 * ~4 sn'de frene (50), ~8 sn'de kilide tasiyor; gecip giden tek isitici ise
 * frene sokup birakiyor.
 */
export const HEATER_HEAT_PER_SECOND_RATIO = 0.12;

export function getHeaterRadius(gridSize = TOWER_GRID_SIZE) {
  return gridSize * HEATER_RADIUS_CELLS;
}

/**
 * Isiticinin dayanikliligi: dalganin normal dusmaninin 3 kati can (once 1),
 * turunun 2 kati zirh (grunt 5 -> 10).
 */
export const HEATER_HP_MULTIPLIER = 3;
export const HEATER_ARMOR_MULTIPLIER = 2;

// --- Dayaniklilik ------------------------------------------------------------------

export type SpecialEnemyDurability = {
  /** Ayni dalgadaki ayni turden normal dusmana gore can, kalkan ve yenilenme kati. */
  healthMultiplier: number;
  /** Turunun taban zirhinin kati (taban 0 ise zirh 0 kalir). */
  armorMultiplier: number;
};

/**
 * Ozel dusmanin can ve zirh kati; sunucu govdeyi kurarken bunu okuyor.
 * `championHpMultiple` yalnizca avcida: o dalganin sampiyon kati
 * (`TowerHunterBudget.hpMultiple`). Karsi atak dusman degil: cani da zirhi da yok.
 */
export function getSpecialEnemyDurability(kind: SpecialEnemyKind, championHpMultiple = 1): SpecialEnemyDurability {
  if (kind === "harvester") return { healthMultiplier: 1, armorMultiplier: 1 };
  if (kind === "bomber") return { healthMultiplier: BOMBER_HP_MULTIPLIER, armorMultiplier: BOMBER_ARMOR_MULTIPLIER };
  if (kind === "hunter") {
    return { healthMultiplier: championHpMultiple * TOWER_HUNTER_HP_MULTIPLIER, armorMultiplier: TOWER_HUNTER_ARMOR_MULTIPLIER };
  }
  if (kind === "eater") return { healthMultiplier: ENERGY_EATER_HP_MULTIPLIER, armorMultiplier: 1 };
  return { healthMultiplier: HEATER_HP_MULTIPLIER, armorMultiplier: HEATER_ARMOR_MULTIPLIER };
}

// --- Karsi atak --------------------------------------------------------------------

/** Karsi atagin gorunebildigi ilk dalga (2. asamadan itibaren). */
export const COUNTER_SURGE_FIRST_WAVE = 4;
/**
 * Dalga basina olasilik, asamaya gore. Dalgada en fazla bir tane; ayni anda
 * da en fazla bir serit. Sahibinin istegiyle iki kat (once 0,2/0,28/0,37/0,45);
 * `getCounterSurgeChance` 1'de kesiyor.
 */
export const COUNTER_SURGE_CHANCE_BY_STAGE: Readonly<Record<number, number>> = { 2: 0.4, 3: 0.56, 4: 0.74, 5: 0.9 };
/** Seridin genisligi, sutun. */
export const COUNTER_SURGE_WIDTH_COLUMNS = 3;
/** Kalkistan once ust kenardaki uyari suresi (ms). */
export const COUNTER_SURGE_TELEGRAPH_MS = 3000;
/** Haritayi yukaridan asagi gecme suresi (ms); harita boyundan bagimsiz. */
export const COUNTER_SURGE_CROSS_MS = 32_000;
/**
 * Yapinin azami canina gore hasar; zirh delinir. Yapi basina bir kez.
 *
 * Sahibinin istegiyle sabit 0,35'ten dalgayla buyuyen bir paya: seridin
 * basladigi ilk dalgada (`COUNTER_SURGE_FIRST_WAVE`) taban, her dalgada bir
 * adim, tavanda kesiliyor. 4. dalga %45, 12. dalga %65, 20. dalga %85.
 */
export const COUNTER_SURGE_DAMAGE_RATIO_BASE = 0.45;
export const COUNTER_SURGE_DAMAGE_RATIO_PER_WAVE = 0.025;
export const COUNTER_SURGE_DAMAGE_RATIO_MAX = 0.9;
/** Seridin dalganin hangi diliminde basladigi (gercek dogum sirasina gore). */
export const COUNTER_SURGE_START_MIN_SHARE = 0.25;
export const COUNTER_SURGE_START_SPAN_SHARE = 0.35;

/**
 * Seridin basladigi dalgaya gore hasar payi. Serit bu payi kalkarken aliyor
 * ve bir sonraki dalgaya sarksa da onu koruyor (bkz. sunucuda
 * `startCounterSurge`). Ilk dalgadan once ve gecersiz girdide taban.
 */
export function getCounterSurgeDamageRatio(wave: number) {
  const steps = Number.isFinite(wave) ? wave - COUNTER_SURGE_FIRST_WAVE : 0;
  const ratio = COUNTER_SURGE_DAMAGE_RATIO_BASE + COUNTER_SURGE_DAMAGE_RATIO_PER_WAVE * steps;
  return Math.max(COUNTER_SURGE_DAMAGE_RATIO_BASE, Math.min(COUNTER_SURGE_DAMAGE_RATIO_MAX, ratio));
}

export function getCounterSurgeChance(stage: number, wave: number) {
  if (stage < SPECIAL_ENEMIES_FIRST_STAGE || wave < COUNTER_SURGE_FIRST_WAVE) return 0;
  return Math.min(1, COUNTER_SURGE_CHANCE_BY_STAGE[Math.min(5, Math.floor(stage))] ?? 0);
}

/**
 * Snapshot'taki karsi atak kaydi. Kucuk ve kisa adli: yalnizca serit varken
 * telde. `p` 0..1 ilerleme (ust kenar 0, alt kenar 1); `warn` uyari evresi.
 */
export type CounterSurgeSnapshot = {
  id: number;
  /** Seridin sol sutunu. */
  col: number;
  /** Genislik, sutun. */
  w: number;
  /** Ilerleme 0..1. */
  p: number;
  /** Uyari evresi: serit henuz kalkmadi. */
  warn?: true;
  /**
   * Metal Kalkan'in yuttugu parcalar; yalnizca kesik varken telde. Duz uclu
   * dizi `[from, to, p, ...]`: seridin genislik ekseninde dusuk kenardan
   * hucre cinsinden aralik ve on kenarin kesildigi ilerleme (bkz.
   * `surge-absorption.ts`, `encodeSurgeCuts`). Eski istemci alani yok sayar.
   */
  cut?: number[];
};

/** `surge:hit`: serit bu yapilari vurdu (tek mesaj, satir basina). */
export type CounterSurgeHitMessage = {
  id: number;
  hits: Array<{ towerId: string; amount: number }>;
};

// --- Dalga plani -----------------------------------------------------------------

/**
 * Tablonun carpani: sahibinin istegiyle butun ozel dusman sayilari iki kat.
 * Kucuk erken dalgalarda pay sinirlari (`SPECIAL_MAX_SLOT_SHARE`,
 * `SPECIAL_MIN_NORMAL_SHARE`) bu sayiyi kirpiyor; bkz. `planWaveSpecials`.
 */
export const SPECIAL_ENEMY_COUNT_MULTIPLIER = 2;

/** Dalgadaki ozel dusman sayisi (tablo). 1. asamada ve gecersiz girdide 0. */
export function getSpecialEnemyTotal(stage: number, wave: number) {
  const s = Math.floor(stage);
  const w = Math.floor(wave);
  if (!(s >= SPECIAL_ENEMIES_FIRST_STAGE) || !(w >= 1)) return 0;
  const tier = Math.min(5, s) - SPECIAL_ENEMIES_FIRST_STAGE;
  // Carpandan once -- 2. asama: 1. dalgada 1, 8. dalgada 2, 15. dalgada 3;
  // 5. asama: 4 -> 9. Carpanla 2. asama 2/4/6, 5. asama 8 -> 18.
  return SPECIAL_ENEMY_COUNT_MULTIPLIER * (1 + tier + Math.floor((w - 1) * (0.15 + 0.05 * tier)));
}

/**
 * Dalganin gercek ozel dusman sayisi: tablo, dalga kalabaligiyla (harita
 * olcegi, oyuncu sayisi) karekok olcusunde buyuyor. Tek oyunculu kucuk
 * haritada tablonun kendisi.
 */
export function getWaveSpecialEnemyCount(stage: number, wave: number, slotCount: number) {
  const base = getSpecialEnemyTotal(stage, wave);
  if (base <= 0) return 0;
  const crowd = Math.max(1, Math.floor(slotCount) / Math.max(1, getWaveEnemyCount(Math.floor(wave))));
  return Math.round(base * Math.sqrt(crowd));
}

/** Bu dalgada acik olan turler (ilk dalga tablosuna gore). */
export function getSpecialKindsForWave(stage: number, wave: number): SpecialEnemyKind[] {
  const s = Math.min(5, Math.floor(stage));
  if (s < SPECIAL_ENEMIES_FIRST_STAGE) return [];
  return SPECIAL_ENEMY_KINDS.filter((kind) => wave >= (SPECIAL_KIND_FIRST_WAVE[kind][s] ?? Number.POSITIVE_INFINITY));
}

export type WaveSpecialSpawn = {
  /** Dalganin gercek dogum sirasinda (0'dan) bu ozel dusmanin yeri. */
  index: number;
  kind: SpecialEnemyKind;
  /** Yerine gectigi normal dogum sayisi. */
  replaced: number;
};

export type WaveSpecialPlan = {
  stage: number;
  wave: number;
  spawns: WaveSpecialSpawn[];
  /** Ozel dusmanlarin yerine gectigi toplam normal dogum. */
  replaced: number;
  /** Avci varsa butcesi. */
  hunter?: TowerHunterBudget;
  /** Karsi atak: gercek dogum sirasinda bu dogumla birlikte uyari basliyor. */
  surge?: { atSpawn: number; col: number; width: number };
};

export type WaveSpecialPlanInput = {
  stage: number;
  wave: number;
  /** Dalganin orijinal dogum sayisi (harita olcegi ve oyuncu sayisi dahil). */
  slotCount: number;
  /** Sampiyon varsa yerine gectigi dogum ve orijinal sirasi. */
  champion?: { replaced: number; slot: number };
  /** Haritanin sutun sayisi (karsi atagin baslangic sutunu icin). */
  cols: number;
  /** Tohumlu zar; plan bu sirayla tuketiyor. */
  random: () => number;
};

/**
 * Dalganin ozel dusman plani; 1. asamada `undefined` (zar hic atilmiyor).
 *
 * Sayi tablodan (`getWaveSpecialEnemyCount`), turler tohumlu zarla agirliklara
 * gore. Avci sampiyonun butcesi kadar dogumun yerine geciyor, digerleri birer
 * dogumun. Toplam pay `SPECIAL_MAX_SLOT_SHARE`i, sampiyonla birlikte de
 * normal payi `SPECIAL_MIN_NORMAL_SHARE`in altina indiremiyor; sigmayan ozel
 * dusman atiliyor: once ucuzlar (isitici, yiyici) sondan, avci kaliyor.
 * Avci ancak tek basina bile sigmiyorsa isiticiya donuyor.
 *
 * Yerler dalgaya yayiliyor; ilk dogum hep normal, sampiyonun yeri bos.
 */
export function planWaveSpecials(input: WaveSpecialPlanInput): WaveSpecialPlan | undefined {
  const stage = Math.floor(input.stage);
  const wave = Math.floor(input.wave);
  const slots = Math.floor(input.slotCount);
  if (stage < SPECIAL_ENEMIES_FIRST_STAGE || !(wave >= 1) || !(slots >= 1)) return undefined;
  const random = input.random;

  const kinds = getSpecialKindsForWave(stage, wave);
  const hunter = kinds.includes("hunter") ? getTowerHunterBudget(wave, slots) : undefined;
  const hunterCap = hunter ? TOWER_HUNTER_MAX_PER_WAVE[Math.min(5, stage)] ?? 1 : 0;
  const total = getWaveSpecialEnemyCount(stage, wave, slots);

  // Tur secimi: tablodaki sayi kadar agirlikli zar. Avci sinirina gelince
  // havuzdan cikiyor.
  const picked: SpecialEnemyKind[] = [];
  let hunters = 0;
  for (let index = 0; index < total; index += 1) {
    const pool = kinds.filter((kind) => kind !== "hunter" || hunters < hunterCap);
    if (pool.length === 0) break;
    const weightSum = pool.reduce((sum, kind) => sum + SPECIAL_KIND_WEIGHTS[kind], 0);
    let roll = random() * weightSum;
    let kind = pool[pool.length - 1];
    for (const candidate of pool) {
      roll -= SPECIAL_KIND_WEIGHTS[candidate];
      if (roll < 0) {
        kind = candidate;
        break;
      }
    }
    if (kind === "hunter") hunters += 1;
    picked.push(kind);
  }

  // Butce: ozel payi ve normal payin tabani.
  const championReplaced = input.champion ? Math.max(0, Math.floor(input.champion.replaced)) : 0;
  const maxSpecialSlots = Math.floor(slots * SPECIAL_MAX_SLOT_SHARE);
  const minNormal = Math.ceil(slots * SPECIAL_MIN_NORMAL_SHARE);
  const replacedOf = (kind: SpecialEnemyKind) => kind === "hunter" ? Math.max(CHAMPION_MIN_REPLACED, hunter?.replaced ?? CHAMPION_MIN_REPLACED) : SPECIAL_REPLACED_SLOTS;
  const fits = (list: SpecialEnemyKind[]) => {
    const used = list.reduce((sum, kind) => sum + replacedOf(kind), 0);
    return used <= maxSpecialSlots && slots - championReplaced - used >= minNormal;
  };
  // Sigmayan liste: avci birkac dogumluk (cogu dalgada 4), digerleri birer. Eskiden once avci
  // isiticiye donuyordu; kucuk erken dalgada feda edilen hep avciydi ve
  // tablonun ilk avci dalgasi (4. asama 3, 5. asama 2) hic tutmuyordu.
  // Simdi avci kaliyor:
  // 1. Avcilar tek baslarina sigmiyorsa fazlasi (sondan) isiticiya donuyor;
  //    tek avci bile sigmiyorsa o da.
  // 2. Sonra ucuzlar (isitici, yiyici) sondan atiliyor.
  let keptHunters = picked.filter((kind) => kind === "hunter").length;
  let excessHunters = 0;
  while (keptHunters > 0 && !fits(new Array<SpecialEnemyKind>(keptHunters).fill("hunter"))) {
    keptHunters -= 1;
    excessHunters += 1;
  }
  for (let index = picked.length - 1; index >= 0 && excessHunters > 0; index -= 1) {
    if (picked[index] !== "hunter") continue;
    picked[index] = "heater";
    excessHunters -= 1;
  }
  for (let index = picked.length - 1; index >= 0 && !fits(picked); index -= 1) {
    if (picked[index] !== "hunter") picked.splice(index, 1);
  }
  // Guvenlik: yukaridaki iki adimdan sonra liste sigiyor (kalan avcilar tek
  // baslarina sigiyor); yine de sigmayan bir liste asla dogmasin.
  while (picked.length > 0 && !fits(picked)) picked.pop();

  const replaced = picked.reduce((sum, kind) => sum + replacedOf(kind), 0);
  // Gercek dogum sayisi: sampiyon ve ozel dusmanlar birer dogum.
  const spawnCount = slots - (championReplaced > 0 ? championReplaced - 1 : 0) - (replaced - picked.length);
  const championIndex = input.champion && championReplaced > 0 ? Math.floor(input.champion.slot) : -1;

  // Yerler: dalgaya esit aralikla yayiliyor, hafif zarla kayiyor. Ilk dogum
  // normal; sampiyonun yeri ve dolu yerler atlaniyor.
  const taken = new Set<number>();
  if (championIndex >= 0) taken.add(championIndex);
  const spawns: WaveSpecialSpawn[] = [];
  for (let k = 0; k < picked.length; k += 1) {
    const jitter = (random() - 0.5) * 0.6;
    let index = Math.floor(((k + 0.5 + jitter) * spawnCount) / picked.length);
    index = Math.max(1, Math.min(spawnCount - 1, index));
    let guard = 0;
    while (taken.has(index) && guard < spawnCount) {
      index = index + 1 >= spawnCount ? 1 : index + 1;
      guard += 1;
    }
    if (taken.has(index)) break;
    taken.add(index);
    spawns.push({ index, kind: picked[k], replaced: replacedOf(picked[k]) });
  }
  spawns.sort((left, right) => left.index - right.index);

  let surge: WaveSpecialPlan["surge"];
  const chance = getCounterSurgeChance(stage, wave);
  if (chance > 0 && random() < chance) {
    const width = Math.max(1, Math.min(Math.floor(input.cols), COUNTER_SURGE_WIDTH_COLUMNS));
    const atSpawn = Math.max(0, Math.min(spawnCount - 1,
      Math.floor(spawnCount * (COUNTER_SURGE_START_MIN_SHARE + COUNTER_SURGE_START_SPAN_SHARE * random()))));
    const col = Math.floor(random() * Math.max(1, Math.floor(input.cols) - width + 1));
    surge = { atSpawn, col, width };
  }

  const usedReplaced = spawns.reduce((sum, spawn) => sum + spawn.replaced, 0);
  return {
    stage,
    wave,
    spawns,
    replaced: usedReplaced,
    ...(spawns.some((spawn) => spawn.kind === "hunter") && hunter ? { hunter } : {}),
    ...(surge ? { surge } : {})
  };
}

/** Plandaki gercek dogum sayisi farki: ozel dusmanlar `replaced - 1` dogum eksiltiyor. */
export function getWaveSpecialSpawnReduction(plan: WaveSpecialPlan | undefined) {
  if (!plan) return 0;
  return plan.spawns.reduce((sum, spawn) => sum + spawn.replaced - 1, 0);
}

/**
 * Tohumlu zar (mulberry32). Oda tohumu ve dalga numarasindan dalga basina
 * bagimsiz bir dizi: ozel dusman kararlari normal dogum zarini kaydirmiyor.
 */
export function createSpecialRandom(seed: number, wave: number) {
  let state = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(wave) + 1, 0xc2b2ae35)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
