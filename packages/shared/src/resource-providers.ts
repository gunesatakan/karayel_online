import type { TowerDefinition } from "./characters/common/types.js";
import { ZEYNEP_PALACE_ID, ZEYNEP_PALACE_MAX_LEVEL } from "./zeynep-palace/index.js";

export function getTowerMaxLevel(definition: Pick<TowerDefinition, "resourceProvider"> & { id?: string }) {
  if (definition.id === ZEYNEP_PALACE_ID) return ZEYNEP_PALACE_MAX_LEVEL;
  return definition.resourceProvider || (definition.id === "repair-depot-1" || definition.id === "warehouse-1") ? 5 : 10;
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
