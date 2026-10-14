/**
 * Kurulum yasak bolgeler ("No-build zone").
 *
 * Mac basinda sunucuda bir kez, oda tohumundan tureyen kendi zariyla
 * (`createBuildZoneRandom`) uretiliyor ve mac boyunca degismiyor. Bolge
 * yalnizca insayi kapatiyor: kule (cok kareli kulenin herhangi bir karesi)
 * bolge karesine, duvar ve kenar yapilari bolge karesine degen kenara
 * kurulamiyor. Dusman, isci ve mermi bolgeden normal geciyor.
 *
 * Burasi saf: izgara olcusu, dogum/nexus kareleri, engelli kareler ve zar
 * giriyor; lekeler (blob) ve birlesik kare listesi cikiyor. Ayni girdi ve ayni
 * zar her zaman ayni sonucu veriyor.
 *
 * Kurallar:
 * - 1x arenada (12x18) 2-4 leke, her biri 3-8 dik komsu kare; buyuk
 *   haritalarda leke sayisi ve boyu alan oraninin karekokuyle buyuyor.
 * - Toplam, insa edilebilir karelerin %8-12'si (dogum ve nexus kareleri disi).
 * - Dogum ve nexus satirlarinda ve bitisik satirlarda yok; yan kenarlardan en
 *   az bir kare iceride.
 * - Bir leke bir satirin en fazla %40'ini, butun lekeler birlikte en fazla
 *   %50'sini kapliyor: harita insa icin ikiye bolunmuyor.
 * - Lekeler birbirine ne dik ne kosegen degiyor.
 * - Adil baslangic: haritanin alt ucte biri en az %85 insa edilebilir kaliyor.
 * - Engelli kareler (ayakta yapi, duvar bitisigi, haritanin acik dugum
 *   konumu) bolgeye girmiyor.
 */

export type BuildZoneCell = { col: number; row: number };

/** Telde ve odada tutulan bicim: kare indeksleri (`row * cols + col`), artan sirada. */
export type BuildZoneMap = { cols: number; rows: number; cells: readonly number[] };

export type BuildZoneSource = "random" | "fallback";

export type BuildZoneInput = {
  cols: number;
  rows: number;
  /** Tohumlu zar (0..1). */
  random: () => number;
  /** Dusman dogum kareleri; verilmezse (ya da bossa) ust satirin tamami. */
  spawnCells?: readonly BuildZoneCell[];
  /** Nexus kareleri; verilmezse (ya da bossa) alt satirin tamami. */
  nexusCells?: readonly BuildZoneCell[];
  /** Bolgeye giremeyen kareler (ayakta yapilar, duvar bitisikleri, acik dugum konumlari). */
  blockedCells?: readonly BuildZoneCell[];
  attempts?: number;
};

export type BuildZoneLayout = BuildZoneMap & {
  /** Lekeler; her biri kendi kare indeksleri (buyume sirasinda). */
  blobs: number[][];
  source: BuildZoneSource;
  attempts: number;
};

/** Toplam bolgenin insa edilebilir karelere orani: alt ve ust sinir. */
export const BUILD_ZONE_SHARE_MIN = 0.08;
export const BUILD_ZONE_SHARE_MAX = 0.12;
/** 1x arenadaki (12x18) leke sayisi ve leke boyu araligi. */
export const BUILD_ZONE_BASE_BLOB_COUNT: readonly [number, number] = [2, 4];
export const BUILD_ZONE_BASE_BLOB_SIZE: readonly [number, number] = [3, 8];
/** Olcek referansi: 12x18 arenanin insa edilebilir kare sayisi (dogum ve nexus satirlari disi). */
export const BUILD_ZONE_REFERENCE_BUILDABLE = 12 * 16;
/** Yan kenarlardan en az bu kadar kare iceride. */
export const BUILD_ZONE_EDGE_MARGIN = 1;
/** Bir lekenin bir satirda kaplayabilecegi en fazla pay. */
export const BUILD_ZONE_ROW_BLOB_SHARE = 0.4;
/** Butun lekelerin bir satirda kaplayabilecegi en fazla pay. */
export const BUILD_ZONE_ROW_TOTAL_SHARE = 0.5;
/** Haritanin alt ucte biri en az bu oranda insa edilebilir kalmali. */
export const BUILD_ZONE_BOTTOM_BUILDABLE_SHARE = 0.85;
export const BUILD_ZONE_ATTEMPTS = 48;
/** Bir leke icin tohum karesi denemesi. */
const BLOB_SEED_TRIES = 16;

/**
 * Bolge zari (mulberry32). Oda tohumundan kendi tuzuyla turuyor: kaynak
 * yerlesim zarini (`createResourceLayoutRandom`), dogum ve ozel dusman
 * zarlarini kaydirmiyor.
 */
export function createBuildZoneRandom(seed: number) {
  let state = (Math.imul((seed >>> 0) ^ 0x2c1b3c6d, 0x85ebca6b) ^ 0x3a8f05c5) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alt ucte birin ilk satiri (bu satir ve altindakiler). */
export function getBuildZoneBottomFirstRow(rows: number) {
  return rows - Math.ceil(rows / 3);
}

/** Olcege gore kurallarin sayilari; testler ve uretec ayni yerden okuyor. */
export function getBuildZoneLimits(input: { cols: number; rows: number; spawnCells?: readonly BuildZoneCell[]; nexusCells?: readonly BuildZoneCell[] }) {
  const grid = createGrid({ ...input, random: () => 0 });
  const growth = Math.sqrt(Math.max(1, grid.buildable) / BUILD_ZONE_REFERENCE_BUILDABLE);
  const scaleRange = ([min, max]: readonly [number, number]) => {
    const low = Math.max(1, Math.round(min * growth));
    return [low, Math.max(low, Math.round(max * growth))] as const;
  };
  const blobCount = scaleRange(BUILD_ZONE_BASE_BLOB_COUNT);
  const blobSize = scaleRange(BUILD_ZONE_BASE_BLOB_SIZE);
  let bottomBuildable = 0;
  for (let row = grid.bottomFirstRow; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) if (!grid.base.has(row * grid.cols + col)) bottomBuildable += 1;
  }
  return {
    buildable: grid.buildable,
    totalMin: Math.ceil(grid.buildable * BUILD_ZONE_SHARE_MIN),
    totalMax: Math.floor(grid.buildable * BUILD_ZONE_SHARE_MAX),
    blobCount,
    blobSize,
    rowBlobMax: Math.max(1, Math.floor(grid.cols * BUILD_ZONE_ROW_BLOB_SHARE)),
    rowTotalMax: Math.max(1, Math.floor(grid.cols * BUILD_ZONE_ROW_TOTAL_SHARE)),
    bottomFirstRow: grid.bottomFirstRow,
    bottomBuildable,
    bottomZoneMax: Math.floor(bottomBuildable * (1 - BUILD_ZONE_BOTTOM_BUILDABLE_SHARE) + 1e-9)
  };
}

type ZoneGrid = {
  cols: number;
  rows: number;
  /** Dogum ve nexus kareleri (insa alani disi). */
  base: Set<number>;
  /** Bolgeye girebilen kareler, indeks sirasinda. */
  eligible: number[];
  eligibleSet: Set<number>;
  buildable: number;
  bottomFirstRow: number;
};

function createGrid(input: BuildZoneInput): ZoneGrid {
  const cols = Math.max(1, Math.floor(input.cols));
  const rows = Math.max(1, Math.floor(input.rows));
  const inside = (cell: BuildZoneCell) => Boolean(cell) && Number.isInteger(cell.col) && Number.isInteger(cell.row) && cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows;
  const wholeRow = (row: number) => Array.from({ length: cols }, (_, col) => ({ col, row }));
  const spawn = (input.spawnCells ?? []).filter(inside);
  const nexus = (input.nexusCells ?? []).filter(inside);
  const spawnCells = spawn.length > 0 ? spawn : wholeRow(0);
  const nexusCells = nexus.length > 0 ? nexus : wholeRow(rows - 1);
  const base = new Set<number>();
  // Dogum/nexus satirlari ve bitisik satirlar tamamen kapali.
  const closedRows = new Set<number>();
  for (const cell of [...spawnCells, ...nexusCells]) {
    base.add(cell.row * cols + cell.col);
    for (let row = cell.row - 1; row <= cell.row + 1; row += 1) closedRows.add(row);
  }
  const blocked = new Set((input.blockedCells ?? []).filter(inside).map((cell) => cell.row * cols + cell.col));
  const eligible: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    if (closedRows.has(row)) continue;
    for (let col = BUILD_ZONE_EDGE_MARGIN; col < cols - BUILD_ZONE_EDGE_MARGIN; col += 1) {
      const index = row * cols + col;
      if (!blocked.has(index) && !base.has(index)) eligible.push(index);
    }
  }
  return {
    cols,
    rows,
    base,
    eligible,
    eligibleSet: new Set(eligible),
    buildable: cols * rows - base.size,
    bottomFirstRow: getBuildZoneBottomFirstRow(rows)
  };
}

/**
 * Bolgeleri uretir.
 *
 * Her denemede toplam hedef, leke sayisi ve leke boylari zarla seciliyor;
 * lekeler buyukten kucuge, rastgele bir tohum karesinden rastgele dik
 * komsularla buyutuluyor. Bir leke sigmazsa yeni tohum, o da olmazsa yeni
 * deneme. Deneme siniri asilirsa butun sert kurallara uyan en buyuk yarim
 * sonuc donuyor (`fallback`; pratikte gorulmuyor, testler sayiyor).
 */
export function generateBuildZones(input: BuildZoneInput): BuildZoneLayout {
  const grid = createGrid(input);
  const limits = getBuildZoneLimits(input);
  const { cols } = grid;
  const random = input.random;
  const pickIndex = (length: number) => Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
  const [countMin, countMax] = limits.blobCount;
  const [sizeMin, sizeMax] = limits.blobSize;

  const tryLayout = () => {
    const totalMin = Math.min(limits.totalMin, limits.totalMax);
    const target = totalMin + pickIndex(limits.totalMax - totalMin + 1);
    const counts: number[] = [];
    for (let count = countMin; count <= countMax; count += 1) {
      if (count * sizeMin <= target && target <= count * sizeMax) counts.push(count);
    }
    if (counts.length === 0) return { blobs: [] as number[][], complete: false };
    const count = counts[pickIndex(counts.length)];
    const sizes = Array.from({ length: count }, () => sizeMin);
    for (let left = target - count * sizeMin; left > 0; left -= 1) {
      const open = sizes.map((size, index) => (size < sizeMax ? index : -1)).filter((index) => index >= 0);
      sizes[open[pickIndex(open.length)]] += 1;
    }
    sizes.sort((a, b) => b - a);

    const taken = new Set<number>();
    const rowTotals = new Map<number, number>();
    let bottomCount = 0;
    const blobs: number[][] = [];
    // Baska bir lekeye (kosegen dahil) degmeyen, uygun kare.
    const isFree = (index: number) => {
      if (!grid.eligibleSet.has(index) || taken.has(index)) return false;
      const col = index % cols;
      const row = (index - col) / cols;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || c >= cols || r < 0 || r >= grid.rows) continue;
          if (taken.has(r * cols + c)) return false;
        }
      }
      return true;
    };
    for (const size of sizes) {
      let placed: number[] | undefined;
      for (let tryIndex = 0; tryIndex < BLOB_SEED_TRIES && !placed; tryIndex += 1) {
        const seeds = grid.eligible.filter((index) => isFree(index) && (Math.floor(index / cols) < grid.bottomFirstRow || bottomCount < limits.bottomZoneMax) && (rowTotals.get(Math.floor(index / cols)) ?? 0) < limits.rowTotalMax);
        if (seeds.length === 0) break;
        const blob = [seeds[pickIndex(seeds.length)]];
        const own = new Set(blob);
        const rowCounts = new Map<number, number>();
        const ownRow = (index: number) => Math.floor(index / cols);
        rowCounts.set(ownRow(blob[0]), 1);
        let bottom = ownRow(blob[0]) >= grid.bottomFirstRow ? 1 : 0;
        while (blob.length < size) {
          const frontier: number[] = [];
          const seen = new Set<number>();
          for (const index of blob) {
            const col = index % cols;
            const row = ownRow(index);
            const neighbors = [
              row > 0 ? index - cols : -1,
              col > 0 ? index - 1 : -1,
              col + 1 < cols ? index + 1 : -1,
              row + 1 < grid.rows ? index + cols : -1
            ];
            for (const next of neighbors) {
              if (next < 0 || own.has(next) || seen.has(next)) continue;
              seen.add(next);
              if (!isFree(next)) continue;
              const nextRow = ownRow(next);
              if ((rowCounts.get(nextRow) ?? 0) >= limits.rowBlobMax) continue;
              if ((rowTotals.get(nextRow) ?? 0) + (rowCounts.get(nextRow) ?? 0) >= limits.rowTotalMax) continue;
              if (nextRow >= grid.bottomFirstRow && bottomCount + bottom >= limits.bottomZoneMax) continue;
              frontier.push(next);
            }
          }
          if (frontier.length === 0) break;
          frontier.sort((a, b) => a - b);
          const next = frontier[pickIndex(frontier.length)];
          blob.push(next);
          own.add(next);
          rowCounts.set(ownRow(next), (rowCounts.get(ownRow(next)) ?? 0) + 1);
          if (ownRow(next) >= grid.bottomFirstRow) bottom += 1;
        }
        if (blob.length === size) placed = blob;
      }
      if (!placed) return { blobs, complete: false };
      for (const index of placed) {
        taken.add(index);
        const row = Math.floor(index / cols);
        rowTotals.set(row, (rowTotals.get(row) ?? 0) + 1);
        if (row >= grid.bottomFirstRow) bottomCount += 1;
      }
      blobs.push(placed);
    }
    return { blobs, complete: true };
  };

  const attemptLimit = Math.max(1, Math.floor(input.attempts ?? BUILD_ZONE_ATTEMPTS));
  let best: number[][] = [];
  let attempts = 0;
  if (grid.eligible.length > 0 && limits.totalMax > 0) {
    for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
      attempts += 1;
      const result = tryLayout();
      if (result.complete) return toLayout(grid, result.blobs, "random", attempts);
      const total = result.blobs.reduce((sum, blob) => sum + blob.length, 0);
      if (total > best.reduce((sum, blob) => sum + blob.length, 0)) best = result.blobs;
    }
  }
  return toLayout(grid, best, "fallback", attempts);
}

function toLayout(grid: ZoneGrid, blobs: number[][], source: BuildZoneSource, attempts: number): BuildZoneLayout {
  const cells = blobs.flat().sort((a, b) => a - b);
  return { cols: grid.cols, rows: grid.rows, cells, blobs: blobs.map((blob) => [...blob]), source, attempts };
}

/**
 * Hizli sorgu: bolge haritasi -> kare kumesi. Olcu tutmayan (eski arenanin)
 * bolge bos sayiliyor: baska izgaranin indeksleri yanlis karelere duserdi.
 */
export function createBuildZoneLookup(zones: BuildZoneMap | undefined, cols: number, rows: number) {
  const set = new Set<number>();
  if (zones && zones.cols === cols && zones.rows === rows) {
    for (const index of zones.cells) {
      if (Number.isInteger(index) && index >= 0 && index < cols * rows) set.add(index);
    }
  }
  return {
    size: set.size,
    has(col: number, row: number) {
      return col >= 0 && col < cols && row >= 0 && row < rows && set.has(row * cols + col);
    }
  };
}

export type BuildZoneLookup = ReturnType<typeof createBuildZoneLookup>;

/** Kule ayak izinin herhangi bir karesi bolgede mi. */
export function isFootprintInBuildZone(lookup: BuildZoneLookup, footprint: readonly BuildZoneCell[]) {
  return lookup.size > 0 && footprint.some((cell) => lookup.has(cell.col, cell.row));
}

/**
 * Kenar segmenti bir bolge karesine degiyor mu. Dikey segment (col, row)
 * (col-1, row) ile (col, row) arasindaki cizgi; yatay segment (col, row-1)
 * ile (col, row) arasindaki cizgi (`getEdgeSegments` ile ayni kural).
 */
export function isEdgeTouchingBuildZone(lookup: BuildZoneLookup, segment: { orientation: "horizontal" | "vertical"; col: number; row: number }) {
  if (lookup.size === 0) return false;
  return segment.orientation === "vertical"
    ? lookup.has(segment.col - 1, segment.row) || lookup.has(segment.col, segment.row)
    : lookup.has(segment.col, segment.row - 1) || lookup.has(segment.col, segment.row);
}

/** Kare indekslerini dik komsuluga gore lekelere ayirir (istemci cizimi icin; teldeki bicimde leke yok). */
export function groupBuildZoneBlobs(zones: BuildZoneMap): number[][] {
  const { cols, rows } = zones;
  const set = new Set(zones.cells);
  const seen = new Set<number>();
  const blobs: number[][] = [];
  for (const start of [...set].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    const blob: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const index = queue.shift()!;
      blob.push(index);
      const col = index % cols;
      const row = (index - col) / cols;
      for (const [dc, dr] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const c = col + dc;
        const r = row + dr;
        const next = r * cols + c;
        if (c < 0 || c >= cols || r < 0 || r >= rows || !set.has(next) || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    blobs.push(blob.sort((a, b) => a - b));
  }
  return blobs;
}
