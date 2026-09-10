import test from "node:test";
import assert from "node:assert/strict";
import {
  LOGISTICS_WORKER_CAPACITY,
  AMMO_LOGISTICS_WORKER_CAPACITY,
  AMMO_COLLECTOR_WORKER_CAPACITY,
  RESOURCE_EXTRACTION_DURATION_MS,
  RESOURCE_PROVIDER_INITIAL_STOCK,
  AMMO_FACTORY_INITIAL_ENERGY,
  advanceResourceExtraction
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

test("kaynak çıkarma süresi dolmadan tamamlanmaz", () => {
  let state = advanceResourceExtraction(undefined, 1000);
  assert.equal(state.remainingMs, RESOURCE_EXTRACTION_DURATION_MS - 1000);
  assert.equal(state.completed, false);

  state = advanceResourceExtraction(state.remainingMs, RESOURCE_EXTRACTION_DURATION_MS - 1001);
  assert.equal(state.remainingMs, 1);
  assert.equal(state.completed, false);
});

test("kaynak çıkarma son saniyede tamamlanır", () => {
  // Sayilar yarilandi (bkz. logistics/index.ts); test sabiti degil suresini
  // okuyor, ama tabanin ne oldugunu yine de burada sabitliyor.
  const saniye = RESOURCE_EXTRACTION_DURATION_MS / 1000;
  let remainingMs;
  for (let second = 0; second < saniye; second += 1) {
    const state = advanceResourceExtraction(remainingMs, 1000);
    remainingMs = state.remainingMs;
    assert.equal(state.completed, second === saniye - 1);
  }
  assert.equal(RESOURCE_EXTRACTION_DURATION_MS, 16000);
  assert.equal(LOGISTICS_WORKER_CAPACITY, 6);
  assert.equal(AMMO_LOGISTICS_WORKER_CAPACITY, 2);
  assert.equal(AMMO_COLLECTOR_WORKER_CAPACITY, 1);
  assert.equal(RESOURCE_PROVIDER_INITIAL_STOCK, 0);
  assert.equal(AMMO_FACTORY_INITIAL_ENERGY, 20);
  assert.equal(remainingMs, 0);
});

/**
 * Bu test bir donem tam tersini tutuyordu: isci dusmana carpinca olmezdi.
 * Gerekcesi de yaziliydi -- lojistik hatti dusman yolunu kesmek zorunda,
 * yani olum oyuncunun engelleyemedigi bir sebeple ekonomisinin durmasi
 * demekti. Kural degisti; itiraz ise kaybi **sureli** yaparak karsilandi.
 *
 * Kuralin tamami `worker-death.test.mjs` icinde. Burada duran, o dosyayi
 * gormeden eski davranisa donmeye calisan birinin carpacagi tek satir.
 */
test("isci dusmana carpinca olur", () => {
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const worker = [...room.drones.values()].find((drone) => drone.mode === "crystalCollector");
  assert.ok(worker, "isci bulunamadi");

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.x = worker.x;
  enemy.y = worker.y;
  room.enemySpatialGrid.rebuild(room.enemies.values());

  room.updateDrones(50, 0.05);
  assert.ok(worker.hp < worker.maxHp, "temas eden isci hasar almadi");

  room.updateDrones(20_000, 20);
  assert.equal(room.drones.has(worker.id), false, "isci dusmanin icinde sonsuza kadar durdu");
});
