export type DamageType = "physical" | "electric" | "psychic" | "fire" | "light" | "cellular" | "true" | "none";
export type HitType = "projectile" | "impact" | "focus" | "aura" | "contamination" | "curse" | "wave" | "slash" | "none";
export type MovementKind = "ground" | "air";
export type StatusEffectId = "slow" | "stun" | "fear" | "bind" | "convert" | "burn" | "bleed" | "chill" | "curse" | "mark" | "tracking" | "freeze";
export type EnemyRace = "meka" | "spaceBug" | "fourthDimensional" | "holyGuardian" | "fallen" | "golem";

export type ResistanceTable<T extends string> = Partial<Record<T, number>>;

export type EnemyCombatDefinition = {
  race: EnemyRace;
  maxHp: number;
  armor: number;
  healthRegenPerSecond: number;
  speed: number;
  shield: number;
  movementKind: MovementKind;
  reward: number;
  /**
   * Yapilara vurusun gucu.
   *
   * Tek bir sayi cunku dusmanin hedefi ne olursa olsun -- kule, duvar,
   * isci -- ayni kolu sallıyor. Yapida zirh dusuluyor, iscide dusulmuyor:
   * iscinin zirhi yok.
   */
  attack: number;
  /**
   * Menzilli vurus mesafesi. Yazilmayan dusman yalnizca bitisigine vurur.
   *
   * Kule menzilleriyle ayni olcekte (cogu kule 104-134): menzilli dusman
   * kuleye biraz daha yakindan vurur, yani duello kulenin lehine acilir
   * ama dusman bedava hedef degildir.
   */
  attackRange?: number;
  damageResistances?: ResistanceTable<DamageType>;
  hitTypeResistances?: ResistanceTable<HitType>;
  statusResistances?: ResistanceTable<StatusEffectId>;
  abilities?: string[];
};

export type EnemyRaceDefinition = {
  damageResistances: ResistanceTable<DamageType>;
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

export const SHIELD_DAMAGE_TAKEN_MULTIPLIER = 0.5;

export const enemyRaceDefinitions = {
  meka: {
    damageResistances: {
      electric: -0.2,
      psychic: 0.2
    }
  },
  spaceBug: {
    damageResistances: {
      cellular: -0.2,
      fire: 0.2
    }
  },
  fourthDimensional: {
    damageResistances: {
      psychic: -0.2,
      physical: 0.2
    }
  },
  holyGuardian: {
    damageResistances: {
      fire: -0.2,
      light: 0.2
    }
  },
  fallen: {
    damageResistances: {
      light: -0.2,
      electric: 0.2
    }
  },
  golem: {
    damageResistances: {
      physical: -0.2,
      cellular: 0.2
    }
  }
} as const satisfies Record<EnemyRace, EnemyRaceDefinition>;

export const enemyCombatDefinitions = {
  grunt: {
    race: "meka",
    maxHp: 46,
    armor: 5,
    healthRegenPerSecond: 0,
    speed: 50,
    shield: 0,
    movementKind: "ground",
    reward: 12,
    attack: 12,
    damageResistances: {},
    hitTypeResistances: {},
    statusResistances: {}
  },
  /**
   * Kusatma: turtle stratejisinin cezasi.
   *
   * Yapilara belirgin sekilde artirilmis hasar verir ama canı dusuktur; duvar
   * ormek her seye cozum olmasin diye var. Kuleler onu kolay dusurur, yani
   * karsi-oyunu duvarin arkasina ates gucu koymak.
   */
  siege: {
    race: "meka",
    maxHp: 34,
    armor: 8,
    healthRegenPerSecond: 0,
    speed: 42,
    shield: 0,
    movementKind: "ground",
    reward: 15,
    attack: 10,
    damageResistances: {},
    hitTypeResistances: {},
    statusResistances: {}
  },
  brute: {
    race: "meka",
    maxHp: 76,
    armor: 34,
    healthRegenPerSecond: 0.35,
    speed: 34,
    shield: 18,
    movementKind: "ground",
    reward: 18,
    attack: 24,
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
    race: "meka",
    maxHp: 30,
    armor: 0,
    healthRegenPerSecond: 0,
    speed: 90,
    shield: 0,
    movementKind: "ground",
    reward: 11,
    attack: 6,
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
    race: "meka",
    maxHp: 42,
    armor: 10,
    healthRegenPerSecond: 0.18,
    speed: 44,
    shield: 30,
    movementKind: "ground",
    reward: 14,
    attack: 9,
    attackRange: 108,
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

export function getEnemyDamageResistances(
  definition: EnemyCombatDefinition,
  race: EnemyRace = definition.race
): ResistanceTable<DamageType> {
  return combineResistanceTables(enemyRaceDefinitions[race].damageResistances, definition.damageResistances);
}

export function combineResistanceTables<T extends string>(
  first: ResistanceTable<T> | undefined,
  second: ResistanceTable<T> | undefined
): ResistanceTable<T> {
  const combined: ResistanceTable<T> = {};
  for (const [key, value] of Object.entries(first ?? {}) as Array<[T, number]>) {
    combined[key] = value;
  }
  for (const [key, value] of Object.entries(second ?? {}) as Array<[T, number]>) {
    combined[key] = (combined[key] ?? 0) + value;
  }
  return combined;
}

export function calculateArmorDamageMultiplier(armor: number) {
  if (armor >= 0) {
    return 100 / (100 + armor);
  }

  return 2 - 100 / (100 - armor);
}

/**
 * Direnci oyuncunun icerigine gore yeniden sekillendirir.
 *
 * Pozitif deger direnc, negatif deger zaaf. Delme yalnizca direnci,
 * buyutme yalnizca zaafi tutuyor: tek bir sayi ikisini birden kaydirsaydi
 * direnc delen bir kart, zaafi da kortelterek dogru hasar tipini
 * cezalandirirdi.
 */
export function shapeEnemyResistance(
  resistance: number,
  shaping: { resistancePierce?: number; weaknessBonus?: number } = {}
) {
  if (resistance > 0) {
    const pierce = Math.max(0, Math.min(1, shaping.resistancePierce ?? 0));
    return resistance * (1 - pierce);
  }
  if (resistance < 0) {
    return resistance * (1 + Math.max(0, shaping.weaknessBonus ?? 0));
  }
  return 0;
}

export function calculateDamageTaken(
  packet: DamagePacket,
  target: {
    armor: number;
    shield: number;
    damageResistances?: ResistanceTable<DamageType>;
    hitTypeResistances?: ResistanceTable<HitType>;
  },
  shaping: { resistancePierce?: number; weaknessBonus?: number } = {}
): DamageResult {
  const armorMultiplier = packet.damageType === "true" ? 1 : calculateArmorDamageMultiplier(target.armor);
  const resistance = shapeEnemyResistance(target.damageResistances?.[packet.damageType] ?? 0, shaping);
  const resistanceMultiplier = Math.max(0, 1 - resistance);
  const rawHitTypeResistance = packet.damageType !== "true" && packet.hitType ? target.hitTypeResistances?.[packet.hitType] ?? 0 : 0;
  const hitTypeResistance = shapeEnemyResistance(rawHitTypeResistance, shaping);
  const hitTypeResistanceMultiplier = Math.max(0, 1 - hitTypeResistance);
  const rawDamage = Math.max(0, packet.amount * armorMultiplier * resistanceMultiplier * hitTypeResistanceMultiplier);
  const shieldDamage = Math.min(target.shield, rawDamage * SHIELD_DAMAGE_TAKEN_MULTIPLIER);
  const rawDamageAbsorbedByShield = shieldDamage / SHIELD_DAMAGE_TAKEN_MULTIPLIER;
  const hpDamage = Math.max(0, rawDamage - rawDamageAbsorbedByShield);

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
