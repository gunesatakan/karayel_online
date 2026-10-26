/**
 * Egik 3D gorunumun kalite basamaklari: 3D katmanin piksel orani ve Phaser
 * tuvalinin dunya birimi basina pikseli (tuval karede iki kez 3D'ye doku olarak
 * kopyalaniyor; ekran kartinin asil yuku bu: olcek 1,25'ten 2,5'e cikinca kare
 * 8'den 20 ms'ye cikiyordu, 3D'nin 2 kat cozunurlugu ise ~1,5 ms). Ust basamak
 * 4K ekranda keskin.
 *
 * Kasmasin diye kare suresine bakiliyor (`stepQualityGovernor`): ortalama kare
 * 18,5 ms'yi (~55 kare) asarsa bir basamak iniliyor; kareler rahatsa 30 sn'de
 * bir bir basamak cikmak deneniyor, her geri iniste bekleme ikiye katlaniyor
 * (en cok 10 dk): yetmeyen cihaz ust basamagi ara sira bir saniyeligine dener.
 */
export type QualityLevel = { pixelRatio: number; boardScale: number };

export const DESKTOP_QUALITY: readonly QualityLevel[] = [
  { pixelRatio: 1, boardScale: 1.25 },
  { pixelRatio: 1.25, boardScale: 1.25 },
  { pixelRatio: 1.5, boardScale: 1.5 },
  { pixelRatio: 2, boardScale: 1.75 }
];
export const TOUCH_QUALITY: readonly QualityLevel[] = [
  { pixelRatio: 1, boardScale: 1 },
  { pixelRatio: 1.25, boardScale: 1.25 },
  { pixelRatio: 1.5, boardScale: 1.25 },
  { pixelRatio: 2, boardScale: 1.5 }
];
/**
 * Baslangic basamagi: masaustu en ust (2 / 1,75; Phaser'i 2,25'e cikarmak orta bir
 * ekran kartinda kareyi 14'ten 18 ms'ye tasiyordu), telefon bugunku (1,25 / 1,25).
 */
export const DESKTOP_QUALITY_START = 3;
export const TOUCH_QUALITY_START = 1;

const FRAME_MS = 1000 / 60;
const WINDOW_FRAMES = 45;
const SLOW_MS = 18.5;
const CALM_MS = 17.5;
const RAISE_EVERY_MS = 30000;
const MAX_BACKOFF_MS = 600000;

export type QualityGovernor = { level: number; last: number; average: number; frames: number; nextRaise: number; backoff: number };

export function createQualityGovernor(level: number, now: number): QualityGovernor {
  return { level, last: 0, average: FRAME_MS, frames: 0, nextRaise: now + RAISE_EVERY_MS, backoff: RAISE_EVERY_MS };
}

/** Her karede (`now` ms): basamagi gunceller ve dondurur. */
export function stepQualityGovernor(state: QualityGovernor, now: number, levelCount: number) {
  const delta = now - state.last;
  state.last = now;
  // Sekme arkadaydi ya da sayfa durdu: o aralik kare suresi degil.
  if (delta <= 0 || delta > 250) return state.level;
  state.average += (delta - state.average) * 0.05;
  state.frames += 1;
  if (state.frames < WINDOW_FRAMES) return state.level;
  state.frames = 0;
  if (state.average > SLOW_MS && state.level > 0) {
    state.level -= 1;
    state.nextRaise = now + state.backoff;
    state.backoff = Math.min(state.backoff * 2, MAX_BACKOFF_MS);
    state.average = FRAME_MS;
  } else if (state.average < CALM_MS && now >= state.nextRaise && state.level < levelCount - 1) {
    state.level += 1;
    state.nextRaise = now + RAISE_EVERY_MS;
    state.average = FRAME_MS;
  }
  return state.level;
}
