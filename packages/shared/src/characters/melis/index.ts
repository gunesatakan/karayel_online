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
  summary: "Seri öldürmelerden onay, sessiz geçen dalgalardan stres toplar. İki değerin oranı yeterince açıldığında kulelerini bir sonraki evrime taşır. İlk kurduğu üç kule favori sayılır ve onay yükseldikçe güçlenir; stres baskınken aynı kuleler daha sert ama daha kontrolsüz çalışır.",
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
