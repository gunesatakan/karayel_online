import { assetUrl } from "./asset-url";

/**
 * Lobi muzigi: menude ve co-op bekleme odasinda calan tek parca.
 *
 * Mac muziksiz kaliyor (GameScene `getBackgroundMusicPath` bos yol donduruyor);
 * bu parca yalnizca mactan onceki ekranlarda. Akis:
 *
 * - Menu gorununce kaynak baglaniyor (`attach`, preload "auto"). Tarayicilar
 *   kendiliginden calmayi engelliyor; ilk dokunusta / tusta (`handleGesture`)
 *   calmayi deniyor, red sessizce yutuluyor ve sonraki dokunus yeniden deniyor.
 * - Mac baslayinca (`stop`) ~600 ms'de kisilip duruyor ve kaynak birakiliyor:
 *   mac sirasinda indirme surmesin. Durdurulan denetleyici bir daha calmiyor;
 *   mactan menuye donus sayfayi yeniden yukluyor, muzik orada bastan basliyor.
 * - Sekme gizlenince duruyor, gorununce caliyorduysa devam ediyor.
 * - Seviye oyun icindeki muzik kaydiricisinin (karayel.musicVolume) yarisi;
 *   ayrica menudeki kucuk dugmenin kalici sessiz bayragi var. Kaydiricinin
 *   degeri dugmeyle ezilmiyor.
 *
 * Depo erisimi her yerde try/catch icinde: gizli pencerede depo yok sayilir.
 */

/** Paketteki yol; `assetUrl` ile cozuluyor (itch alt yolu). */
export const MENU_MUSIC_PATH = "audio/music/last-stand.mp3";
/** Oyun icindeki muzik kaydiricisinin deposu (GameScene ayni anahtari kullaniyor). */
export const MUSIC_VOLUME_STORAGE_KEY = "karayel.musicVolume";
/** Kaydirici hic surulmediyse muzik seviyesi (GameScene ile ortak). */
export const DEFAULT_MUSIC_VOLUME = 0.34;
/** Menudeki muzik dugmesinin kalici bayragi: "1" sessiz. */
export const MENU_MUSIC_MUTED_STORAGE_KEY = "karayel.menuMusicMuted";
/** Lobi parcasi kaydiricinin yarisinda: menu sesleri ve efektlerin altinda kalsin. */
export const MENU_MUSIC_GAIN = 0.5;
/** Mac baslarken kisilma suresi. */
export const MENU_MUSIC_FADE_MS = 600;
const FADE_STEP_MS = 40;

/** Denetleyicinin kullandigi `HTMLAudioElement` parcasi; testler sahtesini veriyor. */
export type MenuMusicAudio = {
  src: string;
  preload: string;
  loop: boolean;
  volume: number;
  readonly paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type MenuMusicDeps = {
  createAudio: () => MenuMusicAudio;
  /** Depo; erisim hata atabilir (gizli pencere), denetleyici yakaliyor. */
  storage: () => StorageLike | undefined;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

function clampVolume(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** Oyun icindeki muzik kaydiricisinin degeri; yoksa ya da bozuksa varsayilan. */
export function readMusicSetting(storage: () => StorageLike | undefined): number {
  try {
    const stored = storage()?.getItem(MUSIC_VOLUME_STORAGE_KEY);
    if (stored === null || stored === undefined) return DEFAULT_MUSIC_VOLUME;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? clampVolume(parsed) : DEFAULT_MUSIC_VOLUME;
  } catch {
    return DEFAULT_MUSIC_VOLUME;
  }
}

export function readMenuMusicMuted(storage: () => StorageLike | undefined = browserStorage): boolean {
  try {
    return storage()?.getItem(MENU_MUSIC_MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function browserStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export class MenuMusic {
  private audio?: MenuMusicAudio;
  /** Oyuncu bir kez dokundu: tarayici artik calmaya izin verebilir. */
  private gestured = false;
  /** Mac basladi; bu denetleyici bir daha calmiyor. */
  private stopped = false;
  private muted: boolean;
  /** Sekme gizlenirken caliyordu; gorununce devam edecek. */
  private resumeOnVisible = false;
  private hidden = false;
  private fadeHandle: unknown;

  constructor(private readonly deps: MenuMusicDeps) {
    this.muted = readMenuMusicMuted(deps.storage);
  }

  /** Hedef seviye: kaydirici x 0.5; sessizse 0. */
  get targetVolume() {
    return this.muted ? 0 : clampVolume(readMusicSetting(this.deps.storage) * MENU_MUSIC_GAIN);
  }

  get isMuted() {
    return this.muted;
  }

  get isStopped() {
    return this.stopped;
  }

  get isPlaying() {
    return Boolean(this.audio && !this.audio.paused);
  }

  /**
   * Menu gorundu: kaynagi bagla ve onden yuklemeye basla. Mactan sonra ve
   * sessizken hicbir sey yapmiyor (kapali muzik icin 3 MB indirilmesin; dugme
   * acilinca baglaniyor).
   */
  attach() {
    if (this.stopped || this.muted || this.audio) return;
    const audio = this.deps.createAudio();
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = this.targetVolume;
    audio.src = assetUrl(MENU_MUSIC_PATH);
    this.audio = audio;
  }

  /** Ilk kullanici hareketi (pointerdown/keydown): calmayi dene. */
  handleGesture() {
    if (this.stopped) return;
    this.gestured = true;
    this.tryPlay();
  }

  /** Sekme gorunurlugu degisti. */
  setHidden(hidden: boolean) {
    if (this.stopped || hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) {
      this.resumeOnVisible = this.isPlaying;
      this.audio?.pause();
      return;
    }
    if (this.resumeOnVisible) {
      this.resumeOnVisible = false;
      this.tryPlay();
    }
  }

  /** Menudeki dugme; bayrak kalici. Acmak da bir dokunus: hemen caliyor. */
  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      this.deps.storage()?.setItem(MENU_MUSIC_MUTED_STORAGE_KEY, muted ? "1" : "0");
    } catch {
      // Depo yoksa tercih yalnizca bu sayfada gecerli.
    }
    if (this.stopped) return;
    if (muted) {
      this.resumeOnVisible = false;
      this.audio?.pause();
      return;
    }
    this.gestured = true;
    this.tryPlay();
  }

  /** Mac basliyor: kis, durdur, kaynagi birak. */
  stop(fadeMs = MENU_MUSIC_FADE_MS) {
    if (this.stopped) return;
    this.stopped = true;
    this.resumeOnVisible = false;
    const audio = this.audio;
    if (!audio) return;
    if (audio.paused || fadeMs <= 0) {
      this.release(audio);
      return;
    }
    const startVolume = audio.volume;
    const steps = Math.max(1, Math.round(fadeMs / FADE_STEP_MS));
    let step = 0;
    this.fadeHandle = this.deps.setInterval(() => {
      step += 1;
      audio.volume = clampVolume(startVolume * (1 - step / steps));
      if (step >= steps) {
        this.deps.clearInterval(this.fadeHandle);
        this.fadeHandle = undefined;
        this.release(audio);
      }
    }, FADE_STEP_MS);
  }

  private tryPlay() {
    if (this.stopped || this.muted || this.hidden || !this.gestured) return;
    this.attach();
    const audio = this.audio;
    if (!audio || !audio.paused) return;
    audio.volume = this.targetVolume;
    try {
      const played = audio.play();
      if (played && typeof played.catch === "function") {
        played.catch(() => {
          // Tarayici hala izin vermiyor; bir sonraki dokunus yeniden dener.
        });
      }
    } catch {
      // Eski tarayicilarda play() dogrudan hata atabiliyor.
    }
  }

  private release(audio: MenuMusicAudio) {
    audio.pause();
    // Kaynagi birak: mac sirasinda 3 MB'lik indirme surmesin.
    audio.removeAttribute("src");
    audio.load();
    if (this.audio === audio) this.audio = undefined;
  }
}

/**
 * Menude lobi muzigini kur: ses ogesi, ilk dokunus, sekme gorunurlugu.
 *
 * Ses ogesi gizli olarak sayfaya ekleniyor (`data-menu-music`); tarayicida
 * incelenebilsin. Dinleyiciler `stop` ile kaldiriliyor.
 *
 * `preload: false`: menu hemen maca gececek (kosu raporunun "Tekrar"i); kaynak
 * o zaman ancak oyuncu menude dokunursa baglaniyor.
 */
export function installMenuMusic(options: { preload?: boolean } = {}, doc: Document = document) {
  let element: HTMLAudioElement | undefined;
  const music = new MenuMusic({
    createAudio: () => {
      element = doc.createElement("audio");
      element.hidden = true;
      element.dataset.menuMusic = "";
      doc.body.append(element);
      return element;
    },
    storage: browserStorage,
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: (handle) => window.clearInterval(handle as number)
  });

  const onGesture = (event: Event) => {
    // Muzik dugmesine ilk dokunus kendi isini yapiyor; burada calmaya baslarsa
    // "kapat" dokunusunda bir an ses kacardi.
    const target = event.target;
    if (target instanceof Element && target.closest("[data-menu-music-toggle]")) return;
    music.handleGesture();
  };
  const onVisibility = () => music.setHidden(doc.visibilityState === "hidden");

  doc.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
  doc.addEventListener("keydown", onGesture, { capture: true });
  doc.addEventListener("visibilitychange", onVisibility);
  music.setHidden(doc.visibilityState === "hidden");
  if (options.preload !== false) music.attach();

  return {
    music,
    /** Sayfadaki ses ogesi (baglandiysa); kaynak birakilsa da sayfada kaliyor. */
    element: () => element,
    setMuted: (muted: boolean) => music.setMuted(muted),
    isMuted: () => music.isMuted,
    /** Mac basliyor: muzigi kis ve menu dinleyicilerini kaldir. */
    stop: () => {
      doc.removeEventListener("pointerdown", onGesture, { capture: true });
      doc.removeEventListener("keydown", onGesture, { capture: true });
      doc.removeEventListener("visibilitychange", onVisibility);
      music.stop();
    }
  };
}

export type MenuMusicHandle = ReturnType<typeof installMenuMusic>;
