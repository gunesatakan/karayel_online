/**
 * Harita devri.
 *
 * Sunucu istemcinin gonderdigi haritayi oynamiyor: olcege gore kendi arenasini
 * uretiyor. Yani istemcinin cizdigi tahtanin sunucunun simule ettigiyle ayni
 * olmasi tamamen haritanin devredilmesine bagli. Bu devir yalnizca \`match:map\`
 * mesajiyla yapilirsa yaris var -- mesaj \`onJoin\` icinde, istemci dinleyicilerini
 * takmadan once cikiyor. Kacirildiginda istemci menudeki haritayi cizmeye devam
 * ediyor: kareler bir yerde, dusmanlar baska yerde, dokunuslar ucuncu bir yerde.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createOpenArenaMap, getMapWorldBounds } from "../packages/shared/dist/index.js";
import { createFullStaticSnapshot } from "../apps/server/dist/snapshot/static-data.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

test("tam anlik goruntu sunucunun arenasini tasir", () => {
  const map = createOpenArenaMap(12, 18);
  const snapshot = createFullStaticSnapshot([], [], map);

  assert.ok(snapshot.map, "anlik goruntude harita yok");
  assert.equal(snapshot.map.cols, 12);
  assert.equal(snapshot.map.rows, 18);
});

test("istemciye giden anlik goruntu odanin oynadigi haritayi tasir", () => {
  const room = createRoom("warrior");
  let sent;
  const client = { sessionId: "p1", send(type, payload) { if (type === "snapshot:full") sent = payload; } };

  room.sendFullStaticSnapshot(client);

  assert.ok(sent, "tam anlik goruntu gonderilmedi");
  assert.ok(sent.map, "tam anlik goruntude harita yok");
  assert.equal(sent.map.cols, room.activeMap.cols, "gonderilen harita odanin haritasi degil");
  assert.equal(sent.map.rows, room.activeMap.rows);
});

test("dusmanlar yalnizca arenanin sutunlarinda dogar", () => {
  // Dusmanin harita disinda gorunmesinin tek yolu istemcinin baska bir harita
  // cizmesi: sunucu hicbir dusmani tahtanin disina koymuyor.
  const room = createRoom("warrior");
  const bounds = getMapWorldBounds(room.activeMap);

  for (let index = 0; index < 200; index += 1) {
    room.spawnEnemy();
  }

  for (const enemy of room.enemies.values()) {
    assert.ok(enemy.x >= bounds.left, `dusman haritanin solunda: ${enemy.x}`);
    assert.ok(enemy.x <= bounds.right, `dusman haritanin saginda: ${enemy.x}`);
    assert.ok(enemy.y >= bounds.top, `dusman haritanin ustunde: ${enemy.y}`);
  }
});

test("dusmanlar yururken de tahtanin disina cikmaz", () => {
  const room = createRoom("warrior");
  const bounds = getMapWorldBounds(room.activeMap);
  for (let index = 0; index < 40; index += 1) {
    room.spawnEnemy();
  }

  for (let tick = 0; tick < 400; tick += 1) {
    room.updateEnemies(0.016);
  }

  for (const enemy of room.enemies.values()) {
    assert.ok(
      enemy.x >= bounds.left && enemy.x <= bounds.right,
      `dusman yururken tahtanin disina cikti: ${enemy.x}`
    );
  }
});
