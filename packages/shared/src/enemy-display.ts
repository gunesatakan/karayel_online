/**
 * Dusmanin ekrandaki govdesi ve isabet kutusu: ikisi ayni kaynaktan.
 *
 * Sahibin karari (2026-10): "Hitbox, gorunen govde ile ayni olmali." Istemci
 * dusmani bu tablolarla ciziyor (GameScene); sunucunun butun vurus
 * hesaplari ve istemcinin isin / dalga secimi (zeynep-signatures) govdeyi
 * ayni fonksiyonlardan aliyor (`enemy-body`). Cizimle vurus ayri yazilsaydi
 * biri digerinden kayardi: eski tur yaricapi (19 / 13 / 15 x 0,675) irki,
 * sampiyonu, havayi ve ruh cekicisini hic bilmiyordu.
 *
 * Cizilen kare kenari = taban boy (tur, irk, ozel) x govde olcegi (sampiyon,
 * ruh cekici) x bombacinin gorsel olcegi x havada 1,28. Govde = kenarin
 * yarisi x dokunun gorunen govdesinin dis bukey cokgeni (`ENEMY_BODY_OUTLINES`,
 * PNG'lerden uretilmis; yontem `tools/measure-enemy-hitboxes.mjs`), yuruyus
 * yonune donuk.
 *
 * Havadaki 1,28 bir derinlik ipucu degil, ekrandaki gercek boy: ucan
 * dusmanin yerde golgesi ya da ikinci bir izi yok, mermiler onunla ayni
 * duzlemde ciziliyor. Oyuncunun gordugu tek govde bu buyuk govde; mermi
 * onun dis halkasindan gecip vurmasaydi "icinden gecti" diye okunurdu.
 *
 * Yalnizca gorsel olan iki sey disarida: Zeynep'in yavaslatma nabzi
 * (+/-%5, istemcinin kendi saatiyle; ortalamasi sifir, sunucu evresini
 * bilmiyor) ve vurus itmesi (1-2 px, kozmetik). Govdenin cevresine cizilen
 * katmanlar da (kalkan halesi, buz kabugu, taslasma zirhi) govde degil.
 */
import type { EnemyRace } from "./combat.js";
import type { EnemyType } from "./index.js";
import { TOWER_GRID_SIZE } from "./index.js";
import { CHAMPION_SPRITE_SCALE } from "./balance/champion.js";
import { getSoulDrawerMultipliers } from "./races/race-mechanics.js";
import { ENEMY_BOMBER_ART_SCALE, type EnemyHitboxArt, type EnemyHitboxTextureKey } from "./enemy-hitboxes.js";

/**
 * Dusman boyutunun olcegi: ekrandaki taban cap bununla carpiliyor. Isabet
 * govdesi cizilen kareden (`enemy-body`); ikisi birlikte kuculur.
 */
export const ENEMY_SIZE_SCALE = 0.675;

/**
 * Dusman turunun ekrandaki taban capi (TOWER_GRID_SIZE karesinde, olcekten
 * once). Kusatma kocu brute dokusunu kullaniyor; boyu araya oturuyor ki
 * silueti brute ile karistirilmasin.
 */
export const ENEMY_DISPLAY_SIZE: Readonly<Record<EnemyType, number>> = {
  grunt: 34,
  siege: 38,
  brute: 43.2,
  runner: 40,
  shooter: 38
};

/** Tabloda olmayan tur (eski ya da bozuk kayit): piyade boyu. */
const ENEMY_DISPLAY_FALLBACK = 34;

/**
 * Brute dokusu bazi irklarda kendi karesinde kucuk duruyor; govde o irkta
 * bu kadar buyuk ciziliyor. Yalnizca `brute` turu: kusatma kocu ayni dokuyu
 * kendi boyunda kullaniyor.
 */
export const ENEMY_BRUTE_RACE_SCALE: Readonly<Partial<Record<EnemyRace, number>>> = {
  spaceBug: 1.3,
  fallen: 1.1
};

/** Ucan dusmanin govdesi: yerdekinden 1,28 kat (ust bas notunda neden gercek boy). */
export const AIR_ENEMY_DISPLAY_SCALE = 1.28;

/**
 * Govdenin boyunu belirleyen alanlar. Istemcinin dusman kaydi (`EnemySnapshot`)
 * dogrudan uyuyor; sunucu kendi modelinden ayni alanlari veriyor. `ds` ruh
 * cekicinin yigini (telde ayni ad).
 */
export type EnemyBodyView = {
  race: EnemyRace;
  type: string;
  special?: string;
  champion?: unknown;
  movementKind?: string;
  ds?: number;
};

/**
 * Dokunun govde turu. Hasatci ve bombaci kendi dokularinda; kusatma kocunun
 * dokusu yok, brute siluetini kullaniyor; avci, isitici ve yiyici kendi
 * turlerinin dokusunda.
 */
export function getEnemyArt(type: string, special?: string): EnemyHitboxArt {
  if (special === "harvester") return "harvester";
  if (special === "bomber") return "bomber";
  if (type === "siege") return "brute";
  return type === "brute" || type === "runner" || type === "shooter" ? type : "grunt";
}

/** Dokunun anahtari (PreloaderScene'in yukledigi ad). Meka'nin savas dokularinda irk oneki yok. */
export function getEnemyTextureKey(enemy: Pick<EnemyBodyView, "race" | "type" | "special">): EnemyHitboxTextureKey {
  const art = getEnemyArt(enemy.type, enemy.special);
  if (art === "harvester" || art === "bomber") return `enemy-${enemy.race}-${art}` as EnemyHitboxTextureKey;
  return (enemy.race === "meka" ? `enemy-${art}` : `enemy-${enemy.race}-${art}`) as EnemyHitboxTextureKey;
}

/**
 * Dusmanin taban cizim boyu (sampiyon, ruh cekici, bombaci ve hava olcegi
 * haric). Hasatci brute dayanikliliginda ama piyade boyunda ciziliyor.
 */
export function getEnemySpriteDisplaySize(enemy: Pick<EnemyBodyView, "race" | "type" | "special">, cellSize: number) {
  const mapScale = cellSize / TOWER_GRID_SIZE;
  if (enemy.special === "harvester") return ENEMY_DISPLAY_SIZE.grunt * ENEMY_SIZE_SCALE * mapScale;
  const base = ENEMY_DISPLAY_SIZE[enemy.type as EnemyType] ?? ENEMY_DISPLAY_FALLBACK;
  const raceMultiplier = enemy.type === "brute" ? ENEMY_BRUTE_RACE_SCALE[enemy.race] ?? 1 : 1;
  return base * raceMultiplier * ENEMY_SIZE_SCALE * mapScale;
}

/**
 * Govde olcegi: sampiyon ceyrek buyuk (kalabalikta ilk bakista secilsin),
 * ruh cekici yigin basina %6. Govde, hale ve can cubugu birlikte buyuyor.
 */
export function getEnemyBodyScale(enemy: Pick<EnemyBodyView, "champion" | "ds">) {
  const drawer = enemy.ds && enemy.ds > 0 ? getSoulDrawerMultipliers(enemy.ds).size : 1;
  return (enemy.champion ? CHAMPION_SPRITE_SCALE : 1) * drawer;
}

/**
 * Bombacinin dokusu kendi karesini piyadeden farkli dolduruyor: gorunen
 * uzun kenari irkin piyadesine esitleyen olcek (uretilmis tablo). Yalnizca
 * dokunun boyu; can cubugu ve isaretler taban boyda.
 */
export function getEnemyArtScale(enemy: Pick<EnemyBodyView, "race" | "special">) {
  return enemy.special === "bomber" ? ENEMY_BOMBER_ART_SCALE[enemy.race] ?? 1 : 1;
}

export function getEnemyAirScale(enemy: Pick<EnemyBodyView, "movementKind">) {
  return enemy.movementKind === "air" ? AIR_ENEMY_DISPLAY_SCALE : 1;
}

/**
 * Cizilen doku karesinin kenari (dunya birimi): 512'lik doku bu boya
 * olceklenip merkezinden ciziliyor. Yavaslatma nabzi haric (ust bas notu).
 */
export function getEnemyDrawnSide(enemy: EnemyBodyView, cellSize: number) {
  return getEnemySpriteDisplaySize(enemy, cellSize) * getEnemyBodyScale(enemy) * getEnemyArtScale(enemy) * getEnemyAirScale(enemy);
}
