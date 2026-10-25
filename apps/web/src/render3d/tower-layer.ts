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
 * - "angled": Phaser'in cizdigi zemin karesi doku olarak egik bir tahtaya
 *   seriliyor ve 3D kuleler onun ustunde ayakta duruyor. Dusmanlar Phaser'da
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
import { angledFrustum, angledGroundToScreen, angledScreenToGround, orthoFromWorldView, towerModelPath, yawFromFacing, type TowerTier } from "./tower-math";

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
  /** Panonun merkezinin zeminden yuksekligi. */
  lift: number;
  /** Ayaktaki golgenin yaricapi ve opakligi. */
  shadowRadius: number;
  shadowAlpha: number;
};

export type WorldView = { x: number; y: number; width: number; height: number };

/** Phaser ana kamerasinin tuvaldeki yeri (oyun boyutu birimlerinde) ve oyun boyutu. */
export type PhaserViewport = { x: number; y: number; width: number; height: number; gameWidth: number; gameHeight: number };

export type LayerView = "top" | "angled";

type Instance = { key: string; root: THREE.Object3D; yaw: THREE.Object3D | undefined };
type Standee = { mesh: THREE.Mesh; material: THREE.ShaderMaterial; shadow: THREE.Mesh; textureKey: string };

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

/** Kulelerin tepesine pay: egik kesitte uzun kuleler ust kenardan tasmasin (dunya birimi). */
const TOWER_HEADROOM = 70;

export type TowerLayer = {
  /** Snapshot'in kuleleri. Donen kume: modeli yuklenmis ve gorunen kuleler (2D govdeleri gizlenebilir). */
  sync(towers: readonly Tower3dInput[]): ReadonlySet<string>;
  /** Egik gorunumde ayakta cizilecek dusmanlar (bos liste: hepsi kalkar). */
  syncEnemies(enemies: readonly Enemy3dInput[]): void;
  /** Efekt duzleminin zeminden yuksekligi (dunya birimi). */
  setAirHeight(height: number): void;
  /**
   * Egik gorunumde, Phaser ana kamerasi zemini cizdikten hemen sonra: tuval o
   * an tahtanin dokusuna aliniyor. Ardindan cizilen (efekt kamerasi) ayri duzleme.
   */
  captureBoard(): void;
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
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.55;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xdbeaf0, 0x3a3f33, 1.4));
  // 2D tabanin golgesi sag-alta dusuyor (GameScene.renderTowers): isik sol-ustten.
  const sun = new THREE.DirectionalLight(0xffe9c8, 2.6);
  sun.position.set(-0.55, 1, -0.65);
  scene.add(sun);

  // Egik gorunumun tahtasi: Phaser'in karesi doku olarak; ton eslemesi yok ki 2D'deki renkler birebir kalsin.
  const boardTexture = new THREE.CanvasTexture(options.source);
  boardTexture.colorSpace = THREE.SRGBColorSpace;
  boardTexture.minFilter = THREE.LinearFilter;
  boardTexture.generateMipmaps = false;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: boardTexture, toneMapped: false }));
  board.rotation.x = -Math.PI / 2;
  // Kule tabanlari (y = 0) ile yarismasin.
  board.position.y = -0.4;
  board.renderOrder = -1;
  scene.add(board);

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
  let airHeight = 0;
  let disposed = false;

  /** Model bir kez isteniyor; gelince bir sonraki `sync` kuleyi kuruyor. */
  function request(key: string) {
    if (requested.has(key)) return;
    requested.add(key);
    loader.loadAsync(options.resolveUrl(key)).then((gltf: { scene: THREE.Object3D }) => {
      if (disposed) return;
      loaded.set(key, gltf.scene);
      options.onModelReady();
    }).catch((error: unknown) => {
      // Yuklenemeyen model: o kule 2D kalir, oyun etkilenmez.
      console.warn("3D tower model could not load", key, error);
    });
  }

  function sync(towers: readonly Tower3dInput[]) {
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
        standee = { mesh, material, shadow, textureKey: "" };
        standees.set(enemy.id, standee);
        scene.add(mesh);
        scene.add(shadow);
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
      standee.mesh.position.set(enemy.x, enemy.lift, enemy.y);
      standee.shadow.position.set(enemy.x, 0.2, enemy.y);
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

  // Son karenin egik kamerasi: girdi ve DOM etiketleri ayni kesitle cozulsun.
  let angled: { rect: DOMRect; center: { x: number; z: number }; frustum: ReturnType<typeof angledFrustum> } | undefined;
  let width = 0;
  let height = 0;

  function resize(rect: DOMRect) {
    const hostRect = options.host.getBoundingClientRect();
    canvas.style.left = `${rect.left - hostRect.left}px`;
    canvas.style.top = `${rect.top - hostRect.top}px`;
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, true);
    }
  }

  function render(canvasRect: DOMRect, viewport: PhaserViewport, worldView: WorldView) {
    if (disposed) return;
    if (view === "top") {
      angled = undefined;
      board.visible = false;
      air.visible = false;
      boardCaptured = false;
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
      renderer.render(scene, camera);
      return;
    }

    // Egik: tum tuval, tahta Phaser kamerasinin gordugu dunya parcasi.
    resize(canvasRect);
    board.visible = true;
    board.position.x = worldView.x + worldView.width / 2;
    board.position.z = worldView.y + worldView.height / 2;
    board.scale.set(worldView.width, worldView.height, 1);
    // Doku: Phaser tuvalinin yalnizca ana kameranin dikdortgeni (flipY: v=1 tuvalin ustu).
    boardTexture.repeat.set(viewport.width / viewport.gameWidth, viewport.height / viewport.gameHeight);
    boardTexture.offset.set(viewport.x / viewport.gameWidth, 1 - (viewport.y + viewport.height) / viewport.gameHeight);
    // Phaser bu karede cizdi; WebGL tamponu gorev bitene kadar gecerli, ayni karede yukleniyor.
    // Zemin `captureBoard`da alindiysa tuvalde artik yalnizca efektler var.
    if (boardCaptured) {
      air.visible = true;
      air.position.set(board.position.x, airHeight, board.position.z);
      air.scale.copy(board.scale);
      airTexture.repeat.copy(boardTexture.repeat);
      airTexture.offset.copy(boardTexture.offset);
      airTexture.needsUpdate = true;
    } else {
      air.visible = false;
      boardTexture.needsUpdate = true;
    }
    boardCaptured = false;

    const center = { x: worldView.x + worldView.width / 2, z: worldView.y + worldView.height / 2 };
    const frustum = angledFrustum(worldView, canvasRect.width / Math.max(1, canvasRect.height), undefined, TOWER_HEADROOM);
    camera.left = -frustum.halfWidth;
    camera.right = frustum.halfWidth;
    camera.top = frustum.halfHeight;
    camera.bottom = -frustum.halfHeight;
    camera.up.set(0, 1, 0);
    camera.position.set(center.x, frustum.sin * 3000, center.z + frustum.cos * 3000);
    camera.lookAt(center.x, 0, center.z);
    camera.updateProjectionMatrix();
    angled = { rect: canvasRect, center, frustum };
    renderer.render(scene, camera);
  }

  function clientToWorld(clientX: number, clientY: number) {
    if (view !== "angled" || !angled) return undefined;
    const ndcX = ((clientX - angled.rect.left) / angled.rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - angled.rect.top) / angled.rect.height) * 2;
    const ground = angledScreenToGround(ndcX, ndcY, angled.center, angled.frustum);
    return { x: ground.x, y: ground.z };
  }

  function worldToClient(x: number, y: number, heightAbove = 0) {
    if (view !== "angled" || !angled) return undefined;
    const ndc = angledGroundToScreen(x, y, heightAbove, angled.center, angled.frustum);
    return { x: angled.rect.left + ((ndc.x + 1) / 2) * angled.rect.width, y: angled.rect.top + ((1 - ndc.y) / 2) * angled.rect.height };
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
    for (const object of [...loaded.values(), board, air]) {
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
    setAirHeight: (height) => { airHeight = height; },
    setView: (next) => {
      view = next;
      if (view === "top") syncEnemies([]);
    },
    getView: () => view
  };
}
