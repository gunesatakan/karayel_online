import type { MovementKind } from "../combat.js";

/**
 * Onur'un ultisi "Sempati": sahadaki her kule kendisine en yakin kuleye baglanir
 * ve aradaki gorunur bag bir yavaslatma hatti olur.
 *
 * Bag kurma ve temas geometrisi burada duruyor cunku ikisi de saf hesap: kule
 * listesi girer, hat listesi cikar. MatchRoom yalnizca sonucu uygular, boylece
 * "en yakin kule kim" ve "dusman hatta degdi mi" sorulari oda surulmeden test
 * edilebiliyor.
 */

export type SympathyTower = {
  id: string;
  x: number;
  y: number;
};

export type SympathyLink = {
  id: string;
  fromTowerId: string;
  toTowerId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type SympathyContactTarget = {
  id: string;
  x: number;
  y: number;
  radius?: number;
  movementKind?: MovementKind;
};

export const SYMPATHY_DURATION_MS = 8000;
/** Bagin yarim kalinligi. Temas yaricapi da, cizim genisligi de bundan turer. */
export const SYMPATHY_LINK_HALF_WIDTH = 5;
/** Baga degen dusman bu carpanla yurur; temas bitince kendiliginden duser. */
export const SYMPATHY_SLOW_MULTIPLIER = 0.5;
export const SYMPATHY_BLEED_DURATION_MS = 3000;
/** Testere'nin kanamasiyla ayni siddet: saniyede maks. canin %1'i. */
export const SYMPATHY_BLEED_MAX_HEALTH_RATIO_PER_SECOND = 0.01;

/**
 * Her kuleyi en yakin komsusuna baglar.
 *
 * A'nin en yakini B iken B'nin en yakini da A olabilir; bu ayni hattir ve tek
 * kez uretilir. Esit mesafede iki aday varsa kule kimligine gore secilir, cunku
 * ayni kurulumun her tickte ayni agi vermesi gerekiyor.
 */
export function buildSympathyLinks(towers: readonly SympathyTower[]): SympathyLink[] {
  const links = new Map<string, SympathyLink>();

  for (const tower of towers) {
    let nearest: SympathyTower | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of towers) {
      if (candidate.id === tower.id) continue;
      const distance = distanceSquared(tower.x, tower.y, candidate.x, candidate.y);
      if (distance < nearestDistance || (distance === nearestDistance && nearest && candidate.id < nearest.id)) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }

    if (!nearest) continue;

    const [first, second] = tower.id < nearest.id ? [tower, nearest] : [nearest, tower];
    const id = `sympathy-${first.id}-${second.id}`;
    if (links.has(id)) continue;

    links.set(id, {
      id,
      fromTowerId: first.id,
      toTowerId: second.id,
      x1: first.x,
      y1: first.y,
      x2: second.x,
      y2: second.y
    });
  }

  return Array.from(links.values());
}

/** Noktanin sonlu dogru parcasina uzakligi; hattin otesi sayilmaz. */
export function getDistanceToSegment(
  pointX: number,
  pointY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(pointX - x1, pointY - y1);

  const projection = ((pointX - x1) * dx + (pointY - y1) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  return Math.hypot(pointX - (x1 + clamped * dx), pointY - (y1 + clamped * dy));
}

export function isTouchingSympathyLink(
  link: SympathyLink,
  target: SympathyContactTarget,
  halfWidth = SYMPATHY_LINK_HALF_WIDTH
) {
  // Ucan dusmanlar hattin uzerinden gecer, bagi hic gormez.
  if (target.movementKind === "air") return false;
  const reach = Math.max(0, halfWidth) + Math.max(0, target.radius ?? 0);
  return getDistanceToSegment(target.x, target.y, link.x1, link.y1, link.x2, link.y2) <= reach;
}

/** Aga su an degen hedefleri dondurur; her hedef en fazla bir kez listelenir. */
export function selectSympathyContacts<T extends SympathyContactTarget>(
  links: readonly SympathyLink[],
  targets: readonly T[],
  halfWidth = SYMPATHY_LINK_HALF_WIDTH
): T[] {
  return targets.filter((target) => links.some((link) => isTouchingSympathyLink(link, target, halfWidth)));
}

function distanceSquared(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}
