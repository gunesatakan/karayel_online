import assert from "node:assert/strict";
import test from "node:test";
import { getPlayerStartGold } from "../apps/server/dist/rooms/MatchRoom.js";

/**
 * Baslangic kesesi karakterden bagimsiz.
 *
 * Melis bir sure 400 ile, digerleri 480 ile basliyordu. Acilis kesesi artik bir
 * denge kolu degil: herkes 1000 ile ayni kararlari veriyor. Bu test farkin
 * sessizce geri gelmesini engelliyor.
 */
test("herkes 1000 başlangıç altını alır", () => {
  for (const characterId of ["warrior", "zeynep", "archer", "onur", "mage", "healer", "tank"]) {
    assert.equal(getPlayerStartGold(characterId), 1000, characterId);
  }
});
