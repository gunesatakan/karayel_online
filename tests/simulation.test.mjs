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

/**
 * Zorluk bandi.
 *
 * Band uzun sure %5-%10 idi. Kule kontenjani 15'ten 20'ye cikarilinca olcum
 * %29'a firladi ve bu bilerek boyle birakildi: kontenjan artisi kasitli bir guc
 * yukseltmesi, dusman egrisiyle geri alinacak bir kaza degil.
 *
 * Yeni band dort ayri ornekle olculdu (100/seed1000 %29, 300/seed1000 %30.3,
 * 200/seed7 %32, 200/seed42 %33.5); %25-%35 hepsini iki yandan paylarla
 * iceriyor. Bandin isi hala ayni: oyuncu tarafinda guc degistiren bir sey
 * eklendiginde sessizce kaymasin.
 */
test("yüksek can dengesi bot zafer oranını %25-%35 bandında tutar", () => {
  const report = simulateMany({ runs: 100, seed: 1000, strategy: "balanced" });
  assert.ok(report.winRate >= 0.25 && report.winRate <= 0.35, `zafer oranı ${report.winRate}`);
});
