import type { TowerAuraDefinition, TowerAuraStat } from "../characters/common/types.js";

export type TowerAuraSource = {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  ownerId?: string;
  enabled: boolean;
  aura: TowerAuraDefinition;
};

export type TowerAuraTarget = {
  x: number;
  y: number;
  kind: "tower" | "enemy";
  ownerId?: string;
};

export type TowerAuraModifiers = Partial<Record<TowerAuraStat, number>>;

export function isPointInsideTowerAura(source: TowerAuraSource, target: Pick<TowerAuraTarget, "x" | "y">) {
  if (source.aura.shape === "circle") {
    return distanceSquared(source.x, source.y, target.x, target.y) <= source.aura.radius * source.aura.radius;
  }
  return distanceToSegment(target.x, target.y, source.x, source.y, source.x2 ?? source.x, source.y2 ?? source.y) <= source.aura.radius;
}

export function evaluateTowerAuras(sources: TowerAuraSource[], target: TowerAuraTarget): TowerAuraModifiers {
  const modifiers: TowerAuraModifiers = {};
  for (const source of sources) {
    const expectedKind = source.aura.affects === "towers" ? "tower" : "enemy";
    if (!source.enabled || target.kind !== expectedKind || !isPointInsideTowerAura(source, target)) {
      continue;
    }
    if (target.kind === "tower" && source.aura.scope === "owner" && source.ownerId !== target.ownerId) {
      continue;
    }
    const current = modifiers[source.aura.stat];
    if (current === undefined) {
      modifiers[source.aura.stat] = source.aura.multiplier;
    } else if (source.aura.stacking === "multiply") {
      modifiers[source.aura.stat] = current * source.aura.multiplier;
    } else if (Math.abs(source.aura.multiplier - 1) > Math.abs(current - 1)) {
      modifiers[source.aura.stat] = source.aura.multiplier;
    }
  }
  return modifiers;
}

function distanceSquared(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
