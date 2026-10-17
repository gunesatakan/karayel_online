import { makeTowers } from "../../common/factory.js";
import type { TowerDefinition } from "../../common/types.js";
import { attachTowerEngine } from "../../common/engine.js";
import { ZEYNEP_PALACE_AURA_RADIUS_CELLS, ZEYNEP_PALACE_BOUNCE_BONUS, ZEYNEP_PALACE_BUILD_GOLD, ZEYNEP_PALACE_BURN_BONUS_MS, ZEYNEP_PALACE_AURA_RADIUS, ZEYNEP_PALACE_COOLING_BONUS, ZEYNEP_PALACE_MAX_LEVEL, ZEYNEP_PALACE_PIERCE_BONUS, ZEYNEP_PALACE_RANGE_BONUS, ZEYNEP_PALACE_UPGRADE_GOLD } from "../../../zeynep-palace/index.js";
import { KIN_SLOW_FAR_FRACTION, NON_FIRING_INTERVAL_MS, PASSIVE_AURA_TICK_INTERVAL_MS, getCriticalSlowFraction } from "../../../tower-rules.js";

export const zeynepTowers = makeTowers("zeynep", 0xec4899, [
  ["Hiza Emri", "Delici fiziksel mermi"],
  ["Gösteri Kulesi", "Işık çizgisi"],
  ["Taht Mührü", "Sentez bağlantısı"],
  ["Zirve Oku", "Uzun menzil"],
  ["Emir Kulesi", "Yavaşlatma"],
  ["Kin Kulesi", "Mesafeye bağlı yavaşlatma"],
  ["Saray Arşivi", "Aura kulesi"],
  ["Abartı", "Pasif vuruş modülatörü"],
  ["Cephane Divanı", "Mühimmat ikmali"],
  ["Enerji Ocağı", "Enerji ikmali"]
], { cost: 55, range: 75, damage: 24, fireIntervalMs: 330, projectileSpeed: 440, aoeRadius: 16, slowMs: 160 }).map((tower): TowerDefinition => {
  if (tower.id === "zeynep-1") {
    return {
      ...tower,
      description: "ZentaX'ın temel hasar kulesi. Mermisi ilk vurduğu düşmanı delip aynı doğrultuda ilerlemeye devam eder ve arkasındaki ikinci düşmana da tam hasar verir, sonra kaybolur. Bu yüzden yolun düz kısımlarına, düşmanların arka arkaya dizildiği hatta bakacak şekilde kurulur.",
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
      description: "Kendi hasarı ve vuruş tipi yoktur; ne yaptığı, yanındaki kulelere bağlıdır. Geçerli bir üçgen dizilimde iki Hiza Emri ile durursa çift delici mermi yollar. İki Gösteri Kulesi ile durursa ışık çarpmalarıyla yanan bir alan bırakır. Bir Hiza Emri ve bir Gösteri Kulesi ile durursa harita kenarından seken, fiziksel ve ışık karışımı delici bir ışın atar. ZentaX'ın dizilim oyununun merkezidir.",
      classType: "hybrid",
      damageType: "none",
      hitType: "impact",
      // Uc kombinasyon da bu degeri okuyor: muhrun agirligi tek yerden ayarlanir.
      // Uc kulelik bir dizilimin karsiligi olarak tek kulelik hasar az kaliyordu.
      damage: 36,
      fireIntervalMs: 2350,
      aoeRadius: 0,
      slowMs: 0,
      color: 0xf0abfc
    };
  }

  if (tower.id === "zeynep-6") {
    return {
      ...tower,
      description: `Uzun aralıklarla 60 derecelik, yavaş ilerleyen bir koni dalgası yollar. Yavaşlatma kuleye uzaklıkla artar: dibinde yakalanan düşman yavaşlamaz, menzil sınırında %${Math.round(KIN_SLOW_FAR_FRACTION * 100)} yavaşlar (Buz Kırığı kritiğiyle %${Math.round(getCriticalSlowFraction(KIN_SLOW_FAR_FRACTION) * 100)}), yani kulenin menzil sınırı asıl etki alanıdır. Yavaşlatması üst üste binmez; her yeni dalga temasında yeniden hesaplanır.`,
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
      description: `AURA kulesi: hiç ateş etmez; merkezinden ${String(ZEYNEP_PALACE_AURA_RADIUS_CELLS).replace(".", ",")} kare içindeki kendi kulelerini güçlendirir. 1. seviyede alandaki kulelerin soğuması +%${Math.round(ZEYNEP_PALACE_COOLING_BONUS * 100)}, 2. seviyede menzilleri +%${Math.round(ZEYNEP_PALACE_RANGE_BONUS * 100)} (koşullu menzil tavanına sayılır). 3.-5. seviyeler alandaki Taht Mührü'nün sentezlerini güçlendirir: 3. seviyede çift Hiza sentezine +${ZEYNEP_PALACE_PIERCE_BONUS} delme, 4. seviyede çift Gösteri sentezinin yanık hattına +${ZEYNEP_PALACE_BURN_BONUS_MS / 1000} saniye, 5. seviyede karışık sentez ışınına +${ZEYNEP_PALACE_BOUNCE_BONUS} sekme. Birden çok arşiv üst üste binmez; kule en yüksek seviyeli arşivin etkisini alır. En fazla ${ZEYNEP_PALACE_MAX_LEVEL}. seviye; geliştirmesi pahalıdır (${[2, 3, 4, 5].map((level) => ZEYNEP_PALACE_UPGRADE_GOLD[level]).join(" / ")} altın).`,
      classType: "support",
      damageType: "none",
      hitType: "aura",
      // Kurulum 500 altin (insa bedeli `cost` x 2). AURA kulesi oldu: alanindaki
      // kulelere soguma ve menzil veriyor, pahali bir yatirim.
      cost: ZEYNEP_PALACE_BUILD_GOLD / 2,
      upgradeCost: ZEYNEP_PALACE_UPGRADE_GOLD[2],
      // Menzil aura yaricapi (`getTowerBaseLevelRange` seviyeyle buyutmuyor).
      range: ZEYNEP_PALACE_AURA_RADIUS,
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
      cost: 65,
      upgradeCost: 95,
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
      cost: providesAmmunition ? 48 : 53,
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
