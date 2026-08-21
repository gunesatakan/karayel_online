/**
 * Duvar sistemi.
 *
 * Duvar ayri bir varlik turu degil, bir kule varyanti: yerlestirme, can, hasar,
 * satis ve yukseltme hatti oldugu gibi calisiyor. Duvara ozel olan uc sey var --
 * ne kadar dayandigi, kalinlastirilabilmesi ve onarilabilmesi -- ve testler
 * bunlari sabitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  STRUCTURE_BREACH_HEALTH_RATIO,
  WALL_TOWER_ID,
  getCharacterTowers,
  getStructureHealthMultiplier,
  getStructureRepairCost,
  getStructureTravelCost,
  getTowerBuildCost,
  isSharedStructure,
  towerCatalog,
  wallTower
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function buildWall(characterId = "warrior") {
  const room = createRoom(characterId);
  const spot = findBuildableSpot(room, WALL_TOWER_ID);
  assert.ok(spot, "duvar icin kare bulunamadi");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: WALL_TOWER_ID });
  const wall = [...room.towers.values()][0];
  assert.ok(wall, "duvar kurulamadi");
  return { room, wall, player: room.state.players.get("p1") };
}

test("duvar her karakterin listesinde var ama kimsenin kiti değil", () => {
  for (const characterId of Object.keys(towerCatalog)) {
    assert.ok(
      towerCatalog[characterId].some((tower) => tower.id === WALL_TOWER_ID),
      `${characterId} duvar kuramiyor`
    );
    assert.equal(
      getCharacterTowers(characterId).some((tower) => tower.id === WALL_TOWER_ID),
      false,
      `${characterId} kitinde duvar gorunuyor`
    );
  }
  assert.equal(isSharedStructure(wallTower), true);
});

test("duvar ateş etmez ve ucuzdur", () => {
  assert.equal(wallTower.damage, 0);
  assert.equal(wallTower.range, 0);
  const cheapest = Math.min(...getCharacterTowers("warrior").map((tower) => tower.cost));
  assert.ok(wallTower.cost < cheapest, "duvar en ucuz kuleden pahali");
});

test("duvarın canı kule tabanından yüksek ve kalınlaştırmayla büyür", () => {
  assert.ok(getStructureHealthMultiplier(wallTower, 1) > 1, "duvar normal kule kadar dayaniyor");
  assert.ok(
    getStructureHealthMultiplier(wallTower, 3) > getStructureHealthMultiplier(wallTower, 1),
    "kalinlastirma cani buyutmuyor"
  );
  // Silah kuleleri bundan etkilenmez.
  const tower = getCharacterTowers("warrior")[0];
  assert.equal(getStructureHealthMultiplier(tower, 1), 1);
  assert.equal(getStructureHealthMultiplier(tower, 10), 1);
});

test("kurulan duvar normal kuleden daha çok can taşır ve yolu daha pahalı yapar", () => {
  const { wall } = buildWall();
  const other = createRoom("warrior");
  const spot = findBuildableSpot(other, "warrior-1");
  other.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const tower = [...other.towers.values()][0];

  assert.ok(wall.maxHp > tower.maxHp, "duvar kuleden dayaniksiz");
  assert.ok(
    getStructureTravelCost(wall.hp) > getStructureTravelCost(tower.hp),
    "duvar yolu kuleden daha pahali yapmiyor"
  );
});

test("towerHealth kartları duvara da işler", () => {
  // Karar bilincli: duvar ormek roguelike katmaniyla sinerji tasisin.
  const room = createRoom("warrior");
  room.state.players.get("p1").runModifiers.push({ source: "card:kalin-zirh", scope: "player", stat: "towerHealth", add: 0.8 });
  const spot = findBuildableSpot(room, WALL_TOWER_ID);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: WALL_TOWER_ID });
  const buffed = [...room.towers.values()][0];

  const { wall } = buildWall();
  assert.ok(buffed.maxHp > wall.maxHp, "kart duvarin canini buyutmedi");
});

test("onarım eksik canla orantılı ve yeniden inşadan ucuz", () => {
  const buildCost = getTowerBuildCost(wallTower.cost);
  assert.equal(getStructureRepairCost(buildCost, 0), 0, "tam canli yapi bedel istiyor");
  assert.ok(getStructureRepairCost(buildCost, 1) < buildCost, "tam onarim yeniden insadan pahali");
  assert.ok(
    getStructureRepairCost(buildCost, 0.5) < getStructureRepairCost(buildCost, 1),
    "onarim eksik canla olceklenmiyor"
  );
});

test("hasarlı duvar altın karşılığı onarılır, yıkılan onarılmaz", () => {
  const { room, wall, player } = buildWall();
  const goldBefore = player.gold;
  wall.hp = wall.maxHp * 0.25;

  room.repairStructure(client, { towerId: wall.id });
  assert.equal(wall.hp, wall.maxHp, "duvar onarilmadi");
  assert.ok(player.gold < goldBefore, "onarim bedelsiz");

  // Yikilan duvar geri gelmez; oyuncu yeniden insa etmeli.
  wall.hp = 0;
  const goldAfterRepair = player.gold;
  room.repairStructure(client, { towerId: wall.id });
  assert.equal(wall.hp, 0, "yikilan duvar onarildi");
  assert.equal(player.gold, goldAfterRepair, "yikilan duvar icin altin alindi");
});

test("gedik uyarısı eşik geçilince bir kez yayılır", () => {
  const { room, wall } = buildWall();
  const events = [];
  room.broadcast = (type, payload) => { if (type === "structure:breach") events.push(payload); };

  // Esigin ustunde kalan hasar uyari uretmez.
  room.damageTower(wall, wall.maxHp * 0.2);
  assert.equal(events.length, 0, "esik asilmadan uyari yayildi");

  // Esigi gecince tek uyari.
  wall.hp = wall.maxHp * (STRUCTURE_BREACH_HEALTH_RATIO + 0.05);
  room.damageTower(wall, wall.maxHp * 0.1);
  assert.equal(events.length, 1, "gedik uyarisi yayilmadi");
  assert.equal(events[0].towerId, wall.id);

  room.damageTower(wall, 1);
  assert.equal(events.length, 1, "uyari her hasarda tekrarlaniyor");
});

test("onarılan duvar tekrar kırılırsa yeniden uyarır", () => {
  const { room, wall } = buildWall();
  const events = [];
  room.broadcast = (type, payload) => { if (type === "structure:breach") events.push(payload); };

  wall.hp = wall.maxHp * (STRUCTURE_BREACH_HEALTH_RATIO + 0.05);
  room.damageTower(wall, wall.maxHp * 0.1);
  assert.equal(events.length, 1);

  room.repairStructure(client, { towerId: wall.id });
  wall.hp = wall.maxHp * (STRUCTURE_BREACH_HEALTH_RATIO + 0.05);
  room.damageTower(wall, wall.maxHp * 0.1);
  assert.equal(events.length, 2, "onarim sonrasi ikinci gedik uyarilmadi");
});
