import assert from "node:assert/strict";
import test from "node:test";
import {
  TOWER_BASE_CRITICAL_CHANCE,
  TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER,
  TOWER_GRID_SIZE,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function createJackpotRoom() {
  const room = createRoom("onur");
  const definition = towerCatalog.onur.find((tower) => tower.id === "onur-2");
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  return { room, tower: [...room.towers.values()][0], definition };
}

test("Jackpot uses physical projectiles, a two-cell range and a half-range dead zone", () => {
  const { room, tower, definition } = createJackpotRoom();
  assert.equal(definition.name, "Jackpot");
  assert.equal(definition.hitType, "projectile");
  assert.equal(definition.damageType, "physical");
  assert.equal(definition.engine.attack.minimumRangeMultiplier, 0.5);
  assert.equal(definition.engine.attack.rangeStartsAtFootprint, true);
  assert.equal(room.getTowerRange(tower), TOWER_GRID_SIZE * 2.5);
  assert.equal(room.getTowerMinimumRange(tower), TOWER_GRID_SIZE * 1.5);
  const hiza = towerCatalog.zeynep.find((tower) => tower.id === "zeynep-1");
  assert.equal(definition.damage, hiza.damage * 2);
  assert.equal(definition.fireIntervalMs, 4400);
  assert.equal(definition.projectileSpeed, 960);
});

test("Jackpot ignores every fire-rate increase and keeps its defined interval", () => {
  const { room, tower, definition } = createJackpotRoom();
  tower.level = 10;
  tower.performance = 1;
  tower.temperature = 80;
  tower.runModifiers.push({ source: "test", scope: "tower", stat: "fireRate", add: 5 });
  room.damageHasteUntil = Date.now() + 10_000;
  assert.equal(definition.engine.fixedFireInterval, true);
  assert.equal(room.getTowerFireInterval(tower), definition.fireIntervalMs);
});

test("Jackpot cannot select enemies inside its dead zone", () => {
  const { room, tower } = createJackpotRoom();
  room.spawnEnemy();
  room.spawnEnemy();
  const [near, far] = [...room.enemies.values()];
  near.x = tower.x + TOWER_GRID_SIZE * 0.75;
  near.y = tower.y;
  near.pathDistance = 999;
  far.x = tower.x + TOWER_GRID_SIZE * 1.5;
  far.y = tower.y;
  far.pathDistance = 1;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  assert.equal(room.findTowerTarget(tower)?.id, far.id);
});

test("Jackpot gains exactly twenty-five percent critical chance against bleeding enemies", () => {
  const { room, tower, definition } = createJackpotRoom();
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.maxHp = 1000;
  enemy.hp = 1000;
  enemy.shield = 0;
  enemy.armor = 0;
  enemy.damageResistances = {};
  enemy.hitTypeResistances = {};

  room.towerCriticalRandom = () => 0.24;
  room.damageEnemy(enemy, 10, 0, definition.id, tower.ownerId, "physical", 0, 1, tower.id, "projectile");
  assert.equal(enemy.hp, 990);

  enemy.hp = 1000;
  enemy.statusEffects.bleed = {
    type: "bleed",
    magnitude: 0.01,
    stacks: 1,
    expiresAt: Date.now() + 3000,
    sourceTowerId: "bleed-source",
    sourceOwnerId: tower.ownerId
  };
  room.damageEnemy(enemy, 10, 0, definition.id, tower.ownerId, "physical", 0, 1, tower.id, "projectile");
  assert.equal(enemy.hp, 980);

  enemy.hp = 1000;
  room.towerCriticalRandom = () => 0.26;
  room.damageEnemy(enemy, 10, 0, definition.id, tower.ownerId, "physical", 0, 1, tower.id, "projectile");
  assert.equal(enemy.hp, 990);
});

test("every tower has one percent base crit chance and double base crit damage", () => {
  const { room, tower, definition } = createJackpotRoom();
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.maxHp = 1000;
  enemy.shield = 0;
  enemy.armor = 0;
  enemy.damageResistances = {};
  enemy.hitTypeResistances = {};

  assert.equal(TOWER_BASE_CRITICAL_CHANCE, 0.01);
  assert.equal(TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER, 2);
  enemy.hp = 1000;
  room.towerCriticalRandom = () => 0.009;
  room.damageEnemy(enemy, 10, 0, definition.id, tower.ownerId, "physical", 0, 1, tower.id, "projectile");
  assert.equal(enemy.hp, 980);

  enemy.hp = 1000;
  room.towerCriticalRandom = () => 0.01;
  room.damageEnemy(enemy, 10, 0, definition.id, tower.ownerId, "physical", 0, 1, tower.id, "projectile");
  assert.equal(enemy.hp, 990);
});

test("crit modifiers add on top of base chance and double damage", () => {
  const { room, tower, definition } = createJackpotRoom();
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.hp = enemy.maxHp = 1000;
  enemy.shield = 0;
  enemy.armor = 0;
  enemy.damageResistances = {};
  enemy.hitTypeResistances = {};
  tower.runModifiers.push(
    { source: "test", scope: "tower", stat: "critChance", add: 0.12 },
    { source: "test", scope: "tower", stat: "critDamage", add: 1 }
  );
  room.towerCriticalRandom = () => 0.12;
  room.damageEnemy(enemy, 10, 0, definition.id, tower.ownerId, "physical", 0, 1, tower.id, "projectile");
  assert.equal(enemy.hp, 970);
});
