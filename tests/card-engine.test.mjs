import test from "node:test";
import assert from "node:assert/strict";
import { cardAppliesToTower, cardCatalog, drawCards, towerCatalog } from "../packages/shared/dist/index.js";

test("kart havuzu Türkçe ve sayısal açıklamalı kartlardan oluşur", () => {
  assert.equal(cardCatalog.length, 61);
  assert.equal(new Set(cardCatalog.map(({ id }) => id)).size, 61);
  for (const card of cardCatalog) {
    assert.equal(card.description.includes("\n"), false);
    assert.match(card.description, /\d/);
  }
});

test("lojistik kuleleri kart kapsamı dışında kalır ve tagged kapsam ekseni süzer", () => {
  const armorBreak = cardCatalog.find(({ id }) => id === "zirh-kirma");
  assert.equal(cardAppliesToTower(armorBreak, towerCatalog.warrior.find(({ id }) => id === "warrior-1")), true);
  assert.equal(cardAppliesToTower(armorBreak, towerCatalog.warrior.find(({ id }) => id === "warrior-3")), false);
  assert.equal(cardAppliesToTower(armorBreak, towerCatalog.warrior.find(({ id }) => id === "warrior-7")), false);
});

test("non-stackable ve maksimum yığınlı kartlar havuzdan çıkar", () => {
  const owned = ["verimli-namlu", "ek-yuva", "ek-yuva", "ek-yuva"];
  const draws = drawCards({ count: 12, preferredAxes: ["dps"], towers: towerCatalog.warrior, ownedCardIds: owned, random: () => 0 });
  assert.equal(draws.some(({ id }) => id === "verimli-namlu"), false);
  assert.equal(draws.some(({ id }) => id === "ek-yuva"), false);
});

test("eksen eşleşmesi 2x, ölü tagged kart 0.15x ağırlık alır", () => {
  const towers = towerCatalog.warrior.filter(({ resourceProvider }) => !resourceProvider);
  const first = drawCards({ count: 1, preferredAxes: ["dps"], towers, ownedCardIds: [], random: () => 0 })[0];
  assert.equal(first.id, "namlu-asinmasi");
  const emptyDraws = drawCards({ count: 3, preferredAxes: ["economy"], towers: [], ownedCardIds: [], random: () => 0.999 });
  assert.equal(emptyDraws.length, 3);
});
