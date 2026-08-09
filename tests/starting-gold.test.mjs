import assert from "node:assert/strict";
import test from "node:test";
import { getPlayerStartGold } from "../apps/server/dist/rooms/MatchRoom.js";

test("Atakan ve Zeynep 720 başlangıç altını alır", () => {
  assert.equal(getPlayerStartGold("warrior"), 720);
  assert.equal(getPlayerStartGold("zeynep"), 720);
});

test("Melis 600 başlangıç altını alır", () => {
  assert.equal(getPlayerStartGold("archer"), 600);
});
