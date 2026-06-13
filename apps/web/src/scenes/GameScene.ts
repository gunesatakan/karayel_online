import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  MAP_PATH,
  PATH_WIDTH,
  TOWER_BUILD_BOTTOM,
  TOWER_BUILD_TOP,
  TOWER_GRID_SIZE,
  getTowerUpgradeCost,
  towerCatalog,
  type CharacterDefinition,
  type CharacterId,
  type DamageEventSnapshot,
  type EnemySnapshot,
  type BeamSnapshot,
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
  effect: Phaser.GameObjects.Graphics;
  halo: Phaser.GameObjects.Arc;
  base: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  level: Phaser.GameObjects.Text;
  range: Phaser.GameObjects.Arc;
  isolation: Phaser.GameObjects.Arc;
  status: Phaser.GameObjects.Text;
  key: string;
};

type RenderMover = {
  sprite: Phaser.Physics.Arcade.Sprite;
  marker?: Phaser.GameObjects.Text;
};

type BufferedSnapshot = {
  snapshot: GameSnapshot;
  receivedAt: number;
};

type PlaybackFrame = {
  snapshot: GameSnapshot;
  alpha: number;
};

type PendingAction =
  | { type: "guidance" }
  | { type: "refactor"; towerId: string }
  | undefined;

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
  private beamGraphics?: Phaser.GameObjects.Graphics;
  private towerSnapshots = new Map<string, TowerSnapshot>();
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private projectileGroup?: Phaser.Physics.Arcade.Group;
  private placementGrid?: Phaser.GameObjects.Graphics;
  private placementGhost?: Phaser.GameObjects.Image;
  private seenDamageEventIds: string[] = [];
  private seenDamageEventSet = new Set<string>();
  private seenKillEventIds: string[] = [];
  private seenKillEventSet = new Set<string>();
  private killStreakTimes: number[] = [];
  private nextKillStreakAnnouncementAt = 0;
  private killStreakSounds: HTMLAudioElement[] = [];
  private rampageContainer?: Phaser.GameObjects.Container;
  private backgroundMusic?: HTMLAudioElement;
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
  private currentTeamGold = 0;
  private lastHudKey = "";
  private lastSkillKey = "";
  private lastSelectionKey = "";
  private lastPerfOverlayAt = 0;
  private lastShopEventAt = 0;
  private lastRenderedSnapshotServerTime = 0;
  private serverTimeAnchor?: BufferedSnapshot;
  private droppedSnapshotCount = 0;
  private lastPlaybackAlpha = 0;
  private snapshotBuffer: BufferedSnapshot[] = [];
  private pendingAction: PendingAction;
  private towerButtons = new Map<string, Phaser.GameObjects.Rectangle>();
  private draggedTowerDefinition?: TowerDefinition;
  private ignoreMapPointerUntil = 0;
  private readonly playbackDelayMs = 500;
  private readonly killStreakWindowMs = 5000;
  private readonly killStreakThreshold = 10;
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
    this.createPlacementGrid();
    this.createHeader();
    this.createTowerTray();
    this.createActionButtons();
    this.beamGraphics = this.add.graphics().setDepth(10);
    this.createKillStreakAudio();
    this.createBackgroundMusic();

    this.enemyGroup = this.physics.add.group({ defaultKey: "enemy-grunt" });
    this.projectileGroup = this.physics.add.group({ defaultKey: "projectile-tower", maxSize: 260 });

    this.input.on("pointerup", this.handleMapPointer, this);
    this.input.once("pointerdown", () => this.unlockGameAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerup", this.handleMapPointer, this);
      this.pingTimer?.remove(false);
      this.placementGrid?.destroy();
      this.placementGhost?.destroy();
      this.rampageContainer?.destroy(true);
      this.backgroundMusic?.pause();
    });

    void this.connect();
  }

  update() {
    const now = performance.now();
    this.renderPlaybackFrame(now);
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

  private createPlacementGrid() {
    this.placementGrid = this.add.graphics().setDepth(24).setVisible(false);
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

    this.hintText = this.add.text(14, this.trayTop + 8, `${this.selectedCharacter.displayName}: kuleyi haritaya surukle`, {
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
      this.input.setDraggable(button);
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
      button.on("pointerdown", () => {
        this.selectedTowerDefinition = tower;
        this.selectedPlacedTowerId = undefined;
        this.updateSelectionUi();
      });
      button.on("dragstart", (pointer: Phaser.Input.Pointer) => this.startTowerDrag(tower, pointer));
      button.on("drag", (pointer: Phaser.Input.Pointer) => this.updateTowerDrag(pointer));
      button.on("dragend", (pointer: Phaser.Input.Pointer) => this.finishTowerDrag(pointer));
      this.towerButtons.set(tower.id, button);
    });
  }

  private startTowerDrag(tower: TowerDefinition, pointer: Phaser.Input.Pointer) {
    this.draggedTowerDefinition = tower;
    this.selectedTowerDefinition = tower;
    this.selectedPlacedTowerId = undefined;
    this.placementGrid?.setVisible(true);
    this.placementGhost?.destroy();
    this.placementGhost = this.add.image(pointer.worldX, pointer.worldY, `tower-${tower.id}`)
      .setDisplaySize(38, 38)
      .setAlpha(0.78)
      .setDepth(28);
    this.updateTowerDrag(pointer);
    this.updateSelectionUi();
  }

  private updateTowerDrag(pointer: Phaser.Input.Pointer) {
    if (!this.draggedTowerDefinition) {
      return;
    }

    const cell = this.snapToTowerGrid(pointer.worldX, pointer.worldY);
    const canPlace = this.canPlaceTowerPreview(cell.x, cell.y);
    this.placementGhost?.setPosition(cell.x, cell.y).setTint(canPlace ? 0x86efac : 0xf87171);
    this.drawPlacementGrid(cell.x, cell.y, canPlace);
  }

  private finishTowerDrag(pointer: Phaser.Input.Pointer) {
    const tower = this.draggedTowerDefinition;
    if (!tower) {
      return;
    }

    const cell = this.snapToTowerGrid(pointer.worldX, pointer.worldY);
    const canPlace = this.canPlaceTowerPreview(cell.x, cell.y);
    if (this.room && canPlace) {
      this.room.send("placeTower", {
        definitionId: tower.id,
        x: cell.x,
        y: cell.y
      });
      this.hintText?.setText(`${tower.name} yerlestirme istegi gonderildi`);
    } else {
      this.hintText?.setText("Bu kareye kule yerlestirilemez");
    }

    this.draggedTowerDefinition = undefined;
    this.ignoreMapPointerUntil = performance.now() + 180;
    this.placementGrid?.clear().setVisible(false);
    this.placementGhost?.destroy();
    this.placementGhost = undefined;
    this.updateSelectionUi();
  }

  private drawPlacementGrid(highlightX: number, highlightY: number, canPlace: boolean) {
    const grid = this.placementGrid;
    if (!grid) {
      return;
    }

    grid.clear();
    grid.fillStyle(canPlace ? 0x22c55e : 0xef4444, 0.28);
    grid.fillRect(highlightX - TOWER_GRID_SIZE / 2, highlightY - TOWER_GRID_SIZE / 2, TOWER_GRID_SIZE, TOWER_GRID_SIZE);
    grid.lineStyle(1, canPlace ? 0x86efac : 0xfca5a5, 0.92);
    grid.strokeRect(highlightX - TOWER_GRID_SIZE / 2, highlightY - TOWER_GRID_SIZE / 2, TOWER_GRID_SIZE, TOWER_GRID_SIZE);

    grid.lineStyle(1, 0xe2e8f0, 0.16);
    for (let x = 0; x <= GAME_WORLD_WIDTH; x += TOWER_GRID_SIZE) {
      grid.lineBetween(x, TOWER_BUILD_TOP, x, TOWER_BUILD_BOTTOM);
    }
    for (let y = TOWER_BUILD_TOP; y <= TOWER_BUILD_BOTTOM; y += TOWER_GRID_SIZE) {
      grid.lineBetween(0, y, GAME_WORLD_WIDTH, y);
    }
  }

  private snapToTowerGrid(x: number, y: number) {
    const halfCell = TOWER_GRID_SIZE / 2;
    const margin = halfCell + 1;
    return {
      x: Phaser.Math.Clamp(Math.floor(x / TOWER_GRID_SIZE) * TOWER_GRID_SIZE + halfCell, margin, GAME_WORLD_WIDTH - margin),
      y: Phaser.Math.Clamp(Math.floor((y - TOWER_BUILD_TOP) / TOWER_GRID_SIZE) * TOWER_GRID_SIZE + TOWER_BUILD_TOP + halfCell, TOWER_BUILD_TOP + halfCell, TOWER_BUILD_BOTTOM - halfCell)
    };
  }

  private canPlaceTowerPreview(x: number, y: number, ignoreTowerId = "") {
    if (this.draggedTowerDefinition && this.currentTeamGold < this.draggedTowerDefinition.cost) {
      return false;
    }

    const margin = TOWER_GRID_SIZE / 2 + 1;
    if (
      x < margin ||
      x > GAME_WORLD_WIDTH - margin ||
      y < TOWER_BUILD_TOP + TOWER_GRID_SIZE / 2 ||
      y > TOWER_BUILD_BOTTOM - TOWER_GRID_SIZE / 2 ||
      this.distanceToPath(x, y) < PATH_WIDTH / 2 + 16
    ) {
      return false;
    }

    for (const tower of this.towerSnapshots.values()) {
      if (tower.id === ignoreTowerId) {
        continue;
      }
      if (Phaser.Math.Distance.Squared(x, y, tower.x, tower.y) < TOWER_GRID_SIZE * TOWER_GRID_SIZE) {
        return false;
      }
    }

    return true;
  }

  private createKillStreakAudio() {
    this.killStreakSounds = [
      new Audio("/audio/kill-streak-deep.mp3"),
      new Audio("/audio/kill-streak-emotive.mp3")
    ];

    for (const audio of this.killStreakSounds) {
      audio.preload = "auto";
      audio.volume = 0.82;
    }
  }

  private createBackgroundMusic() {
    this.backgroundMusic = new Audio("/audio/background-theme.mp3");
    this.backgroundMusic.preload = "auto";
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = 0.34;
  }

  private unlockGameAudio() {
    for (const audio of this.killStreakSounds) {
      const originalVolume = audio.volume;
      audio.muted = true;
      audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audio.volume = originalVolume;
        })
        .catch(() => {
          audio.muted = false;
          audio.volume = originalVolume;
        });
    }

    void this.backgroundMusic?.play().catch(() => {
      // Mobile browsers can still delay playback until a stronger user gesture.
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
      button.on("pointerup", () => this.handleSkillButton(index));
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
    if (this.draggedTowerDefinition || performance.now() < this.ignoreMapPointerUntil) {
      return;
    }
    if (!this.room || pointer.worldY >= this.controlTop || pointer.worldY <= 84) {
      return;
    }

    if (this.pendingAction?.type === "guidance") {
      this.room.send("useSkill", { slot: 0, x: pointer.worldX, y: pointer.worldY });
      this.pendingAction = undefined;
      this.hintText?.setText("Yonlendirme alani gonderildi");
      return;
    }

    if (this.pendingAction?.type === "refactor") {
      this.room.send("useSkill", {
        slot: 1,
        towerId: this.pendingAction.towerId,
        x: pointer.worldX,
        y: pointer.worldY
      });
      this.pendingAction = undefined;
      this.hintText?.setText("Refactor istegi gonderildi");
      return;
    }

    const tower = this.findTowerAt(pointer.worldX, pointer.worldY);
    if (tower) {
      if (this.tryLinkServerTower(tower)) {
        return;
      }
      this.selectedPlacedTowerId = tower.id;
      this.updateSelectionUi();
      return;
    }

    this.selectedPlacedTowerId = undefined;
    this.updateSelectionUi();
  }

  private handleSkillButton(index: number) {
    if (!this.room) {
      return;
    }

    if (this.selectedCharacterId !== "warrior") {
      this.room.send("useSkill", { slot: index });
      return;
    }

    if (index === 0) {
      this.pendingAction = { type: "guidance" };
      this.hintText?.setText("Yonlendirme: hedef alana dokun");
      return;
    }

    if (index === 1) {
      if (!this.selectedPlacedTowerId) {
        this.hintText?.setText("Refactor icin once kendi kuleni sec");
        return;
      }
      this.pendingAction = { type: "refactor", towerId: this.selectedPlacedTowerId };
      this.hintText?.setText("Refactor: yeni konuma dokun");
      return;
    }

    this.room.send("useSkill", { slot: index });
  }

  private tryLinkServerTower(targetTower: TowerSnapshot) {
    if (!this.room || !this.selectedPlacedTowerId || targetTower.id === this.selectedPlacedTowerId) {
      return false;
    }

    const selectedTower = this.towerSnapshots.get(this.selectedPlacedTowerId);
    if (
      !selectedTower ||
      selectedTower.ownerId !== this.localSessionId ||
      targetTower.ownerId !== this.localSessionId ||
      selectedTower.definitionId !== "warrior-2" ||
      targetTower.definitionId === "warrior-2"
    ) {
      return false;
    }

    this.room.send("linkServer", {
      serverTowerId: selectedTower.id,
      targetTowerId: targetTower.id
    });
    this.hintText?.setText(`${selectedTower.name}: ${targetTower.name} link istegi gonderildi`);
    return true;
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
    const bufferedSnapshot = {
      snapshot,
      receivedAt: performance.now()
    };
    this.snapshotBuffer.push(bufferedSnapshot);
    this.snapshotBuffer.sort((a, b) => a.snapshot.serverTime - b.snapshot.serverTime);
    if (!this.serverTimeAnchor || snapshot.serverTime >= this.serverTimeAnchor.snapshot.serverTime) {
      this.serverTimeAnchor = bufferedSnapshot;
    }

    if (this.snapshotBuffer.length > 120) {
      this.droppedSnapshotCount += this.snapshotBuffer.length - 120;
      this.snapshotBuffer.splice(0, this.snapshotBuffer.length - 120);
    }
  }

  private renderPlaybackFrame(now: number) {
    const frame = this.getPlaybackFrame(now);
    if (!frame) {
      return;
    }

    this.renderEnemies(frame.snapshot.enemies);
    this.lastPlaybackAlpha = frame.alpha;

    if (frame.snapshot.serverTime !== this.lastRenderedSnapshotServerTime) {
      this.renderSnapshotPayload(frame.snapshot);
      this.lastRenderedSnapshotServerTime = frame.snapshot.serverTime;
    }
  }

  private getPlaybackFrame(now: number): PlaybackFrame | undefined {
    if (this.snapshotBuffer.length === 0 || !this.serverTimeAnchor) {
      return undefined;
    }

    const targetServerTime = this.serverTimeAnchor.snapshot.serverTime + (now - this.serverTimeAnchor.receivedAt) - this.playbackDelayMs;
    this.pruneSnapshotBuffer(targetServerTime);

    let previous = this.snapshotBuffer[0];
    let next = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    for (let index = 0; index < this.snapshotBuffer.length; index += 1) {
      const candidate = this.snapshotBuffer[index];
      if (candidate.snapshot.serverTime <= targetServerTime) {
        previous = candidate;
      }
      if (candidate.snapshot.serverTime >= targetServerTime) {
        next = candidate;
        break;
      }
    }

    if (!previous || !next) {
      const fallback = previous ?? next;
      return fallback ? { snapshot: fallback.snapshot, alpha: 0 } : undefined;
    }

    if (previous.snapshot.serverTime === next.snapshot.serverTime) {
      return { snapshot: previous.snapshot, alpha: 0 };
    }

    const alpha = Phaser.Math.Clamp(
      (targetServerTime - previous.snapshot.serverTime) / (next.snapshot.serverTime - previous.snapshot.serverTime),
      0,
      1
    );

    return {
      snapshot: this.interpolateSnapshot(previous.snapshot, next.snapshot, alpha),
      alpha
    };
  }

  private pruneSnapshotBuffer(targetServerTime: number) {
    const keepAfter = targetServerTime - 1200;
    while (this.snapshotBuffer.length > 2 && this.snapshotBuffer[1].snapshot.serverTime < keepAfter) {
      this.snapshotBuffer.shift();
      this.droppedSnapshotCount += 1;
    }
  }

  private interpolateSnapshot(previous: GameSnapshot, next: GameSnapshot, alpha: number): GameSnapshot {
    const previousEnemies = new Map(previous.enemies.map((enemy) => [enemy.id, enemy]));
    const enemies = next.enemies.map((enemy) => {
      const oldEnemy = previousEnemies.get(enemy.id);
      const pathDistance = oldEnemy
        ? Phaser.Math.Linear(oldEnemy.pathDistance, enemy.pathDistance, alpha)
        : enemy.pathDistance;
      const point = getPointAlongPath(pathDistance);

      return {
        ...enemy,
        x: point.x,
        y: point.y,
        pathDistance,
        hp: oldEnemy ? Phaser.Math.Linear(oldEnemy.hp, enemy.hp, alpha) : enemy.hp
      };
    });

    return {
      ...next,
      enemies
    };
  }

  private renderSnapshotPayload(snapshot: GameSnapshot) {
    const renderStart = performance.now();
    const now = performance.now();

    this.renderTowers(snapshot.towers);
    this.renderBeams(snapshot.beams);
    this.renderProjectiles(snapshot.projectiles);
    this.renderDamageEvents(snapshot.damageEvents);
    this.renderKillEvents(snapshot);
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
    this.currentTeamGold = snapshot.team.gold;

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
        mover.marker?.destroy();
        this.enemies.delete(id);
      }
    }

    for (const enemy of enemies) {
      let mover = this.enemies.get(enemy.id);
      const texture = `enemy-${enemy.type}`;

      if (!mover) {
        let sprite = this.enemyGroup?.get(enemy.x, enemy.y, texture) as Phaser.Physics.Arcade.Sprite | undefined;
        if (!sprite) {
          sprite = this.physics.add.sprite(enemy.x, enemy.y, texture);
          this.enemyGroup?.add(sprite);
        }
        sprite.setActive(true).setVisible(true).setDepth(8);
        if (sprite.body) {
          sprite.body.enable = false;
        }
        mover = this.createMover(sprite, enemy.x, enemy.y);
        mover.marker = this.add.text(enemy.x, enemy.y - 22, "T", {
          color: "#fde047",
          fontFamily: "Arial",
          fontSize: "12px",
          fontStyle: "bold",
          stroke: "#020617",
          strokeThickness: 3
        }).setOrigin(0.5).setDepth(14).setVisible(false);
        this.enemies.set(enemy.id, mover);
      }

      if (mover.sprite.texture.key !== texture) {
        mover.sprite.setTexture(texture);
      }
      mover.sprite.setPosition(enemy.x, enemy.y);
      mover.sprite.setAlpha(0.68 + 0.32 * (enemy.hp / enemy.maxHp));
      mover.marker?.setPosition(enemy.x, enemy.y - 22);
      mover.marker?.setText(enemy.isFeared ? "KORKU" : "T");
      mover.marker?.setColor(enemy.isFeared ? "#c084fc" : "#fde047");
      mover.marker?.setFontSize(enemy.isFeared ? 9 : 12);
      mover.marker?.setVisible(Boolean(enemy.isFeared || enemy.isTracked));
    }
  }

  private renderTowers(towers: TowerSnapshot[]) {
    const activeIds = new Set(towers.map((tower) => tower.id));
    this.towerSnapshots = new Map(towers.map((tower) => [tower.id, tower]));

    for (const [id, tower] of this.towers) {
      if (!activeIds.has(id)) {
        tower.halo.destroy();
        tower.effect.destroy();
        tower.base.destroy();
        tower.label.destroy();
        tower.level.destroy();
        tower.range.destroy();
        tower.isolation.destroy();
        tower.status.destroy();
        this.towers.delete(id);
      }
    }

    for (const tower of towers) {
      let rendered = this.towers.get(tower.id);
      if (!rendered) {
        const halo = this.add.circle(tower.x, tower.y, 19, 0xffffff, 0)
          .setStrokeStyle(3, 0xffffff, 0.8)
          .setDepth(11);
        const effect = this.add.graphics().setDepth(11);
        const range = this.add.circle(tower.x, tower.y, tower.range, tower.color, 0.13)
          .setStrokeStyle(2, tower.color, 0.7)
          .setVisible(false)
          .setDepth(5);
        const isolation = this.add.circle(tower.x, tower.y, 76, 0xf97316, 0.08)
          .setStrokeStyle(2, 0xf97316, 0.82)
          .setVisible(false)
          .setDepth(6);
        const base = this.add.image(tower.x, tower.y, `tower-${tower.definitionId}`)
          .setDisplaySize(38, 38)
          .setAlpha(tower.ownerId === this.localSessionId ? 1 : 0.78)
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
        const status = this.add.text(tower.x, tower.y + 23, "", {
          color: "#fde68a",
          fontFamily: "Arial",
          fontSize: "8px",
          fontStyle: "bold"
        }).setOrigin(0.5).setDepth(13);
        rendered = { effect, halo, base, label, level, range, isolation, status, key: "" };
        this.towers.set(tower.id, rendered);
      }

      const texture = `tower-${tower.definitionId}`;
      const key = `${tower.x}|${tower.y}|${tower.color}|${tower.ownerId}|${tower.name}|${tower.level}|${tower.range}|${tower.status}|${tower.waveBonusLevel ?? 0}|${texture}`;
      if (rendered.key !== key) {
        const haloStyle = getTowerLevelHalo(tower.level);
        rendered.halo.setPosition(tower.x, tower.y);
        rendered.halo.setRadius(haloStyle.radius);
        rendered.halo.setFillStyle(haloStyle.color, haloStyle.fillAlpha);
        rendered.halo.setStrokeStyle(haloStyle.strokeWidth, haloStyle.color, haloStyle.strokeAlpha);
        rendered.base.setPosition(tower.x, tower.y).setTexture(texture);
        rendered.label.setPosition(tower.x, tower.y - 26).setText(tower.name);
        rendered.level.setPosition(tower.x, tower.y + 1).setText(`${tower.level}`);
        rendered.status.setPosition(tower.x, tower.y + 23).setText(tower.status ?? "");
        rendered.range.setPosition(tower.x, tower.y).setRadius(tower.range);
        rendered.isolation.setPosition(tower.x, tower.y).setRadius(76);
        rendered.key = key;
      }
      rendered.base.setScale(tower.id === this.selectedPlacedTowerId ? 0.86 : 0.73);
      rendered.base.setTint(this.getTowerTint(tower));
      rendered.base.setAlpha(tower.status === "Tukenmis" ? 0.52 : tower.ownerId === this.localSessionId ? 1 : 0.78);
      rendered.halo.setVisible(tower.status !== "Tukenmis" && tower.status !== "Hararet");
      this.renderUcubeWaveEffect(rendered.effect, tower);
      rendered.status.setVisible(Boolean(tower.status));
      rendered.range.setVisible(tower.id === this.selectedPlacedTowerId);
      rendered.isolation.setVisible(tower.id === this.selectedPlacedTowerId && tower.definitionId === "warrior-3");
    }
  }

  private getTowerTint(tower: TowerSnapshot) {
    if (tower.status === "Overdrive") {
      return 0xfff1a8;
    }
    if (tower.status === "Hararet" || tower.status === "Tukenmis") {
      return 0x94a3b8;
    }
    if (tower.definitionId === "warrior-6") {
      return 0xffffff;
    }
    return 0xffffff;
  }

  private renderUcubeWaveEffect(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    graphics.clear();
    const bonusLevel = tower.waveBonusLevel ?? 0;
    if (tower.definitionId !== "warrior-6" || bonusLevel < 4 || tower.status === "Hararet" || tower.status === "Tukenmis") {
      return;
    }

    const waveCount = bonusLevel >= 5 ? 4 : 2;
    const phase = (Date.now() % 900) / 900;
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex += 1) {
      const radius = 11.5 + waveIndex * 1.6;
      const segments = 10 + waveIndex * 2;
      const offset = phase * Math.PI * 2 + waveIndex * 0.85;
      graphics.lineStyle(waveIndex % 2 === 0 ? 1.5 : 1, 0xffffff, bonusLevel >= 5 ? 0.86 : 0.66);
      graphics.beginPath();
      for (let pointIndex = 0; pointIndex <= segments; pointIndex += 1) {
        const angle = offset + (pointIndex / segments) * Math.PI * 2;
        const jag = pointIndex % 2 === 0 ? 2.2 : -1.5;
        const clampedRadius = Phaser.Math.Clamp(radius + jag, 8, 18);
        const x = tower.x + Math.cos(angle) * clampedRadius;
        const y = tower.y + Math.sin(angle) * clampedRadius;
        if (pointIndex === 0) {
          graphics.moveTo(x, y);
        } else {
          graphics.lineTo(x, y);
        }
      }
      graphics.strokePath();
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
      const texture = projectile.definitionId && this.textures.exists(`projectile-${projectile.definitionId}`)
        ? `projectile-${projectile.definitionId}`
        : `projectile-${projectile.kind}`;

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

  private renderDamageEvents(events: DamageEventSnapshot[]) {
    for (const event of events) {
      if (this.seenDamageEventSet.has(event.id)) {
        continue;
      }

      this.seenDamageEventSet.add(event.id);
      this.seenDamageEventIds.push(event.id);
      if (this.seenDamageEventIds.length > 240) {
        const oldestId = this.seenDamageEventIds.shift();
        if (oldestId) {
          this.seenDamageEventSet.delete(oldestId);
        }
      }

      const text = this.add.text(event.x, event.y, `-${event.amount}`, {
        color: "#ef4444",
        fontFamily: "Arial",
        fontSize: event.amount >= 100 ? "15px" : "13px",
        fontStyle: "bold",
        stroke: "#450a0a",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(30);

      this.tweens.add({
        targets: text,
        y: event.y - 28,
        x: event.x + Phaser.Math.Between(-8, 8),
        alpha: 0,
        scale: event.amount >= 100 ? 1.28 : 1.12,
        duration: 720,
        ease: "Cubic.easeOut",
        onComplete: () => text.destroy()
      });
    }
  }

  private renderKillEvents(snapshot: GameSnapshot) {
    const localPlayer = snapshot.players.find((candidate) => candidate.id === this.localSessionId);

    for (const event of snapshot.killEvents) {
      if (this.seenKillEventSet.has(event.id)) {
        continue;
      }

      this.seenKillEventSet.add(event.id);
      this.seenKillEventIds.push(event.id);
      if (this.seenKillEventIds.length > 240) {
        const oldestId = this.seenKillEventIds.shift();
        if (oldestId) {
          this.seenKillEventSet.delete(oldestId);
        }
      }

      if (event.ownerId !== this.localSessionId) {
        continue;
      }

      this.killStreakTimes.push(event.serverTime);
      this.killStreakTimes = this.killStreakTimes.filter((time) => event.serverTime - time <= this.killStreakWindowMs);

      if (this.killStreakTimes.length >= this.killStreakThreshold && event.serverTime >= this.nextKillStreakAnnouncementAt) {
        this.nextKillStreakAnnouncementAt = event.serverTime + this.killStreakWindowMs;
        this.playKillStreakAnnouncement();
        this.showRampageAnnouncement(localPlayer);
      }
    }
  }

  private playKillStreakAnnouncement() {
    if (this.killStreakSounds.length === 0) {
      return;
    }

    const audio = Phaser.Utils.Array.GetRandom(this.killStreakSounds);
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Mobile browsers may block audio until the first real touch; the next streak can retry.
    });
  }

  private showRampageAnnouncement(player?: GameSnapshot["players"][number]) {
    this.rampageContainer?.destroy(true);

    const characterName = characters.find((character) => character.id === player?.characterId)?.displayName ?? this.selectedCharacter.displayName;
    const message = `${characterName}! RAMPAGE!`;
    const fontSize = message.length > 17 ? "27px" : "31px";
    const container = this.add.container(GAME_WORLD_WIDTH / 2, -76).setDepth(80).setAlpha(0);
    const plate = this.add.graphics();

    plate.fillStyle(0x050505, 0.92);
    plate.fillPoints([
      new Phaser.Geom.Point(-184, -28),
      new Phaser.Geom.Point(166, -34),
      new Phaser.Geom.Point(186, -5),
      new Phaser.Geom.Point(162, 31),
      new Phaser.Geom.Point(-172, 26),
      new Phaser.Geom.Point(-190, -8)
    ], true);
    plate.lineStyle(3, 0xef4444, 0.95);
    plate.strokePoints([
      new Phaser.Geom.Point(-184, -28),
      new Phaser.Geom.Point(166, -34),
      new Phaser.Geom.Point(186, -5),
      new Phaser.Geom.Point(162, 31),
      new Phaser.Geom.Point(-172, 26),
      new Phaser.Geom.Point(-190, -8)
    ], true);
    plate.lineStyle(2, 0x22d3ee, 0.9);
    plate.lineBetween(-160, 22, -92, -26);
    plate.lineBetween(110, -30, 176, 18);
    plate.lineStyle(2, 0xfacc15, 0.9);
    plate.lineBetween(-176, -5, -134, 26);
    plate.lineBetween(64, 28, 126, -30);

    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "Impact, Arial Black, Arial",
      fontSize,
      fontStyle: "bold",
      color: "#fff7ed",
      stroke: "#0a0a0a",
      strokeThickness: 8
    };
    const cyanGhost = this.add.text(4, 3, message, {
      ...baseStyle,
      color: "#22d3ee",
      stroke: "#111827",
      strokeThickness: 5
    }).setOrigin(0.5).setAngle(-3).setAlpha(0.72);
    const redGhost = this.add.text(-4, -2, message, {
      ...baseStyle,
      color: "#ef4444",
      stroke: "#450a0a",
      strokeThickness: 5
    }).setOrigin(0.5).setAngle(2).setAlpha(0.78);
    const mainText = this.add.text(0, 0, message, {
      ...baseStyle,
      color: "#fff7ed",
      stroke: "#7f1d1d",
      strokeThickness: 7
    }).setOrigin(0.5).setAngle(-1);

    container.add([plate, cyanGhost, redGhost, mainText]);
    this.rampageContainer = container;

    this.tweens.add({
      targets: container,
      y: 86,
      alpha: 1,
      duration: 240,
      ease: "Back.easeOut"
    });
    this.tweens.add({
      targets: container,
      angle: { from: -1.8, to: 1.8 },
      duration: 80,
      yoyo: true,
      repeat: 9,
      ease: "Sine.easeInOut"
    });
    this.tweens.add({
      targets: container,
      y: 56,
      alpha: 0,
      delay: 2500,
      duration: 500,
      ease: "Cubic.easeIn",
      onComplete: () => {
        container.destroy(true);
        if (this.rampageContainer === container) {
          this.rampageContainer = undefined;
        }
      }
    });
  }

  private renderBeams(beams: BeamSnapshot[]) {
    this.beamGraphics?.clear();
    if (!this.beamGraphics) {
      return;
    }

    for (const beam of beams) {
      const color = beam.color ?? 0xfb7185;
      if (beam.overdrive) {
        this.drawOverdriveBeam(beam, color);
      } else if (beam.definitionId === "warrior-6") {
        this.drawChainLightning(beam, color);
      } else {
        this.drawLaserConnection(beam, color);
      }
    }
  }

  private drawChainLightning(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const points: Array<{ x: number; y: number }> = [];
    const segments = 7;

    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const hash = Math.sin((beam.id.length + index * 13) * 19.73) * 43758.5453;
      const offset = index === 0 || index === segments ? 0 : (hash - Math.floor(hash) - 0.5) * 13;
      points.push({
        x: beam.x1 + dx * t + nx * offset,
        y: beam.y1 + dy * t + ny * offset
      });
    }

    const strokeJagged = (width: number, strokeColor: number, alpha: number) => {
      this.beamGraphics?.lineStyle(width, strokeColor, alpha);
      this.beamGraphics?.beginPath();
      points.forEach((point, index) => {
        if (index === 0) {
          this.beamGraphics?.moveTo(point.x, point.y);
        } else {
          this.beamGraphics?.lineTo(point.x, point.y);
        }
      });
      this.beamGraphics?.strokePath();
    };

    strokeJagged(beam.width + 10, color, 0.16);
    strokeJagged(beam.width + 4, 0x38bdf8, 0.5);
    strokeJagged(Math.max(2, beam.width - 1), 0xfef08a, 0.95);
    this.beamGraphics.fillStyle(0x67e8f9, 0.72);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 5);
    this.beamGraphics.fillStyle(0xfef08a, 0.9);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, 4);
  }

  private drawLaserConnection(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    this.beamGraphics.lineStyle(beam.width + 8, color, 0.12);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(beam.width + 3, color, 0.34);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(Math.max(2, beam.width), 0xfef2f2, 0.92);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.fillStyle(0xfef2f2, 0.95);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, 4);
    this.beamGraphics.fillStyle(color, 0.22);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 13);
  }

  private drawOverdriveBeam(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    this.beamGraphics.lineStyle(beam.width + 14, color, 0.14);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(beam.width + 6, color, 0.46);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(Math.max(3, beam.width - 2), 0xfffbeb, 0.98);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(1, color, 0.65);
    this.beamGraphics.strokeCircle(beam.x1, beam.y1, 19);
    this.beamGraphics.fillStyle(0xfffbeb, 1);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 6);
    this.beamGraphics.fillStyle(color, 0.58);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, 5);
  }

  private createMover(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number): RenderMover {
    sprite.setPosition(x, y);
    return {
      sprite
    };
  }

  private findTowerAt(x: number, y: number) {
    return Array.from(this.towerSnapshots.values()).find((tower) => Phaser.Math.Distance.Squared(x, y, tower.x, tower.y) <= 24 * 24);
  }

  private distanceToPath(x: number, y: number) {
    let closest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < MAP_PATH.length - 1; index += 1) {
      const from = MAP_PATH[index];
      const to = MAP_PATH[index + 1];
      closest = Math.min(closest, distanceToSegment(x, y, from.x, from.y, to.x, to.y));
    }
    return closest;
  }

  private updateSelectionUi() {
    const selectedTower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    const selectionKey = selectedTower
      ? `placed|${selectedTower.id}|${selectedTower.level}|${selectedTower.range}|${selectedTower.ownerId}|${selectedTower.status}|${selectedTower.hp}|${selectedTower.maxHp}|${selectedTower.linkedTowerIds?.join(",")}`
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
      this.hintText?.setText(`${this.selectedTowerDefinition.name}: ${this.selectedTowerDefinition.cost}g | haritaya surukle`);
      this.upgradeText?.setText("Kule sec");
      this.upgradeButton?.setAlpha(0.6);
      return;
    }

    const definition = towerCatalog[selectedTower.characterId].find((tower) => tower.id === selectedTower.definitionId);
    const cost = definition ? getTowerUpgradeCost(definition.upgradeCost, selectedTower.level) : 0;
    const canUpgrade = selectedTower.ownerId === this.localSessionId && selectedTower.level < 10;
    const status = selectedTower.status ? ` | ${selectedTower.status}` : "";
    const linkHint = selectedTower.definitionId === "warrior-2" ? ` | Link ${selectedTower.linkedTowerIds?.length ?? 0}/2 icin kuleye dokun` : "";
    const hpText = selectedTower.hp && selectedTower.maxHp ? ` | HP ${selectedTower.hp}/${selectedTower.maxHp}` : "";
    const rangeText = selectedTower.definitionId === "warrior-2" ? "Global" : `${Math.round(selectedTower.range)}`;
    this.hintText?.setText(`${selectedTower.name} Lv.${selectedTower.level} | Menzil ${rangeText}${hpText}${status}${linkHint}`);
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
    const entityText = `E ${snapshot.enemies.length} T ${snapshot.towers.length} P ${snapshot.projectiles.length} B ${snapshot.beams.length}`;
    const serverText = `Srv ${serverPerf.tickMs}/${serverPerf.tickMaxMs}ms ${serverPerf.snapshotHz}hz`;
    const clientText = `Cli ${roundClientMetric(averageRenderMs)}ms ${fps}fps ${roundClientMetric(averageKb)}kb`;
    const opsText = `Buf ${this.playbackDelayMs}ms q${this.snapshotBuffer.length} a${this.lastPlaybackAlpha.toFixed(2)} d${this.droppedSnapshotCount} tgt ${serverPerf.ops.targetChecks}`;

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

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const x = ax + t * dx;
  const y = ay + t * dy;

  return Math.hypot(px - x, py - y);
}

function getPointAlongPath(distance: number) {
  let remaining = distance;

  for (let index = 0; index < MAP_PATH.length - 1; index += 1) {
    const from = MAP_PATH[index];
    const to = MAP_PATH[index + 1];
    const length = Math.hypot(to.x - from.x, to.y - from.y);

    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio
      };
    }

    remaining -= length;
  }

  return MAP_PATH[MAP_PATH.length - 1];
}

function getTowerLevelHalo(level: number) {
  const normalizedLevel = Phaser.Math.Clamp(Math.round(level), 1, 10);
  const palette = [
    0x22c55e,
    0x3b82f6,
    0xa855f7,
    0xeab308,
    0xef4444,
    0x39ff88,
    0x38bdf8,
    0xd946ef,
    0xfde047,
    0xff3131
  ];
  const glowing = normalizedLevel >= 6;
  const color = palette[normalizedLevel - 1];

  return {
    color,
    radius: 19,
    fillAlpha: glowing ? 0.11 : 0.02,
    strokeAlpha: glowing ? 1 : 0.78,
    strokeWidth: glowing ? 3 : 2
  };
}
