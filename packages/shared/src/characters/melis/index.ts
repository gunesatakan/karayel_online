import type { CharacterDefinition } from "../common/types.js";
import { melisPassive } from "./passive/index.js";
import { melisSkills } from "./skills/index.js";
import { melisTowers } from "./turrets/index.js";
import { melisUltimate } from "./ultimate/index.js";

export const melisCharacter: CharacterDefinition = {
  id: "archer",
  displayName: "Melis",
  role: "Gotik Zihin",
  theme: "Ani ofke, onay ihtiyaci, kararsizlik ve gotik zihin.",
  summary: "Streaklerden onay toplar, stresini kule evrimlerine harcar. Favori kuleleri onayla guclenir.",
  maxHp: 85,
  speed: 1.12,
  damage: 7,
  fireIntervalMs: 320,
  projectileSpeed: 420,
  passive: melisPassive,
  ultimate: melisUltimate,
  towers: melisTowers,
  skills: melisSkills
};
