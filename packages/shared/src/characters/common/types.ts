import type { CharacterId } from "../../index.js";
import type { DamageType, HitType } from "../../combat.js";

export type AmmoType = "bullet" | "auraCrystal" | "powerCrystal";
export type TowerResourceProvider = "ammunition" | "energy";
export type TowerAxis = "amplify" | "dps" | "cc" | "economy" | "barricade";
export type TowerTargetingMode = "first" | "last" | "strongest" | "weakest" | "closest" | "marked" | "random";
export type TowerAttackShape = "single" | "line" | "cone" | "circle" | "beam";
export type TowerStatusEffectType = "slow" | "stun" | "fear" | "bind" | "convert" | "burn" | "chill" | "curse" | "mark";
export type TowerTriggerEvent = "kill" | "towerDeath" | "escape" | "overheat" | "ammoEmpty";
export type TowerTriggerCondition = "targetMarked";
export type TowerTriggerDefinition = {
  event: TowerTriggerEvent;
  effect: string;
  cooldownMs?: number;
  condition?: TowerTriggerCondition;
};
export type TowerStatusEffectDefinition = {
  type: TowerStatusEffectType;
  magnitude: number;
  durationMs: number;
  stacking?: "none" | "refresh" | "add";
  maxStacks?: number;
  scaling?: "none" | "distance";
};
export type TowerStackTrigger = "hit" | "kill" | "wave" | "sameTarget" | "activeSecond";
export type TowerStackStat = "damage" | "fireRate" | "slow" | "storedDamage";
export type TowerStackResetReason = "targetChange" | "noTarget" | "waveEnd";
export type TowerStackDefinition = {
  id: string;
  trigger: TowerStackTrigger;
  stat: TowerStackStat;
  perStack: number;
  max?: number;
  decayMs?: number;
  resetOn?: TowerStackResetReason;
};
export type TowerAuraStat = "damage" | "range" | "slow" | "armor" | "synthesis";
export type TowerAuraDefinition = {
  affects: "towers" | "enemies";
  shape: "circle" | "line";
  radius: number;
  stat: TowerAuraStat;
  multiplier: number;
  stacking?: "strongest" | "multiply";
  scope?: "owner" | "team";
  tickIntervalMs?: number;
  refreshDurationMultiplier?: number;
  activation?: "always" | "isolated";
  multiplierPerLevel?: number;
  minMultiplier?: number;
  maxMultiplier?: number;
};
export type TowerLevelScalingDefinition = {
  stat: "damage";
  perLevel: number;
  source?: "base" | "keystone";
};

export type TowerEngineConfig = {
  targeting: TowerTargetingMode;
  targetingByState?: Partial<Record<"approval" | "stress" | "balanced", TowerTargetingMode>>;
  attack: {
    shape: TowerAttackShape;
    width?: number;
    length?: number;
    angle?: number;
    radius?: number;
    pierceCount?: number;
  };
  statusEffects?: TowerStatusEffectDefinition[];
  stacks?: TowerStackDefinition[];
  auras?: TowerAuraDefinition[];
  triggers?: TowerTriggerDefinition[];
  damageTypeByMode?: Record<string, DamageType>;
  levelScaling: TowerLevelScalingDefinition[];
  appliesMark?: { id: string; damageMultiplier: number; durationMs: number };
  consumesMarks?: string[];
  placement?: {
    requiresEdge?: boolean;
    footprintSpan?: number;
    minDistanceFromTowers?: number;
    requiresPathAdjacent?: boolean;
  };
  resources: {
    ammoType: AmmoType;
    shotFuel: "ammo" | "energy";
    operatingEnergyPerSecond: number;
    ammoCostMultiplier: number;
    energyCostMultiplier: number;
    heatMultiplier: number;
  };
  canHitAir: boolean;
  locksTarget?: boolean;
  resourceProvider?: TowerResourceProvider;
};

export type TowerDefinition = {
  id: string;
  characterId: CharacterId;
  name: string;
  role: string;
  description?: string;
  classType?: "damage" | "support" | "control" | "hybrid";
  damageType?: DamageType;
  hitType?: HitType;
  axes?: TowerAxis[];
  engine?: TowerEngineConfig;
  cost: number;
  upgradeCost: number;
  range: number;
  damage: number;
  fireIntervalMs: number;
  projectileSpeed: number;
  /** @deprecated Engine attack.radius is authoritative. */
  aoeRadius?: number;
  /** @deprecated Engine statusEffects is authoritative. */
  slowMs?: number;
  color: number;
  resourceProvider?: TowerResourceProvider;
};

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  cooldownMs: number;
};

export type CharacterDefinition = {
  id: CharacterId;
  displayName: string;
  role: string;
  theme?: string;
  summary: string;
  maxHp: number;
  speed: number;
  damage: number;
  fireIntervalMs: number;
  projectileSpeed: number;
  passive: string;
  ultimate: string;
  towers: TowerDefinition[];
  skills: SkillDefinition[];
};
