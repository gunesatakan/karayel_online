export type LogisticsPriority = "critical" | "normal" | "low";
export type TowerActivity = "cycle" | "target" | "ammo" | "energy" | "heat" | "disabled" | "support";
export type DefenseRow = {
  towerId: string; ownerId: string; name: string; damage: number; repaired: number;
  auraEnemySeconds: number;
  markAssistDamage: number;
  seconds: Record<TowerActivity, number>;
};
export type DefenseSummary = { wave: number; rows: DefenseRow[] };
export type TowerPreview = { requestId: string; title?: string; description?: string; lines?: string[]; error?: string };

/** In-flight cargo is deducted before ranking. Aging eventually overrides priority. */
export function deliveryScore(priority: LogisticsPriority, ratio: number, waitingSeconds: number, distance: number) {
  const rank = { critical: 2, normal: 1, low: 0 }[priority];
  return (waitingSeconds >= 20 ? 100 + waitingSeconds : rank * 10)
    + (1 - Math.max(0, Math.min(1, ratio))) * 4 + 1 / (1 + distance);
}

export function createDefenseRow(towerId: string, ownerId: string, name: string): DefenseRow {
  return { towerId, ownerId, name, damage: 0, repaired: 0, auraEnemySeconds: 0, markAssistDamage: 0,
    seconds: { cycle: 0, target: 0, ammo: 0, energy: 0, heat: 0, disabled: 0, support: 0 } };
}

export const activityLabels: Record<TowerActivity, string> = {
  cycle: "Saldırı döngüsü", target: "Hedef bekliyor", ammo: "Mühimmat bekliyor",
  energy: "Enerji bekliyor", heat: "Soğuyor", disabled: "Devre dışı / beklemede", support: "Destek döngüsü"
};
