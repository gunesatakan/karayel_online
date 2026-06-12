import { makeTowers } from "../../common/factory.js";

export const ulkuTowers = makeTowers("healer", 0xf9a8d4, [
  ["Sifa Nuru", "Destek hasari"],
  ["Pembe Kalkan", "Guvenli savunma"],
  ["Takim Isigi", "Dengeli destek"],
  ["Can Dalgasi", "Alan kontrolu"],
  ["Koruma Cemberi", "Yavaslatma"],
  ["Ulku Umudu", "Takim odakli kule"]
], { cost: 36, range: 102, damage: 9, fireIntervalMs: 690, projectileSpeed: 330, slowMs: 120 });
