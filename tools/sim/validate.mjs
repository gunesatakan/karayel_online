/**
 * Simulatorun dogrulamasi.
 *
 *   node tools/sim/validate.mjs                 hepsi
 *   node tools/sim/validate.mjs --identity      bot maci == bagimsiz tel yeniden oynatmasi
 *   node tools/sim/validate.mjs --determinism   ayni tohum + politika -> ayni rapor (surec ici ve is parcaciklari)
 *   node tools/sim/validate.mjs --snapshots     ag snapshot'i acik/kapali ayni sonuc
 *   node tools/sim/validate.mjs --quick 20      hizli kipin gercek odaya gore hatasi (tohum sayisi)
 *   node tools/sim/validate.mjs --perf          mac basina saniye (tek is parcacigi ve havuz)
 *
 * Cikti duz metin; `--json dosya` ile ham sonuclar da yaziliyor.
 */
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { pathToFileURL } from "node:url";
import { runMatch, fingerprintRoom, summarize, SERVER_TICK_MS } from "./match.mjs";
import { runJob, runJobs } from "./jobs.mjs";
import { replayMatch } from "./replay.mjs";
import { createBot, resolvePolicyOptions } from "./policies.mjs";
import { simulateMany } from "./quick.mjs";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
const all = !["--identity", "--determinism", "--snapshots", "--quick", "--perf"].some(has);
const output = {};

const IDENTITY_CASES = [
  { operators: ["warrior"], stage: 1, seed: 1, policy: "standard", overrides: { build: "balanced" } },
  { operators: ["zeynep"], stage: 3, seed: 2, policy: "standard", overrides: { build: "hiza" } },
  { operators: ["warrior"], stage: 5, seed: 3, policy: "random-cards", overrides: { build: "obsession" } },
  { operators: ["zeynep"], stage: 2, seed: 4, policy: "random-shop", overrides: { build: "balanced" } },
  { operators: ["warrior", "zeynep"], stage: 4, seed: 5, policy: "standard", overrides: {} }
];

function strip(report) {
  const { wallSeconds, ...rest } = report;
  void wallSeconds;
  return JSON.stringify(rest);
}

export function checkIdentity(cases = IDENTITY_CASES) {
  const rows = [];
  for (const job of cases) {
    const recorded = runJob({ ...job, record: true });
    const started = process.hrtime.bigint();
    const replay = replayMatch({ operators: job.operators, stage: job.stage, seed: job.seed, tickMs: SERVER_TICK_MS, ticks: recorded.report.ticks, log: recorded.log });
    const replaySeconds = Number(process.hrtime.bigint() - started) / 1e9;
    const replayPrint = fingerprintRoom(replay.room);
    rows.push({
      case: `${job.operators.join("+")}/s${job.stage}/seed${job.seed}/${job.policy}/${job.overrides.build ?? "default"}`,
      messages: recorded.log.length,
      ticks: recorded.report.ticks,
      result: `${recorded.report.status} w${recorded.report.waveReached}`,
      replayResult: `${replay.result || "-"} wave ${replay.wave}`,
      // Raporun son kaydi kapanmamis dalga olabilir ("stalled"); defterde yok.
      leaksEqual: JSON.stringify(replay.leaksPerWave) === JSON.stringify(recorded.report.leaksPerWave.slice(0, replay.leaksPerWave.length))
        && recorded.report.leaksPerWave.slice(replay.leaksPerWave.length).every((leaks) => leaks === 0),
      identical: replayPrint === recorded.fingerprint,
      replaySeconds: +replaySeconds.toFixed(2)
    });
  }
  return rows;
}

export async function checkDeterminism() {
  const jobs = IDENTITY_CASES.slice(0, 3);
  const first = jobs.map((job) => strip(runJob(job).report));
  const second = [...jobs].reverse().map((job) => strip(runJob(job).report)).reverse();
  const pooled = (await runJobs(jobs, { workers: 3 })).map(strip);
  return jobs.map((job, index) => ({
    case: `${job.operators.join("+")}/s${job.stage}/seed${job.seed}`,
    sameProcessRepeat: first[index] === second[index],
    workerThread: first[index] === pooled[index]
  }));
}

export function checkSnapshots() {
  return IDENTITY_CASES.slice(0, 2).map((job) => {
    const make = (snapshots) => runMatch({
      operators: job.operators,
      stage: job.stage,
      seed: job.seed,
      snapshots,
      createPolicy: (ctx) => createBot(ctx, resolvePolicyOptions(job.policy, job.overrides))
    });
    const off = make(false);
    const on = make(true);
    return {
      case: `${job.operators.join("+")}/s${job.stage}/seed${job.seed}`,
      identical: off.fingerprint === on.fingerprint,
      secondsOff: +off.report.wallSeconds.toFixed(2),
      secondsOn: +on.report.wallSeconds.toFixed(2)
    };
  });
}

export async function checkQuick(seeds = 20) {
  const rows = [];
  for (const operator of ["warrior", "zeynep"]) {
    for (const stage of [1, 3, 5]) {
      const jobs = Array.from({ length: seeds }, (_, index) => ({ operators: [operator], stage, seed: 1000 + index, policy: "standard" }));
      const real = await runJobs(jobs, { workers: Math.max(1, cpus().length - 1) });
      const quick = simulateMany({ runs: seeds * 10, seed: 1000, stage, operator });
      const quickWaves = [];
      for (const [wave, count] of Object.entries(quick.waveDistribution)) for (let i = 0; i < count; i += 1) quickWaves.push(Number(wave));
      const realStats = summarize(real.map((report) => report.waveReached));
      const quickStats = summarize(quickWaves);
      rows.push({
        operator,
        stage,
        realMeanWave: +realStats.mean.toFixed(2),
        quickMeanWave: +quickStats.mean.toFixed(2),
        errorWaves: +(quickStats.mean - realStats.mean).toFixed(2),
        realWinRate: real.filter((report) => report.result === "win").length / real.length,
        quickWinRate: quick.winRate
      });
    }
  }
  const mae = rows.reduce((sum, row) => sum + Math.abs(row.errorWaves), 0) / rows.length;
  return { rows, meanAbsoluteErrorWaves: +mae.toFixed(2) };
}

export async function checkPerformance() {
  const single = [];
  for (const job of IDENTITY_CASES.slice(0, 4)) {
    const report = runJob(job).report;
    single.push({ case: `${job.operators.join("+")}/s${job.stage}/seed${job.seed}`, waves: report.lastWave, gameSeconds: report.gameSeconds, ticks: report.ticks, wallSeconds: +report.wallSeconds.toFixed(2), msPerTick: +(1000 * report.wallSeconds / report.ticks).toFixed(3) });
  }
  // Tam 20 dalga: guvensiz lojistikle dayanikli kosu, en agir gec dalgalari olcmek icin.
  const long = runJob({ operators: ["warrior"], stage: 1, seed: 3, policy: "standard", unsafe: { freeLogistics: true } }).report;
  const workers = Math.max(1, cpus().length - 1);
  const jobs = Array.from({ length: workers * 2 }, (_, index) => ({ operators: ["warrior"], stage: 1, seed: 500 + index, policy: "standard" }));
  const started = Date.now();
  await runJobs(jobs, { workers });
  const poolSeconds = (Date.now() - started) / 1000;
  return {
    single,
    longest: { waves: long.lastWave, status: long.status, wallSeconds: +long.wallSeconds.toFixed(2), msPerTick: +(1000 * long.wallSeconds / long.ticks).toFixed(3), note: "unsafe.freeLogistics yalnizca gec dalgaya ulasmak icin (hiz olcumu)" },
    pool: { workers, matches: jobs.length, seconds: poolSeconds, secondsPerMatch: +(poolSeconds / jobs.length).toFixed(2) }
  };
}

async function main() {
  if (all || has("--identity")) {
    output.identity = checkIdentity();
    console.log("== Kimlik (bot maci vs bagimsiz tel yeniden oynatmasi)");
    console.table(output.identity);
  }
  if (all || has("--determinism")) {
    output.determinism = await checkDeterminism();
    console.log("== Belirlenimcilik");
    console.table(output.determinism);
  }
  if (all || has("--snapshots")) {
    output.snapshots = checkSnapshots();
    console.log("== Ag snapshot'i acik / kapali");
    console.table(output.snapshots);
  }
  if (all || has("--quick")) {
    output.quick = await checkQuick(Number(valueOf("--quick", 20)) || 20);
    console.log(`== Hizli kip hatasi (ortalama mutlak hata ${output.quick.meanAbsoluteErrorWaves} dalga)`);
    console.table(output.quick.rows);
  }
  if (all || has("--perf")) {
    output.performance = await checkPerformance();
    console.log("== Performans");
    console.table(output.performance.single);
    console.log(output.performance.longest, output.performance.pool);
  }
  const json = valueOf("--json");
  if (json) writeFileSync(json, `${JSON.stringify(output, null, 2)}\n`);
  const failed = [
    ...(output.identity ?? []).filter((row) => !row.identical || !row.leaksEqual),
    ...(output.determinism ?? []).filter((row) => !row.sameProcessRepeat || !row.workerThread),
    ...(output.snapshots ?? []).filter((row) => !row.identical)
  ];
  if (failed.length) {
    console.error(`BASARISIZ: ${failed.length} kontrol`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
