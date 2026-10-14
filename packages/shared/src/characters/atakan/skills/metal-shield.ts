import { GAME_SPEED_MULTIPLIER } from "../../../tower-stats/index.js";
import { COUNTER_SURGE_WIDTH_COLUMNS } from "../../../waves/special-enemies.js";
import { lt } from "../../../i18n/index.js";

/**
 * Metal Kalkan: AttackLord'un ikinci becerisi (yuva 1), Refactor'un yerine.
 *
 * Yeni kullanim dili: Beceriler sekmesinden silahlandirma yok. Oyuncu haritaya
 * basip surukluyor; basis noktasindan birakis noktasina, herhangi bir acida
 * duz bir kalkan cekiliyor. Kalkan 3 sn (oyun suresi) duruyor, yikilmaz:
 * cani yok, hedef alinamaz. Yer dusmanlari icinden gecemez; karsi atagin
 * kalkana denk gelen kismi orada durur.
 *
 * Bu dosya iki tarafin ortak kurali: sabitler, parca geometrisi, jestin saf
 * durum makinesi ve tel kaydi. Sunucu dogrulamayi ve engellemeyi, istemci
 * onizlemeyi buradan okuyor.
 */
export const ATAKAN_SHIELD_SLOT = 1;
/** Kalkanin omru, oyun suresi (ms); duvar saatinde `/ GAME_SPEED_MULTIPLIER`. */
export const METAL_SHIELD_DURATION_MS = 3000;
/** Bekleme suresi (ms); beceri tablosundaki degerle ayni olmali. */
export const METAL_SHIELD_COOLDOWN_MS = 30_000;
/** Sunucunun kabul ettigi en kisa kalkan, hucre cinsinden. */
export const METAL_SHIELD_MIN_LENGTH_CELLS = 0.5;
/**
 * Jestin esigi: basis noktasindan en az bu kadar (hucre) uzaklasmadan
 * onizleme cikmaz. Duz dokunus ve kucuk el titremesi asla kalkan cekmez.
 */
export const METAL_SHIELD_DRAG_THRESHOLD_CELLS = 0.6;
/** Esigin ekrandaki tabani (CSS pikseli): kucuk hucreli buyuk haritada da parmak payi. */
export const METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX = 14;
/** Kalkan belirirken cizgiye bu kadar (hucre) yakin duran dusman kendi tarafina itilir. */
export const METAL_SHIELD_CLEARANCE_CELLS = 0.18;
/** Ayni anda sahada durabilecek kalkan (co-op'ta birden fazla AttackLord). */
export const METAL_SHIELD_MAX_ACTIVE = 8;

/** En uzun kalkan: karsi atak seridinin genisligi (sutun sayisi x hucre). */
export function getMetalShieldMaxLength(gridSize: number) {
  return COUNTER_SURGE_WIDTH_COLUMNS * gridSize;
}

export function getMetalShieldMinLength(gridSize: number) {
  return METAL_SHIELD_MIN_LENGTH_CELLS * gridSize;
}

/** Kalkanin duvar saatindeki omru (ms): sunucudaki `scaleGameDuration` ile ayni. */
export function getMetalShieldWallDurationMs() {
  return METAL_SHIELD_DURATION_MS / GAME_SPEED_MULTIPLIER;
}

/**
 * Jest esigi, dunya birimi: `METAL_SHIELD_DRAG_THRESHOLD_CELLS` hucre, ama
 * ekranda en az `METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX` piksel.
 * `worldPerScreenPx`: bir CSS pikselinin dunya birimi karsiligi.
 */
export function getMetalShieldDragThreshold(gridSize: number, worldPerScreenPx: number) {
  const screenFloor = Number.isFinite(worldPerScreenPx) && worldPerScreenPx > 0 ? METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX * worldPerScreenPx : 0;
  return Math.max(METAL_SHIELD_DRAG_THRESHOLD_CELLS * gridSize, screenFloor);
}

export type MetalShieldSegment = { x1: number; y1: number; x2: number; y2: number };

/**
 * Snapshot'taki kalkan kaydi (`shields`): yalnizca kalkan varken telde.
 * `ms` kalan omur (duvar saati); toplam omur `getMetalShieldWallDurationMs`.
 */
export type MetalShieldSnapshot = MetalShieldSegment & { id: number; ms: number };

/**
 * Kalkan reddi (`skill:rejected`): "bounds" nokta harita disi, "short" cok
 * kisa, "invalid" eksik/bozuk istek ya da mac bitti. Bekleme harcanmaz.
 */
export type MetalShieldRejectReason = "bounds" | "short" | "invalid";

export function getMetalShieldRejectText(reason: MetalShieldRejectReason) {
  if (reason === "short") return lt("Kalkan çok kısa", "Shield too short");
  if (reason === "bounds") return lt("Kalkan harita dışına çekilemez", "The shield must stay on the map");
  return lt("Kalkan çekilemedi", "Shield could not be drawn");
}

/**
 * Parcayi en fazla `maxLength` uzunluga kirpar: yon korunur, uc one cekilir.
 * Sifir uzunlukta parca oldugu gibi doner.
 */
export function clampMetalShieldSegment(x1: number, y1: number, x2: number, y2: number, maxLength: number): MetalShieldSegment & { length: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (!(length > maxLength) || !(length > 0)) {
    return { x1, y1, x2, y2, length };
  }
  const scale = maxLength / length;
  return { x1, y1, x2: x1 + dx * scale, y2: y1 + dy * scale, length: maxLength };
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function withinBox(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  return px >= Math.min(ax, bx) && px <= Math.max(ax, bx) && py >= Math.min(ay, by) && py <= Math.max(ay, by);
}

/**
 * Iki parca kesisiyor mu. Dokunma ve ust uste binme de kesisme sayiliyor:
 * kalkan icin supheli durumda "gecilmez" demek dogru taraf.
 */
export function segmentsTouch(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
) {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && withinBox(cx, cy, dx, dy, ax, ay)) return true;
  if (d2 === 0 && withinBox(cx, cy, dx, dy, bx, by)) return true;
  if (d3 === 0 && withinBox(ax, ay, bx, by, cx, cy)) return true;
  if (d4 === 0 && withinBox(ax, ay, bx, by, dx, dy)) return true;
  return false;
}

/**
 * Noktanin parcaya uzakligi ve hangi yaninda durdugu. `side` kalkanin
 * normaline gore +1/-1; tam cizgideyse +1 (belirlenimli).
 */
export function getPointToSegment(px: number, py: number, segment: MetalShieldSegment) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - segment.x1) * dx + (py - segment.y1) * dy) / lengthSq)) : 0;
  const nearX = segment.x1 + dx * t;
  const nearY = segment.y1 + dy * t;
  const cross = dx * (py - segment.y1) - dy * (px - segment.x1);
  return { distance: Math.hypot(px - nearX, py - nearY), side: cross < 0 ? -1 : 1, t, nearX, nearY };
}

// --- Jest ------------------------------------------------------------------------

/**
 * Jestin durumu. Sahne yalnizca olaylari (basis, hareket, birakis, iptal)
 * buraya tasiyor; karar burada, cizim ve mesaj sahnede.
 */
export type MetalShieldGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  /** "cooldown": bekleme suresinde baslandi; onizleme yok, yalnizca bir kez bildirim. */
  mode: "ready" | "cooldown";
  /** Esik asildi ve geri donulmedi: cizilen onizleme (uc azami uzunlukta kirpilmis). */
  preview?: MetalShieldSegment;
  /** Hazir kipte esik en az bir kez asildi: birakis siradan dokunus sayilmaz. */
  dragged: boolean;
  /** Iptal edildi (ikinci parmak, harita disi, araya giren baska eylem); birakisa kadar olu. */
  dead: boolean;
  /** Bekleme bildirimi bu jestte gosterildi (tekrar yok). */
  noticed: boolean;
};

export type MetalShieldGesturePointer = {
  pointerId: number;
  /** "mouse" | "touch" | "pen"; farede yalnizca ana tus (0) jest baslatir. */
  pointerType?: string;
  button?: number;
  /** Dunya koordinati. */
  x: number;
  y: number;
};

export type MetalShieldGestureContext = {
  /** Operator AttackLord, mac suruyor ve beceri kullanilabilir. */
  available: boolean;
  /**
   * Haritada baska bir eylem bekliyor ya da suruyor (kule yerlestirme,
   * Yonlendirme / Execute hedeflemesi, isci hedefi, ulti sutunu, esya
   * yerlestirme, isci yasagi) ya da basis surukleme anlami olan bir seyin
   * ustunde (performans kolu, sat dugmesi).
   */
  busy: boolean;
  /** Kalan bekleme, saniye; 0 hazir. */
  cooldownSeconds: number;
  /** Isaretcinin noktasi harita icinde mi. */
  inside: boolean;
  /** Hucre boyu, dunya birimi. */
  gridSize: number;
  /** Bir CSS pikselinin dunya birimi karsiligi. */
  worldPerScreenPx: number;
};

/**
 * Basis. Uygunsa jest izlenmeye baslar (henuz hicbir sey gorunmez). Izlenen
 * bir jest varken gelen ikinci parmak jesti oldurur.
 */
export function beginMetalShieldGesture(
  current: MetalShieldGesture | undefined,
  pointer: MetalShieldGesturePointer,
  context: MetalShieldGestureContext
): MetalShieldGesture | undefined {
  if (current && current.pointerId !== pointer.pointerId) {
    return { ...current, preview: undefined, dead: true };
  }
  if (!context.available || context.busy || !context.inside) return undefined;
  if (pointer.pointerType === "mouse" && pointer.button !== undefined && pointer.button !== 0) return undefined;
  if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return undefined;
  return {
    pointerId: pointer.pointerId,
    startX: pointer.x,
    startY: pointer.y,
    mode: context.cooldownSeconds > 0 ? "cooldown" : "ready",
    dragged: false,
    dead: false,
    noticed: false
  };
}

/**
 * Hareket. Esigin disinda onizleme var (azami uzunlukta kirpilmis), icine
 * donulurse kalkar. Harita disina cikmak ya da araya giren baska bir eylem
 * jesti oldurur. Bekleme kipinde onizleme hic yok; esik ilk asildiginda
 * `cooldownNotice` (kalan saniye) bir kez doner.
 */
export function moveMetalShieldGesture(
  gesture: MetalShieldGesture | undefined,
  pointer: MetalShieldGesturePointer,
  context: MetalShieldGestureContext
): { gesture: MetalShieldGesture | undefined; cooldownNotice?: number } {
  if (!gesture || gesture.pointerId !== pointer.pointerId || gesture.dead) return { gesture };
  if (!context.available || context.busy || !context.inside || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) {
    return { gesture: { ...gesture, preview: undefined, dead: true } };
  }
  const distance = Math.hypot(pointer.x - gesture.startX, pointer.y - gesture.startY);
  const threshold = getMetalShieldDragThreshold(context.gridSize, context.worldPerScreenPx);
  if (distance < threshold) {
    return { gesture: gesture.preview ? { ...gesture, preview: undefined } : gesture };
  }
  if (gesture.mode === "cooldown") {
    if (gesture.noticed) return { gesture };
    return { gesture: { ...gesture, noticed: true }, cooldownNotice: Math.max(1, Math.ceil(context.cooldownSeconds)) };
  }
  const clamped = clampMetalShieldSegment(gesture.startX, gesture.startY, pointer.x, pointer.y, getMetalShieldMaxLength(context.gridSize));
  return { gesture: { ...gesture, dragged: true, preview: { x1: clamped.x1, y1: clamped.y1, x2: clamped.x2, y2: clamped.y2 } } };
}

/**
 * Birakis. Onizleme gorunurken birakmak kalkani ceker (`cast`). `consumed`:
 * birakis bir surukleme jestiydi ve siradan harita dokunusu olarak
 * islenmemeli (kalkan cekildi ya da cekilmekten vazgecildi). Esigi hic
 * asmamis jest ve bekleme kipi `consumed: false`: dokunus eskisi gibi isler.
 */
export function endMetalShieldGesture(
  gesture: MetalShieldGesture | undefined,
  pointer: MetalShieldGesturePointer,
  context: MetalShieldGestureContext
): { gesture: MetalShieldGesture | undefined; cast?: MetalShieldSegment; cooldownNotice?: number; consumed: boolean } {
  if (!gesture || gesture.pointerId !== pointer.pointerId) return { gesture, consumed: false };
  const moved = moveMetalShieldGesture(gesture, pointer, context);
  const final = moved.gesture ?? gesture;
  if (!final.dead && final.mode === "ready" && final.preview) {
    return { gesture: undefined, cast: final.preview, consumed: true };
  }
  return { gesture: undefined, cooldownNotice: moved.cooldownNotice, consumed: final.dragged };
}
