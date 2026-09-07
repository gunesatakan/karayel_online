import { STAGE_COUNT, getHighestUnlockedStage, isStageUnlocked } from "@karayel/shared";

/**
 * Asama ilerlemesi tarayicida duruyor.
 *
 * Sunucu tarafinda hesap yok: oyunun hesabi da, harita kayitlari da, oyuncu adi
 * da zaten tarayicida tutuluyor ve ilerlemeyi tek basina sunucuya tasimak, oda
 * bazli calisan bir mimariye hesap katmayi gerektirirdi. Kurcalanabilir olmasi
 * kabul edilmis bir bedel -- burada korunacak bir siralama ya da odul yok,
 * yalnizca oyuncunun kendi acilislari.
 */
const STORAGE_KEY = "karayel_stage_progress";

type StoredProgress = {
  cleared: number[];
};

/**
 * Okuma her zaman temizlenmis bir liste donduruyor.
 *
 * Depo elle duzenlenebilir ve eski bir surumden kalmis olabilir: sayi olmayan,
 * arali disi ve yinelenen degerler burada eleniyor. Cagiran taraf listeyi
 * dogrulamak zorunda kalmamali.
 */
export function getClearedStages(): number[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredProgress;
    const cleared = Array.isArray(parsed?.cleared) ? parsed.cleared : [];
    return [...new Set(
      cleared
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= STAGE_COUNT)
    )].sort((a, b) => a - b);
  } catch {
    // Depo kapali olabilir (gizli sekme, site verisi engelli). Ilerleme yoksa
    // oyun yine oynanabilir olmali, bu yuzden hata yutuluyor.
    return [];
  }
}

/**
 * Bir asamayi tamamlanmis olarak isaretler.
 *
 * Yeni bir asama acildiysa `unlockedStage` doner; menu basarim ekranini buna
 * bakarak gosteriyor. Zaten tamamlanmis bir asamayi tekrar bitirmek yeni bir
 * acilis uretmez -- oyuncu ayni ekrani her tekrar oynayista gormemeli.
 */
export function markStageCleared(stage: number): { alreadyCleared: boolean; unlockedStage?: number } {
  const cleared = getClearedStages();
  const alreadyCleared = cleared.includes(stage);
  if (alreadyCleared) {
    return { alreadyCleared: true };
  }

  const next = [...cleared, stage].sort((a, b) => a - b);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cleared: next } satisfies StoredProgress));
  } catch {
    // Yazilamadiysa oyun akisini durdurmuyoruz; oyuncu asamayi yine bitirdi.
  }

  const unlocked = stage + 1;
  return {
    alreadyCleared: false,
    unlockedStage: unlocked <= STAGE_COUNT && isStageUnlocked(unlocked, next) ? unlocked : undefined
  };
}

/** Menunun acilista secmesi gereken asama. */
export function getDefaultStage(): number {
  return getHighestUnlockedStage(getClearedStages());
}
