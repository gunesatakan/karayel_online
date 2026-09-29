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
 * sekilde geri ceker; kilit ya da motor eki veren bir secenek baska bir sey
 * de yaptigi icin bu sinifa girmez.
 */
export function isMarkOnlyChoice(choice: { effects: readonly Modifier[]; unlocks?: readonly unknown[]; grants?: unknown }) {
  return choice.effects.length > 0
    && !choice.unlocks?.length
    && !choice.grants
    && choice.effects.every((modifier) => modifier.stat === "markAmplification");
}
