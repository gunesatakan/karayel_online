import assert from "node:assert/strict";
import test from "node:test";
import { getClientBufferedAmount, MatchRoom, roundNetworkNumber, SNAPSHOT_BACKPRESSURE_LIMIT_BYTES, SNAPSHOT_SEND_INTERVAL_MS, stripWireDefaults, idleSnapshotSignature } from "../apps/server/dist/rooms/MatchRoom.js";
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

/**
 * Dalga arasi sessizligi.
 *
 * Oyuncunun kart sectigi an, kuyrugunun bosalmasi gereken tek an. Oysa dalga
 * arasinda oyun dursa da snapshot yayini durmuyordu: 20 kuleyle saniyede
 * 175 KB, ve altmis karenin elli sekizi `serverTime` disinda bire bir ayni
 * veri. Kart teklifi ve oyuncunun cevabi o birikintinin arkasinda bekliyordu.
 */

/** Oda saati `performance.now` okuyor; ikisini birden ilerletmeden olculemez. */
/**
 * Sunucunun kendi tik hizi: Colyseus varsayilani 60 Hz.
 *
 * Yardimci bir donem 50 ms'lik tiklerle suruyordu ve bu, gonderim sikligini
 * olcen testleri sessizce yanlis dayanaga oturtuyordu: aralik tik sinirlarinda
 * kontrol edildigi icin gercek hiz tik boyutuna yuvarlaniyor. 50 ms'lik tikle
 * 60 ms'lik aralik 10 kare/sn veriyor, uretimde ise 15.
 */
const SERVER_TICK_MS = 1000 / 60;

function driveRoom(room, seconds) {
  const realDate = Date.now;
  const realPerf = performance.now.bind(performance);
  let dateMs = realDate();
  let perfMs = realPerf();
  Date.now = () => dateMs;
  performance.now = () => perfMs;
  try {
    for (let elapsed = 0; elapsed < seconds * 1000; elapsed += SERVER_TICK_MS) {
      dateMs += SERVER_TICK_MS;
      perfMs += SERVER_TICK_MS;
      room.update(SERVER_TICK_MS);
    }
  } finally {
    Date.now = realDate;
    performance.now = realPerf;
  }
}

function countingRoom(towerCount) {
  const room = createRoom("warrior");
  room.wave = 15;
  let sent = 0;
  room.clients = [{
    sessionId: "p1",
    ref: { bufferedAmount: 0 },
    send: (type) => { if (type === "snapshot") sent += 1; }
  }];
  room.broadcast = () => {};
  for (let index = 0; index < towerCount; index += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    if (!spot) break;
    room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  }
  return { room, sent: () => sent };
}

test("duran tahtada aynı snapshot tekrar gönderilmez", () => {
  const { room, sent } = countingRoom(20);
  room.setupPhase = true;
  room.enemies.clear();

  driveRoom(room, 5);

  // Bes saniyede yirmi Hz yuz snapshot ederdi; geriye yalnizca nabiz kalmali.
  assert.ok(sent() <= 15, `duraklamada ${sent()} snapshot gitti, nabizdan fazla`);
});

test("duran tahtada nabız yine de atar", () => {
  // Tumden susmak olmaz: istemcinin oynatma saati ve tamponu taze kalmali,
  // arada yeniden baglanan biri de guncel durumu gormeli.
  const { room, sent } = countingRoom(20);
  room.setupPhase = true;
  room.enemies.clear();

  driveRoom(room, 5);

  assert.ok(sent() >= 5, `duraklamada yalnizca ${sent()} snapshot gitti, nabiz durmus`);
});

test("dalga sırasında hiçbir snapshot atlanmaz", () => {
  const { room, sent } = countingRoom(20);
  room.setupPhase = false;
  for (let index = 0; index < 30; index += 1) {
    room.spawnEnemy();
  }

  driveRoom(room, 5);

  // Beklenen sayi sabitten turetiliyor, elle yazilmiyor: aralik degistiginde
  // testin anlami degismemeli. Tuttugu soz "dalga sirasinda kare atlanmaz",
  // "saniyede yirmi kare gider" degil.
  const beklenen = (5000 / SNAPSHOT_SEND_INTERVAL_MS) * 0.9;
  assert.ok(sent() >= beklenen, `dalga sirasinda yalnizca ${sent()} snapshot gitti, beklenen ${Math.round(beklenen)}`);
});

test("imza zaman damgasını saymaz", () => {
  // Ayni tahta, farkli an: gonderilecek yeni bir bilgi yok.
  const snapshot = { serverTime: 1000, enemies: [], towers: [{ id: "t1", hp: 5 }] };
  assert.equal(
    idleSnapshotSignature(snapshot),
    idleSnapshotSignature({ ...snapshot, serverTime: 9999 })
  );
  assert.notEqual(
    idleSnapshotSignature(snapshot),
    idleSnapshotSignature({ ...snapshot, towers: [{ id: "t1", hp: 4 }] })
  );
});
