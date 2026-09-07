/**
 * Duvar kural duzeyinde kule degildir.
 *
 * Duvar depolamada bir kule varyanti -- yerlestirme, can, hasar, onarim ve
 * satis hatti oldugu gibi calissin diye. Ama kurallarin dilinde kule degil:
 * ates etmez, hedef almaz, komsuluk kurmaz, bir kulenin yalnizligini bozmaz.
 *
 * Somut sikayet Izolasyon Kulesi'ydi: onune cekilen bir duvar hatti kulenin
 * kendi yetenegini kapatiyordu. Ama kural tek yerde degil; testler ayni olcutu
 * uc yerde birden tutuyor -- yalnizlik, komsuluk ve sempati agi. Ucu de "bir
 * kare otede kule var mi" sorusunun farkli yuzleri.
 *
 * Her testin bir de kontrolu var: gercek bir kule konuldugunda kuralin hala
 * isledigi. Onlar olmadan "duvari yok say" duzeltmesi sessizce "her seyi yok
 * say"a donusebilirdi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  countsAsTower,
  getMapGridSize,
  towerCatalog,
  wallTower,
  worldToGrid
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId, x, y) {
  const nokta = x === undefined ? findBuildableSpot(room, definitionId) : { x, y };
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId });
  return [...room.towers.values()].at(-1);
}

/** Kulenin bitisigine duvar orer ve gercekten bitisik oldugunu dogrular. */
function bitisikDuvar(room, tower) {
  const gridSize = getMapGridSize(room.activeMap);
  const towerCell = worldToGrid(tower.x, tower.y, room.activeMap);
  for (const [dx, dy] of [[gridSize / 2, 0], [-gridSize / 2, 0], [0, gridSize / 2], [0, -gridSize / 2]]) {
    const once = room.towers.size;
    room.placeTower(client, { x: tower.x + dx, y: tower.y + dy, definitionId: "wall-1" });
    if (room.towers.size === once) continue;
    const duvar = [...room.towers.values()].at(-1);
    const duvarCell = worldToGrid(duvar.x, duvar.y, room.activeMap);
    // Duvarin gercekten yalnizlik penceresinin icinde oldugunu dogruluyoruz;
    // aksi halde test hicbir sey sinamadan gecerdi.
    if (Math.abs(duvarCell.col - towerCell.col) <= 1 && Math.abs(duvarCell.row - towerCell.row) <= 1) return duvar;
    room.towers.delete(duvar.id);
  }
  return undefined;
}

test("duvar kule sayilmiyor, geri kalan her yapi sayiliyor", () => {
  assert.equal(countsAsTower(wallTower), false);
  const gorulen = new Map();
  for (const list of Object.values(towerCatalog)) for (const tower of list) gorulen.set(tower.id, tower);
  const sayilanlar = [...gorulen.values()].filter((tower) => countsAsTower(tower));
  assert.equal(sayilanlar.length, gorulen.size - 1, "duvardan baskasi da elenmis");
  // Abarti kenara oturuyor ama gercek bir kule: kontenjan kurali ile yalnizlik
  // kurali ayni sey degil.
  assert.equal(countsAsTower(gorulen.get("zeynep-8")), true, "Abarti kule sayilmiyor");
});

test("bitisikteki duvar izolasyonu bozmuyor", () => {
  const room = oda("warrior");
  const kule = kur(room, "warrior-3");
  assert.equal(room.isTowerIsolated(kule), true, "kule bastan yalniz degil");

  const duvar = bitisikDuvar(room, kule);
  assert.ok(duvar, "bitisige duvar orulemedi");
  assert.equal(room.isTowerIsolated(kule), true, "duvar izolasyonu bozdu");
});

test("bitisikteki gercek kule izolasyonu bozuyor", () => {
  // Kontrol: kural hala calisiyor, duzeltme onu tumden kapatmadi.
  const room = oda("warrior");
  const kule = kur(room, "warrior-3");
  const gridSize = getMapGridSize(room.activeMap);
  let komsu;
  for (const [dx, dy] of [[gridSize, 0], [-gridSize, 0], [0, gridSize], [0, -gridSize]]) {
    const once = room.towers.size;
    room.placeTower(client, { x: kule.x + dx, y: kule.y + dy, definitionId: "warrior-1" });
    if (room.towers.size > once) { komsu = [...room.towers.values()].at(-1); break; }
  }
  assert.ok(komsu, "bitisige kule kurulamadi");
  assert.equal(room.isTowerIsolated(kule), false, "bitisik kule izolasyonu bozmadi");
});

test("izolasyon aurasi duvar bitisikken de calisiyor", () => {
  // Oyuncunun gordugu sey bu: kural degil, kulenin yavaslatmasinin acik kalmasi.
  const room = oda("warrior");
  const kule = kur(room, "warrior-3");
  const izoleAura = (t) => room.getActiveTowerAuras(t).filter((aura) => aura.activation === "isolated");
  assert.equal(izoleAura(kule).length, 1, "kule bastan izole aurasini tasimiyor");

  assert.ok(bitisikDuvar(room, kule), "bitisige duvar orulemedi");
  assert.equal(izoleAura(kule).length, 1, "duvar izolasyon aurasini kapatti");
});

test("duvar komsuluk bonusuna sayilmiyor", () => {
  // "Bitisik Devre" komsu basina %8 hasar veriyor. Duvar sayilsaydi 10
  // altinlik cizgilerle kuleyi cevrelemek tam bonusu bedavaya verirdi.
  const room = oda("warrior");
  const kule = kur(room, "warrior-1");
  assert.equal(room.countAdjacentFriendlyTowers(kule), 0);

  assert.ok(bitisikDuvar(room, kule), "bitisige duvar orulemedi");
  assert.equal(room.countAdjacentFriendlyTowers(kule), 0, "duvar komsu sayildi");
});

test("sempati agi duvari bagin ucu yapmiyor", () => {
  const room = oda("onur");
  const a = kur(room, "onur-1");
  const b = kur(room, "onur-1");
  assert.notEqual(a.id, b.id, "iki ayri kule kurulamadi");
  const duvar = bitisikDuvar(room, a);
  assert.ok(duvar, "bitisige duvar orulemedi");

  room.startSympathy();
  room.updateSympathy();

  assert.ok(room.sympathyLinks.length > 0, "sempati agi hic kurulmadi");
  for (const link of room.sympathyLinks) {
    assert.ok(!link.id.includes(duvar.id), `duvar bagin ucu olmus: ${link.id}`);
  }
});
