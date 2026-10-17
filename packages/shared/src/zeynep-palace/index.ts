/**
 * Saray Arsivi (zeynep-7): AURA kulesi.
 *
 * Ates etmiyor; aura alanindaki kulelere seviyesine gore guc veriyor. Butun
 * sayilar burada: sunucu (kapsama, soguma, menzil, sentez paylari), istemci
 * (aciklama, panel, onizleme halkasi), seviye ve bedel kurallari bunlari
 * okuyor.
 *
 * - 1. seviye: alandaki kulelerin sogumasi +%40.
 * - 2. seviye: ek olarak menzil +%15 (kosullu menzil havuzunda, tavani
 *   `RANGE_CONDITIONAL_CAP`).
 * - 3. seviye: alandaki Taht Mührü'nün cift Hiza sentezine ("1-1") +1 delme.
 * - 4. seviye: cift Gosteri sentezinin ("2-2") yanik hattina +1 sn.
 * - 5. seviye: karisik sentez isinina ("1-2") +1 sekme.
 *
 * Alan sahibinin kulelerine isliyor (Abarti, Rezonans Odasi ve Gozcu
 * Diregi gibi: Zeynep ve destek esyalarinin kurali sahip). Iki arsiv
 * yigilmiyor: kule kendisini kapsayan en yuksek seviyeli arsivin etkisini
 * aliyor.
 */

export const ZEYNEP_PALACE_ID = "zeynep-7";

/** Kurulum bedeli (altin). Tanimdaki `cost` bunun yarisi: insa bedeli `cost` x 2. */
export const ZEYNEP_PALACE_BUILD_GOLD = 500;

/** Azami seviye; oteki kulelerin 10'u degismiyor. */
export const ZEYNEP_PALACE_MAX_LEVEL = 5;

/** Hedef seviyeye gore gelistirme altini. XP bedeli olagan formul. */
export const ZEYNEP_PALACE_UPGRADE_GOLD: Readonly<Record<number, number>> = {
  2: 300,
  3: 400,
  4: 500,
  5: 600
};

/** Aura yaricapi, kare cinsinden, kulenin merkezinden (2x2 ayak izi korunuyor). */
export const ZEYNEP_PALACE_AURA_RADIUS_CELLS = 2.5;

/**
 * Aura yaricapi, olceklenmemis dunya biriminde: 2,5 kare x `TOWER_GRID_SIZE`
 * (34). Sayi yazili cunku kule tanimi modul yuklenirken kuruluyor ve
 * `index.ts` ile dongusel ice aktarim orada henuz tanimsiz olurdu; test
 * esitligi kilitliyor.
 */
export const ZEYNEP_PALACE_AURA_RADIUS = 85;

/** 1. seviye: alandaki kulenin sogumasina carpan payi. */
export const ZEYNEP_PALACE_COOLING_BONUS = 0.4;
/** 2. seviye: alandaki kulenin menziline pay (kosullu menzil havuzu). */
export const ZEYNEP_PALACE_RANGE_BONUS = 0.15;
/** 3. seviye: cift Hiza sentezine ek delme. */
export const ZEYNEP_PALACE_PIERCE_BONUS = 1;
/** 4. seviye: cift Gosteri sentezinin yanik hattina ek sure (oyun ms). */
export const ZEYNEP_PALACE_BURN_BONUS_MS = 1000;
/** 5. seviye: karisik sentez isinina ek sekme. */
export const ZEYNEP_PALACE_BOUNCE_BONUS = 1;

/** Her etkinin acildigi seviye. */
export const ZEYNEP_PALACE_UNLOCK_LEVELS = {
  cooling: 1,
  range: 2,
  pierce: 3,
  burn: 4,
  bounce: 5
} as const;

export type ZeynepPalaceEffects = {
  /** Soguma carpan payi (0.4 = +%40). */
  cooling: number;
  /** Menzil payi (0.15 = +%15). */
  range: number;
  /** "1-1" sentezine ek delme. */
  pierce: number;
  /** "2-2" sentezinin yanik hattina ek sure (oyun ms). */
  burnMs: number;
  /** "1-2" sentez isinina ek sekme. */
  bounces: number;
};

/** Bu seviyedeki arsivin alanindaki kuleye verdigi etkiler; 0 = kapsama yok. */
export function getZeynepPalaceEffects(level: number): ZeynepPalaceEffects {
  const safe = Math.max(0, Math.min(ZEYNEP_PALACE_MAX_LEVEL, Math.floor(level)));
  return {
    cooling: safe >= ZEYNEP_PALACE_UNLOCK_LEVELS.cooling ? ZEYNEP_PALACE_COOLING_BONUS : 0,
    range: safe >= ZEYNEP_PALACE_UNLOCK_LEVELS.range ? ZEYNEP_PALACE_RANGE_BONUS : 0,
    pierce: safe >= ZEYNEP_PALACE_UNLOCK_LEVELS.pierce ? ZEYNEP_PALACE_PIERCE_BONUS : 0,
    burnMs: safe >= ZEYNEP_PALACE_UNLOCK_LEVELS.burn ? ZEYNEP_PALACE_BURN_BONUS_MS : 0,
    bounces: safe >= ZEYNEP_PALACE_UNLOCK_LEVELS.bounce ? ZEYNEP_PALACE_BOUNCE_BONUS : 0
  };
}

/**
 * Bulundugu seviyeden bir sonrakine gelistirme altini; azami seviyede 0.
 * `getTowerLevelGoldCost` arsiv icin bunu donduruyor.
 */
export function getZeynepPalaceUpgradeGold(currentLevel: number) {
  const next = Math.round(currentLevel) + 1;
  if (currentLevel < 1 || next > ZEYNEP_PALACE_MAX_LEVEL) return 0;
  return ZEYNEP_PALACE_UPGRADE_GOLD[next] ?? 0;
}
