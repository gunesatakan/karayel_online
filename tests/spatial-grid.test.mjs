import test from "node:test";
import assert from "node:assert/strict";
import { SpatialGrid } from "../packages/shared/dist/index.js";

test("spatial grid yalnız daire içindeki noktaları döndürür", () => {
  const grid = new SpatialGrid(50);
  grid.rebuild([{ id: "near", x: 20, y: 20 }, { id: "corner", x: 49, y: 49 }, { id: "far", x: 90, y: 20 }]);
  assert.deepEqual(grid.queryCircle(20, 20, 40).map((item) => item.id), ["near"]);
});

test("negatif koordinatlar ve hücre sınırları doğru sorgulanır", () => {
  const grid = new SpatialGrid(32);
  grid.rebuild([{ id: "left", x: -1, y: 0 }, { id: "right", x: 33, y: 0 }]);
  assert.deepEqual(grid.queryCircle(0, 0, 2).map((item) => item.id), ["left"]);
});

test("rebuild eski konumları ve silinen öğeleri temizler", () => {
  const grid = new SpatialGrid(25);
  const item = { id: "moving", x: 0, y: 0 };
  grid.rebuild([item]);
  item.x = 100;
  grid.rebuild([item]);
  assert.equal(grid.queryCircle(0, 0, 10).length, 0);
  assert.equal(grid.queryCircle(100, 0, 10)[0]?.id, "moving");
});
