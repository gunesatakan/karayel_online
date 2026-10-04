import {
  RUN_SUMMARY_VERSION,
  applyRunToMastery,
  awardBadges,
  checkBadgeRecordable,
  findNewBadges,
  getCosmeticFactsFor,
  getOperatorMasteryPoints,
  resolveCosmetics,
  resolveRunCharacter,
  sanitizeBadgeBook,
  sanitizeCosmetics,
  sanitizeMasteryBook,
  serializeBadgeBook,
  serializeCosmetics,
  serializeMasteryBook,
  summarizeRunProgress,
  withoutBadges,
  type BadgeBook,
  type BadgeRunFacts,
  type BadgeRunWatch,
  type CosmeticFacts,
  type CosmeticSelection,
  type MasteryBook,
  type MasteryReportView,
  type ResolvedCosmetics,
  type RunRecordLocal,
  type RunSummary
} from "@karayel/shared";
import { readCardArchive } from "./card-archive";
import { getRecordBook } from "./run-records";
import { getClearedStages } from "./stage-progress";

/**
 * Nisanlar, Operator Ustaligi ve kozmetik tarayicida duruyor (run-records.ts
 * ve card-archive.ts ile ayni desen). Kural (kosullar, egri, acilislar)
 * paylasilan modulde; burada yalnizca depo ve kapilar var.
 *
 * Anahtarlar surumlu: bicim degisirse yeni anahtar aciliyor, eski veri yanlis
 * okunmuyor. Her okuma ve yazma try/catch icinde; depo kapali (gizli sekme,
 * engelli site verisi) ya da elle bozulmus olabilir. Iki durumda da menu, oyun
 * ve rapor calisiyor; en kotu durumda nisan yok, ustalik 1, unvan yok.
 *
 * Kurcalanabilir oldugu kabul: ustune siralama kurulmuyor ve hicbiri oyuna guc
 * olarak donmuyor. Sunucuya hicbir sey gitmiyor; unvan da yalnizca bu
 * tarayicida gorunuyor.
 */
const BADGES_STORAGE_KEY = "karayel_badges_v1";
const MASTERY_STORAGE_KEY = "karayel_mastery_v1";
const COSMETICS_STORAGE_KEY = "karayel_cosmetics_v1";
/**
 * Odanin canli gorulen ilk dalgasi, oda kimligiyle; oturum deposunda.
 * Yeniden baglanan ya da sayfayi yenileyen oyuncu ilk degeri koruyor: yoksa
 * yenilemeden sonraki ilk snapshot onu "sonradan katilan" yapardi.
 */
const LIVE_WAVE_STORAGE_KEY = "karayel_live_wave_v1";

/**
 * Bu sayfada islenen kosular. Sonuc yeniden baglanmada ve `run:sync` ile
 * tekrar gelebiliyor; depo yazilamiyorsa defterin kendi kimlik listesi
 * calismaz, bellekteki kume ayni sayfada ikinci islemeyi her durumda kesiyor.
 */
const processedRunIds = new Set<string>();

function readJson(key: string): { value: unknown; available: boolean } {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Depo kapali (gizli sekme, engelli site verisi): kayit yokmus gibi.
    return { value: undefined, available: false };
  }
  if (!raw) return { value: undefined, available: true };
  try {
    return { value: JSON.parse(raw), available: true };
  } catch {
    // Icerik bozuk ama depo calisiyor: bos defterle devam, ilk yazim duzeltir.
    return { value: undefined, available: true };
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Yazilamadiysa oyun akisi durmuyor.
    return false;
  }
}

export function readBadgeBook(): BadgeBook {
  return sanitizeBadgeBook(readJson(BADGES_STORAGE_KEY).value);
}

export function readMasteryBook(): MasteryBook {
  return sanitizeMasteryBook(readJson(MASTERY_STORAGE_KEY).value);
}

export function readCosmeticSelection(): CosmeticSelection {
  return sanitizeCosmetics(readJson(COSMETICS_STORAGE_KEY).value);
}

/** Depo okunabiliyor mu; menu "saklanamıyor" uyarisi icin. */
export function isProgressStorageAvailable() {
  return readJson(BADGES_STORAGE_KEY).available;
}

export { getOperatorMasteryPoints };

export function getCosmeticFacts(mastery = readMasteryBook(), badges = readBadgeBook()): CosmeticFacts {
  return getCosmeticFactsFor(mastery, badges);
}

/**
 * Odanin canli gorulen ilk dalgasi: depoda varsa o (yeniden baglanma, sayfa
 * yenileme), yoksa verilen deger yaziliyor ve donuyor. Oturum deposu kapaliysa
 * verilen deger; en kotu durumda yenilenen sayfa sonradan katilan sayiliyor.
 */
export function resolveRoomFirstLiveWave(roomId: string | undefined, candidate: number): number {
  if (!roomId) return candidate;
  try {
    const raw = window.sessionStorage.getItem(LIVE_WAVE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : undefined;
    const stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)[roomId] : undefined;
    if (typeof stored === "number" && Number.isInteger(stored) && stored >= 1) return stored;
    // Yalnizca bu oda tutuluyor: eski odalarin degerleri birikmesin.
    window.sessionStorage.setItem(LIVE_WAVE_STORAGE_KEY, JSON.stringify({ [roomId]: candidate }));
  } catch {
    // Oturum deposu kapali ya da bozuk: o anki deger.
  }
  return candidate;
}

/** Ekranda gercekten kullanilan kozmetik: secim, acilmis olanlarla suzulmus. */
export function readResolvedCosmetics(): ResolvedCosmetics {
  return resolveCosmetics(readCosmeticSelection(), getCosmeticFacts());
}

export function saveCosmeticSelection(selection: CosmeticSelection) {
  return writeJson(COSMETICS_STORAGE_KEY, serializeCosmetics(selection));
}

export type BadgeGateSource = { creative: boolean; stage?: number; live: boolean };

/**
 * Dalga sonunda acilan nisanlari yazar ve yenileri doner; bildirim kuyrugu
 * bunlari dalga molasina ve rapora tasiyor.
 *
 * Kapi burada, depoya yazan tek yerde: yaratici kosu, asamasi bilinmeyen kosu
 * ve bu tarayicida kilitli asama hicbir nisan yazamaz (`checkBadgeRecordable`).
 * Depoya yazilamayan nisan kutlanmiyor: bir sonraki kosuda yine "yeni" olurdu.
 */
export function recordWaveBadges(facts: BadgeRunFacts, source: BadgeGateSource): string[] {
  if (!checkBadgeRecordable(source, getClearedStages())) return [];
  const book = readBadgeBook();
  const fresh = findNewBadges(facts, {}, book, "wave");
  if (fresh.length === 0) return [];
  const awarded = awardBadges(book, fresh, Date.now());
  return writeJson(BADGES_STORAGE_KEY, serializeBadgeBook(awarded.book)) ? awarded.fresh : [];
}

export type RunProgressOutcome = {
  /** Mac sonunda acilan nisanlar (dalga sonunda acilanlar kuyrukta). */
  badges: string[];
  mastery?: MasteryReportView;
  /** Bu kosuyla acilan kozmetikler ("Unvan: Hava Muhafızı", "Taç süsü"). */
  cosmetics: string[];
  saved: boolean;
};

/**
 * Bitmis kosuyu nisanlara ve ustaliga yazar; sayfada kosu basina bir kez.
 *
 * Rekor ve arsiv yazildiktan sonra cagriliyor: "Her Cephede" bu kosunun
 * temizlemesini, "Arşivci" bu kosunun kartlarini gormeli.
 *
 * - Yaratici kosu ve maci canli gormeyen istemci hicbir seye yazmaz.
 * - Nisan rekorla ayni kapidan (kilitli asama yazmaz).
 * - Ustalikta dalgalar kilitli asamada da sayiliyor (dalgalari sen
 *   temizledin); ilk temizleme ve yildiz ancak kapi aciksa.
 * - Sonradan katilan ya da yuva devralan oyuncu yalnizca canli gordugu
 *   dalgalari aliyor (`firstLiveWave`).
 * - Raporun "once"si kosunun basi: dalga sonunda yazilan nisanlar cikariliyor.
 */
export function recordRunProgress(input: {
  run: RunSummary;
  creative: boolean;
  stage?: number;
  live: boolean;
  local: RunRecordLocal;
  watch: BadgeRunWatch;
}): RunProgressOutcome | undefined {
  const { run } = input;
  if (!input.live || input.creative || run.creative === true) return undefined;
  if (typeof run.id !== "string" || processedRunIds.has(run.id) || run.version !== RUN_SUMMARY_VERSION) return undefined;
  const characterId = resolveRunCharacter(run, input.local);
  if (!characterId) return undefined;
  processedRunIds.add(run.id);

  const gate = run.stage === input.stage && checkBadgeRecordable({ creative: input.creative, stage: input.stage, live: input.live }, getClearedStages());
  const firstLiveWave = input.watch.firstLiveWave ?? Number.POSITIVE_INFINITY;
  const badgesBefore = readBadgeBook();
  const masteryBefore = readMasteryBook();

  let badgeBook = badgesBefore;
  let fresh: string[] = [];
  if (gate) {
    const facts = input.watch.buildFacts({ characterId, stage: run.stage, run, localSlot: input.local.slot });
    const context = { records: getRecordBook(), archive: readCardArchive().archive };
    const awarded = awardBadges(badgesBefore, findNewBadges(facts, context, badgesBefore, "run"), Date.now());
    badgeBook = awarded.book;
    fresh = awarded.fresh;
  }

  const applied = applyRunToMastery(masteryBefore, run, { ...input.local, creative: input.creative }, { countStars: gate, firstLiveWave });
  const masteryBook = applied?.book ?? masteryBefore;
  let savedBadges = true;
  if (fresh.length > 0) savedBadges = writeJson(BADGES_STORAGE_KEY, serializeBadgeBook(badgeBook));
  const savedMastery = applied ? writeJson(MASTERY_STORAGE_KEY, serializeMasteryBook(masteryBook)) : true;

  const summary = summarizeRunProgress({
    characterId,
    badgesAtStart: withoutBadges(badgesBefore, input.watch.awardedThisRun),
    badgesAfter: savedBadges ? badgeBook : badgesBefore,
    masteryBefore,
    masteryAfter: savedMastery ? masteryBook : masteryBefore,
    gained: applied && savedMastery ? applied.gained : undefined
  });
  return {
    badges: savedBadges ? fresh : [],
    mastery: summary.mastery,
    cosmetics: summary.cosmetics,
    saved: savedBadges && savedMastery
  };
}