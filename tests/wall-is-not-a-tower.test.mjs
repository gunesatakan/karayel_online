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

/**
 * Duvarin kule **islemlerine** hic girmemesi.
 *
 * Yukaridakiler "duvar bir kulenin yanindaymis gibi sayilmasin" diyor. Burasi
 * ayni kuralin ikinci ve daha sinsi yuzu: duvarin kendisi bir kuleymis gibi
 * islem gormesin. Olcut her yerde `!resourceProvider` idi ve duvar kaynak
 * binasi olmadigi icin butun kule islemlerini miras aliyordu -- cekmecede bir
 * duvarin altinda performans kolu duruyor, isciler ona hic ates etmeyecegi
 * mühimmati tasiyordu.
 *
 * Her testin kontrolu var: ayni islem gercek bir kulede hala calisiyor. Onlar
 * olmadan "islemi herkese kapat" duzeltmesi de gecerdi.
 */

test("duvarin mühimmat ve enerji deposu yok", () => {
  // Kapasitesi oldugu surece isciler onu bir teslimat hedefi olarak goruyordu.
  const room = oda("warrior");
  const duvar = kur(room, "wall-1");
  assert.equal(duvar.maxAmmo, 0, "duvarin mühimmat deposu var");
  assert.equal(duvar.maxEnergy, 0, "duvarin enerji deposu var");
  assert.equal(duvar.ammo, 0);
  assert.equal(duvar.energy, 0);

  const kule = kur(room, "warrior-1");
  assert.ok(kule.maxAmmo > 0, "kulenin mühimmat deposu kaybolmus");
  assert.ok(kule.maxEnergy > 0, "kulenin enerji deposu kaybolmus");
});

test("boş depolu duvar yine de hiçbir durum yazısına düşmüyor", () => {
  // Sifir enerji "Enerji Yok" diye okunabilirdi. Duvar hicbir sey harcamadigi
  // icin o esikler onu yakalamamali.
  const room = oda("warrior");
  const duvar = kur(room, "wall-1");
  assert.equal(room.getTowerStatus(duvar), "", `duvarin durumu: ${room.getTowerStatus(duvar)}`);
});

test("işçiler duvarı teslimat hedefi saymaz", () => {
  const room = oda("warrior");
  const duvar = kur(room, "wall-1");
  const kule = kur(room, "warrior-1");
  kule.ammo = 0;
  kule.energy = 0;

  assert.equal(room.acceptsTowerOperation(duvar), false, "duvar kule islemine giriyor");
  assert.equal(room.acceptsTowerOperation(kule), true, "kule kule islemine girmiyor");

  // Enerji tasiyicisinin hedef listesi bu olcutten geciyor.
  const enerjiHedefleri = [...room.towers.values()].filter((tower) => (
    tower.ownerId === "p1" && tower.hp > 0 && room.acceptsTowerOperation(tower) && tower.energy < tower.maxEnergy
  ));
  assert.ok(enerjiHedefleri.some((tower) => tower.id === kule.id), "kule enerji hedefi degil");
  assert.ok(!enerjiHedefleri.some((tower) => tower.id === duvar.id), "duvar enerji hedefi olmus");
});

test("duvarda mühimmat akışı, performans, bekleme ve hedefleme yok", () => {
  const room = oda("warrior");
  const duvar = kur(room, "wall-1");
  const kule = kur(room, "warrior-1");

  const akisOncesi = duvar.ammoLogisticsEnabled;
  room.toggleAmmoLogistics(client, { towerId: duvar.id });
  assert.equal(duvar.ammoLogisticsEnabled, akisOncesi, "duvarda mühimmat akisi degisti");
  room.toggleAmmoLogistics(client, { towerId: kule.id });
  assert.notEqual(kule.ammoLogisticsEnabled, akisOncesi, "kulede mühimmat akisi degismedi");

  const performansOncesi = duvar.performance;
  room.setTowerPerformance(client, { towerId: duvar.id, performance: 1 });
  assert.equal(duvar.performance, performansOncesi, "duvarda performans kolu cekildi");
  room.setTowerPerformance(client, { towerId: kule.id, performance: 1 });
  assert.equal(kule.performance, 1, "kulede performans kolu cekilemedi");

  room.setTowerMode(client, { towerId: duvar.id, mode: "standby" });
  assert.equal(duvar.standby, false, "duvar beklemeye alindi");
  room.setTowerMode(client, { towerId: kule.id, mode: "standby" });
  assert.equal(kule.standby, true, "kule beklemeye alinamadi");

  const duvarModu = duvar.targetingMode;
  room.setTowerTargeting(client, { towerId: duvar.id, mode: "strongest" });
  assert.equal(duvar.targetingMode, duvarModu, "duvarin hedefleme modu degisti");
  room.setTowerTargeting(client, { towerId: kule.id, mode: "strongest" });
  assert.equal(kule.targetingMode, "strongest", "kulenin hedefleme modu degismedi");
});
