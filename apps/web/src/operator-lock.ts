import { characters, isPlayableCharacterId, type CharacterDefinition, type CharacterId } from "@karayel/shared";
import { t } from "./i18n";

/**
 * Operator kilidi (menu-ui.ts).
 *
 * Oynanabilir operatorler `PLAYABLE_CHARACTER_IDS` (paylasilan). Digerleri
 * kadroda gorunuyor ama kilitli: soluk, kilit isaretli, secilemiyor; uzerine
 * gelince (`title`) ve dokununca (menunun alt notu) "Geliştirme aşamasında".
 * Ekran okuyucu icin `aria-disabled` ve `aria-describedby` (menu kabugundaki
 * gizli `#operator-locked-desc`).
 */
export const OPERATOR_LOCKED_DESC_ID = "operator-locked-desc";

export function isPlayableOperator(characterId: CharacterId) {
  return isPlayableCharacterId(characterId);
}

/** Menunun varsayilan operatoru: kadronun ilk oynanabilir operatoru (ZentaX). */
export function getDefaultOperator(): CharacterDefinition {
  return characters.find((character) => isPlayableOperator(character.id)) ?? characters[0];
}

/** Kayittan/nottan gelen kimlik: oynanabiliyorsa o operator, degilse varsayilan. */
export function resolvePlayableOperator(characterId: unknown): CharacterDefinition {
  const character = characters.find((candidate) => candidate.id === characterId);
  return character && isPlayableOperator(character.id) ? character : getDefaultOperator();
}

/** Kilitli operator dugmesinin ortak nitelikleri: kilit isareti, erisilebilir durum, aciklama ve ipucu. */
export function lockedOperatorAttributes(characterId: CharacterId) {
  if (isPlayableOperator(characterId)) return "";
  const hint = escapeAttribute(t("menu.operator.locked"));
  return ` data-operator-locked aria-disabled="true" aria-describedby="${OPERATOR_LOCKED_DESC_ID}" title="${hint}"`;
}

/** Kilit isareti: ince cizgili asma kilit plakasi, parilti yok. */
export function renderOperatorLock(characterId: CharacterId) {
  if (isPlayableOperator(characterId)) return "";
  return `<i class="operator-lock" aria-hidden="true"><svg viewBox="0 0 12 12" focusable="false"><path d="M3.8 5.5V4a2.2 2.2 0 0 1 4.4 0v1.5" /><rect x="2.4" y="5.5" width="7.2" height="5" /><path d="M6 7.4v1.2" /></svg></i>`;
}

/** Menu kabugundaki gizli aciklama; kilitli dugmeler `aria-describedby` ile buna bagli. */
export function renderOperatorLockDescription() {
  return `<span id="${OPERATOR_LOCKED_DESC_ID}" hidden>${escapeAttribute(t("menu.operator.locked"))}</span>`;
}

/** Dokunus notunun metni: operator adiyla, ad bilinmiyorsa yalniz durum. */
export function getLockedOperatorNote(characterId: string | undefined) {
  const character = characters.find((candidate) => candidate.id === characterId);
  return character ? t("menu.operator.lockedNote", { name: character.displayName }) : t("menu.operator.locked");
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
