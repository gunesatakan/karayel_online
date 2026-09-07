/**
 * Yaratici mod: bedava kule, serbest seviye, kart ve esya anahtarlari.
 *
 * En kritik soz **cikarmanin gercekten geri aldigi**. Normal oyunda kart ve
 * esya yalnizca ekleniyor: modifier listeye itiliyor, can farki o anki degere
 * oranlaniyor. Yaratici modda ikisi de geri alinabilmeli ve oranla buyutulmus
 * bir can, oran geri bolununce ayni sayiya donmuyor. Bu yuzden sunucu sayisal
 * katmani her degisiklikte kimlik listelerinden sifirdan kuruyor; asagidaki
 * testler o kurulusun kapali devre oldugunu tutuyor.
 *
 * Ikinci soz kapiyla ilgili: bayrak kapaliyken ya da odada birden fazla oyuncu
 * varken hicbir komut is yapmamali. Bedava kule koyabilen bir istemci, normal
 * bir maca sizarsa oyunu bitirir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FINAL_WAVE,
  PLAYER_TOWER_LIMIT,
  cardCatalog,
  isGlobalShopItem,
  shopCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function yaraticiOda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.creativeMode = true;
  return room;
}

/** Bir kule kurar ve dondurur; yaratici komutlarin cogu bir kule istiyor. */
function kuleKur(room, definitionId = "warrior-1", free = true) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin kare bulunamadi`);
  room.placeTower(client, { ...spot, definitionId }, free ? { free: true, ignoreLimit: true } : {});
  return [...room.towers.values()].at(-1);
}

test("kapi kapaliyken hicbir yaratici komut is yapmaz", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-1");
  const altinOnce = room.state.players.get("p1").gold;

  room.creativePlaceTower(client, { ...spot, definitionId: "warrior-1" });
  room.creativeSetWave(client, { wave: 15 });
  room.creativeSpawnEnemies(client, { count: 5 });
  room.creativeToggleCard(client, { cardId: "kalin-zirh", on: true });

  assert.equal(room.towers.size, 0, "kule kuruldu");
  assert.equal(room.wave, 1, "dalga degisti");
  assert.equal(room.enemies.size, 0, "dusman gonderildi");
  assert.equal(room.state.players.get("p1").ownedCardIds.length, 0, "kart eklendi");
  assert.equal(room.state.players.get("p1").gold, altinOnce);
});

test("odada ikinci oyuncu varken yaratici komutlar kapanir", () => {
  const room = yaraticiOda();
  const p1 = room.state.players.get("p1");
  room.state.players.set("p2", { ...p1, id: "p2" });

  room.creativeToggleCard(client, { cardId: "kalin-zirh", on: true });
  room.creativeSetWave(client, { wave: 12 });

  assert.equal(p1.ownedCardIds.length, 0);
  assert.equal(room.wave, 1);
});

test("yaratici kule bedava ve kontenjansiz kurulur", () => {
  const room = yaraticiOda();
  const player = room.state.players.get("p1");
  player.gold = 0;

  const spot = findBuildableSpot(room, "warrior-1");
  room.creativePlaceTower(client, { ...spot, definitionId: "warrior-1" });

  assert.equal(room.towers.size, 1, "sifir altinla kule kurulamadi");
  assert.equal(player.gold, 0, "altin harcandi");
  assert.equal(player.goldSpent, 0, "harcama sayacina yazildi");
});

test("kontenjan yalnizca yaratici yolda asilir", () => {
  const room = yaraticiOda();
  for (let index = 0; index < PLAYER_TOWER_LIMIT + 3; index += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    if (!spot) break;
    room.creativePlaceTower(client, { ...spot, definitionId: "warrior-1" });
  }
  assert.ok(room.towers.size > PLAYER_TOWER_LIMIT, `kontenjan asilamadi: ${room.towers.size}`);

  // Normal yol hala kapali: ayni odada bedelsiz olmayan bir istek reddedilmeli.
  const oncekiSayi = room.towers.size;
  const spot = findBuildableSpot(room, "warrior-1");
  if (spot) room.placeTower(client, { ...spot, definitionId: "warrior-1" });
  assert.equal(room.towers.size, oncekiSayi, "normal yol kontenjani deldi");
});

test("seviye bedelsiz ve dogrudan yazilir", () => {
  const room = yaraticiOda();
  const tower = kuleKur(room);
  const player = room.state.players.get("p1");
  player.gold = 0;
  player.experience = 0;

  room.creativeSetTowerLevel(client, { towerId: tower.id, level: 10 });

  assert.equal(tower.level, 10);
  assert.equal(player.gold, 0, "altin harcandi");
  assert.equal(player.experience, 0, "tecrube harcandi");
});

test("seviye 1 ile 10 arasina kirpilir", () => {
  const room = yaraticiOda();
  const tower = kuleKur(room);

  room.creativeSetTowerLevel(client, { towerId: tower.id, level: 99 });
  assert.equal(tower.level, 10);
  room.creativeSetTowerLevel(client, { towerId: tower.id, level: -4 });
  assert.equal(tower.level, 1);
});

test("kart eklenip cikarilinca can tavani basladigi sayiya doner", () => {
  const room = yaraticiOda();
  const tower = kuleKur(room);
  const baslangic = tower.maxHp;
  const kart = cardCatalog.find(({ id }) => id === "kalin-zirh");
  const canArtisi = kart.effects.find(({ stat }) => stat === "towerHealth").add;

  room.creativeToggleCard(client, { cardId: kart.id, on: true });
  assert.ok(
    Math.abs(tower.maxHp - baslangic * (1 + canArtisi)) < 1e-9,
    `kart eklenince can ${tower.maxHp}, beklenen ${baslangic * (1 + canArtisi)}`
  );

  room.creativeToggleCard(client, { cardId: kart.id, on: false });
  assert.ok(Math.abs(tower.maxHp - baslangic) < 1e-9, `kart cikinca can ${tower.maxHp}, beklenen ${baslangic}`);
  assert.equal(room.state.players.get("p1").ownedCardIds.length, 0);
  assert.equal(room.state.players.get("p1").runModifiers.length, 0, "modifier listesinde artik kaldi");
});

test("hasarli kulenin can orani kart degisiminde korunur", () => {
  const room = yaraticiOda();
  const tower = kuleKur(room);
  tower.hp = tower.maxHp * 0.5;

  room.creativeToggleCard(client, { cardId: "kalin-zirh", on: true });
  assert.ok(Math.abs(tower.hp / tower.maxHp - 0.5) < 1e-9, "can orani kaydi");

  room.creativeToggleCard(client, { cardId: "kalin-zirh", on: false });
  assert.ok(Math.abs(tower.hp / tower.maxHp - 0.5) < 1e-9, "can orani kaydi");
});

test("yigilabilir kart tavanina kadar eklenir, otesine gecmez", () => {
  const room = yaraticiOda();
  const player = room.state.players.get("p1");
  const kart = cardCatalog.find((card) => card.stackable && card.maxStacks === 2 && card.scope.kind === "global");
  assert.ok(kart, "iki yigilabilen kuresel kart bulunamadi");

  for (let index = 0; index < 5; index += 1) {
    room.creativeToggleCard(client, { cardId: kart.id, on: true });
  }
  assert.equal(player.ownedCardIds.filter((id) => id === kart.id).length, 2);
});

test("hedefli kart kuleye yazilir ve geri alinir", () => {
  const room = yaraticiOda();
  const tower = kuleKur(room);
  const kart = cardCatalog.find((card) => card.scope.kind === "targeted");

  room.creativeToggleCard(client, { cardId: kart.id, towerId: tower.id, on: true });
  assert.deepEqual(tower.targetedCardIds, [kart.id]);
  assert.ok(tower.runModifiers.length > 0);

  room.creativeToggleCard(client, { cardId: kart.id, towerId: tower.id, on: false });
  assert.deepEqual(tower.targetedCardIds, []);
  assert.deepEqual(tower.runModifiers, []);
});

test("kart cikarilinca actigi kilit de kapanir", () => {
  const room = yaraticiOda();
  const tower = kuleKur(room);
  const kart = cardCatalog.find((card) => (card.unlocks?.length ?? 0) > 0 && card.scope.kind === "global");
  const kilit = kart.unlocks[0];

  room.creativeToggleCard(client, { cardId: kart.id, on: true });
  assert.equal(room.towerHasUnlock(tower, kilit), true, "kilit acilmadi");

  room.creativeToggleCard(client, { cardId: kart.id, on: false });
  assert.equal(room.towerHasUnlock(tower, kilit), false, "kilit acik kaldi");
});

test("kuresel esya eklenip cikarilir", () => {
  const room = yaraticiOda();
  const player = room.state.players.get("p1");
  // Kuresel olan gerekiyor: kuleye takilanlar ayri yoldan geciyor.
  const esya = shopCatalog.find((item) => isGlobalShopItem(item) && item.effects.length > 0);
  assert.ok(esya, "etkisi olan kuresel esya bulunamadi");

  room.creativeToggleItem(client, { itemId: esya.id, on: true });
  assert.deepEqual(player.ownedShopItemIds, [esya.id]);
  assert.ok(player.runModifiers.length > 0);

  room.creativeToggleItem(client, { itemId: esya.id, on: false });
  assert.deepEqual(player.ownedShopItemIds, []);
  assert.deepEqual(player.runModifiers, []);
});

test("dalga numarasi yazilir ve dusman gucu onunla gelir", () => {
  const room = yaraticiOda();
  room.creativeSetWave(client, { wave: 15 });

  assert.equal(room.wave, 15);
  assert.equal(room.waveSpawned, 0);
  assert.equal(room.waveTarget, room.getScaledWaveEnemyCount(15));

  // Guc dalgadan turedigi icin ayni tur, 1. dalgada belirgin sekilde zayif
  // olmali. Tur rastgele seciliyor, o yuzden karsilastirma tur basina.
  const gucler = (oda) => {
    oda.creativeSpawnEnemies(client, { count: 25 });
    const enIyi = new Map();
    for (const enemy of oda.enemies.values()) {
      enIyi.set(enemy.type, Math.max(enIyi.get(enemy.type) ?? 0, enemy.maxHp));
    }
    return enIyi;
  };
  const birinci = gucler(yaraticiOda());
  const onbesinci = gucler(room);
  let karsilastirilan = 0;
  for (const [tur, guc] of onbesinci) {
    const zayif = birinci.get(tur);
    if (zayif === undefined) continue;
    karsilastirilan += 1;
    assert.ok(guc > zayif * 2, `${tur}: 15. dalga ${guc}, 1. dalga ${zayif}`);
  }
  assert.ok(karsilastirilan > 0, "karsilastirilacak ortak dusman turu cikmadi");
});

test("dalga numarasi 1 ile son dalga arasina kirpilir", () => {
  const room = yaraticiOda();
  room.creativeSetWave(client, { wave: 999 });
  assert.equal(room.wave, FINAL_WAVE);
  room.creativeSetWave(client, { wave: 0 });
  assert.equal(room.wave, 1);
});

test("dusman gonderme kurulum evresinden cikarir ve sayaci buyutur", () => {
  const room = yaraticiOda();
  room.setupPhase = true;
  room.waveTarget = 2;
  room.waveSpawned = 0;

  room.creativeSpawnEnemies(client, { count: 6 });

  assert.equal(room.enemies.size, 6);
  assert.equal(room.setupPhase, false, "kurulum evresi acik kaldi, dusman yurumez");
  assert.equal(room.waveSpawned, 6);
  assert.ok(room.waveTarget >= 6, "hedef sayac gonderilenin altinda kaldi");
});

test("tek komutta gonderilebilecek dusman sayisi sinirli", () => {
  const room = yaraticiOda();
  room.creativeSpawnEnemies(client, { count: 10_000 });
  assert.ok(room.enemies.size <= 40, `sinir asildi: ${room.enemies.size}`);
});
