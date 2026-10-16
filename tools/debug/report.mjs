#!/usr/bin/env node
/**
 * Mac kaydinin metin ozeti.
 *
 *   node tools/debug/report.mjs <kayit.ndjson.gz | timeline.json> [--json] [--top 15]
 *
 * Basliklar: mac, sunucu tick'i (dagilim, en kotu saniyeler, dalga basina
 * bolumler), takilmalar (baskin bolum ve o anki sayilar), olay dongusu/GC/CPU,
 * ag (istemci basina KB/s, atlanan kareler), istemciler (FPS, kare suresi,
 * LOD, ping, cihaz), yeniden oynatma kaydi. Once `npm run build:server`.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseRecordingBuffer, timelineFromLines } from "../../apps/server/dist/debug/reader.js";

const SECTIONS = ["spawn", "towers", "projectiles", "enemies", "bodies", "legendary", "procs", "cooldowns", "ultimates", "snapshot", "wire", "latest", "perf", "other"];

export function loadTimeline(path) {
  const buffer = readFileSync(path);
  if (path.endsWith(".json")) {
    const parsed = JSON.parse(buffer.toString("utf8"));
    return { ...parsed, header: parsed.header, seconds: parsed.seconds ?? [], waves: parsed.waves ?? [], spikes: parsed.spikes ?? [], clients: parsed.clients ?? [], fingerprints: parsed.fingerprints ?? [] };
  }
  return timelineFromLines(parseRecordingBuffer(buffer));
}

const pct = (sorted, p) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]);
const f = (value, digits = 2) => (value == null || !Number.isFinite(value) ? "-" : Number(value).toFixed(digits));
const pad = (text, width) => String(text).padEnd(width);
const lpad = (text, width) => String(text).padStart(width);

/** Zaman cizelgesinden sayisal ozet (rapor ve testler ayni hesabi kullaniyor). */
export function analyzeTimeline(timeline) {
  const seconds = timeline.seconds.filter((second) => second.n > 0);
  const p95s = seconds.map((second) => second.tk.p95).sort((a, b) => a - b);
  const maxes = seconds.map((second) => second.tk.max).sort((a, b) => a - b);
  const sectionTotals = Object.fromEntries(SECTIONS.map((key) => [key, 0]));
  let ticks = 0;
  for (const second of seconds) {
    ticks += second.n;
    for (const key of SECTIONS) sectionTotals[key] += (second.s?.[key] ?? 0) * second.n;
  }
  const sectionShare = Object.fromEntries(SECTIONS.map((key) => [key, ticks > 0 ? sectionTotals[key] / ticks : 0]));
  const worst = [...seconds].sort((a, b) => b.tk.max - a.tk.max);
  const dominantCounts = {};
  for (const spike of timeline.spikes) dominantCounts[spike.dom] = (dominantCounts[spike.dom] ?? 0) + 1;
  const clients = {};
  for (const sample of timeline.clients) {
    const entry = clients[sample.s] ??= { samples: 0, fps: [], fpsMin: Infinity, ftP95: [], ftMax: 0, lodMax: 0, ping: [], drops: 0, starve: 0, hidden: 0, ctxLost: 0, device: "" };
    entry.samples += 1;
    if (sample.fps != null) entry.fps.push(sample.fps);
    if (sample.fpsMin != null) entry.fpsMin = Math.min(entry.fpsMin, sample.fpsMin);
    if (sample.ftP95 != null) entry.ftP95.push(sample.ftP95);
    if (sample.ftMax != null) entry.ftMax = Math.max(entry.ftMax, sample.ftMax);
    if (sample.lodMax != null) entry.lodMax = Math.max(entry.lodMax, sample.lodMax);
    if (sample.ping != null) entry.ping.push(sample.ping);
    entry.drops += sample.drops ?? 0;
    entry.starve += sample.starve ?? 0;
    entry.hidden += sample.hidden ?? 0;
    entry.ctxLost += sample.ctxLost ?? 0;
    entry.device = [sample.device, sample.os, sample.browser, sample.renderer, sample.dpr ? `dpr${sample.dpr}` : "", sample.cw ? `${sample.cw}x${sample.ch}` : "", sample.cores ? `${sample.cores}c` : "", sample.memGb ? `${sample.memGb}GB` : ""].filter(Boolean).join(" ");
  }
  let gcMax = 0;
  let cpuMax = 0;
  let loopMax = 0;
  let dtMax = 0;
  let skips = 0;
  let kbpsMax = 0;
  for (const second of timeline.seconds) {
    gcMax = Math.max(gcMax, second.pr?.gcMs ?? 0);
    cpuMax = Math.max(cpuMax, second.pr?.cpu ?? 0);
    loopMax = Math.max(loopMax, second.pr?.elMax ?? 0);
    dtMax = Math.max(dtMax, second.dtMax ?? 0);
    skips += second.w?.skip ?? 0;
    kbpsMax = Math.max(kbpsMax, second.w?.kbps ?? 0);
  }
  return {
    seconds: timeline.seconds.length,
    activeSeconds: seconds.length,
    ticks,
    p95OfSecondP95: pct(p95s, 0.95),
    maxTick: maxes.at(-1) ?? 0,
    sectionShare,
    worst,
    dominantCounts,
    clients,
    gcMax,
    cpuMax,
    loopMax,
    dtMax,
    skips,
    kbpsMax
  };
}

export function formatReport(timeline, { top = 12 } = {}) {
  const header = timeline.header ?? {};
  const end = timeline.end ?? {};
  const info = end.info ?? {};
  const analysis = analyzeTimeline(timeline);
  const out = [];
  out.push(`Kayit / recording: ${header.id ?? "?"}  oda ${header.roomId ?? "?"}  surum ${header.server?.version ?? "?"}  node ${header.server?.node ?? "?"}`);
  out.push(`Mac: asama ${info.stage ?? header.options?.stage ?? "?"}  kip ${info.mode ?? "?"}  operatorler ${(info.operators ?? []).join(", ") || "?"}  dalga ${info.wave ?? "?"}  sonuc ${info.result || (timeline.end ? "-" : "yarim (surec kesildi)")}`);
  out.push(`Sure: ${analysis.seconds} sn (mac tick'i olan ${analysis.activeSeconds} sn, ${analysis.ticks} tick)  olay ${timeline.events}  tick bandi ${timeline.ticks}  parmak izi ${timeline.fingerprints.length}${timeline.truncated ? `  KESIK (${timeline.truncated.reason})` : ""}`);
  out.push("");
  out.push("== Sunucu tick'i (ms) ==");
  out.push(`saniye p95'lerinin p95'i ${f(analysis.p95OfSecondP95)}  en buyuk tick ${f(analysis.maxTick)}  butce 16,67`);
  const share = Object.entries(analysis.sectionShare).sort((a, b) => b[1] - a[1]);
  const totalShare = share.reduce((sum, [, value]) => sum + value, 0) || 1;
  out.push("bolumler (tick basina ort.): " + share.map(([key, value]) => `${key} ${f(value, 3)} (${Math.round((value / totalShare) * 100)}%)`).join(", "));
  out.push("");
  out.push(`-- en kotu ${Math.min(top, analysis.worst.length)} saniye --`);
  out.push(`${pad("sn", 6)}${pad("dalga", 7)}${pad("evre", 9)}${lpad("ort", 7)}${lpad("p95", 7)}${lpad("max", 8)}${lpad("dtMax", 8)}${lpad("dusman", 8)}${lpad("mermi", 7)}${lpad("GC", 6)}${lpad("CPU", 6)}  baskin bolum`);
  for (const second of analysis.worst.slice(0, top)) {
    const dominant = Object.entries(second.sm ?? {}).sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
    out.push(`${pad(second.i, 6)}${pad(second.wave, 7)}${pad(second.ph, 9)}${lpad(f(second.tk.avg), 7)}${lpad(f(second.tk.p95), 7)}${lpad(f(second.tk.max), 8)}${lpad(f(second.dtMax, 1), 8)}${lpad(second.e?.enemies ?? "-", 8)}${lpad(second.e?.projectiles ?? "-", 7)}${lpad(f(second.pr?.gcMs, 0), 6)}${lpad(f(second.pr?.cpu, 0), 6)}  ${dominant[0]} ${f(dominant[1], 2)}`);
  }
  out.push("");
  out.push(`== Takilmalar (${timeline.spikes.length} satir) ==`);
  out.push("baskin bolumler: " + (Object.entries(analysis.dominantCounts).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} x${count}`).join(", ") || "-"));
  for (const spike of [...timeline.spikes].sort((a, b) => b.ms - a.ms).slice(0, top)) {
    out.push(`  t${spike.t} dalga ${spike.e?.wave ?? "?"} ${spike.kind} ${f(spike.ms)} ms (tick ${f(spike.tick)}, dt ${f(spike.dt, 1)})  ${spike.dom} ${f(spike.s?.[spike.dom])}  dusman ${spike.e?.enemies ?? "?"} mermi ${spike.e?.projectiles ?? "?"} kule ${spike.e?.towers ?? "?"} hasar olayi ${spike.e?.damageEvents ?? "?"}  GC ${f(spike.pr?.gcMs, 0)} CPU ${f(spike.pr?.cpu, 0)}% oda ${spike.pr?.rooms ?? "?"}`);
  }
  out.push("");
  out.push("== Dalgalar ==");
  out.push(`${pad("dalga", 7)}${lpad("sure", 7)}${lpad("ort", 8)}${lpad("max", 8)}${lpad("spike", 7)}${lpad("dusman", 8)}${lpad("mermi", 7)}  ilk uc bolum`);
  for (const wave of timeline.waves) {
    const lead = Object.entries(wave.s ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, value]) => `${key} ${f(value, 3)}`).join(", ");
    out.push(`${pad(wave.wave, 7)}${lpad(f(wave.durS, 0), 7)}${lpad(f(wave.avg, 3), 8)}${lpad(f(wave.max), 8)}${lpad(wave.spikes, 7)}${lpad(wave.enemiesMax, 8)}${lpad(wave.projectilesMax, 7)}  ${lead}`);
  }
  out.push("");
  out.push("== Surec ve ag ==");
  out.push(`olay dongusu en buyuk ${f(analysis.loopMax, 1)} ms  tick araligi en buyuk ${f(analysis.dtMax, 1)} ms  GC en kotu ${f(analysis.gcMax, 0)} ms/sn  CPU en yuksek ${f(analysis.cpuMax, 0)}%  en yuksek cikis ${f(analysis.kbpsMax, 1)} KB/s  atlanan snapshot ${analysis.skips}`);
  out.push("");
  out.push("== Istemciler ==");
  const ids = Object.keys(analysis.clients);
  if (ids.length === 0) out.push("istemci verisi yok (anonim veri ayari kapali ya da eski istemci)");
  for (const id of ids) {
    const entry = analysis.clients[id];
    const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);
    out.push(`  ${id}: ${entry.samples} ornek  FPS ort ${f(avg(entry.fps), 0)} min ${f(entry.fpsMin, 0)}  kare p95 ort ${f(avg(entry.ftP95), 1)} max ${f(entry.ftMax, 0)} ms  LOD max ${entry.lodMax}  ping ${f(avg(entry.ping), 0)} ms  dusen ${entry.drops} bos kare ${entry.starve} gizlenme ${entry.hidden} WebGL kaybi ${entry.ctxLost}  [${entry.device}]`);
  }
  return out.join("\n");
}

async function main(argv) {
  const path = argv.find((arg) => !arg.startsWith("--"));
  if (!path || argv.includes("--help")) {
    console.log("usage: node tools/debug/report.mjs <recording.ndjson.gz|timeline.json> [--json] [--top N]");
    return;
  }
  const topIndex = argv.indexOf("--top");
  const top = topIndex >= 0 ? Number(argv[topIndex + 1]) || 12 : 12;
  const timeline = loadTimeline(path);
  if (argv.includes("--json")) {
    const analysis = analyzeTimeline(timeline);
    console.log(JSON.stringify({ header: timeline.header, end: timeline.end, ...analysis, worst: analysis.worst.slice(0, top) }, null, 2));
    return;
  }
  console.log(formatReport(timeline, { top }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
