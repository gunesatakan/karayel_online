import Phaser from "phaser";
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from "@karayel/shared";

export const RENDER_SCALE = Math.min(window.devicePixelRatio || 1, 2);

/**
 * Tuvalin sigdirilacagi kutu.
 *
 * Phaser'in FIT olcegi **bu elemani** olcuyor ve tuvali onun icine oturtuyor.
 * Dolayisiyla dunyanin orani da buradan cikmali: baska bir yerden (mesela
 * dogrudan `visualViewport`) hesaplanirsa iki oran ayrilabiliyor ve FIT farki
 * siyah bant olarak birakiyor. iOS'ta ikisi ayni oldugu icin fark etmiyordu;
 * Android'de arac cubugunun davranisi yuzunden ayrilip ust ve alt bant
 * biraktigi bildirildi.
 *
 * Eleman olculemezse gorunur alana duSuluyor -- ilk cagri Phaser daha
 * baslamadan, `#game` yerlesime girmeden once oluyor.
 */
function getHostSize() {
  const host = document.getElementById("game");
  const rect = host?.getBoundingClientRect();
  if (rect && rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  return {
    width: Math.max(1, window.visualViewport?.width ?? window.innerWidth),
    height: Math.max(1, window.visualViewport?.height ?? window.innerHeight)
  };
}

/**
 * Oyunun dunya olcusu.
 *
 * Genislik tasarim sabiti: harita, yerlesim ve kaplama oranlarinin tamami 390
 * birimlik bir serite gore yazilmis. Yukseklik ise cihazdan geliyor.
 *
 * Sabit 844 birim tutuldugunda tuvalin orani ekranin oraniyla tutmuyordu ve
 * Phaser'in FIT olcegi farki siyah bant olarak birakiyordu.
 *
 * Yukseklik bilerek yuvarlanmiyor: tam sayiya cekmek orani birkac binde bir
 * kaydiriyor ve FIT o farki yine bant olarak birakiyor. Kesirli bir dunya
 * olcusunun bir zarari yok, kenarda kalan yarim piksel var.
 */
export function getWorldSize() {
  const host = getHostSize();
  return {
    width: GAME_WORLD_WIDTH,
    // Tasarim yuksekligi yalnizca olculemeyen bir durumda yedek.
    height: Math.max(1, (GAME_WORLD_WIDTH * host.height) / host.width) || GAME_WORLD_HEIGHT
  };
}

/** Tuvalin piksel olcusu: dunya olcusunun cihaz cozunurlugune tasinmis hali. */
export function getCanvasSize() {
  const world = getWorldSize();
  return {
    width: world.width * RENDER_SCALE,
    height: world.height * RENDER_SCALE
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
