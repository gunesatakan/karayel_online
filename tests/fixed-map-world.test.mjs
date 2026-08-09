import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenArenaMap,
  getMapGridSize,
  getMapWorldBounds,
  gridToWorld
} from "../packages/shared/dist/index.js";

const dimensions = [
  [12, 18],
  [15, 27],
  [20, 32],
  [23, 36]
];

test("bütün açık arena ölçeklerinde kare kenarı 34 dünya pikselidir", () => {
  for (const [cols, rows] of dimensions) {
    const map = createOpenArenaMap(cols, rows);
    assert.equal(getMapGridSize(map), 34);
    const first = gridToWorld(0, 0, map);
    const right = gridToWorld(1, 0, map);
    const below = gridToWorld(0, 1, map);
    assert.equal(right.x - first.x, 34);
    assert.equal(below.y - first.y, 34);
  }
});

test("büyük harita kareleri küçültmek yerine daha büyük dünya üretir", () => {
  const small = getMapWorldBounds(createOpenArenaMap(12, 18));
  const large = getMapWorldBounds(createOpenArenaMap(23, 36));
  assert.deepEqual({ width: small.width, height: small.height }, { width: 408, height: 612 });
  assert.deepEqual({ width: large.width, height: large.height }, { width: 782, height: 1224 });
});
