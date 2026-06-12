import { makeTowers } from "../../common/factory.js";

export const zeynepTowers = makeTowers("zeynep", 0xec4899, [
  ["Kurucu Isik", "Cok hizli tek hedef"],
  ["Pembe Firtina", "Seri hasar"],
  ["Taht Muhru", "Alan hasari"],
  ["Zirve Oku", "Uzun menzil"],
  ["Emir Kulesi", "Yavaslatma"],
  ["Zeynep Nexus", "En ust seviye hasar"]
], { cost: 55, range: 118, damage: 24, fireIntervalMs: 330, projectileSpeed: 440, aoeRadius: 16, slowMs: 160 });
