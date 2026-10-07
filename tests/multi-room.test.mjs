/**
 * Ayni sunucuda birden fazla mac.
 *
 * Sunucu bir donem tek odaliydi: bagli oyuncusu olan bir oda varken yeni oda
 * kurulamiyordu ("Zaten aktif bir oda var.") ve yeni oda kurulurken bos odalar
 * kapatiliyordu. Simdi her oda kendi durumuyla yasiyor; yalnizca toplam oda
 * sayisi sinirli. Solo oda ozel: listede yok, yabanci giremiyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { Server } from "colyseus";
import {
  ABANDONED_ROOM_DISPOSE_MS,
  DEFAULT_MAX_CONCURRENT_ROOMS,
  FRESH_ROOM_EVICTION_GRACE_MS,
  MatchRoom,
  ROOM_CREATE_LIMIT_PER_MINUTE,
  SERVER_FULL_ERROR_CODE,
  readMaxConcurrentRooms
} from "../apps/server/dist/rooms/MatchRoom.js";
import { FixedWindowRateLimiter } from "../apps/server/dist/rate-limit.js";
import { SERVER_FULL_MESSAGE, WIRE_DELTA_PROTOCOL, mergeDynamicRecordSnapshots } from "../packages/shared/dist/index.js";
import { findBuildableSpot } from "./helpers/match-room-harness.mjs";

let roomCounter = 0;

// Testler odalari elle kapatiyor; sinirin kendisini sinayanlar kendi
// degerini kuruyor. Digerleri varsayilan sinira (6) takilmasin.
MatchRoom.maxConcurrentRooms = 1000;

const OWNER_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";

function fakeClient(sessionId) {
  const client = {
    sessionId,
    ref: { bufferedAmount: 0 },
    sent: [],
    send(type, payload) { client.sent.push({ type, payload }); }
  };
  return client;
}

/** `onCreate`'ten gecen gercek oda; Colyseus saati ve yayin baglanmiyor. */
async function realRoom(options = { roomName: "Test", mapScale: 1 }, { listing } = {}) {
  const room = new MatchRoom();
  room.roomId = `coklu-${roomCounter += 1}`;
  if (listing) room.listing = listing;
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  await room.onCreate(options);
  return room;
}

function cleanup(...rooms) {
  for (const room of rooms) {
    if (!room) continue;
    MatchRoom.rooms.delete(room.roomId);
    MatchRoom.publicRooms.delete(room.roomId);
  }
}

function joinClient(room, sessionId, options = {}) {
  const client = fakeClient(sessionId);
  room.clients.push(client);
  room.onJoin(client, { playerName: sessionId, ...options });
  return client;
}

function handlerOf(room, type) {
  const handler = room.onMessageHandlers[type];
  assert.ok(handler, `${type} kayitli degil`);
  return (client, payload) => handler.callback(client, payload);
}

function soloRoom(name = "Solo") {
  return realRoom({ roomName: name, mapScale: 1, autoStart: true });
}

function soloRoomWithSecret(name = "Solo") {
  return realRoom({ roomName: name, mapScale: 1, autoStart: true, ownerSecret: OWNER_SECRET });
}

/** Mac basladi, istemci gitti ve penceresi kapandi: odada kimse yok, kimse beklenmiyor. */
function abandon(room, sessionId) {
  const player = room.state.players.get(sessionId);
  player.connected = false;
  room.clients = [];
  room.reconnectingSessionIds.delete(sessionId);
}

function listedIds() {
  return MatchRoom.listPublicRooms().map((listing) => listing.roomId);
}

function withClock(start) {
  const realNow = Date.now;
  let now = start;
  Date.now = () => now;
  return {
    advance(ms) { now += ms; },
    restore() { Date.now = realNow; }
  };
}

test("iki solo ve bir co-op lobisi ayni anda, birbirinden bagimsiz suruyor", async () => {
  const soloA = await soloRoom("A");
  const soloB = await soloRoom("B");
  const lobby = await realRoom({ roomName: "Lobi", mapScale: 1 });
  try {
    const a = joinClient(soloA, "a", { characterId: "warrior" });
    const b = joinClient(soloB, "b", { characterId: "zeynep" });
    joinClient(lobby, "c", { characterId: "warrior" });
    assert.equal(soloA.gameStarted, true);
    assert.equal(soloB.gameStarted, true);
    assert.equal(lobby.gameStarted, false);
    assert.equal(MatchRoom.countOpenRooms() >= 3, true);

    // Ayni karakter iki odada da secilebiliyor: lobi kurali oda basina.
    assert.equal(lobby.state.players.get("c").characterId, "warrior");

    // Dusmanlar ve kimlik sayaclari oda basina.
    for (let index = 0; index < 5; index += 1) soloA.spawnEnemy();
    soloB.spawnEnemy();
    assert.equal(soloA.enemies.size, 5);
    assert.equal(soloB.enemies.size, 1);
    assert.equal(lobby.enemies.size, 0);
    assert.deepEqual([...soloB.enemies.keys()], ["e1"], "kimlik sayaci baska odadan sizdi");
    for (const id of soloA.enemies.keys()) assert.equal(soloB.enemies.has(id) && soloB.enemies.get(id) === soloA.enemies.get(id), false);
    assert.equal(soloA.nextEnemyId, 6);
    assert.equal(soloB.nextEnemyId, 2);

    // Kule, altin ve dalga da oda basina.
    soloA.state.players.get("a").gold = 100_000;
    const spot = findBuildableSpot(soloA, "warrior-1");
    soloA.placeTower(a, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    assert.equal(soloA.towers.size, 1);
    assert.equal(soloB.towers.size, 0);
    assert.notEqual(soloB.state.players.get("b").gold, soloA.state.players.get("a").gold);
    soloA.wave = 7;
    assert.equal(soloB.wave, 1);
    assert.notEqual(soloA.state, soloB.state);
    assert.notEqual(soloA.activeMap, soloB.activeMap);
    void b;
  } finally {
    cleanup(soloA, soloB, lobby);
  }
});

test("A odasindaki bagli ve bos duran istemci B odasinin kurulmasini engellemiyor", async () => {
  const roomA = await realRoom({ roomName: "A", mapScale: 1 });
  let roomB;
  try {
    joinClient(roomA, "bekleyen", { characterId: "warrior" });
    let closedA = 0;
    roomA.disconnect = () => { closedA += 1; return Promise.resolve(); };
    roomB = await soloRoom("B");
    assert.equal(MatchRoom.rooms.get(roomB.roomId), roomB);
    assert.equal(closedA, 0);
    assert.equal(roomA.getConnectedPlayerCount(), 1);
  } finally {
    cleanup(roomA, roomB);
  }
});

test("B kurulurken pencere suren (0 bagli oyunculu) A kapatilmiyor", async () => {
  const roomA = await soloRoom("A");
  let roomB;
  try {
    const owner = joinClient(roomA, "sahip", { characterId: "warrior" });
    const pending = new Map();
    roomA.allowReconnection = (client) => new Promise((resolve, reject) => pending.set(client.sessionId, { resolve, reject }));
    roomA.clients.splice(0, 1);
    void roomA.onLeave(owner, false);
    assert.equal(roomA.getConnectedPlayerCount(), 0);
    assert.equal(roomA.reconnectingSessionIds.has("sahip"), true);
    let closedA = 0;
    roomA.disconnect = () => { closedA += 1; return Promise.resolve(); };

    roomB = await soloRoom("B");
    assert.equal(closedA, 0, "pencere suren mac kapatildi");
    assert.equal(roomA.reconnectingSessionIds.has("sahip"), true);
  } finally {
    cleanup(roomA, roomB);
  }
});

test("solo oda: listede yok, Colyseus'ta ozel, yabanci giremiyor; sahibi pencereden sonra sirriyla donebiliyor", async () => {
  const listing = { private: false, save() {} };
  const room = await realRoom({ roomName: "Solo", mapScale: 1, autoStart: true, ownerSecret: OWNER_SECRET }, { listing });
  const lobbyListing = { private: false, save() {} };
  const lobby = await realRoom({ roomName: "Lobi", mapScale: 1 }, { listing: lobbyListing });
  try {
    joinClient(room, "Atakan", { characterId: "warrior", ownerSecret: OWNER_SECRET });
    assert.equal(room.maxClients, 1);
    assert.equal(listing.private, true, "solo oda Colyseus eslestirmesinde acik");
    assert.equal(lobbyListing.private, false, "co-op lobisi ozel yapildi");
    assert.equal(room.hasJoinableSeat(), false);
    assert.equal(listedIds().includes(room.roomId), false);

    room.reportRoomError = () => {};
    assert.throws(() => room.onJoin(fakeClient("yabanci"), { characterId: "zeynep", playerName: "Yabanci" }), /Oda dolu/);

    // Pencere kapandi, sahip baglantisiz: yabanci yine giremiyor -- ayni ad
    // ve ayni operatorle de (oda kimligi HUD'da yaziyor), yanlis sirla da.
    const owner = room.state.players.get("Atakan");
    owner.connected = false;
    room.clients = [];
    assert.throws(() => room.onJoin(fakeClient("yabanci-2"), { characterId: "warrior", playerName: "Yabanci" }), /Oda dolu/);
    assert.throws(() => room.onJoin(fakeClient("taklitci"), { characterId: "warrior", playerName: "Atakan" }), /Oda dolu/, "ad ve operator sahipligi kanitladi");
    assert.throws(() => room.onJoin(fakeClient("tahminci"), { characterId: "warrior", playerName: "Atakan", ownerSecret: `${OWNER_SECRET.slice(0, -1)}0` }), /Oda dolu/);
    assert.equal(room.state.players.get("Atakan"), owner);
    assert.equal(listedIds().includes(room.roomId), false, "sahipsiz solo oda listeye dustu");

    // Sahip kayitli oda kimligi ve sirriyla donuyor.
    const back = fakeClient("Atakan-geri");
    room.clients.push(back);
    room.onJoin(back, { characterId: "warrior", playerName: "Atakan", ownerSecret: OWNER_SECRET });
    assert.equal(room.state.players.get("Atakan-geri"), owner);
    assert.equal(owner.connected, true);
    assert.equal(room.state.players.size, 1);
  } finally {
    cleanup(room, lobby);
  }
});

test("solo oda sirri: pencere icindeki geri alma da sir istiyor; sirsiz kurulan odaya gec donus yok; sir telde yok", async () => {
  const room = await soloRoomWithSecret("Pencere");
  const legacy = await soloRoom("Sirsiz");
  try {
    const owner = joinClient(room, "sahip", { characterId: "warrior", playerName: "Sahip", ownerSecret: OWNER_SECRET });
    const pending = [];
    room.allowReconnection = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
    room.clients = [];
    void room.onLeave(owner, false);
    assert.equal(room.reconnectingSessionIds.has("sahip"), true);
    room.reportRoomError = () => {};
    // Pencere suruyor: ad ve operator yetmiyor.
    assert.throws(() => room.onJoin(fakeClient("kopya"), { characterId: "warrior", playerName: "Sahip" }), /Oda dolu/);
    assert.equal(room.reconnectingSessionIds.has("sahip"), true, "yuva sirsiz gelene verildi");
    // Sirla gelen sahip yuvasini aliyor.
    const back = fakeClient("sahip-yeni");
    room.clients.push(back);
    room.onJoin(back, { characterId: "warrior", playerName: "Sahip", ownerSecret: OWNER_SECRET });
    assert.equal(room.state.players.get("sahip-yeni")?.name, "Sahip");

    // Sir hicbir giden veride yok: snapshot, lobi durumu, liste.
    const snapshot = JSON.stringify(room.getSnapshot());
    const lobbyState = JSON.stringify(room.getLobbyState());
    assert.equal(snapshot.includes(OWNER_SECRET), false);
    assert.equal(lobbyState.includes(OWNER_SECRET), false);
    assert.equal(JSON.stringify(back.sent).includes(OWNER_SECRET), false);

    // Sirsiz (eski istemcinin) solo odasina pencereden sonra kimse donemiyor.
    const legacyOwner = joinClient(legacy, "eski", { characterId: "warrior", playerName: "Eski" });
    legacy.state.players.get("eski").connected = false;
    legacy.clients = [];
    legacy.reportRoomError = () => {};
    void legacyOwner;
    assert.throws(() => legacy.onJoin(fakeClient("eski-geri"), { characterId: "warrior", playerName: "Eski" }), /Oda dolu/);
    assert.throws(() => legacy.onJoin(fakeClient("eski-sirli"), { characterId: "warrior", playerName: "Eski", ownerSecret: OWNER_SECRET }), /Oda dolu/);
  } finally {
    cleanup(room, legacy);
  }
});

test("liste yalnizca katilinabilir co-op odalarini gosteriyor", async () => {
  const open = await realRoom({ roomName: "Acik", mapScale: 1 });
  const full = await realRoom({ roomName: "Dolu", mapScale: 1 });
  const started = await realRoom({ roomName: "Suren", mapScale: 1 });
  const finished = await realRoom({ roomName: "Biten", mapScale: 1 });
  const closing = await realRoom({ roomName: "Kapanan", mapScale: 1 });
  const empty = await realRoom({ roomName: "Bos", mapScale: 1 });
  const solo = await soloRoom("Solo");
  const creative = await realRoom({ roomName: "Kum", mapScale: 1, autoStart: true, creative: true });
  try {
    joinClient(open, "o1", { characterId: "warrior" });
    ["warrior", "zeynep", "archer", "mage"].forEach((characterId, index) => joinClient(full, `f${index}`, { characterId }));
    const s1 = joinClient(started, "s1", { characterId: "warrior" });
    handlerOf(started, "lobby:setReady")(s1, { ready: true });
    handlerOf(started, "lobby:start")(s1);
    const b1 = joinClient(finished, "b1", { characterId: "warrior" });
    handlerOf(finished, "lobby:setReady")(b1, { ready: true });
    handlerOf(finished, "lobby:start")(b1);
    finished.finishMatch("defeat");
    joinClient(closing, "k1", { characterId: "warrior" });
    closing.abandonDisposing = true;
    joinClient(solo, "solo", { characterId: "warrior" });
    joinClient(creative, "kum", { characterId: "warrior" });

    const ids = listedIds();
    assert.equal(ids.includes(open.roomId), true, "acik lobi listede yok");
    assert.equal(ids.includes(started.roomId), true, "bos koltuklu suren co-op listede yok");
    for (const [name, room] of Object.entries({ full, finished, closing, empty, solo, creative })) {
      assert.equal(ids.includes(room.roomId), false, `${name} listede`);
    }
  } finally {
    cleanup(open, full, started, finished, closing, empty, solo, creative);
  }
});

test("liste cok odada ucuz: yalnizca listelenebilir odalar dolasiliyor", async () => {
  const rooms = [];
  const previousCap = MatchRoom.maxConcurrentRooms;
  MatchRoom.maxConcurrentRooms = 1000;
  try {
    for (let index = 0; index < 200; index += 1) {
      const room = await realRoom({ roomName: `Oda ${index}`, mapScale: 1, autoStart: index % 2 === 0 });
      joinClient(room, `p${index}`, { characterId: "warrior" });
      rooms.push(room);
    }
    let checks = 0;
    for (const room of rooms) {
      const original = room.hasJoinableSeat.bind(room);
      room.hasJoinableSeat = () => { checks += 1; return original(); };
    }
    const startedAt = performance.now();
    const listings = MatchRoom.listPublicRooms();
    const elapsed = performance.now() - startedAt;
    assert.equal(listings.length, 100);
    assert.equal(checks, 100, "solo odalar da dolasildi");
    assert.ok(elapsed < 50, `liste ${elapsed.toFixed(1)} ms surdu`);
  } finally {
    MatchRoom.maxConcurrentRooms = previousCap;
    cleanup(...rooms);
  }
});

test("oda siniri: dolunca kurulum Turkce mesajla reddediliyor, reddedilen oda zamanlayici sizdirmiyor", async () => {
  const previousCap = MatchRoom.maxConcurrentRooms;
  const rooms = [];
  try {
    MatchRoom.maxConcurrentRooms = MatchRoom.countOpenRooms() + 2;
    rooms.push(await soloRoom("Bir"), await realRoom({ roomName: "Iki", mapScale: 1 }));

    const rejected = new MatchRoom();
    rejected.roomId = `coklu-red-${roomCounter += 1}`;
    let simulation = 0;
    rejected.setSimulationInterval = () => { simulation += 1; };
    const released = [];
    rejected.setPatchRate = (value) => released.push(value);
    rejected.reportRoomError = () => {};
    await assert.rejects(rejected.onCreate({ roomName: "Uc", mapScale: 1 }), (error) => {
      assert.equal(error.message, SERVER_FULL_MESSAGE);
      assert.equal(error.message, "Sunucu dolu, biraz sonra tekrar dene.");
      assert.equal(error.code, SERVER_FULL_ERROR_CODE);
      return true;
    });
    assert.equal(MatchRoom.rooms.has(rejected.roomId), false, "reddedilen oda kayitta kaldi");
    assert.deepEqual(released, [null], "yama araligi durdurulmadi");
    assert.equal(rejected.clock.running, false, "saat durdurulmadi");
    assert.equal(simulation, 1, "simulasyon araligi temizlenmedi");

    // Bir oda kapaninca yer aciliyor.
    cleanup(rooms.pop());
    rooms.push(await realRoom({ roomName: "Yeni", mapScale: 1 }));
  } finally {
    MatchRoom.maxConcurrentRooms = previousCap;
    cleanup(...rooms);
  }
});

test("oda siniri ortam degiskeninden okunuyor; bozuk deger varsayilana dusuyor", () => {
  assert.equal(readMaxConcurrentRooms(undefined), DEFAULT_MAX_CONCURRENT_ROOMS);
  assert.equal(readMaxConcurrentRooms(""), DEFAULT_MAX_CONCURRENT_ROOMS);
  assert.equal(readMaxConcurrentRooms("abc"), DEFAULT_MAX_CONCURRENT_ROOMS);
  assert.equal(readMaxConcurrentRooms("0"), DEFAULT_MAX_CONCURRENT_ROOMS);
  assert.equal(readMaxConcurrentRooms("-3"), DEFAULT_MAX_CONCURRENT_ROOMS);
  assert.equal(readMaxConcurrentRooms("2.5"), DEFAULT_MAX_CONCURRENT_ROOMS);
  assert.equal(readMaxConcurrentRooms("50"), 50);
  // Paylasimli tek Fly cekirdeginin tasiyabilecegi: gec oyundaki oda hizli
  // masaustu cekirdeginin ~%9'u.
  assert.equal(DEFAULT_MAX_CONCURRENT_ROOMS, 6);
  assert.equal(readMaxConcurrentRooms("12"), 12, "ortam degiskeni varsayilani geciyor");
});

test("dolu sunucu: en uzun suredir terk edilmis oda kapatilip yeri yeni odaya veriliyor", async () => {
  const clock = withClock(50_000_000);
  const previousCap = MatchRoom.maxConcurrentRooms;
  const rooms = [];
  try {
    const older = await soloRoom("Eski terk");
    const newer = await soloRoom("Yeni terk");
    const busy = await soloRoom("Dolu");
    rooms.push(older, newer, busy);
    joinClient(older, "o", { characterId: "warrior" });
    joinClient(newer, "n", { characterId: "warrior" });
    joinClient(busy, "b", { characterId: "warrior" });
    for (const room of [older, newer, busy]) room.update(16);
    // Mac suruyor; iki odanin istemcisi gitti ve penceresi kapandi. Once
    // yeni gelenin istemcisi gidiyor, bir dakika sonra digerininki: liste
    // sirasi degil terk suresi belirleyici.
    abandon(older, "o");
    older.update(16);
    clock.advance(60_000);
    abandon(newer, "n");
    newer.update(16);
    busy.update(16);
    assert.ok(older.abandonedSince > 0 && older.abandonedSince < newer.abandonedSince);
    const closed = [];
    for (const [name, room] of Object.entries({ older, newer, busy })) {
      room.disconnect = () => { closed.push(name); return Promise.resolve(); };
    }

    MatchRoom.maxConcurrentRooms = MatchRoom.countOpenRooms();
    const fresh = await soloRoom("Yeni gelen");
    rooms.push(fresh);
    assert.deepEqual(closed, ["older"], "yerinden edilen en eski terk edilmis oda olmali");
    assert.equal(older.abandonDisposing, true);
    assert.equal(MatchRoom.rooms.get(fresh.roomId), fresh);
    assert.equal(MatchRoom.countOpenRooms(), MatchRoom.maxConcurrentRooms, "sinir asildi");

    // Siradaki kurulum ikinci terk edilmis odayi aliyor; bagli oda hic aday degil.
    rooms.push(await soloRoom("Bir daha"));
    assert.deepEqual(closed, ["older", "newer"]);
    await assert.rejects(soloRoom("Fazla"), (error) => error.message === SERVER_FULL_MESSAGE);
    assert.deepEqual(closed, ["older", "newer"], "bagli oyuncusu olan oda kapatildi");
  } finally {
    clock.restore();
    MatchRoom.maxConcurrentRooms = previousCap;
    cleanup(...rooms);
  }
});

test("dolu sunucu: bagli istemcili, penceresi acik, koltugu ayrilmis ya da yeni kurulmus oda kapatilmiyor", async () => {
  const clock = withClock(60_000_000);
  const previousCap = MatchRoom.maxConcurrentRooms;
  const rooms = [];
  try {
    const connected = await soloRoom("Bagli");
    const reconnecting = await soloRoom("Pencere");
    const reserved = await realRoom({ roomName: "Koltuk", mapScale: 1 });
    const brandNew = await realRoom({ roomName: "Yepyeni", mapScale: 1 });
    rooms.push(connected, reconnecting, reserved, brandNew);
    joinClient(connected, "c", { characterId: "warrior" });
    connected.state.players.get("c").connected = true;
    const r = joinClient(reconnecting, "r", { characterId: "warrior" });
    reconnecting.allowReconnection = () => new Promise(() => {});
    reconnecting.clients = [];
    void reconnecting.onLeave(r, false);
    // Lobiye biri girip cikti; simdi baskasinin koltugu ayrilmis, soketi yolda.
    const host = joinClient(reserved, "h", { characterId: "warrior" });
    reserved.clients = [];
    await reserved.onLeave(host, true);
    reserved.reservedSeats = { gelen: [{}, undefined, false, false] };
    clock.advance(FRESH_ROOM_EVICTION_GRACE_MS - 1);
    const closed = [];
    for (const [name, room] of Object.entries({ connected, reconnecting, reserved, brandNew })) {
      room.disconnect = () => { closed.push(name); return Promise.resolve(); };
    }

    MatchRoom.maxConcurrentRooms = MatchRoom.countOpenRooms();
    await assert.rejects(soloRoom("Reddedilen"), (error) => {
      assert.equal(error.message, SERVER_FULL_MESSAGE);
      assert.equal(error.code, SERVER_FULL_ERROR_CODE);
      return true;
    });
    assert.deepEqual(closed, []);

    // Hic kimsenin girmedigi oda koltuk suresi dolunca terk edilmis sayiliyor.
    clock.advance(1);
    rooms.push(await soloRoom("Sonunda"));
    assert.deepEqual(closed, ["brandNew"]);
  } finally {
    clock.restore();
    MatchRoom.maxConcurrentRooms = previousCap;
    cleanup(...rooms);
  }
});

test("oda kurma siniri: Colyseus /matchmake/create yolu IP basina dakikada 6 kurulum; katilim ve baska IP sayilmiyor", async () => {
  const previousLimiter = MatchRoom.roomCreateLimiter;
  const previousCap = MatchRoom.maxConcurrentRooms;
  const previousClaim = MatchRoom.claimRoomSlot;
  let now = 70_000_000;
  MatchRoom.roomCreateLimiter = new FixedWindowRateLimiter(ROOM_CREATE_LIMIT_PER_MINUTE, 60_000, () => now);
  // Kurulumlar sinirda reddediliyor: gercek oda (ve zamanlayicisi) kurulmuyor,
  // ama `onCreate`e ulasan her kurulum sayiliyor.
  MatchRoom.maxConcurrentRooms = 0;
  const claims = [];
  MatchRoom.claimRoomSlot = (room, at) => { claims.push(room.roomId); return previousClaim.call(MatchRoom, room, at); };
  const quietWarn = console.warn;
  // Colyseus `server` secenegi icin bir kullanimdan kalkma uyarisi basiyor.
  console.warn = () => {};
  const httpServer = createServer();
  const gameServer = new Server({ server: httpServer, greet: false, gracefullyShutdown: false });
  gameServer.define("match", MatchRoom);
  try {
    await gameServer.listen(0, "127.0.0.1");
    const base = `http://127.0.0.1:${httpServer.address().port}`;
    const call = async (method, ip, body = { roomName: "Sel", mapScale: 1 }) => {
      const response = await fetch(`${base}/matchmake/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Fly-Client-IP": ip },
        body: JSON.stringify(body)
      });
      return response.json();
    };

    for (let index = 0; index < ROOM_CREATE_LIMIT_PER_MINUTE; index += 1) {
      const result = await call("create/match", "203.0.113.7");
      assert.equal(result.error, SERVER_FULL_MESSAGE, "sinir 0: onCreate reddetmeli");
    }
    assert.equal(claims.length, ROOM_CREATE_LIMIT_PER_MINUTE);
    const throttled = await call("create/match", "203.0.113.7");
    assert.equal(throttled.error, SERVER_FULL_MESSAGE);
    assert.equal(claims.length, ROOM_CREATE_LIMIT_PER_MINUTE, "kisilan kurulum onCreate'e ulasti");
    const viaJoinOrCreate = await call("joinOrCreate/match", "203.0.113.7");
    assert.equal(viaJoinOrCreate.error, SERVER_FULL_MESSAGE);
    assert.equal(claims.length, ROOM_CREATE_LIMIT_PER_MINUTE, "joinOrCreate sinirdan kacti");

    // Baska IP etkilenmiyor; katilim (`joinById`) kurulum sayilmiyor.
    await call("create/match", "198.51.100.4");
    assert.equal(claims.length, ROOM_CREATE_LIMIT_PER_MINUTE + 1);
    const join = await call("joinById/yok-boyle-oda", "203.0.113.7", {});
    assert.notEqual(join.error, SERVER_FULL_MESSAGE, "katilim kurulum sinirina takildi");

    // IPv6: ayni /64 icindeki adresler ayni kovada.
    for (let index = 0; index < ROOM_CREATE_LIMIT_PER_MINUTE; index += 1) {
      await call("create/match", `2001:db8:1:2::${(index + 1).toString(16)}`);
    }
    const before = claims.length;
    await call("create/match", "2001:db8:1:2:ffff:eeee:dddd:cccc");
    assert.equal(claims.length, before, "ayni /64'ten yeni adres siniri asti");
    await call("create/match", "2001:db8:1:3::1");
    assert.equal(claims.length, before + 1, "komsu /64 ayni kovaya dustu");

    // Pencere gecince yeniden.
    now += 60_000;
    await call("create/match", "203.0.113.7");
    assert.equal(claims.length, before + 2);
  } finally {
    console.warn = quietWarn;
    MatchRoom.claimRoomSlot = previousClaim;
    MatchRoom.roomCreateLimiter = previousLimiter;
    MatchRoom.maxConcurrentRooms = previousCap;
    await gameServer.gracefullyShutdown(false).catch(() => {});
    await new Promise((resolve) => httpServer.close(() => resolve()));
  }
});

test("solo oda: sahibi kendi istegiyle cikinca beklemeden, kopunca on dakika sonra kapaniyor", async () => {
  const clock = withClock(30_000_000);
  const left = await soloRoom("Cikan");
  const dropped = await soloRoom("Kopan");
  try {
    const leaver = joinClient(left, "cikan", { characterId: "warrior" });
    const dropper = joinClient(dropped, "kopan", { characterId: "warrior" });
    dropped.allowReconnection = () => Promise.reject(new Error("pencere doldu"));
    const closed = [];
    left.disconnect = () => { closed.push("left"); return Promise.resolve(); };
    dropped.disconnect = () => { closed.push("dropped"); return Promise.resolve(); };
    left.clients = [];
    dropped.clients = [];
    await left.onLeave(leaver, true);
    await dropped.onLeave(dropper, false);
    for (let tick = 0; tick < 3; tick += 1) {
      clock.advance(16);
      left.update(16);
      dropped.update(16);
    }
    assert.deepEqual(closed, ["left"]);
    clock.advance(ABANDONED_ROOM_DISPOSE_MS);
    dropped.update(16);
    assert.deepEqual(closed, ["left", "dropped"]);
  } finally {
    clock.restore();
    cleanup(left, dropped);
  }
});

test("bos lobi beklemeden kapaniyor; kurucusu bekleyen lobi kapanmiyor", async () => {
  const clock = withClock(40_000_000);
  const empty = await realRoom({ roomName: "Bos", mapScale: 1 });
  const waiting = await realRoom({ roomName: "Bekleyen", mapScale: 1 });
  try {
    const closed = [];
    empty.disconnect = () => { closed.push("empty"); return Promise.resolve(); };
    waiting.disconnect = () => { closed.push("waiting"); return Promise.resolve(); };
    // Kurucunun koltugu ayrildi ama soketi henuz gelmedi.
    waiting.reservedSeats = { kurucu: [{}, undefined, false, false] };
    const host = joinClient(empty, "h", { characterId: "warrior" });
    empty.clients = [];
    await empty.onLeave(host, true);
    for (let tick = 0; tick < 3; tick += 1) {
      clock.advance(16);
      empty.update(16);
      waiting.update(16);
    }
    assert.deepEqual(closed, ["empty"]);
  } finally {
    clock.restore();
    cleanup(empty, waiting);
  }
});

test("kimsesiz oda kendi zamanlayicisiyla kapaniyor, digerine dokunmuyor", async () => {
  const clock = withClock(20_000_000);
  const busy = await soloRoom("Dolu");
  const idle = await soloRoom("Bos");
  try {
    joinClient(busy, "p", { characterId: "warrior" });
    // Mac suruyor ama istemci yok (soket gitti, yuva duruyor).
    joinClient(idle, "q", { characterId: "warrior" });
    idle.clients = [];
    const closed = [];
    busy.disconnect = () => { closed.push("busy"); return Promise.resolve(); };
    idle.disconnect = () => { closed.push("idle"); return Promise.resolve(); };
    idle.update(16);
    busy.update(16);
    clock.advance(ABANDONED_ROOM_DISPOSE_MS - 1);
    idle.update(16);
    busy.update(16);
    assert.deepEqual(closed, []);
    clock.advance(1);
    idle.update(16);
    busy.update(16);
    assert.deepEqual(closed, ["idle"]);
    assert.equal(idle.abandonDisposing, true);
    assert.equal(busy.abandonDisposing, false);
    // Kapanmakta olan oda sinira sayilmiyor.
    const open = MatchRoom.countOpenRooms();
    assert.equal(open, [...MatchRoom.rooms.values()].filter((room) => !room.abandonDisposing).length);
  } finally {
    clock.restore();
    cleanup(busy, idle);
  }
});

/** Co-op lobisini iki oyuncuyla kurup baslatir. */
async function startedCoopRoom(name) {
  const room = await realRoom({ roomName: name, mapScale: 1 });
  const a = joinClient(room, `${name}-a`, { characterId: "warrior" });
  const b = joinClient(room, `${name}-b`, { characterId: "zeynep" });
  handlerOf(room, "lobby:setReady")(a, { ready: true });
  handlerOf(room, "lobby:setReady")(b, { ready: true });
  handlerOf(room, "lobby:start")(a);
  assert.equal(room.gameStarted, true);
  return { room, a, b };
}

test("co-op: herkes menuye donunce oda beklemeden kapaniyor; kopan oyuncu varsa on dakika bekliyor", async () => {
  const clock = withClock(80_000_000);
  const rooms = [];
  try {
    const left = await startedCoopRoom("Herkes");
    const mixed = await startedCoopRoom("Karisik");
    rooms.push(left.room, mixed.room);
    const closed = [];
    left.room.disconnect = () => { closed.push("left"); return Promise.resolve(); };
    mixed.room.disconnect = () => { closed.push("mixed"); return Promise.resolve(); };
    mixed.room.allowReconnection = () => Promise.reject(new Error("pencere doldu"));
    const leave = async (room, client, consented) => {
      room.clients = room.clients.filter((candidate) => candidate !== client);
      await room.onLeave(client, consented);
    };
    const tick = () => {
      clock.advance(16);
      left.room.update(16);
      mixed.room.update(16);
    };

    // Biri menuye dondu, digeri hala oynuyor: oda yerinde.
    await leave(left.room, left.a, true);
    tick();
    tick();
    assert.deepEqual(closed, []);
    // Ikincisi de menuye dondu: donulecek kimse yok.
    await leave(left.room, left.b, true);
    tick();
    tick();
    assert.deepEqual(closed, ["left"]);

    // Biri menuye dondu, digerinin sekmesi kapandi (izinsiz): o donebilir.
    await leave(mixed.room, mixed.a, true);
    await leave(mixed.room, mixed.b, false);
    tick();
    tick();
    assert.deepEqual(closed, ["left"]);
    clock.advance(ABANDONED_ROOM_DISPOSE_MS);
    tick();
    assert.deepEqual(closed, ["left", "mixed"]);
  } finally {
    clock.restore();
    cleanup(...rooms);
  }
});

test("tel surumu: yeni ve eski istemci ayni odada; eskisi oyuncu ve isci kayitlarini her karede tam aliyor", async () => {
  const room = await realRoom({ roomName: "Karma", mapScale: 1 });
  try {
    const fresh = joinClient(room, "yeni", { characterId: "warrior", wireDelta: WIRE_DELTA_PROTOCOL });
    const legacy = joinClient(room, "eski", { characterId: "zeynep" });
    assert.equal(room.wireDeltaSessionIds.has("yeni"), true);
    assert.equal(room.wireDeltaSessionIds.has("eski"), false);
    handlerOf(room, "lobby:setReady")(fresh, { ready: true });
    handlerOf(room, "lobby:setReady")(legacy, { ready: true });
    handlerOf(room, "lobby:start")(fresh);
    room.state.players.get("yeni").gold = 100_000;
    room.ensureLogisticsWorkers();
    room.hireWorker(fresh, { role: "ammoTransport" });
    assert.ok(room.drones.size > 0, "iscisiz oda: isci bolumu sinanamaz");

    const snapshotsOf = (client) => client.sent.filter((entry) => entry.type === "snapshot").map((entry) => entry.payload);
    const sendFrame = () => {
      const snapshot = room.getSnapshot();
      const { wire, towerBaseline, enemyBaseline, extraBaselines } = room.applyWireDelta(snapshot);
      assert.equal(room.sendSnapshotWithBackpressure(wire, snapshot), true);
      room.commitWireBaseline(towerBaseline, enemyBaseline, extraBaselines);
      return { snapshot, wire };
    };

    const first = sendFrame();
    // Ikinci kare: bir oyuncunun altini ve bir iscinin konumu degisti.
    room.state.players.get("yeni").gold += 25;
    const movedDrone = [...room.drones.values()][0];
    movedDrone.x += 7;
    const second = sendFrame();

    const [freshFirst, freshSecond] = snapshotsOf(fresh);
    const [legacyFirst, legacySecond] = snapshotsOf(legacy);
    assert.ok(freshSecond && legacySecond, "ikinci kare gitmedi");
    // Ilk kare ikisine de tam.
    assert.deepEqual(freshFirst.players, first.snapshot.players);
    assert.deepEqual(legacyFirst.players, first.snapshot.players);

    // Eski istemci: oyuncu ve isci kayitlari tam (HEAD'deki gibi), kule ve dusman delta.
    assert.deepEqual(legacySecond.players, second.snapshot.players, "eski istemciye kismi oyuncu kaydi gitti");
    assert.deepEqual(legacySecond.drones, second.snapshot.drones, "eski istemciye kismi isci kaydi gitti");
    assert.deepEqual(legacySecond.towers, second.wire.towers);
    assert.deepEqual(legacySecond.enemies, second.wire.enemies);
    assert.equal(legacySecond.wireFull, undefined);

    // Yeni istemci: delta; birlestirince tam kayit.
    assert.deepEqual(freshSecond, second.wire);
    const changedPlayer = freshSecond.players.find((player) => player.id === "yeni");
    assert.deepEqual(Object.keys(changedPlayer).sort(), ["gold", "id"]);
    assert.deepEqual(freshSecond.players.find((player) => player.id === "eski"), { id: "eski" });
    const changedDrone = freshSecond.drones.find((drone) => drone.id === movedDrone.id);
    assert.deepEqual(Object.keys(changedDrone).sort(), ["id", "x"]);
    const players = new Map();
    const drones = new Map();
    mergeDynamicRecordSnapshots(players, freshFirst.players);
    mergeDynamicRecordSnapshots(drones, freshFirst.drones);
    assert.deepEqual(mergeDynamicRecordSnapshots(players, freshSecond.players), second.snapshot.players);
    assert.deepEqual(mergeDynamicRecordSnapshots(drones, freshSecond.drones), second.snapshot.drones);
  } finally {
    cleanup(room);
  }
});

test("tel surumu oturuma bagli: yeniden baglanma (seceneksiz) bayragi koruyor, oturum gidince siliniyor", async () => {
  const room = await soloRoomWithSecret("Bayrak");
  try {
    const client = joinClient(room, "s", { characterId: "warrior", wireDelta: WIRE_DELTA_PROTOCOL, ownerSecret: OWNER_SECRET });
    let resolveReconnect;
    room.allowReconnection = () => new Promise((resolve) => { resolveReconnect = resolve; });
    room.clients = [];
    const leaving = room.onLeave(client, false);
    assert.equal(room.wireDeltaSessionIds.has("s"), true, "pencere boyunca bayrak dustu");
    // Colyseus yeniden baglanmada `onJoin` cagirmiyor; ayni oturum kimligi geri geliyor.
    const back = fakeClient("s");
    room.clients.push(back);
    resolveReconnect(back);
    await leaving;
    assert.equal(room.wireDeltaSessionIds.has("s"), true);
    room.towerWireNeedsFullResend = false;
    room.wireSyncedSessionIds.add("s");
    room.sendSnapshotWithBackpressure({ players: [{ id: "s" }], drones: [], towers: [], enemies: [] },
      { players: [{ id: "s", gold: 1 }], drones: [], towers: [], enemies: [] });
    assert.deepEqual(back.sent.at(-1).payload.players, [{ id: "s" }], "yeniden baglanan yeni istemci delta almadi");

    room.forgetSession("s");
    assert.equal(room.wireDeltaSessionIds.has("s"), false);
  } finally {
    cleanup(room);
  }
});
