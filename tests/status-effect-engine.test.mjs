import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTowerStatusEffect,
  getActiveStatusMagnitude,
  getTowerStatusOutcomes,
  isStatusEffectActive
} from "../packages/shared/dist/index.js";

const slow = { type: "slow", magnitude: 0.48, durationMs: 1000, stacking: "refresh" };

test("durum direnci etkinin süresini azaltır", () => {
  const result = applyTowerStatusEffect(undefined, slow, { now: 1000, resistance: 0.25 });
  assert.deepEqual(result, { type: "slow", magnitude: 0.48, stacks: 1, expiresAt: 1750 });
});

test("refresh mevcut etkinin süresini geriye götürmez", () => {
  const current = { type: "slow", magnitude: 0.48, stacks: 1, expiresAt: 3000 };
  const result = applyTowerStatusEffect(current, slow, { now: 1500 });
  assert.equal(result.expiresAt, 3000);
  assert.equal(result.stacks, 1);
});

test("add etkileri üst üste ekler ve maksimum stack sınırını uygular", () => {
  const doubt = { type: "slow", magnitude: 0.1, durationMs: 2000, stacking: "add", maxStacks: 3 };
  let state;
  state = applyTowerStatusEffect(state, doubt, { now: 100 });
  state = applyTowerStatusEffect(state, doubt, { now: 200 });
  state = applyTowerStatusEffect(state, doubt, { now: 300 });
  state = applyTowerStatusEffect(state, doubt, { now: 400 });
  assert.equal(state.stacks, 3);
  assert.ok(Math.abs(getActiveStatusMagnitude(state, 500) - 0.3) < 1e-9);
});

test("mesafe ölçeklemesi etki büyüklüğünü değiştirir", () => {
  const effect = { ...slow, scaling: "distance" };
  const result = applyTowerStatusEffect(undefined, effect, { now: 0, scalingFactor: 2.5 });
  assert.equal(result.magnitude, 1.2);
});

test("süresiz bind ve curse etkileri açık kalır", () => {
  const bind = applyTowerStatusEffect(undefined, { type: "bind", magnitude: 1, durationMs: 0, stacking: "none" }, { now: 500 });
  assert.equal(bind.expiresAt, 0);
  assert.equal(isStatusEffectActive(bind, 999999), true);
});

test("süresi dolmuş etki aktif veya etkili sayılmaz", () => {
  const state = { type: "fear", magnitude: 1, stacks: 1, expiresAt: 1000 };
  assert.equal(isStatusEffectActive(state, 1000), false);
  assert.equal(getActiveStatusMagnitude(state, 1000), 0);
});

test("burn saniyelik maksimum can hasar oranına dönüşür", () => {
  const burn = applyTowerStatusEffect(undefined, { type: "burn", magnitude: 0.015, durationMs: 5000 }, { now: 100 });
  assert.equal(getTowerStatusOutcomes({ burn }, 200).burnMaxHealthRatioPerSecond, 0.015);
});

test("chill hareket çarpanına dönüşür", () => {
  const chill = applyTowerStatusEffect(undefined, { type: "chill", magnitude: 0.3, durationMs: 5000 }, { now: 100 });
  assert.equal(getTowerStatusOutcomes({ chill }, 200).speedMultiplier, 0.7);
});

test("convert kaynak sahibi ve bitiş süresiyle yürütülür", () => {
  const convert = applyTowerStatusEffect(undefined, { type: "convert", magnitude: 1, durationMs: 2500 }, {
    now: 100, sourceTowerId: "tower-1", sourceOwnerId: "player-1"
  });
  assert.deepEqual(getTowerStatusOutcomes({ convert }, 200), {
    burnMaxHealthRatioPerSecond: 0,
    speedMultiplier: 1,
    converted: true,
    convertExpiresAt: 2600,
    convertOwnerId: "player-1"
  });
});
