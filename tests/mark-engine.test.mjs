import test from "node:test";
import assert from "node:assert/strict";
import { applyEnemyMark, getMarkDamageMultiplier } from "../packages/shared/dist/index.js";

test("yeni işaret eski işareti tamamen değiştirir", () => {
  const tracking = { id: "tracking", add: 0.4, expiresAt: 2000 };
  const underworld = applyEnemyMark(tracking, { id: "underworld", add: 0.2, expiresAt: 3000 });
  assert.deepEqual(underworld, { id: "underworld", add: 0.2, expiresAt: 3000 });
});

test("işaret ve kart bonusu toplamsaldır ve +%100 tavanına uyar", () => {
  const mods = [
    { source: "card:a", scope: "player", stat: "markAmplification", add: 0.6 },
    { source: "card:b", scope: "player", stat: "markAmplification", add: 0.6 }
  ];
  assert.equal(getMarkDamageMultiplier({ id: "tracking", add: 0.4, expiresAt: 2000 }, mods, 1000), 2);
  assert.equal(getMarkDamageMultiplier({ id: "tracking", add: 0.4, expiresAt: 500 }, [], 1000), 1);
});
