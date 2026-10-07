/**
 * Arayuz metinleri: reports bolgesi (anahtar oneki: report.).
 * Turkce kaynak; Ingilizce ayni anahtarlarla, tip eksik anahtari derlemede
 * yakaliyor. `{ad}` yer tutuculari `t(anahtar, { ad })` ile doluyor.
 */
export const trReports = {
  // ------------------------------------------------------------ Kosu raporu
  "report.run.starsAria": "{stars} yıldız, 3 üzerinden",
  "report.run.stripAria": "Dalga şeridi, {count} dalga",
  "report.run.legend.clean": "temiz",
  "report.run.legend.leak": "sızıntı",
  "report.run.legend.death": "düştü",
  "report.run.legend.air": "hava",
  "report.run.you": "sen",
  "report.run.playersAria": "Oyuncular",
  "report.run.team": "Ekip",
  "report.run.deck": "Deste",
  "report.run.deck.none": "Kart seçilmedi",
  "report.run.deck.countOne": "{n} kart",
  "report.run.deck.count": "{n} kart",
  "report.run.deck.rarity": "{n} {rarity}",
  "report.run.card.times": "{n} kez",
  "report.run.mvp": "Koşunun kulesi",
  "report.run.moment": "En iyi an",
  "report.run.masteryAria": "Ustalık {level}: {detail}",
  "report.run.badgesAria": "Bu koşunun nişanları",
  "report.run.unlocked": "Açıldı: {list}",
  "report.run.progress": "Nişan ve ustalık",
  "report.run.menu": "Ana menü",
  "report.run.defenseLink": "Son dalganın savunma özeti",

  // ------------------------------------------------------------ Dalga karnesi
  "report.wave.openAria": "{label}. Savunma özetini aç",

  // ------------------------------------------------------------ Savunma penceresi
  "report.dialog.close": "Kapat",
  "report.dialog.apply": "Uygula",
  "report.defense.intro": "Gerçek hasar = indirilen can + kalkan. Destek süreleri hasara eklenmez. Döngü süreleri nişan alma ve atış aralığını da içerir; kesintisiz isabet süresi değildir.",
  "report.defense.row": "{name} · {damage} hasar · {repaired} alınan onarım",
  "report.defense.aura": "aura teması {v} düşman·sn (örtüşebilir)",
  "report.defense.markAssist": "takip katkısı {v} (vuranın hasarına dahil; son yenileyen)",
  "report.defense.seconds": "{label}: {v} sn"
} as const;

export const enReports: Readonly<Record<keyof typeof trReports, string>> = {
  "report.run.starsAria": "{stars} of 3 stars",
  "report.run.stripAria": "Wave strip, {count} waves",
  "report.run.legend.clean": "clean",
  "report.run.legend.leak": "leak",
  "report.run.legend.death": "fell",
  "report.run.legend.air": "air",
  "report.run.you": "you",
  "report.run.playersAria": "Players",
  "report.run.team": "Team",
  "report.run.deck": "Deck",
  "report.run.deck.none": "No cards picked",
  "report.run.deck.countOne": "{n} card",
  "report.run.deck.count": "{n} cards",
  "report.run.deck.rarity": "{n} {rarity}",
  "report.run.card.times": "{n} times",
  "report.run.mvp": "Tower of the run",
  "report.run.moment": "Best moment",
  "report.run.masteryAria": "Mastery {level}: {detail}",
  "report.run.badgesAria": "Badges from this run",
  "report.run.unlocked": "Unlocked: {list}",
  "report.run.progress": "Badges and mastery",
  "report.run.menu": "Main menu",
  "report.run.defenseLink": "Defense summary of the last wave",

  "report.wave.openAria": "{label}. Open defense summary",

  "report.dialog.close": "Close",
  "report.dialog.apply": "Apply",
  "report.defense.intro": "True damage = health removed + shield. Support time is not added to damage. Cycle times include aiming and the firing interval; they are not uninterrupted time on target.",
  "report.defense.row": "{name} · {damage} damage · {repaired} repair received",
  "report.defense.aura": "aura contact {v} enemy·s (may overlap)",
  "report.defense.markAssist": "mark assist {v} (counted in the hitter's damage; last refresher)",
  "report.defense.seconds": "{label}: {v} s"
};
