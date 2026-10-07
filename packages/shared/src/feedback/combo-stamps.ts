import { ONUR_LUCKY_WINDOW_MS } from "../characters/onur/passive/index.js";
import { lt } from "../i18n/index.js";

/**
 * Secili kombo damgalari: sonucu gercekten degistiren etkilesimler.
 *
 * Oyunda bircok kart ve kule birbirini besliyor ama cogu "birlikte" calistiginda
 * olculebilir bir fark yaratmiyor (Derin Dondurma + Kirilgan Buz ayni hasari
 * olctu). Her etkilesime damga basmak ekrani bir yazi yagmuruna cevirir ve
 * gercek anlari bogar. Burada yalnizca uc an var, hepsi sonucu degistiriyor:
 *
 * - `markOverdrive`: Takip isaretli dusmani Debug Lazer oldurdu ve lazer
 *   haritanin kenarina uzanan supurmeye gecti ("İŞARET → OVERDRIVE").
 * - `sweepKills`: o supurme bittiginde en az iki dusman oldurduyse sayisi
 *   ("Tarama: 3 öldü"). Tek oldurme zaten normal atisin isi; damga yok.
 * - `luckyWindow`: Onur'un kotu sans sayaci doldu ve sans penceresi acildi
 *   ("ŞANS PENCERESİ 10 sn"). Yalnizca kulenin sahibine.
 *
 * Sunucu her birini olay aninda bir kez yolluyor (tick'te veri yok) ve tur +
 * sahip basina 4 sn'de birden fazla yollamiyor; istemci ayrica ekranda en
 * fazla iki damga birakiyor. Saf mantik: saat disaridan veriliyor.
 */

export type ComboStampKind = "markOverdrive" | "sweepKills" | "luckyWindow";

export const COMBO_STAMP_KINDS: readonly ComboStampKind[] = ["markOverdrive", "sweepKills", "luckyWindow"];

/** `combo:stamp`. Konum kulenin dunya konumu: istemci kule silinmisse de damgayi yerine koyabilsin. */
export type ComboStampMessage = {
  kind: ComboStampKind;
  /** Kulenin sahibi (oturum kimligi): kendi damgan parlak, arkadasinki soluk. */
  ownerId: string;
  towerId: string;
  x: number;
  y: number;
  /** Yalnizca `sweepKills`: supurmenin oldurdugu dusman sayisi. */
  kills?: number;
};

/** Ayni tur ve ayni sahip icin iki damga arasi en kisa sure (gercek saat). */
export const COMBO_STAMP_GAP_MS = 4000;
/** Ekranda ayni anda canli en fazla kombo damgasi. */
export const COMBO_STAMP_MAX_LIVE = 2;
/** Damganin ekranda kaldigi sure; okunacak kadar uzun, bir sonrakini bekletmeyecek kadar kisa. */
export const COMBO_STAMP_LIFETIME_MS = 1600;
/** Supurme sonucunun damgalandigi en az oldurme. */
export const DEBUG_SWEEP_STAMP_MIN_KILLS = 2;

/** Sans penceresinin metindeki saniyesi; kural sabitinden, ikisi ayrismasin. */
export function getLuckyWindowSeconds() {
  return Math.round(ONUR_LUCKY_WINDOW_MS / 1000);
}

/** Damganin metni; gecersiz ya da esigin altindaki mesaj icin undefined. */
export function getComboStampText(message: Pick<ComboStampMessage, "kind" | "kills">): string | undefined {
  switch (message.kind) {
    case "markOverdrive":
      return lt("İŞARET → OVERDRIVE", "MARK → OVERDRIVE");
    case "sweepKills": {
      const kills = typeof message.kills === "number" && Number.isFinite(message.kills) ? Math.floor(message.kills) : 0;
      return kills >= DEBUG_SWEEP_STAMP_MIN_KILLS ? lt(`Tarama: ${kills} öldü`, `Sweep: ${kills} killed`) : undefined;
    }
    case "luckyWindow":
      return lt(`ŞANS PENCERESİ ${getLuckyWindowSeconds()} sn`, `LUCK WINDOW ${getLuckyWindowSeconds()} s`);
    default:
      return undefined;
  }
}

/** Telden gelen mesaji dogrular ve kopyalar; bozuk mesaj yok sayiliyor. */
export function sanitizeComboStampMessage(raw: unknown): ComboStampMessage | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const kind = source.kind;
  if (typeof kind !== "string" || !(COMBO_STAMP_KINDS as readonly string[]).includes(kind)) return undefined;
  if (typeof source.ownerId !== "string" || typeof source.towerId !== "string") return undefined;
  if (typeof source.x !== "number" || typeof source.y !== "number" || !Number.isFinite(source.x) || !Number.isFinite(source.y)) return undefined;
  const message: ComboStampMessage = { kind: kind as ComboStampKind, ownerId: source.ownerId, towerId: source.towerId, x: source.x, y: source.y };
  if (typeof source.kills === "number" && Number.isFinite(source.kills)) message.kills = Math.max(0, Math.floor(source.kills));
  return getComboStampText(message) ? message : undefined;
}

/**
 * Tur + sahip basina hiz siniri. Sunucu yollamadan once, istemci cizmeden
 * once soruyor: yeniden baglanma ya da ust uste tetik ayni haberi iki kez
 * vermesin.
 */
export class ComboStampThrottle {
  private readonly lastAt = new Map<string, number>();

  constructor(private readonly gapMs = COMBO_STAMP_GAP_MS) {}

  /** Gecebilirse kaydedip true; aralik dolmadiysa false (kayit degismiyor). */
  admit(kind: ComboStampKind, ownerId: string, now: number) {
    const key = `${kind}|${ownerId}`;
    const last = this.lastAt.get(key);
    if (last !== undefined && now - last < this.gapMs && now >= last) return false;
    this.lastAt.set(key, now);
    return true;
  }

  reset() {
    this.lastAt.clear();
  }
}

/**
 * Istemcinin kapisi: hiz siniri ve ekrandaki en fazla iki damga.
 *
 * Ucuncu damga en eskisini silmiyor, dusuyor: damga bir kutlama, uyari degil;
 * kaybolan biri oyuncuya bir sey kaybettirmiyor. Kapi saymayi yalnizca
 * gercekten cizilen damgalar icin yapsin diye cagiran `commit`i ayri cagiriyor.
 */
export class ComboStampGate {
  private readonly throttle: ComboStampThrottle;
  private readonly maxLive: number;
  private liveUntil: number[] = [];

  constructor(options: { gapMs?: number; maxLive?: number } = {}) {
    this.throttle = new ComboStampThrottle(options.gapMs ?? COMBO_STAMP_GAP_MS);
    this.maxLive = options.maxLive ?? COMBO_STAMP_MAX_LIVE;
  }

  /** Ekranda yer var ve hiz siniri geciyor mu; geciyorsa hiz sinirina yaziliyor. */
  admit(kind: ComboStampKind, ownerId: string, now: number) {
    this.liveUntil = this.liveUntil.filter((until) => until > now);
    if (this.liveUntil.length >= this.maxLive) return false;
    return this.throttle.admit(kind, ownerId, now);
  }

  /** Cizilen damga ekranda `lifetimeMs` boyunca yer tutuyor. */
  commit(now: number, lifetimeMs = COMBO_STAMP_LIFETIME_MS) {
    this.liveUntil.push(now + Math.max(1, lifetimeMs));
  }

  liveCount(now: number) {
    return this.liveUntil.filter((until) => until > now).length;
  }

  reset() {
    this.throttle.reset();
    this.liveUntil = [];
  }
}
