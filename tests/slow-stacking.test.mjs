/**
 * Yavaslatma birlesme modeli (sahibin karari: farkli etkiler ust uste
 * binmeli).
 *
 * - Farkli etkiler carpimla birlesir: hiz = her etki icin (1 - yavaslatma)
 *   carpimi. %40 + %15 -> 0,6 x 0,85 = 0,51; uc farkli %30 -> 0,343.
 * - Ayni etki kendisiyle yiginlanmaz: ayni etkinin (ayni kule tanimi, ayni
 *   kart, ayni esya) en guclu etkin kaydi sayilir, her kayit kendi
 *   suresiyle; zayif yeniden uygulama guclu olani ne ezer ne uzatir.
 * - Birlesik hiz en az 0,1 (yavaslatma en fazla %90). Donma ayri, tam kesme.
 * - Derin Dondurma birlesik hiza bakiyor (<= 0,4): iki-uc orta yavaslatma da
 *   donduruyor. Bu bilerek.
 * - Buz Kirigi kritigi kendi yavaslatmasinin gucunu birlesmeden once
 *   buyutuyor; kritik ve kritiksiz vurus ayni etki, carpilmiyor.
 *
 * Eski model ("en guclu kanal kazanir", `min`) bunun yerini aldi; o modelin
 * testi `slow-strongest-wins.test.mjs` idi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEEP_FREEZE_SPEED_THRESHOLD,
  MIN_SLOWED_SPEED_MULTIPLIER,
  applyTowerStatusEffect,
  cardCatalog,
  combineSlowKinds,
  getActiveStatusKindMagnitudes,
  getActiveStatusMagnitude,
  getIsolationSlowFraction,
  getShopItem,
  getTowerStatusOutcomes,
  isStatusEffectActive,
  noteSlowKind
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} ${actual} != ${expected}`);

const zincirlemeBuz = () => cardCatalog.find((card) => card.id === "zincirleme-buz").grants.statusEffects[0];
const buzSerpintisi = () => getShopItem("buz-serpintisi").grants.statusEffects[0];
const chill = (magnitude, durationMs, effectKey) => ({ type: "chill", magnitude, durationMs, stacking: "strongest", ...(effectKey ? { effectKey } : {}) });

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId = "warrior-1", level) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  if (level !== undefined) tower.level = level;
  return tower;
}

function kartAl(room, cardId, towerId) {
  const kart = cardCatalog.find((card) => card.id === cardId);
  room.pendingCardChoices = new Map([["p1", [kart]]]);
  room.chooseCard(client, { cardId, towerId });
}

function esyaTak(room, tower, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} takilmadi`);
}

/** Kulenin dibinde, direnci ve kalkani olmayan, olmeyecek kadar canli bir dusman. */
function dusmanKoy(room, tower) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.x = tower.x + 8;
  enemy.y = tower.y;
  enemy.hp = enemy.maxHp = 100000;
  enemy.statusResistances = {};
  enemy.shield = 0;
  enemy.maxShield = 0;
  return enemy;
}

/** Bir hareket tiki surer ve o tikte uygulanan birlesik yavaslatma carpanini okur. */
function hiz(room, enemy) {
  room.updateEnemies(0.01);
  return enemy.movementSlowMultiplier;
}

// ------------------------------------------------------------ saf model

test("farkli etkiler carpimla birlesiyor: %40 + %15 -> hiz 0,51", () => {
  let state = applyTowerStatusEffect(undefined, chill(0.4, 2000, "test:a"), { now: 0 });
  state = applyTowerStatusEffect(state, chill(0.15, 2000, "test:b"), { now: 0 });
  close(getActiveStatusMagnitude(state, 100), 1 - 0.6 * 0.85, "birlesik kesir");
  close(getTowerStatusOutcomes({ chill: state }, 100).speedMultiplier, 0.51, "hiz");
  const kinds = getActiveStatusKindMagnitudes(state, 100);
  assert.deepEqual([...kinds.keys()].sort(), ["test:a", "test:b"]);
});

test("uc farkli %30 -> 0,343; tavan hizi 0,1'in altina indirmiyor", () => {
  close(combineSlowKinds([0.7, 0.7, 0.7]), 0.343);
  close(combineSlowKinds([0.6, 0.85]), 0.51);
  assert.equal(combineSlowKinds([]), 1);
  assert.equal(combineSlowKinds([1, 1]), 1);
  assert.equal(MIN_SLOWED_SPEED_MULTIPLIER, 0.1);
  close(combineSlowKinds([0.2, 0.2, 0.2]), 0.1, "tavan");
  close(combineSlowKinds([0.1, 0.5]), 0.1, "tavan");
  // Soguk icinde de: cok sayida farkli guclu soguk %90'da duruyor.
  let state;
  for (const key of ["a", "b", "c", "d"]) state = applyTowerStatusEffect(state, chill(0.6, 1000, key), { now: 0 });
  close(getTowerStatusOutcomes({ chill: state }, 1).speedMultiplier, 0.1);
});

test("ayni etki kendisiyle yiginlanmiyor: en guclusu sayiliyor", () => {
  const kinds = new Map();
  noteSlowKind(kinds, "tower:warrior-3", 0.7);
  noteSlowKind(kinds, "tower:warrior-3", 0.7);
  noteSlowKind(kinds, "tower:warrior-3", 0.9);
  noteSlowKind(kinds, "kin", 1); // yavaslatmayan kayit yazilmiyor
  assert.deepEqual([...kinds], [["tower:warrior-3", 0.7]]);
  close(combineSlowKinds(kinds.values()), 0.7);

  // Ayni anahtarli soguk iki kez (ayni kart iki kuleden): %30, %51 degil.
  let state = applyTowerStatusEffect(undefined, chill(0.3, 1000, "card:x"), { now: 0 });
  state = applyTowerStatusEffect(state, chill(0.3, 1000, "card:x"), { now: 10 });
  close(getActiveStatusMagnitude(state, 20), 0.3);
  assert.equal(state.levels.length, 1, "ayni guc ayri kayit acti");
  assert.equal(state.levels[0].expiresAt, 1010, "ayni guc yalnizca suresini uzatir");
});

test("zayif yeniden uygulama guclu olani ne eziyor ne uzatiyor; her kayit kendi suresiyle", () => {
  let state = applyTowerStatusEffect(undefined, chill(0.4, 1000, "card:x"), { now: 0 });
  state = applyTowerStatusEffect(state, chill(0.15, 2000, "card:x"), { now: 500 });
  close(getActiveStatusMagnitude(state, 600), 0.4, "guclu olan etkinken");
  close(getActiveStatusMagnitude(state, 1200), 0.15, "guclu bitince zayif kendi suresiyle");
  assert.equal(getActiveStatusMagnitude(state, 2600), 0, "ikisi de bitti");
  assert.equal(isStatusEffectActive(state, 2499), true);
  assert.equal(isStatusEffectActive(state, 2500), false);

  // Ters sira: kisa ve guclu, uzun ve zayifin suresini devralmiyor.
  let ters = applyTowerStatusEffect(undefined, chill(0.15, 3000, "card:x"), { now: 0 });
  ters = applyTowerStatusEffect(ters, chill(0.4, 500, "card:x"), { now: 100 });
  close(getActiveStatusMagnitude(ters, 300), 0.4);
  close(getActiveStatusMagnitude(ters, 700), 0.15, "guclu olan kendi suresinde bitti");

  // Daha guclu ve daha uzun suren kayit ayni etkinin zayifini gereksiz kilar,
  // ama baska bir etkinin kaydina dokunmuyor.
  let golge = applyTowerStatusEffect(undefined, chill(0.2, 1000, "card:x"), { now: 0 });
  golge = applyTowerStatusEffect(golge, chill(0.1, 1000, "card:y"), { now: 0 });
  golge = applyTowerStatusEffect(golge, chill(0.5, 5000, "card:x"), { now: 0 });
  assert.deepEqual(golge.levels.map((level) => [level.kind, level.magnitude]), [["card:x", 0.5], ["card:y", 0.1]]);
});

test("farkli etkilerin suresi de ayri: biri bitince oteki tek basina kaliyor", () => {
  let state = applyTowerStatusEffect(undefined, chill(0.4, 1000, "card:x"), { now: 0 });
  state = applyTowerStatusEffect(state, chill(0.15, 3000, "card:y"), { now: 0 });
  close(getActiveStatusMagnitude(state, 500), 0.49);
  close(getActiveStatusMagnitude(state, 1500), 0.15);
  assert.equal(getActiveStatusMagnitude(state, 3000), 0);
});

test("butun soguk kaynaklari strongest ve kendi etki anahtariyla", () => {
  assert.equal(zincirlemeBuz().stacking, "strongest");
  assert.equal(buzSerpintisi().stacking, "strongest");
  assert.equal(zincirlemeBuz().effectKey, "card:zincirleme-buz");
  assert.equal(buzSerpintisi().effectKey, "item:buz-serpintisi");
  for (const card of cardCatalog) {
    for (const effect of card.grants?.statusEffects ?? []) {
      if (effect.type !== "chill") continue;
      assert.equal(effect.stacking, "strongest", card.id);
      assert.ok(effect.effectKey, `${card.id}: etki anahtari yok`);
    }
  }
});

// ------------------------------------------------------------ gercek oda

test("oda: %40 vurus yavaslatmasi + %15 Zincirleme Buz -> hiz 0,51", () => {
  const room = oda();
  const tower = kur(room);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();
  room.addEnemySlowFloor(enemy, 0.6, now + 4000, tower.id, now);
  room.applyEnemyStatusEffect(enemy, zincirlemeBuz(), now + 1);
  close(hiz(room, enemy), 0.51);
});

test("oda: ayni tanimdan iki Izolasyon eklenmiyor; baska bir etki carpiliyor", () => {
  const room = oda();
  const birinci = kur(room, "warrior-3", 6);
  const ikinci = kur(room, "warrior-3", 6);
  const enemy = dusmanKoy(room, birinci);
  const kesir = getIsolationSlowFraction(6);
  const slowMs = birinci.definition.engine.statusEffects.find((effect) => effect.type === "slow").durationMs;
  room.damageEnemyFromTower(birinci, enemy, 0, slowMs);
  room.damageEnemyFromTower(ikinci, enemy, 0, slowMs);
  close(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 1 - kesir, "iki Izolasyon toplandi");
  close(hiz(room, enemy), 1 - kesir, "hareket");

  // Isci mermisinin duz %52'si farkli etki: carpiliyor.
  const now = Date.now();
  room.extendFlatSlow(enemy, now + 3000, now, "worker:slowShots");
  close(room.getEnemySlowSpeedMultiplier(enemy, now), (1 - kesir) * 0.48, "farkli etki carpilmadi");
});

test("oda: ayni kart sogugu bircok kuleden eklenmiyor", () => {
  const room = oda();
  kartAl(room, "zincirleme-buz");
  const a = kur(room);
  const b = kur(room, "warrior-4");
  const enemy = dusmanKoy(room, a);
  room.damageEnemyFromTower(a, enemy, 1, 0);
  room.damageEnemyFromTower(b, enemy, 1, 0);
  close(getActiveStatusMagnitude(enemy.statusEffects.chill, Date.now()), 0.15, "iki kulenin ayni sogugu toplandi");
  close(hiz(room, enemy), 0.85);
});

test("oda: Buz Serpintisi ve Zincirleme Buz ayni kulede farkli etki, carpiliyor", () => {
  const room = oda();
  const serpintili = kur(room);
  esyaTak(room, serpintili, "buz-serpintisi");
  kartAl(room, "zincirleme-buz");
  const yalnizKart = kur(room, "warrior-4");
  const enemy = dusmanKoy(room, serpintili);

  room.damageEnemyFromTower(serpintili, enemy, 1, 0);
  close(getActiveStatusMagnitude(enemy.statusEffects.chill, Date.now()), 1 - 0.8 * 0.85, "iki soguk da uygulanmadi");
  // Yalnizca karti olan kule ayni %15'i yeniden uyguluyor: degisiklik yok.
  room.damageEnemyFromTower(yalnizKart, enemy, 1, 0);
  close(hiz(room, enemy), 0.68);
});

test("oda: tavan -- cok sayida farkli guclu yavaslatma hizi 0,1'de tutuyor, donma ayri", () => {
  const room = oda();
  const tower = kur(room);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();
  room.addEnemySlowFloor(enemy, 0.22, now + 4000, tower.id, now);
  room.extendFlatSlow(enemy, now + 4000, now, "worker:slowShots");
  room.applyEnemyStatusEffect(enemy, chill(0.6, 4000, "card:test"), now);
  enemy.coolantSlowUntil = now + 4000;
  enemy.coolantSlowMultiplier = 0.4;
  close(hiz(room, enemy), MIN_SLOWED_SPEED_MULTIPLIER);
  // Donma tabana tabi degil: tam kesme.
  room.applyEnemyStatusEffect(enemy, { type: "freeze", magnitude: 1, durationMs: 3000, stacking: "refresh" }, Date.now());
  assert.equal(hiz(room, enemy), 0);
});

test("oda: yavaslatmalar kayit basina kendi suresinde bitiyor", () => {
  const room = oda();
  const tower = kur(room);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();
  // Iki farkli etki: kule %40 (1 sn), isci mermisi %52 (3 sn).
  room.addEnemySlowFloor(enemy, 0.6, now + 1000, tower.id, now);
  room.extendFlatSlow(enemy, now + 3000, now, "worker:slowShots");
  close(room.getEnemySlowSpeedMultiplier(enemy, now), 0.6 * 0.48, "ikisi birlikte");
  close(room.getEnemySlowSpeedMultiplier(enemy, now + 1500), 0.48, "kule bitti");
  assert.equal(room.getEnemySlowSpeedMultiplier(enemy, now + 3500), 1, "ikisi de bitti");

  // Ayni etki (ayni kule): zayif yeniden vurus gucluyu uzatmiyor, ezmiyor.
  const ayni = dusmanKoy(room, tower);
  room.addEnemySlowFloor(ayni, 0.6, now + 1000, tower.id, now);
  room.addEnemySlowFloor(ayni, 0.9, now + 3000, tower.id, now + 1);
  close(room.getEnemySlowSpeedMultiplier(ayni, now + 2), 0.6, "zayif guclunun yerine gecti");
  close(room.getEnemySlowSpeedMultiplier(ayni, now + 1500), 0.9, "guclu zayifin suresini devraldi");
});

test("oda: aura yavaslatmalari da etki basina -- Izolasyon aurasi vurusuyla ayni etki", () => {
  const room = oda();
  const tower = kur(room, "warrior-3", 10);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();
  room.resetAuraSlows();
  room.applyEnemyAuraSlow(enemy, room.getTowerSlowKind(tower.id), 0.5);
  room.addEnemySlowFloor(enemy, 0.5, now + 4000, tower.id, now);
  const kinds = new Map();
  room.collectEnemyFloorSlowKinds(enemy, now, kinds);
  room.collectEnemyAuraSlowKinds(enemy, kinds);
  assert.deepEqual([...kinds], [["tower:warrior-3", 0.5]], "aura ve vurus ayri etki sayildi");
  // Baska bir aura etkisi (Sempati) carpiliyor.
  room.applyEnemyAuraSlow(enemy, "ultimate:sympathy", 0.8);
  close(enemy.auraSlowMultiplier, 0.4);
});

test("oda: Buz Kirigi kritigi kendi gucunu buyutup sonra carpiliyor; kritik ve kritiksiz ayni etki", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "buz-kirigi");
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();
  room.towerCriticalRandom = () => 0; // her zaman kritik
  const kesir = room.rollTowerSlowFraction(tower, undefined, tower.level, enemy, 0.4);
  close(kesir, 0.6, "kritik yavaslatma 1,5 kat degil");
  room.addEnemySlowFloor(enemy, 1 - kesir, now + 4000, tower.id, now);
  // Ayni kulenin kritiksiz vurusu ayni etki: 0,4 x 0,6 degil, 0,4.
  room.addEnemySlowFloor(enemy, 0.6, now + 4000, tower.id, now);
  close(room.getEnemySlowSpeedMultiplier(enemy, now), 0.4, "kritik ve kritiksiz carpildi");
  // Zincirleme Buz farkli etki: 0,4 x 0,85.
  room.applyEnemyStatusEffect(enemy, zincirlemeBuz(), now + 1);
  close(hiz(room, enemy), 0.4 * 0.85);
});

test("oda: Derin Dondurma birlesik hiza bakiyor -- uc farkli %30 (0,343) donduruyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "derin-dondurma", tower.id);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();
  room.addEnemySlowFloor(enemy, 0.7, now + 4000, tower.id, now);
  room.applyEnemyStatusEffect(enemy, chill(0.3, 4000, "card:test-a"), now);
  room.applyEnemyStatusEffect(enemy, chill(0.3, 4000, "card:test-b"), now);
  const carpan = hiz(room, enemy);
  close(carpan, 0.343);
  assert.ok(carpan <= DEEP_FREEZE_SPEED_THRESHOLD);
  assert.ok(isStatusEffectActive(enemy.statusEffects.freeze, Date.now()), "Derin Dondurma tetiklenmedi");

  // Ayni etkinin %30'u iki kez sayilmiyor: 0,7 x 0,7 = 0,49, donma yok.
  const ayni = dusmanKoy(room, tower);
  room.addEnemySlowFloor(ayni, 0.7, now + 4000, tower.id, now);
  room.applyEnemyStatusEffect(ayni, chill(0.3, 4000, "card:test-a"), now);
  room.applyEnemyStatusEffect(ayni, chill(0.3, 4000, "card:test-a"), now + 1);
  close(hiz(room, ayni), 0.49);
  assert.equal(isStatusEffectActive(ayni.statusEffects.freeze, Date.now()), false, "ayni etki iki kez sayildi");
});

test("oda: Buz Kirigi kritigi + Zincirleme Buz Derin Dondurma'yi tetikliyor, kritiksiz tetiklemiyor", () => {
  for (const [kritik, beklenenHiz, donmali] of [[true, 0.4 * 0.85, true], [false, 0.6 * 0.85, false]]) {
    const room = oda();
    const tower = kur(room);
    kartAl(room, "buz-kirigi");
    kartAl(room, "derin-dondurma", tower.id);
    const enemy = dusmanKoy(room, tower);
    const now = Date.now();
    room.towerCriticalRandom = () => (kritik ? 0 : 1);
    const kesir = room.rollTowerSlowFraction(tower, undefined, tower.level, enemy, 0.4);
    room.addEnemySlowFloor(enemy, 1 - kesir, now + 4000, tower.id, now);
    room.applyEnemyStatusEffect(enemy, zincirlemeBuz(), now + 1);
    close(hiz(room, enemy), beklenenHiz, `kritik=${kritik}`);
    assert.equal(isStatusEffectActive(enemy.statusEffects.freeze, Date.now()), donmali, `kritik=${kritik}`);
  }
});

test("oda: yavaslatma direnci etkiler birlesmeden once uygulaniyor", () => {
  // %50 yavaslatma direnci (Kosucu %35, Ezici %20 tasiyor): aura gucu
  // direncle kisiliyor, sonra oteki etkilerle carpiliyor.
  const room = oda();
  const tower = kur(room, "warrior-3", 10);
  const enemy = dusmanKoy(room, tower);
  enemy.statusResistances = { slow: 0.5 };
  enemy.x = tower.x + 4;
  enemy.y = tower.y;
  tower.auraExpiresAt = Date.now() + 60_000;
  tower.wakeReadyAt = 0;
  tower.offlineUntil = 0;
  room.resetAuraSlows();
  room.applyTowerEnemyAuras(tower);
  close(enemy.auraSlowMultiplier, 0.75, "direnc auraya islemedi");
  room.applyEnemyStatusEffect(enemy, zincirlemeBuz(), Date.now());
  close(hiz(room, enemy), 0.75 * 0.85);
});
