import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  MAP,
  CELL_SIZE,
  TOWER_CELL,
  TOWER_POSITION,
  cellCenter,
  worldToScene,
  sceneToWorld,
} from "../src/layout.js";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TOWER_ASSETS } from "../src/asset-catalog.js";

test("real arena dimensions, cell pitch and reversible world coordinates are preserved", () => {
  assert.deepEqual([MAP.cols, MAP.rows, MAP.cellSize], [12, 18, 34]);
  assert.deepEqual([MAP.bounds.width, MAP.bounds.height], [408, 612]);
  for (let row = 0; row < MAP.rows; row++)
    for (let col = 0; col < MAP.cols; col++) {
      const world = {
        x: MAP.origin.x + (col + 0.5) * 34,
        y: MAP.origin.y + (row + 0.5) * 34,
      };
      const point = worldToScene(world.x, world.y);
      assert.deepEqual(sceneToWorld(point.x, point.z), world);
      assert.deepEqual(point, cellCenter(col, row));
    }
  assert.deepEqual(TOWER_POSITION, cellCenter(TOWER_CELL.col, TOWER_CELL.row));
});

for (const asset of TOWER_ASSETS) test(`${asset.id}: exported GLB, recoil and muzzle effects fit one cell at every heading`, async () => {
  const bytes = readFileSync(new URL(`../public/${asset.model}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const root = gltf.scene.getObjectByName(asset.id);
  const yaw = root.getObjectByName("turret-yaw"), barrels = root.getObjectByName("barrels-recoil");
  const socket = root.getObjectByName("muzzle-socket");
  assert.ok(yaw && barrels && socket);
  assert.equal(root.userData.assetId, asset.id);
  assert.deepEqual(socket.position.toArray(), [0, asset.muzzle.height, asset.muzzle.length]);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8));
  flash.position.copy(socket.position);
  flash.scale.set(1, 1, 2.3);
  barrels.add(flash);
  const position = new THREE.Vector3();
  for (const recoil of [0, -0.12])
    for (let degrees = 0; degrees < 360; degrees += 45) {
      yaw.rotation.y = THREE.MathUtils.degToRad(degrees);
      barrels.position.z = recoil;
      flash.position.x = degrees % 90 === 0 ? asset.muzzle.offset : -asset.muzzle.offset;
      root.updateMatrixWorld(true);
      root.traverse((object) => {
        if (!object.isMesh) return;
        const vertices = object.geometry.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          position
            .fromBufferAttribute(vertices, i)
            .applyMatrix4(object.matrixWorld);
          // A bounding circle proves containment for intermediate angles too,
          // not just the sampled orientations. Turret pivot is at ground XZ origin.
          assert.ok(
            Math.hypot(position.x, position.z) <= CELL_SIZE / 2 - 0.015,
            `rotation envelope overflow: ${degrees}`,
          );
          assert.ok(
            Math.abs(position.x) <= CELL_SIZE / 2 - 0.015,
            `x overflow at ${degrees}: ${position.x}`,
          );
          assert.ok(
            Math.abs(position.z) <= CELL_SIZE / 2 - 0.015,
            `z overflow at ${degrees}: ${position.z}`,
          );
        }
      });
    }
});
