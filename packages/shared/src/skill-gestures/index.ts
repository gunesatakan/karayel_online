import type { CharacterId } from "../index.js";
import { WALL_LINE_DWELL_MS, WALL_LINE_DWELL_TOLERANCE_PX } from "../placement/wall-line.js";
import { METAL_SHIELD_DRAG_THRESHOLD_CELLS, METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX } from "../characters/atakan/skills/metal-shield.js";
import { lt } from "../i18n/index.js";

/**
 * Harita jestiyle beceri: Beceriler sekmesine gitmeden, haritaya dokunarak.
 *
 * Jest becerinin SIRASINA bagli, karaktere degil; her operatorde ayni:
 *   - 1. beceri (yuva 0): basili tut (halka dolsun), sonra asagi DISINDA bir
 *     yone surukle ("hold").
 *   - 2. beceri (yuva 1): tutmadan duz surukle ("drag"), bugunku Metal Kalkan gibi.
 *   - 3. beceri (yuva 2): basili tut, sonra ASAGI surukle ("down"); farede sag
 *     tusla surukle (yon serbest).
 *
 * Ayrim kurali:
 *   - Esigi (`getSkillGestureThresholds().min`) gecmeyen her sey dokunustur ve
 *     bugunku gibi isler (kule secimi, yerlestirme, cift dokunus yakinlastirma).
 *   - Basis `SKILL_GESTURE_HOLD_MS` boyunca `SKILL_GESTURE_HOLD_SLOP_SCREEN_PX`
 *     icinde kalirsa tutma jesti; daha once kayarsa 2. beceri.
 *   - Tutmadan sonra parmak esigi ilk gectiginde yon secilir ve kilitlenir:
 *     ekranda dik asagidan en fazla 45 derece sapan yon 3. beceri, gerisi 1.
 *   - Ikinci parmak hicbir beceri atmaz: suren jesti oldurur.
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

export type SkillGestureKind = "hold" | "drag" | "down";
export type SkillGestureTier = "small" | "medium" | "big";

/** Jest -> yuva: sira sabit, her operatorde ayni. */
export const SKILL_GESTURE_SLOT: Readonly<Record<SkillGestureKind, number>> = { hold: 0, drag: 1, down: 2 };

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

/**
 * Asamalar:
 *   - "pending": basildi, henuz karar yok (dokunus olabilir).
 *   - "held": halka doldu, parmak henuz yon secmedi.
 *   - "hold" / "drag" / "down": karar verildi, yuva kilitli.
 *   - "dead": iptal (ikinci parmak, harita disi, araya giren eylem); birakisa kadar olu.
 */
export type SkillGesturePhase = "pending" | "held" | SkillGestureKind | "dead";

export type SkillGesture = {
  phase: SkillGesturePhase;
  /** Izlenen tek parmak. Ikinci parmak jesti oldurur, kendisi izlenmez. */
  pointerId: number;
  /** Basisin ani (ms). */
  downAt: number;
  /** Basisin noktasi: tutma payi buradan olculuyor. */
  originX: number;
  originY: number;
  /** Cizginin basi: surukle icin basis, tutma jestinde tutulan nokta. */
  startX: number;
  startY: number;
  /** Cizginin ucu: parmak. */
  endX: number;
  endY: number;
  length: number;
  /** Uc esigin otesinde: onizleme gorunur, birakis atar. */
  active: boolean;
  /** Esik en az bir kez gecildi: geri donup birakmak iptal, dokunus degil. */
  dragged: boolean;
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

function isEnabled(context: Pick<SkillGestureContext, "slots">, kind: SkillGestureKind) {
  return Boolean(context.slots[SKILL_GESTURE_SLOT[kind]]?.enabled);
}

/** Tutma jesti var mi: 1. ya da 3. becerinin jesti varsa halka dolar. */
function canHold(context: Pick<SkillGestureContext, "slots">) {
  return isEnabled(context, "hold") || isEnabled(context, "down");
}

function kill(gesture: SkillGesture): SkillGesture {
  return { ...gesture, phase: "dead", active: false };
}

/**
 * Tutmadan sonraki ilk kararli hareketin yonu: ekranda dik asagidan en fazla
 * 45 derece sapan (dy > 0 ve |dx| <= dy) cizgi 3. beceri, gerisi 1. beceri.
 * Dunya y'si ekran gibi asagi buyuyor (kamera donmuyor).
 */
export function isSkillGestureDownward(dx: number, dy: number) {
  return dy > 0 && Math.abs(dx) <= dy;
}

/** Cizginin ucunu ve boyunu parmaktan yeniden hesaplar. */
function measure(gesture: SkillGesture, x: number, y: number, context: SkillGestureContext): SkillGesture {
  const length = Math.hypot(x - gesture.startX, y - gesture.startY);
  if (gesture.phase === "pending" || gesture.phase === "held" || gesture.phase === "dead") {
    return { ...gesture, endX: x, endY: y, length };
  }
  const active = length >= getSkillGestureThresholds(context.gridSize, context.worldPerScreenPx).min;
  return { ...gesture, endX: x, endY: y, length, active, dragged: gesture.dragged || active };
}

/**
 * Basis. Uygunsa jest izlenmeye baslar (henuz hicbir sey gorunmez). Izlenen
 * jest varken gelen ikinci parmak jesti oldurur ve hicbir beceri atmaz;
 * ikinci parmagin kendisi izlenmez (birakisi eskisi gibi dokunustur).
 * Farede sag tusla basis dogrudan 3. beceri (yon serbest).
 */
export function beginSkillGesture(
  current: SkillGesture | undefined,
  pointer: SkillGesturePointer,
  now: number,
  context: SkillGestureContext
): SkillGesture | undefined {
  if (current) {
    if (current.pointerId === pointer.pointerId) return current;
    return kill(current);
  }
  if (!finite(pointer.x) || !finite(pointer.y)) return undefined;
  if (context.busy || !context.inside) return undefined;
  if (!context.slots.some((slot) => slot?.enabled)) return undefined;
  const base: SkillGesture = {
    phase: "pending",
    pointerId: pointer.pointerId,
    downAt: now,
    originX: pointer.x,
    originY: pointer.y,
    startX: pointer.x,
    startY: pointer.y,
    endX: pointer.x,
    endY: pointer.y,
    length: 0,
    active: false,
    dragged: false
  };
  if (pointer.pointerType === "mouse" && pointer.button !== undefined && pointer.button !== 0) {
    if (pointer.button !== 2 || !isEnabled(context, "down")) return undefined;
    return { ...base, phase: "down" };
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
  if (gesture.phase === "pending" && now - gesture.downAt >= SKILL_GESTURE_HOLD_MS && canHold(context)) {
    // Halka doldu: dokunus degil artik. Cizgi tutulan noktadan basliyor; yon
    // ilk kararli harekette seciliyor.
    return { ...gesture, phase: "held", startX: gesture.originX, startY: gesture.originY, length: 0 };
  }
  return gesture;
}

/** Tutma halkasinin dolulugu 0..1; tutma asamasinda degilse undefined. */
export function getSkillGestureHoldProgress(gesture: SkillGesture | undefined, now: number) {
  if (!gesture) return undefined;
  if (gesture.phase === "held") return 1;
  if (gesture.phase !== "pending") return undefined;
  const elapsed = now - gesture.downAt;
  if (elapsed < SKILL_GESTURE_HOLD_RING_DELAY_MS) return undefined;
  return Math.max(0, Math.min(1, elapsed / SKILL_GESTURE_HOLD_MS));
}

/**
 * Hareket. Tutma dolmadan payin disina kayan parmak 2. beceri olur. Tutma
 * dolduysa esigi ilk gecen hareket yonu secer (asagi 3., gerisi 1.) ve yuva
 * kilitlenir. Harita disi ya da araya giren eylem jesti oldurur.
 */
export function moveSkillGesture(
  gesture: SkillGesture | undefined,
  pointer: SkillGesturePointer,
  now: number,
  context: SkillGestureContext
): SkillGesture | undefined {
  if (!gesture || gesture.phase === "dead" || gesture.pointerId !== pointer.pointerId) return gesture;
  if (context.busy || !context.inside || !finite(pointer.x) || !finite(pointer.y)) return kill(gesture);
  let next: SkillGesture = gesture;
  if (next.phase === "pending") next = tickSkillGesture(next, now, context) ?? next;
  if (next.phase === "pending") {
    const slop = SKILL_GESTURE_HOLD_SLOP_SCREEN_PX * (context.worldPerScreenPx > 0 ? context.worldPerScreenPx : 1);
    if (Math.hypot(pointer.x - next.originX, pointer.y - next.originY) <= slop) return { ...next, endX: pointer.x, endY: pointer.y };
    next = { ...next, phase: "drag" };
  }
  if (next.phase === "held") {
    const dx = pointer.x - next.startX;
    const dy = pointer.y - next.startY;
    if (Math.hypot(dx, dy) < getSkillGestureThresholds(context.gridSize, context.worldPerScreenPx).min) {
      return measure(next, pointer.x, pointer.y, context);
    }
    next = { ...next, phase: isSkillGestureDownward(dx, dy) ? "down" : "hold" };
  }
  return measure(next, pointer.x, pointer.y, context);
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
  if (!gesture || gesture.pointerId !== pointer.pointerId) return { gesture, consumed: false };
  const moved = moveSkillGesture(gesture, pointer, now, context) ?? gesture;
  if (moved.phase === "dead" || moved.phase === "pending" || moved.phase === "held") {
    return { gesture: undefined, consumed: moved.dragged };
  }
  const kind = moved.phase;
  const slot = SKILL_GESTURE_SLOT[kind];
  const slotState = context.slots[slot];
  if (!slotState?.enabled || slotState.external) {
    // Jesti yok ya da baska makinenin (Metal Kalkan): dokunusu yutma karari
    // ona ya da siradan dokunusa kalir. Tutma jesti kendi kararidir: yutulur.
    return { gesture: undefined, consumed: kind !== "drag" && moved.dragged };
  }
  if (!moved.active) {
    // Esigin altinda birakis: hic gecilmediyse dokunus, gecilip donulduyse iptal.
    return { gesture: undefined, consumed: moved.dragged };
  }
  if (slotState.cooldownSeconds > 0) {
    return { gesture: undefined, consumed: true, cooldownSlot: slot, cooldownSeconds: Math.max(1, Math.ceil(slotState.cooldownSeconds)) };
  }
  return {
    gesture: undefined,
    consumed: true,
    cast: { slot, kind, startX: moved.startX, startY: moved.startY, x: moved.endX, y: moved.endY, length: moved.length }
  };
}

/** Parmak birakilmadan dustu (pointercancel, yakalama kaybi): jest atmadan kapanir. */
export function dropSkillGesturePointer(gesture: SkillGesture | undefined, pointerId: number): SkillGesture | undefined {
  if (!gesture || gesture.pointerId !== pointerId) return gesture;
  return undefined;
}
