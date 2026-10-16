/**
 * Mac kaydedicisi ("ucus kaydi"): depo, zaman cizelgesi, yonetici API'si,
 * istemci izni, oda basina tohumlu zar ve uretim yolundan bot macinin
 * birebir yeniden oynatilmasi.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { gzipSync } from "node:zlib";
import express from "express";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { SeededRoomRuntime, LIVE_ROOM_RUNTIME, mulberry32 } from "../apps/server/dist/debug/room-runtime.js";
import { DebugRecordingStore, createRecordingId, parseIdTime } from "../apps/server/dist/debug/store.js";
import { MatchRecorder, fingerprintHash, DEBUG_FINGERPRINT_EVERY_TICKS } from "../apps/server/dist/debug/recorder.js";
import { ProcessSampler } from "../apps/server/dist/debug/process-sampler.js";
import { installDebugRecorder, isDebugRecorderDisabled } from "../apps/server/dist/debug/index.js";
import { ADMIN_PANEL_HTML } from "../apps/server/dist/debug/admin-panel.js";
import { parseRecordingBuffer, readRecordingTimeline } from "../apps/server/dist/debug/reader.js";
import { DEBUG_CLIENT_SAMPLE_FIELDS, normalizeMapData } from "../packages/shared/dist/index.js";
import { assembleRecording, loadRecordingFile, replayRecording } from "../tools/debug/replay-lib.mjs";
import { runRecordedBotMatch } from "../tools/debug/bot-match.mjs";
import { analyzeTimeline, formatReport, loadTimeline } from "../tools/debug/report.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const DAY = 24 * 60 * 60 * 1000;
const tempDir = (label) => mkdtempSync(join(tmpdir(), `nx-debug-${label}-`));

// --- depo -----------------------------------------------------------------

test("depo: parcalar art arda gzip uyeleri; yarim son uye okunabilir kisma kadar aciliyor", async () => {
  const dir = tempDir("store");
  try {
    const store = new DebugRecordingStore({ dir, log: () => {} });
    await store.init();
    const id = createRecordingId(Date.UTC(2026, 9, 16, 12, 0, 0), "odaA");
    assert.equal(id, "20261016-120000-odaA");
    assert.equal(parseIdTime(id), Date.UTC(2026, 9, 16, 12, 0, 0));
    store.begin(id, { id, roomId: "odaA", createdAt: Date.now(), updatedAt: Date.now(), status: "live", durationS: 0, bytes: 0 });
    await store.append(id, '{"k":"hdr","id":"x"}\n');
    await store.append(id, '{"k":"sec","i":0}\n{"k":"sec","i":1}\n');
    await store.drain(id);
    const lines = parseRecordingBuffer(readFileSync(store.dataPath(id)));
    assert.deepEqual(lines.map((line) => line.k), ["hdr", "sec", "sec"]);
    assert.equal(store.sizeOf(id), statSync(store.dataPath(id)).size);
    // Surec yazarken coktu: son uye yarim.
    appendFileSync(store.dataPath(id), gzipSync('{"k":"sec","i":2}\n{"k":"sec","i":3}\n'));
    truncateSync(store.dataPath(id), statSync(store.dataPath(id)).size - 12);
    const timeline = await readRecordingTimeline(store.dataPath(id));
    assert.ok(timeline.header, "baslik kayboldu");
    assert.ok(timeline.seconds.length >= 2, "yarim dosyanin saglam kismi okunmadi");
    const sync = parseRecordingBuffer(readFileSync(store.dataPath(id)));
    assert.ok(sync.length >= 3);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("depo: saklama suresi ve toplam sinir; en eski once siliniyor, suren kayit silinmiyor", async () => {
  const dir = tempDir("prune");
  try {
    const now = Date.UTC(2026, 9, 16);
    const make = (offsetDays, room, bytes) => {
      const at = now - offsetDays * DAY;
      const id = createRecordingId(at, room);
      writeFileSync(join(dir, `${id}.ndjson.gz`), Buffer.alloc(bytes, 1));
      writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, roomId: room, createdAt: at, updatedAt: at, status: "ended", durationS: 1, bytes }));
      return id;
    };
    const ancient = make(40, "eski", 100);
    const old = make(10, "orta", 400);
    const recent = make(2, "yeni", 400);
    const live = make(20, "canli", 400);
    const store = new DebugRecordingStore({ dir, maxTotalBytes: 900, retentionDays: 30, now: () => now, log: () => {} });
    await store.init();
    store.begin(live, { id: live, roomId: "canli", createdAt: now - 20 * DAY, updatedAt: now, status: "live", durationS: 0, bytes: 400 });
    assert.equal(store.totalBytes(), 1300);
    await store.prune();
    assert.ok(!existsSync(join(dir, `${ancient}.ndjson.gz`)), "30 gunden eski kayit silinmedi");
    assert.ok(!existsSync(join(dir, `${old}.ndjson.gz`)), "sinir asildi ama en eski bitmis kayit silinmedi");
    assert.ok(existsSync(join(dir, `${recent}.ndjson.gz`)));
    assert.ok(existsSync(join(dir, `${live}.ndjson.gz`)), "suren kayit silindi");
    assert.ok(store.totalBytes() <= 900);
    // Yeniden acilista canli gorunen eski ozet "interrupted".
    const reopened = new DebugRecordingStore({ dir, now: () => now, log: () => {} });
    await reopened.init();
    assert.equal(reopened.get(recent).status, "ended");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("depo: sinir doluyken yeni parca atiliyor, sunucu dusmuyor", async () => {
  const dir = tempDir("cap");
  try {
    const store = new DebugRecordingStore({ dir, maxTotalBytes: 10, log: () => {} });
    await store.init();
    const id = createRecordingId(Date.now(), "dolu");
    store.begin(id, { id, roomId: "dolu", createdAt: Date.now(), updatedAt: Date.now(), status: "live", durationS: 0, bytes: 0 });
    await store.append(id, `${"x".repeat(5000)}\n`);
    await store.append(id, "ikinci\n");
    assert.equal(store.stats.droppedChunks, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("depo: diskte bos yer azalinca en eski bitmis kayit siliniyor, yetmezse parca atiliyor", async () => {
  const dir = tempDir("free");
  try {
    let free = 50;
    const now = Date.UTC(2026, 9, 16);
    const oldId = createRecordingId(now - DAY, "eski");
    writeFileSync(join(dir, `${oldId}.ndjson.gz`), Buffer.alloc(100, 1));
    const store = new DebugRecordingStore({ dir, minFreeBytes: 100, freeBytes: async () => free, now: () => now, log: () => {} });
    await store.init();
    const removeOld = store.remove.bind(store);
    store.remove = async (id) => { free += 100; return removeOld(id); };
    const id = createRecordingId(now, "yeni");
    store.begin(id, { id, roomId: "yeni", createdAt: now, updatedAt: now, status: "live", durationS: 0, bytes: 0 });
    await store.append(id, "satir\n");
    assert.ok(!existsSync(join(dir, `${oldId}.ndjson.gz`)), "bos yer icin eski kayit silinmedi");
    assert.ok(existsSync(store.dataPath(id)), "yer acildiktan sonra yazilmadi");
    free = 10;
    const blocked = new DebugRecordingStore({ dir, minFreeBytes: 100, freeBytes: async () => free, now: () => now, log: () => {} });
    await blocked.init();
    blocked.begin(id, { id, roomId: "yeni", createdAt: now, updatedAt: now, status: "live", durationS: 0, bytes: 0 });
    await blocked.append(id, "ikinci\n");
    assert.equal(blocked.stats.droppedChunks, 1, "disk doluyken yazildi");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// --- zaman cizelgesi --------------------------------------------------------

function fakeRoom(runtime, overrides = {}) {
  const counts = { wave: 3, phase: "combat", players: 1, clients: 1, enemies: 40, enemyKinds: { grunt: 40 }, air: 0, champions: 0, specials: 0, towers: 10, structures: 4, projectiles: 25, beams: 2, drones: 3, bodies: 0, damageEvents: 12, killEvents: 1, zones: 0, shields: 0, surges: 0, teamHealth: 90, kills: 5 };
  return {
    roomId: "sahte",
    clients: [],
    runtime,
    getDebugCounts: () => ({ ...counts, ...overrides.counts }),
    getDebugInfo: () => ({ runId: "run-1", stage: 2, mapScale: 1, mode: "solo", operators: ["warrior"], wave: 3, gameStarted: true, result: "" }),
    getDebugFingerprint: () => "durum",
    broadcastPatch: () => undefined
  };
}

const frame = (ms, parts = {}) => ({ targetSearches: 2, targetChecks: 30, aoeChecks: 1, chainChecks: 0, damageEvents: 3, spawnMs: 0, towersMs: ms * 0.5, projectilesMs: ms * 0.2, enemiesMs: ms * 0.2, cooldownsMs: 0, ultimatesMs: 0, snapshotMs: 0, tickMs: ms, snapshotBytes: 0, ...parts });
const sections = (parts = {}) => ({ latestMs: 0, bodiesMs: 0, legendaryMs: 0, procsMs: 0, wireMs: 0, perfMs: 0, ...parts });
const wire = (parts = {}) => ({ deltaBytes: 0, fullBytes: 0, legacyBytes: 0, deltaFrames: 0, fullFrames: 0, legacyFrames: 0, skipped: 0, ...parts });

function recorderFixture(dir, config = {}) {
  const runtime = new SeededRoomRuntime(42, Date.UTC(2026, 9, 16), { tick: () => clock.now, scope: () => clock.now });
  const clock = { now: Date.UTC(2026, 9, 16) };
  const store = new DebugRecordingStore({ dir, log: () => {} });
  const sampler = new ProcessSampler(() => 1);
  const room = fakeRoom(runtime);
  const recorder = new MatchRecorder(room, { playerName: "Gizli Ad", ownerSecret: "cok-gizli-sahip-sirri-1234", roomName: "Arkadaslar", stage: 2, characterId: "warrior" }, {
    store, sampler, spikeMs: 10, loopStallMs: 50, maxRecordingBytes: 50 * 1024 * 1024, maxEvents: 1000, serverVersion: "test", now: () => clock.now, ...config
  });
  const step = (ms, dtMs = 1000 / 60, parts) => {
    const dt = runtime.beginTick(dtMs);
    clock.now += dt;
    recorder.tickStart(runtime.lastDeltaUs, runtime.now());
    recorder.tickEnd(ms, frame(ms), sections(parts), wire({ deltaBytes: 500, deltaFrames: 1 }));
  };
  return { runtime, store, recorder, step, clock, room };
}

test("zaman cizelgesi: saniyelik dagilim, bolumler, spike ve ozet p99", async () => {
  const dir = tempDir("timeline");
  try {
    const { recorder, step, store } = recorderFixture(dir);
    // 3 saniye: tick'lerin cogu 1 ms, her saniyede bir 20 ms'lik takilma (kuleler baskin).
    for (let second = 0; second < 3; second += 1) {
      for (let index = 0; index < 60; index += 1) step(index === 30 ? 20 : 1);
    }
    recorder.dispose();
    await store.drain();
    const lines = parseRecordingBuffer(readFileSync(store.dataPath(recorder.id)));
    const seconds = lines.filter((line) => line.k === "sec");
    assert.ok(seconds.length >= 2);
    const first = seconds[0];
    assert.equal(first.tk.max, 20);
    assert.equal(first.tk.p50, 1);
    assert.ok(Math.abs(first.tk.avg - (59 + 20) / 60) < 0.05, `ortalama ${first.tk.avg}`);
    assert.ok(first.s.towers > first.s.enemies, "bolum paylari yanlis");
    assert.equal(first.e.enemies, 40);
    assert.ok(first.w.db > 0 && first.w.hz > 0);
    assert.equal(first.ops.tc, 30 * first.n);
    const spikes = lines.filter((line) => line.k === "spike");
    assert.equal(spikes.length, 3);
    assert.equal(spikes[0].dom, "towers");
    assert.equal(spikes[0].e.projectiles, 25, "spike anindaki sayilar yok");
    const summary = store.get(recorder.id);
    assert.equal(summary.status, "ended");
    assert.equal(summary.tick.max, 20);
    assert.equal(summary.tick.p50, 1);
    assert.equal(summary.spikes, 3);
    assert.equal(summary.stage, 2);
    assert.ok(lines.some((line) => line.k === "wave"), "dalga ozeti yok");
    assert.ok(lines.some((line) => line.k === "fp" && line.fin), "son parmak izi yok");
    // Takma adlar: ad, sir ve oda adi diske inmiyor.
    const raw = JSON.stringify(lines);
    assert.ok(!raw.includes("Gizli Ad") && !raw.includes("cok-gizli") && !raw.includes("Arkadaslar"));
    assert.equal(lines[0].options.playerName, "P1");
    assert.match(lines[0].options.ownerSecret, /^replay-owner-secret-/);
    // Rapor araci ayni kaydi okuyor.
    const timeline = loadTimeline(store.dataPath(recorder.id));
    const analysis = analyzeTimeline(timeline);
    assert.equal(analysis.maxTick, 20);
    assert.match(formatReport(timeline), /Takilmalar \(3 satir\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("zaman cizelgesi: olay dongusu takilmasi (uzun tick araligi) ayri spike; istemci ornegi hiz sinirli", async () => {
  const dir = tempDir("loop");
  try {
    const { recorder, step, store, clock } = recorderFixture(dir);
    for (let index = 0; index < 10; index += 1) step(1);
    step(1, 120);
    recorder.clientSample("s1", { fps: 30, fpsMin: 12 });
    recorder.clientSample("s1", { fps: 99 });
    clock.now += 5000;
    recorder.clientSample("s1", { fps: 50 });
    for (let index = 0; index < 120; index += 1) step(1);
    recorder.dispose();
    await store.drain();
    const lines = parseRecordingBuffer(readFileSync(store.dataPath(recorder.id)));
    const loop = lines.filter((line) => line.k === "spike" && line.kind === "loop");
    assert.equal(loop.length, 1);
    assert.equal(loop[0].dom, "eventLoop");
    assert.equal(loop[0].dt, 120);
    const samples = lines.filter((line) => line.k === "cli");
    assert.deepEqual(samples.map((line) => line.fps), [30, 50]);
    const summary = store.get(recorder.id);
    assert.equal(summary.client.samples, 2);
    assert.equal(summary.client.fpsMin, 12);
    assert.equal(summary.loop.dtMax, 120);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("kaydedici maliyeti: tick basina ortalama mikrosaniyeler (butce 100 us)", async (t) => {
  const dir = tempDir("bench");
  try {
    const { recorder, runtime, store } = recorderFixture(dir);
    const ticks = 60 * 60 * 5;
    const f = frame(2);
    const s = sections();
    const w = wire({ deltaBytes: 900, deltaFrames: 1 });
    const started = performance.now();
    for (let index = 0; index < ticks; index += 1) {
      runtime.beginTick(1000 / 60);
      recorder.tickStart(runtime.lastDeltaUs, runtime.now());
      recorder.tickEnd(2, f, s, w);
    }
    const perTickUs = ((performance.now() - started) * 1000) / ticks;
    recorder.dispose();
    await store.drain();
    t.diagnostic(`kaydedici: ${perTickUs.toFixed(2)} us/tick (${ticks} tick, saniye satiri ve parmak izi dahil)`);
    assert.ok(perTickUs < 100, `tick basina ${perTickUs.toFixed(1)} us`);
    assert.ok(store.get(recorder.id).recorderUs.avg < 100);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("kayit siniri: olay tavani asilinca yeniden oynatma kaydi kesiliyor, cizelge suruyor", async () => {
  const dir = tempDir("trunc");
  try {
    const { recorder, step, store } = recorderFixture(dir, { maxEvents: 5 });
    for (let index = 0; index < 10; index += 1) recorder.message("s1", "latency:ping", { sentAt: index }, index);
    for (let index = 0; index < 130; index += 1) step(1);
    recorder.dispose();
    await store.drain();
    const lines = parseRecordingBuffer(readFileSync(store.dataPath(recorder.id)));
    assert.equal(lines.filter((line) => line.k === "ev").length, 5);
    assert.ok(lines.some((line) => line.k === "trunc"));
    assert.ok(lines.filter((line) => line.k === "sec").length >= 2, "cizelge de durdu");
    assert.equal(store.get(recorder.id).replay.truncated, true);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("cikis: drainForExit + flushSync ozeti ve son parcayi (end satiri) esanli yaziyor", async () => {
  const dir = tempDir("exit");
  try {
    const { recorder, step, store } = recorderFixture(dir);
    for (let index = 0; index < 130; index += 1) step(1);
    // Mac bitti; async yazim baslamadan surec kapaniyor.
    recorder.dispose();
    store.flushSync(new Map([[recorder.id, recorder.drainForExit()]]));
    const lines = parseRecordingBuffer(readFileSync(store.dataPath(recorder.id)));
    assert.ok(lines.some((line) => line.k === "end"), "son parca (end) kayboldu");
    assert.equal(lines[0].k, "hdr");
    const summary = JSON.parse(readFileSync(store.summaryPath(recorder.id), "utf8"));
    assert.equal(summary.id, recorder.id);
    assert.equal(summary.status, "ended");
    await store.drain();
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("cikis: suren kayit drainForExit ile yarim ama okunur; ozet interrupted", async () => {
  const dir = tempDir("exit-live");
  try {
    const { recorder, step, store } = recorderFixture(dir);
    for (let index = 0; index < 200; index += 1) step(1);
    store.flushSync(new Map([[recorder.id, recorder.drainForExit()]]));
    const lines = parseRecordingBuffer(readFileSync(store.dataPath(recorder.id)));
    assert.ok(lines.some((line) => line.k === "sec"));
    assert.ok(lines.some((line) => line.k === "tk"), "tick bandi yazilmadi");
    assert.equal(JSON.parse(readFileSync(store.summaryPath(recorder.id), "utf8")).status, "interrupted");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("depo: zincir ve kuyruk kayitlari birakiliyor; temizlik tek seferde, cift silme yok", async () => {
  const dir = tempDir("leak");
  try {
    const now = Date.UTC(2026, 9, 16);
    const store = new DebugRecordingStore({ dir, now: () => now, retentionDays: 30, log: () => {} });
    await store.init();
    for (let index = 0; index < 5; index += 1) {
      const id = createRecordingId(now - (40 + index) * DAY, `eski${index}`);
      store.begin(id, { id, roomId: "x", createdAt: now - (40 + index) * DAY, updatedAt: now, status: "live", durationS: 0, bytes: 0 });
      await store.append(id, "satir\n");
      store.end(id);
    }
    await store.drain();
    assert.equal(store.chains.size, 0, "zincir kaydi sizdi");
    assert.equal(store.pendingChunks.size, 0, "kuyruk kaydi sizdi");
    const first = store.prune();
    const second = store.prune();
    assert.equal(first, second, "temizlik es zamanli iki kez kostu");
    await Promise.all([first, second, store.remove(createRecordingId(now - 40 * DAY, "eski0"))]);
    assert.equal(store.stats.pruned, 5, "silme sayaci yanlis");
    assert.equal(store.list().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("kayit secenekleri: odanin okudugu anlam, ham deger degil; giriste harita yok, red govdesiz", async () => {
  const dir = tempDir("opts");
  try {
    const runtime = new SeededRoomRuntime(1, Date.UTC(2026, 9, 16));
    const store = new DebugRecordingStore({ dir, log: () => {} });
    const room = fakeRoom(runtime);
    const rawMap = { cols: 9, rows: 9, extra: "x".repeat(5000) };
    const recorder = new MatchRecorder(room, { mapScale: "2", stage: null, characterId: "c".repeat(200), autoStart: "yes", mapData: rawMap, junk: "y".repeat(10_000) }, {
      store, sampler: new ProcessSampler(() => 1), spikeMs: 10, loopStallMs: 50, maxRecordingBytes: 1e9, maxEvents: 100, serverVersion: "t"
    });
    const client = { sessionId: "s1" };
    recorder.join(client, { characterId: "warrior", mapData: rawMap, playerName: "Biri" }, 1, true);
    recorder.join({ sessionId: "s2" }, { characterId: "zeynep", playerName: "Yabanci" }, 2, false);
    recorder.dispose();
    await store.drain();
    const lines = parseRecordingBuffer(readFileSync(store.dataPath(recorder.id)));
    const options = lines[0].options;
    assert.equal(options.mapScale, false, "turu tutmayan olcek anlamini korumadi");
    assert.ok(!("stage" in options), "null asama varsayilana dusmeli");
    assert.equal(options.characterId, "");
    assert.equal(options.autoStart, false);
    assert.deepEqual(options.mapData, normalizeMapData(rawMap));
    assert.deepEqual(normalizeMapData(options.mapData), options.mapData, "harita duzeltmesi esgucsuz degil");
    assert.ok(!JSON.stringify(lines).includes("yyyy"), "bilinmeyen alan kayda girdi");
    const joins = lines.filter((line) => line.k === "ev" && line.e === "join");
    assert.equal(joins[0].o.mapData, undefined, "giris haritayi tasidi");
    assert.equal(joins[0].o.playerName, "P1");
    assert.equal(joins[1].rejected, 1);
    assert.equal(joins[1].o, undefined, "reddedilen girisin govdesi kayda girdi");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("baska odanin yerinden etme sorgusu bu odanin kaydina olay yazmiyor; kendi okumasi yaziyor", () => {
  const runtime = new SeededRoomRuntime(3, 1_800_000_000_000, { tick: () => 1_800_000_000_000, scope: () => 1_800_000_000_000 });
  const seen = [];
  runtime.tape = { onSeats: (count) => seen.push(count) };
  MatchRoom.createRuntime = () => runtime;
  try {
    const room = new MatchRoom();
    room.reservedSeats = { koltuk: [] };
    room.isEvictable(1_800_000_000_000);
    assert.deepEqual(seen, [], "yerinden etme sorgusu kayda yazdi");
    assert.equal(room.hasPendingSeats(), true);
    assert.deepEqual(seen, [1]);
  } finally {
    MatchRoom.createRuntime = undefined;
  }
});

// --- oda basina zar ve saat ------------------------------------------------

test("tohumlu zar oda basina: araya giren oda baskasinin akisini kaydirmiyor", () => {
  const alone = new SeededRoomRuntime(1234, 0);
  const expected = Array.from({ length: 20 }, () => alone.random());
  const a = new SeededRoomRuntime(1234, 0);
  const b = new SeededRoomRuntime(99, 0);
  const interleaved = [];
  for (let index = 0; index < 20; index += 1) {
    interleaved.push(a.random());
    b.random();
    b.random();
  }
  assert.deepEqual(interleaved, expected);
  assert.notDeepEqual(Array.from({ length: 5 }, () => new SeededRoomRuntime(99, 0).random()), expected.slice(0, 5));
  // Simulatorle ayni uretec.
  assert.equal(mulberry32(5)(), mulberry32(5)());
});

test("tohumlu oda surecin Math.random ve Date.now'una dokunmuyor; ayni tohum ayni dunya", () => {
  const realRandom = Math.random;
  const realNow = Date.now;
  const build = (seed) => {
    MatchRoom.createRuntime = () => new SeededRoomRuntime(seed, 1_800_000_000_000, { tick: () => 1_800_000_000_000, scope: () => 1_800_000_000_000 });
    try {
      const room = new MatchRoom();
      room.setSimulationInterval = () => {};
      room.broadcast = () => {};
      room.setupRoom({ autoStart: true, stage: 3, characterId: "warrior", playerName: "P1" });
      const client = { sessionId: "s1", ref: { bufferedAmount: 0 }, send() {}, enqueueRaw() {}, raw() {}, leave() {} };
      room.clients.push(client);
      room.onJoin(client, { autoStart: true, stage: 3, characterId: "warrior", playerName: "P1" });
      for (let index = 0; index < 600; index += 1) room.update(1000 / 60);
      return room;
    } finally {
      MatchRoom.createRuntime = undefined;
    }
  };
  // Colyseus'un kendi saati (Room kurucusu) sayilmiyor; oda kodu sayiliyor.
  let poisoned = 0;
  const fromRoom = () => !/@colyseus[\/]timer/.test(new Error().stack ?? "");
  Math.random = () => { poisoned += 1; return realRandom(); };
  Date.now = () => { if (fromRoom()) poisoned += 1; return realNow(); };
  let first;
  let other;
  let second;
  try {
    first = build(7);
    other = build(8);
    second = build(7);
  } finally {
    Math.random = realRandom;
    Date.now = realNow;
  }
  assert.equal(poisoned, 0, "tohumlu oda surecin zarini ya da saatini okudu");
  assert.equal(fingerprintHash(first.getDebugFingerprint()), fingerprintHash(second.getDebugFingerprint()));
  assert.equal(first.runId, second.runId);
  assert.notEqual(first.runId, other.runId);
});

test("kayit kapaliyken oda eski (canli) kipte: surecin zari ve saati, davranis ayni", () => {
  assert.equal(isDebugRecorderDisabled({ DEBUG_RECORDER: "off" }), true);
  assert.equal(isDebugRecorderDisabled({}), false);
  const install = installDebugRecorder(undefined, { env: { DEBUG_RECORDER: "off", DEBUG_RECORDER_DIR: tmpdir() }, autoStart: false });
  try {
    assert.equal(MatchRoom.createRuntime, undefined);
    assert.equal(MatchRoom.createRecorder, undefined);
    const room = new MatchRoom();
    assert.equal(room.runtime, LIVE_ROOM_RUNTIME);
    assert.equal(room.towerDamageRandom, Math.random);
    assert.equal(room.runtime.beginTick(16.66666), 16.66666, "canli kipte deltaTime yuvarlaniyor");
  } finally {
    install.stop();
  }
});

// --- uretim yolundan bot maci ve yeniden oynatma ---------------------------

test("uretim yolundan bot maci kaydi birebir yeniden oynaniyor (solo, iki dalga)", { timeout: 120_000 }, async () => {
  const dir = tempDir("bot");
  try {
    const match = await runRecordedBotMatch({ operators: ["warrior"], stage: 1, seed: 11, maxWaves: 2, dir });
    assert.ok(match.ticks > DEBUG_FINGERPRINT_EVERY_TICKS * 3);
    const recording = loadRecordingFile(match.path);
    assert.equal(recording.dt.length, recording.lines.find((line) => line.k === "end").t);
    assert.ok(recording.events.filter((event) => event.e === "msg").length > 10, "bot mesajlari kaydedilmedi");
    const replay = await replayRecording(recording);
    assert.ok(replay.checked >= 3);
    assert.deepEqual(replay.mismatches, []);
    assert.equal(fingerprintHash(replay.room.getDebugFingerprint()), recording.finalFingerprint.h);

    // Parmak izi duyarli: tek bir mesaji degistirmek ayrilmayi yakaliyor.
    const placements = recording.events.filter((event) => event.e === "msg" && event.y === "placeTower");
    assert.ok(placements.length > 0);
    const tampered = assembleRecording(recording.lines.map((line) => (line === placements.at(-1) ? { ...line, m: { ...line.m, x: line.m.x + 64 } } : line)));
    const diverged = await replayRecording(tampered, { stopOnDivergence: true });
    assert.ok(diverged.mismatches.length > 0, "degistirilmis kayit ayni izi verdi");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("mesaj seli: kovanin reddettikleri kayda girmiyor, yeniden oynatma yine birebir", { timeout: 120_000 }, async () => {
  const dir = tempDir("flood");
  try {
    const match = await runRecordedBotMatch({ operators: ["warrior"], stage: 1, seed: 13, maxWaves: 1, dir, flood: true });
    const recording = loadRecordingFile(match.path);
    const pings = recording.events.filter((event) => event.y === "latency:ping").length;
    const floods = Math.floor(match.ticks / 120);
    assert.ok(match.summary.wire.droppedMessages > floods * 60, `reddedilenler sayilmadi (${match.summary.wire.droppedMessages})`);
    assert.ok(pings <= floods * 5, `reddedilen mesajlar kayda girdi (${pings})`);
    assert.ok(pings > 0);
    const replay = await replayRecording(recording);
    assert.ok(replay.checked >= 2);
    assert.deepEqual(replay.mismatches, []);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("uretim yolundan co-op bot maci, ortada kopma ve yeniden baglanma ile birebir yeniden oynaniyor", { timeout: 120_000 }, async () => {
  const dir = tempDir("coop");
  try {
    const match = await runRecordedBotMatch({ operators: ["zeynep", "warrior"], stage: 2, seed: 5, maxWaves: 2, dir, reconnect: true });
    const recording = loadRecordingFile(match.path);
    const kinds = recording.events.map((event) => event.e);
    assert.ok(kinds.includes("rc"), "yeniden baglanma kaydedilmedi");
    assert.equal(kinds.filter((kind) => kind === "join").length, 2);
    const replay = await replayRecording(recording);
    assert.ok(replay.checked >= 2);
    assert.deepEqual(replay.mismatches, []);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// --- yonetici API'si ----------------------------------------------------------

async function withServer(env, fn) {
  const app = express();
  const install = installDebugRecorder(app, { env, autoStart: false, log: () => {} });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, install);
  } finally {
    install.stop();
    server.close();
  }
}

test("yonetici paneli: jeton yoksa her yol 404, yanlis jeton 401, sel 429", async () => {
  const dir = tempDir("admin");
  try {
    await withServer({ DEBUG_RECORDER_DIR: dir }, async (base) => {
      assert.equal((await fetch(`${base}/admin`)).status, 404);
      assert.equal((await fetch(`${base}/admin/api/matches`, { headers: { Authorization: "Bearer x" } })).status, 404);
    });
    await withServer({ DEBUG_RECORDER_DIR: dir, TELEMETRY_ADMIN_TOKEN: "telemetri-jetonu" }, async (base) => {
      // Ayri jeton yoksa telemetri jetonu gecerli.
      assert.equal((await fetch(`${base}/admin/api/matches`, { headers: { Authorization: "Bearer telemetri-jetonu" } })).status, 200);
    });
    await withServer({ DEBUG_RECORDER_DIR: dir, DEBUG_ADMIN_TOKEN: "dogru-jeton", TELEMETRY_ADMIN_TOKEN: "telemetri-jetonu" }, async (base, install) => {
      const page = await fetch(`${base}/admin`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
      assert.equal((await fetch(`${base}/admin/api/matches`)).status, 401);
      assert.equal((await fetch(`${base}/admin/api/matches`, { headers: { Authorization: "Bearer telemetri-jetonu" } })).status, 401);
      const ok = await fetch(`${base}/admin/api/matches`, { headers: { Authorization: "Bearer dogru-jeton" } });
      assert.equal(ok.status, 200);
      assert.deepEqual((await ok.json()).matches, []);
      assert.equal((await fetch(`${base}/admin/api/matches/../../etc/timeline`, { headers: { Authorization: "Bearer dogru-jeton" } })).status, 404);
      assert.equal((await fetch(`${base}/admin/api/matches/bozuk%2Fid/timeline`, { headers: { Authorization: "Bearer dogru-jeton" } })).status, 400);
      const status = await (await fetch(`${base}/admin/api/status`, { headers: { Authorization: "Bearer dogru-jeton" } })).json();
      assert.equal(status.enabled, true);
      assert.equal(status.retentionDays, 30);
      assert.equal(status.maxTotalBytes, 600 * 1024 * 1024, "varsayilan toplam sinir 600 MB");
      void install;
      let limited = 0;
      for (let index = 0; index < 30; index += 1) {
        const response = await fetch(`${base}/admin/api/matches`, { headers: { Authorization: `Bearer yanlis-${index}` } });
        if (response.status === 429) limited += 1;
      }
      assert.ok(limited > 0, "jeton tahmini sinirlanmadi");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("yonetici paneli: sayfa kendi kendine yetiyor ve betigi gecerli", () => {
  assert.ok(!/<script[^>]+src=/i.test(ADMIN_PANEL_HTML), "dis betik");
  assert.ok(!/<link[^>]+href=/i.test(ADMIN_PANEL_HTML), "dis stil");
  assert.ok(!/https?:\/\//.test(ADMIN_PANEL_HTML.replace(/http:\/\/www\.w3\.org[^"]*/g, "")), "dis adres");
  const script = /<script>([\s\S]*)<\/script>/.exec(ADMIN_PANEL_HTML)[1];
  assert.doesNotThrow(() => new Script(script), "panel betigi sozdizimi hatali");
  for (const key of ["matches", "spikeList", "dlReplay", "chTick"]) assert.ok(script.includes(key));
});

// --- istemci izni ---------------------------------------------------------------

test("istemci ornegi: anonim veri kapaliysa hicbir sey toplanmiyor ve gitmiyor", async () => {
  const { MatchDebugSampler, browserFamily, osFamily } = await importWebModule("apps/web/src/match-debug.ts");
  let enabled = false;
  let now = 0;
  const sent = [];
  const sampler = new MatchDebugSampler({ now: () => now, isEnabled: () => enabled, send: (sample) => sent.push(sample), device: () => ({ dpr: 2, browser: "chrome" }) });
  const run = (ms) => {
    const end = now + ms;
    while (now < end) {
      now += 16;
      sampler.noteFrame(16, now);
      sampler.noteSection("frame", 3);
      sampler.noteLod(1);
      sampler.notePing(40);
      sampler.tick(now);
    }
  };
  run(12_000);
  assert.equal(sent.length, 0, "izin yokken ornek gitti");
  // Izin acildi: bir sonraki pencereden itibaren.
  enabled = true;
  run(5_100);
  run(5_100);
  assert.ok(sent.length >= 1);
  const sample = sent.at(-1);
  for (const key of Object.keys(sample)) assert.ok(key in DEBUG_CLIENT_SAMPLE_FIELDS, `semada olmayan alan: ${key}`);
  assert.ok(sample.fps > 55 && sample.fps < 70);
  assert.equal(sample.ftP95, 16);
  assert.equal(sample.sFrame, 3);
  assert.equal(sample.lodMax, 1);
  assert.equal(sample.ping, 40);
  assert.equal(sample.dpr, 2);
  // Pencere ortasinda kapatildi: o pencerenin ornegi de gitmiyor.
  const before = sent.length;
  run(2_000);
  enabled = false;
  run(8_000);
  assert.equal(sent.length, before);
  assert.equal(browserFamily("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0"), "edge");
  assert.equal(browserFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), "safari");
  assert.equal(osFamily("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), "ios");
  assert.equal(osFamily("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "android");
});

test("istemci ornegi: sekme gizliyken kareler sayilmiyor; gizlenme ve baglam kaybi ayri", async () => {
  const { MatchDebugSampler } = await importWebModule("apps/web/src/match-debug.ts");
  let now = 0;
  const sent = [];
  const sampler = new MatchDebugSampler({ now: () => now, isEnabled: () => true, send: (sample) => sent.push(sample) });
  sampler.noteSnapshot(3, 0, now);
  for (let index = 0; index < 60; index += 1) { now += 16; sampler.noteFrame(16, now); }
  sampler.noteVisibility(true, now);
  now += 2000;
  sampler.noteFrame(2000, now);
  sampler.noteStarve();
  sampler.noteVisibility(false, now);
  sampler.noteContextLost();
  sampler.noteSnapshot(5, 2, now);
  for (let index = 0; index < 200; index += 1) { now += 16; sampler.noteFrame(16, now); }
  sampler.tick(now);
  const [sample] = sent;
  assert.equal(sample.ftMax, 16, "gizli sekmenin araligi kare sayildi");
  assert.equal(sample.hidden, 1);
  assert.equal(sample.hiddenMs, 2000);
  assert.equal(sample.ctxLost, 1);
  assert.equal(sample.starve, 0, "gizliyken bos kare sayildi");
  assert.equal(sample.drops, 2);
  assert.equal(sample.bufMax, 5);
});

test("sunucu istemci ornegini semaya indiriyor ve oyun disi tutuyor (kova, kayit, saat yok)", () => {
  const room = new MatchRoom();
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  const received = [];
  room.recorder = { clientSample: (sessionId, sample) => received.push({ sessionId, sample }) };
  room.setupRoom({ autoStart: true, stage: 1, characterId: "warrior", playerName: "P1" });
  const client = { sessionId: "s1", ref: { bufferedAmount: 0 }, send() {}, enqueueRaw() {}, raw() {}, leave() {} };
  room.onMessageHandlers["debug:client"].callback(client, { fps: 60, ua: "Mozilla/5.0 tam dize", browser: "chrome", nested: { a: 1 } });
  assert.deepEqual(received, [{ sessionId: "s1", sample: { fps: 60, browser: "chrome" } }]);
  assert.equal(room.messageBuckets.size, 0, "olcum ornegi oyun kovasini harcadi");
});
