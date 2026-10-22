/**
 * Saray Arsivi (zeynep-7) AURA kulesi.
 *
 * 1. Sayilar tek yerde (`zeynep-palace`): kurulum 500 altin, azami 5. seviye,
 *    gelistirme 300/400/500/600 altin; sunucu da bu bedelleri tahsil ediyor.
 * 2. Kapsama: sahibin kulesi, merkezi arsivin merkezinden 2,5 kare icinde;
 *    disarisi, baska oyuncunun kulesi ve tazelenmemis arsiv etki vermiyor.
 * 3. 1. seviye soguma +%40, 2. seviye menzil +%15 (kosullu havuz, tavanli).
 * 4. 3.-5. seviye sentez paylari yalnizca alandaki Taht Muhru'ne.
 * 5. Iki arsiv yigilmiyor: en yuksek seviyeli arsiv sayiliyor.
 * 6. Panel: soguma ve menzil dokumunde kaynak `tower:zeynep-7`; arsivin
 *    kendi panelinde kapsama ve etkiler.
 * 7. Dizilime girmiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  RANGE_CONDITIONAL_CAP,
  TOWER_GRID_SIZE,
  ZEYNEP_PALACE_AURA_RADIUS,
  ZEYNEP_PALACE_AURA_RADIUS_CELLS,
  ZEYNEP_PALACE_BUILD_GOLD,
  ZEYNEP_PALACE_MAX_LEVEL,
  canJoinZeynepFormation,
  getMapGridSize,
  getTowerBuildCost,
  getTowerLevelExpCost,
  getTowerLevelGoldCost,
  getTowerMaxLevel,
  getZeynepPalaceEffects,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const definitions = new Map(Object.values(towerCatalog).flat().map((definition) => [definition.id, definition]));
const def = (id) => definitions.get(id);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

/** Arsivi kurar ve auranin tazelenmis oldugunu varsayar (tik beklemeden). */
function setup() {
  const room = createRoom("zeynep");
  const spot = findBuildableSpot(room, "zeynep-7");
  assert.ok(spot, "arsiv icin yer yok");
  const goldBefore = room.state.players.get("p1").gold;
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "zeynep-7", orientation: "horizontal" });
  const palace = [...room.towers.values()].find((tower) => tower.definition.id === "zeynep-7");
  assert.ok(palace, "arsiv kurulamadi");
  power(palace);
  return { room, palace, grid: getMapGridSize(room.activeMap), paid: goldBefore - room.state.players.get("p1").gold };
}

function power(palace) {
  palace.auraExpiresAt = Number.MAX_SAFE_INTEGER;
  palace.wakeReadyAt = 0;
}

/** Arsivin yanina elle bir kule: konumu `(dx, dy)` kare, arsivin merkezinden. */
let nextId = 0;
function addTower(room, palace, definitionId, dx, dy, ownerId = "p1") {
  const grid = getMapGridSize(room.activeMap);
  const tower = {
    ...palace,
    id: `aux-${(nextId += 1)}`,
    definition: def(definitionId),
    characterId: "zeynep",
    ownerId,
    level: 1,
    x: palace.x + dx * grid,
    y: palace.y + dy * grid,
    runModifiers: [],
    equippedShopItemIds: [],
    targetedCardIds: [],
    temperature: 0,
    auraExpiresAt: 0
  };
  room.towers.set(tower.id, tower);
  return tower;
}

test("sayilar: kurulum 500 altin, azami 5. seviye, gelistirme 300/400/500/600, yaricap 2,5 kare", () => {
  const definition = def("zeynep-7");
  assert.equal(ZEYNEP_PALACE_BUILD_GOLD, 500);
  assert.equal(getTowerBuildCost(definition.cost), 500);
  assert.equal(getTowerMaxLevel(definition), 5);
  assert.equal(ZEYNEP_PALACE_MAX_LEVEL, 5);
  assert.deepEqual([1, 2, 3, 4].map((level) => getTowerLevelGoldCost(definition.cost, level, definition.id)), [300, 400, 500, 600]);
  assert.equal(getTowerLevelGoldCost(definition.cost, 5, definition.id), 0);
  // Oteki kuleler degismiyor.
  assert.equal(getTowerMaxLevel(def("zeynep-3")), 10);
  assert.equal(getTowerLevelGoldCost(def("zeynep-3").cost, 4, "zeynep-3"), getTowerLevelGoldCost(def("zeynep-3").cost, 4));
  near(ZEYNEP_PALACE_AURA_RADIUS, ZEYNEP_PALACE_AURA_RADIUS_CELLS * TOWER_GRID_SIZE, "yaricap");
  assert.equal(ZEYNEP_PALACE_AURA_RADIUS_CELLS, 2.5);
  // Aura sahibin kulelerine (Zeynep ve destek esyalarinin kurali).
  assert.equal(definition.engine.auras[0].scope, "owner");
  assert.equal(definition.engine.placement.footprintSpan, 2);
});

test("sunucu: kurulum 500 altin; gelistirme bedelleri tahsil ediliyor, 5. seviyede duruyor", () => {
  const { room, palace, paid } = setup();
  assert.equal(paid, 500);
  const player = room.state.players.get("p1");
  player.experience = 1_000_000;
  const paidGold = [];
  for (let step = 0; step < 6; step += 1) {
    const gold = player.gold;
    const experience = player.experience;
    const level = palace.level;
    room.upgradeTower({ sessionId: "p1", send() {} }, { towerId: palace.id });
    paidGold.push(gold - player.gold);
    if (palace.level > level) assert.equal(experience - player.experience, getTowerLevelExpCost(palace.definition.cost, level), `${level + 1}. seviye XP olagan formul`);
  }
  assert.equal(palace.level, 5);
  assert.deepEqual(paidGold, [300, 400, 500, 600, 0, 0]);
});

test("kapsama: 2,5 kare icinde evet, disarisi, baska oyuncu ve tazelenmemis arsiv hayir", () => {
  const { room, palace } = setup();
  const inside = addTower(room, palace, "zeynep-1", 1.5, 0.5);
  const corner = addTower(room, palace, "zeynep-1", 1.5, 1.5);
  const outside = addTower(room, palace, "zeynep-1", 2.5, 0.5);
  const foreign = addTower(room, palace, "zeynep-1", -1.5, 0.5, "p2");
  assert.equal(room.getZeynepPalaceCoverLevel(inside), 1);
  assert.equal(room.getZeynepPalaceCoverLevel(corner), 1);
  assert.equal(room.getZeynepPalaceCoverLevel(outside), 0);
  assert.equal(room.getZeynepPalaceCoverLevel(foreign), 0);
  assert.equal(room.getZeynepPalaceCoverLevel(palace), 0, "arsiv kendini etkilemiyor");
  assert.deepEqual(room.getZeynepPalaceCoveredTowers(palace).map((tower) => tower.id).sort(), [inside.id, corner.id].sort());

  palace.auraExpiresAt = 0;
  assert.equal(room.getZeynepPalaceCoverLevel(inside), 0, "tazelenmemis arsiv");
  power(palace);
  palace.hp = 0;
  assert.equal(room.getZeynepPalaceCoverLevel(inside), 0, "yikik arsiv");
});

test("1. seviye soguma +%40, 2. seviye menzil +%15; ikisi de yalnizca alanda", () => {
  const { room, palace } = setup();
  const inside = addTower(room, palace, "zeynep-1", 1.5, 0.5);
  const outside = addTower(room, palace, "zeynep-1", 3.5, 0.5);
  near(room.getTowerOwnCoolingPerSecond(inside) / room.getTowerOwnCoolingPerSecond(outside), 1.4, "1. seviye soguma");
  near(room.getTowerOwnRange(inside) / room.getTowerOwnRange(outside), 1, "1. seviyede menzil yok");

  palace.level = 2;
  near(room.getTowerOwnCoolingPerSecond(inside) / room.getTowerOwnCoolingPerSecond(outside), 1.4, "2. seviye soguma");
  near(room.getTowerOwnRange(inside) / room.getTowerOwnRange(outside), 1.15, "2. seviye menzil");
  near(room.getTowerConditionalRangeAdd(inside, room.getTowerRunModifiers(inside)), 0.15, "kosullu havuz");

  // Kosullu menzil tavanina sayiliyor: Yuksek bir kosullu bonusla toplam tavanda.
  inside.runModifiers.push({ source: "test", scope: "tower", stat: "ambushRange", add: 0.8 });
  near(room.getTowerConditionalRangeAdd(inside, room.getTowerRunModifiers(inside)), RANGE_CONDITIONAL_CAP, "tavan");

  // Arsivin kendi menzili aura yaricapi: seviyeyle buyumuyor.
  near(room.getTowerRange(palace), ZEYNEP_PALACE_AURA_RADIUS_CELLS * getMapGridSize(room.activeMap), "arsiv halkasi");
});

test("3.-5. seviye sentez paylari yalnizca alandaki Taht Muhru'ne", () => {
  const { room, palace } = setup();
  const seal = addTower(room, palace, "zeynep-3", 0.5, 1.5);
  const farSeal = addTower(room, palace, "zeynep-3", 4.5, 0.5);
  const expected = { 1: [0, 0, 0], 2: [0, 0, 0], 3: [1, 0, 0], 4: [1, 1000, 0], 5: [1, 1000, 1] };
  for (const [level, [pierce, burnMs, bounces]] of Object.entries(expected)) {
    palace.level = Number(level);
    const inside = room.getZeynepPalaceEffectsFor(seal);
    assert.deepEqual([inside.pierce, inside.burnMs, inside.bounces], [pierce, burnMs, bounces], `${level}. seviye`);
    const outside = room.getZeynepPalaceEffectsFor(farSeal);
    assert.deepEqual([outside.pierce, outside.burnMs, outside.bounces], [0, 0, 0], `${level}. seviye alan disi`);
  }

  // Atis yolu: cift Hiza delmesi ve cift Gosteri yanik suresi arsivden.
  palace.level = 5;
  const fakeEnemy = { id: "e1", x: seal.x + 10, y: seal.y, hp: 10, pathDistance: 1 };
  // Dusman her muhrun dibinde: menzil suzgeci iki muhur icin de geciyor.
  room.getEnemiesNear = (x, y) => [{ ...fakeEnemy, x: x + 5, y }];
  room.canTowerTargetEnemy = () => true;
  room.isEnemyBehindAegis = () => false;
  const pierces = [];
  room.spawnZeynepSynthesisProjectile = (_tower, _target, _damage, _speed, _type, pierceLimit) => pierces.push(pierceLimit);
  room.fireZeynepSynthesisDualProjectiles(seal);
  room.fireZeynepSynthesisDualProjectiles(farSeal);
  assert.equal(pierces[0] - pierces[1], 1, "alandaki muhur +1 delme");

  const burns = [];
  room.findBestZeynepShowcaseLine = () => undefined;
  room.damageEnemyFromTowerAs = () => {};
  room.addZeynepBurnLine = (_tower, _x1, _y1, _x2, _y2, _damage, durationMs) => burns.push(durationMs);
  room.fireZeynepSynthesisBurnImpact(seal, fakeEnemy);
  room.fireZeynepSynthesisBurnImpact(farSeal, fakeEnemy);
  assert.equal(burns[0] - burns[1], 1000, "alandaki muhur +1 sn yanik");
});

test("iki arsiv yigilmiyor: kule en yuksek seviyeli arsivin etkisini aliyor", () => {
  const { room, palace } = setup();
  const second = { ...palace, id: "palace-2", level: 4, x: palace.x + 2 * getMapGridSize(room.activeMap) };
  room.towers.set(second.id, second);
  palace.level = 2;
  const between = addTower(room, palace, "zeynep-3", 1, 1.5);
  const reference = addTower(room, palace, "zeynep-3", 8, 8);
  assert.equal(room.getZeynepPalaceCoverLevel(between), 4);
  const effects = room.getZeynepPalaceEffectsFor(between);
  assert.deepEqual(effects, getZeynepPalaceEffects(4));
  near(room.getTowerOwnCoolingPerSecond(between) / room.getTowerOwnCoolingPerSecond(reference), 1.4, "soguma tek kez");
  near(room.getTowerConditionalRangeAdd(between, room.getTowerRunModifiers(between)), 0.15, "menzil tek kez");
  assert.equal(effects.burnMs, 1000);
  // Iki arsiv birbirini guclendirmiyor.
  assert.equal(room.getZeynepPalaceCoverLevel(second), 0);
});

test("panel: soguma ve menzil dokumunde Saray Arsivi kaynak; arsivin panelinde kapsama ve etkiler", () => {
  const { room, palace } = setup();
  palace.level = 5;
  const inside = addTower(room, palace, "zeynep-1", 1.5, 0.5);
  const block = room.getTowerStatsBlock(inside, "p1");
  assert.deepEqual(block.hcs, [["tower:zeynep-7", 0.4]]);
  assert.ok(block.r.s.some(([source, add]) => source === "tower:zeynep-7" && Math.abs(add - 0.15) < 1e-6), JSON.stringify(block.r));

  const own = room.getTowerStatsBlock(palace, "p1");
  const effects = Object.fromEntries((own.fe ?? []).map(([kind, magnitude, durationMs]) => [kind, durationMs ?? magnitude]));
  assert.deepEqual(effects, { "arc:cover": 1, "arc:cooling": 0.4, "arc:range": 0.15, "arc:pierce": 1, "arc:burn": 1000, "arc:bounce": 1 });
  palace.level = 1;
  const levelOne = room.getTowerStatsBlock(palace, "p1").fe.map(([kind]) => kind);
  assert.deepEqual(levelOne, ["arc:cover", "arc:cooling"]);
});

test("arsiv dizilime girmiyor ve ates etmiyor", () => {
  assert.equal(canJoinZeynepFormation({ definition: def("zeynep-7") }), false);
  assert.equal(canJoinZeynepFormation({ definition: def("zeynep-3") }), true);
  assert.equal(def("zeynep-7").damage, 0);
});
