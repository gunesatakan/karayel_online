/**
 * Harita geometrisi ve yerlesim plani (botun "gozu").
 *
 * Bot odanin durumunu okuyor ama hicbir kurali kendisi uygulamiyor:
 * yerlestirme gecerliligini odanin `canPlaceTower`ina soruyor, sonucu
 * odanin kendi isleyicisi veriyor. Burada yalnizca botun nereye ne
 * koymak istedigi hesaplaniyor.
 *
 * Plan (huni / "funnel"):
 * - haritanin ust ucte birine yakin yatay bir izgara cizgisi boyunca tam
 *   genislikte duvar hatti; ucanlarin indigi nexus noktasina yakin bir
 *   sutunda tek karelik bosluk (gecit), boylece kara ve hava ayni bolgeden
 *   geciyor;
 * - gecitten nexus'a dogru inen sutun koridor: kule konmuyor;
 * - savas kuleleri gecidin agzi ve koridorun iki yaninda, menzildeki yol
 *   agirligina gore siralanmis yuvalara; hattin yukarisina kule yok;
 * - kaynak binalari koridordan ve harita kenarindan uzakta, hattin altinda.
 *
 * Duvarsiz planda (`walls: false`) kuleler dusmanin dogal olarak yurudugu
 * sutunlari kapsayacak sekilde yayiliyor.
 */
import { shared } from "./match.mjs";

const { getMapGridSize, getMapOrigin, gridToWorld, worldToGrid, WALL_TOWER_ID } = shared;

export function getGeometry(room) {
  const map = room.activeMap;
  const size = getMapGridSize(map);
  const origin = getMapOrigin(map);
  return {
    cols: map.cols,
    rows: map.rows,
    size,
    origin,
    cellCenter: (col, row) => gridToWorld(col, row, map),
    /** Satir `row-1` ile `row` arasindaki yatay kenarin ortasi. */
    hEdge: (col, row) => ({ x: origin.x + (col + 0.5) * size, y: origin.y + row * size }),
    /** Sutun `col-1` ile `col` arasindaki dikey kenarin ortasi. */
    vEdge: (col, row) => ({ x: origin.x + col * size, y: origin.y + (row + 0.5) * size }),
    toCell: (x, y) => worldToGrid(x, y, map)
  };
}

export function getZoneSet(room) {
  const zones = room.buildZones;
  const set = new Set();
  if (zones && zones.cols === room.activeMap.cols) for (const index of zones.cells) set.add(index);
  return set;
}

/**
 * Ilk satirin `col` sutununda dogan ucanin inecegi nexus karesi (odanin kendi
 * kurali: en yakin nexus karesi). `single`: haritada tek nexus karesi var.
 */
function airLandingCell(room, geometry, col) {
  const single = room.activeMap.tiles.filter((tile) => tile === "nexus").length === 1;
  const spawn = geometry.cellCenter(col, 0);
  const point = typeof room.getNearestNexusPoint === "function"
    ? room.getNearestNexusPoint(spawn.x, spawn.y)
    : room.activePaths[0]?.points.at(-1) ?? geometry.cellCenter(col, geometry.rows - 1);
  return { ...geometry.toCell(point.x, point.y), single };
}

/** Yapilarin kapladigi kareler ve kapattigi kenarlar (yikik yapi engel degil). */
export function getBlockers(room) {
  const geometry = getGeometry(room);
  const cells = new Set();
  const edges = new Set();
  for (const tower of room.towers.values()) {
    if (tower.hp <= 0) continue;
    if (tower.definition.engine?.placement?.requiresEdge) {
      for (const segment of room.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation, room.getEdgeLength(tower.definition.id))) {
        edges.add(edgeKey(segment.orientation, segment.col, segment.row));
      }
      continue;
    }
    for (const cell of room.getTowerFootprintCells(tower.x, tower.y, tower.definition.id, tower.orientation)) {
      cells.add(cell.row * geometry.cols + cell.col);
    }
  }
  return { cells, edges };
}

export const edgeKey = (orientation, col, row) => `${orientation[0]}:${col}:${row}`;

/**
 * Kara yolu var mi: dogum satirinin her acik karesinden nexus satirina
 * (dort komsu, kareler ve kenarlar engel). Duvar hatti kapanmasin, kule
 * yuvasi koridoru tikamasin diye her yerlestirmeden once soruluyor.
 */
export function isMapRoutable(geometry, blockers, extraCells = [], extraEdges = []) {
  const { cols, rows } = geometry;
  const blockedCells = new Set(blockers.cells);
  for (const cell of extraCells) blockedCells.add(cell.row * cols + cell.col);
  const blockedEdges = new Set(blockers.edges);
  for (const edge of extraEdges) blockedEdges.add(edgeKey(edge.orientation, edge.col, edge.row));
  const passable = (fromCol, fromRow, col, row) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    if (blockedCells.has(row * cols + col)) return false;
    if (col === fromCol) {
      const edgeRow = Math.max(row, fromRow);
      return !blockedEdges.has(edgeKey("horizontal", col, edgeRow));
    }
    const edgeCol = Math.max(col, fromCol);
    return !blockedEdges.has(edgeKey("vertical", edgeCol, row));
  };
  // Nexus satirindan geriye dogru taranir; her acik dogum karesi ulasilmali.
  const seen = new Uint8Array(cols * rows);
  const queue = [];
  for (let col = 0; col < cols; col += 1) {
    const index = (rows - 1) * cols + col;
    if (blockedCells.has(index)) continue;
    seen[index] = 1;
    queue.push(index);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const col = index % cols;
    const row = Math.floor(index / cols);
    for (const [dc, dr] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (!passable(col, row, nextCol, nextRow)) continue;
      const next = nextRow * cols + nextCol;
      if (seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  let anySpawn = false;
  for (let col = 0; col < cols; col += 1) {
    if (blockedCells.has(col)) continue;
    anySpawn = true;
    if (!seen[col]) return false;
  }
  return anySpawn;
}

/**
 * Huni plani. Zarsiz: ayni oda (yasak bolgeler, dugumler) -> ayni plan.
 *
 * @param {object} room
 * @param {object} options
 *   walls: duvar hatti kurulsun mu (false: duvarsiz yayilma)
 *   spacing: "isolated" | "trio" | "cluster" (bilgi; kurala bot uyuyor)
 *   reach: hucre cinsinden etkili menzil (yuva puani icin)
 *   converge: gecidi ucanlarin indigi noktaya yakin ac (false: orta sutun)
 */
export function planLayout(room, { walls = true, spacing = "isolated", reach = 2.4, converge = true } = {}) {
  const geometry = getGeometry(room);
  const { cols, rows } = geometry;
  const zones = getZoneSet(room);
  const nodeCells = Object.values(room.resourceLayout?.cells ?? {});
  const isZone = (col, row) => zones.has(row * cols + col);
  const centerCol = Math.floor(cols / 2);
  // Ucanlar en yakin nexus karesine iniyor (`MatchRoom.getNearestNexusPoint`):
  // acik arenada dogduklari sutunun altina, yani tek bir inis noktasi yok.
  // Yalnizca tek nexus kareli haritada hepsi ayni yere iner; gecit ve
  // koridor ona yakin acilirsa kara ve hava ayni oldurme bolgesinden gecer.
  const airTarget = airLandingCell(room, geometry, centerCol);
  const airCol = airTarget.single ? airTarget.col : centerCol;
  const preferredGap = converge && airTarget.single ? Math.max(1, Math.min(cols - 2, airCol + (airCol < cols / 2 ? 2 : -2))) : centerCol;

  // Hat: satir `line-1` ile `line` arasindaki cizgi. Yasak bolgeye degen
  // (kurulamayan) duvar parcasi en agir ceza: delik ikinci bir gecit olur.
  // Sonra koridordaki yasak kare, tercih edilen gecitten ve satirdan uzaklik.
  let best;
  if (walls) {
    const from = Math.max(3, Math.round(rows * 0.25));
    const to = Math.round(rows * 0.7);
    for (let line = from; line <= to; line += 1) {
      for (let gap = 1; gap <= cols - 2; gap += 1) {
        let blockedSegments = 0;
        for (let col = 0; col < cols; col += 1) {
          if (col === gap) continue;
          const point = geometry.hEdge(col, line);
          if (!room.canPlaceTower(point.x, point.y, WALL_TOWER_ID, "horizontal")) blockedSegments += 1;
        }
        // Gecit ve koridor bolgesinin kendisi yasak olmasin.
        let corridorZones = 0;
        for (let row = line - 1; row < rows; row += 1) if (isZone(gap, row)) corridorZones += 1;
        const score = blockedSegments * 100 + corridorZones * 10 + Math.abs(gap - preferredGap) * 1.5 + Math.abs(line - rows * 0.33) * 0.6;
        if (!best || score < best.score) best = { line, gap, score, blockedSegments };
      }
    }
  }
  const line = best?.line ?? Math.round(rows * 0.42);
  const gap = best?.gap ?? preferredGap;
  const wallEdges = walls ? Array.from({ length: cols }, (_, col) => col).filter((col) => col !== gap).map((col) => ({ col, row: line })) : [];

  // Dusmanin yuruyecegi kareler. Duvarsiz planda dogum satirindan nexus'a
  // her sutun ayni agirlikta.
  const pathWeights = new Map();
  const addPath = (col, row, weight) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    const key = row * cols + col;
    pathWeights.set(key, (pathWeights.get(key) ?? 0) + weight);
  };
  if (walls) {
    // Gecide yaklasma: hattin hemen ustu (dusman gecidi ararken hat boyunca
    // yuruyor) ve gecitten nexus satirina inen koridor. Hattin yukarisi
    // bilerek bos: oradaki kule butun kalabaligin atesine acik kalir.
    for (let col = gap - 2; col <= gap + 2; col += 1) addPath(col, line - 1, col === gap ? 1 : 0.5);
    for (let row = line; row < rows; row += 1) addPath(gap, row, 1);
  } else {
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) addPath(col, row, 1 / cols);
  }
  const corridor = new Set();
  if (walls) {
    for (let row = line - 1; row < rows; row += 1) corridor.add(row * cols + gap);
    corridor.add((line - 2) * cols + gap);
  }

  // Ucanlar akis alanini yok sayip en yakin nexus karesine ucuyor: dogum
  // satirinin her sutunundan kendi inis karesine duz cizgiler.
  const airWeights = new Map();
  for (let col = 0; col < cols; col += 1) {
    const target = airLandingCell(room, geometry, col);
    const steps = rows * 2;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const key = Math.round(t * target.row) * cols + Math.round(col + (target.col - col) * t);
      airWeights.set(key, (airWeights.get(key) ?? 0) + 1 / (cols * 2));
    }
  }

  // Savas yuvalari: menzildeki yol agirligi. Koridor, gecidin agzi ve hattin
  // yukarisi bos kaliyor; kaynak dugumleri de.
  const slots = [];
  for (let row = 1; row < rows - 1; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = row * cols + col;
      if (corridor.has(key) || isZone(col, row)) continue;
      if (walls && row >= line - 2 && row <= line - 1 && Math.abs(col - gap) <= 1) continue;
      if (walls && row < line - 2) continue;
      if (nodeCells.some((node) => node.col === col && node.row === row)) continue;
      const within = (weights) => {
        let sum = 0;
        for (const [pathKey, weight] of weights) {
          const distance = Math.hypot(pathKey % cols - col, Math.floor(pathKey / cols) - row);
          if (distance <= reach) sum += weight * (1 + (reach - distance) * 0.15);
        }
        return sum;
      };
      const value = within(pathWeights);
      const airValue = within(airWeights);
      if (value > 0 || airValue > 0) slots.push({ col, row, value, airValue });
    }
  }
  slots.sort((a, b) => b.value - a.value || a.row - b.row || a.col - b.col);

  // Destek yuvalari: hattin altinda, koridordan uzak, nexus'a yakin.
  const supportSlots = [];
  for (let row = walls ? line + 1 : Math.floor(rows * 0.6); row < rows - 1; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = row * cols + col;
      if (corridor.has(key) || isZone(col, row)) continue;
      if (nodeCells.some((node) => node.col === col && node.row === row)) continue;
      const corridorDistance = walls ? Math.abs(col - gap) : 3;
      if (corridorDistance < 3) continue;
      // Koridordan uzak ama harita kenarindan da uzak: toplayici akincilar
      // (2. asama+) kenarlardan giriyor ve once kaynak binalarina yuruyor.
      const edgeDistance = Math.min(col, cols - 1 - col);
      const value = -Math.abs(corridorDistance - 3.5) + Math.min(2, edgeDistance) * 1.2 + row * 0.25;
      supportSlots.push({ col, row, value });
    }
  }
  supportSlots.sort((a, b) => b.value - a.value || a.row - b.row || a.col - b.col);

  return { walls, line, gap, wallEdges, slots, supportSlots, corridor, spacing, geometry, blockedSegments: best?.blockedSegments ?? 0 };
}

/** Iki kare Chebyshev komsusu mu (Atakan yalnizlik kurali). */
export function isAdjacent(a, b) {
  return Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
}
