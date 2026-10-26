/**
 * Egik 3D gorunumun hedef gorunusu (Endless Defense benzeri, 2026-10-26).
 *
 * - Isik: aydinlik gok/ortam isigi, yumusak sicak gunes, hafif kenar isigi;
 *   tahtanin otesi acik mavi-gri pus.
 * - Zemin: koyu karolar ve ince acik cizgiler (dunya izgarasiyla birebir).
 * - Cerceve: arenanin yanlarinda koseli, duz golgeli kayalar.
 * - Kule kaidesi: her kulenin altinda ayni koyu kare kaide ve kulenin
 *   kimlik renginde parlayan halka (modelin `accent` ekstrasi).
 * - Parlama (bloom): yalnizca 1'den parlak yuzeyler (isikli seritler, vuruslar).
 *
 * Yalnizca gorunus; oyun kurallari, konumlar ve girdi esleme degismez.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";

export const TARGET_LIGHT = {
  exposure: 1.0,
  environment: 0.3,
  sky: 0xd2e4ff,
  skyGround: 0x30384a,
  hemisphere: 1.5,
  sun: 0xfff4e6,
  sunIntensity: 2.8,
  rim: 0x9db8e6,
  rimIntensity: 0.9,
  /** Tahtanin otesindeki pus ve bos alanin rengi. */
  haze: 0x9fb3c6,
  /** Kayalik ucurumun dibi: pusla birlesen orta ton. */
  chasm: 0x5a6778,
  bloomStrength: 0.5,
  bloomRadius: 0.35,
  bloomThreshold: 1.05,
  /** Hedef stil kulelerin isiyan seritleri: renk doygun kalsin, beyaza patlamasin. */
  towerGlow: 1.15
} as const;

/** Karo zemin: hucre basina piksel ve arenanin cevresindeki bos pay (hucre). */
const TILE_PIXELS = 64;
const TILE_PAD_CELLS = 1;

export type TileBoard = { texture: THREE.Texture; uv: (x: number, z: number) => [number, number] };

/**
 * Arenanin koyu karolari. Bolge kareleri (tepe/cukur) kendi kaya yuzeyiyle
 * ustte ciziliyor, altlari yalnizca koyu dolgu. Arenanin disi bos pay rengi;
 * doku kenara kenetli oldugu icin tahtanin otesi de o renk.
 */
export function createTileBoard(input: { cols: number; rows: number; cellSize: number; originX: number; originY: number; zoneCells: readonly number[] }): TileBoard {
  const { cols, rows, cellSize, originX, originY } = input;
  const canvas = document.createElement("canvas");
  canvas.width = (cols + TILE_PAD_CELLS * 2) * TILE_PIXELS;
  canvas.height = (rows + TILE_PAD_CELLS * 2) * TILE_PIXELS;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#0d0f13";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const zones = new Set(input.zoneCells);
    const radius = (x: number, y: number, w: number, h: number, r: number) => {
      context.beginPath();
      context.moveTo(x + r, y);
      context.arcTo(x + w, y, x + w, y + h, r);
      context.arcTo(x + w, y + h, x, y + h, r);
      context.arcTo(x, y + h, x, y, r);
      context.arcTo(x, y, x + w, y, r);
      context.closePath();
    };
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = (col + TILE_PAD_CELLS) * TILE_PIXELS;
        const y = (row + TILE_PAD_CELLS) * TILE_PIXELS;
        if (zones.has(row * cols + col)) {
          context.fillStyle = "#121418";
          context.fillRect(x, y, TILE_PIXELS, TILE_PIXELS);
          continue;
        }
        context.fillStyle = "#14161b";
        context.fillRect(x, y, TILE_PIXELS, TILE_PIXELS);
        radius(x + 3, y + 3, TILE_PIXELS - 6, TILE_PIXELS - 6, 7);
        context.fillStyle = "#1e222a";
        context.fill();
        radius(x + 8, y + 8, TILE_PIXELS - 16, TILE_PIXELS - 16, 5);
        context.lineWidth = 2;
        context.strokeStyle = "rgba(150, 163, 182, 0.42)";
        context.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  const left = originX - TILE_PAD_CELLS * cellSize;
  const top = originY - TILE_PAD_CELLS * cellSize;
  const width = (cols + TILE_PAD_CELLS * 2) * cellSize;
  const height = (rows + TILE_PAD_CELLS * 2) * cellSize;
  return { texture, uv: (x, z) => [(x - left) / width, 1 - (z - top) / height] };
}

/** Tohumlu, tekrarlanabilir rastgelelik (her bolumde ayni kaya dizilimi). */
function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Arenanin sag ve solunda koseli kayalar (dusuk poligon, duz golge). Ust ve
 * alt kenarda dusmanlarin giris-cikisi acik: orada yalnizca uzakta, puslu kayalar.
 * `ground` yamacin yuksekligi; kayalar ona gomulu oturuyor.
 */
export function createRockFrame(input: { left: number; right: number; top: number; bottom: number; cellSize: number; seed: number; ground: (x: number, z: number) => number }) {
  const { left, right, top, bottom, cellSize: cell } = input;
  const random = seeded(input.seed * 7919 + 17);
  const group = new THREE.Group();
  const shapes = [0, 1, 2, 3].map((variant) => {
    const geometry = new THREE.IcosahedronGeometry(1, variant === 3 ? 1 : 0);
    const position = geometry.getAttribute("position");
    const shake = seeded(variant * 131 + 7);
    // Koseleri birlikte oynat (ayni konumdaki koseler ayni kayiyor): kirik ama kapali kaya.
    const moved = new Map<string, [number, number, number]>();
    for (let i = 0; i < position.count; i += 1) {
      const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
      let offset = moved.get(key);
      if (!offset) {
        offset = [(shake() - 0.5) * 0.35, (shake() - 0.5) * 0.3, (shake() - 0.5) * 0.35];
        moved.set(key, offset);
      }
      position.setXYZ(i, position.getX(i) + offset[0], position.getY(i) * 0.78 + offset[1], position.getZ(i) + offset[2]);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
  const materials = [0x56606e, 0x4b5462, 0x636d7b].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true }));
  const place = (x: number, z: number, size: number) => {
    const rock = new THREE.Mesh(shapes[Math.floor(random() * shapes.length)], materials[Math.floor(random() * materials.length)]);
    rock.scale.set(size * (0.8 + random() * 0.5), size * (0.55 + random() * 0.6), size * (0.8 + random() * 0.5));
    rock.rotation.set((random() - 0.5) * 0.5, random() * Math.PI * 2, (random() - 0.5) * 0.5);
    rock.position.set(x, input.ground(x, z) + size * 0.15, z);
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
  };
  // Yan kayaliklar: kenara yakin kucuk, disariya dogru buyuk ve yuksek.
  for (const side of [-1, 1]) {
    const edge = side < 0 ? left : right;
    for (let z = top - cell * 10; z < bottom + cell * 10; z += cell * (1.2 + random() * 0.8)) {
      const near = cell * (1.1 + random() * 1.2);
      if (random() < 0.7) place(edge + side * near, z + (random() - 0.5) * cell, cell * (0.3 + random() * 0.4));
      const far = cell * (3 + random() * 3);
      place(edge + side * far, z + (random() - 0.5) * cell * 1.5, cell * (0.7 + random() * 0.9));
      if (random() < 0.35) place(edge + side * cell * (6.5 + random() * 3), z, cell * (1.2 + random() * 1.1));
    }
  }
  // Ust ve alt: yalnizca acik yolun otesinde, pusa karisan buyuk kayalar.
  for (const end of [top - cell * 6, bottom + cell * 6]) {
    for (let x = left - cell * 6; x < right + cell * 6; x += cell * (1.6 + random() * 1.2)) {
      place(x, end + (random() - 0.5) * cell * 4, cell * (0.9 + random() * 1.1));
    }
  }
  return {
    group,
    dispose() {
      shapes.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    }
  };
}

/** Kaidenin boyu (hucre); model bu kadar kaldiriliyor. */
export const PLINTH_HEIGHT_CELLS = 0.1;

/**
 * Kule kaidesi: yuvarlak koseli koyu kare ve ustunde kulenin kimlik renginde
 * parlayan yuvarlak koseli halka. Olcu birimi hucre (sahnede hucre boyuyla olceklenir).
 */
export function createPlinthFactory() {
  const roundedSquare = (half: number, r: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-half + r, -half);
    shape.lineTo(half - r, -half);
    shape.quadraticCurveTo(half, -half, half, -half + r);
    shape.lineTo(half, half - r);
    shape.quadraticCurveTo(half, half, half - r, half);
    shape.lineTo(-half + r, half);
    shape.quadraticCurveTo(-half, half, -half, half - r);
    shape.lineTo(-half, -half + r);
    shape.quadraticCurveTo(-half, -half, -half + r, -half);
    return shape;
  };
  const geometries = new Map<number, { slab: THREE.BufferGeometry; ring: THREE.BufferGeometry }>();
  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0x283041, roughness: 0.62, metalness: 0.25 });
  const ringMaterials = new Map<number, THREE.MeshStandardMaterial>();
  const geometry = (span: number) => {
    let entry = geometries.get(span);
    if (!entry) {
      const half = 0.45 * span;
      const depth = PLINTH_HEIGHT_CELLS - 0.03;
      const slab = new THREE.ExtrudeGeometry(roundedSquare(half, 0.1 * span), { depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 6 });
      slab.rotateX(-Math.PI / 2);
      const ringShape = roundedSquare(half * 0.86, 0.09 * span);
      ringShape.holes.push(roundedSquare(half * 0.86 - 0.035, 0.08 * span));
      const ring = new THREE.ExtrudeGeometry(ringShape, { depth: 0.012, bevelEnabled: false, curveSegments: 6 });
      ring.rotateX(-Math.PI / 2);
      ring.translate(0, depth + 0.025, 0);
      entry = { slab, ring };
      geometries.set(span, entry);
    }
    return entry;
  };
  const ringMaterial = (accent: number) => {
    let material = ringMaterials.get(accent);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 2.0, roughness: 0.4, metalness: 0 });
      ringMaterials.set(accent, material);
    }
    return material;
  };
  return {
    create(accent: number, span: number) {
      const parts = geometry(span);
      const group = new THREE.Group();
      const slab = new THREE.Mesh(parts.slab, slabMaterial);
      slab.castShadow = slab.receiveShadow = true;
      group.add(slab, new THREE.Mesh(parts.ring, ringMaterial(accent)));
      return group;
    },
    dispose() {
      geometries.forEach((entry) => { entry.slab.dispose(); entry.ring.dispose(); });
      slabMaterial.dispose();
      ringMaterials.forEach((material) => material.dispose());
    }
  };
}

/**
 * Hedef stil modelin isimasini oyunun isigina gore ayarlar (modelde 2,2 yaziyor;
 * parlama gecisiyle birlikte cam kubbeler beyaza patliyordu). Malzemeler modelin
 * butun kopyalarinca paylasiliyor; bir kez cagirmak yetiyor.
 */
export function tuneTargetMaterials(model: THREE.Object3D) {
  model.traverse((node: THREE.Object3D) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material?.emissiveMap) material.emissiveIntensity = TARGET_LIGHT.towerGlow;
    }
  });
}

/** Modelin hedef stil isareti ve kimlik rengi (build-target-tower.py koku ekstralari). */
export function targetStyleAccent(model: THREE.Object3D): number | undefined {
  let accent: number | undefined;
  model.traverse((node: THREE.Object3D) => {
    const data = node.userData as { style?: string; accent?: string } | undefined;
    if (accent === undefined && data?.style === "target-endless-defense" && typeof data.accent === "string") {
      const value = Number.parseInt(data.accent.replace("#", ""), 16);
      if (Number.isFinite(value)) accent = value;
    }
  });
  return accent;
}

/**
 * Parlama gecisi: sahne HDR hedefe, 1'den parlaklar yayiliyor, ton esleme ve sRGB,
 * en sonda FXAA kenar yumusatmasi. Cok ornekli (MSAA) HDR hedef kullanilmiyor:
 * Chrome/ANGLE'da cozumu bozuluyordu ("texture format / sampler type" hatasi,
 * vuruslar baslayinca ekran karariyordu). Parlama yarim (telefonda ceyrek) cozunurlukte.
 */
export function createBloom(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Object3D, coarsePointer: boolean) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), TARGET_LIGHT.bloomStrength, TARGET_LIGHT.bloomRadius, TARGET_LIGHT.bloomThreshold);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new FXAAPass());
  let size = "";
  return {
    render(width: number, height: number) {
      const key = `${width}x${height}@${renderer.getPixelRatio()}`;
      if (key !== size) {
        size = key;
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(width, height);
        // Parlama yayilimi yumusak: yarim (telefonda ceyrek) cozunurluk yetiyor.
        const scale = coarsePointer ? 0.25 : 0.5;
        bloom.setSize(Math.max(1, Math.round(width * renderer.getPixelRatio() * scale)), Math.max(1, Math.round(height * renderer.getPixelRatio() * scale)));
      }
      composer.render();
    },
    dispose() {
      bloom.dispose();
      composer.dispose();
      target.dispose();
    }
  };
}
