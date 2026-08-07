import Phaser from "phaser";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  getTowerBuildCost,
  getTowerUpgradeCost,
  type CharacterDefinition,
  type CharacterId,
  type SkillDefinition,
  type TowerDefinition
} from "@karayel/shared";
import { configureHiDpiCamera } from "../rendering";

type DetailItem = {
  title: string;
  subtitle: string;
  description: string;
  color: number;
  type: "passive" | "ultimate" | "skill" | "tower";
};

const REAL_DPS_GAME_SPEED_MULTIPLIER = 0.8;

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

export class CharacterSelectScene extends Phaser.Scene {
  private selectedCharacter: CharacterDefinition = characters[0];
  private viewObjects: Phaser.GameObjects.GameObject[] = [];
  private detailText?: Phaser.GameObjects.Text;
  private detailTitle?: Phaser.GameObjects.Text;
  private detailType?: Phaser.GameObjects.Text;

  constructor() {
    super("character-select");
  }

  create() {
    configureHiDpiCamera(this);
    this.cameras.main.setBackgroundColor("#05060a");
    this.renderArchive();
  }

  private renderArchive() {
    this.clearView();
    this.drawBackdrop("OPERATOR ARSIVI", "Rituel shard icin savunma mimarini sec.");
    this.createBackButton(22, 24, "ANA", () => this.scene.start("main-menu"));

    this.addToView(this.add.text(86, 34, "OPERATOR ARSIVI", {
      color: "#e7e5df",
      fontFamily: titleFont,
      fontSize: "23px",
      fontStyle: "bold"
    }));
    this.addToView(this.add.text(88, 64, "Quantum mistisizm savunma kayitlari", {
      color: "#22d3ee",
      fontFamily: uiFont,
      fontSize: "11px",
      fontStyle: "bold"
    }));

    characters.forEach((character, index) => {
      const y = 112 + index * 82;
      this.createCharacterArchiveCard(character, 22, y, index);
    });
  }

  private createCharacterArchiveCard(character: CharacterDefinition, x: number, y: number, index: number) {
    const color = this.getClassColor(character.id);
    const width = GAME_WORLD_WIDTH - 44;
    const panel = this.drawCutPanel(x, y, width, 70, index === 0 ? palette.amethyst : palette.abyss, 0.9, color, index === 0 ? 0.9 : 0.48, 10)
      .setInteractive(new Phaser.Geom.Rectangle(x, y, width, 70), Phaser.Geom.Rectangle.Contains);

    const portrait = this.add.graphics();
    this.drawOperatorSigil(portrait, x + 37, y + 35, 23, color, index === 0 ? 0.34 : 0.22);
    this.addToView(portrait);

    this.addToView(this.add.text(x + 72, y + 10, character.displayName.toUpperCase(), {
      color: "#f8fafc",
      fontFamily: titleFont,
      fontSize: "17px",
      fontStyle: "bold"
    }));
    this.addToView(this.add.text(x + 72, y + 34, character.role, {
      color: "#cbd5e1",
      fontFamily: uiFont,
      fontSize: "11px"
    }));

    const shard = this.add.text(x + width - 16, y + 35, ">", {
      color: "#bae6fd",
      fontFamily: numberFont,
      fontSize: "20px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    this.addToView(shard);

    panel.on("pointerover", () => {
      panel.setAlpha(1);
      shard.setColor("#facc15");
    });
    panel.on("pointerout", () => {
      panel.setAlpha(0.96);
      shard.setColor("#bae6fd");
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
    this.createBackButton(18, 22, "GERI", () => this.renderArchive());

    this.drawCharacterHeader(character, color);
    this.createDetailItemGrid(character);
    this.createDetailPanel(character);

    this.createButton(30, 794, GAME_WORLD_WIDTH - 60, 38, "BU OPERATORLE SAVASMAYA BASLA", color, () => {
      this.scene.start("game", { characterId: character.id });
    });

    this.setDetail({
      title: "Operator Kimligi",
      subtitle: character.role,
      description: `${character.summary}\n\nPasif: ${character.passive}\n\nUlti: ${character.ultimate}`,
      color,
      type: "passive"
    });
  }

  private drawCharacterHeader(character: CharacterDefinition, color: number) {
    const x = 24;
    const y = 92;
    const width = GAME_WORLD_WIDTH - 48;
    this.drawCutPanel(x, y, width, 88, palette.abyss, 0.86, color, 0.72, 12);
    const portrait = this.add.graphics();
    this.drawOperatorSigil(portrait, x + 49, y + 44, 34, color, 0.28);
    this.addToView(portrait);

    this.addToView(this.add.text(x + 96, y + 12, character.displayName.toUpperCase(), {
      color: "#e7e5df",
      fontFamily: titleFont,
      fontSize: "22px",
      fontStyle: "bold"
    }));
    this.addToView(this.add.text(x + 98, y + 40, character.role, {
      color: "#22d3ee",
      fontFamily: uiFont,
      fontSize: "11px",
      fontStyle: "bold"
    }));
    this.addToView(this.add.text(x + 98, y + 58, character.summary, {
      color: "#cbd5e1",
      fontFamily: uiFont,
      fontSize: "10px",
      lineSpacing: 1,
      wordWrap: { width: width - 116 }
    }));
  }

  private createDetailItemGrid(character: CharacterDefinition) {
    const items: DetailItem[] = [
      {
        title: "Pasif",
        subtitle: "sabit rituel",
        description: character.passive,
        color: palette.soul,
        type: "passive"
      },
      {
        title: "Ulti",
        subtitle: "kritik protokol",
        description: character.ultimate,
        color: palette.gold,
        type: "ultimate"
      },
      ...character.skills.map((skill) => this.skillToItem(skill)),
      ...character.towers.map((tower) => this.towerToItem(tower))
    ];

    items.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      this.createDetailTile(24 + col * 173, 204 + row * 42, 164, 34, item);
    });
  }

  private createDetailTile(x: number, y: number, width: number, height: number, item: DetailItem) {
    const tile = this.drawCutPanel(x, y, width, height, palette.abyss, 0.86, item.color, 0.42, 7)
      .setInteractive(new Phaser.Geom.Rectangle(x, y, width, height), Phaser.Geom.Rectangle.Contains);
    const icon = this.add.graphics();
    this.drawItemGlyph(icon, x + 15, y + 17, item);
    this.addToView(icon);
    const title = this.add.text(x + 30, y + 5, item.title, {
      color: "#f8fafc",
      fontFamily: uiFont,
      fontSize: "10px",
      fontStyle: "bold"
    });
    const subtitle = this.add.text(x + 30, y + 19, item.subtitle, {
      color: "#94a3b8",
      fontFamily: uiFont,
      fontSize: "8px"
    });
    this.addToView(title, subtitle);

    const activate = () => {
      tile.setAlpha(1);
      title.setColor("#ffffff");
      this.setDetail(item);
    };
    tile.on("pointerover", activate);
    tile.on("pointerdown", activate);
    tile.on("pointerout", () => {
      tile.setAlpha(0.92);
      title.setColor("#f8fafc");
    });
  }

  private createDetailPanel(character: CharacterDefinition) {
    const color = this.getClassColor(character.id);
    const x = 24;
    const y = 560;
    const width = GAME_WORLD_WIDTH - 48;
    this.drawCutPanel(x, y, width, 214, palette.void, 0.94, color, 0.7, 12);
    this.detailType = this.add.text(x + 18, y + 14, "", {
      color: "#94a3b8",
      fontFamily: numberFont,
      fontSize: "9px",
      fontStyle: "bold"
    });
    this.detailTitle = this.add.text(x + 18, y + 31, "", {
      color: "#f8fafc",
      fontFamily: titleFont,
      fontSize: "15px",
      fontStyle: "bold"
    });
    this.detailText = this.add.text(x + 18, y + 58, "", {
      color: "#cbd5e1",
      fontFamily: uiFont,
      fontSize: "10px",
      lineSpacing: 2,
      wordWrap: { width: width - 36 }
    });
    this.addToView(this.detailType, this.detailTitle, this.detailText);
  }

  private setDetail(item: DetailItem) {
    this.detailType?.setText(`${item.type.toUpperCase()} / ${item.subtitle.toUpperCase()}`);
    this.detailType?.setColor(`#${item.color.toString(16).padStart(6, "0")}`);
    this.detailTitle?.setText(item.title);
    this.detailTitle?.setColor(`#${item.color.toString(16).padStart(6, "0")}`);
    this.detailText?.setText(item.description);
  }

  private skillToItem(skill: SkillDefinition): DetailItem {
    const detailByName: Record<string, string> = {
      Yonlendirme: "Etki: Basili tutup surukleyerek alan secilir. 1.0sn boyunca projectile ve impact vuruslu kuleler hedef alani menzil siniri yokmus gibi tarar; alandaki dusmanlar %30 fazla hasar alir.",
      Refactor: "Etki: Secili turret'i cezasiz tasima/rota degisimi icin kullanilir. Hasar formulu degistirmez; altin kaybi olmadan konum optimizasyonu saglar.",
      "Sessiz Mod": "Etki: 5.0sn tum kuleler durur, ardindan damage sinifli kuleler 5.0sn boyunca 3x saldiri hizi alir. Net kazanc sonraki 5sn'deki baz DPS'in yaklasik 3 kati; onceki 5sn hasarsizdir."
    };

    return {
      title: skill.name,
      subtitle: `${Math.round(skill.cooldownMs / 1000)}s cooldown`,
      description: [
        skill.description,
        `Bekleme: ${(skill.cooldownMs / 1000).toFixed(1)}sn`,
        detailByName[skill.name] ?? "Etki: Karaktere ozel aktif beceri. Sayisal etkiler karakter modulu icinde netlestikce burada guncellenecek."
      ].join("\n"),
      color: palette.cyan,
      type: "skill"
    };
  }

  private towerToItem(tower: TowerDefinition): DetailItem {
    const level1Damage = getTowerLevelDamage(tower, 1);
    const level1Interval = getTowerLevelInterval(tower, 1);
    const level10Damage = getTowerLevelDamage(tower, 10);
    const level10Interval = getTowerLevelInterval(tower, 10);
    const dps = this.formatDps(level1Damage, level1Interval);
    const level10Dps = this.formatDps(level10Damage, level10Interval);
    const parts = [
      tower.description ?? tower.role,
      `Sinif: ${tower.classType ?? "hybrid"} | Hasar: ${tower.damageType ?? "none"} | Vurus: ${tower.hitType ?? "impact"}`,
      `Maliyet ${getTowerBuildCost(tower.cost)}g | Upgrade L2/L3/L4: ${getTowerUpgradeCost(tower.cost, 1, tower.id)}/${getTowerUpgradeCost(tower.cost, 2, tower.id)}/${getTowerUpgradeCost(tower.cost, 3, tower.id)}g | Menzil ${tower.id === "warrior-2" ? "Global" : tower.range}`,
      `L1: Hasar ${level1Damage.toFixed(1)} / ${Math.round(level1Interval)}ms => DPS ${dps}${tower.aoeRadius > 0 ? ` | AOE r${tower.aoeRadius}` : ""}${tower.slowMs > 0 ? ` | Slow ${tower.slowMs}ms` : ""}`,
      `L10 baz: Hasar ${level10Damage.toFixed(1)} / ${Math.round(level10Interval)}ms => DPS ${level10Dps}`,
      `Mermi hizi ${tower.projectileSpeed} | Mekanik: ${(tower.mechanics ?? []).join(", ") || "standart"}`
    ];

    if (tower.id === "warrior-2") {
      parts.push("Sunucu link: Elektrik topunu Sunucu atar. Bagli kule menzilinden cikan hedefe global top yollar. Hasar Lv1-10: 160/240/330/420/500/1000/1500/2000/3000/4000. AOE = (24 + SunucuLv*5) / 4, CD = max(520, 1100 - SunucuLv*80)ms. Uzun link bufflari Sunucu leveliyle buyur: 5T impact +%12-30, 10T her hit max HP +%0.1-0.5.");
    }
    if (tower.id === "warrior-4") {
      parts.push("Denge: Impact/carpma oldugu icin level ile saldiri hizi artmaz; DPS hasara tasinir. Lv6 yaklasik 425 DPS, Lv7 yaklasik 600 DPS, Lv8 yaklasik 750 DPS, Lv10 yaklasik 1000 DPS.");
    }
    if (tower.id === "warrior-5") {
      parts.push("Denge: Normal lazer gercek araligi Lv1 0.20sn, Lv5 0.16sn, Lv10 0.12sn. Overdrive bunun yarisidir: 0.10sn, 0.08sn, 0.06sn. DPS onceki dengeye yakin korunur.");
    }
    if (tower.id === "warrior-6") {
      parts.push("Denge: Impact/carpma oldugu icin level ile baz saldiri hizi artmaz; DPS korunacak sekilde hasari agirlasir. Dalga bonuslari 2, 4, 6, 8, 10, 14 ve 16 tamamlanan dalgada acilir. Lv10+16dalga+15stack+2chain yaklasik 2114 DPS.");
    }

    return {
      title: tower.name,
      subtitle: tower.role,
      description: parts.join("\n"),
      color: tower.color,
      type: "tower"
    };
  }

  private formatDps(damage: number, intervalMs: number) {
    if (damage <= 0 || intervalMs <= 0) {
      return "0.0";
    }
    return ((damage / (intervalMs / 1000)) * REAL_DPS_GAME_SPEED_MULTIPLIER).toFixed(1);
  }

  private drawBackdrop(title: string, subtitle: string) {
    const base = this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, palette.void, 1);
    const top = this.add.rectangle(GAME_WORLD_WIDTH / 2, 90, GAME_WORLD_WIDTH, 180, palette.abyss, 0.86);
    const lower = this.add.rectangle(GAME_WORLD_WIDTH / 2, 522, GAME_WORLD_WIDTH, 640, palette.slate, 0.34);
    const graphics = this.add.graphics();
    for (let y = 86; y < GAME_WORLD_HEIGHT; y += 38) {
      graphics.lineStyle(1, y % 76 === 0 ? palette.cyan : palette.violet, y % 76 === 0 ? 0.14 : 0.065);
      graphics.lineBetween(18, y, GAME_WORLD_WIDTH - 18, y + 12);
    }
    for (let index = 0; index < 8; index += 1) {
      const x = 24 + index * 50;
      graphics.lineStyle(1, index % 2 === 0 ? palette.gold : palette.cyan, 0.075);
      graphics.lineBetween(x, 92, GAME_WORLD_WIDTH - x / 2, 770);
    }
    this.drawSigil(graphics, GAME_WORLD_WIDTH - 42, 72, 32, palette.violet, palette.cyan, palette.gold);
    this.addToView(base, top, lower, graphics);
    if (title) {
      this.addToView(this.add.text(88, 36, title, {
        color: "#e7e5df",
        fontFamily: titleFont,
        fontSize: title.length > 12 ? "21px" : "24px",
        fontStyle: "bold"
      }));
      this.addToView(this.add.text(90, 65, subtitle, {
        color: "#c4b5fd",
        fontFamily: uiFont,
        fontSize: "11px",
        wordWrap: { width: GAME_WORLD_WIDTH - 126 }
      }));
    }
  }

  private createBackButton(x: number, y: number, label: string, onClick: () => void) {
    const button = this.drawCutPanel(x, y, 54, 38, palette.abyss, 0.94, palette.cyan, 0.72, 8)
      .setInteractive(new Phaser.Geom.Rectangle(x, y, 54, 38), Phaser.Geom.Rectangle.Contains);
    const text = this.add.text(x + 27, y + 19, label, {
      color: "#e0f2fe",
      fontFamily: uiFont,
      fontSize: "10px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    this.addToView(text);
    button.on("pointerover", () => text.setColor("#facc15"));
    button.on("pointerout", () => text.setColor("#e0f2fe"));
    button.on("pointerup", onClick);
  }

  private createButton(x: number, y: number, width: number, height: number, label: string, color: number, onClick: () => void) {
    const button = this.drawCutPanel(x, y, width, height, palette.amethyst, 0.96, color, 1, 10)
      .setInteractive(new Phaser.Geom.Rectangle(x, y, width, height), Phaser.Geom.Rectangle.Contains);
    const text = this.add.text(x + width / 2, y + height / 2, label, {
      color: "#fff7ed",
      fontFamily: uiFont,
      fontSize: "12px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    this.addToView(text);
    button.on("pointerover", () => text.setColor("#ffffff"));
    button.on("pointerout", () => text.setColor("#fff7ed"));
    button.on("pointerup", onClick);
  }

  private drawCutPanel(x: number, y: number, width: number, height: number, fill: number, alpha: number, stroke: number, strokeAlpha: number, cut: number) {
    const graphics = this.add.graphics();
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
    graphics.lineStyle(1, palette.bone, 0.1);
    graphics.lineBetween(x + 12, y + height - 7, x + width - 24, y + height - 7);
    this.addToView(graphics);
    return graphics;
  }

  private drawOperatorSigil(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, alpha: number) {
    this.drawSigil(graphics, x, y, radius, color, palette.cyan, palette.gold, alpha);
    graphics.fillStyle(color, 0.62);
    graphics.fillCircle(x, y, radius * 0.32);
    graphics.fillStyle(palette.bone, 0.96);
    graphics.fillCircle(x, y, radius * 0.12);
  }

  private drawItemGlyph(graphics: Phaser.GameObjects.Graphics, x: number, y: number, item: DetailItem) {
    graphics.lineStyle(1, item.color, 0.9);
    if (item.type === "tower") {
      graphics.strokeRect(x - 6, y - 6, 12, 12);
      graphics.lineBetween(x - 9, y, x + 9, y);
      graphics.lineBetween(x, y - 9, x, y + 9);
    } else if (item.type === "skill") {
      graphics.strokeCircle(x, y, 8);
      graphics.lineBetween(x - 6, y + 5, x + 6, y - 5);
    } else if (item.type === "ultimate") {
      graphics.strokeCircle(x, y, 9);
      graphics.strokeCircle(x, y, 4);
      graphics.fillStyle(item.color, 0.85);
      graphics.fillCircle(x, y, 2);
    } else {
      graphics.beginPath();
      graphics.moveTo(x, y - 9);
      graphics.lineTo(x + 8, y + 6);
      graphics.lineTo(x - 8, y + 6);
      graphics.closePath();
      graphics.strokePath();
    }
  }

  private drawSigil(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, primary: number, secondary: number, accent: number, alpha = 0.28) {
    graphics.lineStyle(1, primary, alpha);
    graphics.strokeCircle(x, y, radius);
    graphics.strokeCircle(x, y, radius * 0.58);
    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10;
      graphics.lineStyle(1, index % 3 === 0 ? accent : secondary, alpha * 0.7);
      graphics.lineBetween(x, y, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
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

  private addToView(...objects: Phaser.GameObjects.GameObject[]) {
    this.viewObjects.push(...objects);
  }

  private clearView() {
    for (const object of this.viewObjects) {
      object.destroy();
    }
    this.viewObjects = [];
    this.detailText = undefined;
    this.detailTitle = undefined;
    this.detailType = undefined;
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

function getTowerLevelDamage(tower: TowerDefinition, level: number) {
  let damage = tower.damage * (1 + (level - 1) * 0.42);

  if (tower.id === "warrior-4") {
    damage *= getObsessionDamageMultiplier(level);
  }

  if (tower.id === "warrior-5") {
    damage *= getDebugLaserDamageMultiplier(level);
  }

  if (tower.id === "warrior-6") {
    damage *= getUcubeGrowthDamageMultiplier(level);
  }

  if (tower.hitType === "impact") {
    damage *= getImpactLevelDamageCompensation(tower, level);
  }

  return damage;
}

function getTowerLevelInterval(tower: TowerDefinition, level: number) {
  if (tower.id === "warrior-5") {
    return getDebugLaserFireInterval(level, false);
  }

  if (tower.id === "warrior-1") {
    return getTrackerFireInterval(level);
  }

  if (tower.hitType === "impact") {
    return tower.fireIntervalMs;
  }

  const levelMultiplier = tower.id === "warrior-4" ? 1 - (level - 1) * 0.17 : 1 - (level - 1) * 0.1;
  return Math.max(80, tower.fireIntervalMs * levelMultiplier);
}

function getImpactLevelDamageCompensation(tower: TowerDefinition, level: number) {
  const levelMultiplier = tower.id === "warrior-4" ? 1 - (level - 1) * 0.17 : 1 - (level - 1) * 0.1;
  const previousInterval = Math.max(80, tower.fireIntervalMs * levelMultiplier);
  return tower.fireIntervalMs / Math.max(1, previousInterval);
}

function getObsessionDamageMultiplier(level: number) {
  const multipliers = [1, 1.018, 1.036, 1.054, 1.072, 1.085349, 0.94697, 1.05753, 1.144, 1.162];
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}

function getDebugLaserDamageMultiplier(level: number) {
  const multipliers = [1.3333, 1.6976, 2.1449, 2.7057, 3.0879, 3.3535, 3.6001, 3.8235, 4.0196, 4.1841];
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}

function getDebugLaserFireInterval(level: number, overdrive: boolean) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  const normalRealMs = clampedLevel <= 5
    ? 200 - (clampedLevel - 1) * 10
    : 160 - (clampedLevel - 5) * 8;
  const realMs = overdrive ? normalRealMs / 2 : normalRealMs;
  return realMs * REAL_DPS_GAME_SPEED_MULTIPLIER;
}

function getTrackerFireInterval(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 720 - ((clampedLevel - 1) / 9) * (720 - 333);
}

function getUcubeGrowthDamageMultiplier(level: number) {
  const multipliers = [0.45, 0.4, 0.34, 0.34, 0.35, 0.42, 0.24, 0.25, 0.64, 1.05];
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}
