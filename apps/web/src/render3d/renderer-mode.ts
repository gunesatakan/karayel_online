/**
 * 3D kuleler acik mi.
 *
 * Varsayilan 2D. Uc sart birden: derleme izin veriyor (`VITE_TOWERS_3D` "off"
 * degil -- itch paketi kapatiyor, tools/build-itch.mjs), oyuncu acmis (oyun ici
 * menu ya da `?towers3d=on`) ve cihazda WebGL2 var. Biri tutmazsa oyun bugunku
 * 2D haliyle calisiyor.
 */
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

/** Depolama kapaliyken (itch iframe'i) oturumun tercihi. */
let sessionPreference: boolean | undefined;

/**
 * Adres (`?towers3d=on|off`) yalnizca sayfa acilisinda bir kez okunup tercih
 * olarak yaziliyor; sonra menudeki anahtar gecerli (adres her okumada ustune
 * yazsaydi oyuncu 3D'yi kapatamazdi).
 */
const fromUrl = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("towers3d");
if (fromUrl === "on" || fromUrl === "off") writePreference(fromUrl === "on");

function writePreference(enabled: boolean) {
  sessionPreference = enabled;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Depolama kapali: tercih bu oturumda bellekte.
  }
}

export function readTowers3dPreference() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "on" || stored === "off") return stored === "on";
  } catch {
    // Depolama kapali.
  }
  return sessionPreference ?? false;
}

export function isTowers3dActive() {
  return supportsTowers3d() && readTowers3dPreference();
}

/** Oyun ici menu: tercihi yazar ve sahneye haber verir (sahne katmani canli acip kapatiyor). */
export function setTowers3dPreference(enabled: boolean) {
  writePreference(enabled);
  window.dispatchEvent(new CustomEvent(TOWERS_3D_CHANGED_EVENT, { detail: { enabled } }));
}
