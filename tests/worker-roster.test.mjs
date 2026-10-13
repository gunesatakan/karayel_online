/**
 * Isci kadrosu (apps/web/src/worker-roster.ts): Isci cekmecesinin "Yonetim"
 * bolumunun saf mantigi.
 *
 * Kadro bir donem kendi yuzen paneliydi; oyuncuya ic kimlikleri ("crystal-1",
 * "ammo-source-1") gosteriyor, elle atanmamis isciyi de sahte bir kaynaga
 * atanmis gibi yaziyordu. Kilitlenen sozler:
 *   1. Elle atanmamis isci "Otomatik"; elle atanan okunur adla: kaynak turu ve
 *      sirasi ("Enerji kristali 2", "Barut yatağı 1"), binada kulenin adi.
 *      Ikisi de Turkce ve Ingilizce.
 *   2. Tukenmis kaynaga atama gitmiyor; yanlis bina da reddediliyor.
 *   3. Urun secimi yalnizca tasiyicida.
 *   4. Yuk ve kalan miktar yapi anahtarinda yok: yerinde yaziliyorlar, liste
 *      onlar icin yeniden kurulmuyor.
 *   5. Sunucu "otomatik"i tek bayrakla soyluyor, tukenmis kaynagi reddediyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_KINDS, SERVER_TEXT } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const web = await importWebModule("tests/fixtures/worker-roster-entry.ts");
web.installCatalogLocale();
const {
  buildWorkerRoster, describeWorkerRow, formatResourceNodeName, formatTransportProduct, formatWorkerCargo, formatWorkerReserve,
  getWorkerPickHint, getWorkerProductOptions, getWorkerRosterRole, getWorkerRosterStructureKey, isWorkerSourceTower,
  listResourceNodes, resolveWorkerMapTarget, setLocaleForTest, tr, en
} = web;

function inLocale(locale, run) {
  setLocaleForTest(locale);
  try {
    return run();
  } finally {
    setLocaleForTest("tr");
  }
}

// Sunucunun yolladigi bicim: uc enerji kristali, dort hammadde yatagi.
const crystalNodes = [
  { id: "crystal-1", remaining: 2000, x: 100, y: 100 },
  { id: "crystal-2", remaining: 0, x: 300, y: 100 },
  { id: "crystal-3", remaining: 812.6, x: 500, y: 100 }
];
const materialNodes = [
  { id: "ammo-source-1", kind: "gunpowder", remaining: 1500, x: 100, y: 300 },
  { id: "ammo-source-2", kind: "mystic", remaining: 2000, x: 300, y: 300 },
  { id: "ammo-source-3", kind: "plasma", remaining: 2000, x: 500, y: 300 },
  { id: "iron-1", kind: "iron", remaining: 2000, x: 700, y: 300 }
];
const nodes = listResourceNodes(crystalNodes, materialNodes);

const towers = new Map([
  ["reactor", { id: "reactor", name: "Enerji Reaktörü", definitionId: "warrior-8", ownerId: "p1", hp: 100, resourceProvider: "energy", x: 100, y: 500 }],
  ["factory", { id: "factory", name: "Mühimmat Deposu", definitionId: "warrior-7", ownerId: "p1", hp: 100, resourceProvider: "ammunition", x: 300, y: 500 }],
  ["depot", { id: "depot", name: "Tamir Merkezi", definitionId: "repair-depot-1", ownerId: "p1", hp: 100, x: 500, y: 500 }],
  ["turret", { id: "turret", name: "Debug Lazer", definitionId: "warrior-1", ownerId: "p1", hp: 100, x: 700, y: 500 }],
  ["theirs", { id: "theirs", name: "Enerji Reaktörü", definitionId: "warrior-8", ownerId: "p2", hp: 100, resourceProvider: "energy", x: 900, y: 500 }]
]);

const drone = (id, mode, extra = {}) => ({ id, mode, ownerId: "p1", x: 0, y: 0, hp: 60, maxHp: 60, cargo: 0, ...extra });
const roster = (drones, pick) => buildWorkerRoster({ drones, nodes, getTower: (id) => towers.get(id), ownerId: "p1", pick });
const describe = (row) => describeWorkerRow(row);

test("kaynaklar turune gore numarali; ic kimlik yerine okunur ad, iki dilde", () => {
  assert.deepEqual(nodes.map((node) => [node.id, node.kind, node.ordinal]), [
    ["crystal-1", "energy", 1], ["crystal-2", "energy", 2], ["crystal-3", "energy", 3],
    ["ammo-source-1", "gunpowder", 1], ["ammo-source-2", "mystic", 1], ["ammo-source-3", "plasma", 1], ["iron-1", "iron", 1]
  ]);
  assert.equal(formatResourceNodeName("energy", 1), "Enerji kristali 1");
  assert.equal(formatResourceNodeName("gunpowder", 2), "Barut yatağı 2");
  assert.equal(formatResourceNodeName("iron", 1), "Demir yatağı 1");
  inLocale("en", () => {
    assert.equal(formatResourceNodeName("energy", 1), "Energy crystal 1");
    assert.equal(formatResourceNodeName("gunpowder", 2), "Gunpowder deposit 2");
    assert.equal(formatResourceNodeName("mystic", 1), "Mystic essence deposit 1");
  });
  // Hicbir turde ic kimlik ya da bos ad cikmiyor.
  for (const locale of ["tr", "en"]) {
    inLocale(locale, () => {
      for (const kind of RESOURCE_KINDS) {
        const name = formatResourceNodeName(kind, 1);
        assert.match(name, /^\p{Lu}[\p{L} ]+ 1$/u, `${locale} ${kind}: ${name}`);
        assert.doesNotMatch(name, /crystal-|ammo-source|iron-|\{/);
      }
    });
  }
});

test("elle atanmamis isci Otomatik; sahte kaynak adi yok", () => {
  const { rows } = roster([
    drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-1" }, autoAssigned: true }),
    drone("g2", "crystalCollector", { assignment: { nodeId: "ammo-source-1" }, autoAssigned: true }),
    drone("c1", "energyTransport", { assignment: { product: "energy" }, autoAssigned: true }),
    drone("c2", "energyTransport", { assignment: { product: "bullet" }, autoAssigned: true }),
    drone("r1", "repairer", { assignment: { product: "energy" }, autoAssigned: true })
  ]);
  assert.deepEqual(rows.map((row) => [row.order, row.role, row.auto]), [
    [1, "gatherer", true], [2, "gatherer", true], [3, "carrier", true], [4, "carrier", true], [5, "repairer", true]
  ]);
  assert.deepEqual(rows.map((row) => describe(row)), [
    { title: "1. Toplama", detail: "Enerji kristali · Otomatik" },
    { title: "2. Toplama", detail: "Barut · Otomatik" },
    { title: "3. Taşıma", detail: "Enerji · Otomatik" },
    { title: "4. Taşıma", detail: "Kurşun · Otomatik" },
    { title: "5. Tamirci", detail: "Onarım parçası · Otomatik" }
  ]);
  inLocale("en", () => {
    assert.deepEqual(rows.map((row) => describe(row)), [
      { title: "1. Gatherer", detail: "Energy crystal · Automatic" },
      { title: "2. Gatherer", detail: "Gunpowder · Automatic" },
      { title: "3. Carrier", detail: "Energy · Automatic" },
      { title: "4. Carrier", detail: "Bullet · Automatic" },
      { title: "5. Repairer", detail: "Repair parts · Automatic" }
    ]);
  });
  for (const row of rows) assert.doesNotMatch(describe(row).detail, /crystal-1|ammo-source-1/);
});

test("elle atanan isci hedefini okunur adla yaziyor; kule adi Ingilizcede katalogdan", () => {
  const { rows } = roster([
    drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-3" }, cargo: 3.7 }),
    drone("g2", "crystalCollector", { assignment: { nodeId: "iron-1" }, advanced: true }),
    drone("c1", "energyTransport", { assignment: { sourceTowerId: "reactor", product: "energy" } }),
    drone("c2", "energyTransport", { assignment: { sourceTowerId: "factory", product: "materials" } }),
    drone("c3", "energyTransport", { assignment: { sourceTowerId: "sold", product: "auraCrystal" } }),
    drone("r1", "repairer", { assignment: { sourceTowerId: "depot" } })
  ]);
  assert.equal(rows.every((row) => !row.auto), true);
  assert.deepEqual(rows.map((row) => describe(row)), [
    { title: "1. Toplama", detail: "Enerji kristali 3" },
    { title: "2. Toplama · gelişmiş", detail: "Demir yatağı 1" },
    { title: "3. Taşıma", detail: "Enerji · Enerji Reaktörü" },
    { title: "4. Taşıma", detail: "Hammadde · Mühimmat Deposu" },
    { title: "5. Taşıma", detail: "Aura kristali · Bina yok" },
    { title: "6. Tamirci", detail: "Onarım parçası · Tamir Merkezi" }
  ]);
  inLocale("en", () => {
    assert.deepEqual(rows.map((row) => describe(row)), [
      { title: "1. Gatherer", detail: "Energy crystal 3" },
      { title: "2. Gatherer · advanced", detail: "Iron deposit 1" },
      { title: "3. Carrier", detail: "Energy · Energy Reactor" },
      { title: "4. Carrier", detail: "Raw material · Ammo Depot" },
      { title: "5. Carrier", detail: "Aura crystal · Building lost" },
      { title: "6. Repairer", detail: "Repair parts · Repair Depot" }
    ]);
  });
  // Canli sayilar: yuk asagi yuvarlanir, kalan yalnizca toplayicida.
  assert.equal(formatWorkerCargo(rows[0]), "Yük 3");
  assert.equal(formatWorkerReserve(rows[0]), "Kalan 812");
  assert.equal(formatWorkerReserve(rows[2]), "");
  inLocale("en", () => {
    assert.equal(formatWorkerCargo(rows[0]), "Cargo 3");
    assert.equal(formatWorkerReserve(rows[0]), "Remaining 812");
  });
});

test("kadroda yalnizca oyuncunun lojistik iscileri var", () => {
  const { rows } = roster([
    drone("mine", "crystalCollector", { assignment: { nodeId: "crystal-1" }, autoAssigned: true }),
    drone("theirs", "crystalCollector", { ownerId: "p2", assignment: { nodeId: "crystal-1" }, autoAssigned: true }),
    // Atakan ultisinin dronlari: cani yok, isci degil.
    drone("ult-attack", "attack", { maxHp: undefined }),
    drone("ult-repair", "repair", { maxHp: undefined })
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["mine"]);
  assert.equal(getWorkerRosterRole("ammoCollector"), "gatherer");
  assert.equal(getWorkerRosterRole("ammoTransport"), "carrier");
  assert.equal(getWorkerRosterRole("attack"), undefined);
});

test("tukenmis kaynak: satir soyluyor, atama gitmiyor", () => {
  const { rows } = roster([drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-2" } })]);
  assert.equal(rows[0].depleted, true);
  assert.equal(formatWorkerReserve(rows[0]), "Tükendi");
  inLocale("en", () => assert.equal(formatWorkerReserve(rows[0]), "Depleted"));

  const tap = (x, y, extra = {}) => resolveWorkerMapTarget({ workerId: "g1", role: "gatherer", product: "energy", x, y, radius: 40, nodes, towers: towers.values(), ownerId: "p1", ...extra });
  assert.deepEqual(tap(300, 100), { kind: "depleted" }, "tukenmis kaynaga atama gitti");
  assert.deepEqual(tap(110, 95), { kind: "assign", message: { workerId: "g1", nodeId: "crystal-1" } });
  assert.deepEqual(tap(700, 310), { kind: "assign", message: { workerId: "g1", nodeId: "iron-1" } });
  assert.deepEqual(tap(200, 200), { kind: "none" }, "bos kare sessiz");
  // Toplayici binaya atanmaz.
  assert.deepEqual(tap(100, 500), { kind: "none" });
});

test("tasiyici ve tamirci yalnizca kendi isinin binasina atanir", () => {
  const tap = (role, product, x, y, extra = {}) => resolveWorkerMapTarget({ workerId: "w", role, product, x, y, radius: 40, nodes, towers: towers.values(), ownerId: "p1", ...extra });
  assert.deepEqual(tap("carrier", "energy", 100, 500), { kind: "assign", message: { workerId: "w", sourceTowerId: "reactor", product: "energy" } });
  assert.deepEqual(tap("carrier", "bullet", 300, 500), { kind: "assign", message: { workerId: "w", sourceTowerId: "factory", product: "bullet" } });
  assert.deepEqual(tap("carrier", "materials", 300, 500), { kind: "assign", message: { workerId: "w", sourceTowerId: "factory", product: "materials" } });
  assert.deepEqual(tap("carrier", "materials", 500, 500), { kind: "assign", message: { workerId: "w", sourceTowerId: "depot", product: "materials" } });
  assert.deepEqual(tap("repairer", "energy", 500, 500), { kind: "assign", message: { workerId: "w", sourceTowerId: "depot" } });
  // Yanlis bina: oyuncuya soyleniyor, atama gitmiyor.
  assert.deepEqual(tap("carrier", "energy", 300, 500), { kind: "wrongBuilding" });
  assert.deepEqual(tap("carrier", "bullet", 100, 500), { kind: "wrongBuilding" });
  assert.deepEqual(tap("repairer", "energy", 100, 500), { kind: "wrongBuilding" });
  assert.deepEqual(tap("carrier", "energy", 700, 500), { kind: "wrongBuilding" });
  // Baskasinin binasi ve bos kare: hedef yok.
  assert.deepEqual(tap("carrier", "energy", 900, 500), { kind: "none" });
  assert.deepEqual(tap("carrier", "energy", 200, 400), { kind: "none" });
  // Cok kareli binada dokunulan kare merkezden uzakta olabilir.
  assert.deepEqual(tap("carrier", "energy", 160, 560, { hitTowerId: "reactor" }), { kind: "assign", message: { workerId: "w", sourceTowerId: "reactor", product: "energy" } });
  // Sunucunun `assignWorker` kurali.
  assert.equal(isWorkerSourceTower("carrier", "auraCrystal", towers.get("factory")), true);
  assert.equal(isWorkerSourceTower("gatherer", "energy", towers.get("reactor")), false);
});

test("urun secimi yalnizca tasiyicida; yonerge role ve urune gore", () => {
  assert.deepEqual([...getWorkerProductOptions("carrier")], ["materials", "energy", "bullet", "auraCrystal", "powerCrystal"]);
  assert.deepEqual([...getWorkerProductOptions("gatherer")], []);
  assert.deepEqual([...getWorkerProductOptions("repairer")], []);
  assert.deepEqual(getWorkerProductOptions("carrier").map(formatTransportProduct), ["Hammadde", "Enerji", "Kurşun", "Aura kristali", "Güç kristali"]);
  inLocale("en", () => {
    assert.deepEqual(getWorkerProductOptions("carrier").map(formatTransportProduct), ["Raw material", "Energy", "Bullet", "Aura crystal", "Power crystal"]);
  });
  const hints = new Set([
    getWorkerPickHint("gatherer", "energy"), getWorkerPickHint("repairer", "energy"),
    getWorkerPickHint("carrier", "energy"), getWorkerPickHint("carrier", "bullet"), getWorkerPickHint("carrier", "materials")
  ]);
  assert.equal(hints.size, 5, "her is kendi yonergesini yazmali");
  assert.equal(getWorkerPickHint("carrier", "powerCrystal"), getWorkerPickHint("carrier", "bullet"));
});

test("hedef beklenen isci: secim satirla birlikte gidiyor, isci yoksa kapaniyor", () => {
  const drones = [
    drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-1" }, autoAssigned: true }),
    drone("c1", "energyTransport", { assignment: { product: "bullet" }, autoAssigned: true })
  ];
  assert.deepEqual(roster(drones, { workerId: "c1", product: "materials" }).picking, { workerId: "c1", order: 2, role: "carrier", product: "materials" });
  assert.equal(roster(drones, { workerId: "olmus", product: "energy" }).picking, undefined);
  assert.equal(roster(drones).picking, undefined);
});

test("yapi anahtari: yuk ve kalan miktar listeyi yeniden kurdurmuyor", () => {
  const withNode = (cargo, remaining, assignment = { nodeId: "crystal-1" }, auto = true) => buildWorkerRoster({
    drones: [drone("g1", "crystalCollector", { assignment, autoAssigned: auto ? true : undefined, cargo }), drone("c1", "energyTransport", { assignment: { product: "energy" }, autoAssigned: true, cargo: cargo * 2 })],
    nodes: listResourceNodes([{ id: "crystal-1", remaining, x: 0, y: 0 }, { id: "crystal-2", remaining: 2000, x: 0, y: 0 }], []),
    getTower: () => undefined,
    ownerId: "p1"
  });
  const base = getWorkerRosterStructureKey(withNode(0, 2000));
  // Her anlik goruntude oynayan sayilar: anahtar ayni.
  assert.equal(getWorkerRosterStructureKey(withNode(4.2, 1994.5)), base);
  assert.equal(getWorkerRosterStructureKey(withNode(0, 3)), base);
  // Yazi degistiren seyler: tukenme, hedef, elle atama, hedef secimi.
  assert.notEqual(getWorkerRosterStructureKey(withNode(0, 0)), base, "tukenme satirin yazisini degistiriyor");
  assert.notEqual(getWorkerRosterStructureKey(withNode(0, 2000, { nodeId: "crystal-2" })), base);
  assert.notEqual(getWorkerRosterStructureKey(withNode(0, 2000, { nodeId: "crystal-1" }, false)), base);
  const picked = buildWorkerRoster({ drones: [drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-1" }, autoAssigned: true })], nodes, getTower: () => undefined, ownerId: "p1", pick: { workerId: "g1", product: "energy" } });
  const idle = buildWorkerRoster({ drones: [drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-1" }, autoAssigned: true })], nodes, getTower: () => undefined, ownerId: "p1" });
  assert.notEqual(getWorkerRosterStructureKey(picked), getWorkerRosterStructureKey(idle));
  assert.equal(getWorkerRosterStructureKey(undefined), "");
});

test("metinler: kadro anahtarlari iki dilde, Ingilizcede Turkce harf yok", () => {
  const keys = Object.keys(tr).filter((key) => key.startsWith("controls.roster.") || key.startsWith("controls.workerTab."));
  assert.ok(keys.length >= 20, `beklenenden az anahtar: ${keys.length}`);
  for (const key of keys) {
    assert.ok(en[key], `${key} Ingilizcesi yok`);
    assert.doesNotMatch(en[key], /[çğıöşüÇĞİÖŞÜ]/, `${key} Ingilizcesi Turkce harf tasiyor`);
  }
  assert.equal(tr["server.worker.nodeDepleted"], SERVER_TEXT["worker.nodeDepleted"]);
});

// ------------------------------------------------------------ Sunucu

const client = { sessionId: "p1", send() {} };

function capture() {
  const sent = [];
  return { sent, client: { sessionId: "p1", send(type, payload) { sent.push({ type, payload }); } } };
}

function addWorker(room, mode, assignment) {
  const unit = { id: `test-${mode}`, ownerId: "p1", mode, assignment, x: 0, y: 0, vx: 0, vy: 0, cargo: 0, capacity: 5, hp: 60, maxHp: 60 };
  room.drones.set(unit.id, unit);
  return unit;
}

test("sunucu: tukenmis kaynaga atama reddediliyor, anahtarli mesajla", () => {
  const room = createRoom("warrior");
  const unit = addWorker(room, "crystalCollector", { nodeId: "crystal-1" });
  room.resourceNodeRemaining.set("crystal-2", 0);
  const { sent, client: watcher } = capture();

  room.assignWorker(watcher, { workerId: unit.id, nodeId: "crystal-2" });
  assert.equal(unit.assignment.nodeId, "crystal-1", "isci tukenmis kaynaga atandi");
  assert.equal(unit.pendingAssignment, undefined);
  assert.equal(room.workerAssignments.has(unit.id), false, "reddedilen atama kayda gecti");
  assert.deepEqual(sent, [{ type: "worker:rejected", payload: { reason: SERVER_TEXT["worker.nodeDepleted"], key: "worker.nodeDepleted" } }]);

  // Yuk tasirken de: bekleyen atama olarak da yazilmiyor.
  unit.cargo = 3;
  room.assignWorker(watcher, { workerId: unit.id, nodeId: "crystal-2" });
  assert.equal(unit.pendingAssignment, undefined);
  assert.equal(sent.length, 2);

  // Kalani olan kaynak eskisi gibi kabul ediliyor, mesaj yok.
  unit.cargo = 0;
  room.assignWorker(watcher, { workerId: unit.id, nodeId: "crystal-3" });
  assert.equal(unit.assignment.nodeId, "crystal-3");
  assert.equal(sent.length, 2);
});

test("sunucu: anlik goruntu otomatik isi tek bayrakla, elle atamayi bayraksiz yolluyor", () => {
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const own = () => room.getSnapshot().drones.filter((entry) => entry.ownerId === "p1" && entry.maxHp !== undefined);
  const before = own();
  assert.ok(before.length >= 4, "temel isciler sahada degil");
  for (const entry of before) {
    assert.equal(entry.autoAssigned, true, `${entry.id} elle atanmis gorunuyor`);
    assert.ok(entry.assignment, "varsayilan is (kaynagin turu icin) telde kalmali");
  }

  const gatherer = before.find((entry) => entry.mode === "crystalCollector");
  room.assignWorker(client, { workerId: gatherer.id, nodeId: "crystal-2" });
  const after = own().find((entry) => entry.id === gatherer.id);
  assert.deepEqual(after.assignment, { nodeId: "crystal-2" });
  assert.equal("autoAssigned" in after && after.autoAssigned !== undefined, false, "elle atanmis iscide bayrak yazilmamali");
  // Digerleri hala otomatik.
  assert.equal(own().filter((entry) => entry.autoAssigned).length, before.length - 1);
});

test("sunucu: yuk tasirken yapilan atama anlik goruntude hemen gorunuyor", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-8");
  room.placeTower(client, { ...spot, definitionId: "warrior-8" });
  const unit = addWorker(room, "crystalCollector", { nodeId: "crystal-1" });
  unit.cargo = 3;
  unit.cargoResource = "energy";
  room.assignWorker(client, { workerId: unit.id, nodeId: "iron-1" });
  // Is teslimattan sonra degisiyor; oyuncu secimini beklemeden goruyor.
  assert.equal(unit.assignment.nodeId, "crystal-1");
  const wire = room.getSnapshot().drones.find((entry) => entry.id === unit.id);
  assert.deepEqual(wire.assignment, { nodeId: "iron-1" });
  assert.equal(wire.autoAssigned, undefined);
});
