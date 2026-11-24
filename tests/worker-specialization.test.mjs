import test from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_RULES } from "../apps/server/dist/rooms/MatchRoom.js";
import {
  AMMO_COLLECTOR_WORKER_SKILL_TIERS,
  AMMO_TRANSPORT_WORKER_SKILL_TIERS,
  CRYSTAL_WORKER_SKILL_TIERS,
  REPAIR_WORKER_SKILL_TIERS,
  TUTORIAL_TRACKED_MESSAGES,
  WORKER_DEVELOPMENT_XP_COSTS,
  getWorkerHireCost
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function build(room, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { ...spot, definitionId });
  return [...room.towers.values()].at(-1);
}

/**
 * Tek tip isci (sahibin istegi, 2026-11-24): uzmanlik adimi kalkti. Alinan
 * isci rolsuz ve bosta; isi atandigi yerden geliyor ve yeniden atamayla
 * degisiyor. Kip (`mode`) isin aynasi.
 */
test("a hired worker has no specialization step: it waits idle and its post gives its job", () => {
  const room = createRoom("warrior");
  const messages = [];
  const choiceClient = { sessionId: "p1", send(type, value) { messages.push({ type, value }); } };
  room.hireWorker(choiceClient, { advanced: false });
  const player = room.state.players.get("p1");
  const worker = player.hiredWorkers.at(-1);
  // Uzmanlik penceresi de mesaji da yok: alim yalnizca bildiriliyor.
  assert.deepEqual(messages.map(({ type }) => type), ["worker:hired"]);
  assert.equal(worker.role, undefined);
  assert.equal(MESSAGE_RULES["worker:specialization"], undefined, "eski uzmanlik mesaji hala kabul ediliyor");
  assert.equal(TUTORIAL_TRACKED_MESSAGES["worker:specialization"], undefined);
  assert.equal(room.chooseWorkerSpecialization, undefined);
  const drone = room.drones.get(messages[0].value.workerId);
  assert.equal(drone.hiredWorkerId, worker.id);
  assert.equal(drone.assignment, undefined);

  // Is atamadan: Tamir Merkezi tamirci, dugum toplayici, enerji binasi tasiyici.
  const depot = build(room, "repair-depot-1");
  room.assignWorker(choiceClient, { workerId: drone.id, sourceTowerId: depot.id });
  assert.deepEqual([drone.mode, drone.assignment], ["repairer", { sourceTowerId: depot.id, postKind: "repair" }]);
  room.assignWorker(choiceClient, { workerId: drone.id, nodeId: "crystal-1" });
  assert.deepEqual([drone.mode, drone.assignment], ["crystalCollector", { nodeId: "crystal-1" }]);
  const reactor = build(room, "warrior-8");
  room.assignWorker(choiceClient, { workerId: drone.id, sourceTowerId: reactor.id });
  assert.deepEqual([drone.mode, drone.assignment], ["energyTransport", { sourceTowerId: reactor.id, postKind: "energy" }]);

  // Rolsuz iscinin per-worker kademesi yok; gelisim agaci oyuncu basina (asagida).
  room.chooseWorkerSkill(choiceClient, { workerId: worker.id, skillId: REPAIR_WORKER_SKILL_TIERS[0][0].id });
  assert.deepEqual(worker.skillIds, []);
  assert.deepEqual(messages.map(({ type }) => type), ["worker:hired"]);
});

test("hiring again charges again: no worker waits on a choice", () => {
  // Eskiden secim yapilmadan basilan ikinci alim secimi yeniden aciyor ve
  // altin almiyordu. Bekleyen secim olmadigi icin her alim yeni bir isci.
  const room = createRoom("warrior");
  const messages = [];
  const choiceClient = { sessionId: "p1", send(type, value) { messages.push({ type, value }); } };
  const player = room.state.players.get("p1");
  const startGold = player.gold;
  room.hireWorker(choiceClient, { advanced: false });
  room.hireWorker(choiceClient, { advanced: false });
  assert.equal(player.hiredWorkers.length, 2);
  assert.equal(startGold - player.gold, getWorkerHireCost(0) + getWorkerHireCost(1));
  assert.deepEqual(messages.map(({ type }) => type), ["worker:hired", "worker:hired"]);
  const workerIds = messages.map(({ value }) => value.workerId);
  assert.equal(new Set(workerIds).size, 2, "ikinci alim ilk isciyi yeniden acti");
  assert.ok(workerIds.every((id) => room.drones.get(id)?.assignment === undefined), "yeni isci bosta degil");

  // Altin yetmezse ne alim ne bildirim var.
  player.gold = 0;
  room.hireWorker(choiceClient, { advanced: true });
  assert.equal(player.hiredWorkers.length, 2);
  assert.equal(messages.length, 2);
});

test("every non-energy specialization exposes three binary choices", () => {
  for (const tiers of [CRYSTAL_WORKER_SKILL_TIERS, AMMO_COLLECTOR_WORKER_SKILL_TIERS, AMMO_TRANSPORT_WORKER_SKILL_TIERS, REPAIR_WORKER_SKILL_TIERS]) {
    assert.equal(tiers.length, 3);
    for (const pair of tiers) assert.equal(pair.length, 2);
  }
});

test("worker development tree spends XP once and applies to every worker doing that job", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.experience = WORKER_DEVELOPMENT_XP_COSTS[0] + WORKER_DEVELOPMENT_XP_COSTS[1] + WORKER_DEVELOPMENT_XP_COSTS[2] + 10;
  // Hucreler sirayla aciliyor: oyun degistirici (3. hucre) yon ve derinlestirmeden sonra.
  room.unlockWorkerDevelopment(client, { role: "repairer", skillId: "repair-bulwark" });
  assert.deepEqual(player.workerSkillIds ?? [], []);
  for (const skillId of ["repair-tune-up", "repair-fine-tune", "repair-bulwark"]) room.unlockWorkerDevelopment(client, { role: "repairer", skillId });
  assert.equal(player.experience, 10);
  assert.deepEqual(player.workerSkillIds, ["repair-tune-up", "repair-fine-tune", "repair-bulwark"]);
  room.hireWorker(client, { advanced: false });
  const hired = player.hiredWorkers.at(-1);
  room.ensureLogisticsWorkers();
  const drone = [...room.drones.values()].find((entry) => entry.hiredWorkerId === hired.id);
  // Agacin tamirci etkileri tamir isini yapan bir isci istiyor; henuz yok.
  assert.equal(room.hasWorkerSkillForOwner("p1", "repairer", "repair-bulwark"), false);
  // Uzmanlik secimi yerine atama: Tamir Merkezi'ne atanan isci tamirci.
  const depot = build(room, "repair-depot-1");
  room.assignWorker(client, { workerId: drone.id, sourceTowerId: depot.id });
  const repairers = [...room.drones.values()].filter((worker) => worker.ownerId === "p1" && worker.mode === "repairer");
  assert.deepEqual(repairers.map((worker) => worker.id), [drone.id]);
  assert.ok(repairers.every((worker) => room.hasWorkerSkill(worker, "repair-bulwark") && room.hasWorkerSkill(worker, "repair-fine-tune")));
  assert.equal(room.hasWorkerSkillForOwner("p1", "repairer", "repair-bulwark"), true);
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
