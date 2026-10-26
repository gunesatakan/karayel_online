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
 * Bicem: az ama iri ve parlak oge (oyuncak gibi temiz bilimkurgu). Cekirdekler
 * ve parlamalar HDR (`heat`): egik gorunumun parlama (bloom) esigi 1,0; yalnizca
 * ondan parlak isik yayiliyor. Koyu duman yok, isik eklemeli.
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
  /**
   * HDR isik carpani (dogrusal): beyaz-sicak cekirdek ve parlamalar `core`,
   * renkli hale `halo`; dolgun renk katmani (isin govdesi, ates topu) halenin
   * 1,35 kati. Koyu ton (mor, kirmizi) once biraz aydinlatiliyor (shot-fx).
   */
  heat: { core: number; halo: number };
  /** Govde: boy ve en (hucre), donus hizi (tur / sn). */
  body: { length: number; width: number; spin: number };
  /**
   * Iz: birim yol basina parcacik, omur (ms), boy (hucre), kivilcim payi (0-1);
   * govdenin arkasindaki incelen isik seridinin boyu ve eni (hucre).
   */
  trail: { density: number; lifeMs: number; size: number; sparkle: number; length: number; width: number };
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
  /**
   * Isin: cekirdek ve hale eni (isin eninin kati), en az enleri (hucre; ince
   * lazer de okunsun), titreme, akan nabiz.
   */
  beamLook: { core: number; glow: number; coreMin: number; glowMin: number; flicker: number; pulses: number };
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
    // Cekirdek tonu hafif renkli: beyazligi HDR isi veriyor, ton kaybolmasin.
    core: whiten(color, [0.4, 0.55, 0.7][index]),
    accent: seed.accent,
    // Kademe yukseldikce daha sicak: cekirdek 2,4 -> 3,2 (parliyor, beyazlaniyor);
    // hale ~1 (doygun renk; ACES 1'in cok ustunu beyaza kaciriyor).
    heat: { core: [2.4, 2.8, 3.2][index], halo: [0.95, 1.05, 1.15][index] },
    // Kucuk, okunur govde (dusmandan belirgin kucuk): mermi 0,1-0,25 hucre, ortasi beyaz-sicak.
    body: {
      length: { tracer: 0.19, packet: 0.15, cell: 0.13, gaze: 0.12, arc: 0.13, lance: 0.24, orb: 0.11 }[seed.shape] * (1 + index * 0.1),
      width: { tracer: 0.05, packet: 0.14, cell: 0.14, gaze: 0.13, arc: 0.14, lance: 0.06, orb: 0.12 }[seed.shape] * (1 + index * 0.1) * (seed.heavy ? 1.1 : 1),
      spin: { tracer: 0, packet: 2.2, cell: 1.6, gaze: 0.4, arc: 3, lance: 0, orb: 0.8 }[seed.shape]
    },
    // Iz once serit (tek parca, kisa ve ince; mermiden en cok ~2 kat uzun); parcaciklar seyrek ve kucuk.
    trail: {
      density: (seed.shape === "tracer" || seed.shape === "lance" ? 0.2 : 0.16) * power,
      lifeMs: 140 + index * 60,
      size: 0.06 * (1 + index * 0.2) * (seed.heavy ? 1.1 : 1),
      sparkle: [0.08, 0.2, 0.35][index],
      length: { tracer: 0.38, packet: 0.28, cell: 0.24, gaze: 0.26, arc: 0.24, lance: 0.45, orb: 0.24 }[seed.shape] * (1 + index * 0.15),
      width: { tracer: 0.07, packet: 0.1, cell: 0.1, gaze: 0.1, arc: 0.11, lance: 0.08, orb: 0.09 }[seed.shape] * (1 + index * 0.1)
    },
    arc: seed.arc ?? 0,
    // Namlu: sert parlama ve az ama iri kivilcim; duman yok.
    muzzle: { flash: 0.22 * power * heavy, sparks: Math.round(3 * power), smoke: 0, ring: index >= 1 },
    hit: {
      flash: 0.42 * power * heavy,
      sparks: Math.round(6 * power * heavy),
      speed: 3.6 + index,
      debris: seed.impact === "burst" || seed.impact === "uplink" || seed.impact === "lock" ? Math.round(3 * power) : Math.round(1.5 * power),
      embers: index === 0 ? 0 : Math.round(3 * power),
      // Duman yok: koyu duman parlak sahnede kir, acik toz koyu tahtada gri pus gibi duruyor.
      smoke: 0,
      // Ortak yer halkasi 1/1/2: her carpmanin kendi halkasi zaten var.
      rings: index === 2 ? 2 : 1,
      pillar: index === 2,
      scorch: index >= 1 || Boolean(seed.heavy),
      groundGlow: (1 + index * 0.5) * heavy
    },
    // Lazer: cekirdek 0,045/0,055/0,065, hale 0,16/0,19/0,22 hucre (en azi); titreme az.
    beamLook: {
      core: [0.32, 0.35, 0.38][index],
      glow: [1.4, 1.7, 2][index],
      coreMin: [0.045, 0.055, 0.065][index],
      glowMin: [0.16, 0.19, 0.22][index],
      flicker: [0.05, 0.07, 0.09][index],
      pulses: index
    }
  };
  recipeCache.set(cacheKey, recipe);
  return recipe;
}

/** Tarifi olan (3D vurusu tasarlanmis) kuleler. */
export const SHOT_TOWER_IDS: readonly string[] = Object.keys(TOWERS);
