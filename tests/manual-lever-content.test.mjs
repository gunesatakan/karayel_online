/**
 * Oyuncunun eline verilmis ama hicbir seye baglanmayan anahtarlar.
 *
 * Nexus cani yalnizca harcanabiliyordu, bekleme modunun tek karsiligi dusuk
 * enerjiydi, muhimmat lojistigi anahtarinin iki tarafi arasinda oyunsal bir fark
 * yoktu, kart secimi her zaman uc secenekti ve yenileme fiyati sabitti.
 *
 * Bir anahtarin bir tarafi hicbir sey vermiyorsa o anahtar bir karar degil, bir
 * sustur. Testler odulun **anahtarin dogru tarafinda** durdugunu tutuyor: acik
 * konumda da veren bir odul, anahtari yeniden anlamsiz yapardi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, getShopRerollPrice } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function kur(cardId, definitionId = "warrior-1") {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()][0];
  const player = room.state.players.get("p1");
  if (cardId) {
    const card = cardCatalog.find((candidate) => candidate.id === cardId);
    assert.ok(card, `${cardId} katalogda yok`);
    player.ownedCardIds.push(card.id);
    room.invalidateTowerGrants();
  }
  return { room, tower, player };
}

/** Tek atisin dusmana indirdigi cani olcer. */
function vurus(room, tower) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    hp: 1_000_000, maxHp: 1_000_000, shield: 0, armor: 0, type: "grunt", movementKind: "ground",
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}
  });
  const once = enemy.hp;
  room.damageEnemyFromTower(tower, enemy, 100, 0);
  return once - enemy.hp;
}

test("soguk kalkis yalnizca uyanma penceresinde veriyor", () => {
  const { room, tower } = kur("soguk-kalkis");
  // Beklemede: pencere kapali, cunku uyanma damgasi sifir.
  tower.wakeReadyAt = 0;
  const beklemede = vurus(room, tower);

  tower.wakeReadyAt = Date.now();
  const yeniUyanmis = vurus(room, tower);
  assert.ok(yeniUyanmis > beklemede, `pencere acilmadi: ${beklemede} -> ${yeniUyanmis}`);

  // Pencere gecince odul kalkmali, yoksa bir kez uyanan kule sonsuza kadar
  // bonuslu olurdu.
  tower.wakeReadyAt = Date.now() - 60_000;
  assert.ok(Math.abs(vurus(room, tower) - beklemede) < 1e-6, "pencere kapanmadi");
});

test("kendi kendine yeten yalnizca lojistik kapaliyken veriyor", () => {
  const { room, tower } = kur("kendi-kendine-yeten");
  tower.ammoLogisticsEnabled = true;
  const acik = vurus(room, tower);
  tower.ammoLogisticsEnabled = false;
  const kapali = vurus(room, tower);
  assert.ok(kapali > acik, `anahtarin kapali tarafi odul vermiyor: ${acik} -> ${kapali}`);
});

test("kartsiz oyuncuda iki anahtar da hicbir sey degistirmiyor", () => {
  const { room, tower } = kur(undefined);
  tower.wakeReadyAt = Date.now();
  tower.ammoLogisticsEnabled = false;
  const bonuslu = vurus(room, tower);
  tower.wakeReadyAt = 0;
  tower.ammoLogisticsEnabled = true;
  assert.ok(Math.abs(vurus(room, tower) - bonuslu) < 1e-6, "kart yokken bile fark var");
});

test("nexus tamiri dalga sonunda can yeniliyor", () => {
  const { room, player } = kur("nexus-tamiri");
  room.teamHealth = 50;
  room.setupPhase = true;
  room.setupReadyPlayerIds.add("p1");
  player.connected = true;
  room.tryFinishSetupPhase();
  assert.equal(room.teamHealth, 54);
});

test("nexus tamiri tavani asmiyor", () => {
  const { room, player } = kur("nexus-tamiri");
  room.teamHealth = 99;
  room.setupPhase = true;
  room.setupReadyPlayerIds.add("p1");
  player.connected = true;
  room.tryFinishSetupPhase();
  assert.equal(room.teamHealth, 100);
});

test("genis arama kart secimini dorde cikariyor", () => {
  const { room, player } = kur("genis-arama");
  room.clients = [{ sessionId: "p1", send() {} }];
  room.offerWaveCards();
  assert.equal(room.pendingCardChoices.get("p1")?.length, 4);

  const { room: sade } = kur(undefined);
  sade.clients = [{ sessionId: "p1", send() {} }];
  sade.offerWaveCards();
  assert.equal(sade.pendingCardChoices.get("p1")?.length, 3);
});

test("yenileme bedeli karta bagli", () => {
  const { room, player } = kur("tezgah-iliskisi");
  const card = cardCatalog.find(({ id }) => id === "tezgah-iliskisi");
  player.runModifiers.push(...card.effects);
  player.gold = 1_000_000;
  room.setupPhase = true;
  // Kosum takimi oyuncusu magaza alanlarini tasimiyor; gercek Player tasiyor.
  player.shopRerolls = 0;
  player.shopOffers = [];

  const tam = getShopRerollPrice(player.shopRerolls);
  const oncekiAltin = player.gold;
  room.rerollShop(client);
  const odenen = oncekiAltin - player.gold;
  assert.ok(odenen > 0 && odenen < tam, `yenileme ucuzlamadi: ${odenen} / ${tam}`);
});
