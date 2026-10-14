import type Phaser from "phaser";
import type { MetalShieldSegment, MetalShieldSnapshot } from "@karayel/shared";

/**
 * Metal Kalkan (AttackLord, yuva 1): sahadaki bariyerin ve surukleme
 * onizlemesinin cizimi.
 *
 * Dil agir ve sert: top metali levhalar, koyu derzler, uclarda dikme, iki
 * uzun kenarda ince soguk camgobegi enerji hatti. Parilti, isilti, yumusak
 * gecis yok. Acilis ve kapanis hizli ve dogrusal: levhalar basis noktasindan
 * uca dogru surulur, kalkarken ayni yoldan toplanir; sekme ya da yay yok.
 *
 * Cizim fonksiyonlari Graphics'i temizlemiyor (cagiran temizliyor) ve karede
 * nesne acmiyor.
 */

/** Levha govdesi: top metali. */
export const METAL_SHIELD_PLATE_COLOR = 0x4b5661;
/** Levhanin isik alan ust pahi. */
export const METAL_SHIELD_PLATE_LIGHT = 0x7d8996;
/** Derz, cerceve ve dikmeler. */
export const METAL_SHIELD_FRAME_COLOR = 0x151b22;
/** Enerji kenari: soguk camgobegi (yere indirilmis ton; neon degil). */
export const METAL_SHIELD_EDGE_COLOR = 0x6cc3d2;
/** Cekilemeyecek onizlemenin levhasi: soguk kirmizi-kahve. */
export const METAL_SHIELD_INVALID_PLATE_COLOR = 0x5a3a38;
/** Cekilemeyecek onizleme. */
export const METAL_SHIELD_INVALID_COLOR = 0xc8473a;

/** Acilis ve kapanis sureleri (duvar saati ms); ikisi de dogrusal. */
export const METAL_SHIELD_DEPLOY_MS = 130;
export const METAL_SHIELD_RETRACT_MS = 170;

/**
 * Kalkanin o anki acikligi (0..1): omrun basinda hizla acilir, sonunda hizla
 * kapanir, arada tam acik. Dogrusal; easing yok.
 */
export function getMetalShieldExtent(remainingMs: number, totalMs: number) {
  if (!(remainingMs > 0) || !(totalMs > 0)) return 0;
  const age = Math.max(0, totalMs - remainingMs);
  return Math.max(0, Math.min(1, age / METAL_SHIELD_DEPLOY_MS, remainingMs / METAL_SHIELD_RETRACT_MS));
}

/** Telden gelen kalkan kaydi gecerli mi (eski/yeni sunucu farki ya da bozuk veri). */
export function isMetalShieldSnapshot(value: unknown): value is MetalShieldSnapshot {
  if (!value || typeof value !== "object") return false;
  const { id, x1, y1, x2, y2, ms } = value as Partial<MetalShieldSnapshot>;
  return [id, x1, y1, x2, y2, ms].every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

/**
 * Iki snapshot arasinda kalkanlarin omru: ayni kimlikte `ms` dogrusal (acilis
 * ve kapanis 60 ms'lik snapshot adimlariyla basamaklanmasin). Sonraki
 * snapshotta artik olmayan kalkan, aralik boyunca sifira inerek kapaniyor.
 * Iki tarafta da kalkan yoksa `next` oldugu gibi (nesne acilmiyor).
 */
export function interpolateMetalShields(
  previous: readonly MetalShieldSnapshot[] | undefined,
  next: MetalShieldSnapshot[] | undefined,
  alpha: number
): MetalShieldSnapshot[] | undefined {
  const hasPrevious = Array.isArray(previous) && previous.length > 0;
  const hasNext = Array.isArray(next) && next.length > 0;
  if (!hasPrevious) return next;
  const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  const result: MetalShieldSnapshot[] = [];
  if (hasNext) {
    for (const shield of next!) {
      if (!isMetalShieldSnapshot(shield)) continue;
      const old = previous!.find((candidate) => isMetalShieldSnapshot(candidate) && candidate.id === shield.id);
      result.push(old ? { ...shield, ms: old.ms + (shield.ms - old.ms) * t } : shield);
    }
  }
  for (const old of previous!) {
    if (!isMetalShieldSnapshot(old) || t >= 1) continue;
    if (hasNext && next!.some((candidate) => isMetalShieldSnapshot(candidate) && candidate.id === old.id)) continue;
    result.push({ ...old, ms: old.ms * (1 - t) });
  }
  return result.length > 0 ? result : undefined;
}

/** Kalkanin kalinligi (dunya birimi): hucrenin kucuk bir payi, okunur bir taban. */
export function getMetalShieldThickness(gridSize: number) {
  return Math.max(5, gridSize * 0.2);
}

type ShieldDrawOptions = {
  now: number;
  reducedMotion: boolean;
  /** Butun cizimin saydamligi (bekleyen yanki soluk). */
  alpha?: number;
};

function fillQuad(
  graphics: Phaser.GameObjects.Graphics,
  ax: number, ay: number, bx: number, by: number,
  nx: number, ny: number, half: number
) {
  graphics.beginPath();
  graphics.moveTo(ax + nx * half, ay + ny * half);
  graphics.lineTo(bx + nx * half, by + ny * half);
  graphics.lineTo(bx - nx * half, by - ny * half);
  graphics.lineTo(ax - nx * half, ay - ny * half);
  graphics.closePath();
  graphics.fillPath();
}

/**
 * Sahadaki kalkan. `extent` 0..1: levhalar baslangictan uca bu kadar
 * surulmus (acilis/kapanis). Levha boyu yarim hucre civari; sayi parcanin
 * boyundan, yani kisa kalkan da tam levhalardan olusuyor.
 */
export function drawMetalShield(
  graphics: Phaser.GameObjects.Graphics,
  segment: MetalShieldSegment,
  gridSize: number,
  extent: number,
  { now, reducedMotion, alpha = 1 }: ShieldDrawOptions
) {
  const fullDx = segment.x2 - segment.x1;
  const fullDy = segment.y2 - segment.y1;
  const fullLength = Math.hypot(fullDx, fullDy);
  const open = Math.max(0, Math.min(1, extent));
  if (!(fullLength > 0) || open <= 0) return;
  const ux = fullDx / fullLength;
  const uy = fullDy / fullLength;
  const nx = -uy;
  const ny = ux;
  const length = fullLength * open;
  const half = getMetalShieldThickness(gridSize) / 2;
  const endX = segment.x1 + ux * length;
  const endY = segment.y1 + uy * length;

  // Cerceve: levhalarin altinda koyu, biraz daha genis govde.
  graphics.fillStyle(METAL_SHIELD_FRAME_COLOR, 0.94 * alpha);
  fillQuad(graphics, segment.x1 - ux * 1.5, segment.y1 - uy * 1.5, endX + ux * 1.5, endY + uy * 1.5, nx, ny, half + 1.5);

  // Levhalar: aralarinda koyu derz. Acilirken son levha kismi gorunur.
  const plateCount = Math.max(1, Math.round(fullLength / Math.max(8, gridSize * 0.5)));
  const plateLength = fullLength / plateCount;
  const seam = Math.min(1.5, plateLength * 0.12);
  for (let index = 0; index < plateCount; index += 1) {
    const from = index * plateLength + seam;
    const to = Math.min(length, (index + 1) * plateLength - seam);
    if (to <= from) break;
    const ax = segment.x1 + ux * from;
    const ay = segment.y1 + uy * from;
    const bx = segment.x1 + ux * to;
    const by = segment.y1 + uy * to;
    graphics.fillStyle(METAL_SHIELD_PLATE_COLOR, alpha);
    fillQuad(graphics, ax, ay, bx, by, nx, ny, half);
    // Ust pah: levhanin bir yaninda ince acik serit (isik tek yonden).
    graphics.fillStyle(METAL_SHIELD_PLATE_LIGHT, 0.85 * alpha);
    fillQuad(graphics, ax - nx * half * 0.55, ay - ny * half * 0.55, bx - nx * half * 0.55, by - ny * half * 0.55, nx, ny, half * 0.2);
    // Percin: levhanin ortasinda koyu kare.
    const mx = (ax + bx) / 2 + nx * half * 0.25;
    const my = (ay + by) / 2 + ny * half * 0.25;
    const rivet = Math.max(1, half * 0.22);
    graphics.fillStyle(METAL_SHIELD_FRAME_COLOR, 0.9 * alpha);
    graphics.fillRect(mx - rivet, my - rivet, rivet * 2, rivet * 2);
  }

  // Enerji kenari: iki uzun kenarda ince, sert camgobegi hat. Nabiz saydamlikta
  // ve dar aralikta; hareket azaltmada sabit.
  const pulse = reducedMotion ? 0.9 : 0.78 + 0.18 * (0.5 + 0.5 * Math.sin(now / 90));
  graphics.lineStyle(Math.max(1.2, half * 0.28), METAL_SHIELD_EDGE_COLOR, pulse * alpha);
  graphics.lineBetween(segment.x1 + nx * (half + 1.5), segment.y1 + ny * (half + 1.5), endX + nx * (half + 1.5), endY + ny * (half + 1.5));
  graphics.lineBetween(segment.x1 - nx * (half + 1.5), segment.y1 - ny * (half + 1.5), endX - nx * (half + 1.5), endY - ny * (half + 1.5));

  // Dikmeler: iki ucta kalkani yere baglayan koyu blok ve camgobegi pim.
  const post = half + 3;
  for (const [px, py] of [[segment.x1, segment.y1], [endX, endY]] as const) {
    graphics.fillStyle(METAL_SHIELD_FRAME_COLOR, alpha);
    fillQuad(graphics, px - ux * 2.5, py - uy * 2.5, px + ux * 2.5, py + uy * 2.5, nx, ny, post);
    graphics.fillStyle(METAL_SHIELD_EDGE_COLOR, 0.95 * alpha);
    graphics.fillRect(px - 1.25, py - 1.25, 2.5, 2.5);
  }
}

/**
 * Surukleme onizlemesi: kalkanin cekilecegi yerde ince, sert kenarli top
 * metali bir levha hatti, bir kenarinda soguk camgobegi cizgi, iki ucta dik
 * kertik. `maxed`: uc azami boyda kirpildi (uc kertigi dolu). `invalid`:
 * buraya cekilemez (kirmizi). `alpha`: istek yoldayken soluk.
 */
export function drawMetalShieldPreview(
  graphics: Phaser.GameObjects.Graphics,
  segment: MetalShieldSegment,
  gridSize: number,
  options: { maxed?: boolean; invalid?: boolean; alpha?: number } = {}
) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return;
  const alpha = options.alpha ?? 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const half = Math.max(1.5, gridSize * 0.055);
  const edge = options.invalid ? METAL_SHIELD_INVALID_COLOR : METAL_SHIELD_EDGE_COLOR;

  graphics.fillStyle(METAL_SHIELD_FRAME_COLOR, 0.85 * alpha);
  fillQuad(graphics, segment.x1, segment.y1, segment.x2, segment.y2, nx, ny, half + 1.2);
  graphics.fillStyle(options.invalid ? METAL_SHIELD_INVALID_PLATE_COLOR : METAL_SHIELD_PLATE_LIGHT, 0.95 * alpha);
  fillQuad(graphics, segment.x1, segment.y1, segment.x2, segment.y2, nx, ny, half);
  graphics.lineStyle(1.2, edge, 0.95 * alpha);
  graphics.lineBetween(segment.x1 + nx * (half + 1.8), segment.y1 + ny * (half + 1.8), segment.x2 + nx * (half + 1.8), segment.y2 + ny * (half + 1.8));

  // Uc kertikleri: baslangic acik cerceve, uc azami boyda dolu.
  const tick = Math.max(5, gridSize * 0.2);
  graphics.lineStyle(1.6, edge, 0.95 * alpha);
  graphics.lineBetween(segment.x1 - nx * tick, segment.y1 - ny * tick, segment.x1 + nx * tick, segment.y1 + ny * tick);
  graphics.lineBetween(segment.x2 - nx * tick, segment.y2 - ny * tick, segment.x2 + nx * tick, segment.y2 + ny * tick);
  if (options.maxed) {
    graphics.fillStyle(edge, 0.95 * alpha);
    fillQuad(graphics, segment.x2 - ux * 2, segment.y2 - uy * 2, segment.x2, segment.y2, nx, ny, tick);
  }
}
