import Phaser from "phaser";
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from "@karayel/shared";
import { BootScene } from "./scenes/BootScene";
import { PreloaderScene } from "./scenes/PreloaderScene";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { CharacterSelectScene } from "./scenes/CharacterSelectScene";
import { GameScene } from "./scenes/GameScene";
import "./style.css";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WORLD_WIDTH,
  height: GAME_WORLD_HEIGHT,
  scene: [BootScene, PreloaderScene, MainMenuScene, CharacterSelectScene, GameScene],
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

  const target = document.querySelector<HTMLElement>("#game") ?? document.documentElement;

  hasRequestedFullscreen = true;
  void target.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {
    hasRequestedFullscreen = false;
  });
}

document.addEventListener("pointerup", requestGameFullscreen, { passive: true });
document.addEventListener("touchend", requestGameFullscreen, { passive: true });
