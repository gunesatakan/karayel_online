import type { MessageKey } from "./i18n";

/**
 * Emegi gecenler: oyunda kullanilan ucuncu taraf kaynaklar.
 *
 * Tek liste. Menudeki "Emegi gecenler" ekrani (`renderCredits`, menu-ui.ts)
 * buradan ciziliyor; kok dizindeki CREDITS.md ayni kaynaklari yaziyor ve
 * tests/credits.test.mjs buradaki her kaynagin adini, yazarini, lisansini ve
 * baglantisini CREDITS.md'de ariyor. Yeni bir varlik eklerken ikisine de yazin.
 *
 * Eser adlari, yazarlar ve lisans adlari cevrilmiyor; yalnizca bolum basliklari
 * ve aciklamalar sozlukte (locales/areas/credits.ts).
 *
 * Ses grubu apps/web/public/audio/sfx/LICENSE.txt ve manifest.json ile ayni
 * bes paketi listeliyor (tools/build-sfx.mjs).
 */

export type CreditSource = {
  id: string;
  title: string;
  author: string;
  license: string;
  url: string;
};

export type CreditGroup = {
  id: "audio" | "fonts" | "ai" | "software";
  titleKey: MessageKey;
  noteKey: MessageKey;
  sources: readonly CreditSource[];
};

/** Oyunun tasarimi ve gelistirmesi (git yazari). */
export const CREDITS_DEVELOPER = "gunesatakan";

export const CREDIT_GROUPS: readonly CreditGroup[] = [
  {
    id: "audio",
    titleKey: "credits.group.audio",
    noteKey: "credits.group.audio.note",
    sources: [
      { id: "kenney-impact", title: "Impact Sounds", author: "Kenney", license: "CC0 1.0", url: "https://kenney.nl/assets/impact-sounds" },
      { id: "kenney-scifi", title: "Sci-Fi Sounds", author: "Kenney", license: "CC0 1.0", url: "https://kenney.nl/assets/sci-fi-sounds" },
      { id: "oga-squish", title: "Squish Sounds Effects", author: "EZduzziteh", license: "CC0 1.0", url: "https://opengameart.org/content/squish-sounds-effects" },
      { id: "oga-creature-1", title: "80 CC0 creature SFX", author: "rubberduck", license: "CC0 1.0", url: "https://opengameart.org/content/80-cc0-creature-sfx" },
      { id: "oga-creature-2", title: "80 CC0 creature SFX #2", author: "rubberduck", license: "CC0 1.0", url: "https://opengameart.org/content/80-cc0-creture-sfx-2" }
    ]
  },
  {
    id: "fonts",
    titleKey: "credits.group.fonts",
    noteKey: "credits.group.fonts.note",
    sources: [
      { id: "font-cinzel", title: "Cinzel", author: "Natanael Gama", license: "SIL OFL 1.1", url: "https://fonts.google.com/specimen/Cinzel" },
      { id: "font-rajdhani", title: "Rajdhani", author: "Indian Type Foundry", license: "SIL OFL 1.1", url: "https://fonts.google.com/specimen/Rajdhani" },
      { id: "font-share-tech-mono", title: "Share Tech Mono", author: "Carrois Apostrophe", license: "SIL OFL 1.1", url: "https://fonts.google.com/specimen/Share+Tech+Mono" }
    ]
  },
  {
    id: "ai",
    titleKey: "credits.group.ai",
    noteKey: "credits.group.ai.note",
    sources: [
      { id: "openai-gpt-image", title: "gpt-image", author: "OpenAI", license: "OpenAI Terms of Use", url: "https://openai.com/policies/terms-of-use" }
    ]
  },
  {
    id: "software",
    titleKey: "credits.group.software",
    noteKey: "credits.group.software.note",
    sources: [
      { id: "phaser", title: "Phaser", author: "Richard Davey, Phaser Studio Inc.", license: "MIT", url: "https://phaser.io" },
      { id: "colyseus", title: "Colyseus", author: "Endel Dreyer", license: "MIT", url: "https://colyseus.io" }
    ]
  }
];

export const CREDIT_SOURCES: readonly CreditSource[] = CREDIT_GROUPS.flatMap((group) => group.sources);

/** Ekranda baglanti metni: sema ve "www." olmadan, kisa. */
export function creditLinkLabel(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
