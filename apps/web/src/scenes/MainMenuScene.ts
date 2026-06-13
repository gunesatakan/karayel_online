import Phaser from "phaser";
import { characters, GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from "@karayel/shared";
import { getPlayerName } from "../config";
import { configureHiDpiCamera } from "../rendering";

const palette = {
  void: 0x05060a,
  abyss: 0x0a1020,
  slate: 0x151a2e,
  amethyst: 0x2a164a,
  violet: 0x7c3aed,
  cyan: 0x22d3ee,
  soul: 0x34d399,
  gold: 0xfacc15,
  crimson: 0xdc2626,
  bone: 0xe7e5df
};

const titleFont = "Cinzel, Georgia, serif";
const uiFont = "Rajdhani, Exo 2, Arial, sans-serif";
const numberFont = "Orbitron, Share Tech Mono, monospace";

export class MainMenuScene extends Phaser.Scene {
  private sigil?: Phaser.GameObjects.Graphics;
  private shimmer?: Phaser.GameObjects.Graphics;

  constructor() {
    super("main-menu");
  }

  create() {
    configureHiDpiCamera(this);
    this.cameras.main.setBackgroundColor("#05060a");
    this.drawBackground();
    this.drawHero();
    this.drawPlayerPanel();
    this.drawOperatorConstellation();
    this.createPrimaryButton();
  }

  private drawBackground() {
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, palette.void, 1);
    this.add.rectangle(GAME_WORLD_WIDTH / 2, 126, GAME_WORLD_WIDTH, 252, palette.abyss, 0.82);
    this.add.rectangle(GAME_WORLD_WIDTH / 2, 540, GAME_WORLD_WIDTH, 520, palette.slate, 0.36);
    this.add.rectangle(GAME_WORLD_WIDTH / 2, 736, GAME_WORLD_WIDTH, 216, palette.amethyst, 0.22);

    const grid = this.add.graphics().setDepth(1);
    for (let y = 96; y < GAME_WORLD_HEIGHT; y += 32) {
      grid.lineStyle(1, y % 96 === 0 ? palette.cyan : palette.violet, y % 96 === 0 ? 0.11 : 0.055);
      grid.lineBetween(18, y, GAME_WORLD_WIDTH - 18, y + 9);
    }
    for (let x = -120; x < GAME_WORLD_WIDTH + 80; x += 42) {
      grid.lineStyle(1, palette.gold, 0.045);
      grid.lineBetween(x, 92, x + 212, GAME_WORLD_HEIGHT - 48);
    }

    this.drawRitualMist(92, 330, palette.violet, 0.1);
    this.drawRitualMist(296, 278, palette.cyan, 0.08);
    this.drawRitualMist(218, 668, palette.crimson, 0.07);

    this.sigil = this.add.graphics().setDepth(2);
    this.drawSigil(this.sigil, GAME_WORLD_WIDTH / 2, 294, 122, palette.violet, palette.cyan, palette.gold);
    this.tweens.add({
      targets: this.sigil,
      angle: 360,
      duration: 28000,
      repeat: -1,
      ease: "Linear"
    });

    this.shimmer = this.add.graphics().setDepth(3);
    this.drawScanLines(this.shimmer, 0.12);
    this.tweens.add({
      targets: this.shimmer,
      y: 18,
      alpha: { from: 0.45, to: 0.9 },
      duration: 2100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
  }

  private drawHero() {
    this.add.text(28, 50, "KARAYEL", {
      color: "#e7e5df",
      fontFamily: titleFont,
      fontSize: "50px",
      fontStyle: "bold",
      letterSpacing: 0
    }).setDepth(5);
    this.add.text(32, 104, "ONLINE", {
      color: "#22d3ee",
      fontFamily: numberFont,
      fontSize: "24px",
      fontStyle: "bold"
    }).setDepth(5);
    this.add.text(32, 138, "QUANTUM MYSTIC TOWER DEFENCE", {
      color: "#facc15",
      fontFamily: uiFont,
      fontSize: "12px",
      fontStyle: "bold"
    }).setDepth(5);
    this.add.text(32, 174, "Karanlik rituel haritasinda kuantum enerjisiyle calisan kisisel kuleler.", {
      color: "#cbd5e1",
      fontFamily: uiFont,
      fontSize: "14px",
      lineSpacing: 3,
      wordWrap: { width: 292 }
    }).setDepth(5);

    const slash = this.add.graphics().setDepth(5);
    slash.lineStyle(2, palette.cyan, 0.75);
    slash.lineBetween(32, 224, 152, 224);
    slash.lineStyle(2, palette.gold, 0.85);
    slash.lineBetween(164, 224, 232, 224);
    slash.lineStyle(2, palette.violet, 0.75);
    slash.lineBetween(244, 224, 352, 224);
  }

  private drawPlayerPanel() {
    const x = 26;
    const y = 492;
    const width = GAME_WORLD_WIDTH - 52;
    const height = 118;
    this.drawCutPanel(x, y, width, height, palette.abyss, 0.9, palette.cyan, 0.55, 12);
    this.add.text(x + 18, y + 16, "SHARD BAGLANTISI", {
      color: "#94a3b8",
      fontFamily: uiFont,
      fontSize: "10px",
      fontStyle: "bold"
    }).setDepth(8);
    this.add.text(x + 18, y + 38, getPlayerName(), {
      color: "#f8fafc",
      fontFamily: titleFont,
      fontSize: "24px",
      fontStyle: "bold"
    }).setDepth(8);
    this.add.text(x + 18, y + 74, "Frankfurt shard  |  zaman perdesi aktif  |  co-op rituel hazir", {
      color: "#7dd3fc",
      fontFamily: uiFont,
      fontSize: "11px",
      wordWrap: { width: width - 82 }
    }).setDepth(8);

    const seal = this.add.graphics().setDepth(8);
    this.drawSigil(seal, x + width - 45, y + 58, 25, palette.gold, palette.cyan, palette.violet);
  }

  private drawOperatorConstellation() {
    const y = 366;
    this.add.text(30, 334, "YEDI OPERATOR / TEK SAVUNMA CEMBERI", {
      color: "#e2e8f0",
      fontFamily: uiFont,
      fontSize: "12px",
      fontStyle: "bold"
    }).setDepth(6);

    characters.slice(0, 7).forEach((character, index) => {
      const x = 34 + index * 53;
      const offsetY = index % 2 === 0 ? 0 : 22;
      const color = this.getClassColor(character.id);
      const node = this.add.graphics().setDepth(6);
      node.lineStyle(1, color, 0.24);
      if (index > 0) {
        node.lineBetween(x - 53, y + (index % 2 === 0 ? 22 : 0), x, y + offsetY);
      }
      this.drawDiamond(node, x, y + offsetY, 18, color, 0.22, color, 0.9);
      this.add.text(x, y + offsetY - 6, character.displayName.slice(0, 2).toUpperCase(), {
        color: "#f8fafc",
        fontFamily: numberFont,
        fontSize: "10px",
        fontStyle: "bold"
      }).setOrigin(0.5).setDepth(7);
      this.add.text(x, y + offsetY + 26, character.displayName.split(" ")[0], {
        color: "#94a3b8",
        fontFamily: uiFont,
        fontSize: "8px",
        fontStyle: "bold"
      }).setOrigin(0.5).setDepth(7);
    });
  }

  private createPrimaryButton() {
    const x = 30;
    const y = 646;
    const width = GAME_WORLD_WIDTH - 60;
    const height = 58;
    const button = this.drawCutPanel(x, y, width, height, palette.amethyst, 0.96, palette.gold, 0.92, 14)
      .setInteractive(new Phaser.Geom.Rectangle(x, y, width, height), Phaser.Geom.Rectangle.Contains);
    const glow = this.add.rectangle(x + width / 2, y + height / 2, width - 16, height - 12, palette.cyan, 0.08)
      .setDepth(7);
    const label = this.add.text(x + width / 2, y + 22, "OPERATOR ARSIVINI AC", {
      color: "#fff7ed",
      fontFamily: uiFont,
      fontSize: "17px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(8);
    this.add.text(x + width / 2, y + 41, "karakter, kule ve rituel protokolleri", {
      color: "#bae6fd",
      fontFamily: uiFont,
      fontSize: "10px"
    }).setOrigin(0.5).setDepth(8);

    button.on("pointerover", () => {
      glow.setFillStyle(palette.gold, 0.16);
      label.setColor("#ffffff");
    });
    button.on("pointerout", () => {
      glow.setFillStyle(palette.cyan, 0.08);
      label.setColor("#fff7ed");
    });
    button.on("pointerdown", () => button.setScale(0.995));
    button.on("pointerup", () => {
      button.setScale(1);
      this.scene.start("character-select");
    });
  }

  private drawCutPanel(x: number, y: number, width: number, height: number, fill: number, alpha: number, stroke: number, strokeAlpha: number, cut: number) {
    const graphics = this.add.graphics().setDepth(6);
    const points = [
      new Phaser.Geom.Point(x + cut, y),
      new Phaser.Geom.Point(x + width, y),
      new Phaser.Geom.Point(x + width, y + height - cut),
      new Phaser.Geom.Point(x + width - cut, y + height),
      new Phaser.Geom.Point(x, y + height),
      new Phaser.Geom.Point(x, y + cut)
    ];
    graphics.fillStyle(fill, alpha);
    graphics.fillPoints(points, true);
    graphics.lineStyle(1, stroke, strokeAlpha);
    graphics.strokePoints(points, true);
    graphics.lineStyle(1, palette.bone, 0.12);
    graphics.lineBetween(x + 14, y + height - 8, x + width - 28, y + height - 8);
    return graphics;
  }

  private drawRitualMist(x: number, y: number, color: number, alpha: number) {
    const mist = this.add.graphics().setDepth(1);
    mist.fillStyle(color, alpha);
    mist.fillEllipse(x, y, 170, 92);
    mist.fillStyle(color, alpha * 0.72);
    mist.fillEllipse(x + 28, y + 18, 108, 58);
  }

  private drawScanLines(graphics: Phaser.GameObjects.Graphics, alpha: number) {
    for (let y = 252; y < 760; y += 58) {
      graphics.lineStyle(1, palette.cyan, alpha);
      graphics.lineBetween(42, y, GAME_WORLD_WIDTH - 42, y - 18);
    }
  }

  private drawSigil(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, primary: number, secondary: number, accent: number) {
    graphics.lineStyle(1, primary, 0.28);
    graphics.strokeCircle(x, y, radius);
    graphics.strokeCircle(x, y, radius * 0.62);
    graphics.strokeCircle(x, y, radius * 0.34);
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12;
      const inner = radius * (index % 2 === 0 ? 0.34 : 0.62);
      const outer = radius * 0.94;
      graphics.lineStyle(1, index % 3 === 0 ? accent : secondary, index % 3 === 0 ? 0.28 : 0.16);
      graphics.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    }
  }

  private drawDiamond(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, fill: number, fillAlpha: number, stroke: number, strokeAlpha: number) {
    const points = [
      new Phaser.Geom.Point(x, y - radius),
      new Phaser.Geom.Point(x + radius, y),
      new Phaser.Geom.Point(x, y + radius),
      new Phaser.Geom.Point(x - radius, y)
    ];
    graphics.fillStyle(fill, fillAlpha);
    graphics.fillPoints(points, true);
    graphics.lineStyle(1, stroke, strokeAlpha);
    graphics.strokePoints(points, true);
  }

  private getClassColor(characterId: string) {
    return {
      zeynep: 0xec4899,
      warrior: 0x22c55e,
      archer: 0x38bdf8,
      mage: 0xa78bfa,
      healer: 0xf9a8d4,
      tank: 0xfacc15,
      onur: 0x14b8a6
    }[characterId] ?? palette.cyan;
  }
}
