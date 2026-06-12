import { makeTowers } from "../../common/factory.js";

export const atakanTowers = makeTowers("warrior", 0x22c55e, [
  ["Ciliz Tas", "Ucuz baslangic"],
  ["Titrek Ok", "Dusuk hasar"],
  ["Yorgun Kule", "Yavas atis"],
  ["Ufak Kivilcim", "Kisa menzil"],
  ["Son Care", "Ekonomik savunma"],
  ["Atakan Bariyeri", "Zayif destek"]
], { cost: 24, range: 82, damage: 4, fireIntervalMs: 1180, projectileSpeed: 220 });
