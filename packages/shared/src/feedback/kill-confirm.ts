import type { EnemyType } from "../index.js";
import { FEEDBACK_KIND_RULES } from "./index.js";

/**
 * Oldurme onayi: olum patlamasi ve vurus flasi.
 *
 * Oldurme oyunun en sik basari olayi (dakikada 22-30) ve dusman eskiden
 * yalnizca yok oluyordu: sprite havuza donuyor, geriye tek bir hasar sayisi
 * kaliyordu. Buradaki kurallar saf -- saat disaridan veriliyor, cizim
 * istemcide (apps/web/src/vfx/combat-vfx.ts) -- ki testler sureleri, kiymik
 * sayilarini ve flasin hiz sinirini dogrudan olcebilsin.
 *
 * Sizinti (nexusa ulasan dusman) patlamiyor. Istemci snapshot'tan dusen her
 * dusmanin izini kisa bir sure sakliyor; patlamayi yalnizca sunucunun oldurme
 * olayi o izi alarak baslatiyor. Sizintinin oldurme olayi olmadigi icin izi
 * kimse almiyor ve suresi dolunca siliniyor.
 */

/** Vurulan dusmanin beyaz flasi. */
export const ENEMY_HIT_FLASH_MS = 60;
/**
 * Ayni dusmanin iki flasi arasi en kisa sure.
 *
 * Surekli isin ve yanma altindaki dusman her snapshot'ta (60 ms) can
 * kaybediyor. 120 ms'de dusman saniyede ~8 kez duz beyaz yanip sonuyordu;
 * isiga duyarlilik siniri saniyede 3 flas. 334 ms o siniri tutuyor, tek tek
 * gelen vurus yine flas veriyor.
 */
export const ENEMY_HIT_FLASH_GAP_MS = 334;
/**
 * Bundan kucuk dusus vurus sayilmiyor.
 *
 * Can ara degerlemeyle kare kare iniyor; kucuk bir esik kayan nokta
 * gurultusunun flas baslatmasini onluyor, gercek vuruslar ise hep ustunde.
 */
const ENEMY_HIT_FLASH_MIN_DROP = 0.05;

/**
 * Kaldirilan dusmanin izi ne kadar yasiyor.
 *
 * Kaldirma ve oldurme olayi ayni snapshot'tan geliyor, yani ayni karede
 * isleniyor; iz aslinda tek kare yetiyor. Pay yavas bir kareye karsi. Uzun
 * tutmak yeniden baglanmada gelen eski oldurme olaylarina patlama actirirdi.
 */
export const ENEMY_TRACE_TTL_MS = 250;
/**
 * Ayni anda tutulan iz.
 *
 * Tek karede ulti 60'tan fazla dusman oldurebiliyor; sunucu da en fazla 80
 * oldurme olayi tasiyor. Sinir bellegi bagliyor, olaylari kesmiyor.
 */
export const ENEMY_TRACE_CAPACITY = 96;

export type DeathBurstShape = {
  /** Brute ve kusatma: daha agir patlama, kucuk kamera durtmesi. */
  heavy: boolean;
  durationMs: number;
  shards: number;
  /** Yere yatik toz halkasi; yalnizca agir dusmanda. */
  dustRing: boolean;
};

/** Govde once basiliyor (x1.3 / y0.6), sonra sonerek kayboluyor. */
export const DEATH_BURST_SQUASH = { scaleX: 1.3, scaleY: 0.6 } as const;
/** Basmanin bittigi an (surenin orani); gerisi sonme. */
export const DEATH_BURST_SQUASH_END = 0.3;
/** Beyaz cekirdegin sondugu an (surenin orani). */
const DEATH_BURST_FLASH_END = 0.25;

export function isHeavyEnemyType(type: EnemyType) {
  return type === "brute" || type === "siege";
}

/**
 * Olum patlamasinin bicimi.
 *
 * 180-220 ms: daha uzunu dalga ortasinda yeni dusmanlarin ustune biniyor,
 * daha kisasi telefonda fark edilmiyor. Agir dusman daha cok kiymik ve bir
 * toz halkasiyla daha sert "iniyor"; hepsinin rengi dusmanin kendi rengi.
 */
export function getDeathBurstShape(type: EnemyType): DeathBurstShape {
  return isHeavyEnemyType(type)
    ? { heavy: true, durationMs: 220, shards: 8, dustRing: true }
    : { heavy: false, durationMs: 190, shards: 5, dustRing: false };
}

export type DeathBurstPose = {
  scaleX: number;
  scaleY: number;
  /** Govdenin opakligi (0-1). */
  alpha: number;
  /** Beyaz cekirdegin opakligi (0-1); ilk anin "vurus" hissi. */
  flash: number;
};

/**
 * Govdenin tek karesi; `progress` surenin orani (0-1).
 *
 * Hareket azaltma aciksa (`still`) basma yok: govde yerinde ve boyunu
 * degistirmeden soner. Olum yine gorunuyor, yalnizca hareket etmiyor.
 */
export function getDeathBurstPose(progress: number, still: boolean): DeathBurstPose {
  const t = clampUnit(progress);
  const flash = (1 - Math.min(1, t / DEATH_BURST_FLASH_END)) ** 2;
  if (still) {
    return { scaleX: 1, scaleY: 1, alpha: 1 - t, flash };
  }
  if (t <= DEATH_BURST_SQUASH_END) {
    const u = t / DEATH_BURST_SQUASH_END;
    const eased = 1 - (1 - u) ** 2;
    return {
      scaleX: 1 + (DEATH_BURST_SQUASH.scaleX - 1) * eased,
      scaleY: 1 + (DEATH_BURST_SQUASH.scaleY - 1) * eased,
      alpha: 1,
      flash
    };
  }
  // Sonme: govde biraz daha yayilip yassilasiyor, yere cokuyormus gibi.
  const fade = (t - DEATH_BURST_SQUASH_END) / (1 - DEATH_BURST_SQUASH_END);
  return {
    scaleX: DEATH_BURST_SQUASH.scaleX + 0.1 * fade,
    scaleY: DEATH_BURST_SQUASH.scaleY * (1 - 0.35 * fade),
    alpha: (1 - fade) ** 1.6,
    flash
  };
}

/**
 * Oldurme olayinin yonetmendeki agirligi.
 *
 * Kamera durtmesi ve titresim yonetmende yalnizca yuksek agirlikta
 * (`impactMinWeight`) ve yalnizca yerel oyuncuda. Siradan oldurme dakikada
 * 22-30 kez geliyor; her birinde sallansa ekran hic durmazdi. Kritik
 * oldurme ya da agir dusman (brute, kusatma) tam agirlik: 1.5 px'lik kucuk
 * bir durtme ve kisa titresim. Kritik oldurmeyi istemci ayni snapshot'taki
 * kendi kritik son vurusundan (`c:1, k:1`) biliyor; oldurme olayi kritik
 * bayragi tasimiyor.
 */
export function getKillFeedbackWeight(type: EnemyType, critKill = false) {
  return critKill || isHeavyEnemyType(type) ? 1 : FEEDBACK_KIND_RULES.kill.defaultWeight;
}

/**
 * Bu karede vurus flasi baslasin mi.
 *
 * Kaynak dusmanin kendi cani + kalkani, bir onceki karedekiyle kiyasla:
 * hasar olayinin konumu titretilmis (sunucu sayilari dagitiyor) ve dusman
 * kimligi tasimiyor, yani sayidan dusman bulmak kalabalikta yanlis dusmani
 * yakardi. Can dususu ise tam o dusmanin.
 */
export function shouldStartEnemyHitFlash(
  previousEffectiveHp: number | undefined,
  effectiveHp: number,
  lastFlashAt: number | undefined,
  now: number
) {
  if (previousEffectiveHp === undefined || !Number.isFinite(effectiveHp)) {
    return false;
  }
  if (previousEffectiveHp - effectiveHp < ENEMY_HIT_FLASH_MIN_DROP) {
    return false;
  }
  return lastFlashAt === undefined || now - lastFlashAt >= ENEMY_HIT_FLASH_GAP_MS;
}

export function isEnemyHitFlashActive(lastFlashAt: number | undefined, now: number) {
  return lastFlashAt !== undefined && now - lastFlashAt >= 0 && now - lastFlashAt < ENEMY_HIT_FLASH_MS;
}

/**
 * Kaldirilan dusmanlarin kisa omurlu izi.
 *
 * Istemci snapshot'tan dusen dusmanin sprite'ini hemen havuza veriyor;
 * oldurme olayi ayni karede ama sonra isleniyor ve dusmanin yerini, boyunu,
 * rengini artik bulamiyordu. Iz tek kullanimlik: ayni olay iki kez
 * patlatmasin.
 */
export class RecentEnemyTraces<T> {
  private readonly traces = new Map<string, { trace: T; at: number }>();

  constructor(
    private readonly ttlMs = ENEMY_TRACE_TTL_MS,
    private readonly capacity = ENEMY_TRACE_CAPACITY
  ) {}

  get size() {
    return this.traces.size;
  }

  remember(id: string, trace: T, now: number) {
    // Silip yeniden yazmak sirayi zamana gore tutuyor; `prune` buna dayaniyor.
    this.traces.delete(id);
    this.traces.set(id, { trace, at: now });
    while (this.traces.size > this.capacity) {
      const oldest = this.traces.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.traces.delete(oldest);
    }
  }

  take(id: string, now: number): T | undefined {
    const entry = this.traces.get(id);
    if (!entry) {
      return undefined;
    }
    this.traces.delete(id);
    return now - entry.at <= this.ttlMs ? entry.trace : undefined;
  }

  prune(now: number) {
    for (const [id, entry] of this.traces) {
      if (now - entry.at <= this.ttlMs) {
        break;
      }
      this.traces.delete(id);
    }
  }

  clear() {
    this.traces.clear();
  }
}

/** Vurgunun en parlak kanali: koyu haritada kiymik okunsun. */
const ACCENT_PEAK = 235;
/** Bundan az doygun piksel govdenin koyu gri zirhi sayiliyor, renge katilmiyor. */
const ACCENT_MIN_CHROMA = 32;
const ACCENT_MIN_ALPHA = 128;
const ACCENT_HUE_BUCKETS = 12;

/**
 * Dokunun vurgu rengi: en genis alani kaplayan doygun renk tonu.
 *
 * Dusman gorselleri koyu bir zirh ve parlak bir vurgudan (kirmizi cekirdek,
 * mor kabuk, yesil goz) olusuyor. Duz ortalama ikisini camurlu bir griye
 * ceviriyordu; kiymik da gri kalip dusmana ait gorunmuyordu. Pikseller renk
 * tonuna gore kovalaniyor, doygunlukla tartiliyor, en agir kova (komsularin
 * yarisiyla, kirmizi 0/360 sinirinda bolunmesin) seciliyor ve parlakligi
 * yukseltiliyor. Hic doygun piksel yoksa (tas golem) `fallback`.
 *
 * `pixels` RGBA dizisi (getImageData.data); saf, testte sentetik dizi.
 */
export function pickAccentColor(pixels: ArrayLike<number>, fallback: number) {
  const weight = new Array<number>(ACCENT_HUE_BUCKETS).fill(0);
  const red = new Array<number>(ACCENT_HUE_BUCKETS).fill(0);
  const green = new Array<number>(ACCENT_HUE_BUCKETS).fill(0);
  const blue = new Array<number>(ACCENT_HUE_BUCKETS).fill(0);
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < ACCENT_MIN_ALPHA) {
      continue;
    }
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const max = Math.max(r, g, b);
    const chroma = max - Math.min(r, g, b);
    if (chroma < ACCENT_MIN_CHROMA) {
      continue;
    }
    const hue = max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
    const bucket = Math.min(ACCENT_HUE_BUCKETS - 1, Math.floor((hue / 6) * ACCENT_HUE_BUCKETS));
    weight[bucket] += chroma;
    red[bucket] += r * chroma;
    green[bucket] += g * chroma;
    blue[bucket] += b * chroma;
  }

  let best = -1;
  let bestScore = 0;
  for (let bucket = 0; bucket < ACCENT_HUE_BUCKETS; bucket += 1) {
    const score = weight[bucket]
      + 0.5 * (weight[(bucket + ACCENT_HUE_BUCKETS - 1) % ACCENT_HUE_BUCKETS] + weight[(bucket + 1) % ACCENT_HUE_BUCKETS]);
    if (weight[bucket] > 0 && score > bestScore) {
      best = bucket;
      bestScore = score;
    }
  }
  if (best < 0) {
    return fallback;
  }

  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [bucket, share] of [[best, 1], [(best + ACCENT_HUE_BUCKETS - 1) % ACCENT_HUE_BUCKETS, 0.5], [(best + 1) % ACCENT_HUE_BUCKETS, 0.5]]) {
    total += weight[bucket] * share;
    r += red[bucket] * share;
    g += green[bucket] * share;
    b += blue[bucket] * share;
  }
  return normalizeAccentPeak(r / total, g / total, b / total, fallback);
}

/**
 * Vurgu rengini sprite'in o anki taban tonuyla carpar.
 *
 * Phaser tonu carparak uyguluyor: ucan dusman camgobegi, kalkanli olan mavi
 * gorunuyor. Patlama da ekrandaki dusmanin rengini almali; carpim koyulttugu
 * icin parlaklik yeniden yukseltiliyor.
 */
export function tintAccentColor(accent: number, tint: number) {
  const r = ((accent >> 16) & 255) * ((tint >> 16) & 255) / 255;
  const g = ((accent >> 8) & 255) * ((tint >> 8) & 255) / 255;
  const b = (accent & 255) * (tint & 255) / 255;
  return normalizeAccentPeak(r, g, b, accent);
}

function normalizeAccentPeak(r: number, g: number, b: number, fallback: number) {
  const peak = Math.max(r, g, b);
  if (!(peak > 0)) {
    return fallback;
  }
  const scale = ACCENT_PEAK / peak;
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value * scale)));
  return (channel(r) << 16) | (channel(g) << 8) | channel(b);
}

function clampUnit(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
