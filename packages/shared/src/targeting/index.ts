import type { MovementKind } from "../combat.js";
import type { TowerTargetingMode } from "../characters/common/types.js";

export type TowerTargetCandidate = {
  id: string;
  progress: number;
  health: number;
  strength: number;
  distance: number;
  markScore?: number;
  priorityScore?: number;
  inRange: boolean;
  eligible: boolean;
  movementKind?: MovementKind;
};

export type TowerTargetingQuery = {
  mode: TowerTargetingMode;
  canHitAir: boolean;
  locksTarget?: boolean;
  lockedTargetId?: string;
  retainLockOutsideRange?: boolean;
  preferredTargetIds?: string[];
  random?: () => number;
};

export function selectTowerTarget<T extends TowerTargetCandidate>(query: TowerTargetingQuery, candidates: T[]): T | undefined {
  const targetable = candidates.filter((candidate) => candidate.eligible && (query.canHitAir || candidate.movementKind !== "air"));
  if (query.locksTarget && query.lockedTargetId) {
    const locked = targetable.find((candidate) => candidate.id === query.lockedTargetId);
    if (locked && (locked.inRange || query.retainLockOutsideRange)) {
      return locked;
    }
  }

  const inRange = targetable.filter((candidate) => candidate.inRange);
  if (inRange.length === 0) {
    return undefined;
  }
  const preferred = new Set(query.preferredTargetIds ?? []);
  const pool = preferred.size > 0 && inRange.some((candidate) => preferred.has(candidate.id))
    ? inRange.filter((candidate) => preferred.has(candidate.id))
    : inRange;

  if (query.mode === "random") {
    const random = Math.max(0, Math.min(0.999999999, (query.random ?? Math.random)()));
    return pool[Math.floor(random * pool.length)];
  }

  return [...pool].sort((a, b) => compareCandidates(query.mode, a, b))[0];
}

function compareCandidates(mode: TowerTargetingMode, a: TowerTargetCandidate, b: TowerTargetCandidate) {
  let result = 0;
  if (mode === "first") result = b.progress - a.progress;
  else if (mode === "last") result = a.progress - b.progress;
  else if (mode === "strongest") result = (b.priorityScore ?? 0) - (a.priorityScore ?? 0) || b.strength - a.strength || b.progress - a.progress;
  else if (mode === "weakest") result = a.health - b.health || b.progress - a.progress;
  else if (mode === "closest") result = a.distance - b.distance || b.progress - a.progress;
  else if (mode === "marked") result = (b.markScore ?? 0) - (a.markScore ?? 0) || b.progress - a.progress;
  return result || a.id.localeCompare(b.id);
}
