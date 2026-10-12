import type { AmmoType } from "./characters/common/types.js";

export const RESOURCE_KINDS = ["energy", "gunpowder", "mystic", "plasma", "iron"] as const;
export type ResourceKind = typeof RESOURCE_KINDS[number];
export type TransportProduct = "energy" | AmmoType;
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
  return value === "energy" || value === "bullet" || value === "auraCrystal" || value === "powerCrystal";
}
export type WorkerAssignment = { nodeId?: string; sourceTowerId?: string; product?: TransportProduct };
export type EconomyStock = {
  materials?: Partial<Record<ResourceKind, number>>;
  ammoStock?: Partial<Record<AmmoType, number>>;
  repairParts?: number;
};
