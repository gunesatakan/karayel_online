export type PlacementCell = { col: number; row: number };
export type PlacementBoard = { cols: number; rows: number };
export type PlacementFailureReason = "outOfBounds" | "occupied" | "enemyOccupied" | "tooCloseToTower" | "notPathAdjacent" | "edgeOccupied";
export type PlacementValidation = { valid: true } | { valid: false; reason: PlacementFailureReason };
export type EdgeOrientation = "horizontal" | "vertical";
export type EdgeSegment = PlacementCell & { orientation: EdgeOrientation };

export function getPlacementFootprint(
  placement: PlacementCell & { span: number },
  board: PlacementBoard
): PlacementCell[] {
  const span = Math.max(1, Math.floor(placement.span));
  const cells: PlacementCell[] = [];
  for (let rowOffset = 0; rowOffset < span; rowOffset += 1) {
    for (let colOffset = 0; colOffset < span; colOffset += 1) {
      cells.push({ col: placement.col + colOffset, row: placement.row + rowOffset });
    }
  }
  return cells.every((cell) => isInsideBoard(board, cell)) ? cells : [];
}

export function validateTowerPlacement(options: {
  board: PlacementBoard;
  col: number;
  row: number;
  span: number;
  occupiedCells?: PlacementCell[];
  enemyCells?: PlacementCell[];
  ignoredCells?: PlacementCell[];
  existingTowerCells?: PlacementCell[];
  minDistanceFromTowers?: number;
  pathCells?: PlacementCell[];
  requiresPathAdjacent?: boolean;
}): PlacementValidation {
  const footprint = getPlacementFootprint(options, options.board);
  if (footprint.length === 0) return { valid: false, reason: "outOfBounds" };

  const ignored = cellSet(options.ignoredCells);
  const occupied = cellSet(options.occupiedCells?.filter((cell) => !ignored.has(cellKey(cell))));
  if (footprint.some((cell) => occupied.has(cellKey(cell)))) return { valid: false, reason: "occupied" };

  const enemies = cellSet(options.enemyCells);
  if (footprint.some((cell) => enemies.has(cellKey(cell)))) return { valid: false, reason: "enemyOccupied" };

  const minimumDistance = Math.max(0, options.minDistanceFromTowers ?? 0);
  if (minimumDistance > 0 && footprint.some((cell) => (options.existingTowerCells ?? []).some((existing) => chebyshevDistance(cell, existing) < minimumDistance))) {
    return { valid: false, reason: "tooCloseToTower" };
  }

  if (options.requiresPathAdjacent) {
    const paths = cellSet(options.pathCells);
    const adjacent = footprint.some((cell) => cardinalNeighbors(cell).some((neighbor) => paths.has(cellKey(neighbor))));
    if (!adjacent) return { valid: false, reason: "notPathAdjacent" };
  }
  return { valid: true };
}

export function validateEdgePlacement(options: {
  board: PlacementBoard;
  orientation: EdgeOrientation;
  col: number;
  row: number;
  length: number;
  occupiedSegments?: EdgeSegment[];
}): (PlacementValidation & { segments?: EdgeSegment[] }) {
  const length = Math.max(1, Math.floor(options.length));
  const segments = Array.from({ length }, (_, index) => ({
    orientation: options.orientation,
    col: options.col + (options.orientation === "horizontal" ? index : 0),
    row: options.row + (options.orientation === "vertical" ? index : 0)
  }));
  const inBounds = segments.every((segment) => options.orientation === "horizontal"
    ? segment.col >= 0 && segment.col < options.board.cols && segment.row >= 0 && segment.row <= options.board.rows
    : segment.col >= 0 && segment.col <= options.board.cols && segment.row >= 0 && segment.row < options.board.rows);
  if (!inBounds) return { valid: false, reason: "outOfBounds" };

  const occupied = new Set((options.occupiedSegments ?? []).map(edgeKey));
  if (segments.some((segment) => occupied.has(edgeKey(segment)))) return { valid: false, reason: "edgeOccupied" };
  return { valid: true, segments };
}

export function hasOpenGridRoute(board: PlacementBoard, blockedCells: PlacementCell[]) {
  const blocked = cellSet(blockedCells);
  const queue: PlacementCell[] = [];
  const seen = new Set<string>();
  for (let col = 0; col < board.cols; col += 1) {
    const start = { col, row: 0 };
    if (!blocked.has(cellKey(start))) {
      queue.push(start);
      seen.add(cellKey(start));
    }
  }
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.row === board.rows - 1) return true;
    for (const next of cardinalNeighbors(current)) {
      const key = cellKey(next);
      if (isInsideBoard(board, next) && !blocked.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return false;
}

function cardinalNeighbors(cell: PlacementCell) {
  return [
    { col: cell.col + 1, row: cell.row },
    { col: cell.col - 1, row: cell.row },
    { col: cell.col, row: cell.row + 1 },
    { col: cell.col, row: cell.row - 1 }
  ];
}

function isInsideBoard(board: PlacementBoard, cell: PlacementCell) {
  return cell.col >= 0 && cell.col < board.cols && cell.row >= 0 && cell.row < board.rows;
}

function chebyshevDistance(a: PlacementCell, b: PlacementCell) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function cellSet(cells: PlacementCell[] | undefined) {
  return new Set((cells ?? []).map(cellKey));
}

function cellKey(cell: PlacementCell) {
  return `${cell.col}:${cell.row}`;
}

function edgeKey(segment: EdgeSegment) {
  return `${segment.orientation}:${segment.col}:${segment.row}`;
}
