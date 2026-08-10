import { makeTowers } from "../../common/factory.js";
import type { TowerDefinition } from "../../common/types.js";
import { attachTowerEngine } from "../../common/engine.js";
import { NON_FIRING_INTERVAL_MS, PASSIVE_AURA_TICK_INTERVAL_MS } from "../../../tower-rules.js";

export const zeynepTowers = makeTowers("zeynep", 0xec4899, [
  ["Hiza Emri", "Delici fiziksel mermi"],
  ["Gösteri Kulesi", "Işık çizgisi"],
  ["Taht Mührü", "Sentez bağlantısı"],
  ["Zirve Oku", "Uzun menzil"],
  ["Emir Kulesi", "Yavaşlatma"],
  ["Kin Kulesi", "Mesafeye bağlı yavaşlatma"],
  ["Saray Arşivi", "Sentez güçlendirici"],
  ["Abartı", "Pasif vuruş modülatörü"],
  ["Cephane Divanı", "Mühimmat ikmali"],
  ["Enerji Ocağı", "Enerji ikmali"]
], { cost: 55, range: 75, damage: 24, fireIntervalMs: 330, projectileSpeed: 440, aoeRadius: 16, slowMs: 160 }).map((tower): TowerDefinition => {
  if (tower.id === "zeynep-1") {
    return {
      ...tower,
      description: "Zeynep'in temel hasar kulesi. Mermisi ilk vurduğu düşmanı delip aynı doğrultuda ilerlemeye devam eder ve arkasındaki ikinci düşmana da tam hasar verir, sonra kaybolur. Bu yüzden yolun düz kısımlarına, düşmanların arka arkaya dizildiği hatta bakacak şekilde kurulur.",
      classType: "damage",
      damageType: "physical",
      hitType: "projectile",
      fireIntervalMs: 1000,
      aoeRadius: 0,
      slowMs: 0
    };
  }

  if (tower.id === "zeynep-2") {
    return {
      ...tower,
      description: "Çok uzun aralıklarla ateş eder ama vurduğunda seçici davranır: ateşlediği anda en çok düşmanı kesen doğru parçasını hesaplar ve o hat boyunca ani bir ışık patlaması yaratır. Tek tek hedef vurmaz, kalabalığın dizildiği çizgiyi vurur. Seyrek dalgada zayıf, yığılmış dalgada en güçlü kuledir.",
      classType: "damage",
      damageType: "light",
      hitType: "impact",
      damage: 42,
      fireIntervalMs: 2350,
      range: 100,
      aoeRadius: 0,
      slowMs: 0,
      color: 0xf9a8d4
    };
  }

  if (tower.id === "zeynep-3") {
    return {
      ...tower,
      description: "Kendi hasarı ve vuruş tipi yoktur; ne yaptığı, yanındaki kulelere bağlıdır. Geçerli bir üçgen dizilimde iki Hiza Emri ile durursa çift delici mermi yollar. İki Gösteri Kulesi ile durursa ışık çarpmalarıyla yanan bir alan bırakır. Bir Hiza Emri ve bir Gösteri Kulesi ile durursa harita kenarından seken, fiziksel ve ışık karışımı delici bir ışın atar. Zeynep'in dizilim oyununun merkezidir.",
      classType: "hybrid",
      damageType: "none",
      hitType: "impact",
      fireIntervalMs: 2350,
      aoeRadius: 0,
      slowMs: 0,
      color: 0xf0abfc
    };
  }

  if (tower.id === "zeynep-6") {
    return {
      ...tower,
      description: "Uzun aralıklarla 60 derecelik, yavaş ilerleyen bir koni dalgası yollar. Dalgaya uzakta yakalanan düşmanlar yakındakilere göre 3 kata kadar daha güçlü yavaşlar, yani kulenin menzil sınırı asıl etki alanıdır. Yavaşlatması üst üste binmez; her yeni dalga temasında yeniden hesaplanır.",
      classType: "control",
      damageType: "none",
      hitType: "aura",
      cost: 118,
      upgradeCost: 84,
      range: 56,
      damage: 0,
      fireIntervalMs: 3200,
      projectileSpeed: 0,
      aoeRadius: 0,
      slowMs: 1150,
      color: 0x991b1b
    };
  }

  if (tower.id === "zeynep-7") {
    return {
      ...tower,
      description: "Hiç ateş etmez ve tek başına hiçbir işe yaramaz. Görevi Taht Mührü'nün sentez kombinasyonlarını kalıcı olarak güçlendirmektir: 2. seviyede çift Hiza sentezine +1 delme, 3. seviyede çift Gösteri sentezinin yanık süresine +1 saniye, 6. seviyede karışık sentez ışınına +1 sekme ekler. Pahalıdır; ancak sahada birden fazla Taht Mührü varsa değer.",
      classType: "support",
      damageType: "none",
      hitType: "aura",
      cost: 400,
      upgradeCost: 300,
      range: 0,
      damage: 0,
      fireIntervalMs: PASSIVE_AURA_TICK_INTERVAL_MS,
      projectileSpeed: 0,
      aoeRadius: 0,
      slowMs: 0,
      color: 0xfacc15
    };
  }

  if (tower.id === "zeynep-8") {
    return {
      ...tower,
      description: "Normal kule karesi kaplamaz; karelerin kenarına 2 çizgi uzunluğunda yerleşir ve ateş etmez. İçinden geçen dost atışlarını değiştirir: Gösteri ışık hatlarının menzilini uzatıp rengini koyulaştırır, Hiza mermilerine zırh kırma ekler, karışık sentez ışını içinden geçerse deldiği her düşman sonrakine daha çok hasar aktarır. Kuleyi değil, atışın yolunu güçlendirir; bu yüzden ateş hattının üzerine kurulur.",
      classType: "support",
      damageType: "none",
      hitType: "aura",
      cost: 130,
      upgradeCost: 190,
      range: 0,
      damage: 0,
      fireIntervalMs: PASSIVE_AURA_TICK_INTERVAL_MS,
      projectileSpeed: 0,
      aoeRadius: 0,
      slowMs: 0,
      color: 0x7c3aed
    };
  }

  if (tower.id === "zeynep-9" || tower.id === "zeynep-10") {
    const providesAmmunition = tower.id === "zeynep-9";
    return {
      ...tower,
      description: providesAmmunition
        ? "Taşınan enerji ve cephane hammaddesini tüketerek mühimmat üretir; lojistik işçisi ürünü sevkiyatı açık kulelere taşır."
        : "Kristal işçilerinin getirdiği kristalleri enerji olarak depolar; enerji işçisi bu enerjiyi kulelere taşır.",
      classType: "support",
      damageType: "none",
      hitType: "none",
      resourceProvider: providesAmmunition ? "ammunition" : "energy",
      cost: providesAmmunition ? 95 : 105,
      range: 0,
      damage: 0,
      fireIntervalMs: NON_FIRING_INTERVAL_MS,
      projectileSpeed: 0,
      aoeRadius: 0,
      slowMs: 0,
      color: providesAmmunition ? 0xf59e0b : 0x22d3ee
    };
  }

  return tower;
}).filter((tower) => !["zeynep-4", "zeynep-5"].includes(tower.id)).map(attachTowerEngine);
