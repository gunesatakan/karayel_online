/**
 * Cizimin kapladigi geometriyi kaydeden sahte Graphics ve olcum yardimcilari.
 *
 * Merminin isabet sekli cizilen govdeden (projectile-body); testler gercek
 * cizicileri (attack-vfx, PreloaderScene dokulari) bu yuzeye cizdirip
 * govdenin dis hatlarini olcuyor. Her ilkel kapladigi dis bukey cokgenin
 * koseleri, alfasi ve cizgi kalinligi olarak tutuluyor; Phaser'in WebGL
 * cizgisi gibi `lineBetween` kalinligin yarisi kadar iki yana acilan, ucu
 * kesik bir dortgen.
 */
export function createGeometryRecorder() {
  const prims = [];
  let lineWidth = 1;
  let lineAlpha = 1;
  let fillAlpha = 1;
  let path = [];
  const quad = (x1, y1, x2, y2, width) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 1e-9) return [];
    const nx = (-(y2 - y1) / length) * (width / 2);
    const ny = ((x2 - x1) / length) * (width / 2);
    return [[x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny]];
  };
  const push = (points, alpha, width) => { if (points.length) prims.push({ points, alpha, width }); };
  // 256 kose: kirisin sarkmasi (r x 0,0001) on zarfin olcumunu bozmasin.
  const circle = (x, y, r) => Array.from({ length: 256 }, (_, i) => [x + Math.cos((i / 256) * Math.PI * 2) * r, y + Math.sin((i / 256) * Math.PI * 2) * r]);
  const api = {
    prims,
    lineStyle(width, _color, alpha = 1) { lineWidth = width; lineAlpha = alpha; return proxy; },
    fillStyle(_color, alpha = 1) { fillAlpha = alpha; return proxy; },
    lineBetween(x1, y1, x2, y2) { push(quad(x1, y1, x2, y2, lineWidth), lineAlpha, lineWidth); return proxy; },
    fillTriangle(x1, y1, x2, y2, x3, y3) { push([[x1, y1], [x2, y2], [x3, y3]], fillAlpha); return proxy; },
    fillRect(x, y, w, h) { push([[x, y], [x + w, y], [x, y + h], [x + w, y + h]], fillAlpha); return proxy; },
    fillCircle(x, y, r) { push(circle(x, y, r), fillAlpha); return proxy; },
    strokeCircle(x, y, r) { push(circle(x, y, r + lineWidth / 2), lineAlpha, lineWidth); return proxy; },
    fillEllipse(x, y, w, h) { push(Array.from({ length: 64 }, (_, i) => [x + Math.cos((i / 64) * Math.PI * 2) * w / 2, y + Math.sin((i / 64) * Math.PI * 2) * h / 2]), fillAlpha); return proxy; },
    beginPath() { path = []; return proxy; },
    moveTo(x, y) { path.push([x, y]); return proxy; },
    lineTo(x, y) { path.push([x, y]); return proxy; },
    closePath() { if (path.length) path.push([...path[0]]); return proxy; },
    strokePath() { for (let i = 1; i < path.length; i += 1) push(quad(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1], lineWidth), lineAlpha, lineWidth); return proxy; },
    fillPath() { push(path.map((point) => [...point]), fillAlpha); return proxy; },
    fillPoints(points) { push(points.map((point) => [point.x, point.y]), fillAlpha); return proxy; },
    clear() { prims.length = 0; return proxy; }
  };
  const proxy = new Proxy(api, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === "then") return undefined;
      return () => proxy;
    }
  });
  return proxy;
}

/** Govde sayilan ilkel: alfa >= 0,6 ve cizgiyse kalinlik >= `thin`. */
export const THIN_LINE = 0.55;
export const isBodyPrim = (prim, thin = THIN_LINE) => prim.alpha >= 0.6 && (prim.width === undefined || prim.width >= thin);

/** Noktalarin dis bukey zarfi (saat yonunun tersine). */
function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Cizilen govdenin on zarfi: ucus yonu +x, merkez (ox, oy). Donen fonksiyon
 * `y` yanal uzakligindaki (iki yonde de) en ondeki cizili noktanin x'i;
 * o yanal uzaklikta govde yoksa -Infinity. Her ilkel dis bukey (kayitci
 * oyle uretiyor); zarf ilkellerin zarflarinin en buyugu.
 */
export function frontEnvelope(prims, ox, oy, keep = () => true, thin = THIN_LINE) {
  const hulls = prims.filter((prim) => isBodyPrim(prim, thin) && keep(prim)).map((prim) => hull(prim.points.map(([px, py]) => [px - ox, py - oy])));
  return (y) => {
    let best = -Infinity;
    for (const polygon of hulls) {
      if (polygon.length === 1) {
        if (Math.abs(polygon[0][1] - y) < 1e-9) best = Math.max(best, polygon[0][0]);
        continue;
      }
      for (let index = 0; index < polygon.length; index += 1) {
        const [ax, ay] = polygon[index];
        const [bx, by] = polygon[(index + 1) % polygon.length];
        // Kayan nokta payi: eksendeki kose (sin(pi) ~ 1e-16) yanaldan kaymasin.
        const low = Math.min(ay, by);
        const high = Math.max(ay, by);
        if (y < low - 1e-7 || y > high + 1e-7) continue;
        const clamped = Math.max(low, Math.min(high, y));
        const x = high - low <= 1e-7 ? Math.max(ax, bx) : ax + ((clamped - ay) / (by - ay)) * (bx - ax);
        best = Math.max(best, x);
      }
    }
    return best;
  };
}
