import type { TowerDefinition, TowerEngineConfig } from "./types.js";

type EngineProfile = Omit<TowerEngineConfig, "resources"> & {
  resources?: Partial<TowerEngineConfig["resources"]>;
};

const defaultEngine: TowerEngineConfig = {
  targeting: "first",
  attack: { shape: "single", pierceCount: 1 },
  resources: { ammoType: "bullet", ammoCostMultiplier: 1, energyCostMultiplier: 1, heatMultiplier: 1 },
  canHitAir: false
};

const profiles: Record<string, EngineProfile> = {
  "warrior-1": { targeting: "first", attack: { shape: "single", pierceCount: 1 }, canHitAir: true, appliesMark: { id: "tracking", damageMultiplier: 1.1, durationMs: 6500 } },
  "warrior-2": { targeting: "first", attack: { shape: "circle" }, canHitAir: false },
  "warrior-3": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, statusEffects: [{ type: "slow", magnitude: 1, durationMs: 850, stacking: "refresh" }], auras: [{ affects: "enemies", shape: "circle", radius: 104, stat: "slow", multiplier: 0.48, stacking: "strongest" }], placement: { minDistanceFromTowers: 1 }, resources: { ammoType: "auraCrystal" } },
  "warrior-4": { targeting: "strongest", attack: { shape: "single", pierceCount: 1 }, canHitAir: true, stacks: [{ id: "obsession", trigger: "sameTarget", stat: "damage", perStack: 0.2, max: 10, resetOn: "targetChange" }] },
  "warrior-5": { targeting: "marked", attack: { shape: "beam" }, canHitAir: false, consumesMarks: ["tracking"], triggers: [{ event: "overheat", effect: "disable" }, { event: "kill", effect: "marked-overdrive", condition: "targetMarked" }] , resources: { ammoType: "powerCrystal" } },
  "warrior-6": { targeting: "first", attack: { shape: "single", pierceCount: 1 }, canHitAir: true, stacks: [{ id: "ucube-fire-rate", trigger: "activeSecond", stat: "fireRate", perStack: 0.04539007092198582, resetOn: "noTarget" }], triggers: [{ event: "overheat", effect: "disable" }] },
  "warrior-7": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "ammunition", resources: { ammoType: "auraCrystal" } },
  "warrior-8": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "energy", resources: { ammoType: "auraCrystal" } },

  "zeynep-1": { targeting: "first", attack: { shape: "line", pierceCount: 2 }, canHitAir: true },
  "zeynep-2": { targeting: "first", attack: { shape: "line" }, canHitAir: true, resources: { ammoType: "powerCrystal" } },
  "zeynep-3": { targeting: "first", attack: { shape: "beam" }, canHitAir: true, resources: { ammoType: "powerCrystal" } },
  "zeynep-6": { targeting: "first", attack: { shape: "cone", angle: 60 }, canHitAir: true, statusEffects: [{ type: "slow", magnitude: 1, durationMs: 1150, stacking: "refresh", scaling: "distance" }], resources: { ammoType: "auraCrystal" } },
  "zeynep-7": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, auras: [{ affects: "towers", shape: "circle", radius: 0, stat: "synthesis", multiplier: 1 }] , resources: { ammoType: "auraCrystal" } },
  "zeynep-8": { targeting: "first", attack: { shape: "line" }, canHitAir: false, placement: { requiresEdge: true }, auras: [{ affects: "towers", shape: "line", radius: 0, stat: "damage", multiplier: 1 }] , resources: { ammoType: "auraCrystal" } },
  "zeynep-9": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "ammunition", resources: { ammoType: "auraCrystal" } },
  "zeynep-10": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "energy", resources: { ammoType: "auraCrystal" } },

  "archer-1": { targeting: "first", attack: { shape: "single", pierceCount: 1 }, canHitAir: true, locksTarget: true, stacks: [{ id: "shared-focus", trigger: "sameTarget", stat: "damage", perStack: 0.1, resetOn: "targetChange" }] },
  "archer-2": { targeting: "first", attack: { shape: "circle" }, canHitAir: true, locksTarget: true, statusEffects: [{ type: "fear", magnitude: 1, durationMs: 500, stacking: "refresh" }], triggers: [{ event: "escape", effect: "rage-wave" }, { event: "kill", effect: "rage-wave-on-kill" }] },
  "archer-3": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, statusEffects: [{ type: "curse", magnitude: 1, durationMs: 0, stacking: "add" }], stacks: [{ id: "curse-pool", trigger: "hit", stat: "storedDamage", perStack: 1 }], triggers: [{ event: "kill", effect: "death-burst" }], resources: { ammoType: "auraCrystal" } },
  "archer-4": { targeting: "first", attack: { shape: "beam" }, canHitAir: true, locksTarget: true, statusEffects: [{ type: "bind", magnitude: 1, durationMs: 0, stacking: "none" }], resources: { ammoType: "powerCrystal" } },
  "archer-5": { targeting: "first", attack: { shape: "single", pierceCount: 1 }, canHitAir: false, stacks: [{ id: "mirror-storage", trigger: "hit", stat: "storedDamage", perStack: 1 }] },
  "archer-6": { targeting: "first", attack: { shape: "circle" }, canHitAir: true, statusEffects: [{ type: "slow", magnitude: 0.1, durationMs: 0, stacking: "add", maxStacks: 3 }, { type: "stun", magnitude: 1, durationMs: 350, stacking: "none" }], stacks: [{ id: "doubt", trigger: "hit", stat: "slow", perStack: 0.1, max: 3 }], resources: { ammoType: "auraCrystal" } },
  "archer-7": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "ammunition", resources: { ammoType: "auraCrystal" } },
  "archer-8": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "energy", resources: { ammoType: "auraCrystal" } }
};

export function attachTowerEngine(definition: Omit<TowerDefinition, "engine">): TowerDefinition {
  const profile = profiles[definition.id];
  if (!profile) {
    throw new Error(`Missing tower engine profile: ${definition.id}`);
  }
  return {
    ...definition,
    engine: {
      ...defaultEngine,
      ...profile,
      attack: {
        ...profile.attack,
        pierceCount: profile.attack.pierceCount ?? (profile.attack.shape === "single" ? 1 : undefined)
      },
      resources: { ...defaultEngine.resources, ...profile.resources },
      resourceProvider: profile.resourceProvider ?? definition.resourceProvider
    }
  };
}
