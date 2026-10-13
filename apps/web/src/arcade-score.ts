import { FINAL_WAVE } from "@karayel/shared";

/**
 * Bounty Board'a giden kosu skoru: asamalar boyunca ulasilan toplam dalga.
 * 3. asamada 7. dalga `2 x 20 + 7 = 47`. Tam sayi ve eksi degil; asama
 * bilinmiyorsa 1 sayiliyor, dalga asamanin son dalgasina kirpiliyor.
 *
 * `arcade.ts`ten ayri: o modul oyundan once yukleniyor ve ortak paketi
 * giris parcasina cekmemeli.
 */
export function getArcadeRunScore(run: { stage?: number; wave?: number }) {
  const stage = Number.isFinite(run.stage) ? Math.max(1, Math.trunc(run.stage as number)) : 1;
  const wave = Number.isFinite(run.wave) ? Math.max(0, Math.min(FINAL_WAVE, Math.trunc(run.wave as number))) : 0;
  return (stage - 1) * FINAL_WAVE + wave;
}
