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
import { buildTower } from "../src/models.js";

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

test("every tower vertex, including barrels and maximum muzzle flash, fits one cell at all headings", () => {
  const tower = buildTower();
  tower.flash.scale.set(1, 1, 2.3);
  const position = new THREE.Vector3();
  for (const recoil of [0, -0.12])
    for (let degrees = 0; degrees < 360; degrees += 2) {
      tower.yaw.rotation.y = THREE.MathUtils.degToRad(degrees);
      tower.barrels.position.z = recoil;
      tower.flash.position.x = degrees % 4 === 0 ? 0.25 : -0.25;
      tower.root.updateMatrixWorld(true);
      tower.root.traverse((object) => {
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
