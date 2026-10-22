/**
 * Menzil turu: uc kart (Kenetlenme, Termal Mercek, Siper Gozcusu) ve uc esya
 * (Teleskopik Namlu, Atis Haritasi, Gozcu Diregi). Hicbiri duz "+%X menzil"
 * degil; her biri menzili sahadaki baska bir seye bagliyor. Sayilar katalogdan
 * ve `range-mechanics` sabitlerinden okunuyor; olcum gercek odada
 * (`getTowerRange`: hedefleme ve vurus kontrolu bunu okuyor).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FOCUS_RANGE_GRACE_MS,
  FOCUS_RANGE_MAX,
  GAME_SPEED_MULTIPLIER,
  KILL_RANGE_MAX_KILLS,
  NEIGHBOR_RANGE_MAX,
  RANGE_CONDITIONAL_CAP,
  WALL_RANGE_MAX_WALLS,
  canEquipShopItem,
  cardCatalog,
  getMapGridSize,
  getMapOrigin,
  getModifierAdd,
  getShopItem,
  isShopItemUsefulOnTower,
  towerCatalog,
  worldToGrid
} from "../packages/shared/dist/index.js";
import { clearBuildZones, createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const near = (actual, expected, label = "", epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label} ${actual} != ${expected}`);
const itemAdd = (itemId, stat) => getModifierAdd(getShopItem(itemId).effects, stat);
const cardAdd = (cardId, stat) => getModifierAdd(cardCatalog.find((entry) => entry.id === cardId).effects, stat);
const allTowers = Object.values(towerCatalog).flat();
const kule = (id) => allTowers.find((tower) => tower.id === id);

test("menzil bonuslari iki kat: duz, kosullu, kare ve cevrim tavanlari", () => {
  const cards = [
    ["uzun-namlu", "range", 0.2], ["keskin-nisanci-durbunu", "range", 0.2],
    ["genis-ufuk", "range", 0.16], ["kenetlenme", "focusRange", 0.1],
    ["termal-mercek", "heatRange", 0.4], ["siper-gozcusu", "wallRange", 0.1],
    ["pusu-nobeti", "ambushRange", 0.4]
  ];
  const items = [
    ["lazer-telemetre", "range", 0.2], ["genlesme-odasi", "range", 0.16],
    ["gauss-bobini", "range", 0.06], ["teleskopik-namlu", "rangeFlat", 0.5],
    ["atis-haritasi", "killRange", 0.06], ["gozcu-diregi", "neighborRange", 0.2],
    ["av-kayit-defteri", "killRangeLong", 0.03], ["erim-pompasi", "range", 0.16],
    ["uzatma-halkasi", "range", 0.12], ["uzun-erim-optigi", "range", 0.36]
  ];
  for (const [id, stat, value] of cards) near(cardAdd(id, stat), value, id);
  for (const [id, stat, value] of items) near(itemAdd(id, stat), value, id);
  assert.equal(FOCUS_RANGE_MAX, 0.4);
  assert.equal(NEIGHBOR_RANGE_MAX, 0.4);
  assert.equal(RANGE_CONDITIONAL_CAP, 0.7);
  assert.deepEqual(cardCatalog.find((c) => c.id === "kinetik-erim").conversions, [{ from: "projectileSpeed", to: "range", ratio: 0.4 }]);
  assert.deepEqual(getShopItem("kinetik-uzatici").conversions, [{ from: "projectileSpeed", to: "range", ratio: 0.6 }]);
  near(itemAdd("av-kayit-defteri", "range"), -0.05, "menzil cezasi ayni");
  near(cardAdd("hizlandirici-bobin", "range"), -0.08, "menzil cezasi ayni");
});

test("Yalniz Nisanci ve Yalniz Kurt komsusuz kuleye yuzde 30 menzil verir", () => {
  for (const source of ["card", "item"]) {
    const room = oda();
    const tower = kur(room);
    room.isTowerIsolated = () => true;
    const base = room.getTowerRange(tower);
    if (source === "card") kartAl(room, "yalniz-nisanci");
    else esyaTak(room, tower, "yalniz-kurt");
    near(room.getTowerRange(tower) / base, 1.3, source);
  }
});

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

/** Kulenin karesinin `dc, dr` kadar yanina kurar; kurulamazsa `undefined`. */
function yaninaKur(room, tower, dc, dr, definitionId = "warrior-4") {
  const grid = getMapGridSize(room.activeMap);
  const x = tower.x + dc * grid;
  const y = tower.y + dr * grid;
  if (!room.canPlaceTower(x, y, definitionId, "horizontal")) return undefined;
  const before = room.towers.size;
  room.placeTower(client, { x, y, definitionId });
  return room.towers.size > before ? [...room.towers.values()].at(-1) : undefined;
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

/** Kulenin karesinin bir kenarina duvar orer; orulemezse `false`. */
function duvar(room, tower, side) {
  const grid = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const { col, row } = worldToGrid(tower.x, tower.y, room.activeMap);
  const point = {
    top: { x: origin.x + col * grid + grid / 2, y: origin.y + row * grid },
    bottom: { x: origin.x + col * grid + grid / 2, y: origin.y + (row + 1) * grid },
    left: { x: origin.x + col * grid, y: origin.y + row * grid + grid / 2 },
    right: { x: origin.x + (col + 1) * grid, y: origin.y + row * grid + grid / 2 }
  }[side];
  const before = room.towers.size;
  room.placeTower(client, { ...point, definitionId: "wall-1" });
  return room.towers.size > before;
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

/** Oyun saniyesi kadar duvar saati. */
const oyunMs = (gameMs) => gameMs / GAME_SPEED_MULTIPLIER;

test("Kenetlenme: ayni hedefe ates suresiyle buyuyor, tavanli; hedef degisince, olunce ya da ara verince sifir", () => saatli((clock) => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerRange(tower);
  kartAl(room, "kenetlenme");
  near(room.getTowerRange(tower), base, "karti almak tek basina menzil vermiyor");
  const per = cardAdd("kenetlenme", "focusRange");
  const cell = getMapGridSize(room.activeMap);
  const a = dusman(room, tower.x + cell, tower.y);
  const b = dusman(room, tower.x - cell, tower.y);

  room.updateTowerFocusRange(tower, a.id, clock.now);
  near(room.getTowerRange(tower), base, "ilk atis");
  for (let second = 1; second <= 2; second += 1) {
    clock.now += oyunMs(1000);
    room.updateTowerFocusRange(tower, a.id, clock.now);
  }
  near(room.getTowerRange(tower) / base, 1 + 2 * per, "iki saniye", 1e-6);
  for (let second = 3; second <= 10; second += 1) {
    clock.now += oyunMs(1000);
    room.updateTowerFocusRange(tower, a.id, clock.now);
  }
  near(room.getTowerRange(tower) / base, 1 + FOCUS_RANGE_MAX, "tavan", 1e-6);
  const panel = room.getTowerStatsBlock(tower, "p1").r;
  assert.ok(panel.s.some(([source, add]) => source === "cond:range" && Math.abs(add - FOCUS_RANGE_MAX) < 1e-3), "panel kosullu menzili gostermiyor");

  // Hedef degisti: saat yeniden basliyor.
  room.updateTowerFocusRange(tower, b.id, clock.now);
  near(room.getTowerRange(tower), base, "hedef degisti");
  clock.now += oyunMs(2000);
  room.updateTowerFocusRange(tower, b.id, clock.now);
  near(room.getTowerRange(tower) / base, 1 + 2 * per, "yeni hedefte iki saniye", 1e-6);
  // Atis arasi tolerans asildi: kazanc dusuyor ve sonraki atis sifirdan.
  clock.now += oyunMs(FOCUS_RANGE_GRACE_MS + 100);
  near(room.getTowerRange(tower), base, "ara verdi");
  room.updateTowerFocusRange(tower, b.id, clock.now);
  near(room.getTowerRange(tower), base, "aradan sonra sifirdan");
  clock.now += oyunMs(1000);
  room.updateTowerFocusRange(tower, b.id, clock.now);
  b.hp = 0;
  near(room.getTowerRange(tower), base, "hedef oldu");
}));

test("Kenetlenme: gercek atis dongusunde ayni hedefe ates eden kule tavana ulasiyor", () => saatli((clock) => {
  const room = oda();
  const tower = kur(room);
  kartAl(room, "kenetlenme");
  const base = room.getTowerRange(tower);
  const target = dusman(room, tower.x + getMapGridSize(room.activeMap), tower.y, { speed: 0, baseSpeed: 0 });
  const tickMs = 50;
  for (let tick = 0; tick < 240; tick += 1) {
    clock.now += tickMs;
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateTowers(tickMs * GAME_SPEED_MULTIPLIER);
    Object.assign(tower, { ammo: tower.maxAmmo, energy: tower.maxEnergy, temperature: 0, heatLocked: false });
  }
  assert.equal(tower.focusRangeTargetId, target.id);
  near(room.getTowerRange(tower) / base, 1 + FOCUS_RANGE_MAX, "atis dongusu", 1e-6);
}));

test("Kenetlenme: kartsiz kulede atis hicbir sey yazmiyor", () => {
  const room = oda();
  const tower = kur(room);
  room.updateTowerFocusRange(tower, "dusman-1", Date.now());
  assert.equal(tower.focusRangeTargetId, undefined);
});

test("Termal Mercek: 50 dereceden 100 dereceye 10 derecelik basamaklarla, 100'de tam pay", () => {
  const room = oda();
  const tower = kur(room);
  tower.temperature = 0;
  const base = room.getTowerRange(tower);
  kartAl(room, "termal-mercek");
  const full = cardAdd("termal-mercek", "heatRange");
  for (const [temperature, ratio] of [[0, 0], [50, 0], [59, 0], [60, 0.2], [75, 0.4], [80, 0.6], [100, 1], [130, 1]]) {
    tower.temperature = temperature;
    near(room.getTowerRange(tower) / base, 1 + full * ratio, `${temperature} derece`, 1e-6);
  }
});

test("Siper Gozcusu: kulenin kenarindaki her duvar, en fazla uc duvar", () => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerRange(tower);
  kartAl(room, "siper-gozcusu");
  const per = cardAdd("siper-gozcusu", "wallRange");
  near(room.getTowerRange(tower), base, "duvarsiz");
  let walls = 0;
  for (const side of ["top", "bottom", "left", "right"]) {
    if (!duvar(room, tower, side)) continue;
    walls += 1;
    near(room.getTowerRange(tower) / base, 1 + per * Math.min(WALL_RANGE_MAX_WALLS, walls), `${walls} duvar`, 1e-6);
  }
  assert.ok(walls >= 2, `en az iki duvar orulmeliydi (${walls})`);
  // Duvarin olduklari sayilmiyor.
  const wall = [...room.towers.values()].filter((entry) => entry.definition.id === "wall-1").at(-1);
  wall.hp = 0;
  room.edgeStructureIndexDirty = true;
  near(room.getTowerRange(tower) / base, 1 + per * Math.min(WALL_RANGE_MAX_WALLS, walls - 1), "yikik duvar", 1e-6);
});

test("Teleskopik Namlu: taban menzile duz kare; kisa menzilli kulede orani buyuk", () => {
  const tiles = itemAdd("teleskopik-namlu", "rangeFlat");
  const olc = (definitionId) => {
    const room = oda();
    const tower = kur(room, definitionId);
    const base = room.getTowerRange(tower);
    esyaTak(room, tower, "teleskopik-namlu");
    const after = room.getTowerRange(tower);
    const cell = getMapGridSize(room.activeMap);
    near(after - base, tiles * cell, `${definitionId} duz kare`, 1e-6);
    // Panel duz kareyi esyanin carpani olarak yaziyor.
    const panel = room.getTowerStatsBlock(tower, "p1").r;
    assert.ok(panel.m.some(([source, multiplier]) => source === "shop:teleskopik-namlu" && Math.abs(multiplier - after / base) < 1e-3), "panel duz kareyi gostermiyor");
    return after / base;
  };
  const short = olc("warrior-3");
  const long = olc("warrior-1");
  assert.ok(kule("warrior-3").range < kule("warrior-1").range);
  assert.ok(short > long, `kisa menzilli kule daha cok kazanmali (${short} / ${long})`);
});

test("Teleskopik Namlu: AttackLord'un seviye kurali korunuyor, duz kare seviyeyle buyumuyor", () => {
  const tiles = itemAdd("teleskopik-namlu", "rangeFlat");
  const room = oda();
  const tower = kur(room, "warrior-4");
  esyaTak(room, tower, "teleskopik-namlu");
  const cell = getMapGridSize(room.activeMap);
  const withFlat = room.getTowerRange(tower);
  const without = room.getTowerOwnRange(tower, false);
  near(withFlat - without, tiles * cell, "seviye 1");
  tower.level = 5;
  near(room.getTowerRange(tower) - room.getTowerOwnRange(tower, false), tiles * cell, "seviye 5");
});

test("Atis Haritasi: dalgadaki her oldurme, tavanli; yeni dalgada sifir", () => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerRange(tower);
  esyaTak(room, tower, "atis-haritasi");
  const per = itemAdd("atis-haritasi", "killRange");
  const cell = getMapGridSize(room.activeMap);
  const oldur = () => {
    const enemy = dusman(room, tower.x + cell, tower.y, { hp: 10, maxHp: 10 });
    room.damageEnemy(enemy, 1e9, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id, "impact");
  };
  oldur();
  oldur();
  near(room.getTowerRange(tower) / base, 1 + 2 * per, "iki oldurme", 1e-6);
  for (let index = 0; index < KILL_RANGE_MAX_KILLS + 3; index += 1) oldur();
  near(room.getTowerRange(tower) / base, 1 + KILL_RANGE_MAX_KILLS * per, "tavan", 1e-6);
  room.wave += 1;
  near(room.getTowerRange(tower), base, "yeni dalga");
  oldur();
  near(room.getTowerRange(tower) / base, 1 + per, "yeni dalgada ilk oldurme", 1e-6);
});

test("Gozcu Diregi: bitisikteki dost kuleye pay, kendisine degil; iki direk tavan", () => {
  const room = oda();
  const center = kur(room);
  const mast = yaninaKur(room, center, 1, 0) ?? yaninaKur(room, center, -1, 0) ?? yaninaKur(room, center, 0, 1) ?? yaninaKur(room, center, 0, -1);
  assert.ok(mast, "bitisik kule kurulamadi");
  const centerBase = room.getTowerRange(center);
  const mastBase = room.getTowerRange(mast);
  esyaTak(room, mast, "gozcu-diregi");
  room.collectNeighborRangeSources();
  const per = itemAdd("gozcu-diregi", "neighborRange");
  near(room.getTowerRange(center) / centerBase, 1 + per, "komsu", 1e-6);
  near(room.getTowerRange(mast), mastBase, "direk kendine menzil vermiyor");
  const panel = room.getTowerStatsBlock(center, "p1").r;
  assert.ok(panel.s.some(([source]) => source === "cond:range"), "panel komsu payini gostermiyor");

  // Uc direk: tavan iki direk kadar.
  const extra = [];
  for (const [dc, dr] of [[-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [1, 0]]) {
    if (extra.length >= 2) break;
    const placed = yaninaKur(room, center, dc, dr);
    if (placed) extra.push(placed);
  }
  for (const tower of extra) esyaTak(room, tower, "gozcu-diregi");
  room.collectNeighborRangeSources();
  near(room.getTowerRange(center) / centerBase, 1 + Math.min(NEIGHBOR_RANGE_MAX, per * (1 + extra.length)), "tavan", 1e-6);
  if (extra.length >= 2) assert.ok(per * 3 > NEIGHBOR_RANGE_MAX, "tavan sinanmadi");

  // Yikilan direk pay vermiyor.
  for (const tower of [mast, ...extra]) tower.hp = 0;
  near(room.getTowerRange(center), centerBase, "yikik direk");
});

test("kosullu menzil paylarinin toplami tavanli", () => {
  const room = oda();
  const tower = kur(room);
  const base = room.getTowerRange(tower);
  tower.runModifiers.push({ source: "card:termal-mercek", scope: "tower", stat: "heatRange", add: 2 });
  tower.temperature = 100;
  near(room.getTowerRange(tower) / base, 1 + RANGE_CONDITIONAL_CAP, "tavan", 1e-6);
  // Duz yuzde (`range`) tavanin disinda.
  tower.runModifiers.push({ source: "card:uzun-namlu", scope: "tower", stat: "range", add: 0.1 });
  near(room.getTowerRange(tower) / base, 1 + RANGE_CONDITIONAL_CAP + 0.1, "duz yuzde ustune", 1e-6);
});

test("menzil esyalari menzilin anlamsiz oldugu yapiya takilmiyor", () => {
  const flat = getShopItem("teleskopik-namlu");
  const kill = getShopItem("atis-haritasi");
  const mast = getShopItem("gozcu-diregi");
  // Duvar, kaynak binasi, depo ve haritayi kaplayan Sunucu: menzilin bir sey degistirmedigi yapilar.
  const resource = allTowers.find((tower) => tower.resourceProvider);
  for (const id of ["wall-1", "warrior-2", "warehouse-1", resource.id]) {
    assert.equal(canEquipShopItem(flat, kule(id), []).ok, false, `Teleskopik Namlu ${id}`);
    assert.equal(canEquipShopItem(kill, kule(id), []).ok, false, `Atis Haritasi ${id}`);
  }
  // Saldiri kulesi ve alan kulesi (menzil aura yaricapi) aliyor.
  assert.equal(isShopItemUsefulOnTower(flat, kule("warrior-4")), true);
  const auraTower = allTowers.find((tower) => (tower.engine?.auras ?? []).some((aura) => aura.affects === "enemies") && tower.range > 0);
  if (auraTower) assert.equal(isShopItemUsefulOnTower(flat, auraTower), true, `alan kulesi ${auraTower.id}`);
  // Gozcu Diregi komsuya isliyor: ates etmeyen yapiya da takiliyor.
  assert.equal(canEquipShopItem(mast, kule("wall-1"), []).ok, true);
  assert.equal(canEquipShopItem(mast, kule("warrior-4"), []).ok, true);
});
