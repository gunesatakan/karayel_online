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

export type OrbitSweepContact<T extends AttackShapeTarget> = {
  target: T;
  bladeIndex: number;
};

/** Returns each blade-target pair touched by the complete angular area swept this tick. */
export function selectOrbitSweepContacts<T extends AttackShapeTarget>(query: OrbitSweepQuery, targets: readonly T[]) {
  const count = Math.max(1, Math.round(query.bladeCount));
  const length = Math.max(0, query.bladeLength);
  const halfWidth = Math.max(0, query.bladeWidth) / 2;
  const sweep = positiveAngle(query.nextAngle - query.previousAngle);
  const contacts: OrbitSweepContact<T>[] = [];

  for (const target of targets) {
    if (!query.canHitAir && target.movementKind === "air") continue;
    const dx = target.x - query.x;
    const dy = target.y - query.y;
    const distance = Math.hypot(dx, dy);
    const targetRadius = Math.max(0, target.radius ?? 0);
    if (distance > length + targetRadius) continue;
    if (distance <= halfWidth + targetRadius) {
      for (let blade = 0; blade < count; blade += 1) contacts.push({ target, bladeIndex: blade });
      continue;
    }

    const targetAngle = Math.atan2(dy, dx);
    const angularTolerance = Math.asin(Math.min(1, (halfWidth + targetRadius) / distance));
    for (let blade = 0; blade < count; blade += 1) {
      const start = query.previousAngle + blade * Math.PI * 2 / count;
      const advance = positiveAngle(targetAngle - start);
      if (advance <= sweep + angularTolerance || advance >= Math.PI * 2 - angularTolerance) {
        contacts.push({ target, bladeIndex: blade });
      }
    }
  }
  return contacts;
}

/** Compatibility helper for consumers interested only in unique targets. */
export function selectOrbitSweepTargets<T extends AttackShapeTarget>(query: OrbitSweepQuery, targets: readonly T[]) {
  const unique = new Map<string, T>();
  for (const contact of selectOrbitSweepContacts(query, targets)) unique.set(contact.target.id, contact.target);
  return [...unique.values()];
}

function positiveAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}
