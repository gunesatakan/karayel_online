/**
 * Hedefli kart hangi yapiya takilabilir.
 *
 * Hedefli kartlarin hepsi savas istatistigi: hasar, atis hizi, isabet, donus
 * hizi, menzil, hedef kilitleme. Hicbiri hic ates etmeyen bir yapida bir sey
 * yapmaz. Duvar "kule sec" listesinde durdugu surece oyuncu kartini bir
 * hicligin uzerine harciyor -- ve kart kuleye kalici bagli, geri alinmiyor.
 *
 * Olcut "duvar mi" degil "vurusu var mi". Testler bu ikisini birden tutuyor:
 * ates etmeyen hicbir yapi listede olmamali, ama ates eden hicbir kule de
 * kuralin altinda kalmamali -- ikincisi olmadan kural sessizce her seyi
 * eleyebilirdi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canTowerHoldTargetedCard,
  cardCatalog,
  towerCatalog,
  wallTower
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

const HEDEFLI_KARTLAR = cardCatalog.filter((card) => card.scope.kind === "targeted");

function benzersizKuleler() {
  const gorulen = new Map();
  for (const list of Object.values(towerCatalog)) for (const tower of list) gorulen.set(tower.id, tower);
  return [...gorulen.values()];
}

test("hedefli kart havuzu bos degil", () => {
  // Havuz boşalirsa asagidaki testler sessizce hicbir sey sinamaz olurdu.
  assert.ok(HEDEFLI_KARTLAR.length >= 5, `hedefli kart sayisi dustu: ${HEDEFLI_KARTLAR.length}`);
});

test("duvar hedefli kart tasiyamaz", () => {
  assert.equal(canTowerHoldTargetedCard(wallTower), false);
});

test("ates etmeyen her yapi eleniyor, ates eden her kule geciyor", () => {
  for (const tower of benzersizKuleler()) {
    const atesEder = tower.hitType !== "none";
    assert.equal(
      canTowerHoldTargetedCard(tower),
      atesEder && !tower.resourceProvider,
      `${tower.id} (${tower.name}) yanlis tarafta`
    );
  }
  // Kural her seyi elemis olmasin: sahada gercekten kart alabilen kule kalmali.
  const gecen = benzersizKuleler().filter((tower) => canTowerHoldTargetedCard(tower));
  assert.ok(gecen.length > 20, `kural fazla genis: yalnizca ${gecen.length} kule kart alabiliyor`);
});

test("sunucu duvara takilan hedefli karti reddediyor", () => {
  const room = createRoom("zeynep");
  room.broadcast = () => {};
  const kart = HEDEFLI_KARTLAR[0];

  const spot = findBuildableSpot(room, "wall-1");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "wall-1" });
  const duvar = [...room.towers.values()].at(-1);
  assert.equal(duvar.definition.id, "wall-1", "duvar kurulmadi");

  const gelenler = [];
  const dinleyen = { sessionId: "p1", send: (tip, veri) => gelenler.push([tip, veri]) };
  room.pendingCardChoices = new Map([["p1", [kart]]]);
  room.chooseCard(dinleyen, { cardId: kart.id, towerId: duvar.id });

  assert.deepEqual(duvar.targetedCardIds, [], "kart duvara islenmis");
  assert.deepEqual(duvar.runModifiers, [], "kartin etkileri duvara yazilmis");
  assert.ok(gelenler.some(([tip]) => tip === "card:rejected"), "red bildirimi gitmedi");
  assert.ok(gelenler.some(([tip]) => tip === "card:choices"), "secim ekrani geri verilmedi");
  assert.equal(room.pendingCardChoices.get("p1")?.length, 1, "kart secimi tuketilmis");
});

test("ayni kart normal kuleye isliyor", () => {
  // Kontrol: red kurali her hedefi degil yalnizca ates etmeyenleri kesiyor.
  const room = createRoom("zeynep");
  room.broadcast = () => {};
  const kart = HEDEFLI_KARTLAR[0];

  const spot = findBuildableSpot(room, "zeynep-1");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "zeynep-1" });
  const kule = [...room.towers.values()].at(-1);

  room.pendingCardChoices = new Map([["p1", [kart]]]);
  room.chooseCard(client, { cardId: kart.id, towerId: kule.id });

  assert.deepEqual(kule.targetedCardIds, [kart.id]);
  assert.equal(kule.runModifiers.length, kart.effects.length);
});

test("hedefli kartlarin hicbiri duvarda kabul edilmiyor", () => {
  // Tek kartla degil hepsiyle: yeni bir hedefli kart eklendiginde bu test onu
  // da kapsasin.
  for (const kart of HEDEFLI_KARTLAR) {
    const room = createRoom("zeynep");
    room.broadcast = () => {};
    const spot = findBuildableSpot(room, "wall-1");
    room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "wall-1" });
    const duvar = [...room.towers.values()].at(-1);
    room.pendingCardChoices = new Map([["p1", [kart]]]);
    room.chooseCard(client, { cardId: kart.id, towerId: duvar.id });
    assert.deepEqual(duvar.targetedCardIds, [], `${kart.id} duvara islenmis`);
  }
});
