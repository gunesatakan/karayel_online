/**
 * 3D kule katmaninin saf hesaplari: hangi kulenin modeli var, model dosyasi,
 * oyunun `facing` acisindan model donusu, olcek ve kamera kesiti.
 *
 * Bu dosya bilerek hicbir sey ice aktarmiyor: `node --test` onu derlemeden
 * calistirabiliyor (apps/web/tests/render3d.test.mjs) ve 2D oyuncunun paketine
 * three.js'i cekmiyor.
 *
 * Eksenler: oyun dunyasinda x saga, y asagi. Sahnede X = x, Z = y, Y yukari;
 * kamera tepeden bakiyor. Modelin namlusu donmemisken +Z'ye bakiyor.
 */

/** Modeli olan kuleler (tools/3d-preview/build-game-lods.py). Gerisi 2D cizilmeye devam ediyor. */
export const TOWER_MODEL_IDS: ReadonlySet<string> = new Set([
  "warrior-1", "warrior-2", "warrior-3", "warrior-4", "warrior-5", "warrior-6",
  "zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6", "zeynep-7", "zeynep-8"
]);

/** Kenar yapisi olan modeller: kare kaplamiyor, kenar boyunca uzanan ray. */
export const EDGE_MODEL_IDS: ReadonlySet<string> = new Set(["zeynep-8"]);

/** Modelin taban capi, hucre cinsinden (on izlemedeki normalizasyon: yaricap 0,418 x yayilim). */
export const MODEL_BODY_DIAMETER_CELLS = 0.836;

export type TowerTier = 1 | 2 | 3;

export function hasTowerModel(definitionId: string) {
  return TOWER_MODEL_IDS.has(definitionId);
}

/** `public/` altindaki model yolu; kademe seviye 1-4 / 5-9 / 10. */
export function towerModelPath(definitionId: string, tier: TowerTier) {
  return `models3d/${definitionId}-tier-${tier}.glb`;
}

/**
 * Oyunun yonu (`atan2(dy, dx)`, 0 saga) -> modelin Y ekseni etrafindaki donusu.
 * Donus a, +Z'yi (sin a, 0, cos a)'ya goturuyor; istenen yon (cos f, 0, sin f).
 */
export function yawFromFacing(facing: number) {
  return Math.PI / 2 - facing;
}

/**
 * Kare kulesinin sahne olcegi: model govdesi 2D govdenin ekrandaki capina
 * (`getTowerBodySize`) otursun. Modelin kendi koku zaten yayilimla (2x2) olcekli.
 */
export function towerModelScale(bodySize: number, span: number) {
  return bodySize / (MODEL_BODY_DIAMETER_CELLS * Math.max(1, span));
}

/** Kenar rayinin olcegi ve donusu: model uzun ekseni X'te, iki hucre boyunda. */
export function edgeModelTransform(cellSize: number, visualScale: number, orientation: "horizontal" | "vertical" | undefined) {
  return { scale: cellSize * visualScale, yaw: orientation === "vertical" ? Math.PI / 2 : 0 };
}

/** Phaser kamerasinin dunya gorunumu -> ortografik kamera merkezi ve kesiti. */
export function orthoFromWorldView(view: { x: number; y: number; width: number; height: number }) {
  return {
    centerX: view.x + view.width / 2,
    centerZ: view.y + view.height / 2,
    left: -view.width / 2,
    right: view.width / 2,
    top: view.height / 2,
    bottom: -view.height / 2
  };
}
