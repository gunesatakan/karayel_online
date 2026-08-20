import type { DamageType, HitType } from "../combat.js";
import type { AmmoType, TowerAttackShape, TowerAxis, TowerDefinition } from "../characters/common/types.js";
import type { TowerGrant } from "../grants/index.js";
import type { Modifier } from "../modifiers/index.js";

export type CardScope =
  | { kind: "global" }
  | { kind: "targeted" }
  | { kind: "tagged"; axes?: TowerAxis[]; hitTypes?: HitType[]; damageTypes?: DamageType[]; shapes?: TowerAttackShape[]; ammoTypes?: AmmoType[] };

/**
 * Katalog buyudukce her kartin ayni sikligta cikmasi oyunu kotulestirir: oyuncu
 * 3 secenek gorurken havuz 46 karta ciktiginda kurulusunu tasiyan guclu kartlari
 * neredeyse hic goremez. Nadirlik, cekilis agirligini belirleyerek "her oyun
 * farkli" ile "hicbir oyunda istedigini bulamiyorsun" arasindaki farki kurar.
 */
/**
 * Duz sayi disindaki odullar: bir davranis acar.
 *
 * Tip burada duruyor cunku hem kartlar hem magaza esyalari ayni kilitleri
 * verebilmeli ve `shop` modulu zaten `cards`'i iceri aliyor; ters yonde bir
 * import dongu yaratirdi.
 */
export type Unlock =
  | "targeting:weakest" | "targeting:closest" | "targeting:last" | "targeting:random"
  | "status:burn" | "status:chill"
  | "canHitAir"
  | "trigger:debrisOnDeath"
  | "stack:kill" | "stack:wave"
  | "adjacencyBonus" | "isolationBonus"
  | "ammoDrop" | "goldInterest" | "nexusShield" | "bloodBank"
  // --- Isi ve enerji ekseni ---
  // Performans kolu zaten atis hizini isi ve enerjiyle takas ediyor: kol 1.0'da
  // atis hizi iki kat, ama isi dort kat ve enerji uc kat. Isi 50'yi gectiginde
  // atis hizi dusmeye baslar, 100'de kule kilitlenir. Bu kilitler o egriyi
  // pazarlik konusu yapar; birbirinin tersine cekmeleri kasitlidir.
  | "heat:runHot" | "heat:coldCrit" | "heat:thermalMass" | "heat:overheatBurst"
  | "energy:backupLine" | "ammo:emptyBleed";

/** Uzerinde gezinilebilir tam liste; snapshot cozumlemesi bunu kullanir. */
export const ALL_UNLOCKS: Unlock[] = [
  "targeting:weakest", "targeting:closest", "targeting:last", "targeting:random",
  "status:burn", "status:chill",
  "canHitAir",
  "trigger:debrisOnDeath",
  "stack:kill", "stack:wave",
  "adjacencyBonus", "isolationBonus",
  "ammoDrop", "goldInterest", "nexusShield", "bloodBank",
  "heat:runHot", "heat:coldCrit", "heat:thermalMass", "heat:overheatBurst",
  "energy:backupLine", "ammo:emptyBleed"
];

/**
 * Kilitler telde bit maskesi olarak tasinir.
 *
 * Kilit listesi kule basina snapshot'in dinamik kismindan gidiyor ve snapshot
 * saniyede birkac kez butun istemcilere yayinlaniyor. Kimlikleri metin dizisi
 * olarak gondermek, dalga sonunda bir kez degisen bir veri icin kule basina
 * onlarca bayti her karede tekrar tekrar tasimak demekti.
 *
 * Sira `ALL_UNLOCKS` tarafindan belirlenir; listenin ortasina ekleme yapmak eski
 * istemcilerle uyumu bozar, o yuzden yeni kilitler sona eklenir.
 */
export const MAX_ENCODABLE_UNLOCKS = 31;

const unlockBitByName = new Map(ALL_UNLOCKS.map((unlock, index) => [unlock, 1 << index]));

export function encodeUnlocks(unlocks: Iterable<Unlock>) {
  let bits = 0;
  for (const unlock of unlocks) bits |= unlockBitByName.get(unlock) ?? 0;
  return bits;
}

export function hasUnlockBit(bits: number | undefined, unlock: Unlock) {
  return ((bits ?? 0) & (unlockBitByName.get(unlock) ?? 0)) !== 0;
}

export function decodeUnlocks(bits: number | undefined) {
  return ALL_UNLOCKS.filter((unlock) => hasUnlockBit(bits, unlock));
}

/** `heat:runHot` acikken sicaklik basina kazanilan hasar orani. */
export const RUN_HOT_DAMAGE_PER_DEGREE = 0.006;
/** `heat:runHot` kulenin kilitlenme esigini bu degere indirir. */
export const RUN_HOT_HEAT_LOCK_THRESHOLD = 80;
/** `heat:coldCrit` bu sicakligin altinda kritik sansi ekler. */
export const COLD_CRIT_TEMPERATURE = 20;
export const COLD_CRIT_CHANCE = 0.25;
/** `energy:backupLine` enerji kesildikten sonra muhimmatla ates edilen sure. */
export const BACKUP_LINE_DURATION_MS = 4000;

export type CardRarity = "common" | "uncommon" | "rare";

export const CARD_RARITY_WEIGHT: Record<CardRarity, number> = {
  common: 6,
  uncommon: 3,
  rare: 1
};

export type CardDefinition = {
  id: string;
  name: string;
  description: string;
  axes: TowerAxis[];
  scope: CardScope;
  stackable: boolean;
  maxStacks?: number;
  /** Belirtilmezse geniş kapsamlı kartlar common, dar kapsamlılar uncommon sayılır. */
  rarity?: CardRarity;
  effects: Modifier[];
  /** Sayı yerine davranış veren kartlar; efekt listesi boş olabilir. */
  unlocks?: Unlock[];
  /**
   * Kulenin motoruna eklenen stack, aura, trigger, durum etkisi veya saldırı
   * geometrisi. Sunucu çözülmüş motoru okuduğu için buraya yazılanlar yeni bir
   * sunucu dalı gerektirmez.
   */
  grants?: TowerGrant;
};

/**
 * Nadirligi yazilmamis kartlar kapsamlarindan turetilir. Genis kapsamli bir kart
 * her kurulusta ise yarar, bu yuzden sik cikmali; dar kapsamli olan ise ancak
 * dogru kuleyle anlamli, bu yuzden daha seyrek ama daha guclu.
 */
export function getCardRarity(card: CardDefinition): CardRarity {
  if (card.rarity) return card.rarity;
  return card.scope.kind === "global" ? "common" : "uncommon";
}

const effect = (source: string, stat: Modifier["stat"], add: number, scope: Modifier["scope"] = "player"): Modifier => ({ source: `card:${source}`, scope, stat, add });

/**
 * Katalog iki yariya ayrilir ve oran kasitlidir.
 *
 * Ust yari sayilari buyuten "temel" kartlardir; bir kurulusu tasirlar ama yon
 * vermezler. Alt yari kulenin ne yaptigini degistirir: motora stack, aura,
 * trigger ya da durum etkisi ekler, veya isi/enerji egrisini pazarlik konusu
 * yapar. Onceki katalogda 57 kartin 46'si ust yariydi; ayni cumlenin 46
 * cesitlemesini gormek derinlik degil seyrelme uretiyordu. Simdi temel kartlar
 * birlestirilip 25'e indi, geri kalani davranis kartlari.
 */
export const cardCatalog: CardDefinition[] = [
  // --- Temel kartlar ---
  // Sayilari buyuturler. Bilerek az ve birbirinden ayrik tutuldular: ayni stata
  // dokunan iki kart varsa oyuncu ikisini de gorunce hicbir sey secmemis olur.
  { id: "namlu-asinmasi", name: "Namlu Aşınması", description: "Hasar +%25, ısı +%20.", axes: ["dps"], scope: { kind: "global" }, stackable: true, rarity: "common", effects: [effect("namlu-asinmasi", "damage", 0.25), effect("namlu-asinmasi", "heat", 0.2)] },
  { id: "kalibre-artisi", name: "Kalibre Artışı", description: "Bir kulenin hasarı +%40, atış hızı -%15.", axes: ["dps"], scope: { kind: "targeted" }, stackable: true, rarity: "common", effects: [effect("kalibre-artisi", "damage", 0.4, "tower"), effect("kalibre-artisi", "fireRate", -0.15, "tower")] },
  { id: "seri-atis", name: "Seri Atış", description: "Bir kulenin atış hızı +%20, yakıt tüketimi +%35.", axes: ["dps"], scope: { kind: "targeted" }, stackable: true, rarity: "common", effects: [effect("seri-atis", "fireRate", 0.2, "tower"), effect("seri-atis", "shotFuelCost", 0.35, "tower")] },
  { id: "sogutma-sistemi", name: "Soğutma Sistemi", description: "Tüm kulelerin soğuması +%50.", axes: ["economy"], scope: { kind: "global" }, stackable: true, rarity: "common", effects: [effect("sogutma-sistemi", "cooling", 0.5)] },
  { id: "kalin-zirh", name: "Kalın Zırh", description: "Tüm kulelerin canı +%80.", axes: ["barricade"], scope: { kind: "global" }, stackable: true, rarity: "common", effects: [effect("kalin-zirh", "towerHealth", 0.8)] },
  { id: "keskin-goz", name: "Keskin Göz", description: "Tüm kulelerin kritik şansı +%8.", axes: ["dps"], scope: { kind: "global" }, stackable: true, maxStacks: 3, rarity: "common", effects: [effect("keskin-goz", "critChance", 0.08)] },
  // Isabet, donus hizi ve mermi hizi ayri ayri birer kart olduklarinda hicbiri
  // tek basina secilmeye deger degildi; namlu bakimi tek kartta toplandi.
  { id: "nisan-takimi", name: "Nişan Takımı", description: "Tüm kulelerin isabeti +%15, dönüş hızı +%20, mermi hızı +%25.", axes: ["dps"], scope: { kind: "global" }, stackable: true, maxStacks: 2, rarity: "common", effects: [effect("nisan-takimi", "accuracy", 0.15), effect("nisan-takimi", "turnRate", 0.2), effect("nisan-takimi", "projectileSpeed", 0.25)] },
  { id: "verimli-namlu", name: "Verimli Yakıt", description: "Tüm kulelerin atış yakıtı tüketimi -%30.", axes: ["economy"], scope: { kind: "global" }, stackable: false, rarity: "common", effects: [effect("verimli-namlu", "shotFuelCost", -0.3)] },
  { id: "uyku-modu", name: "Uyku Modu", description: "Kulelerin çalışma enerjisi tüketimi -%40.", axes: ["economy"], scope: { kind: "global" }, stackable: false, effects: [effect("uyku-modu", "operatingEnergyCost", -0.4)] },
  { id: "ganimet-payi", name: "Ganimet Payı", description: "Düşman altını +%15.", axes: ["economy"], scope: { kind: "global" }, stackable: true, maxStacks: 3, effects: [effect("ganimet-payi", "goldGain", 0.15)] },
  { id: "zalim-darbe", name: "Zalim Darbe", description: "Kritik hasarı +%60, atış hızı -%10.", axes: ["dps"], scope: { kind: "global" }, stackable: true, maxStacks: 2, effects: [effect("zalim-darbe", "critDamage", 0.6), effect("zalim-darbe", "fireRate", -0.1)] },
  { id: "gokyuzu-avcisi", name: "Gökyüzü Avcısı", description: "Hava hedeflerine hasar +%35.", axes: ["dps"], scope: { kind: "global" }, stackable: true, maxStacks: 2, effects: [effect("gokyuzu-avcisi", "airDamage", 0.35)] },
  { id: "zayif-nokta", name: "Zayıf Nokta", description: "Kalkanlı ve brute düşmanlara hasar +%30.", axes: ["dps"], scope: { kind: "global" }, stackable: true, maxStacks: 2, effects: [effect("zayif-nokta", "damageVsShielded", 0.3), effect("zayif-nokta", "damageVsBrute", 0.3)] },
  { id: "isaretleme-agi", name: "İşaretleme Ağı", description: "İşaretli düşmana hasar +%15, tavan +%100.", axes: ["amplify"], scope: { kind: "global" }, stackable: true, effects: [effect("isaretleme-agi", "markAmplification", 0.15)] },
  { id: "yanki", name: "Yankı", description: "Kontrol kulelerinde yavaşlatma süresi +%60, gücü -%25.", axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, stackable: false, effects: [effect("yanki", "statusDuration", 0.6), effect("yanki", "statusMagnitude", -0.25)] },
  { id: "zirh-kirma", name: "Zırh Kırma", description: "Büyütme kuleleri vuruşta 3 zırh azaltır.", axes: ["amplify"], scope: { kind: "tagged", axes: ["amplify"] }, stackable: false, effects: [effect("zirh-kirma", "armorBreak", 3)] },
  { id: "takinti", name: "Takıntı", description: "Bir kule hedefini 3 saniye daha uzun korur ama menzili -%12 olur.", axes: ["dps"], scope: { kind: "targeted" }, stackable: false, effects: [effect("takinti", "targetLockMs", 3000, "tower"), effect("takinti", "range", -0.12, "tower")] },
  { id: "son-atis", name: "Son Atış", description: "Mühimmatı biten kulenin son atışı 3x hasar verir.", axes: ["dps"], scope: { kind: "targeted" }, stackable: false, rarity: "rare", effects: [effect("son-atis", "ammoEmptyDamage", 2, "tower")] },
  { id: "kanli-kazanc", name: "Kanlı Kazanç", description: "Düşman altını +%35 ama tüm kulelerin canı -%20.", axes: ["economy"], scope: { kind: "global" }, stackable: false, rarity: "rare", effects: [effect("kanli-kazanc", "goldGain", 0.35), effect("kanli-kazanc", "towerHealth", -0.2)] },
  { id: "ek-yuva-plani", name: "Ek Yuva Planı", description: "Kule kapasitesi +1.", axes: ["economy"], scope: { kind: "global" }, stackable: false, rarity: "rare", effects: [effect("ek-yuva-plani", "towerCapacity", 1)] },

  // --- Kimlik kartlari ---
  // Dar kapsamli ama guclu: dogru kuleyi kurmus oyuncuyu odullendirirler.
  { id: "hat-kalibresi", name: "Hat Kalibresi", description: "Hat saldıran kulelerin hasarı +%50.", axes: ["dps"], scope: { kind: "tagged", shapes: ["line"] }, stackable: false, rarity: "rare", effects: [effect("hat-kalibresi", "damage", 0.5)] },
  { id: "isin-odagi", name: "Işın Odağı", description: "Işın kulelerinin hasarı +%50, soğuması -%20.", axes: ["dps"], scope: { kind: "tagged", shapes: ["beam"] }, stackable: false, rarity: "rare", effects: [effect("isin-odagi", "damage", 0.5), effect("isin-odagi", "cooling", -0.2)] },
  { id: "yanici-karisim", name: "Yanıcı Karışım", description: "Ateş kulelerinin hasarı +%45.", axes: ["dps"], scope: { kind: "tagged", damageTypes: ["fire"] }, stackable: false, effects: [effect("yanici-karisim", "damage", 0.45)] },
  { id: "iletken-cekirdek", name: "İletken Çekirdek", description: "Elektrik kulelerinin hasarı +%45.", axes: ["dps"], scope: { kind: "tagged", damageTypes: ["electric"] }, stackable: false, effects: [effect("iletken-cekirdek", "damage", 0.45)] },
  { id: "prizma-kesiti", name: "Prizma Kesiti", description: "Işık kulelerinin hasarı +%45.", axes: ["dps"], scope: { kind: "tagged", damageTypes: ["light"] }, stackable: false, effects: [effect("prizma-kesiti", "damage", 0.45)] },
  { id: "zihin-baskisi", name: "Zihin Baskısı", description: "Psişik kulelerin durum etkisi süresi +%50.", axes: ["cc"], scope: { kind: "tagged", damageTypes: ["psychic"] }, stackable: false, effects: [effect("zihin-baskisi", "statusDuration", 0.5)] },
  { id: "kristal-ekonomisi", name: "Kristal Ekonomisi", description: "Güç kristali yakan kulelerin atış enerjisi -%60.", axes: ["economy"], scope: { kind: "tagged", ammoTypes: ["powerCrystal"] }, stackable: false, rarity: "rare", effects: [effect("kristal-ekonomisi", "energyCost", -0.6)] },
  { id: "kursun-fabrikasi", name: "Kurşun Fabrikası", description: "Kurşun kullanan kulelerin mühimmat tüketimi -%50.", axes: ["economy"], scope: { kind: "tagged", ammoTypes: ["bullet"] }, stackable: false, rarity: "rare", effects: [effect("kursun-fabrikasi", "ammoCost", -0.5)] },
  { id: "agir-carpma", name: "Ağır Çarpma", description: "Çarpma kulelerinin hasarı +%40, dönüş hızı -%15.", axes: ["dps"], scope: { kind: "tagged", hitTypes: ["impact"] }, stackable: false, effects: [effect("agir-carpma", "damage", 0.4), effect("agir-carpma", "turnRate", -0.15)] },

  // --- Isi ve enerji ekseni ---
  // Performans kolu zaten atis hizini isi ve enerjiyle takas ediyor ama hicbir
  // kart o kola dokunmuyordu. Bu alti kart egrinin sartlarini degistirir;
  // ilk ikisi kasten birbirinin tersidir, ayni oyunda ikisini birden almak
  // kotu bir karardir.
  { id: "kizgin-namlu", name: "Kızgın Namlu", description: "Her sıcaklık derecesi için hasar +%0,6 ama kule 80 derecede kilitlenir.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "rare", effects: [], unlocks: ["heat:runHot"] },
  { id: "soguk-celik", name: "Soğuk Çelik", description: "Sıcaklığı 20'nin altındaki kulelerin kritik şansı +%25.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "rare", effects: [], unlocks: ["heat:coldCrit"] },
  { id: "termal-kutle", name: "Termal Kütle", description: "50 derece üstünde atış hızı düşmez ama soğuma -%60.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "rare", effects: [effect("termal-kutle", "cooling", -0.6)], unlocks: ["heat:thermalMass"] },
  { id: "asiri-isinma-patlamasi", name: "Aşırı Isınma Patlaması", description: "Kilitlenen kule çevresindeki düşmanlara 40 hasar verir.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["heat:overheatBurst"] },
  { id: "yedek-hat", name: "Yedek Hat", description: "Enerjisi biten kule 4 saniye boyunca mühimmatla ateş etmeyi sürdürür.", axes: ["economy"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["energy:backupLine"] },
  { id: "bosalan-sarjor", name: "Boşalan Şarjör", description: "Mühimmatı biten kule menzilindeki düşmanları 5 saniye kanatır.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["ammo:emptyBleed"] },

  // --- Motor kartlari ---
  // Kulenin motoruna dogrudan stack, durum etkisi, trigger veya saldiri
  // geometrisi ekler. Sunucuda karsilik gelen ozel bir dal yoktur.
  { id: "sabir", name: "Sabır", description: "Aynı hedefe her vuruşta hasar +%6; hedef değişince sıfırlanır.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], grants: { stacks: [{ id: "card-sabir", trigger: "sameTarget", stat: "damage", perStack: 0.06, max: 10, resetOn: "targetChange" }] } },
  { id: "isinma-turu", name: "Isınma Turu", description: "Kesintisiz ateş edilen her saniye atış hızı +%3; hedefsiz kalınca sıfırlanır.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], grants: { stacks: [{ id: "card-isinma-turu", trigger: "activeSecond", stat: "fireRate", perStack: 0.03, max: 10, resetOn: "noTarget" }] } },
  { id: "zincirleme-buz", name: "Zincirleme Buz", description: "Tüm kulelerin vuruşları 2 saniye %15 yavaşlatır.", axes: ["cc"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], grants: { statusEffects: [{ type: "chill", magnitude: 0.15, durationMs: 2000, stacking: "refresh" }] } },
  { id: "kanatan-namlu", name: "Kanatan Namlu", description: "Tüm kulelerin vuruşları 3 saniye boyunca saniyede %1 kanatır.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], grants: { statusEffects: [{ type: "bleed", magnitude: 0.01, durationMs: 3000, stacking: "refresh" }] } },
  { id: "delici-cekirdek-plani", name: "Delici Çekirdek", description: "Tek hedef ve hat saldıran kuleler 1 düşman daha deler.", axes: ["dps"], scope: { kind: "tagged", shapes: ["single", "line"] }, stackable: false, rarity: "rare", effects: [], grants: { attack: { pierceCount: 1 } } },
  { id: "ikinci-bicak", name: "İkinci Bıçak", description: "Yörünge kulelerine 1 bıçak ekler, yakıt tüketimi +%40.", axes: ["dps"], scope: { kind: "tagged", shapes: ["orbit"] }, stackable: false, rarity: "rare", effects: [effect("ikinci-bicak", "shotFuelCost", 0.4)], grants: { attack: { bladeCount: 1 } } },
  { id: "genis-koni", name: "Geniş Koni", description: "Koni saldıran kulelerin açısı %50 artar, hasarı -%20 olur.", axes: ["cc"], scope: { kind: "tagged", shapes: ["cone"] }, stackable: false, rarity: "uncommon", effects: [effect("genis-koni", "damage", -0.2)], grants: { attack: { angleMultiplier: 1.5 } } },
  { id: "genis-halka", name: "Geniş Halka", description: "Halka saldıran kulelerin yarıçapı %35 artar, hasarı -%15 olur.", axes: ["dps"], scope: { kind: "tagged", shapes: ["circle"] }, stackable: false, rarity: "uncommon", effects: [effect("genis-halka", "damage", -0.15)], grants: { attack: { radiusMultiplier: 1.35 } } },
  { id: "ofke-nobeti", name: "Öfke Nöbeti", description: "Menzilinden düşman kaçan kule 8 saniye +%80 hasar verir.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], grants: { triggers: [{ event: "escape", effect: "surge", cooldownMs: 6000 }] } },

  // --- Beceri ve ulti ---
  // Karakterin aktif yetenekleri roguelike katmaniyla ilk kez burada kesisiyor.
  { id: "sarj-devresi", name: "Şarj Devresi", description: "Ulti şarj hızı +%25.", axes: ["amplify"], scope: { kind: "global" }, stackable: true, maxStacks: 2, rarity: "uncommon", effects: [effect("sarj-devresi", "ultimateCharge", 0.25)] },
  { id: "kisa-devre", name: "Kısa Devre", description: "Beceri bekleme süreleri -%20.", axes: ["amplify"], scope: { kind: "global" }, stackable: true, maxStacks: 2, rarity: "uncommon", effects: [effect("kisa-devre", "skillCooldown", -0.2)] },

  // --- Davranis kartlari ---
  // Bunlar sayi buyutmez, kulenin ne yaptigini degistirir. Kurulusun yonunu
  // belirledikleri icin nadirdirler ve cogu tek kuleye baglanir.
  { id: "hava-savunma-kiti", name: "Hava Savunma Kiti", description: "Bir kule hava hedeflerini vurabilir hale gelir ama hava hasarı %40 azalır.", axes: ["dps"], scope: { kind: "targeted" }, stackable: false, rarity: "rare", effects: [effect("hava-savunma-kiti", "airDamage", -0.4, "tower")], unlocks: ["canHitAir"] },
  { id: "atesleyici", name: "Ateşleyici", description: "Ateş kuleleri 4 saniye boyunca saniyede %1,5 yakar.", axes: ["dps"], scope: { kind: "tagged", damageTypes: ["fire"] }, stackable: false, rarity: "rare", effects: [], unlocks: ["status:burn"] },
  { id: "buzlu-namlu", name: "Buzlu Namlu", description: "Yavaşlatılmış hedefler kontrol kulelerinden %20 fazla hasar alır.", axes: ["cc"], scope: { kind: "tagged", axes: ["cc"] }, stackable: false, rarity: "rare", effects: [], unlocks: ["status:chill"] },
  { id: "zafer-sarhoslugu", name: "Zafer Sarhoşluğu", description: "Öldürme başına +%3 hasar; dalga içi tavan %45.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "rare", effects: [], unlocks: ["stack:kill"] },
  { id: "kidem-nisani", name: "Kıdem Nişanı", description: "Tamamlanan her dalga için kalıcı hasar +%2.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "rare", effects: [], unlocks: ["stack:wave"] },
  { id: "suru-taktigi", name: "Sürü Taktiği", description: "Bitişik her kule çifti +%8 hasar verir; en fazla 4 çift.", axes: ["amplify"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["adjacencyBonus"] },
  { id: "yalniz-nisanci", name: "Yalnız Nişancı", description: "Komşusuz kuleler +%25 hasar ve +%15 menzil kazanır.", axes: ["amplify"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["isolationBonus"] },
  { id: "yagmaci", name: "Yağmacı", description: "Düşmanlar %20 ihtimalle 4 mühimmat düşürür.", axes: ["economy"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["ammoDrop"] },
  { id: "enkaz-tuzagi", name: "Enkaz Tuzağı", description: "Yıkılan kule 12 saniyelik yavaşlatıcı enkaz bırakır.", axes: ["barricade"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["trigger:debrisOnDeath"] },
  { id: "avci-egitimi", name: "Avcı Eğitimi", description: "En zayıf ve rastgele olmak üzere 2 hedefleme modu açar.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["targeting:weakest", "targeting:random"] },
  { id: "nobet-egitimi", name: "Nöbet Eğitimi", description: "En yakın ve son olmak üzere 2 hedefleme modu açar.", axes: ["dps"], scope: { kind: "global" }, stackable: false, rarity: "uncommon", effects: [], unlocks: ["targeting:closest", "targeting:last"] }
];

const cardsById = new Map(cardCatalog.map((card) => [card.id, card]));

/** Kimlikten kart. Katalog buyudugu ve cozumleme sicak yolda oldugu icin lineer arama degil. */
export function getCardDefinition(cardId: string) {
  return cardsById.get(cardId);
}

export type CardTowerProfile = Pick<TowerDefinition, "axes" | "hitType" | "damageType" | "resourceProvider"> & { engine?: TowerDefinition["engine"] };

export function cardAppliesToTower(card: CardDefinition, tower: CardTowerProfile) {
  if (tower.resourceProvider) return false;
  if (card.scope.kind !== "tagged") return true;
  const { axes, hitTypes, damageTypes, shapes, ammoTypes } = card.scope;
  return (!axes?.length || axes.some((axis) => tower.axes?.includes(axis)))
    && (!hitTypes?.length || (!!tower.hitType && hitTypes.includes(tower.hitType)))
    && (!damageTypes?.length || (!!tower.damageType && damageTypes.includes(tower.damageType)))
    && (!shapes?.length || (!!tower.engine?.attack.shape && shapes.includes(tower.engine.attack.shape)))
    && (!ammoTypes?.length || (!!tower.engine?.resources.ammoType && ammoTypes.includes(tower.engine.resources.ammoType)));
}

export function drawCards(options: { count?: number; preferredAxes: TowerAxis[]; towers: CardTowerProfile[]; ownedCardIds: string[]; random?: () => number }) {
  const count = options.count ?? 3;
  const random = options.random ?? Math.random;
  const ownedCounts = new Map<string, number>();
  for (const id of options.ownedCardIds) ownedCounts.set(id, (ownedCounts.get(id) ?? 0) + 1);
  const pool = cardCatalog.filter((card) => card.stackable ? (ownedCounts.get(card.id) ?? 0) < (card.maxStacks ?? Infinity) : !ownedCounts.has(card.id));
  const result: CardDefinition[] = [];
  while (result.length < count && pool.length > 0) {
    const weights = pool.map((card) => {
      const axisWeight = card.axes.some((axis) => options.preferredAxes.slice(0, 2).includes(axis)) ? 2 : 1;
      const deadWeight = card.scope.kind === "tagged" && !options.towers.some((tower) => cardAppliesToTower(card, tower)) ? 0.15 : 1;
      return axisWeight * deadWeight * CARD_RARITY_WEIGHT[getCardRarity(card)];
    });
    let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
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
