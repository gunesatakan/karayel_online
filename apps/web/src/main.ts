import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloaderScene } from "./scenes/PreloaderScene";
import { GameScene } from "./scenes/GameScene";
import { setupMenuUi } from "./menu-ui";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./rendering";
import "./style.css";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false
  },
  scene: [BootScene, PreloaderScene, GameScene],
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  input: {
    activePointers: 3
  }
});

setupMenuUi(game);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

let hasRequestedFullscreen = false;

function requestGameFullscreen() {
  if (hasRequestedFullscreen || document.fullscreenElement) {
    return;
  }

  const target = document.documentElement;

  hasRequestedFullscreen = true;
  void target.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {
    hasRequestedFullscreen = false;
  });
}

document.addEventListener("pointerup", requestGameFullscreen, { passive: true });
document.addEventListener("touchend", requestGameFullscreen, { passive: true });
