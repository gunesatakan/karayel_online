/**
 * Arayuz metinleri: credits bolgesi (anahtar oneki: credits.).
 * "Emegi gecenler" ekrani (menu-ui.ts `renderCredits`). Kaynak adlari,
 * yazarlar ve lisanslar burada degil, apps/web/src/credits.ts'de ve
 * cevrilmiyor. Turkce kaynak; Ingilizce ayni anahtarlarla.
 */
export const trCredits = {
  "credits.menuButton": "Emeği geçenler",
  "credits.eyebrow": "Kaynakça",
  "credits.title": "Emeği geçenler",
  "credits.game.label": "Yapım",
  "credits.game.body": "Tasarım ve geliştirme: {developer}. Prosedürel kuleler, efektler, operatör mühürleri ve arayüz tonları oyunun kendi kodunda üretiliyor.",
  "credits.intro": "Uzay Savunma'da kullanılan üçüncü taraf sesler, yazı tipleri, görsel araçlar ve yazılımlar. Eser adları ve lisanslar yayımlandıkları hâliyle.",
  "credits.group.audio": "Ses efektleri",
  "credits.group.audio.note": "Vuruş, kritik, infaz ve öldürme sesleri bu paketlerden kesildi. CC0 atıf istemiyor; yine de teşekkürler.",
  "credits.group.fonts": "Yazı tipleri",
  "credits.group.fonts.note": "Google Fonts üzerinden yükleniyor.",
  "credits.group.ai": "Görsel üretim",
  "credits.group.ai.note": "Bazı görseller üretken yapay zekâ ile oluşturuldu.",
  "credits.group.software": "Yazılım",
  "credits.group.software.note": "Oyun motoru ve çok oyunculu sunucu.",
  "credits.license": "Lisans",
  "credits.linkAria": "{title} kaynağını yeni sekmede aç"
} as const;

export const enCredits: Readonly<Record<keyof typeof trCredits, string>> = {
  "credits.menuButton": "Credits",
  "credits.eyebrow": "Attribution",
  "credits.title": "Credits",
  "credits.game.label": "Production",
  "credits.game.body": "Design and development: {developer}. Procedural towers, effects, operator sigils and interface tones are generated in the game's own code.",
  "credits.intro": "Third-party sounds, typefaces, image tools and software used in Uzay Savunma. Work titles and licences are given as published.",
  "credits.group.audio": "Sound effects",
  "credits.group.audio.note": "Hit, critical, execute and kill sounds are cut from these packs. CC0 asks for no attribution; thank you all the same.",
  "credits.group.fonts": "Typefaces",
  "credits.group.fonts.note": "Loaded from Google Fonts.",
  "credits.group.ai": "Image generation",
  "credits.group.ai.note": "Some artwork was created with generative AI.",
  "credits.group.software": "Software",
  "credits.group.software.note": "Game engine and multiplayer server.",
  "credits.license": "Licence",
  "credits.linkAria": "Open the {title} source in a new tab"
};
