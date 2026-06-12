import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  MAP_PATH,
  PATH_WIDTH,
  towerCatalog,
  type CharacterDefinition,
  type CharacterId,
  type EnemySnapshot,
  type GameSnapshot,
  type ProjectileSnapshot,
  type TowerDefinition,
  type TowerSnapshot
} from "@karayel/shared";
import { gameServerUrl, healthUrl } from "../config";

type GameSceneData = {
  characterId?: CharacterId;
};

type RenderTower = {
  base: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  level: Phaser.GameObjects.Text;
  range: Phaser.GameObjects.Arc;
  key: string;
};

type RenderMover = {
  sprite: Phaser.Physics.Arcade.Sprite;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  startedAt: number;
  durationMs: number;
};

type BufferedSnapshot = {
  snapshot: GameSnapshot;
  receivedAt: number;
};

export class GameScene extends Phaser.Scene {
  private room?: Room;
  private localSessionId = "";
  private selectedCharacterId: CharacterId = "zeynep";
  private selectedCharacter: CharacterDefinition = characters[0];
  private selectedTowerDefinition: TowerDefinition = towerCatalog.zeynep[0];
  private selectedPlacedTowerId?: string;
  private enemies = new Map<string, RenderMover>();
  private towers = new Map<string, RenderTower>();
  private projectiles = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private towerSnapshots = new Map<string, TowerSnapshot>();
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private projectileGroup?: Phaser.Physics.Arcade.Group;
  private statusText?: Phaser.GameObjects.Text;
  private topStatsText?: Phaser.GameObjects.Text;
  private pingText?: Phaser.GameObjects.Text;
  private perfText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private ultimateButton?: Phaser.GameObjects.Rectangle;
  private ultimateText?: Phaser.GameObjects.Text;
  private upgradeButton?: Phaser.GameObjects.Rectangle;
  private upgradeText?: Phaser.GameObjects.Text;
  private skillButtons: Phaser.GameObjects.Rectangle[] = [];
  private skillTexts: Phaser.GameObjects.Text[] = [];
  private pingTimer?: Phaser.Time.TimerEvent;
  private pingSamples: number[] = [];
  private renderMsSamples: number[] = [];
  private inboundKbSamples: number[] = [];
  private snapshotCount = 0;
  private lastHudKey = "";
  private lastSkillKey = "";
  private lastSelectionKey = "";
  private lastPerfOverlayAt = 0;
  private lastShopEventAt = 0;
  private lastSnapshotAt = 0;
  private snapshotStepMs = 90;
  private snapshotBuffer: BufferedSnapshot[] = [];
  private towerButtons = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly playbackDelayMs = 500;
  private readonly controlTop = 606;
  private readonly trayTop = 708;

  constructor() {
    super("game");
  }

  init(data: GameSceneData) {
    this.selectedCharacterId = data.characterId ?? "zeynep";
    this.selectedCharacter = characters.find((character) => character.id === this.selectedCharacterId) ?? characters[0];
    this.selectedTowerDefinition = towerCatalog[this.selectedCharacter.id][0];
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f172a");
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x101827);
    this.drawMap();
    this.createHeader();
    this.createTowerTray();
    this.createActionButtons();

    this.enemyGroup = this.physics.add.group({ defaultKey: "enemy-grunt", maxSize: 100 });
    this.projectileGroup = this.physics.add.group({ defaultKey: "projectile-tower", maxSize: 180 });

    this.input.on("pointerup", this.handleMapPointer, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerup", this.handleMapPointer, this);
      this.pingTimer?.remove(false);
    });

    void this.connect();
  }

  update() {
    const now = performance.now();
    this.renderDueSnapshots(now);
    this.animateNetworkMovers(this.enemies, now);
  }

  private drawMap() {
    const graphics = this.add.graphics().setDepth(1);
    graphics.lineStyle(PATH_WIDTH + 18, 0x0b1220, 1);
    this.strokePath(graphics);
    graphics.lineStyle(PATH_WIDTH, 0x334155, 1);
    this.strokePath(graphics);
    graphics.lineStyle(2, 0x94a3b8, 0.5);
    this.strokePath(graphics);

    this.add.circle(MAP_PATH[0].x, MAP_PATH[0].y, 16, 0x22c55e, 0.9).setDepth(2);
    const end = MAP_PATH[MAP_PATH.length - 1];
    this.add.circle(end.x, end.y, 16, 0xfb7185, 0.9).setDepth(2);
  }

  private strokePath(graphics: Phaser.GameObjects.Graphics) {
    graphics.beginPath();
    graphics.moveTo(MAP_PATH[0].x, MAP_PATH[0].y);
    for (const point of MAP_PATH.slice(1)) {
      graphics.lineTo(point.x, point.y);
    }
    graphics.strokePath();
  }

  private createHeader() {
    this.add.rectangle(GAME_WORLD_WIDTH / 2, 40, GAME_WORLD_WIDTH, 80, 0x0f172a, 0.92).setDepth(20);
    this.add.text(16, 12, "Karayel TD", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "22px",
      fontStyle: "bold"
    }).setDepth(21);
    this.statusText = this.add.text(16, 42, "Sunucu kontrol ediliyor...", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "12px"
    }).setDepth(21);
    this.topStatsText = this.add.text(16, 60, "Gold 0  Can 100  Wave 1", {
      color: "#facc15",
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold"
    }).setDepth(21);
    this.pingText = this.add.text(GAME_WORLD_WIDTH - 16, 16, "-- ms", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "13px",
      fontStyle: "bold"
    }).setOrigin(1, 0).setDepth(21);
    this.perfText = this.add.text(GAME_WORLD_WIDTH - 16, 34, "PERF bekleniyor", {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "9px",
      align: "right",
      lineSpacing: 1
    }).setOrigin(1, 0).setDepth(21);
  }

  private createTowerTray() {
    this.add.rectangle(GAME_WORLD_WIDTH / 2, this.trayTop + 68, GAME_WORLD_WIDTH, 136, 0x020617, 0.94)
      .setStrokeStyle(1, 0x334155, 0.9)
      .setDepth(25);

    this.hintText = this.add.text(14, this.trayTop + 8, `${this.selectedCharacter.displayName}: kule sec, yola degmeyen yere dokun`, {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "11px"
    }).setDepth(26);

    this.selectedCharacter.towers.forEach((tower, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 14 + col * 122;
      const y = this.trayTop + 28 + row * 45;
      const button = this.add.rectangle(x, y, 112, 38, tower.id === this.selectedTowerDefinition.id ? 0x334155 : 0x1e293b, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(1, tower.color, tower.id === this.selectedTowerDefinition.id ? 1 : 0.45)
        .setInteractive({ useHandCursor: true })
        .setDepth(26);
      this.add.text(x + 8, y + 6, tower.name, {
        color: "#f8fafc",
        fontFamily: "Arial",
        fontSize: "10px",
        fontStyle: "bold"
      }).setDepth(27);
      this.add.text(x + 8, y + 22, `${tower.cost}g`, {
        color: "#facc15",
        fontFamily: "Arial",
        fontSize: "10px"
      }).setDepth(27);
      button.on("pointerup", () => {
        this.selectedTowerDefinition = tower;
        this.selectedPlacedTowerId = undefined;
        this.updateSelectionUi();
      });
      this.towerButtons.set(tower.id, button);
    });
  }

  private createActionButtons() {
    this.selectedCharacter.skills.forEach((skill, index) => {
      const x = 70 + index * 125;
      const button = this.add.rectangle(x, 626, 112, 34, 0x1e293b, 0.94)
        .setStrokeStyle(1, 0x60a5fa, 0.55)
        .setInteractive({ useHandCursor: true })
        .setDepth(25);
      const label = this.add.text(x, 626, skill.name, {
        color: "#dbeafe",
        fontFamily: "Arial",
        fontSize: "10px",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: 102 }
      }).setOrigin(0.5).setDepth(26);
      button.on("pointerup", () => this.room?.send("useSkill", { slot: index }));
      this.skillButtons.push(button);
      this.skillTexts.push(label);
    });

    this.ultimateButton = this.add.rectangle(86, 672, 140, 34, 0x7c3aed, 0.92)
      .setStrokeStyle(1, 0xc4b5fd, 0.7)
      .setInteractive({ useHandCursor: true })
      .setDepth(25);
    this.ultimateText = this.add.text(86, 672, "Ulti 0%", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(26);
    this.ultimateButton.on("pointerup", () => this.room?.send("useUltimate", {}));

    this.upgradeButton = this.add.rectangle(282, 672, 156, 34, 0x1e293b, 0.92)
      .setStrokeStyle(1, 0x94a3b8, 0.6)
      .setInteractive({ useHandCursor: true })
      .setDepth(25);
    this.upgradeText = this.add.text(282, 672, "Kule sec", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(26);
    this.upgradeButton.on("pointerup", () => {
      if (this.selectedPlacedTowerId) {
        this.room?.send("upgradeTower", { towerId: this.selectedPlacedTowerId });
      }
    });
  }

  private handleMapPointer(pointer: Phaser.Input.Pointer) {
    if (!this.room || pointer.worldY >= this.controlTop || pointer.worldY <= 84) {
      return;
    }

    const tower = this.findTowerAt(pointer.worldX, pointer.worldY);
    if (tower) {
      this.selectedPlacedTowerId = tower.id;
      this.updateSelectionUi();
      return;
    }

    this.selectedPlacedTowerId = undefined;
    this.updateSelectionUi();
    this.room.send("placeTower", {
      definitionId: this.selectedTowerDefinition.id,
      x: pointer.worldX,
      y: pointer.worldY
    });
  }

  private async connect() {
    try {
      await this.checkServerHealth();
      this.statusText?.setText("Odaya baglaniyor...");

      const client = new Client(gameServerUrl);
      this.room = await client.joinOrCreate("match", {
        playerName: this.selectedCharacter.displayName,
        characterId: this.selectedCharacterId
      });
      this.localSessionId = this.room.sessionId;
      this.statusText?.setText(`Oda: ${this.room.roomId}`);

      this.room.onMessage("snapshot", (snapshot: GameSnapshot) => this.queueSnapshot(snapshot));
      this.room.onMessage("latency:pong", (message: { sentAt?: number }) => this.updatePing(message.sentAt));
      this.startPingLoop();
    } catch (error) {
      console.error(error);
      this.statusText?.setText(this.formatConnectionError(error));
    }
  }

  private async checkServerHealth() {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      mode: "cors"
    });

    if (!response.ok) {
      throw new Error(`Health ${response.status}`);
    }
  }

  private queueSnapshot(snapshot: GameSnapshot) {
    this.snapshotBuffer.push({
      snapshot,
      receivedAt: performance.now()
    });

    if (this.snapshotBuffer.length > 120) {
      this.snapshotBuffer.splice(0, this.snapshotBuffer.length - 120);
    }
  }

  private renderDueSnapshots(now: number) {
    const renderBefore = now - this.playbackDelayMs;
    let dueSnapshot: BufferedSnapshot | undefined;

    while (this.snapshotBuffer.length > 0 && this.snapshotBuffer[0].receivedAt <= renderBefore) {
      dueSnapshot = this.snapshotBuffer.shift();
    }

    if (dueSnapshot) {
      this.renderSnapshot(dueSnapshot.snapshot);
    }
  }

  private renderSnapshot(snapshot: GameSnapshot) {
    const renderStart = performance.now();
    const now = performance.now();
    if (this.lastSnapshotAt > 0) {
      this.snapshotStepMs = Phaser.Math.Clamp((now - this.lastSnapshotAt) * 1.15, 65, 140);
    }
    this.lastSnapshotAt = now;

    this.renderEnemies(snapshot.enemies);
    this.renderTowers(snapshot.towers);
    this.renderProjectiles(snapshot.projectiles);
    this.renderHud(snapshot);
    if (now - this.lastShopEventAt > 250) {
      this.game.events.emit("game:snapshot", snapshot);
      this.lastShopEventAt = now;
    }
    const renderMs = performance.now() - renderStart;
    this.recordClientPerf(snapshot, renderMs);
  }

  private renderHud(snapshot: GameSnapshot) {
    const player = snapshot.players.find((candidate) => candidate.id === this.localSessionId);
    const charge = player?.ultimateCharge ?? 0;

    const hudKey = `${snapshot.team.gold}|${Math.round(snapshot.team.health)}|${snapshot.team.wave}|${snapshot.team.enemiesLeft}|${charge}`;
    if (this.lastHudKey !== hudKey) {
      this.topStatsText?.setText(`Gold ${snapshot.team.gold}  Can ${Math.round(snapshot.team.health)}/${snapshot.team.maxHealth}  Wave ${snapshot.team.wave}  Kalan ${snapshot.team.enemiesLeft}`);
      this.ultimateText?.setText(`Ulti ${charge}%`);
      this.ultimateButton?.setFillStyle(charge >= 100 ? 0x7c3aed : 0x312e81, charge >= 100 ? 0.98 : 0.64);
      this.lastHudKey = hudKey;
    }

    this.updateSkillButtons(player?.skillCooldowns ?? [0, 0, 0]);
    this.updateSelectionUi();
  }

  private renderEnemies(enemies: EnemySnapshot[]) {
    const activeIds = new Set(enemies.map((enemy) => enemy.id));

    for (const [id, mover] of this.enemies) {
      if (!activeIds.has(id)) {
        this.enemyGroup?.killAndHide(mover.sprite);
        if (mover.sprite.body) {
          mover.sprite.body.enable = false;
        }
        this.enemies.delete(id);
      }
    }

    for (const enemy of enemies) {
      let mover = this.enemies.get(enemy.id);
      const texture = `enemy-${enemy.type}`;

      if (!mover) {
        const sprite = this.enemyGroup?.get(enemy.x, enemy.y, texture) as Phaser.Physics.Arcade.Sprite | undefined;
        if (!sprite) {
          continue;
        }
        sprite.setActive(true).setVisible(true).setDepth(8);
        if (sprite.body) {
          sprite.body.enable = false;
        }
        mover = this.createMover(sprite, enemy.x, enemy.y);
        this.enemies.set(enemy.id, mover);
      }

      if (mover.sprite.texture.key !== texture) {
        mover.sprite.setTexture(texture);
      }
      this.setMoverTarget(mover, enemy.x, enemy.y);
      mover.sprite.setAlpha(0.68 + 0.32 * (enemy.hp / enemy.maxHp));
    }
  }

  private renderTowers(towers: TowerSnapshot[]) {
    const activeIds = new Set(towers.map((tower) => tower.id));
    this.towerSnapshots = new Map(towers.map((tower) => [tower.id, tower]));

    for (const [id, tower] of this.towers) {
      if (!activeIds.has(id)) {
        tower.base.destroy();
        tower.label.destroy();
        tower.level.destroy();
        tower.range.destroy();
        this.towers.delete(id);
      }
    }

    for (const tower of towers) {
      let rendered = this.towers.get(tower.id);
      if (!rendered) {
        const range = this.add.circle(tower.x, tower.y, tower.range, tower.color, 0.13)
          .setStrokeStyle(2, tower.color, 0.7)
          .setVisible(false)
          .setDepth(5);
        const base = this.add.circle(tower.x, tower.y, 15, tower.color, 1)
          .setStrokeStyle(2, 0xf8fafc, tower.ownerId === this.localSessionId ? 0.7 : 0.25)
          .setDepth(12);
        const label = this.add.text(tower.x, tower.y - 26, tower.name, {
          color: "#f8fafc",
          fontFamily: "Arial",
          fontSize: "9px"
        }).setOrigin(0.5).setDepth(13);
        const level = this.add.text(tower.x, tower.y + 1, `${tower.level}`, {
          color: "#020617",
          fontFamily: "Arial",
          fontSize: "12px",
          fontStyle: "bold"
        }).setOrigin(0.5).setDepth(13);
        rendered = { base, label, level, range, key: "" };
        this.towers.set(tower.id, rendered);
      }

      const key = `${tower.x}|${tower.y}|${tower.color}|${tower.ownerId}|${tower.name}|${tower.level}|${tower.range}`;
      if (rendered.key !== key) {
        rendered.base.setPosition(tower.x, tower.y).setFillStyle(tower.color, 1);
        rendered.label.setPosition(tower.x, tower.y - 26).setText(tower.name);
        rendered.level.setPosition(tower.x, tower.y + 1).setText(`${tower.level}`);
        rendered.range.setPosition(tower.x, tower.y).setRadius(tower.range);
        rendered.key = key;
      }
      rendered.base.setStrokeStyle(2, tower.id === this.selectedPlacedTowerId ? 0xffffff : 0xf8fafc, tower.id === this.selectedPlacedTowerId ? 1 : tower.ownerId === this.localSessionId ? 0.7 : 0.25);
      rendered.range.setVisible(tower.id === this.selectedPlacedTowerId);
    }
  }

  private renderProjectiles(projectiles: ProjectileSnapshot[]) {
    const activeIds = new Set(projectiles.map((projectile) => projectile.id));

    for (const [id, sprite] of this.projectiles) {
      if (!activeIds.has(id)) {
        this.projectileGroup?.killAndHide(sprite);
        if (sprite.body) {
          sprite.body.enable = false;
        }
        this.projectiles.delete(id);
      }
    }

    for (const projectile of projectiles) {
      let sprite = this.projectiles.get(projectile.id);
      const texture = `projectile-${projectile.kind}`;

      if (!sprite) {
        sprite = this.projectileGroup?.get(projectile.x, projectile.y, texture) as Phaser.Physics.Arcade.Sprite | undefined;
        if (!sprite) {
          continue;
        }
        sprite.setActive(true).setVisible(true).setDepth(11);
        if (sprite.body) {
          sprite.body.enable = false;
        }
        this.projectiles.set(projectile.id, sprite);
      }

      if (sprite.texture.key !== texture) {
        sprite.setTexture(texture);
      }
      sprite.setPosition(projectile.x, projectile.y);
    }
  }

  private createMover(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number): RenderMover {
    sprite.setPosition(x, y);
    return {
      sprite,
      fromX: x,
      fromY: y,
      targetX: x,
      targetY: y,
      startedAt: performance.now(),
      durationMs: this.snapshotStepMs
    };
  }

  private setMoverTarget(mover: RenderMover, x: number, y: number) {
    const distanceSq = Phaser.Math.Distance.Squared(mover.sprite.x, mover.sprite.y, x, y);
    if (distanceSq > 190 * 190) {
      mover.sprite.setPosition(x, y);
      mover.fromX = x;
      mover.fromY = y;
      mover.targetX = x;
      mover.targetY = y;
      mover.startedAt = performance.now();
      mover.durationMs = this.snapshotStepMs;
      return;
    }

    mover.fromX = mover.sprite.x;
    mover.fromY = mover.sprite.y;
    mover.targetX = x;
    mover.targetY = y;
    mover.startedAt = performance.now();
    mover.durationMs = this.snapshotStepMs;
  }

  private animateNetworkMovers(movers: Map<string, RenderMover>, now: number) {
    for (const mover of movers.values()) {
      const progress = Phaser.Math.Clamp((now - mover.startedAt) / mover.durationMs, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      mover.sprite.setPosition(
        Phaser.Math.Linear(mover.fromX, mover.targetX, eased),
        Phaser.Math.Linear(mover.fromY, mover.targetY, eased)
      );
    }
  }

  private findTowerAt(x: number, y: number) {
    return Array.from(this.towerSnapshots.values()).find((tower) => Phaser.Math.Distance.Squared(x, y, tower.x, tower.y) <= 24 * 24);
  }

  private updateSelectionUi() {
    const selectedTower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    const selectionKey = selectedTower
      ? `placed|${selectedTower.id}|${selectedTower.level}|${selectedTower.range}|${selectedTower.ownerId}`
      : `new|${this.selectedTowerDefinition.id}`;
    if (this.lastSelectionKey === selectionKey) {
      return;
    }
    this.lastSelectionKey = selectionKey;

    for (const [id, button] of this.towerButtons) {
      const selected = id === this.selectedTowerDefinition.id && !this.selectedPlacedTowerId;
      button.setFillStyle(selected ? 0x334155 : 0x1e293b, 1);
      button.setStrokeStyle(1, this.selectedCharacter.towers.find((tower) => tower.id === id)?.color ?? 0x94a3b8, selected ? 1 : 0.45);
    }

    if (!selectedTower) {
      this.hintText?.setText(`${this.selectedTowerDefinition.name}: ${this.selectedTowerDefinition.cost}g | yola degmeyen yere dokun`);
      this.upgradeText?.setText("Kule sec");
      this.upgradeButton?.setAlpha(0.6);
      return;
    }

    const definition = towerCatalog[selectedTower.characterId].find((tower) => tower.id === selectedTower.definitionId);
    const cost = definition ? Math.round(definition.upgradeCost * selectedTower.level * 1.35) : 0;
    const canUpgrade = selectedTower.ownerId === this.localSessionId && selectedTower.level < 5;
    this.hintText?.setText(`${selectedTower.name} Lv.${selectedTower.level} | Menzil ${Math.round(selectedTower.range)}`);
    this.upgradeText?.setText(canUpgrade ? `Upgrade ${cost}g` : "Upgrade yok");
    this.upgradeButton?.setAlpha(canUpgrade ? 1 : 0.5);
  }

  private updateSkillButtons(cooldowns: number[]) {
    const skillKey = cooldowns.join("|");
    if (this.lastSkillKey === skillKey) {
      return;
    }
    this.lastSkillKey = skillKey;

    this.selectedCharacter.skills.forEach((skill, index) => {
      const cooldown = cooldowns[index] ?? 0;
      this.skillTexts[index]?.setText(cooldown > 0 ? `${cooldown}s` : skill.name);
      this.skillTexts[index]?.setColor(cooldown > 0 ? "#94a3b8" : "#dbeafe");
      this.skillButtons[index]?.setFillStyle(cooldown > 0 ? 0x0f172a : 0x1e293b, cooldown > 0 ? 0.72 : 0.94);
      this.skillButtons[index]?.setStrokeStyle(1, cooldown > 0 ? 0x475569 : 0x60a5fa, cooldown > 0 ? 0.45 : 0.75);
    });
  }

  private startPingLoop() {
    this.pingTimer?.remove(false);
    this.sendPing();
    this.pingTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.sendPing()
    });
  }

  private sendPing() {
    this.room?.send("latency:ping", { sentAt: performance.now() });
  }

  private updatePing(sentAt: unknown) {
    if (typeof sentAt !== "number") {
      return;
    }

    const ping = Math.max(0, Math.round(performance.now() - sentAt));
    this.pingSamples.push(ping);
    this.pingSamples = this.pingSamples.slice(-5);
    const averagePing = Math.round(this.pingSamples.reduce((total, sample) => total + sample, 0) / this.pingSamples.length);
    const jitter = Math.max(...this.pingSamples) - Math.min(...this.pingSamples);
    this.pingText?.setText(`${averagePing} ms ±${jitter}`);
    this.pingText?.setColor(averagePing < 90 && jitter < 35 ? "#22c55e" : averagePing < 180 && jitter < 80 ? "#facc15" : "#fb7185");
  }

  private recordClientPerf(snapshot: GameSnapshot, renderMs: number) {
    this.snapshotCount += 1;
    this.renderMsSamples.push(renderMs);
    this.renderMsSamples = this.renderMsSamples.slice(-30);

    if (this.snapshotCount % 10 === 0 && snapshot.perf) {
      this.inboundKbSamples.push(snapshot.perf.snapshotBytes / 1024);
      this.inboundKbSamples = this.inboundKbSamples.slice(-12);
    }

    this.updatePerfOverlay(snapshot);
  }

  private updatePerfOverlay(snapshot: GameSnapshot) {
    const now = performance.now();
    if (now - this.lastPerfOverlayAt < 250) {
      return;
    }
    this.lastPerfOverlayAt = now;

    const serverPerf = snapshot.perf;
    if (!serverPerf) {
      this.perfText?.setText("PERF: server verisi yok");
      return;
    }

    const averageRenderMs = average(this.renderMsSamples);
    const averageKb = average(this.inboundKbSamples);
    const fps = Math.round(this.game.loop.actualFps);
    const entityText = `E ${snapshot.enemies.length} T ${snapshot.towers.length} P ${snapshot.projectiles.length}`;
    const serverText = `Srv ${serverPerf.tickMs}/${serverPerf.tickMaxMs}ms ${serverPerf.snapshotHz}hz`;
    const clientText = `Cli ${roundClientMetric(averageRenderMs)}ms ${fps}fps ${roundClientMetric(averageKb)}kb`;
    const opsText = `Buf ${this.playbackDelayMs}ms q${this.snapshotBuffer.length} tgt ${serverPerf.ops.targetChecks}`;

    this.perfText?.setText(`${serverText}\n${clientText}\n${entityText} ${opsText}`);
    this.perfText?.setColor(fps >= 50 && serverPerf.tickMs < 8 ? "#86efac" : fps >= 35 && serverPerf.tickMs < 14 ? "#fde047" : "#fb7185");
  }

  private formatConnectionError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const shortMessage = message.length > 42 ? `${message.slice(0, 39)}...` : message;

    if (message.startsWith("Health")) {
      return `HTTP hata: ${shortMessage}`;
    }

    return `Oda/WebSocket hatasi: ${shortMessage}`;
  }
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundClientMetric(value: number) {
  return Math.round(value * 10) / 10;
}
