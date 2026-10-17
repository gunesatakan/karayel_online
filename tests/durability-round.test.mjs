/**
 * Dayaniklilik turu: uc kart (Sertlesen Govde, Inatci Siper, Son Nefes) ve uc
 * esya (Yuk Dagitici Kiris, Oz Onarim Cekirdegi, Percinli Kaplama). Hicbiri
 * duz "+%X can" degil; her biri gercek odada `damageTower`, dalga sonu
 * buyumesi ve `updateTowers` uzerinden olculuyor. Can ile ilgili oteki
 * kurallarla (esya oranli can, onarim bedeli, yaratici yeniden kurulum,
 * yikim) birlikte calismalari da burada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DAMAGE_SHARE_CAP,
  GAME_SPEED_MULTIPLIER,
  IDLE_REGEN_DELAY_MS,
  LAST_STAND_HP,
  VETERAN_HEALTH_MAX_WAVES,
  WOUNDED_DAMAGE_REDUCTION_HP_RATIO,
  canEquipShopItem,
  cardCatalog,
  cardReachesTower,
  getCardTowerReach,
  getMapGridSize,
  getModifierAdd,
  getShopItem,
  getVeteranHealthMultiplier,
  getWoundedDamageMultiplier,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";
import { clearBuildZones, createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const { enCards } = await importWebModule("apps/web/src/locales/catalog/en-cards.ts");
const { enShopItems } = await importWebModule("apps/web/src/locales/catalog/en-shop.ts");

const client = { sessionId: "p1", send() {} };
const near = (actual, expected, label = "", epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label} ${actual} != ${expected}`);
const item = (id) => getShopItem(id);
const itemAdd = (itemId, stat) => getModifierAdd(item(itemId).effects, stat);
const card = (id) => cardCatalog.find((entry) => entry.id === id);
const cardAdd = (cardId, stat) => getModifierAdd(card(cardId).effects, stat);
const allTowers = Object.values(towerCatalog).flat();
const kule = (id) => allTowers.find((tower) => tower.id === id);
const oyunMs = (gameMs) => gameMs / GAME_SPEED_MULTIPLIER;
const BASE_ARMOR = 3;

const CARD_IDS = ["sertlesen-govde", "inatci-siper", "son-nefes"];
const ITEM_IDS = ["yuk-dagitici-kiris", "oz-onarim-cekirdegi", "percinli-kaplama"];

function oda() {
  const room = clearBuildZones(createRoom("warrior"));
  room.broadcast = () => {};
  room.setupPhase = false;
  room.towerCriticalRandom = () => 1;
  return room;
}

function kur(room, definitionId = "warrior-4") {
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { ...spot, definitionId });
  return [...room.towers.values()].at(-1);
}

function yaninaKur(room, tower, definitionId = "warrior-4", offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
  const grid = getMapGridSize(room.activeMap);
  for (const [dc, dr] of offsets) {
    const x = tower.x + dc * grid;
    const y = tower.y + dr * grid;
    if (!room.canPlaceTower(x, y, definitionId, "horizontal")) continue;
    room.placeTower(client, { x, y, definitionId });
    return [...room.towers.values()].at(-1);
  }
  return undefined;
}

/** Ilk kuleden en az uc kare uzakta ikinci bir kule. */
function uzagaKur(room, tower, definitionId = "warrior-4") {
  const grid = getMapGridSize(room.activeMap);
  for (let d = 3; d < 12; d += 1) {
    for (const [dc, dr] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
      const x = tower.x + dc * grid;
      const y = tower.y + dr * grid;
      if (!room.canPlaceTower(x, y, definitionId, "horizontal")) continue;
      room.placeTower(client, { x, y, definitionId });
      return [...room.towers.values()].at(-1);
    }
  }
  return undefined;
}

function esyaVer(room, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
}

function esyaTak(room, tower, itemId) {
  esyaVer(room, itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} takilamadi`);
}

function kartAl(room, cardId) {
  room.pendingCardChoices.set("p1", [card(cardId)]);
  room.chooseCard(client, { cardId });
  assert.ok(room.state.players.get("p1").ownedCardIds.includes(cardId), `${cardId} secilemedi`);
}

function saatli(fn) {
  const realNow = Date.now;
  const clock = { now: 1_900_000_000_000 };
  Date.now = () => clock.now;
  try {
    return fn(clock);
  } finally {
    Date.now = realNow;
  }
}

/** Bir vurusun yapidan dusurdugu can. */
function vurus(room, tower, damage, options) {
  const before = tower.hp;
  room.damageTower(tower, damage, options);
  return before - tower.hp;
}

test("katalog: uc kart ve uc esya, normal nadirlik ve fiyat araliginda, ikisi de cevrilmis", () => {
  const rarities = CARD_IDS.map((id) => card(id)?.rarity);
  assert.deepEqual(rarities, ["uncommon", "common", "rare"]);
  for (const id of CARD_IDS) {
    assert.ok(card(id), `${id} yok`);
    assert.equal(card(id).scope.kind, "global");
    assert.ok(enCards[id]?.name && /\d/.test(enCards[id].description), `${id} Ingilizcesi yok`);
  }
  for (const id of ITEM_IDS) {
    const entry = item(id);
    assert.ok(entry, `${id} yok`);
    assert.equal(entry.rarity, undefined, `${id} nadirliksiz olmali`);
    assert.equal(entry.target, "tower");
    assert.ok(entry.price >= 60 && entry.price <= 200, `${id} fiyati ${entry.price}`);
    assert.ok(enShopItems[id]?.name && /\d/.test(enShopItems[id].description), `${id} Ingilizcesi yok`);
  }
});

test("Sertlesen Govde: ayakta biten her dalga azami cani +%8 buyutuyor, tavan 8 dalga; yikik yapi buyumuyor", () => {
  const room = oda();
  const tower = kur(room);
  const fallen = uzagaKur(room, tower);
  const base = tower.maxHp;
  const fallenBase = fallen.maxHp;
  kartAl(room, "sertlesen-govde");
  near(tower.maxHp, base, "kart aninda can degismiyor");
  const per = cardAdd("sertlesen-govde", "veteranHealth");
  fallen.hp = 0;
  tower.hp = tower.maxHp / 2;
  room.advanceWaveGrowth();
  near(tower.maxHp, base * (1 + per), "bir dalga");
  near(tower.hp / tower.maxHp, 0.5, "can orani korunuyor");
  near(fallen.maxHp, fallenBase, "yikik yapi");
  for (let wave = 0; wave < VETERAN_HEALTH_MAX_WAVES + 3; wave += 1) room.advanceWaveGrowth();
  near(tower.maxHp, base * getVeteranHealthMultiplier(per, VETERAN_HEALTH_MAX_WAVES), "tavan");
  near(tower.maxHp, base * 1.64, "+%64");

  // Kart alindiktan sonra kurulan yapi sifirdan sayiyor.
  const late = uzagaKur(room, fallen);
  const lateBase = late.maxHp;
  room.advanceWaveGrowth();
  near(late.maxHp, lateBase * (1 + per), "sonra kurulan yapi");
});

test("Sertlesen Govde oteki can kurallariyla: esya orani, onarim bedeli, yaratici yeniden kurulum", () => {
  const room = oda();
  const tower = kur(room);
  const base = tower.maxHp;
  kartAl(room, "sertlesen-govde");
  for (let wave = 0; wave < 4; wave += 1) room.advanceWaveGrowth();
  const grown = base * getVeteranHealthMultiplier(cardAdd("sertlesen-govde", "veteranHealth"), 4);
  near(tower.maxHp, grown, "dort dalga");
  // Onarim bedeli eksik canin oranina bakiyor: buyuyen can onarimi pahalilastirmiyor.
  tower.hp = tower.maxHp / 2;
  const grownCost = room.getStructureRepairCost(tower);
  const fresh = uzagaKur(room, tower);
  fresh.hp = fresh.maxHp / 2;
  assert.equal(grownCost, room.getStructureRepairCost(fresh), "ayni yarim can, ayni bedel");
  // Can esyasi buyumenin ustune carpiyor (carpanlar ayri).
  esyaTak(room, tower, "celik-dokum");
  near(tower.maxHp, grown * (1 + itemAdd("celik-dokum", "towerHealth")), "Celik Dokum");
  // Yaratici yeniden kurulum sayaci tutuyor.
  const before = tower.maxHp;
  room.rebuildCreativeLoadout("p1");
  near(tower.maxHp, before, "yeniden kurulum", 1e-6);
});

test("Inatci Siper: cani yarinin altindaki yapi %40 az hasar aliyor, zirhtan once", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "inatci-siper");
  const reduction = cardAdd("inatci-siper", "woundedDamageReduction");
  assert.equal(vurus(room, tower, 20), 20 - BASE_ARMOR, "tam canda indirim yok");
  tower.hp = tower.maxHp * WOUNDED_DAMAGE_REDUCTION_HP_RATIO;
  assert.equal(vurus(room, tower, 20), 20 - BASE_ARMOR, "tam esikte indirim yok");
  tower.hp = tower.maxHp * 0.4;
  near(vurus(room, tower, 20), 20 * (1 - reduction) - BASE_ARMOR, "esigin altinda");
  near(getWoundedDamageMultiplier(reduction, 10, 100), 0.6, "carpan");
  // Duvara da isliyor (genel kart, yapi erisimi).
  assert.equal(getCardTowerReach(card("inatci-siper")), "structure");
  assert.equal(cardReachesTower(card("inatci-siper"), kule("wall-1")), true);
});

test("Son Nefes: dalga basina bir kez 1 canla birakiyor, 3 sn hasarsiz; yikim atliyor; yeni dalgada yenileniyor", () => saatli((clock) => {
  const room = oda();
  const tower = kur(room);
  const other = uzagaKur(room, tower);
  kartAl(room, "son-nefes");
  room.damageTower(tower, 1e6);
  assert.equal(tower.hp, LAST_STAND_HP, "oldurucu vurus 1 canla birakiyor");
  room.damageTower(tower, 1e6);
  assert.equal(tower.hp, LAST_STAND_HP, "pencerede hasar yok");
  clock.now += oyunMs(cardAdd("son-nefes", "lastStand") * 1000) + 5;
  room.damageTower(tower, 1e6);
  assert.equal(tower.hp, 0, "ayni dalgada ikinci hak yok");

  // Yikim (enerji yiyici) Son Nefes'i atliyor.
  room.destroyStructure(other);
  assert.equal(other.hp, 0, "yikim");

  // Yeni dalga: hak geri geliyor.
  const fresh = uzagaKur(room, tower);
  room.damageTower(fresh, 1e6);
  assert.equal(fresh.hp, LAST_STAND_HP);
  clock.now += oyunMs(3000);
  room.wave += 1;
  room.damageTower(fresh, 1e6);
  assert.equal(fresh.hp, LAST_STAND_HP, "sonraki dalgada yeniden");
}));

test("Yuk Dagitici Kiris: bitisikteki yapinin hasarinin %35'i kirise, zirhsiz; uzaktaki yapi paylasmiyor; yeniden paylasim yok", () => {
  const room = oda();
  const tower = kur(room);
  const carrier = yaninaKur(room, tower);
  assert.ok(carrier, "bitisik kule kurulamadi");
  const far = uzagaKur(room, tower);
  esyaTak(room, carrier, "yuk-dagitici-kiris");
  const share = itemAdd("yuk-dagitici-kiris", "damageShare");
  assert.ok(share <= DAMAGE_SHARE_CAP);
  const carrierBefore = carrier.hp;
  near(vurus(room, tower, 100), 100 * (1 - share) - BASE_ARMOR, "hedefte kalan");
  near(carrierBefore - carrier.hp, 100 * share, "kirisin ustlendigi (zirhsiz)");
  // Uzaktaki yapi tam hasar aliyor, kiris dokunulmuyor.
  const carrierMid = carrier.hp;
  assert.equal(vurus(room, far, 100), 100 - BASE_ARMOR);
  assert.equal(carrier.hp, carrierMid);
  // Kirisin kendisi vurulunca payi yeniden dagitilmiyor (hedef de kirisli olsa).
  esyaTak(room, tower, "yuk-dagitici-kiris");
  const towerBefore = tower.hp;
  near(vurus(room, carrier, 50), 50 * (1 - share) - BASE_ARMOR, "kirisli hedef");
  near(towerBefore - tower.hp, 50 * share, "ikinci kiris yalnizca payini aldi");
  // Yikim paylasilmiyor.
  const carrierHp = carrier.hp;
  room.destroyStructure(tower);
  assert.equal(carrier.hp, carrierHp, "yikim");
});

test("Yuk Dagitici Kiris duvar hattinda: duvara takili kiris bitisik kulenin hasarini aliyor", () => {
  const room = oda();
  const tower = kur(room);
  const grid = getMapGridSize(room.activeMap);
  // Kulenin sag kenarina duvar.
  const before = room.towers.size;
  room.placeTower(client, { x: tower.x + grid / 2, y: tower.y, definitionId: "wall-1" });
  let wall = room.towers.size > before ? [...room.towers.values()].at(-1) : undefined;
  if (!wall) {
    room.placeTower(client, { x: tower.x, y: tower.y + grid / 2, definitionId: "wall-1" });
    wall = [...room.towers.values()].at(-1);
  }
  assert.equal(wall.definition.id, "wall-1", "duvar orulemedi");
  esyaTak(room, wall, "yuk-dagitici-kiris");
  const wallBefore = wall.hp;
  const share = itemAdd("yuk-dagitici-kiris", "damageShare");
  near(vurus(room, tower, 100), 100 * (1 - share) - BASE_ARMOR);
  near(wallBefore - wall.hp, 100 * share, "duvar payi aldi");
});

test("Oz Onarim Cekirdegi: 4 sn hasarsiz yapi saniyede %3 yeniliyor; yalnizca dalgada", () => saatli((clock) => {
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, "oz-onarim-cekirdegi");
  const regen = itemAdd("oz-onarim-cekirdegi", "idleRegen");
  room.damageTower(tower, tower.maxHp / 2);
  const hurt = tower.hp;
  room.updateTowerIdleRegen(tower, room.runtime.now(), 1000);
  assert.equal(tower.hp, hurt, "yeni vurulan yapi yenilenmiyor");
  clock.now += oyunMs(IDLE_REGEN_DELAY_MS) + 1;
  room.updateTowerIdleRegen(tower, room.runtime.now(), 1000);
  near(tower.hp, hurt + tower.maxHp * regen, "bir oyun saniyesi");
  // Yeni vurus sayaci sifirliyor.
  room.damageTower(tower, 5);
  const struck = tower.hp;
  room.updateTowerIdleRegen(tower, room.runtime.now(), 1000);
  assert.equal(tower.hp, struck);
  // Hazirlikta islemiyor.
  clock.now += oyunMs(IDLE_REGEN_DELAY_MS) + 1;
  room.setupPhase = true;
  room.updateTowerIdleRegen(tower, room.runtime.now(), 1000);
  assert.equal(tower.hp, struck, "hazirlik");
  room.setupPhase = false;
  // Tam cani asmiyor; gercek tick yolu da yeniliyor.
  room.updateTowers(1e6);
  near(tower.hp, tower.maxHp, "tavan");
}));

test("Percinli Kaplama: zirh +4; kucuk vurusta buyuk, kusatmada kucuk fark; oransal hasar zirhi deliyor", () => {
  const room = oda();
  const tower = kur(room);
  const plain = uzagaKur(room, tower);
  esyaTak(room, tower, "percinli-kaplama");
  const armor = BASE_ARMOR + itemAdd("percinli-kaplama", "armorFlat");
  assert.equal(room.getTowerArmor(tower), armor);
  assert.equal(room.getTowerArmor(plain), BASE_ARMOR);
  assert.equal(vurus(room, tower, 12), 12 - armor, "piyade vurusu");
  assert.equal(vurus(room, plain, 12), 12 - BASE_ARMOR);
  assert.equal(vurus(room, tower, 5), 1, "vurus en az 1");
  assert.equal(vurus(room, tower, 96), 96 - armor, "kusatma vurusu");
  tower.hp = tower.maxHp;
  assert.equal(vurus(room, tower, 30, { pierceArmor: true }), 30, "zirh delen");
});

test("onizleme: Percinli Kaplama zirh satirini, Sertlesen Govde'li kulede can esyasi can satirini gosteriyor", () => {
  const room = oda();
  const tower = kur(room);
  const sent = [];
  const spy = { sessionId: "p1", send: (type, payload) => sent.push([type, payload]) };
  esyaVer(room, "percinli-kaplama");
  room.sendTowerPreview(spy, { requestId: "r1", towerId: tower.id, itemId: "percinli-kaplama" });
  let [, payload] = sent.at(-1);
  assert.equal(payload.error, undefined, payload.error);
  const index = payload.lineKeys.indexOf("preview.stat.armor");
  assert.ok(index >= 0, "zirh satiri yok");
  assert.equal(payload.changed[index], true);
  assert.match(payload.lines[index], /3\.00 → 7\.00/);

  // Onizlemenin hiz siniri oyuncu basina: ikinci olcum ayri odada.
  const room2 = oda();
  const grown = kur(room2);
  kartAl(room2, "sertlesen-govde");
  room2.advanceWaveGrowth();
  esyaVer(room2, "tampon-katman");
  room2.sendTowerPreview(spy, { requestId: "r2", towerId: grown.id, itemId: "tampon-katman" });
  [, payload] = sent.at(-1);
  assert.equal(payload.error, undefined, JSON.stringify(payload));
  const hp = payload.lineKeys.indexOf("preview.stat.maxHp");
  assert.equal(payload.changed[hp], true);
  const after = grown.maxHp * (1 + itemAdd("tampon-katman", "towerHealth"));
  assert.ok(payload.lines[hp].endsWith(after.toFixed(2)), payload.lines[hp]);
});

test("uyumluluk: dayaniklilik esyalari her kuleye ve duvara takiliyor, kaynak binasina degil; kartlar her yapiya isliyor", () => {
  const resource = allTowers.find((tower) => tower.resourceProvider);
  for (const id of ITEM_IDS) {
    for (const towerId of ["warrior-4", "wall-1", "warrior-2"]) {
      assert.equal(canEquipShopItem(item(id), kule(towerId), []).ok, true, `${id} ${towerId}`);
    }
    const rejected = canEquipShopItem(item(id), resource, []);
    assert.equal(rejected.ok, false, `${id} kaynak binasi`);
    assert.equal(rejected.need, "combatStructure");
  }
  for (const id of CARD_IDS) {
    assert.equal(getCardTowerReach(card(id)), "structure", id);
    assert.equal(cardReachesTower(card(id), kule("wall-1")), true, `${id} duvar`);
    assert.equal(cardReachesTower(card(id), resource), true, `${id} kaynak binasi`);
  }
});
