import type { CharacterDefinition } from "../common/types.js";
import { atakanPassive } from "./passive/index.js";
import { atakanSkills } from "./skills/index.js";
import { atakanTowers } from "./turrets/index.js";
import { atakanUltimate } from "./ultimate/index.js";

export const atakanCharacter: CharacterDefinition = {
  id: "warrior",
  displayName: "Atakan",
  role: "Ciliz",
  summary: "En yavas, en gucsuz ve en kirilgan karakter.",
  maxHp: 55,
  speed: 0.72,
  damage: 4,
  fireIntervalMs: 1150,
  projectileSpeed: 220,
  passive: atakanPassive,
  ultimate: atakanUltimate,
  towers: atakanTowers,
  skills: atakanSkills
};
