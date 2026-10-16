import { performance } from "node:perf_hooks";

/**
 * Odanin saati ve zari.
 *
 * Oda zamani (`Date.now`, `performance.now`) ve zari (`Math.random`) eskiden
 * dogrudan surecin ortak kaynaklarindan okuyordu. Ayni surecte birden fazla
 * mac kostugu icin bir maci birebir yeniden oynatmak imkansizdi: zar akisi
 * odalar arasinda karisiyordu ve saat her okumada biraz ilerliyordu.
 *
 * Iki kip var:
 * - `live` (varsayilan; testler, simulator): her okuma surecin kaynagina
 *   gidiyor. Davranis eskisiyle bire bir ayni; `Math.random`/`Date.now`u
 *   degistiren testler ve tohumlu simulator dunyasi aynen calisiyor.
 * - `seeded` (uretim ve yeniden oynatma): oda basina tohumlu uretec ve
 *   donmus saat. Saat her giris noktasinda (tick, mesaj, katilim, ayrilma,
 *   yeniden baglanma) bir kez okunuyor ve o is bitene kadar sabit kaliyor;
 *   tick'in suresi (deltaTime) mikrosaniyeye yuvarlaniyor. Kaydedici bu
 *   degerleri yaziyor, yeniden oynatma ayni degerleri geri veriyor.
 */
export type ClockScopeKind = "create" | "tick" | "msg" | "join" | "leave" | "rc";

export interface RoomClockSource {
  /** Bir giris noktasinin saati (`Date.now` anlaminda, ms). */
  scope(kind: ClockScopeKind, sessionId?: string): number;
  /** Tick'in saati. */
  tick(): number;
}

export interface RoomRuntime {
  readonly seeded: boolean;
  readonly seed: number;
  /** Bagli uretec: dogrudan alana verilebilir (`this.runtime.random`). */
  readonly random: () => number;
  /** `Date.now` yerine. */
  now(): number;
  /** `performance.now` yerine (yayin zamanlamasi gibi monoton isler). */
  mono(): number;
  /** Tick basi: nicemlenmis deltaTime'i dondurur ve saati dondurur. */
  beginTick(deltaTime: number): number;
  /** Mesaj, katilim, ayrilma: saati dondurur, degeri dondurur. */
  beginScope(kind: ClockScopeKind, sessionId?: string): number;
  /** Yan etkisiz biten giris noktasi (kovanin reddettigi mesaj): saat geri. */
  restoreScope(previous: number): void;
  /**
   * Odanin disaridan (Colyseus) okudugu bir sayi: ayrilmis koltuk sayisi.
   * Canli kipte degeri aynen dondurur; kaydedici degisimi yaziyor, yeniden
   * oynatma kayittaki degeri veriyor.
   */
  observeSeats(count: number): number;
  /** Son tick'in mikrosaniye cinsinden suresi (kayit icin). */
  readonly lastDeltaUs: number;
}

/** Canli kip: surecin kaynaklari, eskisiyle ayni davranis. */
class LiveRoomRuntime implements RoomRuntime {
  readonly seeded = false;
  readonly seed = 0;
  readonly random = () => Math.random();
  lastDeltaUs = 0;
  now() {
    return Date.now();
  }
  mono() {
    return performance.now();
  }
  beginTick(deltaTime: number) {
    return deltaTime;
  }
  beginScope() {
    return Date.now();
  }
  restoreScope() {}
  observeSeats(count: number) {
    return count;
  }
}

export const LIVE_ROOM_RUNTIME: RoomRuntime = new LiveRoomRuntime();

/** Kucuk, hizli, 32 bit tohumlu uretec (simulatorle ayni: `tools/sim/world.mjs`). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kayittaki dakikanin gercek saati; uretimde surecin saati. */
export const LIVE_CLOCK_SOURCE: RoomClockSource = {
  scope: () => Date.now(),
  tick: () => Date.now()
};

export type SeedTape = {
  /** Kaydedicinin kancalari; yeniden oynatmada yok. */
  onSeats?(count: number): void;
};

/**
 * Tohumlu kip. `clock` uretimde surecin saati, yeniden oynatmada kayit.
 * `seats` yeniden oynatmada kayittan gelen koltuk sayisi (`setSeats`).
 */
export class SeededRoomRuntime implements RoomRuntime {
  readonly seeded = true;
  readonly random: () => number;
  lastDeltaUs = 0;
  private frozenNow: number;
  /**
   * Monoton saat sifirdan degil: yayin zamanlayicisinin "son gonderim" alanlari
   * 0'dan basliyor; canli kipteki `performance.now` gibi ilk tick'te ilk
   * snapshot hemen gitsin (yoksa ilk kare bir gonderim araligi gecikiyordu).
   */
  private monoMs = 1_000_000;
  private seats = 0;
  private replaySeats?: number;
  tape?: SeedTape;

  constructor(readonly seed: number, readonly createdAt: number, private readonly clock: RoomClockSource = LIVE_CLOCK_SOURCE) {
    this.random = mulberry32(seed);
    this.frozenNow = createdAt;
  }

  now() {
    return this.frozenNow;
  }

  mono() {
    return this.monoMs;
  }

  beginTick(deltaTime: number) {
    // Mikrosaniye: kayitta tam sayi, yeniden oynatmada ayni double.
    const us = Number.isFinite(deltaTime) ? Math.max(0, Math.round(deltaTime * 1000)) : 0;
    this.lastDeltaUs = us;
    const dt = us / 1000;
    this.monoMs += dt;
    this.frozenNow = this.clock.tick();
    return dt;
  }

  beginScope(kind: ClockScopeKind, sessionId?: string) {
    this.frozenNow = this.clock.scope(kind, sessionId);
    return this.frozenNow;
  }

  restoreScope(previous: number) {
    this.frozenNow = previous;
  }

  observeSeats(count: number) {
    if (this.replaySeats !== undefined) return this.replaySeats;
    if (count !== this.seats) {
      this.seats = count;
      this.tape?.onSeats?.(count);
    }
    return count;
  }

  /** Yeniden oynatma: kayittaki koltuk sayisi. */
  setReplaySeats(count: number) {
    this.replaySeats = count;
  }
}
