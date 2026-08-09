import type { DamageType, HitType } from "./combat.js";
import type { AmmoType, TowerDefinition } from "./characters/common/types.js";

export const TOWER_BASE_AMMO_COST = 1;
export const TOWER_BASE_ENERGY_COST = 4.1;
export const TOWER_BASE_DAMAGE_MULTIPLIER = 2;
export const FUEL_NORMALIZATION_INTERVAL_MS = 700;
export const FUEL_NORMALIZATION_EXPONENT = 0.75;
export const PASSIVE_TOWER_INTERVAL_THRESHOLD_MS = 10000;
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
  aura: 1.2
};

export function getTowerFuelCostMultiplier(fireIntervalMs: number) {
  if (fireIntervalMs > PASSIVE_TOWER_INTERVAL_THRESHOLD_MS) return 0;
  return Math.pow(Math.max(1, fireIntervalMs) / FUEL_NORMALIZATION_INTERVAL_MS, FUEL_NORMALIZATION_EXPONENT);
}

export function getTowerShotFuel(hitType: HitType | undefined): "ammo" | "energy" {
  return hitType === "focus" || hitType === "aura" ? "energy" : "ammo";
}

export function getTowerOperatingEnergyPerSecond(hitType: HitType | undefined) {
  return TOWER_OPERATING_ENERGY_BY_HIT_TYPE[hitType ?? "projectile"];
}

export const TOWER_HEAT_BY_HIT_TYPE: Record<HitType, number> = {
  none: 0,
  impact: 22,
  wave: 20,
  projectile: 7,
  focus: 2.5,
  aura: 1,
  curse: 0.5,
  contamination: 0.5
};

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

export function calculateTowerOperatingEnergy(definition: TowerDefinition, seconds: number, modifierMultiplier = 1) {
  if (definition.resourceProvider) return 0;
  return Math.max(0, definition.engine?.resources.operatingEnergyPerSecond ?? 0) * Math.max(0, seconds) * modifierMultiplier;
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
