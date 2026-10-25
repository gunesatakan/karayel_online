/**
 * Tepeler atis hattini kesiyor (apps/server/src/rooms/MatchRoom.ts,
 * packages/shared/src/build-zones.ts).
 *
 * - Yasak bolge lekeleri sirayla tepe ve cukur (`getBuildZoneReliefs`; 3D
 *   gorunum ayni kaynaktan ciziyor, 2D isaretliyor).
 * - Kule ile kara dusmani arasinda tepe varsa kule onu hedefleyemiyor.
 *   Cukurun ustunden atis geciyor; tepenin ustundeki dusman ve ucan dusman
 *   gorunuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBuildZoneHillLookup, getBuildZoneReliefs, getMapGridSize, gridToWorld, isLineBlockedByHill } from "../packages/shared/dist/index.js";
import { clearBuildZones, createRoom } from "./helpers/match-room-harness.mjs";

const COLS = 12;
const ROWS = 18;
const at = (col, row) => row * COLS + col;
// Tepe: 13. satirda 4-6. sutunlar (ilk leke, en kucuk karesi cift: tepe). Cukur: ayni satirda 8-10.
const HILL = [at(4, 13), at(5, 13), at(6, 13)];
const PIT = [at(8, 13), at(9, 13), at(10, 13)];

function arena() {
  const room = createRoom("warrior");
  const client = { sessionId: "p1", send() {} };
  room.broadcast = () => {};
  room.clients = [client];
  room.client = client;
  room.mapScale = 1;
  room.configureArenaForScale();
  clearBuildZones(room);
  room.stage = 3;
  room.wave = 8;
  assert.equal(room.activeMap.cols, COLS);
  assert.equal(room.activeMap.rows, ROWS);
  room.buildZones = { cols: COLS, rows: ROWS, cells: [...HILL, ...PIT].sort((a, b) => a - b), blobs: [HILL, PIT], source: "random", attempts: 1 };
  return room;
}

function tower(room, col, row) {
  const point = gridToWorld(col, row, room.activeMap);
  const before = room.towers.size;
  room.placeTower(room.client, { x: point.x, y: point.y, definitionId: "warrior-1" });
  assert.equal(room.towers.size, before + 1, `kule (${col},${row}) kurulamadi`);
  const placed = [...room.towers.values()].at(-1);
  placed.level = 10;
  return placed;
}

function enemy(room, col, row, movementKind = "ground") {
  room.spawnEnemy();
  const spawned = [...room.enemies.values()].at(-1);
  const point = gridToWorld(col, row, room.activeMap);
  Object.assign(spawned, {
    type: "grunt", movementKind, x: point.x, y: point.y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0,
    navigator: undefined, navigatorStep: undefined, structureTargetId: undefined, special: undefined, champion: undefined,
    attackRange: 0, towerAttackCooldownMs: 0, attack: 0, speed: 0, abilities: []
  });
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return spawned;
}

test("lekeler sirayla tepe ve cukur; ilk lekenin turu en kucuk karesinin ciftliginden", () => {
  assert.deepEqual(getBuildZoneReliefs({ cols: COLS, rows: ROWS, cells: [...HILL, ...PIT] }).map((relief) => relief.hill), [true, false]);
  // Ilk lekenin en kucuk karesi tekse ilk leke cukur.
  const odd = [at(5, 13), at(6, 13)];
  assert.deepEqual(getBuildZoneReliefs({ cols: COLS, rows: ROWS, cells: [...odd, ...PIT] }).map((relief) => relief.hill), [false, true]);
});

test("tepe atis hattini kesiyor; cukur ve hedefin durdugu tepe engel degil", () => {
  const hills = createBuildZoneHillLookup({ cols: COLS, rows: ROWS, cells: [...HILL, ...PIT] }, COLS, ROWS);
  const grid = { originX: 0, originY: 0, cellSize: 10 };
  const center = (col, row) => [(col + 0.5) * 10, (row + 0.5) * 10];
  assert.equal(isLineBlockedByHill(hills, grid, ...center(5, 15), ...center(5, 11)), true);
  assert.equal(isLineBlockedByHill(hills, grid, ...center(9, 15), ...center(9, 11)), false, "cukur engel");
  assert.equal(isLineBlockedByHill(hills, grid, ...center(5, 15), ...center(5, 13)), false, "tepedeki hedef");
});

test("kule tepenin ardindaki kara dusmanini hedefleyemiyor; cukurun ardindakini, tepedekini ve ucani hedefliyor", () => {
  const room = arena();
  const behindHill = tower(room, 5, 14);
  const range = room.getTowerRange(behindHill) / getMapGridSize(room.activeMap);
  assert.ok(range >= 2.2, `kule menzili kisa: ${range}`);
  const hidden = enemy(room, 5, 12);
  assert.equal(room.findTowerTarget(behindHill), undefined, "kule tepenin ardindaki dusmani hedefledi");
  // Cukurun ardindaki ayni uzakliktaki dusman.
  const overPit = tower(room, 9, 14);
  const pitTarget = enemy(room, 9, 12);
  assert.equal(room.findTowerTarget(overPit)?.id, pitTarget.id, "cukur atis hattini kesti");
  room.enemies.delete(pitTarget.id);
  // Tepenin ustundeki dusman gorunuyor.
  room.enemies.delete(hidden.id);
  const onHill = enemy(room, 5, 13);
  assert.equal(room.findTowerTarget(behindHill)?.id, onHill.id, "tepedeki dusman gorunmedi");
  room.enemies.delete(onHill.id);
  // Ucan dusman tepenin ustunden goruluyor.
  const flyer = enemy(room, 5, 12, "air");
  room.enemySpatialGrid.rebuild(room.enemies.values());
  assert.equal(room.findTowerTarget(behindHill)?.id, flyer.id, "ucan dusman tepenin ardinda kaldi");
});

test("bolge yokken hicbir hat engelli degil", () => {
  const room = arena();
  room.buildZones = undefined;
  const placed = tower(room, 5, 14);
  const target = enemy(room, 5, 12);
  assert.equal(room.findTowerTarget(placed)?.id, target.id);
});
