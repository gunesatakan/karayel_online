import type { CardScope, CardTowerProfile, Unlock } from "../cards/index.js";
import { cardAppliesToTower } from "../cards/index.js";
import type { TowerAxis } from "../characters/common/types.js";
import type { TowerGrant } from "../grants/index.js";
import type { Modifier } from "../modifiers/index.js";

export type ShopItemCategory = "power" | "class" | "utility" | "map" | "risk";

/**
 * Esyalar artik envantere girer ve tek bir kuleye takilir. Geriye yalnizca
 * kuleye takilmasi anlamsiz olanlar global kaldi: bunlar isciyi, nexusu, altin
 * ekonomisini veya harita karesini etkiliyor, bir kulenin statini degil.
 */
export type ShopItemTarget = "tower" | "global";

export const GLOBAL_SHOP_ITEM_IDS = [
  "besinci-isci",
  "ek-yuva-magaza",
  "faiz-hesabi",
  "nexus-kalkani",
  "riskli-yatirim",
  "bariyer",
  "ziftli-zemin",
  // Ulti sarji oyuncunun, kulenin degil; bir kuleye takilmasi anlamsiz olurdu.
  "sarj-kondansatoru",
  // Asagidakiler de oyuncunun: bir kuleye takildiklarinda hicbir sey
  // yapmiyorlardi, cunku vaat ettikleri seyi kule katmanindan okuyan kimse
  // yok. Altin kazanci oyuncunun listesinden hesaplaniyor; isci bonuslari ise
  // ya oyuncunun kuresel listesinden ya da iscinin hizmet ettigi binadan
  // okunuyor, ve bu ikisi kaynak binalarina takilamadigi icin hicbir isciye
  // ulasamiyorlardi.
  "ganimet-kesesi",
  "vardiya-amiri",
  "seyyar-depo"
] as const;

/** Sokulemeyen esyalar icin tavan: her takma gercek bir taahhut olsun. */
export const MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER = 5;

/** Kilitler kartlarla ortak; tanim `cards` modulunde duruyor. */
export type ShopUnlock = Unlock;

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  category: ShopItemCategory;
  /** "tower" esyalari envantere girer; "global" olanlar alinir alinmaz isler. */
  target: ShopItemTarget;
  price: number;
  axes: TowerAxis[];
  scope: CardScope;
  repeatable: boolean;
  maxStacks?: number;
  priceGrowth?: number;
  unlockWave?: number;
  effects: Modifier[];
  unlocks?: ShopUnlock[];
  /** Kartlarla ayni motor dilbilgisi; takildigi kulenin motoruna eklenir. */
  grants?: TowerGrant;
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
const defineItem = (id: string, name: string, description: string, category: ShopItemCategory, price: number, options: Partial<Omit<ShopItem, "id" | "name" | "description" | "category" | "price" | "target">> = {}): ShopItem => ({
  id,
  name,
  description,
  category,
  target: (GLOBAL_SHOP_ITEM_IDS as readonly string[]).includes(id) ? "global" : "tower",
  price,
  axes: [],
  scope: { kind: "global" },
  repeatable: false,
  effects: [],
  ...options
});

const rawShopCatalog: ShopItem[] = [
  defineItem("sogutucu-kanatlar", "Soğutucu Kanatlar", "Kule soğutma hızı +%25; en fazla 5 kez alınır.", "utility", 30, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, effects: [effect("sogutucu-kanatlar", "cooling", 0.25)] }),
  // Isci esyalari ekonomi binasina takilir: kazanci o binaya hizmet eden isci
  // alir. Bu yuzden "tagged economy" olmalari sart, aksi halde kaynak binalari
  // takilabilir hedef sayilmaz.
  defineItem("madenci-eldiveni", "Madenci Eldiveni", "Takıldığı binanın kaynak çıkarma hızı +%20; en fazla 5 kez alınır.", "utility", 28, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("madenci-eldiveni", "workerGatherSpeed", 0.2)] }),
  defineItem("seri-cephane-hatti", "Seri Cephane Hattı", "Takıldığı binanın cephane üretim hızı +%25; en fazla 5 kez alınır.", "utility", 33, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("seri-cephane-hatti", "ammoProduction", 0.25)] }),
  defineItem("vardiya-amiri", "Vardiya Amiri", "Tüm işçilerin toplama hızı +%20 ve yürüme hızı +%20; en fazla 3 kez alınır.", "utility", 120, { repeatable: true, maxStacks: 3, priceGrowth: 1.35, axes: ["economy"], effects: [effect("vardiya-amiri", "workerGatherSpeed", 0.2), effect("vardiya-amiri", "workerSpeed", 0.2)] }),
  defineItem("seyyar-depo", "Seyyar Depo", "Tüm işçilerin taşıma kapasitesi +%40; en fazla 2 kez alınır.", "utility", 135, { repeatable: true, maxStacks: 2, priceGrowth: 1.4, axes: ["economy"], effects: [effect("seyyar-depo", "workerCapacity", 0.4)] }),
  defineItem("isci-botlari", "İşçi Botları", "Takıldığı binaya hizmet eden işçilerin hareket hızı +%15; en fazla 5 kez alınır.", "utility", 28, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("isci-botlari", "workerSpeed", 0.15)] }),
  defineItem("namlu-yatagi", "Namlu Yatağı", "Kule dönüş hızı +%35; en fazla 2 kez alınır.", "power", 100, { repeatable: true, maxStacks: 2, effects: [effect("namlu-yatagi", "turnRate", 0.35)] }),
  defineItem("nisangah", "Nişangâh", "Kule isabeti +%30; en fazla 2 kez alınır.", "power", 95, { repeatable: true, maxStacks: 2, effects: [effect("nisangah", "accuracy", 0.3)] }),
  defineItem("hafif-muhimmat", "Hafif Mühimmat", "Mermi hızı +%40; en fazla 2 kez alınır.", "power", 85, { repeatable: true, maxStacks: 2, effects: [effect("hafif-muhimmat", "projectileSpeed", 0.4)] }),
  defineItem("isi-emici", "Isı Emici", "Atış başına üretilen ısı -%25; en fazla 2 kez alınır.", "power", 105, { repeatable: true, maxStacks: 2, effects: [effect("isi-emici", "heat", -0.25)] }),
  defineItem("kritik-sistem", "Kritik Sistem", "Kritik şansı +%12, kritik hasarı +%100.", "power", 150, { effects: [effect("kritik-sistem", "critChance", 0.12), effect("kritik-sistem", "critDamage", 1)] }),

  defineItem("delici-cekirdek", "Delici Çekirdek", "Projectile kulelerinin hasarı +%20.", "class", 90, { scope: { kind: "tagged", hitTypes: ["projectile"] }, effects: [effect("delici-cekirdek", "damage", 0.2)] }),
  defineItem("odak-mercegi", "Odak Merceği", "Focus kulelerinin hasarı +%25.", "class", 90, { scope: { kind: "tagged", hitTypes: ["focus"] }, effects: [effect("odak-mercegi", "damage", 0.25)] }),
  defineItem("agir-kundak", "Ağır Kundak", "Impact hasarı +%20, dönüş hızı -%10.", "class", 90, { scope: { kind: "tagged", hitTypes: ["impact"] }, effects: [effect("agir-kundak", "damage", 0.2), effect("agir-kundak", "turnRate", -0.1)] }),
  defineItem("yanki-odasi", "Yankı Odası", "Aura durum etkisi gücü +%25.", "class", 90, { scope: { kind: "tagged", hitTypes: ["aura"] }, effects: [effect("yanki-odasi", "statusMagnitude", 0.25)] }),

  defineItem("komuta-modulu", "Komuta Modülü", "Amplify kulelerinin işaret gücü +%30.", "class", 110, { axes: ["amplify"], scope: { kind: "tagged", axes: ["amplify"] }, effects: [effect("komuta-modulu", "markAmplification", 0.3)] }),
  defineItem("buz-cekirdegi", "Buz Çekirdeği", "CC kulelerinin durum etkisi gücü +%40.", "class", 100, { axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, effects: [effect("buz-cekirdegi", "statusMagnitude", 0.4)] }),
  defineItem("zirh-plakasi", "Zırh Plakası", "Barricade kulelerinin canı +%80.", "class", 95, { axes: ["barricade"], scope: { kind: "tagged", axes: ["barricade"] }, effects: [effect("zirh-plakasi", "towerHealth", 0.8)] }),
  defineItem("verim-hatti", "Verim Hattı", "Economy binalarının üretim hızı +%35.", "class", 100, { axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("verim-hatti", "resourceProduction", 0.35)] }),

  defineItem("termal-funye", "Termal Fünye", "Fire kuleleri 4 sn boyunca saniyede %1,5 yakar.", "class", 120, { scope: { kind: "tagged", damageTypes: ["fire"] }, unlocks: ["status:burn"] }),
  defineItem("kriyojen-hat", "Kriyojen Hat", "Yavaşlatılmış hedefler CC kulelerinden %20 fazla hasar alır.", "class", 115, { axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, unlocks: ["status:chill"] }),

  defineItem("hedef-kilidi", "Hedef Kilidi", "Kule hedefini 2 saniye daha uzun korur.", "utility", 90, { effects: [effect("hedef-kilidi", "targetLockMs", 2000)] }),
  defineItem("avci-protokolu", "Avcı Protokolü", "En zayıf ve rastgele olmak üzere 2 hedefleme modu açar.", "utility", 60, { unlocks: ["targeting:weakest", "targeting:random"] }),
  defineItem("nobetci-protokolu", "Nöbetçi Protokolü", "En yakın ve son olmak üzere 2 hedefleme modu açar.", "utility", 60, { unlocks: ["targeting:closest", "targeting:last"] }),

  defineItem("ucaksavar-kiti", "Uçaksavar Kiti", "Hava hedeflerine ateş açar, hava hasarı -%50.", "utility", 160, { effects: [effect("ucaksavar-kiti", "airDamage", -0.5)], unlocks: ["canHitAir"] }),
  defineItem("kalkan-delici", "Kalkan Delici", "Kalkanlı düşmanlara hasar +%35.", "power", 105, { effects: [effect("kalkan-delici", "damageVsShielded", 0.35)] }),
  defineItem("agir-avcisi", "Ağır Avcısı", "Brute düşmanlara hasar +%40.", "power", 100, { effects: [effect("agir-avcisi", "damageVsBrute", 0.4)] }),

  defineItem("son-mermi", "Son Mermi", "Mühimmatı bitiren son atış +%200 hasar verir.", "power", 95, { effects: [effect("son-mermi", "ammoEmptyDamage", 2)] }),
  defineItem("enkaz-alani", "Enkaz Alanı", "Yıkılan kule 12 saniyelik yavaşlatıcı enkaz bırakır.", "map", 80, { unlocks: ["trigger:debrisOnDeath"] }),
  defineItem("zafer-serisi", "Zafer Serisi", "Öldürme başına +%3 hasar; dalga içi tavan %45.", "power", 125, { unlocks: ["stack:kill"] }),
  defineItem("kidem", "Kıdem", "Tamamlanan her dalga için kalıcı hasar +%2.", "power", 150, { unlocks: ["stack:wave"] }),

  defineItem("kristal-rafinerisi", "Kristal Rafinerisi", "Güç kristali kullanan kulelerin yakıt tüketimi -%40.", "class", 85, { scope: { kind: "tagged", ammoTypes: ["powerCrystal"] }, effects: [effect("kristal-rafinerisi", "shotFuelCost", -0.4)] }),
  defineItem("dusuk-guc-modu", "Düşük Güç Modülü", "Tüm kulelerin çalışma enerjisi tüketimi -%25.", "utility", 110, { effects: [effect("dusuk-guc-modu", "operatingEnergyCost", -0.25)] }),
  defineItem("bitisik-devre", "Bitişik Devre", "Bitişik her kule çifti +%8 hasar verir; en fazla 4 çift.", "map", 110, { unlocks: ["adjacencyBonus"] }),
  defineItem("yalniz-kurt", "Yalnız Kurt", "Komşusuz kuleler +%25 hasar ve +%15 menzil kazanır.", "map", 100, { unlocks: ["isolationBonus"] }),

  defineItem("besinci-isci", "Beşinci İşçi", "Kalıcı olarak 1 ek lojistik işçisi sağlar.", "utility", 170),
  defineItem("ek-yuva-magaza", "Ek Yuva", "Kule kapasitesi +1; 5. dalgadan sonra en fazla 2 kez.", "utility", 210, { repeatable: true, maxStacks: 2, priceGrowth: 1.5, unlockWave: 5, effects: [effect("ek-yuva-magaza", "towerCapacity", 1)] }),
  defineItem("bariyer", "Bariyer", "Seçilen 1 yol karesini kapatır; en fazla 3 kez.", "map", 180, { repeatable: true, maxStacks: 3 }),
  defineItem("ziftli-zemin", "Ziftli Zemin", "Seçilen 1 karede düşmanları %25 yavaşlatır; en fazla 4 kez.", "map", 75, { repeatable: true, maxStacks: 4 }),
  defineItem("nexus-kalkani", "Nexus Kalkanı", "Bu dalgadaki ilk 3 sızıntıyı engelleyen 1 kullanım sağlar.", "utility", 65, { repeatable: true, unlocks: ["nexusShield"] }),
  defineItem("faiz-hesabi", "Faiz Hesabı", "Dalga sonunda altının %8'ini, en fazla 60 altın kazandırır.", "utility", 140, { unlocks: ["goldInterest"] }),
  defineItem("ganimet-avcisi", "Ganimet Avcısı", "Düşmanlar %20 ihtimalle 4 mühimmat düşürür.", "utility", 90, { unlocks: ["ammoDrop"] }),

  // Saldiri sekline gore ayrisan esyalar. Sekil filtresi her kulede dolu oldugu
  // icin hicbiri olu icerik degil; vurus ve hasar turu ise kulelerin yarisinda
  // tanimsiz, o yuzden dar kapsamlar sekil uzerinden kuruluyor.
  defineItem("koni-yayici", "Koni Yayıcı", "Koni saldıran kulelerin durum etkisi gücü +%45.", "class", 95, { axes: ["cc"], scope: { kind: "tagged", shapes: ["cone"] }, effects: [effect("koni-yayici", "statusMagnitude", 0.45)] }),
  defineItem("hat-namlusu", "Hat Namlusu", "Hat saldıran kulelerin hasarı +%40.", "class", 100, { scope: { kind: "tagged", shapes: ["line"] }, effects: [effect("hat-namlusu", "damage", 0.4)] }),
  defineItem("yorunge-rulmani", "Yörünge Rulmanı", "Yörünge kulelerinin hasarı +%40, ısısı +%20.", "class", 95, { scope: { kind: "tagged", shapes: ["orbit"] }, effects: [effect("yorunge-rulmani", "damage", 0.4), effect("yorunge-rulmani", "heat", 0.2)] }),
  defineItem("isin-prizmasi", "Işın Prizması", "Işın kulelerinin hasarı +%45, soğuması -%15.", "class", 105, { scope: { kind: "tagged", shapes: ["beam"] }, effects: [effect("isin-prizmasi", "damage", 0.45), effect("isin-prizmasi", "cooling", -0.15)] }),

  defineItem("ganimet-kesesi", "Ganimet Kesesi", "Düşman altını +%20.", "utility", 110, { effects: [effect("ganimet-kesesi", "goldGain", 0.2)] }),
  defineItem("ikmal-hatti", "İkmal Hattı", "Takıldığı kulenin atış yakıtı tüketimi -%30.", "utility", 95, { effects: [effect("ikmal-hatti", "shotFuelCost", -0.3)] }),

  // Motor esyalari. Esya tek bir kuleye kalici olarak takildigi icin grant
  // dilbilgisi burada kartlardan daha da yerinde: verilen davranis o kulenin
  // kimligi olur, butun kurulusa yayilmaz.
  defineItem("sabir-modulu", "Sabır Modülü", "Aynı hedefe her vuruşta hasar +%5; hedef değişince sıfırlanır.", "power", 130, {
    grants: { stacks: [{ id: "shop-sabir", trigger: "sameTarget", stat: "damage", perStack: 0.05, max: 10, resetOn: "targetChange" }] }
  }),
  defineItem("delici-uc", "Delici Uç", "Tek hedef ve hat saldıran kuleler 1 düşman daha deler.", "class", 120, {
    scope: { kind: "tagged", shapes: ["single", "line"] },
    grants: { attack: { pierceCount: 1 } }
  }),
  defineItem("ek-bicak-yuvasi", "Ek Bıçak Yuvası", "Yörünge kulelerine 1 bıçak ekler, yakıt tüketimi +%35.", "class", 135, {
    scope: { kind: "tagged", shapes: ["orbit"] },
    effects: [effect("ek-bicak-yuvasi", "shotFuelCost", 0.35)],
    grants: { attack: { bladeCount: 1 } }
  }),
  defineItem("buz-serpintisi", "Buz Serpintisi", "Kulenin vuruşları 1,5 saniye %20 yavaşlatır.", "class", 125, {
    axes: ["cc"],
    grants: { statusEffects: [{ type: "chill", magnitude: 0.2, durationMs: 1500, stacking: "refresh" }] }
  }),
  defineItem("intikam-devresi", "İntikam Devresi", "Menzilinden düşman kaçan kule 8 saniye +%80 hasar verir.", "power", 115, {
    grants: { triggers: [{ event: "escape", effect: "surge", cooldownMs: 8000 }] }
  }),

  // Isi ekseni esyalari kart karsiliklarindan daha keskin: tek kuleyi
  // baglandiklari icin butun kurulusu riske atmazlar.
  defineItem("kizil-namlu", "Kızıl Namlu", "Her sıcaklık derecesi için hasar +%0,6 ama kule 80 derecede kilitlenir.", "power", 140, { unlocks: ["heat:runHot"] }),
  defineItem("kriyostat", "Kriyostat", "Sıcaklığı 20'nin altındayken kritik şansı +%25.", "power", 135, { unlocks: ["heat:coldCrit"] }),
  defineItem("tahliye-valfi", "Tahliye Valfi", "Enerjisi biten kule 4 saniye mühimmatla ateş etmeyi sürdürür.", "utility", 120, { unlocks: ["energy:backupLine"] }),

  // Sogutma esyalari. Kart karsiliklarindan farklari tek kuleye baglanmalari:
  // kartla butun kurulusun isi davranisi degisir, esyayla yalnizca en cok
  // isinan kule.
  defineItem("sogutma-sivisi", "Soğutma Sıvısı", "Takıldığı kulenin soğuması +%35; en fazla 3 kez alınır.", "utility", 45, { repeatable: true, maxStacks: 3, priceGrowth: 1.25, effects: [effect("sogutma-sivisi", "cooling", 0.35)] }),
  defineItem("dokme-radyator", "Dökme Radyatör", "Takıldığı kule ne kadar sıcaksa o kadar hızlı soğur: 50 derecede soğuması %50 artar, 100 derecede iki katına çıkar.", "power", 130, { unlocks: ["heat:radiator"] }),
  defineItem("buhar-tahliyesi", "Buhar Tahliyesi", "Öldürdüğü her düşman kuleyi 4 derece soğutur.", "power", 120, { unlocks: ["heat:killVent"] }),
  defineItem("sarj-kondansatoru", "Şarj Kondansatörü", "Ulti şarj hızı +%20.", "utility", 145, { effects: [effect("sarj-kondansatoru", "ultimateCharge", 0.2)] }),

  defineItem("riskli-yatirim", "Riskli Yatırım", "Dalga başına 1 kez 10 nexus canı karşılığı 200 altın verir.", "risk", 0, { repeatable: true, maxStacks: 20 }),
  defineItem("kan-bankasi", "Kan Bankası", "Her dalga 5 nexus canı karşılığı kule hasarı +%20 olur.", "risk", 75, { unlocks: ["bloodBank"] })
];

/**
 * Efekt kapsamini hedefe gore sabitler.
 *
 * Bir kuleye takilan esyanin modifieri "tower" kapsaminda olmali, yoksa
 * `getTowerRunModifiers` onu oyuncunun tum kulelerine dagitir ve envanterin
 * anlami kalmaz. Tek tek yazmak yerine burada tek yerden normalize ediliyor ki
 * yeni esya eklerken kapsam yanlis yazilamasin.
 */
export const shopCatalog: ShopItem[] = rawShopCatalog.map((item) => ({
  ...item,
  effects: item.effects.map((modifier) => ({
    ...modifier,
    scope: item.target === "global" ? "player" as const : "tower" as const
  }))
}));

const shopItemsById = new Map(shopCatalog.map((item) => [item.id, item]));

export function getShopItem(itemId: string) {
  return shopItemsById.get(itemId);
}

export function isGlobalShopItem(item: ShopItem) {
  return item.target === "global";
}

export type EquipShopItemFailure =
  | "notOwned"
  | "globalItem"
  | "towerFull"
  | "incompatibleTower";

/**
 * Bir esyanin belirli bir kuleye takilip takilamayacagini soyler.
 *
 * Sunucu ile arayuz ayni yaniti vermek zorunda: arayuz takilamayan kuleyi
 * secenek olarak gostermemeli, sunucu da gelen istegi ayni kurala gore
 * reddetmeli.
 */
export function canEquipShopItem(
  item: ShopItem,
  tower: CardTowerProfile,
  equippedItemIds: readonly string[]
): { ok: true } | { ok: false; reason: EquipShopItemFailure } {
  if (item.target === "global") return { ok: false, reason: "globalItem" };
  if (equippedItemIds.length >= MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER) return { ok: false, reason: "towerFull" };
  if (!shopItemAppliesToTower(item, tower)) return { ok: false, reason: "incompatibleTower" };
  return { ok: true };
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
