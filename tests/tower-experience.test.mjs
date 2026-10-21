import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_EXP_MULTIPLIER,
  getEnemyExp,
  getTowerBuildCost,
  getTowerLevelExpCost,
  getTowerLevelGoldCost,
  getTowerSellRefund
} from "../packages/shared/dist/index.js";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";

test("kuleyi 1'den 10'a cikarmak gercek kurulum maliyetinin 45 katidir", () => {
  const baseCost = 80;
  const buildCost = getTowerBuildCost(baseCost);
  const total = Array.from({ length: 9 }, (_, index) => getTowerLevelExpCost(baseCost, index + 1))
    .reduce((sum, cost) => sum + cost, 0);
  assert.equal(total, buildCost * 45);
});

test("satis iadesi XP seviyelerinden etkilenmez", () => {
  assert.equal(getTowerSellRefund(80, 1), getTowerBuildCost(80) / 2);
  assert.equal(getTowerSellRefund(80, 10), getTowerBuildCost(80) / 2);
});

/**
 * XP formulu: (4 + dalga) x tip x ucus x genel carpan.
 *
 * Sayilar 6. dalgadan okunuyor, yani taban 10. Genel carpan altin tarafindaki
 * gibi ayri bir sabit: egrinin sekli tipte ve dalgada, seviyesi tek yerde.
 */
test("dusman XP formulu tip, ucus ve genel carpani uygular", () => {
  // 1,875 x 1,3 (tecrube +%30, 2026-10-21).
  assert.equal(ENEMY_EXP_MULTIPLIER, 2.4375);
  assert.equal(getEnemyExp(6, "grunt"), 24.38);
  assert.equal(getEnemyExp(6, "runner"), 24.38);
  assert.equal(getEnemyExp(6, "shooter"), 39);
  assert.equal(getEnemyExp(6, "brute"), 60.94);
  assert.equal(getEnemyExp(6, "brute", "air"), 42.66);
});

test("dusman XP'si multiplayer havuzlarina esit dagitilir", () => {
  const room = new MatchRoom();
  room.wave = 6;
  const first = { experience: 0 };
  const second = { experience: 0 };
  room.state = { players: new Map([["p1", first], ["p2", second]]) };

  room.awardEnemyExperience({ type: "shooter", movementKind: "ground" });

  assert.equal(first.experience, 19.5);
  assert.equal(second.experience, 19.5);
});

test("kule gelistirme XP ile birlikte insa bedelinin yarisi kadar altin harcar (2. seviye)", () => {
  const room = new MatchRoom();
  const player = { experience: 500, gold: 300, goldSpent: 120 };
  const tower = {
    id: "tower",
    ownerId: "p1",
    level: 1,
    definition: { cost: 80, id: "test-tower" }
  };
  room.state = { players: new Map([["p1", player]]) };
  room.towers = new Map([[tower.id, tower]]);

  room.upgradeTower({ sessionId: "p1" }, { towerId: tower.id });

  assert.equal(tower.level, 2);
  assert.equal(player.experience, 500 - getTowerLevelExpCost(80, 1));
  // Insa bedeli 160, 2. seviye %50: 80 altin.
  assert.equal(getTowerLevelGoldCost(80, 1), 80);
  assert.equal(player.gold, 300 - 80);
  assert.equal(player.goldSpent, 120 + 80);
  assert.equal(tower.upgradeGold, 80, "odenen gelistirme altini kulede yazilmadi");
});

test("yetersiz XP kule seviyesini degistirmez", () => {
  const room = new MatchRoom();
  const player = { experience: 10, gold: 300, goldSpent: 120 };
  const tower = {
    id: "tower",
    ownerId: "p1",
    level: 1,
    definition: { cost: 80, id: "test-tower" }
  };
  room.state = { players: new Map([["p1", player]]) };
  room.towers = new Map([[tower.id, tower]]);

  room.upgradeTower({ sessionId: "p1" }, { towerId: tower.id });

  assert.equal(tower.level, 1);
  assert.equal(player.experience, 10);
});

/**
 * Iki altin esigi.
 *
 * Seviyelerin cogu yalnizca deneyim istiyor. Altin iki yerde devreye giriyor ve
 * bedeller kasten agir: bes insa bedeli degil **on** katı, on ise **kirk**.
 * Boylece bir kuleyi sonuna goturmek yenilerini kurmaktan pahali kaliyor --
 * derinlesmek ile yayilmak arasindaki secim buradan cikiyor. Sayilar burada
 * yaziyor cunku degistiklerinde bu secimin kendisi degisir.
 */
test("her seviye XP yanında altın ister; 5. ve 10. seviye büyük eşik", () => {
  const build = getTowerBuildCost(80);
  // Hedef seviye -> insa bedelinin payi.
  const oranlar = { 2: 0.5, 3: 0.7, 4: 0.9, 5: 10, 6: 1.2, 7: 1.5, 8: 1.9, 9: 2.4, 10: 40 };
  for (const [hedef, oran] of Object.entries(oranlar)) {
    assert.equal(getTowerLevelGoldCost(80, Number(hedef) - 1), Math.round(build * oran), `${hedef}. seviye`);
    assert.ok(getTowerLevelExpCost(80, Number(hedef) - 1) > 0, `${hedef}. seviye XP de istiyor`);
  }
  // Eşikler dışında pay her seviyede artıyor.
  const ara = [2, 3, 4, 6, 7, 8, 9].map((hedef) => getTowerLevelGoldCost(80, hedef - 1));
  for (let index = 1; index < ara.length; index += 1) assert.ok(ara[index] > ara[index - 1], "pay artmiyor");
  // Tavanda bedel yok.
  assert.equal(getTowerLevelGoldCost(80, 10), 0);
  assert.equal(getTowerLevelGoldCost(80, 4), getTowerBuildCost(80) * 10);
  assert.equal(getTowerLevelGoldCost(80, 9), getTowerBuildCost(80) * 40);
  // Onuncu, besincinin dort kati: son adim gercek bir yatirim karari.
  assert.equal(getTowerLevelGoldCost(80, 9), getTowerLevelGoldCost(80, 4) * 4);
});

test("eşik yükseltmesi XP ve altını birlikte harcar", () => {
  const room = new MatchRoom();
  // Cuzdan bedelden turetiliyor: sabit bir sayi yazmak, bedel her degistiginde
  // testi "yetersiz altin" yuzunden kirardi -- olcmek istedigi sey o degil.
  const gold = getTowerLevelGoldCost(80, 4) + 25;
  const player = { experience: 1000, gold, goldSpent: 20 };
  const tower = { id: "tower", ownerId: "p1", level: 4, definition: { cost: 80, id: "test-tower" } };
  room.state = { players: new Map([["p1", player]]) };
  room.towers = new Map([[tower.id, tower]]);

  room.upgradeTower({ sessionId: "p1" }, { towerId: tower.id });

  assert.equal(tower.level, 5);
  assert.equal(player.experience, 1000 - getTowerLevelExpCost(80, 4));
  assert.equal(player.gold, 25);
  assert.equal(player.goldSpent, 20 + getTowerLevelGoldCost(80, 4));
});

test("eşik altını yetersizse yükseltme yapılmaz", () => {
  const room = new MatchRoom();
  const player = { experience: 1000, gold: 159, goldSpent: 20 };
  const tower = { id: "tower", ownerId: "p1", level: 4, definition: { cost: 80, id: "test-tower" } };
  room.state = { players: new Map([["p1", player]]) };
  room.towers = new Map([[tower.id, tower]]);

  room.upgradeTower({ sessionId: "p1" }, { towerId: tower.id });

  assert.equal(tower.level, 4);
  assert.equal(player.experience, 1000);
  assert.equal(player.gold, 159);
});
