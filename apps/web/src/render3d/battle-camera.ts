/**
 * Savas kamerasi ("battle" gorunumu): kurulum evresinde tahta tam tepeden
 * (2D gibi, kuleler ustten 3D), dalga baslayinca kamera yumusakca egik "savas
 * izleme" acisina iniyor, dalga temizlenince geri kalkiyor. Oyuncu dalgada
 * kamerayi egip dondurduyse sonraki dalga onun acisindan basliyor (mac boyunca).
 *
 * three.js icermiyor: sahne (GameScene) evreyi buradan planliyor, egik katman
 * (tower-layer) gecisi buradaki karisimla ciziyor.
 */

export type CameraPose = {
  /** Kameranin hedef cevresindeki donusu (radyan); 0'da kuzey yukarida. */
  yaw: number;
  /** Yukseklik acisi (derece); 90 tam tepeden. */
  elevation: number;
  /** Haritanin sigdigi olcunun kati. */
  zoom: number;
  /** Kameranin baktigi zemin noktasi; yoksa haritanin merkezi. */
  target?: { x: number; z: number };
  /** `zoom` yerine ekrana gore: tahtanin orta satiri ekranin enini doldursun (tower-math `angledFillZoom`). */
  fill?: boolean;
};

/** Gecisin uclari: hedef noktasi ve yakinlasma cozulmus. */
export type ResolvedPose = { yaw: number; elevation: number; zoom: number; target: { x: number; z: number } };

/**
 * Kurulum: tepeden. Tam 90 degil: dik bakista kameranin "yukari" yonu
 * tanimsiz (three.js `lookAt`); 86 derecede tahta 2D'den ayirt edilmiyor.
 */
export const SETUP_POSE: CameraPose = { yaw: 0, elevation: 86, zoom: 1 };
/**
 * Dalga: guneyden, kuleler ve dusmanlarin boyu okunacak kadar alcak. Dik
 * telefonda tahta ekranin enini dolduruyor (yakin koseler biraz tasiyor).
 */
export const BATTLE_POSE: CameraPose = { yaw: 0, elevation: 40, zoom: 1, fill: true };
/** Gecis sureleri (ms). Inis, ilk dusman dogarken (~950 ms) bitmek uzere. */
export const BATTLE_DESCEND_MS = 1200;
export const BATTLE_RISE_MS = 1000;

export type BattlePhase = "setup" | "wave";

/**
 * Savas kamerasinda govdeler buyuk: alcak acida boylari okunsun. Dusman, isci
 * ve operator 1,5 kat (dusman modeli 2D resminin ~%93'u; isabet govdeleri
 * sunucuda, degismiyor). Kuleler yalnizca boyda 1,3 kat: eni hucreye sigmak
 * zorunda, esit buyutmede komsu kuleye giriyordu. Duvar ve ikmal binalari aynen.
 */
export const BATTLE_UNIT_SCALE = 1.5;
export const BATTLE_TOWER_HEIGHT_SCALE = 1.3;

/** Gorunumun 3D govde carpanlari: savas kamerasinda buyuk, digerlerinde 1. */
export function battleSizeBoost(battleView: boolean) {
  return battleView ? { unit: BATTLE_UNIT_SCALE, towerHeight: BATTLE_TOWER_HEIGHT_SCALE } : { unit: 1, towerHeight: 1 };
}

/**
 * Evre degistiyse kameranin gidecegi poz ve gecis suresi; degismediyse yok.
 * Ilk karar (mac acilisi, gorunume yeni gecis) ve hareket azaltma gecissiz.
 */
export function planBattleCamera(previous: BattlePhase | undefined, setupPhase: boolean, remembered: CameraPose | undefined, reducedMotion: boolean) {
  const phase: BattlePhase = setupPhase ? "setup" : "wave";
  if (phase === previous) return undefined;
  const pose = phase === "setup" ? SETUP_POSE : remembered ?? BATTLE_POSE;
  const duration = previous === undefined || reducedMotion ? 0 : phase === "setup" ? BATTLE_RISE_MS : BATTLE_DESCEND_MS;
  return { phase, pose, duration };
}

/** Yavas baslayip yavas biten gecis (kubik). */
export function easeInOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Iki poz arasi (`t` 0-1): donus en kisa yoldan, hedefler iki ucta da verili. */
export function blendPose(from: ResolvedPose, to: ResolvedPose, t: number): ResolvedPose {
  let turn = (to.yaw - from.yaw) % (Math.PI * 2);
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    yaw: from.yaw + turn * t,
    elevation: mix(from.elevation, to.elevation),
    zoom: mix(from.zoom, to.zoom),
    target: { x: mix(from.target.x, to.target.x), z: mix(from.target.z, to.target.z) }
  };
}
