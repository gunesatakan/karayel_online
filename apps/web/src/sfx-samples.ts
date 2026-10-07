/**
 * Kayitli savas sesleri: vurus, oldurme ve kritik ornekleri.
 *
 * Dosyalar `public/audio/sfx/` altinda, `tools/build-sfx.mjs` Kenney'nin CC0
 * paketlerinden uretiyor (lisans ve kaynaklar oradaki LICENSE.txt ve
 * manifest.json'da). Hepsi ayni yukseklige esitlenmis; aileler arasi denge
 * burada, `gain` ile.
 *
 * Dusman oldurmesi tek bir "portal" sesi: yarik acilip dusmani yutuyor
 * (tools/sfx-portal.mjs). Boy dusmandan (`getKillSoundCue`): siradan ve
 * ucan dusman kucuk, agir (kaba, kusatma) normal, sampiyon buyuk. Her boyun
 * iki cesidi iki tarz: A "rift whoosh" ve D "pulse thrum"; ayni cesit art arda
 * gelmedigi icin ikisi sirayla caliyor. Yogunlugu `KillSoundLimiter` tutuyor.
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
import { isHeavyEnemyType, type EnemyType } from "@karayel/shared";
import type { HitVoiceId } from "./hit-sounds";
import { fnvUnit, toTier } from "./vfx/kit";
import { assetUrl } from "./asset-url";

/** Oldurme portal sesinin boyu. */
export type KillPortalSize = "small" | "normal" | "large";
/** Oldurme sesinin ailesi: boy basina bir aile, iki cesit (A ve D). */
export type KillSoundFamily = "portalSmall" | "portalNormal" | "portalLarge";
/** Odul seslerinden ornekli olanlar. */
export type SfxSampleFamily = KillSoundFamily | "crit" | "execute";
export type SampleFamilyId = HitVoiceId | SfxSampleFamily | "heft";

/** Dosyalarin sunuldugu yer (vite `public/`). */
export const SFX_SAMPLE_BASE_URL = assetUrl("audio/sfx/");

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

/** Oldurme portal tarzlari (build-sfx.mjs ile ayni sira): A "rift whoosh", D "pulse thrum". */
export const KILL_PORTAL_STYLES = Object.freeze(["a", "d"] as const);

/** Portal ailesi: boyun iki tarzi iki cesit (`death-portal-a-small.mp3`, `death-portal-d-small.mp3`). */
const portalFamily = (size: KillPortalSize, gain: number, label: string): SampleFamily => Object.freeze({
  files: Object.freeze(KILL_PORTAL_STYLES.map((style) => `death-portal-${style}-${size}.mp3`)),
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
 * Efektler'de ~0.1-0.18 tepeyle. Oldurme portali RMS'te en yuksek vurusun
 * biraz ustunde (bkz. portal aileleri) -- olay vurustan one cikiyor, onu
 * bastirmiyor.
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
  // Execute infazi: hafif metalin kilit tiki + agir yumruk darbesi (Kenney).
  // Etkin tepe ~0.22-0.26: eski agir oldurme govdesinin seviyesi.
  execute: family("execute", 2, 0.34, "Execute infazı"),
  // Oldurme portali. Dosyalar -20 LUFS; kazanc eski govde + olum sesi
  // karisiminin algilanan seviyesine gore (100 ms'lik pencerede en yuksek
  // K-agirlikli RMS ve 400 ms'lik anlik yukseklik, ikisi de olculdu): eski
  // hafif oldurme (govde 0.2 + ses 0.155) ~0.19-0.2'ye, eski agir oldurme
  // (govde 0.31 + derin ses 0.21) ~0.39-0.47'ye denk. Portal sesi uzun
  // (0.37-0.87 sn), yani agir boy olcumun alt ucunda. Sampiyon biraz ustte.
  portalSmall: portalFamily("small", 0.2, "Ölüm portalı (küçük)"),
  portalNormal: portalFamily("normal", 0.36, "Ölüm portalı (ağır)"),
  portalLarge: portalFamily("large", 0.42, "Ölüm portalı (şampiyon)")
});

export const SAMPLE_FAMILY_IDS = Object.freeze(Object.keys(SAMPLE_FAMILIES) as SampleFamilyId[]);
/** Oldurme sesinin aileleri (kucukten buyuge). */
export const KILL_SOUND_FAMILIES: readonly KillSoundFamily[] = Object.freeze(["portalSmall", "portalNormal", "portalLarge"] as KillSoundFamily[]);

/** Oldurmenin agirlik sinifi. */
export type KillWeight = "light" | "heavy" | "air";

/**
 * Ucan dusmanin portal sesi: kucuk boy, biraz tiz (calma hizi carpani; dosya
 * yok, ayni ornek). Olay kimliginden gelen +-4% bunun ustune.
 */
export const KILL_AIR_RATE = 1.06;

/**
 * Bir oldurmenin sesi: aile (boy), calma hizi carpani ve sampiyon mu.
 * Onceden kurulmus ve dondurulmus; oldurme basina nesne yok.
 */
export type KillSoundCue = {
  readonly weight: KillWeight;
  readonly champion: boolean;
  readonly size: KillPortalSize;
  readonly family: KillSoundFamily;
  /** Calma hizi carpani (hava 1.06, digerleri 1). */
  readonly rate: number;
};

const SIZE_FAMILY: Readonly<Record<KillPortalSize, KillSoundFamily>> = Object.freeze({ small: "portalSmall", normal: "portalNormal", large: "portalLarge" });

const KILL_CUES = Object.fromEntries((["light", "heavy", "air"] as KillWeight[]).map((weight) => [
  weight,
  [false, true].map((champion) => {
    // Sampiyon her agirlikta buyuk; agir dusman normal; siradan ve ucan kucuk.
    const size: KillPortalSize = champion ? "large" : weight === "heavy" ? "normal" : "small";
    return Object.freeze<KillSoundCue>({
      weight,
      champion,
      size,
      family: SIZE_FAMILY[size],
      rate: weight === "air" && !champion ? KILL_AIR_RATE : 1
    });
  })
])) as unknown as Record<KillWeight, readonly [KillSoundCue, KillSoundCue]>;

/**
 * Oldurmenin sesi: dusmanin turu (agirlik), ucup ucmadigi ve sampiyon olup
 * olmadigi. Brute ve kusatma agir (normal portal), sampiyon buyuk portal,
 * digerleri (ucan dahil) kucuk portal; ucan biraz tiz.
 */
export function getKillSoundCue(type: EnemyType | undefined, air = false, champion = false): KillSoundCue {
  const weight: KillWeight = type && isHeavyEnemyType(type) ? "heavy" : air ? "air" : "light";
  const cues = KILL_CUES[weight];
  return champion ? cues[1] : cues[0];
}

/** Galeride dinlenebilen oldurme sesleri: kucuk, hava, agir, sampiyon (A ve D sirayla). */
export const GALLERY_KILL_CUES: ReadonlyArray<{ readonly id: string; readonly label: string; readonly cue: KillSoundCue }> = Object.freeze([
  Object.freeze({ id: "kill:small", label: "Ölüm portalı: küçük (A/D sırayla)", cue: KILL_CUES.light[0] }),
  Object.freeze({ id: "kill:air", label: "Ölüm portalı: hava (küçük, tiz)", cue: KILL_CUES.air[0] }),
  Object.freeze({ id: "kill:normal", label: "Ölüm portalı: ağır (A/D sırayla)", cue: KILL_CUES.heavy[0] }),
  Object.freeze({ id: "kill:large", label: "Ölüm portalı: şampiyon (A/D sırayla)", cue: KILL_CUES.light[1] })
]);

/**
 * Oldurme sesinin yogunlugu. Portal sesi 0.37-0.87 sn suruyor; kalabalik bir
 * dalgada (ulti 60 dusmani ayni karede oldururken) ust uste binip camura
 * donmesin diye son `windowMs` icinde baslayan oldurme sesi sayisi sinirli:
 * - kendi oldurmen: saniyede en fazla `ownPerSecond` (6);
 * - takim arkadasi: saniyede en fazla `teammatePerSecond` (2; zaten kisik);
 * - sampiyon her zaman (sinira bakmiyor, ama sayiliyor).
 * Sinirin ustundeki oldurme sessiz: gorseli ve sayisi yine cikiyor, sesi
 * oncekilerin kuyrugunda zaten duyuluyor. Kendi ve takim sayaclari ayri:
 * arkadasin oldurmesi senin sesini kesmiyor. `Math.random` yok.
 */
export const KILL_SOUND_LIMITS = Object.freeze({
  ownPerSecond: 6,
  teammatePerSecond: 2,
  windowMs: 1000
});

/** Son N baslangic zamani; halka dizisi, oldurme basina nesne yok. */
class StartRing {
  private readonly times: number[];
  private cursor = 0;

  constructor(size: number) {
    this.times = Array.from({ length: size }, () => Number.NEGATIVE_INFINITY);
  }

  /** Son `windowMs` icinde `size` ses basladiysa dolu. */
  isFull(now: number, windowMs: number) {
    return now - this.times[this.cursor] < windowMs;
  }

  push(now: number) {
    this.times[this.cursor] = now;
    this.cursor = (this.cursor + 1) % this.times.length;
  }

  reset() {
    this.times.fill(Number.NEGATIVE_INFINITY);
    this.cursor = 0;
  }
}

export class KillSoundLimiter {
  private readonly own = new StartRing(KILL_SOUND_LIMITS.ownPerSecond);
  private readonly team = new StartRing(KILL_SOUND_LIMITS.teammatePerSecond);

  /** Bu oldurme ses calsin mi; durum degismiyor (`commit` calinca). */
  check(own: boolean, champion: boolean, now: number) {
    if (champion) return true;
    return !(own ? this.own : this.team).isFull(now, KILL_SOUND_LIMITS.windowMs);
  }

  commit(own: boolean, now: number) {
    (own ? this.own : this.team).push(now);
  }

  reset() {
    this.own.reset();
    this.team.reset();
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
