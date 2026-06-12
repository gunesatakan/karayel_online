import type { CharacterDefinition } from "../common/types.js";
import { atakanPassive } from "./passive/index.js";
import { atakanSkills } from "./skills/index.js";
import { atakanTowers } from "./turrets/index.js";
import { atakanUltimate } from "./ultimate/index.js";

export const atakanCharacter: CharacterDefinition = {
  id: "warrior",
  displayName: "Atakan",
  role: "Moduler Stratejist",
  theme: "Aile hekimi, SaaS projeleri ve kendi halinde uretkenlik.",
  summary: "Aile hekimi ve SaaS uretkenligi temali, adaptif ve stratejik karakter. Ham hasari orta; tek basina duran veya dogru baglanan kuleleri cok verimli hale gelir.",
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
