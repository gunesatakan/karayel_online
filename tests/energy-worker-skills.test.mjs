import test from "node:test";
import assert from "node:assert/strict";
import { ENERGY_WORKER_SKILL_TIERS, getMapGridSize } from "../packages/shared/dist/index.js";
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

test("load shedder and frequency sharing alter the operating schedule", () => {
  const room = createRoom("warrior");
  const first = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...first, definitionId: "warrior-1" });
  room.placeTower(client, { x: first.x + getMapGridSize(room.activeMap), y: first.y, definitionId: "warrior-1" });
  const towers = [...room.towers.values()];
  const worker = { id: "shed", ownerId: "p1", mode: "energyTransport", skillIds: ["load-shedder"], x: towers[0].x, y: towers[0].y, logisticsPhase: "deliver", targetTowerId: towers[0].id, cargo: 5, capacity: 9, speed: 82, vx: 0, vy: 0 };
  room.applyEnergyWorkerArrival(worker, towers[0]);
  assert.ok(towers[1].energyShedUntil > Date.now());
  const frequencyWorker = { ...worker, id: "frequency", skillIds: ["frequency-share"] };
  room.applyEnergyWorkerArrival(frequencyWorker, towers[0]);
  assert.ok(towers[0].energyFrequencyUntil > Date.now());
  assert.ok(towers[1].energyFrequencyUntil > Date.now());
});
