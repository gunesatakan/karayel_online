import {
  BODY_DEFAULT_HEADING_X,
  BODY_DEFAULT_HEADING_Y,
  type BuildZoneMap,
  type EditableMapData,
  type StaticEnemySnapshot,
  type StaticSnapshot,
  type StaticTowerSnapshot
} from "@karayel/shared";

type EnemyStaticSource = Omit<StaticEnemySnapshot, "hx" | "hy">;

type TowerStaticSource = {
  id: string;
  ownerId: string;
  ownerName: string;
  characterId: StaticTowerSnapshot["characterId"];
  x: number;
  y: number;
  orientation?: StaticTowerSnapshot["orientation"];
  ammoType?: StaticTowerSnapshot["ammoType"];
  buildGold?: number;
  builtInSetupSession?: number;
  definition: {
    id: string;
    name: string;
    color: number;
    engine?: { resources: { shotFuel: "ammo" | "energy"; operatingEnergyPerSecond: number } };
    resourceProvider?: StaticTowerSnapshot["resourceProvider"];
  };
};

type EnemyStaticModel = Omit<EnemyStaticSource, "champion" | "special"> & {
  champion?: unknown;
  special?: { kind: StaticEnemySnapshot["special"] };
  /** Sunucunun govdesi: yonu son giden snapshot'ta olculdu (`noteSnapshotHeadings`). */
  body?: { headingX: number; headingY: number };
};

export function createStaticEnemySnapshot(enemy: EnemyStaticModel): StaticEnemySnapshot {
  const snapshot: StaticEnemySnapshot = {
    id: enemy.id,
    type: enemy.type,
    race: enemy.race,
    maxHp: enemy.maxHp,
    attack: enemy.attack,
    healthRegenPerSecond: enemy.healthRegenPerSecond,
    maxShield: enemy.maxShield,
    movementKind: enemy.movementKind,
    pathId: enemy.pathId
  };
  // Bayrak yalnizca sampiyonda: `champion: undefined` anahtari msgpack'te yine
  // yaziliyor, o yuzden kosullu. Sunucu modelinde alan butce kaydini tasiyor;
  // tele yalnizca "var" bilgisi cikiyor.
  if (enemy.champion) snapshot.champion = true;
  // Ozel dusman turu da yalnizca varken; sunucu modelindeki durum (emme,
  // butce) tele cikmiyor, yalnizca tur.
  if (enemy.special?.kind) snapshot.special = enemy.special.kind;
  // Yon tohumu yalnizca dondurulmemis dokudan farkliysa: dogumda (`enemy:spawn`)
  // hep +y, anahtar yazilmiyor; tam statik kayitta sonradan gelen istemcinin
  // izi dusmani sunucunun yonuyle baslatiyor (degerler bire bir, yuvarlanmadan).
  const body = enemy.body;
  if (body && (body.headingX !== BODY_DEFAULT_HEADING_X || body.headingY !== BODY_DEFAULT_HEADING_Y)) {
    snapshot.hx = body.headingX;
    snapshot.hy = body.headingY;
  }
  return snapshot;
}

export function createStaticTowerSnapshot(tower: TowerStaticSource, coolingRate = 3): StaticTowerSnapshot {
  return {
    id: tower.id,
    ownerId: tower.ownerId,
    ownerName: tower.ownerName,
    characterId: tower.characterId,
    definitionId: tower.definition.id,
    name: tower.definition.name,
    x: tower.x,
    y: tower.y,
    orientation: tower.orientation,
    buildGold: tower.buildGold,
    builtInSetupSession: tower.builtInSetupSession,
    color: tower.definition.color,
    ammoType: tower.ammoType,
    shotFuel: tower.definition.engine?.resources.shotFuel,
    operatingEnergyPerSecond: tower.definition.engine?.resources.operatingEnergyPerSecond,
    resourceProvider: tower.definition.resourceProvider,
    coolingRate
  };
}

export function createFullStaticSnapshot(
  enemies: Iterable<EnemyStaticModel>,
  towers: Iterable<TowerStaticSource>,
  map?: EditableMapData,
  buildZones?: BuildZoneMap
): StaticSnapshot {
  const snapshot: StaticSnapshot = {
    enemies: Array.from(enemies, createStaticEnemySnapshot),
    towers: Array.from(towers, (tower) => createStaticTowerSnapshot(tower)),
    map
  };
  // Kurulum yasak bolgeler yalnizca burada gidiyor (mac basina sabit). Bos
  // ya da arena kurulmadan once anahtar hic yazilmiyor.
  if (buildZones && buildZones.cells.length > 0) {
    snapshot.buildZones = { cols: buildZones.cols, rows: buildZones.rows, cells: [...buildZones.cells] };
  }
  return snapshot;
}
