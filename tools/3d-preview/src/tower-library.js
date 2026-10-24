import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { towerVariant } from './evolution-catalog.js';

// Load only the selected tower/tier. A bounded cache also releases GPU textures
// when comparing the whole collection, rather than retaining 18 PBR sets.
export function createTowerLibrary(onLoad, capacity = 3) {
  const loader = new GLTFLoader();
  const cache = new Map();
  const pending = new Map();
  function dispose(model) {
    model.root.removeFromParent();
    const textures = new Set(), geometries = new Set(), materials = new Set();
    model.root.traverse(o => {
      if (!o.isMesh) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
      }
    });
    textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
  function trim() {
    for (const [key, model] of cache) {
      if (cache.size <= capacity) break;
      if (!model.root.visible) { cache.delete(key); dispose(model); }
    }
  }
  return {
    trim,
    async get(id, style, tier) {
      const asset = towerVariant(id, style, tier);
      if (cache.has(asset.key)) {
        const model = cache.get(asset.key);
        cache.delete(asset.key); cache.set(asset.key, model);
        return model;
      }
      if (pending.has(asset.key)) return pending.get(asset.key);
      const request = (async () => {
        const gltf = await loader.loadAsync(asset.model);
        const root = gltf.scene.getObjectByName(asset.id);
        const yaw = root?.getObjectByName('turret-yaw'), barrels = root?.getObjectByName('barrels-recoil'), muzzle = root?.getObjectByName('muzzle-socket');
        if (!yaw || !barrels || !muzzle) throw new Error(`Missing rig in ${asset.model}`);
        if (asset.quality) asset.muzzle = root.userData.muzzle;
        root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
        const flash = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd49b, toneMapped: false }));
        flash.position.copy(muzzle.position); flash.visible = false; barrels.add(flash);
        const light = new THREE.PointLight(0xffb45b, 0, 1, 2);
        light.position.copy(muzzle.position); barrels.add(light);
        root.removeFromParent(); root.visible = false;
        const model = { root, yaw, barrels, muzzle, flash, light, asset };
        onLoad(model); cache.set(asset.key, model); trim();
        return model;
      })();
      pending.set(asset.key, request);
      try { return await request; } finally { pending.delete(asset.key); }
    },
  };
}
