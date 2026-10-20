import type { CardDrawOwnedUnlocks, CardScope, CardTowerProfile, Unlock } from "../cards/index.js";
import { describeLegendaryEffect, getCardDefinition, ownedCardAppliesToTower } from "../cards/index.js";
import { LEGENDARY_CHANCE_STATS, LEGENDARY_EFFECTS, LEGENDARY_ITEM_CHANCE, type LegendaryEffect } from "../legendary/index.js";
import { isMarkOnlyChoice } from "../marks/index.js";
import { getShopItemTowerMismatch, isShopItemUsefulOnTower, type ShopItemNeed } from "./compatibility.js";
import type { TowerAxis } from "../characters/common/types.js";
import type { TowerGrant } from "../grants/index.js";
import type { Modifier, StatConversion } from "../modifiers/index.js";
import { FINAL_WAVE } from "../balance/index.js";

export type ShopItemCategory = "power" | "class" | "utility" | "map" | "risk";

/**
 * Esyalar artik envantere girer ve tek bir kuleye takilir. Geriye yalnizca
 * kuleye takilmasi anlamsiz olanlar global kaldi: bunlar isciyi, nexusu, altin
 * ekonomisini veya harita karesini etkiliyor, bir kulenin statini degil.
 */
export type ShopItemTarget = "tower" | "global";

/**
 * Esya nadirligi. Esyalarin cogu nadirliksiz ve vitrine esit agirlikla
 * giriyor; bu hic degismedi. Yalnizca efsanevi esyalar (vurus etkileri,
 * `legendary` modulu) isaretli: vitrinde `SHOP_LEGENDARY_OFFER_WEIGHT`
 * agirligiyla seyrek cikiyorlar ve pahalilar.
 */
export type ShopItemRarity = "legendary";

/** Efsanevi esyanin vitrin agirligi; nadirliksiz esyalarinki 1. */
export const SHOP_LEGENDARY_OFFER_WEIGHT = 0.12;

/** Esyanin vitrin agirligi carpani (eksen ve olu agirlik oncesi). */
export function getShopItemOfferWeight(item: Pick<ShopItem, "rarity">) {
  return item.rarity === "legendary" ? SHOP_LEGENDARY_OFFER_WEIGHT : 1;
}

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
  "odul-fermani",
  // Tecrube kazanci oyuncunun listesinden okunuyor (`experienceGain`).
  "egitim-kilavuzu"
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
  /** Yalnizca efsanevi esyalarda yazili; bkz. `ShopItemRarity`. */
  rarity?: ShopItemRarity;
  /**
   * Takildigi kulede bir statin bonusunu baska bir stata ceviren esyalar
   * (Epik kartlarin `conversions`i ile ayni kural: kaynak cevrimlerden once
   * okunuyor, zincir ve geri besleme yok). Sunucu ciktiyi `shop:<kimlik>`
   * kaynagiyla yaziyor.
   */
  conversions?: StatConversion[];
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
/**
 * Kan Bankasi: takili her kopya dalga basinda nexustan bu kadar can aliyor.
 * Odeme nexusu oldurecek ya da 1'in altina indirecekse kopya o dalga
 * odenmiyor ve bonusu da islemiyor -- esya kendi takimini oldurmuyor.
 */
export const BLOOD_BANK_NEXUS_COST = 5;
export const SHOP_REROLL_BASE_PRICE = 40;
export const SHOP_REROLL_PRICE_STEP = 20;
export const DEFAULT_SHOP_PRICE_GROWTH = 1.6;

/**
 * Esya bu kuleye takilabilir mi: kapsam ve esyanin istedigi kule yetenegi
 * (`isShopItemUsefulOnTower`). Fiyat, vitrin, takma ve onay sayaci hep
 * buradan geciyor, yani "takilabilir" her yerde ayni sey.
 */
export function shopItemAppliesToTower(item: ShopItem, tower: CardTowerProfile) {
  return isShopItemUsefulOnTower(item, tower);
}

/**
 * `gold:cleanWave` esyadan (Sigorta Policesi) geldiginde odenen altin. Temiz
 * Sicil kartinin primi (`CLEAN_WAVE_GOLD`) ayri: altin esyalari yariya
 * indiginde kart oldugu gibi kaldi. Ikisi birden aliniyorsa kartin primi
 * odeniyor -- ayni kilit iki kez odenmiyor.
 */
export const INSURANCE_CLEAN_WAVE_GOLD = 180;

/**
 * Esyanin bu kuleye yazdigi modifierlar.
 *
 * Ucaksavar Kiti'nin iki yuzu var: havayi vurmayan kuleye hava atisini
 * acar ve hava hasarini yariya indirir; havayi zaten vuran kulede atis
 * acmanin bir anlami yok, orada ceza yerine hava hasarina ayni buyuklukte
 * bir bonus veriyor. Takma, onizleme ve yaratici modun yeniden kurulumu
 * etkileri buradan okuyor.
 */
export function getShopItemTowerEffects(item: ShopItem, tower: CardTowerProfile): Modifier[] {
  if (item.unlocks?.includes("canHitAir") && tower.engine?.canHitAir) {
    return item.effects.map((modifier) => modifier.stat === "airDamage" ? { ...modifier, add: Math.abs(modifier.add) } : modifier);
  }
  return item.effects;
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
  "yalniz-kurt": "bitisik-devre",
  // Ayni oldurme sayacinin iki tavani: biri kisa ve hizli, obur uzun ve yavas.
  "atis-haritasi": "av-kayit-defteri",
  "av-kayit-defteri": "atis-haritasi",
  // Menzil <-> mermi hizi cevrimleri: ayni kulede ikisi birbirini besler gibi
  // gorunurdu (kaynaklar cevrimden once okundugu icin beslemiyor, ama oyuncu
  // icin anlamsiz bir dongu); sahibin karari, birlikte takilmiyorlar.
  "erim-pompasi": "kinetik-uzatici",
  "kinetik-uzatici": "erim-pompasi"
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

/** Efsanevi esyalar: kimlik, ad ve fiyat, etki sirasiyla. */
export const LEGENDARY_ITEM_NAMES: Record<LegendaryEffect, [id: string, name: string, price: number]> = {
  chain: ["simsek-bobini", "Şimşek Bobini", 460],
  blast: ["patlayici-cekirdek", "Patlayıcı Çekirdek", 480],
  freeze: ["duragan-bobin", "Durağan Bobin", 380],
  execute: ["cellat-modulu", "Cellat Modülü", 440],
  shatter: ["kirilma-cekirdegi", "Kırılma Çekirdeği", 420],
  chrono: ["kronal-kapasitor", "Kronal Kapasitör", 460],
  link: ["bag-vericisi", "Bağ Vericisi", 440],
  gravity: ["graviton-cekirdegi", "Graviton Çekirdeği", 400]
};

function legendaryItems(): ShopItem[] {
  const chance = `%${Math.round(LEGENDARY_ITEM_CHANCE * 100)}`;
  return LEGENDARY_EFFECTS.map((kind) => {
    const [id, name, price] = LEGENDARY_ITEM_NAMES[kind];
    return defineItem(id, name, `Takıldığı kule bir düşmanla temasta geçen her saniye ${chance} ihtimalle ${describeLegendaryEffect(kind)}`, "power", price, {
      axes: ["dps"], scope: { kind: "tagged", combat: true }, rarity: "legendary",
      effects: [effect(id, LEGENDARY_CHANCE_STATS[kind], LEGENDARY_ITEM_CHANCE)]
    });
  });
}

const rawShopCatalog: ShopItem[] = [
  defineItem("sogutucu-kanatlar", "Soğutucu Kanatlar", "Takıldığı kulenin soğuması +%25; bir kuleye en fazla 5 kez takılır.", "utility", 30, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, effects: [effect("sogutucu-kanatlar", "cooling", 0.25)] }),
  // Isci esyalari ekonomi binasina takilir: kazanci o binaya hizmet eden isci
  // alir. Bu yuzden "tagged economy" olmalari sart, aksi halde kaynak binalari
  // takilabilir hedef sayilmaz.
  defineItem("madenci-eldiveni", "Madenci Eldiveni", "Takıldığı binanın kaynak çıkarma hızı +%20; bir binaya en fazla 5 kez takılır.", "utility", 28, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("madenci-eldiveni", "workerGatherSpeed", 0.2)] }),
  defineItem("seri-cephane-hatti", "Seri Cephane Hattı", "Takıldığı binanın cephane üretim hızı +%25; bir binaya en fazla 5 kez takılır; yalnızca cephane fabrikalarına takılır.", "utility", 33, { repeatable: true, maxStacks: 5, priceGrowth: 1.2, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("seri-cephane-hatti", "ammoProduction", 0.25)] }),
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
  defineItem("nisangah", "Nişangâh", "Takıldığı kulenin öncül nişanı +%20: atışların %20'si hedefin, mermi ona varana kadar gideceği noktaya ateşlenir; bir kuleye en fazla 2 kez takılır; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "power", 60, { repeatable: true, maxStacks: 2, scope: { kind: "tagged", alongFacing: true }, effects: [effect("nisangah", "leadTargeting", 0.2)] }),
  defineItem("hafif-muhimmat", "Hafif Mühimmat", "Takıldığı kulenin mermi hızı +%40; bir kuleye en fazla 2 kez takılır.", "power", 50, { repeatable: true, maxStacks: 2, effects: [effect("hafif-muhimmat", "projectileSpeed", 0.4)] }),
  defineItem("isi-emici", "Isı Emici", "Takıldığı kulenin atış başına ısısı -%25; bir kuleye en fazla 2 kez takılır.", "power", 105, { repeatable: true, maxStacks: 2, effects: [effect("isi-emici", "heat", -0.25)] }),
  defineItem("kritik-sistem", "Kritik Sistem", "Takıldığı kulenin kritik şansı +%12, kritik hasarı +%50.", "power", 150, { scope: { kind: "tagged", combat: true }, effects: [effect("kritik-sistem", "critChance", 0.12), effect("kritik-sistem", "critDamage", 0.5)] }),
  // Kritik sansi: biri merdiven, biri tek buyuk adim. Tekrarlanabilir olan
  // ucuz basliyor ve zamla buyuyor; tek seferlik olan ayni yere bir hamlede
  // goturuyor ama menzil odiyor. Ikisini de almak mumkun, ama ikisi de ayni
  // kuleye takiliyor ve yuva sayisi sinirli.
  defineItem("hassas-tetik", "Hassas Tetik", "Takıldığı kulenin kritik şansı +%7; bir kuleye en fazla 4 kez takılır.", "power", 45, { scope: { kind: "tagged", combat: true }, repeatable: true, maxStacks: 4, priceGrowth: 1.25, effects: [effect("hassas-tetik", "critChance", 0.07)] }),
  defineItem("sans-mercegi", "Şans Merceği", "Takıldığı kulenin kritik şansı +%25 ama menzili -%20.", "power", 125, { scope: { kind: "tagged", combat: true }, effects: [effect("sans-mercegi", "critChance", 0.25), effect("sans-mercegi", "range", -0.2)] }),
  // Kritik hasari: ikisi de kritik sansi olan bir kulede anlamli. Isi
  // odeyen olan daha buyuk, cunku isi performans koluyla zaten pazarlik
  // konusu -- kolu asagi cekmeyi bilen oyuncu bedeli kucultebilir.
  defineItem("agir-cekirdek", "Ağır Çekirdek", "Takıldığı kulenin kritik hasarı +%60; bir kuleye en fazla 2 kez takılır.", "power", 105, { scope: { kind: "tagged", combat: true }, repeatable: true, maxStacks: 2, priceGrowth: 1.3, effects: [effect("agir-cekirdek", "critDamage", 0.6)] }),
  defineItem("infilak-basligi", "İnfilak Başlığı", "Takıldığı kulenin kritik şansı +%8, kritik hasarı +%60; kritik vuruşları hedefin çevresine vuruşun %50'si kadar patlama yayar.", "power", 130, { scope: { kind: "tagged", combat: true }, effects: [effect("infilak-basligi", "critChance", 0.08), effect("infilak-basligi", "critDamage", 0.6), effect("infilak-basligi", "critSplash", 0.5)] }),

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
  defineItem("verim-hatti", "Verim Hattı", "Takıldığı binanın üretim hızı +%35; yalnızca cephane fabrikalarına takılır.", "class", 100, { axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("verim-hatti", "resourceProduction", 0.35)] }),

  defineItem("termal-funye", "Termal Fünye", "Takıldığı kule 4 saniye boyunca saniyede %1,5 yakar; yalnızca fire kulelerine takılır.", "class", 120, { scope: { kind: "tagged", damageTypes: ["fire"] }, unlocks: ["status:burn"] }),
  defineItem("kriyojen-hat", "Kriyojen Hat", "Takıldığı kontrol kulesinin yavaşlattığı düşmanlar, yavaşlama sürerken bütün kulelerden %15 fazla hasar alır; yalnızca CC kulelerine takılır.", "class", 115, { axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, effects: [effect("kriyojen-hat", "slowVulnerability", 0.15)] }),

  defineItem("hedef-kilidi", "Hedef Kilidi", "Takıldığı kule hedefini 2 saniye daha uzun korur; yalnızca nişan alan kulelere takılır.", "utility", 90, { effects: [effect("hedef-kilidi", "targetLockMs", 2000)] }),
  defineItem("avci-protokolu", "Avcı Protokolü", "Takıldığı kuleye 2 hedefleme modu açar: en zayıf ve rastgele.", "utility", 60, { unlocks: ["targeting:weakest", "targeting:random"] }),
  defineItem("nobetci-protokolu", "Nöbetçi Protokolü", "Takıldığı kuleye 2 hedefleme modu açar: en yakın ve son.", "utility", 60, { unlocks: ["targeting:closest", "targeting:last"] }),

  defineItem("ucaksavar-kiti", "Uçaksavar Kiti", "Takıldığı kule havayı vurmuyorsa hava hedeflerine ateş açar, hava hasarı -%50; havayı zaten vuruyorsa hava hasarı +%50.", "utility", 160, { effects: [effect("ucaksavar-kiti", "airDamage", -0.5)], unlocks: ["canHitAir"] }),
  defineItem("kalkan-delici", "Kalkan Delici", "Takıldığı kulenin kalkanlı düşmanlara hasarı +%35.", "power", 105, { scope: { kind: "tagged", combat: true }, effects: [effect("kalkan-delici", "damageVsShielded", 0.35)] }),
  defineItem("agir-avcisi", "Ağır Avcısı", "Takıldığı kulenin brute düşmanlara hasarı +%40.", "power", 100, { scope: { kind: "tagged", combat: true }, effects: [effect("agir-avcisi", "damageVsBrute", 0.4)] }),

  defineItem("son-mermi", "Son Mermi", "Takıldığı kulenin mühimmatı bitiren son atışı +%200 hasar verir.", "power", 95, { scope: { kind: "tagged", combat: true }, effects: [effect("son-mermi", "ammoEmptyDamage", 2)] }),
  defineItem("enkaz-alani", "Enkaz Alanı", "Takıldığı kule yıkılırsa 12 saniyelik yavaşlatıcı enkaz bırakır.", "map", 80, { unlocks: ["trigger:debrisOnDeath"] }),
  defineItem("zafer-serisi", "Zafer Serisi", "Takıldığı kule öldürme başına +%3 hasar kazanır; dalga içi tavan %45.", "power", 125, { scope: { kind: "tagged", combat: true }, unlocks: ["stack:kill"] }),
  defineItem("kidem", "Kıdem", "Takıldığı kule tamamlanan her dalga için kalıcı +%2 hasar kazanır.", "power", 150, { scope: { kind: "tagged", combat: true }, unlocks: ["stack:wave"] }),

  defineItem("kristal-rafinerisi", "Kristal Rafinerisi", "Takıldığı kulenin yakıt tüketimi -%40; yalnızca güç çekirdeği kullanan kulelere takılır.", "class", 85, { scope: { kind: "tagged", ammoTypes: ["powerCrystal"] }, effects: [effect("kristal-rafinerisi", "shotFuelCost", -0.4)] }),
  defineItem("dusuk-guc-modu", "Düşük Güç Modülü", "Takıldığı kulenin çalışma enerjisi tüketimi -%25.", "utility", 110, { effects: [effect("dusuk-guc-modu", "operatingEnergyCost", -0.25)] }),
  defineItem("bitisik-devre", "Bitişik Devre", "Takıldığı kule bitişik her komşusu için +%8 hasar kazanır; en fazla 4 komşu.", "map", 110, { unlocks: ["adjacencyBonus"] }),
  defineItem("yalniz-kurt", "Yalnız Kurt", "Takıldığı kule komşusuzsa +%25 hasar ve +%15 menzil kazanır.", "map", 100, { unlocks: ["isolationBonus"] }),

  defineItem("besinci-isci", "Beşinci İşçi", "Kalıcı olarak 1 ek lojistik işçisi sağlar.", "utility", 170),
  defineItem("ek-yuva-magaza", "Ek Yuva", "Kule kapasitesi +1; 5. dalgadan sonra en fazla 2 kez.", "utility", 210, { repeatable: true, maxStacks: 2, priceGrowth: 1.5, unlockWave: 5, effects: [effect("ek-yuva-magaza", "towerCapacity", 1)] }),
  defineItem("bariyer", "Bariyer", "Seçilen 1 yol karesini kapatır; en fazla 3 kez.", "map", 180, { repeatable: true, maxStacks: 3 }),
  defineItem("ziftli-zemin", "Ziftli Zemin", "Seçilen 1 karede düşmanları %25 yavaşlatır; en fazla 4 kez.", "map", 75, { repeatable: true, maxStacks: 4 }),
  defineItem("nexus-kalkani", "Nexus Kalkanı", "Bu dalgadaki ilk 3 sızıntıyı engelleyen 1 kullanım sağlar; kullanılmayan haklar dalga sonunda silinir.", "utility", 65, { repeatable: true, unlocks: ["nexusShield"] }),
  defineItem("faiz-hesabi", "Faiz Hesabı", "Dalga sonunda altının %16'sını kazandırır.", "utility", 140, { unlocks: ["goldInterest"] }),
  defineItem("ganimet-avcisi", "Ganimet Avcısı", "Takıldığı kulenin öldürdüğü düşmanlar %20 ihtimalle 4 mühimmat düşürür.", "utility", 90, { scope: { kind: "tagged", combat: true }, unlocks: ["ammoDrop"] }),

  // Saldiri sekline gore ayrisan esyalar. Sekil filtresi her kulede dolu oldugu
  // icin hicbiri olu icerik degil; vurus ve hasar turu ise kulelerin yarisinda
  // tanimsiz, o yuzden dar kapsamlar sekil uzerinden kuruluyor.
  defineItem("koni-yayici", "Koni Yayıcı", "Takıldığı kulenin durum etkisi gücü +%45; yalnızca koni saldıran kulelere takılır.", "class", 95, { axes: ["cc"], scope: { kind: "tagged", shapes: ["cone"] }, effects: [effect("koni-yayici", "statusMagnitude", 0.45)] }),
  defineItem("hat-namlusu", "Hat Namlusu", "Takıldığı kulenin hasarı +%40; yalnızca hat saldıran kulelere takılır.", "class", 100, { scope: { kind: "tagged", shapes: ["line"] }, effects: [effect("hat-namlusu", "damage", 0.4)] }),
  defineItem("yorunge-rulmani", "Yörünge Rulmanı", "Takıldığı kulenin dönüş hızı +%50, atış başına ısısı -%15; yalnızca nişan alan kulelere takılır.", "class", 95, { scope: { kind: "tagged", aims: true }, effects: [effect("yorunge-rulmani", "turnRate", 0.5), effect("yorunge-rulmani", "heat", -0.15)] }),
  defineItem("isin-prizmasi", "Işın Prizması", "Takıldığı kulenin hasarı +%45, soğuması -%7; yalnızca ışın kulelerine takılır.", "class", 105, { scope: { kind: "tagged", shapes: ["beam"] }, effects: [effect("isin-prizmasi", "damage", 0.45), effect("isin-prizmasi", "cooling", -0.07)] }),

  defineItem("ganimet-kesesi", "Ganimet Kesesi", "Düşman altını +%80.", "utility", 110, { effects: [effect("ganimet-kesesi", "goldGain", 0.8)] }),
  defineItem("ikmal-hatti", "İkmal Hattı", "Takıldığı kulenin atış yakıtı tüketimi -%30.", "utility", 95, { effects: [effect("ikmal-hatti", "shotFuelCost", -0.3)] }),

  // Motor esyalari. Esya tek bir kuleye kalici olarak takildigi icin grant
  // dilbilgisi burada kartlardan daha da yerinde: verilen davranis o kulenin
  // kimligi olur, butun kurulusa yayilmaz.
  defineItem("sabir-modulu", "Sabır Modülü", "Takıldığı kule aynı hedefe her vuruşta +%5 hasar kazanır; hedef değişince sıfırlanır.", "power", 130, { scope: { kind: "tagged", combat: true },
    grants: { stacks: [{ id: "shop-sabir", trigger: "sameTarget", stat: "damage", perStack: 0.05, max: 10, resetOn: "targetChange" }] }
  }),
  defineItem("delici-uc", "Delici Uç", "Takıldığı kule 1 düşman daha deler; yalnızca mermisi düşman delebilen tek hedef ve hat kulelerine takılır.", "class", 120, {
    scope: { kind: "tagged", shapes: ["single", "line"] },
    grants: { attack: { pierceCount: 1 } }
  }),
  defineItem("ek-bicak-yuvasi", "Ek Bıçak Yuvası", "Takıldığı ışın kulesinin her vuruşu, hedefin 2 kare yakınındaki en yakın düşmana vuruşun %50'si kadar sıçrar; yalnızca ışın kulelerine takılır.", "class", 135, { scope: { kind: "tagged", shapes: ["beam"] }, effects: [effect("ek-bicak-yuvasi", "hitSplash", 0.5)] }),
  defineItem("buz-serpintisi", "Buz Serpintisi", "Takıldığı kulenin vuruşları 1,5 saniye %20 yavaşlatır.", "class", 125, {
    axes: ["cc"],
    grants: { statusEffects: [{ type: "chill", magnitude: 0.2, durationMs: 1500, stacking: "strongest", effectKey: "item:buz-serpintisi" }] }
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

  // Isi ve atis hizi, ikinci tur (docs/esya-guc-siniflandirmasi.md, "Yeniden
  // tasarim"). Olcum kulelerin isiyla sinirli oldugunu gosterdi: surekli atis
  // `soguma / atis isisi`, atis hizi bonusu yalnizca isiyi daha cabuk
  // dolduruyor. Asagidaki esyalarin hepsi o dengeye bir yerden dokunuyor --
  // sogumayi buyutuyor, atis isisini indiriyor ya da freni hasara ceviriyor --
  // yani surekli ateste de is goruyorlar. Sabitler `heat-mechanics`te.
  // Uyumluluk: hepsi "heat" (atesle isinan kule) istiyor; hasar okuyanlar
  // ayrica "damage" (bkz. `shop/compatibility.ts` STAT_NEEDS).
  // Sogutma: dort ayri sekil -- duz, fren, vent ve oldurme.
  defineItem("peltier-plakasi", "Peltier Plakası", "Takıldığı kule, soğuma çarpanlarından sonra saniyede 1,5 derece daha soğur.", "utility", 100, { axes: ["dps"], effects: [effect("peltier-plakasi", "coolingFlat", 1.5)] }),
  defineItem("fren-sogutucusu", "Fren Soğutucusu", "Takıldığı kulenin ısı freni devredeyken (50 derecenin üstünde) soğuması +%60.", "utility", 100, { axes: ["dps"], effects: [effect("fren-sogutucusu", "brakeCooling", 0.6)] }),
  defineItem("emniyet-ventili", "Emniyet Ventili", "Takıldığı kulenin sıcaklığı 70 dereceyi geçince 20 derece bir anda atılır; 10 saniyede bir.", "utility", 105, { axes: ["dps"], effects: [effect("emniyet-ventili", "ventHeat", 20)] }),
  defineItem("kriyo-sok-kartusu", "Kriyo Şok Kartuşu", "Takıldığı kule bir düşman öldürünce 2 saniye boyunca 3 kat hızlı soğur.", "utility", 110, { axes: ["dps"], scope: { kind: "tagged", combat: true }, effects: [effect("kriyo-sok-kartusu", "killCooling", 2)] }),
  // Atis hizi: her biri hizini isi butcesinden de aliyor, yani isi tavanina
  // carpip bosa gitmiyor.
  defineItem("senkron-tetik", "Senkron Tetik", "Takıldığı kulenin atış hızı +%25, atış başına ısısı -%25: daha hızlı ateş eder ama daha hızlı ısınmaz.", "power", 120, { axes: ["dps"], scope: { kind: "tagged", combat: true }, effects: [effect("senkron-tetik", "fireRate", 0.25), effect("senkron-tetik", "heat", -0.25)] }),
  defineItem("isil-esik-rolesi", "Isıl Eşik Rölesi", "Takıldığı kulenin atış başına ısısı -%20; sıcaklığı 50 derecenin altındayken atış hızı +%40.", "power", 100, { axes: ["dps"], scope: { kind: "tagged", combat: true }, effects: [effect("isil-esik-rolesi", "heat", -0.2), effect("isil-esik-rolesi", "coldFireRate", 0.4)] }),
  defineItem("takip-ritmi", "Takip Ritmi", "Takıldığı kule aynı hedefe art arda her atışta atış hızı +%8 ve atış başına ısı -%8 kazanır; en fazla 5 kez (+%40 / -%40). Hedef değişince birikimin yarısı düşer.", "power", 110, { axes: ["dps"], scope: { kind: "tagged", combat: true }, effects: [effect("takip-ritmi", "trackRhythm", 0.08)] }),
  defineItem("rejeneratif-fren", "Rejeneratif Fren", "Takıldığı kulede ısı freninin kestiği atış hızının %80'i hasara döner: fren atış hızını yarıya indirdiğinde hasar +%40.", "power", 130, { axes: ["dps"], scope: { kind: "tagged", combat: true }, effects: [effect("rejeneratif-fren", "brakeDamage", 0.8)] }),
  // Isi olaylari: isiyi baska bir seye ceviren mekanikler. Isi Koprusu
  // komsu istiyor; AttackLord'un yalnizlik pasifiyle bilerek ters dusuyor.
  defineItem("isi-koprusu", "Isı Köprüsü", "Takıldığı kule ısısını bitişikteki daha soğuk dost kulelere saniyede 6 dereceye kadar aktarır; komşusuz kulede bir şey yapmaz.", "utility", 90, { axes: ["dps"], effects: [effect("isi-koprusu", "heatBleed", 6)] }),
  defineItem("termal-sok-halkasi", "Termal Şok Halkası", "Takıldığı kulenin sıcaklığı 80 dereceyi geçince biriken ısı şok dalgasına dönüşür: kule 10 derece soğur, menzilinin %60'ı içindeki düşmanlar vuruş hasarının 2 katını alır; 12 saniyede bir, ısı kilidinde beklemeden.", "power", 115, { axes: ["dps"], scope: { kind: "tagged", combat: true }, effects: [effect("termal-sok-halkasi", "heatShock", 2)] }),
  defineItem("yeniden-atesleme-bobini", "Yeniden Ateşleme Bobini", "Takıldığı kule ısı freninden çıkınca (sıcaklık 50 derecenin altına inince) sonraki 3 atışı ısı üretmez ve %50 hızlı gelir; 8 saniyede bir.", "power", 100, { axes: ["dps"], scope: { kind: "tagged", combat: true }, effects: [effect("yeniden-atesleme-bobini", "restartShots", 3)] }),
  defineItem("sarj-kondansatoru", "Şarj Kondansatörü", "Ulti şarj hızı +%20.", "utility", 145, { effects: [effect("sarj-kondansatoru", "ultimateCharge", 0.2)] }),

  defineItem("riskli-yatirim", "Riskli Yatırım", "Dalga başına takımda 1 kez alınabilir: 10 nexus canı karşılığı 400 altın verir.", "risk", 0, { repeatable: true, maxStacks: 20 }),
  defineItem("egitim-sahasi", "Eğitim Sahası", "Takıldığı kulenin öldürdüğü düşmanlardan gelen tecrübe +%50.", "utility", 130, { axes: ["economy"], effects: [effect("egitim-sahasi", "experienceGain", 0.5)] }),
  defineItem("kaynak-makinesi", "Kaynak Makinesi", "Takıldığı yapının onarım bedeli -%60.", "utility", 85, { axes: ["barricade"], effects: [effect("kaynak-makinesi", "repairCost", -0.6)] }),
  defineItem("karsi-ates-modulu", "Karşı Ateş Modülü", "Takıldığı kulenin nişancı düşmanlara hasarı +%50.", "power", 100, { scope: { kind: "tagged", combat: true }, axes: ["dps"], effects: [effect("karsi-ates-modulu", "damageVsShooter", 0.5)] }),
  defineItem("tuzak-agi", "Tuzak Ağı", "Takıldığı kulenin koşucu düşmanlara hasarı +%45.", "power", 95, { scope: { kind: "tagged", combat: true }, axes: ["dps"], effects: [effect("tuzak-agi", "damageVsRunner", 0.45)] }),
  defineItem("lanet-fitili", "Lanet Fitili", "Takıldığı kontrol kulesinin yavaşlattığı düşmanlar, yavaşlama sürerken her saniye azami canlarının %1'i kadar kanar; kulenin durum etkilerinin süresi +%25; yalnızca aura, dalga ve lanet kulelerine takılır.", "class", 105, { axes: ["cc"], scope: { kind: "tagged", hitTypes: ["aura", "wave", "curse"] }, effects: [effect("lanet-fitili", "slowBleed", 0.01), effect("lanet-fitili", "statusDuration", 0.25)] }),
  defineItem("rezonans-odasi", "Rezonans Odası", "Takıldığı yapının bitişiğindeki her dost kulenin soğuması +%25; ateş etmeyen yapılara da takılır (Saray Arşivi, Abartı, Sunucu, duvar).", "utility", 100, { axes: ["amplify"], effects: [effect("rezonans-odasi", "neighborCooling", 0.25)] }),
  defineItem("atis-denetleyicisi", "Atış Denetleyicisi", "Takıldığı kulenin atış hızı +%20, soğuması +%40; yalnızca dps kulelerine takılır.", "class", 115, { axes: ["dps"], scope: { kind: "tagged", axes: ["dps"] }, effects: [effect("atis-denetleyicisi", "fireRate", 0.2), effect("atis-denetleyicisi", "cooling", 0.4)] }),
  defineItem("direnc-sokucu", "Direnç Sökücü", "Takıldığı kulenin vuruşlarında düşman dirençlerinin %40’ı yok sayılır.", "power", 125, { scope: { kind: "tagged", combat: true }, axes: ["dps"], effects: [effect("direnc-sokucu", "resistancePierce", 0.4)] }),
  defineItem("zaaf-mercegi", "Zaaf Merceği", "Takıldığı kule düşmanın zayıf olduğu hasar tipinden %50 daha çok yararlanır.", "power", 115, { scope: { kind: "tagged", combat: true }, axes: ["dps"], effects: [effect("zaaf-mercegi", "weaknessBonus", 0.5)] }),
  defineItem("asiri-surucu", "Aşırı Sürücü", "Takıldığı kulenin performans kolu yarısı üstündeki ısı ve enerji bedeli -%50.", "power", 130, { axes: ["dps"], effects: [effect("asiri-surucu", "performanceCost", -0.5)] }),
  defineItem("kan-bankasi", "Kan Bankası", `Takıldığı kulenin hasarı +%20 olur; karşılığında her dalga başında takılı her Kan Bankası için ${BLOOD_BANK_NEXUS_COST} nexus canı gider. Nexus canı ${BLOOD_BANK_NEXUS_COST} ya da altındaysa bedel alınmaz ve o dalga bonus işlemez.`, "risk", 75, { scope: { kind: "tagged", combat: true }, unlocks: ["bloodBank"] }),

  // Nisan ve kritik, ikinci tur. Kart karsiliklarinin tek kuleye baglanan
  // halleri; ikisi kapsamla sinirli cunku vaatleri yalnizca nisan alan
  // kulede bir sey yapiyor. Nisan almayan kuleye takilabilseler oyuncu
  // altinini bir hicligin uzerine harcardi -- esya geri sokulemiyor.
  defineItem("jiroskop", "Jiroskop", "Takıldığı kule düşman öldürdükten sonra 2 saniye boyunca dönüş hızı +%150 kazanır; yalnızca nişan alan kulelere takılır.", "class", 85, { scope: { kind: "tagged", aims: true }, unlocks: ["aim:killSnap"] }),
  defineItem("nisan-durbunu", "Nişan Dürbünü", "Takıldığı kulenin öncül nişanı +%60: atışların %60'ı hedefin, mermi ona varana kadar gideceği noktaya ateşlenir; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 120, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("nisan-durbunu", "leadTargeting", 0.6)] }),
  defineItem("iz-okuyucu", "İz Okuyucu", "Takıldığı kulenin işaretli düşmanlara kritik şansı +%20; kendi koyduğu takip işareti sayılmaz.", "power", 110, { scope: { kind: "tagged", combat: true }, axes: ["amplify"], unlocks: ["crit:vsMarked"] }),
  defineItem("mesafe-olcer", "Mesafe Ölçer", "Takıldığı kulede isabet bonusunun her %10'u kritik şansına +%3 ekler; en fazla +%30.", "power", 100, { scope: { kind: "tagged", combat: true }, unlocks: ["crit:fromAccuracy"] }),
  defineItem("atesleme-pimi", "Ateşleme Pimi", "Takıldığı kulenin kritik şansı +%20, ısısı +%10.", "power", 95, { scope: { kind: "tagged", combat: true }, effects: [effect("atesleme-pimi", "critChance", 0.2), effect("atesleme-pimi", "heat", 0.1)] }),
  defineItem("yarik-mermi", "Yarık Mermi", "Takıldığı kulenin kritik hasarı +%125, kritik şansı -%6.", "power", 110, { scope: { kind: "tagged", combat: true }, effects: [effect("yarik-mermi", "critDamage", 1.25), effect("yarik-mermi", "critChance", -0.06)] }),

  // Donus hizi, isabet ve mermi hizi, ucuncu tur. Her eksende dort esya ve
  // ayni sekil: ucuz bir merdiven (dort kez), iki buyuk adim ve bir kosullu ya
  // da karma esya. Donus esyalari bedelli; isabet ve mermi hizi esyalarinin
  // bedelleri dorduncu turda kaldirildi. Hepsi kapsamli, cunku esya geri sokulemiyor:
  // statin is gormedigi kuleye takilabilseler oyuncu altinini bosa harcardi.
  defineItem("bilyali-yatak", "Bilyalı Yatak", "Takıldığı kulenin dönüş hızı +%20; bir kuleye en fazla 4 kez takılır; yalnızca nişan alan kulelere takılır.", "class", 40, { repeatable: true, maxStacks: 4, priceGrowth: 1.25, scope: { kind: "tagged", aims: true }, effects: [effect("bilyali-yatak", "turnRate", 0.2)] }),
  defineItem("hafif-taret-kabugu", "Hafif Taret Kabuğu", "Takıldığı kulenin dönüş hızı +%70, koşucu ve uçan düşmanlara hasarı +%25; yalnızca nişan alan kulelere takılır.", "class", 80, { scope: { kind: "tagged", aims: true }, effects: [effect("hafif-taret-kabugu", "turnRate", 0.7), effect("hafif-taret-kabugu", "damageVsFast", 0.25)] }),
  defineItem("taret-motoru", "Taret Motoru", "Takıldığı kulenin dönüş hızı +%120; hedef değiştirdikten sonraki ilk mermisi +%35 hasar verir; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 110, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("taret-motoru", "turnRate", 1.2), effect("taret-motoru", "retargetDamage", 0.35)] }),
  defineItem("hareket-ongorucu", "Hareket Öngörücü", "Takıldığı kule koşucu ve hava hedeflerine dönerken dönüş hızı +%100 kazanır; yalnızca nişan alan kulelere takılır.", "class", 75, { scope: { kind: "tagged", aims: true }, unlocks: ["aim:fastTargets"] }),

  defineItem("gez-arpacik", "Gez ve Arpacık", "Takıldığı kulenin öncül nişanı +%15: atışların %15'i hedefin, mermi ona varana kadar gideceği noktaya ateşlenir; bir kuleye en fazla 4 kez takılır; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 35, { repeatable: true, maxStacks: 4, priceGrowth: 1.25, scope: { kind: "tagged", alongFacing: true }, effects: [effect("gez-arpacik", "leadTargeting", 0.15)] }),
  defineItem("lazer-telemetre", "Lazer Telemetre", "Takıldığı kulenin menzili +%10, menzilinin dış yarısındaki düşmanlara kritik şansı +%20; menzili haritayı kaplayan kulelere takılmaz.", "class", 110, { scope: { kind: "tagged", combat: true, boundedRange: true }, effects: [effect("lazer-telemetre", "range", 0.1), effect("lazer-telemetre", "farCritChance", 0.2)] }),
  defineItem("termal-kilif", "Termal Kılıf", "Takıldığı kulenin sıcaklığı 40 derecenin altındayken isabeti +%50; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 70, { scope: { kind: "tagged", alongFacing: true }, unlocks: ["aim:coldAccuracy"] }),
  defineItem("hassas-namlu", "Hassas Namlu", "Takıldığı kulenin öncül nişanı +%50 (atışların yarısı hedefin gideceği noktaya), kritik hasarı +%40; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 105, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("hassas-namlu", "leadTargeting", 0.5), effect("hassas-namlu", "critDamage", 0.4)] }),

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
  defineItem("atalet-dengeleyici", "Atalet Dengeleyici", "Takıldığı kulenin mermi hızı +%40, koşucu ve uçan düşmanlara hasarı +%30; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 120, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("atalet-dengeleyici", "projectileSpeed", 0.4), effect("atalet-dengeleyici", "damageVsFast", 0.3)] }),
  defineItem("optik-hedefleyici", "Optik Hedefleyici", "Takıldığı kulenin isabeti +%30, kritik şansı +%8; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 100, { scope: { kind: "tagged", alongFacing: true }, effects: [effect("optik-hedefleyici", "accuracy", 0.3), effect("optik-hedefleyici", "critChance", 0.08)] }),
  defineItem("irtifa-olcer", "İrtifa Ölçer", "Takıldığı kulenin hava hedeflerine isabeti +%60; bir kuleye en fazla 2 kez takılır; yalnızca nişan alan mermi ve çarpma kulelerine takılır.", "class", 65, { repeatable: true, maxStacks: 2, priceGrowth: 1.3, scope: { kind: "tagged", alongFacing: true }, effects: [effect("irtifa-olcer", "accuracyVsAir", 0.6)] }),
  defineItem("tungsten-cekirdek", "Tungsten Çekirdek", "Takıldığı kulenin mermi hızı +%50, kritik hasarı +%20; yalnızca mermi atan kulelere takılır.", "class", 105, { scope: { kind: "tagged", projectiles: true }, effects: [effect("tungsten-cekirdek", "projectileSpeed", 0.5), effect("tungsten-cekirdek", "critDamage", 0.2)] }),
  defineItem("sessiz-mevzi", "Sessiz Mevzi", "Takıldığı kule komşusuzken mermi hızı +%120 kazanır; yalnızca mermi atan kulelere takılır.", "class", 70, { scope: { kind: "tagged", projectiles: true }, effects: [effect("sessiz-mevzi", "projectileSpeedIsolated", 1.2)] }),
  defineItem("gauss-bobini", "Gauss Bobini", "Takıldığı kulenin mermi hızı +%20, menzili +%3; bir kuleye en fazla 3 kez takılır; yalnızca mermi atan kulelere takılır.", "class", 55, { repeatable: true, maxStacks: 3, priceGrowth: 1.3, scope: { kind: "tagged", projectiles: true }, effects: [effect("gauss-bobini", "projectileSpeed", 0.2), effect("gauss-bobini", "range", 0.03)] }),

  // Altin. Bes esya, dort ayri kol: oldurme altini carpani (merdiven),
  // temiz dalga primi, ekonomi binasinin dalga geliri, kritik oldurme primi
  // ve vadeli altin. Dalga basina altin tavani yok (sahibi kaldirdi). Darphane ve Kelle Defteri
  // kuleye takiliyor ve ikisi de kule katmanindan okunuyor (oldurenin
  // kulesi, binanin kendisi); obur ucu oyuncunun.
  defineItem("altin-elek", "Altın Elek", "Düşman altını +%48; en fazla 3 kez alınır.", "utility", 85, { repeatable: true, maxStacks: 3, priceGrowth: 1.5, axes: ["economy"], effects: [effect("altin-elek", "goldGain", 0.48)] }),
  // Prim `INSURANCE_CLEAN_WAVE_GOLD`: Temiz Sicil kartinin primiyle ayni kilit, ayri tutar.
  defineItem("sigorta-policesi", "Sigorta Poliçesi", `Sızıntısız biten her dalga sonunda +${INSURANCE_CLEAN_WAVE_GOLD} altın.`, "utility", 120, { axes: ["economy"], unlocks: ["gold:cleanWave"] }),
  defineItem("darphane-modulu", "Darphane Modülü", "Takıldığı bina dalga sonunda ayaktaysa +80 altın verir; bir binaya en fazla 3 kez takılır; yalnızca ekonomi binalarına takılır.", "utility", 80, { repeatable: true, maxStacks: 3, priceGrowth: 1.3, axes: ["economy"], scope: { kind: "tagged", axes: ["economy"] }, effects: [effect("darphane-modulu", "waveIncome", 80)] }),
  defineItem("kelle-defteri", "Kelle Defteri", "Takıldığı kulenin kritik vuruşla öldürdüğü her düşman +24 altın verir.", "utility", 70, { scope: { kind: "tagged", combat: true }, axes: ["economy"], unlocks: ["gold:critKill"] }),
  defineItem("vadeli-mevduat", "Vadeli Mevduat", "Satın alındıktan sonra 4 dalga tamamlanınca 440 altın öder; en fazla 2 kez alınır; 16. dalgadan sonra çıkmaz.", "utility", 150, { repeatable: true, maxStacks: 2, priceGrowth: 1, axes: ["economy"], deposit: { payout: 440, waves: 4 } }),

  // Altin primleri: belirli bir olaya baglanan duz altin, hepsi bedelsiz ve
  // tavansiz. Oldurme altini carpanindan (Ganimet Kesesi, Altin Elek)
  // ve dalga sonu gelirlerinden (Darphane, Sigorta, Faiz) ayri kollar:
  // sampiyon, ucan dusman, kulenin hasari, toplu oldurme ve tasan hasar.
  // Sampiyon primi oyuncunun (kuresel); otekiler kuleye takiliyor ve
  // oldurenin ya da hasari verenin kulesinden okunuyor -- hangi kuleye
  // takilacagi bir karar.
  defineItem("odul-fermani", "Ödül Fermanı", "Bir şampiyon düşman öldüğünde (kim öldürürse öldürsün) +300 altın.", "utility", 120, { axes: ["economy"], effects: [effect("odul-fermani", "championGold", 300)] }),
  defineItem("dusurme-primi", "Düşürme Primi", "Takıldığı kulenin öldürdüğü her uçan düşman +32 altın verir.", "utility", 75, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("dusurme-primi", "airKillGold", 32)] }),
  // Tecrube esyalari: biri yuzeysel ve oyuncunun (duz carpan), ikisi derin ve
  // kulenin: verdigi hasarin dalga sonu karsiligi, agir hedefin tecrubesi.
  defineItem("egitim-kilavuzu", "Eğitim Kılavuzu", "Tecrübe kazancı +%30; en fazla 3 kez alınır.", "utility", 90, { repeatable: true, maxStacks: 3, priceGrowth: 1.5, axes: ["economy"], effects: [effect("egitim-kilavuzu", "experienceGain", 0.3)] }),
  defineItem("ders-defteri", "Ders Defteri", "Takıldığı kule dalga sonunda o dalga verdiği her 1000 hasar için +10 tecrübe kazandırır.", "utility", 100, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("ders-defteri", "damageExperience", 10)] }),
  defineItem("zor-ders", "Zor Ders", "Takıldığı kulenin öldürdüğü brute, kuşatma, şampiyon ve özel düşmanlardan gelen tecrübe +%100.", "utility", 110, { axes: ["economy"], effects: [effect("zor-ders", "eliteKillExperience", 1)] }),
  defineItem("savas-tazminati", "Savaş Tazminatı", "Takıldığı kule dalga sonunda o dalga verdiği her 1000 hasar için +20 altın kazandırır.", "utility", 90, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("savas-tazminati", "damageGold", 20)] }),
  defineItem("toplu-imha-primi", "Toplu İmha Primi", "Takıldığı kule 2 saniye içinde 3 düşman öldürdüğünde +60 altın verir.", "utility", 85, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("toplu-imha-primi", "multiKillGold", 60)] }),
  defineItem("artik-enerji-toplayici", "Artık Enerji Toplayıcı", "Takıldığı kulenin öldürücü vuruşlarında hedefin canını aşan hasarın %10'u altına dönüşür.", "utility", 70, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("artik-enerji-toplayici", "overkillGold", 0.1)] }),
  // Ikinci tur kule primleri: kulenin sicakligi, hedefin yavasligi, ikmal
  // ve mesafe. Hepsi takildigi kulenin listesinden okunuyor ve kulenin
  // sahibine oduyor; tavan yok.
  defineItem("ates-hatti-primi", "Ateş Hattı Primi", "Takıldığı kule sıcaklığı 50 derece ya da üstündeyken öldürdüğü her düşman için (yanma ve kanamasıyla ölenler dahil) +12 altın verir.", "utility", 70, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("ates-hatti-primi", "hotKillGold", 12)] }),
  defineItem("soguk-av-kaydi", "Soğuk Av Kaydı", "Takıldığı kulenin öldürdüğü her yavaşlamış düşman (yanma ve kanamasıyla ölenler dahil) +12 altın verir.", "utility", 70, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("soguk-av-kaydi", "slowedKillGold", 12)] }),
  defineItem("ikmal-senedi", "İkmal Senedi", "Takıldığı kuleye teslim edilen her 5 mühimmat ya da 15 enerji için +2 altın verir.", "utility", 75, { axes: ["economy"], scope: { kind: "tagged", combat: true }, effects: [effect("ikmal-senedi", "deliveryGold", 2)] }),
  defineItem("uzak-menzil-primi", "Uzak Menzil Primi", "Takıldığı kulenin menzilinin dış dörtte birinde vurarak öldürdüğü her düşman +16 altın verir; menzili haritayı kaplayan kulelere takılmaz.", "utility", 75, { axes: ["economy"], scope: { kind: "tagged", combat: true, boundedRange: true }, effects: [effect("uzak-menzil-primi", "longRangeKillGold", 16)] }),

  // Atis hizi, soguma ve isi, ucuncu tur: kalabaliga, isi kilidine ve
  // hedefin yavasligina baglanan uc esya (sabitler `heat-mechanics`te).
  defineItem("kalabalik-besleyici", "Kalabalık Besleyici", "Takıldığı kulenin atış hızı menzilindeki her düşman için +%6; en fazla 8 düşman (+%48).", "power", 115, { axes: ["dps"], scope: { kind: "tagged", combat: true }, effects: [effect("kalabalik-besleyici", "crowdFireRate", 0.06)] }),
  defineItem("acil-sogutma-pompasi", "Acil Soğutma Pompası", "Takıldığı kule ısı kilidindeyken 3 kat hızlı soğur (soğuma +%200): kilit çok daha kısa sürer.", "utility", 90, { axes: ["dps"], effects: [effect("acil-sogutma-pompasi", "lockCooling", 2)] }),
  defineItem("kriyo-kovan", "Kriyo Kovan", "Takıldığı kulenin yavaşlamış ya da donmuş hedefe attığı atışlar %50 daha az ısı üretir.", "power", 95, { axes: ["dps", "cc"], scope: { kind: "tagged", combat: true }, effects: [effect("kriyo-kovan", "chilledHeatRelief", 0.5)] }),

  // Menzil turu: kulenin taban menziline, dalgadaki oldurmelerine ve
  // bitisikteki destek yapisina baglanan uc esya (sabitler `range-mechanics`te).
  // Teleskopik Namlu duz kare ekliyor: kisa menzilli kulede orani buyuk.
  defineItem("teleskopik-namlu", "Teleskopik Namlu", "Takıldığı kulenin taban menziline +0,25 kare ekler: 1 karelik menzilde +%25, 2,5 karelik menzilde +%10; menzili haritayı kaplayan kulelere takılmaz.", "class", 95, { axes: ["dps"], scope: { kind: "tagged", boundedRange: true }, effects: [effect("teleskopik-namlu", "rangeFlat", 0.25)] }),
  defineItem("atis-haritasi", "Atış Haritası", "Takıldığı kulenin bu dalgada öldürdüğü her düşman menziline +%3 ekler; en fazla 5 öldürme (+%15). Yeni dalgada sıfırlanır; Av Kayıt Defteri ile aynı kuleye takılmaz.", "power", 85, { axes: ["dps"], scope: { kind: "tagged", combat: true, boundedRange: true }, effects: [effect("atis-haritasi", "killRange", 0.03)] }),
  defineItem("gozcu-diregi", "Gözcü Direği", "Takıldığı yapının bitişiğindeki her dost kulenin menzili +%10; bir kule en fazla iki direkten yararlanır (+%20). Ateş etmeyen yapılara da takılır.", "utility", 110, { axes: ["amplify"], effects: [effect("gozcu-diregi", "neighborRange", 0.1)] }),

  // Menzil turu, ikinci kisim. Av Kayit Defteri Atis Haritasi'nin uzun
  // soluklu esi (ayni sayac, birlikte takilmiyorlar). Erim Pompasi ve
  // Kinetik Uzatici menzil ile mermi hizi arasinda iki yonlu cevrim; ayni
  // kulede birlikte takilmiyorlar ve kaynaklari cevrimlerden once okunuyor.
  // Tork Radyatoru donus hizini sogumaya ceviriyor (Tork Aktarimi'nin esi).
  // Uzatma Halkasi ve Uzun Erim Optigi sade menzil: ucuz yiginli ve pahali bedelli.
  defineItem("av-kayit-defteri", "Av Kayıt Defteri", "Takıldığı kulenin menzili -%5; bu dalgada öldürdüğü her düşman menziline +%1,5 ekler, en fazla 16 öldürme (+%24). Yeni dalgada sıfırlanır; Atış Haritası ile aynı kuleye takılmaz.", "power", 130, { axes: ["dps"], scope: { kind: "tagged", combat: true, boundedRange: true }, effects: [effect("av-kayit-defteri", "range", -0.05), effect("av-kayit-defteri", "killRangeLong", 0.015)] }),
  defineItem("erim-pompasi", "Erim Pompası", "Takıldığı kulenin menzili +%8. Menzil bonusunun her %10'u mermi hızına +%15 ekler; en fazla +%60. Yalnızca mermi atan kulelere takılır; Kinetik Uzatıcı ile aynı kuleye takılmaz.", "class", 100, { axes: ["dps"], scope: { kind: "tagged", projectiles: true, boundedRange: true }, effects: [effect("erim-pompasi", "range", 0.08)], conversions: [{ from: "range", to: "projectileSpeed", ratio: 1.5, cap: 0.6 }] }),
  defineItem("kinetik-uzatici", "Kinetik Uzatıcı", "Takıldığı kulenin mermi hızı +%25. Mermi hızı bonusunun her %10'u menzile +%3 ekler; en fazla +%15. Yalnızca mermi atan kulelere takılır; Erim Pompası ile aynı kuleye takılmaz.", "class", 110, { axes: ["dps"], scope: { kind: "tagged", projectiles: true, boundedRange: true }, effects: [effect("kinetik-uzatici", "projectileSpeed", 0.25)], conversions: [{ from: "projectileSpeed", to: "range", ratio: 0.3, cap: 0.15 }] }),
  defineItem("tork-radyatoru", "Tork Radyatörü", "Takıldığı kulenin dönüş hızı +%20. Dönüş hızı bonusunun her %10'u soğumaya +%6 ekler; en fazla +%30. Yalnızca nişan alan ve ısınan kulelere takılır.", "utility", 90, { axes: ["dps"], scope: { kind: "tagged", aims: true }, effects: [effect("tork-radyatoru", "turnRate", 0.2)], conversions: [{ from: "turnRate", to: "cooling", ratio: 0.6, cap: 0.3 }] }),
  defineItem("uzatma-halkasi", "Uzatma Halkası", "Takıldığı kulenin menzili +%6; bir kuleye en fazla 3 kez takılır; menzili haritayı kaplayan kulelere takılmaz.", "class", 45, { axes: ["dps"], repeatable: true, maxStacks: 3, priceGrowth: 1.3, scope: { kind: "tagged", boundedRange: true }, effects: [effect("uzatma-halkasi", "range", 0.06)] }),
  defineItem("uzun-erim-optigi", "Uzun Erim Optiği", "Takıldığı kulenin menzili +%18, atış hızı -%8; menzili haritayı kaplayan kulelere takılmaz.", "class", 120, { axes: ["dps"], scope: { kind: "tagged", boundedRange: true }, effects: [effect("uzun-erim-optigi", "range", 0.18), effect("uzun-erim-optigi", "fireRate", -0.08)] }),

  // Dayaniklilik turu (`durability-mechanics`). Ucu de can esyalari gibi
  // kapsamsiz: her kuleye ve duvara takiliyor, kaynak binasina degil (kaynak
  // binasi yalnizca ekonomi esyasi aliyor). Kiris bitisikteki yapilarin
  // hasarini paylasiyor (duvar hattinda duvardan duvara da), cekirdek hasar
  // almayan yapiyi dalgada yeniliyor, kaplama her vurustan duz puan dusuyor:
  // kalabalik ve kucuk vuruslara karsi guclu, kusatmaya karsi zayif.
  defineItem("yuk-dagitici-kiris", "Yük Dağıtıcı Kiriş", "Takıldığı yapı, bitişiğindeki dost yapıların (kule, duvar, kaynak binası) aldığı hasarın %35'ini kendi üstüne alır; bir vuruşu en fazla bir kiriş paylaşır.", "utility", 110, { axes: ["barricade"], effects: [effect("yuk-dagitici-kiris", "damageShare", 0.35)] }),
  defineItem("oz-onarim-cekirdegi", "Öz Onarım Çekirdeği", "Takıldığı yapı 4 saniye hasar almazsa saniyede azami canının %3'ünü yeniler; yalnızca dalga sırasında.", "utility", 120, { axes: ["barricade"], effects: [effect("oz-onarim-cekirdegi", "idleRegen", 0.03)] }),
  defineItem("percinli-kaplama", "Perçinli Kaplama", "Takıldığı yapının zırhı +4: her vuruştan 4 hasar daha düşülür (vuruş en az 1). Küçük ve sık vuruşlara karşı güçlü, kuşatmaya karşı zayıf.", "class", 75, { axes: ["barricade"], effects: [effect("percinli-kaplama", "armorFlat", 4)] }),

  // Efsanevi: vurus etkileri (`legendary` modulu). Ayni etkinin kartindan
  // iki kat ihtimal, ama yalnizca takildigi kulede; kartla ayni kulede
  // toplaniyor (tavan `LEGENDARY_CHANCE_CAP`). Vitrinde seyrek ve pahali.
  ...legendaryItems()
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
): { ok: true } | { ok: false; reason: EquipShopItemFailure; need?: ShopItemNeed } {
  if (item.target === "global") return { ok: false, reason: "globalItem" };
  // Uyumsuzluk tavandan once: dolu bir kulede de asil sebep "bu esya buraya
  // hic uymaz" ise oyuncu onu duymali.
  const need = getShopItemTowerMismatch(item, tower);
  if (need) return { ok: false, reason: "incompatibleTower", need };
  if (equippedItemIds.length >= MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER) return { ok: false, reason: "towerFull" };
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
/*
 * `buildableTowers`: oyuncunun kurabilecegi yapilar (operatorun kadrosu ve
 * ortak yapilar). Verilirse kule esyasi ancak bunlardan en az birinde is
 * goruyorsa vitrine girer (`isShopItemUsefulOnTower`); oynanabilir
 * operatorlerde hicbir kulede is gormeyen esya hic cikmiyor. Suzgec cekilisten
 * once ve katalog sirasini koruyarak isliyor: ayni zar ayni teklifi verir.
 */
export function drawShopOffers(options: { wave: number; preferredAxes: TowerAxis[]; towers: CardTowerProfile[]; buildableTowers?: readonly CardTowerProfile[]; ownedItemIds: string[]; ownedCardIds?: readonly string[]; marksAvailable?: boolean; excludeItemIds?: readonly string[]; loadout?: ShopItemLoadout; count?: number; random?: () => number }) {
  const random = options.random ?? Math.random;
  const excluded = new Set(options.excludeItemIds ?? []);
  const buildable = options.buildableTowers;
  const pool = shopCatalog.filter((item) => !excluded.has(item.id)
    && isShopItemAvailable(item, options.wave, options.ownedItemIds, options.loadout)
    && (item.target === "global" || !buildable || buildable.some((tower) => isShopItemUsefulOnTower(item, tower))));
  const result: ShopItem[] = [];
  while (result.length < (options.count ?? SHOP_OFFER_COUNT) && pool.length > 0) {
    const weights = pool.map((item) => {
      const axisWeight = item.axes.some((axis) => options.preferredAxes.slice(0, 2).includes(axis)) ? 2 : 1;
      const deadWeight = (item.scope.kind === "tagged" && !options.towers.some((tower) => shopItemAppliesToTower(item, tower)))
        || (options.marksAvailable === false && isMarkOnlyChoice(item))
        || (options.ownedCardIds !== undefined && isShopItemAlreadyUnlocked(item, options.ownedCardIds, options.towers)) ? 0.15 : 1;
      return axisWeight * deadWeight * getShopItemOfferWeight(item);
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
