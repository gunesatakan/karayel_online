/**
 * Kurulum arasinda kurulan kulenin geri alinmasi.
 *
 * Dalga arasi bir plan kurma ani: oyuncu kule birakiyor, dizilime bakiyor,
 * fikrini degistiriyor. Yanlis kareye birakilan bir kulenin bedeli yarim altin
 * olmamali. Ama karar dalga baslayinca baglaniyor -- o andan sonra satis, alimi
 * geri almak degil, kayipla elden cikarmak.
 *
 * Testlerin tuttugu uc soz:
 *   1. Ayni arada kurulan kule tam bedeliyle geri doner ve kasa basa bas kalir.
 *   2. Onceki aradan kalan kule muaftir; dalga baslamis kule de oyle.
 *   3. Geri alim bir altin makinesi degildir -- iade carpani ona islemez.
 * Ucuncusu digerlerinden onemli: islemiş olsaydi "Hurda Pazari" ile kur-sat
 * dongusu her turda bedelin yarisi kadar altin basardi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canRefundTowerPurchase,
  getTowerBuildCost,
  getTowerSellRefund
} from "../packages/shared/dist/index.js";
import { createFullStaticSnapshot } from "../apps/server/dist/snapshot/static-data.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId = "warrior-1", options) {
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId }, options);
  return [...room.towers.values()].at(-1);
}

/**
 * Dalgayi gercek yoldan bitirip bir sonraki kurulum arasini acar.
 *
 * Sayaci elle artirmak testi degersiz kilardi: sinanan sey tam da sayacin
 * dogru yerde arttigi. Bu yuzden odanin kendi dalga kapanis yolu suruluyor.
 */
function dalgayiBitirVeYeniAraAc(room) {
  room.setupPhase = false;
  room.setupReadyPlayerIds.clear();
  room.enemies.clear();
  room.waveSpawned = room.waveTarget;
  room.waveClearedAt = 0;

  const gercekNow = Date.now;
  let simdi = gercekNow();
  Date.now = () => simdi;
  try {
    room.updateSpawning(16); // temizlendi damgasi
    simdi += 3000;           // WAVE_CLEAR_PAUSE_MS gecti
    room.updateSpawning(16); // yeni kurulum arasi
  } finally {
    Date.now = gercekNow;
  }
  assert.equal(room.setupPhase, true, "yeni kurulum arasi acilmadi");
}

test("ayni kurulum arasinda kurulan kule tam bedeliyle geri doner", () => {
  const room = oda();
  room.setupPhase = true;
  const oncekiAltin = room.state.players.get("p1").gold;
  const oncekiHarcama = room.state.players.get("p1").goldSpent;
  const oncekiKule = room.state.players.get("p1").towersBuilt;

  const tower = kur(room);
  const bedel = getTowerBuildCost(tower.definition.cost);
  assert.equal(tower.buildGold, bedel);
  assert.equal(room.state.players.get("p1").gold, oncekiAltin - bedel);

  room.sellTower(client, { towerId: tower.id });

  const player = room.state.players.get("p1");
  assert.equal(player.gold, oncekiAltin, "geri alim odenen bedeli tam iade etmedi");
  assert.equal(player.goldSpent, oncekiHarcama, "harcama sayaci geri alinmadi");
  assert.equal(player.towersBuilt, oncekiKule, "kule sayaci geri alinmadi");
  assert.equal(room.towers.size, 0);
});

test("dalga basladiginda geri alim biter, satis yarim bedele doner", () => {
  const room = oda();
  room.setupPhase = true;
  const tower = kur(room);
  const bedel = getTowerBuildCost(tower.definition.cost);

  // Kurulum kapaniyor: oyuncu hazir diyor ve odanin kendi kapanis yolu isliyor.
  room.setupReadyPlayerIds.add("p1");
  room.state.players.get("p1").connected = true;
  room.tryFinishSetupPhase();
  assert.equal(room.setupPhase, false, "kurulum kapanmadi");

  const oncekiAltin = room.state.players.get("p1").gold;
  room.sellTower(client, { towerId: tower.id });
  const iade = room.state.players.get("p1").gold - oncekiAltin;
  assert.equal(iade, getTowerSellRefund(tower.definition.cost, tower.level, tower.definition.id));
  assert.ok(iade < bedel, `dalga sirasinda tam bedel geri dondu: ${iade}/${bedel}`);
});

test("onceki aradan kalan kule yeni arada muaf", () => {
  // Kullanicinin adiyla koydugu kural: "onceki kurulum adimindan yapilmis
  // olanlar bundan muaftir."
  const room = oda();
  room.setupPhase = true;
  const eski = kur(room);

  dalgayiBitirVeYeniAraAc(room);

  const yeni = kur(room);
  assert.notEqual(eski.builtInSetupSession, yeni.builtInSetupSession, "iki kule ayni araya yazilmis");

  const player = room.state.players.get("p1");
  const oncekiAltin = player.gold;
  room.sellTower(client, { towerId: eski.id });
  const eskininIadesi = player.gold - oncekiAltin;
  assert.equal(
    eskininIadesi,
    getTowerSellRefund(eski.definition.cost, eski.level, eski.definition.id),
    "onceki aranin kulesi tam bedelle geri donmus"
  );

  const araAltin = player.gold;
  room.sellTower(client, { towerId: yeni.id });
  assert.equal(
    player.gold - araAltin,
    getTowerBuildCost(yeni.definition.cost),
    "bu aranin kulesi tam bedelle geri donmedi"
  );
});

test("dalga sirasinda kurulan kule sonraki kurulumda geri alinamaz", () => {
  // En sinsi kacamak burada olurdu: kurulum bayragi yerine yalnizca "su an
  // kurulumdayiz" bakilsaydi, dalga ortasinda kurulan kule dalga bitince
  // bedava geri alinabilir hale gelirdi.
  const room = oda();
  room.setupPhase = false;
  const tower = kur(room);
  assert.equal(tower.builtInSetupSession, undefined, "dalga sirasindaki kule araya yazilmis");

  dalgayiBitirVeYeniAraAc(room);

  const player = room.state.players.get("p1");
  const oncekiAltin = player.gold;
  room.sellTower(client, { towerId: tower.id });
  assert.equal(
    player.gold - oncekiAltin,
    getTowerSellRefund(tower.definition.cost, tower.level, tower.definition.id)
  );
});

test("iade carpani geri alimi buyutmuyor", () => {
  // Hurda Pazari satis iadesini %50 artiriyor. Geri alima da isleseydi kule
  // kurup satmak bedelin %150'sini doldururdu: sinirsiz altin.
  const room = oda();
  room.setupPhase = true;
  const player = room.state.players.get("p1");
  player.runModifiers = [{ source: "card:hurda-pazari", scope: "player", stat: "sellRefund", add: 0.5 }];

  const oncekiAltin = player.gold;
  const tower = kur(room);
  room.sellTower(client, { towerId: tower.id });

  assert.equal(player.gold, oncekiAltin, "geri alim altin bastı");
});

test("bedava kurulan kule sifir iade eder", () => {
  // Yaratici modda kule bedava kuruluyor; iade tureterek hesaplansaydi hic
  // odenmemis altin geri odenirdi.
  const room = oda();
  room.setupPhase = true;
  const player = room.state.players.get("p1");
  const tower = kur(room, "warrior-1", { free: true, ignoreLimit: true });
  assert.equal(tower.buildGold, 0);

  const oncekiAltin = player.gold;
  room.sellTower(client, { towerId: tower.id });
  assert.equal(player.gold, oncekiAltin, "bedava kule altin iade etti");
});

test("kurulum arasi bilgisi olmayan kule esitlikten gecmiyor", () => {
  // `undefined === undefined` dogru olurdu; kural bunu ayrica eliyor. Yoksa
  // hicbir araya yazilmamis bir kule, sayaci olmayan bir karede geri
  // alinabilir gorunurdu.
  assert.equal(canRefundTowerPurchase({}, true, undefined), false);
  assert.equal(canRefundTowerPurchase({ builtInSetupSession: 3 }, true, 3), true);
  assert.equal(canRefundTowerPurchase({ builtInSetupSession: 3 }, true, 4), false);
  assert.equal(canRefundTowerPurchase({ builtInSetupSession: 3 }, false, 3), false);
});

test("kurulum oturumu ve bedel statik kayitla istemciye gidiyor", () => {
  // Istemci dugmede \"Geri Al\" mi \"Sat\" mi yazacagina bu iki alanla karar
  // veriyor; dusmeleri halinde arayuz sunucudan baska bir sey soylerdi.
  const room = oda();
  room.setupPhase = true;
  const tower = kur(room);
  const statik = createFullStaticSnapshot([], room.towers.values(), room.activeMap)
    .towers.find((entry) => entry.id === tower.id);
  assert.equal(statik.buildGold, tower.buildGold);
  assert.equal(statik.builtInSetupSession, tower.builtInSetupSession);
  const snapshot = room.getSnapshot();
  assert.equal(snapshot.setupSession, room.setupSession);
  assert.equal(snapshot.setupPhase, true);
});
