/**
 * Ortak VFX kiti: Debug Lazer'in teknikleri, her saldiriya acik.
 *
 * Lazer oyunun sahibinin begendigi tek efekt ve bunun sebebi teknikleri:
 * kademe yukseldikce **kesit** degisiyor (duz serit -> omuzlu ve beyaza
 * cekilmis cekirdek -> genis omuz ve kosan dugum), renk sicaklik
 * degistiriyor, ust kademede cevresine hareket ekleniyor. Bu teknikler
 * lazerin icinde kilitliydi; burada saf fonksiyonlar olarak duruyorlar:
 * (graphics, geometri, renk, kademe, zaman) girer, cizim cagrilari cikar.
 *
 * Kurallar:
 * - Durum yok, `Math.random` yok. Her rastgelelik bir tohumdan (kimligin
 *   FNV-1a ozeti, sira numarasi, kusak) turuyor; takimdaki her oyuncu ayni
 *   seyi goruyor.
 * - Karede nesne uretilmiyor. Diziler cagirandan geliyor ya da havuzda.
 * - Lazer bu kiti kullaniyor ve cizimi kitten once ne ise ondan ayirt
 *   edilemiyor (`tests/vfx-kit-laser-identity.test.mjs`). Kitin varsayilan
 *   sayilari bu yuzden lazerin sayilari; degistirmek lazeri degistirir.
 */

/**
 * Kitin cizdigi yuzey: Phaser Graphics'in kullanilan alt kumesi.
 *
 * Phaser'in kendisi degil, yapisal bir arayuz: node testleri ayni kodu
 * kayitci bir sahte yuzeye cizdirip cagrilari sayiyor ya da karsilastiriyor.
 */
export interface VfxGraphics {
  lineStyle(width: number, color: number, alpha?: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  strokeRect(x: number, y: number, width: number, height: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number, smoothness?: number): unknown;
  strokeEllipse(x: number, y: number, width: number, height: number, smoothness?: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
  strokePath(): unknown;
  fillPath(): unknown;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): unknown;
  fillPoints(points: ReadonlyArray<{ x: number; y: number }>, closeShape?: boolean, closePath?: boolean): unknown;
  strokePoints(points: ReadonlyArray<{ x: number; y: number }>, closeShape?: boolean, closePath?: boolean): unknown;
}

export type VfxTier = 1 | 2 | 3;

/**
 * Takim arkadasinin kademe 3 eklentileri bu alfada; kendi kulen tam. Tek
 * kaynak: saldiri, isin, Atakan ve Zeynep imzalari ayni sayiyi okuyor.
 */
export const TEAMMATE_EXTRA_ALPHA = 0.7;

export const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);

export function toTier(tier: number | undefined): VfxTier {
  return tier !== undefined && tier >= 3 ? 3 : tier !== undefined && tier >= 2 ? 2 : 1;
}

/**
 * Sabit gurultu: ayni tohum ayni sayi, [0, 1).
 *
 * Sahnenin yildiz alanindaki `spaceNoise` ile ayni formul; lazerin kivilcim
 * ve parlama yerleri bundan cikiyor, kim cizerse cizsin ayni yer.
 */
export function hashNoise(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Kimligin gercek bir ozeti (32 bit FNV-1a).
 *
 * Eskiden tohum `beam.id.length` idi: ayni uzunluktaki her kimlik ayni
 * tohumu aliyordu ve Ucube'nin her zinciri ayni zikzagi ciziyordu. FNV her
 * karakteri katiyor; kimlik takimdaki her istemcide ayni oldugu icin cizim
 * de ayni.
 */
export function fnvHash(text: string, salt = 0) {
  let hash = (FNV_OFFSET ^ salt) >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Kimlikten [0, 1) arasinda bir sayi; `salt` ayni kimlikten farkli sayilar verir. */
export function fnvUnit(text: string, salt = 0) {
  return fnvHash(text, salt) / 4294967296;
}

/**
 * Rengi beyaza cek; tonu koru.
 *
 * Tumuyle beyaz bir cekirdek isini beyaz gosteriyor, tumuyle renkli bir
 * cekirdek sicakligini kaybediyor. Karisim ikisini birden veriyor: kirmizi
 * isinin ortasi acik kirmizi. Lazerin `getBeamCoreColor`u; ayni formul.
 */
export function liftToWhite(color: number, whiteness = 0.5) {
  const lift = (channel: number) => Math.round(channel + (255 - channel) * whiteness);
  return (lift((color >> 16) & 0xff) << 16) | (lift((color >> 8) & 0xff) << 8) | lift(color & 0xff);
}

/** Iki rengin karisimi (t=0 a, t=1 b). */
export function mixColor(a: number, b: number, t: number) {
  const mix = (shift: number) => Math.round(((a >> shift) & 0xff) + ((((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t));
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Renk kanallarinin karanliga cekilmis hali (0 ayni, 1 siyah). */
export function darken(color: number, amount: number) {
  return mixColor(color, 0x000000, amount);
}

/* ------------------------------------------------------------------ */
/* Ucuz daire: Phaser'da her yay yaricaptan bagimsiz 101 nokta.          */
/* ------------------------------------------------------------------ */

/**
 * Phaser 3.90'in WebGL cizicisi her `fillCircle`i 101 noktalik bir cokgen
 * olarak earcut ile ucgenliyor (~99 ucgen), her `strokeCircle`i 101 parcalik
 * bir cizgi olarak (~200 dortgen) -- 2 piksellik bir nokta icin de. Karede
 * yuzlerce kez cagrildiginda mobilde asil maliyet bu. Kit (lazer disinda)
 * daireyi boyuna gore 8-20 kenarli bir ucgen yelpazesiyle, kucuk noktayi tek
 * kareyle, halkayi 10-24 parcalik bir yolla ciziyor; bu boylarda goz farki
 * secemiyor. Lazerin kendi cizimi degismedi (kimlik testi).
 */
const DISC_TABLES = new Map<number, { cos: Float32Array; sin: Float32Array }>();
function discTable(sides: number) {
  let table = DISC_TABLES.get(sides);
  if (!table) {
    const cos = new Float32Array(sides);
    const sin = new Float32Array(sides);
    for (let index = 0; index < sides; index += 1) {
      cos[index] = Math.cos((index / sides) * Math.PI * 2);
      sin[index] = Math.sin((index / sides) * Math.PI * 2);
    }
    table = { cos, sin };
    DISC_TABLES.set(sides, table);
  }
  return table;
}

/** Dolu daire: kucukse kare, degilse 8-20 kenarli ucgen yelpazesi (earcut yok). */
export function fillDisc(g: VfxGraphics, x: number, y: number, radius: number) {
  if (!(radius > 0)) return;
  if (radius < 2.2) {
    // Alani esit kare: bu boyda daireden ayirt edilmiyor.
    const side = radius * 1.7725;
    g.fillRect(x - side / 2, y - side / 2, side, side);
    return;
  }
  const sides = radius < 6 ? 8 : radius < 16 ? 12 : 20;
  const { cos, sin } = discTable(sides);
  const x0 = x + cos[0] * radius;
  const y0 = y + sin[0] * radius;
  for (let index = 1; index < sides - 1; index += 1) {
    g.fillTriangle(x0, y0, x + cos[index] * radius, y + sin[index] * radius, x + cos[index + 1] * radius, y + sin[index + 1] * radius);
  }
}

/** Cizgi halka: boyuna gore 10-24 parcalik kapali yol. */
export function strokeRing(g: VfxGraphics, x: number, y: number, radius: number) {
  if (!(radius > 0)) return;
  const sides = radius < 8 ? 10 : radius < 24 ? 16 : 24;
  const { cos, sin } = discTable(sides);
  g.beginPath();
  g.moveTo(x + cos[0] * radius, y + sin[0] * radius);
  for (let index = 1; index < sides; index += 1) {
    g.lineTo(x + cos[index] * radius, y + sin[index] * radius);
  }
  g.closePath();
  g.strokePath();
}

/**
 * Kesitin omuzlari: [genisletme orani, alfa]. Kademe 2'de uc omuz, kademe
 * 3'te dort omuz ve 1.8 kat yayilma. Lazerin sayilari.
 */
export const PROFILE_SHOULDERS: Readonly<Record<2 | 3, ReadonlyArray<readonly [number, number]>>> = {
  2: [[1, 0.1], [0.62, 0.24], [0.28, 0.46]],
  3: [[1, 0.07], [0.74, 0.13], [0.5, 0.22], [0.28, 0.4]]
};
export const PROFILE_TIER3_SPREAD = 1.8;
export const PROFILE_FLAT_ALPHA = 0.95;
export const PROFILE_BODY_ALPHA = 0.82;
export const PROFILE_CORE = { width: 0.52, lift: 0.45, alpha: 0.9 } as const;
export const PROFILE_FILAMENT = { width: 0.2, lift: 0.86, alpha: 0.96 } as const;

export type ProfileOptions = {
  /** Omuzlarin govdeden tasma payi (kademe 3'te 1.8 kati). */
  spread: number;
  /** Govdenin kalinligi. */
  body: number;
};

/**
 * Cizginin kesiti: lazerin kademe merdiveni.
 *
 * Kademe 1 tek duz serit. Kademe 2: uc yumusak omuz, govde, beyaza %45
 * cekilmis cekirdek ve %86 cekilmis ince file. Kademe 3: omuzlar 1.8 kat
 * yayiliyor ve dorde cikiyor. Yumusaklik kalinliktan degil katman
 * sayisindan geliyor.
 *
 * `glow` verilirse omuzlar oraya (ADD katmani) gidiyor: daha az katmanla
 * daha zengin bir parlama. Verilmezse her sey `g`ye -- lazerin yolu.
 * `alpha` takim arkadasi ve LOD icin; 1 iken sayilar lazerinkiyle bire bir.
 */
export function strokeProfile(
  g: VfxGraphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
  tier: number,
  options: ProfileOptions,
  glow?: VfxGraphics,
  alpha = 1
) {
  const { body } = options;
  const cizgi = (target: VfxGraphics, width: number, tone: number, lineAlpha: number) => {
    target.lineStyle(Math.max(0.6, width), tone, alpha === 1 ? lineAlpha : lineAlpha * alpha);
    target.lineBetween(x1, y1, x2, y2);
  };

  if (tier < 2) {
    cizgi(g, body, color, PROFILE_FLAT_ALPHA);
    return;
  }

  const spread = tier >= 3 ? options.spread * PROFILE_TIER3_SPREAD : options.spread;
  const omuzlar = tier >= 3 ? PROFILE_SHOULDERS[3] : PROFILE_SHOULDERS[2];
  for (const [olcek, alfa] of omuzlar) {
    cizgi(glow ?? g, body + spread * olcek, color, alfa);
  }
  cizgi(g, body, color, PROFILE_BODY_ALPHA);
  cizgi(g, body * PROFILE_CORE.width, liftToWhite(color, PROFILE_CORE.lift), PROFILE_CORE.alpha);
  cizgi(g, body * PROFILE_FILAMENT.width, liftToWhite(color, PROFILE_FILAMENT.lift), PROFILE_FILAMENT.alpha);
}

export type CoronaOptions = {
  /** En icteki katmanin kalinligi (lazerde isin + 6). */
  base: number;
  layers: number;
  step: number;
  breathStep: number;
  color: number;
  alpha: number;
  breathAlpha: number;
  /** Nefes periyodu: `sin(now / period)`. */
  period: number;
};

/** Lazerin halesi: alti ince katman, nefes aliyor. */
export const LASER_CORONA: Omit<CoronaOptions, "base"> = {
  layers: 6,
  step: 3.4,
  breathStep: 0.8,
  color: 0xbae6fd,
  alpha: 0.016,
  breathAlpha: 0.006,
  period: 180
};

/**
 * Hale: disa dogru sonen, nefes alan cok sayida ince katman.
 *
 * Tek genis cizgi gri bir kapsul, uc kalin katman bir bant gibi okunuyor;
 * gecisi yapan katman sayisi. En distan ice ciziliyor.
 */
export function drawCorona(
  g: VfxGraphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  now: number,
  options: CoronaOptions,
  alpha = 1
) {
  const breath = 0.5 + Math.sin(now / options.period) * 0.5;
  for (let layer = options.layers; layer >= 1; layer -= 1) {
    const spread = options.base + layer * (options.step + breath * options.breathStep);
    const layerAlpha = options.alpha + breath * options.breathAlpha;
    g.lineStyle(spread, options.color, alpha === 1 ? layerAlpha : layerAlpha * alpha);
    g.lineBetween(x1, y1, x2, y2);
  }
}

export type GlintOptions = {
  count: number;
  armBase: number;
  armRange: number;
  armWidth: number;
  armAlpha: number;
  crossWidth: number;
  crossAlpha: number;
  crossRatio: number;
  color: number;
  haloColor: number;
  haloAlpha: number;
  haloRadius: number;
  coreRadius: number;
  /** Uclarda sonme payi: yolun bu orani boyunca belirip kayboluyor. */
  edge: number;
  /** Ayni isinda farkli kosucu dizileri icin tohum kaydirmasi. */
  seedOffset: number;
  /** Ucuz daire (fillDisc). Lazer gercek daireyi kullaniyor: gorunusu degismesin. */
  cheapDiscs?: boolean;
};

export const LASER_GLINTS: GlintOptions = {
  count: 7,
  armBase: 10,
  armRange: 8,
  armWidth: 1.4,
  armAlpha: 0.85,
  crossWidth: 1,
  crossAlpha: 0.5,
  crossRatio: 0.7,
  color: 0xffffff,
  haloColor: 0xbae6fd,
  haloAlpha: 0.4,
  haloRadius: 4.5,
  coreRadius: 2.2,
  edge: 0.18,
  seedOffset: 0
};

/**
 * Yol boyunca kosan parlamalar: her biri kucuk bir yildiz cakmasi.
 *
 * Baslangiclar esit aralikli, uzerine kucuk bir sapma: tumuyle rastgele
 * birakilinca kumeleniyorlar. Uzun kol yola **dik**, kisa kol boyunca.
 */
export function drawRunningGlints(
  g: VfxGraphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  now: number,
  options: GlintOptions,
  alpha = 1
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const seedBase = options.seedOffset;
  for (let index = 0; index < options.count; index += 1) {
    const speed = 0.35 + hashNoise(seedBase + index * 3 + 1) * 0.5;
    const offset = index / options.count + hashNoise(seedBase + index * 3 + 2) * 0.08;
    const along = (((now / 1000) * speed + offset) % 1) * length;
    const px = x1 + ux * along;
    const py = y1 + uy * along;
    const edge = Math.min(along, length - along) / Math.max(1, length * options.edge);
    const fade = Math.min(1, Math.max(0, edge));
    if (fade <= 0) continue;
    const shown = alpha === 1 ? fade : fade * alpha;

    const arm = options.armBase + hashNoise(seedBase + index * 3 + 3) * options.armRange;
    g.lineStyle(options.armWidth, options.color, options.armAlpha * shown);
    g.lineBetween(px - nx * arm, py - ny * arm, px + nx * arm, py + ny * arm);
    g.lineStyle(options.crossWidth, options.color, options.crossAlpha * shown);
    g.lineBetween(px - ux * arm * options.crossRatio, py - uy * arm * options.crossRatio, px + ux * arm * options.crossRatio, py + uy * arm * options.crossRatio);
    g.fillStyle(options.haloColor, options.haloAlpha * shown);
    if (options.cheapDiscs) fillDisc(g, px, py, options.haloRadius);
    else g.fillCircle(px, py, options.haloRadius);
    g.fillStyle(options.color, 1 * shown);
    if (options.cheapDiscs) fillDisc(g, px, py, options.coreRadius);
    else g.fillCircle(px, py, options.coreRadius);
  }
}

export type LineSparkOptions = {
  count: number;
  lifeMs: number;
  /** Isinin ekseninden ilk uzaklik (lazerde genislik/2 + 4). */
  offset: number;
  /** Omru boyunca disa acilma. */
  rise: number;
  color: number;
  width: number;
  alpha: number;
  tailBase: number;
  tailRange: number;
  /** Ayni karede baska bir kivilcim dizisi icin tohum kaydirmasi. */
  seedOffset: number;
};

export const LASER_SPARKS: Omit<LineSparkOptions, "offset"> = {
  count: 10,
  lifeMs: 520,
  rise: 22,
  color: 0xfffbeb,
  width: 1.1,
  alpha: 0.8,
  tailBase: 4,
  tailRange: 6,
  seedOffset: 0
};

/** Bir kivilcimin parlakligi: ilk %15'te parlar, sonra soner. */
export function sparkGlow(life: number) {
  return life < 0.15 ? life / 0.15 : 1 - (life - 0.15) / 0.85;
}

/**
 * Cizginin kenarindan dokulen kivilcimlar; durumsuz ve tohumlu.
 *
 * Her kivilcimin yeri omru boyunca sabit, kusak numarasi tohuma giriyor:
 * her dogusta baska yerden cikiyor, dogusun icinde yerini birakmiyor.
 * Her karede yeniden cekilen yer kivilcim degil kum gibi titriyordu.
 */
export function drawLineSparks(
  g: VfxGraphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  now: number,
  options: LineSparkOptions,
  alpha = 1
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const base = options.seedOffset;
  for (let index = 0; index < options.count; index += 1) {
    const durationMs = options.lifeMs * (0.7 + hashNoise(base + index * 7 + 1) * 0.6);
    const phase = now / durationMs + hashNoise(base + index * 7 + 2) * 10;
    const generation = Math.floor(phase);
    const life = phase - generation;
    const seed = base + index * 7 + generation * 131;
    const along = hashNoise(seed) * length;
    const side = hashNoise(seed + 1) > 0.5 ? 1 : -1;
    const drift = hashNoise(seed + 2) * 0.5 - 0.25;

    const spread = options.offset + life * options.rise;
    const px = x1 + ux * (along + life * length * 0.02 * drift) + nx * side * spread;
    const py = y1 + uy * (along + life * length * 0.02 * drift) + ny * side * spread;
    const tail = options.tailBase + hashNoise(seed + 3) * options.tailRange;
    const glow = sparkGlow(life);
    g.lineStyle(options.width, options.color, alpha === 1 ? options.alpha * glow : options.alpha * glow * alpha);
    g.lineBetween(px, py, px - nx * side * tail, py - ny * side * tail);
  }
}

export type MuzzleBurstOptions = {
  spikes: number;
  reachBase: number;
  reachPulse: number;
  width: number;
  color: number;
  coreColor: number;
  coreBase: number;
  corePulse: number;
  /** Donus periyodu: `now / spin`. */
  spin: number;
  /** Nabiz periyodu: `sin(now / pulse)`. */
  pulse: number;
  /** Ucuz daire (fillDisc). Lazer gercek daireyi kullaniyor. */
  cheapDiscs?: boolean;
};

export const LASER_MUZZLE: MuzzleBurstOptions = {
  spikes: 4,
  reachBase: 16,
  reachPulse: 7,
  width: 1.2,
  color: 0xffffff,
  coreColor: 0xffffff,
  coreBase: 3,
  corePulse: 1.6,
  spin: 700,
  pulse: 90
};

/**
 * Namlu cakmasi: atisin en parlak noktasi.
 *
 * Donen 4 cizgi (8 diken) ve nabiz atan bir cekirdek. `now` sabit
 * verildiginde (tek seferlik namlu) ayni sekil donmeden kalir.
 */
export function drawMuzzleBurst(g: VfxGraphics, x: number, y: number, now: number, options: MuzzleBurstOptions, alpha = 1) {
  const muzzlePulse = 0.6 + Math.sin(now / options.pulse) * 0.4;
  const lineAlpha = 0.5 + muzzlePulse * 0.35;
  g.lineStyle(options.width, options.color, alpha === 1 ? lineAlpha : lineAlpha * alpha);
  for (let index = 0; index < options.spikes; index += 1) {
    const angle = (index / options.spikes) * Math.PI + now / options.spin;
    const reach = options.reachBase + muzzlePulse * options.reachPulse;
    g.lineBetween(
      x - Math.cos(angle) * reach,
      y - Math.sin(angle) * reach,
      x + Math.cos(angle) * reach,
      y + Math.sin(angle) * reach
    );
  }
  g.fillStyle(options.coreColor, alpha === 1 ? 0.9 : 0.9 * alpha);
  if (options.cheapDiscs) fillDisc(g, x, y, options.coreBase + muzzlePulse * options.corePulse);
  else g.fillCircle(x, y, options.coreBase + muzzlePulse * options.corePulse);
}

/**
 * Mermi izi icin konum halkasi; kimlik basina, havuzlu.
 *
 * Her mermi son birkac konumunu tutuyor. Kayitlar ve diziler havuzdan:
 * mermi oldugunde kaydi havuza donuyor, yeni mermi onu yeniden kullaniyor.
 * Karede yalnizca var olan kayit yaziliyor.
 */
export class TrailBuffer {
  private readonly entries = new Map<string, TrailEntry>();
  private readonly pool: TrailEntry[] = [];
  private frame = 0;

  constructor(private readonly capacity = 8, private readonly maxEntries = 320) {}

  /** Bu karede gorulen konumu yazar; ayni noktaya cok yakinsa yazmaz. */
  record(id: string, x: number, y: number, minStep = 1.2) {
    let entry = this.entries.get(id);
    if (!entry) {
      if (this.entries.size >= this.maxEntries) return undefined;
      entry = this.pool.pop() ?? { xs: new Float32Array(this.capacity), ys: new Float32Array(this.capacity), head: 0, count: 0, seen: 0 };
      entry.head = 0;
      entry.count = 0;
      this.entries.set(id, entry);
    }
    entry.seen = this.frame;
    const last = entry.count > 0 ? (entry.head + this.capacity - 1) % this.capacity : -1;
    if (last >= 0 && Math.abs(entry.xs[last] - x) + Math.abs(entry.ys[last] - y) < minStep) {
      // Ayni yerde duran mermi izini uzatmiyor; bas yine de guncel.
      entry.xs[last] = x;
      entry.ys[last] = y;
      return entry;
    }
    entry.xs[entry.head] = x;
    entry.ys[entry.head] = y;
    entry.head = (entry.head + 1) % this.capacity;
    entry.count = Math.min(this.capacity, entry.count + 1);
    return entry;
  }

  /** Karenin sonunda: bu karede gorulmeyen kayitlari havuza geri ver. */
  endFrame() {
    for (const [id, entry] of this.entries) {
      if (entry.seen !== this.frame) {
        this.entries.delete(id);
        this.pool.push(entry);
      }
    }
    this.frame += 1;
  }

  get size() {
    return this.entries.size;
  }

  clear() {
    for (const entry of this.entries.values()) this.pool.push(entry);
    this.entries.clear();
  }

  get bufferCapacity() {
    return this.capacity;
  }
}

export type TrailEntry = { xs: Float32Array; ys: Float32Array; head: number; count: number; seen: number };

/**
 * Sivrilen serit: en yeni noktadan en eskiye genislik ve alfa azaliyor.
 *
 * `points` en fazla `maxPoints` nokta kullaniyor (LOD izi kisaltiyor ama
 * rengi ve govdeyi hic kesmiyor). `core` verilirse ikinci, beyaza cekilmis
 * ince bir serit ayni yoldan geciyor.
 */
export function drawTaperedRibbon(
  g: VfxGraphics,
  entry: TrailEntry,
  capacity: number,
  headX: number,
  headY: number,
  options: { color: number; width: number; alpha: number; maxPoints: number; core?: { color: number; ratio: number; alpha: number } }
) {
  const count = Math.min(entry.count, options.maxPoints);
  if (count < 1) return;
  let previousX = headX;
  let previousY = headY;
  for (let step = 0; step < count; step += 1) {
    const index = (entry.head - 1 - step + capacity * 2) % capacity;
    const x = entry.xs[index];
    const y = entry.ys[index];
    const t = 1 - step / count;
    const width = Math.max(0.5, options.width * t);
    g.lineStyle(width, options.color, options.alpha * t);
    g.lineBetween(previousX, previousY, x, y);
    if (options.core && step < count * 0.6) {
      g.lineStyle(Math.max(0.5, width * options.core.ratio), options.core.color, options.core.alpha * t);
      g.lineBetween(previousX, previousY, x, y);
    }
    previousX = x;
    previousY = y;
  }
}

/* ------------------------------------------------------------------ */
/* Agir, sert dil: beyaz-sicak cekirdek, balistik kivilcim, metal, duman. */
/*                                                                      */
/* Sahibin begendigi Debug Lazer'in disindaki her vurus bu dilde: az     */
/* renk, beyaz-sicak bir cekirdek, kisa ve sert bir parlama, yercekimiyle */
/* dusen kivilcimlar, kinetik vuruslarda metal kirintisi, kisa bir duman  */
/* ve sonen bir yanik. Kademe sus degil yogunluk: cekirdek daha beyaz,    */
/* govde daha agir, vurus daha guclu. Lazer bunlarin hicbirini            */
/* kullanmiyor; lazerin sayilari degismedi.                               */
/* ------------------------------------------------------------------ */

type Hsl = { h: number; s: number; l: number };

/** Rengin HSL hali (0-1). */
export function toHsl(color: number): Hsl {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return { h, s, l };
}

export function fromHsl({ h, s, l }: Hsl) {
  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return (v << 16) | (v << 8) | v;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue(p, q, h + 1 / 3);
  const g = hue(p, q, h);
  const b = hue(p, q, h - 1 / 3);
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** Kimlik tonunun doygunluk ust siniri: ton kenarda okunur, sekerleme gibi parlamaz. */
export const GROUNDED_MAX_SATURATION = 0.6;

/**
 * Kulenin kimlik tonu, yere indirilmis: doygunluk sinirli, aciklik ortada.
 *
 * Ton (hue) korunuyor -- Zeynep'in kizili ve morlari, Melis'in menekseleri
 * taninir kaliyor -- ama pastel ya da asiri doygun degil: kenarda bir
 * tint, enerjinin kendisi beyaz-sicak cekirdek.
 */
export function groundHue(color: number, maxSaturation = GROUNDED_MAX_SATURATION) {
  const hsl = toHsl(color);
  if (hsl.s === 0) return color;
  return fromHsl({ h: hsl.h, s: Math.min(maxSaturation, hsl.s), l: Math.min(0.55, Math.max(0.44, hsl.l)) });
}

/**
 * `groundHue` renk basina bir kez (sunucunun gonderdigi isin renkleri):
 * karede renk donusumu ve nesne yok.
 */
const GROUNDED_CACHE = new Map<number, number>();
export function groundHueCached(color: number) {
  let value = GROUNDED_CACHE.get(color);
  if (value === undefined) {
    value = groundHue(color);
    if (GROUNDED_CACHE.size < 256) GROUNDED_CACHE.set(color, value);
  }
  return value;
}

/**
 * Beyaz-sicak alt sinir: yere indirilmis bir ton (aciklik 0.44-0.58) bu
 * kadar beyaza cekilince acikligi 0.9'u geciyor -- tonun izi kalan beyaz.
 * Arasi (0.35-0.84 cekme) pastel bir bant: ne ton ne beyaz-sicak; agir dilde
 * hic kullanilmiyor.
 */
export const WHITE_HOT_LIFT = 0.84;

/** Beyaz-sicak cekirdek; `heat` 0..1 ne kadar beyaz (kademenin yogunlugu). */
export function whiteHot(hue: number, heat = 0.5) {
  return liftToWhite(hue, WHITE_HOT_LIFT + 0.15 * clamp01(heat));
}

/**
 * Soguma rengi: beyaz-sicak -> ton -> koyu.
 *
 * Kivilcim ve kor buyle yasliyor: dogarken beyaza yakin, ortasinda kulenin
 * tonu, sonunda karanliga dusuyor. `t` 0..1 (omrun orani).
 */
export function coolingColor(hue: number, t: number) {
  // Pastel bantta durmuyor: beyaz-sicaktan dogrudan tonun sicak haline iniyor.
  if (t <= 0.22) return whiteHot(hue, 1 - t / 0.22);
  if (t <= 0.55) return hue;
  return darken(hue, 0.7 * ((t - 0.55) / 0.45));
}

/** Celik: metal kirintisinin govdesi (tonsuz; koyu zeminde okunacak kadar acik). */
export const STEEL = 0x71717a;
/** Duman: notr gri (dusuk alfayla; koyu zeminde okunuyor). */
export const SMOKE = 0x78716c;
/** Yanik izi: neredeyse siyah. */
export const SCORCH = 0x0c0a09;

const FAN_SIDES = [6, 8] as const;
const FAN_TABLES = new Map<number, { cos: Float32Array; sin: Float32Array }>();
for (const sides of FAN_SIDES) {
  const cos = new Float32Array(sides);
  const sin = new Float32Array(sides);
  for (let index = 0; index < sides; index += 1) {
    cos[index] = Math.cos((index / sides) * Math.PI * 2);
    sin[index] = Math.sin((index / sides) * Math.PI * 2);
  }
  FAN_TABLES.set(sides, { cos, sin });
}

/**
 * Ucuz dolu elips: 6 ya da 8 kenarli ucgen yelpazesi (earcut yok). Duman
 * topagi ve yer izi icin; bu boyda daireden ayirt edilmiyor ve kenar sayisi
 * duzensiz bir duman gibi okunuyor.
 */
export function fillFan(g: VfxGraphics, x: number, y: number, rx: number, ry: number, sides: 6 | 8, rotation = 0) {
  if (!(rx > 0) || !(ry > 0)) return;
  const { cos, sin } = FAN_TABLES.get(sides)!;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const x0 = x + (cos[0] * c - sin[0] * s) * rx;
  const y0 = y + (sin[0] * c + cos[0] * s) * ry;
  let ax = x + (cos[1] * c - sin[1] * s) * rx;
  let ay = y + (sin[1] * c + cos[1] * s) * ry;
  for (let index = 2; index < sides; index += 1) {
    const bx = x + (cos[index] * c - sin[index] * s) * rx;
    const by = y + (sin[index] * c + cos[index] * s) * ry;
    g.fillTriangle(x0, y0, ax, ay, bx, by);
    ax = bx;
    ay = by;
  }
}

export type BallisticSparkOptions = {
  seed: number;
  count: number;
  /** Ilk hiz (birim / sn). */
  speed: number;
  /** Merkez yon (radyan); `undefined` butun cevre. */
  heading: number | undefined;
  /** Yelpazenin genisligi (radyan). */
  fan: number;
  /** Yercekimi (birim / sn^2, +y asagi). */
  gravity: number;
  lifeMs: number;
  /** Kulenin tonu: kivilcim beyaz-sicak dogup bu tondan karanliga soguyor. */
  hue: number;
  width: number;
  alpha: number;
  /** Cizginin boyu: hizin bu kadar saniyelik yolu (hizli kivilcim uzun). */
  streak: number;
};

/**
 * Balistik kivilcimlar: durumsuz ve tohumlu.
 *
 * Her kivilcimin yonu ve hizi tohumdan; konumu `v t + g t^2 / 2`. Cizgi
 * hizin yonunde (dustukce egiliyor), boyu hizla. Renk soguyor: beyaz ->
 * ton -> koyu. `elapsedMs` olayin yasi; kivilcimlarin omru biraz farkli.
 */
export function drawBallisticSparks(g: VfxGraphics, x: number, y: number, elapsedMs: number, options: BallisticSparkOptions) {
  if (options.count <= 0 || elapsedMs < 0) return;
  const t = elapsedMs / 1000;
  for (let index = 0; index < options.count; index += 1) {
    const base = options.seed + index * 17;
    const life = elapsedMs / (options.lifeMs * (0.6 + hashNoise(base + 3) * 0.4));
    if (life >= 1) continue;
    const roll = hashNoise(base + 1);
    const angle = options.heading === undefined
      ? (index / options.count) * Math.PI * 2 + (roll - 0.5) * 0.8
      : options.heading + (roll - 0.5) * options.fan;
    const speed = options.speed * (0.45 + hashNoise(base + 2) * 0.55);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const vy = uy * speed + options.gravity * t;
    const px = x + ux * speed * t;
    const py = y + uy * speed * t + 0.5 * options.gravity * t * t;
    const fade = 1 - life;
    g.lineStyle(options.width, coolingColor(options.hue, life), clamp01(options.alpha * fade));
    g.lineBetween(px - ux * speed * options.streak, py - vy * options.streak, px, py);
  }
}

export type DebrisOptions = {
  seed: number;
  count: number;
  speed: number;
  heading: number | undefined;
  fan: number;
  gravity: number;
  lifeMs: number;
  /** Kirintinin govdesi (celik, kitin, tas). */
  color: number;
  /** Ucte birinin rengi: sicak kenar ya da parlak yuz. */
  edge: number;
  size: number;
  alpha: number;
  /** Kirinti bu kadar asagida yere iniyor (dusmanin ayagi); 0 zemin yok. */
  floor: number;
};

/**
 * Metal kirintilari ve govde parcalari: donen koyu ucgenler, balistik.
 *
 * Her parca tek `fillTriangle`. Yere (`floor`) inen parca orada kaliyor ve
 * sonuyor: havada asili kalan kiymik sekerleme gibi duruyordu.
 */
export function drawDebris(g: VfxGraphics, x: number, y: number, elapsedMs: number, options: DebrisOptions, ground?: VfxGraphics) {
  if (options.count <= 0 || elapsedMs < 0) return;
  for (let index = 0; index < options.count; index += 1) {
    const base = options.seed + index * 23;
    const lifeMs = options.lifeMs * (0.7 + hashNoise(base + 4) * 0.3);
    const life = elapsedMs / lifeMs;
    if (life >= 1) continue;
    const roll = hashNoise(base + 1);
    const angle = options.heading === undefined
      ? (index / options.count) * Math.PI * 2 + (roll - 0.5) * 0.9
      : options.heading + (roll - 0.5) * options.fan;
    const speed = options.speed * (0.4 + hashNoise(base + 2) * 0.6);
    // Yere indikten sonra zaman durmuyor ama yol duruyor.
    let t = elapsedMs / 1000;
    let px = x + Math.cos(angle) * speed * t;
    let py = y + Math.sin(angle) * speed * t + 0.5 * options.gravity * t * t;
    // Her parcanin kendi zemini: hepsi ayni cizgiye dizilmesin.
    const floor = options.floor * (0.55 + hashNoise(base + 6) * 0.9);
    let surface = g;
    if (options.floor > 0 && py > y + floor) {
      py = y + floor;
      t = Math.min(t, 0.4);
      px = x + Math.cos(angle) * speed * t;
      // Yere inen parca yerde: zemin yuzeyinde (dusmanlarin ve kulelerin altinda).
      if (ground) surface = ground;
    }
    const spin = hashNoise(base + 3) * Math.PI * 2 + (roll - 0.5) * 16 * t;
    const size = options.size * (0.6 + hashNoise(base + 5) * 0.7);
    const fade = life < 0.55 ? 1 : 1 - (life - 0.55) / 0.45;
    surface.fillStyle(index % 3 === 0 ? options.edge : options.color, clamp01(options.alpha * fade));
    surface.fillTriangle(
      px + Math.cos(spin) * size, py + Math.sin(spin) * size,
      px + Math.cos(spin + 2.3) * size * 0.7, py + Math.sin(spin + 2.3) * size * 0.7,
      px + Math.cos(spin + 4.1) * size * 0.85, py + Math.sin(spin + 4.1) * size * 0.85
    );
  }
}

export type SmokeOptions = {
  seed: number;
  count: number;
  /** Topagin ilk yaricapi. */
  radius: number;
  /** Omru boyunca buyume orani (1 = iki katina). */
  grow: number;
  /** Omru boyunca yukselme (birim). */
  rise: number;
  lifeMs: number;
  color: number;
  alpha: number;
  /** Hareket azaltma: buyumeden ve yukselmeden yerinde soner. */
  still: boolean;
};

/**
 * Kisa bir duman: birkac dusuk alfali, buyuyerek yukselen topak (6 kenar).
 * Topaklar biraz gecikmeli dogup ust uste biniyor; hepsi tohumdan.
 */
export function drawSmoke(g: VfxGraphics, x: number, y: number, elapsedMs: number, options: SmokeOptions) {
  if (options.count <= 0 || elapsedMs < 0 || options.alpha <= 0) return;
  for (let index = 0; index < options.count; index += 1) {
    const base = options.seed + index * 29;
    // Topaklar biraz gecikmeli doguyor; hareket azaltmada hepsi birden (sonradan beliren topak hareket).
    const local = (elapsedMs - (options.still ? 0 : index * options.lifeMs * 0.12)) / options.lifeMs;
    if (local < 0 || local >= 1) continue;
    const motion = options.still ? 0 : local;
    const ox = (hashNoise(base + 1) - 0.5) * options.radius * 1.4;
    const oy = -options.rise * motion * (0.7 + hashNoise(base + 2) * 0.6);
    const r = options.radius * (0.65 + hashNoise(base + 3) * 0.45) * (1 + options.grow * motion);
    const alpha = options.alpha * (local < 0.12 ? local / 0.12 : 1 - (local - 0.12) / 0.88);
    g.fillStyle(options.color, clamp01(alpha));
    fillFan(g, x + ox, y + oy, r, r * 0.9, 6, hashNoise(base + 4) * Math.PI);
  }
}

/**
 * Yer izi: yere yatik koyu bir leke, kenari daha soluk. Iki yelpaze (8
 * kenar); `age` 0..1 sonme.
 */
export function drawScorch(g: VfxGraphics, x: number, y: number, age: number, rx: number, ry: number, color: number, alpha: number, seed: number) {
  if (age >= 1 || alpha <= 0) return;
  const fade = Math.pow(1 - age, 1.4);
  const rotation = hashNoise(seed + 7) * 0.6 - 0.3;
  g.fillStyle(color, clamp01(alpha * 0.45 * fade));
  fillFan(g, x, y, rx, ry, 8, rotation);
  g.fillStyle(color, clamp01(alpha * fade));
  fillFan(g, x + (hashNoise(seed + 8) - 0.5) * rx * 0.3, y, rx * 0.58, ry * 0.58, 6, rotation);
}

/** Elektrik catirtisinin noktalari (havuzlu; karede nesne yok). */
const CRACKLE_POINTS: Array<{ x: number; y: number }> = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));

export type CrackleOptions = {
  seed: number;
  count: number;
  reach: number;
  hue: number;
  width: number;
  alpha: number;
  /** Merkez yon ve yelpaze; `undefined` butun cevre. */
  heading: number | undefined;
  fan: number;
};

/**
 * Enerji vurusunun catirtisi: noktadan cikan kisa kirikli kollar. Ton kenarda
 * (genis, soluk), beyaz-sicak cekirdek ortada (ince). Uc parcali yol, her
 * parca tek cizgi (yol eklemi yok).
 */
export function drawCrackle(g: VfxGraphics, x: number, y: number, options: CrackleOptions) {
  if (options.count <= 0 || options.alpha <= 0) return;
  const core = whiteHot(options.hue, 0.6);
  for (let index = 0; index < options.count; index += 1) {
    const base = options.seed + index * 31;
    const angle = options.heading === undefined
      ? (index / options.count) * Math.PI * 2 + (hashNoise(base + 1) - 0.5) * 1.1
      : options.heading + (hashNoise(base + 1) - 0.5) * options.fan;
    const reach = options.reach * (0.55 + hashNoise(base + 2) * 0.45);
    fillJaggedPath(CRACKLE_POINTS, x, y, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, 3, base, reach * 0.55);
    g.lineStyle(Math.max(0.6, options.width * 2.2), options.hue, clamp01(options.alpha * 0.5));
    for (let step = 0; step < 3; step += 1) g.lineBetween(CRACKLE_POINTS[step].x, CRACKLE_POINTS[step].y, CRACKLE_POINTS[step + 1].x, CRACKLE_POINTS[step + 1].y);
    g.lineStyle(Math.max(0.5, options.width * 0.8), core, clamp01(options.alpha));
    for (let step = 0; step < 3; step += 1) g.lineBetween(CRACKLE_POINTS[step].x, CRACKLE_POINTS[step].y, CRACKLE_POINTS[step + 1].x, CRACKLE_POINTS[step + 1].y);
  }
}

/**
 * Sert mermi govdesi (slug / tracer): koyu kenarli ton, beyaz-sicak cekirdek,
 * parlak bas. `heat` cekirdegin beyaza cekilme orani (kademe yogunlugu),
 * `width` govdenin kalinligi (kademe agirligi).
 */
export function drawSlug(g: VfxGraphics, x: number, y: number, ux: number, uy: number, length: number, width: number, hue: number, heat: number, alpha = 1) {
  const tailX = x - ux * length;
  const tailY = y - uy * length;
  g.lineStyle(Math.max(0.8, width), hue, clamp01(0.95 * alpha));
  g.lineBetween(tailX, tailY, x, y);
  g.lineStyle(Math.max(0.6, width * 0.45), whiteHot(hue, heat), clamp01(alpha));
  g.lineBetween(tailX + ux * length * 0.3, tailY + uy * length * 0.3, x, y);
  const head = Math.max(0.7, width * 0.42);
  g.fillStyle(whiteHot(hue, Math.min(1, heat + 0.1)), clamp01(alpha));
  g.fillRect(x - head, y - head, head * 2, head * 2);
}

/**
 * Sert isin kesiti (lazer olmayan isinlar ve ip): koyu dusum (genis, soluk;
 * `glow` verilirse ADD katmaninda), tonun govdesi ve beyaz-sicak cekirdek.
 * Kademe govdeyi ve cekirdegi kalinlastiriyor; pastel ara ton yok. Lazerin
 * `strokeProfile`i (omuzlar, %45 cekilmis cekirdek) lazerin kendisinde kaliyor.
 */
export function strokeHardBeam(
  g: VfxGraphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  hue: number,
  tier: number,
  options: { body: number; spread: number },
  glow?: VfxGraphics,
  alpha = 1
) {
  const level = tier >= 3 ? 2 : tier >= 2 ? 1 : 0;
  if (level > 0) {
    const falloff = glow ?? g;
    falloff.lineStyle(options.body + options.spread * (level === 2 ? 1.4 : 1), darken(hue, 0.35), clamp01((level === 2 ? 0.22 : 0.16) * alpha));
    falloff.lineBetween(x1, y1, x2, y2);
  }
  g.lineStyle(Math.max(0.6, options.body), hue, clamp01(0.92 * alpha));
  g.lineBetween(x1, y1, x2, y2);
  g.lineStyle(Math.max(0.5, options.body * (0.3 + level * 0.08)), whiteHot(hue, level / 2), clamp01(0.95 * alpha));
  g.lineBetween(x1, y1, x2, y2);
}

/* ------------------------------------------------------------------ */
/* Islevsel isaretler: ince cizgi, kertik, ayrac. Sus degil, bilgi.      */
/* ------------------------------------------------------------------ */

const CORNER_SIGNS = [-1, 1] as const;

/**
 * Dort kose ayraci: nisangahin ve karantina karesinin govdesi.
 *
 * `halfWidth`/`halfHeight` kutunun yari boyu, `arm` kose kolunun boyu.
 * Sekiz cizgi; daire yok.
 */
export function drawBracketCorners(
  g: VfxGraphics,
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  arm: number,
  width: number,
  color: number,
  alpha: number
) {
  if (alpha <= 0 || width <= 0) return;
  g.lineStyle(width, color, clamp01(alpha));
  for (const sx of CORNER_SIGNS) {
    for (const sy of CORNER_SIGNS) {
      const cx = x + sx * halfWidth;
      const cy = y + sy * halfHeight;
      g.lineBetween(cx, cy, cx - sx * arm, cy);
      g.lineBetween(cx, cy, cx, cy - sy * arm);
    }
  }
}

const HEX_COS = new Float32Array(6);
const HEX_SIN = new Float32Array(6);
for (let index = 0; index < 6; index += 1) {
  HEX_COS[index] = Math.cos((index / 6) * Math.PI * 2);
  HEX_SIN[index] = Math.sin((index / 6) * Math.PI * 2);
}

/** Altigen cizgi: kapatma alaninin siniri ve kapanan kafes. Tek yol. */
export function strokeHex(g: VfxGraphics, x: number, y: number, radius: number, rotation: number) {
  if (!(radius > 0.5)) return;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  g.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const px = x + (HEX_COS[index] * cos - HEX_SIN[index] * sin) * radius;
    const py = y + (HEX_SIN[index] * cos + HEX_COS[index] * sin) * radius;
    if (index === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.strokePath();
}

/**
 * Tohumlu kirikli yol (simsek): noktalari cagiranin dizisine yaziyor.
 *
 * `segments`+1 nokta; uclar sabit, aradakiler dogruya dik `jitter` kadar
 * sapiyor. Dizi cagirandan: karede nesne uretilmiyor.
 */
export function fillJaggedPath(points: Array<{ x: number; y: number }>, x1: number, y1: number, x2: number, y2: number, segments: number, seed: number, jitter: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const offset = index === 0 || index === segments ? 0 : (hashNoise(seed + index * 13) - 0.5) * jitter;
    const point = points[index];
    point.x = x1 + dx * t + nx * offset;
    point.y = y1 + dy * t + ny * offset;
  }
}

/** Nokta dizisinin ilk `count` noktasindan tek kirikli cizgi. */
export function strokePolyline(g: VfxGraphics, points: ReadonlyArray<{ x: number; y: number }>, count: number, width: number, color: number, alpha: number) {
  if (count < 2 || alpha <= 0) return;
  g.lineStyle(Math.max(0.5, width), color, clamp01(alpha));
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < count; index += 1) g.lineTo(points[index].x, points[index].y);
  g.strokePath();
}
