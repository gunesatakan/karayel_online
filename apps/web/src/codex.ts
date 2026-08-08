import type { DamageType, HitType } from "@karayel/shared";

/** Typed player-facing combat terminology. */
export type CodexEntry = {
  name: string;
  text: string;
};

export const classTypeCodex: Record<string, CodexEntry> = {
  damage: { name: "Hasar", text: "Ana işi düşman öldürmek." },
  control: { name: "Kontrol", text: "Hasardan çok yavaşlatma, korkutma ve durdurma yapar." },
  support: { name: "Destek", text: "Kendi ateş etmez; diğer kuleleri güçlendirir." },
  hybrid: { name: "Karma", text: "Duruma göre hem hasar hem destek görevi görür." }
};

export const damageTypeCodex: Record<DamageType, CodexEntry> = {
  physical: { name: "Fiziksel", text: "Golemler zayıf, 4. boyut yerlileri dirençlidir." },
  electric: { name: "Elektrik", text: "Mekalar zayıf, düşmüşler dirençlidir." },
  psychic: { name: "Psişik", text: "4. boyut yerlileri zayıf, mekalar dirençlidir." },
  fire: { name: "Ateş", text: "Kutsal koruyucular zayıf, uzay böcekleri dirençlidir." },
  light: { name: "Işık", text: "Düşmüşler zayıf, kutsal koruyucular dirençlidir." },
  cellular: { name: "Hücresel", text: "Uzay böcekleri zayıf, golemler dirençlidir." },
  true: { name: "Gerçek", text: "Zırhı ve dirençleri tamamen yok sayar." },
  none: { name: "Yok", text: "Hasar vermez; sadece etki uygular." }
};

export const hitTypeCodex: Record<HitType, CodexEntry> = {
  projectile: { name: "Mermi", text: "Hedefe doğru ilerleyen atış; yolda vakit kaybeder." },
  impact: { name: "Çarpma", text: "Patlama tipi vuruş. Seviye ile atış hızı değil hasarı büyür." },
  focus: { name: "Odak", text: "Kanal veya lazer; sık ve küçük vuruşlar." },
  aura: { name: "Aura", text: "Alan etkisi; genellikle hedef seçmez." },
  contamination: { name: "Bulaşma", text: "Düşmandan düşmana yayılan etki." },
  curse: { name: "Lanet", text: "Anında hasar vermez, hedefte birikir." },
  wave: { name: "Dalga", text: "Yayılarak ilerleyen etki; yol boyunca temas eder." }
};
