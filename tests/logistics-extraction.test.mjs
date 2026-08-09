import test from "node:test";
import assert from "node:assert/strict";
import {
  LOGISTICS_WORKER_INSTANT_REVIVE_COST,
  LOGISTICS_WORKER_CAPACITY,
  AMMO_LOGISTICS_WORKER_CAPACITY,
  AMMO_COLLECTOR_WORKER_CAPACITY,
  LOGISTICS_WORKER_RESPAWN_DELAY_MS,
  RESOURCE_EXTRACTION_DURATION_MS,
  RESOURCE_PROVIDER_INITIAL_STOCK,
  AMMO_FACTORY_INITIAL_ENERGY,
  advanceResourceExtraction,
  getLogisticsWorkerRespawnRemainingMs
} from "../packages/shared/dist/index.js";

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

test("ölen işçinin otomatik doğma süresi ve anında canlandırma bedeli sabittir", () => {
  const deathAt = 25000;
  const respawnAt = deathAt + LOGISTICS_WORKER_RESPAWN_DELAY_MS;
  assert.equal(LOGISTICS_WORKER_RESPAWN_DELAY_MS, 10000);
  assert.equal(LOGISTICS_WORKER_INSTANT_REVIVE_COST, 40);
  assert.equal(getLogisticsWorkerRespawnRemainingMs(respawnAt, deathAt + 9999), 1);
  assert.equal(getLogisticsWorkerRespawnRemainingMs(respawnAt, deathAt + 10000), 0);
});
