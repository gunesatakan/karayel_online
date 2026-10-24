import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TOWER_ASSETS } from '../src/asset-catalog.js';
import { EVOLUTION_TIERS, towerVariant } from '../src/evolution-catalog.js';
import { towerPlacement, TOWER_BASE_Y } from '../src/layout.js';
import { enemyPosition, muzzleAt } from '../src/scenario.js';

for (const asset of TOWER_ASSETS) for (const tier of EVOLUTION_TIERS) {
  test(`${asset.id} tier ${tier.id}: embedded materials, real rig, rotated footprint and muzzle alignment`, async () => {
    const variant = towerVariant(asset.id, 'evolution', tier.id);
    const bytes = readFileSync(new URL('../public/'+variant.model, import.meta.url));
    const report = JSON.parse(readFileSync(new URL(`../validation/${asset.id}-tier-${tier.id}.json`, import.meta.url)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), report.modelSha256);
    const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
    assert.ok(json.images.length >= 2);
    assert.ok(json.images.every(image => image.bufferView !== undefined && !image.uri));
    assert.ok(json.materials.some(m => m.normalTexture));
    assert.ok(json.materials.some(m => m.pbrMetallicRoughness.metallicFactor > .6 && m.pbrMetallicRoughness.roughnessFactor >= .4));
    const loader = new GLTFLoader().register(() => ({name:'test-textures',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const root = gltf.scene.getObjectByName(asset.id);
    assert.ok(root, 'stable root name');
    assert.equal(root.userData.tier, tier.id);
    assert.equal(root.userData.footprintCells, asset.footprintSpan**2);
    const yaw = root.getObjectByName('turret-yaw'), barrels = root.getObjectByName('barrels-recoil'), socket = root.getObjectByName('muzzle-socket');
    assert.ok(yaw && barrels && socket);
    let triangleCount=0;
    root.traverse(o=>{if(o.isMesh) triangleCount+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
    assert.equal(triangleCount,report.triangleCount);
    assert.ok(triangleCount <= 60000);
    const point = new THREE.Vector3();
    for (let angle=0; angle<360; angle+=30) for (const recoil of [0,-.12]) {
      yaw.rotation.y=THREE.MathUtils.degToRad(angle); barrels.position.z=recoil; root.updateMatrixWorld(true);
      root.traverse(o=>{
        if(!o.isMesh)return;
        const vertices=o.geometry.attributes.position;
        for(let i=0;i<vertices.count;i++) {
          point.fromBufferAttribute(vertices,i).applyMatrix4(o.matrixWorld);
          assert.ok(Math.hypot(point.x,point.z)<=.485*asset.footprintSpan,`cell overflow at ${angle} degrees`);
          assert.ok(point.y>=-.002, 'no underground geometry');
        }
      });
    }
    const placement=towerPlacement(asset.footprintSpan), muzzle=root.userData.muzzle;
    root.position.set(placement.position.x,TOWER_BASE_Y,placement.position.z); barrels.position.z=0;
    for(const time of [0,1,5,10]) {
      const target=enemyPosition(time);
      yaw.rotation.y=Math.atan2(target.x-placement.position.x,target.z-placement.position.z);root.updateMatrixWorld(true);
      const expected=muzzleAt(time,muzzle.centerOffset,muzzle.length,muzzle.height,placement);
      assert.ok(socket.getWorldPosition(point).distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))<1e-6);
    }
  });
}
