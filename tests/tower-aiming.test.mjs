import test from "node:test";
import assert from "node:assert/strict";
import {
  TOWER_TURN_RATE_RADIANS_PER_SECOND,
  TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS,
  getTowerFireAlignmentTolerance,
  isTowerAligned,
  rotateTowerTowards,
  shortestAngleDelta
} from "../packages/shared/dist/index.js";

test("kule dönüş hızı önceki 36 rad/sn değerinin yarısıdır", () => {
  assert.equal(TOWER_TURN_RATE_RADIANS_PER_SECOND, 18);
});

test("kule hedefe doğru sınırlı adımla döner ve hedefi geçmez", () => {
  assert.equal(rotateTowerTowards(0, Math.PI, 1 / 36), 0.5);
  assert.ok(Math.abs(shortestAngleDelta(rotateTowerTowards(0, 0.2, 1), 0.2)) < 1e-9);
});

test("açı sınırı geçilmeden ateş hizalı sayılmaz", () => {
  assert.equal(isTowerAligned(0, Math.PI / 4), false);
  assert.equal(isTowerAligned(0, Math.PI / 72), true);
  assert.equal(TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS, Math.PI / 18);
  assert.equal(isTowerAligned(0, 10.01 * Math.PI / 180), false);
  assert.equal(isTowerAligned(0, 10 * Math.PI / 180), true);
});

test("yüzde 20 isabet bonusu ateş açısını 10 dereceden 8 dereceye indirir", () => {
  const tolerance = getTowerFireAlignmentTolerance(0.2);
  assert.ok(Math.abs(tolerance - 8 * Math.PI / 180) < 1e-12);
  assert.equal(isTowerAligned(0, 8.01 * Math.PI / 180, tolerance), false);
  assert.equal(isTowerAligned(0, 8 * Math.PI / 180, tolerance), true);
});

test("eksi pi ve artı pi sınırında en kısa yön kullanılır", () => {
  assert.ok(Math.abs(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});
