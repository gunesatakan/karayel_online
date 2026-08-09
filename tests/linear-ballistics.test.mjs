import test from "node:test";
import assert from "node:assert/strict";
import { findFirstLinearCollision, getBallisticCollisionRadius, getBallisticMovementSpeed, usesLinearBallistics } from "../packages/shared/dist/index.js";

test("projectile ve impact farkli carpisma yaricaplari kullanir", () => {
  assert.equal(getBallisticCollisionRadius("projectile"), 4);
  assert.equal(getBallisticCollisionRadius("impact"), 8);
  assert.equal(getBallisticCollisionRadius("wave"), 4);
});

test("impact, wave ve projectile hareket hızları tekrar mevcut hızın üçte ikisine iner", () => {
  assert.ok(Math.abs(getBallisticMovementSpeed(340, "projectile") - 680 / 9) < 0.0001);
  assert.equal(getBallisticMovementSpeed(360, "wave"), 80);
  assert.ok(Math.abs(getBallisticMovementSpeed(520, "impact") - 1040 / 9) < 0.0001);
  assert.equal(getBallisticMovementSpeed(340, "focus"), 340);
});

test("impact wave ve projectile doğrusal balistik kullanır", () => {
  assert.equal(usesLinearBallistics("impact"), true);
  assert.equal(usesLinearBallistics("wave"), true);
  assert.equal(usesLinearBallistics("projectile"), true);
  assert.equal(usesLinearBallistics("focus"), false);
});

test("mermi hattın dışındaki hedefi ıskalar", () => {
  const hit = findFirstLinearCollision({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ id: "enemy", x: 50, y: 20, radius: 5 }], 2);
  assert.equal(hit, undefined);
});

test("mermi isimden bağımsız olarak yolundaki ilk düşmana çarpar", () => {
  const bodies = [
    { id: "original-target", x: 90, y: 0, radius: 5 },
    { id: "interceptor", x: 35, y: 1, radius: 5 }
  ];
  assert.equal(findFirstLinearCollision({ x: 0, y: 0 }, { x: 100, y: 0 }, bodies, 2)?.body.id, "interceptor");
});

test("delinen düşman sonraki taramada tekrar vurulmaz", () => {
  const bodies = [{ id: "first", x: 20, y: 0, radius: 5 }, { id: "second", x: 50, y: 0, radius: 5 }];
  assert.equal(findFirstLinearCollision({ x: 0, y: 0 }, { x: 100, y: 0 }, bodies, 2, new Set(["first"]))?.body.id, "second");
});
