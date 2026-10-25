/**
 * 3D kule katmani (asama 1: tepeden).
 *
 * Phaser tuvalinin ustunde, tiklamalari geciren seffaf bir three.js tuvali.
 * Kamera tam tepeden ve Phaser kamerasinin dunya gorunumune kilitli: 3D kule 2D
 * hucresine birebir oturuyor, dokunma ve yerlestirme hic degismiyor. Katman
 * yalnizca okuyor -- snapshot'taki kulelerin yeri, kademesi ve yonu -- sunucuya
 * hicbir sey gondermiyor.
 *
 * Bu modul yalnizca 3D acikken dinamik olarak yukleniyor (GameScene): 2D
 * oyuncunun paketine three.js girmiyor.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { orthoFromWorldView, towerModelPath, yawFromFacing, type TowerTier } from "./tower-math";

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

export type WorldView = { x: number; y: number; width: number; height: number };

type Instance = { key: string; root: THREE.Object3D; yaw: THREE.Object3D | undefined };

export type TowerLayer = {
  /** Snapshot'in kuleleri. Donen kume: modeli yuklenmis ve gorunen kuleler (2D govdeleri gizlenebilir). */
  sync(towers: readonly Tower3dInput[]): ReadonlySet<string>;
  /** Her karede: Phaser tuvalinin ekrandaki dikdortgeni ve kameranin dunya gorunumu. */
  render(canvasRect: DOMRect, view: WorldView): void;
  dispose(): void;
};

export function createTowerLayer(options: { host: HTMLElement; resolveUrl: (path: string) => string; onModelReady: () => void }): TowerLayer {
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

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  camera.up.set(0, 0, -1);

  const loader = new GLTFLoader();
  const requested = new Set<string>();
  const loaded = new Map<string, THREE.Object3D>();
  const instances = new Map<string, Instance>();
  const visible = new Set<string>();
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

  let width = 0;
  let height = 0;
  function render(canvasRect: DOMRect, view: WorldView) {
    if (disposed) return;
    const hostRect = options.host.getBoundingClientRect();
    canvas.style.left = `${canvasRect.left - hostRect.left}px`;
    canvas.style.top = `${canvasRect.top - hostRect.top}px`;
    const nextWidth = Math.max(1, Math.round(canvasRect.width));
    const nextHeight = Math.max(1, Math.round(canvasRect.height));
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, true);
    }
    const ortho = orthoFromWorldView(view);
    camera.left = ortho.left;
    camera.right = ortho.right;
    camera.top = ortho.top;
    camera.bottom = ortho.bottom;
    camera.position.set(ortho.centerX, 2000, ortho.centerZ);
    camera.lookAt(ortho.centerX, 0, ortho.centerZ);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function dispose() {
    disposed = true;
    for (const instance of instances.values()) scene.remove(instance.root);
    instances.clear();
    const textures = new Set<THREE.Texture>();
    for (const object of loaded.values()) {
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

  return { sync, render, dispose };
}
