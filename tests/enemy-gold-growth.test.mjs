import test from "node:test";
import assert from "node:assert/strict";
import { getEnemyGoldWaveMultiplier } from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("kill gold meets all three anchors and rises smoothly within bounded levels", () => {
  for (const [wave, expected] of [[1, 1], [13, 1.5], [20, 2], [0, 1], [21, 2]]) {
    close(getEnemyGoldWaveMultiplier(wave), expected);
  }
  let previousStep = 0;
  for (let wave = 2; wave <= 20; wave++) {
    const step = getEnemyGoldWaveMultiplier(wave) - getEnemyGoldWaveMultiplier(wave - 1);
    assert.ok(step > previousStep, "reflected logarithm must rise progressively faster");
    previousStep = step;
  }
});

test("server scales normal, champion and special payouts exactly once, then player bonuses", () => {
  for (const [wave, scale] of [[1, 1], [13, 1.5], [20, 2]]) {
    for (const [enemy, baseGold] of [
      [{ reward: 12 }, 51],
      [{ reward: 12, champion: { gold: 300 } }, 300],
      [{ reward: 12, special: { budget: { gold: 200 } } }, 200]
    ]) {
      const room = createRoom("warrior");
      room.wave = wave;
      const player = room.state.players.get("p1");
      player.gold = 0;
      player.runModifiers = [{ source: "test", scope: { kind: "global" }, stat: "goldGain", add: 0.2 }];
      room.state.players.set("p2", { ...player, id: "p2", gold: 0, runModifiers: [] });
      close(room.awardEnemyGold(enemy, "p1"), baseGold * scale * 1.2);
      close(player.gold, baseGold * scale * 1.2);
      close(room.state.players.get("p2").gold, baseGold * scale);
    }
  }
});
