export type SpatialPoint = { id: string; x: number; y: number };

export class SpatialGrid<T extends SpatialPoint> {
  private readonly cells = new Map<string, T[]>();

  constructor(readonly cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error("cellSize must be positive");
  }

  rebuild(items: Iterable<T>) {
    this.cells.clear();
    for (const item of items) {
      const key = this.key(Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
      const cell = this.cells.get(key);
      if (cell) cell.push(item);
      else this.cells.set(key, [item]);
    }
  }

  queryCircle(x: number, y: number, radius: number): T[] {
    const safeRadius = Math.max(0, radius);
    const minCol = Math.floor((x - safeRadius) / this.cellSize);
    const maxCol = Math.floor((x + safeRadius) / this.cellSize);
    const minRow = Math.floor((y - safeRadius) / this.cellSize);
    const maxRow = Math.floor((y + safeRadius) / this.cellSize);
    const radiusSq = safeRadius * safeRadius;
    const results: T[] = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        for (const item of this.cells.get(this.key(col, row)) ?? []) {
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= radiusSq) results.push(item);
        }
      }
    }
    return results;
  }

  private key(col: number, row: number) {
    return `${col}:${row}`;
  }
}
