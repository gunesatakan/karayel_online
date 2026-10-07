import { setSharedLocale } from "@karayel/shared";
import { en } from "./locales/en";
import { tr, type MessageKey } from "./locales/tr";

/**
 * Arayuz dili: Turkce (varsayilan) ve Ingilizce.
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

let current: Locale = readStoredLocale();
// Paylasilan metin ureticileri (rapor, karne, bildirim) ayni dilde yazsin.
setSharedLocale(current);

function readStoredLocale(): Locale {
  try {
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === "en" || stored === "tr" ? stored : "tr";
  } catch {
    return "tr";
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
