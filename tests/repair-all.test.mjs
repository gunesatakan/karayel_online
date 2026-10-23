/**
 * "Tumunu Onar" (envanter cekmecesi).
 *
 * Sozler: dugmedeki yapi sayisi ve bedel sunucunun tahsil ettigiyle ayni
 * (`planRepairAll`, tekli onarimin bedel fonksiyonu); altin yetmezse en
 * hasarlidan baslayarak yettigi kadari ve dugme bunu "k/N" ile soyluyor;
 * bedensiz oyuncuda aninda, bedenli oyuncuda tek gorev (kuyrukta tek yer):
 * butun bedel komutta ayriliyor, gecersizlesen durak iade, geri cekilmede
 * kalan iade; tekli onarima verilmis yapi ikinci kez tahsil edilmiyor; tek
 * ozet toast'u. Metinler tr+en.
 *
 * Sahibin istegi (2026-10-24): altinla onarim (tekli ve "Tumunu Onar") yalniz
 * kurulumda; dalgada yapilari yalnizca tamirciler onariyor. Kurulumda verilip
 * dalga baslarken yolda olan onarim dusuyor, bedeli iade.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MatchRoom, MESSAGE_RULES } from "../apps/server/dist/rooms/MatchRoom.js";
import {
  OPERATOR_BODY_LOW_HP_RATIO,
  TUTORIAL_TRACKED_MESSAGES,
  getMapGridSize,
  getMapOrigin,
  getRepairAllButtonState,
  getStructureRepairAllCue,
  getStructureRepairCostWithModifiers,
  getTowerBuildCost,
  planRepairAll,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

MatchRoom.maxConcurrentRooms = 1000;
let roomCounter = 0;

function fakeClient(sessionId) {
  const client = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { client.sent.push({ type, payload }); } };
  return client;
}

const messages = (client, type) => client.sent.filter((entry) => entry.type === type).map((entry) => entry.payload);
const ownTowers = (room, sessionId = "p1") => [...room.towers.values()].filter((tower) => tower.ownerId === sessionId);

/** Sunucunun yaptigi gibi: oyuncunun yapilarindan aday listesi (istemci de ayni girdiyi kuruyor). */
function candidatesOf(room, sessionId = "p1") {
  return ownTowers(room, sessionId).map((tower) => ({
    id: tower.id,
    hp: tower.hp,
    maxHp: tower.maxHp,
    buildCost: getTowerBuildCost(tower.definition.cost),
    costMultiplier: room.getTowerRepairCostMultiplier(tower)
  }));
}

async function startedRoom(characterIds = ["warrior"]) {
  const room = new MatchRoom();
  room.roomId = `tumunu-onar-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  await room.onCreate({ roomName: "Onar", mapScale: 1 });
  const clients = characterIds.map((characterId, index) => {
    const client = fakeClient(`p${index + 1}`);
    room.clients.push(client);
    room.onJoin(client, { playerName: client.sessionId, characterId });
    return client;
  });
  if (!room.gameStarted) {
    for (const client of clients) room.onMessageHandlers["lobby:setReady"].callback(client, { ready: true });
    room.onMessageHandlers["lobby:start"].callback(clients[0]);
  }
  assert.equal(room.gameStarted, true);
  room.buildZones = undefined;
  return { room, clients };
}

function cleanup(room) {
  MatchRoom.rooms.delete(room.roomId);
  MatchRoom.publicRooms.delete(room.roomId);
}

function send(room, client, type, payload = {}) {
  room.messageBuckets?.clear();
  room.onMessageHandlers[type].callback(client, payload);
}

function withClock() {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  return { advance(ms) { now += ms; }, restore() { Date.now = realNow; } };
}

function fly(room, clock, ms, until) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    clock.advance(50);
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateOperatorBodies(0.05, 0.04);
    if (until?.()) return;
  }
}

function spots(room, definitionId, count) {
  const found = [];
  const { cols, rows } = room.activeMap;
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  for (let row = 2; row < rows - 3 && found.length < count; row += 2) {
    for (let col = 1; col < cols - 1 && found.length < count; col += 3) {
      const x = origin.x + (col + 0.5) * gridSize;
      const y = origin.y + (row + 0.5) * gridSize;
      if (room.canPlaceTower(x, y, definitionId, "horizontal") && !found.some((spot) => Math.abs(spot.x - x) < 1 && Math.abs(spot.y - y) < 1)) found.push({ x, y });
    }
  }
  assert.equal(found.length, count, "kurulabilir kare bulunamadi");
  return found;
}

function spawnEnemy(room, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    type: "grunt", movementKind: "ground", hp: 400, maxHp: 400, shield: 0, maxShield: 0, armor: 0, reward: 20, attack: 12,
    champion: undefined, special: undefined, damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides
  });
  return enemy;
}

/** Bedensiz oda (Onur): kule, duvar ve kaynak binalari dahil butun yapilar. */
function roomWithTowers(characterId = "onur") {
  const room = createRoom(characterId);
  const quiet = { sessionId: "p1", send() {} };
  for (const definition of towerCatalog[characterId]) {
    const spot = findBuildableSpot(room, definition.id);
    if (spot) room.placeTower(quiet, { x: spot.x, y: spot.y, definitionId: definition.id });
  }
  const towers = ownTowers(room);
  assert.ok(towers.length >= 4, `yeterli yapi kurulamadi: ${towers.length}`);
  // Altinla onarim yalniz kurulumda (createRoom dalgada aciyor).
  room.setupPhase = true;
  return { room, player: room.state.players.get("p1"), towers };
}

// ------------------------------------------------------------------ plan

test("plan: yalnizca ayakta ve hasarli yapilar; bedel tekli onarimin fonksiyonu", () => {
  const plan = planRepairAll([
    { id: "a", hp: 50, maxHp: 100, buildCost: 120, costMultiplier: 1 },
    { id: "b", hp: 0, maxHp: 100, buildCost: 120 },
    { id: "c", hp: 100, maxHp: 100, buildCost: 120 },
    { id: "d", hp: 10, maxHp: 100, buildCost: 80, costMultiplier: 0.5 }
  ], 1_000_000);
  const costA = getStructureRepairCostWithModifiers(120, 0.5, 1);
  const costD = getStructureRepairCostWithModifiers(80, 0.9, 0.5);
  assert.equal(plan.damaged, 2, "yikilan ve tam canli sayilmamali");
  assert.deepEqual(plan.ids, ["d", "a"], "en hasarli once");
  assert.deepEqual(plan.costs, [costD, costA]);
  assert.equal(plan.totalCost, costA + costD);
  assert.equal(plan.cost, plan.totalCost);
});

test("plan: altin yetmezse en hasarlidan baslayarak yettigi kadar; yetmeyen atlaniyor", () => {
  const candidates = [
    { id: "light", hp: 90, maxHp: 100, buildCost: 100 },
    { id: "heavy", hp: 10, maxHp: 100, buildCost: 100 },
    { id: "mid", hp: 50, maxHp: 100, buildCost: 100 }
  ];
  const full = planRepairAll(candidates, 1_000_000);
  const [heavy, mid, light] = full.costs;
  assert.deepEqual(full.ids, ["heavy", "mid", "light"]);
  // En hasarli ile ortadaki yetiyor, sonuncusu yetmiyor.
  const partial = planRepairAll(candidates, heavy + mid + light - 1);
  assert.deepEqual(partial.ids, ["heavy", "mid"]);
  assert.equal(partial.cost, heavy + mid);
  assert.equal(partial.damaged, 3);
  // En hasarliya yetmiyor ama daha ucuz olanlara yetiyor.
  const skip = planRepairAll(candidates, mid + light);
  assert.deepEqual(skip.ids, ["mid", "light"]);
  assert.equal(planRepairAll(candidates, light - 1).ids.length, 0);
});

test("dugme durumu: toplam, k/N, yetersiz altin, onarilacak yok", () => {
  const candidates = [
    { id: "x", hp: 10, maxHp: 100, buildCost: 100 },
    { id: "y", hp: 60, maxHp: 100, buildCost: 100 }
  ];
  const full = planRepairAll(candidates, 1_000_000);
  assert.deepEqual(getRepairAllButtonState(full), { key: "action", enabled: true, params: { count: 2, cost: full.totalCost } });
  const partial = planRepairAll(candidates, full.costs[0]);
  assert.deepEqual(getRepairAllButtonState(partial), { key: "partial", enabled: true, params: { affordable: 1, count: 2, cost: full.costs[0] } });
  assert.deepEqual(getRepairAllButtonState(planRepairAll(candidates, 0)), { key: "noGold", enabled: false, params: { count: 2 } });
  assert.deepEqual(getRepairAllButtonState(planRepairAll([], 500)), { key: "none", enabled: false, params: {} });
  assert.equal(getRepairAllButtonState(planRepairAll([candidates[0]], 1_000_000)).key, "actionOne");
  // Dalgada: hasarli yapi sayisi gorunuyor, dugme kapali; onarilacak yoksa yine "none".
  assert.deepEqual(getRepairAllButtonState(full, { setupPhase: false }), { key: "setupOnly", enabled: false, params: { count: 2 } });
  assert.equal(getRepairAllButtonState(planRepairAll([], 500), { setupPhase: false }).key, "none");
  assert.equal(getRepairAllButtonState(full, { setupPhase: true }).key, "action");
});

// --------------------------------------------------------- bedensiz: aninda

test("bedensiz: sunucu plani istemcinin plani; hepsi aninda, tek ozet, tekli onay yok", () => {
  const { room, player, towers } = roomWithTowers("onur");
  towers.forEach((tower, index) => { tower.hp = tower.maxHp * (0.2 + 0.1 * (index % 5)); });
  towers[0].hp = 0;
  towers[1].hp = towers[1].maxHp;
  const expected = planRepairAll(candidatesOf(room), player.gold);
  assert.deepEqual(room.getRepairAllPlan("p1", player.gold), expected);
  assert.equal(expected.damaged, towers.length - 2);
  const goldBefore = player.gold;
  const client = fakeClient("p1");
  room.commandRepairAll(client);
  assert.equal(goldBefore - player.gold, expected.totalCost, "dugmedeki bedel tahsil edilen");
  for (const tower of towers.slice(2)) assert.equal(tower.hp, tower.maxHp);
  assert.equal(towers[0].hp, 0, "yikilan yapi onarilmamali");
  assert.equal(messages(client, "structure:repaired").length, 0, "N toast olmamali");
  const summary = messages(client, "structure:repairedAll");
  assert.equal(summary.length, 1);
  assert.equal(summary[0].count, expected.damaged);
  assert.equal(summary[0].cost, expected.totalCost);
  assert.equal(getStructureRepairAllCue(summary[0]).text, `${expected.damaged} yapı onarıldı · ${expected.totalCost}g`);
  assert.equal(getStructureRepairAllCue(summary[0]).sfx, "repair");

  // Onarilacak yapi kalmadi: sessiz, altin yerinde.
  const again = fakeClient("p1");
  const goldAfter = player.gold;
  room.commandRepairAll(again);
  assert.equal(again.sent.length, 0);
  assert.equal(player.gold, goldAfter);
});

test("bedensiz: altin yetmezse en hasarlilar onariliyor; hic yetmezse hicbir sey", () => {
  const { room, player, towers } = roomWithTowers("onur");
  towers.forEach((tower, index) => { tower.hp = tower.maxHp * (0.15 + 0.15 * (index % 5)); });
  const all = planRepairAll(candidatesOf(room), 1_000_000);
  const budget = all.costs[0] + all.costs[1];
  player.gold = budget;
  const expected = planRepairAll(candidatesOf(room), budget);
  assert.ok(expected.ids.length >= 2 && expected.ids.length < all.ids.length);
  const client = fakeClient("p1");
  room.commandRepairAll(client);
  assert.equal(player.gold, budget - expected.cost);
  for (const id of expected.ids) assert.equal(room.towers.get(id).hp, room.towers.get(id).maxHp);
  const untouched = all.ids.filter((id) => !expected.ids.includes(id));
  for (const id of untouched) assert.ok(room.towers.get(id).hp < room.towers.get(id).maxHp);
  assert.equal(messages(client, "structure:repairedAll")[0].count, expected.ids.length);

  player.gold = 0;
  const broke = fakeClient("p1");
  room.commandRepairAll(broke);
  assert.equal(broke.sent.length, 0);
});

// ------------------------------------------------------------- bedenli

test("bedenli: tek gorev, butun bedel komutta ayriliyor, varista tek tek onarim", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    for (const spot of spots(room, "warrior-1", 3)) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const towers = ownTowers(room);
    towers.forEach((tower, index) => { tower.hp = tower.maxHp * (0.3 + 0.2 * index); });
    const expected = planRepairAll(candidatesOf(room), player.gold);
    const goldBefore = player.gold;
    send(room, client, "structure:repairAll");
    const body = room.getOperatorBody("p1");
    assert.equal(body.tasks.length, 1, "kuyrukta tek yer");
    assert.equal(body.tasks[0].kind, "repairAll");
    assert.equal(body.tasks[0].reservedGold, expected.cost);
    assert.equal(goldBefore - player.gold, expected.cost, "bedel komutta ayrilmadi");
    assert.ok(towers.every((tower) => tower.hp < tower.maxHp), "beden varmadan onarildi");
    // Kuyruktakiler tekrar istenemiyor (cift tahsil yok).
    send(room, client, "structure:repairAll");
    send(room, client, "structure:repair", { towerId: towers[0].id });
    assert.equal(body.tasks.length, 1);
    fly(room, clock, 6000);
    assert.equal(body.tasks.length, 0);
    assert.ok(towers.every((tower) => tower.hp === tower.maxHp));
    assert.equal(goldBefore - player.gold, expected.cost, "iki kez tahsil");
    assert.equal(messages(client, "structure:repaired").length, 0);
    const summary = messages(client, "structure:repairedAll");
    assert.equal(summary.length, 1);
    assert.deepEqual({ count: summary[0].count, cost: summary[0].cost }, { count: 3, cost: expected.cost });
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("bedenli: tekli onarima verilen yapi atlaniyor; yolda yikilan durak iade", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    for (const spot of spots(room, "warrior-1", 3)) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const [single, doomed, kept] = ownTowers(room);
    for (const tower of [single, doomed, kept]) tower.hp = tower.maxHp * 0.4;
    const goldStart = player.gold;
    send(room, client, "structure:repair", { towerId: single.id });
    const singleCost = goldStart - player.gold;
    const goldBefore = player.gold;
    send(room, client, "structure:repairAll");
    const body = room.getOperatorBody("p1");
    assert.equal(body.tasks.length, 2);
    const task = body.tasks[1];
    assert.deepEqual(task.segments.map((segment) => segment.towerId).sort(), [doomed.id, kept.id].sort(), "tekli onarim ikinci kez alinmamali");
    const doomedCost = task.segments.find((segment) => segment.towerId === doomed.id).cost;
    const keptCost = task.segments.find((segment) => segment.towerId === kept.id).cost;
    assert.equal(goldBefore - player.gold, doomedCost + keptCost);
    doomed.hp = 0;
    fly(room, clock, 6000);
    assert.equal(body.tasks.length, 0);
    assert.equal(kept.hp, kept.maxHp);
    assert.equal(single.hp, single.maxHp);
    assert.equal(doomed.hp, 0);
    assert.equal(goldStart - player.gold, singleCost + keptCost, "yikilan duragin payi iade edilmedi");
    assert.deepEqual(messages(client, "structure:repairedAll").at(-1), { count: 1, cost: keptCost, towerIds: [kept.id] });
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("bedenli: geri cekilmede yapilanlarin ozeti, kalanin payi iade", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    // Kurulumda: altinla onarim yalniz orada; bedenin hasari evreye bakmiyor.
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    for (const spot of spots(room, "warrior-1", 3)) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const towers = ownTowers(room);
    for (const tower of towers) tower.hp = tower.maxHp * 0.5;
    const goldBefore = player.gold;
    send(room, client, "structure:repairAll");
    const body = room.getOperatorBody("p1");
    const task = body.tasks[0];
    fly(room, clock, 6000, () => task.repairStats.count >= 1);
    assert.equal(task.repairStats.count, 1);
    const firstCost = task.repairStats.cost;
    body.hp = body.maxHp * OPERATOR_BODY_LOW_HP_RATIO + 2;
    const enemy = spawnEnemy(room, { attack: 40 });
    Object.assign(enemy, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    clock.advance(10);
    room.updateOperatorBodies(0.001, 0.2);
    assert.equal(body.tasks.length, 0);
    assert.equal(goldBefore - player.gold, firstCost, "kalan pay iade edilmedi");
    assert.equal(towers.filter((tower) => tower.hp === tower.maxHp).length, 1);
    assert.deepEqual(messages(client, "structure:repairedAll").at(-1)?.count, 1);
    assert.equal(messages(client, "body:task-failed").at(-1)?.key, "body.retreated");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

// ------------------------------------------------------ yalniz kurulumda

test("dalgada altinla onarim yok: tekli ve toplu komut sessizce reddediliyor", () => {
  const { room, player, towers } = roomWithTowers("onur");
  room.setupPhase = false;
  player.gold = 1_000_000;
  for (const tower of towers) tower.hp = tower.maxHp * 0.5;
  const goldBefore = player.gold;
  const client = fakeClient("p1");
  room.commandRepairAll(client);
  room.commandRepair(client, { towerId: towers[0].id });
  assert.equal(room.repairStructure(client, { towerId: towers[1].id }), 0);
  assert.equal(player.gold, goldBefore, "dalgada altin alindi");
  assert.ok(towers.every((tower) => tower.hp === tower.maxHp * 0.5), "dalgada onarildi");
  assert.equal(client.sent.length, 0);
  // Dalga sonu duraklamasi da kurulum degil.
  room.waveClearedAt = Date.now();
  room.commandRepairAll(client);
  assert.equal(player.gold, goldBefore);
  // Kurulum acilinca ayni komut isliyor.
  room.waveClearedAt = 0;
  room.setupPhase = true;
  room.commandRepairAll(client);
  assert.ok(towers.every((tower) => tower.hp === tower.maxHp), "kurulumda onarilmadi");
});

test("bedenli: dalgada onarim kuyruga girmiyor, altin ayrilmiyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    for (const spot of spots(room, "warrior-1", 2)) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const towers = ownTowers(room);
    for (const tower of towers) tower.hp = tower.maxHp * 0.5;
    room.setupPhase = false;
    const goldBefore = player.gold;
    send(room, client, "structure:repairAll");
    send(room, client, "structure:repair", { towerId: towers[0].id });
    assert.equal(room.getOperatorBody("p1").tasks.length, 0);
    assert.equal(player.gold, goldBefore);
  } finally {
    cleanup(room);
  }
});

test("bedenli: dalga baslayinca sirada bekleyen onarim dusuyor; yapilanin ozeti, kalan iade, oteki is suruyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    const places = spots(room, "warrior-1", 4);
    for (const spot of places.slice(0, 3)) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const towers = ownTowers(room);
    for (const tower of towers) tower.hp = tower.maxHp * 0.5;
    const goldBefore = player.gold;
    send(room, client, "structure:repairAll");
    const body = room.getOperatorBody("p1");
    const task = body.tasks[0];
    fly(room, clock, 6000, () => task.repairStats.count >= 1);
    assert.equal(task.repairStats.count, 1);
    const firstCost = task.repairStats.cost;
    // Sirada bir kurulum da var: dalgada da suruyor.
    const beforePlace = player.gold;
    send(room, client, "placeTower", { ...places[3], definitionId: "warrior-1" });
    const placeReserved = beforePlace - player.gold;
    assert.ok(placeReserved > 0);
    assert.deepEqual(body.tasks.map((entry) => entry.kind), ["repairAll", "place"]);

    send(room, client, "wave:continue");
    assert.equal(room.setupPhase, false, "dalga baslamadi");
    assert.deepEqual(body.tasks.map((entry) => entry.kind), ["place"], "onarim dusmedi ya da kurulum dustu");
    assert.equal(goldBefore - player.gold, firstCost + placeReserved, "kalan onarim payi iade edilmedi");
    assert.equal(towers.filter((tower) => tower.hp === tower.maxHp).length, 1);
    assert.equal(messages(client, "structure:repairedAll").at(-1)?.count, 1, "yapilan onarimin ozeti");
    assert.equal(messages(client, "body:task-failed").at(-1)?.key, "body.repairSetupOnly");

    fly(room, clock, 3000);
    assert.equal(ownTowers(room).length, 4, "kurulum dalgada surmedi");
    assert.equal(towers.filter((tower) => tower.hp === tower.maxHp).length, 1, "dalgada onarim yapildi");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("bedenli: tekli onarim yola cikmadan dalga baslarsa butun bedel geri", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    const [spot] = spots(room, "warrior-1", 1);
    room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const [tower] = ownTowers(room);
    tower.hp = tower.maxHp * 0.3;
    const goldBefore = player.gold;
    send(room, client, "structure:repair", { towerId: tower.id });
    assert.ok(player.gold < goldBefore, "bedel ayrilmadi");
    send(room, client, "wave:continue");
    assert.equal(room.getOperatorBody("p1").tasks.length, 0);
    assert.equal(player.gold, goldBefore);
    assert.equal(tower.hp, tower.maxHp * 0.3);
    assert.equal(messages(client, "structure:repairedAll").length, 0, "yapilmamis onarimin ozeti olmaz");
    assert.equal(messages(client, "body:task-failed").at(-1)?.key, "body.repairSetupOnly");
  } finally {
    cleanup(room);
  }
});

// ---------------------------------------------------------- kapilar ve istemci

test("mesaj kurali, ogretici, istemci ve metinler", async () => {
  assert.deepEqual(MESSAGE_RULES["structure:repairAll"], { phase: "match", fields: {} });
  assert.equal(TUTORIAL_TRACKED_MESSAGES["structure:repairAll"], "repair");
  const scene = await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../apps/web/src/game-control-ui.ts", import.meta.url), "utf8");
  const locales = await readFile(new URL("../apps/web/src/locales/areas/controls.ts", import.meta.url), "utf8");
  assert.ok(scene.includes('this.room?.send("structure:repairAll", {})'), "istemci sayi yollamamali");
  assert.ok(scene.includes('room.onMessage("structure:repairedAll"'));
  assert.ok(scene.includes("planRepairAll(") && scene.includes("getRepairAllButtonState("));
  assert.ok(ui.includes('dispatch({ action: "repairAll" })'));
  for (const key of ["action", "actionOne", "partial", "none", "noGold", "setupOnly"]) {
    const occurrences = locales.split(`"controls.repairAll.${key}":`).length - 1;
    assert.equal(occurrences, 2, `${key} tr+en`);
  }
  // Dalgada iki dugme de kapali ve nedenini yaziyor.
  const sceneLocales = await readFile(new URL("../apps/web/src/locales/areas/scene.ts", import.meta.url), "utf8");
  assert.equal(sceneLocales.split('"scene.repair.setupOnly":').length - 1, 2, "scene.repair.setupOnly tr+en");
  assert.ok(scene.includes('if (this.latestPerfSnapshot?.setupPhase === false) return { label: t("scene.repair.setupOnly"), enabled: false };'), "tekli onarim dugmesi evreyi bilmiyor");
  assert.ok(scene.includes("{ setupPhase: this.latestPerfSnapshot?.setupPhase }"), "Tumunu Onar evreyi bilmiyor");
  assert.ok(locales.includes('"controls.repairAll.partial": "Tümünü Onar · {affordable}/{count} yapı · {cost}g"'));
  assert.ok(locales.includes('"controls.repairAll.none": "Tümünü Onar · Onarılacak yapı yok"'));
  assert.ok(locales.includes("Yetersiz altın"));
  assert.ok(locales.includes('"controls.repairAll.action": "Repair all · {count} structures · {cost}g"'));
});
