import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_COUNT_WAVE_MULTIPLIER,
  ENEMY_HP_WAVE_MULTIPLIER,
  ENEMY_REWARD_MULTIPLIER,
  FINAL_WAVE,
  getEnemyCombatDefinition,
  getWaveCompletionGold,
  getWaveEnemyCount,
  getArenaWaveEnemyCount,
  getWaveEnemyMaxHp,
  getWaveHpMultiplier
} from "../packages/shared/dist/index.js";

test("20 dalgalık kazanılabilirlik eğrisini sabitler", () => {
  assert.equal(FINAL_WAVE, 20);
  assert.equal(ENEMY_COUNT_WAVE_MULTIPLIER, 1.11);
  assert.equal(ENEMY_HP_WAVE_MULTIPLIER, 1.22);
  assert.equal(getWaveEnemyCount(20), 73);

  const gruntHp = getWaveEnemyMaxHp(getEnemyCombatDefinition("grunt").maxHp, 20);
  assert.equal(gruntHp, 2213);
  assert.equal(gruntHp * getWaveEnemyCount(20), 161_549);
});

test("düşman sayısı harita ölçeği ve oyuncu sayısıyla çarpılır", () => {
  assert.equal(getArenaWaveEnemyCount(1, 1, 1), 10);
  assert.equal(getArenaWaveEnemyCount(1, 2, 1), 20);
  assert.equal(getArenaWaveEnemyCount(1, 3, 1), 30);
  assert.equal(getArenaWaveEnemyCount(1, 4, 1), 40);
  assert.equal(getArenaWaveEnemyCount(1, 4, 4), 82);
});

test("dalga ekonomisini ve rejenerasyon ölçeklemesini sabitler", () => {
  assert.equal(ENEMY_REWARD_MULTIPLIER, 1);
  assert.equal(getWaveCompletionGold(1), 26);
  assert.equal(getWaveCompletionGold(19), 80);

  const brute = getEnemyCombatDefinition("brute");
  const wave20Regen = brute.healthRegenPerSecond * getWaveHpMultiplier(20);
  assert.equal(Math.round(wave20Regen * 1000) / 1000, 15.308);
});
