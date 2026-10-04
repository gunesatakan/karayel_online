/**
 * Vurus sesleri: her vurus turunun (HitType) kendi sentez sesi.
 *
 * Oyunun en sik sesi bu: 20 kulelik bir dalgada saniyede onlarca temas.
 * Bu yuzden burada iki sey var:
 *
 * - Tarifler: tur basina kisa (40-160 ms) bir ses ve kademe katmanlari.
 *   Duz -> acilmis -> canli dili VFX'ten: sv 5-9 bir parilti ya da alt
 *   katman ekliyor, sv 10 kisa bir kuyruk ya da pirilti.
 * - Butce: ayni anda en fazla 6 vurus sesi, tur basina 70 ms aralik, tik
 *   (surekli isin, alan, sizinti) tur basina 150 ms'de bir. Takim
 *   arkadasinin kulesi kisik, dar butceli ve butce dolunca ilk o dusuyor.
 *
 * Saf mantik: saat disaridan, ses dugumu yok. Sentezi `FeedbackDirector`
 * yapiyor (ayni baglam, ayni "Efektler" kanali). `Math.random` yok; perde
 * kaymasi olay kimliginin FNV ozetinden, ayni vurus her istemcide ayni.
 *
 * Vurus turu olmayan kuleler (Baransel, Ulku, Omer, Onur 3-6) sessiz
 * kalmiyor ve tek bir genel sese de dusmuyor: sesleri VFX profilinin
 * siluetinden (kure, top, halka, ok).
 */
import {
  GAME_SPEED_MULTIPLIER,
  MELIS_CURSE_POOL_TICK_MS,
  ZEYNEP_SYNTHESIS_BURN_TICK_MS,
  towerCatalog,
  type BeamSnapshot,
  type DamageEventSnapshot,
  type HitType,
  type TowerDefinition
} from "@karayel/shared";
import { hitTypeCodex } from "./codex";
import { fnvUnit, toTier } from "./vfx/kit";
import { getProfileDefinitionId, getVfxProfile, isAttackingDefinition, type VfxProfile } from "./vfx/vfx-profiles";

/** Vurus turlerinin sesleri ve turu olmayan kulelerin siluet sesleri. */
export type HitVoiceId = Exclude<HitType, "none"> | "orb" | "ball" | "ring" | "dart";

export const HIT_VOICE_IDS: readonly HitVoiceId[] = [
  "projectile",
  "impact",
  "focus",
  "aura",
  "contamination",
  "curse",
  "wave",
  "slash",
  "orb",
  "ball",
  "ring",
  "dart"
];

/** Galeride ve tanida gorunen adlar; vurus adlari kodeksle ayni. */
export const HIT_VOICE_LABELS: Readonly<Record<HitVoiceId, string>> = {
  projectile: hitTypeCodex.projectile.name,
  impact: hitTypeCodex.impact.name,
  focus: hitTypeCodex.focus.name,
  aura: hitTypeCodex.aura.name,
  contamination: hitTypeCodex.contamination.name,
  curse: hitTypeCodex.curse.name,
  wave: hitTypeCodex.wave.name,
  slash: hitTypeCodex.slash.name,
  orb: "Küre",
  ball: "Gülle",
  ring: "Halka",
  dart: "Ok"
};

/** Osilator katmani: dalga, perde (istege bagli kayma), baslangic, sure, seviye. */
export type HitOscLayer = {
  type: "osc";
  wave: OscillatorType;
  from: number;
  to?: number;
  at: number;
  dur: number;
  gain: number;
  /** Atak suresi (sn); verilmezse 2 ms -- vurus kuru baslamali. */
  attack?: number;
};

/** Gurultu katmani: paylasilan gurultu tamponu, bir suzgecten geciyor. */
export type HitNoiseLayer = {
  type: "noise";
  filter: BiquadFilterType;
  from: number;
  to?: number;
  q: number;
  at: number;
  dur: number;
  gain: number;
  attack?: number;
};

export type HitLayer = HitOscLayer | HitNoiseLayer;

type VoiceDefinition = {
  layers: readonly HitLayer[];
  /**
   * Kademe katmanlarinin dili. "low": sv 5-9 alt (sub) ton, sv 10 kisa
   * gurultu kuyrugu. "high": sv 5-9 parilti, sv 10 iki kisa pirilti.
   */
  register: "low" | "high";
  /** Kademe katmanlarinin perdesi (Hz): sesin kendi renginde kalsin. */
  accent: number;
};

/**
 * Tarifler.
 *
 * Hepsi telefon hoparlorunde de okunmali: bas vurusu (250 Hz alti)
 * kulaklik icin, her seste 250 Hz ustunde de bir parca var. Mevcut odul
 * seslerinden (oldurme ucgen dususu, altin G6-C7, kritik kare dususu)
 * ayri dursunlar diye vuruslarin cogu gurultu tasiyor; ikisi tasimiyorsa
 * dalga turu ve suresiyle ayriliyor.
 */
const VOICES: Readonly<Record<HitVoiceId, VoiceDefinition>> = {
  // Mermi: kuru bir "tik" (dar bant gurultu) ve altinda kisa bir "tok".
  projectile: {
    register: "high",
    accent: 1560,
    layers: [
      { type: "noise", filter: "bandpass", from: 3400, q: 1.4, at: 0, dur: 0.022, gain: 0.11, attack: 0.001 },
      { type: "osc", wave: "sine", from: 520, to: 260, at: 0, dur: 0.055, gain: 0.1 },
      { type: "osc", wave: "triangle", from: 1250, to: 900, at: 0, dur: 0.03, gain: 0.03 }
    ]
  },
  // Carpma: alcak bir gumleme ve biraz bogulmus gurultu.
  impact: {
    register: "low",
    accent: 70,
    layers: [
      { type: "osc", wave: "sine", from: 140, to: 52, at: 0, dur: 0.13, gain: 0.22, attack: 0.003 },
      { type: "noise", filter: "lowpass", from: 1100, to: 280, q: 0.8, at: 0, dur: 0.08, gain: 0.14 },
      { type: "osc", wave: "triangle", from: 300, to: 150, at: 0, dur: 0.045, gain: 0.04 }
    ]
  },
  // Odak: dar, yukselen elektrikli bir "tzip". Lazerde nabiz gibi tekrarlaniyor.
  focus: {
    register: "high",
    accent: 2280,
    layers: [
      { type: "osc", wave: "sawtooth", from: 760, to: 1900, at: 0, dur: 0.042, gain: 0.04, attack: 0.001 },
      { type: "noise", filter: "highpass", from: 5200, q: 0.8, at: 0, dur: 0.018, gain: 0.06, attack: 0.001 },
      { type: "osc", wave: "square", from: 2850, at: 0.004, dur: 0.022, gain: 0.012 }
    ]
  },
  // Aura: yumusak atakli, havali bir parilti; iki yakin sinus 8 Hz'de dalgalaniyor.
  aura: {
    register: "high",
    accent: 2490,
    layers: [
      { type: "noise", filter: "bandpass", from: 2600, to: 3800, q: 7, at: 0, dur: 0.15, gain: 0.08, attack: 0.025 },
      { type: "osc", wave: "sine", from: 1245, at: 0, dur: 0.13, gain: 0.022, attack: 0.02 },
      { type: "osc", wave: "sine", from: 1253, at: 0, dur: 0.13, gain: 0.022, attack: 0.02 }
    ]
  },
  // Bulasma: islak, rezonansli bir "blop" ve iki kucuk kabarcik.
  contamination: {
    register: "high",
    accent: 840,
    layers: [
      { type: "noise", filter: "bandpass", from: 380, to: 1500, q: 9, at: 0, dur: 0.085, gain: 0.16, attack: 0.004 },
      { type: "osc", wave: "sine", from: 290, to: 560, at: 0, dur: 0.05, gain: 0.05 },
      { type: "osc", wave: "sine", from: 360, to: 720, at: 0.045, dur: 0.04, gain: 0.04 }
    ]
  },
  // Lanet: karanlik, yarim ton akortsuz iki alcak ton; ustte telefon icin ince bir kare.
  curse: {
    register: "low",
    accent: 58,
    layers: [
      { type: "osc", wave: "triangle", from: 116, to: 96, at: 0, dur: 0.16, gain: 0.09, attack: 0.006 },
      { type: "osc", wave: "triangle", from: 123, to: 101, at: 0, dur: 0.16, gain: 0.08, attack: 0.006 },
      { type: "osc", wave: "square", from: 232, to: 196, at: 0, dur: 0.12, gain: 0.018, attack: 0.006 }
    ]
  },
  // Dalga: yukari supuren bir gurultu ("vuus") ve sonunda ince bir hisirti.
  wave: {
    register: "low",
    accent: 90,
    layers: [
      { type: "noise", filter: "bandpass", from: 420, to: 2700, q: 1.3, at: 0, dur: 0.15, gain: 0.14, attack: 0.045 },
      { type: "noise", filter: "highpass", from: 3200, q: 0.7, at: 0.06, dur: 0.07, gain: 0.03, attack: 0.01 }
    ]
  },
  // Kesme: parlak bir savurma ve uyumsuz iki sinusle metal cinlamasi.
  slash: {
    register: "high",
    accent: 3136,
    layers: [
      { type: "noise", filter: "bandpass", from: 3000, to: 6800, q: 2.2, at: 0, dur: 0.05, gain: 0.09 },
      { type: "osc", wave: "sine", from: 2637, at: 0.012, dur: 0.11, gain: 0.028 },
      { type: "osc", wave: "sine", from: 3729, at: 0.012, dur: 0.075, gain: 0.018 }
    ]
  },
  // Kure (Baransel): yukselen bir buyu "pop"u ve yumusak bir puf.
  orb: {
    register: "high",
    accent: 2350,
    layers: [
      { type: "osc", wave: "square", from: 392, to: 784, at: 0, dur: 0.045, gain: 0.025 },
      { type: "osc", wave: "sine", from: 784, to: 1175, at: 0.01, dur: 0.085, gain: 0.06 },
      { type: "noise", filter: "lowpass", from: 1500, q: 0.7, at: 0, dur: 0.045, gain: 0.07 }
    ]
  },
  // Gulle (Omer): agir bir "klank" -- once metal (dar bant gurultu, kare
  // govde), bir an sonra alcak govde. Carpmanin gumlemesi once gelen bas;
  // burada once gelen metal.
  ball: {
    register: "low",
    accent: 52,
    layers: [
      { type: "noise", filter: "bandpass", from: 1900, q: 3.5, at: 0, dur: 0.04, gain: 0.09 },
      { type: "osc", wave: "square", from: 250, to: 165, at: 0, dur: 0.05, gain: 0.035 },
      { type: "osc", wave: "sine", from: 105, to: 46, at: 0.006, dur: 0.12, gain: 0.2 }
    ]
  },
  // Halka (Ulku): camsi bir can vurusu -- uyumsuz kismi sesli (x2.76) bir
  // sinus ve cok kisa bir cam "tink"i. Altin tinisindan (G6-C7, ucgen ve
  // arka arkaya iki nota) ayri: tek vurus, gurultulu baslangic.
  ring: {
    register: "high",
    accent: 2637,
    layers: [
      { type: "osc", wave: "sine", from: 1319, at: 0, dur: 0.14, gain: 0.05 },
      { type: "osc", wave: "sine", from: 3640, at: 0, dur: 0.07, gain: 0.018 },
      { type: "noise", filter: "highpass", from: 6000, q: 0.7, at: 0, dur: 0.012, gain: 0.03, attack: 0.001 }
    ]
  },
  // Ok (Onur'un oklari): yukselen bir islik ("fiyt") ve sonunda kuru bir tik.
  dart: {
    register: "high",
    accent: 2700,
    layers: [
      { type: "noise", filter: "highpass", from: 2600, to: 5200, q: 0.9, at: 0, dur: 0.032, gain: 0.07 },
      { type: "osc", wave: "sine", from: 1350, to: 2700, at: 0, dur: 0.04, gain: 0.035 },
      { type: "osc", wave: "triangle", from: 620, to: 420, at: 0.03, dur: 0.025, gain: 0.03 }
    ]
  }
};

/** Kademe 2 (sv 5-9): alcak seste alt ton, parlak seste parilti. */
function tierTwoLayers(voice: VoiceDefinition): HitLayer[] {
  if (voice.register === "low") {
    return [{ type: "osc", wave: "sine", from: voice.accent * 1.5, to: voice.accent, at: 0, dur: 0.11, gain: 0.08, attack: 0.004 }];
  }
  return [{ type: "osc", wave: "sine", from: voice.accent, at: 0.004, dur: 0.075, gain: 0.022, attack: 0.006 }];
}

/** Kademe 3 (sv 10): alcak seste kisa gurultu kuyrugu, parlak seste iki pirilti. */
function tierThreeLayers(voice: VoiceDefinition): HitLayer[] {
  if (voice.register === "low") {
    return [{ type: "noise", filter: "bandpass", from: voice.accent * 8, to: voice.accent * 4, q: 1.6, at: 0.05, dur: 0.17, gain: 0.035, attack: 0.02 }];
  }
  return [
    { type: "osc", wave: "sine", from: voice.accent * 1.5, at: 0.05, dur: 0.045, gain: 0.016 },
    { type: "osc", wave: "sine", from: voice.accent * 2, at: 0.085, dur: 0.05, gain: 0.012 }
  ];
}

const RECIPES = new Map<string, readonly HitLayer[]>();
const DURATIONS = new Map<string, number>();
for (const id of HIT_VOICE_IDS) {
  const voice = VOICES[id];
  const tiers: Array<readonly HitLayer[]> = [
    voice.layers,
    [...voice.layers, ...tierTwoLayers(voice)],
    [...voice.layers, ...tierTwoLayers(voice), ...tierThreeLayers(voice)]
  ];
  tiers.forEach((layers, index) => {
    const frozen = Object.freeze(layers.map((layer) => Object.freeze({ ...layer })));
    RECIPES.set(`${id}:${index + 1}`, frozen);
    DURATIONS.set(`${id}:${index + 1}`, frozen.reduce((end, layer) => Math.max(end, layer.at + layer.dur), 0));
  });
}

const RECIPE_KEYS: Readonly<Record<HitVoiceId, readonly [string, string, string]>> = Object.fromEntries(
  HIT_VOICE_IDS.map((id) => [id, [`${id}:1`, `${id}:2`, `${id}:3`] as const])
) as Record<HitVoiceId, readonly [string, string, string]>;

/**
 * Sesin kademedeki tarifi. Onceden kurulmus ve dondurulmus: vurus basina
 * dizi ya da nesne uretilmiyor.
 */
export function getHitVoiceRecipe(voice: HitVoiceId, tier: number | undefined): readonly HitLayer[] {
  return RECIPES.get(RECIPE_KEYS[voice][toTier(tier) - 1]) ?? [];
}

/** Tarifin suresi (sn): son katmanin bittigi an. */
export function getHitVoiceDuration(voice: HitVoiceId, tier: number | undefined) {
  return DURATIONS.get(RECIPE_KEYS[voice][toTier(tier) - 1]) ?? 0;
}

/* ------------------------------------------------------------------ */
/* Kuleden sese                                                         */
/* ------------------------------------------------------------------ */

const definitionsById = new Map<string, TowerDefinition>();
for (const towers of Object.values(towerCatalog)) {
  for (const tower of towers) {
    if (!definitionsById.has(tower.id)) definitionsById.set(tower.id, tower);
  }
}
const voiceCache = new Map<string, HitVoiceId | null>();

/**
 * Siluetten ses: vurus turu olmayan kuleler icin.
 *
 * Once siluet (kure, top, halka, ok), siluet ozel degilse carpma dili.
 * Hicbir yol sessizlige ya da tek bir genel sese inmiyor.
 */
export function getProfileHitVoice(profile: Pick<VfxProfile, "silhouette" | "impact">): HitVoiceId {
  switch (profile.silhouette) {
    case "orb": return "orb";
    case "ball": return "ball";
    case "ring": return "ring";
    case "dart": return "dart";
    default:
  }
  switch (profile.impact) {
    case "splash": return "orb";
    case "ripple": return "ring";
    case "collapse": return "ball";
    case "bolt": return "focus";
    case "shatter":
    case "slash": return "slash";
    case "curse": return "curse";
    case "brackets":
    case "fragments":
    default: return "dart";
  }
}

/**
 * Mermi, temas ya da isin kimliginden vurus sesi.
 *
 * Kimlik kulenin kimligine indiriliyor ("archer-6-whisper" -> archer-6);
 * kulenin vurus turu varsa o, yoksa VFX profilinin silueti. Kule olmayan
 * kimlikler (dusman atisi, ultiler) ve saldirmayan yapilar sessiz: onlar
 * bir kulenin vurusu degil.
 */
export function resolveHitVoice(definitionId: string | undefined): HitVoiceId | undefined {
  if (!definitionId) return undefined;
  const cached = voiceCache.get(definitionId);
  if (cached !== undefined) return cached ?? undefined;
  const id = getProfileDefinitionId(definitionId);
  const definition = definitionsById.get(id);
  let voice: HitVoiceId | null = null;
  if (definition && isAttackingDefinition(definition)) {
    voice = definition.hitType && definition.hitType !== "none"
      ? definition.hitType
      : getProfileHitVoice(getVfxProfile(id, definition.color));
  }
  voiceCache.set(definitionId, voice);
  return voice ?? undefined;
}

/* ------------------------------------------------------------------ */
/* Perde kaymasi                                                        */
/* ------------------------------------------------------------------ */

/**
 * Olay kimliginden hafif perde kaymasi: +-0.6 yarim ton.
 *
 * Ust uste gelen ayni vurus makineli tufek gibi tinlamasin diye; FNV ozeti
 * oldugu icin ayni olay her istemcide ve her calista ayni perdede.
 */
export function getHitPitchRatio(key: string | undefined) {
  if (!key) return 1;
  const unit = fnvUnit(key, 0x51);
  return 2 ** (((unit - 0.5) * 2 * HIT_SOUND_LIMITS.pitchSemitones) / 12);
}

/* ------------------------------------------------------------------ */
/* Butce                                                                */
/* ------------------------------------------------------------------ */

export const HIT_SOUND_LIMITS = {
  /** Ayni anda calan vurus sesi (odul seslerinin butcesinden ayri). */
  voices: 6,
  /** Takim arkadasinin kulelerinin ayni anda calan sesi. */
  teammateVoices: 3,
  /** Ayni turden iki vurus sesi arasi en kisa sure (ms). */
  gapMs: 70,
  /** Takim arkadasinda aralik bunun kati: daha seyrek. */
  teammateGapFactor: 1.6,
  /** Tik (surekli isin nabzi, alan, sizinti): tur basina bu aralikta bir. */
  tickGapMs: 150,
  /** Takim arkadasinin kulesinin seviyesi (kendi kulen 1). */
  teammateGain: 0.45,
  /** Perde kaymasinin genligi (yarim ton, iki yone). */
  pitchSemitones: 0.6,
  /** Sesin butcede kapladigi sureye eklenen pay (ms): sonme rampasi. */
  tailMs: 30
} as const;

/** Kendiliginden tik sayilan turler: alanin ve sizintinin vurusu zaten tik. */
const TICK_VOICES: ReadonlySet<HitVoiceId> = new Set<HitVoiceId>(["aura", "contamination"]);

const VOICE_INDEX = new Map<HitVoiceId, number>(HIT_VOICE_IDS.map((id, index) => [id, index]));

type HitSlot = { until: number; own: boolean };

/**
 * Vurus sesi butcesi.
 *
 * `admit` calinacak sesin yuvasini (0..voices-1) ya da -1 donduruyor. Yuva
 * doluysa ve kaldirilan ses takim arkadasininkiyse `stole` true: cagiran o
 * yuvadaki sesi kisip durduruyor. Yuvalar sabit; vurus basina nesne yok.
 *
 * Kurallar:
 * - Tur basina aralik (70 ms); takim arkadasinda 1.6 kati, kendi izinde.
 * - Tik ve alan/sizinti turleri tur basina 150 ms'de bir (birlesiyor).
 * - En fazla 6 ses; takim arkadasi en fazla 3.
 * - Dolu butcede kendi vurusun takim arkadasinin en eski sesinin yerini
 *   aliyor; takim arkadasininki ve tamamen kendi seslerinle dolu butcede
 *   gelen ses dusuyor (vurus sesi sik, birini kacirmak sorun degil).
 */
export class HitSoundGovernor {
  private readonly slots: HitSlot[] = [];
  private readonly lastOwnAt = new Float64Array(HIT_VOICE_IDS.length).fill(Number.NEGATIVE_INFINITY);
  private readonly lastTeamAt = new Float64Array(HIT_VOICE_IDS.length).fill(Number.NEGATIVE_INFINITY);
  private readonly lastOwnTickAt = new Float64Array(HIT_VOICE_IDS.length).fill(Number.NEGATIVE_INFINITY);
  private readonly lastTeamTickAt = new Float64Array(HIT_VOICE_IDS.length).fill(Number.NEGATIVE_INFINITY);
  /** Son `admit` canli bir takim arkadasi sesini mi kaldirdi. */
  stole = false;

  constructor(readonly limits: { voices: number; teammateVoices: number } = HIT_SOUND_LIMITS) {
    for (let index = 0; index < limits.voices; index += 1) {
      this.slots.push({ until: Number.NEGATIVE_INFINITY, own: true });
    }
  }

  get capacity() {
    return this.slots.length;
  }

  admit(voice: HitVoiceId, own: boolean, tick: boolean, durationMs: number, now: number): number {
    this.stole = false;
    const index = VOICE_INDEX.get(voice);
    if (index === undefined) return -1;
    const gap = HIT_SOUND_LIMITS.gapMs * (own ? 1 : HIT_SOUND_LIMITS.teammateGapFactor);
    const last = own ? this.lastOwnAt : this.lastTeamAt;
    if (now - last[index] < gap) return -1;
    const isTick = tick || TICK_VOICES.has(voice);
    const lastTick = own ? this.lastOwnTickAt : this.lastTeamTickAt;
    if (isTick && now - lastTick[index] < HIT_SOUND_LIMITS.tickGapMs) return -1;

    let free = -1;
    let liveTeam = 0;
    let oldestTeam = -1;
    for (let slot = 0; slot < this.slots.length; slot += 1) {
      const entry = this.slots[slot];
      if (entry.until <= now) {
        if (free < 0) free = slot;
        continue;
      }
      if (!entry.own) {
        liveTeam += 1;
        if (oldestTeam < 0 || entry.until < this.slots[oldestTeam].until) oldestTeam = slot;
      }
    }

    let chosen = free;
    if (!own && liveTeam >= this.limits.teammateVoices) return -1;
    if (chosen < 0) {
      if (!own || oldestTeam < 0) return -1;
      chosen = oldestTeam;
      this.stole = true;
    }

    const entry = this.slots[chosen];
    entry.until = now + durationMs;
    entry.own = own;
    last[index] = now;
    if (isTick) lastTick[index] = now;
    return chosen;
  }

  /** Canli ses sayisi; `own` verilirse yalnizca o taraf. */
  activeVoices(now: number, own?: boolean) {
    let count = 0;
    for (const entry of this.slots) {
      if (entry.until > now && (own === undefined || entry.own === own)) count += 1;
    }
    return count;
  }

  reset() {
    for (const entry of this.slots) entry.until = Number.NEGATIVE_INFINITY;
    this.lastOwnAt.fill(Number.NEGATIVE_INFINITY);
    this.lastTeamAt.fill(Number.NEGATIVE_INFINITY);
    this.lastOwnTickAt.fill(Number.NEGATIVE_INFINITY);
    this.lastTeamTickAt.fill(Number.NEGATIVE_INFINITY);
  }
}

/* ------------------------------------------------------------------ */
/* Isinlarin vurus ani                                                  */
/* ------------------------------------------------------------------ */

/** Surekli odak isininin (Debug Lazer, Oluler Bagi) nabiz araligi. */
export const FOCUS_BEAM_PULSE_MS = 190;
/**
 * Alan isinlarinin tik araligi (gercek zaman): sunucunun hasar tikiyle ayni
 * sabit, oyun hizina bolunmus (`scaleGameDuration`). Lanet havuzu 500, yanik
 * izi 333 oyun ms'si.
 */
export const AREA_BEAM_TICK_MS: Readonly<Record<string, number>> = {
  "archer-3-curse-pool": MELIS_CURSE_POOL_TICK_MS / GAME_SPEED_MULTIPLIER,
  "zeynep-3-burn-trail": ZEYNEP_SYNTHESIS_BURN_TICK_MS / GAME_SPEED_MULTIPLIER
};
/** Alanin icinde sayilmak icin dusman merkezine eklenen pay (carpisma yaricapi kadar). */
const AREA_ENEMY_MARGIN = 10;
/**
 * Ayni kimlikle yeniden atilan isin (`melis-curse-<kule>`): kalan omrun
 * artmasi yeni bir atis. Bir yeniden atis en fazla bu aralikta sayiliyor;
 * ara degerlenen omur birkac karede tirmaniyor.
 */
const REFIRE_GAP_MS = 150;
const REFIRE_TTL_RISE_MS = 15;

/** Kulede surup giden isinlar: dogusta bir kez degil, nabizla calar. */
const CONTINUOUS_BEAM_IDS: ReadonlySet<string> = new Set(["archer-4-underworld-link", ...Object.keys(AREA_BEAM_TICK_MS)]);
/** Kimligi her dalgada yeni ama omru her karede tazelenen isinlar: yalnizca dogus. */
const ONSET_ONLY_BEAM_IDS: ReadonlySet<string> = new Set(["zeynep-6", "zeynep-3-kin-wave"]);

export function isContinuousBeam(beam: Pick<BeamSnapshot, "definitionId">) {
  return CONTINUOUS_BEAM_IDS.has(beam.definitionId) || getVfxProfile(beam.definitionId).delivery === "laser";
}

/** Konumu olan herhangi bir sey: karedeki dusmanlar ya da galerinin yuruyuculeri. */
export type HitAreaOccupant = { readonly x: number; readonly y: number };

/**
 * Alan isininin icinde dusman var mi. Havuz bir nokta (`x1,y1`, yaricap
 * genisligin yarisi), iz bir dogru parcasi (genisligin yarisi kadar kalin).
 */
export function isAreaBeamOccupied(beam: Pick<BeamSnapshot, "x1" | "y1" | "x2" | "y2" | "width">, occupants: readonly HitAreaOccupant[]) {
  const reach = beam.width / 2 + AREA_ENEMY_MARGIN;
  const reachSq = reach * reach;
  const dx = beam.x2 - beam.x1;
  const dy = beam.y2 - beam.y1;
  const lengthSq = dx * dx + dy * dy;
  for (const occupant of occupants) {
    let t = 0;
    if (lengthSq > 0.0001) {
      t = ((occupant.x - beam.x1) * dx + (occupant.y - beam.y1) * dy) / lengthSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const ex = occupant.x - (beam.x1 + dx * t);
    const ey = occupant.y - (beam.y1 + dy * t);
    if (ex * ex + ey * ey <= reachSq) return true;
  }
  return false;
}

export type BeamHitSink = (beam: BeamSnapshot, voice: HitVoiceId, tick: boolean) => void;

const NO_OCCUPANTS: readonly HitAreaOccupant[] = [];

/**
 * Karenin isinlarindan vurus anlari.
 *
 * Isinlarin temas mesaji yok; vurus ani cizimden okunuyor ve cizimle ayni
 * karede (oynatma gecikmesinden sonra) caliyor:
 * - Tek atis isinlari (Gosteri, lanet, Kin dalgasi, infaz...): dogdugu
 *   karede bir kez; ayni kimlikle yeniden atilinca (omur artti) bir daha.
 * - Surekli odak isinlari (lazer, Oluler Bagi): gorundukce 190 ms'lik nabiz;
 *   vizilti degil, tik.
 * - Alan isinlari (lanet havuzu, yanik izi): sunucunun hasar tiki ritminde
 *   ve yalnizca karedeki bir dusman alanin icindeyse; bos alan sessiz.
 * Gorunmeyen isinin kaydi ayni karede siliniyor. Kare basina cagri
 * nesnesi yok: hedef sabit bir geri cagirma.
 */
export class BeamHitTracker {
  private readonly lastSeen = new Map<string, number>();
  private readonly lastPulse = new Map<string, number>();
  private readonly lastTtl = new Map<string, number>();
  private frame = 0;

  constructor(private readonly sink: BeamHitSink) {}

  /** `occupants`: karedeki dusmanlar (alan isinlari icin); verilmezse alanlar sessiz. */
  update(beams: readonly BeamSnapshot[], now: number, occupants: readonly HitAreaOccupant[] = NO_OCCUPANTS) {
    this.frame += 1;
    for (const beam of beams) {
      const voice = resolveHitVoice(beam.definitionId);
      if (!voice) continue;
      const seen = this.lastSeen.has(beam.id);
      this.lastSeen.set(beam.id, this.frame);
      const ttl = beam.ttlMs ?? 0;
      const previousTtl = this.lastTtl.get(beam.id);
      this.lastTtl.set(beam.id, ttl);
      const lastPulse = this.lastPulse.get(beam.id);
      if (isContinuousBeam(beam)) {
        const areaTick = AREA_BEAM_TICK_MS[beam.definitionId];
        const period = areaTick ?? FOCUS_BEAM_PULSE_MS;
        if (lastPulse !== undefined && now - lastPulse < period) continue;
        if (areaTick !== undefined && !isAreaBeamOccupied(beam, occupants)) continue;
        this.lastPulse.set(beam.id, now);
        this.sink(beam, voice, true);
        continue;
      }
      const refire = seen
        && !ONSET_ONLY_BEAM_IDS.has(beam.definitionId)
        && previousTtl !== undefined
        && ttl > previousTtl + REFIRE_TTL_RISE_MS
        && (lastPulse === undefined || now - lastPulse >= REFIRE_GAP_MS);
      if (!seen || refire) {
        this.lastPulse.set(beam.id, now);
        this.sink(beam, voice, false);
      }
    }
    this.lastSeen.forEach(this.forgetUnseen);
  }

  /** Izlenen isin sayisi; testler ve tani icin. */
  get size() {
    return this.lastSeen.size;
  }

  clear() {
    this.lastSeen.clear();
    this.lastPulse.clear();
    this.lastTtl.clear();
  }

  private readonly forgetUnseen = (stamp: number, id: string) => {
    if (stamp === this.frame) return;
    this.lastSeen.delete(id);
    this.lastPulse.delete(id);
    this.lastTtl.delete(id);
  };
}

/* ------------------------------------------------------------------ */
/* Gecikmeli carpma ve bicak                                           */
/* ------------------------------------------------------------------ */

/**
 * Oynatma gecikmesinin ustune taninan pay (ms). Kuyruk normalde gecikmede
 * bosaliyor; bundan gec bosalan carpma (sekme gizliyken biriken, geri
 * donunce hepsi birden akan) sessiz cizilir.
 */
export const STALE_HIT_SLACK_MS = 120;

/** Gecikmeli carpmanin sesi hala zamaninda mi: mesaj geldi + gecikme + pay. */
export function isHitSoundFresh(receivedAt: number, now: number, playbackDelayMs: number) {
  return now - receivedAt <= Math.max(0, playbackDelayMs) + STALE_HIT_SLACK_MS;
}

export type BladeTower = { readonly definitionId: string; readonly x: number; readonly y: number; readonly level: number; readonly ownerId: string };

/**
 * Bicak vurusunun (Testere) kademesi; olay bicak vurusu degilse `undefined`.
 *
 * Hangi olayin bicak temasi oldugunu sunucu soyluyor (`b`): kanama tiki,
 * yakindaki baska kule ve alan tikleri bayragi tasimiyor, uzak bicak ucu
 * tasiyor. Konum yalnizca kademeyi bulmak icin: vuranin en yakin
 * Testere'si; bulunamazsa kademe 1.
 */
export function getBladeHitTier(
  event: Pick<DamageEventSnapshot, "b" | "x" | "y">,
  towers: Iterable<BladeTower>,
  ownerId: string | undefined
): 1 | 2 | 3 | undefined {
  if (event.b !== 1) return undefined;
  let bestLevel = 1;
  let best = Number.POSITIVE_INFINITY;
  for (const tower of towers) {
    if (tower.definitionId !== BLADE_TOWER_ID || (ownerId !== undefined && tower.ownerId !== ownerId)) continue;
    const dx = tower.x - event.x;
    const dy = tower.y - event.y;
    const gap = dx * dx + dy * dy;
    if (gap < best) {
      best = gap;
      bestLevel = tower.level;
    }
  }
  return bestLevel >= 10 ? 3 : bestLevel >= 5 ? 2 : 1;
}

/** Yorunge bicakli kule (Testere) ve sesi: katalogdaki vurus turu, kesme. */
export const BLADE_TOWER_ID = "onur-1";
