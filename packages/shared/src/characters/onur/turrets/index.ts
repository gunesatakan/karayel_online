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
  if (tower.id !== "onur-1") return tower;
  const { engine: _generatedEngine, ...definition } = tower;
  return attachTowerEngine({
      ...definition,
      name: "Testere",
      role: "Dönen temas hasarı",
      description: "İki enerji bıçağı çevresinde dönerek temas eden düşmanları keser.",
      hitType: "slash",
      damageType: "physical",
      classType: "damage",
      axes: ["dps"],
      fireIntervalMs: 450,
      range: 60,
      damage: 8,
      projectileSpeed: 0
    });
});
