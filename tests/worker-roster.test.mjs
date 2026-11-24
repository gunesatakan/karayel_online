/**
 * Isci kadrosu (apps/web/src/worker-roster.ts): Isci cekmecesinin "Yonetim"
 * bolumunun saf mantigi.
 *
 * Kadro bir donem kendi yuzen paneliydi; oyuncuya ic kimlikleri ("crystal-1",
 * "ammo-source-1") gosteriyor, elle atanmamis isciyi de sahte bir kaynaga
 * atanmis gibi yaziyordu. Sahibin istegi (2026-11-24): tek tip isci; meslek ve
 * tasinacak urun secimi yok, is iscinin atandigi yerden geliyor.
 *
 * Kilitlenen sozler:
 *   1. Elle atanmamis isci "Otomatik"; elle atanan okunur adla: kaynak turu ve
 *      sirasi ("Enerji kristali 2", "Barut yatağı 1"), binada kulenin adi.
 *      Ikisi de Turkce ve Ingilizce.
 *   2. Isin adi atandigi yerden: kaynakta "Toplama", Hammadde Deposu'nda
 *      "Hammadde taşıma", enerji binasinda "Enerji taşıma", cephanelikte
 *      "Mühimmat taşıma", Tamir Merkezi'nde "Onarım"; atamasiz isci "Boşta".
 *      Tel kipi isi belirlemiyor.
 *   3. Her isci her kaynaga ve gorev binasina atanabiliyor; atama mesajinda
 *      urun yok. Tukenmis kaynak ve isci almayan bina (kule, duvar) reddediliyor.
 *   4. Haritada isciye dokunmak onu seciyor; dokunus bir yapinin ustundeyse
 *      yapi kazaniyor.
 *   5. Yuk ve kalan miktar yapi anahtarinda yok: yerinde yaziliyorlar, liste
 *      onlar icin yeniden kurulmuyor.
 *   6. Sunucu "otomatik"i tek bayrakla soyluyor, tukenmis kaynagi reddediyor;
 *      alinan isci bosta doguyor ve alim bildirimindeki kimlik kadroda onu
 *      seciyor; is binanin turunden, istemcinin kurali sunucununkiyle ayni.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_KINDS, SERVER_TEXT } from "../packages/shared/dist/index.js";
import { createStaticTowerSnapshot } from "../apps/server/dist/snapshot/static-data.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const web = await importWebModule("tests/fixtures/worker-roster-entry.ts");
web.installCatalogLocale();
const {
  buildWorkerRoster, describeWorkerRow, findTappedWorker, formatResourceNodeName, formatTransportProduct, formatWorkerCargo,
  formatWorkerReserve, formatWorkerRole, getWorkerPickHint, getWorkerRosterRole, getWorkerRosterStructureKey, isWorkerPostTower,
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
  ["theirs", { id: "theirs", name: "Enerji Reaktörü", definitionId: "warrior-8", ownerId: "p2", hp: 100, resourceProvider: "energy", x: 900, y: 500 }],
  ["warehouse", { id: "warehouse", name: "Hammadde Deposu", definitionId: "warehouse-1", ownerId: "p1", hp: 100, x: 100, y: 700 }],
  // Yikilmis enerji binasi: hedef sayilmiyor; ona atanmis iscinin satirinda "Bina yok".
  ["ruin", { id: "ruin", name: "Enerji Reaktörü", definitionId: "warrior-8", ownerId: "p1", hp: 0, resourceProvider: "energy", x: 300, y: 700 }],
  ["wall", { id: "wall", name: "Duvar", definitionId: "wall-1", ownerId: "p1", hp: 120, x: 500, y: 700 }]
]);

const drone = (id, mode, extra = {}) => ({ id, mode, ownerId: "p1", x: 0, y: 0, hp: 60, maxHp: 60, cargo: 0, ...extra });
const roster = (drones, pick) => buildWorkerRoster({ drones, nodes, getTower: (id) => towers.get(id), ownerId: "p1", pick });
const describe = (row) => describeWorkerRow(row);
const tap = (workerId, x, y, extra = {}) => resolveWorkerMapTarget({ workerId, x, y, radius: 40, nodes, towers: towers.values(), ownerId: "p1", ...extra });

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
  // Sunucunun temel isci varsayilanlari (`getDefaultWorkerAssignment`): turunun
  // kaynagi ya da "en yakin bu tur bina" (bina kimligi yok).
  const { rows } = roster([
    drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-1" }, autoAssigned: true }),
    drone("g2", "crystalCollector", { assignment: { nodeId: "ammo-source-1" }, autoAssigned: true }),
    drone("c1", "energyTransport", { assignment: { postKind: "energy" }, autoAssigned: true }),
    drone("c2", "energyTransport", { assignment: { postKind: "factory" }, autoAssigned: true }),
    drone("r1", "repairer", { assignment: { postKind: "repair" }, autoAssigned: true })
  ]);
  assert.deepEqual(rows.map((row) => [row.order, row.role, row.postKind, row.auto]), [
    [1, "gatherer", undefined, true], [2, "gatherer", undefined, true], [3, "carrier", "energy", true], [4, "carrier", "factory", true], [5, "repairer", "repair", true]
  ]);
  assert.deepEqual(rows.map((row) => describe(row)), [
    { title: "1. Toplama", detail: "Enerji kristali · Otomatik" },
    { title: "2. Toplama", detail: "Barut · Otomatik" },
    { title: "3. Enerji taşıma", detail: "Otomatik" },
    { title: "4. Mühimmat taşıma", detail: "Otomatik" },
    { title: "5. Onarım", detail: "Otomatik" }
  ]);
  inLocale("en", () => {
    assert.deepEqual(rows.map((row) => describe(row)), [
      { title: "1. Gathering", detail: "Energy crystal · Automatic" },
      { title: "2. Gathering", detail: "Gunpowder · Automatic" },
      { title: "3. Energy hauling", detail: "Automatic" },
      { title: "4. Ammo hauling", detail: "Automatic" },
      { title: "5. Repair", detail: "Automatic" }
    ]);
  });
  for (const row of rows) assert.doesNotMatch(describe(row).detail, /crystal-1|ammo-source-1/);
});

test("elle atanan isci hedefini okunur adla yaziyor; kule adi Ingilizcede katalogdan", () => {
  const { rows } = roster([
    drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-3" }, cargo: 3.7 }),
    drone("g2", "crystalCollector", { assignment: { nodeId: "iron-1" }, advanced: true }),
    drone("c1", "energyTransport", { assignment: { sourceTowerId: "reactor", postKind: "energy" } }),
    drone("c2", "energyTransport", { assignment: { sourceTowerId: "warehouse", postKind: "warehouse" } }),
    drone("c3", "energyTransport", { assignment: { sourceTowerId: "factory", postKind: "factory" } }),
    // Satilan ve yikilan bina: sunucu isciyi ayni turden en yakin binaya geciriyor.
    drone("c4", "energyTransport", { assignment: { sourceTowerId: "sold", postKind: "factory" } }),
    drone("c5", "energyTransport", { assignment: { sourceTowerId: "ruin", postKind: "energy" } }),
    drone("r1", "repairer", { assignment: { sourceTowerId: "depot", postKind: "repair" } })
  ]);
  assert.equal(rows.every((row) => !row.auto), true);
  assert.deepEqual(rows.map((row) => row.postKind), [undefined, undefined, "energy", "warehouse", "factory", "factory", "energy", "repair"]);
  assert.deepEqual(rows.map((row) => describe(row)), [
    { title: "1. Toplama", detail: "Enerji kristali 3" },
    { title: "2. Toplama · gelişmiş", detail: "Demir yatağı 1" },
    { title: "3. Enerji taşıma", detail: "Enerji Reaktörü" },
    { title: "4. Hammadde taşıma", detail: "Hammadde Deposu" },
    { title: "5. Mühimmat taşıma", detail: "Mühimmat Deposu" },
    { title: "6. Mühimmat taşıma", detail: "Bina yok · en yakın aynısı" },
    { title: "7. Enerji taşıma", detail: "Bina yok · en yakın aynısı" },
    { title: "8. Onarım", detail: "Tamir Merkezi" }
  ]);
  inLocale("en", () => {
    assert.deepEqual(rows.map((row) => describe(row)), [
      { title: "1. Gathering", detail: "Energy crystal 3" },
      { title: "2. Gathering · advanced", detail: "Iron deposit 1" },
      { title: "3. Energy hauling", detail: "Energy Reactor" },
      { title: "4. Material hauling", detail: "Material Warehouse" },
      { title: "5. Ammo hauling", detail: "Ammo Depot" },
      { title: "6. Ammo hauling", detail: "Building lost · nearest of its kind" },
      { title: "7. Energy hauling", detail: "Building lost · nearest of its kind" },
      { title: "8. Repair", detail: "Repair Depot" }
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

test("is atandigi yerden: atamasiz isci Bosta, tel kipi isi belirlemiyor", () => {
  // Yeni alinan isci: sunucuda tasiyici kipinde ama atamasi yok (`getWorkerJobMode`).
  const { rows } = roster([drone("new", "energyTransport"), drone("rich", "energyTransport", { advanced: true })]);
  assert.deepEqual(rows.map((row) => [row.role, row.auto, row.postKind, row.target]), [["idle", false, undefined, undefined], ["idle", false, undefined, undefined]]);
  assert.deepEqual(rows.map((row) => describe(row)), [
    { title: "1. Boşta", detail: "Bir kaynağa ya da binaya ata" },
    { title: "2. Boşta · gelişmiş", detail: "Bir kaynağa ya da binaya ata" }
  ]);
  inLocale("en", () => {
    assert.deepEqual(rows.map((row) => describe(row)), [
      { title: "1. Idle", detail: "Assign it to a resource or building" },
      { title: "2. Idle · advanced", detail: "Assign it to a resource or building" }
    ]);
  });
  // Bostaki iscinin kalani yok, "Otomatik" de degil.
  assert.equal(formatWorkerReserve(rows[0]), "");
  assert.equal(formatWorkerCargo(rows[0]), "Yük 0");

  // Is atamadan: yuk teslim edilene kadar tel kipi eski isin aynasi kalabiliyor
  // (bekleyen atama telde hemen gorunuyor); satir yeni isi yazmali.
  const role = (mode, assignment) => getWorkerRosterRole({ mode, assignment });
  assert.equal(role("crystalCollector", { sourceTowerId: "warehouse", postKind: "warehouse" }), "carrier");
  assert.equal(role("energyTransport", { nodeId: "iron-1" }), "gatherer");
  assert.equal(role("energyTransport", { sourceTowerId: "depot", postKind: "repair" }), "repairer");
  assert.equal(role("repairer", undefined), "idle");
  assert.equal(role("crystalCollector", {}), "idle");

  // Isin adi gorev yerinin turunden: alti is, alti ayri ad, iki dilde.
  const jobs = () => [
    formatWorkerRole("gatherer"), formatWorkerRole("carrier", "warehouse"), formatWorkerRole("carrier", "energy"),
    formatWorkerRole("carrier", "factory"), formatWorkerRole("repairer", "repair"), formatWorkerRole("idle")
  ];
  assert.deepEqual(jobs(), ["Toplama", "Hammadde taşıma", "Enerji taşıma", "Mühimmat taşıma", "Onarım", "Boşta"]);
  inLocale("en", () => assert.deepEqual(jobs(), ["Gathering", "Material hauling", "Energy hauling", "Ammo hauling", "Repair", "Idle"]));
});

test("kadroda yalnizca oyuncunun lojistik iscileri var", () => {
  const { rows } = roster([
    drone("mine", "crystalCollector", { assignment: { nodeId: "crystal-1" }, autoAssigned: true }),
    drone("mineIdle", "energyTransport"),
    drone("theirs", "crystalCollector", { ownerId: "p2", assignment: { nodeId: "crystal-1" }, autoAssigned: true }),
    drone("theirsIdle", "energyTransport", { ownerId: "p2" }),
    // Atakan ultisinin dronlari: cani yok, isci degil.
    drone("ult-attack", "attack", { maxHp: undefined }),
    drone("ult-repair", "repair", { maxHp: undefined })
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["mine", "mineIdle"]);
  // Eski muhimmat kipleri de lojistik iscisi; isleri yine atamadan.
  assert.equal(getWorkerRosterRole({ mode: "ammoCollector", assignment: { nodeId: "ammo-source-1" } }), "gatherer");
  assert.equal(getWorkerRosterRole({ mode: "ammoTransport", assignment: { postKind: "factory" } }), "carrier");
  // Ulti dronu atama tasisa da isci degil.
  assert.equal(getWorkerRosterRole({ mode: "attack", assignment: { nodeId: "crystal-1" } }), undefined);
  assert.equal(getWorkerRosterRole({ mode: "repair", assignment: { postKind: "repair" } }), undefined);
});

test("tukenmis kaynak: satir soyluyor, atama gitmiyor", () => {
  const { rows } = roster([drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-2" } })]);
  assert.equal(rows[0].depleted, true);
  assert.equal(formatWorkerReserve(rows[0]), "Tükendi");
  inLocale("en", () => assert.equal(formatWorkerReserve(rows[0]), "Depleted"));

  assert.deepEqual(tap("g1", 300, 100), { kind: "depleted" }, "tukenmis kaynaga atama gitti");
  assert.deepEqual(tap("g1", 110, 95), { kind: "assign", message: { workerId: "g1", nodeId: "crystal-1" } });
  assert.deepEqual(tap("g1", 700, 310), { kind: "assign", message: { workerId: "g1", nodeId: "iron-1" } });
  assert.deepEqual(tap("g1", 200, 200), { kind: "none" }, "bos kare sessiz");
});

test("her isci her kaynaga ve gorev binasina atanir; mesajda urun yok", () => {
  // Tek tip isci: hedef iscinin isinden degil, dokunulan yerden. Toplayan bir
  // isci binaya, bosta bir isci kaynaga ayni dokunusla gidiyor.
  const places = [
    [100, 500, { sourceTowerId: "reactor" }],
    [300, 500, { sourceTowerId: "factory" }],
    [500, 500, { sourceTowerId: "depot" }],
    [100, 700, { sourceTowerId: "warehouse" }],
    [110, 95, { nodeId: "crystal-1" }],
    [300, 300, { nodeId: "ammo-source-2" }]
  ];
  for (const workerId of ["g1", "idle"]) {
    for (const [x, y, target] of places) {
      assert.deepEqual(tap(workerId, x, y), { kind: "assign", message: { workerId, ...target } }, `${workerId} -> ${x},${y}`);
    }
  }
  // Isci almayan yapi (kule, duvar): oyuncuya soyleniyor, atama gitmiyor.
  assert.deepEqual(tap("w", 700, 500), { kind: "wrongBuilding" });
  assert.deepEqual(tap("w", 500, 700), { kind: "wrongBuilding" });
  // Yikilmis bina, baskasinin binasi ve bos kare: hedef yok.
  assert.deepEqual(tap("w", 300, 700), { kind: "none" });
  assert.deepEqual(tap("w", 900, 500), { kind: "none" });
  assert.deepEqual(tap("w", 200, 400), { kind: "none" });
  // Cok kareli binada dokunulan kare merkezden uzakta olabilir.
  assert.deepEqual(tap("w", 160, 560, { hitTowerId: "reactor" }), { kind: "assign", message: { workerId: "w", sourceTowerId: "reactor" } });

  // Kaynak ve bina yan yanaysa dokunusa en yakini; dokunulan karedeki bina en yakin sayiliyor.
  const side = listResourceNodes([{ id: "crystal-9", remaining: 500, x: 0, y: 0 }], []);
  const reactor = { id: "r", name: "Enerji Reaktörü", definitionId: "warrior-8", ownerId: "p1", hp: 100, resourceProvider: "energy", x: 60, y: 0 };
  const near = (x, buildings, extra = {}) => resolveWorkerMapTarget({ workerId: "w", x, y: 0, radius: 80, nodes: side, towers: buildings, ownerId: "p1", ...extra });
  assert.deepEqual(near(20, [reactor]), { kind: "assign", message: { workerId: "w", nodeId: "crystal-9" } });
  assert.deepEqual(near(40, [reactor]), { kind: "assign", message: { workerId: "w", sourceTowerId: "r" } });
  assert.deepEqual(near(10, [reactor], { hitTowerId: "r" }), { kind: "assign", message: { workerId: "w", sourceTowerId: "r" } });
  // Isci almayan kule yanindaki kaynagi ortmuyor.
  const turret = { ...reactor, id: "k", definitionId: "warrior-1", resourceProvider: undefined };
  assert.deepEqual(near(10, [turret], { hitTowerId: "k" }), { kind: "assign", message: { workerId: "w", nodeId: "crystal-9" } });

  // Gorev binalari (`getWorkerPostKind`): depo, Tamir Merkezi, enerji binasi, cephanelik.
  for (const id of ["reactor", "factory", "depot", "warehouse"]) assert.equal(isWorkerPostTower(towers.get(id)), true, id);
  for (const id of ["turret", "wall"]) assert.equal(isWorkerPostTower(towers.get(id)), false, id);
});

test("haritada isciye dokunmak onu seciyor: en yakin kendi iscisi, yapinin ustunde yapi", () => {
  const drones = [
    drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-1" }, x: 100, y: 100 }),
    drone("idle", "energyTransport", { x: 130, y: 100 }),
    drone("legacy", "ammoTransport", { assignment: { postKind: "factory" }, x: 400, y: 400 }),
    // Dokunusa daha yakin ama secilemeyenler: baskasinin iscisi ve ulti dronu.
    drone("theirs", "crystalCollector", { ownerId: "p2", x: 102, y: 100 }),
    drone("ult", "attack", { maxHp: undefined, x: 101, y: 100 })
  ];
  const tapAt = (x, y, hitTower = false) => findTappedWorker({ x, y, radius: 20, drones, ownerId: "p1", hitTower })?.id;
  assert.equal(tapAt(103, 100), "g1", "baskasinin iscisi ya da ulti dronu secildi");
  assert.equal(tapAt(112, 100), "g1", "en yakin isci secilmeli");
  assert.equal(tapAt(124, 100), "idle", "bosta isci de seciliyor");
  assert.equal(tapAt(405, 395), "legacy");
  assert.equal(tapAt(100, 125), undefined, "yaricapin disindaki isci secildi");
  // Dokunus bir yapinin ustunde: yapi kazanir (binadaki isci listeden secilir).
  assert.equal(tapAt(100, 100, true), undefined);
});

test("hedef beklenen isci: secim satirla birlikte gidiyor, isci yoksa kapaniyor", () => {
  const drones = [
    drone("g1", "crystalCollector", { assignment: { nodeId: "crystal-1" }, autoAssigned: true }),
    drone("c1", "energyTransport", { assignment: { postKind: "factory" }, autoAssigned: true }),
    drone("new", "energyTransport")
  ];
  assert.deepEqual(roster(drones, { workerId: "c1" }).picking, { workerId: "c1", order: 2, role: "carrier", postKind: "factory" });
  assert.deepEqual(roster(drones, { workerId: "g1" }).picking, { workerId: "g1", order: 1, role: "gatherer", postKind: undefined });
  // Bosta isci de secilebiliyor: alim onu secili getiriyor.
  assert.deepEqual(roster(drones, { workerId: "new" }).picking, { workerId: "new", order: 3, role: "idle", postKind: undefined });
  assert.equal(roster(drones, { workerId: "olmus" }).picking, undefined);
  assert.equal(roster(drones).picking, undefined);
});

test("urun secimi yok: her isciye ayni yonerge, dort gorev binasini sayiyor", () => {
  // Eskiden role ve urune gore bes yonerge vardi; simdi yonerge isciye bagli degil.
  assert.equal(getWorkerPickHint.length, 0);
  assert.equal(getWorkerPickHint(), tr["controls.roster.hintPost"]);
  for (const place of [/kaynağa/, /Hammadde Deposu/, /enerji binası/, /cephanelik/, /Tamir Merkezi/]) assert.match(getWorkerPickHint(), place);
  inLocale("en", () => {
    assert.equal(getWorkerPickHint(), en["controls.roster.hintPost"]);
    for (const place of [/resource/, /Material Warehouse/, /energy building/, /armory/, /Repair Depot/]) assert.match(getWorkerPickHint(), place);
  });
  // Urun secimi ve role gore bina kurali modulden kalkti.
  assert.equal("getWorkerProductOptions" in web, false);
  assert.equal("isWorkerSourceTower" in web, false);
  // Urunun adi egitim metinleri icin kaliyor.
  const products = ["materials", "energy", "bullet", "auraCrystal", "powerCrystal"];
  assert.deepEqual(products.map(formatTransportProduct), ["Hammadde", "Enerji", "Kurşun", "Aura kristali", "Güç çekirdeği"]);
  inLocale("en", () => assert.deepEqual(products.map(formatTransportProduct), ["Raw material", "Energy", "Bullet", "Aura crystal", "Power core"]));
});

test("yapi anahtari: yuk ve kalan miktar listeyi yeniden kurdurmuyor", () => {
  const keyOf = ({ cargo = 0, remaining = 2000, gather = { nodeId: "crystal-1" }, auto = true, haul = { postKind: "energy" }, pick } = {}) => getWorkerRosterStructureKey(buildWorkerRoster({
    drones: [
      drone("g1", "crystalCollector", { assignment: gather, autoAssigned: auto ? true : undefined, cargo }),
      drone("c1", "energyTransport", { assignment: haul, autoAssigned: haul.postKind ? true : undefined, cargo: cargo * 2 })
    ],
    nodes: listResourceNodes([{ id: "crystal-1", remaining, x: 0, y: 0 }, { id: "crystal-2", remaining: 2000, x: 0, y: 0 }], []),
    getTower: () => undefined,
    ownerId: "p1",
    pick
  }));
  const base = keyOf();
  // Her anlik goruntude oynayan sayilar: anahtar ayni.
  assert.equal(keyOf({ cargo: 4.2, remaining: 1994.5 }), base);
  assert.equal(keyOf({ remaining: 3 }), base);
  // Yazi degistiren seyler: tukenme, hedef, elle atama, isin turu, hedef secimi.
  assert.notEqual(keyOf({ remaining: 0 }), base, "tukenme satirin yazisini degistiriyor");
  assert.notEqual(keyOf({ gather: { nodeId: "crystal-2" } }), base);
  assert.notEqual(keyOf({ auto: false }), base);
  assert.notEqual(keyOf({ haul: { postKind: "factory" } }), base, "Enerji taşıma -> Mühimmat taşıma basligi degistiriyor");
  assert.notEqual(keyOf({ haul: {} }), base, "bosa cikan isci basligi degistiriyor");
  assert.notEqual(keyOf({ pick: { workerId: "g1" } }), base);
  assert.notEqual(keyOf({ pick: { workerId: "g1" } }), keyOf({ pick: { workerId: "c1" } }), "secilen isci degisti");
  assert.equal(getWorkerRosterStructureKey(undefined), "");
});

test("metinler: kadro anahtarlari iki dilde, Ingilizcede Turkce harf yok", () => {
  const keys = Object.keys(tr).filter((key) => key.startsWith("controls.roster.") || key.startsWith("controls.workerTab."));
  assert.ok(keys.length >= 20, `beklenenden az anahtar: ${keys.length}`);
  for (const key of keys) {
    assert.ok(en[key], `${key} Ingilizcesi yok`);
    assert.doesNotMatch(en[key], /[çğıöşüÇĞİÖŞÜ]/, `${key} Ingilizcesi Turkce harf tasiyor`);
  }
  // Is adlari ve bosta satiri var; urun secimi ve role gore yonergeler kalkti.
  for (const key of ["jobGather", "jobHaulWarehouse", "jobHaulEnergy", "jobHaulFactory", "jobRepair", "jobIdle", "idleDetail", "hintPost"]) {
    assert.ok(keys.includes(`controls.roster.${key}`), `${key} yok`);
  }
  for (const key of ["hintNode", "hintEnergy", "hintAmmo", "hintMaterials", "productLabel"]) {
    assert.equal(`controls.roster.${key}` in tr, false, `${key} kalmis`);
    assert.equal(`controls.roster.${key}` in en, false, `${key} Ingilizcesi kalmis`);
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

/** Istemcinin gordugu kuleler: teldeki statik kayit ve anlik can. */
const wireTowers = (room) => new Map([...room.towers.values()].map((tower) => [tower.id, { ...createStaticTowerSnapshot(tower), hp: tower.hp }]));

/** Sunucunun anlik goruntusunden istemcinin kadrosu (sahnenin `getWorkerRosterState`i). */
function rosterFromRoom(room, pick) {
  const snapshot = room.getSnapshot();
  return buildWorkerRoster({
    drones: snapshot.drones,
    nodes: listResourceNodes(snapshot.crystalNodes, snapshot.ammoNodes),
    getTower: (id) => wireTowers(room).get(id),
    ownerId: "p1",
    pick
  });
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

test("sunucu: alinan isci bosta doguyor; alim bildirimindeki kimlik kadroda onu seciyor", () => {
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const { sent, client: buyer } = capture();
  // Eski istemcinin yolladigi rol yok sayiliyor: uzmanlik yok.
  room.hireWorker(buyer, { role: "repairer", advanced: true });
  const hired = sent.find((entry) => entry.type === "worker:hired")?.payload;
  assert.ok(hired, "alim bildirimi yok");
  assert.equal(hired.advanced, true);
  assert.equal(typeof hired.workerId, "string");
  assert.equal("role" in hired, false, "alim bildirimi uzmanlik tasiyor");
  assert.deepEqual(room.state.players.get("p1").hiredWorkers.map((worker) => worker.role), [undefined]);

  const wire = room.getSnapshot().drones.find((entry) => entry.id === hired.workerId);
  assert.ok(wire, "bildirimdeki kimlik sahada yok: istemci yeni isciyi secemez");
  assert.equal(wire.assignment, undefined);
  assert.equal(wire.autoAssigned, undefined);

  // Sahne alimdan sonra bildirimdeki kimlikle secime giriyor (`worker:hired`).
  const state = rosterFromRoom(room, { workerId: hired.workerId });
  const row = state.rows.find((entry) => entry.id === hired.workerId);
  assert.deepEqual(state.picking, { workerId: hired.workerId, order: row.order, role: "idle", postKind: undefined });
  assert.deepEqual(describe(row), { title: `${row.order}. Boşta · gelişmiş`, detail: "Bir kaynağa ya da binaya ata" });
  // Temel isciler varsayilan islerinde, otomatik.
  assert.deepEqual(state.rows.filter((entry) => entry.id !== hired.workerId).map((entry) => [entry.role, entry.postKind, entry.auto]), [
    ["gatherer", undefined, true], ["carrier", "energy", true], ["gatherer", undefined, true], ["carrier", "factory", true]
  ]);
});

test("sunucu: ayni isci her gorev binasina atanir; is binanin turunden, kule ve duvar isci almiyor", () => {
  const room = createRoom("warrior");
  const build = (definitionId) => {
    const spot = findBuildableSpot(room, definitionId);
    assert.ok(spot, definitionId);
    room.placeTower(client, { ...spot, definitionId });
    const tower = [...room.towers.values()].at(-1);
    assert.equal(tower.definition.id, definitionId);
    return tower;
  };
  const posts = { warehouse: build("warehouse-1"), energy: build("warrior-8"), factory: build("warrior-7"), repair: build("repair-depot-1") };
  const others = [build("warrior-1"), build("wall-1")];
  // Bosta isci (yeni alinmis gibi): atamasi yok.
  const unit = addWorker(room, "energyTransport", undefined);
  const row = () => rosterFromRoom(room).rows.find((entry) => entry.id === unit.id);
  assert.equal(row().role, "idle");

  for (const [postKind, mode, job, name] of [
    ["warehouse", "energyTransport", "Hammadde taşıma", "Hammadde Deposu"],
    ["energy", "energyTransport", "Enerji taşıma", "Enerji Reaktörü"],
    ["factory", "energyTransport", "Mühimmat taşıma", "Cephane Merkezi"],
    ["repair", "repairer", "Onarım", "Tamir Merkezi"]
  ]) {
    const tower = posts[postKind];
    // Istemci de ayni binayi gorev yeri sayiyor (haritadaki halka ve dokunus).
    assert.equal(isWorkerPostTower(wireTowers(room).get(tower.id)), true, postKind);
    room.assignWorker(client, { workerId: unit.id, sourceTowerId: tower.id });
    assert.deepEqual(unit.assignment, { sourceTowerId: tower.id, postKind });
    assert.equal(unit.mode, mode, `${postKind}: tel kipi isin aynasi degil`);
    const current = row();
    assert.deepEqual(describe(current), { title: `${current.order}. ${job}`, detail: name });
  }
  // Ayni isci kaynaga ataninca toplayici.
  room.assignWorker(client, { workerId: unit.id, nodeId: "iron-1" });
  assert.equal(unit.mode, "crystalCollector");
  const gathering = row();
  assert.deepEqual(describe(gathering), { title: `${gathering.order}. Toplama`, detail: "Demir yatağı 1" });
  // Isci almayan yapilar: sunucu atamayi degistirmiyor, istemci de onlari gorev yeri saymiyor.
  for (const tower of others) {
    assert.equal(isWorkerPostTower(wireTowers(room).get(tower.id)), false, tower.definition.id);
    room.assignWorker(client, { workerId: unit.id, sourceTowerId: tower.id });
    assert.deepEqual(unit.assignment, { nodeId: "iron-1" }, `${tower.definition.id} isci aldi`);
  }
});
