#!/usr/bin/env node
/**
 * Uretim kaydini gercek `MatchRoom` ile yeniden oynatir, belirlenimciligi
 * dogrular ve dalga basina bolum sureleri cikarir.
 *
 *   npm run build:server
 *   node tools/debug/replay-profile.mjs <kayit.ndjson.gz> [secenekler]
 *
 *   --cpu-prof              V8 CPU profili (.cpuprofile; Chrome DevTools > Performance
 *                           ya da VS Code ile acilir). Pencere verilmezse kayittaki en
 *                           kotu tick'in dalgasi.
 *   --window wave:12-14     profil penceresi (dalga araligi) ya da tick:30000-36000
 *   --out <dizin>           profil ve JSON ciktilari (varsayilan: kaydin yani)
 *   --json                  sonucu JSON olarak yaz
 *   --stop-on-divergence    ilk iz farkinda dur
 *
 * Cikis kodu: parmak izi farki varsa 2.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Session } from "node:inspector/promises";
import { loadRecordingFile, replayRecording } from "./replay-lib.mjs";

const SECTIONS = ["spawn", "towers", "projectiles", "enemies", "bodies", "legendary", "procs", "cooldowns", "ultimates", "snapshot", "wire", "latest", "perf", "other"];

/** Odanin kaydedici kancalari: yalnizca tick bolumleri, dalga basina. */
export function createProfiler(getRoom) {
  const waves = new Map();
  let current;
  const profiler = {
    waves,
    tickStart() {},
    tickEnd(totalMs, frame, sections) {
      if (!frame) return;
      const room = getRoom();
      const wave = room?.wave ?? 0;
      if (!current || current.wave !== wave) {
        current = waves.get(wave);
        if (!current) {
          current = { wave, ticks: 0, sum: 0, max: 0, samples: [], sections: Object.fromEntries(SECTIONS.map((key) => [key, 0])), enemiesMax: 0, projectilesMax: 0 };
          waves.set(wave, current);
        }
      }
      current.ticks += 1;
      current.sum += totalMs;
      if (totalMs > current.max) current.max = totalMs;
      current.samples.push(totalMs);
      const s = current.sections;
      s.spawn += frame.spawnMs;
      s.towers += frame.towersMs;
      s.projectiles += frame.projectilesMs;
      s.enemies += Math.max(0, frame.enemiesMs - sections.bodiesMs - sections.legendaryMs);
      s.bodies += sections.bodiesMs;
      s.legendary += sections.legendaryMs;
      s.procs += sections.procsMs;
      s.cooldowns += frame.cooldownsMs;
      s.ultimates += frame.ultimatesMs;
      s.snapshot += frame.snapshotMs;
      s.wire += sections.wireMs;
      s.latest += sections.latestMs;
      s.perf += sections.perfMs;
      const known = frame.spawnMs + frame.towersMs + frame.projectilesMs + frame.enemiesMs + sections.procsMs + frame.cooldownsMs + frame.ultimatesMs + frame.snapshotMs + sections.wireMs + sections.latestMs + sections.perfMs;
      s.other += Math.max(0, totalMs - known);
      if (current.ticks % 60 === 0 && room) {
        const counts = room.getDebugCounts();
        if (counts.enemies > current.enemiesMax) current.enemiesMax = counts.enemies;
        if (counts.projectiles > current.projectilesMax) current.projectilesMax = counts.projectiles;
      }
    },
    message() {},
    join() {},
    leave() {},
    reconnect() {},
    wireSkip() {},
    clientSample() {},
    dropped() {},
    evicted() {},
    discard() {},
    dispose() {}
  };
  return profiler;
}

function parseWindow(raw, recording) {
  if (!raw) {
    // Kayittaki en kotu tick'in dalgasi.
    const spikes = recording.lines.filter((line) => line.k === "spike" && line.kind === "tick");
    const worst = spikes.sort((a, b) => b.ms - a.ms)[0];
    if (worst?.e?.wave) return { kind: "wave", from: worst.e.wave, to: worst.e.wave };
    const waves = recording.lines.filter((line) => line.k === "wave").sort((a, b) => b.max - a.max);
    return waves[0] ? { kind: "wave", from: waves[0].wave, to: waves[0].wave } : { kind: "tick", from: 0, to: Number.MAX_SAFE_INTEGER };
  }
  const match = /^(wave|tick):(\d+)(?:-(\d+))?$/.exec(raw);
  if (!match) throw new Error(`bad --window ${raw} (wave:A-B or tick:A-B)`);
  return { kind: match[1], from: Number(match[2]), to: Number(match[3] ?? match[2]) };
}

const f = (value, digits = 3) => (value == null || !Number.isFinite(value) ? "-" : Number(value).toFixed(digits));
const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
};

export async function profileRecording(path, options = {}) {
  const recording = loadRecordingFile(path);
  let room;
  const profiler = createProfiler(() => room);
  const result = await replayRecording(recording, {
    profiler,
    stopOnDivergence: options.stopOnDivergence,
    beforeTick: (r) => { room = r; }
  });
  return { recording, result, profiler };
}

/** CPU profilli oynatma: inspector oturumu tick sinirinda acilip kapaniyor. */
async function profileWithCpu(path, options) {
  const recording = loadRecordingFile(path);
  const window = parseWindow(options.window, recording);
  let room;
  const profiler = createProfiler(() => room);
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  let active = false;
  let done = false;
  let cpuProfile;
  const inWindow = (r, tick) => (window.kind === "wave" ? r.wave >= window.from && r.wave <= window.to : tick >= window.from && tick <= window.to);
  const pendingOps = [];
  const result = await replayRecording(recording, {
    profiler,
    stopOnDivergence: options.stopOnDivergence,
    beforeTick: (r, tick) => {
      room = r;
      if (done) return;
      const inside = inWindow(r, tick);
      if (inside && !active) {
        active = true;
        // `post` geri cagirmali API'de esanli baslatiyor; profil bu tick'ten itibaren.
        session.post("Profiler.start");
      } else if (!inside && active) {
        active = false;
        done = true;
        pendingOps.push(session.post("Profiler.stop").then((value) => { cpuProfile = value.profile; }));
      }
    }
  });
  if (active) pendingOps.push(session.post("Profiler.stop").then((value) => { cpuProfile = value.profile; }));
  await Promise.all(pendingOps);
  session.disconnect();
  return { recording, result, profiler, window, cpuProfile };
}

export function formatProfile({ recording, result, profiler, window }, cpuPath) {
  const out = [];
  const header = recording.header;
  const recordedWaves = new Map(recording.lines.filter((line) => line.k === "wave").map((line) => [line.wave, line]));
  out.push(`Kayit ${header.id}  tohum ${header.seed}  ${result.ticks} tick  ${recording.events.length} olay  oynatma ${f(result.wallMs / 1000, 1)} sn`);
  const ok = result.mismatches.length === 0;
  out.push(`Belirlenimcilik: ${result.checked} parmak izi, ${result.mismatches.length} fark  ->  ${ok ? "BIREBIR AYNI" : `FARK (ilk: tick ${result.firstMismatch.t}, dalga ${result.firstMismatch.wave})`}${recording.truncated ? `  (kayit kesik: ${recording.truncated.reason}; oynatma kesik noktaya kadar)` : ""}`);
  out.push("");
  out.push("Dalga basina tick bolumleri (bu makinede, ms/tick ort.) ve uretimdeki ortalama:");
  out.push(["dalga", "tick", "ort", "p95", "max", "uretim ort", "uretim max", "dusman", "mermi", ...SECTIONS].map((text, index) => (index === 0 ? String(text).padEnd(6) : String(text).padStart(11))).join(""));
  for (const wave of [...profiler.waves.values()].sort((a, b) => a.wave - b.wave)) {
    const recorded = recordedWaves.get(wave.wave);
    const cells = [wave.wave, wave.ticks, f(wave.sum / wave.ticks), f(percentile(wave.samples, 0.95)), f(wave.max, 2), f(recorded?.avg), f(recorded?.max, 2), wave.enemiesMax, wave.projectilesMax, ...SECTIONS.map((key) => f(wave.sections[key] / wave.ticks, 4))];
    out.push(cells.map((text, index) => (index === 0 ? String(text).padEnd(6) : String(text).padStart(11))).join(""));
  }
  if (cpuPath) out.push("", `CPU profili (${window.kind} ${window.from}-${window.to}): ${cpuPath}`);
  return out.join("\n");
}

async function main(argv) {
  const path = argv.find((arg, index) => !arg.startsWith("--") && !["--window", "--out"].includes(argv[index - 1]));
  if (!path || argv.includes("--help")) {
    console.log("usage: node tools/debug/replay-profile.mjs <recording.ndjson.gz> [--cpu-prof] [--window wave:A-B|tick:A-B] [--out dir] [--json] [--stop-on-divergence]");
    return;
  }
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const options = { cpuProf: argv.includes("--cpu-prof"), window: value("--window"), stopOnDivergence: argv.includes("--stop-on-divergence") };
  const outDir = value("--out") ?? dirname(path);
  const run = options.cpuProf ? await profileWithCpu(path, options) : await profileRecording(path, options);
  let cpuPath;
  if (run.cpuProfile) {
    mkdirSync(outDir, { recursive: true });
    cpuPath = join(outDir, `${basename(path).replace(/\.ndjson\.gz$/, "")}.${run.window.kind}${run.window.from}-${run.window.to}.cpuprofile`);
    writeFileSync(cpuPath, JSON.stringify(run.cpuProfile));
  }
  if (argv.includes("--json")) {
    const waves = [...run.profiler.waves.values()].map(({ samples, ...wave }) => ({ ...wave, avg: wave.sum / wave.ticks, p95: percentile(samples, 0.95) }));
    console.log(JSON.stringify({ id: run.recording.header.id, ticks: run.result.ticks, checked: run.result.checked, mismatches: run.result.mismatches, wallMs: run.result.wallMs, waves, cpuProfile: cpuPath }, null, 2));
  } else {
    console.log(formatProfile(run, cpuPath));
  }
  if (run.result.mismatches.length > 0) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
