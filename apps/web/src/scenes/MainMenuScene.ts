import Phaser from "phaser";
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from "@karayel/shared";
import { getPlayerName } from "../config";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("main-menu");
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f172a");
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x111827);
    this.add.circle(72, 84, 34, 0x22c55e, 0.95);
    this.add.circle(318, 190, 52, 0x38bdf8, 0.2);
    this.add.circle(54, 640, 78, 0x22c55e, 0.08);

    this.add.text(28, 132, "Karayel", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "46px",
      fontStyle: "bold"
    });
    this.add.text(30, 184, "Online", {
      color: "#38bdf8",
      fontFamily: "Arial",
      fontSize: "42px",
      fontStyle: "bold"
    });
    this.add.text(30, 268, "Oyuncu", {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "14px"
    });
    this.add.text(30, 292, getPlayerName(), {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "22px",
      fontStyle: "bold"
    });

    this.createButton(30, 560, "Karakter Sec", () => {
      this.scene.start("character-select");
    });
  }

  private createButton(x: number, y: number, label: string, onClick: () => void) {
    const button = this.add.rectangle(x, y, GAME_WORLD_WIDTH - 60, 58, 0x22c55e, 1)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.add.text(x + (GAME_WORLD_WIDTH - 60) / 2, y + 29, label, {
      color: "#052e16",
      fontFamily: "Arial",
      fontSize: "20px",
      fontStyle: "bold"
    }).setOrigin(0.5);

    button.on("pointerdown", () => button.setFillStyle(0x16a34a));
    button.on("pointerout", () => button.setFillStyle(0x22c55e));
    button.on("pointerup", () => {
      button.setFillStyle(0x22c55e);
      onClick();
    });
  }
}
