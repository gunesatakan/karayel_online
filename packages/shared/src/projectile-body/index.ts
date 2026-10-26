/**
 * Merminin cizilen govdesi ve isabet sekli: ikisi ayni sayilardan.
 *
 * Sahibin karari (2026-10): "Mermiler de cizildigi kadar vurus yaricapina
 * sahip olmali." Eskiden carpisma vurus tipinden geliyordu (mermi 4, carpma
 * 8, dalga 4 birim) ve cizimle hicbir ilgisi yoktu: Ucube'nin 3,4 birimlik
 * plazma basi 8 birimden, Takipci'nin 0,8 birimlik izi 4 birimden vuruyordu.
 *
 * Istemcinin cizicileri (attack-vfx, zeynep-signatures, atakan-shots,
 * combat-vfx, kit, PreloaderScene) govdenin dis hatlarini belirleyen
 * carpanlari buradan okuyor; sunucu ayni carpanlardan govdenin olcusunu
 * cikariyor. Bir carpan degisirse ikisi birlikte degisiyor; cizimi buradan
 * okumadan degistiren olursa `tests/projectile-body.test.mjs` gercek cizimi
 * olcup yakaliyor.
 *
 * Govde ne sayiliyor: mermi govdesinin kendisi (dolu sekiller, kalin
 * cizgiler); isabet sekli cizicinin bu parcalarinin birlesimi (hicbir yerde
 * cizimden erken ya da gec degil, test iki yonde olcuyor).
 *
 * Yalnizca gorsel (karar, 2026-10; isabet seklinde yok):
 * - Ucube'nin 3. kademede donen uydulari (sahibin karari);
 * - Ucube'nin 3. kademe damar catali: basin yanindan cikan ince catal cizgi;
 *   hangi yana catallandigi istemcinin duvar saatiyle yeniden cekiliyor
 *   (`SHOT_RESEED_MS`), sunucu onu bilemiyor (uydular gibi efekt, karar);
 * - Taht mizraklarinin kuyruktaki kertik pipleri (dizilimin isareti; sahibin
 *   karari);
 * - cift mizragin 3. kademedeki altin kilifi (alfasi 0,25-0,75 arasi nabizla
 *   yanip sonuyor, cogu karede govdeden soluk; mizragin basi ile arasi bos).
 *
 * Govdenin cevresindeki efekt (sayilmiyor): iz seridi, ADD isi damgasi
 * (yumusak hale), Obsesyon'un bakis kamasi (iz), Ucube'nin catirti arklari,
 * oteki filamanlari ve ince halkasi.
 */
import { TOWER_GRID_SIZE } from "../index.js";

/**
 * Kule mermilerinin gorunus olcegi (sahibin istegi: "mermiler %20 kucuk",
 * 2026-10-27'de bir %20 daha: 0,8 -> 0,64). Govde bununla ciziliyor; isabet
 * sekli de cizilen govde oldugu icin onu da kapsiyor.
 */
export const PROJECTILE_VISUAL_SCALE = 0.64;

/** Merminin govdesi nasil ciziliyor. Ses (hit-sounds) bunu okuyor: degerler sabit. */
export type ProjectileSilhouette =
  /** Sivri ok ucu; tek hedefe mermi. */
  | "dart"
  /** Yogun enerji gullesi; alan hasari. */
  | "orb"
  /** Agir, koyu kenarli gulle. */
  | "ball"
  /** Ince halkali destek atisi. */
  | "ring"
  /** Kulenin kendi cizilmis dokusu (Melis). */
  | "sprite"
  /** combat-vfx'in hareketli govdesi (Takipci). */
  | "combat"
  /** Ucan goz: badem mercek ve yarik gozbebegi (Obsesyon, atakan-shots). */
  | "gaze"
  /** Veri paketi: koseli agir govde (Sunucu). */
  | "packet"
  /** Altigen kabuk: kapatma alaninin kucuk hali (Izolasyon). */
  | "cell"
  /** Plazma yuku: bas ve damla (Ucube, atakan-shots). */
  | "arc"
  /** Zeynep'in mizragi: ince uzun govde ve sivri uc; Taht'ta kuyrukta dizilimin isareti. */
  | "lance"
  /** Mermi yok; isin, dalga ya da yorunge. */
  | "none";

/** Siluetin boyu (dunya birimi, olcekten once); kademeyle buyumuyor. */
export const PROJECTILE_SILHOUETTE_SIZE: Readonly<Record<ProjectileSilhouette, number>> = {
  dart: 14,
  orb: 13,
  ball: 15,
  ring: 13,
  sprite: 16,
  combat: 14,
  gaze: 14,
  packet: 14,
  cell: 13,
  arc: 14,
  lance: 15,
  none: 12
};

/** Kademe basina govde agirligi: kalinlik ve kuvvet carpani (boy degil). */
export const PROJECTILE_TIER_WEIGHT = [1, 1.3, 1.6] as const;

/** Kulenin siluet kimligi. Kayitta olmayan kimlik ok (dart) ciziliyor. */
const PROJECTILE_SILHOUETTES: Readonly<Record<string, ProjectileSilhouette>> = {
  "warrior-1": "combat",
  "warrior-2": "packet",
  "warrior-3": "cell",
  "warrior-4": "gaze",
  "warrior-5": "none",
  "warrior-6": "arc",
  "zeynep-1": "lance",
  "zeynep-2": "none",
  "zeynep-3": "lance",
  "zeynep-6": "none",
  "zeynep-8": "none",
  "archer-1": "sprite",
  "archer-2": "sprite",
  "archer-3": "none",
  "archer-4": "none",
  "archer-5": "sprite",
  "archer-6": "sprite",
  "onur-1": "none",
  "onur-2": "dart",
  "onur-3": "dart",
  "onur-4": "dart",
  "onur-5": "dart",
  "onur-6": "dart"
};

/** Taslak karakterlerin sinif silueti. */
const STUB_SILHOUETTES: Readonly<Record<string, ProjectileSilhouette>> = { mage: "orb", healer: "ring", tank: "ball" };

/** Kuleye ozgu govde kalinligi (1 varsayilan): eni buyutuyor, boyu degil. Ucube 2x2 kule, mermisi de iki kat kalin. */
const PROJECTILE_THICKNESS: Readonly<Record<string, number>> = { "warrior-6": 2 };

/**
 * Mermi ya da isin kimliginden kulenin kimligi. Sunucu ozel atislara son ek
 * veriyor ("archer-6-whisper", "zeynep-3-kin-projectile"); govde kulenin.
 */
export function getProjectileProfileId(definitionId: string | undefined) {
  if (!definitionId) return "";
  const match = /^(warrior|zeynep|archer|mage|healer|tank|onur)-\d+/.exec(definitionId);
  return match ? match[0] : definitionId;
}

export function getProjectileSilhouette(definitionId: string | undefined): ProjectileSilhouette {
  const id = getProjectileProfileId(definitionId);
  const known = PROJECTILE_SILHOUETTES[id];
  if (known) return known;
  const stub = /^(mage|healer|tank)-\d+$/.exec(id);
  return stub ? STUB_SILHOUETTES[stub[1]] : "dart";
}

export function getProjectileThickness(definitionId: string | undefined) {
  return PROJECTILE_THICKNESS[getProjectileProfileId(definitionId)] ?? 1;
}

/**
 * Taht'in kopyaladigi Hiza mermisi. Sunucu oyun kurali icin "zeynep-1"
 * gonderiyor; istemci kopya mizragi (kuyrugunda dizilim) olarak ciziyor.
 * Sunucu govdeyi dogumda bu kimlikten aliyor.
 */
export const TAHT_COPY_PROJECTILE_ID = "zeynep-3-copy";

/** Mizragin kipi: Hiza'nin kendi atisi ya da Taht'in uc mizragi. */
export type ProjectileLanceMode = "hiza" | "dual" | "kin" | "copy";

export function getProjectileLanceMode(definitionId: string | undefined): ProjectileLanceMode {
  switch (definitionId) {
    case "zeynep-3": return "dual";
    case "zeynep-3-kin-projectile": return "kin";
    case TAHT_COPY_PROJECTILE_ID: return "copy";
    default: return "hiza";
  }
}

/* ------------------------------------------------------------------ */
/* Govdenin dis hatlari (r = siluet / 2 x sahne olcegi x gorunus olcegi)  */
/* ------------------------------------------------------------------ */

/** `drawSlug` (kit): govde cizgisi, beyaz-sicak cekirdek ve parlak kare bas. */
export const PROJECTILE_SLUG = { minWidth: 0.8, coreRatio: 0.45, minCoreWidth: 0.6, headRatio: 0.42, minHead: 0.7 } as const;

/** Ok (dart): sert iz mermisi ve sivri uc. */
export const DART_BODY = { shaft: 1.7, shaftWidth: 0.3, tip: 0.75, headHalf: 0.24, headBack: 0.1 } as const;

/** Izolasyon hucresi: kisa govde ve ince altigen kabuk (kosesi ileri bakiyor). */
export const CELL_BODY = { shaft: 1.2, shaftWidth: 0.3, hex: 0.8, stroke: 0.1, minStroke: 0.6 } as const;

/** Enerji gullesi: yogun disk ve beyaz-sicak cekirdek. */
export const ORB_BODY = { radius: 0.58, core: 0.24 } as const;

/** Agir gulle: ton kenarli koyu disk. */
export const BALL_BODY = { radius: 0.72, inner: 0.58, core: 0.2 } as const;

/** Destek atisi: ince ton halkasi. */
export const RING_BODY = { radius: 0.55, width: 0.16, minWidth: 0.8, core: 0.18, minCore: 0.8 } as const;

/** Sunucu paketi: elmas (on uc, yanlar, arka uc). */
export const PACKET_BODY = { tip: 0.8, side: 0.7, back: 0.8, core: 0.17 } as const;

/** Takipci'nin iz mermisi (combat-vfx): boy ve en kademeyle, olcek x1,4. */
export const COMBAT_BODY = { scale: 1.4, length: 6, lengthPerTier: 1.5, width: 1.1, widthPerTier: 0.3 } as const;

/**
 * Zeynep'in mizragi (zeynep-signatures): uc, bas ucgeni, govde; Taht'ta
 * kuyrukta dizilim kertikleri, cift mizragin 10. seviyesinde altin kilif
 * (kertikler ve kilif cizimin sayilari, govde degil).
 */
export const LANCE_SHOT_BODY = {
  tip: 1.05,
  headHalf: 0.3,
  headBack: 0.15,
  shaft: 2,
  shaftWidth: 0.2,
  minShaftWidth: 1,
  sigilBack: 2.7,
  sigilSide: 0.45,
  sigilLead: 0.5,
  pip: 0.18,
  minPip: 1.4,
  leadPip: 1.3,
  coreBack: 0.9,
  coreFront: 0.8,
  coreWidth: 0.09,
  minCoreWidth: 0.8,
  sheathBack: 1.1,
  sheathFront: 0.6,
  sheathSide: 0.3,
  minSheathSide: 1.2,
  sheathWidth: 0.06,
  minSheathWidth: 0.7
} as const;

/**
 * Obsesyon'un mercegi (atakan-shots): boyu `length x r`, yari eni
 * `half x thickness x r`; bes dilimli badem, dilim yuksekligi
 * `sin(pi t) ^ exponent`.
 */
export const OBSESSION_SHOT_BODY = { thickness: 2 / 3, length: 2.15, half: 0.62, lensSegments: 5, lensExponent: 0.7 } as const;

/** Ucube'nin plazma yuku (atakan-shots): bas diski ve geriye sivrilen damla. */
export const UCUBE_SHOT_BODY = { size: 0.75, head: 0.4, tail: 2.6 } as const;

/**
 * Melis'in dokulu mermileri (PreloaderScene): doku boyu ve govdenin piksel
 * sinirlari (doku merkezinden; +x ucus yonu). Doku ekranda siluet boyunda
 * (16 x olcek) ciziliyor. Soluk haleler (alfa 0,16-0,24) ve Fisilti'nin
 * halkanin altindaki koyu diski govde degil: gorunen kenar halka.
 * `nose` ve `wide` dokunun dis bukey zarfindan (`fitProjectileFront`,
 * yaricap `half`); test dokuyu cizdirip ayni hesabi yapiyor. Ok (archer-1)
 * en genis yerini kuyrugundaki cengellerde buluyor; isik ve ayna
 * (archer-2, 5) simetrik degil, disk dar yanin zarfina gore geride.
 */
export const PROJECTILE_SPRITE_BODIES: Readonly<Record<string, { texture: number; tip: number; tail: number; half: number; nose: number; wide: number }>> = {
  "archer-1": { texture: 20, tip: 8, tail: 5, half: 5, nose: 8, wide: -5.926 },
  "archer-2": { texture: 20, tip: 8, tail: 6.47, half: 7.37, nose: 8, wide: -7.545 },
  "archer-5": { texture: 24, tip: 9, tail: 8.4, half: 8, nose: 8.533, wide: -10.962 },
  // Fisilti'nin halkasi bir daire: disk kendi merkezinde.
  "archer-6": { texture: 24, tip: 9.9, tail: 9.9, half: 9.9, nose: 9.9, wide: 0 }
};

/**
 * AttackLord ultisinin saldiri dronu (PreloaderScene `drone-attack`, 30 px):
 * elmas ve halkanin ortalama golge genisliginin yarisi (piksel). Sahnede
 * `spriteScale x ATAKAN_ULTIMATE_DRONE_VISUAL_SCALE` ile ciziliyor; nabiz
 * (+/-%8, duvar saati) ortalamada 1. Soluk hale (alfa 0,18) govde degil.
 */
export const ATAKAN_ATTACK_DRONE_BODY = { texture: 30, radius: 10.35, spriteScale: 1.55 } as const;

/** AttackLord ultisinin dronlari gorunuste 2/3 (sahibin istegi). */
export const ATAKAN_ULTIMATE_DRONE_VISUAL_SCALE = 2 / 3;

/* ------------------------------------------------------------------ */
/* Govde ve isabet sekli                                                 */
/* ------------------------------------------------------------------ */

/**
 * Isabet seklinin bir parcasi: cizicinin doldurdugu dis bukey bir ilkel
 * (ucgen, uclari kesik kalin cizgi, kare bas, mercek), koseleri x, y
 * ciftleri; +x ucus yonu, +y sol. Sira onemsiz (zarf aliniyor).
 */
export type ProjectileHitPart = readonly number[];

/**
 * Cizilen govdenin olcusu (dunya birimi), merminin konumundan ucus yonunde:
 * `tip` en ondeki nokta, `tail` en arkadaki, `halfWidth` govdenin yanlara en
 * genis yeri, `nose` eksendeki en on nokta (sivri ucun kendisi). Isabet
 * sekli cizicinin parcalarindan (`parts`, dolu dis bukey ilkeller) ve disk
 * govdelerde (gulle, halka, Ucube'nin basi) merkezdeki diskten (`disc`
 * yaricapi; yoksa 0). Melis'in dokulari parcasiz: `wide` dokunun zarfina
 * sigan on diskin merkezi (`fitProjectileFront`). Taht mizraklarinin
 * kuyruktaki kertik pipleri, cift mizragin altin kilifi, Ucube'nin 3.
 * kademe uydulari ve damar catali govde degil: yalnizca gorsel (dizilimin
 * isareti, nabizli parilti, plazmanin cevresi; bkz. dosyanin basi).
 */
export type ProjectileBody = { tip: number; tail: number; halfWidth: number; nose: number; wide: number; disc: number; parts: ProjectileHitPart[] };

/** Bir sekildeki en fazla parca, dogru, yanal ve kose (derlenmis tablonun boyu). */
const MAX_PARTS = 12;
const MAX_LINES = 64;
/** Derlenmis tablonun yanal sayisi (enemy-body'nin tamponlari da bu boyda). */
export const PROJECTILE_MAX_OFFSETS = 64;
const MAX_OFFSETS = PROJECTILE_MAX_OFFSETS;
const MAX_POINTS = 128;

/**
 * Parcalarin derlenmis hali: her parca yanal `[ylo, yhi]` araliginda
 * `R(y) <= x <= F(y)` (on zarf `F` dogrularin en kucugu, ic bukey; arka
 * zarf `R` dogrularin en buyugu, dis bukey: dis bukey cokgenin iki yani).
 * Yanallar (`oy`) parcalarin koselerinin yanallari, o yanalda on ve arka
 * zarfin degeri (`of`, `or`) onceden hesapli: ucan merminin ilk temasi
 * yalnizca bu yanallarda ve dusmanin koselerinde araniyor (bkz.
 * enemy-body `getMovingBodyContact`). Kose noktalari (`px`, `py`) siper
 * durusunun destek noktasi icin. Tek bicimli sinif: sicak yolda okunuyor.
 */
export class ProjectilePartTable {
  count = 0;
  /** Birlesimin sinirlari: arka (`minX`), on, yanallar. */
  minX = 0;
  maxX = 0;
  minY = 0;
  maxY = 0;
  readonly ylo = new Float64Array(MAX_PARTS);
  readonly yhi = new Float64Array(MAX_PARTS);
  /** Parcanin en on ve en arka noktasi: aday kosede erken birakma. */
  readonly fmax = new Float64Array(MAX_PARTS);
  readonly rmin = new Float64Array(MAX_PARTS);
  /** On zarfin dogrulari `x = fc + fs y`; parca `p` icin `[frontEnd[p - 1], frontEnd[p])`. */
  readonly frontEnd = new Int32Array(MAX_PARTS);
  readonly fc = new Float64Array(MAX_LINES);
  readonly fs = new Float64Array(MAX_LINES);
  readonly rearEnd = new Int32Array(MAX_PARTS);
  readonly rc = new Float64Array(MAX_LINES);
  readonly rs = new Float64Array(MAX_LINES);
  /** Yanallar; parca `p` icin `[offsetEnd[p - 1], offsetEnd[p])`. */
  readonly offsetEnd = new Int32Array(MAX_PARTS);
  offsetCount = 0;
  readonly oy = new Float64Array(MAX_OFFSETS);
  readonly of = new Float64Array(MAX_OFFSETS);
  readonly or = new Float64Array(MAX_OFFSETS);
  /** Parcalarin kose noktalari (destek). */
  pointCount = 0;
  readonly px = new Float64Array(MAX_POINTS);
  readonly py = new Float64Array(MAX_POINTS);
}

/** Bir parcanin kaynagi: zarflarin dogrulari, yanal araligi ve koselerin yanallari (sekil basina bir kez). */
type PartSource = {
  fc: number[];
  fs: number[];
  rc: number[];
  rs: number[];
  ylo: number;
  yhi: number;
  breaks: number[];
  /** Kesilmemis tabloda parcanin sirasi, en arka ve en on noktasi (kesimin dokunmadigi parca oradan kopyalaniyor). */
  full: number;
  rearMin: number;
  frontMax: number;
};

/**
 * Isabet sekli, cizildigi gibi: cizicinin doldurdugu dis bukey parcalarin
 * birlesimi (`table`: mizragin ucgeni ve govde cizgisi, kare bas, mercek,
 * elmas, altigen kabugun kenarlari, Ucube'nin damlasi) ve disk govdelerde
 * merkezdeki disk (`disc` 1: merkezi `wide`da, yaricapi `radius`). Melis'in
 * dokulari parcasiz, eskisi gibi kapsul ve igne (`disc` 2: kapsulun on
 * diski `wide`da, ignesi `nose`a, govdesi kuyruga). Parcalarin her biri
 * cizilen ilkelin kendisi: sekil hicbir yerde cizimden erken degmiyor, yanda
 * da gec degil (eskiden tek bir kapsul en genis yerin eniyle kuyruga kadar
 * gidiyordu: Hiza'nin 0,6'lik govdesi 1,8'den, Ucube'nin sivrilen damlasi
 * 3,4'ten vuruyordu; mizragin bas ucgeninin yanlari ise modelde yoktu).
 *
 * Geri yon: govde merkezin en fazla `min(ucus, tail)` gerisine uzaniyor
 * (`getProjectileReach`): kuyruk cizilen kuyrugu gecmiyor ve namludan dogan
 * mermi dogdugu noktanin gerisindekine degmiyor; parcalar ve disk o sinirda
 * kesiliyor (`prepareProjectileParts`).
 */
export type ProjectileShape = {
  readonly front: number;
  readonly nose: number;
  readonly tail: number;
  readonly halfWidth: number;
  readonly disc: 0 | 1 | 2;
  readonly wide: number;
  readonly radius: number;
  readonly table: ProjectilePartTable;
  readonly sources: readonly PartSource[];
};

/**
 * Merminin merkezinin gerisine uzanabildigi yol (dunya birimi): atistan beri
 * uculan yol ile cizilen kuyrugun kucugu.
 */
export function getProjectileReach(shape: ProjectileShape, flown: number) {
  return flown < shape.tail ? Math.max(0, flown) : shape.tail;
}

/** Sahnenin mermi olcegi (`GameScene.getTowerEffectScale`): kare 34'te 1. */
export function getProjectileSceneScale(cellSize = TOWER_GRID_SIZE) {
  return Math.max(20, cellSize * 1.12) / (TOWER_GRID_SIZE * 1.12);
}

/**
 * Disk govdenin (Ucube'nin basi) cizildigi kenar sayisi: cokgenin kenar
 * ortasi isabet dairesinden en fazla `PROJECTILE_DISC_TOLERANCE` iceride
 * (cokgenin koseleri dairede). Eski 8 kenar 3,4'luk basta 0,26 iceride
 * kaliyordu: daire cizimden o kadar erken degiyordu.
 */
export const PROJECTILE_DISC_TOLERANCE = 0.05;

export function getProjectileDiscSides(radius: number) {
  if (!(radius > PROJECTILE_DISC_TOLERANCE)) return 8;
  const sides = Math.ceil(Math.PI / Math.acos(1 - PROJECTILE_DISC_TOLERANCE / radius));
  return Math.max(8, Math.ceil(sides / 4) * 4);
}

function toTierIndex(tier: number | undefined) {
  return tier !== undefined && tier >= 3 ? 2 : tier !== undefined && tier >= 2 ? 1 : 0;
}

/** Govdenin bir parcasi: dis bukey cokgenin koseleri (x, y ciftleri; +x ucus yonu). */
type BodyPart = number[];

/** `drawSlug`in parcalari: kalin cizgi (uclari kesik) ve ucusla donuk kare bas. */
function pushSlug(parts: BodyPart[], length: number, width: number) {
  const half = Math.max(PROJECTILE_SLUG.minWidth, width) / 2;
  const head = Math.max(PROJECTILE_SLUG.minHead, width * PROJECTILE_SLUG.headRatio);
  parts.push([0, half, 0, -half, -length, half, -length, -half], [head, head, head, -head, -head, head, -head, -head]);
}

/** Eksene paralel kalin cizgi parcasi (`lineBetween`): yanal `y`de, uclari kesik, kalinlik `width`. */
function pushBar(parts: BodyPart[], fromX: number, toX: number, y: number, width: number) {
  const half = width / 2;
  parts.push([fromX, y + half, fromX, y - half, toX, y + half, toX, y - half]);
}

/** Noktalarin (x, y ciftleri) dis bukey zarfi, saat yonunun tersine. */
function convexHull(points: readonly number[]) {
  const all: Array<[number, number]> = [];
  for (let index = 0; index + 1 < points.length; index += 2) all.push([points[index], points[index + 1]]);
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (all.length <= 2) return all;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const point of all) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-12) lower.pop();
    lower.push(point);
  }
  const upper: Array<[number, number]> = [];
  for (let index = all.length - 1; index >= 0; index -= 1) {
    const point = all[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-12) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Ayni yanalda gorunen iki kosenin kayan nokta farki (cos 60 gibi) zarfi bolmesin. */
const ENVELOPE_EPSILON = 1e-7;

/** Dis bukey parcanin `y` yanalindaki en on noktasi; o yanalda parca yoksa -Infinity. */
function getHullFront(hull: ReadonlyArray<readonly [number, number]>, y: number) {
  let best = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < hull.length; index += 1) {
    const [ax, ay] = hull[index];
    const [bx, by] = hull[(index + 1) % hull.length];
    const low = Math.min(ay, by);
    const high = Math.max(ay, by);
    if (y < low - ENVELOPE_EPSILON || y > high + ENVELOPE_EPSILON) continue;
    const clamped = Math.max(low, Math.min(high, y));
    const x = high - low <= ENVELOPE_EPSILON ? Math.max(ax, bx) : ax + ((clamped - ay) / (by - ay)) * (bx - ax);
    if (x > best) best = x;
  }
  return best;
}

/**
 * Govdenin parcalarindan (dis bukey cokgenler, dunya ya da piksel; +x ucus
 * yonu) igne ucu ve on diskin merkezi. `radius` yaricapli, eksende ortali
 * disk cizilen govdenin on zarfini hicbir yanal uzaklikta gecmiyor: her
 * yanal `y` icin `wide + sqrt(r^2 - y^2)` <= parcalarin o yanaldaki en on
 * noktasi. Melis'in dokularinin kapsulu bununla (`PROJECTILE_SPRITE_BODIES`);
 * oteki mermiler parcalarin kendisiyle vuruyor. En kucuk deger bir kosede,
 * bir kenarin diske teget oldugu yanalda ya da bir parcanin bittigi yerin
 * hemen otesinde; hepsi deneniyor (ornekleme yok). Hic govde olmayan
 * yanallar atlaniyor.
 */
export function fitProjectileFront(parts: ReadonlyArray<readonly number[]>, radius: number) {
  const hulls = parts.map(convexHull).filter((hull) => hull.length > 0);
  const front = (y: number) => {
    let best = Number.NEGATIVE_INFINITY;
    for (const hull of hulls) best = Math.max(best, getHullFront(hull, y));
    return best;
  };
  const nose = front(0);
  let wide = nose;
  const consider = (y: number) => {
    if (!(Math.abs(y) <= radius)) return;
    const x = front(y);
    if (x === Number.NEGATIVE_INFINITY) return;
    const value = x - Math.sqrt(Math.max(0, radius * radius - y * y));
    if (value < wide) wide = value;
  };
  for (const hull of hulls) {
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < hull.length; index += 1) {
      const [ax, ay] = hull[index];
      const [bx, by] = hull[(index + 1) % hull.length];
      low = Math.min(low, ay);
      high = Math.max(high, ay);
      consider(ay);
      if (Math.abs(by - ay) <= ENVELOPE_EPSILON) continue;
      // Kenar x = a + b y; diskin onuyla farki en kucuk: y = -b r / sqrt(1 + b^2).
      const slope = (bx - ax) / (by - ay);
      const tangent = (-slope * radius) / Math.sqrt(1 + slope * slope);
      if (tangent >= Math.min(ay, by) && tangent <= Math.max(ay, by)) consider(tangent);
    }
    // Parcanin bittigi yanalin hemen otesi: zarf orada bir sonraki parcaya dusuyor.
    consider(high + 4 * ENVELOPE_EPSILON);
    consider(low - 4 * ENVELOPE_EPSILON);
  }
  consider(0);
  return { wide, nose };
}

/**
 * Kimligin (istemcinin cizdigi kimlik: Taht kopyasi `TAHT_COPY_PROJECTILE_ID`)
 * ve kademenin govdesi. `sceneScale` sahnenin olcegi (`getProjectileSceneScale`).
 * Disk govdeler (gulle, halka, Ucube'nin basi) kendi merkezinde; otekiler
 * cizicinin kapladigi parcalardan.
 */
export function getProjectileBody(definitionId: string | undefined, tier: number | undefined = 1, sceneScale = 1): ProjectileBody {
  const index = toTierIndex(tier);
  const silhouette = getProjectileSilhouette(definitionId);
  const scale = sceneScale * PROJECTILE_VISUAL_SCALE;
  const r = (PROJECTILE_SILHOUETTE_SIZE[silhouette] / 2) * scale;
  const weight = PROJECTILE_TIER_WEIGHT[index] * getProjectileThickness(definitionId);
  const disc = (radius: number): ProjectileBody => ({ tip: radius, tail: radius, halfWidth: radius, nose: radius, wide: 0, disc: radius, parts: [] });
  const parts: BodyPart[] = [];
  let discRadius = 0;
  switch (silhouette) {
    case "dart": {
      pushSlug(parts, r * DART_BODY.shaft, r * DART_BODY.shaftWidth * weight);
      const half = r * DART_BODY.headHalf * weight;
      parts.push([r * DART_BODY.tip, 0, -r * DART_BODY.headBack, half, -r * DART_BODY.headBack, -half]);
      break;
    }
    case "cell": {
      pushSlug(parts, r * CELL_BODY.shaft, r * CELL_BODY.shaftWidth * weight);
      // Ince altigen kabuk (`strokeHex`, kosesi ileri): kenar basina uclari kesik
      // kalin cizgi. Ince cizgide (kalinlik 2'den az) Phaser kenarlarin birlesimini
      // doldurmuyor: kosede cizilmeyen bir centik var; parcalar tek tek, zarf degil.
      const hex = r * CELL_BODY.hex;
      const stroke = Math.max(CELL_BODY.minStroke, r * CELL_BODY.stroke * weight) / 2;
      for (let side = 0; side < 6; side += 1) {
        const a = (side / 6) * Math.PI * 2;
        const b = ((side + 1) / 6) * Math.PI * 2;
        const ax = Math.cos(a) * hex;
        const ay = Math.sin(a) * hex;
        const bx = Math.cos(b) * hex;
        const by = Math.sin(b) * hex;
        const length = Math.hypot(bx - ax, by - ay);
        const nx = (-(by - ay) / length) * stroke;
        const ny = ((bx - ax) / length) * stroke;
        parts.push([ax + nx, ay + ny, ax - nx, ay - ny, bx + nx, by + ny, bx - nx, by - ny]);
      }
      break;
    }
    case "orb":
      return disc(Math.max(r * ORB_BODY.radius, r * ORB_BODY.core * weight));
    case "ball":
      return disc(Math.max(r * BALL_BODY.radius, r * BALL_BODY.core * weight));
    case "ring":
      return disc(Math.max(r * RING_BODY.radius + Math.max(RING_BODY.minWidth, r * RING_BODY.width * weight) / 2, Math.max(RING_BODY.minCore, r * RING_BODY.core * weight)));
    case "packet": {
      const k = r * PACKET_BODY.tip;
      const core = r * PACKET_BODY.core * weight;
      parts.push([k, 0, 0, k * PACKET_BODY.side, 0, -k * PACKET_BODY.side], [-k * PACKET_BODY.back, 0, 0, k * PACKET_BODY.side, 0, -k * PACKET_BODY.side], [core, core, core, -core, -core, core, -core, -core]);
      break;
    }
    case "combat": {
      const s = scale * COMBAT_BODY.scale;
      const t = index + 1;
      pushSlug(parts, (COMBAT_BODY.length + t * COMBAT_BODY.lengthPerTier) * s, (COMBAT_BODY.width + t * COMBAT_BODY.widthPerTier) * s);
      break;
    }
    case "gaze": {
      // Mercek (`fillLens`): eksende ortali, dilim koseleri `half x sin(pi t)^us`; dis bukey tek parca.
      const length = r * OBSESSION_SHOT_BODY.length;
      const half = r * OBSESSION_SHOT_BODY.half * OBSESSION_SHOT_BODY.thickness;
      const lens: BodyPart = [];
      for (let slice = 0; slice <= OBSESSION_SHOT_BODY.lensSegments; slice += 1) {
        const t = slice / OBSESSION_SHOT_BODY.lensSegments;
        const h = half * Math.pow(Math.sin(Math.PI * t), OBSESSION_SHOT_BODY.lensExponent);
        lens.push(-length / 2 + length * t, h, -length / 2 + length * t, -h);
      }
      parts.push(lens);
      break;
    }
    case "arc": {
      // Plazma basi disk (merkezde); damla tabani basin capi, ucu kuyrukta
      // (`fillTriangle`): kuyruk kendi eniyle sivriliyor. Uydular govde degil.
      const size = r * UCUBE_SHOT_BODY.size;
      const head = size * UCUBE_SHOT_BODY.head * getProjectileThickness(definitionId);
      const tail = size * UCUBE_SHOT_BODY.tail;
      discRadius = head;
      parts.push([0, head, 0, -head, -tail, 0]);
      break;
    }
    case "lance": {
      // Mizrak kalinligi kulenin carpanini okumuyor: agirlik yalnizca kademe.
      const lanceWeight = PROJECTILE_TIER_WEIGHT[index];
      const mode = getProjectileLanceMode(definitionId);
      pushSlug(parts, r * LANCE_SHOT_BODY.shaft, Math.max(LANCE_SHOT_BODY.minShaftWidth, r * LANCE_SHOT_BODY.shaftWidth * lanceWeight));
      const half = r * LANCE_SHOT_BODY.headHalf * lanceWeight;
      parts.push([r * LANCE_SHOT_BODY.tip, 0, -r * LANCE_SHOT_BODY.headBack, half, -r * LANCE_SHOT_BODY.headBack, -half]);
      if (mode === "dual" && index >= 1) {
        pushBar(parts, -r * LANCE_SHOT_BODY.coreBack, r * LANCE_SHOT_BODY.coreFront, 0, Math.max(LANCE_SHOT_BODY.minCoreWidth, r * LANCE_SHOT_BODY.coreWidth * lanceWeight));
      }
      // Taht'in kuyruktaki kertik pipleri (sahibin karari) ve cift mizragin
      // 3. kademedeki altin kilifi govde degil: boy de en de govdeden.
      break;
    }
    case "sprite": {
      const sprite = PROJECTILE_SPRITE_BODIES[getProjectileProfileId(definitionId)];
      const side = PROJECTILE_SILHOUETTE_SIZE.sprite * scale;
      if (!sprite) return disc(side / 2);
      const k = side / sprite.texture;
      return { tip: sprite.tip * k, tail: sprite.tail * k, halfWidth: sprite.half * k, nose: sprite.nose * k, wide: sprite.wide * k, disc: 0, parts: [] };
    }
    case "none":
    default:
      return { tip: 0, tail: 0, halfWidth: 0, nose: 0, wide: 0, disc: 0, parts: [] };
  }
  let tip = discRadius > 0 ? discRadius : Number.NEGATIVE_INFINITY;
  let tail = discRadius > 0 ? discRadius : Number.NEGATIVE_INFINITY;
  let halfWidth = discRadius;
  for (const part of parts) {
    for (let point = 0; point + 1 < part.length; point += 2) {
      tip = Math.max(tip, part[point]);
      tail = Math.max(tail, -part[point]);
      halfWidth = Math.max(halfWidth, Math.abs(part[point + 1]));
    }
  }
  const front = fitProjectileFront(parts, halfWidth);
  return { tip, tail, halfWidth, nose: Math.max(front.nose, discRadius), wide: 0, disc: discRadius, parts };
}

/* ------------------------------------------------------------------ */
/* Parcalarin derlenmesi                                                 */
/* ------------------------------------------------------------------ */

type Point = [number, number];

/** Nokta dis bukey (saat yonunun tersine) cokgenin icinde mi (sinir dahil, `epsilon` payla). */
function isInsideHull(hull: readonly Point[], x: number, y: number, epsilon: number) {
  for (let index = 0; index < hull.length; index += 1) {
    const [ax, ay] = hull[index];
    const [bx, by] = hull[(index + 1) % hull.length];
    const length = Math.hypot(bx - ax, by - ay);
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < -epsilon * length) return false;
  }
  return true;
}

/** Cokgenin sinirindan ve icinden sik ornek noktalar (yalnizca derlemede). */
function samplePolygon(hull: readonly Point[]) {
  const points: Point[] = [];
  for (let index = 0; index < hull.length; index += 1) {
    const [ax, ay] = hull[index];
    const [bx, by] = hull[(index + 1) % hull.length];
    for (let step = 0; step < 48; step += 1) points.push([ax + ((bx - ax) * step) / 48, ay + ((by - ay) * step) / 48]);
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of hull) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let i = 0; i <= 24; i += 1) {
    for (let j = 0; j <= 24; j += 1) {
      const x = minX + ((maxX - minX) * i) / 24;
      const y = minY + ((maxY - minY) * j) / 24;
      if (isInsideHull(hull, x, y, 0)) points.push([x, y]);
    }
  }
  return points;
}

/** Ornek noktalarin hepsi obur parcalardan birinin icinde mi. */
function isCoveredBy(points: readonly Point[], others: ReadonlyArray<readonly Point[]>) {
  return points.every(([x, y]) => others.some((hull) => isInsideHull(hull, x, y, 1e-9)));
}

/**
 * Parcalarin zarflari; obur parcalarin birlesiminin icinde kalan parca
 * (mizragin ucgenin icindeki kare basi, cift mizragin cekirdegi) atiliyor,
 * birlesimi dis bukey olan iki parca (Sunucu paketinin iki ucgeni) tek parca:
 * birlesim degismiyor, tarama daha az yanal ariyor. Yalnizca derlemede.
 */
function buildHitHulls(parts: readonly ProjectileHitPart[]) {
  let hulls = parts.map((part) => convexHull(part) as Point[]).filter((hull) => hull.length >= 3);
  let merged = true;
  while (merged) {
    merged = false;
    for (let a = 0; a < hulls.length && !merged; a += 1) {
      for (let b = a + 1; b < hulls.length && !merged; b += 1) {
        const union = convexHull([...hulls[a].flat(), ...hulls[b].flat()]) as Point[];
        if (isCoveredBy(samplePolygon(union), [hulls[a], hulls[b]])) {
          hulls = hulls.filter((_, index) => index !== a && index !== b).concat([union]);
          merged = true;
        }
      }
    }
  }
  for (let index = hulls.length - 1; index >= 0; index -= 1) {
    const others = hulls.filter((_, other) => other !== index);
    if (others.length > 0 && isCoveredBy(samplePolygon(hulls[index]), others)) hulls = others;
  }
  return hulls;
}

/** Zarfin (saat yonunun tersine) on ve arka zarf dogrulari, yanal araligi ve koselerin yanallari. */
function toPartSource(hull: readonly Point[]): PartSource | undefined {
  const source: PartSource = { fc: [], fs: [], rc: [], rs: [], ylo: Infinity, yhi: -Infinity, breaks: [], full: -1, rearMin: -Infinity, frontMax: Infinity };
  for (let index = 0; index < hull.length; index += 1) {
    const [ax, ay] = hull[index];
    const [bx, by] = hull[(index + 1) % hull.length];
    source.ylo = Math.min(source.ylo, ay);
    source.yhi = Math.max(source.yhi, ay);
    source.breaks.push(ay);
    const dy = by - ay;
    if (Math.abs(dy) <= 1e-12) continue;
    // Saat yonunun tersinde sag yan (on) yukari, sol yan (arka) asagi gidiyor.
    const slope = (bx - ax) / dy;
    if (dy > 0) {
      source.fs.push(slope);
      source.fc.push(ax - slope * ay);
    } else {
      source.rs.push(slope);
      source.rc.push(ax - slope * ay);
    }
  }
  return source.yhi - source.ylo > 1e-9 && source.fc.length > 0 && source.rc.length > 0 ? source : undefined;
}

const CANDIDATES = new Float64Array(MAX_OFFSETS);

function frontAt(source: PartSource, y: number) {
  let value = Number.POSITIVE_INFINITY;
  for (let index = 0; index < source.fc.length; index += 1) value = Math.min(value, source.fc[index] + source.fs[index] * y);
  return value;
}

function rearAt(source: PartSource, y: number, clip: number) {
  let value = clip;
  for (let index = 0; index < source.rc.length; index += 1) value = Math.max(value, source.rc[index] + source.rs[index] * y);
  return value;
}

/** Kesimden sonra da dolu olan yanali aday listesine ekler (`CANDIDATES`); yeni sayi. */
function addCandidate(source: PartSource, clip: number, y: number, count: number) {
  if (!(y >= source.ylo - 1e-12 && y <= source.yhi + 1e-12) || count >= MAX_OFFSETS) return count;
  const bounded = Math.max(source.ylo, Math.min(source.yhi, y));
  if (frontAt(source, bounded) < rearAt(source, bounded, clip) - 1e-9) return count;
  CANDIDATES[count] = bounded;
  return count + 1;
}

/** Kesilmemis tablonun `part` parcasini `out`un sonuna kopyalar (kesimin dokunmadigi parca: hesap yok). */
function copyPart(full: ProjectilePartTable, part: number, out: ProjectilePartTable, lines: number, rears: number) {
  const target = out.count;
  const frontBegin = part > 0 ? full.frontEnd[part - 1] : 0;
  const rearBegin = part > 0 ? full.rearEnd[part - 1] : 0;
  const offsetBegin = part > 0 ? full.offsetEnd[part - 1] : 0;
  for (let index = frontBegin; index < full.frontEnd[part]; index += 1) {
    out.fc[lines] = full.fc[index];
    out.fs[lines] = full.fs[index];
    lines += 1;
  }
  out.frontEnd[target] = lines;
  for (let index = rearBegin; index < full.rearEnd[part]; index += 1) {
    out.rc[rears] = full.rc[index];
    out.rs[rears] = full.rs[index];
    rears += 1;
  }
  out.rearEnd[target] = rears;
  for (let index = offsetBegin; index < full.offsetEnd[part]; index += 1) {
    out.oy[out.offsetCount] = full.oy[index];
    out.of[out.offsetCount] = full.of[index];
    out.or[out.offsetCount] = full.or[index];
    out.offsetCount += 1;
    out.px[out.pointCount] = full.px[2 * index];
    out.py[out.pointCount] = full.py[2 * index];
    out.px[out.pointCount + 1] = full.px[2 * index + 1];
    out.py[out.pointCount + 1] = full.py[2 * index + 1];
    out.pointCount += 2;
  }
  out.offsetEnd[target] = out.offsetCount;
  out.ylo[target] = full.ylo[part];
  out.yhi[target] = full.yhi[part];
  out.fmax[target] = full.fmax[part];
  out.rmin[target] = full.rmin[part];
  out.minX = Math.min(out.minX, full.rmin[part]);
  out.maxX = Math.max(out.maxX, full.fmax[part]);
  out.minY = Math.min(out.minY, full.ylo[part]);
  out.maxY = Math.max(out.maxY, full.yhi[part]);
  out.count = target + 1;
}

/**
 * Kaynaklari tabloya derler; `clip` (dunya birimi) merkezin gerisindeki
 * kesim (`x >= clip`; kesim yoksa -Infinity). Kesim parcanin arka zarfina
 * yatay bir dogru ekliyor; on zarfin kesimin gerisine dustugu yanallar
 * parcadan cikiyor; kesimin zarflarla kesistigi yanallar yeni koseler.
 * Kesimin dokunmadigi parca kesilmemis tablodan (`full`) kopyalaniyor,
 * tumuyle gerisinde kalan atliyor: dogan merminin her tikteki derlemesi
 * yalnizca kesilen parcayi hesapliyor. Tahsis yok (kaynak dizileri
 * okunuyor, tabloya yaziliyor).
 */
function compileParts(sources: readonly PartSource[], clip: number, out: ProjectilePartTable, full?: ProjectilePartTable) {
  out.count = 0;
  out.offsetCount = 0;
  out.pointCount = 0;
  out.minX = Number.POSITIVE_INFINITY;
  out.maxX = Number.NEGATIVE_INFINITY;
  out.minY = Number.POSITIVE_INFINITY;
  out.maxY = Number.NEGATIVE_INFINITY;
  let lines = 0;
  let rears = 0;
  const clipped = clip > Number.NEGATIVE_INFINITY;
  for (const source of sources) {
    if (clipped && full !== undefined && source.full >= 0) {
      if (clip > source.frontMax) continue;
      if (clip <= source.rearMin) {
        if (out.count >= MAX_PARTS) throw new Error("mermi sekli tabloya sigmiyor");
        copyPart(full, source.full, out, lines, rears);
        lines = out.frontEnd[out.count - 1];
        rears = out.rearEnd[out.count - 1];
        continue;
      }
    }
    let count = 0;
    for (let index = 0; index < source.breaks.length; index += 1) count = addCandidate(source, clip, source.breaks[index], count);
    if (clipped) {
      for (let index = 0; index < source.fc.length; index += 1) if (source.fs[index] !== 0) count = addCandidate(source, clip, (clip - source.fc[index]) / source.fs[index], count);
      for (let index = 0; index < source.rc.length; index += 1) if (source.rs[index] !== 0) count = addCandidate(source, clip, (clip - source.rc[index]) / source.rs[index], count);
    }
    // Siralama ve tekillestirme (birkac sayi: ekleme siralamasi).
    for (let i = 1; i < count; i += 1) {
      const value = CANDIDATES[i];
      let j = i - 1;
      while (j >= 0 && CANDIDATES[j] > value) {
        CANDIDATES[j + 1] = CANDIDATES[j];
        j -= 1;
      }
      CANDIDATES[j + 1] = value;
    }
    let unique = 0;
    for (let i = 0; i < count; i += 1) if (unique === 0 || CANDIDATES[i] - CANDIDATES[unique - 1] > 1e-9) CANDIDATES[unique++] = CANDIDATES[i];
    if (unique < 2 || CANDIDATES[unique - 1] - CANDIDATES[0] <= 1e-9) continue;
    const part = out.count;
    // Tablonun boyu sabit (tahsis yok): sigmayan sekil derlemede yakalaniyor.
    if (part >= MAX_PARTS || lines + source.fc.length > MAX_LINES || rears + source.rc.length + 1 > MAX_LINES
      || out.offsetCount + unique > MAX_OFFSETS || out.pointCount + 2 * unique > MAX_POINTS) {
      throw new Error("mermi sekli tabloya sigmiyor");
    }
    for (let index = 0; index < source.fc.length; index += 1) {
      out.fc[lines] = source.fc[index];
      out.fs[lines] = source.fs[index];
      lines += 1;
    }
    out.frontEnd[part] = lines;
    for (let index = 0; index < source.rc.length; index += 1) {
      out.rc[rears] = source.rc[index];
      out.rs[rears] = source.rs[index];
      rears += 1;
    }
    if (clipped) {
      out.rc[rears] = clip;
      out.rs[rears] = 0;
      rears += 1;
    }
    out.rearEnd[part] = rears;
    let fmax = Number.NEGATIVE_INFINITY;
    let rmin = Number.POSITIVE_INFINITY;
    for (let i = 0; i < unique; i += 1) {
      const y = CANDIDATES[i];
      const f = frontAt(source, y);
      const r = Math.min(f, rearAt(source, y, clip));
      out.oy[out.offsetCount] = y;
      out.of[out.offsetCount] = f;
      out.or[out.offsetCount] = r;
      out.offsetCount += 1;
      out.px[out.pointCount] = f;
      out.py[out.pointCount] = y;
      out.px[out.pointCount + 1] = r;
      out.py[out.pointCount + 1] = y;
      out.pointCount += 2;
      if (f > fmax) fmax = f;
      if (r < rmin) rmin = r;
    }
    out.offsetEnd[part] = out.offsetCount;
    out.ylo[part] = CANDIDATES[0];
    out.yhi[part] = CANDIDATES[unique - 1];
    out.fmax[part] = fmax;
    out.rmin[part] = rmin;
    out.minX = Math.min(out.minX, rmin);
    out.maxX = Math.max(out.maxX, fmax);
    out.minY = Math.min(out.minY, CANDIDATES[0]);
    out.maxY = Math.max(out.maxY, CANDIDATES[unique - 1]);
    out.count = part + 1;
    if (!clipped) {
      source.full = part;
      source.rearMin = rmin;
      source.frontMax = fmax;
    }
  }
  if (out.count === 0) {
    out.minX = 0;
    out.maxX = 0;
    out.minY = 0;
    out.maxY = 0;
  }
  return out;
}

/** Kimlik -> sahne olcegi -> kademe: anahtar dizgisi kurulmuyor (sunucu her atista okuyor). */
const SHAPE_CACHE = new Map<string, Map<number, ProjectileShape[]>>();

/**
 * Govdenin isabet sekli (donmus, onbellekte; sunucu dogumda bir kez aliyor ve
 * merminin kaydinda tutuyor).
 */
export function getProjectileShape(definitionId: string | undefined, tier: number | undefined = 1, sceneScale = 1): ProjectileShape {
  const id = definitionId ?? "";
  const index = toTierIndex(tier);
  let byScale = SHAPE_CACHE.get(id);
  if (!byScale) {
    byScale = new Map();
    SHAPE_CACHE.set(id, byScale);
  }
  let byTier = byScale.get(sceneScale);
  if (!byTier) {
    byTier = [];
    byScale.set(sceneScale, byTier);
  }
  const cached = byTier[index];
  if (cached) return cached;
  const body = getProjectileBody(definitionId, index + 1, sceneScale);
  const sources: PartSource[] = [];
  for (const hull of buildHitHulls(body.parts)) {
    const source = toPartSource(hull);
    if (source) sources.push(source);
  }
  const table = compileParts(sources, Number.NEGATIVE_INFINITY, new ProjectilePartTable());
  // Melis'in dokulari (parcasiz, diskli olmayan govde): eski kapsul ve igne.
  const capsule = sources.length === 0 && body.disc === 0 && body.halfWidth > 0;
  // Govdesi cizilmeyen kimlik (isin kuleleri; mermi atmiyorlar): merkezin
  // kendisi (yaricapi sifir disk), eskisi gibi; hic degmeyen mermi olmasin.
  const point = sources.length === 0 && body.disc === 0 && !capsule;
  const shape: ProjectileShape = Object.freeze({
    front: Math.max(body.tip, 0),
    nose: capsule ? Math.max(body.nose, body.wide) : body.nose,
    tail: Math.max(0, body.tail),
    halfWidth: body.halfWidth,
    disc: body.disc > 0 || point ? 1 : capsule ? 2 : 0,
    wide: capsule ? body.wide : 0,
    radius: body.disc > 0 ? body.disc : capsule ? body.halfWidth : 0,
    table,
    sources: Object.freeze(sources)
  });
  byTier[index] = shape;
  return shape;
}

/** Kesilmis tablonun tek kopyasi: dogan mermi birkac tik boyunca, sekil ve kesim degisince yeniden. */
const CLIPPED_TABLE = new ProjectilePartTable();
let clippedShape: ProjectileShape | undefined;
let clippedReach = Number.NaN;

/**
 * Seklin `reach` gerisinden kesilmis parcalari (`getProjectileReach`). Ucmus
 * mermide (kuyrugu kadar ucmus) seklin kendi tablosu; dogarken kesilmis
 * kopya, ayni sekil ve kesimle art arda cagrida yeniden derlenmiyor (bir
 * merminin adaylari arka arkaya sorgulaniyor). Donen tablo bir sonraki
 * farkli cagriya kadar gecerli.
 */
export function prepareProjectileParts(shape: ProjectileShape, reach: number) {
  if (shape.table.count === 0 || -reach <= shape.table.minX) return shape.table;
  if (clippedShape !== shape || clippedReach !== reach) {
    compileParts(shape.sources, -reach, CLIPPED_TABLE, shape.table);
    clippedShape = shape;
    clippedReach = reach;
  }
  return CLIPPED_TABLE;
}

/**
 * Govdenin `m` (birim, dunya) yonundeki en ileri noktasinin merkezden farki
 * (`out`a, dunya birimi): ucus yonu `u`, govde merkezin `reach` gerisinde
 * kesik (`getProjectileReach`), parcalar da yuvarlak govde de. Siper ve meka
 * kalkani bunu kapi olarak kullaniyor: bu nokta engelin cizilen yuzune
 * varamiyorsa govdenin hicbir yeri varamiyor (kesin temas ondan sonra).
 *
 * Parcalarin koseleri (kesilmis tablo); disk ve Melis kapsulu: kesilmemis
 * destek noktasi (`wide` ya da kapsulun arka ucu arti `radius m`) kesimin
 * onundeyse o, gerisindeyse kesim kirisinin `m`ye bakan ucu (dogan
 * merminin diski namlunun gerisine tasmiyor; eskiden tasiyordu ve
 * namlunun ardindaki kalkan dogan mermiyi durduruyordu); Melis dokularinda
 * igne ucu (`nose`).
 */
export function writeProjectileSupport<T extends { x: number; y: number }>(shape: ProjectileShape, reach: number, ux: number, uy: number, mx: number, my: number, out: T) {
  const c = ux * mx + uy * my;
  const d = -uy * mx + ux * my;
  let best = Number.NEGATIVE_INFINITY;
  let bestAlong = 0;
  let bestSide = 0;
  const table = prepareProjectileParts(shape, reach);
  for (let index = 0; index < table.pointCount; index += 1) {
    const value = table.px[index] * c + table.py[index] * d;
    if (value > best) {
      best = value;
      bestAlong = table.px[index];
      bestSide = table.py[index];
    }
  }
  if (shape.disc !== 0) {
    const r = shape.radius;
    const w = shape.wide;
    const back = -Math.max(0, reach);
    // Yuvarlak govdenin ekseni: disk `wide`da; kapsul (`disc` 2) arkada kuyruga
    // kadar uzaniyor, arka ucu kesimde (`getCapsuleContact` ile ayni).
    const rear = shape.disc === 2 ? Math.min(w, r - Math.max(0, reach)) : w;
    const axis = c >= 0 ? w : rear;
    const along = axis + r * c;
    if (along >= back - 1e-12) {
      const value = axis * c + r;
      if (value > best) {
        best = value;
        bestAlong = along;
        bestSide = r * d;
      }
    } else {
      // Destek noktasi kesimin gerisinde: kesik govdenin en ilerisi kirisin ucu.
      const nearest = back < rear ? rear : back > w ? w : back;
      const halfSq = r * r - (back - nearest) * (back - nearest);
      if (halfSq >= 0) {
        const half = Math.sqrt(halfSq);
        const value = back * c + half * (d < 0 ? -d : d);
        if (value > best) {
          best = value;
          bestAlong = back;
          bestSide = d < 0 ? -half : half;
        }
      }
    }
    if (shape.disc === 2 && shape.nose > w + r && shape.nose * c > best) {
      best = shape.nose * c;
      bestAlong = shape.nose;
      bestSide = 0;
    }
  }
  out.x = ux * bestAlong - uy * bestSide;
  out.y = uy * bestAlong + ux * bestSide;
  return out;
}

/** Saldiri dronunun govde yaricapi (dunya birimi): ortalama nabizda. */
export function getAttackDroneBodyRadius(cellSize = TOWER_GRID_SIZE) {
  return ATAKAN_ATTACK_DRONE_BODY.radius * ATAKAN_ATTACK_DRONE_BODY.spriteScale * ATAKAN_ULTIMATE_DRONE_VISUAL_SCALE * (cellSize / TOWER_GRID_SIZE);
}
