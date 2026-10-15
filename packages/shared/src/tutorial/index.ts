/**
 * Ogretici asamasi (Eğitim): sunucu ve istemcinin ortak sozlugu.
 *
 * Ogretici ayri bir mac kipi: dogrudan baslatilan tek kisilik odada
 * (`autoStart`) `tutorial` bayragiyla aciliyor. Nexus olmuyor, dusmanlar tek
 * tuk ve cok yavas geliyor, dalga sayaci ilerlemiyor; mac yalnizca istemcinin
 * adim motoru bitince (`tutorial:complete`) zaferle kapaniyor. Kosu hicbir
 * ilerleme yazmiyor (yaratici kosuyla ayni kapilar).
 *
 * Adimlar oyuncunun yaptigiyla geciyor. Sunucu izlenen mesajlarin gercekten
 * is yapip yapmadigini kendisi olcuyor ve yalnizca o zaman
 * `tutorial:progress` yolluyor: reddedilen istek (yetmeyen altin, gecersiz
 * kare) adimi gecirmiyor.
 */

/** Adimlarin bekledigi eylemler; sunucunun `tutorial:progress` mesajindaki ad. */
export type TutorialActionId =
  | "build"
  | "upgrade"
  | "settings"
  | "hire"
  | "specialize"
  | "assign"
  | "production"
  | "repair"
  | "workerTree"
  | "card"
  | "shop"
  | "skill"
  | "ultimate";

/**
 * Izlenen istemci mesajlari ve sayildiklari eylem. Kule ayarlarinin bes
 * kolu (hedefleme, performans, muhimmat akisi, oncelik, bekleme) tek eylem.
 */
export const TUTORIAL_TRACKED_MESSAGES: Readonly<Record<string, TutorialActionId>> = {
  placeTower: "build",
  "wall:line": "build",
  upgradeTower: "upgrade",
  "tower:targeting": "settings",
  setTowerPerformance: "settings",
  toggleAmmoLogistics: "settings",
  "tower:priority": "settings",
  setTowerMode: "settings",
  "worker:hire": "hire",
  "worker:specialization": "specialize",
  "worker:assign": "assign",
  "factory:production": "production",
  "structure:repair": "repair",
  "worker:development": "workerTree",
  "card:choose": "card",
  "shop:buy": "shop",
  useSkill: "skill",
  useUltimate: "ultimate"
};

/** Sunucudan istemciye: izlenen bir eylem gercekten oldu. */
export type TutorialProgressMessage = {
  action: TutorialActionId;
  /** `build`: bu istekle kurulan yapilarin tanim kimlikleri. */
  definitionIds?: string[];
  /** `hire` / `specialize` / `assign`: iscinin rolu (biliniyorsa). */
  role?: string;
};

/**
 * Adim basinda istemcinin istedigi hazirlik (`tutorial:prepare`).
 *
 * - `resources`: altin ve tecrube tabana cekiliyor (her hazirlik bunu da yapar).
 * - `cards`: kart eli aciliyor.
 * - `shop`: magaza vitrini aciliyor.
 * - `skill`: becerilerin bekleme suresi sifir, ZentaX icin itibar dolu.
 * - `ultimate`: ulti sarji dolu.
 */
export const TUTORIAL_PREPARE_IDS = ["resources", "cards", "shop", "skill", "ultimate"] as const;
export type TutorialPrepareId = (typeof TUTORIAL_PREPARE_IDS)[number];

export function isTutorialPrepareId(value: unknown): value is TutorialPrepareId {
  return typeof value === "string" && (TUTORIAL_PREPARE_IDS as readonly string[]).includes(value);
}

/** Bir dalgada (dongude) dogan dusman sayisi. */
export const TUTORIAL_WAVE_ENEMY_COUNT = 2;
/** Iki dogum arasi; normal dalganin araliginin kat kat ustunde. */
export const TUTORIAL_SPAWN_INTERVAL_MS = 7000;
/** Dusman hizinin carpani: normal yuruyusun %35'i. */
export const TUTORIAL_ENEMY_SPEED_MULTIPLIER = 0.35;
/** Nexus'un inebilecegi en dusuk can: sizinti gorunur ama hic oldurmez. */
export const TUTORIAL_NEXUS_FLOOR = 1;
/** Baslangic ve her hazirlikta tabana cekilen altin. */
export const TUTORIAL_GOLD_FLOOR = 1500;
/** Baslangic ve her hazirlikta tabana cekilen tecrube (XP). */
export const TUTORIAL_EXPERIENCE_FLOOR = 400;
/** Beceri adiminda ZentaX'in itibari (en buyuk komut kademesi 80). */
export const TUTORIAL_REPUTATION = 100;
