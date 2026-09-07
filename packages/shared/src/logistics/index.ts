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
 * Artis bir donem %5'ti ve pratikte hicbir sey ifade etmiyordu: sekizinci isci
 * 141 altina geliyordu, yani kadroyu buyutmenin bir bedeli yoktu ve dogru
 * oynanis her zaman "daha fazla isci" oluyordu.
 *
 * %10 cok yumusak bir egri: altinci isci 161, onuncu 236. Zam kadroyu
 * sinirlamiyor, yalnizca sonsuz bir kadroyu bedelsiz kilmiyor.
 */
export const WORKER_HIRE_COST_GROWTH = 1.1;

/**
 * Gelismis iscinin her seyi normalin uc kati: toplama hizi, tasima
 * kapasitesi, yurume hizi -- ve bedeli.
 *
 * Tek sayi, cunku takas duz olmali: uc iscinin isini bir bedenle yapiyor.
 * Fark yer kaplamada -- bir gelismis isci, uc normal isciden daha az yol
 * tikaniklığı ve daha az takip edilecek beden demek.
 */
export const ADVANCED_WORKER_MULTIPLIER = 3;

/** Alinmis bir isci: rolu ve kademesi. */
export type HiredWorker = { role: HirableWorkerRole; advanced?: boolean };

/**
 * Siradaki iscinin bedeli.
 *
 * Sayac **ortak**: normal ya da gelismis, alinan her isci bir sonrakinin
 * fiyatini yukseltiyor. Iki ayri sayac tutmak, gelismis isciyi normal
 * alimlarla ucuza getirmenin yolunu acardi.
 */
export function getWorkerHireCost(hiredCount: number, advanced = false) {
  // Yuvarlama once yapiliyor, sonra carpiliyor. Tersi olsaydi cekmecede yan
  // yana duran iki sayi birbirini tutmazdi: 146 ve 439 gibi. Oyuncunun
  // gordugu bedel her zaman gordugu digerinin tam uc kati olmali.
  const normal = Math.round(WORKER_HIRE_BASE_COST * WORKER_HIRE_COST_GROWTH ** Math.max(0, hiredCount));
  return advanced ? normal * ADVANCED_WORKER_MULTIPLIER : normal;
}

export function isHirableWorkerRole(value: unknown): value is HirableWorkerRole {
  return typeof value === "string" && (HIRABLE_WORKER_ROLES as readonly string[]).includes(value);
}

export function canHireWorker(hiredCount: number, gold: number, advanced = false) {
  return gold >= getWorkerHireCost(hiredCount, advanced);
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

