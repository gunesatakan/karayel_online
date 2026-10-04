/**
 * Bicak vurusu bayragi (`b`).
 *
 * Testere'nin bicaginin temas mesaji yok: istemci kesme sesini hasar
 * olayindan caliyor. Hangi olayin bicak temasi oldugunu yalnizca sunucu
 * biliyor -- konumdan tahmin etmek, sahibin yakindaki baska kulelerinde ve
 * kanama tiklerinde yanlis kesme, uzak bicak ucunda kayip ses demekti.
 *
 * Kilitlenen soz: bayrak yalnizca bicagin dogrudan temasindan dogan olayda;
 * kanama tiki, ayni sahibin baska kulesi ve bicak disindaki ayni kule
 * hasari tasimiyor; telde bayrak yoksa anahtar da yok.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { towerCatalog } from "../packages/shared/dist/index.js";
import { toDamageEventWire } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function place(room, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin kare yok`);
  const before = new Set(room.towers.keys());
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId });
  const tower = [...room.towers.values()].find((candidate) => !before.has(candidate.id));
  assert.ok(tower, `${definitionId} kurulamadi`);
  return tower;
}

function setup() {
  const room = createRoom("onur");
  room.broadcast = () => {};
  const saw = place(room, "onur-1");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  Object.assign(enemy, { maxHp: 100_000, hp: 100_000, shield: 0, maxShield: 0, armor: 0, x: saw.x, y: saw.y });
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return { room, saw, enemy };
}

const events = (room) => [...room.damageEvents.values()];

test("bicagin dogrudan temasi b:1 tasiyor ve telde kaliyor", () => {
  const { room, saw } = setup();
  room.damageEvents.clear();
  room.updateOrbitTower(saw, 0.02, Date.now());
  const hits = events(room);
  assert.ok(hits.length >= 1, "bicak dusmana degdi");
  assert.ok(hits.every((event) => event.b === 1), "bicak temasinin her olayi isaretli");
  assert.equal(toDamageEventWire(hits[0]).b, 1, "tel bayragi tasiyor");
  assert.equal(room.pendingOrbitHit, undefined, "bekleyen bicak kaydi tuketildi");
});

test("kanama tiki bicak vurusu degil", () => {
  const { room, saw, enemy } = setup();
  room.updateOrbitTower(saw, 0.02, Date.now());
  assert.equal(enemy.statusEffects.bleed?.sourceTowerId, saw.id, "bicak kanatti");
  room.damageEvents.clear();
  enemy.statusTickAt.bleed = 0;
  room.updateEnemyEngineStatusOutcomes(enemy, Date.now());
  const ticks = events(room);
  assert.ok(ticks.length >= 1, "kanama tiki olay birakti");
  assert.ok(ticks.every((event) => event.b === undefined), "kanama tiki isaretsiz");
  assert.ok(!("b" in toDamageEventWire(ticks[0])), "telde anahtar hic yok");
});

test("ayni sahibin baska kulesi ve bicak disindaki hasar isaretsiz", () => {
  const { room, saw, enemy } = setup();
  const other = place(room, "onur-2");
  room.damageEvents.clear();
  room.damageEnemyFromTower(other, enemy, 10, 0);
  // Ayni Testere'den ama bicak temasi disindan gelen hasar (ornegin bir etki).
  room.damageEnemyFromTower(saw, enemy, 10, 0);
  const hits = events(room);
  assert.equal(hits.length, 2);
  assert.ok(hits.every((event) => event.b === undefined), "yalnizca bicak temasi isaretli");
});
