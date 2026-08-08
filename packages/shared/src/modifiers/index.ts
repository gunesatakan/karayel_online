export type ModifierScope = "player" | "tower";

export type ModifierStat =
  | "damage"
  | "fireRate"
  | "range"
  | "heat"
  | "ammoCost"
  | "energyCost"
  | "towerHealth"
  | "critChance"
  | "critDamage"
  | "markAmplification"
  | "goldGain"
  | "towerCapacity"
  | "cooling"
  | "armorBreak"
  | "statusDuration"
  | "statusMagnitude"
  | "ammoEmptyDamage";

export type Modifier = {
  source: string;
  scope: ModifierScope;
  stat: ModifierStat;
  add: number;
};

export type RunModifiers = Modifier[];
export type ModifierCaps = Partial<Record<ModifierStat, number>>;
export type ModifierBreakdown = { base: number; mods: Modifier[] };

export const MAX_TARGETED_CARDS_PER_TOWER = 3;
export const DEFAULT_MODIFIER_CAPS: ModifierCaps = { markAmplification: 1 };

export function getModifierAdd(modifiers: readonly Modifier[], stat: ModifierStat, caps: ModifierCaps = DEFAULT_MODIFIER_CAPS) {
  const total = modifiers.reduce((sum, modifier) => modifier.stat === stat ? sum + modifier.add : sum, 0);
  const cap = caps[stat];
  return cap === undefined ? total : Math.min(cap, total);
}

export function getModifierMultiplier(modifiers: readonly Modifier[], stat: ModifierStat, caps?: ModifierCaps) {
  return Math.max(0, 1 + getModifierAdd(modifiers, stat, caps));
}

export function resolveModifierBreakdown(breakdown: ModifierBreakdown, caps?: ModifierCaps) {
  return breakdown.base * getModifierMultiplier(breakdown.mods, "damage", caps);
}

export function appendLegacyMultiplier(breakdown: ModifierBreakdown, source: string, multiplier: number): ModifierBreakdown {
  if (multiplier === 1) {
    return breakdown;
  }
  const currentMultiplier = getModifierMultiplier(breakdown.mods, "damage", {});
  return {
    ...breakdown,
    mods: [...breakdown.mods, { source, scope: "tower", stat: "damage", add: currentMultiplier * (multiplier - 1) }]
  };
}

export function canAcceptTargetedCard(targetedCardIds: readonly string[]) {
  return targetedCardIds.length < MAX_TARGETED_CARDS_PER_TOWER;
}
