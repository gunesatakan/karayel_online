/**
 * Dalga ongorusu ve hava duyurusu.
 *
 * 5. ve 10. dalga tamamen, 15. ve 20. dalga yari yariya havadan geliyor; ekran
 * ise uzun sure yalnizca dalga numarasini gosterdi. Havayi vuramayan bir
 * kurulum 5. dalgada tam canla, hicbir uyari gormeden siliniyordu.
 *
 * Testlerin tuttugu sozler:
 *   1. Kural tek yerde (shared): 1..20 icin dogru kip, karisik dalgada
 *      ciftler ucuyor. Sunucu dusmani bu kurala gore doguruyor.
 *   2. Kurulumda takim kaydi siradaki dalganin dusman sayisini (sunucunun
 *      `waveTarget`i) ve hava kipini tasiyor; ucansiz dalgada kip alani yok.
 *   3. Hava uyarisi yalnizca kurulumda, ucanli dalgadan once ve oyuncunun
 *      ayakta hicbir kulesi havayi vuramiyorsa geliyor. Kilitle (Ucaksavar
 *      Kiti) acilan kule sayiliyor, takim arkadasinin kulesi sayilmiyor.
 *   4. Uyari kalkiyorsa kule ucani gercekten vuruyor: kit yorunge kulesinde
 *      de isliyor, ates etmeyen yapiya takilan kit uyariyi kaldirmiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { FINAL_WAVE, getArenaWaveEnemyCount, getWaveAirMode, isFlyingWaveSpawn } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda(characterId = "onur") {
  const room = createRoom(characterId);
  room.broadcast = () => {};
  const player = room.state.players.get("p1");
  player.shopOffers = [];
  player.shopRerolls = 0;
  player.nexusShieldCharges = 0;
  return room;
}

/**
 * Bir onceki dalgayi odanin kendi kapanis yoluyla bitirip `wave` icin kurulumu
 * acar. Sayaclari elle yazmak testi degersiz kilardi: sinanan sey tam da
 * kurulumda `wave` ile `waveTarget`in siradaki dalgaya kurulmus olmasi.
 */
function kurulumaGec(room, wave) {
  room.wave = wave - 1;
  room.waveTarget = room.getScaledWaveEnemyCount(room.wave);
  room.setupPhase = false;
  room.enemies.clear();
  room.waveSpawned = room.waveTarget;
  room.waveClearedAt = 0;
  const gercekNow = Date.now;
  let simdi = gercekNow();
  Date.now = () => simdi;
  try {
    room.updateSpawning(16); // temizlendi damgasi
    simdi += 3000;           // dalga sonu beklemesi gecti
    room.updateSpawning(16); // yeni kurulum arasi
  } finally {
    Date.now = gercekNow;
  }
  assert.equal(room.setupPhase, true, "kurulum arasi acilmadi");
  assert.equal(room.wave, wave, "kurulumda dalga siradakine gecmedi");
}

/** Tel uzerinden gecmis hali: `undefined` alanlar JSON'da dusuyor. */
const tel = (room) => JSON.parse(JSON.stringify(room.getSnapshot()));
const oyuncu = (snapshot, id = "p1") => snapshot.players.find((player) => player.id === id);

function kur(room, definitionId, sessionId = "p1") {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin kare bulunamadi`);
  room.placeTower({ sessionId, send() {} }, { ...spot, definitionId });
  const tower = [...room.towers.values()].at(-1);
  assert.equal(tower?.definition.id, definitionId, `${definitionId} kurulamadi`);
  return tower;
}

test("hava kipi 1..20 icin tek kuraldan geliyor", () => {
  assert.equal(FINAL_WAVE, 20);
  const beklenen = { 5: "all", 10: "all", 15: "mixed", 20: "mixed" };
  for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
    assert.equal(getWaveAirMode(wave), beklenen[wave] ?? "none", `${wave}. dalga`);
  }
});

test("tam hava dalgasinda herkes, karisik dalgada ciftler ucuyor", () => {
  for (let index = 0; index < 6; index += 1) {
    assert.equal(isFlyingWaveSpawn(5, index), true);
    assert.equal(isFlyingWaveSpawn(10, index), true);
    assert.equal(isFlyingWaveSpawn(15, index), index % 2 === 0);
    assert.equal(isFlyingWaveSpawn(20, index), index % 2 === 0);
    assert.equal(isFlyingWaveSpawn(4, index), false);
  }
});

test("sunucu dusmani ayni kurala gore doguruyor", () => {
  for (const wave of [4, 5, 15]) {
    const room = oda();
    room.wave = wave;
    room.waveSpawned = 0;
    const ucanlar = [];
    for (let index = 0; index < 4; index += 1) {
      room.spawnEnemy();
      room.waveSpawned += 1;
      ucanlar.push([...room.enemies.values()].at(-1).movementKind === "air");
    }
    assert.deepEqual(ucanlar, [0, 1, 2, 3].map((index) => isFlyingWaveSpawn(wave, index)), `${wave}. dalga`);
  }
});

test("kurulumda takim kaydi siradaki dalganin sayisini ve hava kipini tasiyor", () => {
  for (const [wave, mode] of [[5, "all"], [15, "mixed"]]) {
    const room = oda();
    kurulumaGec(room, wave);
    const team = tel(room).team;
    assert.equal(team.wave, wave);
    assert.equal(team.waveAirMode, mode, `${wave}. dalganin kipi`);
    assert.equal(team.waveEnemyCount, room.waveTarget);
    assert.equal(team.waveEnemyCount, getArenaWaveEnemyCount(wave, room.mapScale, 1));
    // Kurulumda henuz dusman dogmadi: kalan sayaci da ayni sayiyi soyluyor.
    assert.equal(team.enemiesLeft, team.waveEnemyCount);
  }
});

test("ucansiz dalgada kip alani yok, dalga sirasinda kip su anki dalgayi anlatiyor", () => {
  const karada = oda();
  kurulumaGec(karada, 6);
  const team = tel(karada).team;
  assert.equal("waveAirMode" in team, false, "ucansiz dalga hava kipi tasiyor");
  assert.equal(team.waveEnemyCount, karada.waveTarget);

  const havada = oda();
  kurulumaGec(havada, 15);
  havada.setupPhase = false;
  havada.spawnEnemy();
  havada.waveSpawned += 1;
  const suren = tel(havada).team;
  assert.equal(suren.wave, 15);
  assert.equal(suren.waveAirMode, "mixed");
  assert.equal(suren.waveEnemyCount, havada.waveTarget);
  assert.equal(suren.enemiesLeft, havada.waveTarget, "dogan dusman kalan sayacindan dustu");
});

test("havayi vuramayan oyuncu kurulumda uyariliyor; Ucaksavar Kiti uyariyi kaldiriyor", () => {
  const room = oda("onur");
  kurulumaGec(room, 5);
  assert.equal(oyuncu(tel(room)).noAirDefense, true, "kulesiz oyuncu uyarilmadi");

  const tower = kur(room, "onur-3");
  assert.equal(tower.definition.engine.canHitAir, false);
  assert.equal(oyuncu(tel(room)).noAirDefense, true, "yere vuran kule havayi karsiliyor sayildi");

  room.state.players.get("p1").inventoryItemIds.push("ucaksavar-kiti");
  room.equipShopItem(client, { itemId: "ucaksavar-kiti", towerId: tower.id });
  assert.equal("noAirDefense" in oyuncu(tel(room)), false, "kilitle havayi vuran kule sayilmadi");
});

test("Ucaksavar Kiti yorunge kulesinde uyariyi kaldiriyor ve bicaklar ucani vuruyor", () => {
  const room = oda("onur");
  kurulumaGec(room, 5);
  const tower = kur(room, "onur-1");
  assert.equal(tower.definition.engine.attack.executor, "orbit");
  assert.equal(tower.definition.engine.canHitAir, false);
  assert.equal(oyuncu(tel(room)).noAirDefense, true);

  room.state.players.get("p1").inventoryItemIds.push("ucaksavar-kiti");
  room.equipShopItem(client, { itemId: "ucaksavar-kiti", towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes("ucaksavar-kiti"), "kit takilamadi");
  assert.equal("noAirDefense" in oyuncu(tel(room)), false, "kitli yorunge kulesi sayilmadi");

  // Uyari kalktiysa soz tutulmali: bicaklar bir donem yalnizca tanima
  // bakiyor ve kitli kulede de ucani geciyordu.
  room.setupPhase = false;
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  const bicak = room.getOrbitBladeLengthForTower(tower);
  Object.assign(enemy, { x: tower.x + bicak * 0.6, y: tower.y, hp: 1e9, maxHp: 1e9, shield: 0, armor: 0, movementKind: "air" });
  let now = Date.now();
  for (let tick = 0; tick < 200; tick += 1) {
    tower.energy = tower.maxEnergy;
    tower.temperature = 0;
    tower.heatLocked = false;
    room.enemySpatialGrid.rebuild(room.enemies.values());
    now += 50;
    room.updateOrbitTower(tower, 0.05, now);
  }
  assert.ok(enemy.hp < 1e9, "kitli yorunge kulesi ucan dusmana hic vurmadi");
});

test("ates etmeyen yapiya takilan Ucaksavar Kiti uyariyi kaldirmiyor", () => {
  const room = oda("onur");
  kurulumaGec(room, 5);
  const duvar = kur(room, "wall-1");
  room.state.players.get("p1").inventoryItemIds.push("ucaksavar-kiti");
  room.equipShopItem(client, { itemId: "ucaksavar-kiti", towerId: duvar.id });
  assert.ok(duvar.equippedShopItemIds.includes("ucaksavar-kiti"), "olcum bos: kit duvara takilamadi");
  assert.equal(oyuncu(tel(room)).noAirDefense, true, "duvara takili kit havayi karsiliyor sayildi");
});

test("havayi vuran kule sayiliyor, yikik olan sayilmiyor", () => {
  const room = oda("warrior");
  kurulumaGec(room, 10);
  assert.equal(oyuncu(tel(room)).noAirDefense, true);

  const tower = kur(room, "warrior-1");
  assert.equal("noAirDefense" in oyuncu(tel(room)), false, "Takipci havayi karsiliyor sayilmadi");

  tower.hp = 0;
  assert.equal(oyuncu(tel(room)).noAirDefense, true, "yikik kule havayi karsiliyor sayildi");
});

test("uyari yalnizca kurulumda ve ucanli dalgadan once geliyor", () => {
  const karada = oda("onur");
  kurulumaGec(karada, 6);
  assert.equal("noAirDefense" in oyuncu(tel(karada)), false, "ucansiz dalgadan once uyari geldi");

  const suren = oda("onur");
  kurulumaGec(suren, 5);
  suren.setupPhase = false;
  assert.equal("noAirDefense" in oyuncu(tel(suren)), false, "dalga sirasinda uyari geldi");
});

test("takim arkadasinin hava kulesi oyuncunun uyarisini kaldirmiyor", () => {
  const room = oda("onur");
  const p1 = room.state.players.get("p1");
  room.state.players.set("p2", {
    ...p1,
    id: "p2",
    name: "Arkadas",
    characterId: "warrior",
    runModifiers: [],
    ownedShopItemIds: [],
    inventoryItemIds: [],
    ownedCardIds: [],
    hiredWorkers: [],
    shopOffers: []
  });
  kurulumaGec(room, 5);
  kur(room, "warrior-1", "p2");

  const snapshot = tel(room);
  assert.equal(oyuncu(snapshot, "p1").noAirDefense, true, "arkadasin kulesi oyuncuyu korumus sayildi");
  assert.equal("noAirDefense" in oyuncu(snapshot, "p2"), false);
});
