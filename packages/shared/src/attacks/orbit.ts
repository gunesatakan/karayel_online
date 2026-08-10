import type { AttackShapeTarget } from "./index.js";

export type OrbitSweepQuery = {
  x: number;
  y: number;
  previousAngle: number;
  nextAngle: number;
  bladeCount: number;
  bladeLength: number;
  bladeWidth: number;
  canHitAir?: boolean;
};

/** Returns targets touched by the complete angular area swept this tick. */
export function selectOrbitSweepTargets<T extends AttackShapeTarget>(query: OrbitSweepQuery, targets: readonly T[]) {
  const count = Math.max(1, Math.round(query.bladeCount));
  const length = Math.max(0, query.bladeLength);
  const halfWidth = Math.max(0, query.bladeWidth) / 2;
  const sweep = positiveAngle(query.nextAngle - query.previousAngle);
  const selected: T[] = [];

  for (const target of targets) {
    if (!query.canHitAir && target.movementKind === "air") continue;
    const dx = target.x - query.x;
    const dy = target.y - query.y;
    const distance = Math.hypot(dx, dy);
    const targetRadius = Math.max(0, target.radius ?? 0);
    if (distance > length + targetRadius) continue;
    if (distance <= halfWidth + targetRadius) {
      selected.push(target);
      continue;
    }

    const targetAngle = Math.atan2(dy, dx);
    const angularTolerance = Math.asin(Math.min(1, (halfWidth + targetRadius) / distance));
    let hit = false;
    for (let blade = 0; blade < count; blade += 1) {
      const start = query.previousAngle + blade * Math.PI * 2 / count;
      const advance = positiveAngle(targetAngle - start);
      if (advance <= sweep + angularTolerance || advance >= Math.PI * 2 - angularTolerance) {
        hit = true;
        break;
      }
    }
    if (hit) selected.push(target);
  }
  return selected;
}

function positiveAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}
