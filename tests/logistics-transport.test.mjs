import test from "node:test";
import assert from "node:assert/strict";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";

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
    energy: 0,
    maxEnergy: 240,
    rawAmmo: 0,
    maxRawAmmo: resourceProvider === "ammunition" ? 240 : 0
  };
}

function worker(mode, x = 20, y = 20) {
  return {
    id: mode,
    ownerId: "p1",
    mode,
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

test("cephane hammaddesi toplayıcısı 2, mühimmat taşıyıcısı 4 kapasiteyle doğar", () => {
  const room = new MatchRoom();
  room.state = { players: new Map([["p1", { ownedShopItemIds: [], inventoryItemIds: [] }]]) };
  room.ensureLogisticsWorkers();

  const collector = room.drones.get("logistics-p1-ammoCollector");
  const transporter = room.drones.get("logistics-p1-ammoTransport");
  assert.equal(collector.capacity, 2);
  assert.equal(transporter.capacity, 4);
});

test("enerji tasiyicisi stok bosken reaktore donup bekler", () => {
  const room = new MatchRoom();
  room.state = { players: new Map([["p1", { runModifiers: [] }]]) };
  const reactor = provider("reactor", "energy", 200, 200);
  room.towers = new Map([[reactor.id, reactor]]);
  const transporter = worker("energyTransport");

  room.updateLogisticsWorker(transporter, 0.1);

  assert.ok(transporter.x > 20);
  assert.ok(transporter.y > 20);
  assert.equal(transporter.logisticsPhase, "pickup");
});

test("cephane tasiyicisi stok bosken fabrikaya donup bekler", () => {
  const room = new MatchRoom();
  room.state = { players: new Map([["p1", { runModifiers: [] }]]) };
  const factory = provider("factory", "ammunition", 200, 200);
  room.towers = new Map([[factory.id, factory]]);
  const transporter = worker("ammoTransport");

  room.updateLogisticsWorker(transporter, 0.1);

  assert.ok(transporter.x > 20);
  assert.ok(transporter.y > 20);
  assert.equal(transporter.logisticsPhase, "pickup");
});

test("tasiyicilar kaynak gelince bekledikleri binadan yukleme yapar", () => {
  const room = new MatchRoom();
  room.state = { players: new Map([["p1", { runModifiers: [] }]]) };
  const reactor = provider("reactor", "energy", 100, 100);
  const factory = provider("factory", "ammunition", 200, 200);
  const target = {
    id: "tower",
    ownerId: "p1",
    hp: 100,
    x: 300,
    y: 300,
    definition: {},
    ammo: 0,
    maxAmmo: 20,
    energy: 0,
    maxEnergy: 100,
    ammoLogisticsEnabled: true,
    ammoType: "bullet"
  };
  // Savas kulesi fabrikadan once eklenmis olsa bile, sifir enerjili fabrika
  // ilk uretim partisini baslatabilmek icin enerji onceligi almali.
  room.towers = new Map([[reactor.id, reactor], [target.id, target], [factory.id, factory]]);
  const energyTransport = worker("energyTransport", reactor.x, reactor.y);
  const ammoTransport = worker("ammoTransport", factory.x, factory.y);
  reactor.energy = 2;
  factory.ammo = 2;

  room.updateLogisticsWorker(energyTransport, 0.1);
  room.updateLogisticsWorker(ammoTransport, 0.1);
  room.updateLogisticsWorker(energyTransport, 0.1);

  assert.equal(energyTransport.cargo, 2);
  assert.equal(energyTransport.logisticsPhase, "deliver");
  assert.equal(energyTransport.targetTowerId, factory.id);
  assert.equal(ammoTransport.cargo, 2);
  assert.equal(ammoTransport.logisticsPhase, "deliver");
  assert.equal(ammoTransport.targetTowerId, target.id);
});
