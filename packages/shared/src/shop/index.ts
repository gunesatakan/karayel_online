import type { CardDrawOwnedUnlocks, CardScope, CardTowerProfile, Unlock } from "../cards/index.js";
import { cardAppliesToTower, getCardDefinition, ownedCardAppliesToTower } from "../cards/index.js";
import { isMarkOnlyChoice } from "../marks/index.js";
import type { TowerAxis } from "../characters/common/types.js";
import type { TowerGrant } from "../grants/index.js";
import type { Modifier } from "../modifiers/index.js";
import { FINAL_WAVE } from "../balance/index.js";

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
  "seyyar-depo",
  // Isci cani da oyuncunun: iscinin dayanikliligi hizmet ettigi binaya
  // degil kendisine ait, o yuzden kuresel listeden okunuyor.
  "celik-yelek",
  "sahra-reviri",
  // Onarim hizi da iscinin kendisine ait, takildigi kuleye degil. Ayni adli
  // "Kaynak Makinesi" bir **kule** esyasi ve onarim bedelini indiriyor; bu
  // ikisi ayri seyler, o yuzden yeni esyanin adi Pnomatik Anahtar.
  "pnomatik-anahtar",
  "yedek-parca-sandigi",
  // Altin esyalari: ikisi oldurme altinini ve dalga primini oyuncunun
  // kesesine yaziyor, ucuncusu oyuncunun altinini birkac dalga bagliyor.
  // Hicbirinin bir kulede okuyucusu yok.
  "altin-elek",
  "sigorta-policesi",
  "vadeli-mevduat",
  // Sampiyon primi oyuncunun: sampiyonu kim oldururse oldursun.
  "odul-fermani"
] as const;

/** Sokulemeyen esyalar icin tavan: her takma gercek bir taahhut olsun. */
export const MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER = 10;

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
  /**
   * Vadeli altin: satin alinan altin `waves` dalga tamamlaninca `payout`
   * olarak geri donuyor. Odeme dalga sonu primleriyle ayni anda; son
   * dalganin sonunda prim yok (mac bitiyor), o yuzden esya geri odemeye
   * yetismeyecegi dalgadan sonra vitrine cikmiyor (`getShopItemLastOfferWave`).
   */
  deposit?: { payout: number; waves: number };
};

export type ShopState = {
  ownedItemIds: string[];
  offers: string[];
  rerolls: number;
};

export const SHOP_OFFER_COUNT = 5;
/** Riskli Yatirim: her alimda nexustan giden can ve karsiliginda verilen altin. */
export const RISKY_INVESTMENT_NEXUS_COST = 10;
export const RISKY_INVESTMENT_GOLD = 400;
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

/**
 * Kule esyasi icin bakilan yuk: oyuncunun kuleleri (takili esyalariyla) ve
 * envanterde takilmayi bekleyen esyalar. Kule esyalarinin sinirlari kule
 * basina; ayni tipten ikinci kule ilkinin doldurdugu esyayi yine alabilir.
 */
export type ShopItemLoadout = {
  towers: ReadonlyArray<{ definition: CardTowerProfile; equippedItemIds: readonly string[] }>;
  inventoryItemIds: readonly string[];
};

/** Bir kulede ayni esyadan en fazla kac tane: tek seferlik 1, yiginli `maxStacks`. */
export function getShopItemTowerLimit(item: ShopItem) {
  return item.repeatable ? item.maxStacks ?? Infinity : 1;
}

/** Ayni kuleye birlikte takilamayan esya ciftleri. */
const EXCLUSIVE_SHOP_ITEMS: Readonly<Record<string, string>> = {
  "bitisik-devre": "yalniz-kurt",
  "yalniz-kurt": "bitisik-devre"
};

export function getExclusiveShopItemId(itemId: string): string | undefined {
  return EXCLUSIVE_SHOP_ITEMS[itemId];
}

/** Bu kuleye bu esyadan daha kac tane takilabilir (uyumluluk haric). */
function getTowerFreeCopies(item: ShopItem, equippedItemIds: readonly string[]) {
  const rival = getExclusiveShopItemId(item.id);
  if (rival && equippedItemIds.includes(rival)) return 0;
  return Math.max(0, Math.min(
    getShopItemTowerLimit(item) - getShopItemCount(equippedItemIds, item.id),
    MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER - equippedItemIds.length
  ));
}

/**
 * Kule esyasinin fiyatinda sayilan adet: esyayi daha alabilecek uyumlu
 * kuleler arasinda en az kopya tasiyaninki, arti envanterde bekleyen
 * kopyalar. Yani fiyat esyanin takilacagi kuledeki sirasina gore buyuyor;
 * yeni bir kule ilk kopyayi taban fiyattan aliyor.
 */
function getTowerItemPriceCount(item: ShopItem, loadout: ShopItemLoadout) {
  const open = loadout.towers
    .filter((tower) => shopItemAppliesToTower(item, tower.definition) && getTowerFreeCopies(item, tower.equippedItemIds) > 0)
    .map((tower) => getShopItemCount(tower.equippedItemIds, item.id));
  return (open.length > 0 ? Math.min(...open) : 0) + getShopItemCount(loadout.inventoryItemIds, item.id);
}

/**
 * Esyanin fiyati. Kuresel esyalar oyuncunun toplam alimina gore buyur. Kule
 * esyalari `loadout` ile kule basina sayilir (`getTowerItemPriceCount`);
 * `loadout` verilmezse `ownedItemIds` tek bir kulenin yuku gibi okunur.
 */
export function getShopItemPrice(item: ShopItem, ownedItemIds: readonly string[], loadout?: ShopItemLoadout) {
  const count = item.target === "tower" && loadout
    ? getTowerItemPriceCount(item, loadout)
    : getShopItemCount(ownedItemIds, item.id);
  return Math.ceil(item.price * (item.priceGrowth ?? DEFAULT_SHOP_PRICE_GROWTH) ** count);
}

export function getShopRerollPrice(rerolls: number) {
  return SHOP_REROLL_BASE_PRICE + Math.max(0, rerolls) * SHOP_REROLL_PRICE_STEP;
}

/**
 * Esyanin vitrine cikabilecegi son dalga; sinirsizsa yok.
 *
 * Hazirlik fazindaki dalga `w` ise vadeli altin `w + waves - 1`. dalganin
 * sonunda oduyor. Son dalganin sonunda dalga primi yok, yani odeme en gec
 * `FINAL_WAVE - 1`. dalganin sonunda gelebilir.
 */
export function getShopItemLastOfferWave(item: ShopItem) {
  return item.deposit ? FINAL_WAVE - item.deposit.waves : undefined;
}

/**
 * Esya vitrine cikabilir mi.
 *
 * Kuresel esyalarin sinirlari oyuncu basina (`ownedItemIds`). Kule
 * esyalarininki kule basina: `loadout` verilirse esya, uyumlu kulelerdeki bos
 * hak (tek seferlikse 1, yiginliysa `maxStacks`, 10'lu yuva tavani ve ayni
 * kuledeki karsit esya dahil) envanterde bekleyen kopyalardan fazlaysa
 * sunulur. Uyumlu kule henuz yoksa sunulmaya devam eder. `loadout`
 * verilmezse `ownedItemIds` tek bir kulenin yuku gibi okunur.
 */
export function isShopItemAvailable(item: ShopItem, wave: number, ownedItemIds: readonly string[], loadout?: ShopItemLoadout) {
  if (wave < (item.unlockWave ?? 1)) return false;
  if (wave > (getShopItemLastOfferWave(item) ?? Infinity)) return false;
  if (item.target === "tower" && loadout) {
    const compatible = loadout.towers.filter((tower) => shopItemAppliesToTower(item, tower.definition));
    if (compatible.length === 0) return true;
    const free = compatible.reduce((sum, tower) => sum + getTowerFreeCopies(item, tower.equippedItemIds), 0);
    return free > getShopItemCount(loadout.inventoryItemIds, item.id);
  }
  const count = getShopItemCount(ownedItemIds, item.id);
  if (!item.repeatable && count > 0) return false;
  if (count >= (item.maxStacks ?? Infinity)) return false;
  const rival = getExclusiveShopItemId(item.id);
  if (rival && ownedItemIds.includes(rival)) return false;
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
  defineItem("sogutucu-kanatlar", "Soğutucu Kanatlar", "Takıldığı kulenin soğuması +%25; bir kuleye en fazla 5 kez takılır.", "utility", 30, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, effects: [effect("sogutucu-kanatlar", "cooling", 0.25)] }),
  // Isci esyalari ekonomi binasina takilir: kazanci o binaya hizmet eden isci
  // alir. Bu yuzden "tagged economy" olmalari sart, aksi halde kaynak binalari
  // takilabilir hedef sayilmaz.
  defineItem("madenci-eldiveni", "Madenci Eldiveni", "Takıldığı binanın kaynak çıkarma hızı +%20; bir binaya en fazla 5 kez takılır.", "utility", 28, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("madenci-eldiveni", "workerGatherSpeed", 0.2)] }),
  defineItem("seri-cephane-hatti", "Seri Cephane Hattı", "Takıldığı binanın cephane üretim hızı +%25; bir binaya en fazla 5 kez takılır.", "utility", 33, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("seri-cephane-hatti", "ammoProduction", 0.25)] }),
  defineItem("vardiya-amiri", "Vardiya Amiri", "Tüm işçilerin toplama hızı +%20 ve yürüme hızı +%20; en fazla 3 kez alınır.", "utility", 120, { repeatable: true, maxStacks: 3, priceGrowth: 1.35, axes: ["economy"], effects: [effect("vardiya-amiri", "workerGatherSpeed", 0.2), effect("vardiya-amiri", "workerSpeed", 0.2)] }),
  defineItem("seyyar-depo", "Seyyar Depo", "Tüm işçilerin taşıma kapasitesi +%40; en fazla 2 kez alınır.", "utility", 135, { repeatable: true, maxStacks: 2, priceGrowth: 1.4, axes: ["economy"], effects: [effect("seyyar-depo", "workerCapacity", 0.4)] }),
  // Can esyalari: biri merdiven, biri tek buyuk adim. Merdiven ucuz basliyor
  // ve zamla buyuyor; buyuk adim ayni yere bir hamlede goturuyor ama
  // toplama hizindan odiyor.
  defineItem("celik-yelek", "Çelik Yelek", "Tüm işçilerin canı +%45; en fazla 4 kez alınır.", "utility", 55, { repeatable: true, maxStacks: 4, priceGrowth: 1.25, axes: ["economy"], effects: [effect("celik-yelek", "workerHealth", 0.45)] }),
  defineItem("sahra-reviri", "Sahra Revi̇ri", "Tüm işçilerin canı +%120 ama toplama hızı -%15.", "utility", 140, { axes: ["economy"], effects: [effect("sahra-reviri", "workerHealth", 1.2), effect("sahra-reviri", "workerGatherSpeed", -0.15)] }),
  // Onarim hizi: biri merdiven, biri tek buyuk adim -- can esyalariyla ayni
  // sekil, cunku ikisi de ayni soruyu soruyor: bu kule ayakta kalsin mi.
  defineItem("pnomatik-anahtar", "Pnömatik Anahtar", "Tüm tamircilerin onarım hızı +%40; en fazla 4 kez alınır.", "utility", 48, { repeatable: true, maxStacks: 4, priceGrowth: 1.25, axes: ["economy"], effects: [effect("pnomatik-anahtar", "workerRepairRate", 0.4)] }),
  defineItem("yedek-parca-sandigi", "Yedek Parça Sandığı", "Tüm tamircilerin onarım hızı +%110 ama taşıma kapasitesi -%20.", "utility", 130, { axes: ["economy"], effects: [effect("yedek-parca-sandigi", "workerRepairRate", 1.1), effect("yedek-parca-sandigi", "workerCapacity", -0.2)] }),
  defineItem("isci-botlari", "İşçi Botları", "Takıldığı binaya hizmet eden işçilerin hareket hızı +%15; bir binaya en fazla 5 kez takılır.", "utility", 28, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("isci-botlari", "workerSpeed", 0.15)] }),
  defineItem("namlu-yatagi", "Namlu Yatağı", "Takıldığı kulenin dönüş hızı +%35; bir kuleye en fazla 2 kez takılır.", "power", 100, { repeatable: true, maxStacks: 2, effects: [effect("namlu-yatagi", "turnRate", 0.35)] }),
  defineItem("nisangah", "Nişangâh", "Takıldığı kulenin isabeti +%30; bir kuleye en fazla 2 kez takılır.", "power", 60, { repeatable: true, maxStacks: 2, effects: [effect("nisangah", "accuracy", 0.3)] }),
  defineItem("hafif-muhimmat", "Hafif Mühimmat", "Takıldığı kulenin mermi hızı +%40; bir kuleye en fazla 2 kez takılır.", "power", 50, { repeatable: true, maxStacks: 2, effects: [effect("hafif-muhimmat", "projectileSpeed", 0.4)] }),
  defineItem("isi-emici", "Isı Emici", "Takıldığı kulenin atış başına ısısı -%25; bir kuleye en fazla 2 kez takılır.", "power", 105, { repeatable: true, maxStacks: 2, effects: [effect("isi-emici", "heat", -0.25)] }),
  defineItem("kritik-sistem", "Kritik Sistem", "Takıldığı kulenin kritik şansı +%12, kritik hasarı +%100.", "power", 150, { scope: { kind: "tagged", combat: true }, effects: [effect("kritik-sistem", "critChance", 0.12), effect("kritik-sistem", "critDamage", 1)] }),
  // Kritik sansi: biri merdiven, biri tek buyuk adim. Tekrarlanabilir olan
  // ucuz basliyor ve zamla buyuyor; tek seferlik olan ayni yere bir hamlede
  // goturuyor ama menzil odiyor. Ikisini de almak mumkun, ama ikisi de ayni
  // kuleye takiliyor ve yuva sayisi sinirli.
  defineItem("hassas-tetik", "Hassas Tetik", "Takıldığı kulenin kritik şansı +%7; bir kuleye en fazla 4 kez takılır.", "power", 45, { scope: { kind: "tagged", combat: true }, repeatable: true, maxStacks: 4, priceGrowth: 1.25, effects: [effect("hassas-tetik", "critChance", 0.07)] }),
  defineItem("sans-mercegi", "Şans Merceği", "Takıldığı kulenin kritik şansı +%25 ama menzili -%20.", "power", 125, { scope: { kind: "tagged", combat: true }, effects: [effect("sans-mercegi", "critChance", 0.25), effect("sans-mercegi", "range", -0.2)] }),
  // Kritik hasari: ikisi de kritik sansi olan bir kulede anlamli. Isi
  // odeyen olan daha buyuk, cunku isi performans koluyla zaten pazarlik
  // konusu -- kolu asagi cekmeyi bilen oyuncu bedeli kucultebilir.
  defineItem("agir-cekirdek", "Ağır Çekirdek", "Takıldığı kulenin kritik hasarı +%120; bir kuleye en fazla 2 kez takılır.", "power", 105, { scope: { kind: "tagged", combat: true }, repeatable: true, maxStacks: 2, priceGrowth: 1.3, effects: [effect("agir-cekirdek", "critDamage", 1.2)] }),
  defineItem("infilak-basligi", "İnfilak Başlığı", "Takıldığı kulenin kritik hasarı +%180 ama ısısı +%30.", "power", 130, { scope: { kind: "tagged", combat: true }, effects: [effect("infilak-basligi", "critDamage", 1.8), effect("infilak-basligi", "heat", 0.3)] }),

  defineItem("delici-cekirdek", "Delici Çekirdek", "Takıldığı kulenin hasarı +%20; yalnızca projectile kulelerine takılır.", "class", 90, { scope: { kind: "tagged", hitTypes: ["projectile"] }, effects: [effect("delici-cekirdek", "damage", 0.2)] }),
  defineItem("odak-mercegi", "Odak Merceği", "Takıldığı kulenin hasarı +%25; yalnızca focus kulelerine takılır.", "class", 90, { scope: { kind: "tagged", hitTypes: ["focus"] }, effects: [effect("odak-mercegi", "damage", 0.25)] }),
  defineItem("agir-kundak", "Ağır Kundak", "Takıldığı kulenin hasarı +%20, dönüş hızı -%10; yalnızca impact kulelerine takılır.", "class", 90, { scope: { kind: "tagged", hitTypes: ["impact"] }, effects: [effect("agir-kundak", "damage", 0.2), effect("agir-kundak", "turnRate", -0.1)] }),
  defineItem("yanki-odasi", "Yankı Odası", "Takıldığı kulenin durum etkisi gücü +%25; yalnızca aura kulelerine takılır.", "class", 90, { scope: { kind: "tagged", hitTypes: ["aura"] }, effects: [effect("yanki-odasi", "statusMagnitude", 0.25)] }),

  // Sure uzatan esyalar. Oyunda dort tane vardi ve dordu de dar kapsamliydi:
  // yalnizca cc, yalnizca psisik, yalnizca aura, yalnizca lanet. Yani sureyi
  // uzatmak bir secim degil, dogru kuleye sahip olma sansiydi. Bu ucu her
  // kuleye takiliyor ve sureyi gercek bir eksen haline getiriyor -- kanama,
  // yanma, yavaslatma, korku, lanet, hepsi ayni statta bulusuyor.
  defineItem("uzun-fitil", "Uzun Fitil", "Takıldığı kulenin bütün durum etkilerinin süresi +%35.", "class", 95, { axes: ["cc"], effects: [effect("uzun-fitil", "statusDuration", 0.35)] }),
  defineItem("agir-metabolizma", "Ağır Metabolizma", "Takıldığı kulenin durum etkileri %70 daha uzun sürer ama %25 daha zayıftır.", "class", 110, { axes: ["cc"], effects: [effect("agir-metabolizma", "statusDuration", 0.7), effect("agir-metabolizma", "statusMagnitude", -0.25)] }),
  defineItem("kalici-iz", "Kalıcı İz", "Takıldığı kulenin durum etkilerinin süresi +%15; bir kuleye en fazla 4 kez takılır.", "class", 45, { repeatable: true, maxStacks: 4, priceGrowth: 1.25, axes: ["cc"], effects: [effect("kalici-iz", "statusDuration", 0.15)] }),

  defineItem("komuta-modulu", "Komuta Modülü", "Takıldığı kulenin işaretli düşmanlara hasarı +%30; yalnızca amplify kulelerine takılır.", "class", 110, { axes: ["amplify"], scope: { kind: "tagged", axes: ["amplify"] }, effects: [effect("komuta-modulu", "markAmplification", 0.3)] }),
  defineItem("buz-cekirdegi", "Buz Çekirdeği", "Takıldığı kulenin durum etkisi gücü +%40; yalnızca CC kulelerine takılır.", "class", 100, { axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, effects: [effect("buz-cekirdegi", "statusMagnitude", 0.4)] }),
  defineItem("zirh-plakasi", "Zırh Plakası", "Takıldığı kulenin canı +%80; yalnızca barricade kulelerine takılır.", "class", 95, { axes: ["barricade"], scope: { kind: "tagged", axes: ["barricade"] }, effects: [effect("zirh-plakasi", "towerHealth", 0.8)] }),
  // Can esyalari her kuleye takilir; Zirh Plakasi barricade ile sinirli ve
  // oyle kalmali. Hat gerisindeki bir atis kulesi de nisancinin hedefi
  // oldugu icin can artik yalnizca duvarcinin isi degil.
  defineItem("celik-dokum", "Çelik Döküm", "Takıldığı kulenin canı +%55; bir kuleye en fazla 3 kez takılır.", "utility", 50, { repeatable: true, maxStacks: 3, priceGrowth: 1.25, effects: [effect("celik-dokum", "towerHealth", 0.55)] }),
  // Can ve onarim bedeli ayni esyada: ikisi de "bu kule ayakta kalsin"
  // sorusunun cevabi ve Tamirci iscisiyle ayni yone bakiyorlar.
  defineItem("tampon-katman", "Tampon Katman", "Takıldığı kulenin canı +%90 ve onarım bedeli -%35.", "utility", 110, { effects: [effect("tampon-katman", "towerHealth", 0.9), effect("tampon-katman", "repairCost", -0.35)] }),
  defineItem("verim-hatti", "Verim Hattı", "Takıldığı binanın üretim hızı +%35; yalnızca economy binalarına takılır.", "class", 100, { axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("verim-hatti", "resourceProduction", 0.35)] }),

  defineItem("termal-funye", "Termal Fünye", "Takıldığı kule 4 saniye boyunca saniyede %1,5 yakar; yalnızca fire kulelerine takılır.", "class", 120, { scope: { kind: "tagged", damageTypes: ["fire"] }, unlocks: ["status:burn"] }),
  defineItem("kriyojen-hat", "Kriyojen Hat", "Takıldığı kule yavaşlatılmış hedeflere %20 fazla hasar verir; yalnızca CC kulelerine takılır.", "class", 115, { axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, unlocks: ["status:chill"] }),

  defineItem("hedef-kilidi", "Hedef Kilidi", "Takıldığı kule hedefini 2 saniye daha uzun korur.", "utility", 90, { effects: [effect("hedef-kilidi", "targetLockMs", 2000)] }),
  defineItem("avci-protokolu", "Avcı Protokolü", "Takıldığı kuleye 2 hedefleme modu açar: en zayıf ve rastgele.", "utility", 60, { unlocks: ["targeting:weakest", "targeting:random"] }),
  defineItem("nobetci-protokolu", "Nöbetçi Protokolü", "Takıldığı kuleye 2 hedefleme modu açar: en yakın ve son.", "utility", 60, { unlocks: ["targeting:closest", "targeting:last"] }),

  defineItem("ucaksavar-kiti", "Uçaksavar Kiti", "Takıldığı kule hava hedeflerine ateş açar, hava hasarı -%50.", "utility", 160, { effects: [effect("ucaksavar-kiti", "airDamage", -0.5)], unlocks: ["canHitAir"] }),
  defineItem("kalkan-delici", "Kalkan Delici", "Takıldığı kulenin kalkanlı düşmanlara hasarı +%35.", "power", 105, { scope: { kind: "tagged", combat: true }, effects: [effect("kalkan-delici", "damageVsShielded", 0.35)] }),
  defineItem("agir-avcisi", "Ağır Avcısı", "Takıldığı kulenin brute düşmanlara hasarı +%40.", "power", 100, { scope: { kind: "tagged", combat: true }, effects: [effect("agir-avcisi", "damageVsBrute", 0.4)] }),

  defineItem("son-mermi", "Son Mermi", "Takıldığı kulenin mühimmatı bitiren son atışı +%200 hasar verir.", "power", 95, { scope: { kind: "tagged", combat: true }, effects: [effect("son-mermi", "ammoEmptyDamage", 2)] }),
  defineItem("enkaz-alani", "Enkaz Alanı", "Takıldığı kule yıkılırsa 12 saniyelik yavaşlatıcı enkaz bırakır.", "map", 80, { unlocks: ["trigger:debrisOnDeath"] }),
  defineItem("zafer-serisi", "Zafer Serisi", "Takıldığı kule öldürme başına +%3 hasar kazanır; dalga içi tavan %45.", "power", 125, { scope: { kind: "tagged", combat: true }, unlocks: ["stack:kill"] }),
  defineItem("kidem", "Kıdem", "Takıldığı kule tamamlanan her dalga için kalıcı +%2 hasar kazanır.", "power", 150, { scope: { kind: "tagged", combat: true }, unlocks: ["stack:wave"] }),

  defineItem("kristal-rafinerisi", "Kristal Rafinerisi", "Takıldığı kulenin yakıt tüketimi -%40; yalnızca güç kristali kullanan kulelere takılır.", "class", 85, { scope: { kind: "tagged", ammoTypes: ["powerCrystal"] }, effects: [effect("kristal-rafinerisi", "shotFuelCost", -0.4)] }),
  defineItem("dusuk-guc-modu", "Düşük Güç Modülü", "Takıldığı kulenin çalışma enerjisi tüketimi -%25.", "utility", 110, { effects: [effect("dusuk-guc-modu", "operatingEnergyCost", -0.25)] }),
  defineItem("bitisik-devre", "Bitişik Devre", "Takıldığı kule bitişik her komşusu için +%8 hasar kazanır; en fazla 4 komşu.", "map", 110, { unlocks: ["adjacencyBonus"] }),
  defineItem("yalniz-kurt", "Yalnız Kurt", "Takıldığı kule komşusuzsa +%25 hasar ve +%15 menzil kazanır.", "map", 100, { unlocks: ["isolationBonus"] }),

  defineItem("besinci-isci", "Beşinci İşçi", "Kalıcı olarak 1 ek lojistik işçisi sağlar.", "utility", 170),
  defineItem("ek-yuva-magaza", "Ek Yuva", "Kule kapasitesi +1; 5. dalgadan sonra en fazla 2 kez.", "utility", 210, { repeatable: true, maxStacks: 2, priceGrowth: 1.5, unlockWave: 5, effects: [effect("ek-yuva-magaza", "towerCapacity", 1)] }),
  defineItem("bariyer", "Bariyer", "Seçilen 1 yol karesini kapatır; en fazla 3 kez.", "map", 180, { repeatable: true, maxStacks: 3 }),
  defineItem("ziftli-zemin", "Ziftli Zemin", "Seçilen 1 karede düşmanları %25 yavaşlatır; en fazla 4 kez.", "map", 75, { repeatable: true, maxStacks: 4 }),
  defineItem("nexus-kalkani", "Nexus Kalkanı", "Bu dalgadaki ilk 3 sızıntıyı engelleyen 1 kullanım sağlar.", "utility", 65, { repeatable: true, unlocks: ["nexusShield"] }),
  defineItem("faiz-hesabi", "Faiz Hesabı", "Dalga sonunda altının %16'sını kazandırır.", "utility", 140, { unlocks: ["goldInterest"] }),
  defineItem("ganimet-avcisi", "Ganimet Avcısı", "Takıldığı kulenin öldürdüğü düşmanlar %20 ihtimalle 4 mühimmat düşürür.", "utility", 90, { scope: { kind: "tagged", combat: true }, unlocks: ["ammoDrop"] }),

  // Saldiri sekline gore ayrisan esyalar. Sekil filtresi her kulede dolu oldugu
  // icin hicbiri olu icerik degil; vurus ve hasar turu ise kulelerin yarisinda
  // tanimsiz, o yuzden dar kapsamlar sekil uzerinden kuruluyor.
  defineItem("koni-yayici", "Koni Yayıcı", "Takıldığı kulenin durum etkisi gücü +%45; yalnızca koni saldıran kulelere takılır.", "class", 95, { axes: ["cc"], scope: { kind: "tagged", shapes: ["cone"] }, effects: [effect("koni-yayici", "statusMagnitude", 0.45)] }),
  defineItem("hat-namlusu", "Hat Namlusu", "Takıldığı kulenin hasarı +%40; yalnızca hat saldıran kulelere takılır.", "class", 100, { scope: { kind: "tagged", shapes: ["line"] }, effects: [effect("hat-namlusu", "damage", 0.4)] }),
  defineItem("yorunge-rulmani", "Yörünge Rulmanı", "Takıldığı kulenin hasarı +%40, ısısı +%20; yalnızca yörünge kulelerine takılır.", "class", 95, { scope: { kind: "tagged", shapes: ["orbit"] }, effects: [effect("yorunge-rulmani", "damage", 0.4), effect("yorunge-rulmani", "heat", 0.2)] }),
  defineItem("isin-prizmasi", "Işın Prizması", "Takıldığı kulenin hasarı +%45, soğuması -%15; yalnızca ışın kulelerine takılır.", "class", 105, { scope: { kind: "tagged", shapes: ["beam"] }, effects: [effect("isin-prizmasi", "damage", 0.45), effect("isin-prizmasi", "cooling", -0.15)] }),

  defineItem("ganimet-kesesi", "Ganimet Kesesi", "Düşman altını +%160.", "utility", 110, { effects: [effect("ganimet-kesesi", "goldGain", 1.6)] }),
  defineItem("ikmal-hatti", "İkmal Hattı", "Takıldığı kulenin atış yakıtı tüketimi -%30.", "utility", 95, { effects: [effect("ikmal-hatti", "shotFuelCost", -0.3)] }),

  // Motor esyalari. Esya tek bir kuleye kalici olarak takildigi icin grant
  // dilbilgisi burada kartlardan daha da yerinde: verilen davranis o kulenin
  // kimligi olur, butun kurulusa yayilmaz.
  defineItem("sabir-modulu", "Sabır Modülü", "Takıldığı kule aynı hedefe her vuruşta +%5 hasar kazanır; hedef değişince sıfırlanır.", "power", 130, { scope: { kind: "tagged", combat: true },
    grants: { stacks: [{ id: "shop-sabir", trigger: "sameTarget", stat: "damage", perStack: 0.05, max: 10, resetOn: "targetChange" }] }
  }),
  defineItem("delici-uc", "Delici Uç", "Takıldığı kule 1 düşman daha deler; yalnızca tek hedef ve hat saldıran kulelere takılır.", "class", 120, {
    scope: { kind: "tagged", shapes: ["single", "line"] },
    grants: { attack: { pierceCount: 1 } }
  }),
  defineItem("ek-bicak-yuvasi", "Ek Bıçak Yuvası", "Takıldığı kuleye 1 bıçak ekler, yakıt tüketimi +%35; yalnızca yörünge kulelerine takılır.", "class", 135, {
    scope: { kind: "tagged", shapes: ["orbit"] },
    effects: [effect("ek-bicak-yuvasi", "shotFuelCost", 0.35)],
    grants: { attack: { bladeCount: 1 } }
  }),
  defineItem("buz-serpintisi", "Buz Serpintisi", "Takıldığı kulenin vuruşları 1,5 saniye %20 yavaşlatır.", "class", 125, {
    axes: ["cc"],
    grants: { statusEffects: [{ type: "chill", magnitude: 0.2, durationMs: 1500, stacking: "refresh" }] }
  }),
  defineItem("intikam-devresi", "İntikam Devresi", "Takıldığı kulenin menzilinden düşman kaçarsa 8 saniye +%80 hasar verir.", "power", 115, { scope: { kind: "tagged", combat: true },
    grants: { triggers: [{ event: "escape", effect: "surge", cooldownMs: 8000 }] }
  }),

  // Isi ekseni esyalari kart karsiliklarindan daha keskin: tek kuleyi
  // baglandiklari icin butun kurulusu riske atmazlar.
  defineItem("kizil-namlu", "Kızıl Namlu", "Takıldığı kule her sıcaklık derecesi için +%0,6 hasar kazanır ama 80 derecede kilitlenir.", "power", 140, { scope: { kind: "tagged", combat: true }, unlocks: ["heat:runHot"] }),
  defineItem("kriyostat", "Kriyostat", "Takıldığı kulenin sıcaklığı 20'nin altındayken kritik şansı +%25.", "power", 135, { scope: { kind: "tagged", combat: true }, unlocks: ["heat:coldCrit"] }),
  defineItem("tahliye-valfi", "Tahliye Valfi", "Takıldığı kulenin enerjisi biterse 4 saniye mühimmatla ateş etmeyi sürdürür.", "utility", 120, { unlocks: ["energy:backupLine"] }),

  // Sogutma esyalari. Kart karsiliklarindan farklari tek kuleye baglanmalari:
  // kartla butun kurulusun isi davranisi degisir, esyayla yalnizca en cok
  // isinan kule.
  defineItem("sogutma-sivisi", "Soğutma Sıvısı", "Takıldığı kulenin soğuması +%35; bir kuleye en fazla 3 kez takılır.", "utility", 45, { repeatable: true, maxStacks: 3, priceGrowth: 1.25, effects: [effect("sogutma-sivisi", "cooling", 0.35)] }),
  defineItem("dokme-radyator", "Dökme Radyatör", "Takıldığı kule ne kadar sıcaksa o kadar hızlı soğur: 50 derecede soğuması %50 artar, 100 derecede iki katına çıkar.", "power", 130, { unlocks: ["heat:radiator"] }),
  defineItem("buhar-tahliyesi", "Buhar Tahliyesi", "Takıldığı kule öldürdüğü her düşman için 4 derece soğur.", "power", 120, { scope: { kind: "tagged", combat: true }, unlocks: ["heat:killVent"] }),
  defineItem("sarj-kondansatoru", "Şarj Kondansatörü", "Ulti şarj hızı +%20.", "utility", 145, { effects: [effect("sarj-kondansatoru", "ultimateCharge", 0.2)] }),

  defineItem("riskli-yatirim", "Riskli Yatırım", "Dalga başına takımda 1 kez alınabilir: 10 nexus canı karşılığı 400 altın verir.", "risk", 0, { repeatable: true, maxStacks: 20 }),
  defineItem("egitim-sahasi", "Eğitim Sahası", "Takıldığı kulenin öldürdüğü düşmanlardan gelen tecrübe +%50.", "utility", 130, { axes: ["economy"], effects: [effect("egitim-sahasi", "experienceGain", 0.5)] }),
  defineItem("kaynak-makinesi", "Kaynak Makinesi", "Takıldığı yapının onarım bedeli -%60.", "utility", 85, { axes: ["barricade"], effects: [effect("kaynak-makinesi", "repairCost", -0.6)] }),
  defineItem("karsi-ates-modulu", "Karşı Ateş Modülü", "Takıldığı kulenin nişancı düşmanlara hasarı +%50.", "power", 100, { scope: { kind: "tagged", combat: true }, axes: ["dps"], effects: [effect("karsi-ates-modulu", "damageVsShooter", 0.5)] }),
  defineItem("tuzak-agi", "Tuzak Ağı", "Takıldığı kulenin koşucu düşmanlara hasarı +%45.", "power", 95, { scope: { kind: "tagged", combat: true }, axes: ["dps"], effects: [effect("tuzak-agi", "damageVsRunner", 0.45)] }),
  defineItem("lanet-fitili", "Lanet Fitili", "Takıldığı kulenin durum etkisi süresi +%50; yalnızca lanet kulelerine takılır.", "class", 105, { axes: ["cc"], scope: { kind: "tagged", hitTypes: ["curse"] }, effects: [effect("lanet-fitili", "statusDuration", 0.5)] }),
  defineItem("rezonans-odasi", "Rezonans Odası", "Takıldığı kulenin menzili +%25; yalnızca dalga kulelerine takılır.", "class", 100, { axes: ["cc"], scope: { kind: "tagged", hitTypes: ["wave"] }, effects: [effect("rezonans-odasi", "range", 0.25)] }),
  defineItem("atis-denetleyicisi", "Atış Denetleyicisi", "Takıldığı kulenin atış hızı +%25, ısısı +%20; yalnızca dps kulelerine takılır.", "class", 115, { axes: ["dps"], scope: { kind: "tagged", axes: ["dps"] }, effects: [effect("atis-denetleyicisi", "fireRate", 0.25), effect("atis-denetleyicisi", "heat", 0.2)] }),
  defineItem("direnc-sokucu", "Direnç Sökücü", "Takıldığı kulenin vuruşlarında düşman dirençlerinin %40’ı yok sayılır.", "power", 125, { scope: { kind: "tagged", combat: true }, axes: ["dps"], effects: [effect("direnc-sokucu", "resistancePierce", 0.4)] }),
  defineItem("zaaf-mercegi", "Zaaf Merceği", "Takıldığı kule düşmanın zayıf olduğu hasar tipinden %50 daha çok yararlanır.", "power", 115, { scope: { kind: "tagged", combat: true }, axes: ["dps"], effects: [effect("zaaf-mercegi", "weaknessBonus", 0.5)] }),
  defineItem("asiri-surucu", "Aşırı Sürücü", "Takıldığı kulenin performans kolu yarısı üstündeki ısı ve enerji bedeli -%50.", "power", 130, { axes: ["dps"], effects: [effect("asiri-surucu", "performanceCost", -0.5)] }),
  defineItem("kan-bankasi", "Kan Bankası", "Takıldığı kulenin hasarı +%20 olur; karşılığında her dalga 5 nexus canı gider.", "risk", 75, { scope: { kind: "tagged", combat: true }, unlocks: ["bloodBank"] }),

  // Nisan ve kritik, ikinci tur. Kart karsiliklarinin tek kuleye baglanan
  // halleri; ikisi kapsamla sinirli cunku vaatleri yalnizca nisan alan
  // kulede bir sey yapiyor. Nisan almayan kuleye takilabilseler oyuncu
  // altinini bir hicligin uzerine harcardi -- esya geri sokulemiyor.
  defineItem("jiroskop", "Jiroskop", "Takıldığı kule düşman öldürdükten sonra 2 saniye boyunca dönüş hızı +%150 kazanır; yalnızca nişan alan kulelere takılır.", "class", 85, { scope: { kind: "tagged", aims: true }, unlocks: ["aim:killSnap"] }),
  defineItem("nisan-durbunu", "Nişan Dürbünü", "Takıldığı kulenin isabeti +%45; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 90, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("nisan-durbunu", "accuracy", 0.45)] }),
  defineItem("iz-okuyucu", "İz Okuyucu", "Takıldığı kulenin işaretli düşmanlara kritik şansı +%20; kendi koyduğu takip işareti sayılmaz.", "power", 110, { scope: { kind: "tagged", combat: true }, axes: ["amplify"], unlocks: ["crit:vsMarked"] }),
  defineItem("mesafe-olcer", "Mesafe Ölçer", "Takıldığı kulede isabet bonusunun her %10'u kritik şansına +%3 ekler; en fazla +%30.", "power", 100, { scope: { kind: "tagged", combat: true }, unlocks: ["crit:fromAccuracy"] }),
  defineItem("atesleme-pimi", "Ateşleme Pimi", "Takıldığı kulenin kritik şansı +%20, ısısı +%25.", "power", 95, { scope: { kind: "tagged", combat: true }, effects: [effect("atesleme-pimi", "critChance", 0.2), effect("atesleme-pimi", "heat", 0.25)] }),
  defineItem("yarik-mermi", "Yarık Mermi", "Takıldığı kulenin kritik hasarı +%250, kritik şansı -%6.", "power", 110, { scope: { kind: "tagged", combat: true }, effects: [effect("yarik-mermi", "critDamage", 2.5), effect("yarik-mermi", "critChance", -0.06)] }),

  // Donus hizi, isabet ve mermi hizi, ucuncu tur. Her eksende dort esya ve
  // ayni sekil: ucuz bir merdiven (dort kez), iki buyuk adim ve bir kosullu ya
  // da karma esya. Donus esyalari bedelli; isabet ve mermi hizi esyalarinin
  // bedelleri dorduncu turda kaldirildi. Hepsi kapsamli, cunku esya geri sokulemiyor:
  // statin is gormedigi kuleye takilabilseler oyuncu altinini bosa harcardi.
  defineItem("bilyali-yatak", "Bilyalı Yatak", "Takıldığı kulenin dönüş hızı +%20; bir kuleye en fazla 4 kez takılır; yalnızca nişan alan kulelere takılır.", "class", 40, { repeatable: true, maxStacks: 4, priceGrowth: 1.25, scope: { kind: "tagged", aims: true }, effects: [effect("bilyali-yatak", "turnRate", 0.2)] }),
  defineItem("hafif-taret-kabugu", "Hafif Taret Kabuğu", "Takıldığı kulenin dönüş hızı +%70, canı -%20; yalnızca nişan alan kulelere takılır.", "class", 80, { scope: { kind: "tagged", aims: true }, effects: [effect("hafif-taret-kabugu", "turnRate", 0.7), effect("hafif-taret-kabugu", "towerHealth", -0.2)] }),
  defineItem("taret-motoru", "Taret Motoru", "Takıldığı kulenin dönüş hızı +%120, ısısı +%20; yalnızca nişan alan kulelere takılır.", "class", 110, { scope: { kind: "tagged", aims: true }, effects: [effect("taret-motoru", "turnRate", 1.2), effect("taret-motoru", "heat", 0.2)] }),
  defineItem("hareket-ongorucu", "Hareket Öngörücü", "Takıldığı kule koşucu ve hava hedeflerine dönerken dönüş hızı +%100 kazanır; yalnızca nişan alan kulelere takılır.", "class", 75, { scope: { kind: "tagged", aims: true }, unlocks: ["aim:fastTargets"] }),

  defineItem("gez-arpacik", "Gez ve Arpacık", "Takıldığı kulenin isabeti +%15; bir kuleye en fazla 4 kez takılır; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 35, { repeatable: true, maxStacks: 4, priceGrowth: 1.25, scope: { kind: "tagged", alongFacing: true }, effects: [effect("gez-arpacik", "accuracy", 0.15)] }),
  defineItem("lazer-telemetre", "Lazer Telemetre", "Takıldığı kulenin isabeti +%50, menzili +%10; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 110, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("lazer-telemetre", "accuracy", 0.5), effect("lazer-telemetre", "range", 0.1)] }),
  defineItem("termal-kilif", "Termal Kılıf", "Takıldığı kulenin sıcaklığı 40 derecenin altındayken isabeti +%50; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 70, { scope: { kind: "tagged", alongFacing: true }, unlocks: ["aim:coldAccuracy"] }),
  defineItem("hassas-namlu", "Hassas Namlu", "Takıldığı kulenin isabeti +%35, kritik hasarı +%50; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 105, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("hassas-namlu", "accuracy", 0.35), effect("hassas-namlu", "critDamage", 0.5)] }),

  defineItem("sabot-fisegi", "Sabot Fişeği", "Takıldığı kulenin mermi hızı +%25; bir kuleye en fazla 4 kez takılır; yalnızca mermi atan kulelere takılır.", "class", 40, { repeatable: true, maxStacks: 4, priceGrowth: 1.25, scope: { kind: "tagged", projectiles: true }, effects: [effect("sabot-fisegi", "projectileSpeed", 0.25)] }),
  defineItem("manyetik-ray", "Manyetik Ray", "Takıldığı kulenin mermi hızı +%90; yalnızca mermi atan kulelere takılır.", "class", 90, { scope: { kind: "tagged", projectiles: true }, effects: [effect("manyetik-ray", "projectileSpeed", 0.9)] }),
  defineItem("genlesme-odasi", "Genleşme Odası", "Takıldığı kulenin mermi hızı +%60, menzili +%8; yalnızca mermi atan kulelere takılır.", "class", 105, { scope: { kind: "tagged", projectiles: true }, effects: [effect("genlesme-odasi", "projectileSpeed", 0.6), effect("genlesme-odasi", "range", 0.08)] }),
  defineItem("hafif-cekirdek", "Hafif Çekirdek", "Takıldığı kulenin mermi hızı +%150; yalnızca mermi atan kulelere takılır.", "class", 150, { scope: { kind: "tagged", projectiles: true }, effects: [effect("hafif-cekirdek", "projectileSpeed", 1.5)] }),

  // Isabet ve mermi hizi, dorduncu tur: bedelsiz. Isabet ve mermi hizi
  // esyalarinin hicbiri artik bir sey odetmiyor; aralarindaki secim yuva
  // (kule basina 5), fiyat ve kosul. Her eksende uc yeni sekil: tek buyuk
  // adim ya da ikincil bir stat, bir kosul ve bir yigin.
  //
  // Isabet tavani (1.0) ve Balistik Hesaplayici: tek kulede yalnizca
  // kosulsuz esyalarla isabet 2,2'ye cikabiliyor (Atalet Dengeleyici,
  // Lazer Telemetre, Nisan Durbunu, Hassas Namlu, Optik Hedefleyici).
  // Yalnizca esyayla epigin tavani (1,5) uc pahali yuva istiyor; kartlar da
  // isabet verdigi icin (Nisan Takimi, Sabit Kundak, Titresim Sonumleyici,
  // Nisan Kertigi, Uzun Namlu, Atis Kontrol Birimi) karta yatirim yapmis bir
  // destede daha az esya yetiyor.
  defineItem("atalet-dengeleyici", "Atalet Dengeleyici", "Takıldığı kulenin isabeti +%60; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 120, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("atalet-dengeleyici", "accuracy", 0.6)] }),
  defineItem("optik-hedefleyici", "Optik Hedefleyici", "Takıldığı kulenin isabeti +%30, kritik şansı +%8; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 100, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("optik-hedefleyici", "accuracy", 0.3), effect("optik-hedefleyici", "critChance", 0.08)] }),
  defineItem("irtifa-olcer", "İrtifa Ölçer", "Takıldığı kulenin hava hedeflerine isabeti +%60; bir kuleye en fazla 2 kez takılır; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 65, { repeatable: true, maxStacks: 2, priceGrowth: 1.3, scope: { kind: "tagged", alongFacing: true }, effects: [effect("irtifa-olcer", "accuracyVsAir", 0.6)] }),
  defineItem("tungsten-cekirdek", "Tungsten Çekirdek", "Takıldığı kulenin mermi hızı +%50, kritik hasarı +%40; yalnızca mermi atan kulelere takılır.", "class", 105, { scope: { kind: "tagged", projectiles: true }, effects: [effect("tungsten-cekirdek", "projectileSpeed", 0.5), effect("tungsten-cekirdek", "critDamage", 0.4)] }),
  defineItem("sessiz-mevzi", "Sessiz Mevzi", "Takıldığı kule komşusuzken mermi hızı +%120 kazanır; yalnızca mermi atan kulelere takılır.", "class", 70, { scope: { kind: "tagged", projectiles: true }, effects: [effect("sessiz-mevzi", "projectileSpeedIsolated", 1.2)] }),
  defineItem("gauss-bobini", "Gauss Bobini", "Takıldığı kulenin mermi hızı +%20, menzili +%3; bir kuleye en fazla 3 kez takılır; yalnızca mermi atan kulelere takılır.", "class", 55, { repeatable: true, maxStacks: 3, priceGrowth: 1.3, scope: { kind: "tagged", projectiles: true }, effects: [effect("gauss-bobini", "projectileSpeed", 0.2), effect("gauss-bobini", "range", 0.03)] }),

  // Altin. Bes esya, dort ayri kol: oldurme altini carpani (merdiven),
  // temiz dalga primi, ekonomi binasinin dalga geliri, kritik oldurme primi
  // ve vadeli altin. Dalga basina altin tavani yok (sahibi kaldirdi). Darphane ve Kelle Defteri
  // kuleye takiliyor ve ikisi de kule katmanindan okunuyor (oldurenin
  // kulesi, binanin kendisi); obur ucu oyuncunun.
  defineItem("altin-elek", "Altın Elek", "Düşman altını +%96; en fazla 3 kez alınır.", "utility", 85, { repeatable: true, maxStacks: 3, priceGrowth: 1.5, axes: ["economy"], effects: [effect("altin-elek", "goldGain", 0.96)] }),
  defineItem("sigorta-policesi", "Sigorta Poliçesi", "Sızıntısız biten her dalga sonunda +360 altın.", "utility", 120, { axes: ["economy"], unlocks: ["gold:cleanWave"] }),
  defineItem("darphane-modulu", "Darphane Modülü", "Takıldığı bina dalga sonunda ayaktaysa +160 altın verir; bir binaya en fazla 3 kez takılır; yalnızca ekonomi binalarına takılır.", "utility", 80, { repeatable: true, maxStacks: 3, priceGrowth: 1.3, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("darphane-modulu", "waveIncome", 160)] }),
  defineItem("kelle-defteri", "Kelle Defteri", "Takıldığı kulenin kritik vuruşla öldürdüğü her düşman +24 altın verir.", "utility", 70, { scope: { kind: "tagged", combat: true }, axes: ["economy"], unlocks: ["gold:critKill"] }),
  defineItem("vadeli-mevduat", "Vadeli Mevduat", "Satın alındıktan sonra 4 dalga tamamlanınca 440 altın öder; en fazla 2 kez alınır; 16. dalgadan sonra çıkmaz.", "utility", 150, { repeatable: true, maxStacks: 2, priceGrowth: 1, axes: ["economy"], deposit: { payout: 440, waves: 4 } }),

  // Altin primleri: belirli bir olaya baglanan duz altin, hepsi bedelsiz ve
  // tavansiz. Oldurme altini carpanindan (Ganimet Kesesi, Altin Elek)
  // ve dalga sonu gelirlerinden (Darphane, Sigorta, Faiz) ayri kollar:
  // sampiyon, ucan dusman, kulenin hasari, toplu oldurme ve tasan hasar.
  // Sampiyon primi oyuncunun (kuresel); otekiler kuleye takiliyor ve
  // oldurenin ya da hasari verenin kulesinden okunuyor -- hangi kuleye
  // takilacagi bir karar.
  defineItem("odul-fermani", "Ödül Fermanı", "Bir şampiyon düşman öldüğünde (kim öldürürse öldürsün) +600 altın.", "utility", 120, { axes: ["economy"], effects: [effect("odul-fermani", "championGold", 600)] }),
  defineItem("dusurme-primi", "Düşürme Primi", "Takıldığı kulenin öldürdüğü her uçan düşman +32 altın verir.", "utility", 75, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("dusurme-primi", "airKillGold", 32)] }),
  defineItem("savas-tazminati", "Savaş Tazminatı", "Takıldığı kule dalga sonunda o dalga verdiği her 1000 hasar için +40 altın kazandırır.", "utility", 90, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("savas-tazminati", "damageGold", 40)] }),
  defineItem("toplu-imha-primi", "Toplu İmha Primi", "Takıldığı kule 2 saniye içinde 3 düşman öldürdüğünde +60 altın verir.", "utility", 85, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("toplu-imha-primi", "multiKillGold", 60)] }),
  defineItem("artik-enerji-toplayici", "Artık Enerji Toplayıcı", "Takıldığı kulenin öldürücü vuruşlarında hedefin canını aşan hasarın %20'si altına dönüşür.", "utility", 70, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("artik-enerji-toplayici", "overkillGold", 0.2)] }),
  // Ikinci tur kule primleri: kulenin sicakligi, hedefin yavasligi, ikmal
  // ve mesafe. Hepsi takildigi kulenin listesinden okunuyor ve kulenin
  // sahibine oduyor; tavan yok.
  defineItem("ates-hatti-primi", "Ateş Hattı Primi", "Takıldığı kule sıcaklığı 50 derece ya da üstündeyken öldürdüğü her düşman için (yanma ve kanamasıyla ölenler dahil) +12 altın verir.", "utility", 70, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("ates-hatti-primi", "hotKillGold", 12)] }),
  defineItem("soguk-av-kaydi", "Soğuk Av Kaydı", "Takıldığı kulenin öldürdüğü her yavaşlamış düşman (yanma ve kanamasıyla ölenler dahil) +12 altın verir.", "utility", 70, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("soguk-av-kaydi", "slowedKillGold", 12)] }),
  defineItem("ikmal-senedi", "İkmal Senedi", "Takıldığı kuleye teslim edilen her 5 mühimmat ya da 15 enerji için +2 altın verir.", "utility", 75, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("ikmal-senedi", "deliveryGold", 2)] }),
  defineItem("uzak-menzil-primi", "Uzak Menzil Primi", "Takıldığı kulenin menzilinin dış dörtte birinde vurarak öldürdüğü her düşman +16 altın verir; menzili haritayı kaplayan kulelere takılmaz.", "utility", 75, { axes: ["economy"], scope: { kind: "tagged", combat: true, boundedRange: true }, effects: [effect("uzak-menzil-primi", "longRangeKillGold", 16)] })
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
  | "incompatibleTower"
  /** Bu kulede bu esyanin kule basina siniri dolu. */
  | "itemLimit"
  /** Kulede bu esyayla birlikte takilamayan karsit esya var. */
  | "itemConflict";

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
  if (getShopItemCount(equippedItemIds, item.id) >= getShopItemTowerLimit(item)) return { ok: false, reason: "itemLimit" };
  const rival = getExclusiveShopItemId(item.id);
  if (rival && equippedItemIds.includes(rival)) return { ok: false, reason: "itemConflict" };
  return { ok: true };
}

/**
 * Bir kulede kartlarin ve takili esyalarin actigi kilitler.
 *
 * Sunucunun `collectTowerGrants` kuraliyla ayni: genel kart her yapiya,
 * etiketli kart uyan kuleye, hedefli kart yalnizca takildigi kuleye, esya
 * yalnizca takildigi kuleye. Kilitler bir kume oldugu icin ayni kilidi ikinci
 * kez vermek hicbir sey eklemiyor; arayuz ve vitrin bunu buradan okuyor.
 */
export function getTowerGrantedUnlocks(options: {
  tower: CardTowerProfile;
  ownedCardIds: readonly string[];
  targetedCardIds?: readonly string[];
  equippedItemIds?: readonly string[];
}) {
  const unlocks = new Set<Unlock>();
  for (const cardId of options.ownedCardIds) {
    const card = getCardDefinition(cardId);
    if (card && ownedCardAppliesToTower(card, options.tower)) for (const unlock of card.unlocks ?? []) unlocks.add(unlock);
  }
  for (const cardId of options.targetedCardIds ?? []) {
    for (const unlock of getCardDefinition(cardId)?.unlocks ?? []) unlocks.add(unlock);
  }
  for (const itemId of options.equippedItemIds ?? []) {
    for (const unlock of getShopItem(itemId)?.unlocks ?? []) unlocks.add(unlock);
  }
  return unlocks;
}

/**
 * Kart cekilisinin "kilidi esyadan zaten geliyor" girdisi
 * (`isCardUnlockAlreadyOwned`): kuresel esyalarin kilitleri ve her kulenin
 * takili esyalariyla hedefli kartlarinin kilitleri. Desteden gelen kartlar
 * burada yok -- sahip olunan kart zaten cekilise girmiyor.
 */
export function getOwnedItemUnlocks(
  ownedItemIds: readonly string[],
  towers: ReadonlyArray<{ definition: CardTowerProfile; equippedShopItemIds?: readonly string[]; targetedCardIds?: readonly string[] }>
): CardDrawOwnedUnlocks {
  const global = new Set<Unlock>();
  for (const itemId of ownedItemIds) {
    const item = getShopItem(itemId);
    if (item?.target === "global") for (const unlock of item.unlocks ?? []) global.add(unlock);
  }
  return {
    global,
    towers: towers.map((tower) => ({
      tower: tower.definition,
      unlocks: getTowerGrantedUnlocks({ tower: tower.definition, ownedCardIds: [], targetedCardIds: tower.targetedCardIds ?? [], equippedItemIds: tower.equippedShopItemIds ?? [] })
    }))
  };
}

/** Esyanin vaat ettigi her kilit zaten acik mi. Kilit vermeyen esya hicbir zaman. */
export function isShopItemUnlockRedundant(item: ShopItem, unlocks: ReadonlySet<Unlock>) {
  return (item.unlocks?.length ?? 0) > 0 && item.unlocks!.every((unlock) => unlocks.has(unlock));
}

/**
 * Esyanin kilidi oyuncunun kartlarindan zaten geliyor mu.
 *
 * Vitrin sorusu: esya takilabilecegi **her** kulede kartlarin zaten actigi
 * kilidi veriyorsa satin almak altini bosa harcamak. Av Refleksi alinmisken
 * Jiroskop, Zafer Sarhoslugu alinmisken Zafer Serisi boyle. Hedefli kartlar
 * burada sayilmiyor: tek kuleye bagli, esya baska kuleye takilabilir.
 * Takilabilecegi kule yoksa genel kartlara bakiliyor -- sonra kurulacak
 * her kulede de acik olacak olan yalnizca onlar.
 */
export function isShopItemAlreadyUnlocked(item: ShopItem, ownedCardIds: readonly string[], towers: readonly CardTowerProfile[]) {
  if (!item.unlocks?.length || ownedCardIds.length === 0) return false;
  const eligible = item.target === "global" ? [] : towers.filter((tower) => shopItemAppliesToTower(item, tower));
  if (eligible.length === 0) {
    const globalUnlocks = new Set<Unlock>();
    for (const cardId of ownedCardIds) {
      const card = getCardDefinition(cardId);
      if (card?.scope.kind === "global") for (const unlock of card.unlocks ?? []) globalUnlocks.add(unlock);
    }
    return isShopItemUnlockRedundant(item, globalUnlocks);
  }
  return eligible.every((tower) => isShopItemUnlockRedundant(item, getTowerGrantedUnlocks({ tower, ownedCardIds })));
}

/**
 * `marksAvailable` kart cekilisindekiyle ayni anlamda; bkz. `drawCards`.
 * `ownedCardIds` verilirse kilidi kartlardan zaten gelen esya olu agirlik alir
 * (`isShopItemAlreadyUnlocked`).
 */
/*
 * `excludeItemIds`: bu cekiliste hic sunulmayacak esyalar; sunucu takimda
 * dalga basina bir kez alinabilen Riskli Yatirim'i alindigi dalganin geri
 * kalaninda (yenilemeler dahil, takimin hepsine) buradan disarida tutuyor.
 * `loadout`: kule esyalarinin kule basina sinirlari icin; bkz. `isShopItemAvailable`.
 */
export function drawShopOffers(options: { wave: number; preferredAxes: TowerAxis[]; towers: CardTowerProfile[]; ownedItemIds: string[]; ownedCardIds?: readonly string[]; marksAvailable?: boolean; excludeItemIds?: readonly string[]; loadout?: ShopItemLoadout; count?: number; random?: () => number }) {
  const random = options.random ?? Math.random;
  const excluded = new Set(options.excludeItemIds ?? []);
  const pool = shopCatalog.filter((item) => !excluded.has(item.id) && isShopItemAvailable(item, options.wave, options.ownedItemIds, options.loadout));
  const result: ShopItem[] = [];
  while (result.length < (options.count ?? SHOP_OFFER_COUNT) && pool.length > 0) {
    const weights = pool.map((item) => {
      const axisWeight = item.axes.some((axis) => options.preferredAxes.slice(0, 2).includes(axis)) ? 2 : 1;
      const deadWeight = (item.scope.kind === "tagged" && !options.towers.some((tower) => shopItemAppliesToTower(item, tower)))
        || (options.marksAvailable === false && isMarkOnlyChoice(item))
        || (options.ownedCardIds !== undefined && isShopItemAlreadyUnlocked(item, options.ownedCardIds, options.towers)) ? 0.15 : 1;
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
