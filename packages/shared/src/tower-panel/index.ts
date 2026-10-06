/**
 * Secili kulenin panel bloku: sunucunun savasta okudugu sayilarin kopyasi.
 *
 * Istemci donus hizini, isabeti, mermi hizini ve kritigi kendisi bilemez:
 * hepsi sunucuda kartlardan, esyalardan, kosullu paylardan ve Epik
 * cevrimlerden cozuluyor. Blok yalnizca paneli acik olan oyuncuya ve
 * yalnizca sectigi kule icin gidiyor (`tower:stats` istegi, cevap ayni adla).
 *
 * Birimler **oyun zamani**: aralik oyun milisaniyesi, hiz oyun saniyesi
 * basina -- sunucu ne okuyorsa o. Istemci gosterirken gercek saate ceviriyor
 * (`GAME_SPEED_MULTIPLIER`), Kule Kodeksi gibi: oyuncunun hissettigi o.
 *
 * Anahtarlar kisa ve varsayilan degerler yazilmiyor; metin yok, yalnizca
 * kimlikler. Kaynak kimlikleri modifier kaynaklariyla ayni (`card:<id>`,
 * `shop:<id>`, `conversion:<kart>:<sira>`); istemci adlari kendi
 * katalogundan okuyor.
 */

/** Panel acikken istemcinin blogu yeniden istedigi aralik. */
export const TOWER_STATS_REFRESH_MS = 500;

/** Bir stata katki: [kaynak kimligi, deger]. Toplamsal payda kesir, carpanda carpan. */
export type TowerStatSource = [source: string, value: number];

/**
 * Bir statin gecerli degeri ve dokumu.
 *
 * Dokum her zaman kapanir: `b * (1 + Σs) * Πm = v` (yuvarlamaya kadar).
 * Sunucu tanimadigi farki "etc" carpanina yaziyor, panel boylece hicbir
 * zaman toplami tutmayan bir liste gostermiyor.
 */
export type TowerStatValue = {
  /** Gecerli deger. */
  v: number;
  /** Taban; gecerliyle ayniysa yazilmaz. */
  b?: number;
  /** Toplamsal paylar (kart, esya, cevrim, kosullu). */
  s?: TowerStatSource[];
  /** Carpanlar (performans, isi, karakter ve diger). */
  m?: TowerStatSource[];
};

/**
 * Kulenin hedefe biraktigi etki.
 *
 * Tur kimlikleri: `slow` (vurus yavaslatmasi, kesir), `aslow` (aura
 * yavaslatmasi), `coolant` (Sogutma Kanali), `burn` / `bleed` (azami canin
 * saniyelik kesri), `armor` (zirh kirma, puan), `armorAura` (Abarti'nin
 * gecen mermilere verdigi zirh kirma), `mark` (isaretin hasar payi),
 * ve motorun diger durumlari (`stun`, `fear`, `bind`, `convert`, `chill`,
 * `curse`, `freeze`). `extra`: mesafeyle degisen yavaslatmada uzak uctaki
 * kesir, ust uste binen durumda en fazla yigin.
 */
export type TowerEffectWire = [kind: string, magnitude: number, durationMs?: number, extra?: number];

export type TowerStatsWire = {
  /** Kule kimligi. */
  id: string;
  /** Istemcinin istek sirasi; cevap eskiyse istemci atiyor. */
  q?: number;
  /** Kule baska bir oyuncunun: panel salt okunur. */
  ro?: 1;
  /** Kare boyu (dunya birimi): istemci menzili ve yaricapi kareye ceviriyor. */
  c?: number;

  // --- Saldiri
  /** Vurus basina hasar (kritik ve hedefe bagli paylar haric). */
  d?: TowerStatValue;
  /** Saniyede tetikleme (oyun saniyesi); aura ve odak kulesinde etki tiki. */
  f?: TowerStatValue;
  /** Ritim bir etki araligi (aura/odak): atis hizi kartlari islemiyor. */
  e?: 1;
  /** Sabit atis araligi: performans ve isi ritme islemiyor. */
  fx?: 1;
  /** Tetik basina mermi (Cifte Namlu); 1 ise yazilmaz. */
  n?: number;
  /** Isinin izin verdigi surekli tetikleme (oyun saniyesi); yalnizca isi tam hizi kisiyorsa. */
  su?: number;
  /** Beklenen saniyelik hasar, tek hedef, kritik ortalamasi dahil (oyun saniyesi). */
  dps?: number;
  /** Menzil (dunya birimi). */
  r?: TowerStatValue;
  /** Menzil global (Sunucu, Debug Lazer asiri yuklemesi). */
  rg?: 1;
  /** Hasar tipi ve vurus tipi. */
  dt?: string;
  ht?: string;
  /** Alan yaricapi (dunya birimi). */
  a?: number;
  /** Mermi basina en fazla vurulan dusman (delme); 1 ise yazilmaz. */
  pl?: number;
  /** Koni acisi (derece). */
  ca?: number;
  /** Yorunge bicagi sayisi. */
  bl?: number;

  // --- Kritik
  /** Kritik ihtimali (kesir): kulenin kendisine bakan kosullar dahil, yer hedefiyle. */
  cc?: TowerStatValue;
  /** Hedefe bagli ek kritik: [kosul, ihtimal]. `st:<durum>`, `frozen`, `marked`, `air`. */
  ccx?: TowerStatSource[];
  /** Kritik hasar carpani (2 = iki kat). */
  cm?: TowerStatValue;
  /**
   * Hedefe bagli hasar paylari: [hedef, pay]. `air`, `shielded`, `brute`,
   * `grunt`, `runner`, `shooter`, `siege`, `slowed` (vurus ve kritik paylariyla
   * toplaniyor) ve `marked` (isaretin uzerine eklenen guc).
   */
  dx?: TowerStatSource[];

  // --- Nisan
  /** Namlu donus hizi (derece / oyun saniyesi). */
  tr?: TowerStatValue;
  /** Ates konisi (derece); dar = isabetli. */
  ac?: TowerStatValue;
  /** Mermi hizi (dunya birimi / oyun saniyesi) ya da `pr` ise yalnizca carpan. */
  ps?: TowerStatValue;
  /** Mermi hizinin mutlak degeri bu yurutucude tek sayi degil; `ps` carpan. */
  pr?: 1;

  // --- Etkiler
  fe?: TowerEffectWire[];
  /** Vurus yavaslatmasi kritik gelebilir (Buz Kirigi). */
  sc?: 1;

  // --- Kaynak (tetik basina ve saniyelik; oyun zamani)
  /** Tetik basina isi. */
  hs?: number;
  /** Saniyelik soguma. */
  hc?: number;
  /** Kilit esigi ve acilma esigi (sicaklik). */
  hl?: number;
  hr?: number;
  /** Isi freni yok (Termal Kutle ya da sabit aralik). */
  nb?: 1;
  /** Tetik basina enerji ve muhimmat. */
  ec?: number;
  am?: number;
  /** Saniyelik calisma enerjisi (kart carpani dahil, oyun saniyesi). */
  oe?: number;

  // --- Ilerleme ve donanim
  /** Bu kosuda oldurme. */
  k?: number;
  /** Takili esyalar ve hedefli kartlar. */
  it?: string[];
  tc?: string[];
  /** Hedefleme kipi. */
  tm?: string;
};

/** Istemcinin istegi. */
export type TowerStatsRequest = { towerId: string; q?: number };

/**
 * Paylarin tabana nasil bindigi.
 *
 * `relative`: `taban * (1 + Σpay) * Πcarpan` (hasar, hiz, menzil). `absolute`:
 * `taban + Σpay` (kritik ihtimali ve carpani; kartlar "+%5 kritik" diyor,
 * "kritigin %5 fazlasi" degil). `none`: paylar yalnizca listeleniyor, deger
 * baska bir egriden (ates konisi isabet payiyla daraliyor).
 */
export type TowerStatCombine = "relative" | "absolute" | "none";

/**
 * Bir statin dokumunu kapatir: kaynaklarin toplamini ve bilinen carpanlari
 * tabandan cikarip kalan farki `etc` kalemine yazar. Sunucu ve test ayni
 * kurali kullaniyor.
 */
export function closeTowerStatValue(value: number, base: number, sources: TowerStatSource[] = [], multipliers: TowerStatSource[] = [], combine: TowerStatCombine = "relative"): TowerStatValue {
  const stat: TowerStatValue = { v: roundTowerStat(value) };
  const kept = sources.filter(([, add]) => Math.abs(add) >= 0.0005);
  const keptMultipliers = multipliers.filter(([, multiplier]) => Math.abs(multiplier - 1) >= 0.0005);
  const sum = kept.reduce((total, [, add]) => total + add, 0);
  if (combine === "relative") {
    const known = keptMultipliers.reduce((product, [, multiplier]) => product * multiplier, 1);
    const expected = base * (1 + sum) * known;
    if (expected > 0 && value > 0) {
      const residual = value / expected;
      if (Math.abs(residual - 1) >= 0.005) keptMultipliers.push(["etc", residual]);
    }
  } else if (combine === "absolute") {
    const residual = value - (base + sum);
    if (Math.abs(residual) >= 0.0005) kept.push(["etc", residual]);
  }
  if (Math.abs(base - value) > Math.max(1e-6, Math.abs(value) * 1e-4)) stat.b = roundTowerStat(base);
  if (kept.length > 0) stat.s = kept.map(([source, add]) => [source, roundTowerStat(add)]);
  if (keptMultipliers.length > 0) stat.m = keptMultipliers.map(([source, multiplier]) => [source, roundTowerStat(multiplier)]);
  return stat;
}

/** Ayni kaynagin paylari tek kalem; sira ilk gorulen. */
export function groupTowerStatSources(entries: Iterable<{ source: string; add: number }>): TowerStatSource[] {
  const grouped = new Map<string, number>();
  for (const entry of entries) grouped.set(entry.source, (grouped.get(entry.source) ?? 0) + entry.add);
  return Array.from(grouped, ([source, add]) => [source, add]);
}

/** Dort anlamli basamak: panel en fazla bunu okuyor, tel de kisaliyor. */
export function roundTowerStat(value: number) {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value);
  const digits = magnitude >= 100 ? 1 : magnitude >= 1 ? 3 : 4;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
