import type { AttackShapeTarget } from "./index.js";
import {
  createBodyConvex,
  createBodySector,
  isBodyTouchingConvexShape,
  isBodyTouchingSectorShape,
  updateBodyConvexBounds,
  type BodyConvex,
  type BodySector
} from "../enemy-body/index.js";

export type OrbitSweepQuery = {
  x: number;
  y: number;
  previousAngle: number;
  nextAngle: number;
  bladeCount: number;
  bladeLength: number;
  bladeWidth: number;
  /** Bicagin kok kenarinin kuleye uzakligi (dunya birimi; `getOrbitBladeInner`). Yoksa 0. */
  bladeInner?: number;
  canHitAir?: boolean;
};

/**
 * Bicagin cizilen govdesi (GameScene `renderOrbitBlades`, `BLADE_BODY`):
 * kok kenari kuleden `inner x kare` uzakta `+/- root x en`, kesici kenar
 * `edgeAlong x boy`da `edge x en`, sivri uc boyun kendisinde `tip x en`
 * yanda, sirt `spineAlong x boy`da `spine x en`. Yanal `+` donus yonu
 * (aci artiyor). Golge (alttaki koyu, daha buyuk cokgen), parlak kenar
 * seridi ve kokteki gobek govde degil.
 */
export const ORBIT_BLADE_BODY = { inner: 0.18, root: 0.34, edgeAlong: 0.76, edge: 0.5, tip: 0.05, spineAlong: 0.86, spine: -0.48 } as const;

/** Bicagin kok kenarinin kuleye uzakligi (dunya birimi). */
export function getOrbitBladeInner(cellSize: number) {
  return cellSize * ORBIT_BLADE_BODY.inner;
}

export type OrbitSweepContact<T extends AttackShapeTarget> = {
  target: T;
  bladeIndex: number;
};

/**
 * Bicagin ayni hedefe geri donme hizi.
 *
 * Yorunge kulesinde hasari veren sey ates araligi degil, bicagin hedefin
 * uzerinden gecmesi. Ikisi ayri yazilirsa kule ilan ettigi hizda vurmaz: testere
 * 450 ms'lik ates araligi ilan ederken bicagi ayni dusmana ancak 1963 ms'de bir
 * ugruyordu, yani kodeksin ve dengenin gordugu DPS gercegin 3.5 kati oluyordu.
 * Hiz araliktan turetilince "ne kadar sik vurur" sorusunun tek bir cevabi olur.
 */
export function getOrbitRotationSpeedForInterval(bladeCount: number, fireIntervalMs: number) {
  const count = Math.max(1, Math.round(bladeCount));
  const intervalSeconds = Math.max(1, fireIntervalMs) / 1000;
  return (Math.PI * 2) / (count * intervalSeconds);
}

/** Minimum delay before the next blade may damage the same target. */
export function getOrbitTargetHitCooldownMs(bladeCount: number, effectiveRotationSpeed: number) {
  const count = Math.max(1, Math.round(bladeCount));
  const speed = Math.max(0.001, effectiveRotationSpeed);
  return Math.PI * 2 / (count * speed) * 1000;
}

/** Bicak basina taramanin sekilleri: basta ve sonda bicagin cokgeni, aradaki halka dilimi. */
type BladeSweepShapes = { start: BodyConvex; end: BodyConvex; ring: BodySector };

/**
 * Bicaklarin yeniden kullanilan sekilleri: kule basina her tik yeni nesne
 * kurulmuyor. Cagri icinde dolduruluyor; tek is parcacigi, yeniden giris yok.
 */
const BLADE_SHAPES: BladeSweepShapes[] = [];

function getBladeShapes(index: number) {
  while (BLADE_SHAPES.length <= index) BLADE_SHAPES.push({ start: createBodyConvex(), end: createBodyConvex(), ring: createBodySector() });
  return BLADE_SHAPES[index];
}

/** Bicagin cokgeninin bir kosesi: `along` ileri, `side` donus yonunde yanal. */
function setBladeCorner(out: BodyConvex, index: number, x: number, y: number, fx: number, fy: number, along: number, side: number) {
  out.x[index] = x + fx * along - fy * side;
  out.y[index] = y + fy * along + fx * side;
}

/** `angle`a bakan bicagin cizilen cokgeni (`ORBIT_BLADE_BODY`) dunyada `out`a. */
function writeBladePolygon(out: BodyConvex, x: number, y: number, angle: number, inner: number, length: number, width: number) {
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const body = ORBIT_BLADE_BODY;
  setBladeCorner(out, 0, x, y, fx, fy, inner, -width * body.root);
  setBladeCorner(out, 1, x, y, fx, fy, inner, width * body.root);
  setBladeCorner(out, 2, x, y, fx, fy, length * body.edgeAlong, width * body.edge);
  setBladeCorner(out, 3, x, y, fx, fy, length, width * body.tip);
  setBladeCorner(out, 4, x, y, fx, fy, length * body.spineAlong, width * body.spine);
  out.count = 5;
  updateBodyConvexBounds(out);
}

/**
 * Returns each blade-target pair touched by the complete angular area swept this tick.
 *
 * Govdesi olan hedef (dusman) gorunen govdesiyle ve bicagin cizilen
 * govdesiyle (`ORBIT_BLADE_BODY`; sivri uc boyun kendisinde: eskiden yari en
 * kadar sisirilen dilim ucun o kadar otesine ulasiyordu). Bicagin bu tikte
 * taradigi alan: baslangictaki ve sondaki bicak cokgeni ile aradaki halka
 * dilimi (sivri ucun isininin taradigi acida, kok kenarindan uca). Bicak
 * kuleden bakinca dis bukey ve kokunden ucuna tek parca: her isinda govdesi
 * tek aralik, en uzak noktasi uc, en yakini kok; aradaki her aci o aralikla
 * tam kapli, iki ucun otesi bastaki ya da sondaki cokgende. Bicaklarin
 * sekilleri cagri basina bir kez.
 */
export function selectOrbitSweepContacts<T extends AttackShapeTarget>(query: OrbitSweepQuery, targets: readonly T[]) {
  const count = Math.max(1, Math.round(query.bladeCount));
  const length = Math.max(0, query.bladeLength);
  const width = Math.max(0, query.bladeWidth);
  const halfWidth = width / 2;
  const sweep = positiveAngle(query.nextAngle - query.previousAngle);
  const contacts: OrbitSweepContact<T>[] = [];
  let shapesReady = false;
  // Kok kenari bicagin cogunun gerisinde kalsin (cok kisa bicakta cokgen dis bukey kalsin).
  const inner = Math.min(Math.max(0, query.bladeInner ?? 0), length * 0.5);
  const tipAngle = Math.atan2(width * ORBIT_BLADE_BODY.tip, length);
  const tipDistance = Math.hypot(length, width * ORBIT_BLADE_BODY.tip);

  for (const target of targets) {
    if (!query.canHitAir && target.movementKind === "air") continue;
    const body = target.body;
    if (body !== undefined) {
      if (!shapesReady) {
        for (let blade = 0; blade < count; blade += 1) {
          const start = query.previousAngle + blade * Math.PI * 2 / count;
          const shapes = getBladeShapes(blade);
          writeBladePolygon(shapes.start, query.x, query.y, start, inner, length, width);
          writeBladePolygon(shapes.end, query.x, query.y, start + sweep, inner, length, width);
          // Aradaki halka: ucun isini (aci + `tipAngle`) taramanin basindan
          // sonuna, o isinda kok kenarindan (`inner / cos`) uca.
          const ring = shapes.ring;
          ring.x = query.x;
          ring.y = query.y;
          ring.startX = Math.cos(start + tipAngle);
          ring.startY = Math.sin(start + tipAngle);
          ring.endX = Math.cos(start + sweep + tipAngle);
          ring.endY = Math.sin(start + sweep + tipAngle);
          ring.sweep = sweep;
          ring.inner = inner / Math.cos(tipAngle);
          ring.outer = tipDistance;
          ring.inflate = 0;
        }
        shapesReady = true;
      }
      const bx = body.x - query.x;
      const by = body.y - query.y;
      const far = tipDistance + body.reach;
      if (bx * bx + by * by > far * far) continue;
      for (let blade = 0; blade < count; blade += 1) {
        const shapes = BLADE_SHAPES[blade];
        if (isBodyTouchingSectorShape(body, shapes.ring) || isBodyTouchingConvexShape(body, shapes.start) || (sweep > 0 && isBodyTouchingConvexShape(body, shapes.end))) {
          contacts.push({ target, bladeIndex: blade });
        }
      }
      continue;
    }
    const dx = target.x - query.x;
    const dy = target.y - query.y;
    const distance = Math.hypot(dx, dy);
    const targetRadius = Math.max(0, target.radius ?? 0);
    if (distance > length + targetRadius) continue;
    if (distance <= halfWidth + targetRadius) {
      for (let blade = 0; blade < count; blade += 1) contacts.push({ target, bladeIndex: blade });
      continue;
    }

    const targetAngle = Math.atan2(dy, dx);
    const angularTolerance = Math.asin(Math.min(1, (halfWidth + targetRadius) / distance));
    for (let blade = 0; blade < count; blade += 1) {
      const start = query.previousAngle + blade * Math.PI * 2 / count;
      const advance = positiveAngle(targetAngle - start);
      if (advance <= sweep + angularTolerance || advance >= Math.PI * 2 - angularTolerance) {
        contacts.push({ target, bladeIndex: blade });
      }
    }
  }
  return contacts;
}

/** Compatibility helper for consumers interested only in unique targets. */
export function selectOrbitSweepTargets<T extends AttackShapeTarget>(query: OrbitSweepQuery, targets: readonly T[]) {
  const unique = new Map<string, T>();
  for (const contact of selectOrbitSweepContacts(query, targets)) unique.set(contact.target.id, contact.target);
  return [...unique.values()];
}

function positiveAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}
