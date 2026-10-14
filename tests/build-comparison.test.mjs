import test from "node:test";
import assert from "node:assert/strict";
import { COMPARISON_BUILDS, comparisonJobs, compactReport, aggregate, formatMarkdown } from "../tools/compare-builds.mjs";
import { BUILDS } from "../tools/sim/policies.mjs";
import { runJob } from "../tools/sim/jobs.mjs";
import { towerCatalog } from "../packages/shared/dist/index.js";

test("karsilastirma butun oynanabilir savas kulelerini (Debug Lazer dahil) kapsar", () => {
  for (const operator of ["warrior", "zeynep"]) {
    const used = new Set(COMPARISON_BUILDS[operator].flatMap((build) => Object.keys(BUILDS[operator][build].mix)));
    // Savas kulesi: kaynak binasi, duvar, depo ve tamir merkezi disindaki her yapi.
    const support = new Set(["wall-1", "warehouse-1", "repair-depot-1"]);
    const combat = towerCatalog[operator]
      .filter((definition) => !definition.resourceProvider && !support.has(definition.id))
      .map((definition) => definition.id);
    for (const id of combat) assert.ok(used.has(id), `${operator}: ${id} hicbir kurulusta yok`);
  }
  assert.ok(COMPARISON_BUILDS.warrior.some((build) => BUILDS.warrior[build].mix["warrior-5"]), "Debug Lazer karsilastirmada");
});

test("is listesi eslesik tohumlar kullanir ve irk/lojistik kolayligi acmaz", () => {
  const jobs = comparisonJobs({ operators: ["warrior"], stages: [1, 5], seeds: 3, builds: ["laser", "takipci"] });
  assert.equal(jobs.length, 2 * 2 * 3);
  for (const job of jobs) {
    assert.deepEqual(job.operators, ["warrior"]);
    assert.equal(job.unsafe, undefined);
  }
  const seedsOf = (build, stage) => jobs.filter((job) => job.overrides.build === build && job.stage === stage).map((job) => job.seed);
  assert.deepEqual(seedsOf("laser", 1), seedsOf("takipci", 1));
  assert.throws(() => comparisonJobs({ operators: ["warrior"], builds: ["hiza"] }));
});

test("gercek kisa kosu tabloya donusur", () => {
  const report = runJob({ operators: ["warrior"], stage: 5, seed: 1, policy: "standard", overrides: { build: "laser" }, maxWaves: 1 }).report;
  const row = compactReport(report);
  assert.equal(row.build, "laser");
  assert.equal(row.stage, 5);
  const summary = aggregate([row, { ...row, seed: 2, status: "victory", waveReached: 20 }]);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].runs, 2);
  assert.equal(summary[0].wins, 1);
  const markdown = formatMarkdown(summary, { seeds: 2, policy: "standard", matches: 2, workers: 1, minutes: "0.1", date: "2026-01-01" });
  assert.match(markdown, /\| Atakan \| laser \|/);
  assert.match(markdown, /Bot sınırları/);
});
