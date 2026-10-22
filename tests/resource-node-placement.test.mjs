/**
 * Kaynak dugumlerinin rastgele yerlesimi: oda.
 *
 * Dugumler mac baslarken sunucuda bir kez dagitiliyor (`rollResourceLayout`)
 * ve mac boyunca yerinde kaliyor. Burada tutulan sozler:
 *
 * - Tohum yerlesimi belirliyor: ayni tohum ayni kareler, farkli tohum farkli.
 * - Konumlar her snapshotta (tam ve delta kare) gidiyor; yeniden baglanan ve
 *   sonradan giren istemci ayni kareleri goruyor, zar yeniden atilmiyor.
 * - Isciler her dugume yuruyup toplayabiliyor.
 * - Kule yerlesim kurallari degismedi; dugum ayakta bir yapinin altina dusmuyor.
 * - Haritanin acikca verdigi konumlar aynen kaliyor.
 * - Baslangic toplayicilari turlerinin usse en yakin dugumune gidiyor.
 *
 * Kurallarin kendisi (aralik, kenar payi, adil baslangic) saf fonksiyonda:
 * tests/resource-layout.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import {
  MAP_RESOURCE_NODES,
  getMapResourceNodes,
  RESOURCE_NODE_INITIAL_AMOUNT,
  createDefaultEditableMap,
  createOpenArenaMap,
  getMapGridSize,
  getMapOrigin,
  gridToWorld,
  worldToGrid
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

MatchRoom.maxConcurrentRooms = 1000;

const client = { sessionId: "p1", send() {} };
const IDS = MAP_RESOURCE_NODES.map((node) => node.id);
/** Odanin yayinladigi sira: once kristaller, sonra hammadde yataklari (olcek kadar takim). */
const scaledEconomyOrder = (scale) => {
  const nodes = getMapResourceNodes(scale);
  return [...nodes.filter((node) => node.kind === "energy"), ...nodes.filter((node) => node.kind !== "energy")];
};
const ARENA_SIZES = { 1: [12, 18], 2: [16, 24], 3: [20, 30], 4: [24, 36] };
const OWNER_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";

/** Acik arena, istenen olcek ve yerlesim tohumu. */
function arena(scale = 1, seed = undefined, stage = 1) {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  room.mapScale = scale;
  room.stage = stage;
  if (seed !== undefined) room.resourceLayoutSeed = seed;
  room.configureArenaForScale();
  return room;
}

/** Dugumlerin kareleri, kimlige gore. */
function cellsOf(room, nodes = room.getEconomyNodes()) {
  return Object.fromEntries(nodes.map((node) => [node.id, worldToGrid(node.x, node.y, room.activeMap)]));
}

function snapshotNodes(snapshot) {
  return [...snapshot.crystalNodes, ...snapshot.ammoNodes].map((node) => ({ id: node.id, x: node.x, y: node.y }));
}

function seededRandom(seed) {
  let a = seed >>> 0;
  const random = () => {
    random.calls += 1;
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  random.calls = 0;
  return random;
}

function withMathRandom(random, run) {
  const real = Math.random;
  Math.random = random;
  try {
    return run();
  } finally {
    Math.random = real;
  }
}

let roomCounter = 0;
function fakeClient(sessionId) {
  const fake = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { fake.sent.push({ type, payload }); } };
  return fake;
}

/** `onCreate`'ten gecen gercek oda; Colyseus saati ve yayin baglanmiyor. */
async function realRoom(options) {
  const room = new MatchRoom();
  room.roomId = `kaynak-${roomCounter += 1}`;
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
  const fake = fakeClient(sessionId);
  room.clients.push(fake);
  room.onJoin(fake, { playerName: sessionId, ...options });
  return fake;
}

function handlerOf(room, type) {
  const handler = room.onMessageHandlers[type];
  assert.ok(handler, `${type} kayitli degil`);
  return (target, payload) => handler.callback(target, payload);
}

/** Bir kareyi odadaki herkese yollar; her istemcinin aldigi `snapshot` yukunu dondurur. */
function broadcastFrame(room) {
  const before = new Map(room.clients.map((entry) => [entry.sessionId, entry.sent.length]));
  const full = room.getSnapshot();
  const { wire, towerBaseline, enemyBaseline, extraBaselines } = room.applyWireDelta(full);
  assert.equal(room.sendSnapshotWithBackpressure(wire, full), true);
  room.commitWireBaseline(towerBaseline, enemyBaseline, extraBaselines);
  const received = new Map();
  for (const entry of room.clients) {
    const frame = entry.sent.slice(before.get(entry.sessionId)).find((message) => message.type === "snapshot");
    received.set(entry.sessionId, JSON.parse(JSON.stringify(frame.payload)));
  }
  return received;
}

test("arena kurulmadan (lobi, test duzenegi) eski sabit yerlesim gecerli", () => {
  const room = createRoom("warrior");
  assert.equal(room.resourceLayout, undefined);
  // 11x18 varsayilan harita, 34 birimlik kare, ust kenar 86.
  assert.deepEqual(room.getCrystalNodes(), [
    { id: "crystal-1", remaining: 3000, x: 85, y: 307 },
    { id: "crystal-2", remaining: 3000, x: 187, y: 477 },
    { id: "crystal-3", remaining: 3000, x: 289, y: 307 }
  ]);
  assert.deepEqual(room.getMaterialNodes(), [
    { id: "ammo-source-1", kind: "gunpowder", remaining: 3000, x: 51, y: 511 },
    { id: "ammo-source-2", kind: "mystic", remaining: 3000, x: 221, y: 273 },
    { id: "ammo-source-3", kind: "plasma", remaining: 3000, x: 323, y: 511 },
    { id: "iron-1", kind: "iron", remaining: 3000, x: 119, y: 375 }
  ]);
  assert.deepEqual(room.getAmmoNodes().map((node) => node.id), ["ammo-source-1", "ammo-source-2", "ammo-source-3"]);
});

test("dugumler olcek kadar takim; kimlik ve tur sabit, yalnizca yerleri degisiyor", () => {
  for (const scale of [1, 2, 3, 4]) {
    const room = arena(scale, 4242 + scale);
    const nodes = room.getEconomyNodes();
    assert.deepEqual(nodes.map((node) => [node.id, node.kind]), scaledEconomyOrder(scale).map((node) => [node.id, node.kind]));
    assert.ok(nodes.every((node) => node.remaining === RESOURCE_NODE_INITIAL_AMOUNT));
    assert.equal(room.resourceLayout.source, "random");
    assert.equal(room.resourceLayout.spacing, 3);
    const [cols, rows] = ARENA_SIZES[scale];
    assert.deepEqual([room.activeMap.cols, room.activeMap.rows], [cols, rows]);
    const cells = cellsOf(room);
    for (const node of nodes) {
      const cell = cells[node.id];
      // Dunya konumu karenin tam merkezi.
      assert.deepEqual({ x: node.x, y: node.y }, gridToWorld(cell.col, cell.row, room.activeMap));
      assert.ok(cell.col >= 1 && cell.col <= cols - 2, `${scale}x ${node.id}: kenar payi`);
      assert.ok(cell.row >= 2 && cell.row <= rows - 3, `${scale}x ${node.id}: dogum/nexus bandi`);
    }
    const ids = nodes.map((node) => node.id);
    for (let a = 0; a < ids.length; a += 1) {
      for (let b = a + 1; b < ids.length; b += 1) {
        const distance = Math.max(Math.abs(cells[ids[a]].col - cells[ids[b]].col), Math.abs(cells[ids[a]].row - cells[ids[b]].row));
        assert.ok(distance >= 3, `${scale}x ${ids[a]} / ${ids[b]}: aralik ${distance}`);
      }
    }
    const lowerFirstRow = Math.ceil(rows * 0.4);
    assert.ok(["crystal-1", "crystal-2", "crystal-3"].some((id) => cells[id].row >= lowerFirstRow), `${scale}x: alt %60'ta kristal yok`);
    assert.ok(cells["ammo-source-1"].row >= lowerFirstRow, `${scale}x: barut alt %60'ta degil`);
  }
});

test("farkli tohumlu iki oda farkli, ayni tohumlu iki oda ayni yerlesimde", () => {
  for (const scale of [1, 2, 3, 4]) {
    const first = arena(scale, 1001);
    const same = arena(scale, 1001);
    const other = arena(scale, 1002);
    assert.deepEqual(same.getEconomyNodes(), first.getEconomyNodes(), `${scale}x: ayni tohum farkli yerlesim verdi`);
    assert.notDeepEqual(cellsOf(other), cellsOf(first), `${scale}x: farkli tohum ayni yerlesimi verdi`);
  }
  // Mac boyunca sabit: arka arkaya okumalar ve arenanin yeniden kurulmasi ayni kareleri veriyor.
  const room = arena(1, 77);
  const before = cellsOf(room);
  room.configureArenaForScale();
  assert.deepEqual(cellsOf(room), before);
  assert.equal(room.resourceLayoutSeed, 77);
});

test("tohum mac basinda Math.random'dan tek cekim; tohumlu Math.random ile mac belirlenimci", () => {
  // Yalnizca macin baslangici (arenanin kurulmasi) sayiliyor; odanin kendisi disarida kuruluyor.
  const roll = (seed, stage) => {
    const random = seededRandom(seed);
    const room = createRoom("warrior");
    room.broadcast = () => {};
    room.clients = [client];
    room.mapScale = 1;
    room.stage = stage;
    withMathRandom(random, () => room.configureArenaForScale());
    return { room, calls: random.calls };
  };
  // 1. asama: iki cekim: dalga paterni tohumu (ilk dalga planinda), sonra
  // yerlesim tohumu. Ozel dusman tohumu hic cekilmiyor. Yerlesim tohumu
  // kurulum yasak bolgeleri de belirliyor (ayri tuzlu bir akis): bolgeler
  // ek bir `Math.random` cekimi istemiyor.
  const a = roll(9001, 1);
  const b = roll(9001, 1);
  const c = roll(9002, 1);
  assert.equal(a.calls, 2);
  assert.deepEqual(b.room.buildZones, a.room.buildZones, "ayni tohum ayni yasak bolge");
  assert.notDeepEqual(c.room.buildZones.cells, a.room.buildZones.cells);
  assert.equal(a.room.specialSeed, undefined);
  const first = seededRandom(9001);
  assert.equal(a.room.wavePatternSeed, Math.floor(first() * 0x1_0000_0000));
  assert.equal(a.room.resourceLayoutSeed, Math.floor(first() * 0x1_0000_0000));
  assert.deepEqual(b.room.getEconomyNodes(), a.room.getEconomyNodes());
  assert.deepEqual(b.room.wavePatternPlan, a.room.wavePatternPlan, "ayni tohum ayni dalga paterni");
  assert.notDeepEqual(cellsOf(c.room), cellsOf(a.room));

  // 2. asama: ozel dusman tohumu eskisi gibi ilk cekim, patern tohumu ve
  // yerlesim tohumu onun ardindan.
  const stageTwo = roll(9001, 2);
  const sequence = seededRandom(9001);
  assert.equal(stageTwo.calls, 3);
  assert.equal(stageTwo.room.specialSeed, Math.floor(sequence() * 0x1_0000_0000));
  assert.equal(stageTwo.room.wavePatternSeed, Math.floor(sequence() * 0x1_0000_0000));
  assert.equal(stageTwo.room.resourceLayoutSeed, Math.floor(sequence() * 0x1_0000_0000));

  // Sonraki dalga planlari ve okumalar yerlesim icin bir daha zar atmiyor.
  const counting = seededRandom(1);
  withMathRandom(counting, () => {
    for (let wave = 1; wave <= 20; wave += 1) a.room.planWaveSpawns(wave);
    a.room.getSnapshot();
    a.room.configureArenaForScale();
  });
  assert.equal(counting.calls, 0);
});

test("konumlar her snapshotta: tam karede de delta karede de", () => {
  const room = arena(2, 31337);
  const expected = room.getEconomyNodes().map((node) => ({ id: node.id, x: node.x, y: node.y }));
  const snapshot = room.getSnapshot();
  assert.deepEqual(snapshotNodes(snapshot), expected);
  assert.deepEqual(snapshot.crystalNodes.map((node) => Object.keys(node)), Array(6).fill(["id", "remaining", "x", "y"]));
  assert.deepEqual(snapshot.ammoNodes.map((node) => node.kind), ["gunpowder", "mystic", "plasma", "iron", "gunpowder", "mystic", "plasma", "iron"]);

  // Delta yalnizca kule/dusman/oyuncu/isci kayitlarini kirpiyor; dugumler tam gidiyor.
  const first = room.applyWireDelta(snapshot);
  room.commitWireBaseline(first.towerBaseline, first.enemyBaseline, first.extraBaselines);
  const second = room.applyWireDelta(room.getSnapshot());
  assert.deepEqual(snapshotNodes(second.wire), expected);

  // Kalan miktar dugumun kimligine bagli: cekim yeri degistirmiyor.
  assert.equal(room.extractNodeResource("crystal-2", 150), 150);
  const after = room.getSnapshot();
  assert.deepEqual(snapshotNodes(after), expected);
  assert.equal(after.crystalNodes.find((node) => node.id === "crystal-2").remaining, RESOURCE_NODE_INITIAL_AMOUNT - 150);
});

test("solo mac: yeniden baglanan sahip ayni konumlari goruyor, zar yeniden atilmiyor", async () => {
  const room = await realRoom({ roomName: "Solo", mapScale: 1, autoStart: true, ownerSecret: OWNER_SECRET });
  try {
    assert.equal(room.resourceLayout, undefined, "yerlesim mac baslamadan atildi");
    const owner = joinClient(room, "sahip", { characterId: "warrior", playerName: "Sahip", ownerSecret: OWNER_SECRET });
    assert.equal(room.gameStarted, true);
    assert.equal(room.resourceLayout.source, "random");
    const seed = room.resourceLayoutSeed;
    assert.equal(Number.isInteger(seed), true);
    const layout = room.resourceLayout;
    const before = broadcastFrame(room).get("sahip");
    assert.equal(before.wireFull, true);
    const expected = snapshotNodes(before);
    assert.deepEqual(expected, room.getEconomyNodes().map((node) => ({ id: node.id, x: node.x, y: node.y })));

    // Baglanti koptu, pencere kapandi; sahip sirriyla yeni oturumdan donuyor.
    room.state.players.get("sahip").connected = false;
    room.clients = [];
    room.wireSyncedSessionIds.delete("sahip");
    void owner;
    const back = fakeClient("sahip-yeni");
    room.clients.push(back);
    room.onJoin(back, { characterId: "warrior", playerName: "Sahip", ownerSecret: OWNER_SECRET });
    assert.equal(room.state.players.has("sahip-yeni"), true);
    assert.ok(back.sent.some((message) => message.type === "match:map"));

    const resumed = broadcastFrame(room).get("sahip-yeni");
    assert.equal(resumed.wireFull, true, "donen istemci tam kare almadi");
    assert.deepEqual(snapshotNodes(resumed), expected);
    // Sonraki (delta) karede de ayni.
    const delta = broadcastFrame(room).get("sahip-yeni");
    assert.equal(delta.wireFull, undefined);
    assert.deepEqual(snapshotNodes(delta), expected);
    assert.equal(room.resourceLayoutSeed, seed);
    assert.equal(room.resourceLayout, layout, "yerlesim yeniden kuruldu");
  } finally {
    cleanup(room);
  }
});

test("co-op mac: herkes ayni konumlari goruyor; sonradan giren de", async () => {
  const room = await realRoom({ roomName: "Lobi", mapScale: 2 });
  try {
    const a = joinClient(room, "a", { characterId: "warrior" });
    const b = joinClient(room, "b", { characterId: "zeynep" });
    assert.equal(room.resourceLayout, undefined, "lobide yerlesim atildi");
    handlerOf(room, "lobby:setReady")(a, { ready: true });
    handlerOf(room, "lobby:setReady")(b, { ready: true });
    handlerOf(room, "lobby:start")(a);
    assert.equal(room.gameStarted, true);
    assert.deepEqual([room.activeMap.cols, room.activeMap.rows], ARENA_SIZES[2]);

    const frames = broadcastFrame(room);
    const expected = snapshotNodes(frames.get("a"));
    assert.equal(expected.length, 14);
    assert.deepEqual(snapshotNodes(frames.get("b")), expected);

    // Dugumler ortak: oyuncu basina ayri ya da aynali kopya yok.
    assert.deepEqual(scaledEconomyOrder(2).map((node) => node.id), expected.map((node) => node.id));

    const late = joinClient(room, "c", { characterId: "archer" });
    assert.equal(room.state.players.size, 3);
    const lateFrames = broadcastFrame(room);
    assert.equal(lateFrames.get("c").wireFull, true);
    assert.equal(lateFrames.get("a").wireFull, undefined);
    assert.deepEqual(snapshotNodes(lateFrames.get("c")), expected);
    assert.deepEqual(snapshotNodes(lateFrames.get("a")), expected);
    void late;
  } finally {
    cleanup(room);
  }
});

test("gercek odalar: tohum yerlesimi belirliyor", async () => {
  const start = async (seed) => {
    const room = await realRoom({ roomName: "Solo", mapScale: 1, autoStart: true });
    room.resourceLayoutSeed = seed;
    joinClient(room, "p", { characterId: "warrior" });
    return room;
  };
  const first = await start(5);
  const same = await start(5);
  const other = await start(6);
  try {
    assert.deepEqual(same.getEconomyNodes(), first.getEconomyNodes());
    assert.notDeepEqual(cellsOf(other), cellsOf(first));
  } finally {
    cleanup(first, same, other);
  }
});

/** Usse yakin bir reaktor ve depo kurar; toplayicinin birakacagi yer olsun. */
function buildDepots(room) {
  const { cols, rows } = room.activeMap;
  for (const [definitionId, col] of [["warrior-8", cols - 2], ["warehouse-1", cols - 4]]) {
    const point = gridToWorld(col, rows - 2, room.activeMap);
    const count = room.towers.size;
    room.placeTower(client, { x: point.x, y: point.y, definitionId });
    assert.equal(room.towers.size, count + 1, `${definitionId} kurulamadi`);
  }
}

/** Toplayiciyi dogum karesinden dugume yollar; yuk alana kadar kac tick surdugunu dondurur. */
function gatherFrom(room, worker, node) {
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  Object.assign(worker, {
    x: origin.x + gridSize * 1.5,
    y: origin.y + gridSize * (room.activeMap.rows - 1.5),
    cargo: 0,
    cargoResource: undefined,
    extractionRemainingMs: undefined,
    pendingAssignment: undefined,
    routeStep: undefined,
    assignment: { nodeId: node.id }
  });
  for (let tick = 1; tick <= 4000; tick += 1) {
    room.updateAssignedWorker(worker, 0.1);
    if ((worker.cargo ?? 0) > 0) return tick;
  }
  return -1;
}

test("isciler her dugume yuruyup topluyor (her olcekte)", () => {
  for (const scale of [1, 2, 3, 4]) {
    for (const seed of [3, 58]) {
      const room = arena(scale, seed * 13 + scale);
      buildDepots(room);
      room.ensureLogisticsWorkers();
      const worker = room.drones.get("logistics-p1-crystalCollector");
      assert.ok(worker, "toplayici yok");
      for (const node of room.getEconomyNodes()) {
        // Yol var: dogum karesinden dugume bir sonraki adim bulunuyor.
        const ticks = gatherFrom(room, worker, node);
        assert.ok(ticks > 0, `${scale}x tohum ${seed}: ${node.id} dugumunden toplanamadi`);
        assert.equal(worker.cargoResource, node.kind);
        assert.deepEqual(worldToGrid(worker.x, worker.y, room.activeMap), worldToGrid(node.x, node.y, room.activeMap), `${node.id}: isci dugumun karesinde degil`);
        assert.equal(room.getNodeRemaining(node.id), RESOURCE_NODE_INITIAL_AMOUNT - worker.cargo);
      }
    }
  }
});

test("kule yerlesim kurallari degismedi: dolu kare ve haritadan tasan yapi reddediliyor, dugum karesi eskisi gibi serbest", () => {
  const room = arena(1, 2024);
  const cells = cellsOf(room);
  const { cols, rows } = room.activeMap;
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const at = (col, row) => gridToWorld(col, row, room.activeMap);
  const isNodeCell = (col, row) => Object.values(cells).some((cell) => cell.col === col && cell.row === row);

  // Dugumler hareketi kapatmiyor: isci dugumun karesinden geciyor, orada yapi sayilan bir sey yok.
  for (const id of IDS) {
    assert.equal(room.isWorkerCellOpen(cells[id].col, cells[id].row), true, `${id} isciye kapali`);
    assert.equal(room.getTowerAtCell(cells[id].col, cells[id].row), undefined);
  }

  // Bos, dugumsuz kare: serbest.
  let free;
  for (let col = 1; col < cols - 1 && !free; col += 1) if (!isNodeCell(col, 9)) free = at(col, 9);
  assert.equal(room.canPlaceTower(free.x, free.y, "warrior-1", "horizontal"), true);

  // Dugum karesi: eskiden de serbestti, hala serbest. Dolunca her kare gibi kapaniyor.
  const gunpowder = at(cells["ammo-source-1"].col, cells["ammo-source-1"].row);
  assert.equal(room.canPlaceTower(gunpowder.x, gunpowder.y, "warrior-1", "horizontal"), true, "dugum karesine kule kurulamiyor (kural degisti)");
  room.placeTower(client, { ...gunpowder, definitionId: "warrior-1" });
  assert.equal(room.towers.size, 1);
  assert.equal(room.canPlaceTower(gunpowder.x, gunpowder.y, "warrior-1", "horizontal"), false, "dolu kareye ikinci kule");
  room.placeTower(client, { ...gunpowder, definitionId: "warrior-1" });
  assert.equal(room.towers.size, 1, "dolu kareye ikinci kule kuruldu");

  // 2x2 yapi (Ucube) haritadan tasamaz: sag alt kosenin disina merkezlenen yerlesim ret.
  assert.equal(room.canPlaceTower(origin.x + cols * gridSize, origin.y + rows * gridSize, "warrior-6", "horizontal"), false);
  assert.equal(room.canPlaceTower(origin.x + 4 * gridSize, origin.y + 4 * gridSize, "warrior-6", "horizontal"),
    ![[3, 3], [4, 3], [3, 4], [4, 4]].some(([col, row]) => room.getTowerAtCell(col, row)));

  // Ustune kule kurulan dugum hala toplanabiliyor: isci bitisik karede duruyor.
  buildDepots(room);
  room.ensureLogisticsWorkers();
  const worker = room.drones.get("logistics-p1-crystalCollector");
  const node = room.getEconomyNodes().find((entry) => entry.id === "ammo-source-1");
  assert.ok(gatherFrom(room, worker, node) > 0, "ustunde kule olan dugumden toplanamadi");
  const stood = worldToGrid(worker.x, worker.y, room.activeMap);
  assert.equal(Math.abs(stood.col - cells["ammo-source-1"].col) + Math.abs(stood.row - cells["ammo-source-1"].row), 1);
});

test("dugum ayakta bir yapinin altina dagitilmiyor", () => {
  const room = arena(1, 1);
  // Satranc tahtasi gibi kuleler: gecerli karelerin yarisi dolu.
  let built = 0;
  for (let row = 2; row <= room.activeMap.rows - 3; row += 1) {
    for (let col = 1; col <= room.activeMap.cols - 2; col += 1) {
      if ((col + row) % 2 !== 0) continue;
      const point = gridToWorld(col, row, room.activeMap);
      const count = room.towers.size;
      room.placeTower(client, { x: point.x, y: point.y, definitionId: "warrior-1" }, { free: true, ignoreLimit: true });
      built += room.towers.size - count;
    }
  }
  assert.ok(built >= 60, `yalnizca ${built} kule kuruldu`);
  for (let seed = 0; seed < 60; seed += 1) {
    room.resourceLayoutSeed = seed;
    room.rollResourceLayout();
    const cells = cellsOf(room);
    for (const id of IDS) {
      assert.equal(room.getTowerAtCell(cells[id].col, cells[id].row), undefined, `tohum ${seed}: ${id} kulenin altinda`);
    }
  }
});

test("haritanin acikca verdigi dugum konumlari aynen kaliyor ve dugum zari atilmiyor", async () => {
  const explicit = [
    { id: "crystal-1", col: 1, row: 3 },
    { id: "crystal-2", col: 5, row: 3 },
    { id: "crystal-3", col: 9, row: 3 },
    { id: "ammo-source-1", col: 2, row: 14 },
    { id: "ammo-source-2", col: 6, row: 14 },
    { id: "ammo-source-3", col: 10, row: 14 },
    { id: "iron-1", col: 6, row: 9 }
  ];
  const room = await realRoom({ roomName: "Harita", mapScale: 1, autoStart: true, mapData: { ...createOpenArenaMap(12, 18), resourceNodes: explicit } });
  const partial = await realRoom({ roomName: "Kismi", mapScale: 1, autoStart: true, mapData: { ...createOpenArenaMap(12, 18), resourceNodes: [explicit[0], explicit[6]] } });
  // Baska olcude harita (11x18 duzenlenebilir harita): konum arenaya oranla tasiniyor.
  const projected = await realRoom({ roomName: "Olcek", mapScale: 1, autoStart: true, mapData: { ...createDefaultEditableMap(1), resourceNodes: [{ id: "iron-1", col: 10, row: 9 }] } });
  try {
    const random = seededRandom(1);
    withMathRandom(random, () => joinClient(room, "p", { characterId: "warrior" }));
    // Tek cekim: kurulum yasak bolgelerin tohumu (bolge her haritada var).
    // Dugum zari bu tohumdan turuyor ama acik yerlesim onu hic kullanmiyor.
    assert.equal(random.calls, 1, "acik yerlesim zar atti");
    assert.equal(room.resourceLayout.source, "explicit");
    assert.equal(room.resourceLayoutSeed, Math.floor(seededRandom(1)() * 0x1_0000_0000));
    assert.ok(room.buildZones.cells.length > 0);
    // Acik dugum konumlari bolgeye girmiyor.
    for (const node of explicit) assert.equal(room.buildZones.cells.includes(node.row * 12 + node.col), false, `${node.id} bolgede`);
    assert.deepEqual(cellsOf(room), Object.fromEntries(explicit.map((node) => [node.id, { col: node.col, row: node.row }])));
    assert.deepEqual(snapshotNodes(room.getSnapshot()).map((node) => worldToGrid(node.x, node.y, room.activeMap)), explicit.map((node) => ({ col: node.col, row: node.row })));

    for (const seed of [1, 2, 3]) {
      partial.resourceLayoutSeed = seed;
      if (seed === 1) joinClient(partial, "p", { characterId: "warrior" });
      else partial.rollResourceLayout();
      assert.equal(partial.resourceLayout.source, "random");
      const cells = cellsOf(partial);
      assert.deepEqual(cells["crystal-1"], { col: 1, row: 3 });
      assert.deepEqual(cells["iron-1"], { col: 6, row: 9 });
      for (const id of IDS.filter((entry) => entry !== "crystal-1" && entry !== "iron-1")) {
        for (const pinned of ["crystal-1", "iron-1"]) {
          assert.ok(Math.max(Math.abs(cells[id].col - cells[pinned].col), Math.abs(cells[id].row - cells[pinned].row)) >= 3, `${id} acik konuma yapisik`);
        }
      }
    }

    joinClient(projected, "p", { characterId: "warrior" });
    assert.deepEqual(cellsOf(projected)["iron-1"], { col: 11, row: 9 });
    assert.equal(projected.resourceLayout.source, "random");
  } finally {
    cleanup(room, partial, projected);
  }
});

test("baslangic toplayicilari turlerinin usse en yakin dugumune gidiyor", () => {
  let sawOtherThanFirst = false;
  for (let seed = 1; seed <= 40; seed += 1) {
    const room = arena(1, seed);
    const cells = cellsOf(room);
    room.ensureLogisticsWorkers();
    const energy = room.drones.get("logistics-p1-crystalCollector");
    const gunpowder = room.drones.get("logistics-p1-ammoCollector");
    // Us alt satirin tamami: en yakin, en alttaki kristal; esitlikte toplayicinin dogdugu kareye (1, 16) yakin olan.
    const spawn = { col: 1, row: room.activeMap.rows - 2 };
    const expected = ["crystal-1", "crystal-2", "crystal-3"]
      .map((id) => ({ id, base: (room.activeMap.rows - 1 - cells[id].row) ** 2, from: (cells[id].col - spawn.col) ** 2 + (cells[id].row - spawn.row) ** 2 }))
      .sort((left, right) => left.base - right.base || left.from - right.from)[0].id;
    assert.equal(energy.assignment.nodeId, expected, `tohum ${seed}`);
    assert.equal(gunpowder.assignment.nodeId, "ammo-source-1");
    if (expected !== "crystal-1") sawOtherThanFirst = true;
    // Varsayilan is telde "otomatik" olarak isaretli; elle atama bayragi kaldiriyor ve yeniden dogumda korunuyor.
    const wire = room.getSnapshot().drones.find((drone) => drone.id === energy.id);
    assert.equal(wire.autoAssigned, true);
    assert.deepEqual(wire.assignment, { nodeId: expected });
  }
  assert.ok(sawOtherThanFirst, "en yakin kristal her tohumda crystal-1: test hicbir sey sinamiyor");

  const room = arena(1, 7);
  room.ensureLogisticsWorkers();
  const worker = room.drones.get("logistics-p1-crystalCollector");
  room.assignWorker(client, { workerId: worker.id, nodeId: "iron-1" });
  room.drones.delete(worker.id);
  room.ensureLogisticsWorkers();
  assert.deepEqual(room.drones.get(worker.id).assignment, { nodeId: "iron-1" });
});
