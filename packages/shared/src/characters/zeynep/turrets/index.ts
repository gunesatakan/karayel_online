import { makeTowers } from "../../common/factory.js";
import type { TowerDefinition } from "../../common/types.js";

export const zeynepTowers = makeTowers("zeynep", 0xec4899, [
  ["Hiza Emri", "Fiziksel mermi. Ilk dusmani deler, ayni dogrultuda ikinci dusmana kadar ilerler"],
  ["Gosteri Kulesi", "Uzun aralikli isik gosterisi. En cok dusmani kesecek dogru parcasina ani isik patlamasi vurur"],
  ["Taht Muhru", "Bagli iki kuleyi sentezleyen karma vurus kulesi"],
  ["Zirve Oku", "Uzun menzil"],
  ["Emir Kulesi", "Yavaslatma"],
  ["Zeynep Nexus", "En ust seviye hasar"]
], { cost: 55, range: 118, damage: 24, fireIntervalMs: 330, projectileSpeed: 440, aoeRadius: 16, slowMs: 160 }).map((tower): TowerDefinition => {
  if (tower.id !== "zeynep-1") {
    if (tower.id === "zeynep-2") {
      return {
        ...tower,
        role: "Isik cizgisi",
        description: "Cok uzun vurus araligina sahiptir. Ateslediginde en cok dusmani kapsayan dogru parcasinda ani isik patlamasi yaratir.",
        classType: "damage",
        damageType: "light",
        hitType: "impact",
        mechanics: ["showcase-line-blast"],
        damage: 42,
        fireIntervalMs: 2350,
        range: 175,
        aoeRadius: 0,
        slowMs: 0,
        color: 0xf9a8d4
      };
    }

    if (tower.id === "zeynep-3") {
      return {
        ...tower,
        role: "Sentez baglantisi",
        description: "Kendi hasar veya vurus tipi yoktur. Iki Hiza Emri baglanirsa iki fiziksel delici mermi yollar. Iki Gosteri Kulesi baglanirsa isik carpmalariyla yanan alan olusturur. Bir Hiza Emri ve bir Gosteri Kulesi baglanirsa fiziksel/isik karisimi, harita kenarindan seken delici bir isin yollar.",
        classType: "hybrid",
        damageType: "none",
        hitType: "aura",
        mechanics: ["zeynep-synthesis-link", "mixed-damage", "mirror-beam"],
        fireIntervalMs: 2350,
        aoeRadius: 0,
        slowMs: 0,
        color: 0xf0abfc
      };
    }

    return tower;
  }

  return {
    ...tower,
    role: "Delici fiziksel mermi",
    description: "Ilk hedefi delip ayni dogrultuda ilerler. Ikinci dusmana carparsa ayni hasari verir ve kaybolur.",
    damageType: "physical",
    hitType: "projectile",
    mechanics: ["pierce-first-target"],
    aoeRadius: 0,
    slowMs: 0
  };
});
