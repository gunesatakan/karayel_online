import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { towerPlacement, TOWER_BASE_Y } from "../src/layout.js";
import { muzzleAt, enemyPosition } from "../src/scenario.js";

function registerVariantTests(variant, triangleBudget) {
  const bytes = readFileSync(new URL(`../public/game-assets/models/warrior-1-${variant}.glb`, import.meta.url));
  const report = JSON.parse(readFileSync(new URL(`../validation/takipci-${variant}.json`, import.meta.url), "utf8"));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

  test(`${variant} asset preserves embedded PBR maps and its reviewed processing output`, () => {
    assert.equal(createHash("sha256").update(bytes).digest("hex"), report.modelSha256);
    assert.ok(report.triangleCount <= triangleBudget);
    assert.ok(report.triangleCount > triangleBudget * 0.98);
    assert.equal(json.images.length, 3);
    assert.ok(json.images.every((image) => image.bufferView !== undefined && !image.uri));
    for (const material of json.materials) {
      assert.ok(material.pbrMetallicRoughness.baseColorTexture);
      assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
      assert.ok(material.normalTexture);
    }
  });

  test(`${variant} model stays in one cell while aiming and recoiling; effects follow its actual socket`, async () => {
    // Geometry/rig test in Node: image decoding is verified in the browser and Blender.
    const loader = new GLTFLoader().register(() => ({ name: "test-textures", loadTexture: () => Promise.resolve(new THREE.Texture()) }));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const root = gltf.scene.getObjectByName("warrior-1");
    const yaw = root.getObjectByName("turret-yaw");
    const barrels = root.getObjectByName("barrels-recoil");
    const socket = root.getObjectByName("muzzle-socket");
    const fixed = root.getObjectByName("fixed-copper-platform");
    assert.equal(root.userData.footprintCells, 1);
    assert.equal(fixed.parent, root);
    assert.equal(root.getObjectByName("twin-cannons").parent, barrels);
    assert.equal(root.getObjectByName("rotating-bearing").parent, yaw);
    const muzzle = root.userData.muzzle;
    fixed.geometry.computeBoundingBox();
    assert.ok(muzzle.height > fixed.geometry.boundingBox.max.y, "muzzle must be above the copper roof");
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8));
    flash.position.copy(socket.position);
    flash.scale.set(1, 1, 2.3);
    barrels.add(flash);
    const position = new THREE.Vector3();
    let triangles = 0;
    root.traverse((object) => { if (object.isMesh && object !== flash) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3; });
    assert.equal(triangles, report.triangleCount);
    for (const recoil of [0, -0.12]) for (let angle = 0; angle < 360; angle += 30) {
      yaw.rotation.y = THREE.MathUtils.degToRad(angle);
      barrels.position.z = recoil;
      flash.position.x = muzzle.centerOffset + (angle % 60 === 0 ? muzzle.offset : -muzzle.offset);
      root.updateMatrixWorld(true);
      root.traverse((object) => {
        if (!object.isMesh) return;
        const vertices = object.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
          position.fromBufferAttribute(vertices, i).applyMatrix4(object.matrixWorld);
          assert.ok(Math.hypot(position.x, position.z) <= 0.485, `footprint overflow ${angle}`);
        }
      });
    }
    const placement = towerPlacement(1);
    root.position.set(placement.position.x, TOWER_BASE_Y, placement.position.z);
    barrels.position.z = 0;
    for (const time of [0, 1, 5, 10]) {
      const target = enemyPosition(time);
      yaw.rotation.y = Math.atan2(target.x - placement.position.x, target.z - placement.position.z);
      root.updateMatrixWorld(true);
      const actual = socket.getWorldPosition(new THREE.Vector3());
      const expected = muzzleAt(time, muzzle.centerOffset, muzzle.length, muzzle.height, placement);
      assert.ok(actual.distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z)) < 1e-6);
    }
  });
}

registerVariantTests("quality", 80000);
registerVariantTests("stylized", 50000);
