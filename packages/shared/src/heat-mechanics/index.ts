/**
 * Isi, atis hizi ve nisan esyalarinin ikinci tur mekanik sabitleri.
 *
 * Olcum (docs/esya-guc-siniflandirmasi.md) iki seyi gosterdi: kuleler isiyla
 * sinirli (surekli atis `soguma / atis isisi`, ~0,3 tetik/sn) ve iskalar ates
 * konisinden degil merminin ucus suresinden geliyor. Buradaki sabitler o iki
 * bulguya cevap veren esya ve kartlarin sayilari; statlar `modifiers`
 * modulunde, metinler katalogda, uygulama sunucuda. Sayilar tek yerde dursun
 * ki metin, panel ve savas ayni sayiyi okusun.
 */

/**
 * Oncul nisan (`leadTargeting`): atislarin bu payi hedefin, mermi ona
 * varana kadar gidecegi noktaya (tam bulusma noktasi) ateslenir; 1 her atis.
 *
 * Pay yarim ongoru degil, ongorulu atislarin orani: olcumde yarim ongoru
 * hizli hedefte ongorusuz atistan da kotu iskaliyordu (mermi hizi kosucu
 * hizina yakin, yarim yol hep bos). Oran deterministik bir biriktiriciyla
 * dagitiliyor (pay 0,25 ise her dorduncu atis), yani yigilan esyalar
 * dogrusal deger veriyor. Ustu kirpiliyor.
 */
export const LEAD_TARGETING_MAX = 1;

/**
 * "Hizli hedef" (`damageVsFast`): kosucu ya da ucan dusman. Hareket
 * Ongorucu ve Ongorulu Takip'in kullandigi tanimla ayni; ikisi ayri
 * yazilsa oyuncu ayni kelimeye iki anlam ogrenirdi.
 */
export function isFastEnemy(enemy: { type?: string; movementKind?: string }) {
  return enemy.type === "runner" || enemy.movementKind === "air";
}

/** `critSplash`: kritik vurusun patlama yaricapi, izgara karesi cinsinden. */
export const CRIT_SPLASH_RADIUS_CELLS = 1.5;
/** `hitSplash`: vurusun sictigi komsu dusmanin en uzak mesafesi, izgara karesi. */
// Olcumde dalga icindeki dusmanlar ~1,7 kare arayla yuruyor; 1,2 karede
// sicrayacak komsu neredeyse hic bulunmuyordu.
export const HIT_SPLASH_RADIUS_CELLS = 2;
/**
 * Kriyojen Hat ve Lanet Fitili aura yavaslatmasinda: auranin suresi yok,
 * dusman aurada kaldikca her tik bu kadarlik (oyun ms) bir pencere yenileniyor.
 */
export const AURA_SLOW_RIDER_MS = 1000;
/** `farCritChance`: hedef menzilin bu payindan uzaktaysa kosullu kritik isliyor. */
export const FAR_CRIT_RANGE_FRACTION = 0.5;

/**
 * `ventHeat` (Emniyet Ventili): kuleyi bu sicakligin ustune cikaran atista
 * vent aciliyor; iki vent arasindaki en kisa sure (oyun milisaniyesi).
 * Esik frenin ortasinda: surekli ateste kule 60-90 derece arasinda oturuyor,
 * fren girisinde (50) acilan bir vent surekli ateste hic tetiklenmiyordu.
 */
export const VENT_TRIGGER_TEMPERATURE = 70;
export const VENT_COOLDOWN_MS = 10_000;

/** `killCooling` (Kriyo Sok Kartusu): oldurmeden sonra sogumanin artirildigi sure. */
export const KILL_COOLING_DURATION_MS = 2000;

/**
 * `trackRhythm` (Takip Ritmi): ayni hedefe art arda atis yiginlarinin
 * tavani. Hedef degisince yiginin yarisi dusuyor (asagi yuvarlanir): "ilk"
 * hedeflemede one gecen dusman hedefi sik degistiriyor ve tam sifirlama
 * olcumde yigini hic biriktirmiyordu.
 */
export const TRACK_RHYTHM_MAX_STACKS = 5;

/**
 * `heatShock` (Termal Sok Halkasi): kule bu sicakligi gecince biriken isi
 * bir sok dalgasina donusuyor; bekleme suresi, atilan derece ve dalganin
 * yaricapi (kulenin menzilinin payi). Kilitte bekleme suresine bakilmiyor.
 * Olcumde frenli kule neredeyse hic kilitlenmiyor (sicaklik 50-90 arasinda
 * oturuyor); tetik bu yuzden kilit degil 80 derece.
 */
export const HEAT_SHOCK_TEMPERATURE = 80;
export const HEAT_SHOCK_COOLDOWN_MS = 12_000;
export const HEAT_SHOCK_VENT = 10;
export const HEAT_SHOCK_RANGE_FRACTION = 0.6;

/**
 * `restartShots` (Yeniden Atesleme Bobini): isi freninden cikan (50
 * derecenin altina inen) kulenin isisiz atislarinin atis hizi eki ve iki
 * hak arasindaki en kisa sure.
 */
export const RESTART_FIRE_RATE = 0.5;
export const RESTART_COOLDOWN_MS = 8_000;

/**
 * `coldSalvo` (Soguk Salvo): kule 0 dereceye inince sonraki atislar bu kadar
 * hizli ve isisiz. Sifir esigi kayan noktaya karsi kucuk bir pay tasiyor.
 */
export const COLD_SALVO_FIRE_RATE = 1;
export const COLD_SALVO_TEMPERATURE = 0.5;

/**
 * `overclock` (Asiri Hiz): 50 derecenin ustunde fren yerine atis hizi
 * sicaklikla artiyor; deger 100 derecedeki ek. Kilit esigi degismiyor.
 */
export function getOverclockFireRateAdd(temperature: number, brakeTemperature: number, maxAdd: number) {
  if (!(maxAdd > 0) || temperature <= brakeTemperature) return 0;
  return maxAdd * Math.min(1, (temperature - brakeTemperature) / Math.max(1, 100 - brakeTemperature));
}

/**
 * `brakeDamage` (Rejeneratif Fren): isi freninin kestigi atis hizinin bu
 * payi hasara donuyor. Fren carpani 1 iken (soguk namlu) ek yok.
 */
export function getBrakeDamageAdd(brakeMultiplier: number, ratio: number) {
  if (!(ratio > 0)) return 0;
  return ratio * Math.max(0, 1 - Math.max(0, Math.min(1, brakeMultiplier)));
}

/**
 * Atis hizi, soguma ve isi, ucuncu tur.
 *
 * - `woundedFireRate` (Av Ritmi): kulenin hedefi azami caninin bu payinin
 *   altindayken atis hizi payi isliyor.
 * - `idleCooling` (Rolanti Sogutmasi): kule bu kadar oyun suresidir dogrudan
 *   vurmuyorsa bos sayiliyor ve soguma payi isliyor.
 * - `crowdFireRate` (Kalabalik Besleyici): menzildeki en fazla bu kadar dusman
 *   sayiliyor.
 */
export const WOUNDED_FIRE_RATE_HP_RATIO = 0.5;
export const IDLE_COOLING_DELAY_MS = 1000;
export const CROWD_FIRE_RATE_MAX_ENEMIES = 8;
