/**
 * Iki yuzlu cizim yuzeyi: Phaser'in duz yuzeyi ya da (egik 3D gorunumde) onun
 * 3D karsiligi (render3d/overlay-3d). Cizen kod (kule isaretleri, operator
 * isini, mac sonu isini) ayni cagrilari yapiyor; hangisine gidecegi her
 * cagrida `alternate`ten: 3D yuzey varsa ona, yoksa duz yuzeye.
 *
 * `clear` ikisini de siliyor: gorunum degisince eskisinde iz kalmiyor.
 */
import type { VfxGraphics } from "./kit";

type Surface = VfxGraphics & { clear(): unknown };
type Anchored = Surface & { setAnchor?(x: number, y: number): void };

export class SwitchSurface implements VfxGraphics {
  constructor(private readonly flat: Surface, private readonly alternate: () => Anchored | undefined) {}

  private get target(): Surface {
    return this.alternate() ?? this.flat;
  }

  clear() {
    this.flat.clear();
    this.alternate()?.clear();
    return this;
  }

  /** 3D'de yukari uzanan cizimin tabani (duz yuzeyde etkisiz). */
  setAnchor(x: number, y: number) {
    this.alternate()?.setAnchor?.(x, y);
  }

  lineStyle(width: number, color: number, alpha?: number) {
    return this.target.lineStyle(width, color, alpha);
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    return this.target.lineBetween(x1, y1, x2, y2);
  }

  fillStyle(color: number, alpha?: number) {
    return this.target.fillStyle(color, alpha);
  }

  fillCircle(x: number, y: number, radius: number) {
    return this.target.fillCircle(x, y, radius);
  }

  strokeCircle(x: number, y: number, radius: number) {
    return this.target.strokeCircle(x, y, radius);
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    return this.target.fillTriangle(x0, y0, x1, y1, x2, y2);
  }

  fillRect(x: number, y: number, width: number, height: number) {
    return this.target.fillRect(x, y, width, height);
  }

  strokeRect(x: number, y: number, width: number, height: number) {
    return this.target.strokeRect(x, y, width, height);
  }

  fillEllipse(x: number, y: number, width: number, height: number, smoothness?: number) {
    return this.target.fillEllipse(x, y, width, height, smoothness);
  }

  strokeEllipse(x: number, y: number, width: number, height: number, smoothness?: number) {
    return this.target.strokeEllipse(x, y, width, height, smoothness);
  }

  beginPath() {
    return this.target.beginPath();
  }

  moveTo(x: number, y: number) {
    return this.target.moveTo(x, y);
  }

  lineTo(x: number, y: number) {
    return this.target.lineTo(x, y);
  }

  closePath() {
    return this.target.closePath();
  }

  strokePath() {
    return this.target.strokePath();
  }

  fillPath() {
    return this.target.fillPath();
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {
    return this.target.arc(x, y, radius, startAngle, endAngle, anticlockwise);
  }

  fillPoints(points: ReadonlyArray<{ x: number; y: number }>, closeShape?: boolean, closePath?: boolean) {
    return this.target.fillPoints(points, closeShape, closePath);
  }

  strokePoints(points: ReadonlyArray<{ x: number; y: number }>, closeShape?: boolean, closePath?: boolean) {
    return this.target.strokePoints(points, closeShape, closePath);
  }
}
