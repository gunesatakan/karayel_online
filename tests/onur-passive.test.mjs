import assert from "node:assert/strict";
import test from "node:test";
import {
  ONUR_LUCKY_WINDOW_MS,
  getOnurMisfortuneContribution,
  resolveOnurGamblerShot,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

test("normal zar 0.5x-1.5x, şanslı pencere zarı 0.95x-2.0x aralığındadır", () => {
  const low = resolveOnurGamblerShot({ misfortune: 0, luckyWindowUntil: 0 }, 700, () => 0, 1_000);
  const high = resolveOnurGamblerShot({ misfortune: 0, luckyWindowUntil: 0 }, 700, () => 1, 1_000);
  const luckyLow = resolveOnurGamblerShot({ misfortune: 100, luckyWindowUntil: 2_000 }, 700, () => 0, 1_000);
  const luckyHigh = resolveOnurGamblerShot({ misfortune: 100, luckyWindowUntil: 2_000 }, 700, () => 1, 1_000);
  assert.equal(low.multiplier, 0.5);
  assert.equal(high.multiplier, 1.5);
  assert.equal(luckyLow.multiplier, 0.95);
  assert.equal(luckyHigh.multiplier, 2);
});

test("şanssızlık katkısı gerçek atış aralığı formülünü kullanır", () => {
  assert.equal(getOnurMisfortuneContribution(700), 12);
  const normalPerSecond = getOnurMisfortuneContribution(700) / 0.7;
  const fasterPerSecond = getOnurMisfortuneContribution(700 / 1.5) / (0.7 / 1.5);
  assert.ok(Math.abs(fasterPerSecond / normalPerSecond - 1.0627) < 0.001);
});

test("bar dolunca pencere açılır, düşük şanslı zar pencereyi anında kapatır", () => {
  const opened = resolveOnurGamblerShot({ misfortune: 99, luckyWindowUntil: 0 }, 700, () => 0.2, 5_000);
  assert.equal(opened.misfortune, 100);
  assert.equal(opened.luckyWindowUntil, 5_000 + ONUR_LUCKY_WINDOW_MS);
  const closed = resolveOnurGamblerShot(opened, 700, () => 0, 5_100);
  assert.equal(closed.multiplier, 0.95);
  assert.equal(closed.misfortune, 0);
  assert.equal(closed.luckyWindowUntil, 0);
});

test("pencere doğal bittiğinde bar sıfırlanır", () => {
  const result = resolveOnurGamblerShot({ misfortune: 100, luckyWindowUntil: 2_000 }, 700, () => 1, 2_001);
  assert.equal(result.misfortune, 0);
  assert.equal(result.luckyWindowUntil, 0);
  assert.equal(result.multiplier, 1.5);
});

test("Onur kulesi enjekte edilen rastgelelik kaynağını hasara uygular", () => {
  const room = createRoom("onur");
  const definition = towerCatalog.onur[0];
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  room.spawnEnemy();
  const tower = [...room.towers.values()][0];
  const enemy = [...room.enemies.values()][0];
  room.towerDamageRandom = () => 0;
  room.prepareTowerShot(tower, enemy);
  const lowDamage = room.getTowerDamage(tower);
  room.towerDamageRandom = () => 1;
  room.prepareTowerShot(tower, enemy);
  const highDamage = room.getTowerDamage(tower);
  assert.ok(Math.abs(highDamage / lowDamage - 3) < 0.0001);
  assert.ok(tower.misfortune > 0);
});
