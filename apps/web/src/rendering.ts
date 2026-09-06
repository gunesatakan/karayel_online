import Phaser from "phaser";
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from "@karayel/shared";

export const RENDER_SCALE = Math.min(window.devicePixelRatio || 1, 2);

/**
 * Oyunun dunya olcusu.
 *
 * Genislik tasarim sabiti: harita, yerlesim ve kaplama oranlarinin tamami 390
 * birimlik bir serite gore yazilmis. Yukseklik ise cihazdan geliyor.
 *
 * Sabit 844 birim tutuldugunda tuvalin orani ekranin oraniyla tutmuyordu ve
 * Phaser'in FIT olcegi farki siyah bant olarak birakiyordu. iPhone'da Safari
 * tam ekran olamadigi icin gorunur alan her zaman tasarim oranindan daha
 * genis kaliyor -- bant iki yandan yeniyor, harita da o dar seride sigdigi
 * icin oldugundan cok daha kucuk goruluyordu. Oran cihazdan alininca bant
 * kalmiyor ve haritaya ekranin tamami kaliyor.
 */
export function getWorldSize() {
  const width = Math.max(1, window.visualViewport?.width ?? window.innerWidth);
  const height = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
  return {
    width: GAME_WORLD_WIDTH,
    // Tasarim yuksekligi yalnizca olculemeyen bir durumda yedek.
    height: Math.max(1, Math.round((GAME_WORLD_WIDTH * height) / width)) || GAME_WORLD_HEIGHT
  };
}

/** Tuvalin piksel olcusu: dunya olcusunun cihaz cozunurlugune tasinmis hali. */
export function getCanvasSize() {
  const world = getWorldSize();
  return {
    width: Math.round(world.width * RENDER_SCALE),
    height: Math.round(world.height * RENDER_SCALE)
  };
}

/**
 * Kamerayi tuvalin **o anki** olcusune kurar.
 *
 * Olculer sabit degil: cihazin orani degistiginde (donme, Safari arac cubugunun
 * acilip kapanmasi) dunya yuksekligi de degisiyor. Sabit bir sayidan kurmak
 * kamerayi tuvalden kucuk ya da buyuk birakirdi.
 */
export function configureHiDpiCamera(scene: Phaser.Scene) {
  const camera = scene.cameras.main;
  const { width, height } = scene.scale.gameSize;
  camera.setViewport(0, 0, width, height);
  camera.setZoom(RENDER_SCALE);
  camera.setScroll(0, 0);
  camera.setBounds(0, 0, width / RENDER_SCALE, height / RENDER_SCALE);
}
