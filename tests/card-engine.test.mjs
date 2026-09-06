import test from "node:test";
import assert from "node:assert/strict";
import { cardAppliesToTower, cardCatalog, drawCards, towerCatalog } from "../packages/shared/dist/index.js";

test("kart havuzu Türkçe ve sayısal açıklamalı kartlardan oluşur", () => {
  assert.equal(cardCatalog.length, 68);
  assert.equal(new Set(cardCatalog.map(({ id }) => id)).size, 68);
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

/**
 * Geniş Halka'nın kapsamı.
 *
 * Kart bir zamanlar `shape: "circle"` etiketine bakiyordu ama o etiket veride
 * iki isi birden goruyor: gercekten alana vuran kuleler ve sekli hic onemli
 * olmayan yapilar -- duvar, aura binasi, tek hedefe atan Parlama. Ikinci grup
 * yaricap yazmadan `circle` kaldigi icin kart onlara "uyuyor" gorunuyor,
 * Parlama ise buyutulecek alani olmadan yalnizca hasar cezasini yiyordu.
 *
 * Olcut artik sekil degil alanin kendisi; kartin metni de ayni seyi soyluyor.
 */
test("Geniş Halka yalnızca gerçekten etki alanı olan kulelere uyar", () => {
  const card = cardCatalog.find(({ id }) => id === "genis-halka");
  assert.match(card.description, /Etki alanı olan kuleler/, "metin kapsami anlatmiyor");

  const areaRadius = (tower) => tower.engine?.attack.radius ?? tower.aoeRadius ?? 0;
  const towers = Object.values(towerCatalog).flat();

  for (const tower of towers) {
    assert.equal(
      cardAppliesToTower(card, tower),
      areaRadius(tower) > 0 && !tower.resourceProvider,
      `${tower.id} (${tower.name}) kapsamda yanlis tarafta: alan=${areaRadius(tower)}`
    );
  }

  // Sekli `circle` ama yaricapi yok: eskiden ucu de kapsamdaydi.
  for (const id of ["wall-1", "warrior-3", "archer-2"]) {
    const tower = towers.find((entry) => entry.id === id);
    assert.equal(tower.engine?.attack.shape, "circle", `${id} artik halka degil, test eskimis`);
    assert.equal(cardAppliesToTower(card, tower), false, `${id} hala kapsamda`);
  }
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
