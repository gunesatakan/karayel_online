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
 * Zafer orani artik bir hedef degil.
 *
 * Uzun sure bir band vardi: once %5-%10, kule kontenjani 20'ye cikinca %25-%35.
 * Sonra Obsesyon hasari 1.5 katina cikip Debug Lazer fiyati 150g'ye inince olcum
 * %100'e oturdu -- ikisi de tek baslarina yeterliydi -- ve zafer oraninin bir
 * hedef olmamasina karar verildi.
 *
 * Bandi %100'u kapsayacak sekilde genisletmek testi yalanci yapardi: hicbir sey
 * korumadigi halde koruyor gorunurdu. Onun yerine iddia kuculdu -- simulator
 * hala kosuyor ve anlamli bir rapor uretiyor. Zorluk hedefi geri konursa band da
 * buraya geri gelir.
 */
test("simülasyon çalışır durumda ve anlamlı bir zafer oranı üretir", () => {
  const report = simulateMany({ runs: 100, seed: 1000, strategy: "balanced" });
  assert.equal(report.runs, 100);
  assert.equal(report.wins + report.losses, 100);
  assert.ok(report.winRate >= 0 && report.winRate <= 1, `zafer oranı ${report.winRate}`);
});
