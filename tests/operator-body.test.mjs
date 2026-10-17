/**
 * Operator bedeni (ZentaX, AttackLord), sunucu tarafi.
 *
 * Sozler: beden komutla hizla ucuyor ve is varinca oluyor (kurulum, duvar,
 * onarim, Execute, ultiler); komutlar sirayla kuyrukta bekliyor; bedel komut
 * aninda ayriliyor ve varista is gecersizse iade ediliyor (cift harcama ve
 * bedava is yok); dusman bedene temasla vuruyor; beden duserse mac kaybediliyor
 * (co-op'ta herhangi biri); ogreticide 1 canin altina inmiyor; telde her karede
 * tam kayit. Bedeni olmayan operator eskisi gibi aninda.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import {
  ADVANCED_WORKER_HEALTH_MULTIPLIER,
  ATAKAN_EXECUTE_SLOT,
  OPERATOR_BODY_MAX_HP,
  OPERATOR_BODY_QUEUE_MAX,
  OPERATOR_BODY_REGEN_DELAY_MS,
  OPERATOR_BODY_SPEED,
  WALL_TOWER_ID,
  WORKER_MAX_HP,
  characters,
  estimateOperatorBodyTravelSeconds,
  findOperatorBodyRestSpot,
  getMapGridSize,
  getMapOrigin,
  getMapWorldBounds,
  getTowerBuildCost,
  getWallSegmentCenter,
  hasOperatorBody,
  stepOperatorBody,
  wallTower
} from "../packages/shared/dist/index.js";
import { findBuildableSpot } from "./helpers/match-room-harness.mjs";

MatchRoom.maxConcurrentRooms = 1000;
let roomCounter = 0;

function fakeClient(sessionId) {
  const client = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { client.sent.push({ type, payload }); } };
  return client;
}

/** Gercek oda: `onCreate`, katilim ve lobi baslangici; kurulum evresinde. */
async function startedRoom(characterIds = ["warrior"], options = {}) {
  const room = new MatchRoom();
  room.roomId = `beden-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  const broadcasts = [];
  room.broadcast = (type, payload) => broadcasts.push({ type, payload });
  await room.onCreate({ roomName: "Beden", mapScale: 1, ...options });
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
  return { room, clients, broadcasts };
}

function cleanup(room) {
  MatchRoom.rooms.delete(room.roomId);
  MatchRoom.publicRooms.delete(room.roomId);
}

function send(room, client, type, payload = {}) {
  room.messageBuckets?.clear();
  room.onMessageHandlers[type].callback(client, payload);
}

/** Sahte saat: beden is pozunu duvar saatiyle bekliyor. */
function withClock() {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  return { advance(ms) { now += ms; }, now: () => now, restore() { Date.now = realNow; } };
}

/** Bedenlerin tick'i (gercek yol): `ms` kadar, 50 ms adimla. Dusman izgarasi her adimda tazeleniyor. */
function fly(room, clock, ms, onStep) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    clock.advance(50);
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateOperatorBodies(0.05, 0.04);
    onStep?.(elapsed + 50);
  }
}

const bodyOf = (room, sessionId = "p1") => room.getOperatorBody(sessionId);
const ownTowers = (room, sessionId = "p1") => [...room.towers.values()].filter((tower) => tower.ownerId === sessionId);
const messages = (client, type) => client.sent.filter((entry) => entry.type === type).map((entry) => entry.payload);

/** Yol uzerinde bir dusman; verilen yere konuyor. */
function spawnEnemy(room, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    type: "grunt", movementKind: "ground", hp: 400, maxHp: 400, shield: 0, maxShield: 0, armor: 0, reward: 20, attack: 12,
    champion: undefined, special: undefined, damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides
  });
  return enemy;
}

/** Bosta duran bedenden uzak, kurulabilir kareler (yolun ortasina yakin). */
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

// --------------------------------------------------------------- sabitler

test("beden: yalnizca ZentaX ve AttackLord; can gelismis iscinin iki kati", () => {
  assert.equal(hasOperatorBody("zeynep"), true);
  assert.equal(hasOperatorBody("warrior"), true);
  for (const character of characters) {
    if (character.id !== "zeynep" && character.id !== "warrior") assert.equal(hasOperatorBody(character.id), false, character.id);
  }
  assert.equal(OPERATOR_BODY_MAX_HP, WORKER_MAX_HP * ADVANCED_WORKER_HEALTH_MULTIPLIER * 2);
  assert.equal(OPERATOR_BODY_MAX_HP, 360);
});

test("hiz: tipik yolculuk 0,5 sn'nin, butun harita 1 sn'nin cok altinda", () => {
  const gridSize = 34;
  // Tipik is: 5 kare.
  assert.ok(estimateOperatorBodyTravelSeconds(5 * gridSize) < 0.3, `5 kare ${estimateOperatorBodyTravelSeconds(5 * gridSize)}`);
  // Arenanin kosegeni (en buyuk tek oyunculuk arena 12x18).
  const diagonal = Math.hypot(12 * gridSize, 18 * gridSize);
  assert.ok(estimateOperatorBodyTravelSeconds(diagonal) < 0.9, `kosegen ${estimateOperatorBodyTravelSeconds(diagonal)}`);
  assert.ok(OPERATOR_BODY_SPEED >= 900);
  // Adim varisa yavaslayarak tam hedefe oturuyor.
  let point = { x: 0, y: 0 };
  let arrived = false;
  for (let tick = 0; tick < 60 && !arrived; tick += 1) {
    const step = stepOperatorBody(point, { x: 300, y: 0 }, 1 / 60);
    point = step;
    arrived = step.arrived;
  }
  assert.equal(arrived, true);
  assert.deepEqual([point.x, point.y], [300, 0]);
});

test("park yeri: dusman seridinde degil, dusmandan uzak; yapi kareleri tercih", () => {
  const gridSize = 34;
  const lane = new Set();
  for (let row = 0; row < 10; row += 1) lane.add(`5:${row}`);
  const input = {
    near: { x: 5.5 * gridSize, y: 5.5 * gridSize },
    cols: 11,
    rows: 10,
    cellCenter: (col, row) => ({ x: (col + 0.5) * gridSize, y: (row + 0.5) * gridSize }),
    toCell: (x, y) => ({ col: Math.floor(x / gridSize), row: Math.floor(y / gridSize) }),
    gridSize,
    laneCells: lane,
    structureCells: new Set(["7:5"]),
    enemies: [{ x: 3.5 * gridSize, y: 5.5 * gridSize }]
  };
  const spot = findOperatorBodyRestSpot(input);
  assert.notEqual(spot.col, 5, "serit uzerine park etti");
  assert.deepEqual([spot.col, spot.row], [7, 5], "dusmandan uzak yapi karesi secilmedi");
});

// ---------------------------------------------------------------- kurulum

test("kurulum: bedel komutta ayriliyor, kule beden varinca; uc komut sirayla", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    const body = bodyOf(room);
    assert.ok(body, "beden kurulmadi");
    const targets = spots(room, "warrior-1", 3);
    const cost = getTowerBuildCost(characters.find((c) => c.id === "warrior").towers.find((t) => t.id === "warrior-1").cost);
    for (const spot of targets) send(room, client, "placeTower", { ...spot, definitionId: "warrior-1" });
    assert.equal(player.gold, 100_000 - 3 * cost, "bedel komut aninda ayrilmadi");
    assert.equal(ownTowers(room).length, 0, "kule beden varmadan kuruldu");
    assert.equal(body.tasks.length, 3);
    // Telde bekleyen hedefler (hayalet kuleler icin).
    const wire = room.getSnapshot().bodies.find((entry) => entry.id === "p1");
    assert.equal(wire.q.length, 6);

    const order = [];
    let firstAt;
    fly(room, clock, 3000, (elapsed) => {
      for (const tower of ownTowers(room)) {
        if (!order.includes(tower)) {
          order.push(tower);
          firstAt ??= elapsed;
          // Varista beden kulenin yaninda.
          assert.ok(Math.hypot(body.x - tower.x, body.y - tower.y) <= getMapGridSize(room.activeMap) * 1.1, "beden kulenin yaninda degil");
        }
      }
    });
    assert.equal(order.length, 3);
    assert.deepEqual(order.map((tower) => [tower.x, tower.y]), targets.map((spot) => [spot.x, spot.y]), "sira bozuldu");
    assert.ok(firstAt <= 500, `ilk kule ${firstAt} ms`);
    assert.equal(player.gold, 100_000 - 3 * cost, "bedel iki kez alindi");
    assert.equal(body.tasks.length, 0);
    assert.equal(body.state, "i");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("kurulum: yoldayken altin harcanamiyor; varista kare doluysa iade ve red", async () => {
  const { room, clients: [client] } = await startedRoom(["zeynep"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    const definition = characters.find((c) => c.id === "zeynep").towers.find((t) => t.id === "zeynep-1");
    const cost = getTowerBuildCost(definition.cost);
    const [first, second] = spots(room, "zeynep-1", 2);
    player.gold = cost + Math.floor(cost / 2);
    send(room, client, "placeTower", { ...first, definitionId: "zeynep-1" });
    send(room, client, "placeTower", { ...second, definitionId: "zeynep-1" });
    assert.equal(bodyOf(room).tasks.length, 1, "ayrilmis altinla ikinci kule kuyruga girdi");
    // Ayni kareye ikinci istek de kuyruga girmiyor.
    player.gold = 10 * cost;
    send(room, client, "placeTower", { ...first, definitionId: "zeynep-1" });
    assert.equal(bodyOf(room).tasks.length, 1);
    player.gold = cost + Math.floor(cost / 2) - cost;
    const reserved = player.gold;

    // Yoldayken kare doluyor (baska yoldan kurulan duvar degil kule).
    room.placeTower({ sessionId: "p1", send() {} }, { ...first, definitionId: "zeynep-1" }, { free: true });
    const blocker = ownTowers(room)[0];
    fly(room, clock, 1500);
    assert.equal(ownTowers(room).length, 1, "dolu kareye ikinci kule kuruldu");
    assert.equal(ownTowers(room)[0], blocker);
    assert.equal(player.gold, reserved + cost, "iade yapilmadi");
    const [rejection] = messages(client, "placement:rejected");
    assert.equal(rejection?.key, "body.placeFailed");
    assert.deepEqual([rejection.x, rejection.y], [first.x, first.y]);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("kuyruk sinirli; dolunca not ve red", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  try {
    room.state.players.get("p1").gold = 1_000_000;
    const targets = spots(room, "warrior-1", OPERATOR_BODY_QUEUE_MAX + 1);
    room.getPlayerTowerLimit = () => 99;
    for (const spot of targets) send(room, client, "placeTower", { ...spot, definitionId: "warrior-1" });
    assert.equal(bodyOf(room).tasks.length, OPERATOR_BODY_QUEUE_MAX);
    assert.equal(messages(client, "body:task-failed").at(-1)?.key, "body.queueFull");
  } finally {
    cleanup(room);
  }
});

test("bedeni olmayan operator eskisi gibi aninda kuruyor", async () => {
  const playable = MatchRoom.playableCharacterIds;
  MatchRoom.playableCharacterIds = characters.map((character) => character.id);
  const { room, clients: [client] } = await startedRoom(["onur"]);
  try {
    room.state.players.get("p1").gold = 100_000;
    const spot = findBuildableSpot(room, "onur-1");
    send(room, client, "placeTower", { ...spot, definitionId: "onur-1" });
    assert.equal(ownTowers(room).length, 1);
    assert.equal(bodyOf(room), undefined);
    assert.equal(room.getSnapshot().bodies, undefined, "bedensiz odada telde bodies var");
  } finally {
    MatchRoom.playableCharacterIds = playable;
    cleanup(room);
  }
});

// ------------------------------------------------------------------ duvar

test("duvar cizgisi: beden hat boyunca gecip parcalari sirayla oruyor", async () => {
  const { room, clients: [client] } = await startedRoom(["zeynep"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    const geometry = { gridSize: getMapGridSize(room.activeMap), origin: getMapOrigin(room.activeMap) };
    const a = getWallSegmentCenter({ orientation: "horizontal", col: 2, row: 9 }, geometry);
    const b = getWallSegmentCenter({ orientation: "horizontal", col: 6, row: 9 }, geometry);
    send(room, client, "wall:line", { definitionId: WALL_TOWER_ID, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    const unit = getTowerBuildCost(wallTower.cost);
    assert.equal(player.gold, 100_000 - 5 * unit);
    assert.equal(ownTowers(room).length, 0);
    const counts = [];
    fly(room, clock, 3000, () => counts.push(ownTowers(room).length));
    assert.equal(ownTowers(room).length, 5);
    // Parcalar birer birer: ayni tick'te hepsi birden kurulmadi.
    assert.ok(new Set(counts.filter((count) => count > 0 && count < 5)).size >= 2, `parca sirasi ${counts.join(",")}`);
    const [result] = messages(client, "wall:line-result");
    assert.deepEqual(result, { requested: 5, placed: 5, skipped: 0, skippedZone: 0, skippedBlocked: 0, skippedGold: 0 });
    assert.equal(player.gold, 100_000 - 5 * unit, "duvar bedeli iki kez alindi");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

// ----------------------------------------------------------------- onarim

test("onarim: bedel komutta ayriliyor, can beden varinca aninda doluyor; yikilan yapi iade", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    const [spot, other] = spots(room, "warrior-1", 2);
    room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    room.placeTower(client, { ...other, definitionId: "warrior-1" });
    const [tower, second] = ownTowers(room);
    tower.hp = tower.maxHp * 0.4;
    second.hp = second.maxHp * 0.5;
    const goldBefore = player.gold;
    send(room, client, "structure:repair", { towerId: tower.id });
    const cost = goldBefore - player.gold;
    assert.ok(cost > 0, "bedel ayrilmadi");
    assert.equal(tower.hp, tower.maxHp * 0.4, "beden varmadan onarildi");
    // Ayni yapiya ikinci istek kuyruga girmiyor.
    send(room, client, "structure:repair", { towerId: tower.id });
    assert.equal(bodyOf(room).tasks.length, 1);
    fly(room, clock, 1500);
    assert.equal(tower.hp, tower.maxHp);
    assert.equal(player.gold, goldBefore - cost, "onarim bedeli iki kez alindi");
    assert.deepEqual(messages(client, "structure:repaired").at(-1), { towerId: tower.id, cost });

    // Yoldayken yikilan yapi: altin geri, not.
    const goldMid = player.gold;
    send(room, client, "structure:repair", { towerId: second.id });
    assert.ok(player.gold < goldMid);
    second.hp = 0;
    fly(room, clock, 1500);
    assert.equal(player.gold, goldMid, "yikilan yapinin onarim altini iade edilmedi");
    assert.equal(messages(client, "body:task-failed").at(-1)?.key, "body.repairFailed");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

// ---------------------------------------------------------------- beceri

test("Execute: AttackLord dusmana ucup varinca infaz ediyor; bekleme komutta basliyor", async () => {
  const { room, clients: [client], broadcasts } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    const enemy = spawnEnemy(room);
    const bounds = getMapWorldBounds(room.activeMap);
    Object.assign(enemy, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height * 0.25 });
    send(room, client, "useSkill", { slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy.id });
    const cooldown = characters.find((c) => c.id === "warrior").skills[ATAKAN_EXECUTE_SLOT].cooldownMs;
    assert.equal(player.skill3CooldownMs, cooldown, "bekleme komutta baslamadi");
    assert.ok(room.enemies.has(enemy.id), "beden varmadan infaz edildi");
    let killedAt;
    fly(room, clock, 2000, (elapsed) => {
      if (killedAt === undefined && !room.enemies.has(enemy.id)) {
        killedAt = elapsed;
        assert.ok(Math.hypot(bodyOf(room).x - enemy.x, bodyOf(room).y - enemy.y) <= getMapGridSize(room.activeMap), "infaz uzaktan oldu");
      }
    });
    assert.ok(killedAt !== undefined, "infaz olmadi");
    assert.ok(broadcasts.some((entry) => entry.type === "skill:execute" && entry.payload.enemyId === enemy.id));
    // Bekleme varista yeniden kurulmadi: komut anindan akan sure korunuyor.
    assert.equal(player.skill3CooldownMs, cooldown);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("Execute: hedef yolda olurse bekleme geri, red; bagisik hedef komutta reddediliyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    const brute = spawnEnemy(room, { type: "brute" });
    send(room, client, "useSkill", { slot: ATAKAN_EXECUTE_SLOT, enemyId: brute.id });
    assert.equal(player.skill3CooldownMs, 0);
    assert.equal(bodyOf(room).tasks.length, 0);
    assert.equal(messages(client, "skill:rejected").at(-1)?.reason, "immune");

    const enemy = spawnEnemy(room);
    send(room, client, "useSkill", { slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy.id });
    assert.ok(player.skill3CooldownMs > 0);
    room.damageEnemy(enemy, 10_000, 0, "test", "", "true");
    fly(room, clock, 300);
    assert.equal(player.skill3CooldownMs, 0, "olen hedefte bekleme harcandi");
    assert.equal(messages(client, "skill:rejected").at(-1)?.reason, "invalid");
    assert.equal(bodyOf(room).tasks.length, 0);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

// ------------------------------------------------------------------ ulti

test("AttackLord ultisi: drone'lar bedeninden cikiyor; sarj komutta harcaniyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    for (const spot of spots(room, "warrior-1", 2)) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    spawnEnemy(room);
    player.ultimateCharge = 100;
    send(room, client, "useUltimate", { mode: "attack" });
    assert.equal(player.ultimateCharge, 0, "sarj ayrilmadi");
    const body = bodyOf(room);
    const at = { x: body.x, y: body.y };
    fly(room, clock, 50);
    const attackDrones = () => [...room.drones.values()].filter((drone) => drone.mode === "attack");
    // Drone'lar birer birer cikiyor: ilki atis aninda, ikincisi sirasi gelince.
    assert.equal(attackDrones().length, 1, "ilk drone atis aninda cikmali");
    room.updateDrones(60, 0.06);
    const drones = attackDrones();
    assert.equal(drones.length, 2, "her kuleden bir drone");
    for (const drone of drones) {
      assert.ok(Math.hypot(drone.x - at.x, drone.y - at.y) <= 40, "drone bedenden cikmadi");
    }
    // Yeniden atis bedeni ayni ultiyle tekrar kuyruga sokmuyor (sarj yok).
    send(room, client, "useUltimate", { mode: "attack" });
    assert.equal(body.tasks.length, 0);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("AttackLord ultisi: drone bedenin cikis anindaki yerinden; beden yoksa kendi kulesinden", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    for (const spot of spots(room, "warrior-1", 3)) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const towers = ownTowers(room).filter((tower) => tower.characterId === "warrior");
    assert.equal(towers.length, 3);
    spawnEnemy(room, { hp: 1_000_000, maxHp: 1_000_000 });
    const body = bodyOf(room);
    player.ultimateCharge = 100;
    room.useUltimate(client, { mode: "attack" });
    const launched = () => [...room.drones.values()].filter((drone) => drone.mode === "attack");
    assert.equal(launched().length, 1);

    // Beden sirada yer degistirdi: ikinci drone yeni yerinden cikiyor.
    body.x += 30;
    body.y += 10;
    room.updateDrones(60, 0.06);
    const second = launched().at(-1);
    assert.equal(launched().length, 2);
    assert.deepEqual({ x: second.x, y: second.y }, { x: body.x, y: body.y });

    // Beden yok sayilinca (dusmus) ucuncu drone kendi kulesinden.
    body.dead = true;
    room.updateDrones(60, 0.06);
    const third = launched().at(-1);
    assert.equal(launched().length, 3);
    assert.deepEqual({ x: third.x, y: third.y }, { x: towers[2].x, y: towers[2].y });
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("AttackLord ultisi: beden duserse (yenilgi) sirasi gelmemis drone cikmiyor, karne havadakiyle kapaniyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    for (const spot of spots(room, "warrior-1", 3)) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const body = bodyOf(room);
    const enemy = spawnEnemy(room, { hp: 1_000_000, maxHp: 1_000_000, attack: 50 });
    player.ultimateCharge = 100;
    room.useUltimate(client, { mode: "attack" });
    assert.equal(room.pendingAtakanDrones.length, 2);

    // Dusman bedenin ustunde: beden duser, mac biter.
    body.hp = 5;
    Object.assign(enemy, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    clock.advance(10);
    room.updateOperatorBodies(0.001, 0.5);
    assert.equal(room.matchResult, "defeat");
    assert.equal(room.pendingAtakanDrones.length, 0, "mac bittikten sonra yeni drone cikmamali");

    // Havadaki tek drone hedefine iniyor; karne onunla gidiyor.
    for (let tick = 0; tick < 400 && [...room.drones.values()].some((drone) => drone.mode === "attack"); tick += 1) {
      room.updateDrones(50, 0.05);
      room.settleUltimateReports();
    }
    room.settleUltimateReports();
    assert.deepEqual(messages(client, "ultimate:result"), [{ kind: "drones", hits: 1, kills: 0 }]);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("ZentaX ultisi: beden secilen sutunun ustune ucuyor, isin orada ve varinca", async () => {
  const { room, clients: [client] } = await startedRoom(["zeynep"]);
  const clock = withClock();
  try {
    const player = room.state.players.get("p1");
    const gridSize = getMapGridSize(room.activeMap);
    const origin = getMapOrigin(room.activeMap);
    const column = 1;
    const columnX = origin.x + (column + 0.5) * gridSize;
    player.ultimateCharge = 100;
    const beams = () => [...room.beams.values()].filter((beam) => beam.definitionId === "zeynep-ultimate-column");
    send(room, client, "useUltimate", { column, y: origin.y + 6 * gridSize });
    assert.equal(player.ultimateCharge, 0);
    assert.equal(beams().length, 0, "beden varmadan isin dustu");
    let firedAt;
    fly(room, clock, 1500, (elapsed) => {
      if (firedAt === undefined && beams().length > 0) {
        firedAt = elapsed;
        assert.ok(Math.abs(bodyOf(room).x - columnX) < 2, "beden sutunun ustunde degil");
      }
    });
    assert.ok(firedAt !== undefined && firedAt <= 800, `ulti ${firedAt} ms`);
    assert.equal(beams()[0].x1, columnX);
    // Gecersiz sutun komutta reddediliyor, sarj harcanmiyor.
    player.ultimateCharge = 100;
    send(room, client, "useUltimate", { column: 999 });
    assert.equal(player.ultimateCharge, 100);
    assert.equal(bodyOf(room).tasks.length, 0);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("ZentaX komutlari bedeni yurutmuyor: aninda", async () => {
  const { room, clients: [client] } = await startedRoom(["zeynep"]);
  try {
    const player = room.state.players.get("p1");
    player.reputation = 1000;
    send(room, client, "useSkill", { slot: 0, commandTier: "small" });
    assert.ok(room.zeynepHasteUntil > Date.now(), "komut aninda islemedi");
    assert.equal(bodyOf(room).tasks.length, 0);
    assert.equal(room.getSnapshot().zeynepCommands?.haste?.tier, "small");
  } finally {
    cleanup(room);
  }
});

// ------------------------------------------------------------ hasar ve olum

test("dusman bedene temasla vuruyor; hasarsiz bir sure sonra onariliyor, dalga sonunda tam can", async () => {
  const { room } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    const body = bodyOf(room);
    const enemy = spawnEnemy(room, { attack: 12 });
    Object.assign(enemy, { x: body.x, y: body.y });
    // Park yeri tehditten kaciyor; temas aninda olcmek icin bir adim.
    room.enemySpatialGrid.rebuild(room.enemies.values());
    const before = body.hp;
    clock.advance(50);
    room.updateOperatorBodies(0.05, 0.5);
    assert.ok(Math.abs(before - body.hp - 6) < 1e-6, `hasar ${before - body.hp}`);
    // Tehdit gorulunce beden park yerini degistiriyor (seritte beklemiyor).
    fly(room, clock, 1500);
    assert.ok(Math.hypot(body.x - enemy.x, body.y - enemy.y) > getMapGridSize(room.activeMap) * 1.2, "beden dusmanin yaninda bekliyor");
    room.enemies.clear();
    const hurt = body.hp;
    clock.advance(OPERATOR_BODY_REGEN_DELAY_MS);
    fly(room, clock, 1000);
    assert.ok(body.hp > hurt, "onarim yok");
    body.hp = 10;
    room.healOperatorBodies();
    assert.equal(body.hp, OPERATOR_BODY_MAX_HP);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("beden duserse mac kaybediliyor (tek oyunculu); yoldaki bedel iade", async () => {
  const { room, broadcasts } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    const player = room.state.players.get("p1");
    const body = bodyOf(room);
    body.hp = 5;
    // Yolda bekleyen bir gorevin bedeli.
    player.gold = 100_000;
    const [spot] = spots(room, "warrior-1", 1);
    send(room, { sessionId: "p1", send() {} }, "placeTower", { ...spot, definitionId: "warrior-1" });
    assert.ok(player.gold < 100_000);
    const enemy = spawnEnemy(room, { attack: 50 });
    Object.assign(enemy, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    clock.advance(10);
    room.updateOperatorBodies(0.001, 0.5);
    assert.equal(room.matchResult, "defeat");
    assert.equal(body.dead, true);
    assert.equal(player.gold, 100_000, "yoldaki bedel iade edilmedi");
    const defeat = broadcasts.find((entry) => entry.type === "match:defeat");
    assert.equal(defeat?.payload.bodyOwnerId, "p1");
    assert.equal(room.getSnapshot().bodies[0].s, "d");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("co-op: herhangi bir oyuncunun bedeni duserse takim kaybediyor", async () => {
  const { room, broadcasts } = await startedRoom(["warrior", "zeynep"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    clock.advance(10);
    room.updateOperatorBodies(0.01, 0.01);
    assert.equal(room.operatorBodies.size, 2, "her oyuncunun bedeni var");
    const body = bodyOf(room, "p2");
    body.hp = 1;
    const enemy = spawnEnemy(room, { attack: 50 });
    Object.assign(enemy, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    clock.advance(10);
    room.updateOperatorBodies(0.001, 0.5);
    assert.equal(room.matchResult, "defeat");
    assert.equal(broadcasts.find((entry) => entry.type === "match:defeat")?.payload.bodyOwnerId, "p2");
    // Herkes iki bedeni de goruyor.
    assert.deepEqual(room.getSnapshot().bodies.map((entry) => entry.id).sort(), ["p1", "p2"]);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("kopan oyuncunun bedeni hasar almiyor", async () => {
  const { room } = await startedRoom(["warrior", "zeynep"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    clock.advance(10);
    room.updateOperatorBodies(0.01, 0.01);
    const body = bodyOf(room, "p2");
    room.state.players.get("p2").connected = false;
    const enemy = spawnEnemy(room, { attack: 500 });
    Object.assign(enemy, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    clock.advance(10);
    room.updateOperatorBodies(0.001, 1);
    assert.equal(body.hp, OPERATOR_BODY_MAX_HP);
    assert.equal(room.matchResult, undefined);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("ogretici: beden 1 canin altina inmiyor, mac bitmiyor; yaratici: hasar yok", async () => {
  const { room } = await startedRoom(["zeynep"], { autoStart: true, tutorial: true });
  const clock = withClock();
  try {
    assert.equal(room.tutorialMode, true);
    room.setupPhase = false;
    clock.advance(10);
    room.updateOperatorBodies(0.01, 0.01);
    const body = bodyOf(room);
    const enemy = spawnEnemy(room, { attack: 5000 });
    Object.assign(enemy, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    clock.advance(10);
    room.updateOperatorBodies(0.001, 1);
    assert.equal(body.hp, 1);
    assert.equal(body.dead, false);
    assert.equal(room.matchResult, undefined);
    assert.equal(room.getSnapshot().bodies[0].inv, 1);
  } finally {
    clock.restore();
    cleanup(room);
  }

  const creative = await startedRoom(["warrior"], { autoStart: true, creative: true });
  const clock2 = withClock();
  try {
    assert.equal(creative.room.creativeMode, true);
    clock2.advance(10);
    creative.room.updateOperatorBodies(0.01, 0.01);
    const body = bodyOf(creative.room);
    const enemy = spawnEnemy(creative.room, { attack: 5000 });
    Object.assign(enemy, { x: body.x, y: body.y });
    creative.room.enemySpatialGrid.rebuild(creative.room.enemies.values());
    clock2.advance(10);
    creative.room.updateOperatorBodies(0.001, 1);
    assert.equal(body.hp, OPERATOR_BODY_MAX_HP);
  } finally {
    clock2.restore();
    cleanup(creative.room);
  }
});

// ------------------------------------------------------------------- tel

test("tel: bedenler her karede tam ve kucuk; is basinda isin ucu yaziliyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    room.state.players.get("p1").gold = 100_000;
    // Beden ilk tick'te (ya da ilk komutta) kuruluyor.
    clock.advance(10);
    room.updateOperatorBodies(0.01, 0.01);
    const [record] = room.getSnapshot().bodies;
    assert.deepEqual(Object.keys(record).sort(), ["c", "hp", "id", "mhp", "s", "x", "y"]);
    assert.equal(record.c, "warrior");
    assert.equal(record.hp, OPERATOR_BODY_MAX_HP);
    assert.ok(JSON.stringify(record).length < 120, `kayit ${JSON.stringify(record).length} bayt`);
    const [spot] = spots(room, "warrior-1", 1);
    send(room, client, "placeTower", { ...spot, definitionId: "warrior-1" });
    let working;
    fly(room, clock, 1500, () => {
      const wire = room.getSnapshot().bodies[0];
      if (wire.s === "w" && !working) working = wire;
    });
    assert.ok(working, "is pozu telde gorunmedi");
    assert.deepEqual([working.wx, working.wy], [spot.x, spot.y]);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("simulator kisayolu: kuyruk aninda bitiyor, sonuc ayni kural", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  try {
    room.state.players.get("p1").gold = 100_000;
    const targets = spots(room, "warrior-1", 2);
    for (const spot of targets) send(room, client, "placeTower", { ...spot, definitionId: "warrior-1" });
    room.settleOperatorBody("p1");
    assert.equal(ownTowers(room).length, 2);
    assert.equal(bodyOf(room).tasks.length, 0);
  } finally {
    cleanup(room);
  }
});
