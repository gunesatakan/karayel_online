import type { CharacterId } from "../../index.js";

export type TowerDefinition = {
  id: string;
  characterId: CharacterId;
  name: string;
  role: string;
  cost: number;
  upgradeCost: number;
  range: number;
  damage: number;
  fireIntervalMs: number;
  projectileSpeed: number;
  aoeRadius: number;
  slowMs: number;
  color: number;
};

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  cooldownMs: number;
};

export type CharacterDefinition = {
  id: CharacterId;
  displayName: string;
  role: string;
  summary: string;
  maxHp: number;
  speed: number;
  damage: number;
  fireIntervalMs: number;
  projectileSpeed: number;
  passive: string;
  ultimate: string;
  towers: TowerDefinition[];
  skills: SkillDefinition[];
};
