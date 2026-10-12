import type { TowerDefinition } from "./characters/common/types.js";

export function getTowerMaxLevel(definition: Pick<TowerDefinition, "resourceProvider">) {
  return definition.resourceProvider ? 5 : 10;
}

function providerLevel(level: number) {
  return Math.max(1, Math.min(5, Math.round(level)));
}

export function getResourceProviderCapacity(level: number) {
  return 20 + (providerLevel(level) - 1) * 45;
}

export function getResourceProviderHealthMultiplier(level: number) {
  return 1 + (providerLevel(level) - 1) * 0.25;
}

export function getAmmoFactoryProductionRate(level: number) {
  return [0.5, 1, 1.75, 3, 5][providerLevel(level) - 1];
}
