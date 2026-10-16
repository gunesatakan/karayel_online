import type { CharacterId } from "../index.js";
import { WALL_LINE_DWELL_MS, WALL_LINE_DWELL_TOLERANCE_PX } from "../placement/wall-line.js";
import { METAL_SHIELD_DRAG_THRESHOLD_CELLS, METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX } from "../characters/atakan/skills/metal-shield.js";
import { lt } from "../i18n/index.js";

/**
 * Harita jestiyle beceri: Beceriler sekmesine gitmeden, haritaya dokunarak.
 *
 * Jest becerinin SIRASINA bagli, karaktere degil; her operatorde ayni:
 *   - 1. beceri (yuva 0): basili tut, halka dolsun, sonra surukle ("hold").
 *   - 2. beceri (yuva 1): duz surukle ("drag"), bugunku Metal Kalkan gibi.
 *   - 3. beceri (yuva 2): iki parmakla surukle ("two"); farede sag tusla surukle.
 *
 * Ayrim kurali:
 *   - Esigi (`getSkillGestureThresholds().min`) gecmeyen her sey dokunustur ve
 *     bugunku gibi isler (kule secimi, yerlestirme, cift dokunus yakinlastirma).
 *   - Basis `SKILL_GESTURE_HOLD_MS` boyunca `SKILL_GESTURE_HOLD_SLOP_SCREEN_PX`
 *     icinde kalirsa 1. beceri; daha once kayarsa 2. beceri.
 *   - Ilk parmak esigi gecmeden ve `SKILL_GESTURE_TWO_FINGER_WINDOW_MS` icinde
 *     ikinci parmak gelirse 3. beceri; olcu iki parmagin orta noktasi.
 *   - Haritada baska bir eylem bekliyor ya da suruyorsa (`busy`) jest hic
 *     baslamaz; suren jest olur.
 *
 * Bu dosya saf: Phaser ve oda bilmiyor. Sahne olaylari (basis, hareket,
 * birakis, kare) buraya tasiyor; karar burada, cizim ve mesaj sahnede.
 * Sahnenin gonderdigi mesaj sekmedeki dugmeyle ayni `useSkill`: beden sistemi
 * (bekleme, kuyruk, cift komut engeli) ikisini ayirt etmiyor.
 */

/** Basili tutma suresi (ms): duvar cizgisinin durakla-sabitle halkasiyla ayni. */
export const SKILL_GESTURE_HOLD_MS = WALL_LINE_DWELL_MS;
/** Tutarken parmagin kayabilecegi pay (ekran pikseli); duvar halkasiyla ayni. */
export const SKILL_GESTURE_HOLD_SLOP_SCREEN_PX = WALL_LINE_DWELL_TOLERANCE_PX;
/**
 * Halka bu kadar (ms) sonra gorunur: her siradan dokunusta yanip sonmesin.
 * Dolulugu yine basistan sayiliyor.
 */
export const SKILL_GESTURE_HOLD_RING_DELAY_MS = 140;
/** Ikinci parmak ilk parmaktan en fazla bu kadar (ms) sonra gelirse iki parmak jesti. */
export const SKILL_GESTURE_TWO_FINGER_WINDOW_MS = 300;

/**
 * Kademe mesafeleri (ZentaX): cekilen cizginin boyu, hucre cinsinden; her
 * birinin ekranda bir tabani var (CSS pikseli), kucuk hucreli buyuk haritada
 * parmak yine rahat ayirt etsin.
 *   - Esik (iptal siniri): Metal Kalkan esigiyle ayni, 0,6 hucre / 14 px.
 *   - DUSUK: esikten ORTA'ya kadar.
 *   - ORTA: 2,5 hucre / 64 px'ten.
 *   - YUKSEK: 4,5 hucre / 120 px'ten.
 * Dikey telefonda (hucre ~30 px) ORTA ~75 px, YUKSEK ~135 px: bas parmakla
 * rahat cekiliyor, ekrandan tasmiyor.
 */
export const SKILL_GESTURE_MIN_CELLS = METAL_SHIELD_DRAG_THRESHOLD_CELLS;
export const SKILL_GESTURE_MIN_SCREEN_PX = METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX;
export const SKILL_GESTURE_MEDIUM_CELLS = 2.5;
export const SKILL_GESTURE_MEDIUM_SCREEN_PX = 64;
export const SKILL_GESTURE_HIGH_CELLS = 4.5;
export const SKILL_GESTURE_HIGH_SCREEN_PX = 120;
/** Kademe cubugunun cizilen en uzun hali: YUKSEK esiginin bu kati. */
export const SKILL_GESTURE_BAR_MAX_RATIO = 1.3;

export type SkillGestureKind = "hold" | "drag" | "two";
export type SkillGestureTier = "small" | "medium" | "big";

/** Jest -> yuva: sira sabit, her operatorde ayni. */
export const SKILL_GESTURE_SLOT: Readonly<Record<SkillGestureKind, number>> = { hold: 0, drag: 1, two: 2 };

/**
 * Bir yuvanin jestle ne yaptigi:
 *   - "area": birakis noktasina alan (AttackLord Yonlendirme, Melis Zorba).
 *   - "shield": cizgi; jesti Metal Kalkan kendi durum makinesiyle yurutuyor.
 *   - "enemy": birakis noktasindaki dusman (AttackLord Execute).
 *   - "tier": kademe cekilen boydan (ZentaX'in uc komutu).
 *   - "cast": hedefsiz beceri, jest yalnizca atiyor.
 *   - "none": jest yok (secili kule gibi baska bir hedef istiyor).
 */
export type SkillGestureTarget = "area" | "shield" | "enemy" | "tier" | "cast" | "none";

/**
 * Operatore gore yuvalarin jest hedefi. Yalnizca AttackLord ve ZentaX
 * oynanabiliyor; digerleri sekmedeki dugmeyle ayni mesaji atan en sade hal.
 * Melis'in 2. becerisi secili kule istiyor: jesti yok, dugmeden.
 */
export function getSkillGestureTargets(characterId: CharacterId | string | undefined): readonly [SkillGestureTarget, SkillGestureTarget, SkillGestureTarget] {
  if (characterId === "warrior") return ["area", "shield", "enemy"];
  if (characterId === "zeynep") return ["tier", "tier", "tier"];
  if (characterId === "archer") return ["area", "none", "cast"];
  if (typeof characterId === "string" && characterId.length > 0) return ["cast", "cast", "cast"];
  return ["none", "none", "none"];
}

export type SkillGestureThresholds = { min: number; medium: number; high: number; barMax: number };

function floorPx(px: number, worldPerScreenPx: number) {
  return Number.isFinite(worldPerScreenPx) && worldPerScreenPx > 0 ? px * worldPerScreenPx : 0;
}

/**
 * Esik ve kademe mesafeleri, dunya birimi. `worldPerScreenPx`: bir CSS
 * pikselinin dunya karsiligi. Sira her zaman min < medium < high.
 */
export function getSkillGestureThresholds(gridSize: number, worldPerScreenPx: number): SkillGestureThresholds {
  const cell = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 1;
  const min = Math.max(SKILL_GESTURE_MIN_CELLS * cell, floorPx(SKILL_GESTURE_MIN_SCREEN_PX, worldPerScreenPx));
  const medium = Math.max(SKILL_GESTURE_MEDIUM_CELLS * cell, floorPx(SKILL_GESTURE_MEDIUM_SCREEN_PX, worldPerScreenPx), min * 2);
  const high = Math.max(SKILL_GESTURE_HIGH_CELLS * cell, floorPx(SKILL_GESTURE_HIGH_SCREEN_PX, worldPerScreenPx), medium * 1.4);
  return { min, medium, high, barMax: high * SKILL_GESTURE_BAR_MAX_RATIO };
}

/** Cekilen boyun kademesi; esigin altinda undefined (iptal). */
export function getSkillGestureTier(length: number, thresholds: SkillGestureThresholds): SkillGestureTier | undefined {
  if (!Number.isFinite(length) || length < thresholds.min) return undefined;
  if (length >= thresholds.high) return "big";
  if (length >= thresholds.medium) return "medium";
  return "small";
}

/** Kademe adi, cubugun yaninda: DUSUK / ORTA / YUKSEK. */
export function getSkillGestureTierLabel(tier: SkillGestureTier) {
  if (tier === "big") return lt("YÜKSEK", "HIGH");
  if (tier === "medium") return lt("ORTA", "MEDIUM");
  return lt("DÜŞÜK", "LOW");
}

// --- Durum makinesi ---------------------------------------------------------------

export type SkillGesturePointer = {
  pointerId: number;
  /** "mouse" | "touch" | "pen". Farede ana tus (0) tutma/surukleme, sag tus (2) 3. beceri. */
  pointerType?: string;
  button?: number;
  /** Dunya koordinati. */
  x: number;
  y: number;
};

export type SkillGestureSlotState = {
  /** Bu yuvanin jesti var (hedef "none" degil, operator dogru). */
  enabled: boolean;
  /** Kalan bekleme, saniye; 0 hazir. Hazir degilse onizleme soluk, birakis bildirim. */
  cooldownSeconds: number;
  /**
   * Jesti baska bir durum makinesi yurutuyor (Metal Kalkan): burasi yalnizca
   * siniflandiriyor; onizleme, atis ve dokunusu yutma kararini oraya birakiyor.
   */
  external?: boolean;
};

export type SkillGestureContext = {
  /**
   * Haritada baska bir eylem bekliyor ya da suruyor: isci hedefi, ulti sutunu,
   * kartin hedefi, esya yerlestirme, isci yasagi, sekmeden silahlanmis
   * Execute / Yonlendirme, kule ya da duvar tutamaci suruklemesi; ya da basis
   * kendi anlami olan bir kontrolun ustunde, mac bitti, oda yok.
   */
  busy: boolean;
  /** Isaretcinin noktasi savas alaninda mi. */
  inside: boolean;
  gridSize: number;
  worldPerScreenPx: number;
  /** Yuva 0, 1, 2. */
  slots: readonly SkillGestureSlotState[];
};

export type SkillGesturePhase = "pending" | SkillGestureKind | "dead";

export type SkillGesture = {
  phase: SkillGesturePhase;
  /** Izlenen parmaklar ve son konumlari (dunya). Iki parmakta iki kayit. */
  pointers: Array<{ pointerId: number; x: number; y: number }>;
  /** Ilk basisin ani (ms). */
  downAt: number;
  /** Ilk basisin noktasi: tutma payi buradan olculuyor. */
  originX: number;
  originY: number;
  /** Cizginin basi: tutma/surukle icin basis, iki parmakta ikinci parmak geldigindeki orta nokta. */
  startX: number;
  startY: number;
  /** Cizginin ucu: parmak (iki parmakta orta nokta). */
  endX: number;
  endY: number;
  length: number;
  /** Uc esigin otesinde: onizleme gorunur, birakis atar. */
  active: boolean;
  /** Esik en az bir kez gecildi: geri donup birakmak iptal, dokunus degil. */
  dragged: boolean;
  /** Birden fazla parmak (ya da farenin sag tusu) karisti: birakislar hep yutulur. */
  multi: boolean;
};

export type SkillGestureCast = {
  slot: number;
  kind: SkillGestureKind;
  startX: number;
  startY: number;
  x: number;
  y: number;
  length: number;
};

const finite = (value: number) => Number.isFinite(value);

function slotOf(context: SkillGestureContext, kind: SkillGestureKind) {
  return context.slots[SKILL_GESTURE_SLOT[kind]];
}

function isEnabled(context: SkillGestureContext, kind: SkillGestureKind) {
  return Boolean(slotOf(context, kind)?.enabled);
}

function centroid(pointers: SkillGesture["pointers"]) {
  let x = 0;
  let y = 0;
  for (const pointer of pointers) {
    x += pointer.x;
    y += pointer.y;
  }
  const count = Math.max(1, pointers.length);
  return { x: x / count, y: y / count };
}

function kill(gesture: SkillGesture): SkillGesture {
  return { ...gesture, phase: "dead", active: false };
}

/** Cizginin ucunu ve boyunu parmaklardan yeniden hesaplar. */
function measure(gesture: SkillGesture, context: SkillGestureContext): SkillGesture {
  if (gesture.phase === "pending" || gesture.phase === "dead") return gesture;
  const end = gesture.phase === "two" ? centroid(gesture.pointers) : gesture.pointers[0] ?? { x: gesture.endX, y: gesture.endY };
  const length = Math.hypot(end.x - gesture.startX, end.y - gesture.startY);
  const min = getSkillGestureThresholds(context.gridSize, context.worldPerScreenPx).min;
  const active = length >= min;
  return { ...gesture, endX: end.x, endY: end.y, length, active, dragged: gesture.dragged || active };
}

/**
 * Basis. Ilk parmak uygunsa jest izlenmeye baslar (henuz hicbir sey
 * gorunmez). Izlenen jest varken gelen ikinci parmak: ilki esigi gecmemis,
 * tutma dolmamis ve pencere icindeyse 3. beceri; degilse jest olur (iki
 * parmagin birakisi da yutulur). Ucuncu parmak her zaman oldurur.
 */
export function beginSkillGesture(
  current: SkillGesture | undefined,
  pointer: SkillGesturePointer,
  now: number,
  context: SkillGestureContext
): SkillGesture | undefined {
  if (!finite(pointer.x) || !finite(pointer.y)) return current ? kill(current) : undefined;
  if (current) {
    if (current.pointers.some((entry) => entry.pointerId === pointer.pointerId)) return current;
    const pointers = [...current.pointers, { pointerId: pointer.pointerId, x: pointer.x, y: pointer.y }];
    const canPair = current.phase === "pending" && current.pointers.length === 1
      && now - current.downAt <= SKILL_GESTURE_TWO_FINGER_WINDOW_MS
      && !context.busy && context.inside && isEnabled(context, "two");
    if (!canPair) return { ...kill(current), pointers, multi: true };
    const middle = centroid(pointers);
    return { ...current, phase: "two", pointers, startX: middle.x, startY: middle.y, endX: middle.x, endY: middle.y, length: 0, active: false, multi: true };
  }
  if (context.busy || !context.inside) return undefined;
  if (!context.slots.some((slot) => slot?.enabled)) return undefined;
  const base: SkillGesture = {
    phase: "pending",
    pointers: [{ pointerId: pointer.pointerId, x: pointer.x, y: pointer.y }],
    downAt: now,
    originX: pointer.x,
    originY: pointer.y,
    startX: pointer.x,
    startY: pointer.y,
    endX: pointer.x,
    endY: pointer.y,
    length: 0,
    active: false,
    dragged: false,
    multi: false
  };
  if (pointer.pointerType === "mouse" && pointer.button !== undefined && pointer.button !== 0) {
    // Farede iki parmak yok: sag tusla surukleme 3. beceri.
    if (pointer.button !== 2 || !isEnabled(context, "two")) return undefined;
    return { ...base, phase: "two", multi: true };
  }
  return base;
}

/**
 * Kare basina: tutma suresi doldu mu (parmak kimildamasa da halka dolsun),
 * araya baska bir eylem girdi mi.
 */
export function tickSkillGesture(gesture: SkillGesture | undefined, now: number, context: Pick<SkillGestureContext, "busy" | "slots">): SkillGesture | undefined {
  if (!gesture || gesture.phase === "dead") return gesture;
  if (context.busy) return kill(gesture);
  if (gesture.phase === "pending" && gesture.pointers.length === 1 && now - gesture.downAt >= SKILL_GESTURE_HOLD_MS && context.slots[SKILL_GESTURE_SLOT.hold]?.enabled) {
    // Halka doldu: dokunus degil artik. Cizgi tutulan noktadan basliyor.
    return { ...gesture, phase: "hold", startX: gesture.originX, startY: gesture.originY };
  }
  return gesture;
}

/** Tutma halkasinin dolulugu 0..1; tutma asamasinda degilse undefined. */
export function getSkillGestureHoldProgress(gesture: SkillGesture | undefined, now: number) {
  if (!gesture) return undefined;
  if (gesture.phase === "hold") return 1;
  if (gesture.phase !== "pending" || gesture.pointers.length !== 1) return undefined;
  const elapsed = now - gesture.downAt;
  if (elapsed < SKILL_GESTURE_HOLD_RING_DELAY_MS) return undefined;
  return Math.max(0, Math.min(1, elapsed / SKILL_GESTURE_HOLD_MS));
}

/**
 * Hareket. Tutma dolmadan payin disina kayan parmak 2. beceri olur; dolduysa
 * 1. beceri cizgisi uzar. Harita disi ya da araya giren eylem jesti oldurur.
 */
export function moveSkillGesture(
  gesture: SkillGesture | undefined,
  pointer: SkillGesturePointer,
  now: number,
  context: SkillGestureContext
): SkillGesture | undefined {
  if (!gesture || gesture.phase === "dead") return gesture;
  const index = gesture.pointers.findIndex((entry) => entry.pointerId === pointer.pointerId);
  if (index < 0) return gesture;
  if (context.busy || !context.inside || !finite(pointer.x) || !finite(pointer.y)) return kill(gesture);
  const pointers = gesture.pointers.map((entry, i) => (i === index ? { ...entry, x: pointer.x, y: pointer.y } : entry));
  let next: SkillGesture = { ...gesture, pointers };
  if (next.phase === "pending") {
    next = tickSkillGesture(next, now, context) ?? next;
  }
  if (next.phase === "pending") {
    const slop = SKILL_GESTURE_HOLD_SLOP_SCREEN_PX * (context.worldPerScreenPx > 0 ? context.worldPerScreenPx : 1);
    if (Math.hypot(pointer.x - next.originX, pointer.y - next.originY) <= slop) return next;
    if (!isEnabled(context, "drag")) {
      // 2. becerinin jesti yok: surukleme siradan surukleme, dokunus gibi biter.
      return { ...next, phase: "drag" };
    }
    next = { ...next, phase: "drag" };
  }
  return measure(next, context);
}

/**
 * Birakis. `cast`: atilacak beceri (yuva, cizginin basi ve ucu, boy).
 * `consumed`: birakis siradan bir harita dokunusu olarak islenmemeli.
 * `cooldownSlot`/`cooldownSeconds`: esik gecildi ama beceri beklemede; sahne
 * bugunku bekleme bildirimini gosteriyor. Esigin altina geri donup birakmak
 * iptal: hicbir sey atilmaz, dokunus da sayilmaz.
 *
 * Tutma dolup hic suruklenmeden birakilan jest beceri atmaz; dokunus olarak
 * isler (yavas bir dokunus kule secimini kaybetmesin).
 */
export function endSkillGesture(
  gesture: SkillGesture | undefined,
  pointer: SkillGesturePointer,
  now: number,
  context: SkillGestureContext
): { gesture: SkillGesture | undefined; consumed: boolean; cast?: SkillGestureCast; cooldownSlot?: number; cooldownSeconds?: number } {
  if (!gesture || !gesture.pointers.some((entry) => entry.pointerId === pointer.pointerId)) {
    return { gesture, consumed: false };
  }
  const moved = moveSkillGesture(gesture, pointer, now, context) ?? gesture;
  const remaining = moved.pointers.filter((entry) => entry.pointerId !== pointer.pointerId);
  // Iki parmaktan biri kalkti: jest burada biter, kalan parmagin birakisi yutulur.
  const rest = remaining.length > 0 ? { ...kill(moved), pointers: remaining, multi: true } : undefined;
  if (moved.phase === "dead" || moved.phase === "pending") {
    return { gesture: rest, consumed: moved.multi || moved.dragged };
  }
  const kind = moved.phase;
  const slot = SKILL_GESTURE_SLOT[kind];
  const slotState = context.slots[slot];
  if (!slotState?.enabled || slotState.external) {
    // Jesti yok ya da baska makinenin (Metal Kalkan): dokunusu yutma karari
    // ona ya da siradan dokunusa kalir. Iki parmak her zaman yutulur.
    return { gesture: rest, consumed: moved.multi };
  }
  if (!moved.active) {
    // Esigin altinda birakis: hic gecilmediyse dokunus, gecilip donulduyse iptal.
    return { gesture: rest, consumed: moved.multi || moved.dragged };
  }
  if (slotState.cooldownSeconds > 0) {
    return { gesture: rest, consumed: true, cooldownSlot: slot, cooldownSeconds: Math.max(1, Math.ceil(slotState.cooldownSeconds)) };
  }
  return {
    gesture: rest,
    consumed: true,
    cast: { slot, kind, startX: moved.startX, startY: moved.startY, x: moved.endX, y: moved.endY, length: moved.length }
  };
}

/**
 * Bir parmak birakilmadan dustu (pointercancel, yakalama kaybi): jest olur,
 * hicbir sey atilmaz. Kalan parmak varsa onun birakisi yine yutulur.
 */
export function dropSkillGesturePointer(gesture: SkillGesture | undefined, pointerId: number): SkillGesture | undefined {
  if (!gesture || !gesture.pointers.some((entry) => entry.pointerId === pointerId)) return gesture;
  const pointers = gesture.pointers.filter((entry) => entry.pointerId !== pointerId);
  return pointers.length > 0 ? { ...kill(gesture), pointers, multi: true } : undefined;
}
