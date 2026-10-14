/**
 * Ucan dusmanlarin hedefi: en yakin nexus karesi.
 *
 * Eskiden butun ucanlar `activePaths[0]`in son noktasina, yani acik arenada
 * sol alt koseye uctu (ilk dogum noktasindan en yakin nexus karesi). Hava
 * dalgalari tek bir koseye akiyordu. Simdi her ucan kendi konumundan en yakin
 * nexus karesine iniyor: acik arenada alt satirin tamami nexus, en yakin kare
 * dusmanin tam altindaki kare. Sizinti ve nexus hasari ayni yoldan.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom } from "./helpers/match-room-harness.mjs";
import { gridToWorld, worldToGrid } from "../packages/shared/dist/index.js";

const TICK = 1 / 60;

function arena() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [];
  room.mapScale = 1;
  room.stage = 1;
  room.resourceLayoutSeed = 3;
  room.configureArenaForScale();
  return room;
}

function airEnemyAt(room, col, row) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.movementKind = "air";
  enemy.raceTrait = undefined;
  const world = gridToWorld(col, row, room.activeMap);
  enemy.x = world.x;
  enemy.y = world.y;
  return enemy;
}

test("açık arenada uçan düşman kendi sütununun altındaki nexus karesine yönelir", () => {
  const room = arena();
  const bottom = room.activeMap.rows - 1;
  for (const col of [0, 3, 6, room.activeMap.cols - 1]) {
    const enemy = airEnemyAt(room, col, 0);
    const route = room.findEnemyRoute(enemy);
    assert.equal(route.targetTower, undefined);
    assert.deepEqual(route.exitPoint, gridToWorld(col, bottom, room.activeMap), `${col}. sutun yanlis nexus karesine ucuyor`);
  }
});

test("uçanlar sol alt köşeye toplanmaz; sızıntı ve nexus hasarı işler", () => {
  const room = arena();
  const cols = [1, 5, 10];
  const enemies = cols.map((col) => airEnemyAt(room, col, 0));
  const landing = new Map();
  const healthBefore = room.teamHealth;
  for (let tick = 0; tick < 120 / TICK && room.enemies.size > 0; tick += 1) {
    for (const enemy of enemies) {
      if (room.enemies.has(enemy.id)) landing.set(enemy.id, worldToGrid(enemy.x, enemy.y, room.activeMap));
    }
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateEnemies(TICK);
  }
  assert.equal(room.enemies.size, 0, "ucanlar nexusa varamadi");
  enemies.forEach((enemy, index) => {
    const cell = landing.get(enemy.id);
    assert.equal(cell.row, room.activeMap.rows - 1, "ucan alt satira inmeden kayboldu");
    assert.equal(cell.col, cols[index], `${cols[index]}. sutunun ucani ${cell.col}. sutuna indi`);
  });
  assert.ok(room.teamHealth < healthBefore, "ucan sizinti nexusa hasar vermedi");
  assert.equal(room.runLedger.waveAirLeaks, cols.length, "hava sizintisi sayilmadi");
});

test("tek nexus kareli haritada uçanlar o kareye uçar", () => {
  // Varsayilan duzenleme haritasi: tek nexus karesi (10,17).
  const room = createRoom("warrior");
  const nexus = room.activeMap.tiles.flatMap((tile, index) => tile === "nexus" ? [index] : []);
  assert.equal(nexus.length, 1, "kurgu: haritada tek nexus karesi yok");
  const target = { col: nexus[0] % room.activeMap.cols, row: Math.floor(nexus[0] / room.activeMap.cols) };
  const enemy = airEnemyAt(room, 1, 0);
  assert.deepEqual(room.findEnemyRoute(enemy).exitPoint, gridToWorld(target.col, target.row, room.activeMap));
});

test("nexus hedefi harita değişince yeniden hesaplanır", () => {
  const room = createRoom("warrior");
  const first = room.getNearestNexusPoint(0, 0);
  room.mapScale = 1;
  room.stage = 1;
  room.broadcast = () => {};
  room.clients = [];
  room.configureArenaForScale();
  const enemy = airEnemyAt(room, 2, 0);
  const second = room.findEnemyRoute(enemy).exitPoint;
  assert.notDeepEqual(second, first, "eski haritanin nexus hedefi kullaniliyor");
  assert.deepEqual(second, gridToWorld(2, room.activeMap.rows - 1, room.activeMap));
});
