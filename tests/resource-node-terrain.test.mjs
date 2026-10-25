/**
 * Kaynak dugumleri ve yasak bolge arazisi (apps/server/src/rooms/MatchRoom.ts).
 *
 * - Kaynak dugumleri gercekten yer kapliyor: kara dusmani dugumun karesine
 *   girmiyor, dolasiyor; ucan dusman ustunden geciyor. Toplayici (hasatci)
 *   hedefledigi dugume yine ulasiyor.
 * - Yasak bolgeler 3D'de tepe ya da cukur: kara dusmani ve isci bolge
 *   karesinden 0,66 hizla geciyor; ucan dusman etkilenmiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { BUILD_ZONE_TERRAIN_SPEED_MULTIPLIER, gridToWorld, worldToGrid } from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

MatchRoom.maxConcurrentRooms = 1000;

function arena(seed) {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [];
  room.mapScale = 1;
  room.resourceLayoutSeed = seed;
  room.configureArenaForScale();
  room.wave = 3;
  return room;
}

const nodeCells = (room) => Object.values(room.getResourceNodeCells());
const key = (cell) => `${cell.col}:${cell.row}`;

test("kara dusmani kaynak dugumunun karesine girmiyor, dolasip asagi iniyor", () => {
  for (const seed of [3, 17, 91]) {
    const room = arena(seed);
    room.buildZones = undefined;
    const nodes = new Set(nodeCells(room).map(key));
    for (const node of nodeCells(room)) assert.equal(room.isStructurePassable({ col: node.col, row: node.row - 1 }, node.col, node.row), false);
    // Dugumun tam ustunden, ust satirdan dogan dusman.
    const target = nodeCells(room)[0];
    room.spawnEnemy("grunt", { start: gridToWorld(target.col, 0, room.activeMap) });
    const enemy = [...room.enemies.values()].at(-1);
    const visited = new Set();
    let below = false;
    for (let tick = 0; tick < 4000 && room.enemies.has(enemy.id); tick += 1) {
      room.updateEnemies(0.05);
      const cell = worldToGrid(enemy.x, enemy.y, room.activeMap);
      visited.add(key(cell));
      if (cell.row > target.row) below = true;
    }
    assert.ok(below, `tohum ${seed}: dusman dugumun altina inemedi`);
    for (const cell of visited) assert.ok(!nodes.has(cell), `tohum ${seed}: dusman dugum karesine girdi (${cell})`);
  }
});

test("ucan dusman dugumun ustunden geciyor; kural kapatilinca kara dusmani da", () => {
  const room = arena(3);
  const node = nodeCells(room)[0];
  assert.equal(room.getTerrainSpeedMultiplier("air", node.col, node.row), 1);
  room.resourceNodesSolid = false;
  assert.equal(room.isStructurePassable({ col: node.col, row: node.row - 1 }, node.col, node.row), true);
});

test("yasak bolgede kara birligi 0,66 hizla; disinda ve havada tam hiz", () => {
  const room = arena(55);
  const { cols } = room.buildZones;
  const zone = room.buildZones.cells.map((index) => ({ col: index % cols, row: Math.floor(index / cols) }));
  assert.ok(zone.length > 0);
  for (const cell of zone) {
    assert.equal(room.getTerrainSpeedMultiplier("ground", cell.col, cell.row), BUILD_ZONE_TERRAIN_SPEED_MULTIPLIER);
    assert.equal(room.getTerrainSpeedMultiplier("air", cell.col, cell.row), 1);
  }
  assert.equal(BUILD_ZONE_TERRAIN_SPEED_MULTIPLIER, 0.66);
  const free = { col: 0, row: 1 };
  assert.ok(!room.getBuildZoneLookup().has(free.col, free.row));
  assert.equal(room.getTerrainSpeedMultiplier("ground", free.col, free.row), 1);
});

test("dusman bolge karesinde ayni tikte 0,66 kadar yol aliyor", () => {
  const room = arena(55);
  room.resourceNodesSolid = false;
  const { cols } = room.buildZones;
  const inZone = room.buildZones.cells.map((index) => ({ col: index % cols, row: Math.floor(index / cols) }))
    .find((cell) => cell.row > 2 && !room.getBuildZoneLookup().has(cell.col, cell.row + 1));
  const outside = { col: inZone.col, row: 1 };
  const step = (cell) => {
    room.enemies.clear();
    room.spawnEnemy("grunt", { start: gridToWorld(cell.col, cell.row, room.activeMap) });
    const enemy = [...room.enemies.values()].at(-1);
    const before = enemy.pathDistance;
    room.updateEnemies(0.05);
    return enemy.pathDistance - before;
  };
  const zoneStep = step(inZone);
  const freeStep = step(outside);
  assert.ok(freeStep > 0);
  assert.ok(Math.abs(zoneStep / freeStep - BUILD_ZONE_TERRAIN_SPEED_MULTIPLIER) < 0.02, `${zoneStep} / ${freeStep}`);
});

test("isci bolge karesinde 0,66 hizla yuruyor", () => {
  const room = arena(55);
  const { cols } = room.buildZones;
  const cell = room.buildZones.cells.map((index) => ({ col: index % cols, row: Math.floor(index / cols) }))[0];
  const start = gridToWorld(cell.col, cell.row, room.activeMap);
  const free = gridToWorld(0, 1, room.activeMap);
  const walk = (from) => {
    const worker = { x: from.x, y: from.y, vx: 0, vy: 0, ownerId: "p1", mode: "crystalCollector", speed: undefined };
    room.stepWorkerToward(worker, from.x + 400, from.y, 0.05);
    return Math.hypot(worker.vx, worker.vy);
  };
  const ratio = walk(start) / walk(free);
  assert.ok(Math.abs(ratio - BUILD_ZONE_TERRAIN_SPEED_MULTIPLIER) < 1e-9, `${ratio}`);
});
