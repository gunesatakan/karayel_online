/**
 * Gercek MatchRoom'u headless surerek kule atesini uctan uca test etmeyi saglar.
 *
 * Neden gercek oda: kule atesi, mermi carpismasi ve hasar uygulamasi tamamen
 * MatchRoom icinde yasiyor. Bu boru hattini shared modulleriyle taklit eden bir
 * test, MatchRoom'daki hatalari goremez; bu yuzden burada derlenmis sunucu
 * sinifinin kendisi surulur.
 *
 * onCreate cagrilmaz: setSimulationInterval gercek bir Colyseus saati baslatir
 * ve test surecini asili birakir. Odanin ihtiyac duydugu alanlar elle kurulur.
 */
import { MatchRoom } from "../../apps/server/dist/rooms/MatchRoom.js";
import {
  getMapGridSize,
  getMapOrigin,
  getPointAlongRuntimePath,
  gridToWorld,
  worldToGrid
} from "../../packages/shared/dist/index.js";

/** Kalkanli dusman profilleri. Kalkan efektif cani buyuttugu icin kritikler. */
export const SHIELDED_ENEMIES = {
  shooter: { type: "shooter", hp: 46, maxHp: 46, shield: 30, maxShield: 30, armor: 10 },
  brute: { type: "brute", hp: 84, maxHp: 84, shield: 18, maxShield: 18, armor: 34 }
};

export function createRoom(characterId) {
  const room = new MatchRoom();
  const player = {
    id: "p1",
    name: "Test",
    characterId,
    gold: 1_000_000,
    goldSpent: 0,
    experience: 0,
    towersBuilt: 0,
    ultimateCharge: 0,
    skillCooldowns: [],
    runModifiers: [],
    ownedShopItemIds: [],
    inventoryItemIds: [],
    ownedCardIds: [],
    reputation: 0,
    authorityChain: 0,
    authorityQuality: 0,
    approval: 50,
    stress: 0
  };
  room.state = { players: new Map([["p1", player]]) };
  room.gameStarted = true;
  room.setupPhase = false;
  room.wave = 1;
  return room;
}

/** Yolun ortasina en yakin insa edilebilir kareyi bulur. */
export function findBuildableSpot(room, definitionId) {
  const points = room.activePaths[0].points;
  const middle = points[Math.floor(points.length / 2)];
  const origin = worldToGrid(middle.x, middle.y, room.activeMap);
  for (let radius = 1; radius < 8; radius += 1) {
    const offsets = [
      [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius, radius], [-radius, -radius], [radius, -radius], [-radius, radius]
    ];
    for (const [dx, dy] of offsets) {
      const world = gridToWorld(origin.col + dx, origin.row + dy, room.activeMap);
      if (room.canPlaceTower(world.x, world.y, definitionId, "horizontal")) {
        return world;
      }
    }
  }
  return undefined;
}

/** Kuleye en yakin yol mesafesini dondurur. */
function findClosestPathDistance(path, x, y) {
  let bestDistance = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let distance = 0; distance < path.totalLength; distance += 2) {
    const point = getPointAlongRuntimePath(path, distance);
    const gap = Math.hypot(point.x - x, point.y - y);
    if (gap < bestGap) {
      bestGap = gap;
      bestDistance = distance;
    }
  }
  return bestDistance;
}

/**
 * Tek kule + tek hareketli kalkanli dusman kurar, dusmani kulenin menzilinden
 * gecirir ve gosterilen hasar ile gercekte inen cani birlikte olcer.
 *
 * `approachOffset`: dusman kulenin en yakin noktasindan bu kadar geride baslar,
 * boylece menzile hareket halinde girer.
 */
export function simulateTowerAgainstMovingShieldedEnemy({
  characterId,
  definition,
  enemyProfile,
  ticks = 240,
  tickMs = 50,
  approachOffset = 40
}) {
  const room = createRoom(characterId);
  const spot = findBuildableSpot(room, definition.id);
  if (!spot) {
    return { placed: false, reason: "insa edilebilir kare bulunamadi" };
  }

  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: definition.id });
  const tower = [...room.towers.values()][0];
  if (!tower) {
    return { placed: false, reason: "kule kurulamadi" };
  }
  // Kaynak kitlarini test disinda tut: amac hasar uygulamasini olcmek.
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  Object.assign(enemy, enemyProfile, {
    damageResistances: {},
    hitTypeResistances: {},
    statusResistances: {}
  });

  const path = room.activePaths[0];
  const closest = findClosestPathDistance(path, tower.x, tower.y);
  enemy.pathDistance = Math.max(0, closest - approachOffset);
  const start = getPointAlongRuntimePath(path, enemy.pathDistance);
  enemy.x = start.x;
  enemy.y = start.y;

  const startingEffectiveHp = enemy.hp + enemy.shield;

  // Hasarin canli dusman nesnesine mi yoksa bir kopyaya mi yazildigini say.
  let liveInstanceHits = 0;
  let detachedCopyHits = 0;
  let trackedAppliedDamage = 0;
  const applyDamage = room.damageEnemy.bind(room);
  room.damageEnemy = function trackDamageTarget(target, ...rest) {
    const isLiveTarget = room.enemies.get(target.id) === target;
    const effectiveHpBefore = target.hp + target.shield;
    if (isLiveTarget) {
      liveInstanceHits += 1;
    } else {
      detachedCopyHits += 1;
    }
    const killed = applyDamage(target, ...rest);
    if (isLiveTarget) {
      trackedAppliedDamage += Math.max(0, effectiveHpBefore - (Math.max(0, target.hp) + Math.max(0, target.shield)));
    }
    return killed;
  };

  const seenDamageEventIds = new Set();
  let displayedDamage = 0;
  let killed = false;

  for (let tick = 0; tick < ticks; tick += 1) {
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.resetAuraSlows();
    room.updateTowers(tickMs);
    room.updateProjectiles(tickMs / 1000);
    room.updateZeynepRays(tickMs / 1000);
    room.updateKinWaves(tickMs / 1000);
    room.updateBurnZones();
    room.updateMelisCursePools();
    room.updateBeams(tickMs);
    room.updateEnemies(tickMs / 1000);

    for (const event of room.damageEvents.values()) {
      if (!seenDamageEventIds.has(event.id)) {
        seenDamageEventIds.add(event.id);
        displayedDamage += event.amount;
      }
    }

    if (!room.enemies.has(enemy.id)) {
      killed = true;
      break;
    }
  }

  const appliedDamage = trackedAppliedDamage;

  return {
    placed: true,
    displayedDamage,
    appliedDamage,
    startingEffectiveHp,
    killed,
    liveInstanceHits,
    detachedCopyHits,
    remainingHp: enemy.hp,
    remainingShield: enemy.shield
  };
}

/** Hasar veren kuleler: hasarsiz kontrol/lojistik kuleleri disarida kalir. */
export function isDamageDealingTower(definition) {
  return !definition.resourceProvider && definition.damage > 0;
}

/**
 * Kenara oturan yapilar icin nokta bulur.
 *
 * `findBuildableSpot` kare merkezleri dondurur; duvar gibi kare kaplamayan
 * yapilar icin ise izgara cizgisi uzerinde bir nokta gerekiyor. Yon istenen
 * kenardan turetildigi icin cagirana ayrica yon vermek dusmez.
 */
export function findEdgeSpot(room, orientation, definitionId) {
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  for (let row = 1; row < room.activeMap.rows - 1; row += 1) {
    for (let col = 1; col < room.activeMap.cols - 1; col += 1) {
      const point = orientation === "vertical"
        ? { x: origin.x + col * gridSize, y: origin.y + row * gridSize + gridSize / 2 }
        : { x: origin.x + col * gridSize + gridSize / 2, y: origin.y + row * gridSize };
      if (room.canPlaceTower(point.x, point.y, definitionId, orientation)) return point;
    }
  }
  return undefined;
}
