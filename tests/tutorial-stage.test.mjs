/**
 * Ogretici asamasi (Eğitim), sunucu tarafi.
 *
 * Sozler: oda yalnizca dogrudan baslatilan tek kisilik kurulumda ogretici
 * oluyor; nexus hic olmuyor; dusmanlar tek tuk, cok yavas ve sampiyonsuz;
 * dalga sayaci ilerlemiyor ve son dalga zaferi hic gelmiyor; zafer yalnizca
 * `tutorial:complete` ile ve ilerleme kapilarindan gecemiyor. Adim olcumu
 * yalnizca gercekten is yapan istekte `tutorial:progress` yolluyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_RULES, MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import {
  FINAL_WAVE,
  TUTORIAL_ENEMY_SPEED_MULTIPLIER,
  TUTORIAL_EXPERIENCE_FLOOR,
  TUTORIAL_GOLD_FLOOR,
  TUTORIAL_NEXUS_FLOOR,
  TUTORIAL_REPUTATION,
  TUTORIAL_SPAWN_INTERVAL_MS,
  TUTORIAL_TRACKED_MESSAGES,
  TUTORIAL_WAVE_ENEMY_COUNT,
  canRecordProgress
} from "../packages/shared/dist/index.js";
import { findBuildableSpot } from "./helpers/match-room-harness.mjs";

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

/** `onCreate`'ten gecen gercek oda; simulasyon saati baglanmiyor, yayinlar toplaniyor. */
async function realRoom(options) {
  const room = new MatchRoom();
  room.roomId = `ogretici-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  const broadcasts = [];
  room.broadcast = (type, payload) => broadcasts.push({ type, payload });
  await room.onCreate(options);
  return { room, broadcasts };
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

function send(room, client, type, payload = {}) {
  room.messageBuckets?.clear();
  const handler = room.onMessageHandlers[type];
  assert.ok(handler, `${type} kayitli degil`);
  handler.callback(client, payload);
}

const progressOf = (client) => client.sent.filter((entry) => entry.type === "tutorial:progress").map((entry) => entry.payload);

/** ZentaX ile baslamis ogretici odasi (kurulum evresinde). */
async function tutorialRoom(extra = {}) {
  const { room, broadcasts } = await realRoom({ roomName: "Egitim", mapScale: 1, autoStart: true, tutorial: true, ...extra });
  const client = joinClient(room, "solo", { characterId: "zeynep" });
  assert.equal(room.gameStarted, true, "ogretici maci baslamadi");
  return { room, client, broadcasts, player: room.state.players.get("solo") };
}

/** Kurulumu odanin kendi kuraliyla bitirir (Devam). */
function startCombat(room, client) {
  send(room, client, "wave:continue");
  assert.equal(room.setupPhase, false, "kurulum bitmedi");
}

/** Bir dusmani kacis dalindan nexus'a sokar. */
function leak(room) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { type: "grunt", movementKind: "ground" });
  enemy.y = room.getArenaBottom() + room.getMapCellRadius() + 1;
  room.updateEnemies(0.016);
  return enemy;
}

function withClock(start = Date.now()) {
  const realNow = Date.now;
  let now = start;
  Date.now = () => now;
  return {
    advance(ms) { now += ms; },
    restore() { Date.now = realNow; }
  };
}

test("ogretici yalnizca dogrudan baslatilan tek kisilik odada; asama hep 1, sampiyon kapali", async () => {
  const { room } = await tutorialRoom({ stage: 4 });
  try {
    assert.equal(room.tutorialMode, true);
    assert.equal(room.creativeMode, false);
    assert.equal(room.stage, 1, "ogretici istenen asamayi aldi");
    assert.equal(room.maxClients, 1);
    assert.equal(room.hasJoinableSeat(), false);
    assert.equal(room.championsEnabled, false);
  } finally {
    cleanup(room);
  }

  const lobby = await realRoom({ roomName: "Lobi", mapScale: 1, tutorial: true });
  assert.equal(lobby.room.tutorialMode, false, "lobi yolundan ogretici acildi");
  cleanup(lobby.room);

  const both = await realRoom({ roomName: "Ikisi", mapScale: 1, autoStart: true, tutorial: true, creative: true });
  assert.equal(both.room.creativeMode, true);
  assert.equal(both.room.tutorialMode, false, "yaratici istegiyle ogretici birlikte acildi");
  cleanup(both.room);
});

test("ogretici bol altin ve tecrubeyle basliyor", async () => {
  const { room, player } = await tutorialRoom();
  try {
    assert.ok(player.gold >= TUTORIAL_GOLD_FLOOR, `altin ${player.gold}`);
    assert.ok(player.experience >= TUTORIAL_EXPERIENCE_FLOOR, `tecrube ${player.experience}`);
  } finally {
    cleanup(room);
  }
});

test("dalga: birkac dusman, uzun aralik; sampiyon, ozel dusman ve serit yok", async () => {
  const { room, client } = await tutorialRoom();
  try {
    assert.equal(room.waveTarget, TUTORIAL_WAVE_ENEMY_COUNT);
    assert.equal(room.waveChampionPlan, undefined);
    assert.equal(room.waveSpecialPlan, undefined);
    assert.equal(room.wavePatternPlan, undefined);
    startCombat(room, client);

    // Dusmanlar yurumuyor (yalnizca dogum saati): bir dakikada en fazla dalga kadar.
    const spawnTimes = [];
    for (let ms = 0; ms <= 60_000; ms += 100) {
      const before = room.enemies.size;
      room.updateSpawning(100);
      if (room.enemies.size > before) spawnTimes.push(ms);
    }
    assert.equal(room.enemies.size, TUTORIAL_WAVE_ENEMY_COUNT, "dakikada dalgadan fazla dusman dogdu");
    for (let index = 1; index < spawnTimes.length; index += 1) {
      assert.ok(spawnTimes[index] - spawnTimes[index - 1] >= TUTORIAL_SPAWN_INTERVAL_MS - 100, `dogumlar arasi ${spawnTimes[index] - spawnTimes[index - 1]} ms`);
    }
    for (const enemy of room.enemies.values()) {
      assert.equal(enemy.champion, undefined, "sampiyon dogdu");
      assert.equal(enemy.special, undefined, "ozel dusman dogdu");
    }
    assert.equal(room.counterSurges.length, 0, "karsi atak seridi basladi");
  } finally {
    cleanup(room);
  }
});

test("dusman normal yuruyusun cok altinda", async () => {
  const { room } = await tutorialRoom();
  const realRandom = Math.random;
  Math.random = () => 0.3;
  try {
    room.spawnEnemy();
    const slow = [...room.enemies.values()].at(-1);
    room.tutorialMode = false;
    room.spawnEnemy();
    const normal = [...room.enemies.values()].at(-1);
    assert.equal(slow.type, normal.type);
    assert.ok(Math.abs(slow.speed / normal.speed - TUTORIAL_ENEMY_SPEED_MULTIPLIER) < 1e-9, `oran ${slow.speed / normal.speed}`);
    assert.ok(TUTORIAL_ENEMY_SPEED_MULTIPLIER <= 0.5);
  } finally {
    Math.random = realRandom;
    cleanup(room);
  }
});

test("nexus olmuyor: sizinti can aliyor ama tabanda kaliyor, yenilgi yok", async () => {
  const { room, client } = await tutorialRoom();
  try {
    startCombat(room, client);
    const before = room.teamHealth;
    leak(room);
    assert.ok(room.teamHealth < before, "sizinti nexusa hic vurmadi");
    room.teamHealth = 2;
    for (let index = 0; index < 6; index += 1) leak(room);
    assert.equal(room.teamHealth, TUTORIAL_NEXUS_FLOOR);
    assert.equal(room.matchResult, undefined, "ogreticide yenilgi geldi");
  } finally {
    cleanup(room);
  }
});

test("temizlenen dalga yeniden doguyor: sayac, karne, kart ve kurulum yok; son dalga zaferi yok", async () => {
  const { room, client, broadcasts } = await tutorialRoom();
  const clock = withClock();
  try {
    startCombat(room, client);
    room.wave = FINAL_WAVE;
    room.teamHealth = 10;
    room.enemies.clear();
    room.waveSpawned = room.waveTarget;
    room.waveClearedAt = 0;
    room.updateSpawning(16);
    clock.advance(3000);
    room.updateSpawning(16);
    assert.equal(room.matchResult, undefined, "son dalga zaferi geldi");
    assert.equal(room.wave, FINAL_WAVE, "dalga sayaci ilerledi");
    assert.equal(room.setupPhase, false, "kurulum acildi");
    assert.equal(room.waveSpawned, 0, "dalga yeniden kurulmadi");
    assert.equal(room.waveTarget, TUTORIAL_WAVE_ENEMY_COUNT);
    assert.ok(room.teamHealth > 10, "nexus dongude dolmadi");
    assert.equal(broadcasts.filter((entry) => entry.type === "wave:report").length, 0, "karne yollandi");
    assert.equal(client.sent.filter((entry) => entry.type === "card:choices").length, 0, "kart eli acildi");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("tutorial:complete zafer getiriyor; sonuc ilerleme kapilarindan gecemiyor", async () => {
  const { room, client, broadcasts } = await tutorialRoom();
  try {
    startCombat(room, client);
    send(room, client, "tutorial:complete");
    assert.equal(room.matchResult, "victory");
    send(room, client, "tutorial:complete");
    const results = broadcasts.filter((entry) => entry.type === "match:victory");
    assert.equal(results.length, 1, "zafer iki kez yollandi");
    const payload = results[0].payload;
    assert.equal(payload.tutorial, true);
    assert.equal(payload.creative, true);
    assert.equal(payload.run.creative, true);
    assert.equal(canRecordProgress(payload), false);
    assert.equal(canRecordProgress(payload.run), false);
  } finally {
    cleanup(room);
  }
});

test("ogretici olmayan odada ogretici mesajlari is yapmiyor, govdeyi okumuyor", async () => {
  const { room } = await realRoom({ roomName: "Solo", mapScale: 1, autoStart: true });
  const client = joinClient(room, "solo", { characterId: "zeynep" });
  try {
    assert.equal(room.tutorialMode, false);
    const player = room.state.players.get("solo");
    const reads = [];
    const payload = new Proxy({ step: "ultimate" }, {
      get(target, key) { reads.push(key); return target[key]; },
      has(target, key) { reads.push(key); return key in target; },
      getOwnPropertyDescriptor(target, key) { reads.push(key); return Object.getOwnPropertyDescriptor(target, key); },
      ownKeys(target) { reads.push("ownKeys"); return Reflect.ownKeys(target); }
    });
    for (const type of Object.keys(MESSAGE_RULES).filter((name) => name.startsWith("tutorial:"))) {
      send(room, client, type, payload);
    }
    assert.deepEqual(reads, [], "kapidan once govde okundu");
    assert.equal(player.ultimateCharge, 0);
    assert.equal(room.matchResult, undefined, "ogretici disinda zafer geldi");

    // Izleme de yalnizca ogreticide: normal odada adim mesaji hic gitmiyor.
    const spot = findBuildableSpot(room, "zeynep-1");
    send(room, client, "placeTower", { ...spot, definitionId: "zeynep-1" });
    assert.equal(room.towers.size, 1);
    assert.deepEqual(progressOf(client), []);
  } finally {
    cleanup(room);
  }
});

test("hazirlik: ulti sarji, beceri itibari, kart eli ve dalga icinde magaza", async () => {
  const { room, client, player } = await tutorialRoom();
  try {
    startCombat(room, client);
    player.gold = 0;
    player.experience = 0;
    send(room, client, "tutorial:prepare", { step: "resources" });
    assert.equal(player.gold, TUTORIAL_GOLD_FLOOR);
    assert.equal(player.experience, TUTORIAL_EXPERIENCE_FLOOR);

    send(room, client, "tutorial:prepare", { step: "ultimate" });
    assert.equal(player.ultimateCharge, 100);

    player.skill1CooldownMs = 5000;
    send(room, client, "tutorial:prepare", { step: "skill" });
    assert.equal(player.reputation, TUTORIAL_REPUTATION);
    assert.equal(player.skill1CooldownMs, 0);

    send(room, client, "tutorial:prepare", { step: "bilinmeyen" });

    // Kart: el aciliyor, secim ilerleme sayiliyor ve magazayi aciyor.
    const spot = findBuildableSpot(room, "zeynep-1");
    send(room, client, "placeTower", { ...spot, definitionId: "zeynep-1" });
    send(room, client, "tutorial:prepare", { step: "cards" });
    const hand = client.sent.filter((entry) => entry.type === "card:choices").at(-1)?.payload;
    assert.ok(hand?.length > 0, "kart eli gelmedi");
    const card = hand.find((choice) => choice.scope.kind !== "targeted") ?? hand[0];
    send(room, client, "card:choose", { cardId: card.id, towerId: [...room.towers.keys()][0] });
    assert.ok(progressOf(client).some((entry) => entry.action === "card"), "kart secimi sayilmadi");
    assert.ok(player.shopOffers.length > 0, "kart seciminden sonra vitrin acilmadi");
    for (const offer of player.shopOffers) {
      assert.ok(!["riskli-yatirim", "bariyer", "ziftli-zemin"].includes(offer.id), `${offer.id} ogretici vitrininde`);
    }

    // Magaza dalga icinde de satiyor; tek alimdan sonra vitrin kapaniyor.
    assert.equal(room.setupPhase, false);
    player.gold = 100_000;
    send(room, client, "shop:buy", { itemId: player.shopOffers[0].id });
    assert.ok(progressOf(client).some((entry) => entry.action === "shop"), "alim sayilmadi");
    assert.equal(player.shopOffers.length, 0, "vitrin acik kaldi");
    send(room, client, "tutorial:prepare", { step: "shop" });
    assert.ok(player.shopOffers.length > 0, "hazirlik vitrini acmadi");
  } finally {
    cleanup(room);
  }
});

test("adim olcumu: yalnizca is yapan istek sayiliyor", async () => {
  const { room, client, player } = await tutorialRoom();
  try {
    const spot = findBuildableSpot(room, "zeynep-1");
    send(room, client, "placeTower", { ...spot, definitionId: "zeynep-1" });
    assert.deepEqual(progressOf(client), [{ action: "build", definitionIds: ["zeynep-1"] }]);
    // Ayni kareye ikinci kule: reddediliyor, sayilmiyor.
    send(room, client, "placeTower", { ...spot, definitionId: "zeynep-1" });
    assert.equal(progressOf(client).length, 1);

    const tower = [...room.towers.values()][0];
    player.experience = 0;
    send(room, client, "upgradeTower", { towerId: tower.id });
    assert.equal(progressOf(client).length, 1, "tecrubesiz gelistirme sayildi");
    player.experience = 10_000;
    send(room, client, "upgradeTower", { towerId: tower.id });
    assert.equal(progressOf(client).at(-1).action, "upgrade");

    send(room, client, "setTowerPerformance", { towerId: tower.id, performance: tower.performance });
    assert.equal(progressOf(client).at(-1).action, "upgrade", "degismeyen kol sayildi");
    send(room, client, "setTowerPerformance", { towerId: tower.id, performance: tower.performance > 0.5 ? 0.25 : 0.75 });
    assert.equal(progressOf(client).at(-1).action, "settings");

    send(room, client, "worker:hire", { role: "repairer", advanced: false });
    assert.deepEqual(progressOf(client).at(-1), { action: "hire", role: "repairer" });

    // Ulti sarjsiz is yapmiyor; sarjla ve gecerli sutunla sayiliyor.
    startCombat(room, client);
    send(room, client, "useUltimate", { column: 2 });
    assert.notEqual(progressOf(client).at(-1).action, "ultimate");
    send(room, client, "tutorial:prepare", { step: "ultimate" });
    send(room, client, "useUltimate", { column: 2 });
    assert.equal(progressOf(client).at(-1).action, "ultimate");

    // Itibarsiz komut reddediliyor; hazirliktan sonra sayiliyor.
    player.reputation = 0;
    send(room, client, "useSkill", { slot: 0, commandTier: "small" });
    assert.notEqual(progressOf(client).at(-1).action, "skill");
    send(room, client, "tutorial:prepare", { step: "skill" });
    send(room, client, "useSkill", { slot: 0, commandTier: "small" });
    assert.equal(progressOf(client).at(-1).action, "skill");

    // Izlenen her mesajin bir kurali var (kayitli tur).
    for (const type of Object.keys(TUTORIAL_TRACKED_MESSAGES)) assert.ok(MESSAGE_RULES[type], `${type} kuralsiz`);
  } finally {
    cleanup(room);
  }
});
