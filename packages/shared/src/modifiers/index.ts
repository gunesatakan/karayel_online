export type ModifierScope = "player" | "tower";

export type ModifierStat =
  | "damage"
  | "fireRate"
  | "range"
  | "heat"
  | "ammoCost"
  | "energyCost"
  | "shotFuelCost"
  | "operatingEnergyCost"
  | "towerHealth"
  | "critChance"
  | "critDamage"
  | "accuracy"
  | "markAmplification"
  | "goldGain"
  | "towerCapacity"
  | "cooling"
  | "armorBreak"
  | "statusDuration"
  | "statusMagnitude"
  | "ammoEmptyDamage"
  | "turnRate"
  | "projectileSpeed"
  | "resourceProduction"
  | "ammoProduction"
  | "workerGatherSpeed"
  | "workerSpeed"
  /** Iscinin tek seferde tasidigi yuk. */
  | "workerCapacity"
  /**
   * Iscinin cani.
   *
   * Yalnizca oyuncunun kuresel listesinden okunuyor, hizmet ettigi binadan
   * degil: bir iscinin dayanikliligi kendisine ait. Binadan okunsaydi tavani
   * isci her hedef degistirdiginde ziplardi.
   */
  | "workerHealth"
  /**
   * Tamircinin saniyede yazdigi can.
   *
   * Can gibi bu da kuresel listeden okunuyor. Tamircinin "hizmet ettigi
   * bina" her an onardigi kule oldugu icin binadan okumak, carpanin hedef
   * degistikce ziplamasi demek olurdu.
   */
  | "workerRepairRate"
  | "airDamage"
  | "damageVsShielded"
  | "damageVsBrute"
  /**
   * Kalan dusman turlerine karsi hasar.
   *
   * Uzun sure yalnizca brute, kalkanli ve ucan hedefin karsiligi vardi;
   * piyade, kosucu, nisanci ve kusatma hicbir icerikte gecmiyordu. Dordu de
   * ayri stat cunku tehditleri ayri: piyade sayiyla, kosucu hizla, nisanci
   * menzille, kusatma ise duvari yikarak geliyor.
   */
  | "damageVsGrunt"
  | "damageVsRunner"
  | "damageVsShooter"
  | "damageVsSiege"
  /**
   * Seviye atlamayi besleyen tecrube kazanci.
   *
   * Seviye oyunun ana ilerlemesi ve tecrube ondan geciyor, ama tecrube
   * kazanci hicbir icerikle degistirilemiyordu: ne hizlandiran vardi ne de
   * baska bir sey karsiliginda takas eden.
   */
  | "experienceGain"
  /** Onarim bedeli; negatif deger ucuzlatir. Yapiyi ayakta tutmanin fiyati. */
  | "repairCost"
  /** Satis iadesi; kuleyi sokup baskasini kurmanin bedelini degistirir. */
  | "sellRefund"
  /** Isci alim bedeli; negatif deger ucuzlatir. */
  | "workerHireCost"
  /** Ultinin hasar carpani. Sarj hizinin karsiligi vardi, gucun yoktu. */
  | "ultimateDamage"
  /** Magaza yenileme bedeli; negatif deger ucuzlatir. */
  | "shopRerollCost"
  | "targetLockMs"
  /** Ulti sarj hizi carpani. Beceriler ve ulti roguelike katmanina bu iki statla baglanir. */
  | "ultimateCharge"
  /** Beceri bekleme suresi; negatif deger bekleme suresini kisaltir. */
  | "skillCooldown"
  /**
   * Performans kolunun **ust yarisinin** bedeli.
   *
   * Kol yarinin ustunde atis hizini iki katina cikarirken isiyi dorde,
   * enerjiyi uce katliyor. Bu stat yalnizca o fazlaligi olcekliyor: kolu
   * asagida tutan bir kule hicbir sey hissetmiyor, yukari iten kule ise
   * bedeli daha ucuza oduyor. Duz bir `heat` indirimi ayni sey degil --
   * o egrinin seviyesini indirir, bu egrinin **egimini**.
   */
  | "performanceCost"
  /**
   * Dusman direncinin ne kadarinin yok sayilacagi (0-1).
   *
   * Her dusman irkinin bir hasar tipine karsi direnci, bir digerine karsi
   * zaafi var ve dalga ilerledikce irk degisiyor. Oyuncunun elindeki kule
   * dizilimi ise dalga arasinda degistirilemiyor, yani yanlis hasar tipiyle
   * yakalanmak bir karar degil bir kazaydi. Bu stat o kazaya karsi
   * oynanabilir bir cevap veriyor.
   */
  | "resistancePierce"
  /**
   * Zaafin ne kadar buyutulecegi.
   *
   * Delmenin tersi: dogru hasar tipini tutturmus oyuncuyu odullendiriyor.
   * Ikisi bilerek ayri -- biri dalgayi okumayi gereksiz kilar, obru okumayi
   * daha degerli yapar, ve ayni oyunda ikisini birden almak bosa yatirim.
   */
  | "weaknessBonus"
  /**
   * Dalga sonunda kazanilan duz altin.
   *
   * Carpan degil, adet: "+20" her dalga sonunda 20 altin demek. Iki katmandan
   * birden okunuyor -- oyuncunun listesinden (genel kart) ve oyuncunun her
   * kulesinin **kendi** listesinden (binaya takilan esya) -- ve her kaynak bir
   * kez sayiliyor. Kule katmanindan da okundugu icin bir binaya takilan esya
   * bunu vaat edebilir (bkz. shop-item-wiring testi).
   */
  | "waveIncome"
  /**
   * Kosullu nisan statlari: yalnizca kosul tutarken `accuracy` ve
   * `projectileSpeed`e ekleniyor (sunucuda `getTowerConditionalStatAdd`).
   * Kilit yerine stat, cunku sayi tasiyorlar ve yigilabilirler; kilit
   * maskesinde de yer az. Ates konisi, isabetten kritik ve Epik cevrimler
   * kosul tuttugunda bunlari da goruyor.
   *
   * - `accuracyVsAir`: namlu ucan bir dusmana donukken isabet.
   * - `projectileSpeedIsolated`: kule komsusuzken (`isTowerIsolated`, Yalniz
   *   Nisanci ile ayni kural) mermi hizi.
   */
  | "accuracyVsAir"
  | "projectileSpeedIsolated";

export type Modifier = {
  source: string;
  scope: ModifierScope;
  stat: ModifierStat;
  add: number;
};

export type RunModifiers = Modifier[];
export type ModifierCaps = Partial<Record<ModifierStat, number>>;
export type ModifierBreakdown = { base: number; mods: Modifier[] };

export const MAX_TARGETED_CARDS_PER_TOWER = 3;
export const DEFAULT_MODIFIER_CAPS: ModifierCaps = { markAmplification: 1 };

export function getModifierAdd(modifiers: readonly Modifier[], stat: ModifierStat, caps: ModifierCaps = DEFAULT_MODIFIER_CAPS) {
  const total = modifiers.reduce((sum, modifier) => modifier.stat === stat ? sum + modifier.add : sum, 0);
  const cap = caps[stat];
  return cap === undefined ? total : Math.min(cap, total);
}

export function getModifierMultiplier(modifiers: readonly Modifier[], stat: ModifierStat, caps?: ModifierCaps) {
  return Math.max(0, 1 + getModifierAdd(modifiers, stat, caps));
}

export function resolveModifierBreakdown(breakdown: ModifierBreakdown, caps?: ModifierCaps) {
  return breakdown.base * getModifierMultiplier(breakdown.mods, "damage", caps);
}

export function appendLegacyMultiplier(breakdown: ModifierBreakdown, source: string, multiplier: number): ModifierBreakdown {
  if (multiplier === 1) {
    return breakdown;
  }
  const currentMultiplier = getModifierMultiplier(breakdown.mods, "damage", {});
  return {
    ...breakdown,
    mods: [...breakdown.mods, { source, scope: "tower", stat: "damage", add: currentMultiplier * (multiplier - 1) }]
  };
}

/**
 * Bir statin baska bir stata cevrimi: Epik kartlarin dili.
 *
 * "Donus hizin arttikca atis hizin da artar" bir carpan degil, bir okuma:
 * kulenin **gercek** kaynak bonusu (kartlar, esyalar, o anki kosullu paylar)
 * okunuyor ve hedefe bir ek olarak yaziliyor. Uc kural:
 *
 * - Kaynagin yalnizca `threshold` ustu sayilir; isabetin %100 tavani gibi
 *   zaten bosa giden bir payi hedeflemek icin. Yoksa 0, yani eksi bonus
 *   (cezali bir kart) hicbir sey vermez ama bir sey de almaz.
 * - Ek dogrusal: kaynagin her birimi hedefe `ratio` kadar ekler. Metindeki
 *   "her %10'u +%2" 0,2 demek; ara degerler de sayilir (Goz Karari gibi).
 * - `cap` hedefe eklenebilecek en fazla. Cevrim kosmaz: kaynak ne kadar
 *   buyurse buyusun ek orada durur.
 *
 * Cevrimler zincirlenmez: kaynak cevrimlerden once okunuyor. Bir cevrimin
 * hedefi oteki cevrimin kaynagi olsa bile ikincisi birincinin ekledigini
 * gormez (katalog testi bunu ayrica yasakliyor).
 */
export type StatConversion = {
  from: ModifierStat;
  to: ModifierStat;
  threshold?: number;
  ratio: number;
  cap: number;
};

/** Cevrimin hedefe ekledigi pay; kaynak esigin altindaysa 0. */
export function getStatConversionAdd(conversion: StatConversion, sourceAdd: number) {
  const excess = Math.max(0, sourceAdd - (conversion.threshold ?? 0));
  return Math.max(0, Math.min(conversion.cap, excess * conversion.ratio));
}

/**
 * Cevrimleri modifierlara cevirir. `readSource` kaynagin gercek bonusunu
 * veriyor; sunucu orada kart ve esya toplamina o anki kosullu paylari
 * (Av Refleksi'nin penceresi, soguk namlunun isabeti) ekliyor.
 */
export function resolveStatConversions(conversions: ReadonlyArray<StatConversion & { source: string }>, readSource: (stat: ModifierStat) => number): Modifier[] {
  const resolved: Modifier[] = [];
  for (const conversion of conversions) {
    const add = getStatConversionAdd(conversion, readSource(conversion.from));
    if (add > 0) resolved.push({ source: conversion.source, scope: "tower", stat: conversion.to, add });
  }
  return resolved;
}

export function canAcceptTargetedCard(targetedCardIds: readonly string[]) {
  return targetedCardIds.length < MAX_TARGETED_CARDS_PER_TOWER;
}
