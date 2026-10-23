/**
 * Operator bedeni: adil olum. Kural ayni (beden duserse mac kaybedilir); ama
 * rutin bir komut bedeni haksizca oldurmemeli:
 *
 * - Kurulum, duvar parcasi, onarim ve Execute hedefin yanindan, dusmanlarin
 *   temas yaricapinin disindan isinla yapiliyor.
 * - Is basinda dusuk cana inen beden butun gorevleri birakip (bedel iade)
 *   cekiliyor; sahibine not.
 * - Yer altindaki / fazdaki dusman ve bu tick odadan cikan dusman vurmuyor.
 * - Kopan oyuncunun kuyrugu iade ediliyor (beden bosta, hasarsiz).
 * - Beceri beklemesi varista bastan kuruluyor (uzun kuyruktan sonra sifir kalmiyor).
 * - Kurulumda verilen, dalgada varan yapi kurulumun yapisi sayiliyor.
 * - Ayni kareye ikinci kurulum not aliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import {
  ATAKAN_EXECUTE_SLOT,
  OPERATOR_BODY_CONTACT_RADIUS,
  OPERATOR_BODY_LOW_HP_RATIO,
  OPERATOR_BODY_MAX_HP,
  OPERATOR_BODY_SAFE_MARGIN,
  OPERATOR_BODY_WORK_REACH_CELLS,
  WALL_TOWER_ID,
  characters,
  getMapGridSize,
  getMapOrigin,
  getMapWorldBounds,
  getWallSegmentCenter,
  pickOperatorBodyStandPoint
} from "../packages/shared/dist/index.js";

MatchRoom.maxConcurrentRooms = 1000;
let roomCounter = 0;

function fakeClient(sessionId) {
  const client = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { client.sent.push({ type, payload }); } };
  return client;
}

async function startedRoom(characterIds = ["warrior"]) {
  const room = new MatchRoom();
  room.roomId = `beden-adil-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  room.allowReconnection = () => Promise.reject(new Error("yok"));
  await room.onCreate({ roomName: "Beden", mapScale: 1 });
  const clients = characterIds.map((characterId, index) => {
    const client = fakeClient(`p${index + 1}`);
    room.clients.push(client);
    room.onJoin(client, { playerName: client.sessionId, characterId });
    return client;
  });
  for (const client of clients) room.onMessageHandlers["lobby:setReady"].callback(client, { ready: true });
  room.onMessageHandlers["lobby:start"].callback(clients[0]);
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

function spawnEnemy(room, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    type: "grunt", movementKind: "ground", hp: 400, maxHp: 400, shield: 0, maxShield: 0, armor: 0, reward: 20, attack: 12,
    champion: undefined, special: undefined, untargetable: false, damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides
  });
  return enemy;
}

function spots(room, definitionId, count) {
  const found = [];
  const { cols, rows } = room.activeMap;
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  for (let row = 2; row < rows - 3 && found.length < count; row += 2) {
    for (let col = 2; col < cols - 2 && found.length < count; col += 3) {
      const x = origin.x + (col + 0.5) * gridSize;
      const y = origin.y + (row + 0.5) * gridSize;
      if (room.canPlaceTower(x, y, definitionId, "horizontal")) found.push({ x, y });
    }
  }
  assert.equal(found.length, count, "kurulabilir kare bulunamadi");
  return found;
}

test("is mesafesi temas yaricapinin disinda; duruş noktasi dusmandan uzak aday", () => {
  const distance = 34 * OPERATOR_BODY_WORK_REACH_CELLS;
  assert.ok(distance > OPERATOR_BODY_CONTACT_RADIUS + 5, "is mesafesi temas yaricapinin icinde");
  const safeRadius = OPERATOR_BODY_CONTACT_RADIUS + OPERATOR_BODY_SAFE_MARGIN;
  const target = { x: 100, y: 100 };
  // Beden soldan geliyor ama dusman hedefin solunda: baska bir yan seciliyor.
  const stand = pickOperatorBodyStandPoint({ from: { x: 0, y: 100 }, target, distance, threats: [{ x: 100 - distance, y: 100 }], safeRadius });
  assert.equal(stand.threat, 0);
  assert.ok(Math.abs(Math.hypot(stand.x - target.x, stand.y - target.y) - distance) < 1e-6);
  // Tehdit yoksa geldigi yonde.
  const free = pickOperatorBodyStandPoint({ from: { x: 0, y: 100 }, target, distance, threats: [], safeRadius });
  assert.ok(free.x < target.x && Math.abs(free.y - target.y) < 1e-6);
});

test("onarim ve Execute temas disindan, isinla", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    // Onarim kurulumda (altinla onarim yalniz orada), Execute dalgada.
    room.state.players.get("p1").gold = 100_000;
    const gridSize = getMapGridSize(room.activeMap);
    const contact = OPERATOR_BODY_CONTACT_RADIUS * room.getMapWorldScale();
    const [spot] = spots(room, "warrior-1", 1);
    room.placeTower(client, { ...spot, definitionId: "warrior-1" });
    const [tower] = ownTowers(room);
    tower.hp = tower.maxHp * 0.5;
    // Kulenin solunda, ona vuran bir dusman.
    const attacker = spawnEnemy(room);
    Object.assign(attacker, { x: tower.x - gridSize * 0.6, y: tower.y });
    send(room, client, "structure:repair", { towerId: tower.id });
    let repairedGap;
    fly(room, clock, 1500, () => {
      if (repairedGap === undefined && tower.hp === tower.maxHp) repairedGap = Math.hypot(bodyOf(room).x - attacker.x, bodyOf(room).y - attacker.y);
    });
    assert.ok(repairedGap !== undefined, "onarim olmadi");
    assert.ok(repairedGap > contact, `onarim temasta yapildi (${repairedGap})`);

    room.setupPhase = false;
    room.enemies.clear();
    const enemy = spawnEnemy(room);
    const bounds = getMapWorldBounds(room.activeMap);
    Object.assign(enemy, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height * 0.3 });
    send(room, client, "useSkill", { slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy.id });
    let gapAtKill;
    fly(room, clock, 1500, () => {
      if (gapAtKill === undefined && !room.enemies.has(enemy.id)) gapAtKill = Math.hypot(bodyOf(room).x - enemy.x, bodyOf(room).y - enemy.y);
    });
    assert.ok(gapAtKill !== undefined, "infaz olmadi");
    assert.ok(gapAtKill > contact && gapAtKill <= gridSize * 1.05, `infaz mesafesi ${gapAtKill}`);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("dalga icinde duvar cizgisi: beden hattin yanindaki dusmanlara degmeden oruyor", async () => {
  const { room, clients: [client] } = await startedRoom(["zeynep"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    room.state.players.get("p1").gold = 100_000;
    const geometry = { gridSize: getMapGridSize(room.activeMap), origin: getMapOrigin(room.activeMap) };
    const a = getWallSegmentCenter({ orientation: "horizontal", col: 1, row: 9 }, geometry);
    const b = getWallSegmentCenter({ orientation: "horizontal", col: 8, row: 9 }, geometry);
    // Hattin alt yaninda dusman sirasi.
    for (let col = 1; col <= 8; col += 2) {
      const enemy = spawnEnemy(room);
      const edge = getWallSegmentCenter({ orientation: "horizontal", col, row: 9 }, geometry);
      Object.assign(enemy, { x: edge.x, y: edge.y + geometry.gridSize * 0.45 });
    }
    send(room, client, "wall:line", { definitionId: WALL_TOWER_ID, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    const before = bodyOf(room).hp;
    fly(room, clock, 4000);
    assert.equal(ownTowers(room).length, 8, "duvar orulmedi");
    // Hatta varis ucusunda bir iki tick degme olabilir; is basinda temas yok.
    assert.ok(before - bodyOf(room).hp < 15, `beden ${before - bodyOf(room).hp} can kaybetti`);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("kendini koruma: is basinda dusuk cana inen beden gorevleri birakip (iade) cekiliyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    const player = room.state.players.get("p1");
    player.gold = 100_000;
    for (const spot of spots(room, "warrior-1", 3)) send(room, client, "placeTower", { ...spot, definitionId: "warrior-1" });
    assert.ok(player.gold < 100_000);
    const body = bodyOf(room);
    body.hp = body.maxHp * OPERATOR_BODY_LOW_HP_RATIO + 2;
    const enemy = spawnEnemy(room, { attack: 40 });
    Object.assign(enemy, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    clock.advance(10);
    room.updateOperatorBodies(0.001, 0.2);
    assert.equal(body.tasks.length, 0, "gorevler birakilmadi");
    assert.equal(player.gold, 100_000, "iade yapilmadi");
    assert.equal(messages(client, "body:task-failed").at(-1)?.key, "body.retreated");
    assert.ok(body.hp > 0 && !body.dead);
    fly(room, clock, 1500);
    assert.ok(Math.hypot(body.x - enemy.x, body.y - enemy.y) > getMapGridSize(room.activeMap) * 1.2, "beden cekilmedi");
    assert.equal(ownTowers(room).length, 0);
    assert.equal(room.matchResult, undefined);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("yer altindaki / fazdaki ve bu tick cikan dusman bedene vurmuyor", async () => {
  const { room } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    const body = bodyOf(room);
    const hidden = spawnEnemy(room, { attack: 500, untargetable: true });
    Object.assign(hidden, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    clock.advance(10);
    room.updateOperatorBodies(0.001, 1);
    assert.equal(body.hp, OPERATOR_BODY_MAX_HP);
    const gone = spawnEnemy(room, { attack: 500 });
    Object.assign(gone, { x: body.x, y: body.y });
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.enemies.delete(gone.id);
    clock.advance(10);
    room.updateOperatorBodies(0.001, 1);
    assert.equal(body.hp, OPERATOR_BODY_MAX_HP);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("kopan oyuncu: kuyruk iade, beden bosta", async () => {
  const { room, clients: [, other] } = await startedRoom(["warrior", "zeynep"]);
  try {
    const player = room.state.players.get("p2");
    player.gold = 100_000;
    const [spot] = spots(room, "zeynep-1", 1);
    send(room, other, "placeTower", { ...spot, definitionId: "zeynep-1" });
    assert.ok(player.gold < 100_000);
    await room.onLeave(other, false);
    assert.equal(player.connected, false);
    assert.equal(bodyOf(room, "p2").tasks.length, 0);
    assert.equal(player.gold, 100_000, "kopanin bedeli iade edilmedi");
  } finally {
    cleanup(room);
  }
});

test("beceri beklemesi varista bastan kuruluyor; kilit dolsa da ikinci komut kuyruga girmiyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    room.setupPhase = false;
    const player = room.state.players.get("p1");
    const enemy = spawnEnemy(room);
    send(room, client, "useSkill", { slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy.id });
    // Uzun kuyruk: komut aninin kilidi bitti.
    player.skill3CooldownMs = 0;
    send(room, client, "useSkill", { slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy.id });
    assert.equal(bodyOf(room).tasks.length, 1);
    fly(room, clock, 1500);
    assert.ok(!room.enemies.has(enemy.id), "infaz olmadi");
    const cooldown = characters.find((c) => c.id === "warrior").skills[ATAKAN_EXECUTE_SLOT].cooldownMs;
    assert.equal(player.skill3CooldownMs, cooldown, "bekleme varista kurulmadi");
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("kurulumda verilen, dalgada varan yapi kurulumun yapisi", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  const clock = withClock();
  try {
    assert.equal(room.setupPhase, true);
    const session = room.setupSession;
    room.state.players.get("p1").gold = 100_000;
    const [spot] = spots(room, "warrior-1", 1);
    send(room, client, "placeTower", { ...spot, definitionId: "warrior-1" });
    room.setupPhase = false;
    fly(room, clock, 1500);
    const [tower] = ownTowers(room);
    assert.ok(tower, "kurulmadi");
    assert.equal(tower.builtInSetupSession, session);
  } finally {
    clock.restore();
    cleanup(room);
  }
});

test("ayni kareye ikinci kurulum: not gidiyor (konumsuz), kuyruk degismiyor", async () => {
  const { room, clients: [client] } = await startedRoom(["warrior"]);
  try {
    room.state.players.get("p1").gold = 100_000;
    const [spot] = spots(room, "warrior-1", 1);
    send(room, client, "placeTower", { ...spot, definitionId: "warrior-1" });
    send(room, client, "placeTower", { ...spot, definitionId: "warrior-1" });
    assert.equal(bodyOf(room).tasks.length, 1);
    const note = messages(client, "body:task-failed").at(-1);
    assert.equal(note?.key, "body.duplicate");
    assert.equal(note.x, undefined, "ilk istegin hayaleti silinirdi");
  } finally {
    cleanup(room);
  }
});
