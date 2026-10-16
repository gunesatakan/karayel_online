import type Phaser from "phaser";
import type { SkillGestureThresholds, SkillGestureTier } from "@karayel/shared";
import { strokeDwellRing } from "./wall-line";

/**
 * Harita jestiyle becerinin cizimi: basili tutma halkasi, kademe cubugu,
 * Execute adayinin nisangahi ve parmagin yanindaki etiket.
 *
 * Dil sert bilimkurgu: ince cizgi, dolgusuz halka, kose isaretleri; parilti,
 * yaldiz, sekerleme yok. Kademe renkle okunuyor:
 *   DUSUK camgobegi-mavi, ORTA kehribar, YUKSEK kizil-turuncu.
 * Beklemede ya da itibar yetmiyorsa cubuk griye donuyor (yetmiyorsa ucta
 * kirmizi carpi). Hareket azaltmada nabiz yok.
 */

export const SKILL_TIER_COLORS: Readonly<Record<SkillGestureTier, number>> = {
  small: 0x3a9fd0,
  medium: 0xc28f34,
  big: 0xc25a32
};
/** Esigin altinda (birakirsan iptal), beklemede ya da yetmeyen bedelde cubuk. */
export const SKILL_GESTURE_IDLE_COLOR = 0x6b7280;
/** Yetmeyen bedelin carpisi. */
export const SKILL_GESTURE_DENY_COLOR = 0xb4473a;
const DIM = 0x0b1220;

const TEXT_OK = "#e2e8f0";
const TEXT_WARN = "#fca5a5";
const TEXT_TIER: Readonly<Record<SkillGestureTier, string>> = {
  small: "#93c5e8",
  medium: "#e8c27a",
  big: "#ee9a7a"
};

export function getSkillTierColor(tier: SkillGestureTier | undefined) {
  return tier ? SKILL_TIER_COLORS[tier] : SKILL_GESTURE_IDLE_COLOR;
}

export type SkillTierBar = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thresholds: SkillGestureThresholds;
  /** Simdiki kademe; esigin altinda undefined (birakis iptal). */
  tier?: SkillGestureTier;
  /** Kademenin bedeli karsilaniyor mu. */
  affordable: boolean;
  /** Beceri beklemede degil. */
  ready: boolean;
};

export class SkillGestureView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private drawn = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth);
    this.label = scene.add.text(0, 0, "", {
      color: TEXT_OK,
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold",
      backgroundColor: "#0b1220e6",
      padding: { x: 5, y: 3 }
    }).setOrigin(0.5, 1).setDepth(depth + 0.1).setVisible(false);
  }

  destroy() {
    this.gfx.destroy();
    this.label.destroy();
  }

  clear() {
    if (!this.drawn) return;
    this.gfx.clear();
    this.label.setVisible(false);
    this.drawn = false;
  }

  /** Basili tutma halkasi: duvar cizgisinin halkasi; beklemede gri. */
  drawHoldRing(x: number, y: number, progress: number, radius: number, ready: boolean) {
    this.drawn = true;
    strokeDwellRing(this.gfx, x, y, progress, radius, ready ? undefined : SKILL_GESTURE_IDLE_COLOR);
  }

  /** Cizginin basi: kucuk dolgusuz halka ve koyu ic. */
  private drawStartNode(x: number, y: number, color: number, radius: number) {
    this.gfx.fillStyle(DIM, 0.7);
    this.gfx.fillCircle(x, y, radius);
    this.gfx.lineStyle(1.5, color, 0.9);
    this.gfx.strokeCircle(x, y, radius);
  }

  /**
   * Basla-parmak arasi ince cizgi (Yonlendirme ve Execute jestinin izi).
   * `active` degilse (esigin altinda) soluk.
   */
  drawTrace(startX: number, startY: number, endX: number, endY: number, active: boolean, ready: boolean, cellSize: number) {
    this.drawn = true;
    const color = ready ? 0x94a3b8 : SKILL_GESTURE_IDLE_COLOR;
    this.gfx.lineStyle(1.5, color, active ? 0.75 : 0.35);
    this.gfx.lineBetween(startX, startY, endX, endY);
    this.drawStartNode(startX, startY, color, Math.max(3, cellSize * 0.12));
  }

  /**
   * Kademe cubugu: bastan parmaga (en fazla `barMax`), renk kademeden. Kademe
   * sinirlarinda cubuga dik ince centikler; parmak hangi centigi gectiyse o
   * kademe. Esigin altinda soluk gri (birakirsan iptal).
   */
  drawTierBar(bar: SkillTierBar, cellSize: number) {
    this.drawn = true;
    const dx = bar.endX - bar.startX;
    const dy = bar.endY - bar.startY;
    const length = Math.hypot(dx, dy);
    const ux = length > 0 ? dx / length : 1;
    const uy = length > 0 ? dy / length : 0;
    const shown = Math.min(length, bar.thresholds.barMax);
    const endX = bar.startX + ux * shown;
    const endY = bar.startY + uy * shown;
    const usable = Boolean(bar.tier) && bar.affordable && bar.ready;
    const color = usable ? getSkillTierColor(bar.tier) : SKILL_GESTURE_IDLE_COLOR;
    // Ray: bastan YUKSEK'in sonuna kadar soluk, kademelerin nerede oldugunu gosterir.
    const railEnd = bar.thresholds.barMax;
    this.gfx.lineStyle(1, SKILL_GESTURE_IDLE_COLOR, 0.35);
    this.gfx.lineBetween(bar.startX, bar.startY, bar.startX + ux * railEnd, bar.startY + uy * railEnd);
    // Dolu kisim.
    this.gfx.lineStyle(bar.tier ? 3 : 1.5, color, bar.tier ? 0.95 : 0.6);
    this.gfx.lineBetween(bar.startX, bar.startY, endX, endY);
    // Centikler: ORTA ve YUKSEK sinirlari.
    const tick = Math.max(4, cellSize * 0.22);
    for (const [distance, tier] of [[bar.thresholds.medium, "medium"], [bar.thresholds.high, "big"]] as const) {
      const cx = bar.startX + ux * distance;
      const cy = bar.startY + uy * distance;
      const passed = shown >= distance;
      this.gfx.lineStyle(passed ? 2 : 1.25, passed && usable ? SKILL_TIER_COLORS[tier] : SKILL_GESTURE_IDLE_COLOR, passed ? 0.95 : 0.6);
      this.gfx.lineBetween(cx - uy * tick, cy + ux * tick, cx + uy * tick, cy - ux * tick);
    }
    this.drawStartNode(bar.startX, bar.startY, color, Math.max(3, cellSize * 0.12));
    // Uc: dolgusuz kare isaret; yetmeyen bedelde kirmizi carpi.
    const mark = Math.max(4, cellSize * 0.18);
    if (bar.tier && !bar.affordable) {
      this.gfx.lineStyle(2, SKILL_GESTURE_DENY_COLOR, 0.95);
      this.gfx.lineBetween(endX - mark, endY - mark, endX + mark, endY + mark);
      this.gfx.lineBetween(endX - mark, endY + mark, endX + mark, endY - mark);
    } else if (bar.tier) {
      this.gfx.lineStyle(1.5, color, 0.95);
      this.gfx.strokeRect(endX - mark, endY - mark, mark * 2, mark * 2);
    }
  }

  /**
   * Execute adayi: dusmanin etrafinda dort kose isareti. Bagisiksa (ezici,
   * sampiyon, kule avcisi) kirmizi; birakmak "Etkisiz" der, istek gitmez.
   */
  drawEnemyReticle(x: number, y: number, size: number, immune: boolean, ready: boolean) {
    this.drawn = true;
    const color = immune ? SKILL_GESTURE_DENY_COLOR : ready ? SKILL_TIER_COLORS.big : SKILL_GESTURE_IDLE_COLOR;
    const half = Math.max(8, size * 0.62);
    const arm = half * 0.45;
    this.gfx.lineStyle(2, color, 0.95);
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const cx = x + sx * half;
      const cy = y + sy * half;
      this.gfx.lineBetween(cx, cy, cx - sx * arm, cy);
      this.gfx.lineBetween(cx, cy, cx, cy - sy * arm);
    }
  }

  /** Parmagin ustundeki etiket; `tier` rengi verir, `warn` kirmizi (yetmiyor / beklemede). */
  setLabel(text: string, x: number, y: number, options: { tier?: SkillGestureTier; warn?: boolean } = {}) {
    this.drawn = true;
    const color = options.warn ? TEXT_WARN : options.tier ? TEXT_TIER[options.tier] : TEXT_OK;
    this.label.setText(text).setPosition(x, y).setColor(color).setVisible(true);
  }
}
