/**
 * Vitrin: 2D oyunun yakin plan anlarinda tek bir 3D model (operator secimi;
 * ileride zafer ekrani, kademe karti, kule incelemesi).
 *
 * Studyo isigi (aydinlik dolgu, yumusak sicak ana isik, kimlik renginde kenar
 * isigi), altinda yumusak golge ve kimlik renginde parlayan halka. Model
 * yavasca donuyor; yatay surukleme elle donduruyor (dikey kaydirma sayfanin).
 * Hareket azaltma acikken donmuyor, yalnizca surukleniyor.
 *
 * Tek WebGL baglami: butun vitrinler ayni cizicide, sahneler kendi 2D
 * tuvallerine kopyalaniyor (menu HTML'i her gorunum degisiminde yeniden
 * yazilsa da baglam kaybolmuyor, modeller bir kez iniyor). Yalnizca ekranda
 * gorunen vitrin ve onde olan sekmede, en cok saniyede 30 kare ciziyor.
 * Gorunen vitrin kalmayinca (mac basladi, menu gizli) cizici birkac saniye
 * sonra birakiliyor, vitrin yeniden gorununce kuruluyor.
 *
 * three.js iceriyor: yalnizca `showcase-mount.ts`'in dinamik importuyla, ilk
 * vitrin acilinca yukleniyor (2D oyunun baslangici indirmiyor).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type ShowcaseSpec = {
  /** Modelin adresi (`assetUrl`'li). */
  url: string;
  /** Kimlik rengi: yerdeki halka ve kenar isigi. */
  accent: number;
  /** Modelin yuzunun yonu: yuz +X'teyse -pi/2 (kameraya donsun). */
  yawOffset?: number;
  /** Suzulen beden: hafif inip kalkiyor. */
  float?: boolean;
  /** Model yuklendi ve ilk kare cizildi (2D resim solabilir). */
  onReady?: () => void;
  /** Model yuklenemedi ya da cizici kurulamadi: 2D kaliyor. */
  onFail?: () => void;
};

export type ShowcaseHandle = { dispose(): void };

type Slot = {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Donen tabla: modelin yonu ve suzulmesi. */
  pivot: THREE.Group;
  /** Modelin en genis yatay olcusu (boyu 1): kamera dondukce de sigsin. */
  span: number;
  spec: ShowcaseSpec;
  yaw: number;
  dragging: boolean;
  dragX: number;
  resumeAt: number;
  visible: boolean;
  ready: boolean;
  disposed: boolean;
  owned: { dispose(): void }[];
  observer?: IntersectionObserver;
  seed: number;
};

/** Donus hizi (radyan / sn) ve surukledikten sonra kendiliginden donmenin beklemesi (ms). */
const SPIN = 0.38;
const RESUME_MS = 1600;
/** Kare araligi: en cok ~30 kare (pil). */
const FRAME_MS = 1000 / 31;
/** Kamera: dar aci (az bozulma), hafif yukaridan; model yuksekligi 1, cevresinde pay. */
const FOV = 26;
const ELEVATION = 0.17;
const MARGIN = 1.36;
/** Gorunen vitrin olmadan bu kadar sonra cizici (WebGL baglami) birakiliyor. */
const IDLE_RELEASE_MS = 4000;

let renderer: THREE.WebGLRenderer | undefined;
let environment: THREE.Texture | undefined;
let broken = false;
let bufferWidth = 0;
let bufferHeight = 0;
const loader = new GLTFLoader();
const models = new Map<string, Promise<THREE.Object3D>>();
const slots = new Set<Slot>();
let frame = 0;
let lastAt = 0;
let lastShownAt = 0;
let shadowTexture: THREE.Texture | undefined;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function ensureRenderer() {
  if (renderer || broken) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    broken = true;
    return undefined;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  const pmrem = new THREE.PMREMGenerator(renderer);
  environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  // Baglam kaybolursa butun vitrinler 2D'ye donuyor (yeniden kurmaya calismiyor).
  // Bosta birakilan cizicinin kaybi sayilmiyor.
  const canvas = renderer.domElement;
  canvas.addEventListener("webglcontextlost", () => {
    if (renderer?.domElement !== canvas) return;
    broken = true;
    for (const slot of [...slots]) fail(slot);
  });
  // Birakilip yeniden kurulduysa acik sahneler yeni ortam isigini alsin.
  for (const slot of slots) slot.scene.environment = environment;
  return renderer;
}

/** Ciziciyi ve baglamini birakiyor; modeller bellekte, ilk cizimde yeniden yukleniyor. */
function releaseRenderer() {
  if (!renderer) return;
  const retired = renderer;
  renderer = undefined;
  environment?.dispose();
  environment = undefined;
  bufferWidth = bufferHeight = 0;
  retired.dispose();
  retired.forceContextLoss();
}

/** Yumusak golge: ortasi koyu, kenari saydam daire. */
function shadow() {
  if (shadowTexture) return shadowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,0.85)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.42)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  shadowTexture = new THREE.CanvasTexture(canvas);
  return shadowTexture;
}

function loadModel(url: string): Promise<THREE.Object3D> {
  const cached = models.get(url);
  if (cached) return cached;
  const pending: Promise<THREE.Object3D> = loader.loadAsync(url).then((gltf: { scene: THREE.Object3D }) => gltf.scene);
  // Inmezse bir dahaki vitrin yeniden denesin.
  pending.catch(() => models.delete(url));
  models.set(url, pending);
  return pending;
}

/** Modeli boyu 1 olacak sekilde olcekleyip tabani yere, ortasi eksene. */
function place(source: THREE.Object3D) {
  const model = source.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1 / Math.max(size.y, 1e-3);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  return { model, width: Math.max(size.x, size.z) * scale };
}

function stage(slot: Slot, accent: number) {
  const scene = slot.scene;
  scene.environment = environment;
  scene.environmentIntensity = 0.55;
  const rim = new THREE.Color(accent).lerp(new THREE.Color(0xffffff), 0.35);
  scene.add(new THREE.HemisphereLight(0xe9efff, 0x2a2438, 1.15));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.3);
  key.position.set(-1.6, 2.6, 2.2);
  const back = new THREE.DirectionalLight(rim, 1.9);
  back.position.set(1.9, 1.5, -2.4);
  scene.add(key, back);

  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadow(), transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), shadowMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.15), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.6, 72), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  const glowMaterial = new THREE.MeshBasicMaterial({ map: shadow(), color: new THREE.Color(accent), transparent: true, depthWrite: false, opacity: 0.32, blending: THREE.AdditiveBlending, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.78, 40), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.003;
  scene.add(glow, floor, ring);
  slot.owned.push(shadowMaterial, ringMaterial, glowMaterial, floor.geometry, ring.geometry, glow.geometry);
}

/** Kamera modelin boyunu ve enini (dondukce en genis hali) pay birakarak kapliyor. */
function frameCamera(slot: Slot, width: number) {
  const rect = slot.host.getBoundingClientRect();
  const aspect = Math.max(0.2, rect.width / Math.max(1, rect.height));
  const camera = slot.camera;
  camera.aspect = aspect;
  const half = Math.tan((FOV * Math.PI) / 360);
  const distance = Math.max((MARGIN / 2) / half, ((width * MARGIN) / 2) / (half * aspect));
  camera.position.set(0, 0.5 + Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance);
  camera.lookAt(0, 0.5, 0);
  camera.updateProjectionMatrix();
}

function draw(slot: Slot) {
  const active = ensureRenderer();
  if (!active) return;
  const rect = slot.host.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (slot.canvas.width !== width || slot.canvas.height !== height) {
    slot.canvas.width = width;
    slot.canvas.height = height;
    frameCamera(slot, slot.span);
  }
  // Cizicinin tamponu en buyuk vitrin kadar (yalnizca buyuyor).
  if (width > bufferWidth || height > bufferHeight) {
    bufferWidth = Math.max(bufferWidth, width);
    bufferHeight = Math.max(bufferHeight, height);
    active.setSize(bufferWidth, bufferHeight, false);
  }
  active.setViewport(0, 0, width, height);
  active.setScissor(0, 0, width, height);
  active.clear();
  active.render(slot.scene, slot.camera);
  // GL'de goruntu alanin alt kosesinde: tuvalin alt seridinden kopya.
  slot.context.clearRect(0, 0, width, height);
  slot.context.drawImage(active.domElement, 0, bufferHeight - height, width, height, 0, 0, width, height);
}

function advance(slot: Slot, dt: number, now: number) {
  if (!slot.dragging && now >= slot.resumeAt && !reducedMotion()) slot.yaw += SPIN * dt;
  slot.pivot.rotation.y = slot.yaw;
  slot.pivot.position.y = slot.spec.float && !reducedMotion() ? Math.sin(now / 620 + slot.seed) * 0.022 + 0.03 : 0;
}

function loop(now: number) {
  frame = 0;
  if (slots.size === 0 && !renderer) return;
  frame = requestAnimationFrame(loop);
  if (document.hidden || now - lastAt < FRAME_MS) return;
  const dt = lastAt ? Math.min(0.1, (now - lastAt) / 1000) : 0;
  lastAt = now;
  let shown = false;
  for (const slot of [...slots]) {
    if (!slot.host.isConnected) {
      release(slot);
      continue;
    }
    if (!slot.ready || !slot.visible) continue;
    shown = true;
    advance(slot, dt, now);
    draw(slot);
  }
  if (shown) {
    lastShownAt = now;
  } else if (now - lastShownAt > IDLE_RELEASE_MS) {
    // Ekranda vitrin yok: dongu duruyor, baglam birakiliyor (gorununce yeniden).
    releaseRenderer();
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

function ensureLoop() {
  if (frame || slots.size === 0) return;
  lastShownAt = performance.now();
  frame = requestAnimationFrame(loop);
}

function release(slot: Slot) {
  if (slot.disposed) return;
  slot.disposed = true;
  slots.delete(slot);
  slot.observer?.disconnect();
  for (const item of slot.owned) item.dispose();
  slot.canvas.remove();
}

function fail(slot: Slot) {
  slot.spec.onFail?.();
  release(slot);
}

function bindDrag(slot: Slot) {
  const canvas = slot.canvas;
  canvas.addEventListener("pointerdown", (event) => {
    slot.dragging = true;
    slot.dragX = event.clientX;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!slot.dragging) return;
    slot.yaw += (event.clientX - slot.dragX) * 0.013;
    slot.dragX = event.clientX;
  });
  const end = () => {
    if (!slot.dragging) return;
    slot.dragging = false;
    slot.resumeAt = performance.now() + RESUME_MS;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("lostpointercapture", end);
}

/**
 * `host` icinde vitrin: tuvali en uste ekliyor, model inince ilk kareyi cizip
 * `onReady` cagiriyor (2D resim o zaman soluyor). Host sayfadan cikinca
 * kendiliginden kalkiyor.
 */
export function mountShowcase(host: HTMLElement, spec: ShowcaseSpec): ShowcaseHandle {
  const active = ensureRenderer();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!active || !context) {
    spec.onFail?.();
    return { dispose() {} };
  }
  canvas.className = "showcase__canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const slot: Slot = {
    host, canvas, context, spec,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(FOV, 1, 0.05, 50),
    pivot: new THREE.Group(),
    span: 1,
    // Ucte bir yandan (yuz ve yan birlikte okunuyor).
    yaw: 0.55,
    dragging: false, dragX: 0, resumeAt: 0,
    visible: true, ready: false, disposed: false,
    owned: [],
    seed: Math.random() * 10
  };
  stage(slot, spec.accent);
  slot.scene.add(slot.pivot);
  bindDrag(slot);
  if (typeof IntersectionObserver === "function") {
    slot.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) slot.visible = entry.isIntersecting;
      if (slot.visible && slot.ready) ensureLoop();
    });
    slot.observer.observe(host);
  }
  slots.add(slot);
  loadModel(spec.url).then((source) => {
    if (slot.disposed) return;
    const { model, width } = place(source);
    const facing = new THREE.Group();
    facing.rotation.y = spec.yawOffset ?? 0;
    facing.add(model);
    slot.pivot.add(facing);
    slot.span = width;
    frameCamera(slot, width);
    slot.ready = true;
    advance(slot, 0, performance.now());
    draw(slot);
    spec.onReady?.();
    ensureLoop();
  }).catch(() => fail(slot));
  return { dispose: () => release(slot) };
}
