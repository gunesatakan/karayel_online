import type { EnemyType } from "../index.js";

/** Sunucu ayni anda en fazla bu kadar kuleye bagli. */
export const SERVER_LINK_LIMIT = 2;

/**
 * Sunucu'nun bilgisi: bagli kulelerin oldurdugu dusman turleri.
 *
 * Sunucu'ya bagli bir kule bir dusmana son vurusu yaptiginda Sunucu o turden
 * bir bilgi yaziyor. Bilgi Sunucu'nun: bag kalksa da silinmiyor, yalnizca
 * birikiyor. Biriken bilgi bagli kulelere o ture karsi oransal bir artis
 * veriyor. Artis yeni bir etki vermiyor, kulenin zaten sahip oldugunu
 * buyutuyor: zirh kirmasi olmayan kule zirh kirma kazanmiyor, karttan ya da
 * esyadan zirh kirma aldiysa toplami bu oranla carpiliyor.
 *
 * - Kosucu: yavaslatma miktari (hizdan dusulen kesir).
 * - Atici (kalkani en kalin tur): kalkana verilen hasar.
 * - Ezici (Zirhli Ezici): zirh kirma.
 * - Suru ve Kusatma: o ture verilen hasar.
 *
 * Ozel dusmanlar (Kule Avcisi, Isitici...) ve sampiyonlar taban turlerine
 * sayiliyor. Getiri azaliyor: artis `n / (n + 160)`, 40 oldurmede ~%20,
 * 160'ta %50, hicbir zaman %100'e varmiyor. Sunucu'nun seviyesi her
 * oldurmenin agirligini buyutuyor (seviye 1'de 1, seviye 10'da 2); seviye
 * atlayinca birikmis bilgi hemen daha cok sayiliyor.
 */
export type ServerKnowledgeEffect = "slow" | "shieldDamage" | "armorBreak" | "damage";

export type ServerKnowledge = Partial<Record<EnemyType, number>>;

/** Bilgi tutulan turler, panelde gosterim sirasiyla. */
export const SERVER_KNOWLEDGE_TYPES = ["runner", "shooter", "brute", "grunt", "siege"] as const satisfies readonly EnemyType[];

/** Her turun bilgisinin buyuttugu etki. */
export const SERVER_KNOWLEDGE_EFFECTS: Readonly<Record<EnemyType, ServerKnowledgeEffect>> = {
  runner: "slow",
  shooter: "shieldDamage",
  brute: "armorBreak",
  grunt: "damage",
  siege: "damage"
};

/** Artisin yariya (%50) ulastigi agirlikli bilgi. */
export const SERVER_KNOWLEDGE_HALF_POINT = 160;

/** Bir oldurmenin agirligi: seviye 1'de 1, seviye 10'da 2. */
export function getServerKnowledgeWeight(level: number) {
  const clamped = Math.min(Math.max(Math.round(level), 1), 10);
  return 1 + (clamped - 1) / 9;
}

/** Biriken bilginin verdigi oransal artis (0..1): 0,2 "+%20" demek. */
export function getServerKnowledgeBonus(kills: number, serverLevel: number) {
  const weighted = Math.max(0, kills) * getServerKnowledgeWeight(serverLevel);
  return weighted / (weighted + SERVER_KNOWLEDGE_HALF_POINT);
}

/** En bilgili turdeki artis (0..1); hic bilgi yoksa 0. */
export function getServerKnowledgeTopBonus(knowledge: ServerKnowledge | undefined, serverLevel: number) {
  let best = 0;
  for (const type of SERVER_KNOWLEDGE_TYPES) best = Math.max(best, getServerKnowledgeBonus(knowledge?.[type] ?? 0, serverLevel));
  return best;
}

/** "Bilgi Bankasi" nisaninin esigi: bir ture karsi +%50. */
export const SERVER_KNOWLEDGE_BADGE_BONUS = 0.5;
