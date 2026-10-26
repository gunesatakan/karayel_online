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
  ANGLED_FOV_DEGREES,
  ANGLED_ZOOM_RANGE,
  angledGroundToScreen,
  angledPerspectiveFit,
  angledScreenToGround,
  clampOrbit,
  orbitBasis,
  orthoFromWorldView,
  recenterWhileRotating,
  rotateTargetAround,
  standeeCenterHeight,
  MINE_CELL_SCALE,
  OPERATOR_MODEL_PATHS,
  OPERATOR_MODEL_YAW_OFFSET,
  OPERATOR_SIZE_SCALE,
  WORKER_MODEL_PATH,
  WORKER_MODEL_YAW_OFFSET,
  mineModelPath,
  towerModelPath,
  MODEL_BODY_DIAMETER_CELLS,
  towerLevelGrowth,
  upgradePopFactor,
  yawFromFacing,
  type OrbitView,
  type TowerTier
} from "./tower-math";
import { createShotFx, type ShotFx } from "./shot-fx";
import { createTierFx } from "./tower-tiers";
import { setAngledRenderScale } from "./renderer-mode";
import { DESKTOP_QUALITY, DESKTOP_QUALITY_START, TOUCH_QUALITY, TOUCH_QUALITY_START, createQualityGovernor, stepQualityGovernor } from "./resolution";
import { createZoneHeight, edgeSlopeHeight, terrainShade, type TerrainInput } from "./terrain";
import { PLINTH_HEIGHT_CELLS, TARGET_LIGHT, createBloom, createPlinthFactory, createRockFrame, createTileBoard, targetStyleAccent, tuneTargetMaterials, type TileBoard } from "./target-look";

export type Tower3dInput = {
  id: string;
  definitionId: string;
  tier: TowerTier;
  /** Seviye (kuleler): hedef stil kule seviyeyle buyuyor, yukseltme kutlaniyor. */
  level?: number;
  x: number;
  y: number;
  /** Kare kulesinde oyunun yonu; kenar rayinda kullanilmiyor. */
  facing?: number;
  /** Kare kulesinde model olcegi (`towerModelScale`); kenar rayinda `edgeModelTransform`. */
  scale: number;
  /** Kenar rayinin sabit donusu; varsa `facing` yerine. */
  fixedYaw?: number;
  /** Kule disi yapilar (ikmal binalari, duvar): kendi model yolu; yoksa kule modeli. */
  modelPath?: string;
  /** Dikey olcek carpani (acik kapi: duvar alcaliyor). */
  heightScale?: number;
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

/** Iscinin yeri ve durumu (Phaser'daki sprite'in son hali). */
export type Worker3dInput = {
  id: string;
  x: number;
  y: number;
  /** Phaser donusu (hareket yonu, ekranda saat yonu); arti biceminde (Tamirci) donmuyor. */
  rotation: number;
  /** Govdenin genisligi (dunya birimi). */
  size: number;
  /** Rol rengi (worker-look) ve rolun ek parcasi. */
  color: number;
  role: "gatherer" | "carrier" | "repairer" | "drone";
  carrying: boolean;
};

/** Operator bedeninin yeri ve durumu (Phaser'daki resmin son hali). */
export type Operator3dInput = {
  id: string;
  characterId: string;
  x: number;
  y: number;
  /** Phaser donusu: 0'da yuz kuzeyde (resim yukari bakiyor). */
  rotation: number;
  /** Govdenin genisligi (dunya birimi). */
  size: number;
  /** Dusmus beden: sonuk, yerde. */
  down: boolean;
};

/** Madenin yeri ve durumu (Phaser'daki ikonun son hali). */
export type Mine3dInput = { id: string; kind: string; x: number; y: number; cellSize: number; depleted: boolean; /** Kalan miktar yazisi (2D'deki etiket). */ label: string };

export type WorldView = { x: number; y: number; width: number; height: number };

/** Phaser ana kamerasinin tuvaldeki yeri (oyun boyutu birimlerinde) ve oyun boyutu. */
export type PhaserViewport = { x: number; y: number; width: number; height: number; gameWidth: number; gameHeight: number };

export type LayerView = "top" | "angled";

type Instance = {
  key: string;
  root: THREE.Object3D;
  yaw: THREE.Object3D | undefined;
  /** Namlu ucu (3D vuruslarin cikis noktasi). */
  muzzle: THREE.Object3D | undefined;
  /** Geri tepen namlular: dinlenme yeri, son atis ve gucu. */
  recoil: { node: THREE.Object3D; baseZ: number; at: number; strength: number } | undefined;
  /** Hedef stil kulenin kaidesi (egik gorunumde; model onun ustune kalkiyor). */
  plinth?: THREE.Object3D;
  /** Namlunun dikey nisani (`addPitchPivot`): dugum, su anki aci, golgenin cizildigi aci. */
  pitch: THREE.Object3D | undefined;
  pitchAngle: number;
  shadowPitch: number;
  /** Oyun kuleyi hedefe donduruyor (`facing` geliyor): yalnizca o zaman nisan aliyor. */
  aims: boolean;
  /** Kok ekstrasindan yayilim (1x1 -> 1, 2x2 -> 2, kenar rayi -> 0) ve kimlik rengi. */
  span: number;
  accent: number | undefined;
  /** Sync'teki olcek; yukseltme "pop"u bunun ustune. */
  scale: number;
  heightScale: number;
  pop?: { at: number; big: boolean };
  /** Vurusun hedef noktasina kilit (`lockAim`): suresi dolana kadar `facing` yerine. */
  lock?: { x: number; y: number; z: number; until: number };
};

/** Kademeye gore isima: kademe 1 sade (parlama esiginin altinda), 3 parlak ve nabiz atiyor. */
const TIER_GLOW = { 1: 0.55, 2: 1, 3: 1.05 } as const;
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

/** Yamaclar ve bolge (tepe/cukur) yuzeyleri: dokusuz koyu gri-mavi kaya, acik renkli cerceve kayalari ustunde secilsin; zemin karolar (target-look). */
const SLOPE_ROCK = 0x2e353f;
const ZONE_ROCK = 0x363d48;

/** Kulelerin tepesine pay: egik kesitte uzun kuleler ust kenardan tasmasin (dunya birimi). */
const TOWER_HEADROOM = 70;
/** Egik gorunumun cevresi ve sisin rengi: acik mavi-gri pus (hedef gorunus). */
const ANGLED_CLEAR_COLOR = TARGET_LIGHT.haze;
/** Sisin tahtanin otesinde tamamen kapandigi derinlik (dunya birimi). */
const ANGLED_FOG_DEPTH = 1600;

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
  setTerrain(terrain: (TerrainInput & { groundImage?: HTMLImageElement | HTMLCanvasElement; stage?: number }) | undefined): void;
  /**
   * Egik gorunumun 3D vuruslari (render3d/shot-fx): 2D efekt sistemi olaylari ve
   * mermileri buraya aynaliyor. Tepeden gorunumde kapali (`shotsActive`).
   */
  shots: Pick<ShotFx, "event" | "projectiles" | "beams" | "stats">;
  shotsActive(): boolean;
  /** Egik gorunumde 3D operator bedenleri. Donen kume: modeli yuklenmis olanlar. */
  syncOperators(operators: readonly Operator3dInput[]): ReadonlySet<string>;
  /** Egik gorunumde 3D isciler. Donen kume: modeli yuklenmis olanlar (sprite'lari gizlenebilir). */
  syncWorkers(workers: readonly Worker3dInput[]): ReadonlySet<string>;
  /**
   * 3D zemin (karolar, yamaclar, bolge yuzeyleri) hazir mi: arazi bilindiginde evet.
   * Hazirsa zemin 3D'de cizili; Phaser karesi ustune yalnizca isik olarak
   * ("ekran" karisimi) biniyor, Phaser'in kendi zemin resmi gizlenmeli.
   */
  hasGround(): boolean;
  /** Egik gorunumde 3D cizilen madenler. Donen kume: modeli yuklenmis olanlar (2D ikonlari gizlenebilir). */
  syncMines(mines: readonly Mine3dInput[]): ReadonlySet<string>;
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
  const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Isik hedef gorunusten (target-look): aydinlik gok, yumusak sicak gunes, hafif kenar isigi.
  renderer.toneMappingExposure = TARGET_LIGHT.exposure;
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
  // Ortam yansimasi dusuk tutuluyor: metal yuzeyler parlak odayi ayna gibi yansitmasin (boyali oyuncak yuzeyi).
  scene.environmentIntensity = TARGET_LIGHT.environment;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(TARGET_LIGHT.sky, TARGET_LIGHT.skyGround, TARGET_LIGHT.hemisphere));
  // Gunes on izlemedeki yonde, (-6, 14, 8): sol-onden ~54 derece; golgeler kulenin
  // arkasina (kameradan uzaga) dusuyor, egik kamerada gorunuyor.
  const sun = new THREE.DirectionalLight(TARGET_LIGHT.sun, TARGET_LIGHT.sunIntensity);
  const sunLength = Math.hypot(-6, 14, 8);
  const sunDirection = { x: -6 / sunLength, y: 14 / sunLength, z: 8 / sunLength };
  sun.castShadow = true;
  // Masaustunde keskin golge (harita yalnizca kuleler degisince ciziliyor); telefonda 1024.
  sun.shadow.mapSize.set(coarsePointer ? 1024 : 2048, coarsePointer ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 4000;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(TARGET_LIGHT.rim, TARGET_LIGHT.rimIntensity);
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
  const slopeMaterial = new THREE.MeshStandardMaterial({ color: SLOPE_ROCK, roughness: 0.95, metalness: 0 });
  const slopes = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), slopeMaterial);
  slopes.castShadow = slopes.receiveShadow = true;
  slopes.visible = false;
  scene.add(slopes);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: TARGET_LIGHT.chasm, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  // Cukurlarin dibinin de altinda.
  floor.position.y = -80;
  floor.receiveShadow = true;
  floor.visible = false;
  scene.add(floor);
  // Yasak bolgelerin kayalik yuzeyi: tahtanin bolge karelerindeki parcasi, isikli ve golgeli.
  const zoneMaterial = new THREE.MeshStandardMaterial({ color: ZONE_ROCK, roughness: 0.95, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const zoneSurface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), zoneMaterial);
  zoneSurface.castShadow = zoneSurface.receiveShadow = true;
  zoneSurface.position.y = -0.4;
  zoneSurface.visible = false;
  scene.add(zoneSurface);
  let terrain: (TerrainInput & { groundImage?: HTMLImageElement | HTMLCanvasElement; stage?: number }) | undefined;
  // 3D zemin: arenanin koyu karolari (target-look), isikli ve golgeli; Phaser karesi
  // (halkalar, cizgiler, yazilar) ustune ekran karisimiyla. Kuleler ve vuruslar koyu karolarin ustunde one cikiyor.
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  let tileBoard: TileBoard | undefined;
  // Arenanin yanlarindaki koseli kayalar (egik gorunumde) ve kule kaideleri.
  let rockFrame: ReturnType<typeof createRockFrame> | undefined;
  const plinths = createPlinthFactory();
  /** Model anahtari -> hedef stil kimlik rengi (yoksa kaide yok). */
  const accents = new Map<string, number | undefined>();
  let bloom: ReturnType<typeof createBloom> | undefined;
  const bloomOff = typeof location !== "undefined" && new URLSearchParams(location.search).get("bloom3d") === "off";
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMaterial);
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  ground.visible = false;
  ground.renderOrder = -2;
  scene.add(ground);
  const boardOpaque = board.material;
  const boardScreen = new THREE.MeshBasicMaterial({
    map: boardTexture, toneMapped: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor
  });
  let zoneHeight: (x: number, z: number) => number = () => 0;
  let terrainKey = "";
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
    ground.geometry.dispose();
    tileBoard?.texture.dispose();
    tileBoard = undefined;
    if (terrain) {
      // Karolar dunya izgarasina birebir; arenanin disi dokunun kenar rengi (bos pay).
      // Hucre basina 128 piksel (telefonda 96): yakinlasinca karo cizgileri keskin kaliyor.
      tileBoard = createTileBoard({ ...terrain, pixels: coarsePointer ? 96 : 128 });
      tileBoard.texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      groundMaterial.map = tileBoard.texture;
      groundMaterial.needsUpdate = true;
      const margin = cell * 10;
      ground.geometry = buildGrid(world.x - margin, world.y - margin, world.width + margin * 2, world.height + margin * 2, cell / 4, zoneHeight, tileBoard.uv, false);
    } else {
      ground.geometry = new THREE.PlaneGeometry(1, 1);
    }
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
      // Kose rengi: tepenin gunes alan yuzu ve cukurun derinlik karartmasi; renk malzemeden.
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
      removeRocks();
      rockFrame = createRockFrame({ left: arena.left, right: arena.right, top: terrain.originY, bottom: terrain.originY + terrain.rows * cell, cellSize: cell, seed: terrain.stage ?? 1, ground: height });
      rockFrame.group.visible = view === "angled";
      scene.add(rockFrame.group);
      shadowDirty = true;
    } else {
      slopes.geometry = new THREE.PlaneGeometry(1, 1);
      removeRocks();
    }
  }

  function removeRocks() {
    if (!rockFrame) return;
    scene.remove(rockFrame.group);
    rockFrame.dispose();
    rockFrame = undefined;
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

  /** 3D zemin (karolar) hazir mi: arazi bilindiginde her zaman; Phaser'in zemin resmi gizlenmeli. */
  function groundReady() {
    return Boolean(terrain);
  }

  /** Zemin karolarla 3D'de: Phaser karesi (halkalar, cizgiler, yazilar) ustune isik olarak biniyor. */
  function applyGround() {
    board.material = groundReady() ? boardScreen : boardOpaque;
  }

  function setTerrain(next: (TerrainInput & { groundImage?: HTMLImageElement | HTMLCanvasElement; stage?: number }) | undefined) {
    terrain = next;
    zoneHeight = next ? createZoneHeight(next) : () => 0;
    terrainKey = "";
    applyGround();
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

  // Tepeden gorunum 2D hucrelere birebir oturuyor: ortografik. Egik gorunum perspektif (derinlik).
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  const angledCamera = new THREE.PerspectiveCamera(ANGLED_FOV_DEGREES, 1, 1, 10000);
  // Alcak egimde perspektif ufka kadar goruyor: tahtanin otesindeki zemin uzay karanligina karisiyor.
  const fog = new THREE.Fog(ANGLED_CLEAR_COLOR, 1, 2);
  let fitCache: { key: string; fit: ReturnType<typeof angledPerspectiveFit> } | undefined;

  const loader = new GLTFLoader();
  const requested = new Set<string>();
  const loaded = new Map<string, THREE.Object3D>();
  const instances = new Map<string, Instance>();
  /** Model anahtari -> en genis yeri ve boyu (model biriminde, yuklenince olculuyor). */
  const modelSizes = new Map<string, { width: number; height: number }>();
  /** Kulenin son bilinen seviyesi ve kademesi: artinca yukseltme kutlaniyor. */
  const levels = new Map<string, { level: number; tier: TowerTier }>();
  /** Kademe 3 kulelerin nabiz atan isimasi: malzeme -> taban parlakligi. */
  const pulsing = new Map<THREE.MeshStandardMaterial, number>();
  const tierFx = createTierFx(scene);
  const aimPivot = new THREE.Vector3();
  let lastAim = 0;
  const visible = new Set<string>();
  let view: LayerView = options.view;
  let airBodySize = 0;
  const orbit: OrbitState & { target?: { x: number; z: number } } = { yaw: 0, elevation: ANGLED_ELEVATION_DEGREES, zoom: 1 };

  // 3D vuruslar: mermi namludan cikiyor, ayakta duran govdeye iniyor; namlu geri tepiyor.
  const muzzleWorld = new THREE.Vector3();
  function nearestInstance(x: number, z: number) {
    const reach = (terrain?.cellSize ?? 34) * 1.6;
    let best = reach * reach;
    let found: Instance | undefined;
    for (const instance of instances.values()) {
      const gap = (instance.root.position.x - x) ** 2 + (instance.root.position.z - z) ** 2;
      if (gap < best) {
        best = gap;
        found = instance;
      }
    }
    return found;
  }
  const shots = createShotFx(scene, {
    cellSize: () => terrain?.cellSize ?? 34,
    groundHeight: (x, z) => zoneHeight(x, z),
    bodyHeight: () => standeeCenterHeight(airBodySize || (terrain?.cellSize ?? 34) * 0.6, orbit.elevation),
    muzzle: (x, z) => {
      const instance = nearestInstance(x, z);
      if (!instance?.muzzle) return undefined;
      // Kule bu karede kurulduysa dunya matrisi henuz yok.
      instance.root.updateMatrixWorld(true);
      return instance.muzzle.getWorldPosition(muzzleWorld).clone();
    },
    aim: (x, z, dirX, dirZ) => {
      const cellSize = terrain?.cellSize ?? 34;
      let best: { y: number; distance: number } | undefined;
      for (const standee of standees.values()) {
        const position = standee.mesh.position;
        const dx = position.x - x;
        const dz = position.z - z;
        const along = dx * dirX + dz * dirZ;
        if (along < -cellSize * 0.3) continue;
        // Ucus hattina yakin olan (yanindan gecilen degil) dusman.
        if (Math.abs(dx * dirZ - dz * dirX) > cellSize * 0.8) continue;
        const distance = Math.max(0, along);
        if (!best || distance < best.distance) best = { y: position.y, distance };
      }
      return best;
    },
    bodyAt: (x, z) => {
      const reach = ((terrain?.cellSize ?? 34) * 0.7) ** 2;
      let best = reach;
      let y: number | undefined;
      for (const standee of standees.values()) {
        const position = standee.mesh.position;
        const gap = (position.x - x) ** 2 + (position.z - z) ** 2;
        if (gap < best) {
          best = gap;
          y = position.y;
        }
      }
      return y;
    },
    kick: (x, z, strength) => {
      const recoil = nearestInstance(x, z)?.recoil;
      if (!recoil) return;
      recoil.at = performance.now();
      recoil.strength = Math.min(1, strength);
    },
    aimAt: (x, z, target) => lockAim(x, z, target)
  });

  /** Namlularin geri tepmesi: atista geriye, ~60 ms'de yerine yay gibi. */
  function updateRecoils(now: number) {
    for (const instance of instances.values()) {
      const recoil = instance.recoil;
      if (!recoil) continue;
      const age = now - recoil.at;
      const offset = age >= 0 && age < 420 ? recoil.strength * 0.09 * Math.exp(-age / 60) : 0;
      recoil.node.position.z = recoil.baseZ - offset;
    }
  }
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
      const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
      modelSizes.set(key, { width: Math.max(size.x, size.z), height: size.y });
      addPitchPivot(gltf.scene);
      if (targetStyleAccent(gltf.scene) !== undefined) {
        const tier = towerTierOf(gltf.scene);
        tuneTargetMaterials(gltf.scene, tier ? TIER_GLOW[tier] : 1);
        if (tier === 3) {
          gltf.scene.traverse((node: THREE.Object3D) => {
            const material = (node as THREE.Mesh).material;
            if ((node as THREE.Mesh).isMesh && material?.emissiveMap) pulsing.set(material, material.emissiveIntensity);
          });
        }
      }
      loaded.set(key, gltf.scene);
      options.onModelReady();
    }).catch((error: unknown) => {
      // Yuklenemeyen model: o kule 2D kalir, oyun etkilenmez.
      console.warn("3D tower model could not load", key, error);
    });
  }

  /** Kule modelinin kademesi (kok ekstrasi; ikmal binalari ve duvarda yok). */
  function towerTierOf(model: THREE.Object3D): TowerTier | undefined {
    let tier: TowerTier | undefined;
    model.traverse((node: THREE.Object3D) => {
      const data = node.userData as { footprintCells?: number; tier?: number } | undefined;
      if (tier === undefined && typeof data?.footprintCells === "number" && (data.tier === 1 || data.tier === 2 || data.tier === 3)) tier = data.tier;
    });
    return tier;
  }

  /**
   * Namlunun dikey nisani icin dugum: geri tepen parcanin cocuklari (namlu ucu
   * dahil) kendi kutularinin ortasinda donen `barrels-pitch` altina tasiniyor.
   * Model yuklenince bir kez; kopyalar ayni yapida.
   */
  function addPitchPivot(model: THREE.Object3D) {
    const barrels = model.getObjectByName("barrels-recoil");
    if (!barrels || barrels.children.length === 0 || model.getObjectByName("barrels-pitch")) return;
    model.updateMatrixWorld(true);
    const toLocal = barrels.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    for (const child of barrels.children) box.union(new THREE.Box3().setFromObject(child).applyMatrix4(toLocal));
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Object3D();
    pivot.name = "barrels-pitch";
    pivot.position.copy(center);
    for (const child of [...barrels.children]) {
      child.position.sub(center);
      pivot.add(child);
    }
    barrels.add(pivot);
  }

  /**
   * Namlu hedefe egiliyor: kulenin baktigi hatta en yakin dusmanin govdesine
   * (cukurdaki asagida, ucan yukarida). Vurus namlunun ucundan ayni hatta
   * cikiyor (shot-fx). Aci yumusak; golge yalnizca belirgin degisimde.
   */
  function updateAim(now: number) {
    const dt = Math.min(0.1, Math.max(0, (now - lastAim) / 1000));
    lastAim = now;
    const cellSize = terrain?.cellSize ?? 34;
    for (const instance of instances.values()) {
      const pitch = instance.pitch;
      if (!pitch || !instance.yaw || !instance.aims) continue;
      if (instance.lock) {
        if (now < instance.lock.until && applyLock(instance)) continue;
        instance.lock = undefined;
      }
      pitch.getWorldPosition(aimPivot);
      const yaw = instance.yaw.rotation.y + instance.root.rotation.y;
      const dirX = Math.sin(yaw);
      const dirZ = Math.cos(yaw);
      let target = 0;
      let nearest = Infinity;
      for (const standee of standees.values()) {
        const position = standee.mesh.position;
        const dx = position.x - aimPivot.x;
        const dz = position.z - aimPivot.z;
        const along = dx * dirX + dz * dirZ;
        if (along < cellSize * 0.3 || along > cellSize * 9 || along >= nearest) continue;
        if (Math.abs(dx * dirZ - dz * dirX) > cellSize * 0.9) continue;
        nearest = along;
        target = Math.atan2(aimPivot.y - position.y, along);
      }
      instance.pitchAngle += (clampPitch(target) - instance.pitchAngle) * Math.min(1, dt * 9);
      pitch.rotation.x = instance.pitchAngle;
      markPitchShadow(instance);
    }
  }

  /** Arti aci namluyu asagi egiyor (+Z ileri): dibe yakin cukura en cok ~66, yukari ~46 derece. */
  function clampPitch(angle: number) {
    return Math.max(-0.8, Math.min(1.15, angle));
  }

  function markPitchShadow(instance: Instance) {
    if (Math.abs(instance.pitchAngle - instance.shadowPitch) > 0.08) {
      instance.shadowPitch = instance.pitchAngle;
      shadowDirty = true;
    }
  }

  /**
   * Vurusun gercek hedefine kilit: isin ya da mermi cikarken taret o noktaya
   * donuyor ve namlu ona egiliyor (oyunun `facing`i hedefi geriden izleyebiliyor,
   * hattaki ilk dusman baska olabiliyor). Kisa sure gecerli; surekli isin her
   * karede yeniliyor. Namlu ucu bundan sonra okunuyor.
   */
  function lockAim(x: number, z: number, target: THREE.Vector3) {
    const instance = nearestInstance(x, z);
    if (!instance?.yaw || !instance.aims) return;
    instance.lock = { x: target.x, y: target.y, z: target.z, until: performance.now() + 260 };
    applyLock(instance);
  }

  function applyLock(instance: Instance) {
    const lock = instance.lock;
    if (!lock || !instance.yaw) return false;
    instance.root.updateMatrixWorld(true);
    instance.yaw.getWorldPosition(aimPivot);
    instance.yaw.rotation.y = Math.atan2(lock.x - aimPivot.x, lock.z - aimPivot.z) - instance.root.rotation.y;
    if (instance.pitch) {
      instance.root.updateMatrixWorld(true);
      instance.pitch.getWorldPosition(aimPivot);
      const along = Math.max(1e-3, Math.hypot(lock.x - aimPivot.x, lock.z - aimPivot.z));
      instance.pitchAngle = clampPitch(Math.atan2(aimPivot.y - lock.y, along));
      instance.pitch.rotation.x = instance.pitchAngle;
      // Namlu ucu donus merkezinin hattinda degil: aci uctan hedefe bakacak sekilde
      // birkac adimda duzeltiliyor (yakin hedefte fark buyuk).
      const reach = (terrain?.cellSize ?? 34) * 0.25;
      for (let step = 0; step < 3 && instance.muzzle; step += 1) {
        instance.root.updateMatrixWorld(true);
        instance.muzzle.getWorldPosition(aimPivot);
        const horizontal = Math.hypot(lock.x - aimPivot.x, lock.z - aimPivot.z);
        if (horizontal < reach) break;
        const e = instance.pitch.matrixWorld.elements;
        const have = Math.asin(Math.max(-1, Math.min(1, -e[9] / Math.hypot(e[8], e[9], e[10]))));
        const want = Math.atan2(aimPivot.y - lock.y, horizontal);
        instance.pitchAngle = clampPitch(instance.pitchAngle + want - have);
        instance.pitch.rotation.x = instance.pitchAngle;
      }
      markPitchShadow(instance);
    }
    instance.root.updateMatrixWorld(true);
    return true;
  }

  /** Sync'teki olcek ve yukseltme "pop"u. */
  function applyScale(instance: Instance, now: number) {
    let factor = 1;
    const pop = instance.pop;
    if (pop) {
      const age = (now - pop.at) / (pop.big ? 650 : 420);
      if (age >= 1) instance.pop = undefined;
      else factor = upgradePopFactor(age, pop.big);
      shadowDirty = true;
    }
    const scale = instance.scale * factor;
    instance.root.scale.set(scale, scale * instance.heightScale, scale);
  }

  /** Kademe 3 isimasi nabiz gibi (malzeme o modelin butun kopyalarinda ortak). */
  function updatePulse(now: number) {
    if (pulsing.size === 0) return;
    const wave = 1 + 0.08 * Math.sin((now / 1000) * 2.6);
    for (const [material, base] of pulsing) material.emissiveIntensity = base * wave;
  }

  // Madenler: model bir kez yukleniyor, her maden bir kopya; tukenmis madenin malzemesi karartilmis kopya.
  const mines = new Map<string, { kind: string; root: THREE.Object3D; depleted: boolean; label?: { sprite: THREE.Object3D; canvas: HTMLCanvasElement; texture: THREE.Texture; text: string } }>();

  /** Kalan miktar: keskin, kameraya donuk yazi (Phaser karesindeki yazi egik ve bulanik kaliyordu). */
  function mineLabel(text: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 80;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sprite.renderOrder = 9;
    const label = { sprite, canvas, texture, text: "" };
    drawLabel(label, text);
    return label;
  }

  function drawLabel(label: { canvas: HTMLCanvasElement; texture: THREE.Texture; text: string }, text: string) {
    label.text = text;
    const context = label.canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, label.canvas.width, label.canvas.height);
    context.font = "bold 54px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = 10;
    context.strokeStyle = "rgba(8, 14, 24, 0.92)";
    context.strokeText(text, 128, 42);
    context.fillStyle = "#e2e8f0";
    context.fillText(text, 128, 42);
    label.texture.needsUpdate = true;
  }
  const minesShown = new Set<string>();
  const dimmed = new Map<unknown, unknown>();

  function setMineDepleted(root: THREE.Object3D, depleted: boolean) {
    root.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const original = mesh.userData.originalMaterial ?? mesh.material;
      mesh.userData.originalMaterial = original;
      if (!depleted) {
        mesh.material = original;
        return;
      }
      let dark = dimmed.get(original);
      if (!dark) {
        dark = original.clone();
        (dark as THREE.Mesh["material"]).color?.multiplyScalar(0.32);
        if ((dark as THREE.Mesh["material"]).emissive) (dark as THREE.Mesh["material"]).emissiveIntensity = 0;
        dimmed.set(original, dark);
      }
      mesh.material = dark;
    });
  }

  // Isciler: ortak dron modeli + rol parcalari (halka, yuk, arti). Parca geometrileri paylasiliyor.
  const workers = new Map<string, { root: THREE.Object3D; ring: THREE.Mesh; cargo: THREE.Object3D; plus: THREE.Object3D; shadow: THREE.Mesh; materials: THREE.Mesh["material"][]; color: number; phase: number }>();
  const workersShown = new Set<string>();
  const ringGeometry = new THREE.TorusGeometry(0.46, 0.035, 8, 40);
  const crateGeometry = new THREE.BoxGeometry(0.24, 0.2, 0.24);
  const crystalGeometry = new THREE.OctahedronGeometry(0.16);
  const plusArm = new THREE.BoxGeometry(0.34, 0.08, 0.1);

  function glow(color: number) {
    return new THREE.MeshBasicMaterial({ color, toneMapped: false });
  }

  function createWorker(source: THREE.Object3D, input: Worker3dInput) {
    const root = new THREE.Group();
    const body = source.clone(true);
    root.add(body);
    const ringMaterial = glow(input.color);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    root.add(ring);
    const cargoMaterial = glow(input.color);
    const cargo = new THREE.Mesh(input.role === "gatherer" ? crystalGeometry : crateGeometry, cargoMaterial);
    cargo.position.y = -0.22;
    root.add(cargo);
    const plusMaterial = glow(input.color);
    const plus = new THREE.Group();
    const armA = new THREE.Mesh(plusArm, plusMaterial);
    const armB = new THREE.Mesh(plusArm, plusMaterial);
    armB.rotation.y = Math.PI / 2;
    plus.add(armA);
    plus.add(armB);
    const height = (body.getObjectByName("worker-drone")?.userData?.height as number | undefined) ?? 0.5;
    plus.position.y = height + 0.08;
    root.add(plus);
    const shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false, color: 0x000000, opacity: 0.32 }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    let hash = 0;
    for (const char of input.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return { root, ring, cargo, plus, shadow, materials: [ringMaterial, cargoMaterial, plusMaterial], color: input.color, phase: ((hash >>> 0) % 628) / 100 };
  }

  function removeWorker(id: string) {
    const worker = workers.get(id);
    if (!worker) return;
    scene.remove(worker.root);
    scene.remove(worker.shadow);
    worker.materials.forEach((material) => material.dispose());
    worker.shadow.material.dispose();
    workers.delete(id);
  }

  function syncWorkers(list: readonly Worker3dInput[]) {
    workersShown.clear();
    const source = loaded.get(WORKER_MODEL_PATH);
    if (!source) {
      if (list.length > 0) request(WORKER_MODEL_PATH);
      for (const id of [...workers.keys()]) removeWorker(id);
      return workersShown;
    }
    const now = performance.now() / 1000;
    const active = new Set<string>();
    for (const input of list) {
      active.add(input.id);
      let worker = workers.get(input.id);
      if (worker && worker.color !== input.color) {
        removeWorker(input.id);
        worker = undefined;
      }
      if (!worker) {
        worker = createWorker(source, input);
        workers.set(input.id, worker);
        scene.add(worker.root);
      }
      const ground = zoneHeight(input.x, input.y);
      // Suzuluyor: hucrenin yarisi kadar yukarida, hafifce inip kalkiyor.
      // Yerde yuruyor: modelin alti (kiskac) zemine degiyor, sallanma yok.
      worker.root.position.set(input.x, ground, input.y);
      worker.root.scale.setScalar(input.size);
      if (input.role !== "repairer") worker.root.rotation.y = Math.PI / 2 - input.rotation + WORKER_MODEL_YAW_OFFSET;
      worker.cargo.visible = input.carrying && (input.role === "gatherer" || input.role === "carrier");
      worker.cargo.rotation.y = now * 2;
      worker.plus.visible = input.role === "repairer";
      worker.shadow.position.set(input.x, ground + 0.25, input.y);
      worker.shadow.scale.setScalar(input.size * 0.45);
      workersShown.add(input.id);
    }
    for (const id of [...workers.keys()]) if (!active.has(id)) removeWorker(id);
    return workersShown;
  }

  // Operatorler: karakter basina model; dusunce karartilmis kopya malzeme (madenlerdeki gibi).
  const operators = new Map<string, { root: THREE.Object3D; characterId: string; down: boolean; shadow: THREE.Mesh }>();
  const operatorsShown = new Set<string>();

  function removeOperator(id: string) {
    const operator = operators.get(id);
    if (!operator) return;
    scene.remove(operator.root);
    scene.remove(operator.shadow);
    operator.shadow.material.dispose();
    operators.delete(id);
  }

  function syncOperators(list: readonly Operator3dInput[]) {
    operatorsShown.clear();
    const active = new Set<string>();
    for (const input of list) {
      const path = OPERATOR_MODEL_PATHS[input.characterId];
      if (!path) continue;
      const source = loaded.get(path);
      if (!source) {
        request(path);
        continue;
      }
      active.add(input.id);
      let operator = operators.get(input.id);
      if (operator && operator.characterId !== input.characterId) {
        removeOperator(input.id);
        operator = undefined;
      }
      if (!operator) {
        const shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false, color: 0x000000, opacity: 0.35 }));
        shadow.rotation.x = -Math.PI / 2;
        operator = { root: source.clone(true), characterId: input.characterId, down: false, shadow };
        operators.set(input.id, operator);
        scene.add(operator.root);
        scene.add(shadow);
        shadowDirty = true;
      }
      const ground = zoneHeight(input.x, input.y);
      // Isciler gibi yerde, sallanmadan; model tabani y = 0'da.
      const size = input.size * OPERATOR_SIZE_SCALE;
      operator.root.position.set(input.x, ground, input.y);
      operator.root.scale.setScalar(size);
      // Resim donus 0'da kuzeye (-z) bakiyor; +Z yuzlu model icin yarim tur.
      operator.root.rotation.y = Math.PI - input.rotation + OPERATOR_MODEL_YAW_OFFSET;
      if (operator.down !== input.down) {
        setMineDepleted(operator.root, input.down);
        operator.down = input.down;
      }
      operator.shadow.position.set(input.x, ground + 0.25, input.y);
      operator.shadow.scale.setScalar(size * 0.45);
      operatorsShown.add(input.id);
    }
    for (const id of [...operators.keys()]) if (!active.has(id)) removeOperator(id);
    return operatorsShown;
  }

  function syncMines(list: readonly Mine3dInput[]) {
    const active = new Set<string>();
    minesShown.clear();
    for (const mine of list) {
      const key = mineModelPath(mine.kind);
      const source = loaded.get(key);
      if (!source) {
        request(key);
        continue;
      }
      active.add(mine.id);
      let instance = mines.get(mine.id);
      if (instance && instance.kind !== mine.kind) {
        scene.remove(instance.root);
        instance = undefined;
      }
      if (!instance) {
        const root = source.clone(true);
        // Her maden kendi acisinda: ayni turden madenler kopya gibi durmasin.
        let hash = 0;
        for (const char of mine.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
        root.rotation.y = ((hash >>> 0) % 360) * (Math.PI / 180);
        instance = { kind: mine.kind, root, depleted: false };
        mines.set(mine.id, instance);
        scene.add(root);
        shadowDirty = true;
      }
      instance.root.position.set(mine.x, zoneHeight(mine.x, mine.y), mine.y);
      instance.root.scale.setScalar(mine.cellSize * MINE_CELL_SCALE);
      if (instance.depleted !== mine.depleted) {
        setMineDepleted(instance.root, mine.depleted);
        instance.depleted = mine.depleted;
      }
      if (mine.label && !instance.label) {
        instance.label = mineLabel(mine.label);
        scene.add(instance.label.sprite);
      }
      if (instance.label) {
        if (instance.label.text !== mine.label) drawLabel(instance.label, mine.label);
        instance.label.sprite.visible = mine.label !== "";
        // 2D'deki gibi madenin hemen guneyinde, zeminden biraz yukarida.
        const height = mine.cellSize * 0.28;
        instance.label.sprite.scale.set(height * 3.2, height, 1);
        instance.label.sprite.position.set(mine.x, zoneHeight(mine.x, mine.y) + height * 0.6, mine.y + mine.cellSize * 0.46);
        instance.label.sprite.material.opacity = mine.depleted ? 0.5 : 1;
      }
      minesShown.add(mine.id);
    }
    for (const [id, instance] of mines) {
      if (!active.has(id)) {
        scene.remove(instance.root);
        if (instance.label) {
          scene.remove(instance.label.sprite);
          instance.label.texture.dispose();
          instance.label.sprite.material.dispose();
        }
        mines.delete(id);
        shadowDirty = true;
      }
    }
    return minesShown;
  }

  function sync(towers: readonly Tower3dInput[]) {
    markShadows(towers);
    const active = new Set<string>();
    visible.clear();
    for (const tower of towers) {
      active.add(tower.id);
      const key = tower.modelPath ?? towerModelPath(tower.definitionId, tower.tier);
      const source = loaded.get(key);
      if (!source) {
        request(key);
        continue;
      }
      let instance = instances.get(tower.id);
      if (instance && instance.key !== key) {
        removeInstance(instance);
        instance = undefined;
      }
      if (!instance) {
        // Kopya geometri ve malzemeyi paylasiyor: ayni kuleden kac tane olursa olsun tek GPU kaynagi.
        const root = source.clone(true);
        const barrels = root.getObjectByName("barrels-recoil");
        // Hedef stil kule: kimlik renginde halkali ortak kaide (kenar rayinda yok).
        if (!accents.has(key)) accents.set(key, targetStyleAccent(source));
        const accent = accents.get(key);
        // Kok ekstrasi: 1x1 -> 1, 2x2 -> 4, kenar rayi -> 0.
        let span = 1;
        source.traverse((node: THREE.Object3D) => {
          const cells = node.userData?.footprintCells;
          if (typeof cells === "number") span = Math.round(Math.sqrt(cells));
        });
        instance = {
          key, root, yaw: root.getObjectByName("turret-yaw"), muzzle: root.getObjectByName("muzzle-socket"),
          recoil: barrels ? { node: barrels, baseZ: barrels.position.z, at: -Infinity, strength: 0 } : undefined,
          pitch: root.getObjectByName("barrels-pitch"), pitchAngle: 0, shadowPitch: 0, aims: false,
          span, accent, scale: tower.scale, heightScale: 1
        };
        if (accent !== undefined && span > 0) {
          // Kaide kademeyle zenginlesiyor; ikmal binalari ve duvar eskisi gibi.
          instance.plinth = plinths.create(accent, span, tower.modelPath ? 2 : tower.tier);
          scene.add(instance.plinth);
        }
        instances.set(tower.id, instance);
        scene.add(root);
        shadowDirty = true;
        // Bir sonraki kademenin modeli onceden: yukseltme aninda hazir olsun.
        if (!tower.modelPath && tower.tier < 3) request(towerModelPath(tower.definitionId, (tower.tier + 1) as TowerTier));
      }
      const cell = terrain?.cellSize ?? 34;
      const onPlinth = Boolean(instance.plinth) && view === "angled";
      if (instance.plinth) {
        instance.plinth.visible = onPlinth;
        instance.plinth.position.set(tower.x, 0, tower.y);
        instance.plinth.scale.setScalar(cell);
      }
      // Hedef stil kule seviyeyle buyuyor: modelin en genis yeri govde capinin
      // `towerLevelGrowth` kati (modeller kendi olculerinde farkli; ust kademe
      // uzun namlu yuzunden kucuk kaliyordu).
      const size = modelSizes.get(key);
      const grows = tower.level !== undefined && !tower.modelPath && instance.span > 0 && instance.accent !== undefined && size !== undefined && size.width > 0;
      // Ince uzun model (boyu eninin 1,7 katindan fazla) boyuna gore olculuyor: arkasini ortmesin.
      const fit = size ? Math.max(size.width, size.height / 1.7) : 1;
      const scale = grows ? tower.scale * ((MODEL_BODY_DIAMETER_CELLS * instance.span) / fit) * towerLevelGrowth(tower.level ?? 1) : tower.scale;
      const base = onPlinth ? PLINTH_HEIGHT_CELLS * cell : 0;
      instance.scale = scale;
      instance.heightScale = tower.heightScale ?? 1;
      instance.root.position.set(tower.x, base, tower.y);
      instance.aims = tower.fixedYaw === undefined && typeof tower.facing === "number";
      if (tower.fixedYaw !== undefined) {
        instance.root.rotation.y = tower.fixedYaw;
      } else if (instance.yaw && typeof tower.facing === "number") {
        instance.yaw.rotation.y = yawFromFacing(tower.facing);
      }
      // Yukseltme: seviye artinca kule "pop" yapiyor, zeminde dalga; kademe atlayinca isik sutunu.
      if (tower.level !== undefined) {
        const known = levels.get(tower.id);
        if (known && tower.level > known.level && view === "angled") {
          const big = tower.tier > known.tier;
          instance.pop = { at: performance.now(), big };
          if (instance.accent !== undefined) tierFx.celebrate(tower.x, tower.y, base, (size?.height ?? 1) * scale, cell, Math.max(1, instance.span), instance.accent, big);
        }
        levels.set(tower.id, { level: tower.level, tier: tower.tier });
      }
      applyScale(instance, performance.now());
      tierFx.update(tower.id, tower.tier, grows ? instance.accent : undefined, {
        x: tower.x, z: tower.y, base, width: (size?.width ?? 0) * scale, height: (size?.height ?? 0) * scale, cell, span: Math.max(1, instance.span), visible: onPlinth
      });
      visible.add(tower.id);
    }
    for (const [id, instance] of instances) {
      if (!active.has(id)) {
        removeInstance(instance);
        instances.delete(id);
        tierFx.remove(id);
        levels.delete(id);
        shadowDirty = true;
      }
    }
    return visible;
  }

  function removeInstance(instance: Instance) {
    scene.remove(instance.root);
    if (instance.plinth) scene.remove(instance.plinth);
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
  /**
   * Kalite basamagi (resolution.ts): 3D piksel orani (cihazinkini, en cok 2'yi
   * gecmiyor) ve egik gorunumde Phaser tuvalinin olcegi; kare suresine gore
   * iniyor ya da cikiyor. `?res3d=1.5` 3D oranini sabitliyor, basamak degismiyor (deneme).
   */
  const forcedRatio = Number(new URLSearchParams(location.search).get("res3d")) || 0;
  const maxRatio = Math.min(window.devicePixelRatio || 1, 2);
  const ladder = coarsePointer ? TOUCH_QUALITY : DESKTOP_QUALITY;
  const quality = createQualityGovernor(coarsePointer ? TOUCH_QUALITY_START : DESKTOP_QUALITY_START, performance.now());
  let pixelRatio = forcedRatio || Math.min(ladder[quality.level].pixelRatio, maxRatio);
  let boardScale = ladder[quality.level].boardScale;
  setAngledRenderScale(boardScale);
  let shadowDirty = true;
  let shadowSignature = "";
  let frame = 0;

  /** Kulelerin golgeye giren hali degistiyse golge haritasi bir sonraki uygun karede. */
  function markShadows(towers: readonly Tower3dInput[]) {
    let signature = "";
    for (const tower of towers) signature += `${tower.id}:${tower.tier}:${tower.level ?? 0}:${tower.x}:${tower.y}:${Math.round((tower.facing ?? 0) * 50)};`;
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
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, true);
    }
  }

  /** Kare suresine gore kalite basamagi: 3D piksel orani ve Phaser tuvalinin olcegi. */
  function governQuality(now: number) {
    if (forcedRatio) return;
    const level = ladder[stepQualityGovernor(quality, now, ladder.length)];
    const ratio = Math.min(level.pixelRatio, maxRatio);
    if (ratio !== pixelRatio) {
      pixelRatio = ratio;
      renderer.setPixelRatio(pixelRatio);
      if (width > 0 && height > 0) renderer.setSize(width, height, true);
    }
    if (level.boardScale !== boardScale) {
      boardScale = level.boardScale;
      setAngledRenderScale(boardScale);
      // Phaser tuvali yeni olcege main.ts'in boyut dinleyicisiyle kuruluyor.
      if (view === "angled") window.dispatchEvent(new Event("resize"));
    }
  }

  function mapCenter(world: WorldView) {
    return { x: world.x + world.width / 2, z: world.y + world.height / 2 };
  }

  /**
   * Egik kameranin su anki kesiti ve uzakligi. Yakinlasma 1'de harita kuzeyi
   * yukarida, dort kosesiyle ekranda (perspektifte yakin kenar genis).
   * Yakinlasma kamerayi hedefe yaklastiriyor.
   */
  function orbitView(): OrbitView | undefined {
    if (!lastRect || !lastWorld) return undefined;
    const aspect = lastRect.width / Math.max(1, lastRect.height);
    const key = `${lastWorld.width}:${lastWorld.height}:${aspect}:${orbit.elevation}`;
    if (fitCache?.key !== key) fitCache = { key, fit: angledPerspectiveFit(lastWorld, aspect, orbit.elevation, TOWER_HEADROOM) };
    const base = fitCache.fit;
    return {
      target: orbit.target ?? mapCenter(lastWorld),
      yaw: orbit.yaw,
      frustum: { halfWidth: base.halfWidth / orbit.zoom, halfHeight: base.halfHeight / orbit.zoom, sin: base.sin, cos: base.cos },
      distance: base.distance / orbit.zoom
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

  function rotateCamera(radians: number, _clientX: number, _clientY: number) {
    // Donus her zaman haritanin merkezi cevresinde (parmaklarin altinda degil):
    // birkac hareketten sonra da harita ortada toplanabiliyor.
    const current = orbitView();
    orbit.yaw += radians;
    // Siniri yok: kirpilsa merkez kayardi (kaydirma ve yakinlasma hedefi yine haritada tutuyor).
    // Donerken hedef haritanin merkezine de cekiliyor: harita ortaya geliyor, kenarda savrulmuyor.
    if (current && lastWorld) {
      const center = mapCenter(lastWorld);
      orbit.target = recenterWhileRotating(rotateTargetAround(current.target, center, radians), center, radians);
    }
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
    governQuality(performance.now());
    placeSun(worldView);
    if (view === "top") {
      lastRect = undefined;
      board.visible = false;
      slopes.visible = false;
      floor.visible = false;
      zoneSurface.visible = false;
      ground.visible = false;
      if (rockFrame) rockFrame.group.visible = false;
      shadowCatcher.visible = true;
      air.visible = false;
      boardCaptured = false;
      shots.setVisible(false);
      tierFx.tick(performance.now(), false);
      renderer.setClearColor(0x000000, 0);
      scene.fog = null;
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

    // Egik: tum tuval; tahta Phaser kamerasinin gordugu dunya parcasi, cevresi uzay karanligi.
    resize(canvasRect);
    renderer.setClearColor(ANGLED_CLEAR_COLOR, 1);
    lastRect = canvasRect;
    lastWorld = { x: worldView.x, y: worldView.y, width: worldView.width, height: worldView.height };
    board.visible = true;
    slopes.visible = Boolean(terrain);
    floor.visible = true;
    zoneSurface.visible = Boolean(terrain && terrain.zoneCells.length > 0);
    ground.visible = groundReady();
    if (rockFrame) rockFrame.group.visible = true;
    // 3D zemin golgeyi kendisi aliyor.
    shadowCatcher.visible = !ground.visible;
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
    if (!current?.distance) return;
    const distance = current.distance;
    const { forward } = orbitBasis(current.yaw, current.frustum.sin, current.frustum.cos);
    // Pus tahtanin otesinde basliyor: uzaktaki kayalar ve ucurum acik mavi-griye karisiyor, tahta net kaliyor.
    const reach = Math.hypot(lastWorld.width, lastWorld.height);
    fog.near = distance + reach * 0.85;
    fog.far = fog.near + ANGLED_FOG_DEPTH;
    scene.fog = fog;
    angledCamera.aspect = current.frustum.halfWidth / current.frustum.halfHeight;
    angledCamera.near = Math.max(1, distance * 0.05);
    angledCamera.far = fog.far + 200;
    angledCamera.position.set(current.target.x - forward.x * distance, -forward.y * distance, current.target.z - forward.z * distance);
    angledCamera.lookAt(current.target.x, 0, current.target.z);
    angledCamera.updateProjectionMatrix();
    updateShadows();
    const now = performance.now();
    updateRecoils(now);
    for (const instance of instances.values()) if (instance.pop) applyScale(instance, now);
    updateAim(now);
    updatePulse(now);
    tierFx.tick(now, true);
    shots.setVisible(true);
    shots.update(now);
    // Parlama: isikli seritler, kaide halkalari ve vuruslar (1'den parlaklar) yayiliyor.
    // `?bloom3d=off` kapatir (yavas cihaz ya da ariza ayiklama).
    if (bloomOff) {
      renderer.render(scene, angledCamera);
      return;
    }
    bloom ??= createBloom(renderer, scene, angledCamera, coarsePointer);
    // 1,75 ve ustu oranda FXAA gereksiz: kenarlar ince, goruntu keskin.
    bloom.render(width, height, pixelRatio < 1.75);
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
    shots.dispose();
    for (const instance of instances.values()) removeInstance(instance);
    instances.clear();
    tierFx.dispose();
    plinths.dispose();
    removeRocks();
    bloom?.dispose();
    tileBoard?.texture.dispose();
    shadowCatcher.material.dispose();
    boardOpaque.dispose();
    boardScreen.dispose();
    for (const id of [...workers.keys()]) removeWorker(id);
    for (const id of [...operators.keys()]) removeOperator(id);
    ringGeometry.dispose();
    crateGeometry.dispose();
    crystalGeometry.dispose();
    plusArm.dispose();
    for (const instance of mines.values()) {
      scene.remove(instance.root);
      instance.label?.texture.dispose();
      instance.label?.sprite.material.dispose();
    }
    mines.clear();
    dimmed.forEach((material) => (material as { dispose(): void }).dispose());
    for (const [id, standee] of standees) removeStandee(id, standee);
    standeeGeometry.dispose();
    shadowGeometry.dispose();
    const textures = new Set<THREE.Texture>([boardTexture, airTexture, shadowTexture, ...[...standeeTextures.values()].map((entry) => entry.texture)]);
    standeeTextures.clear();
    for (const object of [...loaded.values(), board, air, slopes, floor, zoneSurface, ground]) {
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
    rotateCamera, tiltCamera, zoomCamera, panCamera, resetCamera, setTerrain, syncMines, syncWorkers, syncOperators, hasGround: groundReady,
    getCameraState: () => ({ yaw: orbit.yaw, elevation: orbit.elevation, zoom: orbit.zoom }),
    shots,
    shotsActive: () => !disposed && view === "angled",
    setAirBodySize: (size) => { airBodySize = size; },
    setView: (next) => {
      view = next;
      if (view === "top") {
        syncEnemies([]);
        syncMines([]);
        syncWorkers([]);
        syncOperators([]);
      }
    },
    getView: () => view
  };
}
export { attachCameraGestures } from "./camera-gestures";
