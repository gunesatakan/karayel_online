import Phaser from "phaser";
import { characters, GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH, type CharacterId } from "@karayel/shared";

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super("character-select");
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f172a");
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x111827);
    this.add.text(24, 24, "Sinif Sec", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "30px",
      fontStyle: "bold"
    });

    characters.forEach((character, index) => {
      const y = 92 + index * 108;
      const card = this.add.rectangle(22, y, GAME_WORLD_WIDTH - 44, 92, 0x1e293b, 1)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      this.add.circle(54, y + 46, 18, this.getClassColor(character.id));
      this.add.text(84, y + 16, `${character.displayName} - ${character.role}`, {
        color: "#f8fafc",
        fontFamily: "Arial",
        fontSize: "17px",
        fontStyle: "bold"
      });
      this.add.text(84, y + 44, character.summary, {
        color: "#cbd5e1",
        fontFamily: "Arial",
        fontSize: "12px",
        wordWrap: { width: 260 }
      });

      card.on("pointerdown", () => card.setFillStyle(0x334155));
      card.on("pointerout", () => card.setFillStyle(0x1e293b));
      card.on("pointerup", () => {
        this.scene.start("game", { characterId: character.id });
      });
    });
  }

  private getClassColor(characterId: CharacterId) {
    return {
      warrior: 0x22c55e,
      archer: 0x38bdf8,
      mage: 0xa78bfa,
      healer: 0xf9a8d4,
      tank: 0xfacc15
    }[characterId];
  }
}
