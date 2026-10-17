/**
 * Yalnizca gorunus olcekleri: oyun kurali, carpisma, menzil, izgara izi ve
 * dokunma alanlari bunlari okumuyor.
 *
 * Sahibin istegi (2026-10): "Tum kulelerin ve mermilerin boyutunu %20
 * kucult. Duvarlar ayni kalsin." ve "Isciler de %10 kuculsun."
 *
 * - `TOWER_BODY_VISUAL_SCALE`: kule govdesi (sprite, golge, seviye halkasi,
 *   tac, govdeye yapisik isaretler: can cubugu, seviye yazisi, yukseltme
 *   isareti, seri parlamasi, alev, nabiz). Kenar yapilari (duvar, Abarti)
 *   disinda: cizim boyu etki dikdortgeniyle ayni (`getTowerBodyVisualScale`).
 * - `PROJECTILE_VISUAL_SCALE`: kule mermilerinin govdesi, izi ve isi damgasi
 *   (attack-vfx) ve mermi gibi ucan iki isin atisinin kalinligi. Patlama ve
 *   alan halkalari oyun yaricapini gosterdigi icin olceklenmiyor; surekli
 *   lazerler ve bant genisligini gosteren isinlar (Ayna mizragi) de ayni.
 * - `WORKER_VISUAL_SCALE`: lojistik iscilerin govdesi (sprite, gelismis besgen,
 *   can cubugu). Yol, temas yaricapi ve isci secme alani ayni. Operator
 *   bedenleri bundan bagimsiz: mutlak boylari degismiyor (operator-bodies).
 */
export const TOWER_BODY_VISUAL_SCALE = 0.8;
export const PROJECTILE_VISUAL_SCALE = 0.8;
export const WORKER_VISUAL_SCALE = 0.9;
