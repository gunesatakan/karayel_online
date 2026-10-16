/**
 * Mac kaydedicisi, uctan uca: gercek Colyseus sunucusu, gercek istemci
 * (colyseus.js, WebSocket), gercek saat. Mac kaydediliyor, panel API'sinden
 * indiriliyor ve bagimsiz yeniden oynatmada parmak izleri birebir tutuyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { Server } from "colyseus";
import { Client } from "colyseus.js";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { installDebugRecorder } from "../apps/server/dist/debug/index.js";
import { loadRecordingFile, replayRecording } from "../tools/debug/replay-lib.mjs";

const TOKEN = "e2e-test-token-0123456789";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("gercek sunucu + istemci: kayit, panel indirmesi ve birebir yeniden oynatma", { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "nx-debug-e2e-"));
  const app = express();
  const install = installDebugRecorder(app, { env: { DEBUG_RECORDER_DIR: dir, DEBUG_ADMIN_TOKEN: TOKEN }, autoStart: false, log: () => {} });
  const httpServer = createServer(app);
  const quietWarn = console.warn;
  console.warn = () => {};
  const gameServer = new Server({ server: httpServer, greet: false, gracefullyShutdown: false });
  gameServer.define("match", MatchRoom);
  const previousLimit = MatchRoom.maxConcurrentRooms;
  MatchRoom.maxConcurrentRooms = 1000;
  try {
    await gameServer.listen(0, "127.0.0.1");
    const base = `http://127.0.0.1:${httpServer.address().port}`;
    const auth = { headers: { Authorization: `Bearer ${TOKEN}` } };
    const client = new Client(base.replace("http", "ws"));
    const room = await client.create("match", { playerName: "Ayse Yilmaz", characterId: "warrior", autoStart: true, stage: 1, wireDelta: 2, ownerSecret: "owner-secret-owner-secret-0001" });
    let snapshots = 0;
    room.onMessage("*", (type) => { if (type === "snapshot") snapshots += 1; });
    room.send("snapshot:requestFull");
    room.send("card:sync");
    for (let index = 0; index < 6; index += 1) {
      room.send("latency:ping", { sentAt: Date.now() });
      await wait(200);
    }
    room.send("wave:continue");
    room.send("debug:client", { seq: 0, win: 5000, frames: 290, fps: 58.2, fpsMin: 41, ftP95: 22.1, ftMax: 80, lod: 1, lodMax: 2, browser: "chrome", os: "windows", bogus: "atilmali" });
    // Hiz siniri: hemen ikinci ornek kayda girmiyor.
    room.send("debug:client", { seq: 1, fps: 10 });
    await wait(2500);
    await room.leave(true);
    await wait(800);
    await install.store.drain();

    const list = await (await fetch(`${base}/admin/api/matches`, auth)).json();
    assert.equal(list.matches.length, 1);
    const [summary] = list.matches;
    assert.equal(summary.status, "ended");
    assert.equal(summary.mode, "solo");
    assert.deepEqual(summary.operators, ["warrior"]);
    assert.ok(summary.tick.count > 60, "mac tick'leri olculmedi");
    assert.ok(summary.wire.bytes > 0, "istemciye giden bayt sayilmadi");
    assert.equal(summary.client.samples, 1, "istemci ornegi hiz sinirina uymadi");
    assert.ok(snapshots > 0);

    const timeline = await (await fetch(`${base}/admin/api/matches/${summary.id}/timeline`, auth)).json();
    assert.ok(timeline.seconds.length >= 3);
    assert.equal(timeline.clients.length, 1);
    assert.equal(timeline.clients[0].fps, 58.2);
    assert.equal(timeline.clients[0].bogus, undefined, "semada olmayan alan kayda girdi");
    assert.ok(timeline.seconds.some((second) => Object.values(second.w.out).some((bytes) => bytes > 0)));

    const download = await fetch(`${base}/admin/api/matches/${summary.id}/replay`, auth);
    assert.equal(download.status, 200);
    const bytes = Buffer.from(await download.arrayBuffer());
    const text = bytes.toString("latin1");
    const path = join(dir, "indirilen.ndjson.gz");
    writeFileSync(path, bytes);
    const recording = loadRecordingFile(path);
    const raw = JSON.stringify(recording.lines);
    assert.ok(!raw.includes("Ayse"), "oyuncu adi kayda girdi");
    assert.ok(!raw.includes("owner-secret-owner"), "sahip sirri kayda girdi");
    assert.ok(text.length > 0);
    const kinds = recording.events.map((event) => event.e);
    assert.ok(kinds.includes("join") && kinds.includes("leave") && kinds.includes("msg"));
    assert.ok(recording.dt.length > 100);
    // Gercek Colyseus araligi: tick sureleri titresimli, kayit mikrosaniye.
    assert.ok(new Set(recording.dt).size > 1);

    const replay = await replayRecording(recording);
    assert.ok(replay.checked >= 1, "parmak izi yok");
    assert.deepEqual(replay.mismatches, [], "yeniden oynatma uretimden ayrildi");
  } finally {
    console.warn = quietWarn;
    MatchRoom.maxConcurrentRooms = previousLimit;
    install.stop();
    await gameServer.gracefullyShutdown(false).catch(() => {});
    httpServer.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
