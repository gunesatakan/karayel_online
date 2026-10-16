#!/usr/bin/env node
/**
 * Sunucudan mac kayitlarini indirir (yonetici API'si, jetonla).
 *
 *   DEBUG_ADMIN_TOKEN=... node tools/debug/fetch.mjs --server https://karayel-online.fly.dev --list
 *   node tools/debug/fetch.mjs --server <url> --token <jeton> --id <kayit> [--timeline] [--out dizin]
 *   node tools/debug/fetch.mjs --server <url> --latest 5 [--out dizin]
 *   node tools/debug/fetch.mjs --server <url> --worst 3 [--by tick|fps|loop]
 *
 * Varsayilan sunucu `DEBUG_SERVER_URL` ya da http://localhost:2567; jeton
 * `--token`, yoksa `DEBUG_ADMIN_TOKEN`, yoksa `TELEMETRY_ADMIN_TOKEN`.
 * Indirilen `.ndjson.gz` dosyasi `report.mjs` ve `replay-profile.mjs` ile
 * acilir.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function args(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) { out._.push(arg); continue; }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; index += 1; }
  }
  return out;
}

async function request(server, token, path) {
  const response = await fetch(new URL(`/admin/api${path}`, server), { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) throw new Error("404: panel kapali (sunucuda DEBUG_ADMIN_TOKEN yok) ya da kayit yok");
  if (response.status === 401) throw new Error("401: jeton gecersiz");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const f = (value, digits = 1) => (value == null || !Number.isFinite(value) ? "-" : Number(value).toFixed(digits));

export function formatList(matches) {
  const lines = ["id                                   durum        sure  asama kip       dalga sonuc      tick p99   max  fps min  spike  boyut"];
  for (const m of matches) {
    lines.push([
      m.id.padEnd(37),
      String(m.status).padEnd(12),
      String(Math.round((m.durationS ?? 0) / 60) + "dk").padStart(5),
      String(m.stage ?? "-").padStart(6),
      " " + String(m.mode ?? "-").padEnd(9),
      String(m.wave ?? "-").padStart(5),
      " " + String(m.result || "-").padEnd(10),
      f(m.tick?.p99).padStart(8),
      f(m.tick?.max).padStart(6),
      f(m.client?.fpsMin, 0).padStart(8),
      String(m.spikes ?? 0).padStart(7),
      `${f((m.bytes ?? 0) / 1024, 0)}K`.padStart(7)
    ].join(""));
  }
  return lines.join("\n");
}

async function main(argv) {
  const options = args(argv);
  if (options.help) {
    console.log("usage: node tools/debug/fetch.mjs --server URL [--token T] (--list | --id ID [--timeline] | --latest N | --worst N [--by tick|fps|loop]) [--out dir] [--json]");
    return;
  }
  const server = String(options.server ?? process.env.DEBUG_SERVER_URL ?? "http://localhost:2567");
  const token = String(options.token ?? process.env.DEBUG_ADMIN_TOKEN ?? process.env.TELEMETRY_ADMIN_TOKEN ?? "");
  if (!token) throw new Error("jeton yok: --token ya da DEBUG_ADMIN_TOKEN");
  const outDir = String(options.out ?? "debug-recordings");
  const list = async () => (await (await request(server, token, "/matches")).json()).matches;

  const downloadOne = async (id) => {
    mkdirSync(outDir, { recursive: true });
    const replay = await request(server, token, `/matches/${encodeURIComponent(id)}/replay`);
    const path = join(outDir, `${id}.ndjson.gz`);
    writeFileSync(path, Buffer.from(await replay.arrayBuffer()));
    console.log(`${path}`);
    if (options.timeline) {
      const timeline = await request(server, token, `/matches/${encodeURIComponent(id)}/timeline`);
      const timelinePath = join(outDir, `${id}.timeline.json`);
      writeFileSync(timelinePath, Buffer.from(await timeline.arrayBuffer()));
      console.log(`${timelinePath}`);
    }
  };

  if (options.list) {
    const matches = await list();
    console.log(options.json ? JSON.stringify(matches, null, 2) : formatList(matches));
    return;
  }
  if (typeof options.id === "string") {
    await downloadOne(options.id);
    return;
  }
  if (options.latest || options.worst) {
    const matches = await list();
    const count = Number(options.latest ?? options.worst) || 1;
    const by = String(options.by ?? "tick");
    const score = (m) => (by === "fps" ? -(m.client?.fpsMin ?? 999) : by === "loop" ? m.loop?.dtMax ?? 0 : m.tick?.max ?? 0);
    const chosen = options.latest
      ? [...matches].sort((a, b) => b.createdAt - a.createdAt).slice(0, count)
      : [...matches].sort((a, b) => score(b) - score(a)).slice(0, count);
    for (const match of chosen) await downloadOne(match.id);
    return;
  }
  console.log("--list, --id, --latest ya da --worst gerekli (--help)");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
