/**
 * Gec oyun sunucu performansi: davranisi degistirmeyen hizlandirmalar.
 *
 * Olcum (`tools/bench-late-game.mjs`, dort oyuncu, 78 kule, dalga 20): tick
 * ortalamasi ~6 ms, p99 ~21-24 ms; istemci basina 229 KB/sn. En sicak nokta
 * kule modifier listesinin her cagrida katalog taramasiyla yeniden kurulmasiydi,
 * telin en buyuk kalemi ise her karede tam giden oyuncu bolumu.
 *
 * Buradaki testler hizlandirmalarin **ayni cevabi** verdigini tutuyor; hizin
 * kendisi olcum aracinda. Mac boyu birebir aynilik (dusman cani, oldurme,
 * altin, istemcinin gordugu dunya) aracin `--verify` kipiyle sinaniyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { unpack } from "@colyseus/msgpackr";
import { getMessageBytes, Protocol } from "colyseus";
import { MatchRoom, wireValueEquals } from "../apps/server/dist/rooms/MatchRoom.js";
import { getMapGridSize, mergeDynamicRecordSnapshots } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

test("tel karsilastirmasi JSON metniyle birebir ayni cevabi veriyor", () => {
  const values = [
    0, -0, 1, 1.5, NaN, Infinity, -Infinity, null, undefined, "", "a", "1", true, false,
    [], [1, 2], [1, 2, 3], ["a"], [null], [undefined], [NaN], { a: 1 }, { a: 1, b: undefined }, { a: 2 }, [{ a: 1 }]
  ];
  const shared = [1, 2];
  values.push(shared, shared.slice());
  for (const a of values) {
    for (const b of values) {
      assert.equal(wireValueEquals(a, b), JSON.stringify(a) === JSON.stringify(b), `${String(a)} / ${String(b)}`);
    }
  }
});

test("oyuncu ve isci kayitlari delta: degismeyen yalnizca kimlik, birlestirme tam kaydi veriyor", () => {
  const room = new MatchRoom();
  const player = { id: "p1", name: "A", gold: 100, ownedShopItemIds: ["x", "y"], shopOffers: [{ id: "o1" }], noAirDefense: true };
  const drone = { id: "d1", mode: "ammoTransport", x: 10, y: 20, ownerId: "p1", skillIds: [] };
  const frame = (players, drones) => ({ towers: [], enemies: [], players, drones });

  const first = room.applyWireDelta(frame([player], [drone]));
  assert.deepEqual(first.wire.players, [player], "ilk kare tam");
  room.commitWireBaseline(first.towerBaseline, first.enemyBaseline, first.extraBaselines);

  const moved = { ...drone, x: 12 };
  const changed = { ...player, gold: 140, ownedShopItemIds: [...player.ownedShopItemIds], noAirDefense: undefined };
  delete changed.shopOffers;
  const second = room.applyWireDelta(frame([changed], [moved]));
  assert.deepEqual(second.wire.players, [{ id: "p1", gold: 140, noAirDefense: undefined, shopOffers: null }]);
  assert.deepEqual(second.wire.drones, [{ id: "d1", x: 12 }]);

  // Istemci: ilk kare + delta = ikinci karenin tam hali.
  const players = new Map();
  const drones = new Map();
  mergeDynamicRecordSnapshots(players, first.wire.players);
  mergeDynamicRecordSnapshots(drones, first.wire.drones);
  assert.deepEqual(mergeDynamicRecordSnapshots(players, second.wire.players), [changed]);
  assert.deepEqual(mergeDynamicRecordSnapshots(drones, second.wire.drones), [moved]);
});

test("iki parametreli taban yazimi (eski cagiranlar) oyuncu bolumunu tam birakir", () => {
  const room = new MatchRoom();
  const player = { id: "p1", gold: 1 };
  const first = room.applyWireDelta({ towers: [], enemies: [], players: [player], drones: [] });
  room.commitWireBaseline(first.towerBaseline, first.enemyBaseline);
  const second = room.applyWireDelta({ towers: [], enemies: [], players: [player], drones: [] });
  assert.deepEqual(second.wire.players, [player]);
});

test("snapshot cesit basina bir kez kodlaniyor; tabanla ayni olmayana isaretli tam kare gidiyor", () => {
  const room = new MatchRoom();
  const received = new Map();
  const rawClient = (sessionId) => ({
    sessionId,
    ref: { bufferedAmount: 0 },
    send() { throw new Error("ham yol beklendi"); },
    enqueueRaw(bytes) { received.set(sessionId, bytes); }
  });
  room.clients.push(rawClient("a"), rawClient("b"), rawClient("c"), rawClient("eski-1"), rawClient("eski-2"));
  room.towerWireNeedsFullResend = false;
  for (const sessionId of ["a", "b", "eski-1", "eski-2"]) room.wireSyncedSessionIds.add(sessionId);
  // a, b ve c oyuncu/isci deltasini anliyor; "eski-*" bildirmedi (eski istemci).
  for (const sessionId of ["a", "b", "c"]) room.wireDeltaSessionIds.add(sessionId);
  let encodes = 0;
  const encode = getMessageBytes.raw;
  getMessageBytes.raw = (...args) => { encodes += 1; return encode(...args); };

  const delta = { serverTime: 1, towers: [{ id: "t" }], enemies: [], players: [{ id: "p" }], drones: [{ id: "d" }] };
  const full = { serverTime: 1, towers: [{ id: "t", range: 5 }], enemies: [], players: [{ id: "p", gold: 3 }], drones: [{ id: "d", x: 4 }] };
  try {
    assert.equal(room.sendSnapshotWithBackpressure(delta, full), true);
  } finally {
    getMessageBytes.raw = encode;
  }

  assert.equal(encodes, 3, "cesit basina bir kodlama (delta, eski istemci deltasi, tam)");
  assert.equal(received.get("a"), received.get("b"), "ayni cesit ayni tampondan");
  assert.equal(received.get("eski-1"), received.get("eski-2"), "eski istemci cesidi de bir kez kodlaniyor");
  const expected = getMessageBytes.raw(Protocol.ROOM_DATA, "snapshot", delta);
  assert.deepEqual(Buffer.from(received.get("a")), Buffer.from(expected), "client.send ile ayni bayt");
  const decode = (bytes) => unpack(bytes.subarray(2 + (bytes[1] & 0x1f)));
  assert.equal(decode(received.get("a")).wireFull, undefined);
  const fullFrame = decode(received.get("c"));
  assert.equal(fullFrame.wireFull, true);
  assert.deepEqual(fullFrame.towers, full.towers);
  assert.equal(full.wireFull, undefined, "gonderilen tam kare nesnesi degistirilmiyor");
  // Eski istemci: kule deltasi, oyuncu ve isci tam; tam kare isareti yok.
  const legacyFrame = decode(received.get("eski-1"));
  assert.deepEqual(legacyFrame.towers, delta.towers);
  assert.deepEqual(legacyFrame.players, full.players);
  assert.deepEqual(legacyFrame.drones, full.drones);
  assert.equal(legacyFrame.wireFull, undefined);
  assert.deepEqual(delta.players, [{ id: "p" }], "delta karesi degistirildi");
});

test("eski istemci yoksa eski cesit kurulmuyor ve kodlanmiyor", () => {
  const room = new MatchRoom();
  const received = [];
  room.clients.push({ sessionId: "a", ref: { bufferedAmount: 0 }, send() {}, enqueueRaw(bytes) { received.push(bytes); } });
  room.towerWireNeedsFullResend = false;
  room.wireSyncedSessionIds.add("a");
  room.wireDeltaSessionIds.add("a");
  let encodes = 0;
  const encode = getMessageBytes.raw;
  getMessageBytes.raw = (...args) => { encodes += 1; return encode(...args); };
  try {
    room.sendSnapshotWithBackpressure({ towers: [], enemies: [], players: [{ id: "p" }] }, { towers: [], enemies: [], players: [{ id: "p", gold: 1 }] });
  } finally {
    getMessageBytes.raw = encode;
  }
  assert.equal(encodes, 1);
  assert.equal(received.length, 1);
});

test("snapshot oyuncu ve isci kayitlari canli dizileri paylasmiyor: yerinde eklenen beceri delta olarak gidiyor", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  // Eski kayit bicimi: beceri listesi sayilabilir alan (yerinde buyutuluyor).
  const hired = { role: "ammoTransport", id: "worker-legacy", skillIds: [] };
  player.hiredWorkers.push(hired);
  room.drones.set("d1", { id: "d1", mode: "ammoTransport", x: 0, y: 0, ownerId: "p1", cargo: 0, capacity: 1, speed: 1, skillIds: ["a"] });
  const snapshot = room.getSnapshot();
  const wirePlayer = snapshot.players.find((entry) => entry.id === "p1");
  const wireHired = wirePlayer.hiredWorkers.find((worker) => worker.id === "worker-legacy");
  assert.notEqual(wireHired.skillIds, hired.skillIds, "beceri listesi paylasiliyor");
  assert.notEqual(snapshot.drones.find((drone) => drone.id === "d1").skillIds, room.drones.get("d1").skillIds);
  // Hicbir nesne/dizi alani canli kaydi paylasmiyor.
  const live = [[wirePlayer, player], ...snapshot.drones.map((drone) => [drone, room.drones.get(drone.id)])];
  for (const [record, source] of live) {
    for (const [key, value] of Object.entries(record)) {
      if (value && typeof value === "object") assert.notEqual(value, source[key], `${record.id}.${key} canli nesneyi paylasiyor`);
    }
  }
  wirePlayer.hiredWorkers.forEach((worker, index) => {
    assert.notEqual(worker, player.hiredWorkers[index]);
    if (worker.skillIds) assert.notEqual(worker.skillIds, player.hiredWorkers[index].skillIds);
  });

  // Taban yazildiktan sonra beceri yerinde ekleniyor (`chooseWorkerSkill` gibi).
  const first = room.applyWireDelta(snapshot);
  room.commitWireBaseline(first.towerBaseline, first.enemyBaseline, first.extraBaselines);
  hired.skillIds.push("hizli-tasima");
  const second = room.applyWireDelta(room.getSnapshot());
  const delta = second.wire.players.find((entry) => entry.id === "p1");
  assert.ok(delta.hiredWorkers, "yerinde eklenen beceri deltada yok");
  assert.deepEqual(delta.hiredWorkers.find((worker) => worker.id === "worker-legacy").skillIds, ["hizli-tasima"]);

  // Kiralama yolunun gizli (sayilamaz) alanlari telde eskisi gibi yok.
  const hidden = { role: "repair" };
  Object.defineProperties(hidden, {
    id: { value: "worker-gizli", writable: true, configurable: true, enumerable: false },
    skillIds: { value: ["x"], writable: true, configurable: true, enumerable: false }
  });
  player.hiredWorkers.push(hidden);
  const wireHidden = room.getSnapshot().players.find((entry) => entry.id === "p1").hiredWorkers.at(-1);
  assert.deepEqual(wireHidden, { role: "repair" });
});

test("onbellekten donen modifier listeleri dondurulmus ve salt okunur tipli", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /type FrozenRunModifiers = readonly Modifier\[\];/);
  for (const name of ["getTowerRunModifiers", "getTowerStaticRunModifiers", "getWorkerModifiers"]) {
    assert.match(source, new RegExp(`private ${name}\\([^)]*\\): FrozenRunModifiers \\{`), `${name} salt okunur degil`);
  }
  assert.equal(/as (unknown as )?RunModifiers/.test(source), false, "dondurulmus liste yine degisebilir diye isaretleniyor");
  const room = createRoom("warrior");
  const worker = { id: "w", ownerId: "p1", mode: "ammoTransport", x: 0, y: 0 };
  assert.ok(Object.isFrozen(room.getWorkerModifiers(worker)));
});

test("kule modifier onbellegi: tekrar kullaniliyor, liste degisince tazeleniyor, dondurulmus", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  const player = room.state.players.get("p1");

  const first = room.getTowerStaticRunModifiers(tower);
  assert.equal(room.getTowerStaticRunModifiers(tower), first, "ayni girdi, ayni liste");
  assert.ok(Object.isFrozen(first));

  const playerMod = { source: "card:namlu-asinmasi", scope: "player", stat: "damage", add: 0.25 };
  player.runModifiers.push(playerMod);
  const afterPush = room.getTowerStaticRunModifiers(tower);
  assert.notEqual(afterPush, first);
  assert.ok(afterPush.includes(playerMod), "yerinde eklenen oyuncu modifieri gorulmedi");

  const towerMod = { source: "shop:x", scope: "tower", stat: "range", add: 0.1 };
  tower.runModifiers = [...tower.runModifiers, towerMod];
  assert.ok(room.getTowerStaticRunModifiers(tower).includes(towerMod), "yeni kule listesi gorulmedi");

  player.runModifiers = [];
  assert.equal(room.getTowerStaticRunModifiers(tower).includes(playerMod), false, "degistirilen oyuncu listesi gorulmedi");
});

test("isci modifier onbellegi: oyuncu listesi degisince tazeleniyor", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  const worker = { id: "w", ownerId: "p1", mode: "ammoTransport", x: 0, y: 0 };
  const before = room.getWorkerModifiers(worker);
  const speed = { source: "card:yok", scope: "player", stat: "workerSpeed", add: 0.5 };
  player.runModifiers.push(speed);
  assert.notEqual(room.getWorkerModifiers(worker), before);
  assert.ok(room.getWorkerModifiers(worker).includes(speed));
});

test("sifir carpanli en kisa menzil menzil hesabina girmiyor", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  let rangeCalls = 0;
  const range = room.getTowerRange.bind(room);
  room.getTowerRange = (target) => {
    rangeCalls += 1;
    return range(target);
  };
  assert.equal(room.getTowerMinimumRange(tower), 0);
  assert.equal(rangeCalls, 0);
});

test("isci aramasi: dizi indeksli arama anahtarli aramayla ayni adimi buluyor", () => {
  const room = createRoom("warrior");
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const { cols, rows } = room.activeMap;
  for (let index = 0; index < 40; index += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    if (spot) room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: "warrior-1" }, { free: true, ignoreLimit: true });
  }
  room.workerBannedCells.set("p1", new Set(["3:4", "4:4", "5:7"]));
  const towers = [...room.towers.values()];
  let found = 0;
  for (let trial = 0; trial < 300; trial += 1) {
    const worker = {
      id: "w", ownerId: trial % 3 === 0 ? "p1" : "", mode: trial % 2 ? "ammoTransport" : "energyTransport",
      logisticsPhase: trial % 4 === 0 ? "deliver" : "pickup",
      targetTowerId: towers[Math.floor(random() * towers.length)]?.id
    };
    const start = { col: Math.floor(random() * cols), row: Math.floor(random() * rows) };
    const goal = { col: Math.floor(random() * cols), row: Math.floor(random() * rows) };
    const goalOpen = random() < 0.5;
    const step = room.searchWorkerStep(worker, start, goal, goalOpen);
    assert.deepEqual(step, room.searchWorkerStepByKey(worker, start, goal, goalOpen), `deneme ${trial}`);
    if (step) found += 1;
  }
  assert.ok(found > 100, `aramalarin cogu yol bulmali (${found})`);
  // Harita disi baslangic eski yola dusuyor.
  assert.deepEqual(room.searchWorkerStep({ id: "w" }, { col: -1, row: 2 }, { col: 2, row: 2 }, true),
    room.searchWorkerStepByKey({ id: "w" }, { col: -1, row: 2 }, { col: 2, row: 2 }, true));
});

test("yerlesim onbellegi yalnizca tick icinde ve yerlesim degisince atiliyor", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  assert.equal(room.isTowerIsolated(tower), true);
  assert.equal(room.tickLayoutCache, undefined, "tick disinda onbellek yok");

  room.tickLayoutCache = { isolated: new Map(), synthesisGroups: new Map() };
  assert.equal(room.isTowerIsolated(tower), true);
  assert.equal(room.tickLayoutCache.isolated.get(tower), true);
  // Komsu kule: yerlesim degisti, onbellek tazelenmeli.
  const grid = getMapGridSize(room.activeMap);
  const neighbour = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
    .map(([dx, dy]) => ({ x: tower.x + dx * grid, y: tower.y + dy * grid }))
    .find((point) => room.canPlaceTower(point.x, point.y, "warrior-1"));
  assert.ok(neighbour, "komsu kare bulunamadi");
  room.placeTower({ sessionId: "p1" }, { ...neighbour, definitionId: "warrior-1" }, { free: true, ignoreLimit: true });
  assert.equal(room.towers.size, 2);
  assert.equal(room.tickLayoutCache.isolated.size, 0, "yerlesim degisince onbellek atilmadi");
  assert.equal(room.isTowerIsolated(tower), false, "eski yalnizlik cevabi kaldi");
  room.tickLayoutCache = undefined;
});

test("kule ozetleri ayni anda kurulsa da tazelenme evreleri yayiliyor", () => {
  const room = createRoom("warrior");
  for (let index = 0; index < 6; index += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    if (spot) room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: "warrior-1" }, { free: true, ignoreLimit: true });
  }
  for (const tower of room.towers.values()) room.getTowerInsight(tower);
  const phases = new Set([...room.towers.values()].map((tower) => room.towerInsightCache.get(tower).at));
  assert.equal(phases.size, room.towers.size, "butun ozetler ayni anda tazelenecek");
  for (const tower of room.towers.values()) {
    assert.ok(Date.now() - room.towerInsightCache.get(tower).at < 1000, "ilk ozet hemen tazelenmemeli");
  }
});

test("istemci tam karede delta onbelleklerini birakiyor (kaynak sozlesmesi)", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const hydrate = source.slice(source.indexOf("private hydrateSnapshot("), source.indexOf("private applyFullStaticSnapshot("));
  assert.match(hydrate, /if \(snapshot\.wireFull\) \{[^}]*dynamicPlayerSnapshots\.clear\(\);[^}]*\}/s);
  assert.match(hydrate, /mergeDynamicRecordSnapshots\(this\.dynamicPlayerSnapshots, snapshot\.players\)/);
  assert.match(hydrate, /mergeDynamicRecordSnapshots\(this\.dynamicDroneSnapshots, snapshot\.drones \?\? \[\]\)/);
});

