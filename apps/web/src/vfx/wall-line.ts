import type Phaser from "phaser";

/**
 * Duvar cizgisinin cizimi: durakla-sabitle halkasi, capa isareti, uzatma
 * tutamaclari ve parmagin yanindaki bedel etiketi.
 *
 * Parcalarin kendisi (yesil/kirmizi kenar dikdortgenleri) yerlestirme
 * izgarasina cizilir; burasi onlarin ustundeki isaretler. Dil sert bilimkurgu:
 * ince turkuaz cizgi, dolgusuz halka, kose isaretleri; parilti yok.
 */

const MARK_COLOR = 0x67e8f9;
const MARK_DIM = 0x0b1220;
const WARN_COLOR = "#fca5a5";
const OK_COLOR = "#e0f2fe";

export type WallHandleMark = {
  x: number;
  y: number;
  /** Tutamacin baktigi (disari) yon: eksen ve isaret. */
  axis: "horizontal" | "vertical";
  direction: 1 | -1;
};

/**
 * Bekleme halkasinin kendisi: soluk tam halka + dolan parlak yay. Duvar
 * cizgisi ve harita jestiyle beceri (basili tut + surukle) ayni halkayi
 * ciziyor; `color` jest beklemedeyken soluk griye donuyor.
 */
export function strokeDwellRing(gfx: Phaser.GameObjects.Graphics, x: number, y: number, progress: number, radius: number, color = MARK_COLOR) {
  const sweep = Math.max(0, Math.min(1, progress));
  gfx.lineStyle(1.5, color, 0.28);
  gfx.strokeCircle(x, y, radius);
  if (sweep <= 0) return;
  gfx.lineStyle(2.5, color, 0.95);
  gfx.beginPath();
  gfx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep, false);
  gfx.strokePath();
}

export class WallLineView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth);
    this.label = scene.add.text(0, 0, "", {
      color: OK_COLOR,
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold",
      backgroundColor: "#0b1220e6",
      padding: { x: 5, y: 3 }
    }).setOrigin(0.5, 1).setDepth(depth + 0.1).setVisible(false);
  }

  /** Isaretleri siler (etiket kalir). */
  clearMarks() {
    this.gfx.clear();
  }

  clear() {
    this.gfx.clear();
    this.label.setVisible(false);
  }

  /**
   * Bekleme halkasi: parmak sabit kaldikca dolar, dolunca capa atilir.
   * Soluk tam halka + parlak yay.
   */
  drawDwellRing(x: number, y: number, progress: number, radius: number) {
    strokeDwellRing(this.gfx, x, y, progress, radius);
  }

  /**
   * Sabitlenmis capa: halka ve dort kose isareti (nisangah). Hafifce nabiz
   * atar ki "bu nokta kilitli" ile "bu bir hayalet" ayirt edilsin.
   */
  drawAnchor(x: number, y: number, radius: number, now: number, still = false) {
    const pulse = still ? 1 : 0.78 + 0.22 * Math.sin(now / 160);
    this.gfx.lineStyle(2, MARK_COLOR, pulse);
    this.gfx.strokeCircle(x, y, radius * 0.62);
    const tick = radius * 0.5;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const cx = x + sx * radius;
      const cy = y + sy * radius;
      this.gfx.lineBetween(cx, cy, cx - sx * tick, cy);
      this.gfx.lineBetween(cx, cy, cx, cy - sy * tick);
    }
  }

  /**
   * Uzatma tutamaclari: koyu disk, turkuaz cerceve, disari bakan ok ucu.
   * Gorunen daire dokunma hedefinden (44 px) kucuk; hedefi sahne olcer.
   */
  drawHandles(handles: readonly WallHandleMark[], radius: number, now: number, alpha: number) {
    const pulse = 0.82 + 0.18 * Math.sin(now / 220);
    for (const handle of handles) {
      this.gfx.fillStyle(MARK_DIM, 0.88 * alpha);
      this.gfx.fillCircle(handle.x, handle.y, radius);
      this.gfx.lineStyle(1.6, MARK_COLOR, pulse * alpha);
      this.gfx.strokeCircle(handle.x, handle.y, radius);
      const reach = radius * 0.46;
      const wing = radius * 0.4;
      const sign = handle.direction;
      this.gfx.lineStyle(2, MARK_COLOR, alpha);
      this.gfx.beginPath();
      if (handle.axis === "horizontal") {
        this.gfx.moveTo(handle.x - sign * reach * 0.4, handle.y - wing);
        this.gfx.lineTo(handle.x + sign * reach, handle.y);
        this.gfx.lineTo(handle.x - sign * reach * 0.4, handle.y + wing);
      } else {
        this.gfx.moveTo(handle.x - wing, handle.y - sign * reach * 0.4);
        this.gfx.lineTo(handle.x, handle.y + sign * reach);
        this.gfx.lineTo(handle.x + wing, handle.y - sign * reach * 0.4);
      }
      this.gfx.strokePath();
    }
  }

  /** Parmagin yanindaki "N duvar · X g" etiketi; `warn` altin yetmiyor ya da gecerli parca yok. */
  setLabel(text: string, x: number, y: number, warn: boolean) {
    this.label.setText(text).setPosition(x, y).setColor(warn ? WARN_COLOR : OK_COLOR).setVisible(true);
  }

  setLabelPosition(x: number, y: number) {
    this.label.setPosition(x, y);
  }

  hideLabel() {
    this.label.setVisible(false);
  }

  destroy() {
    this.gfx.destroy();
    this.label.destroy();
  }
}
