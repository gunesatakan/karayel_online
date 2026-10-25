/**
 * Egik 3D gorunumun vuruslari: mermiler, namlu atesi, carpma ve isinlar.
 *
 * 2D'nin efekt sistemi (vfx/attack-vfx.ts) egik gorunumde cizmiyor; olaylari
 * ve mermileri buraya aynaliyor (`AttackVfxOptions.mirror`). Vurusun hissi
 * (sarsinti, itme, duraklama) 2D'de kaliyor. Tarifler `shot-recipes.ts`te.
 *
 * Cizim iki parcacik alaninda (kameraya donuk dortgenler, tek cizim cagrisi):
 * ADD karisimli isik (parlama, kivilcim, halka, isin, kor) ve normal karisimli
 * madde (duman, kirinti, yanik izi). Mermi govdeleri kucuk 3D modeller
 * (koni, elmas, altigen, kure), arkalarinda isik izi. Yukseklik: mermi
 * namludan cikiyor, ayakta duran dusmanin govdesine iniyor; Sunucu'nun paketi
 * kavisle.
 */
import * as THREE from "three";
import { getShotRecipe, whiten, type ShotRecipe } from "./shot-recipes";

export type ShotEventKind = "muzzle" | "anticipation" | "impact" | "beamHit";

export type ShotEventInput = {
  x: number;
  y: number;
  angle: number;
  definitionId: string;
  tier?: number;
  own?: boolean;
  /** Alan hasarinin gercek yaricapi (dunya birimi). */
  radius?: number;
  key?: string;
  fallbackColor?: number;
};

export type ShotProjectileInput = {
  id: string;
  source: "tower" | "enemy";
  definitionId?: string;
  tier?: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
};

export type ShotBeamInput = {
  id: string;
  definitionId: string;
  tier?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color: number;
  /** Sekme koseleri (kuyruktan basa, duz [x, y, ...]). */
  b?: number[];
};

export type ShotFxDeps = {
  cellSize(): number;
  /** Arazinin yuksekligi (tepe arti, cukur eksi). */
  groundHeight(x: number, z: number): number;
  /** Ayakta duran piyadenin govde ortasinin yerden yuksekligi. */
  bodyHeight(): number;
  /** (x, z) yakinindaki kulenin namlu ucu (dunya); modeli yoksa `undefined`. */
  muzzle(x: number, z: number): THREE.Vector3 | undefined;
  /** Kulenin namlusunu geri tep (0-1). */
  kick?(x: number, z: number, strength: number): void;
  reducedMotion?(): boolean;
};

export type ShotFx = {
  event(kind: ShotEventKind, input: ShotEventInput): void;
  projectiles(list: readonly ShotProjectileInput[]): void;
  beams(list: readonly ShotBeamInput[]): void;
  /** Her karede cizimden once: parcaciklar ilerliyor ve yukleniyor. */
  update(now: number): void;
  setVisible(visible: boolean): void;
  clear(): void;
  dispose(): void;
  /** Olcum: canli parcacik sayisi. */
  stats(): { light: number; matter: number; projectiles: number };
};

/* ------------------------------------------------------------------ */
/* Parcacik alani                                                        */
/* ------------------------------------------------------------------ */

/** Seklin kodu (golgelendiricide `iParams.z`). */
const SHAPE = {
  glow: 0,
  spark: 1,
  ring: 2,
  groundRing: 3,
  groundGlow: 4,
  flare: 5,
  chip: 6,
  beam: 7,
  smoke: 8,
  scorch: 9,
  hex: 10
} as const;

const VERTEX = `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iColor;
attribute vec4 iParams;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vFlow;
varying float vAlong;
void main() {
  float size = iParams.x;
  float stretch = iParams.y;
  float shape = iParams.z;
  float spin = iParams.w;
  vUv = position.xy * 2.0;
  vColor = iColor;
  vShape = shape;
  vFlow = stretch;
  vAlong = 0.0;
  bool ground = (shape > 2.5 && shape < 4.5) || shape > 8.5;
  if (ground) {
    float c = cos(spin);
    float s = sin(spin);
    vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
    gl_Position = projectionMatrix * viewMatrix * vec4(iPos + vec3(p.x, 0.0, p.y), 1.0);
    return;
  }
  if (shape > 6.5 && shape < 7.5) {
    vec4 a = viewMatrix * vec4(iPos, 1.0);
    vec4 b = viewMatrix * vec4(iVel, 1.0);
    vec2 d = b.xy - a.xy;
    float len = max(length(d), 0.0001);
    vec2 axis = d / len;
    vec2 nrm = vec2(-axis.y, axis.x);
    float t = position.x + 0.5;
    vec4 mv = mix(a, b, t);
    mv.xy += axis * sign(position.x) * size * 0.5 + nrm * position.y * size;
    // Kameraya dogru eni kadar: yere ya da yamaca gomulup duz kenarla kesilmesin.
    mv.z += size;
    vAlong = t * len / max(size, 0.001);
    gl_Position = projectionMatrix * mv;
    return;
  }
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 d = (viewMatrix * vec4(iVel, 0.0)).xy;
  float speed = length(d);
  vec2 axis = speed > 0.0001 ? d / speed : vec2(cos(spin), sin(spin));
  vec2 nrm = vec2(-axis.y, axis.x);
  float along = size * (1.0 + stretch * speed);
  mv.xy += axis * position.x * along + nrm * position.y * size;
  // Kameraya donuk dortgen kameraya dogru boyu kadar: alt yarisi zemine gomulmesin; onundeki kule yine ortuyor.
  mv.z += max(size, along);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = `
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vFlow;
varying float vAlong;
void main() {
  float r = length(vUv);
  vec3 col = vColor.rgb;
  float a = 0.0;
  if (vShape < 0.5) {
    float edge = max(0.0, 1.0 - r);
    a = edge * edge * (0.55 + 0.45 * edge);
    col = mix(col, vec3(1.0), pow(max(0.0, 1.0 - r * 2.4), 2.0) * 0.85);
  } else if (vShape < 1.5) {
    float across = max(0.0, 1.0 - abs(vUv.y));
    float along = max(0.0, 1.0 - abs(vUv.x));
    a = across * across * pow(along, 1.1);
    col = mix(col, vec3(1.0), pow(across, 6.0) * along * 0.8);
  } else if (vShape < 3.5) {
    float band = (r - 0.8) * 8.0;
    a = exp(-band * band) * step(r, 1.0);
    col = mix(col, vec3(1.0), exp(-band * band * 4.0) * 0.5);
  } else if (vShape < 4.5) {
    float edge = max(0.0, 1.0 - r);
    a = pow(edge, 2.4);
  } else if (vShape < 5.5) {
    vec2 q = abs(vUv);
    float ray = pow(max(0.0, 1.0 - q.y * 10.0), 2.0) * pow(max(0.0, 1.0 - q.x), 2.5)
      + pow(max(0.0, 1.0 - q.x * 10.0), 2.0) * pow(max(0.0, 1.0 - q.y), 2.5);
    float core = pow(max(0.0, 1.0 - r * 1.6), 3.0);
    a = ray + core;
    col = mix(col, vec3(1.0), 0.75);
  } else if (vShape < 6.5) {
    vec2 q = abs(vUv);
    a = step(max(q.x, q.y), 0.9);
    col *= 0.8 + 0.4 * (1.0 - vUv.y) * 0.5;
  } else if (vShape < 7.5) {
    float across = abs(vUv.y);
    a = pow(max(0.0, 1.0 - across), 1.7);
    float cap = 1.0 - smoothstep(0.82, 1.0, abs(vUv.x));
    a *= cap;
    if (vFlow > 0.0) a *= 0.72 + 0.28 * sin(vAlong * 1.6 - uTime * 22.0 * vFlow);
    col = mix(col, vec3(1.0), pow(max(0.0, 1.0 - across * 3.2), 2.0) * 0.9);
  } else if (vShape < 8.5) {
    float edge = max(0.0, 1.0 - r);
    a = pow(edge, 1.4) * (0.82 + 0.18 * sin(vUv.x * 5.0 + vUv.y * 3.0));
  } else if (vShape < 9.5) {
    float wobble = 0.12 * sin(atan(vUv.y, vUv.x) * 7.0) + 0.06 * sin(atan(vUv.y, vUv.x) * 13.0);
    a = 1.0 - smoothstep(0.35, 1.0, r + wobble);
  } else {
    vec2 q = abs(vUv);
    float h = max(q.x * 0.866 + q.y * 0.5, q.y);
    float band = (h - 0.8) * 10.0;
    a = exp(-band * band) * step(h, 1.0);
    col = mix(col, vec3(1.0), exp(-band * band * 4.0) * 0.45);
  }
  a *= vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

type Spawn = {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  color: number;
  alpha?: number;
  size: number;
  /** Omrun sonundaki boy (verilmezse ayni). */
  sizeTo?: number;
  lifeMs: number;
  /** Dogmadan once bekleme (ms). */
  delayMs?: number;
  shape: number;
  stretch?: number;
  spin?: number;
  /** Donus hizi (radyan / sn; yer sekilleri). */
  spinRate?: number;
  drag?: number;
  /** Yercekimi (birim / sn^2, asagi arti). */
  gravity?: number;
  /** Sonme egrisi: alfa (1 - t)^fade. */
  fade?: number;
  /** Belirme payi (omrun kesri). */
  fadeIn?: number;
  /** Yere degince sekiyor (kirinti). */
  bounce?: boolean;
  /** Isin parcasi: bitis noktasi. */
  ex?: number; ey?: number; ez?: number;
};

class ParticleField {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly vel: THREE.InstancedBufferAttribute;
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private readonly params: THREE.InstancedBufferAttribute;
  readonly material: THREE.ShaderMaterial;
  count = 0;
  // Yapilar dizisi yerine dizi yapisi: kare basina cop yok.
  private readonly f: Float32Array;
  private readonly stride = 28;
  constructor(readonly capacity: number, blending: THREE.Blending, renderOrder: number) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    const make = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage);
    this.pos = make(3);
    this.vel = make(3);
    this.colorAttr = make(4);
    this.params = make(4);
    geometry.setAttribute("iPos", this.pos);
    geometry.setAttribute("iVel", this.vel);
    geometry.setAttribute("iColor", this.colorAttr);
    geometry.setAttribute("iParams", this.params);
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Yere yatik sekiller asagi bakiyor: iki yuz.
      side: THREE.DoubleSide,
      blending
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.f = new Float32Array(capacity * this.stride);
  }

  get load() {
    return this.count / this.capacity;
  }

  spawn(p: Spawn) {
    if (this.count >= this.capacity) return;
    const o = this.count * this.stride;
    const f = this.f;
    this.count += 1;
    f[o] = p.x; f[o + 1] = p.y; f[o + 2] = p.z;
    f[o + 3] = p.vx ?? 0; f[o + 4] = p.vy ?? 0; f[o + 5] = p.vz ?? 0;
    f[o + 6] = -(p.delayMs ?? 0);
    f[o + 7] = Math.max(1, p.lifeMs);
    f[o + 8] = p.size;
    f[o + 9] = p.sizeTo ?? p.size;
    f[o + 10] = p.alpha ?? 1;
    f[o + 11] = ((p.color >> 16) & 255) / 255;
    f[o + 12] = ((p.color >> 8) & 255) / 255;
    f[o + 13] = (p.color & 255) / 255;
    f[o + 14] = p.shape;
    f[o + 15] = p.stretch ?? 0;
    f[o + 16] = p.spin ?? 0;
    f[o + 17] = p.spinRate ?? 0;
    f[o + 18] = p.drag ?? 0;
    f[o + 19] = p.gravity ?? 0;
    f[o + 20] = p.fade ?? 1;
    f[o + 21] = p.fadeIn ?? 0;
    f[o + 22] = p.bounce ? 1 : 0;
    // Tek karelik (omur 0): bu kare cizilip bir sonrakinde kalkiyor.
    f[o + 23] = p.lifeMs <= 0 ? 1 : 0;
    f[o + 24] = 0;
    f[o + 25] = p.ex ?? 0; f[o + 26] = p.ey ?? 0; f[o + 27] = p.ez ?? 0;
  }

  /** Ilerlet ve GPU'ya yaz; `ground` arazi yuksekligi (kirintinin sekmesi). */
  step(dtMs: number, ground: (x: number, z: number) => number) {
    const f = this.f;
    const dt = dtMs / 1000;
    let index = 0;
    const pos = this.pos.array as Float32Array;
    const vel = this.vel.array as Float32Array;
    const color = this.colorAttr.array as Float32Array;
    const params = this.params.array as Float32Array;
    while (index < this.count) {
      const o = index * this.stride;
      const single = f[o + 23] > 0;
      // Tek karelik ve cizilmis, ya da omru dolmus: sonuncuyla yer degistir.
      if ((single && f[o + 24] > 0) || (!single && f[o + 6] >= f[o + 7])) {
        this.count -= 1;
        if (index !== this.count) f.copyWithin(o, this.count * this.stride, this.count * this.stride + this.stride);
        continue;
      }
      if (!single) {
        f[o + 6] += dtMs;
        if (f[o + 6] > 0) {
          const drag = Math.exp(-f[o + 18] * dt);
          f[o + 3] *= drag; f[o + 4] *= drag; f[o + 5] *= drag;
          f[o + 4] -= f[o + 19] * dt;
          f[o] += f[o + 3] * dt; f[o + 1] += f[o + 4] * dt; f[o + 2] += f[o + 5] * dt;
          f[o + 16] += f[o + 17] * dt;
          if (f[o + 22] > 0) {
            const floor = ground(f[o], f[o + 2]) + 0.6;
            if (f[o + 1] < floor) {
              f[o + 1] = floor;
              f[o + 4] = Math.abs(f[o + 4]) * 0.32;
              f[o + 3] *= 0.55; f[o + 5] *= 0.55;
            }
          }
        }
      }
      const t = single ? 0 : Math.max(0, f[o + 6]) / f[o + 7];
      const born = single || f[o + 6] >= 0;
      const fadeIn = f[o + 21];
      const appear = fadeIn > 0 ? Math.min(1, t / fadeIn) : 1;
      const alpha = born ? f[o + 10] * appear * Math.pow(Math.max(0, 1 - t), f[o + 20]) : 0;
      const ease = 1 - (1 - t) * (1 - t);
      const size = f[o + 8] + (f[o + 9] - f[o + 8]) * ease;
      const shape = f[o + 14];
      const p3 = index * 3;
      const p4 = index * 4;
      pos[p3] = f[o]; pos[p3 + 1] = f[o + 1]; pos[p3 + 2] = f[o + 2];
      if (shape === SHAPE.beam) {
        vel[p3] = f[o + 25]; vel[p3 + 1] = f[o + 26]; vel[p3 + 2] = f[o + 27];
      } else {
        vel[p3] = f[o + 3]; vel[p3 + 1] = f[o + 4]; vel[p3 + 2] = f[o + 5];
      }
      color[p4] = f[o + 11]; color[p4 + 1] = f[o + 12]; color[p4 + 2] = f[o + 13]; color[p4 + 3] = alpha;
      params[p4] = size; params[p4 + 1] = f[o + 15]; params[p4 + 2] = shape; params[p4 + 3] = f[o + 16];
      if (single) f[o + 24] = 1;
      index += 1;
    }
    this.geometry.instanceCount = this.count;
    for (const attribute of [this.pos, this.vel, this.colorAttr, this.params]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Mermi govdeleri                                                       */
/* ------------------------------------------------------------------ */

type Flight = {
  id: string;
  recipe: ShotRecipe;
  root: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  startY: number;
  startX: number;
  startZ: number;
  x: number;
  y: number;
  z: number;
  traveled: number;
  /** Bu karede goruldu mu (gorulmeyen mermi kalkiyor). */
  seen: boolean;
  seed: number;
  /** Izin birikmis yolu: parcacik yol basina. */
  trailCarry: number;
};

const UP = new THREE.Vector3(0, 1, 0);
const TMP_DIR = new THREE.Vector3();
const TMP_Q = new THREE.Quaternion();
const SPIN_Q = new THREE.Quaternion();

function hash01(text: string) {
  let h = 2166136261;
  for (let index = 0; index < text.length; index += 1) h = Math.imul(h ^ text.charCodeAt(index), 16777619);
  return ((h >>> 0) % 100003) / 100003;
}

export function createShotFx(scene: THREE.Scene, deps: ShotFxDeps): ShotFx {
  const light = new ParticleField(3200, THREE.AdditiveBlending, 9);
  const matter = new ParticleField(900, THREE.NormalBlending, 8);
  const group = new THREE.Group();
  group.add(matter.mesh, light.mesh);
  scene.add(group);

  // Govde modelleri: Y ekseni boyunca (ucus yonune cevriliyor), boy 1.
  const geometries = {
    tracer: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    lance: new THREE.ConeGeometry(0.5, 1, 6),
    packet: new THREE.OctahedronGeometry(0.5, 0),
    cell: new THREE.CylinderGeometry(0.5, 0.5, 0.55, 6),
    gaze: new THREE.SphereGeometry(0.5, 14, 10),
    arc: new THREE.IcosahedronGeometry(0.5, 0),
    orb: new THREE.SphereGeometry(0.5, 12, 8),
    pupil: new THREE.SphereGeometry(0.5, 10, 8)
  };
  const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x07020c, toneMapped: false });
  const flights = new Map<string, Flight>();
  const pools = new Map<string, Flight["root"][]>();
  let lastNow = performance.now();
  let lastBeamSparkAt = new Map<string, number>();
  let visible = true;
  const rand = Math.random;

  const cell = () => deps.cellSize();
  /** Kalabalikta parcacik sayisi azaliyor: alan dolmasin, kare suresi sismesin. */
  const budget = () => {
    const load = Math.max(light.load, matter.load);
    const motion = deps.reducedMotion?.() ? 0.5 : 1;
    return (load > 0.75 ? 0.35 : load > 0.5 ? 0.6 : 1) * motion;
  };
  const count = (value: number) => Math.max(0, Math.round(value * budget()));

  function makeBody(recipe: ShotRecipe) {
    const pool = pools.get(recipe.shape);
    const reused = pool?.pop();
    if (reused) return reused;
    // Isik alan, kendi tonunda parlayan govde: gunes ve kenar isigi sekli okutuyor.
    const material = new THREE.MeshStandardMaterial({ color: recipe.color, emissive: recipe.color, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.25 });
    const mesh = new THREE.Mesh(geometries[recipe.shape], material);
    const root = new THREE.Group();
    root.add(mesh);
    if (recipe.shape === "gaze") {
      const pupil = new THREE.Mesh(geometries.pupil, pupilMaterial);
      pupil.scale.setScalar(0.55);
      pupil.position.set(0, 0.32, 0);
      root.add(pupil);
    }
    root.userData.shape = recipe.shape;
    return root;
  }

  function releaseBody(flight: Flight) {
    group.remove(flight.root);
    const shape = flight.root.userData.shape as string;
    const pool = pools.get(shape) ?? [];
    if (pool.length < 48) pool.push(flight.root);
    else flight.root.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== pupilMaterial) (mesh.material as THREE.Material).dispose();
    });
    pools.set(shape, pool);
  }

  function bodyMaterial(root: THREE.Object3D) {
    return (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
  }

  function targetHeight(x: number, z: number) {
    return deps.groundHeight(x, z) + deps.bodyHeight();
  }

  function muzzlePoint(x: number, z: number) {
    const socket = deps.muzzle(x, z);
    if (socket) return socket;
    return new THREE.Vector3(x, deps.groundHeight(x, z) + cell() * 0.85, z);
  }

  /* ------------------------------- olaylar ------------------------------- */

  function sparkBurst(x: number, y: number, z: number, n: number, speed: number, colors: readonly number[], options: { dirX?: number; dirZ?: number; bias?: number; up?: number; life?: number; size?: number; stretch?: number; gravity?: number } = {}) {
    const c = cell();
    for (let index = 0; index < n; index += 1) {
      const theta = rand() * Math.PI * 2;
      const lift = (options.up ?? 0.45) + rand() * 0.6;
      let dx = Math.cos(theta);
      let dz = Math.sin(theta);
      if (options.dirX !== undefined && options.dirZ !== undefined) {
        const bias = options.bias ?? 0.6;
        dx = dx * (1 - bias) + options.dirX * bias;
        dz = dz * (1 - bias) + options.dirZ * bias;
      }
      const v = speed * c * (0.45 + rand() * 0.75);
      light.spawn({
        x, y, z,
        vx: dx * v, vy: lift * v, vz: dz * v,
        color: colors[index % colors.length],
        size: (options.size ?? 0.075) * c * (0.7 + rand() * 0.6),
        lifeMs: (options.life ?? 380) * (0.6 + rand() * 0.7),
        shape: SHAPE.spark,
        stretch: options.stretch ?? 0.06,
        drag: 2.4,
        gravity: (options.gravity ?? 9) * c,
        fade: 1.3
      });
    }
  }

  function smokePuffs(x: number, y: number, z: number, n: number, size: number, color = 0x3a3a40, alpha = 0.45) {
    const c = cell();
    for (let index = 0; index < n; index += 1) {
      matter.spawn({
        x: x + (rand() - 0.5) * c * 0.3, y: y + rand() * c * 0.15, z: z + (rand() - 0.5) * c * 0.3,
        vx: (rand() - 0.5) * c * 0.5, vy: c * (0.35 + rand() * 0.4), vz: (rand() - 0.5) * c * 0.5,
        color,
        alpha: alpha * (0.6 + rand() * 0.4),
        size: size * c * 0.4,
        sizeTo: size * c * (0.9 + rand() * 0.5),
        lifeMs: 650 + rand() * 450,
        shape: SHAPE.smoke,
        drag: 1.6,
        fade: 1.6,
        fadeIn: 0.12,
        spin: rand() * 6
      });
    }
  }

  function groundRing(x: number, z: number, from: number, to: number, color: number, lifeMs: number, delayMs = 0, alpha = 0.95, shape: number = SHAPE.groundRing) {
    light.spawn({ x, y: deps.groundHeight(x, z) + 0.8, z, color, alpha, size: from, sizeTo: to, lifeMs, delayMs, shape, fade: 1.4, spin: rand() * Math.PI });
  }

  function groundGlow(x: number, z: number, size: number, color: number, lifeMs: number, alpha = 0.55) {
    light.spawn({ x, y: deps.groundHeight(x, z) + 0.7, z, color, alpha, size, sizeTo: size * 1.2, lifeMs, shape: SHAPE.groundGlow, fade: 1.6 });
  }

  function flare(x: number, y: number, z: number, size: number, color: number, lifeMs: number, delayMs = 0) {
    light.spawn({ x, y, z, color, size, sizeTo: size * 0.6, lifeMs, delayMs, shape: SHAPE.flare, fade: 1.2, spin: rand() * Math.PI });
    light.spawn({ x, y, z, color, size: size * 0.9, sizeTo: size * 1.5, lifeMs: lifeMs * 2.4, delayMs, shape: SHAPE.glow, fade: 1.8, alpha: 0.5 });
  }

  function streak(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, width: number, color: number, lifeMs: number, delayMs = 0, alpha = 1, flow = 0) {
    light.spawn({ x: x1, y: y1, z: z1, ex: x2, ey: y2, ez: z2, color, alpha, size: width, sizeTo: width * 0.4, lifeMs, delayMs, shape: SHAPE.beam, stretch: flow, fade: 1.3 });
  }

  function muzzleEvent(input: ShotEventInput, recipe: ShotRecipe) {
    const c = cell();
    const p = muzzlePoint(input.x, input.y);
    const dx = Math.cos(input.angle);
    const dz = Math.sin(input.angle);
    const tier = recipe.tier;
    flare(p.x + dx * c * 0.1, p.y, p.z + dz * c * 0.1, recipe.muzzle.flash * c, recipe.core, 70 + tier * 15);
    light.spawn({ x: p.x, y: p.y, z: p.z, vx: dx * c * 9, vz: dz * c * 9, color: recipe.color, size: c * 0.12 * tier, lifeMs: 90, shape: SHAPE.spark, stretch: 0.02, drag: 14, fade: 1 });
    sparkBurst(p.x, p.y, p.z, count(recipe.muzzle.sparks), 5.5, [recipe.core, recipe.color], { dirX: dx, dirZ: dz, bias: 0.82, up: 0.1, life: 200, gravity: 4 });
    if (recipe.muzzle.smoke > 0) smokePuffs(p.x + dx * c * 0.2, p.y, p.z + dz * c * 0.2, count(recipe.muzzle.smoke), 0.35, 0x4a4a52, 0.32);
    if (recipe.muzzle.ring) {
      light.spawn({ x: p.x + dx * c * 0.15, y: p.y, z: p.z + dz * c * 0.15, color: recipe.color, size: c * 0.15, sizeTo: c * 0.55 * tier, lifeMs: 160, shape: SHAPE.ring, fade: 1.5, alpha: 0.85 });
    }
    deps.kick?.(input.x, input.y, 0.45 + tier * 0.2);
  }

  function anticipationEvent(input: ShotEventInput, recipe: ShotRecipe) {
    const c = cell();
    const p = muzzlePoint(input.x, input.y);
    light.spawn({ x: p.x, y: p.y, z: p.z, color: recipe.color, size: c * 0.08, sizeTo: c * 0.32 * recipe.tier, lifeMs: 120, shape: SHAPE.glow, fade: 0.4, fadeIn: 0.6 });
    // Namluya cekilen kivilcimlar: sarj.
    for (let index = 0; index < count(3 + recipe.tier * 2); index += 1) {
      const theta = rand() * Math.PI * 2;
      const reach = c * (0.4 + rand() * 0.3);
      const ox = Math.cos(theta) * reach;
      const oz = Math.sin(theta) * reach;
      const oy = (rand() - 0.3) * reach;
      light.spawn({ x: p.x + ox, y: p.y + oy, z: p.z + oz, vx: -ox * 8, vy: -oy * 8, vz: -oz * 8, color: recipe.core, size: c * 0.035, lifeMs: 120, shape: SHAPE.spark, stretch: 0.03, fade: 0.7 });
    }
  }

  function impactEvent(input: ShotEventInput, recipe: ShotRecipe) {
    const c = cell();
    const x = input.x;
    const z = input.y;
    const ground = deps.groundHeight(x, z);
    const y = ground + deps.bodyHeight();
    const dx = Math.cos(input.angle);
    const dz = Math.sin(input.angle);
    const hit = recipe.hit;
    const tier = recipe.tier;
    const colors = tier >= 3 ? [recipe.core, recipe.color, recipe.accent] : [recipe.core, recipe.color];
    const area = input.radius && input.radius > 0 ? input.radius : 0;
    // Ortak: beyaz-sicak sert parlama, tonun halesi, yerde renkli isik.
    // Firtinada parlama kucuk: elektrik kollari okunmali.
    flare(x, y, z, hit.flash * c * (recipe.impact === "storm" ? 0.55 : 1), recipe.core, 55 + tier * 15);
    light.spawn({ x, y, z, color: recipe.color, size: hit.flash * c * 0.8, sizeTo: hit.flash * c * 1.9, lifeMs: 170 + tier * 40, shape: SHAPE.glow, fade: 1.6, alpha: 0.65 });
    groundGlow(x, z, Math.max(hit.groundGlow * c, area * 1.1), recipe.color, 260 + tier * 80);
    sparkBurst(x, y, z, count(hit.sparks), hit.speed, colors, { dirX: dx, dirZ: dz, bias: 0.45 });
    for (let index = 0; index < count(hit.debris); index += 1) {
      const theta = rand() * Math.PI * 2;
      const v = c * (1.4 + rand() * 2.2);
      matter.spawn({
        x, y, z,
        vx: (Math.cos(theta) * 0.6 + dx * 0.4) * v, vy: c * (1.6 + rand() * 2.2), vz: (Math.sin(theta) * 0.6 + dz * 0.4) * v,
        color: index % 3 === 0 ? whiten(recipe.color, 0.2) : 0x8a8f99,
        size: c * (0.035 + rand() * 0.035),
        lifeMs: 700 + rand() * 500,
        shape: SHAPE.chip,
        gravity: c * 14,
        drag: 0.6,
        fade: 3,
        bounce: true,
        stretch: 0.004,
        spin: rand() * 6
      });
    }
    for (let index = 0; index < count(hit.embers); index += 1) {
      light.spawn({
        x: x + (rand() - 0.5) * c * 0.5, y: y + (rand() - 0.5) * c * 0.3, z: z + (rand() - 0.5) * c * 0.5,
        vx: (rand() - 0.5) * c * 0.8, vy: c * (0.4 + rand() * 0.9), vz: (rand() - 0.5) * c * 0.8,
        color: index % 2 === 0 ? recipe.color : recipe.core,
        size: c * 0.03, sizeTo: c * 0.012,
        lifeMs: 800 + rand() * 700,
        shape: SHAPE.glow,
        drag: 1.2,
        gravity: -c * 0.2,
        fade: 1.2
      });
    }
    if (hit.smoke > 0) smokePuffs(x, y - c * 0.1, z, count(hit.smoke), 0.55 + tier * 0.12);
    for (let ring = 0; ring < hit.rings; ring += 1) {
      const to = area > 0 ? area * (1 - ring * 0.18) : c * (0.7 + ring * 0.32) * (tier >= 3 ? 1.25 : 1);
      groundRing(x, z, c * 0.15, to, ring === 2 ? recipe.accent : recipe.color, 300 + ring * 60, ring * 55);
    }
    if (hit.scorch) {
      matter.spawn({ x, y: ground + 0.5, z, color: 0x050506, alpha: 0.6, size: c * (0.35 + tier * 0.1), sizeTo: c * (0.42 + tier * 0.12), lifeMs: 2600, shape: SHAPE.scorch, fade: 1.8, spin: rand() * 6 });
      light.spawn({ x, y: ground + 0.6, z, color: whiten(recipe.color, 0.1), alpha: 0.5, size: c * (0.28 + tier * 0.08), sizeTo: c * 0.18, lifeMs: 900, shape: SHAPE.groundGlow, fade: 2 });
    }

    switch (recipe.impact) {
      case "lock": {
        // Kilit: capraz dort kose, ucuna dogru sivrilen sert cizgiler; yer halkasi iceri daraliyor.
        for (let k = 0; k < 4; k += 1) {
          const a = input.angle + Math.PI / 4 + (k * Math.PI) / 2;
          const reach = c * (0.55 + tier * 0.15);
          streak(x, y, z, x + Math.cos(a) * reach, y, z + Math.sin(a) * reach, c * 0.07, recipe.core, 110 + tier * 20);
        }
        groundRing(x, z, c * (1.1 + tier * 0.2), c * 0.3, recipe.color, 260, 0, 0.9);
        if (tier >= 2) groundRing(x, z, c * 0.9, c * 0.2, recipe.accent, 220, 70, 0.8, SHAPE.hex);
        if (hit.pillar) streak(x, ground + 0.5, z, x, y + c * 2.4, z, c * 0.12, recipe.color, 260, 0, 0.9, 1);
        break;
      }
      case "uplink": {
        // Gokten inen sutun ve gercek yaricapta sok halkasi; kademe 3'te ikinci sutun ve elektrik.
        const top = y + c * (3.5 + tier);
        streak(x, top, z, x, ground + 0.5, z, c * (0.22 + tier * 0.08), recipe.color, 200 + tier * 40, 0, 1, 1.2);
        streak(x, top, z, x, ground + 0.5, z, c * (0.06 + tier * 0.02), recipe.core, 140 + tier * 30, 0, 0.8);
        for (let index = 0; index < count(6 + tier * 4); index += 1) {
          light.spawn({ x: x + (rand() - 0.5) * c * 0.3, y: top - rand() * c, z: z + (rand() - 0.5) * c * 0.3, vy: -c * (14 + rand() * 6), color: recipe.core, size: c * 0.05, lifeMs: 160, shape: SHAPE.spark, stretch: 0.02, fade: 1 });
        }
        groundRing(x, z, c * 0.2, Math.max(area, c * 1.4), recipe.core, 360, 0, 1);
        if (hit.pillar) {
          streak(x, top + c, z, x, ground + 0.5, z, c * 0.42, recipe.color, 320, 90, 0.45, 1.6);
          groundRing(x, z, c * 0.3, Math.max(area, c * 1.4) * 1.25, recipe.accent, 420, 120, 0.8);
          flare(x, ground + c * 0.3, z, hit.flash * c, recipe.color, 80, 90);
        }
        break;
      }
      case "contain": {
        // Altigen kafes: yerde altigen, koselerinden yukselen cubuklar.
        const size = c * (0.75 + tier * 0.15);
        groundRing(x, z, size * 1.4, size, recipe.color, 520, 0, 1, SHAPE.hex);
        for (let k = 0; k < 6; k += 1) {
          const a = (k * Math.PI) / 3 + Math.PI / 6;
          const px = x + Math.cos(a) * size * 0.72;
          const pz = z + Math.sin(a) * size * 0.72;
          streak(px, ground + 0.5, pz, px, ground + c * (0.5 + tier * 0.18), pz, c * 0.06, recipe.core, 300 + tier * 60, k * 18, 0.95);
        }
        if (tier >= 2) groundRing(x, z, size * 0.6, size * 1.2, recipe.accent, 380, 180, 0.8, SHAPE.hex);
        if (hit.pillar) streak(x, ground + 0.5, z, x, y + c * 1.8, z, c * 0.3, recipe.color, 340, 120, 0.6, 1);
        break;
      }
      case "collapse": {
        // Ice cokus: kurede dogan parcaciklar merkeze cekiliyor, sonra gecikmeli patlama.
        const n = count(10 + tier * 6);
        for (let index = 0; index < n; index += 1) {
          const theta = rand() * Math.PI * 2;
          const phi = Math.acos(rand() * 2 - 1);
          const reach = c * (0.8 + tier * 0.15);
          const ox = Math.sin(phi) * Math.cos(theta) * reach;
          const oy = Math.cos(phi) * reach * 0.7;
          const oz = Math.sin(phi) * Math.sin(theta) * reach;
          light.spawn({ x: x + ox, y: y + oy, z: z + oz, vx: -ox * 6, vy: -oy * 6, vz: -oz * 6, color: index % 2 ? recipe.color : recipe.accent, size: c * 0.05, lifeMs: 170, shape: SHAPE.spark, stretch: 0.03, fade: 0.6, fadeIn: 0.3 });
        }
        matter.spawn({ x, y, z, color: 0x05010a, alpha: 0.75, size: c * 0.55, sizeTo: c * 0.1, lifeMs: 200, shape: SHAPE.smoke, fade: 0.8 });
        flare(x, y, z, hit.flash * c * 1.3, recipe.accent, 90, 170);
        groundRing(x, z, c * 1.3, c * 0.15, recipe.color, 200, 0, 0.9);
        groundRing(x, z, c * 0.2, c * (1.1 + tier * 0.25), recipe.accent, 300, 170, 0.9);
        if (hit.pillar) sparkBurst(x, y, z, count(18), 5, [recipe.accent, recipe.core], { up: 0.2, life: 420 });
        break;
      }
      case "storm": {
        // Kirik elektrik kollari: rastgele yuruyen kisa isin parcalari, iki dalga.
        const arms = count(3 + tier * 2);
        for (let wave = 0; wave < (tier >= 2 ? 2 : 1); wave += 1) {
          for (let arm = 0; arm < arms; arm += 1) {
            let px = x;
            let py = y;
            let pz = z;
            const heading = rand() * Math.PI * 2;
            for (let step = 0; step < 5; step += 1) {
              const a = heading + (rand() - 0.5) * 1.4;
              const len = c * (0.24 + rand() * 0.2) * (1 + tier * 0.2);
              const nx = px + Math.cos(a) * len;
              const nz = pz + Math.sin(a) * len;
              const ny = Math.max(ground + 1, py + (rand() - 0.55) * len);
              streak(px, py, pz, nx, ny, nz, c * (0.09 - step * 0.01), arm % 2 ? recipe.color : recipe.accent, 130 + rand() * 70, wave * 80 + step * 12);
              px = nx; py = ny; pz = nz;
            }
          }
        }
        flare(x, y, z, hit.flash * c * 0.6, recipe.accent, 50, 80);
        if (hit.pillar) {
          // Yere inen yildirim.
          streak(x, y + c * 2.5, z, x + (rand() - 0.5) * c * 0.4, ground + 0.5, z + (rand() - 0.5) * c * 0.4, c * 0.12, 0xffffff, 120, 40);
          groundRing(x, z, c * 0.2, c * 1.6, recipe.accent, 320, 40, 0.9);
        }
        break;
      }
      case "pierce": {
        // Ucus yonune dik ince kesik; kademe 3'te capraz ikinci kesik ve ileri kristal yelpazesi.
        const nx = -dz;
        const nz = dx;
        const half = c * (0.55 + tier * 0.12);
        streak(x - nx * half, y + half * 0.35, z - nz * half, x + nx * half, y - half * 0.35, z + nz * half, c * 0.1, recipe.core, 170 + tier * 30);
        if (tier >= 3) streak(x - nx * half, y - half * 0.35, z - nz * half, x + nx * half, y + half * 0.35, z + nz * half, c * 0.08, recipe.accent, 190, 40);
        sparkBurst(x, y, z, count(6 + tier * 4), 6, [recipe.color, recipe.core], { dirX: dx, dirZ: dz, bias: 0.85, up: 0.05, life: 260, stretch: 0.06, gravity: 2 });
        break;
      }
      default:
        if (hit.pillar) {
          flare(x, y, z, hit.flash * c * 1.6, recipe.accent, 90, 80);
          sparkBurst(x, y, z, count(16), hit.speed * 1.3, [recipe.accent, recipe.core], { up: 0.3, life: 460 });
        }
    }
  }

  function beamHitEvent(input: ShotEventInput, recipe: ShotRecipe) {
    const c = cell();
    const x = input.x;
    const z = input.y;
    const y = deps.groundHeight(x, z) + deps.bodyHeight();
    const now = performance.now();
    const key = input.key ?? `${Math.round(x)}:${Math.round(z)}`;
    // Surekli lazer saniyede onlarca temas: kivilcim ve yanik izi kisitli.
    flare(x, y, z, recipe.hit.flash * c * 0.6, recipe.core, 50);
    const last = lastBeamSparkAt.get(key) ?? 0;
    if (now - last < 70) return;
    lastBeamSparkAt.set(key, now);
    if (lastBeamSparkAt.size > 400) lastBeamSparkAt = new Map();
    sparkBurst(x, y, z, count(4 + recipe.tier * 2), 4.5, recipe.beam === "laser" ? [0xffd8a8, recipe.color, recipe.core] : [recipe.core, recipe.color], { dirX: -Math.cos(input.angle), dirZ: -Math.sin(input.angle), bias: 0.5, life: 300 });
    groundGlow(x, z, c * (0.8 + recipe.tier * 0.3), recipe.color, 160, 0.55);
    if (recipe.beam === "laser" && rand() < 0.35) {
      matter.spawn({ x, y: deps.groundHeight(x, z) + 0.5, z, color: 0x050506, alpha: 0.45, size: c * 0.22, sizeTo: c * 0.28, lifeMs: 1600, shape: SHAPE.scorch, fade: 2, spin: rand() * 6 });
    }
  }

  function event(kind: ShotEventKind, input: ShotEventInput) {
    if (!visible) return;
    const recipe = getShotRecipe(input.definitionId, input.tier, input.fallbackColor);
    if (kind === "muzzle") muzzleEvent(input, recipe);
    else if (kind === "anticipation") anticipationEvent(input, recipe);
    else if (kind === "impact") impactEvent(input, recipe);
    else beamHitEvent(input, recipe);
  }

  /* ------------------------------- mermiler ------------------------------ */

  function projectiles(list: readonly ShotProjectileInput[]) {
    if (!visible) return;
    const c = cell();
    const now = performance.now();
    for (const flight of flights.values()) flight.seen = false;
    for (const projectile of list) {
      if (projectile.source !== "tower") continue;
      const recipe = getShotRecipe(projectile.definitionId, projectile.tier);
      let flight = flights.get(projectile.id);
      if (!flight) {
        const root = makeBody(recipe);
        const start = muzzlePoint(projectile.x, projectile.y);
        flight = {
          id: projectile.id, recipe, root, material: bodyMaterial(root),
          startY: start.y, startX: projectile.x, startZ: projectile.y,
          x: projectile.x, y: start.y, z: projectile.y,
          traveled: 0, seen: true, seed: hash01(projectile.id), trailCarry: 0
        };
        flight.material.color.setHex(recipe.color);
        flight.material.emissive.setHex(recipe.color);
        group.add(root);
        flights.set(projectile.id, flight);
      }
      flight.seen = true;
      const step = Math.hypot(projectile.x - flight.x, projectile.y - flight.z);
      flight.traveled += step;
      // Namludan govdeye: iki hucrede govdenin yuksekligine iniyor; paket kavisle.
      const settle = 1 - Math.exp(-flight.traveled / (c * 1.6));
      const goal = targetHeight(projectile.x, projectile.y);
      const lob = recipe.arc * c * Math.sin(Math.PI * Math.min(1, flight.traveled / (c * 3.4)));
      const y = flight.startY + (goal - flight.startY) * settle + lob;
      const px = flight.x;
      const py = flight.y;
      const pz = flight.z;
      flight.x = projectile.x;
      flight.y = y;
      flight.z = projectile.y;
      // Yon: son adimdan (yukseklik dahil); duruyorsa hizdan.
      if (step > 0.001) TMP_DIR.set(flight.x - px, flight.y - py, flight.z - pz);
      else TMP_DIR.set(projectile.vx ?? 1, 0, projectile.vy ?? 0);
      if (TMP_DIR.lengthSq() < 1e-6) TMP_DIR.set(1, 0, 0);
      TMP_DIR.normalize();
      TMP_Q.setFromUnitVectors(UP, TMP_DIR);
      const body = recipe.body;
      if (body.spin !== 0) {
        SPIN_Q.setFromAxisAngle(UP, (now / 1000) * body.spin * Math.PI * 2 + flight.seed * 6);
        TMP_Q.multiply(SPIN_Q);
      }
      flight.root.quaternion.copy(TMP_Q);
      flight.root.position.set(flight.x, flight.y, flight.z);
      const pulse = recipe.shape === "arc" ? 0.85 + 0.3 * Math.sin(now / 28 + flight.seed * 40) : 1;
      flight.root.scale.set(body.width * c * pulse, body.length * c, body.width * c * pulse);
      // Govdenin halesi (tek kare) ve izi (yol boyunca).
      light.spawn({ x: flight.x, y: flight.y, z: flight.z, color: recipe.color, size: c * (0.26 + recipe.tier * 0.07) * pulse, lifeMs: 0, shape: SHAPE.glow, alpha: 0.7 });
      light.spawn({ x: flight.x, y: flight.y, z: flight.z, color: recipe.core, size: c * 0.1 * pulse, lifeMs: 0, shape: SHAPE.glow, alpha: 0.9 });
      if (recipe.tier >= 3) light.spawn({ x: flight.x, y: flight.y, z: flight.z, color: recipe.accent, size: c * 0.5, lifeMs: 0, shape: SHAPE.glow, alpha: 0.35 });
      emitTrail(flight, px, py, pz, step, recipe, now);
    }
    for (const [id, flight] of flights) {
      if (flight.seen) continue;
      releaseBody(flight);
      flights.delete(id);
    }
  }

  function emitTrail(flight: Flight, px: number, py: number, pz: number, step: number, recipe: ShotRecipe, now: number) {
    if (step <= 0) return;
    const c = cell();
    flight.trailCarry += (step / c) * recipe.trail.density * 12 * budget();
    const n = Math.min(12, Math.floor(flight.trailCarry));
    flight.trailCarry -= n;
    const trail = recipe.trail;
    for (let index = 0; index < n; index += 1) {
      const t = (index + rand()) / Math.max(1, n);
      let x = px + (flight.x - px) * t;
      let y = py + (flight.y - py) * t;
      let z = pz + (flight.z - pz) * t;
      if (recipe.shape === "cell") {
        // Sarmal iz: govdenin cevresinde donen ikiz serit.
        const phase = now / 70 + flight.seed * 10 + index;
        const dirx = flight.x - px;
        const dirz = flight.z - pz;
        const len = Math.hypot(dirx, dirz) || 1;
        x += (-dirz / len) * Math.cos(phase) * c * 0.12;
        z += (dirx / len) * Math.cos(phase) * c * 0.12;
        y += Math.sin(phase) * c * 0.12;
      }
      light.spawn({
        x, y, z,
        vx: (rand() - 0.5) * c * 0.2, vy: (rand() - 0.2) * c * 0.2, vz: (rand() - 0.5) * c * 0.2,
        color: index % 3 === 0 ? recipe.core : recipe.color,
        alpha: 0.85,
        size: trail.size * c, sizeTo: trail.size * c * 0.15,
        lifeMs: trail.lifeMs * (0.75 + rand() * 0.5),
        shape: SHAPE.glow,
        drag: 2,
        fade: 1.2
      });
      if (rand() < trail.sparkle) {
        light.spawn({
          x, y, z,
          vx: (rand() - 0.5) * c * 1.6, vy: (rand() - 0.1) * c * 1.4, vz: (rand() - 0.5) * c * 1.6,
          color: recipe.tier >= 3 ? recipe.accent : recipe.core,
          size: c * 0.025, lifeMs: 260, shape: SHAPE.spark, stretch: 0.05, drag: 2.5, gravity: c * 3, fade: 1
        });
      }
    }
  }

  /* -------------------------------- isinlar ------------------------------- */

  function beams(list: readonly ShotBeamInput[]) {
    if (!visible) return;
    const c = cell();
    const now = performance.now();
    const time = now / 1000;
    for (const beam of list) {
      const recipe = getShotRecipe(beam.definitionId, beam.tier, beam.color);
      const look = recipe.beamLook;
      const start = muzzlePoint(beam.x1, beam.y1);
      const points: THREE.Vector3[] = [start];
      const bounces = beam.b ?? [];
      for (let index = 0; index + 1 < bounces.length; index += 2) points.push(new THREE.Vector3(bounces[index], targetHeight(bounces[index], bounces[index + 1]), bounces[index + 1]));
      points.push(new THREE.Vector3(beam.x2, targetHeight(beam.x2, beam.y2), beam.y2));
      const flicker = 1 + Math.sin(time * 61 + hash01(beam.id) * 9) * look.flicker;
      const base = Math.max(beam.width, c * 0.08);
      const glowWidth = Math.min(base * look.glow, c * 2.4) * flicker;
      const coreWidth = Math.max(base * look.core * 2, c * 0.05);
      const flow = recipe.beam === "wave" ? 0.7 : recipe.beam === "laser" ? 1 + recipe.tier * 0.3 : 0.5;
      for (let index = 0; index + 1 < points.length; index += 1) {
        const a = points[index];
        const b = points[index + 1];
        light.spawn({ x: a.x, y: a.y, z: a.z, ex: b.x, ey: b.y, ez: b.z, color: recipe.color, alpha: 0.75, size: glowWidth, lifeMs: 0, shape: SHAPE.beam, stretch: flow });
        light.spawn({ x: a.x, y: a.y, z: a.z, ex: b.x, ey: b.y, ez: b.z, color: recipe.core, alpha: 1, size: coreWidth, lifeMs: 0, shape: SHAPE.beam });
        // Akan nabizlar: kademeyle artiyor (Kin'de dalga, lazerde isi).
        const pulses = recipe.beam === "wave" ? 3 + look.pulses : look.pulses;
        for (let k = 0; k < pulses; k += 1) {
          const t = (time * (recipe.beam === "wave" ? 1.4 : 2.6) + k / Math.max(1, pulses)) % 1;
          light.spawn({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, color: k % 2 ? recipe.accent : recipe.core, size: glowWidth * 0.7, lifeMs: 0, shape: SHAPE.glow, alpha: 0.7 });
        }
      }
      const end = points[points.length - 1];
      // Uclar: namluda ve temasta parlama; kademe 3 lazerde temas cevresinde donen halka.
      light.spawn({ x: start.x, y: start.y, z: start.z, color: recipe.core, size: coreWidth * 3.2 * flicker, lifeMs: 0, shape: SHAPE.glow, alpha: 0.9 });
      light.spawn({ x: end.x, y: end.y, z: end.z, color: recipe.color, size: glowWidth * 1.3, lifeMs: 0, shape: SHAPE.glow, alpha: 0.9 });
      light.spawn({ x: end.x, y: end.y, z: end.z, color: 0xffffff, size: coreWidth * 2.4 * flicker, lifeMs: 0, shape: SHAPE.flare, alpha: 0.9, spin: time * 3 });
      light.spawn({ x: end.x, y: deps.groundHeight(end.x, end.z) + 0.7, z: end.z, color: recipe.color, size: c * (0.7 + recipe.tier * 0.25), lifeMs: 0, shape: SHAPE.groundGlow, alpha: 0.55 });
      if (recipe.tier >= 3) light.spawn({ x: end.x, y: deps.groundHeight(end.x, end.z) + 0.8, z: end.z, color: recipe.accent, size: c * 0.7, lifeMs: 0, shape: SHAPE.groundRing, alpha: 0.7, spin: time * 2 });
    }
  }

  /* -------------------------------- kare --------------------------------- */

  function update(now: number) {
    const dt = Math.min(80, Math.max(0, now - lastNow));
    lastNow = now;
    const time = now / 1000;
    light.material.uniforms.uTime.value = time;
    matter.material.uniforms.uTime.value = time;
    light.step(dt, deps.groundHeight);
    matter.step(dt, deps.groundHeight);
  }

  function clear() {
    light.clear();
    matter.clear();
    for (const flight of flights.values()) releaseBody(flight);
    flights.clear();
  }

  function setVisible(next: boolean) {
    if (visible === next) return;
    visible = next;
    group.visible = next;
    if (!next) clear();
  }

  function dispose() {
    clear();
    scene.remove(group);
    light.dispose();
    matter.dispose();
    for (const pool of pools.values()) for (const root of pool) root.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== pupilMaterial) (mesh.material as THREE.Material).dispose();
    });
    pools.clear();
    pupilMaterial.dispose();
    for (const geometry of Object.values(geometries)) geometry.dispose();
  }

  return {
    event, projectiles, beams, update, setVisible, clear, dispose,
    stats: () => ({ light: light.count, matter: matter.count, projectiles: flights.size })
  };
}
