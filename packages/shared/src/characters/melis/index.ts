import type { CharacterDefinition } from "../common/types.js";
import { melisPassive } from "./passive/index.js";
import { melisSkills } from "./skills/index.js";
import { melisTowers } from "./turrets/index.js";
import { melisUltimate } from "./ultimate/index.js";

export const melisCharacter: CharacterDefinition = {
  id: "archer",
  displayName: "Melis",
  role: "Evrim Uzmanı",
  theme: "Onay ve stres dengesini kule evrimine çeviren baskı oyunu.",
  summary: "Seri öldürmelerinden kazandığı puanı onaya mı strese mi yazacağına her an kendisi karar verir. Onay ilk üç kulesini güçlendirir, stres ise evrim satın alır; önde giden taraf her dalga eridiği için ikisinden birine yerleşmek mümkün değildir. Barı doğru zamanda çeviren oyuncu hem güçlü kulelere hem evrimlere ulaşır.",
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
