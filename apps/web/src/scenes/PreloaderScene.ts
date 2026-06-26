import Phaser from "phaser";
import { towerCatalog, type TowerDefinition } from "@karayel/shared";

const ENEMY_RACE_TEXTURES = ["spaceBug", "fourthDimensional", "holyGuardian", "fallen", "golem"] as const;
const ENEMY_TYPE_TEXTURES = ["grunt", "brute", "runner", "shooter"] as const;

export class PreloaderScene extends Phaser.Scene {
  constructor() {
    super("preloader");
  }

  preload() {
    this.load.image("zeynep-puppet-hands", "/images/zeynep-puppet-hands.png");
    this.load.image("melis-creepy", "/images/melis-creepy.png");
    this.load.image("melis-creepy-unstoppable", "/images/melis-creepy-unstoppable.png");
    this.load.image("melis-creepy-legend", "/images/melis-creepy-legend.png");
    this.load.image("enemy-grunt", "/images/enemies/enemy-grunt.png");
    this.load.image("enemy-brute", "/images/enemies/enemy-brute.png");
    this.load.image("enemy-runner", "/images/enemies/enemy-runner.png");
    this.load.image("enemy-shooter", "/images/enemies/enemy-shooter.png");
    for (const race of ENEMY_RACE_TEXTURES) {
      for (const type of ENEMY_TYPE_TEXTURES) {
        this.load.image(`enemy-${race}-${type}`, `/images/enemies/enemy-${race}-${type}.png`);
      }
    }
  }

  create() {
    this.createCircleTexture("player-zeynep", 0xec4899, 15);
    this.createCircleTexture("player-warrior", 0x22c55e, 13);
    this.createCircleTexture("player-archer", 0x38bdf8, 13);
    this.createCircleTexture("player-mage", 0xa78bfa, 13);
    this.createCircleTexture("player-healer", 0xf9a8d4, 13);
    this.createCircleTexture("player-tank", 0xfacc15, 15);
    this.createCircleTexture("player-onur", 0x14b8a6, 14);
    this.createArmorBreakTexture();
    this.createCircleTexture("projectile-arrow", 0xbae6fd, 4);
    this.createCircleTexture("projectile-bolt", 0x86efac, 4);
    this.createCircleTexture("projectile-orb", 0xc4b5fd, 6);
    this.createCircleTexture("projectile-light", 0xfbcfe8, 4);
    this.createCircleTexture("projectile-chain", 0xfef08a, 5);
    this.createCircleTexture("projectile-enemy", 0xfb7185, 4);
    this.createCircleTexture("projectile-tower", 0xf8fafc, 4);
    this.createDroneTexture("drone-attack", 0xfb7185, 0xfacc15);
    this.createDroneTexture("drone-repair", 0x22d3ee, 0x86efac);
    this.createProceduralTowerTextures();
    window.dispatchEvent(new CustomEvent("karayel:phaser-ready"));
  }

  private createCircleTexture(key: string, color: number, radius: number) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(radius, radius, radius);
    graphics.generateTexture(key, radius * 2, radius * 2);
    graphics.destroy();
  }

  private createArmorBreakTexture() {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    const size = 28;
    const center = size / 2;
    graphics.fillStyle(0x020617, 0.82);
    graphics.fillCircle(center, center, 13);
    graphics.lineStyle(2, 0xf8fafc, 0.95);
    graphics.beginPath();
    graphics.moveTo(center, 3);
    graphics.lineTo(23, 7);
    graphics.lineTo(21, 17);
    graphics.lineTo(center, 25);
    graphics.lineTo(7, 17);
    graphics.lineTo(5, 7);
    graphics.closePath();
    graphics.strokePath();
    graphics.fillStyle(0xf87171, 0.72);
    graphics.fillTriangle(center, 5, 21, 9, center + 1, 13);
    graphics.fillTriangle(center - 1, 15, 20, 18, center, 23);
    graphics.lineStyle(2, 0xfef2f2, 1);
    graphics.beginPath();
    graphics.moveTo(center + 1, 4);
    graphics.lineTo(center - 3, 11);
    graphics.lineTo(center + 2, 14);
    graphics.lineTo(center - 2, 24);
    graphics.strokePath();
    graphics.generateTexture("status-armor-broken", size, size);
    graphics.destroy();
  }

  private createDroneTexture(key: string, color: number, accent: number) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    const size = 30;
    const center = size / 2;
    graphics.fillStyle(color, 0.18);
    graphics.fillCircle(center, center, 14);
    graphics.fillStyle(color, 0.95);
    graphics.fillTriangle(center, 3, size - 4, center, center, size - 4);
    graphics.fillTriangle(center, 3, center, size - 4, 4, center);
    graphics.lineStyle(3, accent, 0.95);
    graphics.strokeCircle(center, center, 8);
    graphics.fillStyle(accent, 1);
    graphics.fillCircle(center, center, 3);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private createProceduralTowerTextures() {
    for (const towers of Object.values(towerCatalog)) {
      for (const tower of towers) {
        this.createTowerTexture(tower);
        this.createProjectileTexture(tower);
      }
    }
  }

  private createTowerTexture(tower: TowerDefinition) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    const size = 52;
    const center = size / 2;
    const palette = getVisualPalette(tower);

    const isUcube = tower.id === "warrior-6";
    graphics.fillStyle(isUcube ? 0x000000 : 0x020617, isUcube ? 1 : 0.82);
    graphics.fillCircle(center, center, 24);
    graphics.lineStyle(2, isUcube ? 0x38bdf8 : palette.glow, isUcube ? 0.34 : 0.26);
    graphics.strokeCircle(center, center, 24);
    graphics.lineStyle(2, palette.main, 0.92);
    graphics.strokeCircle(center, center, 18);
    graphics.fillStyle(isUcube ? 0x000000 : palette.dark, isUcube ? 1 : 0.95);
    graphics.fillCircle(center, center, 15);

    if (tower.id === "warrior-1") {
      this.drawCrosshair(graphics, center, palette);
    } else if (tower.id === "warrior-2") {
      this.drawServerRack(graphics, center, palette);
    } else if (tower.id === "warrior-3") {
      this.drawIsolationField(graphics, center, palette);
    } else if (tower.id === "warrior-4") {
      this.drawObsessionLens(graphics, center, palette);
    } else if (tower.id === "warrior-5") {
      this.drawDebugPrism(graphics, center, palette);
    } else if (tower.id === "warrior-6") {
      this.drawUnstableCore(graphics, center, palette);
    } else if (tower.id === "archer-1") {
      this.drawMelisFixationEye(graphics, center, palette);
    } else if (tower.id === "archer-2") {
      this.drawMelisFlareHeart(graphics, center, palette);
    } else if (tower.id === "archer-3") {
      this.drawMelisCurseSeal(graphics, center, palette);
    } else if (tower.id === "archer-4") {
      this.drawUnderworldGate(graphics, center, palette);
    } else if (tower.id === "archer-5") {
      this.drawBrokenMirror(graphics, center, palette);
    } else if (tower.id === "archer-6") {
      this.drawWhisperChoir(graphics, center, palette);
    } else {
      this.drawGenericTowerGlyph(graphics, center, tower, palette);
    }

    graphics.generateTexture(`tower-${tower.id}`, size, size);
    graphics.destroy();
  }

  private createProjectileTexture(tower: TowerDefinition) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    const palette = getVisualPalette(tower);
    const size = tower.id === "warrior-2" ? 30 : tower.id === "warrior-6" ? 28 : tower.hitType === "focus" ? 34 : tower.hitType === "impact" || tower.hitType === "contamination" || tower.hitType === "curse" || tower.hitType === "wave" ? 24 : 20;
    const center = size / 2;

    if (tower.id === "warrior-2") {
      this.drawServerBurstProjectile(graphics, center);
      graphics.generateTexture(`projectile-${tower.id}`, size, size);
      graphics.destroy();
      return;
    }

    if (tower.id === "warrior-6") {
      this.drawUcubeSparkProjectile(graphics, center);
      graphics.generateTexture(`projectile-${tower.id}`, size, size);
      graphics.destroy();
      return;
    }

    if (tower.id === "archer-1") {
      this.drawMelisFixationProjectile(graphics, center, palette, size);
      graphics.generateTexture(`projectile-${tower.id}`, size, size);
      graphics.destroy();
      return;
    }

    if (tower.id === "archer-2") {
      this.drawMelisFlareProjectile(graphics, center, palette, size);
      graphics.generateTexture(`projectile-${tower.id}`, size, size);
      graphics.destroy();
      return;
    }

    if (tower.id === "archer-3") {
      this.drawMelisCurseProjectile(graphics, center, palette, size);
      graphics.generateTexture(`projectile-${tower.id}`, size, size);
      graphics.destroy();
      return;
    }

    if (tower.id === "archer-6") {
      this.drawMelisWhisperProjectile(graphics, center, palette, size);
      graphics.generateTexture(`projectile-${tower.id}`, size, size);
      graphics.destroy();
      return;
    }

    if (tower.id === "archer-5") {
      this.drawMelisMirrorProjectile(graphics, center, palette, size);
      graphics.generateTexture(`projectile-${tower.id}`, size, size);
      graphics.destroy();
      return;
    }

    graphics.fillStyle(palette.glow, 0.18);
    graphics.fillCircle(center, center, center - 1);
    graphics.fillStyle(palette.main, 0.96);

    if (tower.hitType === "projectile") {
      graphics.beginPath();
      graphics.moveTo(size - 2, center);
      graphics.lineTo(4, center - 5);
      graphics.lineTo(7, center);
      graphics.lineTo(4, center + 5);
      graphics.closePath();
      graphics.fillPath();
    } else if (tower.hitType === "impact") {
      graphics.fillCircle(center, center, 6);
      graphics.lineStyle(2, palette.accent, 0.9);
      graphics.strokeCircle(center, center, 9);
    } else if (tower.hitType === "focus") {
      graphics.fillRect(3, center - 2, size - 6, 4);
      graphics.lineStyle(1, palette.accent, 0.95);
      graphics.strokeRect(2, center - 4, size - 4, 8);
    } else if (tower.hitType === "aura") {
      graphics.lineStyle(3, palette.main, 0.9);
      graphics.strokeCircle(center, center, 7);
    } else if (tower.hitType === "contamination") {
      graphics.fillStyle(palette.main, 0.62);
      graphics.fillCircle(center - 3, center + 1, 5);
      graphics.fillStyle(palette.accent, 0.86);
      graphics.fillCircle(center + 4, center - 2, 4);
      graphics.fillStyle(palette.glow, 0.72);
      graphics.fillCircle(center + 1, center + 5, 2.5);
      graphics.lineStyle(1.5, palette.dark, 0.72);
      graphics.strokeCircle(center, center, 8);
    } else if (tower.hitType === "curse") {
      graphics.fillStyle(palette.main, 0.2);
      graphics.fillCircle(center, center, 10);
      graphics.lineStyle(2, palette.main, 0.92);
      graphics.strokeCircle(center, center, 8);
      graphics.lineStyle(1.5, palette.accent, 0.86);
      graphics.lineBetween(center - 6, center - 5, center + 6, center + 5);
      graphics.lineBetween(center + 6, center - 5, center - 6, center + 5);
      graphics.fillStyle(palette.glow, 0.9);
      graphics.fillCircle(center, center, 2.5);
    } else if (tower.hitType === "wave") {
      graphics.fillStyle(palette.main, 0.14);
      graphics.fillCircle(center, center, 10);
      graphics.lineStyle(2, palette.main, 0.88);
      graphics.strokeCircle(center, center, 5);
      graphics.strokeCircle(center, center, 10);
      graphics.lineStyle(1.5, palette.accent, 0.72);
      graphics.lineBetween(center - 9, center, center + 9, center);
      graphics.fillStyle(palette.glow, 0.95);
      graphics.fillCircle(center, center, 2.5);
    } else {
      graphics.fillCircle(center, center, 5);
    }

    graphics.generateTexture(`projectile-${tower.id}`, size, size);
    graphics.destroy();
  }

  private drawServerBurstProjectile(graphics: Phaser.GameObjects.Graphics, center: number) {
    graphics.fillStyle(0x22d3ee, 0.18);
    graphics.fillCircle(center, center, 14);
    graphics.fillStyle(0x0f172a, 0.92);
    graphics.fillCircle(center, center, 9);
    graphics.lineStyle(2, 0x67e8f9, 0.96);
    graphics.strokeCircle(center, center, 10);
    graphics.lineStyle(1.5, 0xfacc15, 0.95);
    graphics.strokeRect(center - 5, center - 5, 10, 10);
    graphics.fillStyle(0xfef08a, 1);
    graphics.fillCircle(center, center, 3);
    graphics.lineStyle(1, 0x22c55e, 0.72);
    graphics.lineBetween(center - 11, center, center - 6, center);
    graphics.lineBetween(center + 6, center, center + 11, center);
    graphics.lineBetween(center, center - 11, center, center - 6);
    graphics.lineBetween(center, center + 6, center, center + 11);
  }

  private drawUcubeSparkProjectile(graphics: Phaser.GameObjects.Graphics, center: number) {
    graphics.fillStyle(0x38bdf8, 0.1);
    graphics.fillCircle(center, center, 13);
    graphics.lineStyle(5, 0x38bdf8, 0.2);
    graphics.beginPath();
    graphics.moveTo(center - 11, center + 5);
    graphics.lineTo(center - 4, center - 4);
    graphics.lineTo(center + 1, center + 3);
    graphics.lineTo(center + 11, center - 8);
    graphics.strokePath();
    graphics.lineStyle(2.5, 0xffffff, 1);
    graphics.beginPath();
    graphics.moveTo(center - 11, center + 5);
    graphics.lineTo(center - 4, center - 4);
    graphics.lineTo(center + 1, center + 3);
    graphics.lineTo(center + 11, center - 8);
    graphics.strokePath();
    graphics.lineStyle(1, 0x93c5fd, 0.95);
    graphics.lineBetween(center - 2, center - 8, center + 3, center - 2);
    graphics.lineBetween(center + 4, center + 6, center + 9, center + 1);
  }

  private drawCrosshair(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.lineStyle(3, palette.main, 1);
    graphics.strokeCircle(center, center, 9);
    graphics.lineBetween(center - 14, center, center - 5, center);
    graphics.lineBetween(center + 5, center, center + 14, center);
    graphics.lineBetween(center, center - 14, center, center - 5);
    graphics.lineBetween(center, center + 5, center, center + 14);
    graphics.fillStyle(palette.accent, 1);
    graphics.fillCircle(center, center, 3);
  }

  private drawServerRack(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.fillStyle(palette.main, 0.95);
    graphics.fillRoundedRect(center - 11, center - 13, 22, 26, 4);
    graphics.fillStyle(0x020617, 0.9);
    for (let row = 0; row < 3; row += 1) {
      graphics.fillRoundedRect(center - 7, center - 9 + row * 8, 14, 4, 2);
      graphics.fillStyle(palette.accent, 1);
      graphics.fillCircle(center + 5, center - 7 + row * 8, 1.8);
      graphics.fillStyle(0x020617, 0.9);
    }
  }

  private drawIsolationField(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.lineStyle(3, palette.main, 0.95);
    graphics.strokeCircle(center, center, 12);
    graphics.lineStyle(2, palette.accent, 0.8);
    graphics.beginPath();
    graphics.moveTo(center, center - 14);
    graphics.lineTo(center + 11, center - 3);
    graphics.lineTo(center + 7, center + 13);
    graphics.lineTo(center - 7, center + 13);
    graphics.lineTo(center - 11, center - 3);
    graphics.closePath();
    graphics.strokePath();
  }

  private drawObsessionLens(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.lineStyle(3, palette.main, 1);
    graphics.strokeEllipse(center, center, 28, 17);
    graphics.fillStyle(palette.accent, 1);
    graphics.fillCircle(center, center, 6);
    graphics.lineStyle(2, palette.glow, 0.85);
    graphics.strokeCircle(center, center, 11);
  }

  private drawDebugPrism(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.fillStyle(palette.main, 0.95);
    graphics.beginPath();
    graphics.moveTo(center, center - 15);
    graphics.lineTo(center + 14, center + 9);
    graphics.lineTo(center - 14, center + 9);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(2, palette.accent, 0.95);
    graphics.lineBetween(center - 15, center, center + 15, center);
    graphics.lineBetween(center, center - 15, center, center + 12);
  }

  private drawUnstableCore(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.lineStyle(3, 0x38bdf8, 1);
    graphics.strokeCircle(center, center, 11);
    graphics.lineStyle(2, 0x7dd3fc, 0.95);
    graphics.beginPath();
    graphics.moveTo(center - 13, center + 8);
    graphics.lineTo(center - 4, center - 3);
    graphics.lineTo(center + 1, center + 4);
    graphics.lineTo(center + 12, center - 10);
    graphics.strokePath();
    graphics.fillStyle(0xbfdbfe, 1);
    graphics.fillCircle(center, center, 4);
  }

  private drawMelisFixationEye(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.lineStyle(2.5, palette.main, 0.95);
    graphics.strokeEllipse(center, center, 30, 18);
    graphics.lineStyle(1.4, palette.accent, 0.8);
    graphics.strokeCircle(center, center, 9);
    graphics.fillStyle(0x020617, 0.96);
    graphics.fillCircle(center, center, 6);
    graphics.fillStyle(palette.glow, 1);
    graphics.fillCircle(center, center, 3);
    graphics.lineStyle(1.5, 0xfdf4ff, 0.8);
    graphics.lineBetween(center - 17, center, center - 9, center);
    graphics.lineBetween(center + 9, center, center + 17, center);
    graphics.lineBetween(center, center - 17, center, center - 9);
    graphics.lineBetween(center, center + 9, center, center + 17);
  }

  private drawMelisFlareHeart(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.fillStyle(palette.main, 0.9);
    graphics.fillCircle(center - 6, center - 5, 8);
    graphics.fillCircle(center + 6, center - 5, 8);
    graphics.fillTriangle(center - 14, center - 2, center + 14, center - 2, center, center + 15);
    graphics.lineStyle(2, palette.accent, 0.95);
    graphics.beginPath();
    graphics.moveTo(center - 2, center - 12);
    graphics.lineTo(center + 3, center - 2);
    graphics.lineTo(center - 2, center + 2);
    graphics.lineTo(center + 5, center + 13);
    graphics.strokePath();
    graphics.fillStyle(0x020617, 0.72);
    graphics.fillCircle(center - 6, center - 3, 2.4);
    graphics.fillCircle(center + 6, center - 3, 2.4);
  }

  private drawMelisCurseSeal(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.lineStyle(2.3, palette.main, 0.95);
    graphics.strokeCircle(center, center, 14);
    graphics.lineStyle(1.5, palette.accent, 0.9);
    graphics.strokeCircle(center, center, 8);
    graphics.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
      const x = center + Math.cos(angle) * 14;
      const y = center + Math.sin(angle) * 14;
      if (index === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    }
    graphics.closePath();
    graphics.strokePath();
    graphics.lineStyle(1.5, 0xfdf4ff, 0.7);
    graphics.lineBetween(center - 7, center - 7, center + 7, center + 7);
    graphics.lineBetween(center + 7, center - 7, center - 7, center + 7);
    graphics.fillStyle(palette.glow, 0.95);
    graphics.fillCircle(center, center, 3.2);
  }

  private drawUnderworldGate(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.fillStyle(0x020617, 0.92);
    graphics.fillCircle(center, center, 13);
    graphics.lineStyle(2.6, palette.main, 0.95);
    graphics.strokeCircle(center, center, 13);
    graphics.lineStyle(1.5, palette.accent, 0.86);
    graphics.strokeCircle(center, center, 7.5);
    graphics.fillStyle(palette.glow, 0.85);
    graphics.fillCircle(center, center, 3.8);
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6 + Math.PI / 6;
      const x1 = center + Math.cos(angle) * 5;
      const y1 = center + Math.sin(angle) * 5;
      const x2 = center + Math.cos(angle) * 14;
      const y2 = center + Math.sin(angle) * 14;
      graphics.lineStyle(1.2, index % 2 === 0 ? palette.main : 0x111827, 0.78);
      graphics.lineBetween(x1, y1, x2, y2);
    }
    graphics.lineStyle(1.4, 0xccfbf1, 0.84);
    graphics.beginPath();
    graphics.arc(center, center, 10, Math.PI * 1.12, Math.PI * 1.88);
    graphics.strokePath();
    graphics.lineStyle(1.1, 0x020617, 0.92);
    graphics.lineBetween(center - 8, center + 3, center + 8, center + 3);
  }

  private drawWhisperChoir(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.lineStyle(2.5, palette.main, 0.95);
    graphics.strokeCircle(center, center, 13);
    graphics.lineStyle(1.8, palette.accent, 0.82);
    graphics.strokeCircle(center, center, 7);
    for (let index = 0; index < 5; index += 1) {
      const angle = -Math.PI / 2 + (index - 2) * 0.62;
      const x = center + Math.cos(angle) * 10;
      const y = center + Math.sin(angle) * 9;
      graphics.fillStyle(palette.main, 0.9);
      graphics.fillCircle(x, y, 2.7);
      graphics.lineStyle(1.2, palette.glow, 0.72);
      graphics.lineBetween(center, center, x, y);
    }
    graphics.lineStyle(2, 0xccfbf1, 0.92);
    graphics.beginPath();
    graphics.arc(center, center + 2, 9, Math.PI * 0.1, Math.PI * 0.9);
    graphics.strokePath();
    graphics.lineStyle(1.2, 0x020617, 0.6);
    graphics.lineBetween(center - 9, center - 4, center + 9, center - 4);
  }

  private drawBrokenMirror(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette) {
    graphics.fillStyle(palette.main, 0.16);
    graphics.fillCircle(center, center, 14);
    graphics.lineStyle(2.4, palette.main, 0.98);
    graphics.strokeEllipse(center, center, 25, 30);
    graphics.lineStyle(1.8, palette.accent, 0.9);
    graphics.beginPath();
    graphics.moveTo(center - 10, center - 12);
    graphics.lineTo(center - 1, center - 2);
    graphics.lineTo(center - 8, center + 12);
    graphics.moveTo(center - 1, center - 2);
    graphics.lineTo(center + 10, center - 9);
    graphics.moveTo(center - 1, center - 2);
    graphics.lineTo(center + 9, center + 12);
    graphics.strokePath();
    graphics.fillStyle(0xfdf4ff, 0.9);
    graphics.fillTriangle(center - 8, center - 10, center - 1, center - 2, center - 12, center + 4);
    graphics.fillStyle(palette.glow, 0.72);
    graphics.fillTriangle(center + 2, center - 1, center + 11, center - 8, center + 9, center + 9);
  }

  private drawMelisFixationProjectile(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette, size: number) {
    graphics.fillStyle(palette.glow, 0.16);
    graphics.fillEllipse(center, center, size - 2, size * 0.58);
    graphics.fillStyle(palette.main, 0.98);
    graphics.beginPath();
    graphics.moveTo(size - 2, center);
    graphics.lineTo(5, center - 5);
    graphics.lineTo(8, center);
    graphics.lineTo(5, center + 5);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(1.4, palette.accent, 0.95);
    graphics.strokeCircle(center, center, 4);
    graphics.fillStyle(0xfdf4ff, 0.95);
    graphics.fillCircle(center + 1, center, 1.8);
  }

  private drawMelisFlareProjectile(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette, size: number) {
    graphics.fillStyle(palette.main, 0.24);
    graphics.fillCircle(center, center, center - 1);
    graphics.fillStyle(palette.main, 0.96);
    graphics.fillTriangle(size - 2, center, center - 5, center - 7, center - 2, center + 7);
    graphics.fillStyle(palette.accent, 0.9);
    graphics.fillTriangle(center + 4, center, 4, center - 4, 5, center + 4);
    graphics.lineStyle(1.2, 0xfdf2f8, 0.75);
    graphics.lineBetween(center - 6, center - 7, center + 5, center + 7);
  }

  private drawMelisCurseProjectile(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette, size: number) {
    graphics.fillStyle(palette.main, 0.18);
    graphics.fillCircle(center, center, center - 1);
    graphics.lineStyle(1.8, palette.main, 0.92);
    graphics.strokeCircle(center, center, 8);
    graphics.lineStyle(1.4, palette.accent, 0.9);
    graphics.strokeTriangle(center, 3, size - 4, size - 5, 4, size - 5);
    graphics.fillStyle(0x020617, 0.7);
    graphics.fillCircle(center, center, 4);
    graphics.fillStyle(palette.glow, 0.95);
    graphics.fillCircle(center, center, 2);
  }

  private drawMelisWhisperProjectile(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette, size: number) {
    graphics.fillStyle(0x020617, 0.8);
    graphics.fillCircle(center, center, center - 1);
    graphics.lineStyle(1.8, palette.main, 0.88);
    graphics.strokeCircle(center, center, 9);
    graphics.lineStyle(1.2, palette.accent, 0.78);
    graphics.lineBetween(center, 3, center, size - 3);
    graphics.lineBetween(3, center, size - 3, center);
    graphics.fillStyle(palette.glow, 0.95);
    graphics.fillCircle(center, center, 2.8);
  }

  private drawMelisMirrorProjectile(graphics: Phaser.GameObjects.Graphics, center: number, palette: VisualPalette, size: number) {
    graphics.fillStyle(0xfdf4ff, 0.2);
    graphics.fillCircle(center, center, center - 1);
    graphics.fillStyle(palette.main, 0.92);
    graphics.fillTriangle(size - 3, center - 7, center + 2, center, size - 4, center + 8);
    graphics.fillStyle(0xfdf4ff, 0.9);
    graphics.fillTriangle(center - 8, center - 5, center + 1, center, center - 7, center + 7);
    graphics.lineStyle(1.2, palette.accent, 0.9);
    graphics.lineBetween(center - 8, center - 7, center + 8, center + 7);
  }

  private drawGenericTowerGlyph(graphics: Phaser.GameObjects.Graphics, center: number, tower: TowerDefinition, palette: VisualPalette) {
    graphics.fillStyle(palette.main, 1);
    if (tower.classType === "control") {
      graphics.fillTriangle(center, center - 13, center + 12, center + 10, center - 12, center + 10);
    } else if (tower.classType === "support") {
      graphics.fillRoundedRect(center - 12, center - 12, 24, 24, 6);
    } else {
      graphics.fillCircle(center, center, 10);
    }
    graphics.lineStyle(2, palette.accent, 0.9);
    graphics.strokeCircle(center, center, 14);
  }
}

type VisualPalette = {
  main: number;
  accent: number;
  glow: number;
  dark: number;
};

function getVisualPalette(tower: TowerDefinition): VisualPalette {
  if (tower.characterId === "archer") {
    if (tower.id === "archer-1") {
      return { main: tower.color, accent: 0xf0abfc, glow: 0xc4b5fd, dark: 0x312e81 };
    }
    if (tower.id === "archer-2") {
      return { main: tower.color, accent: 0xfda4af, glow: 0xfb7185, dark: 0x831843 };
    }
    if (tower.id === "archer-3") {
      return { main: tower.color, accent: 0xf0abfc, glow: 0xa855f7, dark: 0x3b0764 };
    }
    if (tower.id === "archer-4") {
      return { main: tower.color, accent: 0x020617, glow: 0x2dd4bf, dark: 0x134e4a };
    }
    if (tower.id === "archer-5") {
      return { main: tower.color, accent: 0xfdf4ff, glow: 0xf0abfc, dark: 0x701a75 };
    }
    if (tower.id === "archer-6") {
      return { main: tower.color, accent: 0x99f6e4, glow: 0x2dd4bf, dark: 0x134e4a };
    }
  }
  if (tower.damageType === "electric") {
    return { main: 0x38bdf8, accent: 0xfef08a, glow: 0x67e8f9, dark: 0x0e7490 };
  }
  if (tower.damageType === "psychic") {
    return { main: 0xc084fc, accent: 0xf0abfc, glow: 0xe879f9, dark: 0x6b21a8 };
  }
  if (tower.damageType === "fire") {
    return { main: 0xfb7185, accent: 0xfbbf24, glow: 0xf97316, dark: 0x9f1239 };
  }
  if (tower.damageType === "cellular") {
    return { main: 0x84cc16, accent: 0x22c55e, glow: 0xbbf7d0, dark: 0x365314 };
  }
  if (tower.damageType === "none" || tower.classType === "control") {
    return { main: 0x94a3b8, accent: 0xa7f3d0, glow: 0x99f6e4, dark: 0x334155 };
  }
  return { main: tower.color, accent: 0xf8fafc, glow: 0x86efac, dark: 0x166534 };
}
