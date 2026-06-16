import { makeTowers } from "../../common/factory.js";
import type { TowerDefinition } from "../../common/types.js";

export const zeynepTowers = makeTowers("zeynep", 0xec4899, [
  ["Hiza Emri", "Fiziksel mermi. Ilk dusmani deler, ayni dogrultuda ikinci dusmana kadar ilerler"],
  ["Gosteri Kulesi", "Uzun aralikli isik gosterisi. En cok dusmani kesecek dogru parcasina ani isik patlamasi vurur"],
  ["Taht Muhru", "Bagli iki kuleyi sentezleyen karma vurus kulesi"],
  ["Zirve Oku", "Uzun menzil"],
  ["Emir Kulesi", "Yavaslatma"],
  ["Zeynep Nexus", "En ust seviye hasar"],
  ["Saray Arsivi", "Pahali pasif kule. Gelistirildikce Taht Muhru sentez kombinasyonlarini stackli bicimde guclendirir"]
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
        description: "Kendi hasar veya vurus tipi yoktur. Gecerli 3'lu ucgen dizilimde iki Hiza Emri ile durursa iki fiziksel delici mermi yollar. Iki Gosteri Kulesi ile durursa isik carpmalariyla yanan alan olusturur. Bir Hiza Emri ve bir Gosteri Kulesi ile durursa fiziksel/isik karisimi, harita kenarindan seken delici bir isin yollar. Iki Taht Muhru tek bir Hiza Emri veya Gosteri Kulesi ile ucgen kurarsa onu pahali ve verimsiz bir kopya gibi taklit eder.",
        classType: "hybrid",
        damageType: "none",
        hitType: "impact",
        mechanics: ["zeynep-synthesis-link", "mixed-damage", "mirror-beam"],
        fireIntervalMs: 2350,
        aoeRadius: 0,
        slowMs: 0,
        color: 0xf0abfc
      };
    }

    if (tower.id === "zeynep-7") {
      return {
        ...tower,
        role: "Sentez guclendirici",
        description: "Ates etmez. Her kopyasi ve level esigi Taht Muhru kombinasyonlarini stackli guclendirir: L2 1-1 delme +1, L3 2-2 yanik +1sn, L6 1-2 isin +1 sekme. 3 ve 4. kule kombinasyonlari henuz aktif degildir.",
        classType: "support",
        damageType: "none",
        hitType: "aura",
        mechanics: ["passive-synthesis-upgrade", "stacking-combo-buff"],
        cost: 500,
        upgradeCost: 300,
        range: 0,
        damage: 0,
        fireIntervalMs: 999999,
        projectileSpeed: 0,
        aoeRadius: 0,
        slowMs: 0,
        color: 0xfacc15
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
