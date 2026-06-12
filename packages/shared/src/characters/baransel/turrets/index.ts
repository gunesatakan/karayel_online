import { makeTowers } from "../../common/factory.js";

export const baranselTowers = makeTowers("mage", 0xa78bfa, [
  ["Mor Patlama", "Alan hasari"],
  ["Rift Tas", "Buyu hasari"],
  ["Kozmik Halka", "Genis alan"],
  ["Enerji Topu", "Yavas ama sert"],
  ["Mana Kirilimi", "Zincir hasar"],
  ["Baransel Meteoru", "Yuksek AOE"]
], { cost: 48, range: 98, damage: 20, fireIntervalMs: 900, projectileSpeed: 280, aoeRadius: 42 });
