/**
 * Arayuz metinleri: ilk acilis veri bildirimi (anahtar oneki: consent.).
 * Ayrintilar PRIVACY.md'nin ozeti; o belge degisirse burasi da guncellenmeli.
 */
export const trConsent = {
  "consent.aria": "Anonim kullanım verisi bildirimi",
  "consent.text": "Oyunu geliştirmek için anonim kullanım verisi topluyoruz.",
  "consent.more": "Ayrıntılar",
  "consent.less": "Gizle",
  "consent.off": "Kapat",
  "consent.ok": "Tamam",
  "consent.detail.collected": "Gidenler: hata mesajları, ulaşılan dalga, seçilen kart ve eşyalar, kule seviyeleri, FPS ve gecikme. Yalnızca oyunun kendi sunucusuna.",
  "consent.detail.notCollected": "Gitmeyenler: ad, e-posta, hesap, konum, reklam kimliği. IP adresi kaydedilmez; kimlik bu tarayıcıda üretilen rastgele bir sayıdır.",
  "consent.detail.retention": "Veriler 90 gün saklanır, satılmaz ve paylaşılmaz.",
  "consent.detail.optOut": "İstediğin zaman ana menüdeki \"Anonim veri\" kutusundan ya da oyun içi ♪ panelinden kapatabilirsin.",
  "consent.detail.contact": "Sorular ve silme talepleri: nobetportal@gmail.com"
} as const;

export const enConsent: Readonly<Record<keyof typeof trConsent, string>> = {
  "consent.aria": "Anonymous usage data notice",
  "consent.text": "We collect anonymous usage data to improve the game.",
  "consent.more": "Details",
  "consent.less": "Hide",
  "consent.off": "Turn off",
  "consent.ok": "OK",
  "consent.detail.collected": "Sent: error messages, wave reached, cards and items picked, tower levels, FPS and latency. Only to the game's own server.",
  "consent.detail.notCollected": "Not sent: name, e-mail, account, location, advertising ID. IP addresses are not stored; the ID is a random number made in this browser.",
  "consent.detail.retention": "Data is kept for 90 days, never sold or shared.",
  "consent.detail.optOut": "Turn it off any time with the \"Anon data\" box on the main menu or in the in-game ♪ panel.",
  "consent.detail.contact": "Questions and deletion requests: nobetportal@gmail.com"
};
