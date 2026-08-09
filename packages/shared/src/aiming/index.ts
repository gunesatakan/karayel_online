export const TOWER_TURN_RATE_RADIANS_PER_SECOND = 9;
export const TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS = Math.PI / 12;

export function getTowerFireAlignmentTolerance(accuracyBonus = 0) {
  return TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS * (1 - Math.max(0, Math.min(1, accuracyBonus)));
}

export function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function rotateTowerTowards(current: number, target: number, deltaSeconds: number, turnRate = TOWER_TURN_RATE_RADIANS_PER_SECOND) {
  const delta = shortestAngleDelta(current, target);
  const step = Math.min(Math.abs(delta), Math.max(0, turnRate * deltaSeconds));
  return normalizeAngle(current + Math.sign(delta) * step);
}

export function isTowerAligned(facing: number, targetAngle: number, tolerance = TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS) {
  return Math.abs(shortestAngleDelta(facing, targetAngle)) <= tolerance;
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
