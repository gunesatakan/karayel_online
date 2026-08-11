/**
 * Envanter kurallari.
 *
 * Magazadan alinan esyalar artik dogrudan etki etmiyor: once oyuncunun kisisel
 * envanterine giriyor, sonra tek bir kuleye takiliyor ve bir daha sokulemiyor.
 * Kuleye takilmasi anlamsiz olan yedi esya (isci, nexus, altin, harita) global
 * kaldi ve eskisi gibi alinir alinmaz calisiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  GLOBAL_SHOP_ITEM_IDS,
  MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER,
  canEquipShopItem,
  getShopItem,
  isGlobalShopItem,
  shopCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function setupTower(definitionId = "onur-3", characterId = "onur") {
  const room = createRoom(characterId);
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin kare bulunamadi`);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()][0];
  assert.ok(tower);
  return { room, tower, player: room.state.players.get("p1") };
}

const client = { sessionId: "p1", send() {} };

/**
 * Magaza yalnizca hazirlik fazinda ve teklif listesindeki esyalari satar.
 * Testin konusu envanter oldugu icin bu iki on kosul burada kuruluyor.
 */
function buy(room, player, itemId) {
  player.shopOffers = [getShopItem(itemId)];
  const previousSetupPhase = room.setupPhase;
  room.setupPhase = true;
  room.buyShopItem(client, { itemId });
  room.setupPhase = previousSetupPhase;
}

/** Kulenin ucan hedef vurup vuramadigi gercek hedefleme kuralindan okunur. */
function canHitAir(room, tower) {
  return room.canTowerTargetEnemy(tower, {
    movementKind: "air",
    dominatedUntil: 0,
    melisUndeadUntil: 0,
    melisWhisperTurnedUntil: 0
  });
}

test("katalogdaki her esya ya kuleye takilir ya da globaldir", () => {
  for (const item of shopCatalog) {
    assert.ok(item.target === "tower" || item.target === "global", `${item.id} hedefi tanimsiz`);
    assert.equal(isGlobalShopItem(item), GLOBAL_SHOP_ITEM_IDS.includes(item.id), `${item.id} hedefi listeyle uyumsuz`);
  }
  assert.equal(shopCatalog.filter(isGlobalShopItem).length, GLOBAL_SHOP_ITEM_IDS.length);
});

test("kuleye takilan esyalarin modifierlari tower kapsaminda", () => {
  for (const item of shopCatalog) {
    const expected = item.target === "global" ? "player" : "tower";
    for (const modifier of item.effects) {
      assert.equal(modifier.scope, expected, `${item.id} efekti yanlis kapsamda`);
    }
  }
});

test("kule esyasi satin alinca envantere girer, hicbir seye etki etmez", () => {
  const { room, player } = setupTower();
  player.gold = 100000;

  buy(room, player, "kritik-sistem");

  assert.deepEqual(player.inventoryItemIds, ["kritik-sistem"]);
  assert.equal(player.runModifiers.length, 0, "kule esyasi oyuncu modifierlarina yazilmamali");
});

test("global esya satin alinca dogrudan etki eder, envantere girmez", () => {
  const { room, player } = setupTower();
  player.gold = 100000;

  buy(room, player, "ek-yuva-magaza");

  assert.equal(player.inventoryItemIds.length, 0);
  assert.ok(player.runModifiers.some((modifier) => modifier.source === "shop:ek-yuva-magaza"));
});

test("takma esyayi envanterden cikarip yalnizca o kuleye uygular", () => {
  const { room, tower, player } = setupTower();
  player.gold = 100000;
  buy(room, player, "kritik-sistem");

  const before = room.getTowerDamage(tower);
  room.equipShopItem(client, { itemId: "kritik-sistem", towerId: tower.id });

  assert.equal(player.inventoryItemIds.length, 0);
  assert.deepEqual(tower.equippedShopItemIds, ["kritik-sistem"]);
  assert.ok(tower.runModifiers.some((modifier) => modifier.source === "shop:kritik-sistem"));
  // Kritik sistem hasar statini degistirmez ama modifier kuleye baglanmis olmali.
  assert.equal(room.getTowerDamage(tower), before);
});

test("takilan esya baska kuleyi etkilemez", () => {
  // Delici Cekirdek yalnizca mermi vuruslu kulelere takilir; Jackpot oyle.
  const { room, tower, player } = setupTower("onur-2");
  player.gold = 100000;
  const secondSpot = findBuildableSpot(room, "onur-2");
  room.placeTower({ sessionId: "p1" }, { x: secondSpot.x, y: secondSpot.y, definitionId: "onur-2" });
  const other = [...room.towers.values()].find((candidate) => candidate.id !== tower.id);
  assert.ok(other);

  buy(room, player, "delici-cekirdek");
  const otherBefore = room.getTowerDamage(other);
  room.equipShopItem(client, { itemId: "delici-cekirdek", towerId: tower.id });

  assert.ok(room.getTowerDamage(tower) > otherBefore, "takilan kule guclenmeliydi");
  assert.equal(room.getTowerDamage(other), otherBefore, "diger kule etkilenmemeliydi");
});

test("envanterde olmayan esya takilamaz", () => {
  const { room, tower, player } = setupTower();
  room.equipShopItem(client, { itemId: "kritik-sistem", towerId: tower.id });
  assert.deepEqual(tower.equippedShopItemIds, []);
  assert.equal(player.inventoryItemIds.length, 0);
});

test("baskasinin kulesine takilamaz", () => {
  const { room, tower, player } = setupTower();
  player.gold = 100000;
  buy(room, player, "kritik-sistem");
  tower.ownerId = "p2";

  room.equipShopItem(client, { itemId: "kritik-sistem", towerId: tower.id });

  assert.deepEqual(tower.equippedShopItemIds, []);
  assert.deepEqual(player.inventoryItemIds, ["kritik-sistem"], "reddedilen esya envanterde kalmali");
});

test("global esya kuleye takilamaz", () => {
  const { tower } = setupTower();
  const result = canEquipShopItem(getShopItem("ek-yuva-magaza"), tower.definition, []);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "globalItem");
});

test("bir kuleye en fazla bes esya takilir", () => {
  const { room, tower, player } = setupTower();
  player.gold = 1000000;

  // Ayni esyayi tekrar tekrar alip takarak tavani zorla.
  const repeatable = "sogutucu-kanatlar";
  for (let index = 0; index < MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER; index += 1) {
    buy(room, player, repeatable);
    room.equipShopItem(client, { itemId: repeatable, towerId: tower.id });
  }
  assert.equal(tower.equippedShopItemIds.length, MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER);

  buy(room, player, "kritik-sistem");
  room.equipShopItem(client, { itemId: "kritik-sistem", towerId: tower.id });

  assert.equal(tower.equippedShopItemIds.length, MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER, "tavan asildi");
  assert.deepEqual(player.inventoryItemIds, ["kritik-sistem"], "takilamayan esya envanterde kalmali");
});

test("uyumsuz kuleye takilamaz", () => {
  // Odak mercegi yalnizca focus vurusu olan kulelere takilir; onur-3 mermi atar.
  const { tower } = setupTower();
  const result = canEquipShopItem(getShopItem("odak-mercegi"), tower.definition, []);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "incompatibleTower");
});

test("kilit acan esya yalnizca takildigi kulede calisir", () => {
  const { room, tower, player } = setupTower();
  player.gold = 100000;
  const secondSpot = findBuildableSpot(room, "onur-3");
  room.placeTower({ sessionId: "p1" }, { x: secondSpot.x, y: secondSpot.y, definitionId: "onur-3" });
  const other = [...room.towers.values()].find((candidate) => candidate.id !== tower.id);

  assert.equal(canHitAir(room,tower), false);
  buy(room, player, "ucaksavar-kiti");
  room.equipShopItem(client, { itemId: "ucaksavar-kiti", towerId: tower.id });

  assert.equal(canHitAir(room,tower), true, "takilan kule havayi vurabilmeliydi");
  assert.equal(canHitAir(room,other), false, "diger kule havayi vuramamaliydi");
});

test("takilan esya sokulemez: kaldiran bir yol yok", () => {
  const { room, tower, player } = setupTower();
  player.gold = 100000;
  buy(room, player, "kritik-sistem");
  room.equipShopItem(client, { itemId: "kritik-sistem", towerId: tower.id });

  // Ayni cagriyi tekrarlamak esyayi geri almaz ve kopyalamaz.
  room.equipShopItem(client, { itemId: "kritik-sistem", towerId: tower.id });

  assert.deepEqual(tower.equippedShopItemIds, ["kritik-sistem"]);
  assert.equal(player.inventoryItemIds.length, 0);
  assert.equal(typeof room.unequipShopItem, "undefined", "sokme yolu eklenmemeli");
});
