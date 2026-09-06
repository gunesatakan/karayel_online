import assert from "node:assert/strict";
import test from "node:test";
import { getClientBufferedAmount, MatchRoom, roundNetworkNumber, SNAPSHOT_BACKPRESSURE_LIMIT_BYTES, stripWireDefaults } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

test("WebSocket bufferedAmount farklı taşıma şekillerinden okunur", () => {
  assert.equal(getClientBufferedAmount({ ref: { bufferedAmount: 1234 } }), 1234);
  assert.equal(getClientBufferedAmount({ ref: { _socket: { bufferedAmount: 5678 } } }), 5678);
  assert.equal(getClientBufferedAmount({ ref: {} }), 0);
});

test("snapshot sayıları tek ondalığa kırpılır", () => {
  assert.equal(roundNetworkNumber(234.56789123), 234.6);
  assert.equal(roundNetworkNumber(-1.234), -1.2);
});

test("kuyruğu dolu istemciye snapshot eklenmez", () => {
  const room = new MatchRoom();
  let healthySends = 0;
  let congestedSends = 0;
  room.clients.push(
    { ref: { bufferedAmount: 0 }, send() { healthySends += 1; } },
    { ref: { bufferedAmount: 300 * 1024 }, send() { congestedSends += 1; } }
  );

  assert.equal(room.sendSnapshotWithBackpressure({}), true);
  assert.equal(healthySends, 1);
  assert.equal(congestedSends, 0);
});

/**
 * Snapshot yuku.
 *
 * Iki kisilik bir odada bir oyuncunun pingi 999+ oluyor, kendi bastigi sey
 * karsi tarafta aninda gorunurken kendisinde gec geliyordu: komut yukari
 * cikiyor, sonuc o istemcinin cikis kuyrugunun arkasinda bekliyordu. Kuyrugu
 * dolduran sey snapshot boyutuydu -- 25. dalgada 26.7 KB, saniyede otuz kez,
 * yani bir telefona 6 Mbit/sn.
 *
 * Bedeli odeten sey JSON'da deger degil **anahtar adi**: kapali bir bayrak
 * (`"isUnderworldLinked":false`) 26 bayt tutuyor ve dusmanlarin cogunda o
 * bayraklarin hepsi kapali.
 */
test("kapalı bayraklar ve boş diziler telden düşer", () => {
  assert.deepEqual(
    stripWireDefaults({ id: "e1", hp: 12, isFeared: false, isUndead: true, perks: [], links: ["a"] }),
    { id: "e1", hp: 12, isUndead: true, links: ["a"] }
  );
});

test("sıfır ve boş metin telde kalır", () => {
  // Eksik bir sayi istemcide statik snapshottaki degere duser: `hp` icin bu,
  // olmek uzere olan bir dusmani dogdugu canla gostermek olurdu.
  assert.deepEqual(
    stripWireDefaults({ hp: 0, temperature: 0, status: "", level: 1 }),
    { hp: 0, temperature: 0, status: "", level: 1 }
  );
});

test("snapshot kapalı bayrak taşımaz", () => {
  const room = createRoom("warrior");
  room.wave = 6;
  room.clients = [];
  room.broadcast = () => {};
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  for (let index = 0; index < 12; index += 1) {
    room.spawnEnemy();
  }

  const snapshot = room.getSnapshot();
  assert.ok(snapshot.enemies.length > 0, "olcecek dusman yok");
  for (const entity of [...snapshot.enemies, ...snapshot.towers]) {
    for (const [field, value] of Object.entries(entity)) {
      assert.notEqual(value, false, `${field} kapali oldugu halde telde`);
      assert.ok(!Array.isArray(value) || value.length > 0, `${field} bos dizi oldugu halde telde`);
    }
  }
});

test("kuyruk sınırı birkaç snapshotluk kalır", () => {
  // Sinir 256 KB idi. Kuyruktaki her bayt o istemciye giden her seyin gecikmesi
  // demek, snapshot atmak ise istemcinin zaten aradegerledigi bir sey: gercek
  // zamanli oyunda atmak biriktirmekten iyidir.
  assert.ok(
    SNAPSHOT_BACKPRESSURE_LIMIT_BYTES <= 64 * 1024,
    `kuyruk siniri fazla buyuk: ${SNAPSHOT_BACKPRESSURE_LIMIT_BYTES}`
  );
});
