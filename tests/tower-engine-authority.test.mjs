import test from "node:test";
import assert from "node:assert/strict";
import { getTowerAttackRadius, getTowerSlowDurationMs } from "../packages/shared/dist/index.js";

const definition = {
  aoeRadius: 999,
  slowMs: 999,
  engine: {
    attack: { shape: "circle", radius: 42 },
    statusEffects: [{ type: "slow", magnitude: 0.5, durationMs: 850 }]
  }
};

test("ortak motor saldırı yarıçapında tek doğruluk kaynağıdır", () => {
  assert.equal(getTowerAttackRadius(definition), 42);
});

test("ortak motor yavaşlatma süresinde tek doğruluk kaynağıdır", () => {
  assert.equal(getTowerSlowDurationMs(definition), 850);
});

test("henüz taşınmamış kuleler eski alanlara güvenli dönüş yapar", () => {
  assert.equal(getTowerAttackRadius({ aoeRadius: 12 }), 12);
  assert.equal(getTowerSlowDurationMs({ slowMs: 300 }), 300);
});
