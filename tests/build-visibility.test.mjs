/**
 * Kurulus gorunur olmali: secilen kartlar tele cikiyor.
 *
 * Kartlar bir donem yalnizca sunucuda duruyordu. Oyuncu secim ekranindan
 * sonra ne sectigini, hangi kartin hangi kuleye bagli oldugunu ve bir kuleye
 * gercekte neyin isledigini hicbir yerde goremiyordu; yaratici mod disinda
 * kart kimligi tasiyan tek bir mesaj yoktu.
 *
 * Testlerin tuttugu sozler:
 *   1. Genel ve hedefli kart secilince oyuncu kaydinda, hedefli kart ayrica
 *      kulenin kaydinda gorunuyor; kartsiz kayit alani hic tasimiyor.
 *   2. Kule kayitlari delta ile gidiyor; eklenen kart deltada, sokulen son
 *      kart `null` olarak gidiyor ve tam yeniden gonderim onu tasiyor.
 *   3. Sunucunun motor cozumlemesi deste kuralini (`ownedCardAppliesToTower`)
 *      kullaniyor. "Bu kuleye etki edenler" listesi bunun alt kumesi olan
 *      `cardReachesTower`'i okuyor (card-reach testi); liste kuralin
 *      isletmedigi bir karti hicbir zaman gostermiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cardAppliesToTower,
  cardCatalog,
  mergeDynamicTowerSnapshots,
  ownedCardAppliesToTower,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const GENEL = "namlu-asinmasi";
const HEDEFLI = "kalibre-artisi";

function kart(id) {
  const card = cardCatalog.find((entry) => entry.id === id);
  assert.ok(card, `${id} katalogda yok`);
  return card;
}

function kuleliOda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const spot = findBuildableSpot(room, "warrior-1");
  assert.ok(spot, "kule icin kare bulunamadi");
  room.placeTower(client, { ...spot, definitionId: "warrior-1" }, { free: true, ignoreLimit: true });
  const tower = [...room.towers.values()].at(-1);
  return { room, tower };
}

function sec(room, cardId, towerId) {
  room.pendingCardChoices.set("p1", [kart(cardId)]);
  room.chooseCard(client, towerId ? { cardId, towerId } : { cardId });
  assert.equal(room.pendingCardChoices.has("p1"), false, `${cardId} secimi islenmedi`);
}

const oyuncuKaydi = (room) => JSON.parse(JSON.stringify(room.getSnapshot())).players.find((player) => player.id === "p1");
const kuleKaydi = (room, towerId) => JSON.parse(JSON.stringify(room.getSnapshot())).towers.find((tower) => tower.id === towerId);

test("kart secilmeden oyuncu ve kule kaydi kart alani tasimiyor", () => {
  // Oyuncu kaydi her karede tam gidiyor; kartsiz oyuncuya bos dizi yazmak
  // her karede bosuna bayt demek.
  const { room, tower } = kuleliOda();
  assert.equal("ownedCardIds" in oyuncuKaydi(room), false);
  assert.equal("targetedCardIds" in kuleKaydi(room, tower.id), false);
});

test("genel ve hedefli kart secilince oyuncu ve kule kaydinda gorunuyor", () => {
  const { room, tower } = kuleliOda();

  sec(room, GENEL);
  assert.deepEqual(oyuncuKaydi(room).ownedCardIds, [GENEL]);
  assert.equal("targetedCardIds" in kuleKaydi(room, tower.id), false, "genel kart kuleye yazilmis");

  sec(room, HEDEFLI, tower.id);
  assert.deepEqual(kuleKaydi(room, tower.id).targetedCardIds, [HEDEFLI]);
  // Sunucu hedefli karti oyuncuya da yaziyor; envanter listesi onu da gostermeli.
  assert.deepEqual(oyuncuKaydi(room).ownedCardIds, [GENEL, HEDEFLI]);

  // Yigilan kart her alimda bir kez yazilir: arayuz sayiyi buradan cikariyor.
  sec(room, GENEL);
  sec(room, HEDEFLI, tower.id);
  assert.deepEqual(oyuncuKaydi(room).ownedCardIds, [GENEL, HEDEFLI, GENEL, HEDEFLI]);
  assert.deepEqual(kuleKaydi(room, tower.id).targetedCardIds, [HEDEFLI, HEDEFLI]);
});

test("hedefli kart kule deltasinda gidiyor, sokulunce null gidiyor", () => {
  const { room, tower } = kuleliOda();
  room.creativeMode = true;
  const onbellek = new Map();
  const gonder = () => {
    const { wire, towerBaseline, enemyBaseline } = room.applyWireDelta(room.getSnapshot());
    room.commitWireBaseline(towerBaseline, enemyBaseline);
    // Tel gibi: JSON'dan gecince `undefined` alanlar dusuyor.
    const kayitlar = JSON.parse(JSON.stringify(wire.towers));
    mergeDynamicTowerSnapshots(onbellek, kayitlar);
    return kayitlar.find((entry) => entry.id === tower.id);
  };

  gonder();
  assert.equal(gonder().targetedCardIds, undefined, "degismeyen alan deltada tekrar gitti");

  sec(room, HEDEFLI, tower.id);
  assert.deepEqual(gonder().targetedCardIds, [HEDEFLI], "eklenen kart deltada yok");
  assert.deepEqual(onbellek.get(tower.id).targetedCardIds, [HEDEFLI]);
  assert.equal(gonder().targetedCardIds, undefined, "degismeyen liste her karede tekrar gitti");

  // Tam yeniden gonderim (yeniden baglanma, `snapshot:requestFull`) listeyi tasiyor.
  room.markTowerWireStale();
  assert.deepEqual(gonder().targetedCardIds, [HEDEFLI], "tam kayit hedefli karti tasimiyor");

  // Yaratici mod son karti sokunca alan istemcide asili kalmamali.
  room.creativeToggleCard(client, { cardId: HEDEFLI, towerId: tower.id, on: false });
  assert.deepEqual(tower.targetedCardIds, []);
  assert.equal(gonder().targetedCardIds, null, "sokulen son kart null olarak gitmedi");
  assert.equal("targetedCardIds" in onbellek.get(tower.id), false, "istemcide eski liste kaldi");
});

test("deste kurali: hedefli kart sayilmaz, genel kart her yapiya, etiketli uyana isler", () => {
  const kuleler = [...new Map(Object.values(towerCatalog).flat().map((tower) => [tower.id, tower])).values()];
  const kaynakBinasi = kuleler.find((tower) => tower.resourceProvider);
  assert.ok(kaynakBinasi, "katalogda kaynak binasi yok");

  for (const card of cardCatalog) {
    for (const tower of kuleler) {
      const beklenen = card.scope.kind === "targeted"
        ? false
        : card.scope.kind === "global" || cardAppliesToTower(card, tower);
      assert.equal(ownedCardAppliesToTower(card, tower), beklenen, `${card.id} / ${tower.id}`);
    }
  }
  // Genel kart kaynak binasina da isler: sunucu genel kartin modifier ve
  // motor eklerini kapsama bakmadan dagitiyor.
  assert.equal(ownedCardAppliesToTower(kart(GENEL), kaynakBinasi), true);
  assert.equal(ownedCardAppliesToTower(kart(HEDEFLI), towerCatalog.warrior[0]), false);
  const etiketli = cardCatalog.find((card) => card.scope.kind === "tagged" && kuleler.some((tower) => !cardAppliesToTower(card, tower)));
  assert.ok(etiketli, "uymayan kulesi olan etiketli kart yok");
});

test("sunucu motoru ayni kuralla cozuyor: etiketli kart yalnizca uyan kuleye isliyor", () => {
  // Ateşleyici yalnizca ates hasarli kulelere uyuyor: Atakan'da warrior-5
  // uyuyor, warrior-1 uymuyor. Motor `ownedCardAppliesToTower` okuyor;
  // arayuzun listesi onun alt kumesi `cardReachesTower`, yani motorun
  // islemedigi bir karti hicbir zaman gostermiyor.
  const card = kart("atesleyici");
  const [unlock] = card.unlocks;
  const uyan = towerCatalog.warrior.find((tower) => tower.id === "warrior-5");
  const uymayan = towerCatalog.warrior.find((tower) => tower.id === "warrior-1");
  assert.equal(ownedCardAppliesToTower(card, uyan), true);
  assert.equal(ownedCardAppliesToTower(card, uymayan), false);

  const { room, tower: uymayanKule } = kuleliOda();
  const spot = findBuildableSpot(room, "warrior-5");
  assert.ok(spot, "warrior-5 icin kare bulunamadi");
  room.placeTower(client, { ...spot, definitionId: "warrior-5" }, { free: true, ignoreLimit: true });
  const uyanKule = [...room.towers.values()].at(-1);
  assert.equal(uyanKule.definition.id, "warrior-5");

  sec(room, card.id);
  assert.equal(room.towerHasUnlock(uyanKule, unlock), true, "kart uyan kuleye islemedi");
  assert.equal(room.towerHasUnlock(uymayanKule, unlock), false, "kart uymayan kuleye islendi");
});
