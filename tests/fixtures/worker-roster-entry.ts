// Isci kadrosu testi icin tek paket: kadro mantigi, dil secimi, katalogun
// Ingilizcesi ve brifing ayni i18n kopyasini paylassin (her `importWebModule`
// kendi kopyasini paketliyor).
export * from "../../apps/web/src/worker-roster";
export { setLocaleForTest } from "../../apps/web/src/i18n";
export { installCatalogLocale } from "../../apps/web/src/catalog-locale";
export { TUTORIAL_WORKER_TARGETS, getTutorialCopy, getTutorialWorkerStage } from "../../apps/web/src/tutorial";
export { tr } from "../../apps/web/src/locales/tr";
export { en } from "../../apps/web/src/locales/en";
