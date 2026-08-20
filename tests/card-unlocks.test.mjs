/**
 * Davranis kilitleri.
 *
 * `unlocks` alani uzun sure yalnizca dokumantasyondu: sunucu her davranisi
 * `equippedShopItemIds.includes("bir-esya-kimligi")` seklinde elle kontrol
 * ediyordu, dolayisiyla ayni davranisi veren bir kart eklemek imkansizdi.
 * Artik kart ve esya ayni veriyi bildiriyor ve tek bir cozumleyici okuyor.
 *
 * Buradaki testler o cozumlemenin kaynagi ayirt etmedigini, kapsami dogru
 * uyguladigini ve kilidin yanlis kuleye sizmadigini dogrular.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_UNLOCKS,
  MAX_ENCODABLE_UNLOCKS,
  cardCatalog,
  decodeUnlocks,
  encodeUnlocks,
  getShopItem,
  hasUnlockBit,
  shopCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function setup(definitionId = "onur-3", characterId = "onur") {
  const room = createRoom(characterId);
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin kare bulunamadi`);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()][0];
  return { room, tower, player: room.state.players.get("p1") };
}

function buy(room, player, itemId) {
  player.shopOffers = [getShopItem(itemId)];
  const previous = room.setupPhase;
  room.setupPhase = true;
  room.buyShopItem(client, { itemId });
  room.setupPhase = previous;
}

test("kilitler bit maskesine sigar ve maske tur kaybetmeden gidip gelir", () => {
  // Maske 32 bitlik bir sayi; liste tasarsa sondaki kilitler sessizce kaybolur.
  assert.ok(ALL_UNLOCKS.length <= MAX_ENCODABLE_UNLOCKS, `kilit sayisi maskeye sigmiyor: ${ALL_UNLOCKS.length}`);
  assert.deepEqual(decodeUnlocks(encodeUnlocks(ALL_UNLOCKS)), ALL_UNLOCKS);
  assert.equal(encodeUnlocks([]), 0);
  assert.deepEqual(decodeUnlocks(0), []);

  const sample = ["canHitAir", "stack:kill", "heat:runHot"];
  const bits = encodeUnlocks(sample);
  for (const unlock of ALL_UNLOCKS) {
    assert.equal(hasUnlockBit(bits, unlock), sample.includes(unlock), `${unlock} maskede yanlis`);
  }
});

test("kilit listesi tip birlesimiyle ayni", () => {
  assert.equal(new Set(ALL_UNLOCKS).size, ALL_UNLOCKS.length, "yinelenen kilit var");
  const declared = new Set();
  for (const entry of [...cardCatalog, ...shopCatalog]) {
    for (const unlock of entry.unlocks ?? []) declared.add(unlock);
  }
  for (const unlock of declared) {
    assert.ok(ALL_UNLOCKS.includes(unlock), `${unlock} ALL_UNLOCKS listesinde yok`);
  }
});

test("her kilit en az bir kart veya esya tarafindan veriliyor", () => {
  const declared = new Set();
  for (const entry of [...cardCatalog, ...shopCatalog]) {
    for (const unlock of entry.unlocks ?? []) declared.add(unlock);
  }
  const missing = ALL_UNLOCKS.filter((unlock) => !declared.has(unlock));
  assert.deepEqual(missing, [], `hicbir icerigin vermedigi kilit: ${missing.join(", ")}`);
});

test("kartlar da esyalar da davranis kilidi verebiliyor", () => {
  const cardUnlocks = cardCatalog.filter((card) => (card.unlocks?.length ?? 0) > 0);
  const itemUnlocks = shopCatalog.filter((item) => (item.unlocks?.length ?? 0) > 0);
  assert.ok(cardUnlocks.length >= 8, `kilit veren kart sayisi az: ${cardUnlocks.length}`);
  assert.ok(itemUnlocks.length > 0);
});

test("takili esyanin kilidi yalnizca o kulede acilir", () => {
  const { room, tower, player } = setup();
  player.gold = 100000;
  const second = findBuildableSpot(room, "onur-3");
  room.placeTower({ sessionId: "p1" }, { x: second.x, y: second.y, definitionId: "onur-3" });
  const other = [...room.towers.values()].find((candidate) => candidate.id !== tower.id);

  assert.equal(room.towerHasUnlock(tower, "canHitAir"), false);
  buy(room, player, "ucaksavar-kiti");
  room.equipShopItem(client, { itemId: "ucaksavar-kiti", towerId: tower.id });

  assert.equal(room.towerHasUnlock(tower, "canHitAir"), true);
  assert.equal(room.towerHasUnlock(other, "canHitAir"), false);
});

test("hedefli kart kilidi yalnizca takildigi kuleye verir", () => {
  const { room, tower, player } = setup();
  const second = findBuildableSpot(room, "onur-3");
  room.placeTower({ sessionId: "p1" }, { x: second.x, y: second.y, definitionId: "onur-3" });
  const other = [...room.towers.values()].find((candidate) => candidate.id !== tower.id);

  const card = cardCatalog.find((candidate) => candidate.id === "hava-savunma-kiti");
  room.pendingCardChoices.set("p1", [card]);
  room.chooseCard(client, { cardId: card.id, towerId: tower.id });

  assert.deepEqual(tower.targetedCardIds, [card.id]);
  assert.equal(room.towerHasUnlock(tower, "canHitAir"), true, "kart takildigi kulede acmadi");
  assert.equal(room.towerHasUnlock(other, "canHitAir"), false, "kilit baska kuleye sizdi");
  assert.equal(player.ownedCardIds.includes(card.id), true);
});

test("genel kart kilidi oyuncunun tum kulelerinde acilir", () => {
  const { room, tower, player } = setup();
  const second = findBuildableSpot(room, "onur-3");
  room.placeTower({ sessionId: "p1" }, { x: second.x, y: second.y, definitionId: "onur-3" });
  const other = [...room.towers.values()].find((candidate) => candidate.id !== tower.id);

  const card = cardCatalog.find((candidate) => candidate.id === "zafer-sarhoslugu");
  room.pendingCardChoices.set("p1", [card]);
  room.chooseCard(client, { cardId: card.id });

  assert.equal(room.towerHasUnlock(tower, "stack:kill"), true);
  assert.equal(room.towerHasUnlock(other, "stack:kill"), true);
  assert.ok(player.ownedCardIds.includes(card.id));
});

test("etiketli kart kilidi yalnizca kapsamina uyan kulede acilir", () => {
  // Atesleyici yalnizca ates hasarli kulelere kilit verir; onur-3'un hasar turu yok.
  const { room, tower, player } = setup();
  const card = cardCatalog.find((candidate) => candidate.id === "atesleyici");
  room.pendingCardChoices.set("p1", [card]);
  room.chooseCard(client, { cardId: card.id });

  assert.ok(player.ownedCardIds.includes(card.id));
  assert.equal(room.towerHasUnlock(tower, "status:burn"), false, "kapsam disi kuleye kilit sizdi");
});

test("kilit kaynagi ayirt edilmez: kart da esya da ayni davranisi acar", () => {
  const viaItem = setup();
  viaItem.player.gold = 100000;
  buy(viaItem.room, viaItem.player, "zafer-serisi");
  viaItem.room.equipShopItem(client, { itemId: "zafer-serisi", towerId: viaItem.tower.id });

  const viaCard = setup();
  const card = cardCatalog.find((candidate) => candidate.id === "zafer-sarhoslugu");
  viaCard.room.pendingCardChoices.set("p1", [card]);
  viaCard.room.chooseCard(client, { cardId: card.id });

  assert.equal(viaItem.room.towerHasUnlock(viaItem.tower, "stack:kill"), true);
  assert.equal(viaCard.room.towerHasUnlock(viaCard.tower, "stack:kill"), true);
});

test("kilitsiz kule sinirli hedefleme moduna sahiptir", () => {
  const { room, tower, player } = setup();
  room.setTowerTargeting(client, { towerId: tower.id, mode: "weakest" });
  assert.notEqual(tower.targetingMode, "weakest", "kilitsiz mod uygulandi");

  const card = cardCatalog.find((candidate) => candidate.id === "avci-egitimi");
  room.pendingCardChoices.set("p1", [card]);
  room.chooseCard(client, { cardId: card.id });
  assert.ok(player.ownedCardIds.includes(card.id));

  room.setTowerTargeting(client, { towerId: tower.id, mode: "weakest" });
  assert.equal(tower.targetingMode, "weakest", "kart acmasina ragmen mod uygulanmadi");
});
