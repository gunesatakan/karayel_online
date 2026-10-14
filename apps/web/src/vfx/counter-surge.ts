import type Phaser from "phaser";
import {
  COUNTER_SURGE_KIND_TABLE,
  decodeCounterSurgeKind,
  decodeCounterSurgeTravel,
  decodeSurgeCuts,
  getCounterSurgeGeometry,
  getSurgeFrontSegments,
  type CounterSurgeBlockMessage,
  type CounterSurgeKind,
  type CounterSurgeSnapshot,
  type CounterSurgeTravel
} from "@karayel/shared";

/**
 * Karsi atak seritlerinin cizimi: alti cesit, her biri kendi renginde ve
 * silueti ile, kendi yonunde (dikey, yatay, capraz).
 *
 * Ortak anatomi (hasarli cesitler): sert on kenar (genis sonuk omuz + ince
 * beyaz-sicak cekirdek), hemen arkasinda yogunlugu on kenara dogru artan
 * govde, arkada sonen iz, seritle ilerleyen yer tarama cizgileri, iz boyunca
 * duz ve on cizginin onunde kesik yan sinirlar (hangi hucrelerin tehlikede
 * oldugu okunuyor). Parcacik yok; yalnizca yol yonune hizali kisa sert cizgiler.
 * Parilti, yildiz, yaldiz yok; renkler yere indirilmis tonlar.
 *
 * Siper (\`aegis\`) yakmiyor: koyu, yari saydam, levhali bir sur ve soguk bir
 * kenar; durdurdugu atislar on cizgide kisa sert carpma isaretleri.
 *
 * Her sey seridin kendi ekseninde (\`a\` genislik, \`s\` yol) hesaplaniyor ve
 * dunyaya donusuyor; capraz seritte cokgenler ve cizgiler harita dikdortgenine
 * kirpiliyor. Karede nesne acilmiyor (kirpma tamponlari modulde sabit).
 * Cizim fonksiyonlari Graphics'i temizlemiyor: cagiran temizliyor.
 */

export type SurgeStyle = {
  /** Govde tonu. */
  body: number;
  /** Koyu vurgu: cizgiler, agir bar. */
  deep: number;
  /** On kenarin cekirdegi: beyaz-sicak (siperde soguk beyaz). */
  edge: number;
  /** Yan sinirlar ve ince ayrintilar. */
  rim: number;
  /** Izin boyu ve govdenin derinligi, hucre. */
  wakeCells: number;
  bodyCells: number;
  /** Tarama cizgileri arasi (hucre) ve geri kayma hizi (hucre/sn). */
  scanGapCells: number;
  scanCellsPerSecond: number;
  /** Yola hizali sert cizgi sayisi (dilim basina). */
  streaks: number;
};

/**
 * Cesit kimligi: band soguk camgobegi, lance kizil, wall menekse-civit,
 * sweep kehribar, slash beyaz-mavi, aegis koyu levha ve soguk kenar.
 */
export const COUNTER_SURGE_STYLES: Readonly<Record<CounterSurgeKind, Readonly<SurgeStyle>>> = {
  band: { body: 0x3aa3c2, deep: 0x1d5f73, edge: 0xe8f7fb, rim: 0x6fb9cc, wakeCells: 3.5, bodyCells: 1.6, scanGapCells: 0.34, scanCellsPerSecond: 0.5, streaks: 5 },
  lance: { body: 0xc23a4a, deep: 0x6e1a26, edge: 0xfff0ee, rim: 0xd0707a, wakeCells: 6.5, bodyCells: 0.5, scanGapCells: 0.5, scanCellsPerSecond: 2.4, streaks: 4 },
  wall: { body: 0x6a55c0, deep: 0x2e2466, edge: 0xefeaff, rim: 0x9a8ad6, wakeCells: 2, bodyCells: 3, scanGapCells: 0.6, scanCellsPerSecond: 0.15, streaks: 0 },
  sweep: { body: 0xc8973a, deep: 0x6b4d1e, edge: 0xfff4dc, rim: 0xd9b56c, wakeCells: 3.8, bodyCells: 0.45, scanGapCells: 0.45, scanCellsPerSecond: 0.7, streaks: 3 },
  slash: { body: 0x7fa8d0, deep: 0x34506e, edge: 0xf2f8ff, rim: 0xb4c6d8, wakeCells: 2.4, bodyCells: 1.5, scanGapCells: 0.4, scanCellsPerSecond: 0.9, streaks: 5 },
  aegis: { body: 0x1c2a3a, deep: 0x33485e, edge: 0xe9f3f8, rim: 0xa9bfcc, wakeCells: 1.2, bodyCells: 0.9, scanGapCells: 0, scanCellsPerSecond: 0, streaks: 0 }
};

/** Bugunku seridin (band) renkleri; eski cagiranlar ve yapi vurusunun varsayilani. */
export const SURGE_COLOR = COUNTER_SURGE_STYLES.band.body;
export const SURGE_EDGE_COLOR = COUNTER_SURGE_STYLES.band.edge;

/** Cesidin bildirim anahtari (TR/EN). */
export const COUNTER_SURGE_NOTICE_KEYS = {
  band: "scene.special.surge.band",
  lance: "scene.special.surge.lance",
  wall: "scene.special.surge.wall",
  sweep: "scene.special.surge.sweep",
  slash: "scene.special.surge.slash",
  aegis: "scene.special.surge.aegis"
} as const satisfies Record<CounterSurgeKind, string>;

/**
 * Cesidin sesi: kayitli CC0 orneklerden biri (yeni dosya yok), kendi perdesi
 * ve seviyesiyle. Mizrak tiz ve kisa, perde agir ve pes, siper metal levha.
 */
export const COUNTER_SURGE_SOUND_CUES: Readonly<Record<CounterSurgeKind, { family: "wave" | "dart" | "ball" | "ring" | "slash" | "heft"; rate: number; gain: number }>> = {
  band: { family: "wave", rate: 0.82, gain: 1 },
  lance: { family: "dart", rate: 1.28, gain: 1.15 },
  wall: { family: "heft", rate: 0.62, gain: 0.9 },
  sweep: { family: "ring", rate: 0.88, gain: 1.1 },
  slash: { family: "slash", rate: 0.86, gain: 1.25 },
  aegis: { family: "ball", rate: 0.74, gain: 0.95 }
};
/** Siperde duran atisin sesi: celik levhanin tiz, kisik vurusu. */
export const AEGIS_BLOCK_SOUND_CUE = { family: "ball" as const, rate: 1.35, gain: 0.45 };

export type CounterSurgeBandSegment = {
  /** Genislik ekseninde dusuk kenardan dunya birimi. */
  from: number;
  to: number;
  /** Dilimin on kenarinin yolu (dunya birimi). */
  front: number;
  cut: boolean;
};

/**
 * Seridin cizim cercevesi. Nokta (a, s): \`base + ax * a + dir * s\`;
 * \`a\` genislik ekseninde dusuk kenardan (0..width), \`s\` yol boyunca
 * kalkis kenarindan (0..length). Genislik ekseni paylasilan geometrinin
 * kesik ekseni (\`encodeSurgeCuts\`): ustten inen seritte soldan saga.
 */
export type CounterSurgeBand = {
  id: number;
  kind: CounterSurgeKind;
  travel: CounterSurgeTravel;
  baseX: number;
  baseY: number;
  dirX: number;
  dirY: number;
  axX: number;
  axY: number;
  length: number;
  width: number;
  /** Genislik, hucre (haritaya sigdirilmis). */
  cells: number;
  /** On kenarin yolu (dunya birimi); uyari evresinde 0. */
  front: number;
  progress: number;
  warn: boolean;
  /** Capraz serit: cizim harita dikdortgenine kirpiliyor. */
  diagonal: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Metal Kalkan seridi kestiyse genisligin dilimleri; yoksa \`undefined\`. */
  segments?: CounterSurgeBandSegment[];
};

export function createCounterSurgeBand(): CounterSurgeBand {
  return {
    id: 0, kind: "band", travel: "down", baseX: 0, baseY: 0, dirX: 0, dirY: 1, axX: 1, axY: 0,
    length: 0, width: 0, cells: 0, front: 0, progress: 0, warn: false, diagonal: false, minX: 0, minY: 0, maxX: 0, maxY: 0
  };
}

/** Cesidin yolu ile tel yonunun uyumu: bozuk ya da celisen yon cesidin varsayilanina doner. */
function resolveTravel(kind: CounterSurgeKind, travel: CounterSurgeTravel): CounterSurgeTravel {
  const route = COUNTER_SURGE_KIND_TABLE[kind].route;
  if (route === "side") return travel === "left" || travel === "right" ? travel : "right";
  if (route === "diagonal") return travel === "downRight" || travel === "downLeft" ? travel : "downRight";
  return "down";
}

/**
 * Snapshot kaydindan seridin cizim cercevesi (paylasilan geometriyle bire
 * bir). Serit haritaya sigdiriliyor; \`out\` verilirse ayni nesne doluyor.
 */
export function getCounterSurgeBand(
  surge: Pick<CounterSurgeSnapshot, "col" | "w" | "p" | "warn" | "cut" | "k" | "d"> & { id?: number },
  origin: { x: number; y: number },
  gridSize: number,
  cols: number,
  rows: number,
  out?: CounterSurgeBand
): CounterSurgeBand {
  const band = out ?? createCounterSurgeBand();
  const mapCols = Math.max(1, Math.floor(cols));
  const mapRows = Math.max(1, Math.floor(rows));
  const kind = decodeCounterSurgeKind(surge.k);
  const travel = resolveTravel(kind, decodeCounterSurgeTravel(surge.d));
  const route = COUNTER_SURGE_KIND_TABLE[kind].route;
  const limit = route === "side" ? mapRows : route === "diagonal" ? Math.min(mapCols, mapRows) : mapCols;
  const cells = Math.max(1, Math.min(limit, Math.floor(Number.isFinite(surge.w) ? surge.w : 1)));
  const geometry = getCounterSurgeGeometry(travel, Number.isFinite(surge.col) ? surge.col : 0, cells, origin, gridSize, mapCols, mapRows, GEOMETRY);
  const warn = surge.warn === true;
  const progress = warn ? 0 : Math.max(0, Math.min(1, Number.isFinite(surge.p) ? surge.p : 0));
  band.id = typeof surge.id === "number" ? surge.id : 0;
  band.kind = kind;
  band.travel = travel;
  band.dirX = geometry.dirX;
  band.dirY = geometry.dirY;
  band.axX = geometry.dirY;
  band.axY = -geometry.dirX;
  band.width = geometry.width;
  band.length = geometry.length;
  band.baseX = geometry.originX - band.axX * geometry.width / 2;
  band.baseY = geometry.originY - band.axY * geometry.width / 2;
  band.cells = cells;
  band.progress = progress;
  band.front = progress * geometry.length;
  band.warn = warn;
  band.diagonal = geometry.dirX !== 0 && geometry.dirY !== 0;
  band.minX = origin.x;
  band.minY = origin.y;
  band.maxX = origin.x + mapCols * gridSize;
  band.maxY = origin.y + mapRows * gridSize;
  // Kesik yalnizca kalkan seridi durdurduysa telde: yoksa dizi hic kurulmuyor.
  const cuts = warn || surge.cut === undefined ? undefined : decodeSurgeCuts(surge.cut, cells);
  band.segments = cuts && cuts.length > 0
    ? getSurgeFrontSegments(cells, progress, cuts).map((segment) => ({
        from: segment.from * gridSize,
        to: segment.to * gridSize,
        front: segment.p * geometry.length,
        cut: segment.cut
      }))
    : undefined;
  return band;
}

/** Geometrinin yeniden kullanilan tamponu (karede nesne acilmasin). */
const GEOMETRY = { originX: 0, originY: 0, dirX: 0, dirY: 1, length: 0, width: 0 };

/** Seridin (a, s) noktasinin dunya koordinati. */
export function getSurgeBandPoint(band: CounterSurgeBand, a: number, s: number) {
  return { x: band.baseX + band.axX * a + band.dirX * s, y: band.baseY + band.axY * a + band.dirY * s };
}

/** Uyarinin isaret noktasi: giris kenarinin ortasi, haritanin icinde. */
export function getCounterSurgeAlertPoint(band: CounterSurgeBand, gridSize: number) {
  const point = getSurgeBandPoint(band, band.width / 2, band.diagonal ? gridSize * 2 : gridSize * 0.5);
  return {
    x: Math.max(band.minX + gridSize * 0.5, Math.min(band.maxX - gridSize * 0.5, point.x)),
    y: Math.max(band.minY + gridSize * 0.5, Math.min(band.maxY - gridSize * 0.5, point.y))
  };
}

// --- Cizim ilkelleri (karede tahsis yok) --------------------------------------------

const CLIP_A = new Float64Array(32);
const CLIP_B = new Float64Array(32);
const POLY = new Float64Array(16);

function clipEdge(input: Float64Array, count: number, output: Float64Array, axis: 0 | 1, bound: number, keepGreater: boolean) {
  let written = 0;
  for (let index = 0; index < count; index += 1) {
    const ax = input[index * 2];
    const ay = input[index * 2 + 1];
    const next = (index + 1) % count;
    const bx = input[next * 2];
    const by = input[next * 2 + 1];
    const av = axis === 0 ? ax : ay;
    const bv = axis === 0 ? bx : by;
    const aIn = keepGreater ? av >= bound : av <= bound;
    const bIn = keepGreater ? bv >= bound : bv <= bound;
    if (aIn) {
      output[written * 2] = ax;
      output[written * 2 + 1] = ay;
      written += 1;
    }
    if (aIn !== bIn && written < 15) {
      const t = (bound - av) / (bv - av);
      output[written * 2] = ax + (bx - ax) * t;
      output[written * 2 + 1] = ay + (by - ay) * t;
      written += 1;
    }
  }
  return written;
}

/** Cokgen (seridin a,s ciftleri \`POLY\`da) dunyaya, kirpilip ucgen yelpazesiyle. */
function fillPolygon(graphics: Phaser.GameObjects.Graphics, band: CounterSurgeBand, count: number) {
  for (let index = 0; index < count; index += 1) {
    const a = POLY[index * 2];
    const s = POLY[index * 2 + 1];
    CLIP_A[index * 2] = band.baseX + band.axX * a + band.dirX * s;
    CLIP_A[index * 2 + 1] = band.baseY + band.axY * a + band.dirY * s;
  }
  let n = clipEdge(CLIP_A, count, CLIP_B, 0, band.minX, true);
  n = n >= 3 ? clipEdge(CLIP_B, n, CLIP_A, 0, band.maxX, false) : 0;
  n = n >= 3 ? clipEdge(CLIP_A, n, CLIP_B, 1, band.minY, true) : 0;
  n = n >= 3 ? clipEdge(CLIP_B, n, CLIP_A, 1, band.maxY, false) : 0;
  for (let index = 1; index + 1 < n; index += 1) {
    graphics.fillTriangle(CLIP_A[0], CLIP_A[1], CLIP_A[index * 2], CLIP_A[index * 2 + 1], CLIP_A[index * 2 + 2], CLIP_A[index * 2 + 3]);
  }
}

/** Seridin eksenine hizali dikdortgen: dikey ve yatay seritte tek \`fillRect\`. */
function fillBandRect(graphics: Phaser.GameObjects.Graphics, band: CounterSurgeBand, a0: number, a1: number, s0: number, s1: number) {
  if (!(a1 > a0) || !(s1 > s0)) return;
  if (!band.diagonal) {
    const x0 = band.baseX + band.axX * a0 + band.dirX * s0;
    const y0 = band.baseY + band.axY * a0 + band.dirY * s0;
    const x1 = band.baseX + band.axX * a1 + band.dirX * s1;
    const y1 = band.baseY + band.axY * a1 + band.dirY * s1;
    const left = Math.max(band.minX, Math.min(x0, x1));
    const right = Math.min(band.maxX, Math.max(x0, x1));
    const top = Math.max(band.minY, Math.min(y0, y1));
    const bottom = Math.min(band.maxY, Math.max(y0, y1));
    if (right > left && bottom > top) graphics.fillRect(left, top, right - left, bottom - top);
    return;
  }
  POLY[0] = a0; POLY[1] = s0;
  POLY[2] = a1; POLY[3] = s0;
  POLY[4] = a1; POLY[5] = s1;
  POLY[6] = a0; POLY[7] = s1;
  fillPolygon(graphics, band, 4);
}

/** Dort koseli serbest cokgen (yamuk, ucgen icin son kose tekrar). */
function fillBandQuad(
  graphics: Phaser.GameObjects.Graphics, band: CounterSurgeBand,
  a0: number, s0: number, a1: number, s1: number, a2: number, s2: number, a3: number, s3: number
) {
  POLY[0] = a0; POLY[1] = s0;
  POLY[2] = a1; POLY[3] = s1;
  POLY[4] = a2; POLY[5] = s2;
  POLY[6] = a3; POLY[7] = s3;
  fillPolygon(graphics, band, 4);
}

let clipT0 = 0;
let clipT1 = 1;

/** Liang-Barsky adimi: `false` donerse cizgi tamamen disarida. */
function clipStep(p: number, q: number) {
  if (p === 0) return q >= 0;
  const r = q / p;
  if (p < 0) clipT0 = Math.max(clipT0, r);
  else clipT1 = Math.min(clipT1, r);
  return clipT0 <= clipT1;
}

/** Seridin ekseninde cizgi; harita dikdortgenine kirpiliyor (Liang-Barsky). */
function bandLine(graphics: Phaser.GameObjects.Graphics, band: CounterSurgeBand, a0: number, s0: number, a1: number, s1: number) {
  const x0 = band.baseX + band.axX * a0 + band.dirX * s0;
  const y0 = band.baseY + band.axY * a0 + band.dirY * s0;
  const dx = band.baseX + band.axX * a1 + band.dirX * s1 - x0;
  const dy = band.baseY + band.axY * a1 + band.dirY * s1 - y0;
  clipT0 = 0;
  clipT1 = 1;
  if (!clipStep(-dx, x0 - band.minX) || !clipStep(dx, band.maxX - x0) || !clipStep(-dy, y0 - band.minY) || !clipStep(dy, band.maxY - y0)) return;
  graphics.lineBetween(x0 + dx * clipT0, y0 + dy * clipT0, x0 + dx * clipT1, y0 + dy * clipT1);
}

// --- Cizim ---------------------------------------------------------------------------

export type SurgeDrawOptions = {
  now: number;
  reducedMotion: boolean;
  /** \`VfxLod\` seviyesi: 1+ sert cizgiler, 2+ tarama cizgileri, 3+ kesik sinirlar sade. */
  lod?: number;
};

/**
 * Izin ve govdenin saydamligi. Koyu sahnede okunacak kadar yogun, yine de
 * tahta (hucre cizgileri, yapilar) govdenin altindan gorunuyor.
 */
const WAKE_ALPHAS = [0.2, 0.15, 0.1, 0.05];
const BODY_ALPHAS = [0.22, 0.3, 0.35];

/**
 * Seridi iki katmanda ciziyor: \`fill\` dusmanlarin altinda (yari saydam iz ve
 * govde, tahta okunur), \`edge\` kulelerin ustunde (sert kenarlar, siperin
 * levhalari). Uyari evresinde giris kenarinda kendi renginde isaret.
 */
export function drawCounterSurge(
  fill: Phaser.GameObjects.Graphics,
  edge: Phaser.GameObjects.Graphics,
  band: CounterSurgeBand,
  gridSize: number,
  options: SurgeDrawOptions
) {
  const style = COUNTER_SURGE_STYLES[band.kind];
  if (band.warn) {
    drawTelegraph(fill, edge, band, style, gridSize, options);
    return;
  }
  if (band.kind === "aegis") {
    drawAegis(fill, edge, band, style, gridSize, options);
    return;
  }
  const segments = band.segments;
  if (segments) {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment.cut) drawStoppedSlice(fill, edge, band, style, segment.from, segment.to, segment.front, gridSize);
      else drawLiveSlice(fill, edge, band, style, segment.from, segment.to, segment.front, gridSize, options, false);
      // Dilimler arasindaki basamak: yola paralel sert kenar.
      const previous = segments[index - 1];
      if (previous && previous.front !== segment.front) {
        edge.lineStyle(1.5, style.rim, 0.7);
        bandLine(edge, band, segment.from, Math.min(previous.front, segment.front), segment.from, Math.max(previous.front, segment.front));
      }
    }
    let tail = band.front;
    let head = 0;
    for (const segment of segments) {
      tail = Math.min(tail, segment.front);
      head = Math.max(head, segment.front);
    }
    drawRails(edge, band, style, tail, head, gridSize, options);
    return;
  }
  drawLiveSlice(fill, edge, band, style, 0, band.width, band.front, gridSize, options, true);
  drawRails(edge, band, style, band.front, band.front, gridSize, options);
}

/** Kesmenin egik bicagi: govdenin derinligi genislik boyunca 0,25'ten 1,5 hucreye. */
function slashDepth(band: CounterSurgeBand, a: number, gridSize: number) {
  return (0.25 + 1.25 * (a / Math.max(1, band.width))) * gridSize;
}

/** Izin ve govdenin basladigi en geri yol: capraz seritte kalkis kosesinin arkasi da haritada. */
function minAlong(band: CounterSurgeBand) {
  return band.diagonal ? -band.width / 2 : 0;
}

/** Ilerleyen dilim: iz, govde, cesidin imzasi, tarama, sert cizgiler, on kenar. */
function drawLiveSlice(
  fill: Phaser.GameObjects.Graphics,
  edge: Phaser.GameObjects.Graphics,
  band: CounterSurgeBand,
  style: SurgeStyle,
  a0: number,
  a1: number,
  front: number,
  gridSize: number,
  { now, reducedMotion, lod = 0 }: SurgeDrawOptions,
  whole: boolean
) {
  const sMin = minAlong(band);
  const body = style.bodyCells * gridSize;
  const wake = style.wakeCells * gridSize;
  const kind = band.kind;
  const width = a1 - a0;
  const t = now / 1000;

  // Iz: dort basamak, govdeden geriye sonuyor. Mizragin izi daraliyor (ince, uzun).
  for (let step = 0; step < WAKE_ALPHAS.length; step += 1) {
    const s1 = front - body - (wake * step) / WAKE_ALPHAS.length;
    const s0 = Math.max(sMin, front - body - (wake * (step + 1)) / WAKE_ALPHAS.length);
    if (!(s1 > s0)) break;
    fill.fillStyle(style.body, WAKE_ALPHAS[step]);
    if (kind === "lance" && whole) {
      const inset = width * 0.12 * (step + 1);
      fillBandRect(fill, band, a0 + inset, a1 - inset, s0, s1);
    } else {
      fillBandRect(fill, band, a0, a1, s0, s1);
    }
  }

  // Govde: on kenara dogru yogunlasan uc basamak. Kesmede egik bicak (yamuk).
  if (kind === "slash") {
    const d0 = slashDepth(band, a0, gridSize);
    const d1 = slashDepth(band, a1, gridSize);
    fill.fillStyle(style.body, 0.2);
    fillBandQuad(fill, band, a0, Math.max(sMin, front - d0), a1, Math.max(sMin, front - d1), a1, front, a0, front);
    fill.fillStyle(style.body, 0.3);
    fillBandQuad(fill, band, a0, Math.max(sMin, front - d0 * 0.45), a1, Math.max(sMin, front - d1 * 0.45), a1, front, a0, front);
    // Bicagin egik arka kenari: sert ve ince.
    edge.lineStyle(1.4, style.rim, 0.75);
    bandLine(edge, band, a0, Math.max(sMin, front - d0), a1, Math.max(sMin, front - d1));
    // Izde iki ince kesik hatti.
    edge.lineStyle(1, style.rim, 0.3);
    for (let cut = 0; cut < 2; cut += 1) {
      const a = band.width * (cut === 0 ? 0.22 : 0.78);
      if (a < a0 || a > a1) continue;
      bandLine(edge, band, a, Math.max(sMin, front - body - wake), a, front - slashDepth(band, a, gridSize));
    }
  } else {
    for (let step = 0; step < BODY_ALPHAS.length; step += 1) {
      const s0 = Math.max(sMin, front - (body * (BODY_ALPHAS.length - step)) / BODY_ALPHAS.length);
      const s1 = front - (body * (BODY_ALPHAS.length - step - 1)) / BODY_ALPHAS.length;
      fill.fillStyle(style.body, BODY_ALPHAS[step]);
      fillBandRect(fill, band, a0, a1, s0, s1);
    }
  }

  if (kind === "wall") {
    // Perde: agir, yavas dikey (yola paralel) cizgiler -- kalin govde tonunda,
    // ince olanlar kenar tonunda -- ve arka kenar.
    const spacing = gridSize * 0.5;
    const first = Math.ceil(a0 / spacing) * spacing;
    for (let a = first, index = Math.round(first / spacing); a <= a1 + 0.001; a += spacing, index += 1) {
      const sway = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.9 + index * 1.7);
      const reach = body * (0.55 + 0.45 * ((index * 7) % 5) / 4);
      const heavy = index % 2 === 0;
      edge.lineStyle(heavy ? 3 : 1.4, heavy ? style.body : style.rim, heavy ? 0.3 + 0.22 * sway : 0.22 + 0.14 * sway);
      bandLine(edge, band, a, Math.max(sMin, front - reach), a, front);
    }
    edge.lineStyle(1.5, style.rim, 0.38);
    bandLine(edge, band, a0, Math.max(sMin, front - body), a1, Math.max(sMin, front - body));
  }

  // Yer tarama cizgileri: seritle ilerliyor, govdenin icinde yavasca geri kayiyor.
  if (lod < 2 && style.scanGapCells > 0) {
    const gap = style.scanGapCells * gridSize;
    const phase = reducedMotion ? 0 : (t * style.scanCellsPerSecond * gridSize) % gap;
    const span = body + wake * 0.6;
    for (let k = 0; k < 8; k += 1) {
      const offset = gap * (k + 1) - phase;
      if (offset > span) break;
      const s = front - offset;
      if (s <= sMin) break;
      fill.lineStyle(1, style.rim, 0.34 * (1 - offset / span));
      bandLine(fill, band, a0, s, a1, s);
    }
  }

  // Yola hizali kisa sert cizgiler (kor degil, parilti degil): on kenardan geri akiyor.
  if (lod < 1 && !reducedMotion && style.streaks > 0 && width > gridSize * 0.2) {
    const span = body + wake * 0.5;
    for (let index = 0; index < style.streaks; index += 1) {
      const lane = a0 + width * ((index * 0.618 + 0.17) % 1);
      const speed = 0.6 + ((index * 37) % 10) / 10;
      const offset = ((t * speed * gridSize * 1.6 + index * span * 0.37) % span);
      const s1 = front - offset;
      const s0 = Math.max(sMin, s1 - gridSize * (kind === "lance" ? 0.7 : 0.35));
      if (!(s1 > s0)) continue;
      edge.lineStyle(1.2, style.edge, 0.55 * (1 - offset / span));
      bandLine(edge, band, lane, s0, lane, s1);
    }
  }

  if (kind === "sweep") {
    // Radar taramasi: on cizgi boyunca cetvel kertikleri ve geride kayan soluk bir hayalet cizgi.
    const tick = gridSize * 0.25;
    const firstTick = Math.ceil(a0 / tick);
    for (let index = firstTick; index * tick <= a1 + 0.001; index += 1) {
      const major = index % 4 === 0;
      edge.lineStyle(major ? 1.6 : 1, style.edge, major ? 0.9 : 0.6);
      bandLine(edge, band, index * tick, front - gridSize * (major ? 0.3 : 0.12), index * tick, front + gridSize * (major ? 0.16 : 0.08));
    }
    const ghost = front - gridSize * (0.9 + (reducedMotion ? 0.3 : 0.6 * ((t * 0.8) % 1)));
    if (ghost > sMin) {
      edge.lineStyle(1, style.rim, 0.32);
      bandLine(edge, band, a0, ghost, a1, ghost);
    }
  }

  // On kenar: genis sonuk omuz, dar ic omuz, ince beyaz-sicak cekirdek.
  const heavy = kind === "wall";
  edge.lineStyle(heavy ? 12 : kind === "lance" ? 7 : 12, heavy ? style.deep : style.body, heavy ? 0.65 : 0.45);
  bandLine(edge, band, a0, front, a1, front);
  edge.lineStyle(heavy ? 6 : 5, heavy ? style.body : style.rim, 0.65);
  bandLine(edge, band, a0, front, a1, front);
  edge.lineStyle(heavy ? 3 : kind === "sweep" ? 2 : 2.6, style.edge, 1);
  bandLine(edge, band, a0, front, a1, front);

  if (kind === "lance" && whole) {
    // Mizrak: parlak cekirdek hatti ve on kenarin onunde sivri uc.
    const mid = (a0 + a1) / 2;
    edge.lineStyle(4, style.body, 0.3);
    bandLine(edge, band, mid, Math.max(sMin, front - gridSize * 5.5), mid, front);
    edge.lineStyle(1.6, style.edge, 0.85);
    bandLine(edge, band, mid, Math.max(sMin, front - gridSize * 4), mid, front);
    const tip = front + gridSize * 0.6;
    edge.fillStyle(style.body, 0.55);
    fillBandQuad(edge, band, a0, front, mid, tip, mid, tip, a1, front);
    edge.lineStyle(1.6, style.edge, 0.9);
    bandLine(edge, band, a0, front, mid, tip);
    bandLine(edge, band, mid, tip, a1, front);
  } else if (whole && kind !== "slash") {
    // Uclarda ileri bakan kisa kertik: seridin siniri on kenarda da okunuyor.
    edge.lineStyle(2, style.edge, 0.8);
    bandLine(edge, band, a0, front, a0, front + gridSize * 0.25);
    bandLine(edge, band, a1, front, a1, front + gridSize * 0.25);
  }
}

/** Kalkanda durmus dilim: kisa soluk iz, sonuk ve kalin duz on cizgi; ileri bakan hicbir sey yok. */
function drawStoppedSlice(
  fill: Phaser.GameObjects.Graphics,
  edge: Phaser.GameObjects.Graphics,
  band: CounterSurgeBand,
  style: SurgeStyle,
  a0: number,
  a1: number,
  front: number,
  gridSize: number
) {
  const sMin = minAlong(band);
  fill.fillStyle(style.body, 0.06);
  fillBandRect(fill, band, a0, a1, Math.max(sMin, front - gridSize * 0.6), front);
  edge.lineStyle(3, style.deep, 0.75);
  bandLine(edge, band, a0, front, a1, front);
  edge.lineStyle(1, style.rim, 0.55);
  bandLine(edge, band, a0, front, a1, front);
}

/**
 * Yan sinirlar: iz boyunca duz, on cizginin onunde kesik (tehlike seridi
 * haritanin sonuna kadar okunuyor). Agir LOD'da onde tek soluk cizgi.
 */
function drawRails(
  edge: Phaser.GameObjects.Graphics,
  band: CounterSurgeBand,
  style: SurgeStyle,
  tail: number,
  head: number,
  gridSize: number,
  { lod = 0 }: SurgeDrawOptions
) {
  const sMin = minAlong(band);
  const back = Math.max(sMin, tail - (style.bodyCells + style.wakeCells) * gridSize);
  edge.lineStyle(1.2, style.rim, 0.55);
  // Siperin arkasinda iz yok: duz sinir yalnizca yakan seritlerde.
  if (tail > back && band.kind !== "aegis") {
    bandLine(edge, band, 0, back, 0, tail);
    bandLine(edge, band, band.width, back, band.width, tail);
  }
  const end = band.length + (band.diagonal ? band.width / 2 : 0);
  if (!(end > head)) return;
  if (lod >= 3) {
    edge.lineStyle(1, style.rim, 0.16);
    bandLine(edge, band, 0, head, 0, end);
    bandLine(edge, band, band.width, head, band.width, end);
    return;
  }
  const dash = gridSize * 0.3;
  edge.lineStyle(1, style.rim, 0.26);
  for (let s = head + dash * 0.5; s < end; s += dash * 2) {
    const s1 = Math.min(end, s + dash);
    bandLine(edge, band, 0, s, 0, s1);
    bandLine(edge, band, band.width, s, band.width, s1);
  }
}

/**
 * Uyari: tehlike seridi bastan sona soluk ve kesik sinirlarla, giris
 * kenarinda cesidin renginde agir bar ve yol yonune bakan, sirayla yanan
 * sivri oklar. Capraz seritte kalkis kosesinin iki kenarinda ayrac.
 */
function drawTelegraph(
  fill: Phaser.GameObjects.Graphics,
  edge: Phaser.GameObjects.Graphics,
  band: CounterSurgeBand,
  style: SurgeStyle,
  gridSize: number,
  { now, reducedMotion, lod = 0 }: SurgeDrawOptions
) {
  const pulse = reducedMotion ? 0.8 : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now / 130));
  const sMin = minAlong(band);
  const end = band.length + (band.diagonal ? band.width / 2 : 0);
  const aegis = band.kind === "aegis";
  const accent = aegis ? style.rim : style.body;
  // Seridin tamami: cok soluk dolgu (nereden gececegi).
  fill.fillStyle(accent, 0.025 + 0.03 * pulse);
  fillBandRect(fill, band, 0, band.width, sMin, end);
  // Kesik yan sinirlar bastan sona.
  drawRails(edge, band, style, sMin, sMin, gridSize, { now, reducedMotion, lod });
  const entry = band.diagonal ? gridSize * 1.6 : 0;
  // Giris kenari: yogun dolgu ve agir bar.
  fill.fillStyle(accent, 0.08 + 0.12 * pulse);
  fillBandRect(fill, band, 0, band.width, Math.max(sMin, entry - gridSize * 0.2), entry + gridSize * 1.2);
  edge.lineStyle(band.kind === "wall" ? 6 : 4.5, style.deep, 0.5 * pulse);
  bandLine(edge, band, 0, entry + 1, band.width, entry + 1);
  edge.lineStyle(2.5, style.edge, 0.9 * pulse);
  bandLine(edge, band, 0, entry + 1, band.width, entry + 1);
  if (band.kind === "wall" || aegis) {
    edge.lineStyle(1.5, style.rim, 0.7 * pulse);
    bandLine(edge, band, 0, entry + gridSize * 0.18, band.width, entry + gridSize * 0.18);
  }
  if (band.kind === "lance") {
    // Mizrak: seridin ortasinda bastan sona ince nisan hatti.
    edge.lineStyle(1, style.edge, 0.3 * pulse);
    bandLine(edge, band, band.width / 2, entry, band.width / 2, end);
  }
  if (band.diagonal) {
    // Kalkis kosesi: haritanin iki kenarinda koseli ayrac.
    const cornerX = band.travel === "downRight" ? band.minX : band.maxX;
    const sign = band.travel === "downRight" ? 1 : -1;
    const arm = gridSize * 2.2;
    edge.lineStyle(3, style.edge, 0.85 * pulse);
    edge.lineBetween(cornerX, band.minY + 1.5, cornerX + sign * arm, band.minY + 1.5);
    edge.lineBetween(cornerX + sign * 1.5, band.minY, cornerX + sign * 1.5, band.minY + arm);
  }
  // Sivri oklar: iki sira, yol yonune bakiyor; sirayla yaniyor (yuruyen ok).
  const arm = gridSize * 0.28;
  const step = band.cells > 4 ? 2 : 1;
  const active = reducedMotion ? -1 : Math.floor(now / 260) % 2;
  for (let row = 0; row < 2; row += 1) {
    const s = entry + gridSize * (0.5 + row * 0.55);
    const lit = active < 0 || active === row;
    edge.lineStyle(band.kind === "wall" ? 2.6 : 2, lit ? accent : style.rim, (lit ? 0.95 : 0.35) * pulse);
    for (let cell = 0; cell < band.cells; cell += step) {
      const a = (cell + 0.5 * step) * gridSize;
      if (a > band.width) break;
      bandLine(edge, band, a - arm, s - arm * 0.6, a, s + arm * 0.45);
      bandLine(edge, band, a, s + arm * 0.45, a + arm, s - arm * 0.6);
    }
  }
}

/**
 * Siper: on cizgide koyu, yari saydam, iki sira kaydirmali levhadan bir sur;
 * onunde soguk ince kenar, arkasinda kisa bir golge (dusmanlar onun
 * ardinda). Yakmadigi icin iz, tarama ve sert cizgi yok.
 */
function drawAegis(
  fill: Phaser.GameObjects.Graphics,
  edge: Phaser.GameObjects.Graphics,
  band: CounterSurgeBand,
  style: SurgeStyle,
  gridSize: number,
  { now, reducedMotion, lod = 0 }: SurgeDrawOptions
) {
  const sMin = minAlong(band);
  const depth = style.bodyCells * gridSize;
  const front = band.front;
  const back = front - depth;
  // Golge: surun ardinda koyu, kisa ve sonen.
  const shadow = style.wakeCells * gridSize;
  for (let step = 0; step < 3; step += 1) {
    const s1 = back - (shadow * step) / 3;
    const s0 = Math.max(sMin, back - (shadow * (step + 1)) / 3);
    if (!(s1 > s0)) break;
    fill.fillStyle(style.body, 0.16 - step * 0.05);
    fillBandRect(fill, band, 0, band.width, s0, s1);
  }
  // Sur govdesi: kulelerin ustunde, yari saydam koyu levha; on sira daha acik (arduvaz).
  edge.fillStyle(style.body, 0.5);
  fillBandRect(edge, band, 0, band.width, Math.max(sMin, back), front);
  edge.fillStyle(style.deep, 0.55);
  fillBandRect(edge, band, 0, band.width, Math.max(sMin, back + depth * 0.5), front);
  // Levhalar: iki sira, yarim levha kaydirmali; ayrac cizgileri soguk.
  const plate = gridSize * 0.75;
  edge.lineStyle(1, style.rim, lod >= 3 ? 0.3 : 0.5);
  bandLine(edge, band, 0, back + depth * 0.5, band.width, back + depth * 0.5);
  for (let row = 0; row < 2; row += 1) {
    const s0 = back + (depth * row) / 2;
    const s1 = s0 + depth / 2;
    for (let a = row === 0 ? plate : plate * 0.5; a < band.width - 1; a += plate) {
      bandLine(edge, band, a, Math.max(sMin, s0 + 1), a, s1 - 1);
    }
  }
  // Yavas kayan soguk bir isik levhasi (hareket azaltmada yok).
  if (!reducedMotion && lod < 2) {
    const period = 4200;
    const share = (now % period) / period;
    const a = share * (band.width + plate) - plate;
    edge.fillStyle(style.rim, 0.1);
    fillBandRect(edge, band, Math.max(0, a), Math.min(band.width, a + plate), Math.max(sMin, back + depth * 0.5), front);
  }
  // Arka kenar koyu, on kenar soguk ve sert: yakan bir serit degil, duran bir duvar.
  edge.lineStyle(2, style.deep, 0.9);
  bandLine(edge, band, 0, Math.max(sMin, back), band.width, Math.max(sMin, back));
  edge.lineStyle(2.4, style.rim, 0.95);
  bandLine(edge, band, 0, front, band.width, front);
  edge.lineStyle(1, style.edge, 0.55);
  bandLine(edge, band, 0, front + 1.5, band.width, front + 1.5);
  // Uclarda iki direk.
  const post = gridSize * 0.28;
  for (let end = 0; end < 2; end += 1) {
    const a = end === 0 ? 0 : band.width;
    edge.fillStyle(style.deep, 0.92);
    fillBandRect(edge, band, a - post / 2, a + post / 2, Math.max(sMin, back - post * 0.3), front + post * 0.3);
    edge.lineStyle(1.2, style.rim, 0.9);
    bandLine(edge, band, a - post / 2, front + post * 0.3, a + post / 2, front + post * 0.3);
    bandLine(edge, band, a - post / 2, Math.max(sMin, back - post * 0.3), a - post / 2, front + post * 0.3);
    bandLine(edge, band, a + post / 2, Math.max(sMin, back - post * 0.3), a + post / 2, front + post * 0.3);
  }
  // Kesik yan sinirlar: siperin genisligi haritanin sonuna kadar okunuyor.
  drawRails(edge, band, style, front, front, gridSize, { now, reducedMotion, lod });
}

// --- Siperde duran atislar --------------------------------------------------------

/** Ayni anda en fazla bu kadar carpma isareti (eski olan yerini veriyor). */
export const AEGIS_IMPACT_SLOTS = 10;
/** Carpma isaretinin omru (ms). */
export const AEGIS_IMPACT_MS = 300;

/**
 * Siperde durdurulan atislarin isaretleri: sabit boyutlu halka tampon (karede
 * tahsis yok). Nokta seridin genisliginde (hucre); yol, cizim anindaki on cizgi.
 */
export class AegisImpacts {
  private readonly ids = new Float64Array(AEGIS_IMPACT_SLOTS);
  private readonly across = new Float64Array(AEGIS_IMPACT_SLOTS);
  private readonly at = new Float64Array(AEGIS_IMPACT_SLOTS).fill(Number.NEGATIVE_INFINITY);
  private next = 0;

  add(id: number, acrossCells: number, now: number) {
    if (!Number.isFinite(acrossCells)) return;
    this.ids[this.next] = id;
    this.across[this.next] = acrossCells;
    this.at[this.next] = now;
    this.next = (this.next + 1) % AEGIS_IMPACT_SLOTS;
  }

  /** Bu siperin canli isaretleri var mi (cizim karari icin). */
  has(id: number, now: number) {
    for (let index = 0; index < AEGIS_IMPACT_SLOTS; index += 1) {
      if (this.ids[index] === id && now - this.at[index] < AEGIS_IMPACT_MS) return true;
    }
    return false;
  }

  /**
   * On cizgide kisa sert parlama: on cizgi boyunca beyaz-soguk cizgi, kucuk
   * bir eskenar dortgen ve atisin geldigi yone sekme cizgileri. Hareket
   * azaltmada buyumuyor.
   */
  draw(edge: Phaser.GameObjects.Graphics, band: CounterSurgeBand, gridSize: number, now: number, reducedMotion: boolean) {
    if (band.kind !== "aegis" || band.warn) return;
    const style = COUNTER_SURGE_STYLES.aegis;
    for (let index = 0; index < AEGIS_IMPACT_SLOTS; index += 1) {
      if (this.ids[index] !== band.id) continue;
      const age = now - this.at[index];
      if (!(age >= 0 && age < AEGIS_IMPACT_MS)) continue;
      const life = 1 - age / AEGIS_IMPACT_MS;
      const a = Math.max(0, Math.min(band.width, this.across[index] * gridSize));
      const s = band.front;
      const half = gridSize * 0.3;
      edge.lineStyle(2.5, style.edge, life);
      bandLine(edge, band, a - half, s, a + half, s);
      const r = gridSize * 0.16 * (reducedMotion ? 1 : 1 + (1 - life) * 0.7);
      edge.lineStyle(1.4, style.rim, 0.9 * life);
      bandLine(edge, band, a, s - r, a + r, s);
      bandLine(edge, band, a + r, s, a, s + r);
      bandLine(edge, band, a, s + r, a - r, s);
      bandLine(edge, band, a - r, s, a, s - r);
      const kick = gridSize * 0.32 * (reducedMotion ? 1 : 0.6 + 0.4 * (1 - life));
      edge.lineStyle(1.2, style.edge, 0.7 * life);
      bandLine(edge, band, a, s + 2, a - kick * 0.55, s + kick);
      bandLine(edge, band, a, s + 2, a + kick * 0.55, s + kick);
    }
  }
}

/** Bir \`surge:block\` mesajinda okunan en fazla nokta. */
export const SURGE_BLOCK_READ_MAX = 8;

/** \`surge:block\` mesajini temizler; gecerli nokta yoksa \`undefined\`. */
export function sanitizeSurgeBlockMessage(raw: unknown): CounterSurgeBlockMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { id, a } = raw as { id?: unknown; a?: unknown };
  if (typeof id !== "number" || !Number.isFinite(id) || !Array.isArray(a)) return undefined;
  const points: number[] = [];
  for (const value of a) {
    if (points.length >= SURGE_BLOCK_READ_MAX) break;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 64) points.push(value);
  }
  return points.length > 0 ? { id, a: points } : undefined;
}

/** Snapshot'taki gecerli seritler (en fazla iki), \`out\` dizisine; kayitlar kopyalanmiyor. */
export const COUNTER_SURGE_READ_MAX = 2;

export function readCounterSurges(surges: unknown, out: CounterSurgeSnapshot[]): CounterSurgeSnapshot[] {
  out.length = 0;
  if (!Array.isArray(surges)) return out;
  for (const surge of surges) {
    if (out.length >= COUNTER_SURGE_READ_MAX) break;
    if (!surge || typeof surge !== "object") continue;
    const { id, col, w, p } = surge as Partial<CounterSurgeSnapshot>;
    if (typeof id !== "number" || !Number.isFinite(id)) continue;
    if (typeof col !== "number" || !Number.isFinite(col)) continue;
    if (typeof w !== "number" || !Number.isFinite(w) || w < 1) continue;
    if (typeof p !== "number" || !Number.isFinite(p)) continue;
    out.push(surge as CounterSurgeSnapshot);
  }
  return out;
}
