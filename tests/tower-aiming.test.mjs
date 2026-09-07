import test from "node:test";
import assert from "node:assert/strict";
import {
  TOWER_TURN_RATE_RADIANS_PER_SECOND,
  TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS,
  TOWER_FIRE_ALIGNMENT_MIN_RADIANS,
  getTowerFireAlignmentTolerance,
  isTowerAligned,
  rotateTowerTowards,
  shouldRetainAimTargetLock,
  shortestAngleDelta
} from "../packages/shared/dist/index.js";

test("kule dönüş hızı 1.2 radyan/sn değerindedir", () => {
  assert.equal(TOWER_TURN_RATE_RADIANS_PER_SECOND, 1.2);
  assert.ok(Math.abs(TOWER_TURN_RATE_RADIANS_PER_SECOND * 180 / Math.PI - 68.754935) < 0.000001);
  // Namluyu tam ters yone cevirmek 2,6 saniye: hedef degistirmenin bedeli bu.
  assert.ok(Math.abs(Math.PI / TOWER_TURN_RATE_RADIANS_PER_SECOND - 2.617994) < 0.000001);
});

test("kule hedefe doğru sınırlı adımla döner ve hedefi geçmez", () => {
  assert.ok(Math.abs(rotateTowerTowards(0, Math.PI, 1 / 3) - 0.4) < 1e-9);
  assert.ok(Math.abs(shortestAngleDelta(rotateTowerTowards(0, 0.2, 1), 0.2)) < 1e-9);
});

test("açı sınırı geçilmeden ateş hizalı sayılmaz", () => {
  assert.equal(isTowerAligned(0, Math.PI / 4), false);
  assert.equal(isTowerAligned(0, Math.PI / 72), true);
  assert.equal(TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS, Math.PI / 9);
  assert.equal(isTowerAligned(0, 20.01 * Math.PI / 180), false);
  assert.equal(isTowerAligned(0, 20 * Math.PI / 180), true);
});

test("yüzde 20 isabet bonusu ateş açısını 20 dereceden 16 dereceye indirir", () => {
  const tolerance = getTowerFireAlignmentTolerance(0.2);
  assert.ok(Math.abs(tolerance - 16 * Math.PI / 180) < 1e-12);
  assert.equal(isTowerAligned(0, 16.01 * Math.PI / 180, tolerance), false);
  assert.equal(isTowerAligned(0, 16 * Math.PI / 180, tolerance), true);
});

test("eksi isabet bonusu koniyi genisletmez", () => {
  // Kirpma negatifi yutuyor. Bir karta ceza olarak "isabet -%X" yazilirsa
  // sessizce hicbir sey yapar; test bunu kayit altina aliyor ki kimse o kartı
  // yazip calistigini sanmasin.
  assert.equal(getTowerFireAlignmentTolerance(-0.5), TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS);
});

test("tam isabet bile koniyi sifira indirmez", () => {
  // Sifir tolerans, kayan nokta artigi yuzunden hicbir zaman ates etmeyen kule
  // demekti. Yigilabilir isabet kartlarinin toplami 1.0`i asabildigi icin bu
  // ulasilabilir bir durum.
  assert.equal(getTowerFireAlignmentTolerance(1), TOWER_FIRE_ALIGNMENT_MIN_RADIANS);
  assert.equal(getTowerFireAlignmentTolerance(3), TOWER_FIRE_ALIGNMENT_MIN_RADIANS);
  assert.ok(TOWER_FIRE_ALIGNMENT_MIN_RADIANS > 0);
  assert.equal(isTowerAligned(0, 0, getTowerFireAlignmentTolerance(1)), true);
});

test("eksi pi ve artı pi sınırında en kısa yön kullanılır", () => {
  assert.ok(Math.abs(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});

test("focus hedef kilidi süre dolsa bile ilk atışa kadar korunur", () => {
  assert.equal(shouldRetainAimTargetLock({ now: 2000, lockUntil: 1500, hasFired: false, targetIsValid: true }), true);
  assert.equal(shouldRetainAimTargetLock({ now: 2000, lockUntil: 1500, hasFired: true, targetIsValid: true }), false);
});

test("focus hedef kilidi hedef geçersiz olduğunda hemen bırakılır", () => {
  assert.equal(shouldRetainAimTargetLock({ now: 500, lockUntil: 1500, hasFired: false, targetIsValid: false }), false);
});
