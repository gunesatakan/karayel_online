/**
 * Menzil turu, ikinci kisim: iki kart (Genis Ufuk, Pusu Nobeti) ve alti esya
 * (Av Kayit Defteri, Erim Pompasi, Kinetik Uzatici, Tork Radyatoru, Uzatma
 * Halkasi, Uzun Erim Optigi). Karsit ciftler (Atis Haritasi / Av Kayit
 * Defteri, Erim Pompasi / Kinetik Uzatici), cevrimlerin geri beslemesizligi
 * ve tavanlar gercek odada olculuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  AMBUSH_RANGE_HOLD_MS,
  AMBUSH_RANGE_IDLE_MS,
  GAME_SPEED_MULTIPLIER,
  KILL_RANGE_LONG_MAX_KILLS,
  canEquipShopItem,
  cardCatalog,
  getInventoryEquipRejectedCue,
  getMapGridSize,
  getModifierAdd,
  getShopItem,
  isShopItemAvailable,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { clearBuildZones, createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const near = (actual, expected, label = "", epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label} ${actual} != ${expected}`);
const item = (id) => getShopItem(id);
const itemAdd = (itemId, stat) => getModifierAdd(item(itemId).effects, stat);
const card = (id) => cardCatalog.find((entry) => entry.id === id);
const allTowers = Object.values(towerCatalog).flat();
const kule = (id) => allTowers.find((tower) => tower.id === id);
const oyunMs = (gameMs) => gameMs / GAME_SPEED_MULTIPLIER;

function oda() {
  const room = clearBuildZones(createRoom("warrior"));
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

function yaninaKur(room, tower, definitionId = "warrior-4") {
  const grid = getMapGridSize(room.activeMap);
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = tower.x + dc * grid;
    const y = tower.y + dr * grid;
    if (!room.canPlaceTower(x, y, definitionId, "horizontal")) continue;
    room.placeTower(client, { x, y, definitionId });
    return [...room.towers.values()].at(-1);
  }
  return undefined;
}

function esyaVer(room, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
}

function esyaTak(room, tower, itemId) {
  esyaVer(room, itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} takilamadi`);
}

function kartAl(room, cardId) {
  room.pendingCardChoices.set("p1", [card(cardId)]);
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

function saatli(fn) {
  const realNow = Date.now;
  const clock = { now: 1_900_000_000_000 };
  Date.now = () => clock.now;
  try {
    return fn(clock);
  } finally {
    Date.now = realNow;
  }
}

test("Genis Ufuk: butun kulelere duz menzil", () => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerRange(tower);
  kartAl(room, "genis-ufuk");
  near(room.getTowerRange(tower) / base, 1 + getModifierAdd(card("genis-ufuk").effects, "range"), "Genis Ufuk", 1e-6);
});

test("Pusu Nobeti: bosta bekleyen hasar kulesi uzak gorur; pusudan sonraki vurustan 2 sn sonra pay kalkar", () => saatli((clock) => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerRange(tower);
  kartAl(room, "pusu-nobeti");
  const ratio = 1 + getModifierAdd(card("pusu-nobeti").effects, "ambushRange");
  near(room.getTowerRange(tower) / base, ratio, "hic vurmamis kule pusuda", 1e-6);
  const target = dusman(room, tower.x + getMapGridSize(room.activeMap), tower.y);
  const vur = () => room.damageEnemy(target, 1, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id, "impact");
  vur();
  near(room.getTowerRange(tower) / base, ratio, "ilk vurus penceresi", 1e-6);
  clock.now += oyunMs(AMBUSH_RANGE_HOLD_MS / 2);
  vur();
  clock.now += oyunMs(AMBUSH_RANGE_HOLD_MS / 2 + 50);
  near(room.getTowerRange(tower), base, "pencere bitti, kule vuruyor");
  // Ard arda vurus pencereyi yeniden acmiyor.
  vur();
  near(room.getTowerRange(tower), base, "ard arda vurus");
  clock.now += oyunMs(AMBUSH_RANGE_IDLE_MS + 10);
  near(room.getTowerRange(tower) / base, ratio, "yeniden pusuda", 1e-6);

  // Hasar vermeyen kule (yavaslatma aurasi) hic vurmadigi icin pusuda kalmasin.
  const aura = kur(room, "warrior-3");
  const auraBase = room.getTowerOwnRange(aura);
  aura.runModifiers.push({ source: "test", scope: "tower", stat: "ambushRange", add: 0.2 });
  near(room.getTowerRange(aura), auraBase, "hasarsiz kule");
}));

test("Av Kayit Defteri: -%5 tabandan oldurme basina +%3, 16 oldurme tavani; yeni dalgada sifir", () => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerRange(tower);
  esyaTak(room, tower, "av-kayit-defteri");
  const malus = itemAdd("av-kayit-defteri", "range");
  const per = itemAdd("av-kayit-defteri", "killRangeLong");
  near(room.getTowerRange(tower) / base, 1 + malus, "oldurmesiz", 1e-6);
  const cell = getMapGridSize(room.activeMap);
  const oldur = () => {
    const enemy = dusman(room, tower.x + cell, tower.y, { hp: 10, maxHp: 10 });
    room.damageEnemy(enemy, 1e9, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id, "impact");
  };
  for (let index = 0; index < 4; index += 1) oldur();
  near(room.getTowerRange(tower) / base, 1 + malus + 4 * per, "dort oldurme", 1e-6);
  for (let index = 0; index < KILL_RANGE_LONG_MAX_KILLS + 4; index += 1) oldur();
  near(room.getTowerRange(tower) / base, 1 + malus + KILL_RANGE_LONG_MAX_KILLS * per, "tavan", 1e-6);
  room.wave += 1;
  near(room.getTowerRange(tower) / base, 1 + malus, "yeni dalga", 1e-6);
});

test("karsit ciftler: Atis Haritasi / Av Kayit Defteri ve Erim Pompasi / Kinetik Uzatici ayni kuleye takilmiyor", () => {
  for (const [a, b] of [["atis-haritasi", "av-kayit-defteri"], ["erim-pompasi", "kinetik-uzatici"]]) {
    for (const [first, second] of [[a, b], [b, a]]) {
      const check = canEquipShopItem(item(second), kule("warrior-4"), [first]);
      assert.deepEqual(check, { ok: false, reason: "itemConflict" }, `${second} after ${first}`);
      const cue = getInventoryEquipRejectedCue({ itemId: second, reason: "itemConflict" });
      assert.ok(cue.text.includes(item(first).name), `ret metni karsit esyayi anmiyor: ${cue.text}`);
      // Vitrin karsiti takili tek kuleye ikinciyi sunmuyor.
      assert.equal(isShopItemAvailable(item(second), 10, [first], { towers: [{ definition: kule("warrior-4"), equippedItemIds: [first] }], inventoryItemIds: [] }), false);
    }
    // Gercek oda da reddediyor.
    const room = oda();
    const tower = kur(room);
    esyaTak(room, tower, a);
    esyaVer(room, b);
    room.equipShopItem(client, { itemId: b, towerId: tower.id });
    assert.equal(tower.equippedShopItemIds.includes(b), false, `${b} ${a} ile takildi`);
  }
});

test("Erim Pompasi: menzil bonusu mermi hizina; tavansiz", () => {
  const room = oda();
  const tower = kur(room);
  const speedBase = room.getTowerProjectileSpeedMultiplier(tower);
  const rangeBase = room.getTowerRange(tower);
  esyaTak(room, tower, "erim-pompasi");
  const own = itemAdd("erim-pompasi", "range");
  const [conversion] = item("erim-pompasi").conversions;
  near(room.getTowerRange(tower) / rangeBase, 1 + own, "kendi menzili", 1e-6);
  near(room.getTowerProjectileSpeedMultiplier(tower), speedBase + own * conversion.ratio, "menzilden mermi hizi", 1e-6);
  kartAl(room, "genis-ufuk");
  near(room.getTowerProjectileSpeedMultiplier(tower), speedBase + (own + 0.16) * conversion.ratio, "kartin menzili de sayiliyor", 1e-6);
  tower.runModifiers.push({ source: "test", scope: "tower", stat: "range", add: 2 });
  near(room.getTowerProjectileSpeedMultiplier(tower), speedBase + (own + 0.16 + 2) * conversion.ratio, "tavan", 1e-6);
  const panel = room.getTowerStatsBlock(tower, "p1").ps;
  assert.ok(panel.s.some(([source, add]) => source === "shop:erim-pompasi" && Math.abs(add - (own + 0.16 + 2) * conversion.ratio) < 1e-3), "panel cevrimi gostermiyor");
});

test("Kinetik Uzatici: mermi hizi bonusu menzile; tavansiz", () => {
  const room = oda();
  const tower = kur(room);
  const rangeBase = room.getTowerRange(tower);
  esyaTak(room, tower, "kinetik-uzatici");
  const own = itemAdd("kinetik-uzatici", "projectileSpeed");
  const [conversion] = item("kinetik-uzatici").conversions;
  near(room.getTowerRange(tower) / rangeBase, 1 + own * conversion.ratio, "hizdan menzil", 1e-6);
  tower.runModifiers.push({ source: "test", scope: "tower", stat: "projectileSpeed", add: 3 });
  near(room.getTowerRange(tower) / rangeBase, 1 + (own + 3) * conversion.ratio, "tavansiz", 1e-6);
  const panel = room.getTowerStatsBlock(tower, "p1").r;
  assert.ok(panel.s.some(([source]) => source === "shop:kinetik-uzatici"), "panel cevrimi gostermiyor");
});

test("geri besleme yok: cevrimler kaynagi cevrimlerden once okuyor (Kinetik Erim + Erim Pompasi)", () => {
  const room = oda();
  const tower = kur(room);
  const speedBase = room.getTowerProjectileSpeedMultiplier(tower);
  const rangeBase = room.getTowerRange(tower);
  kartAl(room, "kinetik-erim");
  esyaTak(room, tower, "erim-pompasi");
  const kinetic = card("kinetik-erim");
  const kineticSpeed = getModifierAdd(kinetic.effects, "projectileSpeed");
  const [kineticConversion] = kinetic.conversions;
  const own = itemAdd("erim-pompasi", "range");
  const [pump] = item("erim-pompasi").conversions;
  // Kart yalnizca kendi (cevrimsiz) mermi hizini goruyor; pompa yalnizca cevrimsiz menzili.
  const expectedRange = 1 + own + kineticSpeed * kineticConversion.ratio;
  const expectedSpeed = speedBase + kineticSpeed + own * pump.ratio;
  for (let pass = 0; pass < 3; pass += 1) {
    near(room.getTowerRange(tower) / rangeBase, expectedRange, `menzil, okuma ${pass}`, 1e-6);
    near(room.getTowerProjectileSpeedMultiplier(tower), expectedSpeed, `mermi hizi, okuma ${pass}`, 1e-6);
  }
});

test("geri besleme yok: karsilikli direkli ve cevrimli iki kule kendi kendini cagirmiyor", () => {
  const room = oda();
  const a = kur(room);
  const b = yaninaKur(room, a);
  assert.ok(b, "bitisik kule kurulamadi");
  for (const tower of [a, b]) {
    esyaTak(room, tower, "gozcu-diregi");
    esyaTak(room, tower, "erim-pompasi");
  }
  room.collectNeighborRangeSources();
  const rangeA = room.getTowerRange(a);
  assert.ok(Number.isFinite(rangeA) && rangeA > 0);
  assert.ok(Number.isFinite(room.getTowerProjectileSpeedMultiplier(b)));
});

test("Tork Radyatoru: donus hizi bonusu sogumaya; tavansiz", () => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerCoolingPerSecond(tower);
  esyaTak(room, tower, "tork-radyatoru");
  const own = itemAdd("tork-radyatoru", "turnRate");
  const [conversion] = item("tork-radyatoru").conversions;
  near(room.getTowerCoolingPerSecond(tower) / base, 1 + own * conversion.ratio, "donusten soguma", 1e-6);
  tower.runModifiers.push({ source: "test", scope: "tower", stat: "turnRate", add: 3 });
  near(room.getTowerCoolingPerSecond(tower) / base, 1 + (own + 3) * conversion.ratio, "tavansiz", 1e-6);
});

test("Uzatma Halkasi uc kez yigiliyor; Uzun Erim Optigi menzil karsiligi atis hizi", () => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerRange(tower);
  const interval = room.getTowerFireInterval(tower);
  for (let index = 0; index < 3; index += 1) esyaTak(room, tower, "uzatma-halkasi");
  near(room.getTowerRange(tower) / base, 1 + 3 * itemAdd("uzatma-halkasi", "range"), "uc halka", 1e-6);
  assert.deepEqual(canEquipShopItem(item("uzatma-halkasi"), tower.definition, tower.equippedShopItemIds), { ok: false, reason: "itemLimit" });

  const room2 = oda();
  const tower2 = kur(room2);
  const base2 = room2.getTowerRange(tower2);
  const interval2 = room2.getTowerFireInterval(tower2);
  esyaTak(room2, tower2, "uzun-erim-optigi");
  near(room2.getTowerRange(tower2) / base2, 1 + itemAdd("uzun-erim-optigi", "range"), "optik menzil", 1e-6);
  near(room2.getTowerFireInterval(tower2) / interval2, 1 / (1 + itemAdd("uzun-erim-optigi", "fireRate")), "optik atis hizi", 1e-6);
  assert.ok(interval > 0);
});

test("ikinci kisim esyalari menzilin ya da kaynagin anlamsiz oldugu yapiya takilmiyor", () => {
  const resource = allTowers.find((tower) => tower.resourceProvider);
  const rangeItems = ["av-kayit-defteri", "erim-pompasi", "kinetik-uzatici", "uzatma-halkasi", "uzun-erim-optigi", "tork-radyatoru"];
  for (const id of rangeItems) {
    for (const towerId of ["wall-1", "warrior-2", "warehouse-1", "repair-depot-1", resource.id]) {
      assert.equal(canEquipShopItem(item(id), kule(towerId), []).ok, false, `${id} ${towerId}`);
    }
  }
  // Mermi atmayan nisanci kule (Debug Lazer) cevrimli mermi esyalarini almiyor, Tork Radyatoru'nu aliyor.
  assert.equal(canEquipShopItem(item("erim-pompasi"), kule("warrior-5"), []).ok, false);
  assert.equal(canEquipShopItem(item("kinetik-uzatici"), kule("warrior-5"), []).ok, false);
  assert.equal(canEquipShopItem(item("tork-radyatoru"), kule("warrior-5"), []).ok, true);
  // Nisan almayan alan kulesi Tork Radyatoru'nu almiyor ama sade menzil esyasini aliyor.
  assert.equal(canEquipShopItem(item("tork-radyatoru"), kule("warrior-3"), []).ok, false);
  assert.equal(canEquipShopItem(item("uzatma-halkasi"), kule("warrior-3"), []).ok, true);
});

test("onizleme: Erim Pompasi menzil ve mermi hizi satirini once/sonra gosteriyor", () => {
  const room = oda();
  const tower = kur(room);
  esyaVer(room, "erim-pompasi");
  const sent = [];
  room.sendTowerPreview({ sessionId: "p1", send: (type, payload) => sent.push([type, payload]) }, { requestId: "r1", towerId: tower.id, itemId: "erim-pompasi" });
  const [, payload] = sent.find(([type]) => type === "tower:preview");
  assert.equal(payload.error, undefined, payload.error);
  const index = payload.lineKeys.indexOf("preview.stat.projectileSpeed");
  assert.ok(index >= 0, "mermi hizi satiri yok");
  assert.equal(payload.changed[index], true);
  assert.equal(payload.changed[payload.lineKeys.indexOf("preview.stat.range")], true);
});
