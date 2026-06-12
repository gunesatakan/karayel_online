import { makeTowers } from "../../common/factory.js";

export const omerTowers = makeTowers("tank", 0xfacc15, [
  ["Agir Zincir", "Yavaslatma"],
  ["Sari Duvar", "Savunma"],
  ["Kilit Kule", "Kontrol"],
  ["Capa Atisi", "Yuksek yavaslatma"],
  ["Kalkan Topu", "Dayanikli savunma"],
  ["Omer Hisari", "En guclu kontrol"]
], { cost: 42, range: 94, damage: 10, fireIntervalMs: 780, projectileSpeed: 280, slowMs: 720 });
