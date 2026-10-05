import { getModifierAdd, type Modifier } from "../modifiers/index.js";

export type ActiveMark = { id: string; add: number; expiresAt: number };

export function applyEnemyMark(_current: ActiveMark | undefined, next: ActiveMark) {
  return { ...next };
}

/**
 * Isaretli dusmana inen vurusun carpani.
 *
 * Kart ve esya bonusu (`markAmplification`) yalnizca **etkin bir isaret**
 * varken isler. Bir donem isaret yokken de ekleniyordu: Isaretleme Agi "isaretli
 * dusmana +%15" yaziyor ama her vurusa x1.15 veriyordu, yani metin ile
 * davranis ayri seylerdi ve kart isaret kuran hicbir sey olmayan kurulusta da
 * duz hasar karti gibi calisiyordu.
 */
export function getMarkDamageMultiplier(mark: ActiveMark | undefined, modifiers: readonly Modifier[], now: number) {
  if (!mark || !mark.id || mark.expiresAt <= now) return 1;
  return 1 + Math.min(1, Math.max(0, mark.add + getModifierAdd(modifiers, "markAmplification")));
}

/**
 * Degeri tamamen isarete bagli bir secenek mi.
 *
 * Boyle bir kart ya da esya, sahada dusmani isaretleyen hicbir sey yokken
 * bos bir secimdir. Cekilis bunu etiketli kartlarin olu agirligiyla ayni
 * sekilde geri ceker. Motor eki veren bir secenek baska bir sey de yaptigi
 * icin bu sinifa girmez; kilit veren secenek de girmez, kilidi
 * `MARK_ONLY_UNLOCKS` icinde degilse. O listede su an yalnizca
 * `crit:vsMarked` var (Av Izi, Iz Okuyucu): isaretsiz dusmanda hicbir
 * vurusu degistirmiyor.
 */
export function isMarkOnlyChoice(choice: { effects: readonly Modifier[]; unlocks?: readonly unknown[]; grants?: unknown }) {
  const unlocks = choice.unlocks ?? [];
  return (choice.effects.length > 0 || unlocks.length > 0)
    && !choice.grants
    && choice.effects.every((modifier) => modifier.stat === "markAmplification")
    && unlocks.every((unlock) => MARK_ONLY_UNLOCKS.has(unlock));
}

/**
 * Yalnizca isaretli dusmanda bir sey yapan kilitler.
 *
 * Kilitlerin cogu baska bir sey de yaptigi icin mark-only sayilmiyor; bunlar
 * sayiliyor, cunku isaretsiz bir sahada hicbir vurusu degistirmiyorlar.
 * Metin olarak tutuluyor: `Unlock` tipi `cards` modulunde ve o modul bunu
 * iceri aliyor.
 */
const MARK_ONLY_UNLOCKS: ReadonlySet<unknown> = new Set(["crit:vsMarked"]);
