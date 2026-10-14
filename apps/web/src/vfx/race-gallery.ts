import type Phaser from "phaser";
import { BUG_BURROWER, FOURTH_FOLD_JUMP, FOURTH_PHASE_SHIFT, GAME_SPEED_MULTIPLIER, MEKA_SHIELD_THROWER, getMekaShieldGeometry, getSegmentCrossingT, getSoulDrawerMultipliers, type MekaShieldSnapshot } from "@karayel/shared";
import {
  MekaShieldImpacts,
  RACE_TRANSIENT,
  RaceTransientEffects,
  drawBurrowCracks,
  drawBurrowFurrow,
  drawFoldWarning,
  drawMekaShield,
  drawPetrifyPlating,
  drawPhaseGhost,
  drawSoulDrawerMark,
  getMekaShieldFlightProgress
} from "./race-traits";

/**
 * VFX galerisinin "Irklar" kipi: her irk mekanigi bir sayfada, 12x18'lik
 * kucuk bir haritada, oyundaki cizicilerle (race-traits) ve galerinin sanal
 * saatiyle donen kisa bir dongude. Sureler oyunun duvar saati karsiliklari
 * (oyun suresi / GAME_SPEED_MULTIPLIER); yalnizca dongunun bosluklari
 * kisaltildi.
 */
export type RaceGalleryPageId = "petrify" | "thrower" | "burrower" | "drawer" | "phaser" | "folder";

export const RACE_GALLERY_PAGES: ReadonlyArray<{ id: RaceGalleryPageId; label: string; cycleMs: number }> = [
  { id: "petrify", label: "golem · Taşlaşma (her vuruş +1 zırh)", cycleMs: 6000 },
  { id: "thrower", label: "meka · kalkan atıcı", cycleMs: 5600 },
  { id: "burrower", label: "uzay böceği · kazıcı", cycleMs: 7600 },
  { id: "drawer", label: "düşmüş · ruh çekici", cycleMs: 9200 },
  { id: "phaser", label: "4. boyut · faz kayması", cycleMs: 5200 },
  { id: "folder", label: "4. boyut · katlanma sıçraması", cycleMs: 6000 }
];

export const RACE_GALLERY_COLS = 12;
export const RACE_GALLERY_ROWS = 18;

const wall = (ms: number) => ms / GAME_SPEED_MULTIPLIER;
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

export class RaceGalleryPage {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly transients = new RaceTransientEffects();
  private readonly impacts = new MekaShieldImpacts();
  private readonly shield: MekaShieldSnapshot = { id: 1, x1: 0, y1: 0, x2: 0, y2: 0, ms: 0 };
  private page = 0;
  private grid = 24;
  private readonly origin = { x: 0, y: 0 };
  private lastCycle = -1;
  private lastT = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly board: Phaser.GameObjects.Graphics,
    private readonly ground: Phaser.GameObjects.Graphics,
    private readonly body: Phaser.GameObjects.Graphics,
    private readonly top: Phaser.GameObjects.Graphics
  ) {}

  get pageCount() {
    return RACE_GALLERY_PAGES.length;
  }

  get label() {
    return RACE_GALLERY_PAGES[this.page].label;
  }

  clear() {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    for (const surface of [this.board, this.ground, this.body, this.top]) surface.clear();
    this.transients.clear();
    this.lastCycle = -1;
  }

  build(page: number, origin: { x: number; y: number }, grid: number) {
    this.clear();
    this.page = page;
    this.grid = grid;
    this.origin.x = origin.x;
    this.origin.y = origin.y;
    const { x, y } = origin;
    const board = this.board;
    board.fillStyle(0x0b1220, 1);
    board.fillRect(x, y, RACE_GALLERY_COLS * grid, RACE_GALLERY_ROWS * grid);
    board.lineStyle(1, 0x1e293b, 0.9);
    for (let col = 0; col <= RACE_GALLERY_COLS; col += 1) board.lineBetween(x + col * grid, y, x + col * grid, y + RACE_GALLERY_ROWS * grid);
    for (let row = 0; row <= RACE_GALLERY_ROWS; row += 1) board.lineBetween(x, y + row * grid, x + RACE_GALLERY_COLS * grid, y + row * grid);
    board.lineStyle(2, 0xb45454, 0.85);
    board.lineBetween(x, y, x + RACE_GALLERY_COLS * grid, y);
    board.lineStyle(2, 0x4f9a6c, 0.85);
    board.lineBetween(x, y + RACE_GALLERY_ROWS * grid, x + RACE_GALLERY_COLS * grid, y + RACE_GALLERY_ROWS * grid);
    const id = RACE_GALLERY_PAGES[page].id;
    const tower = (col: number, row: number) => {
      board.fillStyle(0x334155, 1);
      board.fillRect(x + col * grid + 3, y + row * grid + 3, grid - 6, grid - 6);
      board.lineStyle(1.5, 0x94a3b8, 0.9);
      board.strokeRect(x + col * grid + 3, y + row * grid + 3, grid - 6, grid - 6);
    };
    if (id === "petrify") tower(2, 9);
    if (id === "thrower") tower(5, 13);
    if (id === "burrower") {
      // Boydan boya duvar: yuruyen bocek gecemez, kazici altindan gecer.
      board.lineStyle(4, 0x94a3b8, 1);
      board.lineBetween(x, y + 5 * grid, x + RACE_GALLERY_COLS * grid, y + 5 * grid);
    }
    const texture: Record<RaceGalleryPageId, string[]> = {
      petrify: ["enemy-golem-brute"],
      thrower: ["enemy-grunt"],
      burrower: ["enemy-spaceBug-grunt"],
      drawer: ["enemy-fallen-brute", "enemy-fallen-grunt"],
      phaser: ["enemy-fourthDimensional-grunt"],
      folder: ["enemy-fourthDimensional-runner"]
    };
    for (const key of texture[id]) {
      const exists = this.scene.textures.exists(key);
      const sprite = this.scene.add.image(0, 0, exists ? key : "enemy-grunt").setDepth(8);
      sprite.setDisplaySize(grid * 0.95, grid * 0.95);
      this.sprites.push(sprite);
    }
  }

  private cell(col: number, row: number) {
    return { x: this.origin.x + (col + 0.5) * this.grid, y: this.origin.y + (row + 0.5) * this.grid };
  }

  /** Karenin durumu; `now` galerinin sanal saati. Donen yazi durum satiri. */
  render(now: number): string {
    const spec = RACE_GALLERY_PAGES[this.page];
    const cycle = Math.floor(now / spec.cycleMs);
    const t = now % spec.cycleMs;
    if (cycle !== this.lastCycle) {
      this.lastCycle = cycle;
      this.lastT = 0;
    }
    const since = this.lastT;
    this.lastT = t;
    const crossed = (at: number) => since < at && t >= at;
    this.ground.clear();
    this.body.clear();
    this.top.clear();
    const grid = this.grid;
    const size = grid * 0.95;
    const options = { now, reducedMotion: false };
    const [main, extra] = this.sprites;
    let status = "";

    if (spec.id === "petrify") {
      const p = this.cell(5.5, lerp(3, 13, t / spec.cycleMs));
      const stacks = Math.round(Math.min(1, t / (spec.cycleMs - 1000)) * 200);
      main?.setPosition(p.x, p.y);
      const source = this.cell(2, 9);
      // Sik vuran isin (Debug Lazer gibi): her vurus bir yigin.
      if (Math.floor(now / 90) % 2 === 0) {
        this.top.lineStyle(1.5, 0xc8473a, 0.8);
        this.top.lineBetween(source.x, source.y, p.x, p.y);
      }
      drawPetrifyPlating(this.body, p.x, p.y, size, stacks, 7);
      status = `yığın ${stacks} · zırh +${stacks} · hasar ×${(100 / (100 + stacks)).toFixed(2)}`;
    } else if (spec.id === "thrower") {
      const meka = this.cell(5, lerp(6, 8, t / spec.cycleMs));
      main?.setPosition(meka.x, meka.y);
      const tower = this.cell(5, 13);
      const throwAt = 400;
      const flight = wall(MEKA_SHIELD_THROWER.flightMs);
      const life = wall(MEKA_SHIELD_THROWER.lifetimeMs);
      if (t >= throwAt && t < throwAt + flight + life) {
        const from = this.cell(5, lerp(6, 8, throwAt / spec.cycleMs));
        const geometry = getMekaShieldGeometry(from.x, from.y, tower.x, tower.y, grid)!;
        const shield = this.shield;
        shield.x1 = geometry.x1;
        shield.y1 = geometry.y1;
        shield.x2 = geometry.x2;
        shield.y2 = geometry.y2;
        shield.ox = from.x;
        shield.oy = from.y;
        const landAt = throwAt + flight;
        shield.ms = Math.max(0, throwAt + flight + life - Math.max(t, landAt));
        const flying = t < landAt;
        drawMekaShield(this.top, shield, flying ? getMekaShieldFlightProgress(landAt - t) : undefined, grid, options);
        // Kule her 350 ms'de ates ediyor; inmis kalkan atisi durduruyor.
        if (!flying && Math.floor(since / 350) !== Math.floor(t / 350)) {
          const along = getSegmentCrossingT(tower.x, tower.y, meka.x, meka.y, shield.x1, shield.y1, shield.x2, shield.y2);
          if (along !== undefined) {
            const hx = tower.x + (meka.x - tower.x) * along;
            const hy = tower.y + (meka.y - tower.y) * along;
            const dx = shield.x2 - shield.x1;
            const dy = shield.y2 - shield.y1;
            this.impacts.add(shield, ((hx - shield.x1) * dx + (hy - shield.y1) * dy) / (dx * dx + dy * dy), now);
          }
        }
        status = flying ? "kalkan uçuyor (atış kesmiyor)" : `kalkan: ${Math.ceil(shield.ms / 100) / 10} sn · atışlar duruyor`;
      } else {
        status = t < throwAt ? "kuleye 4 hücre: atış" : "bekleme (8 sn)";
      }
      if (Math.floor(now / 350) % 2 === 0 && !(t >= throwAt + flight && t < throwAt + flight + life)) {
        this.top.lineStyle(1.2, 0xe9f3f8, 0.6);
        this.top.lineBetween(tower.x, tower.y, meka.x, meka.y);
      }
      this.impacts.draw(this.top, grid, now, false);
    } else if (spec.id === "burrower") {
      const digAt = 600;
      const emergeAt = digAt + wall(BUG_BURROWER.undergroundMs);
      const start = this.cell(5, 0);
      const dig = this.cell(5, 1);
      const out = this.cell(7, 8);
      let p = start;
      if (t < digAt) p = { x: start.x, y: lerp(start.y, dig.y, t / digAt) };
      else if (t < emergeAt) p = { x: lerp(dig.x, out.x, (t - digAt) / (emergeAt - digAt)), y: lerp(dig.y, out.y, (t - digAt) / (emergeAt - digAt)) };
      else p = { x: out.x, y: lerp(out.y, this.cell(7, 11).y, (t - emergeAt) / (spec.cycleMs - emergeAt)) };
      const under = t >= digAt && t < emergeAt;
      main?.setPosition(p.x, p.y).setVisible(!under);
      if (crossed(digAt)) this.transients.add(RACE_TRANSIENT.dig, dig.x, dig.y, now);
      if (crossed(emergeAt)) this.transients.add(RACE_TRANSIENT.emerge, out.x, out.y, now);
      if (under) {
        drawBurrowFurrow(this.ground, p.x, p.y, size, 3, options);
        const telegraph = emergeAt - wall(BUG_BURROWER.telegraphMs);
        if (t >= telegraph) drawBurrowCracks(this.ground, out.x, out.y, grid, (t - telegraph) / (emergeAt - telegraph), 11);
        status = t >= telegraph ? "çıkış çatlakları (1,5 sn)" : "yer altında: vurulamaz, duvarın altından";
      } else {
        status = t < digAt ? "giriş" : "çıktı: normal";
      }
    } else if (spec.id === "drawer") {
      const center = this.cell(6, 9);
      const slot = 800;
      const deaths = Math.min(10, Math.floor(t / slot));
      const scale = getSoulDrawerMultipliers(deaths).size;
      main?.setPosition(center.x, center.y).setDisplaySize(size * 1.15 * scale, size * 1.15 * scale);
      drawSoulDrawerMark(this.body, center.x, center.y, size * 1.15 * scale, deaths);
      if (deaths < 10) {
        const angle = (deaths / 10) * Math.PI * 2;
        const ally = { x: center.x + Math.cos(angle) * grid * 1.8, y: center.y + Math.sin(angle) * grid * 1.8 };
        const local = t % slot;
        extra?.setPosition(ally.x, ally.y).setVisible(local < slot * 0.75).setAlpha(1 - local / slot);
        if (crossed(Math.floor(t / slot) * slot + slot * 0.75)) this.transients.add(RACE_TRANSIENT.wisp, ally.x, ally.y, now, center.x, center.y);
      } else {
        extra?.setVisible(false);
      }
      status = `yığın ${deaths}/10 · can ×${getSoulDrawerMultipliers(deaths).hp.toFixed(2)} · hız ×${getSoulDrawerMultipliers(deaths).speed.toFixed(2)}`;
    } else if (spec.id === "phaser") {
      const p = this.cell(5.5, lerp(3, 12, t / spec.cycleMs));
      main?.setPosition(p.x, p.y);
      const phaseAt = 1600;
      const phased = t >= phaseAt && t < phaseAt + wall(FOURTH_PHASE_SHIFT.durationMs);
      main?.setAlpha(phased ? 0.32 : 1);
      if (phased) drawPhaseGhost(this.body, p.x, p.y, size, 5, options);
      status = phased ? "fazda: vurulamaz, yürüyor (1,5 sn)" : "her 6 sn'de faz";
    } else {
      const jumpAt = 3000;
      const warnAt = jumpAt - wall(FOURTH_FOLD_JUMP.warningMs);
      const rowAt = (ms: number) => lerp(2, 5, ms / jumpAt);
      // Hedef uyari aninda seciliyor (yurudugu hucreden 3 ileri); sicrama oraya.
      const targetRow = Math.floor(rowAt(warnAt)) + 3;
      const row = t < jumpAt ? rowAt(t) : targetRow + lerp(0, 3, (t - jumpAt) / (spec.cycleMs - jumpAt));
      const p = this.cell(5, row);
      main?.setPosition(p.x, p.y);
      const target = this.cell(5, targetRow);
      if (t >= warnAt && t < jumpAt) drawFoldWarning(this.ground, target.x, target.y, grid, (t - warnAt) / (jumpAt - warnAt));
      if (crossed(jumpAt)) {
        const from = this.cell(5, rowAt(jumpAt));
        this.transients.add(RACE_TRANSIENT.fold, from.x, from.y, now, 0, p.y - from.y);
        this.transients.add(RACE_TRANSIENT.fold, p.x, p.y, now, 0, p.y - from.y);
      }
      status = t >= warnAt && t < jumpAt ? "uyarı: 0,8 sn sonra sıçrama" : t >= jumpAt ? "3 hücre ileri" : "her 7 sn'de katlanma";
    }
    this.transients.draw(this.top, grid, now, { reducedMotion: false });
    return status;
  }
}
