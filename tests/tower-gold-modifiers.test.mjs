/**
 * Onarim bedeli ve satis iadesi: gorulen sayi ile odenen sayi.
 *
 * Ucuncu ve sonuncu ornegi ayni hatanin: sunucu kart ve esya carpanini hep
 * uyguluyordu, arayuz kendi formulunu yazdigi icin carpansiz sayiyi
 * gosteriyordu. "Kaynak Makinesi" takili bir kule ucuza onariliyor ama dugmede
 * tam bedel yaziyordu; "Hurda Pazari" iadeyi buyutuyor ama satis dugmesi eski
 * sayiyi tutuyordu. Gorulmeyen bir indirim, oyuncu icin olmayan bir indirimdir.
 *
 * Testlerin tuttugu sey uygulanmasi degil **ayni olmasi**: her durumda arayuzun
 * yazacagi sayi ile kasadan gecen sayi bir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cardCatalog,
  getStructureRepairCostWithModifiers,
  getTowerBuildCost,
  getTowerSellRefund,
  resolveTowerRefund
} from "../packages/shared/dist/index.js";
import { createStaticTowerSnapshot } from "../apps/server/dist/snapshot/static-data.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId = "warrior-1") {
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  return [...room.towers.values()].at(-1);
}

/**
 * Kule kaydini **istemcinin gordugu gibi** alir.
 *
 * Statik ve dinamik bolumler ayri gidiyor; istemci ikisini birlestirdikten
 * sonra okuyor. Yalnizca dinamigi almak, kurulum oturumu gibi sabit alanlari
 * gormeden test yazmak olurdu.
 */
function kuleKaydi(room, tower) {
  const dinamik = room.getSnapshot().towers.find((entry) => entry.id === tower.id);
  return { ...createStaticTowerSnapshot(tower), ...dinamik };
}

function kartAl(room, cardId) {
  const kart = cardCatalog.find((card) => card.id === cardId);
  room.pendingCardChoices = new Map([["p1", [kart]]]);
  room.chooseCard(client, { cardId: kart.id });
  return kart;
}

function esyaTak(room, tower, itemId) {
  const player = room.state.players.get("p1");
  player.inventoryItemIds.push(itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} takilamadi`);
}

// ------------------------------------------------------------------ Onarim

test("kaynak makinesi onarimi hem ucuzlatiyor hem dugmede gorunuyor", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  const tower = kur(room);
  esyaTak(room, tower, "kaynak-makinesi");
  tower.hp = tower.maxHp / 2;

  const kayit = kuleKaydi(room, tower);
  assert.equal(Math.round(kayit.repairCostMultiplier * 100) / 100, 0.4, "carpan tele yanlis gitti");

  // Arayuzun dugmeye yazacagi sayi.
  const gorunen = getStructureRepairCostWithModifiers(
    getTowerBuildCost(tower.definition.cost),
    1 - tower.hp / tower.maxHp,
    kayit.repairCostMultiplier
  );
  const carpansiz = getStructureRepairCostWithModifiers(getTowerBuildCost(tower.definition.cost), 0.5);
  assert.ok(gorunen < carpansiz, `indirim gorunmedi: ${gorunen} / ${carpansiz}`);

  const oncekiAltin = player.gold;
  room.repairStructure(client, { towerId: tower.id });
  assert.equal(oncekiAltin - player.gold, gorunen, "tahsil edilen bedel gorunenden farkli");
  assert.equal(tower.hp, tower.maxHp, "kule onarilmadi");
});

test("esya yokken de gorunen ile odenen ayni", () => {
  // Kontrol: carpan yoluna girmek carpansiz durumu bozmamis olmali.
  const room = oda();
  const player = room.state.players.get("p1");
  const tower = kur(room);
  tower.hp = tower.maxHp * 0.25;

  const kayit = kuleKaydi(room, tower);
  assert.equal(kayit.repairCostMultiplier, 1);
  const gorunen = getStructureRepairCostWithModifiers(
    getTowerBuildCost(tower.definition.cost),
    1 - tower.hp / tower.maxHp,
    kayit.repairCostMultiplier
  );

  const oncekiAltin = player.gold;
  room.repairStructure(client, { towerId: tower.id });
  assert.equal(oncekiAltin - player.gold, gorunen);
});

// ------------------------------------------------------------------- Satis

test("hurda pazari iadeyi hem buyutuyor hem dugmede gorunuyor", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  // Dalga ortasi: geri alim yolu kapali, satis yolu acik.
  room.setupPhase = false;
  const tower = kur(room);
  kartAl(room, "hurda-pazari");

  const kayit = kuleKaydi(room, tower);
  assert.equal(Math.round(kayit.sellRefundMultiplier * 100) / 100, 1.5, "carpan tele yanlis gitti");

  const gorunen = resolveTowerRefund(
    { ...kayit, cost: tower.definition.cost, definitionId: tower.definition.id },
    { setupPhase: false, setupSession: room.setupSession, refundMultiplier: kayit.sellRefundMultiplier }
  );
  assert.equal(gorunen.undoable, false);
  assert.ok(
    gorunen.amount > getTowerSellRefund(tower.definition.cost, tower.level, tower.definition.id),
    "iade artisi gorunmedi"
  );

  const oncekiAltin = player.gold;
  room.sellTower(client, { towerId: tower.id });
  assert.equal(player.gold - oncekiAltin, gorunen.amount, "odenen iade gorunenden farkli");
});

test("geri alim carpandan muaf kaliyor ve iki taraf da bunu boyle goruyor", () => {
  // Kurulum arasi geri alimi bir altin makinesine donusturmeyen sey bu.
  // Kural artik tek fonksiyonda oldugu icin arayuzun ayri bir kopyasi yok.
  const room = oda();
  const player = room.state.players.get("p1");
  room.setupPhase = true;
  const tower = kur(room);
  kartAl(room, "hurda-pazari");

  const kayit = kuleKaydi(room, tower);
  const gorunen = resolveTowerRefund(
    { ...kayit, cost: tower.definition.cost, definitionId: tower.definition.id },
    { setupPhase: true, setupSession: room.setupSession, refundMultiplier: kayit.sellRefundMultiplier }
  );
  assert.equal(gorunen.undoable, true);
  assert.equal(gorunen.amount, tower.buildGold, "geri alim carpanla buyumus");

  const oncekiAltin = player.gold;
  room.sellTower(client, { towerId: tower.id });
  assert.equal(player.gold - oncekiAltin, gorunen.amount);
});

// -------------------------------------------------------------------- Tel

test("iki carpan da kule kaydinda hep sayi olarak duruyor", () => {
  // Bazen yazip bazen atlamak, delta ile gonderilen bir kayitta eski degerin
  // istemcide asili kalmasi demek: delta bir alanin silindigini ancak alan
  // kayittan tumuyle cikinca bildirebiliyor.
  const room = oda();
  const tower = kur(room);
  const kayit = kuleKaydi(room, tower);
  assert.equal(typeof kayit.repairCostMultiplier, "number");
  assert.equal(typeof kayit.sellRefundMultiplier, "number");

  esyaTak(room, tower, "kaynak-makinesi");
  const sonra = kuleKaydi(room, tower);
  assert.ok(sonra.repairCostMultiplier < 1, "esya takilinca carpan degismedi");
  assert.equal(typeof sonra.sellRefundMultiplier, "number");
});

test("carpan onbellegi kart ve esya degisiminde tazeleniyor", () => {
  // Carpanlar kule basina onbellekte duruyor; onbellek dogru anda atilmazsa
  // oyuncu karti alir ama sayi eski kalirdi -- duzeltmeye calistigimiz hatanin
  // ta kendisi, bu sefer sunucu tarafinda.
  const room = oda();
  room.setupPhase = false;
  const tower = kur(room);
  assert.equal(kuleKaydi(room, tower).sellRefundMultiplier, 1);

  kartAl(room, "hurda-pazari");
  assert.equal(Math.round(kuleKaydi(room, tower).sellRefundMultiplier * 100) / 100, 1.5);
});
