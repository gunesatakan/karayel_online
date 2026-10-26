/**
 * 2D VFX yuzeyinin (vfx/kit `VfxGraphics`) 3D karsiligi: egik gorunumde kule
 * isaretleri, bag cizgileri, operatorun is isini ve mac sonu isini bu yuzeye
 * cizip 3D sahnede gorunuyor (Phaser'in kalkik efekt duzlemi yerine).
 *
 * Cizim kodu degismiyor: ayni cagrilar (lineStyle, lineBetween, fillRect, yol,
 * daire) kaydediliyor; her karede kipe gore 3D'ye aktariliyor:
 * - `link`: her uc kendi yerindeki kulenin, dusmanin ya da operatorun
 *   yuksekliginde (bag kuleden kuleye, ip kuleden dusmanin govdesine); bos
 *   yerde piyade govdesi boyunda. Seritler kameraya donuk.
 * - `mark`: her sekil (bir cizim stili boyunca cizilenler: bir nisangah, bir
 *   gosterge) ortasindaki dusmanin, kulenin ya da operatorun govdesinde ayakta,
 *   kameraya donuk; hemen ardindaki kucuk sekil (yigin kertikleri) ayni capada.
 *   Genis ya da bos yerdeki sekil (3x3 karantina, ihlal cizgisi) zemine yatik.
 *   Derinlik sinamasi yok: govdenin onunde kaliyor.
 * - `ground`: araziye yatik (alan, karantina).
 * - `upright`: `setAnchor` noktasindan yukari: 2D'de kuzeye giden gokyuzu
 *   yuksekligine (mac sonu isini).
 */
import * as THREE from "three";
import type { VfxGraphics } from "../vfx/kit";

export type OverlayMode = "link" | "mark" | "ground" | "upright";

export type Overlay3dSurface = VfxGraphics & {
  clear(): unknown;
  /** `upright` kipinin tabani (2D dunya). */
  setAnchor(x: number, y: number): void;
};

export type OverlayAnchor = { x: number; y: number; z: number };

export type Overlay3dDeps = {
  cellSize(): number;
  groundHeight(x: number, z: number): number;
  /** Bos yerdeki bagin yuksekligi (zeminden): piyade govdesinin ortasi. */
  bodyHeight(): number;
  /** (x, z) yakinindaki dusman, kule ya da operator: govdesinin ortasi (dunya). */
  anchorAt(x: number, z: number, kind: "link" | "mark"): OverlayAnchor | undefined;
};

export type Overlay3d = {
  /** Adli yuzey (ilk istekte kuruluyor; ayni ad ayni yuzey). */
  surface(name: string, mode: OverlayMode, additive?: boolean): Overlay3dSurface;
  /** Her karede cizimden once: kayitli sekiller 3D'ye. */
  update(camera: THREE.Object3D): void;
  setVisible(visible: boolean): void;
  /** Butun yuzeyler bos (gorunum degisti, mac bitti). */
  clear(): void;
  dispose(): void;
};

/** Zemine yatik sekil zeminin bu kadar ustunde (z-fighting yok). */
const GROUND_LIFT = 0.6;
const CAPACITY = 24000;
const CIRCLE_SIDES = 20;

const VERTEX = `
attribute vec4 rgba;
varying vec4 vColor;
void main() {
  vColor = rgba;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = `
varying vec4 vColor;
void main() {
  if (vColor.a < 0.003) discard;
  gl_FragColor = vColor;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Bir karistirma ve derinlik sinamasi icin tek dinamik ucgen yigini. */
class TriangleSink {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly position: THREE.BufferAttribute;
  private readonly rgba: THREE.BufferAttribute;
  count = 0;

  constructor(additive: boolean, depthTest: boolean, renderOrder: number) {
    this.geometry = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.rgba = new THREE.BufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", this.position);
    this.geometry.setAttribute("rgba", this.rgba);
    this.geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin() {
    this.count = 0;
  }

  push(x: number, y: number, z: number, r: number, g: number, b: number, a: number) {
    if (this.count >= CAPACITY) return;
    const p = this.position.array as Float32Array;
    const c = this.rgba.array as Float32Array;
    const i3 = this.count * 3;
    const i4 = this.count * 4;
    p[i3] = x; p[i3 + 1] = y; p[i3 + 2] = z;
    c[i4] = r; c[i4 + 1] = g; c[i4 + 2] = b; c[i4 + 3] = a;
    this.count += 1;
  }

  end() {
    // Ucgen bolunmesin: tam uclu.
    this.count -= this.count % 3;
    this.geometry.setDrawRange(0, this.count);
    for (const attribute of [this.position, this.rgba]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  dispose() {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Buyuyen sayi dizisi (karede cop yok). */
class Floats {
  data = new Float32Array(1024);
  length = 0;
  reserve(extra: number) {
    if (this.length + extra <= this.data.length) return;
    const next = new Float32Array(Math.max(this.data.length * 2, this.length + extra));
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
}

const SEG = 10; // x1 y1 x2 y2 genislik r g b a sekil
const TRI = 11; // x1 y1 x2 y2 x3 y3 r g b a sekil
/** Isaret sekli en cok bu kadar genis (hucre; capadan en uzak nokta): daha genisi zeminde. */
const MARK_MAX_EXTENT_CELLS = 1.3;
/** Capasiz kucuk sekil bir oncekinin capasina bu kadar yakinsa (hucre) onu kullaniyor. */
const MARK_FOLLOW_CELLS = 1;
const TMP_COLOR = new THREE.Color();

/** Kayitci yuzey: 2D cagrilari karede tutuyor. */
class RecordingSurface implements Overlay3dSurface {
  readonly segments = new Floats();
  readonly triangles = new Floats();
  anchorX = 0;
  anchorY = 0;
  /** Stil cagrisi basina bir sekil (isaret kipinin capasi sekil basina). */
  runs = 0;
  private line = { width: 1, r: 1, g: 1, b: 1, a: 1 };
  private fill = { r: 1, g: 1, b: 1, a: 1 };
  /** Yol: alt yollar (duz [x, y, ...]) ve kapali mi. */
  private paths: { points: number[]; closed: boolean }[] = [];

  constructor(readonly mode: OverlayMode, readonly additive: boolean) {}

  clear() {
    this.segments.length = 0;
    this.triangles.length = 0;
    this.paths = [];
    this.runs = 0;
    return this;
  }

  setAnchor(x: number, y: number) {
    this.anchorX = x;
    this.anchorY = y;
  }

  lineStyle(width: number, color: number, alpha = 1) {
    TMP_COLOR.setHex(color);
    this.line = { width, r: TMP_COLOR.r, g: TMP_COLOR.g, b: TMP_COLOR.b, a: alpha };
    this.runs += 1;
    return this;
  }

  fillStyle(color: number, alpha = 1) {
    TMP_COLOR.setHex(color);
    this.fill = { r: TMP_COLOR.r, g: TMP_COLOR.g, b: TMP_COLOR.b, a: alpha };
    this.runs += 1;
    return this;
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    const s = this.segments;
    s.reserve(SEG);
    const d = s.data;
    const o = s.length;
    const l = this.line;
    d[o] = x1; d[o + 1] = y1; d[o + 2] = x2; d[o + 3] = y2; d[o + 4] = l.width;
    d[o + 5] = l.r; d[o + 6] = l.g; d[o + 7] = l.b; d[o + 8] = l.a; d[o + 9] = this.runs;
    s.length += SEG;
    return this;
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    const t = this.triangles;
    t.reserve(TRI);
    const d = t.data;
    const o = t.length;
    const f = this.fill;
    d[o] = x0; d[o + 1] = y0; d[o + 2] = x1; d[o + 3] = y1; d[o + 4] = x2; d[o + 5] = y2;
    d[o + 6] = f.r; d[o + 7] = f.g; d[o + 8] = f.b; d[o + 9] = f.a; d[o + 10] = this.runs;
    t.length += TRI;
    return this;
  }

  private fillPolygon(points: readonly number[]) {
    for (let index = 2; index + 3 < points.length; index += 2) {
      this.fillTriangle(points[0], points[1], points[index], points[index + 1], points[index + 2], points[index + 3]);
    }
  }

  private strokePolygon(points: readonly number[], closed: boolean) {
    for (let index = 0; index + 3 < points.length; index += 2) this.lineBetween(points[index], points[index + 1], points[index + 2], points[index + 3]);
    if (closed && points.length >= 6) this.lineBetween(points[points.length - 2], points[points.length - 1], points[0], points[1]);
  }

  private ellipsePoints(x: number, y: number, rx: number, ry: number) {
    const points: number[] = [];
    for (let index = 0; index < CIRCLE_SIDES; index += 1) {
      const angle = (index / CIRCLE_SIDES) * Math.PI * 2;
      points.push(x + Math.cos(angle) * rx, y + Math.sin(angle) * ry);
    }
    return points;
  }

  fillCircle(x: number, y: number, radius: number) {
    if (radius > 0) this.fillPolygon(this.ellipsePoints(x, y, radius, radius));
    return this;
  }

  strokeCircle(x: number, y: number, radius: number) {
    if (radius > 0) this.strokePolygon(this.ellipsePoints(x, y, radius, radius), true);
    return this;
  }

  fillEllipse(x: number, y: number, width: number, height: number) {
    this.fillPolygon(this.ellipsePoints(x, y, width / 2, height / 2));
    return this;
  }

  strokeEllipse(x: number, y: number, width: number, height: number) {
    this.strokePolygon(this.ellipsePoints(x, y, width / 2, height / 2), true);
    return this;
  }

  fillRect(x: number, y: number, width: number, height: number) {
    this.fillPolygon([x, y, x + width, y, x + width, y + height, x, y + height]);
    return this;
  }

  strokeRect(x: number, y: number, width: number, height: number) {
    this.strokePolygon([x, y, x + width, y, x + width, y + height, x, y + height], true);
    return this;
  }

  beginPath() {
    this.paths = [];
    return this;
  }

  private current() {
    let path = this.paths[this.paths.length - 1];
    if (!path) {
      path = { points: [], closed: false };
      this.paths.push(path);
    }
    return path;
  }

  moveTo(x: number, y: number) {
    this.paths.push({ points: [x, y], closed: false });
    return this;
  }

  lineTo(x: number, y: number) {
    this.current().points.push(x, y);
    return this;
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false) {
    let sweep = endAngle - startAngle;
    if (anticlockwise && sweep > 0) sweep -= Math.PI * 2;
    if (!anticlockwise && sweep < 0) sweep += Math.PI * 2;
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * CIRCLE_SIDES));
    const path = this.current();
    for (let index = 0; index <= steps; index += 1) {
      const angle = startAngle + (sweep * index) / steps;
      path.points.push(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    return this;
  }

  closePath() {
    this.current().closed = true;
    return this;
  }

  strokePath() {
    for (const path of this.paths) this.strokePolygon(path.points, path.closed);
    return this;
  }

  fillPath() {
    for (const path of this.paths) this.fillPolygon(path.points);
    return this;
  }

  fillPoints(points: ReadonlyArray<{ x: number; y: number }>) {
    this.fillPolygon(points.flatMap((point) => [point.x, point.y]));
    return this;
  }

  strokePoints(points: ReadonlyArray<{ x: number; y: number }>, closeShape = false) {
    this.strokePolygon(points.flatMap((point) => [point.x, point.y]), closeShape);
    return this;
  }
}

const A = new THREE.Vector3();
const B = new THREE.Vector3();
const C = new THREE.Vector3();
const DIR = new THREE.Vector3();
const VIEW = new THREE.Vector3();
const SIDE = new THREE.Vector3();
const CAMERA = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const UPV = new THREE.Vector3();
const FLAT_RIGHT = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function createOverlay3d(scene: THREE.Scene, deps: Overlay3dDeps): Overlay3d {
  // Karistirma x derinlik: isaretler (mark) govdenin onunde kaliyor, bag ve zemin sinaniyor.
  const sinks = {
    normal: new TriangleSink(false, true, 12),
    glow: new TriangleSink(true, true, 13),
    normalTop: new TriangleSink(false, false, 14),
    glowTop: new TriangleSink(true, false, 15)
  };
  const group = new THREE.Group();
  for (const sink of Object.values(sinks)) group.add(sink.mesh);
  scene.add(group);
  const surfaces = new Map<string, RecordingSurface>();

  function surface(name: string, mode: OverlayMode, additive = false) {
    let entry = surfaces.get(name);
    if (!entry) {
      entry = new RecordingSurface(mode, additive);
      surfaces.set(name, entry);
    }
    return entry;
  }

  /** 2D noktanin 3D yeri, kipe ve (isaret icin) sekil capasina gore. */
  function place(out: THREE.Vector3, s: RecordingSurface, x: number, y: number, anchor: OverlayAnchor | undefined) {
    switch (s.mode) {
      case "link": {
        const at = deps.anchorAt(x, y, "link");
        out.set(x, at ? at.y : deps.groundHeight(x, y) + deps.bodyHeight(), y);
        return;
      }
      case "mark":
        if (anchor) {
          // Capanin ortasinda ayakta: 2D sag kameranin sagi, 2D asagi kameranin asagisi.
          out.set(anchor.x, anchor.y, anchor.z).addScaledVector(RIGHT, x - anchor.x).addScaledVector(UPV, -(y - anchor.z));
          return;
        }
        out.set(x, deps.groundHeight(x, y) + GROUND_LIFT, y);
        return;
      case "upright": {
        // Taban capada; 2D'de kuzeye uzaklik yukseklik, dogu-bati kameranin yatay sagi.
        const ax = s.anchorX;
        const ay = s.anchorY;
        out.set(ax, deps.groundHeight(ax, ay) + (ay - y), ay).addScaledVector(FLAT_RIGHT, x - ax);
        return;
      }
      default:
        out.set(x, deps.groundHeight(x, y) + GROUND_LIFT, y);
    }
  }

  /** Isaret kipinde sekil basina capa (sekil kimligi dizini); kip baskaysa bos. */
  let runAnchors: (OverlayAnchor | undefined)[] = [];
  const runStats = new Floats();

  function resolveRuns(s: RecordingSurface) {
    runAnchors = [];
    if (s.mode !== "mark") return;
    const runs = s.runs + 1;
    // Sekil basina [toplam x, toplam y, sayi, en kucuk x, en kucuk y, en buyuk x, en buyuk y].
    runStats.length = 0;
    runStats.reserve(runs * 7);
    const st = runStats.data;
    for (let run = 0; run < runs; run += 1) {
      const o = run * 7;
      st[o] = 0; st[o + 1] = 0; st[o + 2] = 0;
      st[o + 3] = Infinity; st[o + 4] = Infinity; st[o + 5] = -Infinity; st[o + 6] = -Infinity;
    }
    const add = (run: number, x: number, y: number) => {
      const o = run * 7;
      st[o] += x; st[o + 1] += y; st[o + 2] += 1;
      if (x < st[o + 3]) st[o + 3] = x;
      if (y < st[o + 4]) st[o + 4] = y;
      if (x > st[o + 5]) st[o + 5] = x;
      if (y > st[o + 6]) st[o + 6] = y;
    };
    const seg = s.segments.data;
    for (let o = 0; o < s.segments.length; o += SEG) {
      add(seg[o + 9], seg[o], seg[o + 1]);
      add(seg[o + 9], seg[o + 2], seg[o + 3]);
    }
    const tri = s.triangles.data;
    for (let o = 0; o < s.triangles.length; o += TRI) {
      add(tri[o + 10], tri[o], tri[o + 1]);
      add(tri[o + 10], tri[o + 2], tri[o + 3]);
      add(tri[o + 10], tri[o + 4], tri[o + 5]);
    }
    const cell = deps.cellSize();
    let last: OverlayAnchor | undefined;
    for (let run = 0; run < runs; run += 1) {
      const o = run * 7;
      if (st[o + 2] === 0) continue;
      const cx = st[o] / st[o + 2];
      const cy = st[o + 1] / st[o + 2];
      const extent = Math.max(st[o + 5] - cx, cx - st[o + 3], st[o + 6] - cy, cy - st[o + 4]);
      if (extent > cell * MARK_MAX_EXTENT_CELLS) continue;
      let anchor = deps.anchorAt(cx, cy, "mark");
      if (!anchor && last && Math.hypot(cx - last.x, cy - last.z) < cell * MARK_FOLLOW_CELLS) anchor = last;
      if (anchor) {
        runAnchors[run] = anchor;
        last = anchor;
      }
    }
  }

  function markAnchor(run: number) {
    return runAnchors[run];
  }

  function sinkOf(s: RecordingSurface) {
    const top = s.mode === "mark";
    return s.additive ? (top ? sinks.glowTop : sinks.glow) : (top ? sinks.normalTop : sinks.normal);
  }

  function emitSegment(sink: TriangleSink, s: RecordingSurface, d: Float32Array, o: number) {
    const x1 = d[o], y1 = d[o + 1], x2 = d[o + 2], y2 = d[o + 3];
    const anchor = markAnchor(d[o + 9]);
    place(A, s, x1, y1, anchor);
    place(B, s, x2, y2, anchor);
    DIR.subVectors(B, A);
    if (DIR.lengthSq() < 1e-8) return;
    if (s.mode === "ground" || (s.mode === "mark" && !anchor)) {
      SIDE.crossVectors(DIR, WORLD_UP);
    } else {
      VIEW.addVectors(A, B).multiplyScalar(0.5);
      VIEW.subVectors(CAMERA, VIEW);
      SIDE.crossVectors(DIR, VIEW);
    }
    if (SIDE.lengthSq() < 1e-10) return;
    SIDE.normalize().multiplyScalar(Math.max(0.4, d[o + 4]) / 2);
    const r = d[o + 5], g = d[o + 6], b = d[o + 7], a = d[o + 8];
    sink.push(A.x - SIDE.x, A.y - SIDE.y, A.z - SIDE.z, r, g, b, a);
    sink.push(A.x + SIDE.x, A.y + SIDE.y, A.z + SIDE.z, r, g, b, a);
    sink.push(B.x + SIDE.x, B.y + SIDE.y, B.z + SIDE.z, r, g, b, a);
    sink.push(A.x - SIDE.x, A.y - SIDE.y, A.z - SIDE.z, r, g, b, a);
    sink.push(B.x + SIDE.x, B.y + SIDE.y, B.z + SIDE.z, r, g, b, a);
    sink.push(B.x - SIDE.x, B.y - SIDE.y, B.z - SIDE.z, r, g, b, a);
  }

  function emitTriangle(sink: TriangleSink, s: RecordingSurface, d: Float32Array, o: number) {
    const anchor = markAnchor(d[o + 10]);
    place(A, s, d[o], d[o + 1], anchor);
    place(B, s, d[o + 2], d[o + 3], anchor);
    place(C, s, d[o + 4], d[o + 5], anchor);
    const r = d[o + 6], g = d[o + 7], b = d[o + 8], a = d[o + 9];
    sink.push(A.x, A.y, A.z, r, g, b, a);
    sink.push(B.x, B.y, B.z, r, g, b, a);
    sink.push(C.x, C.y, C.z, r, g, b, a);
  }

  function update(camera: THREE.Object3D) {
    camera.updateMatrixWorld();
    CAMERA.setFromMatrixPosition(camera.matrixWorld);
    RIGHT.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    UPV.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    FLAT_RIGHT.set(RIGHT.x, 0, RIGHT.z);
    if (FLAT_RIGHT.lengthSq() < 1e-6) FLAT_RIGHT.set(1, 0, 0);
    FLAT_RIGHT.normalize();
    for (const sink of Object.values(sinks)) sink.begin();
    for (const s of surfaces.values()) {
      resolveRuns(s);
      const sink = sinkOf(s);
      const segments = s.segments.data;
      for (let o = 0; o < s.segments.length; o += SEG) emitSegment(sink, s, segments, o);
      const triangles = s.triangles.data;
      for (let o = 0; o < s.triangles.length; o += TRI) emitTriangle(sink, s, triangles, o);
    }
    for (const sink of Object.values(sinks)) sink.end();
  }

  return {
    surface,
    update,
    setVisible(visible: boolean) {
      group.visible = visible;
    },
    clear() {
      for (const s of surfaces.values()) s.clear();
    },
    dispose() {
      scene.remove(group);
      for (const sink of Object.values(sinks)) sink.dispose();
      surfaces.clear();
    }
  };
}
