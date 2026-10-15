/**
 * ATLAS: telsizden konusan yapay zeka komutan (sakin, guven veren, kuru mizah).
 *
 * Tek yonetmen. Oyun olaylari (`welcome`, `waveStarted`, `nexusHealth`...)
 * buraya geliyor; hangi satirin, ne zaman calacagina burasi karar veriyor.
 * Mantik saf: saat, rastgelelik ve ses arka ucu disaridan veriliyor, testler
 * sahte saatle ve sahte sesle suruyor. Tarayici arka ucu (Web Audio, tembel
 * yukleme) asagida `createAtlasWebAudio`.
 *
 * Kurallar (sahibin karari):
 * - Ayni anda tek satir. Calan satir varken yeni olay gelirse oncelik
 *   bakiliyor: yuksek olan dusugu ~120 ms'lik bir solmayla kesiyor; degilse
 *   yeni olay dusuyor. Yalnizca yenilgi/zafer beklemeye giriyor ve calan
 *   satir bitince caliyor.
 * - Bekleme sureleri yalnizca satir gercekten caldiginda isliyor.
 * - Kategori icinde torba: ayni dosya ust uste gelmiyor.
 * - Rastgelelik istemcide (ses kozmetik, her istemci kendi karar veriyor).
 * - Herkes ayni Turkce satirlari duyuyor; arayuz dili fark etmiyor.
 */
import { assetUrl } from "./asset-url";

export type AtlasCategory =
  | "welcome"
  | "wave-start"
  | "wave-clear"
  | "nexus-damage-lvl1"
  | "nexus-damage-lvl2"
  | "nexus-damage-lvl3"
  | "tower-destroyed"
  | "praising"
  | "death"
  | "ending";

/**
 * Kategori basina satir sayisi; dosyalar `audio/atlas/<kategori>/<kategori>-NN.mp3`
 * (tools/build-atlas-voice.mjs). tests/atlas-voice.test.mjs manifestle esitligi denetliyor.
 */
export const ATLAS_LINE_COUNTS: Readonly<Record<AtlasCategory, number>> = Object.freeze({
  welcome: 4,
  "wave-start": 7,
  "wave-clear": 7,
  "nexus-damage-lvl1": 5,
  "nexus-damage-lvl2": 5,
  "nexus-damage-lvl3": 5,
  "tower-destroyed": 7,
  praising: 7,
  death: 8,
  ending: 6
});

export const ATLAS_CATEGORIES = Object.freeze(Object.keys(ATLAS_LINE_COUNTS) as AtlasCategory[]);

/** Goreli adres (`public/` altinda); ses arka ucu `assetUrl` ile cozuyor. */
export function getAtlasLineUrls(category: AtlasCategory): string[] {
  const urls: string[] = [];
  for (let index = 1; index <= ATLAS_LINE_COUNTS[category]; index += 1) {
    urls.push(`audio/atlas/${category}/${category}-${String(index).padStart(2, "0")}.mp3`);
  }
  return urls;
}

/**
 * Oncelik: buyuk olan kesiyor. Yenilgi/zafer > nexus 3 > nexus 2 > kule
 * yikildi > nexus 1 > karsilama > dalga basi/sonu > ovgu.
 */
export const ATLAS_PRIORITY: Readonly<Record<AtlasCategory, number>> = Object.freeze({
  death: 7,
  ending: 7,
  "nexus-damage-lvl3": 6,
  "nexus-damage-lvl2": 5,
  "tower-destroyed": 4,
  "nexus-damage-lvl1": 3,
  welcome: 2,
  "wave-start": 1,
  "wave-clear": 1,
  praising: 0
});

export const ATLAS_RULES = Object.freeze({
  /** Iki nexus uyarisi arasi (uc seviye ortak). */
  nexusGapMs: 60_000,
  towerGapMs: 15_000,
  praiseGapMs: 60_000,
  /** Dalga basi ve dalga sonu satirinin calma olasiligi. */
  waveChance: 0.33,
  /** Kesilen satirin solmasi. */
  interruptFadeMs: 120,
  /** Kilit acilmadan gelen karsilama en fazla bu kadar bekliyor. */
  welcomeUnlockWindowMs: 8_000,
  /** Nexus seviye esikleri (vurustan SONRAKI can orani). */
  nexusLevel2At: 0.5,
  nexusLevel3At: 0.2
});

/** ATLAS'in seslendirme kaydiricisina gore kendi seviyesi (%20 kisik). */
export const ATLAS_VOICE_GAIN = 0.8;
/** ATLAS konusurken muzik ve efektlerin carpani (~%35 kisma). */
export const ATLAS_DUCK_GAIN = 0.65;
/** Kismanin rampasi (zaman sabiti, sn): yumusak iniyor ve kalkiyor. */
export const ATLAS_DUCK_TIME_CONSTANT = 0.12;

/** Vurustan sonraki can oranindan seviye: (0.5, 1] -> 1, (0.2, 0.5] -> 2, [0, 0.2] -> 3. */
export function getNexusDamageLevel(ratio: number): 1 | 2 | 3 {
  if (ratio <= ATLAS_RULES.nexusLevel3At) return 3;
  if (ratio <= ATLAS_RULES.nexusLevel2At) return 2;
  return 1;
}

/** Calan satirin tutamaci. */
export type AtlasPlayback = {
  /** Solarak dur; bitince `onEnded` cagriliyor. */
  stop(fadeMs: number): void;
  setVolume(volume: number): void;
};

/** Ses arka ucu. Tarayicida Web Audio; testlerde sahte. */
export type AtlasAudioPort = {
  /** Ses calabilir mi (iOS: ilk dokunustan sonra). Hazir degilse acmayi deneyebilir. */
  isReady(): boolean;
  /** Kilit acildiginda bir kez cagrilacak dinleyici. */
  onReady(listener: () => void): void;
  /** Dosyalari onceden indir (cozme yok). Hata yutuluyor. */
  prefetch(urls: readonly string[]): void;
  /**
   * Satiri cal. Dosya henuz inmediyse inince baslar. Bitince, durdurulunca ya
   * da yuklenemezse `onEnded` bir kez cagriliyor. Baslatilamazsa `undefined`.
   */
  play(url: string, volume: number, onEnded: () => void): AtlasPlayback | undefined;
};

export type AtlasVoiceOptions = {
  audio: AtlasAudioPort;
  /** Milisaniye; varsayilan `performance.now`. */
  now?: () => number;
  /** [0, 1); varsayilan `Math.random`. */
  random?: () => number;
  /** Seslendirme kaydiricisi (seri anonslariyla ayni kanal). */
  getVolume: () => number;
  /** ATLAS konusmaya basladi / sustu: kisma, gosterge, seri anonsu kapisi. */
  onSpeaking?: (speaking: boolean) => void;
  enabled?: boolean;
};

type Current = { category: AtlasCategory; playback: AtlasPlayback; url: string };

/**
 * Torba: kategori basina karistirilmis sira; bitince yeniden karistiriliyor
 * ve yeni turun ilki bir onceki son satir olamiyor.
 */
export class AtlasLineBag {
  private bag: number[] = [];
  private last?: number;

  constructor(private readonly size: number, private readonly random: () => number) {}

  next(): number {
    if (this.size <= 1) return 0;
    if (this.bag.length === 0) {
      const order = Array.from({ length: this.size }, (_, index) => index);
      for (let index = order.length - 1; index > 0; index -= 1) {
        const swap = Math.min(index, Math.floor(this.random() * (index + 1)));
        [order[index], order[swap]] = [order[swap], order[index]];
      }
      // `pop` sondan aliyor: ilk cekilecek eleman son elemandir.
      if (order[order.length - 1] === this.last) {
        [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
      }
      this.bag = order;
    }
    const value = this.bag.pop()!;
    this.last = value;
    return value;
  }
}

export class AtlasVoice {
  private readonly audio: AtlasAudioPort;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly getVolume: () => number;
  private readonly onSpeaking?: (speaking: boolean) => void;
  private readonly bags = new Map<AtlasCategory, AtlasLineBag>();
  private enabled: boolean;
  private current?: Current;
  /** Calan satir bitince calacak yenilgi/zafer. */
  private queuedFinal?: AtlasCategory;
  private speaking = false;
  private matchKey?: string;
  private welcomed = false;
  private over = false;
  private pendingWelcomeAt?: number;
  private lastNexusAt = Number.NEGATIVE_INFINITY;
  private lastTowerAt = Number.NEGATIVE_INFINITY;
  private lastPraiseAt = Number.NEGATIVE_INFINITY;
  private criticalPlayed = false;
  private lastNexusHealth?: number;
  private rolledStartWave?: number;
  private rolledClearWave?: number;
  private destroyed = false;

  constructor(options: AtlasVoiceOptions) {
    this.audio = options.audio;
    this.now = options.now ?? (() => performance.now());
    this.random = options.random ?? Math.random;
    this.getVolume = options.getVolume;
    this.onSpeaking = options.onSpeaking;
    this.enabled = options.enabled ?? true;
    this.audio.onReady(() => this.unlocked());
  }

  get isSpeaking() {
    return this.speaking;
  }

  get playingCategory(): AtlasCategory | undefined {
    return this.current?.category;
  }

  /** Calan satirin dosyasi (goreli adres); mac sonu sahnesi suresini buradan okuyor. */
  get playingUrl(): string | undefined {
    return this.current?.url;
  }

  /**
   * Yeni mac (oda + asama). Ayni anahtarla ikinci cagri (yeniden baglanma)
   * hicbir seyi sifirlamiyor. `alreadyWelcomed`: bu macin karsilamasi sayfa
   * yenilenmeden once caldi (oturum deposu).
   */
  startMatch(key: string, alreadyWelcomed = false) {
    if (this.matchKey === key) return;
    this.matchKey = key;
    this.stopCurrent(0);
    this.queuedFinal = undefined;
    this.welcomed = alreadyWelcomed;
    this.over = false;
    this.pendingWelcomeAt = undefined;
    this.lastNexusAt = Number.NEGATIVE_INFINITY;
    this.lastTowerAt = Number.NEGATIVE_INFINITY;
    this.lastPraiseAt = Number.NEGATIVE_INFINITY;
    this.criticalPlayed = false;
    this.lastNexusHealth = undefined;
    this.rolledStartWave = undefined;
    this.rolledClearWave = undefined;
    // Macin basinda lazim olanlar hemen: karsilama, dalga basi ve nexus.
    this.prefetch(["welcome", "wave-start", "nexus-damage-lvl1", "nexus-damage-lvl2", "nexus-damage-lvl3"]);
  }

  /** Geri kalan kategoriler; ilk dalga basladiktan sonra arka planda. */
  prefetchRest() {
    this.prefetch(["wave-clear", "tower-destroyed", "praising", "death", "ending"]);
  }

  private prefetch(categories: readonly AtlasCategory[]) {
    if (!this.enabled) return;
    for (const category of categories) {
      try {
        this.audio.prefetch(getAtlasLineUrls(category));
      } catch {
        // Indirme kozmetik; hata oyunu durdurmuyor.
      }
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.queuedFinal = undefined;
      this.pendingWelcomeAt = undefined;
      this.stopCurrent(ATLAS_RULES.interruptFadeMs);
    }
  }

  /** Kaydirici degisti: calan satir yeni seviyeye. Sifirda susuyor. */
  setVolume(volume: number) {
    if (!this.current) return;
    if (volume <= 0) {
      this.stopCurrent(ATLAS_RULES.interruptFadeMs);
      return;
    }
    this.current.playback.setVolume(volume * ATLAS_VOICE_GAIN);
  }

  /** Macin basi: asama basina bir kez. Kilit kapaliysa 8 sn bekliyor. */
  welcome() {
    if (this.welcomed || this.over) return false;
    this.welcomed = true;
    if (!this.audio.isReady()) {
      this.pendingWelcomeAt = this.now();
      return false;
    }
    return this.say("welcome");
  }

  /** Bu macin karsilamasi alindi mi (oturum deposuna yazmak icin). */
  get hasWelcomed() {
    return this.welcomed;
  }

  /** Ses kilidi acildi (ilk dokunus). Bekleyen karsilama suresi icindeyse caliyor. */
  unlocked() {
    const at = this.pendingWelcomeAt;
    if (at === undefined) return;
    this.pendingWelcomeAt = undefined;
    if (this.now() - at <= ATLAS_RULES.welcomeUnlockWindowMs) this.say("welcome");
  }

  /** Dalga basladi: dalga basina tek zar, %33. */
  waveStarted(wave: number) {
    if (this.rolledStartWave === wave) return false;
    this.rolledStartWave = wave;
    if (this.random() >= ATLAS_RULES.waveChance) return false;
    return this.say("wave-start");
  }

  /** Dalga temizlendi: dalga basina tek zar, %33. */
  waveCleared(wave: number) {
    if (this.rolledClearWave === wave) return false;
    this.rolledClearWave = wave;
    if (this.random() >= ATLAS_RULES.waveChance) return false;
    return this.say("wave-clear");
  }

  /**
   * Nexus cani (her snapshot). Ilk deger yalnizca kaydediliyor (yeniden
   * baglanma). Can dustugunde vurustan SONRAKI orana gore seviye; uc seviye
   * 60 sn'lik ortak araliga uyuyor, yalnizca ilk kritik (<= %20) uyari araligi
   * beklemiyor.
   */
  nexusHealth(health: number, maxHealth: number) {
    if (!Number.isFinite(health) || !Number.isFinite(maxHealth) || maxHealth <= 0) return false;
    const previous = this.lastNexusHealth;
    this.lastNexusHealth = health;
    if (previous === undefined || health >= previous || health <= 0) return false;
    const level = getNexusDamageLevel(health / maxHealth);
    const firstCritical = level === 3 && !this.criticalPlayed;
    if (!firstCritical && this.now() - this.lastNexusAt < ATLAS_RULES.nexusGapMs) return false;
    const category: AtlasCategory = level === 3 ? "nexus-damage-lvl3" : level === 2 ? "nexus-damage-lvl2" : "nexus-damage-lvl1";
    if (!this.say(category)) return false;
    this.lastNexusAt = this.now();
    if (level === 3) this.criticalPlayed = true;
    return true;
  }

  /** Yerel oyuncunun kulesi yikildi; 15 sn'de en fazla bir. */
  towerDestroyed() {
    if (this.now() - this.lastTowerAt < ATLAS_RULES.towerGapMs) return false;
    if (!this.say("tower-destroyed")) return false;
    this.lastTowerAt = this.now();
    return true;
  }

  /** Ovgu (sampiyon, ozel tehdit sayaci); 60 sn'de en fazla bir. */
  praise() {
    if (this.now() - this.lastPraiseAt < ATLAS_RULES.praiseGapMs) return false;
    if (!this.say("praising")) return false;
    this.lastPraiseAt = this.now();
    return true;
  }

  /** Mac bitti. Sonra baska satir yok; calan satir daha dusukse kesiliyor. */
  matchEnded(result: "victory" | "defeat") {
    if (this.over) return false;
    const played = this.say(result === "victory" ? "ending" : "death");
    this.over = true;
    this.pendingWelcomeAt = undefined;
    return played;
  }

  destroy() {
    this.destroyed = true;
    this.queuedFinal = undefined;
    this.stopCurrent(0);
  }

  /**
   * Tek kapi: kategoriyi oncelik kuraliyla calmayi dene. Yenilgi/zafer en
   * yuksek oncelikte, yani daha dusuk bir satiri kesiyor; esit oncelikli bir
   * satir (oteki son satir) calarken kuyruga giriyor ve o bitince caliyor.
   * Kuyruga girmek de `true`.
   */
  say(category: AtlasCategory): boolean {
    if (!this.enabled || this.over || this.destroyed) return false;
    if (this.getVolume() <= 0) return false;
    const current = this.current;
    if (current) {
      const final = category === "death" || category === "ending";
      if (ATLAS_PRIORITY[category] > ATLAS_PRIORITY[current.category]) {
        // Once yenisi: kesilen satirin `onEnded`i yeni satiri gorup konusmayi
        // (kisma, gosterge) kapatmasin. Yenisi baslayamazsa eskisi suruyor.
        if (!this.start(category)) return false;
        current.playback.stop(ATLAS_RULES.interruptFadeMs);
        return true;
      }
      if (final) {
        this.queuedFinal = category;
        return true;
      }
      return false;
    }
    return this.start(category);
  }

  private start(category: AtlasCategory): boolean {
    const urls = getAtlasLineUrls(category);
    let bag = this.bags.get(category);
    if (!bag) {
      bag = new AtlasLineBag(urls.length, this.random);
      this.bags.set(category, bag);
    }
    const url = urls[bag.next()];
    let playback: AtlasPlayback | undefined;
    let entry: Current | undefined;
    // Arka uc `onEnded`i daha `play` donmeden cagirirsa satir hic baslamamis sayiliyor.
    let endedEarly = false;
    try {
      playback = this.audio.play(url, this.getVolume() * ATLAS_VOICE_GAIN, () => {
        if (entry) this.ended(entry);
        else endedEarly = true;
      });
    } catch {
      playback = undefined;
    }
    if (!playback || endedEarly) return false;
    entry = { category, playback, url };
    this.current = entry;
    this.setSpeaking(true);
    return true;
  }

  private ended(entry: Current | undefined) {
    if (!entry || this.current !== entry) {
      // Kesilen ya da hic baslamayan satir: konusma suruyorsa dokunma.
      if (!this.current && !this.queuedFinal) this.setSpeaking(false);
      return;
    }
    this.current = undefined;
    const final = this.queuedFinal;
    this.queuedFinal = undefined;
    if (final && this.enabled && !this.destroyed && this.getVolume() > 0 && this.start(final)) return;
    this.setSpeaking(false);
  }

  private stopCurrent(fadeMs: number) {
    const current = this.current;
    this.current = undefined;
    current?.playback.stop(fadeMs);
    this.setSpeaking(false);
  }

  private setSpeaking(speaking: boolean) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    try {
      this.onSpeaking?.(speaking);
    } catch {
      // Gosterge ve kisma kozmetik.
    }
  }
}

/** Takim arkadasinin ya da kendinin kulesi icin yikilma izci (snapshot). */
export type AtlasTowerFact = { id: string; ownerId: string; definitionId: string; hp?: number };

/**
 * Yerel oyuncunun kulelerinin "ayakta -> yikik" gecisi. Ilk gorulen kule
 * yalnizca kaydediliyor (yeniden baglanmada eski yikiklar sayilmasin); satilan
 * kule listeden dusuyor ve unutuluyor. Duvarlar sayilmiyor (`skip`).
 */
export class AtlasTowerWatch {
  private readonly alive = new Map<string, boolean>();
  private readonly seen = new Set<string>();

  observe(towers: readonly AtlasTowerFact[], localId: string, skip?: (definitionId: string) => boolean): number {
    let destroyed = 0;
    this.seen.clear();
    for (const tower of towers) {
      if (tower.ownerId !== localId || skip?.(tower.definitionId)) continue;
      this.seen.add(tower.id);
      const up = tower.hp === undefined || tower.hp > 0;
      const before = this.alive.get(tower.id);
      if (before === true && !up) destroyed += 1;
      this.alive.set(tower.id, up);
    }
    for (const id of this.alive.keys()) {
      if (!this.seen.has(id)) this.alive.delete(id);
    }
    return destroyed;
  }

  reset() {
    this.alive.clear();
  }
}

/**
 * Dalga basi: kurulumdan savasa gecis. Kurulum gorulmeden (dalga ortasinda
 * katilma, yeniden baglanma) gecis sayilmiyor. Dalga basina bir kez.
 */
export class AtlasWaveWatch {
  private sawSetup = false;
  private startedWave?: number;

  observe(state: { wave: number; setupPhase: boolean; over: boolean }): number | undefined {
    if (state.over) {
      this.sawSetup = false;
      return undefined;
    }
    if (state.setupPhase) {
      this.sawSetup = true;
      return undefined;
    }
    if (!this.sawSetup || this.startedWave === state.wave) return undefined;
    this.sawSetup = false;
    this.startedWave = state.wave;
    return state.wave;
  }

  reset() {
    this.sawSetup = false;
    this.startedWave = undefined;
  }
}

/** Kimlik basina bir kez: Metal Kalkan'in bir karsi atagi ilk kez yuttugu an. */
export class AtlasOnceSet {
  private readonly ids = new Set<string | number>();

  first(id: string | number) {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > 64) this.ids.delete(this.ids.values().next().value!);
    return true;
  }

  reset() {
    this.ids.clear();
  }
}

// --- Karsilamanin kaydi (yeniden yukleme) ----------------------------------

const WELCOME_STORAGE_KEY = "karayel.atlasWelcomed";
const welcomedInMemory = new Set<string>();

/** Bu mac (oda:asama) karsilandi mi. Depo kapaliysa (iframe) bellek yetiyor. */
export function readAtlasWelcomed(key: string) {
  if (welcomedInMemory.has(key)) return true;
  try {
    const raw = window.sessionStorage.getItem(WELCOME_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.includes(key);
  } catch {
    return false;
  }
}

export function writeAtlasWelcomed(key: string) {
  welcomedInMemory.add(key);
  try {
    const raw = window.sessionStorage.getItem(WELCOME_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: string[] = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    if (!list.includes(key)) list.push(key);
    window.sessionStorage.setItem(WELCOME_STORAGE_KEY, JSON.stringify(list.slice(-8)));
  } catch {
    // Depo yoksa bellek yetiyor.
  }
}

// --- Ayar: ATLAS sesi acik/kapali ------------------------------------------

const ENABLED_STORAGE_KEY = "karayel.atlasVoice";

export function readAtlasEnabled() {
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeAtlasEnabled(on: boolean) {
  try {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Depo kapali (itch/Bounty Board iframe'i): ayar bu oturumluk.
  }
}

// --- Tarayici arka ucu -----------------------------------------------------

export type AtlasLoader = (url: string) => Promise<ArrayBuffer>;

const defaultLoader: AtlasLoader = (url) => fetch(url).then((response) => {
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.arrayBuffer();
});

/** Eski Safari `decodeAudioData`'yi yalnizca geri cagirmayla taniyor. */
function decode(context: BaseAudioContext, data: ArrayBuffer) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    try {
      const result = context.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (result && typeof result.then === "function") result.then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

/** Dosya bu kadar surede inip cozulemezse satir sessizce atlaniyor (bayat olmasin). */
export const ATLAS_LOAD_TIMEOUT_MS = 4_000;

/**
 * Web Audio arka ucu: geri bildirim yonetmeninin tek baglamini kullaniyor
 * (iOS acik baglam sayisini sinirliyor, kilidi de o baglam aciyor). Dosyalar
 * kategori kategori `fetch` ile iniyor ve sikistirilmis haliyle tutuluyor
 * (toplam ~2,7 MB); cozme calma aninda, birkac on ms. Ses dogrudan cikisa,
 * efekt sikistiricisinin disinda; seviye medya ogesi yerine kazanc dugumunde,
 * yani iOS'ta da kaydirici isliyor. Her hata yutuluyor: localStorage yok,
 * calamazsa susuyor.
 */
export function createAtlasWebAudio(options: { getContext: () => AudioContext | undefined; load?: AtlasLoader }): AtlasAudioPort {
  const load = options.load ?? defaultLoader;
  const files = new Map<string, Promise<ArrayBuffer>>();
  const listeners: Array<() => void> = [];
  let watched: AudioContext | undefined;

  const context = () => {
    let ctx: AudioContext | undefined;
    try {
      ctx = options.getContext();
    } catch {
      ctx = undefined;
    }
    if (ctx && ctx !== watched) {
      watched = ctx;
      const notify = () => {
        if (ctx!.state === "running") for (const listener of listeners) listener();
      };
      try {
        ctx.addEventListener("statechange", notify);
      } catch {
        // Eski tarayici: dokunus yolu `unlocked` cagiriyor.
      }
    }
    return ctx;
  };

  const fetchFile = (url: string) => {
    let job = files.get(url);
    if (!job) {
      job = load(assetUrl(url));
      files.set(url, job);
      // Gelmeyen dosya bir sonraki istekte yeniden denensin.
      job.catch(() => {
        if (files.get(url) === job) files.delete(url);
      });
    }
    return job;
  };

  return {
    isReady() {
      const ctx = context();
      if (!ctx) return false;
      if (ctx.state === "running") return true;
      // Masaustu tarayici onceki dokunusla (menu) acmaya izin verebilir.
      if (ctx.state !== "closed") void ctx.resume().catch(() => undefined);
      return false;
    },
    onReady(listener) {
      listeners.push(listener);
    },
    prefetch(urls) {
      for (const url of urls) void fetchFile(url).catch(() => undefined);
    },
    play(url, volume, onEnded) {
      const ctx = context();
      if (!ctx || ctx.state === "closed") return undefined;
      const requestedAt = performance.now();
      let gain: GainNode;
      try {
        gain = ctx.createGain();
        gain.gain.value = volume;
        gain.connect(ctx.destination);
      } catch {
        return undefined;
      }
      let source: AudioBufferSourceNode | undefined;
      let stopped = false;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        try {
          source?.disconnect();
          gain.disconnect();
        } catch {
          // Zaten ayrilmis.
        }
        onEnded();
      };
      fetchFile(url)
        .then((bytes) => decode(ctx, bytes.slice(0)))
        .then((buffer) => {
          if (stopped || ctx.state === "closed" || performance.now() - requestedAt > ATLAS_LOAD_TIMEOUT_MS) {
            finish();
            return;
          }
          source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(gain);
          source.onended = finish;
          source.start();
        })
        .catch(finish);
      return {
        stop(fadeMs) {
          if (stopped) return;
          stopped = true;
          if (!source) {
            // Henuz baslamadi: yukleme bitince sessizce kapanacak; sira hemen bosalsin.
            queueMicrotask(finish);
            return;
          }
          try {
            const at = ctx.currentTime;
            const fade = Math.max(0, fadeMs) / 1000;
            gain.gain.cancelScheduledValues(at);
            gain.gain.setValueAtTime(gain.gain.value, at);
            gain.gain.linearRampToValueAtTime(0, at + fade);
            source.stop(at + fade + 0.01);
          } catch {
            finish();
          }
        },
        setVolume(next) {
          try {
            gain.gain.setTargetAtTime(next, ctx.currentTime, 0.03);
          } catch {
            // Kapanmis baglam.
          }
        }
      };
    }
  };
}
