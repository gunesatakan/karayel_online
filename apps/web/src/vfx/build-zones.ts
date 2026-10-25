import type Phaser from "phaser";
import { createBuildZoneLookup, getBuildZoneReliefs, groupBuildZoneBlobs, isEdgeTouchingBuildZone, isFootprintInBuildZone, type BuildZoneMap } from "@karayel/shared";

/**
 * Kurulum yasak bolgelerin zemin cizimi.
 *
 * Dil "kararsiz zemin": karenin zemini koyulasiyor, ustunde ince capraz
 * taramalar ve birkac sert catlak; her lekenin dis kenarinda soluk pas/amber
 * tek bir ince cizgi. Hareket yok, parilti yok. Koyu sahne zemininde
 * "buraya kurulmaz" diye okunmali ama haritayi bagirtmamali.
 *
 * Kontur kare kare degil, lekenin birlesik dis siniri: bitisik iki bolge
 * karesi arasinda cizgi yok. Delik (lekenin icinde kalan bos kare) cizilmiyor.
 *
 * Saf hesaplar (kontur, tarama, catlak) Phaser'a dokunmuyor; testler cagri
 * dizisini kaydedici Graphics ile okuyor. Cizim harita degisince bir kez
 * (`drawMap`); her karede degil.
 */

export type BuildZoneDrawMetrics = { originX: number; originY: number; cellSize: number };

export const BUILD_ZONE_STYLE = {
  /** Zemin koyulastirmasi. */
  fill: 0x020407,
  fillAlpha: 0.5,
  /** Ince capraz tarama: kurulumu yasak alanlarin bilinen isareti. */
  hatch: 0xa0643a,
  hatchAlpha: 0.3,
  /** Tarama araligi, kare boyunun kesri. */
  hatchSpacing: 0.2,
  /** Catlaklar: zeminden koyu, keskin. */
  crack: 0x000000,
  crackAlpha: 0.62,
  /** Dis kontur: soluk pas/amber. */
  outline: 0xc07a3c,
  outlineAlpha: 0.78
} as const;

export type ZoneCorner = { col: number; row: number };

/**
 * Onizlemenin yasak bolge kurali (sunucudaki `canPlaceTower` /
 * `canPlaceAbartiEdge` ile ayni): kulenin ayak izinin tek karesi bolgedeyse ya
 * da kenar yapisinin bir segmenti bolge karesine degiyorsa gecersiz. Olcusu
 * haritayla tutmayan bolge yok sayiliyor.
 */
export function isPlacementBlockedByBuildZone(
  zones: BuildZoneMap | undefined,
  board: { cols: number; rows: number },
  placement: { footprint?: readonly ZoneCorner[]; segments?: ReadonlyArray<{ orientation: "horizontal" | "vertical"; col: number; row: number }> }
) {
  const lookup = createBuildZoneLookup(zones, board.cols, board.rows);
  if (lookup.size === 0) return false;
  if (placement.segments && placement.segments.some((segment) => isEdgeTouchingBuildZone(lookup, segment))) return true;
  return placement.footprint ? isFootprintInBuildZone(lookup, placement.footprint) : false;
}

/** Leke/harita anahtari: bolgeler degismedikce harita yeniden cizilmesin. */
export function getBuildZoneRenderKey(zones: BuildZoneMap | undefined) {
  return zones && zones.cells.length > 0 ? `${zones.cols}x${zones.rows}:${zones.cells.join(",")}` : "";
}

/**
 * Her lekenin birlesik dis konturu: izgara kose noktalarindan kapali
 * cokgenler (ekranda saat yonunde), ayni dogrultudaki ara koseler atilmis.
 * Lekenin icindeki delikler (ters yonde donen halkalar) donmuyor.
 */
export function getBuildZoneContours(zones: BuildZoneMap): ZoneCorner[][] {
  const contours: ZoneCorner[][] = [];
  for (const blob of groupBuildZoneBlobs(zones)) {
    const set = new Set(blob);
    const has = (col: number, row: number) => col >= 0 && col < zones.cols && row >= 0 && row < zones.rows && set.has(row * zones.cols + col);
    // Yonlu sinir kenarlari; ic taraf yonun sagi (ekranda y asagi).
    type Edge = { from: ZoneCorner; to: ZoneCorner; used: boolean };
    const edges: Edge[] = [];
    const byStart = new Map<string, Edge[]>();
    const key = (corner: ZoneCorner) => `${corner.col}:${corner.row}`;
    const addEdge = (from: ZoneCorner, to: ZoneCorner) => {
      const edge = { from, to, used: false };
      edges.push(edge);
      const list = byStart.get(key(from)) ?? [];
      list.push(edge);
      byStart.set(key(from), list);
    };
    for (const index of blob) {
      const col = index % zones.cols;
      const row = (index - col) / zones.cols;
      if (!has(col, row - 1)) addEdge({ col, row }, { col: col + 1, row });
      if (!has(col + 1, row)) addEdge({ col: col + 1, row }, { col: col + 1, row: row + 1 });
      if (!has(col, row + 1)) addEdge({ col: col + 1, row: row + 1 }, { col, row: row + 1 });
      if (!has(col - 1, row)) addEdge({ col, row: row + 1 }, { col, row });
    }
    for (const start of edges) {
      if (start.used) continue;
      const loop: ZoneCorner[] = [];
      let edge: Edge | undefined = start;
      while (edge && !edge.used) {
        edge.used = true;
        loop.push(edge.from);
        const dx = edge.to.col - edge.from.col;
        const dy = edge.to.row - edge.from.row;
        const options: Edge[] = (byStart.get(key(edge.to)) ?? []).filter((candidate) => !candidate.used);
        // Kosegen sikisma noktasinda saga donus: halkalar basit cokgen kaliyor.
        options.sort((a, b) => turnRank(dx, dy, a) - turnRank(dx, dy, b));
        edge = options[0];
      }
      const simplified = simplifyLoop(loop);
      if (simplified.length >= 4 && signedArea(simplified) > 0) contours.push(simplified);
    }
  }
  return contours;
}

/** Saga donus 0, duz 1, sola 2 (ekran koordinati, y asagi). */
function turnRank(dx: number, dy: number, edge: { from: ZoneCorner; to: ZoneCorner }) {
  const ex = edge.to.col - edge.from.col;
  const ey = edge.to.row - edge.from.row;
  const cross = dx * ey - dy * ex;
  return cross > 0 ? 0 : cross === 0 ? 1 : 2;
}

function simplifyLoop(loop: ZoneCorner[]) {
  const result: ZoneCorner[] = [];
  for (let index = 0; index < loop.length; index += 1) {
    const previous = loop[(index + loop.length - 1) % loop.length];
    const current = loop[index];
    const next = loop[(index + 1) % loop.length];
    const collinear = (current.col - previous.col) * (next.row - current.row) - (current.row - previous.row) * (next.col - current.col) === 0;
    if (!collinear) result.push(current);
  }
  return result;
}

function signedArea(points: readonly ZoneCorner[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.col * b.row - b.col * a.row;
  }
  return area / 2;
}

export type ZoneSegment = { x1: number; y1: number; x2: number; y2: number };

/**
 * Capraz tarama ("/" yonunde), kareye kirpilmis. Cizgiler dunyaya hizali
 * (`x + y = k * aralik`): bitisik karelerde kesintisiz devam ediyor.
 */
export function getBuildZoneHatchSegments(zones: BuildZoneMap, metrics: BuildZoneDrawMetrics, spacing = metrics.cellSize * BUILD_ZONE_STYLE.hatchSpacing): ZoneSegment[] {
  const segments: ZoneSegment[] = [];
  const size = metrics.cellSize;
  if (!(spacing > 0) || !(size > 0)) return segments;
  for (const index of zones.cells) {
    const col = index % zones.cols;
    const row = (index - col) / zones.cols;
    const x0 = metrics.originX + col * size;
    const y0 = metrics.originY + row * size;
    const first = Math.floor((x0 + y0) / spacing) + 1;
    for (let k = first; k * spacing < x0 + y0 + 2 * size - 1e-6; k += 1) {
      const c = k * spacing;
      if (c <= x0 + y0 + 1e-6) continue;
      const startX = Math.max(x0, c - (y0 + size));
      const endX = Math.min(x0 + size, c - y0);
      segments.push({ x1: startX, y1: c - startX, x2: endX, y2: c - endX });
    }
  }
  return segments;
}

/** Kare indeksinden sabit sozde rastgele (0..1): catlaklar her cizimde ayni. */
function hash01(value: number, salt: number) {
  let t = (Math.imul(value + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 0x297a2d39) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/**
 * Catlaklar: karelerin yaklasik yarisinda bir kirik cizgi (uc nokta), bir
 * kenardan karsi kenara. Kare indeksine bagli, zar yok.
 */
export function getBuildZoneCrackPaths(zones: BuildZoneMap, metrics: BuildZoneDrawMetrics): Array<Array<{ x: number; y: number }>> {
  const paths: Array<Array<{ x: number; y: number }>> = [];
  const size = metrics.cellSize;
  for (const index of zones.cells) {
    if (hash01(index, 1) > 0.55) continue;
    const col = index % zones.cols;
    const row = (index - col) / zones.cols;
    const x0 = metrics.originX + col * size;
    const y0 = metrics.originY + row * size;
    const along = (salt: number) => 0.18 + hash01(index, salt) * 0.64;
    const horizontal = hash01(index, 2) < 0.5;
    const start = horizontal ? { x: x0, y: y0 + along(3) * size } : { x: x0 + along(3) * size, y: y0 };
    const end = horizontal ? { x: x0 + size, y: y0 + along(4) * size } : { x: x0 + along(4) * size, y: y0 + size };
    const mid = { x: x0 + (0.3 + hash01(index, 5) * 0.4) * size, y: y0 + (0.3 + hash01(index, 6) * 0.4) * size };
    paths.push([start, mid, end]);
  }
  return paths;
}

/** Bolgeleri harita grafigine cizer (zeminin ustune, oyun ogelerinin altina). */
export function drawBuildZones(graphics: Phaser.GameObjects.Graphics, zones: BuildZoneMap | undefined, metrics: BuildZoneDrawMetrics) {
  if (!zones || zones.cells.length === 0) return;
  const size = metrics.cellSize;
  const style = BUILD_ZONE_STYLE;
  graphics.fillStyle(style.fill, style.fillAlpha);
  for (const index of zones.cells) {
    const col = index % zones.cols;
    const row = (index - col) / zones.cols;
    graphics.fillRect(metrics.originX + col * size, metrics.originY + row * size, size, size);
  }
  graphics.lineStyle(Math.max(0.75, size * 0.03), style.hatch, style.hatchAlpha);
  for (const segment of getBuildZoneHatchSegments(zones, metrics)) {
    graphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
  }
  graphics.lineStyle(Math.max(1, size * 0.04), style.crack, style.crackAlpha);
  for (const path of getBuildZoneCrackPaths(zones, metrics)) {
    graphics.strokePoints(path, false, false);
  }
  graphics.lineStyle(Math.max(1, size * 0.045), style.outline, style.outlineAlpha);
  for (const contour of getBuildZoneContours(zones)) {
    graphics.strokePoints(contour.map((corner) => ({ x: metrics.originX + corner.col * size, y: metrics.originY + corner.row * size })), true, true);
  }
}

/**
 * Tepe ve cukur isaretleri (2D; egik 3D gorunum araziyi kendisi ciziyor).
 * Tepe kara atis hattini kesiyor, cukur kesmiyor: oyuncu hangisinin hangisi
 * oldugunu okuyabilmeli. Tepe: acik tas tonu, kabartma (ust-sol kenar
 * aydinlik, alt-sag golgeli) ve her karede karli bir zirve (harita isareti
 * gibi). Cukur: ters kabartma, daha koyu zemin ve ortada karanlik bir agiz.
 */
export const BUILD_ZONE_RELIEF_STYLE = {
  light: 0xe2cfb0,
  lightAlpha: 0.6,
  hillFill: 0x8a7660,
  hillFillAlpha: 0.2,
  shade: 0x000000,
  shadeAlpha: 0.55,
  /** Kabartma cizgisinin kenardan iceri payi, kare boyunun kesri. */
  bevelInset: 0.07,
  rock: 0x5b4f43,
  rockAlpha: 0.95,
  rockShade: 0x2a241f,
  snow: 0xf1e6d2,
  snowAlpha: 0.85,
  pitFill: 0x000000,
  pitFillAlpha: 0.45,
  mouth: 0x000000,
  mouthAlpha: 0.7,
  rim: 0xa37a52,
  rimAlpha: 0.55
} as const;

export type BuildZoneReliefMark = {
  hill: boolean;
  /** Kabartma: aydinlik ve golgeli kenar parcalari (dunya), iceri kaydirilmis. */
  lit: ZoneSegment[];
  shaded: ZoneSegment[];
  /** Isaretin merkezi: lekenin agirlik merkezine en yakin karesinin ortasi. */
  center: { x: number; y: number };
  cells: number[];
};

/** Her lekenin tepe/cukur isareti (saf hesap). */
export function getBuildZoneReliefMarks(zones: BuildZoneMap, metrics: BuildZoneDrawMetrics): BuildZoneReliefMark[] {
  const size = metrics.cellSize;
  const inset = size * BUILD_ZONE_RELIEF_STYLE.bevelInset;
  return getBuildZoneReliefs(zones).map(({ cells, hill }) => {
    const set = new Set(cells);
    const has = (col: number, row: number) => col >= 0 && col < zones.cols && row >= 0 && row < zones.rows && set.has(row * zones.cols + col);
    const top: ZoneSegment[] = [];
    const bottom: ZoneSegment[] = [];
    let sumX = 0;
    let sumY = 0;
    for (const index of cells) {
      const col = index % zones.cols;
      const row = (index - col) / zones.cols;
      const x0 = metrics.originX + col * size;
      const y0 = metrics.originY + row * size;
      sumX += col + 0.5;
      sumY += row + 0.5;
      if (!has(col, row - 1)) top.push({ x1: x0, y1: y0 + inset, x2: x0 + size, y2: y0 + inset });
      if (!has(col - 1, row)) top.push({ x1: x0 + inset, y1: y0, x2: x0 + inset, y2: y0 + size });
      if (!has(col, row + 1)) bottom.push({ x1: x0, y1: y0 + size - inset, x2: x0 + size, y2: y0 + size - inset });
      if (!has(col + 1, row)) bottom.push({ x1: x0 + size - inset, y1: y0, x2: x0 + size - inset, y2: y0 + size });
    }
    const meanCol = sumX / cells.length;
    const meanRow = sumY / cells.length;
    let best = cells[0];
    let bestDistance = Infinity;
    for (const index of cells) {
      const col = index % zones.cols;
      const row = (index - col) / zones.cols;
      const distance = (col + 0.5 - meanCol) ** 2 + (row + 0.5 - meanRow) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    const bestCol = best % zones.cols;
    const bestRow = (best - bestCol) / zones.cols;
    const center = { x: metrics.originX + (bestCol + 0.5) * size, y: metrics.originY + (bestRow + 0.5) * size };
    // Isik ust-soldan: tepede ust-sol kenar aydinlik, cukurda tersi.
    return { hill, lit: hill ? top : bottom, shaded: hill ? bottom : top, center, cells };
  });
}

/** Tepe ve cukur isaretlerini cizer (bolgelerin ustune, ayri grafik: 3D'de gizleniyor). */
export function drawBuildZoneReliefs(graphics: Phaser.GameObjects.Graphics, zones: BuildZoneMap | undefined, metrics: BuildZoneDrawMetrics) {
  if (!zones || zones.cells.length === 0) return;
  const size = metrics.cellSize;
  const style = BUILD_ZONE_RELIEF_STYLE;
  const width = Math.max(1, size * 0.06);
  for (const mark of getBuildZoneReliefMarks(zones, metrics)) {
    graphics.fillStyle(mark.hill ? style.hillFill : style.pitFill, mark.hill ? style.hillFillAlpha : style.pitFillAlpha);
    for (const index of mark.cells) {
      const col = index % zones.cols;
      const row = (index - col) / zones.cols;
      graphics.fillRect(metrics.originX + col * size, metrics.originY + row * size, size, size);
    }
    graphics.lineStyle(width, style.shade, style.shadeAlpha);
    for (const segment of mark.shaded) graphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
    graphics.lineStyle(width, style.light, style.lightAlpha);
    for (const segment of mark.lit) graphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
    if (mark.hill) {
      // Her karede bir zirve: aydinlik sol yamac, golgeli sag yamac, karli tepe.
      const s = size * 0.62;
      for (const index of mark.cells) {
        const col = index % zones.cols;
        const row = (index - col) / zones.cols;
        const x = metrics.originX + (col + 0.5 + (hash01(index, 8) - 0.5) * 0.16) * size;
        const y = metrics.originY + (row + 0.55) * size;
        const peak = { x: x + (hash01(index, 9) - 0.5) * 0.12 * s, y: y - 0.5 * s };
        graphics.fillStyle(style.rock, style.rockAlpha);
        graphics.fillTriangle(x - 0.5 * s, y + 0.3 * s, peak.x, peak.y, peak.x, y + 0.3 * s);
        graphics.fillStyle(style.rockShade, style.rockAlpha);
        graphics.fillTriangle(peak.x, peak.y, x + 0.5 * s, y + 0.3 * s, peak.x, y + 0.3 * s);
        graphics.fillStyle(style.snow, style.snowAlpha);
        const capLeft = { x: peak.x + (x - 0.5 * s - peak.x) * 0.32, y: peak.y + (y + 0.3 * s - peak.y) * 0.32 };
        const capRight = { x: peak.x + (x + 0.5 * s - peak.x) * 0.32, y: capLeft.y };
        graphics.fillTriangle(peak.x, peak.y, capLeft.x, capLeft.y, capRight.x, capRight.y);
        graphics.lineStyle(width * 0.8, style.light, style.lightAlpha);
        graphics.lineBetween(x - 0.5 * s, y + 0.3 * s, peak.x, peak.y);
      }
    } else {
      const { x, y } = mark.center;
      const s = size * 0.8;
      graphics.fillStyle(style.mouth, style.mouthAlpha);
      graphics.fillEllipse(x, y, s * 0.95, s * 0.6);
      graphics.lineStyle(width, style.rim, style.rimAlpha);
      graphics.strokeEllipse(x, y, s * 0.95, s * 0.6);
    }
  }
}
