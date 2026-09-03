export const FINAL_WAVE = 20;
export const BASE_WAVE_ENEMY_COUNT = 10;

/**
 * Bir oyuncunun ayni anda ayakta tutabilecegi savas kulesi sayisi.
 *
 * Duvarlar buraya sayilmaz (`occupiesTowerSlot`); kontenjan hangi on bes kuleyi
 * kuracagina dair karar icin var, zemin araclarini kisitlamak icin degil.
 *
 * Deger burada duruyor cunku iki yer birden okuyor: sunucu sinirlamayi
 * uyguluyor, `tools/simulate.mjs` ise bot ayni kontenjanla oynamazsa olctugu
 * zafer orani gercek oyunun orani olmuyor. Ikisi ayri sabit tasidigi surece
 * denge olcumu sessizce yanlis dayanaga oturuyordu.
 */
export const PLAYER_TOWER_LIMIT = 15;
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
 * - Duvarlar simulatore eklendi: bot artik duvar kurup onariyor ve kazandigi
 *   ates suresi olcume giriyor.
 * - Kule kontenjani 10'dan (Zeynep 12) herkes icin 15'e cikti. Tek basina en
 *   sert sicrama bu oldu: 1.87'de zafer orani %6'dan %27'ye firladi.
 *
 * Deger tek tek tahmin edilmez, `tools/simulate.mjs` ile %5-%10 zafer bandina
 * gore olculur. Oyuncu tarafinda guc degistiren her degisiklikten sonra yeniden
 * olculmesi gerekir.
 *
 * Egri bu civarda cok dik: 2.11 -> %9, 2.15 -> %5, 2.2 -> %4. Tek bir 100
 * kosumluk olcum bu diklikte gurultulu kaldigi icin deger dort ayri ornekle
 * secildi (100/seed1000, 300/seed1000, 200/seed7, 200/seed42):
 *
 *   2.12 -> %8.0 %10.3 %8.5 %10.0   (iki ornek bandin ustunde)
 *   2.13 -> %8.0  %9.7 %8.0  %9.5   (hepsi bantta)
 *   2.14 -> %6.0  %9.0 %7.5  %9.0   (hepsi bantta)
 *
 * 2.13 seciliyor: testin olctugu yapilandirmayi bandin ortasina koyuyor.
 */
export const PLAYER_POWER_COMPENSATION = 2.13;
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
/*
 * Deger telafi carpaniyla birlikte hareket etmek zorunda. Erken dalga cani
 * `EARLY_WAVE_HP_RATIO * ENEMY_HP_BALANCE_MULTIPLIER` carpimindan cikiyor;
 * kontenjan 15'e cikip telafi 1.87'den 2.13'e alininca bu carpim %14 buyudu ve
 * zirhli dusman ilk dalgalarda iki yerine uc vurus istemeye basladi. Oran ayni
 * anda 1.87/2.13 ile kisildi, boylece ilk dalgalarin mutlak cani yerinde kaldi;
 * 10. dalgadaki yakinsama noktasi degismedigi icin gec oyunun zorlugu -- yani
 * zafer oraninin olculdugu yer -- etkilenmiyor.
 */
export const EARLY_WAVE_HP_RATIO = 0.3775;
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

/**
 * Yapi kirmada referans hasar hizi (saniyede).
 *
 * Dusman saldirisi dalgayla olceklenmiyor (her tip 12 hasar, 850ms arayla),
 * yani bir yapinin ne kadar dayandigi tek bir referans saldirganla dogru
 * hesaplanabiliyor. Denge simulatoru duvarin kazandirdigi sureyi bununla olcer.
 */
export const REFERENCE_STRUCTURE_BREAK_DPS = 12 / 0.85;

/**
 * Onarim, yeniden insadan ucuz olmali.
 *
 * Yikilan duvar kendiliginden geri gelmez; oyuncu ya yeniden insa eder ya da
 * yikilmadan once onarir. Onarimin ucuz olmasi dalga arasi bakimi anlamli bir
 * karar yapar: duvari ayakta tutmak, dusmesini bekleyip yeniden dikmekten
 * kazancli olsun.
 */
export const STRUCTURE_REPAIR_COST_RATIO = 0.6;

/** Eksik cani kapatmanin altin bedeli. Yikilmis yapi onarilamaz. */
export function getStructureRepairCost(buildCost: number, missingHealthRatio: number) {
  const ratio = Math.max(0, Math.min(1, missingHealthRatio));
  return Math.ceil(buildCost * STRUCTURE_REPAIR_COST_RATIO * ratio);
}

/**
 * Gedik esigi: yapinin cani bu oranin altina dustugunde sunucu olay yayar.
 *
 * Sistemin asil degeri oyuncuyu dalga sirasinda mudahaleye zorlamasi. Gedigin
 * nerede acildigini oyuncunun kendi gozuyle yakalamasini beklemek, haritanin
 * obur ucuna bakan oyuncu icin gecikmis bir uyari demek.
 */
export const STRUCTURE_BREACH_HEALTH_RATIO = 0.3;

/**
 * Kusatma dusmaninin yapilara verdigi hasar carpani.
 *
 * Duvar ormeyi her derde deva olmaktan cikaran sey bu. Yeterince yuksek olmali
 * ki kalin bir hat kusatma karsisinda erisin, ama kusatmanin cani dusuk oldugu
 * icin arkasina ates gucu koyan oyuncu yine kazansin.
 */
export const SIEGE_STRUCTURE_DAMAGE_MULTIPLIER = 4;

/** Kusatma dusmaninin dalgalarda gorunmeye basladigi nokta ve orani. */
export const SIEGE_FIRST_WAVE = 4;
export const SIEGE_SPAWN_RATIO = 0.18;

/**
 * Zeynep ultisi: secilen sutunda patlayan isik.
 *
 * Hasar sabit bir sayi degil, "kac grunt canlik" olarak yaziliyor. Sabit hasarli
 * bir ulti dalga 3'te haritayi siliyor, dalga 20'de hicbir sey yapmiyordu --
 * dusman cani dalgayla katlanirken ulti yerinde saydigi icin. Dusmanla ayni
 * egriden olculunce ultinin agirligi her dalgada ayni kaliyor.
 */
export const ZEYNEP_COLUMN_ULTIMATE_GRUNT_EQUIVALENT = 3;

/** Isik patlamasinin sutundaki dusmanlari yavaslattigi sure. */
export const ZEYNEP_COLUMN_ULTIMATE_SLOW_MS = 700;

/** Patlamanin ekranda kaldigi sure. */
export const ZEYNEP_COLUMN_ULTIMATE_BEAM_MS = 620;

/**
 * Taht Muhru sentez carpanlari.
 *
 * Muhrun kendi hasari yok; ne kadar vurdugu tamamen yanindaki iki kuleden
 * geliyor. Uc kombinasyon da ayni taban hasari okudugu icin taban degeri
 * yukseltmek hepsini birden buyutur, bu carpanlar ise kombinasyonlari
 * birbirinden ayirir.
 */

/** Gosteri + Gosteri: yanan hat kulenin menzilinden daha uzaga uzanir. */
export const ZEYNEP_BURN_SYNTHESIS_RANGE_MULTIPLIER = 1.5;

/** Gosteri + Hiza: seken isin her dusmani bir kez vurdugu icin agir vurur. */
export const ZEYNEP_RAY_SYNTHESIS_DAMAGE_MULTIPLIER = 2;

/**
 * Seken isinin govde uzunlugu.
 *
 * Kare olcusune bagli, cunku orantiyi belirleyen sey haritanin kendisi: sabit
 * 92 piksel kulenin menzilinden bile uzun bir cubuk cizip ekrani doldurmustu.
 */
export const ZEYNEP_RAY_SYNTHESIS_LENGTH_CELLS = 1.4;
