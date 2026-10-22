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
  const unit = worker(room, "repairer", {});
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

test("carrier can only deliver the selected ammunition type", () => {
  const room = createRoom("warrior");
  const factory = build(room, "warrior-7");
  const gun = build(room, "warrior-1"); gun.ammo = 0;
  factory.ammoStock = { auraCrystal: 8, bullet: 4 }; factory.ammo = 12;
  room.moveLogisticsWorker = () => true;
  const unit = worker(room, "energyTransport", { product: "auraCrystal", sourceTowerId: factory.id });
  room.updateAssignedWorker(unit, 1);
  assert.equal(unit.cargo, 0);
  unit.assignment.product = "bullet";
  room.updateAssignedWorker(unit, 1);
  assert.equal(unit.cargo, 4);
  room.updateAssignedWorker(unit, 1);
  assert.equal(gun.ammo, 4);
  assert.equal(factory.ammoStock.auraCrystal, 8);
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
  const unit = worker(room, "repairer", {}); unit.skillIds = ["repair-emergency-rebuild"];
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

test("assigned carriers pull only required input, return obsolete cargo and supply repair iron", () => {
  const room = createRoom("warrior");
  const warehouse = build(room, "warehouse-1"); warehouse.materials = { gunpowder: 10, mystic: 10, iron: 10 };
  const factory = build(room, "warrior-7"); const depot = build(room, "repair-depot-1");
  const unit = worker(room, "energyTransport", { product: "energy" });
  room.moveLogisticsWorker = () => true;
  room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
  room.assignWorker(client, { workerId: unit.id, sourceTowerId: factory.id, product: "materials" });
  room.updateAssignedWorker(unit, 1);
  assert.equal(unit.cargo, 5); assert.equal(unit.cargoResource, "gunpowder");
  assert.equal(warehouse.materials.gunpowder, 5);
  room.setFactoryProduction(client, { towerId: factory.id, ammoType: "auraCrystal" });
  room.updateAssignedWorker(unit, 1);
  assert.equal(warehouse.materials.gunpowder, 10); assert.equal(unit.cargo, 0);
  room.updateAssignedWorker(unit, 1); room.updateAssignedWorker(unit, 1);
  assert.equal(factory.materials.mystic, 5); assert.equal(factory.materials.gunpowder, undefined);
  room.assignWorker(client, { workerId: unit.id, sourceTowerId: depot.id, product: "materials" });
  room.updateAssignedWorker(unit, 1); room.updateAssignedWorker(unit, 1);
  assert.equal(depot.materials.iron, 5); assert.equal(warehouse.materials.iron, 5);
});

test("gatherers cannot bypass a missing warehouse; input loading reserves capacity", () => {
  const room = createRoom("warrior"); const factory = build(room, "warrior-7");
  room.moveLogisticsWorker = () => true; room.getWorkerApproachPoint = () => ({ x: 0, y: 0 });
  const collector = worker(room, "crystalCollector", { nodeId: "ammo-source-1" });
  room.updateAssignedWorker(collector, 100); assert.equal(collector.cargo, 0);
  const warehouse = build(room, "warehouse-1"); warehouse.materials.gunpowder = 20;
  factory.materials.gunpowder = 18;
  const first = worker(room, "energyTransport", { sourceTowerId: factory.id, product: "materials" });
  const second = { ...first, id: "second-carrier" }; room.drones.set(second.id, second);
  room.updateAssignedWorker(first, 1); room.updateAssignedWorker(second, 1);
  assert.equal(first.cargo, 2); assert.equal(second.cargo, 0);
  factory.hp = 0;
  room.updateAssignedWorker(first, 1);
  assert.equal(warehouse.materials.gunpowder, 20); assert.equal(first.cargo, 0);
});
