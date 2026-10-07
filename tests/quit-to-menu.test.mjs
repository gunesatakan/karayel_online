/**
 * Mac icinden menuye donus: co-op'ta bir oyuncu izinli cikinca sunucu.
 *
 * Kilitlenen sozler:
 *   1. Izinli cikan oyuncu icin yeniden baglanma penceresi acilmiyor; hemen
 *      ayrilmis sayiliyor ve takimin olcegine girmiyor.
 *   2. Oda kalanlar icin suruyor: tick hatasiz donuyor, oda kapanmiyor
 *      (kimsesiz oda suresi gecse de), kurulum yalnizca bagli oyuncuyu bekliyor.
 *   3. Cikanin kaydi yerinde: kuleleri sahada (tick'ten sonra da), iscileri
 *      kadroda, oldurme altini kaydina yaziliyor (tecrube payi yok).
 *   4. Son oyuncu da izinli cikinca oda beklemeden kapaniyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ABANDONED_ROOM_DISPOSE_MS } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function fakeClient(sessionId) {
  const client = {
    sessionId,
    ref: { bufferedAmount: 0 },
    sent: [],
    send(type, payload) { client.sent.push({ type, payload }); }
  };
  return client;
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

/** Iki kisilik, baslamis co-op oda (gercek MatchRoom, onCreate'siz duzenek). */
function coopRoom() {
  const room = createRoom("warrior");
  room.roomId = "cikis-coop";
  const p1 = room.state.players.get("p1");
  p1.connected = true;
  p1.slot = 1;
  room.state.players.set("p2", {
    ...p1,
    id: "p2",
    name: "Ikinci",
    characterId: "zeynep",
    slot: 2,
    gold: 1_000_000,
    runModifiers: [],
    ownedCardIds: [],
    ownedShopItemIds: [],
    inventoryItemIds: [],
    hiredWorkers: [],
    skillCooldowns: []
  });
  room.broadcast = () => {};
  const a = fakeClient("p1");
  const b = fakeClient("p2");
  room.clients = [a, b];
  room.abandonCheckEnabled = true;
  const errors = [];
  room.reportRoomError = (context, error) => errors.push({ context, error });
  let disposed = 0;
  room.disconnect = () => { disposed += 1; return Promise.resolve(); };
  return { room, a, b, errors, disposed: () => disposed };
}

function placeTowerFor(room, sessionId, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, "insa edilebilir kare yok");
  room.placeTower({ sessionId, send() {} }, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].find((entry) => entry.ownerId === sessionId);
  assert.ok(tower, `${sessionId} kulesi kurulamadi`);
  return tower;
}

const workersOf = (room, sessionId) => [...room.drones.keys()].filter((id) => id.startsWith(`logistics-${sessionId}-`));

test("co-op: mac ortasinda izinli cikis odayi kalan oyuncu icin kapatmiyor", async () => {
  const { room, b, errors, disposed } = coopRoom();
  const clock = withClock(20_000_000);
  try {
    const tower = placeTowerFor(room, "p2", "zeynep-1");
    room.ensureLogisticsWorkers();
    const workersBefore = workersOf(room, "p2");
    assert.ok(workersBefore.length >= 4, "cikacak oyuncunun iscileri yok");
    assert.equal(room.getActivePlayerCount(), 2);

    // Oyuncu "Menüye dön"e basti: istemci leave(true), sunucuda consented.
    room.clients = room.clients.filter((client) => client !== b);
    await room.onLeave(b, true);

    // 1. Pencere yok, hemen ayrilmis.
    assert.equal(room.reconnectingSessionIds.has("p2"), false, "izinli cikisa yeniden baglanma penceresi acildi");
    assert.equal(room.pendingReconnections.has("p2"), false);
    assert.equal(room.departedSessionIds.has("p2"), true);
    assert.equal(room.consentedLeaveSessionIds.has("p2"), true);
    assert.equal(room.getActivePlayerCount(), 1, "ayrilan oyuncu dalga olcegine giriyor");
    assert.equal(room.isLeftByEveryone(), false, "kalan oyuncu varken oda herkesce birakilmis sayildi");

    // 3. Kayit, kule ve isciler yerinde.
    const leaver = room.state.players.get("p2");
    assert.ok(leaver, "cikanin kaydi silindi");
    assert.equal(leaver.connected, false);
    assert.equal(room.towers.get(tower.id)?.ownerId, "p2", "cikanin kulesi kaldirildi ya da devredildi");
    room.ensureLogisticsWorkers();
    assert.deepEqual(workersOf(room, "p2").sort(), workersBefore.sort(), "cikanin iscileri kayboldu ya da katlandi");

    // Oldurme altini odadaki her kayda; tecrube yalnizca kalanlara.
    const goldBefore = { p1: room.state.players.get("p1").gold, p2: leaver.gold };
    const expBefore = { p1: room.state.players.get("p1").experience, p2: leaver.experience };
    room.awardEnemyGold({ reward: 10 }, "p1");
    assert.ok(room.state.players.get("p1").gold > goldBefore.p1);
    assert.ok(leaver.gold > goldBefore.p2, "cikanin kaydi oldurme altini almiyor");
    room.awardEnemyExperience({ type: "runner", movementKind: "ground" });
    assert.ok(room.state.players.get("p1").experience > expBefore.p1);
    assert.equal(leaver.experience, expBefore.p2, "ayrilan oyuncu tecrube payi aliyor");

    // 2. Oda kalan oyuncu icin suruyor: tick hatasiz, kimsesiz oda suresi
    // gecse de kapanmiyor.
    room.spawnEnemy();
    for (let tick = 0; tick < 40; tick += 1) {
      room.update(50);
      clock.advance(50);
    }
    clock.advance(ABANDONED_ROOM_DISPOSE_MS * 2);
    room.update(50);
    room.update(50);
    assert.deepEqual(errors.map((entry) => `${entry.context}: ${entry.error?.message}`), [], "tick hata verdi");
    assert.equal(room.tickFailures, 0);
    assert.equal(disposed(), 0, "oda kalan oyuncunun altindan kapandi");
    assert.equal(room.abandonDisposing, false);
    assert.ok(room.towers.has(tower.id), "cikanin kulesi tick'te silindi");

    // Kurulum yalnizca bagli oyuncuyu bekliyor: cikan "hazir" demeyecek.
    room.setupPhase = true;
    room.setupReadyPlayerIds.add("p1");
    room.tryFinishSetupPhase();
    assert.equal(room.setupPhase, false, "kurulum cikan oyuncuyu bekliyor");

    // 4. Son oyuncu da menuye donunce oda beklemeden kapaniyor.
    const a = room.clients[0];
    room.clients = [];
    await room.onLeave(a, true);
    assert.equal(room.isLeftByEveryone(), true);
    room.update(16);
    clock.advance(16);
    room.update(16);
    assert.equal(disposed(), 1, "herkesin biraktigi oda beklemeye devam etti");
  } finally {
    clock.restore();
  }
});

test("co-op: izinsiz kopma (sekme kapandi) ise pencereyi aciyor; izinli cikistan farki", async () => {
  const { room, b } = coopRoom();
  let release;
  room.allowReconnection = () => {
    const pending = new Promise((_, reject) => { release = reject; });
    pending.reject = (error) => release(error);
    return pending;
  };
  room.clients = room.clients.filter((client) => client !== b);
  const leaving = room.onLeave(b, false);
  assert.equal(room.reconnectingSessionIds.has("p2"), true, "kopan oyuncuya pencere acilmadi");
  assert.equal(room.departedSessionIds.has("p2"), false, "pencere suren oyuncu ayrilmis sayildi");
  assert.equal(room.consentedLeaveSessionIds.has("p2"), false);
  release(new Error("pencere doldu"));
  await leaving;
  assert.equal(room.departedSessionIds.has("p2"), true);
  assert.equal(room.isLeftByEveryone(), false, "izinsiz kopma izinli cikis sayildi");
});
