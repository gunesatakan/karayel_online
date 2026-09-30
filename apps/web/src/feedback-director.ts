import type Phaser from "phaser";
import {
  FEEDBACK_LIMITS,
  FeedbackGovernor,
  getFeedbackPitchRatio,
  type FeedbackDecision,
  type FeedbackInput,
  type FeedbackKind,
  type FeedbackPriority
} from "@karayel/shared";

export type { FeedbackDecision, FeedbackInput, FeedbackKind, FeedbackPriority } from "@karayel/shared";

/**
 * Geri bildirim yonetmeni.
 *
 * Oyunun her kucuk odulu (oldurme, altin, kritik, seviye, kart) buradan
 * geciyor: `emit` tek cagri, butceyi paylasilan `FeedbackGovernor` tutuyor,
 * burasi da sonucu yurutuyor -- sentez sesi, kucuk kamera sarsintisi,
 * telefon titresimi. Gorselin kendisi cagiranda kaliyor; karar ona
 * "goster / birlestir / dusur" diye donuyor.
 *
 * Ses dosyasi yok, hepsi Web Audio ile sentez. Uyari tonlarinin eskiden
 * GameScene'de tuttugu tek baglam artik burada: iOS ses baglamini yalnizca
 * gercek bir dokunusla aciyor ve birden fazla baglam sessizlikle bitiyor.
 *
 * Kanal ayrimi:
 * - Efektler: bu dosyanin sentez sesleri, kendi kaydiricisi var.
 * - Seslendirme: seri klipleri ve uyari tonlari; uyari burada caliniyor ama
 *   seviyesini cagiran veriyor, efekt kanalina girmiyor.
 */

/** Tek tonun tarifi: dalga, perde (istege bagli kayma), baslangic, sure, seviye. */
type Tone = { wave: OscillatorType; from: number; to?: number; at: number; dur: number; gain: number };

type Voice = { endsAt: number; gain: GainNode; sources: OscillatorNode[] };

/** Takim arkadasinin sesi: duyulsun ama seninkinin ustune binmesin. */
const TEAMMATE_SFX_GAIN = 0.35;
/** Uyari tonunun suresi. Kisa: uyari, muzik degil. */
const ALERT_TONE_SECONDS = 0.24;
/**
 * Baglam surdurulurken istenen sesin bekleyebildigi en uzun sure.
 *
 * `resume` baglami hemen degil biraz sonra "running"e geciriyor; dokunusun
 * icinde `unlockAudio` + `playSfx` cagrisi o arada bosa gidiyordu (ulti bas
 * vurusu, kaydirici onizlemesi). Daha uzun beklemek sesi dokunustan koparir.
 */
const PENDING_SFX_MS = 300;

const NOTE = {
  C3: 130.81,
  C4: 261.63,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760,
  C7: 2093
} as const;

/**
 * Ses tarifleri.
 *
 * Hepsi kisa ve kuru: telefon hoparlorunde uzun kuyruklu ses bir sonrakiyle
 * camura donuyor. Sik gelenler (oldurme, altin, kritik) en kisik ve en kisa;
 * seyrek olanlar (kademe, dalga temizleme) daha dolgun. `r` perde carpani:
 * kombo ilerledikce oldurme ve altin sesi yukseliyor.
 */
const SFX_RECIPES: Partial<Record<FeedbackKind, (r: number) => Tone[]>> = {
  kill: (r) => [
    { wave: "triangle", from: 440 * r * 1.45, to: 440 * r, at: 0, dur: 0.075, gain: 0.16 },
    { wave: "sine", from: 220 * r, to: 130 * r, at: 0, dur: 0.1, gain: 0.1 }
  ],
  // Altin tinisi bir oktavdan fazla tirmanmiyor; ustu telefonda cizirti.
  coin: (r) => [
    { wave: "triangle", from: NOTE.G6 * Math.min(r, 2), at: 0, dur: 0.05, gain: 0.05 },
    { wave: "sine", from: NOTE.C7 * Math.min(r, 2), at: 0.04, dur: 0.1, gain: 0.06 }
  ],
  crit: () => [
    { wave: "square", from: 2600, to: 1400, at: 0, dur: 0.035, gain: 0.045 },
    { wave: "triangle", from: 1200, to: 900, at: 0.005, dur: 0.06, gain: 0.08 }
  ],
  level: () => [
    { wave: "triangle", from: NOTE.C5, at: 0, dur: 0.12, gain: 0.12 },
    { wave: "triangle", from: NOTE.G5, at: 0.09, dur: 0.2, gain: 0.12 }
  ],
  tier: () => [
    { wave: "triangle", from: NOTE.C5, at: 0, dur: 0.14, gain: 0.11 },
    { wave: "triangle", from: NOTE.E5, at: 0.09, dur: 0.16, gain: 0.11 },
    { wave: "triangle", from: NOTE.G5, at: 0.18, dur: 0.4, gain: 0.12 },
    { wave: "sine", from: NOTE.C3, to: 110, at: 0, dur: 0.55, gain: 0.24 }
  ],
  // Telefon hoparlorunde 250 Hz'in alti neredeyse duyulmuyor; tik dokunusun
  // cevabini tasiyor, bas kulaklikta.
  place: () => [
    { wave: "sine", from: 170, to: 62, at: 0, dur: 0.12, gain: 0.32 },
    { wave: "triangle", from: 95, to: 70, at: 0, dur: 0.07, gain: 0.12 },
    { wave: "square", from: 2200, to: 1200, at: 0, dur: 0.02, gain: 0.03 },
    { wave: "triangle", from: 520, to: 300, at: 0, dur: 0.05, gain: 0.05 }
  ],
  cardFlip: () => [
    { wave: "triangle", from: 700, to: 1500, at: 0, dur: 0.055, gain: 0.05 }
  ],
  cardPick: () => [
    { wave: "square", from: 260, to: 120, at: 0, dur: 0.06, gain: 0.06 },
    { wave: "sine", from: 196, to: 98, at: 0, dur: 0.14, gain: 0.22 },
    { wave: "triangle", from: NOTE.C6, at: 0.02, dur: 0.09, gain: 0.05 }
  ],
  // Nadir kart: yukselen parlak uclu (E6-G6-C7) ve altta yumusak bir C6.
  // Dalga akorundan (duz, dolgun) ve ulti hazir sesinden (iki nota) ayri
  // okunmali; oyuncu kartlara bakmadan "nadir geldi"yi duyabilsin.
  cardRare: () => [
    { wave: "sine", from: NOTE.E6, at: 0, dur: 0.14, gain: 0.06 },
    { wave: "sine", from: NOTE.G6, at: 0.07, dur: 0.16, gain: 0.06 },
    { wave: "sine", from: NOTE.C7, at: 0.14, dur: 0.42, gain: 0.07 },
    { wave: "triangle", from: NOTE.C6, at: 0.14, dur: 0.46, gain: 0.035 }
  ],
  waveClear: () => [
    { wave: "sine", from: NOTE.C4, at: 0, dur: 1, gain: 0.08 },
    { wave: "triangle", from: NOTE.C5, at: 0, dur: 0.9, gain: 0.07 },
    { wave: "triangle", from: NOTE.E5, at: 0.025, dur: 0.88, gain: 0.07 },
    { wave: "triangle", from: NOTE.G5, at: 0.05, dur: 0.86, gain: 0.07 },
    { wave: "triangle", from: NOTE.C6, at: 0.075, dur: 0.84, gain: 0.06 }
  ],
  ultimateReady: () => [
    { wave: "sine", from: NOTE.A5, at: 0, dur: 0.12, gain: 0.1 },
    { wave: "sine", from: NOTE.E6, at: 0.1, dur: 0.28, gain: 0.1 },
    { wave: "triangle", from: NOTE.A6, at: 0.1, dur: 0.22, gain: 0.03 }
  ],
  // Yerlestirmedeki gibi: bas vurusu kulaklik icin, ustteki tik ve orta ton
  // telefon hoparlorunde basildigini duyurmak icin.
  ultimate: () => [
    { wave: "sine", from: 120, to: 42, at: 0, dur: 0.38, gain: 0.38 },
    { wave: "triangle", from: 240, to: 90, at: 0, dur: 0.12, gain: 0.1 },
    { wave: "square", from: 1600, to: 700, at: 0, dur: 0.03, gain: 0.035 },
    { wave: "triangle", from: 480, to: 180, at: 0, dur: 0.1, gain: 0.06 }
  ],
  // Sunucu onaylari. Dordu de ayni aileden (kisa, kuru, sonunda bir nota)
  // ama bakmadan ayirt edilebilmeli: oyuncu cekmeceden gozunu ayirmadan
  // neyin oldugunu duyabilsin.
  // Kasa: cekmecenin iki kuru tiki ("ka") ve zil ("ching"). Altin tinisiyla
  // (G6-C7) ayni renk ama uzun kuyruklu -- kazanmak degil harcamak.
  purchase: () => [
    { wave: "square", from: 1900, to: 1100, at: 0, dur: 0.028, gain: 0.035 },
    { wave: "square", from: 2400, to: 1500, at: 0.045, dur: 0.028, gain: 0.03 },
    { wave: "sine", from: NOTE.E6, at: 0.075, dur: 0.26, gain: 0.07 },
    { wave: "sine", from: NOTE.C7, at: 0.085, dur: 0.3, gain: 0.06 },
    { wave: "triangle", from: NOTE.G6, at: 0.085, dur: 0.12, gain: 0.03 }
  ],
  // Takma: kilidin tiki, kulenin govdesinde bir tok ses, sonra yukari bir onay.
  equip: () => [
    { wave: "square", from: 1400, to: 600, at: 0, dur: 0.025, gain: 0.05 },
    { wave: "sine", from: 160, to: 70, at: 0.02, dur: 0.11, gain: 0.26 },
    { wave: "triangle", from: NOTE.G5, at: 0.09, dur: 0.1, gain: 0.07 },
    { wave: "triangle", from: NOTE.C6, at: 0.15, dur: 0.18, gain: 0.07 }
  ],
  // Onarim: yukselen uc anahtar tiki, sonra yumusak bir dortlu (E5-A5).
  repair: () => [
    { wave: "square", from: 620, to: 480, at: 0, dur: 0.022, gain: 0.04 },
    { wave: "square", from: 700, to: 540, at: 0.065, dur: 0.022, gain: 0.04 },
    { wave: "square", from: 790, to: 610, at: 0.13, dur: 0.022, gain: 0.045 },
    { wave: "sine", from: NOTE.E5, at: 0.19, dur: 0.12, gain: 0.08 },
    { wave: "sine", from: NOTE.A5, at: 0.25, dur: 0.2, gain: 0.08 }
  ],
  // Guc: yukselen bir supurme ve besli (G5-D6). Kademe arttikca perde
  // yukseliyor; bir oktavin ustu telefonda cizirti, orada duruyor.
  upgrade: (r) => {
    const p = Math.min(r, 2);
    return [
      { wave: "sine", from: 190 * p, to: 760 * p, at: 0, dur: 0.22, gain: 0.07 },
      { wave: "triangle", from: NOTE.G5 * p, at: 0.17, dur: 0.12, gain: 0.08 },
      { wave: "triangle", from: NOTE.D6 * p, at: 0.25, dur: 0.28, gain: 0.08 }
    ];
  }
};

export type FeedbackDirectorOptions = {
  sfxVolume: number;
  vibration: boolean;
  /** Sarsilacak kamera; sahne kurulmadan once yok olabilir. */
  getCamera: () => Phaser.Cameras.Scene2D.Camera | undefined;
};

export class FeedbackDirector {
  private readonly governor: FeedbackGovernor;
  private readonly getCamera: () => Phaser.Cameras.Scene2D.Camera | undefined;
  private context?: AudioContext;
  private sfxBus?: GainNode;
  private voices: Voice[] = [];
  private sfxVolume: number;
  /** Son `resume` istegi; bekleyen ses yalnizca bunun hemen ardindan tutuluyor. */
  private resumeRequestedAt?: number;
  /**
   * Baglam acilirken istenen tek ses. Tek yuva: acildigi an bir yigin ses
   * birden calmasin (emit'in "acilinca patlama yok" kurali).
   */
  private pendingSfx?: { kind: FeedbackKind; step: number; own: boolean; at: number };
  private motionQuery?: MediaQueryList;
  private readonly handleMotionChange = (event: MediaQueryListEvent) => {
    this.governor.setReducedMotion(event.matches);
  };

  constructor(options: FeedbackDirectorOptions) {
    this.sfxVolume = clampVolume(options.sfxVolume);
    this.getCamera = options.getCamera;
    this.motionQuery = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : undefined;
    this.governor = new FeedbackGovernor({
      reducedMotion: this.motionQuery?.matches ?? false,
      vibration: options.vibration
    });
    // Oyun acikken sistem ayari degisirse beklemeden uyulsun. Eski Safari
    // yalnizca `addListener` taniyor.
    if (this.motionQuery) {
      if (typeof this.motionQuery.addEventListener === "function") {
        this.motionQuery.addEventListener("change", this.handleMotionChange);
      } else {
        this.motionQuery.addListener?.(this.handleMotionChange);
      }
    }
  }

  /** Hareket azaltma acik mi; pop, zoom ve ucusu atlamak isteyen cagiranlar icin. */
  get reducedMotion() {
    return this.governor.isReducedMotion();
  }

  /** Cihaz titresimi destekliyor mu. iOS Safari desteklemiyor; ayar orada gizli. */
  static canVibrate() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  }

  /**
   * Tek olay, tek cagri.
   *
   * Ses, sarsinti ve titresim burada yurutuluyor; gorselin kendisi cagiranda.
   * Donen karar `show` ise yeni gorsel ac, `recycle` ise en eski canli
   * gorseli geri donustur, `merge` ise oncekine ekle; hicbiri degilse dusur.
   *
   * Baglam henuz acilmadiysa (ilk dokunustan once) ses sessizce atlanir:
   * askida baglama sirayla yazilan sesler, acildigi an hepsi birden calardi.
   */
  emit(kind: FeedbackKind, input: FeedbackInput): FeedbackDecision {
    const audible = !input.silent && this.isSfxReady(kind);
    const decision = this.governor.decide(kind, { ...input, silent: !audible }, performance.now());
    if (decision.sound) {
      this.synthesize(kind, decision.step, decision.own, decision.stealVoice);
    }
    if (decision.shakePx > 0) {
      this.applyShake(decision.shakePx);
    }
    if (decision.vibrateMs > 0) {
      this.applyVibrate(decision.vibrateMs);
    }
    return decision;
  }

  /**
   * Yalnizca ses; ayni butce ve hiz siniriyla.
   *
   * Gorseli olmayan anlar icin (kart cevirme, ulti hazir). Baglami kendisi
   * acmiyor: dokunus disinda acilan baglam askida kalip uyari basiyor. Bir
   * kullanici hareketinin icindeysen once `unlockAudio` cagir; baglam o an
   * surduruluyorsa ses kisa bir sure (`PENDING_SFX_MS`) tutulup baglam acilir
   * acilmaz caliyor. Bu durumda donus yine `false`: ses henuz calmadi.
   */
  playSfx(kind: FeedbackKind, options: { step?: number; own?: boolean } = {}) {
    if (!this.isSfxReady(kind)) {
      this.holdPendingSfx(kind, options);
      return false;
    }
    const own = options.own ?? true;
    const admitted = this.governor.admitSound(kind, own, performance.now());
    if (!admitted.play) {
      return false;
    }
    return this.synthesize(kind, options.step ?? 0, own, admitted.steal);
  }

  /**
   * Yonetilen kamera sarsintisi.
   *
   * Yalnizca yerel P0/P1 olayinda, en fazla 3 px ve aralikla; hareket
   * azaltma aciksa hic. Takim arkadasinin olayi hicbir zaman buraya gelmemeli.
   * `durationMs` genligi degil yalnizca sureyi uzatiyor (Melis serisinin
   * uzun titremesi); verilmezse genlikten.
   */
  shakeCamera(options: { own: boolean; priority: FeedbackPriority; px: number; durationMs?: number }) {
    const px = this.governor.admitShake(options.own, options.priority, options.px, performance.now());
    if (px > 0) {
      this.applyShake(px, options.durationMs);
    }
    return px > 0;
  }

  /** Kisa titresim (10-15 ms); kullanici kapattiysa ya da cihaz desteklemiyorsa hic. */
  vibrate(ms = 12) {
    if (!FeedbackDirector.canVibrate()) {
      return false;
    }
    const allowed = this.governor.admitVibrate(ms, performance.now());
    if (allowed > 0) {
      this.applyVibrate(allowed);
    }
    return allowed > 0;
  }

  setSfxVolume(value: number) {
    this.sfxVolume = clampVolume(value);
    if (this.context && this.sfxBus) {
      // Aniden atlayan seviye tik sesi cikariyor; kisa bir yumusatma yeterli.
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.context.currentTime, 0.015);
    }
  }

  setVibration(on: boolean) {
    this.governor.setVibration(on);
  }

  /** Butce kullanimi ve sinirlari; performans panelindeki tani satiri icin. */
  getBudgetUsage() {
    const now = performance.now();
    return {
      numbers: this.governor.liveCount("number", now),
      labels: this.governor.liveCount("label", now),
      voices: this.governor.activeVoices(now),
      reducedMotion: this.governor.isReducedMotion(),
      limits: FEEDBACK_LIMITS
    };
  }

  /**
   * Gedik ve akis kaymasi uyarilari.
   *
   * Ikisi ayni sey degil -- gedik alcalan bir ton (kotu, hemen bak), akis
   * kaymasi yukselen (bilgi, kurulusunu gozden gecir). Seviye her calista
   * okunuyor; eskiden yalnizca kurulusta yaziliyor ve ayardan kisilamiyordu.
   * Efekt butcesine girmiyor: uyari seyrek ve kacirilmamali.
   */
  playAlert(kind: "breach" | "flow", volume: number) {
    if (volume <= 0) {
      return;
    }

    const context = this.getAudioContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }

    const now = context.currentTime;
    const [fromHz, toHz] = kind === "breach" ? [820, 400] : [500, 760];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(fromHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(toHz, now + ALERT_TONE_SECONDS * 0.7);
    // Ussel rampa sifira inemez; duyulmayan bir tabandan basliyor ve oraya donuyor.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2 * volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ALERT_TONE_SECONDS);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + ALERT_TONE_SECONDS + 0.02);
  }

  /**
   * Baglami acar ya da askidaysa surdurur.
   *
   * Tuvalde parmagin birakilmasindan (pointerup) ve her HUD eyleminden
   * cagriliyor: dokunmatikte pointerdown kullanici etkinlestirmesi sayilmiyor,
   * iOS baglami yalnizca gercek bir kullanici hareketinin icinde baslatiyor,
   * arka plandan donunce de yeniden askiya alabiliyor.
   */
  unlockAudio() {
    const context = this.getAudioContext();
    // iOS arama ya da alarm sonrasi baglami "interrupted" birakabiliyor; o da
    // ayni sekilde surduruluyor.
    if (context && context.state !== "running" && context.state !== "closed") {
      this.resumeRequestedAt = performance.now();
      // `resume` durumu hemen degistirmiyor; ayni dokunusta istenen ses
      // (ulti bas vurusu) baglam acilinca yetissin.
      void context.resume().then(() => this.flushPendingSfx()).catch(() => undefined);
    }
  }

  destroy() {
    if (this.motionQuery) {
      if (typeof this.motionQuery.removeEventListener === "function") {
        this.motionQuery.removeEventListener("change", this.handleMotionChange);
      } else {
        this.motionQuery.removeListener?.(this.handleMotionChange);
      }
      this.motionQuery = undefined;
    }
    this.governor.reset();
    this.voices = [];
    this.pendingSfx = undefined;
    this.resumeRequestedAt = undefined;
    this.sfxBus = undefined;
    // iOS ayni anda acik baglam sayisini sinirliyor; sahne kapaninca birak.
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
  }

  /** Tek bir baglam; her seste yenisini acmak iOS'ta sessizlikle sonuclanir. */
  private getAudioContext() {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.context = Context ? new Context() : undefined;
    }
    return this.context;
  }

  /**
   * Efekt sesinin cikis yolu: ses seviyesi, sonra sikistirici.
   *
   * Sikistirici ust uste binen seslerin (oldurme + altin + kritik) telefon
   * hoparlorunu patlatmasini onluyor; butce 6 sesle sinirli ama tepe yine de
   * toplaniyor.
   */
  private getSfxBus(context: AudioContext) {
    if (!this.sfxBus) {
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.12;
      compressor.connect(context.destination);
      const bus = context.createGain();
      bus.gain.value = this.sfxVolume;
      bus.connect(compressor);
      this.sfxBus = bus;
    }
    return this.sfxBus;
  }

  private isSfxReady(kind: FeedbackKind) {
    // Askidaki baglam burada surdurulmuyor: oyun olaylari saniyede onlarca
    // kez geliyor ve dokunus disinda `resume` zaten bekleyip duruyor. Acmak
    // `unlockAudio`nun isi; tuvalde birakmada ve her HUD eyleminde cagriliyor.
    return this.sfxVolume > 0 && Boolean(SFX_RECIPES[kind]) && this.context?.state === "running";
  }

  /**
   * Baglam surdurulurken istenen sesi tek yuvada tutar.
   *
   * Yalnizca `playSfx`ten: o bir dokunusun cevabi. `emit` buraya gelmiyor,
   * yoksa baglam acilirken biriken oyun olaylari kuyruga girerdi. Yuva tek ve
   * son istek oncekinin yerini aliyor; `resume` istegi eskidiyse hic tutulmuyor.
   */
  private holdPendingSfx(kind: FeedbackKind, options: { step?: number; own?: boolean }) {
    const now = performance.now();
    const context = this.context;
    if (
      this.sfxVolume <= 0
      || !SFX_RECIPES[kind]
      || !context
      || context.state === "closed"
      || this.resumeRequestedAt === undefined
      || now - this.resumeRequestedAt > PENDING_SFX_MS
    ) {
      return;
    }
    this.pendingSfx = { kind, step: options.step ?? 0, own: options.own ?? true, at: now };
  }

  /**
   * Baglam acildi: bekleyen ses tazeyse normal yoldan caliyor.
   *
   * `playSfx` uzerinden gidiyor ki hiz siniri ve ses butcesi yine gecerli
   * olsun. Istek ve yuva once siliniyor; baglam yine acik degilse ses ikinci
   * kez tutulmuyor, dongu olmuyor.
   */
  private flushPendingSfx() {
    const pending = this.pendingSfx;
    this.pendingSfx = undefined;
    this.resumeRequestedAt = undefined;
    if (pending && performance.now() - pending.at <= PENDING_SFX_MS) {
      this.playSfx(pending.kind, { step: pending.step, own: pending.own });
    }
  }

  private synthesize(kind: FeedbackKind, step: number, own: boolean, steal: boolean) {
    const context = this.context;
    const recipe = SFX_RECIPES[kind];
    if (!context || !recipe) {
      return false;
    }

    const now = context.currentTime;
    this.voices = this.voices.filter((voice) => voice.endsAt > now);
    if (steal) {
      this.fadeOutOldestVoice(context);
    }

    const voiceGain = context.createGain();
    voiceGain.gain.value = own ? 1 : TEAMMATE_SFX_GAIN;
    voiceGain.connect(this.getSfxBus(context));

    const sources: OscillatorNode[] = [];
    let endsAt = now;
    let pending = 0;
    for (const tone of recipe(getFeedbackPitchRatio(step))) {
      const start = now + tone.at;
      const stop = start + tone.dur;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = tone.wave;
      oscillator.frequency.setValueAtTime(tone.from, start);
      if (tone.to !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(tone.to, start + tone.dur * 0.8);
      }
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(tone.gain, start + Math.min(0.012, tone.dur * 0.25));
      envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
      oscillator.connect(envelope).connect(voiceGain);
      oscillator.start(start);
      oscillator.stop(stop + 0.02);
      pending += 1;
      // Son ton bitince dugumler ayriliyor; yoksa her ses grafikte asili kalirdi.
      oscillator.onended = () => {
        pending -= 1;
        if (pending <= 0) {
          voiceGain.disconnect();
        }
      };
      sources.push(oscillator);
      endsAt = Math.max(endsAt, stop + 0.02);
    }

    this.voices.push({ endsAt, gain: voiceGain, sources });
    return true;
  }

  /** Butce dolu ve gelen ses dusurulemez: en once bitecek ses 30 ms'de kisiliyor. */
  private fadeOutOldestVoice(context: AudioContext) {
    if (this.voices.length === 0) {
      return;
    }
    let oldestIndex = 0;
    for (let index = 1; index < this.voices.length; index += 1) {
      if (this.voices[index].endsAt < this.voices[oldestIndex].endsAt) {
        oldestIndex = index;
      }
    }
    const [voice] = this.voices.splice(oldestIndex, 1);
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.03);
    for (const source of voice.sources) {
      try {
        source.stop(now + 0.04);
      } catch {
        // Zaten durmus kaynak ikinci kez durdurulamiyor; zarari yok.
      }
    }
  }

  /**
   * Sarsintiyi piksele cevirir.
   *
   * Phaser'in yogunlugu kamera genisliginin orani ve kaydirma yakinlastirmayla
   * iki kez carpiliyor; 3 px sinirinin telefonda da 3 css pikseli kalmasi icin
   * tuvalin css olcegine gore hesaplaniyor. Baska bir sarsinti suruyorsa
   * (seri bannerinin kendi sarsintisi) ustune binilmiyor.
   */
  private applyShake(px: number, durationMs?: number) {
    const camera = this.getCamera();
    if (!camera || camera.shakeEffect.isRunning) {
      return;
    }
    const canvas = camera.scene?.game?.canvas;
    const cssWidth = canvas?.getBoundingClientRect().width || camera.width;
    const canvasPerCss = (canvas?.width || camera.width) / Math.max(1, cssWidth);
    const zoom = camera.zoom || 1;
    const intensity = (px * canvasPerCss) / Math.max(1, camera.width * zoom * zoom);
    const duration = durationMs !== undefined && Number.isFinite(durationMs) ? Math.max(0, durationMs) : 80 + px * 25;
    camera.shake(Math.round(duration), intensity);
  }

  private applyVibrate(ms: number) {
    if (!FeedbackDirector.canVibrate()) {
      return;
    }
    // Chrome dokunulmamis sayfada titresimi engelliyor ve her seferinde konsola
    // uyari yaziyor; ilk dokunusa kadar denemeye gerek yok.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) {
      return;
    }
    try {
      navigator.vibrate(ms);
    } catch {
      // Bazi gomulu tarayicilar izin vermiyor; titresim sessizce atlanir.
    }
  }
}

function clampVolume(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
