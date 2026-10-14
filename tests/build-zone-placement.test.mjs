/**
 * Kurulum yasak bolgeler: oda (apps/server/src/rooms/MatchRoom.ts).
 *
 * - Arena kurulunca bir kez, yerlesim tohumundan uretiliyor; her olcekte ve
 *   1. asamada da var. Ayni tohum ayni bolge; arena yeniden kurulursa ayni
 *   bolge, ve bolge hicbir zaman ayakta bir yapinin altina dusmuyor.
 * - Kule bolge karesine, 2x2 kule tek karesi bolgedeyse, duvar bolge karesine
 *   degen kenara kurulamiyor; sunucu `placement:rejected` ile nedenini yolluyor.
 * - Dusman ve isci bolgeden geciyor (bolge yalnizca insa kurali).
 * - Bolgeler yalnizca tam statik anlik goruntude gidiyor (her karede degil);
 *   sonradan giren ve yeniden baglanan ayni bolgeleri aliyor.
 * - Dugumler bolgeye dusmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { SERVER_TEXT, WALL_TOWER_ID, createBuildZoneLookup, getMapGridSize, getMapOrigin, gridToWorld, worldToGrid } from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

MatchRoom.maxConcurrentRooms = 1000;

function fakeClient(sessionId) {
  const fake = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { fake.sent.push({ type, payload }); } };
  return fake;
}

function arena(scale = 1, seed = 11, stage = 1) {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [];
  room.mapScale = scale;
  room.stage = stage;
  room.resourceLayoutSeed = seed;
  room.configureArenaForScale();
  return room;
}

function zoneCells(room) {
  const { cols } = room.buildZones;
  return room.buildZones.cells.map((index) => ({ col: index % cols, row: Math.floor(index / cols) }));
}

function lookupOf(room) {
  return createBuildZoneLookup(room.buildZones, room.activeMap.cols, room.activeMap.rows);
}

/** Bolge kurallari kaldirilinca ayni yerlestirme gecerli mi (ret gercekten bolgeden mi). */
function withoutZones(room, run) {
  const zones = room.buildZones;
  room.buildZones = undefined;
  try {
    return run();
  } finally {
    room.buildZones = zones;
  }
}

const rejections = (fake) => fake.sent.filter((message) => message.type === "placement:rejected");

test("her olcekte ve 1. asamada bolge var; tohum belirliyor, yeniden kurulum ayni bolgeyi veriyor", () => {
  for (const scale of [1, 2, 3, 4]) {
    for (const stage of [1, 2]) {
      const room = arena(scale, 500 + scale, stage);
      assert.ok(room.buildZones, `${scale}x ${stage}. asama: bolge yok`);
      assert.equal(room.buildZones.source, "random");
      assert.deepEqual([room.buildZones.cols, room.buildZones.rows], [room.activeMap.cols, room.activeMap.rows]);
      const share = room.buildZones.cells.length / (room.activeMap.cols * (room.activeMap.rows - 2));
      assert.ok(share >= 0.08 && share <= 0.12, `${scale}x: pay ${share}`);
      assert.deepEqual(arena(scale, 500 + scale, stage).buildZones.cells, room.buildZones.cells, "ayni tohum farkli bolge");
      const cells = room.buildZones.cells;
      room.configureArenaForScale();
      assert.deepEqual(room.buildZones.cells, cells, "arena yeniden kurulunca bolge degisti");
    }
    assert.notDeepEqual(arena(scale, 1).buildZones.cells, arena(scale, 2).buildZones.cells);
  }
  // Arena kurulmadan (lobi, test duzenegi) bolge yok; kurallar eskisi gibi.
  const plain = createRoom("warrior");
  assert.equal(plain.buildZones, undefined);
});

test("kaynak dugumleri bolgeye dusmuyor", () => {
  for (const scale of [1, 2, 3, 4]) {
    for (let seed = 0; seed < 25; seed += 1) {
      const room = arena(scale, seed);
      const lookup = lookupOf(room);
      for (const node of room.getEconomyNodes()) {
        const cell = worldToGrid(node.x, node.y, room.activeMap);
        assert.equal(lookup.has(cell.col, cell.row), false, `${scale}x tohum ${seed}: ${node.id} bolgede`);
      }
    }
  }
});

test("kule bolge karesine kurulamiyor; sunucu nedenini yolluyor", () => {
  const room = arena(1, 21);
  const fake = fakeClient("p1");
  for (const cell of zoneCells(room)) {
    const point = gridToWorld(cell.col, cell.row, room.activeMap);
    assert.equal(room.canPlaceTower(point.x, point.y, "warrior-1", "horizontal"), false, `${cell.col},${cell.row}`);
    assert.equal(withoutZones(room, () => room.canPlaceTower(point.x, point.y, "warrior-1", "horizontal")), true, "ret bolgeden degil");
  }
  const [first] = zoneCells(room);
  const point = gridToWorld(first.col, first.row, room.activeMap);
  room.placeTower(fake, { x: point.x, y: point.y, definitionId: "warrior-1" });
  assert.equal(room.towers.size, 0);
  const [rejection] = rejections(fake);
  assert.deepEqual(rejection.payload, { message: SERVER_TEXT["placement.forbiddenZone"], key: "placement.forbiddenZone" });
  assert.equal(SERVER_TEXT["placement.forbiddenZone"], "Bu bölgeye kurulum yapılamaz");

  // Bolge disindaki bos kare: kuruluyor, ret yok.
  const lookup = lookupOf(room);
  let free;
  for (let row = 2; row < room.activeMap.rows - 2 && !free; row += 1) {
    for (let col = 1; col < room.activeMap.cols - 1 && !free; col += 1) if (!lookup.has(col, row)) free = gridToWorld(col, row, room.activeMap);
  }
  const before = fake.sent.length;
  room.placeTower(fake, { x: free.x, y: free.y, definitionId: "warrior-1" });
  assert.equal(room.towers.size, 1);
  assert.equal(rejections({ sent: fake.sent.slice(before) }).length, 0);
});

test("2x2 kule: ayak izinin tek karesi bolgedeyse ret", () => {
  let checked = 0;
  for (const seed of [3, 4, 5, 6]) {
    const room = arena(1, seed);
    const lookup = lookupOf(room);
    const gridSize = getMapGridSize(room.activeMap);
    const origin = getMapOrigin(room.activeMap);
    for (const cell of zoneCells(room)) {
      // Kose (col+1, row+1): ayak izi (col..col+1, row..row+1); yalnizca sol ust kare bolgede olsun.
      const footprint = [[cell.col + 1, cell.row], [cell.col, cell.row + 1], [cell.col + 1, cell.row + 1]];
      if (footprint.some(([col, row]) => lookup.has(col, row))) continue;
      const x = origin.x + (cell.col + 1) * gridSize;
      const y = origin.y + (cell.row + 1) * gridSize;
      if (!withoutZones(room, () => room.canPlaceTower(x, y, "warrior-6", "horizontal"))) continue;
      assert.equal(room.canPlaceTower(x, y, "warrior-6", "horizontal"), false, "2x2 bolgeye tasti");
      const fake = fakeClient("p1");
      room.placeTower(fake, { x, y, definitionId: "warrior-6" });
      assert.equal(room.towers.size, 0);
      assert.equal(rejections(fake).length, 1);
      checked += 1;
    }
  }
  assert.ok(checked >= 4, `yalnizca ${checked} durum sinandi`);
});

test("duvar bolge karesine degen kenara kurulamiyor; degmeyen kenar serbest", () => {
  const room = arena(1, 33);
  const lookup = lookupOf(room);
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const verticalAt = (col, row) => ({ x: origin.x + col * gridSize + 1, y: origin.y + (row + 0.5) * gridSize });
  const horizontalAt = (col, row) => ({ x: origin.x + (col + 0.5) * gridSize, y: origin.y + row * gridSize + 1 });
  let checked = 0;
  for (const cell of zoneCells(room)) {
    // Dort kenar: sol, sag, ust, alt.
    for (const [point, orientation] of [
      [verticalAt(cell.col, cell.row), "vertical"],
      [verticalAt(cell.col + 1, cell.row), "vertical"],
      [horizontalAt(cell.col, cell.row), "horizontal"],
      [horizontalAt(cell.col, cell.row + 1), "horizontal"]
    ]) {
      assert.equal(room.getEdgeOrientationAt(point.x, point.y), orientation);
      const snapped = room.snapToTowerGrid(point.x, point.y, WALL_TOWER_ID, orientation);
      assert.equal(room.canPlaceTower(snapped.x, snapped.y, WALL_TOWER_ID, orientation), false, `${cell.col},${cell.row} ${orientation}`);
      assert.equal(withoutZones(room, () => room.canPlaceTower(snapped.x, snapped.y, WALL_TOWER_ID, orientation)), true);
      checked += 1;
    }
  }
  assert.ok(checked >= 16);
  const [first] = zoneCells(room);
  const fake = fakeClient("p1");
  room.placeTower(fake, { ...verticalAt(first.col, first.row), definitionId: WALL_TOWER_ID });
  assert.equal(room.towers.size, 0, "duvar bolgeye degen kenara kuruldu");
  assert.equal(rejections(fake).length, 1);

  // Hicbir bolge karesine degmeyen dikey kenar: duvar kuruluyor.
  let free;
  for (let row = 2; row < room.activeMap.rows - 2 && !free; row += 1) {
    for (let col = 2; col < room.activeMap.cols - 1 && !free; col += 1) {
      if (!lookup.has(col - 1, row) && !lookup.has(col, row)) free = verticalAt(col, row);
    }
  }
  room.placeTower(fake, { ...free, definitionId: WALL_TOWER_ID });
  assert.equal(room.towers.size, 1);
  assert.equal(rejections(fake).length, 1);
});

test("bariyer bolgeye konmuyor; zift zemin serilebiliyor", () => {
  const room = arena(1, 44);
  room.setupPhase = true;
  room.shopPlacementCharges.set("p1", { bariyer: 1, "ziftli-zemin": 1 });
  const fake = fakeClient("p1");
  const [cell] = zoneCells(room);
  const point = gridToWorld(cell.col, cell.row, room.activeMap);
  room.placeShopMapItem(fake, { itemId: "bariyer", ...point });
  assert.equal(room.shopPlacementCharges.get("p1").bariyer, 1, "bariyer bolgeye kondu");
  assert.equal(rejections(fake).length, 1);
  room.placeShopMapItem(fake, { itemId: "ziftli-zemin", ...point });
  assert.equal(room.shopPlacementCharges.get("p1")["ziftli-zemin"], 0);
});

test("bolge hareketi kapatmiyor: isci bolge karesinden geciyor", () => {
  const room = arena(1, 55);
  for (const cell of zoneCells(room)) {
    assert.equal(room.isWorkerCellOpen(cell.col, cell.row), true, `${cell.col},${cell.row} isciye kapali`);
    assert.equal(room.getTowerAtCell(cell.col, cell.row), undefined);
  }
});

test("arena yeniden kurulurken bolge ayakta yapilarin ve duvarlarin altina dusmuyor", () => {
  const room = arena(1, 1);
  const free = { free: true, ignoreLimit: true };
  for (let row = 2; row <= room.activeMap.rows - 3; row += 1) {
    for (let col = 1; col <= room.activeMap.cols - 2; col += 1) {
      if ((col + row) % 2 !== 0) continue;
      const point = gridToWorld(col, row, room.activeMap);
      room.placeTower({ sessionId: "p1", send() {} }, { x: point.x, y: point.y, definitionId: "warrior-1" }, free);
    }
  }
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  room.placeTower({ sessionId: "p1", send() {} }, { x: origin.x + 6 * gridSize + 1, y: origin.y + 9.5 * gridSize, definitionId: WALL_TOWER_ID }, free);
  assert.ok(room.towers.size >= 40, `yalnizca ${room.towers.size} yapi`);
  for (let seed = 0; seed < 30; seed += 1) {
    room.resourceLayoutSeed = seed;
    room.configureArenaForScale();
    const lookup = lookupOf(room);
    for (const tower of room.towers.values()) {
      if (tower.definition.id === WALL_TOWER_ID) {
        for (const segment of room.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation, 1)) {
          const other = segment.orientation === "vertical" ? [segment.col - 1, segment.row] : [segment.col, segment.row - 1];
          assert.equal(lookup.has(segment.col, segment.row) || lookup.has(other[0], other[1]), false, `tohum ${seed}: duvar bolgeye degiyor`);
        }
        continue;
      }
      const cell = worldToGrid(tower.x, tower.y, room.activeMap);
      assert.equal(lookup.has(cell.col, cell.row), false, `tohum ${seed}: kule bolgede`);
    }
  }
});

let roomCounter = 0;
async function realRoom(options) {
  const room = new MatchRoom();
  room.roomId = `bolge-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  await room.onCreate(options);
  return room;
}

function cleanup(...rooms) {
  for (const room of rooms) {
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

/** Istemcinin istedigi tam statik anlik goruntu (tel uzerinden gecmis hali). */
function requestFull(room, fake) {
  const before = fake.sent.length;
  handlerOf(room, "snapshot:requestFull")(fake);
  const message = fake.sent.slice(before).find((entry) => entry.type === "snapshot:full");
  assert.ok(message, "tam statik goruntu gelmedi");
  return JSON.parse(JSON.stringify(message.payload));
}

test("tel: bolgeler yalnizca tam statik goruntude; sonradan giren ve yeniden baglanan ayni bolgeyi aliyor", async () => {
  const room = await realRoom({ roomName: "Lobi", mapScale: 2 });
  try {
    const a = joinClient(room, "a", { characterId: "warrior" });
    const b = joinClient(room, "b", { characterId: "zeynep" });
    // Lobide arena yok: bolge de yok, anahtar hic yazilmiyor.
    assert.equal(room.buildZones, undefined);
    assert.equal("buildZones" in requestFull(room, a), false);
    handlerOf(room, "lobby:setReady")(a, { ready: true });
    handlerOf(room, "lobby:setReady")(b, { ready: true });
    handlerOf(room, "lobby:start")(a);
    assert.equal(room.gameStarted, true);

    const expected = { cols: room.activeMap.cols, rows: room.activeMap.rows, cells: [...room.buildZones.cells] };
    assert.deepEqual([expected.cols, expected.rows], [16, 24]);
    const fullA = requestFull(room, a);
    assert.deepEqual(fullA.buildZones, expected);
    assert.deepEqual(requestFull(room, b).buildZones, expected);
    // Kompakt: yalnizca olcu ve kare indeksleri.
    assert.deepEqual(Object.keys(fullA.buildZones).sort(), ["cells", "cols", "rows"]);
    assert.ok(fullA.buildZones.cells.every((index) => Number.isInteger(index)));

    // Her karede gitmiyor: tam ve delta kare bolgesiz.
    const frame = room.getSnapshot();
    assert.equal("buildZones" in frame, false);
    assert.equal(JSON.stringify(frame).includes("buildZones"), false);

    // Sonradan giren: ayni bolge, zar yeniden atilmiyor.
    const seed = room.resourceLayoutSeed;
    const late = joinClient(room, "c", { characterId: "archer" });
    assert.deepEqual(requestFull(room, late).buildZones, expected);
    // Yeniden baglanan (yeni oturum): ayni bolge.
    room.wireSyncedSessionIds.delete("a");
    assert.deepEqual(requestFull(room, a).buildZones, expected);
    assert.equal(room.resourceLayoutSeed, seed);
    assert.deepEqual(room.buildZones.cells, expected.cells);
  } finally {
    cleanup(room);
  }
});

test("solo mac: bolge mac baslarken; tohumlu Math.random ile belirlenimci", async () => {
  const start = async () => {
    const room = await realRoom({ roomName: "Solo", mapScale: 1, autoStart: true });
    room.resourceLayoutSeed = 12345;
    joinClient(room, "p", { characterId: "warrior" });
    return room;
  };
  const first = await start();
  const second = await start();
  try {
    assert.ok(first.buildZones.cells.length > 0);
    assert.deepEqual(second.buildZones.cells, first.buildZones.cells);
    assert.deepEqual(requestFull(first, first.clients[0]).buildZones.cells, first.buildZones.cells);
  } finally {
    cleanup(first, second);
  }
});
