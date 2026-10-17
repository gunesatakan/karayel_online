// Muhimmat adlari ve ust cubugun deneyimi testi icin tek paket: dil secimi,
// katalog cevirisi ve adi okuyan moduller ayni i18n kopyasini paylassin.
export * from "../../apps/web/src/i18n";
export { installCatalogLocale } from "../../apps/web/src/catalog-locale";
export { AMMO_TYPE_ORDER, ammoTypeLabels } from "../../apps/web/src/codex";
export { formatTransportProduct, getWorkerProductOptions } from "../../apps/web/src/worker-roster";
export { describeTowerAmmo } from "../../apps/web/src/tower-ammo";
export { getTutorialCopy } from "../../apps/web/src/tutorial";
export { formatHudCompactNumber } from "../../apps/web/src/game-control-ui";
export { enAmmoTypeLabels } from "../../apps/web/src/locales/catalog/en-progression";
export { tr } from "../../apps/web/src/locales/tr";
export { en } from "../../apps/web/src/locales/en";
export { RESOURCE_NAMES, RESOURCE_NAMES_EN, towerCatalog, getTowerAmmoUsage } from "@karayel/shared";
