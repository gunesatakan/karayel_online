import type { CharacterId } from "../index.js";
import { atakanCharacter } from "./atakan/index.js";
import { baranselCharacter } from "./baransel/index.js";
import type { CharacterDefinition, SkillDefinition, TowerDefinition } from "./common/types.js";
import { melisCharacter } from "./melis/index.js";
import { omerCharacter } from "./omer/index.js";
import { onurCharacter } from "./onur/index.js";
import { ulkuCharacter } from "./ulku/index.js";
import { REPAIR_DEPOT_TOWER_ID, isRepairDepotDefinition, repairDepotTower } from "./common/repair-depot.js";
import { WALL_TOWER_ID, isWallDefinition, wallTower } from "./common/wall.js";
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
 * Ortak yapilar her karakterin listesine ekleniyor.
 *
 * Ikisi de bir karakterin kiti degil, herkesin kullandigi zemin araclari;
 * kule arama yollari karakter kimligine gore calistigi icin listeye girmeleri
 * gerek. Katalog yine de kule listesi: ikisi de birer kule varyanti.
 *
 * Tamir Merkezi'nin yedi ayri kopyasi yazilabilirdi -- kaynak binalari oyle
 * yazilmis -- ama Tamirci bir karakter yetenegi degil, herkesin alabildigi
 * bir isci rolu. Ussunun de kimseye ait olmamasi gerekiyor.
 */
const withSharedStructures = (towers: TowerDefinition[]) => [...towers, wallTower, repairDepotTower];

export const towerCatalog: Record<CharacterId, TowerDefinition[]> = {
  zeynep: withSharedStructures(zeynepCharacter.towers),
  warrior: withSharedStructures(atakanCharacter.towers),
  archer: withSharedStructures(melisCharacter.towers),
  mage: withSharedStructures(baranselCharacter.towers),
  healer: withSharedStructures(ulkuCharacter.towers),
  tank: withSharedStructures(omerCharacter.towers),
  onur: withSharedStructures(onurCharacter.towers)
};

export { WALL_EDGE_LENGTH, WALL_TOWER_ID, getStructureHealthMultiplier, isWallDefinition, wallTower } from "./common/wall.js";
export { REPAIR_DEPOT_TOWER_ID, isRepairDepotDefinition, repairDepotTower } from "./common/repair-depot.js";

/**
 * Her karakterin listesinde bulunan, kimseye ait olmayan yapilar.
 *
 * `towerCatalog` bir karakterin neyi kurabilecegini soyler; duvar oraya girer
 * cunku herkes kurabilir. Ama karakter kitini konu alan her yer -- kimlik
 * testleri, kodeks, tasarim tablolari -- kiti sormak ister, kurulabilirler
 * listesini degil. Ayrim burada aciktir.
 */
export const SHARED_STRUCTURE_IDS: readonly string[] = [WALL_TOWER_ID, REPAIR_DEPOT_TOWER_ID];

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
 * Olcut tek: yapi bir **kare** kapliyor mu. Kenara oturan yapilar -- duvar ve
 * Abarti -- kare degil cizgi kaplar, yani bir kulenin yerini tutmazlar.
 * Hattini ormek icin hasar kulesinden vazgecmek gerekseydi bu yapilar hicbir
 * zaman kullanilmazdi.
 *
 * Soru bir donem "ortak yapi mi" diye de soruluyordu, ama o fazlaligti:
 * tek ortak yapi duvardi ve duvar zaten kenara oturuyor. Fazlalik Tamir
 * Merkezi gelince zarar vermeye basladi -- o da ortak, ama kareyi kapliyor
 * ve kontenjandan yemesi gerek. Bir hasar kulesinden vazgecip onarim
 * altyapisi kurmak asil karar; bedava olsaydi karar olmazdi.
 */
/**
 * Yapi kural duzeyinde kule sayilir mi.
 *
 * Duvar depolamada bir kule varyanti -- yerlestirme, can, hasar, onarim ve
 * satis hatti oldugu gibi calissin diye. Ama kurallarin dilinde kule
 * degil: ates etmez, hedef almaz, komsuluk kurmaz, bir kulenin
 * yalnizligini bozmaz. Konum ve sayim soran her kural bu olcutten gecmeli.
 *
 * `occupiesTowerSlot` ile karistirilmamali: o kontenjan sorusu ve Abarti'yi
 * da eler, oysa Abarti gercek bir kule -- kenara oturuyor olmasi onu
 * komsuluktan ya da yalnizliktan muaf tutmaz.
 */
export function countsAsTower(definition: Pick<TowerDefinition, "id">) {
  return !isWallDefinition(definition);
}

export function occupiesTowerSlot(definition: Pick<TowerDefinition, "id" | "engine">) {
  return !definition.engine?.placement?.requiresEdge;
}
