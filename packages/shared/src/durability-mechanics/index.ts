/**
 * Dayaniklilik turu: uc kart (Sertlesen Govde, Inatci Siper, Son Nefes) ve
 * uc esya (Yuk Dagitici Kiris, Oz Onarim Cekirdegi, Percinli Kaplama).
 *
 * Katalogda can uzun sure tek bir sayiydi: `towerHealth` (+%X azami can),
 * cogu bir bedelle. Bu tur o sayiya bir yuzde daha eklemiyor; her biri
 * yapinin ayakta kalmasini sahadaki baska bir seye bagliyor: hayatta kalinan
 * dalga sayisi, yapinin o anki cani, oldurucu vurus, bitisikteki destek
 * yapisi, hasar almadan gecen sure ve vurusun buyuklugu (duz zirh).
 *
 * Sunucu (`damageTower`, dalga sonu buyumesi, `updateTowers`) ve testler
 * sayilari buradan okuyor; kart ve esya metinleri bu sayilarla yazildi.
 */

/**
 * Sertlesen Govde: dalga sonunda ayakta duran yapinin azami cani bu kadar
 * dalga icin buyuyor (dalga basina pay kartin `veteranHealth`i). Yapinin
 * kendi sayaci; kart alinmadan once gecen dalgalar sayilmiyor.
 */
export const VETERAN_HEALTH_MAX_WAVES = 8;

/** Sertlesen Govde'nin azami can carpani: `1 + pay * dalga` (tavanli). */
export function getVeteranHealthMultiplier(perWave: number, waves: number) {
  if (!(perWave > 0) || !(waves > 0)) return 1;
  return 1 + perWave * Math.min(VETERAN_HEALTH_MAX_WAVES, Math.floor(waves));
}

/** Inatci Siper: yapinin cani azami caninin bu oraninin altindayken aldigi hasar azaliyor. */
export const WOUNDED_DAMAGE_REDUCTION_HP_RATIO = 0.5;
/** Inatci Siper ust uste binse (ileride) bile hasar en fazla bu kadar azaliyor. */
export const WOUNDED_DAMAGE_REDUCTION_CAP = 0.6;

/** Inatci Siper: vurusun ham hasar carpani (cani esigin ustundeyse 1). */
export function getWoundedDamageMultiplier(reduction: number, hp: number, maxHp: number) {
  if (!(reduction > 0) || !(maxHp > 0) || hp >= maxHp * WOUNDED_DAMAGE_REDUCTION_HP_RATIO) return 1;
  return 1 - Math.min(WOUNDED_DAMAGE_REDUCTION_CAP, reduction);
}

/**
 * Son Nefes: dalga basina yapi basina bir kez, oldurucu vurus yapiyi bu
 * kadar canla birakiyor; ardindan kartin `lastStand` degeri kadar oyun
 * saniyesi yapi hasar almiyor. Yikim (enerji yiyici) bunu atliyor.
 */
export const LAST_STAND_HP = 1;

/**
 * Yuk Dagitici Kiris: takili yapi bitisigindeki dost yapilarin (kule, duvar,
 * kaynak binasi) aldigi hasarin bu payini (esyanin `damageShare`i) kendi
 * uzerine aliyor. Bir vurusu en fazla bir kiris paylasiyor; paylasilan kisim
 * kirisin zirhindan gecmiyor (yoksa zirh iki kez sayilirdi) ve yeniden
 * paylasilmiyor. Paylasim tavani `DAMAGE_SHARE_CAP`.
 */
export const DAMAGE_SHARE_CAP = 0.5;

/**
 * Oz Onarim Cekirdegi: yapi bu kadar oyun suresi hasar almadiysa saniyede
 * azami caninin `idleRegen` payini yeniliyor. Yalnizca dalga sirasinda;
 * kurulumda yapi altinla onariliyor (dalgada yalnizca tamirciler onariyor).
 */
export const IDLE_REGEN_DELAY_MS = 4000;

// ------------------------------------------------------------------ Zirh turu
//
// Sahibin istegi (2026-10-24): yapilara can ya da zirh veren kart ve esya
// sayisi artsin; kulenin cani arttikca menzilini artiran bir esya; zirh ve
// zirhla buyuyen, zarla gelen korkutma veren tek kulelik bir kart. Dort kart
// (Takviye Levhasi, Tam Govde, Katmanli Zirh, Dehset Zirhi) ve dort esya
// (Agir Plaka, Kompozit Govde, Reaktif Zirh, Kutle Telemetresi).

/** Tam Govde: yapinin cani azami caninin bu oraninda ya da ustundeyken zirh payi isliyor. */
export const HIGH_HEALTH_ARMOR_HP_RATIO = 0.75;
/** Katmanli Zirh: dalga sonunda ayakta duran yapinin zirhi en fazla bu kadar dalga buyuyor. */
export const VETERAN_ARMOR_MAX_WAVES = 5;
/** Reaktif Zirh: yapinin cani azami caninin bu oraninin altindayken zirhi buyuyor. */
export const WOUNDED_ARMOR_HP_RATIO = 0.5;

export type StructureArmorInput = {
  /** Yapinin kendi zirhi (`TOWER_BASE_ARMOR`). */
  base: number;
  /** Duz puanlar (`armorFlat`); eksi toplam sifira kirpiliyor. */
  flat: number;
  highHealth: number;
  veteran: number;
  veteranWaves: number;
  wounded: number;
  hp: number;
  maxHp: number;
};

/**
 * Yapinin zirhi (aura carpani haric). Duz puanlar, Tam Govde (cani esikte ya
 * da ustunde) ve Katmanli Zirh'in dalga puanlari toplaniyor; Reaktif Zirh
 * yarali yapida toplami buyutuyor. Tam Govde ile Reaktif Zirh ayni anda
 * islemiyor: biri canin ust bandinda, obur alt yarisinda.
 */
export function getStructureArmor(input: StructureArmorInput) {
  let armor = input.base + Math.max(0, input.flat);
  const healthy = input.maxHp > 0 && input.hp >= input.maxHp * HIGH_HEALTH_ARMOR_HP_RATIO;
  if (input.highHealth > 0 && healthy) armor += input.highHealth;
  if (input.veteran > 0 && input.veteranWaves > 0) armor += input.veteran * Math.min(VETERAN_ARMOR_MAX_WAVES, Math.floor(input.veteranWaves));
  const wounded = input.maxHp > 0 && input.hp < input.maxHp * WOUNDED_ARMOR_HP_RATIO;
  if (input.wounded > 0 && wounded) armor *= 1 + input.wounded;
  return armor;
}

/** Dehset Zirhi: zar bu kadar oyun suresinde bir atiliyor. */
export const ARMOR_FEAR_ROLL_INTERVAL_MS = 1000;
/** Dehset Zirhi: zarin yuzu; yalnizca en buyuk yuz (6) sonraki vurusu dolduruyor. */
export const ARMOR_FEAR_DIE_FACES = 6;
/**
 * Dehset Zirhi: zirh ve durum suresi bonuslari ne kadar buyurse buyusun korku
 * en fazla bu kadar oyun suresi (kart metni "en fazla 6 saniye").
 */
export const ARMOR_FEAR_MAX_MS = 6000;

/** Altili zar: `random` [0, 1) verir; yalnizca 6 tutuyor (1/6). */
export function rollArmorFearDie(random: () => number) {
  return Math.min(ARMOR_FEAR_DIE_FACES, Math.floor(random() * ARMOR_FEAR_DIE_FACES) + 1) === ARMOR_FEAR_DIE_FACES;
}

/**
 * Dehset Zirhi'nin korku suresi (oyun ms): zirh puani basina kartin `armorFear`
 * saniyesi, kulenin durum suresi carpaniyla; tavan carpandan sonra.
 */
export function getArmorFearDurationMs(perArmorSeconds: number, armor: number, durationMultiplier = 1) {
  if (!(perArmorSeconds > 0) || !(armor > 0) || !(durationMultiplier > 0)) return 0;
  return Math.min(ARMOR_FEAR_MAX_MS, armor * perArmorSeconds * 1000 * durationMultiplier);
}

/**
 * Kutle Telemetresi: azami can tabanini (kart, esya ve buyume oncesi) her
 * %100 astiginda menzile `perHundred` pay; kesirli asim kesirli pay. Tavansiz
 * (cevrimler gibi): menzili can yatirimi sinirliyor.
 */
export function getHealthRangeAdd(perHundred: number, maxHp: number, baseMaxHp: number) {
  if (!(perHundred > 0) || !(baseMaxHp > 0) || !(maxHp > baseMaxHp)) return 0;
  return perHundred * (maxHp / baseMaxHp - 1);
}
