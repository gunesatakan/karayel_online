/**
 * Kule gorunumu: "2d" (bugunku oyun), "top" (3D kuleler, tepeden kamera) ya da
 * "angled" (3D kuleler ve egik tahta, render3d/tower-layer.ts).
 *
 * Varsayilan 2D. 3D icin uc sart birden: derleme izin veriyor (`VITE_TOWERS_3D`
 * "off" degil -- itch paketi kapatiyor, tools/build-itch.mjs), oyuncu secmis
 * (oyun ici menu ya da `?towers3d=on|angled|off`) ve cihazda WebGL2 var. Biri
 * tutmazsa oyun bugunku 2D haliyle calisiyor.
 */
export type TowerView = "2d" | "top" | "angled";

const STORAGE_KEY = "karayel_towers_3d";
export const TOWERS_3D_CHANGED_EVENT = "karayel:towers-3d";

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
  if (value === "off" || value === "2d") return "2d";
  return undefined;
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
