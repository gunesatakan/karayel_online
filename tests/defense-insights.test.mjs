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

/** "Etiket: once -> sonra" satirindan iki sayi. */
function previewValues(preview, label) {
  const line = preview.lines.find((entry) => entry.startsWith(`${label}:`));
  assert.ok(line, `${label} satiri yok: ${preview.lines.join(" | ")}`);
  const [, before, after] = line.match(/: (-?[\d.]+) → (-?[\d.]+)$/);
  return { before: Number(before), after: Number(after), changed: preview.changed[preview.lines.indexOf(line)] };
}

function requestPreview(room, change) {
  let preview;
  room.previewRequestTimes.clear();
  room.sendTowerPreview({ sessionId: "p1", send: (_type, value) => { preview = value; } }, { ...change, requestId: "1" });
  assert.equal(preview.error, undefined);
  return preview;
}

test("preview includes Kan Bankası's hit-time damage and marks only changed lines", () => {
  const { room, towers: [tower] } = setup();
  room.state.players.get("p1").inventoryItemIds.push("kan-bankasi");
  const preview = requestPreview(room, { towerId: tower.id, itemId: "kan-bankasi" });
  const damage = previewValues(preview, "Hasar / etki");
  assert.ok(Math.abs(damage.after - damage.before * 1.2) < 0.02, `Kan Bankasi onizlemede gorunmuyor: ${damage.before} -> ${damage.after}`);
  assert.equal(damage.changed, true);
  assert.equal(preview.changed.length, preview.lines.length);
  assert.equal(preview.changed.filter(Boolean).length, 1, "yalnizca hasar satiri degismeli");
  assert.ok(!preview.lines.some((line) => line.startsWith("Mermi / tetikleme")), "tek mermili kulede mermi satiri gurultu");

  // Onizleme ile savastaki sayi ayni: esya takilinca kulenin vurusu da +%20.
  room.equipShopItem(client, { itemId: "kan-bankasi", towerId: tower.id });
  assert.equal(room.getTowerHitDamageAdd(tower), 0.2);
  assert.ok(Math.abs(room.getTowerDamage(tower) * (1 + room.getTowerHitDamageAdd(tower)) - damage.after) < 0.01);
});

test("preview doubles Çifte Namlu's ammo, energy and heat per trigger", () => {
  const { room, towers: [tower] } = setup();
  room.pendingCardChoices.set("p1", [cardCatalog.find((entry) => entry.id === "cifte-namlu")]);
  const preview = requestPreview(room, { towerId: tower.id, cardId: "cifte-namlu" });
  const shots = previewValues(preview, "Mermi / tetikleme");
  assert.deepEqual([shots.before, shots.after, shots.changed], [1, 2, true]);
  for (const label of ["Mühimmat / tetikleme", "Isı / tetikleme", "Enerji / tetikleme"]) {
    const value = previewValues(preview, label);
    assert.ok(Math.abs(value.after - value.before * 2) < 0.02, `${label} iki katina cikmadi: ${value.before} -> ${value.after}`);
  }
  assert.ok(previewValues(preview, "Mühimmat / tetikleme").before > 0, "olcum bos: kule muhimmat harcamiyor");
  assert.ok(previewValues(preview, "Isı / tetikleme").before > 0, "olcum bos: kule isinmiyor");
  const damage = previewValues(preview, "Hasar / etki");
  assert.equal(damage.changed, false, "mermi basina hasar degismez");
});

test("Çifte Namlu metni ikinci merminin cikmadigi kuleleri adlandiriyor", () => {
  // Kart kuleye kalici bagli; Sunucu gibi kendi dongusu olan kulede ikinci
  // mermi hic cikmiyor. Metin bunu soylemeli, onizleme de mermi satiri
  // gostermemeli.
  const card = cardCatalog.find((entry) => entry.id === "cifte-namlu");
  for (const name of ["Yörünge", "aura", "Sunucu", "Ölüler Bağı"]) {
    assert.ok(card.description.includes(name), `metin ${name} istisnasini soylemiyor: ${card.description}`);
  }
  const room = createRoom("warrior");
  room.placeTower(client, { ...findBuildableSpot(room, "warrior-2"), definitionId: "warrior-2" }, { free: true, ignoreLimit: true });
  const sunucu = [...room.towers.values()].at(-1);
  assert.equal(sunucu.definition.id, "warrior-2");
  room.pendingCardChoices.set("p1", [card]);
  const preview = requestPreview(room, { towerId: sunucu.id, cardId: card.id });
  assert.ok(!preview.lines.some((line) => line.startsWith("Mermi / tetikleme")), `Sunucu'da mermi satiri cikti: ${preview.lines.join(" | ")}`);
  assert.equal(preview.changed.some(Boolean), false, "Sunucu'da Çifte Namlu bir seyi degistiriyor gorunuyor");
});

test("Zırhlı Gövde grows the tower's max health and keeps the damage ratio", () => {
  const { room, towers: [tower] } = setup();
  const card = cardCatalog.find((entry) => entry.id === "zirhli-govde");
  room.pendingCardChoices.set("p1", [card]);
  tower.hp = tower.maxHp / 2;
  const maxHpBefore = tower.maxHp;
  const preview = requestPreview(room, { towerId: tower.id, cardId: card.id });
  room.chooseCard(client, { towerId: tower.id, cardId: card.id });
  assert.ok(tower.targetedCardIds.includes(card.id));
  assert.ok(Math.abs(tower.maxHp - maxHpBefore * 2.8) < 1e-9, `can tavani ${maxHpBefore} -> ${tower.maxHp}, beklenen x2.8`);
  assert.ok(Math.abs(tower.hp / tower.maxHp - 0.5) < 1e-9, "hasar orani korunmadi");
  const health = previewValues(preview, "Azami can");
  assert.ok(Math.abs(health.after - tower.maxHp) < 0.01, `onizleme ${health.after}, gercek ${tower.maxHp}`);
  assert.equal(health.changed, true);
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
