import test from "node:test";
import assert from "node:assert/strict";
import { simulateMany, simulateRun } from "../tools/simulate.mjs";

test("başsız simülasyon aynı seed ile deterministiktir ve raporu eksiksizdir", () => {
  const first = simulateRun({ seed: 42 });
  const second = simulateRun({ seed: 42 });
  assert.deepEqual(first, second);
  assert.ok(["victory", "defeat"].includes(first.result));
  assert.ok(first.towerDamage.length > 0);
  assert.ok(Object.keys(first.axisContribution).length > 0);
  assert.ok(first.cardHistory.length <= 19);
});

test("yüksek can dengesi bot zafer oranını %5-%10 bandında tutar", () => {
  const report = simulateMany({ runs: 100, seed: 1000, strategy: "balanced" });
  assert.ok(report.winRate >= 0.05 && report.winRate <= 0.1, `zafer oranı ${report.winRate}`);
});
