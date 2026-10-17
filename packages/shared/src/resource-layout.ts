import type { ResourceKind } from "./resource-economy.js";

/**
 * Kaynak dugumlerinin haritadaki yerlesimi.
 *
 * Dugumler bir donem her macta ayni karelerdeydi (sutun/satir oranlariyla
 * sabit). Simdi mac basinda sunucuda bir kez, tohumlu zarla dagitiliyor:
 * sayilari, kimlikleri ve turleri ayni, yalnizca yerleri degisiyor. Kimlige
 * bagli her sey (isci atamasi, kalan miktar, kristal tuzagi) oldugu gibi
 * calisiyor.
 *
 * Burasi saf: harita olcusu, yasak kareler, dugum listesi ve zar giriyor,
 * kareler cikiyor. Sunucu sonucu saklayip her snapshotta dunya konumu olarak
 * yolluyor; istemcide yerlesim sabiti yok.
 *
 * Dugumler bugun hareketi **kapatmiyor**: dusman da isci de dugumun
 * karesinden geciyor, yalnizca yapilar engel. Bu yuzden "duvar olusturmasin"
 * sarti araliktan (iki dugum asla komsu degil) ve asagidaki erisim
 * dogrulamasindan geliyor; dogrulamanin pahali kismi (dogum -> nexus yolu)
 * yalnizca dugumler engel sayilirsa (`nodesBlockMovement`) kosuyor.
 */
export type ResourceLayoutCell = { col: number; row: number };

export type MapResourceNodeDefinition = { id: string; kind: ResourceKind };

/**
 * Haritadaki dugumler: uc enerji kristali, birer barut / mistik oz / guc
 * kristali / demir yatagi. Sira telde ve kadro adlarinda ("Enerji kristali 2")
 * kullaniliyor; degismemeli.
 */
export const MAP_RESOURCE_NODES: readonly MapResourceNodeDefinition[] = [
  { id: "crystal-1", kind: "energy" },
  { id: "crystal-2", kind: "energy" },
  { id: "crystal-3", kind: "energy" },
  { id: "ammo-source-1", kind: "gunpowder" },
  { id: "ammo-source-2", kind: "mystic" },
  { id: "ammo-source-3", kind: "plasma" },
  { id: "iron-1", kind: "iron" }
];

/**
 * Haritanin olcusune gore dugumler.
 *
 * Dusman sayisi harita olcegiyle (1-4) dogrusal buyuyor
 * (`getArenaWaveEnemyCount`); dugumler eskiden her olcekte ayni yediydi ve
 * buyuk haritada ekonomi dusmanin gerisinde kaliyordu. Simdi olcek kadar
 * takim: 1. olcekte 7, 2.'de 14, 3.'te 21, 4.'te 28 dugum, her turden ayni
 * oranda. Ilk takim eski kimlikleri tasiyor ("crystal-1".."iron-1"); sonraki
 * takimlar numarayi suruyor: enerji `crystal-4`.., muhimmat hammaddeleri
 * ayni tur sirasiyla `ammo-source-4` (barut), `-5` (mistik oz), `-6` (guc
 * kristali).., demir `iron-2`.. Kimlik sirasi turun kadro numarasi.
 */
export function getMapResourceNodes(mapScale: number): readonly MapResourceNodeDefinition[] {
  const sets = Math.max(1, Math.min(4, Math.round(Number.isFinite(mapScale) ? mapScale : 1)));
  if (sets === 1) return MAP_RESOURCE_NODES;
  const cached = SCALED_RESOURCE_NODES.get(sets);
  if (cached) return cached;
  const nodes: MapResourceNodeDefinition[] = [];
  for (let set = 0; set < sets; set += 1) {
    const counters = { crystal: 0, ammo: 0, iron: 0 };
    for (const node of MAP_RESOURCE_NODES) {
      if (set === 0) {
        nodes.push(node);
        continue;
      }
      const family = node.id.startsWith("crystal-") ? "crystal" : node.id.startsWith("ammo-source-") ? "ammo" : "iron";
      const perSet = family === "crystal" ? 3 : family === "ammo" ? 3 : 1;
      counters[family] += 1;
      const prefix = family === "crystal" ? "crystal" : family === "ammo" ? "ammo-source" : "iron";
      nodes.push({ id: `${prefix}-${set * perSet + counters[family]}`, kind: node.kind });
    }
  }
  SCALED_RESOURCE_NODES.set(sets, nodes);
  return nodes;
}

const SCALED_RESOURCE_NODES = new Map<number, readonly MapResourceNodeDefinition[]>();

/** Harita kenarindan en az bu kadar kare iceride (yandan giren yiyici ve isciler dolasabilsin). */
export const RESOURCE_LAYOUT_EDGE_MARGIN = 1;
/** Dogum karelerine Chebyshev mesafesi bundan buyuk olmali (dogum bandi ve dibi yasak). */
export const RESOURCE_LAYOUT_SPAWN_CLEARANCE = 1;
/** Nexus karelerine Chebyshev mesafesi bundan buyuk olmali (nexusun ustu ve bitisigi yasak). */
export const RESOURCE_LAYOUT_NEXUS_CLEARANCE = 1;
/**
 * Iki dugum arasindaki en az Chebyshev mesafesi, tercih sirasiyla: once 3
 * (arada iki bos kare), sigmiyorsa 2 (arada bir bos kare). Daha azi
 * denenmiyor: bitisik dugumler duvar gibi dizilebilirdi; o durumda sabit
 * yerlesime donuluyor.
 */
export const RESOURCE_LAYOUT_SPACINGS: readonly number[] = [3, 2];
/** Her aralik kademesinde en fazla bu kadar deneme; sonra bir alt kademe, en sonda sabit yerlesim. */
export const RESOURCE_LAYOUT_ATTEMPTS_PER_SPACING = 24;
/** "Usse yakin" bolge: haritanin alt %60'i (satir olarak). */
export const RESOURCE_LAYOUT_NEAR_BASE_SHARE = 0.6;
/**
 * Adil baslangic: bu turlerin her birinden en az bir dugum usse yakin bolgede.
 * Enerji (uc kristalden biri) ve baslangic muhimmatinin hammaddesi barut.
 */
export const RESOURCE_LAYOUT_NEAR_BASE_KINDS: readonly ResourceKind[] = ["energy", "gunpowder"];

export type ResourceLayoutSource = "random" | "explicit" | "fallback";

export type ResourceLayoutInput = {
  cols: number;
  rows: number;
  nodes: readonly MapResourceNodeDefinition[];
  /** Tohumlu zar (0..1). Yalnizca gerekirse cagriliyor: tamami sabit verilmis yerlesim zar atmaz. */
  random: () => number;
  /** Dusman dogum kareleri; verilmezse (ya da bossa) ust satirin tamami. */
  spawnCells?: readonly ResourceLayoutCell[];
  /** Nexus kareleri; verilmezse (ya da bossa) alt satirin tamami. */
  nexusCells?: readonly ResourceLayoutCell[];
  /** Dugum konamayan kareler (insa alani disi). */
  forbiddenCells?: readonly ResourceLayoutCell[];
  /** Hareketi kapatan kareler (ayakta yapilar). Dugum buraya da konmaz. */
  blockedCells?: readonly ResourceLayoutCell[];
  /** Dugumler hareketi kapatiyor mu. Bugun kapatmiyor; varsayilan `false`. */
  nodesBlockMovement?: boolean;
  /** Haritanin acikca verdigi konumlar: oldugu gibi kalir, zarla dagitilmaz. */
  fixed?: Readonly<Record<string, ResourceLayoutCell>>;
  /** Usse yakin bolgede en az bir dugumu olmasi gereken turler. */
  nearBaseKinds?: readonly string[];
  /** Deneme siniri asilirsa donulen yerlesim; verilmezse eski sabit yerlesim. */
  fallback?: Readonly<Record<string, ResourceLayoutCell>>;
  attemptsPerSpacing?: number;
};

export type ResourceLayoutResult = {
  cells: Record<string, ResourceLayoutCell>;
  source: ResourceLayoutSource;
  /** Tutan en az aralik (Chebyshev); sabit ya da acik yerlesimde 0. */
  spacing: number;
  attempts: number;
};

/**
 * Eski sabit yerlesim: sutun ve satir oranlari. Arena kurulmadan once (lobi,
 * test duzenegi) ve zar bir yerlesim cikaramazsa buna donuluyor. Formul
 * sunucudaki eski hesapla birebir ayni.
 */
export function getFixedResourceLayout(cols: number, rows: number, nodes: readonly MapResourceNodeDefinition[] = MAP_RESOURCE_NODES): Record<string, ResourceLayoutCell> {
  const col = (ratio: number) => Math.max(1, Math.min(cols - 2, Math.round((cols - 1) * ratio)));
  const row = (ratio: number) => Math.max(2, Math.min(rows - 3, Math.round((rows - 1) * ratio)));
  const base: Record<string, ResourceLayoutCell> = {
    "crystal-1": { col: col(0.2), row: row(0.35) },
    "crystal-2": { col: col(0.5), row: row(0.62) },
    "crystal-3": { col: col(0.8), row: row(0.35) },
    "ammo-source-1": { col: col(0.14), row: row(0.68) },
    "ammo-source-2": { col: col(0.56), row: row(0.28) },
    "ammo-source-3": { col: col(0.86), row: row(0.68) },
    "iron-1": { col: Math.max(1, Math.floor(cols * 0.32)), row: Math.max(2, Math.floor(rows * 0.48)) }
  };
  // Buyuk haritanin ek takimlari: eski oranlarda yeri olmayan dugumler,
  // ic karelerden kullanilmislara en uzak olana (sirayla, zarsiz).
  const extras = nodes.filter((node) => !base[node.id]);
  if (extras.length === 0) return base;
  const used = Object.values(base);
  const interior: ResourceLayoutCell[] = [];
  for (let r = 2; r <= rows - 3; r += 1) for (let c = 1; c <= cols - 2; c += 1) interior.push({ col: c, row: r });
  for (const node of extras) {
    const cell = pickFarthestCell(interior, used);
    if (!cell) break;
    base[node.id] = cell;
    used.push(cell);
  }
  return base;
}

/** Adaylardan kullanilmis karelere (Chebyshev) en uzak olani; esitlikte listede ilk. */
function pickFarthestCell(candidates: readonly ResourceLayoutCell[], used: readonly ResourceLayoutCell[]) {
  let best: ResourceLayoutCell | undefined;
  let bestDistance = 0;
  for (const cell of candidates) {
    let distance = Number.POSITIVE_INFINITY;
    for (const other of used) distance = Math.min(distance, chebyshev(cell, other));
    if (distance > bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Yerlesim zari (mulberry32). Oda tohumundan kendi tuzuyla turuyor: ozel
 * dusman zarini (`createSpecialRandom`) ve `Math.random` akisini kaydirmiyor.
 */
export function createResourceLayoutRandom(seed: number) {
  let state = (Math.imul((seed >>> 0) ^ 0x51ed270b, 0x9e3779b1) ^ 0x7f4a7c15) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Usse yakin bolgenin ilk satiri: bu satir ve altindakiler alt %60'in icinde. */
export function getResourceNearBaseFirstRow(rows: number) {
  return rows - Math.floor(rows * RESOURCE_LAYOUT_NEAR_BASE_SHARE + 1e-9);
}

type LayoutGrid = {
  cols: number;
  rows: number;
  spawnCells: ResourceLayoutCell[];
  nexusCells: ResourceLayoutCell[];
  /** Dugum konamayan kareler (yasak + engelli). */
  forbidden: Set<number>;
  /** Hareketi kapatan kareler. */
  blocked: Set<number>;
  nearBaseFirstRow: number;
};

function chebyshev(a: ResourceLayoutCell, b: ResourceLayoutCell) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function isCell(value: unknown): value is ResourceLayoutCell {
  const cell = value as ResourceLayoutCell | undefined;
  return Boolean(cell) && Number.isInteger(cell!.col) && Number.isInteger(cell!.row);
}

function createLayoutGrid(input: ResourceLayoutInput): LayoutGrid {
  const cols = Math.max(1, Math.floor(input.cols));
  const rows = Math.max(1, Math.floor(input.rows));
  const inside = (cell: ResourceLayoutCell) => isCell(cell) && cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows;
  const wholeRow = (row: number) => Array.from({ length: cols }, (_, col) => ({ col, row }));
  const spawnCells = (input.spawnCells ?? []).filter(inside);
  const nexusCells = (input.nexusCells ?? []).filter(inside);
  const blocked = new Set((input.blockedCells ?? []).filter(inside).map((cell) => cell.row * cols + cell.col));
  const forbidden = new Set((input.forbiddenCells ?? []).filter(inside).map((cell) => cell.row * cols + cell.col));
  for (const index of blocked) forbidden.add(index);
  return {
    cols,
    rows,
    spawnCells: spawnCells.length > 0 ? spawnCells : wholeRow(0),
    nexusCells: nexusCells.length > 0 ? nexusCells : wholeRow(rows - 1),
    forbidden,
    blocked,
    nearBaseFirstRow: getResourceNearBaseFirstRow(rows)
  };
}

/** Karenin kurallara uymayan yani; uyuyorsa `undefined`. Aralik ve adil baslangic burada degil. */
function getCellProblem(grid: LayoutGrid, cell: ResourceLayoutCell): string | undefined {
  if (!isCell(cell) || cell.col < 0 || cell.col >= grid.cols || cell.row < 0 || cell.row >= grid.rows) return "outside";
  const margin = RESOURCE_LAYOUT_EDGE_MARGIN;
  if (cell.col < margin || cell.col > grid.cols - 1 - margin || cell.row < margin || cell.row > grid.rows - 1 - margin) return "edge";
  if (grid.forbidden.has(cell.row * grid.cols + cell.col)) return "forbidden";
  if (grid.spawnCells.some((spawn) => chebyshev(spawn, cell) <= RESOURCE_LAYOUT_SPAWN_CLEARANCE)) return "spawn";
  if (grid.nexusCells.some((nexus) => chebyshev(nexus, cell) <= RESOURCE_LAYOUT_NEXUS_CLEARANCE)) return "nexus";
  return undefined;
}

function getFixedCells(input: ResourceLayoutInput, grid: LayoutGrid) {
  const fixed = new Map<string, ResourceLayoutCell>();
  for (const node of input.nodes) {
    const cell = input.fixed?.[node.id];
    if (!isCell(cell) || cell.col < 0 || cell.col >= grid.cols || cell.row < 0 || cell.row >= grid.rows) continue;
    fixed.set(node.id, { col: cell.col, row: cell.row });
  }
  return fixed;
}

/** Dort yonlu tasma: `starts`tan, `closed` karelere girmeden ulasilan kareler (1 = ulasildi). */
function floodLayoutGrid(grid: LayoutGrid, closed: ReadonlySet<number>, starts: readonly ResourceLayoutCell[]) {
  const { cols, rows } = grid;
  const seen = new Uint8Array(cols * rows);
  const queue: number[] = [];
  for (const start of starts) {
    const index = start.row * cols + start.col;
    if (closed.has(index) || seen[index] === 1) continue;
    seen[index] = 1;
    queue.push(index);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const col = index % cols;
    const row = (index - col) / cols;
    const neighbors = [
      row + 1 < rows ? index + cols : -1,
      col > 0 ? index - 1 : -1,
      col + 1 < cols ? index + 1 : -1,
      row > 0 ? index - cols : -1
    ];
    for (const next of neighbors) {
      if (next < 0 || seen[next] === 1 || closed.has(next)) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
}

/** Us alani: nexus kareleri ve bitisikleri (isciler nexusun ustundeki satirda toplaniyor). */
function getBaseCells(grid: LayoutGrid) {
  const base: ResourceLayoutCell[] = [];
  for (const nexus of grid.nexusCells) {
    for (let row = nexus.row - 1; row <= nexus.row + 1; row += 1) {
      for (let col = nexus.col - 1; col <= nexus.col + 1; col += 1) {
        if (col >= 0 && col < grid.cols && row >= 0 && row < grid.rows) base.push({ col, row });
      }
    }
  }
  return base;
}

/**
 * Yol dogrulamasi: dogumdan nexusa yuruyen bir yol var mi ve her dugume usten
 * (nexus ve bitisigi) ulasilabiliyor mu. Kurallar oyunun kendi kurallari:
 * dort yonlu yuruyus, engeller yapilar; isci engelli hedefe bitisik kareden
 * de ulasiyor (`isWorkerDeliveryReach`).
 */
function getRouteProblems(
  grid: LayoutGrid,
  nodes: readonly MapResourceNodeDefinition[],
  cells: ReadonlyMap<string, ResourceLayoutCell>,
  nodesBlockMovement: boolean
): string[] {
  // Dugumler engel degilse ve ayakta yapi yoksa dikdortgen izgara tek parca:
  // aranacak bir sey yok.
  if (!nodesBlockMovement && grid.blocked.size === 0) return [];
  const { cols, rows } = grid;
  const closed = new Set(grid.blocked);
  if (nodesBlockMovement) for (const cell of cells.values()) closed.add(cell.row * cols + cell.col);

  const problems: string[] = [];
  if (nodesBlockMovement) {
    const fromSpawn = floodLayoutGrid(grid, closed, grid.spawnCells);
    if (!grid.nexusCells.some((nexus) => fromSpawn[nexus.row * cols + nexus.col] === 1)) problems.push("spawn-route");
  }
  const fromBase = floodLayoutGrid(grid, closed, getBaseCells(grid));
  for (const node of nodes) {
    const cell = cells.get(node.id);
    if (!cell) continue;
    const reachable = [[0, 0], [0, 1], [-1, 0], [1, 0], [0, -1]].some(([dc, dr]) => {
      const col = cell.col + dc;
      const row = cell.row + dr;
      return col >= 0 && col < cols && row >= 0 && row < rows && fromBase[row * cols + col] === 1;
    });
    if (!reachable) problems.push(`unreachable:${node.id}`);
  }
  return problems;
}

/**
 * Bir yerlesimin butun kurallara uyup uymadigi; bos liste "uyuyor" demek.
 *
 * Haritanin acikca verdigi (`fixed`) dugumler kare kurallarindan ve araliktan
 * muaf: haritayi cizen ne dediyse o. Testler ve sunucu ayni dogrulamayi okuyor.
 */
export function validateResourceLayout(
  input: Omit<ResourceLayoutInput, "random">,
  cells: Readonly<Record<string, ResourceLayoutCell>>,
  options: { spacing?: number } = {}
): string[] {
  const grid = createLayoutGrid({ ...input, random: () => 0 });
  const fixed = getFixedCells({ ...input, random: () => 0 }, grid);
  const spacing = options.spacing ?? RESOURCE_LAYOUT_SPACINGS[RESOURCE_LAYOUT_SPACINGS.length - 1];
  const problems: string[] = [];
  const placed = new Map<string, ResourceLayoutCell>();
  for (const node of input.nodes) {
    const cell = cells[node.id];
    if (!isCell(cell)) {
      problems.push(`missing:${node.id}`);
      continue;
    }
    placed.set(node.id, cell);
    if (fixed.has(node.id)) continue;
    const problem = getCellProblem(grid, cell);
    if (problem) problems.push(`${problem}:${node.id}`);
  }
  const entries = [...placed.entries()];
  for (let a = 0; a < entries.length; a += 1) {
    for (let b = a + 1; b < entries.length; b += 1) {
      if (fixed.has(entries[a][0]) && fixed.has(entries[b][0])) continue;
      if (chebyshev(entries[a][1], entries[b][1]) < spacing) problems.push(`spacing:${entries[a][0]}:${entries[b][0]}`);
    }
  }
  for (const kind of input.nearBaseKinds ?? RESOURCE_LAYOUT_NEAR_BASE_KINDS) {
    const ofKind = input.nodes.filter((node) => node.kind === kind && placed.has(node.id));
    if (ofKind.length === 0 || ofKind.every((node) => fixed.has(node.id))) continue;
    if (!ofKind.some((node) => placed.get(node.id)!.row >= grid.nearBaseFirstRow)) problems.push(`near-base:${kind}`);
  }
  problems.push(...getRouteProblems(grid, input.nodes, placed, input.nodesBlockMovement === true));
  return problems;
}

/**
 * Dugumleri dagitir.
 *
 * Kurallar:
 * - Harita icinde, kenardan en az `RESOURCE_LAYOUT_EDGE_MARGIN` kare iceride,
 *   yasak/engelli olmayan karede.
 * - Dogum karelerinde ve bitisiginde degil; nexus karelerinde ve bitisiginde degil.
 * - Iki dugum arasi Chebyshev mesafesi en az 3; sigmiyorsa 2.
 * - `nearBaseKinds` turlerinin her birinden en az bir dugum alt %60'ta.
 * - `fixed` ile verilen dugumler yerinde kalir; digerleri onlara da aralik birakir.
 * - Yerlesimden sonra yol dogrulamasi; tutmazsa yeniden zar.
 *
 * Deneme siniri (kademe basina `RESOURCE_LAYOUT_ATTEMPTS_PER_SPACING`) asilirsa
 * `fallback` (eski sabit yerlesim) doner; acik konumlar orada da korunur.
 * Ayni girdi ve ayni zar her zaman ayni sonucu verir.
 */
export function placeResourceNodes(input: ResourceLayoutInput): ResourceLayoutResult {
  const grid = createLayoutGrid(input);
  const fixed = getFixedCells(input, grid);
  const toRecord = (cells: ReadonlyMap<string, ResourceLayoutCell>) => {
    const record: Record<string, ResourceLayoutCell> = {};
    for (const node of input.nodes) {
      const cell = cells.get(node.id);
      if (cell) record[node.id] = { col: cell.col, row: cell.row };
    }
    return record;
  };
  const free = input.nodes.filter((node) => !fixed.has(node.id));
  if (free.length === 0) return { cells: toRecord(fixed), source: "explicit", spacing: 0, attempts: 0 };

  // Ayakta yapi varsa: usten ulasilamayan kareler aday bile degil (isci oraya
  // hic varamazdi). Dugumler engel olmadigi icin bu, kare basina kesin.
  const reachable = grid.blocked.size > 0 ? floodLayoutGrid(grid, grid.blocked, getBaseCells(grid)) : undefined;
  const candidates: ResourceLayoutCell[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const cell = { col, row };
      if (getCellProblem(grid, cell)) continue;
      if (reachable && reachable[row * grid.cols + col] !== 1) continue;
      candidates.push(cell);
    }
  }
  const nearBaseKinds = input.nearBaseKinds ?? RESOURCE_LAYOUT_NEAR_BASE_KINDS;
  const isNearBase = (cell: ResourceLayoutCell) => cell.row >= grid.nearBaseFirstRow;
  const pick = <T>(list: readonly T[]) => list[Math.min(list.length - 1, Math.max(0, Math.floor(input.random() * list.length)))];

  const tryPlace = (spacing: number) => {
    const placed = new Map(fixed);
    // Adil baslangic: turun acik konumlu bir dugumu zaten usse yakinsa tamam;
    // degilse serbest dugumlerinden biri zarla secilip yakin bolgeye baglanir.
    const anchors = new Set<string>();
    for (const kind of nearBaseKinds) {
      const ofKind = input.nodes.filter((node) => node.kind === kind);
      if (ofKind.some((node) => fixed.has(node.id) && isNearBase(fixed.get(node.id)!))) continue;
      const freeOfKind = ofKind.filter((node) => !fixed.has(node.id));
      if (freeOfKind.length > 0) anchors.add(pick(freeOfKind).id);
    }
    // Baglilar once: yakin bolge dar, yer kalmadan onlar otursun.
    const order = [...free.filter((node) => anchors.has(node.id)), ...free.filter((node) => !anchors.has(node.id))];
    for (const node of order) {
      const anchored = anchors.has(node.id);
      const options = candidates.filter((cell) => {
        if (anchored && !isNearBase(cell)) return false;
        for (const other of placed.values()) if (chebyshev(other, cell) < spacing) return false;
        return true;
      });
      if (options.length === 0) return undefined;
      placed.set(node.id, pick(options));
    }
    return placed;
  };

  const attemptsPerSpacing = Math.max(1, Math.floor(input.attemptsPerSpacing ?? RESOURCE_LAYOUT_ATTEMPTS_PER_SPACING));
  let attempts = 0;
  if (candidates.length > 0) {
    for (const spacing of RESOURCE_LAYOUT_SPACINGS) {
      for (let attempt = 0; attempt < attemptsPerSpacing; attempt += 1) {
        attempts += 1;
        const placed = tryPlace(spacing);
        // Hic yer bulunamadiysa ayni kademede zar yeniden atilir: baglilarin
        // sirasi ve yeri degisince sigabilir.
        if (!placed) continue;
        if (getRouteProblems(grid, input.nodes, placed, input.nodesBlockMovement === true).length > 0) continue;
        return { cells: toRecord(placed), source: "random", spacing, attempts };
      }
    }
  }

  const fallback = new Map<string, ResourceLayoutCell>();
  const legacy = input.fallback ?? getFixedResourceLayout(grid.cols, grid.rows, input.nodes);
  for (const node of input.nodes) {
    let cell = fixed.get(node.id) ?? legacy[node.id];
    // Sabit yerlesimin karesi yasaksa (kurulum yasak bolge, yapi) en yakin
    // bos adaya kaydiriliyor: dugum yasak kareye hicbir yoldan dusmuyor.
    if (isCell(cell) && !fixed.has(node.id) && grid.forbidden.has(cell.row * grid.cols + cell.col)) {
      const from = cell;
      const used = new Set([...fallback.values()].map((entry) => entry.row * grid.cols + entry.col));
      const nearest = candidates
        .filter((entry) => !used.has(entry.row * grid.cols + entry.col))
        .sort((a, b) => chebyshev(a, from) - chebyshev(b, from) || (a.row - b.row) || (a.col - b.col))[0];
      if (nearest) cell = nearest;
    }
    if (isCell(cell)) fallback.set(node.id, cell);
  }
  return { cells: toRecord(fallback), source: "fallback", spacing: 0, attempts };
}

/**
 * Bir turun usse en yakin dugumu: baslangic toplayicilarinin varsayilan isi.
 *
 * Olcu, dugumun en yakin us karesine (nexus) uzakligi; esitlikte `from`
 * noktasina (iscinin dogdugu kare) yakin olan, sonra listedeki sira. Konumlar
 * rastgele oldugu icin "1 numarali dugum" artik yakin olan demek degil.
 */
export function getNearestResourceNodeId(options: {
  nodes: readonly MapResourceNodeDefinition[];
  cells: Readonly<Record<string, ResourceLayoutCell>>;
  kind: string;
  baseCells: readonly ResourceLayoutCell[];
  from?: ResourceLayoutCell;
}): string | undefined {
  const distanceSq = (a: ResourceLayoutCell, b: ResourceLayoutCell) => (a.col - b.col) ** 2 + (a.row - b.row) ** 2;
  let best: { id: string; base: number; from: number } | undefined;
  for (const node of options.nodes) {
    if (node.kind !== options.kind) continue;
    const cell = options.cells[node.id];
    if (!isCell(cell)) continue;
    let base = Number.POSITIVE_INFINITY;
    for (const baseCell of options.baseCells) base = Math.min(base, distanceSq(baseCell, cell));
    if (!Number.isFinite(base)) base = 0;
    const from = options.from ? distanceSq(options.from, cell) : 0;
    if (!best || base < best.base || (base === best.base && from < best.from)) best = { id: node.id, base, from };
  }
  return best?.id;
}
