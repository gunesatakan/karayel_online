/**
 * Testlerin elle kurdugu sekiller ve sayili sorgu sarmalayicilari.
 *
 * Uretim kodu bunlari cagirmiyor: sunucu ve istemci sekilleri tek nesneye
 * yazip (`createBodySector`) nesneyle soruyor (cok sayida cift arguman
 * satir ici acilmayan cagrida her biri bir kutu olurdu), mermi sekli de hep
 * cizilen govdeden (`getProjectileShape`). Testler okunakli olsun diye
 * sayilarla soruyor; sarmalayicilar burada, uretim modullerinde degil.
 */
import { ProjectilePartTable, createBodySector, isBodyTouchingSectorShape, isBodyTouchingSweepShape } from "../../packages/shared/dist/index.js";

/**
 * Merkezde `radius` yaricapli disk sekil (kuyrugu diskin kendisi): sira
 * testlerinin elle kurdugu mermi. Donmus, her cagrida yeni.
 */
export function createProjectileDiscShape(radius) {
  const r = Math.max(0, radius);
  return Object.freeze({
    front: r,
    nose: r,
    tail: r,
    halfWidth: r,
    disc: 1,
    wide: 0,
    radius: r,
    table: new ProjectilePartTable(),
    sources: Object.freeze([])
  });
}

const SECTOR = createBodySector();

/** `isBodyTouchingSectorShape`, sayilarla: halka dilimi `[inner, outer]`. */
export function isBodyTouchingAnnularSector(body, px, py, startX, startY, endX, endY, sweep, inner, outer) {
  Object.assign(SECTOR, { x: px, y: py, startX, startY, endX, endY, sweep, inner, outer, inflate: 0 });
  return isBodyTouchingSectorShape(body, SECTOR);
}

/** `isBodyTouchingSweepShape`, sayilarla: `[0, length]` dilimi, `inflate` kadar sisirilmis. */
export function isBodyTouchingSector(body, px, py, startX, startY, endX, endY, sweep, length, inflate = 0) {
  Object.assign(SECTOR, { x: px, y: py, startX, startY, endX, endY, sweep, inner: 0, outer: length, inflate });
  return isBodyTouchingSweepShape(body, SECTOR);
}
