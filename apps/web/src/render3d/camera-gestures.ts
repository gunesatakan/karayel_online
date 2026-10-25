/**
 * Egik 3D gorunumun kamera jestleri (on izlemedeki yorunge kamerasi gibi).
 *
 * Tek parmak oyunun: kule secme, surukleme, beceri jestleri oldugu gibi.
 * Iki parmak kameranin: kistirma yakinlastirir, burma haritayi dondurur,
 * iki parmagi birlikte asagi-yukari kaydirmak egimi degistirir, birlikte
 * kaydirmak haritayi kaydirir. Farede tekerlek yakinlastirir, orta tusla
 * surukleme dondurur (yatay) ve eger (dikey), Shift + orta tus kaydirir.
 *
 * Dinleyiciler tuvalin kabinda yakalama evresinde: kamera jestine giren
 * isaretci olaylari oyuna (DOM koprusu ve Phaser) hic ulasmiyor. Ikinci parmak
 * indiginde birinci parmagin baslattigi oyun jesti `onStart` ile geri aliniyor.
 */
import { classifyTwoFingerGesture, twoFingerDelta } from "./tower-math";

export type CameraGestureTarget = {
  /** Jestler yalnizca egik gorunumde. */
  active(): boolean;
  /** Ikinci parmak indi: birinci parmagin oyun jesti iptal. */
  onStart(pointerId: number): void;
  rotate(radians: number, clientX: number, clientY: number): void;
  tilt(degrees: number): void;
  zoom(factor: number, clientX: number, clientY: number): void;
  pan(fromX: number, fromY: number, toX: number, toY: number): void;
};

type Point = { x: number; y: number };

/** Egim kipi secilmeden once parmaklarin toplam kaymasi (piksel). */
const CLASSIFY_AFTER_PX = 14;
/** Iki parmak dikey kaydikca egim (derece / piksel); yukari kaydirmak yatirir. */
const TILT_DEGREES_PER_PX = 0.25;
/** Orta tusla surukleme: donus (radyan / piksel) ve egim (derece / piksel). */
const MOUSE_ROTATE_PER_PX = 0.008;
const MOUSE_TILT_PER_PX = 0.25;

export function attachCameraGestures(host: HTMLElement, surface: HTMLElement, target: CameraGestureTarget) {
  const touches = new Map<number, Point>();
  // Kamera jestine giren ya da onun artigi parmaklar: kalkana kadar oyuna gitmiyor.
  const swallowed = new Set<number>();
  let pair: [number, number] | undefined;
  let start: { points: [Point, Point] } | undefined;
  let mode: "tilt" | "transform" | undefined;
  let mouse: { id: number; x: number; y: number; pan: boolean } | undefined;

  const onSurface = (event: Event) => event.target === surface || (event.target instanceof Node && surface.contains(event.target));
  const stop = (event: Event) => {
    event.stopImmediatePropagation();
    if (event.cancelable) event.preventDefault();
  };

  const pointerDown = (event: PointerEvent) => {
    if (!target.active() || !onSurface(event)) return;
    if (event.pointerType === "mouse") {
      if (event.button !== 1) return;
      mouse = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.shiftKey };
      try { surface.setPointerCapture(event.pointerId); } catch { /* yakalama yoksa jest tuvalde kalir */ }
      stop(event);
      return;
    }
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pair) {
      // Ucuncu parmak: jest ikisiyle surer, bu oyuna da gitmez.
      swallowed.add(event.pointerId);
      stop(event);
      return;
    }
    if (touches.size === 2) {
      const ids = [...touches.keys()] as [number, number];
      pair = ids;
      start = { points: [{ ...touches.get(ids[0])! }, { ...touches.get(ids[1])! }] };
      mode = undefined;
      for (const id of ids) swallowed.add(id);
      target.onStart(ids[0]);
      stop(event);
    }
  };

  const pointerMove = (event: PointerEvent) => {
    if (mouse && event.pointerId === mouse.id) {
      const dx = event.clientX - mouse.x;
      const dy = event.clientY - mouse.y;
      if (mouse.pan) target.pan(mouse.x, mouse.y, event.clientX, event.clientY);
      else {
        target.rotate(dx * MOUSE_ROTATE_PER_PX, event.clientX, event.clientY);
        target.tilt(dy * MOUSE_TILT_PER_PX);
      }
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      stop(event);
      return;
    }
    const previous = touches.get(event.pointerId);
    if (!previous) return;
    if (!pair || !pair.includes(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (swallowed.has(event.pointerId)) stop(event);
      return;
    }
    const before: [Point, Point] = [{ ...touches.get(pair[0])! }, { ...touches.get(pair[1])! }];
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after: [Point, Point] = [{ ...touches.get(pair[0])! }, { ...touches.get(pair[1])! }];
    stop(event);
    if (!mode && start) {
      const total = twoFingerDelta(start.points, after);
      const travel = Math.hypot(after[0].x - start.points[0].x, after[0].y - start.points[0].y) + Math.hypot(after[1].x - start.points[1].x, after[1].y - start.points[1].y);
      if (travel < CLASSIFY_AFTER_PX) return;
      mode = classifyTwoFingerGesture(total.moveX, total.moveY, total.scale, total.rotation, total.parallelVertical);
    }
    const step = twoFingerDelta(before, after);
    if (mode === "tilt") {
      target.tilt(step.moveY * TILT_DEGREES_PER_PX);
      return;
    }
    target.zoom(step.scale, step.mid.x, step.mid.y);
    target.rotate(step.rotation, step.mid.x, step.mid.y);
    target.pan(step.previousMid.x, step.previousMid.y, step.mid.x, step.mid.y);
  };

  const pointerEnd = (event: PointerEvent) => {
    if (mouse && event.pointerId === mouse.id) {
      mouse = undefined;
      stop(event);
      return;
    }
    touches.delete(event.pointerId);
    if (pair?.includes(event.pointerId)) {
      pair = undefined;
      start = undefined;
      mode = undefined;
    }
    if (swallowed.delete(event.pointerId)) stop(event);
  };

  // Phaser kendi dokunma olaylarini da dinliyor: kamera jesti suren parmaklar ona da gitmesin.
  // Birakma olaylari geciyor ki Phaser'in isaretcisi asili kalmasin.
  const touchGuard = (event: TouchEvent) => {
    if (!target.active() || !onSurface(event)) return;
    if (pair || event.touches.length >= 2) stop(event);
  };

  const wheel = (event: WheelEvent) => {
    if (!target.active() || !onSurface(event)) return;
    target.zoom(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    stop(event);
  };

  const options = { capture: true, passive: false } as const;
  host.addEventListener("pointerdown", pointerDown, options);
  host.addEventListener("pointermove", pointerMove, options);
  host.addEventListener("pointerup", pointerEnd, options);
  host.addEventListener("pointercancel", pointerEnd, options);
  host.addEventListener("touchstart", touchGuard, options);
  host.addEventListener("touchmove", touchGuard, options);
  host.addEventListener("wheel", wheel, options);
  return () => {
    host.removeEventListener("pointerdown", pointerDown, options);
    host.removeEventListener("pointermove", pointerMove, options);
    host.removeEventListener("pointerup", pointerEnd, options);
    host.removeEventListener("pointercancel", pointerEnd, options);
    host.removeEventListener("touchstart", touchGuard, options);
    host.removeEventListener("touchmove", touchGuard, options);
    host.removeEventListener("wheel", wheel, options);
  };
}
