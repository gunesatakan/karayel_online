/**
 * Denge simulatoru.
 *
 * Varsayilan kip ("real"): gercek `MatchRoom` uzerinde basliksiz bot maci
 * (`tools/sim/`). Butun kurallar odanin kendisinden; botlar yalnizca
 * istemci mesajlariyla oynuyor. Ayrintilar: docs/simulator.md.
 *
 *   node tools/simulate.mjs --operator warrior --stage 1 --seeds 20 --policy standard
 *   node tools/simulate.mjs --operator zeynep --stage 3 --seeds 50 --build hiza --json out.jsonl
 *   node tools/simulate.mjs --operator warrior --players 2 --seeds 10
 *   node tools/simulate.mjs --mode quick --operator warrior --stage 1 --seeds 1000   (YAKLASIK)
 *
 * `--mode quick` eski soyut modeli calistirir (haritasiz, lojistiksiz); cok
 * iyimser, yalnizca kaba taramalar icin. Hatasi docs/simulator.md'de.
 */
import { writeFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cpus } from "node:os";
import { summarize } from "./sim/match.mjs";
import { runJobs } from "./sim/jobs.mjs";
import { POLICIES, BUILDS } from "./sim/policies.mjs";

// Eski API (testler ve hizli taramalar): yaklasik model.
export { simulateRun, simulateMany, botStrategies, createSeededRandom } from "./sim/quick.mjs";
export { runJob, runJobs } from "./sim/jobs.mjs";
export { runMatch } from "./sim/match.mjs";

const OPERATORS = ["warrior", "zeynep"];

export function parseArgs(argv) {
  const args = { mode: "real", operator: "warrior", stage: 1, seeds: 10, seedStart: 1, policy: "standard", players: 1, workers: Math.max(1, cpus().length - 1), overrides: {}, unsafe: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    const take = () => { index += 1; return value; };
    switch (key) {
      case "--mode": args.mode = take(); break;
      case "--operator": args.operator = take(); break;
      case "--stage": args.stage = Number(take()); break;
      // --runs: eski kullanim (docs/kart-sistemi.md) icin es anlamli.
      case "--seeds": case "--runs": args.seeds = Number(take()); break;
      case "--seed": case "--seed-start": args.seedStart = Number(take()); break;
      case "--policy": args.policy = take(); break;
      case "--build": args.overrides.build = take(); break;
      case "--partner-build": args.partnerBuild = take(); break;
      case "--cards": args.overrides.cards = take(); break;
      case "--shop": args.overrides.shop = take(); break;
      case "--spacing": args.overrides.spacing = take(); break;
      case "--no-walls": args.overrides.walls = false; break;
      case "--no-skills": args.overrides.skills = false; break;
      case "--no-hire": args.overrides.hireWorkers = false; break;
      case "--players": args.players = Number(take()); break;
      case "--waves": args.maxWaves = Number(take()); break;
      case "--workers": args.workers = Number(take()); break;
      case "--json": args.json = take(); break;
      case "--unsafe-free-logistics": args.unsafe.freeLogistics = true; break;
      case "--quiet": args.quiet = true; break;
      case "--help": case "-h": args.help = true; break;
      default: throw new Error(`unknown argument ${key}`);
    }
  }
  if (!OPERATORS.includes(args.operator)) throw new Error(`--operator must be one of ${OPERATORS.join(", ")}`);
  if (!(args.stage >= 1 && args.stage <= 5)) throw new Error("--stage must be 1..5");
  if (!(args.players >= 1 && args.players <= 2)) throw new Error("--players must be 1 or 2");
  return args;
}

export function buildJobs(args) {
  const operators = args.players === 2 ? [args.operator, OPERATORS.find((op) => op !== args.operator)] : [args.operator];
  return Array.from({ length: args.seeds }, (_, index) => ({
    operators,
    stage: args.stage,
    seed: args.seedStart + index,
    policy: args.policy,
    overrides: args.overrides,
    builds: args.players === 2 ? [args.overrides.build, args.partnerBuild] : undefined,
    maxWaves: args.maxWaves,
    unsafe: args.unsafe,
    label: `${operators.join("+")}/s${args.stage}/${args.policy}${args.overrides.build ? `/${args.overrides.build}` : ""}`
  }));
}

const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : "-";

/** Tohumlar uzerinden ozet tablosu (ortalama / medyan / p10 / p90). */
export function formatSummary(reports) {
  const lines = [];
  const wins = reports.filter((report) => report.result === "win").length;
  const statuses = reports.reduce((map, report) => (map[report.status] = (map[report.status] ?? 0) + 1, map), {});
  lines.push(`${reports[0]?.label ?? ""}  kosu ${reports.length}  zafer ${wins} (%${fmt(100 * wins / Math.max(1, reports.length), 0)})  durum ${JSON.stringify(statuses)}`);
  const rows = [
    ["ulasilan dalga", (report) => report.waveReached],
    ["nexus can", (report) => report.nexusHp],
    ["sizinti", (report) => report.leaks],
    ["oldurme", (report) => report.kills],
    ["son DPS (kule, sn)", (report) => report.dpsFinal],
    ["altin kazanilan", (report) => report.players[0].goldEarned],
    ["altin harcanan", (report) => report.players[0].goldSpent],
    ["altin kalan", (report) => report.players[0].goldUnspent],
    ["deneyim kalan", (report) => report.players[0].experience],
    ["kayip yapi", (report) => report.towersLost],
    ["duvar (son)", (report) => report.wallsEnd],
    ["isci alinan", (report) => report.players[0].workersHired],
    ["mac suresi (sn, duvar saati)", (report) => report.wallSeconds]
  ];
  lines.push(`${"".padEnd(30)}${["ort", "medyan", "p10", "p90", "min", "max"].map((h) => h.padStart(9)).join("")}`);
  for (const [name, read] of rows) {
    const stats = summarize(reports.map(read));
    lines.push(`${name.padEnd(30)}${[stats.mean, stats.median, stats.p10, stats.p90, stats.min, stats.max].map((v) => fmt(v).padStart(9)).join("")}`);
  }
  const damage = {};
  for (const report of reports) for (const [id, value] of Object.entries(report.damageByTower)) damage[id] = (damage[id] ?? 0) + value / reports.length;
  const total = Object.values(damage).reduce((sum, value) => sum + value, 0) || 1;
  lines.push(`hasar payi: ${Object.entries(damage).sort((a, b) => b[1] - a[1]).map(([id, value]) => `${id} %${fmt(100 * value / total, 0)}`).join(", ")}`);
  const count = (pick) => {
    const map = {};
    for (const report of reports) for (const id of pick(report)) map[id] = (map[id] ?? 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => `${id}x${n}`).join(", ");
  };
  lines.push(`sik kartlar: ${count((report) => report.players[0].cards)}`);
  lines.push(`sik esyalar: ${count((report) => report.players[0].items)}`);
  const leakWaves = new Array(20).fill(0);
  for (const report of reports) report.leaksPerWave.forEach((leaks, index) => { leakWaves[index] += leaks / reports.length; });
  lines.push(`dalga basina sizinti (ort): ${leakWaves.map((value) => fmt(value)).join(" ")}`);
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Kullanim: node tools/simulate.mjs --operator warrior|zeynep --stage 1..5 --seeds N --policy <ad> [--build <kurulus>] [--players 2] [--json out.jsonl]
Kip: --mode real (varsayilan, gercek oda) | quick (YAKLASIK soyut model)
Politikalar: ${Object.keys(POLICIES).join(", ")}
Kuruluslar: warrior: ${Object.keys(BUILDS.warrior).join(", ")}; zeynep: ${Object.keys(BUILDS.zeynep).join(", ")}
Secenekler: --seed N (ilk tohum), --waves N (N. dalgada dur), --cards greedy|random|worst|focus:<eksen>, --shop greedy|random|none,
  --spacing isolated|trio|cluster, --no-walls, --no-skills, --no-hire, --partner-build <kurulus>, --workers N,
  --unsafe-free-logistics (GUVENSIZ: mermi/enerji her tick dolar; yalnizca karsilastirma icin, raporda isaretli)`);
    return;
  }
  if (args.mode === "quick") {
    const { simulateMany } = await import("./sim/quick.mjs");
    const report = simulateMany({ runs: args.seeds, seed: args.seedStart, stage: args.stage, operator: args.operator });
    console.log("UYARI: --mode quick YAKLASIKTIR (haritasiz, lojistiksiz soyut model); gercek oda kipine gore cok iyimser.");
    console.log(JSON.stringify({ ...report, sample: undefined, approximate: true }, null, 2));
    return;
  }
  if (args.mode !== "real") throw new Error("--mode must be real or quick");
  const jobs = buildJobs(args);
  if (args.json) writeFileSync(args.json, "");
  const started = Date.now();
  let done = 0;
  const reports = await runJobs(jobs, {
    workers: args.workers,
    onResult(report) {
      done += 1;
      if (args.json) appendFileSync(args.json, `${JSON.stringify(report)}\n`);
      if (!args.quiet) process.stderr.write(`\r${done}/${jobs.length} tohum`);
    }
  });
  if (!args.quiet) process.stderr.write("\n");
  if (Object.keys(args.unsafe).length) console.log(`UYARI: guvensiz bayraklar acik: ${Object.keys(args.unsafe).join(", ")}`);
  console.log(formatSummary(reports));
  console.log(`toplam ${(Date.now() - started) / 1000} sn, ${args.workers} is parcacigi`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
