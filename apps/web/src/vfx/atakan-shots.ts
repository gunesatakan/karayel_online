/**
 * Atakan'in iki agir mermisi: Obsesyon'un bakisi ve Ucube'nin yuku.
 *
 * Kademe (seviye 5 ve 10) mermiyi buyutmuyor: boy, kalinlik ve kuyruk her
 * kademede ayni zarfta. Kademeyi renk ve zarfin icindeki efekt anlatiyor.
 * Dil yine agir ve sert: kulenin tonu, koyu dusum, beyaz-sicak cekirdek,
 * ince keskin arklar ve kisa kivilcim; pastel, altin, yildiz ve sus yok.
 *
 * - Obsesyon (bakis): badem bicimli mercek ve dikey yarik gozbebegi.
 *   Kademe 1 mor. Kademe 2 kizil-eflatun: iris, parlak kenar, mercegin
 *   icinde donen ince odak arklari, kuyrukta titreyen isi cizgisi ve
 *   kuyruktan dokulen iki kivilcim. Kademe 3 kan kirmizisi: donen diyafram
 *   kanatlari, govdenin arkasinda sarmal ciken iki kivilcim, dort kivilcim.
 * - Ucube (yuk): sivrilen plazma damlasi, basindan catirdayan arklar.
 *   Kademe 1 limon. Kademe 2 iyon yesili: damarin yerinde kirikli simsek,
 *   basin cevresinde yanip sonen ince halka, uc ark. Kademe 3 asiri yuklu
 *   mavi: catal, basin cevresinde donen uc kucuk uydu, dort ark, kuyruk
 *   boyunca dokulen kivilcimlar.
 *
 * Cizim her karede bastan ve deterministik: tohum mermi kimliginden, yeniden
 * tohumlama saatten (simsek 50 ms'de bir yeniden ciziliyor). Hareket
 * azaltmada donme, sarmal, titreme, yanip sonme ve dokulme yok; bicim
 * yerinde. LOD kivilcimlari kestiginde sarmal ve dokulen kivilcimlar gidiyor.
 *
 * Maliyet: daire `fillDisc` (earcut yok), yaylar ve arklar `lineBetween`,
 * yol yok; kademe 3 mermi ~370 kose.
 */
import { OBSESSION_SHOT_BODY, UCUBE_SHOT_BODY, getProjectileDiscSides } from "@karayel/shared";
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
  /** Kademenin tonu (`getAtakanShotHue`). */
  hue: number;
  now: number;
  /** Mermi kimliginin ozeti. */
  seed: number;
  /** Hareket azaltma: donme, sarmal, titreme ve dokulme yok. */
  still: boolean;
  /** LOD kivilcimlari kesmediyse. */
  sparks: boolean;
  /** Kademe 2-3 eklentilerinin alfasi: kendi kulende 1, takim arkadasinda soluk. */
  extra: number;
  /** Son konumlar (yeniden eskiye). */
  trail?: TrailEntry;
  trailCapacity: number;
  /** LOD'un iz carpani: simsek damari en son bununla kisaliyor. */
  trailScale: number;
};

/** Simsegin yeniden cizilme araligi (ms). */
export const SHOT_RESEED_MS = 50;

/**
 * Kademe tonlari [kademe 2, kademe 3]; kademe 1 profilin kendi tonu.
 *
 * Obsesyon: mor bakis -> kizil-eflatun takinti -> kan kirmizisi.
 * Ucube: limon plazma -> iyon yesili -> asiri yuklu mavi (ark ne kadar
 * sicaksa o kadar maviye kayiyor).
 */
export const OBSESSION_TIER_HUES = [0xc2367f, 0xc43a48] as const;
export const UCUBE_TIER_HUES = [0x3cc495, 0x5aa6d0] as const;

/** Mermi govdesinin ve isi damgasinin tonu: kademe 1'de profilin, sonra kademenin. */
export function getAtakanShotHue(silhouette: string, tier: VfxTier, base: number) {
  if (tier <= 1) return base;
  if (silhouette === "gaze") return OBSESSION_TIER_HUES[tier - 2];
  if (silhouette === "arc") return UCUBE_TIER_HUES[tier - 2];
  return base;
}

/** Govdenin kalinligi: eski kademe 1'in 2/3'u, her kademede. */
const OBSESSION_THICKNESS = OBSESSION_SHOT_BODY.thickness;
/** Ucube mermisinin boyu: eski kademe 1'in 3/4'u, her kademede. */
const UCUBE_SHOT_SIZE = UCUBE_SHOT_BODY.size;

/**
 * Isi damgasinin capi: kademeyle buyumuyor. Obsesyon 2/3 inceldi, Ucube
 * 3/4'e kucukdu; damga da onlarla.
 */
export function getAtakanShotGlowSize(silhouette: string, radius: number, thickness: number) {
  return radius * 2.6 * Math.sqrt(thickness) * (silhouette === "arc" ? UCUBE_SHOT_SIZE : OBSESSION_THICKNESS);
}

const BOLT_POINTS: Array<{ x: number; y: number }> = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));

/* ------------------------------------------------------------------ */
/* Obsesyon: bakis                                                      */
/* ------------------------------------------------------------------ */

/** Mercegin boyu (`radius` carpani): eski kademe 1 (1.9 + 0.25). */
const OBSESSION_LENGTH = OBSESSION_SHOT_BODY.length;
/** Mercegin yari eni: eski kademe 1 (0.52 + 0.1), 2/3. */
const OBSESSION_HALF = OBSESSION_SHOT_BODY.half * OBSESSION_THICKNESS;
/** Bakis kuyrugu (mercek boyu carpani): eski kademe 1 (0.95 + 0.3), yarisi. */
const OBSESSION_TAIL = 1.25 / 2;
/** Odak arklarinin bir turu (ms). */
const FOCUS_TURN_MS = 1100;
/** Diyafram kanatlarinin bir turu (ms). */
const IRIS_TURN_MS = 1400;
/** Sarmal kivilcimlarin bir turu (ms). */
const HELIX_TURN_MS = 520;
/** Kuyruktaki isi titremesi (ms). */
const SHIMMER_MS = 160;
/** Dokulen kivilcimin omru (ms). */
const SHED_MS = 260;

/**
 * Badem: ucus ekseni boyunca uzun, iki ucu sivri mercek. Merkezden yelpaze;
 * `segments` basina iki ucgen, earcut yok.
 */
function fillLens(g: VfxGraphics, x: number, y: number, ux: number, uy: number, length: number, half: number, segments: number = OBSESSION_SHOT_BODY.lensSegments) {
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
    const h = half * Math.pow(Math.sin(Math.PI * t), OBSESSION_SHOT_BODY.lensExponent);
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

/**
 * Kuyruktan dokulen kivilcimlar: `from`dan geriye `reach` kadar suzulup
 * soguyor (beyaz-sicak -> ton -> koyu); yanal sapma `spread` icinde.
 * `cool` > 0 kivilcimi sogumanin o noktasindan baslatiyor: kademe 2'de
 * tonda dogan kor, kademe 3'te beyaz-sicak.
 */
function shedSparks(g: VfxGraphics, input: AtakanShotInput, count: number, from: number, reach: number, spread: number, width: number, streakLength: number, cool = 0) {
  const ux = Math.cos(input.angle);
  const uy = Math.sin(input.angle);
  const nx = -uy;
  const ny = ux;
  for (let spark = 0; spark < count; spark += 1) {
    const cycle = input.now / SHED_MS + spark / count;
    const age = cycle % 1;
    const generation = Math.floor(cycle);
    const lateral = (hashNoise(input.seed + spark * 13 + generation * 7) - 0.5) * 2;
    const back = from + age * reach;
    const offset = spread * (0.35 + age * 0.65) * lateral;
    const sparkX = input.x - ux * back + nx * offset;
    const sparkY = input.y - uy * back + ny * offset;
    const streak = streakLength * (1 - age);
    g.lineStyle(width * (1 - age * 0.5), coolingColor(input.hue, cool + age * (1 - cool)), (1 - age) * 0.9 * input.extra);
    g.lineBetween(sparkX, sparkY, sparkX + ux * streak, sparkY + uy * streak);
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
  // Kalinlik kademeyle artmiyor: cizgiler her kademede ayni.
  const weight = OBSESSION_THICKNESS * recipe.thickness;
  const length = r * OBSESSION_LENGTH;
  const half = r * OBSESSION_HALF;
  const core = whiteHot(hue, recipe.heat);

  // Bakis izi: mercegin arkasindan sivrilen ton kamasi ve ortasinda ince
  // beyaz-sicak bir cizgi; ucusun hizini o tasiyor.
  const streak = length * OBSESSION_TAIL;
  const baseX = x - ux * length * 0.42;
  const baseY = y - uy * length * 0.42;
  const tipX = baseX - ux * streak;
  const tipY = baseY - uy * streak;
  g.fillStyle(hue, 0.4 + tier * 0.06);
  g.fillTriangle(baseX + nx * half * 0.6, baseY + ny * half * 0.6, baseX - nx * half * 0.6, baseY - ny * half * 0.6, tipX, tipY);
  g.lineStyle(r * 0.3 * weight, hue, 0.35);
  g.lineBetween(baseX, baseY, baseX - ux * streak * 0.75, baseY - uy * streak * 0.75);
  const vein = whiteHot(hue, recipe.heat * 0.7);
  if (tier === 1) {
    g.lineStyle(0.42 * scale * weight, vein, 0.55);
    g.lineBetween(baseX, baseY, baseX - ux * streak * 0.6, baseY - uy * streak * 0.6);
  } else {
    // Kademe 2+: isi titremesi -- damar uc kirikla titriyor, kuyrugun icinde.
    g.lineStyle(0.42 * scale * weight, vein, 0.7);
    const wobble = input.still ? 0 : input.now / SHIMMER_MS;
    let previousX = baseX;
    let previousY = baseY;
    for (let step = 1; step <= 3; step += 1) {
      const along = (streak * 0.8 * step) / 3;
      const lift = step === 3 ? 0 : Math.sin(wobble * Math.PI * 2 + step * 1.9) * half * 0.22 * (1 - step / 3);
      const pointX = baseX - ux * along + nx * lift;
      const pointY = baseY - uy * along + ny * lift;
      g.lineBetween(previousX, previousY, pointX, pointY);
      previousX = pointX;
      previousY = pointY;
    }
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

    // Odak arklari: irisin cevresinde donen ince keskin yaylar, mercegin icinde.
    const arcs = tier >= 3 ? 3 : 2;
    const turn = input.still ? 0 : (input.now / FOCUS_TURN_MS) * Math.PI * 2;
    const flicker = input.still ? 1 : 0.55 + 0.45 * hashNoise(input.seed + Math.floor(input.now / SHOT_RESEED_MS) * 3);
    const ringRadius = half * 0.72;
    g.lineStyle(0.32 * scale * weight, whiteHot(hue, recipe.heat * 0.8), clamp01(0.85 * flicker * input.extra));
    for (let arc = 0; arc < arcs; arc += 1) {
      const start = turn + (arc * Math.PI * 2) / arcs;
      let previousArcX = x + Math.cos(start) * ringRadius;
      let previousArcY = y + Math.sin(start) * ringRadius;
      for (let step = 1; step <= 2; step += 1) {
        const a = start + step * 0.45;
        const pointX = x + Math.cos(a) * ringRadius;
        const pointY = y + Math.sin(a) * ringRadius;
        g.lineBetween(previousArcX, previousArcY, pointX, pointY);
        previousArcX = pointX;
        previousArcY = pointY;
      }
    }
  }

  // Gozbebegi: ucus yonune dik yarik.
  const pupilHeight = half * 0.6;
  const pupilWidth = half * 0.15 * Math.sqrt(weight);
  g.fillStyle(core, 1);
  g.fillTriangle(x + nx * pupilHeight, y + ny * pupilHeight, x + ux * pupilWidth, y + uy * pupilWidth, x - ux * pupilWidth, y - uy * pupilWidth);
  g.fillTriangle(x - nx * pupilHeight, y - ny * pupilHeight, x + ux * pupilWidth, y + uy * pupilWidth, x - ux * pupilWidth, y - uy * pupilWidth);

  if (tier < 2) return;

  // Kademe 3: irisin uzerinde donen dort diyafram kanadi.
  if (tier >= 3) {
    const turn = input.still ? 0 : (input.now / IRIS_TURN_MS) * Math.PI * 2;
    g.lineStyle(0.6 * scale * weight, core, 0.9 * input.extra);
    for (let blade = 0; blade < 4; blade += 1) {
      const a = turn + (blade * Math.PI) / 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      g.lineBetween(x + cos * half * 0.3, y + sin * half * 0.3, x + cos * half * 0.5, y + sin * half * 0.5);
    }
  }

  if (input.still || !input.sparks) return;

  // Kademe 3: govdenin arkasinda sarmal ciken iki kivilcim, kuyrugun eninde.
  if (tier >= 3) {
    const spin = (input.now / HELIX_TURN_MS) * Math.PI * 2;
    for (let spark = 0; spark < 2; spark += 1) {
      const phase = spin + spark * Math.PI;
      const depth = Math.cos(phase);
      const back = length * 0.5 + spark * r * 0.3;
      const lateral = Math.sin(phase) * half * 0.6;
      const size = (0.75 + 0.35 * depth) * scale * Math.sqrt(weight);
      g.fillStyle(whiteHot(hue, recipe.heat * 0.85), (0.55 + 0.35 * depth) * input.extra);
      g.fillRect(x - ux * back + nx * lateral - size / 2, y - uy * back + ny * lateral - size / 2, size, size);
    }
  }

  // Kademe 2+: kuyruktan dokulen kisa kivilcimlar; kuyrugun boyunda ve eninde kaliyor.
  shedSparks(g, input, tier >= 3 ? 4 : 2, length * 0.42, streak * 0.75, half * 0.5, r * 0.08 * weight, r * 0.3, tier >= 3 ? 0 : 0.25);
}


/* ------------------------------------------------------------------ */
/* Ucube: yuk                                                           */
/* ------------------------------------------------------------------ */

/** Uydularin bir turu (ms). */
const RING_TURN_MS = 900;
/** Halkanin nabzi (ms). */
const PULSE_MS = 340;
/** Bas halkasinin kenar sayisi. */
const RING_SIDES = 8;

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
 * Damlanin icindeki kirikli simsek damari: bastan geriye `segments` parca,
 * sapma bas tarafta en buyuk ve damlanin eninde kaliyor. Dis ton, ic
 * beyaz-sicak. Noktalar `BOLT_POINTS`ta
 * kaliyor (catal icin).
 */
function drawBoltVein(g: VfxGraphics, input: AtakanShotInput, ux: number, uy: number, nx: number, ny: number, length: number, segments: number, jitter: number, width: number, reseed: number, hot: number) {
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const back = length * t;
    const offset = index === 0 || index === segments ? 0 : (hashNoise(input.seed + reseed + index * 17) - 0.5) * jitter * (1 - t);
    BOLT_POINTS[index].x = input.x - ux * back + nx * offset;
    BOLT_POINTS[index].y = input.y - uy * back + ny * offset;
  }
  // Parcalar `lineBetween`: bu boyda yol (parca basina 12 kose) bosa pahali.
  for (const [lineWidth, color, alpha] of [[width, input.hue, 0.9], [width * 0.45, hot, 0.95]] as const) {
    g.lineStyle(lineWidth, color, alpha);
    for (let index = 1; index <= segments; index += 1) g.lineBetween(BOLT_POINTS[index - 1].x, BOLT_POINTS[index - 1].y, BOLT_POINTS[index].x, BOLT_POINTS[index].y);
  }
}

/**
 * Ucube'nin mermisi: tasidigi yuk.
 *
 * Her kademede ayni sivrilen plazma damlasi; kademe renkte ve damlanin
 * icindeki/cevresindeki enerjide. Kalinlik (`thickness`) cizgileri ve
 * damlanin enini buyutuyor, boyu degil.
 */
export function drawUcubeShot(g: VfxGraphics, input: AtakanShotInput) {
  const { x, y, tier, recipe, hue, radius: r } = input;
  const ux = Math.cos(input.angle);
  const uy = Math.sin(input.angle);
  const nx = -uy;
  const ny = ux;
  const thick = recipe.thickness;
  const size = r * UCUBE_SHOT_SIZE;
  // Agirlik kademeyle artmiyor: cizgiler her kademede ayni kalinlikta.
  const weight = thick;
  const core = whiteHot(hue, recipe.heat);
  const filament = whiteHot(hue, recipe.heat * 0.8);
  const reseed = input.still ? 0 : Math.floor(input.now / SHOT_RESEED_MS) * 7;
  // Bas ve damla: merminin govdesi (isabet sekli ayni sayilardan, `UCUBE_SHOT_BODY`).
  const head = size * UCUBE_SHOT_BODY.head * thick;
  const tail = size * UCUBE_SHOT_BODY.tail;

  // Plazma damlasi: koyu ton kama, ton ic kama.
  g.fillStyle(darken(hue, 0.3), 0.85);
  g.fillTriangle(x + nx * head, y + ny * head, x - nx * head, y - ny * head, x - ux * tail, y - uy * tail);
  g.fillStyle(hue, 0.9);
  g.fillTriangle(x + nx * head * 0.55, y + ny * head * 0.55, x - nx * head * 0.55, y - ny * head * 0.55, x - ux * tail * 0.7, y - uy * tail * 0.7);

  if (tier === 1) {
    // Duz beyaz-sicak damar.
    g.lineStyle(size * 0.12 * weight, core, 0.9);
    g.lineBetween(x - ux * tail * 0.45, y - uy * tail * 0.45, x, y);
  } else {
    // Kademe 2+: damar kirikli simsek; damlanin icinde, LOD en son onu kisaltiyor.
    drawBoltVein(g, input, ux, uy, nx, ny, tail * 0.8 * Math.max(0.5, input.trailScale), tier >= 3 ? 7 : 6, head * 0.9, size * 0.14 * weight, reseed, core);
  }

  // Kademe 3: damarin ortasindan disa, tonun renginde kisa bir catal (damlanin govdesinde).
  if (tier >= 3) {
    const fork = BOLT_POINTS[3];
    const side = hashNoise(input.seed + reseed + 41) > 0.5 ? 1 : -1;
    const reach = head * 0.9;
    g.lineStyle(size * 0.07 * weight, filament, 0.85 * input.extra);
    drawFilament(g, fork.x, fork.y, fork.x - ux * reach * 0.8 + nx * side * reach, fork.y - uy * reach * 0.8 + ny * side * reach, input.seed + reseed + 43, head * 0.3);
  }

  // Bas: ton disk, beyaz-sicak cekirdek (kademe 3'te daha genis). Disk isabet
  // dairesinin cokgeni: kenar ortasi daireden en fazla 0,05 iceride
  // (`getProjectileDiscSides`; eski 8 kenar 0,26 icerideydi, daire cizimden erken degiyordu).
  g.fillStyle(hue, 1);
  fillDisc(g, x, y, head, getProjectileDiscSides(head));
  g.fillStyle(core, 1);
  fillDisc(g, x, y, head * (tier >= 3 ? 0.62 : 0.5));

  // Kademe 2+: basin cevresinde yanip sonen ince halka (boyu degismiyor, parlakligi nabizla).
  if (tier >= 2) {
    const pulse = input.still ? 1 : 0.6 + 0.4 * Math.abs(Math.sin((input.now / PULSE_MS) * Math.PI));
    g.lineStyle(size * 0.05 * weight, filament, clamp01(0.8 * pulse * input.extra));
    const ring = head * 1.35;
    for (let side = 0; side < RING_SIDES; side += 1) {
      const a = (side * Math.PI * 2) / RING_SIDES;
      const b = ((side + 1) * Math.PI * 2) / RING_SIDES;
      g.lineBetween(x + Math.cos(a) * ring, y + Math.sin(a) * ring, x + Math.cos(b) * ring, y + Math.sin(b) * ring);
    }
  }

  // Bastan catirdayan ince arklar, ucus yonune egilimli; erisim her kademede ayni.
  g.lineStyle(size * 0.05 * weight, filament, 0.9);
  const arcs = tier >= 3 ? 4 : tier >= 2 ? 3 : 2;
  for (let arc = 0; arc < arcs; arc += 1) {
    const a = input.angle + (hashNoise(input.seed + reseed + arc * 5) - 0.5) * Math.PI * 1.2;
    const reach = head + size * (0.5 + hashNoise(input.seed + reseed + arc * 11) * 0.4) * thick;
    drawFilament(g, x + Math.cos(a) * head, y + Math.sin(a) * head, x + Math.cos(a) * reach, y + Math.sin(a) * reach, input.seed + reseed + arc * 3, size * 0.35 * thick);
  }

  if (tier < 3) return;

  // Kademe 3: basin cevresinde donen uc kucuk uydu; bastan onlara yanip sonen ark.
  const turn = input.still ? 0 : (input.now / RING_TURN_MS) * Math.PI * 2;
  const ringRadius = head * 1.6;
  for (let index = 0; index < 3; index += 1) {
    const a = turn + (index * Math.PI * 2) / 3;
    const satelliteX = x + Math.cos(a) * ringRadius;
    const satelliteY = y + Math.sin(a) * ringRadius;
    if (input.still || hashNoise(input.seed + reseed + index * 29) > 0.3) {
      g.lineStyle(size * 0.04 * weight, filament, 0.7 * input.extra);
      drawFilament(g, x + Math.cos(a) * head, y + Math.sin(a) * head, satelliteX, satelliteY, input.seed + reseed + index * 31, head * 0.3);
    }
    g.fillStyle(hue, 0.95 * input.extra);
    fillDisc(g, satelliteX, satelliteY, size * 0.12 * thick);
    g.fillStyle(core, input.extra);
    fillDisc(g, satelliteX, satelliteY, size * 0.06 * thick);
  }

  // Kademe 3: kuyruk boyunca geriye dokulen kivilcimlar; damlanin boyunda kaliyor.
  if (input.still || !input.sparks) return;
  shedSparks(g, input, 5, head, tail - head, head, size * 0.08 * weight, size * 0.4);
}
