import type { CharacterId } from "../index.js";

/**
 * Su an oynanabilen operatorler.
 *
 * Kadrodaki yedi operatorun hepsi menude gorunuyor, ama yalnizca bunlar
 * secilip maca goturulebiliyor; digerleri "Gelistirme asamasinda" kilidinde.
 * Istemci kilidi cizerken, sunucu da gelen karakter kimligini zorlarken
 * (`MatchRoom.playableCharacterIds`) bu listeye bakiyor.
 */
export const PLAYABLE_CHARACTER_IDS: readonly CharacterId[] = ["warrior", "zeynep"];

/** Sunucunun kilitli ya da bilinmeyen kimligi cevirdigi operator (AttackLord). */
export const FALLBACK_PLAYABLE_CHARACTER_ID: CharacterId = "warrior";

export function isPlayableCharacterId(value: unknown, playable: readonly CharacterId[] = PLAYABLE_CHARACTER_IDS): value is CharacterId {
  return typeof value === "string" && (playable as readonly string[]).includes(value);
}

/**
 * Oynanabilir kimlik: oynanabiliyorsa kendisi, degilse yedek. Yedek listede
 * yoksa listenin ilki (testler listeyi daraltip genisletebiliyor).
 */
export function resolvePlayableCharacterId(
  value: unknown,
  fallback: CharacterId = FALLBACK_PLAYABLE_CHARACTER_ID,
  playable: readonly CharacterId[] = PLAYABLE_CHARACTER_IDS
): CharacterId {
  if (isPlayableCharacterId(value, playable)) return value;
  if (playable.includes(fallback)) return fallback;
  return playable[0] ?? fallback;
}
