export type MapTileKind = "empty" | "road" | "tower" | "spawn" | "nexus";

export type EditableMapData = {
  version: 1;
  scale: MapScale;
  cols: number;
  rows: number;
  tiles: MapTileKind[];
};

export type MapScale = 1 | 2;

export type GridPoint = {
  col: number;
  row: number;
};

export type WorldPoint = {
  x: number;
  y: number;
};

export type RuntimePath = {
  points: WorldPoint[];
  segments: Array<{ from: WorldPoint; to: WorldPoint; length: number }>;
  totalLength: number;
};

const GAME_WIDTH = 390;
const GAME_HEIGHT = 844;
const GRID_TOP = 86;
const GRID_SIZE = 34;
export const DEFAULT_MAP_SCALE: MapScale = 1;
export const MAX_MAP_SCALE: MapScale = 2;
const DEFAULT_PATH = [
  { x: 34, y: 104 },
  { x: 326, y: 104 },
  { x: 326, y: 244 },
  { x: 82, y: 244 },
  { x: 82, y: 392 },
  { x: 318, y: 392 },
  { x: 318, y: 540 },
  { x: 72, y: 540 },
  { x: 72, y: 694 },
  { x: 356, y: 694 },
  { x: 356, y: 812 }
] as const;

export const MAP_GRID_COLS = Math.floor(GAME_WIDTH / GRID_SIZE);
export const MAP_GRID_ROWS = Math.floor((GAME_HEIGHT - GRID_TOP) / GRID_SIZE);
export const MAP_STORAGE_KEY = "karayel:custom-map:v1";

export function getMapScale(mapOrScale: EditableMapData | number | undefined): MapScale {
  if (typeof mapOrScale === "number") {
    return normalizeMapScale(mapOrScale);
  }

  return normalizeMapScale(mapOrScale?.scale);
}

export function getMapGridSize(mapOrScale: EditableMapData | number | undefined = DEFAULT_MAP_SCALE) {
  return GRID_SIZE / getMapScale(mapOrScale);
}

export function getMapMetrics(mapOrScale: EditableMapData | number | undefined = DEFAULT_MAP_SCALE) {
  const scale = getMapScale(mapOrScale);
  const gridSize = getMapGridSize(scale);
  return {
    scale,
    gridSize,
    cols: Math.floor(GAME_WIDTH / gridSize),
    rows: Math.floor((GAME_HEIGHT - GRID_TOP) / gridSize)
  };
}

export function createEmptyMap(scale: MapScale = DEFAULT_MAP_SCALE): EditableMapData {
  const metrics = getMapMetrics(scale);
  return {
    version: 1,
    scale: metrics.scale,
    cols: metrics.cols,
    rows: metrics.rows,
    tiles: Array.from({ length: metrics.cols * metrics.rows }, () => "tower" as MapTileKind)
  };
}

export function createDefaultEditableMap(scale: MapScale = DEFAULT_MAP_SCALE): EditableMapData {
  const map = createEmptyMap(scale);
  const { gridSize } = getMapMetrics(map);

  for (let row = 0; row < map.rows; row += 1) {
    for (let col = 0; col < map.cols; col += 1) {
      const point = gridToWorld(col, row, map);
      if (distanceToDefaultPath(point.x, point.y) <= gridSize * 0.82) {
        setTile(map, col, row, "road");
      }
    }
  }

  const start = worldToGrid(DEFAULT_PATH[0].x, DEFAULT_PATH[0].y, map);
  const end = worldToGrid(DEFAULT_PATH[DEFAULT_PATH.length - 1].x, DEFAULT_PATH[DEFAULT_PATH.length - 1].y, map);
  setTile(map, start.col, start.row, "spawn");
  setTile(map, end.col, end.row, "nexus");
  return map;
}

export function normalizeMapData(map: unknown, fallbackScale: MapScale = DEFAULT_MAP_SCALE): EditableMapData {
  if (!map || typeof map !== "object") {
    return createDefaultEditableMap(fallbackScale);
  }

  const candidate = map as Partial<EditableMapData>;
  const scale = normalizeMapScale(candidate.scale ?? fallbackScale);
  const metrics = getMapMetrics(scale);
  if (
    candidate.version !== 1 ||
    candidate.cols !== metrics.cols ||
    candidate.rows !== metrics.rows ||
    !Array.isArray(candidate.tiles) ||
    candidate.tiles.length !== metrics.cols * metrics.rows
  ) {
    return createDefaultEditableMap(scale);
  }

  const validKinds = new Set<MapTileKind>(["empty", "road", "tower", "spawn", "nexus"]);
  return {
    version: 1,
    scale,
    cols: metrics.cols,
    rows: metrics.rows,
    tiles: candidate.tiles.map((tile) => validKinds.has(tile as MapTileKind) ? tile as MapTileKind : "tower")
  };
}

export function scaleEditableMap(map: EditableMapData, targetScale: MapScale): EditableMapData {
  const source = normalizeMapData(map);
  if (source.scale === targetScale) {
    return source;
  }

  const scaleRatio = targetScale / source.scale;
  const scaledMap = createEmptyMap(targetScale);

  for (let row = 0; row < scaledMap.rows; row += 1) {
    for (let col = 0; col < scaledMap.cols; col += 1) {
      const sourceCol = Math.min(source.cols - 1, Math.floor(col / scaleRatio));
      const sourceRow = Math.min(source.rows - 1, Math.floor(row / scaleRatio));
      const sourceTile = getTile(source, sourceCol, sourceRow);
      setTile(scaledMap, col, row, sourceTile === "spawn" || sourceTile === "nexus" ? "road" : sourceTile);
    }
  }

  for (const spawn of getMapPoints(source, "spawn")) {
    const targetCol = Math.min(scaledMap.cols - 1, Math.floor(spawn.col * scaleRatio + scaleRatio / 2));
    const targetRow = Math.min(scaledMap.rows - 1, Math.floor(spawn.row * scaleRatio + scaleRatio / 2));
    setTile(scaledMap, targetCol, targetRow, "spawn");
  }

  for (const nexus of getMapPoints(source, "nexus")) {
    const targetCol = Math.min(scaledMap.cols - 1, Math.floor(nexus.col * scaleRatio + scaleRatio / 2));
    const targetRow = Math.min(scaledMap.rows - 1, Math.floor(nexus.row * scaleRatio + scaleRatio / 2));
    setTile(scaledMap, targetCol, targetRow, "nexus");
  }

  return scaledMap;
}

export function getTile(map: EditableMapData, col: number, row: number) {
  if (!isInsideMap(map, col, row)) {
    return "empty";
  }
  return map.tiles[row * map.cols + col] ?? "empty";
}

export function setTile(map: EditableMapData, col: number, row: number, kind: MapTileKind) {
  if (!isInsideMap(map, col, row)) {
    return;
  }
  map.tiles[row * map.cols + col] = kind;
}

export function isInsideMap(map: EditableMapData, col: number, row: number) {
  return col >= 0 && col < map.cols && row >= 0 && row < map.rows;
}

export function worldToGrid(x: number, y: number, mapOrScale: EditableMapData | number | undefined = DEFAULT_MAP_SCALE): GridPoint {
  const metrics = getMapMetrics(mapOrScale);
  return {
    col: Math.max(0, Math.min(metrics.cols - 1, Math.floor(x / metrics.gridSize))),
    row: Math.max(0, Math.min(metrics.rows - 1, Math.floor((y - GRID_TOP) / metrics.gridSize)))
  };
}

export function gridToWorld(col: number, row: number, mapOrScale: EditableMapData | number | undefined = DEFAULT_MAP_SCALE): WorldPoint {
  const gridSize = getMapGridSize(mapOrScale);
  return {
    x: col * gridSize + gridSize / 2,
    y: GRID_TOP + row * gridSize + gridSize / 2
  };
}

export function getMapPoints(map: EditableMapData, kind: MapTileKind): GridPoint[] {
  const points: GridPoint[] = [];
  for (let row = 0; row < map.rows; row += 1) {
    for (let col = 0; col < map.cols; col += 1) {
      if (getTile(map, col, row) === kind) {
        points.push({ col, row });
      }
    }
  }
  return points;
}

export function isWalkableTile(kind: MapTileKind) {
  return kind === "road" || kind === "spawn" || kind === "nexus";
}

export function findPathToNearestNexus(map: EditableMapData, spawn: GridPoint): GridPoint[] {
  const queue: GridPoint[] = [spawn];
  const cameFrom = new Map<string, string>();
  const seen = new Set<string>([pointKey(spawn)]);
  let end: GridPoint | undefined;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (getTile(map, current.col, current.row) === "nexus") {
      end = current;
      break;
    }

    for (const next of getNeighbors(map, current)) {
      const key = pointKey(next);
      if (seen.has(key) || !isWalkableTile(getTile(map, next.col, next.row))) {
        continue;
      }
      seen.add(key);
      cameFrom.set(key, pointKey(current));
      queue.push(next);
    }
  }

  if (!end) {
    return [];
  }

  const path: GridPoint[] = [end];
  let cursor = pointKey(end);
  while (cursor !== pointKey(spawn)) {
    const previous = cameFrom.get(cursor);
    if (!previous) {
      return [];
    }
    const [col, row] = previous.split(":").map(Number);
    path.push({ col, row });
    cursor = previous;
  }
  return path.reverse();
}

export function pathToWorldPoints(path: GridPoint[], mapOrScale: EditableMapData | number | undefined = DEFAULT_MAP_SCALE): WorldPoint[] {
  return path.map((point) => gridToWorld(point.col, point.row, mapOrScale));
}

export function buildRuntimePaths(map: EditableMapData): RuntimePath[] {
  const spawns = getMapPoints(map, "spawn");
  const paths = spawns
    .map((spawn) => pathToWorldPoints(findPathToNearestNexus(map, spawn), map))
    .filter((points) => points.length >= 2)
    .map(createRuntimePath);

  if (paths.length > 0) {
    return paths;
  }

  const fallbackMap = createDefaultEditableMap(getMapScale(map));
  const fallbackSpawn = getMapPoints(fallbackMap, "spawn")[0];
  const fallbackPoints = fallbackSpawn ? pathToWorldPoints(findPathToNearestNexus(fallbackMap, fallbackSpawn), fallbackMap) : [];
  return [createRuntimePath(fallbackPoints)];
}

export function getPointAlongRuntimePath(path: RuntimePath | undefined, distance: number): WorldPoint {
  if (!path || path.points.length === 0) {
    return gridToWorld(0, 0);
  }

  let remaining = distance;
  for (const segment of path.segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length <= 0 ? 0 : remaining / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio
      };
    }
    remaining -= segment.length;
  }

  return path.points[path.points.length - 1];
}

function createRuntimePath(points: WorldPoint[]): RuntimePath {
  const safePoints = points.length >= 2 ? points : [gridToWorld(0, 0), gridToWorld(0, 0)];
  const segments = safePoints.slice(0, -1).map((point, index) => {
    const next = safePoints[index + 1];
    return {
      from: point,
      to: next,
      length: Math.hypot(next.x - point.x, next.y - point.y)
    };
  });

  return {
    points: safePoints,
    segments,
    totalLength: segments.reduce((total, segment) => total + segment.length, 0)
  };
}

function getNeighbors(map: EditableMapData, point: GridPoint) {
  return [
    { col: point.col + 1, row: point.row },
    { col: point.col - 1, row: point.row },
    { col: point.col, row: point.row + 1 },
    { col: point.col, row: point.row - 1 }
  ].filter((candidate) => isInsideMap(map, candidate.col, candidate.row));
}

function pointKey(point: GridPoint) {
  return `${point.col}:${point.row}`;
}

function distanceToDefaultPath(x: number, y: number) {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < DEFAULT_PATH.length - 1; index += 1) {
    const from = DEFAULT_PATH[index];
    const to = DEFAULT_PATH[index + 1];
    closest = Math.min(closest, distanceToSegment(x, y, from.x, from.y, to.x, to.y));
  }
  return closest;
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function normalizeMapScale(scale: unknown): MapScale {
  return scale === 2 ? 2 : 1;
}
