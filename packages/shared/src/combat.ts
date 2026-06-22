export type DamageType = "physical" | "electric" | "psychic" | "fire" | "light" | "cellular" | "true" | "none";
export type HitType = "projectile" | "impact" | "focus" | "aura" | "contamination";
export type MovementKind = "ground" | "air";
export type StatusEffectId = "slow" | "fear" | "tracking";

export type ResistanceTable<T extends string> = Partial<Record<T, number>>;

export type EnemyCombatDefinition = {
  maxHp: number;
  armor: number;
  healthRegenPerSecond: number;
  speed: number;
  shield: number;
  movementKind: MovementKind;
  reward: number;
  damageResistances?: ResistanceTable<DamageType>;
  hitTypeResistances?: ResistanceTable<HitType>;
  statusResistances?: ResistanceTable<StatusEffectId>;
  abilities?: string[];
};

export type DamagePacket = {
  amount: number;
  damageType: DamageType;
  hitType?: HitType;
};

export type DamageResult = {
  rawDamage: number;
  shieldDamage: number;
  hpDamage: number;
  totalDamage: number;
  remainingShield: number;
};

export const enemyCombatDefinitions = {
  grunt: {
    maxHp: 46,
    armor: 5,
    healthRegenPerSecond: 0,
    speed: 50,
    shield: 0,
    movementKind: "ground",
    reward: 12,
    damageResistances: {},
    hitTypeResistances: {},
    statusResistances: {}
  },
  brute: {
    maxHp: 76,
    armor: 34,
    healthRegenPerSecond: 0.35,
    speed: 34,
    shield: 18,
    movementKind: "ground",
    reward: 18,
    damageResistances: {
      physical: 0.08,
      fire: -0.08
    },
    hitTypeResistances: {
      projectile: -0.2,
      impact: 0.2,
      focus: 0.2
    },
    statusResistances: {
      slow: 0.2,
      fear: 0.25
    },
    abilities: ["heavy-body"]
  },
  runner: {
    maxHp: 30,
    armor: 0,
    healthRegenPerSecond: 0,
    speed: 90,
    shield: 0,
    movementKind: "ground",
    reward: 11,
    damageResistances: {
      electric: -0.08
    },
    hitTypeResistances: {
      focus: -0.2,
      projectile: 0.2
    },
    statusResistances: {
      slow: 0.35
    },
    abilities: ["fast"]
  },
  shooter: {
    maxHp: 42,
    armor: 10,
    healthRegenPerSecond: 0.18,
    speed: 44,
    shield: 30,
    movementKind: "ground",
    reward: 14,
    damageResistances: {
      psychic: 0.08
    },
    hitTypeResistances: {},
    statusResistances: {},
    abilities: ["ranged-shot"]
  }
} as const satisfies Record<string, EnemyCombatDefinition>;

export function getEnemyCombatDefinition(enemyType: keyof typeof enemyCombatDefinitions): EnemyCombatDefinition {
  return enemyCombatDefinitions[enemyType];
}

export function calculateArmorDamageMultiplier(armor: number) {
  if (armor >= 0) {
    return 100 / (100 + armor);
  }

  return 2 - 100 / (100 - armor);
}

export function calculateDamageTaken(
  packet: DamagePacket,
  target: {
    armor: number;
    shield: number;
    damageResistances?: ResistanceTable<DamageType>;
    hitTypeResistances?: ResistanceTable<HitType>;
  }
): DamageResult {
  const armorMultiplier = packet.damageType === "true" ? 1 : calculateArmorDamageMultiplier(target.armor);
  const resistance = target.damageResistances?.[packet.damageType] ?? 0;
  const resistanceMultiplier = Math.max(0, 1 - resistance);
  const hitTypeResistance = packet.damageType !== "true" && packet.hitType ? target.hitTypeResistances?.[packet.hitType] ?? 0 : 0;
  const hitTypeResistanceMultiplier = Math.max(0, 1 - hitTypeResistance);
  const rawDamage = Math.max(0, packet.amount * armorMultiplier * resistanceMultiplier * hitTypeResistanceMultiplier);
  const shieldDamage = Math.min(target.shield, rawDamage);
  const hpDamage = rawDamage - shieldDamage;

  return {
    rawDamage,
    shieldDamage,
    hpDamage,
    totalDamage: shieldDamage + hpDamage,
    remainingShield: Math.max(0, target.shield - shieldDamage)
  };
}

export function applyStatusResistance(durationMs: number, resistance = 0) {
  return Math.max(0, durationMs * Math.max(0, 1 - resistance));
}
