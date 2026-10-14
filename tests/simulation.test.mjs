import test from "node:test";
import assert from "node:assert/strict";
import { simulateMany, simulateRun } from "../tools/simulate.mjs";

// Hizli kip (`--mode quick`): yaklasik soyut model. Gercek oda kipi
// tests/bot-simulator.test.mjs'te.

test("hızlı kip aynı seed ile deterministiktir, raporu eksiksiz ve yaklaşık diye işaretli", () => {
  const first = simulateRun({ seed: 42 });
  const second = simulateRun({ seed: 42 });
  assert.deepEqual(first, second);
  assert.ok(["victory", "defeat"].includes(first.result));
  assert.equal(first.approximate, true);
  assert.ok(first.towerDamage.length > 0);
  assert.ok(Object.keys(first.axisContribution).length > 0);
  assert.ok(first.cardHistory.length <= 19);
});

/**
 * Zafer orani bir hedef degil (gercek oda kipine gore cok iyimser; hata
 * docs/simulator.md'de). Iddia kucuk: model kosuyor ve asama/operator
 * secenekleri isliyor.
 */
test("hızlı kip aşama ve operatör seçeneğiyle çalışır", () => {
  const report = simulateMany({ runs: 20, seed: 1000, stage: 5, operator: "zeynep" });
  assert.equal(report.runs, 20);
  assert.equal(report.wins + report.losses, 20);
  assert.ok(report.winRate >= 0 && report.winRate <= 1, `zafer oranı ${report.winRate}`);
  assert.equal(report.sample.stage, 5);
});
