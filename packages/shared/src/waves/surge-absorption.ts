/**
 * Karsi atak seridinin yone bagimsiz geometrisi ve bir engelle (Metal Kalkan)
 * kismen yutulmasi.
 *
 * Serit: bir yol yonu (birim vektor), ona dik bir on cizgi, bir orta hat ve
 * bir genislik. "Genislik ekseni" on cizginin yonu. Bugunku serit yukaridan
 * asagi iniyor: yon (0, 1), genislik ekseni (1, 0), yani genislik ekseni
 * koordinati dogrudan x. Ileride yandan ya da caprazdan gelen seritler ayni
 * fonksiyonlari kendi yonleriyle kullanir; burada yone ozel hicbir sey yok.
 *
 * Yutulma: seridin on cizgisi engele ulastigi an, engelin genislik eksenine
 * izdusumu (seride kirpilmis) o serit icin kalici olarak durur; genisligin
 * geri kalani ilerlemeye devam eder. Her yutulan parca genislik ekseninde bir
 * `[from, to]` araligi ve on cizginin kesildigi ilerleme (`progress`) olarak
 * saklanir. Bir yapi, izdusumu yutulan bir araligin icindeyse VE kesilme
 * noktasinin otesindeyse o seritten korunur.
 */
export type SurgeBandGeometry = {
  /** Kalkis kenarinin orta noktasi: ilerleme 0'da on cizginin ortasi. */
  originX: number;
  originY: number;
  /** Yol yonu, birim vektor. */
  dirX: number;
  dirY: number;
  /** Ilerleme 1'de on cizginin kat ettigi yol (dunya birimi). */
  length: number;
  /** Seridin genisligi (dunya birimi), on cizgi boyunca. */
  width: number;
};

/** Yutulan parca: genislik ekseni koordinatinda aralik ve kesildigi ilerleme (0..1). */
export type SurgeAbsorbedInterval = { from: number; to: number; progress: number };

/** Bundan dar parca yutulmus sayilmaz (yola paralel duran engel hicbir seyi kesmez). */
export const SURGE_ABSORB_MIN_WIDTH = 0.5;

/** Yukaridan asagi inen serit: sol sutun ve sutun genisliginden geometri. */
export function getVerticalSurgeBand(origin: { x: number; y: number }, gridSize: number, col: number, widthColumns: number, rows: number): SurgeBandGeometry {
  const width = widthColumns * gridSize;
  return {
    originX: origin.x + col * gridSize + width / 2,
    originY: origin.y,
    dirX: 0,
    dirY: 1,
    length: rows * gridSize,
    width
  };
}

/**
 * Noktanin serit eksenlerindeki izdusumu. `along`: yol yonunde kalkis
 * kenarindan uzaklik (on cizgi `progress * length`te). `across`: genislik
 * eksenindeki koordinat (dunya orijinine gore; asagi inen seritte x).
 */
export function projectOntoSurgeBand(band: SurgeBandGeometry, x: number, y: number) {
  return {
    along: (x - band.originX) * band.dirX + (y - band.originY) * band.dirY,
    across: x * band.dirY - y * band.dirX
  };
}

/** Seridin genislik eksenindeki araligi. */
export function getSurgeBandSpan(band: SurgeBandGeometry) {
  const centre = band.originX * band.dirY - band.originY * band.dirX;
  return { from: centre - band.width / 2, to: centre + band.width / 2 };
}

/**
 * Engel parcasinin seride degdigi genislik araligi; degmiyorsa `undefined`.
 *
 * Parcanin on cizginin henuz gecmedigi kismi (`along >= previousAlong`) seride
 * kirpiliyor; on cizgi (`frontAlong`) bu kisma ulastiysa kismin genislik
 * eksenindeki tum izdusumu yutuluyor. Coktan gecilmis kisim (seridin arkasi)
 * hicbir seyi durdurmaz. Egik engelde kesilme, on cizginin engele ilk degdigi
 * noktada (`along`) ve engelin tum izdusumu boyunca: aralik basina tek kesik.
 */
export function getSurgeObstacleContact(
  band: SurgeBandGeometry,
  x1: number, y1: number, x2: number, y2: number,
  previousAlong: number,
  frontAlong: number
): { from: number; to: number; along: number } | undefined {
  const a = projectOntoSurgeBand(band, x1, y1);
  const b = projectOntoSurgeBand(band, x2, y2);
  const span = getSurgeBandSpan(band);
  // Parametre araligi [t0, t1]: once on cizginin gecmedigi yari duzlem, sonra seridin iki kenari.
  let t0 = 0;
  let t1 = 1;
  const clip = (start: number, delta: number, min: number, max: number) => {
    if (delta === 0) return start >= min && start <= max;
    const ta = (min - start) / delta;
    const tb = (max - start) / delta;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    return t0 <= t1;
  };
  if (!clip(a.along, b.along - a.along, previousAlong, Number.POSITIVE_INFINITY)) return undefined;
  if (!clip(a.across, b.across - a.across, span.from, span.to)) return undefined;
  const along0 = a.along + (b.along - a.along) * t0;
  const along1 = a.along + (b.along - a.along) * t1;
  const along = Math.min(along0, along1);
  if (along > frontAlong) return undefined;
  const across0 = a.across + (b.across - a.across) * t0;
  const across1 = a.across + (b.across - a.across) * t1;
  const from = Math.max(span.from, Math.min(across0, across1));
  const to = Math.min(span.to, Math.max(across0, across1));
  // `along`: on cizginin engele ilk degdigi yol (kesilme noktasi).
  return to - from >= SURGE_ABSORB_MIN_WIDTH ? { from, to, along: Math.max(previousAlong, along) } : undefined;
}

/**
 * Yeni yutulan araligi listeye ekler. Var olan araliklarla cakisan kisim
 * atilir (once kesilen gecerli: o parca zaten durmustu). Liste `from`a gore
 * sirali kalir. En az bir parca eklendiyse `true`.
 */
export function addSurgeAbsorbedInterval(list: SurgeAbsorbedInterval[], from: number, to: number, progress: number) {
  let pieces: Array<[number, number]> = [[from, to]];
  for (const existing of list) {
    const next: Array<[number, number]> = [];
    for (const [start, end] of pieces) {
      if (existing.to <= start || existing.from >= end) {
        next.push([start, end]);
        continue;
      }
      if (existing.from > start) next.push([start, existing.from]);
      if (existing.to < end) next.push([existing.to, end]);
    }
    pieces = next;
  }
  let added = false;
  for (const [start, end] of pieces) {
    if (end - start < SURGE_ABSORB_MIN_WIDTH) continue;
    list.push({ from: start, to: end, progress });
    added = true;
  }
  if (added) list.sort((left, right) => left.from - right.from);
  return added;
}

/**
 * Nokta bu seritten korunuyor mu: genislik eksenindeki izdusumu yutulan bir
 * araligin icinde ve yol yonunde kesilme noktasinin otesinde.
 */
export function isSparedFromSurge(band: SurgeBandGeometry, absorbed: readonly SurgeAbsorbedInterval[], x: number, y: number) {
  if (absorbed.length === 0) return false;
  const point = projectOntoSurgeBand(band, x, y);
  for (const interval of absorbed) {
    if (point.across >= interval.from && point.across <= interval.to && point.along > interval.progress * band.length) return true;
  }
  return false;
}

// --- Tel ---------------------------------------------------------------------------

/** Tel kaydinda okunan en fazla kesik (bozuk veriye karsi). */
export const SURGE_CUT_MAX_ENTRIES = 16;

/**
 * Yutulan araliklarin tel hali (`CounterSurgeSnapshot.cut`): duz uclu dizi
 * `[from, to, p, from, to, p, ...]`. `from`/`to` seridin genislik ekseninde,
 * seridin dusuk kenarindan hucre cinsinden uzaklik (0..genislik); `p` kesildigi
 * ilerleme. Yon tasimiyor: her yonde ayni okunur. Kesik yoksa `undefined`.
 */
export function encodeSurgeCuts(band: SurgeBandGeometry, absorbed: readonly SurgeAbsorbedInterval[], gridSize: number): number[] | undefined {
  if (absorbed.length === 0 || !(gridSize > 0)) return undefined;
  const span = getSurgeBandSpan(band);
  const cut: number[] = [];
  for (const interval of absorbed) {
    if (cut.length >= SURGE_CUT_MAX_ENTRIES * 3) break;
    cut.push(
      Math.round(((interval.from - span.from) / gridSize) * 100) / 100,
      Math.round(((interval.to - span.from) / gridSize) * 100) / 100,
      Math.round(interval.progress * 1000) / 1000
    );
  }
  return cut;
}

export type SurgeCut = { from: number; to: number; p: number };

/** Tel kaydini okur: gecersiz uclu atlanir, araliklar genislige kirpilir ve siralanir. */
export function decodeSurgeCuts(cut: unknown, widthCells: number): SurgeCut[] {
  if (!Array.isArray(cut) || !(widthCells > 0)) return [];
  const cuts: SurgeCut[] = [];
  for (let index = 0; index + 2 < cut.length && cuts.length < SURGE_CUT_MAX_ENTRIES; index += 3) {
    const from = cut[index];
    const to = cut[index + 1];
    const p = cut[index + 2];
    if (typeof from !== "number" || typeof to !== "number" || typeof p !== "number") continue;
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(p)) continue;
    const start = Math.max(0, Math.min(widthCells, from));
    const end = Math.max(0, Math.min(widthCells, to));
    if (!(end > start)) continue;
    cuts.push({ from: start, to: end, p: Math.max(0, Math.min(1, p)) });
  }
  return cuts.sort((left, right) => left.from - right.from);
}

/** Seridin genisliginin bir dilimi: kendi on kenar ilerlemesi; `cut` ise orada durmus. */
export type SurgeFrontSegment = { from: number; to: number; p: number; cut: boolean };

/**
 * Seridin genisligini dilimlere boler (hucre, dusuk kenardan): kesilen dilim
 * kesildigi ilerlemede durur, geri kalan `progress`te. On cizgi kesilme
 * noktasina henuz varmadiysa (ara deger) dilim digerleriyle birlikte ilerler.
 */
export function getSurgeFrontSegments(widthCells: number, progress: number, cuts: readonly SurgeCut[]): SurgeFrontSegment[] {
  const segments: SurgeFrontSegment[] = [];
  let cursor = 0;
  const push = (from: number, to: number, p: number, cut: boolean) => {
    if (!(to > from)) return;
    const last = segments[segments.length - 1];
    if (last && last.cut === cut && last.p === p && last.to === from) last.to = to;
    else segments.push({ from, to, p, cut });
  };
  for (const entry of cuts) {
    const from = Math.max(cursor, entry.from);
    if (!(entry.to > from)) continue;
    push(cursor, from, progress, false);
    const stopped = progress >= entry.p;
    push(from, entry.to, stopped ? entry.p : progress, stopped);
    cursor = entry.to;
  }
  push(cursor, widthCells, progress, false);
  return segments;
}
