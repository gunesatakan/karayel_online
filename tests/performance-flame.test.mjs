import assert from "node:assert/strict";
import test from "node:test";
import { getTowerPerformanceFlameIntensity } from "../packages/shared/dist/index.js";

test("performans ateşi yüzde 50 altında görünmez", () => {
  assert.equal(getTowerPerformanceFlameIntensity(0.49), 0);
});

test("performans ateşi yüzde 50'de belli belirsiz başlayıp yüzde 100'de tam yoğunluğa ulaşır", () => {
  assert.equal(getTowerPerformanceFlameIntensity(0.5), 0.08);
  assert.ok(getTowerPerformanceFlameIntensity(0.75) > 0.08);
  assert.equal(getTowerPerformanceFlameIntensity(1), 1);
});

test("performans ateşi geçersiz değerleri güvenli aralığa sıkıştırır", () => {
  assert.equal(getTowerPerformanceFlameIntensity(-1), 0);
  assert.equal(getTowerPerformanceFlameIntensity(2), 1);
});
