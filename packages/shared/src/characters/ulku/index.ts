import type { CharacterDefinition } from "../common/types.js";
import { ulkuPassive } from "./passive/index.js";
import { ulkuSkills } from "./skills/index.js";
import { ulkuTowers } from "./turrets/index.js";
import { ulkuUltimate } from "./ultimate/index.js";

export const ulkuCharacter: CharacterDefinition = {
  id: "healer",
  displayName: "Ülkü",
  role: "Destek",
  summary: "Takim canini ve savunma ritmini destekleyen sinif.",
  maxHp: 90,
  speed: 1,
  damage: 8,
  fireIntervalMs: 720,
  projectileSpeed: 330,
  passive: ulkuPassive,
  ultimate: ulkuUltimate,
  towers: ulkuTowers,
  skills: ulkuSkills
};
