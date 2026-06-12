import Phaser from "phaser";
import { characters, GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from "@karayel/shared";
import { getPlayerName } from "../config";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("main-menu");
  }

  create() {
    this.cameras.main.setBackgroundColor("#050711");
    this.drawQuantumBackdrop();
    this.drawTitleBlock();
    this.drawPlayerSeal();
    this.drawCharacterSignal();
    this.createButton(34, 654, GAME_WORLD_WIDTH - 68, 54, "KARAKTER ARSIVI", 0x7dd3fc, () => {
      this.scene.start("character-select");
    });
  }

  private drawQuantumBackdrop() {
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x050711, 1);
    this.add.rectangle(GAME_WORLD_WIDTH / 2, 108, GAME_WORLD_WIDTH, 216, 0x0f172a, 0.72);
    this.add.rectangle(GAME_WORLD_WIDTH / 2, 548, GAME_WORLD_WIDTH, 452, 0x111827, 0.42);

    const graphics = this.add.graphics().setDepth(1);
    for (let y = 82; y < GAME_WORLD_HEIGHT; y += 44) {
      const alpha = y % 88 === 0 ? 0.18 : 0.08;
      graphics.lineStyle(1, 0x38bdf8, alpha);
      graphics.lineBetween(22, y, GAME_WORLD_WIDTH - 22, y + 18);
    }

    for (let x = -60; x < GAME_WORLD_WIDTH + 40; x += 58) {
      graphics.lineStyle(1, 0xa78bfa, 0.08);
      graphics.lineBetween(x, 72, x + 164, GAME_WORLD_HEIGHT - 92);
    }

    this.drawSigil(GAME_WORLD_WIDTH / 2, 252, 116, 0x7dd3fc, 0.24);
    this.drawSigil(GAME_WORLD_WIDTH / 2, 252, 82, 0xe879f9, 0.28);
    this.drawSigil(GAME_WORLD_WIDTH / 2, 252, 48, 0xfde68a, 0.3);

    this.tweens.add({
      targets: graphics,
      alpha: 0.62,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
  }

  private drawTitleBlock() {
    this.add.text(28, 58, "KARAYEL", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "48px",
      fontStyle: "bold"
    }).setDepth(3);
    this.add.text(31, 106, "ONLINE", {
      color: "#7dd3fc",
      fontFamily: "Arial",
      fontSize: "32px",
      fontStyle: "bold"
    }).setDepth(3);
    this.add.text(32, 148, "Quantum savunma protokolu", {
      color: "#c4b5fd",
      fontFamily: "Arial",
      fontSize: "13px",
      fontStyle: "bold"
    }).setDepth(3);

    this.add.text(32, 184, "Mistisizm, kule savunmasi ve dost kaosu ayni frekansta.", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "13px",
      wordWrap: { width: 270 }
    }).setDepth(3);
  }

  private drawPlayerSeal() {
    const x = 34;
    const y = 500;
    const width = GAME_WORLD_WIDTH - 68;
    const height = 92;
    this.add.rectangle(x, y, width, height, 0x0b1020, 0.82)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x334155, 0.95)
      .setDepth(3);
    this.add.text(x + 18, y + 16, "BAGLANTI KIMLIGI", {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold"
    }).setDepth(4);
    this.add.text(x + 18, y + 36, getPlayerName(), {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "23px",
      fontStyle: "bold"
    }).setDepth(4);
    this.add.text(x + 18, y + 66, "Frankfurt shard | zaman perdesi aktif", {
      color: "#7dd3fc",
      fontFamily: "Arial",
      fontSize: "11px"
    }).setDepth(4);
    this.drawHex(x + width - 42, y + 46, 22, 0xfde68a, 0.18, 0xfde68a, 0.72);
  }

  private drawCharacterSignal() {
    const startX = 38;
    const y = 382;
    characters.slice(0, 7).forEach((character, index) => {
      const x = startX + index * 52;
      this.drawHex(x, y + (index % 2) * 20, 18, this.getClassColor(character.id), 0.24, this.getClassColor(character.id), 0.86);
      this.add.text(x, y + 30 + (index % 2) * 20, character.displayName.slice(0, 2).toUpperCase(), {
        color: "#e0f2fe",
        fontFamily: "Arial",
        fontSize: "10px",
        fontStyle: "bold"
      }).setOrigin(0.5).setDepth(4);
    });
    this.add.text(32, 438, "Yedi operator, tek savunma cemberi.", {
      color: "#e2e8f0",
      fontFamily: "Arial",
      fontSize: "13px"
    }).setDepth(4);
  }

  private createButton(x: number, y: number, width: number, height: number, label: string, color: number, onClick: () => void) {
    const button = this.add.rectangle(x, y, width, height, 0x082f49, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, color, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(6);
    const labelObject = this.add.text(x + width / 2, y + height / 2, label, {
      color: "#ecfeff",
      fontFamily: "Arial",
      fontSize: "16px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(7);

    button.on("pointerover", () => {
      button.setFillStyle(0x0e7490, 1);
      labelObject.setColor("#ffffff");
    });
    button.on("pointerout", () => {
      button.setFillStyle(0x082f49, 0.96);
      labelObject.setColor("#ecfeff");
    });
    button.on("pointerdown", () => button.setScale(0.99));
    button.on("pointerup", () => {
      button.setScale(1);
      onClick();
    });
  }

  private drawSigil(x: number, y: number, radius: number, color: number, alpha: number) {
    const graphics = this.add.graphics().setDepth(2);
    graphics.lineStyle(1, color, alpha);
    graphics.strokeCircle(x, y, radius);
    graphics.strokeCircle(x, y, radius * 0.62);
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      graphics.lineBetween(x, y, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
  }

  private drawHex(x: number, y: number, radius: number, fill: number, fillAlpha: number, stroke: number, strokeAlpha: number) {
    const graphics = this.add.graphics().setDepth(4);
    const hex = [
      new Phaser.Geom.Point(x + radius, y),
      new Phaser.Geom.Point(x + radius / 2, y + radius * 0.86),
      new Phaser.Geom.Point(x - radius / 2, y + radius * 0.86),
      new Phaser.Geom.Point(x - radius, y),
      new Phaser.Geom.Point(x - radius / 2, y - radius * 0.86),
      new Phaser.Geom.Point(x + radius / 2, y - radius * 0.86)
    ];
    graphics.fillStyle(fill, fillAlpha);
    graphics.fillPoints(hex, true);
    graphics.lineStyle(1, stroke, strokeAlpha);
    graphics.strokePoints(hex, true);
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
    }[characterId] ?? 0x7dd3fc;
  }
}
