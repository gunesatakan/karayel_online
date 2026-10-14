/**
 * Duvar cizgisi: bir duvari surukleyip sabitleyerek ya da uzatma tutamaciyla
 * ardisik duvar dizmek.
 *
 * Bu dosya saf: ne Phaser ne Colyseus biliyor. Istemci onizlemeyi, sunucu
 * `wall:line` mesajini ayni fonksiyonla cozuyor; boylece iki taraf cizginin
 * hangi kenarlardan olustugu konusunda ayrisamiyor. Kural (bolge, dolu kenar,
 * altin) burada yok -- her parca icin tekli yerlestirmenin kendi kurali soruluyor.
 *
 * Jestin iki yolu var:
 *   1. Durakla ve sabitle: surukleme sirasinda parmak `WALL_LINE_DWELL_MS`
 *      boyunca `WALL_LINE_DWELL_TOLERANCE_PX` icinde kalirsa hayaletin kenari
 *      cizginin basi (capa) olur.
 *   2. Uzatma tutamaci: yerlesmis duvarin ucundan baslar, beklemek gerekmez.
 */
import type { EdgeOrientation, EdgeSegment, PlacementBoard } from "./index.js";

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Parmak bu kadar sure (ms) neredeyse sabit kalirsa capa atiliyor. */
export const WALL_LINE_DWELL_MS = 450;
/** "Neredeyse sabit": baslangic noktasindan en fazla bu kadar piksel (ekran pikseli). */
export const WALL_LINE_DWELL_TOLERANCE_PX = 8;
/** Tek duvar kurulunca uzatma tutamaclarinin gorunur kaldigi sure (ms). */
export const WALL_LINE_HANDLE_VISIBLE_MS = 4000;
/** Tutamacin dokunma hedefi (px); gorunen daire daha kucuk. */
export const WALL_LINE_HANDLE_TOUCH_PX = 44;
/** Tutamaca basan parmak bu kadar (px) kayarsa surukleme sayilir; altinda dokunustur. */
export const WALL_LINE_HANDLE_DRAG_PX = 6;
/**
 * Bir `wall:line` mesajinin en fazla parcasi. En buyuk arenanin kenari
 * (4x: 24x36) 36 kenar; sinir ondan kucuk olsaydi uzun bir cizgi kesilirdi.
 */
export const WALL_LINE_SERVER_MAX_PIECES = 36;

export type WallLineAxis = EdgeOrientation;

export type WallDwellState = {
  /** Sabit sayilan ilk nokta (ekran pikseli); parmak toleransi asinca yenilenir. */
  originX: number;
  originY: number;
  /** Bu noktada beklemenin basladigi an (ms). */
  startedAt: number;
  /** Capa atildi mi; atildiktan sonra durum degismiyor. */
  locked: boolean;
};

export function startWallDwell(x: number, y: number, now: number): WallDwellState {
  return { originX: x, originY: y, startedAt: now, locked: false };
}

/**
 * Parmagin yeni konumuyla bekleme durumunu ilerletir.
 *
 * Tolerans baslangic noktasindan olculuyor, bir onceki konumdan degil: parmak
 * her karede 1 px kayarak yavasca gidiyorsa bekleme sayilmamali. Toleransi
 * asan hareket beklemeyi bastan baslatir (yeni nokta kaynak olur). Kilitlenen
 * durum donmus kalir; capadan sonra parmak serbestce hareket eder.
 */
export function advanceWallDwell(state: WallDwellState, x: number, y: number, now: number): WallDwellState {
  if (state.locked) return state;
  if (Math.hypot(x - state.originX, y - state.originY) > WALL_LINE_DWELL_TOLERANCE_PX) {
    return { originX: x, originY: y, startedAt: now, locked: false };
  }
  return now - state.startedAt >= WALL_LINE_DWELL_MS ? { ...state, locked: true } : state;
}

/** Halka dolulugu, 0..1. Kilitliyse 1. */
export function getWallDwellProgress(state: WallDwellState, now: number) {
  if (state.locked) return 1;
  return clampNumber((now - state.startedAt) / WALL_LINE_DWELL_MS, 0, 1);
}

/**
 * Cizginin ekseni: parmak capadan yatayda mi dikeyde mi daha uzaga gitti.
 * Esitlikte yatay.
 */
export function pickWallLineAxis(anchor: { x: number; y: number }, finger: { x: number; y: number }): WallLineAxis {
  return Math.abs(finger.y - anchor.y) > Math.abs(finger.x - anchor.x) ? "vertical" : "horizontal";
}

export type WallLineGeometry = {
  gridSize: number;
  origin: { x: number; y: number };
  board: PlacementBoard;
};

export type WallLine = {
  axis: WallLineAxis;
  /** Capadan disari yon: +1 artan, -1 azalan sira/sutun. */
  direction: 1 | -1;
  /** Capa parcasindan baslayip disari dogru, tahtaya sigan ve sinira kirpilmis parcalar. */
  segments: EdgeSegment[];
};

/** Eksen boyunca en fazla duvar sayisi: arenanin o yondeki kenar uzunlugu. */
export function getWallLineMaxLength(axis: WallLineAxis, board: PlacementBoard) {
  return axis === "horizontal" ? board.cols : board.rows;
}

/**
 * Capadan parmaga uzanan duvar cizgisi.
 *
 * `anchor` capa kenarinin dunya merkezi, `finger` parmagin onizleme noktasi.
 * Cizgi kenarlari eksenle ayni yonde: yatay eksen = bir satir cizgisi uzerinde
 * yatay kenarlar. Capanin yonu eksenle uyusmuyorsa (hayalet yakin cizgiye
 * oturur, ama oyuncu baska yone surukluyor) cizgi capanin merkezinden gecen
 * cizgiye oturur; ikisinin arasinda kalan yarim satirda yuvarlama asagi/saga
 * dogru.
 *
 * Parmak capa parcasinin yarim karesinden daha az uzaksa (capaya dondu) tek
 * parca kalir. Parca sayisi parmagin kat ettigi tam kare sayisi + 1; tahtanin
 * disina ve `maxPieces`e kirpilir.
 */
export function getWallLine(options: WallLineGeometry & {
  anchor: { x: number; y: number };
  finger: { x: number; y: number };
  maxPieces?: number;
  /**
   * Zorunlu eksen. Tutamacla baslayan cizgide eksen tutamacin baktigi yon;
   * parmagin hangi eksende daha uzaga gittigine bakilmiyor.
   */
  axis?: WallLineAxis;
}): WallLine {
  const { gridSize, origin, board } = options;
  const axis = options.axis ?? pickWallLineAxis(options.anchor, options.finger);
  const ax = (options.anchor.x - origin.x) / gridSize;
  const ay = (options.anchor.y - origin.y) / gridSize;
  const fx = (options.finger.x - origin.x) / gridSize;
  const fy = (options.finger.y - origin.y) / gridSize;

  // Cizgi ekseni boyunca (along) ve ona dik (across) koordinatlar, kare biriminde.
  const anchorAlong = axis === "horizontal" ? ax : ay;
  const fingerAlong = axis === "horizontal" ? fx : fy;
  const across = axis === "horizontal" ? ay : ax;
  const alongMax = axis === "horizontal" ? board.cols : board.rows;
  const acrossMax = axis === "horizontal" ? board.rows : board.cols;

  const line = clampNumber(Math.round(across), 0, acrossMax);
  // Capa parcasinin sirasi: merkezi anchorAlong, yani [floor, floor+1) araligi.
  const anchorIndex = clampNumber(Math.floor(anchorAlong), 0, alongMax - 1);
  const delta = fingerAlong - (anchorIndex + 0.5);
  const direction: 1 | -1 = delta < 0 ? -1 : 1;
  const extra = Math.floor(Math.abs(delta) + 0.5);
  const cap = Math.max(1, Math.min(
    options.maxPieces ?? getWallLineMaxLength(axis, board),
    getWallLineMaxLength(axis, board),
    WALL_LINE_SERVER_MAX_PIECES
  ));
  const room = direction === 1 ? alongMax - 1 - anchorIndex : anchorIndex;
  const count = Math.min(1 + extra, cap, 1 + room);

  const segments: EdgeSegment[] = [];
  for (let step = 0; step < count; step += 1) {
    const index = anchorIndex + step * direction;
    segments.push(axis === "horizontal"
      ? { orientation: "horizontal", col: index, row: line }
      : { orientation: "vertical", col: line, row: index });
  }
  return { axis, direction, segments };
}

/** Tek parcanin dunya merkezi (duvar `placeTower` konumuyla ayni). */
export function getWallSegmentCenter(segment: EdgeSegment, geometry: Pick<WallLineGeometry, "gridSize" | "origin">) {
  const { gridSize, origin } = geometry;
  return segment.orientation === "vertical"
    ? { x: origin.x + segment.col * gridSize, y: origin.y + (segment.row + 0.5) * gridSize }
    : { x: origin.x + (segment.col + 0.5) * gridSize, y: origin.y + segment.row * gridSize };
}

/** Gecerli parcalarin toplam bedeli. */
export function getWallLineCost(validPieces: number, unitCost: number) {
  return Math.max(0, Math.floor(validPieces)) * Math.max(0, unitCost);
}

/** Bu altinla kac parca alinabilir. */
export function getAffordableWallPieces(gold: number, unitCost: number) {
  if (unitCost <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(gold / unitCost));
}

/**
 * Parcalar sirayla (capadan disari) gecerlilik bayragiyla verilir; ilk
 * `affordable` gecerli parca secilir, gerisi `skippedForGold` olur.
 */
export function pickAffordableWallPieces<T extends { valid: boolean }>(pieces: T[], affordable: number) {
  const placed: T[] = [];
  let skippedForGold = 0;
  for (const piece of pieces) {
    if (!piece.valid) continue;
    if (placed.length < affordable) placed.push(piece);
    else skippedForGold += 1;
  }
  return { placed, skippedForGold };
}

/**
 * Bir duvar dizisinin (ayni cizgide ardisik kenarlar) serbest uclari.
 * `occupied` sahip olunan duvarlarin kenar anahtarlari (`orientation:col:row`).
 * Dizinin iki ucundaki bir sonraki kenar; tahtanin disina cikiyorsa uc yok.
 */
export function getWallRunEnds(segment: EdgeSegment, occupied: ReadonlySet<string>, board: PlacementBoard) {
  const key = (s: EdgeSegment) => `${s.orientation}:${s.col}:${s.row}`;
  const step = (s: EdgeSegment, d: 1 | -1): EdgeSegment => s.orientation === "horizontal"
    ? { ...s, col: s.col + d }
    : { ...s, row: s.row + d };
  const inside = (s: EdgeSegment) => s.orientation === "horizontal"
    ? s.col >= 0 && s.col < board.cols
    : s.row >= 0 && s.row < board.rows;
  const ends: { segment: EdgeSegment; direction: 1 | -1; next: EdgeSegment }[] = [];
  for (const direction of [-1, 1] as const) {
    let last = segment;
    let guard = 0;
    while (occupied.has(key(step(last, direction))) && guard < 200) {
      last = step(last, direction);
      guard += 1;
    }
    const next = step(last, direction);
    if (inside(next)) ends.push({ segment: last, direction, next });
  }
  return ends;
}

/**
 * Tutamac surukleme noktasini cizgi eksenine indirir.
 *
 * Tutamacin cizgisi `next` kenarindan (kurulu duvarin ardindaki ilk bos kenar)
 * baslar ve yalnizca `direction` yonunde uzar. Parmak yana kayinca ya da geriye
 * (duvarin icine) donunce istemci ile sunucu ayni cizgiyi cozsun diye nokta
 * eksene yansitiliyor ve geri giden kisim capaya sabitleniyor: capanin kendisi
 * her zaman tek parca.
 */
export function constrainWallHandleFinger(
  anchor: { x: number; y: number },
  finger: { x: number; y: number },
  axis: WallLineAxis,
  direction: 1 | -1
) {
  if (axis === "horizontal") {
    const dx = (finger.x - anchor.x) * direction;
    return { x: dx < 0 ? anchor.x : finger.x, y: anchor.y };
  }
  const dy = (finger.y - anchor.y) * direction;
  return { x: anchor.x, y: dy < 0 ? anchor.y : finger.y };
}
