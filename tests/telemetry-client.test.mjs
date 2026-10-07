/**
 * Istemci telemetrisi (apps/web/src/telemetry.ts).
 *
 * Kilitlenen sozler:
 *   1. Olaylar 20'lik ve 15 KB'lik paketlerle gidiyor; her pakette kurulum,
 *      oturum ve surum var.
 *   2. Ayar kapaliyken hicbir sey tutulmuyor ve gonderilmiyor; varsayilan acik.
 *   3. Hata: ayni mesaj + ilk kare bir kez, dakikada en fazla 5; yigin kirpilip
 *      adresin kaynak ve sorgu kismi atiliyor.
 *   4. `run_end` kosu defterinin raporundan (RunLedger -> RunSummary) kuruluyor.
 *   5. Kosu izi: dalga basina `perf`, sonuc, birakma ve sayfa yenilemesinde
 *      ayni kosu kimligi.
 *   6. Gelistirme sahnesi ve VFX galerisi hicbir sey gondermiyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { RunLedger } from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";

const telemetry = await importWebModule("apps/web/src/telemetry.ts");
const {
  ErrorReporter,
  RUN_END_REPORT_WAIT_MS,
  RunTelemetry,
  TELEMETRY_RUN_KEY,
  TELEMETRY_SETTING_KEY,
  TelemetryClient,
  buildRunEndFields,
  describeError,
  describeSession,
  getInstallId,
  getTelemetryEndpoint,
  isTelemetryBlockedLocation,
  isTelemetryEnabled,
  readTelemetrySetting,
  resetTelemetrySettingForTests,
  setTelemetryEnabled,
  trimStack
} = telemetry;

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
}

function createClient(options = {}) {
  const sent = [];
  const client = new TelemetryClient({
    endpoint: "https://karayel-online.fly.dev/telemetry",
    installId: "install-1234",
    sessionId: "session-1",
    version: "0.1.0+abc",
    transport: (url, body, urgent) => sent.push({ url, body: JSON.parse(body), size: body.length, urgent }),
    isEnabled: () => true,
    now: () => 1000,
    ...options
  });
  return { client, sent };
}

test("paketleme: 20'de kendiliginden, kalan flush'ta; her pakette kimlik ve surum", () => {
  const { client, sent } = createClient();
  for (let index = 0; index < 45; index += 1) client.track("error", { msg: `hata ${index}` });
  assert.equal(sent.length, 2, "20 ve 40'ta kendiliginden gitti");
  assert.equal(client.pending, 5);
  assert.equal(client.flush(true), 1);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((entry) => entry.body.events.length), [20, 20, 5]);
  assert.equal(sent[2].urgent, true);
  for (const entry of sent) {
    assert.equal(entry.url, "https://karayel-online.fly.dev/telemetry");
    assert.equal(entry.body.iid, "install-1234");
    assert.equal(entry.body.sid, "session-1");
    assert.equal(entry.body.ver, "0.1.0+abc");
  }
  assert.equal(sent[0].body.events[0].t, "error");
  assert.equal(sent[0].body.events[0].ts, 1000);
  assert.equal(client.flush(), 0, "bos kuyruk bir sey yollamiyor");
});

test("paketleme: govde 15 KB'yi gecmiyor; sigmayan tek olay atiliyor", () => {
  const { client, sent } = createClient({ maxBatch: 100 });
  for (let index = 0; index < 12; index += 1) client.track("error", { msg: "x".repeat(2000) });
  client.track("error", { msg: "y".repeat(20_000) });
  client.flush();
  assert.ok(sent.length >= 2);
  for (const entry of sent) assert.ok(entry.size <= 15_000, `paket ${entry.size} bayt`);
  assert.equal(sent.reduce((sum, entry) => sum + entry.body.events.length, 0), 12);
  assert.equal(client.stats.dropped, 1);
});

test("ayar: varsayilan acik, kapaliyken hicbir sey tutulmuyor ya da gonderilmiyor", () => {
  resetTelemetrySettingForTests();
  const storage = memoryStorage();
  assert.equal(isTelemetryEnabled(storage), true, "varsayilan acik");
  setTelemetryEnabled(false, storage);
  assert.equal(storage.getItem(TELEMETRY_SETTING_KEY), "0");
  assert.equal(isTelemetryEnabled(storage), false);
  assert.equal(readTelemetrySetting(storage), false);

  let enabled = true;
  const { client, sent } = createClient({ isEnabled: () => enabled });
  client.track("session_start", {});
  enabled = false;
  client.track("error", { msg: "a" });
  assert.equal(client.pending, 0, "kapaninca bekleyen kuyruk siliniyor");
  assert.equal(client.flush(true), 0);
  assert.equal(sent.length, 0);
  enabled = true;
  client.track("error", { msg: "b" });
  client.flush();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.events.map((event) => event.msg), ["b"]);

  // Bozuk ya da kapali depo: varsayilan acik, oyun kirilmiyor.
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.equal(isTelemetryEnabled(broken), true);
  resetTelemetrySettingForTests();
  setTelemetryEnabled(false, broken);
  assert.equal(readTelemetrySetting(broken), false, "yazilamasa da bu sayfada kapali");
  resetTelemetrySettingForTests();
});

test("ilk acilis bildirimi: gecilene kadar hicbir olay yok; Tamam acar, Kapat kapatir, ayar secimi de gecer", () => {
  const { TELEMETRY_NOTICE_KEY, acknowledgeTelemetryNotice, hasSeenTelemetryNotice, isTelemetryActive } = telemetry;
  resetTelemetrySettingForTests();
  const storage = memoryStorage();
  assert.equal(hasSeenTelemetryNotice(storage), false);
  assert.equal(readTelemetrySetting(storage), true, "ayar varsayilan acik");
  assert.equal(isTelemetryActive(storage), false, "bildirim ekrandayken kapali");

  // Istemci kapinin arkasinda: bildirim gecilmeden track hicbir sey tutmuyor.
  const { client, sent } = createClient({ isEnabled: () => isTelemetryActive(storage) });
  client.track("session_start", {});
  assert.equal(client.pending, 0);
  assert.equal(client.flush(true), 0);

  acknowledgeTelemetryNotice(true, storage);
  assert.equal(storage.getItem(TELEMETRY_NOTICE_KEY), "1");
  assert.equal(isTelemetryActive(storage), true);
  client.track("session_start", {});
  client.flush();
  assert.equal(sent.length, 1, "Tamam'dan sonra gidiyor");

  resetTelemetrySettingForTests();
  const declined = memoryStorage();
  acknowledgeTelemetryNotice(false, declined);
  assert.equal(hasSeenTelemetryNotice(declined), true);
  assert.equal(declined.getItem(TELEMETRY_SETTING_KEY), "0");
  assert.equal(isTelemetryActive(declined), false, "Kapat kapatiyor");

  // Menudeki ya da oyun icindeki kutudan secim de bildirimi geciyor.
  resetTelemetrySettingForTests();
  const toggled = memoryStorage();
  setTelemetryEnabled(true, toggled);
  assert.equal(hasSeenTelemetryNotice(toggled), true);

  // Depo kapali: karar bu sayfada gecerli, sonraki acilista bildirim yine gelir.
  resetTelemetrySettingForTests();
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.equal(isTelemetryActive(broken), false);
  acknowledgeTelemetryNotice(true, broken);
  assert.equal(isTelemetryActive(broken), true);
  resetTelemetrySettingForTests();
  assert.equal(hasSeenTelemetryNotice(broken), false);

  // Kablolama: tarayici istemcisi bu kapiyi kullaniyor, bildirim kuruluyor.
  const boot = source("apps/web/src/telemetry-boot.ts");
  assert.match(boot, /isEnabled: \(\) => isTelemetryActive\(\)/);
  assert.match(boot, /setupTelemetryNotice\(\);/);
});

test("kurulum kimligi: bir kez uretilip saklaniyor; depo yoksa yine bir kimlik", () => {
  const storage = memoryStorage();
  const first = getInstallId(storage, () => "11111111-2222-4333-8444-555555555555");
  assert.equal(first, "11111111-2222-4333-8444-555555555555");
  assert.equal(getInstallId(storage, () => "baska"), first);
  assert.match(getInstallId(undefined), /^[0-9a-f-]{36}$/);
});

test("adres ve oturum: uc HTTP(S), parmak izi yok", () => {
  assert.equal(getTelemetryEndpoint("wss://karayel-online.fly.dev"), "https://karayel-online.fly.dev/telemetry");
  assert.equal(getTelemetryEndpoint("ws://192.168.1.5:2567/"), "http://192.168.1.5:2567/telemetry");
  const session = describeSession({
    innerWidth: 390.4,
    innerHeight: 844,
    devicePixelRatio: 3,
    matchMedia: (query) => ({ matches: query === "(pointer: coarse)" }),
    navigator: { language: "tr-TR", userAgent: "gizli" },
    location: { hostname: "html-classic.itch.zone" },
    self: {},
    top: {},
    screen: { width: 390, height: 844 }
  });
  assert.deepEqual(session, { device: "mobile", vw: 390, vh: 844, dpr: 3, lang: "tr-TR", pwa: false, iframe: true, host: "html-classic.itch.zone" });
});

test("hata: ayni mesaj + ilk kare bir kez, dakikada en fazla 5", () => {
  let now = 0;
  const sent = [];
  const reporter = new ErrorReporter({ send: (fields) => sent.push(fields), now: () => now, context: () => ({ scene: "game", wave: 12, rid: "run1" }) });
  const error = new TypeError("x is undefined");
  error.stack = "TypeError: x is undefined\n    at update (https://oyun.example.com/assets/index-abc.js?v=3:10:5)\n    at step (https://oyun.example.com/assets/phaser.js:1:1)";
  assert.equal(reporter.report(error), true);
  assert.equal(reporter.report(error), false, "ayni hata tekrar gitmiyor");
  assert.deepEqual(sent[0], {
    msg: "TypeError: x is undefined",
    kind: "error",
    stack: "at update (/assets/index-abc.js:10:5)\nat step (/assets/phaser.js:1:1)",
    scene: "game",
    wave: 12,
    rid: "run1"
  });
  for (let index = 0; index < 8; index += 1) reporter.report(new Error(`farkli ${index}`), "rejection");
  assert.equal(sent.length, 5, "dakikada 5");
  now += 61_000;
  assert.equal(reporter.report(new Error("farkli 7"), "rejection"), true, "sinira takilan hata sonra gidebiliyor");
  assert.equal(reporter.report(error), false, "gonderilmis hata pencere sonra da tekrar gitmiyor");
  assert.equal(sent.length, 6);

  assert.deepEqual(describeError("duz metin"), { msg: "duz metin", stack: "" });
  assert.deepEqual(describeError({ message: "nesne" }), { msg: "nesne", stack: "" });
  assert.equal(describeError(undefined).msg, "unknown");
  const deep = Array.from({ length: 12 }, (_, index) => `at f${index} (http://localhost:5173/src/a.ts?t=1:${index}:1)`).join("\n");
  assert.equal(trimStack(`Error: boom\n${deep}`, "boom").split("\n").length, 5, "en fazla 5 kare");
});

/** Kosu defterinden gercek bir rapor: sunucunun mac sonunda yolladigi. */
function ledgerRun() {
  const ledger = new RunLedger();
  ledger.recordKill(0);
  ledger.recordKill(0);
  ledger.recordLeak({ air: false, absorbed: false, hpLost: 10 });
  ledger.closeWave(1, { slots: [0] });
  ledger.recordKill(0);
  ledger.recordTowerDamage({ id: "t1", level: 4, definition: { id: "warrior-1", name: "Kule" } }, 0, 120);
  ledger.closeWave(2, { died: true, slots: [0] });
  return ledger.summarize({
    id: "srv-run-1",
    result: "defeat",
    stage: 3,
    wave: 2,
    creative: false,
    mapKey: "arena@1",
    players: [{ slot: 0, name: "Oyuncu", characterId: "zeynep", cards: ["kart-a", "kart-b", "kart-a"] }]
  });
}

test("run_end: kosu defterinin raporundan kuruluyor", () => {
  const run = ledgerRun();
  const fields = buildRunEndFields({
    rid: "rid123456",
    mode: "solo",
    stage: 1,
    op: "zeynep",
    players: 1,
    wave: 1,
    durationMs: 125_400,
    hp: 0,
    maxHp: 100,
    slot: 0,
    cards: ["eski-kart"],
    items: ["esya-1", "esya-2"],
    equipped: ["esya-1"],
    towers: [{ id: "warrior-1", lvl: 4 }],
    goldLeft: 37,
    goldSpent: 900,
    pingAvg: 80,
    pingMax: 210,
    fpsAvg: 55.5
  }, "loss", run);
  assert.deepEqual(fields, {
    rid: "rid123456",
    outcome: "loss",
    mode: "solo",
    op: "zeynep",
    players: 1,
    wave: 2,
    dur: 125,
    cards: ["kart-a", "kart-b", "kart-a"],
    items: ["esya-1", "esya-2"],
    equipped: ["esya-1"],
    towers: [{ id: "warrior-1", lvl: 4 }],
    stage: 3,
    hp: 0,
    maxHp: 100,
    goldLeft: 37,
    goldSpent: 900,
    pingAvg: 80,
    pingMax: 210,
    fpsAvg: 55.5,
    kills: 3,
    leaks: 1,
    srid: "srv-run-1"
  });
  // Rapor yoksa sahnenin son bildigi degerler.
  const fallback = buildRunEndFields({ rid: "r", mode: "coop", op: "atakan", players: 2, wave: 9, durationMs: 0, slot: 1, cards: ["k"], items: [], equipped: [], towers: [] }, "abandoned");
  assert.equal(fallback.wave, 9);
  assert.deepEqual(fallback.cards, ["k"]);
  assert.equal(fallback.kills, undefined);
});

function snapshot({ wave, setup = false, result, players = 1, gold = 100, towers = [] }) {
  return {
    result,
    setupPhase: setup,
    stage: 2,
    team: { wave, health: 80, maxHealth: 100 },
    players: Array.from({ length: players }, (_, index) => ({
      id: index === 0 ? "me" : `p${index}`,
      gold,
      goldSpent: 50,
      ownedCardIds: ["kart-a"],
      ownedShopItemIds: ["esya-1"]
    })),
    towers
  };
}

function createRun(storage = memoryStorage()) {
  let now = 0;
  const events = [];
  const timers = [];
  const run = new RunTelemetry({
    now: () => now,
    storage,
    generateId: () => "rid000001",
    schedule: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    cancel: (handle) => { if (timers[handle - 1]) timers[handle - 1].cancelled = true; }
  });
  run.bind((type, fields) => events.push({ type, ...fields }));
  return { run, events, timers, storage, advance: (ms) => { now += ms; }, at: () => now };
}

test("kosu izi: baslangic, dalga basina perf, raporlu sonuc", () => {
  const { run, events, advance, at } = createRun();
  run.noteSnapshot(snapshot({ wave: 1, setup: true }), "me");
  assert.equal(events.length, 0, "attach olmadan kosu yok");
  run.attach({ roomId: "room1", online: false, creative: false, resumed: false, operator: "zeynep" });
  run.noteSnapshot(snapshot({ wave: 1, setup: true }), "me");
  assert.deepEqual(events[0], { type: "run_start", rid: "rid000001", mode: "solo", op: "zeynep", players: 1, resumed: false, stage: 2 });

  // Kurulumda kare sayilmiyor; savasta 60 FPS, bir saniye 20 FPS.
  run.noteFrame(at());
  for (let index = 0; index < 30; index += 1) { advance(16); run.noteFrame(at()); }
  run.noteSnapshot(snapshot({ wave: 1, towers: [{ id: "t1", ownerId: "me", definitionId: "warrior-1", level: 2, equippedShopItemIds: ["esya-1"] }, { id: "t2", ownerId: "p9", definitionId: "x", level: 9 }] }), "me");
  for (let index = 0; index < 120; index += 1) { advance(1000 / 60); run.noteFrame(at()); }
  for (let index = 0; index < 40; index += 1) { advance(50); run.noteFrame(at()); }
  advance(5000);
  run.noteFrame(at()); // sekme arkadaydi: bu aralik sayilmiyor
  run.notePing(40);
  run.notePing(120);
  run.noteServerTick(5, 12);
  run.noteSnapshot(snapshot({ wave: 2, setup: true, towers: [{ id: "t1", ownerId: "me", definitionId: "warrior-1", level: 5, equippedShopItemIds: ["esya-1"] }] }), "me");
  const perf = events.find((event) => event.type === "perf");
  assert.equal(perf.wave, 1);
  assert.equal(perf.rid, "rid000001");
  assert.equal(perf.pingAvg, 80);
  assert.equal(perf.pingMax, 120);
  assert.equal(perf.tickAvg, 5);
  assert.equal(perf.tickMax, 12);
  assert.equal(perf.fpsMin, 20);
  assert.equal(perf.fpsAvg, 40, "160 kare / 4 sn savas");
  assert.equal(perf.dur, 4, "yalnizca savas suresi");

  run.end("defeat", ledgerRun());
  run.end("defeat", ledgerRun());
  run.leave("closed");
  const ends = events.filter((event) => event.type === "run_end");
  assert.equal(ends.length, 1, "sonuc bir kez");
  assert.equal(ends[0].outcome, "loss");
  assert.equal(ends[0].srid, "srv-run-1");
  assert.deepEqual(ends[0].towers, [{ id: "warrior-1", lvl: 5 }], "yalnizca kendi kulesi, en yuksek seviye");
  assert.deepEqual(ends[0].equipped, ["esya-1"]);
  assert.deepEqual(ends[0].items, ["esya-1"]);
  assert.equal(ends[0].goldLeft, 100);
  assert.equal(ends[0].pingAvg, 80);
  assert.equal(events.filter((event) => event.type === "abandon").length, 0, "biten kosu birakilmiyor");
});

test("kosu izi: rapor gelmezse kisa bekleyisten sonra raporsuz sonuc; mac bittikten sonra giren kosu baslatmiyor", () => {
  const { run, events, timers } = createRun();
  run.attach({ roomId: "room2", online: true, creative: false, resumed: false, operator: "atakan" });
  run.noteSnapshot(snapshot({ wave: 7, result: "victory", players: 2 }), "me");
  run.end("victory");
  assert.equal(events.length, 0, "ilk snapshot sonuclu: kosu yok");

  const second = createRun();
  second.run.attach({ roomId: "room3", online: true, creative: false, resumed: false, operator: "atakan" });
  second.run.noteSnapshot(snapshot({ wave: 30, players: 2 }), "me");
  assert.equal(second.events[0].mode, "coop");
  second.run.end("victory");
  assert.equal(second.events.filter((event) => event.type === "run_end").length, 0);
  assert.equal(second.timers[0].ms, RUN_END_REPORT_WAIT_MS);
  second.timers[0].callback();
  const end = second.events.find((event) => event.type === "run_end");
  assert.equal(end.outcome, "win");
  assert.equal(end.wave, 30);
  assert.equal(end.srid, undefined);
  assert.equal(timers.length, 0);
});

test("kosu izi: gizlenme bir kez abandon, kapanma birakma; yenilemede ayni kosu kimligi", () => {
  const storage = memoryStorage();
  const first = createRun(storage);
  first.run.attach({ roomId: "room9", online: false, creative: false, resumed: false, operator: "melis" });
  first.run.noteSnapshot(snapshot({ wave: 4 }), "me");
  first.run.hidden();
  first.run.hidden();
  assert.equal(first.events.filter((event) => event.type === "abandon").length, 1);
  assert.equal(first.events.find((event) => event.type === "abandon").reason, "hidden");
  first.run.leave("closed");
  const abandons = first.events.filter((event) => event.type === "abandon");
  assert.equal(abandons.at(-1).reason, "closed");
  assert.equal(abandons.at(-1).wave, 4);
  assert.equal(first.events.find((event) => event.type === "run_end").outcome, "abandoned");
  assert.ok(storage.getItem(TELEMETRY_RUN_KEY), "birakilan kosu yenilemede devam edebilir");

  // Sayfa yenilendi, ayni odaya donuldu: kimlik ayni, `resumed` isaretli.
  const resumed = new RunTelemetry({ storage, generateId: () => "baskarid1", now: () => 0 });
  const resumedEvents = [];
  resumed.bind((type, fields) => resumedEvents.push({ type, ...fields }));
  resumed.attach({ roomId: "room9", online: false, creative: false, resumed: true, operator: "melis" });
  resumed.noteSnapshot(snapshot({ wave: 5 }), "me");
  assert.equal(resumedEvents[0].rid, "rid000001");
  assert.equal(resumedEvents[0].resumed, true);
  resumed.end("victory", undefined);
  resumed.leave("closed");
  assert.equal(resumedEvents.find((event) => event.type === "run_end").outcome, "win", "bekleyen sonuc kapanista gidiyor");
  assert.equal(storage.getItem(TELEMETRY_RUN_KEY), null, "biten kosunun kaydi siliniyor");

  // Baska oda: yeni kimlik.
  const other = createRun(storage);
  other.run.attach({ roomId: "roomX", online: false, creative: true, resumed: false, operator: "melis" });
  other.run.noteSnapshot(snapshot({ wave: 1 }), "me");
  assert.equal(other.events[0].mode, "creative");
});

test("gelistirme sahnesi ve VFX galerisi hicbir sey gondermiyor", () => {
  assert.equal(isTelemetryBlockedLocation({ pathname: "/dev/tower-sheet.html", search: "" }), true);
  assert.equal(isTelemetryBlockedLocation({ pathname: "/", search: "?vfx-gallery" }), true);
  assert.equal(isTelemetryBlockedLocation({ pathname: "/", search: "?x=1&vfx-gallery=1" }), true);
  assert.equal(isTelemetryBlockedLocation({ pathname: "/", search: "" }), false);
  assert.equal(isTelemetryBlockedLocation({ pathname: "/html/12345/index.html", search: "" }), false, "itch.io yolu");

  // Telemetri yalnizca main.ts'in oyun dalinda baslatiliyor; galeri dali ve
  // gelistirme sahnesi onu hic cagirmiyor.
  const main = source("apps/web/src/main.ts");
  const galleryBranch = main.slice(main.indexOf("if (vfxGallery) {"), main.indexOf("} else {"));
  const gameBranch = main.slice(main.indexOf("} else {"), main.indexOf("}", main.indexOf("startTelemetry(game)")));
  assert.ok(!galleryBranch.includes("startTelemetry"));
  assert.ok(gameBranch.includes("startTelemetry(game)"));
  assert.equal((main.match(/startTelemetry\(/g) ?? []).length, 1);
  assert.ok(!source("apps/web/src/dev/tower-sheet-harness.ts").includes("telemetry-boot"));
  assert.ok(!source("apps/web/src/scenes/VfxGalleryScene.ts").includes("telemetry"));

  // Kapilar: derleme bayragi, adres, ilk acilis bildirimi ve ayar.
  const boot = source("apps/web/src/telemetry-boot.ts");
  assert.match(boot, /VITE_TELEMETRY/);
  assert.match(boot, /isTelemetryBlockedLocation\(window\.location\)/);
  assert.match(boot, /isEnabled: \(\) => isTelemetryActive\(\)/);
  assert.match(boot, /getTelemetryEndpoint\(gameServerUrl\)/, "adres oyun sunucusuyla ayni kaynaktan");
  // Cekirdek modul tarayiciya baglanmiyor: dinleyici ya da zamanlayici kurmuyor.
  const core = source("apps/web/src/telemetry.ts");
  assert.ok(!/addEventListener|setInterval|import\.meta\.env/.test(core));
});
