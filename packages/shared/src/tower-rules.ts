import type { DamageType, HitType } from "./combat.js";
import type { AmmoType, TowerDefinition } from "./characters/common/types.js";
import { getModifierAdd, type Modifier } from "./modifiers/index.js";

export const TOWER_BASE_AMMO_COST = 1;
export const TOWER_BASE_ENERGY_COST = 4.1;
export const TOWER_BASE_DAMAGE_MULTIPLIER = 2;
export const TOWER_BASE_CRITICAL_CHANCE = 0.01;
export const TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER = 2;
export const FUEL_NORMALIZATION_INTERVAL_MS = 700;
export const FUEL_NORMALIZATION_EXPONENT = 0.75;
export const PASSIVE_TOWER_INTERVAL_THRESHOLD_MS = 10000;
export const NON_FIRING_INTERVAL_MS = 999999;
export const PASSIVE_AURA_TICK_INTERVAL_MS = 2000;
export const AURA_REFRESH_DURATION_MULTIPLIER = 2;
export const ORBIT_BLADE_LENGTH_MAX_MULTIPLIER = 2.5;
export const ORBIT_CONTINUOUS_ENERGY_PER_SECOND = 1;
export const ORBIT_CONTINUOUS_HEAT_PER_SECOND = 9;
export const ENERGY_OUTAGE_TRACKING_DELAY_MS = 1000;
export const ENERGY_OUTAGE_AURA_DELAY_MS = 2000;
export const TOWER_OPERATING_ENERGY_BY_HIT_TYPE: Record<HitType, number> = {
  none: 0,
  projectile: 0.6,
  impact: 0.9,
  wave: 0.9,
  curse: 0.9,
  contamination: 0.9,
  focus: 1.4,
  slash: 1.4,
  aura: 1.2
};

export function getTowerFuelCostMultiplier(fireIntervalMs: number) {
  if (fireIntervalMs > PASSIVE_TOWER_INTERVAL_THRESHOLD_MS) return 0;
  return Math.pow(Math.max(1, fireIntervalMs) / FUEL_NORMALIZATION_INTERVAL_MS, FUEL_NORMALIZATION_EXPONENT);
}

export function getTowerShotFuel(hitType: HitType | undefined): "ammo" | "energy" {
  return hitType === "focus" || hitType === "aura" || hitType === "slash" ? "energy" : "ammo";
}

export function getTowerOperatingEnergyPerSecond(hitType: HitType | undefined) {
  return TOWER_OPERATING_ENERGY_BY_HIT_TYPE[hitType ?? "projectile"];
}

/**
 * Atis basina isi.
 *
 * Isi vurus basina odenir: hizli atesleyen kule daha cabuk isinir, cunku isiyi
 * ureten sey atisin kendisidir. Sogutma saniyede 3 derece, yani bir kulenin
 * kilitlenip kilitlenmedigini bu sayinin atis araligina bolumu belirler.
 *
 * `focus` degeri digerlerinin yaninda kasitli olarak cok dusuk: bu tipteki
 * kuleler saniyede birkac kez vurdugu icin normal bir atis isisi onlari
 * saniyeler icinde kilitler -- Debug Lazer 0.2 saniyede bir atesliyor.
 */
export const TOWER_HEAT_BY_HIT_TYPE: Record<HitType, number> = {
  none: 0,
  impact: 22,
  wave: 20,
  projectile: 10,
  focus: 1,
  aura: 1,
  slash: 1.2,
  curse: 0.5,
  contamination: 0.5
};

export function getOrbitRotationSpeed(rotationSpeed: number, definedFireIntervalMs: number, effectiveFireIntervalMs: number) {
  return Math.max(0, rotationSpeed) * Math.max(1, definedFireIntervalMs) / Math.max(1, effectiveFireIntervalMs);
}

export function getOrbitBladeLength(bladeLength: number, rangeMultiplier: number) {
  return Math.min(
    Math.max(0, bladeLength) * ORBIT_BLADE_LENGTH_MAX_MULTIPLIER,
    Math.max(0, bladeLength) * Math.sqrt(Math.max(0, rangeMultiplier))
  );
}

export function calculateOrbitContinuousCosts(rotationRatio: number, seconds: number) {
  const scale = Math.max(0, rotationRatio) * Math.max(0, seconds);
  return {
    energy: ORBIT_CONTINUOUS_ENERGY_PER_SECOND * scale,
    heat: ORBIT_CONTINUOUS_HEAT_PER_SECOND * scale
  };
}

export const TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER: Record<DamageType, number> = {
  fire: 1.6,
  electric: 1.3,
  light: 1.1,
  physical: 1,
  true: 1,
  psychic: 0.4,
  cellular: 0.3,
  none: 1
};

export function getTowerPerformanceHeatMultiplier(performance: number) {
  const safePerformance = Math.max(0, Math.min(1, performance));
  return safePerformance <= 0.5
    ? safePerformance * 2
    : 1 + (safePerformance - 0.5) * 6;
}

export function getTowerPerformanceEnergyMultiplier(performance: number) {
  const safePerformance = Math.max(0, Math.min(1, performance));
  return safePerformance <= 0.5
    ? safePerformance * 2
    : 1 + (safePerformance - 0.5) * 4;
}

/** Visual intensity for the high-performance flame, including a faint 50% pilot glow. */
export function getTowerPerformanceFlameIntensity(performance: number) {
  const safePerformance = Math.max(0, Math.min(1, performance));
  if (safePerformance < 0.5) return 0;
  return 0.08 + ((safePerformance - 0.5) / 0.5) * 0.92;
}

export function calculateTowerShotHeat(definition: TowerDefinition, performance: number, towerSpecialMultiplier = 1) {
  const hitType = definition.hitType ?? "projectile";
  const damageType = definition.damageType ?? "physical";
  return TOWER_HEAT_BY_HIT_TYPE[hitType]
    * TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER[damageType]
    * getTowerPerformanceHeatMultiplier(performance)
    * towerSpecialMultiplier
    * (definition.engine?.resources.heatMultiplier ?? 1);
}

export function calculateTowerShotEnergy(performance: number, energyCostMultiplier = 1) {
  return TOWER_BASE_ENERGY_COST * getTowerPerformanceEnergyMultiplier(performance) * energyCostMultiplier;
}

export function calculateTowerAmmoCost(definition: TowerDefinition, modifierMultiplier = 1) {
  if (definition.engine?.resources.shotFuel !== "ammo") return 0;
  return TOWER_BASE_AMMO_COST * (definition.engine.resources.ammoCostMultiplier ?? 1) * modifierMultiplier;
}

export function calculateTowerShotEnergyCost(definition: TowerDefinition, performance: number, modifierMultiplier = 1) {
  if (definition.engine?.resources.shotFuel !== "energy") return 0;
  return calculateTowerShotEnergy(performance, definition.engine.resources.energyCostMultiplier ?? 1) * modifierMultiplier;
}

export function getTowerShotFuelModifierMultiplier(modifiers: readonly Modifier[], specific: "ammoCost" | "energyCost") {
  return Math.max(0, 1 + getModifierAdd(modifiers, specific) + getModifierAdd(modifiers, "shotFuelCost"));
}

export function calculateTowerOperatingEnergy(definition: TowerDefinition, seconds: number, modifierMultiplier = 1) {
  if (definition.resourceProvider) return 0;
  return Math.max(0, definition.engine?.resources.operatingEnergyPerSecond ?? 0) * Math.max(0, seconds) * modifierMultiplier;
}

export function isPeriodicTowerAura(definition: TowerDefinition) {
  return !definition.resourceProvider
    && Boolean(definition.engine?.auras?.length);
}

export function calculateTowerEnergyPerSecond(definition: TowerDefinition, performance = 0.5) {
  const intervalSeconds = Math.max(0.001, definition.fireIntervalMs / 1000);
  return calculateTowerShotEnergyCost(definition, performance) / intervalSeconds
    + calculateTowerOperatingEnergy(definition, 1);
}

export function shouldConsumeTowerOperatingEnergy(definition: TowerDefinition, setupPhase: boolean, standby: boolean) {
  return !definition.resourceProvider && !setupPhase && !standby;
}

export type TowerEnergyState = "powered" | "fire-off" | "tracking-off" | "offline";

export function getTowerEnergyState(energy: number, depletedAt: number, now: number): TowerEnergyState {
  if (energy > 0 || depletedAt <= 0) return "powered";
  const elapsed = Math.max(0, now - depletedAt);
  if (elapsed < ENERGY_OUTAGE_TRACKING_DELAY_MS) return "fire-off";
  if (elapsed < ENERGY_OUTAGE_AURA_DELAY_MS) return "tracking-off";
  return "offline";
}

export function calculateTowerScaledBaseDamage(definition: TowerDefinition, level: number) {
  const safeLevel = Math.max(1, Math.min(10, Math.round(level)));
  const damagePerLevel = definition.engine?.levelScaling
    .filter((scaling) => scaling.stat === "damage")
    .reduce((total, scaling) => total + scaling.perLevel, 0) ?? 0;
  return definition.damage * TOWER_BASE_DAMAGE_MULTIPLIER * (1 + (safeLevel - 1) * damagePerLevel);
}

export function inferTowerAmmoType(definition: TowerDefinition): AmmoType {
  if (definition.engine) {
    return definition.engine.resources.ammoType;
  }
  if (definition.hitType === "focus") {
    return "powerCrystal";
  }
  if (definition.hitType && ["aura", "wave", "curse"].includes(definition.hitType)) {
    return "auraCrystal";
  }
  return "bullet";
}
