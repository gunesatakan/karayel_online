import { assetUrl } from "./asset-url";
import { DEFAULT_MUSIC_VOLUME } from "./menu-music";

/**
 * Dalga muzigi: belirli dalgalarin savasinda arkada calan donguler.
 *
 * Kurallar (sahibin karari):
 * - TRACK_01 6, 10, 14 ve 18. dalgalarda; TRACK_02 4, 9 ve 16. dalgalarda.
 *   Diger dalgalar muziksiz.
 * - Yalnizca savas sirasinda: kurulumda, dalga temizlenince (dusman kalmadi,
 *   kart perdesi) ve mac bitince soluyor. Her muzikli dalga parcayi bastan
 *   aliyor.
 * - Seviye %30: kaydirici varsayilandayken (0.34) kazanc 0.3; kaydirici bu
 *   orana gore olcekliyor (0 sessiz). ATLAS konusurken kisiliyor.
 *
 * Donguler dosyanin icinde hazir: `loopStart`tan oncesi giris (bir kez
 * caliyor), dosya `loopEnd`de bitiyor ve son 0.18 sn girisin son 0.18 sn'siyle
 * esit gucte harmanlanmis. WebAudio `loop` ile ornek dogrulugunda donuyor;
 * HTMLAudio `loop` dosya basina sarip bosluk birakirdi.
 *
 * MP3 basindaki kodlayici gecikmesi (LAME 1105 ornek) cogu tarayicida
 * kirpiliyor; kirpmayan tarayicida tampon beklenenden uzun geliyor ve dongu
 * noktalari o kadar kaydiriliyor.
 */

export type WaveMusicTrack = {
  id: string;
  /** Paketteki yol; `assetUrl` ile cozuluyor. */
  path: string;
  waves: readonly number[];
  loopStartSec: number;
  loopEndSec: number;
  /** Kirpilmis cozulmus uzunluk (= loopEnd). */
  lengthSec: number;
};

const SOURCE_RATE = 44100;

export const WAVE_MUSIC_TRACKS: readonly WaveMusicTrack[] = Object.freeze([
  {
    id: "track-01",
    path: "audio/music/track-01.mp3",
    waves: Object.freeze([6, 10, 14, 18]),
    loopStartSec: 75499 / SOURCE_RATE,
    loopEndSec: 1133939 / SOURCE_RATE,
    lengthSec: 1133939 / SOURCE_RATE
  },
  {
    id: "track-02",
    path: "audio/music/track-02.mp3",
    waves: Object.freeze([4, 9, 16]),
    loopStartSec: 206300 / SOURCE_RATE,
    loopEndSec: 1178974 / SOURCE_RATE,
    lengthSec: 1178974 / SOURCE_RATE
  }
]);

/** Kaydirici varsayilandayken dalga muziginin kazanci. */
export const WAVE_MUSIC_GAIN = 0.3;
export const WAVE_MUSIC_FADE_IN_SEC = 1.2;
export const WAVE_MUSIC_FADE_OUT_SEC = 2.5;
/** LAME'in basa ekledigi ornekler (kirpilmamis cozumde). */
export const MP3_ENCODER_DELAY_SEC = 1105 / SOURCE_RATE;

export function getWaveMusicTrack(wave: number): WaveMusicTrack | undefined {
  return WAVE_MUSIC_TRACKS.find((track) => track.waves.includes(wave));
}

/** Bu anda calmasi gereken parca: muzikli dalganin savasi suruyorsa. */
export function getWaveMusicTrackForState(state: { wave: number; setupPhase: boolean; enemiesLeft: number; over: boolean }) {
  if (state.over || state.setupPhase || !(state.enemiesLeft > 0)) return undefined;
  return getWaveMusicTrack(state.wave);
}

/** Kaydirici ve ATLAS kisilmasiyla son kazanc. */
export function getWaveMusicLevel(musicVolume: number, duck = 1) {
  const slider = Math.max(0, Number.isFinite(musicVolume) ? musicVolume : DEFAULT_MUSIC_VOLUME);
  return WAVE_MUSIC_GAIN * (slider / DEFAULT_MUSIC_VOLUME) * Math.min(1, Math.max(0, duck));
}

/** Cozulmus tampona gore dongu noktalari; kirpilmamis gecikme varsa kaydiriliyor. */
export function getWaveMusicLoopPoints(track: WaveMusicTrack, bufferDurationSec: number) {
  const offset = bufferDurationSec > track.lengthSec + 0.01 ? MP3_ENCODER_DELAY_SEC : 0;
  return { offset, loopStart: track.loopStartSec + offset, loopEnd: track.loopEndSec + offset };
}

type Loader = (url: string) => Promise<ArrayBuffer>;

const defaultLoader: Loader = (url) => fetch(url).then((response) => {
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

type Voice = { track: WaveMusicTrack; source?: AudioBufferSourceNode; gain: GainNode; stopped: boolean };

/**
 * Tek calan dongu. `update` her snapshot'ta istenen parcayla cagriliyor;
 * ayni parca calarken bir sey yapmiyor, baglam kilitliyse sonraki cagrida
 * yeniden deniyor.
 */
export class WaveMusicPlayer {
  private readonly load: Loader;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private context?: AudioContext;
  private master?: GainNode;
  private voice?: Voice;
  private level = 0;
  private destroyed = false;

  constructor(private readonly options: { getContext: () => AudioContext | undefined; load?: Loader }) {
    this.load = options.load ?? defaultLoader;
  }

  get playingTrackId() {
    return this.voice && !this.voice.stopped ? this.voice.track.id : undefined;
  }

  setLevel(level: number) {
    this.level = Math.max(0, level);
    const ctx = this.context;
    if (ctx && this.master && ctx.state !== "closed") {
      try {
        this.master.gain.setTargetAtTime(this.level, ctx.currentTime, 0.05);
      } catch {
        // Kapanmis baglam.
      }
    }
  }

  /** Dosyayi indirip cozmeye basla (tetik aninda hazir olsun). */
  prefetch(track: WaveMusicTrack) {
    const ctx = this.getContext();
    if (ctx) void this.getBuffer(ctx, track).catch(() => undefined);
  }

  update(track: WaveMusicTrack | undefined) {
    if (this.destroyed) return;
    const current = this.voice && !this.voice.stopped ? this.voice : undefined;
    if (current && current.track.id === track?.id) return;
    if (current) this.fadeOut(current);
    if (!track) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state !== "running") {
      // Kilit dokunusla aciliyor; bu arada sonraki snapshot yeniden deniyor.
      void ctx.resume().catch(() => undefined);
      return;
    }
    const master = this.getMaster(ctx);
    if (!master) return;
    let gain: GainNode;
    try {
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(master);
    } catch {
      return;
    }
    const voice: Voice = { track, gain, stopped: false };
    this.voice = voice;
    this.getBuffer(ctx, track)
      .then((buffer) => {
        if (voice.stopped || this.voice !== voice || ctx.state === "closed") {
          this.release(voice);
          return;
        }
        const points = getWaveMusicLoopPoints(track, buffer.duration);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = points.loopStart;
        source.loopEnd = points.loopEnd;
        source.connect(gain);
        const at = ctx.currentTime;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(1, at + WAVE_MUSIC_FADE_IN_SEC);
        source.start(at, points.offset);
        voice.source = source;
      })
      .catch(() => {
        // Gelmeyen dosya: bu dalga muziksiz; sonraki muzikli dalga yeniden deniyor.
        if (this.voice === voice) this.voice = undefined;
        this.release(voice);
      });
  }

  destroy() {
    this.destroyed = true;
    if (this.voice) {
      this.voice.stopped = true;
      this.release(this.voice);
      this.voice = undefined;
    }
    try {
      this.master?.disconnect();
    } catch {
      // Zaten ayrilmis.
    }
    this.master = undefined;
    this.buffers.clear();
  }

  private fadeOut(voice: Voice) {
    voice.stopped = true;
    if (this.voice === voice) this.voice = undefined;
    const ctx = this.context;
    if (!voice.source || !ctx || ctx.state === "closed") {
      this.release(voice);
      return;
    }
    try {
      const at = ctx.currentTime;
      voice.gain.gain.cancelScheduledValues(at);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
      voice.gain.gain.linearRampToValueAtTime(0, at + WAVE_MUSIC_FADE_OUT_SEC);
      voice.source.onended = () => this.release(voice);
      voice.source.stop(at + WAVE_MUSIC_FADE_OUT_SEC + 0.02);
    } catch {
      this.release(voice);
    }
  }

  private release(voice: Voice) {
    try {
      voice.source?.stop();
    } catch {
      // Baslamamis ya da durmus.
    }
    try {
      voice.source?.disconnect();
      voice.gain.disconnect();
    } catch {
      // Zaten ayrilmis.
    }
  }

  private getContext() {
    let ctx: AudioContext | undefined;
    try {
      ctx = this.options.getContext();
    } catch {
      ctx = undefined;
    }
    if (ctx !== this.context) {
      // Yeni baglam: eski dugumler ve cozulmus tamponlar ona ait degil.
      if (this.voice) {
        this.voice.stopped = true;
        this.release(this.voice);
        this.voice = undefined;
      }
      this.master = undefined;
      this.buffers.clear();
      this.context = ctx;
    }
    return ctx;
  }

  private getMaster(ctx: AudioContext) {
    if (!this.master) {
      try {
        this.master = ctx.createGain();
        this.master.gain.value = this.level;
        this.master.connect(ctx.destination);
      } catch {
        this.master = undefined;
      }
    }
    return this.master;
  }

  private getBuffer(ctx: AudioContext, track: WaveMusicTrack) {
    let job = this.buffers.get(track.id);
    if (!job) {
      job = this.load(assetUrl(track.path)).then((bytes) => decode(ctx, bytes));
      this.buffers.set(track.id, job);
      job.catch(() => {
        if (this.buffers.get(track.id) === job) this.buffers.delete(track.id);
      });
    }
    return job;
  }
}
