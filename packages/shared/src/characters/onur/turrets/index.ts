import { makeTowers } from "../../common/factory.js";

export const onurTowers = makeTowers("onur", 0x14b8a6, [
  ["Avci Nisan", "Tek hedef"],
  ["Net Vurus", "Kritik hasar"],
  ["Sessiz Ok", "Uzun menzil"],
  ["Odak Hatti", "Sert vurus"],
  ["Iz Surucu", "Hedef takibi"],
  ["Onur Keskinligi", "Elit tek hedef"]
], { cost: 44, range: 124, damage: 18, fireIntervalMs: 620, projectileSpeed: 390 });
