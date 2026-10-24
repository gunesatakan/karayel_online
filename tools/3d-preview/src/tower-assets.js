import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TOWER_ASSETS } from "./asset-catalog.js";

export async function loadTowerAssets() {
  const loader = new GLTFLoader();
  const variants = TOWER_ASSETS.flatMap((asset) => [
    { ...asset, key: asset.id },
    ...(asset.qualityModel ? [{ ...asset, key: `${asset.id}:quality`, model: asset.qualityModel, quality: true, detail: "Kabartılı bakır kaplama, aşınmış yeşil metal ve 4K yüzey dokuları. İlk taslakla karşılaştırabilirsin." }] : []),
  ]);
  const entries = await Promise.all(variants.map(async (asset) => {
    const gltf = await loader.loadAsync(asset.model);
    const root = gltf.scene.getObjectByName(asset.id);
    const yaw = root.getObjectByName("turret-yaw");
    const barrels = root.getObjectByName("barrels-recoil");
    const muzzle = root.getObjectByName("muzzle-socket");
    if (!yaw || !barrels || !muzzle) throw new Error(`Missing rig nodes in ${asset.model}`);
    if (asset.quality) asset.muzzle = root.userData.muzzle;
    root.traverse((object) => { if (object.isMesh) object.castShadow = object.receiveShadow = true; });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd49b, toneMapped: false }));
    flash.position.copy(muzzle.position);
    flash.visible = false;
    barrels.add(flash);
    const light = new THREE.PointLight(0xffb45b, 0, 1, 2);
    light.position.copy(muzzle.position);
    barrels.add(light);
    root.removeFromParent();
    root.visible = false;
    return [asset.key, { root, yaw, barrels, muzzle, flash, light, asset }];
  }));
  return new Map(entries);
}
