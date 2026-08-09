import assert from "node:assert/strict";
import test from "node:test";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";

function createPlayer() {
  return {
    name: "Test", characterId: "warrior", connected: true, gold: 1000, goldSpent: 0,
    experience: 0, towersBuilt: 0, ultimateCharge: 0, runModifiers: [], ownedCardIds: [],
    ownedShopItemIds: [], shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0
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
  room.chooseCard({ sessionId: "p1", send() {} }, { cardId: choices[0].id });
  assert.equal(player.shopOffers.length, 5);
});
