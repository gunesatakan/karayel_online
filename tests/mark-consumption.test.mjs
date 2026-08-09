import assert from "node:assert/strict";
import test from "node:test";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

test("consumesMarks Debug Lazer için işaret yığınını veri üzerinden tüketir", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-5");
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-5" });
  const tower = [...room.towers.values()][0];
  const now = Date.now();
  const target = {
    activeMarkId: "tracking",
    activeMarkAdd: 0.4,
    activeMarkUntil: now + 5000,
    trackingStackUntil: [now + 3000, now + 5000, 0]
  };
  room.consumeConfiguredMarks(tower, target, "hit");
  assert.equal(target.trackingStackUntil.filter((until) => until > now).length, 1);
  assert.equal(target.activeMarkAdd, 0.2);
  assert.equal(target.activeMarkId, "tracking");
});
