/**
 * Atakan'in iki agir mermisi: Obsesyon'un bakisi ve Ucube'nin yuku.
 *
 * Ikisi de kademeyle yalnizca isinip kalinlasmiyor, bicim kazaniyor; ucusu
 * izlemek kendi basina bir sey anlatsin diye. Dil yine agir ve sert: kulenin
 * tonu, koyu dusum ve beyaz-sicak cekirdek; pastel, altin ve sus yok.
 *
 * - Obsesyon (bakis): kademe 1 badem bicimli bir mercek ve dikey yarik
 *   gozbebegi. Kademe 2 iris ve parlak kenar kazaniyor, arkasinda geriye
 *   acilan odak halkalari atiyor. Kademe 3'te iris donen diyafram kanatlariyla
 *   kapaniyor, arkada iki silik bakis kaliyor ve govdenin cevresinde iki
 *   kivilcim sarmal ciziyor.
 * - Ucube (yuk): kademe 1 kalin bir plazma kapsulu, basindan catirdayan iki
 *   kisa ark. Kademe 2'de bas yildirim topuna donuyor, iz kirikli bir simsek
 *   kuyruguna. Kademe 3'te topun cevresinde uc kondansator dugumu donuyor ve
 *   cekirdege ark atiyor, kuyruk catallaniyor, toptan kivilcim dokuluyor.
 *
 * Cizim her karede bastan ve deterministik: tohum mermi kimliginden, yeniden
 * tohumlama saatten (simsek 50 ms'de bir yeniden ciziliyor). Hareket
 * azaltmada donme, sarmal, nabiz ve dokulme yok; bicim yerinde. LOD
 * kivilcimlari kestiginde sarmal ve dokulen kivilcimlar da gidiyor.
 *
 * Maliyet: daire `fillDisc` (earcut yok), yaylar ve arklar `lineBetween`,
 * yalnizca uzun simsek kuyrugu yol olarak; kademe 3 mermi ~300 kose.
 */
import { clamp01, coolingColor, darken, fillDisc, hashNoise, whiteHot, type TrailEntry, type VfxGraphics, type VfxTier } from "./kit";
import type { VfxTierRecipe } from "./vfx-profiles";

export type AtakanShotInput = {
  x: number;
  y: number;
  /** Ucus yonu (radyan). */
  angle: number;
  /** Siluetin yari boyu, olcekli. */
  radius: number;
  scale: number;
  tier: VfxTier;
  recipe: VfxTierRecipe;
  hue: number;
  now: number;
  /** Mermi kimliginin ozeti. */
  seed: number;
  /** Hareket azaltma: donme, sarmal, nabiz ve dokulme yok. */
  still: boolean;
  /** LOD kivilcimlari kesmediyse. */
  sparks: boolean;
  /** Kademe 3 eklentilerinin alfasi: kendi kulende 1, takim arkadasinda soluk. */
  extra: number;
  /** Son konumlar (yeniden eskiye); kuyruk ve silik bakislar. */
  trail?: TrailEntry;
  trailCapacity: number;
  /** LOD'un iz carpani: kuyruk ve silik bakislar en son bununla kisaliyor. */
  trailScale: number;
};

/** Simsegin yeniden cizilme araligi (ms). */
export const SHOT_RESEED_MS = 50;

const POINT = { x: 0, y: 0 };
const BOLT_POINTS: Array<{ x: number; y: number }> = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));

/** Izin `back` kare onceki noktasi; `POINT`e yaziyor. Yoksa (ya da LOD izi kisalttiysa) false. */
function trailPoint(input: AtakanShotInput, back: number) {
  const trail = input.trail;
  if (!trail || back >= trail.count || back >= Math.max(2, Math.round(input.trailCapacity * input.trailScale))) return false;
  const index = (trail.head - 1 - back + input.trailCapacity * 2) % input.trailCapacity;
  POINT.x = trail.xs[index];
  POINT.y = trail.ys[index];
  return true;
}

/* ------------------------------------------------------------------ */
/* Obsesyon: bakis                                                      */
/* ------------------------------------------------------------------ */

/** Odak halkasinin bir dalgasinin omru (ms). */
const RIPPLE_MS = 460;
/** Diyafram kanatlarinin bir turu (ms). */
const IRIS_TURN_MS = 1400;
/** Sarmal kivilcimlarin bir turu (ms). */
const HELIX_TURN_MS = 520;
/** Kademe 3'un arkada kalan bakislari: [kac kare once, boy, alfa]. */
const GHOSTS = [[3, 0.82, 0.34], [6, 0.64, 0.18]] as const;

/**
 * Badem: ucus ekseni boyunca uzun, iki ucu sivri mercek. Merkezden yelpaze;
 * `segments` basina iki ucgen, earcut yok.
 */
function fillLens(g: VfxGraphics, x: number, y: number, ux: number, uy: number, length: number, half: number, segments = 5) {
  const nx = -uy;
  const ny = ux;
  const back = -length * 0.5;
  let upperX = x + ux * back;
  let upperY = y + uy * back;
  let lowerX = upperX;
  let lowerY = upperY;
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const along = back + length * t;
    const h = half * Math.pow(Math.sin(Math.PI * t), 0.7);
    const ax = x + ux * along;
    const ay = y + uy * along;
    const nextUpperX = ax + nx * h;
    const nextUpperY = ay + ny * h;
    const nextLowerX = ax - nx * h;
    const nextLowerY = ay - ny * h;
    g.fillTriangle(x, y, upperX, upperY, nextUpperX, nextUpperY);
    g.fillTriangle(x, y, lowerX, lowerY, nextLowerX, nextLowerY);
    upperX = nextUpperX;
    upperY = nextUpperY;
    lowerX = nextLowerX;
    lowerY = nextLowerY;
  }
}

/** Bakistan geriye acilan yaylar: merkezi govdede, yaricapi dalganin yasiyla. */
function drawFocusRipples(g: VfxGraphics, input: AtakanShotInput, count: number, inner: number, reach: number, width: number, alpha: number) {
  const back = input.angle + Math.PI;
  const span = Math.PI * 0.62;
  for (let ripple = 0; ripple < count; ripple += 1) {
    const phase = input.still ? (ripple + 0.5) / count : ((input.now / RIPPLE_MS) + ripple / count) % 1;
    const fade = (1 - phase) * alpha;
    if (fade <= 0.02) continue;
    const radius = inner + phase * reach;
    g.lineStyle(width * (1.2 - phase * 0.6), input.hue, clamp01(fade));
    let previousX = input.x + Math.cos(back - span / 2) * radius;
    let previousY = input.y + Math.sin(back - span / 2) * radius;
    for (let step = 1; step <= 4; step += 1) {
      const a = back - span / 2 + (span * step) / 4;
      const nextX = input.x + Math.cos(a) * radius;
      const nextY = input.y + Math.sin(a) * radius;
      g.lineBetween(previousX, previousY, nextX, nextY);
      previousX = nextX;
      previousY = nextY;
    }
  }
}

/**
 * Obsesyon'un mermisi: ucan bir goz.
 *
 * Ton kenarli badem, koyu ic ve ucus yonune dik beyaz-sicak bir yarik.
 * Kulenin kendisi tek, kirpmayan bir goz; mermisi o bakisin kendisi.
 */
export function drawObsessionShot(g: VfxGraphics, input: AtakanShotInput) {
  const { x, y, tier, recipe, hue, radius: r, scale } = input;
  const ux = Math.cos(input.angle);
  const uy = Math.sin(input.angle);
  const nx = -uy;
  const ny = ux;
  const weight = recipe.weight * recipe.thickness;
  const length = r * (1.9 + tier * 0.25);
  const half = r * (0.52 + tier * 0.1);
  const core = whiteHot(hue, recipe.heat);

  // Kademe 3: arkada kalan iki silik bakis.
  if (tier >= 3) {
    for (const [back, size, alpha] of GHOSTS) {
      if (!trailPoint(input, back)) continue;
      g.fillStyle(hue, alpha * input.extra);
      fillLens(g, POINT.x, POINT.y, ux, uy, length * size, half * size, 4);
    }
  }

  // Bakis izi: mercegin arkasindan sivrilen ton kamasi ve ortasinda ince
  // beyaz-sicak bir cizgi. Mercek izi ortecek kadar uzun oldugu icin genel
  // serit yerine bu: ucusun hizini o tasiyor.
  const streak = length * (0.95 + tier * 0.3);
  const baseX = x - ux * length * 0.42;
  const baseY = y - uy * length * 0.42;
  const tipX = baseX - ux * streak;
  const tipY = baseY - uy * streak;
  g.fillStyle(hue, 0.4 + tier * 0.06);
  g.fillTriangle(baseX + nx * half * 0.6, baseY + ny * half * 0.6, baseX - nx * half * 0.6, baseY - ny * half * 0.6, tipX, tipY);
  // Bakisin omurgasi: soluk, kademeyle kalinlasan ton ve icinde beyaz-sicak cizgi.
  g.lineStyle(r * 0.3 * weight, hue, 0.35);
  g.lineBetween(baseX, baseY, baseX - ux * streak * 0.75, baseY - uy * streak * 0.75);
  g.lineStyle(0.42 * scale * weight, whiteHot(hue, recipe.heat * 0.7), 0.55);
  g.lineBetween(baseX, baseY, baseX - ux * streak * 0.6, baseY - uy * streak * 0.6);

  // Kademe 2+: geriye acilan odak halkalari.
  if (tier >= 2) {
    drawFocusRipples(g, input, tier >= 3 ? 3 : 2, half * 1.15, r * (1.4 + tier * 0.45), 0.65 * scale * weight, tier >= 3 ? 0.95 : 0.8);
  }

  // Govde: ton kenari, koyu ic.
  g.fillStyle(hue, 0.95);
  fillLens(g, x, y, ux, uy, length, half);
  g.fillStyle(darken(hue, 0.82), 0.96);
  fillLens(g, x, y, ux, uy, length * 0.76, half * 0.68);

  // Kademe 2+: iris ve on kenarda ince bir isik. Isik sol ustten (kule
  // resimleriyle ayni): parlak kenar mercegin o yana bakan tarafi.
  if (tier >= 2) {
    g.fillStyle(hue, 0.92);
    fillDisc(g, x, y, half * 0.46);
    const side = nx + ny <= 0 ? 1 : -1;
    g.lineStyle(0.5 * scale * weight, whiteHot(hue, recipe.heat * 0.6), 0.7);
    let previousX = 0;
    let previousY = 0;
    for (let step = 0; step <= 2; step += 1) {
      const t = 0.5 + step * 0.17;
      const along = -length * 0.5 + length * t;
      const lift = side * half * 0.86 * Math.pow(Math.sin(Math.PI * t), 0.7);
      const pointX = x + ux * along + nx * lift;
      const pointY = y + uy * along + ny * lift;
      if (step > 0) g.lineBetween(previousX, previousY, pointX, pointY);
      previousX = pointX;
      previousY = pointY;
    }
  }

  // Gozbebegi: ucus yonune dik yarik.
  const pupilHeight = half * (0.55 + tier * 0.05);
  const pupilWidth = half * 0.15 * Math.sqrt(weight);
  g.fillStyle(core, 1);
  g.fillTriangle(x + nx * pupilHeight, y + ny * pupilHeight, x + ux * pupilWidth, y + uy * pupilWidth, x - ux * pupilWidth, y - uy * pupilWidth);
  g.fillTriangle(x - nx * pupilHeight, y - ny * pupilHeight, x + ux * pupilWidth, y + uy * pupilWidth, x - ux * pupilWidth, y - uy * pupilWidth);

  if (tier < 3) return;

  // Kademe 3: irisin uzerinde donen dort diyafram kanadi.
  const turn = input.still ? 0 : (input.now / IRIS_TURN_MS) * Math.PI * 2;
  g.lineStyle(0.6 * scale * weight, core, 0.9 * input.extra);
  for (let blade = 0; blade < 4; blade += 1) {
    const a = turn + (blade * Math.PI) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    g.lineBetween(x + cos * half * 0.3, y + sin * half * 0.3, x + cos * half * 0.5, y + sin * half * 0.5);
  }

  // Kademe 3: govdenin arkasinda sarmal ciken iki kivilcim.
  if (!input.still && input.sparks) {
    const spin = (input.now / HELIX_TURN_MS) * Math.PI * 2;
    for (let spark = 0; spark < 2; spark += 1) {
      const phase = spin + spark * Math.PI;
      const depth = Math.cos(phase);
      const back = length * 0.5 + spark * r * 0.55;
      const lateral = Math.sin(phase) * half * 1.35;
      const size = (0.75 + 0.35 * depth) * scale * Math.sqrt(weight);
      g.fillStyle(whiteHot(hue, recipe.heat * 0.85), (0.55 + 0.35 * depth) * input.extra);
      g.fillRect(x - ux * back + nx * lateral - size / 2, y - uy * back + ny * lateral - size / 2, size, size);
    }
  }
}


/* ------------------------------------------------------------------ */
/* Ucube: yuk                                                           */
/* ------------------------------------------------------------------ */

/** Uydularin bir turu (ms). */
const RING_TURN_MS = 900;
/** Topun nabzi (ms). */
const PULSE_MS = 340;
/** Dokulen kivilcimin omru (ms). */
const SHED_MS = 260;
const SHED_COUNT = 5;

/** Ince catirti: `from`dan `to`ya uc parcali kirikli cizgi. */
function drawFilament(g: VfxGraphics, fromX: number, fromY: number, toX: number, toY: number, seed: number, jitter: number) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  let previousX = fromX;
  let previousY = fromY;
  for (let step = 1; step <= 3; step += 1) {
    const t = step / 3;
    const offset = step === 3 ? 0 : (hashNoise(seed + step * 13) - 0.5) * jitter;
    const pointX = fromX + dx * t + nx * offset;
    const pointY = fromY + dy * t + ny * offset;
    g.lineBetween(previousX, previousY, pointX, pointY);
    previousX = pointX;
    previousY = pointY;
  }
}

/**
 * Topun arkasindaki kirikli simsek kuyrugu: ucusun tersine `segments` parca,
 * sapma kuyruga dogru buyuyor. Uc kesimde sivriliyor (her kesim tek yol:
 * kirilma noktalari dikissiz); bas kesiminde beyaz-sicak damar. Noktalar
 * `BOLT_POINTS`ta kaliyor (catal icin).
 */
function drawBoltTail(g: VfxGraphics, input: AtakanShotInput, ux: number, uy: number, nx: number, ny: number, startBack: number, length: number, segments: number, jitter: number, width: number, reseed: number) {
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const back = startBack + length * t;
    const offset = index === 0 ? 0 : (hashNoise(input.seed + reseed + index * 17) - 0.5) * jitter * (0.4 + 0.6 * t);
    BOLT_POINTS[index].x = input.x - ux * back + nx * offset;
    BOLT_POINTS[index].y = input.y - uy * back + ny * offset;
  }
  const first = Math.ceil(segments / 3);
  const second = Math.ceil((segments * 2) / 3);
  strokeBoltSpan(g, 0, first, width, input.hue, 0.95);
  strokeBoltSpan(g, first, second, width * 0.6, input.hue, 0.85);
  strokeBoltSpan(g, second, segments, width * 0.32, input.hue, 0.7);
  strokeBoltSpan(g, 0, first, width * 0.34, whiteHot(input.hue, input.recipe.heat * 0.8), 0.95);
}

/** `BOLT_POINTS`un `from`..`to` araligi tek yol olarak. */
function strokeBoltSpan(g: VfxGraphics, from: number, to: number, width: number, color: number, alpha: number) {
  if (to <= from || alpha <= 0) return;
  g.lineStyle(Math.max(0.5, width), color, clamp01(alpha));
  g.beginPath();
  g.moveTo(BOLT_POINTS[from].x, BOLT_POINTS[from].y);
  for (let index = from + 1; index <= to; index += 1) g.lineTo(BOLT_POINTS[index].x, BOLT_POINTS[index].y);
  g.strokePath();
}

/**
 * Ucube'nin mermisi: tasidigi yuk.
 *
 * Kademe 1 sivrilen bir plazma damlasi; kademe 2'de yildirim topu ve uzun
 * kirikli simsek kuyrugu; kademe 3'te asiri yuklenmis cekirdek: cevresinde
 * donen uc uydu, catallanan kuyruk ve dokulen kivilcimlar. Kalinlik
 * (`thickness`) cizgileri ve topun capini buyutuyor, boyu degil.
 */
export function drawUcubeShot(g: VfxGraphics, input: AtakanShotInput) {
  const { x, y, tier, recipe, hue, radius: r } = input;
  const ux = Math.cos(input.angle);
  const uy = Math.sin(input.angle);
  const nx = -uy;
  const ny = ux;
  const thick = recipe.thickness;
  const weight = recipe.weight * thick;
  const core = whiteHot(hue, recipe.heat);
  const filament = whiteHot(hue, recipe.heat * 0.8);
  const reseed = input.still ? 0 : Math.floor(input.now / SHOT_RESEED_MS) * 7;

  if (tier === 1) {
    // Plazma damlasi: koyu ton kama, ton ic kama, beyaz-sicak damar ve bas.
    const head = r * 0.4 * thick;
    const tail = r * 2.6;
    g.fillStyle(darken(hue, 0.3), 0.85);
    g.fillTriangle(x + nx * head, y + ny * head, x - nx * head, y - ny * head, x - ux * tail, y - uy * tail);
    g.fillStyle(hue, 0.9);
    g.fillTriangle(x + nx * head * 0.55, y + ny * head * 0.55, x - nx * head * 0.55, y - ny * head * 0.55, x - ux * tail * 0.7, y - uy * tail * 0.7);
    g.lineStyle(r * 0.12 * weight, core, 0.9);
    g.lineBetween(x - ux * tail * 0.45, y - uy * tail * 0.45, x, y);
    g.fillStyle(hue, 1);
    fillDisc(g, x, y, head);
    g.fillStyle(core, 1);
    fillDisc(g, x, y, head * 0.5);
    g.lineStyle(r * 0.05 * weight, filament, 0.9);
    for (let arc = 0; arc < 2; arc += 1) {
      const a = input.angle + (hashNoise(input.seed + reseed + arc * 5) - 0.5) * Math.PI * 1.2;
      const reach = head + r * (0.5 + hashNoise(input.seed + reseed + arc * 11) * 0.4) * thick;
      drawFilament(g, x + Math.cos(a) * head, y + Math.sin(a) * head, x + Math.cos(a) * reach, y + Math.sin(a) * reach, input.seed + reseed + arc * 3, r * 0.35 * thick);
    }
    return;
  }

  const pulse = input.still ? 1 : 1 + 0.08 * Math.sin((input.now / PULSE_MS) * Math.PI * 2);
  const orb = r * (tier >= 3 ? 0.62 : 0.52) * thick * pulse;

  // Simsek kuyrugu: topun arkasindan; LOD en son onu kisaltiyor.
  const segments = tier >= 3 ? 7 : 6;
  drawBoltTail(g, input, ux, uy, nx, ny, orb * 0.6, r * (2.6 + tier * 0.7) * input.trailScale, segments, r * (0.55 + tier * 0.15) * thick, r * 0.3 * weight, reseed);

  // Kademe 3: kuyrugun ortasindan disa, tonun renginde bir catal.
  if (tier >= 3) {
    const fork = BOLT_POINTS[2];
    const side = hashNoise(input.seed + reseed + 41) > 0.5 ? 1 : -1;
    const reach = r * 1.05 * thick;
    g.lineStyle(r * 0.1 * weight, hue, 0.85 * input.extra);
    drawFilament(g, fork.x, fork.y, fork.x - ux * reach * 0.6 + nx * side * reach, fork.y - uy * reach * 0.6 + ny * side * reach, input.seed + reseed + 43, r * 0.45 * thick);
  }

  // Yildirim topu: ton govde, beyaz-sicak cekirdek; hale ADD isisinde.
  g.fillStyle(hue, 0.95);
  fillDisc(g, x, y, orb);
  g.fillStyle(core, 1);
  fillDisc(g, x, y, orb * 0.55);

  // Topun yuzeyinden catirdayan ince arklar, ucus yonune egilimli.
  g.lineStyle(r * 0.05 * weight, filament, 0.9);
  const arcs = tier >= 3 ? 4 : 3;
  for (let arc = 0; arc < arcs; arc += 1) {
    const a = input.angle + (hashNoise(input.seed + reseed + arc * 5) - 0.5) * Math.PI * 1.7;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const reach = orb * (1.5 + hashNoise(input.seed + reseed + arc * 11) * 0.6);
    drawFilament(g, x + cos * orb, y + sin * orb, x + cos * reach, y + sin * reach, input.seed + reseed + arc * 3, orb * 0.5);
  }

  if (tier < 3) return;

  // Kademe 3: topun cevresinde donen uc uydu; cekirdekten onlara yanip sonen ark.
  const turn = input.still ? 0 : (input.now / RING_TURN_MS) * Math.PI * 2;
  const ringRadius = orb * 1.75;
  for (let index = 0; index < 3; index += 1) {
    const a = turn + (index * Math.PI * 2) / 3;
    const satelliteX = x + Math.cos(a) * ringRadius;
    const satelliteY = y + Math.sin(a) * ringRadius;
    if (input.still || hashNoise(input.seed + reseed + index * 29) > 0.3) {
      g.lineStyle(r * 0.05 * weight, filament, 0.7 * input.extra);
      drawFilament(g, x + Math.cos(a) * orb, y + Math.sin(a) * orb, satelliteX, satelliteY, input.seed + reseed + index * 31, orb * 0.35);
    }
    g.fillStyle(hue, 0.95 * input.extra);
    fillDisc(g, satelliteX, satelliteY, r * 0.18 * thick);
    g.fillStyle(core, input.extra);
    fillDisc(g, satelliteX, satelliteY, r * 0.09 * thick);
  }

  // Kademe 3: toptan geriye dokulen kivilcimlar; dogarken beyaz-sicak, sonra ton, sonra koyu.
  if (input.still || !input.sparks) return;
  for (let spark = 0; spark < SHED_COUNT; spark += 1) {
    const cycle = input.now / SHED_MS + spark / SHED_COUNT;
    const age = cycle % 1;
    const generation = Math.floor(cycle);
    const lateral = (hashNoise(input.seed + spark * 13 + generation * 7) - 0.5) * 2;
    const back = orb + age * r * 3.2;
    const spread = orb * (0.6 + age * 1.6) * lateral;
    const sparkX = x - ux * back + nx * spread;
    const sparkY = y - uy * back + ny * spread;
    const streak = r * 0.55 * (1 - age);
    g.lineStyle(r * 0.08 * weight * (1 - age * 0.5), coolingColor(hue, age), (1 - age) * 0.9 * input.extra);
    g.lineBetween(sparkX, sparkY, sparkX + ux * streak, sparkY + uy * streak);
  }
}
