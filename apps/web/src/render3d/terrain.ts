/**
 * Egik 3D gorunumun arazisi (yalnizca gorunus).
 *
 * - Kurulum yasak bolgeler (oyun kurali: kule kurulamiyor, dusman, isci ve
 *   mermi normal geciyor) lekeler halinde kayalik tepe ya da derin cukur.
 *   Leke sirasiyla donusumlu, haritadan haritaya degisiyor. Yukseklik yalnizca
 *   bolge karelerinin icinde; bolgenin kenarinda sifir, komsu kareler (kule
 *   kurulan yerler) dumduz kaliyor.
 * - Arenanin sag ve sol disinda kayalik yamaclar. Ust ve alt acik: dusmanlar
 *   ustten giriyor, nexus altta.
 *
 * Saf hesap: three.js yok, node testleri dogrudan okuyor.
 */

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

/** Tepenin yuksekligi ve cukurun derinligi (hucre); bolge kenarindan icerideki yumusama payi. */
export const ZONE_HILL_CELLS = 0.85;
export const ZONE_PIT_CELLS = 1.1;
export const ZONE_RAMP_CELLS = 0.9;
/** Kenar yamaci: egim (yukselis / uzaklik) ve en yuksek nokta (hucre). Egim 0,45 ~ 24 derece: 25 derecenin ustundeki kamera arenanin kenarini yamacin arkasinda kaybetmiyor. */
export const EDGE_SLOPE = 0.45;
export const EDGE_MAX_CELLS = 3.2;

/** Dik komsulukla bagli lekeler (sunucunun kurali lekeleri birbirine degdirmiyor). */
export function zoneBlobs(cols: number, rows: number, cells: readonly number[]) {
  const inZone = new Set(cells);
  const seen = new Set<number>();
  const blobs: number[][] = [];
  for (const start of [...cells].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    const blob: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const index = queue.pop()!;
      blob.push(index);
      const col = index % cols;
      const row = (index - col) / cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const next = nr * cols + nc;
        if (inZone.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    blobs.push(blob.sort((a, b) => a - b));
  }
  return blobs;
}

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

/**
 * Yasak bolgelerin yukseklik alani: (x, z) -> yukseklik (dunya birimi; tepe
 * arti, cukur eksi). Bolge disinda tam 0.
 */
export function createZoneHeight(input: TerrainInput) {
  const { cols, rows, cellSize, originX, originY } = input;
  // Kare -> lekenin isareti ve boyu (0: bolge degil).
  const amplitude = new Float32Array(cols * rows);
  zoneBlobs(cols, rows, input.zoneCells).forEach((blob, order) => {
    // Karisik: siradaki leke tepe, sonraki cukur; ilk lekenin turu karelerinden.
    const hill = (order + blob[0]) % 2 === 0;
    const size = hill ? ZONE_HILL_CELLS : -ZONE_PIT_CELLS;
    for (const index of blob) amplitude[index] = size * cellSize;
  });
  const ramp = ZONE_RAMP_CELLS * cellSize;
  const reach = Math.ceil(ZONE_RAMP_CELLS) + 1;
  const isZone = (col: number, row: number) => col >= 0 && row >= 0 && col < cols && row < rows && amplitude[row * cols + col] !== 0;

  return (x: number, z: number) => {
    const col = Math.floor((x - originX) / cellSize);
    const row = Math.floor((z - originY) / cellSize);
    if (!isZone(col, row)) return 0;
    // Bolge disindaki en yakin noktaya uzaklik (komsu kareler ve izgaranin disi).
    let distance = Infinity;
    for (let dr = -reach; dr <= reach; dr += 1) {
      for (let dc = -reach; dc <= reach; dc += 1) {
        const c = col + dc;
        const r = row + dr;
        if (isZone(c, r)) continue;
        const left = originX + c * cellSize;
        const top = originY + r * cellSize;
        const dx = Math.max(left - x, 0, x - (left + cellSize));
        const dz = Math.max(top - z, 0, z - (top + cellSize));
        distance = Math.min(distance, Math.hypot(dx, dz));
      }
    }
    const profile = smoothstep(0, ramp, distance);
    const size = amplitude[row * cols + col];
    // Kayalik yuzey: gurultu ici dolu bolgede; kenarda profil sifirliyor.
    const rough = 0.78 + 0.44 * terrainNoise(x / (cellSize * 0.55), z / (cellSize * 0.55));
    return size * profile * rough;
  };
}

/**
 * Arenanin sag ve sol disindaki yamac: kenarda 0, disariya dogru `EDGE_SLOPE`
 * egimle yukseliyor, `EDGE_MAX_CELLS`te tepeleniyor; ustu kayalik.
 */
export function edgeSlopeHeight(x: number, z: number, arena: { left: number; right: number }, cellSize: number) {
  const out = x < arena.left ? arena.left - x : x > arena.right ? x - arena.right : 0;
  if (out <= 0) return 0;
  const crest = EDGE_MAX_CELLS * cellSize;
  const rise = Math.min(crest, out * EDGE_SLOPE);
  const rough = terrainNoise(x / (cellSize * 0.8), z / (cellSize * 0.8));
  // Kayaliklar kenardan biraz uzakta basliyor: arenanin siniri temiz kalsin.
  return rise * (0.75 + 0.5 * rough) * smoothstep(0, cellSize * 0.6, out);
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
