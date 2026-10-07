import type { RunSummary } from "@karayel/shared";

/**
 * Anonim telemetri: hata raporu ve kapali oyun testi icin temel kullanim verisi.
 *
 * Veri yalnizca bizim oyun sunucumuza gidiyor (`POST /telemetry`); ucuncu
 * taraf servis yok. Oyuncu adi, IP ya da cihaz parmak izi yollanmiyor:
 * kimlik bu tarayicida uretilmis rastgele bir kurulum kimligi ve sayfa basina
 * bir oturum kimligi. Ayarlardan kapatilinca hicbir sey gonderilmiyor.
 *
 * Bu dosya tarayiciya baglanmiyor (zamanlayici, dinleyici, Vite ortam degiskeni
 * yok); hepsi enjekte ediliyor ki node testinde calissin. Tarayici kablolamasi
 * `telemetry-boot.ts`te, yalnizca `main.ts`in oyun yolunda. Gelistirme sahnesi
 * (`/dev/...`) ve VFX galerisi onu hic cagirmiyor; cagirsa da adres kapisi
 * (`isTelemetryBlockedLocation`) kapatiyor.
 */

export const TELEMETRY_SETTING_KEY = "karayel_telemetry_enabled";
export const TELEMETRY_INSTALL_ID_KEY = "karayel_install_id";
/** Suren kosunun kimligi; sayfa yenilenip maca donulunce ayni kosu sayilsin. */
export const TELEMETRY_RUN_KEY = "karayel:telemetry-run";
export const TELEMETRY_MAX_BATCH = 20;
export const TELEMETRY_MAX_QUEUE = 200;
/** Sunucunun siniri 16 KB; biraz pay. */
export const TELEMETRY_MAX_BODY_BYTES = 15_000;
export const TELEMETRY_FLUSH_INTERVAL_MS = 30_000;
export const TELEMETRY_ERRORS_PER_MINUTE = 5;

/** Ayarlardaki kisa aciklama; menude ve oyun ici ayarda ayni metin. */
export const TELEMETRY_SETTING_LABEL = "Anonim kullanım verisi gönder";
export const TELEMETRY_SETTING_NOTE =
  "Yalnızca kendi sunucumuza gider: hata mesajları, dalga, seçilen kart ve eşyalar, kule seviyeleri, FPS ve gecikme. "
  + "Ad, IP veya hesap bilgisi gönderilmez; kimlik bu tarayıcıda üretilen rastgele bir sayıdır. Veriler 90 gün saklanır.";

export type TelemetryEventType = "session_start" | "run_start" | "run_end" | "abandon" | "error" | "perf";
export type TelemetryFields = Record<string, unknown>;
export type TelemetryEvent = TelemetryFields & { t: TelemetryEventType; ts: number };

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(kind: "localStorage" | "sessionStorage"): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window[kind];
  } catch {
    // Gizli pencere ya da engelli site verisi: depo yok.
    return undefined;
  }
}

// --- ayar --------------------------------------------------------------------

const settingListeners = new Set<(enabled: boolean) => void>();

/** Varsayilan acik; yalnizca acikca "0" yazildiysa kapali. */
export function isTelemetryEnabled(storage: StorageLike | undefined = browserStorage("localStorage")) {
  try {
    return storage?.getItem(TELEMETRY_SETTING_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setTelemetryEnabled(enabled: boolean, storage: StorageLike | undefined = browserStorage("localStorage")) {
  try {
    storage?.setItem(TELEMETRY_SETTING_KEY, enabled ? "1" : "0");
  } catch {
    // Yazilamadiysa tercih yalnizca bu sayfada gecerli (asagidaki bellek bayragi).
  }
  sessionOverride = enabled;
  // Ayardan bilerek yapilan secim bildirimi de gecmis sayiliyor: oyuncu
  // neyin gidecegini o kutunun notunda okudu.
  markTelemetryNoticeSeen(storage);
  for (const listener of settingListeners) listener(enabled);
}

// --- ilk acilis bildirimi -------------------------------------------------------

export const TELEMETRY_NOTICE_KEY = "karayel_telemetry_notice";

/** Depo yazilamasa da bu sayfada bildirim bir kez gecildi mi. */
let noticeSeenThisPage = false;

/**
 * Ilk acilis bildirimi gecildi mi (Tamam, Kapat ya da ayardan secim).
 * Gecilene kadar hicbir olay tutulmuyor ve gitmiyor; depo kapaliysa bildirim
 * her acilista yeniden geliyor ve o sayfada kararla geciliyor.
 */
export function hasSeenTelemetryNotice(storage: StorageLike | undefined = browserStorage("localStorage")) {
  if (noticeSeenThisPage) return true;
  try {
    return storage?.getItem(TELEMETRY_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function markTelemetryNoticeSeen(storage: StorageLike | undefined) {
  noticeSeenThisPage = true;
  try {
    storage?.setItem(TELEMETRY_NOTICE_KEY, "1");
  } catch {
    // Yazilamadi: karar bu sayfada gecerli.
  }
}

/** Bildirimin karari: Tamam (acik kalir) ya da Kapat (kapatir). */
export function acknowledgeTelemetryNotice(enabled: boolean, storage: StorageLike | undefined = browserStorage("localStorage")) {
  setTelemetryEnabled(enabled, storage);
}

/** Olay tutmak ve yollamak icin: bildirim gecilmis ve ayar acik. */
export function isTelemetryActive(storage?: StorageLike) {
  const resolved = storage ?? browserStorage("localStorage");
  return hasSeenTelemetryNotice(resolved) && readTelemetrySetting(resolved);
}

/** Depo yazilamasa da bu sayfadaki son secim gecerli. */
let sessionOverride: boolean | undefined;

export function readTelemetrySetting(storage?: StorageLike) {
  return sessionOverride ?? isTelemetryEnabled(storage ?? browserStorage("localStorage"));
}

export function onTelemetrySettingChange(listener: (enabled: boolean) => void) {
  settingListeners.add(listener);
  return () => settingListeners.delete(listener);
}

/** Test icin: bellek bayragini ve dinleyicileri sifirlar. */
export function resetTelemetrySettingForTests() {
  sessionOverride = undefined;
  noticeSeenThisPage = false;
  settingListeners.clear();
}

// --- kimlik ve adres ---------------------------------------------------------

export function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Guvenli olmayan baglamda randomUUID yok (http yerel ag).
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Kurulum kimligi: depoda yoksa uretilip yaziliyor; depo yoksa sayfa basina. */
export function getInstallId(storage: StorageLike | undefined = browserStorage("localStorage"), generate = randomId) {
  try {
    const saved = storage?.getItem(TELEMETRY_INSTALL_ID_KEY);
    if (saved && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return saved;
  } catch {
    // Okunamadi: yeni kimlik.
  }
  const id = generate();
  try {
    storage?.setItem(TELEMETRY_INSTALL_ID_KEY, id);
  } catch {
    // Yazilamadi: kimlik bu sayfayla sinirli.
  }
  return id;
}

/** Gelistirme sahnesi ve VFX galerisi hicbir zaman gondermiyor. */
export function isTelemetryBlockedLocation(location: { pathname: string; search: string }) {
  if (/^\/dev(\/|$)/.test(location.pathname)) return true;
  return new URLSearchParams(location.search).has("vfx-gallery");
}

/** Oyun sunucusunun WebSocket adresinden HTTP(S) ucu. */
export function getTelemetryEndpoint(gameServerUrl: string) {
  return `${gameServerUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/+$/, "")}/telemetry`;
}

type WindowLike = {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio?: number;
  matchMedia?: (query: string) => { matches: boolean };
  navigator: { language?: string; standalone?: boolean };
  location: { hostname: string };
  self?: unknown;
  top?: unknown;
  screen?: { width: number; height: number };
};

/** `session_start` alanlari: kaba cihaz sinifi ve gorunum; parmak izi yok. */
export function describeSession(win: WindowLike): TelemetryFields {
  const media = (query: string) => {
    try {
      return win.matchMedia?.(query).matches === true;
    } catch {
      return false;
    }
  };
  const shortSide = Math.min(win.screen?.width ?? win.innerWidth, win.screen?.height ?? win.innerHeight);
  const coarse = media("(pointer: coarse)");
  let iframe: boolean;
  try {
    iframe = win.self !== win.top;
  } catch {
    // Baska kaynaktaki ust cerceveye erisim hata veriyor: demek ki cercevedeyiz.
    iframe = true;
  }
  const language = win.navigator.language;
  return {
    device: coarse ? (shortSide >= 600 ? "tablet" : "mobile") : "desktop",
    vw: Math.round(win.innerWidth),
    vh: Math.round(win.innerHeight),
    dpr: Math.round((win.devicePixelRatio ?? 1) * 100) / 100,
    ...(typeof language === "string" && language ? { lang: language } : {}),
    pwa: media("(display-mode: standalone)") || win.navigator.standalone === true,
    iframe,
    host: win.location.hostname
  };
}

// --- gonderim ------------------------------------------------------------------

/** `urgent`: sayfa kapaniyor ya da gizleniyor; `sendBeacon` tercih ediliyor. */
export type TelemetryTransport = (url: string, body: string, urgent: boolean) => void;

/**
 * Tarayici gonderimi. Govde `text/plain`: basit istek, CORS on kontrolu yok.
 * `keepalive` sayfa kapanirken de istegi tasiyor (64 KB siniri; biz 15 KB).
 */
export function createBrowserTransport(): TelemetryTransport {
  return (url, body, urgent) => {
    try {
      if (urgent && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        if (navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return;
      }
      void fetch(url, {
        method: "POST",
        body,
        keepalive: true,
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "text/plain" }
      }).catch(() => {
        // Telemetri oyunu asla bozmamali; kayip olay kabul.
      });
    } catch {
      // Ayni sebep.
    }
  };
}

export type TelemetryClientOptions = {
  endpoint: string;
  installId: string;
  sessionId: string;
  version: string;
  transport: TelemetryTransport;
  isEnabled: () => boolean;
  now?: () => number;
  maxBatch?: number;
  maxQueue?: number;
  maxBodyBytes?: number;
};

/**
 * Olay kuyrugu. Olaylar biriktirilip en fazla 20'lik ve 15 KB'lik paketlerle
 * gidiyor; kuyruk 20'ye ulasinca, 30 sn'de bir ve sayfa gizlenince/kapaninca.
 * Ayar kapaliyken `track` hicbir sey tutmuyor ve bekleyen kuyruk siliniyor.
 */
export class TelemetryClient {
  private queue: TelemetryEvent[] = [];
  private readonly now: () => number;
  private readonly maxBatch: number;
  private readonly maxQueue: number;
  private readonly maxBodyBytes: number;
  /** Tani: gonderilen paket ve atilan olay sayisi. */
  readonly stats = { batches: 0, sent: 0, dropped: 0 };

  constructor(private readonly options: TelemetryClientOptions) {
    this.now = options.now ?? Date.now;
    this.maxBatch = options.maxBatch ?? TELEMETRY_MAX_BATCH;
    this.maxQueue = options.maxQueue ?? TELEMETRY_MAX_QUEUE;
    this.maxBodyBytes = options.maxBodyBytes ?? TELEMETRY_MAX_BODY_BYTES;
  }

  get pending() {
    return this.queue.length;
  }

  track(type: TelemetryEventType, fields: TelemetryFields = {}) {
    if (!this.options.isEnabled()) {
      this.queue = [];
      return;
    }
    this.queue.push({ ...fields, t: type, ts: Math.round(this.now()) });
    if (this.queue.length > this.maxQueue) {
      this.stats.dropped += this.queue.length - this.maxQueue;
      this.queue.splice(0, this.queue.length - this.maxQueue);
    }
    if (this.queue.length >= this.maxBatch) this.flush(false);
  }

  clear() {
    this.queue = [];
  }

  /** Kuyrugu paketleyip yollar; yollanan paket sayisini dondurur. */
  flush(urgent = false) {
    if (!this.options.isEnabled()) {
      this.queue = [];
      return 0;
    }
    let batches = 0;
    while (this.queue.length > 0) {
      const events: TelemetryEvent[] = [];
      let body = this.encode(events);
      while (this.queue.length > 0 && events.length < this.maxBatch) {
        const candidate = this.encode([...events, this.queue[0]]);
        if (candidate.length > this.maxBodyBytes) {
          if (events.length === 0) {
            // Tek basina sigmayan olay hic gidemez; atiliyor.
            this.queue.shift();
            this.stats.dropped += 1;
            continue;
          }
          break;
        }
        events.push(this.queue.shift()!);
        body = candidate;
      }
      if (events.length === 0) continue;
      this.options.transport(this.options.endpoint, body, urgent);
      this.stats.batches += 1;
      this.stats.sent += events.length;
      batches += 1;
    }
    return batches;
  }

  private encode(events: readonly TelemetryEvent[]) {
    return JSON.stringify({ iid: this.options.installId, sid: this.options.sessionId, ver: this.options.version, events });
  }
}

// --- hatalar ----------------------------------------------------------------------

const MAX_STACK_FRAMES = 5;

/** Yigini ilk birkac kareye indirir; adresin kaynak ve sorgu kismi atiliyor. */
export function trimStack(stack: string | undefined, message = "") {
  if (!stack) return "";
  const lines = stack.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // Chrome yiginin ilk satiri "TypeError: mesaj": kare degil.
  if (lines.length > 0 && (lines[0] === message || (message && lines[0].endsWith(message)) || !/[/:@(]/.test(lines[0]))) lines.shift();
  return lines.slice(0, MAX_STACK_FRAMES)
    .map((line) => line
      .replace(/(?:https?|blob|file):\/\/[^/\s)]*/g, "")
      .replace(/[?#][^:\s)]*(?=:\d)/g, "")
      .slice(0, 200))
    .join("\n");
}

/** Her turden firlatilani mesaj ve yigina cevirir. */
export function describeError(error: unknown): { msg: string; stack: string } {
  if (error instanceof Error) {
    const msg = `${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message || String(error)}`;
    return { msg: msg.slice(0, 300), stack: trimStack(error.stack, error.message) };
  }
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; stack?: unknown };
    if (typeof candidate.message === "string") {
      return { msg: candidate.message.slice(0, 300), stack: trimStack(typeof candidate.stack === "string" ? candidate.stack : undefined, candidate.message) };
    }
    try {
      return { msg: JSON.stringify(error).slice(0, 300), stack: "" };
    } catch {
      return { msg: "[object]", stack: "" };
    }
  }
  return { msg: String(error ?? "unknown").slice(0, 300), stack: "" };
}

export type ErrorKind = "error" | "rejection" | "phaser" | "connect";
export type ErrorContext = { scene?: string; wave?: number; rid?: string };

/**
 * Hata raporlayici: ayni mesaj + ilk kare oturumda bir kez, dakikada en fazla 5.
 * Sinira takilan hata "goruldu" sayilmiyor; pencere acilinca yine gidebilir.
 */
export class ErrorReporter {
  private readonly seen = new Set<string>();
  private sentAt: number[] = [];
  private readonly now: () => number;
  private readonly maxPerMinute: number;

  constructor(private readonly options: {
    send: (fields: TelemetryFields) => void;
    context?: () => ErrorContext;
    now?: () => number;
    maxPerMinute?: number;
  }) {
    this.now = options.now ?? Date.now;
    this.maxPerMinute = options.maxPerMinute ?? TELEMETRY_ERRORS_PER_MINUTE;
  }

  report(error: unknown, kind: ErrorKind = "error") {
    const { msg, stack } = describeError(error);
    const key = `${msg}|${stack.split("\n")[0] ?? ""}`;
    if (this.seen.has(key)) return false;
    const now = this.now();
    this.sentAt = this.sentAt.filter((at) => now - at < 60_000);
    if (this.sentAt.length >= this.maxPerMinute) return false;
    this.seen.add(key);
    this.sentAt.push(now);
    let context: ErrorContext = {};
    try {
      context = this.options.context?.() ?? {};
    } catch {
      // Baglam okunamiyorsa hata yine gidiyor.
    }
    const fields: TelemetryFields = { msg: msg || "unknown", kind };
    if (stack) fields.stack = stack;
    if (context.scene) fields.scene = context.scene.slice(0, 48);
    if (typeof context.wave === "number") fields.wave = context.wave;
    if (context.rid) fields.rid = context.rid;
    this.options.send(fields);
    return true;
  }
}

// --- kosu ---------------------------------------------------------------------------

/** Kosu izinin okudugu snapshot alanlari (`GameSnapshot`un alt kumesi). */
export type RunSnapshotLike = {
  result?: string;
  setupPhase?: boolean;
  stage?: number;
  creative?: boolean;
  team: { wave: number; health: number; maxHealth: number };
  players: ReadonlyArray<{
    id: string;
    slot?: number;
    gold: number;
    goldSpent: number;
    ownedCardIds?: readonly string[];
    ownedShopItemIds?: readonly string[];
  }>;
  towers: ReadonlyArray<{ id: string; ownerId: string; definitionId: string; level: number; equippedShopItemIds?: readonly string[] }>;
};

/** Sahnenin maca baglanirken bildigi: oda, kip, operator. */
export type RunAttachment = {
  roomId?: string;
  online: boolean;
  creative: boolean;
  resumed: boolean;
  operator: string;
};

/** Kosu sonu raporunun telemetri olmadan once tutulan hali; `buildRunEndFields` bunu okuyor. */
export type RunEndState = {
  rid: string;
  mode: "solo" | "coop" | "creative";
  stage?: number;
  op: string;
  players: number;
  wave: number;
  durationMs: number;
  hp?: number;
  maxHp?: number;
  slot: number;
  cards: readonly string[];
  items: readonly string[];
  equipped: readonly string[];
  towers: ReadonlyArray<{ id: string; lvl: number }>;
  goldLeft?: number;
  goldSpent?: number;
  pingAvg?: number;
  pingMax?: number;
  fpsAvg?: number;
};

const MAX_LIST = 80;
const MAX_TOWERS = 60;

/**
 * `run_end` alanlari. Kosu raporu (`RunSummary`, kosu defterinden) varsa
 * sonuc, dalga, kartlar, oldurme ve sizinti oradan; yoksa (rapor gelmedi ya
 * da birakildi) sahnenin son snapshot'tan tuttugu degerler.
 */
export function buildRunEndFields(state: RunEndState, outcome: "win" | "loss" | "abandoned", run?: RunSummary): TelemetryFields {
  const runPlayer = run?.players.find((player) => player.slot === state.slot);
  const fields: TelemetryFields = {
    rid: state.rid,
    outcome,
    mode: run?.creative ? "creative" : state.mode,
    op: runPlayer?.characterId ?? state.op,
    players: run?.playerCount ?? state.players,
    wave: run?.wave ?? state.wave,
    dur: Math.max(0, Math.round(state.durationMs / 1000)),
    cards: [...(runPlayer?.cards ?? state.cards)].slice(0, MAX_LIST),
    items: [...state.items].slice(0, MAX_LIST),
    equipped: [...state.equipped].slice(0, MAX_LIST),
    towers: state.towers.slice(0, MAX_TOWERS).map((tower) => ({ id: tower.id, lvl: tower.lvl }))
  };
  const stage = run?.stage ?? state.stage;
  if (typeof stage === "number") fields.stage = stage;
  if (typeof state.hp === "number") fields.hp = Math.max(0, Math.round(state.hp));
  if (typeof state.maxHp === "number") fields.maxHp = Math.max(0, Math.round(state.maxHp));
  if (typeof state.goldLeft === "number") fields.goldLeft = Math.max(0, Math.round(state.goldLeft));
  if (typeof state.goldSpent === "number") fields.goldSpent = Math.max(0, Math.round(state.goldSpent));
  if (typeof state.pingAvg === "number") fields.pingAvg = state.pingAvg;
  if (typeof state.pingMax === "number") fields.pingMax = state.pingMax;
  if (typeof state.fpsAvg === "number") fields.fpsAvg = state.fpsAvg;
  if (run) {
    fields.kills = run.kills;
    fields.leaks = run.leaks;
    fields.srid = run.id;
  }
  return fields;
}

type PerfWindow = {
  wave: number;
  combatMs: number;
  frames: number;
  secondFrames: number;
  secondMs: number;
  minFps?: number;
  pingSum: number;
  pingCount: number;
  pingMax: number;
  tickSum: number;
  tickCount: number;
  tickMax: number;
};

const emptyWindow = (wave: number): PerfWindow => ({
  wave, combatMs: 0, frames: 0, secondFrames: 0, secondMs: 0, pingSum: 0, pingCount: 0, pingMax: 0, tickSum: 0, tickCount: 0, tickMax: 0
});

/** Kosu raporu gelmediyse sonuc bu kadar bekleyip raporsuz gidiyor. */
export const RUN_END_REPORT_WAIT_MS = 4000;
/** Bir kareden uzun aralik (sekme arkadaydi) FPS'e sayilmiyor. */
const MAX_FRAME_GAP_MS = 1000;

export type RunTelemetryOptions = {
  now?: () => number;
  storage?: StorageLike;
  generateId?: () => string;
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
};

/**
 * Bir kosunun telemetrisi: baslangic, dalga basina performans, sonuc ve birakma.
 *
 * Sahne yalnizca olgulari bildiriyor (snapshot, ping, kare, sonuc); olaylari
 * burasi uretiyor. Telemetri baglanmadiysa (gelistirme sahnesi, galeri, ayar
 * kapali) `track` bos ve her sey ucuz bir kayittan ibaret.
 *
 * Kosu ilk *sonucsuz* snapshot'la basliyor: mac bittikten sonra odaya giren
 * istemci kosu baslatmiyor (sahnenin `liveSnapshotSeen` kurali).
 */
export class RunTelemetry {
  private track: (type: TelemetryEventType, fields: TelemetryFields) => void = () => {};
  private readonly now: () => number;
  private readonly storage?: StorageLike;
  private readonly generateId: () => string;
  private readonly schedule: (callback: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private attachment?: RunAttachment;
  private rid?: string;
  private startedAt = 0;
  private ended = false;
  private hiddenReported = false;
  private pendingOutcome?: "win" | "loss";
  private pendingTimer?: unknown;
  private mode: "solo" | "coop" | "creative" = "solo";
  private stage?: number;
  private players = 1;
  private wave = 0;
  private combat = false;
  private hp?: number;
  private maxHp?: number;
  private slot = 0;
  private gold?: number;
  private goldSpent?: number;
  private cards: readonly string[] = [];
  private items: readonly string[] = [];
  private readonly equipped = new Set<string>();
  private readonly towerLevels = new Map<string, { id: string; lvl: number }>();
  private lastTowerScanAt = Number.NEGATIVE_INFINITY;
  private lastTowers: RunSnapshotLike["towers"] = [];
  private lastLocalId?: string;
  private lastFrameAt?: number;
  private perfWindow = emptyWindow(0);
  private runFrames = 0;
  private runFrameMs = 0;
  private runPingSum = 0;
  private runPingCount = 0;
  private runPingMax = 0;

  constructor(options: RunTelemetryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.storage = options.storage ?? browserStorage("sessionStorage");
    this.generateId = options.generateId ?? (() => randomId().replace(/-/g, "").slice(0, 16));
    this.schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
    this.cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  bind(track: (type: TelemetryEventType, fields: TelemetryFields) => void) {
    this.track = track;
  }

  get runId() {
    return this.ended ? undefined : this.rid;
  }

  get currentWave() {
    return this.rid ? this.wave : undefined;
  }

  get active() {
    return Boolean(this.rid) && !this.ended;
  }

  /** Sahne odaya baglandi; kosu ilk canli snapshot'ta basliyor. */
  attach(attachment: RunAttachment) {
    if (this.rid && !this.ended && attachment.roomId && attachment.roomId === this.attachment?.roomId) return;
    this.reset();
    this.attachment = attachment;
  }

  noteSnapshot(snapshot: RunSnapshotLike, localSessionId: string | undefined) {
    if (!this.attachment || this.ended) return;
    if (!this.rid) {
      if (snapshot.result) return;
      this.start(snapshot);
    }
    if (snapshot.result) return;
    const wave = snapshot.team.wave;
    if (wave !== this.perfWindow.wave) {
      this.emitPerf();
      this.perfWindow = emptyWindow(wave);
    }
    this.wave = wave;
    this.combat = !snapshot.setupPhase;
    this.hp = snapshot.team.health;
    this.maxHp = snapshot.team.maxHealth;
    if (typeof snapshot.stage === "number") this.stage = snapshot.stage;
    if (snapshot.creative) this.mode = "creative";
    this.players = Math.max(1, snapshot.players.length);
    const local = localSessionId ? snapshot.players.find((player) => player.id === localSessionId) : undefined;
    if (local) {
      this.slot = typeof local.slot === "number" ? local.slot : 0;
      this.gold = local.gold;
      this.goldSpent = local.goldSpent;
      this.cards = local.ownedCardIds ?? [];
      this.items = local.ownedShopItemIds ?? [];
    }
    // Kuleler saniyede bir taraniyor (snapshot cok daha sik geliyor); son
    // snapshot kosu biterken bir kez daha taraniyor ki son alim kacmasin.
    this.lastTowers = snapshot.towers;
    this.lastLocalId = localSessionId;
    const now = this.now();
    if (now - this.lastTowerScanAt >= 1000) {
      this.lastTowerScanAt = now;
      this.scanTowers();
    }
  }

  /** Her kare (`performance.now()`); yalnizca savas sirasinda sayiliyor. */
  noteFrame(now: number) {
    const last = this.lastFrameAt;
    this.lastFrameAt = now;
    if (!this.active || !this.combat || last === undefined) return;
    const gap = now - last;
    if (!(gap > 0) || gap > MAX_FRAME_GAP_MS) return;
    const w = this.perfWindow;
    w.frames += 1;
    w.combatMs += gap;
    w.secondFrames += 1;
    w.secondMs += gap;
    this.runFrames += 1;
    this.runFrameMs += gap;
    if (w.secondMs >= 1000) {
      const fps = (w.secondFrames * 1000) / w.secondMs;
      w.minFps = w.minFps === undefined ? fps : Math.min(w.minFps, fps);
      w.secondFrames = 0;
      w.secondMs = 0;
    }
  }

  notePing(ms: number) {
    if (!this.active || !Number.isFinite(ms) || ms < 0) return;
    const value = Math.round(ms);
    this.runPingSum += value;
    this.runPingCount += 1;
    this.runPingMax = Math.max(this.runPingMax, value);
    if (!this.combat) return;
    this.perfWindow.pingSum += value;
    this.perfWindow.pingCount += 1;
    this.perfWindow.pingMax = Math.max(this.perfWindow.pingMax, value);
  }

  noteServerTick(tickMs: number | undefined, tickMaxMs: number | undefined) {
    if (!this.active || !this.combat) return;
    if (typeof tickMs === "number" && Number.isFinite(tickMs)) {
      this.perfWindow.tickSum += tickMs;
      this.perfWindow.tickCount += 1;
    }
    if (typeof tickMaxMs === "number" && Number.isFinite(tickMaxMs)) this.perfWindow.tickMax = Math.max(this.perfWindow.tickMax, tickMaxMs);
  }

  /**
   * Mac sonucu. Sonuc birden cok yoldan ve tekrar tekrar geliyor; rapor
   * (`run`) varsa hemen, yoksa kisa bir bekleyisten sonra raporsuz gidiyor.
   */
  end(result: "victory" | "defeat", run?: RunSummary) {
    if (!this.rid || this.ended) return;
    this.pendingOutcome = result === "victory" ? "win" : "loss";
    if (run) {
      this.finish(this.pendingOutcome, run);
      return;
    }
    if (this.pendingTimer === undefined) {
      this.pendingTimer = this.schedule(() => {
        this.pendingTimer = undefined;
        if (this.pendingOutcome && !this.ended) this.finish(this.pendingOutcome);
      }, RUN_END_REPORT_WAIT_MS);
    }
  }

  /** Sekme gizlendi: kosu suruyorsa bir kez `abandon` (gizlenme). Kosu bitmiyor. */
  hidden() {
    if (!this.active || this.pendingOutcome || this.hiddenReported) return;
    this.hiddenReported = true;
    this.track("abandon", this.abandonFields("hidden"));
  }

  /**
   * Sayfa kapaniyor ya da sahne birakiliyor. Bekleyen sonuc varsa simdi
   * gidiyor; yoksa kosu birakilmis sayiliyor.
   */
  leave(reason: "closed" | "menu") {
    if (!this.active) return;
    if (this.pendingOutcome) {
      this.finish(this.pendingOutcome);
      return;
    }
    this.track("abandon", this.abandonFields(reason));
    this.finish("abandoned");
  }

  reset() {
    if (this.pendingTimer !== undefined) this.cancel(this.pendingTimer);
    this.pendingTimer = undefined;
    this.attachment = undefined;
    this.rid = undefined;
    this.ended = false;
    this.hiddenReported = false;
    this.pendingOutcome = undefined;
    this.mode = "solo";
    this.stage = undefined;
    this.players = 1;
    this.wave = 0;
    this.combat = false;
    this.hp = undefined;
    this.maxHp = undefined;
    this.slot = 0;
    this.gold = undefined;
    this.goldSpent = undefined;
    this.cards = [];
    this.items = [];
    this.equipped.clear();
    this.towerLevels.clear();
    this.lastTowerScanAt = Number.NEGATIVE_INFINITY;
    this.lastTowers = [];
    this.lastLocalId = undefined;
    this.perfWindow = emptyWindow(0);
    this.runFrames = 0;
    this.runFrameMs = 0;
    this.runPingSum = 0;
    this.runPingCount = 0;
    this.runPingMax = 0;
  }

  private start(snapshot: RunSnapshotLike) {
    const attachment = this.attachment!;
    const saved = this.readSavedRun(attachment.roomId);
    this.rid = saved?.rid ?? this.generateId();
    this.startedAt = saved?.startedAt ?? this.now();
    this.mode = attachment.creative || snapshot.creative ? "creative" : attachment.online || snapshot.players.length > 1 ? "coop" : "solo";
    this.stage = snapshot.stage;
    this.players = Math.max(1, snapshot.players.length);
    this.wave = snapshot.team.wave;
    this.perfWindow = emptyWindow(snapshot.team.wave);
    this.saveRun(attachment.roomId);
    const fields: TelemetryFields = { rid: this.rid, mode: this.mode, op: attachment.operator, players: this.players, resumed: Boolean(saved) || attachment.resumed };
    if (typeof this.stage === "number") fields.stage = this.stage;
    this.track("run_start", fields);
  }

  private finish(outcome: "win" | "loss" | "abandoned", run?: RunSummary) {
    if (!this.rid || this.ended) return;
    if (this.pendingTimer !== undefined) this.cancel(this.pendingTimer);
    this.pendingTimer = undefined;
    this.emitPerf();
    this.scanTowers();
    this.track("run_end", buildRunEndFields(this.endState(), outcome, run));
    this.ended = true;
    // Birakilan kosu yeniden yuklemede ayni kimlikle devam edebilir; biten kosu edemez.
    if (outcome !== "abandoned") this.clearSavedRun();
  }

  /** Yerel oyuncunun kuleleri: her kulenin en yuksek seviyesi ve takili esyalar. */
  private scanTowers() {
    const localId = this.lastLocalId;
    if (!localId) return;
    for (const tower of this.lastTowers) {
      if (tower.ownerId !== localId) continue;
      const known = this.towerLevels.get(tower.id);
      if (!known) {
        if (this.towerLevels.size < MAX_TOWERS) this.towerLevels.set(tower.id, { id: tower.definitionId, lvl: tower.level });
      } else if (tower.level > known.lvl) {
        known.lvl = tower.level;
      }
      for (const itemId of tower.equippedShopItemIds ?? []) {
        if (this.equipped.size < MAX_LIST) this.equipped.add(itemId);
      }
    }
  }

  private endState(): RunEndState {
    return {
      rid: this.rid!,
      mode: this.mode,
      stage: this.stage,
      op: this.attachment?.operator ?? "unknown",
      players: this.players,
      wave: this.wave,
      durationMs: this.now() - this.startedAt,
      hp: this.hp,
      maxHp: this.maxHp,
      slot: this.slot,
      cards: this.cards,
      items: this.items,
      equipped: [...this.equipped],
      towers: [...this.towerLevels.values()],
      goldLeft: this.gold,
      goldSpent: this.goldSpent,
      pingAvg: this.runPingCount > 0 ? Math.round(this.runPingSum / this.runPingCount) : undefined,
      pingMax: this.runPingCount > 0 ? this.runPingMax : undefined,
      fpsAvg: this.runFrameMs > 0 ? Math.round((this.runFrames * 1000 * 10) / this.runFrameMs) / 10 : undefined
    };
  }

  private abandonFields(reason: "hidden" | "closed" | "menu"): TelemetryFields {
    const fields: TelemetryFields = {
      rid: this.rid,
      wave: this.wave,
      reason,
      dur: Math.max(0, Math.round((this.now() - this.startedAt) / 1000)),
      mode: this.mode,
      op: this.attachment?.operator
    };
    if (typeof this.stage === "number") fields.stage = this.stage;
    return fields;
  }

  /** Bitmekte olan dalganin performans ozeti; olcum yoksa olay yok. */
  private emitPerf() {
    const w = this.perfWindow;
    if (!this.rid || (w.frames === 0 && w.pingCount === 0 && w.tickCount === 0)) return;
    const fields: TelemetryFields = { rid: this.rid, wave: w.wave, dur: Math.round(w.combatMs / 1000) };
    if (typeof this.stage === "number") fields.stage = this.stage;
    if (w.combatMs > 0) fields.fpsAvg = Math.round((w.frames * 1000 * 10) / w.combatMs) / 10;
    // Kapanmamis son saniye de en az yarim saniyeyse (ya da baska olcum yoksa) sayiliyor.
    const partial = w.secondMs > 0 && (w.secondMs >= 500 || w.minFps === undefined) ? (w.secondFrames * 1000) / w.secondMs : undefined;
    const minFps = w.minFps === undefined ? partial : partial === undefined ? w.minFps : Math.min(w.minFps, partial);
    if (minFps !== undefined) fields.fpsMin = Math.round(minFps * 10) / 10;
    if (w.pingCount > 0) {
      fields.pingAvg = Math.round(w.pingSum / w.pingCount);
      fields.pingMax = w.pingMax;
    }
    if (w.tickCount > 0) {
      fields.tickAvg = Math.round((w.tickSum / w.tickCount) * 100) / 100;
      fields.tickMax = Math.round(w.tickMax * 100) / 100;
    }
    this.track("perf", fields);
    this.perfWindow = emptyWindow(w.wave);
  }

  private readSavedRun(roomId: string | undefined) {
    if (!roomId) return undefined;
    try {
      const raw = this.storage?.getItem(TELEMETRY_RUN_KEY);
      const saved = raw ? JSON.parse(raw) as { roomId?: unknown; rid?: unknown; startedAt?: unknown } : undefined;
      if (saved?.roomId === roomId && typeof saved.rid === "string" && /^[A-Za-z0-9]{6,40}$/.test(saved.rid) && typeof saved.startedAt === "number") {
        return { rid: saved.rid, startedAt: saved.startedAt };
      }
    } catch {
      // Bozuk kayit: yeni kosu.
    }
    return undefined;
  }

  private saveRun(roomId: string | undefined) {
    if (!roomId) return;
    try {
      this.storage?.setItem(TELEMETRY_RUN_KEY, JSON.stringify({ roomId, rid: this.rid, startedAt: this.startedAt }));
    } catch {
      // Yazilamadi: yenilemede yeni kosu kimligi.
    }
  }

  private clearSavedRun() {
    try {
      this.storage?.removeItem(TELEMETRY_RUN_KEY);
    } catch {
      // Silinecek bir sey yok.
    }
  }
}

/**
 * Sahnenin kullandigi tekil nesneler. Telemetri baslatilmadiysa (`telemetry-boot`)
 * kosu izi bos bir `track`a yaziyor ve hata raporlayici yok.
 */
export const runTelemetry = new RunTelemetry();
let activeErrorReporter: ErrorReporter | undefined;

export function setActiveErrorReporter(reporter: ErrorReporter | undefined) {
  activeErrorReporter = reporter;
}

/** Yakalanmis ama raporlanmaya deger hata (baglanti hatasi gibi). */
export function reportTelemetryError(error: unknown, kind: ErrorKind = "error") {
  try {
    activeErrorReporter?.report(error, kind);
  } catch {
    // Raporlama oyunu asla bozmamali.
  }
}
