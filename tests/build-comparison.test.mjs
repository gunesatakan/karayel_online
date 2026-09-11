import test from "node:test";
import assert from "node:assert/strict";
import { compareScenario, recipes, threats } from "../tools/compare-builds.mjs";

test("real-room comparison is deterministic and accounts for its resources", () => {
  const beforeNow = Date.now;
  const beforeRandom = Math.random;
  const first = compareScenario(recipes[0], threats[0], { maxTicks: 1100 });
  const second = compareScenario(recipes[0], threats[0], { maxTicks: 1100 });
  assert.deepEqual(first, second);
  assert.equal(Date.now, beforeNow);
  assert.equal(Math.random, beforeRandom);
  assert.equal(first.spent + first.unspent, first.budget);
  assert.ok(first.experienceSpent <= first.experienceBudget);
  assert.ok(first.damage > 0);
});
