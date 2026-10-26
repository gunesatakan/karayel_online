/**
 * Merminin isabet seklinin 3D olculeri (dunya birimi), sunucunun kullandigi
 * paylasilan sekilden (`getProjectileShape`: cizilen govde = isabet sekli).
 * 3D govde basin sinirlarina, iz seridi kuyruga oturuyor: 3D mermi tam
 * vurdugu alani kapliyor (sahibin istegi, 2026-10-27).
 *
 * - Bas: disk ya da kuyruk olmayan parcalarin sinirlari; merminin yerine gore
 *   ileri `front`, geri `rear` (eksi), yanlara `half`. Eskiden 3D govde
 *   merminin yerinde ortalaniyordu; mizragin isabet ucu 5 birim ileride
 *   oldugu icin vurus 3D uc degmeden geliyordu.
 * - Kuyruk: merminin yerinden geriye uzanan ince parca (Takipci'nin iz
 *   cizgisi, Ucube'nin plazma kuyrugu, mizragin sapi); `tail` boyu, `tailHalf`
 *   yari eni. Yoksa 0 (iz seridi yok: gorunen alan isabetten buyumesin).
 *
 * Govdesi olmayan kimlik (isin kuleleri, nokta) icin yok: tarifin boylari.
 */
import { getProjectileSceneScale, getProjectileShape } from "@karayel/shared";

export type ProjectileHitFit = { front: number; rear: number; half: number; tail: number; tailHalf: number };

const cache = new Map<string, ProjectileHitFit | null>();

export function getProjectileHitFit(definitionId: string | undefined, tier: number | undefined, cellSize: number): ProjectileHitFit | undefined {
  const key = `${definitionId ?? ""}|${tier ?? 1}|${cellSize}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached ?? undefined;
  const fit = measure(definitionId, tier ?? 1, cellSize);
  cache.set(key, fit ?? null);
  return fit;
}

function measure(definitionId: string | undefined, tier: number, cellSize: number): ProjectileHitFit | undefined {
  const shape = getProjectileShape(definitionId, tier, getProjectileSceneScale(cellSize));
  let front = Number.NEGATIVE_INFINITY;
  let rear = Number.POSITIVE_INFINITY;
  let half = 0;
  let tail = 0;
  let tailHalf = 0;
  if (shape.disc === 1 && shape.radius > 0) {
    front = shape.radius;
    rear = -shape.radius;
    half = shape.radius;
  } else if (shape.disc === 2) {
    // Melis'in dokusu: kapsul (uc `front`, arka `tail`).
    front = shape.front;
    rear = -shape.tail;
    half = shape.halfWidth;
  }
  for (const part of shape.sources) {
    const width = Math.max(Math.abs(part.ylo), Math.abs(part.yhi));
    const length = -part.rearMin;
    if (part.frontMax <= 0.05 && length > 0.5 && width * 2 < length * 0.75) {
      tail = Math.max(tail, length);
      tailHalf = Math.max(tailHalf, width);
      continue;
    }
    front = Math.max(front, part.frontMax);
    rear = Math.min(rear, part.rearMin);
    half = Math.max(half, width);
  }
  if (!Number.isFinite(front)) {
    // Yalnizca kuyruk: basi kuyrugun en kadar kisa bir parca.
    if (tail <= 0) return undefined;
    front = tailHalf;
    rear = -tailHalf;
    half = tailHalf;
  }
  if (half <= 0 || front - rear <= 0) return undefined;
  return { front, rear, half, tail, tailHalf };
}
