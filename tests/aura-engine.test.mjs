import test from "node:test";
import assert from "node:assert/strict";
import { applyTowerAuraModifier, evaluateTowerAuras, isPointInsideTowerAura } from "../packages/shared/dist/index.js";

const enemySlowAura = {
  affects: "enemies",
  shape: "circle",
  radius: 100,
  stat: "slow",
  multiplier: 0.6,
  stacking: "strongest"
};

test("daire aura yalnız yarıçap içindeki hedefi kapsar", () => {
  assert.equal(isPointInsideTowerAura({ x: 0, y: 0, aura: enemySlowAura }, { x: 60, y: 80 }), true);
  assert.equal(isPointInsideTowerAura({ x: 0, y: 0, aura: enemySlowAura }, { x: 101, y: 0 }), false);
});

test("çizgi aura genişliği içinde çalışır", () => {
  const line = { ...enemySlowAura, shape: "line", radius: 8 };
  const source = { x: 0, y: 0, x2: 100, y2: 0, aura: line };
  assert.equal(isPointInsideTowerAura(source, { x: 50, y: 7 }), true);
  assert.equal(isPointInsideTowerAura(source, { x: 50, y: 9 }), false);
});

test("enemy ve tower filtreleri doğru hedef grubunu seçer", () => {
  const source = { x: 0, y: 0, ownerId: "p1", enabled: true, aura: enemySlowAura };
  assert.deepEqual(evaluateTowerAuras([source], { x: 1, y: 1, kind: "tower", ownerId: "p1" }), {});
  assert.deepEqual(evaluateTowerAuras([source], { x: 1, y: 1, kind: "enemy" }), { slow: 0.6 });
});

test("dost kule aurası başka oyuncunun kulesini owner kapsamında etkilemez", () => {
  const aura = { ...enemySlowAura, affects: "towers", stat: "damage", multiplier: 1.2, scope: "owner" };
  const source = { x: 0, y: 0, ownerId: "p1", enabled: true, aura };
  assert.deepEqual(evaluateTowerAuras([source], { x: 1, y: 1, kind: "tower", ownerId: "p2" }), {});
  assert.deepEqual(evaluateTowerAuras([source], { x: 1, y: 1, kind: "tower", ownerId: "p1" }), { damage: 1.2 });
});

test("strongest auralar birden fazla kaynakta en güçlü etkiyi seçer", () => {
  const sources = [0.8, 0.55, 0.7].map((multiplier) => ({
    x: 0, y: 0, enabled: true, aura: { ...enemySlowAura, multiplier }
  }));
  assert.deepEqual(evaluateTowerAuras(sources, { x: 1, y: 1, kind: "enemy" }), { slow: 0.55 });
});

test("multiply auralar çarpılarak birleşir ve devre dışı kaynak yok sayılır", () => {
  const aura = { ...enemySlowAura, stat: "damage", multiplier: 1.2, stacking: "multiply" };
  const sources = [
    { x: 0, y: 0, enabled: true, aura },
    { x: 0, y: 0, enabled: true, aura: { ...aura, multiplier: 1.5 } },
    { x: 0, y: 0, enabled: false, aura: { ...aura, multiplier: 10 } }
  ];
  assert.ok(Math.abs(evaluateTowerAuras(sources, { x: 1, y: 1, kind: "enemy" }).damage - 1.8) < 1e-9);
});

test("damage, range ve armor aura sonuçları temel statlara uygulanır", () => {
  assert.equal(applyTowerAuraModifier(100, { damage: 1.25 }, "damage"), 125);
  assert.equal(applyTowerAuraModifier(80, { range: 1.5 }, "range"), 120);
  assert.equal(applyTowerAuraModifier(12, { armor: 2 }, "armor"), 24);
});
