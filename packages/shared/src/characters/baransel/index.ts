import type { CharacterDefinition } from "../common/types.js";
import { baranselPassive } from "./passive/index.js";
import { baranselSkills } from "./skills/index.js";
import { baranselTowers } from "./turrets/index.js";
import { baranselUltimate } from "./ultimate/index.js";

export const baranselCharacter: CharacterDefinition = {
  id: "mage",
  displayName: "Baransel",
  role: "AOE",
  summary: "Yavas ama alan hasari yuksek.",
  maxHp: 75,
  speed: 0.92,
  damage: 24,
  fireIntervalMs: 1100,
  projectileSpeed: 250,
  passive: baranselPassive,
  ultimate: baranselUltimate,
  towers: baranselTowers,
  skills: baranselSkills
};
