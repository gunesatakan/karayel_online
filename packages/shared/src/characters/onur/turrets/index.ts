import { makeTowers } from "../../common/factory.js";
import { attachTowerEngine } from "../../common/engine.js";

const towers = makeTowers("onur", 0x14b8a6, [
  ["Avci Nisan", "Tek hedef"],
  ["Net Vurus", "Kritik hasar"],
  ["Sessiz Ok", "Uzun menzil"],
  ["Odak Hatti", "Sert vurus"],
  ["Iz Surucu", "Hedef takibi"],
  ["Onur Keskinligi", "Elit tek hedef"]
], { cost: 44, range: 124, damage: 18, fireIntervalMs: 620, projectileSpeed: 390 });

export const onurTowers = towers.map((tower) => {
  if (tower.id !== "onur-1" && tower.id !== "onur-2") return tower;
  const { engine: _generatedEngine, ...definition } = tower;
  if (tower.id === "onur-2") {
    return attachTowerEngine({
      ...definition,
      name: "Jackpot",
      role: "Uzak menzil niÅŸancÄ±",
      description: "YavaÅŸ ama aÄŸÄ±r mermiler atar; yakÄ±nÄ±ndaki hedefleri vuramaz ve kanayan hedeflerde kritik ÅŸansÄ± kazanÄ±r.",
      hitType: "projectile",
      damageType: "physical",
      classType: "damage",
      axes: ["dps"],
      range: 102,
      damage: 48,
      fireIntervalMs: 4400,
      projectileSpeed: 960
    });
  }
  return attachTowerEngine({
      ...definition,
      name: "Testere",
      role: "Dönen temas hasarı",
      description: "İki enerji bıçağı çevresinde dönerek temas eden düşmanları keser.",
      hitType: "slash",
      damageType: "physical",
      classType: "damage",
      axes: ["dps"],
      cost: 75,
      fireIntervalMs: 450,
      range: 60,
      damage: 8,
      projectileSpeed: 0
    });
});
