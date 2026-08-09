export const RESOURCE_EXTRACTION_DURATION_MS = 8000;
export const LOGISTICS_WORKER_CAPACITY = 12;
export const ENERGY_LOGISTICS_WORKER_CAPACITY = 12;
export const RESOURCE_PROVIDER_INITIAL_STOCK = 0;
export const AMMO_FACTORY_INITIAL_ENERGY = 20;
export const LOGISTICS_WORKER_RESPAWN_DELAY_MS = 10000;
export const LOGISTICS_WORKER_INSTANT_REVIVE_COST = 40;

export function advanceResourceExtraction(
  remainingMs: number | undefined,
  deltaMs: number,
  durationMs = RESOURCE_EXTRACTION_DURATION_MS
) {
  const nextRemainingMs = Math.max(0, (remainingMs ?? durationMs) - Math.max(0, deltaMs));
  return {
    remainingMs: nextRemainingMs,
    completed: nextRemainingMs === 0
  };
}

export function getLogisticsWorkerRespawnRemainingMs(respawnAt: number, now: number) {
  return Math.max(0, respawnAt - now);
}
