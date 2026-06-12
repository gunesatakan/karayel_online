import type { CharacterDefinition } from "../common/types.js";
import { omerPassive } from "./passive/index.js";
import { omerSkills } from "./skills/index.js";
import { omerTowers } from "./turrets/index.js";
import { omerUltimate } from "./ultimate/index.js";

export const omerCharacter: CharacterDefinition = {
  id: "tank",
  displayName: "Ömer",
  role: "Tank",
  summary: "Yavaslatma ve yol kontrolu odakli.",
  maxHp: 130,
  speed: 0.86,
  damage: 10,
  fireIntervalMs: 800,
  projectileSpeed: 280,
  passive: omerPassive,
  ultimate: omerUltimate,
  towers: omerTowers,
  skills: omerSkills
};
