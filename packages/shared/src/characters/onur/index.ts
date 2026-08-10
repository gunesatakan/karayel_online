import type { CharacterDefinition } from "../common/types.js";
import { onurPassive } from "./passive/index.js";
import { onurSkills } from "./skills/index.js";
import { onurTowers } from "./turrets/index.js";
import { onurUltimate } from "./ultimate/index.js";

export const onurCharacter: CharacterDefinition = {
  id: "onur",
  displayName: "Onur",
  role: "Kumarbaz",
  summary: "Değişken hasar zarlarını şanssızlık biriktirerek yüksek riskli fırsat pencerelerine dönüştürür.",
  maxHp: 110,
  speed: 1.04,
  damage: 16,
  fireIntervalMs: 560,
  projectileSpeed: 360,
  passive: onurPassive,
  ultimate: onurUltimate,
  towers: onurTowers,
  skills: onurSkills
};
