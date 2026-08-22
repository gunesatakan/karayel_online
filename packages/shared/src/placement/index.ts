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

/**
 * Bir dunya noktasinin oturdugu kenar cizgileri.
 *
 * Bu geometri bir donem hem sunucuda hem istemcide ayri ayri yaziliydi ve ikisi
 * de yalnizca iki cizgilik Abarti'yi taniyordu. Duvar tek cizgilik bir yapi
 * olarak eklenince sunucu kopyasi guncellendi, istemci kopyasi geride kaldi ve
 * duvar butonu sessizce tepkisiz kaldi. Tek kopya, iki tarafin ayrisamamasi
 * demek.
 *
 * Segmentin iki ekseni farkli sey olcer: biri cizginin kendisi (yuvarlanir),
 * digeri hucre sirasi (imlecin bulundugu kareden baslar). Yapi imlecin iki
 * yanina esit yayildigi icin baslangic yarim uzunluk geri kaydirilir; tek
 * formul her uzunlukta dogru sonucu verir.
 */
export function getEdgeSegments(options: {
  x: number;
  y: number;
  orientation: EdgeOrientation;
  length: number;
  gridSize: number;
  origin: { x: number; y: number };
  board: PlacementBoard;
}): EdgeSegment[] {
  const { x, y, orientation, gridSize, origin, board } = options;
  const length = Math.max(1, Math.floor(options.length));
  const cellStart = (fraction: number) => Math.floor(fraction - (length - 1) / 2);

  if (orientation === "vertical") {
    const col = clamp(Math.round((x - origin.x) / gridSize), 0, board.cols);
    const row = clamp(cellStart((y - origin.y) / gridSize), 0, Math.max(0, board.rows - length));
    return Array.from({ length }, (_, index) => ({ orientation, col, row: row + index }));
  }

  const col = clamp(cellStart((x - origin.x) / gridSize), 0, Math.max(0, board.cols - length));
  const row = clamp(Math.round((y - origin.y) / gridSize), 0, board.rows);
  return Array.from({ length }, (_, index) => ({ orientation, col: col + index, row }));
}

/** Segmentlerin merkezi: kenar yapilarinin dunya konumu buraya oturur. */
export function getEdgeSegmentsCenter(segments: EdgeSegment[], gridSize: number, origin: { x: number; y: number }) {
  const [first] = segments;
  if (!first) return undefined;
  const length = segments.length;
  return first.orientation === "vertical"
    ? { x: origin.x + first.col * gridSize, y: origin.y + (first.row + length / 2) * gridSize }
    : { x: origin.x + (first.col + length / 2) * gridSize, y: origin.y + first.row * gridSize };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Kenar segmenti tahtanin icinde mi. Cizgi ekseni sinira esit olabilir. */
export function isEdgeSegmentInsideBoard(segment: EdgeSegment, board: PlacementBoard) {
  return segment.orientation === "vertical"
    ? segment.col >= 0 && segment.col <= board.cols && segment.row >= 0 && segment.row < board.rows
    : segment.col >= 0 && segment.col < board.cols && segment.row >= 0 && segment.row <= board.rows;
}
