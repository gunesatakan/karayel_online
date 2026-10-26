/**
 * Egik 3D gorunumun hedef gorunusu (Endless Defense benzeri, 2026-10-26).
 *
 * - Isik: aydinlik gok/ortam isigi, yumusak sicak gunes, hafif kenar isigi.
 * - Cevre: dekor yok; tahta yildizli uzayda suzuluyor (kalin govde, yildizlar).
 * - Zemin: koyu karolar ve ince acik cizgiler (dunya izgarasiyla birebir).
 * - Kule kaidesi: her kulenin altinda ayni koyu kare kaide ve kulenin
 *   kimlik renginde parlayan halka (modelin `accent` ekstrasi).
 * - Yasak bolgeler: tepe karelerinde ayri ayri yukselmis bloklar, cukur
 *   kareleri siyah ve kirmizi kenarli (gercekci arazi degil).
 * - Parlama (bloom): yalnizca 1'den parlak yuzeyler (isikli seritler, vuruslar).
 *
 * Yalnizca gorunus; oyun kurallari, konumlar ve girdi esleme degismez.
 */
import * as THREE from "three";
import type { ZoneLayout } from "./terrain";
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
  /** Tahtanin cevresi: simsiyah uzay (koyu lacivert ton esleme ve parlamadan gecince belirgin laciverte aciliyordu). */
  space: 0x000000,
  bloomStrength: 0.5,
  bloomRadius: 0.35,
  bloomThreshold: 1.05,
  /** Hedef stil kulelerin isiyan seritleri: renk doygun, parlama esiginin altinda (kule yayilmiyor, kaide halkasi hafifce). */
  towerGlow: 0.85
} as const;

/** Karo zemin: hucre basina piksel ve arenanin cevresindeki bos pay (hucre). */
/** Karo dokusunun hucre basina pikseli (varsayilan); masaustu 128 istiyor. */
const TILE_PIXELS = 64;
const TILE_PAD_CELLS = 1;

export type TileBoard = { texture: THREE.Texture; uv: (x: number, z: number) => [number, number] };

/**
 * Arenanin koyu karolari. Bolge kareleri (tepe/cukur) kendi kaya yuzeyiyle
 * ustte ciziliyor, altlari yalnizca koyu dolgu. Arenanin disi bos pay rengi;
 * doku kenara kenetli oldugu icin tahtanin otesi de o renk.
 */
export function createTileBoard(input: { cols: number; rows: number; cellSize: number; originX: number; originY: number; zoneCells: readonly number[]; pixels?: number; pitCells?: readonly number[] }): TileBoard {
  const { cols, rows, cellSize, originX, originY } = input;
  const tile = input.pixels ?? TILE_PIXELS;
  // Cizgi kalinliklari ve koseler 64 piksellik hucreye gore; yogunlukla olcekleniyor.
  const k = tile / TILE_PIXELS;
  const canvas = document.createElement("canvas");
  canvas.width = (cols + TILE_PAD_CELLS * 2) * tile;
  canvas.height = (rows + TILE_PAD_CELLS * 2) * tile;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#0d0f13";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const zones = new Set(input.zoneCells);
    const pits = new Set(input.pitCells ?? []);
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
        const x = (col + TILE_PAD_CELLS) * tile;
        const y = (row + TILE_PAD_CELLS) * tile;
        if (pits.has(row * cols + col)) {
          // Cukur: siyah kare, kenari beyaz yerine kirmizi.
          context.fillStyle = "#020203";
          context.fillRect(x, y, tile, tile);
          radius(x + 8 * k, y + 8 * k, tile - 16 * k, tile - 16 * k, 5 * k);
          context.lineWidth = 2.5 * k;
          context.strokeStyle = "rgba(239, 68, 68, 0.85)";
          context.stroke();
          continue;
        }
        if (zones.has(row * cols + col)) {
          // Tepe: ustunde blok duruyor, karo gorunmuyor.
          context.fillStyle = "#121418";
          context.fillRect(x, y, tile, tile);
          continue;
        }
        context.fillStyle = "#14161b";
        context.fillRect(x, y, tile, tile);
        radius(x + 3 * k, y + 3 * k, tile - 6 * k, tile - 6 * k, 7 * k);
        // Satranc tahtasi gibi iki ton (cok hafif).
        context.fillStyle = (row + col) % 2 === 0 ? "#1e222a" : "#242934";
        context.fill();
        radius(x + 8 * k, y + 8 * k, tile - 16 * k, tile - 16 * k, 5 * k);
        context.lineWidth = 2 * k;
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

/** Tohumlu, tekrarlanabilir rastgelelik (her acilista ayni yildiz dizilimi). */
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
 * Uzay: tahtanin cevresi bos, yildizli karanlik. Yildizlar kameranin hedefi
 * cevresinde buyuk bir kurede (her yonde, tahtanin altinda da), sabit piksel
 * boyunda, parlama esiginin altinda. Parlakligi ve rengi tekrarlanabilir.
 */
export function createStarfield(radius = 6000) {
  const random = seeded(7);
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  // Cok sayida soluk kucuk yildiz, az sayida parlak iri yildiz.
  for (const [count, size, dim] of [[1400, 1.4, 0.55], [140, 2.4, 1]] as const) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const u = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const ring = Math.sqrt(1 - u * u);
      positions.set([Math.cos(theta) * ring * radius, u * radius, Math.sin(theta) * ring * radius], index * 3);
      const light = dim * (0.35 + random() * 0.6);
      const blue = random() < 0.35 ? 1 : 0.86;
      colors.set([light * (blue < 1 ? 1 : 0.8), light * (blue < 1 ? 0.96 : 0.88), light], index * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);
    geometries.push(geometry);
    materials.push(material);
  }
  return {
    group,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    }
  };
}

/**
 * Tahtanin kalin govdesi: karolarin altinda koyu, ince acik kenarli bir levha;
 * uzayda suzulen bir satranc tahtasi gibi okunuyor. Olcu dunya biriminde.
 */
export function createBoardSlab(input: { left: number; top: number; width: number; depth: number; cellSize: number }) {
  const { left, top, width, depth, cellSize } = input;
  const thickness = cellSize * 0.45;
  const lip = cellSize * 0.06;
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x151a23, roughness: 0.6, metalness: 0.35 });
  const lipMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3444, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.BoxGeometry(width, thickness, depth);
  const edge = new THREE.BoxGeometry(width + lip, lip, depth + lip);
  const centerX = left + width / 2;
  const centerZ = top + depth / 2;
  // Ust yuzu karolarin hemen altinda (zemin -0,4'te).
  const slab = new THREE.Mesh(body, bodyMaterial);
  slab.position.set(centerX, -0.6 - lip - thickness / 2, centerZ);
  const trim = new THREE.Mesh(edge, lipMaterial);
  trim.position.set(centerX, -0.6 - lip / 2, centerZ);
  slab.receiveShadow = trim.receiveShadow = true;
  group.add(slab, trim);
  return {
    group,
    dispose() {
      body.dispose();
      edge.dispose();
      bodyMaterial.dispose();
      lipMaterial.dispose();
    }
  };
}

/**
 * Tepe bloklari: her tepe karesi ayri, yuvarlak koseli ve kenari pahli bir
 * dikdortgen prizma (aralarinda ince bosluk); ustu acik, yanlari koyu arduvaz.
 * Olcu dunya biriminde (`ZoneLayout.hills`).
 */
export function createZoneBlocks(layout: ZoneLayout, input: { cellSize: number; originX: number; originY: number }) {
  const { cellSize, originX, originY } = input;
  const group = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ color: 0x4b5568, roughness: 0.82, metalness: 0.08 });
  const side = new THREE.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.88, metalness: 0.06 });
  const geometries: THREE.BufferGeometry[] = [];
  const half = cellSize * 0.45;
  const round = cellSize * 0.09;
  const bevel = cellSize * 0.035;
  for (const hill of layout.hills) {
    const shape = new THREE.Shape();
    shape.moveTo(-half + round, -half);
    shape.lineTo(half - round, -half);
    shape.quadraticCurveTo(half, -half, half, -half + round);
    shape.lineTo(half, half - round);
    shape.quadraticCurveTo(half, half, half - round, half);
    shape.lineTo(-half + round, half);
    shape.quadraticCurveTo(-half, half, -half, half - round);
    shape.lineTo(-half, -half + round);
    shape.quadraticCurveTo(-half, -half, -half + round, -half);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(bevel, hill.height - bevel * 2), bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
    // Ekstruzyon +Z'de; dondurunce +Y (yukari), taban zeminde.
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(originX + (hill.col + 0.5) * cellSize, bevel, originY + (hill.row + 0.5) * cellSize);
    geometries.push(geometry);
    // Grup 0 kapaklar (ust/alt), grup 1 yanlar ve pah.
    const mesh = new THREE.Mesh(geometry, [top, side]);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      top.dispose();
      side.dispose();
    }
  };
}

/** Kaidenin boyu (hucre); model bu kadar kaldiriliyor. */
export const PLINTH_HEIGHT_CELLS = 0.1;

/**
 * Kule kaidesi: yuvarlak koseli koyu kare ve ustunde kulenin kimlik renginde
 * parlayan yuvarlak koseli halka. Kademeyle zenginlesiyor: 1'de sade ve sonuk
 * halka, 2'de parlak halka ve kose cubuklari, 3'te genis alt basamak ve
 * koselerde parlayan kristaller. Olcu birimi hucre (sahnede hucre boyuyla olceklenir).
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
  type Parts = { slab: THREE.BufferGeometry; ring: THREE.BufferGeometry; stud: THREE.BufferGeometry; skirt: THREE.BufferGeometry; crystal: THREE.BufferGeometry; half: number; depth: number };
  const geometries = new Map<number, Parts>();
  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0x283041, roughness: 0.62, metalness: 0.25 });
  const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2330, roughness: 0.7, metalness: 0.2 });
  const glowMaterials = new Map<string, THREE.MeshStandardMaterial>();
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
      const stud = new THREE.CylinderGeometry(0.03, 0.036, 0.03, 10);
      stud.translate(0, depth + 0.04, 0);
      const skirt = new THREE.ExtrudeGeometry(roundedSquare(half + 0.05, 0.12 * span), { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 6 });
      skirt.rotateX(-Math.PI / 2);
      const crystal = new THREE.OctahedronGeometry(0.045, 0);
      crystal.scale(1, 1.9, 1);
      crystal.translate(0, 0.13, 0);
      entry = { slab, ring, stud, skirt, crystal, half, depth };
      geometries.set(span, entry);
    }
    return entry;
  };
  const glowMaterial = (accent: number, intensity: number) => {
    const key = `${accent}:${intensity}`;
    let material = glowMaterials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: intensity, roughness: 0.4, metalness: 0 });
      glowMaterials.set(key, material);
    }
    return material;
  };
  return {
    create(accent: number, span: number, tier: 1 | 2 | 3 = 2) {
      const parts = geometry(span);
      const group = new THREE.Group();
      const slab = new THREE.Mesh(parts.slab, slabMaterial);
      slab.castShadow = slab.receiveShadow = true;
      // Halka: 1'de parlama esiginin altinda (sade), 2-3'te yayiliyor.
      group.add(slab, new THREE.Mesh(parts.ring, glowMaterial(accent, tier === 1 ? 0.55 : tier === 2 ? 1.3 : 1.5)));
      if (tier >= 2) {
        const corner = parts.half * 0.86 - 0.075 * span;
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const stud = new THREE.Mesh(parts.stud, glowMaterial(accent, tier === 3 ? 1.5 : 1.3));
          stud.position.set(sx * corner, 0, sz * corner);
          group.add(stud);
        }
      }
      if (tier === 3) {
        const skirt = new THREE.Mesh(parts.skirt, skirtMaterial);
        skirt.receiveShadow = true;
        group.add(skirt);
        const corner = parts.half + 0.01;
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const crystal = new THREE.Mesh(parts.crystal, glowMaterial(accent, 1.6));
          crystal.position.set(sx * corner, 0, sz * corner);
          crystal.rotation.y = Math.PI / 4;
          group.add(crystal);
        }
      }
      return group;
    },
    dispose() {
      geometries.forEach((entry) => { entry.slab.dispose(); entry.ring.dispose(); entry.stud.dispose(); entry.skirt.dispose(); entry.crystal.dispose(); });
      slabMaterial.dispose();
      skirtMaterial.dispose();
      glowMaterials.forEach((material) => material.dispose());
    }
  };
}

/**
 * Hedef stil modelin isimasini oyunun isigina gore ayarlar (modelde 2,2 yaziyor;
 * parlama gecisiyle birlikte cam kubbeler beyaza patliyordu). `glow` kademe carpani
 * (kademe 1 sonuk, 3 parlak). Malzemeler modelin butun kopyalarinca paylasiliyor;
 * bir kez cagirmak yetiyor.
 */
export function tuneTargetMaterials(model: THREE.Object3D, glow = 1) {
  model.traverse((node: THREE.Object3D) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material?.emissiveMap) material.emissiveIntensity = TARGET_LIGHT.towerGlow * glow;
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
 * vuruslar baslayinca ekran karariyordu). Yuksek piksel oraninda (`antialias`
 * kapali) FXAA atlaniyor: kenarlar zaten ince, goruntu daha keskin ve ucuz.
 * Parlama ekranin CSS boyutunun yarisinda (telefonda ceyregi), piksel oraniyla buyumuyor.
 */
export function createBloom(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Object3D, coarsePointer: boolean) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), TARGET_LIGHT.bloomStrength, TARGET_LIGHT.bloomRadius, TARGET_LIGHT.bloomThreshold);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fxaa = new FXAAPass();
  composer.addPass(fxaa);
  let size = "";
  return {
    render(width: number, height: number, antialias = true) {
      const key = `${width}x${height}@${renderer.getPixelRatio()}`;
      if (key !== size) {
        size = key;
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(width, height);
        // Parlama yayilimi yumusak: CSS boyutunun yarisi (telefonda ceyregi) yetiyor.
        const scale = coarsePointer ? 0.25 : 0.5;
        bloom.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      }
      fxaa.enabled = antialias;
      composer.render();
    },
    dispose() {
      bloom.dispose();
      composer.dispose();
      target.dispose();
    }
  };
}
