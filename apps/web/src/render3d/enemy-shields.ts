/**
 * Kalkanli dusmanin kalkani (egik 3D gorunum): govdeyi saran enerji kabugu.
 *
 * 2D'de ayagin cevresinde mavi halka (dolgu ve kenar kalkanin kalaniyla
 * kuvvetleniyor). 3D'de govdenin ortasinda, onu saran saydam kure: kenardan
 * bakildikca parlayan cember (kenar isigi), yuzeyinde soluk ve yavas kayan
 * altigen orgu. Kalkanin kalani kadar kuvvetli; her vurusta kisa bir parlama
 * (kalan azaldi), sifira inince kabuk parcalanip sacilir (`onBreak`).
 *
 * Yalnizca gorunus: kalkanin degeri sunucuda.
 */
import * as THREE from "three";

export type EnemyShield3dInput = {
  id: string;
  /** Govdenin ortasi (dunya). */
  x: number;
  y: number;
  z: number;
  /** Kabugun yatay ve dikey yaricapi. */
  radius: number;
  radiusY: number;
  /** Kalkanin kalani (0..1). */
  ratio: number;
};

export type EnemyShields = {
  sync(list: readonly EnemyShield3dInput[]): void;
  /** Her karede (egik gorunum): orgunun kaymasi, vurus parlamasinin sonmesi. */
  update(now: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
};

/** Kalkanin tonu: 2D halkanin gok mavisi (`0x60a5fa` kenar, `0x38bdf8` dolgu). */
export const ENEMY_SHIELD_COLOR = 0x5ab4fa;
/** Vurus parlamasinin sonme suresi (ms). */
const FLASH_MS = 220;

const VERTEX = `
varying vec3 vNormalView;
varying vec3 vViewDir;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = `
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
uniform float uFlash;
varying vec3 vNormalView;
varying vec3 vViewDir;
varying vec3 vLocal;
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 h = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 f = vec4(p - h.xy * s, p - (h.zw + 0.5) * s);
  vec2 q = dot(f.xy, f.xy) < dot(f.zw, f.zw) ? f.xy : f.zw;
  q = abs(q);
  return 0.5 - max(dot(q, s * 0.5), q.x);
}
void main() {
  float facing = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float rim = pow(1.0 - facing, 2.4);
  vec2 sp = vec2(atan(vLocal.z, vLocal.x) * 1.9 + uTime * 0.25, vLocal.y * 3.0);
  float grid = 1.0 - smoothstep(0.0, 0.08, hexEdge(sp * 1.3));
  float a = (0.05 + rim * 0.7 + grid * 0.14 * (0.35 + rim)) * uStrength + uFlash * (0.22 + rim * 0.55);
  vec3 c = uColor * (0.85 + rim * 1.3 + grid * 0.3 + uFlash * 1.6);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type Entry = { mesh: THREE.Mesh; material: THREE.ShaderMaterial; ratio: number; flashAt: number; seen: boolean; x: number; y: number; z: number; radius: number };

export function createEnemyShields(scene: THREE.Scene, onBreak: (x: number, y: number, z: number, radius: number) => void): EnemyShields {
  const group = new THREE.Group();
  group.name = "enemy-shields";
  scene.add(group);
  const geometry = new THREE.SphereGeometry(1, 28, 18);
  const entries = new Map<string, Entry>();
  let time = 0;
  let now = performance.now();

  function create(): Entry {
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(ENEMY_SHIELD_COLOR).multiplyScalar(1.2) }, uTime: { value: 0 }, uStrength: { value: 1 }, uFlash: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 6;
    group.add(mesh);
    return { mesh, material, ratio: 1, flashAt: -Infinity, seen: true, x: 0, y: 0, z: 0, radius: 1 };
  }

  function release(id: string, entry: Entry) {
    group.remove(entry.mesh);
    entry.material.dispose();
    entries.delete(id);
  }

  function sync(list: readonly EnemyShield3dInput[]) {
    for (const entry of entries.values()) entry.seen = false;
    for (const shield of list) {
      let entry = entries.get(shield.id);
      if (shield.ratio <= 0) {
        // Kalkan kirildi (dusman hala sahada): kabuk parcalaniyor.
        if (entry) {
          onBreak(entry.x, entry.y, entry.z, entry.radius);
          release(shield.id, entry);
        }
        continue;
      }
      if (!entry) {
        entry = create();
        entries.set(shield.id, entry);
      } else if (shield.ratio < entry.ratio - 1e-4) {
        entry.flashAt = now;
      }
      entry.seen = true;
      entry.ratio = shield.ratio;
      entry.x = shield.x;
      entry.y = shield.y;
      entry.z = shield.z;
      entry.radius = shield.radius;
      entry.mesh.position.set(shield.x, shield.y, shield.z);
      entry.mesh.scale.set(shield.radius, shield.radiusY, shield.radius);
      entry.material.uniforms.uStrength.value = 0.35 + 0.65 * shield.ratio;
    }
    // Listede olmayan: dusman oldu ya da gitti (olum patlamasi zaten var).
    for (const [id, entry] of entries) if (!entry.seen) release(id, entry);
  }

  function update(next: number) {
    now = next;
    time = (next / 1000) % 1000;
    for (const entry of entries.values()) {
      entry.material.uniforms.uTime.value = time;
      entry.material.uniforms.uFlash.value = Math.max(0, 1 - (next - entry.flashAt) / FLASH_MS);
    }
  }

  function setVisible(visible: boolean) {
    group.visible = visible;
    if (!visible) for (const [id, entry] of entries) release(id, entry);
  }

  function dispose() {
    for (const [id, entry] of entries) release(id, entry);
    scene.remove(group);
    geometry.dispose();
  }

  return { sync, update, setVisible, dispose };
}
