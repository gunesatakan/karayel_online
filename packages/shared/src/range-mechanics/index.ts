/**
 * Menzil turu: uc kart (Kenetlenme, Termal Mercek, Siper Gozcusu) ve uc
 * esya (Teleskopik Namlu, Atis Haritasi, Gozcu Diregi).
 *
 * Hicbiri duz "+%X menzil" degil; her biri menzili sahadaki baska bir seye
 * bagliyor: ayni hedefte kalma suresi, namlu sicakligi, kulenin kenarindaki
 * duvarlar, kulenin taban menzili, dalga icindeki oldurmeler ve bitisikteki
 * destek yapisi. Sunucu (`getTowerOwnRange`) ve testler sayilari buradan
 * okuyor; kart ve esya metinleri bu sayilarla yazildi.
 *
 * Kosullu paylar (Teleskopik Namlu disindakiler) toplamsal menzil havuzuna
 * kart ve esyalarin `range` payiyla birlikte giriyor; ustuste binince menzil
 * patlamasin diye toplamlari `RANGE_CONDITIONAL_CAP` ile sinirli.
 */

/** Kenetlenme: ayni hedefe ates edilen sure en fazla bu payi verir (4 oyun saniyesi). */
export const FOCUS_RANGE_MAX = 0.2;
/**
 * Kenetlenme: kule ayni hedefe bu kadar oyun suresi ates etmezse (hedef
 * oldu, menzilden cikti ya da kule baska hedefe dondu) kazanc sifirlaniyor.
 * En yavas kulelerin atis araligindan uzun.
 */
export const FOCUS_RANGE_GRACE_MS = 2500;
/** Termal Mercek: kazanc bu sicaklikta baslar (isi freni esigi) ve 100 derecede tam olur. */
export const HEAT_RANGE_START_TEMPERATURE = 50;
export const HEAT_RANGE_FULL_TEMPERATURE = 100;
/** Siper Gozcusu: en fazla bu kadar duvar sayilir; bir kenar ikmal icin acik kalir. */
export const WALL_RANGE_MAX_WALLS = 3;
/** Atis Haritasi: dalga basina en fazla bu kadar oldurme sayilir. */
export const KILL_RANGE_MAX_KILLS = 5;
/** Gozcu Diregi: bir kulenin bitisikteki direklerden alabilecegi en fazla pay (iki direk). */
export const NEIGHBOR_RANGE_MAX = 0.2;
/** Kosullu menzil paylarinin toplam tavani (Kenetlenme + Termal Mercek + Siper + Atis Haritasi + Gozcu Diregi). */
export const RANGE_CONDITIONAL_CAP = 0.35;

/** Termal Mercek: kazanc bu kadar derecelik basamaklarla artiyor ("her 10 derece"). */
export const HEAT_RANGE_STEP_DEGREES = 10;

/**
 * Kenetlenme: ayni hedefe `heldMs` oyun suresi ates etmis kulenin payi. Tam
 * saniyelerle basamakli ("her saniye"): menzil halkasi ve tel her karede
 * kipirdamasin.
 */
export function getFocusRangeAdd(perSecond: number, heldMs: number) {
  if (!(perSecond > 0) || !(heldMs > 0)) return 0;
  return Math.min(FOCUS_RANGE_MAX, perSecond * Math.floor(heldMs / 1000 + 1e-9));
}

/**
 * Termal Mercek: 50 derecede 0, 100 derecede `ratio`; arasi 10 derecelik
 * basamaklarla (her basamak `ratio`nun beste biri). Basamak, sicaklik her
 * karede degisirken menzilin titremesini onluyor.
 */
export function getHeatRangeAdd(temperature: number, ratio: number) {
  if (!(ratio > 0)) return 0;
  const steps = (HEAT_RANGE_FULL_TEMPERATURE - HEAT_RANGE_START_TEMPERATURE) / HEAT_RANGE_STEP_DEGREES;
  const reached = Math.floor((temperature - HEAT_RANGE_START_TEMPERATURE) / HEAT_RANGE_STEP_DEGREES + 1e-9);
  return ratio * Math.max(0, Math.min(steps, reached)) / steps;
}

/** Siper Gozcusu: kenardaki duvar sayisi, tavanli. */
export function getWallRangeAdd(perWall: number, walls: number) {
  if (!(perWall > 0)) return 0;
  return perWall * Math.max(0, Math.min(WALL_RANGE_MAX_WALLS, Math.floor(walls)));
}

/** Atis Haritasi: bu dalgadaki oldurme sayisi, tavanli. */
export function getKillRangeAdd(perKill: number, kills: number) {
  if (!(perKill > 0)) return 0;
  return perKill * Math.max(0, Math.min(KILL_RANGE_MAX_KILLS, Math.floor(kills)));
}
