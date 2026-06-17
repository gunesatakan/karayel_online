import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  TOWER_BUILD_BOTTOM,
  TOWER_BUILD_TOP,
  TOWER_GRID_SIZE,
  buildRuntimePaths,
  createDefaultEditableMap,
  getMapGridSize as getSharedMapGridSize,
  getPointAlongRuntimePath,
  getTowerSellRefund,
  getTowerUpgradeCost,
  getTile,
  gridToWorld,
  normalizeMapData,
  worldToGrid,
  towerCatalog,
  type CharacterDefinition,
  type CharacterId,
  type DamageEventSnapshot,
  type DroneSnapshot,
  type EditableMapData,
  type EnemySnapshot,
  type BeamSnapshot,
  type GameSnapshot,
  type ProjectileSnapshot,
  type RuntimePath,
  type TowerDefinition,
  type TowerSnapshot
} from "@karayel/shared";
import { gameServerUrl, healthUrl } from "../config";
import { clearActiveLobbyRoom, getActiveLobbyRoom } from "../online-session";
import { configureHiDpiCamera } from "../rendering";

type GameSceneData = {
  characterId?: CharacterId;
  mapData?: EditableMapData;
};

type RenderTower = {
  effect: Phaser.GameObjects.Graphics;
  linkHighlight: Phaser.GameObjects.Arc;
  halo: Phaser.GameObjects.Arc;
  base: Phaser.GameObjects.Image;
  level: Phaser.GameObjects.Text;
  range: Phaser.GameObjects.Arc;
  isolation: Phaser.GameObjects.Graphics;
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

type KillStreakTier = "granted" | "unstoppable" | "rampage" | "legendary";

type KillStreakRule = {
  tier: KillStreakTier;
  label: string;
  windowMs: number;
  kills: number;
  primary: number;
  secondary: number;
  accent: number;
  fill: number;
  chaos: number;
};

type KillStreakLock = {
  unlockAt: number;
  wave: number;
};

type KillStreakVisualTheme = {
  style: "brutal" | "command" | "precision" | "arcane" | "sanctuary" | "bulwark" | "storm";
  primary: number;
  secondary: number;
  accent: number;
  fill: number;
  textColor: string;
  strokeColor: string;
  motif: string;
};

const KILL_STREAK_RETRIGGER_LOCK_MS = 60000;
const GUIDANCE_RADIUS = 78;

type ZeynepCommandTier = "small" | "medium" | "big";
type AudioVolumeChannel = "music" | "voice";

const KILL_STREAK_RULES: KillStreakRule[] = [
  {
    tier: "legendary",
    label: "LEGENDARY",
    windowMs: 11000,
    kills: 22,
    primary: 0xfacc15,
    secondary: 0xff2d55,
    accent: 0xf8fafc,
    fill: 0x13070a,
    chaos: 4
  },
  {
    tier: "rampage",
    label: "RAMPAGE",
    windowMs: 8000,
    kills: 16,
    primary: 0xef4444,
    secondary: 0x22d3ee,
    accent: 0xfacc15,
    fill: 0x050505,
    chaos: 3
  },
  {
    tier: "unstoppable",
    label: "UNSTOPPABLE",
    windowMs: 5000,
    kills: 10,
    primary: 0x8b5cf6,
    secondary: 0x38bdf8,
    accent: 0xfb7185,
    fill: 0x111027,
    chaos: 2
  },
  {
    tier: "granted",
    label: "GRANTED",
    windowMs: 2000,
    kills: 5,
    primary: 0x22c55e,
    secondary: 0xa7f3d0,
    accent: 0xf8fafc,
    fill: 0x052e16,
    chaos: 1
  }
];
const MUSIC_VOLUME_STORAGE_KEY = "karayel.musicVolume";
const VOICE_VOLUME_STORAGE_KEY = "karayel.voiceVolume";
const DEFAULT_MUSIC_VOLUME = 0.34;
const DEFAULT_VOICE_VOLUME = 0.82;

export class GameScene extends Phaser.Scene {
  private room?: Room;
  private localSessionId = "";
  private selectedCharacterId: CharacterId = "zeynep";
  private selectedCharacter: CharacterDefinition = characters[0];
  private selectedTowerDefinition: TowerDefinition = towerCatalog.zeynep[0];
  private selectedMapData: EditableMapData = createDefaultEditableMap();
  private activeRenderPaths: RuntimePath[] = buildRuntimePaths(this.selectedMapData);
  private selectedPlacedTowerId?: string;
  private enemies = new Map<string, RenderMover>();
  private towers = new Map<string, RenderTower>();
  private projectiles = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private drones = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private mapGraphics?: Phaser.GameObjects.Graphics;
  private renderedMapKey = "";
  private beamGraphics?: Phaser.GameObjects.Graphics;
  private towerSnapshots = new Map<string, TowerSnapshot>();
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private projectileGroup?: Phaser.Physics.Arcade.Group;
  private placementGrid?: Phaser.GameObjects.Graphics;
  private placementGhost?: Phaser.GameObjects.Image;
  private guidancePreview?: Phaser.GameObjects.Graphics;
  private isGuidanceDragging = false;
  private seenDamageEventIds: string[] = [];
  private seenDamageEventSet = new Set<string>();
  private seenKillEventIds: string[] = [];
  private seenKillEventSet = new Set<string>();
  private killStreakTimesByOwner = new Map<string, number[]>();
  private killStreakLocksByOwner = new Map<string, Map<KillStreakTier, KillStreakLock>>();
  private killStreakSounds: Record<KillStreakTier, HTMLAudioElement[]> = {
    granted: [],
    unstoppable: [],
    rampage: [],
    legendary: []
  };
  private rampageContainer?: Phaser.GameObjects.Container;
  private backgroundMusic?: HTMLAudioElement;
  private backgroundMusicPath = "";
  private gameAudioUnlocked = false;
  private musicVolume = readStoredVolume(MUSIC_VOLUME_STORAGE_KEY, DEFAULT_MUSIC_VOLUME);
  private voiceVolume = readStoredVolume(VOICE_VOLUME_STORAGE_KEY, DEFAULT_VOICE_VOLUME);
  private audioSettingsOpen = false;
  private audioSettingsItems: Phaser.GameObjects.GameObject[] = [];
  private statusText?: Phaser.GameObjects.Text;
  private topStatsText?: Phaser.GameObjects.Text;
  private pingText?: Phaser.GameObjects.Text;
  private perfText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private towerTrayItems: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text> = [];
  private selectedTowerStatsText?: Phaser.GameObjects.Text;
  private selectedTowerStatsHelpText?: Phaser.GameObjects.Text;
  private ultimateButton?: Phaser.GameObjects.Rectangle;
  private ultimateText?: Phaser.GameObjects.Text;
  private ultimateChoiceItems: Phaser.GameObjects.GameObject[] = [];
  private zeynepTierChoiceItems: Phaser.GameObjects.GameObject[] = [];
  private pendingZeynepCommandSlot?: number;
  private zeynepChainText?: Phaser.GameObjects.Text;
  private zeynepChainEffect?: Phaser.GameObjects.Graphics;
  private upgradeButton?: Phaser.GameObjects.Rectangle;
  private upgradeText?: Phaser.GameObjects.Text;
  private sellButton?: Phaser.GameObjects.Rectangle;
  private sellText?: Phaser.GameObjects.Text;
  private skillButtons: Phaser.GameObjects.Rectangle[] = [];
  private skillTexts: Phaser.GameObjects.Text[] = [];
  private pingTimer?: Phaser.Time.TimerEvent;
  private pingSamples: number[] = [];
  private renderMsSamples: number[] = [];
  private inboundKbSamples: number[] = [];
  private snapshotCount = 0;
  private currentTeamGold = 0;
  private currentUltimateCharge = 0;
  private localPlayerSnapshot?: GameSnapshot["players"][number];
  private zeynepCommandEffects?: GameSnapshot["zeynepCommands"];
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
  private readonly killStreakMaxWindowMs = 11000;
  private readonly dragPreviewOffsetY = 64;
  private readonly controlTop = 606;
  private readonly trayTop = 708;

  constructor() {
    super("game");
  }

  init(data: GameSceneData) {
    this.selectedCharacterId = data.characterId ?? "zeynep";
    this.selectedCharacter = characters.find((character) => character.id === this.selectedCharacterId) ?? characters[0];
    this.selectedTowerDefinition = towerCatalog[this.selectedCharacter.id][0];
    this.selectedMapData = normalizeMapData(data.mapData);
    this.activeRenderPaths = buildRuntimePaths(this.selectedMapData);
  }

  private getMapCellSize() {
    return getSharedMapGridSize(this.selectedMapData);
  }

  private scaleWorldDistance(value: number) {
    return value * (this.getMapCellSize() / TOWER_GRID_SIZE);
  }

  private getTowerEffectScale() {
    const baselineSpriteRadius = (TOWER_GRID_SIZE * 1.12) / 2;
    const spriteRadius = Math.max(20, this.getMapCellSize() * 1.12) / 2;
    return spriteRadius / baselineSpriteRadius;
  }

  create() {
    configureHiDpiCamera(this);
    this.cameras.main.setBackgroundColor("#0f172a");
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x101827);
    this.drawMap();
    this.createPlacementGrid();
    this.createHeader();
    this.createAudioSettingsButton();
    this.createTowerTray();
    this.createActionButtons();
    this.beamGraphics = this.add.graphics().setDepth(10);
    this.createKillStreakAudio();
    this.createBackgroundMusic();

    this.enemyGroup = this.physics.add.group({ defaultKey: "enemy-grunt" });
    this.projectileGroup = this.physics.add.group({ defaultKey: "projectile-tower", maxSize: 260 });

    this.input.on("pointerdown", this.handleMapPointerDown, this);
    this.input.on("pointermove", this.handleMapPointerMove, this);
    this.input.on("pointerup", this.handleMapPointer, this);
    this.input.once("pointerdown", () => this.unlockGameAudio());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handleMapPointerDown, this);
      this.input.off("pointermove", this.handleMapPointerMove, this);
      this.input.off("pointerup", this.handleMapPointer, this);
      this.pingTimer?.remove(false);
      this.placementGrid?.destroy();
      this.placementGhost?.destroy();
      this.guidancePreview?.destroy();
      this.rampageContainer?.destroy(true);
      this.zeynepChainEffect?.destroy();
      this.zeynepChainText?.destroy();
      this.hideAudioSettingsPanel();
      this.hideUltimateChoices();
      this.hideZeynepTierChoices();
      this.backgroundMusic?.pause();
    });

    void this.connect();
  }

  update() {
    const now = performance.now();
    this.renderPlaybackFrame(now);
  }

  private drawMap() {
    const graphics = this.mapGraphics ?? this.add.graphics().setDepth(1);
    this.mapGraphics = graphics;
    graphics.clear();
    this.renderedMapKey = this.selectedMapData.tiles.join("");
    const cellSize = this.getMapCellSize();
    const tileColumns = this.selectedMapData.cols;
    const tileRows = this.selectedMapData.rows;

    graphics.fillStyle(0x07111f, 1);
    graphics.fillRect(0, TOWER_BUILD_TOP, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT - TOWER_BUILD_TOP);

    for (let row = 0; row < tileRows; row += 1) {
      for (let col = 0; col < tileColumns; col += 1) {
        const x = col * cellSize;
        const y = TOWER_BUILD_TOP + row * cellSize;
        const tile = getTile(this.selectedMapData, col, row);
        const isPath = tile === "road" || tile === "spawn" || tile === "nexus";
        const isBuildArea = tile === "tower";
        const fill =
          tile === "spawn" ? 0x14532d :
            tile === "nexus" ? 0x7f1d1d :
              isPath ? 0x334155 :
                isBuildArea ? 0x101827 :
                  0x07111f;

        graphics.fillStyle(fill, 1);
        graphics.fillRect(x, y, cellSize, cellSize);
        graphics.lineStyle(1, isPath ? 0x64748b : isBuildArea ? 0x1e293b : 0x0f172a, isPath ? 0.72 : 0.55);
        graphics.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      }
    }

    graphics.lineStyle(2, 0x0f172a, 0.92);
    graphics.strokeRect(0, TOWER_BUILD_TOP, tileColumns * cellSize, tileRows * cellSize);
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
  }

  private createAudioSettingsButton() {
    const x = GAME_WORLD_WIDTH - 48;
    const y = 52;
    const button = this.add.rectangle(x, y, 58, 24, 0x1e293b, 0.96)
      .setStrokeStyle(1, 0x94a3b8, 0.62)
      .setInteractive({ useHandCursor: true })
      .setDepth(62);
    const label = this.add.text(x, y, "Ses", {
      color: "#e2e8f0",
      fontFamily: "Arial",
      fontSize: "11px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(63).setInteractive({ useHandCursor: true });
    const toggle = () => {
      this.ignoreMapPointerUntil = performance.now() + 180;
      this.toggleAudioSettingsPanel();
    };
    button.on("pointerup", toggle);
    label.on("pointerup", toggle);
  }

  private toggleAudioSettingsPanel() {
    if (this.audioSettingsOpen) {
      this.hideAudioSettingsPanel();
      return;
    }

    this.showAudioSettingsPanel();
  }

  private showAudioSettingsPanel() {
    this.hideAudioSettingsPanel();
    this.audioSettingsOpen = true;

    const panelX = GAME_WORLD_WIDTH - 174;
    const panelY = 82;
    const background = this.add.rectangle(panelX, panelY, 160, 104, 0x020617, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x64748b, 0.72)
      .setInteractive({ useHandCursor: false })
      .setDepth(78);
    background.on("pointerdown", () => {
      this.ignoreMapPointerUntil = performance.now() + 180;
    });
    background.on("pointerup", () => {
      this.ignoreMapPointerUntil = performance.now() + 180;
    });
    const title = this.add.text(panelX + 12, panelY + 8, "Ses ayarlari", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "11px",
      fontStyle: "bold"
    }).setDepth(79);

    this.audioSettingsItems.push(
      background,
      title,
      ...this.createAudioVolumeSlider(panelX + 12, panelY + 34, "Muzik", "music"),
      ...this.createAudioVolumeSlider(panelX + 12, panelY + 70, "Seslendirme", "voice")
    );
  }

  private hideAudioSettingsPanel() {
    for (const item of this.audioSettingsItems) {
      item.destroy();
    }
    this.audioSettingsItems = [];
    this.audioSettingsOpen = false;
  }

  private createAudioVolumeSlider(x: number, y: number, label: string, channel: AudioVolumeChannel) {
    const trackWidth = 96;
    const value = this.getAudioVolume(channel);
    const labelText = this.add.text(x, y, label, {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold"
    }).setDepth(79);
    const valueText = this.add.text(x + 136, y, formatVolumePercent(value), {
      color: "#facc15",
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold"
    }).setOrigin(1, 0).setDepth(79);
    const track = this.add.rectangle(x, y + 20, trackWidth, 7, 0x334155, 1)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(79);
    const fill = this.add.rectangle(x, y + 20, trackWidth * value, 7, channel === "music" ? 0x38bdf8 : 0xf472b6, 1)
      .setOrigin(0, 0.5)
      .setDepth(80);
    const thumb = this.add.circle(x + trackWidth * value, y + 20, 7, 0xf8fafc, 1)
      .setStrokeStyle(2, channel === "music" ? 0x38bdf8 : 0xf472b6, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(81);

    const update = (pointer: Phaser.Input.Pointer) => {
      this.ignoreMapPointerUntil = performance.now() + 180;
      const nextValue = Phaser.Math.Clamp((pointer.worldX - x) / trackWidth, 0, 1);
      this.setAudioVolume(channel, nextValue);
      fill.width = trackWidth * nextValue;
      thumb.setX(x + trackWidth * nextValue);
      valueText.setText(formatVolumePercent(nextValue));
    };
    const handleMove = (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        update(pointer);
      }
    };

    track.on("pointerdown", update);
    track.on("pointermove", handleMove);
    thumb.on("pointerdown", update);
    thumb.on("pointermove", handleMove);

    return [labelText, valueText, track, fill, thumb];
  }

  private getAudioVolume(channel: AudioVolumeChannel) {
    return channel === "music" ? this.musicVolume : this.voiceVolume;
  }

  private setAudioVolume(channel: AudioVolumeChannel, value: number) {
    const volume = Phaser.Math.Clamp(value, 0, 1);
    if (channel === "music") {
      this.musicVolume = volume;
      writeStoredVolume(MUSIC_VOLUME_STORAGE_KEY, volume);
    } else {
      this.voiceVolume = volume;
      writeStoredVolume(VOICE_VOLUME_STORAGE_KEY, volume);
    }
    this.applyAudioVolumes();
  }

  private applyAudioVolumes() {
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.musicVolume;
    }

    for (const audio of Object.values(this.killStreakSounds).flat()) {
      audio.volume = this.voiceVolume;
    }
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
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = 10 + col * 94;
      const y = this.trayTop + 28 + row * 45;
      const button = this.add.rectangle(x, y, 88, 38, tower.id === this.selectedTowerDefinition.id ? 0x334155 : 0x1e293b, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(1, tower.color, tower.id === this.selectedTowerDefinition.id ? 1 : 0.45)
        .setInteractive({ useHandCursor: true })
        .setDepth(26);
      this.input.setDraggable(button);
      const nameText = this.add.text(x + 8, y + 6, tower.name, {
        color: "#f8fafc",
        fontFamily: "Arial",
        fontSize: "9px",
        fontStyle: "bold",
        wordWrap: { width: 74 }
      }).setDepth(27);
      const costText = this.add.text(x + 8, y + 22, `${tower.cost}g`, {
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
      this.towerTrayItems.push(button, nameText, costText);
    });

    this.selectedTowerStatsText = this.add.text(16, this.trayTop + 30, "", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "13px",
      fontStyle: "bold",
      lineSpacing: 7,
      wordWrap: { width: GAME_WORLD_WIDTH - 32 }
    }).setDepth(27).setVisible(false);
    this.selectedTowerStatsHelpText = this.add.text(16, this.trayTop + 106, "Haritaya dokun: dukkan alanina don", {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "10px"
    }).setDepth(27).setVisible(false);
  }

  private startTowerDrag(tower: TowerDefinition, pointer: Phaser.Input.Pointer) {
    this.draggedTowerDefinition = tower;
    this.selectedTowerDefinition = tower;
    this.selectedPlacedTowerId = undefined;
    this.placementGrid?.setVisible(true);
    this.placementGhost?.destroy();
    const previewPoint = this.getTowerDragPreviewPoint(pointer);
    const previewSize = Math.max(22, this.getMapCellSize() * 1.2);
    this.placementGhost = this.add.image(previewPoint.x, previewPoint.y, `tower-${tower.id}`)
      .setDisplaySize(previewSize, previewSize)
      .setAlpha(0.78)
      .setDepth(28);
    this.updateTowerDrag(pointer);
    this.updateSelectionUi();
  }

  private updateTowerDrag(pointer: Phaser.Input.Pointer) {
    if (!this.draggedTowerDefinition) {
      return;
    }

    const previewPoint = this.getTowerDragPreviewPoint(pointer);
    const cell = this.snapToTowerGrid(previewPoint.x, previewPoint.y);
    const canPlace = this.canPlaceTowerPreview(cell.x, cell.y);
    this.placementGhost?.setPosition(cell.x, cell.y).setTint(canPlace ? 0x86efac : 0xf87171);
    this.drawPlacementGrid(cell.x, cell.y, canPlace);
  }

  private finishTowerDrag(pointer: Phaser.Input.Pointer) {
    const tower = this.draggedTowerDefinition;
    if (!tower) {
      return;
    }

    const previewPoint = this.getTowerDragPreviewPoint(pointer);
    const cell = this.snapToTowerGrid(previewPoint.x, previewPoint.y);
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

  private getTowerDragPreviewPoint(pointer: Phaser.Input.Pointer) {
    return {
      x: pointer.worldX,
      y: pointer.worldY - this.dragPreviewOffsetY
    };
  }

  private drawPlacementGrid(highlightX: number, highlightY: number, canPlace: boolean) {
    const grid = this.placementGrid;
    if (!grid) {
      return;
    }

    const cellSize = this.getMapCellSize();
    grid.clear();
    grid.fillStyle(canPlace ? 0x22c55e : 0xef4444, 0.28);
    grid.fillRect(highlightX - cellSize / 2, highlightY - cellSize / 2, cellSize, cellSize);
    grid.lineStyle(1, canPlace ? 0x86efac : 0xfca5a5, 0.92);
    grid.strokeRect(highlightX - cellSize / 2, highlightY - cellSize / 2, cellSize, cellSize);

    grid.lineStyle(1, 0xe2e8f0, 0.16);
    for (let x = 0; x <= GAME_WORLD_WIDTH; x += cellSize) {
      grid.lineBetween(x, TOWER_BUILD_TOP, x, TOWER_BUILD_BOTTOM);
    }
    for (let y = TOWER_BUILD_TOP; y <= TOWER_BUILD_BOTTOM; y += cellSize) {
      grid.lineBetween(0, y, GAME_WORLD_WIDTH, y);
    }
  }

  private snapToTowerGrid(x: number, y: number) {
    const gridPoint = worldToGrid(x, y, this.selectedMapData);
    return gridToWorld(gridPoint.col, gridPoint.row, this.selectedMapData);
  }

  private canPlaceTowerPreview(x: number, y: number, ignoreTowerId = "") {
    if (this.draggedTowerDefinition && this.currentTeamGold < this.draggedTowerDefinition.cost) {
      return false;
    }

    const cellSize = this.getMapCellSize();
    const halfCell = cellSize / 2;
    if (
      x < halfCell ||
      x > GAME_WORLD_WIDTH - halfCell ||
      y < TOWER_BUILD_TOP + halfCell ||
      y > TOWER_BUILD_BOTTOM - halfCell
    ) {
      return false;
    }

    const gridPoint = worldToGrid(x, y, this.selectedMapData);
    if (getTile(this.selectedMapData, gridPoint.col, gridPoint.row) !== "tower") {
      return false;
    }

    for (const tower of this.towerSnapshots.values()) {
      if (tower.id === ignoreTowerId) {
        continue;
      }
      const minDistance = cellSize - 0.5;
      if (Phaser.Math.Distance.Squared(x, y, tower.x, tower.y) < minDistance * minDistance) {
        return false;
      }
    }

    return true;
  }

  private createKillStreakAudio() {
    this.killStreakSounds = {
      granted: [new Audio("/audio/streak-granted.mp3")],
      unstoppable: [new Audio("/audio/streak-unstopable.mp3")],
      rampage: [
        new Audio("/audio/kill-streak-deep.mp3"),
        new Audio("/audio/kill-streak-emotive.mp3")
      ],
      legendary: [new Audio("/audio/streak-legendary.mp3")]
    };

    for (const audio of Object.values(this.killStreakSounds).flat()) {
      audio.preload = "auto";
      audio.volume = this.voiceVolume;
    }
  }

  private createBackgroundMusic() {
    this.backgroundMusicPath = getBackgroundMusicPath(this.selectedCharacterId);
    this.backgroundMusic = new Audio(this.backgroundMusicPath);
    this.backgroundMusic.preload = "auto";
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = this.musicVolume;
  }

  private unlockGameAudio() {
    this.gameAudioUnlocked = true;
    for (const audio of Object.values(this.killStreakSounds).flat()) {
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

    this.zeynepChainEffect = this.add.graphics().setDepth(58).setVisible(false);
    this.zeynepChainText = this.add.text(GAME_WORLD_WIDTH / 2, 596, "", {
      color: "#f9a8d4",
      fontFamily: "Arial",
      fontSize: "11px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(59).setVisible(false);

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
    this.ultimateButton.on("pointerup", () => this.handleUltimateButton());

    this.upgradeButton = this.add.rectangle(244, 672, 108, 34, 0x1e293b, 0.92)
      .setStrokeStyle(1, 0x94a3b8, 0.6)
      .setInteractive({ useHandCursor: true })
      .setDepth(25);
    this.upgradeText = this.add.text(244, 672, "Kule sec", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(26);
    this.upgradeButton.on("pointerup", () => {
      if (this.selectedPlacedTowerId) {
        this.room?.send("upgradeTower", { towerId: this.selectedPlacedTowerId });
      }
    });

    this.sellButton = this.add.rectangle(342, 672, 78, 34, 0x450a0a, 0.88)
      .setStrokeStyle(1, 0xfca5a5, 0.55)
      .setInteractive({ useHandCursor: true })
      .setDepth(25);
    this.sellText = this.add.text(342, 672, "Sat", {
      color: "#fecaca",
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold",
      align: "center"
    }).setOrigin(0.5).setDepth(26);
    this.sellButton.on("pointerup", () => {
      if (this.selectedPlacedTowerId) {
        this.room?.send("sellTower", { towerId: this.selectedPlacedTowerId });
        this.selectedPlacedTowerId = undefined;
        this.updateSelectionUi();
      }
    });
  }

  private handleUltimateButton() {
    if (!this.room) {
      return;
    }

    if (this.currentUltimateCharge < 100) {
      this.hideUltimateChoices();
      this.hintText?.setText("Ulti henuz hazir degil");
      return;
    }

    if (this.selectedCharacterId !== "warrior") {
      this.room.send("useUltimate", {});
      return;
    }

    if (this.ultimateChoiceItems.length > 0) {
      this.hideUltimateChoices();
      return;
    }

    this.showUltimateChoices();
  }

  private showUltimateChoices() {
    this.hideUltimateChoices();
    this.ultimateChoiceItems.push(
      ...this.createUltimateChoiceButton(86, "Saldiri", 0xef4444, () => {
        this.room?.send("useUltimate", { mode: "attack" });
        this.hideUltimateChoices();
      }),
      ...this.createUltimateChoiceButton(282, "Tamir", 0x14b8a6, () => {
        this.room?.send("useUltimate", { mode: "repair" });
        this.hideUltimateChoices();
      })
    );
  }

  private createUltimateChoiceButton(x: number, label: string, color: number, onSelect: () => void) {
    const button = this.add.rectangle(x, 672, x < 160 ? 140 : 156, 34, color, 0.96)
      .setStrokeStyle(2, 0xf8fafc, 0.8)
      .setInteractive({ useHandCursor: true })
      .setDepth(60);
    const text = this.add.text(x, 672, label, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(61);
    button.on("pointerup", onSelect);
    return [button, text];
  }

  private hideUltimateChoices() {
    for (const item of this.ultimateChoiceItems) {
      item.destroy();
    }
    this.ultimateChoiceItems = [];
  }

  private showZeynepTierChoices(slot: number, reputation: number) {
    this.hideZeynepTierChoices();
    this.pendingZeynepCommandSlot = slot;
    const x = 70 + slot * 125;
    this.zeynepTierChoiceItems.push(
      ...this.createZeynepTierChoiceButton(x - 42, "Dusuk", "small", 10, reputation, 0x475569),
      ...this.createZeynepTierChoiceButton(x, "Orta", "medium", 40, reputation, 0x0ea5e9),
      ...this.createZeynepTierChoiceButton(x + 42, "Yuksek", "big", 80, reputation, 0xdb2777)
    );
  }

  private createZeynepTierChoiceButton(x: number, label: string, tier: ZeynepCommandTier, cost: number, reputation: number, color: number) {
    const canUse = reputation >= cost;
    const button = this.add.rectangle(x, 584, 40, 30, canUse ? color : 0x0f172a, canUse ? 0.96 : 0.68)
      .setStrokeStyle(1, canUse ? 0xf8fafc : 0x475569, canUse ? 0.78 : 0.5)
      .setDepth(60);
    const text = this.add.text(x, 584, `${label}\n${cost}I`, {
      color: canUse ? "#f8fafc" : "#64748b",
      fontFamily: "Arial",
      fontSize: "9px",
      fontStyle: "bold",
      align: "center"
    }).setOrigin(0.5).setDepth(61);

    if (canUse) {
      button.setInteractive({ useHandCursor: true });
      button.on("pointerup", () => {
        if (this.pendingZeynepCommandSlot !== undefined) {
          this.room?.send("useSkill", { slot: this.pendingZeynepCommandSlot, commandTier: tier });
        }
        this.hideZeynepTierChoices();
      });
    }

    return [button, text];
  }

  private hideZeynepTierChoices() {
    for (const item of this.zeynepTierChoiceItems) {
      item.destroy();
    }
    this.zeynepTierChoiceItems = [];
    this.pendingZeynepCommandSlot = undefined;
  }

  private handleMapPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.pendingAction?.type !== "guidance" || !this.isBattlePointer(pointer)) {
      return;
    }

    this.isGuidanceDragging = true;
    this.hideUltimateChoices();
    this.drawGuidancePreview(pointer.worldX, pointer.worldY);
    this.hintText?.setText("Yonlendirme: alani surukle, birakinca uygula");
  }

  private handleMapPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.isGuidanceDragging) {
      return;
    }

    const point = this.getClampedGuidancePoint(pointer);
    this.drawGuidancePreview(point.x, point.y);
  }

  private handleMapPointer(pointer: Phaser.Input.Pointer) {
    if (this.isGuidanceDragging) {
      const point = this.getClampedGuidancePoint(pointer);
      this.room?.send("useSkill", { slot: 0, x: point.x, y: point.y });
      this.isGuidanceDragging = false;
      this.pendingAction = undefined;
      this.clearGuidancePreview();
      this.hintText?.setText("Yonlendirme alani gonderildi");
      return;
    }

    if (this.draggedTowerDefinition || performance.now() < this.ignoreMapPointerUntil) {
      return;
    }
    if (!this.isBattlePointer(pointer)) {
      return;
    }
    this.hideUltimateChoices();

    if (this.pendingAction?.type === "guidance") {
      this.hintText?.setText("Yonlendirme icin haritada basili tutup surukle");
      return;
    }

    if (this.pendingAction?.type === "refactor") {
      this.room?.send("useSkill", {
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

    if (this.selectedCharacterId === "zeynep") {
      const reputation = this.localPlayerSnapshot?.reputation ?? 0;
      this.showZeynepTierChoices(index, reputation);
      this.hintText?.setText("Komut gucunu sec: dusuk, orta veya yuksek");
      return;
    }

    if (this.selectedCharacterId !== "warrior") {
      this.hideZeynepTierChoices();
      this.room.send("useSkill", { slot: index });
      return;
    }

    if (index === 0) {
      this.hideZeynepTierChoices();
      this.pendingAction = { type: "guidance" };
      this.hintText?.setText("Yonlendirme: haritada basili tutup alani surukle");
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

    this.hideZeynepTierChoices();
    this.room.send("useSkill", { slot: index });
  }

  private tryLinkServerTower(targetTower: TowerSnapshot) {
    if (!this.room || !this.selectedPlacedTowerId || targetTower.id === this.selectedPlacedTowerId) {
      return false;
    }

    const selectedTower = this.towerSnapshots.get(this.selectedPlacedTowerId);
    if (!selectedTower || selectedTower.ownerId !== this.localSessionId) {
      return false;
    }

    const linkRequest = this.getLinkRequest(selectedTower, targetTower);
    if (!linkRequest) {
      return false;
    }

    this.room.send("linkServer", {
      serverTowerId: linkRequest.serverTowerId,
      targetTowerId: linkRequest.targetTowerId
    });
    this.hintText?.setText(`${linkRequest.sourceName}: ${linkRequest.targetName} link istegi gonderildi`);
    return true;
  }

  private getLinkRequest(selectedTower: TowerSnapshot, targetTower: TowerSnapshot) {
    if (selectedTower.definitionId === "warrior-2") {
      return targetTower.definitionId !== "warrior-2"
        ? { serverTowerId: selectedTower.id, targetTowerId: targetTower.id, sourceName: selectedTower.name, targetName: targetTower.name }
        : undefined;
    }

    return undefined;
  }

  private async connect() {
    try {
      await this.checkServerHealth();
      this.statusText?.setText("Odaya baglaniyor...");

      const existingRoom = getActiveLobbyRoom();
      if (existingRoom) {
        this.room = existingRoom;
      } else {
        const client = new Client(gameServerUrl);
        this.room = await client.create("match", {
          playerName: this.selectedCharacter.displayName,
          characterId: this.selectedCharacterId,
          mapData: this.selectedMapData,
          autoStart: true
        });
      }
      this.localSessionId = this.room.sessionId;
      this.statusText?.setText(`Oda: ${this.room.roomId}`);

      this.room.onMessage("snapshot", (snapshot: GameSnapshot) => this.queueSnapshot(snapshot));
      this.room.onMessage("latency:pong", (message: { sentAt?: number }) => this.updatePing(message.sentAt));
      this.room.onLeave(() => clearActiveLobbyRoom(this.room?.roomId));
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

    this.zeynepCommandEffects = frame.snapshot.zeynepCommands;
    this.renderEnemies(frame.snapshot.enemies);
    this.renderDrones(frame.snapshot.drones ?? []);
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
      const isAir = enemy.movementKind === "air" || oldEnemy?.movementKind === "air";
      const pathDistance = oldEnemy
        ? Phaser.Math.Linear(oldEnemy.pathDistance, enemy.pathDistance, alpha)
        : enemy.pathDistance;
      const pathPoint = isAir ? undefined : getPointAlongRuntimePath(this.activeRenderPaths[enemy.pathId ?? oldEnemy?.pathId ?? 0], pathDistance);

      return {
        ...enemy,
        x: isAir ? oldEnemy ? Phaser.Math.Linear(oldEnemy.x, enemy.x, alpha) : enemy.x : pathPoint?.x ?? enemy.x,
        y: isAir ? oldEnemy ? Phaser.Math.Linear(oldEnemy.y, enemy.y, alpha) : enemy.y : pathPoint?.y ?? enemy.y,
        pathDistance,
        hp: oldEnemy ? Phaser.Math.Linear(oldEnemy.hp, enemy.hp, alpha) : enemy.hp,
        shield: oldEnemy ? Phaser.Math.Linear(oldEnemy.shield, enemy.shield, alpha) : enemy.shield
      };
    });

    const previousDrones = new Map((previous.drones ?? []).map((drone) => [drone.id, drone]));
    const drones = (next.drones ?? []).map((drone) => {
      const oldDrone = previousDrones.get(drone.id);
      return {
        ...drone,
        x: oldDrone ? Phaser.Math.Linear(oldDrone.x, drone.x, alpha) : drone.x,
        y: oldDrone ? Phaser.Math.Linear(oldDrone.y, drone.y, alpha) : drone.y
      };
    });

    return {
      ...next,
      enemies,
      drones
    };
  }

  private renderSnapshotPayload(snapshot: GameSnapshot) {
    const renderStart = performance.now();
    const now = performance.now();

    this.syncBackgroundMusic(snapshot);
    this.zeynepCommandEffects = snapshot.zeynepCommands;
    this.syncMapFromSnapshot(snapshot);
    this.renderTowers(snapshot.towers);
    this.renderBeams(snapshot.beams);
    this.renderProjectiles(snapshot.projectiles);
    this.renderDamageEvents(snapshot.damageEvents);
    this.renderKillEvents(snapshot);
    this.renderHud(snapshot);
    if (now - this.lastShopEventAt > 250) {
      this.game.events.emit("game:snapshot", snapshot, this.localSessionId);
      this.lastShopEventAt = now;
    }
    const renderMs = performance.now() - renderStart;
    this.recordClientPerf(snapshot, renderMs);
  }

  private syncBackgroundMusic(snapshot: GameSnapshot) {
    const hostPlayer = snapshot.players.find((player) => player.id === snapshot.hostId) ?? snapshot.players[0];
    const nextPath = getBackgroundMusicPath(hostPlayer?.characterId ?? this.selectedCharacterId);
    if (nextPath === this.backgroundMusicPath) {
      return;
    }

    const shouldResume = this.gameAudioUnlocked && this.backgroundMusic ? !this.backgroundMusic.paused : false;
    this.backgroundMusic?.pause();
    this.backgroundMusicPath = nextPath;
    this.backgroundMusic = new Audio(nextPath);
    this.backgroundMusic.preload = "auto";
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = this.musicVolume;

    if (shouldResume) {
      void this.backgroundMusic.play().catch(() => {
        // Mobile browsers can still delay playback until the next touch.
      });
    }
  }

  private isBattlePointer(pointer: Phaser.Input.Pointer) {
    return Boolean(this.room) && !this.draggedTowerDefinition && pointer.worldY < this.controlTop && pointer.worldY > 84;
  }

  private getClampedGuidancePoint(pointer: Phaser.Input.Pointer) {
    const radius = this.scaleWorldDistance(GUIDANCE_RADIUS);
    return {
      x: Phaser.Math.Clamp(pointer.worldX, radius, GAME_WORLD_WIDTH - radius),
      y: Phaser.Math.Clamp(pointer.worldY, 84 + radius, this.controlTop - radius)
    };
  }

  private drawGuidancePreview(x: number, y: number) {
    const radius = this.scaleWorldDistance(GUIDANCE_RADIUS);
    const preview = this.guidancePreview ?? this.add.graphics().setDepth(55);
    this.guidancePreview = preview;
    preview.clear();
    preview.fillStyle(0x38bdf8, 0.16);
    preview.fillCircle(x, y, radius);
    preview.lineStyle(2, 0x7dd3fc, 0.86);
    preview.strokeCircle(x, y, radius);
    preview.lineStyle(2, 0xfacc15, 0.82);
    preview.lineBetween(x - 14, y, x + 14, y);
    preview.lineBetween(x, y - 14, x, y + 14);
    preview.fillStyle(0xfacc15, 0.95);
    preview.fillCircle(x, y, 4);
  }

  private clearGuidancePreview() {
    this.guidancePreview?.clear();
  }

  private syncMapFromSnapshot(snapshot: GameSnapshot) {
    if (!snapshot.map) {
      return;
    }

    const map = normalizeMapData(snapshot.map);
    const mapKey = map.tiles.join("");
    if (mapKey === this.renderedMapKey) {
      return;
    }

    this.selectedMapData = map;
    this.activeRenderPaths = buildRuntimePaths(map);
    this.renderedMapKey = mapKey;
    this.drawMap();
  }

  private renderHud(snapshot: GameSnapshot) {
    const player = snapshot.players.find((candidate) => candidate.id === this.localSessionId);
    this.localPlayerSnapshot = player;
    const charge = player?.ultimateCharge ?? 0;
    const gold = player?.gold ?? 0;
    this.currentTeamGold = gold;
    this.currentUltimateCharge = charge;
    if (charge < 100 && this.ultimateChoiceItems.length > 0) {
      this.hideUltimateChoices();
    }

    const reputation = player?.reputation ?? 0;
    const authorityChain = player?.authorityChain ?? 0;
    const authorityQuality = player?.authorityQuality ?? 0;
    if (player?.characterId !== "zeynep") {
      this.hideZeynepTierChoices();
    }
    const zeynepStats = player?.characterId === "zeynep" ? `  Itibar ${reputation}/100  Zincir ${authorityChain}/2  Kalite ${authorityQuality}/15` : "";
    const hudKey = `${gold}|${Math.round(snapshot.team.health)}|${snapshot.team.wave}|${snapshot.team.enemiesLeft}|${charge}|${reputation}|${authorityChain}|${authorityQuality}`;
    if (this.lastHudKey !== hudKey) {
      this.topStatsText?.setText(`Gold ${Math.floor(gold)}  Can ${Math.round(snapshot.team.health)}/${snapshot.team.maxHealth}  Wave ${snapshot.team.wave}  Kalan ${snapshot.team.enemiesLeft}${zeynepStats}`);
      this.ultimateText?.setText(`Ulti ${charge}%`);
      this.ultimateButton?.setFillStyle(charge >= 100 ? 0x7c3aed : 0x312e81, charge >= 100 ? 0.98 : 0.64);
      this.lastHudKey = hudKey;
    }

    this.updateSkillButtons(player?.skillCooldowns ?? [0, 0, 0], player);
    this.updateSelectionUi();
  }

  private renderEnemies(enemies: EnemySnapshot[]) {
    const activeIds = new Set(enemies.map((enemy) => enemy.id));
    const slowCommand = this.zeynepCommandEffects?.slow;
    const slowTierLevel = slowCommand ? getZeynepCommandTierLevel(slowCommand.tier) : 0;

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
      mover.sprite.setDepth(enemy.movementKind === "air" ? 9 : 8);
      const slowPulse = slowTierLevel > 0 ? Math.sin(performance.now() / 120) * 0.05 : 0;
      mover.sprite.setScale((enemy.movementKind === "air" ? 1.28 : 1) + slowPulse);
      mover.sprite.setAlpha(enemy.movementKind === "air" ? 0.98 : 0.68 + 0.32 * (enemy.hp / enemy.maxHp));
      mover.sprite.setTint(slowTierLevel > 0 ? getZeynepSlowTint(slowTierLevel) : enemy.shield > 0 ? 0xbfdbfe : enemy.movementKind === "air" ? 0x67e8f9 : 0xffffff);
      mover.marker?.setPosition(enemy.x, enemy.y - 22);
      const trackingStacks = enemy.trackingStacks ?? (enemy.isTracked ? 1 : 0);
      const hasCombatMarker = Boolean(enemy.isFeared || trackingStacks > 0);
      const slowLabel = slowTierLevel > 0 ? `SLOW ${slowTierLevel}` : "";
      mover.marker?.setText(enemy.isFeared ? "KORKU" : trackingStacks > 1 ? `T${trackingStacks}` : hasCombatMarker ? "T" : slowLabel || "AIR");
      mover.marker?.setColor(enemy.isFeared ? "#c084fc" : hasCombatMarker ? getTrackingMarkerColor(trackingStacks) : slowTierLevel > 0 ? getZeynepSlowTextColor(slowTierLevel) : "#67e8f9");
      mover.marker?.setFontSize(enemy.isFeared ? 9 : hasCombatMarker ? 12 : slowTierLevel > 0 ? 8 : 8);
      mover.marker?.setVisible(Boolean(hasCombatMarker || slowTierLevel > 0 || enemy.movementKind === "air"));
    }
  }

  private renderTowers(towers: TowerSnapshot[]) {
    const activeIds = new Set(towers.map((tower) => tower.id));
    this.towerSnapshots = new Map(towers.map((tower) => [tower.id, tower]));
    const cellSize = this.getMapCellSize();
    const spriteSize = Math.max(20, cellSize * 1.12);
    const baseScale = spriteSize / 52;
    const haloRadius = Math.max(10, cellSize * 0.56);
    const linkRadius = Math.max(14, cellSize * 0.8);
    const statusOffset = Math.max(14, cellSize * 0.66);

    for (const [id, tower] of this.towers) {
      if (!activeIds.has(id)) {
        tower.halo.destroy();
        tower.effect.destroy();
        tower.linkHighlight.destroy();
        tower.base.destroy();
        tower.level.destroy();
        tower.range.destroy();
        tower.isolation.destroy();
        tower.status.destroy();
        this.towers.delete(id);
      }
    }
    if (this.selectedPlacedTowerId && !activeIds.has(this.selectedPlacedTowerId)) {
      this.selectedPlacedTowerId = undefined;
      this.updateSelectionUi();
    }

    for (const tower of towers) {
      let rendered = this.towers.get(tower.id);
      if (!rendered) {
        const halo = this.add.circle(tower.x, tower.y, haloRadius, 0xffffff, 0)
          .setStrokeStyle(3, 0xffffff, 0.8)
          .setDepth(11);
        const effect = this.add.graphics().setDepth(12.4);
        const linkHighlight = this.add.circle(tower.x, tower.y, linkRadius, 0x22d3ee, 0.16)
          .setStrokeStyle(3, 0xfacc15, 0.92)
          .setVisible(false)
          .setDepth(14);
        const range = this.add.circle(tower.x, tower.y, tower.range, tower.color, 0.13)
          .setStrokeStyle(2, tower.color, 0.7)
          .setVisible(false)
          .setDepth(5);
        const isolation = this.add.graphics()
          .setVisible(false)
          .setDepth(6);
        const base = this.add.image(tower.x, tower.y, `tower-${tower.definitionId}`)
          .setDisplaySize(52, 52)
          .setAlpha(tower.ownerId === this.localSessionId ? 1 : 0.78)
          .setDepth(12);
        const level = this.add.text(tower.x, tower.y + 1, `${tower.level}`, {
          color: "#020617",
          fontFamily: "Arial",
          fontSize: "12px",
          fontStyle: "bold"
        }).setOrigin(0.5).setDepth(13);
        const status = this.add.text(tower.x, tower.y + statusOffset, "", {
          color: "#fde68a",
          fontFamily: "Arial",
          fontSize: "8px",
          fontStyle: "bold"
        }).setOrigin(0.5).setDepth(13);
        rendered = { effect, linkHighlight, halo, base, level, range, isolation, status, key: "" };
        this.towers.set(tower.id, rendered);
      }

      const texture = `tower-${tower.definitionId}`;
      const key = `${tower.x}|${tower.y}|${tower.color}|${tower.ownerId}|${tower.name}|${tower.level}|${tower.range}|${tower.status}|${tower.waveBonusLevel ?? 0}|${tower.serverLinkWaveAge ?? 0}|${tower.zeynepFormationSize ?? 0}|${tower.zeynepFormationLevel ?? 0}|${texture}`;
      if (rendered.key !== key) {
        const haloStyle = getTowerLevelHalo(tower.level);
        rendered.halo.setPosition(tower.x, tower.y);
        rendered.halo.setRadius(Math.max(haloRadius, cellSize * 0.5));
        rendered.halo.setFillStyle(haloStyle.color, haloStyle.fillAlpha);
        rendered.halo.setStrokeStyle(haloStyle.strokeWidth, haloStyle.color, haloStyle.strokeAlpha);
        rendered.linkHighlight.setPosition(tower.x, tower.y);
        rendered.base.setPosition(tower.x, tower.y).setTexture(texture);
        rendered.level.setPosition(tower.x, tower.y + 1).setText(`${tower.level}`);
        rendered.status.setPosition(tower.x, tower.y + statusOffset).setText(tower.status ?? "");
        rendered.range.setPosition(tower.x, tower.y).setRadius(tower.range);
        this.drawIsolationGrid(rendered.isolation, tower.x, tower.y);
        rendered.key = key;
      }
      rendered.base.setScale((tower.id === this.selectedPlacedTowerId ? 1.18 : 1) * baseScale);
      rendered.base.setTint(this.getTowerTint(tower));
      rendered.base.setAlpha(tower.status === "Tukenmis" ? 0.52 : tower.ownerId === this.localSessionId ? 1 : 0.78);
      rendered.halo.setVisible(tower.status !== "Tukenmis" && tower.status !== "Hararet");
      this.renderTowerSpriteEffects(rendered.effect, tower);
      rendered.status.setVisible(Boolean(tower.status));
      rendered.range.setVisible(tower.id === this.selectedPlacedTowerId);
      rendered.isolation.setVisible(tower.id === this.selectedPlacedTowerId && tower.definitionId === "warrior-3");
      this.updateServerLinkHighlight(rendered.linkHighlight, tower);
    }
  }

  private updateServerLinkHighlight(highlight: Phaser.GameObjects.Arc, tower: TowerSnapshot) {
    const selectedTower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    const isLinkedToSelectedServer = Boolean(
      selectedTower?.definitionId === "warrior-2" &&
      selectedTower.linkedTowerIds?.includes(tower.id)
    );

    if (!isLinkedToSelectedServer) {
      highlight.setVisible(false);
      return;
    }

    const pulse = 0.5 + Math.sin(performance.now() / 140) * 0.18;
    const cellSize = this.getMapCellSize();
    highlight
      .setVisible(true)
      .setRadius(Math.max(14, cellSize * 0.8) + pulse * Math.max(2, cellSize * 0.08))
      .setFillStyle(0x22d3ee, 0.12 + pulse * 0.12)
      .setStrokeStyle(3, 0xfacc15, 0.72 + pulse * 0.22);
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

  private drawIsolationGrid(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    const cellSize = this.getMapCellSize();
    const halfSize = cellSize * 1.5;
    const left = x - halfSize;
    const top = y - halfSize;
    graphics.clear();
    graphics.fillStyle(0xf97316, 0.08);
    graphics.fillRect(left, top, cellSize * 3, cellSize * 3);
    graphics.lineStyle(2, 0xf97316, 0.82);
    graphics.strokeRect(left, top, cellSize * 3, cellSize * 3);
    graphics.lineStyle(1, 0xfbbf24, 0.48);
    for (let index = 1; index < 3; index += 1) {
      graphics.lineBetween(left + index * cellSize, top, left + index * cellSize, top + cellSize * 3);
      graphics.lineBetween(left, top + index * cellSize, left + cellSize * 3, top + index * cellSize);
    }
  }

  private renderTowerSpriteEffects(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    graphics.clear();
    this.renderZeynepCommandTowerEffect(graphics, tower);
    this.renderZeynepFormationEffect(graphics, tower);
    this.renderServerLinkCodeEffect(graphics, tower);
    this.renderDebugLaserLevelPrism(graphics, tower);
    this.renderUcubeWaveEffect(graphics, tower);
  }

  private renderZeynepCommandTowerEffect(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.status === "Hararet" || tower.status === "Tukenmis") {
      return;
    }

    const commands = this.zeynepCommandEffects;
    if (!commands?.haste && !commands?.range) {
      return;
    }

    const phase = (performance.now() % 1000) / 1000;
    const cellSize = this.getMapCellSize();
    const spriteRadius = Math.max(20, cellSize * 1.12) / 2;
    const lineScale = spriteRadius / 26;
    const drawCommandRing = (type: "haste" | "range", effect: NonNullable<GameSnapshot["zeynepCommands"]>["haste"], radiusOffset: number) => {
      if (!effect) {
        return;
      }

      const tierLevel = getZeynepCommandTierLevel(effect.tier);
      const palette = getZeynepCommandPalette(type, tierLevel);
      const scaledOffset = radiusOffset * lineScale;
      const radius = spriteRadius + 1.5 * lineScale + scaledOffset + tierLevel * 0.5 * lineScale;
      const pulse = 0.7 + Math.sin((phase + radiusOffset * 0.07) * Math.PI * 2) * 0.22;
      graphics.lineStyle((1.5 + tierLevel * 0.35) * lineScale, palette.primary, 0.32 + pulse * 0.28);
      graphics.strokeCircle(tower.x, tower.y, radius);
      graphics.lineStyle(Math.max(0.7, lineScale), palette.secondary, 0.35 + pulse * 0.22);
      graphics.strokeCircle(tower.x, tower.y, radius + 2.2 * lineScale);

      const marks = tierLevel + 2;
      for (let index = 0; index < marks; index += 1) {
        const angle = phase * Math.PI * 2 * (type === "haste" ? 1.7 : -0.65) + index * (Math.PI * 2 / marks);
        const inner = radius - 2 * lineScale;
        const outer = radius + 4 * lineScale;
        const x1 = tower.x + Math.cos(angle) * inner;
        const y1 = tower.y + Math.sin(angle) * inner;
        const x2 = tower.x + Math.cos(angle + (type === "haste" ? 0.18 : 0.04)) * outer;
        const y2 = tower.y + Math.sin(angle + (type === "haste" ? 0.18 : 0.04)) * outer;
        graphics.lineStyle((type === "haste" ? 2 : 1.5) * lineScale, index % 2 === 0 ? palette.accent : palette.primary, 0.72);
        graphics.lineBetween(x1, y1, x2, y2);
      }

      if (type === "range") {
        graphics.fillStyle(palette.primary, 0.08 + tierLevel * 0.025);
        graphics.fillCircle(tower.x, tower.y, radius + 2.8 * lineScale);
      }
    };

    drawCommandRing("range", commands.range, 0);
    drawCommandRing("haste", commands.haste, commands.range ? 3 : 0);
  }

  private renderZeynepFormationEffect(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    const formationSize = tower.zeynepFormationSize ?? 0;
    if (tower.characterId !== "zeynep" || formationSize < 2 || tower.status === "Hararet" || tower.status === "Tukenmis") {
      return;
    }

    const phase = (Date.now() % 1000) / 1000;
    const pulse = 0.7 + Math.sin(phase * Math.PI * 2) * 0.18;
    const primary = formationSize === 3 ? 0xfdf2f8 : 0xf9a8d4;
    const secondary = formationSize === 3 ? 0xdb2777 : 0x0ea5e9;

    const neighbors = Array.from(this.towerSnapshots.values()).filter((candidate) => (
      candidate.id > tower.id &&
      candidate.characterId === "zeynep" &&
      (candidate.zeynepFormationSize ?? 0) === formationSize &&
      areFormationNeighbors(tower, candidate, this.getMapCellSize())
    ));

    for (const neighbor of neighbors) {
      const lineScale = Math.max(0.55, this.getMapCellSize() / TOWER_GRID_SIZE);
      graphics.lineStyle(4 * lineScale, secondary, 0.16 + pulse * 0.08);
      graphics.lineBetween(tower.x, tower.y, neighbor.x, neighbor.y);
      graphics.lineStyle(2 * lineScale, primary, 0.5 + pulse * 0.18);
      graphics.lineBetween(tower.x, tower.y, neighbor.x, neighbor.y);
      const midX = (tower.x + neighbor.x) / 2;
      const midY = (tower.y + neighbor.y) / 2;
      graphics.fillStyle(primary, 0.82);
      graphics.fillCircle(midX, midY, (formationSize === 3 ? 3 : 2.5) * lineScale);
    }
  }

  private renderDebugLaserLevelPrism(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.definitionId !== "warrior-5" || tower.level < 5 || tower.status === "Hararet" || tower.status === "Tukenmis") {
      return;
    }

    const isMaxTier = tower.level >= 10;
    const color = isMaxTier ? 0xffffff : 0xfacc15;
    const glow = isMaxTier ? 0xbae6fd : 0xfbbf24;
    const phase = (Date.now() % 900) / 900;
    const pulse = 0.72 + Math.sin(phase * Math.PI * 2) * 0.12;
    const prismScale = Math.max(20, this.getMapCellSize() * 1.12) / 52;

    graphics.fillStyle(color, isMaxTier ? 0.9 : 0.82);
    graphics.beginPath();
    graphics.moveTo(tower.x, tower.y - 11 * prismScale);
    graphics.lineTo(tower.x + 10 * prismScale, tower.y + 7 * prismScale);
    graphics.lineTo(tower.x - 10 * prismScale, tower.y + 7 * prismScale);
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle((isMaxTier ? 2 : 1.5) * prismScale, glow, pulse);
    graphics.beginPath();
    graphics.moveTo(tower.x, tower.y - 13 * prismScale);
    graphics.lineTo(tower.x + 12 * prismScale, tower.y + 8 * prismScale);
    graphics.lineTo(tower.x - 12 * prismScale, tower.y + 8 * prismScale);
    graphics.closePath();
    graphics.strokePath();

    if (isMaxTier) {
      graphics.lineStyle(Math.max(0.7, prismScale), 0xffffff, 0.65);
      graphics.lineBetween(tower.x - 7 * prismScale, tower.y, tower.x + 7 * prismScale, tower.y);
      graphics.lineBetween(tower.x, tower.y - 8 * prismScale, tower.x, tower.y + 6 * prismScale);
    }
  }

  private renderServerLinkCodeEffect(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    const linkAge = tower.serverLinkWaveAge ?? 0;
    if (linkAge < 5 || tower.status === "Hararet" || tower.status === "Tukenmis") {
      return;
    }

    const effectScale = this.getTowerEffectScale();
    const isMaxHealthTier = linkAge >= 10;
    const phase = (Date.now() % 1200) / 1200;
    const columns = isMaxHealthTier ? 5 : 4;
    const rows = isMaxHealthTier ? 5 : 4;
    const primary = isMaxHealthTier ? 0xd8b4fe : 0x22d3ee;
    const secondary = isMaxHealthTier ? 0xfacc15 : 0x22c55e;
    const alpha = isMaxHealthTier ? 0.86 : 0.62;
    const radiusLimit = 15.5 * effectScale;
    const span = 22 * effectScale;
    const rowStep = 6 * effectScale;
    const rectWidth = Math.max(1, 2 * effectScale);
    const rectHeight = Math.max(2, 4 * effectScale);

    graphics.fillStyle(0x020617, isMaxHealthTier ? 0.22 : 0.16);
    graphics.fillCircle(tower.x, tower.y, radiusLimit);

    for (let column = 0; column < columns; column += 1) {
      const x = tower.x - span / 2 + column * (span / Math.max(1, columns - 1));
      const columnOffset = (phase * rows + column * 0.7) % rows;
      for (let row = 0; row < rows; row += 1) {
        const y = tower.y - 12 * effectScale + ((row + columnOffset) % rows) * rowStep;
        if (Phaser.Math.Distance.Between(tower.x, tower.y, x, y) > radiusLimit) {
          continue;
        }
        const isAccent = (row + column + Math.floor(phase * 10)) % 3 === 0;
        const color = isAccent ? secondary : primary;
        const glyphAlpha = alpha * (isAccent ? 1 : 0.7);
        graphics.fillStyle(color, glyphAlpha);
        graphics.fillRect(x - rectWidth / 2, y - rectHeight / 2, rectWidth, rectHeight);
      }
    }

    graphics.lineStyle((isMaxHealthTier ? 1.6 : 1.1) * effectScale, primary, isMaxHealthTier ? 0.8 : 0.52);
    graphics.strokeCircle(tower.x, tower.y, radiusLimit);
    if (isMaxHealthTier) {
      graphics.lineStyle(Math.max(0.7, effectScale), secondary, 0.7);
      graphics.beginPath();
      graphics.moveTo(tower.x - 10 * effectScale, tower.y + 8 * effectScale);
      graphics.lineTo(tower.x - 2 * effectScale, tower.y + 12 * effectScale);
      graphics.lineTo(tower.x + 10 * effectScale, tower.y - 8 * effectScale);
      graphics.strokePath();
    }
  }

  private renderUcubeWaveEffect(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    const bonusLevel = tower.waveBonusLevel ?? 0;
    if (tower.definitionId !== "warrior-6" || bonusLevel < 4 || tower.status === "Hararet" || tower.status === "Tukenmis") {
      return;
    }

    const waveCount = bonusLevel >= 5 ? 4 : 2;
    const phase = (Date.now() % 900) / 900;
    const effectScale = this.getTowerEffectScale();
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex += 1) {
      const radius = (11.5 + waveIndex * 1.6) * effectScale;
      const segments = 10 + waveIndex * 2;
      const offset = phase * Math.PI * 2 + waveIndex * 0.85;
      graphics.lineStyle((waveIndex % 2 === 0 ? 1.5 : 1) * effectScale, 0xffffff, bonusLevel >= 5 ? 0.86 : 0.66);
      graphics.beginPath();
      for (let pointIndex = 0; pointIndex <= segments; pointIndex += 1) {
        const angle = offset + (pointIndex / segments) * Math.PI * 2;
        const jag = (pointIndex % 2 === 0 ? 2.2 : -1.5) * effectScale;
        const clampedRadius = Phaser.Math.Clamp(radius + jag, 8 * effectScale, 18 * effectScale);
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
      sprite.setScale(this.getTowerEffectScale());
    }
  }

  private renderDrones(drones: DroneSnapshot[]) {
    const activeIds = new Set(drones.map((drone) => drone.id));

    for (const [id, sprite] of this.drones) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.drones.delete(id);
      }
    }

    const pulse = 1 + Math.sin(Date.now() / 90) * 0.08;
    for (const drone of drones) {
      const texture = drone.mode === "repair" ? "drone-repair" : "drone-attack";
      let sprite = this.drones.get(drone.id);
      if (!sprite) {
        sprite = this.physics.add.sprite(drone.x, drone.y, texture);
        sprite.setActive(true).setVisible(true).setDepth(42);
        if (sprite.body) {
          sprite.body.enable = false;
        }
        this.drones.set(drone.id, sprite);
      }

      if (sprite.texture.key !== texture) {
        sprite.setTexture(texture);
      }
      const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, drone.x, drone.y);
      if (Number.isFinite(angle)) {
        sprite.setRotation(angle);
      }
      sprite.setPosition(drone.x, drone.y);
      sprite.setScale(drone.mode === "attack" ? 1.55 * pulse : 1.38 * pulse);
      sprite.setAlpha(drone.mode === "attack" ? 1 : 0.95);
      sprite.setBlendMode(Phaser.BlendModes.ADD);
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

      if (!event.ownerId) {
        continue;
      }

      const ownerKillTimes = [
        ...(this.killStreakTimesByOwner.get(event.ownerId) ?? []),
        event.serverTime
      ].filter((time) => event.serverTime - time <= this.killStreakMaxWindowMs);
      this.killStreakTimesByOwner.set(event.ownerId, ownerKillTimes);

      const streakRule = this.getTriggeredKillStreakRule(event.ownerId, event.serverTime, snapshot.team.wave);
      if (streakRule) {
        const ownerLocks = this.getKillStreakLocks(event.ownerId);
        for (const rule of KILL_STREAK_RULES) {
          if (rule.kills <= streakRule.kills) {
            ownerLocks.set(rule.tier, {
              unlockAt: event.serverTime + KILL_STREAK_RETRIGGER_LOCK_MS,
              wave: snapshot.team.wave
            });
          }
        }
        const ownerPlayer = snapshot.players.find((candidate) => candidate.id === event.ownerId);
        this.playKillStreakAnnouncement(streakRule);
        this.showKillStreakAnnouncement(ownerPlayer, streakRule);
      }
    }
  }

  private getTriggeredKillStreakRule(ownerId: string, serverTime: number, wave: number) {
    const ownerKillTimes = this.killStreakTimesByOwner.get(ownerId) ?? [];
    const ownerLocks = this.getKillStreakLocks(ownerId);
    return KILL_STREAK_RULES.find((rule) => {
      const lock = ownerLocks.get(rule.tier);
      if (lock && lock.wave === wave && serverTime < lock.unlockAt) {
        return false;
      }

      return ownerKillTimes.filter((time) => serverTime - time <= rule.windowMs).length >= rule.kills;
    });
  }

  private getKillStreakLocks(ownerId: string) {
    let locks = this.killStreakLocksByOwner.get(ownerId);
    if (!locks) {
      locks = new Map<KillStreakTier, KillStreakLock>();
      this.killStreakLocksByOwner.set(ownerId, locks);
    }
    return locks;
  }

  private playKillStreakAnnouncement(rule: KillStreakRule) {
    const sounds = this.killStreakSounds[rule.tier];
    if (sounds.length === 0) {
      return;
    }

    const audio = Phaser.Utils.Array.GetRandom(sounds);
    audio.pause();
    audio.currentTime = 0;
    audio.volume = this.voiceVolume;
    void audio.play().catch(() => {
      // Mobile browsers may block audio until the first real touch; the next streak can retry.
    });
  }

  private showKillStreakAnnouncement(player: GameSnapshot["players"][number] | undefined, rule: KillStreakRule) {
    this.rampageContainer?.destroy(true);

    const characterId = player?.characterId ?? this.selectedCharacterId;
    const characterName = characters.find((character) => character.id === characterId)?.displayName ?? this.selectedCharacter.displayName;
    const message = `${characterName}! ${rule.label}!`;
    const theme = getKillStreakVisualTheme(characterId, rule);
    if (theme.style === "command") {
      this.showCommandKillStreakAnnouncement(message, rule, theme);
      return;
    }

    const fontSize = message.length > 21 ? "24px" : message.length > 17 ? "27px" : "31px";
    const container = this.add.container(GAME_WORLD_WIDTH / 2, -78).setDepth(80).setAlpha(0);
    const plate = this.add.graphics();
    const width = rule.chaos >= 4 ? 214 : rule.chaos >= 2 ? 196 : 178;
    const height = rule.chaos >= 4 ? 38 : 32;

    plate.fillStyle(theme.fill, 0.92);
    plate.fillPoints([
      new Phaser.Geom.Point(-width, -height + 4),
      new Phaser.Geom.Point(width - 18, -height - 4 - rule.chaos * 2),
      new Phaser.Geom.Point(width + 8, -5),
      new Phaser.Geom.Point(width - 22, height),
      new Phaser.Geom.Point(-width + 12, height - 6),
      new Phaser.Geom.Point(-width - 8, -8)
    ], true);
    plate.lineStyle(2 + rule.chaos, theme.primary, 0.95);
    plate.strokePoints([
      new Phaser.Geom.Point(-width, -height + 4),
      new Phaser.Geom.Point(width - 18, -height - 4 - rule.chaos * 2),
      new Phaser.Geom.Point(width + 8, -5),
      new Phaser.Geom.Point(width - 22, height),
      new Phaser.Geom.Point(-width + 12, height - 6),
      new Phaser.Geom.Point(-width - 8, -8)
    ], true);
    plate.lineStyle(2, theme.secondary, 0.9);
    plate.lineBetween(-width + 30, height - 8, -width + 98, -height + 8);
    plate.lineBetween(width - 86, -height, width - 10, height - 10);
    plate.lineStyle(2, theme.accent, 0.9);
    plate.lineBetween(-width + 8, -5, -width + 56, height - 6);
    plate.lineBetween(44, height - 4, 108 + rule.chaos * 6, -height + 4);
    if (rule.chaos >= 3) {
      plate.lineStyle(2, theme.primary, 0.75);
      plate.lineBetween(-44, -height - 8, -12, height + 8);
      plate.lineBetween(136, -height - 6, 178, height + 4);
    }
    if (rule.chaos >= 4) {
      plate.lineStyle(2, 0xffffff, 0.85);
      plate.lineBetween(-196, -height - 10, -148, height + 12);
      plate.lineBetween(2, -height - 12, 52, height + 12);
      plate.lineBetween(172, -height - 8, 214, height + 8);
    }

    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "Impact, Arial Black, Arial",
      fontSize,
      fontStyle: "bold",
      color: theme.textColor,
      stroke: theme.strokeColor,
      strokeThickness: 8
    };
    const cyanGhost = this.add.text(4 + rule.chaos, 3, message, {
      ...baseStyle,
      color: toCssColor(theme.secondary),
      stroke: "#111827",
      strokeThickness: 5
    }).setOrigin(0.5).setAngle(-2 - rule.chaos * 0.45).setAlpha(0.68 + rule.chaos * 0.04);
    const redGhost = this.add.text(-4 - rule.chaos, -2, message, {
      ...baseStyle,
      color: toCssColor(theme.primary),
      stroke: "#450a0a",
      strokeThickness: 5
    }).setOrigin(0.5).setAngle(1.5 + rule.chaos * 0.5).setAlpha(0.74 + rule.chaos * 0.04);
    const mainText = this.add.text(0, 0, message, {
      ...baseStyle,
      color: theme.textColor,
      stroke: toCssColor(theme.fill),
      strokeThickness: 7
    }).setOrigin(0.5).setAngle(rule.chaos >= 4 ? -2 : -1);
    const motifText = this.add.text(-width + 28, -height + 8, theme.motif, {
      fontFamily: "Arial Black, Arial",
      fontSize: "11px",
      color: toCssColor(theme.accent),
      stroke: "#020617",
      strokeThickness: 3
    }).setOrigin(0, 0.5).setAlpha(0.78);

    container.add([plate, cyanGhost, redGhost, mainText, motifText]);
    this.rampageContainer = container;

    this.tweens.add({
      targets: container,
      y: 86,
      alpha: 1,
      duration: Math.max(150, 260 - rule.chaos * 22),
      ease: "Back.easeOut"
    });
    this.tweens.add({
      targets: container,
      angle: { from: -1.5 - rule.chaos * 0.8, to: 1.5 + rule.chaos * 0.8 },
      duration: Math.max(42, 92 - rule.chaos * 10),
      yoyo: true,
      repeat: 5 + rule.chaos * 4,
      ease: "Sine.easeInOut"
    });
    if (rule.chaos >= 2) {
      this.tweens.add({
        targets: [cyanGhost, redGhost],
        x: `+=${rule.chaos * 3}`,
        yoyo: true,
        repeat: 8 + rule.chaos * 3,
        duration: 45,
        ease: "Stepped"
      });
    }
    if (rule.chaos >= 4) {
      this.tweens.add({
        targets: mainText,
        scaleX: { from: 1.05, to: 1.16 },
        scaleY: { from: 0.92, to: 1.08 },
        yoyo: true,
        repeat: 14,
        duration: 58,
        ease: "Sine.easeInOut"
      });
    }
    this.tweens.add({
      targets: container,
      y: 56,
      alpha: 0,
      delay: 2100 + rule.chaos * 260,
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

  private showCommandKillStreakAnnouncement(message: string, rule: KillStreakRule, theme: KillStreakVisualTheme) {
    const fontSize = message.length > 21 ? "25px" : message.length > 17 ? "29px" : "33px";
    const container = this.add.container(GAME_WORLD_WIDTH / 2, -104).setDepth(84).setAlpha(0);
    const plate = this.add.graphics();
    const width = rule.chaos >= 4 ? 232 : 214;
    const height = rule.chaos >= 4 ? 48 : 42;
    const topY = -height - 56;

    const drawBentFingerSegment = (
      from: Phaser.Geom.Point,
      to: Phaser.Geom.Point,
      startWidth: number,
      endWidth: number,
      fillColor: number,
      edgeColor: number
    ) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;

      plate.fillStyle(0x030712, 0.7);
      plate.fillPoints([
        new Phaser.Geom.Point(from.x + nx * (startWidth + 3), from.y + ny * (startWidth + 3)),
        new Phaser.Geom.Point(from.x - nx * (startWidth + 3), from.y - ny * (startWidth + 3)),
        new Phaser.Geom.Point(to.x - nx * (endWidth + 3), to.y - ny * (endWidth + 3)),
        new Phaser.Geom.Point(to.x + nx * (endWidth + 3), to.y + ny * (endWidth + 3))
      ], true);
      plate.fillStyle(fillColor, 0.96);
      plate.fillPoints([
        new Phaser.Geom.Point(from.x + nx * startWidth, from.y + ny * startWidth),
        new Phaser.Geom.Point(from.x - nx * startWidth, from.y - ny * startWidth),
        new Phaser.Geom.Point(to.x - nx * endWidth, to.y - ny * endWidth),
        new Phaser.Geom.Point(to.x + nx * endWidth, to.y + ny * endWidth)
      ], true);
      plate.fillCircle(to.x, to.y, endWidth);
      plate.lineStyle(2, edgeColor, 0.8);
      plate.lineBetween(from.x + nx * startWidth, from.y + ny * startWidth, to.x + nx * endWidth, to.y + ny * endWidth);
      plate.lineBetween(from.x - nx * startWidth, from.y - ny * startWidth, to.x - nx * endWidth, to.y - ny * endWidth);
      plate.lineStyle(1, 0xffffff, 0.24);
      plate.lineBetween(from.x + nx * startWidth * 0.28, from.y + ny * startWidth * 0.28, to.x + nx * endWidth * 0.15, to.y + ny * endWidth * 0.15);
    };

    const drawGraffitiFinger = (baseX: number, baseY: number, mirror: 1 | -1, length: number, width: number, curl: number, color: number, index: number) => {
      const root = new Phaser.Geom.Point(baseX, baseY);
      const first = new Phaser.Geom.Point(baseX + mirror * curl * 0.22, baseY + length * 0.3);
      const second = new Phaser.Geom.Point(baseX + mirror * curl * 0.62, baseY + length * 0.62);
      const tip = new Phaser.Geom.Point(baseX + mirror * curl * 1.18, baseY + length * 0.9);
      const fillColor = index % 2 === 0 ? 0x180f24 : 0x211329;
      const shadowColor = index % 2 === 0 ? theme.secondary : theme.primary;

      drawBentFingerSegment(root, first, width * 0.55, width * 0.5, fillColor, shadowColor);
      drawBentFingerSegment(first, second, width * 0.5, width * 0.42, fillColor, shadowColor);
      drawBentFingerSegment(second, tip, width * 0.42, width * 0.34, fillColor, shadowColor);

      plate.fillStyle(0x0a0f1f, 0.78);
      plate.fillEllipse(first.x, first.y, width * 1.05, width * 0.55);
      plate.fillEllipse(second.x, second.y, width * 0.9, width * 0.5);
      plate.lineStyle(1.6, theme.accent, 0.66);
      plate.lineBetween(first.x - mirror * width * 0.38, first.y, first.x + mirror * width * 0.38, first.y + 1);
      plate.lineBetween(second.x - mirror * width * 0.32, second.y, second.x + mirror * width * 0.32, second.y + 1);
      plate.fillStyle(0xc7b6a5, 0.42);
      plate.fillEllipse(tip.x - mirror * 1.5, tip.y - 1, width * 0.38, width * 0.24);
      plate.lineStyle(1, 0xf8fafc, 0.22);
      plate.strokeEllipse(tip.x - mirror * 1.5, tip.y - 1, width * 0.38, width * 0.24);
      plate.lineStyle(1, 0xffffff, 0.18);
      plate.lineBetween(root.x + mirror * width * 0.18, root.y + 5, second.x + mirror * width * 0.08, second.y - 4);
    };

    const drawGraffitiHand = (centerX: number, mirror: 1 | -1) => {
      const palmY = topY - 18;
      const palmWidth = 96;
      const palmPoints = [
        new Phaser.Geom.Point(centerX - mirror * palmWidth * 0.54, palmY + 18),
        new Phaser.Geom.Point(centerX - mirror * palmWidth * 0.32, palmY - 10),
        new Phaser.Geom.Point(centerX + mirror * palmWidth * 0.4, palmY - 8),
        new Phaser.Geom.Point(centerX + mirror * palmWidth * 0.54, palmY + 18),
        new Phaser.Geom.Point(centerX + mirror * palmWidth * 0.3, palmY + 31),
        new Phaser.Geom.Point(centerX - mirror * palmWidth * 0.42, palmY + 31)
      ];
      plate.fillStyle(0x030712, 0.82);
      plate.fillPoints(palmPoints, true);
      plate.fillStyle(0x120b1d, 0.86);
      plate.fillEllipse(centerX, palmY + 18, palmWidth * 0.72, 34);
      plate.lineStyle(3, theme.primary, 0.5);
      plate.strokePoints(palmPoints, true);
      plate.lineStyle(1.6, theme.secondary, 0.48);
      plate.lineBetween(centerX - mirror * 31, palmY + 13, centerX + mirror * 31, palmY + 11);
      plate.lineBetween(centerX - mirror * 25, palmY + 24, centerX + mirror * 23, palmY + 21);

      const fingers = [
        { offset: -36, length: 58, width: 13, curl: -18, rootY: 34 },
        { offset: -17, length: 86, width: 15, curl: -12, rootY: 27 },
        { offset: 2, length: 94, width: 16, curl: 0, rootY: 24 },
        { offset: 21, length: 84, width: 14, curl: 12, rootY: 27 },
        { offset: 39, length: 60, width: 12, curl: 18, rootY: 34 }
      ];
      fingers.forEach((finger, index) => {
        drawGraffitiFinger(
          centerX + mirror * finger.offset,
          palmY + finger.rootY,
          mirror,
          finger.length + rule.chaos * 1.6,
          finger.width,
          finger.curl,
          index % 2 === 0 ? theme.secondary : theme.primary,
          index
        );
      });
    };

    plate.lineStyle(5 + rule.chaos, theme.primary, 0.16);
    plate.beginPath();
    plate.moveTo(-width - 28, height + 8);
    plate.lineTo(width + 34, -height - 18);
    plate.strokePath();
    plate.lineStyle(4 + rule.chaos, theme.secondary, 0.18);
    plate.beginPath();
    plate.moveTo(-width - 18, -height - 18);
    plate.lineTo(width + 26, height + 10);
    plate.strokePath();
    plate.lineStyle(3, theme.accent, 0.5);
    plate.lineBetween(-width + 12, -height - 12, -width + 82, height + 16);
    plate.lineBetween(width - 118, -height - 14, width - 24, height + 18);
    plate.lineBetween(-48, -height - 18, 42, height + 20);

    plate.fillStyle(theme.fill, 0.92);
    plate.fillPoints([
      new Phaser.Geom.Point(-width - 12, -height + 4),
      new Phaser.Geom.Point(-width + 28, -height - 18 - rule.chaos),
      new Phaser.Geom.Point(-52, -height - 8),
      new Phaser.Geom.Point(-24, -height - 22),
      new Phaser.Geom.Point(width - 16, -height - 12),
      new Phaser.Geom.Point(width + 18, -8),
      new Phaser.Geom.Point(width - 18, height + 10),
      new Phaser.Geom.Point(76, height + 2),
      new Phaser.Geom.Point(44, height + 18),
      new Phaser.Geom.Point(-width + 20, height + 6),
      new Phaser.Geom.Point(-width - 18, -6)
    ], true);
    plate.lineStyle(3 + rule.chaos, theme.secondary, 0.96);
    plate.strokePoints([
      new Phaser.Geom.Point(-width - 12, -height + 4),
      new Phaser.Geom.Point(-width + 28, -height - 18 - rule.chaos),
      new Phaser.Geom.Point(-52, -height - 8),
      new Phaser.Geom.Point(-24, -height - 22),
      new Phaser.Geom.Point(width - 16, -height - 12),
      new Phaser.Geom.Point(width + 18, -8),
      new Phaser.Geom.Point(width - 18, height + 10),
      new Phaser.Geom.Point(76, height + 2),
      new Phaser.Geom.Point(44, height + 18),
      new Phaser.Geom.Point(-width + 20, height + 6),
      new Phaser.Geom.Point(-width - 18, -6)
    ], true);
    plate.lineStyle(2, theme.primary, 0.9);
    plate.lineBetween(-width + 24, height - 4, -width + 112, -height + 6);
    plate.lineBetween(width - 120, -height - 4, width - 26, height - 12);
    plate.lineStyle(2, theme.accent, 0.88);
    plate.lineBetween(-18, height + 14, 72 + rule.chaos * 10, -height - 16);
    plate.lineBetween(-width + 8, -8, -width + 64, height + 8);
    if (rule.chaos >= 3) {
      plate.lineStyle(2, 0xffffff, 0.78);
      plate.lineBetween(-168, -height - 20, -128, height + 18);
      plate.lineBetween(4, -height - 22, 54, height + 18);
      plate.lineBetween(156, -height - 16, 210, height + 14);
    }

    const handsImage = this.add.image(0, -70, "zeynep-puppet-hands")
      .setDisplaySize(390, 260)
      .setAlpha(0.92)
      .setBlendMode(Phaser.BlendModes.NORMAL);

    const commandText = this.add.text(0, -height - 8, theme.motif, {
      fontFamily: "Arial Black, Arial",
      fontSize: "10px",
      color: toCssColor(theme.accent),
      stroke: "#020617",
      strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0.95).setAngle(-1);
    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "Impact, Arial Black, Arial",
      fontSize,
      fontStyle: "bold",
      color: theme.textColor,
      stroke: theme.strokeColor,
      strokeThickness: 8
    };
    const cyanGhost = this.add.text(6 + rule.chaos, 5, message, {
      ...baseStyle,
      color: toCssColor(theme.secondary),
      stroke: "#082f49",
      strokeThickness: 5
    }).setOrigin(0.5).setAngle(-3 - rule.chaos * 0.5).setAlpha(0.8);
    const pinkGhost = this.add.text(-5 - rule.chaos, -4, message, {
      ...baseStyle,
      color: toCssColor(theme.primary),
      stroke: "#4a044e",
      strokeThickness: 5
    }).setOrigin(0.5).setAngle(2 + rule.chaos * 0.45).setAlpha(0.72);
    const mainText = this.add.text(0, 0, message, {
      ...baseStyle,
      color: theme.textColor,
      stroke: toCssColor(theme.fill),
      strokeThickness: 7
    }).setOrigin(0.5).setAngle(rule.chaos >= 4 ? -2.5 : -1.5);
    const crownText = this.add.text(0, topY + 18, "|||||  CONTROL  |||||", {
      fontFamily: "Arial Black, Arial",
      fontSize: "10px",
      color: toCssColor(theme.secondary),
      stroke: "#020617",
      strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0.72);

    container.add([plate, handsImage, cyanGhost, pinkGhost, mainText, commandText, crownText]);
    this.rampageContainer = container;
    this.tweens.add({
      targets: container,
      y: 104,
      alpha: 1,
      duration: Math.max(150, 250 - rule.chaos * 18),
      ease: "Back.easeOut"
    });
    this.tweens.add({
      targets: container,
      angle: { from: -1.8 - rule.chaos * 0.6, to: 1.8 + rule.chaos * 0.6 },
      yoyo: true,
      repeat: 6 + rule.chaos * 4,
      duration: Math.max(44, 86 - rule.chaos * 8),
      ease: "Sine.easeInOut"
    });
    this.tweens.add({
      targets: [cyanGhost, pinkGhost],
      x: `+=${rule.chaos * 4}`,
      yoyo: true,
      repeat: 10 + rule.chaos * 4,
      duration: 42,
      ease: "Stepped"
    });
    this.tweens.add({
      targets: crownText,
      y: `+=${4 + rule.chaos}`,
      alpha: { from: 0.42, to: 0.92 },
      yoyo: true,
      repeat: 9 + rule.chaos * 3,
      duration: 72,
      ease: "Sine.easeInOut"
    });
    if (rule.chaos >= 4) {
      this.tweens.add({
        targets: mainText,
        scaleX: { from: 1.04, to: 1.17 },
        scaleY: { from: 0.92, to: 1.1 },
        yoyo: true,
        repeat: 14,
        duration: 56,
        ease: "Sine.easeInOut"
      });
    }
    this.tweens.add({
      targets: container,
      y: 70,
      alpha: 0,
      delay: 2200 + rule.chaos * 280,
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
      } else if (beam.definitionId === "zeynep-2" || beam.definitionId === "zeynep-3" || beam.definitionId === "zeynep-3-ray" || beam.definitionId === "zeynep-3-burn") {
        this.drawShowcaseBeam(beam, color);
      } else if (beam.definitionId === "zeynep-3-burn-trail") {
        this.drawSynthesisBurnTrail(beam, color);
      } else if (beam.definitionId === "warrior-6") {
        this.drawChainLightning(beam, color);
      } else {
        this.drawLaserConnection(beam, color);
      }
    }
  }

  private drawShowcaseBeam(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 130) / 260, 0, 1);
    const flash = Phaser.Math.Clamp((life - 0.22) / 0.78, 0, 1);
    const afterglow = Phaser.Math.Clamp(life / 0.82, 0, 1);
    const pulse = 0.9 + Math.sin(Date.now() / 34) * 0.08;

    const fillBeamBand = (width: number, bandColor: number, alpha: number, inset = 0) => {
      const startX = beam.x1 + ux * inset;
      const startY = beam.y1 + uy * inset;
      const endX = beam.x2 - ux * inset;
      const endY = beam.y2 - uy * inset;
      const clampedWidth = Math.min(width, beam.width);
      const halfStart = clampedWidth * 0.42;
      const halfMid = width * 0.5;
      const halfEnd = clampedWidth * 0.42;
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;

      this.beamGraphics?.fillStyle(bandColor, alpha * pulse);
      this.beamGraphics?.fillPoints([
        new Phaser.Geom.Point(startX + nx * halfStart, startY + ny * halfStart),
        new Phaser.Geom.Point(midX + nx * halfMid, midY + ny * halfMid),
        new Phaser.Geom.Point(endX + nx * halfEnd, endY + ny * halfEnd),
        new Phaser.Geom.Point(endX - nx * halfEnd, endY - ny * halfEnd),
        new Phaser.Geom.Point(midX - nx * halfMid, midY - ny * halfMid),
        new Phaser.Geom.Point(startX - nx * halfStart, startY - ny * halfStart)
      ], true);
      this.beamGraphics?.fillCircle(startX, startY, halfStart);
      this.beamGraphics?.fillCircle(endX, endY, halfEnd);
    };

    fillBeamBand(beam.width, color, 0.2 * afterglow);
    fillBeamBand(beam.width * 0.74, 0xf0abfc, 0.36 * afterglow, 2);
    fillBeamBand(beam.width * 0.48, 0xfdf2f8, 0.62 * flash + 0.18 * afterglow, 5);
    fillBeamBand(beam.width * 0.24, 0xffffff, 0.96 * flash, 8);

    for (let index = 0; index < 7; index += 1) {
      const t = (index + 1) / 8;
      const hash = Math.sin((beam.id.length + index * 17) * 23.91) * 43758.5453;
      const normalizedHash = hash - Math.floor(hash);
      const side = index % 2 === 0 ? 1 : -1;
      const centerX = beam.x1 + dx * t;
      const centerY = beam.y1 + dy * t;
      const halfHeight = beam.width * (0.18 + normalizedHash * 0.18);
      const halfLength = 3 + normalizedHash * 7;
      const offset = side * Math.min(beam.width * 0.28, beam.width * (0.12 + normalizedHash * 0.16));
      this.beamGraphics.fillStyle(index % 3 === 0 ? 0xffffff : 0xfdf2f8, 0.5 * flash);
      this.beamGraphics.fillPoints([
        new Phaser.Geom.Point(centerX - ux * halfLength + nx * offset, centerY - uy * halfLength + ny * offset),
        new Phaser.Geom.Point(centerX + nx * (offset + side * halfHeight), centerY + ny * (offset + side * halfHeight)),
        new Phaser.Geom.Point(centerX + ux * halfLength + nx * offset, centerY + uy * halfLength + ny * offset),
        new Phaser.Geom.Point(centerX + nx * (offset - side * halfHeight * 0.55), centerY + ny * (offset - side * halfHeight * 0.55))
      ], true);
    }

    this.beamGraphics.fillStyle(0xffffff, 0.88 * flash);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, beam.width * 0.32);
    this.beamGraphics.fillStyle(0xfdf2f8, 0.42 * afterglow);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, beam.width * 0.28);
  }

  private drawSynthesisBurnTrail(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const life = Phaser.Math.Clamp((beam.ttlMs ?? 0) / 3000, 0, 1);
    const width = Math.max(5, beam.width * 0.34);
    this.beamGraphics.lineStyle(width + 5, 0x1c0703, 0.28 * life);
    this.beamGraphics.beginPath();
    this.beamGraphics.moveTo(beam.x1, beam.y1);
    this.beamGraphics.lineTo(beam.x2, beam.y2);
    this.beamGraphics.strokePath();
    this.beamGraphics.lineStyle(width, color, 0.36 * life);
    this.beamGraphics.beginPath();
    this.beamGraphics.moveTo(beam.x1, beam.y1);
    this.beamGraphics.lineTo(beam.x2, beam.y2);
    this.beamGraphics.strokePath();
    this.beamGraphics.lineStyle(Math.max(2, width * 0.42), 0xf97316, 0.22 * life);
    this.beamGraphics.beginPath();
    this.beamGraphics.moveTo(beam.x1, beam.y1);
    this.beamGraphics.lineTo(beam.x2, beam.y2);
    this.beamGraphics.strokePath();
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

    const visualScale = this.getTowerEffectScale();
    strokeJagged((beam.width + 10) * visualScale, color, 0.16);
    strokeJagged((beam.width + 4) * visualScale, 0xffffff, 0.58);
    strokeJagged(Math.max(1.5, (beam.width - 1) * visualScale), 0x93c5fd, 0.98);
    this.beamGraphics.fillStyle(0x67e8f9, 0.72);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 5 * visualScale);
    this.beamGraphics.fillStyle(0xffffff, 0.92);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, 4 * visualScale);
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
    const pointerCell = worldToGrid(x, y, this.selectedMapData);
    const sameCellTower = Array.from(this.towerSnapshots.values()).find((tower) => {
      const towerCell = worldToGrid(tower.x, tower.y, this.selectedMapData);
      return towerCell.col === pointerCell.col && towerCell.row === pointerCell.row;
    });
    if (sameCellTower) {
      return sameCellTower;
    }

    const hitRadius = Math.max(10, this.getMapCellSize() * 0.62);
    return Array.from(this.towerSnapshots.values())
      .map((tower) => ({
        tower,
        distanceSq: Phaser.Math.Distance.Squared(x, y, tower.x, tower.y)
      }))
      .filter((candidate) => candidate.distanceSq <= hitRadius * hitRadius)
      .sort((left, right) => left.distanceSq - right.distanceSq)[0]?.tower;
  }

  private setTowerTrayShopVisible(visible: boolean) {
    for (const item of this.towerTrayItems) {
      item.setVisible(visible);
      if (item instanceof Phaser.GameObjects.Rectangle) {
        if (visible) {
          item.setInteractive({ useHandCursor: true });
          this.input.setDraggable(item);
        } else {
          item.disableInteractive();
        }
      }
    }
    this.selectedTowerStatsText?.setVisible(!visible);
    this.selectedTowerStatsHelpText?.setVisible(!visible);
  }

  private updateSelectionUi() {
    const selectedTower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    const selectionKey = selectedTower
      ? `placed|${selectedTower.id}|${selectedTower.level}|${selectedTower.range}|${selectedTower.ownerId}|${selectedTower.status}|${selectedTower.hp}|${selectedTower.maxHp}|${selectedTower.damageDealt}|${selectedTower.currentDps}|${selectedTower.linkedTowerIds?.join(",")}`
      : `new|${this.selectedTowerDefinition.id}`;
    if (this.lastSelectionKey === selectionKey) {
      return;
    }
    this.lastSelectionKey = selectionKey;
    this.game.events.emit("tower:selected", selectedTower?.id);

    for (const [id, button] of this.towerButtons) {
      const selected = id === this.selectedTowerDefinition.id && !this.selectedPlacedTowerId;
      button.setFillStyle(selected ? 0x334155 : 0x1e293b, 1);
      button.setStrokeStyle(1, this.selectedCharacter.towers.find((tower) => tower.id === id)?.color ?? 0x94a3b8, selected ? 1 : 0.45);
    }

    if (!selectedTower) {
      this.setTowerTrayShopVisible(true);
      this.hintText?.setText(`${this.selectedTowerDefinition.name}: ${this.selectedTowerDefinition.cost}g | haritaya surukle`);
      this.upgradeText?.setText("Kule sec");
      this.upgradeButton?.setAlpha(0.6);
      this.sellText?.setText("Sat");
      this.sellButton?.setAlpha(0.42);
      return;
    }

    this.setTowerTrayShopVisible(false);
    const definition = towerCatalog[selectedTower.characterId].find((tower) => tower.id === selectedTower.definitionId);
    const cost = definition ? getTowerUpgradeCost(definition.cost, selectedTower.level, definition.id) : 0;
    const sellRefund = definition ? getTowerSellRefund(definition.cost, selectedTower.level, definition.id) : 0;
    const canUpgrade = selectedTower.ownerId === this.localSessionId && selectedTower.level < 10;
    const canSell = selectedTower.ownerId === this.localSessionId;
    const status = selectedTower.status ? ` | ${selectedTower.status}` : "";
    const linkHint = selectedTower.definitionId === "warrior-2"
      ? ` | Link ${selectedTower.linkedTowerIds?.length ?? 0}/2 icin kuleye dokun`
      : selectedTower.definitionId === "zeynep-3"
        ? " | Sentez icin 3'lu ucgen dizilim kur"
        : "";
    const hpText = selectedTower.hp && selectedTower.maxHp ? ` | HP ${selectedTower.hp}/${selectedTower.maxHp}` : "";
    const rangeText = selectedTower.definitionId === "warrior-2" ? "Global" : `${Math.round(selectedTower.range)}`;
    this.hintText?.setText(`${selectedTower.name} Lv.${selectedTower.level} | Menzil ${rangeText}${hpText}${status}${linkHint}`);
    this.selectedTowerStatsText?.setText([
      `Toplam hasar: ${Math.round(selectedTower.damageDealt ?? 0)}`,
      `Anlik DPS: ${(selectedTower.currentDps ?? 0).toFixed(1)}`,
      canUpgrade ? `Sonraki upgrade: ${cost}g` : "Sonraki upgrade: maksimum level",
      canSell ? `Satis iadesi: ${sellRefund}g` : "Satis: sadece sahibi"
    ].join("\n"));
    this.upgradeText?.setText(canUpgrade ? `Upgrade ${cost}g` : "Upgrade yok");
    this.upgradeButton?.setAlpha(canUpgrade ? 1 : 0.5);
    this.sellText?.setText(canSell ? `Sat ${sellRefund}g` : "Satilamaz");
    this.sellButton?.setAlpha(canSell ? 1 : 0.42);
  }

  private updateSkillButtons(cooldowns: number[], player?: GameSnapshot["players"][number]) {
    const reputation = player?.reputation ?? 0;
    const authorityChain = player?.authorityChain ?? 0;
    const skillKey = `${cooldowns.join("|")}|${reputation}|${authorityChain}`;
    if (this.lastSkillKey === skillKey) {
      return;
    }
    this.lastSkillKey = skillKey;

    this.updateZeynepChainPanel(player?.characterId === "zeynep", authorityChain);

    this.selectedCharacter.skills.forEach((skill, index) => {
      const cooldown = cooldowns[index] ?? 0;
      const zeynepCommand = player?.characterId === "zeynep" ? getZeynepCommandButtonState(authorityChain) : undefined;
      const canUseCommand = !zeynepCommand || reputation >= zeynepCommand.cost;
      const readyLabel = zeynepCommand ? `${skill.name}\n${zeynepCommand.label}` : skill.name;
      const isDisabled = cooldown > 0 || !canUseCommand;
      this.skillTexts[index]?.setText(cooldown > 0 ? `${cooldown}s` : readyLabel);
      this.skillTexts[index]?.setColor(cooldown > 0 ? "#94a3b8" : canUseCommand ? "#dbeafe" : "#64748b");
      this.skillButtons[index]?.setFillStyle(isDisabled ? 0x0f172a : 0x1e293b, isDisabled ? 0.72 : 0.94);
      this.skillButtons[index]?.setStrokeStyle(1, isDisabled ? 0x475569 : 0x60a5fa, isDisabled ? 0.45 : 0.75);
    });
  }

  private updateZeynepChainPanel(isZeynep: boolean, authorityChain: number) {
    this.zeynepChainEffect?.clear();
    this.zeynepChainEffect?.setVisible(false);
    this.zeynepChainText?.setVisible(false);

    if (!isZeynep) {
      return;
    }

    this.zeynepChainText?.setText(`Zincir ${authorityChain}/2`);
    this.zeynepChainText?.setColor(authorityChain >= 2 ? "#fdf2f8" : "#f9a8d4");
    this.zeynepChainText?.setVisible(true);

    if (authorityChain < 2 || !this.zeynepChainEffect) {
      return;
    }

    const graphics = this.zeynepChainEffect;
    graphics.setVisible(true);
    graphics.lineStyle(2, 0xfdf2f8, 0.86);
    for (const [index] of this.selectedCharacter.skills.entries()) {
      const x = 70 + index * 125;
      const y = 626;
      graphics.strokeRoundedRect(x - 59, y - 20, 118, 40, 6);
      for (let link = 0; link < 4; link += 1) {
        const linkX = x - 42 + link * 28;
        graphics.lineStyle(2, link % 2 === 0 ? 0xf9a8d4 : 0xfdf2f8, 0.78);
        graphics.strokeEllipse(linkX, y - 24, 19, 8);
        graphics.strokeEllipse(linkX + 11, y - 24, 19, 8);
      }
    }
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
    if (!this.perfText) {
      return;
    }

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

function getZeynepCommandButtonState(authorityChain: number) {
  return { cost: 10, label: authorityChain >= 2 ? "Zincir Sec" : "Sec" };
}

function getBackgroundMusicPath(characterId: CharacterId) {
  return characterId === "zeynep" ? "/audio/zeynep-theme.mp3" : "/audio/background-theme.mp3";
}

function getKillStreakVisualTheme(characterId: CharacterId, rule: KillStreakRule): KillStreakVisualTheme {
  type CharacterKillStreakTheme = Omit<KillStreakVisualTheme, "primary" | "secondary" | "accent" | "fill"> & {
    colors: readonly [number, number, number, number];
  };

  const atakanTheme: CharacterKillStreakTheme = {
    style: "brutal" as const,
    textColor: "#fff7ed",
    strokeColor: "#0a0a0a",
    motif: rule.chaos >= 4 ? "FULL SEND / NO BRAKES" : rule.chaos >= 3 ? "PRESSURE SPIKE" : "CLEAN EXECUTE",
    colors: [rule.primary, rule.secondary, rule.accent, rule.fill] as const
  };

  if (characterId === "zeynep") {
    const tiers: Record<KillStreakTier, readonly [number, number, number, number, string]> = {
      granted: [0x7dd3fc, 0xf0abfc, 0xfacc15, 0x160a2d, "COMMAND GRANTED"],
      unstoppable: [0x38bdf8, 0xe879f9, 0xfde047, 0x14052c, "TEMPO CONTROL / RANGE UP"],
      rampage: [0x22d3ee, 0xffffff, 0xf0abfc, 0x10031f, "FIELD DIRECTIVE / OVERRIDE"],
      legendary: [0xfdf2f8, 0x67e8f9, 0xfacc15, 0x0f0324, "GLOBAL COMMAND / EXECUTE"]
    };
    const [primary, secondary, accent, fill, motif] = tiers[rule.tier];
    return {
      style: "command",
      primary,
      secondary,
      accent,
      fill,
      textColor: "#fdfbff",
      strokeColor: "#111827",
      motif
    };
  }

  const themes: Record<Exclude<CharacterId, "zeynep">, CharacterKillStreakTheme> = {
    warrior: atakanTheme,
    archer: {
      style: "precision",
      textColor: "#ecfeff",
      strokeColor: "#082f49",
      motif: rule.chaos >= 4 ? "PERFECT VECTOR" : "MULTI-SHOT LOCK",
      colors: [0x22d3ee, 0xa7f3d0, 0xfef08a, 0x062b35] as const
    },
    mage: {
      style: "arcane",
      textColor: "#faf5ff",
      strokeColor: "#2e1065",
      motif: rule.chaos >= 4 ? "ASTRAL COLLAPSE" : "ARCANE SURGE",
      colors: [0xa855f7, 0xf0abfc, 0x67e8f9, 0x1f1238] as const
    },
    healer: {
      style: "sanctuary",
      textColor: "#f0fdf4",
      strokeColor: "#064e3b",
      motif: rule.chaos >= 4 ? "DIVINE BREAKPOINT" : "SANCTUARY PULSE",
      colors: [0x34d399, 0xfde68a, 0xbbf7d0, 0x052e2b] as const
    },
    tank: {
      style: "bulwark",
      textColor: "#f8fafc",
      strokeColor: "#1e293b",
      motif: rule.chaos >= 4 ? "UNBROKEN WALL" : "BULWARK BREAK",
      colors: [0x94a3b8, 0xf97316, 0xfacc15, 0x111827] as const
    },
    onur: {
      style: "storm",
      textColor: "#eff6ff",
      strokeColor: "#172554",
      motif: rule.chaos >= 4 ? "STORM ASCENDANT" : "STORM CLAIM",
      colors: [0x60a5fa, 0x818cf8, 0xf0abfc, 0x0b122c] as const
    }
  };

  const theme = themes[characterId] ?? atakanTheme;
  const [primary, secondary, accent, fill] = theme.colors;
  return { ...theme, primary, secondary, accent, fill };
}

function readStoredVolume(key: string, fallback: number) {
  const fallbackVolume = Phaser.Math.Clamp(fallback, 0, 1);
  try {
    const storedValue = window.localStorage.getItem(key);
    if (storedValue === null) {
      return fallbackVolume;
    }

    const parsedValue = Number(storedValue);
    if (!Number.isFinite(parsedValue)) {
      return fallbackVolume;
    }

    return Phaser.Math.Clamp(parsedValue, 0, 1);
  } catch {
    return fallbackVolume;
  }
}

function writeStoredVolume(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(Phaser.Math.Clamp(value, 0, 1)));
  } catch {
    // Storage can be unavailable in private browser contexts.
  }
}

function formatVolumePercent(value: number) {
  return `${Math.round(Phaser.Math.Clamp(value, 0, 1) * 100)}%`;
}

function areFormationNeighbors(towerA: TowerSnapshot, towerB: TowerSnapshot, cellSize: number) {
  const dx = Math.abs(towerA.x - towerB.x);
  const dy = Math.abs(towerA.y - towerB.y);
  return dx <= cellSize + 2 && dy <= cellSize + 2 && dx + dy > 2;
}

function roundClientMetric(value: number) {
  return Math.round(value * 10) / 10;
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

function getTrackingMarkerColor(stacks: number) {
  if (stacks >= 3) {
    return "#d8b4fe";
  }
  if (stacks >= 2) {
    return "#67e8f9";
  }
  return "#fde047";
}

function getZeynepCommandTierLevel(tier: "small" | "medium" | "big") {
  if (tier === "big") {
    return 3;
  }
  if (tier === "medium") {
    return 2;
  }
  return 1;
}

function getZeynepCommandPalette(type: "haste" | "range", tierLevel: number) {
  if (type === "haste") {
    return tierLevel >= 3
      ? { primary: 0xfacc15, secondary: 0xfb7185, accent: 0xffffff }
      : tierLevel >= 2
        ? { primary: 0xf59e0b, secondary: 0xfef08a, accent: 0xfb7185 }
        : { primary: 0xfde047, secondary: 0x38bdf8, accent: 0xf97316 };
  }

  return tierLevel >= 3
    ? { primary: 0x67e8f9, secondary: 0xf0abfc, accent: 0xffffff }
    : tierLevel >= 2
      ? { primary: 0x38bdf8, secondary: 0xa78bfa, accent: 0xfdf2f8 }
      : { primary: 0x0ea5e9, secondary: 0x7dd3fc, accent: 0xf9a8d4 };
}

function getZeynepSlowTint(tierLevel: number) {
  if (tierLevel >= 3) {
    return 0xd8b4fe;
  }
  if (tierLevel >= 2) {
    return 0x93c5fd;
  }
  return 0x7dd3fc;
}

function getZeynepSlowTextColor(tierLevel: number) {
  if (tierLevel >= 3) {
    return "#f0abfc";
  }
  if (tierLevel >= 2) {
    return "#93c5fd";
  }
  return "#67e8f9";
}

function toCssColor(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}
