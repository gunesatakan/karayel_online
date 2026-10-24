import * as THREE from "three";
import { box, cylinder, materials, mesh } from "./models.js";
import {
  MAP,
  MAP_WIDTH,
  MAP_DEPTH,
  TOWER_POSITION,
  CELL_SIZE,
} from "./layout.js";

function tileTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#737f7a";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 853;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = random() > 0.5 ? "#122d2414" : "#e6edd51a";
    ctx.fillRect(
      random() * 256,
      random() * 256,
      1 + random() * 3,
      1 + random() * 3,
    );
  }
  ctx.strokeStyle = "#283b37";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeStyle = "#afbeb344";
  ctx.lineWidth = 1;
  ctx.strokeRect(3, 3, 250, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(MAP.cols, MAP.rows);
  texture.anisotropy = 4;
  return texture;
}

export function buildArena(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const w = MAP_WIDTH,
    d = MAP_DEPTH,
    m = materials;
  box(root, [w + 0.2, 0.48, d + 0.2], [0, -0.27, 0], m.black, 0.08);
  const floor = mesh(
    root,
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({
      map: tileTexture(),
      color: 0x9baba1,
      roughness: 0.9,
      metalness: 0.12,
    }),
    0,
    0.012,
    0,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  // Explicit lines, not only a decorative texture: exactly one grid cell per tile.
  const vertices = [];
  for (let col = 0; col <= MAP.cols; col++) {
    const x = -w / 2 + col * CELL_SIZE;
    vertices.push(x, 0.025, -d / 2, x, 0.025, d / 2);
  }
  for (let row = 0; row <= MAP.rows; row++) {
    const z = -d / 2 + row * CELL_SIZE;
    vertices.push(-w / 2, 0.025, z, w / 2, 0.025, z);
  }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    ),
    new THREE.LineBasicMaterial({
      color: 0x203b34,
      transparent: true,
      opacity: 0.68,
    }),
  );
  root.add(grid);
  for (const side of [-1, 1]) {
    box(
      root,
      [w + 0.16, 0.09, 0.08],
      [0, 0.02, side * (d / 2 + 0.04)],
      m.dark,
      0.01,
    );
    box(root, [0.08, 0.09, d], [side * (w / 2 + 0.04), 0.02, 0], m.dark, 0.01);
    for (let i = 0; i < MAP.cols; i += 2)
      box(
        root,
        [0.35, 0.02, 0.025],
        [-w / 2 + i + 0.5, 0.08, side * (d / 2 + 0.04)],
        m.cyan,
        0.003,
      );
    for (let i = 0; i < MAP.rows; i += 3)
      box(
        root,
        [0.025, 0.02, 0.35],
        [side * (w / 2 + 0.04), 0.08, -d / 2 + i + 0.5],
        m.cyan,
        0.003,
      );
  }
  // The real open arena uses the first row as spawn and the last as nexus.
  for (const [z, color] of [
    [-d / 2 + 0.5, 0x8e6748],
    [d / 2 - 0.5, 0x548d8e],
  ]) {
    const strip = mesh(
      root,
      new THREE.PlaneGeometry(w - 0.04, 0.96),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
      0,
      0.028,
      z,
    );
    strip.rotation.x = -Math.PI / 2;
    strip.castShadow = false;
  }
  const cell = mesh(
    root,
    new THREE.PlaneGeometry(0.98, 0.98),
    new THREE.MeshBasicMaterial({
      color: 0xe3b66e,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
    TOWER_POSITION.x,
    0.035,
    TOWER_POSITION.z,
  );
  cell.rotation.x = -Math.PI / 2;
  cell.castShadow = false;
  for (const side of [-1, 1]) {
    box(
      root,
      [0.98, 0.009, 0.012],
      [TOWER_POSITION.x, 0.044, TOWER_POSITION.z + side * 0.484],
      m.brass,
      0.001,
    );
    box(
      root,
      [0.012, 0.009, 0.98],
      [TOWER_POSITION.x + side * 0.484, 0.044, TOWER_POSITION.z],
      m.brass,
      0.001,
    );
  }
  // The base is part of the one-cell footprint; no oversized platform or cable.
  cylinder(
    root,
    0.42,
    0.44,
    0.035,
    [TOWER_POSITION.x, 0.045, TOWER_POSITION.z],
    m.dark,
    8,
  );
  cylinder(
    root,
    0.4,
    0.4,
    0.02,
    [TOWER_POSITION.x, 0.065, TOWER_POSITION.z],
    m.metal,
    8,
  );
  for (const x of [-w / 2 - 0.3, w / 2 + 0.3])
    for (const z of [-d / 2 - 0.3, d / 2 + 0.3]) {
      cylinder(root, 0.07, 0.13, 0.4, [x, -0.05, z], m.dark, 8);
      cylinder(root, 0.08, 0.08, 0.06, [x, 0.18, z], m.amber, 8);
    }
  return root;
}
