import assert from "node:assert/strict";
import test from "node:test";
import { towerCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function createHizaRoom() {
  const room = createRoom("zeynep");
  const definition = towerCatalog.zeynep.find((tower) => tower.id === "zeynep-1");
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: definition.id });
  return { room, tower: [...room.towers.values()][0], definition };
}

test("Hiza Emri özel sunucu formülüyle gerçek yarı saldırı hızını kullanır", () => {
  const { room, tower, definition } = createHizaRoom();
  assert.equal(definition.fireIntervalMs, 1000);
  assert.equal(room.getTowerFireInterval(tower), 1000);

  tower.level = 10;
  assert.equal(room.getTowerFireInterval(tower), 400);
});

