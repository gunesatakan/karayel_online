import test from "node:test";
import assert from "node:assert/strict";
import { selectAttackShapeTargets } from "../packages/shared/dist/index.js";

const targets = [
  { id: "near", x: 30, y: 2, radius: 2, movementKind: "ground" },
  { id: "middle", x: 60, y: -3, radius: 2, movementKind: "ground" },
  { id: "far", x: 90, y: 4, radius: 2, movementKind: "ground" },
  { id: "outside", x: 50, y: 20, radius: 2, movementKind: "ground" },
  { id: "air", x: 40, y: 0, radius: 2, movementKind: "air" }
];

test("line hedefleri doğrultu sırasıyla ve delme sınırıyla seçer", () => {
  const result = selectAttackShapeTargets({ shape: "line", x: 0, y: 0, aimX: 100, aimY: 0, length: 100, width: 5, pierceCount: 2, canHitAir: false }, targets);
  assert.deepEqual(result.map((target) => target.id), ["near", "middle"]);
});

test("beam çizgi genişliğini kullanır ancak delme sınırı olmadan tümünü seçer", () => {
  const result = selectAttackShapeTargets({ shape: "beam", x: 0, y: 0, aimX: 100, aimY: 0, length: 100, width: 5, canHitAir: false }, targets);
  assert.deepEqual(result.map((target) => target.id), ["near", "middle", "far"]);
});

test("cone yalnız açı ve menzil içindeki hedefleri seçer", () => {
  const result = selectAttackShapeTargets({ shape: "cone", x: 0, y: 0, aimX: 100, aimY: 0, length: 70, angle: 30, canHitAir: false }, targets);
  assert.deepEqual(result.map((target) => target.id), ["near", "middle"]);
});

test("circle seçilen merkez çevresindeki hedefleri döndürür", () => {
  const result = selectAttackShapeTargets({ shape: "circle", x: 0, y: 0, aimX: 50, aimY: 0, radius: 15, canHitAir: false }, targets);
  assert.deepEqual(result.map((target) => target.id), ["middle"]);
});

test("hava hedefi canHitAir kapalıyken elenir, açıkken seçilir", () => {
  const base = { shape: "line", x: 0, y: 0, aimX: 100, aimY: 0, length: 100, width: 5 };
  assert.equal(selectAttackShapeTargets({ ...base, canHitAir: false }, targets).some((target) => target.id === "air"), false);
  assert.equal(selectAttackShapeTargets({ ...base, canHitAir: true }, targets).some((target) => target.id === "air"), true);
});

test("alreadyHit kimlikleri tekrar seçilmez ve sonuçlar benzersizdir", () => {
  const duplicated = [...targets, targets[1]];
  const result = selectAttackShapeTargets({ shape: "line", x: 0, y: 0, aimX: 100, aimY: 0, length: 100, width: 5, canHitAir: true, alreadyHitIds: ["near"] }, duplicated);
  assert.deepEqual(result.map((target) => target.id), ["air", "middle", "far"]);
});
