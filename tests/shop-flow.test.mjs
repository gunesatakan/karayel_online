import assert from "node:assert/strict";
import test from "node:test";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { cardCatalog } from "../packages/shared/dist/index.js";

function createPlayer() {
  return {
    name: "Test", characterId: "warrior", connected: true, gold: 1000, goldSpent: 0,
    experience: 0, towersBuilt: 0, ultimateCharge: 0, runModifiers: [], ownedCardIds: [],
    ownedShopItemIds: [], inventoryItemIds: [], shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0
  };
}

test("ilk dalga öncesinde mağaza teklifi oluşturulmaz", () => {
  const room = new MatchRoom();
  const player = createPlayer();
  room.state = { players: new Map([["p1", player]]) };
  assert.deepEqual(player.shopOffers, []);
});

test("dalga sonunda mağaza kart seçildikten sonra açılır", () => {
  const room = new MatchRoom();
  const player = createPlayer();
  room.state = { players: new Map([["p1", player]]) };
  room.wave = 2;
  room.offerWaveCards();
  const choices = room.pendingCardChoices.get("p1");
  assert.ok(choices?.length > 0);
  assert.deepEqual(player.shopOffers, []);
  const globalChoice = cardCatalog.find((choice) => choice.id === "verimli-namlu");
  assert.ok(globalChoice);
  room.pendingCardChoices.set("p1", [globalChoice]);
  room.chooseCard({ sessionId: "p1", send() {} }, { cardId: globalChoice.id });
  assert.equal(player.shopOffers.length, 5);
});

test("yeniden bağlantıda bekleyen kart seçimi yeni oturuma taşınır ve tekrar gönderilir", () => {
  const room = new MatchRoom();
  const player = createPlayer();
  const choice = cardCatalog.find((card) => card.id === "verimli-namlu");
  assert.ok(choice);
  room.state = { players: new Map([["old-session", player]]) };
  room.pendingCardChoices.set("old-session", [choice]);

  room.transferPlayerSession("old-session", "new-session", player, "Test");

  assert.equal(room.pendingCardChoices.has("old-session"), false);
  assert.deepEqual(room.pendingCardChoices.get("new-session"), [choice]);
  const sent = [];
  room.sendMatchResumeState({
    sessionId: "new-session",
    send(type, payload) { sent.push({ type, payload }); }
  });
  assert.deepEqual(sent.find((message) => message.type === "card:choices")?.payload, [choice]);
});

test("geçersiz kart seçimi sessiz kalmak yerine reddedilir", () => {
  const room = new MatchRoom();
  const player = createPlayer();
  room.state = { players: new Map([["p1", player]]) };
  room.pendingCardChoices.set("p1", []);
  const sent = [];

  room.chooseCard({
    sessionId: "p1",
    send(type, payload) { sent.push({ type, payload }); }
  }, { cardId: "olmayan-kart" });

  assert.equal(sent[0]?.type, "card:rejected");
  assert.match(sent[0]?.payload.reason, /geçerli bir seçenek değil/);
});
