import type { TowerTriggerCondition, TowerTriggerDefinition, TowerTriggerEvent } from "../characters/common/types.js";

export type TriggerCooldowns = Record<string, number>;

export type DispatchTowerTriggerOptions = {
  now: number;
  cooldowns?: TriggerCooldowns;
  conditions?: TowerTriggerCondition[];
};

export type TowerTriggerDispatchResult = {
  effects: string[];
  cooldowns: TriggerCooldowns;
};

export function dispatchTowerTriggers(
  definitions: TowerTriggerDefinition[],
  event: TowerTriggerEvent,
  options: DispatchTowerTriggerOptions
): TowerTriggerDispatchResult {
  const cooldowns = { ...options.cooldowns };
  const conditions = new Set(options.conditions ?? []);
  const effects: string[] = [];

  for (const definition of definitions) {
    if (definition.event !== event || (definition.condition && !conditions.has(definition.condition))) {
      continue;
    }
    const key = `${definition.event}:${definition.effect}`;
    if ((cooldowns[key] ?? 0) > options.now) {
      continue;
    }
    effects.push(definition.effect);
    if (definition.cooldownMs && definition.cooldownMs > 0) {
      cooldowns[key] = options.now + definition.cooldownMs;
    }
  }

  return { effects, cooldowns };
}
