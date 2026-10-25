import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ZENTAX_ASSETS } from '../src/asset-catalog.js';
import { ZENTAX_TIERS, towerVariant } from '../src/evolution-catalog.js';
import { placementFor, TOWER_BASE_Y } from '../src/layout.js';
import { enemyPosition, muzzleAt } from '../src/scenario.js';

for (const asset of ZENTAX_ASSETS) for (const tier of ZENTAX_TIERS) {
  test(`${asset.id} tier ${tier.id}: organic materials, rig, placement bounds and muzzle alignment`, async () => {
    const variant = towerVariant(asset.id, 'evolution', tier.id);
    const bytes = readFileSync(new URL('../public/' + variant.model, import.meta.url));
    const report = JSON.parse(readFileSync(new URL(`../validation/${asset.id}-tier-${tier.id}.json`, import.meta.url)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), report.modelSha256);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
    assert.ok(json.images.length >= 2);
    assert.ok(json.images.every(image => image.bufferView !== undefined && !image.uri));
    assert.ok(json.materials.some(m => m.normalTexture));
    // Bone and chitin, not metal; the energy cores glow in their own texture colours.
    assert.ok(json.materials.every(m => (m.pbrMetallicRoughness.metallicFactor ?? 1) < .3));
    assert.ok(json.materials.some(m => m.emissiveTexture));
    const loader = new GLTFLoader().register(() => ({ name: 'test-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const root = gltf.scene.getObjectByName(asset.id);
    assert.ok(root, 'stable root name');
    assert.equal(root.userData.tier, tier.id);
    if (asset.edgeCells) assert.equal(root.userData.edgeCells, asset.edgeCells);
    else assert.equal(root.userData.footprintCells, asset.footprintSpan ** 2);
    const yaw = root.getObjectByName('turret-yaw'), barrels = root.getObjectByName('barrels-recoil'), socket = root.getObjectByName('muzzle-socket');
    assert.ok(yaw && barrels && socket);
    let triangleCount = 0;
    root.traverse(o => { if (o.isMesh) triangleCount += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
    assert.equal(triangleCount, report.triangleCount);
    assert.ok(triangleCount <= 60000);
    const point = new THREE.Vector3();
    for (let angle = 0; angle < 360; angle += 30) for (const recoil of [0, -.12]) {
      yaw.rotation.y = THREE.MathUtils.degToRad(angle); barrels.position.z = recoil; root.updateMatrixWorld(true);
      root.traverse(o => {
        if (!o.isMesh) return;
        const vertices = o.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(o.matrixWorld);
          if (asset.edgeCells) {
            // The rail stays inside the thin strip along its two-cell edge.
            assert.ok(Math.abs(point.x) <= asset.edgeCells / 2 - .01 && Math.abs(point.z) <= .25, `edge overflow at ${angle} degrees`);
          } else assert.ok(Math.hypot(point.x, point.z) <= .485 * asset.footprintSpan, `cell overflow at ${angle} degrees`);
          assert.ok(point.y >= -.002, 'no underground geometry');
        }
      });
    }
    if (asset.mode !== 'projectile') return;
    const placement = placementFor(asset), muzzle = root.userData.muzzle;
    root.position.set(placement.position.x, TOWER_BASE_Y, placement.position.z); barrels.position.z = 0;
    for (const time of [0, 1, 5, 10]) {
      const target = enemyPosition(time);
      yaw.rotation.y = Math.atan2(target.x - placement.position.x, target.z - placement.position.z); root.updateMatrixWorld(true);
      const expected = muzzleAt(time, muzzle.centerOffset, muzzle.length, muzzle.height, placement);
      assert.ok(socket.getWorldPosition(point).distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z)) < 1e-6);
    }
  });
}

test('Abartı lies on a cell edge, two cells long, with no occupied cells', () => {
  const placement = placementFor(ZENTAX_ASSETS.find(a => a.id === 'zeynep-8'));
  assert.equal(placement.edge, true);
  assert.equal(placement.length, 2);
  assert.deepEqual(placement.cells, []);
  assert.ok(Math.abs(placement.position.z - Math.round(placement.position.z)) < 1e-9, 'edge sits on a grid line');
});
