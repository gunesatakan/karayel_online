import type { CharacterId } from "../index.js";
import { atakanCharacter } from "./atakan/index.js";
import { baranselCharacter } from "./baransel/index.js";
import type { CharacterDefinition, SkillDefinition, TowerDefinition } from "./common/types.js";
import { melisCharacter } from "./melis/index.js";
import { omerCharacter } from "./omer/index.js";
import { onurCharacter } from "./onur/index.js";
import { ulkuCharacter } from "./ulku/index.js";
import { zeynepCharacter } from "./zeynep/index.js";

export type { CharacterDefinition, SkillDefinition, TowerDefinition };

export const characters: CharacterDefinition[] = [
  zeynepCharacter,
  atakanCharacter,
  melisCharacter,
  baranselCharacter,
  ulkuCharacter,
  omerCharacter,
  onurCharacter
];

export const towerCatalog: Record<CharacterId, TowerDefinition[]> = {
  zeynep: zeynepCharacter.towers,
  warrior: atakanCharacter.towers,
  archer: melisCharacter.towers,
  mage: baranselCharacter.towers,
  healer: ulkuCharacter.towers,
  tank: omerCharacter.towers,
  onur: onurCharacter.towers
};
