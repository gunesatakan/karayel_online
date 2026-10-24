import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { TOWER_SCALE, ENEMY_SCALE } from "./layout.js";

const standard = (color, metalness = 0.65, roughness = 0.5) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
export const materials = {
  metal: standard(0x35454b),
  edge: standard(0x708182, 0.8, 0.32),
  dark: standard(0x141f26, 0.75, 0.43),
  armor: standard(0x8b9c90, 0.58, 0.56),
  brass: standard(0xb99b64, 0.72, 0.4),
  black: standard(0x0c151a, 0.4, 0.62),
  enemy: standard(0x935c45, 0.65, 0.48),
  enemyEdge: standard(0xd29467, 0.65, 0.4),
  cyan: new THREE.MeshStandardMaterial({
    color: 0x89e8f2,
    emissive: 0x46d5e8,
    emissiveIntensity: 3,
    roughness: 0.28,
  }),
  amber: new THREE.MeshStandardMaterial({
    color: 0xffdba0,
    emissive: 0xffad41,
    emissiveIntensity: 3.3,
  }),
  red: new THREE.MeshStandardMaterial({
    color: 0xff8d5e,
    emissive: 0xff4a19,
    emissiveIntensity: 3,
  }),
};

export function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

export function box(parent, size, position, material, radius = 0.04) {
  return mesh(
    parent,
    new RoundedBoxGeometry(...size, 1, radius),
    material,
    ...position,
  );
}
export function cylinder(
  parent,
  top,
  bottom,
  height,
  position,
  material,
  segments = 12,
) {
  return mesh(
    parent,
    new THREE.CylinderGeometry(top, bottom, height, segments),
    material,
    ...position,
  );
}
export function rod(parent, from, to, radius, material, segments = 8) {
  const a = new THREE.Vector3(...from),
    b = new THREE.Vector3(...to);
  const object = cylinder(
    parent,
    radius,
    radius,
    a.distanceTo(b),
    [0, 0, 0],
    material,
    segments,
  );
  object.position.copy(a).add(b).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.sub(a).normalize(),
  );
  return object;
}
function ring(parent, radius, tube, y, material) {
  const object = mesh(
    parent,
    new THREE.TorusGeometry(radius, tube, 6, 48),
    material,
    0,
    y,
    0,
  );
  object.rotation.x = Math.PI / 2;
  return object;
}

export function buildTower() {
  const root = new THREE.Group();
  const m = materials;
  cylinder(root, 1.22, 1.34, 0.22, [0, 0.12, 0], m.dark, 8);
  cylinder(root, 1.14, 1.23, 0.13, [0, 0.28, 0], m.edge, 8);
  cylinder(root, 0.86, 1.02, 0.28, [0, 0.46, 0], m.metal, 8);
  ring(root, 1.06, 0.025, 0.36, m.cyan);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Group();
    leg.rotation.y = Math.PI / 4 + (i * Math.PI) / 2;
    root.add(leg);
    box(leg, [0.45, 0.22, 0.65], [0, 0.17, 1.13], m.armor);
    box(leg, [0.32, 0.06, 0.36], [0, 0.3, 1.21], m.dark);
    rod(leg, [0, 0.42, 0.55], [0, 0.31, 1.15], 0.095, m.edge);
    cylinder(leg, 0.055, 0.055, 0.045, [0, 0.35, 1.25], m.brass, 8);
  }
  cylinder(root, 0.46, 0.7, 0.59, [0, 0.83, 0], m.armor, 8);
  cylinder(root, 0.55, 0.55, 0.12, [0, 1.17, 0], m.dark, 16);
  ring(root, 0.52, 0.035, 1.23, m.cyan);
  const yaw = new THREE.Group();
  yaw.position.y = 1.3;
  root.add(yaw);
  box(yaw, [1.62, 0.62, 1.25], [0, 0.32, -0.05], m.metal, 0.09);
  box(yaw, [1.24, 0.21, 1.07], [0, 0.72, -0.1], m.armor, 0.065);
  box(yaw, [0.66, 0.17, 0.56], [0, 0.86, -0.13], m.dark);
  box(yaw, [0.44, 0.04, 0.31], [0, 0.96, -0.08], m.brass, 0.01);
  for (const side of [-1, 1]) {
    const plate = box(
      yaw,
      [0.26, 0.58, 1.17],
      [side * 0.86, 0.38, -0.1],
      m.armor,
      0.05,
    );
    plate.rotation.z = -side * 0.12;
    box(yaw, [0.03, 0.05, 0.74], [side * 1.01, 0.4, -0.12], m.cyan, 0.01);
    for (let i = 0; i < 5; i++)
      box(
        yaw,
        [0.23, 0.08, 0.045],
        [side * 0.76, 0.76, -0.47 + i * 0.14],
        m.dark,
        0.008,
      );
    cylinder(
      yaw,
      0.16,
      0.16,
      0.14,
      [side * 0.92, 0.36, 0.44],
      m.brass,
    ).rotation.z = Math.PI / 2;
    for (let i = 0; i < 3; i++)
      cylinder(
        yaw,
        0.045,
        0.045,
        0.025,
        [side * 0.72, 0.64, -0.4 + i * 0.38],
        m.edge,
      );
  }
  const barrels = new THREE.Group();
  yaw.add(barrels);
  for (const side of [-1, 1]) {
    box(barrels, [0.34, 0.3, 0.84], [side * 0.26, 0.56, 0.79], m.dark, 0.025);
    rod(
      barrels,
      [side * 0.26, 0.56, 0.75],
      [side * 0.26, 0.56, 1.62],
      0.1,
      m.edge,
      12,
    );
    for (let i = 0; i < 4; i++) {
      const r = cylinder(
        barrels,
        0.135,
        0.135,
        0.07,
        [side * 0.26, 0.56, 0.95 + i * 0.15],
        m.dark,
        12,
      );
      r.rotation.x = Math.PI / 2;
    }
    box(barrels, [0.27, 0.28, 0.2], [side * 0.26, 0.56, 1.61], m.armor, 0.02);
    const hole = cylinder(
      barrels,
      0.085,
      0.085,
      0.015,
      [side * 0.26, 0.56, 1.718],
      m.black,
      12,
    );
    hole.rotation.x = Math.PI / 2;
    box(barrels, [0.07, 0.04, 0.25], [side * 0.26, 0.73, 0.78], m.amber, 0.005);
  }
  box(yaw, [0.29, 0.25, 0.48], [0, 0.24, 0.88], m.dark);
  const lens = cylinder(yaw, 0.1, 0.1, 0.025, [0, 0.24, 1.135], m.cyan, 16);
  lens.rotation.x = Math.PI / 2;
  rod(yaw, [-0.62, 0.7, -0.5], [-0.62, 1.23, -0.5], 0.022, m.edge);
  mesh(yaw, new THREE.SphereGeometry(0.055, 8, 6), m.cyan, -0.62, 1.25, -0.5);
  const flash = mesh(
    yaw,
    new THREE.SphereGeometry(0.17, 12, 8),
    m.amber,
    0,
    0.56,
    1.76,
  );
  flash.visible = false;
  flash.castShadow = false;
  const light = new THREE.PointLight(0xffb45b, 0, 4, 2);
  light.position.set(0, 0.65, 1.8);
  yaw.add(light);
  root.scale.setScalar(TOWER_SCALE);
  return { root, yaw, barrels, flash, light };
}

export function buildEnemy() {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const m = materials;
  const armorMaterial = m.enemy.clone();
  const core = box(body, [1.02, 0.74, 1.25], [0, 1.05, 0], armorMaterial, 0.12);
  box(body, [0.78, 0.18, 1.05], [0, 1.51, -0.05], m.enemyEdge, 0.05);
  box(body, [0.59, 0.13, 0.85], [0, 1.66, -0.08], m.dark);
  for (let i = 0; i < 4; i++)
    box(body, [0.64, 0.035, 0.07], [0, 1.75, -0.37 + i * 0.19], m.edge, 0.005);
  box(body, [0.78, 0.37, 0.2], [0, 1.06, 0.69], m.dark, 0.06);
  box(body, [0.51, 0.055, 0.04], [0, 1.13, 0.803], m.red, 0.008);
  box(body, [0.31, 0.13, 0.15], [0, 0.83, 0.72], m.enemyEdge);
  for (const side of [-1, 1]) {
    const plate = box(
      body,
      [0.26, 0.67, 1.02],
      [side * 0.64, 1.18, -0.01],
      m.enemy,
      0.06,
    );
    plate.rotation.z = side * 0.18;
    rod(
      body,
      [side * 0.53, 0.91, -0.5],
      [side * 0.53, 1.65, -0.6],
      0.1,
      m.dark,
    );
    cylinder(body, 0.105, 0.105, 0.04, [side * 0.53, 1.68, -0.6], m.red);
    for (let i = 0; i < 3; i++)
      box(
        body,
        [0.035, 0.16, 0.035],
        [side * 0.8, 1.21, -0.25 + i * 0.19],
        m.brass,
        0.005,
      );
  }
  const legs = [];
  for (const side of [-1, 1])
    for (const front of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.43, 0.82, front * 0.43);
      root.add(pivot);
      const knee = [side * 0.53, -0.18, front * 0.18],
        foot = [side * 0.68, -0.68, front * 0.23];
      rod(pivot, [0, 0, 0], knee, 0.13, m.dark);
      rod(pivot, knee, foot, 0.095, m.edge);
      mesh(pivot, new THREE.SphereGeometry(0.19, 8, 6), m.enemyEdge, ...knee);
      box(
        pivot,
        [0.32, 0.16, 0.43],
        [foot[0], foot[1] - 0.04, foot[2] + 0.1],
        m.dark,
      );
      rod(
        pivot,
        [side * 0.13, 0.07, 0],
        [side * 0.48, -0.28, front * 0.2],
        0.045,
        m.brass,
      );
      legs.push({ pivot, side, front });
    }
  root.scale.setScalar(ENEMY_SCALE);
  return { root, body, legs, core, armorMaterial };
}
