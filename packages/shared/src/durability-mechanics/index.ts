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
 * hazirlikta yapi altinla ya da tamirciyle onariliyor.
 */
export const IDLE_REGEN_DELAY_MS = 4000;
