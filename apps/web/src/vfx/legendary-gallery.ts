import type Phaser from "phaser";
import {
  CHRONO_SCAR_MS,
  FREEZE_DURATION_MS,
  GAME_SPEED_MULTIPLIER,
  GRAVITY_DURATION_MS,
  LINK_DURATION_MS,
  SHATTER_FRACTURE_MS,
  type LegendaryEffect,
  type LegendaryProcMessage
} from "@karayel/shared";
import type { FlashSink } from "./flash-pool";
import { LegendaryProcVfx, type LegendaryEnemySpot } from "./legendary-procs";

/**
 * VFX galerisinin "Efsanevi" kipi: sekiz efsanevi vurus etkisi tek sayfada,
 * ikiye dort hucrede, oyundaki ciziciyle (`LegendaryProcVfx`) ve galerinin
 * sanal saatiyle donen kisa dongulerde. Mesajlar sunucunun yayiniyla ayni
 * bicim; sureler oyun ms'si (cizici duvar saatine ceviriyor).
 *
 * Sayfalar: normal, LOD 2 (ikincil ayrinti dusuk) ve azaltilmis hareket.
 */
export const LEGENDARY_GALLERY_PAGES: ReadonlyArray<{ label: string; lod: number; still: boolean }> = [
  { label: "efsanevi etkiler · normal", lod: 0, still: false },
  { label: "efsanevi etkiler · LOD 2", lod: 2, still: false },
  { label: "efsanevi etkiler · azaltılmış hareket", lod: 0, still: true }
];

const ORDER: readonly LegendaryEffect[] = ["chain", "blast", "freeze", "execute", "shatter", "chrono", "link", "gravity"];
const LABELS: Record<LegendaryEffect, string> = {
  chain: "zincirleme şimşek",
  blast: "vuruşta patlama",
  freeze: "dondurucu darbe",
  execute: "infaz",
  shatter: "ölüm parçalanması",
  chrono: "kronal iz",
  link: "hasar bağı",
  gravity: "kütle çekim çapası"
};

const wall = (gameMs: number) => gameMs / GAME_SPEED_MULTIPLIER;
/** Hucre dongusu (duvar ms): etkinin kendi suresi ve kisa bir bosluk. */
const CYCLE_MS: Record<LegendaryEffect, number> = {
  chain: 1400,
  blast: 1400,
  freeze: wall(FREEZE_DURATION_MS) + 900,
  execute: 1600,
  shatter: 2600,
  chrono: wall(CHRONO_SCAR_MS) + 900,
  link: wall(LINK_DURATION_MS) + 700,
  gravity: wall(GRAVITY_DURATION_MS) + 700
};
/** Parcalanma hucresinde dusmanin oldugu an (catlak suresi icinde). */
const SHATTER_DEATH_MS = 1500;

type Cell = {
  kind: LegendaryEffect;
  x: number;
  y: number;
  w: number;
  h: number;
  enemies: Array<{ id: string; sprite: Phaser.GameObjects.Image; hx: number; hy: number; phase: number }>;
  lastCycle: number;
  lastT: number;
};

export class LegendaryGalleryPage {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private cells: Cell[] = [];
  private readonly spots = new Map<string, LegendaryEnemySpot>();
  private readonly lodState = { level: 0 };
  private still = false;
  private page = 0;
  private readonly vfx: LegendaryProcVfx;
  private enemySize = 26;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly board: Phaser.GameObjects.Graphics,
    top: Phaser.GameObjects.Graphics,
    ground: Phaser.GameObjects.Graphics,
    flash?: FlashSink
  ) {
    this.vfx = new LegendaryProcVfx(top, ground, { lod: this.lodState, reducedMotion: () => this.still, flash, fallbackEnemySize: 26 });
  }

  get pageCount() {
    return LEGENDARY_GALLERY_PAGES.length;
  }

  get label() {
    return LEGENDARY_GALLERY_PAGES[this.page].label;
  }

  clear() {
    for (const sprite of this.sprites) sprite.destroy();
    for (const label of this.labels) label.destroy();
    this.sprites.length = 0;
    this.labels.length = 0;
    this.cells = [];
    this.spots.clear();
    this.board.clear();
    this.vfx.clear();
  }

  build(page: number, area: { x: number; y: number; width: number; height: number }) {
    this.clear();
    this.page = page;
    const spec = LEGENDARY_GALLERY_PAGES[page];
    this.lodState.level = spec.lod;
    this.still = spec.still;
    const cols = 2;
    const rows = 4;
    const w = area.width / cols;
    const h = area.height / rows;
    this.enemySize = Math.max(18, Math.min(30, Math.min(w, h) * 0.2));
    this.board.fillStyle(0x0b1220, 1);
    this.board.fillRect(area.x, area.y, area.width, area.height);
    this.board.lineStyle(1, 0x1e293b, 0.9);
    ORDER.forEach((kind, index) => {
      const x = area.x + (index % cols) * w;
      const y = area.y + Math.floor(index / cols) * h;
      this.board.strokeRect(x, y, w, h);
      this.labels.push(this.scene.add.text(x + 4, y + 3, LABELS[kind], { fontFamily: "Rajdhani, sans-serif", fontSize: "10px", color: "#94a3b8" }).setDepth(30));
      const cell: Cell = { kind, x, y, w, h, enemies: [], lastCycle: -1, lastT: 0 };
      const cx = x + w / 2;
      const cy = y + h / 2 + 6;
      // Hucrenin dusmanlari: hedef ortada, digerleri cevresinde (zincir, bag, cekim icin).
      const layout: Array<[number, number]> = kind === "chain"
        ? [[-0.3, 0.1], [-0.05, -0.18], [0.15, 0.15], [0.33, -0.1]]
        : kind === "link" ? [[-0.25, 0], [0.25, 0.05]]
          : kind === "gravity" || kind === "blast" ? [[0, 0], [-0.3, -0.15], [0.3, 0.12], [0.05, 0.28]]
            : [[0, 0]];
      layout.forEach(([dx, dy], order) => {
        const sprite = this.scene.add.image(cx + dx * w, cy + dy * h, this.scene.textures.exists("enemy-grunt") ? "enemy-grunt" : "__DEFAULT").setDepth(8);
        sprite.setDisplaySize(this.enemySize, this.enemySize);
        this.sprites.push(sprite);
        cell.enemies.push({ id: `lg-${kind}-${order}`, sprite, hx: cx + dx * w, hy: cy + dy * h, phase: order * 1.7 + index });
      });
      this.cells.push(cell);
    });
  }

  /** Karenin durumu; `now` galerinin sanal saati. */
  render(now: number) {
    for (const cell of this.cells) this.renderCell(cell, now);
    this.vfx.render(now, (id) => this.spots.get(id));
    return `${this.vfx.liveCount} canlı kayıt · LOD ${this.lodState.level}${this.still ? " · sabit" : ""}`;
  }

  private renderCell(cell: Cell, now: number) {
    const cycleMs = CYCLE_MS[cell.kind];
    const cycle = Math.floor(now / cycleMs);
    const t = now % cycleMs;
    if (cycle !== cell.lastCycle) {
      cell.lastCycle = cycle;
      cell.lastT = -1;
    }
    const since = cell.lastT;
    cell.lastT = t;
    const crossed = (at: number) => since < at && t >= at;
    const radius = Math.min(cell.w, cell.h) * 0.42;
    // Yuruyuculer: kucuk elipsler; cekim hucresinde komsular capaya dogru kayiyor.
    const pull = cell.kind === "gravity" ? Math.min(1, t / wall(GRAVITY_DURATION_MS)) * 0.55 : 0;
    const anchor = cell.enemies[0];
    cell.enemies.forEach((enemy, order) => {
      const angle = now / 900 + enemy.phase;
      let x = enemy.hx + Math.cos(angle) * 4;
      let y = enemy.hy + Math.sin(angle) * 3;
      if (pull > 0 && order > 0) {
        x += (anchor.hx - x) * pull;
        y += (anchor.hy - y) * pull;
      }
      // Oldurulen hedef (infaz, parcalanma) dongunun geri kalaninda gorunmuyor.
      const dead = (cell.kind === "execute" && t >= 300) || (cell.kind === "shatter" && t >= SHATTER_DEATH_MS);
      enemy.sprite.setPosition(x, y).setVisible(!dead);
      if (dead) this.spots.delete(enemy.id);
      else this.spots.set(enemy.id, { x, y, size: this.enemySize });
    });
    const target = cell.enemies[0];
    const spot = this.spots.get(target.id) ?? { x: target.hx, y: target.hy, size: this.enemySize };
    const emit = (message: LegendaryProcMessage) => this.vfx.emit(message, now);
    switch (cell.kind) {
      case "chain":
        if (crossed(100)) {
          const p: number[] = [];
          for (const enemy of cell.enemies) {
            const point = this.spots.get(enemy.id);
            if (point) p.push(point.x, point.y);
          }
          emit({ k: "chain", x: spot.x, y: spot.y, t: "g", p });
        }
        break;
      case "blast":
        if (crossed(100)) emit({ k: "blast", x: spot.x, y: spot.y, r: radius, t: "g" });
        break;
      case "freeze":
        if (crossed(100)) emit({ k: "freeze", x: spot.x, y: spot.y, e: target.id, ms: FREEZE_DURATION_MS });
        break;
      case "execute":
        if (crossed(300)) emit({ k: "execute", x: spot.x, y: spot.y, e: target.id, t: "g" });
        break;
      case "shatter":
        if (crossed(100)) emit({ k: "shatter", x: spot.x, y: spot.y, e: target.id, ms: SHATTER_FRACTURE_MS });
        if (crossed(SHATTER_DEATH_MS)) emit({ k: "shatter", x: target.sprite.x, y: target.sprite.y, r: radius, f: 1 });
        break;
      case "chrono":
        if (crossed(100)) emit({ k: "chrono", x: spot.x, y: spot.y, e: target.id, ms: CHRONO_SCAR_MS });
        if (crossed(100 + wall(CHRONO_SCAR_MS))) emit({ k: "chrono", x: spot.x, y: spot.y, e: target.id, a: 120, f: 1 });
        break;
      case "link": {
        const partner = cell.enemies[1];
        const other = partner ? this.spots.get(partner.id) : undefined;
        if (crossed(100) && partner && other) emit({ k: "link", x: spot.x, y: spot.y, e: target.id, e2: partner.id, ms: LINK_DURATION_MS, p: [other.x, other.y] });
        break;
      }
      case "gravity":
        if (crossed(50)) emit({ k: "gravity", x: spot.x, y: spot.y, e: target.id, ms: GRAVITY_DURATION_MS, r: radius, t: "g" });
        break;
    }
  }
}
