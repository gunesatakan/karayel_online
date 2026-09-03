import type { CharacterId } from "../index.js";
import { atakanCharacter } from "./atakan/index.js";
import { baranselCharacter } from "./baransel/index.js";
import type { CharacterDefinition, SkillDefinition, TowerDefinition } from "./common/types.js";
import { melisCharacter } from "./melis/index.js";
import { omerCharacter } from "./omer/index.js";
import { onurCharacter } from "./onur/index.js";
import { ulkuCharacter } from "./ulku/index.js";
import { WALL_TOWER_ID, wallTower } from "./common/wall.js";
import { zeynepCharacter } from "./zeynep/index.js";

export type { CharacterDefinition, SkillDefinition, TowerDefinition };
export { attachTowerEngine, deriveTowerResources, getTowerAttackRadius, getTowerModeDamageType, getTowerSlowDurationMs } from "./common/engine.js";

export const characters: CharacterDefinition[] = [
  zeynepCharacter,
  atakanCharacter,
  melisCharacter,
  baranselCharacter,
  ulkuCharacter,
  omerCharacter,
  onurCharacter
];

/**
 * Duvar her karakterin listesine ekleniyor.
 *
 * Duvar bir karakterin kiti degil, herkesin kullandigi bir zemin araci; kule
 * arama yollari karakter kimligine gore calistigi icin listeye girmesi gerek.
 * Katalog yine de kule listesi: duvarin kendisi bir kule varyanti.
 */
const withWall = (towers: TowerDefinition[]) => [...towers, wallTower];

export const towerCatalog: Record<CharacterId, TowerDefinition[]> = {
  zeynep: withWall(zeynepCharacter.towers),
  warrior: withWall(atakanCharacter.towers),
  archer: withWall(melisCharacter.towers),
  mage: withWall(baranselCharacter.towers),
  healer: withWall(ulkuCharacter.towers),
  tank: withWall(omerCharacter.towers),
  onur: withWall(onurCharacter.towers)
};

export { WALL_EDGE_LENGTH, WALL_TOWER_ID, getStructureHealthMultiplier, isWallDefinition, wallTower } from "./common/wall.js";

/**
 * Her karakterin listesinde bulunan, kimseye ait olmayan yapilar.
 *
 * `towerCatalog` bir karakterin neyi kurabilecegini soyler; duvar oraya girer
 * cunku herkes kurabilir. Ama karakter kitini konu alan her yer -- kimlik
 * testleri, kodeks, tasarim tablolari -- kiti sormak ister, kurulabilirler
 * listesini degil. Ayrim burada aciktir.
 */
export const SHARED_STRUCTURE_IDS: readonly string[] = [WALL_TOWER_ID];

export function isSharedStructure(definition: Pick<TowerDefinition, "id">) {
  return SHARED_STRUCTURE_IDS.includes(definition.id);
}

/** Karakterin kendi kiti: ortak yapilar haric. */
export function getCharacterTowers(characterId: CharacterId): TowerDefinition[] {
  return towerCatalog[characterId].filter((tower) => !isSharedStructure(tower));
}

/**
 * Yapi kule kontenjanindan yer kapiyor mu.
 *
 * Kontenjan savas kuleleri icindir: oyuncu belli sayida kule kurabilir ve hangi
 * kuleleri kuracagi asil karardir. Kenara oturan yapilar bu karara girmez --
 * duvar da Abarti da kare degil cizgi kaplar, kendi basina ates etmez ve bir
 * kulenin yerini tutmaz. Hattini ormek icin hasar kulesinden vazgecmek
 * gerekseydi bu yapilar hicbir zaman kullanilmazdi.
 */
export function occupiesTowerSlot(definition: Pick<TowerDefinition, "id" | "engine">) {
  return !isSharedStructure(definition) && !definition.engine?.placement?.requiresEdge;
}
