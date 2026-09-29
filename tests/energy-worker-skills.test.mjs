import test from "node:test";
import assert from "node:assert/strict";
import { ENERGY_WORKER_SKILL_TIERS, FREQUENCY_SHARE_ENERGY_RATIO, LOAD_SHEDDER_CRISIS_ENERGY_RATIO, getMapGridSize } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const messages = [];
const client = { sessionId: "p1", send(type, value) { messages.push({ type, value }); } };

test("energy worker skills are chosen one tier at a time and remain on the hired worker", () => {
  const room = createRoom("warrior");
  room.hireWorker(client, { role: "energyTransport" });
  const player = room.state.players.get("p1");
  const worker = player.hiredWorkers.at(-1);
  assert.equal(worker.role, "energyTransport");
  assert.equal(worker.skillIds.length, 0);
  assert.equal(messages.at(-1).type, "worker:skill-choice");
  for (const pair of ENERGY_WORKER_SKILL_TIERS) room.chooseWorkerSkill(client, { workerId: worker.id, skillId: pair[0].id });
  assert.deepEqual(worker.skillIds, ENERGY_WORKER_SKILL_TIERS.map(([option]) => option.id));
  assert.equal(messages.at(-1).type, "worker:skill-complete");
  room.ensureLogisticsWorkers();
  const drone = [...room.drones.values()].find((entry) => entry.id.endsWith(`:${worker.id}`));
  assert.deepEqual(drone.skillIds, worker.skillIds);
  room.chooseWorkerSkill(client, { workerId: worker.id, skillId: "energy-relay" });
  assert.equal(worker.skillIds.length, 3, "permanent choices can not be replaced");
});

test("relay arrival powers an adjacent tower from the delivered tower's pool", () => {
  const room = createRoom("warrior");
  const first = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...first, definitionId: "warrior-1" });
  const source = [...room.towers.values()].at(-1);
  room.placeTower(client, { x: first.x + getMapGridSize(room.activeMap), y: first.y, definitionId: "warrior-1" });
  const neighbor = [...room.towers.values()].at(-1);
  const worker = { id: "relay", ownerId: "p1", mode: "energyTransport", skillIds: ["energy-relay"], x: source.x, y: source.y, logisticsPhase: "deliver", targetTowerId: source.id, cargo: 5, capacity: 9, speed: 82, vx: 0, vy: 0 };
  room.drones.set(worker.id, worker);
  room.applyEnergyWorkerArrival(worker, source);
  assert.equal(neighbor.energyRelaySourceId, source.id);
  source.energy = 20;
  neighbor.energy = 0;
  assert.ok(room.getTowerAvailableEnergy(neighbor) >= 20);
  assert.equal(room.getTowerAvailableEnergy(source), source.energy);
});

test("local capacitor allows a tower to fire through a local reserve only", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  tower.energy = 0;
  tower.energyLocalReserve = 18;
  assert.ok(room.getTowerAvailableEnergy(tower) >= 18);
  room.consumeTowerEnergy(tower, 7);
  assert.equal(tower.energy, 0);
  assert.equal(tower.energyLocalReserve, 11);
});

test("emergency bridge and scenario charge change firing without changing worker throughput", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  tower.energy = 0;
  tower.energyBridgeUntil = Date.now() + 4000;
  assert.equal(room.canTowerFire(tower), true);
  tower.energyBridgeUntil = 0;
  tower.energyScenarioCharge = 1;
  assert.equal(room.canTowerFire(tower), true);
  assert.equal(tower.capacity, undefined);
});

/**
 * Yuk Kesici ve Frekans Paylastirici esikleri.
 *
 * Bu test eskiden "her teslimat sahibin butun kulelerini susturur ve butun
 * kuleleri donusumlu calistirir" davranisini kodluyordu. Metin ise kriz,
 * dusuk oncelik ve "enerjisi azalan" diyordu; davranis metne cekildi ve test
 * de bilerek degistirildi.
 */
function placeWarriorTowers(room, count) {
  const towers = [];
  for (let index = 0; index < count; index += 1) {
    room.placeTower(client, { ...findBuildableSpot(room, "warrior-1"), definitionId: "warrior-1" });
    towers.push([...room.towers.values()].at(-1));
  }
  return towers;
}

function energyWorker(skillId, target) {
  return { id: skillId, ownerId: "p1", mode: "energyTransport", skillIds: [skillId], x: target.x, y: target.y, logisticsPhase: "deliver", targetTowerId: target.id, cargo: 5, capacity: 9, speed: 82, vx: 0, vy: 0 };
}

test("load shedder sheds only low-priority towers, and only during an energy crisis", () => {
  const room = createRoom("warrior");
  const [target, critical, normal, low] = placeWarriorTowers(room, 4);
  critical.logisticsPriority = "critical";
  low.logisticsPriority = "low";
  target.logisticsPriority = "low";
  for (const tower of [target, critical, normal, low]) tower.energy = tower.maxEnergy;

  // Kriz yok: hic kimse kapanmaz, dusuk oncelikli kule bile.
  room.applyEnergyWorkerArrival(energyWorker("load-shedder", target), target);
  for (const tower of [target, critical, normal, low]) assert.ok(!(tower.energyShedUntil > Date.now()), `${tower.id} kriz yokken kapandi`);

  // Esik tam %25: henuz kriz degil.
  normal.energy = normal.maxEnergy * LOAD_SHEDDER_CRISIS_ENERGY_RATIO;
  room.applyEnergyWorkerArrival(energyWorker("load-shedder", target), target);
  assert.ok(!(low.energyShedUntil > Date.now()), "esigin tam ustunde kriz sayildi");

  // Kriz: yalnizca Dusuk oncelikli kule kapanir; teslim alan kule Dusuk olsa da kapanmaz.
  normal.energy = normal.maxEnergy * LOAD_SHEDDER_CRISIS_ENERGY_RATIO - 1;
  room.applyEnergyWorkerArrival(energyWorker("load-shedder", target), target);
  assert.ok(low.energyShedUntil > Date.now(), "dusuk oncelikli kule krizde kapanmadi");
  assert.ok(!(target.energyShedUntil > Date.now()), "teslimati alan kule kapandi");
  assert.ok(!(critical.energyShedUntil > Date.now()), "kritik kule kapandi");
  assert.ok(!(normal.energyShedUntil > Date.now()), "normal kule kapandi");
  assert.equal(room.canTowerFire(low), false);
});

test("load shedder never sheds critical or normal towers, even when every tower is starving", () => {
  const room = createRoom("warrior");
  const [target, critical, normal, unset] = placeWarriorTowers(room, 4);
  critical.logisticsPriority = "critical";
  normal.logisticsPriority = "normal";
  for (const tower of [target, critical, normal, unset]) tower.energy = 0;
  room.applyEnergyWorkerArrival(energyWorker("load-shedder", target), target);
  for (const tower of [target, critical, normal, unset]) assert.ok(!(tower.energyShedUntil > Date.now()), `${tower.id} kapandi`);
});

test("frequency sharing alternates only towers below half energy", () => {
  const room = createRoom("warrior");
  const [target, low, half, full] = placeWarriorTowers(room, 4);
  target.energy = target.maxEnergy;
  low.energy = low.maxEnergy * FREQUENCY_SHARE_ENERGY_RATIO - 1;
  half.energy = half.maxEnergy * FREQUENCY_SHARE_ENERGY_RATIO;
  full.energy = full.maxEnergy;
  room.applyEnergyWorkerArrival(energyWorker("frequency-share", target), target);
  assert.ok(low.energyFrequencyUntil > Date.now(), "enerjisi azalan kule donusume girmedi");
  for (const tower of [target, half, full]) assert.ok(!(tower.energyFrequencyUntil > Date.now()), `${tower.id} enerjisi yeterliyken donusume girdi`);
});
