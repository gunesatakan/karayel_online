import contract from "./game-map.json" with { type: "json" };

export const MAP = contract.presets[0];
// One scene unit is exactly one existing 34-unit cell on both ground axes.
export const CELL_SIZE = 1;
export const MAP_WIDTH = MAP.cols * CELL_SIZE;
export const MAP_DEPTH = MAP.rows * CELL_SIZE;
export const TOWER_CELL = { col: 4, row: 9 };
export const TOWER_SCALE = 0.22;
export const ENEMY_SCALE = 0.25;
export const TOWER_BASE_Y = 0.015;
export const ENEMY_HIT_Y = 1.05 * ENEMY_SCALE;

export function worldToScene(x, y) {
  return {
    x: ((x - MAP.origin.x) / MAP.cellSize - MAP.cols / 2) * CELL_SIZE,
    z: ((y - MAP.origin.y) / MAP.cellSize - MAP.rows / 2) * CELL_SIZE,
  };
}
export function sceneToWorld(x, z) {
  return {
    x: (x / CELL_SIZE + MAP.cols / 2) * MAP.cellSize + MAP.origin.x,
    y: (z / CELL_SIZE + MAP.rows / 2) * MAP.cellSize + MAP.origin.y,
  };
}
export function cellCenter(col, row) {
  return worldToScene(
    MAP.origin.x + (col + 0.5) * MAP.cellSize,
    MAP.origin.y + (row + 0.5) * MAP.cellSize,
  );
}
export const TOWER_POSITION = cellCenter(TOWER_CELL.col, TOWER_CELL.row);

// Edge structures (Abartı) lie on the top edge of TOWER_CELL, spanning it and the
// next cell to the right, as GameScene's horizontal edge segments do.
export function edgePlacement(length = 2) {
  return {
    span: 1,
    edge: true,
    length,
    scale: TOWER_SCALE,
    position: worldToScene(
      MAP.origin.x + (TOWER_CELL.col + length / 2) * MAP.cellSize,
      MAP.origin.y + TOWER_CELL.row * MAP.cellSize,
    ),
    cells: [],
  };
}

export function placementFor(asset) {
  return asset.edgeCells ? edgePlacement(asset.edgeCells) : towerPlacement(asset.footprintSpan);
}

// TOWER_CELL is the top-left occupied cell. Even spans centre on a grid corner,
// matching GameScene's 2x2 placement rule instead of straddling nine cells.
export function towerPlacement(span = 1) {
  return {
    span,
    scale: TOWER_SCALE * span,
    position: worldToScene(
      MAP.origin.x + (TOWER_CELL.col + span / 2) * MAP.cellSize,
      MAP.origin.y + (TOWER_CELL.row + span / 2) * MAP.cellSize,
    ),
    cells: Array.from({ length: span * span }, (_, i) => ({
      col: TOWER_CELL.col + i % span,
      row: TOWER_CELL.row + Math.floor(i / span),
    })),
  };
}
