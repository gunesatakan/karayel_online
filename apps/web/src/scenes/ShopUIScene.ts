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
  private shopContainer?: Phaser.GameObjects.Container;
  private towerPanel?: Phaser.GameObjects.Container;
  private goldText?: Phaser.GameObjects.Text;
  private healthText?: Phaser.GameObjects.Text;
  private waveText?: Phaser.GameObjects.Text;
  private towerTitleText?: Phaser.GameObjects.Text;
  private towerDamageText?: Phaser.GameObjects.Text;
  private towerDpsText?: Phaser.GameObjects.Text;
  private selectedTowerId?: string;
  private buttons = new Map<UpgradeId, Phaser.GameObjects.Rectangle>();

  constructor() {
    super("shop-ui");
  }

  create() {
    this.shopContainer = this.add.container(0, 0);
    const background = this.add.rectangle(GAME_WORLD_WIDTH / 2, SHOP_TOP + SHOP_HEIGHT / 2, GAME_WORLD_WIDTH, SHOP_HEIGHT, 0x020617, 0.94)
      .setStrokeStyle(1, 0x334155, 0.75);
    this.shopContainer.add(background);
    this.goldText = this.add.text(18, SHOP_TOP + 14, "Gold: 0", {
      color: "#facc15",
      fontFamily: "Arial",
      fontSize: "16px",
      fontStyle: "bold"
    });
    this.shopContainer.add(this.goldText);
    this.healthText = this.add.text(18, SHOP_TOP + 40, "Can: 100/100", {
      color: "#86efac",
      fontFamily: "Arial",
      fontSize: "13px"
    });
    this.shopContainer.add(this.healthText);
    this.waveText = this.add.text(GAME_WORLD_WIDTH - 18, SHOP_TOP + 16, "Wave 1", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "14px",
      fontStyle: "bold"
    }).setOrigin(1, 0);
    this.shopContainer.add(this.waveText);

    const configs: ButtonConfig[] = [
      { id: "damage", label: "Hasar", x: 18, y: SHOP_TOP + 74, width: 82 },
      { id: "fireRate", label: "Hiz", x: 108, y: SHOP_TOP + 74, width: 74 },
      { id: "projectileSpeed", label: "Mermi", x: 190, y: SHOP_TOP + 74, width: 82 },
      { id: "heal", label: "Can", x: 280, y: SHOP_TOP + 74, width: 72 }
    ];

    for (const config of configs) {
      this.createShopButton(config);
    }

    this.createTowerPanel();
    this.game.events.on("game:snapshot", this.updateSnapshot, this);
    this.game.events.on("tower:selected", this.updateSelectedTower, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("game:snapshot", this.updateSnapshot, this);
      this.game.events.off("tower:selected", this.updateSelectedTower, this);
    });
  }

  private createShopButton(config: ButtonConfig) {
    const button = this.add.rectangle(config.x, config.y, config.width, 48, 0x1e293b, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x475569, 1)
      .setInteractive({ useHandCursor: true });
    const labelText = this.add.text(config.x + config.width / 2, config.y + 14, config.label, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    const costText = this.add.text(config.x + config.width / 2, config.y + 32, `${upgradeCosts[config.id]}g`, {
      color: "#facc15",
      fontFamily: "Arial",
      fontSize: "11px"
    }).setOrigin(0.5);
    this.shopContainer?.add([button, labelText, costText]);

    button.on("pointerdown", () => button.setFillStyle(0x334155));
    button.on("pointerout", () => button.setFillStyle(0x1e293b));
    button.on("pointerup", () => {
      button.setFillStyle(0x1e293b);
      this.game.events.emit("shop:buy", config.id);
    });
    this.buttons.set(config.id, button);
  }

  private createTowerPanel() {
    this.towerPanel = this.add.container(0, 0).setVisible(false);
    const background = this.add.rectangle(GAME_WORLD_WIDTH / 2, SHOP_TOP + SHOP_HEIGHT / 2, GAME_WORLD_WIDTH, SHOP_HEIGHT, 0x07111f, 0.96)
      .setStrokeStyle(1, 0x22d3ee, 0.5);
    this.towerTitleText = this.add.text(18, SHOP_TOP + 14, "Kule", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "16px",
      fontStyle: "bold"
    });
    this.towerDamageText = this.add.text(18, SHOP_TOP + 44, "Toplam hasar: 0", {
      color: "#fca5a5",
      fontFamily: "Arial",
      fontSize: "14px",
      fontStyle: "bold"
    });
    this.towerDpsText = this.add.text(18, SHOP_TOP + 72, "Anlik DPS: 0.0", {
      color: "#facc15",
      fontFamily: "Arial",
      fontSize: "14px",
      fontStyle: "bold"
    });
    const hint = this.add.text(GAME_WORLD_WIDTH - 18, SHOP_TOP + 18, "Haritaya dokun: dukkan", {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "11px"
    }).setOrigin(1, 0);
    this.towerPanel.add([background, this.towerTitleText, this.towerDamageText, this.towerDpsText, hint]);
  }

  private updateSelectedTower(towerId?: string) {
    this.selectedTowerId = towerId;
    if (!towerId) {
      this.shopContainer?.setVisible(true);
      this.towerPanel?.setVisible(false);
    }
  }

  private updateSnapshot(snapshot: GameSnapshot) {
    const selectedTower = this.selectedTowerId ? snapshot.towers.find((tower) => tower.id === this.selectedTowerId) : undefined;
    this.shopContainer?.setVisible(!selectedTower);
    this.towerPanel?.setVisible(Boolean(selectedTower));
    if (selectedTower) {
      this.towerTitleText?.setText(`${selectedTower.name} Lv.${selectedTower.level}`);
      this.towerDamageText?.setText(`Toplam hasar: ${Math.round(selectedTower.damageDealt ?? 0)}`);
      this.towerDpsText?.setText(`Anlik DPS: ${(selectedTower.currentDps ?? 0).toFixed(1)}`);
      return;
    }

    this.goldText?.setText(`Gold: ${snapshot.team.gold}`);
    this.healthText?.setText(`Can: ${Math.round(snapshot.team.health)}/${snapshot.team.maxHealth}`);
    this.waveText?.setText(`Wave ${snapshot.team.wave}`);

    for (const [id, button] of this.buttons) {
      button.setAlpha(snapshot.team.gold >= upgradeCosts[id] ? 1 : 0.48);
    }
  }
}
