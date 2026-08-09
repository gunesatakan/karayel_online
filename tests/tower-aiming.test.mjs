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

test("kule dönüş hızı yaklaşık 115 derece/sn değerindedir", () => {
  assert.equal(TOWER_TURN_RATE_RADIANS_PER_SECOND, 2);
  assert.ok(Math.abs(TOWER_TURN_RATE_RADIANS_PER_SECOND * 180 / Math.PI - 114.591559) < 0.000001);
});

test("kule hedefe doğru sınırlı adımla döner ve hedefi geçmez", () => {
  assert.equal(rotateTowerTowards(0, Math.PI, 0.25), 0.5);
  assert.ok(Math.abs(shortestAngleDelta(rotateTowerTowards(0, 0.2, 1), 0.2)) < 1e-9);
});

test("açı sınırı geçilmeden ateş hizalı sayılmaz", () => {
  assert.equal(isTowerAligned(0, Math.PI / 4), false);
  assert.equal(isTowerAligned(0, Math.PI / 72), true);
  assert.equal(TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS, Math.PI / 12);
  assert.equal(isTowerAligned(0, 15.01 * Math.PI / 180), false);
  assert.equal(isTowerAligned(0, 15 * Math.PI / 180), true);
});

test("yüzde 20 isabet bonusu ateş açısını 15 dereceden 12 dereceye indirir", () => {
  const tolerance = getTowerFireAlignmentTolerance(0.2);
  assert.ok(Math.abs(tolerance - 12 * Math.PI / 180) < 1e-12);
  assert.equal(isTowerAligned(0, 12.01 * Math.PI / 180, tolerance), false);
  assert.equal(isTowerAligned(0, 12 * Math.PI / 180, tolerance), true);
});

test("eksi pi ve artı pi sınırında en kısa yön kullanılır", () => {
  assert.ok(Math.abs(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});
