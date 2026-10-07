import { FINAL_WAVE } from "../balance/index.js";
import { enPlural, lt } from "../i18n/index.js";
import type { CharacterId } from "../index.js";
import type { RunSummary } from "../run-trace/index.js";
import { STAGE_COUNT } from "../stages/index.js";
import { MAX_STAGE_STARS, computeStars, isRecordCharacterId, resolveRunCharacter, type RunRecordLocal } from "./records.js";

/**
 * Operator Ustaligi: operator basina 1-10 arasi bir seviye.
 *
 * Kural burada, depo istemcide (apps/web/src/progress-store.ts). Ayrim
 * testler icin: egri, puan ve birlestirme tarayici olmadan dogrulanabilsin.
 *
 * Puan dort olgudan:
 * - temizlenen her dalga (`MASTERY_POINTS.wave`);
 * - asamanin bu operatorle ilk temizlenmesi;
 * - asamada bu operatorle ilk ★★ ve ilk ★★★;
 * - operatorun imza nisanlari (`badges.ts`, `characterId` tasiyanlar).
 *
 * Depoda yalnizca ham olgular var (dalga sayisi, asama basina en iyi yildiz);
 * puan her okumada bunlardan ve nisan defterinden yeniden hesaplaniyor. Ayni
 * nisan ya da ayni ilk temizleme bu yuzden iki kez sayilamiyor.
 *
 * Co-op puani kucultmuyor: dalga dalgadir, dort kisilik kosuda da her oyuncu
 * kendi operatoruyle ayni puani aliyor. Kule deneyimi gibi oyuncu sayisina
 * bolunen bir sey burada yok, oyuncu sayisiyla carpilan bir sey de yok.
 *
 * Hepsi taninma. Ustalik hicbir yoldan stat, altin, kart ya da baslangic
 * kulesi olarak oyuna donmuyor; acabildigi tek sey kozmetik (`cosmetics.ts`).
 * Gunluk seri, suresi dolan gorev ya da "geri gel yoksa kaybedersin" yok:
 * puan yalnizca birikiyor, hicbir zaman dusmuyor.
 */

/** Deponun bicim surumu; anahtar da surumlu (`karayel_mastery_v1`). */
export const MASTERY_BOOK_VERSION = 1;

export const MASTERY_MAX_LEVEL = 10;

/** Puan kaynaklari. Sabit bir tablo: "bu seviye nereden geldi" okunabilir kalsin. */
export const MASTERY_POINTS = {
  /** Temizlenen her dalga; olunen dalga sayilmiyor. */
  wave: 1,
  /** Asama bu operatorle ilk kez temizlendi (★). */
  firstClear: 30,
  /** Asamada bu operatorle ilk ★★. */
  firstTwoStars: 15,
  /** Asamada bu operatorle ilk ★★★. */
  firstThreeStars: 25,
  /** Operatorun her imza nisani. */
  signatureBadge: 30
} as const;

/**
 * Seviyenin alt siniri: `5 * (L - 1) * (L + 2)`.
 *
 * 0, 20, 50, 90, 140, 200, 270, 350, 440, 540. Ilk temizleme (20 dalga + 30)
 * operatoru 3. seviyeye tasiyor -- ilk zafer bir an olsun. Sonrasi uzuyor:
 * 10. seviye bes asamanin ilk temizlemeleriyle bile ~15 tam kosu. Adimlar
 * yuvarlak ki menude "270 puan" diye okunabilsin.
 */
export function getMasteryLevelFloor(level: number) {
  const clamped = Math.min(MASTERY_MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  return 5 * (clamped - 1) * (clamped + 2);
}

export const MASTERY_LEVEL_FLOORS: readonly number[] = Object.freeze(
  Array.from({ length: MASTERY_MAX_LEVEL }, (_, index) => getMasteryLevelFloor(index + 1))
);

/** Puanin seviyesi (1-10). */
export function getMasteryLevel(points: number) {
  const value = Number.isFinite(points) ? Math.max(0, points) : 0;
  let level = 1;
  for (let next = 2; next <= MASTERY_MAX_LEVEL; next += 1) {
    if (value >= getMasteryLevelFloor(next)) level = next;
  }
  return level;
}

export type MasteryProgress = {
  level: number;
  points: number;
  /** Bu seviyenin alt siniri. */
  floor: number;
  /** Bir sonraki seviyenin siniri; son seviyede yok. */
  next?: number;
  /** Bu seviyedeki ilerleme (0-1); son seviyede 1. */
  ratio: number;
};

export function getMasteryProgress(points: number): MasteryProgress {
  const value = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  const level = getMasteryLevel(value);
  const floor = getMasteryLevelFloor(level);
  if (level >= MASTERY_MAX_LEVEL) return { level, points: value, floor, ratio: 1 };
  const next = getMasteryLevelFloor(level + 1);
  return { level, points: value, floor, next, ratio: Math.min(1, Math.max(0, (value - floor) / (next - floor))) };
}

/** Bir operatorun ham olgulari. */
export type MasteryEntry = {
  /** Bu operatorle temizlenen dalgalar, butun kosularin toplami. */
  waves: number;
  /** Asama sirasiyla bu operatorle alinan en iyi yildiz (0-3); oyuncu sayisi ve olcek fark etmiyor. */
  stars: number[];
};

export type MasteryBook = {
  operators: Partial<Record<CharacterId, MasteryEntry>>;
  /** Sayilmis kosularin kimlikleri, eskiden yeniye; ayni kosu iki kez sayilmiyor. */
  runs: string[];
};

export type StoredMasteryBook = { v: typeof MASTERY_BOOK_VERSION } & MasteryBook;

/** Ayni sayfada ya da yeniden baglanmada tekrar gelen kosu icin yeter; kosu kaydinin tavanindan kucuk. */
export const MASTERY_RUN_ID_LIMIT = 30;
/** Kurcalanmis dev sayi menude tasmasin. */
const MAX_MASTERY_WAVES = 1_000_000;
const RUN_ID_PATTERN = /^[a-z0-9-]{1,40}$/i;

export function createEmptyMasteryBook(): MasteryBook {
  return { operators: {}, runs: [] };
}

function emptyEntry(): MasteryEntry {
  return { waves: 0, stars: Array.from({ length: STAGE_COUNT }, () => 0) };
}

function clampInt(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function sanitizeEntry(raw: unknown): MasteryEntry | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const stars = Array.isArray(source.stars) ? source.stars : [];
  const entry: MasteryEntry = {
    waves: clampInt(source.waves, 0, MAX_MASTERY_WAVES),
    stars: Array.from({ length: STAGE_COUNT }, (_, index) => clampInt(stars[index], 0, MAX_STAGE_STARS))
  };
  return entry.waves > 0 || entry.stars.some((value) => value > 0) ? entry : undefined;
}

/**
 * Depodan okunan defter; her zaman temiz bir defter donuyor. Surumu tutmayan,
 * operatoru bilinmeyen ya da bozuk her sey eleniyor; en kotu durumda ustalik 1.
 */
export function sanitizeMasteryBook(raw: unknown): MasteryBook {
  const book = createEmptyMasteryBook();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return book;
  const stored = raw as Partial<StoredMasteryBook>;
  if (stored.v !== MASTERY_BOOK_VERSION) return book;
  if (stored.operators && typeof stored.operators === "object" && !Array.isArray(stored.operators)) {
    for (const [id, value] of Object.entries(stored.operators)) {
      if (!isRecordCharacterId(id)) continue;
      const entry = sanitizeEntry(value);
      if (entry) book.operators[id] = entry;
    }
  }
  if (Array.isArray(stored.runs)) {
    const runs = [...new Set(stored.runs.filter((id): id is string => typeof id === "string" && RUN_ID_PATTERN.test(id)))];
    book.runs = runs.slice(-MASTERY_RUN_ID_LIMIT);
  }
  return book;
}

export function serializeMasteryBook(book: MasteryBook): StoredMasteryBook {
  return { v: MASTERY_BOOK_VERSION, operators: book.operators, runs: book.runs };
}

/**
 * Operatorun ustalik puani: ham olgular artı imza nisanlari.
 *
 * `signatureBadges` bu operatorun kazanilmis imza nisani sayisi
 * (`countSignatureBadges`); nisan defteri ayri tutuldugu icin disaridan.
 */
export function getMasteryPoints(entry: MasteryEntry | undefined, signatureBadges = 0) {
  let points = clampInt(signatureBadges, 0, 1000) * MASTERY_POINTS.signatureBadge;
  if (!entry) return points;
  points += clampInt(entry.waves, 0, MAX_MASTERY_WAVES) * MASTERY_POINTS.wave;
  for (const stars of entry.stars) {
    if (stars >= 1) points += MASTERY_POINTS.firstClear;
    if (stars >= 2) points += MASTERY_POINTS.firstTwoStars;
    if (stars >= 3) points += MASTERY_POINTS.firstThreeStars;
  }
  return points;
}

/**
 * Kosuda temizlenen dalgalar: karnesi olan ve olunmeyen dalgalar, dalga
 * numarasina gore bir kez. Karne yoksa (eski rapor) ulasilan dalgadan; olunen
 * dalga sayilmiyor. Ust sinir son dalga.
 *
 * Oyuncu sayisina bakmiyor: co-op'ta da her oyuncu ayni sayiyi aliyor.
 *
 * `firstLiveWave` istemcinin bastan sona gordugu ilk dalga: sonradan katilan
 * ya da yuva devralan oyuncu yalnizca kendi gordugu dalgalari aliyor.
 */
export function countRunClearedWaves(run: Pick<RunSummary, "result" | "wave" | "waves">, firstLiveWave = 1) {
  const from = Number.isFinite(firstLiveWave) ? Math.max(1, Math.floor(firstLiveWave)) : FINAL_WAVE + 1;
  if (Array.isArray(run.waves) && run.waves.length > 0) {
    const cleared = new Set<number>();
    for (const record of run.waves) {
      if (!record || typeof record.w !== "number" || record.d) continue;
      if (Number.isInteger(record.w) && record.w >= from && record.w <= FINAL_WAVE) cleared.add(record.w);
    }
    return cleared.size;
  }
  const last = run.result === "victory" ? FINAL_WAVE : Math.min(FINAL_WAVE, clampInt(run.wave, 0, FINAL_WAVE) - 1);
  return Math.max(0, last - from + 1);
}

export type MasteryGain = {
  waves: number;
  firstClear: number;
  stars: number;
};

export type MasteryRunResult = {
  book: MasteryBook;
  characterId: CharacterId;
  /** Kosu islenmeden onceki ham olgular; ilk kosuda bos. */
  before: MasteryEntry;
  after: MasteryEntry;
  /** Kosunun kazandirdigi puan, kaynagina gore (nisan puani ayri). */
  gained: MasteryGain;
};

/**
 * Kosuyu ustalik defterine isler.
 *
 * - Yaratici kosu hic islenmiyor (bayrak raporda ya da istemcide).
 * - Yerel oyuncu kosuda yoksa (`resolveRunCharacter`) islenmiyor.
 * - Ayni kosu kimligi ikinci kez islenmiyor.
 * - `countStars` kayit kapisinin sonucu: kilitli asamada (co-op'ta ev
 *   sahibinin asamasi) dalga sayiliyor ama ilk temizleme ve yildiz yazilmiyor
 *   -- asama ilerlemesiyle ayni zincir. Kart Arsivi'nin sayaci gibi: dalgalari
 *   sen temizledin.
 * - `firstLiveWave` > 1: oyuncu kosuya sonradan katildi ya da bir yuvayi
 *   devraldi. Yalnizca canli gordugu dalgalar sayiliyor; ilk temizleme ve
 *   yildiz butun kosuyu istiyor, yazilmiyor.
 *
 * Defter degismiyor; yeni defter donuyor.
 */
export function applyRunToMastery(
  book: MasteryBook,
  run: RunSummary,
  local: RunRecordLocal & { creative?: boolean },
  options: { countStars: boolean; firstLiveWave?: number }
): MasteryRunResult | undefined {
  if (run.creative === true || local.creative === true) return undefined;
  if (typeof run.id !== "string" || !RUN_ID_PATTERN.test(run.id) || book.runs.includes(run.id)) return undefined;
  const characterId = resolveRunCharacter(run, local);
  if (!characterId) return undefined;
  const before = book.operators[characterId] ?? emptyEntry();
  const after: MasteryEntry = { waves: before.waves, stars: [...before.stars] };
  const firstLiveWave = options.firstLiveWave ?? 1;
  const waves = countRunClearedWaves(run, firstLiveWave);
  after.waves = Math.min(MAX_MASTERY_WAVES, after.waves + waves);
  const gained: MasteryGain = { waves: waves * MASTERY_POINTS.wave, firstClear: 0, stars: 0 };
  const stageIndex = Number.isInteger(run.stage) ? run.stage - 1 : -1;
  if (options.countStars && firstLiveWave <= 1 && stageIndex >= 0 && stageIndex < STAGE_COUNT) {
    const stars = computeStars(run);
    const previous = after.stars[stageIndex] ?? 0;
    if (stars > previous) {
      if (previous < 1 && stars >= 1) gained.firstClear += MASTERY_POINTS.firstClear;
      if (previous < 2 && stars >= 2) gained.stars += MASTERY_POINTS.firstTwoStars;
      if (previous < 3 && stars >= 3) gained.stars += MASTERY_POINTS.firstThreeStars;
      after.stars[stageIndex] = stars;
    }
  }
  return {
    book: {
      operators: { ...book.operators, [characterId]: after },
      runs: [...book.runs, run.id].slice(-MASTERY_RUN_ID_LIMIT)
    },
    characterId,
    before,
    after,
    gained
  };
}

/**
 * Raporun ustalik satiri: "Ustalık 3 → 4" ani ve ilerleme cubugu.
 *
 * `beforePoints` ve `afterPoints` nisan puaniyla birlikte: kosuda kazanilan
 * imza nisani da bu kosunun ilerlemesi.
 */
export type MasteryReportView = {
  characterId: CharacterId;
  operator: string;
  before: MasteryProgress;
  after: MasteryProgress;
  gained: number;
  levelUp: boolean;
  /** "Ustalık 3 → 4" ya da "Ustalık 3 · +24". */
  headline: string;
  /** "140/200 · sonraki seviyeye 60" ya da "En yüksek ustalık". */
  detail: string;
  /** Kazancin kaynaklari: "18 dalga +18 · ilk temizleme +30". */
  sources: string;
};

export function buildMasteryReportView(input: {
  characterId: CharacterId;
  operator: string;
  beforePoints: number;
  afterPoints: number;
  gained: MasteryGain;
  badgePoints: number;
}): MasteryReportView {
  const before = getMasteryProgress(input.beforePoints);
  const after = getMasteryProgress(Math.max(input.beforePoints, input.afterPoints));
  const gained = Math.max(0, after.points - before.points);
  const levelUp = after.level > before.level;
  const mastery = lt("Ustalık", "Mastery");
  const headline = levelUp ? `${mastery} ${before.level} → ${after.level}` : `${mastery} ${after.level} · +${gained}`;
  const detail = after.next === undefined
    ? lt("En yüksek ustalık", "Max mastery")
    : `${after.points}/${after.next} · ${lt(`sonraki seviyeye ${after.next - after.points}`, `${after.next - after.points} to next level`)}`;
  const sources: string[] = [];
  const waves = Math.round(input.gained.waves / MASTERY_POINTS.wave);
  if (waves > 0) sources.push(lt(`${waves} dalga +${input.gained.waves}`, `${waves} ${enPlural(waves, "wave", "waves")} +${input.gained.waves}`));
  if (input.gained.firstClear > 0) sources.push(`${lt("ilk temizleme", "first clear")} +${input.gained.firstClear}`);
  if (input.gained.stars > 0) sources.push(`${lt("yıldız", "stars")} +${input.gained.stars}`);
  if (input.badgePoints > 0) sources.push(`${lt("imza nişanı", "signature badge")} +${input.badgePoints}`);
  return {
    characterId: input.characterId,
    operator: input.operator,
    before,
    after,
    gained,
    levelUp,
    headline,
    detail,
    sources: sources.join(" · ")
  };
}
