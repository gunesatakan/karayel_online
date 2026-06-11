import Phaser from "phaser";
import { GAME_WORLD_WIDTH, SHOP_HEIGHT, SHOP_TOP, upgradeCosts, type GameSnapshot, type UpgradeId } from "@karayel/shared";

type ButtonConfig = {
  id: UpgradeId;
  label: string;
  x: number;
  y: number;
  width: number;
};

export class ShopUIScene extends Phaser.Scene {
  private goldText?: Phaser.GameObjects.Text;
  private healthText?: Phaser.GameObjects.Text;
  private waveText?: Phaser.GameObjects.Text;
  private buttons = new Map<UpgradeId, Phaser.GameObjects.Rectangle>();

  constructor() {
    super("shop-ui");
  }

  create() {
    this.add.rectangle(GAME_WORLD_WIDTH / 2, SHOP_TOP + SHOP_HEIGHT / 2, GAME_WORLD_WIDTH, SHOP_HEIGHT, 0x020617, 0.94)
      .setStrokeStyle(1, 0x334155, 0.75);
    this.goldText = this.add.text(18, SHOP_TOP + 14, "Gold: 0", {
      color: "#facc15",
      fontFamily: "Arial",
      fontSize: "16px",
      fontStyle: "bold"
    });
    this.healthText = this.add.text(18, SHOP_TOP + 40, "Can: 100/100", {
      color: "#86efac",
      fontFamily: "Arial",
      fontSize: "13px"
    });
    this.waveText = this.add.text(GAME_WORLD_WIDTH - 18, SHOP_TOP + 16, "Wave 1", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "14px",
      fontStyle: "bold"
    }).setOrigin(1, 0);

    const configs: ButtonConfig[] = [
      { id: "damage", label: "Hasar", x: 18, y: SHOP_TOP + 74, width: 82 },
      { id: "fireRate", label: "Hiz", x: 108, y: SHOP_TOP + 74, width: 74 },
      { id: "projectileSpeed", label: "Mermi", x: 190, y: SHOP_TOP + 74, width: 82 },
      { id: "heal", label: "Can", x: 280, y: SHOP_TOP + 74, width: 72 }
    ];

    for (const config of configs) {
      this.createShopButton(config);
    }

    this.game.events.on("game:snapshot", this.updateSnapshot, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("game:snapshot", this.updateSnapshot, this);
    });
  }

  private createShopButton(config: ButtonConfig) {
    const button = this.add.rectangle(config.x, config.y, config.width, 48, 0x1e293b, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x475569, 1)
      .setInteractive({ useHandCursor: true });
    this.add.text(config.x + config.width / 2, config.y + 14, config.label, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    this.add.text(config.x + config.width / 2, config.y + 32, `${upgradeCosts[config.id]}g`, {
      color: "#facc15",
      fontFamily: "Arial",
      fontSize: "11px"
    }).setOrigin(0.5);

    button.on("pointerdown", () => button.setFillStyle(0x334155));
    button.on("pointerout", () => button.setFillStyle(0x1e293b));
    button.on("pointerup", () => {
      button.setFillStyle(0x1e293b);
      this.game.events.emit("shop:buy", config.id);
    });
    this.buttons.set(config.id, button);
  }

  private updateSnapshot(snapshot: GameSnapshot) {
    this.goldText?.setText(`Gold: ${snapshot.team.gold}`);
    this.healthText?.setText(`Can: ${Math.round(snapshot.team.health)}/${snapshot.team.maxHealth}`);
    this.waveText?.setText(`Wave ${snapshot.team.wave}`);

    for (const [id, button] of this.buttons) {
      button.setAlpha(snapshot.team.gold >= upgradeCosts[id] ? 1 : 0.48);
    }
  }
}
