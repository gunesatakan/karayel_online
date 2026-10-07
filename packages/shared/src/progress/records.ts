import { FINAL_WAVE, getWaveAirMode } from "../balance/index.js";
import { enPlural, lt } from "../i18n/index.js";
import type { CharacterId } from "../index.js";
import { RUN_SUMMARY_VERSION, RUN_WAVE_HISTORY_LIMIT, type RunSummary } from "../run-trace/index.js";
import { STAGE_COUNT, canRecordProgress, shouldRecordStageClear, type ProgressRecordSource } from "../stages/index.js";

/**
 * Rekorlar, yildizlar ve kosu kaydi: mac sonu raporunun (`RunSummary`) kalici
 * ize donustugu yer.
 *
 * Kural burada, depo istemcide (apps/web/src/run-records.ts). Ayrim testler
 * icin: yildiz esikleri, kayit anahtari, birlestirme ve hedef satiri tarayici
 * olmadan dogrulanabilsin; istemci yalnizca okuyor, bu fonksiyonlardan
 * geciriyor ve yaziyor.
 *
 * Hepsi taninma. Rekor, yildiz ve kayit hicbir yoldan stat, altin, kart ya da
 * baslangic kulesi olarak oyuna geri donmuyor; donseydi her asama sessizce
 * kolaylasir ve oyuncu kendi gelisimini goremezdi. Yerel depo kurcalanabilir
 * (stage-progress.ts ayni bedeli kabul ediyor), bu yuzden bunlarin ustune
 * siralama ya da liderlik tablosu kurulmuyor.
 */

/**
 * ★★ icin bir kosuda gereken en az temiz dalga.
 *
 * Gecici deger: kosu kaydi biriktikce kalibre edilecek (temizlemelerin cogu
 * ★★★ aliyorsa esik kolay demektir). Ust uste olmasi gerekmiyor; tek bir
 * kotu hava dalgasi yildizi dusurmesin, ama dort sizintili dalga dusursun.
 */
export const TWO_STAR_CLEAN_WAVES = 16;

/** ★★★: butun dalgalar temiz. */
export const THREE_STAR_CLEAN_WAVES = FINAL_WAVE;

export const MAX_STAGE_STARS = 3;

export type StageStars = 0 | 1 | 2 | 3;

/** Kayit defterinin bicim surumu; depo anahtari da surumlu (`karayel_records_v1`). */
export const RECORD_BOOK_VERSION = 1;

/** Kosu kaydinin bicim surumu; ileride bir sunucuya yuklenecek birim bu. */
export const RUN_LOG_VERSION = 1;

/** Kosu kaydinda tutulan en fazla kosu; eskisi dusuyor. */
export const RUN_LOG_LIMIT = 50;

/**
 * Kayit anahtarinin kabul ettigi en fazla oyuncu. Odanin siniri (4) ile ayni;
 * burada ayrica tutuluyor cunku oda siniri sunucu sinifinin icinde.
 */
export const MAX_RECORD_PLAYER_COUNT = 4;

/**
 * Defterde tutulan en fazla anahtar. Gercek ust sinir 5 asama x 7 operator x
 * 4 oyuncu sayisi x 4 olcek = 560; sinir kurcalanmis bir deponun menuyu
 * yavaslatmasini engelliyor.
 */
export const MAX_RECORD_BOOK_ENTRIES = 1024;

/**
 * Kayit anahtarinin bildigi operatorler.
 *
 * `Record<CharacterId, true>` bilerek: yeni bir operator eklenip buraya
 * yazilmazsa derleme kiriliyor. Karakter katalogunu buraya cekmek bu kucuk
 * modulun butun karakter kitlerini yuklemesi demekti.
 */
const RECORD_CHARACTER_IDS: Record<CharacterId, true> = {
  zeynep: true,
  warrior: true,
  archer: true,
  mage: true,
  healer: true,
  tank: true,
  onur: true
};

/** Harita anahtari sunucudan geliyor (`arena@1`); ileride ozel harita ozeti de sigsin. */
const MAP_KEY_PATTERN = /^[a-z0-9@._:-]{1,48}$/i;
const RUN_ID_PATTERN = /^[a-z0-9-]{1,40}$/i;
const MAX_LOG_CARDS = 80;
const MAX_CARD_ID_LENGTH = 64;
/** Sayaclarin ust siniri; kurcalanmis dev sayi menude tasmasin. */
const MAX_COUNTER = 1_000_000;

export function isRecordCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && Object.hasOwn(RECORD_CHARACTER_IDS, value);
}

function isRecordStage(stage: unknown): stage is number {
  return typeof stage === "number" && Number.isInteger(stage) && stage >= 1 && stage <= STAGE_COUNT;
}

function isRecordPlayerCount(count: unknown): count is number {
  return typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= MAX_RECORD_PLAYER_COUNT;
}

function isRecordMapKey(mapKey: unknown): mapKey is string {
  return typeof mapKey === "string" && MAP_KEY_PATTERN.test(mapKey);
}

/** Tam sayiya cevirip sinira kistirir; sayi olmayan `fallback`. */
function clampInt(value: unknown, min: number, max: number, fallback = min) {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

/**
 * Asama yildizi; sizintiya bakiyor, kalan nexus canina degil.
 *
 * - ★ asama temizlendi;
 * - ★★ en az `TWO_STAR_CLEAN_WAVES` temiz dalga;
 * - ★★★ butun dalgalar temiz.
 *
 * Can bir notu tasiyamaz: kan bankasi her kurulum sonunda can dusuruyor (bir
 * kart secimini cezalandirirdi), iyilestirmeler sizintiyi sakliyor, kalkan
 * sizintiyi can degismeden yutuyor. Temiz dalga sunucunun defterinden geliyor
 * (`RunSummary.cleanWaves`); kalkanin tuttugu dusman orada zaten sizinti.
 *
 * Yenilgi yildiz almiyor: yildiz temizlenmis asamanin notu, yenilginin
 * ilerlemesi en iyi dalgada.
 */
export function computeStars(run: Pick<RunSummary, "result" | "cleanWaves">): StageStars {
  if (run.result !== "victory") return 0;
  const clean = clampInt(run.cleanWaves, 0, FINAL_WAVE, 0);
  if (clean >= THREE_STAR_CLEAN_WAVES) return 3;
  if (clean >= TWO_STAR_CLEAN_WAVES) return 2;
  return 1;
}

/** "★★☆": dolu ve bos yildiz; kac yildiz eksik oldugu da okunsun. */
export function formatStars(stars: number) {
  const filled = clampInt(stars, 0, MAX_STAGE_STARS, 0);
  return `${"★".repeat(filled)}${"☆".repeat(MAX_STAGE_STARS - filled)}`;
}

/**
 * Kayit anahtari: asama | operator | oyuncu sayisi | harita.
 *
 * Co-op ve ozel harita kosulari solo kayitlarla karismasin diye oyuncu sayisi
 * ve harita anahtarin parcasi: dort kisilik bir 14. dalga solo 14. dalgayla
 * ayni sey degil. Gecersiz parcada anahtar yok (`undefined`) ve kayit hic
 * yazilmiyor -- yanlis kayit geri alinamaz, eksik kayit zararsiz.
 */
export function recordKey(stage: number, characterId: CharacterId, playerCount: number, mapKey: string): string | undefined {
  if (!isRecordStage(stage) || !isRecordCharacterId(characterId) || !isRecordPlayerCount(playerCount) || !isRecordMapKey(mapKey)) {
    return undefined;
  }
  return `${stage}|${characterId}|${playerCount}|${mapKey}`;
}

export type RecordKeyParts = { stage: number; characterId: CharacterId; playerCount: number; mapKey: string };

/** Depodan okunan anahtari ayristirir; `recordKey`in uretmeyecegi her sey reddediliyor. */
export function parseRecordKey(key: unknown): RecordKeyParts | undefined {
  if (typeof key !== "string") return undefined;
  const parts = key.split("|");
  if (parts.length !== 4) return undefined;
  const [stageText, characterId, countText, mapKey] = parts;
  const stage = Number(stageText);
  const playerCount = Number(countText);
  if (!isRecordCharacterId(characterId)) return undefined;
  // Geri donusum kontrolu: "01" ya da "1.0" gibi ayni anahtarin ikinci yazimi
  // defterde ikinci bir kayit acmasin.
  if (recordKey(stage, characterId, playerCount, mapKey) !== key) return undefined;
  return { stage, characterId, playerCount, mapKey };
}

/**
 * Bir asama + operator + oyuncu sayisi + harita icin kalici kayit.
 *
 * `bestWave` ulasilan en uzak dalga: yenilgide dusulen dalga, zaferde son
 * dalga. Sure rekoru bilerek yok: kurulum suresiz, savasin suresi ise dusman
 * takvimiyle sinirli -- olculen sey cogunlukla kurulumun aceleye getirilip
 * getirilmedigi olurdu.
 */
export type StageRecord = {
  bestWave: number;
  clears: number;
  bestStars: number;
  bestCleanWaves: number;
  runs: number;
};

export const EMPTY_STAGE_RECORD: Readonly<StageRecord> = Object.freeze({
  bestWave: 0,
  clears: 0,
  bestStars: 0,
  bestCleanWaves: 0,
  runs: 0
});

/** Rekorun beslendigi alanlar; gercek `RunSummary` de, test icin kucuk bir nesne de olur. */
export type RecordableRun = Pick<RunSummary, "result" | "wave" | "cleanWaves">;

/** Kosunun ulastigi dalga; zafer her zaman son dalga. */
export function getRunReachedWave(run: Pick<RunSummary, "result" | "wave">) {
  if (run.result === "victory") return FINAL_WAVE;
  return clampInt(run.wave, 0, FINAL_WAVE, 0);
}

/** Hangi alanlar bu kosuyla iyilesti; "YENİ REKOR" buna bakiyor. */
export type RecordImprovements = {
  bestWave: boolean;
  /** Asama bu operatorle (bu anahtarda) ilk kez temizlendi. */
  firstClear: boolean;
  bestStars: boolean;
  bestCleanWaves: boolean;
};

export type RecordMerge = {
  /** Kosu islendikten sonraki kayit. */
  record: StageRecord;
  /** Kosudan onceki kayit; bu anahtarda ilk kosuysa yok. */
  previous?: StageRecord;
  /** Kosunun ulastigi dalga. */
  wave: number;
  stars: StageStars;
  cleanWaves: number;
  improved: RecordImprovements;
  /**
   * Onceki bir kayit vardi ve en az bir alani gecildi. Ilk kosu "rekor"
   * sayilmiyor: sifiri gecmek kutlanacak bir sey degil, ekranda "ilk kayıt".
   */
  newRecord: boolean;
};

/**
 * Kosuyu kayda isler; kayit hicbir alanda geriye gitmiyor.
 *
 * Iyilesme bayraklari onceki kayda gore; onceki kayit yoksa bos kayda gore
 * (ilk kosuda her sifir olmayan alan "iyilesti"). `newRecord` ikisini ayiriyor.
 * Temiz dalga yenilgide de sayiliyor: ★★ esigine yaklasmak yenilgide de
 * gorunen bir ilerleme.
 */
export function mergeRecord(previous: StageRecord | undefined, run: RecordableRun): RecordMerge {
  const base = previous ?? EMPTY_STAGE_RECORD;
  const victory = run.result === "victory";
  const wave = getRunReachedWave(run);
  const stars = computeStars(run);
  const cleanWaves = clampInt(run.cleanWaves, 0, FINAL_WAVE, 0);
  const record: StageRecord = {
    bestWave: Math.max(base.bestWave, wave),
    clears: Math.min(MAX_COUNTER, base.clears + (victory ? 1 : 0)),
    bestStars: Math.max(base.bestStars, stars),
    bestCleanWaves: Math.max(base.bestCleanWaves, cleanWaves),
    runs: Math.min(MAX_COUNTER, base.runs + 1)
  };
  const improved: RecordImprovements = {
    bestWave: wave > base.bestWave,
    firstClear: victory && base.clears === 0,
    bestStars: stars > base.bestStars,
    bestCleanWaves: cleanWaves > base.bestCleanWaves
  };
  const hadRecord = previous !== undefined && previous.runs > 0;
  const merge: RecordMerge = {
    record,
    wave,
    stars,
    cleanWaves,
    improved,
    newRecord: hadRecord && (improved.bestWave || improved.firstClear || improved.bestStars || improved.bestCleanWaves)
  };
  if (hadRecord) merge.previous = { ...previous };
  return merge;
}

/**
 * Rekor satirinin parcalari: bas ("Dalga 13/20" ya da yildizlar), ayirac ve
 * rozet ("YENİ REKOR (önceki 11)").
 *
 * Kosu raporu basi buyuk, rozeti ayri ciziyor; eski tek satir ayni parcalari
 * birlestiriyor. Iki yer ayni kelimeyi soylesin diye metin tek yerde.
 * `celebrated` rozetin altin yazilip yazilmayacagi: onceki bir kayit gecildi
 * ya da asama ilk kez temizlendi. Ilk kosunun "ilk kayıt"i kutlanmiyor.
 */
export type RecordChangeParts = {
  head: string;
  /** Rekor dalgada tire, digerlerinde nokta. */
  separator: " — " | " · ";
  badge: string;
  celebrated: boolean;
};

export function getRecordChangeParts(merge: RecordMerge): RecordChangeParts {
  const previous = merge.previous;
  const celebrated = merge.newRecord || merge.improved.firstClear;
  if (merge.stars > 0) {
    const head = formatStars(merge.stars);
    let badge = lt(`${merge.cleanWaves} temiz dalga`, `${merge.cleanWaves} clean ${enPlural(merge.cleanWaves, "wave", "waves")}`);
    if (merge.improved.firstClear) badge = lt("İLK TEMİZLEME", "FIRST CLEAR");
    else if (previous && merge.improved.bestStars) badge = lt(`YENİ REKOR (önceki ${formatStars(previous.bestStars)})`, `NEW RECORD (was ${formatStars(previous.bestStars)})`);
    else if (previous && merge.improved.bestCleanWaves) {
      badge = lt(
        `YENİ REKOR: ${merge.cleanWaves} temiz dalga (önceki ${previous.bestCleanWaves})`,
        `NEW RECORD: ${merge.cleanWaves} clean ${enPlural(merge.cleanWaves, "wave", "waves")} (was ${previous.bestCleanWaves})`
      );
    }
    return { head, separator: " · ", badge, celebrated };
  }
  const head = `${lt("Dalga", "Wave")} ${merge.wave}/${FINAL_WAVE}`;
  if (!previous) return { head, separator: " · ", badge: lt("ilk kayıt", "first record"), celebrated };
  if (merge.improved.bestWave) return { head, separator: " — ", badge: lt(`YENİ REKOR (önceki ${previous.bestWave})`, `NEW RECORD (was ${previous.bestWave})`), celebrated };
  // Daha erken biten ama daha temiz oynanan kosu da bir rekor: ★★ esigine
  // yaklasildigi yenilgide de gorunsun. "önceki" yazilmiyor: dalga basligiyla
  // satir 375 px'e sigmiyordu.
  if (merge.improved.bestCleanWaves) {
    return { head, separator: " · ", badge: lt(`YENİ REKOR: ${merge.cleanWaves} temiz dalga`, `NEW RECORD: ${merge.cleanWaves} clean ${enPlural(merge.cleanWaves, "wave", "waves")}`), celebrated };
  }
  const gap = previous.bestWave - merge.wave;
  // Temizlenmis asamada son dalgada dusmek rekora "esit" degil: rekor bir
  // temizleme. Satir o zaman kaydin gercek olcusunu, en iyi yildizi soyluyor.
  if (gap <= 0 && previous.clears > 0) {
    return { head, separator: " · ", badge: `${lt("en iyi", "best")} ${formatStars(previous.bestStars)}`, celebrated };
  }
  return { head, separator: " · ", badge: gap > 0 ? lt(`rekora ${gap} dalga`, `${gap} ${enPlural(gap, "wave", "waves")} short of record`) : lt("rekora eşit", "record tied"), celebrated };
}

/**
 * Sonuc ekraninin rekor satiri: "Dalga 13/20 — YENİ REKOR (önceki 11)".
 *
 * Yenilgide olcu dalga. Zaferde dalga hep son dalga, o yuzden satir yildizla
 * basliyor ve olcu ilk temizleme, yildiz ve temiz dalga oluyor. Rekorun
 * gerisinde kalan kosu da ne kadar yakin oldugunu duyuyor ("rekora 2 dalga"):
 * yenilgi ilerlemeye cevrilsin diye. 375 px'te tek satira sigacak kadar kisa.
 */
export function describeRecordChange(merge: RecordMerge): string {
  const parts = getRecordChangeParts(merge);
  return `${parts.head}${parts.separator}${parts.badge}`;
}

/**
 * Siradaki hedef satiri: en yakin iki hedef, kisa.
 *
 * Kayit bu kosu islendikten sonraki kayit olmali (`mergeRecord().record`).
 * Temizlenmemis asamada hedef bir sonraki dalga, yanina ★★ kosulu; temizlenmis
 * asamada eksik yildiz ve en iyi temiz dalga. Ust uste kosulari ayri ayri
 * saymak ("3 temiz dalga daha") yanlis olurdu: esik tek kosuda tutturuluyor.
 *
 * `run` verilirse son dalga oradan okunuyor; rapor ile satir ayni sayiyi
 * soylesin diye.
 *
 * "(en iyi N)" yalnizca N hedeflenen esigin altindaysa yaziliyor. En iyi temiz
 * dalga yenilgileri de sayiyor (ilerleme olarak); esigin ustundeki bir en iyi
 * ancak bir yenilgiden gelmis olabilir -- temizlemede o kadar temiz dalga
 * yildizi zaten verirdi. Onu yildiz hedefinin yanina yazmak "esik tutuldu ama
 * yildiz yok" diye kendini yalanlayan bir satir olurdu.
 */
export function nextGoal(record: StageRecord | undefined, run?: Pick<RunSummary, "finalWave">): string {
  const finalWave = run?.finalWave && run.finalWave > 0 ? run.finalWave : FINAL_WAVE;
  const current = record ?? EMPTY_STAGE_RECORD;
  if (current.clears === 0) {
    // Hic kosu yoksa ya da son dalgada olunduyse siradaki dalga yok: hedef
    // asamanin kendisi.
    const waveGoal = current.bestWave <= 0 || current.bestWave >= finalWave
      ? lt("Aşamayı temizle", "Clear the stage")
      : `${lt("Dalga", "Wave")} ${current.bestWave + 1}`;
    return lt(
      `Sıradaki hedef: ${waveGoal} · ★★ için ${TWO_STAR_CLEAN_WAVES} temiz dalga`,
      `Next goal: ${waveGoal} · ${TWO_STAR_CLEAN_WAVES} clean waves for ★★`
    );
  }
  const best = (threshold: number) => (current.bestCleanWaves < threshold ? ` (${lt("en iyi", "best")} ${current.bestCleanWaves})` : "");
  if (current.bestStars < 2) {
    return lt(
      `Sıradaki hedef: ★★ için ${TWO_STAR_CLEAN_WAVES} temiz dalga${best(TWO_STAR_CLEAN_WAVES)}`,
      `Next goal: ${TWO_STAR_CLEAN_WAVES} clean waves for ★★${best(TWO_STAR_CLEAN_WAVES)}`
    );
  }
  if (current.bestStars < MAX_STAGE_STARS) {
    return lt(
      `Sıradaki hedef: ★★★ için ${finalWave}/${finalWave} temiz dalga${best(THREE_STAR_CLEAN_WAVES)}`,
      `Next goal: ${finalWave}/${finalWave} clean waves for ★★★${best(THREE_STAR_CLEAN_WAVES)}`
    );
  }
  return lt("Sıradaki hedef: ★★★ tamam · başka bir operatörle dene", "Next goal: ★★★ done · try another operator");
}

/**
 * Bir sonraki yildizin temiz dalga esigi; ★★★'te yok.
 *
 * Raporun "En iyi" rozeti ile hedef satiri ayni kurali okusun: en iyi temiz
 * dalga bu esigin altinda degilse bir yenilgiden gelmistir ve yildizin yanina
 * yazilmaz.
 */
export function getNextStarCleanWaves(stars: number): number | undefined {
  if (stars < 2) return TWO_STAR_CLEAN_WAVES;
  if (stars < MAX_STAGE_STARS) return THREE_STAR_CLEAN_WAVES;
  return undefined;
}

/**
 * Hava dalgalari: asama satirinda ve raporda kontrol noktasi.
 *
 * Kural `getWaveAirMode`dan turetiliyor (5/10 tamamen hava, 15/20 karisik);
 * elle yazilsaydi dengedeki bir degisiklik menude yalan soylerdi.
 */
export const AIR_CHECKPOINT_WAVES: readonly number[] = Object.freeze(
  Array.from({ length: FINAL_WAVE }, (_, index) => index + 1).filter((wave) => getWaveAirMode(wave) !== "none")
);

export type AirCheckpoint = {
  wave: number;
  mode: "all" | "mixed";
  /** Bu dalga bir kosuda gecildi: daha ileri gidildi ya da asama temizlendi. */
  passed: boolean;
};

/**
 * Kaydin hava dalgasi isaretleri.
 *
 * 13. dalgada olen kosu 10'u gecmis ama 13'u gecmemis: gecildi sayilmak icin
 * `bestWave` dalgadan buyuk olmali. Son dalga yalnizca temizlemeyle geciliyor.
 */
export function getAirCheckpoints(record?: Pick<StageRecord, "bestWave" | "clears">): AirCheckpoint[] {
  const bestWave = record?.bestWave ?? 0;
  const cleared = (record?.clears ?? 0) > 0;
  return AIR_CHECKPOINT_WAVES.map((wave) => ({
    wave,
    mode: getWaveAirMode(wave) === "all" ? "all" : "mixed",
    passed: cleared || bestWave > wave
  }));
}

/** Depodaki kayit; bozuk alanlar kistirilip tutarli hale getiriliyor. */
export function sanitizeStageRecord(raw: unknown): StageRecord | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const clears = clampInt(source.clears, 0, MAX_COUNTER, 0);
  const record: StageRecord = {
    bestWave: clampInt(source.bestWave, 0, FINAL_WAVE, 0),
    clears,
    bestStars: clampInt(source.bestStars, 0, MAX_STAGE_STARS, 0),
    bestCleanWaves: clampInt(source.bestCleanWaves, 0, FINAL_WAVE, 0),
    runs: Math.max(clampInt(source.runs, 0, MAX_COUNTER, 0), clears)
  };
  // Tutarlilik: temizlenmis asama son dalgaya ulasmis ve en az bir yildizli;
  // temizlenmemis asamanin yildizi olamaz. Elle duzenlenmis depo menuye
  // celisik bir satir yazdirmasin.
  if (clears > 0) {
    record.bestWave = FINAL_WAVE;
    record.bestStars = Math.max(1, record.bestStars);
  } else {
    record.bestStars = 0;
  }
  return record.runs > 0 ? record : undefined;
}

export type RecordBook = Record<string, StageRecord>;

/** Depoya yazilan bicim. */
export type StoredRecordBook = { v: typeof RECORD_BOOK_VERSION; records: RecordBook };

/**
 * Depodan okunan defter; her zaman temiz bir defter donuyor.
 *
 * Surumu tutmayan, anahtari `recordKey`in uretmeyecegi ya da kaydi bozuk olan
 * her sey eleniyor. Bozuk depo menuyu kirmamali; en kotu durumda rekor yok.
 */
export function sanitizeRecordBook(raw: unknown): RecordBook {
  const book: RecordBook = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return book;
  const stored = raw as Partial<StoredRecordBook>;
  if (stored.v !== RECORD_BOOK_VERSION || !stored.records || typeof stored.records !== "object" || Array.isArray(stored.records)) {
    return book;
  }
  let count = 0;
  for (const [key, value] of Object.entries(stored.records)) {
    if (count >= MAX_RECORD_BOOK_ENTRIES) break;
    if (!parseRecordKey(key)) continue;
    const record = sanitizeStageRecord(value);
    if (!record) continue;
    book[key] = record;
    count += 1;
  }
  return book;
}

export function serializeRecordBook(book: RecordBook): StoredRecordBook {
  return { v: RECORD_BOOK_VERSION, records: book };
}

/**
 * Kosu kaydinin bir satiri: son 50 kosu, yalnizca ekleniyor.
 *
 * Esik kalibrasyonunu (yildiz dagilimi, ne siklikla yeni rekor) besliyor ve
 * ileride bir sunucuya yuklenecek birim bu. Takimin sayilari (oldurme,
 * sizinti) ve yerel oyuncunun destesi; baskasinin destesi bu tarayicinin
 * kaydi degil.
 */
export type RunLogEntry = {
  v: typeof RUN_LOG_VERSION;
  /** Sunucunun kosu kimligi; ayni kosu iki kez yazilmiyor. */
  id: string;
  /** Kaydin yazildigi an (ms). */
  at: number;
  key: string;
  stage: number;
  characterId: CharacterId;
  playerCount: number;
  mapKey: string;
  /** Yerel oyuncunun yuvasi. */
  slot: number;
  result: "victory" | "defeat";
  wave: number;
  stars: StageStars;
  kills: number;
  leaks: number;
  cleanWaves: number;
  bestCleanStreak: number;
  /** Dalga sirasiyla sizinti sayisi; yenilgi dalgasi da dahil. */
  leakHistory: number[];
  /** Yerel oyuncunun sectigi kartlar, secim sirasiyla. */
  cards: string[];
  /** Kosunun en cok hasar veren kulesi. */
  mvp?: { definitionId: string; damage: number; slot: number };
};

/** Kaydin yazildigi yerel oyuncu. */
export type RunRecordLocal = { slot: number; characterId: CharacterId };

/**
 * Yerel oyuncunun operatoru: raporun kendi satirindan (sunucu).
 *
 * Rapor oyuncu listesini tasiyorsa yerel yuvanin satiri orada olmali. Satiri
 * olmayan oyuncu bu kosuyu oynamadi -- mac bittikten sonra odaya girdi ya da
 * baskasinin yuvasini devraldi -- ve kosunun rekoru, yildizi ve kosu kaydi
 * onun degil: `undefined`, kayit hic yazilmiyor. Istemcinin secimine yalnizca
 * listesi olmayan bir raporda dusuluyor; satir varken ikisi ayrisirsa oynanan
 * operator sunucudaki.
 */
export function resolveRunCharacter(run: Pick<RunSummary, "players">, local: RunRecordLocal): CharacterId | undefined {
  if (Array.isArray(run.players)) {
    // Bos liste de "bu kosuda yoktun" demek: kimsenin satiri yoksa kimse kaydetmiyor.
    const own = run.players.find((player) => player?.slot === local.slot);
    return own && isRecordCharacterId(own.characterId) ? own.characterId : undefined;
  }
  return isRecordCharacterId(local.characterId) ? local.characterId : undefined;
}

/** Kosunun kayit anahtari; gecersizse ya da yerel oyuncu kosuda yoksa yok. */
export function getRunRecordKey(run: Pick<RunSummary, "stage" | "playerCount" | "mapKey" | "players">, local: RunRecordLocal) {
  const characterId = resolveRunCharacter(run, local);
  return characterId ? recordKey(run.stage, characterId, run.playerCount, run.mapKey) : undefined;
}

function sanitizeCards(cards: unknown): string[] {
  if (!Array.isArray(cards)) return [];
  return cards
    .filter((card): card is string => typeof card === "string" && card.length > 0 && card.length <= MAX_CARD_ID_LENGTH)
    .slice(0, MAX_LOG_CARDS);
}

/** Rapordan kosu kaydi satiri; anahtar kurulamiyorsa ya da yerel oyuncu kosuda yoksa yok. */
export function createRunLogEntry(run: RunSummary, local: RunRecordLocal, at: number): RunLogEntry | undefined {
  const characterId = resolveRunCharacter(run, local);
  const key = characterId ? recordKey(run.stage, characterId, run.playerCount, run.mapKey) : undefined;
  if (!characterId || !key || typeof run.id !== "string" || !RUN_ID_PATTERN.test(run.id)) return undefined;
  const own = Array.isArray(run.players) ? run.players.find((player) => player.slot === local.slot) : undefined;
  const entry: RunLogEntry = {
    v: RUN_LOG_VERSION,
    id: run.id,
    at: clampInt(at, 0, Number.MAX_SAFE_INTEGER, 0),
    key,
    stage: run.stage,
    characterId,
    playerCount: run.playerCount,
    mapKey: run.mapKey,
    slot: clampInt(local.slot, 0, MAX_RECORD_PLAYER_COUNT - 1, 0),
    result: run.result,
    wave: getRunReachedWave(run),
    stars: computeStars(run),
    kills: clampInt(run.kills, 0, MAX_COUNTER, 0),
    leaks: clampInt(run.leaks, 0, MAX_COUNTER, 0),
    cleanWaves: clampInt(run.cleanWaves, 0, FINAL_WAVE, 0),
    bestCleanStreak: clampInt(run.bestCleanStreak, 0, FINAL_WAVE, 0),
    leakHistory: (Array.isArray(run.waves) ? run.waves : [])
      .slice(-RUN_WAVE_HISTORY_LIMIT)
      .map((record) => clampInt(record?.l, 0, MAX_COUNTER, 0)),
    cards: sanitizeCards(own?.cards)
  };
  if (run.mvp && typeof run.mvp.definitionId === "string" && run.mvp.definitionId.length <= MAX_CARD_ID_LENGTH) {
    entry.mvp = {
      definitionId: run.mvp.definitionId,
      damage: clampInt(run.mvp.damage, 0, Number.MAX_SAFE_INTEGER, 0),
      slot: clampInt(run.mvp.slot, -1, MAX_RECORD_PLAYER_COUNT - 1, -1)
    };
  }
  return entry;
}

/**
 * Kayda bir kosu ekler: ayni kimlik ikinci kez yazilmiyor, en yeni `limit`
 * kosu kaliyor. Yeni dizi donuyor; depodan okunan dizi degismiyor.
 */
export function appendRunLog(log: readonly RunLogEntry[], entry: RunLogEntry, limit = RUN_LOG_LIMIT): RunLogEntry[] {
  if (log.some((existing) => existing.id === entry.id)) return [...log];
  const next = [...log, entry];
  return next.slice(Math.max(0, next.length - Math.max(1, Math.floor(limit))));
}

/** Depodaki kayit satiri; bozuksa yok. */
export function sanitizeRunLogEntry(raw: unknown): RunLogEntry | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  if (source.v !== RUN_LOG_VERSION) return undefined;
  if (typeof source.id !== "string" || !RUN_ID_PATTERN.test(source.id)) return undefined;
  const parts = parseRecordKey(source.key);
  if (!parts) return undefined;
  if (source.result !== "victory" && source.result !== "defeat") return undefined;
  const entry: RunLogEntry = {
    v: RUN_LOG_VERSION,
    id: source.id,
    at: clampInt(source.at, 0, Number.MAX_SAFE_INTEGER, 0),
    key: source.key as string,
    stage: parts.stage,
    characterId: parts.characterId,
    playerCount: parts.playerCount,
    mapKey: parts.mapKey,
    slot: clampInt(source.slot, 0, MAX_RECORD_PLAYER_COUNT - 1, 0),
    result: source.result,
    wave: clampInt(source.wave, 0, FINAL_WAVE, 0),
    stars: source.result === "victory" ? (clampInt(source.stars, 1, MAX_STAGE_STARS, 1) as StageStars) : 0,
    kills: clampInt(source.kills, 0, MAX_COUNTER, 0),
    leaks: clampInt(source.leaks, 0, MAX_COUNTER, 0),
    cleanWaves: clampInt(source.cleanWaves, 0, FINAL_WAVE, 0),
    bestCleanStreak: clampInt(source.bestCleanStreak, 0, FINAL_WAVE, 0),
    leakHistory: (Array.isArray(source.leakHistory) ? source.leakHistory : [])
      .slice(-RUN_WAVE_HISTORY_LIMIT)
      .map((value) => clampInt(value, 0, MAX_COUNTER, 0)),
    cards: sanitizeCards(source.cards)
  };
  const mvp = source.mvp as Record<string, unknown> | undefined;
  if (mvp && typeof mvp === "object" && typeof mvp.definitionId === "string" && mvp.definitionId.length > 0 && mvp.definitionId.length <= MAX_CARD_ID_LENGTH) {
    entry.mvp = {
      definitionId: mvp.definitionId,
      damage: clampInt(mvp.damage, 0, Number.MAX_SAFE_INTEGER, 0),
      slot: clampInt(mvp.slot, -1, MAX_RECORD_PLAYER_COUNT - 1, -1)
    };
  }
  return entry;
}

/** Depoya yazilan kosu kaydi bicimi. */
export type StoredRunLog = { v: typeof RUN_LOG_VERSION; runs: RunLogEntry[] };

/** Depodan okunan kosu kaydi; bozuk satirlar ve yinelenen kimlikler eleniyor. */
export function sanitizeRunLog(raw: unknown): RunLogEntry[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const stored = raw as Partial<StoredRunLog>;
  if (stored.v !== RUN_LOG_VERSION || !Array.isArray(stored.runs)) return [];
  const seen = new Set<string>();
  const entries: RunLogEntry[] = [];
  for (const value of stored.runs.slice(-RUN_LOG_LIMIT)) {
    const entry = sanitizeRunLogEntry(value);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

export function serializeRunLog(log: readonly RunLogEntry[]): StoredRunLog {
  return { v: RUN_LOG_VERSION, runs: [...log] };
}

export type RunRecordSkipReason = "creative" | "stage" | "mismatch" | "version" | "locked";

export type RunRecordGate = { ok: true; stage: number } | { ok: false; reason: RunRecordSkipReason };

/**
 * Bu kosu bu tarayicinin kaydina yazilabilir mi.
 *
 * Asama ilerlemesinin kapisiyla (`canRecordProgress`) ayni kurallar ve bir
 * fazlasi:
 * - yaratici kosu hic yazmaz (bayrak raporda ya da istemcide aciksa);
 * - asama bilinmiyorsa ya da odanin asamasi raporunkiyle tutmuyorsa yazmaz;
 * - raporun bicimi bu istemcinin bildigi bicim degilse yazmaz;
 * - bu tarayicide henuz acik olmayan asama (co-op'ta ev sahibinin asamasi)
 *   yazmaz: o asamanin rekoru, oyuncunun kendi yolunda ulasmadigi bir yerde
 *   duruyor olurdu (`shouldRecordStageClear` ile ayni zincir).
 */
export function checkRunRecordable(
  run: Pick<RunSummary, "version" | "stage" | "creative">,
  source: ProgressRecordSource,
  clearedStageIds: readonly number[]
): RunRecordGate {
  if (run.creative === true || source.creative === true) return { ok: false, reason: "creative" };
  if (!canRecordProgress(source)) return { ok: false, reason: "stage" };
  if (run.stage !== source.stage) return { ok: false, reason: "mismatch" };
  if (run.version !== RUN_SUMMARY_VERSION) return { ok: false, reason: "version" };
  if (!shouldRecordStageClear(source.stage, clearedStageIds)) return { ok: false, reason: "locked" };
  return { ok: true, stage: source.stage };
}

/**
 * Kosuyu deftere isler; yeni defter, anahtar ve birlestirme sonucu doner.
 * Defter degismiyor (depodan okunan nesne yeniden kullanilabilir). Anahtar
 * kurulamiyorsa yok.
 */
export function applyRunToBook(
  book: RecordBook,
  run: RunSummary,
  local: RunRecordLocal
): { book: RecordBook; key: string; merge: RecordMerge } | undefined {
  const key = getRunRecordKey(run, local);
  if (!key) return undefined;
  const merge = mergeRecord(book[key], run);
  return { book: { ...book, [key]: merge.record }, key, merge };
}
