// i18n testi icin tek paket: dil secimi ve onu okuyan moduller ayni i18n
// kopyasini paylassin (her `importWebModule` kendi kopyasini paketliyor).
export * from "../../apps/web/src/i18n";
export { buildTowerSheetModel } from "../../apps/web/src/tower-sheet";
export { getTutorialCopy, TUTORIAL_STEPS } from "../../apps/web/src/tutorial";
export { tr } from "../../apps/web/src/locales/tr";
export { en } from "../../apps/web/src/locales/en";
export { installCatalogLocale, listMissingCatalogTranslations } from "../../apps/web/src/catalog-locale";
export { damageTypeCodex, cardRarityLabels } from "../../apps/web/src/codex";
export * from "../../apps/web/src/server-text";
export { defenseSummaryLines } from "../../apps/web/src/defense-ui";
export { enTowers } from "../../apps/web/src/locales/catalog/en-units";
export { enActivityLabels } from "../../apps/web/src/locales/catalog/en-progression";
export { SERVER_TEXT, activityLabels } from "@karayel/shared";
export { getCardDefinition, getShopItem, towerCatalog, characters, stageCatalog, WORKER_ROLE_LABELS, BADGE_CATALOG, TITLE_CATALOG } from "@karayel/shared";
export { buildWaveReportCard } from "@karayel/shared";
