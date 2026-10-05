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

import {
  HIT_SOUND_LIMITS,
  HitSoundGovernor,
  getHitPitchRatio,
  getHitVoiceDuration,
  getHitVoiceRecipe,
  type HitVoiceId
} from "./hit-sounds";
import {
  SAMPLE_FAMILIES,
  SAMPLE_RATE_SPREAD,
  SampleBank,
  getKillComboGain,
  getSampleRateJitter,
  getSampleTier,
  KillVoiceGate,
  getKillSoundCue,
  type KillSoundCue,
  type KillVoiceFamily,
  type SampleLoader,
  type SfxSampleFamily
} from "./sfx-samples";
import { fnvUnit } from "./vfx/kit";

export type { FeedbackDecision, FeedbackInput, FeedbackKind, FeedbackPriority } from "@karayel/shared";

/**
 * Geri bildirim yonetmeni.
 *
 * Oyunun her kucuk odulu (oldurme, altin, kritik, seviye, kart) buradan
 * geciyor: `emit` tek cagri, butceyi paylasilan `FeedbackGovernor` tutuyor,
 * burasi da sonucu yurutuyor -- ses, kucuk kamera sarsintisi, telefon
 * titresimi. Gorselin kendisi cagiranda kaliyor; karar ona "goster /
 * birlestir / dusur" diye donuyor.
 *
 * Savas sesleri (vurus, oldurme, kritik) kayitli ornekler (sfx-samples.ts,
 * Kenney CC0): ilk dokunusla baglam acilinca bir kez yukleniyor ve
 * cozuluyor. Ornek hazir degilse (dokunustan once, ag, cozme hatasi) ayni
 * yol sentez sesine dusuyor. Arayuz ve odul sesleri Web Audio sentezi.
 * Uyari tonlarinin eskiden GameScene'de tuttugu tek baglam artik burada: iOS
 * ses baglamini yalnizca gercek bir dokunusla aciyor ve birden fazla baglam
 * sessizlikle bitiyor.
 *
 * Kanal ayrimi:
 * - Efektler: bu dosyanin sentez sesleri, kendi kaydiricisi var.
 *   - Vurus sesleri (hit-sounds.ts) efekt kanalinin icinde kendi seviyesiyle:
 *     "Vurus sesleri" kaydiricisi Efektler'in altinda carpan.
 * - Seslendirme: seri klipleri ve uyari tonlari; uyari burada caliniyor ama
 *   seviyesini cagiran veriyor, efekt kanalina girmiyor.
 */

/** Tek tonun tarifi: dalga, perde (istege bagli kayma), baslangic, sure, seviye. */
type Tone = { wave: OscillatorType; from: number; to?: number; at: number; dur: number; gain: number };

type Voice = { endsAt: number; gain: GainNode; sources: AudioScheduledSourceNode[] };

/**
 * Vurus sesinin yuvasi. Yuvalar sabit ve diziler yeniden kullaniliyor:
 * vurus basina yalnizca ses dugumlerinin kendisi uretiliyor. Biten sesin
 * dugumleri ornek bitince (`onEnded`, yuva basina bir kez kurulan tek
 * kapanis) ya da bir sonraki vurusta ayriliyor.
 */
type HitVoiceHandle = {
  endsAt: number;
  gain?: GainNode;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  onEnded: () => void;
};

/**
 * Odul seslerinden ornekli olanlar ve varsayilan aileleri. Oldurme ayri:
 * sesini cagiran dusmandan seciyor (`emit`in ucuncu argumani, `KillSoundCue`).
 */
const SFX_SAMPLE_FAMILY: Partial<Record<FeedbackKind, SfxSampleFamily>> = {
  crit: "crit"
};

/** Oldurmenin sesi bilinmiyorsa (onizleme, eski cagiran): meka, hafif. */
const DEFAULT_KILL_CUE = getKillSoundCue("grunt", "meka");

/** Bir sesin cozulmus hali: ornekli aile, oldurmede olum sesi, butce suresi. */
type ResolvedSound = { family?: SfxSampleFamily; voice?: KillVoiceFamily; loading: boolean; soundMs?: number };

/** Paylasilan beyaz gurultu tamponunun uzunlugu (sn); vuruslar farkli yerinden baslar. */
const HIT_NOISE_SECONDS = 1;
/** Kaldirilan vurus sesinin sonme suresi (sn); aniden kesilen ses tik yapar. */
const HIT_STEAL_FADE_SECONDS = 0.025;
/** Kaydirici onizlemesinin en kisa araligi (ms): surukleme saniyede ~14 deger yolluyor. */
export const HIT_PREVIEW_GAP_MS = 250;

/** Takim arkadasinin sesi: duyulsun ama seninkinin ustune binmesin. */
const TEAMMATE_SFX_GAIN = 0.35;
/** Uyari tonunun suresi. Kisa: uyari, muzik degil. */
const ALERT_TONE_SECONDS = 0.24;
/**
 * Kamera sarsintisinin Phaser yogunlugu olarak ust siniri (kamera genisliginin
 * orani). Yonetmenin px siniri ve 400 ms araligi ustune biniyor; Melis serisinin
 * eski 0.022'lik sarsintisi dahil hicbir sarsinti bunu asamiyor.
 */
export const MAX_SHAKE_INTENSITY = 0.004;
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
 * camura donuyor. Sik gelenler (oldurme, kritik) en kisik ve en kisa;
 * seyrek olanlar (kademe, dalga temizleme) daha dolgun. `r` perde carpani;
 * yalnizca gelisim onayi kullaniyor (kademesi).
 *
 * Savasta sik calanlar muzikal degil: notalar, arpejler ve kombo ile
 * tirmanan perde yok. Oldurme ve kritik once ornek (bkz. SFX_SAMPLE_FAMILY);
 * buradaki tarifleri yalnizca ornek yokken caliyor. Altin oldurme basina
 * ses cikarmiyor (yalnizca "+N" sayisi ve HUD sayaci): her oldurmede ikinci
 * bir tini savas sesini maskeliyordu.
 */
const SFX_RECIPES: Partial<Record<FeedbackKind, (r: number) => Tone[]>> = {
  // Ornek yokken: kisa, kuru, inen bir "tok". Perde kombodan bagimsiz.
  kill: () => [
    { wave: "square", from: 320, to: 90, at: 0, dur: 0.07, gain: 0.05 },
    { wave: "sine", from: 180, to: 55, at: 0, dur: 0.12, gain: 0.18 },
    { wave: "sawtooth", from: 1400, to: 300, at: 0, dur: 0.04, gain: 0.025 }
  ],
  crit: () => [
    { wave: "square", from: 2600, to: 1400, at: 0, dur: 0.035, gain: 0.045 },
    { wave: "triangle", from: 1200, to: 900, at: 0.005, dur: 0.06, gain: 0.08 }
  ],
  // Seviye: kisa bir servo kalkisi -- kayan, nota degil.
  level: () => [
    { wave: "square", from: 240, to: 620, at: 0, dur: 0.12, gain: 0.035 },
    { wave: "sine", from: 160, to: 420, at: 0, dur: 0.14, gain: 0.09 }
  ],
  // Kademe: guc dalgalanmasi -- yukari kayan bir govde, kuru bir role tiki ve
  // altta bas. Akor yok.
  tier: () => [
    { wave: "sawtooth", from: 110, to: 520, at: 0, dur: 0.32, gain: 0.04 },
    { wave: "square", from: 1800, to: 900, at: 0, dur: 0.03, gain: 0.035 },
    { wave: "triangle", from: 300, to: 760, at: 0.05, dur: 0.3, gain: 0.06 },
    { wave: "sine", from: NOTE.C3, to: 70, at: 0, dur: 0.5, gain: 0.24 }
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
  },
  // Kosu raporu. Zafer: yukselen C-E-G-C ve altta tok bir bas; dalga
  // akorundan (hepsi ayni anda) ayri okunsun diye notalar arka arkaya.
  reportWin: () => [
    { wave: "sine", from: NOTE.C3, to: 110, at: 0, dur: 0.7, gain: 0.2 },
    { wave: "triangle", from: NOTE.C5, at: 0, dur: 0.18, gain: 0.09 },
    { wave: "triangle", from: NOTE.E5, at: 0.11, dur: 0.18, gain: 0.09 },
    { wave: "triangle", from: NOTE.G5, at: 0.22, dur: 0.2, gain: 0.09 },
    { wave: "triangle", from: NOTE.C6, at: 0.33, dur: 0.7, gain: 0.08 },
    { wave: "sine", from: NOTE.E6, at: 0.33, dur: 0.6, gain: 0.03 }
  ],
  // Yenilgi: inen iki yumusak nota, sonunda kok nota. Ceza gibi degil:
  // rapor yenilgiyi de ilerleme olarak anlatiyor, ses kapiyi carpmamali.
  reportLoss: () => [
    { wave: "sine", from: NOTE.G5, at: 0, dur: 0.26, gain: 0.08 },
    { wave: "sine", from: NOTE.E5, at: 0.2, dur: 0.3, gain: 0.08 },
    { wave: "triangle", from: NOTE.C5, at: 0.42, dur: 0.46, gain: 0.07 },
    { wave: "sine", from: NOTE.C3, at: 0.42, dur: 0.46, gain: 0.12 }
  ],
  // Rekor rozeti: kisa, parlak iki nota (G6-C7). Nadir kart tinisindan
  // (uc nota, uzun kuyruk) kisa; ikisi karismasin.
  reportRecord: () => [
    { wave: "sine", from: NOTE.G6, at: 0, dur: 0.12, gain: 0.06 },
    { wave: "sine", from: NOTE.C7, at: 0.08, dur: 0.34, gain: 0.07 },
    { wave: "triangle", from: NOTE.C6, at: 0.08, dur: 0.3, gain: 0.03 }
  ],
  // Sessiz Mod: asagi kayan yumusak bir "sus" ve altta kisa bir bas. Uyari
  // tonu degil -- kuleler bilerek susuyor; takim arkadasinda kisik caliyor.
  silentMode: () => [
    { wave: "sine", from: NOTE.E5, to: NOTE.C4, at: 0, dur: 0.36, gain: 0.07 },
    { wave: "triangle", from: NOTE.A5, to: NOTE.E5, at: 0.02, dur: 0.22, gain: 0.03 },
    { wave: "sine", from: 140, to: 70, at: 0, dur: 0.3, gain: 0.14 }
  ],
  // Kulene bag kuruldu: iki kisa dijital tik (kod), sonra baglanti notasi.
  linkJoined: () => [
    { wave: "square", from: 1800, to: 1500, at: 0, dur: 0.02, gain: 0.03 },
    { wave: "square", from: 2200, to: 1800, at: 0.05, dur: 0.02, gain: 0.03 },
    { wave: "sine", from: NOTE.G5, at: 0.09, dur: 0.2, gain: 0.07 }
  ],
  // Bag olgunlasti: baglanti notasinin devami, yukselen uclu (G5-C6-E6).
  linkMatured: () => [
    { wave: "triangle", from: NOTE.G5, at: 0, dur: 0.12, gain: 0.07 },
    { wave: "triangle", from: NOTE.C6, at: 0.08, dur: 0.12, gain: 0.07 },
    { wave: "sine", from: NOTE.E6, at: 0.16, dur: 0.22, gain: 0.07 }
  ]
};

/**
 * Odul ve arayuz seslerinin tarif adlari ve tonlari (adim 0). Vurus
 * seslerinin bunlardan ayri durdugunu soyleyen test icin.
 */
export function getFeedbackSfxTones(): Array<{ kind: FeedbackKind; tones: Tone[] }> {
  return (Object.keys(SFX_RECIPES) as FeedbackKind[]).map((kind) => ({ kind, tones: SFX_RECIPES[kind]!(1) }));
}

export type FeedbackDirectorOptions = {
  sfxVolume: number;
  /**
   * Vurus seslerinin seviyesi (0-1), Efektler'in ustune carpan. 0 ise
   * vurus icin hicbir ses dugumu kurulmuyor. Verilmezse 0.5.
   */
  hitVolume?: number;
  vibration: boolean;
  /** Sarsilacak kamera; sahne kurulmadan once yok olabilir. */
  getCamera: () => Phaser.Cameras.Scene2D.Camera | undefined;
  /**
   * Ornek dosyalarini getiren islev; verilmezse `fetch`. Testler sahte bir
   * yukleyici veriyor. Hata firlatirsa o ornek yok sayilir, ses sentezle.
   */
  loadSample?: SampleLoader;
};

export class FeedbackDirector {
  private readonly governor: FeedbackGovernor;
  private readonly getCamera: () => Phaser.Cameras.Scene2D.Camera | undefined;
  private context?: AudioContext;
  private sfxBus?: GainNode;
  private voices: Voice[] = [];
  private sfxVolume: number;
  private hitVolume: number;
  private hitBus?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private readonly hitGovernor = new HitSoundGovernor();
  private readonly hitSlots: HitVoiceHandle[] = [];
  /** Kaldirilan (sonen) vurus seslerinin dugumleri; ayrilmayi bekliyor. */
  private readonly hitGraveyard: HitVoiceHandle[] = [];
  private graveCursor = 0;
  /** Onizlemenin kendi yuvasi: oyunun vurus butcesinden ayri. */
  private readonly previewHandle: HitVoiceHandle = this.createHitHandle();
  private lastPreviewAt = Number.NEGATIVE_INFINITY;
  private lastSfxPreviewAt = Number.NEGATIVE_INFINITY;
  /** Kayitli savas sesleri; baglam acilinca bir kez yukleniyor. */
  private readonly samples: SampleBank;
  private samplesLoad?: Promise<void>;
  /** Oldurme/kritik orneklerinin sira numarasi: hiz kaymasinin tohumu. */
  private sfxSampleSerial = 0;
  /** Son `resume` istegi; bekleyen ses yalnizca bunun hemen ardindan tutuluyor. */
  private resumeRequestedAt?: number;
  /**
   * Baglam acilirken istenen tek ses. Tek yuva: acildigi an bir yigin ses
   * birden calmasin (emit'in "acilinca patlama yok" kurali).
   */
  private pendingSfx?: { kind: FeedbackKind; step: number; own: boolean; sample?: SfxSampleFamily | KillSoundCue; key?: string; at: number };
  /** Olum sesinin seyrekligi (kalabalik dalgada koro olmasin). */
  private readonly killVoices = new KillVoiceGate();
  /** Ses cozumunun yeniden kullanilan sonucu: olay basina nesne yok. */
  private readonly resolved: ResolvedSound = { loading: false };
  private motionQuery?: MediaQueryList;
  private readonly handleMotionChange = (event: MediaQueryListEvent) => {
    this.governor.setReducedMotion(event.matches);
  };

  constructor(options: FeedbackDirectorOptions) {
    this.sfxVolume = clampVolume(options.sfxVolume);
    this.hitVolume = clampVolume(options.hitVolume ?? 0.5);
    this.samples = options.loadSample ? new SampleBank(options.loadSample) : new SampleBank();
    // Dosyalar simdiden iniyor (dokunus gerekmez); ilk dokunusta yalnizca cozme kaliyor.
    this.samples.prefetch();
    for (let index = 0; index < this.hitGovernor.capacity; index += 1) {
      this.hitSlots.push(this.createHitHandle());
      this.hitGraveyard.push(this.createHitHandle());
    }
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
   *
   * `sample` ornekli seslerin ailesi; oldurmede dusmanin sesi
   * (`getKillSoundCue`: govde, irkin olum sesi), `key` olayin kimligi (olum
   * sesinin seyrekligi bundan, FNV). Verilmezse turun varsayilani. Ornekli
   * ses butcede gercek suresiyle tutuluyor; ornek henuz cozuluyorsa ses yok
   * (gorsel yine karar aliyor).
   */
  emit(kind: FeedbackKind, input: FeedbackInput, sample?: SfxSampleFamily | KillSoundCue, key?: string): FeedbackDecision {
    const now = performance.now();
    const sound = this.resolveSound(kind, sample, Boolean(input.own), key, now, false);
    const audible = !input.silent && this.isSfxReady(kind) && !sound.loading;
    const decision = this.governor.decide(kind, { ...input, silent: !audible, soundMs: sound.soundMs }, now);
    if (decision.sound) {
      this.synthesize(kind, decision.step, decision.own, decision.stealVoice, sound, now);
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
  playSfx(kind: FeedbackKind, options: { step?: number; own?: boolean; sample?: SfxSampleFamily | KillSoundCue; key?: string } = {}) {
    if (!this.isSfxReady(kind)) {
      this.holdPendingSfx(kind, options);
      return false;
    }
    const own = options.own ?? true;
    const now = performance.now();
    const sound = this.resolveSound(kind, options.sample, own, options.key, now, false);
    if (sound.loading) {
      return false;
    }
    const admitted = this.governor.admitSound(kind, own, now, sound.soundMs);
    if (!admitted.play) {
      return false;
    }
    return this.synthesize(kind, options.step ?? 0, own, admitted.steal, sound, now);
  }

  /**
   * Sesin ornekli hali. Oldurmede govde her zaman; olum sesi yalnizca
   * `KillVoiceGate` izin verirse (ya da `forceVoice`: galeri). Takim
   * arkadasinin oldurmesinde ses hep kisa (hafif) cesit. Butce suresi
   * calacak en uzun katman.
   */
  private resolveSound(kind: FeedbackKind, sample: SfxSampleFamily | KillSoundCue | undefined, own: boolean, key: string | undefined, now: number, forceVoice: boolean): ResolvedSound {
    const result = this.resolved;
    result.family = undefined;
    result.voice = undefined;
    result.soundMs = undefined;
    result.loading = false;
    const cue = typeof sample === "object" ? sample : kind === "kill" && sample === undefined ? DEFAULT_KILL_CUE : undefined;
    if (cue) {
      result.family = cue.body;
      if (this.samples.isLoading(cue.body)) {
        result.loading = true;
        return result;
      }
      if (!this.samples.has(cue.body)) {
        return result;
      }
      const voice = own || cue.champion ? cue.voice : cue.teammateVoice;
      let seconds = this.samples.duration(cue.body);
      if (this.samples.has(voice) && (forceVoice || this.killVoices.check(own, cue, key, now))) {
        result.voice = voice;
        seconds = Math.max(seconds, this.samples.duration(voice));
      }
      result.soundMs = (seconds / (1 - SAMPLE_RATE_SPREAD)) * 1000;
      return result;
    }
    const family = (typeof sample === "string" ? sample : undefined) ?? SFX_SAMPLE_FAMILY[kind];
    result.family = family;
    result.loading = family !== undefined && this.samples.isLoading(family);
    result.soundMs = family !== undefined && this.samples.has(family)
      ? (this.samples.duration(family) / (1 - SAMPLE_RATE_SPREAD)) * 1000
      : undefined;
    return result;
  }

  /**
   * Efektler kaydiricisinin onizlemesi: hafif bir oldurme sesi, en fazla
   * `HIT_PREVIEW_GAP_MS`'de bir (surukleme saniyede ~14 deger yolluyor).
   * `playSfx` yolundan: butce gecerli ve baglam bu dokunusta aciliyorsa ses
   * kisa bir an tutulup acilinca caliyor.
   */
  previewSfx() {
    const at = performance.now();
    if (at - this.lastSfxPreviewAt < HIT_PREVIEW_GAP_MS) {
      return false;
    }
    this.lastSfxPreviewAt = at;
    return this.playSfx("kill", { own: true, sample: DEFAULT_KILL_CUE });
  }

  /**
   * Galerinin oldurme sesi dinlemesi: govde ve olum sesi birlikte (ses
   * seyreltilmiyor). Oyunun butcesinin disinda, vurus onizlemesiyle ayni
   * aralik ve kurallar (seviye 0, kapali baglam, gizli sekme: dugum yok).
   */
  previewKill(cue: KillSoundCue = DEFAULT_KILL_CUE, own = true) {
    if (this.sfxVolume <= 0) {
      return false;
    }
    const context = this.context;
    if (!context || context.state !== "running") {
      return false;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return false;
    }
    const at = performance.now();
    const sound = this.resolveSound("kill", cue, own, undefined, at, true);
    if (sound.loading) {
      return false;
    }
    if (at - this.lastPreviewAt < HIT_PREVIEW_GAP_MS) {
      return false;
    }
    this.lastPreviewAt = at;
    return this.synthesize("kill", 0, own, false, sound, at);
  }

  /**
   * Orneklerin yuklenmesi bittiginde (basarili ya da degil) cozulen soz.
   * Yukleme baslamadiysa hemen cozuluyor. Oyun beklemiyor; testler ve tani.
   */
  whenSamplesLoaded(): Promise<void> {
    return this.samplesLoad ?? Promise.resolve();
  }

  /** Ailenin ornegi hazir mi (tani ve galeri). */
  hasSample(family: Parameters<SampleBank["has"]>[0]) {
    return this.samples.has(family);
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

  /** "Vurus sesleri" kaydiricisi; Efektler'in ustune carpan. */
  setHitVolume(value: number) {
    this.hitVolume = clampVolume(value);
    if (this.context && this.hitBus) {
      this.hitBus.gain.setTargetAtTime(this.hitVolume, this.context.currentTime, 0.015);
    }
  }

  /**
   * Tek vurus sesi: carpmanin cizildigi anda cagriliyor.
   *
   * `voice` vurus turu ya da siluet sesi (`resolveHitVoice`), `tier` kulenin
   * gorsel kademesi (1-3), `key` olayin kimligi (perde kaymasinin tohumu),
   * `tick` surekli isinin nabzi ya da sizinti tiki (150 ms'de bir birlesir).
   *
   * Hicbir sey kurmadan donuyor: seviye 0, baglam acik degil (ilk dokunustan
   * once ya da askida -- vuruslar kuyruga girmiyor), sekme gizli. Butceyi
   * `HitSoundGovernor` tutuyor; dolu butcede takim arkadasinin sesi kisilip
   * yer aciliyor ya da gelen ses dusuyor.
   */
  playHit(voice: HitVoiceId, tier: number | undefined, own: boolean, key?: string, tick = false) {
    if (this.hitVolume <= 0 || this.sfxVolume <= 0) {
      return false;
    }
    const context = this.context;
    if (!context || context.state !== "running") {
      return false;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return false;
    }
    let duration: number;
    if (this.samples.has(voice)) {
      // Butce ornegin gercek suresiyle: en yavas hizda en uzun cesit. Sv 10
      // govdesi ayni yuvayi paylasiyor; ikisinden uzun olani sayiliyor.
      const shape = getSampleTier(tier);
      let seconds = this.samples.duration(voice);
      if (shape.heft && this.samples.has("heft")) seconds = Math.max(seconds, this.samples.duration("heft"));
      duration = seconds / (shape.rate * (1 - SAMPLE_RATE_SPREAD));
    } else if (this.samples.isLoading(voice)) {
      // Ornek cozuluyor: sentez yerine kisa bir an sessizlik.
      return false;
    } else {
      if (getHitVoiceRecipe(voice, tier).length === 0) {
        return false;
      }
      duration = getHitVoiceDuration(voice, tier);
    }
    const slot = this.hitGovernor.admit(voice, own, tick, duration * 1000 + HIT_SOUND_LIMITS.tailMs, performance.now());
    if (slot < 0) {
      return false;
    }

    const now = context.currentTime;
    this.sweepHitVoices(now);
    this.synthesizeHit(context, this.hitSlots[slot], voice, tier, own, key, this.hitGovernor.stole);
    return true;
  }

  /**
   * Kaydirici onizlemesi: oyunun vurus butcesinin disinda, kendi yuvasinda.
   *
   * Savasin ortasinda butce dolu olsa da duyuluyor; surukleme saniyede onlarca
   * deger yolladigi icin en fazla `HIT_PREVIEW_GAP_MS`'de bir. Seviye, baglam
   * ve sekme kurallari ayni: seviye 0 ise dugum yok.
   */
  previewHit(voice: HitVoiceId = "projectile", tier = 1, own = true) {
    if (this.hitVolume <= 0 || this.sfxVolume <= 0) {
      return false;
    }
    const context = this.context;
    if (!context || context.state !== "running") {
      return false;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return false;
    }
    if (!this.samples.has(voice) && this.samples.isLoading(voice)) {
      return false;
    }
    const at = performance.now();
    if (at - this.lastPreviewAt < HIT_PREVIEW_GAP_MS) {
      return false;
    }
    this.lastPreviewAt = at;
    this.sweepHitVoices(context.currentTime);
    this.synthesizeHit(context, this.previewHandle, voice, tier, own, undefined, false);
    return true;
  }

  /**
   * Yuvaya bir vurus sesi kur. Yuvadaki eski ses hala caliyorsa (butceden
   * calindi ya da iki saat ayristi: yonetmen `performance.now`, ses baglamin
   * saati; iOS askidan donunce ayrisiyor) once sonduruluyor -- kesilen ses tik
   * yapar. Bitmisse dugumleri hemen ayriliyor.
   */
  private synthesizeHit(context: AudioContext, handle: HitVoiceHandle, voice: HitVoiceId, tier: number | undefined, own: boolean, key: string | undefined, stole: boolean) {
    const now = context.currentTime;
    if (handle.gain) {
      if (stole || handle.endsAt > now) {
        this.retireHitVoice(handle, now);
      } else {
        this.releaseHitVoice(handle);
      }
    }

    const buffer = this.samples.pick(voice, key);
    if (buffer) {
      return this.playHitSample(context, handle, voice, buffer, tier, own, key, now);
    }

    const recipe = getHitVoiceRecipe(voice, tier);
    const ratio = getHitPitchRatio(key);
    const noiseOffset = key ? fnvUnit(key, 0x9e) * (HIT_NOISE_SECONDS - 0.3) : 0;
    const voiceGain = context.createGain();
    voiceGain.gain.value = own ? 1 : HIT_SOUND_LIMITS.teammateGain;
    voiceGain.connect(this.getHitBus(context));
    handle.gain = voiceGain;
    let endsAt = now;
    for (const layer of recipe) {
      const start = now + layer.at;
      const stop = start + layer.dur;
      const attack = Math.min(layer.attack ?? 0.002, layer.dur * 0.4);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(layer.gain, start + attack);
      envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
      envelope.connect(voiceGain);
      let source: AudioScheduledSourceNode;
      if (layer.type === "osc") {
        const oscillator = context.createOscillator();
        oscillator.type = layer.wave;
        oscillator.frequency.setValueAtTime(layer.from * ratio, start);
        if (layer.to !== undefined) {
          oscillator.frequency.exponentialRampToValueAtTime(layer.to * ratio, start + layer.dur * 0.85);
        }
        oscillator.connect(envelope);
        oscillator.start(start);
        source = oscillator;
      } else {
        const noise = context.createBufferSource();
        noise.buffer = this.getNoiseBuffer(context);
        const filter = context.createBiquadFilter();
        filter.type = layer.filter;
        filter.Q.value = layer.q;
        filter.frequency.setValueAtTime(layer.from * ratio, start);
        if (layer.to !== undefined) {
          filter.frequency.exponentialRampToValueAtTime(layer.to * ratio, start + layer.dur * 0.85);
        }
        noise.connect(filter).connect(envelope);
        noise.start(start, noiseOffset);
        handle.nodes.push(filter);
        source = noise;
      }
      source.stop(stop + 0.01);
      handle.nodes.push(envelope, source);
      handle.sources.push(source);
      endsAt = Math.max(endsAt, stop + 0.01);
    }
    handle.endsAt = endsAt;
    return true;
  }

  /**
   * Ornekli vurus: bir AudioBufferSourceNode ve sesin kazanc dugumu; sv 10'da
   * ayni kazanca bagli ikinci bir kaynak (govde). Govde ayni yuvayi
   * paylasiyor; yuvanin bitisi ikisinden uzun olaninki (`playHit` butceyi de
   * oyle tutuyor), yani yuva yeniden kullanilinca govdenin kuyrugu kesilmiyor. Seviye aile x kademe x
   * (takim arkadasi kisik); hiz olay kimliginden +-4%, kademede biraz yavas.
   * Ornekler zaten sonumlu kesildi, zarf dugumu yok.
   */
  private playHitSample(context: AudioContext, handle: HitVoiceHandle, voice: HitVoiceId, buffer: AudioBuffer, tier: number | undefined, own: boolean, key: string | undefined, now: number) {
    const shape = getSampleTier(tier);
    const rate = getSampleRateJitter(key) * shape.rate;
    const voiceGain = context.createGain();
    voiceGain.gain.value = SAMPLE_FAMILIES[voice].gain * shape.gain * (own ? 1 : HIT_SOUND_LIMITS.teammateGain);
    voiceGain.connect(this.getHitBus(context));
    handle.gain = voiceGain;
    let endsAt = now + this.startHitSource(context, handle, buffer, rate, voiceGain, now);
    if (shape.heft) {
      const heft = this.samples.pick("heft", key);
      if (heft) endsAt = Math.max(endsAt, now + this.startHitSource(context, handle, heft, rate, voiceGain, now));
    }
    handle.endsAt = endsAt;
    return true;
  }

  private startHitSource(context: AudioContext, handle: HitVoiceHandle, buffer: AudioBuffer, rate: number, target: AudioNode, at: number) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(target);
    source.onended = handle.onEnded;
    // Bastaki kodlayici dolgusu atlaniyor: vurus cizimle ayni anda.
    const lead = this.samples.lead(buffer);
    source.start(at, lead);
    handle.nodes.push(source);
    handle.sources.push(source);
    return (buffer.duration - lead) / rate;
  }

  /**
   * Vurus yuvasi. Bitis kapanisi yuva basina bir kez kuruluyor: ornek
   * bitince yuvanin sesi hala o sesse (yuva yeniden kullanilmadiysa)
   * dugumler ayriliyor. Yuva bu arada baska sese gectiyse dokunmuyor.
   */
  private createHitHandle(): HitVoiceHandle {
    const handle: HitVoiceHandle = { endsAt: 0, nodes: [], sources: [], onEnded: () => undefined };
    handle.onEnded = () => {
      const now = this.context?.currentTime;
      if (handle.gain && now !== undefined && handle.endsAt <= now + 0.02) {
        this.releaseHitVoice(handle);
      }
    };
    return handle;
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
      hitVoices: this.hitGovernor.activeVoices(now),
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
    // Cozme askidaki baglamda da calisiyor: kilit acilmasini beklemeden.
    this.loadSamples();
    if (context?.state === "running") {
      return;
    }
    // iOS arama ya da alarm sonrasi baglami "interrupted" birakabiliyor; o da
    // ayni sekilde surduruluyor.
    if (context && context.state !== "closed") {
      this.resumeRequestedAt = performance.now();
      // `resume` durumu hemen degistirmiyor; ayni dokunusta istenen ses
      // (ulti bas vurusu) baglam acilinca yetissin.
      void context.resume().then(() => this.flushPendingSfx()).catch(() => undefined);
    }
  }

  /**
   * Hazir olmayan ornekleri coz (onceden inmis veriden). Her acilista
   * cagriliyor: cozulmekte ya da hazir olan dosyaya dokunulmuyor, gelmeyen
   * dosya yeniden deneniyor (en fazla 3 kez). Hata oyunu durdurmuyor; o ses
   * sentezle caliyor.
   */
  private loadSamples() {
    const context = this.context;
    if (!context || context.state === "closed") {
      return;
    }
    let job: Promise<void>;
    try {
      job = this.samples.load(context).catch(() => undefined);
    } catch {
      job = Promise.resolve();
    }
    const previous = this.samplesLoad;
    this.samplesLoad = previous ? Promise.all([previous, job]).then(() => undefined) : job;
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
    this.killVoices.reset();
    this.voices = [];
    for (const handle of this.hitSlots) this.releaseHitVoice(handle);
    for (const handle of this.hitGraveyard) this.releaseHitVoice(handle);
    this.releaseHitVoice(this.previewHandle);
    this.hitGovernor.reset();
    this.hitBus = undefined;
    this.noiseBuffer = undefined;
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
   * Efekt sesinin cikis yolu: ses seviyesi, sikistirici, sonra sinirlayici.
   *
   * Sikistirici ust uste binen seslerin (vuruslar + oldurme + kritik)
   * yogunlugunu topluyor; sinirlayici (-3 dBFS, 20:1, 1 ms) kalabalik bir
   * dalgada tepenin telefon hoparlorunu kirpmasini engelliyor. Butce 6+6
   * sesle sinirli ama tepe yine de toplaniyor.
   */
  private getSfxBus(context: AudioContext) {
    if (!this.sfxBus) {
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      limiter.connect(context.destination);
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.12;
      compressor.connect(limiter);
      const bus = context.createGain();
      bus.gain.value = this.sfxVolume;
      bus.connect(compressor);
      this.sfxBus = bus;
    }
    return this.sfxBus;
  }

  /** Vurus seslerinin kanali: kendi seviyesi, sonra Efektler ve sikistirici. */
  private getHitBus(context: AudioContext) {
    if (!this.hitBus) {
      const bus = context.createGain();
      bus.gain.value = this.hitVolume;
      bus.connect(this.getSfxBus(context));
      this.hitBus = bus;
    }
    return this.hitBus;
  }

  /**
   * Paylasilan beyaz gurultu: baglam basina bir kez, bir saniye.
   *
   * `Math.random` yok: sabit tohumlu xorshift. Her vurus tamponun farkli bir
   * yerinden basliyor (olay kimliginden), tampon yine tek.
   */
  private getNoiseBuffer(context: AudioContext) {
    if (!this.noiseBuffer) {
      const length = Math.max(1, Math.floor(context.sampleRate * HIT_NOISE_SECONDS));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      let state = 0x9e3779b9;
      for (let index = 0; index < length; index += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        data[index] = ((state >>> 0) / 4294967296) * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  /** Biten vurus seslerinin dugumlerini ayir; grafikte asili kalmasinlar. */
  private sweepHitVoices(now: number) {
    for (const handle of this.hitSlots) {
      if (handle.gain && handle.endsAt <= now) this.releaseHitVoice(handle);
    }
    for (const handle of this.hitGraveyard) {
      if (handle.gain && handle.endsAt <= now) this.releaseHitVoice(handle);
    }
    if (this.previewHandle.gain && this.previewHandle.endsAt <= now) this.releaseHitVoice(this.previewHandle);
  }

  /**
   * Yuvasi alinan (takim arkadasinin) sesi kis ve durdur. Dugumleri mezarliga
   * tasiniyor: sonme bitince bir sonraki vurusta ayriliyor.
   */
  private retireHitVoice(handle: HitVoiceHandle, now: number) {
    const gain = handle.gain;
    if (!gain) return;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + HIT_STEAL_FADE_SECONDS);
    for (const source of handle.sources) {
      try {
        source.stop(now + HIT_STEAL_FADE_SECONDS + 0.01);
      } catch {
        // Zaten durmus kaynak ikinci kez durdurulamiyor; zarari yok.
      }
    }
    const grave = this.hitGraveyard[this.graveCursor];
    this.graveCursor = (this.graveCursor + 1) % this.hitGraveyard.length;
    this.releaseHitVoice(grave);
    grave.gain = gain;
    grave.endsAt = now + HIT_STEAL_FADE_SECONDS + 0.02;
    for (const node of handle.nodes) grave.nodes.push(node);
    for (const source of handle.sources) grave.sources.push(source);
    handle.gain = undefined;
    handle.nodes.length = 0;
    handle.sources.length = 0;
  }

  private releaseHitVoice(handle: HitVoiceHandle) {
    if (!handle.gain) return;
    for (const node of handle.nodes) {
      try {
        node.disconnect();
      } catch {
        // Ayrilmis dugum; zarari yok.
      }
    }
    try {
      handle.gain.disconnect();
    } catch {
      // Ayni.
    }
    handle.gain = undefined;
    handle.nodes.length = 0;
    handle.sources.length = 0;
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
  private holdPendingSfx(kind: FeedbackKind, options: { step?: number; own?: boolean; sample?: SfxSampleFamily | KillSoundCue; key?: string }) {
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
    this.pendingSfx = { kind, step: options.step ?? 0, own: options.own ?? true, sample: options.sample, key: options.key, at: now };
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
      this.playSfx(pending.kind, { step: pending.step, own: pending.own, sample: pending.sample, key: pending.key });
    }
  }

  /**
   * Odul sesi: ornegi varsa ornek, yoksa sentez tarifi. Oldurmede perde
   * kombodan bagimsiz; kombo yalnizca seviyeyi biraz artiriyor.
   */
  private synthesize(kind: FeedbackKind, step: number, own: boolean, steal: boolean, sound: ResolvedSound, at: number) {
    const context = this.context;
    if (!context || sound.loading) {
      return false;
    }

    const now = context.currentTime;
    this.voices = this.voices.filter((voice) => voice.endsAt > now);
    if (steal) {
      this.fadeOutOldestVoice(context);
    }

    const family = sound.family;
    const buffer = family ? this.samples.pick(family, undefined) : undefined;
    if (family && buffer) {
      this.playSfxSample(context, kind, family, buffer, step, own, now);
      // Oldurmenin olum sesi govdenin ustune, ayni anda.
      const voice = sound.voice ? this.samples.pick(sound.voice, undefined) : undefined;
      if (sound.voice && voice) {
        this.playSfxSample(context, kind, sound.voice, voice, step, own, now);
        this.killVoices.commit(own, at);
      }
      return true;
    }

    const recipe = SFX_RECIPES[kind];
    if (!recipe) {
      return false;
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

  /**
   * Ornekli odul sesi (oldurme katmani, kritik): Efektler kanalina bir kaynak ve bir
   * kazanc dugumu; ornek bitince ikisi de ayriliyor. Hiz sira numarasindan
   * +-4% kayiyor (perde basamagi degil); oldurmede kombo seviyeyi en fazla
   * %16 artiriyor.
   */
  private playSfxSample(context: AudioContext, kind: FeedbackKind, family: SfxSampleFamily, buffer: AudioBuffer, step: number, own: boolean, now: number) {
    const rate = getSampleRateJitter(`${family}#${this.sfxSampleSerial}`);
    this.sfxSampleSerial = (this.sfxSampleSerial + 1) % 65536;
    const voiceGain = context.createGain();
    voiceGain.gain.value = SAMPLE_FAMILIES[family].gain
      * (own ? 1 : TEAMMATE_SFX_GAIN)
      * (kind === "kill" && own ? getKillComboGain(step) : 1);
    voiceGain.connect(this.getSfxBus(context));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(voiceGain);
    source.onended = () => {
      source.disconnect();
      voiceGain.disconnect();
    };
    const lead = this.samples.lead(buffer);
    source.start(now, lead);
    this.voices.push({ endsAt: now + (buffer.duration - lead) / rate, gain: voiceGain, sources: [source] });
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
    // Ust sinir ekranin binde dordu: 375 px'lik telefonda ~1.5 css pikseli.
    // Px siniri genis ekranda da ayni hissi verirken dar ekranda sarsintiyi
    // oransal olarak buyutuyordu; ikisinden kucuk olan geciyor.
    const intensity = Math.min(MAX_SHAKE_INTENSITY, (px * canvasPerCss) / Math.max(1, camera.width * zoom * zoom));
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
