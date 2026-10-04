/**
 * Zeynep kulelerinin imzalari: saray dili (ferman -> nisan -> regalya).
 *
 * Rampa pembe -> altin -> beyaz altin ve **rutbe trimi**: govde kulenin ya da
 * kombonun renginde kaliyor (Kin kizili, yanik camgobegi, Abarti'nin
 * koyulastirmasi -- isinin rengi sunucudan, hep okunuyor), kademe kenara
 * rutbe ekliyor. Kademe 1 temiz bir ferman; 2 altin seritler (chevron),
 * ikinci perde ve "gecit toreni" (hayalet kopyalar, paralel ray degil);
 * 3 tac ve muhur, yaldiz zerreler, mum muhur damgasi ve kapanan ferman
 * cizgisi -- hicbir zaman tumuyle beyaz degil.
 *
 * Burada:
 * - Mizrak (Hiza ve Taht'in mermileri): ince uzun govde, sivri uc; Taht'ta
 *   kuyrukta dizilimin muhru (uc isaret, uyelerin renginde: kipi renk
 *   gormeden de diziliminden okunuyor).
 * - Ferman kertigi (carpma dili "decree"): her delinen dusmanda govdeyi kesen
 *   bir cizgi -- kertik sayisi delinen dusman sayisi.
 * - `ZeynepSignatureVfx`: delen merminin ferman cizgisi, Gosteri hattindaki
 *   her dusmana spot isigi, Kin'in damgasi (yavaslatmanin gucu kadar serit),
 *   Abarti gecis nabzi ve Taht atisinda dizilimin kendisi.
 * - `ZeynepReceiptTracker`: bunlarin hepsi mevcut veriden turuyor (isinlar,
 *   temaslar, gelen snapshot'in dusman ve kule konumlari, paylasilan kurallar);
 *   tek ek tel alani ayna isininin sekme kosesi (`BeamSnapshot.b`).
 *
 * Kurallar kitle ayni: `Math.random` yok (tohumlar FNV ozetinden), karede
 * nesne yok (olaylar havuzda, secenekler modul sabiti), daire yok (kitin
 * ucuz halka ve diski). LOD sirasi: once zerre, sonra parlama ve ikinci
 * perde, en son serit sayisi tek dikdortgen; renk ve govde (kertik, halka,
 * damga yayi, nabiz) hic dusmuyor. Takim arkadasinin kademe 3 eklentileri %70.
 * Hareket azaltma her hareket dalini kapatiyor; hicbir sey saniyede 3'ten
 * fazla parlamiyor.
 */
import {
  GAME_SPEED_MULTIPLIER,
  KIN_WAVE_BAND_DEPTH,
  applyStatusResistance,
  collectZeynepSynthesisGroup,
  enemyCombatDefinitions,
  getAbartiRailRect,
  getAbartiShowcaseRangeMultiplier,
  getEnemyTypeCollisionRadius,
  getSegmentRectEntry,
  getTowerSlowDurationMs,
  isAbartiArmorBreakProjectile,
  isTargetInsideAttackShape,
  isValidZeynepFormationGroup,
  towerCatalog,
  type AbartiRailRect,
  type AttackShapeQuery,
  type BeamSnapshot,
  type EnemySnapshot,
  type SynergyStructure,
  type TowerDefinition,
  type TowerSnapshot
} from "@karayel/shared";
import { PRESSURE_WAVE_GAIN, gainColor, getZeynepTrim } from "./combat-vfx";
import { getMarkReticleHalf } from "./atakan-signatures";
import { TEAMMATE_EXTRA_ALPHA, clamp01, fillDisc, fnvHash, hashNoise, liftToWhite, strokeProfile, type VfxGraphics, type VfxTier } from "./kit";
import { VfxLod } from "./lod";
import { ZEYNEP_GOLD, getCourtTier, getVfxProfile, type VfxCourtTier } from "./vfx-profiles";

/** Ikinci perde gecikmesi (attack-vfx `SECOND_BEAT_DELAY_MS` ile ayni). */
export const COURT_ENCORE_MS = 80;
/**
 * Beyaz ic parlamanin genel siniri: saniyede en fazla 3 (isiga duyarlilik;
 * igne ucuyla ayni kural). Kalabalik bir Gosteri hattinda on dusman ayni
 * anda yansa da tek parlama.
 */
export const COURT_FLASH_GAP_MS = 334;
/** Ferman cizgisinin omru (son temastan); kademe 3'te kapanma bunun icinde. */
export const PIERCE_LINE_MS = 420;
/** Spot isiginin omru. */
export const SPOTLIGHT_MS = 460;
/** Abarti gecis nabzinin omru. */
export const CROSSING_MS = 440;
/** Taht atisinda dizilimin gorundugu sure. */
export const FORMATION_MS = 340;
/** Ayna isininin sekme isaretinin omru: isin koseyi gectikten sonra da kaliyor. */
export const BOUNCE_MS = 480;
/** Taht'in Kin dalgasi itiyor, yavaslatmiyor: damga yalnizca itme ani kadar. */
export const KIN_PUSH_BRAND_MS = 520;

/**
 * Kin damgasinin serit olcusu: en az 3 birimlik isaret, en az 2 birim
 * aralik (375 piksellik telefonda sayilabiliyor). Atakan nisangahinin
 * kertikleriyle ayni olcu, ama sagda: kertikler solda.
 */
export const BRAND_PIP_SIZE = 3;
export const BRAND_PIP_GAP = 2;

/** Taht'in kopyaladigi Hiza mermisi: sunucu "zeynep-1" gonderiyor, istemci ayirt ediyor. */
export const TAHT_COPY_ID = "zeynep-3-copy";

/* ------------------------------------------------------------------ */
/* Renkler                                                              */
/* ------------------------------------------------------------------ */

/** Dizilim uyelerinin renkleri: muhrun isaretleri ve atistaki dizilim cizgileri. */
export const ZEYNEP_MEMBER_COLORS = {
  hiza: 0xec4899,
  gosteri: 0xf9a8d4,
  taht: 0xe879f9,
  kin: 0xdc2626
} as const;

export function getZeynepMemberColor(definitionId: string) {
  switch (definitionId) {
    case "zeynep-1": return ZEYNEP_MEMBER_COLORS.hiza;
    case "zeynep-2": return ZEYNEP_MEMBER_COLORS.gosteri;
    case "zeynep-3": return ZEYNEP_MEMBER_COLORS.taht;
    case "zeynep-6": return ZEYNEP_MEMBER_COLORS.kin;
    default: return 0xf0abfc;
  }
}

/** Mizragin kipi: Hiza'nin kendi atisi ya da Taht'in uc mizragi. */
export type LanceMode = "hiza" | "dual" | "kin" | "copy";

export function getLanceMode(definitionId: string | undefined): LanceMode {
  switch (definitionId) {
    case "zeynep-3": return "dual";
    case "zeynep-3-kin-projectile": return "kin";
    case TAHT_COPY_ID: return "copy";
    default: return "hiza";
  }
}

/**
 * Mizragin govde rengi: kip kendi tonunda. Eskiden Kin, cift ve kopya kipi
 * ayni pembe Hiza atisiydi; kopya kipi kehribara donuyordu.
 */
const LANCE_BODY: Record<LanceMode, number> = {
  hiza: ZEYNEP_MEMBER_COLORS.hiza,
  dual: ZEYNEP_MEMBER_COLORS.taht,
  kin: ZEYNEP_MEMBER_COLORS.kin,
  copy: ZEYNEP_MEMBER_COLORS.hiza
};

/** Taht mizraginin muhru: dizilimin uc uyesi (son isaret Taht'in kendisi, elmas). */
const LANCE_SIGILS: Record<LanceMode, readonly [number, number, number] | undefined> = {
  hiza: undefined,
  dual: [ZEYNEP_MEMBER_COLORS.hiza, ZEYNEP_MEMBER_COLORS.hiza, ZEYNEP_MEMBER_COLORS.taht],
  kin: [ZEYNEP_MEMBER_COLORS.hiza, ZEYNEP_MEMBER_COLORS.kin, ZEYNEP_MEMBER_COLORS.taht],
  copy: [ZEYNEP_MEMBER_COLORS.taht, ZEYNEP_MEMBER_COLORS.taht, ZEYNEP_MEMBER_COLORS.hiza]
};

export function getLanceSigil(mode: LanceMode) {
  return LANCE_SIGILS[mode];
}

/** Mermi ya da temas kimliginden govde rengi (kip); Zeynep mermisi degilse `fallback`. */
export function getZeynepBodyColor(definitionId: string | undefined, fallback: number) {
  if (definitionId === "zeynep-1" || definitionId === "zeynep-3" || definitionId === "zeynep-3-kin-projectile" || definitionId === TAHT_COPY_ID) {
    return LANCE_BODY[getLanceMode(definitionId)];
  }
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Saray isaretleri: serit, muhur, tac                                   */
/* ------------------------------------------------------------------ */

/** Altin serit (chevron): `angle` yonune bakan V. Iki cizgi. */
export function drawChevron(g: VfxGraphics, x: number, y: number, angle: number, size: number, width: number, color: number, alpha: number) {
  if (alpha <= 0) return;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const half = size * 0.5;
  const tipX = x + ux * half;
  const tipY = y + uy * half;
  g.lineStyle(Math.max(0.6, width), color, clamp01(alpha));
  g.lineBetween(x - ux * half - uy * half, y - uy * half + ux * half, tipX, tipY);
  g.lineBetween(x - ux * half + uy * half, y - uy * half - ux * half, tipX, tipY);
}

/**
 * Mum muhur: koyu mumdan bir baklava, ortasinda rutbe renginde kabartma ve
 * (`drips`) iki mum damlasi. Mum kulenin (kombonun) tonunda koyu, kabartma
 * rutbe renginde: muhur hicbir zaman beyaz bir disk degil. Ucuz: iki ucgen,
 * bir dikdortgen, iki cizgi (yuz dusmanin damgasinda da butceye sigiyor).
 */
export function drawWaxSeal(g: VfxGraphics, x: number, y: number, radius: number, wax: number, rim: number, alpha: number, drips = true) {
  if (alpha <= 0 || radius <= 0) return;
  g.fillStyle(wax, clamp01(alpha * 0.95));
  g.fillTriangle(x, y - radius * 1.15, x + radius * 1.15, y, x - radius * 1.15, y);
  g.fillTriangle(x, y + radius * 1.15, x + radius * 1.15, y, x - radius * 1.15, y);
  const core = radius * 0.55;
  g.fillStyle(rim, clamp01(alpha));
  g.fillRect(x - core / 2, y - core / 2, core, core);
  if (!drips) return;
  g.lineStyle(Math.max(0.6, radius * 0.3), wax, clamp01(alpha * 0.9));
  g.lineBetween(x + radius * 0.5, y + radius * 0.6, x + radius * 0.7, y + radius * 1.4);
  g.lineBetween(x - radius * 0.6, y + radius * 0.5, x - radius * 0.9, y + radius * 1.2);
}

/**
 * Ucuz halka: sekiz cizgi. Phaser'in yol cizgisi her kirilmada ~12 kose
 * uretiyor (16 kenarli halka ~180); bu boyda sekizgen halkadan ayirt
 * edilmiyor (~48).
 */
const OCTAGON_COS = new Float32Array(8);
const OCTAGON_SIN = new Float32Array(8);
for (let index = 0; index < 8; index += 1) {
  OCTAGON_COS[index] = Math.cos((index / 8) * Math.PI * 2 + Math.PI / 8);
  OCTAGON_SIN[index] = Math.sin((index / 8) * Math.PI * 2 + Math.PI / 8);
}
export function strokeOctagon(g: VfxGraphics, x: number, y: number, radius: number) {
  if (!(radius > 0.5)) return;
  for (let index = 0; index < 8; index += 1) {
    const next = (index + 1) % 8;
    g.lineBetween(x + OCTAGON_COS[index] * radius, y + OCTAGON_SIN[index] * radius, x + OCTAGON_COS[next] * radius, y + OCTAGON_SIN[next] * radius);
  }
}

/** Tac isareti: alt cubuk ve uc sivri; tek yol. `width` tacin genisligi. */
export function drawCrownSigil(g: VfxGraphics, x: number, y: number, width: number, color: number, alpha: number, lineWidth: number) {
  if (alpha <= 0) return;
  const half = width / 2;
  const height = width * 0.62;
  g.lineStyle(Math.max(0.6, lineWidth), color, clamp01(alpha));
  g.beginPath();
  g.moveTo(x - half, y);
  g.lineTo(x - half, y - height);
  g.lineTo(x - half * 0.5, y - height * 0.45);
  g.lineTo(x, y - height);
  g.lineTo(x + half * 0.5, y - height * 0.45);
  g.lineTo(x + half, y - height);
  g.lineTo(x + half, y);
  g.closePath();
  g.strokePath();
}

/** Ucuz elips (spot isiginin havuzu): 10 kenarli yelpaze; earcut yok. */
const ELLIPSE_SIDES = 10;
const ELLIPSE_COS = new Float32Array(ELLIPSE_SIDES);
const ELLIPSE_SIN = new Float32Array(ELLIPSE_SIDES);
for (let index = 0; index < ELLIPSE_SIDES; index += 1) {
  ELLIPSE_COS[index] = Math.cos((index / ELLIPSE_SIDES) * Math.PI * 2);
  ELLIPSE_SIN[index] = Math.sin((index / ELLIPSE_SIDES) * Math.PI * 2);
}
function fillEllipseFan(g: VfxGraphics, x: number, y: number, rx: number, ry: number) {
  const x0 = x + ELLIPSE_COS[0] * rx;
  const y0 = y + ELLIPSE_SIN[0] * ry;
  for (let index = 1; index < ELLIPSE_SIDES - 1; index += 1) {
    g.fillTriangle(x0, y0, x + ELLIPSE_COS[index] * rx, y + ELLIPSE_SIN[index] * ry, x + ELLIPSE_COS[index + 1] * rx, y + ELLIPSE_SIN[index + 1] * ry);
  }
}

/**
 * Alt yay (damga): `start`..`end` radyan arasi `segments` cizgi. Yol degil
 * ayri cizgiler: yolun her kirilmasi 12 kose, cizgi 6 (60 damgali dalgada fark).
 */
function strokeArc(g: VfxGraphics, x: number, y: number, radius: number, start: number, end: number, segments: number) {
  let px = x + Math.cos(start) * radius;
  let py = y + Math.sin(start) * radius;
  for (let index = 1; index <= segments; index += 1) {
    const angle = start + ((end - start) * index) / segments;
    const nx = x + Math.cos(angle) * radius;
    const ny = y + Math.sin(angle) * radius;
    g.lineBetween(px, py, nx, ny);
    px = nx;
    py = ny;
  }
}

/** Yukari suzulen yaldiz zerreleri (durumsuz, tohumlu); `age` 0..1. */
function drawGiltMotes(g: VfxGraphics, x: number, y: number, spread: number, rise: number, count: number, age: number, seed: number, color: number, size: number, alpha: number) {
  if (alpha <= 0) return;
  for (let index = 0; index < count; index += 1) {
    const roll = hashNoise(seed + index * 7 + 1);
    const lift = hashNoise(seed + index * 7 + 2);
    const life = clamp01(age * (0.8 + lift * 0.5));
    const glow = life < 0.2 ? life / 0.2 : 1 - (life - 0.2) / 0.8;
    if (glow <= 0) continue;
    g.fillStyle(index % 2 === 0 ? color : liftToWhite(color, 0.6), clamp01(alpha * glow));
    fillDisc(g, x + (roll - 0.5) * spread * 2, y - life * rise * (0.6 + lift * 0.6), size);
  }
}

/* ------------------------------------------------------------------ */
/* Mizrak                                                               */
/* ------------------------------------------------------------------ */

/** Karede yerinde yazilan secenekler: cagri basina nesne yok. */
const LINE = { body: 0, spread: 0 };

export type LanceDrawOptions = {
  mode: LanceMode;
  tier: VfxTier;
  court: VfxCourtTier | undefined;
  /** Siluetin yari boyu (dunya birimi, olcekli). */
  radius: number;
  scale: number;
  /** Takim arkadasinin kademe 3 eklentisi icin alfa. */
  extra: number;
  /** Hayalet kopyalar (gecit toreni) LOD 2'de dusuyor. */
  parade: boolean;
};

/** Mizragin secenekleri; attack-vfx karede yerinde yaziyor. */
export const LANCE_OPTIONS: LanceDrawOptions = { mode: "hiza", tier: 1, court: undefined, radius: 7, scale: 1, extra: 1, parade: true };

/**
 * Ferman mizragi.
 *
 * - Ferman (1): kipin renginde duz govde ve sivri uc; Taht'ta kuyrukta
 *   dizilimin muhru (uc isaret, uyelerin renginde).
 * - Nisan (2): omuzlar ADD katmaninda, ucun arkasinda altin serit ve gecit
 *   toreni: iki hayalet mizrak geride V dizilisinde (paralel ray yok).
 * - Regalya (3): beyaza cekilmis file (ton omuzlarda), muhrun cevresinde
 *   beyaz altin muhur halkasi; Hiza'da ucun dibinde.
 */
export function drawZeynepLance(g: VfxGraphics, glow: VfxGraphics, x: number, y: number, angle: number, options: LanceDrawOptions) {
  const { mode, tier, radius: r, scale } = options;
  const color = LANCE_BODY[mode];
  const trim = getZeynepTrim(tier, color);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;

  if (tier >= 2 && options.parade) {
    // Gecit toreni: iki hayalet mizrak geride, V dizilisinde.
    for (let side = -1; side <= 1; side += 2) {
      const gx = x - ux * r * 2.4 + nx * side * r * 1.25;
      const gy = y - uy * r * 2.4 + ny * side * r * 1.25;
      g.lineStyle(Math.max(0.6, r * 0.16), liftToWhite(color, 0.2), 0.38);
      g.lineBetween(gx - ux * r * 1.5, gy - uy * r * 1.5, gx + ux * r * 0.4, gy + uy * r * 0.4);
      g.fillStyle(liftToWhite(color, 0.25), 0.4);
      g.fillTriangle(gx + ux * r * 0.85, gy + uy * r * 0.85, gx + nx * r * 0.26, gy + ny * r * 0.26, gx - nx * r * 0.26, gy - ny * r * 0.26);
    }
  }

  // Govde: lazerin kesiti, omuzlar ADD katmaninda.
  LINE.body = Math.max(1, r * 0.3);
  LINE.spread = r * 0.55;
  strokeProfile(g, x - ux * r * 2, y - uy * r * 2, x + ux * r * 0.05, y + uy * r * 0.05, color, tier, LINE, glow);
  const tip = r * 1.05;
  const half = r * 0.42;
  g.fillStyle(tier >= 2 ? liftToWhite(color, 0.35) : color, 0.97);
  g.fillTriangle(x + ux * tip, y + uy * tip, x - ux * r * 0.15 + nx * half, y - uy * r * 0.15 + ny * half, x - ux * r * 0.15 - nx * half, y - uy * r * 0.15 - ny * half);

  if (tier >= 2) {
    // Nisan: ucun arkasinda rutbe seridi.
    drawChevron(g, x - ux * r * 0.7, y - uy * r * 0.7, angle, r * 0.8, Math.max(0.8, 0.9 * scale), trim, 0.95);
  }

  const sigil = LANCE_SIGILS[mode];
  if (sigil) {
    // Dizilimin muhru: kuyrugun arkasinda uc isaret, sivri ucu ileri bakan ucgen.
    const sx = x - ux * r * 2.75;
    const sy = y - uy * r * 2.75;
    const dot = Math.max(1.5, r * 0.2);
    const ax = sx + ux * r * 0.45;
    const ay = sy + uy * r * 0.45;
    const bx = sx - ux * r * 0.3;
    const by = sy - uy * r * 0.3;
    g.fillStyle(sigil[0], 0.95);
    fillDisc(g, bx + nx * r * 0.5, by + ny * r * 0.5, dot);
    g.fillStyle(sigil[1], 0.95);
    fillDisc(g, bx - nx * r * 0.5, by - ny * r * 0.5, dot);
    // Son isaret elmas: dizilimin kendi kulesi (Taht ya da kopyalanan Hiza).
    g.fillStyle(sigil[2], 0.95);
    g.fillTriangle(ax + ux * dot * 1.3, ay + uy * dot * 1.3, ax + nx * dot * 1.1, ay + ny * dot * 1.1, ax - nx * dot * 1.1, ay - ny * dot * 1.1);
    g.fillTriangle(ax - ux * dot * 1.3, ay - uy * dot * 1.3, ax + nx * dot * 1.1, ay + ny * dot * 1.1, ax - nx * dot * 1.1, ay - ny * dot * 1.1);
    if (options.court?.seal) {
      g.lineStyle(Math.max(0.6, 0.8 * scale), trim, 0.9 * options.extra);
      strokeOctagon(g, sx, sy, r * 0.95);
    }
  } else if (options.court?.seal) {
    // Hiza'nin regalyasi: ucun dibinde beyaz altin muhur halkasi.
    g.lineStyle(Math.max(0.6, 0.8 * scale), trim, 0.9 * options.extra);
    strokeOctagon(g, x - ux * r * 0.2, y - uy * r * 0.2, r * 0.6);
  }
}

/* ------------------------------------------------------------------ */
/* Ferman kertigi (temas)                                                */
/* ------------------------------------------------------------------ */

/**
 * Ferman kertigi: govdeyi ucus yonune dik kesen cizgi. Boyu dusmanin
 * ekrandaki capindan (govdeyi sariyor, tasmiyor): delinen her dusmanda bir
 * tane, yani kertik sayisi delinen dusman sayisi. Hareket azaltmada cizgi
 * buyumeden belirip soner.
 */
export function drawDecreeTick(g: VfxGraphics, x: number, y: number, angle: number, size: number, body: number, age: number, scale: number, still: boolean, flash: boolean) {
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const half = size * 0.42 * (still ? 1 : 0.35 + 0.65 * clamp01(age / 0.12));
  const fade = 1 - age;
  g.lineStyle(Math.max(1, 1.7 * scale), body, clamp01(0.95 * fade));
  g.lineBetween(x - nx * half, y - ny * half, x + nx * half, y + ny * half);
  g.lineStyle(Math.max(0.6, 0.7 * scale), liftToWhite(body, 0.8), clamp01(0.9 * fade));
  g.lineBetween(x - nx * half * 0.8, y - ny * half * 0.8, x + nx * half * 0.8, y + ny * half * 0.8);
  // Beyaz cekirdek: cagiran saniyede en fazla 3 olaya veriyor (`COURT_FLASH_GAP_MS`);
  // hareket azaltmada hic.
  if (!flash || still) return;
  g.fillStyle(liftToWhite(body, 0.8), Math.pow(1 - clamp01(age * 4), 2));
  fillDisc(g, x, y, 2 * scale);
}

/** Kertigin nisani (kademe 2+): cikis yonunde altin serit ve gecikmeli ikinci kertik. */
export function drawDecreeInsignia(g: VfxGraphics, x: number, y: number, angle: number, size: number, trim: number, age: number, elapsed: number, durationMs: number, scale: number, still: boolean, encore: boolean) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const fade = 1 - age;
  drawChevron(g, x + ux * (size * 0.5 + 2.5 * scale), y + uy * (size * 0.5 + 2.5 * scale), angle, Math.max(3, 4 * scale), Math.max(0.9, 1.1 * scale), trim, 0.95 * fade);
  if (!encore || elapsed < COURT_ENCORE_MS) return;
  const beat = clamp01((elapsed - COURT_ENCORE_MS) / Math.max(1, durationMs - COURT_ENCORE_MS));
  const nx = -uy;
  const ny = ux;
  const shift = (still ? 3 : 3 + beat * 3) * scale;
  const half = size * 0.36;
  g.lineStyle(Math.max(0.8, 1.1 * scale), trim, clamp01(0.6 * (1 - beat)));
  g.lineBetween(x + ux * shift - nx * half, y + uy * shift - ny * half, x + ux * shift + nx * half, y + uy * shift + ny * half);
}

/** Kertigin regalyasi (kademe 3): cikis tarafinda basilan mum muhur. */
export function drawDecreeSeal(g: VfxGraphics, x: number, y: number, angle: number, size: number, body: number, trim: number, age: number, scale: number, still: boolean, extra: number) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const press = still ? 1 : 1 + 0.6 * (1 - clamp01(age / 0.2));
  const reach = size * 0.5 + 8 * scale;
  drawWaxSeal(g, x + ux * reach, y + uy * reach, 2.6 * scale * press, mixTowardDark(body), trim, (1 - age) * extra);
}

function mixTowardDark(color: number) {
  const channel = (shift: number) => Math.round(((color >> shift) & 0xff) * 0.55);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/* ------------------------------------------------------------------ */
/* Olaylar: ferman cizgisi, spot isigi, damga, gecis, dizilim            */
/* ------------------------------------------------------------------ */

export type CourtEventInput =
  | { kind: "pierce"; key: string; x: number; y: number; angle: number; definitionId: string; tier?: number; own?: boolean }
  | { kind: "spotlight"; key: string; x: number; y: number; color: number; tier?: number; own?: boolean; size?: number }
  | { kind: "brand"; key: string; x: number; y: number; color: number; tier?: number; own?: boolean; durationMs: number; strength: number; push?: boolean; angle?: number; size?: number }
  | { kind: "crossing"; x: number; y: number; vertical: boolean; railHalf: number; color?: number; tier?: number; own?: boolean; projectileId?: string }
  | { kind: "formation"; key: string; x: number; y: number; tier?: number; own?: boolean; members: ReadonlyArray<{ x: number; y: number; definitionId: string }> }
  | { kind: "bounce"; key: string; x: number; y: number; angle: number; color: number; tier?: number; own?: boolean };

type CourtKind = CourtEventInput["kind"];

/** Ferman cizgisinin en fazla nokta sayisi (Hiza 2 deliyor, Saray Arsivi ile Taht 3-4). */
const PIERCE_POINTS = 5;

type CourtEvent = {
  kind: CourtKind;
  live: boolean;
  key: string;
  x: number;
  y: number;
  angle: number;
  tier: VfxTier;
  own: boolean;
  bornAt: number;
  /** Ferman cizgisi: son temasin ani (omur bundan). */
  lastAt: number;
  durationMs: number;
  seed: number;
  color: number;
  trim: number;
  court: VfxCourtTier;
  size: number;
  strength: number;
  push: boolean;
  vertical: boolean;
  railHalf: number;
  /** Bu olay beyaz ic parlamayi aldi mi (saniyede 3 siniri). */
  flash: boolean;
  /** Ferman cizgisinin noktalari; dizilimde uyeler. */
  xs: Float32Array;
  ys: Float32Array;
  colors: Uint32Array;
  count: number;
};

/** Karedeki dusman: konum ve (Takipci nisangahindan kacinmak icin) isaret yigini. */
export type CourtEnemy = Pick<EnemySnapshot, "id" | "x" | "y"> & Partial<Pick<EnemySnapshot, "trackingStacks" | "isTracked">>;

export type CourtFrame = {
  enemies: ReadonlyArray<CourtEnemy>;
  now: number;
  scale: number;
  /** Dusmanin ekrandaki capi (sprite'in tam boyu); yoksa 34 * olcek (grunt). */
  enemySize?: (enemy: CourtEnemy) => number;
};

export type ZeynepSignatureOptions = {
  lod: VfxLod;
  /** Hareket azaltma: buyume, kayma, kapanma ve zerre yok; sekiller yerinde soner. */
  reducedMotion?: () => boolean;
};

type Surface = VfxGraphics & { clear(): unknown };

/** Canli olay ust siniri; dolunca donen bir imlecin gosterdigi olay yerini veriyor. */
export const MAX_COURT_EVENTS = 192;

/**
 * Zeynep'in dunya ici imzalari: olay havuzu, her karede yaslarina gore
 * yeniden ciziliyor (combat-vfx'in sinirli tampon mimarisi).
 *
 * Katmanlar (GameScene derinlikleri): `ground` dusmanlarin altinda (spot
 * isiginin havuzu), `links` mermilerin altinda (ferman ve dizilim cizgileri,
 * ray nabzi), `glow` ADD (ikinci perdeler), `marks` dusman govdesinin
 * ustunde, can cubugunun altinda (halka, damga, muhur, tac).
 */
export class ZeynepSignatureVfx {
  private readonly events: CourtEvent[] = [];
  private cursor = 0;
  private lastFlashAt = Number.NEGATIVE_INFINITY;
  private readonly enemyIndex = new Map<string, CourtEnemy>();
  private indexedEnemies?: CourtFrame["enemies"];

  constructor(
    private readonly ground: Surface,
    private readonly links: Surface,
    private readonly glow: Surface,
    private readonly marks: Surface,
    private readonly options: ZeynepSignatureOptions = { lod: new VfxLod() }
  ) {}

  private get still() {
    return this.options.reducedMotion?.() ?? false;
  }

  get liveEvents() {
    let count = 0;
    for (const event of this.events) if (event.live) count += 1;
    return count;
  }

  /**
   * Henuz dogmamis gecis nabzini iptal et: mermi raya varmadan durdu
   * (`projectile:hit`). `before` kaldirmanin oynatma ani; nabiz ondan sonraya
   * tarihliyse hic oynamiyor, dogmus nabza dokunulmuyor.
   */
  cancelCrossing(projectileId: string, before: number) {
    for (const event of this.events) {
      if (event.live && event.kind === "crossing" && event.key === projectileId && event.bornAt > before) event.live = false;
    }
  }

  /** Canli olaylarin turu; testler ve tani icin. */
  countLive(kind: CourtKind) {
    let count = 0;
    for (const event of this.events) if (event.live && event.kind === kind) count += 1;
    return count;
  }

  clear() {
    for (const event of this.events) event.live = false;
    this.enemyIndex.clear();
    this.indexedEnemies = undefined;
    this.ground.clear();
    this.links.clear();
    this.glow.clear();
    this.marks.clear();
  }

  /**
   * Olay: `bornAt` olayin ani (oyunda oynatma saatine siralanmis; galeride
   * senaryonun ani). Ileri tarihli olay o ana kadar cizilmiyor.
   */
  emit(input: CourtEventInput, bornAt: number) {
    switch (input.kind) {
      case "pierce": return this.notePierce(input, bornAt);
      case "spotlight": return this.noteSpotlight(input, bornAt);
      case "brand": return this.noteBrand(input, bornAt);
      case "crossing": return this.noteCrossing(input, bornAt);
      case "formation": return this.noteFormation(input, bornAt);
      case "bounce": return this.noteBounce(input, bornAt);
      default:
    }
  }

  private noteBounce(input: Extract<CourtEventInput, { kind: "bounce" }>, bornAt: number) {
    const event = this.push("bounce", input.key, bornAt, input.tier, input.own, input.color, "zeynep-3");
    event.x = input.x;
    event.y = input.y;
    event.angle = input.angle;
    event.durationMs = BOUNCE_MS;
  }

  private notePierce(input: Extract<CourtEventInput, { kind: "pierce" }>, bornAt: number) {
    // Ayni mermi: noktaya ekle (delip gecti); yoksa yeni cizgi.
    let event = this.find("pierce", input.key);
    if (!event) {
      const profile = getVfxProfile(input.definitionId);
      event = this.push("pierce", input.key, bornAt, input.tier, input.own, getZeynepBodyColor(input.definitionId, profile.base), profile.id);
      event.count = 0;
    }
    if (event.count < PIERCE_POINTS) {
      event.xs[event.count] = input.x;
      event.ys[event.count] = input.y;
      event.count += 1;
    } else {
      event.xs[PIERCE_POINTS - 1] = input.x;
      event.ys[PIERCE_POINTS - 1] = input.y;
    }
    event.angle = input.angle;
    event.lastAt = bornAt;
    event.x = input.x;
    event.y = input.y;
  }

  private noteSpotlight(input: Extract<CourtEventInput, { kind: "spotlight" }>, bornAt: number) {
    const event = this.push("spotlight", input.key, bornAt, input.tier, input.own, input.color, "zeynep-2");
    event.x = input.x;
    event.y = input.y;
    event.size = input.size ?? 0;
    event.durationMs = SPOTLIGHT_MS;
    if (bornAt - this.lastFlashAt >= COURT_FLASH_GAP_MS) {
      event.flash = true;
      this.lastFlashAt = bornAt;
    }
  }

  private noteBrand(input: Extract<CourtEventInput, { kind: "brand" }>, bornAt: number) {
    // Ayni dusmanin damgasi tazeleniyor: her dalga yeniden hesapliyor (sunucu da oyle).
    const event = this.find("brand", input.key) ?? this.push("brand", input.key, bornAt, input.tier, input.own, input.color, "zeynep-6");
    this.reset(event, "brand", input.key, bornAt, input.tier, input.own, input.color, "zeynep-6");
    event.x = input.x;
    event.y = input.y;
    event.size = input.size ?? 0;
    event.durationMs = Math.max(120, input.durationMs);
    event.strength = Math.max(1, Math.min(3, Math.round(input.strength)));
    event.push = Boolean(input.push);
    event.angle = input.angle ?? 0;
  }

  private noteCrossing(input: Extract<CourtEventInput, { kind: "crossing" }>, bornAt: number) {
    const event = this.push("crossing", input.projectileId ?? "", bornAt, input.tier, input.own, input.color ?? 0x7c3aed, "zeynep-8");
    event.x = input.x;
    event.y = input.y;
    event.vertical = input.vertical;
    event.railHalf = input.railHalf;
    event.durationMs = CROSSING_MS;
  }

  private noteFormation(input: Extract<CourtEventInput, { kind: "formation" }>, bornAt: number) {
    const event = this.push("formation", input.key, bornAt, input.tier, input.own, ZEYNEP_MEMBER_COLORS.taht, "zeynep-3");
    event.x = input.x;
    event.y = input.y;
    event.durationMs = FORMATION_MS;
    event.count = 0;
    for (const member of input.members) {
      if (event.count >= 3) break;
      event.xs[event.count] = member.x;
      event.ys[event.count] = member.y;
      event.colors[event.count] = getZeynepMemberColor(member.definitionId);
      event.count += 1;
    }
  }

  private find(kind: CourtKind, key: string) {
    for (const event of this.events) {
      if (event.live && event.kind === kind && event.key === key) return event;
    }
    return undefined;
  }

  private push(kind: CourtKind, key: string, bornAt: number, tier: number | undefined, own: boolean | undefined, color: number, profileId: string) {
    let event: CourtEvent | undefined;
    for (const candidate of this.events) {
      if (!candidate.live) {
        event = candidate;
        break;
      }
    }
    if (!event) {
      if (this.events.length < MAX_COURT_EVENTS) {
        event = {
          kind, live: true, key, x: 0, y: 0, angle: 0, tier: 1, own: true, bornAt, lastAt: bornAt, durationMs: 0, seed: 0,
          color, trim: color, court: getCourtTier(getVfxProfile(profileId), 1)!, size: 0, strength: 1, push: false, vertical: false,
          railHalf: 0, flash: false, xs: new Float32Array(PIERCE_POINTS), ys: new Float32Array(PIERCE_POINTS), colors: new Uint32Array(3), count: 0
        };
        this.events.push(event);
      } else {
        event = this.events[this.cursor % this.events.length];
        this.cursor += 1;
      }
    }
    this.reset(event, kind, key, bornAt, tier, own, color, profileId);
    return event;
  }

  private reset(event: CourtEvent, kind: CourtKind, key: string, bornAt: number, tier: number | undefined, own: boolean | undefined, color: number, profileId: string) {
    const level: VfxTier = tier !== undefined && tier >= 3 ? 3 : tier !== undefined && tier >= 2 ? 2 : 1;
    event.kind = kind;
    event.live = true;
    event.key = key;
    event.tier = level;
    event.own = own ?? true;
    event.bornAt = bornAt;
    event.lastAt = bornAt;
    event.durationMs = PIERCE_LINE_MS;
    event.seed = fnvHash(key || `${kind}:${Math.round(bornAt)}`) % 100003;
    event.color = color;
    event.trim = getZeynepTrim(level, color);
    event.court = getCourtTier(getVfxProfile(profileId), level)!;
    event.flash = false;
    event.push = false;
  }

  /** Dusmani kimlikle bul; dizin dusman dizisi degisince bir kez kuruluyor. */
  private enemy(frame: CourtFrame, id: string) {
    if (this.indexedEnemies !== frame.enemies) {
      this.enemyIndex.clear();
      for (const enemy of frame.enemies) this.enemyIndex.set(enemy.id, enemy);
      this.indexedEnemies = frame.enemies;
    }
    return this.enemyIndex.get(id);
  }

  render(frame: CourtFrame) {
    this.ground.clear();
    this.links.clear();
    this.glow.clear();
    this.marks.clear();
    const still = this.still;
    for (const event of this.events) {
      if (!event.live) continue;
      const start = event.kind === "pierce" ? event.lastAt : event.bornAt;
      const elapsed = frame.now - start;
      if (frame.now < event.bornAt) continue;
      const total = event.kind === "pierce" ? event.durationMs + (event.court.snap && !still ? 120 : 0) : event.durationMs;
      if (elapsed >= total) {
        event.live = false;
        continue;
      }
      const age = clamp01(elapsed / total);
      const extra = event.own ? 1 : TEAMMATE_EXTRA_ALPHA;
      switch (event.kind) {
        case "pierce": this.drawPierceLine(event, age, elapsed, frame.scale, still, extra); break;
        case "spotlight": this.drawSpotlight(event, frame, age, elapsed, still, extra); break;
        case "brand": this.drawBrand(event, frame, age, elapsed, still, extra); break;
        case "crossing": this.drawCrossing(event, age, elapsed, frame.scale, still, extra); break;
        case "formation": this.drawFormation(event, age, elapsed, frame.scale, still, extra); break;
        case "bounce": this.drawBounce(event, age, elapsed, frame.scale, still, extra); break;
        default:
      }
    }
  }

  /**
   * Ferman cizgisi: delinen dusmanlar arasinda, delen merminin yolu.
   *
   * Hiza'nin kimligi delmek ama hic gosterilmiyordu. Iki temastan sonra
   * temaslari birlestiren cizgi (uclari biraz tasarak); her temasin kertigi
   * attack-vfx'te. Nisan: altin ikinci perde (genis, soluk; ADD). Regalya:
   * cizgi uclarindan son temasa kapanir ve orada tac belirir; yol boyunca
   * yaldiz zerreler.
   */
  private drawPierceLine(event: CourtEvent, age: number, elapsed: number, scale: number, still: boolean, extra: number) {
    if (event.count < 2) return;
    const lod = this.options.lod;
    const last = event.count - 1;
    const x0 = event.xs[0];
    const y0 = event.ys[0];
    const x1 = event.xs[last];
    const y1 = event.ys[last];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const overhang = 5 * scale;
    let sx = x0 - ux * overhang;
    let sy = y0 - uy * overhang;
    const ex = x1 + ux * overhang;
    const ey = y1 + uy * overhang;
    const court = event.court;
    // Regalya: son %40'ta cizgi son temasa kapaniyor.
    const snap = court.snap && !still ? clamp01((age - 0.6) / 0.4) : 0;
    if (snap > 0) {
      const eased = snap * snap;
      sx += (ex - sx) * eased;
      sy += (ey - sy) * eased;
    }
    const fade = court.snap && !still ? 1 - Math.max(0, age - 0.85) / 0.15 : 1 - age;
    const g = this.links;
    g.lineStyle(Math.max(1, 1.5 * scale), event.color, clamp01(0.85 * fade));
    g.lineBetween(sx, sy, ex, ey);
    g.lineStyle(Math.max(0.6, 0.6 * scale), liftToWhite(event.color, 0.75), clamp01(0.85 * fade));
    g.lineBetween(sx, sy, ex, ey);
    if (court.encore && lod.secondBeatRing && elapsed >= COURT_ENCORE_MS) {
      const beat = clamp01((elapsed - COURT_ENCORE_MS) / Math.max(1, event.durationMs - COURT_ENCORE_MS));
      this.glow.lineStyle(Math.max(1, 3.6 * scale), event.trim, clamp01(0.3 * (1 - beat)));
      this.glow.lineBetween(sx, sy, ex, ey);
    }
    if (!court.crown) return;
    // Tac: cizgi kapandigi yerde (son temas); hareket azaltmada sonuna kadar yerinde.
    const crownAlpha = still ? 1 - age : snap > 0.6 ? 1 - Math.max(0, age - 0.9) / 0.1 : 0;
    if (crownAlpha > 0) drawCrownSigil(this.marks, x1, y1 - 2 * scale, 6 * scale, event.trim, crownAlpha * extra, Math.max(0.8, 1 * scale));
    if (court.giltMotes && lod.sparks && !still) {
      drawGiltMotes(this.glow, (x0 + x1) / 2, (y0 + y1) / 2, length * 0.45, 9 * scale, 4, age, event.seed, event.trim, Math.max(0.7, 0.9 * scale), 0.9 * extra);
    }
  }

  /**
   * Spot isigi: Gosteri hattindaki (ve Taht'in yanik ve Kin gosterisinin)
   * her dusmana. Hattaki dusmanlar hic geri bildirim almiyordu.
   *
   * Ferman: dusmanin ayaginda isinin renginde bir isik havuzu ve govdeyi
   * saran, daralan halka. Nisan: iki yanda iceri bakan altin serit ve
   * gecikmeli altin ikinci halka. Regalya: havuzun onunde mum muhur,
   * havuzdan yukselen yaldiz zerreler. Dusmani kimlikle izliyor (oynatma
   * konumunda); dusman oldu ya da gittiyse son konumda soner.
   */
  private drawSpotlight(event: CourtEvent, frame: CourtFrame, age: number, elapsed: number, still: boolean, extra: number) {
    const lod = this.options.lod;
    const scale = frame.scale;
    const enemy = this.enemy(frame, event.key);
    if (enemy) {
      event.x = enemy.x;
      event.y = enemy.y;
      if (frame.enemySize) event.size = frame.enemySize(enemy);
    }
    const size = event.size > 0 ? event.size : 34 * scale;
    const x = event.x;
    const y = event.y;
    const fade = 1 - age;
    const court = event.court;
    if (lod.level < 3) {
      this.ground.fillStyle(event.color, clamp01(0.26 * fade));
      fillEllipseFan(this.ground, x, y + size * 0.3, size * 0.52, size * 0.17);
    }
    const ring = size * (still ? 0.46 : 0.48 - 0.06 * (1 - (1 - age) * (1 - age)));
    this.marks.lineStyle(Math.max(1, 1.3 * scale), liftToWhite(event.color, 0.35), clamp01(0.95 * fade));
    strokeOctagon(this.marks, x, y, ring);
    if (event.flash && elapsed < 70 && !still) {
      this.glow.fillStyle(liftToWhite(event.color, 0.7), clamp01(0.4 * (1 - elapsed / 70)));
      fillDisc(this.glow, x, y, size * 0.3);
    }
    if (court.chevrons) {
      // Iki yanda iceri bakan serit: spotun kenarlari.
      const reach = ring + 3.5 * scale;
      const chevron = Math.max(3, 3.6 * scale);
      const width = Math.max(1, 1.1 * scale);
      drawChevron(this.marks, x - reach, y, 0, chevron, width, event.trim, 0.95 * fade);
      drawChevron(this.marks, x + reach, y, Math.PI, chevron, width, event.trim, 0.95 * fade);
    }
    if (court.encore && lod.secondBeatRing && elapsed >= COURT_ENCORE_MS) {
      const beat = clamp01((elapsed - COURT_ENCORE_MS) / Math.max(1, event.durationMs - COURT_ENCORE_MS));
      const grow = still ? 0.6 : 0.5 + 0.18 * (1 - (1 - beat) * (1 - beat));
      this.glow.lineStyle(Math.max(0.8, 1.2 * scale), event.trim, clamp01(0.75 * (1 - beat)));
      strokeOctagon(this.glow, x, y, size * grow);
    }
    if (court.seal) {
      // Regalya: havuzun onunde (govdenin altinda, can cubugunun ustunde) muhur.
      const press = still ? 1 : 1 + 0.5 * (1 - clamp01(age / 0.2));
      drawWaxSeal(this.marks, x, y + size * 0.36, 2.4 * scale * press, mixTowardDark(event.color), event.trim, fade * extra);
      if (court.giltMotes && lod.sparks && !still) {
        drawGiltMotes(this.glow, x, y + size * 0.25, size * 0.4, size * 0.7, 3, age, event.seed, event.trim, Math.max(0.7, 0.9 * scale), 0.9 * extra);
      }
    }
  }

  /**
   * Kin damgasi: vurulan dusmanin govdesini alttan saran yay ve sagda
   * yavaslatmanin gucu kadar serit (1-3; uzakta yakalanan 3 kat yavaslar).
   * Kin hic geri bildirim vermiyordu; dalga da hasar vermiyor, damga onun
   * yaptigi isi soyluyor.
   *
   * Ferman: kizil yay, serit kombonun acik tonunda. Nisan: altin serit ve
   * gecikmeli altin kenar yayi. Regalya: yayin dibinde mum muhur, yaldiz
   * zerreler. Damga yavaslatma bitene kadar; son %30'da soner. Taht'in itme
   * dalgasinda serit yerine dalga yonunde cift serit (itme).
   *
   * LOD: 1'de zerre; 2'de kenar yayi, muhur ve serit ucgenleri (tek dikdortgenlik
   * sayi seridi kaliyor), Takipci isaretli dusmanda besik; renk ve sayi hic dusmuyor.
   */
  private drawBrand(event: CourtEvent, frame: CourtFrame, age: number, elapsed: number, still: boolean, extra: number) {
    const lod = this.options.lod;
    const scale = frame.scale;
    const enemy = this.enemy(frame, event.key);
    if (enemy) {
      event.x = enemy.x;
      event.y = enemy.y;
      if (frame.enemySize) event.size = frame.enemySize(enemy);
    }
    const size = event.size > 0 ? event.size : 34 * scale;
    const x = event.x;
    const y = event.y;
    const fade = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
    const court = event.court;
    const g = this.marks;
    const radius = size * 0.44;
    // Takipci nisangahi da varsa yay onun alt koselerine degiyordu (0.02-0.08 birim):
    // yerine nisangahin alt kenarinin 2.5 birim altinda, ayraclarin kollari
    // arasinda duz bir besik. LOD 2'de besik de dusuyor (nisangah zaten orada).
    const stacks = enemy ? enemy.trackingStacks ?? (enemy.isTracked ? 1 : 0) : 0;
    const reticle = stacks > 0 ? getMarkReticleHalf(size, stacks) : 0;
    const cradleY = y + reticle + 2.5 * scale;
    const cradleHalf = reticle * 0.5;
    // Isaretli dusmanda nisangah zaten kalabalik ve pahali: ikinci perde ve zerreler
    // yalnizca isaretsiz dusmanda (kademeyi serit rengi ve muhur tasiyor).
    const encore = reticle <= 0 && court.encore && lod.secondBeatRing && elapsed >= COURT_ENCORE_MS;
    g.lineStyle(Math.max(1.2, 1.6 * scale), liftToWhite(event.color, 0.15), clamp01(0.95 * fade));
    if (reticle <= 0) {
      strokeArc(g, x, y, radius, Math.PI * 0.12, Math.PI * 0.88, lod.level >= 2 ? 2 : 3);
    } else if (lod.level < 2) {
      g.lineBetween(x - cradleHalf, cradleY, x + cradleHalf, cradleY);
    }
    if (encore) {
      // Ikinci perde: yayin (besigin) altinda gecikmeli altin kenar.
      g.lineStyle(Math.max(0.6, 0.8 * scale), event.trim, clamp01(0.85 * fade));
      strokeArc(g, x, y, radius + 1.8 * scale, Math.PI * 0.25, Math.PI * 0.75, 2);
    }

    if (event.push) {
      // Itme: dusmanin arkasinda dalga yonunde cift serit.
      const ux = Math.cos(event.angle);
      const uy = Math.sin(event.angle);
      const bx = x - ux * (size * 0.5 + 3 * scale);
      const by = y - uy * (size * 0.5 + 3 * scale);
      const chevron = Math.max(3, 3.4 * scale);
      drawChevron(g, bx, by, event.angle, chevron, Math.max(1, 1.1 * scale), event.trim, 0.95 * fade);
      drawChevron(g, bx - ux * chevron * 0.9, by - uy * chevron * 0.9, event.angle, chevron, Math.max(1, 1.1 * scale), event.trim, 0.7 * fade);
    } else {
      // Gucu soyleyen serit sutunu: sagda, govdenin dikey araliginda.
      const count = event.strength;
      const pip = Math.max(BRAND_PIP_SIZE, BRAND_PIP_SIZE * scale);
      const gap = Math.max(BRAND_PIP_GAP, BRAND_PIP_GAP * scale);
      const column = count * pip + (count - 1) * gap;
      const left = x + radius + gap;
      const top = y - column / 2;
      g.fillStyle(event.trim, clamp01(0.95 * fade));
      if (lod.level >= 2) {
        // Sayi seridi: tek dikdortgen, boyu gucu soyluyor.
        g.fillRect(left, top, pip, column);
      } else {
        // Dolu serit: govdeye bakan ucgen (uc kose; altmis damgada da ucuz).
        for (let index = 0; index < count; index += 1) {
          const cy = top + index * (pip + gap) + pip / 2;
          g.fillTriangle(left, cy, left + pip, cy - pip / 2, left + pip, cy + pip / 2);
        }
      }
    }

    // Regalya muhru LOD 2'de dusuyor: kademeyi beyaz altin serit tasimaya devam ediyor.
    if (!court.seal || lod.level >= 2) return;
    drawWaxSeal(g, x, reticle > 0 ? cradleY : y + radius + 0.5 * scale, 2.3 * scale, mixTowardDark(event.color), event.trim, fade * extra, false);
    if (court.giltMotes && lod.sparks && !still && reticle <= 0) {
      drawGiltMotes(this.glow, x, y + radius * 0.6, size * 0.3, size * 0.5, 2, (elapsed % 900) / 900, event.seed, event.trim, Math.max(0.7, 0.8 * scale), 0.85 * extra * fade);
    }
  }

  /**
   * Abarti gecis nabzi: atis rayi gectigi noktada. Ray boyunca iki yana
   * sonen bir parlama ve gecis noktasinda daralan halka. Nisan: rayda iki
   * yana kayan altin serit ve gecikmeli altin halka. Regalya: gecis
   * noktasinda mum muhur ve yaldiz zerreler.
   */
  private drawCrossing(event: CourtEvent, age: number, elapsed: number, scale: number, still: boolean, extra: number) {
    const lod = this.options.lod;
    const ax = event.vertical ? 0 : 1;
    const ay = event.vertical ? 1 : 0;
    const fade = 1 - age;
    const reach = event.railHalf * 0.92;
    const x = event.x;
    const y = event.y;
    const court = event.court;
    const rail = liftToWhite(event.color, 0.35);
    this.links.lineStyle(Math.max(1.2, 2.4 * scale), rail, clamp01(0.85 * fade));
    this.links.lineBetween(x - ax * reach, y - ay * reach, x + ax * reach, y + ay * reach);
    if (lod.corona) {
      this.glow.lineStyle(Math.max(2, 6 * scale), event.color, clamp01(0.32 * fade));
      this.glow.lineBetween(x - ax * reach * 0.6, y - ay * reach * 0.6, x + ax * reach * 0.6, y + ay * reach * 0.6);
    }
    const ring = (still ? 5 : 8 - 4 * (1 - fade * fade)) * scale;
    this.marks.lineStyle(Math.max(1, 1.3 * scale), liftToWhite(event.color, 0.55), clamp01(0.95 * fade));
    strokeOctagon(this.marks, x, y, ring);
    if (court.chevrons) {
      const travel = still ? 0.5 : 1 - (1 - age) * (1 - age);
      const along = 3 * scale + travel * reach * 0.75;
      const chevron = Math.max(3, 3.6 * scale);
      const angle = Math.atan2(ay, ax);
      drawChevron(this.marks, x + ax * along, y + ay * along, angle, chevron, Math.max(1, 1.1 * scale), event.trim, 0.95 * fade);
      drawChevron(this.marks, x - ax * along, y - ay * along, angle + Math.PI, chevron, Math.max(1, 1.1 * scale), event.trim, 0.95 * fade);
    }
    if (court.encore && lod.secondBeatRing && elapsed >= COURT_ENCORE_MS) {
      const beat = clamp01((elapsed - COURT_ENCORE_MS) / Math.max(1, event.durationMs - COURT_ENCORE_MS));
      this.glow.lineStyle(Math.max(0.8, 1.2 * scale), event.trim, clamp01(0.75 * (1 - beat)));
      strokeOctagon(this.glow, x, y, (still ? 9 : 6 + beat * 7) * scale);
    }
    if (!court.seal) return;
    drawWaxSeal(this.marks, x, y, 2.8 * scale, mixTowardDark(event.color), event.trim, fade * extra);
    if (court.giltMotes && lod.sparks && !still) {
      drawGiltMotes(this.glow, x, y, 6 * scale, 12 * scale, 3, age, event.seed, event.trim, Math.max(0.7, 0.9 * scale), 0.9 * extra);
    }
  }

  /**
   * Ayna isininin sekmesi: duvarda bir parlama (duvar boyunca kisa cizgi ve
   * sonen bir nokta). Isin koseyi gectikten sonra da yarim saniye kaliyor:
   * oyuncu sekmeyi isinin kendisi kadar kisa bir anda yakalamak zorunda degil.
   * Nisan: duvar boyunca iki yana kayan altin serit ve gecikmeli halka.
   * Regalya: duvara basilan mum muhur, yaldiz zerreler.
   */
  private drawBounce(event: CourtEvent, age: number, elapsed: number, scale: number, still: boolean, extra: number) {
    const lod = this.options.lod;
    const court = event.court;
    const fade = 1 - age;
    // Duvar normale dik.
    const wx = -Math.sin(event.angle);
    const wy = Math.cos(event.angle);
    const x = event.x;
    const y = event.y;
    const reach = 7 * scale;
    this.links.lineStyle(Math.max(1.2, 1.8 * scale), liftToWhite(event.color, 0.45), clamp01(0.95 * fade));
    this.links.lineBetween(x - wx * reach, y - wy * reach, x + wx * reach, y + wy * reach);
    this.marks.fillStyle(liftToWhite(event.color, 0.7), clamp01(0.9 * Math.pow(fade, 2)));
    fillDisc(this.marks, x, y, (still ? 2.6 : 2 + 1.4 * fade) * scale);
    if (court.chevrons) {
      const travel = still ? 0.5 : 1 - fade * fade;
      const along = (4 + travel * 7) * scale;
      const angle = Math.atan2(wy, wx);
      drawChevron(this.marks, x + wx * along, y + wy * along, angle, Math.max(3, 3.4 * scale), Math.max(1, 1.1 * scale), event.trim, 0.95 * fade);
      drawChevron(this.marks, x - wx * along, y - wy * along, angle + Math.PI, Math.max(3, 3.4 * scale), Math.max(1, 1.1 * scale), event.trim, 0.95 * fade);
    }
    if (court.encore && lod.secondBeatRing && elapsed >= COURT_ENCORE_MS) {
      const beat = clamp01((elapsed - COURT_ENCORE_MS) / Math.max(1, event.durationMs - COURT_ENCORE_MS));
      this.glow.lineStyle(Math.max(0.8, 1.2 * scale), event.trim, clamp01(0.7 * (1 - beat)));
      strokeOctagon(this.glow, x, y, (still ? 8 : 4 + beat * 7) * scale);
    }
    if (!court.seal) return;
    drawWaxSeal(this.marks, x, y, 2.8 * scale, mixTowardDark(event.color), event.trim, fade * extra);
    if (court.giltMotes && lod.sparks && !still) {
      drawGiltMotes(this.glow, x, y, 5 * scale, 10 * scale, 3, age, event.seed, event.trim, Math.max(0.7, 0.9 * scale), 0.9 * extra);
    }
  }

  /**
   * Taht atisinda dizilimin kendisi: uyelerden Taht'a toplanan ferman
   * cizgileri, uyelerin renginde. Odul dizilimin, ama ekranda yalnizca
   * pembe bir Hiza atisi gibi gorunuyordu. Nisan: cizgilerde Taht'a bakan
   * altin serit ve uyeleri birlestiren altin kenar (ucgen kapaniyor).
   * Regalya: ucgenin ortasinda tac, cizgilerde yaldiz zerreler.
   */
  private drawFormation(event: CourtEvent, age: number, elapsed: number, scale: number, still: boolean, extra: number) {
    const lod = this.options.lod;
    const court = event.court;
    const fade = 1 - age;
    const grow = still ? 1 : 1 - Math.pow(1 - clamp01(elapsed / 120), 2);
    const g = this.links;
    const x = event.x;
    const y = event.y;
    let cx = x;
    let cy = y;
    for (let index = 0; index < event.count; index += 1) {
      const mx = event.xs[index];
      const my = event.ys[index];
      cx += mx;
      cy += my;
      g.lineStyle(Math.max(1, 1.3 * scale), event.colors[index], clamp01(0.85 * fade));
      g.lineBetween(mx, my, mx + (x - mx) * grow, my + (y - my) * grow);
      if (court.chevrons) {
        const angle = Math.atan2(y - my, x - mx);
        // %30'da: %50'de dizilimin kalici elmasi (synergy-marks) duruyor.
        drawChevron(this.marks, mx + (x - mx) * 0.3, my + (y - my) * 0.3, angle, Math.max(3, 3.4 * scale), Math.max(1, 1.1 * scale), event.trim, 0.95 * fade);
      }
    }
    this.marks.lineStyle(Math.max(1, 1.2 * scale), liftToWhite(event.color, 0.3), clamp01(0.9 * fade));
    strokeOctagon(this.marks, x, y, (still ? 11 : 14 - 3 * grow) * scale);
    if (court.chevrons && event.count >= 2 && lod.secondBeatRing) {
      // Ucgen kapaniyor: uyeler arasi altin kenar (ikinci perde).
      const beat = clamp01((elapsed - COURT_ENCORE_MS) / Math.max(1, event.durationMs - COURT_ENCORE_MS));
      if (elapsed >= COURT_ENCORE_MS) {
        this.glow.lineStyle(Math.max(0.8, 1 * scale), event.trim, clamp01(0.7 * (1 - beat)));
        this.glow.lineBetween(event.xs[0], event.ys[0], event.xs[1], event.ys[1]);
      }
    }
    if (!court.crown || event.count === 0) return;
    cx /= event.count + 1;
    cy /= event.count + 1;
    drawCrownSigil(this.marks, cx, cy + 2 * scale, 7 * scale, event.trim, fade * extra, Math.max(0.8, 1 * scale));
    if (court.giltMotes && lod.sparks && !still) {
      drawGiltMotes(this.glow, cx, cy, 10 * scale, 10 * scale, 3, age, event.seed, event.trim, Math.max(0.7, 0.9 * scale), 0.85 * extra);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Alindiginda turetilen olaylar                                        */
/* ------------------------------------------------------------------ */

export type ReceiptTower = Pick<TowerSnapshot, "id" | "definitionId" | "x" | "y" | "level"> &
  Partial<Pick<TowerSnapshot, "ownerId" | "characterId" | "orientation" | "range">>;
export type ReceiptEnemy = Pick<EnemySnapshot, "id" | "x" | "y"> &
  Partial<Pick<EnemySnapshot, "type" | "movementKind" | "isDominated" | "isUndead" | "isWhisperTurned">>;

/**
 * Kule bu dusmani hedefleyebilir mi: sunucunun `canTowerTargetEnemy`si
 * (Zorba'nin, Oluler'in ve Fisilti'nin aldigi dusmanlar disarida). Hava
 * kontrolu yok: Zeynep'in isin ve dalga kuleleri havayi vuruyor.
 */
export function isCourtTargetable(enemy: ReceiptEnemy) {
  return !enemy.isDominated && !enemy.isUndead && !enemy.isWhisperTurned;
}

export type ReceiptProjectile = { id: string; definitionId?: string; x: number; y: number; vx?: number; vy?: number; tier?: number; source?: string };

/** Olay ve ne kadar sonra oynamasi gerektigi (ms, alindigi andan). */
export type CourtEventSink = (event: CourtEventInput, delayMs: number) => void;

export type ReceiptContext = {
  /** Haritanin karesi (dunya birimi). */
  gridSize: number;
  /** Sunucunun `scaleWorldDistance` olcegi: kare / TOWER_GRID_SIZE. */
  worldScale: number;
  /** Kulenin sahibi yerel oyuncu mu; yoksa hepsi kendi sayilir. */
  isOwnOwner?: (ownerId: string | undefined) => boolean;
  /**
   * Oyun saatinden gercek saate: sunucu mermiyi oyun hiziyla (0.8) yuruttugu
   * icin oyunda 1 / GAME_SPEED_MULTIPLIER. Galerinin mermileri gercek saatte: 1.
   */
  timeScale?: number;
};

/** Gosteri hattinin dusman secimi: sunucunun sorgusuyla ayni (`line`, genislik isinin yarisi). */
const LINE_QUERY: AttackShapeQuery = { shape: "line", x: 0, y: 0, aimX: 0, aimY: 0, length: 0, width: 0, canHitAir: true };
const SHAPE_TARGET = { id: "", x: 0, y: 0, radius: 0, movementKind: undefined as EnemySnapshot["movementKind"] | undefined };

/** Gosteri / yanik hattinda mi: sunucunun `line` sorgusu, dusmanin carpisma yaricapiyla. */
export function isOnShowcaseLine(beam: Pick<BeamSnapshot, "x1" | "y1" | "x2" | "y2" | "width">, enemy: ReceiptEnemy) {
  LINE_QUERY.x = beam.x1;
  LINE_QUERY.y = beam.y1;
  LINE_QUERY.aimX = beam.x2;
  LINE_QUERY.aimY = beam.y2;
  LINE_QUERY.length = Math.hypot(beam.x2 - beam.x1, beam.y2 - beam.y1);
  LINE_QUERY.width = beam.width / 2;
  SHAPE_TARGET.id = enemy.id;
  SHAPE_TARGET.x = enemy.x;
  SHAPE_TARGET.y = enemy.y;
  SHAPE_TARGET.radius = getEnemyTypeCollisionRadius(enemy.type);
  SHAPE_TARGET.movementKind = enemy.movementKind;
  return isTargetInsideAttackShape(LINE_QUERY, SHAPE_TARGET);
}

/**
 * Kin gosterisinin konisinde mi: sunucunun `isPointInsideCone`u (merkez,
 * menzil isinin boyu). Yari aci isinin genisliginden: sunucu genisligi
 * `tan(yari) * boy * 2` yaziyor.
 */
export function isInKinShowcaseCone(beam: Pick<BeamSnapshot, "x1" | "y1" | "x2" | "y2" | "width">, enemy: ReceiptEnemy) {
  const dx = beam.x2 - beam.x1;
  const dy = beam.y2 - beam.y1;
  const range = Math.hypot(dx, dy);
  if (range < 1) return false;
  const ex = enemy.x - beam.x1;
  const ey = enemy.y - beam.y1;
  const distance = Math.hypot(ex, ey);
  if (distance > range) return false;
  const half = Math.atan2(beam.width / 2, range);
  return Math.abs(normalizeAngle(Math.atan2(ey, ex) - Math.atan2(dy, dx))) <= half;
}

/**
 * Kin dalgasinin bandindaki dusmanin kuleye uzakligi; bantta degilse -1.
 *
 * Sunucu: izdusum [on - bant, on + yaricap] icinde ve koninin icinde (merkez
 * yaricap icindeyse her zaman). On kenar isinin gorunen boyu (`x2,y2`), yari
 * aci genislikten (`tan(yari) * boy * 2`).
 */
export function getKinWaveHitDistance(beam: Pick<BeamSnapshot, "x1" | "y1" | "x2" | "y2" | "width">, enemy: ReceiptEnemy, bandDepth: number) {
  const dx = beam.x2 - beam.x1;
  const dy = beam.y2 - beam.y1;
  const front = Math.hypot(dx, dy);
  if (front < 1) return -1;
  const ux = dx / front;
  const uy = dy / front;
  const ex = enemy.x - beam.x1;
  const ey = enemy.y - beam.y1;
  const radius = getEnemyTypeCollisionRadius(enemy.type);
  const projection = ex * ux + ey * uy;
  if (projection < Math.max(0, front - bandDepth) || projection > front + radius) return -1;
  const distance = Math.hypot(ex, ey);
  if (distance > radius) {
    const half = Math.atan2(beam.width / 2, front);
    if (Math.abs(normalizeAngle(Math.atan2(ey, ex) - Math.atan2(uy, ux))) > half) return -1;
  }
  return projection;
}

/** Kin yavaslatmasinin gucu (1-3): kuleye uzaklik / menzil ucte bir dilimlerle. */
export function getKinBrandStrength(distance: number, range: number) {
  const ratio = clamp01(distance / Math.max(1, range));
  return ratio < 1 / 3 ? 1 : ratio < 2 / 3 ? 2 : 3;
}

function normalizeAngle(angle: number) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/** Spot isigi alan isinlar ve secimleri. */
const SPOTLIGHT_BEAMS: Readonly<Record<string, "line" | "cone">> = {
  "zeynep-2": "line",
  "zeynep-3-burn": "line",
  "zeynep-3-kin-showcase": "cone"
};
/** Taht'in atisi sayilan isinlar (dizilim burada gorunuyor). */
const TAHT_BEAMS: ReadonlySet<string> = new Set(["zeynep-3-burn", "zeynep-3-kin-showcase", "zeynep-3-kin-wave", "zeynep-3-ray"]);
/** Kin dalgalari: dalga her snapshot'ta ilerliyor, damga bantta. */
const KIN_WAVE_BEAMS: ReadonlySet<string> = new Set(["zeynep-6", "zeynep-3-kin-wave"]);
/** Abarti'nin degistirdigi isinlar: gecis nabzi on kenar raya vardiginda. */
const RAIL_BEAMS: ReadonlySet<string> = new Set(["zeynep-2", "zeynep-3-burn", "zeynep-3-kin-showcase", "zeynep-6", "zeynep-3-kin-wave", "zeynep-3-ray"]);

type BeamState = {
  seen: number;
  ownerId: string | undefined;
  hasOwner: boolean;
  headX: number;
  headY: number;
  branded: Set<string>;
};

type Rail = { rect: AbartiRailRect; ownerId: string | undefined; level: number; vertical: boolean; x: number; y: number };

const DEFINITIONS = new Map<string, TowerDefinition>();
for (const towers of Object.values(towerCatalog)) {
  for (const definition of towers) if (!DEFINITIONS.has(definition.id)) DEFINITIONS.set(definition.id, definition);
}

/** Dusman tipinin yavaslatma direnci (sunucu `statusResistances.slow`, tipin tanimindan). */
function getSlowResistance(type: string | undefined) {
  const definition = type ? (enemyCombatDefinitions as Record<string, { statusResistances?: { slow?: number } } | undefined>)[type] : undefined;
  return definition?.statusResistances?.slow ?? 0;
}

/** Abarti'nin seviyesinden kademe (kule halkasinin esikleri). */
const levelTier = (level: number): VfxTier => (level >= 10 ? 3 : level >= 5 ? 2 : 1);

/**
 * Gelen snapshot'tan Zeynep olaylari: sunucu bunlari ayrica gondermiyor,
 * ama hepsi elde olan veriden turuyor.
 *
 * - Yeni Gosteri / yanik / Kin gosterisi isini: hattaki (konideki) dusmanlar
 *   gelen snapshot'in konumlarindan (isinla ayni an), sunucunun sorgusuyla.
 * - Kin dalgasi: her snapshot'ta bandindaki dusmanlar, dalga basina bir kez;
 *   guc kuleye uzaklik / menzilden, sure kulenin yavaslatmasindan.
 * - Abarti: isinin on kenari (ya da merminin yolu) ayni sahibin rayini
 *   kestiginde; mermide ucus suresi kadar sonra (yolda olurse iptal).
 * - Taht atisi: dizilim paylasilan kuraldan (`collectZeynepSynthesisGroup`).
 *
 * Olaylar alindigi anda turuyor, oynatmaya gecikmeyle (cagiranin isi)
 * siralaniyor. Kayitlar havuzda; gorulmeyen isinin kaydi siliniyor.
 */
export class ZeynepReceiptTracker {
  private readonly beams = new Map<string, BeamState>();
  private readonly pool: BeamState[] = [];
  private readonly rails: Rail[] = [];
  private railCount = 0;
  private frame = 0;
  private towers: readonly ReceiptTower[] = [];
  private structures?: Array<SynergyStructure & { tower: ReceiptTower }>;
  private structuresFor?: readonly ReceiptTower[];
  private readonly lastFormationAt = new Map<string, number>();

  constructor(private readonly sink: CourtEventSink) {}

  clear() {
    for (const state of this.beams.values()) this.pool.push(state);
    this.beams.clear();
    this.lastFormationAt.clear();
    this.towers = [];
    this.structures = undefined;
    this.structuresFor = undefined;
    this.railCount = 0;
  }

  get trackedBeams() {
    return this.beams.size;
  }

  /** Gelen snapshot: isinlar, dusmanlar ve kuleler ayni andan. `now` alinma ani. */
  noteSnapshot(beams: readonly BeamSnapshot[], enemies: readonly ReceiptEnemy[], towers: readonly ReceiptTower[], context: ReceiptContext, now: number) {
    this.frame += 1;
    this.setTowers(towers, context);
    for (const beam of beams) {
      const definitionId = beam.definitionId;
      if (!RAIL_BEAMS.has(definitionId) && !SPOTLIGHT_BEAMS[definitionId] && !TAHT_BEAMS.has(definitionId)) continue;
      let state = this.beams.get(beam.id);
      const fresh = !state;
      if (!state) {
        state = this.pool.pop() ?? { seen: 0, ownerId: undefined, hasOwner: false, headX: 0, headY: 0, branded: new Set<string>() };
        state.branded.clear();
        const origin = this.towerAt(beam.x1, beam.y1, context.gridSize * 0.6);
        state.ownerId = origin?.ownerId;
        state.hasOwner = Boolean(origin);
        state.headX = beam.x1;
        state.headY = beam.y1;
        this.beams.set(beam.id, state);
        if (origin && (TAHT_BEAMS.has(definitionId) || (definitionId === "zeynep-2" && origin.definitionId === "zeynep-3"))) {
          this.emitFormation(origin, beam.tier, context, now);
        }
      }
      state.seen = this.frame;
      const own = context.isOwnOwner ? context.isOwnOwner(state.ownerId) : true;

      const spot = SPOTLIGHT_BEAMS[definitionId];
      if (fresh && spot) {
        for (const enemy of enemies) {
          if (!isCourtTargetable(enemy)) continue;
          const hit = spot === "line" ? isOnShowcaseLine(beam, enemy) : isInKinShowcaseCone(beam, enemy);
          if (hit) this.sink({ kind: "spotlight", key: enemy.id, x: enemy.x, y: enemy.y, color: beam.color, tier: beam.tier, own }, 0);
        }
      }

      if (KIN_WAVE_BEAMS.has(definitionId)) this.brandKinWave(beam, state, enemies, context, own);
      if (definitionId === "zeynep-3-ray" && beam.b && beam.b.length >= 2) this.noteRayBounces(beam, state, own);

      if (RAIL_BEAMS.has(definitionId) && state.hasOwner && this.railCount > 0) {
        // On kenarin bu snapshot'taki yolu: ilk goruste kuleden, sonra onceki on kenardan.
        const path = this.findRailCrossing(state.headX, state.headY, beam.x2, beam.y2, state.ownerId);
        if (path) {
          this.sink({ kind: "crossing", x: path.x, y: path.y, vertical: path.rail.vertical, railHalf: context.gridSize, tier: levelTier(path.rail.level), own }, 0);
        }
      }
      state.headX = beam.x2;
      state.headY = beam.y2;
    }
    for (const [id, state] of this.beams) {
      if (state.seen === this.frame) continue;
      this.beams.delete(id);
      this.pool.push(state);
    }
  }

  /**
   * Dogrusal mermi atildi (`projectile:spawn`): Taht mi (kopya kipi istemciye
   * ayri kimlikle), dizilim, ve Abarti gecisi ucus suresiyle.
   *
   * Donen deger mermi icin istemci kimligi: Taht'in kopyaladigi Hiza mermisi
   * `TAHT_COPY_ID`; degisiklik yoksa `undefined`.
   */
  noteProjectileSpawn(projectile: ReceiptProjectile, towers: readonly ReceiptTower[], context: ReceiptContext, now: number) {
    // Galeri kopya mermisini dogrudan istemci kimligiyle veriyor; sunucu "zeynep-1".
    const definitionId = projectile.definitionId === TAHT_COPY_ID ? "zeynep-1" : projectile.definitionId ?? "";
    if (definitionId !== "zeynep-1" && definitionId !== "zeynep-3" && definitionId !== "zeynep-3-kin-projectile") return undefined;
    this.setTowers(towers, context);
    const origin = this.towerAt(projectile.x, projectile.y, context.gridSize * 0.8);
    const fromTaht = origin?.definitionId === "zeynep-3";
    if (origin && fromTaht) this.emitFormation(origin, projectile.tier, context, now);
    const own = context.isOwnOwner ? context.isOwnOwner(origin?.ownerId) : true;
    if (origin && isAbartiArmorBreakProjectile(definitionId) && this.railCount > 0) {
      const vx = projectile.vx ?? 0;
      const vy = projectile.vy ?? 0;
      const horizon = 1.6;
      const crossing = this.findRailCrossing(projectile.x, projectile.y, projectile.x + vx * horizon, projectile.y + vy * horizon, origin.ownerId);
      if (crossing) {
        this.sink({
          kind: "crossing",
          x: crossing.x,
          y: crossing.y,
          vertical: crossing.rail.vertical,
          railHalf: context.gridSize,
          tier: levelTier(crossing.rail.level),
          own,
          projectileId: projectile.id
        }, crossing.t * horizon * 1000 * (context.timeScale ?? 1));
      }
    }
    return fromTaht && definitionId === "zeynep-1" ? TAHT_COPY_ID : undefined;
  }

  private brandKinWave(beam: BeamSnapshot, state: BeamState, enemies: readonly ReceiptEnemy[], context: ReceiptContext, own: boolean) {
    const push = beam.definitionId === "zeynep-3-kin-wave";
    const origin = this.towerAt(beam.x1, beam.y1, context.gridSize * 0.6);
    const definition = origin ? DEFINITIONS.get(origin.definitionId) : undefined;
    const angle = Math.atan2(beam.y2 - beam.y1, beam.x2 - beam.x1);
    // Sunucu gucu dalganin menziline gore hesapliyor; dalga sahibinin Abarti
    // rayini (kulenin taban menzili boyunca) geciyorsa menzil Abarti'nin
    // carpaniyla uzuyor. Ayni kural, ayni carpan (paylasilan).
    const baseRange = origin?.range && origin.range > 0 ? origin.range : Math.hypot(beam.x2 - beam.x1, beam.y2 - beam.y1);
    const abartiLevel = this.railLevelAlong(beam.x1, beam.y1, beam.x1 + Math.cos(angle) * baseRange, beam.y1 + Math.sin(angle) * baseRange, state.ownerId);
    const range = abartiLevel > 0 ? baseRange * getAbartiShowcaseRangeMultiplier(abartiLevel) : baseRange;
    // Sunucu: (yavaslatma + (sv - 1) * 80) oyun ms, dusmanin direnciyle, gercek saatte / oyun hizi.
    const slowMs = definition ? getTowerSlowDurationMs(definition) + ((origin?.level ?? 1) - 1) * 80 : 1150;
    const band = KIN_WAVE_BAND_DEPTH * context.worldScale;
    for (const enemy of enemies) {
      // Dalga basina dusman bir kez (sunucu `hitEnemyIds`; itme dalgasinda ise
      // damga yalnizca ilk temasta, itme suruyor ama damga yenilenmiyor).
      if (state.branded.has(enemy.id) || !isCourtTargetable(enemy)) continue;
      const distance = getKinWaveHitDistance(beam, enemy, band);
      if (distance < 0) continue;
      state.branded.add(enemy.id);
      const durationMs = push ? KIN_PUSH_BRAND_MS : applyStatusResistance(slowMs, getSlowResistance(enemy.type)) / GAME_SPEED_MULTIPLIER;
      this.sink({
        kind: "brand",
        key: enemy.id,
        x: enemy.x,
        y: enemy.y,
        // Dalganin rengiyle ayni kazanc: Kin'in derin kizili siyah zeminde gorunsun
        // (oran korunuyor, Abarti'nin koyulastirmasi okunuyor).
        color: gainColor(beam.color, PRESSURE_WAVE_GAIN),
        tier: beam.tier,
        own,
        durationMs,
        strength: getKinBrandStrength(distance, range),
        push,
        angle
      }, 0);
    }
  }

  /**
   * Ayna isininin sekmeleri: kose ilk gorundugunde bir kez. Duvarin normali
   * gelen ve giden yonun farkindan (yansima normali); kose anahtari isin
   * kaydinin kumesinde.
   */
  private noteRayBounces(beam: BeamSnapshot, state: BeamState, own: boolean) {
    const bounces = beam.b!;
    for (let index = 0; index + 1 < bounces.length; index += 2) {
      const x = bounces[index];
      const y = bounces[index + 1];
      const key = `${x},${y}`;
      if (state.branded.has(key)) continue;
      state.branded.add(key);
      const px = index >= 2 ? bounces[index - 2] : beam.x1;
      const py = index >= 2 ? bounces[index - 1] : beam.y1;
      const nx = index + 3 < bounces.length ? bounces[index + 2] : beam.x2;
      const ny = index + 3 < bounces.length ? bounces[index + 3] : beam.y2;
      const inLength = Math.max(0.001, Math.hypot(x - px, y - py));
      const outLength = Math.max(0.001, Math.hypot(nx - x, ny - y));
      const normalX = (x - px) / inLength - (nx - x) / outLength;
      const normalY = (y - py) / inLength - (ny - y) / outLength;
      const angle = Math.abs(normalX) + Math.abs(normalY) > 0.001 ? Math.atan2(normalY, normalX) : 0;
      this.sink({ kind: "bounce", key: `${beam.id}@${key}`, x, y, angle, color: beam.color, tier: beam.tier, own }, 0);
    }
  }

  private emitFormation(taht: ReceiptTower, tier: number | undefined, context: ReceiptContext, now: number) {
    // Cift Hiza iki mizrak atiyor: ayni atis tek dizilim.
    const last = this.lastFormationAt.get(taht.id);
    if (last !== undefined && now - last < 150) return;
    this.lastFormationAt.set(taht.id, now);
    if (this.lastFormationAt.size > 64) {
      for (const [id, at] of this.lastFormationAt) if (now - at > 5000) this.lastFormationAt.delete(id);
    }
    const structures = this.getStructures();
    const seed = structures.find((structure) => structure.id === taht.id);
    if (!seed) return;
    const group = collectZeynepSynthesisGroup(seed, structures, context.gridSize);
    if (!isValidZeynepFormationGroup(group, context.gridSize)) return;
    const members = group.filter((member) => member.id !== taht.id).map((member) => ({ x: member.x, y: member.y, definitionId: member.definition.id }));
    const own = context.isOwnOwner ? context.isOwnOwner(taht.ownerId) : true;
    this.sink({ kind: "formation", key: taht.id, x: taht.x, y: taht.y, tier, own, members }, 0);
  }

  private setTowers(towers: readonly ReceiptTower[], context: ReceiptContext) {
    if (towers === this.towers) return;
    this.towers = towers;
    this.railCount = 0;
    for (const tower of towers) {
      if (tower.definitionId !== "zeynep-8") continue;
      let rail = this.rails[this.railCount];
      if (!rail) {
        rail = { rect: { left: 0, right: 0, top: 0, bottom: 0 }, ownerId: undefined, level: 1, vertical: false, x: 0, y: 0 };
        this.rails[this.railCount] = rail;
      }
      rail.rect = getAbartiRailRect(tower.x, tower.y, tower.orientation, context.gridSize);
      rail.ownerId = tower.ownerId;
      rail.level = tower.level;
      rail.vertical = tower.orientation === "vertical";
      rail.x = tower.x;
      rail.y = tower.y;
      this.railCount += 1;
    }
  }

  private getStructures() {
    if (this.structures && this.structuresFor === this.towers) return this.structures;
    this.structuresFor = this.towers;
    this.structures = this.towers.map((tower) => ({
      id: tower.id,
      x: tower.x,
      y: tower.y,
      level: tower.level,
      characterId: tower.characterId ?? (tower.definitionId.startsWith("zeynep-") ? "zeynep" : ""),
      definition: DEFINITIONS.get(tower.definitionId) ?? ({ id: tower.definitionId } as TowerDefinition),
      tower
    }));
    return this.structures;
  }

  private towerAt(x: number, y: number, reach: number) {
    let best = reach * reach;
    let found: ReceiptTower | undefined;
    for (const tower of this.towers) {
      const gap = (tower.x - x) ** 2 + (tower.y - y) ** 2;
      if (gap <= best) {
        best = gap;
        found = tower;
      }
    }
    return found;
  }

  /** Sunucunun `getAbartiPassThroughLevel`i: parcayi kesen ayni sahibin raylarindan en yuksek seviye. */
  private railLevelAlong(x1: number, y1: number, x2: number, y2: number, ownerId: string | undefined) {
    let level = 0;
    for (let index = 0; index < this.railCount; index += 1) {
      const rail = this.rails[index];
      if (rail.ownerId !== ownerId) continue;
      if (getSegmentRectEntry(x1, y1, x2, y2, rail.rect) !== undefined) level = Math.max(level, rail.level);
    }
    return level;
  }

  /** Parcanin ayni sahibin rayina ilk girisi (en yakin). */
  private findRailCrossing(x1: number, y1: number, x2: number, y2: number, ownerId: string | undefined) {
    let bestT = Number.POSITIVE_INFINITY;
    let best: Rail | undefined;
    for (let index = 0; index < this.railCount; index += 1) {
      const rail = this.rails[index];
      if (rail.ownerId !== ownerId) continue;
      const t = getSegmentRectEntry(x1, y1, x2, y2, rail.rect);
      if (t === undefined || t >= bestT) continue;
      bestT = t;
      best = rail;
    }
    if (!best) return undefined;
    // Nabiz rayin ortasindan gecen cizgide; parcanin rayi kestigi yerde.
    const px = x1 + (x2 - x1) * bestT;
    const py = y1 + (y2 - y1) * bestT;
    return { rail: best, t: bestT, x: best.vertical ? best.x : px, y: best.vertical ? py : best.y };
  }
}

/**
 * Ayna isininin yolu: kuyruk, sunucunun gonderdigi sekme koseleri, bas.
 * Noktalar cagiranin dizisine yaziliyor; nokta sayisi donuyor.
 */
export function fillRayPath(beam: Pick<BeamSnapshot, "x1" | "y1" | "x2" | "y2" | "b">, out: Array<{ x: number; y: number }>) {
  let count = putPoint(out, 0, beam.x1, beam.y1);
  const bounces = beam.b;
  if (bounces) {
    // En fazla alti sekme: sunucu 12 parcaya kadar uretiyor ama gorunen boy bir iki kose tasir.
    for (let index = 0; index + 1 < bounces.length && count < 7; index += 2) count = putPoint(out, count, bounces[index], bounces[index + 1]);
  }
  return putPoint(out, count, beam.x2, beam.y2);
}

function putPoint(out: Array<{ x: number; y: number }>, index: number, x: number, y: number) {
  const point = out[index] ?? (out[index] = { x: 0, y: 0 });
  point.x = x;
  point.y = y;
  return index + 1;
}
