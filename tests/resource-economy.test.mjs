import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { AMMO_RECIPES, REPAIR_HP_PER_PART, ACTIVE_WORKER_ROLES, WORKER_DEVELOPMENT_CELLS } from "../packages/shared/dist/index.js";

const client = { sessionId: "p1", send() {} };
function build(room, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, definitionId);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  return tower;
}
function worker(room, mode, assignment) {
  const unit = { id: `test-${mode}`, ownerId: "p1", mode, assignment, x: 0, y: 0, vx: 0, vy: 0, cargo: 0, capacity: 5, hp: 60, maxHp: 60 };
  room.drones.set(unit.id, unit);
  return unit;
}

test("recipes isolate all ammo stocks and consume real input and energy", () => {
  for (const [type, kind] of Object.entries(AMMO_RECIPES)) {
    const room = createRoom("warrior");
    const factory = build(room, "warrior-7");
    room.setFactoryProduction(client, { towerId: factory.id, ammoType: type });
    factory.materials[kind] = 10;
    factory.energy = 10;
    room.updateResourceFactories(2);
    assert.equal(factory.ammoStock[type], 1);
    assert.equal(factory.ammo, 1);
    assert.equal(factory.energy, 9.75);
    assert.equal(factory.materials[kind], 9);
    assert.equal(Object.keys(factory.ammoStock).length, 1);
  }
});

test("iron plus energy produces parts; neither resource alone produces anything", () => {
  const room = createRoom("warrior");
  const depot = build(room, "repair-depot-1");
  depot.materials.iron = 10;
  room.updateResourceFactories(2);
  assert.equal(depot.repairParts, 0);
  depot.energy = 10;
  room.updateResourceFactories(2);
  assert.equal(depot.repairParts, 1);
  assert.equal(depot.energy, 9);
  assert.equal(depot.materials.iron, 9);
});

test("repair production stops at energy exhaustion, including fractional reserves", () => {
  const room = createRoom("warrior");
  const depot = build(room, "repair-depot-1");
  depot.materials.iron = 10;
  depot.energy = 0.25;
  room.updateResourceFactories(2);
  assert.equal(depot.repairParts, 0.25);
  assert.equal(depot.energy, 0);
  assert.equal(depot.materials.iron, 9.75);
  for (let i = 0; i < 100; i++) room.updateResourceFactories(0.05);
  assert.equal(depot.repairParts, 0.25);
  assert.equal(depot.materials.iron, 9.75);
  depot.energy = 1;
  depot.materials.iron = 0;
  room.updateResourceFactories(2);
  assert.equal(depot.repairParts, 0.25);
  assert.equal(depot.energy, 1);
});

test("repairer must collect parts and cannot repair past its carried supply", () => {
  const room = createRoom("warrior");
  const target = build(room, "warrior-1"); target.hp /= 2;
  // Tamirci, Tamir Merkezi'ne atanmis isci; merkez verilmezse en yakini.
  const unit = worker(room, "repairer", { postKind: "repair" });
  room.moveLogisticsWorker = () => true;
  const hp = target.hp;
  room.updateRepairWorker(unit, 1);
  assert.equal(target.hp, hp);
  const depot = build(room, "repair-depot-1");
  room.updateRepairWorker(unit, 1);
  assert.equal(target.hp, hp);
  // Kirinti yetmiyor: en az yuk (3 parca) birikmeden tamirci yuklenmiyor.
  depot.repairParts = 0.5;
  room.updateRepairWorker(unit, 1);
  assert.equal(unit.cargo ?? 0, 0);
  assert.equal(depot.repairParts, 0.5);
  depot.repairParts = 4;
  room.updateRepairWorker(unit, 1);
  assert.equal(unit.cargo, 4);
  assert.equal(depot.repairParts, 0);
  room.updateRepairWorker(unit, 10);
  assert.equal(target.hp, Math.min(target.maxHp, hp + 4 * REPAIR_HP_PER_PART));
  assert.equal(unit.cargo, 0);
});

test("collector chooses each resource and deposits it only into the appropriate building", () => {
  const room = createRoom("warrior");
  const energy = build(room, "warrior-8");
  const factory = build(room, "warrior-7");
  const depot = build(room, "repair-depot-1");
  const warehouse = build(room, "warehouse-1");
  room.moveLogisticsWorker = () => true;
  const unit = worker(room, "crystalCollector", {});
  for (const node of room.getEconomyNodes()) {
    unit.assignment = { nodeId: node.id }; unit.cargo = 0; unit.cargoResource = undefined;
    room.updateAssignedWorker(unit, 100);
    assert.equal(unit.cargoResource, node.kind);
    const destination = node.kind === "energy" ? energy : warehouse;
    const before = node.kind === "energy" ? destination.energy : destination.materials[node.kind] ?? 0;
    room.updateAssignedWorker(unit, 1);
    assert.equal(node.kind === "energy" ? destination.energy : destination.materials[node.kind], before + 5);
  }
  assert.deepEqual(factory.materials, {});
  assert.deepEqual(depot.materials, {});
});

test("assignment is owner-only, validates source and preserves in-transit cargo", () => {
  const room = createRoom("warrior");
  const unit = worker(room, "crystalCollector", { nodeId: "crystal-1" });
  room.assignWorker({ sessionId: "other", send() {} }, { workerId: unit.id, nodeId: "iron-1" });
  assert.equal(unit.assignment.nodeId, "crystal-1");
  room.assignWorker(client, { workerId: unit.id, nodeId: "missing" });
  assert.equal(unit.assignment.nodeId, "crystal-1");
  unit.cargo = 3; unit.cargoResource = "energy";
  room.assignWorker(client, { workerId: unit.id, nodeId: "iron-1" });
  assert.equal(unit.assignment.nodeId, "crystal-1");
  assert.equal(unit.pendingAssignment.nodeId, "iron-1");
  assert.equal(unit.cargo, 3);
});

test("any worker takes any valid post; its job and mode follow the post", () => {
  // Tek tip isci: uzmanlik ve urun secimi yok, is atandigi yerden.
  const room = createRoom("warrior");
  const warehouse = build(room, "warehouse-1"); const factory = build(room, "warrior-7");
  const reactor = build(room, "warrior-8"); const depot = build(room, "repair-depot-1");
  const gun = build(room, "warrior-1");
  const messages = [];
  const listener = { sessionId: "p1", send: (type, value) => messages.push({ type, value }) };
  room.hireWorker(listener, {});
  const hired = room.drones.get(messages.find((message) => message.type === "worker:hired").value.workerId);
  const gatherer = room.drones.get("logistics-p1-crystalCollector");
  const posts = [[warehouse, "warehouse", "energyTransport"], [factory, "factory", "energyTransport"],
    [reactor, "energy", "energyTransport"], [depot, "repair", "repairer"]];
  for (const unit of [hired, gatherer]) {
    for (const [tower, postKind, mode] of posts) {
      // Mesajdaki eski `product` alani yok sayiliyor.
      room.assignWorker(client, { workerId: unit.id, sourceTowerId: tower.id, product: "energy" });
      assert.deepEqual(unit.assignment, { sourceTowerId: tower.id, postKind }, `${unit.id} -> ${tower.definition.id}`);
      assert.equal(unit.mode, mode, `${unit.id} -> ${tower.definition.id}`);
      assert.deepEqual(room.workerAssignments.get(unit.id), unit.assignment);
    }
    room.assignWorker(client, { workerId: unit.id, nodeId: "iron-1" });
    assert.deepEqual(unit.assignment, { nodeId: "iron-1" });
    assert.equal(unit.mode, "crystalCollector");
  }
  // Gorev yeri olmayan yapi, baskasinin ya da yikik bina, tukenmis dugum: atama degismiyor.
  const foreign = { ...reactor, id: "foreign-reactor", ownerId: "p2" }; room.towers.set(foreign.id, foreign);
  room.assignWorker(client, { workerId: hired.id, sourceTowerId: gun.id });
  room.assignWorker(client, { workerId: hired.id, sourceTowerId: foreign.id });
  depot.hp = 0;
  room.assignWorker(client, { workerId: hired.id, sourceTowerId: depot.id });
  room.resourceNodeRemaining.set("crystal-1", 0);
  room.assignWorker(listener, { workerId: hired.id, nodeId: "crystal-1" });
  assert.deepEqual(hired.assignment, { nodeId: "iron-1" });
  assert.equal(hired.mode, "crystalCollector");
  assert.deepEqual([messages.at(-1).type, messages.at(-1).value.key], ["worker:rejected", "worker.nodeDepleted"]);
});

test("old client's product field: materials at an armory or depot posts the worker at the warehouse", () => {
  // Yayindaki eski istemci urun seciyor ve hammadde tasiyicisini cephanelige
  // ya da Tamir Merkezi'ne gonderiyordu. Tek tip iscide bu is Hammadde Deposu'nda.
  const room = createRoom("warrior");
  const warehouse = build(room, "warehouse-1"); const factory = build(room, "warrior-7");
  const depot = build(room, "repair-depot-1"); const reactor = build(room, "warrior-8");
  room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
  const unit = worker(room, "energyTransport", undefined);
  // Oteki urunler binanin kendi isi.
  room.assignWorker(client, { workerId: unit.id, sourceTowerId: factory.id, product: "bullet" });
  assert.deepEqual(unit.assignment, { sourceTowerId: factory.id, postKind: "factory" });
  room.assignWorker(client, { workerId: unit.id, sourceTowerId: reactor.id, product: "energy" });
  assert.deepEqual(unit.assignment, { sourceTowerId: reactor.id, postKind: "energy" });
  for (const target of [factory, depot]) {
    room.assignWorker(client, { workerId: unit.id, sourceTowerId: target.id, product: "materials" });
    assert.deepEqual(unit.assignment, { postKind: "warehouse" }, target.definition.id);
    assert.equal(unit.mode, "energyTransport");
  }
  // Gorev yeri en yakin depo: depodaki girdiyi isteyen cephanelige tasiyor.
  const input = AMMO_RECIPES[factory.productionAmmo ?? "bullet"];
  warehouse.materials = { [input]: 20 };
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([unit.cargoResource, unit.targetTowerId, warehouse.materials[input]], [input, factory.id, 15]);
});

test("delivery effects see only the cargo left in hand, so nothing is handed out twice", () => {
  // Aktarma iskelesi teslimattan sonra elde kalani komsu kuleye veriyor; yuk
  // varis etkilerinden once dusulmeseydi teslim edilen ikinci kez dagitilirdi.
  const room = createRoom("warrior");
  const factory = build(room, "warrior-7");
  const gun = build(room, "warrior-1");
  room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
  const unit = worker(room, "energyTransport", { sourceTowerId: factory.id, postKind: "factory" });
  gun.ammo = gun.maxAmmo - 3;
  unit.cargo = 5; unit.cargoAmmoType = gun.ammoType; unit.targetTowerId = gun.id;
  const handed = [];
  room.applyAmmoTransportArrival = (carrier) => handed.push(carrier.cargo);
  room.updateAssignedWorker(unit, 1);
  assert.equal(gun.ammo, gun.maxAmmo);
  assert.deepEqual(handed, [2], "varis etkisi teslim edilen yuku de goruyor");
  assert.equal(unit.cargo, 2);
});

test("factory-posted worker carries only stocked ammunition, only to towers of that type", () => {
  const room = createRoom("warrior");
  const factory = build(room, "warrior-7");
  const gun = build(room, "warrior-1"); gun.ammo = 0;
  const aura = build(room, "warrior-3"); aura.ammo = 0;
  assert.deepEqual([gun.ammoType, aura.ammoType], ["bullet", "auraCrystal"]);
  factory.ammoStock = { powerCrystal: 8 }; factory.ammo = 8;
  room.moveLogisticsWorker = () => true;
  // Herhangi bir isci: burada dugumdeki bir toplayici cephanelige ataniyor.
  const unit = worker(room, "crystalCollector", { nodeId: "crystal-1" });
  room.assignWorker(client, { workerId: unit.id, sourceTowerId: factory.id });
  assert.deepEqual(unit.assignment, { sourceTowerId: factory.id, postKind: "factory" });
  // Stokta yalnizca guc kristali var ve onu kullanan kule yok: is yok.
  room.updateAssignedWorker(unit, 1);
  assert.equal(unit.cargo, 0);
  // Mermi geldi: yalnizca mermi kulesine.
  factory.ammoStock.bullet = 4;
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([unit.cargo, unit.cargoAmmoType, unit.targetTowerId], [4, "bullet", gun.id]);
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([gun.ammo, aura.ammo], [4, 0]);
  // Aura kristali geldi: aura kulesine. Mermi kulesi doymadi ama stokta mermisi yok.
  factory.ammoStock.auraCrystal = 3;
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([unit.cargo, unit.cargoAmmoType, unit.targetTowerId], [3, "auraCrystal", aura.id]);
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([gun.ammo, aura.ammo], [4, 3]);
  assert.equal(factory.ammoStock.powerCrystal, 8, "kullanan kulesi olmayan muhimmat tasindi");
  assert.equal(factory.ammo, 8);
});

test("three visible professions have research with actual resource-specific effects", () => {
  assert.equal(ACTIVE_WORKER_ROLES.length, 3);
  for (const role of ACTIVE_WORKER_ROLES) assert.equal(WORKER_DEVELOPMENT_CELLS[role].length, 9);
  const room = createRoom("warrior"); const unit = worker(room, "crystalCollector", {});
  room.state.players.get("p1").workerSkillIds = ["gather-iron-1"];
  assert.equal(room.getEconomyResearchMultiplier(unit, "gather", "iron"), 1.3);
  assert.equal(room.getEconomyResearchMultiplier(unit, "gather", "energy"), 1);
});

test("repair depot reaches level five with double health and 200 storage", () => {
  const room = createRoom("warrior");
  const depot = build(room, "repair-depot-1");
  const baseHp = depot.maxHp;
  room.state.players.get("p1").experience = 1000000;
  for (let i = 0; i < 5; i++) room.upgradeTower(client, { towerId: depot.id });
  assert.equal(depot.level, 5);
  assert.equal(depot.maxHp, baseHp * 2);
  assert.equal(depot.maxEnergy, 200);
  depot.energy = 200; depot.materials.iron = 200; depot.repairParts = 198;
  room.updateResourceFactories(1);
  assert.equal(depot.repairParts, 200);
  assert.equal(depot.materials.iron, 198);
});

test("queued gather assignment delivers original resource before switching", () => {
  const room = createRoom("warrior");
  const reactor = build(room, "warrior-8"); reactor.energy = 0;
  build(room, "warehouse-1");
  room.moveLogisticsWorker = () => true;
  const unit = worker(room, "crystalCollector", { nodeId: "crystal-1" });
  unit.cargo = 3; unit.cargoResource = "energy";
  room.assignWorker(client, { workerId: unit.id, nodeId: "iron-1" });
  room.updateAssignedWorker(unit, 1);
  assert.equal(reactor.energy, 3);
  room.updateAssignedWorker(unit, 100);
  assert.equal(unit.assignment.nodeId, "iron-1");
  assert.equal(unit.cargoResource, "iron");
});

test("generic research enforces cell order and applies only the selected resource", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1"); player.experience = 10000;
  room.unlockWorkerDevelopment(client, { role: "crystalCollector", skillId: "gather-gunpowder-1" });
  assert.deepEqual(player.workerSkillIds ?? [], []);
  room.unlockWorkerDevelopment(client, { role: "crystalCollector", skillId: "gather-energy-1" });
  room.unlockWorkerDevelopment(client, { role: "crystalCollector", skillId: "gatherLoad-energy-1" });
  assert.deepEqual(player.workerSkillIds, ["gather-energy-1"]);
  room.unlockWorkerDevelopment(client, { role: "crystalCollector", skillId: "gatherLoad-gunpowder-1" });
  const unit = worker(room, "crystalCollector", {});
  assert.equal(room.getEconomyResearchMultiplier(unit, "gather", "energy"), 1.3);
  assert.equal(room.getEconomyResearchMultiplier(unit, "gatherLoad", "gunpowder"), 1.3);
  assert.equal(room.getEconomyResearchMultiplier(unit, "gather", "iron"), 1);
});

test("emergency rebuild consumes depot parts and cannot bypass missing supply", () => {
  const room = createRoom("warrior");
  const target = build(room, "warrior-1");
  const unit = worker(room, "repairer", { postKind: "repair" }); unit.skillIds = ["repair-emergency-rebuild"];
  assert.equal(room.tryEmergencyRebuild(target), false);
  const depot = build(room, "repair-depot-1"); depot.repairParts = 20;
  assert.equal(room.tryEmergencyRebuild(target), true);
  assert.equal(depot.repairParts, 20 - target.maxHp * 0.2 / REPAIR_HP_PER_PART);
  assert.equal(room.tryEmergencyRebuild(target), false);
});


test("finite deposits share reserves across workers and preserve the last partial load", () => {
  const room = createRoom("warrior");
  const depot = build(room, "warehouse-1");
  room.moveLogisticsWorker = () => true;
  room.resourceNodeRemaining.set("iron-1", 7);
  const first = worker(room, "crystalCollector", { nodeId: "iron-1" });
  const second = { ...first, id: "second" }; room.drones.set(second.id, second);
  room.updateAssignedWorker(first, 100);
  room.updateAssignedWorker(second, 100);
  assert.equal(first.cargo, 5);
  assert.equal(second.cargo, 2);
  assert.equal(room.getMaterialNodes().find(node => node.id === "iron-1").remaining, 0);
  room.updateAssignedWorker(first, 1);
  room.updateAssignedWorker(second, 1);
  assert.equal(depot.materials.iron, 7);
  room.updateAssignedWorker(first, 100);
  room.updateAssignedWorker(second, 100);
  assert.equal(first.cargo, 0);
  assert.equal(second.cargo, 0);
  assert.equal(depot.materials.iron, 7);
  room.setupPhase = true; room.ensureLogisticsWorkers();
  assert.equal(room.getNodeRemaining("iron-1"), 0);
});

test("all energy and material nodes have isolated finite reserves", () => {
  const room = createRoom("warrior");
  const nodes = room.getEconomyNodes();
  for (const node of nodes) {
    assert.equal(node.remaining, 3000);
    assert.equal(room.extractNodeResource(node.id, 4000), 3000);
    assert.equal(room.extractNodeResource(node.id, 1), 0);
  }
  assert.ok(room.getEconomyNodes().every(node => node.remaining === 0));
  const freshRoom = createRoom("warrior");
  assert.ok(freshRoom.getEconomyNodes().every(node => node.remaining === 3000));
});


test("factories select independent recipes and preserve existing finished stock", () => {
  const room = createRoom("warrior");
  const a = build(room, "warrior-7"); const b = build(room, "warrior-7");
  a.materials = { gunpowder: 10, mystic: 10 }; b.materials = { gunpowder: 10, mystic: 10 };
  room.setFactoryProduction(client, { towerId: b.id, ammoType: "auraCrystal" });
  room.setFactoryProduction({ sessionId: "other" }, { towerId: a.id, ammoType: "auraCrystal" });
  room.setFactoryProduction(client, { towerId: a.id, ammoType: "invalid" });
  room.updateResourceFactories(2);
  assert.deepEqual(a.ammoStock, { bullet: 1 }); assert.deepEqual(b.ammoStock, { auraCrystal: 1 });
  assert.equal(a.materials.mystic, 10); assert.equal(b.materials.gunpowder, 10);
  room.setFactoryProduction(client, { towerId: a.id, ammoType: "auraCrystal" });
  room.updateResourceFactories(2);
  assert.deepEqual(a.ammoStock, { bullet: 1, auraCrystal: 1 });
});

test("warehouse-posted worker feeds the neediest consumer, returns obsolete input and supplies repair iron", () => {
  // Hammadde Deposu'na atanan isci deponun stogunu ihtiyaci olan her yere
  // tasiyor: cephaneligin tarifinin girdisi, Tamir Merkezi'nin demiri. Sira
  // en bos alicidan (doluluk orani; `deliveryScore`).
  const room = createRoom("warrior");
  const warehouse = build(room, "warehouse-1"); warehouse.materials = { gunpowder: 10, mystic: 10, iron: 10 };
  const factory = build(room, "warrior-7"); const depot = build(room, "repair-depot-1");
  depot.materials.iron = 10; // yari dolu; bos cephanelik daha ihtiyacli
  room.moveLogisticsWorker = () => true;
  room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
  const unit = worker(room, "crystalCollector", { nodeId: "crystal-1" });
  room.assignWorker(client, { workerId: unit.id, sourceTowerId: warehouse.id, product: "energy" });
  assert.deepEqual(unit.assignment, { sourceTowerId: warehouse.id, postKind: "warehouse" });
  assert.equal(unit.mode, "energyTransport");
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([unit.cargo, unit.cargoResource, unit.targetTowerId], [5, "gunpowder", factory.id]);
  assert.equal(warehouse.materials.gunpowder, 5);
  // Tarif yuk yoldayken degisti: barutun alicisi kalmadi, depoya geri donuyor.
  room.setFactoryProduction(client, { towerId: factory.id, ammoType: "auraCrystal" });
  room.updateAssignedWorker(unit, 1);
  assert.equal(warehouse.materials.gunpowder, 10); assert.equal(unit.cargo, 0);
  assert.equal(factory.materials.gunpowder, undefined);
  // Yeni tarifin girdisi (mistik) cephanelige.
  room.updateAssignedWorker(unit, 1); room.updateAssignedWorker(unit, 1);
  assert.equal(factory.materials.mystic, 5); assert.equal(warehouse.materials.mystic, 5);
  // Merkezin demiri bitti: en bos alici artik o, ayni isci demir tasiyor.
  depot.materials.iron = 0;
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([unit.cargo, unit.cargoResource, unit.targetTowerId], [5, "iron", depot.id]);
  room.updateAssignedWorker(unit, 1);
  assert.equal(depot.materials.iron, 5); assert.equal(warehouse.materials.iron, 5);
  assert.equal(factory.materials.mystic, 5, "daha dolu cephanelik bos merkezden once beslendi");
});

test("gatherers cannot bypass a missing warehouse; in-flight input reserves the consumer's room", () => {
  const room = createRoom("warrior"); const factory = build(room, "warrior-7");
  room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
  const collector = worker(room, "crystalCollector", { nodeId: "ammo-source-1" });
  room.updateAssignedWorker(collector, 100); assert.equal(collector.cargo, 0);
  const warehouse = build(room, "warehouse-1"); warehouse.materials.gunpowder = 20;
  factory.materials.gunpowder = 18;
  const first = worker(room, "energyTransport", { sourceTowerId: warehouse.id, postKind: "warehouse" });
  const second = { ...first, id: "second-carrier" }; room.drones.set(second.id, second);
  room.updateAssignedWorker(first, 1); room.updateAssignedWorker(second, 1);
  // Cephaneligin kalan 2 birimlik yeri birincinin yoldaki yukuyle dolu: ikinci isci yuk almiyor.
  assert.equal(first.cargo, 2); assert.equal(second.cargo, 0);
  assert.equal(warehouse.materials.gunpowder, 18);
  // Alici yikildi ve baska alici yok: yuk depoya geri donuyor, kaybolmuyor.
  factory.hp = 0;
  room.updateAssignedWorker(first, 1);
  assert.equal(warehouse.materials.gunpowder, 20); assert.equal(first.cargo, 0);
});

test("cargo whose consumer is gone goes to another consumer, else back to a store with room", () => {
  {
    // Enerji: alici doldu, baska alici yok -> enerji binasina geri.
    const room = createRoom("warrior");
    const reactor = build(room, "warrior-8");
    const gun = build(room, "warrior-1"); gun.energy = gun.maxEnergy - 4;
    room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
    const unit = worker(room, "energyTransport", { sourceTowerId: reactor.id, postKind: "energy" });
    reactor.energy = 10;
    room.updateAssignedWorker(unit, 1);
    assert.deepEqual([unit.cargo, unit.cargoResource, unit.targetTowerId, reactor.energy], [4, "energy", gun.id, 6]);
    gun.energy = gun.maxEnergy;
    room.updateAssignedWorker(unit, 1);
    assert.deepEqual([unit.cargo, reactor.energy], [0, 10], "alicisi kalmayan enerji binaya donmedi");
  }
  {
    // Muhimmat: hedef kule sevkiyati kapatti -> ayni turden oteki kule; o da
    // kapaninca cephaneligin stoguna.
    const room = createRoom("warrior");
    const factory = build(room, "warrior-7");
    const first = build(room, "warrior-1"); const second = build(room, "warrior-1");
    first.ammo = 0; second.ammo = 0;
    factory.ammoStock = { bullet: 6 }; factory.ammo = 6;
    room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
    const unit = worker(room, "energyTransport", { sourceTowerId: factory.id, postKind: "factory" });
    room.updateAssignedWorker(unit, 1);
    assert.equal(unit.cargo, 5);
    const locked = room.towers.get(unit.targetTowerId);
    const other = locked === first ? second : first;
    locked.ammoLogisticsEnabled = false;
    room.updateAssignedWorker(unit, 1);
    assert.deepEqual([other.ammo, locked.ammo, unit.cargo], [5, 0, 0], "yuk ayni turden oteki kuleye gitmedi");
    room.updateAssignedWorker(unit, 1);
    assert.deepEqual([unit.cargo, unit.targetTowerId], [1, other.id]);
    other.ammoLogisticsEnabled = false;
    room.updateAssignedWorker(unit, 1);
    assert.equal(unit.cargo, 0);
    assert.deepEqual([factory.ammoStock.bullet, factory.ammo], [1, 1], "alicisi kalmayan muhimmat cephanelige donmedi");
  }
});

test("reassigned worker with nowhere to put its cargo drops it and switches instead of waiting", () => {
  // Atama yokken yuk bekliyor (yer acilinca teslim). Oyuncu isciyi baska ise
  // verdiyse ve yukun koyacak hicbir yeri yoksa yuk birakiliyor; isci takili kalmiyor.
  {
    // Tasiyici: alici yok, enerji binasi dolu.
    const room = createRoom("warrior");
    const reactor = build(room, "warrior-8"); reactor.energy = 1e6;
    room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
    const unit = worker(room, "energyTransport", { sourceTowerId: reactor.id, postKind: "energy" });
    unit.cargo = 4; unit.cargoResource = "energy";
    room.updateAssignedWorker(unit, 1);
    assert.equal(unit.cargo, 4, "atama yokken yuk birakildi");
    room.assignWorker(client, { workerId: unit.id, nodeId: "crystal-1" });
    assert.equal(unit.pendingAssignment.nodeId, "crystal-1");
    room.updateAssignedWorker(unit, 1);
    assert.deepEqual([unit.cargo, unit.cargoResource, unit.targetTowerId], [0, undefined, undefined]);
    assert.equal(reactor.energy, 1e6, "dolu binaya yuk eklendi");
    room.updateAssignedWorker(unit, 1);
    assert.deepEqual([unit.assignment.nodeId, unit.mode, unit.pendingAssignment], ["crystal-1", "crystalCollector", undefined]);
  }
  {
    // Yer var ama yol kapali (duvar): yuk birakilmiyor, yol acilinca teslim edilecek.
    const room = createRoom("warrior");
    const reactor = build(room, "warrior-8"); reactor.energy = 0;
    room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => undefined;
    const unit = worker(room, "energyTransport", { sourceTowerId: reactor.id, postKind: "energy" });
    unit.cargo = 4; unit.cargoResource = "energy";
    room.assignWorker(client, { workerId: unit.id, nodeId: "crystal-1" });
    room.updateAssignedWorker(unit, 1);
    assert.equal(unit.cargo, 4, "yolu kapali ama yeri olan bina varken yuk birakildi");
    assert.equal(unit.pendingAssignment.nodeId, "crystal-1");
  }
  {
    // Toplayici: yeri olan enerji binasi yok.
    const room = createRoom("warrior");
    const reactor = build(room, "warrior-8"); reactor.energy = 1e6;
    room.moveLogisticsWorker = () => true;
    const unit = worker(room, "crystalCollector", { nodeId: "crystal-1" });
    unit.cargo = 3; unit.cargoResource = "energy";
    room.updateAssignedWorker(unit, 1);
    assert.equal(unit.cargo, 3, "atama yokken yuk birakildi");
    room.assignWorker(client, { workerId: unit.id, sourceTowerId: reactor.id });
    room.updateAssignedWorker(unit, 1);
    assert.equal(unit.cargo, 0);
    room.updateAssignedWorker(unit, 1);
    assert.deepEqual([unit.assignment.postKind, unit.mode], ["energy", "energyTransport"]);
  }
  {
    // Tamirci: Tamir Merkezi de onaracak yapi da yok.
    const room = createRoom("warrior");
    room.moveLogisticsWorker = () => true;
    const unit = worker(room, "repairer", { postKind: "repair" });
    unit.cargo = 3;
    room.updateRepairWorker(unit, 1);
    assert.equal(unit.cargo, 3, "atama yokken parca birakildi");
    room.assignWorker(client, { workerId: unit.id, nodeId: "crystal-1" });
    room.updateRepairWorker(unit, 1);
    assert.equal(unit.cargo, 0);
    room.updateRepairWorker(unit, 1);
    assert.deepEqual([unit.assignment.nodeId, unit.mode], ["crystal-1", "crystalCollector"]);
  }
});

test("transport research follows the carried cargo, not a chosen product", () => {
  // Arastirma yukun turuyle: ayni isci barut tasirken mistik arastirmasindan
  // yararlanmiyor, mistik tasirken hem fazla yukluyor hem hizli yuruyor.
  const room = createRoom("warrior");
  const warehouse = build(room, "warehouse-1"); warehouse.materials = { gunpowder: 20, mystic: 20 };
  const bullets = build(room, "warrior-7"); const auras = build(room, "warrior-7");
  room.setFactoryProduction(client, { towerId: auras.id, ammoType: "auraCrystal" });
  auras.materials.mystic = 10; // barut cephaneligi daha bos: ilk sefer barut
  room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
  room.state.players.get("p1").workerSkillIds = ["transport-mystic-1", "transportSpeed-mystic-1"];
  const unit = worker(room, "energyTransport", { sourceTowerId: warehouse.id, postKind: "warehouse" });
  const speed = () => {
    Object.assign(unit, { x: 0, y: 0 });
    room.stepWorkerToward(unit, 1000, 0, 0.01);
    return Math.hypot(unit.vx, unit.vy);
  };
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([unit.cargoResource, unit.cargo, unit.targetTowerId], ["gunpowder", 5, bullets.id]);
  const gunpowderSpeed = speed();
  room.updateAssignedWorker(unit, 1);
  assert.equal(bullets.materials.gunpowder, 5);
  bullets.materials.gunpowder = 20;
  room.updateAssignedWorker(unit, 1);
  assert.deepEqual([unit.cargoResource, unit.cargo, unit.targetTowerId], ["mystic", 5 * 1.3, auras.id]);
  assert.ok(Math.abs(speed() - gunpowderSpeed * 1.3) < 1e-9, "tasima hizi tasinan yukun turunu izlemiyor");
});
