// Kule paneli okunabilirlik testi icin tek paket: dil secimi, katalog cevirisi,
// panel modeli ve harita panelinin yerlesimi ayni i18n kopyasini paylassin.
export * from "../../apps/web/src/i18n";
export { buildTowerSheetModel, getTowerSheetStructureKey } from "../../apps/web/src/tower-sheet";
export { placeSelectedPanel, rectsOverlap, screenRatioRectToWorld } from "../../apps/web/src/selected-panel-placement";
export { installCatalogLocale } from "../../apps/web/src/catalog-locale";
export { ammoTypeLabels } from "../../apps/web/src/codex";
export { tr } from "../../apps/web/src/locales/tr";
export { en } from "../../apps/web/src/locales/en";
export { RESOURCE_NAMES, RESOURCE_NAMES_EN } from "@karayel/shared";
