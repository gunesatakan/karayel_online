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
  assert.equal(ENEMY_EXP_MULTIPLIER, 1.5);
  assert.equal(getEnemyExp(6, "grunt"), 15);
  assert.equal(getEnemyExp(6, "runner"), 15);
  assert.equal(getEnemyExp(6, "shooter"), 24);
  assert.equal(getEnemyExp(6, "brute"), 37.5);
  assert.equal(getEnemyExp(6, "brute", "air"), 26.25);
});

test("dusman XP'si multiplayer havuzlarina esit dagitilir", () => {
  const room = new MatchRoom();
  room.wave = 6;
  const first = { experience: 0 };
  const second = { experience: 0 };
  room.state = { players: new Map([["p1", first], ["p2", second]]) };

  room.awardEnemyExperience({ type: "shooter", movementKind: "ground" });

  assert.equal(first.experience, 12);
  assert.equal(second.experience, 12);
});

test("kule gelistirme XP harcar ve altini degistirmez", () => {
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
  assert.equal(player.gold, 300);
  assert.equal(player.goldSpent, 120);
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

test("5. ve 10. seviyeler XP yanında altın ister", () => {
  assert.equal(getTowerLevelGoldCost(80, 3), 0);
  assert.equal(getTowerLevelGoldCost(80, 4), getTowerBuildCost(80));
  assert.equal(getTowerLevelGoldCost(80, 9), getTowerBuildCost(80) * 2);
});

test("eşik yükseltmesi XP ve altını birlikte harcar", () => {
  const room = new MatchRoom();
  const player = { experience: 1000, gold: 500, goldSpent: 20 };
  const tower = { id: "tower", ownerId: "p1", level: 4, definition: { cost: 80, id: "test-tower" } };
  room.state = { players: new Map([["p1", player]]) };
  room.towers = new Map([[tower.id, tower]]);

  room.upgradeTower({ sessionId: "p1" }, { towerId: tower.id });

  assert.equal(tower.level, 5);
  assert.equal(player.experience, 1000 - getTowerLevelExpCost(80, 4));
  assert.equal(player.gold, 500 - getTowerBuildCost(80));
  assert.equal(player.goldSpent, 20 + getTowerBuildCost(80));
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
