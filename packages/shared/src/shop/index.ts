import type { CardScope, CardTowerProfile } from "../cards/index.js";
import { cardAppliesToTower } from "../cards/index.js";
import type { TowerAxis } from "../characters/common/types.js";
import type { Modifier } from "../modifiers/index.js";

export type ShopItemCategory = "power" | "class" | "utility" | "map" | "risk";

export type ShopUnlock =
  | "targeting:weakest" | "targeting:closest" | "targeting:last" | "targeting:random"
  | "status:burn" | "status:chill"
  | "canHitAir"
  | "trigger:debrisOnDeath"
  | "stack:kill" | "stack:wave"
  | "adjacencyBonus" | "isolationBonus"
  | "ammoDrop" | "goldInterest" | "nexusShield" | "bloodBank";

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  category: ShopItemCategory;
  price: number;
  axes: TowerAxis[];
  scope: CardScope;
  repeatable: boolean;
  maxStacks?: number;
  priceGrowth?: number;
  unlockWave?: number;
  effects: Modifier[];
  unlocks?: ShopUnlock[];
};

export type ShopState = {
  ownedItemIds: string[];
  offers: string[];
  rerolls: number;
};

export const SHOP_OFFER_COUNT = 5;
export const SHOP_REROLL_BASE_PRICE = 40;
export const SHOP_REROLL_PRICE_STEP = 20;
export const DEFAULT_SHOP_PRICE_GROWTH = 1.6;

export function shopItemAppliesToTower(item: ShopItem, tower: CardTowerProfile) {
  const profile = tower.resourceProvider && item.scope.kind === "tagged" && item.scope.axes?.includes("economy")
    ? { ...tower, resourceProvider: undefined }
    : tower;
  return cardAppliesToTower({ ...item, stackable: item.repeatable }, profile);
}

export function getShopItemCount(ownedItemIds: readonly string[], itemId: string) {
  return ownedItemIds.reduce((count, id) => count + Number(id === itemId), 0);
}

export function getShopItemPrice(item: ShopItem, ownedItemIds: readonly string[]) {
  const count = getShopItemCount(ownedItemIds, item.id);
  return Math.ceil(item.price * (item.priceGrowth ?? DEFAULT_SHOP_PRICE_GROWTH) ** count);
}

export function getShopRerollPrice(rerolls: number) {
  return SHOP_REROLL_BASE_PRICE + Math.max(0, rerolls) * SHOP_REROLL_PRICE_STEP;
}

export function isShopItemAvailable(item: ShopItem, wave: number, ownedItemIds: readonly string[]) {
  const count = getShopItemCount(ownedItemIds, item.id);
  if (wave < (item.unlockWave ?? 1)) return false;
  if (!item.repeatable && count > 0) return false;
  if (count >= (item.maxStacks ?? Infinity)) return false;
  if (item.id === "bitisik-devre" && ownedItemIds.includes("yalniz-kurt")) return false;
  if (item.id === "yalniz-kurt" && ownedItemIds.includes("bitisik-devre")) return false;
  return true;
}

const effect = (id: string, stat: Modifier["stat"], add: number): Modifier => ({ source: `shop:${id}`, scope: "player", stat, add });
const globalItem = (id: string, name: string, description: string, category: ShopItemCategory, price: number, options: Partial<Omit<ShopItem, "id" | "name" | "description" | "category" | "price">> = {}): ShopItem => ({
  id, name, description, category, price, axes: [], scope: { kind: "global" }, repeatable: false, effects: [], ...options
});

export const shopCatalog: ShopItem[] = [
  globalItem("namlu-yatagi", "Namlu Yatağı", "Kule dönüş hızı +%35; en fazla 2 kez alınır.", "power", 200, { repeatable: true, maxStacks: 2, effects: [effect("namlu-yatagi", "turnRate", 0.35)] }),
  globalItem("nisangah", "Nişangâh", "Kule isabeti +%30; en fazla 2 kez alınır.", "power", 190, { repeatable: true, maxStacks: 2, effects: [effect("nisangah", "accuracy", 0.3)] }),
  globalItem("hafif-muhimmat", "Hafif Mühimmat", "Mermi hızı +%40; en fazla 2 kez alınır.", "power", 170, { repeatable: true, maxStacks: 2, effects: [effect("hafif-muhimmat", "projectileSpeed", 0.4)] }),
  globalItem("isi-emici", "Isı Emici", "Atış başına üretilen ısı -%25; en fazla 2 kez alınır.", "power", 210, { repeatable: true, maxStacks: 2, effects: [effect("isi-emici", "heat", -0.25)] }),
  globalItem("kritik-sistem", "Kritik Sistem", "Kritik şansı +%12, kritik hasarı +%100.", "power", 300, { effects: [effect("kritik-sistem", "critChance", 0.12), effect("kritik-sistem", "critDamage", 1)] }),

  globalItem("delici-cekirdek", "Delici Çekirdek", "Projectile kulelerinin hasarı +%20.", "class", 180, { scope: { kind: "tagged", hitTypes: ["projectile"] }, effects: [effect("delici-cekirdek", "damage", 0.2)] }),
  globalItem("odak-mercegi", "Odak Merceği", "Focus kulelerinin hasarı +%25.", "class", 180, { scope: { kind: "tagged", hitTypes: ["focus"] }, effects: [effect("odak-mercegi", "damage", 0.25)] }),
  globalItem("agir-kundak", "Ağır Kundak", "Impact hasarı +%20, dönüş hızı -%10.", "class", 180, { scope: { kind: "tagged", hitTypes: ["impact"] }, effects: [effect("agir-kundak", "damage", 0.2), effect("agir-kundak", "turnRate", -0.1)] }),
  globalItem("yanki-odasi", "Yankı Odası", "Aura durum etkisi gücü +%25.", "class", 180, { scope: { kind: "tagged", hitTypes: ["aura"] }, effects: [effect("yanki-odasi", "statusMagnitude", 0.25)] }),

  globalItem("komuta-modulu", "Komuta Modülü", "Amplify kulelerinin işaret gücü +%30.", "class", 220, { axes: ["amplify"], scope: { kind: "tagged", axes: ["amplify"] }, effects: [effect("komuta-modulu", "markAmplification", 0.3)] }),
  globalItem("buz-cekirdegi", "Buz Çekirdeği", "CC kulelerinin durum etkisi gücü +%40.", "class", 200, { axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, effects: [effect("buz-cekirdegi", "statusMagnitude", 0.4)] }),
  globalItem("zirh-plakasi", "Zırh Plakası", "Barricade kulelerinin canı +%80.", "class", 190, { axes: ["barricade"], scope: { kind: "tagged", axes: ["barricade"] }, effects: [effect("zirh-plakasi", "towerHealth", 0.8)] }),
  globalItem("verim-hatti", "Verim Hattı", "Economy binalarının üretim hızı +%35.", "class", 200, { axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("verim-hatti", "resourceProduction", 0.35)] }),

  globalItem("termal-funye", "Termal Fünye", "Fire kuleleri 4 sn boyunca saniyede %1,5 yakar.", "class", 240, { scope: { kind: "tagged", damageTypes: ["fire"] }, unlocks: ["status:burn"] }),
  globalItem("kriyojen-hat", "Kriyojen Hat", "Yavaşlatılmış hedefler CC kulelerinden %20 fazla hasar alır.", "class", 230, { axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, unlocks: ["status:chill"] }),

  globalItem("hedef-kilidi", "Hedef Kilidi", "Kule hedefini 2 saniye daha uzun korur.", "utility", 180, { effects: [effect("hedef-kilidi", "targetLockMs", 2000)] }),
  globalItem("avci-protokolu", "Avcı Protokolü", "En zayıf ve rastgele olmak üzere 2 hedefleme modu açar.", "utility", 120, { unlocks: ["targeting:weakest", "targeting:random"] }),
  globalItem("nobetci-protokolu", "Nöbetçi Protokolü", "En yakın ve son olmak üzere 2 hedefleme modu açar.", "utility", 120, { unlocks: ["targeting:closest", "targeting:last"] }),

  globalItem("ucaksavar-kiti", "Uçaksavar Kiti", "Hava hedeflerine ateş açar, hava hasarı -%50.", "utility", 320, { effects: [effect("ucaksavar-kiti", "airDamage", -0.5)], unlocks: ["canHitAir"] }),
  globalItem("kalkan-delici", "Kalkan Delici", "Kalkanlı düşmanlara hasar +%35.", "power", 210, { effects: [effect("kalkan-delici", "damageVsShielded", 0.35)] }),
  globalItem("agir-avcisi", "Ağır Avcısı", "Brute düşmanlara hasar +%40.", "power", 200, { effects: [effect("agir-avcisi", "damageVsBrute", 0.4)] }),

  globalItem("son-mermi", "Son Mermi", "Mühimmatı bitiren son atış +%200 hasar verir.", "power", 190, { effects: [effect("son-mermi", "ammoEmptyDamage", 2)] }),
  globalItem("enkaz-alani", "Enkaz Alanı", "Yıkılan kule 12 saniyelik yavaşlatıcı enkaz bırakır.", "map", 160, { unlocks: ["trigger:debrisOnDeath"] }),
  globalItem("zafer-serisi", "Zafer Serisi", "Öldürme başına +%3 hasar; dalga içi tavan %45.", "power", 250, { unlocks: ["stack:kill"] }),
  globalItem("kidem", "Kıdem", "Tamamlanan her dalga için kalıcı hasar +%2.", "power", 300, { unlocks: ["stack:wave"] }),

  globalItem("kristal-rafinerisi", "Kristal Rafinerisi", "Güç kristali kullanan kulelerin mühimmat maliyeti -%40.", "class", 170, { scope: { kind: "tagged", ammoTypes: ["powerCrystal"] }, effects: [effect("kristal-rafinerisi", "ammoCost", -0.4)] }),
  globalItem("bitisik-devre", "Bitişik Devre", "Bitişik her kule çifti +%8 hasar verir; en fazla 4 çift.", "map", 220, { unlocks: ["adjacencyBonus"] }),
  globalItem("yalniz-kurt", "Yalnız Kurt", "Komşusuz kuleler +%25 hasar ve +%15 menzil kazanır.", "map", 200, { unlocks: ["isolationBonus"] }),

  globalItem("besinci-isci", "Beşinci İşçi", "Kalıcı olarak 1 ek lojistik işçisi sağlar.", "utility", 340),
  globalItem("ek-yuva-magaza", "Ek Yuva", "Kule kapasitesi +1; 5. dalgadan sonra en fazla 2 kez.", "utility", 420, { repeatable: true, maxStacks: 2, priceGrowth: 1.5, unlockWave: 5, effects: [effect("ek-yuva-magaza", "towerCapacity", 1)] }),
  globalItem("bariyer", "Bariyer", "Seçilen 1 yol karesini kapatır; en fazla 3 kez.", "map", 360, { repeatable: true, maxStacks: 3 }),
  globalItem("ziftli-zemin", "Ziftli Zemin", "Seçilen 1 karede düşmanları %25 yavaşlatır; en fazla 4 kez.", "map", 150, { repeatable: true, maxStacks: 4 }),
  globalItem("nexus-kalkani", "Nexus Kalkanı", "Bu dalgadaki ilk 3 sızıntıyı engelleyen 1 kullanım sağlar.", "utility", 130, { repeatable: true, unlocks: ["nexusShield"] }),
  globalItem("faiz-hesabi", "Faiz Hesabı", "Dalga sonunda altının %8'ini, en fazla 60 altın kazandırır.", "utility", 280, { unlocks: ["goldInterest"] }),
  globalItem("ganimet-avcisi", "Ganimet Avcısı", "Düşmanlar %20 ihtimalle 4 mühimmat düşürür.", "utility", 180, { unlocks: ["ammoDrop"] }),

  globalItem("riskli-yatirim", "Riskli Yatırım", "Dalga başına 1 kez 10 nexus canı karşılığı 200 altın verir.", "risk", 0, { repeatable: true, maxStacks: 20 }),
  globalItem("kan-bankasi", "Kan Bankası", "Her dalga 5 nexus canı karşılığı kule hasarı +%20 olur.", "risk", 150, { unlocks: ["bloodBank"] })
];

export function getShopItem(itemId: string) {
  return shopCatalog.find((item) => item.id === itemId);
}

export function drawShopOffers(options: { wave: number; preferredAxes: TowerAxis[]; towers: CardTowerProfile[]; ownedItemIds: string[]; count?: number; random?: () => number }) {
  const random = options.random ?? Math.random;
  const pool = shopCatalog.filter((item) => isShopItemAvailable(item, options.wave, options.ownedItemIds));
  const result: ShopItem[] = [];
  while (result.length < (options.count ?? SHOP_OFFER_COUNT) && pool.length > 0) {
    const weights = pool.map((item) => {
      const axisWeight = item.axes.some((axis) => options.preferredAxes.slice(0, 2).includes(axis)) ? 2 : 1;
      const deadWeight = item.scope.kind === "tagged" && !options.towers.some((tower) => shopItemAppliesToTower(item, tower)) ? 0.15 : 1;
      return axisWeight * deadWeight;
    });
    let roll = random() * weights.reduce((sum, value) => sum + value, 0);
    let index = 0;
    for (; index < weights.length - 1; index += 1) {
      roll -= weights[index];
      if (roll < 0) break;
    }
    result.push(pool[index]);
    pool.splice(index, 1);
  }
  return result;
}
