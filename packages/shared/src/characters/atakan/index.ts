import type { CharacterDefinition } from "../common/types.js";
import { atakanPassive } from "./passive/index.js";
import { atakanSkills } from "./skills/index.js";
import { atakanTowers } from "./turrets/index.js";
import { atakanUltimate } from "./ultimate/index.js";

export const atakanCharacter: CharacterDefinition = {
  id: "warrior",
  displayName: "Atakan",
  role: "Modüler Stratejist",
  theme: "Kule yerleşimini yalıtma, işaretleme ve bağlantı üzerine kuran sinerji oyunu.",
  summary: "Tek tek kuleleri güçlü değildir; gücü yerleşimden gelir. Yalnız duran kuleleri pasifiyle daha verimli çalışır, Takipçi'nin işaretlediği düşmanlar tüm takımdan fazla hasar alır, Sunucu ise iki kuleyi birbirine bağlayarak menzil dışına kaçanı vurur. Doğru kurulan modüler hat, ham gücü katlar.",
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
