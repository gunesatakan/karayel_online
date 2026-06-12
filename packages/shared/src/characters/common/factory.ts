import type { CharacterId } from "../../index.js";
import type { SkillDefinition, TowerDefinition } from "./types.js";

export function makeTowers(
  characterId: CharacterId,
  color: number,
  names: Array<[string, string]>,
  base: { cost: number; range: number; damage: number; fireIntervalMs: number; projectileSpeed: number; aoeRadius?: number; slowMs?: number }
): TowerDefinition[] {
  return names.map(([name, role], index) => ({
    id: `${characterId}-${index + 1}`,
    characterId,
    name,
    role,
    cost: base.cost + index * 18,
    upgradeCost: Math.round((base.cost + index * 18) * 0.72),
    range: base.range + index * 5,
    damage: base.damage + index * 3,
    fireIntervalMs: Math.max(160, base.fireIntervalMs - index * 28),
    projectileSpeed: base.projectileSpeed + index * 18,
    aoeRadius: base.aoeRadius ?? 0,
    slowMs: base.slowMs ?? 0,
    color
  }));
}

export function makeSkills(characterId: CharacterId, names: Array<[string, string, number]>): SkillDefinition[] {
  return names.map(([name, description, cooldownMs], index) => ({
    id: `${characterId}-skill-${index + 1}`,
    name,
    description,
    cooldownMs
  }));
}
