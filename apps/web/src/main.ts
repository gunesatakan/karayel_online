import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloaderScene } from "./scenes/PreloaderScene";
import { GameScene } from "./scenes/GameScene";
import { setupGameControlUi, setupGameHudUi } from "./game-control-ui";
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
    roundPixels: false,
    // Painted tower art is authored far larger than the ~34px it draws at.
    // Without mipmaps that minification undersamples and the fine detail
    // shimmers into noise; power-of-two textures get a proper filter chain.
    mipmapFilter: "LINEAR_MIPMAP_LINEAR"
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
setupGameControlUi(game);
setupGameHudUi(game);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

/**
 * Tuval sinirini tazele.
 *
 * Phaser dokunus koordinatlarini onbellekteki tuval sinirindan ceviriyor. iOS
 * Safari arac cubugunu acip kapatirken tuvalin sayfa uzerindeki yerini
 * degistiriyor ama her zaman resize olayi uretmiyor; sinir eskidiginde dokunus
 * haritanin baska bir yerine, hatta kamera goruntusunun tumden disina dusuyor ve
 * hicbir sey secilemiyor.
 */
const refreshScaleBounds = () => {
  // Gorunur alanin gercek yuksekligi: iOS'ta arac cubuklarinin altinda kalan
  // kisim buna dahil degil.
  const height = window.visualViewport?.height ?? window.innerHeight;
  if (height > 0) {
    document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
  }
  game.scale.refresh();
};

refreshScaleBounds();

window.visualViewport?.addEventListener("resize", refreshScaleBounds);
window.visualViewport?.addEventListener("scroll", refreshScaleBounds);
window.addEventListener("orientationchange", refreshScaleBounds);
window.addEventListener("pageshow", refreshScaleBounds);
window.addEventListener("resize", refreshScaleBounds);

/**
 * Tam ekrana girip cikmak tuvali yeniden olcmeyi gerektirir.
 *
 * Masaustunde ilk dokunusta tam ekran isteniyor ve gecis animasyonlu: Phaser
 * gecis *sirasinda* bir ara boyutu olcup tuvali ona gore oturtuyor, gecis
 * bitince ikinci bir olay gelmedigi icin tuval o ara boyutta cakili kaliyor.
 * Sonuc, oyunun ekranin ortasinda kucucuk durmasi ve ustte altta siyah bant.
 *
 * Iki kez tazeliyoruz: biri olay aninda, digeri gecis bittikten sonra. Mobilde
 * bu hic gorunmuyordu cunku orada `visualViewport resize` ateSleniyor ve
 * yukaridaki dinleyici zaten yakaliyordu; masaustunde o olay gelmiyor.
 */
document.addEventListener("fullscreenchange", () => {
  refreshScaleBounds();
  window.setTimeout(refreshScaleBounds, 300);
});

/**
 * Dokunusun hangi elemana dustugunu kaydeder.
 *
 * Sahnedeki kayit bos kaldi: olaylar Phaser'a hic ulasmiyor. Geriye iki
 * ihtimal kaliyor -- tuvalin onunde bir HTML katmani duruyor, ya da olay
 * tuvale ulasip Phaser icinde kayboluyor. Bu dinleyici yakalama evresinde ve
 * document uzerinde oldugu icin her iki durumda da calisir; `elementFromPoint`
 * o noktada en ustte duran elemani soyler, yani sorumluyu adiyla verir.
 */
function describeElement(element: Element | null) {
  if (!element) {
    return "yok";
  }
  const id = element.id ? `#${element.id}` : "";
  const className = typeof element.className === "string" && element.className.trim()
    ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
    : "";
  return `${element.tagName.toLowerCase()}${id}${className}`;
}

document.addEventListener("pointerdown", (event) => {
  const top = document.elementFromPoint(event.clientX, event.clientY);
  game.events.emit(
    "game:touch-probe",
    `PD ${Math.round(event.clientX)},${Math.round(event.clientY)} ust ${describeElement(top)} hedef ${describeElement(event.target as Element)}`
  );
}, { capture: true, passive: true });

/**
 * Phaser dokunusu `touchstart` ile dinliyor, isaretci olaylariyla degil.
 *
 * Isaretci olayi tuvale ulastigi halde sahne hicbir sey gormuyor. Geriye tek
 * ayrim kaldi: tarayici bu dokunus icin `touchstart` uretiyor mu? Uretmiyorsa
 * Phaser'in girisi tumden kordur ve cozum baska yerdedir.
 */
document.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  game.events.emit(
    "game:touch-probe",
    `TS ${touch ? `${Math.round(touch.clientX)},${Math.round(touch.clientY)}` : "-"} hedef ${describeElement(event.target as Element)}`
  );
}, { capture: true, passive: true });

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
