import { makeTowers } from "../../common/factory.js";

export const melisTowers = makeTowers("archer", 0x38bdf8, [
  ["Cifte Ok", "Hizli atis"],
  ["Seri Yay", "Coklu hedef"],
  ["Ruzgar Oku", "Hizli mermi"],
  ["Keskin Hat", "Dengeli hasar"],
  ["Avci Gozu", "Uzun menzil"],
  ["Melis Salvosu", "Cok hizli kule"]
], { cost: 38, range: 108, damage: 8, fireIntervalMs: 430, projectileSpeed: 430 });
