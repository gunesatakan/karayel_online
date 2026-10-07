export type LogisticsPriority = "critical" | "normal" | "low";
export type TowerActivity = "cycle" | "target" | "ammo" | "energy" | "heat" | "disabled" | "support";
export type DefenseRow = {
  towerId: string; ownerId: string; name: string; damage: number; repaired: number;
  /** Kule tanimi: istemci adi kendi dilinde katalogdan okuyor (`name` Turkce). Eski sunucuda yok. */
  definitionId?: string;
  auraEnemySeconds: number;
  markAssistDamage: number;
  seconds: Record<TowerActivity, number>;
};
/**
 * Sahibine giden dalga ozeti.
 *
 * `isolationShare` / `formationShare`: sahibin kulelerinde vurus anindaki
 * yalnizlik ve dizilim bonusunun bu dalgaya kattigi tahmini hasar
 * (`estimateSynergyShare`). Sifirsa alan yok; dalgada bir kez gidiyor.
 */
export type DefenseSummary = { wave: number; rows: DefenseRow[]; isolationShare?: number; formationShare?: number };
/**
 * `changed[i]`, `lines[i]` satirindaki degerin degisip degismedigini soyler.
 *
 * Metinler (`title`, `description`, `lines`, `error`) Turkce; istemci kendi
 * dilinde yeniden kuruyor: `lineKeys[i]` satirin etiketi (`preview.stat.*`),
 * `cardId`/`itemId` ve `definitionId` baslik ile aciklamanin kaynagi,
 * `errorKey`/`errorParams` reddin anahtari (`SERVER_TEXT`). Eski sunucuda yoklar.
 */
export type TowerPreview = {
  requestId: string; title?: string; description?: string; lines?: string[]; changed?: boolean[]; error?: string;
  lineKeys?: string[]; cardId?: string; itemId?: string; definitionId?: string;
  errorKey?: string; errorParams?: Readonly<Record<string, string | number>>;
};

/** In-flight cargo is deducted before ranking. Aging eventually overrides priority. */
export function deliveryScore(priority: LogisticsPriority, ratio: number, waitingSeconds: number, distance: number) {
  const rank = { critical: 2, normal: 1, low: 0 }[priority];
  return (waitingSeconds >= 20 ? 100 + waitingSeconds : rank * 10)
    + (1 - Math.max(0, Math.min(1, ratio))) * 4 + 1 / (1 + distance);
}

export function createDefenseRow(towerId: string, ownerId: string, name: string, definitionId?: string): DefenseRow {
  return { towerId, ownerId, name, ...(definitionId ? { definitionId } : {}), damage: 0, repaired: 0, auraEnemySeconds: 0, markAssistDamage: 0,
    seconds: { cycle: 0, target: 0, ammo: 0, energy: 0, heat: 0, disabled: 0, support: 0 } };
}

export const activityLabels: Record<TowerActivity, string> = {
  cycle: "Saldırı döngüsü", target: "Hedef bekliyor", ammo: "Mühimmat bekliyor",
  energy: "Enerji bekliyor", heat: "Soğuyor", disabled: "Devre dışı / beklemede", support: "Destek döngüsü"
};
