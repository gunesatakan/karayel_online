import test from "node:test";
import assert from "node:assert/strict";
import { createRoom } from "./helpers/match-room-harness.mjs";
import { gridToWorld, getHarvesterRaidCount, HARVESTER_QUOTA } from "../packages/shared/dist/index.js";

function setup(wave = 3) {
  const room = createRoom("warrior");
  room.mapScale = 1;
  room.configureArenaForScale();
  room.wave = wave;
  return room;
}
function spawn(room, start = gridToWorld(0, 3, room.activeMap)) {
  room.spawnEnemy(undefined, { kind: "harvester", type: "brute", healthMultiplier: 1, armorMultiplier: 1, start });
  return [...room.enemies.values()].at(-1);
}
function advanceUntil(room, condition, ticks = 5000) {
  for (let i = 0; i < ticks && !condition(); i++) room.updateEnemies(0.05);
  assert.ok(condition(), "worker should complete its route within the simulation budget");
}

test("raids arrive in large packs from both sides, once per wave after wave two", () => {
  assert.equal(getHarvesterRaidCount(2), 0);
  for (const wave of [3, 6, 9, 27]) {
    const room = setup(wave);
    room.waveSpawned = 0;
    room.spawnNextWaveEnemy();
    room.spawnNextWaveEnemy();
    const workers = [...room.enemies.values()].filter(e => e.special?.kind === "harvester");
    assert.equal(workers.length, getHarvesterRaidCount(wave));
    const left = gridToWorld(0, 0, room.activeMap).x;
    const right = gridToWorld(room.activeMap.cols - 1, 0, room.activeMap).x;
    assert.equal(workers.filter(e => e.x === left).length, Math.ceil(workers.length / 2));
    assert.equal(workers.filter(e => e.x === right).length, Math.floor(workers.length / 2));
    room.spawnNextWaveEnemy();
    assert.equal([...room.enemies.values()].filter(e => e.special?.kind === "harvester").length, workers.length);
  }
});

test("worker health matches a brute at the same wave, shield equals its full health", () => {
  for (const wave of [3, 10, 20]) {
    const room = setup(wave);
    const worker = spawn(room);
    room.spawnEnemy(undefined, { kind: "heater", type: "brute", healthMultiplier: 1, armorMultiplier: 1, start: worker });
    const brute = [...room.enemies.values()].at(-1);
    assert.equal(worker.maxHp, brute.maxHp);
    assert.equal(worker.shield, worker.maxHp);
    assert.equal(worker.maxShield, worker.maxHp);
  }
});

test("collects a finite quota and escapes with cargo without nexus damage or kill reward", () => {
  const room = setup();
  const total = () => room.getMaterialNodes().reduce((sum, n) => sum + n.remaining, 0);
  const before = total(), health = room.teamHealth, kills = room.kills;
  const gold = room.state.players.get("p1").gold;
  const worker = spawn(room);
  advanceUntil(room, () => worker.special.harvest.returning);
  assert.ok(Math.abs(worker.special.harvest.total - HARVESTER_QUOTA) < 0.001);
  assert.ok(Math.abs(before - total() - HARVESTER_QUOTA) < 0.001);
  advanceUntil(room, () => !room.enemies.has(worker.id));
  assert.equal(room.teamHealth, health);
  assert.equal(room.kills, kills);
  assert.equal(room.state.players.get("p1").gold, gold);
});

test("lethal damage returns stolen cargo exactly once to its source node", () => {
  const room = setup();
  const worker = spawn(room);
  const before = room.getMaterialNodes().reduce((s, n) => s + n.remaining, 0);
  advanceUntil(room, () => worker.special.harvest.total >= 5);
  room.damageEnemy(worker, worker.hp + worker.shield * 3 + 100, 0, "test", "p1", "true");
  assert.equal(room.enemies.has(worker.id), false);
  assert.ok(Math.abs(room.getMaterialNodes().reduce((s, n) => s + n.remaining, 0) - before) < 0.001);
});

test("depleted resources are retargeted; all depleted means retreat, never a stuck wave", () => {
  const room = setup();
  for (const node of room.getMaterialNodes()) room.resourceNodeRemaining.set(node.id, 0);
  const node = room.getMaterialNodes()[0];
  room.resourceNodeRemaining.set(node.id, 2);
  const worker = spawn(room);
  advanceUntil(room, () => !room.enemies.has(worker.id));
  assert.equal(room.getNodeRemaining(node.id), 0);
  assert.ok(Math.abs(worker.special.harvest.total - 2) < 0.001);
});

test("many workers share the last resource units without duplicating or over-extracting", () => {
  const room = setup();
  for (const node of room.getMaterialNodes()) room.resourceNodeRemaining.set(node.id, 0);
  const nodes = room.getMaterialNodes();
  room.resourceNodeRemaining.set(nodes[0].id, 1);
  room.resourceNodeRemaining.set(nodes[1].id, 3);
  const workers = Array.from({ length: 8 }, () => spawn(room, nodes[0]));
  advanceUntil(room, () => workers.every(e => !room.enemies.has(e.id)));
  assert.ok(Math.abs(workers.reduce((s, e) => s + e.special.harvest.total, 0) - 4) < 0.001);
  assert.ok(room.getMaterialNodes().every(n => n.remaining === 0));
});

test("living raiders keep the wave open, cargo and retreat state reach clients", () => {
  const room = setup();
  const worker = spawn(room);
  room.waveSpawned = room.waveTarget;
  room.updateSpawning(16);
  assert.equal(room.setupPhase, false);
  advanceUntil(room, () => worker.special.harvest.returning);
  const snapshot = room.getSnapshot();
  const wire = snapshot.enemies.find(e => e.id === worker.id);
  assert.equal(wire.cargo, HARVESTER_QUOTA);
  assert.equal(wire.escaping, true);
  assert.equal(snapshot.team.enemiesLeft, 1);
});

test("workers respect blocking structures, and immobilization prevents gathering", () => {
  const room = setup();
  const node = room.getMaterialNodes()[0];
  const worker = spawn(room, node);
  room.updateHarvester(worker, 1, 0);
  assert.equal(worker.special.harvest.total, 0);
  room.updateHarvester(worker, 1, 1);
  assert.equal(worker.special.harvest.total, 8);
  const client = { sessionId: "p1", send() {} };
  const home = worker.special.harvest.home = gridToWorld(5, 5, room.activeMap);
  room.placeTower(client, { ...home, definitionId: "warrior-1" });
  const tower = [...room.towers.values()].at(-1);
  assert.ok(tower);
  tower.hp = tower.maxHp = 10000;
  worker.special.harvest.returning = true;
  advanceUntil(room, () => tower.hp < tower.maxHp);
  assert.ok(room.enemies.has(worker.id), "worker cannot leave through a blocking tower");
});

test("raid count is halved at every wave and grows gradually to twelve", () => {
  for (let wave = 3; wave <= 60; wave++) {
    assert.equal(getHarvesterRaidCount(wave), Math.min(24, 6 + 2 * Math.floor(wave / 3)) / 2);
  }
  assert.deepEqual([3, 6, 9, 12, 27].map(getHarvesterRaidCount), [4, 5, 6, 7, 12]);
});
