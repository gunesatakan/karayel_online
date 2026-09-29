/**
 * Kart secimi, kartin oyuncunun hangi kulelerine isleyecegini soyluyor.
 *
 * Kart ekrani bir donem yalnizca kapsam etiketini gosteriyordu ve etiket
 * cogu kartta yanlisti; secimden sonra da hicbir geri bildirim yoktu.
 * Simdi ekran "N kulene etki eder" diyor, sunucu secimden sonra etkilenen
 * kuleleri istemciye bildiriyor ve ikisi ayni fonksiyondan okuyor.
 *
 * Testlerin tuttugu sozler:
 *   1. Kuleye dokunmayan kart (altin, isci, beceri) hicbir kuleyi saymiyor.
 *   2. Yalnizca vuruslu kulede is goren kart duvari ve binayi saymiyor; can
 *      ve enkaz kartlari sayiyor.
 *   3. Erisim, sunucunun kart dagitma kuralinin disina hic cikmiyor.
 *   4. Secim mesaji ayni kuralla kurulmus kule listesini tasiyor.
 *   5. Can kartlari kurulum ve yaratici yeniden kurulumla ayni sonucu
 *      veriyor: bonuslar toplaniyor, secim sirasi fark etmiyor, etiketli can
 *      karti yalnizca bildirdigi yapilarin canini buyutuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  REPAIR_DEPOT_TOWER_ID,
  cardCatalog,
  cardReachesTower,
  getCardTowerReach,
  ownedCardAppliesToTower,
  towerCatalog,
  wallTower
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function kart(id) {
  const card = cardCatalog.find((entry) => entry.id === id);
  assert.ok(card, `${id} katalogda yok`);
  return card;
}

function kule(id) {
  for (const list of Object.values(towerCatalog)) {
    const tower = list.find((entry) => entry.id === id);
    if (tower) return tower;
  }
  assert.fail(`${id} kule katalogunda yok`);
}

function benzersizKuleler() {
  const gorulen = new Map();
  for (const list of Object.values(towerCatalog)) for (const tower of list) gorulen.set(tower.id, tower);
  return [...gorulen.values()];
}

const SAVAS_KULESI = kule("warrior-1");
const KAYNAK_BINASI = kule("warrior-7");
const TAMIR_MERKEZI = kule(REPAIR_DEPOT_TOWER_ID);

test("kuleye dokunmayan genel kart hicbir kuleyi saymiyor", () => {
  // Altin, isci, beceri ve magaza kartlari kuleye degil oyuncuya isliyor.
  // Onarim bedeli kule basina cozuluyor ama kulenin yaptigi bir seyi
  // degistirmiyor, o da burada.
  for (const id of ["ganimet-payi", "zirhli-tulum", "genis-arama", "nexus-tamiri", "tamir-takimi", "sarj-devresi", "ek-yuva-plani"]) {
    const card = kart(id);
    assert.equal(getCardTowerReach(card), "none", `${id} kuleye dokunuyor sayildi`);
    for (const tower of benzersizKuleler()) {
      assert.equal(cardReachesTower(card, tower), false, `${id} ${tower.id} kulesini sayiyor`);
    }
  }
});

test("hasar karti vurusu olmayan yapiyi saymiyor, can ve enkaz karti sayiyor", () => {
  const hasar = kart("namlu-asinmasi");
  assert.equal(getCardTowerReach(hasar), "combat");
  assert.equal(cardReachesTower(hasar, SAVAS_KULESI), true);
  // Sunucu genel kartin modifier'ini duvara da yaziyor ama duvar ates
  // etmedigi icin "etki eder" demek yanlis olurdu.
  assert.equal(cardReachesTower(hasar, wallTower), false);
  assert.equal(cardReachesTower(hasar, TAMIR_MERKEZI), false);
  assert.equal(cardReachesTower(hasar, KAYNAK_BINASI), false);

  // Muhimmat dusurme kilidi ("Yagmaci") oyuncu uzerinden degil, dusmani
  // olduren kulenin uzerinden isliyor; yani kuleye dokunan bir kart.
  assert.equal(getCardTowerReach(kart("yagmaci")), "combat");

  for (const id of ["kalin-zirh", "enkaz-tuzagi"]) {
    const card = kart(id);
    assert.equal(getCardTowerReach(card), "structure", `${id} yapiya dokunmuyor sayildi`);
    assert.equal(cardReachesTower(card, wallTower), true, `${id} duvari saymiyor`);
    assert.equal(cardReachesTower(card, TAMIR_MERKEZI), true, `${id} tamir merkezini saymiyor`);
    // Genel can karti secilince sunucu kaynak binasinin canini da
    // olcekliyor; sayim da onu sayiyor.
    assert.equal(cardReachesTower(card, KAYNAK_BINASI), true, `${id} kaynak binasini saymiyor`);
  }
});

test("etiketli kart yalnizca suzgecine uyan kuleyi sayiyor", () => {
  const mermi = kart("avci-gozu");
  assert.equal(cardReachesTower(mermi, SAVAS_KULESI), SAVAS_KULESI.hitType === "projectile");
  assert.equal(cardReachesTower(mermi, wallTower), false);

  // Dairesel can karti duvara da isliyor (duvar `circle`), kaynak binasina
  // islemiyor: etiketli kapsam kaynak binalarini her zaman disarida birakiyor.
  const daire = kart("yuvarlak-temel");
  assert.equal(cardReachesTower(daire, wallTower), true);
  assert.equal(cardReachesTower(daire, KAYNAK_BINASI), false);
});

test("erisim sunucunun kart dagitma kuralinin disina cikmiyor", () => {
  // Sayim yalnizca kuralin isletip hicbir sey degistirmedigi yapiyi eler;
  // kuralin isletmedigi bir yapiyi saymasi ekranin yalan soylemesi olurdu.
  for (const card of cardCatalog) {
    for (const tower of benzersizKuleler()) {
      if (!cardReachesTower(card, tower)) continue;
      assert.equal(ownedCardAppliesToTower(card, tower), true, `${card.id} ${tower.id} kulesini kural disinda sayiyor`);
    }
  }
});

test("hedefli ve etiketli kartlarin hepsi kuleye dokunuyor", () => {
  // Kuleleri suzen ama hicbir kulede bir sey degistirmeyen kart bir celiski;
  // cikarsa ya stat tablosu ya da kart yanlistir.
  for (const card of cardCatalog.filter((entry) => entry.scope.kind !== "global")) {
    assert.notEqual(getCardTowerReach(card), "none", `${card.id} kuleye dokunmuyor sayildi`);
  }
  // Hedefli kart desteden sayilmiyor: kuleyi oyuncu seciyor.
  const hedefli = kart("kalibre-artisi");
  for (const tower of benzersizKuleler()) assert.equal(cardReachesTower(hedefli, tower), false);
});

test("kart secimi etkilenen kuleleri istemciye bildiriyor", () => {
  const sent = [];
  const client = { sessionId: "p1", send(type, message) { sent.push({ type, message }); } };
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const ids = {};
  for (const definitionId of ["warrior-1", "warrior-7", REPAIR_DEPOT_TOWER_ID]) {
    const spot = findBuildableSpot(room, definitionId);
    assert.ok(spot, `${definitionId} icin kare bulunamadi`);
    room.placeTower(client, { ...spot, definitionId }, { free: true, ignoreLimit: true });
    ids[definitionId] = [...room.towers.values()].at(-1).id;
  }

  const sec = (cardId, towerId) => {
    sent.length = 0;
    room.pendingCardChoices.set("p1", [kart(cardId)]);
    room.chooseCard(client, towerId ? { cardId, towerId } : { cardId });
    const applied = sent.find((entry) => entry.type === "card:applied");
    assert.ok(applied, `${cardId} icin card:applied gelmedi`);
    assert.equal(applied.message.cardId, cardId);
    return [...applied.message.towerIds].sort();
  };

  assert.deepEqual(sec("namlu-asinmasi"), [ids["warrior-1"]]);
  assert.deepEqual(sec("kalin-zirh"), [ids["warrior-1"], ids["warrior-7"], ids[REPAIR_DEPOT_TOWER_ID]].sort());
  assert.deepEqual(sec("ganimet-payi"), []);
  // Hedefli kartta liste yalnizca secilen kule.
  assert.deepEqual(sec("kalibre-artisi", ids["warrior-1"]), [ids["warrior-1"]]);
});

/** Kuleleri kurulmus oda ve kart secen yardimci; `card:applied` listesini dondurur. */
function canOdasi(definitionIds) {
  const sent = [];
  const client = { sessionId: "p1", send(type, message) { sent.push({ type, message }); } };
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const towers = definitionIds.map((definitionId) => {
    const spot = findBuildableSpot(room, definitionId);
    assert.ok(spot, `${definitionId} icin kare bulunamadi`);
    room.placeTower(client, { ...spot, definitionId }, { free: true, ignoreLimit: true });
    return [...room.towers.values()].at(-1);
  });
  const sec = (cardId, towerId) => {
    sent.length = 0;
    room.pendingCardChoices.set("p1", [kart(cardId)]);
    room.chooseCard(client, towerId ? { cardId, towerId } : { cardId });
    const applied = sent.find((entry) => entry.type === "card:applied");
    assert.ok(applied, `${cardId} icin card:applied gelmedi`);
    return applied.message.towerIds;
  };
  return { room, towers, sec, client };
}

test("can kartlarinin sonucu secim sirasina bagli degil ve yeniden kurulumla ayni", () => {
  // Zirhli Govde +%180 kulede, Kalin Zirh +%80 oyuncuda: toplam x3.6. Genel
  // kart bir donem oyuncu carpaninin oranini kulenin tamamina uyguluyordu ve
  // Zirhli Govde'den sonra alinan Kalin Zirh x5.04 veriyordu.
  const sonuclar = [];
  for (const sira of [["zirhli-govde", "kalin-zirh"], ["kalin-zirh", "zirhli-govde"]]) {
    const { room, towers: [tower], sec } = canOdasi(["warrior-1"]);
    const taban = tower.maxHp;
    tower.hp = taban / 2;
    for (const cardId of sira) sec(cardId, kart(cardId).scope.kind === "targeted" ? tower.id : undefined);
    assert.ok(Math.abs(tower.maxHp / taban - 3.6) < 1e-9, `${sira.join(" > ")}: x${(tower.maxHp / taban).toFixed(3)}, beklenen x3.6`);
    assert.ok(Math.abs(tower.hp / tower.maxHp - 0.5) < 1e-9, "hasar orani korunmadi");
    const secilen = tower.maxHp;
    room.rebuildCreativeLoadout("p1");
    assert.ok(Math.abs(tower.maxHp - secilen) < 1e-9, `yeniden kurulum ${tower.maxHp}, secim ${secilen}`);
    sonuclar.push(secilen);
  }
  assert.ok(Math.abs(sonuclar[0] - sonuclar[1]) < 1e-9);

  // Yigilan genel kart da toplaniyor: Zirhli Govde + 3 Kalin Zirh = x5.2.
  const { room, towers: [tower], sec } = canOdasi(["warrior-1"]);
  const taban = tower.maxHp;
  sec("zirhli-govde", tower.id);
  for (let index = 0; index < 3; index += 1) sec("kalin-zirh");
  assert.ok(Math.abs(tower.maxHp / taban - 5.2) < 1e-9, `x${(tower.maxHp / taban).toFixed(3)}, beklenen x5.2`);
  room.rebuildCreativeLoadout("p1");
  assert.ok(Math.abs(tower.maxHp / taban - 5.2) < 1e-9, "yeniden kurulum ayni sonucu vermedi");
});

test("etiketli can karti yalnizca bildirdigi yapilarin canini buyutuyor", () => {
  // Yuvarlak Temel "Dairesel yapilarin cani": duvar (circle) evet, tek hedefli
  // Takipci hayir. Bir donem ikisinin de cani buyuyor, bildirim ise yalnizca
  // duvari sayiyordu.
  const { room, towers: [takipci, duvar], sec, client } = canOdasi(["warrior-1", wallTower.id]);
  const takipciTaban = takipci.maxHp;
  const duvarTaban = duvar.maxHp;
  const bildirilen = sec("yuvarlak-temel");
  assert.deepEqual(bildirilen, [duvar.id]);
  assert.equal(takipci.maxHp, takipciTaban, "dairesel olmayan kulenin cani buyudu");
  assert.ok(Math.abs(duvar.maxHp / duvarTaban - 1.6) < 1e-9, `duvar x${(duvar.maxHp / duvarTaban).toFixed(3)}, beklenen x1.6`);
  const degisen = [takipci, duvar].filter((tower, index) => tower.maxHp !== [takipciTaban, duvarTaban][index]).map((tower) => tower.id);
  assert.deepEqual(degisen, bildirilen, "cani degisen yapilar bildirilenlerle ayni degil");

  // Karttan sonra kurulan dairesel olmayan kule de bonus almiyor.
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...spot, definitionId: "warrior-1" }, { free: true, ignoreLimit: true });
  const yeni = [...room.towers.values()].at(-1);
  assert.equal(yeni.maxHp, takipciTaban);

  room.rebuildCreativeLoadout("p1");
  assert.equal(takipci.maxHp, takipciTaban, "yeniden kurulum dairesel olmayan kuleye bonus verdi");
  assert.ok(Math.abs(duvar.maxHp / duvarTaban - 1.6) < 1e-9, "yeniden kurulum duvarin bonusunu dusurdu");

  // Genel can karti ise her yapiyi, kaynak binasini da buyutmeye devam ediyor.
  const genel = canOdasi(["warrior-1", "warrior-7"]);
  const tabanlar = genel.towers.map((tower) => tower.maxHp);
  genel.sec("kalin-zirh");
  genel.towers.forEach((tower, index) => {
    assert.ok(Math.abs(tower.maxHp / tabanlar[index] - 1.8) < 1e-9, `${tower.definition.id} x${(tower.maxHp / tabanlar[index]).toFixed(3)}`);
  });
});
