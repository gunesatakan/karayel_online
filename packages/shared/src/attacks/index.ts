import type { MovementKind } from "../combat.js";
import type { TowerAttackShape } from "../characters/common/types.js";

export type AttackShapeTarget = {
  id: string;
  x: number;
  y: number;
  radius?: number;
  movementKind?: MovementKind;
};

export type AttackShapeQuery = {
  shape: TowerAttackShape;
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  length?: number;
  width?: number;
  radius?: number;
  angle?: number;
  pierceCount?: number;
  canHitAir?: boolean;
  alreadyHitIds?: string[];
};

export function selectAttackShapeTargets<T extends AttackShapeTarget>(query: AttackShapeQuery, targets: T[]): T[] {
  const excluded = new Set(query.alreadyHitIds ?? []);
  const unique = new Map<string, T>();
  for (const target of targets) {
    if (!excluded.has(target.id) && (query.canHitAir || target.movementKind !== "air")) {
      unique.set(target.id, target);
    }
  }

  const selected = Array.from(unique.values()).filter((target) => isTargetInsideAttackShape(query, target));
  if (query.shape !== "circle" && query.shape !== "single") {
    selected.sort((a, b) => projectionAlongAttack(query, a) - projectionAlongAttack(query, b));
  }
  return query.pierceCount === undefined ? selected : selected.slice(0, Math.max(0, query.pierceCount));
}

export function isTargetInsideAttackShape(query: AttackShapeQuery, target: AttackShapeTarget) {
  const targetRadius = Math.max(0, target.radius ?? 0);
  if (query.shape === "circle") {
    const radius = Math.max(0, query.radius ?? query.width ?? 0) + targetRadius;
    return distanceSquared(query.aimX, query.aimY, target.x, target.y) <= radius * radius;
  }

  if (query.shape === "single") {
    const radius = Math.max(1, query.width ?? 1) + targetRadius;
    return distanceSquared(query.aimX, query.aimY, target.x, target.y) <= radius * radius;
  }

  const direction = getDirection(query);
  const dx = target.x - query.x;
  const dy = target.y - query.y;
  const projection = dx * direction.x + dy * direction.y;
  const length = Math.max(0, query.length ?? Math.hypot(query.aimX - query.x, query.aimY - query.y));
  if (projection < -targetRadius || projection > length + targetRadius) {
    return false;
  }

  if (query.shape === "cone") {
    const distance = Math.hypot(dx, dy);
    if (distance <= targetRadius) {
      return true;
    }
    const targetAngle = Math.atan2(dy, dx);
    const directionAngle = Math.atan2(direction.y, direction.x);
    const angleDifference = Math.abs(normalizeAngle(targetAngle - directionAngle));
    return angleDifference <= ((query.angle ?? 0) * Math.PI) / 360;
  }

  const perpendicularDistance = Math.abs(dx * direction.y - dy * direction.x);
  return perpendicularDistance <= Math.max(0, query.width ?? 0) + targetRadius;
}

function projectionAlongAttack(query: AttackShapeQuery, target: AttackShapeTarget) {
  if (query.shape === "circle" || query.shape === "single") {
    return distanceSquared(query.aimX, query.aimY, target.x, target.y);
  }
  const direction = getDirection(query);
  return (target.x - query.x) * direction.x + (target.y - query.y) * direction.y;
}

function getDirection(query: AttackShapeQuery) {
  const dx = query.aimX - query.x;
  const dy = query.aimY - query.y;
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  return { x: dx / length, y: dy / length };
}

function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function distanceSquared(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}
