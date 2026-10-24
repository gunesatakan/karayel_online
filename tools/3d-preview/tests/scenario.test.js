import { test } from "node:test";
import assert from "node:assert/strict";
import {
  impactsBetween,
  projectileAt,
  enemyPosition,
  FLIGHT_TIME,
  SHOT_PERIOD,
  weaponAt,
} from "../src/scenario.js";

test("the same interval produces identical contacts at different frame rates", () => {
  for (const mode of ["auto", "beam", "projectile"]) {
    const all = impactsBetween(0, 24, mode);
    const stepped = [];
    for (let i = 0; i < 1440; i++)
      stepped.push(...impactsBetween(i / 60, (i + 1) / 60, mode));
    assert.deepEqual(stepped, all);
  }
});
test("projectiles reach the moving enemy at their contact timestamp", () => {
  for (let i = 0; i < 30; i++) {
    const time = i * SHOT_PERIOD + FLIGHT_TIME;
    const shot = projectileAt(i, time),
      enemy = enemyPosition(time);
    assert.ok(Math.abs(shot.position.x - enemy.x) < 1e-8);
    assert.ok(Math.abs(shot.position.z - enemy.z) < 1e-8);
  }
});
test("paused and restarted clocks cannot emit stale impacts", () => {
  assert.deepEqual(impactsBetween(5, 5, "auto"), []);
  assert.deepEqual(impactsBetween(5, 0, "auto"), []);
});
test("automatic showcase includes both weapons and manual selection stays fixed", () => {
  assert.equal(weaponAt(2, "auto"), "projectile");
  assert.equal(weaponAt(8, "auto"), "beam");
  assert.equal(weaponAt(8, "projectile"), "projectile");
  assert.equal(weaponAt(2, "beam"), "beam");
});
