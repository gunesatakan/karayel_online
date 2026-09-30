import { KILL_STREAK_BUFF_DURATION_MS, getKillStreakRule, getWaveSpawnIntervalMs, type KillStreakTier } from "../balance/index.js";
import { countsAsTower, occupiesTowerSlot, towerCatalog } from "../characters/index.js";
import type { TowerSnapshot } from "../index.js";
import { isOperationalTower } from "../tower-rules.js";
import { GAME_SPEED_MULTIPLIER } from "../tower-stats/index.js";

/**
 * Canli kombo, gorunur seri gucu ve seri afisinin sirasi.
 *
 * Sunucu serisi (5 oldurme / 2 sn ve ustu) gercek bir guc veriyor ama dalga
 * basina 0-3 kez cikiyor ve erken dalgalarda dogum temposu esige hic
 * yetismiyor: seri oyuncuya "birden oldu" gibi geliyor, kurulmus gibi degil.
 * Kombo bu boslugu kozmetik olarak dolduruyor -- oyuna hicbir etkisi yok,
 * esikler degismiyor, yalnizca oyuncunun kendi oldurme temposunu gosteriyor.
 *
 * Seri geldiginde gucu artik gorunuyor: afisin ikinci satiri buff'i
 * sunucunun kendi tablosundan yaziyor, sahibinin kuleleri buff'in gercek
 * suresi boyunca parliyor. Co-op'ta afisler birbirini silmiyor, sirayla
 * geliyor; takim arkadasinin serisi senin ekranini ele gecirmiyor.
 *
 * Saf mantik: saat disaridan veriliyor, cizim istemcide (hap ve yan toast:
 * apps/web/src/game-control-ui.ts, afis ve parlama: GameScene).
 */

/** Kombo penceresi: guncel dogum araliginin bu kati icinde gelen oldurme komboyu surduruyor. */
export const COMBO_WINDOW_SPAWN_INTERVALS = 2;
/** Hap bu sayidan itibaren gorunuyor; iki oldurme ust uste henuz tesaduf. */
export const COMBO_VISIBLE_MIN = 3;
/** Renk ve buyume burada doyuyor (×8); hap yine gercek sayiyi yaziyor. */
export const COMBO_HEAT_MAX = 8;
/** "ÇİFT!" / "ÜÇLÜ!": ilk oldurmeden bu kadar ms icinde gelenler tek patlama. */
export const MULTI_KILL_WINDOW_MS = 350;
/** Patlama etiketinin hapta kaldigi sure. */
export const MULTI_KILL_LABEL_MS = 900;
/**
 * Snapshot'tan bu kadar eski oldurme olayi komboya sayilmiyor.
 *
 * Normalde olay yazildigi adimdan sonraki ilk snapshot'ta (60 ms) geliyor.
 * Yeniden baglanan ya da arka plandan donen istemci ise son 2.2 sn'nin
 * olaylarini bir anda aliyor; onlari saymak hic gorulmemis bir komboyu
 * "×7" diye acardi.
 */
export const COMBO_STALE_EVENT_MS = 400;

/** Dogum araligi gercek saatte: sunucu oyun zamanini 0.8 hizla isletiyor. */
export function getWaveSpawnIntervalRealMs(wave: number) {
  return getWaveSpawnIntervalMs(wave) / GAME_SPEED_MULTIPLIER;
}

/**
 * Iki oldurme arasinda komboyu koparmayan en uzun sure.
 *
 * Tempoya bagli: 1. dalgada ~2.4 sn, 20. dalgada ~0.8 sn. Sabit bir pencere
 * ilk dalgalarda hic dolmaz, son dalgalarda hic kopmazdi.
 */
export function getComboWindowMs(wave: number) {
  return COMBO_WINDOW_SPAWN_INTERVALS * getWaveSpawnIntervalRealMs(wave);
}

/** Hapin sicaklik basamagi: ×3'te 0, ×8 ve ustunde en sicak. */
export function getComboHeat(count: number) {
  const span = COMBO_HEAT_MAX - COMBO_VISIBLE_MIN;
  if (!Number.isFinite(count)) {
    return 0;
  }
  return Math.max(0, Math.min(span, Math.floor(count) - COMBO_VISIBLE_MIN));
}

/** Patlamanin adi; tek oldurme patlama degil. Dort ve ustu "ÇOKLU": "ÜÇLÜ" yalan olurdu. */
export function getMultiKillLabel(burst: number) {
  if (burst >= 4) return "ÇOKLU!";
  if (burst === 3) return "ÜÇLÜ!";
  if (burst === 2) return "ÇİFT!";
  return undefined;
}

export function isStaleKillEvent(eventServerTime: number, snapshotServerTime: number) {
  return snapshotServerTime - eventServerTime > COMBO_STALE_EVENT_MS;
}

/** HUD'daki hapin tek seferlik durumu. */
export type ComboHudState = {
  /** Gercek oldurme sayisi; renk ve boy ×8'de doysa da sayi dogru kalir. */
  count: number;
  /** Takimin ortak kombosu (soluk): senin kendi kombon yokken. */
  team: boolean;
  /** 0-5 sicaklik basamagi. */
  heat: number;
  /** Kombonun kopacagi ana kalan sure; hap bu kadar sonra kalkar. */
  durationMs: number;
  /** Sayi senin oldurmenle artti: hap bir kez atar. */
  pop: boolean;
  /** Yeni patlama etiketi ("ÇİFT!"); yoksa hapta varsa kendi suresini doldurur. */
  multi?: string;
  multiMs?: number;
};

type Chain = { count: number; lastAt: number; burst: number; burstStartAt: number };

function createChain(): Chain {
  return { count: 0, lastAt: Number.NEGATIVE_INFINITY, burst: 0, burstStartAt: Number.NEGATIVE_INFINITY };
}

function advanceChain(chain: Chain, at: number, windowMs: number) {
  chain.count = chain.count > 0 && at - chain.lastAt <= windowMs ? chain.count + 1 : 1;
  if (chain.count > 1 && at - chain.burstStartAt <= MULTI_KILL_WINDOW_MS) {
    chain.burst += 1;
  } else {
    chain.burst = 1;
    chain.burstStartAt = at;
  }
  chain.lastAt = Math.max(chain.lastAt, at);
}

/**
 * Oldurme kombosu: yerel oyuncunun kendi zinciri ve takimin ortak zinciri.
 *
 * Zaman sunucunun oldurme anindan (`serverTime`): ayni snapshot'ta gelen uc
 * oldurme istemcide ayni karede islense de gercekte 60 ms'ye yayilmis olabilir,
 * ya da tam tersi. Varis ani saymak sahte "ÜÇLÜ!" uretirdi.
 *
 * Takim zinciri co-op'ta arkada kalan oyuncu icin: son vuruslar one kuran
 * oyuncuya gidiyor (olculdu: 3-8. dalgada %85-100), arkadaki kendi kombosunu
 * neredeyse hic goremiyor. Kendi kombon varken hep o gorunuyor.
 */
export class KillComboWatch {
  private own = createChain();
  private team = createChain();
  private pendingMulti?: string;
  private multiUntil = Number.NEGATIVE_INFINITY;
  private ownPop = false;

  /**
   * Bir oldurme. Yerel oyuncununsa kendi zincirindeki sirasini (1'den)
   * donduruyor: oldurme sesinin perdesi ayni sayiyla yukseliyor.
   */
  record(at: number, own: boolean, windowMs: number) {
    advanceChain(this.team, at, windowMs);
    if (!own) {
      return undefined;
    }
    const previousBurst = this.own.burst;
    advanceChain(this.own, at, windowMs);
    if (this.own.count >= COMBO_VISIBLE_MIN) {
      this.ownPop = true;
    }
    const label = this.own.burst > previousBurst ? getMultiKillLabel(this.own.burst) : undefined;
    if (label) {
      this.pendingMulti = label;
      this.multiUntil = at + MULTI_KILL_LABEL_MS;
    }
    return this.own.count;
  }

  /**
   * Bir snapshot'in oldurmeleri islendikten sonra hapin durumu; `undefined`
   * ise hap kalkmali. Etiket ve atim bir kez veriliyor, sonraki cagrilarda
   * tekrar edilmiyor.
   */
  getHudState(now: number, windowMs: number, coop: boolean): ComboHudState | undefined {
    const multi = this.pendingMulti;
    const pop = this.ownPop;
    this.pendingMulti = undefined;
    this.ownPop = false;

    const ownRemaining = this.own.count >= COMBO_VISIBLE_MIN ? this.own.lastAt + windowMs - now : 0;
    // Etiket yalnizca kendi patlamasinin zincirinde: zincir koptuysa (son
    // dalgalarda pencere etiketten kisa) "×1 ÇİFT!" gosterilmemeli.
    const multiRemaining = this.own.count >= 2 ? this.multiUntil - now : 0;
    if (ownRemaining > 0 || multiRemaining > 0) {
      return {
        count: this.own.count,
        team: false,
        heat: getComboHeat(this.own.count),
        durationMs: Math.max(ownRemaining, multiRemaining),
        pop,
        ...(multi ? { multi, multiMs: Math.max(0, multiRemaining) } : {})
      };
    }

    if (coop && this.team.count >= COMBO_VISIBLE_MIN) {
      const teamRemaining = this.team.lastAt + windowMs - now;
      if (teamRemaining > 0) {
        // Soluk ve sakin: takimin sayisi saniyede birkac kez artabiliyor,
        // her artista atan bir hap senin olmayan bir seye goz cekerdi.
        return { count: this.team.count, team: true, heat: getComboHeat(this.team.count), durationMs: teamRemaining, pop: false };
      }
    }
    return undefined;
  }

  reset() {
    this.own = createChain();
    this.team = createChain();
    this.pendingMulti = undefined;
    this.multiUntil = Number.NEGATIVE_INFINITY;
    this.ownPop = false;
  }
}

/** Seri buff'inin gercek saatteki suresi: 3000 oyun-ms = 3750 ms. Kule parlamasi bu kadar suruyor. */
export function getKillStreakBuffRealMs() {
  return KILL_STREAK_BUFF_DURATION_MS / GAME_SPEED_MULTIPLIER;
}

function formatSeconds(ms: number) {
  const seconds = ms / 1000;
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1).replace(".", ",");
}

/**
 * Afisin ikinci satiri: serinin verdigi gercek guc ("+%20 hasar · 3 sn").
 *
 * Sayilar sunucunun kademe tablosundan (`KILL_STREAK_RULES`), elle
 * yazilmiyor. Sure oyun saniyesiyle, kart ve beceri metinleri gibi; kulenin
 * parlamasi ise gercek saatle (`getKillStreakBuffRealMs`) suruyor.
 */
export function getKillStreakBuffText(tier: KillStreakTier) {
  const rule = getKillStreakRule(tier);
  if (!rule) {
    return "";
  }
  const parts: string[] = [];
  if (rule.damageMultiplier > 1) {
    parts.push(`+%${Math.round((rule.damageMultiplier - 1) * 100)} hasar`);
  }
  if (rule.hasteMultiplier > 1) {
    parts.push(`+%${Math.round((rule.hasteMultiplier - 1) * 100)} atış hızı`);
  }
  if (rule.fearAllMs > 0) {
    parts.push("düşmanlar korkar");
  }
  parts.push(`${formatSeconds(KILL_STREAK_BUFF_DURATION_MS)} sn`);
  return parts.join(" · ");
}

export type StreakBuffTower = Pick<TowerSnapshot, "id" | "ownerId" | "characterId" | "definitionId">;

/**
 * Serinin gucunu gercekten kullanan kuleler: sahibinin ates eden kuleleri.
 *
 * Sunucu buff'i sahibinin butun kayitlarina yaziyor ama duvar, onarim deposu,
 * kaynak binasi ve kenara kurulan Abarti hic ates etmiyor; onlarin parlamasi
 * olmayan bir gucu gosterirdi. Kurulus ani sunucudakiyle ayni: seri anindaki
 * kuleler.
 */
export function getStreakBuffedTowerIds(towers: Iterable<StreakBuffTower>, ownerId: string | undefined) {
  if (!ownerId) {
    return [];
  }
  const ids: string[] = [];
  for (const tower of towers) {
    if (tower.ownerId !== ownerId) {
      continue;
    }
    const definition = towerCatalog[tower.characterId]?.find((candidate) => candidate.id === tower.definitionId);
    if (definition && countsAsTower(definition) && occupiesTowerSlot(definition) && isOperationalTower(definition)) {
      ids.push(tower.id);
    }
  }
  return ids;
}

/** Kule parlamasinin yumusak girisi ve cikisi. */
export const STREAK_GLOW_FADE_IN_MS = 180;
export const STREAK_GLOW_FADE_OUT_MS = 600;

/** Parlamanin opakligi (0-1): girer, buff boyunca durur, son 600 ms'de soner. */
export function getStreakGlowAlpha(elapsedMs: number, remainingMs: number) {
  if (!(remainingMs > 0)) {
    return 0;
  }
  const fadeIn = Math.min(1, Math.max(0, elapsedMs) / STREAK_GLOW_FADE_IN_MS);
  const fadeOut = Math.min(1, remainingMs / STREAK_GLOW_FADE_OUT_MS);
  return Math.min(fadeIn, fadeOut);
}

/** Siradaki afis bekliyorsa ekrandaki bu kadar kaldiktan sonra yer aciyor. */
export const STREAK_BANNER_MIN_VISIBLE_MS = 1100;
/** Bekleyen afis sayisi; fazlasi en eskiden dusuyor (kademeler yukseliyor). */
export const STREAK_BANNER_QUEUE_LIMIT = 2;
/** Yer acan afisin hizli cikisi. */
export const STREAK_BANNER_HANDOFF_MS = 260;

/**
 * Seri afislerinin sirasi.
 *
 * Yeni afis eskiden ekrandakini aninda siliyordu. Artik siraya giriyor ve
 * ekrandaki afis en az `STREAK_BANNER_MIN_VISIBLE_MS` kaldiktan sonra hizli
 * bir cikisla yer aciyor. Buff'in suresi gecmis bir afis gosterilmiyor:
 * "+%20 hasar · 3 sn" o an artik dogru degil, kuleler de sonmus olur.
 */
export class StreakBannerQueue<T> {
  private activeSince?: number;
  private waiting: Array<{ item: T; at: number }> = [];

  constructor(private readonly maxWaitMs = getKillStreakBuffRealMs()) {}

  /** "show": hemen goster; "queued": ekrandaki afis `handoffAt`te yer acmali. */
  offer(item: T, now: number): "show" | "queued" {
    if (this.activeSince === undefined) {
      this.activeSince = now;
      return "show";
    }
    this.waiting.push({ item, at: now });
    while (this.waiting.length > STREAK_BANNER_QUEUE_LIMIT) {
      this.waiting.shift();
    }
    return "queued";
  }

  /** Bekleyen varsa ekrandaki afisin en erken cikabilecegi an. */
  handoffAt() {
    return this.activeSince === undefined || this.waiting.length === 0
      ? undefined
      : this.activeSince + STREAK_BANNER_MIN_VISIBLE_MS;
  }

  /** Ekrandaki afis bitti; siradaki (bayatlamamis) varsa o gosterilmeli. */
  finish(now: number): T | undefined {
    this.activeSince = undefined;
    while (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      if (now - next.at <= this.maxWaitMs) {
        this.activeSince = now;
        return next.item;
      }
    }
    return undefined;
  }

  get active() {
    return this.activeSince !== undefined;
  }

  get pending() {
    return this.waiting.length;
  }

  clear() {
    this.activeSince = undefined;
    this.waiting = [];
  }
}
