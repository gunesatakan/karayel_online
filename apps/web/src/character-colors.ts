import type { CharacterId } from "@karayel/shared";

/**
 * Karakterin sinif rengi.
 *
 * Once yalnizca menudeydi (secim kartlari, lobi). Oyunda takim arkadasinin
 * seri toast'u da bu renkle geliyor: oyuncu lobide gordugu rengi mac icinde
 * ayni kisiyle eslestirebilsin. Tek kaynak, iki ekran ayri renk soylemesin.
 */
export const CHARACTER_CLASS_COLORS: Record<CharacterId, string> = {
  zeynep: "#ec4899",
  warrior: "#22c55e",
  archer: "#38bdf8",
  mage: "#a78bfa",
  healer: "#f9a8d4",
  tank: "#facc15",
  onur: "#14b8a6"
};

/** Karakteri bilinmeyen oyuncu (ayrilmis, henuz snapshot yok): notr gri. */
const UNKNOWN_CLASS_COLOR = "#94a3b8";

/** Sinif rengi css olarak; karakter bilinmiyorsa notr gri. */
export function getCharacterColorCss(characterId?: string) {
  return (characterId && CHARACTER_CLASS_COLORS[characterId as CharacterId]) || UNKNOWN_CLASS_COLOR;
}

/** Ayni renk Phaser Graphics icin sayi olarak (ulti sok dalgasi). */
export function getCharacterColorValue(characterId?: string) {
  return Number.parseInt(getCharacterColorCss(characterId).slice(1), 16);
}
