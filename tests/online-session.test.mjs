/**
 * Istemcinin oda oturumu (apps/web/src/online-session.ts) ve giris yollari.
 *
 * Kilitlenen sozler:
 *   1. Her oda girisi (`create`, `joinById`, `join`, `joinOrCreate`) tel
 *      surumunu (`wireDelta`) bildiriyor; bildirmeyen eski istemci sayiliyor ve
 *      oyuncu/isci kayitlarini tam aliyor.
 *   2. Solo oda kurulurken rastgele bir sahip sirri uretiliyor, yeniden
 *      baglanma kaydina yaziliyor ve gec donus onu gonderiyor.
 *   3. Menuye donuste odadan izinli cikiliyor; cikis kisa ve en iyi caba,
 *      olu soket sayfayi tutmuyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WIRE_DELTA_PROTOCOL } from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";

const session = await importWebModule("apps/web/src/online-session.ts");
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

function webSources(dir = join(root, "apps/web/src")) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return webSources(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

test("tel surumu secenegi: withWireCaps secenekleri bozmadan wireDelta ekliyor", () => {
  const options = { playerName: "A", characterId: "warrior" };
  const result = session.withWireCaps(options);
  assert.deepEqual(result, { playerName: "A", characterId: "warrior", wireDelta: WIRE_DELTA_PROTOCOL });
  assert.equal(WIRE_DELTA_PROTOCOL, 2);
  assert.equal("wireDelta" in options, false, "girdi nesnesi degistirildi");
});

test("istemcinin her oda girisi tel surumunu bildiriyor", () => {
  let calls = 0;
  for (const path of webSources()) {
    const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    for (const match of source.matchAll(/\b(?:client|getSharedClient\([^)]*\))\.(create|joinById|joinOrCreate|join)\(/g)) {
      calls += 1;
      const call = source.slice(match.index, match.index + 120);
      assert.match(call, /withWireCaps\(/, `${path}: ${call.split("\n")[0]}`);
    }
  }
  assert.ok(calls >= 4, `beklenen giris yollari bulunamadi (${calls})`);
});

test("sahip sirri: her kurulumda yeni, tahmin edilemez ve sunucunun kabul ettigi boyda", () => {
  const first = session.createOwnerSecret();
  const second = session.createOwnerSecret();
  assert.match(first, /^[0-9a-f]{48}$/);
  assert.notEqual(first, second);
  // Sunucu 16-128 karakter disini yok sayiyor (`hashOwnerSecret`).
  assert.ok(first.length >= 16 && first.length <= 128);
});

test("yeniden baglanma kaydi sahip sirrini sakliyor ve geri okuyor", () => {
  const store = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    setTimeout
  };
  try {
    const room = { roomId: "oda1", reconnectionToken: "jeton" };
    session.saveMatchReconnect(room, { mode: "solo", characterId: "warrior", playerName: "Atakan", ownerSecret: "s".repeat(48), mapScale: 1, stage: 1 });
    const record = session.loadMatchReconnect();
    assert.equal(record.ownerSecret, "s".repeat(48));
    assert.equal(record.roomId, "oda1");

    session.setResumedMatch(room, "solo", record.ownerSecret);
    assert.equal(session.takeResumedMatch().ownerSecret, "s".repeat(48), "sahne donulen macin sirrini almadi");
  } finally {
    delete globalThis.window;
  }
});

test("odadan izinli cikis: leave(true), olu soket zaman asimiyla birakiliyor, hata yutuluyor", async () => {
  globalThis.window = { setTimeout };
  try {
    const consents = [];
    await session.leaveRoomQuietly({ leave: (consented) => { consents.push(consented); return Promise.resolve(1000); } });
    assert.deepEqual(consents, [true]);

    const startedAt = Date.now();
    await session.leaveRoomQuietly({ leave: () => new Promise(() => {}) }, 30);
    assert.ok(Date.now() - startedAt < 1000, "asili cikis sayfayi tuttu");

    await session.leaveRoomQuietly({ leave: () => Promise.reject(new Error("kapali")) }, 30);
    await session.leaveRoomQuietly({ leave: () => { throw new Error("kapali"); } }, 30);
    await session.leaveRoomQuietly(undefined);
    assert.ok(session.ROOM_LEAVE_TIMEOUT_MS <= 1000);
  } finally {
    delete globalThis.window;
  }
});

test("menuye donus (ortak yol): kayitlar once siliniyor, izinli cikis, sonra her durumda yukleme", async () => {
  const store = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    setTimeout
  };
  try {
    const order = [];
    const room = {
      roomId: "oda7",
      reconnectionToken: "jeton",
      leave: (consented) => {
        order.push(`leave:${consented}`);
        // Cikis aninda yeniden baglanma kaydi ve lobi odasi zaten silinmis olmali.
        order.push(`kayit:${session.loadMatchReconnect() ? "var" : "yok"}`);
        order.push(`lobi:${session.getActiveLobbyRoom() ? "var" : "yok"}`);
        return Promise.resolve(1000);
      }
    };
    session.saveMatchReconnect(room, { mode: "online", characterId: "warrior", mapScale: 1, stage: 1 });
    session.setActiveLobbyRoom(room);
    await session.leaveMatchAndReload(room, () => order.push("reload"));
    assert.deepEqual(order, ["leave:true", "kayit:yok", "lobi:yok", "reload"]);

    // Asili soket: zaman asimindan sonra yine yukleniyor.
    let reloads = 0;
    const startedAt = Date.now();
    await session.leaveMatchAndReload({ roomId: "oda8", leave: () => new Promise(() => {}) }, () => { reloads += 1; }, 30);
    assert.equal(reloads, 1);
    assert.ok(Date.now() - startedAt < 1000, "asili cikis menuye donusu tuttu");

    // Kapali soket ve odasiz sahne (baglanti hic kurulmadi): yine yukleniyor.
    await session.leaveMatchAndReload({ roomId: "oda9", leave: () => { throw new Error("kapali"); } }, () => { reloads += 1; }, 30);
    await session.leaveMatchAndReload(undefined, () => { reloads += 1; });
    assert.equal(reloads, 3);

    // Baska odanin kaydi silinmiyor (yalnizca cikilan oda).
    session.saveMatchReconnect({ roomId: "baska", reconnectionToken: "j2" }, { mode: "solo", characterId: "warrior", mapScale: 1, stage: 1 });
    await session.leaveMatchAndReload({ roomId: "oda10", leave: () => Promise.resolve() }, () => {});
    assert.equal(session.loadMatchReconnect()?.roomId, "baska");
  } finally {
    delete globalThis.window;
  }
});

test("sahne: solo kurulum sirri uretip kaydediyor; menuye donus once odadan cikiyor", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  const connect = scene.slice(scene.indexOf("private async connect()"), scene.indexOf("this.localSessionId = this.room.sessionId;"));
  assert.ok(connect.indexOf("createOwnerSecret()") < connect.indexOf("retryExpiredSeatReservation("), "sir her denemede yeniden uretiliyor");
  assert.match(connect, /ownerSecret\n\s*\}\)\)\);/);
  assert.match(connect, /this\.soloOwnerSecret = resumed\.ownerSecret;/);
  const remember = scene.slice(scene.indexOf("private rememberMatchReconnect("), scene.indexOf("private async reconnectRoom("));
  assert.match(remember, /ownerSecret: this\.startedFromLobby \? undefined : this\.soloOwnerSecret/);

  const choose = scene.slice(scene.indexOf("private chooseRunReportAction("), scene.indexOf("private showCardChoices("));
  assert.equal(/window\.location\.reload\(\)/.test(choose), false, "sahne odadan cikmadan yukluyor");
  // Rapor dugmeleri ve mac icindeki "Menüye dön" ayni yoldan cikiyor.
  const helper = choose.slice(choose.indexOf("private reloadAfterLeavingRoom("), choose.indexOf("private confirmQuitMatch("));
  assert.ok(helper.indexOf("runTelemetry.leave(\"menu\")") < helper.indexOf("leaveMatchAndReload(this.room)"), "kosu izi yuklemeden once kapanmiyor");
  const quit = choose.slice(choose.indexOf("private confirmQuitMatch("));
  assert.match(quit, /openConfirmDialog\(/, "onay oyun ici pencerede degil");
  assert.match(quit, /\(\) => this\.reloadAfterLeavingRoom\(\)/, "onay ayri bir cikis yolu kullaniyor");
  assert.equal(/window\.confirm|leaveRoomQuietly|room\.leave\(/.test(quit), false);
  assert.equal(scene.match(/leaveMatchAndReload\(/g).length, 1, "ikinci bir cikis kopyasi var");
  const handle = scene.slice(scene.indexOf("private handleMatchResult("), scene.indexOf("private openRunReport("));
  assert.equal(handle.includes("window.location.reload()"), false, "bekleyen yukleme odadan cikmiyor");
  // Izinli cikis yeniden baglanmayi tetiklemiyor.
  assert.match(scene, /room\.onLeave\(\(code\) => \{\n\s*if \(this\.room !== room\) return;\n[^\n]*\n\s*if \(this\.leavingRoom\) return;/);

  const menu = read("apps/web/src/menu-ui.ts");
  assert.match(menu, /setResumedMatch\(room, savedMatch\.mode, savedMatch\.ownerSecret\)/);
  const online = read("apps/web/src/online-session.ts");
  const resume = online.slice(online.indexOf("export async function resumeSavedMatch("));
  assert.match(resume, /record\.mode === "solo" && record\.playerName && record\.ownerSecret/);
  assert.match(resume, /ownerSecret: record\.ownerSecret/);
});
