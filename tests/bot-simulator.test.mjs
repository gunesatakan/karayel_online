import test from "node:test";
import assert from "node:assert/strict";
import { runJob } from "../tools/sim/jobs.mjs";
import { replayMatch } from "../tools/sim/replay.mjs";
import { fingerprintRoom, SERVER_TICK_MS } from "../tools/sim/match.mjs";
import { parseArgs, buildJobs, formatSummary } from "../tools/simulate.mjs";

const strip = ({ wallSeconds, ...rest }) => rest;

test("bot maci: rapor sekli tam ve ayni tohum + politika ayni sonucu verir", () => {
  const beforeNow = Date.now;
  const beforeRandom = Math.random;
  const job = { operators: ["warrior"], stage: 1, seed: 7, policy: "standard", maxWaves: 2 };
  const first = runJob(job).report;
  const second = runJob(job).report;
  // Saat ve zar mac bitince geri yukleniyor.
  assert.equal(Date.now, beforeNow);
  assert.equal(Math.random, beforeRandom);
  assert.deepEqual(strip(first), strip(second));

  assert.ok(["capped", "defeat", "victory", "stalled"].includes(first.status));
  assert.equal(first.result === "win", first.status === "victory");
  assert.ok(first.waveReached >= 0 && first.waveReached <= 20);
  assert.ok(first.ticks > 0 && first.wallSeconds > 0);
  assert.ok(first.waves.length >= 1);
  for (const wave of first.waves) {
    for (const key of ["wave", "leaks", "kills", "nexusHp", "towers", "walls", "damage", "dps"]) assert.equal(typeof wave[key], "number", key);
  }
  assert.equal(first.leaksPerWave.length, first.waves.length);
  assert.equal(typeof first.dpsFinal, "number");
  assert.equal(typeof first.damageByTower, "object");
  assert.ok(first.kills > 0, "bot ilk dalgalarda oldurmeli");
  assert.ok(first.wallsBuilt > 0, "huni plani duvar kurmali");
  const [player] = first.players;
  assert.equal(player.operator, "warrior");
  for (const key of ["goldEarned", "goldSpent", "goldUnspent", "experience"]) assert.equal(typeof player[key], "number", key);
  assert.ok(Array.isArray(player.cards) && Array.isArray(player.items));
  assert.deepEqual(first.unsafe, [], "guvensiz kolaylik varsayilan olarak kapali");
});

test("bot maci bagimsiz tel yeniden oynatmasiyla birebir ayni (mesaj disinda dokunus yok)", () => {
  const job = { operators: ["zeynep"], stage: 2, seed: 3, policy: "standard", maxWaves: 1 };
  const recorded = runJob({ ...job, record: true });
  assert.ok(recorded.log.length > 0);
  const replay = replayMatch({ operators: job.operators, stage: job.stage, seed: job.seed, tickMs: SERVER_TICK_MS, ticks: recorded.report.ticks, log: recorded.log });
  assert.equal(fingerprintRoom(replay.room), recorded.fingerprint);
});

test("CLI secenekleri is listesine ve ozet tablosuna donusur", () => {
  const args = parseArgs(["--operator", "zeynep", "--stage", "3", "--seeds", "2", "--policy", "random-cards", "--players", "2", "--build", "hiza", "--waves", "1"]);
  const jobs = buildJobs(args);
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs[0].operators, ["zeynep", "warrior"]);
  assert.deepEqual(jobs.map((job) => job.seed), [1, 2]);
  assert.equal(jobs[0].stage, 3);
  assert.throws(() => parseArgs(["--operator", "archer"]));
  const report = runJob({ ...jobs[0], maxWaves: 1 }).report;
  assert.equal(report.players.length, 2);
  const table = formatSummary([report]);
  assert.match(table, /ulasilan dalga/);
  assert.match(table, /hasar payi/);
});
