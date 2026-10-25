/**
 * Egik 3D gorunumun vurus tarifleri (render3d/shot-fx.ts ciziyor).
 *
 * Her kulenin kendi mermisi, izi, namlu atesi ve carpmasi var; ton 2D
 * profilinin kimlik tonu (vfx/vfx-profiles.ts, `base`). Kademe oyundaki gibi
 * seviye 1-4 / 5-9 / 10 (`getTowerTier`): kademe yukseldikce vurus yalnizca
 * buyumuyor, yeni katman kazaniyor:
 *
 * - Kademe 1: govde, kisa iz, sert parlama, kivilcim.
 * - Kademe 2: daha uzun ve parlak iz, ikinci halka, kor parcaciklari, yerde isik.
 * - Kademe 3: beyaz-sicak cekirdek, isik sutunu ya da ikinci patlama, yanik izi,
 *   uzun sonen korlar ve kademenin vurgu rengi (ikinci ton).
 *
 * Saf veri: three.js yok, node testleri dogrudan okuyor.
 */

export type ShotTier = 1 | 2 | 3;

/** Merminin 3D govdesi. */
export type ShotShape =
  /** Ince, sert iz mermisi (Takipci). */
  | "tracer"
  /** Donen elmas veri paketi, yuksek kavisle (Sunucu). */
  | "packet"
  /** Donen altigen hucre, sarmal iz (Izolasyon). */
  | "cell"
  /** Koyu cekirdekli goz kuresi (Obsesyon). */
  | "gaze"
  /** Catirdayan elektrik topu (Ucube). */
  | "arc"
  /** Uzun kristal mizrak (Hiza, Taht). */
  | "lance"
  /** Yedek: parlak enerji kuresi. */
  | "orb";

/** Carpmanin 3D dili. */
export type ShotImpactStyle =
  /** Kilit: capraz koseli kivilcimlar ve daralan yer halkasi. */
  | "lock"
  /** Yukari baglanti: gokten inen isik sutunu ve alan sok halkasi. */
  | "uplink"
  /** Kapatma: yerde altigen halka ve yukselen kafes cubuklari. */
  | "contain"
  /** Ice cokus: parcaciklar merkeze cekiliyor, sonra patliyor. */
  | "collapse"
  /** Firtina: kirik elektrik kollari ve titreyen parlamalar. */
  | "storm"
  /** Delme: ucus yonune dik ince kesik ve ileri sacilan kristal kirintilari. */
  | "pierce"
  /** Yedek: kivilcim ve kirinti patlamasi. */
  | "burst";

/** Isinin 3D dili. */
export type ShotBeamStyle = "laser" | "spot" | "wave" | "plain";

export type ShotRecipe = {
  definitionId: string;
  tier: ShotTier;
  shape: ShotShape;
  impact: ShotImpactStyle;
  beam: ShotBeamStyle;
  /** Kimlik tonu, beyaz-sicak cekirdek ve kademe 3'un vurgu tonu. */
  color: number;
  core: number;
  accent: number;
  /** Govde: boy ve en (hucre), donus hizi (tur / sn). */
  body: { length: number; width: number; spin: number };
  /** Iz: birim yol basina parcacik, omur (ms), boy (hucre), kivilcim payi (0-1). */
  trail: { density: number; lifeMs: number; size: number; sparkle: number };
  /** Kavis: yolun ortasindaki ek yukseklik (hucre); 0 duz hat (namludan hedefin govdesine). */
  arc: number;
  muzzle: { flash: number; sparks: number; smoke: number; ring: boolean };
  hit: {
    /** Sert parlamanin capi (hucre). */
    flash: number;
    sparks: number;
    /** Kivilcim hizi (hucre / sn). */
    speed: number;
    debris: number;
    /** Uzun sonen korlar. */
    embers: number;
    smoke: number;
    /** Yer halkalari (sok dalgasi) sayisi. */
    rings: number;
    /** Isik sutunu ya da ikinci patlama (kademe 3). */
    pillar: boolean;
    scorch: boolean;
    /** Yerdeki renkli isik (hucre). */
    groundGlow: number;
  };
  /** Isin: cekirdek ve hale eni (isin eninin kati), titreme, akan nabiz. */
  beamLook: { core: number; glow: number; flicker: number; pulses: number };
};

type TowerSeed = {
  shape: ShotShape;
  impact: ShotImpactStyle;
  beam?: ShotBeamStyle;
  /** Kademe basina ton (2D rampasi); tek ton verilirse ucu de ayni. */
  colors: readonly [number, number, number];
  accent: number;
  heavy?: boolean;
  arc?: number;
};

/** Tonlar 2D profillerinden (vfx-profiles `base`, warrior-5 rampasi). */
const TOWERS: Readonly<Record<string, TowerSeed>> = {
  "warrior-1": { shape: "tracer", impact: "lock", colors: [0x4dffbd, 0x4dffbd, 0x7dffd0], accent: 0xffffff },
  "warrior-2": { shape: "packet", impact: "uplink", colors: [0x58d9ff, 0x58d9ff, 0x8be6ff], accent: 0xf0f9ff, heavy: true, arc: 0.9 },
  "warrior-3": { shape: "cell", impact: "contain", colors: [0x7fe5e8, 0x7fe5e8, 0xa5f3f5], accent: 0x60a5fa },
  "warrior-4": { shape: "gaze", impact: "collapse", colors: [0xcb79ff, 0xcb79ff, 0xdda0ff], accent: 0xff4fd8 },
  "warrior-5": { shape: "orb", impact: "burst", beam: "laser", colors: [0xef4444, 0x60a5fa, 0xe0f2fe], accent: 0xffffff },
  "warrior-6": { shape: "arc", impact: "storm", colors: [0xadf765, 0xadf765, 0xd4ff9a], accent: 0x67e8f9, heavy: true },
  "zeynep-1": { shape: "lance", impact: "pierce", colors: [0xec4899, 0xec4899, 0xf472b6], accent: 0xfde68a },
  "zeynep-2": { shape: "orb", impact: "burst", beam: "spot", colors: [0xf9a8d4, 0xf9a8d4, 0xfbcfe8], accent: 0xffffff },
  "zeynep-3": { shape: "lance", impact: "pierce", colors: [0xf0abfc, 0xf0abfc, 0xfacc15], accent: 0xfde047 },
  "zeynep-6": { shape: "orb", impact: "burst", beam: "wave", colors: [0xdc466d, 0xdc466d, 0xf05a83], accent: 0xffc2d4 },
  "zeynep-8": { shape: "orb", impact: "burst", beam: "plain", colors: [0x7c3aed, 0x7c3aed, 0x9f67ff], accent: 0xe9d5ff }
};

/** Profil kimliginin kok kulesi: "zeynep-3-copy", "zeynep-3-kin-wave" -> "zeynep-3". */
export function shotTowerId(definitionId: string | undefined) {
  const id = definitionId ?? "";
  const match = /^([a-z]+-\d+)/.exec(id);
  return match ? match[1] : id;
}

export function toShotTier(tier: number | undefined): ShotTier {
  return tier === 3 ? 3 : tier === 2 ? 2 : 1;
}

/** Tonu beyaza dogru `amount` kadar cek. */
export function whiten(color: number, amount: number) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const lift = (value: number) => Math.round(value + (255 - value) * amount);
  return (lift(r) << 16) | (lift(g) << 8) | lift(b);
}

const recipeCache = new Map<string, ShotRecipe>();

/**
 * Kulenin bu kademedeki 3D vurusu. Bilinmeyen kule `fallbackColor` tonunda
 * yedek kure ve patlama.
 */
export function getShotRecipe(definitionId: string | undefined, tier: number | undefined, fallbackColor = 0x94a3b8): ShotRecipe {
  const id = shotTowerId(definitionId);
  const level = toShotTier(tier);
  const cacheKey = `${definitionId ?? ""}|${level}|${fallbackColor}`;
  const cached = recipeCache.get(cacheKey);
  if (cached) return cached;
  const seed: TowerSeed = TOWERS[id] ?? { shape: "orb", impact: "burst", colors: [fallbackColor, fallbackColor, whiten(fallbackColor, 0.2)], accent: 0xffffff };
  const index = level - 1;
  const heavy = seed.heavy ? 1.25 : 1;
  // Kademenin gucu: 1, 1,55, 2,3 (parcacik sayisi ve boy); kademe 3'te yeni katmanlar.
  const power = [1, 1.55, 2.3][index];
  const color = seed.colors[index];
  // Taht'in ikili mizragi kademe 3'te altin; kopyalanan Hiza mizragi da Taht'in.
  const recipe: ShotRecipe = {
    definitionId: definitionId ?? id,
    tier: level,
    shape: seed.shape,
    impact: seed.impact,
    beam: seed.beam ?? "plain",
    color,
    core: whiten(color, [0.55, 0.72, 0.9][index]),
    accent: seed.accent,
    // Govde kulenin kucuk bir parcasi (kule ~1 hucre): mermi 0,1-0,3 hucre.
    body: {
      length: { tracer: 0.22, packet: 0.15, cell: 0.13, gaze: 0.13, arc: 0.14, lance: 0.3, orb: 0.11 }[seed.shape] * (1 + index * 0.08),
      width: { tracer: 0.035, packet: 0.11, cell: 0.11, gaze: 0.11, arc: 0.12, lance: 0.05, orb: 0.09 }[seed.shape] * (1 + index * 0.1) * (seed.heavy ? 1.1 : 1),
      spin: { tracer: 0, packet: 2.2, cell: 1.6, gaze: 0.4, arc: 3, lance: 0, orb: 0.8 }[seed.shape]
    },
    trail: {
      density: (seed.shape === "tracer" || seed.shape === "lance" ? 0.55 : 0.4) * power,
      lifeMs: 150 + index * 90,
      size: 0.06 * (1 + index * 0.25) * (seed.heavy ? 1.1 : 1),
      sparkle: [0.1, 0.3, 0.55][index]
    },
    arc: seed.arc ?? 0,
    muzzle: { flash: 0.3 * power * heavy, sparks: Math.round(4 * power), smoke: index === 0 ? 0 : index, ring: index >= 1 },
    hit: {
      flash: 0.5 * power * heavy,
      sparks: Math.round(10 * power * heavy),
      speed: 3.2 + index * 1.1,
      debris: seed.impact === "burst" || seed.impact === "uplink" || seed.impact === "lock" ? Math.round(4 * power) : Math.round(2 * power),
      embers: index === 0 ? 0 : Math.round(5 * power),
      smoke: Math.round((seed.heavy ? 3 : 1.5) * power),
      rings: index + 1,
      pillar: index === 2,
      scorch: index >= 1 || Boolean(seed.heavy),
      groundGlow: (0.9 + index * 0.55) * heavy
    },
    beamLook: {
      core: [0.35, 0.42, 0.5][index],
      glow: [2.2, 2.8, 3.6][index],
      flicker: [0.12, 0.18, 0.26][index],
      pulses: index
    }
  };
  recipeCache.set(cacheKey, recipe);
  return recipe;
}

/** Tarifi olan (3D vurusu tasarlanmis) kuleler. */
export const SHOT_TOWER_IDS: readonly string[] = Object.keys(TOWERS);
