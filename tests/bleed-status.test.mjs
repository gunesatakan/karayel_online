import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTowerStatusEffect,
  getTowerStatusOutcomes,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const bleedDefinition = { type: "bleed", magnitude: 0.01, durationMs: 3000, stacking: "refresh" };

test("bleed refreshes one stack and exposes its max-health damage ratio", () => {
  const initial = applyTowerStatusEffect(undefined, bleedDefinition, { now: 100 });
  const refreshed = applyTowerStatusEffect(initial, bleedDefinition, { now: 1000 });
  assert.equal(refreshed.stacks, 1);
  assert.equal(refreshed.expiresAt, 4000);
  assert.equal(getTowerStatusOutcomes({ bleed: refreshed }, 1200).bleedMaxHealthRatioPerSecond, 0.01);
});

test("Testere contact applies sourced bleed and bleed deals one percent true damage", () => {
  const room = createRoom("onur");
  const definition = towerCatalog.onur.find((tower) => tower.id === "onur-1");
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  const tower = [...room.towers.values()][0];
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.x = tower.x;
  enemy.y = tower.y;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.updateOrbitTower(tower, 0.02, Date.now());

  const bleed = enemy.statusEffects.bleed;
  assert.equal(bleed?.magnitude, 0.01);
  assert.equal(bleed?.stacks, 1);
  assert.equal(bleed?.sourceTowerId, tower.id);
  assert.equal(bleed?.sourceOwnerId, tower.ownerId);

  Object.assign(room.state.players.get("p1"), { ownedShopItemIds: [], shopOffers: [], shopRerolls: 0 });
  assert.equal(room.getSnapshot().enemies.find(({ id }) => id === enemy.id)?.isBleeding, true);

  enemy.shield = 0;
  enemy.armor = 999;
  enemy.hp = enemy.maxHp;
  enemy.statusTickAt.bleed = 0;
  room.updateEnemyEngineStatusOutcomes(enemy, Date.now());
  assert.ok(Math.abs(enemy.hp - enemy.maxHp * 0.99) < 1e-9);

  enemy.statusEffects.bleed.expiresAt = Date.now() - 1;
  assert.equal(room.getSnapshot().enemies.find(({ id }) => id === enemy.id)?.isBleeding, false);
});
