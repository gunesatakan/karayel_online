import type { EnemyType } from "../index.js";
import { getEnemyExp } from "../index.js";
import { lt, ltFixed } from "../i18n/index.js";
import { SHIELD_DAMAGE_TAKEN_MULTIPLIER, calculateArmorDamageMultiplier, getEnemyCombatDefinition } from "../combat.js";
import {
  AIR_ENEMY_HEALTH_MULTIPLIER,
  ENEMY_REWARD_MULTIPLIER,
  getEnemyLeakDamage,
  getWaveAirMode,
  getWaveEnemyMaxHp,
  getWaveEnemyTypeWeights,
  getWaveHpMultiplier,
  isFlyingWaveSpawn
} from "./index.js";

/**
 * Sampiyon: dalganin ortasinda gelen tek, tacli ve kalin dusman.
 *
 * Neden var: erken dalgalarin %88-94'u tek vurusta oluyor, yani hasar
 * yukseltmesi ekranda hicbir sey degistirmiyor -- dusman zaten tek atista
 * gidiyordu. Dort-bes normal dusman kalinligindaki bir govde, kulelerin ne
 * kadar guclendigini her dalga ayni olcuyle gosteriyor: "bu sefer kac saniyede
 * devrildi". Ayni zamanda "son anda tutuldu" anini yaratiyor.
 *
 * Neden zorlugu degistirmiyor: sampiyon kendi kalinligi kadar normal dogumun
 * **yerine** geliyor. Yerine gectigi dogumlarin beklenen toplam efektif cani,
 * oldurme altini, deneyimi, sizinti hasari ve ulti sarji sampiyona yaziliyor;
 * dalganin toplamlari ayni kaliyor, yalnizca bir govdede toplaniyor. Dalganin
 * suresi de ayni: sampiyondan sonraki dogum, yerine gectigi dogumlarin
 * araligi kadar bekliyor.
 *
 * Kurallar:
 * - `CHAMPION_FIRST_WAVE`ten (6) itibaren her dalgada bir sampiyon. Ilk
 *   dalgalar degismiyor: 1. ve 2. dalgayi `wave-balance` testi sabitliyor, 3. ve
 *   4. dalga ise olcumde zorlugu kaydiriyordu (bkz. `CHAMPION_FIRST_WAVE`).
 * - Tam hava dalgasinda (5, 10) yok: ucanlar ceyrek canla geliyor ve dalga
 *   havayi vurma sinavi; kalin bir ucan o sinavi bir zar atisina cevirirdi.
 * - Karisik dalgada (15, 20) var ve **karada**: yerine gectigi ardisik dogumlar
 *   ucan ve kara karisik, butceye ucanlar kendi ceyrek canlariyla giriyor.
 *   Boylece dalganin toplami yine ayni; yalnizca birkac ucan govdesi karadaki
 *   tek govdeye tasiniyor (dalganin hava payi o kadar kuculuyor).
 * - Tur dalga numarasindan, sirayla (`CHAMPION_TYPE_ROTATION`): rastgele degil,
 *   o dalganin karisimindan. Irk direnci, hareket tipi ve direncler turunden
 *   geliyor; sampiyon o turun kalin hali.
 */
/*
 * Olcum (butun sayilarin dayanagi): gercek derlenmis oda, sahte saat, tohumlu
 * zar, iki bot (Atakan yalniz Takipci, Zeynep yalniz Hiza Emri), olum dalgasi
 * ortalamasi. Hedef: sampiyonsuz oyunun yarim dalga icinde kalmak. Sampiyonsuz
 * (240 tohum): Atakan 8,40, Zeynep 7,47.
 *
 * Kayip hep ayni yerden geliyor: zayif bir savunma bes dusmanin birkacini
 * kacirmak yerine tek govdeyi butunuyle kaciriyor, sizinti "hep ya da hic"e
 * donuyor. Butce esit ama dagilim degil; bu yuzden kalinlik, baslangic ve tur
 * olcumle secildi:
 *
 *   3. dalgadan, 5,5 kat, dort tur  (48 tohum)   Zeynep -2,41
 *   4. dalgadan, ayni               (48 tohum)   Zeynep -1,58
 *   3. dalgadan, 3 kat              (48 tohum)   Zeynep -0,73
 *   6. dalgadan, 5,5 kat, dort tur  (144 tohum)  Atakan -0,19  Zeynep -0,67
 *   6. dalgadan, 5 kat, dort tur    (240 tohum)  Atakan -0,13  Zeynep -0,56
 *   6. dalgadan, 5,5 kat, grunt/kusatma (240)    Atakan -0,14  Zeynep -0,51
 *   6. dalgadan, 5 kat, grunt/kusatma   (240)    Atakan -0,10  Zeynep -0,25  <- secilen
 *
 * Sampiyonu dalganin basina, sonuna ya da bosluk onune alinca hep daha kotu
 * cikti (bkz. `CHAMPION_WAVE_POSITION`, `CHAMPION_LEAD_SHARE`).
 */

/**
 * Ilk sampiyon dalgasi. Plan 3. dalgayi istiyordu: erken dalgalarda zaten
 * sizdiran savunma sampiyonu butunuyle kaciriyor ve yukaridaki olcumde iki
 * dalga erken oluyordu. 6. dalga canin ilk sert sicradigi dalga (x1,53):
 * sampiyon tam orada gucun yetip yetmedigini gosteriyor.
 */
export const CHAMPION_FIRST_WAVE = 6;

/**
 * Hedef kalinlik: ayni dalgadaki ayni turden normal dusmanin kac kati.
 *
 * Yerine gecilen dogum sayisi tam sayi, yani gercek kat bu hedefe en yakin tam
 * butceden cikiyor: grunt dort dogumla 4,46, kusatma uc dogumla 4,40 kat. Bir
 * ust basamak (grunt bes dogum 5,58, kusatma dort dogum 5,87) olcumde Zeynep
 * botunu yarim dalganin disina itti. Butce esitligi her zaman tam; yuvarlanan
 * sey kalinlik.
 */
export const CHAMPION_HP_MULTIPLE = 5;

/**
 * Butcenin ustune binen can carpani: sampiyon yerine gectigi dogumlarin
 * toplam canının bu kati. Odul (altin, deneyim, sizinti) butcede kaliyor;
 * yalnizca dayaniklilik artiyor. Sahibinin istegiyle 2 (once 1).
 */
export const CHAMPION_HP_BONUS = 2;

/** En az bu kadar dogumun yerine gecer; tek dogumun yerine gecen "sampiyon" olmazdi. */
export const CHAMPION_MIN_REPLACED = 2;

/**
 * Dalganin en fazla bu payi sampiyona gidebilir: kucuk bir dalgada (az
 * dogum, kalin tur) yariyi asmasi dalgayi tek dusmana cevirirdi.
 */
export const CHAMPION_MAX_SHARE = 0.5;

/**
 * Sampiyon turu sirasi: `dalga mod uzunluk`. Cift dalga grunt (6, 8, 12, 14,
 * 16, 18, 20), tek dalga kusatma (7, 9, 11, 13, 15, 17, 19). Ilk sampiyon
 * dalgasindan bagimsiz: baslangic kaydirilinca turler kaymasin. O dalgada
 * olmayan tur (4. dalgadan once kusatma) atlanip siradaki aliniyor.
 *
 * Yalnizca turune ozel direnci olmayan turler. Butcenin efektif cani irk ve
 * vurus tipi direncini disarida birakiyor (kuleye gore degisiyor); karisimda
 * bu direncler birbirini kabaca goturuyor, tek bir turun kalin halinde ise
 * goturmuyor:
 * - Kosucu mermiye %20 direncli ve yavaslatmaya dayanikli: en yaygin vurus
 *   tipine karsi butcenin dortte bir ustunde. Olcumde de oyle cikti.
 * - Nisanci kalkanli ve menzilli; olcumde Zeynep botunu yarim dalganin
 *   disina itti (5 katta -0,46/-0,56).
 * - Brute tek basina ortalama dogumun iki katindan kalin; bes kati, kucuk bir
 *   dalgada on iki dogumun yerine gecip dalgayi tek bir dusmana ceviriyordu.
 */
export const CHAMPION_TYPE_ROTATION: readonly EnemyType[] = ["grunt", "siege"];

/**
 * Sampiyonun dalgadaki yeri: yerine gectigi dogumlar dalganin bu kesrinde
 * basliyor (0 ilk dogum, 1 son). Ortasi: once kalabalik kuleleri isitiyor,
 * sampiyon geldiginde ise hala arkasindan gelenler var.
 */
export const CHAMPION_WAVE_POSITION = 0.5;

/**
 * Sampiyon yerine gectigi dogumlarin araliklarini bosaltiyor (dalganin suresi
 * ayni kalsin diye). Bu pay o boslugun sampiyondan **once** gelen kismi: 0 ise
 * bosluk tamamen arkasinda (sampiyon kalabaligin icinden cikiyor, arkasi sessiz).
 */
export const CHAMPION_LEAD_SHARE = 0;

/** Istemcide sampiyon govdesinin buyutmesi. */
export const CHAMPION_SPRITE_SCALE = 1.25;

/** Sampiyon dogarken dunyada beliren kisa etiket. */
export const CHAMPION_LABEL = "ŞAMPİYON";

export type WaveChampionPlan = {
  wave: number;
  type: EnemyType;
  /** Yerine gectigi ilk dogumun sifirdan sirasi (dalganin orijinal dogum sirasinda). */
  slot: number;
  /** Yerine gectigi normal dogum sayisi. */
  replaced: number;
  /** Ayni dalgadaki ayni turden normal dusmana gore can, kalkan ve yenilenme kati. */
  hpMultiple: number;
  /** Oldurme altini payi (oyuncunun kendi carpanindan once); tam sayi. */
  gold: number;
  /** Oldurme deneyimi (oyuncu sayisina bolunmeden once). */
  exp: number;
  /** Nexus'a ulasirsa verdigi toplam hasar; tam sayi. */
  leakDamage: number;
  /**
   * Zeynep itibarinin taban kazanci (oyuncunun itibar carpanindan once):
   * yerine gectigi dogumlarin turlerine gore beklenen toplam, kurusa yuvarli.
   */
  reputation: number;
  /**
   * Yerine gectigi dogumlarin bosaltigi araliklardan kacinin sampiyondan
   * **once** bekledigi (`CHAMPION_LEAD_SHARE`). Gerisi sampiyondan sonra.
   */
  leadSlots: number;
};

/**
 * Zeynep'in oldurme basina itibar kazanci (taban, carpandan once). Agir
 * govde daha cok kazandiriyor. Sunucudan tasindi: sampiyonun itibari yerine
 * gectigi dogumlarin turlerinden beklenen toplam, o toplam bu sayilardan.
 */
export function getEnemyZeynepReputationGain(type: EnemyType) {
  return type === "brute" ? 4 : type === "shooter" ? 3 : 2;
}

/** Normal dusmanin oldurme altini payi: `round(odul * 1.5)`, en az 1. */
export function getEnemyKillGold(type: EnemyType) {
  return Math.max(1, Math.round(getEnemyCombatDefinition(type).reward * ENEMY_REWARD_MULTIPLIER));
}

/**
 * Tek oyunculu bir dalgada dusmanin can ve kalkani; `healthMultiplier`
 * ucanin ceyregi ve sampiyonun katini tasiyor. Sunucunun dogurma kodundaki
 * yuvarlamanin aynisi: can denge carpanini aliyor, kalkan almiyor.
 */
export function getEnemySpawnHealth(type: EnemyType, wave: number, healthMultiplier = 1) {
  const definition = getEnemyCombatDefinition(type);
  return {
    maxHp: getWaveEnemyMaxHp(definition.maxHp, wave, healthMultiplier),
    maxShield: Math.round(definition.shield * getWaveHpMultiplier(wave) * healthMultiplier),
    armor: definition.armor
  };
}

/**
 * Efektif can: tipsiz bir vurusun dusmani oldurmek icin indirmesi gereken
 * ham hasar. Kalkan yarim oranda soguruyor (bir kalkan puani iki hasar),
 * zirh carpani ustune biniyor. Irk ve vurus tipi direncleri kuleye gore
 * degistigi icin disarida; sampiyon zaten kendi turunun direncini tasiyor.
 */
export function getEffectiveHp(health: { maxHp: number; maxShield: number; armor: number }) {
  return (health.maxHp + health.maxShield / SHIELD_DAMAGE_TAKEN_MULTIPLIER) / calculateArmorDamageMultiplier(health.armor);
}

/** Dalganin `slot`. dogumunun beklenen degerleri (karisim uzerinden). */
export function getWaveSlotExpectation(wave: number, slot: number) {
  const air = isFlyingWaveSpawn(wave, slot);
  const healthMultiplier = air ? AIR_ENEMY_HEALTH_MULTIPLIER : 1;
  let effectiveHp = 0;
  let gold = 0;
  let exp = 0;
  let leakDamage = 0;
  let reputation = 0;
  for (const { type, weight } of getWaveEnemyTypeWeights(wave)) {
    effectiveHp += weight * getEffectiveHp(getEnemySpawnHealth(type, wave, healthMultiplier));
    gold += weight * getEnemyKillGold(type);
    exp += weight * getEnemyExp(wave, type, air ? "air" : "ground");
    leakDamage += weight * getEnemyLeakDamage(type);
    reputation += weight * getEnemyZeynepReputationGain(type);
  }
  return { effectiveHp, gold, exp, leakDamage, reputation };
}

/** Bu dalgada sampiyon var mi; `firstWave` olcum icin ilk dalgayi kaydiriyor. */
export function hasWaveChampion(wave: number, firstWave = CHAMPION_FIRST_WAVE) {
  return Number.isFinite(wave) && wave >= firstWave && getWaveAirMode(wave) !== "all";
}

/** Dalganin sampiyon turu; sampiyonsuz dalgada `undefined`. */
export function getWaveChampionType(
  wave: number,
  rotation: readonly EnemyType[] = CHAMPION_TYPE_ROTATION,
  firstWave = CHAMPION_FIRST_WAVE
): EnemyType | undefined {
  if (!hasWaveChampion(wave, firstWave) || rotation.length === 0) return undefined;
  const available = new Set(getWaveEnemyTypeWeights(wave).filter((entry) => entry.weight > 0).map((entry) => entry.type));
  const start = Math.floor(wave);
  for (let step = 0; step < rotation.length; step += 1) {
    const type = rotation[(start + step) % rotation.length];
    if (available.has(type)) return type;
  }
  return undefined;
}

/**
 * Dalganin sampiyon plani. `slotCount` dalganin **orijinal** dogum sayisi
 * (harita olcegi ve oyuncu sayisi dahil); sampiyon bunun ortasina oturuyor.
 *
 * Kac dogumun yerine gecilecegi: yerine gecilen dogumlarin beklenen efektif
 * can toplami, ayni turden normal dusmanin `CHAMPION_HP_MULTIPLE` katina en
 * yakin olan sayi. Sonra kat o toplamdan geri hesaplaniyor, yani can butcesi
 * tam esit; kalinlik hedefin biraz altinda ya da ustunde kaliyor.
 *
 * Yuvarlama: altin ve sizinti tam sayiya, deneyim kurusa yuvarlaniyor. Dalga
 * toplami yerine gecilen dogumlarin beklenen toplamindan altinda en fazla 0,5,
 * sizintida 0,5 can, deneyimde 0,005 sapiyor. Can tarafinda sampiyonun cani ve
 * kalkani tam sayiya yuvarlandigi icin efektif can butceden binde birkac sapiyor.
 */
export type WaveChampionOptions = {
  /** Hedef kalinlik; verilmezse `CHAMPION_HP_MULTIPLE`. */
  hpMultiple?: number;
  /** Ilk sampiyonlu dalga; verilmezse `CHAMPION_FIRST_WAVE`. */
  firstWave?: number;
  /** Dalganin neresinde (0 ilk dogum, 1 son); verilmezse `CHAMPION_WAVE_POSITION`. */
  position?: number;
  /** Bosalan araliklarin sampiyondan onceki payi; verilmezse `CHAMPION_LEAD_SHARE`. */
  lead?: number;
  /** Tur sirasi (`dalga mod uzunluk`); verilmezse `CHAMPION_TYPE_ROTATION`. */
  rotation?: readonly EnemyType[];
};

export function getWaveChampionPlan(wave: number, slotCount: number, options: WaveChampionOptions = {}): WaveChampionPlan | undefined {
  const type = getWaveChampionType(wave, options.rotation, options.firstWave);
  const slots = Math.floor(slotCount);
  if (!type || !Number.isFinite(slots)) return undefined;
  const maxReplaced = Math.floor(slots * CHAMPION_MAX_SHARE);
  if (maxReplaced < CHAMPION_MIN_REPLACED) return undefined;
  const target = options.hpMultiple ?? CHAMPION_HP_MULTIPLE;
  const position = Math.max(0, Math.min(1, options.position ?? CHAMPION_WAVE_POSITION));

  const unitHp = getEffectiveHp(getEnemySpawnHealth(type, wave));
  let best: { replaced: number; slot: number; multiple: number; error: number } | undefined;
  for (let replaced = CHAMPION_MIN_REPLACED; replaced <= maxReplaced; replaced += 1) {
    const slot = Math.floor((slots - replaced) * position);
    let effectiveHp = 0;
    for (let index = slot; index < slot + replaced; index += 1) effectiveHp += getWaveSlotExpectation(wave, index).effectiveHp;
    const multiple = effectiveHp / unitHp;
    const error = Math.abs(multiple - target);
    if (!best || error < best.error) best = { replaced, slot, multiple, error };
    if (multiple >= target) break;
  }
  if (!best) return undefined;

  let gold = 0;
  let exp = 0;
  let leakDamage = 0;
  let reputation = 0;
  for (let index = best.slot; index < best.slot + best.replaced; index += 1) {
    const expectation = getWaveSlotExpectation(wave, index);
    gold += expectation.gold;
    exp += expectation.exp;
    leakDamage += expectation.leakDamage;
    reputation += expectation.reputation;
  }
  return {
    wave: Math.floor(wave),
    type,
    slot: best.slot,
    replaced: best.replaced,
    // Butce esitligindeki kat, ustune sampiyon can bonusu (bkz. `CHAMPION_HP_BONUS`).
    hpMultiple: best.multiple * CHAMPION_HP_BONUS,
    gold: Math.round(gold),
    exp: Math.round(exp * 100) / 100,
    leakDamage: Math.round(leakDamage),
    reputation: Math.round(reputation * 100) / 100,
    leadSlots: best.slot > 0
      ? Math.round((best.replaced - 1) * Math.max(0, Math.min(1, options.lead ?? CHAMPION_LEAD_SHARE)))
      : 0
  };
}

/**
 * Dalganin gercek dusman sayisi: orijinal sayi eksi sampiyonun yerine
 * gectigi dogumlar, arti sampiyonun kendisi. Kurulum ongorusu bunu yaziyor;
 * sampiyon bir dusman sayiliyor.
 */
export function getWaveSpawnCount(wave: number, slotCount: number, plan = getWaveChampionPlan(wave, slotCount)) {
  return Math.max(0, Math.floor(slotCount) - (plan ? plan.replaced - 1 : 0));
}

/**
 * Sizinti hasarinin birim basina dagilimi: toplam tam sayi, her birim tam
 * sayi, toplamlari tam olarak `leakDamage`. Nexus kalkani birim birim tutuyor
 * -- sampiyon yerine gectigi dusmanlar kadar kalkan sarji yiyor, birini degil.
 */
export function splitChampionLeakDamage(leakDamage: number, replaced: number) {
  const units = Math.max(1, Math.floor(replaced));
  const total = Math.max(0, Math.round(leakDamage));
  const parts: number[] = [];
  for (let index = 0; index < units; index += 1) {
    parts.push(Math.round(((index + 1) * total) / units) - Math.round((index * total) / units));
  }
  return parts;
}

/**
 * `champion:down`: sampiyon oldu. Sunucu bir kez yolluyor; tick'te veri yok.
 * Sure oyun zamaniyla (milisaniye): dogumdan olume.
 */
export type ChampionDownMessage = {
  enemyId: string;
  /** Dogumdan olume oyun zamani (ms). */
  ms: number;
  /** Bu kosuda bir onceki devrilen sampiyonun suresi; ilkinde alan yok. */
  prevMs?: number;
  x: number;
  y: number;
};

/** Telden gelen mesaji dogrular ve kopyalar; bozuk mesaj yok sayiliyor. */
export function sanitizeChampionDownMessage(raw: unknown): ChampionDownMessage | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  if (typeof source.enemyId !== "string") return undefined;
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  if (!finite(source.ms) || source.ms < 0 || !finite(source.x) || !finite(source.y)) return undefined;
  const message: ChampionDownMessage = { enemyId: source.enemyId, ms: source.ms, x: source.x, y: source.y };
  if (finite(source.prevMs) && source.prevMs >= 0) message.prevMs = source.prevMs;
  return message;
}

/** "10,6": saniye, tek basamak; ayirac dile gore (Ingilizcede "10.6"). */
export function formatChampionSeconds(ms: number) {
  return ltFixed(Math.max(0, ms) / 1000, 1);
}

/** "ŞAMPİYON DEVRİLDİ · 10,6 sn (önceki 12,1)"; ilk sampiyonda parantez yok. */
export function getChampionDownText(message: Pick<ChampionDownMessage, "ms" | "prevMs">) {
  const base = lt(`ŞAMPİYON DEVRİLDİ · ${formatChampionSeconds(message.ms)} sn`, `CHAMPION DOWN · ${formatChampionSeconds(message.ms)} s`);
  return message.prevMs === undefined ? base : `${base} (${lt("önceki", "was")} ${formatChampionSeconds(message.prevMs)})`;
}
