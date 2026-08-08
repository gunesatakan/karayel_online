import type { HitType } from "../combat.js";

export const LINEAR_BALLISTIC_HIT_TYPES: ReadonlySet<HitType> = new Set(["impact", "wave", "projectile"]);

export type BallisticCollisionBody = { id: string; x: number; y: number; radius: number };

export function usesLinearBallistics(hitType: HitType) {
  return LINEAR_BALLISTIC_HIT_TYPES.has(hitType);
}

export function findFirstLinearCollision<T extends BallisticCollisionBody>(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bodies: Iterable<T>,
  projectileRadius = 4,
  excludedIds: ReadonlySet<string> = new Set()
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  let best: { body: T; progress: number } | undefined;
  for (const body of bodies) {
    if (excludedIds.has(body.id)) continue;
    const progress = lengthSquared <= 0 ? 0 : Math.max(0, Math.min(1, ((body.x - from.x) * dx + (body.y - from.y) * dy) / lengthSquared));
    const closestX = from.x + dx * progress;
    const closestY = from.y + dy * progress;
    const collisionRadius = Math.max(0, body.radius) + projectileRadius;
    const distanceSquared = (body.x - closestX) ** 2 + (body.y - closestY) ** 2;
    if (distanceSquared <= collisionRadius ** 2 && (!best || progress < best.progress)) best = { body, progress };
  }
  return best;
}
