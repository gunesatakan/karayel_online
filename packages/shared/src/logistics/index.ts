export const RESOURCE_EXTRACTION_DURATION_MS = 8000;
export const LOGISTICS_WORKER_CAPACITY = 12;
export const ENERGY_LOGISTICS_WORKER_CAPACITY = 12;
export const AMMO_LOGISTICS_WORKER_CAPACITY = 4;
export const AMMO_COLLECTOR_WORKER_CAPACITY = 2;
export const RESOURCE_PROVIDER_INITIAL_STOCK = 0;
export const AMMO_FACTORY_INITIAL_ENERGY = 20;
export const LOGISTICS_WORKER_RESPAWN_DELAY_MS = 10000;
export const LOGISTICS_WORKER_INSTANT_REVIVE_COST = 40;

/**
 * Isci alimi.
 *
 * Her oyuncu dort temel isciyle basliyor: her rolden bir tane. Rol secimi asil
 * karari burada dogurur -- ikinci bir enerji tasiyicisi mi, yoksa kristal
 * toplayiciyi ikiye mi katlamak? Bedel her alimda buyur, cunku ayni rolu ust
 * uste almak lojistigi tek eksende katlar.
 */
export const HIRABLE_WORKER_ROLES = ["crystalCollector", "energyTransport", "ammoCollector", "ammoTransport"] as const;

export type HirableWorkerRole = (typeof HIRABLE_WORKER_ROLES)[number];

export const WORKER_ROLE_LABELS: Record<HirableWorkerRole, string> = {
  crystalCollector: "Kristal Toplayıcı",
  energyTransport: "Enerji Taşıyıcı",
  ammoCollector: "Mühimmat Toplayıcı",
  ammoTransport: "Mühimmat Taşıyıcı"
};

export const WORKER_ROLE_DESCRIPTIONS: Record<HirableWorkerRole, string> = {
  crystalCollector: "Kristal düğümlerinden ham enerji toplar.",
  energyTransport: "Toplanan enerjiyi kulelere dağıtır.",
  ammoCollector: "Mühimmat düğümlerinden ham madde toplar.",
  ammoTransport: "Üretilen mühimmatı kulelere taşır."
};

export const WORKER_HIRE_BASE_COST = 120;
export const WORKER_HIRE_COST_GROWTH = 1.7;
export const MAX_HIRED_WORKERS = 3;

/** Siradaki iscinin bedeli. Alinan her isci bir sonrakini pahalilastirir. */
export function getWorkerHireCost(hiredCount: number) {
  return Math.round(WORKER_HIRE_BASE_COST * WORKER_HIRE_COST_GROWTH ** Math.max(0, hiredCount));
}

export function isHirableWorkerRole(value: unknown): value is HirableWorkerRole {
  return typeof value === "string" && (HIRABLE_WORKER_ROLES as readonly string[]).includes(value);
}

export function canHireWorker(hiredCount: number, gold: number) {
  return hiredCount < MAX_HIRED_WORKERS && gold >= getWorkerHireCost(hiredCount);
}

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
