/**
 * Gorunus olcekleri. Kule ve isci olcekleri yalnizca gorunus: oyun kurali,
 * carpisma, menzil, izgara izi ve dokunma alanlari onlari okumuyor. Mermi
 * ve dron olcegi artik isabeti de tasiyor: sahibin karari (2026-10) "Mermiler
 * de cizildigi kadar vurus yaricapina sahip olmali", yani sunucunun isabet
 * sekli cizilen govdenin kendisi; iki olcek bu yuzden paylasilan pakette
 * (`projectile-body`) ve buradan yeniden veriliyor.
 *
 * Sahibin istegi (2026-10): "Tum kulelerin ve mermilerin boyutunu %20
 * kucult. Duvarlar ayni kalsin." ve "Isciler de %10 kuculsun."
 *
 * - `TOWER_BODY_VISUAL_SCALE`: kule govdesi (sprite, golge, seviye halkasi,
 *   tac, govdeye yapisik isaretler: can cubugu, seviye yazisi, yukseltme
 *   isareti, seri parlamasi, alev, nabiz). Kenar yapilari (duvar, Abarti)
 *   disinda: cizim boyu etki dikdortgeniyle ayni (`getTowerBodyVisualScale`).
 * - `PROJECTILE_VISUAL_SCALE`: kule mermilerinin govdesi, izi ve isi damgasi
 *   (attack-vfx) ve mermi gibi ucan iki isin atisinin kalinligi. Govde
 *   isabet sekli oldugu icin carpisma da onunla kuculuyor. Patlama ve alan
 *   halkalari oyun yaricapini gosterdigi icin olceklenmiyor; surekli
 *   lazerler ve bant genisligini gosteren isinlar (Ayna mizragi) de ayni.
 * - `WORKER_VISUAL_SCALE`: lojistik iscilerin govdesi (sprite, gelismis besgen,
 *   can cubugu). Yol, temas yaricapi ve isci secme alani ayni. Operator
 *   bedenleri bundan bagimsiz: mutlak boylari degismiyor (operator-bodies).
 * - `ATAKAN_ULTIMATE_DRONE_VISUAL_SCALE`: AttackLord ultisinin dronlari
 *   (saldiri ve onarim). Sahibin istegi (2026-10): "dronlarin boyutunu 2/3
 *   yap". Hiz ve hedef sunucuda ayni; saldiri dronu cizilen govdesiyle vuruyor.
 */
export { ATAKAN_ULTIMATE_DRONE_VISUAL_SCALE, PROJECTILE_VISUAL_SCALE } from "@karayel/shared";
export const TOWER_BODY_VISUAL_SCALE = 0.8;
export const WORKER_VISUAL_SCALE = 0.9;
