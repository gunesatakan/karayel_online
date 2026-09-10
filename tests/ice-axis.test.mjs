/**
 * Buz ekseni: sogumadan yavaslatmaya, yavaslatmadan donmaya, donmadan kritige.
 *
 * Dort kart bir zincir kuruyor ve zincirin degeri halkalarin **birbirine
 * gecmesinde**. Testler tek tek etkileri degil, o gecisleri tutuyor:
 *   - Sogutma Kanali sogumayi okuyor mu (yani sogutma kartlari buna da yariyor mu),
 *   - Derin Dondurma kimin yavaslattigina bakmadan donduruyor mu,
 *   - donmus dusman gercekten duruyor mu,
 *   - Kirilgan Buz o donmayi kritige ceviriyor mu.
 *
 * Ayrica iki tehlikeli koseyi tutuyorlar: sogutma yavaslatmasi kendisiyle
 * yigilmamali (yoksa hizli atan bir kule dusmani tek basina durdurur) ve donma
 * kendini beslememeli (donmus dusmanin hizi sifir, yani esigin altinda).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEEP_FREEZE_DURATION_MS,
  DEEP_FREEZE_SPEED_THRESHOLD,
  cardCatalog,
  isStatusEffectActive
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  room.clients = [client];
  room.setupPhase = false;
  return room;
}

function kur(room, definitionId = "warrior-1") {
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  return [...room.towers.values()].at(-1);
}

/** Karti gercek secim yolundan verir; kilitler ancak oradan geliyor. */
function kartAl(room, cardId, towerId) {
  const kart = cardCatalog.find((card) => card.id === cardId);
  assert.ok(kart, `${cardId} katalogda yok`);
  room.pendingCardChoices = new Map([["p1", [kart]]]);
  room.chooseCard(client, { cardId, towerId });
  return kart;
}

/** Kulenin dibine bir dusman koyar. */
function dusmanKoy(room, tower, offset = 8) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.x = tower.x + offset;
  enemy.y = tower.y;
  enemy.hp = enemy.maxHp = 100000;
  // Direncler sifirlaniyor: dusman turu rastgele seciliyor ve sure
  // karsilastiran testler yoksa iki ayri direncin farkini olcerdi.
  enemy.statusResistances = {};
  return enemy;
}

// ------------------------------------------------------------ Sogutma Kanali

test("sogutma kanali sogumanin %3'u kadar yavaslatiyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "sogutma-kanali", tower.id);
  const enemy = dusmanKoy(room, tower);

  const now = Date.now();
  room.applyCoolantSlow(tower, enemy, now);

  const beklenen = 1 - room.getTowerCoolingPerSecond(tower) * 0.03;
  assert.ok(Math.abs(enemy.coolantSlowMultiplier - beklenen) < 1e-9, `carpan ${enemy.coolantSlowMultiplier}, beklenen ${beklenen}`);
  assert.ok(enemy.coolantSlowUntil > now, "yavaslatma suresi yazilmadi");
});

test("sogutmayi buyuten esya yavaslatmayi da buyutuyor", () => {
  // Kartin butun anlami bu bag: soguma o ana kadar yalnizca atis hiziydi.
  const room = oda();
  const tower = kur(room);
  kartAl(room, "sogutma-kanali", tower.id);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();

  room.applyCoolantSlow(tower, enemy, now);
  const sade = 1 - enemy.coolantSlowMultiplier;

  const player = room.state.players.get("p1");
  player.inventoryItemIds.push("sogutucu-kanatlar");
  room.equipShopItem(client, { itemId: "sogutucu-kanatlar", towerId: tower.id });
  const enemy2 = dusmanKoy(room, tower);
  room.applyCoolantSlow(tower, enemy2, now);
  const sogutmali = 1 - enemy2.coolantSlowMultiplier;

  assert.ok(sogutmali > sade, `sogutma esyasi yavaslatmayi buyutmedi: ${sogutmali} / ${sade}`);
});

test("sogutma yavaslatmasi kendisiyle yigilmiyor", () => {
  // Yigilsaydi saniyede bes kez vuran bir kule dusmani tek basina durdururdu
  // ve Derin Dondurma diye ayri bir karta gerek kalmazdi.
  const room = oda();
  const tower = kur(room);
  kartAl(room, "sogutma-kanali", tower.id);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();

  room.applyCoolantSlow(tower, enemy, now);
  const tekVurus = enemy.coolantSlowMultiplier;
  for (let i = 0; i < 8; i += 1) room.applyCoolantSlow(tower, enemy, now + i);

  assert.equal(enemy.coolantSlowMultiplier, tekVurus, "sekiz vurus yavaslatmayi derinlestirdi");
});

test("karti olmayan kule yavaslatmiyor", () => {
  const room = oda();
  const tower = kur(room);
  const enemy = dusmanKoy(room, tower);
  room.damageEnemyFromTower(tower, enemy, 1, 0);
  assert.equal(enemy.coolantSlowUntil, 0, "kartsiz kule yavaslatma birakti");
});

// ---------------------------------------------------------------- Buz Kirigi

test("buz kirigi yavaslatmayi kritik yapabiliyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "sogutma-kanali", tower.id);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();

  room.towerCriticalRandom = () => 1; // hicbir zaman kritik
  room.applyCoolantSlow(tower, enemy, now);
  const kritiksiz = 1 - enemy.coolantSlowMultiplier;

  kartAl(room, "buz-kirigi");
  const enemy2 = dusmanKoy(room, tower);
  room.towerCriticalRandom = () => 0; // her zaman kritik
  room.applyCoolantSlow(tower, enemy2, now);
  const kritikli = 1 - enemy2.coolantSlowMultiplier;

  assert.ok(Math.abs(kritikli - kritiksiz * 1.5) < 1e-9, `kritik yavaslatma %50 derin degil: ${kritikli} / ${kritiksiz}`);
});

test("buz kirigi olmadan zar hic atilmiyor", () => {
  // Kontrol: kart alinmadan kritik yavaslatma cikmamali, zar 0 gelse bile.
  const room = oda();
  const tower = kur(room);
  kartAl(room, "sogutma-kanali", tower.id);
  room.towerCriticalRandom = () => 0;
  const enemy = dusmanKoy(room, tower);
  room.applyCoolantSlow(tower, enemy, Date.now());

  const beklenen = 1 - room.getTowerCoolingPerSecond(tower) * 0.03;
  assert.ok(Math.abs(enemy.coolantSlowMultiplier - beklenen) < 1e-9, "kartsiz kule kritik yavaslatma verdi");
});

// ------------------------------------------------------------ Derin Dondurma

test("yeterince yavaslamis dusman menzilde donuyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "derin-dondurma", tower.id);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();

  const towers = room.collectDeepFreezeTowers();
  assert.equal(towers.length, 1, "dondurma kulesi toplanmadi");

  room.tryDeepFreeze(enemy, DEEP_FREEZE_SPEED_THRESHOLD - 0.01, towers, now);
  assert.ok(isStatusEffectActive(enemy.statusEffects.freeze, now), "dusman donmadi");
  assert.ok(enemy.statusEffects.freeze.expiresAt >= now + DEEP_FREEZE_DURATION_MS * 0.9);
});

test("yavaslamamis dusman donmuyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "derin-dondurma", tower.id);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();

  room.tryDeepFreeze(enemy, DEEP_FREEZE_SPEED_THRESHOLD + 0.01, room.collectDeepFreezeTowers(), now);
  assert.equal(isStatusEffectActive(enemy.statusEffects.freeze, now), false);
});

test("menzil disindaki dusman donmuyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "derin-dondurma", tower.id);
  const enemy = dusmanKoy(room, tower, room.getTowerRange(tower) + 50);
  const now = Date.now();

  room.tryDeepFreeze(enemy, 0.1, room.collectDeepFreezeTowers(), now);
  assert.equal(isStatusEffectActive(enemy.statusEffects.freeze, now), false);
});

test("donma kendini beslemiyor", () => {
  // En sinsi hata burasi: donmus dusmanin hizi sifir, yani esigin altinda.
  // Bekleme olmasaydi cozuldugu karede yeniden donar ve bir daha hic
  // yurumezdi -- kart tek basina oyunu bitirirdi.
  const room = oda();
  const tower = kur(room);
  kartAl(room, "derin-dondurma", tower.id);
  const enemy = dusmanKoy(room, tower);
  const towers = room.collectDeepFreezeTowers();
  const now = Date.now();

  room.tryDeepFreeze(enemy, 0, towers, now);
  const ilkBitis = enemy.statusEffects.freeze.expiresAt;

  // Donma cozuldu, dusman hala duruyor gibi gorunuyor.
  const sonra = ilkBitis + 1;
  room.tryDeepFreeze(enemy, 0, towers, sonra);
  assert.equal(isStatusEffectActive(enemy.statusEffects.freeze, sonra), false, "donma kendini yeniledi");
});

test("donmus dusmanin hizi sifir", () => {
  // Kuralin sahadaki karsiligi: yavaslatma carpar, donma keser.
  const room = oda();
  const tower = kur(room);
  kartAl(room, "derin-dondurma", tower.id);
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();
  room.tryDeepFreeze(enemy, 0.1, room.collectDeepFreezeTowers(), now);

  const oncekiX = enemy.x;
  const oncekiY = enemy.y;
  room.updateEnemies(0.5);
  assert.equal(enemy.x, oncekiX, "donmus dusman yatayda yurudu");
  assert.equal(enemy.y, oncekiY, "donmus dusman dikeyde yurudu");
});

// --------------------------------------------------------------- Kritik bagi

test("kirilgan buz donmus hedefte kritik ihtimalini buyutuyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "derin-dondurma", tower.id);
  kartAl(room, "kirilgan-buz");
  const enemy = dusmanKoy(room, tower);
  const now = Date.now();

  // Zar tam %30'un altinda: yalnizca donmus hedefte kritik gelmeli.
  room.towerCriticalRandom = () => 0.25;
  const oncekiCan = enemy.hp;
  room.damageEnemyFromTower(tower, enemy, 100, 0);
  const donmamisHasar = oncekiCan - enemy.hp;

  room.tryDeepFreeze(enemy, 0.1, room.collectDeepFreezeTowers(), now);
  const donmusOnce = enemy.hp;
  room.damageEnemyFromTower(tower, enemy, 100, 0);
  const donmusHasar = donmusOnce - enemy.hp;

  assert.ok(donmusHasar > donmamisHasar, `donmus hedefe kritik gelmedi: ${donmusHasar} / ${donmamisHasar}`);
});

// -------------------------------------------------------------- Cifte Namlu

test("cifte namlu tek tetikte iki mermi cikariyor", () => {
  const room = oda();
  const tower = kur(room);
  const enemy = dusmanKoy(room, tower);
  enemy.x = tower.x + 20;
  tower.facing = 0;
  tower.cooldownMs = 0;
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;

  room.enemySpatialGrid.rebuild(room.enemies.values());
  const oncekiMermi = room.projectiles.size;
  room.updateTowers(16);
  const tekli = room.projectiles.size - oncekiMermi;

  const room2 = oda();
  const tower2 = kur(room2);
  kartAl(room2, "cifte-namlu", tower2.id);
  const enemy2 = dusmanKoy(room2, tower2);
  enemy2.x = tower2.x + 20;
  tower2.facing = 0;
  tower2.cooldownMs = 0;
  tower2.ammo = tower2.maxAmmo;
  tower2.energy = tower2.maxEnergy;

  room2.enemySpatialGrid.rebuild(room2.enemies.values());
  const oncekiMermi2 = room2.projectiles.size;
  room2.updateTowers(16);
  const cifte = room2.projectiles.size - oncekiMermi2;

  assert.ok(tekli >= 1, "sade kule hic ates etmedi");
  assert.equal(cifte, tekli * 2, `cifte namlu iki mermi cikarmadi: ${cifte} / ${tekli}`);
});

// ------------------------------------------------------------- Sure esyalari

test("sure esyasi yavaslatmayi uzatiyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "sogutma-kanali", tower.id);
  const now = Date.now();

  const enemy = dusmanKoy(room, tower);
  room.applyCoolantSlow(tower, enemy, now);
  const sade = enemy.coolantSlowUntil - now;

  const player = room.state.players.get("p1");
  player.inventoryItemIds.push("uzun-fitil");
  room.equipShopItem(client, { itemId: "uzun-fitil", towerId: tower.id });
  const enemy2 = dusmanKoy(room, tower);
  room.applyCoolantSlow(tower, enemy2, now);
  const uzun = enemy2.coolantSlowUntil - now;

  assert.ok(uzun > sade * 1.3, `sure uzamadi: ${uzun} / ${sade}`);
});

test("sure esyalari her kuleye takilabiliyor", () => {
  // Oyunda zaten dort sure esyasi vardi ama dordu de dar kapsamliydi;
  // bu ucunun degeri tam olarak kapsamsiz olmalari.
  const room = oda();
  const tower = kur(room, "warrior-1");
  const player = room.state.players.get("p1");
  for (const itemId of ["uzun-fitil", "agir-metabolizma", "kalici-iz"]) {
    player.inventoryItemIds.push(itemId);
    room.equipShopItem(client, { itemId, towerId: tower.id });
    assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} sade bir kuleye takilamadi`);
  }
});
