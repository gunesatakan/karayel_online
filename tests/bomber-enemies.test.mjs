import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRoom } from "./helpers/match-room-harness.mjs";
import { gridToWorld, getBomberExplosionDamage, getSpecialEnemyDurability,
  getEnemySpawnHealth, getSpecialKindsForWave, planWaveSpecials, createSpecialRandom } from "../packages/shared/dist/index.js";

const client = { sessionId: "p1", send() {} };
function roomAt(wave = 1) {
  const room = createRoom("warrior");
  room.sent = [];
  room.broadcast = (type, data) => room.sent.push({ type, data });
  room.clients = [client];
  room.mapScale = 1;
  room.configureArenaForScale();
  room.stage = 2;
  room.wave = wave;
  return room;
}
function build(room, id, col, row) {
  const count = room.towers.size;
  room.placeTower(client, { ...gridToWorld(col, row, room.activeMap), definitionId: id });
  assert.equal(room.towers.size, count + 1);
  const tower = [...room.towers.values()].at(-1);
  tower.hp = tower.maxHp = 10000;
  tower.armor = 0;
  return tower;
}
function spawn(room, col, row) {
  room.spawnEnemy(undefined, { kind: "bomber", type: "grunt", ...getSpecialEnemyDurability("bomber"),
    start: gridToWorld(col, row, room.activeMap) });
  return [...room.enemies.values()].at(-1);
}
const blasts = room => room.sent.filter(event => event.type === "bomber:explode");

test("bomber seeks ammunition factories, ignoring closer warehouse and reactor", () => {
  const room = roomAt(8);
  const factory = build(room, "warrior-7", 7, 8);
  const reactor = build(room, "warrior-8", 3, 4);
  const warehouse = build(room, "warehouse-1", 5, 4);
  const enemy = spawn(room, 5, 1);
  const gold = room.state.players.get("p1").gold;
  for (let i = 0; i < 1200 && room.enemies.has(enemy.id); i++) room.updateEnemies(0.05);
  assert.equal(room.enemies.has(enemy.id), false);
  assert.equal(blasts(room).length, 1);
  assert.equal(blasts(room)[0].data.killed, false);
  assert.equal(factory.maxHp - factory.hp, getBomberExplosionDamage(8));
  assert.equal(reactor.hp, reactor.maxHp);
  assert.equal(warehouse.hp, warehouse.maxHp);
  assert.equal(room.state.players.get("p1").gold, gold, "self detonation grants no kill reward");
});

test("lethal damage causes exactly one half-strength area blast and retains kill rewards", () => {
  for (const wave of [1, 10, 20]) {
    const room = roomAt(wave);
    const factory = build(room, "warrior-7", 5, 5);
    const nearby = build(room, "warrior-1", 4, 4);
    const far = build(room, "warrior-1", 9, 9);
    const enemy = spawn(room, 5, 4);
    const gold = room.state.players.get("p1").gold;
    room.damageEnemy(enemy, enemy.hp + enemy.shield * 3 + 100, 0, "test", "p1", "true");
    assert.equal(room.enemies.has(enemy.id), false);
    assert.equal(factory.maxHp - factory.hp, getBomberExplosionDamage(wave) / 2);
    assert.equal(nearby.maxHp - nearby.hp, getBomberExplosionDamage(wave) / 2);
    assert.equal(far.hp, far.maxHp);
    room.detonateBomber(enemy, true);
    assert.equal(blasts(room).length, 1);
    assert.equal(blasts(room)[0].data.killed, true);
    assert.ok(room.state.players.get("p1").gold > gold);
  }
  assert.ok(getBomberExplosionDamage(20) > getBomberExplosionDamage(10));
});

test("without a factory the bomber uses the normal route; selling one invalidates its target", () => {
  const room = roomAt();
  const enemy = spawn(room, 5, 1);
  assert.equal(room.findSpecialEnemyRoute(enemy, "bomber"), undefined);
  const before = enemy.y;
  room.updateEnemies(0.1);
  assert.ok(enemy.y > before);
  assert.equal(blasts(room).length, 0);
  const factory = build(room, "warrior-7", 5, 6);
  assert.ok(room.findSpecialEnemyRoute(enemy, "bomber"));
  room.damageTower(factory, 100000, { pierceArmor: true });
  assert.equal(room.findSpecialEnemyRoute(enemy, "bomber"), undefined);
});

test("bomber respects route blockers before detonating", () => {
  const room = roomAt();
  const factory = build(room, "warrior-7", 5, 5);
  const blocker = build(room, "warrior-1", 5, 4);
  // Enclose the factory in occupied cells so every route first breaks a blocker.
  build(room, "warrior-1", 4, 5);
  build(room, "warrior-1", 6, 5);
  build(room, "warrior-1", 5, 6);
  const enemy = spawn(room, 5, 3);
  const route = room.findSpecialEnemyRoute(enemy, "bomber");
  assert.equal(route.targetTower.id, blocker.id);
  room.updateEnemies(0.05);
  assert.ok(blocker.hp < blocker.maxHp);
  assert.equal(factory.hp, factory.maxHp);
  assert.equal(blasts(room).length, 0);
});

test("wave spawn uses heavy bomber durability and introduces bombers after the tutorial", () => {
  const room = roomAt(8);
  const normal = getEnemySpawnHealth("grunt", 8);
  room.spawnSpecialEnemy({ kind: "bomber", index: 1, replaced: 1 });
  const bomber = [...room.enemies.values()].at(-1);
  assert.equal(bomber.special.kind, "bomber");
  assert.equal(bomber.maxHp, getEnemySpawnHealth("grunt", 8, 6).maxHp);
  assert.equal(bomber.armor, normal.armor * 4);
  assert.equal(getSpecialKindsForWave(1, 20).includes("bomber"), false);
  assert.equal(getSpecialKindsForWave(2, 7).includes("bomber"), false);
  assert.equal(getSpecialKindsForWave(2, 8).includes("bomber"), true);
  let seen = false;
  for (let seed = 0; seed < 50; seed++) {
    const plan = planWaveSpecials({ stage: 2, wave: 8, slotCount: 30, cols: 12, random: createSpecialRandom(seed, 8) });
    seen ||= plan.spawns.some(spawn => spawn.kind === "bomber");
  }
  assert.ok(seen);
});

test("all six bomber sprites are RGBA 512px PNG assets", () => {
  for (const race of ["meka", "spaceBug", "fourthDimensional", "holyGuardian", "fallen", "golem"]) {
    const png = readFileSync(new URL(`../apps/web/public/images/enemies/enemy-${race}-bomber.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
    assert.equal(png[25], 6);
  }
});
