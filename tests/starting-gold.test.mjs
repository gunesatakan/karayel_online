import assert from "node:assert/strict";
import test from "node:test";
import { getPlayerStartGold } from "../apps/server/dist/rooms/MatchRoom.js";

test("Atakan ve Zeynep 480 başlangıç altını alır", () => {
  assert.equal(getPlayerStartGold("warrior"), 480);
  assert.equal(getPlayerStartGold("zeynep"), 480);
});

test("Melis 400 başlangıç altını alır", () => {
  assert.equal(getPlayerStartGold("archer"), 400);
});
