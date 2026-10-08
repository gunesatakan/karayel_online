/**
 * Saldiri efektlerinin profil kaydi: her saldiran kule icin bir profil.
 *
 * Dil: **agir, sert bilim kurgu** (sahibin secimi; olcut Debug Lazer).
 *
 * - Az renk. Her kulenin tek bir kimlik tonu var, yere indirilmis
 *   (doygunlugu sinirli) ve idareli kullaniliyor: kenarda, izde, sogumakta
 *   olan kivilcimda. Enerjinin cogu beyaz-sicak cekirdek -> ton -> koyu
 *   dusum olarak okunuyor.
 * - Kademe sus degil **yogunluk**: cekirdek daha beyaz (`heat`), govde daha
 *   agir (`weight`), vurus daha guclu (daha cok ve daha hizli kivilcim, daha
 *   buyuk sert parlama, agir vurusta tek bir siki sok halkasi). Altina ya da
 *   pembe -> altin -> beyaz altin "rutbe" rampasina gecis yok; tac, muhur,
 *   serit, yaldiz yok.
 * - Mermi: yogun, okunur bir govde (slug, ok, iz mermisi), beyaz-sicak
 *   cekirdek ve kisa sert iz. Hazirlik kisa bir namlu sarji.
 * - Carpma: 1-3 karelik sert parlama, yercekimiyle dusen birkac kivilcim,
 *   kisa bir duman ya da yanik; kinetik vuruslarda metal kirintisi, enerji
 *   vuruslarinda elektrik catirtisi ve kisa bir isi parlamasi.
 *
 * Siluet kademeyle buyumuyor (12-16 birim); kalinlik ve cekirdek buyuyor.
 * Renk ve siluet LOD'da hic kesilmiyor.
 */
import type { TowerDefinition } from "@karayel/shared";
import { fromHsl, groundHue, liftToWhite, toHsl, whiteHot, type VfxTier } from "./kit";

/** Merminin govdesi nasil ciziliyor. Ses (hit-sounds) bunu okuyor: degerler sabit. */
export type VfxSilhouette =
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
  /** Ucan goz: badem mercek ve yarik gozbebegi; kademeyle iris ve odak halkalari (Obsesyon, atakan-shots). */
  | "gaze"
  /** Veri paketi: koseli agir govde (Sunucu). */
  | "packet"
  /** Altigen kabuk: kapatma alaninin kucuk hali (Izolasyon). */
  | "cell"
  /** Plazma yuku: kapsul, kademeyle yildirim topu ve simsek kuyrugu (Ucube, atakan-shots). */
  | "arc"
  /**
   * Zeynep'in mizragi: ince uzun govde ve sivri uc; Taht'ta kuyrugunda
   * dizilimin isareti (uc kertik, uyelerin renginde).
   */
  | "lance"
  /** Mermi yok; isin, dalga ya da yorunge. */
  | "none";

/** Carpmanin dili; mekanigi tasiyan kisim. Ses de okuyor: degerler sabit. */
export type VfxImpactStyle =
  /** Ucus yonunde kirinti ve kivilcim. */
  | "fragments"
  /** Kilit (Takipci): kinetik. */
  | "brackets"
  /** Ice cokus (Obsesyon). */
  | "collapse"
  /** Elektrik kollari (Ucube). */
  | "bolt"
  /** Gercek yaricapta alan vurusu. */
  | "splash"
  /** Gelis yonune acilan kirinti yelpazesi. */
  | "shatter"
  /** Koyu cekirdekli lanet. */
  | "curse"
  /** Enerji dalgasi. */
  | "ripple"
  /** Bicak kesigi. */
  | "slash"
  /** Yukari baglanti: gercek yaricapta alan ve yukaridan inen vurus (Sunucu). */
  | "uplink"
  /** Hedefin cevresinde kapanan altigen kafes (Izolasyon). */
  | "contain"
  /**
   * Delme kertigi (Zeynep'in delen mermileri): govdeyi ucus yonune dik
   * kesen ince bir cizgi; kertik sayisi delinen dusman sayisi.
   */
  | "decree";

/** Vurusun maddesi: kinetik metal ve kivilcim, enerji catirti ve isi. */
export type VfxMatter = "kinetic" | "energy";

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
  /** Kimlik tonu bu kademede: ayni ton, kademe yukseldikce biraz daha sicak. */
  color: number;
  /** Beyaz-sicak cekirdek: tonun `heat` kadar beyaza cekilmis hali. */
  core: number;
  /** Cekirdegin sicakligi (0-1): kademenin yogunlugu; cekirdek `whiteHot(hue, heat)`. */
  heat: number;
  /** Govdenin agirligi: kalinlik ve kuvvet carpani. */
  weight: number;
  /** Kuleye ozgu govde kalinligi (1 varsayilan): govde ve izin genisligi, boyu degil. */
  thickness: number;
  /** Govdenin boyu (dunya birimi, olcekten once); kademeyle buyumuyor. */
  silhouette: number;
  trail: {
    /** Kisa sert izin nokta sayisi (TrailBuffer'dan); LOD en son bunu kisaltiyor. */
    points: number;
    width: number;
  };
  muzzle: {
    /** Namlu sarji; 0 yok. */
    anticipationMs: number;
    /** Namlu alevinin boyu (birim). */
    reach: number;
  };
  impact: {
    /** Sert parlamanin capi (birim); 1-3 kare. */
    flash: number;
    /** Balistik kivilcim sayisi (LOD ilk bunu kesiyor). */
    sparks: number;
    /** Kinetik vurusta metal kirintisi. */
    debris: number;
    /** Enerji vurusunda catirti kolu. */
    crackle: number;
    /** Kivilcimin ilk hizi (birim / sn). */
    force: number;
    /** Kisa duman (LOD ikinci). */
    smoke: boolean;
    /** Yanik izi (LOD ucuncu). */
    scorch: boolean;
    /** Agir vurusta tek siki sok halkasi (yalnizca kademe 3). */
    shockRing: boolean;
    /** Beyaz igne ucu (kademe 3; saniyede en fazla 3). */
    pinpoint: boolean;
    durationMs: number;
  };
  /** Yonetilen mikro sarsinti (yalnizca agir tek vurus, yerel oyuncu). */
  shake: boolean;
  /** Dusmanin kozmetik itilmesi (piksel); 0 yok. */
  knock: number;
};

/** Kulenin mekanigini gosteren dunya ici isaret (Atakan). */
export type VfxMechanic =
  /** Takipci: dusmanin uzerinde yigin basina daralan isaret nisangahi. */
  | "mark-reticle"
  /** Sunucu: gercek yaricapta yukaridan vurus ve gorunen bag. */
  | "uplink-column"
  /** Izolasyon: kapatma alani ve yalnizlik karesi. */
  | "containment"
  /** Obsesyon: yiginla kalinlasan, hedef degisince kopan ip. */
  | "tether"
  /** Ucube: tavanini gosteren yigin gostergesi. */
  | "stack-gauge";

export type VfxSignature = {
  mechanic: VfxMechanic;
};

/** Zeynep kulesinin mekanigini gosteren isaret. */
export type VfxCourtMechanic =
  /** Hiza: delinen dusmanlari birlestiren delme cizgisi ve dusman basina kertik. */
  | "pierce-line"
  /** Gosteri: hattaki her dusmana isaret. */
  | "spotlight"
  /** Taht: dizilimin isareti (mizrakta ve atis aninda dizilimin kendisi). */
  | "formation-seal"
  /** Kin: vurulan dusmanda damga; yavaslatmanin gucu kadar kertik. */
  | "brand"
  /** Abarti: atis rayi gectiginde nabiz. */
  | "crossing-pulse";

export type VfxCourtSignature = {
  mechanic: VfxCourtMechanic;
};

export type VfxProfile = {
  id: string;
  character: string;
  delivery: VfxDelivery;
  silhouette: VfxSilhouette;
  impact: VfxImpactStyle;
  matter: VfxMatter;
  /** Kulenin katalog rengi (kimligin kaynagi). */
  base: number;
  /** Yere indirilmis kimlik tonu. */
  hue: number;
  /** Kademe basina ton: ayni ton, sicaklik artiyor. Altin ya da rutbe rampasi degil. */
  ramp: readonly [number, number, number];
  /** Agir tek vurus: kademe 3'te sok halkasi, yonetilen mikro sarsinti. */
  heavy: boolean;
  /** Alan hasari: carpma gercek yaricapta. */
  aoe: boolean;
  tiers: readonly [VfxTierRecipe, VfxTierRecipe, VfxTierRecipe];
  /** Atakan'in mekanik isareti. */
  signature?: VfxSignature;
  /** Zeynep'in mekanik isareti. */
  court?: VfxCourtSignature;
};

/* ------------------------------------------------------------------ */
/* Ton ve sicaklik                                                       */
/* ------------------------------------------------------------------ */

/** Kademe basina cekirdek sicakligi: 1 sicak, 2 daha beyaz, 3 beyaz-sicak. */
export const TIER_HEAT = [0.5, 0.7, 0.88] as const;
/** Kademe basina govde agirligi. */
export const TIER_WEIGHT = [1, 1.3, 1.6] as const;
/** Kademe basina tonun beyaza cekilmesi (kenar biraz isiniyor; ton ayni). */
/** En fazla 0.2: ton acikligi 0.7nin altinda kaliyor (pastel bant yok). */
const TIER_EDGE_LIFT = [0, 0.1, 0.2] as const;

/**
 * Kulenin tonundan kademe tonlari: ayni ton, sicaklik artiyor.
 *
 * Eskiden ikinci ve ucuncu durak tonu 30-60 derece kaydiriyordu (Zeynep'te
 * pembe -> altin -> beyaz altin): her kule kademe atladikca baska bir renge
 * donuyordu. Artik kademeyi cekirdek ve agirlik tasiyor; ton kaliyor.
 */
export function deriveHeatRamp(hue: number): readonly [number, number, number] {
  return [liftToWhite(hue, TIER_EDGE_LIFT[0]), liftToWhite(hue, TIER_EDGE_LIFT[1]), liftToWhite(hue, TIER_EDGE_LIFT[2])];
}

/** Iki rengin ton farki (derece, 0-180); gri renkte 0. */
export function hueDistance(a: number, b: number) {
  const ha = toHsl(a);
  const hb = toHsl(b);
  if (ha.s < 0.05 || hb.s < 0.05) return 0;
  const diff = Math.abs(ha.h - hb.h) * 360;
  return Math.min(diff, 360 - diff);
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
  gaze: 14,
  packet: 14,
  cell: 13,
  arc: 14,
  lance: 15,
  none: 12
};

/** Carpma dilinden madde: kinetik (kirinti, kivilcim, duman) ya da enerji (catirti, isi). */
const IMPACT_MATTER: Record<VfxImpactStyle, VfxMatter> = {
  fragments: "kinetic",
  brackets: "kinetic",
  shatter: "kinetic",
  slash: "kinetic",
  decree: "kinetic",
  collapse: "energy",
  bolt: "energy",
  splash: "energy",
  curse: "energy",
  ripple: "energy",
  uplink: "energy",
  contain: "energy"
};

function makeTiers(
  ramp: readonly [number, number, number],
  hue: number,
  silhouette: VfxSilhouette,
  matter: VfxMatter,
  heavy: boolean,
  aoe: boolean,
  thickness: number
): readonly [VfxTierRecipe, VfxTierRecipe, VfxTierRecipe] {
  const size = SILHOUETTE_SIZE[silhouette];
  const kinetic = matter === "kinetic";
  const recipe = (index: 0 | 1 | 2): VfxTierRecipe => {
    const tier = (index + 1) as VfxTier;
    const weight = TIER_WEIGHT[index];
    const heat = TIER_HEAT[index];
    return {
      tier,
      color: ramp[index],
      core: whiteHot(hue, heat),
      heat,
      weight,
      thickness,
      silhouette: size,
      // Kisa, sert iz: 3 / 4 / 5 nokta (eski serit 3 / 6 / 8 idi).
      trail: { points: 3 + index, width: size * 0.22 * weight * thickness },
      muzzle: { anticipationMs: index === 0 ? 0 : 70 + index * 15, reach: (7 + index * 3) * (heavy ? 1.2 : 1) },
      impact: {
        flash: (11 + index * 4) * (heavy ? 1.2 : 1),
        sparks: (kinetic ? 3 : 2) + index * 2,
        debris: kinetic ? 2 + index : 0,
        crackle: kinetic ? 0 : 2 + index,
        force: (150 + index * 40) * (heavy ? 1.15 : 1),
        smoke: kinetic || aoe,
        scorch: aoe || (heavy && index >= 1) || (kinetic && index === 2),
        shockRing: index === 2 && (heavy || aoe),
        pinpoint: index === 2,
        durationMs: 340 + index * 50
      },
      shake: index === 2 && heavy,
      // Yalnizca agir tek vurus (Sunucu, Jackpot, Omer): hizli atan kuleler dusmani titretmesin.
      knock: heavy && index >= 1 ? index : 0
    };
  };
  return [recipe(0), recipe(1), recipe(2)];
}

type ProfileSeed = {
  character: string;
  delivery: VfxDelivery;
  silhouette: VfxSilhouette;
  impact: VfxImpactStyle;
  base: number;
  /** Kimlik tonu elle (Debug Lazer'in rampasi gibi); yoksa tabandan yere indirilmis. */
  ramp?: readonly [number, number, number];
  heavy?: boolean;
  aoe?: boolean;
  matter?: VfxMatter;
  /** Govde kalinligi carpani; yoksa 1. */
  thickness?: number;
  signature?: VfxMechanic;
  court?: VfxCourtMechanic;
};

/**
 * Atakan'in kuleleri katalogda ayni yesili tasiyor (0x22c55e); her birinin
 * gercek kimligi saldirisinin tonunda. Ton bu renklerden, yere indirilmis.
 */
const PROFILE_SEEDS: Record<string, ProfileSeed> = {
  "warrior-1": { character: "warrior", delivery: "ballistic", silhouette: "combat", impact: "brackets", base: 0x4dffbd, signature: "mark-reticle" },
  "warrior-2": { character: "warrior", delivery: "ballistic", silhouette: "packet", impact: "uplink", base: 0x58d9ff, heavy: true, aoe: true, signature: "uplink-column" },
  "warrior-3": { character: "warrior", delivery: "homing", silhouette: "cell", impact: "contain", base: 0x7fe5e8, signature: "containment" },
  "warrior-4": { character: "warrior", delivery: "ballistic", silhouette: "gaze", impact: "collapse", base: 0xcb79ff, signature: "tether" },
  // Lazerin rampasi sunucudaki DEBUG_LASER_TIER_COLORS: kirmizi, mavi, beyaz.
  // Isin kendi cizimini koruyor (dokunulmadi); rampa yalnizca kule halkasi ve galeri icin.
  "warrior-5": { character: "warrior", delivery: "laser", silhouette: "none", impact: "fragments", base: 0xef4444, ramp: [0xef4444, 0x60a5fa, 0xe0f2fe] },
  // Ucube 2x2 kule: mermisi de iki kat kalin (boyu ayni).
  "warrior-6": { character: "warrior", delivery: "ballistic", silhouette: "arc", impact: "bolt", base: 0xadf765, thickness: 2, signature: "stack-gauge" },

  // Zeynep: kizil, mor ve eflatun kenar tonu; govdenin enerjisi beyaz-sicak.
  "zeynep-1": { character: "zeynep", delivery: "ballistic", silhouette: "lance", impact: "decree", base: 0xec4899, court: "pierce-line" },
  "zeynep-2": { character: "zeynep", delivery: "showcase", silhouette: "none", impact: "fragments", base: 0xf9a8d4, court: "spotlight" },
  "zeynep-3": { character: "zeynep", delivery: "synthesis", silhouette: "lance", impact: "decree", base: 0xf0abfc, court: "formation-seal" },
  "zeynep-6": { character: "zeynep", delivery: "kin", silhouette: "none", impact: "ripple", base: 0xdc466d, court: "brand" },
  // Abarti ates etmiyor (saldiri sayilmiyor); profili gecis nabzinin tonu icin.
  "zeynep-8": { character: "zeynep", delivery: "rail", silhouette: "none", impact: "ripple", base: 0x7c3aed, court: "crossing-pulse" },

  "archer-1": { character: "archer", delivery: "ballistic", silhouette: "sprite", impact: "brackets", base: 0x8b5cf6 },
  "archer-2": { character: "archer", delivery: "ballistic", silhouette: "sprite", impact: "shatter", base: 0xdb2777 },
  "archer-3": { character: "archer", delivery: "curse", silhouette: "none", impact: "curse", base: 0x7f1dff, aoe: true },
  "archer-4": { character: "archer", delivery: "underworld", silhouette: "none", impact: "curse", base: 0x14b8a6 },
  "archer-5": { character: "archer", delivery: "ballistic", silhouette: "sprite", impact: "shatter", base: 0xe879f9 },
  "archer-6": { character: "archer", delivery: "whisper", silhouette: "sprite", impact: "ripple", base: 0x14b8a6, aoe: true },

  "onur-1": { character: "onur", delivery: "orbit", silhouette: "none", impact: "slash", base: 0x14b8a6 },
  "onur-2": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "fragments", base: 0x14b8a6, heavy: true },
  "onur-3": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "fragments", base: 0x2dd4bf },
  "onur-4": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "brackets", base: 0x14b8a6 },
  "onur-5": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "fragments", base: 0x0d9488 },
  "onur-6": { character: "onur", delivery: "ballistic", silhouette: "dart", impact: "slash", base: 0x5eead4 }
};

/** Taslak karakterlerin sinif silueti: kulenin kendi tonu, kendi sekli. */
const STUB_CLASS: Record<string, { silhouette: VfxSilhouette; impact: VfxImpactStyle }> = {
  mage: { silhouette: "orb", impact: "splash" },
  healer: { silhouette: "ring", impact: "ripple" },
  tank: { silhouette: "ball", impact: "fragments" }
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
  const hue = seed.ramp ? seed.ramp[0] : groundHue(seed.base);
  const ramp = seed.ramp ?? deriveHeatRamp(hue);
  const matter = seed.matter ?? IMPACT_MATTER[seed.impact];
  const heavy = Boolean(seed.heavy);
  const aoe = Boolean(seed.aoe);
  return {
    id,
    character: seed.character,
    delivery: seed.delivery,
    silhouette: seed.silhouette,
    impact: seed.impact,
    matter,
    base: seed.base,
    hue,
    ramp,
    heavy,
    aoe,
    tiers: makeTiers(ramp, hue, seed.silhouette, matter, heavy, aoe, seed.thickness ?? 1),
    ...(seed.signature ? { signature: { mechanic: seed.signature } } : {}),
    ...(seed.court ? { court: { mechanic: seed.court } } : {})
  };
}

/**
 * Kimligin profili; kayitta yoksa kulenin renginden turetilmis bir profil.
 *
 * `fallbackColor` bilinmeyen kimlikte kullaniliyor (yeni kule, sunucu yeni
 * bir son ek gonderdi): yine kulenin tonu, hicbir zaman varsayilan yesil.
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
        // Ayni karakterin alti kulesi ayni rengi tasiyor; ton kuleden kuleye
        // biraz kayiyor ki galeride ayirt edilsin (aile ayni).
        base: shiftHue(STUB_BASE[stub[1]] ?? fallbackColor, (index - 1) * 4),
        heavy: stub[1] === "tank",
        aoe: stub[1] === "mage"
      };
    } else {
      seed = { character: "unknown", delivery: "ballistic", silhouette: "dart", impact: "fragments", base: fallbackColor };
      // Bilinmeyen kimlik onbellege girmiyor: renk cagirandan geliyor.
      return buildProfile(id, seed);
    }
  }
  const profile = buildProfile(id, seed);
  cache.set(id, profile);
  return profile;
}

function shiftHue(color: number, degrees: number) {
  if (degrees === 0) return color;
  const hsl = toHsl(color);
  return fromHsl({ h: (hsl.h + degrees / 360 + 1) % 1, s: hsl.s, l: hsl.l });
}

/** Katalog renkleri (Baransel, Ulku, Omer); varsayilan yesil yok. */
const STUB_BASE: Record<string, number> = {
  mage: 0xa78bfa,
  healer: 0xf9a8d4,
  // Omer: celik-kehribar kahve (eski sari 0xfacc15 tereyagi gibi okunuyordu).
  tank: 0x9a6b2f
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
    // Sutun Zeynep'in kizil-eflatun tonunda; eski soluk altin (0xfde68a) yaldiz gibi okunuyordu.
    character: "zeynep", delivery: "showcase", silhouette: "none", impact: "ripple", base: 0xbe185d
  }),
  "onur-sympathy": buildProfile("onur-sympathy", {
    character: "onur", delivery: "showcase", silhouette: "none", impact: "ripple", base: 0x2dd4bf
  })
};

/** Isin kimliginin profili: ulti isinlari kendi profilinde, gerisi kulenin. */
export function getBeamVfxProfile(definitionId: string, color: number) {
  return ULTIMATE_PROFILES[definitionId] ?? getVfxProfile(definitionId, color);
}
