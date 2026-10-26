/**
 * Metal Kalkan'in (AttackLord, yuva 1) egik 3D gorunumu: 3D enerji kalkani.
 *
 * Sahadaki kalkan cizginin uzerinde dikilen saydam enerji duvari: yaklasik
 * bir hucre boyunda, icinde soluk altigen orgu, alt ve ust kenarda parlak
 * enerji hatti, yukari akan tarama bandi. Iki ucta yayici dikme, zeminde
 * engelledigi cizgi boyunca parlak serit. Acilis ve kapanis 2D'deki gibi
 * (`getMetalShieldExtent`): baslangictan uca acilip ayni yoldan toplaniyor.
 * Surukleme onizlemesi ve birakilan kalkanin yankisi ayni duvarin soluk hali
 * (cekilemeyecek onizleme kirmizi).
 *
 * Yalnizca gorunus: engelleme ve omur sunucuda.
 */
import * as THREE from "three";

export type Shield3dInput = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Baslangictan uca acik kesir (0..1). */
  extent: number;
  /** Butun cizimin saydamligi (onizleme ve yanki soluk). */
  alpha: number;
  /** Cekilemeyecek onizleme: kirmizi. */
  invalid?: boolean;
  /** Onizleme azami boyda: uc dikmesi parlak. */
  maxed?: boolean;
};

export type EnergyShields = {
  sync(list: readonly Shield3dInput[]): void;
  /** Her karede (egik gorunum): tarama bandi ve titresim. */
  update(now: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
};

type Deps = {
  cellSize(): number;
  groundHeight(x: number, z: number): number;
};

/** Kalkanin boyu (hucre): piyadenin govdesini ortuyor, kulelerden alcak. */
const WALL_HEIGHT_CELLS = 1.05;
/** Enerji: soguk camgobegi (2D'nin kenar tonu, `METAL_SHIELD_EDGE_COLOR`, daha parlak). */
const SHIELD_COLOR = 0x67d8ea;
const INVALID_COLOR = 0xe0564a;

const WALL_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const WALL_FRAGMENT = `
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
uniform vec2 uSize;
varying vec2 vUv;
// Altigen orgu: en yakin altigen merkezinden kenara kalan pay (kenarda 0).
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 h = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 f = vec4(p - h.xy * s, p - (h.zw + 0.5) * s);
  vec2 q = dot(f.xy, f.xy) < dot(f.zw, f.zw) ? f.xy : f.zw;
  q = abs(q);
  return 0.5 - max(dot(q, s * 0.5), q.x);
}
void main() {
  vec2 w = vUv * uSize;
  float h = vUv.y;
  float grid = 1.0 - smoothstep(0.0, 0.06, hexEdge(w / (uSize.y * 0.22) + vec2(0.0, uTime * 0.08)));
  float bottom = 1.0 - smoothstep(0.0, 0.07, h);
  float top = smoothstep(0.91, 0.99, h) * (1.0 - smoothstep(0.99, 1.0, h));
  float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(0.0, 0.03, 1.0 - vUv.x);
  float band = fract(h - uTime * 0.5) - 0.5;
  float scan = exp(-band * band * 90.0);
  float shimmer = 0.85 + 0.15 * sin(w.x * 0.3 + uTime * 3.1 + h * 5.0);
  float fill = (0.07 + 0.16 * (1.0 - h)) * shimmer;
  float a = (fill + grid * 0.26 * (0.5 + 0.5 * (1.0 - h)) + top * 0.85 + bottom * 0.7 + scan * 0.14) * ends * uAlpha;
  vec3 c = uColor * (0.9 + grid * 0.5 + top * 1.3 + bottom * 0.8 + scan * 0.4);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STRIP_FRAGMENT = `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(0.0, 0.03, 1.0 - vUv.x);
  float a = across * across * 0.55 * ends * uAlpha;
  gl_FragColor = vec4(uColor * 1.2, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type Entry = {
  group: THREE.Group;
  wall: THREE.Mesh;
  wallMaterial: THREE.ShaderMaterial;
  strip: THREE.Mesh;
  stripMaterial: THREE.ShaderMaterial;
  posts: [THREE.Group, THREE.Group];
  capMaterial: THREE.MeshStandardMaterial;
  seen: boolean;
};

export function createEnergyShields(scene: THREE.Scene, deps: Deps): EnergyShields {
  const root = new THREE.Group();
  root.name = "energy-shields";
  scene.add(root);
  const plane = new THREE.PlaneGeometry(1, 1);
  const postGeometry = new THREE.CylinderGeometry(0.055, 0.075, 1, 8);
  const capGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x1a222b, roughness: 0.5, metalness: 0.6 });
  const entries = new Map<string, Entry>();
  const color = new THREE.Color();
  let time = 0;

  function makePost(capMaterial: THREE.MeshStandardMaterial) {
    const post = new THREE.Group();
    const body = new THREE.Mesh(postGeometry, postMaterial);
    body.position.y = 0.5;
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = 1.0;
    const band = new THREE.Mesh(capGeometry, capMaterial);
    band.position.y = 0.35;
    band.scale.set(1.05, 0.6, 1.05);
    post.add(body, cap, band);
    return post;
  }

  function create(): Entry {
    const wallMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uAlpha: { value: 1 }, uSize: { value: new THREE.Vector2(1, 1) } },
      vertexShader: WALL_VERTEX,
      fragmentShader: WALL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const wall = new THREE.Mesh(plane, wallMaterial);
    wall.renderOrder = 11;
    const stripMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 } },
      vertexShader: WALL_VERTEX,
      fragmentShader: STRIP_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const strip = new THREE.Mesh(plane, stripMaterial);
    strip.rotation.x = -Math.PI / 2;
    strip.renderOrder = 11;
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1015, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.4 });
    const posts: [THREE.Group, THREE.Group] = [makePost(capMaterial), makePost(capMaterial)];
    const group = new THREE.Group();
    group.add(wall, strip, posts[0], posts[1]);
    root.add(group);
    return { group, wall, wallMaterial, strip, stripMaterial, posts, capMaterial, seen: true };
  }

  function release(entry: Entry) {
    root.remove(entry.group);
    entry.wallMaterial.dispose();
    entry.stripMaterial.dispose();
    entry.capMaterial.dispose();
  }

  function sync(list: readonly Shield3dInput[]) {
    const c = deps.cellSize();
    for (const entry of entries.values()) entry.seen = false;
    for (const shield of list) {
      const dx = shield.x2 - shield.x1;
      const dz = shield.y2 - shield.y1;
      const full = Math.hypot(dx, dz);
      const extent = Math.max(0, Math.min(1, shield.extent));
      if (!(full > 0) || extent <= 0 || shield.alpha <= 0) continue;
      let entry = entries.get(shield.id);
      if (!entry) {
        entry = create();
        entries.set(shield.id, entry);
      }
      entry.seen = true;
      const ux = dx / full;
      const uz = dz / full;
      const length = full * extent;
      const ex = shield.x1 + ux * length;
      const ez = shield.y1 + uz * length;
      const mx = (shield.x1 + ex) / 2;
      const mz = (shield.y1 + ez) / 2;
      const ground = Math.max(deps.groundHeight(shield.x1, shield.y1), deps.groundHeight(ex, ez), deps.groundHeight(mx, mz));
      const height = c * WALL_HEIGHT_CELLS;
      const yaw = Math.atan2(-uz, ux);
      // Acilirken parlakligi da acikligiyla geliyor (cizgi gibi parlayip kaybolmasin).
      const alpha = shield.alpha * Math.min(1, extent * 3);
      color.setHex(shield.invalid ? INVALID_COLOR : SHIELD_COLOR);

      entry.wall.position.set(mx, ground + height / 2, mz);
      entry.wall.rotation.set(0, yaw, 0);
      entry.wall.scale.set(length, height, 1);
      entry.wallMaterial.uniforms.uColor.value.copy(color).multiplyScalar(1.25);
      entry.wallMaterial.uniforms.uAlpha.value = alpha;
      entry.wallMaterial.uniforms.uSize.value.set(length, height);

      entry.strip.position.set(mx, ground + 0.5, mz);
      entry.strip.rotation.set(-Math.PI / 2, 0, yaw);
      entry.strip.scale.set(length, Math.max(5, c * 0.2) * 1.6, 1);
      entry.stripMaterial.uniforms.uColor.value.copy(color);
      entry.stripMaterial.uniforms.uAlpha.value = alpha;

      const postHeight = height * 1.1;
      const postScale = c;
      entry.posts[0].position.set(shield.x1, ground, shield.y1);
      entry.posts[1].position.set(ex, ground, ez);
      for (const post of entry.posts) post.scale.set(postScale, postHeight, postScale);
      entry.capMaterial.emissive.copy(color).multiplyScalar((shield.maxed ? 2.4 : 1.6) * Math.max(0.35, alpha));
    }
    for (const [id, entry] of entries) {
      if (entry.seen) continue;
      release(entry);
      entries.delete(id);
    }
  }

  function update(now: number) {
    time = (now / 1000) % 1000;
    for (const entry of entries.values()) entry.wallMaterial.uniforms.uTime.value = time;
  }

  function setVisible(visible: boolean) {
    root.visible = visible;
    if (!visible) sync([]);
  }

  function dispose() {
    sync([]);
    scene.remove(root);
    plane.dispose();
    postGeometry.dispose();
    capGeometry.dispose();
    postMaterial.dispose();
  }

  return { sync, update, setVisible, dispose };
}
