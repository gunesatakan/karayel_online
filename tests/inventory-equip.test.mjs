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
  getInventoryEquipRejectedCue,
  getShopItem,
  getShopItemPrice,
  isGlobalShopItem,
  isShopItemAvailable,
  shopCatalog,
  towerCatalog
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

test("bir kuleye en fazla on esya takilir", () => {
  const { room, tower, player } = setupTower();
  player.gold = 1000000;
  assert.equal(MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER, 10);

  // Yiginli esyalarin kule basina sinirlariyla tavani doldur: 5 + 3 + 2.
  const fill = [
    ...Array(5).fill("sogutucu-kanatlar"),
    ...Array(3).fill("sogutma-sivisi"),
    ...Array(2).fill("celik-dokum")
  ];
  for (const itemId of fill) {
    buy(room, player, itemId);
    room.equipShopItem(client, { itemId, towerId: tower.id });
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

/*
 * Kule esyalarinin sinirlari kule basina. Eskiden oyuncu basina sayiliyordu:
 * bir Debug Lazer'e dort Hassas Tetik takan oyuncu ikinci Debug Lazer'ine hic
 * Hassas Tetik alamiyordu.
 */
const kule = (id) => Object.values(towerCatalog).flat().find((tower) => tower.id === id);
const loadout = (towers, inventoryItemIds = []) => ({
  towers: towers.map(([id, equippedItemIds = []]) => ({ definition: kule(id), equippedItemIds })),
  inventoryItemIds
});

function setupTwoTowers(definitionId = "warrior-5", characterId = "warrior") {
  const { room, tower, player } = setupTower(definitionId, characterId);
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId });
  const other = [...room.towers.values()].find((candidate) => candidate.id !== tower.id);
  assert.ok(other, "ikinci kule kurulamadi");
  return { room, tower, other, player };
}

function recordingClient() {
  const sent = [];
  return { sessionId: "p1", sent, send(type, payload) { sent.push({ type, payload }); } };
}

test("Debug Lazer: bir kulede dolan esya ayni tipten ikinci kuleye yine satilir ve takilir", () => {
  const { room, tower, other, player } = setupTwoTowers();
  const entry = getShopItem("hassas-tetik");
  const recorder = recordingClient();
  for (let index = 0; index < 4; index += 1) {
    buy(room, player, entry.id);
    room.equipShopItem(recorder, { itemId: entry.id, towerId: tower.id });
  }
  assert.deepEqual(tower.equippedShopItemIds, Array(4).fill(entry.id));
  assert.equal(isShopItemAvailable(entry, 5, player.ownedShopItemIds, room.getPlayerShopLoadout("p1", player)), true, "ikinci kule icin vitrine cikmali");

  buy(room, player, entry.id);
  assert.deepEqual(player.inventoryItemIds, [entry.id], "satin alinamadi");
  room.equipShopItem(recorder, { itemId: entry.id, towerId: tower.id });
  assert.deepEqual(recorder.sent.at(-1), { type: "inventory:equip-rejected", payload: { itemId: entry.id, towerId: tower.id, reason: "itemLimit" } });
  assert.equal(tower.equippedShopItemIds.length, 4, "besinci kopya ilk kuleye takildi");
  room.equipShopItem(recorder, { itemId: entry.id, towerId: other.id });
  assert.deepEqual(other.equippedShopItemIds, [entry.id]);
  assert.deepEqual(player.inventoryItemIds, []);
});

test("tek seferlik esya iki kuleye birer kez takilir", () => {
  const { room, tower, other, player } = setupTwoTowers();
  const recorder = recordingClient();
  buy(room, player, "kritik-sistem");
  room.equipShopItem(recorder, { itemId: "kritik-sistem", towerId: tower.id });
  assert.equal(isShopItemAvailable(getShopItem("kritik-sistem"), 5, player.ownedShopItemIds, room.getPlayerShopLoadout("p1", player)), true);
  buy(room, player, "kritik-sistem");
  room.equipShopItem(recorder, { itemId: "kritik-sistem", towerId: tower.id });
  assert.equal(recorder.sent.at(-1).payload.reason, "itemLimit");
  room.equipShopItem(recorder, { itemId: "kritik-sistem", towerId: other.id });
  assert.deepEqual(tower.equippedShopItemIds, ["kritik-sistem"]);
  assert.deepEqual(other.equippedShopItemIds, ["kritik-sistem"]);
  // Iki kule de dolu: artik vitrine cikmaz.
  assert.equal(isShopItemAvailable(getShopItem("kritik-sistem"), 5, player.ownedShopItemIds, room.getPlayerShopLoadout("p1", player)), false);
});

test("kopya siniri asan takma itemLimit ile reddedilir; ret metni sinirini soyler", () => {
  const debug = kule("warrior-5");
  const tetik = getShopItem("hassas-tetik");
  assert.deepEqual(canEquipShopItem(tetik, debug, Array(3).fill(tetik.id)), { ok: true });
  assert.deepEqual(canEquipShopItem(tetik, debug, Array(4).fill(tetik.id)), { ok: false, reason: "itemLimit" });
  assert.deepEqual(canEquipShopItem(getShopItem("kritik-sistem"), debug, ["kritik-sistem"]), { ok: false, reason: "itemLimit" });
  assert.equal(getInventoryEquipRejectedCue({ itemId: tetik.id, reason: "itemLimit" }).text, "Hassas Tetik bir kuleye en fazla 4 kez takılır · envanterde kaldı");
  assert.equal(getInventoryEquipRejectedCue({ itemId: "kritik-sistem", reason: "itemLimit" }, { creative: true }).text, `${getShopItem("kritik-sistem").name} bir kuleye en fazla 1 kez takılır`);
  // Yuva tavani kopya sinirindan once soyleniyor.
  assert.deepEqual(canEquipShopItem(tetik, debug, Array(MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER).fill("sogutucu-kanatlar")), { ok: false, reason: "towerFull" });
  assert.equal(getInventoryEquipRejectedCue({ itemId: tetik.id, reason: "towerFull" }).text, "Bu kulede boş yuva yok · en fazla 10 eşya");
});

test("karsit esyalar ayni kuleye takilamaz, ayri kulelere takilir", () => {
  const onur = kule("onur-3");
  const bitisik = getShopItem("bitisik-devre");
  const yalniz = getShopItem("yalniz-kurt");
  assert.deepEqual(canEquipShopItem(yalniz, onur, [bitisik.id]), { ok: false, reason: "itemConflict" });
  assert.deepEqual(canEquipShopItem(bitisik, onur, [yalniz.id]), { ok: false, reason: "itemConflict" });
  assert.deepEqual(canEquipShopItem(yalniz, onur, []), { ok: true });
  assert.equal(getInventoryEquipRejectedCue({ itemId: yalniz.id, reason: "itemConflict" }).text, "Yalnız Kurt, Bitişik Devre ile aynı kuleye takılamaz · envanterde kaldı");
  assert.equal(isShopItemAvailable(yalniz, 5, [bitisik.id], loadout([["onur-3", [bitisik.id]]])), false, "tek kule karsit esyayi tasiyor");
  assert.equal(isShopItemAvailable(yalniz, 5, [bitisik.id], loadout([["onur-3", [bitisik.id]], ["onur-3"]])), true, "ikinci kule bos");
});

test("vitrin envanterde bekleyen kopyalari ayrilmis sayar", () => {
  const tetik = getShopItem("hassas-tetik");
  const one = [["warrior-5"]];
  assert.equal(isShopItemAvailable(tetik, 5, [], loadout(one, Array(3).fill(tetik.id))), true, "4 hak, 3 bekleyen");
  assert.equal(isShopItemAvailable(tetik, 5, [], loadout(one, Array(4).fill(tetik.id))), false, "4 hak, 4 bekleyen");
  assert.equal(isShopItemAvailable(tetik, 5, [], loadout([["warrior-5", Array(2).fill(tetik.id)]], Array(2).fill(tetik.id))), false, "2 takili + 2 bekleyen");
  assert.equal(isShopItemAvailable(tetik, 5, [], loadout([...one, ["warrior-5"]], Array(4).fill(tetik.id))), true, "ikinci kule 4 hak daha acar");
  // Dolu yuva hakki kapatir.
  assert.equal(isShopItemAvailable(tetik, 5, [], loadout([["warrior-5", Array(10).fill("sogutucu-kanatlar")]])), false);
  // Uyumlu kule henuz yoksa sunulmaya devam eder (Duvar hasar vermez).
  assert.equal(canEquipShopItem(tetik, kule("wall-1"), []).ok, false);
  assert.equal(isShopItemAvailable(tetik, 5, [], loadout([], Array(9).fill(tetik.id))), true);
  assert.equal(isShopItemAvailable(tetik, 5, [], loadout([["wall-1"]], Array(9).fill(tetik.id))), true);
  // Dalga kilidi degismedi.
  assert.equal(isShopItemAvailable({ ...tetik, unlockWave: 6 }, 5, [], loadout(one)), false);
});

test("kule esyasinin fiyati alacak kuledeki sirasina gore buyur", () => {
  const tetik = getShopItem("hassas-tetik");
  const base = tetik.price;
  const step = (count) => Math.ceil(base * tetik.priceGrowth ** count);
  assert.equal(getShopItemPrice(tetik, [], loadout([["warrior-5"]])), base);
  // Birinci kule dolu, ikinci bos: ikinci kulenin ilk kopyasi taban fiyat.
  assert.equal(getShopItemPrice(tetik, Array(4).fill(tetik.id), loadout([["warrior-5", Array(4).fill(tetik.id)], ["warrior-5"]])), base);
  // En az kopya tasiyan acik kuleye gore: 2 ve 1 -> ikinci kopya fiyati.
  assert.equal(getShopItemPrice(tetik, [], loadout([["warrior-5", Array(2).fill(tetik.id)], ["warrior-5", [tetik.id]]])), step(1));
  // Envanterde bekleyen kopyalar siraya eklenir.
  assert.equal(getShopItemPrice(tetik, [], loadout([["warrior-5", [tetik.id]]], [tetik.id])), step(2));
  // Uyumlu kule yokken yalnizca envanter sayilir.
  assert.equal(getShopItemPrice(tetik, Array(4).fill(tetik.id), loadout([], [tetik.id])), step(1));
  // Yuk verilmezse eski davranis: sahip olunan liste tek kule gibi.
  assert.equal(getShopItemPrice(tetik, [tetik.id, tetik.id]), step(2));
});

test("sunucu kule esyasini alacak kuledeki fiyattan satar", () => {
  const { room, tower, player } = setupTwoTowers();
  const tetik = getShopItem("hassas-tetik");
  for (let index = 0; index < 4; index += 1) {
    buy(room, player, tetik.id);
    room.equipShopItem(client, { itemId: tetik.id, towerId: tower.id });
  }
  const before = player.gold;
  buy(room, player, tetik.id);
  assert.equal(before - player.gold, tetik.price, "ikinci kulenin ilk kopyasi taban fiyat olmali");
  // Envanterdeki kopya ikinci kulenin ilk hakkini tutuyor: sonraki ikinci kopya fiyati.
  const next = player.gold;
  buy(room, player, tetik.id);
  assert.equal(next - player.gold, Math.ceil(tetik.price * tetik.priceGrowth));
});

test("global esyalarin sinirlari oyuncu basina kaldi", () => {
  const towers = loadout([["warrior-5"], ["warrior-5"]]);
  const elek = getShopItem("altin-elek");
  assert.equal(elek.target, "global");
  assert.equal(isShopItemAvailable(elek, 5, Array(2).fill(elek.id), towers), true);
  assert.equal(isShopItemAvailable(elek, 5, Array(3).fill(elek.id), towers), false);
  assert.equal(getShopItemPrice(elek, Array(2).fill(elek.id), towers), Math.ceil(elek.price * elek.priceGrowth ** 2));
  const mevduat = getShopItem("vadeli-mevduat");
  assert.equal(isShopItemAvailable(mevduat, 5, Array(2).fill(mevduat.id), towers), false);
  assert.equal(isShopItemAvailable(getShopItem("ek-yuva-magaza"), 5, ["ek-yuva-magaza", "ek-yuva-magaza"], towers), false);
});

test("Darphane Modulu bina basina en fazla uc kez", () => {
  const darphane = getShopItem("darphane-modulu");
  const merkez = kule("warrior-7");
  assert.equal(darphane.target, "tower");
  assert.deepEqual(canEquipShopItem(darphane, merkez, Array(2).fill(darphane.id)), { ok: true });
  assert.deepEqual(canEquipShopItem(darphane, merkez, Array(3).fill(darphane.id)), { ok: false, reason: "itemLimit" });
  assert.equal(isShopItemAvailable(darphane, 5, [], loadout([["warrior-7", Array(3).fill(darphane.id)]])), false);
  assert.equal(isShopItemAvailable(darphane, 5, [], loadout([["warrior-7", Array(3).fill(darphane.id)], ["warrior-7"]])), true);
  assert.match(darphane.description, /bir binaya en fazla 3 kez takılır/);
});

test("kule esyasi aciklamalari kule basina siniri soyluyor", () => {
  for (const entry of shopCatalog) {
    if (!entry.repeatable || entry.maxStacks === undefined) continue;
    if (entry.target === "tower") {
      assert.match(entry.description, new RegExp(`bir (kuleye|binaya) en fazla ${entry.maxStacks} kez takılır`), entry.id);
      assert.doesNotMatch(entry.description, /kez alınır/, entry.id);
    }
  }
});
