/**
 * Saldiri efektlerinin profil kaydi: her saldiran kule icin bir profil.
 *
 * Kademe dili uc perde: **duz -> acilmis -> canli** (Debug Lazer'den).
 *
 * - Kademe 1 (sv 1-4): kulenin kendi tonunda temiz bir siluet, kisa sivri
 *   iz, tek parlak namlu cakmasi, tek carpma darbesi.
 * - Kademe 2 (sv 5-9): turu degisiyor. Rampanin ikinci duragi, omuzlu kesit
 *   (omuzlar ADD katmaninda), beyaza cekilmis cekirdek ve file; sicak
 *   cekirdekli uzun serit; namluda 80-120 ms'lik hazirlik vurusu; carpmada
 *   ikinci vurus (yanki).
 * - Kademe 3 (sv 10): rampanin ucuncu duragi -- cekirdek beyaza yakin ama
 *   ton omuzlarda kaliyor, hicbir zaman tumuyle beyaz degil; nefes alan hale,
 *   dokulen zerreler; imza carpma ve tek karelik ADD igne ucu. Yalnizca agir
 *   tek vuruslar (Sunucu, Jackpot) yerel oyuncuda yonetilen mikro sarsinti.
 *
 * Siluet kademeyle buyumuyor (12-16 birim, carpisma boyu 8 degil); buyuyen
 * sey varlik: hale, iz uzunlugu, ikinci vurus. Renk ve siluet LOD'da hic
 * kesilmiyor, kademeyi onlar tasiyor.
 *
 * Renk kulenin kendi renginden. Varsayilan yesil (0x86efac) ya da eski
 * genel celik/altin/beyaz (getTierColor) saldirida hic kullanilmiyor.
 */
import type { TowerDefinition } from "@karayel/shared";
import { liftToWhite, mixColor, type VfxTier } from "./kit";

/** Merminin govdesi nasil ciziliyor. */
export type VfxSilhouette =
  /** Sivri ok ucu; tek hedefe mermi. */
  | "dart"
  /** Ic halkali kure; alan hasari. */
  | "orb"
  /** Agir, koyu kenarli top. */
  | "ball"
  /** Bos halka; yavaslatan destek atisi. */
  | "ring"
  /** Kulenin kendi cizilmis dokusu (Melis). */
  | "sprite"
  /** combat-vfx'in hareketli govdesi (Takipci, Obsesyon, Hiza, Taht). */
  | "combat"
  /** Veri paketi: koseli bir elmas govde (Sunucu'nun agir atisi). */
  | "packet"
  /** Altigen hucre: kapatma alaninin kucuk hali (Izolasyon). */
  | "cell"
  /** Kirikli kivilcim oku: kendi kendini yeniden cizen simsek (Ucube). */
  | "arc"
  /**
   * Zeynep'in fermani: ince uzun mizrak ve sivri uc; Taht'ta kuyrugunda
   * dizilimin muhru (uc nokta, uyelerin renginde).
   */
  | "lance"
  /** Mermi yok; isin, dalga ya da yorunge. */
  | "none";

/** Carpmanin dili; combat-vfx'in iyi kelimeleri buyutulerek. */
export type VfxImpactStyle =
  /** Ucus yonunde firlayan kiymiklar. */
  | "fragments"
  /** Kilitlenen dort kose ayraci. */
  | "brackets"
  /** Ice kapanan catlaklar, sonra kopma. */
  | "collapse"
  /** Kirikli simsek kollari. */
  | "bolt"
  /** Gercek yaricapta alan halkasi. */
  | "splash"
  /** Gelis yonune acilan cam kirigi yelpazesi. */
  | "shatter"
  /** Koyu cekirdekli lanet muhru. */
  | "curse"
  /** Yayilan dalga. */
  | "ripple"
  /** Bicak kesigi. */
  | "slash"
  /** Yukari baglanti: gercek yaricapta halka ve gokten inen sutun (Sunucu). */
  | "uplink"
  /** Hedefin cevresinde kapanan altigen kafes (Izolasyon). */
  | "contain"
  /**
   * Ferman kertigi (Zeynep'in delen mermileri): govdeyi ucus yonune dik
   * kesen bir cizgi; her delinen dusmanda bir tane, yani kertik sayisi
   * delinen dusman sayisi.
   */
  | "decree";

/** Sunucunun saldiriyi nasil teslim ettigi; galeri ve olcum bunu taklit ediyor. */
export type VfxDelivery =
  | "ballistic"
  | "homing"
  | "laser"
  | "showcase"
  | "synthesis"
  | "kin"
  | "curse"
  | "whisper"
  | "underworld"
  | "orbit"
  /** Ates etmeyen ray: atis yolunu degistiriyor (Abarti). */
  | "rail";

export type VfxTierRecipe = {
  tier: VfxTier;
  /** Rampanin bu kademedeki duragi: govdenin, izin ve carpmanin rengi. */
  color: number;
  /** Ayni tonun beyaza cekilmis cekirdegi. */
  core: number;
  /** Govdenin capi (dunya birimi, olcekten once). */
  silhouette: number;
  /** Kesitin omuz sayisi: 0 duz, 3 acilmis, 4 genis. */
  shoulders: 0 | 3 | 4;
  trail: {
    /** Seritin nokta sayisi (TrailBuffer'dan). */
    points: number;
    width: number;
    /** Sicak cekirdek: beyaza cekilmis ince ikinci serit. */
    hotCore: boolean;
    /** Seritten dokulen zerreler. */
    motes: boolean;
  };
  muzzle: {
    flash: boolean;
    /** Namludaki hazirlik vurusu; 0 yok. */
    anticipationMs: number;
    /** Donen diken patlamasi (lazerin namlusu). */
    burst: boolean;
  };
  impact: {
    impulse: boolean;
    /** Ikinci vurus: yanki halkasi ya da ikincil patlama. */
    secondBeat: boolean;
    /** Imza carpma: mekanigi gosteren buyuk hali. */
    signature: boolean;
    /** Tek karelik ADD igne ucu. */
    pinpoint: boolean;
    /** Durumsuz kor sayisi (LOD ilk bunu kesiyor). */
    sparks: number;
    /** combat-vfx kelimelerinin olcegi (1.5-2 kat). */
    scale: number;
    durationMs: number;
  };
  alive: {
    /** Nefes alan hale. */
    corona: boolean;
    /** Isin boyunca kosan parlamalar. */
    glints: boolean;
    /** Govdeden dokulen zerreler. */
    motes: boolean;
  };
  /** Yonetilen mikro sarsinti (yalnizca agir tek vurus, yerel oyuncu). */
  shake: boolean;
};

/**
 * Atakan'in uc perdesi: ham sinyal -> derlenmis -> asiri yukleme / uretim.
 *
 * Genel uc perde (duz -> acilmis -> canli) her kulede; bu, ustune binen
 * karakter dili. Debug Lazer'in kirmizi -> mavi -> beyaz rampasi sablon.
 */
export type VfxAct = "raw" | "compiled" | "overdrive";

export type VfxSignatureTier = {
  act: VfxAct;
  /** Izin motifi: ham kademede duz serit; derlenmiste tarama cizgisi ya da veri paketi. */
  trailMotif: "plain" | "scan" | "packets";
  /** Terminal yesili aksan: nisangah ayraci, izgara kertigi. */
  accent: boolean;
  /** Carpmada ve alanda kalan cikartma. */
  decal: "none" | "grid" | "hex";
  /** Beyaz-sicak cekirdek; ton omuzlarda kaliyor. */
  whiteCore: boolean;
  /** Govde boyunca kosan parlamalar (ip, bag, zincir, gosterge). */
  glints: boolean;
  /** Dokulen kod kivilcimlari. */
  codeSparks: boolean;
};

/** Kulenin mekanigini gosteren dunya ici imza. */
export type VfxMechanic =
  /** Takipci: dusmanin uzerinde yigin basina daralan isaret nisangahi. */
  | "mark-reticle"
  /** Sunucu: gercek yaricapta yukari baglanti sutunu ve gorunen bag. */
  | "uplink-column"
  /** Izolasyon: kapatma alani ve yalnizlik karesi. */
  | "containment"
  /** Obsesyon: yiginla kalinlasan, hedef degisince kopan ip. */
  | "tether"
  /** Ucube: tavanini gosteren yigin gostergesi. */
  | "stack-gauge";

export type VfxSignature = {
  mechanic: VfxMechanic;
  tiers: readonly [VfxSignatureTier, VfxSignatureTier, VfxSignatureTier];
};

/**
 * Zeynep'in saray dili: ferman -> nisan -> regalya.
 *
 * Rampa pembe -> altin -> beyaz altin ve **rutbe trimi** olarak calisiyor:
 * govde kulenin (ya da kombonun: Kin kizili, yanik camgobegi, Abarti'nin
 * koyulastirmasi) renginde kaliyor, kademe kenara rutbe ekliyor.
 *
 * - Ferman (sv 1-4): temiz bir eflatun mizrak ya da cizgi; trim govdenin
 *   beyaza cekilmis hali.
 * - Nisan (sv 5-9): altin seritler (chevron), ikinci perde (encore) ve
 *   paralel raylar yerine "gecit toreni": hayalet kopyalar dizilimde.
 * - Regalya (sv 10): tac ve muhur isaretleri, yaldiz zerreler, mum muhur
 *   damgalari ve kapanan ferman cizgisi. Hicbir zaman tumuyle beyaz degil;
 *   ton omuzlarda.
 */
export type VfxCourtAct = "decree" | "insignia" | "regalia";

export type VfxCourtTier = {
  act: VfxCourtAct;
  /** Rutbe trimi: govdenin beyaza cekilmis hali (1), altin (2), beyaz altin (3). */
  trim: number;
  /** Altin seritler (chevron): nisanin isareti. */
  chevrons: boolean;
  /** Ikinci perde: ayni seyin gecikmeli, soluk bir tekrari. */
  encore: boolean;
  /** Gecit toreni: hayalet kopyalar dizilimde (raylarin yerine). */
  parade: boolean;
  /** Mum muhur damgasi. */
  seal: boolean;
  /** Tac isareti. */
  crown: boolean;
  /** Yaldiz zerreler (LOD ilk bunu kesiyor). */
  giltMotes: boolean;
  /** Ferman cizgisinin kapanmasi: uclarindan muhre cekiliyor. */
  snap: boolean;
};

/** Zeynep kulesinin mekanigini gosteren imza. */
export type VfxCourtMechanic =
  /** Hiza: delinen dusmanlari birlestiren ferman cizgisi ve dusman basina kertik. */
  | "pierce-line"
  /** Gosteri: hattaki her dusmana spot isigi. */
  | "spotlight"
  /** Taht: dizilimin muhru (mizrakta ve atis aninda dizilimin kendisi). */
  | "formation-seal"
  /** Kin: vurulan dusmanda damga; yavaslatmanin gucu kadar serit. */
  | "brand"
  /** Abarti: atis rayi gectiginde nabiz. */
  | "crossing-pulse";

export type VfxCourtSignature = {
  mechanic: VfxCourtMechanic;
  tiers: readonly [VfxCourtTier, VfxCourtTier, VfxCourtTier];
};

export type VfxProfile = {
  id: string;
  character: string;
  delivery: VfxDelivery;
  silhouette: VfxSilhouette;
  impact: VfxImpactStyle;
  /** Kulenin kendi rengi; rampanin ilk duragi. */
  base: number;
  ramp: readonly [number, number, number];
  /** Agir tek vurus: kademe 3'te yonetilen mikro sarsinti. */
  heavy: boolean;
  /** Alan hasari: carpma gercek yaricapta halka. */
  aoe: boolean;
  tiers: readonly [VfxTierRecipe, VfxTierRecipe, VfxTierRecipe];
  /** Karakter imzasi (Atakan); yoksa yalnizca genel uc perde. */
  signature?: VfxSignature;
  /** Zeynep'in saray imzasi; Atakan'in `signature`indan ayri (yesil aksan yok). */
  court?: VfxCourtSignature;
};

/* ------------------------------------------------------------------ */
/* Renk rampasi                                                         */
/* ------------------------------------------------------------------ */

type Hsl = { h: number; s: number; l: number };

function toHsl(color: number): Hsl {
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

function fromHsl({ h, s, l }: Hsl) {
  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/**
 * Kulenin renginden uc duraklik rampa.
 *
 * Ikinci durak tonu belirgin kaydiriyor (sicaklik degisimi, haritanin obur
 * ucundan okunur), ucuncusu daha da kaydirip beyaza yaklasiyor ama tonu
 * birakmiyor. `shift` ton kaydirmasinin yonu ve boyu (derece).
 */
export function deriveRamp(base: number, shift = 32): readonly [number, number, number] {
  const hsl = toHsl(base);
  // Ton kaymasi yetmezse (soluk pastel tabanlar: Ulku'nun pembesi) buyutuluyor:
  // uc durak haritanin obur ucundan da ayirt edilmeli.
  for (const grow of [1, 1.5, 2.2, 3]) {
    const step = shift * grow;
    const stop2 = fromHsl({
      h: (hsl.h + step / 360 + 1) % 1,
      s: Math.min(1, Math.max(0.6, hsl.s * 1.1)),
      l: Math.min(0.62, Math.max(0.5, hsl.l + 0.04))
    });
    const stop3Hue = fromHsl({
      h: (hsl.h + (step * 1.8) / 360 + 1) % 1,
      s: Math.min(1, Math.max(0.75, hsl.s)),
      l: 0.58
    });
    const stop3 = liftToWhite(stop3Hue, 0.5);
    if (colorDistance(base, stop2) > 60 && colorDistance(stop2, stop3) > 60 && colorDistance(base, stop3) > 60) {
      return [base, stop2, stop3];
    }
  }
  return [base, fromHsl({ h: (hsl.h + 0.33) % 1, s: 0.8, l: 0.55 }), liftToWhite(fromHsl({ h: (hsl.h + 0.6) % 1, s: 0.8, l: 0.58 }), 0.5)];
}

function colorDistance(a: number, b: number) {
  return Math.hypot(((a >> 16) & 0xff) - ((b >> 16) & 0xff), ((a >> 8) & 0xff) - ((b >> 8) & 0xff), (a & 0xff) - (b & 0xff));
}

/* ------------------------------------------------------------------ */
/* Kademe tarifleri                                                     */
/* ------------------------------------------------------------------ */

const SILHOUETTE_SIZE: Record<VfxSilhouette, number> = {
  dart: 14,
  orb: 13,
  ball: 15,
  ring: 13,
  sprite: 16,
  combat: 14,
  packet: 14,
  cell: 13,
  arc: 14,
  lance: 15,
  none: 12
};

function makeTiers(
  ramp: readonly [number, number, number],
  silhouette: VfxSilhouette,
  heavy: boolean
): readonly [VfxTierRecipe, VfxTierRecipe, VfxTierRecipe] {
  const size = SILHOUETTE_SIZE[silhouette];
  const tier1: VfxTierRecipe = {
    tier: 1,
    color: ramp[0],
    core: liftToWhite(ramp[0], 0.45),
    silhouette: size,
    shoulders: 0,
    trail: { points: 3, width: size * 0.36, hotCore: false, motes: false },
    muzzle: { flash: true, anticipationMs: 0, burst: false },
    impact: { impulse: true, secondBeat: false, signature: false, pinpoint: false, sparks: 0, scale: 1.5, durationMs: 300 },
    alive: { corona: false, glints: false, motes: false },
    shake: false
  };
  const tier2: VfxTierRecipe = {
    tier: 2,
    color: ramp[1],
    core: liftToWhite(ramp[1], 0.45),
    silhouette: size,
    shoulders: 3,
    trail: { points: 6, width: size * 0.42, hotCore: true, motes: false },
    muzzle: { flash: true, anticipationMs: 100, burst: true },
    impact: { impulse: true, secondBeat: true, signature: false, pinpoint: false, sparks: 4, scale: 1.7, durationMs: 380 },
    alive: { corona: false, glints: false, motes: false },
    shake: false
  };
  const tier3: VfxTierRecipe = {
    tier: 3,
    color: ramp[2],
    // Cekirdek beyaza yakin, ama ramp[2] zaten aciik: omuzlar ve hale tonu tasiyor.
    core: liftToWhite(ramp[2], 0.6),
    silhouette: size,
    shoulders: 4,
    trail: { points: 8, width: size * 0.46, hotCore: true, motes: true },
    muzzle: { flash: true, anticipationMs: 110, burst: true },
    impact: { impulse: true, secondBeat: true, signature: true, pinpoint: true, sparks: 7, scale: 2, durationMs: 460 },
    alive: { corona: true, glints: true, motes: true },
    shake: heavy
  };
  return [tier1, tier2, tier3];
}

type ProfileSeed = {
  character: string;
  delivery: VfxDelivery;
  silhouette: VfxSilhouette;
  impact: VfxImpactStyle;
  base: number;
  ramp?: readonly [number, number, number];
  shift?: number;
  heavy?: boolean;
  aoe?: boolean;
  signature?: { mechanic: VfxMechanic; trail: "scan" | "packets"; decal: "grid" | "hex" };
  court?: VfxCourtMechanic;
};

/**
 * Atakan imzasinin uc perdesi.
 *
 * - Ham sinyal (sv 1-4): duz serit, ciplak paket, duz ok; aksan yok.
 * - Derlenmis (sv 5-9): tarama cizgisi ya da veri paketi izi, terminal
 *   yesili ayraclar, izgara/altigen cikartma.
 * - Asiri yukleme (sv 10): beyaz-sicak cekirdek (ton omuzlarda), kosan
 *   parlamalar, dokulen kod kivilcimlari.
 */
function atakanSignature(seed: NonNullable<ProfileSeed["signature"]>): VfxSignature {
  return {
    mechanic: seed.mechanic,
    tiers: [
      { act: "raw", trailMotif: "plain", accent: false, decal: "none", whiteCore: false, glints: false, codeSparks: false },
      { act: "compiled", trailMotif: seed.trail, accent: true, decal: seed.decal, whiteCore: false, glints: false, codeSparks: false },
      { act: "overdrive", trailMotif: seed.trail, accent: true, decal: seed.decal, whiteCore: true, glints: true, codeSparks: true }
    ]
  };
}

/**
 * Ucube'nin tek ton ailesi: limon -> elektrik yesili -> beyaza yakin limon.
 *
 * Eskiden mermisi limon, zinciri gok mavisi, kulesi mavi-siyahti; turetilmis
 * rampa da limondan kehribara ve kirmiziya kayiyordu. Artik ucu de ayni
 * aileden: sicaklik degisiyor (sari-yesil -> yesil -> beyaz), aile degil.
 */
const UCUBE_RAMP = [0xadf765, 0x5eea8a, liftToWhite(0xbef264, 0.55)] as const;

/**
 * Zeynep'in rutbe dili: pembe -> altin -> beyaz altin. Kin'in kizili ve
 * yanigin camgobegi govdede kaliyor (isin rengi sunucudan, hep okunuyor);
 * rampa onlarda trim olarak calisiyor.
 */
export const ZEYNEP_GOLD = 0xf59e0b;
export const ZEYNEP_WHITE_GOLD = 0xfde68a;
const zeynepRamp = (base: number) => [base, ZEYNEP_GOLD, ZEYNEP_WHITE_GOLD] as const;

/**
 * Zeynep imzasinin uc perdesi: ferman, nisan, regalya. Trim kademe 1'de
 * govdenin beyaza cekilmis hali (combat-vfx `getZeynepTrim` ile ayni kural).
 */
function courtSignature(mechanic: VfxCourtMechanic, base: number): VfxCourtSignature {
  return {
    mechanic,
    tiers: [
      { act: "decree", trim: liftToWhite(base, 0.72), chevrons: false, encore: false, parade: false, seal: false, crown: false, giltMotes: false, snap: false },
      { act: "insignia", trim: ZEYNEP_GOLD, chevrons: true, encore: true, parade: true, seal: false, crown: false, giltMotes: false, snap: false },
      { act: "regalia", trim: ZEYNEP_WHITE_GOLD, chevrons: true, encore: true, parade: true, seal: true, crown: true, giltMotes: true, snap: true }
    ]
  };
}

/** Melis: menekse -> orkide/kizil -> menekse-beyaz kenar; olum ve alt dunya camgobegi. */
const melisRamp = (base: number, second: number) => [base, second, liftToWhite(mixColor(base, 0xc4b5fd, 0.5), 0.62)] as const;

/** Onur: camgobegi -> camgobegi-altin -> altin-beyaz. Sans parlakligi kademenin ustune biniyor. */
const onurRamp = (base: number) => [base, mixColor(base, 0xfacc15, 0.55), liftToWhite(0xfacc15, 0.62)] as const;

/**
 * Atakan'in kuleleri katalogda ayni yesili tasiyor (0x22c55e); her birinin
 * gercek kimligi saldirisinin renginde. Taban bu renkler, rampa onlardan.
 */
const PROFILE_SEEDS: Record<string, ProfileSeed> = {
  "warrior-1": {
    character: "warrior", delivery: "ballistic", silhouette: "combat", impact: "brackets", base: 0x4dffbd, shift: 40,
    signature: { mechanic: "mark-reticle", trail: "scan", decal: "grid" }
  },
  "warrior-2": {
    character: "warrior", delivery: "ballistic", silhouette: "packet", impact: "uplink", base: 0x58d9ff, shift: 36, heavy: true, aoe: true,
    signature: { mechanic: "uplink-column", trail: "packets", decal: "hex" }
  },
  "warrior-3": {
    character: "warrior", delivery: "homing", silhouette: "cell", impact: "contain", base: 0x7fe5e8, shift: 30,
    signature: { mechanic: "containment", trail: "scan", decal: "hex" }
  },
  "warrior-4": {
    character: "warrior", delivery: "ballistic", silhouette: "combat", impact: "collapse", base: 0xcb79ff, shift: -34,
    signature: { mechanic: "tether", trail: "packets", decal: "grid" }
  },
  // Lazerin rampasi sunucudaki DEBUG_LASER_TIER_COLORS: kirmizi, mavi, beyaz.
  // Isin kendi cizimini koruyor; rampa yalnizca kule halkasi ve galeri icin.
  "warrior-5": { character: "warrior", delivery: "laser", silhouette: "none", impact: "fragments", base: 0xef4444, ramp: [0xef4444, 0x60a5fa, 0xe0f2fe] },
  "warrior-6": {
    character: "warrior", delivery: "ballistic", silhouette: "arc", impact: "bolt", base: UCUBE_RAMP[0], ramp: UCUBE_RAMP,
    signature: { mechanic: "stack-gauge", trail: "scan", decal: "grid" }
  },

  // Zeynep: ferman mizragi ve kertik (Hiza, Taht), spot isigi (Gosteri), damga
  // (Kin), gecis nabzi (Abarti). Govde kulenin renginde, rampa rutbe trimi.
  "zeynep-1": { character: "zeynep", delivery: "ballistic", silhouette: "lance", impact: "decree", base: 0xec4899, ramp: zeynepRamp(0xec4899), court: "pierce-line" },
  "zeynep-2": { character: "zeynep", delivery: "showcase", silhouette: "none", impact: "fragments", base: 0xf9a8d4, ramp: zeynepRamp(0xf9a8d4), court: "spotlight" },
  "zeynep-3": { character: "zeynep", delivery: "synthesis", silhouette: "lance", impact: "decree", base: 0xf0abfc, ramp: zeynepRamp(0xf0abfc), court: "formation-seal" },
  "zeynep-6": { character: "zeynep", delivery: "kin", silhouette: "none", impact: "ripple", base: 0xdc466d, ramp: [0xdc466d, ZEYNEP_GOLD, ZEYNEP_WHITE_GOLD], court: "brand" },
  // Abarti ates etmiyor (saldiri sayilmiyor); profili gecis nabzinin rampasi icin.
  "zeynep-8": { character: "zeynep", delivery: "rail", silhouette: "none", impact: "ripple", base: 0x7c3aed, ramp: zeynepRamp(0x7c3aed), court: "crossing-pulse" },

  "archer-1": { character: "archer", delivery: "ballistic", silhouette: "sprite", impact: "brackets", base: 0x8b5cf6, ramp: melisRamp(0x8b5cf6, 0xd946ef) },
  "archer-2": { character: "archer", delivery: "ballistic", silhouette: "sprite", impact: "shatter", base: 0xdb2777, ramp: melisRamp(0xdb2777, 0xe11d48) },
  "archer-3": { character: "archer", delivery: "curse", silhouette: "none", impact: "curse", base: 0x7f1dff, ramp: melisRamp(0x7f1dff, 0xc026d3), aoe: true },
  "archer-4": { character: "archer", delivery: "underworld", silhouette: "none", impact: "curse", base: 0x14b8a6, ramp: [0x14b8a6, 0x22d3ee, liftToWhite(0x2dd4bf, 0.62)] },
  "archer-5": { character: "archer", delivery: "ballistic", silhouette: "sprite", impact: "shatter", base: 0xe879f9, ramp: melisRamp(0xe879f9, 0xc026d3) },
  "archer-6": { character: "archer", delivery: "whisper", silhouette: "sprite", impact: "ripple", base: 0x14b8a6, ramp: [0x14b8a6, 0xa855f7, liftToWhite(0x99f6e4, 0.5)], aoe: true },

  "onur-1": { character: "onur", delivery: "orbit", silhouette: "none", impact: "slash", base: 0x14b8a6, ramp: onurRamp(0x14b8a6) },
  "onur-2": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "fragments", base: 0x14b8a6, ramp: onurRamp(0x14b8a6), heavy: true },
  "onur-3": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "fragments", base: 0x2dd4bf, ramp: onurRamp(0x2dd4bf) },
  "onur-4": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "brackets", base: 0x14b8a6, ramp: onurRamp(0x14b8a6) },
  "onur-5": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "fragments", base: 0x0d9488, ramp: onurRamp(0x0d9488) },
  "onur-6": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "slash", base: 0x5eead4, ramp: onurRamp(0x5eead4) }
};

/** Taslak karakterlerin sinif silueti: kulenin kendi rengi, kendi sekli. */
const STUB_CLASS: Record<string, { silhouette: VfxSilhouette; impact: VfxImpactStyle; shift: number }> = {
  mage: { silhouette: "orb", impact: "splash", shift: 34 },
  healer: { silhouette: "ring", impact: "ripple", shift: -30 },
  tank: { silhouette: "ball", impact: "fragments", shift: -26 }
};

/** Galeri ve kapsam testi icin: saldiran kule mi. Destek, duvar, depo ve kaynak degil. */
export function isAttackingDefinition(definition: Pick<TowerDefinition, "id" | "classType" | "resourceProvider" | "engine">) {
  if (definition.resourceProvider) return false;
  if (definition.classType === "support") return false;
  if (definition.engine?.placement?.requiresEdge) return false;
  return true;
}

const cache = new Map<string, VfxProfile>();

/**
 * Mermi ya da isin kimliginden kulenin kimligi.
 *
 * Sunucu ozel atislara son ek veriyor: "archer-6-whisper",
 * "zeynep-3-kin-projectile", "archer-3-curse-burst". Profil kulenin.
 */
export function getProfileDefinitionId(definitionId: string | undefined) {
  if (!definitionId) return "";
  const match = /^(warrior|zeynep|archer|mage|healer|tank|onur)-\d+/.exec(definitionId);
  return match ? match[0] : definitionId;
}

function buildProfile(id: string, seed: ProfileSeed): VfxProfile {
  const ramp = seed.ramp ?? deriveRamp(seed.base, seed.shift);
  return {
    id,
    character: seed.character,
    delivery: seed.delivery,
    silhouette: seed.silhouette,
    impact: seed.impact,
    base: seed.base,
    ramp,
    heavy: Boolean(seed.heavy),
    aoe: Boolean(seed.aoe),
    tiers: makeTiers(ramp, seed.silhouette, Boolean(seed.heavy)),
    ...(seed.signature ? { signature: atakanSignature(seed.signature) } : {}),
    ...(seed.court ? { court: courtSignature(seed.court, seed.base) } : {})
  };
}

/** Profilin bu kademedeki saray perdesi (Zeynep); imzasiz profilde `undefined`. */
export function getCourtTier(profile: VfxProfile, tier: number | undefined) {
  if (!profile.court) return undefined;
  const index = tier !== undefined && tier >= 3 ? 2 : tier !== undefined && tier >= 2 ? 1 : 0;
  return profile.court.tiers[index];
}

/** Profilin bu kademedeki imza perdesi; imzasiz profilde `undefined`. */
export function getSignatureTier(profile: VfxProfile, tier: number | undefined) {
  if (!profile.signature) return undefined;
  const index = tier !== undefined && tier >= 3 ? 2 : tier !== undefined && tier >= 2 ? 1 : 0;
  return profile.signature.tiers[index];
}

/**
 * Kimligin profili; kayitta yoksa kulenin renginden turetilmis bir profil.
 *
 * `fallbackColor` bilinmeyen kimlikte kullaniliyor (yeni kule, sunucu yeni
 * bir son ek gonderdi): yine kulenin rengi, hicbir zaman varsayilan yesil.
 */
export function getVfxProfile(definitionId: string | undefined, fallbackColor = 0x94a3b8): VfxProfile {
  const id = getProfileDefinitionId(definitionId);
  const cached = cache.get(id);
  if (cached) return cached;
  let seed = PROFILE_SEEDS[id];
  if (!seed) {
    const stub = /^(mage|healer|tank)-(\d+)$/.exec(id);
    if (stub) {
      const klass = STUB_CLASS[stub[1]];
      const index = Number(stub[2]);
      seed = {
        character: stub[1],
        delivery: "ballistic",
        silhouette: klass.silhouette,
        impact: klass.impact,
        base: STUB_BASE[stub[1]] ?? fallbackColor,
        // Ayni karakterin alti kulesi ayni rengi tasiyor; ton kaydirmasi kuleden
        // kuleye biraz degisiyor ki rampalar ayirt edilsin.
        shift: klass.shift + (index - 1) * 3,
        aoe: stub[1] === "mage"
      };
    } else {
      seed = { character: "unknown", delivery: "ballistic", silhouette: "dart", impact: "fragments", base: fallbackColor };
      const profile = buildProfile(id, seed);
      // Bilinmeyen kimlik onbellege girmiyor: renk cagirandan geliyor.
      return profile;
    }
  }
  const profile = buildProfile(id, seed);
  cache.set(id, profile);
  return profile;
}

/** Katalog renkleri (Baransel, Ulku, Omer); varsayilan yesil yok. */
const STUB_BASE: Record<string, number> = {
  mage: 0xa78bfa,
  healer: 0xf9a8d4,
  tank: 0xfacc15
};

/** Kayitli (turetilmemis) profili olan kimlikler; kapsam testi icin. */
export function hasExplicitVfxProfile(definitionId: string) {
  return Boolean(PROFILE_SEEDS[definitionId]) || /^(mage|healer|tank)-\d+$/.test(definitionId);
}

/** Kademenin tarifi; kademe 1-3 disindaki sayilar sinirlaniyor. */
export function getVfxTier(profile: VfxProfile, tier: number | undefined) {
  const index = tier !== undefined && tier >= 3 ? 2 : tier !== undefined && tier >= 2 ? 1 : 0;
  return profile.tiers[index];
}

/**
 * Ultilerin profili (sutun, Sempati). Ulti kademesi kulenin seviyesinden
 * degil, ulti gucunden geliyor; sunucu onu isina `tier` olarak yaziyor.
 */
export const ULTIMATE_PROFILES: Record<string, VfxProfile> = {
  "zeynep-ultimate-column": buildProfile("zeynep-ultimate-column", {
    character: "zeynep", delivery: "showcase", silhouette: "none", impact: "ripple", base: 0xfde68a,
    ramp: [0xfde68a, ZEYNEP_GOLD, liftToWhite(0xfde68a, 0.5)]
  }),
  "onur-sympathy": buildProfile("onur-sympathy", {
    character: "onur", delivery: "showcase", silhouette: "none", impact: "ripple", base: 0x2dd4bf, ramp: onurRamp(0x2dd4bf)
  })
};

/** Isin kimliginin profili: ulti isinlari kendi profilinde, gerisi kulenin. */
export function getBeamVfxProfile(definitionId: string, color: number) {
  return ULTIMATE_PROFILES[definitionId] ?? getVfxProfile(definitionId, color);
}
