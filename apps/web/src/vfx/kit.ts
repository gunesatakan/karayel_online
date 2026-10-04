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

/**
 * Noktanin kesiti: ayni merdiven, ic ice dairelerle.
 *
 * Mermi govdeleri, carpma cekirdekleri ve kule cekirdekleri icin. `radius`
 * govdenin yaricapi; omuzlar `spread` kadar disa tasiyor.
 */
export function strokePointProfile(
  g: VfxGraphics,
  x: number,
  y: number,
  color: number,
  tier: number,
  options: { radius: number; spread: number },
  glow?: VfxGraphics,
  alpha = 1
) {
  const { radius } = options;
  if (tier < 2) {
    g.fillStyle(color, PROFILE_FLAT_ALPHA * alpha);
    fillDisc(g, x, y, radius);
    return;
  }
  const spread = tier >= 3 ? options.spread * PROFILE_TIER3_SPREAD : options.spread;
  const omuzlar = tier >= 3 ? PROFILE_SHOULDERS[3] : PROFILE_SHOULDERS[2];
  const shoulderTarget = glow ?? g;
  for (const [olcek, alfa] of omuzlar) {
    shoulderTarget.fillStyle(color, alfa * alpha);
    fillDisc(shoulderTarget, x, y, radius + spread * olcek);
  }
  g.fillStyle(color, PROFILE_BODY_ALPHA * alpha);
  fillDisc(g, x, y, radius);
  g.fillStyle(liftToWhite(color, PROFILE_CORE.lift), PROFILE_CORE.alpha * alpha);
  fillDisc(g, x, y, radius * PROFILE_CORE.width);
  g.fillStyle(liftToWhite(color, PROFILE_FILAMENT.lift), PROFILE_FILAMENT.alpha * alpha);
  fillDisc(g, x, y, Math.max(0.6, radius * PROFILE_FILAMENT.width * 1.6));
}

/**
 * Halkanin kesiti: genisleyen carpma halkalari ve kule halkalari icin.
 * Kademe 1 tek cizgi; 2 ve 3'te omuzlar halkanin iki yanina tasiyor.
 */
export function strokeRingProfile(
  g: VfxGraphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  tier: number,
  options: { width: number; spread: number },
  glow?: VfxGraphics,
  alpha = 1
) {
  if (radius <= 0.5) return;
  const { width } = options;
  if (tier < 2) {
    g.lineStyle(Math.max(0.6, width), color, PROFILE_FLAT_ALPHA * alpha);
    strokeRing(g, x, y, radius);
    return;
  }
  const spread = tier >= 3 ? options.spread * PROFILE_TIER3_SPREAD : options.spread;
  const omuzlar = tier >= 3 ? PROFILE_SHOULDERS[3] : PROFILE_SHOULDERS[2];
  const shoulderTarget = glow ?? g;
  for (const [olcek, alfa] of omuzlar) {
    shoulderTarget.lineStyle(width + spread * olcek, color, alfa * alpha);
    strokeRing(shoulderTarget, x, y, radius);
  }
  g.lineStyle(Math.max(0.6, width), color, PROFILE_BODY_ALPHA * alpha);
  strokeRing(g, x, y, radius);
  g.lineStyle(Math.max(0.6, width * PROFILE_FILAMENT.width * 2), liftToWhite(color, PROFILE_FILAMENT.lift), PROFILE_FILAMENT.alpha * alpha);
  strokeRing(g, x, y, radius);
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

/** Noktasal hale: ic ice dairelerle ayni nefes (mermi ve carpma icin). */
export function drawPointCorona(
  g: VfxGraphics,
  x: number,
  y: number,
  now: number,
  options: { radius: number; layers: number; step: number; color: number; alpha: number; period: number; phase?: number }
) {
  const breath = 0.5 + Math.sin(now / options.period + (options.phase ?? 0)) * 0.5;
  for (let layer = options.layers; layer >= 1; layer -= 1) {
    g.fillStyle(options.color, options.alpha * (0.75 + breath * 0.5));
    fillDisc(g, x, y, options.radius + layer * options.step * (0.85 + breath * 0.3));
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

/**
 * Noktadan sacilan kivilcimlar (carpma korleri); durumsuz ve tohumlu.
 *
 * `age` 0..1 olayin yasi; kivilcimlar disa kosuyor, hafifce dusuyor ve
 * sonuyor. Yon ve hiz yalnizca `seed`den: olay kimligi ayni oldukca her
 * istemcide ayni yere.
 */
export function drawPointSparks(
  g: VfxGraphics,
  x: number,
  y: number,
  age: number,
  options: {
    seed: number;
    count: number;
    reach: number;
    color: number;
    width: number;
    alpha: number;
    /** Merkez yon (radyan) ve yelpaze; yoksa butun cevre. */
    heading?: number;
    fan?: number;
    gravity?: number;
    tail?: number;
  }
) {
  if (age >= 1 || options.count <= 0) return;
  const fade = Math.pow(1 - age, 1.5);
  const travel = Math.pow(age, 0.55);
  const gravity = options.gravity ?? 0;
  for (let index = 0; index < options.count; index += 1) {
    const roll = hashNoise(options.seed + index * 13 + 1);
    const angle = options.heading === undefined
      ? (index / options.count) * Math.PI * 2 + (roll - 0.5) * 0.9
      : options.heading + (roll - 0.5) * (options.fan ?? Math.PI);
    const speed = 0.55 + hashNoise(options.seed + index * 13 + 2) * 0.45;
    const reach = options.reach * speed * travel;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const px = x + ux * reach;
    const py = y + uy * reach + age * age * gravity;
    const tail = (options.tail ?? 3) * (1 - age * 0.5);
    g.lineStyle(options.width, index % 3 === 0 ? liftToWhite(options.color, 0.7) : options.color, options.alpha * fade);
    g.lineBetween(px, py, px - ux * tail, py - uy * tail);
  }
}

/**
 * Noktasal zerreler: ust kademede merminin ya da isinin cevresine dokulen.
 *
 * Konum yalnizca tohumdan ve kusaktan; mermi uctukca geride kalanlar o
 * anki konuma gore cizildigi icin iz gibi okunuyor.
 */
export function drawMotes(
  g: VfxGraphics,
  x: number,
  y: number,
  now: number,
  options: { seed: number; count: number; radius: number; color: number; size: number; alpha: number; lifeMs: number }
) {
  for (let index = 0; index < options.count; index += 1) {
    const durationMs = options.lifeMs * (0.7 + hashNoise(options.seed + index * 5 + 1) * 0.6);
    const phase = now / durationMs + hashNoise(options.seed + index * 5 + 2) * 10;
    const generation = Math.floor(phase);
    const life = phase - generation;
    const seed = options.seed + index * 5 + generation * 97;
    const angle = hashNoise(seed) * Math.PI * 2;
    const reach = options.radius * (0.4 + hashNoise(seed + 1) * 0.6) * (0.6 + life * 0.6);
    g.fillStyle(index % 3 === 0 ? liftToWhite(options.color, 0.8) : options.color, options.alpha * sparkGlow(life));
    fillDisc(g, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach - life * options.radius * 0.35, options.size * (1 - life * 0.4));
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

/** Sicak nokta: vurusun dustugu yer, beyaza cekilmis cekirdek renginde. */
export function drawHotDot(g: VfxGraphics, x: number, y: number, color: number, radius: number, alpha: number) {
  g.fillStyle(color, alpha);
  fillDisc(g, x, y, radius);
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
