import test from "node:test";
import assert from "node:assert/strict";
import {
  AMMO_COLLECTOR_WORKER_SKILL_TIERS,
  AMMO_TRANSPORT_WORKER_SKILL_TIERS,
  CRYSTAL_WORKER_SKILL_TIERS,
  REPAIR_WORKER_SKILL_TIERS,
  WORKER_SPECIALIZATION_CHOICES,
  WORKER_DEVELOPMENT_XP_COSTS
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

test("generic worker chooses one specialization before its three permanent tiers", () => {
  const room = createRoom("warrior");
  const messages = [];
  const choiceClient = { sessionId: "p1", send(type, value) { messages.push({ type, value }); } };
  room.hireWorker(choiceClient, { advanced: false });
  const player = room.state.players.get("p1");
  const worker = player.hiredWorkers.at(-1);
  assert.equal(messages.at(-1).type, "worker:specialization-choice");
  assert.equal(messages.at(-1).value.options.length, WORKER_SPECIALIZATION_CHOICES.length);
  room.chooseWorkerSpecialization(choiceClient, { workerId: worker.id, role: "repairer" });
  assert.equal(worker.role, "repairer");
  assert.equal(messages.at(-1).type, "worker:skill-choice");
  assert.equal(messages.at(-1).value.role, "repairer");
  for (const [first] of REPAIR_WORKER_SKILL_TIERS) room.chooseWorkerSkill(choiceClient, { workerId: worker.id, skillId: first.id });
  assert.deepEqual(worker.skillIds, REPAIR_WORKER_SKILL_TIERS.map(([first]) => first.id));
  assert.equal(messages.at(-1).type, "worker:skill-complete");
  const drone = [...room.drones.values()].find((entry) => entry.hiredWorkerId === worker.id);
  assert.deepEqual(drone.skillIds, worker.skillIds);
});

test("every non-energy specialization exposes three binary choices", () => {
  for (const tiers of [CRYSTAL_WORKER_SKILL_TIERS, AMMO_COLLECTOR_WORKER_SKILL_TIERS, AMMO_TRANSPORT_WORKER_SKILL_TIERS, REPAIR_WORKER_SKILL_TIERS]) {
    assert.equal(tiers.length, 3);
    for (const pair of tiers) assert.equal(pair.length, 2);
  }
});

test("worker development tree spends XP once and applies to every role cell", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.experience = WORKER_DEVELOPMENT_XP_COSTS[0] + 10;
  room.unlockWorkerDevelopment(client, { role: "repairer", skillId: "repair-bulwark" });
  assert.equal(player.experience, 10);
  assert.deepEqual(player.workerSkillIds, ["repair-bulwark"]);
  room.hireWorker(client, { advanced: false });
  const hired = player.hiredWorkers.at(-1);
  room.chooseWorkerSpecialization(client, { workerId: hired.id, role: "repairer" });
  room.ensureLogisticsWorkers();
  const repairers = [...room.drones.values()].filter((worker) => worker.ownerId === "p1" && worker.mode === "repairer");
  assert.ok(repairers.length > 0);
  assert.ok(repairers.every((worker) => room.hasWorkerSkill(worker, "repair-bulwark")));
});

test("crystal reserve and conduit change reactor failure and tower topology", () => {
  const room = createRoom("warrior");
  const reactorSpot = findBuildableSpot(room, "warrior-8");
  room.placeTower(client, { ...reactorSpot, definitionId: "warrior-8" });
  const reactor = [...room.towers.values()][0];
  const towerSpot = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...towerSpot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][1];
  const worker = { id: "crystal", ownerId: "p1", mode: "crystalCollector", skillIds: ["crystal-reserve", "crystal-conduit"], x: reactor.x, y: reactor.y, logisticsPhase: "deliver", targetTowerId: reactor.id, cargo: 5, capacity: 9, speed: 82, vx: 0, vy: 0 };
  room.drones.set(worker.id, worker);
  room.applyCrystalWorkerArrival(worker, reactor, false);
  assert.equal(reactor.crystalReserve, 12);
  reactor.energy = 0;
  assert.ok(room.getTowerAvailableEnergy(reactor) >= 12);
  assert.equal(reactor.crystalReserve, 0);
  room.applyCrystalWorkerArrival(worker, reactor, false);
  assert.equal(tower.energyConduitSourceId, reactor.id);
  reactor.energy = 20;
  tower.energy = 0;
  assert.ok(room.getTowerAvailableEnergy(tower) >= 20);
});

test("ammo collector and transport skills alter factory output and tower recovery", () => {
  const room = createRoom("warrior");
  const factorySpot = findBuildableSpot(room, "warrior-7");
  room.placeTower(client, { ...factorySpot, definitionId: "warrior-7" });
  const factory = [...room.towers.values()][0];
  const towerSpot = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...towerSpot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][1];
  const collector = { id: "collector", ownerId: "p1", mode: "ammoCollector", skillIds: ["ammo-refiner", "ammo-cast-shell", "ammo-emergency-refinery"], x: factory.x, y: factory.y, logisticsPhase: "deliver", targetTowerId: factory.id, cargo: 6, capacity: 9, speed: 82, vx: 0, vy: 0 };
  room.drones.set(collector.id, collector);
  factory.energy = 0;
  factory.rawAmmo = 6;
  room.applyAmmoCollectorArrival(collector, factory);
  assert.equal(factory.ammo, 6);
  assert.equal(factory.ammoFactoryShield, 20);
  assert.ok(factory.ammoRefinerUntil > Date.now());
  const transport = { id: "transport", ownerId: "p1", mode: "ammoTransport", skillIds: ["ammo-special-payload", "ammo-emergency-magazine"], cargoSpecial: true, cargoAmmoPayloadKind: "special" };
  room.applyAmmoTransportArrival(transport, tower, true);
  assert.equal(tower.ammoPayloadShots, 6);
  assert.equal(tower.ammoEmergencyShots, 3);
});
