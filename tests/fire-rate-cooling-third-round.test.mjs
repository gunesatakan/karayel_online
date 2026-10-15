/**
 * Atis hizi, soguma ve isi, ucuncu tur: uc kart (Av Ritmi, Rolanti
 * Sogutmasi, Kritik Tahliye) ve uc esya (Kalabalik Besleyici, Acil Sogutma
 * Pompasi, Kriyo Kovan). Hicbiri onceki turlarin bir statunu buyutmuyor;
 * her biri atis hizini, sogumayi ya da isiyi sahadaki baska bir seye
 * bagliyor. Sayilar katalogdan ve `heat-mechanics` sabitlerinden okunuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CROWD_FIRE_RATE_MAX_ENEMIES,
  GAME_SPEED_MULTIPLIER,
  IDLE_COOLING_DELAY_MS,
  WOUNDED_FIRE_RATE_HP_RATIO,
  cardCatalog,
  getMapGridSize,
  getModifierAdd,
  getShopItem
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const near = (actual, expected, label = "", epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label} ${actual} != ${expected}`);
const itemAdd = (itemId, stat) => getModifierAdd(getShopItem(itemId).effects, stat);
const cardAdd = (cardId, stat) => getModifierAdd(cardCatalog.find((entry) => entry.id === cardId).effects, stat);

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.setupPhase = false;
  room.towerCriticalRandom = () => 1;
  return room;
}

function kur(room, definitionId = "warrior-4") {
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { ...spot, definitionId });
  return [...room.towers.values()].at(-1);
}

function esyaTak(room, tower, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} takilamadi`);
}

function kartAl(room, cardId) {
  const card = cardCatalog.find((entry) => entry.id === cardId);
  room.pendingCardChoices.set("p1", [card]);
  room.chooseCard(client, { cardId });
  assert.ok(room.state.players.get("p1").ownedCardIds.includes(cardId), `${cardId} secilemedi`);
}

function dusman(room, x, y, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0, type: "grunt", movementKind: "ground",
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides });
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return enemy;
}

const rate = (room, tower) => 1000 / room.getTowerFireInterval(tower);

test("Av Ritmi: hedefin cani yarinin altindayken atis hizi payi", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "av-ritmi");
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y, { hp: 1000, maxHp: 1000 });
  tower.aimTargetId = target.id;
  tower.turnTargetId = target.id;
  const full = rate(room, tower);
  target.hp = 1000 * WOUNDED_FIRE_RATE_HP_RATIO - 1;
  const wounded = rate(room, tower);
  near(wounded / full, (1 + cardAdd("av-ritmi", "woundedFireRate")) / 1, "atis hizi orani", 0.05);
  assert.ok(wounded > full * 1.3);
  const panel = room.getTowerStatsBlock(tower, "p1").f;
  assert.ok(panel.s.some(([source, add]) => source === "cond:fireRate" && add > 0), "panel kosullu payi gostermiyor");
});

test("Rolanti Sogutmasi: bir saniyedir vurmayan kule daha hizli soguyor", () => {
  const room = oda();
  const tower = kur(room);
  const realNow = Date.now;
  let clock = 1_900_000_000_000;
  Date.now = () => clock;
  try {
    const base = room.getTowerCoolingPerSecond(tower);
    kartAl(room, "rolanti-sogutmasi");
    const cell = getMapGridSize(room.activeMap);
    const target = dusman(room, tower.x + cell, tower.y);
    room.damageEnemy(target, 10, 0, tower.definition.id, "p1", "true", 0, 1, tower.id, "impact");
    near(room.getTowerCoolingPerSecond(tower), base, "vururken");
    clock += IDLE_COOLING_DELAY_MS / GAME_SPEED_MULTIPLIER + 1;
    near(room.getTowerCoolingPerSecond(tower) / base, 1 + cardAdd("rolanti-sogutmasi", "idleCooling"), "bosta", 1e-6);
  } finally {
    Date.now = realNow;
  }
});

test("Kritik Tahliye: kritik vurus atisin isisini atis basina bir kez geri atiyor", () => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "kritik-tahliye");
  tower.temperature = 60;
  tower.lastShotHeat = 12;
  tower.lastShotVented = false;
  const cell = getMapGridSize(room.activeMap);
  const a = dusman(room, tower.x + cell, tower.y);
  const b = dusman(room, tower.x + cell, tower.y + cell);
  room.towerCriticalRandom = () => 1;
  room.damageEnemy(a, 10, 0, tower.definition.id, "p1", "true", 0, 1, tower.id, "impact");
  near(tower.temperature, 60, "kritiksiz vurus isi atti");
  room.towerCriticalRandom = () => 0;
  room.damageEnemy(a, 10, 0, tower.definition.id, "p1", "true", 0, 1, tower.id, "impact");
  near(tower.temperature, 60 - 12 * cardAdd("kritik-tahliye", "critVent"), "kritik geri atma");
  room.damageEnemy(b, 10, 0, tower.definition.id, "p1", "true", 0, 1, tower.id, "impact");
  near(tower.temperature, 60 - 12 * cardAdd("kritik-tahliye", "critVent"), "ayni atis iki kez atildi");
});

test("Kalabalik Besleyici: menzildeki her dusman icin atis hizi, tavanli", () => {
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, "kalabalik-besleyici");
  const base = rate(room, tower);
  const per = itemAdd("kalabalik-besleyici", "crowdFireRate");
  dusman(room, tower.x + 5, tower.y);
  dusman(room, tower.x - 5, tower.y);
  near(rate(room, tower) / base, 1 + 2 * per, "iki dusman", 1e-6);
  for (let index = 0; index < CROWD_FIRE_RATE_MAX_ENEMIES + 4; index += 1) dusman(room, tower.x + index, tower.y + 3);
  near(rate(room, tower) / base, 1 + CROWD_FIRE_RATE_MAX_ENEMIES * per, "tavan", 1e-6);
  const range = room.getTowerRange(tower);
  const room2 = oda();
  const tower2 = kur(room2);
  esyaTak(room2, tower2, "kalabalik-besleyici");
  const base2 = rate(room2, tower2);
  dusman(room2, tower2.x + range * 1.5, tower2.y);
  near(rate(room2, tower2), base2, "menzil disi sayildi");
});

test("Acil Sogutma Pompasi: yalnizca isi kilidinde soguma payi", () => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerCoolingPerSecond(tower);
  esyaTak(room, tower, "acil-sogutma-pompasi");
  near(room.getTowerCoolingPerSecond(tower), base, "kilitsiz");
  tower.heatLocked = true;
  near(room.getTowerCoolingPerSecond(tower) / base, 1 + itemAdd("acil-sogutma-pompasi", "lockCooling"), "kilitte", 1e-6);
});

test("Kriyo Kovan: yavaslamis ya da donmus hedefe atis daha az isi", () => {
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, "kriyo-kovan");
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  tower.aimTargetId = target.id;
  tower.turnTargetId = target.id;
  const heat = room.getTowerShotHeat(tower);
  assert.ok(heat > 0);
  target.slowUntil = Date.now() + 10_000;
  near(room.getTowerShotHeat(tower) / heat, 1 - itemAdd("kriyo-kovan", "chilledHeatRelief"), "yavaslamis hedef", 1e-9);
  target.slowUntil = 0;
  room.applyEnemyStatusEffect(target, { type: "freeze", magnitude: 1, durationMs: 2000, stacking: "refresh" }, Date.now());
  near(room.getTowerShotHeat(tower) / heat, 1 - itemAdd("kriyo-kovan", "chilledHeatRelief"), "donmus hedef", 1e-9);
});
