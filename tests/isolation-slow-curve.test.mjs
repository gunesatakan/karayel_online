/**
 * Izolasyon yavaslatma egrisi, Buz Kirigi kritigi ve Derin Dondurma esigi.
 *
 * Izolasyon'un iki yavaslatmasi (vurus ve yalniz kalinca acilan aura) ayni
 * seviye egrisinde: 1. seviyede %10, 10. seviyede %50. Ikisinin de egride
 * olmasi sart -- biri duz %52'de kalsaydi `min` icinde oteki hic
 * gorunmezdi.
 *
 * Buz Kirigi yavaslatma **kesrini** 1,5 kat buyutuyor (%40 -> %60, duz %52
 * -> %78), %90 tavanla. Kart uzun sure yapilandirilmis yavaslatmalarda bir
 * sey yapmiyordu: zar `magnitude`u buyutuyordu ama hiz duz bir tavana
 * iniyordu. Bu testler hizin kendisini olcuyor.
 *
 * Derin Dondurma hizi 0,4'e ya da altina inen (%60 ya da daha fazla
 * yavaslayan) dusmani donduruyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEEP_FREEZE_SPEED_THRESHOLD,
  ISOLATION_SLOW_CURVE,
  ISOLATION_SLOW_FRACTION_LEVEL_1,
  ISOLATION_SLOW_FRACTION_LEVEL_10,
  SLOW_STATUS_SPEED_MULTIPLIER,
  cardCatalog,
  getCriticalSlowFraction,
  getIsolationSlowFraction,
  getLevelScaledSlowFraction,
  getTowerAuraLevelMultiplier,
  getTowerHitSlowFraction,
  isStatusEffectActive,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const yakin = (actual, expected, message, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${message}: ${actual} (beklenen ${expected})`);

function oda(characterId = "warrior") {
  const room = createRoom(characterId);
  room.broadcasts = [];
  room.broadcast = (type, message) => room.broadcasts.push({ type, message });
  room.clients = [client];
  room.setupPhase = false;
  return room;
}

function kur(room, definitionId = "warrior-3", level = 1) {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower.definition.id, definitionId);
  tower.level = level;
  return tower;
}

function kartAl(room, cardId, towerId) {
  const kart = cardCatalog.find((card) => card.id === cardId);
  assert.ok(kart, `${cardId} katalogda yok`);
  room.pendingCardChoices = new Map([["p1", [kart]]]);
  room.chooseCard(client, { cardId, towerId });
  return kart;
}

/**
 * Dogdugu yerde, sabit hizli ve direncsiz bir dusman.
 *
 * Elle tasinan dusmanin yolu olmuyor ve yurumuyor; tur de rastgele. Hiz
 * olcen testler bunlari sabitlemezse carpani degil gurultuyu olcer.
 */
function dusman(room) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.hp = enemy.maxHp = 100000;
  enemy.statusResistances = {};
  enemy.shield = 0;
  enemy.maxShield = 0;
  enemy.speed = 100;
  enemy.auraSlowMultiplier = 1;
  return enemy;
}

/**
 * Aurayi acik tutar: periyodik aura tikte tazeleniyor ve kule yeni kuruldugunda
 * uyanma suresi var. Test tiki surmeden auranin kendisini olcuyor.
 */
function auraAcik(tower) {
  tower.auraExpiresAt = Date.now() + 60_000;
  tower.wakeReadyAt = 0;
  tower.offlineUntil = 0;
}

/** Kisa bir tikte alinan yolun taban hiza orani: hareketin gercek carpani. */
function olculenHiz(room, enemy) {
  const onceX = enemy.x;
  const onceY = enemy.y;
  room.updateEnemies(0.02);
  return Math.hypot(enemy.x - onceX, enemy.y - onceY) / (100 * 0.02);
}

/** Kulenin gercek vurus yolu: hasar 0 (Izolasyon vurmaz), yavaslatma suresi tanimdan. */
function vur(room, tower, enemy) {
  const slowMs = tower.definition.engine.statusEffects.find((effect) => effect.type === "slow").durationMs;
  room.damageEnemyFromTower(tower, enemy, 0, slowMs);
}

const izolasyon = towerCatalog.warrior.find((tower) => tower.id === "warrior-3");
const izolasyonAurasi = izolasyon.engine.auras.find((aura) => aura.stat === "slow");

// ------------------------------------------------------------------- Egri

test("egri 1. seviyede %10, 5. seviyede ~%27,8, 10. seviyede %50", () => {
  assert.equal(ISOLATION_SLOW_FRACTION_LEVEL_1, 0.1);
  assert.equal(ISOLATION_SLOW_FRACTION_LEVEL_10, 0.5);
  yakin(getIsolationSlowFraction(1), 0.1, "L1");
  yakin(getIsolationSlowFraction(5), 0.1 + 4 * 0.4 / 9, "L5");
  yakin(getIsolationSlowFraction(5), 0.27778, "L5 yaklasik", 1e-4);
  yakin(getIsolationSlowFraction(10), 0.5, "L10");
  // Dogrusal: her seviye ayni miktar.
  for (let level = 2; level <= 10; level += 1) {
    yakin(getIsolationSlowFraction(level) - getIsolationSlowFraction(level - 1), 0.4 / 9, `L${level} adimi`);
  }
});

test("egri 1-10 araligina kirpiliyor", () => {
  yakin(getIsolationSlowFraction(0), 0.1, "L0");
  yakin(getIsolationSlowFraction(-5), 0.1, "L-5");
  yakin(getIsolationSlowFraction(11), 0.5, "L11");
  yakin(getIsolationSlowFraction(99), 0.5, "L99");
  yakin(getLevelScaledSlowFraction({ level1: 0.2, level10: 0.2 }, 7), 0.2, "duz egri");
});

test("Izolasyon'un iki yavaslatmasi da ayni egride", () => {
  const vurus = izolasyon.engine.statusEffects.find((effect) => effect.type === "slow");
  assert.deepEqual(vurus.slowByLevel, ISOLATION_SLOW_CURVE);
  assert.deepEqual(izolasyonAurasi.slowByLevel, ISOLATION_SLOW_CURVE);
  for (const level of [1, 5, 10]) {
    yakin(getTowerHitSlowFraction(izolasyon, level), getIsolationSlowFraction(level), `vurus L${level}`);
    yakin(1 - getTowerAuraLevelMultiplier(izolasyonAurasi, level), getIsolationSlowFraction(level), `aura L${level}`);
  }
});

test("aura carpani 1. seviyede 0,9, 10. seviyede 0,5 -- sahadaki oda da ayni", () => {
  yakin(getTowerAuraLevelMultiplier(izolasyonAurasi, 1), 0.9, "tanim L1");
  yakin(getTowerAuraLevelMultiplier(izolasyonAurasi, 10), 0.5, "tanim L10");

  for (const [level, beklenen] of [[1, 0.9], [10, 0.5]]) {
    const room = oda();
    const tower = kur(room, "warrior-3", level);
    // Yalniz: aura acik. Dusman kulenin dibinde.
    assert.equal(room.isTowerIsolated(tower), true, "tek kule izole sayilmadi");
    const enemy = dusman(room);
    enemy.x = tower.x + 4;
    enemy.y = tower.y;
    auraAcik(tower);
    room.resetAuraSlows();
    room.applyTowerEnemyAuras(tower);
    yakin(enemy.auraSlowMultiplier, beklenen, `oda aurasi L${level}`);
    yakin(room.getTowerAuraSlowMultiplier(tower), beklenen, `panel aurasi L${level}`);
  }
});

// ----------------------------------------------------------- Vurus yavaslatmasi

test("Izolasyon'un vurusu 1. seviyede %10, 10. seviyede %50 yavaslatiyor", () => {
  for (const [level, beklenenHiz] of [[1, 0.9], [10, 0.5]]) {
    const room = oda();
    const tower = kur(room, "warrior-3", level);
    const enemy = dusman(room);
    vur(room, tower, enemy);
    yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), beklenenHiz, `taban L${level}`);
    yakin(olculenHiz(room, enemy), beklenenHiz, `olculen hiz L${level}`, 0.01);
    yakin(room.getTowerSlowStatus(tower).speedMultiplier, beklenenHiz, `panel L${level}`, 1e-3);
  }
});

test("oteki kulelerin yavaslatmasi degismedi: duz 0,48", () => {
  // Agir Zincir: tanimi yavaslatma bildiren ama egri bildirmeyen bir kule.
  const room = oda("tank");
  const tower = kur(room, "tank-1", 1);
  const enemy = dusman(room);
  vur(room, tower, enemy);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), SLOW_STATUS_SPEED_MULTIPLIER, "taban");
  yakin(olculenHiz(room, enemy), 0.48, "olculen hiz", 0.01);
  // Seviye duz yavaslatmayi degistirmiyor.
  tower.level = 10;
  yakin(room.getTowerSlowStatus(tower).speedMultiplier, 0.48, "panel L10", 1e-3);
  yakin(getTowerHitSlowFraction(tower.definition, 10), 0.52, "kodeks");
});

test("ust uste binen yavaslatmalarda en guclusu kazaniyor", () => {
  const room = oda();
  const zayif = kur(room, "warrior-3", 2);
  const enemy = dusman(room);
  vur(room, zayif, enemy);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 1 - getIsolationSlowFraction(2), "tek kule");

  // Ikinci, daha guclu bir Izolasyon (ayri kule, ayri kayit).
  const guclu = kur(room, "warrior-3", 9);
  assert.notEqual(guclu.id, zayif.id);
  vur(room, guclu, enemy);
  vur(room, zayif, enemy);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 1 - getIsolationSlowFraction(9), "guclu kazanmadi");

  // Duz bir yavaslatma (isci mermisi, ulti) Izolasyon L9'dan guclu: o kazanir.
  room.extendFlatSlow(enemy, Date.now() + 2000, Date.now());
  yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 0.48, "duz yavaslatma ezildi");
});

test("duz yavaslatmayi zayif bir Izolasyon ezemiyor", () => {
  // Eski davranisin korunmasi: duz yavaslatma aktifken %10'luk bir vurus
  // hizi 0,48'den 0,9'a cikarmamali.
  const room = oda();
  const tower = kur(room, "warrior-3", 1);
  const enemy = dusman(room);
  const now = Date.now();
  room.applyEnemyStatusEffect(enemy, { type: "slow", magnitude: 0.5, durationMs: 5000, stacking: "refresh" }, now);
  vur(room, tower, enemy);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, now), 0.48, "duz yavaslatma");
});

// --------------------------------------------------------------- Buz Kirigi

test("kritik yavaslatma kesri 1,5 kat, %90 tavanla", () => {
  yakin(getCriticalSlowFraction(0.4), 0.6, "%40");
  yakin(getCriticalSlowFraction(0.1), 0.15, "%10");
  yakin(getCriticalSlowFraction(0.52), 0.78, "duz %52");
  yakin(getCriticalSlowFraction(0.7), 0.9, "tavan");
  yakin(getCriticalSlowFraction(1), 0.9, "tavan, hiz hic sifir olmuyor");
});

test("Buz Kirigi Izolasyon'un vurusunu 1,5 kat derinlestiriyor", () => {
  for (const level of [1, 8, 10]) {
    const room = oda();
    const tower = kur(room, "warrior-3", level);
    kartAl(room, "buz-kirigi");
    const kesir = getIsolationSlowFraction(level);

    room.towerCriticalRandom = () => 1; // kritik yok
    const sade = dusman(room);
    vur(room, tower, sade);
    yakin(room.getEnemySlowSpeedMultiplier(sade, Date.now()), 1 - kesir, `kritiksiz L${level}`);
    assert.equal(room.broadcasts.some((entry) => entry.type === "slow:critical"), false, "kritiksiz vurus kritik yayinladi");

    room.towerCriticalRandom = () => 0; // her zaman kritik
    const kritik = dusman(room);
    vur(room, tower, kritik);
    yakin(room.getEnemySlowSpeedMultiplier(kritik, Date.now()), 1 - kesir * 1.5, `kritik L${level}`);
    yakin(olculenHiz(room, kritik), 1 - kesir * 1.5, `kritik olculen L${level}`, 0.01);
    assert.ok(room.broadcasts.some((entry) => entry.type === "slow:critical" && entry.message.enemyId === kritik.id), "kritik yavaslatma yayinlanmadi");
  }
});

test("Buz Kirigi duz yavaslatmayi %52'den %78'e cikariyor", () => {
  const room = oda("tank");
  const tower = kur(room, "tank-1", 1);
  kartAl(room, "buz-kirigi");

  room.towerCriticalRandom = () => 1;
  const sade = dusman(room);
  vur(room, tower, sade);
  yakin(room.getEnemySlowSpeedMultiplier(sade, Date.now()), 0.48, "kritiksiz");

  room.towerCriticalRandom = () => 0;
  const kritik = dusman(room);
  vur(room, tower, kritik);
  yakin(room.getEnemySlowSpeedMultiplier(kritik, Date.now()), 0.22, "kritik");
  yakin(olculenHiz(room, kritik), 0.22, "kritik olculen", 0.01);
});

test("Buz Kirigi olmadan zar 0 gelse de kritik yok", () => {
  const room = oda();
  const tower = kur(room, "warrior-3", 10);
  room.towerCriticalRandom = () => 0;
  const enemy = dusman(room);
  vur(room, tower, enemy);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 0.5, "kartsiz");
});

test("kritik yavaslatmayi bir sonraki kritiksiz vurus silmiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-3", 10);
  kartAl(room, "buz-kirigi");
  const enemy = dusman(room);
  room.towerCriticalRandom = () => 0;
  vur(room, tower, enemy);
  room.towerCriticalRandom = () => 1;
  vur(room, tower, enemy);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 0.25, "kritik kayit silindi");
});

test("Izolasyon aurasi hic kritik gelmiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-3", 1);
  kartAl(room, "buz-kirigi");
  room.towerCriticalRandom = () => 0; // her zar kritik
  const enemy = dusman(room);
  enemy.x = tower.x + 4;
  enemy.y = tower.y;
  auraAcik(tower);
  for (let tick = 0; tick < 20; tick += 1) {
    room.resetAuraSlows();
    room.applyTowerEnemyAuras(tower);
    yakin(enemy.auraSlowMultiplier, 0.9, `tik ${tick}`);
  }
  assert.equal(room.broadcasts.some((entry) => entry.type === "slow:critical"), false, "aura kritik yayinladi");
});

test("sogutma yavaslatmasinin kritigi de ayni kural: kesir 1,5 kat", () => {
  // Kritik tavandan sonra: tavandaki (%60) sogutma kritikle %90 oluyor.
  const room = oda();
  const tower = kur(room, "warrior-1", 1);
  kartAl(room, "sogutma-kanali", tower.id);
  kartAl(room, "buz-kirigi");
  room.getTowerCoolingPerSecond = () => 1000; // tavanin cok ustu
  room.towerCriticalRandom = () => 1;
  const sade = dusman(room);
  room.applyCoolantSlow(tower, sade, Date.now());
  yakin(1 - sade.coolantSlowMultiplier, 0.6, "tavan");
  room.towerCriticalRandom = () => 0;
  const kritik = dusman(room);
  room.applyCoolantSlow(tower, kritik, Date.now());
  yakin(1 - kritik.coolantSlowMultiplier, 0.9, "kritik tavan");
});

// ----------------------------------------------------------- Derin Dondurma

test("Derin Dondurma esigi %60 yavaslama: hiz 0,39 ve tam 0,4 donuyor, 0,41 donmuyor", () => {
  assert.equal(DEEP_FREEZE_SPEED_THRESHOLD, 0.4);
  for (const [hiz, donmali] of [[0.39, true], [1 - 0.4 * 1.5, true], [0.4, true], [0.41, false]]) {
    const room = oda();
    const tower = kur(room, "warrior-1", 1);
    kartAl(room, "derin-dondurma", tower.id);
    const enemy = dusman(room);
    enemy.x = tower.x + 8;
    enemy.y = tower.y;
    const now = Date.now();
    room.tryDeepFreeze(enemy, hiz, room.collectDeepFreezeTowers(), now);
    assert.equal(isStatusEffectActive(enemy.statusEffects.freeze, now), donmali, `hiz ${hiz}`);
  }
});

test("kart metni yeni esigi soyluyor", () => {
  const kart = cardCatalog.find((card) => card.id === "derin-dondurma");
  assert.match(kart.description, /%60 ya da daha fazla yavaşlayan/);
  assert.doesNotMatch(kart.description, /yarıya/);
  const buz = cardCatalog.find((card) => card.id === "buz-kirigi");
  assert.match(buz.description, /1,5 kat/);
});

// ------------------------------------------------------------ Butun hikaye

/**
 * Izolasyon + Buz Kirigi + Derin Dondurma, gercek hareket dongusunden.
 *
 * Dusman kulenin menzilinde; donma karari `updateEnemies` icinde, hizin
 * kendisinden veriliyor.
 */
function hikaye(level, kritik) {
  const room = oda();
  const tower = kur(room, "warrior-3", level);
  kartAl(room, "buz-kirigi");
  kartAl(room, "derin-dondurma", tower.id);
  room.towerCriticalRandom = () => (kritik ? 0 : 1);
  const enemy = dusman(room);
  enemy.x = tower.x + 8;
  enemy.y = tower.y;
  vur(room, tower, enemy);
  const hiz = room.getEnemySlowSpeedMultiplier(enemy, Date.now());
  room.updateEnemies(0.02);
  return { hiz, dondu: isStatusEffectActive(enemy.statusEffects.freeze, Date.now()) };
}

test("~%40 yavaslatan Izolasyon kritikle donduruyor, %10 kritiksiz dondurmuyor", () => {
  // 8. seviye %41,1; kritikle %61,7 -> hiz 0,383 <= 0,4.
  const kritikli = hikaye(8, true);
  yakin(kritikli.hiz, 1 - getIsolationSlowFraction(8) * 1.5, "L8 kritik hiz");
  assert.ok(kritikli.hiz < 0.4, `hiz ${kritikli.hiz}`);
  assert.equal(kritikli.dondu, true, "kritik yavaslatma dondurmadi");

  // 1. seviye %10, kritik yok -> hiz 0,9.
  const sade = hikaye(1, false);
  yakin(sade.hiz, 0.9, "L1 hiz");
  assert.equal(sade.dondu, false, "%10 yavaslatma dondurdu");
});

test("kritiksiz hicbir seviye dondurmuyor; kritikle 8. seviyeden itibaren donduruyor", () => {
  for (let level = 1; level <= 10; level += 1) {
    const sade = hikaye(level, false);
    yakin(sade.hiz, 1 - getIsolationSlowFraction(level), `L${level} hiz`);
    assert.equal(sade.dondu, false, `kritiksiz L${level} dondurdu`);
    const kritikli = hikaye(level, true);
    assert.equal(kritikli.dondu, level >= 8, `kritikli L${level} hiz ${kritikli.hiz}`);
  }
  // 7. seviye kritikle %55 (hiz 0,45): esigin ustunde.
  yakin(hikaye(7, true).hiz, 0.45, "L7 kritik hiz");
});

test("duz %52 yavaslatma kritiksiz dondurmuyor, Buz Kirigi kritigiyle (%78) donduruyor", () => {
  for (const [kritik, donmali] of [[false, false], [true, true]]) {
    const room = oda("tank");
    const tower = kur(room, "tank-1", 1);
    kartAl(room, "buz-kirigi");
    kartAl(room, "derin-dondurma", tower.id);
    room.towerCriticalRandom = () => (kritik ? 0 : 1);
    const enemy = dusman(room);
    enemy.x = tower.x + 8;
    enemy.y = tower.y;
    vur(room, tower, enemy);
    room.updateEnemies(0.02);
    assert.equal(isStatusEffectActive(enemy.statusEffects.freeze, Date.now()), donmali, `kritik ${kritik}`);
  }
});

// ------------------------------------------------------- Bayat durum, yayin

test("tahakkumden sonra eski yavaslatma durumu zayif vurusa bitis devretmiyor", () => {
  // Hata yolu: uzun bir yavaslatma durumu kalir, tahakkum `slowUntil`i ve
  // tabanlari siler; sonraki zayif vurus durumun eski bitisini `slowUntil`a
  // yazar ve kendi tabani bitince hiz kayitsiz yedege (duz 0,48) duserdi.
  // Tahakkum dogrudan cagriliyor: yalnizca hedefi ve sahibini kullaniyor.
  const room = oda();
  const tower = kur(room, "warrior-3", 1);
  const enemy = dusman(room);
  enemy.type = "brute";
  const now = Date.now();
  room.applyEnemyStatusEffect(enemy, { type: "slow", magnitude: 0.5, durationMs: 20_000, stacking: "refresh" }, now);
  assert.equal(room.useMelisBully("p1", { x: enemy.x, y: enemy.y }), true, "tahakkum tutmadi");
  assert.equal(enemy.statusEffects.slow, undefined, "yavaslatma durumu tahakkumde silinmedi");
  enemy.dominatedUntil = 0; // tahakkum bitti

  vur(room, tower, enemy);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, now), 0.9, "zayif vurus");
  assert.ok(enemy.slowUntil < now + 5_000, `slowUntil eski bitisi devraldi: ${enemy.slowUntil - now} ms`);
  assert.equal(room.getEnemySlowSpeedMultiplier(enemy, now + 5_000), 1, "taban bittikten sonra duz yavaslatmaya dustu");
});

test("slowUntil durumun en gec bitisinden degil tabanlardan buyuyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-3", 1);
  const enemy = dusman(room);
  vur(room, tower, enemy);
  const enGec = Math.max(...Object.values(enemy.slowSpeedFloors).map((floor) => floor.expiresAt));
  assert.equal(enemy.slowUntil, enGec);
});

test("kritik yavaslatma yayini kule basina kisiliyor ve olen dusmana gitmiyor", () => {
  const room = oda();
  const tower = kur(room, "warrior-3", 10);
  kartAl(room, "buz-kirigi");
  room.towerCriticalRandom = () => 0;
  const yayinlar = () => room.broadcasts.filter((entry) => entry.type === "slow:critical").length;

  // Ayni anda bes dusmana kritik: tek yayin, ama bes kritik yavaslatma.
  const dusmanlar = Array.from({ length: 5 }, () => dusman(room));
  for (const enemy of dusmanlar) vur(room, tower, enemy);
  assert.equal(yayinlar(), 1, "alan vurusu her dusmana ayri yayin yapti");
  for (const enemy of dusmanlar) yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 0.25, "kisilan yayin yavaslatmayi da kisti");

  // Aralik gecince yeniden.
  room.slowCritBroadcastAt.set(tower.id, Date.now() - 200);
  vur(room, tower, dusman(room));
  assert.equal(yayinlar(), 2, "aralik gecince yayin gelmedi");

  // Ayni vurusta olen dusmana yayin yok.
  const tankOdasi = oda("tank");
  const tank = kur(tankOdasi, "tank-1", 1);
  kartAl(tankOdasi, "buz-kirigi");
  tankOdasi.towerCriticalRandom = () => 0;
  const olen = dusman(tankOdasi);
  olen.hp = 1;
  tankOdasi.damageEnemyFromTower(tank, olen, 100_000, 720);
  assert.ok(olen.hp <= 0, "dusman olmedi");
  assert.equal(tankOdasi.broadcasts.some((entry) => entry.type === "slow:critical"), false, "olen dusmana kritik yayini gitti");
});

// ------------------------------------------------------------------- Kin

/** Kin Kulesi ve Kin mermisinin ortak yolu: `applyKinSlow`, gercek mesafe orani. */
function kinOdasi(definitionId = "zeynep-6") {
  const room = oda("zeynep");
  const tower = kur(room, definitionId, 1);
  return { room, tower, range: room.getTowerRange(tower) };
}

test("Kin dibinde yavaslatmiyor, ortada %20, menzil ucunda %40", () => {
  for (const definitionId of ["zeynep-6", "zeynep-3"]) {
    for (const [oran, beklenenHiz] of [[0, 1], [0.5, 0.8], [1, 0.6]]) {
      const { room, tower, range } = kinOdasi(definitionId);
      const enemy = dusman(room);
      room.applyKinSlow(enemy, tower, range * oran, range, 1150);
      const now = Date.now();
      yakin(room.getEnemySlowSpeedMultiplier(enemy, now), beklenenHiz, `${definitionId} oran ${oran}`);
      yakin(olculenHiz(room, enemy), beklenenHiz, `${definitionId} olculen oran ${oran}`, 0.01);
    }
  }
});

test("Kin dibindeki vurus kayit birakmiyor ve duz 0,48 yedegine dusmuyor", () => {
  const { room, tower, range } = kinOdasi();
  const enemy = dusman(room);
  const now = Date.now();
  room.applyKinSlow(enemy, tower, 0, range, 1150);
  assert.equal(Object.keys(enemy.slowSpeedFloors ?? {}).length, 0, "sifir kesir kayit birakti");
  assert.ok(enemy.slowUntil <= now, "sifir kesir slowUntil'i buyuttu");
  assert.equal(room.getEnemySlowSpeedMultiplier(enemy, now), 1);
  assert.equal(enemy.statusEffects.slow, undefined, "sifir kesir yavaslatma durumu yazdi");
});

test("Kin her temasta yeniden hesaplaniyor: uzak vurustan sonra yakin temas zayiflatiyor", () => {
  const { room, tower, range } = kinOdasi();
  const enemy = dusman(room);
  room.applyKinSlow(enemy, tower, range, range, 1150);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 0.6, "uzak");
  room.applyKinSlow(enemy, tower, range * 0.25, range, 1150);
  yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 0.9, "yakin temas yeniden hesaplanmadi");
  room.applyKinSlow(enemy, tower, 0, range, 1150);
  assert.equal(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 1, "dipteki temas eski yavaslatmayi silmedi");
  assert.ok(enemy.slowUntil <= Date.now(), "silinen kayittan sonra slowUntil kaldi");
});

test("Buz Kirigi Kin kesrini 1,5 kat buyutuyor: menzil ucunda %60", () => {
  for (const [oran, beklenenHiz] of [[0.5, 0.7], [1, 0.4]]) {
    const { room, tower, range } = kinOdasi();
    kartAl(room, "buz-kirigi");
    room.towerCriticalRandom = () => 0;
    const enemy = dusman(room);
    room.applyKinSlow(enemy, tower, range * oran, range, 1150);
    yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), beklenenHiz, `kritik oran ${oran}`);
    assert.ok(room.broadcasts.some((entry) => entry.type === "slow:critical"), "kritik yayinlanmadi");
  }
  // Dipte kritik yok: sifirin 1,5 kati sifir ve yayin da yok.
  const { room, tower, range } = kinOdasi();
  kartAl(room, "buz-kirigi");
  room.towerCriticalRandom = () => 0;
  const enemy = dusman(room);
  room.applyKinSlow(enemy, tower, 0, range, 1150);
  assert.equal(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), 1);
  assert.equal(room.broadcasts.some((entry) => entry.type === "slow:critical"), false, "dipte kritik yayinlandi");
});

test("Kin paneli gercegi soyluyor: -%0...-%40", () => {
  const { room, tower } = kinOdasi();
  const status = room.getTowerSlowStatus(tower);
  assert.equal(status.speedMultiplier, 1);
  yakin(status.farSpeedMultiplier, 0.6, "uzak uc");
});

test("menzil ucunda kritik Kin vurusu tam 0,4 hizla Derin Dondurma'yi tetikliyor", () => {
  for (const [kritik, donmali] of [[true, true], [false, false]]) {
    const { room, tower, range } = kinOdasi();
    kartAl(room, "buz-kirigi");
    kartAl(room, "derin-dondurma", tower.id);
    room.towerCriticalRandom = () => (kritik ? 0 : 1);
    const enemy = dusman(room);
    enemy.x = tower.x + 8;
    enemy.y = tower.y;
    room.applyKinSlow(enemy, tower, range, range, 1150);
    yakin(room.getEnemySlowSpeedMultiplier(enemy, Date.now()), kritik ? 0.4 : 0.6, `hiz kritik=${kritik}`);
    room.updateEnemies(0.02);
    assert.equal(isStatusEffectActive(enemy.statusEffects.freeze, Date.now()), donmali, `kritik=${kritik}`);
  }
});

test("Taht'in Kin mermisi hedef alinamayan dusmani yavaslatmiyor", () => {
  const { room, tower } = kinOdasi("zeynep-3");
  kartAl(room, "buz-kirigi");
  room.towerCriticalRandom = () => 0;
  const projectile = { definitionId: "zeynep-3-kin-projectile", towerId: tower.id };
  for (const [ad, hazirla] of [
    ["tahakkum", (enemy) => { enemy.dominatedUntil = Date.now() + 5000; }],
    ["olu", (enemy) => { enemy.melisUndeadUntil = Date.now() + 5000; }],
    ["fisilti", (enemy) => { enemy.melisWhisperTurnedUntil = Date.now() + 5000; }]
  ]) {
    const enemy = dusman(room);
    enemy.x = tower.x + room.getTowerRange(tower);
    enemy.y = tower.y;
    hazirla(enemy);
    room.applyKinProjectileSlow(projectile, enemy);
    assert.equal(Object.keys(enemy.slowSpeedFloors ?? {}).length, 0, `${ad}: yavaslatma kaydi yazildi`);
    assert.equal(enemy.statusEffects.slow, undefined, `${ad}: yavaslatma durumu yazildi`);
  }
  assert.equal(room.broadcasts.some((entry) => entry.type === "slow:critical"), false, "hedef disi dusmana kritik yayini");

  // Kontrol: siradan dusman yavasliyor.
  const enemy = dusman(room);
  enemy.x = tower.x + room.getTowerRange(tower);
  enemy.y = tower.y;
  room.applyKinProjectileSlow(projectile, enemy);
  assert.ok(room.getEnemySlowSpeedMultiplier(enemy, Date.now()) < 1, "siradan dusman yavaslamadi");
});
