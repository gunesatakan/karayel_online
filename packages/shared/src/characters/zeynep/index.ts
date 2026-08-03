import type { CharacterDefinition } from "../common/types.js";
import { zeynepPassive } from "./passive/index.js";
import { zeynepSkills } from "./skills/index.js";
import { zeynepTowers } from "./turrets/index.js";
import { zeynepUltimate } from "./ultimate/index.js";

export const zeynepCharacter: CharacterDefinition = {
  id: "zeynep",
  displayName: "Zeynep",
  role: "Komuta ve Dizilim",
  theme: "İtibarla komut veren, kuleleri ikili ve üçlü dizilimlerle güçlendiren düzen oyunu.",
  summary: "Kule kurmakla bitmez; hattı komutlarla yönetir. Öldürdükçe topladığı İtibar'ı takım geneline atış hızı, menzil veya yavaşlatma vermek için harcar ve komutları zincirledikçe etkileri büyür. Kuleleri tam ikili veya üçgen üçlü dizilimde durduğunda ek buff alır, gruba fazladan kule girerse buff bozulur.",
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
