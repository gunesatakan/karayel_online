import { DESKTOP_QUALITY, DESKTOP_QUALITY_START, TOUCH_QUALITY, TOUCH_QUALITY_START } from "./resolution";

/**
 * Kule gorunumu: "2d" (bugunku oyun), "top" (3D kuleler, tepeden kamera),
 * "angled" (3D kuleler ve egik tahta, render3d/tower-layer.ts) ya da "battle"
 * (egik tahta, kamerayi evre yonetiyor: kurulumda tepeden, dalgada egik;
 * render3d/battle-camera.ts).
 *
 * Varsayilan 2D. 3D icin uc sart birden: derleme izin veriyor (`VITE_TOWERS_3D`
 * "off" degil -- itch paketi kapatiyor, tools/build-itch.mjs), oyuncu secmis
 * (oyun ici menu ya da `?towers3d=on|angled|off`) ve cihazda WebGL2 var. Biri
 * tutmazsa oyun bugunku 2D haliyle calisiyor.
 */
export type TowerView = "2d" | "top" | "angled" | "battle";

const STORAGE_KEY = "karayel_towers_3d";
export const TOWERS_3D_CHANGED_EVENT = "karayel:towers-3d";
/**
 * Egik gorunumde Phaser tuvalinin dunya birimi basina en cok cihaz pikseli
 * (2D'de telefonda 2'ye kadar). Tuval 3D'ye doku olarak kopyalaniyor (karede
 * iki kez) ve bedeli piksel sayisiyla buyuyor: deger kalite basamagindan
 * (render3d/resolution.ts), 3D katman kare suresine gore degistiriyor.
 */
let angledBoardScale: number | undefined;

export function getAngledRenderScale(finePointer: boolean) {
  return angledBoardScale ?? (finePointer ? DESKTOP_QUALITY[DESKTOP_QUALITY_START] : TOUCH_QUALITY[TOUCH_QUALITY_START]).boardScale;
}

export function setAngledRenderScale(scale: number) {
  angledBoardScale = scale;
}
/** Oyun ici menu: egik kamerayi acilis haline (45 derece, kuzey yukarida, harita sigiyor) dondur. */
export const TOWERS_3D_CAMERA_RESET_EVENT = "karayel:towers-3d-camera-reset";

export function requestTowerCameraReset() {
  window.dispatchEvent(new CustomEvent(TOWERS_3D_CAMERA_RESET_EVENT));
}

export function isTowers3dBuildEnabled() {
  return String(import.meta.env.VITE_TOWERS_3D ?? "on").toLowerCase() !== "off";
}

let webGl2: boolean | undefined;
export function supportsTowers3d() {
  if (!isTowers3dBuildEnabled()) return false;
  if (webGl2 === undefined) {
    try {
      webGl2 = Boolean(document.createElement("canvas").getContext("webgl2"));
    } catch {
      webGl2 = false;
    }
  }
  return webGl2;
}

/** Kayitli deger -> gorunum. "on" asama 1'in kaydi: tepeden. */
export function parseTowerView(value: string | null | undefined): TowerView | undefined {
  if (value === "on" || value === "top") return "top";
  if (value === "angled") return "angled";
  if (value === "battle") return "battle";
  if (value === "off" || value === "2d") return "2d";
  return undefined;
}

/** 3D katmanin kipi; 2D'de yok. Savas kamerasi egik katmanla ciziliyor. */
export function towerLayerView(view: TowerView): "top" | "angled" | undefined {
  if (view === "2d") return undefined;
  return view === "top" ? "top" : "angled";
}

/** Depolama kapaliyken (itch iframe'i) oturumun tercihi. */
let sessionPreference: TowerView | undefined;

function writePreference(view: TowerView) {
  sessionPreference = view;
  try {
    window.localStorage.setItem(STORAGE_KEY, view === "2d" ? "off" : view === "top" ? "on" : view);
  } catch {
    // Depolama kapali: tercih bu oturumda bellekte.
  }
}

/**
 * Adres yalnizca sayfa acilisinda bir kez okunup tercih olarak yaziliyor; sonra
 * menudeki secim gecerli (adres her okumada ustune yazsaydi oyuncu degistiremezdi).
 */
const fromUrl = typeof window === "undefined" ? undefined : parseTowerView(new URLSearchParams(window.location.search).get("towers3d"));
if (fromUrl) writePreference(fromUrl);

export function readTowerViewPreference(): TowerView {
  try {
    const stored = parseTowerView(window.localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Depolama kapali.
  }
  return sessionPreference ?? "2d";
}

/** Su an gecerli gorunum: tercih, cihaz ve derleme birlikte. */
export function getActiveTowerView(): TowerView {
  return supportsTowers3d() ? readTowerViewPreference() : "2d";
}

/** Oyun ici menu: tercihi yazar ve sahneye haber verir (sahne katmani canli degistiriyor). */
export function setTowerViewPreference(view: TowerView) {
  writePreference(view);
  window.dispatchEvent(new CustomEvent(TOWERS_3D_CHANGED_EVENT, { detail: { view } }));
}
