/**
 * 3D kule katmani.
 *
 * Phaser tuvalinin ustunde, tiklamalari geciren seffaf bir three.js tuvali.
 * Katman yalnizca okuyor -- snapshot'taki kulelerin yeri, kademesi ve yonu --
 * sunucuya hicbir sey gondermiyor. Iki gorunum:
 *
 * - "top": kamera tam tepeden ve Phaser kamerasinin dunya gorunumune kilitli.
 *   3D kule 2D hucresine birebir oturuyor; geri kalan her sey Phaser'in kendi
 *   tuvalinde, oldugu gibi.
 * - "angled": Phaser'in cizdigi zemin karesi doku olarak bir tahtaya
 *   seriliyor ve 3D kuleler onun ustunde ayakta duruyor. Kamera on izlemedeki
 *   yorunge kamerasi gibi serbest: donus, egim, yakinlasma ve kaydirma
 *   (`rotateCamera`, `tiltCamera`, `zoomCamera`, `panCamera`; jestler
 *   camera-gestures). Isik ve kule golgeleri on izlemeden. Dusmanlar Phaser'da
 *   cizilmiyor; sprite'larinin son hali kameraya donuk panolar olarak burada
 *   ayakta (`syncEnemies`). Mermi, isin ve vurus efektleri Phaser'in ikinci
 *   kamerasiyla ayni tuvale ikinci kez ciziliyor ve tahtanin `airHeight`
 *   ustundeki ayri bir duzleme seriliyor (`captureBoard`). Phaser tuvali
 *   gorunmez ama girdiyi almaya devam ediyor; dokunma `clientToWorld` ile
 *   egimden geri cozuluyor (GameScene).
 *
 * Bu modul yalnizca 3D acikken dinamik olarak yukleniyor (GameScene): 2D
 * oyuncunun paketine three.js girmiyor.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  ANGLED_ELEVATION_DEGREES,
  ANGLED_ELEVATION_RANGE,
  ANGLED_ZOOM_RANGE,
  angledFrustum,
  angledGroundToScreen,
  angledScreenToGround,
  clampOrbit,
  orbitBasis,
  orthoFromWorldView,
  standeeCenterHeight,
  towerModelPath,
  yawFromFacing,
  type OrbitView,
  type TowerTier
} from "./tower-math";
import { createZoneHeight, edgeSlopeHeight, terrainShade, type TerrainInput } from "./terrain";

export type Tower3dInput = {
  id: string;
  definitionId: string;
  tier: TowerTier;
  x: number;
  y: number;
  /** Kare kulesinde oyunun yonu; kenar rayinda kullanilmiyor. */
  facing?: number;
  /** Kare kulesinde model olcegi (`towerModelScale`); kenar rayinda `edgeModelTransform`. */
  scale: number;
  /** Kenar rayinin sabit donusu; varsa `facing` yerine. */
  fixedYaw?: number;
};

/** Phaser'daki dusman sprite'inin son hali: pano onu birebir kopyaliyor. */
export type Enemy3dInput = {
  id: string;
  /** Phaser dokusunun anahtari ve tek kaynak gorseli. */
  textureKey: string;
  image: HTMLImageElement | HTMLCanvasElement;
  /** Karenin gorseldeki dikdortgeni ve gorselin boyu (piksel). */
  frame: { x: number; y: number; width: number; height: number; sourceWidth: number; sourceHeight: number };
  /** Ayagin zemindeki yeri (dunya). */
  x: number;
  y: number;
  /** Ekrandaki boy (dunya birimi; ezilme dahil). */
  width: number;
  height: number;
  /** Phaser donusu (ekranda saat yonu). */
  rotation: number;
  alpha: number;
  tint: number;
  /** Vurus flasi: doku tonla dolduruluyor (`setTintFill`). */
  fill: boolean;
  /** Ezilmesiz boy: panonun alt kenari bu boya gore ayaga oturuyor. */
  size: number;
  /** Ucan dusmanin ek yuksekligi. */
  extraLift: number;
  /** Can cubugu (2D'deki `drawEnemyHealthBar`in aynisi, panonun basinin ustunde). */
  bar?: EnemyBar;
  /** Ayaktaki golgenin yaricapi ve opakligi. */
  shadowRadius: number;
  shadowAlpha: number;
};

export type EnemyBar = {
  /** Can ve kalkan orani (0-1); kalkan yoksa -1. */
  hp: number;
  shield: number;
  /** Cubugun genisligi ve satir yuksekligi (dunya birimi). */
  width: number;
  row: number;
  champion: boolean;
};

export type OrbitState = { yaw: number; elevation: number; zoom: number };

export type WorldView = { x: number; y: number; width: number; height: number };

/** Phaser ana kamerasinin tuvaldeki yeri (oyun boyutu birimlerinde) ve oyun boyutu. */
export type PhaserViewport = { x: number; y: number; width: number; height: number; gameWidth: number; gameHeight: number };

export type LayerView = "top" | "angled";

type Instance = { key: string; root: THREE.Object3D; yaw: THREE.Object3D | undefined };
type Standee = { mesh: THREE.Mesh; material: THREE.ShaderMaterial; shadow: THREE.Mesh; bar: THREE.Mesh; barMaterial: THREE.ShaderMaterial; textureKey: string };

// Kameraya donuk pano: merkez modelin konumunda, koseler goruntu duzleminde.
// Renk Phaser'daki gibi ham (renk uzayi donusumu yok): carpimli ton ya da flasta doldurma.
const STANDEE_VERTEX = `
uniform vec2 uSize;
uniform float uRotation;
varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 p = position.xy * uSize;
  float c = cos(uRotation);
  float s = sin(uRotation);
  mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
}`;
const STANDEE_FRAGMENT = `
uniform sampler2D uMap;
uniform vec4 uFrame;
uniform vec3 uTint;
uniform float uAlpha;
uniform float uFill;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(uMap, uFrame.xy + vUv * uFrame.zw);
  float alpha = texel.a * uAlpha;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(mix(texel.rgb * uTint, uTint, uFill), alpha);
}`;

// Can cubugu: panonun merkezinden ekranda yukari kaydirilmis kameraya donuk serit.
const BAR_VERTEX = `
uniform vec2 uBox;
uniform float uOffset;
varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uBox + vec2(0.0, uOffset + uBox.y * 0.5);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
}`;
// Renkler 2D'deki gibi: koyu zemin 0x020617, can 0xef4444, kalkan 0x38bdf8, sampiyon cercevesi 0xb33a3a.
const BAR_FRAGMENT = `
uniform vec2 uBox;
uniform float uWidth;
uniform float uRow;
uniform float uHp;
uniform float uShield;
uniform float uChampion;
varying vec2 vUv;
void main() {
  vec2 p = vUv * uBox;
  vec3 color = vec3(0.008, 0.024, 0.090);
  float alpha = 0.92;
  if (uChampion > 0.5 && (p.x < 0.8 || p.x > uBox.x - 0.8 || p.y < 0.8 || p.y > uBox.y - 0.8)) {
    color = vec3(0.702, 0.227, 0.227);
    alpha = 0.95;
  }
  float x = p.x - 1.5;
  float hpRow = uBox.y - 1.5 - uRow;
  if (x >= 0.0 && x <= uWidth * uHp && p.y >= hpRow && p.y <= hpRow + uRow) {
    color = vec3(0.937, 0.267, 0.267);
    alpha = 1.0;
  }
  float shieldRow = hpRow - 2.0 - uRow;
  if (uShield >= 0.0 && x >= 0.0 && x <= uWidth * uShield && p.y >= shieldRow && p.y <= shieldRow + uRow) {
    color = vec3(0.220, 0.741, 0.973);
    alpha = 1.0;
  }
  gl_FragColor = vec4(color, alpha);
}`;

/** Kulelerin tepesine pay: egik kesitte uzun kuleler ust kenardan tasmasin (dunya birimi). */
const TOWER_HEADROOM = 70;

export type TowerLayer = {
  /** Snapshot'in kuleleri. Donen kume: modeli yuklenmis ve gorunen kuleler (2D govdeleri gizlenebilir). */
  sync(towers: readonly Tower3dInput[]): ReadonlySet<string>;
  /** Egik gorunumde ayakta cizilecek dusmanlar (bos liste: hepsi kalkar). */
  syncEnemies(enemies: readonly Enemy3dInput[]): void;
  /**
   * Efekt duzlemi bu boydaki (piyade) bir panonun merkez yuksekliginde: mermi
   * ve vuruslar ayakta duran govdeye denk gelsin. Yukseklik kamera egimiyle degisiyor.
   */
  setAirBodySize(size: number): void;
  /** Egik kamera: ekran noktasi cevresinde donus (radyan), egim (derece), yakinlasma (carpan), kaydirma. */
  rotateCamera(radians: number, clientX: number, clientY: number): void;
  tiltCamera(degrees: number): void;
  zoomCamera(factor: number, clientX: number, clientY: number): void;
  panCamera(fromX: number, fromY: number, toX: number, toY: number): void;
  resetCamera(): void;
  getCameraState(): OrbitState;
  /**
   * Egik gorunumde, Phaser ana kamerasi zemini cizdikten hemen sonra: tuval o
   * an tahtanin dokusuna aliniyor. Ardindan cizilen (efekt kamerasi) ayri duzleme.
   */
  captureBoard(): void;
  /**
   * Arazi (render3d/terrain): yasak bolgeler tepe ya da cukur, arenanin
   * yanlarinda kayalik yamac. `groundImage` haritanin zemin resmi (yamaclarin dokusu).
   */
  setTerrain(terrain: (TerrainInput & { groundImage?: HTMLImageElement | HTMLCanvasElement }) | undefined): void;
  setView(view: LayerView): void;
  getView(): LayerView;
  /**
   * Her karede, Phaser karesinden hemen sonra. `canvasRect` Phaser tuvalinin
   * ekrandaki dikdortgeni; `viewport` ana kameranin tuvaldeki yeri; `view`
   * kameranin dunya gorunumu.
   */
  render(canvasRect: DOMRect, viewport: PhaserViewport, view: WorldView): void;
  /** Egik gorunumde ekran noktasi -> zemindeki dunya noktasi; tepeden gorunumde `undefined`. */
  clientToWorld(clientX: number, clientY: number): { x: number; y: number } | undefined;
  /** Egik gorunumde dunya noktasi -> ekran noktasi (DOM etiketleri icin); tepeden gorunumde `undefined`. */
  worldToClient(x: number, y: number, height?: number): { x: number; y: number } | undefined;
  dispose(): void;
};

export function createTowerLayer(options: { host: HTMLElement; source: HTMLCanvasElement; resolveUrl: (path: string) => string; onModelReady: () => void; view: LayerView }): TowerLayer {
  const canvas = document.createElement("canvas");
  canvas.className = "tower-layer-3d";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "absolute", pointerEvents: "none", left: "0px", top: "0px" });
  options.host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Isik on izlemeden (tools/3d-preview/src/main.js): pozlama, yarim kure, gunes, kenar isigi, golge.
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Golge haritasi yalnizca kuleler degisince (yer, kademe, taret donusu) ve en
  // cok uc karede bir yeniden ciziliyor: her karede kulelerin ikinci bir cizimi demekti.
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.55;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xc7e3ed, 0x424b38, 1.5));
  // Gunes on izlemedeki yonde, (-6, 14, 8): sol-onden ~54 derece; golgeler kulenin
  // arkasina (kameradan uzaga) dusuyor, egik kamerada gorunuyor.
  const sun = new THREE.DirectionalLight(0xffe4bb, 3.0);
  const sunLength = Math.hypot(-6, 14, 8);
  const sunDirection = { x: -6 / sunLength, y: 14 / sunLength, z: 8 / sunLength };
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 4000;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x7cb9d4, 1.4);
  rim.position.set(4, 5, -9);
  scene.add(rim);

  // Egik gorunumun tahtasi: Phaser'in karesi doku olarak; ton eslemesi yok ki 2D'deki renkler birebir kalsin.
  const boardTexture = new THREE.CanvasTexture(options.source);
  boardTexture.colorSpace = THREE.SRGBColorSpace;
  boardTexture.minFilter = THREE.LinearFilter;
  boardTexture.generateMipmaps = false;
  // Tahtanin agi dunya koordinatlarinda (arazinin yuksekligi ve isik golgesi koselerde, `ensureTerrain`).
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: boardTexture, toneMapped: false, vertexColors: true }));
  // Kule tabanlari (y = 0) ile yarismasin.
  board.position.y = -0.4;
  board.renderOrder = -1;
  scene.add(board);

  // Kule golgelerini tahtaya dusuren seffaf duzlem (golge disinda hicbir sey cizmiyor).
  const shadowCatcher = new THREE.Mesh(board.geometry, new THREE.ShadowMaterial({ opacity: 0.38, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  shadowCatcher.position.y = -0.4;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  // Arenanin yanlarindaki kayalik yamaclar ve her seyin altindaki zemin (yalnizca egik gorunumde).
  const slopeMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1, metalness: 0 });
  const slopes = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), slopeMaterial);
  slopes.castShadow = slopes.receiveShadow = true;
  slopes.visible = false;
  scene.add(slopes);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: 0x10181a, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  // Cukurlarin dibinin de altinda.
  floor.position.y = -80;
  floor.receiveShadow = true;
  floor.visible = false;
  scene.add(floor);
  // Yasak bolgelerin kayalik yuzeyi: tahtanin bolge karelerindeki parcasi, isikli ve golgeli.
  const zoneMaterial = new THREE.MeshStandardMaterial({ color: 0x9c948a, roughness: 1, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const zoneSurface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), zoneMaterial);
  zoneSurface.castShadow = zoneSurface.receiveShadow = true;
  zoneSurface.position.y = -0.4;
  zoneSurface.visible = false;
  scene.add(zoneSurface);
  let terrain: (TerrainInput & { groundImage?: HTMLImageElement | HTMLCanvasElement }) | undefined;
  let zoneHeight: (x: number, z: number) => number = () => 0;
  let terrainKey = "";
  let groundTexture: THREE.Texture | undefined;
  const sunVector = (() => {
    const length = Math.hypot(-6, 14, 8);
    return { x: -6 / length, y: 14 / length, z: 8 / length };
  })();

  /**
   * Dunya koordinatlarinda yatay ag: `height` koselerin yuksekligi, `uv` doku
   * koordinati, `shade` (verilirse) kose rengi olarak isik golgesi.
   */
  function buildGrid(x0: number, z0: number, width: number, depth: number, step: number, height: (x: number, z: number) => number, uv: (x: number, z: number) => [number, number], shade: boolean, keep?: (x: number, z: number) => boolean) {
    const columns = Math.max(1, Math.ceil(width / step));
    const rowsCount = Math.max(1, Math.ceil(depth / step));
    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    for (let r = 0; r <= rowsCount; r += 1) {
      for (let c = 0; c <= columns; c += 1) {
        const x = x0 + (width * c) / columns;
        const z = z0 + (depth * r) / rowsCount;
        positions.push(x, height(x, z), z);
        uvs.push(...uv(x, z));
        if (shade) {
          const value = terrainShade(height, x, z, step, sunVector);
          colors.push(value, value, value);
        }
      }
    }
    const indices: number[] = [];
    for (let r = 0; r < rowsCount; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const a = r * (columns + 1) + c;
        const b = a + 1;
        const d = a + columns + 1;
        const e = d + 1;
        if (keep && !keep(x0 + (width * (c + 0.5)) / columns, z0 + (depth * (r + 0.5)) / rowsCount)) continue;
        indices.push(a, d, b, b, d, e);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    if (shade) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /** Tahta, golge duzlemi ve yamaclar: dunya gorunumu ya da arazi degisince yeniden. */
  function ensureTerrain(world: WorldView) {
    const key = `${world.x},${world.y},${world.width},${world.height}|${terrain ? `${terrain.cols}x${terrain.rows}:${terrain.cellSize}:${terrain.originX},${terrain.originY}:${terrain.zoneCells.join(",")}` : "-"}`;
    if (key === terrainKey) return;
    terrainKey = key;
    const cell = terrain?.cellSize ?? 34;
    const boardGeometry = buildGrid(world.x, world.y, world.width, world.height, cell / 4, zoneHeight,
      (x, z) => [(x - world.x) / world.width, 1 - (z - world.y) / world.height], true);
    board.geometry.dispose();
    board.geometry = boardGeometry;
    shadowCatcher.geometry = boardGeometry;
    zoneSurface.geometry.dispose();
    if (terrain && terrain.zoneCells.length > 0) {
      const zones = new Set(terrain.zoneCells);
      const t = terrain;
      const inZone = (x: number, z: number) => {
        const col = Math.floor((x - t.originX) / t.cellSize);
        const row = Math.floor((z - t.originY) / t.cellSize);
        return col >= 0 && row >= 0 && col < t.cols && row < t.rows && zones.has(row * t.cols + col);
      };
      const tile = t.cols * t.cellSize;
      // Dunya olcekli kaya dokusu; kose rengi yalnizca cukurun derinlik karartmasi (isik malzemeden).
      zoneSurface.geometry = buildGrid(world.x, world.y, world.width, world.height, cell / 4, zoneHeight,
        (x, z) => [x / (tile * 0.5), -z / (tile * 0.75)], true, inZone);
    } else {
      zoneSurface.geometry = new THREE.PlaneGeometry(1, 1);
    }
    slopes.geometry.dispose();
    if (terrain) {
      const arena = { left: terrain.originX, right: terrain.originX + terrain.cols * cell };
      const reach = cell * 9;
      const top = world.y - cell * 14;
      const depth = world.height + cell * 28;
      const tile = arena.right - arena.left;
      const uv = (x: number, z: number): [number, number] => [x / tile, -z / (tile * 1.5)];
      const height = (x: number, z: number) => edgeSlopeHeight(x, z, arena, cell);
      const left = buildGrid(arena.left - reach, top, reach, depth, cell / 2.5, height, uv, false);
      const right = buildGrid(arena.right, top, reach, depth, cell / 2.5, height, uv, false);
      slopes.geometry = mergeGrids(left, right);
      left.dispose();
      right.dispose();
    } else {
      slopes.geometry = new THREE.PlaneGeometry(1, 1);
    }
  }

  function mergeGrids(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
    const merged = new THREE.BufferGeometry();
    for (const name of ["position", "uv", "normal"]) {
      const first = a.getAttribute(name);
      const second = b.getAttribute(name);
      const array = new Float32Array(first.array.length + second.array.length);
      array.set(first.array, 0);
      array.set(second.array, first.array.length);
      merged.setAttribute(name, new THREE.Float32BufferAttribute(array, first.itemSize));
    }
    const offset = a.getAttribute("position").count;
    const indices = [...a.getIndex().array, ...[...b.getIndex().array].map((index: number) => index + offset)];
    merged.setIndex(indices);
    return merged;
  }

  function setTerrain(next: (TerrainInput & { groundImage?: HTMLImageElement | HTMLCanvasElement }) | undefined) {
    terrain = next;
    zoneHeight = next ? createZoneHeight(next) : () => 0;
    terrainKey = "";
    const image = next?.groundImage;
    if (image && groundTexture?.image !== image) {
      groundTexture?.dispose();
    shadowCatcher.material.dispose();
      groundTexture = new THREE.Texture(image);
      groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
      groundTexture.colorSpace = THREE.SRGBColorSpace;
      groundTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      groundTexture.needsUpdate = true;
      slopeMaterial.map = groundTexture;
      slopeMaterial.needsUpdate = true;
      zoneMaterial.map = groundTexture;
      zoneMaterial.needsUpdate = true;
    }
  }

  // Efekt duzlemi: ayni tuvalin ikinci kopyasi, zemin alindiktan sonra cizilen
  // mermi, isin ve vuruslar. Her seyin ustunde (2D'deki gibi kulelerin de);
  // yuksekligi efektleri ayakta duran dusmanin govdesine kaldiriyor.
  const airTexture = new THREE.CanvasTexture(options.source);
  airTexture.colorSpace = THREE.SRGBColorSpace;
  airTexture.minFilter = THREE.LinearFilter;
  airTexture.generateMipmaps = false;
  // Phaser tuvalinin alfasi yok: efektler siyaha temizlenmis tuvalde. "Ekran"
  // karisimi (C + D - C*D) siyahi hic eklemiyor, isigi tahtaya bindiriyor.
  const air = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: airTexture, toneMapped: false, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor
  }));
  air.rotation.x = -Math.PI / 2;
  air.renderOrder = 10;
  air.visible = false;
  scene.add(air);
  let boardCaptured = false;

  // Panolarin dokulari (Phaser anahtariyla) ve ayak golgesi.
  const standeeTextures = new Map<string, { image: HTMLImageElement | HTMLCanvasElement; texture: THREE.Texture }>();
  const standees = new Map<string, Standee>();
  const standeeGeometry = new THREE.PlaneGeometry(1, 1);
  const shadowGeometry = new THREE.CircleGeometry(1, 24);
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext("2d");
  if (shadowContext) {
    const gradient = shadowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(0.55, "rgba(0,0,0,0.6)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 64, 64);
  }
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);

  const loader = new GLTFLoader();
  const requested = new Set<string>();
  const loaded = new Map<string, THREE.Object3D>();
  const instances = new Map<string, Instance>();
  const visible = new Set<string>();
  let view: LayerView = options.view;
  let airBodySize = 0;
  const orbit: OrbitState & { target?: { x: number; z: number } } = { yaw: 0, elevation: ANGLED_ELEVATION_DEGREES, zoom: 1 };
  // Son karenin tuval dikdortgeni ve Phaser'in dunya gorunumu (tahtanin kapsadigi alan).
  let lastRect: DOMRect | undefined;
  let lastWorld: WorldView | undefined;
  let disposed = false;

  /** Model bir kez isteniyor; gelince bir sonraki `sync` kuleyi kuruyor. */
  function request(key: string) {
    if (requested.has(key)) return;
    requested.add(key);
    loader.loadAsync(options.resolveUrl(key)).then((gltf: { scene: THREE.Object3D }) => {
      if (disposed) return;
      gltf.scene.traverse((node: THREE.Object3D) => {
        if ((node as THREE.Mesh).isMesh) node.castShadow = node.receiveShadow = true;
      });
      loaded.set(key, gltf.scene);
      options.onModelReady();
    }).catch((error: unknown) => {
      // Yuklenemeyen model: o kule 2D kalir, oyun etkilenmez.
      console.warn("3D tower model could not load", key, error);
    });
  }

  function sync(towers: readonly Tower3dInput[]) {
    markShadows(towers);
    const active = new Set<string>();
    visible.clear();
    for (const tower of towers) {
      active.add(tower.id);
      const key = towerModelPath(tower.definitionId, tower.tier);
      const source = loaded.get(key);
      if (!source) {
        request(key);
        continue;
      }
      let instance = instances.get(tower.id);
      if (instance && instance.key !== key) {
        scene.remove(instance.root);
        instance = undefined;
      }
      if (!instance) {
        // Kopya geometri ve malzemeyi paylasiyor: ayni kuleden kac tane olursa olsun tek GPU kaynagi.
        const root = source.clone(true);
        instance = { key, root, yaw: root.getObjectByName("turret-yaw") };
        instances.set(tower.id, instance);
        scene.add(root);
        shadowDirty = true;
      }
      instance.root.position.set(tower.x, 0, tower.y);
      instance.root.scale.setScalar(tower.scale);
      if (tower.fixedYaw !== undefined) {
        instance.root.rotation.y = tower.fixedYaw;
      } else if (instance.yaw && typeof tower.facing === "number") {
        instance.yaw.rotation.y = yawFromFacing(tower.facing);
      }
      visible.add(tower.id);
    }
    for (const [id, instance] of instances) {
      if (!active.has(id)) {
        scene.remove(instance.root);
        instances.delete(id);
        shadowDirty = true;
      }
    }
    return visible;
  }

  function standeeTexture(input: Enemy3dInput) {
    const cached = standeeTextures.get(input.textureKey);
    if (cached && cached.image === input.image) return cached.texture;
    cached?.texture.dispose();
    const texture = new THREE.Texture(input.image);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    standeeTextures.set(input.textureKey, { image: input.image, texture });
    return texture;
  }

  function removeStandee(id: string, standee: Standee) {
    scene.remove(standee.mesh);
    scene.remove(standee.shadow);
    scene.remove(standee.bar);
    standee.barMaterial.dispose();
    standee.material.dispose();
    standee.shadow.material.dispose();
    standees.delete(id);
  }

  function syncEnemies(enemies: readonly Enemy3dInput[]) {
    const active = new Set<string>();
    for (const enemy of enemies) {
      active.add(enemy.id);
      let standee = standees.get(enemy.id);
      if (!standee) {
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: null },
            uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
            uSize: { value: new THREE.Vector2(1, 1) },
            uRotation: { value: 0 },
            uTint: { value: new THREE.Color(1, 1, 1) },
            uAlpha: { value: 1 },
            uFill: { value: 0 }
          },
          vertexShader: STANDEE_VERTEX,
          fragmentShader: STANDEE_FRAGMENT,
          transparent: true,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(standeeGeometry, material);
        // Koseler golgelendiricide aciliyor: sinir kuresi gercek boyu bilmiyor.
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        const shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false, color: 0x000000 }));
        shadow.rotation.x = -Math.PI / 2;
        const barMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uBox: { value: new THREE.Vector2(1, 1) },
            uOffset: { value: 0 },
            uWidth: { value: 1 },
            uRow: { value: 2 },
            uHp: { value: 1 },
            uShield: { value: -1 },
            uChampion: { value: 0 }
          },
          vertexShader: BAR_VERTEX,
          fragmentShader: BAR_FRAGMENT,
          transparent: true,
          depthTest: false,
          depthWrite: false
        });
        const bar = new THREE.Mesh(standeeGeometry, barMaterial);
        bar.frustumCulled = false;
        // 2D'deki gibi her seyin ustunde (efekt duzleminin de).
        bar.renderOrder = 11;
        standee = { mesh, material, shadow, bar, barMaterial, textureKey: "" };
        standees.set(enemy.id, standee);
        scene.add(mesh);
        scene.add(shadow);
        scene.add(bar);
      }
      const uniforms = standee.material.uniforms;
      if (standee.textureKey !== enemy.textureKey || !uniforms.uMap.value) {
        uniforms.uMap.value = standeeTexture(enemy);
        standee.textureKey = enemy.textureKey;
      }
      // Doku flipY: v = 1 gorselin ustu.
      const frame = enemy.frame;
      uniforms.uFrame.value.set(frame.x / frame.sourceWidth, 1 - (frame.y + frame.height) / frame.sourceHeight, frame.width / frame.sourceWidth, frame.height / frame.sourceHeight);
      uniforms.uSize.value.set(enemy.width, enemy.height);
      // Phaser'da y asagi, goruntu duzleminde yukari: donus ters.
      uniforms.uRotation.value = -enemy.rotation;
      uniforms.uTint.value.setRGB(((enemy.tint >> 16) & 255) / 255, ((enemy.tint >> 8) & 255) / 255, (enemy.tint & 255) / 255);
      uniforms.uAlpha.value = enemy.alpha;
      uniforms.uFill.value = enemy.fill ? 1 : 0;
      const lift = standeeCenterHeight(enemy.size, orbit.elevation) + enemy.extraLift;
      // Tepeye tirmaniyor, cukura iniyor (arazi yalnizca gorunus).
      const ground = zoneHeight(enemy.x, enemy.y);
      standee.mesh.position.set(enemy.x, ground + lift, enemy.y);
      const bar = enemy.bar;
      standee.bar.visible = Boolean(bar);
      if (bar) {
        const rows = bar.shield >= 0 ? 2 * bar.row + 2 : bar.row;
        const box = { x: bar.width + 3, y: rows + 3 };
        const barUniforms = standee.barMaterial.uniforms;
        barUniforms.uBox.value.set(box.x, box.y);
        // Alt kenari panonun tepesinin 4 birim ustunde (ekranda).
        barUniforms.uOffset.value = Math.max(enemy.width, enemy.height) / 2 + 4;
        barUniforms.uWidth.value = bar.width;
        barUniforms.uRow.value = bar.row;
        barUniforms.uHp.value = bar.hp;
        barUniforms.uShield.value = bar.shield;
        barUniforms.uChampion.value = bar.champion ? 1 : 0;
        standee.bar.position.copy(standee.mesh.position);
      }
      standee.shadow.position.set(enemy.x, ground + 0.2, enemy.y);
      standee.shadow.scale.setScalar(enemy.shadowRadius);
      standee.shadow.material.opacity = enemy.shadowAlpha;
    }
    for (const [id, standee] of standees) if (!active.has(id)) removeStandee(id, standee);
  }

  function captureBoard() {
    if (disposed || view !== "angled") return;
    boardTexture.needsUpdate = true;
    // Simdi yukle: tuval birazdan efekt kamerasiyla yeniden ciziliyor.
    renderer.initTexture(boardTexture);
    boardCaptured = true;
  }

  let width = 0;
  let height = 0;
  const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  let shadowDirty = true;
  let shadowSignature = "";
  let frame = 0;

  /** Kulelerin golgeye giren hali degistiyse golge haritasi bir sonraki uygun karede. */
  function markShadows(towers: readonly Tower3dInput[]) {
    let signature = "";
    for (const tower of towers) signature += `${tower.id}:${tower.tier}:${tower.x}:${tower.y}:${Math.round((tower.facing ?? 0) * 50)};`;
    if (signature !== shadowSignature) {
      shadowSignature = signature;
      shadowDirty = true;
    }
  }

  function updateShadows() {
    frame += 1;
    if (shadowDirty && frame % 3 === 0) {
      renderer.shadowMap.needsUpdate = true;
      shadowDirty = false;
    }
  }

  function resize(rect: DOMRect) {
    const hostRect = options.host.getBoundingClientRect();
    canvas.style.left = `${rect.left - hostRect.left}px`;
    canvas.style.top = `${rect.top - hostRect.top}px`;
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      // On izleme gibi en cok 1,5; telefonda 1,25 (tam ekran MSAA ve golgeli malzemeler pahali).
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.25 : 1.5));
      renderer.setSize(width, height, true);
    }
  }

  function mapCenter(world: WorldView) {
    return { x: world.x + world.width / 2, z: world.y + world.height / 2 };
  }

  /**
   * Egik kameranin su anki kesiti. Yakinlasma 1'de harita kuzeyi yukarida
   * genislige sigiyor (egimle derinligi sigmazsa kesit buyuyor).
   */
  function orbitView(): OrbitView | undefined {
    if (!lastRect || !lastWorld) return undefined;
    const base = angledFrustum(lastWorld, lastRect.width / Math.max(1, lastRect.height), orbit.elevation, TOWER_HEADROOM);
    return {
      target: orbit.target ?? mapCenter(lastWorld),
      yaw: orbit.yaw,
      frustum: { halfWidth: base.halfWidth / orbit.zoom, halfHeight: base.halfHeight / orbit.zoom, sin: base.sin, cos: base.cos }
    };
  }

  function groundAt(clientX: number, clientY: number, orbitState: OrbitView) {
    if (!lastRect) return undefined;
    const ndcX = ((clientX - lastRect.left) / lastRect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - lastRect.top) / lastRect.height) * 2;
    return angledScreenToGround(ndcX, ndcY, orbitState);
  }

  /** Hedef haritanin icinde kalsin: kaydirma ve yakinlasma tahtadan kopmasin. */
  function setTarget(target: { x: number; z: number }) {
    if (!lastWorld) return;
    orbit.target = {
      x: Math.min(lastWorld.x + lastWorld.width, Math.max(lastWorld.x, target.x)),
      z: Math.min(lastWorld.y + lastWorld.height, Math.max(lastWorld.y, target.z))
    };
  }

  /** Kamerayi degistir; parmaklarin altindaki zemin noktasi yerinde kalsin. */
  function keepAnchored(clientX: number, clientY: number, change: () => void) {
    const before = orbitView();
    const anchor = before && groundAt(clientX, clientY, before);
    change();
    const after = orbitView();
    const moved = after && groundAt(clientX, clientY, after);
    if (anchor && moved && after) setTarget({ x: after.target.x + anchor.x - moved.x, z: after.target.z + anchor.z - moved.z });
  }

  function rotateCamera(radians: number, clientX: number, clientY: number) {
    keepAnchored(clientX, clientY, () => { orbit.yaw += radians; });
  }

  function tiltCamera(degrees: number) {
    orbit.elevation = clampOrbit(orbit.elevation + degrees, ANGLED_ELEVATION_RANGE);
  }

  function zoomCamera(factor: number, clientX: number, clientY: number) {
    keepAnchored(clientX, clientY, () => { orbit.zoom = clampOrbit(orbit.zoom * factor, ANGLED_ZOOM_RANGE); });
  }

  function panCamera(fromX: number, fromY: number, toX: number, toY: number) {
    const current = orbitView();
    if (!current) return;
    const from = groundAt(fromX, fromY, current);
    const to = groundAt(toX, toY, current);
    if (from && to) setTarget({ x: current.target.x + from.x - to.x, z: current.target.z + from.z - to.z });
  }

  function resetCamera() {
    orbit.yaw = 0;
    orbit.elevation = ANGLED_ELEVATION_DEGREES;
    orbit.zoom = 1;
    orbit.target = undefined;
  }

  /** Gunes ve golge kesiti haritanin tamamini kapsasin. */
  function placeSun(world: WorldView) {
    const center = mapCenter(world);
    // Yamaclar da golge kesitinde.
    const radius = Math.hypot(world.width + 18 * (terrain?.cellSize ?? 34), world.height) / 2 + 80;
    if (sun.target.position.x !== center.x || sun.target.position.z !== center.z) shadowDirty = true;
    sun.target.position.set(center.x, 0, center.z);
    sun.position.set(center.x + sunDirection.x * 1500, sunDirection.y * 1500, center.z + sunDirection.z * 1500);
    const shadowCamera = sun.shadow.camera;
    if (shadowCamera.right !== radius) {
      shadowCamera.left = -radius;
      shadowCamera.right = radius;
      shadowCamera.top = radius;
      shadowCamera.bottom = -radius;
      shadowCamera.updateProjectionMatrix();
    }
    ensureTerrain(world);
  }

  function render(canvasRect: DOMRect, viewport: PhaserViewport, worldView: WorldView) {
    if (disposed) return;
    placeSun(worldView);
    if (view === "top") {
      lastRect = undefined;
      board.visible = false;
      slopes.visible = false;
      floor.visible = false;
      zoneSurface.visible = false;
      air.visible = false;
      boardCaptured = false;
      renderer.setClearColor(0x000000, 0);
      const scaleX = canvasRect.width / Math.max(1, viewport.gameWidth);
      const scaleY = canvasRect.height / Math.max(1, viewport.gameHeight);
      resize(new DOMRect(canvasRect.left + viewport.x * scaleX, canvasRect.top + viewport.y * scaleY, viewport.width * scaleX, viewport.height * scaleY));
      const ortho = orthoFromWorldView(worldView);
      camera.left = ortho.left;
      camera.right = ortho.right;
      camera.top = ortho.top;
      camera.bottom = ortho.bottom;
      camera.up.set(0, 0, -1);
      camera.position.set(ortho.centerX, 2000, ortho.centerZ);
      camera.lookAt(ortho.centerX, 0, ortho.centerZ);
      camera.updateProjectionMatrix();
      updateShadows();
      renderer.render(scene, camera);
      return;
    }

    // Egik: tum tuval; tahta Phaser kamerasinin gordugu dunya parcasi, cevresi on izlemenin zemin rengi.
    resize(canvasRect);
    renderer.setClearColor(0x142125, 1);
    lastRect = canvasRect;
    lastWorld = { x: worldView.x, y: worldView.y, width: worldView.width, height: worldView.height };
    board.visible = true;
    slopes.visible = Boolean(terrain);
    floor.visible = true;
    zoneSurface.visible = Boolean(terrain && terrain.zoneCells.length > 0);
    // Doku: Phaser tuvalinin yalnizca ana kameranin dikdortgeni (flipY: v=1 tuvalin ustu).
    boardTexture.repeat.set(viewport.width / viewport.gameWidth, viewport.height / viewport.gameHeight);
    boardTexture.offset.set(viewport.x / viewport.gameWidth, 1 - (viewport.y + viewport.height) / viewport.gameHeight);
    // Phaser bu karede cizdi; WebGL tamponu gorev bitene kadar gecerli, ayni karede yukleniyor.
    // Zemin `captureBoard`da alindiysa tuvalde artik yalnizca efektler var.
    if (boardCaptured) {
      air.visible = true;
      air.position.set(worldView.x + worldView.width / 2, standeeCenterHeight(airBodySize, orbit.elevation), worldView.y + worldView.height / 2);
      air.scale.set(worldView.width, worldView.height, 1);
      airTexture.repeat.copy(boardTexture.repeat);
      airTexture.offset.copy(boardTexture.offset);
      airTexture.needsUpdate = true;
    } else {
      air.visible = false;
      boardTexture.needsUpdate = true;
    }
    boardCaptured = false;

    const current = orbitView();
    if (!current) return;
    const { forward } = orbitBasis(current.yaw, current.frustum.sin, current.frustum.cos);
    camera.left = -current.frustum.halfWidth;
    camera.right = current.frustum.halfWidth;
    camera.top = current.frustum.halfHeight;
    camera.bottom = -current.frustum.halfHeight;
    camera.up.set(0, 1, 0);
    camera.position.set(current.target.x - forward.x * 3000, -forward.y * 3000, current.target.z - forward.z * 3000);
    camera.lookAt(current.target.x, 0, current.target.z);
    camera.updateProjectionMatrix();
    updateShadows();
    renderer.render(scene, camera);
  }

  function clientToWorld(clientX: number, clientY: number) {
    const current = view === "angled" ? orbitView() : undefined;
    const ground = current && groundAt(clientX, clientY, current);
    return ground ? { x: ground.x, y: ground.z } : undefined;
  }

  function worldToClient(x: number, y: number, heightAbove = 0) {
    const current = view === "angled" ? orbitView() : undefined;
    if (!current || !lastRect) return undefined;
    const ndc = angledGroundToScreen(x, y, heightAbove, current);
    return { x: lastRect.left + ((ndc.x + 1) / 2) * lastRect.width, y: lastRect.top + ((1 - ndc.y) / 2) * lastRect.height };
  }

  function dispose() {
    disposed = true;
    for (const instance of instances.values()) scene.remove(instance.root);
    instances.clear();
    for (const [id, standee] of standees) removeStandee(id, standee);
    standeeGeometry.dispose();
    shadowGeometry.dispose();
    const textures = new Set<THREE.Texture>([boardTexture, airTexture, shadowTexture, ...[...standeeTextures.values()].map((entry) => entry.texture)]);
    standeeTextures.clear();
    groundTexture?.dispose();
    for (const object of [...loaded.values(), board, air, slopes, floor, zoneSurface]) {
      object.traverse((node: THREE.Object3D) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const value of Object.values(material)) if ((value as THREE.Texture)?.isTexture) textures.add(value as THREE.Texture);
          material.dispose();
        }
      });
    }
    textures.forEach((texture) => texture.dispose());
    loaded.clear();
    environment.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return {
    sync, syncEnemies, captureBoard, render, clientToWorld, worldToClient, dispose,
    rotateCamera, tiltCamera, zoomCamera, panCamera, resetCamera, setTerrain,
    getCameraState: () => ({ yaw: orbit.yaw, elevation: orbit.elevation, zoom: orbit.zoom }),
    setAirBodySize: (size) => { airBodySize = size; },
    setView: (next) => {
      view = next;
      if (view === "top") syncEnemies([]);
    },
    getView: () => view
  };
}
export { attachCameraGestures } from "./camera-gestures";
