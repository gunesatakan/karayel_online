import * as THREE from "three";
import { mesh, box, cylinder, rod } from "./models.js";
import { TOWER_SCALE } from "./layout.js";
import { TOWER_ASSETS } from "./asset-catalog.js";

const metal = (color, roughness = 0.47, metalness = 0.72) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const palette = {
  iron: metal(0x4b514b), dark: metal(0x182a29), black: metal(0x091716),
  green: metal(0x386e59), jade: metal(0x629179), brass: metal(0xb69a58, 0.35),
  copper: metal(0x9e5039), copperLight: metal(0xb46b48), copperDark: metal(0x754230),
  purple: metal(0x744b86, 0.39), purpleLight: metal(0xa46b9b, 0.4),
  cyan: new THREE.MeshStandardMaterial({ color: 0x71dcdd, emissive: 0x24baca, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.3 }),
  blueGlass: new THREE.MeshStandardMaterial({ color: 0x2688a5, emissive: 0x00789e, emissiveIntensity: 0.5, roughness: 0.24, metalness: 0.45 }),
  violet: new THREE.MeshStandardMaterial({ color: 0xcc96ed, emissive: 0x9b38d2, emissiveIntensity: 1, roughness: 0.3 }),
};

function ring(parent, radius, tube, y, material, segments = 48) {
  const object = mesh(parent, new THREE.TorusGeometry(radius, tube, 6, segments), material, 0, y, 0);
  object.rotation.x = Math.PI / 2;
  return object;
}
function radial(parent, count, callback, offset = 0) {
  for (let i = 0; i < count; i++) {
    const group = new THREE.Group();
    group.rotation.y = offset + i * Math.PI * 2 / count;
    parent.add(group);
    callback(group, i);
  }
}
function bolt(parent, x, y, z, size = 0.065) {
  cylinder(parent, size, size, 0.035, [x, y, z], palette.brass, 6);
}
function plinth(root, copper = false) {
  const p = palette;
  cylinder(root, 1.99, 2.02, 0.15, [0, 0.075, 0], p.dark, 48);
  cylinder(root, 1.9, 1.98, 0.22, [0, 0.26, 0], p.iron, 48);
  cylinder(root, 1.85, 1.9, 0.12, [0, 0.43, 0], copper ? p.copperDark : p.green, 48);
  ring(root, 1.91, 0.055, 0.45, p.brass);
  radial(root, 16, (g) => {
    box(g, [0.12, 0.18, 0.09], [0, 0.27, 1.94], p.dark, 0.01);
    bolt(g, 0, 0.49, 1.79);
  });
  if (copper) {
    // Three concentric bands of real bevelled roof tiles, following the sprite.
    for (let band = 0; band < 3; band++) {
      const inner = 0.67 + band * 0.38, outer = inner + 0.37;
      radial(root, 20, (g, i) => {
        const shape = new THREE.Shape();
        const half = Math.PI / 20 - 0.008;
        shape.moveTo(Math.sin(-half) * inner, Math.cos(-half) * inner);
        shape.lineTo(Math.sin(-half) * outer, Math.cos(-half) * outer);
        shape.lineTo(Math.sin(half) * outer, Math.cos(half) * outer);
        shape.lineTo(Math.sin(half) * inner, Math.cos(half) * inner);
        shape.closePath();
        const tile = mesh(g, new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.013, bevelThickness: 0.012, bevelSegments: 1, steps: 1 }), [p.copper, p.copperLight, p.copperDark][(i + band) % 3], 0, 0.58 - band * 0.035, 0);
        tile.rotation.x = -Math.PI / 2;
      }, band % 2 ? Math.PI / 20 : 0);
    }
  }
}
function bearing(root, radius = 0.8, height = 0.95) {
  cylinder(root, radius, radius + 0.1, height - 0.48, [0, (height + 0.48) / 2, 0], palette.green, 32);
  ring(root, radius, 0.065, height, palette.brass);
  radial(root, 8, (g) => bolt(g, 0, height + 0.03, radius - 0.12));
}
function lens(parent, x, y, z, radius, glow = palette.cyan) {
  rod(parent, [x, y, z - 0.1], [x, y, z], radius * 1.28, palette.brass, 24);
  rod(parent, [x, y, z], [x, y, z + 0.015], radius, glow, 24);
}
function coil(parent, radius, y, z, length, color = palette.copperLight) {
  rod(parent, [0, y, z - length / 2], [0, y, z + length / 2], radius * 0.76, palette.dark);
  for (let i = 0; i < 9; i++) {
    const r = mesh(parent, new THREE.TorusGeometry(radius, 0.035, 5, 16), color, 0, y, z - length / 2 + i * length / 8);
    r.rotation.z = 0.12;
  }
}

export function buildTower(id = "warrior-1") {
  const asset = TOWER_ASSETS.find((item) => item.id === id);
  if (!asset) throw new Error(`Unknown tower asset: ${id}`);
  const p = palette, root = new THREE.Group(), yaw = new THREE.Group(), barrels = new THREE.Group();
  root.name = id;
  root.userData = { assetId: id, sourceArt: asset.art, tier: "levels-1-4", footprintCells: asset.footprintSpan ** 2, authoredSides: true };
  yaw.name = "turret-yaw";
  barrels.name = "barrels-recoil";
  root.add(yaw);
  yaw.add(barrels);
  plinth(root, id === "warrior-1" || id === "warrior-6");

  if (id === "warrior-1") {
    bearing(root, 0.82, 1.12);
    cylinder(yaw, 0.69, 0.78, 0.35, [0, 1.3, 0], p.jade, 24);
    box(yaw, [1.08, 0.6, 1.15], [0, 1.62, -0.13], p.green, 0.14);
    box(yaw, [0.75, 0.13, 0.8], [0, 1.96, -0.16], p.jade, 0.06);
    for (const side of [-1, 1]) {
      box(yaw, [0.17, 0.31, 0.76], [side * 0.58, 1.66, -0.2], p.brass);
      rod(barrels, [side * 0.25, 1.86, 0.22], [side * 0.25, 1.86, 1.66], 0.14, p.green, 16);
      for (let i = 0; i < 4; i++) rod(barrels, [side * 0.25, 1.86, 0.48 + i * 0.22], [side * 0.25, 1.86, 0.57 + i * 0.22], 0.18, p.jade, 16);
      lens(barrels, side * 0.25, 1.86, 1.69, 0.115, p.black);
      for (let i = 0; i < 3; i++) bolt(yaw, side * 0.36, 2.04, -0.4 + i * 0.25, 0.045);
    }
    cylinder(yaw, 0.22, 0.26, 0.08, [0, 2.08, -0.25], p.brass, 16);
  } else if (id === "warrior-2") {
    bearing(root, 1.38, 0.88);
    cylinder(root, 1.17, 1.35, 0.35, [0, 1.05, 0], p.dark, 32);
    ring(root, 1.2, 0.1, 1.26, p.jade);
    ring(root, 0.94, 0.07, 1.38, p.brass);
    radial(root, 12, (g) => {
      box(g, [0.17, 0.36, 0.48], [0, 1.3, 1.26], p.green);
      box(g, [0.06, 0.06, 0.27], [0, 1.5, 1.26], p.cyan, 0.01);
    });
    cylinder(yaw, 0.58, 0.78, 0.5, [0, 1.59, 0], p.green, 24);
    ring(yaw, 0.58, 0.07, 1.86, p.brass);
    const orb = mesh(yaw, new THREE.SphereGeometry(0.42, 24, 12), p.cyan, 0, 1.95, 0);
    orb.scale.y = 0.6;
    radial(yaw, 4, (g) => rod(g, [0, 1.58, 0.69], [0, 2.2, 0.47], 0.065, p.brass));
    ring(yaw, 0.46, 0.035, 2.21, p.jade);
  } else if (id === "warrior-3") {
    cylinder(root, 1.7, 1.8, 0.08, [0, 0.55, 0], p.iron, 48);
    radial(root, 4, (g) => {
      box(g, [0.65, 0.2, 0.87], [0, 0.7, 1.19], p.dark);
      box(g, [0.77, 0.1, 0.18], [0, 0.85, 0.8], p.brass);
      box(g, [0.77, 0.1, 0.18], [0, 0.85, 1.58], p.brass);
      coil(g, 0.29, 1, 1.19, 0.6);
      rod(g, [0, 0.8, 0.72], [0, 1.49, 0.43], 0.09, p.jade);
    });
    bearing(root, 0.6, 1.14);
    cylinder(yaw, 0.48, 0.6, 0.48, [0, 1.43, 0], p.green, 24);
    ring(yaw, 0.48, 0.075, 1.7, p.brass);
    const core = mesh(yaw, new THREE.SphereGeometry(0.38, 24, 12), p.cyan, 0, 1.79, 0);
    core.scale.y = 0.55;
  } else if (id === "warrior-4") {
    radial(root, 12, (g, i) => {
      const plate = box(g, [0.52, 0.19, 0.88], [0, 0.69, 1.25], i % 2 ? p.purple : p.purpleLight);
      plate.rotation.x = 0.12;
      bolt(g, 0, 0.86, 1.48);
    });
    bearing(root, 0.93, 1.14);
    cylinder(yaw, 0.75, 0.87, 0.33, [0, 1.35, 0], p.brass, 24);
    cylinder(yaw, 0.62, 0.7, 0.2, [0, 1.59, 0], p.green, 24);
    ring(yaw, 0.58, 0.06, 1.74, p.purpleLight);
    box(yaw, [0.65, 0.44, 0.7], [0, 1.84, 0.14], p.green, 0.1);
    rod(barrels, [0, 1.85, 0.35], [0, 1.85, 1.48], 0.22, p.brass, 16);
    rod(barrels, [0, 1.85, 0.63], [0, 1.85, 1.25], 0.17, p.green, 16);
    lens(barrels, 0, 1.85, 1.59, 0.17, p.violet);
    mesh(yaw, new THREE.SphereGeometry(0.23, 16, 8), p.cyan, 0, 2.06, -0.15).scale.y = 0.5;
  } else if (id === "warrior-5") {
    ring(root, 1.68, 0.08, 0.78, p.green);
    radial(root, 16, (g) => {
      rod(g, [0, 0.85, 0.76], [0, 0.71, 1.63], 0.105, p.blueGlass, 12);
      rod(g, [0, 0.86, 0.73], [0, 0.85, 0.88], 0.145, p.brass, 12);
      rod(g, [0, 0.72, 1.52], [0, 0.7, 1.69], 0.145, p.green, 12);
      box(g, [0.1, 0.08, 0.24], [0, 0.64, 1.74], p.brass, 0.01);
    });
    bearing(root, 0.76, 1.25);
    cylinder(yaw, 0.57, 0.71, 0.36, [0, 1.47, 0], p.jade, 24);
    box(yaw, [0.66, 0.4, 0.83], [0, 1.82, 0.13], p.green, 0.1);
    rod(barrels, [0, 1.86, 0.39], [0, 1.86, 1.6], 0.19, p.green, 16);
    lens(barrels, 0, 1.86, 1.61, 0.155);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.position.set(0, 1.86, 0.65 + i * 0.18);
      mesh(g, new THREE.TorusGeometry(0.22, 0.04, 6, 20), p.brass);
      barrels.add(g);
    }
    cylinder(yaw, 0.34, 0.38, 0.1, [0, 2.04, 0], p.green, 20);
    ring(yaw, 0.34, 0.04, 2.09, p.brass);
  } else if (id === "warrior-6") {
    bearing(root, 1.02, 1.06);
    const dome = mesh(yaw, new THREE.SphereGeometry(0.98, 24, 16), p.green, 0, 1.49, -0.12);
    dome.scale.set(1, 0.65, 0.85);
    cylinder(yaw, 0.34, 0.45, 0.14, [0, 2.15, -0.14], p.brass, 12);
    cylinder(yaw, 0.2, 0.27, 0.08, [0, 2.27, -0.14], p.jade, 12);
    radial(yaw, 3, (g) => {
      box(g, [0.46, 0.25, 0.7], [0, 1.3, 1.08], p.green, 0.1);
      coil(g, 0.18, 1.51, 1.12, 0.56, p.jade);
      rod(g, [0, 1.5, 0.72], [0, 1.5, 0.85], 0.22, p.brass);
    }, Math.PI / 3);
    rod(barrels, [0, 2.08, 0.08], [0, 2.08, 1.53], 0.24, p.green, 20);
    rod(barrels, [0, 2.08, 0.86], [0, 2.08, 1.11], 0.29, p.jade, 20);
    lens(barrels, 0, 2.08, 1.64, 0.2, p.black);
    for (const side of [-1, 1]) rod(yaw, [side * 0.55, 1.8, -0.5], [side * 0.58, 1.76, 0.45], 0.045, p.brass);
  }

  const muzzle = new THREE.Object3D();
  muzzle.name = "muzzle-socket";
  muzzle.position.set(0, asset.muzzle.height, asset.muzzle.length);
  barrels.add(muzzle);
  root.scale.setScalar(TOWER_SCALE * asset.footprintSpan);
  root.updateMatrixWorld(true);
  return { root, yaw, barrels, muzzle, asset };
}
