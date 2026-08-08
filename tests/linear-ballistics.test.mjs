import test from "node:test";
import assert from "node:assert/strict";
import { findFirstLinearCollision, usesLinearBallistics } from "../packages/shared/dist/index.js";

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
