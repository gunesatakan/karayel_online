/**
 * Takimi etkileyen sessiz kararlarin sinyali: Sessiz Mod ve Sunucu bagi.
 *
 * Sessiz Mod butun kuleleri (her sahibin) susturuyor ama yalnizca atan
 * biliyordu; Sunucu takim arkadasinin kulesine baglanip olgunlasiyor ama
 * kulenin sahibi bunu gormuyordu. Sunucu artik tek seferlik mesaj yolluyor:
 *
 * - `silent:mode` herkese (atana da): atan, sessizligin ve hizlanmanin bittigi
 *   an, sunucu saatinde. Yeniden baglanmada ve `silent:sync` isteginde suruyorsa
 *   yeniden gidiyor.
 * - `link:joined` yalnizca hedef kulenin sahibine, kendi kulene bagda hic;
 *   ac-kapa ayni cift icin bildirim yagdirmiyor.
 * - `link:matured` 5 ve 10 dalgada iki sahibe de, ayni kisiyse bir kez.
 *
 * Kural sayilari degismedi; testler bunu da tutuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FEEDBACK_KIND_RULES,
  FeedbackGovernor,
  GAME_SPEED_MULTIPLIER,
  SERVER_LINK_MATURITY_WAVES,
  SERVER_LINK_NOTICE_COOLDOWN_MS,
  SILENT_MODE_HASTE_GAME_MS,
  SILENT_MODE_PHASE_LABELS,
  SILENT_MODE_SILENCE_GAME_MS,
  formatSilentModeSeconds,
  getServerLinkJoinedText,
  getServerLinkMaturedText,
  getServerLinkMaturity,
  getSilentModeNoticeText,
  getSilentModePhase,
  getTurkishGenitive,
  toLocalSilentModeTimeline
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// --- saf kurallar ---------------------------------------------------------

test("Sessiz Mod sabitleri beceri kartiyla ayni: 5 sn sessizlik, 10 sn'de biten 3x ates", () => {
  assert.equal(SILENT_MODE_SILENCE_GAME_MS, 5000);
  assert.equal(SILENT_MODE_HASTE_GAME_MS, 10000);
  assert.deepEqual(getSilentModeNoticeText("Atakan"), { title: "Atakan Sessiz Mod", detail: "5 sn sessizlik → 3x ateş" });
  assert.equal(getSilentModeNoticeText(undefined).title, "Takım arkadaşın Sessiz Mod");
  assert.equal(SILENT_MODE_PHASE_LABELS.silent, "Sessizlik");
  assert.equal(SILENT_MODE_PHASE_LABELS.burst, "3x ateş");
});

test("geri sayim sunucu saatinden istemci saatine kayiyor, saat farki hesaba girmiyor", () => {
  // Sunucu saati istemcininkinden cok farkli; yalnizca fark onemli.
  const message = { casterId: "p1", castAt: 1_000_000, silentUntil: 1_006_250, burstUntil: 1_012_500, serverTime: 1_001_000 };
  const timeline = toLocalSilentModeTimeline(message, 50, 500);
  assert.deepEqual(timeline, { castAt: -450, silentUntil: 5800, burstUntil: 12050 });

  const silent = getSilentModePhase(timeline, 550);
  assert.equal(silent.phase, "silent");
  assert.equal(silent.remainingMs, 5250);
  assert.equal(silent.totalMs, 6250);
  assert.ok(Math.abs(silent.fraction - 0.84) < 1e-9);

  const burst = getSilentModePhase(timeline, 5800);
  assert.equal(burst.phase, "burst", "sessizlik biter bitmez hizlanma");
  assert.equal(burst.remainingMs, 6250);
  assert.equal(burst.fraction, 1);
  assert.equal(getSilentModePhase(timeline, 12050), undefined, "ikisi de bitti");
  assert.equal(getSilentModePhase(undefined, 0), undefined);

  // Bitmis, bozuk ya da eksik mesaj cizelge kurmuyor.
  assert.equal(toLocalSilentModeTimeline({ ...message, serverTime: 1_012_500 }, 0), undefined);
  assert.equal(toLocalSilentModeTimeline({ ...message, silentUntil: Number.NaN }, 0), undefined);
  assert.equal(toLocalSilentModeTimeline({ casterId: "p1" }, 0), undefined);
  assert.equal(toLocalSilentModeTimeline(null, 0), undefined);
});

test("kalan sure tam saniye, yukari yuvarli; bitmeden 0 yazmiyor", () => {
  assert.equal(formatSilentModeSeconds(5000), "5 sn");
  assert.equal(formatSilentModeSeconds(4001), "5 sn");
  assert.equal(formatSilentModeSeconds(4000), "4 sn");
  assert.equal(formatSilentModeSeconds(80), "1 sn");
  assert.equal(formatSilentModeSeconds(0), "1 sn");
});

test("bag olgunlugu yalnizca 5 ve 10 esiginde, bir kez", () => {
  assert.deepEqual([...SERVER_LINK_MATURITY_WAVES], [5, 10]);
  assert.equal(getServerLinkMaturity(4, 5), 5);
  assert.equal(getServerLinkMaturity(9, 10), 10);
  assert.equal(getServerLinkMaturity(5, 6), undefined);
  assert.equal(getServerLinkMaturity(0, 1), undefined);
  assert.equal(getServerLinkMaturity(10, 11), undefined);
  assert.equal(getServerLinkMaturedText(5), "Bağ olgunlaştı · 5 dalga");
  assert.equal(getServerLinkMaturedText(10), "Bağ olgunlaştı · 10 dalga");
});

test("tamlayan eki unlu uyumuna uyuyor", () => {
  // Operator adlari: ek yaziya degil okunusa gore.
  assert.equal(getTurkishGenitive("ZentaX"), "ZentaX'ın");
  assert.equal(getTurkishGenitive("AttackLord"), "AttackLord'un");
  assert.equal(getTurkishGenitive("DualiTemp"), "DualiTemp'in");
  assert.equal(getTurkishGenitive("Honour"), "Honour'un");
  assert.equal(getTurkishGenitive("Zexceed"), "Zexceed'in");
  assert.equal(getTurkishGenitive("Boosty"), "Boosty'nin");
  assert.equal(getTurkishGenitive("Bioside"), "Bioside'ın");
  // Oyuncunun kendi yazdigi Turkce adlar yazilisa gore.
  assert.equal(getTurkishGenitive("Atakan"), "Atakan'ın");
  assert.equal(getTurkishGenitive("Zeynep"), "Zeynep'in");
  assert.equal(getTurkishGenitive("Melis"), "Melis'in");
  assert.equal(getTurkishGenitive("Onur"), "Onur'un");
  assert.equal(getTurkishGenitive("Ömer"), "Ömer'in");
  assert.equal(getTurkishGenitive("Ülkü"), "Ülkü'nün");
  assert.equal(getTurkishGenitive("Baransel"), "Baransel'in");
  assert.equal(getTurkishGenitive("Ayla"), "Ayla'nın");
  assert.deepEqual(getServerLinkJoinedText("Atakan"), { title: "Atakan'ın Sunucusu", detail: "kulene bağlandı" });
  assert.deepEqual(getServerLinkJoinedText("Boosty"), { title: "Boosty'nin Sunucusu", detail: "kulene bağlandı" });
  assert.deepEqual(getServerLinkJoinedText("Bioside"), { title: "Bioside'ın Sunucusu", detail: "kulene bağlandı" });
  assert.equal(getServerLinkJoinedText(undefined).title, "Takım arkadaşının Sunucusu");
});

test("yonetmen: Sessiz Mod takim arkadasinda da gorunur ve duyulur, ust uste gelen ikinci yayin birlesir", () => {
  assert.equal(FEEDBACK_KIND_RULES.silentMode.teammateVisual, true);
  assert.equal(FEEDBACK_KIND_RULES.silentMode.teammateSound, true);
  assert.equal(FEEDBACK_KIND_RULES.silentMode.shakePx, 0, "baskasinin becerisi kamerani oynatmaz");
  const governor = new FeedbackGovernor();
  const first = governor.decide("silentMode", { own: false }, 0);
  assert.equal(first.priority, 3);
  assert.equal(first.show, true);
  assert.equal(first.sound, true);
  const echo = governor.decide("silentMode", { own: false }, 400);
  assert.equal(echo.show, false);
  assert.equal(echo.merge, true, "yeniden baglanma yankisi ikinci bildirim acmaz");
  assert.equal(governor.decide("silentMode", { own: false }, FEEDBACK_KIND_RULES.silentMode.visualGapMs).show, true);

  // Araligi olan butcesiz tur hiz sinirina uyuyor; araliksizlar eskisi gibi hep geciyor.
  assert.equal(governor.decide("linkJoined", { own: true }, 0).show, true);
  assert.equal(governor.decide("linkJoined", { own: true }, 100).show, false);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(governor.decide("kill", { own: true, x: 0, y: 0 }, index).show, true, "oldurme hic birlesmez");
  }
  // Olgunluk etiketi P1: etiket butcesi doluyken de dusmez.
  for (let index = 0; index < 3; index += 1) governor.decide("synergy", { own: true, x: index * 100, y: 0 }, 1000);
  const matured = governor.decide("linkMatured", { own: true, x: 900, y: 900 }, 1001);
  assert.equal(matured.show, true);
  assert.equal(matured.recycle, true);
});

// --- gercek oda -----------------------------------------------------------

/** Iki oyunculu oda: p1 Atakan, p2 Zeynep. Mesajlar istemci basina kaydediliyor. */
function teamRoom() {
  const room = createRoom("warrior");
  const p1 = room.state.players.get("p1");
  Object.assign(p1, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  room.state.players.set("p2", { ...p1, id: "p2", name: "Zeynep", characterId: "zeynep", slot: 1, skillCooldowns: [], runModifiers: [], ownedCardIds: [], hiredWorkers: [] });
  const sent = new Map([["p1", []], ["p2", []]]);
  const clients = ["p1", "p2"].map((sessionId) => ({
    sessionId,
    send(type, payload) {
      sent.get(sessionId).push({ type, payload });
    }
  }));
  const broadcasts = [];
  room.clients = clients;
  room.broadcast = (type, payload, options) => broadcasts.push({ type, payload, options });
  const of = (sessionId, type) => sent.get(sessionId).filter((entry) => entry.type === type).map((entry) => entry.payload);
  return { room, clients, broadcasts, of };
}

function build(room, client, definitionId) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower?.definition.id, definitionId, `${definitionId} kurulamadi`);
  return tower;
}

test("Sessiz Mod atilinca herkese tek mesaj: atan, sessizlik ve hizlanma sonu, sunucu saatinde", () => {
  const { room, clients, broadcasts } = teamRoom();
  const before = Date.now();
  room.useSkill(clients[0], { slot: 2 });
  const casts = broadcasts.filter((entry) => entry.type === "silent:mode");
  assert.equal(casts.length, 1);
  const { payload, options } = casts[0];
  assert.equal(options, undefined, "atana da gidiyor: geri sayim herkesin");
  assert.equal(payload.casterId, "p1");
  assert.ok(payload.castAt >= before && payload.castAt <= Date.now());
  assert.equal(payload.serverTime, payload.castAt);
  assert.equal(payload.silentUntil, room.silentModeUntil);
  assert.equal(payload.burstUntil, room.damageHasteUntil);
  // Kural degismedi: 5 ve 10 oyun saniyesi, oyun hiziyla olceklenmis.
  assert.equal(payload.silentUntil - payload.castAt, SILENT_MODE_SILENCE_GAME_MS / GAME_SPEED_MULTIPLIER);
  assert.equal(payload.burstUntil - payload.castAt, SILENT_MODE_HASTE_GAME_MS / GAME_SPEED_MULTIPLIER);
  assert.deepEqual(Object.keys(payload).sort(), ["burstUntil", "castAt", "casterId", "serverTime", "silentUntil"]);

  // Diger iki beceri sessizlik yayini yapmiyor.
  room.useSkill(clients[0], { slot: 0, x: 100, y: 100 });
  assert.equal(broadcasts.filter((entry) => entry.type === "silent:mode").length, 1);
});

test("yeniden baglanma ve silent:sync suren Sessiz Mod'u geri getiriyor; bitince hicbir sey gitmiyor", () => {
  const { room, clients, broadcasts } = teamRoom();
  const returning = { sessionId: "p2", sent: [], send(type, payload) { this.sent.push({ type, payload }); } };
  room.sendMatchResumeState(returning);
  assert.equal(returning.sent.filter((entry) => entry.type === "silent:mode").length, 0, "hic atilmadiysa yok");

  room.useSkill(clients[0], { slot: 2 });
  const cast = broadcasts.find((entry) => entry.type === "silent:mode").payload;
  room.sendMatchResumeState(returning);
  const resumed = returning.sent.filter((entry) => entry.type === "silent:mode").map((entry) => entry.payload);
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].casterId, "p1");
  assert.equal(resumed[0].castAt, cast.castAt, "ayni atis: istemci bildirimi tekrarlamaz");
  assert.equal(resumed[0].silentUntil, cast.silentUntil);
  assert.equal(resumed[0].burstUntil, cast.burstUntil);
  assert.ok(resumed[0].serverTime >= cast.castAt, "kalan sure yollandigi andan sayiliyor");

  // Istemcinin kendi istegi ayni yoldan.
  const sync = { sent: [], send(type, payload) { this.sent.push({ type, payload }); } };
  room.sendSilentModeState(sync);
  assert.equal(sync.sent.length, 1);
  assert.equal(sync.sent[0].type, "silent:mode");

  // Sessizlik bitti ama hizlanma suruyor: geri sayim hala gidiyor.
  room.silentModeUntil = Date.now() - 1;
  sync.sent = [];
  room.sendSilentModeState(sync);
  assert.equal(sync.sent.length, 1);
  assert.ok(sync.sent[0].payload.silentUntil <= sync.sent[0].payload.serverTime);

  // Ikisi de bitti: yok.
  room.damageHasteUntil = Date.now() - 1;
  sync.sent = [];
  room.sendSilentModeState(sync);
  assert.equal(sync.sent.length, 0);
});

test("sayfasi yenilenen atan yeni oturumuyla aniliyor", () => {
  const { room, clients } = teamRoom();
  room.useSkill(clients[0], { slot: 2 });
  const player = room.state.players.get("p1");
  room.transferPlayerSession("p1", "p1-yeni", player);
  const sync = { sent: [], send(type, payload) { this.sent.push({ type, payload }); } };
  room.sendSilentModeState(sync);
  assert.equal(sync.sent[0].payload.casterId, "p1-yeni");
});

test("Sunucu takim arkadasinin kulesine baglaninca yalnizca kulenin sahibi haber aliyor", () => {
  const { room, clients, of } = teamRoom();
  const server = build(room, clients[0], "warrior-2");
  const target = build(room, clients[1], "zeynep-1");
  assert.equal(target.ownerId, "p2");

  room.linkServerTower(clients[0], { serverTowerId: server.id, targetTowerId: target.id });
  assert.deepEqual(server.linkedTowerIds, [target.id]);
  assert.deepEqual(of("p2", "link:joined"), [{ serverTowerId: server.id, targetTowerId: target.id, serverOwnerId: "p1" }]);
  assert.equal(of("p1", "link:joined").length, 0, "bagi kuran zaten biliyor");

  // Ac-kapa: ayni cift icin kisa surede ikinci bildirim yok.
  room.linkServerTower(clients[0], { serverTowerId: server.id, targetTowerId: target.id });
  assert.deepEqual(server.linkedTowerIds, []);
  room.linkServerTower(clients[0], { serverTowerId: server.id, targetTowerId: target.id });
  assert.equal(of("p2", "link:joined").length, 1);

  // Aralik dolunca yeniden.
  room.serverLinkNoticeAt.set(`${server.id}>${target.id}`, Date.now() - SERVER_LINK_NOTICE_COOLDOWN_MS);
  room.linkServerTower(clients[0], { serverTowerId: server.id, targetTowerId: target.id });
  room.linkServerTower(clients[0], { serverTowerId: server.id, targetTowerId: target.id });
  assert.equal(of("p2", "link:joined").length, 2);
});

test("kendi kulene kurdugun bag bildirim uretmiyor", () => {
  const { room, clients, of } = teamRoom();
  const server = build(room, clients[0], "warrior-2");
  const own = build(room, clients[0], "warrior-1");
  room.linkServerTower(clients[0], { serverTowerId: server.id, targetTowerId: own.id });
  assert.deepEqual(server.linkedTowerIds, [own.id]);
  assert.equal(of("p1", "link:joined").length, 0);
  assert.equal(of("p2", "link:joined").length, 0);
});

test("bag 5 ve 10 dalgada olgunlasinca iki sahip de tek mesaj aliyor, arada hicbir sey yok", () => {
  const { room, clients, of } = teamRoom();
  const server = build(room, clients[0], "warrior-2");
  const target = build(room, clients[1], "zeynep-1");
  room.linkServerTower(clients[0], { serverTowerId: server.id, targetTowerId: target.id });

  const expected = (waves) => ({ serverTowerId: server.id, targetTowerId: target.id, serverOwnerId: "p1", targetOwnerId: "p2", waves });
  for (let wave = 1; wave <= 4; wave += 1) room.advanceWaveGrowth();
  assert.equal(of("p1", "link:matured").length + of("p2", "link:matured").length, 0, "5. dalgadan once yok");
  room.advanceWaveGrowth();
  assert.equal(server.linkedTowerWaveAges[target.id], 5, "yas kurali degismedi");
  assert.deepEqual(of("p1", "link:matured"), [expected(5)]);
  assert.deepEqual(of("p2", "link:matured"), [expected(5)]);
  for (let wave = 6; wave <= 9; wave += 1) room.advanceWaveGrowth();
  assert.equal(of("p2", "link:matured").length, 1);
  room.advanceWaveGrowth();
  assert.deepEqual(of("p1", "link:matured"), [expected(5), expected(10)]);
  assert.deepEqual(of("p2", "link:matured"), [expected(5), expected(10)]);
  for (let wave = 11; wave <= 14; wave += 1) room.advanceWaveGrowth();
  assert.equal(of("p2", "link:matured").length, 2, "10'dan sonra yeni an yok");
});

test("kendi kulene bag olgunlasinca mesaj bir kez gidiyor", () => {
  const { room, clients, of } = teamRoom();
  const server = build(room, clients[0], "warrior-2");
  const own = build(room, clients[0], "warrior-1");
  room.linkServerTower(clients[0], { serverTowerId: server.id, targetTowerId: own.id });
  for (let wave = 1; wave <= 5; wave += 1) room.advanceWaveGrowth();
  assert.equal(of("p1", "link:matured").length, 1);
  assert.equal(of("p2", "link:matured").length, 0);
});

test("istemci mesajlari dinliyor ve suren Sessiz Mod'u istiyor", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  const server = readSource("apps/server/src/rooms/MatchRoom.ts");
  const hud = readSource("apps/web/src/game-control-ui.ts");
  for (const type of ["silent:mode", "link:joined", "link:matured"]) {
    assert.ok(scene.includes(`onMessage("${type}"`), `istemci ${type} dinlemiyor`);
  }
  // Sayfa yenileme ve yeniden baglanma: ikisi de istiyor.
  assert.equal(scene.match(/send\("silent:sync"\)/g)?.length, 2);
  assert.ok(server.includes(`onMessage("silent:sync"`));
  assert.ok(hud.includes(`"game:hud-silent-mode"`) && hud.includes(`"game:hud-team-notice"`));
  // Yeni geri bildirim yonetmenden geciyor.
  for (const kind of ["silentMode", "linkJoined", "linkMatured"]) {
    assert.ok(scene.includes(`emit("${kind}"`), `${kind} yonetmenden gecmiyor`);
  }
});

test("Sessiz Mod cipi kombo hapinin altina yigiliyor, ayni konumu paylasmiyor", () => {
  const css = readSource("apps/web/src/style.css");
  // Kuralin govdesi: satir basindaki "secici {" ile ilk "}" arasi.
  const blockOf = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.ok(start >= 0, `${selector} kurali yok`);
    return css.slice(start, css.indexOf("}", start));
  };
  const topOf = (selector) => {
    const top = blockOf(selector).match(/top: calc\(100% \+ (\d+)px\)/)?.[1];
    assert.ok(top, `${selector} ust konumu yok`);
    return Number(top);
  };
  const combo = topOf(".game-hud__combo");
  const silent = topOf(".game-hud__silent");
  const comboBlock = blockOf(".game-hud__combo");
  const silentBlock = blockOf(".game-hud__silent");
  assert.match(comboBlock, /right: 10px;/);
  assert.match(silentBlock, /right: 10px;/, "ayni kose: dikeyde ayrilmali");
  // Hap ~26 px, en sicak olcekte (x1.26) ~33 px: cip hapin altinda baslamali.
  assert.ok(silent >= combo + 34, `cip (${silent}) hapin (${combo}) altinda degil`);
  // Ongoru kutusu kurallari cipi hap yuvasinin ustune geri cekmiyor.
  for (const rule of [".game-hud__forecast:not([hidden]) ~ .game-hud__silent", ".game-hud__forecast--danger:not([hidden]) ~ .game-hud__silent"]) {
    assert.ok(topOf(rule) >= silent, `${rule} cipi hapin uzerine cekiyor`);
  }
});
