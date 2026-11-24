import type { AmmoType } from "./characters/common/types.js";

/** Shared finite reserve per map node; persists across waves. */
export const RESOURCE_NODE_INITIAL_AMOUNT = 3000;
export const RESOURCE_KINDS = ["energy", "gunpowder", "mystic", "plasma", "iron"] as const;
export type ResourceKind = typeof RESOURCE_KINDS[number];
export type TransportProduct = "energy" | "materials" | AmmoType;
export const RESOURCE_NAMES: Record<ResourceKind, string> = {
  energy: "Enerji kristali", gunpowder: "Barut", mystic: "Mistik öz", plasma: "Güç kristali", iron: "Demir"
};
export const RESOURCE_NAMES_EN: Record<ResourceKind, string> = {
  energy: "Energy crystal", gunpowder: "Gunpowder", mystic: "Mystic essence", plasma: "Power crystal", iron: "Iron"
};
export const AMMO_RECIPES: Record<AmmoType, ResourceKind> = {
  bullet: "gunpowder", auraCrystal: "mystic", powerCrystal: "plasma"
};
export const ACTIVE_WORKER_ROLES = ["crystalCollector", "energyTransport", "repairer"] as const;
export const REPAIR_HP_PER_PART = 10;
export const REPAIR_PART_ENERGY_COST = 1;
export const REPAIR_PART_IRON_COST = 1;
export function getRepairPartRate(level: number) { return [0.5, 1, 1.75, 3, 5][Math.max(0, Math.min(4, level - 1))]; }
export function isResourceKind(value: unknown): value is ResourceKind {
  return RESOURCE_KINDS.includes(value as ResourceKind);
}
export function isTransportProduct(value: unknown): value is TransportProduct {
  return value === "materials" || value === "energy" || value === "bullet" || value === "auraCrystal" || value === "powerCrystal";
}
/**
 * Iscinin gorev yeri.
 *
 * Sahibin istegi (2026-11-24): tek tip isci. Uzmanlik ve tasinacak urun
 * secimi yok; is, iscinin atandigi yerden geliyor:
 *
 * - kaynak dugumu (`nodeId`): toplar, en yakin depoya goturur;
 * - Hammadde Deposu (`warehouse`): depodaki hammaddeyi ihtiyaci olan her
 *   yere (cephaneliklerin tarifine, Tamir Merkezi'nin demirine) tasir;
 * - enerji binasi (`energy`): enerjiyi ihtiyaci olan her yapiya tasir;
 * - cephanelik (`factory`): urettigi her mühimmati kulelere tasir;
 * - Tamir Merkezi (`repair`): tamirci olur.
 *
 * Tasima her seferinde en bos alicidan baslar (doluluk orani, kulenin
 * onceligi ve bekleme suresi: `deliveryScore`).
 */
export type WorkerPostKind = "warehouse" | "energy" | "factory" | "repair";
export const WORKER_POST_KINDS: readonly WorkerPostKind[] = ["warehouse", "energy", "factory", "repair"];

/**
 * Atama: dugum ya da bina. `postKind` binanin turu (bina yikilir ya da
 * satilirsa isci ayni turden en yakin binaya geciyor); `sourceTowerId`
 * olmayan atama "en yakin bu tur bina" (baslangic iscilerinin varsayilani).
 */
export type WorkerAssignment = { nodeId?: string; sourceTowerId?: string; postKind?: WorkerPostKind };

/** Iscinin isi: atamadan turuyor; atamasiz isci bosta. */
export type WorkerJob = "gather" | "haul" | "repair" | "idle";

/** Binanin gorev yeri turu; isci atanamayan bina (kule, duvar) `undefined`. */
export function getWorkerPostKind(definition: { id: string; resourceProvider?: string }): WorkerPostKind | undefined {
  if (definition.id === "warehouse-1") return "warehouse";
  if (definition.id === "repair-depot-1") return "repair";
  if (definition.resourceProvider === "energy") return "energy";
  if (definition.resourceProvider === "ammunition") return "factory";
  return undefined;
}

export function isWorkerPostKind(value: unknown): value is WorkerPostKind {
  return WORKER_POST_KINDS.includes(value as WorkerPostKind);
}

export function getWorkerJob(assignment: WorkerAssignment | undefined): WorkerJob {
  if (assignment?.nodeId) return "gather";
  if (assignment?.postKind === "repair") return "repair";
  return assignment?.postKind ? "haul" : "idle";
}

/**
 * Isin teldeki kipi. Kip eskiden iscinin kalici rolüydü; simdi isinin
 * aynasi: istemci, gorunus, isci agaci ve eski istemciler onu okumaya devam
 * ediyor. Bosta isci tasiyici kipinde ama atamasi yok.
 */
export function getWorkerJobMode(job: WorkerJob): "crystalCollector" | "energyTransport" | "repairer" {
  return job === "gather" ? "crystalCollector" : job === "repair" ? "repairer" : "energyTransport";
}
export const getWarehouseCapacity = (level: number) => [200, 400, 700, 1100, 1600][Math.max(0, Math.min(4, Math.round(level) - 1))];
export type EconomyStock = {
  productionAmmo?: AmmoType;
  materials?: Partial<Record<ResourceKind, number>>;
  ammoStock?: Partial<Record<AmmoType, number>>;
  repairParts?: number;
};
