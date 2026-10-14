/**
 * Kart yenileme: dalga elinde bir kez, ucretsiz.
 *
 * Sunucu: hak elde bir tane, yeni el gosterilen kartlari (havuz yetiyorsa)
 * tekrar etmiyor, yeni elde hak sifirlaniyor, co-op'ta her oyuncunun hakki
 * ayri, yeniden baglanma hakki koruyor, ayni zar dizisi ayni eli veriyor.
 * Istemci: perdede bir "Yenile" dugmesi, sunucunun hak sayisina bagli.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CARD_REROLLS_PER_DRAFT, MESSAGE_RULES, MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { cardCatalog, drawCards } from "../packages/shared/dist/index.js";

function createPlayer(characterId = "warrior") {
  return {
    name: "Test", characterId, connected: true, gold: 1000, goldSpent: 0,
    experience: 0, towersBuilt: 0, ultimateCharge: 0, runModifiers: [], ownedCardIds: [],
    ownedShopItemIds: [], inventoryItemIds: [], shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0
  };
}

/** Tohumlu zar (mulberry32): odanin kart zari testte tekrarlanabilir. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createRoom(seed = 7, playerIds = ["p1"]) {
  const room = new MatchRoom();
  room.state = { players: new Map(playerIds.map((id, index) => [id, createPlayer(index === 0 ? "warrior" : "archer")])) };
  room.wave = 2;
  room.cardRandom = seeded(seed);
  return room;
}

function capture(sessionId) {
  const sent = [];
  return { sent, client: { sessionId, send(type, payload) { sent.push({ type, payload }); } } };
}

const ids = (cards) => (cards ?? []).map((card) => card.id);

test("mesaj kurali: card:reroll macta, govdesiz", () => {
  const rule = MESSAGE_RULES["card:reroll"];
  assert.ok(rule, "card:reroll kurali yok");
  assert.equal(rule.phase, "match");
  assert.deepEqual(rule.fields, {});
  assert.equal(CARD_REROLLS_PER_DRAFT, 1);
});

test("elde tam bir yenileme: yeni el eskisinden farkli, ikinci istek reddediliyor", () => {
  const room = createRoom();
  room.offerWaveCards();
  const before = ids(room.pendingCardChoices.get("p1"));
  assert.equal(before.length, 3);

  const first = capture("p1");
  room.rerollCards(first.client);
  const after = ids(room.pendingCardChoices.get("p1"));
  assert.equal(after.length, before.length, "ayni sayida kart");
  assert.notDeepEqual(after, before);
  for (const id of after) assert.ok(!before.includes(id), `${id} az once gosterilmisti`);
  // Hak once gidiyor, sonra yeni el.
  assert.deepEqual(first.sent.map((message) => message.type), ["card:rerollState", "card:choices"]);
  assert.deepEqual(first.sent[0].payload, { remaining: 0 });
  assert.deepEqual(ids(first.sent[1].payload), after);

  const second = capture("p1");
  room.rerollCards(second.client);
  assert.deepEqual(ids(room.pendingCardChoices.get("p1")), after, "ikinci yenileme eli degistirmedi");
  assert.equal(second.sent[0].type, "card:rejected");
  assert.equal(second.sent[0].payload.key, "card.rerollUsed");
  assert.deepEqual(second.sent.find((message) => message.type === "card:rerollState")?.payload, { remaining: 0 });
  assert.deepEqual(ids(second.sent.find((message) => message.type === "card:choices")?.payload), after);
});

test("yenilenen el secilebiliyor; eski el artik gecerli degil", () => {
  const room = createRoom(11);
  room.offerWaveCards();
  const before = ids(room.pendingCardChoices.get("p1"));
  room.rerollCards(capture("p1").client);
  const stale = capture("p1");
  room.chooseCard(stale.client, { cardId: before[0] });
  assert.equal(stale.sent[0].type, "card:rejected");
  assert.equal(stale.sent[0].payload.key, "card.invalidChoice");
});

test("acik el yokken yenileme reddediliyor", () => {
  const room = createRoom();
  const probe = capture("p1");
  room.rerollCards(probe.client);
  assert.equal(probe.sent[0].type, "card:rejected");
  assert.equal(probe.sent[0].payload.key, "card.noPendingChoice");
  assert.equal(room.pendingCardChoices.has("p1"), false);
});

test("hak bir sonraki elde sifirlaniyor", () => {
  const room = createRoom(3);
  room.offerWaveCards();
  room.rerollCards(capture("p1").client);
  assert.equal(room.getCardRerollsRemaining("p1"), 0);

  room.pendingCardChoices.delete("p1");
  room.wave = 3;
  room.offerWaveCards();
  assert.equal(room.getCardRerollsRemaining("p1"), 1);
  const before = ids(room.pendingCardChoices.get("p1"));
  const again = capture("p1");
  room.rerollCards(again.client);
  assert.notDeepEqual(ids(room.pendingCardChoices.get("p1")), before);
  assert.deepEqual(again.sent[0], { type: "card:rerollState", payload: { remaining: 0 } });
});

test("co-op: her oyuncunun eli ve hakki ayri", () => {
  const room = createRoom(5, ["p1", "p2"]);
  room.offerWaveCards();
  const p2Before = ids(room.pendingCardChoices.get("p2"));
  room.rerollCards(capture("p1").client);
  assert.equal(room.getCardRerollsRemaining("p1"), 0);
  assert.equal(room.getCardRerollsRemaining("p2"), 1, "p1'in yenilemesi p2'nin hakkini yemedi");
  assert.deepEqual(ids(room.pendingCardChoices.get("p2")), p2Before, "p2'nin eli degismedi");

  const p2 = capture("p2");
  room.rerollCards(p2.client);
  assert.equal(p2.sent[0].type, "card:rerollState");
  assert.notDeepEqual(ids(room.pendingCardChoices.get("p2")), p2Before);
});

test("yeniden baglanma: kullanilan hak yeni oturuma tasiniyor ve el ile birlikte gidiyor", () => {
  const room = createRoom(9, ["old-session"]);
  room.offerWaveCards();
  room.rerollCards(capture("old-session").client);
  const hand = ids(room.pendingCardChoices.get("old-session"));
  const player = room.state.players.get("old-session");

  room.transferPlayerSession("old-session", "new-session", player, "Test");
  assert.equal(room.getCardRerollsRemaining("new-session"), 0);
  assert.equal(room.cardRerollsUsed.has("old-session"), false);

  const resumed = capture("new-session");
  room.sendMatchResumeState(resumed.client);
  const stateIndex = resumed.sent.findIndex((message) => message.type === "card:rerollState");
  const choicesIndex = resumed.sent.findIndex((message) => message.type === "card:choices");
  assert.ok(stateIndex >= 0 && stateIndex < choicesIndex, "hak elden once gidiyor");
  assert.deepEqual(resumed.sent[stateIndex].payload, { remaining: 0 });
  assert.deepEqual(ids(resumed.sent[choicesIndex].payload), hand);

  // `card:sync` (sayfa yenilemesi) de ayni durumu yolluyor.
  const synced = capture("new-session");
  room.sendPendingCardChoices(synced.client);
  assert.deepEqual(synced.sent.map((message) => message.type), ["card:rerollState", "card:choices"]);
  assert.deepEqual(synced.sent[0].payload, { remaining: 0 });
});

test("ayni kart zari ayni yenilemeyi veriyor", () => {
  const hands = [1, 2].map(() => {
    const room = createRoom(42);
    room.offerWaveCards();
    room.rerollCards(capture("p1").client);
    return ids(room.pendingCardChoices.get("p1"));
  });
  assert.deepEqual(hands[0], hands[1]);
});

test("cekilis: dislanan kartlar yalnizca havuz eli dolduramazsa geri geliyor", () => {
  const options = { preferredAxes: ["dps"], towers: [], ownedCardIds: [], random: seeded(1) };
  const keep = cardCatalog[0].id;
  const excludeCardIds = cardCatalog.slice(1).map((card) => card.id);
  const hand = drawCards({ ...options, excludeCardIds });
  assert.equal(hand.length, 3, "el yine dolu");
  assert.equal(hand[0].id, keep, "once dislanmayan kart");
  // Dislama yokken zar dizisi degismiyor (eski cagiranlar ayni eli aliyor).
  assert.deepEqual(ids(drawCards({ ...options, random: seeded(4) })), ids(drawCards({ ...options, random: seeded(4), excludeCardIds: [] })));
});

test("istemci: perdede Yenile dugmesi, sunucunun hakkina bagli", () => {
  const source = readFileSync(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /class="card-draft__reroll" type="button" data-card-reroll/);
  assert.match(source, /querySelector<HTMLButtonElement>\("\[data-card-reroll\]"\)\?\.addEventListener\("click", \(\) => this\.requestCardReroll\(\)\)/);
  assert.match(source, /this\.room\.send\("card:reroll"\)/);
  assert.match(source, /room\.onMessage\("card:rerollState"/);
  const update = source.slice(source.indexOf("  private updateCardRerollButton()"), source.indexOf("\n  }\n", source.indexOf("  private updateCardRerollButton()")));
  assert.match(update, /button\.disabled = remaining <= 0 \|\| this\.cardChoicePending/);
  assert.match(update, /textContent = String\(remaining\)/);

  const scene = readFileSync(new URL("../apps/web/src/locales/areas/scene.ts", import.meta.url), "utf8");
  for (const key of ["scene.card.reroll", "scene.card.rerollAria", "scene.card.rerolling"]) {
    assert.equal(scene.split(`"${key}":`).length - 1, 2, `${key} TR ve EN`);
  }
  const css = readFileSync(new URL("../apps/web/src/style.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(css, /\.card-draft__reroll \{[^}]*min-height: 44px;/);
});
