import type { TowerStackDefinition, TowerStackResetReason, TowerStackTrigger } from "../characters/common/types.js";

export type TowerStackRuntimeState = {
  id: string;
  count: number;
  value: number;
  targetId?: string;
  updatedAt: number;
  expiresAt: number;
};

export type ApplyTowerStackOptions = {
  trigger: TowerStackTrigger;
  now: number;
  targetId?: string;
  amount?: number;
  maxCount?: number;
  maxValue?: number;
};

export function applyTowerStack(
  current: TowerStackRuntimeState | undefined,
  definition: TowerStackDefinition,
  options: ApplyTowerStackOptions
): TowerStackRuntimeState | undefined {
  if (options.trigger !== definition.trigger) {
    return current;
  }

  const expired = Boolean(current?.expiresAt && current.expiresAt <= options.now);
  const targetChanged = definition.resetOn === "targetChange" && current?.targetId !== undefined && current.targetId !== options.targetId;
  const previous = expired || targetChanged ? undefined : current;
  const maxCount = Math.max(0, options.maxCount ?? definition.max ?? Number.POSITIVE_INFINITY);
  const previousCount = previous?.count ?? 0;
  const count = Math.min(maxCount, previousCount + 1);
  const amount = Math.max(0, options.amount ?? 1);
  const addedValue = count > previousCount ? amount * definition.perStack : 0;
  const value = Math.min(options.maxValue ?? Number.POSITIVE_INFINITY, (previous?.value ?? 0) + addedValue);

  return {
    id: definition.id,
    count,
    value,
    targetId: options.targetId ?? previous?.targetId,
    updatedAt: options.now,
    expiresAt: definition.decayMs ? options.now + definition.decayMs : 0
  };
}

export function resetTowerStack(
  current: TowerStackRuntimeState | undefined,
  definition: TowerStackDefinition,
  reason: TowerStackResetReason
) {
  return definition.resetOn === reason ? undefined : current;
}

export function getTowerStackMultiplier(
  state: TowerStackRuntimeState | undefined,
  definition: TowerStackDefinition,
  now: number
) {
  if (!state || (state.expiresAt > 0 && state.expiresAt <= now)) {
    return 1;
  }
  if (definition.stat === "damage") {
    return 1 + state.value;
  }
  if (definition.stat === "fireRate" || definition.stat === "slow") {
    return Math.max(0, 1 - state.value);
  }
  return state.value;
}
