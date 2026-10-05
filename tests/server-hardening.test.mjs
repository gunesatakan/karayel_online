/**
 * Sunucunun istemciye karsi dayanikliligi.
 *
 * Bir haftalik denetimin buldugu her acik burada bir test: govdesiz tek bir
 * mesaj butun sureci kapatiyordu, mac ortasinda karakter secmek sinirsiz
 * altin veriyordu, NaN `typeof` testinden geciyordu, "constructor" kimligi
 * bariyer hakkini deliyordu, kopan oyuncunun yuvasi pencere icinde
 * devralinabiliyordu, devralma iscileri ikiye katliyordu, tikanan istemci bir
 * daha tam kayit almiyordu, ayrilan oyuncu dalgayi buyutmeye devam ediyordu
 * ve terk edilmis oda sonsuza kadar tick atiyordu.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ABANDONED_ROOM_DISPOSE_MS,
  MESSAGE_RULES,
  MatchRoom,
  TICK_FAILURE_LIMIT,
  sanitizeMessagePayload
} from "../apps/server/dist/rooms/MatchRoom.js";
import { getArenaWaveEnemyCount, gridToWorld, worldToGrid } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

let roomCounter = 0;

function fakeClient(sessionId) {
  const client = {
    sessionId,
    ref: { bufferedAmount: 0 },
    sent: [],
    send(type, payload) { client.sent.push({ type, payload }); }
  };
  return client;
}

/** `onCreate`'ten gecen gercek oda; simulasyon saati ve yayin baglanmiyor. */
async function realRoom(options = { roomName: "Test", mapScale: 1 }) {
  const room = new MatchRoom();
  room.roomId = `sertlestirme-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  await room.onCreate(options);
  return room;
}

function cleanup(room) {
  MatchRoom.rooms.delete(room.roomId);
  MatchRoom.publicRooms.delete(room.roomId);
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

function captureErrors(room) {
  const errors = [];
  room.reportRoomError = (context, error) => errors.push({ context, error });
  return errors;
}

/** Iki kisilik, baslamis gercek oda. */
async function startedRoom() {
  const room = await realRoom();
  const a = joinClient(room, "a", { characterId: "warrior" });
  const b = joinClient(room, "b", { characterId: "zeynep" });
  handlerOf(room, "lobby:setReady")(a, { ready: true });
  handlerOf(room, "lobby:setReady")(b, { ready: true });
  handlerOf(room, "lobby:start")(a);
  assert.equal(room.gameStarted, true, "mac baslamadi");
  return { room, a, b };
}

function withClock(start = Date.now()) {
  const realNow = Date.now;
  let now = start;
  Date.now = () => now;
  return {
    advance(ms) { now += ms; },
    get now() { return now; },
    restore() { Date.now = realNow; }
  };
}

/** Bir turun alanlarindan bozuk govdeler: tipi tutmayan, NaN, Infinity, prototip adlari. */
function malformedPayloads(type) {
  const fields = MESSAGE_RULES[type]?.fields ?? {};
  const payloads = [undefined, null, "metin", 42, Number.NaN, true, [], [1, 2], {}, { constructor: 1, toString: 2 }];
  const nan = {};
  const infinity = {};
  const wrongType = {};
  const protoNames = {};
  const nested = {};
  for (const [name, kind] of Object.entries(fields)) {
    nan[name] = Number.NaN;
    infinity[name] = kind === "number" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    wrongType[name] = kind === "string" ? 7 : kind === "number" ? "7" : "true";
    protoNames[name] = kind === "string" ? "constructor" : kind === "number" ? -1e308 : false;
    nested[name] = { valueOf: 1, length: 99 };
  }
  payloads.push(nan, infinity, wrongType, protoNames, nested, { ...protoNames, itemId: "__proto__" });
  return payloads;
}

function assertStateValid(room) {
  for (const [id, player] of room.state.players.entries()) {
    for (const field of ["gold", "experience", "ultimateCharge", "ultimatePower", "reputation", "stress", "approval"]) {
      assert.ok(Number.isFinite(player[field]), `${id}.${field} sonlu degil: ${player[field]}`);
    }
  }
  for (const tower of room.towers.values()) {
    for (const field of ["x", "y", "hp", "maxHp", "performance", "level"]) {
      assert.ok(Number.isFinite(tower[field]), `${tower.id}.${field} sonlu degil: ${tower[field]}`);
    }
  }
  for (const enemy of room.enemies.values()) {
    for (const field of ["x", "y", "hp", "maxHp"]) {
      assert.ok(Number.isFinite(enemy[field]), `${enemy.id}.${field} sonlu degil: ${enemy[field]}`);
    }
  }
  assert.ok(Number.isFinite(room.wave) && room.wave >= 1);
  assert.ok(Number.isFinite(room.teamHealth));
}

/** Kayitli her tura her bozuk govdeyi yollar; kovalar her mesajda sifirlanir ki hepsi isleyiciye ulassin. */
function barrage(room, client) {
  const types = Object.keys(room.onMessageHandlers).filter((type) => type !== "__no_message_handler");
  for (const type of types) {
    for (const payload of malformedPayloads(type)) {
      room.messageBuckets.clear();
      assert.doesNotThrow(() => room.onMessageHandlers[type].callback(client, payload), `${type} firlatti`);
    }
  }
  return types;
}

test("govde duzeltici: yalnizca bildirilen alanlar, dogru tipte ve sonlu", () => {
  const fields = { x: "number", id: "string", on: "boolean" };
  assert.deepEqual(sanitizeMessagePayload(undefined, fields), {});
  assert.deepEqual(sanitizeMessagePayload(null, fields), {});
  assert.deepEqual(sanitizeMessagePayload("x", fields), {});
  assert.deepEqual(sanitizeMessagePayload([1], fields), {});
  assert.deepEqual(sanitizeMessagePayload({ x: Number.NaN, id: 3, on: "true" }, fields), {});
  assert.deepEqual(sanitizeMessagePayload({ x: Number.POSITIVE_INFINITY }, fields), {});
  assert.deepEqual(sanitizeMessagePayload({ x: 2.5, id: "t1", on: false, extra: 1 }, fields), { x: 2.5, id: "t1", on: false });
  assert.deepEqual(sanitizeMessagePayload({ id: "a".repeat(500) }, fields), {}, "uzun metin kirpilmiyor, reddediliyor");
  // Prototipten okunan alan sayilmiyor.
  assert.deepEqual(sanitizeMessagePayload(Object.create({ x: 5 }), fields), {});
});

test("kayitli her mesaj turunun kurali var, her kural kayitli", async () => {
  const room = await realRoom();
  try {
    const registered = Object.keys(room.onMessageHandlers).filter((type) => type !== "__no_message_handler").sort();
    assert.deepEqual(registered, Object.keys(MESSAGE_RULES).sort());
    assert.equal(typeof room.onUncaughtException, "function", "Colyseus son savunma hatti tanimli degil");
  } finally {
    cleanup(room);
  }
});

test("lobide govdesiz ve bozuk mesajlar odayi dusurmez", async () => {
  const room = await realRoom();
  try {
    const errors = captureErrors(room);
    const a = joinClient(room, "a", { characterId: "warrior" });
    joinClient(room, "b", { characterId: "zeynep" });
    const types = barrage(room, a);
    assert.ok(types.length >= 40, `yalnizca ${types.length} tur denendi`);
    assert.deepEqual(errors.map((entry) => `${entry.context}: ${entry.error?.message}`), []);
    assertStateValid(room);
  } finally {
    cleanup(room);
  }
});

test("macta govdesiz ve bozuk mesajlar odayi dusurmez, durum gecerli kalir", async () => {
  const { room, a, b } = await startedRoom();
  try {
    const errors = captureErrors(room);
    // Kurulum disinda ve icinde: bazi isleyiciler yalnizca birinde is yapiyor.
    barrage(room, a);
    room.setupPhase = false;
    for (let index = 0; index < 5; index += 1) room.spawnEnemy();
    barrage(room, b);
    room.setupPhase = true;
    barrage(room, b);
    for (let tick = 0; tick < 30; tick += 1) room.update(16);
    assert.deepEqual(errors.map((entry) => `${entry.context}: ${entry.error?.message}`), []);
    assertStateValid(room);
  } finally {
    cleanup(room);
  }
});

test("yaratici odada bozuk mesajlar odayi dusurmez", async () => {
  const room = await realRoom({ roomName: "Kum", mapScale: 1, autoStart: true, creative: true });
  try {
    const errors = captureErrors(room);
    const owner = joinClient(room, "sahip", { characterId: "warrior" });
    assert.equal(room.creativeMode, true);
    barrage(room, owner);
    for (let tick = 0; tick < 30; tick += 1) room.update(16);
    assert.deepEqual(errors.map((entry) => `${entry.context}: ${entry.error?.message}`), []);
    assertStateValid(room);
  } finally {
    cleanup(room);
  }
});

test("firlatan isleyici yakalanir ve gunluge yazilir", async () => {
  const room = await realRoom();
  try {
    const errors = captureErrors(room);
    room.onMessage("test:boom", () => { throw new Error("bozuk isleyici"); });
    const client = fakeClient("a");
    assert.doesNotThrow(() => room.onMessageHandlers["test:boom"].callback(client, undefined));
    assert.equal(errors.length, 1);
    assert.equal(errors[0].context, "onMessage:test:boom");
  } finally {
    cleanup(room);
  }
});

test("hata gunlugu ayni yerden on saniyede bir yaziyor", () => {
  const room = createRoom("warrior");
  const clock = withClock(1_000_000);
  const realError = console.error;
  const lines = [];
  console.error = (line) => lines.push(line);
  try {
    for (let index = 0; index < 5; index += 1) room.reportRoomError("update", new Error("x"));
    assert.equal(lines.length, 1);
    clock.advance(10_000);
    room.reportRoomError("update", new Error("x"));
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes("+4 yutuldu"), lines[1]);
  } finally {
    console.error = realError;
    clock.restore();
  }
});

test("tick hatasi odayi dusurmez ve hata dongusu kurmaz", () => {
  const room = createRoom("warrior");
  room.clients = [];
  room.broadcast = () => {};
  const errors = captureErrors(room);
  let calls = 0;
  room.updateSpawning = () => {
    calls += 1;
    throw new Error("bozuk tick");
  };
  const clock = withClock(2_000_000);
  try {
    assert.doesNotThrow(() => room.update(16));
    assert.equal(calls, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].context, "update");

    // Bekleme suresi icinde tick denenmiyor.
    room.update(16);
    assert.equal(calls, 1, "hata dongusu: bekleme suresinde tick yeniden denendi");
    clock.advance(60);
    room.update(16);
    assert.equal(calls, 2);
    // Ikinci hata beklemeyi katliyor.
    clock.advance(60);
    room.update(16);
    assert.equal(calls, 2, "bekleme katlanmadi");
    clock.advance(60);
    room.update(16);
    assert.equal(calls, 3);

    // Hata giderilince oda normal tick'e donuyor.
    delete room.updateSpawning;
    clock.advance(5000);
    room.update(16);
    assert.equal(room.tickFailures, 0);
    clock.advance(1);
    room.update(16);
    assert.equal(errors.length, 3);
  } finally {
    clock.restore();
  }
});

test("mac ortasinda karakter secimi reddediliyor: sinirsiz altin yok", async () => {
  const { room, a } = await startedRoom();
  try {
    const player = room.state.players.get("a");
    player.gold = 10;
    handlerOf(room, "lobby:setCharacter")(a, { characterId: "warrior" });
    assert.equal(player.gold, 10, "altin baslangic degerine yazildi");
    handlerOf(room, "lobby:setCharacter")(a, { characterId: "onur" });
    assert.equal(player.characterId, "warrior");
    // Isleyiciyi atlayan dogrudan cagri da ayni kapida.
    room.setLobbyCharacter(a, "warrior");
    assert.equal(player.gold, 10);
    handlerOf(room, "lobby:setReady")(a, { ready: false });
    assert.equal(player.ready, true, "macta hazir durumu degisti");
  } finally {
    cleanup(room);
  }
});

test("lobide karakter secimi calismaya devam ediyor", async () => {
  const room = await realRoom();
  try {
    const a = joinClient(room, "a", { characterId: "warrior" });
    handlerOf(room, "lobby:setCharacter")(a, { characterId: "onur" });
    assert.equal(room.state.players.get("a").characterId, "onur");
  } finally {
    cleanup(room);
  }
});

test("baslamis mac yeniden baslatilamaz", async () => {
  const { room, a } = await startedRoom();
  try {
    room.setupPhase = false;
    room.wave = 3;
    const session = room.setupSession;
    const map = room.activeMap;
    handlerOf(room, "lobby:start")(a);
    room.startLobbyMatch(a);
    assert.equal(room.setupPhase, false, "dalga ortasinda kurulum evresi acildi");
    assert.equal(room.setupSession, session);
    assert.equal(room.wave, 3);
    assert.equal(room.activeMap, map, "arena sifirlandi");
  } finally {
    cleanup(room);
  }
});

test("lobide gameplay mesajlari is yapmiyor", async () => {
  // Lobide harcanan altin karakter secimiyle geri yaziliyordu.
  const room = await realRoom();
  try {
    const a = joinClient(room, "a", { characterId: "warrior" });
    const player = room.state.players.get("a");
    const gold = player.gold;
    handlerOf(room, "worker:hire")(a, { advanced: true });
    handlerOf(room, "ultimate:upgrade")(a);
    assert.equal(player.gold, gold);
    assert.equal(player.hiredWorkers.length, 0);
  } finally {
    cleanup(room);
  }
});

test("NaN ve Infinity performans kolu reddediliyor", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  const client = { sessionId: "p1" };
  room.setTowerPerformance(client, { towerId: tower.id, performance: Number.NaN });
  assert.equal(tower.performance, 0.5);
  room.setTowerPerformance(client, { towerId: tower.id, performance: Number.POSITIVE_INFINITY });
  assert.equal(tower.performance, 0.5);
  room.setTowerPerformance(client, { towerId: tower.id, performance: 0.3 });
  assert.equal(tower.performance, 0.3);
  room.setTowerPerformance(client, { towerId: tower.id, performance: 7 });
  assert.equal(tower.performance, 1, "kol 0-1 arasina kirpiliyor");
  assert.ok(Number.isFinite(room.getTowerEffectInterval(tower)));
});

test("NaN koordinat ve NaN yaratici sayilari is yapmiyor", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.creativeMode = true;
  const client = { sessionId: "p1", send() {} };
  room.placeTower(client, { x: Number.NaN, y: 10, definitionId: "warrior-1" });
  room.placeTower(client, { x: 10, y: Number.POSITIVE_INFINITY, definitionId: "warrior-1" });
  assert.equal(room.towers.size, 0);

  room.wave = 4;
  room.creativeSetWave(client, { wave: Number.NaN });
  assert.equal(room.wave, 4);
  room.creativeSpawnEnemies(client, { count: Number.NaN });
  assert.equal(room.enemies.size, 1, "NaN sayi tek dusmana dusuyor");
  for (const enemy of room.enemies.values()) assert.ok(Number.isFinite(enemy.hp) && Number.isFinite(enemy.maxHp));

  const spot = findBuildableSpot(room, "warrior-1");
  room.creativePlaceTower(client, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  room.creativeSetTowerLevel(client, { towerId: tower.id, level: Number.NaN });
  assert.equal(tower.level, 1);
});

test("bariyer hakki: 'constructor' kimligi hakki delmiyor, hak bir kez harcaniyor", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.setupPhase = true;
  room.shopPlacementCharges.set("p1", { bariyer: 1, "ziftli-zemin": 0 });
  const roadCells = [];
  const { cols, rows, tiles } = room.activeMap;
  for (let row = 1; row < rows - 1 && roadCells.length < 6; row += 1) {
    for (let col = 0; col < cols && roadCells.length < 6; col += 1) {
      if (tiles[row * cols + col] === "road") roadCells.push({ col, row });
    }
  }
  assert.ok(roadCells.length >= 6, "yol hucresi bulunamadi");
  const cellPoint = ({ col, row }) => gridToWorld(col, row, room.activeMap);
  const tileAt = ({ col, row }) => room.activeMap.tiles[row * cols + col];
  const client = { sessionId: "p1" };

  for (const [index, itemId] of ["constructor", "__proto__", "toString", "hasOwnProperty"].entries()) {
    const point = cellPoint(roadCells[index]);
    room.placeShopMapItem(client, { itemId, ...point });
    assert.equal(tileAt(roadCells[index]), "road", `${itemId} kimligiyle bariyer kuruldu`);
  }

  const first = cellPoint(roadCells[4]);
  const cell = worldToGrid(first.x, first.y, room.activeMap);
  room.placeShopMapItem(client, { itemId: "bariyer", ...first });
  assert.equal(tileAt(cell), "tower", "hakki olan bariyer kurulmadi");
  assert.equal(room.shopPlacementCharges.get("p1").bariyer, 0);

  const second = cellPoint(roadCells[5]);
  room.placeShopMapItem(client, { itemId: "bariyer", ...second });
  assert.equal(tileAt(roadCells[5]), "road", "hak bittikten sonra bariyer kuruldu");
  room.placeShopMapItem(client, { itemId: "constructor", ...second });
  assert.equal(tileAt(roadCells[5]), "road");
  assert.equal(Object.prototype.hasOwnProperty.call(room.shopPlacementCharges.get("p1"), "constructor"), false);
});

/** Kontrol edilebilir yeniden baglanma penceresi; Colyseus'un Deferred'i gibi `reject` tasiyor. */
function controllableReconnection(room) {
  const pending = new Map();
  room.allowReconnection = (client) => {
    let handles;
    const deferred = new Promise((resolve, reject) => { handles = { resolve, reject }; });
    deferred.resolve = handles.resolve;
    deferred.reject = handles.reject;
    pending.set(client.sessionId, handles);
    return deferred;
  };
  return pending;
}

test("pencere acikken kopan oyuncunun yuvasi devralinamiyor", async () => {
  const { room, a, b } = await startedRoom();
  try {
    const pending = controllableReconnection(room);
    const spot = findBuildableSpot(room, "zeynep-1");
    room.placeTower(b, { x: spot.x, y: spot.y, definitionId: "zeynep-1" });
    const bPlayer = room.state.players.get("b");
    bPlayer.gold = 777;

    room.clients.splice(room.clients.indexOf(b), 1);
    const leaving = room.onLeave(b, false);
    assert.equal(room.reconnectingSessionIds.has("b"), true);

    // Ayni operatoru isteyen ama baska adla gelen bos yuvayi aliyor; kopanin
    // kulesi ve altini yerinde.
    const c = joinClient(room, "c", { characterId: "zeynep" });
    assert.equal(room.state.players.get("b"), bPlayer, "yuva pencere icinde devralindi");
    assert.equal(bPlayer.gold, 777);
    assert.equal([...room.towers.values()].find((tower) => tower.definition.id === "zeynep-1").ownerId, "b");
    assert.ok(room.state.players.has("c"));
    assert.notEqual(room.state.players.get("c").slot, bPlayer.slot);
    assert.ok(c.sent.some((message) => message.type === "lobby:started"));

    // Asil oyuncu donuyor: yuvasi onu bekliyor.
    pending.get("b").resolve(b);
    await leaving;
    assert.equal(bPlayer.connected, true);
    assert.equal(room.reconnectingSessionIds.has("b"), false);
    assert.equal(room.departedSessionIds.has("b"), false);
    assert.equal(room.state.players.size, 3);
  } finally {
    cleanup(room);
  }
});

test("pencere kapaninca yuva geri donuse acik: devralan kuleleri ve altini aliyor", async () => {
  const { room, b } = await startedRoom();
  try {
    const pending = controllableReconnection(room);
    const spot = findBuildableSpot(room, "zeynep-1");
    room.placeTower(b, { x: spot.x, y: spot.y, definitionId: "zeynep-1" });
    const bPlayer = room.state.players.get("b");

    const leaving = room.onLeave(b, false);
    pending.get("b").reject(new Error("sure doldu"));
    await leaving;
    assert.equal(room.departedSessionIds.has("b"), true);
    assert.equal(room.hasJoinableSeat(), true);

    joinClient(room, "b-yeni", { characterId: "zeynep" });
    assert.equal(room.state.players.get("b-yeni"), bPlayer, "geri donen oyuncu yuvasini almadi");
    assert.equal(room.state.players.has("b"), false);
    assert.equal(room.departedSessionIds.size, 0);
    assert.equal([...room.towers.values()].find((tower) => tower.definition.id === "zeynep-1").ownerId, "b-yeni");
  } finally {
    cleanup(room);
  }
});

test("dolu odada pencere suren yuva yeni gelene verilmiyor", async () => {
  const { room, b } = await startedRoom();
  try {
    controllableReconnection(room);
    joinClient(room, "c", { characterId: "onur" });
    joinClient(room, "d", { characterId: "archer" });
    void room.onLeave(b, false);
    const errors = captureErrors(room);
    assert.equal(room.hasJoinableSeat(), false, "pencere suren yuva bos koltuk sayildi");
    assert.throws(() => room.onJoin(fakeClient("e"), { characterId: "mage" }), /Oda dolu/);
    assert.deepEqual(errors, [], "bilinen red hata gunlugune yazildi");
    assert.equal(room.state.players.has("e"), false);
  } finally {
    cleanup(room);
  }
});

test("devralma iscileri cogaltmiyor ve tasiyor", () => {
  const room = createRoom("warrior");
  room.setupPhase = true;
  room.ensureLogisticsWorkers();
  const count = room.drones.size;
  assert.ok(count >= 4, `temel kadro kurulmadi: ${count}`);
  const loaded = [...room.drones.values()][0];
  loaded.cargo = 3;

  const player = room.state.players.get("p1");
  room.transferPlayerSession("p1", "p1-yeni", player);
  room.ensureLogisticsWorkers();
  assert.equal(room.drones.size, count, "devralma tam bir kadro daha kurdu");
  room.transferPlayerSession("p1-yeni", "p1-ucuncu", player);
  room.ensureLogisticsWorkers();
  assert.equal(room.drones.size, count, "ikinci devralma da iscileri katladi");
  for (const [id, drone] of room.drones) {
    assert.equal(drone.ownerId, "p1-ucuncu");
    assert.equal(drone.id, id);
    assert.ok(id.startsWith("logistics-p1-ucuncu-"), id);
  }
  assert.equal(loaded.cargo, 3, "isci yukunu kaybetti");
  assert.equal(room.drones.get(loaded.id), loaded, "ayni isci nesnesi tasinmadi");
});

test("hiz siniri: ping ve tam kayit istegi kovayi asinca dusuyor, istemci basina", async () => {
  const { room, a, b } = await startedRoom();
  const clock = withClock(3_000_000);
  try {
    const ping = handlerOf(room, "latency:ping");
    a.sent = [];
    for (let index = 0; index < 20; index += 1) ping(a, { sentAt: index });
    const pongs = () => a.sent.filter((message) => message.type === "latency:pong").length;
    assert.equal(pongs(), MESSAGE_RULES["latency:ping"].rate.burst);
    ping(b, { sentAt: 1 });
    assert.equal(b.sent.filter((message) => message.type === "latency:pong").length, 1, "kova istemci basina degil");
    clock.advance(1000);
    for (let index = 0; index < 20; index += 1) ping(a, { sentAt: index });
    assert.equal(pongs(), MESSAGE_RULES["latency:ping"].rate.burst + 2);

    // Tam kayit istegi yalnizca isteyene tam kare yolluyor.
    room.wireSyncedSessionIds.add("a");
    room.wireSyncedSessionIds.add("b");
    room.towerWireNeedsFullResend = false;
    const full = handlerOf(room, "snapshot:requestFull");
    a.sent = [];
    for (let index = 0; index < 30; index += 1) full(a);
    assert.equal(a.sent.filter((message) => message.type === "snapshot:full").length, MESSAGE_RULES["snapshot:requestFull"].rate.burst);
    assert.equal(room.wireSyncedSessionIds.has("a"), false);
    assert.equal(room.wireSyncedSessionIds.has("b"), true, "baskasinin istegi herkese tam kare yollatiyor");
    assert.equal(room.towerWireNeedsFullResend, false);

    // Varsayilan kova: dongude gonderen istemci sinirlaniyor.
    const sync = handlerOf(room, "card:sync");
    let calls = 0;
    room.sendPendingCardChoices = () => { calls += 1; };
    for (let index = 0; index < 50; index += 1) sync(a);
    assert.equal(calls, MESSAGE_RULES["card:sync"].rate.burst);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("performans kolu surukleme hizinda dusmuyor", async () => {
  const { room, a } = await startedRoom();
  const clock = withClock(4_000_000);
  try {
    const spot = findBuildableSpot(room, "warrior-1");
    room.state.players.get("a").gold = 100_000;
    room.placeTower(a, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    const tower = [...room.towers.values()].find((entry) => entry.ownerId === "a");
    const lever = handlerOf(room, "setTowerPerformance");
    // Iki saniye boyunca saniyede 60 kare.
    for (let frame = 0; frame < 120; frame += 1) {
      clock.advance(1000 / 60);
      lever(a, { towerId: tower.id, performance: frame / 119 });
    }
    assert.equal(tower.performance, 1, "son deger dustu");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("ayrilan oyuncu dalgayi, dusman canini ve tecrube payini buyutmuyor", async () => {
  const { room, a, b } = await startedRoom();
  const realRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const pending = controllableReconnection(room);
    const duo = room.getScaledWaveEnemyCount(5);
    room.spawnEnemy();
    const duoEnemy = [...room.enemies.values()].at(-1);

    // Pencere suren oyuncu sayiliyor.
    const leaving = room.onLeave(b, false);
    assert.equal(room.getActivePlayerCount(), 2);
    assert.equal(room.getScaledWaveEnemyCount(5), duo);

    pending.get("b").reject(new Error("sure doldu"));
    await leaving;
    assert.equal(room.getActivePlayerCount(), 1);
    assert.equal(room.getScaledWaveEnemyCount(5), getArenaWaveEnemyCount(5, room.mapScale, 1));
    assert.ok(room.getScaledWaveEnemyCount(5) < duo);

    room.spawnEnemy();
    const soloEnemy = [...room.enemies.values()].at(-1);
    assert.equal(soloEnemy.type, duoEnemy.type);
    assert.ok(Math.abs(duoEnemy.maxHp / soloEnemy.maxHp - 1.45) < 1e-9, `can carpani: ${duoEnemy.maxHp / soloEnemy.maxHp}`);

    // Tecrube kalanlar arasinda bolunuyor; ayrilan pay almiyor.
    const aPlayer = room.state.players.get("a");
    const bPlayer = room.state.players.get("b");
    const aBefore = aPlayer.experience;
    const bBefore = bPlayer.experience;
    room.awardEnemyExperience(soloEnemy);
    const soloGain = aPlayer.experience - aBefore;
    assert.ok(soloGain > 0);
    assert.equal(bPlayer.experience, bBefore, "ayrilan oyuncu tecrube aldi");

    // Yuvayi devralan geri donunce olcek yeniden iki kisilik.
    joinClient(room, "b-yeni", { characterId: "zeynep" });
    assert.equal(room.getActivePlayerCount(), 2);
    assert.equal(room.getScaledWaveEnemyCount(5), duo);
    const aMid = aPlayer.experience;
    room.awardEnemyExperience(soloEnemy);
    assert.ok(Math.abs((aPlayer.experience - aMid) * 2 - soloGain) < 1e-9, "pay iki oyuncuya bolunmedi");
    void a;
  } finally {
    Math.random = realRandom;
    cleanup(room);
  }
});

test("kendi istegiyle cikan oyuncu hemen ayrilmis sayiliyor", async () => {
  const { room, b } = await startedRoom();
  try {
    await room.onLeave(b, true);
    assert.equal(room.departedSessionIds.has("b"), true);
    assert.equal(room.getActivePlayerCount(), 1);
    assert.equal(room.state.players.has("b"), true, "kayit (kuleler, yuva) yerinde kaliyor");
  } finally {
    cleanup(room);
  }
});

test("kimsesiz oda pencereden sonra kapaniyor", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [];
  room.abandonCheckEnabled = true;
  let disposed = 0;
  room.disconnect = () => { disposed += 1; return Promise.resolve(); };
  const clock = withClock(5_000_000);
  try {
    room.update(16);
    clock.advance(ABANDONED_ROOM_DISPOSE_MS - 1);
    room.update(16);
    assert.equal(disposed, 0, "oda erken kapandi");
    clock.advance(1);
    room.update(16);
    assert.equal(disposed, 1);
    clock.advance(10_000);
    room.update(16);
    assert.equal(disposed, 1, "kapatma tekrarlandi");
  } finally {
    clock.restore();
  }
});

test("yeniden baglanma penceresi ya da istemci varken oda kapanmiyor", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [];
  room.abandonCheckEnabled = true;
  let disposed = 0;
  room.disconnect = () => { disposed += 1; return Promise.resolve(); };
  const clock = withClock(6_000_000);
  try {
    room.reconnectingSessionIds.add("p1");
    room.update(16);
    clock.advance(ABANDONED_ROOM_DISPOSE_MS * 2);
    room.update(16);
    assert.equal(disposed, 0, "pencere suren oda kapandi");

    // Pencere kapandi: sayac o andan basliyor.
    room.reconnectingSessionIds.clear();
    room.update(16);
    clock.advance(ABANDONED_ROOM_DISPOSE_MS - 1);
    room.update(16);
    assert.equal(disposed, 0);

    room.clients = [fakeClient("p1")];
    clock.advance(ABANDONED_ROOM_DISPOSE_MS * 2);
    room.update(16);
    assert.equal(disposed, 0, "istemcisi olan oda kapandi");
  } finally {
    clock.restore();
  }
});

test("terk edilmis oda denetimi gercek odada acik, test duzeneginde kapali", async () => {
  const room = await realRoom();
  try {
    assert.equal(room.abandonCheckEnabled, true);
    assert.equal(createRoom("warrior").abandonCheckEnabled, false);
  } finally {
    cleanup(room);
  }
});

test("tikanan istemci tikanma gecince tam kare aliyor, digeri delta", () => {
  const room = createRoom("warrior");
  const p1 = room.state.players.get("p1");
  room.state.players.set("p2", { ...p1, id: "p2", runModifiers: [], ownedCardIds: [], ownedShopItemIds: [], inventoryItemIds: [], hiredWorkers: [] });
  const frames = { p1: [], p2: [] };
  room.clients = ["p1", "p2"].map((sessionId) => ({
    sessionId,
    ref: { bufferedAmount: 0 },
    send(type, payload) { if (type === "snapshot") frames[sessionId].push(JSON.parse(JSON.stringify(payload))); }
  }));
  room.broadcast = () => {};
  room.wave = 8;
  for (let index = 0; index < 4; index += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    room.placeTower({ sessionId: index % 2 ? "p2" : "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" }, { free: true, ignoreLimit: true });
  }
  for (let index = 0; index < 6; index += 1) room.spawnEnemy();

  const realNow = Date.now;
  const realPerf = performance.now;
  let now = realNow();
  Date.now = () => now;
  performance.now = () => now;
  const drive = (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 16) {
      now += 16;
      room.update(16);
    }
  };
  try {
    drive(500);
    assert.ok(frames.p2.length > 3);

    // p2'nin kuyrugu doluyor: bir sure kare almiyor, p1 almaya devam ediyor.
    room.clients[1].ref.bufferedAmount = 10_000_000;
    const p1Before = frames.p1.length;
    const p2Before = frames.p2.length;
    drive(300);
    assert.ok(frames.p1.length > p1Before, "saglikli istemci kare almadi");
    assert.equal(frames.p2.length, p2Before);

    room.clients[1].ref.bufferedAmount = 0;
    const p1Index = frames.p1.length;
    const p2Index = frames.p2.length;
    let sentFull;
    const send = room.sendSnapshotWithBackpressure.bind(room);
    room.sendSnapshotWithBackpressure = (wire, full) => {
      sentFull ??= JSON.parse(JSON.stringify(full));
      return send(wire, full);
    };
    drive(100);
    const recovered = frames.p2[p2Index];
    assert.ok(recovered, "tikanma gecince kare gitmedi");
    assert.deepEqual(recovered.towers, sentFull.towers, "atlanan istemci tam kule kaydi almadi");
    assert.deepEqual(recovered.enemies, sentFull.enemies, "atlanan istemci tam dusman kaydi almadi");
    for (const tower of recovered.towers) assert.ok("range" in tower, "tam kayitta sabit alan eksik");
    // Ayni karede p1 delta aldi: sabit alanlar yok.
    const sameFrameForP1 = frames.p1[p1Index];
    assert.ok(sameFrameForP1.towers.every((tower) => !("range" in tower)), "saglikli istemci gereksiz tam kare aldi");
  } finally {
    Date.now = realNow;
    performance.now = realPerf;
  }
});

test("Atakan'in kule tasimasi gezinme indeksini tazeliyor", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const first = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: first.x, y: first.y, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  const oldCell = worldToGrid(tower.x, tower.y, room.activeMap);
  assert.equal(room.getTowerAtCell(oldCell.col, oldCell.row), tower);

  const second = findBuildableSpot(room, "warrior-1");
  assert.ok(second);
  assert.equal(room.refactorTower({ sessionId: "p1" }, { towerId: tower.id, x: second.x, y: second.y }), true);
  const newCell = worldToGrid(tower.x, tower.y, room.activeMap);
  assert.notDeepEqual(newCell, oldCell);
  assert.equal(room.getTowerAtCell(oldCell.col, oldCell.row), undefined, "eski karede hayalet engel kaldi");
  assert.equal(room.getTowerAtCell(newCell.col, newCell.row), tower);
});

test("yaratici oda tek kisilik: listede yok, ikinci oyuncu giremiyor", async () => {
  const room = await realRoom({ roomName: "Kum", mapScale: 1, autoStart: true, creative: true });
  try {
    const owner = joinClient(room, "sahip", { characterId: "warrior" });
    assert.equal(room.maxClients, 1);
    assert.equal(room.hasJoinableSeat(), false);
    assert.equal(MatchRoom.listPublicRooms().some((listing) => listing.roomId === room.roomId), false);
    captureErrors(room);
    assert.throws(() => room.onJoin(fakeClient("ikinci"), { characterId: "zeynep" }), /Oda dolu/);
    assert.equal(room.state.players.size, 1);
    assert.ok(room.getCreativePlayer(owner), "sahibin yaratici komutlari kapandi");
  } finally {
    cleanup(room);
  }
});

test("yaratici olmayan odada yaratici isleyiciler govdeyi hic okumuyor", async () => {
  const { room, a } = await startedRoom();
  try {
    const reads = [];
    const payload = new Proxy({ count: 40, wave: 30, level: 10 }, {
      get(target, key) { reads.push(key); return target[key]; },
      has(target, key) { reads.push(key); return key in target; },
      getOwnPropertyDescriptor(target, key) { reads.push(key); return Object.getOwnPropertyDescriptor(target, key); },
      ownKeys(target) { reads.push("ownKeys"); return Reflect.ownKeys(target); }
    });
    for (const type of Object.keys(MESSAGE_RULES).filter((name) => name.startsWith("creative:"))) {
      handlerOf(room, type)(a, payload);
    }
    assert.deepEqual(reads, [], "kapidan once govde okundu");
    assert.equal(room.enemies.size, 0);
    assert.equal(room.towers.size, 0);
  } finally {
    cleanup(room);
  }
});

test("sayfasi yenilenen oyuncu pencere icinde listeden kendi yuvasina donuyor", async () => {
  // Istemci yeniden baglanma anahtarini yeniden yuklemede kaybedebiliyor;
  // tek yol oda listesi. Yeni bir oyuncu olarak girseydi baska operator,
  // sifir kule ve taze altinla baslar, 20 sn sonra eski yuvasi kulelerini
  // alip ayrilmis sayilirdi.
  const { room, b } = await startedRoom();
  try {
    const pending = controllableReconnection(room);
    const spot = findBuildableSpot(room, "zeynep-1");
    room.placeTower(b, { x: spot.x, y: spot.y, definitionId: "zeynep-1" });
    const bPlayer = room.state.players.get("b");
    bPlayer.gold = 777;
    room.clients.splice(room.clients.indexOf(b), 1);
    const leaving = room.onLeave(b, false);
    assert.ok(pending.has("b"));

    // Ayni operator, ayni ad: kendi yuvasi.
    const reloaded = joinClient(room, "b-yeniden", { characterId: "zeynep", playerName: "b" });
    assert.equal(room.state.players.get("b-yeniden"), bPlayer, "yeniden yuklenen oyuncu yeni bir yuva aldi");
    assert.equal(room.state.players.has("b"), false);
    assert.equal(room.state.players.size, 2);
    assert.equal(bPlayer.gold, 777);
    assert.equal(bPlayer.connected, true);
    assert.equal([...room.towers.values()].find((tower) => tower.definition.id === "zeynep-1").ownerId, "b-yeniden");
    assert.ok(reloaded.sent.some((message) => message.type === "lobby:started"));
    assert.equal(room.reconnectingSessionIds.size, 0);
    assert.equal(room.pendingReconnections.size, 0);

    // Eski oturumun beklemesi reddedildi (yoksa `onLeave` hic bitmezdi);
    // eski `onLeave` yuvayi ayrilmis saymiyor.
    await Promise.race([leaving, new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Colyseus beklemesi reddedilmedi")), 1000).unref();
    })]);
    assert.equal(room.departedSessionIds.size, 0);
    assert.equal(room.getActivePlayerCount(), 2);
    assert.equal(room.state.players.get("b-yeniden"), bPlayer);

    // Yuva tek kez devrediliyor: ayni adla ikinci gelen yeni yuvaya.
    joinClient(room, "b-ucuncu", { characterId: "zeynep", playerName: "b" });
    assert.equal(room.state.players.get("b-yeniden"), bPlayer);
    assert.notEqual(room.state.players.get("b-ucuncu"), bPlayer);
  } finally {
    cleanup(room);
  }
});

test("pencere icinde baska adla gelen ayni operatoru secse de yuvayi alamiyor", async () => {
  const { room, b } = await startedRoom();
  try {
    controllableReconnection(room);
    const bPlayer = room.state.players.get("b");
    void room.onLeave(b, false);
    joinClient(room, "yabanci", { characterId: "zeynep", playerName: "Yabanci" });
    assert.equal(room.state.players.get("b"), bPlayer);
    assert.equal(room.reconnectingSessionIds.has("b"), true, "yuva ayrilmisligini kaybetti");
    assert.notEqual(room.state.players.get("yabanci"), bPlayer);
  } finally {
    cleanup(room);
  }
});

test("performans kolu 240 Hz surukleme: birakis degeri kaybolmuyor", async () => {
  const { room, a } = await startedRoom();
  const clock = withClock(7_000_000);
  try {
    room.state.players.get("a").gold = 100_000;
    const spot = findBuildableSpot(room, "warrior-1");
    room.placeTower(a, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    const tower = [...room.towers.values()].find((entry) => entry.ownerId === "a");
    const lever = handlerOf(room, "setTowerPerformance");
    for (let frame = 0; frame < 240 * 3; frame += 1) {
      clock.advance(1000 / 240);
      lever(a, { towerId: tower.id, performance: (frame % 100) / 100 });
    }
    clock.advance(1000 / 240);
    lever(a, { towerId: tower.id, performance: 0.37 });
    // Kova bos: deger bekletiliyor, bir sonraki tick'te uygulaniyor.
    room.update(16);
    assert.equal(tower.performance, 0.37, "birakis degeri dustu");
    assert.equal(room.latestMessageStash.size, 0);

    // Bekleyen eski deger, sonradan kabul edilen yenisinin ustune yazilmiyor.
    for (let index = 0; index < 400; index += 1) lever(a, { towerId: tower.id, performance: 0.9 });
    clock.advance(1000);
    lever(a, { towerId: tower.id, performance: 0.2 });
    assert.equal(tower.performance, 0.2);
    room.update(16);
    assert.equal(tower.performance, 0.2, "eski bekleyen deger yenisini ezdi");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("istemci performans kolunu kisiyor ve birakista son degeri yolluyor", () => {
  const scene = readFileSync(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(!scene.includes(`this.room?.send("setTowerPerformance", { towerId: this.performanceSliderTowerId, performance });`), "her pointermove'da gonderim");
  assert.ok(/const PERFORMANCE_SEND_INTERVAL_MS = \d+;/.test(scene));
  assert.ok(/this\.input\.on\("pointerup", \(\) => \{\s*if \(this\.performanceSliderDragging\) this\.flushPerformanceSend\(\);/.test(scene), "birakista bekleyen deger gonderilmiyor");
});

test("ust uste tick hatasi odayi mesajla kapatiyor", () => {
  const room = createRoom("warrior");
  room.clients = [];
  const broadcasts = [];
  room.broadcast = (type, payload) => broadcasts.push({ type, payload });
  captureErrors(room);
  let disposed = 0;
  room.disconnect = () => { disposed += 1; return Promise.resolve(); };
  room.updateSpawning = () => { throw new Error("kalici bozukluk"); };
  const clock = withClock(8_000_000);
  try {
    for (let attempt = 1; attempt < TICK_FAILURE_LIMIT; attempt += 1) {
      room.update(16);
      clock.advance(2500);
    }
    assert.equal(disposed, 0, "oda erken kapandi");
    room.update(16);
    assert.equal(disposed, 1);
    const notice = broadcasts.find((entry) => entry.type === "room:error");
    assert.ok(notice?.payload.message.includes("maç sonlandırıldı"), "oyunculara mesaj gitmedi");
    clock.advance(2500);
    room.update(16);
    assert.equal(disposed, 1, "kapatma tekrarlandi");
    // Kapanan oda yeni oda kurulmasini engellemiyor.
    assert.equal(room.abandonDisposing, true);
  } finally {
    clock.restore();
  }
});

test("yeni oda kurulurken penceresi suren mac kapatilmiyor, bos oda kapatiliyor", async () => {
  const reconnecting = await realRoom();
  // Ikinci bos oda `onCreate`siz kaydediliyor: gercek odayi kurmak ilkini kapatmayi denerdi.
  const empty = new MatchRoom();
  empty.roomId = `sertlestirme-bos-${roomCounter += 1}`;
  empty.state = { players: new Map() };
  let next;
  try {
    const a = joinClient(reconnecting, "a", { characterId: "warrior" });
    handlerOf(reconnecting, "lobby:setReady")(a, { ready: true });
    handlerOf(reconnecting, "lobby:start")(a);
    controllableReconnection(reconnecting);
    reconnecting.clients.splice(0, 1);
    void reconnecting.onLeave(a, false);
    const closed = [];
    reconnecting.disconnect = () => { closed.push("reconnecting"); return Promise.resolve(); };
    MatchRoom.rooms.set(empty.roomId, empty);
    empty.disconnect = () => { closed.push("empty"); return Promise.resolve(); };

    next = new MatchRoom();
    next.roomId = `sertlestirme-yeni-${roomCounter += 1}`;
    next.setSimulationInterval = () => {};
    await next.onCreate({ roomName: "Yeni", mapScale: 1 });
    assert.deepEqual(closed, ["empty"], "penceresi suren mac kapatildi ya da bos oda kaldi");
  } finally {
    cleanup(reconnecting);
    cleanup(empty);
    if (next) cleanup(next);
  }
});

test("kapanmakta olan bozuk oda yeni oda kurulmasini engellemiyor", async () => {
  const broken = await realRoom();
  let next;
  try {
    joinClient(broken, "a", { characterId: "warrior" });
    broken.disconnect = () => Promise.resolve();
    await assert.rejects(async () => {
      const blocked = new MatchRoom();
      blocked.roomId = `sertlestirme-engel-${roomCounter += 1}`;
      blocked.setSimulationInterval = () => {};
      await blocked.onCreate({ roomName: "Engel", mapScale: 1 });
    }, /Zaten aktif bir oda var/);
    broken.abandonDisposing = true;
    next = new MatchRoom();
    next.roomId = `sertlestirme-yeni-${roomCounter += 1}`;
    next.setSimulationInterval = () => {};
    await next.onCreate({ roomName: "Yeni", mapScale: 1 });
  } finally {
    cleanup(broken);
    if (next) cleanup(next);
  }
});

test("Colyseus hatasi asil yigin iziyle yaziliyor, bilinen redler yazilmiyor", () => {
  const room = createRoom("warrior");
  const errors = captureErrors(room);
  const cause = new Error("asil hata");
  const wrapped = new Error("sarmalayici", { cause });
  room.onUncaughtException(wrapped, "onMessage");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].error, cause, "sarmalayicinin yigini yazildi");
  for (const message of ["Oda dolu.", "Maç bitti.", "Zaten aktif bir oda var."]) {
    room.onUncaughtException(new Error("x", { cause: new Error(message) }), "onJoin");
  }
  assert.equal(errors.length, 1, "bilinen red hata olarak yazildi");
});

test("istemci yeniden yuklemede kayitli anahtarla suren maca donuyor", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const session = read("apps/web/src/online-session.ts");
  const menu = read("apps/web/src/menu-ui.ts");
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.ok(session.includes("window.sessionStorage.setItem(MATCH_RECONNECT_KEY"), "anahtar sekmeye yazilmiyor");
  assert.ok(session.includes(".reconnect(record.token)"));
  assert.ok(menu.includes("loadMatchReconnect()") && menu.includes("resumeSavedMatch(gameServerUrl, savedMatch)"), "menu acilista donmeyi denemiyor");
  assert.ok(scene.includes("takeResumedMatch()"), "sahne donulen odayi kullanmiyor");
  // Baglanildiginda, yeniden baglanmada kaydediliyor; mac bitince, hata ve basarisiz donuste siliniyor.
  assert.equal(scene.match(/this\.rememberMatchReconnect\(/g)?.length, 2);
  const handleResult = scene.slice(scene.indexOf("private handleMatchResult("), scene.indexOf("private handleMatchResult(") + 400);
  assert.ok(handleResult.includes("clearMatchReconnect("), "mac sonunda kayit silinmiyor");
  assert.ok(scene.includes("clearMatchReconnect(disconnectedRoom.roomId)"), "basarisiz donuste kayit silinmiyor");
  assert.ok(scene.includes(`room.onMessage("room:error"`), "sunucunun kapatma mesaji dinlenmiyor");
});
