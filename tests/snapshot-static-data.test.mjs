import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateWireSnapshot,
  pruneStaticSnapshotCache,
  towerCatalog,
  usesLinearBallistics
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function setupRoom() {
  const room = createRoom("warrior");
  Object.assign(room.state.players.get("p1"), { ownedShopItemIds: [], shopOffers: [], shopRerolls: 0 });
  const events = [];
  room.broadcast = (type, payload) => events.push({ type, payload });
  return { room, events };
}

function placeFirstTower(room) {
  const definition = towerCatalog.warrior[0];
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  return [...room.towers.values()][0];
}

test("sabit düşman alanları wire snapshotta yok, değişken alanlar kalır", () => {
  const { room } = setupRoom();
  room.spawnEnemy();
  const enemy = room.getSnapshot().enemies[0];
  assert.equal(enemy.type, undefined);
  assert.equal(enemy.maxHp, undefined);
  assert.equal(enemy.attack, undefined);
  assert.equal(typeof enemy.hp, "number");
  assert.equal(typeof enemy.armor, "number");
  assert.equal(typeof enemy.pathDistance, "number");
});

test("enemy:spawn doğan düşman başına bir kez tam sabit veri yollar", () => {
  const { room, events } = setupRoom();
  room.spawnEnemy();
  room.spawnEnemy();
  const spawns = events.filter((event) => event.type === "enemy:spawn");
  assert.equal(spawns.length, 2);
  assert.equal(typeof spawns[0].payload.maxHp, "number");
  assert.equal(typeof spawns[0].payload.movementKind, "string");
});

test("kule kurulunca ve taşınınca sabit veri, satılınca remove mesajı gider", () => {
  const { room, events } = setupRoom();
  const tower = placeFirstTower(room);
  assert.equal(events.filter((event) => event.type === "tower:spawn").length, 1);
  const nextSpot = findBuildableSpot(room, tower.definition.id);
  assert.ok(nextSpot);
  const moved = room.refactorTower({ sessionId: "p1" }, { towerId: tower.id, ...nextSpot });
  assert.equal(moved, true);
  assert.equal(events.filter((event) => event.type === "tower:spawn").length, 2);
  room.sellTower({ sessionId: "p1" }, { towerId: tower.id });
  assert.equal(events.filter((event) => event.type === "tower:remove").length, 1);
});

test("snapshot:requestFull bütün aktif sabit düşman ve kule verisini döndürür", () => {
  const { room } = setupRoom();
  room.spawnEnemy();
  placeFirstTower(room);
  let response;
  room.sendFullStaticSnapshot({ send: (type, payload) => { response = { type, payload }; } });
  assert.equal(response.type, "snapshot:full");
  assert.equal(response.payload.enemies.length, 1);
  assert.equal(response.payload.towers.length, 1);
});

test("istemci sabit veri önbelleği ölen varlıkları temizler", () => {
  const cache = new Map([["alive", {}], ["dead", {}]]);
  pruneStaticSnapshotCache(cache, ["alive"]);
  assert.deepEqual([...cache.keys()], ["alive"]);
});

test("doğrusal mermi spawn mesajına taşınır ve wire snapshottan çıkar", () => {
  const { room, events } = setupRoom();
  const tower = placeFirstTower(room);
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  room.spawnTowerProjectile(tower, enemy);
  const projectile = [...room.projectiles.values()][0];
  assert.equal(usesLinearBallistics(projectile.hitType), true);
  assert.equal(events.filter((event) => event.type === "projectile:spawn").length, 1);
  assert.equal(room.getSnapshot().projectiles.some(({ id }) => id === projectile.id), false);
  room.projectiles.set("guided", { ...projectile, id: "guided", hitType: "focus" });
  assert.equal(room.getSnapshot().projectiles.some(({ id }) => id === "guided"), true);
});

test("50 düşman ve 10 kule snapshotı sabit alan ayrımıyla en az yüzde 30 küçülür", () => {
  const { room } = setupRoom();
  room.wave = 20;
  for (let index = 0; index < 50; index += 1) room.spawnEnemy();
  const first = placeFirstTower(room);
  for (let index = 1; index < 10; index += 1) {
    room.towers.set(`clone-${index}`, { ...first, id: `clone-${index}`, x: first.x + index * 34 });
  }
  const wire = room.getSnapshot();
  let full;
  room.sendFullStaticSnapshot({ send: (_type, payload) => { full = payload; } });
  const hydrated = hydrateWireSnapshot(
    wire,
    new Map(full.enemies.map((enemy) => [enemy.id, enemy])),
    new Map(full.towers.map((tower) => [tower.id, tower]))
  );
  assert.ok(hydrated);
  const wireBytes = Buffer.byteLength(JSON.stringify(wire));
  const legacyBytes = Buffer.byteLength(JSON.stringify(hydrated));
  assert.ok(wireBytes <= legacyBytes * 0.7, `${wireBytes} must be <= 70% of ${legacyBytes}`);
});
