import * as THREE from "three";
import { box, materials, mesh } from "./models.js";
import { MAP, MAP_WIDTH, MAP_DEPTH, TOWER_POSITION, CELL_SIZE } from "./layout.js";
import { STAGE_ASSETS } from "./asset-catalog.js";

export async function buildArena(scene, anisotropy = 4) {
  const loader = new THREE.TextureLoader();
  // No tiling, cropping or displacement: same image footprint as GameScene.
  const textures = await Promise.all(STAGE_ASSETS.map(async (asset) => {
    const texture = await loader.loadAsync(asset.texture);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  }));
  const root = new THREE.Group();
  scene.add(root);
  const w = MAP_WIDTH, d = MAP_DEPTH;
  box(root, [w, 0.34, d], [0, -0.18, 0], materials.black, 0.05);
  const floor = mesh(root, new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({
    map: textures[0], color: 0xb8b8b8, roughness: 0.95, metalness: 0,
  }), 0, 0.012, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const vertices = [];
  for (let col = 0; col <= MAP.cols; col++) {
    const x = -w / 2 + col * CELL_SIZE;
    vertices.push(x, 0.025, -d / 2, x, 0.025, d / 2);
  }
  for (let row = 0; row <= MAP.rows; row++) {
    const z = -d / 2 + row * CELL_SIZE;
    vertices.push(-w / 2, 0.025, z, w / 2, 0.025, z);
  }
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)), new THREE.LineBasicMaterial({ color: 0xb9c5b0, transparent: true, opacity: 0.19 }));
  root.add(grid);
  // Match the game's edge cues; spawn/nexus rows are not painted over.
  for (const side of [-1, 1]) {
    box(root, [w, 0.022, 0.022], [0, 0.025, side * d / 2], new THREE.MeshBasicMaterial({ color: side < 0 ? 0x67e8f9 : 0xf9a8d4 }), 0.001);
    box(root, [0.016, 0.018, d], [side * w / 2, 0.025, 0], new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.34 }), 0.001);
  }
  const footprint = new THREE.Group();
  footprint.position.set(TOWER_POSITION.x, 0, TOWER_POSITION.z);
  root.add(footprint);
  const cell = mesh(footprint, new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ color: 0xe3b66e, transparent: true, opacity: 0.09, depthWrite: false }), 0, 0.035, 0);
  cell.rotation.x = -Math.PI / 2;
  cell.castShadow = false;
  for (const side of [-1, 1]) {
    box(footprint, [0.98, 0.009, 0.012], [0, 0.044, side * 0.484], materials.brass, 0.001);
    box(footprint, [0.012, 0.009, 0.98], [side * 0.484, 0.044, 0], materials.brass, 0.001);
  }
  return {
    root, grid, floor,
    setFootprint({ position, span }) {
      footprint.position.set(position.x, 0, position.z);
      footprint.scale.set(span, 1, span);
    },
    setStage(id) {
      if (!textures[id - 1]) throw new Error(`Unknown stage ${id}`);
      floor.material.map = textures[id - 1];
    },
  };
}
