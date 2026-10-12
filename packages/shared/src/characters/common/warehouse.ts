import { attachTowerEngine } from "./engine.js";
import { NON_FIRING_INTERVAL_MS } from "../../tower-rules.js";
export const warehouseTower = attachTowerEngine({
  id: "warehouse-1", characterId: "zeynep", name: "Hammadde Deposu", role: "Ortak hammadde deposu",
  description: "Toplayıcılar enerji dışındaki hammaddeleri buraya getirir. Üretim binalarına atanan taşıyıcılar gereken malzemeyi buradan alır. Her hammadde ayrı depolanır. Seviye yükseldikçe kapasite artar.",
  classType: "support", damageType: "none", hitType: "none", axes: ["economy"],
  cost: 40, upgradeCost: 25, range: 0, damage: 0, fireIntervalMs: NON_FIRING_INTERVAL_MS,
  projectileSpeed: 0, aoeRadius: 0, slowMs: 0, color: 0xd6a54a
});
