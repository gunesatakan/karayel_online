import { applyStatusResistance } from "../combat.js";
import type { TowerStatusEffectDefinition, TowerStatusEffectType } from "../characters/common/types.js";

export const STATUS_EFFECTS = {
  fear: { id: "fear", durationMs: 3000 }
} as const;

export type StatusEffectRuntimeState = {
  type: TowerStatusEffectType;
  magnitude: number;
  stacks: number;
  /** Zero represents an effect that remains until explicitly removed. */
  expiresAt: number;
  sourceTowerId?: string;
  sourceOwnerId?: string;
};

export type ApplyStatusEffectOptions = {
  now: number;
  resistance?: number;
  durationMs?: number;
  magnitude?: number;
  scalingFactor?: number;
  sourceTowerId?: string;
  sourceOwnerId?: string;
};

export function applyTowerStatusEffect(
  current: StatusEffectRuntimeState | undefined,
  definition: TowerStatusEffectDefinition,
  options: ApplyStatusEffectOptions
): StatusEffectRuntimeState {
  const stacking = definition.stacking ?? "refresh";
  const currentIsActive = isStatusEffectActive(current, options.now);
  const previousStacks = currentIsActive ? current?.stacks ?? 0 : 0;
  const stacks = stacking === "add"
    ? Math.min(definition.maxStacks ?? Number.POSITIVE_INFINITY, previousStacks + 1)
    : 1;
  const scalingFactor = definition.scaling === "distance" ? Math.max(0, options.scalingFactor ?? 1) : 1;
  const baseMagnitude = Math.max(0, options.magnitude ?? definition.magnitude) * scalingFactor;
  const magnitude = stacking === "add" ? baseMagnitude * stacks : baseMagnitude;
  const baseDuration = Math.max(0, options.durationMs ?? definition.durationMs);
  const resistedDuration = applyStatusResistance(baseDuration, options.resistance);
  const nextExpiry = baseDuration === 0 ? 0 : options.now + resistedDuration;
  const expiresAt = currentIsActive && current?.expiresAt === 0
    ? 0
    : Math.max(currentIsActive ? current?.expiresAt ?? 0 : 0, nextExpiry);

  const sourceTowerId = options.sourceTowerId ?? current?.sourceTowerId;
  const sourceOwnerId = options.sourceOwnerId ?? current?.sourceOwnerId;
  return {
    type: definition.type,
    magnitude,
    stacks,
    expiresAt,
    ...(sourceTowerId ? { sourceTowerId } : {}),
    ...(sourceOwnerId ? { sourceOwnerId } : {})
  };
}

export function isStatusEffectActive(state: StatusEffectRuntimeState | undefined, now: number) {
  return Boolean(state && (state.expiresAt === 0 || state.expiresAt > now));
}

export function getActiveStatusMagnitude(state: StatusEffectRuntimeState | undefined, now: number) {
  return isStatusEffectActive(state, now) ? state?.magnitude ?? 0 : 0;
}

export function getTowerStatusOutcomes(
  states: Partial<Record<TowerStatusEffectType, StatusEffectRuntimeState>>,
  now: number
) {
  const burn = getActiveStatusMagnitude(states.burn, now);
  const bleed = getActiveStatusMagnitude(states.bleed, now);
  const chill = getActiveStatusMagnitude(states.chill, now);
  const convert = isStatusEffectActive(states.convert, now) ? states.convert : undefined;
  return {
    burnMaxHealthRatioPerSecond: burn,
    bleedMaxHealthRatioPerSecond: bleed,
    speedMultiplier: Math.max(0, 1 - chill),
    converted: Boolean(convert),
    convertExpiresAt: convert?.expiresAt ?? 0,
    convertOwnerId: convert?.sourceOwnerId ?? ""
  };
}
