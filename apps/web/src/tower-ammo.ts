import { getTowerAmmoUsage, type AmmoType, type TowerDefinition } from "@karayel/shared";
import { ammoTypeLabels } from "./codex";
import { t } from "./i18n";

/**
 * Kulenin hangi mühimmati yaktigi, oyuncunun okuyacagi dille.
 *
 * Tur sunucunun da okudugu `getTowerAmmoUsage`dan geliyor; burada yalnizca
 * metne ve isarete donusuyor. Ad katalogdan (`ammoTypeLabels`, dil degisince
 * yerinde cevriliyor), isaret rengi HUD'daki mühimmat rozetiyle ve
 * cephaneligin uretim secenekleriyle ayni: oyuncu kuleyle cephaneligi
 * renkten eslestirebilsin.
 */
export type TowerAmmoKey = AmmoType | "energy" | "none";

export type TowerAmmoDescription = { key: TowerAmmoKey; label: string };

export function describeTowerAmmo(definition: TowerDefinition): TowerAmmoDescription {
  const usage = getTowerAmmoUsage(definition);
  if (usage.kind === "ammo") return { key: usage.ammoType, label: ammoTypeLabels[usage.ammoType] };
  if (usage.kind === "energy") return { key: "energy", label: t("ammo.energy") };
  return { key: "none", label: t("ammo.none") };
}

/** Kucuk, keskin kenarli tur isareti; anlam metinde, isaret yalnizca eslestirme icin. */
export function makeAmmoMarker(key: TowerAmmoKey) {
  const marker = document.createElement("i");
  marker.className = `ammo-mark ammo-mark--${key}`;
  marker.setAttribute("aria-hidden", "true");
  return marker;
}
