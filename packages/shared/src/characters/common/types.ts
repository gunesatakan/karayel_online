import type { CharacterId } from "../../index.js";
import type { DamageType, HitType } from "../../combat.js";

export type AmmoType = "bullet" | "auraCrystal" | "powerCrystal";
export type TowerResourceProvider = "ammunition" | "energy";
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

export type TowerEngineConfig = {
  targeting: TowerTargetingMode;
  attack: {
    shape: TowerAttackShape;
    width?: number;
    length?: number;
    angle?: number;
    pierceCount?: number;
  };
  statusEffects?: TowerStatusEffectDefinition[];
  stacks?: TowerStackDefinition[];
  auras?: Array<{
    affects: "towers" | "enemies";
    shape: "circle" | "line";
    radius: number;
    stat: "damage" | "range" | "slow" | "armor" | "synthesis";
    multiplier: number;
  }>;
  triggers?: TowerTriggerDefinition[];
  appliesMark?: { id: string; damageMultiplier: number; durationMs: number };
  consumesMarks?: string[];
  placement?: {
    requiresEdge?: boolean;
    minDistanceFromTowers?: number;
    requiresPathAdjacent?: boolean;
  };
  resources: {
    ammoType: AmmoType;
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
  mechanics?: string[];
  engine?: TowerEngineConfig;
  cost: number;
  upgradeCost: number;
  range: number;
  damage: number;
  fireIntervalMs: number;
  projectileSpeed: number;
  aoeRadius: number;
  slowMs: number;
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
