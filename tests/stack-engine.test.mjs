import test from "node:test";
import assert from "node:assert/strict";
import { applyTowerStack, getTowerStackMultiplier, resetTowerStack } from "../packages/shared/dist/index.js";

const damageStack = { id: "obsession", trigger: "sameTarget", stat: "damage", perStack: 0.2, max: 10, resetOn: "targetChange" };

test("stack eklenir ve üst sınırı aşmaz", () => {
  let state;
  for (let index = 0; index < 20; index += 1) {
    state = applyTowerStack(state, damageStack, { trigger: "sameTarget", now: index, targetId: "enemy-1" });
  }
  assert.equal(state.count, 10);
  assert.ok(Math.abs(state.value - 2) < 1e-9);
  assert.ok(Math.abs(getTowerStackMultiplier(state, damageStack, 20) - 3) < 1e-9);
});

test("sameTarget stack hedef değişince sıfırlanır", () => {
  let state = applyTowerStack(undefined, damageStack, { trigger: "sameTarget", now: 1, targetId: "enemy-1" });
  state = applyTowerStack(state, damageStack, { trigger: "sameTarget", now: 2, targetId: "enemy-2" });
  assert.equal(state.count, 1);
  assert.equal(state.targetId, "enemy-2");
});

test("storedDamage stack verilen miktarı kapasiteye kadar biriktirir", () => {
  const storage = { id: "mirror", trigger: "hit", stat: "storedDamage", perStack: 0.35 };
  let state = applyTowerStack(undefined, storage, { trigger: "hit", now: 1, amount: 100, maxValue: 50 });
  state = applyTowerStack(state, storage, { trigger: "hit", now: 2, amount: 100, maxValue: 50 });
  assert.equal(state.value, 50);
});

test("decayMs dolunca eski stackler temizlenir", () => {
  const expiring = { id: "doubt", trigger: "hit", stat: "slow", perStack: 0.1, decayMs: 1000 };
  const first = applyTowerStack(undefined, expiring, { trigger: "hit", now: 100 });
  const next = applyTowerStack(first, expiring, { trigger: "hit", now: 1100 });
  assert.equal(next.count, 1);
});

test("yalnız tanımlı reset sebebi stacki temizler", () => {
  const noTarget = { id: "rhythm", trigger: "hit", stat: "fireRate", perStack: 0.05, resetOn: "noTarget" };
  const state = applyTowerStack(undefined, noTarget, { trigger: "hit", now: 1 });
  assert.equal(resetTowerStack(state, noTarget, "waveEnd"), state);
  assert.equal(resetTowerStack(state, noTarget, "noTarget"), undefined);
});

test("uyuşmayan olay stack oluşturmaz", () => {
  assert.equal(applyTowerStack(undefined, damageStack, { trigger: "kill", now: 1 }), undefined);
});
