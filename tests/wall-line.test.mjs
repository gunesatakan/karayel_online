/**
 * Duvar cizgisi: saf modul (jest zamanlamasi, eksen, kenar uretimi, bedel) ve
 * sunucunun `wall:line` mesaji.
 *
 * Sunucu kurali yeniden yazmiyor: her parca tekli `placeTower`dan geciyor.
 * Burada kilitlenen sey bunun sonucu -- gecersiz parca atlaniyor ama arkasi
 * denenmeye devam ediyor, altin bitince cizgi kesiliyor, sahibi olmayan ve
 * macta olmayan istemci hicbir sey kuramiyor, kova asilinca mesaj dusuyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MESSAGE_RULES,
  MatchRoom
} from "../apps/server/dist/rooms/MatchRoom.js";
import {
  SERVER_TEXT,
  WALL_LINE_DWELL_MS,
  WALL_LINE_DWELL_TOLERANCE_PX,
  WALL_LINE_HANDLE_TOUCH_PX,
  WALL_LINE_HANDLE_VISIBLE_MS,
  WALL_LINE_SERVER_MAX_PIECES,
  WALL_TOWER_ID,
  advanceWallDwell,
  constrainWallHandleFinger,
  getAffordableWallPieces,
  getMapGridSize,
  getMapOrigin,
  getTowerBuildCost,
  getWallDwellProgress,
  getWallLine,
  getWallLineCost,
  getWallLineMaxLength,
  getWallRunEnds,
  getWallSegmentCenter,
  pickAffordableWallPieces,
  pickWallLineAxis,
  startWallDwell,
  wallTower
} from "../packages/shared/dist/index.js";

// ----------------------------------------------------------------- saf modul

const board = { cols: 12, rows: 18 };
const geometry = { gridSize: 34, origin: { x: 10, y: 20 }, board };
const centerOf = (segment) => getWallSegmentCenter(segment, geometry);
const h = (col, row) => ({ orientation: "horizontal", col, row });
const v = (col, row) => ({ orientation: "vertical", col, row });

test("sabitler: 450 ms, 8 px, ~4 sn, 44 px", () => {
  assert.equal(WALL_LINE_DWELL_MS, 450);
  assert.equal(WALL_LINE_DWELL_TOLERANCE_PX, 8);
  assert.equal(WALL_LINE_HANDLE_VISIBLE_MS, 4000);
  assert.equal(WALL_LINE_HANDLE_TOUCH_PX, 44);
  // En buyuk arenanin kenari (4x: 24x36) sigmali.
  assert.ok(WALL_LINE_SERVER_MAX_PIECES >= 36);
});

test("jest: 450 ms hareketsiz kalinca kilitlenir, oncesinde kilitlenmez", () => {
  let state = startWallDwell(100, 100, 1000);
  state = advanceWallDwell(state, 100, 100, 1000 + WALL_LINE_DWELL_MS - 1);
  assert.equal(state.locked, false);
  assert.ok(getWallDwellProgress(state, 1000 + 225) > 0.49 && getWallDwellProgress(state, 1000 + 225) < 0.51);
  state = advanceWallDwell(state, 100, 100, 1000 + WALL_LINE_DWELL_MS);
  assert.equal(state.locked, true);
  assert.equal(getWallDwellProgress(state, 99999), 1);
  // Kilitten sonra parmak serbest: durum donmus kalir.
  assert.equal(advanceWallDwell(state, 400, 400, 99999), state);
});

test("jest: 8 px icindeki titreme bekleme sayilir, toleransi asan hareket beklemeyi bastan baslatir", () => {
  let state = startWallDwell(100, 100, 0);
  state = advanceWallDwell(state, 100 + WALL_LINE_DWELL_TOLERANCE_PX, 100, 300);
  assert.equal(state.startedAt, 0, "tolerans icindeki hareket beklemeyi sifirladi");
  state = advanceWallDwell(state, 100 + WALL_LINE_DWELL_TOLERANCE_PX + 1, 100, 400);
  assert.equal(state.startedAt, 400, "tolerans asildi ama bekleme sifirlanmadi");
  assert.equal(state.originX, 100 + WALL_LINE_DWELL_TOLERANCE_PX + 1);
  // Yeni noktada tam sure beklenmeli.
  assert.equal(advanceWallDwell(state, state.originX, 100, 400 + WALL_LINE_DWELL_MS - 1).locked, false);
  assert.equal(advanceWallDwell(state, state.originX, 100, 400 + WALL_LINE_DWELL_MS).locked, true);
});

test("jest: yavas suruklenme birikmiyor -- tolerans baslangic noktasindan olculur", () => {
  let state = startWallDwell(0, 0, 0);
  // Her adim 2 px: adim basina tolerans icinde ama toplam sapma tolerans disinda.
  for (let step = 1; step <= 10; step += 1) state = advanceWallDwell(state, step * 2, 0, step * 100);
  assert.equal(state.locked, false, "yavas kayan parmak sabitledi");
});

test("eksen: parmagin daha cok gittigi eksen; esitlikte yatay", () => {
  const anchor = { x: 100, y: 100 };
  assert.equal(pickWallLineAxis(anchor, { x: 180, y: 120 }), "horizontal");
  assert.equal(pickWallLineAxis(anchor, { x: 90, y: 20 }), "vertical");
  assert.equal(pickWallLineAxis(anchor, { x: 150, y: 150 }), "horizontal");
  assert.equal(pickWallLineAxis(anchor, anchor), "horizontal");
});

test("cizgi: yatay, ileri yon; capa ilk parca, parmagin kat ettigi kare kadar uzar", () => {
  const anchor = h(2, 9);
  const c = centerOf(anchor);
  const line = getWallLine({ ...geometry, anchor: c, finger: { x: c.x + 3 * 34, y: c.y + 4 } });
  assert.equal(line.axis, "horizontal");
  assert.equal(line.direction, 1);
  assert.deepEqual(line.segments, [h(2, 9), h(3, 9), h(4, 9), h(5, 9)]);
});

test("cizgi: geri yon ve dikey eksen", () => {
  const c = centerOf(h(6, 9));
  const back = getWallLine({ ...geometry, anchor: c, finger: { x: c.x - 2 * 34, y: c.y } });
  assert.equal(back.direction, -1);
  assert.deepEqual(back.segments, [h(6, 9), h(5, 9), h(4, 9)]);

  const vc = centerOf(v(4, 5));
  const down = getWallLine({ ...geometry, anchor: vc, finger: { x: vc.x + 5, y: vc.y + 2 * 34 } });
  assert.equal(down.axis, "vertical");
  assert.deepEqual(down.segments, [v(4, 5), v(4, 6), v(4, 7)]);
});

test("cizgi: capaya donen parmak yalnizca capayi birakir", () => {
  const c = centerOf(h(3, 6));
  for (const dx of [0, 10, -10, 16]) {
    const line = getWallLine({ ...geometry, anchor: c, finger: { x: c.x + dx, y: c.y } });
    assert.deepEqual(line.segments, [h(3, 6)], `dx ${dx}`);
  }
  // Yarim karenin otesi ikinci parcayi getirir.
  assert.equal(getWallLine({ ...geometry, anchor: c, finger: { x: c.x + 18, y: c.y } }).segments.length, 2);
});

test("cizgi: tahtanin disina kirpilir; parmak haritadan cikinca cizgi kenarda biter", () => {
  const c = centerOf(h(9, 9));
  const line = getWallLine({ ...geometry, anchor: c, finger: { x: c.x + 50 * 34, y: c.y } });
  assert.deepEqual(line.segments.map((s) => s.col), [9, 10, 11]);
  const left = getWallLine({ ...geometry, anchor: c, finger: { x: c.x - 50 * 34, y: c.y } });
  assert.deepEqual(left.segments.map((s) => s.col), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  const top = centerOf(v(0, 1));
  const up = getWallLine({ ...geometry, anchor: top, finger: { x: top.x, y: top.y - 99 * 34 } });
  assert.deepEqual(up.segments, [v(0, 1), v(0, 0)]);
});

test("cizgi: en fazla arena kenari uzunlugu ve sunucu siniri", () => {
  assert.equal(getWallLineMaxLength("horizontal", board), 12);
  assert.equal(getWallLineMaxLength("vertical", board), 18);
  const c = centerOf(h(0, 3));
  const full = getWallLine({ ...geometry, anchor: c, finger: { x: c.x + 999 * 34, y: c.y } });
  assert.equal(full.segments.length, 12);
  const capped = getWallLine({ ...geometry, anchor: c, finger: { x: c.x + 999 * 34, y: c.y }, maxPieces: 5 });
  assert.equal(capped.segments.length, 5);
  // Cok genis bir tahtada sunucu siniri devreye girer.
  const wide = getWallLine({ gridSize: 34, origin: { x: 0, y: 0 }, board: { cols: 80, rows: 80 }, anchor: { x: 17, y: 0 }, finger: { x: 99999, y: 0 } });
  assert.equal(wide.segments.length, WALL_LINE_SERVER_MAX_PIECES);
});

test("cizgi: capanin yonu eksenle uyusmuyorsa cizgi capanin merkezinden gecen cizgiye oturur", () => {
  // Dikey capa (4,5): merkez (4, 5.5). Yatay surukleme: satir cizgisi 6, baslangic sutunu 4.
  const c = centerOf(v(4, 5));
  const line = getWallLine({ ...geometry, anchor: c, finger: { x: c.x + 2 * 34, y: c.y } });
  assert.equal(line.axis, "horizontal");
  assert.deepEqual(line.segments, [h(4, 6), h(5, 6), h(6, 6)]);
});

test("tutamac cizgisi: eksen zorunlu, parmak eksene indirilir, geri giden kisim capaya sabitlenir", () => {
  // Kurulu duvar h(5,7); sagdaki ilk bos kenar h(6,7) capa.
  const anchor = centerOf(h(6, 7));
  const dragged = { x: anchor.x + 2 * 34, y: anchor.y + 300 };
  const finger = constrainWallHandleFinger(anchor, dragged, "horizontal", 1);
  assert.deepEqual(finger, { x: dragged.x, y: anchor.y }, "dikey sapma eksene yansitilmadi");
  const line = getWallLine({ ...geometry, anchor, finger, axis: "horizontal" });
  assert.deepEqual(line.segments, [h(6, 7), h(7, 7), h(8, 7)]);
  // Eksen zorlanmasaydi dikey secilirdi.
  assert.equal(getWallLine({ ...geometry, anchor, finger: dragged }).axis, "vertical");
  // Duvarin icine (ters yone) giden parmak capaya sabitlenir: tek parca.
  const back = constrainWallHandleFinger(anchor, { x: anchor.x - 3 * 34, y: anchor.y }, "horizontal", 1);
  assert.deepEqual(back, anchor);
  assert.deepEqual(getWallLine({ ...geometry, anchor, finger: back, axis: "horizontal" }).segments, [h(6, 7)]);
  // Eksi yon ve dikey eksen.
  const left = centerOf(h(4, 7));
  const leftFinger = constrainWallHandleFinger(left, { x: left.x - 34, y: left.y - 9 }, "horizontal", -1);
  assert.deepEqual(getWallLine({ ...geometry, anchor: left, finger: leftFinger, axis: "horizontal" }).segments, [h(4, 7), h(3, 7)]);
  const top = centerOf(v(3, 4));
  const topFinger = constrainWallHandleFinger(top, { x: top.x + 40, y: top.y - 2 * 34 }, "vertical", -1);
  const up = getWallLine({ ...geometry, anchor: top, finger: topFinger, axis: "vertical" });
  assert.deepEqual(up.segments, [v(3, 4), v(3, 3), v(3, 2)]);
  // Hareketsiz tutamac (parmak capa uzerinde) yalnizca capayi verir, yon fark etmez.
  assert.deepEqual(getWallLine({ ...geometry, anchor: top, finger: top, axis: "vertical" }).segments, [v(3, 4)]);
  // Tahta kenarinda kirpilir.
  const edge = centerOf(h(11, 7));
  assert.deepEqual(getWallLine({ ...geometry, anchor: edge, finger: { x: edge.x + 999, y: edge.y }, axis: "horizontal" }).segments, [h(11, 7)]);
});

test("bedel: gecerli parca sayisi x birim; altin kadar parca alinir, geri kalani altin yuzunden atlanir", () => {
  assert.equal(getWallLineCost(4, 20), 80);
  assert.equal(getWallLineCost(0, 20), 0);
  assert.equal(getAffordableWallPieces(79, 20), 3);
  assert.equal(getAffordableWallPieces(80, 20), 4);
  assert.equal(getAffordableWallPieces(5, 20), 0);
  const pieces = [{ id: 1, valid: true }, { id: 2, valid: false }, { id: 3, valid: true }, { id: 4, valid: true }];
  const picked = pickAffordableWallPieces(pieces, 2);
  assert.deepEqual(picked.placed.map((p) => p.id), [1, 3], "gecersiz parca altin harcamamali");
  assert.equal(picked.skippedForGold, 1);
});

test("serbest uclar: dizinin iki ucundaki siradaki kenar; tahta kenarinda uc yok", () => {
  const key = (s) => `${s.orientation}:${s.col}:${s.row}`;
  const run = new Set([h(3, 4), h(4, 4), h(5, 4)].map(key));
  const ends = getWallRunEnds(h(4, 4), run, board);
  assert.deepEqual(ends.map((e) => [e.direction, e.segment, e.next]), [
    [-1, h(3, 4), h(2, 4)],
    [1, h(5, 4), h(6, 4)]
  ]);
  const wall = new Set([h(0, 4), h(1, 4)].map(key));
  assert.deepEqual(getWallRunEnds(h(0, 4), wall, board).map((e) => e.direction), [1]);
  // Farkli cizgideki ya da yonde duvar diziye katilmaz.
  assert.equal(getWallRunEnds(h(4, 4), new Set([key(h(4, 4)), key(h(5, 5)), key(v(5, 4))]), board).length, 2);
});

// -------------------------------------------------------------------- sunucu

MatchRoom.maxConcurrentRooms = 1000;

let roomCounter = 0;
function fakeClient(sessionId) {
  const client = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { client.sent.push({ type, payload }); } };
  return client;
}

async function realRoom() {
  const room = new MatchRoom();
  room.roomId = `duvar-cizgisi-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  await room.onCreate({ roomName: "Test", mapScale: 1 });
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

/**
 * Operator bedenleri cizgiyi ucarak orer: bedel komutta ayriliyor, parcalar
 * beden hat boyunca gectikce kuruluyor. Gercek tick yolu, saat ilerletiliyor.
 */
function arrive(room) {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    const busy = () => [...room.operatorBodies.values()].some((body) => body.tasks.length > 0);
    for (let step = 0; step < 2000 && busy(); step += 1) {
      now += 50;
      room.updateOperatorBodies(0.05, 0.04);
    }
    assert.equal(busy(), false, "beden isini bitirmedi");
  } finally {
    Date.now = realNow;
  }
}

async function startedRoom(characters = ["warrior", "zeynep"]) {
  const room = await realRoom();
  const clients = characters.map((characterId, index) => joinClient(room, `p${index + 1}`, { characterId }));
  for (const client of clients) handlerOf(room, "lobby:setReady")(client, { ready: true });
  handlerOf(room, "lobby:start")(clients[0]);
  assert.equal(room.gameStarted, true);
  // Bolgeler rastgele; her test kendi bolgesini kuruyor.
  room.buildZones = undefined;
  return { room, clients };
}

const unit = getTowerBuildCost(wallTower.cost);

function roomEdge(room, segment) {
  return getWallSegmentCenter(segment, { gridSize: getMapGridSize(room.activeMap), origin: getMapOrigin(room.activeMap) });
}

function lineMessage(room, from, to) {
  const a = roomEdge(room, from);
  const b = roomEdge(room, to);
  return { definitionId: WALL_TOWER_ID, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

const walls = (room, sessionId) => [...room.towers.values()].filter((t) => t.ownerId === sessionId && t.definition.id === WALL_TOWER_ID);
const wallCols = (room, sessionId) => walls(room, sessionId).map((t) => Math.round((t.x - getMapOrigin(room.activeMap).x) / getMapGridSize(room.activeMap) - 0.5)).sort((x, y) => x - y);
const types = (client, type) => client.sent.filter((m) => m.type === type);

test("wall:line kurali var ve kova tekli yerlestirmeden dar", () => {
  const rule = MESSAGE_RULES["wall:line"];
  assert.equal(rule.phase, "match");
  assert.deepEqual(rule.fields, { definitionId: "string", x1: "number", y1: "number", x2: "number", y2: "number", axis: "string" });
  assert.ok(rule.rate.burst <= (MESSAGE_RULES.placeTower.rate?.burst ?? 40));
});

test("wall:line capadan disari tum gecerli parcalari kurar ve altini keser", async () => {
  const { room, clients: [a] } = await startedRoom();
  try {
    room.state.players.get("p1").gold = 100_000;
    const before = room.state.players.get("p1").gold;
    a.sent = [];
    handlerOf(room, "wall:line")(a, lineMessage(room, h(2, 9), h(7, 9)));
    // Bedel komut aninda ayrildi; parcalar beden gectikce kuruluyor.
    assert.equal(room.state.players.get("p1").gold, before - 6 * unit);
    assert.equal(walls(room, "p1").length, 0, "beden varmadan duvar kuruldu");
    assert.equal(types(a, "wall:line-result").length, 0);
    arrive(room);
    assert.deepEqual(wallCols(room, "p1"), [2, 3, 4, 5, 6, 7]);
    assert.equal(room.state.players.get("p1").gold, before - 6 * unit);
    const [result] = types(a, "wall:line-result");
    assert.deepEqual(result.payload, { requested: 6, placed: 6, skipped: 0, skippedZone: 0, skippedBlocked: 0, skippedGold: 0 });
    assert.equal(types(a, "placement:rejected").length, 0);
    // Tek mesajda cok parca: tekli mesaj yok, yalnizca bir ozet.
    assert.equal(a.sent.length, 1);
  } finally {
    cleanup(room);
  }
});

test("wall:line dolu kenari atlar, arkasini kurmaya devam eder", async () => {
  const { room, clients: [a] } = await startedRoom();
  try {
    room.state.players.get("p1").gold = 100_000;
    const spot = roomEdge(room, h(5, 9));
    room.placeTower(a, { x: spot.x, y: spot.y, definitionId: WALL_TOWER_ID });
    assert.deepEqual(wallCols(room, "p1"), [5]);
    a.sent = [];
    handlerOf(room, "wall:line")(a, lineMessage(room, h(3, 9), h(8, 9)));
    arrive(room);
    assert.deepEqual(wallCols(room, "p1"), [3, 4, 5, 6, 7, 8]);
    assert.equal(walls(room, "p1").length, 6, "dolu kenara ikinci duvar kuruldu");
    assert.deepEqual(types(a, "wall:line-result")[0].payload, { requested: 6, placed: 5, skipped: 1, skippedZone: 0, skippedBlocked: 1, skippedGold: 0 });
  } finally {
    cleanup(room);
  }
});

test("wall:line yasak bolge parcasini atlar; hepsi bolgedeyse neden anahtariyla reddeder", async () => {
  const { room, clients: [a] } = await startedRoom();
  try {
    room.state.players.get("p1").gold = 100_000;
    const { cols, rows } = room.activeMap;
    room.buildZones = { cols, rows, cells: [9 * cols + 5] };
    handlerOf(room, "wall:line")(a, lineMessage(room, h(3, 9), h(7, 9)));
    arrive(room);
    assert.deepEqual(wallCols(room, "p1"), [3, 4, 6, 7], "bolgeye degen parca (5,9) kuruldu");
    assert.deepEqual(types(a, "wall:line-result")[0].payload.skippedZone, 1);
    assert.equal(types(a, "placement:rejected").length, 0, "kismen kurulan cizgi ret gostermemeli");

    // Tek parcalik cizgi, tamami bolgede: ret + neden.
    a.sent = [];
    handlerOf(room, "wall:line")(a, lineMessage(room, h(5, 9), h(5, 9)));
    const [rejection] = types(a, "placement:rejected");
    assert.deepEqual(rejection.payload, { message: SERVER_TEXT["placement.forbiddenZone"], key: "placement.forbiddenZone" });
    assert.equal(walls(room, "p1").length, 4);
  } finally {
    cleanup(room);
  }
});

test("wall:line altin bitince durur; hicbiri kurulamazsa altin anahtariyla reddeder", async () => {
  const { room, clients: [a] } = await startedRoom();
  try {
    const player = room.state.players.get("p1");
    player.gold = unit * 3 + unit - 1;
    handlerOf(room, "wall:line")(a, lineMessage(room, h(1, 5), h(8, 5)));
    // Yalnizca yeten uc parcanin bedeli ayrildi: beden yoldayken harcanamaz.
    assert.equal(player.gold, unit - 1);
    arrive(room);
    assert.deepEqual(wallCols(room, "p1"), [1, 2, 3], "capadan disari ilk uc parca");
    assert.equal(player.gold, unit - 1);
    const result = types(a, "wall:line-result")[0].payload;
    assert.equal(result.placed, 3);
    assert.equal(result.skippedGold, 5);

    a.sent = [];
    handlerOf(room, "wall:line")(a, lineMessage(room, h(1, 7), h(4, 7)));
    assert.equal(walls(room, "p1").length, 3);
    assert.deepEqual(types(a, "placement:rejected")[0].payload, { message: SERVER_TEXT["placement.lineNoGold"], key: "placement.lineNoGold" });
  } finally {
    cleanup(room);
  }
});

test("wall:line en fazla arena kenari kadar parca kurar (yatay 12, dikey 18)", async () => {
  const { room, clients: [a] } = await startedRoom();
  try {
    room.state.players.get("p1").gold = 100_000;
    const { cols, rows } = room.activeMap;
    handlerOf(room, "wall:line")(a, lineMessage(room, h(0, 4), h(cols, 4)));
    arrive(room);
    assert.equal(walls(room, "p1").length, cols);
    const g = getMapGridSize(room.activeMap);
    const far = roomEdge(room, v(2, 0));
    handlerOf(room, "wall:line")(a, { definitionId: WALL_TOWER_ID, x1: far.x, y1: far.y, x2: far.x, y2: far.y + 500 * g });
    arrive(room);
    assert.equal(walls(room, "p1").length, cols + rows);
  } finally {
    cleanup(room);
  }
});

test("wall:line tutamac cizgisi: axis alani ekseni zorlar, gecersiz axis yok sayilir", async () => {
  const { room, clients: [a] } = await startedRoom();
  try {
    room.state.players.get("p1").gold = 100_000;
    const g = getMapGridSize(room.activeMap);
    // Kurulu duvar v(3,4); tutamac altindaki ilk bos kenar v(3,5). Parmak eksene indirilmis.
    const anchor = roomEdge(room, v(3, 5));
    handlerOf(room, "wall:line")(a, { definitionId: WALL_TOWER_ID, x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y + 2 * g, axis: "vertical" });
    arrive(room);
    const spots = walls(room, "p1").map((t) => [t.orientation, Math.round((t.x - getMapOrigin(room.activeMap).x) / g), Math.round((t.y - getMapOrigin(room.activeMap).y) / g - 0.5)]);
    assert.deepEqual(spots.sort((x, y) => x[2] - y[2]), [["vertical", 3, 5], ["vertical", 3, 6], ["vertical", 3, 7]]);
    // Bozuk axis yok sayilir: parmak hareketsizken esitlikte yatay eksen secilir ve capa yeniden yorumlanir.
    const before = walls(room, "p1").length;
    const other = roomEdge(room, h(8, 12));
    handlerOf(room, "wall:line")(a, { definitionId: WALL_TOWER_ID, x1: other.x, y1: other.y, x2: other.x + g, y2: other.y, axis: "diagonal" });
    arrive(room);
    assert.equal(walls(room, "p1").length, before + 2);
  } finally {
    cleanup(room);
  }
});

test("wall:line yalnizca duvar kurar: kule ve Abarti kimligi reddedilir", async () => {
  const { room, clients: [a, b] } = await startedRoom();
  try {
    room.state.players.get("p1").gold = 100_000;
    room.state.players.get("p2").gold = 100_000;
    const message = lineMessage(room, h(2, 9), h(6, 9));
    handlerOf(room, "wall:line")(a, { ...message, definitionId: "warrior-1" });
    handlerOf(room, "wall:line")(a, { ...message, definitionId: "zeynep-8" });
    handlerOf(room, "wall:line")(a, { ...message, definitionId: "yok-boyle-bir-sey" });
    handlerOf(room, "wall:line")(b, { ...message, definitionId: "zeynep-8" });
    arrive(room);
    assert.equal(room.towers.size, 0);
    // Her karakter duvari kurabilir.
    handlerOf(room, "wall:line")(b, message);
    arrive(room);
    assert.equal(walls(room, "p2").length, 5);
  } finally {
    cleanup(room);
  }
});

test("wall:line bozuk govdeyi sessizce yutar, sahibi olmayan istemci kuramaz", async () => {
  const { room, clients: [a] } = await startedRoom();
  try {
    room.state.players.get("p1").gold = 100_000;
    const good = lineMessage(room, h(2, 9), h(6, 9));
    const send = handlerOf(room, "wall:line");
    for (const bad of [undefined, null, "metin", 7, [], {}, { ...good, x1: Number.NaN }, { ...good, y2: Number.POSITIVE_INFINITY }, { ...good, x2: "7" }, { definitionId: WALL_TOWER_ID }]) {
      send(a, bad);
    }
    assert.equal(room.towers.size, 0);
    // Oyuncu olmayan (ya da ayrilmis) oturum.
    const stranger = fakeClient("yabanci");
    send(stranger, good);
    assert.equal(room.towers.size, 0);
    assert.equal(stranger.sent.length, 0);
    // Baskasinin altini harcanmadi.
    assert.equal(room.state.players.get("p1").gold, 100_000);
  } finally {
    cleanup(room);
  }
});

test("wall:line yalnizca macta calisir", async () => {
  const room = await realRoom();
  try {
    const a = joinClient(room, "p1", { characterId: "warrior" });
    assert.equal(room.gameStarted, false);
    room.state.players.get("p1").gold = 100_000;
    handlerOf(room, "wall:line")(a, lineMessage(room, h(2, 9), h(6, 9)));
    assert.equal(room.towers.size, 0);
    assert.equal(a.sent.filter((m) => m.type === "wall:line-result").length, 0);
    // Dogrudan cagri da mac baslamadan kurmaz.
    room.placeWallLine(a, lineMessage(room, h(2, 9), h(6, 9)));
    assert.equal(room.towers.size, 0);
  } finally {
    cleanup(room);
  }
});

test("wall:line hiz siniri: kova asilinca mesaj dusuyor", async () => {
  const { room, clients: [a, b] } = await startedRoom();
  const realNow = Date.now;
  let now = 5_000_000;
  Date.now = () => now;
  try {
    room.state.players.get("p1").gold = 1_000_000;
    room.state.players.get("p2").gold = 1_000_000;
    const send = handlerOf(room, "wall:line");
    const burst = MESSAGE_RULES["wall:line"].rate.burst;
    for (let row = 0; row < burst + 6; row += 1) send(a, lineMessage(room, h(0, row), h(0, row)));
    arrive(room);
    assert.equal(walls(room, "p1").length, burst);
    // Kova istemci basina.
    send(b, lineMessage(room, h(0, 17), h(0, 17)));
    arrive(room);
    assert.equal(walls(room, "p2").length, 1);
    now += 1000;
    send(a, lineMessage(room, h(1, 17), h(1, 17)));
    arrive(room);
    assert.ok(walls(room, "p1").length > burst, "kova zamanla dolmadi");
  } finally {
    Date.now = realNow;
    cleanup(room);
  }
});

test("tekli duvar mesaji degismedi: placeTower bir duvar kurar, ret mesaji gonderir", async () => {
  const { room, clients: [a] } = await startedRoom();
  try {
    room.state.players.get("p1").gold = 100_000;
    const spot = roomEdge(room, h(4, 9));
    room.placeTower(a, { x: spot.x, y: spot.y, definitionId: WALL_TOWER_ID });
    assert.deepEqual(wallCols(room, "p1"), [4]);
    const { cols, rows } = room.activeMap;
    room.buildZones = { cols, rows, cells: [9 * cols + 8] };
    const zone = roomEdge(room, h(8, 9));
    room.placeTower(a, { x: zone.x, y: zone.y, definitionId: WALL_TOWER_ID });
    assert.equal(walls(room, "p1").length, 1);
    assert.equal(types(a, "placement:rejected")[0].payload.key, "placement.forbiddenZone");
  } finally {
    cleanup(room);
  }
});
