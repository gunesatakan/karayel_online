/**
 * Kin dalgasinin itmesi (Taht Mührü iki Kin sentezi).
 *
 * Eskiden yer dusmaninin yalnizca ilerleme sayaci geri aliniyordu; dusman
 * akis alaniyla yurudugu icin yerinde kaliyordu (Ucube Geri Itme hatasinin
 * aynisi). Simdi dalga yonunde gercekten itiliyor; yapiya, harita disina
 * ve Metal Kalkan'in obur yanina degil.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function spawnAt(room, x, y) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0 });
  return enemy;
}

const center = (room) => {
  const bounds = room.getActiveWorldBounds();
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
};

test("Kin dalgasi yer dusmanini dalga yonunde gercekten itiyor", () => {
  const room = createRoom("zeynep");
  const { x, y } = center(room);
  const enemy = spawnAt(room, x, y);
  assert.notEqual(enemy.movementKind, "air");
  const before = { x: enemy.x, y: enemy.y };
  // Dalga yukari dogru (-y) ilerliyor.
  room.pushEnemyWithKinWave(enemy, { angle: -Math.PI / 2 }, 10);
  assert.ok(Math.abs(enemy.x - before.x) < 1e-6, `yana kaydi: ${enemy.x - before.x}`);
  assert.ok(Math.abs(before.y - enemy.y - 10) < 1e-6, `konum itilmedi: ${before.y} -> ${enemy.y}`);
});

test("Kin dalgasi dusmani harita disina ya da bir yapinin icine itmiyor", () => {
  const room = createRoom("zeynep");
  const bounds = room.getActiveWorldBounds();
  const edge = spawnAt(room, bounds.left + 2, bounds.top + bounds.height / 2);
  room.pushEnemyWithKinWave(edge, { angle: Math.PI }, 40);
  assert.ok(edge.x >= bounds.left, `harita disina itildi: ${edge.x}`);

  const spot = findBuildableSpot(room, "wall-1") ?? findBuildableSpot(room, "zeynep-1");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "zeynep-1" });
  const tower = [...room.towers.values()].at(-1);
  const cell = room.getMapCellSize ? room.getMapCellSize() : 34;
  const enemy = spawnAt(room, tower.x, tower.y - cell);
  room.pushEnemyWithKinWave(enemy, { angle: Math.PI / 2 }, cell);
  const into = Math.hypot(enemy.x - tower.x, enemy.y - tower.y) < cell * 0.4;
  assert.equal(into, false, "dusman kulenin karesine itildi");
});
