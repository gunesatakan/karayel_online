export const FINAL_WAVE = 20;
export const BASE_WAVE_ENEMY_COUNT = 10;
/**
 * Dalga zorlugu artik kalinliktan kalabaliga kaydi.
 *
 * Onceki egride dusman sayisi dalga basina %11, cani %22 buyuyordu; 20. dalgada
 * 73 dusman vardi ama her biri 2951 canliydi. Bu, alan etkili ve kontrol
 * kulelerini anlamsizlastirip her seyi tek hedef DPS yarisina ceviriyordu.
 * Sayi %15'e cikip can %17'ye inince ayni dalgada 142 dusman ve daha ince
 * govdeler oluyor: koni, halka ve yavaslatma kuleleri isini goruyor.
 */
export const ENEMY_COUNT_WAVE_MULTIPLIER = 1.15;
export const ENEMY_HP_WAVE_MULTIPLIER = 1.17;
/**
 * Oyuncu gucundeki degisimlerin dusman canina yansimasi.
 *
 * Taban egri (1.1 * 4 / 3) oyunun ilk dengesinden kalma; uzerine binen bu carpan
 * o zamandan beri oyuncu tarafinda olan her seyi karsilar:
 *
 * - Kartlarin yarisi duz stat olmaktan cikip davranis vermeye basladi (motora
 *   stack, aura, trigger, durum etkisi; isi ve enerji egrisi kartlari).
 * - Kule seviye egrisi x48'den x12'ye indirildi, ama ayni anda seviyenin katkisi
 *   atis hizindan hasara kaydi ve elle ayarlanmis kule egrileri de yeniden
 *   hizalandi; net etki kule basina duz bir dusus degil.
 * - Dalga zorlugu kalinliktan kalabaliga kaydi.
 * - Simulator seviyenin atis hizina etkisini hic gormuyordu; duzeltilince bot
 *   gucunun gercek olcumu ortaya cikti.
 *
 * Deger tek tek tahmin edilmez, `tools/simulate.mjs` ile %5-%10 zafer bandina
 * gore olculur. Oyuncu tarafinda guc degistiren her degisiklikten sonra yeniden
 * olculmesi gerekir.
 */
export const PLAYER_POWER_COMPENSATION = 1.8;
export const ENEMY_HP_BALANCE_MULTIPLIER = 1.1 * 4 / 3 * PLAYER_POWER_COMPENSATION;
/** Dusman oldurmenin altin odulu. Dalga sonu altini bundan bagimsizdir. */
export const ENEMY_REWARD_MULTIPLIER = 1.5;

export function getWaveEnemyCount(wave: number) {
  return Math.max(1, Math.round(BASE_WAVE_ENEMY_COUNT * ENEMY_COUNT_WAVE_MULTIPLIER ** Math.max(0, wave - 1)));
}

export function getArenaWaveEnemyCount(wave: number, mapScale: number, playerCount: number) {
  const safeMapScale = Math.max(1, Math.min(4, Math.round(mapScale)));
  const multiplayerMultiplier = 1 + Math.max(0, Math.round(playerCount) - 1) * 0.35;
  return Math.max(1, Math.round(getWaveEnemyCount(wave) * safeMapScale * multiplayerMultiplier));
}

/**
 * Erken dalgalarin yumusatilmasi.
 *
 * Egri her dalgada ayni oranda buyudugu icin 1. dalga dusmani bile taban
 * caninin `ENEMY_HP_BALANCE_MULTIPLIER` kati kadar canla geliyordu; seviye 1
 * bir Hiza Emri en zayif dusmani bile tek vurusta oldremiyordu. Ilk dalgalar
 * oyuncunun kurulusunu tanidigi yer olmali, direnc gosterdigi yer degil.
 *
 * Rampa 1. dalgada mevcut egrinin `EARLY_WAVE_HP_RATIO` katindan basliyor ve
 * hizlanarak `EARLY_WAVE_CONVERGENCE_WAVE` dalgasinda mevcut egriye tam olarak
 * oturuyor. O dalgadan sonrasi hic degismiyor.
 *
 * Referans olarak seviye 1 Hiza Emri ilk uc dalgada normal dusmani tek,
 * zirhliyi iki vurusta oldrmeli; `wave-balance` testi bunu sabitliyor. Tek bir
 * geometrik egri bu sarti tutturamiyor -- 10. dalgaya yetismek icin gereken hiz
 * 3. dalgayi zaten bandin disina tasiyor -- bu yuzden rampa ussel bir hizlanma
 * tasiyor.
 */
export const EARLY_WAVE_HP_RATIO = 0.43;
export const EARLY_WAVE_RAMP_EXPONENT = 2.3;
export const EARLY_WAVE_CONVERGENCE_WAVE = 10;

export function getWaveHpMultiplier(wave: number) {
  const safeWave = Math.max(1, wave);
  const fullCurve = ENEMY_HP_WAVE_MULTIPLIER ** (safeWave - 1);
  if (safeWave >= EARLY_WAVE_CONVERGENCE_WAVE) {
    return fullCurve;
  }

  const convergence = ENEMY_HP_WAVE_MULTIPLIER ** (EARLY_WAVE_CONVERGENCE_WAVE - 1);
  const progress = (safeWave - 1) / (EARLY_WAVE_CONVERGENCE_WAVE - 1);
  return EARLY_WAVE_HP_RATIO * (convergence / EARLY_WAVE_HP_RATIO) ** (progress ** EARLY_WAVE_RAMP_EXPONENT);
}

export function getWaveEnemyMaxHp(baseHp: number, wave: number, healthMultiplier = 1) {
  return Math.max(1, Math.round(baseHp * getWaveHpMultiplier(wave) * healthMultiplier * ENEMY_HP_BALANCE_MULTIPLIER));
}

export function getWaveCompletionGold(completedWave: number) {
  return 20 + (completedWave + 1) * 3;
}
