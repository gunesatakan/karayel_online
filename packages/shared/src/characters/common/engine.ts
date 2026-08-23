import type { TowerDefinition, TowerEngineConfig } from "./types.js";
import { PASSIVE_AURA_TICK_INTERVAL_MS, getTowerFuelCostMultiplier, getTowerOperatingEnergyPerSecond, getTowerShotFuel } from "../../tower-rules.js";

const towerAxes: Record<string, NonNullable<TowerDefinition["axes"]>> = {
  "wall-1": ["barricade"],
  "warrior-1": ["amplify", "dps"],
  "warrior-2": ["amplify", "dps"],
  "warrior-3": ["cc"],
  "warrior-4": ["dps"],
  "warrior-5": ["dps"],
  "warrior-6": ["dps"],
  "warrior-7": ["economy"],
  "warrior-8": ["economy"],
  "archer-1": ["dps", "amplify"],
  "archer-2": ["dps", "cc"],
  "archer-3": ["dps"],
  "archer-4": ["barricade", "dps"],
  "archer-5": ["dps"],
  "archer-6": ["cc", "barricade"],
  "archer-7": ["economy"],
  "archer-8": ["economy"],
  "zeynep-1": ["dps"],
  "zeynep-2": ["dps"],
  "zeynep-3": ["amplify", "dps"],
  "zeynep-6": ["cc"],
  "zeynep-7": ["amplify"],
  "zeynep-8": ["amplify"],
  "zeynep-9": ["economy"],
  "zeynep-10": ["economy"]
};

type EngineProfile = Omit<TowerEngineConfig, "resources" | "levelScaling"> & {
  resources?: Partial<TowerEngineConfig["resources"]>;
  levelScaling?: TowerEngineConfig["levelScaling"];
};

/**
 * Seviye basina hasar buyumesi.
 *
 * Eskiden 0.42 idi ve seviye basina -%10 atis araligiyla birlesince bir kuleyi
 * 1'den 10'a cikarmak DPS'i **48 katina** ciakriyordu. Kart katmaninin tamami bir
 * kuleye en fazla 2-3 kat verirken, karakterlerin imza mekanikleri de +%24 ile
 * +%32 arasindaydi. Yani oyunun butun ilginc kararlari -- Atakan'in yalnizlik
 * yerlesimi, Zeynep'in dizilim geometrisi, kart secimleri -- tek bir sayinin
 * golgesinde kaliyor, dogru oynanis "iki kuleyi maxla" oluyordu.
 *
 * Yeni degerlerle 1->10 araligi ~12 kata iner. Seviye hala en buyuk tek kaynak
 * ama artik tek kaynak degil.
 *
 * Seviyenin katkisi ayni zamanda atis hizindan hasara kaydirildi: aralik adimi
 * -%10'dan -%6'ya inerken hasar adimi 0.42'den 0.50'ye cikti. Boylece elle
 * ayarlanmis aralik egrileri (Takipci 0.46, Hiza 0.40, Kin ve Debug 0.60) genel
 * egriyle (0.46) ayni bantta bulusuyor; onceki -%10 ile hepsi ayri dunyadaydi.
 */
const DAMAGE_PER_LEVEL = 0.5;

const defaultEngine: TowerEngineConfig = {
  targeting: "first",
  attack: { shape: "single", pierceCount: 1 },
  levelScaling: [{ stat: "damage", perLevel: DAMAGE_PER_LEVEL, source: "base" }],
  resources: { ammoType: "bullet", shotFuel: "ammo", operatingEnergyPerSecond: 0.6, ammoCostMultiplier: 1, energyCostMultiplier: 1, heatMultiplier: 1 },
  canHitAir: false
};

const profiles: Record<string, EngineProfile> = {
  // Duvar ates etmez; motor yalnizca yerlestirme ve kaynak hatti icin gerekli.
  // Duvar kare degil kenar kaplar: Abarti ile ayni yerlestirme yolu, ama tek
  // cizgi uzunlugunda ve yonu getirildigi kenardan turetiliyor.
  "wall-1": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, placement: { requiresEdge: true }, resources: { ammoType: "auraCrystal" } },
  "onur-1": {
    targeting: undefined,
    // Donme hizi burada yazilmaz: bicagin gecis periyodu kulenin ates
    // araligindan turetilir, boylece ilan edilen atis hizi gercekten vurdugu hiz
    // olur. Karttan gelen ek bicak periyodu kisaltir, yani gercek bir hasar
    // artisidir.
    attack: { shape: "orbit", executor: "orbit", bladeCount: 2, bladeLength: 46, width: 8 },
    canHitAir: false,
    statusEffects: [{ type: "bleed", magnitude: 0.01, durationMs: 3000, stacking: "refresh" }],
    resources: { shotFuel: "energy", operatingEnergyPerSecond: 1.4 }
  },
  "onur-2": {
    targeting: "first",
    attack: { shape: "single", executor: "ballistic", pierceCount: 1, minimumRangeMultiplier: 0.5, rangeStartsAtFootprint: true },
    canHitAir: false,
    fixedFireInterval: true,
    critical: { damageMultiplier: 2, bonusChanceAgainstStatus: { type: "bleed", chance: 0.25 } }
  },
  "warrior-1": { targeting: "first", attack: { shape: "single", pierceCount: 1 }, canHitAir: true, appliesMark: { id: "tracking", damageMultiplier: 1.1, durationMs: 6500 } },
  "warrior-2": { targeting: "first", attack: { shape: "circle", radius: 18 }, canHitAir: false },
  "warrior-3": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, statusEffects: [{ type: "slow", magnitude: 1, durationMs: 850, stacking: "refresh" }], auras: [{ affects: "enemies", shape: "circle", radius: 104, stat: "slow", multiplier: 0.48, stacking: "strongest", tickIntervalMs: 220, refreshDurationMultiplier: 2, activation: "isolated", multiplierPerLevel: -0.026, minMultiplier: 0.25 }], placement: { minDistanceFromTowers: 1 }, resources: { ammoType: "auraCrystal" } },
  "warrior-4": { targeting: "strongest", attack: { shape: "single", pierceCount: 1 }, canHitAir: true, stacks: [{ id: "obsession", trigger: "sameTarget", stat: "damage", perStack: 0.2, max: 10, resetOn: "targetChange" }] },
  "warrior-5": { targeting: "marked", attack: { shape: "beam", executor: "debug-laser" }, canHitAir: false, consumesMarks: [{ id: "tracking", event: "hit", consumeStacks: 1 }], triggers: [{ event: "overheat", effect: "disable" }, { event: "kill", effect: "marked-overdrive", condition: "targetMarked" }] , resources: { ammoType: "powerCrystal" } },
  "warrior-6": { targeting: "first", attack: { shape: "single", pierceCount: 1 }, canHitAir: true, stacks: [{ id: "ucube-fire-rate", trigger: "activeSecond", stat: "fireRate", perStack: 0.04539007092198582, resetOn: "noTarget" }], triggers: [{ event: "overheat", effect: "disable" }] },
  "warrior-7": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "ammunition", resources: { ammoType: "auraCrystal" } },
  "warrior-8": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "energy", resources: { ammoType: "auraCrystal" } },

  "zeynep-1": { targeting: "first", attack: { shape: "line", pierceCount: 2 }, canHitAir: true },
  "zeynep-2": { targeting: "first", attack: { shape: "line", executor: "showcase-beam" }, canHitAir: true, resources: { ammoType: "powerCrystal" } },
  "zeynep-3": {
    targeting: "first",
    attack: { shape: "beam", executor: "synthesis" },
    canHitAir: true,
    damageTypeByMode: { "dual-projectile": "physical", "mirror-beam": "light", "burn-impact": "light" },
    resources: { ammoType: "powerCrystal" }
  },
  "zeynep-6": { targeting: "first", attack: { shape: "cone", angle: 60, executor: "kin-wave" }, canHitAir: true, statusEffects: [{ type: "slow", magnitude: 1, durationMs: 1150, stacking: "refresh", scaling: "distance" }], resources: { ammoType: "auraCrystal" } },
  "zeynep-7": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, auras: [{ affects: "towers", shape: "circle", radius: 0, stat: "synthesis", multiplier: 1, tickIntervalMs: PASSIVE_AURA_TICK_INTERVAL_MS, refreshDurationMultiplier: 2, activation: "always" }], placement: { footprintSpan: 2 }, resources: { ammoType: "auraCrystal" } },
  "zeynep-8": { targeting: "first", attack: { shape: "line" }, canHitAir: false, placement: { requiresEdge: true }, auras: [{ affects: "towers", shape: "line", radius: 0, stat: "damage", multiplier: 1, tickIntervalMs: PASSIVE_AURA_TICK_INTERVAL_MS, refreshDurationMultiplier: 2, activation: "always" }] , resources: { ammoType: "auraCrystal" } },
  "zeynep-9": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "ammunition", resources: { ammoType: "auraCrystal" } },
  "zeynep-10": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "energy", resources: { ammoType: "auraCrystal" } },

  "archer-1": { targeting: "first", attack: { shape: "single", pierceCount: 1 }, canHitAir: true, locksTarget: true, stacks: [{ id: "shared-focus", trigger: "sameTarget", stat: "damage", perStack: 0.1, resetOn: "targetChange" }] },
  "archer-2": { targeting: "first", attack: { shape: "circle" }, canHitAir: true, locksTarget: true, statusEffects: [{ type: "fear", magnitude: 1, durationMs: 500, stacking: "refresh" }], triggers: [{ event: "escape", effect: "rage-wave" }, { event: "kill", effect: "rage-wave-on-kill" }] },
  "archer-3": { targeting: "first", attack: { shape: "circle", radius: 42, executor: "curse-burst" }, canHitAir: false, statusEffects: [{ type: "curse", magnitude: 1, durationMs: 0, stacking: "add" }], stacks: [{ id: "curse-pool", trigger: "hit", stat: "storedDamage", perStack: 1 }], triggers: [{ event: "kill", effect: "death-burst" }], resources: { ammoType: "auraCrystal" } },
  "archer-4": { targeting: "first", attack: { shape: "beam" }, canHitAir: true, locksTarget: true, statusEffects: [{ type: "bind", magnitude: 1, durationMs: 0, stacking: "none" }], resources: { ammoType: "powerCrystal" } },
  "archer-5": { targeting: "strongest", targetingByState: { approval: "first", stress: "random", balanced: "strongest" }, attack: { shape: "single", pierceCount: 1 }, canHitAir: false, stacks: [{ id: "mirror-storage", trigger: "hit", stat: "storedDamage", perStack: 1 }] },
  "archer-6": { targeting: "first", attack: { shape: "circle", radius: 40, executor: "whisper-chorus" }, canHitAir: true, statusEffects: [{ type: "slow", magnitude: 0.1, durationMs: 0, stacking: "add", maxStacks: 3 }, { type: "stun", magnitude: 1, durationMs: 350, stacking: "none" }], stacks: [{ id: "doubt", trigger: "hit", stat: "slow", perStack: 0.1, max: 3 }], resources: { ammoType: "auraCrystal" } },
  "archer-7": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "ammunition", resources: { ammoType: "auraCrystal" } },
  "archer-8": { targeting: "first", attack: { shape: "circle" }, canHitAir: false, resourceProvider: "energy", resources: { ammoType: "auraCrystal" } }
};

export function deriveTowerResources(definition: Pick<TowerDefinition, "hitType" | "fireIntervalMs" | "resourceProvider">, overrides: Partial<TowerEngineConfig["resources"]> = {}): TowerEngineConfig["resources"] {
  const costMultiplier = getTowerFuelCostMultiplier(definition.fireIntervalMs);
  return {
    ...defaultEngine.resources,
    shotFuel: getTowerShotFuel(definition.hitType),
    operatingEnergyPerSecond: definition.resourceProvider ? 0 : getTowerOperatingEnergyPerSecond(definition.hitType),
    ammoCostMultiplier: costMultiplier,
    energyCostMultiplier: costMultiplier,
    ...overrides
  };
}

export function attachTowerEngine(definition: Omit<TowerDefinition, "engine">): TowerDefinition {
  const profile = profiles[definition.id];
  if (!profile) {
    throw new Error(`Missing tower engine profile: ${definition.id}`);
  }
  return {
    ...definition,
    axes: towerAxes[definition.id] ?? definition.axes ?? ["dps"],
    engine: {
      ...defaultEngine,
      ...profile,
      attack: {
        ...profile.attack,
        pierceCount: profile.attack.pierceCount ?? (profile.attack.shape === "single" ? 1 : undefined)
      },
      levelScaling: profile.levelScaling ?? defaultEngine.levelScaling.map((scaling) => ({ ...scaling })),
      resources: deriveTowerResources(definition, profile.resources),
      resourceProvider: profile.resourceProvider ?? definition.resourceProvider
    }
  };
}

export function getTowerAttackRadius(definition: TowerDefinition) {
  return definition.engine?.attack.radius ?? definition.aoeRadius ?? 0;
}

export function getTowerSlowDurationMs(definition: TowerDefinition) {
  return definition.engine?.statusEffects?.find((effect) => effect.type === "slow")?.durationMs ?? definition.slowMs ?? 0;
}

export function getTowerModeDamageType(definition: TowerDefinition, mode: string) {
  return definition.engine?.damageTypeByMode?.[mode] ?? definition.damageType ?? "none";
}
