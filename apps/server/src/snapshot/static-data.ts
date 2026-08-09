import type {
  StaticEnemySnapshot,
  StaticSnapshot,
  StaticTowerSnapshot
} from "@karayel/shared";

type EnemyStaticSource = StaticEnemySnapshot;

type TowerStaticSource = {
  id: string;
  ownerId: string;
  ownerName: string;
  characterId: StaticTowerSnapshot["characterId"];
  x: number;
  y: number;
  orientation?: StaticTowerSnapshot["orientation"];
  ammoType?: StaticTowerSnapshot["ammoType"];
  definition: {
    id: string;
    name: string;
    color: number;
    engine?: { resources: { shotFuel: "ammo" | "energy"; operatingEnergyPerSecond: number } };
    resourceProvider?: StaticTowerSnapshot["resourceProvider"];
  };
};

export function createStaticEnemySnapshot(enemy: EnemyStaticSource): StaticEnemySnapshot {
  return {
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
    color: tower.definition.color,
    ammoType: tower.ammoType,
    shotFuel: tower.definition.engine?.resources.shotFuel,
    operatingEnergyPerSecond: tower.definition.engine?.resources.operatingEnergyPerSecond,
    resourceProvider: tower.definition.resourceProvider,
    coolingRate
  };
}

export function createFullStaticSnapshot(
  enemies: Iterable<EnemyStaticSource>,
  towers: Iterable<TowerStaticSource>
): StaticSnapshot {
  return {
    enemies: Array.from(enemies, createStaticEnemySnapshot),
    towers: Array.from(towers, (tower) => createStaticTowerSnapshot(tower))
  };
}
