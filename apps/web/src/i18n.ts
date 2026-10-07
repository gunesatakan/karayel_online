import { setSharedLocale } from "@karayel/shared";
import { en } from "./locales/en";
import { tr, type MessageKey } from "./locales/tr";

/**
 * Arayuz dili: Turkce ve Ingilizce. Kayitli secim yoksa tarayici dili
 * Turkceyse Turkce, degilse Ingilizce (`resolveInitialLocale`).
 *
 * Metinler anahtarla (`t("hud.continue")`) okunuyor; Turkce sozluk kaynak,
 * anahtarlarin tamami orada. Ingilizcede eksik anahtar Turkceye dusuyor:
 * yarim ceviri ekranda bos kalmasin. `{ad}` yer tutuculari parametreyle
 * doluyor.
 *
 * Secim cihazda (`localStorage`); depolama kapaliysa (itch iframe'i, gizli
 * pencere) bu oturum icin gecerli. Degisince `karayel:locale` olayi gidiyor,
 * kendini yeniden cizen arayuz onu dinliyor.
 */

export type Locale = "tr" | "en";
export type { MessageKey };

export const LOCALES: readonly Locale[] = ["tr", "en"];
export const LOCALE_STORAGE_KEY = "uzay_locale";

const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { tr, en };

let current: Locale = readInitialLocale();
// Paylasilan metin ureticileri (rapor, karne, bildirim) ayni dilde yazsin.
setSharedLocale(current);
// Sayfa dili de ilk boyamadan once secili dilden (index.html "tr" ile geliyor).
try {
  if (typeof document !== "undefined") document.documentElement.lang = current;
} catch {
  // Belge yok (node): yapacak bir sey yok.
}

/**
 * Ilk dil: kayitli secim her zaman kazanir. Secim yoksa tarayicinin ilk
 * tercih ettigi dil: Turkce ("tr", "tr-TR") ise Turkce, baska her dil ya da
 * bilinmiyorsa Ingilizce.
 */
export function resolveInitialLocale(stored: string | null | undefined, languages: readonly (string | null | undefined)[]): Locale {
  if (stored === "en" || stored === "tr") return stored;
  const preferred = languages.find((language) => typeof language === "string" && language.trim().length > 0);
  return preferred && /^tr(?:[-_]|$)/i.test(preferred.trim()) ? "tr" : "en";
}

function readInitialLocale(): Locale {
  return resolveInitialLocale(readStoredChoice(), readBrowserLanguages());
}

function readStoredChoice(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Depolama kapali (itch iframe'i, gizli pencere): secim yok sayilir.
    return null;
  }
}

/** Tarayicinin dil tercihleri, onem sirasiyla; okunamazsa bos liste. */
function readBrowserLanguages(): readonly string[] {
  try {
    if (typeof navigator === "undefined") return [];
    const list = Array.isArray(navigator.languages) ? navigator.languages : [];
    return list.length > 0 ? list : [navigator.language];
  } catch {
    return [];
  }
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale) {
  if (!LOCALES.includes(next) || next === current) return;
  current = next;
  setSharedLocale(next);
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Depolama kapali: secim bu oturumda kalir.
  }
  document.documentElement.lang = next;
  window.dispatchEvent(new CustomEvent("karayel:locale", { detail: next }));
}

/** Dil degisince cagrilir; birakma fonksiyonu doner. */
export function onLocaleChange(listener: (locale: Locale) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<Locale>).detail);
  window.addEventListener("karayel:locale", handler);
  return () => window.removeEventListener("karayel:locale", handler);
}

export type MessageParams = Readonly<Record<string, string | number>>;

/** Anahtarin o anki dildeki metni; Ingilizcede yoksa Turkcesi. */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = dictionaries[current][key] ?? tr[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * Calisma aninda kurulan anahtar (`sheet.status.${tur}`); sozlukte yoksa
 * `undefined`, cagiran kendi yedegine dusuyor.
 */
export function tMaybe(key: string, params?: MessageParams): string | undefined {
  return key in tr ? t(key as MessageKey, params) : undefined;
}

/** Kucuk harf dile gore. */
export function lower(text: string) {
  return text.toLocaleLowerCase(current === "tr" ? "tr-TR" : "en-US");
}

/** Buyuk harf dile gore: Turkcede "i" -> "İ", Ingilizcede "I". */
export function upper(text: string) {
  return text.toLocaleUpperCase(current === "tr" ? "tr-TR" : "en-US");
}

/** Sayi bicimi dile gore (Turkcede ondalik virgul). */
export function numberLocale() {
  return current === "tr" ? "tr-TR" : "en-US";
}

/** Testler icin: depoya yazmadan ve olay atmadan dili degistirir. */
export function setLocaleForTest(next: Locale) {
  current = next;
  setSharedLocale(next);
}
