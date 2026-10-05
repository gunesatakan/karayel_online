import {
  TIER_COLUMN_HEIGHT_RATIO,
  getUltimateShockwavePose,
  getDeathBurstPose,
  getTierCeremonyPose,
  getTierShardOrbit,
  pickAccentColor,
  type BeamSnapshot,
  type ProjectileSnapshot
} from "@karayel/shared";
import {
  SCORCH,
  SMOKE,
  STEEL,
  clamp01,
  darken,
  drawBallisticSparks,
  drawCrackle,
  drawDebris,
  drawScorch,
  drawSlug,
  drawSmoke,
  fillDisc,
  fillFan,
  groundHue,
  groundHueCached,
  hashNoise,
  liftToWhite,
  whiteHot,
  type BallisticSparkOptions,
  type CrackleOptions,
  type DebrisOptions,
  type SmokeOptions,
  type VfxGraphics
} from "./kit";
import type { VfxLod } from "./lod";

type Graphics = VfxGraphics;
// Zeynep'in mermileri (Hiza, Taht) artik ferman mizragi (zeynep-signatures);
// burada yalnizca Atakan'in hareketli govdeleri kaldi.
export type ShotStyle = "tracker" | "psychic";
/**
 * Olum ("death" turu): koyu bir siluete coken govde, malzemesine gore
 * kirinti, kivilcim ya da kor, duman ve sonen bir yer izi. Sprite yok;
 * Graphics yuzeyinde (iz dusmanlarin altindaki yuzeyde), yasina gore her
 * karede yeniden.
 */
export type DeathBurst = {
  x: number; y: number;
  /** Dusmanin ekrandaki boyu (dunya px). */
  size: number;
  /** Dusmanin vurgu rengi (dokudan): yalnizca kivilcimin ve sivinin ince tonu. */
  color: number;
  /** Kirinti sayisi (siradan 5, agir 8). */
  shards: number;
  /** Cekirdek patlamanin suresi (180-220 ms); duman ve iz bundan uzun. */
  durationMs: number;
  /** Kendi oldurmen 1, takim arkadasininki soluk. */
  intensity: number;
  /** Hareket azaltma: basma, kirinti ve kivilcim yok; govde yerinde soner. */
  still: boolean;
  bornAt: number;
  seed: number;
  /** Dusmanin dokusu: irk ve malzeme bundan (meka, bocek, kristal, tas, kul). */
  texture?: string;
  /** Agir dusman (brute, kusatma): daha cok ve daha iri parca, daha buyuk iz. */
  heavy: boolean;
  /** Ucan dusman: yer izi ve inis yok. */
  air?: boolean;
  /** Yere indirilmis vurgu (emit aninda bir kez hesaplaniyor). */
  accent?: number;
};
/**
 * Kule ani ("tower" turu): kademe toreni, yerlestirmenin inisi ya da sunucu
 * onayinin halkasi.
 *
 * "tier": kademe renginde isik sutunu ve kuleye donerek akan kiymiklar.
 * "landing": inen kulenin kaldirdigi toz halkasi. "confirm": takma ya da
 * onarim onaylaninca kuleden yayilan halka. Hicbiri sprite ve tween acmiyor;
 * olum patlamasi gibi tek Graphics yuzeyinde, yasina gore ciziliyor.
 */
export type TowerMoment = {
  kind: "tier" | "landing" | "confirm";
  /** "confirm": buyuk an (takma) -- daha genis halka ve ikinci beyaz halka. */
  strong?: boolean;
  x: number; y: number;
  /** Kulenin disk boyu (dunya px); 2x2 kulede dort kare. */
  size: number;
  /** Kademe rengi; toz halkasinda kullanilmiyor. */
  color: number;
  /** Kiymik sayisi ("tier"). */
  shards: number;
  durationMs: number;
  /** Kendi kulen 1, takim arkadasininki soluk. */
  intensity: number;
  /** Hareket azaltma: yukselme, kiymik ve yayilma yok; yerinde soner. */
  still: boolean;
  bornAt: number;
  seed: number;
};
/**
 * Ulti atisinin sok dalgasi ("cast" turu), karakterin renginde.
 *
 * "ring": merkezden disa acilan halka -- butun sahaya vuran ultide arenanin
 * ortasindan, Atakan'da drone'larin kalktigi kulelerden. "column": Zeynep'in
 * secilen sutunu; dalga dokunulan noktadan sutun boyunca yukari ve asagi
 * kosuyor, sutunun disina tasmiyor -- ulti de tasmiyor.
 */
export type CastWave = {
  shape: "ring" | "column";
  x: number; y: number;
  /** Halkanin azami yaricapi (dunya px); sutunda kullanilmiyor. */
  radius: number;
  /** Sutunun genisligi ve dikey siniri. */
  width?: number; top?: number; bottom?: number;
  color: number;
  durationMs: number;
  /** Hareket azaltma: yayilma yok, son boyunda belirip yerinde soner. */
  still: boolean;
  bornAt: number;
};
const noise = hashNoise;
const clamp = clamp01;
/** "combat" silueti: Takipci ve Obsesyon (Sunucu paket, Ucube simsek; attack-vfx'te). */
export function shotStyle(id = ""): ShotStyle | undefined {
  if (id === "warrior-1") return "tracker";
  if (id === "warrior-4") return "psychic";
  return undefined;
}

function line(g: Graphics, x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha: number) {
  if (alpha <= 0 || width <= 0) return;
  g.lineStyle(width, color, clamp(alpha));
  g.lineBetween(x1, y1, x2, y2);
}
/**
 * Hareketli mermi govdesi: Takipci ve Obsesyon.
 *
 * Agir, sert dil: Takipci yogun bir iz mermisi (koyu kenarli ton, beyaz-sicak
 * cekirdek, parlak bas); Obsesyon koyu cekirdekli agir bir gulle, ton yalnizca
 * kenarda. Donen kiymik ve kivrimli simsek yok. `heat` cekirdegin sicakligi
 * (kademenin yogunlugu), renk profilin kimlik tonu.
 */
export function drawCombatProjectile(g: Graphics, p: ProjectileSnapshot, scale: number, color: number, heat = 0.6) {
  const style = shotStyle(p.definitionId);
  if (!style) return false;
  const tier = Math.max(1, Math.min(3, p.tier ?? 1));
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 1), ux = Math.cos(angle), uy = Math.sin(angle);
  if (style === "psychic") {
    // Koyu cekirdek, ince ton kenari ve beyaz-sicak bir nokta: cokertme gullesi.
    const radius = (2.4 + tier * 0.35) * scale;
    line(g, p.x - ux * radius * 2.6, p.y - uy * radius * 2.6, p.x, p.y, radius * 0.9, darken(color, 0.35), 0.55);
    g.fillStyle(color, 0.85);
    fillDisc(g, p.x, p.y, radius * 1.3);
    g.fillStyle(0x0b0612, 0.96);
    fillDisc(g, p.x, p.y, radius);
    const core = Math.max(0.6, radius * 0.32);
    g.fillStyle(whiteHot(color, heat), 1);
    g.fillRect(p.x - core, p.y - core, core * 2, core * 2);
    return true;
  }
  // Iz mermisi: govde kalinligi kademenin agirligiyla.
  drawSlug(g, p.x, p.y, ux, uy, (6 + tier * 1.5) * scale, (1.1 + tier * 0.3) * scale, color, heat);
  return true;
}

/**
 * Kin'in sunucu rengi kulenin derin kizili (0x7f1d1d); siyah zeminde o renkle
 * cizilen dalga gorunmuyor. Renk degistirilmiyor, sabit bir kazancla
 * aydinlatiliyor: oran korundugu icin Abarti'nin karartmasi (carpimsal) ve
 * Taht'in daha acik kizili ayni farkla okunuyor.
 */
export const PRESSURE_WAVE_GAIN = 1.72;
export function gainColor(color: number, gain: number) {
  const channel = (shift: number) => Math.min(255, Math.round(((color >> shift) & 0xff) * gain));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * Kademenin kenari: ayni ton, kademe yukseldikce daha beyaz-sicak.
 *
 * Eskiden Zeynep'in "rutbe trimi" idi (kademe 2 altin, 3 beyaz altin). Agir
 * dilde kademe renk degistirmiyor, isiniyor: govde kombonun tonunda (Kin
 * kizili, yanik camgobegi, Abarti'nin koyulastirmasi), kenar onun sicak hali.
 */
export function getTierEdge(tier: number, body: number) {
  // En fazla 0.2 cekme: kenar tonun sicak hali, pastel degil (beyaz-sicak cekirdek ayri).
  return liftToWhite(body, tier >= 3 ? 0.2 : tier >= 2 ? 0.12 : 0.05);
}

/**
 * Kin dalgasi: yogun on kenar, arkada kalan kiriklar.
 *
 * Govde isinin kendi rengi (Kin kizili, Abarti'nin karartmasi); kademe on
 * kenarin sicakligini ve kalinligini artiriyor. Dalganin yasi ttl'den: sunucu
 * dalgayi her karede yeniden gonderiyor, son karede sonuyor.
 */
export function drawPressureWave(g: Graphics, beam: BeamSnapshot, now: number, scale: number) {
  const dx = beam.x2 - beam.x1, dy = beam.y2 - beam.y1, radius = Math.hypot(dx, dy);
  if (radius < 1) return;
  const tier = beam.tier ?? 1, heading = Math.atan2(dy, dx);
  const halfAngle = Math.atan2(beam.width / 2, radius);
  const color = groundHueCached(gainColor(beam.color ?? 0x7f1d1d, PRESSURE_WAVE_GAIN));
  const edge = getTierEdge(tier, color);
  // Son 40 ms'de soner: dalga eskiden son karede birden kayboluyordu.
  const life = clamp((beam.ttlMs ?? 120) / 40);
  // Yogun on kenar ve arkasinda koyu dusum: on kenar sunucunun geometrisiyle ilerliyor.
  for (let band = 3; band >= 0; band--) {
    const r = Math.max(1, radius - band * 2.5 * scale);
    g.lineStyle((band === 0 ? 1.2 + tier * 0.4 : 2.5) * scale, band === 0 ? edge : darken(color, band * 0.18), (band === 0 ? 0.92 : 0.32 * (1 - band / 5)) * life);
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = heading - halfAngle + halfAngle * 2 * i / 16;
      const ripple = Math.sin(i * 1.4 + now / 110) * scale * (band === 0 ? 0.4 : 1.2);
      const x = beam.x1 + Math.cos(a) * (r + ripple), y = beam.y1 + Math.sin(a) * (r + ripple);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
  }
  const fractures = 4 + tier * 2;
  for (let i = 0; i < fractures; i++) {
    const fraction = (i + 0.5) / fractures;
    const a = heading - halfAngle + halfAngle * 2 * fraction;
    const lag = ((now / 400 + noise(i * 3)) % 1) * (10 + tier * 5) * scale;
    const r = Math.max(0, radius - lag);
    line(g, beam.x1 + Math.cos(a) * r, beam.y1 + Math.sin(a) * r,
      beam.x1 + Math.cos(a) * Math.max(0, r - 4 * scale), beam.y1 + Math.sin(a) * Math.max(0, r - 4 * scale),
      0.8 * scale, color, 0.6 * (1 - lag / ((10 + tier * 5) * scale)) * life);
  }
}

/** Toz halkasinin rengi: dusmanin degil zeminin; agir govde yere iniyor. */
const DUST_COLOR = 0xd6c7a8;
/** Beyaza dogru acilmis ton; kiymiklarin bir kismi parlasin, hepsi degil. */
function lighten(color: number, amount: number) {
  const mix = (shift: number) => {
    const channel = (color >> shift) & 255;
    return Math.round(channel + (255 - channel) * amount) << shift;
  };
  return mix(16) | mix(8) | mix(0);
}

/**
 * Olumun malzemesi: dusmanin irkindan (dokusunun anahtarindan).
 *
 * - metal: meka ve kutsal muhafiz -- zirhli, mekanik govde. Celik kirinti,
 *   beyaz-sicak kivilcim, koyu duman, yanik izi.
 * - chitin: uzay bocegi -- organik. Koyu kitin parcalari ve koyu bir sivi
 *   (ichor) sicramasi, yerde leke; kivilcim yok.
 * - crystal: dorduncu boyut -- kristal govde. Koyu kristal kiymiklari ve
 *   kisa bir enerji catirtisi; duman yok.
 * - stone: golem -- tas parcalari ve toz.
 * - ash: dusmus -- kul, yukselen korlar ve koyu duman.
 *
 * Renkler yerin ve malzemenin; dusmanin vurgu rengi yalnizca kivilcimin,
 * korun ve sivinin ince tonu. Eski patlama kiymiklari dusmanin vurgu
 * renginde (pembe, limon, mor) saciyordu: sekerleme gibi.
 */
export type DeathMaterial = "metal" | "chitin" | "crystal" | "stone" | "ash";

export function getDeathMaterial(textureKey: string | undefined): DeathMaterial {
  if (!textureKey) return "metal";
  if (textureKey.includes("spaceBug")) return "chitin";
  if (textureKey.includes("fourthDimensional")) return "crystal";
  if (textureKey.includes("golem")) return "stone";
  if (textureKey.includes("fallen")) return "ash";
  return "metal";
}

type DeathLook = {
  /** Cokup sonen govdenin rengi (koyu). */
  body: number;
  /** Kirintinin govdesi ve parlak yuzu. */
  debris: number;
  edge: (accent: number) => number;
  sparks: "sparks" | "embers" | "crackle" | "none";
  /** Duman rengi; 0 duman yok. */
  smoke: number;
  /** Yer izinin rengi (yanik, leke, toz). */
  decal: (accent: number) => number;
  /** Kirintinin boyu ve hizi carpani. */
  chunk: number;
};

const DEATH_LOOKS: Record<DeathMaterial, DeathLook> = {
  metal: { body: 0x18181b, debris: STEEL, edge: () => 0xa1a1aa, sparks: "sparks", smoke: SMOKE, decal: () => SCORCH, chunk: 1 },
  chitin: { body: 0x0d1208, debris: 0x1c2410, edge: (accent) => darken(accent, 0.3), sparks: "none", smoke: 0, decal: (accent) => darken(accent, 0.82), chunk: 0.9 },
  crystal: { body: 0x120a1f, debris: 0x2a1745, edge: (accent) => liftToWhite(darken(accent, 0.2), 0.2), sparks: "crackle", smoke: 0, decal: () => SCORCH, chunk: 1 },
  stone: { body: 0x1c1917, debris: 0x44403c, edge: () => 0x78716c, sparks: "none", smoke: 0x57534e, decal: () => 0x292524, chunk: 1.2 },
  ash: { body: 0x0f0a0a, debris: 0x1f1414, edge: (accent) => darken(accent, 0.4), sparks: "embers", smoke: 0x27272a, decal: () => SCORCH, chunk: 0.9 }
};

/** Korun tonu: sonmekte olan kizil-turuncu, yere indirilmis (sekerleme turuncu degil). */
const EMBER = groundHue(0xc2410c);

/** Olumun duman, kor ve yer izi ne kadar kaliyor (cekirdek patlamadan sonra). */
export const DEATH_SMOKE_MS = 650;
export const DEATH_DECAL_MS = 1100;

/* Karede yerinde yazilan secenekler: olum basina nesne literali yok. */
const DEATH_DEBRIS: DebrisOptions = { seed: 0, count: 0, speed: 0, heading: undefined, fan: 0, gravity: 0, lifeMs: 0, color: 0, edge: 0, size: 0, alpha: 0, floor: 0 };
const DEATH_SPARKS: BallisticSparkOptions = { seed: 0, count: 0, speed: 0, heading: undefined, fan: 0, gravity: 0, lifeMs: 0, hue: 0, width: 0, alpha: 0, streak: 0 };
const DEATH_SMOKE: SmokeOptions = { seed: 0, count: 0, radius: 0, grow: 0, rise: 0, lifeMs: 0, color: 0, alpha: 0, still: false };
const DEATH_CRACKLE: CrackleOptions = { seed: 0, count: 0, reach: 0, hue: 0, width: 0, alpha: 0, heading: undefined, fan: 0 };

/**
 * Olumun tam omru: yalnizca gercekten cizilecek olan kadar. Yer izi (zemin
 * yuzeyi var, ucmuyor, LOD izin veriyor) ~1.1 sn, duman ~0.65 sn, kirinti ve
 * kivilcim (hareket azaltmada yok) ~0.4-0.7 sn; hicbiri yoksa cekirdek patlama.
 */
export function getDeathLifeMs(burst: Pick<DeathBurst, "durationMs" | "still" | "air" | "heavy" | "texture">, hasGround: boolean, lod?: VfxLod) {
  const look = DEATH_LOOKS[getDeathMaterial(burst.texture)];
  let life = burst.durationMs;
  if (!burst.still) {
    life = Math.max(life, burst.heavy ? 620 : 520);
    if (!lod || lod.sparks) life = Math.max(life, look.sparks === "embers" ? 700 : look.sparks === "sparks" ? 420 : 140);
  }
  if (look.smoke !== 0 && (!lod || lod.smoke)) life = Math.max(life, DEATH_SMOKE_MS);
  if (hasGround && !burst.air && (!lod || lod.decals)) life = Math.max(life, DEATH_DECAL_MS);
  return life;
}

/**
 * Olum: govde koyu bir siluete cokup soner, malzemesine gore parcalanir.
 *
 * Ilk 1-3 kare beyaz-sicak bir cekirdek (paylasilan poz: `flash`). Govde
 * basiliyor (x1.3 / y0.6) ama dusmanin renginde degil, koyu: govde sonuyor.
 * Kirintilar balistik ve yere iniyor; metal kivilcim saciyor, kul kor
 * birakiyor, kristal catirdiyor, bocek koyu sivi sicratiyor; duman yukselip
 * soner, yer izi bir saniyede kayboluyor. Agir dusman daha cok ve daha iri
 * parca, daha buyuk iz. Ucan dusmanin altinda zemin yok: yer izi ve inis yok.
 *
 * `ground` yer izinin yuzeyi (dusmanlarin altinda); yoksa iz cizilmiyor.
 */
export function drawDeathBurst(g: Graphics, burst: DeathBurst, now: number, scale: number, ground?: Graphics, lod?: VfxLod) {
  const elapsed = now - burst.bornAt;
  if (elapsed < 0) return;
  const t = clamp(elapsed / burst.durationMs);
  const pose = getDeathBurstPose(t, burst.still);
  const { x, y, intensity, seed } = burst;
  const material = getDeathMaterial(burst.texture);
  const look = DEATH_LOOKS[material];
  const accent = burst.accent ?? burst.color;
  const heavy = burst.heavy;
  const radius = burst.size * 0.34;
  const sparks = lod ? lod.sparks : true;
  const smoke = lod ? lod.smoke : true;
  const decals = lod ? lod.decals : true;

  // Yer izi: govdenin altinda; ucan dusmanda yok.
  if (ground && decals && !burst.air && elapsed < DEATH_DECAL_MS) {
    const age = elapsed / DEATH_DECAL_MS;
    const spread = burst.still ? 1 : Math.min(1, elapsed / 120);
    const size = radius * (heavy ? 1.5 : 1.15) * (0.6 + 0.4 * spread);
    drawScorch(ground, x, y + radius * 0.35, age, size, size * 0.48, look.decal(accent), 0.6 * intensity, seed);
  }

  if (pose.alpha > 0) {
    g.fillStyle(look.body, clamp(pose.alpha * 0.85 * intensity));
    fillFan(g, x, y, radius * pose.scaleX, radius * pose.scaleY, 8);
  }
  if (pose.flash > 0) {
    // Sert parlama: kucuk ve beyaz-sicak, govdenin ortasinda (1-3 kare).
    g.fillStyle(whiteHot(accent, 0.5), clamp(pose.flash * 0.95 * intensity));
    fillDisc(g, x, y, radius * 0.6 * (0.7 + 0.3 * pose.flash));
  }

  if (smoke && look.smoke !== 0 && elapsed < DEATH_SMOKE_MS) {
    DEATH_SMOKE.seed = seed * 7 + 3;
    DEATH_SMOKE.count = heavy ? 3 : 2;
    DEATH_SMOKE.radius = radius * (material === "stone" ? 0.55 : 0.45);
    DEATH_SMOKE.grow = 1.1;
    DEATH_SMOKE.rise = (heavy ? 20 : 15) * scale;
    DEATH_SMOKE.lifeMs = DEATH_SMOKE_MS * 0.8;
    DEATH_SMOKE.color = look.smoke;
    DEATH_SMOKE.alpha = 0.34 * intensity;
    DEATH_SMOKE.still = burst.still;
    drawSmoke(g, x, y - radius * 0.2, elapsed, DEATH_SMOKE);
  }

  // Parcalar ve kivilcimlar hareket: hareket azaltmada yok.
  if (burst.still) return;
  DEATH_DEBRIS.seed = seed * 13 + 1;
  DEATH_DEBRIS.count = burst.shards;
  DEATH_DEBRIS.speed = (heavy ? 95 : 80) * look.chunk * scale;
  DEATH_DEBRIS.heading = undefined;
  DEATH_DEBRIS.fan = 0;
  DEATH_DEBRIS.gravity = 320 * scale;
  DEATH_DEBRIS.lifeMs = heavy ? 620 : 520;
  DEATH_DEBRIS.color = material === "chitin" ? darken(accent, 0.7) : look.debris;
  DEATH_DEBRIS.edge = look.edge(accent);
  DEATH_DEBRIS.size = (heavy ? 2.6 : 2) * look.chunk * scale;
  DEATH_DEBRIS.alpha = 0.95 * intensity;
  DEATH_DEBRIS.floor = burst.air ? 0 : radius * 0.7;
  // Yere inen parca zemin yuzeyinde (dusmanlarin altinda).
  drawDebris(g, x, y, elapsed, DEATH_DEBRIS, ground);

  if (!sparks) return;
  if (look.sparks === "sparks" || look.sparks === "embers") {
    const embers = look.sparks === "embers";
    DEATH_SPARKS.seed = seed * 11 + 5;
    DEATH_SPARKS.count = heavy ? 7 : 5;
    DEATH_SPARKS.speed = (embers ? 38 : 150) * scale;
    DEATH_SPARKS.heading = embers ? -Math.PI / 2 : undefined;
    DEATH_SPARKS.fan = embers ? 2.2 : 0;
    // Korlar sicak havayla yukseliyor; kivilcim dusuyor.
    DEATH_SPARKS.gravity = (embers ? -30 : 340) * scale;
    DEATH_SPARKS.lifeMs = embers ? 700 : 420;
    DEATH_SPARKS.hue = embers ? EMBER : accent;
    DEATH_SPARKS.width = Math.max(0.7, (embers ? 1.3 : 0.9) * scale);
    DEATH_SPARKS.alpha = 0.95 * intensity;
    DEATH_SPARKS.streak = embers ? 0.02 : 0.028;
    drawBallisticSparks(g, x, y, elapsed, DEATH_SPARKS);
  } else if (look.sparks === "crackle" && elapsed < 140) {
    DEATH_CRACKLE.seed = seed * 3 + Math.floor(elapsed / 45) * 7;
    DEATH_CRACKLE.count = heavy ? 4 : 3;
    DEATH_CRACKLE.reach = radius * 1.3;
    DEATH_CRACKLE.hue = accent;
    DEATH_CRACKLE.width = Math.max(0.6, 0.9 * scale);
    DEATH_CRACKLE.alpha = (1 - elapsed / 140) * intensity;
    DEATH_CRACKLE.heading = undefined;
    drawCrackle(g, x, y, DEATH_CRACKLE);
  }
}

/**
 * Sutunun katmanlari: genislik (disk boyunun kati), opaklik, beyaza acilma.
 * Uc katman ust uste binince ortasi parlak, kenari yumusak bir isik oluyor;
 * postFX ya da bloom yok.
 */
const TIER_COLUMN_LAYERS = [[0.9, 0.12, 0], [0.5, 0.2, 0.2], [0.16, 0.5, 0.65]] as const;
/** Sutun yukari dogru bu kadar dilimde soner; tek dikdortgen sert bir kutu gibi dururdu. */
const TIER_COLUMN_SEGMENTS = 5;

/**
 * Kademe toreni: kulenin arkasindan yukselen isik sutunu, ice donen kiymiklar.
 *
 * Yuzey kule sprite'larinin (12) altinda: sutun kulenin arkasindan yukseliyor
 * ve kule onunde siluet gibi okunuyor, kiymiklar kulenin govdesine girip
 * kayboluyor. Kule gorunur kaliyor; savasin ortasinda yukseltilen kulenin
 * ne yaptigi ortulmemeli.
 */
export function drawTierCeremony(g: Graphics, moment: TowerMoment, now: number) {
  const t = clamp((now - moment.bornAt) / moment.durationMs);
  const pose = getTierCeremonyPose(t, moment.still);
  const { x, y, size, color, intensity, seed } = moment;
  const baseY = y + size * 0.2;

  if (pose.columnAlpha > 0) {
    const height = size * TIER_COLUMN_HEIGHT_RATIO * pose.columnHeight;
    for (const [widthRatio, alpha, lift] of TIER_COLUMN_LAYERS) {
      const width = size * widthRatio * pose.columnWidth;
      const tone = lift > 0 ? lighten(color, lift) : color;
      for (let i = 0; i < TIER_COLUMN_SEGMENTS; i++) {
        const segment = height / TIER_COLUMN_SEGMENTS;
        g.fillStyle(tone, clamp(alpha * pose.columnAlpha * intensity * (1 - i / TIER_COLUMN_SEGMENTS)));
        g.fillRect(x - width / 2, baseY - segment * (i + 1), width, segment);
      }
    }
    // Sutunun dibinde zemine vuran isik.
    g.fillStyle(color, clamp(0.28 * pose.columnAlpha * intensity));
    g.fillEllipse(x, baseY, size * 1.5 * pose.columnWidth, size * 0.5, 18);
  }

  if (pose.shardAlpha <= 0) return;
  const alpha = clamp(pose.shardAlpha * intensity);
  const length = size * 0.17, half = size * 0.045;
  for (let i = 0; i < moment.shards; i++) {
    const orbit = getTierShardOrbit(i, moment.shards, pose.shardTravel);
    // Kucuk bir sapma: on iki kiymik cetvelle dizilmis gibi durmasin.
    const a = orbit.angle + (noise(seed + i) - 0.5) * 0.35;
    const r = orbit.radius * size;
    const ux = Math.cos(a), uy = Math.sin(a);
    const px = x + ux * r, py = y + uy * r;
    // Uc kuleye bakiyor: kiymik disari degil iceri akiyor.
    g.fillStyle(i % 3 === 0 ? lighten(color, 0.6) : color, alpha);
    g.fillTriangle(px - ux * length, py - uy * length,
      px - uy * half, py + ux * half, px + uy * half, py - ux * half);
  }
}

/**
 * Yerlestirme inisi: kulenin altindan yere yayilan toz halkasi.
 *
 * Halka kulenin gobeginden basliyor; sprite'in altinda kaldigi icin once
 * gorunmuyor, kule yere oturunca kenarindan disari tasiyor. Renk zeminin,
 * kulenin degil.
 */
export function drawTowerLanding(g: Graphics, moment: TowerMoment, now: number, scale: number) {
  const t = clamp((now - moment.bornAt) / moment.durationMs);
  const { x, y, size, intensity, seed } = moment;
  const groundY = y + size * 0.22;
  if (moment.still) {
    const rx = size * 0.72;
    g.lineStyle(Math.max(0.6, 1.4 * scale), DUST_COLOR, clamp(0.45 * (1 - t) * intensity));
    g.strokeEllipse(x, groundY, rx * 2, rx * 0.9, 22);
    return;
  }

  const spread = 1 - (1 - t) ** 2;
  const rx = size * (0.5 + 0.55 * spread);
  g.lineStyle(Math.max(0.6, (2.2 - 1.5 * t) * scale), DUST_COLOR, clamp(0.6 * (1 - t) * intensity));
  g.strokeEllipse(x, groundY, rx * 2, rx * 0.9, 22);
  // Halkadan kopan birkac toz topagi; yere yatik elipsin uzerinde disari kayiyor.
  const puff = size * 0.07 * (1 - t * 0.5);
  g.fillStyle(DUST_COLOR, clamp(0.35 * (1 - t) * intensity));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (noise(seed + i) - 0.5) * 0.8;
    const reach = rx * (1.02 + noise(seed + i + 10) * 0.12);
    g.fillCircle(x + Math.cos(a) * reach, groundY + Math.sin(a) * reach * 0.45, puff);
  }
}

/**
 * Sunucu onayinin halkasi: kuleden disa yayilan, onay renginde.
 *
 * Eskiden 28 slotluk halka havuzundan (`spawnFlashRing`) aciliyordu; kalabalik
 * dalgada havuz atis parlamalariyla dolu oldugu icin ya onay halkasi dusuyor
 * ya da atislari itiyordu. Burada kule anlarinin kendi tavaninda. Takmada
 * (strong) ikinci, beyaz ve kisa bir halka: tek halka "bir sey oldu", iki
 * halka "onemli bir sey oldu". Hareket azaltmada halka buyumeden yerinde soner.
 */
const CONFIRM_ECHO_MS = 420;
export function drawTowerConfirm(g: Graphics, moment: TowerMoment, now: number, scale: number) {
  const age = now - moment.bornAt;
  const t = clamp(age / moment.durationMs);
  const { x, y, size, color, intensity } = moment;
  const strong = Boolean(moment.strong);
  const fade = 1 - t;
  const fill = (strong ? 0.2 : 0.1) * fade * intensity;

  if (moment.still) {
    const radius = size * (strong ? 0.75 : 0.6);
    g.fillStyle(color, clamp(fill));
    g.fillCircle(x, y, radius);
    g.lineStyle(Math.max(0.6, (strong ? 3 : 2) * scale), color, clamp(0.95 * fade * intensity));
    g.strokeCircle(x, y, radius);
    return;
  }

  const eased = 1 - (1 - t) ** 3;
  const radius = size * (0.3 + (strong ? 1.2 : 0.65) * eased);
  g.fillStyle(color, clamp(fill));
  g.fillCircle(x, y, radius);
  g.lineStyle(Math.max(0.6, (strong ? 3 : 2) * scale), color, clamp(0.95 * fade * intensity));
  g.strokeCircle(x, y, radius);

  if (strong && age < CONFIRM_ECHO_MS) {
    const echo = clamp(age / CONFIRM_ECHO_MS);
    const echoEased = 1 - (1 - echo) ** 3;
    g.lineStyle(Math.max(0.6, 1.5 * scale), 0xffffff, clamp(0.9 * (1 - echo) * intensity));
    g.strokeCircle(x, y, size * (0.15 + 0.9 * echoEased));
  }
}

/**
 * Ulti sok dalgasi: karakterin renginde, dokunulan yerden disa.
 *
 * Uc katman: genis soluk bir hale, rengin kendisi ve beyaza acilmis ince bir
 * on kenar. postFX ya da parcacik yok; tek Graphics yuzeyinde, yasina gore.
 * Sutun seklinde dalga sutunun kenarlarini da ciziyor: ulti o sinirin
 * disina tasmiyor, efekt de tasmamali.
 */
export function drawCastWave(g: Graphics, wave: CastWave, now: number, scale: number) {
  const t = clamp((now - wave.bornAt) / wave.durationMs);
  const pose = getUltimateShockwavePose(t, wave.still);
  if (pose.alpha <= 0) return;
  const { color } = wave;
  const edge = lighten(color, 0.6);
  const width = Math.max(0.8, 2.4 * pose.width * scale);
  const edgeWidth = Math.max(0.6, width * 0.45);

  if (wave.shape === "column") {
    const top = wave.top ?? wave.y;
    const bottom = wave.bottom ?? wave.y;
    const columnWidth = wave.width ?? 0;
    const left = wave.x - columnWidth / 2;
    const right = left + columnWidth;
    const upY = wave.y - (wave.y - top) * pose.reach;
    const downY = wave.y + (bottom - wave.y) * pose.reach;
    // Dalganin gectigi kisim hafifce boyaniyor; on kenarlar sutun boyunca kosuyor.
    g.fillStyle(color, clamp(0.16 * pose.alpha));
    g.fillRect(left, upY, columnWidth, downY - upY);
    for (const y of [upY, downY]) {
      line(g, left, y, right, y, width * 3, color, 0.18 * pose.alpha);
      line(g, left, y, right, y, width, color, 0.9 * pose.alpha);
      line(g, left, y, right, y, edgeWidth, edge, pose.alpha);
    }
    line(g, left, upY, left, downY, Math.max(0.6, 1.2 * scale), color, 0.55 * pose.alpha);
    line(g, right, upY, right, downY, Math.max(0.6, 1.2 * scale), color, 0.55 * pose.alpha);
    return;
  }

  const radius = Math.max(1, wave.radius * pose.reach);
  g.lineStyle(width * 3.2, color, clamp(0.16 * pose.alpha));
  g.strokeCircle(wave.x, wave.y, radius);
  g.lineStyle(width, color, clamp(0.85 * pose.alpha));
  g.strokeCircle(wave.x, wave.y, radius);
  g.lineStyle(edgeWidth, edge, clamp(pose.alpha));
  g.strokeCircle(wave.x, wave.y, radius * 0.985);
}

/**
 * Dokunun vurgu rengi; oldurme basina degil, doku basina bir kez okunur.
 *
 * Kucuk bir tuvale kucultulup piksel okunuyor (32x32, 1 ms'nin altinda).
 * Okunamazsa (tarayici tuvali kirletilmis sayarsa) `fallback`.
 */
const ACCENT_SAMPLE_PX = 32;
let accentCanvas: HTMLCanvasElement | undefined;
export function readTextureAccent(source: unknown, fallback: number) {
  if (typeof document === "undefined" || !(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return fallback;
  }
  try {
    accentCanvas ??= document.createElement("canvas");
    accentCanvas.width = ACCENT_SAMPLE_PX;
    accentCanvas.height = ACCENT_SAMPLE_PX;
    const context = accentCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.clearRect(0, 0, ACCENT_SAMPLE_PX, ACCENT_SAMPLE_PX);
    context.drawImage(source, 0, 0, ACCENT_SAMPLE_PX, ACCENT_SAMPLE_PX);
    return pickAccentColor(context.getImageData(0, 0, ACCENT_SAMPLE_PX, ACCENT_SAMPLE_PX).data, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Canli olum siniri.
 *
 * Tepede saniyede 3-6 oldurme; cekirdek patlama 190-220 ms, duman ve yer izi
 * ~1 sn: normalde 3-6 canli. Ulti tek karede onlarca dusman oldurebiliyor;
 * sinir o anki cizim yukunu bagliyor (dolunca en eski olum, yani en soluk iz,
 * yerini veriyor). Mermi temaslarindan ayri tutuluyor ki kalabalik bir atis
 * olumu, olum de atisi silmesin.
 */
export const MAX_DEATH_BURSTS = 40;
/**
 * Canli kule ani siniri.
 *
 * Kademe toreni macta birkac kez, inis kurulumda dakikada birkac kez geliyor,
 * onay halkasi (takma, onarim) yalnizca oyuncunun kendi ekraninda ve altin
 * harcadigi icin seyrek; 4 oyuncu ayni anda yerlestirse bile 4-8 canli. Sinir yaratici modun toplu
 * seviye atlatmasina karsi. Olumlerden ve atislardan ayri: kalabalik bir
 * dalga oyuncunun satin aldigi ani silmesin.
 */
const MAX_TOWER_MOMENTS = 12;
/**
 * Canli ulti dalgasi siniri. Ulti macta birkac kez; tek atis en fazla birkac
 * halka aciyor (Atakan'da kule basina bir). Ayri liste: kalabalik bir
 * dalganin olumleri oyuncunun kendi anini silmesin.
 */
const MAX_CAST_WAVES = 8;

/**
 * Sinirli olay tamponu: olum, kule anlari ve ulti dalgalari.
 *
 * Atis ve carpma olaylari artik `AttackVfx`te (profil gudumlu); burada
 * yalnizca saldiri disi anlar kaldi. Parcacik sprite'i ya da tween yok.
 */
export class CombatVfx {
  private deaths: DeathBurst[] = [];
  private moments: TowerMoment[] = [];
  private casts: CastWave[] = [];
  private seed = 0;
  /**
   * @param graphics olumler, kule anlari ve ulti dalgalari (dusmanlarin ustunde).
   * @param ground olumun yer izi (dusmanlarin altinda); yoksa iz cizilmiyor.
   * @param lod kivilcim, duman ve yer izi bu sirayla dusuyor.
   */
  constructor(private graphics: Graphics & { clear(): unknown }, private ground?: Graphics & { clear(): unknown }, private lod?: VfxLod) {}
  /** "death" turu: yalnizca oldurme olayindan; sizinti buraya hic gelmez. */
  emitDeath(burst: Omit<DeathBurst, "seed">) {
    if (this.deaths.length >= MAX_DEATH_BURSTS) this.deaths.shift();
    // Vurgu bir kez yere indiriliyor (karede renk donusumu yok).
    this.deaths.push({ ...burst, accent: groundHue(burst.color), seed: ++this.seed });
  }
  /** "tower" turu: kademe toreni, yerlestirme inisi ya da onay halkasi. */
  emitTowerMoment(moment: Omit<TowerMoment, "seed">) {
    if (this.moments.length >= MAX_TOWER_MOMENTS) this.moments.shift();
    this.moments.push({ ...moment, seed: ++this.seed });
  }
  /** "cast" turu: ulti atisinin sok dalgasi; yalnizca atanin ekraninda. */
  emitCastWave(wave: CastWave) {
    if (this.casts.length >= MAX_CAST_WAVES) this.casts.shift();
    this.casts.push({ ...wave });
  }
  /** Canli olum sayisi (duman ve iz dahil); olcum ve testler icin. */
  get liveDeaths() {
    return this.deaths.length;
  }
  /** Butun canli anlari birak (galeri sayfa degistirdi). */
  clear() {
    this.deaths.length = 0;
    this.moments.length = 0;
    this.casts.length = 0;
    this.graphics.clear();
    this.ground?.clear();
  }
  render(now: number, scale: number) {
    this.graphics.clear();
    this.ground?.clear();
    // Kule anlari en altta: sutun ve toz zemine ait, olum ve temas ustlerinden gecer.
    let write = 0;
    for (const moment of this.moments) {
      if (now - moment.bornAt >= moment.durationMs) continue;
      this.moments[write++] = moment;
      if (moment.kind === "tier") drawTierCeremony(this.graphics, moment, now);
      else if (moment.kind === "confirm") drawTowerConfirm(this.graphics, moment, now, scale);
      else drawTowerLanding(this.graphics, moment, now, scale);
    }
    this.moments.length = write;
    // Ulti dalgasi da zeminde: dusmanin olumu ve mermi temasi onun ustunde okunmali.
    write = 0;
    for (const wave of this.casts) {
      if (now - wave.bornAt >= wave.durationMs) continue;
      this.casts[write++] = wave;
      drawCastWave(this.graphics, wave, now, scale);
    }
    this.casts.length = write;
    // Olumler once: ayni yerdeki mermi temasi ustte kalsin.
    write = 0;
    for (const burst of this.deaths) {
      if (now - burst.bornAt >= getDeathLifeMs(burst, Boolean(this.ground), this.lod)) continue;
      this.deaths[write++] = burst;
      drawDeathBurst(this.graphics, burst, now, scale, this.ground, this.lod);
    }
    this.deaths.length = write;
  }
}
