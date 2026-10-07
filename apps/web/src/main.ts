import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloaderScene } from "./scenes/PreloaderScene";
import { GameScene } from "./scenes/GameScene";
import { setupGameControlUi, setupGameHudUi } from "./game-control-ui";
import { setupMenuUi } from "./menu-ui";
import { setupTutorial } from "./tutorial";
import { installCatalogLocale } from "./catalog-locale";
import { getCanvasSize } from "./rendering";
import { startTelemetry } from "./telemetry-boot";
import "./style.css";

const initialCanvas = getCanvasSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: initialCanvas.width,
  height: initialCanvas.height,
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

/**
 * VFX galerisi (`?vfx-gallery`): menu, sunucu ve oda yok. Sahne yalnizca bu
 * adreste yukleniyor (ayri parca); oyunun kendi cizicilerini sahte ama
 * deterministik bir savasla besliyor. Ayrinti: scenes/VfxGalleryScene.ts.
 */
const vfxGallery = new URLSearchParams(window.location.search).has("vfx-gallery");
if (vfxGallery) {
  const launchGallery = async () => {
    const { VfxGalleryScene } = await import("./scenes/VfxGalleryScene");
    if (!game.scene.getScene("vfx-gallery")) game.scene.add("vfx-gallery", VfxGalleryScene, false);
    game.scene.stop("preloader");
    game.scene.start("vfx-gallery");
  };
  window.addEventListener("karayel:phaser-ready", () => void launchGallery(), { once: true });
  // Ileride ekran goruntusu karsilastirmasi (Playwright) oyunu buradan
  // adim adim surebilsin; yalnizca galeri adresinde.
  (window as unknown as { __karayelVfxGallery?: Phaser.Game }).__karayelVfxGallery = game;
} else {
  // Katalog metinleri dile baksin; menu ilk cizimde kart ve kule adlarini okuyor.
  installCatalogLocale();
  setupMenuUi(game);
  setupGameControlUi(game);
  setupGameHudUi(game);
  setupTutorial(game);
  // Anonim telemetri: galeri ve gelistirme sahnesi bu yoldan gecmiyor.
  startTelemetry(game);
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    // Goreli: itch.io'da paket bir alt yolda. Orada oyun baska kokenli bir
    // iframe'de; tarayici kaydi reddedebilir, oyun icin onemsiz.
    navigator.serviceWorker.register("sw.js").catch(() => undefined);
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

  // `--app-height` yeni yazildi; tuvalin sigacagi kutu ancak yerlesim yeniden
  // hesaplandiktan sonra dogru olculur. Olcuyu ondan aliyoruz, o yuzden once
  // yazip sonra okumak gerekiyor.
  const canvas = getCanvasSize();
  // Olculer artik kesirli: tam esitlik aramak her karede yeniden boyutlandirmak
  // demek olurdu. Yarim pikselin altindaki fark zaten gorunmuyor.
  const degisti = Math.abs(game.scale.gameSize.width - canvas.width) > 0.5
    || Math.abs(game.scale.gameSize.height - canvas.height) > 0.5;
  if (degisti) {
    game.scale.resize(canvas.width, canvas.height);

    /*
     * FIT olcegi tuvali `displaySize`in **kilitli** en/boy oranina gore
     * sigdiriyor ve `resize` o kilidi acmiyor: oran acilista ne olculduyse orada
     * kaliyor. Yani oyunun olcusunu degistirmek tuvalin oranini degistirmiyor.
     *
     * iPhone'da fark edilmiyordu cunku Safari'de acilisda olculen oran zaten
     * dogru oran. Android'de ise Chrome adres cubugunu acilistan hemen sonra
     * topluyor, gorunur alan degisiyor ve oyun yeniden boyutlaniyor -- ama tuval
     * acilistaki orana gore sigdirilmaya devam ediyor. Sonuc, haritanin ustunde
     * ve altinda kalan bant.
     */
    game.scale.displaySize.setAspectRatio(canvas.width / canvas.height);
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

let hasRequestedFullscreen = false;

/**
 * Baska bir sayfaya gomulu (itch.io iframe'i) ve dokunmatik olmayan cihaz:
 * masaustunde ilk tiklamada tam ekrana gecmek sayfayi okuyan oyuncuyu
 * sasirtiyor, itch'in kendi tam ekran dugmesi var. Telefonda yine otomatik.
 */
const skipAutoFullscreen = (() => {
  try {
    return window.self !== window.top && !window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return true;
  }
})();

function requestGameFullscreen() {
  if (skipAutoFullscreen || hasRequestedFullscreen || document.fullscreenElement) {
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

/**
 * Gelistirme derlemesinde sahneye tutamak.
 *
 * Gorsel bir degisikligi -- bir efektin kademesi, bir isinin cizimi -- ancak
 * gorerek dogrulayabiliyoruz, ama o efekti oyunda gormek icin dogru kuleyi
 * dogru seviyede sahaya cikarmak gerekiyor. Bu kanca sahneyi konsola acar,
 * boylece tek bir isin uydurup ciziminin nasil gorundugune bakilabilir.
 *
 * `import.meta.env.DEV` kosulu uretim paketinde bu satirin tamamen elenmesini
 * saglar; yayinlanan oyunda boyle bir global yoktur.
 */
if (import.meta.env.DEV) {
  (window as unknown as { __karayel?: Phaser.Game }).__karayel = game;
}
