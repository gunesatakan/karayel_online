/**
 * Takimi etkileyen sessiz kararlarin sinyali: Sunucu bagi.
 *
 * Sunucu takim arkadasinin kulesine baglanip olgunlasiyor ama kulenin sahibi
 * bunu gormuyordu. Sunucu artik tek seferlik mesaj yolluyor:
 *
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
  FeedbackGovernor,
  SERVER_LINK_MATURITY_WAVES,
  SERVER_LINK_NOTICE_COOLDOWN_MS,
  getServerLinkJoinedText,
  getServerLinkMaturedText,
  getServerLinkMaturity,
  getTurkishGenitive
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// --- saf kurallar ---------------------------------------------------------

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

test("yonetmen: bag bildirimleri hiz sinirina uyuyor, olgunluk etiketi butce doluyken dusmuyor", () => {
  const governor = new FeedbackGovernor();
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

test("istemci bag mesajlarini dinliyor ve yonetmenden geciriyor", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  const hud = readSource("apps/web/src/game-control-ui.ts");
  for (const type of ["link:joined", "link:matured"]) {
    assert.ok(scene.includes(`onMessage("${type}"`), `istemci ${type} dinlemiyor`);
  }
  assert.ok(hud.includes(`"game:hud-team-notice"`));
  for (const kind of ["linkJoined", "linkMatured"]) {
    assert.ok(scene.includes(`emit("${kind}"`), `${kind} yonetmenden gecmiyor`);
  }
});
