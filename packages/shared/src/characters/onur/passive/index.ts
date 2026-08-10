export const onurPassive = "Kumarbazın Rüyası: Saldırı kuleleri 0.5×–1.5× rastgele vurur; şanssızlık dolunca 10 saniyeliğine 0.95×–2.0× aralığı açılır.";

export const ONUR_MISFORTUNE_MAX = 100;
export const ONUR_LUCKY_WINDOW_MS = 10_000;

export type OnurGamblerState = {
  misfortune: number;
  luckyWindowUntil: number;
};

export type OnurGamblerShot = OnurGamblerState & {
  multiplier: number;
  luckyWindowActive: boolean;
};

export function getOnurMisfortuneContribution(effectiveFireIntervalMs: number) {
  return 12 * Math.pow(Math.max(1, effectiveFireIntervalMs) / 700, 0.85);
}

export function resolveOnurGamblerShot(
  state: OnurGamblerState,
  effectiveFireIntervalMs: number,
  random: () => number,
  now: number
): OnurGamblerShot {
  let misfortune = state.luckyWindowUntil > 0 && state.luckyWindowUntil <= now ? 0 : state.misfortune;
  let luckyWindowUntil = state.luckyWindowUntil > now ? state.luckyWindowUntil : 0;
  const wasLucky = luckyWindowUntil > now;
  const roll = Math.max(0, Math.min(1, random()));
  const multiplier = wasLucky ? 0.95 + roll * 1.05 : 0.5 + roll;

  if (multiplier < 1) {
    if (wasLucky) {
      misfortune = 0;
      luckyWindowUntil = 0;
    } else {
      misfortune = Math.min(ONUR_MISFORTUNE_MAX, misfortune + getOnurMisfortuneContribution(effectiveFireIntervalMs));
      if (misfortune >= ONUR_MISFORTUNE_MAX) {
        luckyWindowUntil = now + ONUR_LUCKY_WINDOW_MS;
      }
    }
  }

  return { misfortune, luckyWindowUntil, multiplier, luckyWindowActive: wasLucky };
}
