import { getModifierAdd, type Modifier } from "../modifiers/index.js";

export type ActiveMark = { id: string; add: number; expiresAt: number };

export function applyEnemyMark(_current: ActiveMark | undefined, next: ActiveMark) {
  return { ...next };
}

export function getMarkDamageMultiplier(mark: ActiveMark | undefined, modifiers: readonly Modifier[], now: number) {
  const nativeAdd = mark && mark.expiresAt > now ? mark.add : 0;
  return 1 + Math.min(1, Math.max(0, nativeAdd + getModifierAdd(modifiers, "markAmplification")));
}
