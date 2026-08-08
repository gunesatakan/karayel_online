import test from "node:test";
import assert from "node:assert/strict";
import { selectTowerTarget } from "../packages/shared/dist/index.js";

const candidates = [
  { id: "a", progress: 90, health: 40, strength: 50, distance: 80, markScore: 0, priorityScore: 0, inRange: true, eligible: true, movementKind: "ground" },
  { id: "b", progress: 50, health: 100, strength: 120, distance: 20, markScore: 2, priorityScore: 0, inRange: true, eligible: true, movementKind: "ground" },
  { id: "c", progress: 10, health: 20, strength: 80, distance: 40, markScore: 1, priorityScore: 1, inRange: true, eligible: true, movementKind: "ground" }
];

for (const [mode, expected] of [["first", "a"], ["last", "c"], ["strongest", "c"], ["weakest", "c"], ["closest", "b"], ["marked", "b"]]) {
  test(`${mode} modu doğru hedefi seçer`, () => {
    assert.equal(selectTowerTarget({ mode, canHitAir: false }, candidates)?.id, expected);
  });
}

test("uygunsuz, menzil dışı ve vurulamayan hava hedefleri elenir", () => {
  const filtered = [
    { ...candidates[0], id: "dead", eligible: false, progress: 999 },
    { ...candidates[0], id: "far", inRange: false, progress: 998 },
    { ...candidates[0], id: "air", movementKind: "air", progress: 997 },
    candidates[1]
  ];
  assert.equal(selectTowerTarget({ mode: "first", canHitAir: false }, filtered)?.id, "b");
});

test("kilitli hedef uygunken korunur", () => {
  assert.equal(selectTowerTarget({ mode: "first", canHitAir: false, locksTarget: true, lockedTargetId: "c" }, candidates)?.id, "c");
});

test("menzil dışı kilit yalnız izin verildiğinde korunur", () => {
  const outside = candidates.map((candidate) => candidate.id === "c" ? { ...candidate, inRange: false } : candidate);
  assert.equal(selectTowerTarget({ mode: "first", canHitAir: false, locksTarget: true, lockedTargetId: "c" }, outside)?.id, "a");
  assert.equal(selectTowerTarget({ mode: "first", canHitAir: false, locksTarget: true, retainLockOutsideRange: true, lockedTargetId: "c" }, outside)?.id, "c");
});

test("preferred hedefler normal moddan önce değerlendirilir", () => {
  assert.equal(selectTowerTarget({ mode: "first", canHitAir: false, preferredTargetIds: ["c"] }, candidates)?.id, "c");
});

test("random modu enjekte edilen rastgelelik kaynağıyla test edilebilir", () => {
  assert.equal(selectTowerTarget({ mode: "random", canHitAir: false, random: () => 0.5 }, candidates)?.id, "b");
});

test("eşitlikler kimliğe göre deterministik çözülür", () => {
  const tied = [{ ...candidates[0], id: "z" }, { ...candidates[0], id: "a" }];
  assert.equal(selectTowerTarget({ mode: "first", canHitAir: false }, tied)?.id, "a");
});
