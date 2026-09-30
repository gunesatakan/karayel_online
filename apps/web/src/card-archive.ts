import {
  createEmptyCardArchive,
  markArchiveSeen,
  recordArchiveRun,
  sanitizeCardArchive,
  serializeCardArchive,
  type ArchiveKind,
  type ArchiveRun,
  type CardArchive
} from "@karayel/shared";

/**
 * Kart Arsivi tarayicida duruyor (stage-progress.ts ve run-records.ts ile ayni
 * desen). Kural (birlestirme, sayim, gorunum) paylasilan modulde; burada
 * yalnizca depo ve iki kapi var.
 *
 * Anahtar surumlu: bicim degisirse yeni anahtar aciliyor, eski veri yanlis
 * okunmuyor. Her okuma ve yazma try/catch icinde; depo kapali (gizli sekme,
 * engelli site verisi) ya da elle bozulmus olabilir. Iki durumda da kart
 * secimi, magaza ve menu calismaya devam ediyor; en kotu durumda arsiv bos.
 *
 * Her yazimdan once depo yeniden okunuyor: arsiv yalnizca buyuyor ve baska
 * bir sekmenin gordugu kartlar birlestirilerek korunuyor.
 */
const ARCHIVE_STORAGE_KEY = "karayel_archive_v1";

/**
 * Depo bu sayfada guvenilir mi.
 *
 * Okunamayan ya da yazilamayan depoda "YENİ" etiketi hic cikmiyor: gorulen
 * kart kalici olarak isaretlenemezse her kosuda ayni kartlar yine "yeni"
 * gorunurdu. Etiket yalan soylemektense hic gorunmemeli.
 */
let storageUsable = true;

/**
 * Bu sayfada sayilan kosular. Sonuc yeniden baglanmada ve `run:sync` ile
 * tekrar gelebiliyor; depo yazilamiyorsa arsivin kendi kimlik listesi
 * calismaz, bellekteki kume ayni sayfada ikinci sayimi her durumda kesiyor.
 */
const countedRunIds = new Set<string>();

function readArchive(): { archive: CardArchive; available: boolean } {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
  } catch {
    // Depo kapali: arsiv bos gorunuyor, etiket cikmiyor.
    storageUsable = false;
    return { archive: createEmptyCardArchive(), available: false };
  }
  if (!raw) return { archive: createEmptyCardArchive(), available: true };
  try {
    return { archive: sanitizeCardArchive(JSON.parse(raw)), available: true };
  } catch {
    // Icerik bozuk ama depo calisiyor: bos arsivle devam, ilk yazim duzeltir.
    return { archive: createEmptyCardArchive(), available: true };
  }
}

function writeArchive(archive: CardArchive) {
  try {
    window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(serializeCardArchive(archive)));
    return true;
  } catch {
    // Kota ya da engel: oyun akisi durmuyor, bu sayfada etiket de cikmiyor.
    storageUsable = false;
    return false;
  }
}

/** Menunun arsivi; her zaman temiz bir arsiv ve deponun durumu. */
export function readCardArchive() {
  return readArchive();
}

/**
 * Sunulan kartlari ya da esyalari gorulmus olarak yazar ve ilk kez
 * gorulenleri doner; "YENİ" etiketi bunlara iniyor.
 *
 * Kapi burada, depoya yazan tek yerde: yaratici kosu hicbir seyi gorulmus
 * yapmiyor (orada her kart elle acilabiliyor) ve etiket de cikmiyor. Depo
 * guvenilir degilse bos liste: etiket yok.
 */
export function markArchiveOffered(kind: ArchiveKind, ids: readonly string[], context: { creative: boolean }): string[] {
  if (context.creative || !storageUsable || ids.length === 0) return [];
  const { archive, available } = readArchive();
  if (!available) return [];
  const marked = markArchiveSeen(archive, kind, ids);
  if (marked.fresh.length === 0) return [];
  return writeArchive(marked.archive) ? marked.fresh : [];
}

/**
 * Bitmis kosunun destesini "kac kosuda secildi" sayacina yazar; kosu basina
 * bir kez. Kosu `getArchiveRun`dan geliyor: yaratici kosu orada eleniyor.
 */
export function recordArchiveRunResult(run: ArchiveRun | undefined): boolean {
  if (!run || countedRunIds.has(run.id)) return false;
  countedRunIds.add(run.id);
  const { archive, available } = readArchive();
  if (!available) return false;
  const recorded = recordArchiveRun(archive, run);
  if (!recorded.counted) return false;
  return writeArchive(recorded.archive);
}
