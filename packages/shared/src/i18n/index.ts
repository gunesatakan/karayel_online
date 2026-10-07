/**
 * Paylasilan metin ureticilerinin dili (mac raporu, dalga karnesi, nisan ve
 * kozmetik bildirimleri, geri bildirim metinleri).
 *
 * Metinler yerinde cift olarak duruyor: `lt("Dalga Ödülü", "Wave Reward")`.
 * Varsayilan Turkce; sunucu dili hic degistirmiyor, urettigi metin eskisi
 * gibi Turkce. Istemci (apps/web/src/i18n.ts) secili dili buraya yaziyor.
 *
 * Katalog metinleri (kart, esya, kule adlari) burada degil: istemci onlari
 * kimlige gore kendi katmaninda ceviriyor.
 */

export type SharedLocale = "tr" | "en";

let sharedLocale: SharedLocale = "tr";

export function setSharedLocale(locale: SharedLocale) {
  sharedLocale = locale;
}

export function getSharedLocale(): SharedLocale {
  return sharedLocale;
}

/** Secili dildeki metin. Ikisi de hazir verilir; sablonlar ikisi icin de kurulur. */
export function lt(tr: string, en: string): string {
  return sharedLocale === "en" ? en : tr;
}

/** Sayi bicimi dile gore: Turkcede ondalik virgul, Ingilizcede nokta. */
export function sharedNumberLocale() {
  return sharedLocale === "en" ? "en-US" : "tr-TR";
}

/** Yuzde: Turkcede isaret onde ("%15"), Ingilizcede arkada ("15%"). */
export function ltPercent(value: string | number) {
  return sharedLocale === "en" ? `${value}%` : `%${value}`;
}

/** Ingilizce tekil/cogul ("1 leak", "3 leaks"); Turkcede ad hep tekil, gerek yok. */
export function enPlural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

/** Ondalikli sayi `toFixed` ile, ayirac dile gore ("1,49" / "1.49"). Intl degil: esitlikte farkli yuvarliyor. */
export function ltFixed(value: number, digits: number) {
  const fixed = value.toFixed(digits);
  return sharedLocale === "en" ? fixed : fixed.replace(".", ",");
}

/** Buyuk harf dile gore ("i" Turkcede "İ"). */
export function ltUpper(text: string) {
  return text.toLocaleUpperCase(sharedLocale === "en" ? "en-US" : "tr-TR");
}
