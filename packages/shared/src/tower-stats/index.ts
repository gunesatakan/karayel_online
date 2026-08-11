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

export function getObsessionDamageMultiplier(level: number) {
  const multipliers = [1, 1.018, 1.036, 1.054, 1.072, 1.085349, 0.94697, 1.05753, 1.144, 1.162];
  return multipliers[clampLevel(level) - 1] ?? 1;
}

export function getDebugLaserDamageMultiplier(level: number, overdrive: boolean) {
  const normalMultipliers = [1.3333, 1.6976, 2.1449, 2.7057, 3.0879, 3.3535, 3.6001, 3.8235, 4.0196, 4.1841];
  const overdriveMultipliers = [1.92, 2.2001, 2.4709, 2.7273, 2.9643, 3.2194, 3.4561, 3.6706, 3.8589, 4.0167];
  const multipliers = overdrive ? overdriveMultipliers : normalMultipliers;
  return multipliers[clampLevel(level) - 1] ?? 1;
}

export function getDebugLaserFireInterval(level: number, overdrive: boolean) {
  const clampedLevel = clampLevel(level);
  const normalRealMs = clampedLevel <= 5
    ? 200 - (clampedLevel - 1) * 10
    : 160 - (clampedLevel - 5) * 8;
  const realMs = overdrive ? normalRealMs / 2 : normalRealMs;
  return realMs * GAME_SPEED_MULTIPLIER;
}

export function getUcubeGrowthDamageMultiplier(level: number) {
  const multipliers = [0.45, 0.4, 0.34, 0.34, 0.35, 0.42, 0.24, 0.25, 0.64, 1.05];
  return multipliers[clampLevel(level) - 1] ?? 1;
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

/** Obsesyon speeds up faster per level than everything else. */
export function getTowerLevelIntervalMultiplier(definitionId: string, level: number) {
  return definitionId === "warrior-4" ? 1 - (level - 1) * 0.17 : 1 - (level - 1) * 0.1;
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
