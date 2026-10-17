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
   * zaafi var. Irk asama boyunca sabit (`getStageRace`), mac icinde
   * degismiyor: yanlis hasar tipiyle kurulmus bir dizilim butun mac boyunca
   * dirence carpiyor. Bu stat o duruma karsi oynanabilir bir cevap veriyor;
   * direncli asamada tam degerli, otekilerde neredeyse sifir.
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
  | "projectileSpeedIsolated"
  /**
   * Altin primleri: oldurme altininin carpanindan (`goldGain`) ayri, belirli
   * bir olaya baglanan duz altin. Dalga tavani yok (sabitleri
   * `cards` modulunde). Ilki oyuncudan, otekiler oldurenin ya da hasari
   * verenin kulesinden okunuyor.
   *
   * - `championGold`: bir sampiyon dusman oldugunde (kim oldururse oldursun).
   * - `airKillGold`: kulenin oldurdugu her ucan dusman.
   * - `damageGold`: dalga sonunda kulenin o dalga verdigi her 1000 hasar.
   * - `multiKillGold`: kule kisa bir pencerede uc dusman oldurdugunde.
   * - `overkillGold`: oldurucu vurusta canin ustune tasan hasarin payi.
   */
  | "championGold"
  | "airKillGold"
  | "damageGold"
  | "multiKillGold"
  | "overkillGold"
  /**
   * Ikinci tur altin primleri. Ilk dordu oyuncunun listesinden (kartlar),
   * son dordu kulenin listesinden (esyalar) okunuyor; tavan yok.
   *
   * - `garrisonGold`: dalga sonunda ayakta olan her hasar veren kule.
   * - `upgradeGold`: her kule gelistirme.
   * - `heavyKillGold`: oyuncunun oldurdugu her brute ve kusatma dusmani.
   * - `statusKillGold`: oyuncunun yanma ve kanamasiyla olen her dusman.
   * - `hotKillGold`: kule 50 derece ya da ustundeyken oldurdugu her dusman.
   * - `slowedKillGold`: kulenin oldurdugu her yavaslamis dusman.
   * - `deliveryGold`: kuleye yapilan her muhimmat ya da enerji teslimati.
   * - `longRangeKillGold`: kulenin menzilinin dis dortte birinde oldurdugu her dusman.
   */
  | "garrisonGold"
  | "upgradeGold"
  | "heavyKillGold"
  | "statusKillGold"
  | "hotKillGold"
  | "slowedKillGold"
  | "deliveryGold"
  | "longRangeKillGold"
  /**
   * Isi, atis hizi ve nisan, ikinci tur (sabitler `heat-mechanics`te).
   * Olcum kulelerin isiyla sinirli oldugunu ve iskanin ucus suresinden
   * geldigini gosterdi; bu statlar o iki bulguya cevap veriyor. Hepsi kulenin
   * kendi listesinden okunuyor; kilit yerine stat, cunku sayi tasiyorlar ve
   * kilit maskesinde yer az.
   *
   * Nisan ve vurus:
   * - `leadTargeting`: namlu hedefin ucus suresi kadar ilerisine doner (0-1).
   * - `damageVsFast`: kosucu ve ucan hedefe hasar (vurus havuzu).
   * - `retargetDamage`: hedef degistikten sonraki ilk mermiye hasar.
   * - `critSplash`: kritik vurusun bu payi hedefin cevresine patlar.
   * - `farCritChance`: menzilin dis yarisindaki hedefe kritik sansi.
   * - `hitSplash`: her vurusun bu payi en yakin komsu dusmana sicrar.
   * Kontrol kulesi:
   * - `slowBleed`: kulenin yavaslattigi dusman saniyede azami caninin bu
   *   payi kadar kanar.
   * - `slowVulnerability`: kulenin yavaslattigi dusman herkesten bu kadar
   *   fazla hasar alir.
   * Soguma:
   * - `coolingFlat`: carpanlardan sonra eklenen duz derece/sn.
   * - `brakeCooling`: isi freni devredeyken (50 derece ustu) soguma payi.
   * - `ventHeat`: isi freni devreye girdigi atista bir kez atilan derece (bekleme var).
   * - `killCooling`: oldurmeden sonra kisa sure soguma payi.
   * - `neighborCooling`: bitisik dost kulelerin sogumasina eklenen pay.
   * - `heatBleed`: bitisik daha soguk kulelere saniyede aktarilan derece.
   * - `fireRateHeatRelief`: kulenin atis hizi bonusunun bu orani atis isisini
   *   indiriyor (`HEAT_RELIEF_CAP` tavanli).
   * Atis hizi:
   * - `coldFireRate`: kule 50 derecenin altindayken atis hizi.
   * - `trackRhythm`: ayni hedefe art arda atis basina atis hizi ve isi
   *   indirimi (yigin tavani `TRACK_RHYTHM_MAX_STACKS`).
   * - `brakeDamage`: isi freninin kestigi atis hizinin bu payi hasara doner.
   * - `overclock`: fren yerine 50 derece ustunde artan atis hizi (100'de ek).
   * - `coldSalvo`: 0 dereceye inen kulenin isisiz ve iki kat hizli atis sayisi.
   * - `restartShots`: isi freninden cikan kulenin isisiz ve hizli atis sayisi.
   * Isi olaylari:
   * - `heatToDamage`: son atisin isisinin her derecesi kulenin vuruslarina hasar.
   * - `heatShock`: 80 dereceyi gecen kule cevresine vurus hasarinin bu kati.
   */
  | "leadTargeting"
  | "damageVsFast"
  | "retargetDamage"
  | "critSplash"
  | "farCritChance"
  | "hitSplash"
  | "slowBleed"
  | "slowVulnerability"
  | "coolingFlat"
  | "brakeCooling"
  | "ventHeat"
  | "killCooling"
  | "neighborCooling"
  | "heatBleed"
  | "fireRateHeatRelief"
  | "coldFireRate"
  | "trackRhythm"
  | "brakeDamage"
  | "overclock"
  | "coldSalvo"
  | "restartShots"
  | "heatToDamage"
  | "heatShock"
  /**
   * Atis hizi, soguma ve isi, ucuncu tur. Hepsi kulenin listesinden okunuyor.
   *
   * - `woundedFireRate`: kulenin hedefi azami caninin yarisinin altindayken
   *   atis hizi (kart: Av Ritmi).
   * - `idleCooling`: kule 1 oyun saniyesidir vurmuyorken soguma payi (kart:
   *   Rolanti Sogutmasi).
   * - `critVent`: kritik vurus, onu atan atisin isisinin bu payini geri
   *   atiyor (kart: Kritik Tahliye).
   * - `crowdFireRate`: menzildeki her dusman icin atis hizi, tavan
   *   `CROWD_FIRE_RATE_MAX_ENEMIES` dusman (esya: Kalabalik Besleyici).
   * - `lockCooling`: kule isi kilidindeyken soguma payi (esya: Acil Sogutma
   *   Pompasi).
   * - `chilledHeatRelief`: yavaslamis ya da donmus hedefe atisin isisi bu
   *   pay kadar az (esya: Kriyo Kovan).
   */
  | "woundedFireRate"
  | "idleCooling"
  | "critVent"
  | "crowdFireRate"
  | "lockCooling"
  | "chilledHeatRelief"
  /**
   * Efsanevi vurus etkilerinin temas saniyesi basina ihtimali (`legendary`
   * modulu). Kart ve esya ayni stata yaziyor; kulede toplaniyor, tavan
   * `LEGENDARY_CHANCE_CAP`.
   */
  | "chainChance"
  | "blastChance"
  | "freezeChance"
  | "executeChance"
  | "shatterChance"
  | "chronoChance"
  | "linkChance"
  | "gravityChance"
  /**
   * Menzil turu (`range-mechanics` modulu). Hepsi kulenin listesinden
   * okunuyor; kosullu olanlar ayni toplamsal menzil havuzuna giriyor ve
   * toplamlari `RANGE_CONDITIONAL_CAP` ile sinirli.
   *
   * - `focusRange`: kule ayni hedefe ates ettigi her oyun saniyesi bu pay,
   *   tavan `FOCUS_RANGE_MAX` (kart: Kenetlenme).
   * - `heatRange`: 50 derecenin ustunde her 10 derece bir basamak, 100 derecede bu
   *   pay (kart: Termal Mercek).
   * - `wallRange`: kulenin kenarina orulmus her duvar icin bu pay, en fazla
   *   `WALL_RANGE_MAX_WALLS` duvar (kart: Siper Gozcusu).
   * - `rangeFlat`: taban menzile kare cinsinden duz ekleme; yuzdeler onun
   *   ustune isliyor, kosullu tavana girmiyor (esya: Teleskopik Namlu).
   * - `killRange`: kulenin bu dalgadaki her oldurmesi icin bu pay, en fazla
   *   `KILL_RANGE_MAX_KILLS` oldurme (esya: Atis Haritasi).
   * - `neighborRange`: takildigi yapinin bitisigindeki dost kulelere bu pay;
   *   bir kule en fazla `NEIGHBOR_RANGE_MAX` alir (esya: Gozcu Diregi).
   */
  | "focusRange"
  | "heatRange"
  | "wallRange"
  | "rangeFlat"
  | "killRange"
  | "neighborRange"
  /**
   * Menzil turu, ikinci kisim.
   *
   * - `killRangeLong`: `killRange`in uzun soluklu esi; oldurme basina bu pay,
   *   en fazla `KILL_RANGE_LONG_MAX_KILLS` oldurme (esya: Av Kayit Defteri;
   *   Atis Haritasi ile ayni kuleye takilmaz, sayac ortak).
   * - `ambushRange`: bir suredir vurmayan kulenin menzil payi; ilk vurustan
   *   sonra kisa bir sure daha suruyor (kart: Pusu Nobeti).
   */
  | "killRangeLong"
  | "ambushRange"
  /**
   * Dayaniklilik turu (`durability-mechanics` modulu). `towerHealth`in
   * yaninda: hicbiri duz azami can degil.
   *
   * - `veteranHealth`: dalga sonunda ayakta duran yapinin azami canina dalga
   *   basina bu pay, en fazla `VETERAN_HEALTH_MAX_WAVES` dalga; carpan
   *   `towerHealth` toplamindan ayri carpiliyor (kart: Sertlesen Govde).
   * - `woundedDamageReduction`: cani yarinin altindaki yapinin aldigi hasar
   *   bu kadar azaliyor (kart: Inatci Siper).
   * - `lastStand`: dalga basina bir kez oldurucu vurus yapiyi 1 canla
   *   birakiyor; deger, ardindan hasar almadigi oyun saniyesi (kart: Son Nefes).
   * - `damageShare`: takildigi yapi bitisikteki dost yapilarin hasarinin bu
   *   payini ustleniyor (esya: Yuk Dagitici Kiris).
   * - `idleRegen`: hasar almadan `IDLE_REGEN_DELAY_MS` gecen yapi saniyede
   *   azami caninin bu payini yeniliyor, yalnizca dalgada (esya: Oz Onarim
   *   Cekirdegi).
   * - `armorFlat`: yapinin zirhina duz puan; zirh her vurustan dusuluyor
   *   (esya: Percinli Kaplama).
   */
  | "veteranHealth"
  | "woundedDamageReduction"
  | "lastStand"
  | "damageShare"
  | "idleRegen"
  | "armorFlat";

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
