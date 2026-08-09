import test from "node:test";
import assert from "node:assert/strict";
import {
  TOWER_TURN_RATE_RADIANS_PER_SECOND,
  TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS,
  isTowerAligned,
  rotateTowerTowards,
  shortestAngleDelta
} from "../packages/shared/dist/index.js";

test("kule dönüş hızı 36 rad/sn değerindedir", () => {
  assert.equal(TOWER_TURN_RATE_RADIANS_PER_SECOND, 36);
});

test("kule hedefe doğru sınırlı adımla döner ve hedefi geçmez", () => {
  assert.equal(rotateTowerTowards(0, Math.PI, 1 / 72), 0.5);
  assert.ok(Math.abs(shortestAngleDelta(rotateTowerTowards(0, 0.2, 1), 0.2)) < 1e-9);
});

test("açı sınırı geçilmeden ateş hizalı sayılmaz", () => {
  assert.equal(isTowerAligned(0, Math.PI / 4), false);
  assert.equal(isTowerAligned(0, Math.PI / 72), true);
  assert.equal(TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS, Math.PI / 36);
  assert.equal(isTowerAligned(0, 5.01 * Math.PI / 180), false);
  assert.equal(isTowerAligned(0, 5 * Math.PI / 180), true);
});

test("eksi pi ve artı pi sınırında en kısa yön kullanılır", () => {
  assert.ok(Math.abs(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});
