/**
 * Hissedilen altin/XP ve "yukseltme hazir" isareti.
 *
 * Istemci kendi oldurmesinin kac altin getirdigini ancak sunucudan
 * ogrenebiliyor: odadaki herkes ayni payi aliyor ama carpan (kart, esya)
 * oyuncuya ozel. Buradaki testler oldurme olayindaki `g` alaninin oldurenin
 * gercek kazanci oldugunu, telde varsayilanlarin yazilmadigini, HUD sayiminin
 * gercek altini hic asmadigini ve "yukseltme hazir" kuralinin sunucunun
 * yukseltme kuraliyla ayni karari verdigini kilitliyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  CountUpValue,
  ENEMY_REWARD_MULTIPLIER,
  GOLD_COUNT_UP_MS,
  UPGRADE_READY_MARKER_LIMIT,
  getLumpGoldGain,
  getTowerLevelExpCost,
  getTowerLevelGoldCost,
  getUpgradeReadyTowerIds,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { toKillEventWire } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const goldGain = (add) => ({ source: "test", scope: { kind: "global" }, stat: "goldGain", add });

/** Zirhsiz, kalkansiz, direncsiz, tek vurusta olen dusman. */
function spawnFragileEnemy(room, reward = 12) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    hp: 5,
    maxHp: 5,
    shield: 0,
    maxShield: 0,
    armor: 0,
    reward,
    damageResistances: {},
    hitTypeResistances: {},
    statusResistances: {}
  });
  return enemy;
}

function twoPlayerRoom() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const p1 = room.state.players.get("p1");
  p1.gold = 0;
  p1.runModifiers = [goldGain(0.15)];
  room.state.players.set("p2", { ...p1, id: "p2", slot: 1, gold: 0, runModifiers: [goldGain(0.35)] });
  return room;
}

test("sunucu: oldurme olayi oldurenin kendi carpaniyla aldigi altini tasir", () => {
  const room = twoPlayerRoom();
  const share = Math.max(1, Math.round(12 * ENEMY_REWARD_MULTIPLIER));

  room.killEvents.clear();
  room.damageEnemy(spawnFragileEnemy(room), 50, 0, "skill", "p1", "true");
  const [byP1] = [...room.killEvents.values()];
  assert.equal(byP1.g, Math.floor(share * 1.15), "p1'in kendi +%15'i, tabana: kazanilandan fazlasi yazilmaz");
  assert.ok(byP1.g <= room.state.players.get("p1").gold, "dunyadaki \"+N\" gercek kazanci asmaz");
  // Dagitim degismedi: herkes tam payi kendi carpaniyla aliyor.
  assert.equal(room.state.players.get("p1").gold, share * 1.15);
  assert.equal(room.state.players.get("p2").gold, share * 1.35);

  room.killEvents.clear();
  room.damageEnemy(spawnFragileEnemy(room), 50, 0, "skill", "p2", "true");
  const [byP2] = [...room.killEvents.values()];
  assert.equal(byP2.g, Math.floor(share * 1.35), "oldurenin carpani, odadaki baskasininki degil (tabana)");
});

test("sunucu: sahipsiz oldurme olay yazmaz ama altin yine herkese gider", () => {
  const room = twoPlayerRoom();
  room.killEvents.clear();
  room.damageEnemy(spawnFragileEnemy(room), 50, 0, "skill", "", "true");
  assert.equal(room.killEvents.size, 0);
  assert.ok(room.state.players.get("p1").gold > 0);
});

test("sunucu: odada olmayan oldurenin olayinda altin alani yok", () => {
  const room = twoPlayerRoom();
  room.killEvents.clear();
  room.damageEnemy(spawnFragileEnemy(room), 50, 0, "skill", "gone", "true");
  const [event] = [...room.killEvents.values()];
  assert.ok(event, "olay yine yaziliyor (seri sayimi icin)");
  assert.equal(event.g, undefined);
});

test("tel: seri kademesi ve altin yoksa anahtar olarak da gitmez", () => {
  const base = { id: "k1", ownerId: "p1", enemyId: "e1", serverTime: 1000 };
  // Eskiden seri kademesi `undefined` degerle yaziliyordu; msgpack anahtari
  // yine gonderiyor (olcum: 77 B, yeni bicim altinla birlikte 66 B).
  assert.deepEqual(Object.keys(toKillEventWire({ ...base, streakTier: undefined, g: undefined, ttlMs: 2200 })).sort(), ["enemyId", "id", "ownerId", "serverTime"]);
  assert.deepEqual(toKillEventWire({ ...base, g: 0 }), base, "sifir altin yazilmaz");
  assert.deepEqual(toKillEventWire({ ...base, streakTier: "granted", g: 27, ttlMs: 5 }), { ...base, streakTier: "granted", g: 27 });

  const room = twoPlayerRoom();
  room.killEvents.clear();
  room.damageEnemy(spawnFragileEnemy(room), 50, 0, "skill", "p1", "true");
  const [wire] = room.getSnapshot().killEvents;
  assert.deepEqual(Object.keys(wire).sort(), ["enemyId", "g", "id", "ownerId", "serverTime"]);
  assert.equal(Number.isInteger(wire.g), true, "tam sayi: kesirli sayi telde dokuz bayt");
});

test("HUD sayimi: artis sayarak yetisir, gercek degeri hic asmaz, harcama aninda iner", () => {
  const counter = new CountUpValue(GOLD_COUNT_UP_MS);
  assert.equal(counter.set(120, 0), false, "ilk deger artis sayilmaz: baslangic altini sayilmiyor");
  assert.equal(counter.valueAt(0), 120);

  assert.equal(counter.set(138, 1000), true);
  let previous = counter.valueAt(1000);
  assert.equal(previous, 120, "sayim o anki degerden basliyor");
  for (let now = 1000; now <= 1000 + GOLD_COUNT_UP_MS; now += 10) {
    const value = counter.valueAt(now);
    assert.ok(value >= previous, "geriye sicramaz");
    assert.ok(value <= 138, "gercek degeri asmaz");
    previous = value;
  }
  assert.equal(counter.valueAt(1000 + GOLD_COUNT_UP_MS), 138);
  assert.equal(counter.isSettled(1000 + GOLD_COUNT_UP_MS), true);

  // Sayim surerken yeni artis: gorunen degerden devam, geri sicrama yok.
  counter.set(160, 2000);
  const midway = counter.valueAt(2100);
  assert.ok(midway > 138 && midway < 160);
  assert.equal(counter.set(190, 2100), true);
  assert.equal(counter.valueAt(2100), midway);

  // Harcama gorunen degerin altina: beklemeden iner.
  assert.equal(counter.set(40, 2150), false);
  assert.equal(counter.valueAt(2150), 40);
  assert.equal(counter.isSettled(2150), true);

  // Magaza acildi: sayim beklemeden gercek degere oturur.
  counter.set(90, 3000);
  counter.settle();
  assert.equal(counter.valueAt(3001), 90);

  counter.reset();
  assert.equal(counter.set(500, 4000), false, "yeni mac: ilk deger yine sayimsiz");
  assert.equal(counter.valueAt(4000), 500);
});

test("HUD sayimi: sayim surerken hedefin altina ama gorunenin ustune inen deger asilmaz", () => {
  const counter = new CountUpValue(GOLD_COUNT_UP_MS);
  counter.set(100, 0);
  counter.set(200, 0);
  const shown = counter.valueAt(50);
  assert.equal(counter.set(shown + 10, 50), false, "hedef dustu: artis sayilmaz, nabiz yok");
  for (let now = 50; now <= 400; now += 25) {
    assert.ok(counter.valueAt(now) <= shown + 10);
  }
});

test("cipin '+N'i yalnizca oldurmeyle gelmeyen altin icin", () => {
  assert.equal(getLumpGoldGain(undefined, 500, 0), 0, "ilk snapshot: onceki deger yok");
  assert.equal(getLumpGoldGain(300, 344, 0), 44, "dalga bonusu");
  assert.equal(getLumpGoldGain(300, 318, 1), 0, "oldurme altini dunyada ve sayimda zaten goruluyor");
  assert.equal(getLumpGoldGain(300, 250, 0), 0, "harcama etiket degil");
  assert.equal(getLumpGoldGain(300.6, 322.2, 0), 22, "HUD gibi tabana yuvarli");
});

/** Katalogdaki gercek bedellerle kule kaydi. */
function tower(id, definitionId, level, ownerId = "me", characterId = "warrior") {
  return { id, ownerId, characterId, definitionId, level };
}

test("yukseltme hazir: en ucuz uc yerel kule, duvar ve takim arkadasi haric", () => {
  const cost = (definitionId) => towerCatalog.warrior.find((definition) => definition.id === definitionId).cost;
  const towers = [
    tower("t1", "warrior-4", 1),
    tower("t2", "warrior-1", 2),
    tower("t3", "warrior-1", 1),
    tower("t4", "warrior-3", 1),
    tower("t5", "warrior-2", 1),
    tower("wall", "wall-1", 1),
    tower("mate", "warrior-1", 1, "mate"),
    tower("max", "warrior-1", 10)
  ];
  const ids = getUpgradeReadyTowerIds(towers, "me", { gold: 0, experience: 10_000 });
  assert.equal(ids.length, UPGRADE_READY_MARKER_LIMIT);
  const expOf = (entry) => getTowerLevelExpCost(cost(entry.definitionId), entry.level);
  const expected = towers
    .filter((entry) => ["t1", "t2", "t3", "t4", "t5"].includes(entry.id))
    .sort((a, b) => expOf(a) - expOf(b) || (a.id < b.id ? -1 : 1))
    .slice(0, 3)
    .map((entry) => entry.id);
  assert.deepEqual(ids, expected);
  assert.ok(!ids.includes("wall") && !ids.includes("mate") && !ids.includes("max"));

  // XP yetmiyorsa isaret yok; tek kuleye yetiyorsa yalnizca o.
  const cheapest = expOf(towers[2]);
  assert.deepEqual(getUpgradeReadyTowerIds(towers, "me", { gold: 0, experience: cheapest - 0.01 }), []);
  assert.deepEqual(getUpgradeReadyTowerIds(towers, "me", { gold: 0, experience: cheapest }), ["t3"]);
  assert.deepEqual(getUpgradeReadyTowerIds(towers, undefined, { gold: 1e9, experience: 1e9 }), []);
});

test("yukseltme hazir: 5. seviyenin altin kapisi sayiliyor", () => {
  const definition = towerCatalog.warrior.find((entry) => entry.id === "warrior-1");
  const exp = getTowerLevelExpCost(definition.cost, 4);
  const gold = getTowerLevelGoldCost(definition.cost, 4);
  assert.ok(gold > 0, "4 -> 5 altin istiyor");
  const towers = [tower("t", "warrior-1", 4)];
  assert.deepEqual(getUpgradeReadyTowerIds(towers, "me", { gold: gold - 1, experience: exp }), []);
  assert.deepEqual(getUpgradeReadyTowerIds(towers, "me", { gold, experience: exp }), ["t"]);
});

test("yukseltme hazir isareti sunucunun yukseltme kararina uyar", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const definition = towerCatalog.warrior.find((entry) => entry.id === "warrior-1");
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  const model = [...room.towers.values()][0];
  const player = room.state.players.get("p1");
  const client = { sessionId: "p1", send() {} };
  const asSnapshot = () => [{ id: model.id, ownerId: model.ownerId, characterId: model.characterId, definitionId: model.definition.id, level: model.level }];

  for (const level of [1, 3, 4, 8, 9]) {
    model.level = level;
    const exp = getTowerLevelExpCost(definition.cost, level);
    const gold = getTowerLevelGoldCost(definition.cost, level);
    for (const wallet of [
      { experience: exp - 1, gold },
      { experience: exp, gold: Math.max(0, gold - 1) },
      { experience: exp, gold }
    ]) {
      model.level = level;
      player.experience = wallet.experience;
      player.gold = wallet.gold;
      const ready = getUpgradeReadyTowerIds(asSnapshot(), "p1", wallet).length > 0;
      room.upgradeTower(client, { towerId: model.id });
      assert.equal(model.level > level, ready, `seviye ${level}, xp ${wallet.experience}, altin ${wallet.gold}`);
    }
  }
});
