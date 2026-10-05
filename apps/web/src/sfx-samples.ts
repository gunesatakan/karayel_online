/**
 * Kayitli savas sesleri: vurus, oldurme ve kritik ornekleri.
 *
 * Dosyalar `public/audio/sfx/` altinda, `tools/build-sfx.mjs` CC0 paketlerden
 * uretiyor (lisans ve kaynaklar oradaki LICENSE.txt ve manifest.json'da):
 * vuruslar Kenney'den (sert, mekanik), oldurmeler OpenGameArt'in ezilme ve
 * yaratik paketlerinden (organik). Hepsi ayni yukseklige esitlenmis; aileler
 * arasi denge burada, `gain` ile.
 *
 * Oldurme iki katman: her zaman bir govde (islak ezilme, dusmanin agirligina
 * gore) ve seyrek bir olum sesi (irka gore; `KillVoiceGate`). Meka dahil
 * hicbir oldurmede metal ya da patlama yok.
 *
 * Her vurus turunun ve siluet sesinin kendi ailesi var; aileler ayni kaynak
 * dosyayi paylasmiyor. Aile basina 2-3 cesit: art arda ayni cesit hic
 * gelmiyor ve hiz (perde) olay kimliginden +-4% kayiyor -- ayni vurus
 * makineli tufek gibi tinlamasin. `Math.random` yok, FNV.
 *
 * Kademe muzikal degil, agirlik: sv 5-9 biraz yavas ve dolgun, sv 10 daha
 * yavas, biraz daha yuksek ve altinda kisa bir govde vurusu (`heft`).
 *
 * Dosyalar yonetmen kurulurken indiriliyor, ilk dokunusta cozuluyor. Cozulurken
 * ornekli sesler sessiz; cozulemezse (ag, bicim) oyun sentez seslerine
 * dusuyor ve sonraki dokunusta yeniden deniyor. Hicbir yol hata firlatmiyor.
 */
import { isHeavyEnemyType, type EnemyRace, type EnemyType } from "@karayel/shared";
import type { HitVoiceId } from "./hit-sounds";
import { fnvUnit, toTier } from "./vfx/kit";

/** Oldurmenin govde katmani: dusmanin agirligina ve ucup ucmadigina gore. */
export type KillBodyFamily = "bodyLight" | "bodyHeavy" | "bodyAir";

const RACE_KEYS = {
  meka: "Meka",
  spaceBug: "SpaceBug",
  fourthDimensional: "FourthDimensional",
  holyGuardian: "HolyGuardian",
  fallen: "Fallen",
  golem: "Golem"
} as const satisfies Record<EnemyRace, string>;
type RaceKey = (typeof RACE_KEYS)[EnemyRace];

/** Oldurmenin ses katmani: irk x agirlik; ucanlarda irktan bagimsiz dusen ciglik. */
export type KillVoiceFamily = `voice${RaceKey}${"Light" | "Heavy"}` | "voiceAir";
export type KillSoundFamily = KillBodyFamily | KillVoiceFamily;
/** Odul seslerinden ornekli olanlar. */
export type SfxSampleFamily = KillSoundFamily | "crit";
export type SampleFamilyId = HitVoiceId | SfxSampleFamily | "heft";

/** Dosyalarin sunuldugu yer (vite `public/`). */
export const SFX_SAMPLE_BASE_URL = "/audio/sfx/";

export type SampleFamily = {
  /** Cesitler; `public/audio/sfx/` altinda. */
  readonly files: readonly string[];
  /** Ailenin seviyesi (dosyalar ayni yuksuklukte). */
  readonly gain: number;
  /** Galeride ve tanida gorunen ad. */
  readonly label: string;
};

const family = (name: string, count: number, gain: number, label: string): SampleFamily => Object.freeze({
  files: Object.freeze(Array.from({ length: count }, (_, index) => `${name}-${index + 1}.mp3`)),
  gain,
  label
});

/**
 * Aileler ve kaynaklari (secim gerekceleri build-sfx.mjs'de):
 * mermi orta metal, carpma agir metal, odak kucuk lazer, aura kuvvet alani,
 * bulasma balcik, lanet ezilmis bilgisayar gurultusu, dalga buyuk lazer,
 * kesme hafif metal, kure hafif cam, halka agir can (kisa), gulle celik
 * levha, ok ince sac.
 *
 * Seviyeler yerini aldiklari sentezle eslesik. Dosyalar -18 dBFS RMS'e
 * esitlendi; `gain` x dosyanin tepesi (etkin tepe) eski sentezin katman
 * toplamina yakin (0.15-0.35; tikler 0.15 civari) ve RMS'i ~-26 dBFS'i
 * (tiklerde -28) asmiyor: ezilmis lanet gibi yogun sesler tepeden degil
 * RMS'ten kisiliyor. Vurus kanali varsayilan 0.5 oldugu icin bir vurus
 * Efektler'de ~0.1-0.18 tepeyle; hafif oldurme ~0.2, agir ~0.3 -- olay
 * vurustan biraz one cikiyor, onu bastirmiyor.
 */
export const SAMPLE_FAMILIES: Readonly<Record<SampleFamilyId, SampleFamily>> = Object.freeze({
  projectile: family("projectile", 3, 0.4, "Mermi"),
  impact: family("impact", 3, 0.41, "Çarpma"),
  focus: family("focus", 2, 0.34, "Odak"),
  aura: family("aura", 2, 0.33, "Aura"),
  contamination: family("contamination", 2, 0.29, "Bulaşma"),
  curse: family("curse", 2, 0.34, "Lanet"),
  wave: family("wave", 2, 0.32, "Dalga"),
  slash: family("slash", 2, 0.22, "Kesme"),
  orb: family("orb", 2, 0.29, "Küre"),
  ring: family("ring", 2, 0.21, "Halka"),
  ball: family("ball", 2, 0.39, "Gülle"),
  dart: family("dart", 2, 0.22, "Ok"),
  // Sv 10 govdesi ana ornegin kazanc dugumune bagli (ayni yuva); dosya 6 dB kisik.
  heft: family("heft", 1, 1, "Sv 10 gövdesi"),
  crit: family("crit", 2, 0.18, "Kritik"),
  // Oldurme govdesi (squish paketi): etkin tepe hafif/hava ~0.18, agir ~0.26.
  bodyLight: family("kill-body-light", 3, 0.2, "Ölüm gövdesi (hafif)"),
  bodyHeavy: family("kill-body-heavy", 2, 0.31, "Ölüm gövdesi (ağır)"),
  bodyAir: family("kill-body-air", 2, 0.21, "Ölüm gövdesi (hava)"),
  // Olum sesi (yaratik paketleri): govdenin altinda; hafif ~0.13, agir ~0.18.
  voiceSpaceBugLight: family("kill-voice-spacebug-light", 2, 0.155, "Ölüm: böcek (hafif)"),
  voiceSpaceBugHeavy: family("kill-voice-spacebug-heavy", 2, 0.21, "Ölüm: böcek (ağır)"),
  voiceFourthDimensionalLight: family("kill-voice-fourth-light", 2, 0.15, "Ölüm: 4. boyut (hafif)"),
  voiceFourthDimensionalHeavy: family("kill-voice-fourth-heavy", 2, 0.21, "Ölüm: 4. boyut (ağır)"),
  voiceGolemLight: family("kill-voice-golem-light", 2, 0.26, "Ölüm: golem (hafif)"),
  voiceGolemHeavy: family("kill-voice-golem-heavy", 2, 0.265, "Ölüm: golem (ağır)"),
  voiceFallenLight: family("kill-voice-fallen-light", 2, 0.15, "Ölüm: düşmüş (hafif)"),
  voiceFallenHeavy: family("kill-voice-fallen-heavy", 2, 0.215, "Ölüm: düşmüş (ağır)"),
  voiceHolyGuardianLight: family("kill-voice-holy-light", 2, 0.155, "Ölüm: kutsal koruyucu (hafif)"),
  voiceHolyGuardianHeavy: family("kill-voice-holy-heavy", 2, 0.22, "Ölüm: kutsal koruyucu (ağır)"),
  voiceMekaLight: family("kill-voice-meka-light", 2, 0.155, "Ölüm: meka (hafif)"),
  voiceMekaHeavy: family("kill-voice-meka-heavy", 2, 0.21, "Ölüm: meka (ağır)"),
  voiceAir: family("kill-voice-air", 3, 0.165, "Ölüm: hava")
});

export const SAMPLE_FAMILY_IDS = Object.freeze(Object.keys(SAMPLE_FAMILIES) as SampleFamilyId[]);
export const ENEMY_RACES: readonly EnemyRace[] = Object.freeze(Object.keys(RACE_KEYS) as EnemyRace[]);
export const KILL_BODY_FAMILIES: readonly KillBodyFamily[] = Object.freeze(["bodyLight", "bodyHeavy", "bodyAir"] as KillBodyFamily[]);
export const KILL_VOICE_FAMILIES: readonly KillVoiceFamily[] = Object.freeze([
  ...ENEMY_RACES.flatMap((race) => [`voice${RACE_KEYS[race]}Light`, `voice${RACE_KEYS[race]}Heavy`] as KillVoiceFamily[]),
  "voiceAir" as KillVoiceFamily
]);
/** Oldurmenin butun aileleri (govde ve ses). */
export const KILL_SOUND_FAMILIES: readonly KillSoundFamily[] = Object.freeze([...KILL_BODY_FAMILIES, ...KILL_VOICE_FAMILIES]);

/** Oldurmenin agirlik sinifi. */
export type KillWeight = "light" | "heavy" | "air";

/**
 * Bir oldurmenin sesi: govde, ses ve sesin zorunlu olup olmadigi.
 * Onceden kurulmus ve dondurulmus; oldurme basina nesne yok.
 */
export type KillSoundCue = {
  readonly race: EnemyRace;
  readonly weight: KillWeight;
  readonly champion: boolean;
  readonly body: KillBodyFamily;
  /** Kendi oldurmende (ve sampiyonda) calan ses. */
  readonly voice: KillVoiceFamily;
  /** Takim arkadasinin oldurmesinde: her zaman kisa (hafif) ses. */
  readonly teammateVoice: KillVoiceFamily;
  /** Agir dusman ya da sampiyon: ses seyreltilmiyor. */
  readonly forceVoice: boolean;
};

const raceVoice = (race: EnemyRace, heavy: boolean) => `voice${RACE_KEYS[race]}${heavy ? "Heavy" : "Light"}` as KillVoiceFamily;

const KILL_CUES = Object.fromEntries(ENEMY_RACES.map((race) => [race, Object.fromEntries((["light", "heavy", "air"] as KillWeight[]).map((weight) => [
  weight,
  [false, true].map((champion) => Object.freeze<KillSoundCue>({
    race,
    weight,
    champion,
    body: weight === "heavy" ? "bodyHeavy" : weight === "air" ? "bodyAir" : "bodyLight",
    // Sampiyon her agirlikta irkin derin cigligiyla dusuyor.
    voice: champion || weight === "heavy" ? raceVoice(race, true) : weight === "air" ? "voiceAir" : raceVoice(race, false),
    teammateVoice: champion ? raceVoice(race, true) : weight === "air" ? "voiceAir" : raceVoice(race, false),
    forceVoice: champion || weight === "heavy"
  }))
]))])) as unknown as Record<EnemyRace, Record<KillWeight, readonly [KillSoundCue, KillSoundCue]>>;

/**
 * Oldurmenin sesi: dusmanin turu (agirlik), irki (ses), ucup ucmadigi ve
 * sampiyon olup olmadigi. Brute ve kusatma agir (derin ezilme, yavas ve uzun
 * olum sesi, her zaman); ucan dusman havada patlayan govde ve dusen bir
 * ciglik; digerleri kisa bir ezilme ve kisa bir ses. Irk bilinmiyorsa meka
 * (temel dusmanlarin irki).
 */
export function getKillSoundCue(type: EnemyType | undefined, race: EnemyRace | undefined, air = false, champion = false): KillSoundCue {
  const weight: KillWeight = type && isHeavyEnemyType(type) ? "heavy" : air ? "air" : "light";
  const cues = KILL_CUES[race && race in KILL_CUES ? race : "meka"][weight];
  return champion ? cues[1] : cues[0];
}

/** Galeride dinlenebilen oldurme sesleri: irk x (hafif, agir) ve hava. */
export const GALLERY_KILL_CUES: ReadonlyArray<{ readonly id: string; readonly label: string; readonly cue: KillSoundCue }> = Object.freeze([
  ...ENEMY_RACES.flatMap((race) => (["light", "heavy"] as KillWeight[]).map((weight) => {
    const cue = KILL_CUES[race][weight][0];
    return Object.freeze({ id: `kill:${race}:${weight}`, label: SAMPLE_FAMILIES[cue.voice].label, cue });
  })),
  Object.freeze({ id: "kill:air", label: SAMPLE_FAMILIES.voiceAir.label, cue: KILL_CUES.meka.air[0] })
]);

/**
 * Olum sesinin seyrekligi. Govde her oldurmede caliyor; ses kalabalik bir
 * dalgada koroya donmesin diye:
 * - kendi oldurmen: en fazla 333 ms'de bir (saniyede ~3) ve olay kimliginden
 *   (FNV) %70 olasilikla;
 * - takim arkadasi: en fazla saniyede bir, %50 ve hep kisa (hafif) ses;
 * - agir dusman (kendi) ve sampiyon her zaman; ama iki ses arasi en az 120 ms
 *   (ulti 60 dusmani ayni karede oldurdugunde bile ust uste en fazla birkac
 *   ses). Sampiyon bu siniri da geciyor: dalgada bir kez.
 */
export const KILL_VOICE_LIMITS = Object.freeze({
  ownGapMs: 333,
  teammateGapMs: 1000,
  ownChance: 0.7,
  teammateChance: 0.5,
  minGapMs: 120
});

export class KillVoiceGate {
  private lastOwn = Number.NEGATIVE_INFINITY;
  private lastTeam = Number.NEGATIVE_INFINITY;
  private lastAny = Number.NEGATIVE_INFINITY;

  /** Bu oldurme ses calsin mi; durum degismiyor (`commit` calinca). */
  check(own: boolean, cue: Pick<KillSoundCue, "forceVoice" | "champion">, key: string | undefined, now: number) {
    if (cue.champion) return true;
    if (now - this.lastAny < KILL_VOICE_LIMITS.minGapMs) return false;
    if (own && cue.forceVoice) return true;
    if (now - (own ? this.lastOwn : this.lastTeam) < (own ? KILL_VOICE_LIMITS.ownGapMs : KILL_VOICE_LIMITS.teammateGapMs)) return false;
    if (key === undefined) return true;
    return fnvUnit(key, 0x7a) < (own ? KILL_VOICE_LIMITS.ownChance : KILL_VOICE_LIMITS.teammateChance);
  }

  commit(own: boolean, now: number) {
    this.lastAny = now;
    if (own) this.lastOwn = now;
    else this.lastTeam = now;
  }

  reset() {
    this.lastOwn = Number.NEGATIVE_INFINITY;
    this.lastTeam = Number.NEGATIVE_INFINITY;
    this.lastAny = Number.NEGATIVE_INFINITY;
  }
}

/* ------------------------------------------------------------------ */
/* Kademe ve cesit                                                      */
/* ------------------------------------------------------------------ */

export type SampleTierShape = {
  /** Hiz carpani: <1 daha agir (perde de iner, muzikal adim degil). */
  readonly rate: number;
  readonly gain: number;
  /** Sv 10 govde katmani calsin mi. */
  readonly heft: boolean;
};

/** Kademe 1 (sv 1-4), 2 (sv 5-9), 3 (sv 10). Ince: ayni ses, daha agir. */
export const SAMPLE_TIERS: readonly [SampleTierShape, SampleTierShape, SampleTierShape] = Object.freeze([
  Object.freeze({ rate: 1, gain: 1, heft: false }),
  Object.freeze({ rate: 0.96, gain: 1.1, heft: false }),
  Object.freeze({ rate: 0.93, gain: 1.2, heft: true })
]) as unknown as readonly [SampleTierShape, SampleTierShape, SampleTierShape];

export function getSampleTier(tier: number | undefined): SampleTierShape {
  return SAMPLE_TIERS[toTier(tier) - 1];
}

/** Olay kimliginden hiz kaymasinin genligi (iki yone, oran). */
export const SAMPLE_RATE_SPREAD = 0.04;

/** Olay kimliginden hafif hiz kaymasi: deterministik, +-4%. */
export function getSampleRateJitter(key: string | undefined) {
  if (!key) return 1;
  return 1 + (fnvUnit(key, 0x5a) - 0.5) * 2 * SAMPLE_RATE_SPREAD;
}

/**
 * Siradaki cesit: bir oncekiyle hic ayni degil. Atlama olay kimliginden
 * (yoksa bir sonraki); iki cesitli ailede ikisi sirayla.
 */
export function nextSampleVariant(count: number, previous: number, key: string | undefined) {
  if (count <= 1) return 0;
  const skip = key ? 1 + Math.floor(fnvUnit(key, 0x3c) * (count - 1)) : 1;
  return ((previous < 0 ? -1 : previous) + skip + count) % count;
}

/**
 * Oldurme kombosu sesi yukseltmiyor (perde yok); kalabalik bir zincirde
 * yalnizca biraz dolgunlasiyor: basamak basina +2%, en fazla +16%.
 */
export function getKillComboGain(step: number) {
  const clamped = Math.max(0, Math.min(8, Math.floor(Number.isFinite(step) ? step : 0)));
  return 1 + clamped * 0.02;
}

/* ------------------------------------------------------------------ */
/* Yukleme                                                              */
/* ------------------------------------------------------------------ */

export type SampleLoader = (url: string) => Promise<ArrayBuffer>;

type DecodeContext = Pick<BaseAudioContext, "decodeAudioData">;

const defaultLoader: SampleLoader | undefined = typeof fetch === "function"
  ? (url) => fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.arrayBuffer();
  })
  : undefined;

/**
 * Eski Safari `decodeAudioData`'yi yalnizca geri cagirmayla taniyor;
 * yenileri soz donduruyor. Ikisi de burada; hangisi once gelirse.
 */
function decode(context: DecodeContext, data: ArrayBuffer) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    try {
      const result = context.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (result && typeof result.then === "function") result.then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

/** Bozuk ya da gelmeyen bir dosyanin en fazla deneme sayisi (her acilista bir). */
export const SAMPLE_MAX_ATTEMPTS = 3;
/**
 * Bastaki kodlayici dolgusu (MP3 ~25 ms) ve sessizlik icin taranan en uzun
 * sure ve esik (-54 dBFS). Tarayici dolguyu kirpsa da kirpmasa da (Safari'de
 * kesin degil) ornek ilk duyulan ornekten basliyor; vurus cizimle ayni anda.
 */
const LEAD_SCAN_SECONDS = 0.06;
const LEAD_THRESHOLD = 0.002;

type FileEntry = {
  readonly family: SampleFamilyId;
  readonly file: string;
  state: "idle" | "decoding" | "ready" | "failed";
  attempts: number;
  /** Onceden indirilen veri; cozme onu tuketiyor (tampon devrediliyor). */
  data?: Promise<ArrayBuffer>;
};

/** Ornegin bastaki dolgusu (sn): ilk duyulan ornege kadar; kanal okunamazsa 0. */
export function findSampleLead(buffer: AudioBuffer) {
  if (typeof buffer.getChannelData !== "function" || !(buffer.sampleRate > 0)) return 0;
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.floor(buffer.sampleRate * LEAD_SCAN_SECONDS));
  for (let index = 0; index < limit; index += 1) {
    if (data[index] > LEAD_THRESHOLD || data[index] < -LEAD_THRESHOLD) return index / buffer.sampleRate;
  }
  return 0;
}

/**
 * Cozulmus orneklerin deposu: dosya basina tek AudioBuffer.
 *
 * - `prefetch`: dosyalar yonetmen kurulurken indiriliyor (dokunus gerekmez).
 * - `load`: ilk dokunusta cozuluyor -- baglam askida olsa da
 *   (`decodeAudioData` askidaki baglamda da calisiyor). Gelmeyen ya da
 *   cozulemeyen dosya sonraki acilista yeniden deneniyor, en fazla
 *   `SAMPLE_MAX_ATTEMPTS` kez.
 * - Bir dosya gelmezse yalnizca o cesit eksik; ailenin hicbiri yoksa `has`
 *   false. Aile hala cozuluyorsa `isLoading` true: cagiran o kisa anda
 *   sentez yerine sessiz kaliyor (ses rengi savasin ortasinda degismesin).
 */
export class SampleBank {
  private readonly entries: FileEntry[] = [];
  private readonly ready = new Map<SampleFamilyId, AudioBuffer[]>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly leads = new WeakMap<AudioBuffer, number>();
  private readonly longest = new Map<SampleFamilyId, number>();
  private readonly cursor = new Map<SampleFamilyId, number>();

  constructor(private readonly loader: SampleLoader | undefined = defaultLoader, private readonly baseUrl = SFX_SAMPLE_BASE_URL) {
    for (const id of SAMPLE_FAMILY_IDS) {
      for (const file of SAMPLE_FAMILIES[id].files) {
        this.entries.push({ family: id, file, state: "idle", attempts: 0 });
      }
    }
  }

  /** Cozulemeyen ama yeniden denenecek dosya var mi. */
  get retryable() {
    return this.entries.some((entry) => entry.state === "failed" && entry.attempts < SAMPLE_MAX_ATTEMPTS);
  }

  /** Henuz cozulemeyen dosya sayisi (tani). */
  get failed() {
    return this.entries.filter((entry) => entry.state === "failed").length;
  }

  /** Dosyalari simdiden indir (cozmeden). Yukleyici yoksa hicbir sey. */
  prefetch() {
    if (!this.loader) return;
    for (const entry of this.entries) {
      if (entry.state === "idle" && !entry.data) entry.data = this.fetch(entry);
    }
  }

  /**
   * Hazir olmayan dosyalari coz. Baglamda `decodeAudioData` yoksa ya da
   * yukleyici yoksa hicbir sey (oyun sentezle). Cozulmekte olan dosya
   * ikinci kez baslatilmiyor. Donen soz o turun bitisi; oyun beklemiyor.
   */
  load(context: DecodeContext | undefined): Promise<void> {
    if (!context || typeof context.decodeAudioData !== "function" || !this.loader) {
      return Promise.resolve();
    }
    const jobs: Array<Promise<void>> = [];
    for (const entry of this.entries) {
      if (entry.state === "ready" || entry.state === "decoding" || entry.attempts >= SAMPLE_MAX_ATTEMPTS) continue;
      entry.attempts += 1;
      entry.state = "decoding";
      const data = entry.data ?? this.fetch(entry);
      entry.data = undefined;
      jobs.push(data
        .then((bytes) => decode(context, bytes))
        .then((buffer) => this.accept(entry, buffer))
        .catch(() => {
          entry.state = "failed";
        }));
    }
    return Promise.all(jobs).then(() => undefined);
  }

  /** Ailenin en az bir cesidi hazir mi. */
  has(id: SampleFamilyId) {
    return (this.ready.get(id)?.length ?? 0) > 0;
  }

  /** Aile henuz hazir degil ama cesitlerinden biri su an indiriliyor ya da cozuluyor. */
  isLoading(id: SampleFamilyId) {
    if (this.has(id)) return false;
    for (const entry of this.entries) {
      if (entry.family === id && entry.state === "decoding") return true;
    }
    return false;
  }

  /** Hazir cesitlerin en uzunu (sn, bastaki dolgu haric); butce bu sureyle tutuluyor. */
  duration(id: SampleFamilyId) {
    return this.longest.get(id) ?? 0;
  }

  /** Ornegin calmaya baslayacagi yer (sn): bastaki kodlayici dolgusu atlaniyor. */
  lead(buffer: AudioBuffer) {
    return this.leads.get(buffer) ?? 0;
  }

  /**
   * Siradaki cesit (bir oncekiyle ayni degil). Yalnizca calinacaksa cagir:
   * sirayi ilerletiyor.
   */
  pick(id: SampleFamilyId, key: string | undefined): AudioBuffer | undefined {
    const list = this.ready.get(id);
    if (!list || list.length === 0) return undefined;
    const index = nextSampleVariant(list.length, this.cursor.get(id) ?? -1, key);
    this.cursor.set(id, index);
    return list[index];
  }

  /** Dosya adiyla tek ornek (tani ve testler). */
  get(file: string) {
    return this.buffers.get(file);
  }

  private fetch(entry: FileEntry) {
    const loader = this.loader!;
    const data = Promise.resolve().then(() => loader(this.baseUrl + entry.file));
    // Onceden indirme basarisiz olabilir; hatayi `load` okuyor, yakalanmamis soz kalmasin.
    data.catch(() => undefined);
    return data;
  }

  private accept(entry: FileEntry, buffer: AudioBuffer) {
    if (!buffer || !(buffer.duration > 0)) throw new Error(`${entry.file}: bos`);
    const lead = Math.min(findSampleLead(buffer), buffer.duration * 0.5);
    this.leads.set(buffer, lead);
    this.buffers.set(entry.file, buffer);
    entry.state = "ready";
    // Cesit sirasi dosya sirasiyla ayni kalsin (cozme sirasi degisken).
    const order = SAMPLE_FAMILIES[entry.family].files;
    const list = order.map((name) => this.buffers.get(name)).filter((item): item is AudioBuffer => Boolean(item));
    this.ready.set(entry.family, list);
    this.longest.set(entry.family, Math.max(this.longest.get(entry.family) ?? 0, buffer.duration - lead));
  }
}
