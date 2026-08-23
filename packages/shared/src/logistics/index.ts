export const RESOURCE_EXTRACTION_DURATION_MS = 8000;
export const LOGISTICS_WORKER_CAPACITY = 12;
export const ENERGY_LOGISTICS_WORKER_CAPACITY = 12;
export const AMMO_LOGISTICS_WORKER_CAPACITY = 4;
export const AMMO_COLLECTOR_WORKER_CAPACITY = 2;
export const RESOURCE_PROVIDER_INITIAL_STOCK = 0;
export const AMMO_FACTORY_INITIAL_ENERGY = 20;
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

export const WORKER_HIRE_BASE_COST = 100;

/**
 * Her alimin bir sonrakine ekledigi zam.
 *
 * Artis kucuk oldugu icin sayi sinirli degil: isci kadrosunu buyutmek her zaman
 * mumkun, ama ucuncu isci ile onuncu isci arasindaki fark birikerek hissediliyor.
 */
export const WORKER_HIRE_COST_GROWTH = 1.05;

/** Siradaki iscinin bedeli. Alinan her isci bir sonrakini pahalilastirir. */
export function getWorkerHireCost(hiredCount: number) {
  return Math.round(WORKER_HIRE_BASE_COST * WORKER_HIRE_COST_GROWTH ** Math.max(0, hiredCount));
}

export function isHirableWorkerRole(value: unknown): value is HirableWorkerRole {
  return typeof value === "string" && (HIRABLE_WORKER_ROLES as readonly string[]).includes(value);
}

export function canHireWorker(hiredCount: number, gold: number) {
  return gold >= getWorkerHireCost(hiredCount);
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

