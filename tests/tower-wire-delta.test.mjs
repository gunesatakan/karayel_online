/**
 * Kule ve dusman kayitlari telde delta olarak gidiyor.
 *
 * Olculdu: bir kule kaydinin 375 baytinin 286'si kareler arasinda hic
 * degismiyor -- menzil, can tavani, muhimmat tavani, hedefleme kipi, performans
 * kolu. 40 kulelik bir sahada saniyede 20 kez tekrarlandiginda bu, istemci
 * basina 223 KB/sn saf tekrar demekti. 2 kisilik odada 9-10. dalgadan sonra
 * telefonun isinmasi ve pingin firlamasi buradan geliyordu; sunucunun tik
 * suresi ayni sahnede 0,15 ms, yani darbogaz hicbir zaman islemci degildi.
 *
 * Testlerin tuttugu iki soz var ve ikincisi birincisinden onemli:
 *   1. Delta gercekten kucultuyor.
 *   2. Delta zincirini birlestiren istemci **tam kaydin aynisini** elde ediyor.
 * Ikincisi bozulursa oyun sessizce yanlis veriyle oynanir -- eksik alan hata
 * vermez, yalnizca eski degeri ekranda birakir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeDynamicEnemySnapshots, mergeDynamicTowerSnapshots } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const TICK = 16;

function ikiKisilikOda(kulePerOyuncu = 10) {
  const room = createRoom("warrior");
  const p1 = room.state.players.get("p1");
  room.state.players.set("p2", { ...p1, id: "p2", runModifiers: [], ownedCardIds: [], ownedShopItemIds: [], inventoryItemIds: [], hiredWorkers: [] });
  room.clients = [
    { sessionId: "p1", ref: { bufferedAmount: 0 }, send() {} },
    { sessionId: "p2", ref: { bufferedAmount: 0 }, send() {} }
  ];
  room.broadcast = () => {};
  room.wave = 12;
  room.waveTarget = room.getScaledWaveEnemyCount(12);
  for (const owner of ["p1", "p2"]) {
    for (let i = 0; i < kulePerOyuncu; i += 1) {
      const spot = findBuildableSpot(room, "warrior-1");
      if (!spot) break;
      room.placeTower({ sessionId: owner }, { x: spot.x, y: spot.y, definitionId: "warrior-1" }, { free: true, ignoreLimit: true });
    }
  }
  for (const tower of room.towers.values()) {
    tower.ammo = tower.maxAmmo;
    tower.energy = tower.maxEnergy;
    tower.level = 6;
  }
  return room;
}

/**
 * Odayi surer ve **gercekten gonderilen** kareleri toplar.
 *
 * Deltayi testin icinde yeniden uygulamak yanlis olurdu: `update` zaten
 * gonderim yolunu kosuyor ve tabani ilerletiyor, ustune bir kez daha
 * uygulamak zinciri ikiye katlardi. Olculmesi gereken sey telden gecen sey.
 */
function kareleriTopla(room, kare = 60) {
  const gonderilen = [];
  const tamlar = [];
  for (const client of room.clients) {
    client.send = (tip, veri) => {
      if (tip === "snapshot" && client === room.clients[0]) gonderilen.push(JSON.parse(JSON.stringify(veri)));
    };
  }

  // Iki saat birden sahteleniyor.
  //
  // Gonderim araligi `performance.now()` okuyor, oyun saati ise `Date.now()`.
  // Yalnizca birini ilerletmek testi sessizce degersiz kiliyordu: dongu
  // gercek zamanda milisaniyeler surdugu icin 240 tikte tek bir kare
  // gonderiliyor ve delta zinciri hic sinanmiyordu.
  const gercekNow = Date.now;
  const gercekPerf = performance.now;
  let simdi = gercekNow();
  Date.now = () => simdi;
  performance.now = () => simdi;
  try {
    for (let i = 0; i < kare; i += 1) {
      simdi += TICK;
      for (const tower of room.towers.values()) {
        tower.ammo = tower.maxAmmo;
        tower.energy = tower.maxEnergy;
        tower.temperature = 0;
        tower.heatLocked = false;
      }
      const oncekiSayi = gonderilen.length;
      room.update(TICK);
      // Bu tikte gercekten bir kare gittiyse, ayni durumun tam hali de
      // kaydediliyor: `getSnapshot` yan etkisiz oldugu icin ikisi ayni veri.
      if (gonderilen.length > oncekiSayi) {
        tamlar.push(JSON.parse(JSON.stringify(room.getSnapshot())));
      }
    }
  } finally {
    Date.now = gercekNow;
    performance.now = gercekPerf;
  }
  return { gonderilen, tamlar };
}

const bayt = (v) => Buffer.byteLength(JSON.stringify(v), "utf8");

test("delta zinciri birlestirilince tam kaydin aynisi cikiyor", () => {
  const room = ikiKisilikOda();
  const { gonderilen, tamlar } = kareleriTopla(room, 240);

  const onbellek = new Map();
  for (let i = 0; i < gonderilen.length; i += 1) {
    const birlesmis = mergeDynamicTowerSnapshots(onbellek, gonderilen[i].towers);
    assert.equal(birlesmis.length, tamlar[i].towers.length, `${i}. karede kule sayisi tutmuyor`);
    for (let k = 0; k < birlesmis.length; k += 1) {
      assert.deepEqual(
        birlesmis[k],
        tamlar[i].towers[k],
        `${i}. kare, ${tamlar[i].towers[k].id}: birlesmis kayit tam kayitla ayni degil`
      );
    }
  }
});

test("dusman delta zinciri de tam kaydin aynisini veriyor", () => {
  // 18. dalgada dusmanlar telin ucte ikisi. Kaydin 132 baytinin 50'si sabit
  // (kimlik, zirh, lanet yuku, suphe yigini); gerisi her karede degisiyor.
  // Kazanc kuleninki kadar buyuk degil ama en buyuk tek kalemden kesiliyor.
  const room = ikiKisilikOda();
  room.setupPhase = false;
  for (let i = 0; i < 25; i += 1) room.spawnEnemy();
  const { gonderilen, tamlar } = kareleriTopla(room, 240);

  const onbellek = new Map();
  let dusmanGorulen = 0;
  for (let i = 0; i < gonderilen.length; i += 1) {
    const birlesmis = mergeDynamicEnemySnapshots(onbellek, gonderilen[i].enemies);
    assert.equal(birlesmis.length, tamlar[i].enemies.length, `${i}. karede dusman sayisi tutmuyor`);
    for (let k = 0; k < birlesmis.length; k += 1) {
      assert.deepEqual(
        birlesmis[k],
        tamlar[i].enemies[k],
        `${i}. kare, ${tamlar[i].enemies[k].id}: birlesmis dusman kaydi tam kayitla ayni degil`
      );
    }
    dusmanGorulen += birlesmis.length;
  }
  assert.ok(dusmanGorulen > 100, `yeterince dusman kaydi sinanmadi: ${dusmanGorulen}`);
});

test("dusman bolumu de kuculuyor", () => {
  const room = ikiKisilikOda();
  room.setupPhase = false;
  for (let i = 0; i < 25; i += 1) room.spawnEnemy();
  const { gonderilen, tamlar } = kareleriTopla(room, 240);

  const sonrakiler = gonderilen.slice(1);
  const deltaOrt = sonrakiler.reduce((s, k) => s + bayt(k.enemies), 0) / sonrakiler.length;
  const tamOrt = tamlar.slice(1).reduce((s, k) => s + bayt(k.enemies), 0) / sonrakiler.length;
  assert.ok(deltaOrt < tamOrt * 0.8, `dusman bolumu kuculmedi: ${Math.round(deltaOrt)} / ${Math.round(tamOrt)} bayt`);
});

test("ilk kare tam, sonraki kareler belirgin sekilde kucuk", () => {
  const room = ikiKisilikOda();
  const { gonderilen, tamlar } = kareleriTopla(room, 240);

  assert.deepEqual(gonderilen[0].towers, tamlar[0].towers, "ilk kare tam gitmeliydi");

  const sonrakiler = gonderilen.slice(1);
  const deltaOrt = sonrakiler.reduce((s, k) => s + bayt(k.towers), 0) / sonrakiler.length;
  const tamOrt = tamlar.slice(1).reduce((s, k) => s + bayt(k.towers), 0) / sonrakiler.length;
  assert.ok(sonrakiler.length > 10, `yeterince kare gonderilmedi: ${sonrakiler.length}`);
  assert.ok(deltaOrt < tamOrt * 0.4, `kule bolumu yeterince kuculmedi: ${Math.round(deltaOrt)} / ${Math.round(tamOrt)} bayt`);
});

test("her kule her karede listede kaliyor", () => {
  // Dizi ayni zamanda hangi kulelerin hayatta oldugunu soyluyor: hic degismemis
  // bir kule listeden duserse istemci onu yikilmis sanar.
  const room = ikiKisilikOda();
  const { gonderilen, tamlar } = kareleriTopla(room, 120);
  for (let i = 0; i < gonderilen.length; i += 1) {
    assert.equal(gonderilen[i].towers.length, tamlar[i].towers.length, `${i}. karede kule listeden dustu`);
    for (const tower of gonderilen[i].towers) {
      assert.ok(tower.id, `${i}. karede kimliksiz kule kaydi var`);
    }
  }
});

test("tikanan istemci sonrasinda bir sonraki kare tam gidiyor", () => {
  const room = ikiKisilikOda(4);
  kareleriTopla(room, 40);

  // Ikinci istemcinin kuyrugu dolu: bu kareyi kaciriyor.
  room.clients[1].ref.bufferedAmount = 10_000_000;
  room.sendSnapshotWithBackpressure(room.getSnapshot());
  room.clients[1].ref.bufferedAmount = 0;

  const tam = JSON.parse(JSON.stringify(room.getSnapshot()));
  const { wire } = room.applyWireDelta(tam);
  assert.deepEqual(wire.towers, tam.towers, "atlanan istemciden sonra kule kaydi tam gitmedi");
  assert.deepEqual(wire.enemies, tam.enemies, "atlanan istemciden sonra dusman kaydi tam gitmedi");
});

test("tam kayit istegi tabani sifirliyor", () => {
  const room = ikiKisilikOda(4);
  kareleriTopla(room, 40);

  room.markTowerWireStale();
  const tam = JSON.parse(JSON.stringify(room.getSnapshot()));
  const { wire } = room.applyWireDelta(tam);
  assert.deepEqual(wire.towers, tam.towers);
  assert.deepEqual(wire.enemies, tam.enemies);
});

test("gonderilmeyen kare tabani ilerletmiyor", () => {
  // En ince hata burada olurdu: taban gonderilmemis bir kareye kayarsa istemci
  // hicbir zaman gormedigi bir kaydin uzerine delta alir ve bir daha
  // toparlanamaz.
  const room = ikiKisilikOda(4);
  kareleriTopla(room, 40);

  const oncekiTam = JSON.parse(JSON.stringify(room.getSnapshot()));
  // Delta uretiliyor ama commit edilmiyor: gonderim basarisiz sayiliyor.
  room.applyWireDelta(oncekiTam);
  for (const tower of room.towers.values()) tower.level += 1;

  const yeniTam = JSON.parse(JSON.stringify(room.getSnapshot()));
  const { wire } = room.applyWireDelta(yeniTam);
  const seviyeTasiyan = wire.towers.filter((tower) => tower.level !== undefined);
  assert.equal(seviyeTasiyan.length, wire.towers.length, "seviye degisikligi kayboldu");
});
