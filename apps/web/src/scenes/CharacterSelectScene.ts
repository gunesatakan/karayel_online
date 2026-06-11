import Phaser from "phaser";
import { characters, GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH, type CharacterDefinition, type CharacterId } from "@karayel/shared";

export class CharacterSelectScene extends Phaser.Scene {
  private selectedCharacter: CharacterDefinition = characters[0];
  private detailObjects: Phaser.GameObjects.GameObject[] = [];
  private cardObjects = new Map<CharacterId, Phaser.GameObjects.Rectangle>();

  constructor() {
    super("character-select");
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f172a");
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x111827);
    this.add.text(24, 22, "Karakter Sec", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "28px",
      fontStyle: "bold"
    });

    characters.forEach((character, index) => {
      this.createCharacterCard(character, 20, 64 + index * 46);
    });

    this.renderDetail();
  }

  private createCharacterCard(character: CharacterDefinition, x: number, y: number) {
    const card = this.add.rectangle(x, y, GAME_WORLD_WIDTH - 40, 40, 0x1e293b, 1)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.cardObjects.set(character.id, card);
    this.add.circle(x + 24, y + 20, 13, this.getClassColor(character.id));
    this.add.text(x + 48, y + 6, character.displayName, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "16px",
      fontStyle: "bold"
    });
    this.add.text(x + 48, y + 25, character.role, {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "11px"
    });

    card.on("pointerup", () => {
      this.selectedCharacter = character;
      this.renderDetail();
    });
  }

  private renderDetail() {
    for (const object of this.detailObjects) {
      object.destroy();
    }
    this.detailObjects = [];

    for (const [id, card] of this.cardObjects) {
      card.setFillStyle(id === this.selectedCharacter.id ? 0x334155 : 0x1e293b);
    }

    const y = 398;
    this.detailObjects.push(this.add.rectangle(20, y, GAME_WORLD_WIDTH - 40, 374, 0x020617, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x334155, 1));
    this.detailObjects.push(this.add.circle(52, y + 44, 20, this.getClassColor(this.selectedCharacter.id)));
    this.detailObjects.push(this.add.text(84, y + 24, `${this.selectedCharacter.displayName} - ${this.selectedCharacter.role}`, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "18px",
      fontStyle: "bold"
    }));
    this.detailObjects.push(this.add.text(28, y + 78, this.selectedCharacter.summary, {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "13px",
      wordWrap: { width: 330 }
    }));
    this.detailObjects.push(this.add.text(28, y + 112, `Pasif: ${this.selectedCharacter.passive}`, {
      color: "#86efac",
      fontFamily: "Arial",
      fontSize: "12px",
      wordWrap: { width: 330 }
    }));
    this.detailObjects.push(this.add.text(28, y + 148, `Ulti: ${this.selectedCharacter.ultimate}`, {
      color: "#c4b5fd",
      fontFamily: "Arial",
      fontSize: "12px",
      wordWrap: { width: 330 }
    }));

    this.selectedCharacter.towers.forEach((tower, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      this.detailObjects.push(this.add.text(32 + col * 166, y + 202 + row * 24, `${index + 1}. ${tower.name}`, {
        color: "#e2e8f0",
        fontFamily: "Arial",
        fontSize: "11px"
      }));
    });

    this.detailObjects.push(this.add.text(28, y + 286, `HP ${this.selectedCharacter.maxHp}  DMG ${this.selectedCharacter.damage}  ATK ${this.selectedCharacter.fireIntervalMs}ms`, {
      color: "#facc15",
      fontFamily: "Arial",
      fontSize: "12px"
    }));

    const button = this.add.rectangle(40, y + 316, GAME_WORLD_WIDTH - 80, 42, 0x22c55e, 1)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(GAME_WORLD_WIDTH / 2, y + 337, "Bu Karakterle Basla", {
      color: "#052e16",
      fontFamily: "Arial",
      fontSize: "15px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    button.on("pointerup", () => {
      this.scene.start("game", { characterId: this.selectedCharacter.id });
    });
    this.detailObjects.push(button, label);
  }

  private getClassColor(characterId: CharacterId) {
    return {
      zeynep: 0xec4899,
      warrior: 0x22c55e,
      archer: 0x38bdf8,
      mage: 0xa78bfa,
      healer: 0xf9a8d4,
      tank: 0xfacc15,
      onur: 0x14b8a6
    }[characterId];
  }
}
