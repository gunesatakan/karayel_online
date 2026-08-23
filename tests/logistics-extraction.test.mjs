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

test("kaynak çıkarma sekiz saniye dolmadan tamamlanmaz", () => {
  let state = advanceResourceExtraction(undefined, 1000);
  assert.equal(state.remainingMs, 7000);
  assert.equal(state.completed, false);

  state = advanceResourceExtraction(state.remainingMs, 6999);
  assert.equal(state.remainingMs, 1);
  assert.equal(state.completed, false);
});

test("kaynak çıkarma toplam sekiz saniyede tamamlanır", () => {
  let remainingMs;
  for (let second = 0; second < 8; second += 1) {
    const state = advanceResourceExtraction(remainingMs, 1000);
    remainingMs = state.remainingMs;
    assert.equal(state.completed, second === 7);
  }
  assert.equal(RESOURCE_EXTRACTION_DURATION_MS, 8000);
  assert.equal(LOGISTICS_WORKER_CAPACITY, 12);
  assert.equal(AMMO_LOGISTICS_WORKER_CAPACITY, 4);
  assert.equal(AMMO_COLLECTOR_WORKER_CAPACITY, 2);
  assert.equal(RESOURCE_PROVIDER_INITIAL_STOCK, 0);
  assert.equal(AMMO_FACTORY_INITIAL_ENERGY, 20);
  assert.equal(remainingMs, 0);
});

test("isci dusmana carpinca olmez", () => {
  // Lojistik hatti dusman yolunu kesmek zorunda: isciler dugumlerle binalar
  // arasinda gidip gelirken temas kacinilmaz. Olum, oyuncunun engelleyemedigi
  // bir sebeple ekonomisinin durmasi demekti; onunla birlikte yeniden dogma
  // beklemesi ve altinla canlandirma da kalkti.
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const worker = [...room.drones.values()].find((drone) => drone.mode === "crystalCollector");
  assert.ok(worker, "isci bulunamadi");

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.x = worker.x;
  enemy.y = worker.y;
  room.enemySpatialGrid.rebuild(room.enemies.values());

  room.updateDrones(0.05, 50);

  assert.ok(room.drones.has(worker.id), "isci dusmana carpinca oldu");
});
