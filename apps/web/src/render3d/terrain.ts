/**
 * Egik 3D gorunumun arazisi (yalnizca gorunus).
 *
 * - Kurulum yasak bolgeler lekeler halinde tepe ya da cukur
 *   (`getBuildZoneReliefs`, sunucuyla ayni: tepe kara atis hattini kesiyor,
 *   bolgeden kara birlikleri 0,66 hizla geciyor). Hedef gorunusle uyumlu,
 *   gercekci degil: tepe karelerinin her biri ayri, yukselmis bir blok
 *   (`getZoneLayout`); cukur kareleri duz, siyah ve kirmizi kenarli (karo
 *   dokusunda). Dusmanlar bloklarin ustunden geciyor (`createZoneHeight`).
 * - Arenanin cevresi bos: tahta uzayda suzuluyor (target-look).
 *
 * Saf hesap: three.js yok, node testleri dogrudan okuyor.
 */

import { getBuildZoneReliefs } from "@karayel/shared";

export type TerrainInput = {
  cols: number;
  rows: number;
  /** Bir karenin dunya boyu ve izgaranin sol-ust kosesi. */
  cellSize: number;
  originX: number;
  originY: number;
  /** Yasak bolge kare indeksleri (`row * cols + col`). */
  zoneCells: readonly number[];
};

/** Tepe blogunun boyu (hucre): kareye gore bu aralikta, tekrarlanabilir. */
export const ZONE_BLOCK_CELLS = { min: 0.5, max: 0.75 } as const;
/** Blogun disina yumusak rampa (hucre): dusman bloga cikarken sicramiyor. */
export const ZONE_BLOCK_RAMP_CELLS = 0.15;

/** Tekrarlanabilir deger gurultusu (0..1), iki oktav. */
export function terrainNoise(x: number, z: number) {
  const hash = (ix: number, iz: number) => {
    let h = (ix * 374761393 + iz * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const octave = (px: number, pz: number) => {
    const ix = Math.floor(px);
    const iz = Math.floor(pz);
    const fx = px - ix;
    const fz = pz - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const top = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * sx;
    const bottom = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * sx;
    return top + (bottom - top) * sz;
  };
  return octave(x, z) * 0.65 + octave(x * 2.7 + 17, z * 2.7 + 5) * 0.35;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export type ZoneLayout = {
  /** Tepe kareleri: indeks, sutun, satir ve blogun boyu (dunya birimi). */
  hills: { index: number; col: number; row: number; height: number }[];
  /** Cukur kare indeksleri. */
  pits: number[];
};

/** Lekeleri tepe ve cukur karelerine ayir; her tepe karesine kendi blok boyu. */
export function getZoneLayout(input: TerrainInput): ZoneLayout {
  const { cols, rows, cellSize } = input;
  const hills: ZoneLayout["hills"] = [];
  const pits: number[] = [];
  for (const relief of getBuildZoneReliefs({ cols, rows, cells: input.zoneCells })) {
    for (const index of relief.cells) {
      if (!relief.hill) {
        pits.push(index);
        continue;
      }
      const col = index % cols;
      const row = (index - col) / cols;
      const spread = terrainNoise(col * 1.7 + 0.31, row * 1.3 + 0.77);
      hills.push({ index, col, row, height: cellSize * (ZONE_BLOCK_CELLS.min + (ZONE_BLOCK_CELLS.max - ZONE_BLOCK_CELLS.min) * spread) });
    }
  }
  return { hills, pits };
}

/**
 * Bolgelerin yuruyus yuksekligi: (x, z) -> dunya birimi. Tepe karesinde blogun
 * ustu, hemen disinda kisa bir rampa; cukur ve diger her yer 0 (cukur artik duz).
 */
export function createZoneHeight(input: TerrainInput) {
  const { cols, rows, cellSize, originX, originY } = input;
  const top = new Float64Array(cols * rows);
  for (const hill of getZoneLayout(input).hills) top[hill.index] = hill.height;
  const ramp = ZONE_BLOCK_RAMP_CELLS * cellSize;
  return (x: number, z: number) => {
    const col = Math.floor((x - originX) / cellSize);
    const row = Math.floor((z - originY) / cellSize);
    let height = 0;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const size = top[r * cols + c];
        if (size === 0) continue;
        const left = originX + c * cellSize;
        const upper = originY + r * cellSize;
        const dx = Math.max(left - x, 0, x - (left + cellSize));
        const dz = Math.max(upper - z, 0, z - (upper + cellSize));
        height = Math.max(height, size * (1 - smoothstep(0, ramp, Math.hypot(dx, dz))));
      }
    }
    return height;
  };
}

/**
 * Isik golgesi: yuzey normali gunese bakan yamac aydinlik, arkasi karanlik;
 * duz zemin tam 1 (2D'deki renk). Cukurun dibi derinlikle karariyor.
 */
export function terrainShade(height: (x: number, z: number) => number, x: number, z: number, step: number, sun: { x: number; y: number; z: number }) {
  const dx = (height(x + step, z) - height(x - step, z)) / (2 * step);
  const dz = (height(x, z + step) - height(x, z - step)) / (2 * step);
  const length = Math.hypot(dx, 1, dz);
  const lit = (-dx * sun.x + sun.y - dz * sun.z) / length / sun.y;
  const h = height(x, z);
  const depth = h < 0 ? Math.max(0.55, 1 + h / (step * 9)) : 1;
  return Math.min(1.3, Math.max(0.4, lit)) * depth;
}
