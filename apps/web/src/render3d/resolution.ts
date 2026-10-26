/**
 * Egik 3D gorunumun kalite basamaklari: 3D katmanin piksel orani ve Phaser
 * tuvalinin dunya birimi basina pikseli (tuval karede iki kez 3D'ye doku olarak
 * kopyalaniyor; ekran kartinin asil yuku bu: olcek 1,25'ten 2,5'e cikinca kare
 * 8'den 20 ms'ye cikiyordu, 3D'nin 2 kat cozunurlugu ise ~1,5 ms). Ust basamak
 * 4K ekranda keskin. Telefonda 3D ekranin kendi oranina kadar (en cok 3) cikiyor
 * ve 1,5'in altina inmiyor: telefon ekrani 3 kat yogun, 1,25'te cizilen kare 2,4
 * kat buyutulup bulanik gorunuyordu. Phaser tuvali telefonda 2D'deki gibi 2'ye kadar.
 *
 * Kasmasin diye kare suresine bakiliyor (`stepQualityGovernor`): 45 karelik
 * ortalama hedefin %11 ustundeyse (60 karede 18,5 ms) bir basamak iniliyor.
 * Inisin kareyi hizlandirip hizlandirmadigina bir sonraki pencerede bakiliyor:
 * hizlanmadiysa yavaslik ekran kartindan degil (pil tasarrufunun 30 kare siniri,
 * islemci); basamak geri aliniyor ve o hiz yeni hedef (netlik bosuna dusmuyor).
 * Hedef 60 kareden siki degil: 120 Hz ekranda 60 kare yetiyor. Kareler rahatsa
 * 30 sn'de bir bir basamak cikmak deneniyor, her geri iniste bekleme ikiye
 * katlaniyor (en cok 10 dk): yetmeyen cihaz ust basamagi ara sira bir saniyeligine dener.
 */
export type QualityLevel = { pixelRatio: number; boardScale: number };

export const DESKTOP_QUALITY: readonly QualityLevel[] = [
  { pixelRatio: 1, boardScale: 1.25 },
  { pixelRatio: 1.25, boardScale: 1.25 },
  { pixelRatio: 1.5, boardScale: 1.5 },
  { pixelRatio: 2, boardScale: 1.75 }
];
export const TOUCH_QUALITY: readonly QualityLevel[] = [
  { pixelRatio: 1.5, boardScale: 1.25 },
  { pixelRatio: 2, boardScale: 1.5 },
  { pixelRatio: 2.5, boardScale: 2 },
  { pixelRatio: 3, boardScale: 2 }
];
/**
 * Baslangic basamagi: masaustu en ust (2 / 1,75; Phaser'i 2,25'e cikarmak orta bir
 * ekran kartinda kareyi 14'ten 18 ms'ye tasiyordu), telefon bir alti (2,5 / 2):
 * kareler rahatsa 30 sn sonra en uste cikiyor.
 */
export const DESKTOP_QUALITY_START = 3;
export const TOUCH_QUALITY_START = 2;

const FRAME_MS = 1000 / 60;
const WINDOW_FRAMES = 45;
const SLOW_RATIO = 1.11;
const CALM_RATIO = 1.05;
/** Inis kareyi en az %10 hizlandirmadiysa yardim etmedi. */
const HELPED_RATIO = 0.9;
/** Hedefin bu katinin altina inen kare: 30 kare siniri kalkti. */
const LIFTED_RATIO = 0.8;
const RAISE_EVERY_MS = 30000;
const MAX_BACKOFF_MS = 600000;

export type QualityGovernor = {
  level: number;
  last: number;
  average: number;
  frames: number;
  nextRaise: number;
  backoff: number;
  /** Hedef kare suresi: 60 kare, cihaz daha hizli kare vermiyorsa onun hizi. */
  target: number;
  /** Son inis: hangi basamaktan ve o anki ortalama (bir sonraki pencerede sinanir). */
  probe?: { from: number; average: number };
};

export function createQualityGovernor(level: number, now: number): QualityGovernor {
  return { level, last: 0, average: FRAME_MS, frames: 0, nextRaise: now + RAISE_EVERY_MS, backoff: RAISE_EVERY_MS, target: FRAME_MS };
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
  const average = state.average;
  const probe = state.probe;
  state.probe = undefined;
  if (probe && average > probe.average * HELPED_RATIO) {
    // Inis kareyi hizlandirmadi: basamak geri, bu hiz cihazin siniri.
    state.level = probe.from;
    state.target = Math.max(FRAME_MS, average);
    state.backoff = Math.max(RAISE_EVERY_MS, state.backoff / 2);
    return state.level;
  }
  if (state.target > FRAME_MS && average < state.target * LIFTED_RATIO) state.target = FRAME_MS;
  if (average > state.target * SLOW_RATIO && state.level > 0) {
    state.probe = { from: state.level, average };
    state.level -= 1;
    state.nextRaise = now + state.backoff;
    state.backoff = Math.min(state.backoff * 2, MAX_BACKOFF_MS);
  } else if (average < state.target * CALM_RATIO && now >= state.nextRaise && state.level < levelCount - 1) {
    state.level += 1;
    state.nextRaise = now + RAISE_EVERY_MS;
  }
  return state.level;
}
