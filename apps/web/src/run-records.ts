import {
  appendRunLog,
  applyRunToBook,
  checkRunRecordable,
  createRunLogEntry,
  recordKey,
  sanitizeRecordBook,
  sanitizeRunLog,
  serializeRecordBook,
  serializeRunLog,
  type CharacterId,
  type ProgressRecordSource,
  type RecordBook,
  type RecordMerge,
  type RunLogEntry,
  type RunRecordLocal,
  type RunRecordSkipReason,
  type RunSummary,
  type StageRecord
} from "@karayel/shared";
import { getClearedStages } from "./stage-progress";

/**
 * Rekorlar ve kosu kaydi tarayicida duruyor (stage-progress.ts ile ayni desen).
 *
 * Anahtarlar surumlu: bicim degisirse yeni anahtar aciliyor, eski veri yanlis
 * okunmuyor. Her okuma ve yazma try/catch icinde; depo kapali olabilir (gizli
 * sekme, engelli site verisi) ya da elle bozulmus olabilir. Iki durumda da menu
 * ve sonuc ekrani calismaya devam ediyor, en kotu durumda rekor yok.
 *
 * Kurcalanabilir oldugu kabul: bunlarin ustune siralama kurulmuyor. Kural
 * (yildiz, anahtar, birlestirme, kapi) paylasilan modulde; burada yalnizca
 * depo var.
 */
const RECORDS_STORAGE_KEY = "karayel_records_v1";
const RUN_LOG_STORAGE_KEY = "karayel_run_log_v1";

/**
 * Bu sayfada yazilan kosular.
 *
 * Sonuc yeniden baglanmada ve `run:sync` ile tekrar gelebiliyor; kosu kaydi
 * kimligi zaten tutuyor ama depo yazilamiyorsa (kota, engel) o kontrol
 * calismaz. Bellekteki kume ayni sayfada ikinci yazimi her durumda kesiyor.
 */
const recordedRunIds = new Set<string>();

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    // Depo kapali ya da icerik bozuk: kayit yokmus gibi davraniliyor.
    return undefined;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Yazilamadiysa oyun akisi durmuyor; kosu yine oynandi.
    return false;
  }
}

/** Butun rekorlar; her zaman temiz bir defter. */
export function getRecordBook(): RecordBook {
  return sanitizeRecordBook(readJson(RECORDS_STORAGE_KEY));
}

/** Son kosular, eskiden yeniye; her zaman temiz bir liste. */
export function getRunLog(): RunLogEntry[] {
  return sanitizeRunLog(readJson(RUN_LOG_STORAGE_KEY));
}

/** Defterdeki tek kayit; anahtar gecersizse ya da kayit yoksa yok. */
export function getStageRecord(
  book: RecordBook,
  stage: number,
  characterId: CharacterId,
  playerCount: number,
  mapKey: string
): StageRecord | undefined {
  const key = recordKey(stage, characterId, playerCount, mapKey);
  return key ? book[key] : undefined;
}

export type RunRecordOutcome =
  | { status: "recorded"; key: string; merge: RecordMerge; saved: boolean }
  | { status: "skipped"; reason: RunRecordSkipReason | "missing" | "duplicate" | "invalid" };

/**
 * Bitmis kosuyu rekorlara ve kosu kaydina yazar.
 *
 * Kapi burada, depoya yazan tek yerde: cagiran taraf kontrolu unutsa bile
 * yaratici kosu, asamasi bilinmeyen sonuc ya da bu tarayicide kilitli asama
 * hicbir seye dokunamaz (`checkRunRecordable`). Co-op ve ozel harita kendi
 * anahtarina yaziliyor; solo rekora karismiyor.
 *
 * `source` asama ilerlemesine giden kaynakla ayni: odanin asamasi ve iki
 * kaynaktan birlesmis yaratici bayragi.
 */
export function recordRun(
  run: RunSummary | undefined,
  source: ProgressRecordSource,
  local: RunRecordLocal,
  now = Date.now()
): RunRecordOutcome {
  if (!run) return { status: "skipped", reason: "missing" };
  const gate = checkRunRecordable(run, source, getClearedStages());
  if (!gate.ok) return { status: "skipped", reason: gate.reason };
  if (typeof run.id !== "string" || recordedRunIds.has(run.id)) return { status: "skipped", reason: "duplicate" };

  const log = getRunLog();
  if (log.some((entry) => entry.id === run.id)) {
    recordedRunIds.add(run.id);
    return { status: "skipped", reason: "duplicate" };
  }
  const entry = createRunLogEntry(run, local, now);
  const applied = applyRunToBook(getRecordBook(), run, local);
  if (!entry || !applied) return { status: "skipped", reason: "invalid" };

  recordedRunIds.add(run.id);
  const savedRecords = writeJson(RECORDS_STORAGE_KEY, serializeRecordBook(applied.book));
  const savedLog = writeJson(RUN_LOG_STORAGE_KEY, serializeRunLog(appendRunLog(log, entry)));
  return { status: "recorded", key: applied.key, merge: applied.merge, saved: savedRecords && savedLog };
}
