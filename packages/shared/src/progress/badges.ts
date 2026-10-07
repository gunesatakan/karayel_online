import { FINAL_WAVE, type KillStreakTier } from "../balance/index.js";
import { towerCatalog } from "../characters/index.js";
import { getUltimateStampText, type UltimateResultMessage } from "../feedback/ultimate.js";
import { lt } from "../i18n/index.js";
import type { CharacterId } from "../index.js";
import { getKillStreakTierRank, type RunPlayerSummary, type RunSummary, type WaveRecord } from "../run-trace/index.js";
import { STAGE_COUNT, canRecordProgress, getStageDamageProfile, shouldRecordStageClear, type ProgressRecordSource } from "../stages/index.js";
import { SYNERGY_SHARE_RUN_FLOOR } from "../synergy/index.js";
import { TOWER_TIER_2_LEVEL, TOWER_TIER_3_LEVEL } from "../tower-stats/index.js";
import { getArchiveProgress, type CardArchive } from "./archive.js";
import { isRecordCharacterId, parseRecordKey, type RecordBook } from "./records.js";
import { sanitizeWaveRecord } from "./wave-report.js";

/**
 * Nisanlar: kosunun gercek olgularindan acilan, kosulu acikca yazili hedefler.
 *
 * Kural burada, depo istemcide (apps/web/src/progress-store.ts). Ayrim testler
 * icin: her kosul, kuyruk ve depo bicimi tarayici olmadan dogrulanabilsin.
 *
 * Her nisan zaten var olan bir olgudan okunuyor; sunucuya yeni bir veri
 * eklenmedi:
 * - kosu defteri (`wave:report` karnesi ve mac sonu `RunSummary`);
 * - rekor defteri ve Kart Arsivi (menude ve mac sonunda);
 * - istemcinin zaten aldigi anlik goruntu alanlari (kule seviyesi, Zeynep
 *   dizilimi, Melis evrimi, Onur zari) ve tek seferlik mesajlar
 *   (`ultimate:result`, `link:matured`, `champion:down`).
 *
 * Kurallar:
 * - Hepsi taninma. Hicbir nisan stat, altin, kart ya da baslangic kulesi
 *   vermiyor; acabildigi tek sey kozmetik (`cosmetics.ts`) ve operatorun
 *   imza nisani icin ustalik puani (`mastery.ts`).
 * - Bekleme ya da hacim nisani yok: toplam altin, yetenek kullanim sayisi ya da
 *   oynama suresi yok. Gunluk seri, suresi dolan gorev, rastgele dusen nisan da
 *   yok; kazanilan nisan hic kaybolmuyor.
 * - Tek bilincli istisna Arşivci (onaylanan tasarimda): bir sayac ama sayilan
 *   sey kesif -- kac farkli kart gorduğun, kac kez oynadigin degil. Ayni karti
 *   ust uste gormek ilerletmiyor; esik (50/113) tam arsivin cok altinda, yani
 *   uzun bir hacim hedefi degil, kart cesitliligini denemenin taninmasi.
 * - Nisan yalnizca canli gorulen kosu parcasindan: mac ortasinda katilan ya da
 *   kopan birinin yuvasini devralan oyuncu (`firstLiveWave` > 1) kendinden
 *   onceki dalgalari, yuvanin eski olgularini (seri, pay, en iyi kule) ve
 *   miras kulelerin seviyesini almiyor. Butun kosuyu isteyen nisanlar
 *   (`wholeRun`) ona hic acilmiyor.
 * - Yalnizca co-op'ta alinabilen nisan yok: hepsi tek basina da alinabiliyor.
 * - Yaratici kosu hicbir nisan acmiyor (`checkBadgeRecordable`), rekor ve
 *   yildizla ayni kapi.
 * - Olcumde hic gorulmeyen olgular (LEGENDARY serisi, 10. seviye kule,
 *   20/20 temiz dalga) yalnizca "uzun vadeli" nisan: zorunlu bir hedef degil.
 * - Nisan bildirimi dalga ortasinda hicbir sey acmiyor; dalga temizleme
 *   anina ve kosu raporuna kuyruklaniyor (`BadgeNoticeQueue`).
 */

/** Deponun bicim surumu; anahtar da surumlu (`karayel_badges_v1`). */
export const BADGE_BOOK_VERSION = 1;

/** Arsivci: bu kadar farkli kart gorulmus olmali (katalog 137; esik bilerek sabit). */
export const ARCHIVIST_CARD_TARGET = 50;
/** Kesintisiz: tek kosuda ust uste temiz dalga. */
export const UNBROKEN_CLEAN_STREAK = 10;
/** Hava Sahasi: tamamen hava dalgasi (5 ve 10'dan zor olani). */
export const AIRSPACE_WAVE = 10;
/** Onur'un Kasa nisani: sans penceresinde zar en az bu (×1,9). */
export const LUCK_SAFE_MULTIPLIER = 1.9;
/** Omer'in Kilit Alan nisani: tek ultide bu kadar dusman. */
export const LOCK_CROWD_HITS = 12;
/** Baransel'in Meteor nisani: tek meteorla bu kadar oldurme. */
export const METEOR_KILLS = 8;
/**
 * Ulku'nun Can Dalgasi: ultinin usse dondurdugu tam can. Sunucudaki ultinin
 * sabiti (`teamHealth + 28`); test ikisini birlikte tutuyor. Tavanda kirpilan
 * can karneye yazilmiyor, yani tam deger ancak ulti bosa gitmediyse geliyor.
 */
export const FULL_HEAL_WAVE_HP = 28;

export type BadgeGroup = "defense" | "stage" | "explore" | "operator";

export const BADGE_GROUP_LABELS: Readonly<Record<BadgeGroup, string>> = {
  defense: "Savunma",
  stage: "Aşamalar",
  explore: "Keşif",
  operator: "Operatör imzaları"
};

const BADGE_GROUP_ORDER: readonly BadgeGroup[] = ["defense", "stage", "explore", "operator"];

/**
 * Istemcinin kosu boyunca gordugu olgular; yalnizca yerel oyuncunun kendi
 * kuleleri ve kendi ultisi (sampiyon takimin ortak ani).
 */
export type BadgeRunFlags = {
  /**
   * Kendi kulelerinin canli gorulen yukseltmeyle gectigi en yuksek kademe
   * esigi (5 ya da 10); duvar ve tamir deposu haric. Ilk gorulen seviye taban:
   * miras kalan 10. seviye kule bir yukseltme degil.
   */
  ownTowerMaxLevel: number;
  /** Kendi Zeynep kulelerin uclu dizilim kurdu. */
  formationTrio: boolean;
  /** Kendi Melis kulelerinin en yuksek evrimi (0-3). */
  melisMaxEvolution: number;
  /** Kendi Onur kulelerinde gorulen en yuksek zar. */
  bestLuck: number;
  /** Kendi Onur kulende sans penceresi acildi. */
  luckyWindow: boolean;
  /** Senin Sunucun bir bagi 10 dalga olgunlastirdi. */
  linkMatured10: boolean;
  /** Kosuda devrilen sampiyon. */
  championDowns: number;
  /** Bir sampiyon bir oncekinden hizli devrildi. */
  championFaster: boolean;
  /** Zeynep sutununda mukemmel nisan. */
  perfectColumn: boolean;
  /** Omer'in Kilit Alani'nin tek atista vurdugu en fazla dusman. */
  lockMaxHits: number;
  /** Ulku'nun Can Dalgasi usse tam canini dondurdu. */
  fullHeal: boolean;
  /** Baransel'in tek meteorundaki en fazla oldurme. */
  meteorMaxKills: number;
};

export function createEmptyBadgeFlags(): BadgeRunFlags {
  return {
    ownTowerMaxLevel: 0,
    formationTrio: false,
    melisMaxEvolution: 0,
    bestLuck: 0,
    luckyWindow: false,
    linkMatured10: false,
    championDowns: 0,
    championFaster: false,
    perfectColumn: false,
    lockMaxHits: 0,
    fullHeal: false,
    meteorMaxKills: 0
  };
}

/**
 * Bir nisanin degerlendirildigi olgular.
 *
 * Dalga sonunda `result` yok ve `player` yok: o an yalnizca karneler ve
 * istemcinin gordugu olgular var. Mac sonunda rapor (`RunSummary`) ekleniyor.
 */
export type BadgeRunFacts = {
  characterId: CharacterId;
  stage: number;
  /** Mac bittiyse sonuc; dalga sonunda yok. */
  result?: "victory" | "defeat";
  /** Kosunun karneleri, dalga sirasiyla. */
  waves: readonly WaveRecord[];
  /** Mac sonunda: sizintisiz biten dalga sayisi. */
  cleanWaves?: number;
  /** Mac sonunda: raporun yerel oyuncu satiri. */
  player?: Pick<RunPlayerSummary, "bestStreakTier" | "isolationShare" | "topTower">;
  /** Mac sonunda: kosunun ilk onuncu seviyesi yerel oyuncunun. */
  ownFirstLevel10?: boolean;
  /**
   * Bu istemcinin bastan sona gordugu ilk dalga. 1 ise kosunun tamami canli;
   * buyukse oyuncu sonradan katildi ya da bir yuvayi devraldi. Karneler bundan
   * once biten dalgalari tasimiyor (`buildFacts` suzuyor).
   */
  firstLiveWave: number;
  flags: BadgeRunFlags;
};

/** Depodan gelen baglam: mac sonunda bu kosu islendikten sonraki defterler. */
export type BadgeContext = {
  records?: RecordBook;
  archive?: CardArchive;
};

export type BadgeProgress = { current: number; target: number };

export type BadgeDefinition = {
  id: string;
  name: string;
  /** Kilitliyken de gorunen kosul: nisan bir hedef olarak okunuyor. */
  condition: string;
  group: BadgeGroup;
  /** Imza nisani: yalnizca bu operatorle; ustalik puani verir. */
  characterId?: CharacterId;
  /** Olcumde gorulmemis olgu: zorunlu bir hedef degil, menude ayri isaretli. */
  longTerm?: true;
  /** `wave`: dalga sonunda da acilabiliyor; `run`: yalnizca mac sonunda. */
  phase: "wave" | "run";
  /**
   * Butun kosuyu ya da yuvanin kosu boyu olgularini istiyor: sonradan katilan
   * ve yuva devralan oyuncuya (`firstLiveWave` > 1) acilmiyor.
   */
  wholeRun?: true;
  check: (facts: BadgeRunFacts, context: BadgeContext) => boolean;
  /** Menude ilerleme cubugu; anlamli oldugu yerde. */
  progress?: (context: BadgeContext) => BadgeProgress;
};

function isCleanRecord(record: WaveRecord) {
  return record.l === 0 && !record.d;
}

function isVictory(facts: BadgeRunFacts) {
  return facts.result === "victory";
}

/**
 * Karnenin canli gorulen temiz serisi: sunucunun serisi (`c`) katilmadan once
 * baslamis olabilir, o yuzden canli dalga sayisiyla kirpiliyor.
 */
function liveCleanStreak(record: WaveRecord, firstLiveWave: number) {
  return Math.min(record.c, record.w - firstLiveWave + 1);
}

function towerDamageType(definitionId: string | undefined) {
  if (typeof definitionId !== "string") return undefined;
  for (const towers of Object.values(towerCatalog)) {
    const definition = towers.find((tower) => tower.id === definitionId);
    if (definition) return definition.damageType;
  }
  return undefined;
}

/** Rekor defterinde 1. asamayi temizlemis operatorler (oyuncu sayisi ve olcek fark etmiyor). */
export function getStageOneClearOperators(records: RecordBook | undefined): CharacterId[] {
  const cleared = new Set<CharacterId>();
  for (const [key, record] of Object.entries(records ?? {})) {
    const parts = parseRecordKey(key);
    if (parts && parts.stage === 1 && record && record.clears > 0) cleared.add(parts.characterId);
  }
  return [...cleared];
}

const OPERATOR_COUNT = 7;

/**
 * Nisan katalogu. Sira menudeki sira; grup icinde kolaydan zora.
 *
 * Her kosulun karsiliginda bir ulasilabilirlik notu var (test
 * `badges-mastery.test.mjs` olgunun gercekten uretildigini sunucunun kendisiyle
 * olcuyor): olgu ya kosu defterinde ya da istemcinin zaten aldigi bir alanda.
 */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  // --- Savunma ---------------------------------------------------------------
  {
    id: "hava-sahasi",
    name: "Hava Sahası",
    condition: "10. dalgayı (tamamen hava) sızıntısız temizle.",
    group: "defense",
    phase: "wave",
    check: (facts) => facts.waves.some((record) => record.w === AIRSPACE_WAVE && isCleanRecord(record))
  },
  {
    id: "kesintisiz",
    name: "Kesintisiz",
    condition: `Bir koşuda ${UNBROKEN_CLEAN_STREAK} dalga üst üste sızıntısız temizle.`,
    group: "defense",
    phase: "wave",
    check: (facts) => facts.waves.some((record) => isCleanRecord(record) && liveCleanStreak(record, facts.firstLiveWave) >= UNBROKEN_CLEAN_STREAK)
  },
  {
    id: "kusursuz",
    wholeRun: true,
    name: "Kusursuz",
    condition: `Bir aşamayı ${FINAL_WAVE}/${FINAL_WAVE} temiz dalgayla (★★★) temizle.`,
    group: "defense",
    longTerm: true,
    phase: "run",
    check: (facts) => isVictory(facts) && (facts.cleanWaves ?? 0) >= FINAL_WAVE
  },
  {
    id: "kiyim",
    wholeRun: true,
    name: "Kıyım",
    condition: "Bir koşuda RAMPAGE serisine ulaş (8 sn'de 16 öldürme).",
    group: "defense",
    phase: "run",
    check: (facts) => getKillStreakTierRank(facts.player?.bestStreakTier) >= getKillStreakTierRank("rampage" satisfies KillStreakTier)
  },
  {
    id: "efsane",
    wholeRun: true,
    name: "Efsane",
    condition: "Bir koşuda LEGENDARY serisine ulaş (11 sn'de 22 öldürme).",
    group: "defense",
    longTerm: true,
    phase: "run",
    check: (facts) => getKillStreakTierRank(facts.player?.bestStreakTier) >= getKillStreakTierRank("legendary" satisfies KillStreakTier)
  },
  {
    id: "sampiyon-avcisi",
    name: "Şampiyon Avcısı",
    condition: "Bir şampiyonu devir (6. dalgadan itibaren gelir).",
    group: "defense",
    phase: "wave",
    check: (facts) => facts.flags.championDowns >= 1
  },
  {
    id: "hizlanan-av",
    name: "Hızlanan Av",
    condition: "Bir şampiyonu bir öncekinden daha hızlı devir.",
    group: "defense",
    phase: "wave",
    check: (facts) => facts.flags.championFaster
  },
  {
    id: "kademe-2",
    name: "Kademe 2",
    condition: `Bir kuleni seviye ${TOWER_TIER_2_LEVEL}'e (KADEME 2) çıkar.`,
    group: "defense",
    phase: "wave",
    check: (facts) => facts.flags.ownTowerMaxLevel >= TOWER_TIER_2_LEVEL
  },
  {
    id: "kademe-3",
    name: "Kademe 3",
    condition: `Bir kuleni seviye ${TOWER_TIER_3_LEVEL}'a (KADEME 3) çıkar.`,
    group: "defense",
    longTerm: true,
    phase: "wave",
    check: (facts) => facts.flags.ownTowerMaxLevel >= TOWER_TIER_3_LEVEL || (facts.firstLiveWave <= 1 && facts.ownFirstLevel10 === true)
  },
  // --- Asamalar -------------------------------------------------------------
  {
    id: "ilk-zafer",
    wholeRun: true,
    name: "İlk Zafer",
    condition: "1. aşamayı temizle.",
    group: "stage",
    phase: "run",
    check: (facts) => isVictory(facts) && facts.stage === 1
  },
  {
    id: "dogru-silah",
    wholeRun: true,
    name: "Doğru Silah",
    condition: "Koşunun en çok hasar veren kulen aşamanın zayıf olduğu hasar tipinde olsun ve aşamayı temizle.",
    group: "stage",
    phase: "run",
    check: (facts) => {
      if (!isVictory(facts)) return false;
      const type = towerDamageType(facts.player?.topTower?.definitionId);
      return type !== undefined && type !== "none" && getStageDamageProfile(facts.stage).weakTo.includes(type);
    }
  },
  {
    id: "her-cephede",
    name: "Her Cephede",
    condition: `1. aşamayı ${OPERATOR_COUNT} operatörün hepsiyle temizle.`,
    group: "stage",
    phase: "run",
    check: (_facts, context) => getStageOneClearOperators(context.records).length >= OPERATOR_COUNT,
    progress: (context) => ({ current: getStageOneClearOperators(context.records).length, target: OPERATOR_COUNT })
  },
  {
    id: "son-kale",
    wholeRun: true,
    name: "Son Kale",
    condition: `${STAGE_COUNT}. aşamayı temizle.`,
    group: "stage",
    phase: "run",
    check: (facts) => isVictory(facts) && facts.stage === STAGE_COUNT
  },
  // --- Kesif ----------------------------------------------------------------
  {
    id: "arsivci",
    name: "Arşivci",
    condition: `Kart Arşivi'nde ${ARCHIVIST_CARD_TARGET} farklı kart gör.`,
    group: "explore",
    phase: "run",
    check: (_facts, context) => (context.archive ? getArchiveProgress(context.archive, "cards").seen : 0) >= ARCHIVIST_CARD_TARGET,
    progress: (context) => ({
      current: context.archive ? getArchiveProgress(context.archive, "cards").seen : 0,
      target: ARCHIVIST_CARD_TARGET
    })
  },
  // --- Operator imzalari ----------------------------------------------------
  {
    id: "tam-dizilim",
    name: "Tam Dizilim",
    condition: "ZentaX: üç kuleyi üçgen dizip (2×2 karenin üç köşesi) üçlü dizilim kur.",
    group: "operator",
    characterId: "zeynep",
    phase: "wave",
    check: (facts) => facts.characterId === "zeynep" && facts.flags.formationTrio
  },
  {
    id: "mukemmel-sutun",
    name: "Mükemmel Sütun",
    condition: "ZentaX: Sütun ultisini en kalabalık sütuna (en az 3 düşman) indir.",
    group: "operator",
    characterId: "zeynep",
    phase: "wave",
    check: (facts) => facts.characterId === "zeynep" && facts.flags.perfectColumn
  },
  {
    id: "olgun-bag",
    wholeRun: true,
    name: "Olgun Bağ",
    condition: "AttackLord: bir Sunucu bağını 10 dalga boyunca koru.",
    group: "operator",
    characterId: "warrior",
    phase: "wave",
    check: (facts) => facts.characterId === "warrior" && facts.flags.linkMatured10
  },
  {
    id: "yalniz-kurt",
    wholeRun: true,
    name: "Yalnız Kurt",
    condition: `AttackLord: yalnızlık payın bir koşuda ~${SYNERGY_SHARE_RUN_FLOOR.toLocaleString("tr-TR")} hasarı geçsin (kuleyi komşusuz kur).`,
    group: "operator",
    characterId: "warrior",
    phase: "run",
    check: (facts) => facts.characterId === "warrior" && (facts.player?.isolationShare ?? 0) >= SYNERGY_SHARE_RUN_FLOOR
  },
  {
    id: "tam-evrim",
    name: "Tam Evrim",
    condition: "DualiTemp: bir kuleyi 3. evrime kadar evrimleştir.",
    group: "operator",
    characterId: "archer",
    phase: "wave",
    check: (facts) => facts.characterId === "archer" && facts.flags.melisMaxEvolution >= 3
  },
  {
    id: "sans-penceresi",
    name: "Şans Penceresi",
    condition: "Honour: uğursuzluğu doldurup şans penceresini aç.",
    group: "operator",
    characterId: "onur",
    phase: "wave",
    check: (facts) => facts.characterId === "onur" && facts.flags.luckyWindow
  },
  {
    id: "kasa",
    name: "Kasa",
    condition: "Honour: şans penceresinde zarın ×1,9 ya da üstü gelsin.",
    group: "operator",
    characterId: "onur",
    phase: "wave",
    check: (facts) => facts.characterId === "onur" && facts.flags.bestLuck >= LUCK_SAFE_MULTIPLIER - 0.005
  },
  {
    id: "kilit-alan",
    name: "Kalabalığı Kilitle",
    condition: `Zexceed: Kilit Alan ultisiyle tek seferde ${LOCK_CROWD_HITS} düşmanı yakala.`,
    group: "operator",
    characterId: "tank",
    phase: "wave",
    check: (facts) => facts.characterId === "tank" && facts.flags.lockMaxHits >= LOCK_CROWD_HITS
  },
  {
    id: "tam-dalga",
    name: "Boşa Gitmeyen Dalga",
    condition: `Boosty: Can Dalgası'nın ${FULL_HEAL_WAVE_HP} canının hepsi üsse dönsün (üssün canı en az ${FULL_HEAL_WAVE_HP} eksikken at).`,
    group: "operator",
    characterId: "healer",
    phase: "wave",
    check: (facts) => facts.characterId === "healer" && facts.flags.fullHeal
  },
  {
    id: "meteor-yagmuru",
    name: "Meteor Yağmuru",
    condition: `Bioside: tek meteorla ${METEOR_KILLS} düşman öldür.`,
    group: "operator",
    characterId: "mage",
    phase: "wave",
    check: (facts) => facts.characterId === "mage" && facts.flags.meteorMaxKills >= METEOR_KILLS
  }
];

const BADGE_BY_ID = new Map(BADGE_CATALOG.map((badge) => [badge.id, badge]));

export function getBadgeDefinition(id: string) {
  return BADGE_BY_ID.get(id);
}

export function isBadgeId(value: unknown): value is string {
  return typeof value === "string" && BADGE_BY_ID.has(value);
}

/** Operatorun imza nisanlari. */
export function getSignatureBadges(characterId: CharacterId) {
  return BADGE_CATALOG.filter((badge) => badge.characterId === characterId);
}

/**
 * Bu olgularla yeni acilan nisanlar, katalog sirasiyla.
 *
 * `phase` "wave" ise yalnizca dalga sonunda karar verilebilen nisanlar
 * bakiliyor; mac sonunda ("run") hepsi. Zaten kazanilmis olan dusuyor.
 */
export function findNewBadges(
  facts: BadgeRunFacts,
  context: BadgeContext,
  earned: ReadonlySet<string> | Readonly<Record<string, unknown>>,
  phase: "wave" | "run"
): string[] {
  if (!isRecordCharacterId(facts.characterId)) return [];
  const has = (id: string) => (earned instanceof Set ? earned.has(id) : Object.hasOwn(earned, id));
  const fresh: string[] = [];
  for (const badge of BADGE_CATALOG) {
    if (has(badge.id)) continue;
    if (phase === "wave" && badge.phase !== "wave") continue;
    if (badge.characterId && badge.characterId !== facts.characterId) continue;
    if (badge.wholeRun && facts.firstLiveWave > 1) continue;
    if (badge.check(facts, context)) fresh.push(badge.id);
  }
  return fresh;
}

/**
 * Bu kosu nisan yazabilir mi: rekor ve yildizla ayni kapi.
 *
 * - yaratici kosu hic yazmaz;
 * - asamasi bilinmeyen kosu yazmaz;
 * - bu tarayicida henuz acik olmayan asama (co-op'ta ev sahibinin asamasi)
 *   yazmaz (`shouldRecordStageClear`);
 * - istemci maci canli gormediyse (mac bittikten sonra girdi) yazmaz.
 */
export function checkBadgeRecordable(
  source: ProgressRecordSource & { live: boolean },
  clearedStageIds: readonly number[]
): boolean {
  if (!source.live || !canRecordProgress(source)) return false;
  return shouldRecordStageClear(source.stage, clearedStageIds);
}

/**
 * Kosu boyunca nisanin olgularini toplayan defter; sahne her olguyu buraya
 * yaziyor. Her yontem yalnizca buyutuyor: kosu icinde bir olgu geri alinmiyor.
 */
export class BadgeRunWatch {
  private flags = createEmptyBadgeFlags();
  private readonly waveRecords = new Map<number, WaveRecord>();
  /** Kosunun canli gorulen ilk dalgasi; ilk sonucsuz snapshot'a kadar yok. */
  private liveWave?: number;
  /** Kulenin ilk gorulen hali: kademe, dizilim, evrim, zar ve pencere tabani. */
  private readonly towerBaselines = new Map<string, { level: number; formation: number; evolution: number; luck?: number; window: boolean }>();
  private championSeen = false;
  /** Bu kosuda dalga sonunda depoya yazilan nisanlar; raporun "once"si bunlarsiz. */
  private readonly awarded = new Set<string>();

  /**
   * Ilk canli snapshot'in dalgasi. Bir kez yaziliyor; yeniden baglanma ve
   * sayfa yenileme ayni degeri depodan veriyor (`resolveFirstLiveWave`).
   */
  noteFirstLiveWave(wave: number) {
    if (this.liveWave !== undefined || !Number.isInteger(wave) || wave < 1) return;
    this.liveWave = wave;
  }

  get firstLiveWave() {
    return this.liveWave;
  }

  noteAwarded(ids: readonly string[]) {
    for (const id of ids) this.awarded.add(id);
  }

  /** Bu kosuda dalga sonunda yazilmis nisanlar. */
  get awardedThisRun(): string[] {
    return [...this.awarded];
  }

  /** `wave:report`; bozuk karne yok sayiliyor. Ayni dalganin yeni karnesi oncekinin yerine. */
  noteWave(raw: unknown) {
    const record = sanitizeWaveRecord(raw);
    if (!record) return false;
    this.waveRecords.set(record.w, record);
    return true;
  }

  /**
   * Kendi kulenin anlik goruntudeki olgulari. Her kule ilk gorulusunde taban
   * oluyor; nisan yalnizca canli gorulen degisimden: seviyenin 5 ya da 10'u
   * gecmesi, dizilimin uclu olmasi, evrimin 3'e cikmasi, yeni bir zar ve
   * kapaliyken acilan sans penceresi. Yuvayi devralan oyuncunun miras kuleleri
   * boylece hicbir sey acmiyor; kosunun basindan beri odada olan icin her kule
   * kurulurken (1. seviye, dizilimsiz) gorulup taban oluyor.
   */
  noteOwnTower(tower: {
    id: string;
    level?: number;
    countsAsTower?: boolean;
    formationSize?: number;
    evolution?: number;
    luck?: number;
    luckyWindowRemainingMs?: number;
  }) {
    if (!tower || typeof tower.id !== "string") return;
    const level = typeof tower.level === "number" && Number.isFinite(tower.level) ? Math.floor(tower.level) : 0;
    const formation = typeof tower.formationSize === "number" ? tower.formationSize : 0;
    const evolution = typeof tower.evolution === "number" && Number.isFinite(tower.evolution) ? Math.floor(tower.evolution) : 0;
    const luck = typeof tower.luck === "number" && Number.isFinite(tower.luck) ? tower.luck : undefined;
    const window = typeof tower.luckyWindowRemainingMs === "number" && tower.luckyWindowRemainingMs > 0;
    const base = this.towerBaselines.get(tower.id);
    if (!base) {
      this.towerBaselines.set(tower.id, { level, formation, evolution, luck, window });
      return;
    }
    if (tower.countsAsTower !== false) {
      for (const threshold of [TOWER_TIER_2_LEVEL, TOWER_TIER_3_LEVEL]) {
        if (base.level < threshold && level >= threshold) this.flags.ownTowerMaxLevel = Math.max(this.flags.ownTowerMaxLevel, threshold);
      }
    }
    if (base.formation < 3 && formation >= 3) this.flags.formationTrio = true;
    if (evolution > base.evolution) this.flags.melisMaxEvolution = Math.max(this.flags.melisMaxEvolution, evolution);
    if (luck !== undefined && luck !== base.luck) this.flags.bestLuck = Math.max(this.flags.bestLuck, luck);
    if (window && !base.window) this.flags.luckyWindow = true;
    base.level = Math.max(base.level, level);
    base.formation = formation;
    base.evolution = Math.max(base.evolution, evolution);
    base.luck = luck;
    base.window = window;
  }

  /** `link:matured`; yalnizca Sunucunun sahibi sensen. */
  noteLinkMatured(waves: number, ownServer: boolean) {
    if (ownServer && waves >= 10) this.flags.linkMatured10 = true;
  }

  /** `champion:down`: takimin ortak ani. `prevMs` bu kosudaki bir onceki sampiyon. */
  noteChampionDown(message: { ms: number; prevMs?: number }) {
    if (!message || !Number.isFinite(message.ms) || message.ms < 0) return;
    this.flags.championDowns += 1;
    // Bir onceki sampiyon da canli gorulmus olmali: katilmadan once devrilenle
    // yarismak senin hizlanman degil.
    if (this.championSeen && typeof message.prevMs === "number" && Number.isFinite(message.prevMs) && message.ms < message.prevMs) {
      this.flags.championFaster = true;
    }
    this.championSeen = true;
  }

  /** `ultimate:result`: yalnizca atana gidiyor, yani hep kendi ultin. */
  noteUltimate(result: UltimateResultMessage | undefined) {
    if (!result || typeof result.kind !== "string") return;
    const hits = Number.isFinite(result.hits) ? Math.max(0, Math.floor(result.hits)) : 0;
    const kills = Number.isFinite(result.kills) ? Math.max(0, Math.floor(result.kills)) : 0;
    if (result.kind === "column" && getUltimateStampText(result).grade?.tier === "perfect") this.flags.perfectColumn = true;
    if (result.kind === "lock") this.flags.lockMaxHits = Math.max(this.flags.lockMaxHits, hits);
    if (result.kind === "meteor") this.flags.meteorMaxKills = Math.max(this.flags.meteorMaxKills, kills);
    if (result.kind === "heal" && typeof result.heal === "number" && result.heal >= FULL_HEAL_WAVE_HP) this.flags.fullHeal = true;
  }

  get waves(): WaveRecord[] {
    return [...this.waveRecords.values()].sort((left, right) => left.w - right.w);
  }

  getFlags(): BadgeRunFlags {
    return { ...this.flags };
  }

  /**
   * Degerlendirmenin olgulari. `run` verilirse mac sonu: karneler raporun
   * (sunucunun tam listesi), yerel satir ve onuncu seviye de oradan.
   */
  buildFacts(input: { characterId: CharacterId; stage: number; run?: RunSummary; localSlot?: number }): BadgeRunFacts {
    // Canli dalga bilinmiyorsa (henuz sonucsuz snapshot yok) hicbir karne
    // sayilmiyor: katilirken yeniden gonderilen karne bir nisan acmasin.
    const firstLiveWave = this.liveWave ?? Number.POSITIVE_INFINITY;
    const live = (records: readonly WaveRecord[]) => records.filter((record) => record.w >= firstLiveWave);
    const facts: BadgeRunFacts = {
      characterId: input.characterId,
      stage: input.stage,
      waves: live(this.waves),
      firstLiveWave,
      flags: this.getFlags()
    };
    const run = input.run;
    if (run) {
      facts.result = run.result;
      if (Array.isArray(run.waves) && run.waves.length > 0) {
        facts.waves = live(run.waves.map((record) => sanitizeWaveRecord(record)).filter((record): record is WaveRecord => Boolean(record)));
      }
      facts.cleanWaves = Number.isFinite(run.cleanWaves) ? Math.max(0, Math.floor(run.cleanWaves)) : 0;
      const own = Array.isArray(run.players) ? run.players.find((player) => player?.slot === input.localSlot) : undefined;
      if (own) facts.player = own;
      if (run.firstLevel10 && run.firstLevel10.slot === input.localSlot) facts.ownFirstLevel10 = true;
    }
    return facts;
  }

  reset() {
    this.flags = createEmptyBadgeFlags();
    this.waveRecords.clear();
    this.liveWave = undefined;
    this.towerBaselines.clear();
    this.championSeen = false;
    this.awarded.clear();
  }
}

/**
 * Ilk sonucsuz snapshot'tan canli gorulen ilk dalga.
 *
 * Kurulumda gelen snapshot'in dalgasi siradaki dalga: bastan sona gorulecek.
 * Savasta ya da temizleme molasinda gelen ise o dalganin bir kismini kacirdi:
 * canli ilk dalga bir sonraki. Kosunun basindaki oyuncu ilk snapshot'i 1.
 * dalganin kurulumunda aliyor (oda kurulumla basliyor).
 */
export function resolveFirstLiveWave(snapshot: { wave: number; setupPhase?: boolean }) {
  const wave = Number.isInteger(snapshot.wave) && snapshot.wave >= 1 ? snapshot.wave : 1;
  return snapshot.setupPhase ? wave : wave + 1;
}

/** Bir defterden bu kosuda yazilmis nisanlari cikarir: raporun "kosudan once" hali. */
export function withoutBadges(book: BadgeBook, ids: readonly string[]): BadgeBook {
  if (ids.length === 0) return book;
  const next = { ...book };
  for (const id of ids) delete next[id];
  return next;
}

/**
 * Nisan bildiriminin gosterilebildigi an.
 *
 * - `combat`: dalga suruyor. 375 px'te hicbir sey acilmiyor; bildirim bekliyor.
 * - `waveClear`: dalga temizleme damgasi ya da kart perdesi (dalga molasi).
 * - `report`: kosu raporu.
 */
export type BadgeNoticeMoment = "combat" | "waveClear" | "report";

export function getBadgeNoticeMoment(input: {
  over: boolean;
  setupPhase: boolean;
  enemiesLeft: number;
  /** Kart perdesi acik: dalga molasi. */
  draftOpen?: boolean;
}): BadgeNoticeMoment {
  if (input.over) return "report";
  if (input.draftOpen || input.setupPhase || input.enemiesLeft <= 0) return "waveClear";
  return "combat";
}

/**
 * Bildirim kuyrugu: dalga ortasinda acilan nisan dalga temizleme anina,
 * hepsi kosu raporuna.
 *
 * `take("combat")` hicbir zaman bir sey vermiyor ve kuyrugu bosaltmiyor.
 * `take("waveClear")` bekleyenleri bir kez veriyor. `take("report")` bu
 * kosuda acilan her nisani veriyor (dalga molasinda gosterilenler de):
 * rapor kosunun tam izi.
 */
export class BadgeNoticeQueue {
  private pending: string[] = [];
  private run: string[] = [];

  push(ids: readonly string[]) {
    for (const id of ids) {
      if (!isBadgeId(id) || this.run.includes(id)) continue;
      this.run.push(id);
      this.pending.push(id);
    }
  }

  take(moment: BadgeNoticeMoment): string[] {
    if (moment === "combat") return [];
    const out = moment === "report" ? [...this.run] : [...this.pending];
    this.pending = [];
    return out;
  }

  get size() {
    return this.pending.length;
  }

  reset() {
    this.pending = [];
    this.run = [];
  }
}

/** "Yeni nişan: Hava Sahası" ya da "Yeni nişan: Hava Sahası +1"; 375 px'te tek satir. */
export function formatBadgeNotice(ids: readonly string[]): string | undefined {
  const names = ids.map((id) => getBadgeDefinition(id)?.name).filter((name): name is string => Boolean(name));
  if (names.length === 0) return undefined;
  return `${lt("Yeni nişan", "New badge")}: ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ""}`;
}

// --- Depo --------------------------------------------------------------------

/** Kazanilan nisanlar: kimlik -> kazanildigi an (ms). */
export type BadgeBook = Record<string, number>;

export type StoredBadgeBook = { v: typeof BADGE_BOOK_VERSION; earned: BadgeBook };

/** Bicimi dogru ama katalogda olmayan kimlik (yeni surumun nisani) korunuyor, sayilmiyor. */
const BADGE_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const MAX_BADGE_ENTRIES = 128;

/**
 * Depodan okunan defter; her zaman temiz bir defter. Surumu tutmayan ya da
 * bozuk her sey eleniyor; en kotu durumda nisan yok.
 */
export function sanitizeBadgeBook(raw: unknown): BadgeBook {
  const book: BadgeBook = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return book;
  const stored = raw as Partial<StoredBadgeBook>;
  if (stored.v !== BADGE_BOOK_VERSION || !stored.earned || typeof stored.earned !== "object" || Array.isArray(stored.earned)) return book;
  let count = 0;
  for (const [id, at] of Object.entries(stored.earned)) {
    if (count >= MAX_BADGE_ENTRIES) break;
    if (!BADGE_ID_PATTERN.test(id)) continue;
    const time = typeof at === "number" && Number.isFinite(at) ? Math.max(0, Math.floor(at)) : 0;
    book[id] = time;
    count += 1;
  }
  return book;
}

export function serializeBadgeBook(book: BadgeBook): StoredBadgeBook {
  return { v: BADGE_BOOK_VERSION, earned: book };
}

/** Nisanlari deftere yazar; zaten olan dokunulmuyor (ilk kazanilma ani kaliyor). Yeni defter. */
export function awardBadges(book: BadgeBook, ids: readonly string[], at: number): { book: BadgeBook; fresh: string[] } {
  const fresh = ids.filter((id, index) => isBadgeId(id) && !Object.hasOwn(book, id) && ids.indexOf(id) === index);
  if (fresh.length === 0) return { book, fresh };
  const next = { ...book };
  for (const id of fresh) next[id] = Math.max(0, Math.floor(Number.isFinite(at) ? at : 0));
  return { book: next, fresh };
}

/** Operatorun kazanilmis imza nisanlari; ustalik puani bunlardan. */
export function countSignatureBadges(book: BadgeBook, characterId: CharacterId) {
  return getSignatureBadges(characterId).filter((badge) => Object.hasOwn(book, badge.id)).length;
}

// --- Menu gorunumu -----------------------------------------------------------

export type BadgeEntryView = {
  id: string;
  name: string;
  condition: string;
  earned: boolean;
  longTerm: boolean;
  /** Imza nisaninin operatoru (menude etiket). */
  characterId?: CharacterId;
  /** Kilitli ve anlamliysa ilerleme: "4/7". */
  progress?: BadgeProgress & { percent: number; text: string };
};

export type BadgeGroupView = {
  key: BadgeGroup;
  label: string;
  earned: number;
  total: number;
  entries: BadgeEntryView[];
};

export type BadgeBoardView = { earned: number; total: number; groups: BadgeGroupView[] };

/**
 * Menudeki Nisanlar ekrani. Kilitli nisan da kosulunu yaziyor: hedef olarak
 * okunsun. Grup icinde katalog sirasi (kolaydan zora), kazanilan ya da degil;
 * siralamayi degistirmek oyuncunun hedefi aradigi yeri her kosuda oynatirdi.
 */
export function buildBadgeBoardView(book: BadgeBook, context: BadgeContext): BadgeBoardView {
  const groups = BADGE_GROUP_ORDER.map((key): BadgeGroupView => {
    const entries = BADGE_CATALOG.filter((badge) => badge.group === key).map((badge): BadgeEntryView => {
      const earned = Object.hasOwn(book, badge.id);
      const entry: BadgeEntryView = { id: badge.id, name: badge.name, condition: badge.condition, earned, longTerm: badge.longTerm === true };
      if (badge.characterId) entry.characterId = badge.characterId;
      if (!earned && badge.progress) {
        const progress = badge.progress(context);
        const target = Math.max(1, progress.target);
        const current = Math.min(target, Math.max(0, Math.floor(progress.current)));
        entry.progress = { current, target, percent: Math.floor((current / target) * 100), text: `${current}/${target}` };
      }
      return entry;
    });
    return { key, label: BADGE_GROUP_LABELS[key], earned: entries.filter((entry) => entry.earned).length, total: entries.length, entries };
  });
  return {
    earned: groups.reduce((sum, group) => sum + group.earned, 0),
    total: BADGE_CATALOG.length,
    groups
  };
}
