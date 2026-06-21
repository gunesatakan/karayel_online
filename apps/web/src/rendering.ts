import Phaser from "phaser";
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from "@karayel/shared";

export const RENDER_SCALE = Math.min(window.devicePixelRatio || 1, 2);
export const CANVAS_WIDTH = Math.round(GAME_WORLD_WIDTH * RENDER_SCALE);
export const CANVAS_HEIGHT = Math.round(GAME_WORLD_HEIGHT * RENDER_SCALE);

export function configureHiDpiCamera(scene: Phaser.Scene) {
  const camera = scene.cameras.main;
  camera.setViewport(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  camera.setZoom(RENDER_SCALE);
  camera.setScroll(0, 0);
  camera.setBounds(0, 0, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT);
}
