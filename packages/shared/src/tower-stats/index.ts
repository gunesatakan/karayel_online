import { TOWER_GRID_SIZE, getTowerGridSpan } from "../index.js";
import type { TowerDefinition } from "../characters/common/types.js";
import { calculateTowerScaledBaseDamage } from "../tower-rules.js";

/**
 * Single source of truth for what a tower is worth at a given level.
 *
 * These formulas used to live twice: once in MatchRoom, which decides what
 * actually happens, and once in the web codex, which tells the player what to
 * expect. The copies drifted — every balance pass landed on the server and left
 * the codex showing stale numbers, so the panel understated damage by the whole
 * base multiplier and overstated Jackpot's DPS fivefold.
 *
 * The server is authoritative, so the server's formulas moved here verbatim and
 * both sides now read them. `tower-codex-parity.test.mjs` drives a real
 * MatchRoom and asserts the display helpers below still match it, which is what
 * stops the two from separating again.
 */

/** Simulation runs slower than wall clock, so defined intervals are game-time. */
export const GAME_SPEED_MULTIPLIER = 0.8;
export const GLOBAL_TOWER_RANGE_MULTIPLIER = 2 / 3;
export const TOWER_RANGE_PER_LEVEL = 11;
export const TOWER_MIN_FIRE_INTERVAL_MS = 80;
export const ZEYNEP_SHOWCASE_BASE_LENGTH = 100;
export const ZEYNEP_SHOWCASE_LENGTH_PER_LEVEL = 18;

const clampLevel = (level: number) => Math.min(Math.max(Math.round(level), 1), 10);

/**
 * Gorsel kademe: on seviyenin uc esigi.
 *
 * Seviye on adimda buyuyor ama on ayri gorsel dil ne uretilebilir ne de 34
 * pikselde ayirt edilebilir; iki komsu seviye arasindaki fark algi esiginin
 * altinda kalir ve oyuncu "hep ayni sey" hisseder. Uc esik ise her birinin
 * arasinda gercek bir siçrama birakir ve gecis anini kutlanacak bir olaya
 * cevirir.
 *
 * Sinirlar Takipci'nin zaten uretilmis uc resmiyle ayni (1-4 / 5-9 / 10), yani
 * bu bolme yeni bir kural degil, var olan boluntunun tek yerde adlandirilmasi.
 * Sunucu mermiye hangi kademeyi yazacagini, istemci hangi dokuyu ve efekt
 * buyuklugunu secegini buradan okur -- ikisi ayrilirsa seviye atlayan kule
 * yanlis mermiyi atar.
 */
export type TowerTier = 1 | 2 | 3;

export const TOWER_TIER_2_LEVEL = 5;
export const TOWER_TIER_3_LEVEL = 10;

export function getTowerTier(level: number): TowerTier {
  const clamped = clampLevel(level);
  if (clamped >= TOWER_TIER_3_LEVEL) return 3;
  return clamped >= TOWER_TIER_2_LEVEL ? 2 : 1;
}

const levelRatio = (level: number) => (clampLevel(level) - 1) / 9;

/**
 * Obsesyon'un seviye egrisi.
 *
 * Eskiden 1.0 civarinda salinan elle yazilmis bir tabloydu ve 6->7 gecisinde
 * 1.085'ten 0.947'ye **duserek** kuleyi seviye atlayinca zayiflatiyordu. Asil
 * gucu zaten ayni hedefte biriken `obsession` stacki (vurus basina +%20, tavan
 * x3); seviye egrisinin isi tek hedef kimligini duz bir rampayla desteklemek.
 */
export function getObsessionDamageMultiplier(level: number) {
  return 1 + levelRatio(level) * 0.55;
}

/**
 * Debug Lazer'in seviye egrisi.
 *
 * Onceki tablo 1->10 arasinda x3.14 buyuyordu; genel egri x48 iken bu makuldu,
 * x12'ye inince kule tek basina asiri buyuk kaliyordu. Kimligi "cok sik, kucuk
 * vurus" oldugu icin egri korunuyor ama buyume orani kisiliyor.
 */
export function getDebugLaserDamageMultiplier(level: number, overdrive: boolean) {
  const base = overdrive ? 1.92 : 1.3333;
  const growth = overdrive ? 0.45 : 0.74;
  return base * (1 + levelRatio(level) * growth);
}

export function getDebugLaserFireInterval(level: number, overdrive: boolean) {
  const clampedLevel = clampLevel(level);
  const normalRealMs = clampedLevel <= 5
    ? 200 - (clampedLevel - 1) * 10
    : 160 - (clampedLevel - 5) * 8;
  const realMs = overdrive ? normalRealMs / 2 : normalRealMs;
  return realMs * GAME_SPEED_MULTIPLIER;
}

/**
 * Ucube'nin seviye egrisi.
 *
 * Onceki tablo `[0.45, 0.4, 0.34, 0.34, 0.35, 0.42, 0.24, 0.25, 0.64, 1.05]`
 * hem monotonik degildi -- 6. seviyeden 7'ye gecmek DPS'i 59.8'den 48.5'e
 * dusuruyordu, yani oyuncu altin ve deneyim harcayip kuleyi kotulestiriyordu --
 * hem de odemenin tamamini 9. ve 10. seviyeye yigiyordu.
 *
 * Ucube'nin "buyuyerek degisir" kimligi seviye seciminde: 4, 6, 8 ve 10.
 * seviyelerde oyuncunun onune iki secenek cikiyor. Hasar egrisinin ayrica
 * geciktirmesi gereksiz; rampa dusuk basliyor ama duzgun tirmaniyor.
 */
export function getUcubeGrowthDamageMultiplier(level: number) {
  return 0.5 + levelRatio(level) * 0.55;
}

export function getTrackerFireInterval(level: number) {
  return 720 - ((clampLevel(level) - 1) / 9) * (720 - 333);
}

export function getZeynepHizaFireInterval(level: number) {
  return 1000 - ((clampLevel(level) - 1) / 9) * 600;
}

export function getZeynepHizaDamageCompensation(level: number) {
  const clampedLevel = clampLevel(level);
  const oldInterval = Math.max(TOWER_MIN_FIRE_INTERVAL_MS, 330 * (1 - (clampedLevel - 1) * 0.1));
  // Preserve the pre-nerf per-hit damage compensation. The doubled firing
  // interval must lower DPS rather than silently doubling each projectile.
  const compensatedInterval = 500 - ((clampedLevel - 1) / 9) * 300;
  return compensatedInterval / oldInterval;
}

export function getKinFireInterval(level: number) {
  return 5000 - ((clampLevel(level) - 1) / 9) * 2000;
}

export function getZeynepShowcaseBeamLength(level: number) {
  return ZEYNEP_SHOWCASE_BASE_LENGTH + (Math.max(1, level) - 1) * ZEYNEP_SHOWCASE_LENGTH_PER_LEVEL;
}

/**
 * Seviye basina atis araligi kazanci.
 *
 * Hasar egrisiyle birlikte kisildi: -%10 iken 10. seviyede aralik taban degerin
 * onda birine iniyordu ve hasar buyumesiyle carpilinca seviye tek basina her
 * seyi belirliyordu. Detay icin `DAMAGE_PER_LEVEL`.
 */
export const FIRE_INTERVAL_PER_LEVEL = 0.06;

/**
 * Obsesyon'un ayri bir adimi vardi (-%17) ama bu hicbir zaman atis hizina
 * donusmuyordu: `impact` kuleleri sabit aralikla ateS ediyor ve kazanilmayan
 * hiz `getTowerImpactDamageCompensation` uzerinden hasara ceviriliyor. Yani ayri
 * adim yalnizca gizli bir hasar carpani uretiyordu ve 10. seviyede kuleyi genel
 * egrinin bes katina ciakriyordu. Kimlik artik gorunur yerde: ayni hedefte
 * biriken stack.
 */
export function getTowerLevelIntervalMultiplier(_definitionId: string, level: number) {
  return 1 - (level - 1) * FIRE_INTERVAL_PER_LEVEL;
}

/**
 * Impact towers do not fire faster with level, so the fire-rate they would have
 * gained is paid back as damage instead.
 */
export function getTowerImpactDamageCompensation(definition: TowerDefinition, level: number) {
  const previousInterval = Math.max(
    TOWER_MIN_FIRE_INTERVAL_MS,
    definition.fireIntervalMs * getTowerLevelIntervalMultiplier(definition.id, level)
  );
  const currentInterval = Math.max(TOWER_MIN_FIRE_INTERVAL_MS, definition.fireIntervalMs);
  return currentInterval / Math.max(1, previousInterval);
}

/** Damage a single shot lands with no auras, cards, shop items or streaks. */
export function getTowerBaseLevelDamage(definition: TowerDefinition, level: number) {
  let damage = calculateTowerScaledBaseDamage(definition, level);

  if (definition.id === "warrior-4") damage *= getObsessionDamageMultiplier(level);
  if (definition.id === "warrior-5") damage *= getDebugLaserDamageMultiplier(level, false);
  if (definition.id === "warrior-6") damage *= getUcubeGrowthDamageMultiplier(level);
  if (definition.id === "zeynep-1") damage *= getZeynepHizaDamageCompensation(level);
  if (definition.hitType === "impact") damage *= getTowerImpactDamageCompensation(definition, level);

  return damage;
}

/** Game-time milliseconds between shots with no haste, stacks or passives. */
export function getTowerBaseLevelFireIntervalMs(definition: TowerDefinition, level: number) {
  if (definition.engine?.fixedFireInterval) return definition.fireIntervalMs;
  if (definition.id === "warrior-5") return getDebugLaserFireInterval(level, false);
  if (definition.hitType === "impact") return Math.max(TOWER_MIN_FIRE_INTERVAL_MS, definition.fireIntervalMs);
  if (definition.id === "warrior-1") return getTrackerFireInterval(level);
  if (definition.id === "zeynep-1") return getZeynepHizaFireInterval(level);
  if (definition.id === "zeynep-6") return getKinFireInterval(level);

  return Math.max(
    TOWER_MIN_FIRE_INTERVAL_MS,
    definition.fireIntervalMs * getTowerLevelIntervalMultiplier(definition.id, level)
  );
}

/** Wall-clock milliseconds between shots, which is what a player actually feels. */
export function getTowerRealFireIntervalMs(definition: TowerDefinition, level: number) {
  return getTowerBaseLevelFireIntervalMs(definition, level) / GAME_SPEED_MULTIPLIER;
}

/** Sunucu covers the whole arena, so no single number describes its reach. */
export function hasGlobalTowerRange(definitionId: string) {
  return definitionId === "warrior-2";
}

/** World-unit attack radius on an unscaled map with no range auras. */
export function getTowerBaseLevelRange(definition: TowerDefinition, level: number) {
  if (hasGlobalTowerRange(definition.id)) return Infinity;

  const scaledRange = definition.id === "zeynep-2"
    ? getZeynepShowcaseBeamLength(level) * GLOBAL_TOWER_RANGE_MULTIPLIER
    : (definition.range + (level - 1) * TOWER_RANGE_PER_LEVEL) * GLOBAL_TOWER_RANGE_MULTIPLIER;

  if (!definition.engine?.attack.rangeStartsAtFootprint) return scaledRange;

  return TOWER_GRID_SIZE * getTowerGridSpan(definition.id) / 2 + scaledRange;
}

/** Closest distance a tower will engage at; non-zero only for dead-zone towers. */
export function getTowerBaseLevelMinimumRange(definition: TowerDefinition, level: number) {
  const multiplier = Math.max(0, definition.engine?.attack.minimumRangeMultiplier ?? 0);
  if (multiplier <= 0) return 0;

  const range = getTowerBaseLevelRange(definition, level);
  if (!definition.engine?.attack.rangeStartsAtFootprint) return range * multiplier;

  const footprintRadius = TOWER_GRID_SIZE * getTowerGridSpan(definition.id) / 2;
  return footprintRadius + Math.max(0, range - footprintRadius) * multiplier;
}

/** Damage per wall-clock second, so it is comparable across fire rates. */
export function getTowerRealDps(definition: TowerDefinition, level: number) {
  const damage = getTowerBaseLevelDamage(definition, level);
  const intervalMs = getTowerRealFireIntervalMs(definition, level);
  if (damage <= 0 || intervalMs <= 0) return 0;
  return damage / (intervalMs / 1000);
}

export type TowerDisplayStats = {
  damage: number;
  fireIntervalMs: number;
  realFireIntervalMs: number;
  range: number;
  minimumRange: number;
  dps: number;
  hasGlobalRange: boolean;
  hasFixedFireInterval: boolean;
};

export function getTowerDisplayStats(definition: TowerDefinition, level: number): TowerDisplayStats {
  return {
    damage: getTowerBaseLevelDamage(definition, level),
    fireIntervalMs: getTowerBaseLevelFireIntervalMs(definition, level),
    realFireIntervalMs: getTowerRealFireIntervalMs(definition, level),
    range: getTowerBaseLevelRange(definition, level),
    minimumRange: getTowerBaseLevelMinimumRange(definition, level),
    dps: getTowerRealDps(definition, level),
    hasGlobalRange: hasGlobalTowerRange(definition.id),
    hasFixedFireInterval: Boolean(definition.engine?.fixedFireInterval)
  };
}
