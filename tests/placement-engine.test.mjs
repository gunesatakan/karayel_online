import test from "node:test";
import assert from "node:assert/strict";
import {
  getPlacementFootprint,
  hasOpenGridRoute,
  validateEdgePlacement,
  validateTowerPlacement
} from "../packages/shared/dist/index.js";

const board = { cols: 8, rows: 12 };

test("1x1 kule tek hücrelik ayak izi üretir", () => {
  assert.deepEqual(getPlacementFootprint({ col: 3, row: 4, span: 1 }, board), [{ col: 3, row: 4 }]);
});

test("2x2 kule dört hücre kaplar", () => {
  assert.deepEqual(getPlacementFootprint({ col: 2, row: 3, span: 2 }, board), [
    { col: 2, row: 3 }, { col: 3, row: 3 }, { col: 2, row: 4 }, { col: 3, row: 4 }
  ]);
});

test("harita dışına taşan ayak izi reddedilir", () => {
  assert.deepEqual(validateTowerPlacement({ board, col: 7, row: 11, span: 2 }), { valid: false, reason: "outOfBounds" });
});

test("başka kule veya düşman bulunan hücre reddedilir", () => {
  assert.equal(validateTowerPlacement({ board, col: 2, row: 2, span: 1, occupiedCells: [{ col: 2, row: 2 }] }).reason, "occupied");
  assert.equal(validateTowerPlacement({ board, col: 2, row: 2, span: 1, enemyCells: [{ col: 2, row: 2 }] }).reason, "enemyOccupied");
});

test("minimum kule mesafesi Chebyshev hücre uzaklığıyla uygulanır", () => {
  const existingTowerCells = [{ col: 4, row: 4 }];
  assert.equal(validateTowerPlacement({ board, col: 5, row: 5, span: 1, existingTowerCells, minDistanceFromTowers: 2 }).reason, "tooCloseToTower");
  assert.equal(validateTowerPlacement({ board, col: 6, row: 6, span: 1, existingTowerCells, minDistanceFromTowers: 2 }).valid, true);
});

test("yola komşuluk şartı yalnız dört yöndeki yol hücrelerini kabul eder", () => {
  const pathCells = [{ col: 4, row: 3 }];
  assert.equal(validateTowerPlacement({ board, col: 4, row: 4, span: 1, pathCells, requiresPathAdjacent: true }).valid, true);
  assert.equal(validateTowerPlacement({ board, col: 5, row: 4, span: 1, pathCells, requiresPathAdjacent: true }).reason, "notPathAdjacent");
});

test("kenar yerleşimi iki segment üretir ve çakışan segmenti reddeder", () => {
  const valid = validateEdgePlacement({ board, orientation: "vertical", col: 3, row: 4, length: 2 });
  assert.equal(valid.valid, true);
  assert.equal(validateEdgePlacement({ board, orientation: "vertical", col: 3, row: 4, length: 2, occupiedSegments: valid.segments }).reason, "edgeOccupied");
});

test("harita sınırını aşan kenar yerleşimi reddedilir", () => {
  assert.equal(validateEdgePlacement({ board, orientation: "horizontal", col: 7, row: 5, length: 2 }).reason, "outOfBounds");
});

test("kısmi duvar varken yukarıdan aşağı rota açık kalır", () => {
  const blocked = Array.from({ length: 7 }, (_, col) => ({ col, row: 5 }));
  assert.equal(hasOpenGridRoute(board, blocked), true);
});

test("tam yatay kule duvarı bütün rotaları kapatır", () => {
  const blocked = Array.from({ length: 8 }, (_, col) => ({ col, row: 5 }));
  assert.equal(hasOpenGridRoute(board, blocked), false);
});

test("taşıma sırasında kendi mevcut hücreleri çakışma hesabından çıkarılabilir", () => {
  const result = validateTowerPlacement({
    board,
    col: 2,
    row: 2,
    span: 1,
    occupiedCells: [{ col: 2, row: 2 }, { col: 5, row: 5 }],
    ignoredCells: [{ col: 2, row: 2 }]
  });
  assert.equal(result.valid, true);
});
