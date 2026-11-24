import test from "node:test";
import assert from "node:assert/strict";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { getWorkerJob, getWorkerJobMode } from "../packages/shared/dist/index.js";

/**
 * Isci artik duz cizgide yurumuyor: yapilarin icinden ve duvarlardan
 * gecemedigi icin hucre hucre yol ariyor. Yani "x buyudu mu" diye sormak
 * artik yanlis soru -- isci hedefe once asagi, sonra saga gidebilir.
 * Dogru soru mesafenin kapanip kapanmadigi.
 */
const uzaklik = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function provider(id, resourceProvider, x, y) {
  return {
    id,
    ownerId: "p1",
    hp: 100,
    x,
    y,
    definition: { resourceProvider },
    // Isci hiz esyalari hizmet edilen binadan okundugu icin bina bir modifier
    // listesi tasimak zorunda.
    runModifiers: [],
    ammo: 0,
    maxAmmo: resourceProvider === "ammunition" ? 240 : 0,
    // Cephaneligin bitmis muhimmati tur tur stokta (`ammoStock`).
    ammoStock: resourceProvider === "ammunition" ? {} : undefined,
    energy: 0,
    maxEnergy: 240,
    rawAmmo: 0,
    maxRawAmmo: resourceProvider === "ammunition" ? 240 : 0
  };
}

/**
 * Tek tip isci: isi atamasindan, kipi isinin aynasi. `sourceTowerId`
 * verilmeyen bina atamasi sahibinin o turden en yakin binasi; baslangic
 * tasiyicilarinin varsayilani boyle. Atamasiz isci bosta.
 */
function worker(id, assignment, x = 20, y = 20) {
  return {
    id,
    ownerId: "p1",
    mode: getWorkerJobMode(getWorkerJob(assignment)),
    assignment,
    x,
    y,
    vx: 0,
    vy: 0,
    logisticsPhase: "pickup",
    cargo: 0,
    capacity: 2,
    speed: 82,
    targetTowerId: ""
  };
}

function room(...towers) {
  const instance = new MatchRoom();
  instance.state = { players: new Map([["p1", { runModifiers: [] }]]) };
  instance.towers = new Map(towers.map((tower) => [tower.id, tower]));
  return instance;
}

test("birleşik toplama ve taşıma işçileri 13,5 kapasiteyle doğar", () => {
  const room = new MatchRoom();
  room.state = { players: new Map([["p1", { ownedShopItemIds: [], inventoryItemIds: [] }]]) };
  room.ensureLogisticsWorkers();

  const collector = room.drones.get("logistics-p1-ammoCollector");
  const transporter = room.drones.get("logistics-p1-ammoTransport");
  assert.equal(collector.capacity, 13.5);
  assert.equal(transporter.capacity, 13.5);
});

test("enerji binasına atanan işçi stok boşken binaya dönüp orada bekler", () => {
  const reactor = provider("reactor", "energy", 200, 200);
  const odasi = room(reactor);
  const transporter = worker("energy", { postKind: "energy" });

  const once = uzaklik(transporter, reactor);
  odasi.updateLogisticsWorker(transporter, 0.1);
  assert.ok(uzaklik(transporter, reactor) < once, "tasiyici reaktore yaklasmadi");
  assert.equal(transporter.logisticsPhase, "pickup");

  // Is yok: gorev yerine varip orada duruyor, bos yere yuk almiyor.
  for (let tick = 0; tick < 200; tick += 1) odasi.updateLogisticsWorker(transporter, 0.1);
  assert.equal(uzaklik(transporter, reactor), 0, "tasiyici gorev yerinde beklemiyor");
  assert.equal(transporter.cargo, 0);
  assert.equal(transporter.logisticsPhase, "pickup");
});

test("cephaneliğe atanan işçi stok boşken cephaneliğe dönüp orada bekler", () => {
  const factory = provider("factory", "ammunition", 200, 200);
  const odasi = room(factory);
  const transporter = worker("factory", { postKind: "factory" });

  const once = uzaklik(transporter, factory);
  odasi.updateLogisticsWorker(transporter, 0.1);
  assert.ok(uzaklik(transporter, factory) < once, "tasiyici fabrikaya yaklasmadi");
  assert.equal(transporter.logisticsPhase, "pickup");

  for (let tick = 0; tick < 200; tick += 1) odasi.updateLogisticsWorker(transporter, 0.1);
  assert.equal(uzaklik(transporter, factory), 0, "tasiyici gorev yerinde beklemiyor");
  assert.equal(transporter.cargo, 0);
});

test("tasiyicilar kaynak gelince bekledikleri binadan yukleme yapar", () => {
  const reactor = provider("reactor", "energy", 100, 100);
  const factory = provider("factory", "ammunition", 200, 200);
  const target = {
    id: "tower",
    ownerId: "p1",
    hp: 100,
    x: 300,
    y: 300,
    definition: {},
    runModifiers: [],
    ammo: 0,
    maxAmmo: 20,
    energy: 0,
    maxEnergy: 100,
    ammoLogisticsEnabled: true,
    ammoType: "bullet"
  };
  // Savas kulesi fabrikadan once eklenmis olsa bile, sifir enerjili fabrika
  // ilk uretim partisini baslatabilmek icin enerji onceligi almali.
  const odasi = room(reactor, target, factory);
  const energyTransport = worker("energy", { postKind: "energy" }, reactor.x, reactor.y);
  const ammoTransport = worker("factory", { postKind: "factory" }, factory.x, factory.y);
  reactor.energy = 2;
  factory.ammoStock = { bullet: 2 };
  factory.ammo = 2;

  odasi.updateLogisticsWorker(energyTransport, 0.1);
  odasi.updateLogisticsWorker(ammoTransport, 0.1);
  odasi.updateLogisticsWorker(energyTransport, 0.1);

  assert.equal(energyTransport.cargo, 2);
  assert.equal(energyTransport.cargoResource, "energy");
  assert.equal(energyTransport.logisticsPhase, "deliver");
  assert.equal(energyTransport.targetTowerId, factory.id);
  assert.equal(reactor.energy, 0);
  assert.equal(ammoTransport.cargo, 2);
  assert.equal(ammoTransport.cargoAmmoType, "bullet");
  assert.equal(ammoTransport.logisticsPhase, "deliver");
  assert.equal(ammoTransport.targetTowerId, target.id);
  assert.equal(factory.ammoStock.bullet, 0);
  assert.equal(factory.ammo, 0);
});

test("atamasız işçi boşta bekler", () => {
  // Rol basina atamasiz davranislar kalkti: is yalnizca atamadan geliyor.
  const reactor = provider("reactor", "energy", 100, 100);
  reactor.energy = 50;
  const factory = provider("factory", "ammunition", 200, 200);
  const odasi = room(reactor, factory);
  const idle = worker("idle", undefined, 150, 150);
  assert.equal(idle.mode, "energyTransport", "bosta iscinin teldeki kipi tasiyici");

  for (let tick = 0; tick < 50; tick += 1) odasi.updateLogisticsWorker(idle, 0.1);
  assert.deepEqual([idle.x, idle.y, idle.vx, idle.vy], [150, 150, 0, 0], "bosta isci yurudu");
  assert.equal(idle.cargo, 0);
  assert.equal(reactor.energy, 50, "bosta isci enerji tasidi");
});

test("görev binası yıkılınca ya da satılınca işçi aynı türden en yakın binaya geçer", () => {
  // Atandigi bina ayaktayken o; daha yakin bir enerji binasi olsa bile.
  const assigned = provider("reactor-a", "energy", 420, 420);
  const nearer = provider("reactor-b", "energy", 200, 200);
  const odasi = room(assigned, nearer);
  const transporter = worker("energy", { sourceTowerId: assigned.id, postKind: "energy" }, 260, 260);

  let once = uzaklik(transporter, assigned);
  odasi.updateLogisticsWorker(transporter, 0.1);
  assert.ok(uzaklik(transporter, assigned) < once, "isci atandigi binaya gitmiyor");

  // Yikildi: ayni turden en yakin bina. Atama (oyuncunun secimi) degismiyor.
  assigned.hp = 0;
  once = uzaklik(transporter, nearer);
  odasi.updateLogisticsWorker(transporter, 0.1);
  assert.ok(uzaklik(transporter, nearer) < once, "yikilan binanin iscisi ayni turden binaya gecmedi");
  assert.deepEqual(transporter.assignment, { sourceTowerId: assigned.id, postKind: "energy" });

  // Satildi: ayni.
  odasi.towers.delete(assigned.id);
  once = uzaklik(transporter, nearer);
  odasi.updateLogisticsWorker(transporter, 0.1);
  assert.ok(uzaklik(transporter, nearer) < once, "satilan binanin iscisi ayni turden binaya gecmedi");

  // O turden hic bina kalmadi: isci yerinde bekliyor.
  odasi.towers.delete(nearer.id);
  const { x, y } = transporter;
  odasi.updateLogisticsWorker(transporter, 0.1);
  assert.deepEqual([transporter.x, transporter.y], [x, y]);
});
