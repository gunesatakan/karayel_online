/**
 * Efsanevi vurus etkileri: sekiz etki, her biri bir kart ve bir esya.
 *
 * Sahibin kurali: etkiler garanti degil ihtimal, ve ihtimal **vurus basina
 * degil, kulenin o dusmanla gecirdigi sure basina** sayiliyor. Kule ile
 * dusman temastayken her tam oyun saniyesinde zar atiliyor; zar tutarsa etki
 * o cift icin "kurulur" ve kulenin o dusmana bir sonraki vurusunda uygulanir.
 * Boylece hizli ve yavas ates eden kule saniye basina ayni sikta tetikliyor.
 *
 * **Temas (engaged)** tanimi: kule dusmana dogrudan vurdugu surece temasta.
 * Temas saati vuruslarla ilerliyor: kulenin ayni dusmana iki vurusu arasindaki
 * sure, kulenin surekli tetik araliginin `ENGAGE_GAP_INTERVAL_FACTOR` katini
 * (en az `ENGAGE_MIN_GAP_MS`) gecmiyorsa temas suresine ekleniyor; geciyorsa
 * temas kopmus sayiliyor ve saat sifirdan basliyor (kule baska hedefe donmus,
 * ates kesmis ya da isi kilidinde). Ilk vurus saati baslatiyor, sure eklemiyor.
 * Zar saatin her tam saniyesinde atiliyor; o arada tutan zar, araligi kapatan
 * vurusta -- zarin tuttugu andan sonraki ilk vurusta -- uygulaniyor.
 *
 * Saat ve kurulu haklar dusmanin uzerinde, kule basina bir kayitta duruyor
 * (`LegendaryPairState`): dusman olunce kendiliginden siliniyor. Kayit yalnizca
 * efsanevi bir ihtimali olan kule icin aciliyor, yani maclarin cogunda hic
 * tahsis yok.
 *
 * Dogrudan vurus: kulenin kendi vurusu ve vurusunun alan hasari. Sicrama
 * (Ek Bicak Yuvasi, Infilak Basligi), durum tikleri ve efsanevi etkilerin
 * kendi hasari temas saymiyor ve yeniden tetiklemiyor.
 *
 * **Kart ve esya:** ayni etkinin karti tum hasar veren kulelere dusuk bir
 * ihtimal (`LEGENDARY_CARD_CHANCE`), esyasi takildigi kuleye iki katini
 * (`LEGENDARY_ITEM_CHANCE`) veriyor. Ikisi ayni kulede toplaniyor, tavan
 * `LEGENDARY_CHANCE_CAP`. Etkinin buyuklugu ikisinde ayni: kartla esya
 * arasindaki fark siklik ve kapsam.
 *
 * Hasar veren etkilerin olcusu **kule saniyesi**: kulenin taban vurus
 * hasarinin saniyelik karsiligi (vurus hasari x isinin izin verdigi surekli
 * tetik hizi; isi baglamayan kulede tanimli hiz). Vurus basina hasar olcu
 * olsaydi yavas ve buyuk vuran kule ayni ihtimalle cok daha buyuk patlama
 * alirdi. Temasin kopma payindaki "kulenin araligi" da bu surekli hizin
 * araligi: isi freninde yavaslayan kule hedefle temasini kaybetmiyor; isi
 * kilidinde (hic ates yok) ise kaybediyor.
 */

export type LegendaryEffect = "chain" | "blast" | "freeze" | "execute" | "shatter" | "chrono" | "link" | "gravity";

/** Sira tel ve dizi sirasi: yeni etki sona eklenir. */
export const LEGENDARY_EFFECTS: readonly LegendaryEffect[] = ["chain", "blast", "freeze", "execute", "shatter", "chrono", "link", "gravity"];

/** Her etkinin saniyelik ihtimal stati (`ModifierStat`). */
export const LEGENDARY_CHANCE_STATS = {
  chain: "chainChance",
  blast: "blastChance",
  freeze: "freezeChance",
  execute: "executeChance",
  shatter: "shatterChance",
  chrono: "chronoChance",
  link: "linkChance",
  gravity: "gravityChance"
} as const satisfies Record<LegendaryEffect, string>;

export type LegendaryChanceStat = typeof LEGENDARY_CHANCE_STATS[LegendaryEffect];

/** Kartin ve esyanin temas saniyesi basina ihtimali; ikisi toplaniyor, tavanli. */
/*
 * Ilk ayarda (0,1 / 0,2 / 0,3) isiyla sinirli kuleler dakikada 1-3 kez
 * tetikliyordu: dusman cogu zaman kurulu hak uygulanmadan oluyordu. Sahibin
 * "gercekten hissedilir" istegiyle ihtimal yukseldi, buyuklukler bir miktar
 * indi; beklenen guc oncekiyle ayni ya da biraz ustunde.
 */
export const LEGENDARY_CARD_CHANCE = 0.2;
export const LEGENDARY_ITEM_CHANCE = 0.35;
export const LEGENDARY_CHANCE_CAP = 0.5;

/** Zarin atildigi temas araligi (oyun ms). */
export const LEGENDARY_ROLL_INTERVAL_MS = 1000;
/** Iki vurus arasi temasin kopmadigi en kisa pay (oyun ms) ve kulenin araligina gore katsayi. */
export const ENGAGE_MIN_GAP_MS = 1500;
export const ENGAGE_GAP_INTERVAL_FACTOR = 1.5;
/**
 * Bir ciftte ayni etkiden birikebilecek kurulu hak. Yavas kule bir araliga
 * iki zar sigdirabiliyor; ikinci hak bir sonraki vurusta kullaniliyor ki
 * saniye basina siklik hizli kuleyle ayni kalsin.
 */
export const LEGENDARY_MAX_ARMED = 2;
/**
 * Ayni kulenin ayni etkiyi iki kez uygulamasi arasindaki en kisa sure (oyun
 * ms). Tek hedefli kulede hic devreye girmiyor (saniyede en fazla bir zar);
 * alana vuran kulede (aura, koni, patlama) her dusman ayri bir cift oldugu
 * icin ekranin ve hasarin tasmasini kesiyor. Bekleyen hak kaybolmuyor.
 */
export const LEGENDARY_TOWER_TRIGGER_GAP_MS = 400;

// --- Etkilerin buyuklukleri ---

/** Zincirleme Simsek: vurus en fazla bu kadar dusmana sicrar, her biri kule saniyesinin bu payini alir. */
export const CHAIN_JUMPS = 3;
export const CHAIN_DAMAGE_SECONDS = 0.65;
/** Bir sicramanin en uzak mesafesi, izgara karesi. */
export const CHAIN_RANGE_CELLS = 2.5;

/** Vurusta Patlama: hedefin cevresi, kule saniyesinin bu kati. Kritik atmiyor. */
export const BLAST_RADIUS_CELLS = 1.6;
export const BLAST_DAMAGE_SECONDS = 1;

/**
 * Dondurma: sahibin istegiyle cok kisa. Sampiyonda daha kisa; bir dusman
 * dondurulduktan sonra bu etkiyle `FREEZE_IMMUNITY_MS` boyunca yeniden
 * donmuyor, yani zincirleme kilit kurulamiyor. Donmus dusmani dondurmuyor.
 */
export const FREEZE_DURATION_MS = 400;
export const FREEZE_CHAMPION_DURATION_MS = 150;
export const FREEZE_IMMUNITY_MS = 3000;

/**
 * Infaz: kurulu hak, dusmanin cani esigin altina indigi ilk vuruste onu
 * bitiriyor; esigin ustundeki vuruslarda hak bekliyor (dusman olene ya da
 * baska kaynaktan olene kadar). Sampiyonda esik daha dusuk. Infaz
 * bagisikligi olan dusman (`isExecuteImmune`: brute, sampiyon, avci) bu
 * etkiyle hic infaz edilmiyor; sampiyon esigi Atakan'in bagisikligi
 * kaldirilirsa diye duruyor.
 */
export const EXECUTE_THRESHOLD = 0.15;
export const EXECUTE_CHAMPION_THRESHOLD = 0.06;

/**
 * Olum Parcalanmasi: vurus dusmana `SHATTER_FRACTURE_MS` suren bir catlak
 * birakiyor. Catlakliyken (kim oldururse oldursun) olen dusman parcalaniyor:
 * cevresindekilere azami caninin bu payi kadar sarapnel. Sarapnelin oldurdugu
 * dusman da parcalaniyor (zincir), her halkada hasar `SHATTER_CHAIN_FALLOFF`
 * katina iniyor; en fazla `SHATTER_MAX_DEPTH` halka. Sampiyonun parcalanmasi
 * daha kucuk pay.
 */
export const SHATTER_FRACTURE_MS = 3000;
export const SHATTER_RADIUS_CELLS = 1.75;
export const SHATTER_MAX_HP_RATIO = 0.14;
export const SHATTER_CHAMPION_MAX_HP_RATIO = 0.06;
export const SHATTER_CHAIN_FALLOFF = 0.6;
export const SHATTER_MAX_DEPTH = 2;

/**
 * Kronal Iz: iz `CHRONO_SCAR_MS` suruyor; bitince dusman o sure icinde
 * (her kaynaktan) aldigi hasarin bu payini bir kez daha aliyor. Iz suren
 * dusmana yeni iz konmuyor.
 */
export const CHRONO_SCAR_MS = 3000;
export const CHRONO_PAYBACK_RATIO = 0.3;

/**
 * Hasar Bagi: hedef en yakin dusmana (`LINK_RANGE_CELLS` icinde) bagli;
 * ikisinden birinin aldigi hasarin bu payi otekine de geciyor. Gecen hasar
 * yeniden gecmiyor (sonsuz dongu yok). Bagli dusman yeniden baglanmiyor.
 */
export const LINK_DURATION_MS = 4000;
export const LINK_SHARE = 0.35;
export const LINK_RANGE_CELLS = 3;

/**
 * Kutle Cekim Capasi: hedef bir sure cekim noktasi; cevresindeki dusmanlar
 * ona dogru yavasca cekiliyor (hasarsiz). Cekim yuruyus modeline uyuyor:
 * kara dusmani yalnizca bulundugu kare icinde ya da yurunebilir bir komsu
 * kareye kayiyor (gezinmesi o zaman yeniden basliyor); yapiya kilitli,
 * hedeflenemez ve sampiyon dusman cekilmiyor.
 */
export const GRAVITY_DURATION_MS = 2000;
export const GRAVITY_RADIUS_CELLS = 2.5;
/** Cekim hizi, izgara karesi / oyun saniyesi. */
export const GRAVITY_PULL_CELLS_PER_SECOND = 1;
/** Capaya bu kadar yaklasan dusman daha fazla cekilmiyor (ust uste binmesin). */
export const GRAVITY_HOLD_CELLS = 0.35;

/** Kule ile dusman arasindaki temas kaydi. */
export type LegendaryPairState = {
  /** Son dogrudan vurus (duvar saati ms). */
  lastAt: number;
  /** Henuz zar atilmamis temas suresi (oyun ms). */
  carryMs: number;
  /** Etki basina kurulu hak (`LEGENDARY_EFFECTS` sirasiyla). */
  armed: number[];
};

export function createLegendaryPairState(now: number): LegendaryPairState {
  return { lastAt: now, carryMs: 0, armed: LEGENDARY_EFFECTS.map(() => 0) };
}

/** Temasin kopmadigi en uzun vurus araligi (oyun ms), kulenin isisiz taban araligindan. */
export function getEngageGapAllowanceMs(baseIntervalMs: number) {
  const interval = Number.isFinite(baseIntervalMs) ? Math.max(0, baseIntervalMs) : 0;
  return Math.max(ENGAGE_MIN_GAP_MS, interval * ENGAGE_GAP_INTERVAL_FACTOR);
}

/**
 * Temas saatini bir vurusla ilerletir ve dolan her saniye icin zar atar.
 *
 * `elapsedGameMs`: bu vurusla bir onceki vurus arasindaki oyun suresi.
 * Aralik `gapAllowanceMs`i asarsa temas kopmus sayilir: saat sifirlanir,
 * zar atilmaz (kurulu haklar yerinde kalir). `chances` etki sirasiyla saniyelik
 * ihtimal. Kac zar atildigini dondurur (test ve olcum icin).
 */
export function advanceLegendaryEngagement(pair: LegendaryPairState, elapsedGameMs: number, gapAllowanceMs: number, chances: readonly number[], random: () => number) {
  if (!(elapsedGameMs > 0)) return 0;
  if (elapsedGameMs > gapAllowanceMs) {
    pair.carryMs = 0;
    return 0;
  }
  pair.carryMs += elapsedGameMs;
  let rolls = 0;
  while (pair.carryMs >= LEGENDARY_ROLL_INTERVAL_MS) {
    pair.carryMs -= LEGENDARY_ROLL_INTERVAL_MS;
    rolls += 1;
    for (let index = 0; index < chances.length; index += 1) {
      const chance = chances[index];
      if (chance > 0 && random() < chance) pair.armed[index] = Math.min(LEGENDARY_MAX_ARMED, (pair.armed[index] ?? 0) + 1);
    }
  }
  return rolls;
}

/** Kulenin bir etkideki saniyelik ihtimali: kart ve esya toplami, tavanli. */
export function clampLegendaryChance(total: number) {
  return Math.max(0, Math.min(LEGENDARY_CHANCE_CAP, Number.isFinite(total) ? total : 0));
}

/** Infaz esigi (azami canin payi). */
export function getExecuteThreshold(champion: boolean) {
  return champion ? EXECUTE_CHAMPION_THRESHOLD : EXECUTE_THRESHOLD;
}

/** Parcalanmanin sarapnel hasari; `depth` zincirdeki halka (0 ilk). */
export function getShatterDamage(maxHp: number, champion: boolean, depth: number) {
  const ratio = champion ? SHATTER_CHAMPION_MAX_HP_RATIO : SHATTER_MAX_HP_RATIO;
  return Math.max(0, maxHp) * ratio * SHATTER_CHAIN_FALLOFF ** Math.max(0, depth);
}

/** Dondurmanin suresi (oyun ms). */
export function getLegendaryFreezeMs(champion: boolean) {
  return champion ? FREEZE_CHAMPION_DURATION_MS : FREEZE_DURATION_MS;
}

/**
 * Istemciye giden efsanevi etki olayi (`legendary:proc` yayini). Anahtarlar
 * kisa; konumlar dunya birimi, sureler oyun ms.
 *
 * - `k`: etki. `f: 1` ikinci evre: parcalanmanin patlamasi, kronal izin
 *   geri odemesi.
 * - `e` / `e2`: hedef ve (bag icin) ortak dusman; sureli etkiler (iz, bag,
 *   cekim, catlak) istemcide dusmanin cizimine yapisiyor.
 * - `p`: zincirin halkalari, duz liste `[x1, y1, x2, y2, ...]` (hedeften baslar).
 * - `r`: alan yaricapi; `ms`: sure; `a`: geri odenen hasar.
 */
export type LegendaryProcMessage = {
  k: LegendaryEffect;
  x: number;
  y: number;
  t?: string;
  e?: string;
  e2?: string;
  p?: number[];
  r?: number;
  ms?: number;
  a?: number;
  f?: 1;
};
