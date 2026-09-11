import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, deliveryScore } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
function setup() {
  const room = createRoom("warrior");
  const towers = [];
  for (let i = 0; i < 2; i++) {
    room.placeTower(client, { ...findBuildableSpot(room, "warrior-1"), definitionId: "warrior-1" });
    towers.push([...room.towers.values()].at(-1));
  }
  room.ensureLogisticsWorkers();
  return { room, towers, worker: room.drones.get("logistics-p1-ammoTransport") };
}

test("priority requires ownership and a valid value", () => {
  const { room, towers: [tower] } = setup();
  room.setLogisticsPriority({ sessionId: "p2" }, { towerId: tower.id, priority: "critical" });
  assert.equal(tower.logisticsPriority, undefined);
  room.setLogisticsPriority(client, { towerId: tower.id, priority: "invalid" });
  assert.equal(tower.logisticsPriority, undefined);
  room.setLogisticsPriority(client, { towerId: tower.id, priority: "critical" });
  assert.equal(tower.logisticsPriority, "critical");
});

test("aging overrides a continuously needy critical tower", () => {
  assert.ok(deliveryScore("low", 0.8, 21, 1000) > deliveryScore("critical", 0, 1, 1));
});

test("in-flight reservations send the next carrier to another tower", () => {
  const { room, towers: [first, second], worker } = setup();
  first.ammo = first.maxAmmo - 3;
  second.ammo = second.maxAmmo - 3;
  first.logisticsPriority = "critical";
  const reserved = { ...worker, id: "reserved", cargo: 3, logisticsPhase: "deliver", targetTowerId: first.id };
  room.drones.set(reserved.id, reserved);
  assert.equal(room.selectDeliveryTarget(worker, "ammo").id, second.id);
});

test("disabled delivery target reroutes without deleting cargo", () => {
  const { room, towers: [first, second], worker } = setup();
  first.ammoLogisticsEnabled = false;
  second.ammo = 0;
  Object.assign(worker, { cargo: 3, cargoAmmoType: second.ammoType, logisticsPhase: "deliver", targetTowerId: first.id });
  room.updateLogisticsWorker(worker, 0);
  assert.equal(worker.targetTowerId, second.id);
  assert.equal(worker.cargo, 3);
});

test("no eligible recipient preserves carried ammunition", () => {
  const { room, towers, worker } = setup();
  for (const tower of towers) tower.ammoLogisticsEnabled = false;
  Object.assign(worker, { cargo: 3, logisticsPhase: "deliver", targetTowerId: towers[0].id });
  room.updateLogisticsWorker(worker, 0);
  assert.equal(worker.cargo, 3);
  assert.equal(worker.logisticsPhase, "deliver");
});

test("partial delivery retains cargo and priority changes do not interrupt a trip", () => {
  const { room, towers: [tower], worker } = setup();
  tower.ammo = tower.maxAmmo - 1;
  Object.assign(worker, { x: tower.x, y: tower.y, cargo: 3, cargoAmmoType: tower.ammoType, logisticsPhase: "deliver", targetTowerId: tower.id });
  room.setLogisticsPriority(client, { towerId: tower.id, priority: "low" });
  room.updateLogisticsWorker(worker, 0.1);
  assert.equal(worker.cargo, 2);
  assert.equal(worker.logisticsPhase, "deliver");
  assert.equal(tower.ammo, tower.maxAmmo);
});

test("summary retains sold tower damage and resets at the next wave", () => {
  const { room, towers: [tower] } = setup();
  room.recordTowerDamage(tower.id, 37);
  room.towers.delete(tower.id);
  room.finishDefenseSummary();
  assert.equal(room.lastDefenseSummary.get("p1").rows[0].damage, 37);
  room.wave++;
  room.updateDefenseInsights(0.5);
  assert.equal(room.defenseRows.has(tower.id), false);
});

test("lack of targets does not masquerade as ammunition downtime", () => {
  const { room, towers: [tower] } = setup();
  tower.ammo = 0;
  assert.equal(room.getTowerActivity(tower), "target");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  Object.assign(enemy, { x: tower.x, y: tower.y, movementKind: "ground" });
  room.enemySpatialGrid.rebuild(room.enemies.values());
  assert.equal(room.getTowerActivity(tower), "ammo");
  room.setupPhase = true;
  room.updateDefenseInsights(10);
  assert.equal(room.defenseRows.size, 0);
});

test("preview uses actual card stats without mutating the tower", () => {
  const { room, towers: [tower] } = setup();
  const card = cardCatalog.find((entry) => entry.id === "kalibre-artisi");
  room.pendingCardChoices.set("p1", [card]);
  const before = JSON.stringify(tower.runModifiers);
  let preview;
  room.sendTowerPreview({ sessionId: "p1", send: (_type, value) => { preview = value; } }, { towerId: tower.id, cardId: card.id, requestId: "1" });
  assert.equal(preview.error, undefined);
  assert.equal(JSON.stringify(tower.runModifiers), before);
  assert.equal(tower.targetedCardIds.length, 0);
  room.chooseCard(client, { towerId: tower.id, cardId: card.id });
  assert.ok(preview.lines[0].endsWith(room.getTowerDamage(tower).toFixed(2)));
});

test("preview rejects other players' towers and unoffered cards", () => {
  const { room, towers: [tower] } = setup();
  let preview;
  room.sendTowerPreview({ sessionId: "p2", send: (_type, value) => { preview = value; } }, { towerId: tower.id, cardId: "kalibre-artisi", requestId: "1" });
  assert.ok(preview.error);
});

test("tracking assist is a subset of damage and excludes overkill", () => {
  const { room, towers: [tracker, attacker] } = setup();
  room.towerCriticalRandom = () => 1;
  for (const hp of [1000, 5]) {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    Object.assign(enemy, { hp, maxHp: hp, shield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {} });
    room.applyTrackingStacks(enemy, Date.now() + 5000, 1);
    enemy.trackingSourceTowerId = tracker.id;
    const before = room.getDefenseRow(tracker).markAssistDamage;
    room.damageEnemy(enemy, 100, 0, "warrior-4", "p1", "true", 0, 1, attacker.id);
    const assist = room.getDefenseRow(tracker).markAssistDamage - before;
    assert.ok(Math.abs(assist - (hp === 5 ? 0 : 20)) < 0.0001);
    assert.equal(room.getDefenseRow(tracker).damage, 0);
  }
});

test("blocked delivery reroutes and retains its cargo", () => {
  const { room, towers: [first, second], worker } = setup();
  first.ammo = second.ammo = 0;
  Object.assign(worker, { cargo: 3, cargoAmmoType: second.ammoType, logisticsPhase: "deliver", targetTowerId: first.id });
  const original = room.getWorkerApproachPoint.bind(room);
  room.getWorkerApproachPoint = (probe, x, y) => probe.targetTowerId === first.id ? undefined : original(probe, x, y);
  room.updateLogisticsWorker(worker, 0);
  assert.equal(worker.targetTowerId, second.id);
  assert.equal(worker.cargo, 3);
});
