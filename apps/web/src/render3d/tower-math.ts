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

/**
 * Ikmal binalari (Tripo; tools/3d-preview/build-structure-lods.py): tanim ->
 * bina turu. Seviye 1-4 ve 5+ iki kademe, 2D resimlerdeki gibi. AttackLord'un
 * tamir binasi ortak tamir modelini kullaniyor.
 */
export const BUILDING_MODEL_KINDS: Readonly<Record<string, string>> = {
  "warehouse-1": "warehouse",
  "repair-depot-1": "repair",
  "warrior-7": "ammunition",
  "zeynep-9": "ammunition",
  "archer-7": "ammunition",
  "warrior-8": "energy",
  "zeynep-10": "energy",
  "archer-8": "energy"
};
/** Duvar: bir hucre kenari boyunda kenar yapisi; modelin boyu 1 birim. */
export const WALL_MODEL_ID = "wall-1";
export const WALL_MODEL_PATH = "models3d/wall-1.glb";

export function buildingModelPath(definitionId: string, level: number) {
  const kind = BUILDING_MODEL_KINDS[definitionId];
  return kind ? `models3d/building-${kind}-tier-${level >= 5 ? 2 : 1}.glb` : undefined;
}

export function hasTowerModel(definitionId: string) {
  if (definitionId in BUILDING_MODEL_KINDS || definitionId === WALL_MODEL_ID) return true;
  return TOWER_MODEL_IDS.has(definitionId);
}

/** `public/` altindaki model yolu; kademe seviye 1-4 / 5-9 / 10. */
export function towerModelPath(definitionId: string, tier: TowerTier) {
  return `models3d/${definitionId}-tier-${tier}.glb`;
}

/** 3D modeli olan madenler (Tripo; tools/3d-preview/build-structure-lods.py). Model tabani 1 birim genis. */
export const MINE_KINDS: ReadonlySet<string> = new Set(["energy", "gunpowder", "iron", "mystic", "plasma"]);
/** Madenin tabani hucrenin bu kadari: 2D ikonun (0,71 hucre) biraz ustu, komsu karelere tasmiyor. */
export const MINE_CELL_SCALE = 0.86;

/**
 * Isci dronu (Tripo; build-structure-lods.py -- workers): tek model, rol farki
 * oyunda eklenen parcalarla (rol renginde suzulme halkasi, yuk, Tamircinin artisi).
 */
export const WORKER_MODEL_PATH = "models3d/worker-drone.glb";
/** Modelin burnu (goz): Tripo modeli gozu +X yonunde kurdu; +Z burunlu modellerin donusune ceyrek tur. */
export const WORKER_MODEL_YAW_OFFSET = -Math.PI / 2;

/** Operator bedenleri (Tripo; build-structure-lods.py -- operators): karakter -> model. */
export const OPERATOR_MODEL_PATHS: Readonly<Record<string, string>> = {
  zeynep: "models3d/operator-zeynep.glb",
  warrior: "models3d/operator-warrior.glb"
};
/** Modelin yuzu: Phaser resmi yukari bakiyor (donus 0'da yuz kuzeyde); Tripo bedenlerinin kollari -X yonunde. */
export const OPERATOR_MODEL_YAW_OFFSET = Math.PI / 2;

export function mineModelPath(kind: string) {
  return `models3d/mine-${kind}.glb`;
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

/** Egik gorunumun acilistaki kamera yuksekligi (derece): on izlemedeki "Taktik" kamera. */
export const ANGLED_ELEVATION_DEGREES = 45;

/**
 * Serbest egik kameranin sinirlari (on izlemedeki yorunge kamerasi gibi): iki
 * parmakla egim 15-70 derece, yakinlasma haritanin sigdigi olcunun 0,5-5 kati.
 * 70 dereceden diki tepeden gorunum (ayri secenek); 15'in alti zemin cizgisi.
 */
export const ANGLED_ELEVATION_RANGE = { min: 15, max: 70 } as const;
export const ANGLED_ZOOM_RANGE = { min: 0.5, max: 5 } as const;

/**
 * Egik kameranin dikey gorus acisi (derece). Perspektif derinligi veriyor:
 * yakindaki kuleler ve dusmanlar buyuk, uzaktakiler kucuk, tahtanin uzak
 * kenari daraliyor (ortografikte uzak ve yakin ayni boydaydi, harita egik
 * basilmis bir resim gibiydi). Dar aci bozulmayi sinirli tutuyor: acilista
 * yakin kenar uzak kenarin ~1,4 kati.
 */
export const ANGLED_FOV_DEGREES = 28;

/** Ufkun ustune giden isin zemine inmiyor: ufkun bu kadar altina (egim, ~1,7 derece) indiriliyor. */
const HORIZON_DIP = 0.03;

export type OrbitView = {
  /** Kameranin baktigi zemin noktasi. */
  target: { x: number; z: number };
  /** Kameranin hedef cevresindeki donusu (radyan); 0'da kamera guneyde, kuzeye bakiyor. */
  yaw: number;
  /**
   * Yakinlasma uygulanmis yari kesit (hedefin kamera duzleminde gorunen alan)
   * ve yukseklik acisinin sin/cos'u.
   */
  frustum: { halfWidth: number; halfHeight: number; sin: number; cos: number };
  /** Kameranin hedefe uzakligi: perspektif. Yoksa ortografik (sonsuz uzak). */
  distance?: number;
};

/**
 * Egik 3D gorunumde dusman panolari ve isci dronlari 2D sprite'larinin bu
 * kadari (yalnizca gorunus; isabet govdeleri sunucuda, degismiyor).
 */
export const STANDEE_SIZE_SCALE = 0.5;
export const WORKER_SIZE_SCALE = 0.5;
/** Operator bedeni 2D resminin yarisi boyunda, yerde duruyor. */
export const OPERATOR_SIZE_SCALE = 0.5;

/**
 * Donus haritanin merkezi cevresinde: kamera `yaw`u `radians` kadar donerken
 * hedef de merkezin cevresinde ayni kadar donuyor; merkez ekranda yerinde
 * kaliyor (sag/yukari eksenleri ayni donusle donuyor, merkezin onlara gore yeri ayni).
 */
export function rotateTargetAround(target: { x: number; z: number }, center: { x: number; z: number }, radians: number) {
  const dx = target.x - center.x;
  const dz = target.z - center.z;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: center.x + dx * c + dz * s, z: center.z - dx * s + dz * c };
}

export function clampOrbit(value: number, range: { min: number; max: number }) {
  return Math.min(range.max, Math.max(range.min, value));
}

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
 * Perspektif egik kameranin acilis kesiti ve uzakligi. Perspektifte yakin
 * kenar genisliyor: ortografik kesit (`angledFrustum`) tahtanin dort kosesi
 * ve uzak kenardaki kulelerin tepesi (`headroom`, ortografikteki gibi)
 * ekrana sigana kadar buyutuluyor. Kesitin yarisi hedefin derinliginde;
 * uzaklik `halfHeight / tan(fov / 2)`.
 */
export function angledPerspectiveFit(view: { width: number; height: number }, aspect: number, elevationDegrees = ANGLED_ELEVATION_DEGREES, headroom = 0, fovDegrees = ANGLED_FOV_DEGREES) {
  const base = angledFrustum(view, aspect, elevationDegrees, headroom);
  const tan = Math.tan((fovDegrees * Math.PI) / 360);
  const target = { x: view.width / 2, z: view.height / 2 };
  // Donmemis kamerada kuzey (z = 0) uzak kenar.
  const points: Array<[number, number, number]> = [
    [0, 0, headroom], [view.width, 0, headroom],
    [0, 0, 0], [view.width, 0, 0], [0, view.height, 0], [view.width, view.height, 0]
  ];
  const at = (scale: number) => {
    const frustum = { ...base, halfWidth: base.halfWidth * scale, halfHeight: base.halfHeight * scale };
    return { frustum, distance: frustum.halfHeight / tan };
  };
  const fits = (scale: number) => {
    const orbit = { target, yaw: 0, ...at(scale) };
    return points.every(([x, z, height]) => {
      const ndc = angledGroundToScreen(x, z, height, orbit);
      return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
    });
  };
  // Buyudukce perspektif azaliyor, sonunda ortografik kesite (sigiyor) yaklasiyor.
  let low = 1;
  let high = 1;
  for (let step = 0; step < 16 && !fits(high); step += 1) {
    low = high;
    high *= 1.5;
  }
  if (high > low) {
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      if (fits(mid)) high = mid;
      else low = mid;
    }
  }
  const fitted = at(high);
  return { ...fitted.frustum, distance: fitted.distance };
}

/**
 * Kameranin ekseni. Kameradan hedefe bakis `forward` = -(sin a cos e, sin e,
 * cos a cos e); ekranin sagi `right` = (cos a, 0, -sin a); ekranin yukarisi
 * `up` = right x forward. three.js'in `lookAt`i (yukari +Y) ayni ekseni kuruyor.
 */
export function orbitBasis(yaw: number, sin: number, cos: number) {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const forward = { x: -sy * cos, y: -sin, z: -cy * cos };
  const right = { x: cy, y: 0, z: -sy };
  const up = { x: -sy * sin, y: cos, z: -cy * sin };
  return { forward, right, up };
}

/**
 * Egik kamerada ekran noktasi (NDC) -> zemin noktasi (y = 0): ekrandaki kayit
 * hedefin kamera duzleminde (hedef + sag * u + yukari * v). Ortografikte
 * oradan bakis yonunde, perspektifte kameradan o noktaya giden isinla zemine.
 */
export function angledScreenToGround(ndcX: number, ndcY: number, view: OrbitView) {
  const { forward, right, up } = orbitBasis(view.yaw, view.frustum.sin, view.frustum.cos);
  const u = ndcX * view.frustum.halfWidth;
  const v = ndcY * view.frustum.halfHeight;
  const px = view.target.x + right.x * u + up.x * v;
  const py = up.y * v;
  const pz = view.target.z + right.z * u + up.z * v;
  const distance = view.distance;
  if (!distance) {
    const t = -py / forward.y;
    return { x: px + forward.x * t, z: pz + forward.z * t };
  }
  // Kamera hedefin `distance` gerisinde, bakis yonunun tersinde.
  const ox = view.target.x - forward.x * distance;
  const oy = -forward.y * distance;
  const oz = view.target.z - forward.z * distance;
  const dx = px - ox;
  const dz = pz - oz;
  const dy = Math.min(py - oy, -HORIZON_DIP * Math.hypot(dx, dz));
  const t = -oy / dy;
  return { x: ox + dx * t, z: oz + dz * t };
}

/** Zemin ustundeki nokta -> egik kamerada ekran (NDC); `angledScreenToGround`un tersi. */
export function angledGroundToScreen(x: number, z: number, height: number, view: OrbitView) {
  const { forward, right, up } = orbitBasis(view.yaw, view.frustum.sin, view.frustum.cos);
  const dx = x - view.target.x;
  const dz = z - view.target.z;
  // Perspektif: noktanin derinligi hedefinkinden ne kadar fazlaysa o kadar kucuk.
  const distance = view.distance;
  const scale = distance ? distance / (distance + dx * forward.x + height * forward.y + dz * forward.z) : 1;
  return {
    x: ((dx * right.x + dz * right.z) * scale) / view.frustum.halfWidth,
    y: ((dx * up.x + height * up.y + dz * up.z) * scale) / view.frustum.halfHeight
  };
}

/**
 * Iki parmagin jesti: bir onceki ve simdiki iki nokta -> yakinlasma carpani,
 * donus (radyan, ekranda saat yonu arti) ve orta noktanin kaymasi. Egim kipi
 * parmaklar ayni yone, cogunlukla dikey ve araliklari degismeden kayinca.
 */
export function twoFingerDelta(previous: readonly [{ x: number; y: number }, { x: number; y: number }], current: readonly [{ x: number; y: number }, { x: number; y: number }]) {
  const span = (points: readonly [{ x: number; y: number }, { x: number; y: number }]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const angle = (points: readonly [{ x: number; y: number }, { x: number; y: number }]) => Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  let rotation = angle(current) - angle(previous);
  if (rotation > Math.PI) rotation -= 2 * Math.PI;
  if (rotation < -Math.PI) rotation += 2 * Math.PI;
  const previousMid = { x: (previous[0].x + previous[1].x) / 2, y: (previous[0].y + previous[1].y) / 2 };
  const currentMid = { x: (current[0].x + current[1].x) / 2, y: (current[0].y + current[1].y) / 2 };
  return {
    scale: span(current) / Math.max(1, span(previous)),
    rotation,
    /** Parmaklarin simdiki araligi (piksel). */
    span: span(current),
    mid: currentMid,
    previousMid,
    moveX: currentMid.x - previousMid.x,
    moveY: currentMid.y - previousMid.y,
    // Iki parmagin dikey kaymalari ayni yonde mi (egim icin).
    parallelVertical: (current[0].y - previous[0].y) * (current[1].y - previous[1].y) > 0
  };
}

/**
 * Jestin kipi, parmaklar yeterince kaydiginda bir kez seciliyor ve jest
 * boyunca degismiyor: ikisi ayni yone cogunlukla dikey kaydiysa ve aralik ile
 * aci az degistiyse egim; parmaklarin donus yayi aralik degisiminden ve
 * birlikte kaymadan buyukse yalnizca donus (burmada orta nokta ve aralik hep
 * biraz oynuyor: kaydirma ve yakinlasma sayilsaydi harita merkezden kayardi);
 * yoksa yakinlasma + kaydirma.
 */
export function classifyTwoFingerGesture(totalMoveX: number, totalMoveY: number, totalScale: number, totalRotation: number, parallelVertical: boolean, span = 100): "tilt" | "rotate" | "transform" {
  const vertical = Math.abs(totalMoveY) > Math.abs(totalMoveX) * 1.6;
  const steady = Math.abs(Math.log(totalScale)) < 0.08 && Math.abs(totalRotation) < 0.12;
  if (parallelVertical && vertical && steady) return "tilt";
  const arc = (Math.abs(totalRotation) * span) / 2;
  const pinch = (Math.abs(totalScale - 1) * span) / 2;
  const drag = Math.hypot(totalMoveX, totalMoveY);
  return arc > 6 && arc >= pinch && arc >= drag * 0.8 ? "rotate" : "transform";
}

/**
 * Donerken harita ortaya geri geliyor: hedef donusun buyuklugu kadar haritanin
 * merkezine cekiliyor (tek adimda ceyrek tur donuste tamamen; azar azar
 * donuste 45 derecede ~%63, 90 derecede ~%86). Yakinlasip kenara
 * kaydirilmis kamera birkac donusten sonra da haritayi kaybetmiyor.
 */
export function recenterWhileRotating(target: { x: number; z: number }, center: { x: number; z: number }, radians: number) {
  const pull = Math.min(1, (Math.abs(radians) / Math.PI) * 4);
  return { x: target.x + (center.x - target.x) * pull, z: target.z + (center.z - target.z) * pull };
}

/**
 * Ayakta duran panonun (dusman) merkez yuksekligi: kameraya donuk pano ekranda
 * tam boyunda; merkezi `boy / 2` ekran yukari ciksin ki alt kenari ayagina
 * (zemindeki noktasina) degsin. Yukseklik ekranda `cos` kadar kisaliyor.
 */
export function standeeCenterHeight(size: number, elevationDegrees = ANGLED_ELEVATION_DEGREES) {
  return size / 2 / Math.cos((elevationDegrees * Math.PI) / 180);
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
