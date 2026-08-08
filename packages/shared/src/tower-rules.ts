import type { DamageType, HitType } from "./combat.js";
import type { AmmoType, TowerDefinition } from "./characters/common/types.js";

export const TOWER_BASE_AMMO_COST = 1;
export const TOWER_BASE_ENERGY_COST = 4;
export const TOWER_BASE_DAMAGE_MULTIPLIER = 2;

export const TOWER_HEAT_BY_HIT_TYPE: Record<HitType, number> = {
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
