import type { CharacterDefinition } from "../common/types.js";
import { atakanPassive } from "./passive/index.js";
import { atakanSkills } from "./skills/index.js";
import { atakanTowers } from "./turrets/index.js";
import { atakanUltimate } from "./ultimate/index.js";

export const atakanCharacter: CharacterDefinition = {
  id: "warrior",
  displayName: "Atakan",
  role: "Moduler Stratejist",
  theme: "Adaptif savunma, kule sinerjisi ve kontrollu kaos.",
  summary: "Adaptif ve stratejik bir operator. Ham gucu abartili degildir; kulelerini izole ederek, isaretleyerek ve birbirine baglayarak savunma hattini katlanarak guclendirir.",
  maxHp: 90,
  speed: 0.92,
  damage: 12,
  fireIntervalMs: 760,
  projectileSpeed: 330,
  passive: atakanPassive,
  ultimate: atakanUltimate,
  towers: atakanTowers,
  skills: atakanSkills
};
