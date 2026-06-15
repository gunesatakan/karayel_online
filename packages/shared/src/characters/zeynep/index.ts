import type { CharacterDefinition } from "../common/types.js";
import { zeynepPassive } from "./passive/index.js";
import { zeynepSkills } from "./skills/index.js";
import { zeynepTowers } from "./turrets/index.js";
import { zeynepUltimate } from "./ultimate/index.js";

export const zeynepCharacter: CharacterDefinition = {
  id: "zeynep",
  displayName: "Zeynep",
  role: "Saha Lideri",
  summary: "Savunma hattini komutlarla yoneten lider. Kendi kill'lerinden Itibar toplar, kucuk emirlerle zincir kurar ve dogru anda guclu takim buff'lari basar.",
  maxHp: 160,
  speed: 1.35,
  damage: 34,
  fireIntervalMs: 240,
  projectileSpeed: 520,
  passive: zeynepPassive,
  ultimate: zeynepUltimate,
  towers: zeynepTowers,
  skills: zeynepSkills
};
