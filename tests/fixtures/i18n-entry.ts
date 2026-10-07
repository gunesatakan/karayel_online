// i18n testi icin tek paket: dil secimi ve onu okuyan moduller ayni i18n
// kopyasini paylassin (her `importWebModule` kendi kopyasini paketliyor).
export * from "../../apps/web/src/i18n";
export { buildTowerSheetModel } from "../../apps/web/src/tower-sheet";
export { getTutorialCopy, TUTORIAL_STEPS } from "../../apps/web/src/tutorial";
export { tr } from "../../apps/web/src/locales/tr";
export { en } from "../../apps/web/src/locales/en";
export { installCatalogLocale, listMissingCatalogTranslations } from "../../apps/web/src/catalog-locale";
export { damageTypeCodex, cardRarityLabels } from "../../apps/web/src/codex";
export { getCardDefinition, getShopItem, towerCatalog, characters, stageCatalog, WORKER_ROLE_LABELS, BADGE_CATALOG, TITLE_CATALOG } from "@karayel/shared";
