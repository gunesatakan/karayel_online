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

/** Egik gorunumun kamera yuksekligi (derece): on izlemedeki "Harita 45°" ile "Kule detayi 38°" arasi. */
export const ANGLED_ELEVATION_DEGREES = 52;

/**
 * Egik ortografik kameranin kesiti: tahtanin tamami genislige otursun; egik
 * derinligi ve kulelerin yuksekligi sigmiyorsa kesit buyusun.
 */
export function angledFrustum(view: { width: number; height: number }, aspect: number, elevationDegrees = ANGLED_ELEVATION_DEGREES, headroom = 0) {
  const sin = Math.sin((elevationDegrees * Math.PI) / 180);
  const cos = Math.cos((elevationDegrees * Math.PI) / 180);
  const projectedDepth = view.height * sin + headroom * cos;
  let halfWidth = view.width / 2;
  let halfHeight = halfWidth / aspect;
  if (projectedDepth / 2 > halfHeight) {
    halfHeight = projectedDepth / 2;
    halfWidth = halfHeight * aspect;
  }
  return { halfWidth, halfHeight, sin, cos };
}

/**
 * Egik tahtada ekran noktasi -> zemin noktasi (y = 0). Ortografik kamera, hedef
 * (cx, 0, cz) ve kameradan hedefe bakis (0, -sin, -cos): ekrandaki (u, v) kaydi
 * (u * yariGenislik, v * yariYukseklik) kamera duzleminde; o duzlemden bakis
 * yonunde zemine inis.
 */
export function angledScreenToGround(ndcX: number, ndcY: number, center: { x: number; z: number }, frustum: { halfWidth: number; halfHeight: number; sin: number; cos: number }) {
  const right = ndcX * frustum.halfWidth;
  const up = ndcY * frustum.halfHeight;
  // Kameranin "yukari" vektoru (0, cos, -sin); duzlemdeki nokta hedef + up * o vektor.
  const pointY = up * frustum.cos;
  const pointZ = center.z - up * frustum.sin;
  // Bakis yonunde y = 0'a kadar ilerle: t = pointY / sin.
  const t = pointY / frustum.sin;
  return { x: center.x + right, z: pointZ - t * frustum.cos };
}

/** Zemin noktasi -> egik tahtada ekran (NDC); `angledScreenToGround`un tersi. */
export function angledGroundToScreen(x: number, z: number, height: number, center: { x: number; z: number }, frustum: { halfWidth: number; halfHeight: number; sin: number; cos: number }) {
  const dz = z - center.z;
  // Kamera "yukari" vektoru (0, cos, -sin) uzerine izdusum.
  const up = height * frustum.cos - dz * frustum.sin;
  return { x: (x - center.x) / frustum.halfWidth, y: up / frustum.halfHeight };
}

/**
 * Ayakta duran panonun (dusman) merkez yuksekligi: kameraya donuk pano ekranda
 * tam boyunda; merkezi `boy / 2` ekran yukari ciksin ki alt kenari ayagina
 * (zemindeki noktasina) degsin. Yukseklik ekranda `cos` kadar kisaliyor.
 */
export function standeeCenterHeight(size: number, elevationDegrees = ANGLED_ELEVATION_DEGREES) {
  return size / 2 / Math.cos((elevationDegrees * Math.PI) / 180);
}

/**
 * Egik tahtada zemindeki bir noktayi ekranda `rise` kadar yukari gosteren
 * kuzey kaymasi (dunya birimi): kuzeye `d` kayan nokta ekranda `d * sin` yukarida.
 */
export function northShiftForRise(rise: number, elevationDegrees = ANGLED_ELEVATION_DEGREES) {
  return rise / Math.sin((elevationDegrees * Math.PI) / 180);
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
