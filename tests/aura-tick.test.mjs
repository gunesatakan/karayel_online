import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTowerEnergyPerSecond,
  calculateTowerOperatingEnergy,
  calculateTowerShotEnergyCost,
  isPeriodicTowerAura,
  NON_FIRING_INTERVAL_MS,
  PASSIVE_AURA_TICK_INTERVAL_MS,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const towerDefinition = (id) => Object.values(towerCatalog).flat().find((definition) => definition.id === id);

test("ortak motordaki her aura ortak tick sözleşmesini tanımlar", () => {
  for (const definition of Object.values(towerCatalog).flat()) {
    for (const aura of definition.engine.auras ?? []) {
      assert.ok((aura.tickIntervalMs ?? definition.fireIntervalMs) > 0, `${definition.id}: tickIntervalMs`);
      assert.ok((aura.refreshDurationMultiplier ?? 2) > 0, `${definition.id}: refreshDurationMultiplier`);
      assert.ok(["always", "isolated"].includes(aura.activation ?? "always"), `${definition.id}: activation`);
      assert.equal(isPeriodicTowerAura(definition), true, definition.id);
    }
  }
});

function placeAuraTower(id = "zeynep-7") {
  const room = createRoom("zeynep");
  const spot = findBuildableSpot(room, id);
  assert.ok(spot, `${id} için yer bulunamadı`);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: id, orientation: "horizontal" });
  const tower = [...room.towers.values()][0];
  assert.ok(tower, `${id} kurulamadı`);
  return { room, tower };
}

test("Saray Arşivi ve Abartı gerçek aura tick aralığı kullanır", () => {
  for (const id of ["zeynep-7", "zeynep-8"]) {
    const definition = towerDefinition(id);
    assert.equal(definition.fireIntervalMs, PASSIVE_AURA_TICK_INTERVAL_MS);
    assert.notEqual(definition.fireIntervalMs, NON_FIRING_INTERVAL_MS);
    assert.equal(isPeriodicTowerAura(definition), true);
  }
});

test("fireRate modifierı aura yenileme aralığını değiştirir", () => {
  const { room, tower } = placeAuraTower();
  const baseInterval = room.getTowerFireInterval(tower);
  tower.runModifiers.push({ source: "test", scope: "tower", stat: "fireRate", add: 0.2 });
  assert.ok(Math.abs(room.getTowerFireInterval(tower) - baseInterval / 1.2) < 1e-9);
});

test("aura ticki enerji ve ısı tüketir, yakıt bitince yenileme düşer", () => {
  const { room, tower } = placeAuraTower();
  tower.energy = tower.maxEnergy;
  tower.cooldownMs = 0;
  const energyBefore = tower.energy;
  const heatBefore = tower.temperature;
  room.updateTowers(50);
  assert.ok(tower.energy < energyBefore, "aura ticki enerji tüketmeli");
  assert.ok(tower.temperature > heatBefore, "aura ticki ısı üretmeli");
  assert.ok(tower.auraExpiresAt > Date.now(), "yenilemenin bir sona erme zamanı olmalı");

  tower.energy = 0;
  tower.energyDepletedAt = Date.now() - 10_000;
  tower.auraExpiresAt = Date.now() - 1;
  tower.cooldownMs = 0;
  room.updateTowers(50);
  assert.equal(room.isTowerAuraPowered(tower), false);
  assert.equal(tower.auraExpiresAt < Date.now(), true, "yakıtsız aura yenilenmemeli");
});

test("lojistik binaları ateş etmez ve atış/çalışma enerjisi tüketmez", () => {
  for (const id of ["warrior-7", "warrior-8", "archer-7", "archer-8", "zeynep-9", "zeynep-10"]) {
    const definition = towerDefinition(id);
    assert.equal(definition.fireIntervalMs, NON_FIRING_INTERVAL_MS, id);
    assert.equal(isPeriodicTowerAura(definition), false, id);
    assert.equal(calculateTowerShotEnergyCost(definition, 0.5), 0, id);
    assert.equal(calculateTowerOperatingEnergy(definition, 1), 0, id);
  }
});

test("İzolasyon ve Kin gerçek saldırı aralıklarıyla yakıtlı tick hattında kalır", () => {
  const isolation = towerDefinition("warrior-3");
  const kin = towerDefinition("zeynep-6");
  assert.equal(isolation.fireIntervalMs, 620);
  assert.equal(kin.fireIntervalMs, 3200);
  assert.ok(calculateTowerShotEnergyCost(isolation, 0.5) > 0);
  assert.ok(calculateTowerShotEnergyCost(kin, 0.5) > 0);
  assert.equal(isPeriodicTowerAura(isolation), true);
  assert.equal(isPeriodicTowerAura(kin), false, "Kin aura değil, durum etkili cone saldırısıdır");
});

test("İzolasyon Kulesi yalnızken ortak aura tick yürütücüsünü kullanır", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-3");
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-3" });
  const isolation = [...room.towers.values()][0];
  isolation.energy = isolation.maxEnergy;
  isolation.cooldownMs = 0;
  const before = isolation.energy;
  room.updateTowers(50);
  assert.ok(isolation.energy < before);
  assert.ok(isolation.auraExpiresAt > Date.now());
  assert.equal(room.getActiveTowerAuras(isolation)[0].activation, "isolated");
  assert.ok(Math.abs(room.getTowerAuraTickInterval(isolation) - 220) < 1e-9);
});

test("pasif aura kulelerinin dengeli enerji/saniye karakterizasyonu", () => {
  for (const id of ["zeynep-7", "zeynep-8"]) {
    const energyPerSecond = calculateTowerEnergyPerSecond(towerDefinition(id));
    assert.ok(energyPerSecond > 5.5 && energyPerSecond < 5.8, `${id}: ${energyPerSecond}`);
  }
  const isolationEnergyPerSecond = calculateTowerEnergyPerSecond(towerDefinition("warrior-3"));
  assert.ok(isolationEnergyPerSecond > 7.1 && isolationEnergyPerSecond < 7.4, `warrior-3: ${isolationEnergyPerSecond}`);
});
