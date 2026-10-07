/**
 * Sunucu telemetrisi: `POST /telemetry` ve `GET /telemetry/summary`.
 *
 * Kilitlenen sozler:
 *   1. Her olay kendi semasina gore temizleniyor: bilinmeyen alan ve tur
 *      atiliyor, metin kirpiliyor, zorunlu alani eksik olay dusuyor.
 *   2. Govde 16 KB'yi, istek basina olay 20'yi gecemiyor; IP basina dakikada
 *      sinirli istek (IP diske yazilmiyor).
 *   3. CORS yalnizca izinli kaynaklara (yerel, Vercel, itch.io + ortam listesi).
 *   4. Olaylar gunluk JSONL dosyasina ekleniyor; ozet satir satir okuyup
 *      sayiyor; ozet jetonsuz 401, jeton tanimli degilse 404.
 *   5. Disk hatasi sunucuyu dusurmuyor (bir kez loglanir); boyut siniri ve
 *      90 gunluk saklama calisiyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import cors from "cors";
import { ipRateKey } from "../apps/server/dist/rate-limit.js";
import {
  TELEMETRY_MAX_BODY_BYTES,
  TelemetryRateLimiter,
  TelemetryStore,
  createTelemetry,
  isOriginAllowed,
  parseAllowedOrigins,
  sanitizeTelemetryBatch,
  sanitizeTelemetryEvent,
  summarizeTelemetryFiles
} from "../apps/server/dist/telemetry.js";

const IID = "3f1c2a4e-1b2c-4d5e-8f90-123456789abc";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "karayel-telemetry-"));
  test.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Gercek express uygulamasi: telemetri genel cors()'tan once, index.ts'teki gibi. */
async function startServer(options) {
  const logs = [];
  const service = createTelemetry({ autoStart: false, log: (message) => logs.push(message), ...options });
  const app = express();
  app.use("/telemetry", service.router);
  app.use(cors());
  app.get("/health", (_request, response) => response.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  test.after(() => new Promise((resolve) => server.close(resolve)));
  return { service, base, logs };
}

function batch(events, extra = {}) {
  return JSON.stringify({ iid: IID, sid: "sess-1", ver: "0.1.0+abc1234", events, ...extra });
}

function post(base, body, headers = {}) {
  return fetch(`${base}/telemetry`, { method: "POST", body, headers: { "Content-Type": "text/plain", ...headers } });
}

function readLines(dir) {
  return readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()
    .flatMap((name) => readFileSync(join(dir, name), "utf8").replace(/\r\n/g, "\n").split("\n").filter(Boolean))
    .map((line) => JSON.parse(line));
}

test("sema: bilinmeyen alan ve tur atiliyor, metin kirpiliyor, zorunlu alan sart", () => {
  const event = sanitizeTelemetryEvent({
    t: "run_end",
    rid: "run123abc",
    outcome: "loss",
    wave: 14,
    stage: 2,
    op: "zeynep",
    cards: ["kart-a", "kart b <script>", "kart-c"],
    towers: [{ id: "warrior-1", lvl: 7, extra: 1 }, { id: "bad id", lvl: 3 }],
    playerName: "Ayse",
    ip: "1.2.3.4",
    hp: Number.NaN
  });
  assert.deepEqual(event, {
    t: "run_end",
    rid: "run123abc",
    outcome: "loss",
    stage: 2,
    op: "zeynep",
    wave: 14,
    cards: ["kart-a", "kart-c"],
    towers: [{ id: "warrior-1", lvl: 7 }]
  });

  const error = sanitizeTelemetryEvent({ t: "error", msg: "x".repeat(1000), kind: "nope", wave: -5 });
  assert.equal(error.msg.length, 300);
  assert.equal(error.kind, undefined, "gecersiz enum alani dusuyor");
  assert.equal(error.wave, undefined, "aralik disi sayi dusuyor");

  assert.equal(sanitizeTelemetryEvent({ t: "run_end", outcome: "win" }), undefined, "rid yoksa olay yok");
  assert.equal(sanitizeTelemetryEvent({ t: "hack", rid: "a" }), undefined, "bilinmeyen tur yok");
  assert.equal(sanitizeTelemetryEvent({ t: "constructor" }), undefined, "prototip adi tur sayilmiyor");

  const many = Array.from({ length: 25 }, () => ({ t: "session_start", device: "mobile" }));
  const result = sanitizeTelemetryBatch({ iid: IID, sid: "s1", events: [...many, { t: "bogus" }] }, NOW);
  assert.equal(result.events.length, 20, "istek basina en fazla 20 olay");
  assert.equal(result.dropped, 6);
  assert.equal(result.events[0].at, NOW);
  assert.equal(result.events[0].iid, IID);
  assert.equal(sanitizeTelemetryBatch({ sid: "s1", events: [] }), undefined, "kurulum kimligi sart");
  assert.equal(sanitizeTelemetryBatch({ iid: "bad id!", sid: "s1", events: [] }), undefined);
});

test("POST: 204, olaylar gunluk JSONL dosyasina; IP ve bilinmeyen alan yazilmiyor", async () => {
  const dir = tempDir();
  const { service, base } = await startServer({ dir, now: () => NOW });
  const response = await post(base, batch([
    { t: "session_start", ts: NOW - 5, device: "desktop", vw: 1280, vh: 720, lang: "tr-TR", pwa: false, iframe: true, host: "html-classic.itch.zone", userAgent: "Mozilla" },
    { t: "run_start", rid: "abc123def456", mode: "solo", stage: 1, op: "atakan", players: 1 }
  ]), { "Fly-Client-IP": "203.0.113.9" });
  assert.equal(response.status, 204);
  assert.equal(service.store.bufferedCount, 2, "tampon: hemen yazilmiyor");
  await service.store.flush();
  assert.ok(existsSync(join(dir, "events-2026-10-07.jsonl")));
  const lines = readLines(dir);
  assert.equal(lines.length, 2);
  assert.deepEqual(Object.keys(lines[0]).sort(), ["at", "device", "host", "iframe", "iid", "lang", "pwa", "sid", "t", "ts", "ver", "vh", "vw"].sort());
  assert.equal(lines[1].op, "atakan");
  const raw = readFileSync(join(dir, "events-2026-10-07.jsonl"), "utf8");
  assert.ok(!raw.includes("203.0.113.9"), "IP diske yazilmiyor");
  assert.ok(!raw.includes("Mozilla"), "bilinmeyen alan yazilmiyor");
});

test("boyut ve bicim: 16 KB ustu 413, bozuk JSON 400", async () => {
  const dir = tempDir();
  const { service, base } = await startServer({ dir, now: () => NOW });
  const huge = batch([{ t: "error", msg: "a".repeat(TELEMETRY_MAX_BODY_BYTES) }]);
  assert.equal((await post(base, huge)).status, 413);
  assert.equal((await post(base, "{not json")).status, 400);
  assert.equal((await post(base, JSON.stringify({ events: [] }))).status, 400);
  // Sunucu hala ayakta.
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal(service.store.bufferedCount, 0);
});

test("hiz siniri: IP basina dakikada N istek, pencere gecince yeniden", async () => {
  let now = NOW;
  const { base } = await startServer({ dir: tempDir(), now: () => now, rateLimitPerMinute: 3 });
  const body = batch([{ t: "session_start" }]);
  for (let index = 0; index < 3; index += 1) assert.equal((await post(base, body, { "Fly-Client-IP": "198.51.100.1" })).status, 204);
  const limited = await post(base, body, { "Fly-Client-IP": "198.51.100.1" });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal((await post(base, body, { "Fly-Client-IP": "198.51.100.2" })).status, 204, "baska IP etkilenmiyor");
  now += 61_000;
  assert.equal((await post(base, body, { "Fly-Client-IP": "198.51.100.1" })).status, 204);
});

test("CORS: izinli kaynaklar (yerel, Vercel, itch.io, ortam listesi), digerleri 403", async () => {
  const dir = tempDir();
  const { service, base } = await startServer({ dir, now: () => NOW, allowedOrigins: "https://*.example.org, https://oyun.example.com" });
  for (const origin of [
    "http://localhost:5173",
    "https://karayel-online.vercel.app",
    "https://html.itch.zone",
    "https://html-classic.itch.zone",
    "https://v6p9d9t4.ssl.hwcdn.net",
    "https://games.example.org",
    "https://oyun.example.com"
  ]) {
    const preflight = await fetch(`${base}/telemetry`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
    assert.equal(preflight.status, 204, origin);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin, origin);
    assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
    const posted = await post(base, batch([{ t: "session_start" }]), { Origin: origin });
    assert.equal(posted.status, 204, origin);
    assert.equal(posted.headers.get("access-control-allow-origin"), origin);
  }
  for (const origin of ["https://evil.example.net", "https://itch.zone.evil.net", "https://evilvercel.app"]) {
    const preflight = await fetch(`${base}/telemetry`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
    assert.equal(preflight.status, 403, origin);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null, origin);
    assert.equal((await post(base, batch([{ t: "session_start" }]), { Origin: origin })).status, 403, origin);
  }
  assert.equal(service.store.bufferedCount, 7, "yalnizca izinli kaynaklarin olaylari");
  // Genel cors() diger yollarda eskisi gibi herkese acik.
  const health = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example.net" } });
  assert.equal(health.headers.get("access-control-allow-origin"), "*");

  const rules = parseAllowedOrigins(undefined);
  assert.equal(isOriginAllowed("https://a.vercel.app", rules), true);
  assert.equal(isOriginAllowed("https://a.vercel.app.evil.com", rules), false);
});

test("ozet: jeton yoksa 404, yanlis jeton 401; dogru jetonla sayimlar", async () => {
  const noToken = await startServer({ dir: tempDir(), now: () => NOW });
  assert.equal((await fetch(`${noToken.base}/telemetry/summary`, { headers: { Authorization: "Bearer x" } })).status, 404);

  const dir = tempDir();
  const { base } = await startServer({ dir, now: () => NOW, adminToken: "gizli-jeton" });
  const send = (sid, events) => post(base, JSON.stringify({ iid: IID, sid, ver: "t", events }));
  await send("s1", [
    { t: "session_start", device: "mobile" },
    { t: "run_start", rid: "runA00001", mode: "solo", stage: 1, op: "zeynep", players: 1 },
    { t: "perf", rid: "runA00001", wave: 1, fpsAvg: 58, fpsMin: 40, pingAvg: 50, pingMax: 90, tickAvg: 4 },
    { t: "run_end", rid: "runA00001", outcome: "loss", stage: 1, op: "zeynep", wave: 7, cards: ["kart-a", "kart-b"], items: ["esya-x"] },
    { t: "run_start", rid: "runB00001", mode: "solo", stage: 1, op: "zeynep", players: 1 },
    { t: "run_end", rid: "runB00001", outcome: "win", stage: 1, op: "zeynep", wave: 30, cards: ["kart-a"], items: ["esya-x", "esya-y"] },
    { t: "error", msg: "TypeError: x is undefined", stack: "at a (/assets/index.js:1:2)\nat b (/assets/index.js:3:4)", kind: "error" }
  ]);
  await send("s2", [
    { t: "session_start", device: "desktop" },
    { t: "run_start", rid: "runC00001", mode: "coop", stage: 2, op: "atakan", players: 2 },
    { t: "perf", rid: "runC00001", wave: 1, fpsAvg: 30, fpsMin: 20, pingAvg: 150, pingMax: 400 },
    { t: "perf", rid: "runC00001", wave: 4, fpsAvg: 30, fpsMin: 20, pingAvg: 150, pingMax: 400 },
    // Birakilan kosu: run_end yok, son gorulen dalga 4.
    { t: "run_start", rid: "runD00001", mode: "solo", stage: 2, op: "atakan", players: 1 },
    { t: "abandon", rid: "runD00001", wave: 9, reason: "closed" },
    { t: "run_end", rid: "runD00001", outcome: "abandoned", wave: 9 },
    { t: "run_start", rid: "runE00001", mode: "creative", stage: 1, op: "zeynep", players: 1 },
    { t: "run_end", rid: "runE00001", outcome: "loss", wave: 3, mode: "creative", cards: ["kart-z"] },
    { t: "error", msg: "TypeError: x is undefined", stack: "at a (/assets/index.js:1:2)", kind: "error" }
  ]);
  // Ozet okumadan once tamponu yaziyor; bozuk bir satir sayilip geciliyor.
  writeFileSync(join(dir, "events-2026-10-06.jsonl"), "{bozuk\n", "utf8");

  assert.equal((await fetch(`${base}/telemetry/summary`)).status, 401);
  assert.equal((await fetch(`${base}/telemetry/summary`, { headers: { Authorization: "Bearer yanlis" } })).status, 401);
  const response = await fetch(`${base}/telemetry/summary?days=7`, { headers: { Authorization: "Bearer gizli-jeton" } });
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.days, 7);
  assert.equal(summary.badLines, 1);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.installs, 1);
  assert.deepEqual(summary.devices, { mobile: 1, desktop: 1 });
  assert.deepEqual(summary.runs, { started: 5, win: 1, loss: 1, abandoned: 1, unfinished: 1, creative: 1 });
  assert.deepEqual(summary.deathWaves, { 1: { 7: 1 } }, "yaratici olum sayilmiyor");
  assert.deepEqual(summary.quitWaves, { 2: { 4: 1, 9: 1 } });
  assert.deepEqual(summary.winRate.byStage["1"], { runs: 2, wins: 1, losses: 1, abandoned: 0, winRate: 0.5 });
  assert.deepEqual(summary.winRate.byStage["2"], { runs: 2, wins: 0, losses: 0, abandoned: 2, winRate: null });
  assert.equal(summary.winRate.byOperator.zeynep.winRate, 0.5);
  assert.deepEqual(summary.topCards, [{ id: "kart-a", count: 2 }, { id: "kart-b", count: 1 }]);
  assert.deepEqual(summary.topItems, [{ id: "esya-x", count: 2 }, { id: "esya-y", count: 1 }]);
  assert.deepEqual(summary.topErrors, [{ msg: "TypeError: x is undefined", frame: "at a (/assets/index.js:1:2)", count: 2, sessions: 2 }]);
  assert.deepEqual(summary.perfByWave["1"], { samples: 2, fpsAvg: 44, fpsMin: 30, pingAvg: 100, pingMax: 400, tickAvg: 4 });
});

test("disk hatasi sunucuyu dusurmuyor: bir kez loglaniyor, istekler 204", async () => {
  const root = tempDir();
  const blocker = join(root, "blocker");
  writeFileSync(blocker, "dosya, klasor degil", "utf8");
  const { service, base, logs } = await startServer({ dir: join(blocker, "telemetry"), now: () => NOW });
  for (let round = 0; round < 3; round += 1) {
    assert.equal((await post(base, batch([{ t: "session_start" }]))).status, 204);
    await service.store.flush();
  }
  service.store.flushSync();
  assert.equal(logs.filter((line) => line.includes("disk")).length, 1, "tek log");
  assert.equal(service.store.stats.droppedDisk, 3);
  assert.equal(service.store.stats.written, 0);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test("boyut siniri yazimi durduruyor; 90 gunden eski dosyalar siliniyor", async () => {
  const dir = tempDir();
  const logs = [];
  const old = new Date(NOW - 91 * DAY).toISOString().slice(0, 10);
  const recent = new Date(NOW - 89 * DAY).toISOString().slice(0, 10);
  writeFileSync(join(dir, `events-${old}.jsonl`), "{}\n", "utf8");
  writeFileSync(join(dir, `events-${recent}.jsonl`), "{}\n", "utf8");
  writeFileSync(join(dir, "notlar.txt"), "dokunulmaz", "utf8");
  const store = new TelemetryStore({ dir, now: () => NOW, maxTotalBytes: 600, log: (message) => logs.push(message) });
  await store.prune();
  assert.ok(!existsSync(join(dir, `events-${old}.jsonl`)), "eski gun silindi");
  assert.ok(existsSync(join(dir, `events-${recent}.jsonl`)), "saklama icindeki gun duruyor");
  assert.ok(existsSync(join(dir, "notlar.txt")), "baska dosyaya dokunulmuyor");

  const event = (index) => ({ at: NOW, iid: IID, sid: "s", t: "error", msg: `hata ${index} ${"x".repeat(150)}` });
  store.append([event(1), event(2)]);
  await store.flush();
  store.append([event(3), event(4), event(5)]);
  await store.flush();
  store.append([event(6)]);
  await store.flush();
  assert.equal(store.stats.written, 2);
  assert.ok(store.stats.droppedSize >= 4);
  assert.equal(logs.filter((line) => line.includes("boyut")).length, 1, "sinir bir kez loglaniyor");
  assert.equal(readLines(dir).filter((line) => line.t === "error").length, 2);
});

test("ozet akisi dosyalari satir satir okuyor (buyuk dosya)", async () => {
  const dir = tempDir();
  const path = join(dir, "events-2026-10-07.jsonl");
  const lines = [];
  for (let index = 0; index < 5000; index += 1) {
    lines.push(JSON.stringify({ at: NOW, iid: IID, sid: `s${index % 50}`, t: "run_end", rid: `run${index}x`, outcome: index % 2 ? "win" : "loss", stage: 1, op: "zeynep", wave: index % 30 }));
  }
  writeFileSync(path, `${lines.join("\r\n")}\r\n`, "utf8");
  const summary = await summarizeTelemetryFiles([path], { from: "2026-10-07", to: "2026-10-07", days: 1 });
  assert.equal(summary.events, 5000);
  assert.equal(summary.sessions, 50);
  assert.equal(summary.runs.win, 2500);
  assert.equal(summary.winRate.byStage["1"].winRate, 0.5);
});

test("CORS: yerel ag kaynaklari yalnizca rakamli adres; 10.evil.example gibi alan adlari reddediliyor", () => {
  const rules = parseAllowedOrigins(undefined);
  for (const origin of [
    "http://10.0.0.5:5173",
    "http://10.1.2.3",
    "https://10.20.30.40:8443",
    "http://192.168.1.20:5173",
    "http://192.168.0.1",
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://[::1]:5173",
    "https://karayel.vercel.app",
    "https://html-classic.itch.zone"
  ]) {
    assert.equal(isOriginAllowed(origin, rules), true, origin);
  }
  for (const origin of [
    "http://10.evil.example",
    "http://10.0.0.evil.com",
    "http://10.0.0.5.evil.com",
    "http://10.0.0",
    "http://100.0.0.1",
    "http://192.168.evil.example",
    "http://192.168.1.1.evil.example",
    "http://192.1680.1.1",
    "http://localhost.evil.com",
    "http://localhost:80.evil.com",
    "http://127.0.0.1.evil.com"
  ]) {
    assert.equal(isOriginAllowed(origin, rules), false, origin);
  }
});

test("hiz siniri IPv6'yi /64 onekiyle sayiyor; IPv4'e eslenmis adres IPv4 sayiliyor", async () => {
  const { base } = await startServer({ dir: tempDir(), now: () => NOW, rateLimitPerMinute: 2 });
  const body = batch([{ t: "session_start" }]);
  assert.equal((await post(base, body, { "Fly-Client-IP": "2001:db8:aa:bb::1" })).status, 204);
  assert.equal((await post(base, body, { "Fly-Client-IP": "2001:db8:aa:bb:1:2:3:4" })).status, 204);
  assert.equal((await post(base, body, { "Fly-Client-IP": "2001:0db8:00aa:00bb:ffff::9" })).status, 429, "ayni /64 yeni kova acti");
  assert.equal((await post(base, body, { "Fly-Client-IP": "2001:db8:aa:bc::1" })).status, 204, "komsu /64 ayni kovada");
  assert.equal(ipRateKey("::ffff:198.51.100.7"), "198.51.100.7");
  assert.equal(ipRateKey("2001:db8:aa:bb::1"), ipRateKey("2001:DB8:AA:BB:0:0:0:ffff"));
});

test("hiz siniri haritasi istekte degil zamanlayicida temizleniyor", () => {
  let now = NOW;
  const limiter = new TelemetryRateLimiter(1, 60_000, () => now);
  for (let index = 0; index < 20_050; index += 1) limiter.hit(`198.51.${index >> 8}.${index & 255}`);
  assert.equal(limiter.size, 20_050, "yeni anahtar eklerken tarama yapildi");
  now += 61_000;
  limiter.hit("203.0.113.1");
  assert.equal(limiter.size, 20_051, "istek yolunda O(n) temizlik var");
  limiter.prune();
  assert.equal(limiter.size, 1);
  // Zamanlayici sureci acik tutmuyor ve durdurulabiliyor.
  limiter.startPruning(10);
  assert.equal(limiter.pruneTimer.hasRef(), false);
  limiter.stopPruning();
  assert.equal(limiter.pruneTimer, undefined);

  const service = createTelemetry({ dir: tempDir(), autoStart: true, log: () => {} });
  try {
    assert.ok(service.store, "servis kuruldu");
  } finally {
    service.stop();
  }
});

test("ortak butce: dakikalik olay siniri ve gunluk bayt kotasi asilinca 429 ve olay atiliyor", async () => {
  let now = NOW;
  const { service, base } = await startServer({ dir: tempDir(), now: () => now, rateLimitPerMinute: 1000, globalEventsPerMinute: 5 });
  const events = (count) => batch(Array.from({ length: count }, () => ({ t: "session_start", device: "mobile" })));
  assert.equal((await post(base, events(3), { "Fly-Client-IP": "198.51.100.10" })).status, 204);
  assert.equal((await post(base, events(3), { "Fly-Client-IP": "198.51.100.11" })).status, 429, "farkli IP'ler ortak siniri asti");
  assert.equal((await post(base, events(2), { "Fly-Client-IP": "198.51.100.12" })).status, 204);
  assert.equal((await post(base, events(1), { "Fly-Client-IP": "198.51.100.13" })).status, 429, "dolu dakikada istek kabul edildi");
  assert.equal(service.store.bufferedCount, 5, "reddedilen olaylar tampona girdi");
  now += 61_000;
  assert.equal((await post(base, events(1), { "Fly-Client-IP": "198.51.100.13" })).status, 204, "dakika donunce acilmadi");

  // Gunluk kota: bir gunluk yazim siniri dolunca gunun geri kalani 429.
  let day = NOW;
  const quota = await startServer({ dir: tempDir(), now: () => day, rateLimitPerMinute: 1000, dailyByteQuota: 800 });
  // Her olay ~320 bayt: ikisi sigiyor, ucuncusu sigmiyor.
  const big = batch([{ t: "error", msg: "x".repeat(200) }]);
  assert.equal((await post(quota.base, big)).status, 204);
  assert.equal((await post(quota.base, big)).status, 204);
  assert.equal((await post(quota.base, big)).status, 429, "gunluk kota asildi");
  assert.equal(quota.service.store.bufferedCount, 2);
  day += 61_000;
  assert.equal((await post(quota.base, big)).status, 429, "kota dakikayla sifirlandi");
  day += 24 * 60 * 60 * 1000;
  assert.equal((await post(quota.base, big)).status, 204, "yeni gunde kota acilmadi");
});
