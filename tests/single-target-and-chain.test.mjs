/**
 * Tek hedefe atan kule alan silahina donusmemeli, sekme de siraya degil
 * yakinliga bakmali.
 *
 * Iki ayri hata, ayni koku paylasiyor: sahada gorulen davranis kule tanimindan
 * degil, kodun icine gomulmus bir yan kuraldan geliyordu.
 *
 * Birincisinde mermilerin alan yaricapina seviye basina sabit bir buyume
 * ekleniyordu ve bu **kosulsuzdu**. Hiza Emri tanimda sifir yaricap bildirdigi
 * halde mermisi 10. seviyede 45 birimlik bir patlama tasiyordu: delip iki
 * dusmana carpmasi gereken bir mermi surunun ortasinda hepsini birden
 * olduruyordu.
 *
 * Ikincisinde Ucube'nin elektrigi yalnizca hedefin **arkasindaki** dusmanlara
 * atliyordu ve mesafeye hic bakmiyordu. Kule surunun en gerisindekini vurdugunda
 * hicbir sey sekmiyor, sektiginde ise haritanin obur ucuna uzanabiliyordu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { TOWER_GRID_SIZE, getTowerSlowDurationMs, towerCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function kuleKur(characterId, definitionId, level = 1) {
  const room = createRoom(characterId);
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin kare yok`);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()][0];
  tower.level = level;
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;
  return { room, tower };
}

/** Bir atis uretip merminin alan yaricapini dondurur. */
function merminintYaricapi(characterId, definitionId, level) {
  const { room, tower } = kuleKur(characterId, definitionId, level);
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  room.spawnTowerProjectile(tower, enemy);
  return [...room.projectiles.values()].at(-1).aoeRadius;
}

test("alani olmayan kule seviye atlayinca alan kazanmaz", () => {
  // Tanimda sifir yaricap yazan her kule, her seviyede sifir kalmali.
  const alansizlar = Object.entries(towerCatalog).flatMap(([characterId, list]) =>
    list
      .filter((tower) => !tower.resourceProvider
        && (tower.engine?.attack?.radius ?? tower.aoeRadius ?? 0) === 0
        && (tower.engine?.attack?.executor ?? "ballistic") === "ballistic")
      .map((tower) => [characterId, tower.id])
  );
  assert.ok(alansizlar.length > 0, "alani olmayan mermi kulesi bulunamadi");

  for (const [characterId, definitionId] of alansizlar) {
    for (const level of [1, 2, 5, 10]) {
      assert.equal(
        merminintYaricapi(characterId, definitionId, level),
        0,
        `${definitionId} ${level}. seviyede alan kazandi`
      );
    }
  }
});

test("Hiza Emri her seviyede tek hedef silahi kalir", () => {
  for (const level of [1, 2, 5, 10]) {
    assert.equal(merminintYaricapi("zeynep", "zeynep-1", level), 0, `${level}. seviyede alan cikti`);
  }
});

test("alani olan kule seviyeyle buyumeye devam ediyor", () => {
  // Duzeltme buyumeyi kaldirmadi, yalnizca kosula bagladi: alani olan kule
  // seviye atladikca hala genisliyor.
  const alanli = Object.entries(towerCatalog).flatMap(([characterId, list]) =>
    list
      .filter((tower) => (tower.engine?.attack?.radius ?? tower.aoeRadius ?? 0) > 0
        && (tower.engine?.attack?.executor ?? "ballistic") === "ballistic")
      .map((tower) => [characterId, tower.id])
  )[0];
  assert.ok(alanli, "alani olan mermi kulesi bulunamadi");

  const [characterId, definitionId] = alanli;
  const birinci = merminintYaricapi(characterId, definitionId, 1);
  const onuncu = merminintYaricapi(characterId, definitionId, 10);
  assert.ok(birinci > 0, `${definitionId} 1. seviyede alansiz`);
  assert.ok(onuncu > birinci, `${definitionId} seviyeyle buyumuyor: ${birinci} -> ${onuncu}`);
});


/** Bir atis uretip merminin yavaslatma suresini dondurur. */
function merminintYavaslatmasi(characterId, definitionId, level) {
  const { room, tower } = kuleKur(characterId, definitionId, level);
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  room.spawnTowerProjectile(tower, enemy);
  return [...room.projectiles.values()].at(-1).slowMs;
}

test("yavaslatmasi olmayan kule seviye atlayinca yavaslatma kazanmaz", () => {
  // Alan hatasinin ikizi, ayni satirin iki alt satirinda duruyordu. Buyume
  // kosulsuzken yavaslatma bildirmeyen 22 kule 10. seviyede her vurusta 810 ms
  // yavaslatiyordu: kimsenin aciklamasinda yazmayan bir kontrol etkisi, ve
  // gercek kontrol kulelerinin kimligini bosa cikaran bir sey.
  const yavaslatmasizlar = Object.entries(towerCatalog).flatMap(([characterId, list]) =>
    list
      .filter((tower) => !tower.resourceProvider
        && getTowerSlowDurationMs(tower) === 0
        && (tower.engine?.attack?.executor ?? "ballistic") === "ballistic"
        && tower.hitType !== "none")
      .map((tower) => [characterId, tower.id])
  );
  assert.ok(yavaslatmasizlar.length > 0, "yavaslatmasiz mermi kulesi bulunamadi");

  for (const [characterId, definitionId] of yavaslatmasizlar) {
    for (const level of [1, 5, 10]) {
      assert.equal(
        merminintYavaslatmasi(characterId, definitionId, level),
        0,
        `${definitionId} ${level}. seviyede yavaslatma kazandi`
      );
    }
  }
});

test("yavaslatmasi olan kule seviyeyle buyumeye devam ediyor", () => {
  const yavaslatan = Object.entries(towerCatalog).flatMap(([characterId, list]) =>
    list
      .filter((tower) => getTowerSlowDurationMs(tower) > 0
        && (tower.engine?.attack?.executor ?? "ballistic") === "ballistic")
      .map((tower) => [characterId, tower.id])
  )[0];
  assert.ok(yavaslatan, "yavaslatan mermi kulesi bulunamadi");

  const [characterId, definitionId] = yavaslatan;
  const birinci = merminintYavaslatmasi(characterId, definitionId, 1);
  const onuncu = merminintYavaslatmasi(characterId, definitionId, 10);
  assert.ok(birinci > 0);
  assert.ok(onuncu > birinci, `${definitionId} seviyeyle buyumuyor: ${birinci} -> ${onuncu}`);
});
/** Ucube kurar, cevresine istenen noktalarda dusman koyar ve sekmeleri sayar. */
function sekmeSayisi(hedefNokta, komsuNoktalari) {
  const { room, tower } = kuleKur("warrior", "warrior-6");
  tower.ucubePerks = ["chain"];

  room.enemies.clear();
  const koy = (nokta, pathDistance) => {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    Object.assign(enemy, { x: nokta.x, y: nokta.y, pathDistance });
    return enemy;
  };
  // Hedef bilerek **en geride**: eski kural bu durumda hicbir sey sekmiyordu.
  const target = koy(hedefNokta, 0);
  komsuNoktalari.forEach((nokta, index) => koy(nokta, 100 + index * 10));

  room.beams.clear();
  room.applyPostHitEffects({
    id: "p-test", towerId: tower.id, definitionId: "warrior-6", kind: "tower", source: "tower",
    damage: 100, damageType: "electric", hitType: "impact", maxHealthDamageRatio: 0,
    aoeRadius: 0, slowMs: 0, pierceLimit: 1, piercedEnemyIds: [],
    x: target.x, y: target.y, vx: 0, vy: 0, targetId: target.id
  }, target);

  return [...room.beams.values()].filter((beam) => beam.definitionId === "warrior-6").length;
}

test("sekme hedef en gerideyken de calisiyor", () => {
  // Eski kural yalnizca hedefin arkasindakilere sekiyordu; en gerideki dusman
  // vurulunca hicbir sey olmuyordu. Oyuncunun gordugu duzensizlik buydu.
  const hedef = { x: 200, y: 300 };
  const yakin = [{ x: 210, y: 310 }, { x: 190, y: 290 }];
  assert.equal(sekmeSayisi(hedef, yakin), 2);
});

test("sekme yakindaki iki dusmanla sinirli", () => {
  const hedef = { x: 200, y: 300 };
  const bircok = [
    { x: 205, y: 305 }, { x: 195, y: 295 }, { x: 210, y: 300 }, { x: 200, y: 310 }
  ];
  assert.equal(sekmeSayisi(hedef, bircok), 2);
});

test("uzaktaki dusmana sekmiyor", () => {
  // Sinir kule izgarasinin iki karesi. Haritanin obur ucundaki bir dusmana
  // uzanan bir baglanti sekme degil, baska bir sey olurdu.
  const hedef = { x: 200, y: 300 };
  const uzak = [{ x: 200 + TOWER_GRID_SIZE * 6, y: 300 }];
  assert.equal(sekmeSayisi(hedef, uzak), 0);

  const sinirIcinde = [{ x: 200 + TOWER_GRID_SIZE * 2.5, y: 300 }];
  assert.equal(sekmeSayisi(hedef, sinirIcinde), 1);
});

test("sekme perki yokken hic sekmiyor", () => {
  const { room, tower } = kuleKur("warrior", "warrior-6");
  tower.ucubePerks = [];
  room.enemies.clear();
  room.spawnEnemy();
  const target = [...room.enemies.values()][0];
  Object.assign(target, { x: 200, y: 300, pathDistance: 0 });
  room.spawnEnemy();
  Object.assign([...room.enemies.values()].at(-1), { x: 205, y: 305, pathDistance: 100 });

  room.beams.clear();
  room.applyPostHitEffects({
    id: "p-test", towerId: tower.id, definitionId: "warrior-6", kind: "tower", source: "tower",
    damage: 100, damageType: "electric", hitType: "impact", maxHealthDamageRatio: 0,
    aoeRadius: 0, slowMs: 0, pierceLimit: 1, piercedEnemyIds: [],
    x: target.x, y: target.y, vx: 0, vy: 0, targetId: target.id
  }, target);

  assert.equal([...room.beams.values()].filter((beam) => beam.definitionId === "warrior-6").length, 0);
});
