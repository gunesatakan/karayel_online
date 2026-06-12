import Phaser from "phaser";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  getTowerUpgradeCost,
  type CharacterDefinition,
  type CharacterId,
  type SkillDefinition,
  type TowerDefinition
} from "@karayel/shared";

type DetailItem = {
  title: string;
  subtitle: string;
  description: string;
  color: number;
};

export class CharacterSelectScene extends Phaser.Scene {
  private selectedCharacter: CharacterDefinition = characters[0];
  private viewObjects: Phaser.GameObjects.GameObject[] = [];
  private detailText?: Phaser.GameObjects.Text;
  private detailTitle?: Phaser.GameObjects.Text;

  constructor() {
    super("character-select");
  }

  create() {
    this.cameras.main.setBackgroundColor("#050711");
    this.renderArchive();
  }

  private renderArchive() {
    this.clearView();
    this.drawBackdrop("OPERATOR SECIMI", "Mistisizm frekansini savunma mimarisine bagla.");
    this.createBackButton(22, 24, "ANA", () => this.scene.start("main-menu"));

    characters.forEach((character, index) => {
      const y = 118 + index * 76;
      this.createCharacterArchiveCard(character, 22, y, index);
    });
  }

  private createCharacterArchiveCard(character: CharacterDefinition, x: number, y: number, index: number) {
    const color = this.getClassColor(character.id);
    const panel = this.add.rectangle(x, y, GAME_WORLD_WIDTH - 44, 62, 0x0b1020, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, color, index === 0 ? 0.95 : 0.45)
      .setInteractive({ useHandCursor: true });
    const chevron = this.add.text(GAME_WORLD_WIDTH - 48, y + 31, ">", {
      color: "#e0f2fe",
      fontFamily: "Arial",
      fontSize: "18px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    this.drawHex(x + 32, y + 31, 20, color, 0.22, color, 0.92);
    this.viewObjects.push(panel, chevron);

    this.viewObjects.push(this.add.text(x + 66, y + 10, character.displayName, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "19px",
      fontStyle: "bold"
    }));
    this.viewObjects.push(this.add.text(x + 66, y + 35, character.role, {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "11px"
    }));
    this.viewObjects.push(this.add.text(x + 220, y + 36, `DMG ${character.damage}  SPD ${character.speed}`, {
      color: "#7dd3fc",
      fontFamily: "Arial",
      fontSize: "10px"
    }));

    panel.on("pointerover", () => {
      panel.setFillStyle(0x111827, 0.98);
      panel.setStrokeStyle(1, color, 1);
      chevron.setColor("#fde68a");
    });
    panel.on("pointerout", () => {
      panel.setFillStyle(0x0b1020, 0.92);
      panel.setStrokeStyle(1, color, index === 0 ? 0.95 : 0.45);
      chevron.setColor("#e0f2fe");
    });
    panel.on("pointerup", () => {
      this.selectedCharacter = character;
      this.renderCharacterDetail(character);
    });
  }

  private renderCharacterDetail(character: CharacterDefinition) {
    this.clearView();
    const color = this.getClassColor(character.id);
    this.drawBackdrop(character.displayName.toUpperCase(), character.role);
    this.createBackButton(22, 24, "GERI", () => this.renderArchive());

    this.drawHex(GAME_WORLD_WIDTH / 2, 126, 46, color, 0.22, color, 1);
    this.drawHex(GAME_WORLD_WIDTH / 2, 126, 28, 0xf8fafc, 0.04, 0xfde68a, 0.72);
    this.viewObjects.push(this.add.text(GAME_WORLD_WIDTH / 2, 116, character.displayName.slice(0, 2).toUpperCase(), {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "22px",
      fontStyle: "bold"
    }).setOrigin(0.5));
    this.viewObjects.push(this.add.text(28, 178, character.summary, {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "12px",
      lineSpacing: 2,
      wordWrap: { width: GAME_WORLD_WIDTH - 56 }
    }));

    this.createStatStrip(character, 214);
    this.createDetailItemGrid(character);
    this.createDetailPanel(character);

    this.createButton(34, 794, GAME_WORLD_WIDTH - 68, 38, "BU OPERATORLE BASLA", color, () => {
      this.scene.start("game", { characterId: character.id });
    });

    this.setDetail({
      title: "Operator Kimligi",
      subtitle: character.role,
      description: `${character.summary}\n\nPasif: ${character.passive}\n\nUlti: ${character.ultimate}`,
      color
    });
  }

  private createStatStrip(character: CharacterDefinition, y: number) {
    const stats = [
      ["HP", character.maxHp],
      ["DMG", character.damage],
      ["ATK", `${character.fireIntervalMs}ms`],
      ["VEL", character.projectileSpeed]
    ];
    stats.forEach(([label, value], index) => {
      const x = 24 + index * 86;
      const panel = this.add.rectangle(x, y, 76, 44, 0x020617, 0.82)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x334155, 0.9);
      this.viewObjects.push(panel);
      this.viewObjects.push(this.add.text(x + 10, y + 8, String(label), {
        color: "#94a3b8",
        fontFamily: "Arial",
        fontSize: "9px",
        fontStyle: "bold"
      }));
      this.viewObjects.push(this.add.text(x + 10, y + 23, String(value), {
        color: "#f8fafc",
        fontFamily: "Arial",
        fontSize: "13px",
        fontStyle: "bold"
      }));
    });
  }

  private createDetailItemGrid(character: CharacterDefinition) {
    const items: DetailItem[] = [
      {
        title: "Pasif",
        subtitle: "Sabit etki",
        description: character.passive,
        color: 0x86efac
      },
      {
        title: "Ulti",
        subtitle: "Kirik esik",
        description: character.ultimate,
        color: 0xc4b5fd
      },
      ...character.skills.map((skill) => this.skillToItem(skill)),
      ...character.towers.map((tower) => this.towerToItem(tower))
    ];

    items.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      this.createDetailTile(24 + col * 173, 282 + row * 46, 164, 38, item);
    });
  }

  private createDetailTile(x: number, y: number, width: number, height: number, item: DetailItem) {
    const tile = this.add.rectangle(x, y, width, height, 0x0b1020, 0.88)
      .setOrigin(0, 0)
      .setStrokeStyle(1, item.color, 0.48)
      .setInteractive({ useHandCursor: true });
    const title = this.add.text(x + 10, y + 6, item.title, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "11px",
      fontStyle: "bold"
    });
    const subtitle = this.add.text(x + 10, y + 22, item.subtitle, {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "8px"
    });
    this.viewObjects.push(tile, title, subtitle);

    const activate = () => {
      tile.setFillStyle(0x111827, 0.98);
      tile.setStrokeStyle(1, item.color, 1);
      this.setDetail(item);
    };
    tile.on("pointerover", activate);
    tile.on("pointerdown", activate);
    tile.on("pointerout", () => {
      tile.setFillStyle(0x0b1020, 0.88);
      tile.setStrokeStyle(1, item.color, 0.48);
    });
  }

  private createDetailPanel(character: CharacterDefinition) {
    const color = this.getClassColor(character.id);
    const panel = this.add.rectangle(24, 568, GAME_WORLD_WIDTH - 48, 206, 0x020617, 0.94)
      .setOrigin(0, 0)
      .setStrokeStyle(1, color, 0.72);
    this.detailTitle = this.add.text(42, 586, "", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "14px",
      fontStyle: "bold"
    });
    this.detailText = this.add.text(42, 612, "", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "10px",
      lineSpacing: 1,
      wordWrap: { width: GAME_WORLD_WIDTH - 84 }
    });
    this.viewObjects.push(panel, this.detailTitle, this.detailText);
  }

  private setDetail(item: DetailItem) {
    this.detailTitle?.setText(`${item.title} | ${item.subtitle}`);
    this.detailTitle?.setColor(`#${item.color.toString(16).padStart(6, "0")}`);
    this.detailText?.setText(item.description);
  }

  private skillToItem(skill: SkillDefinition): DetailItem {
    const detailByName: Record<string, string> = {
      Yonlendirme: "Etki: 1.0sn boyunca projectile ve impact vuruslu kuleler hedef alani menzil siniri yokmus gibi tarar. Ham hasari degistirmez; DPS artisi menzil disinda kalan hedeflere ek uptime kazandigi icin olusur.",
      Refactor: "Etki: Secili turret'i cezasiz tasima/rota degisimi icin kullanilir. Hasar formulu degistirmez; altin kaybi olmadan konum optimizasyonu saglar.",
      "Sessiz Mod": "Etki: 5.0sn tum kuleler durur, ardindan damage sinifli kuleler 5.0sn boyunca 3x saldiri hizi alir. Net kazanc sonraki 5sn'deki baz DPS'in yaklasik 3 kati; onceki 5sn hasarsizdir."
    };

    return {
      title: skill.name,
      subtitle: `Beceri ${Math.round(skill.cooldownMs / 1000)}s`,
      description: [
        skill.description,
        `Bekleme: ${(skill.cooldownMs / 1000).toFixed(1)}sn`,
        detailByName[skill.name] ?? "Etki: Karaktere ozel aktif beceri. Sayisal etkiler karakter modulu icinde netlestikce burada guncellenecek."
      ].join("\n"),
      color: 0x7dd3fc
    };
  }

  private towerToItem(tower: TowerDefinition): DetailItem {
    const level10Damage = tower.damage * (1 + (10 - 1) * 0.42);
    const level10Interval = Math.max(tower.id === "warrior-5" ? 50 : 80, tower.fireIntervalMs * (1 - (10 - 1) * 0.1));
    const dps = this.formatDps(tower.damage, tower.fireIntervalMs);
    const level10Dps = this.formatDps(level10Damage, level10Interval);
    const parts = [
      tower.description ?? tower.role,
      `Sinif: ${tower.classType ?? "hybrid"} | Hasar: ${tower.damageType ?? "none"} | Vurus: ${tower.hitType ?? "impact"}`,
      `Maliyet ${tower.cost}g | Upgrade L2/L3/L4: ${getTowerUpgradeCost(tower.upgradeCost, 1)}/${getTowerUpgradeCost(tower.upgradeCost, 2)}/${getTowerUpgradeCost(tower.upgradeCost, 3)}g | Menzil ${tower.id === "warrior-2" ? "Global" : tower.range}`,
      `L1: Hasar ${tower.damage} / ${tower.fireIntervalMs}ms => DPS ${dps}${tower.aoeRadius > 0 ? ` | AOE r${tower.aoeRadius}` : ""}${tower.slowMs > 0 ? ` | Slow ${tower.slowMs}ms` : ""}`,
      `L10 baz: Hasar ${level10Damage.toFixed(1)} / ${Math.round(level10Interval)}ms => DPS ${level10Dps}`,
      `Mermi hizi ${tower.projectileSpeed} | Mekanik: ${(tower.mechanics ?? []).join(", ") || "standart"}`
    ];

    if (tower.id === "warrior-2") {
      parts.push("Sunucu link: Elektrik topunu Sunucu atar. Bagli kule menzilinden cikan hedefe global top yollar. Hasar = 95 + SunucuLv*32 + BagliLv*12, AOE = 24 + SunucuLv*5, CD = max(520, 1100 - SunucuLv*80)ms.");
    }
    if (tower.id === "warrior-4") {
      parts.push("Korku: Ayni hedefe 3. vurus sonrasi hedef 3sn boyunca path uzerinde geri kacar. Ayni hedefe her ek vurus korku suresini tazeler.");
    }
    if (tower.id === "warrior-5") {
      parts.push("Overdrive: Takipte hedefi oldururse 2.0sn path boyunca sweep lazer acar; tick 50ms, hasar 1.2x, isin cizgisine temas eden tum dusmanlara vurur.");
    }
    if (tower.id === "warrior-6") {
      parts.push("Dalga: L2/L3 koyu mavi; L4 elektrik+stack15; L5 yogun elektrik+HPx2; L6 hararetsiz. Chain: arkadaki 2 hedefe ana hasarin %42'si.");
    }

    return {
      title: tower.name,
      subtitle: tower.role,
      description: parts.join("\n"),
      color: tower.color
    };
  }

  private formatDps(damage: number, intervalMs: number) {
    if (damage <= 0 || intervalMs <= 0) {
      return "0.0";
    }
    return (damage / (intervalMs / 1000)).toFixed(1);
  }

  private drawBackdrop(title: string, subtitle: string) {
    const base = this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x050711, 1);
    const header = this.add.rectangle(GAME_WORLD_WIDTH / 2, 94, GAME_WORLD_WIDTH, 188, 0x0f172a, 0.78);
    const graphics = this.add.graphics();
    for (let y = 86; y < GAME_WORLD_HEIGHT; y += 42) {
      graphics.lineStyle(1, 0x38bdf8, y % 84 === 0 ? 0.18 : 0.08);
      graphics.lineBetween(18, y, GAME_WORLD_WIDTH - 18, y + 14);
    }
    for (let index = 0; index < 7; index += 1) {
      const x = 32 + index * 54;
      graphics.lineStyle(1, index % 2 === 0 ? 0xa78bfa : 0xfde68a, 0.14);
      graphics.lineBetween(x, 86, GAME_WORLD_WIDTH - x / 2, 748);
    }
    this.viewObjects.push(base, header, graphics);
    this.viewObjects.push(this.add.text(88, 34, title, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: title.length > 12 ? "22px" : "26px",
      fontStyle: "bold"
    }));
    this.viewObjects.push(this.add.text(88, 66, subtitle, {
      color: "#c4b5fd",
      fontFamily: "Arial",
      fontSize: "11px",
      wordWrap: { width: GAME_WORLD_WIDTH - 112 }
    }));
  }

  private createBackButton(x: number, y: number, label: string, onClick: () => void) {
    const button = this.add.rectangle(x, y, 52, 38, 0x0b1020, 0.94)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x7dd3fc, 0.8)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x + 26, y + 19, label, {
      color: "#e0f2fe",
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    button.on("pointerover", () => button.setFillStyle(0x0e7490, 0.96));
    button.on("pointerout", () => button.setFillStyle(0x0b1020, 0.94));
    button.on("pointerup", onClick);
    this.viewObjects.push(button, text);
  }

  private createButton(x: number, y: number, width: number, height: number, label: string, color: number, onClick: () => void) {
    const button = this.add.rectangle(x, y, width, height, 0x082f49, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, color, 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x + width / 2, y + height / 2, label, {
      color: "#ecfeff",
      fontFamily: "Arial",
      fontSize: "13px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    button.on("pointerover", () => button.setFillStyle(0x0e7490, 1));
    button.on("pointerout", () => button.setFillStyle(0x082f49, 0.96));
    button.on("pointerup", onClick);
    this.viewObjects.push(button, text);
  }

  private drawHex(x: number, y: number, radius: number, fill: number, fillAlpha: number, stroke: number, strokeAlpha: number) {
    const hex = [
      new Phaser.Geom.Point(x + radius, y),
      new Phaser.Geom.Point(x + radius / 2, y + radius * 0.86),
      new Phaser.Geom.Point(x - radius / 2, y + radius * 0.86),
      new Phaser.Geom.Point(x - radius, y),
      new Phaser.Geom.Point(x - radius / 2, y - radius * 0.86),
      new Phaser.Geom.Point(x + radius / 2, y - radius * 0.86)
    ];
    const graphics = this.add.graphics();
    graphics.fillStyle(fill, fillAlpha);
    graphics.fillPoints(hex, true);
    graphics.lineStyle(1, stroke, strokeAlpha);
    graphics.strokePoints(hex, true);
    this.viewObjects.push(graphics);
  }

  private clearView() {
    for (const object of this.viewObjects) {
      object.destroy();
    }
    this.viewObjects = [];
    this.detailText = undefined;
    this.detailTitle = undefined;
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
