import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  TOWER_ART_DISC_RATIO,
  TOWER_BUILD_TOP,
  TOWER_GRID_SIZE,
  createDefaultEditableMap,
  getMapGridSize as getSharedMapGridSize,
  getMapOrigin,
  getMapPoints,
  getTowerGridSpan,
  getTowerSellRefund,
  getTowerUpgradeCost,
  getTile,
  gridToWorld,
  isInsideMap,
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
  type TowerDefinition,
  type TowerSnapshot
} from "@karayel/shared";
import { gameServerUrl, healthUrl } from "../config";
import { clearActiveLobbyRoom, getActiveLobbyRoom } from "../online-session";
import { configureHiDpiCamera, RENDER_SCALE } from "../rendering";

type GameSceneData = {
  characterId?: CharacterId;
  mapData?: EditableMapData;
};

type ControlActionDetail = {
  action:
    | "selectTower"
    | "towerDragStart"
    | "towerDragMove"
    | "towerDragEnd"
    | "useSkill"
    | "useZeynepTier"
    | "useUltimate"
    | "useUltimateMode"
    | "upgradeTower"
    | "sellTower"
    | "setUnderworldMode"
    | "toggleAbartiOrientation"
    | "clearSelection";
  towerId?: string;
  slot?: number;
  tier?: ZeynepCommandTier;
  mode?: "attack" | "repair";
  underworldMode?: "approval" | "stress";
  clientX?: number;
  clientY?: number;
};

type RenderTower = {
  effect: Phaser.GameObjects.Graphics;
  linkHighlight: Phaser.GameObjects.Arc;
  /** Level dial, drawn over the sprite. Replaces the old under-sprite halo. */
  halo: Phaser.GameObjects.Graphics;
  base: Phaser.GameObjects.Image;
  range: Phaser.GameObjects.Arc;
  isolation: Phaser.GameObjects.Graphics;
  key: string;
  /** Eased separately from the snapshot so the muzzle sweeps instead of snapping. */
  facing?: number;
};

type RenderMover = {
  sprite: Phaser.Physics.Arcade.Sprite;
  shieldHalo?: Phaser.GameObjects.Arc;
  marker?: Phaser.GameObjects.Text;
  curseMarker?: Phaser.GameObjects.Text;
  doubtMarker?: Phaser.GameObjects.Text;
  armorBreakIcon?: Phaser.GameObjects.Image;
};

type BufferedSnapshot = {
  snapshot: GameSnapshot;
  receivedAt: number;
};

type PlaybackFrame = {
  snapshot: GameSnapshot;
  alpha: number;
};

type ClientPerfSample = {
  at: number;
  ms: number;
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
  style: "brutal" | "command" | "creepy" | "precision" | "arcane" | "sanctuary" | "bulwark" | "storm";
  primary: number;
  secondary: number;
  accent: number;
  fill: number;
  textColor: string;
  strokeColor: string;
  motif: string;
  imageKey?: string | null;
};

const KILL_STREAK_RETRIGGER_LOCK_MS = 60000;
const GUIDANCE_RADIUS = 78;
// Fast enough that the muzzle is on target before the projectile leaves it,
// slow enough to read as a sweep rather than a snap.
const TOWER_TURN_RATE_RADIANS_PER_SECOND = 12;

type ZeynepCommandTier = "small" | "medium" | "big";
type AudioVolumeChannel = "music" | "voice";
type TowerOrientation = NonNullable<TowerSnapshot["orientation"]>;

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
  private selectedPlacedTowerId?: string;
  private enemies = new Map<string, RenderMover>();
  private towers = new Map<string, RenderTower>();
  private projectiles = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private drones = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private mapGraphics?: Phaser.GameObjects.Graphics;
  private melisNightmareMapGraphics?: Phaser.GameObjects.Graphics;
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
  private perfPopupOpen = false;
  private perfPopupItems: Phaser.GameObjects.GameObject[] = [];
  private statusText?: Phaser.GameObjects.Text;
  private topStatsText?: Phaser.GameObjects.Text;
  private pingText?: Phaser.GameObjects.Text;
  private continueButton?: Phaser.GameObjects.Rectangle;
  private continueText?: Phaser.GameObjects.Text;
  private perfText?: Phaser.GameObjects.Text;
  private perfInfoText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private towerTrayItems: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text> = [];
  private selectedTowerStatsText?: Phaser.GameObjects.Text;
  private selectedTowerStatsHelpText?: Phaser.GameObjects.Text;
  private abartiOrientation: TowerOrientation = "horizontal";
  private abartiOrientationButton?: Phaser.GameObjects.Rectangle;
  private abartiOrientationText?: Phaser.GameObjects.Text;
  private ultimateButton?: Phaser.GameObjects.Rectangle;
  private ultimateText?: Phaser.GameObjects.Text;
  private ultimateChoiceItems: Phaser.GameObjects.GameObject[] = [];
  private ultimateChoiceOpen = false;
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
  private clientPerfSectionSamples = new Map<string, ClientPerfSample[]>();
  private snapshotCount = 0;
  private currentTeamGold = 0;
  private currentUltimateCharge = 0;
  private arenaPlayerCount = 1;
  private lastArenaTapAt = 0;
  private lastArenaTapX = 0;
  private lastArenaTapY = 0;
  private arenaZoomed = false;
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
  private latestPerfSnapshot?: GameSnapshot;
  private pendingAction: PendingAction;
  private towerButtons = new Map<string, Phaser.GameObjects.Rectangle>();
  private draggedTowerDefinition?: TowerDefinition;
  private ignoreMapPointerUntil = 0;
  private readonly playbackDelayMs = 500;
  private readonly killStreakMaxWindowMs = 11000;
  private readonly dragPreviewOffsetY = 64;
  private readonly controlTop = 698;
  private readonly skillRowY = 710;
  private readonly actionRowY = 735;
  private readonly trayTop = 758;
  private readonly towerCardHeight = 28;
  private readonly handleControlAction = (event: Event) => {
    this.handleDomControlAction(event as CustomEvent<ControlActionDetail>);
  };

  constructor() {
    super("game");
  }

  init(data: GameSceneData) {
    this.selectedCharacterId = data.characterId ?? "zeynep";
    this.selectedCharacter = characters.find((character) => character.id === this.selectedCharacterId) ?? characters[0];
    this.selectedTowerDefinition = towerCatalog[this.selectedCharacter.id][0];
    this.selectedMapData = normalizeMapData(data.mapData);
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
    window.addEventListener("karayel:control-action", this.handleControlAction);
    this.beamGraphics = this.add.graphics().setDepth(10);
    this.createKillStreakAudio();
    this.createBackgroundMusic();
    this.emitControlState();

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
      window.removeEventListener("karayel:control-action", this.handleControlAction);
      this.pingTimer?.remove(false);
      this.placementGrid?.destroy();
      this.melisNightmareMapGraphics?.destroy();
      this.placementGhost?.destroy();
      this.guidancePreview?.destroy();
      this.rampageContainer?.destroy(true);
      this.zeynepChainEffect?.destroy();
      this.zeynepChainText?.destroy();
      this.hideAudioSettingsPanel();
      this.hidePerfPopup();
      this.hideUltimateChoices();
      this.hideZeynepTierChoices();
      this.backgroundMusic?.pause();
      this.game.events.emit("game:controls-state", { visible: false });
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
    const origin = getMapOrigin(this.selectedMapData);
    const tileColumns = this.selectedMapData.cols;
    const tileRows = this.selectedMapData.rows;

    graphics.fillStyle(0x07111f, 1);
    graphics.fillRect(0, TOWER_BUILD_TOP, GAME_WORLD_WIDTH, this.controlTop - TOWER_BUILD_TOP);

    for (let row = 0; row < tileRows; row += 1) {
      for (let col = 0; col < tileColumns; col += 1) {
        const x = origin.x + col * cellSize;
        const y = origin.y + row * cellSize;
        const tileHeight = Math.min(cellSize, this.controlTop - y);
        if (tileHeight <= 0) {
          continue;
        }
        const isEntry = row === 0;
        const isExit = row === tileRows - 1;
        const fill = isEntry ? 0x123524 : isExit ? 0x3f1d2a : 0x101827;

        graphics.fillStyle(fill, 1);
        graphics.fillRect(x, y, cellSize, tileHeight);
        graphics.lineStyle(1, isEntry ? 0x166534 : isExit ? 0x7f1d1d : 0x1e293b, 0.55);
        graphics.strokeRect(x + 0.5, y + 0.5, cellSize - 1, Math.max(1, tileHeight - 1));
      }
    }

    graphics.lineStyle(2, 0x0f172a, 0.92);
    graphics.strokeRect(origin.x, origin.y, tileColumns * cellSize, tileRows * cellSize);
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
    this.pingText = this.add.text(GAME_WORLD_WIDTH - 42, 16, "-- ms", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "13px",
      fontStyle: "bold"
    }).setOrigin(1, 0).setDepth(21);
    this.createPerfInfoButton();
    this.continueButton = this.add.rectangle(GAME_WORLD_WIDTH - 78, 54, 96, 28, 0x15803d, 0.98)
      .setStrokeStyle(1.5, 0x86efac, 0.9)
      .setInteractive({ useHandCursor: true })
      .setDepth(64)
      .setVisible(false);
    this.continueText = this.add.text(GAME_WORLD_WIDTH - 78, 54, "Devam", {
      color: "#f0fdf4",
      fontFamily: "Arial",
      fontSize: "12px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(65).setVisible(false);
    const continueWave = () => {
      this.room?.send("wave:continue");
      this.ignoreMapPointerUntil = performance.now() + 220;
    };
    this.continueButton.on("pointerup", continueWave);
    this.continueText.setInteractive({ useHandCursor: true }).on("pointerup", continueWave);
  }

  private createPerfInfoButton() {
    const x = GAME_WORLD_WIDTH - 18;
    const y = 22;
    const button = this.add.circle(x, y, 10, 0x1e293b, 0.96)
      .setStrokeStyle(1.4, 0x38bdf8, 0.78)
      .setInteractive({ useHandCursor: true })
      .setDepth(62);
    const label = this.add.text(x, y - 1, "i", {
      color: "#e0f2fe",
      fontFamily: "Arial",
      fontSize: "13px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(63).setInteractive({ useHandCursor: true });
    const toggle = () => {
      this.ignoreMapPointerUntil = performance.now() + 220;
      this.togglePerfPopup();
    };
    button.on("pointerup", toggle);
    label.on("pointerup", toggle);
  }

  private togglePerfPopup() {
    if (this.perfPopupOpen) {
      this.hidePerfPopup();
      return;
    }

    this.showPerfPopup();
  }

  private showPerfPopup() {
    this.hidePerfPopup();
    this.perfPopupOpen = true;

    const panelX = 24;
    const panelY = 92;
    const panelWidth = GAME_WORLD_WIDTH - 48;
    const panelHeight = 690;
    const background = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x020617, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1.4, 0x38bdf8, 0.72)
      .setInteractive({ useHandCursor: false })
      .setDepth(86);
    background.on("pointerdown", () => {
      this.ignoreMapPointerUntil = performance.now() + 220;
    });
    background.on("pointerup", () => {
      this.ignoreMapPointerUntil = performance.now() + 220;
    });

    const title = this.add.text(panelX + 14, panelY + 12, "Performans Profili", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "15px",
      fontStyle: "bold"
    }).setDepth(87);
    const close = this.add.text(panelX + panelWidth - 18, panelY + 12, "x", {
      color: "#bae6fd",
      fontFamily: "Arial",
      fontSize: "16px",
      fontStyle: "bold"
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true }).setDepth(88);
    close.on("pointerup", () => {
      this.ignoreMapPointerUntil = performance.now() + 220;
      this.hidePerfPopup();
    });

    this.perfInfoText = this.add.text(panelX + 14, panelY + 42, this.getPerfPopupText(), {
      color: "#cbd5e1",
      fontFamily: "monospace",
      fontSize: "9px",
      lineSpacing: 2
    }).setDepth(87);

    this.perfPopupItems.push(background, title, close, this.perfInfoText);
  }

  private hidePerfPopup() {
    for (const item of this.perfPopupItems) {
      item.destroy();
    }
    this.perfPopupItems = [];
    this.perfInfoText = undefined;
    this.perfPopupOpen = false;
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
    const trayHeight = GAME_WORLD_HEIGHT - this.trayTop;
    this.add.rectangle(GAME_WORLD_WIDTH / 2, this.trayTop + trayHeight / 2, GAME_WORLD_WIDTH, trayHeight, 0x020617, 0.94)
      .setStrokeStyle(1, 0x334155, 0.9)
      .setDepth(25);

    this.hintText = this.add.text(12, this.trayTop + 5, `${this.selectedCharacter.displayName}: kuleyi haritaya surukle`, {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "11px"
    }).setDepth(26);

    this.selectedCharacter.towers.forEach((tower, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = 9 + col * 94;
      const y = this.trayTop + 22 + row * 33;
      const button = this.add.rectangle(x, y, 88, this.towerCardHeight, tower.id === this.selectedTowerDefinition.id ? 0x334155 : 0x1e293b, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(1, tower.color, tower.id === this.selectedTowerDefinition.id ? 1 : 0.45)
        .setInteractive({ useHandCursor: true })
        .setDepth(26);
      this.input.setDraggable(button);
      const nameText = this.add.text(x + 7, y + 4, tower.name, {
        color: "#f8fafc",
        fontFamily: "Arial",
        fontSize: "9px",
        fontStyle: "bold",
        wordWrap: { width: 74 }
      }).setDepth(27);
      const costText = this.add.text(x + 7, y + 16, `${tower.cost}g`, {
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

    this.abartiOrientationButton = this.add.rectangle(GAME_WORLD_WIDTH - 56, this.trayTop + 13, 92, 22, 0x312e81, 0.92)
      .setStrokeStyle(1, 0x67e8f9, 0.62)
      .setInteractive({ useHandCursor: true })
      .setDepth(28)
      .setVisible(false);
    this.abartiOrientationText = this.add.text(GAME_WORLD_WIDTH - 56, this.trayTop + 13, "", {
      color: "#cffafe",
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(29).setVisible(false);
    const toggleAbartiOrientation = () => {
      this.ignoreMapPointerUntil = performance.now() + 180;
      this.abartiOrientation = this.abartiOrientation === "horizontal" ? "vertical" : "horizontal";
      this.updateAbartiOrientationButton();
      this.updateSelectionUi();
    };
    this.abartiOrientationButton.on("pointerup", toggleAbartiOrientation);
    this.abartiOrientationText.setInteractive({ useHandCursor: true }).on("pointerup", toggleAbartiOrientation);

    this.selectedTowerStatsText = this.add.text(14, this.trayTop + 20, "", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "11px",
      fontStyle: "bold",
      lineSpacing: 5,
      wordWrap: { width: GAME_WORLD_WIDTH - 32 }
    }).setDepth(27).setVisible(false);
    this.selectedTowerStatsHelpText = this.add.text(14, this.trayTop + 82, "Haritaya dokun: dukkan alanina don", {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "10px"
    }).setDepth(27).setVisible(false);
  }

  private startTowerDrag(tower: TowerDefinition, pointer: Phaser.Input.Pointer) {
    this.startTowerDragAt(tower, this.getTowerDragPreviewPoint(pointer));
  }

  private startTowerDragAt(tower: TowerDefinition, previewPoint: { x: number; y: number }) {
    this.draggedTowerDefinition = tower;
    this.selectedTowerDefinition = tower;
    this.selectedPlacedTowerId = undefined;
    this.placementGrid?.setVisible(true);
    this.placementGhost?.destroy();
    // Matches the placed sprite: disc on the tile, frame slightly larger to hold
    // whatever overhangs it.
    const previewSize = (this.getMapCellSize() * getTowerGridSpan(tower.id)) / TOWER_ART_DISC_RATIO;
    const ghostWidth = tower.id === "zeynep-8" ? (this.abartiOrientation === "horizontal" ? previewSize * 1.7 : previewSize * 0.24) : previewSize;
    const ghostHeight = tower.id === "zeynep-8" ? (this.abartiOrientation === "vertical" ? previewSize * 1.7 : previewSize * 0.24) : previewSize;
    this.placementGhost = this.add.image(previewPoint.x, previewPoint.y, `tower-${tower.id}`)
      .setDisplaySize(ghostWidth, ghostHeight)
      .setAlpha(0.78)
      .setDepth(28);
    this.updateTowerDragAt(previewPoint);
    this.updateSelectionUi();
  }

  private updateTowerDrag(pointer: Phaser.Input.Pointer) {
    this.updateTowerDragAt(this.getTowerDragPreviewPoint(pointer));
  }

  private updateTowerDragAt(previewPoint: { x: number; y: number }) {
    if (!this.draggedTowerDefinition) {
      return;
    }

    const cell = this.snapToTowerGrid(previewPoint.x, previewPoint.y, this.draggedTowerDefinition.id);
    const canPlace = this.canPlaceTowerPreview(cell.x, cell.y);
    this.placementGhost?.setPosition(cell.x, cell.y).setTint(canPlace ? 0x86efac : 0xf87171);
    this.drawPlacementGrid(cell.x, cell.y, canPlace);
  }

  private finishTowerDrag(pointer: Phaser.Input.Pointer) {
    this.finishTowerDragAt(this.getTowerDragPreviewPoint(pointer));
  }

  private finishTowerDragAt(previewPoint: { x: number; y: number }) {
    const tower = this.draggedTowerDefinition;
    if (!tower) {
      return;
    }

    const cell = this.snapToTowerGrid(previewPoint.x, previewPoint.y, tower.id);
    const canPlace = this.canPlaceTowerPreview(cell.x, cell.y);
    if (this.room && canPlace) {
      this.room.send("placeTower", {
        definitionId: tower.id,
        x: cell.x,
        y: cell.y,
        orientation: tower.id === "zeynep-8" ? this.abartiOrientation : undefined
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

  private getTowerDragPreviewPointFromClient(clientX: number, clientY: number) {
    const rect = this.game.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * GAME_WORLD_WIDTH,
      y: ((clientY - rect.top) / rect.height) * GAME_WORLD_HEIGHT - this.dragPreviewOffsetY
    };
  }

  private handleDomControlAction(event: CustomEvent<ControlActionDetail>) {
    const detail = event.detail;
    if (!detail) {
      return;
    }

    const findTower = () => this.selectedCharacter.towers.find((tower) => tower.id === detail.towerId);
    const previewPoint = () => {
      if (detail.clientX === undefined || detail.clientY === undefined) {
        return undefined;
      }
      return this.getTowerDragPreviewPointFromClient(detail.clientX, detail.clientY);
    };

    switch (detail.action) {
      case "selectTower": {
        this.hideZeynepTierChoicesIfOpen();
        const tower = findTower();
        if (!tower) {
          return;
        }
        this.selectedTowerDefinition = tower;
        this.selectedPlacedTowerId = undefined;
        this.updateSelectionUi();
        break;
      }
      case "towerDragStart": {
        this.hideZeynepTierChoicesIfOpen();
        const tower = findTower();
        const point = previewPoint();
        if (!tower || !point) {
          return;
        }
        this.startTowerDragAt(tower, point);
        break;
      }
      case "towerDragMove": {
        const point = previewPoint();
        if (point) {
          this.updateTowerDragAt(point);
        }
        break;
      }
      case "towerDragEnd": {
        const point = previewPoint();
        if (point) {
          this.finishTowerDragAt(point);
        }
        break;
      }
      case "useSkill":
        this.handleSkillButton(detail.slot ?? 0);
        break;
      case "useZeynepTier":
        if (this.pendingZeynepCommandSlot !== undefined && detail.tier) {
          this.room?.send("useSkill", { slot: this.pendingZeynepCommandSlot, commandTier: detail.tier });
        }
        this.hideZeynepTierChoices();
        this.clearPlacedTowerSelection();
        break;
      case "useUltimate":
        this.hideZeynepTierChoicesIfOpen();
        this.handleUltimateButton();
        break;
      case "useUltimateMode":
        this.hideZeynepTierChoicesIfOpen();
        if (detail.mode) {
          this.room?.send("useUltimate", { mode: detail.mode });
        }
        this.hideUltimateChoices();
        this.clearPlacedTowerSelection();
        break;
      case "upgradeTower":
        this.hideZeynepTierChoicesIfOpen();
        if (this.selectedPlacedTowerId) {
          this.room?.send("upgradeTower", { towerId: this.selectedPlacedTowerId });
        }
        break;
      case "sellTower":
        this.hideZeynepTierChoicesIfOpen();
        if (this.selectedPlacedTowerId) {
          this.room?.send("sellTower", { towerId: this.selectedPlacedTowerId });
          this.selectedPlacedTowerId = undefined;
          this.updateSelectionUi();
        }
        break;
      case "setUnderworldMode":
        this.hideZeynepTierChoicesIfOpen();
        if (this.selectedPlacedTowerId && detail.underworldMode) {
          this.room?.send("setTowerMode", { towerId: this.selectedPlacedTowerId, mode: detail.underworldMode });
        }
        break;
      case "toggleAbartiOrientation":
        this.hideZeynepTierChoicesIfOpen();
        this.abartiOrientation = this.abartiOrientation === "horizontal" ? "vertical" : "horizontal";
        this.updateSelectionUi();
        break;
      case "clearSelection":
        this.hideZeynepTierChoicesIfOpen();
        this.clearPlacedTowerSelection();
        break;
    }
  }

  private drawPlacementGrid(highlightX: number, highlightY: number, canPlace: boolean) {
    const grid = this.placementGrid;
    if (!grid) {
      return;
    }

    const cellSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    const arenaRight = origin.x + this.selectedMapData.cols * cellSize;
    const arenaBottom = origin.y + this.selectedMapData.rows * cellSize;
    const footprint = this.getTowerPreviewFootprintCells(highlightX, highlightY);
    grid.clear();

    if ((this.draggedTowerDefinition?.id ?? this.selectedTowerDefinition.id) === "zeynep-8") {
      grid.lineStyle(1, 0xe2e8f0, 0.16);
      for (let x = origin.x; x <= arenaRight + 0.01; x += cellSize) {
        grid.lineBetween(x, origin.y, x, arenaBottom);
      }
      for (let y = origin.y; y <= arenaBottom + 0.01; y += cellSize) {
        grid.lineBetween(origin.x, y, arenaRight, y);
      }

      const segments = this.getAbartiEdgeSegments(highlightX, highlightY, this.getPlacementOrientation("zeynep-8"));
      grid.fillStyle(canPlace ? 0x22c55e : 0xef4444, 0.42);
      grid.lineStyle(2, canPlace ? 0x86efac : 0xfca5a5, 0.95);
      for (const segment of segments) {
        const rect = this.getAbartiEdgeSegmentRect(segment);
        grid.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
        grid.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      }
      return;
    }

    grid.fillStyle(canPlace ? 0x22c55e : 0xef4444, 0.28);
    for (const cell of footprint) {
      const world = gridToWorld(cell.col, cell.row, this.selectedMapData);
      grid.fillRect(world.x - cellSize / 2, world.y - cellSize / 2, cellSize, cellSize);
    }
    grid.lineStyle(1, canPlace ? 0x86efac : 0xfca5a5, 0.92);
    for (const cell of footprint) {
      const world = gridToWorld(cell.col, cell.row, this.selectedMapData);
      grid.strokeRect(world.x - cellSize / 2, world.y - cellSize / 2, cellSize, cellSize);
    }

    grid.lineStyle(1, 0xe2e8f0, 0.16);
    for (let x = origin.x; x <= arenaRight + 0.01; x += cellSize) {
      grid.lineBetween(x, origin.y, x, arenaBottom);
    }
    for (let y = origin.y; y <= arenaBottom + 0.01; y += cellSize) {
      grid.lineBetween(origin.x, y, arenaRight, y);
    }
  }

  private snapToTowerGrid(x: number, y: number, definitionId = this.selectedTowerDefinition.id, orientation = this.getPlacementOrientation(definitionId)) {
    const gridPoint = worldToGrid(x, y, this.selectedMapData);
    if (definitionId === "zeynep-8") {
      const gridSize = this.getMapCellSize();
      const origin = getMapOrigin(this.selectedMapData);
      if (orientation === "vertical") {
        const lineCol = Math.max(0, Math.min(this.selectedMapData.cols, Math.round((x - origin.x) / gridSize)));
        const centerRow = Math.max(1, Math.min(this.selectedMapData.rows - 1, Math.round((y - origin.y) / gridSize)));
        return {
          x: origin.x + lineCol * gridSize,
          y: origin.y + centerRow * gridSize
        };
      }

      const centerCol = Math.max(1, Math.min(this.selectedMapData.cols - 1, Math.round((x - origin.x) / gridSize)));
      const lineRow = Math.max(0, Math.min(this.selectedMapData.rows, Math.round((y - origin.y) / gridSize)));
      return {
        x: origin.x + centerCol * gridSize,
        y: origin.y + lineRow * gridSize
      };
    }

    // A 2x2 tower centres on a cell corner rather than a cell.
    if (getTowerGridSpan(definitionId) === 2) {
      const gridSize = this.getMapCellSize();
      const origin = getMapOrigin(this.selectedMapData);
      const col = Math.max(1, Math.min(this.selectedMapData.cols - 1, Math.round((x - origin.x) / gridSize)));
      const row = Math.max(1, Math.min(this.selectedMapData.rows - 1, Math.round((y - origin.y) / gridSize)));
      return {
        x: origin.x + col * gridSize,
        y: origin.y + row * gridSize
      };
    }

    return gridToWorld(gridPoint.col, gridPoint.row, this.selectedMapData);
  }

  private canPlaceTowerPreview(x: number, y: number, ignoreTowerId = "") {
    if (this.draggedTowerDefinition && this.currentTeamGold < this.draggedTowerDefinition.cost) {
      return false;
    }

    const definitionId = this.draggedTowerDefinition?.id ?? this.selectedTowerDefinition.id;
    if (definitionId === "zeynep-8") {
      return this.canPlaceAbartiEdgePreview(x, y, this.getPlacementOrientation(definitionId), ignoreTowerId);
    }

    const footprint = this.getTowerPreviewFootprintCells(x, y);
    if (footprint.length === 0) {
      return false;
    }

    for (const cell of footprint) {
      const world = gridToWorld(cell.col, cell.row, this.selectedMapData);
      if (world.y + this.getMapCellSize() / 2 > this.controlTop) {
        return false;
      }
    }

    const occupiedCells = new Set(footprint.map((cell) => `${cell.col}:${cell.row}`));
    for (const tower of this.towerSnapshots.values()) {
      if (tower.id === ignoreTowerId) {
        continue;
      }
      const towerCells = this.getTowerFootprintCells(tower.x, tower.y, tower.definitionId, tower.orientation);
      if (towerCells.some((cell) => occupiedCells.has(`${cell.col}:${cell.row}`))) {
        return false;
      }
    }

    return true;
  }

  private getTowerPreviewFootprintCells(x: number, y: number) {
    const definitionId = this.draggedTowerDefinition?.id ?? this.selectedTowerDefinition.id;
    return this.getTowerFootprintCells(x, y, definitionId, this.getPlacementOrientation(definitionId));
  }

  private getTowerFootprintCells(x: number, y: number, definitionId = "", orientation: TowerOrientation = "horizontal") {
    if (definitionId === "zeynep-8") {
      return [];
    }

    if (getTowerGridSpan(definitionId) === 2) {
      const gridSize = this.getMapCellSize();
      const origin = getMapOrigin(this.selectedMapData);
      const col = Math.round((x - origin.x) / gridSize);
      const row = Math.round((y - origin.y) / gridSize);
      const cells = [
        { col: col - 1, row: row - 1 },
        { col, row: row - 1 },
        { col: col - 1, row },
        { col, row }
      ];
      return cells.every((cell) => isInsideMap(this.selectedMapData, cell.col, cell.row)) ? cells : [];
    }

    const gridPoint = worldToGrid(x, y, this.selectedMapData);
    return isInsideMap(this.selectedMapData, gridPoint.col, gridPoint.row) ? [gridPoint] : [];
  }

  private canPlaceAbartiEdgePreview(x: number, y: number, orientation: TowerOrientation, ignoreTowerId = "") {
    const segments = this.getAbartiEdgeSegments(x, y, orientation);
    if (segments.length !== 2 || !segments.every((segment) => this.isValidAbartiEdgeSegment(segment))) {
      return false;
    }

    for (const tower of this.towerSnapshots.values()) {
      if (tower.id === ignoreTowerId || tower.definitionId !== "zeynep-8") {
        continue;
      }

      const existingSegments = this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation ?? "horizontal");
      if (segments.some((segment) => existingSegments.some((existing) => (
        existing.orientation === segment.orientation &&
        existing.col === segment.col &&
        existing.row === segment.row
      )))) {
        return false;
      }
    }

    return true;
  }

  private getAbartiEdgeSegments(x: number, y: number, orientation: TowerOrientation) {
    const gridSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    if (orientation === "vertical") {
      const col = Math.max(0, Math.min(this.selectedMapData.cols, Math.round((x - origin.x) / gridSize)));
      const row = Math.max(0, Math.min(this.selectedMapData.rows - 2, Math.round((y - origin.y) / gridSize - 1)));
      return [
        { orientation, col, row },
        { orientation, col, row: row + 1 }
      ];
    }

    const col = Math.max(0, Math.min(this.selectedMapData.cols - 2, Math.round((x - origin.x) / gridSize - 1)));
    const row = Math.max(0, Math.min(this.selectedMapData.rows, Math.round((y - origin.y) / gridSize)));
    return [
      { orientation, col, row },
      { orientation, col: col + 1, row }
    ];
  }

  private isValidAbartiEdgeSegment(segment: { orientation: TowerOrientation; col: number; row: number }) {
    if (segment.orientation === "vertical") {
      if (segment.col < 0 || segment.col > this.selectedMapData.cols || segment.row < 0 || segment.row >= this.selectedMapData.rows) {
        return false;
      }

      return this.isTowerTile(segment.col - 1, segment.row) || this.isTowerTile(segment.col, segment.row);
    }

    if (segment.col < 0 || segment.col >= this.selectedMapData.cols || segment.row < 0 || segment.row > this.selectedMapData.rows) {
      return false;
    }

    return this.isTowerTile(segment.col, segment.row - 1) || this.isTowerTile(segment.col, segment.row);
  }

  private isTowerTile(col: number, row: number) {
    return isInsideMap(this.selectedMapData, col, row) && getTile(this.selectedMapData, col, row) === "tower";
  }

  private getAbartiEdgeSegmentRect(segment: { orientation: TowerOrientation; col: number; row: number }) {
    const gridSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    const thickness = Math.max(4, gridSize * 0.16);
    if (segment.orientation === "vertical") {
      const x = origin.x + segment.col * gridSize;
      const y1 = origin.y + segment.row * gridSize;
      return {
        left: x - thickness / 2,
        right: x + thickness / 2,
        top: y1,
        bottom: y1 + gridSize
      };
    }

    const x1 = origin.x + segment.col * gridSize;
    const y = origin.y + segment.row * gridSize;
    return {
      left: x1,
      right: x1 + gridSize,
      top: y - thickness / 2,
      bottom: y + thickness / 2
    };
  }

  private getPlacementOrientation(definitionId = this.selectedTowerDefinition.id): TowerOrientation {
    return definitionId === "zeynep-8" ? this.abartiOrientation : "horizontal";
  }

  private createKillStreakAudio() {
    this.killStreakSounds = {
      granted: [new Audio("/audio/streak-granted.mp3")],
      unstoppable: [new Audio("/audio/streak-unstopable.mp3")],
      rampage: [new Audio("/audio/kill-streak-deep.mp3")],
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
    this.add.rectangle(
      GAME_WORLD_WIDTH / 2,
      this.controlTop + (this.trayTop - this.controlTop) / 2,
      GAME_WORLD_WIDTH,
      this.trayTop - this.controlTop,
      0x020617,
      0.9
    )
      .setStrokeStyle(1, 0x334155, 0.88)
      .setDepth(24);

    this.selectedCharacter.skills.forEach((skill, index) => {
      const x = 70 + index * 125;
      const button = this.add.rectangle(x, this.skillRowY, 108, 28, 0x1e293b, 0.94)
        .setStrokeStyle(1, 0x60a5fa, 0.55)
        .setInteractive({ useHandCursor: true })
        .setDepth(25);
      const label = this.add.text(x, this.skillRowY, skill.name, {
        color: "#dbeafe",
        fontFamily: "Arial",
        fontSize: "9px",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: 98 }
      }).setOrigin(0.5).setDepth(26);
      button.on("pointerup", () => this.handleSkillButton(index));
      this.skillButtons.push(button);
      this.skillTexts.push(label);
    });

    this.zeynepChainEffect = this.add.graphics().setDepth(58).setVisible(false);
    this.zeynepChainText = this.add.text(GAME_WORLD_WIDTH / 2, this.controlTop + 4, "", {
      color: "#f9a8d4",
      fontFamily: "Arial",
      fontSize: "10px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(59).setVisible(false);

    this.ultimateButton = this.add.rectangle(78, this.actionRowY, 128, 28, 0x7c3aed, 0.92)
      .setStrokeStyle(1, 0xc4b5fd, 0.7)
      .setInteractive({ useHandCursor: true })
      .setDepth(25);
    this.ultimateText = this.add.text(78, this.actionRowY, "Ulti 0%", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "11px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(26);
    this.ultimateButton.on("pointerup", () => this.handleUltimateButton());

    this.upgradeButton = this.add.rectangle(235, this.actionRowY, 106, 28, 0x1e293b, 0.92)
      .setStrokeStyle(1, 0x94a3b8, 0.6)
      .setInteractive({ useHandCursor: true })
      .setDepth(25);
    this.upgradeText = this.add.text(235, this.actionRowY, "Kule sec", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "9px",
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(26);
    this.upgradeButton.on("pointerup", () => {
      if (this.selectedPlacedTowerId) {
        this.room?.send("upgradeTower", { towerId: this.selectedPlacedTowerId });
      }
    });

    this.sellButton = this.add.rectangle(340, this.actionRowY, 76, 28, 0x450a0a, 0.88)
      .setStrokeStyle(1, 0xfca5a5, 0.55)
      .setInteractive({ useHandCursor: true })
      .setDepth(25);
    this.sellText = this.add.text(340, this.actionRowY, "Sat", {
      color: "#fecaca",
      fontFamily: "Arial",
      fontSize: "9px",
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

    this.clearPlacedTowerSelection();

    if (this.currentUltimateCharge < 100) {
      this.hideUltimateChoices();
      this.hintText?.setText("Ulti henuz hazir degil");
      return;
    }

    if (this.selectedCharacterId !== "warrior") {
      this.room.send("useUltimate", {});
      return;
    }

    if (this.ultimateChoiceOpen) {
      this.hideUltimateChoices();
      return;
    }

    this.showUltimateChoices();
  }

  private showUltimateChoices() {
    this.hideUltimateChoices();
    this.ultimateChoiceOpen = true;
    this.emitControlState();
  }

  private createUltimateChoiceButton(x: number, label: string, color: number, onSelect: () => void) {
    const button = this.add.rectangle(x, this.actionRowY, x < 160 ? 128 : 148, 28, color, 0.96)
      .setStrokeStyle(2, 0xf8fafc, 0.8)
      .setInteractive({ useHandCursor: true })
      .setDepth(60);
    const text = this.add.text(x, this.actionRowY, label, {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "11px",
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
    this.ultimateChoiceOpen = false;
    this.emitControlState();
  }

  private showZeynepTierChoices(slot: number, reputation: number) {
    if (this.pendingZeynepCommandSlot === slot) {
      this.hideZeynepTierChoices();
      return;
    }

    this.hideZeynepTierChoices();
    this.pendingZeynepCommandSlot = slot;
    void reputation;
    this.emitControlState();
  }

  private createZeynepTierChoiceButton(x: number, label: string, tier: ZeynepCommandTier, cost: number, reputation: number, color: number) {
    const canUse = reputation >= cost;
    const button = this.add.rectangle(x, this.actionRowY, 38, 26, canUse ? color : 0x0f172a, canUse ? 0.96 : 0.68)
      .setStrokeStyle(1, canUse ? 0xf8fafc : 0x475569, canUse ? 0.78 : 0.5)
      .setDepth(60);
    const text = this.add.text(x, this.actionRowY, `${label}\n${cost}I`, {
      color: canUse ? "#f8fafc" : "#64748b",
      fontFamily: "Arial",
      fontSize: "8px",
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
        this.clearPlacedTowerSelection();
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
    this.emitControlState();
  }

  private hideZeynepTierChoicesIfOpen() {
    if (this.pendingZeynepCommandSlot === undefined) {
      return;
    }
    this.hideZeynepTierChoices();
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
      this.clearPlacedTowerSelection();
      this.clearGuidancePreview();
      this.hintText?.setText("Yonlendirme alani gonderildi");
      return;
    }

    if (this.draggedTowerDefinition || performance.now() < this.ignoreMapPointerUntil) {
      return;
    }
    if (this.arenaZoomed) {
      this.handleArenaZoomTap(pointer);
      return;
    }
    if (!this.isBattlePointer(pointer)) {
      return;
    }
    if (this.handleArenaZoomTap(pointer)) {
      return;
    }
    this.hideUltimateChoices();
    this.hideZeynepTierChoicesIfOpen();

    if (this.pendingAction?.type === "guidance") {
      this.hintText?.setText(this.selectedCharacterId === "archer" ? "Zorba icin alani surukle" : "Yonlendirme icin haritada basili tutup surukle");
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
      this.clearPlacedTowerSelection();
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

    this.clearPlacedTowerSelection();
  }

  private handleSkillButton(index: number) {
    if (!this.room) {
      return;
    }

    if (this.selectedCharacterId === "zeynep") {
      const reputation = this.localPlayerSnapshot?.reputation ?? 0;
      this.clearPlacedTowerSelection();
      this.showZeynepTierChoices(index, reputation);
      this.hintText?.setText("Komut gucunu sec: dusuk, orta veya yuksek");
      return;
    }

    if (this.selectedCharacterId === "archer") {
      this.hideZeynepTierChoices();
      if (index === 0) {
        this.pendingAction = { type: "guidance" };
        this.clearPlacedTowerSelection();
        this.hintText?.setText("Zorba: tank dusmanin oldugu alani surukle");
        return;
      }
      if (index === 1) {
        const towerId = this.selectedPlacedTowerId;
        if (!towerId) {
          this.hintText?.setText("Olumcul Stres icin once kendi kuleni sec");
          return;
        }
        this.room.send("useSkill", { slot: index, towerId });
        this.clearPlacedTowerSelection();
        return;
      }
      this.room.send("useSkill", { slot: index });
      this.clearPlacedTowerSelection();
      return;
    }

    if (this.selectedCharacterId !== "warrior") {
      this.hideZeynepTierChoices();
      this.room.send("useSkill", { slot: index });
      this.clearPlacedTowerSelection();
      return;
    }

    if (index === 0) {
      this.hideZeynepTierChoices();
      this.pendingAction = { type: "guidance" };
      this.clearPlacedTowerSelection();
      this.hintText?.setText("Yonlendirme: haritada basili tutup alani surukle");
      return;
    }

    if (index === 1) {
      const towerId = this.selectedPlacedTowerId;
      if (!towerId) {
        this.hintText?.setText("Refactor icin once kendi kuleni sec");
        return;
      }
      this.pendingAction = { type: "refactor", towerId };
      this.clearPlacedTowerSelection();
      this.hintText?.setText("Refactor: yeni konuma dokun");
      return;
    }

    this.hideZeynepTierChoices();
    this.room.send("useSkill", { slot: index });
    this.clearPlacedTowerSelection();
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
    const receiveStart = performance.now();
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
    this.recordClientPerfSection("snapshotRecv", performance.now() - receiveStart);
  }

  private renderPlaybackFrame(now: number) {
    const frameStart = performance.now();
    const frame = this.getPlaybackFrame(now);
    if (!frame) {
      return;
    }

    this.zeynepCommandEffects = frame.snapshot.zeynepCommands;
    let sectionStart = performance.now();
    this.renderEnemies(frame.snapshot.enemies);
    this.recordClientPerfSection("enemies", performance.now() - sectionStart);
    sectionStart = performance.now();
    this.renderDrones(frame.snapshot.drones ?? []);
    this.recordClientPerfSection("drones", performance.now() - sectionStart);
    sectionStart = performance.now();
    this.renderProjectiles(frame.snapshot.projectiles);
    this.recordClientPerfSection("projectiles", performance.now() - sectionStart);
    this.lastPlaybackAlpha = frame.alpha;

    if (frame.snapshot.serverTime !== this.lastRenderedSnapshotServerTime) {
      this.renderSnapshotPayload(frame.snapshot);
      this.lastRenderedSnapshotServerTime = frame.snapshot.serverTime;
    }
    this.recordClientPerfSection("frame", performance.now() - frameStart);
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

      return {
        ...enemy,
        x: oldEnemy ? Phaser.Math.Linear(oldEnemy.x, enemy.x, alpha) : enemy.x,
        y: oldEnemy ? Phaser.Math.Linear(oldEnemy.y, enemy.y, alpha) : enemy.y,
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

    const previousProjectiles = new Map(previous.projectiles.map((projectile) => [projectile.id, projectile]));
    const snapshotDeltaSeconds = Math.max(0, (next.serverTime - previous.serverTime) / 1000);
    const projectiles = next.projectiles.map((projectile) => {
      const oldProjectile = previousProjectiles.get(projectile.id);
      if (oldProjectile) {
        return {
          ...projectile,
          x: Phaser.Math.Linear(oldProjectile.x, projectile.x, alpha),
          y: Phaser.Math.Linear(oldProjectile.y, projectile.y, alpha)
        };
      }

      const remainingSeconds = snapshotDeltaSeconds * (1 - alpha);
      return {
        ...projectile,
        x: projectile.x - (projectile.vx ?? 0) * remainingSeconds,
        y: projectile.y - (projectile.vy ?? 0) * remainingSeconds
      };
    });

    return {
      ...next,
      enemies,
      drones,
      projectiles
    };
  }

  private renderSnapshotPayload(snapshot: GameSnapshot) {
    const renderStart = performance.now();
    const now = performance.now();

    this.syncBackgroundMusic(snapshot);
    this.renderSetupPhase(snapshot);
    this.zeynepCommandEffects = snapshot.zeynepCommands;
    let sectionStart = performance.now();
    this.syncMapFromSnapshot(snapshot);
    this.arenaPlayerCount = this.selectedMapData.cols >= 23 ? 4 : this.selectedMapData.cols >= 20 ? 3 : this.selectedMapData.cols >= 15 ? 2 : 1;
    this.recordClientPerfSection("map", performance.now() - sectionStart);
    this.renderMelisNightmareMapLocks(Boolean(snapshot.melisGothicNightmareActive));
    sectionStart = performance.now();
    this.renderTowers(snapshot.towers);
    this.recordClientPerfSection("towers", performance.now() - sectionStart);
    sectionStart = performance.now();
    this.renderBeams(snapshot.beams);
    this.recordClientPerfSection("beams", performance.now() - sectionStart);
    sectionStart = performance.now();
    this.renderKillEvents(snapshot);
    this.renderDamageEvents(snapshot.damageEvents);
    this.recordClientPerfSection("events", performance.now() - sectionStart);
    sectionStart = performance.now();
    this.renderHud(snapshot);
    this.recordClientPerfSection("hud", performance.now() - sectionStart);
    if (now - this.lastShopEventAt > 250) {
      sectionStart = performance.now();
      this.game.events.emit("game:snapshot", snapshot, this.localSessionId);
      this.recordClientPerfSection("shop", performance.now() - sectionStart);
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
    const origin = getMapOrigin(this.selectedMapData);
    const arenaRight = origin.x + this.selectedMapData.cols * this.getMapCellSize();
    const arenaBottom = origin.y + this.selectedMapData.rows * this.getMapCellSize();
    return Boolean(this.room) && !this.draggedTowerDefinition &&
      pointer.worldX >= origin.x && pointer.worldX <= arenaRight &&
      pointer.worldY >= origin.y && pointer.worldY <= arenaBottom;
  }

  private renderSetupPhase(snapshot: GameSnapshot) {
    const active = Boolean(snapshot.setupPhase);
    const localReady = Boolean(this.localSessionId && snapshot.setupReadyPlayerIds?.includes(this.localSessionId));
    this.continueButton?.setVisible(active).setFillStyle(localReady ? 0x334155 : 0x15803d, 0.98);
    this.continueText?.setVisible(active).setText(localReady ? "Bekleniyor" : "Devam");
    if (active) {
      const readyCount = snapshot.setupReadyPlayerIds?.length ?? 0;
      this.statusText?.setText(`Kurulum: ${readyCount}/${snapshot.players.length} oyuncu hazir`);
    }
  }

  private handleArenaZoomTap(pointer: Phaser.Input.Pointer) {
    if (this.arenaPlayerCount < 3) {
      return false;
    }
    const now = performance.now();
    const isDoubleTap = now - this.lastArenaTapAt <= 320 && Math.hypot(pointer.x - this.lastArenaTapX, pointer.y - this.lastArenaTapY) <= 36;
    this.lastArenaTapAt = now;
    this.lastArenaTapX = pointer.x;
    this.lastArenaTapY = pointer.y;
    if (this.arenaZoomed) {
      if (!isDoubleTap) {
        return true;
      }
      this.resetArenaZoom();
      this.lastArenaTapAt = 0;
      return true;
    }

    const camera = this.cameras.main;
    camera.panEffect.reset();
    camera.zoomEffect.reset();
    const zoom = (this.arenaPlayerCount === 3 ? 3 : 4) * RENDER_SCALE;
    camera.setZoom(zoom);
    camera.centerOn(pointer.worldX, pointer.worldY);
    this.arenaZoomed = true;
    return false;
  }

  private resetArenaZoom() {
    const camera = this.cameras.main;
    camera.panEffect.reset();
    camera.zoomEffect.reset();
    camera.setZoom(RENDER_SCALE);
    camera.setScroll(0, 0);
    this.arenaZoomed = false;
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
    this.renderedMapKey = mapKey;
    this.drawMap();
  }

  private renderMelisNightmareMapLocks(active: boolean) {
    const graphics = this.melisNightmareMapGraphics ?? this.add.graphics().setDepth(9.4);
    this.melisNightmareMapGraphics = graphics;
    graphics.clear();
    if (!active) {
      return;
    }

    const points = [
      ...getMapPoints(this.selectedMapData, "spawn"),
      ...getMapPoints(this.selectedMapData, "nexus")
    ];
    const cellSize = this.getMapCellSize();
    const now = performance.now();

    for (const point of points) {
      const world = gridToWorld(point.col, point.row, this.selectedMapData);
      this.drawMelisNightmareLock(graphics, world.x, world.y, Math.max(34, cellSize * 1.7), now + point.col * 41 + point.row * 67);
    }
  }

  private drawMelisNightmareLock(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, time: number) {
    const phase = (time % 720) / 720;
    const jitterX = Math.sin(phase * Math.PI * 8) * 1.8;
    const jitterY = Math.cos(phase * Math.PI * 6) * 1.4;
    const half = size / 2;

    graphics.lineStyle(10, 0x020617, 0.68);
    graphics.lineBetween(x - half, y - half, x + half, y + half);
    graphics.lineBetween(x + half, y - half, x - half, y + half);

    graphics.lineStyle(6, 0xff1b8d, 0.52);
    graphics.lineBetween(x - half + jitterX, y - half, x + half + jitterX, y + half);
    graphics.lineBetween(x + half - jitterX, y - half, x - half - jitterX, y + half);

    graphics.lineStyle(3, 0x22d3ee, 0.84);
    graphics.lineBetween(x - half + jitterX * 0.4, y - half + jitterY, x + half + jitterX * 0.4, y + half + jitterY);
    graphics.lineBetween(x + half - jitterX * 0.4, y - half - jitterY, x - half - jitterX * 0.4, y + half - jitterY);

    graphics.lineStyle(1.2, 0xfdf2f8, 0.9);
    graphics.lineBetween(x - half * 0.72, y - half * 0.72, x + half * 0.72, y + half * 0.72);
    graphics.lineBetween(x + half * 0.72, y - half * 0.72, x - half * 0.72, y + half * 0.72);

    for (let index = 0; index < 5; index += 1) {
      const offset = (index - 2) * size * 0.18;
      const glitchY = y + offset + Math.sin(phase * Math.PI * 2 + index) * 3;
      graphics.lineStyle(1.6, index % 2 === 0 ? 0xff1b8d : 0x22d3ee, 0.36);
      graphics.lineBetween(x - half * 0.78, glitchY, x + half * 0.78, glitchY + Math.sin(index + phase * 10) * 4);
    }
  }

  private renderHud(snapshot: GameSnapshot) {
    const player = snapshot.players.find((candidate) => candidate.id === this.localSessionId);
    this.localPlayerSnapshot = player;
    const charge = player?.ultimateCharge ?? 0;
    const gold = player?.gold ?? 0;
    this.currentTeamGold = gold;
    this.currentUltimateCharge = charge;
    if (charge < 100 && this.ultimateChoiceOpen) {
      this.hideUltimateChoices();
    }

    const reputation = player?.reputation ?? 0;
    const authorityChain = player?.authorityChain ?? 0;
    const authorityQuality = player?.authorityQuality ?? 0;
    if (player?.characterId !== "zeynep") {
      this.hideZeynepTierChoices();
    }
    const zeynepStats = player?.characterId === "zeynep" ? `  Itibar ${reputation}/100  Zincir ${authorityChain}/2  Kalite ${authorityQuality}/15` : "";
    const approval = player?.approval ?? 0;
    const stress = player?.stress ?? 0;
    const ammunition = snapshot.team.ammunition ?? { bullet: 0, auraCrystal: 0, powerCrystal: 0 };
    const resourceStats = `  E ${Math.floor(snapshot.team.energy ?? 0)}/${snapshot.team.maxEnergy ?? 0}  M ${Math.floor(ammunition.bullet)}  A ${Math.floor(ammunition.auraCrystal)}  G ${Math.floor(ammunition.powerCrystal)}`;
    const hudKey = `${gold}|${Math.round(snapshot.team.health)}|${snapshot.team.wave}|${snapshot.team.enemiesLeft}|${charge}|${reputation}|${authorityChain}|${authorityQuality}|${approval}|${stress}|${resourceStats}`;
    if (this.lastHudKey !== hudKey) {
      this.topStatsText?.setText(`Gold ${Math.floor(gold)}  Can ${Math.round(snapshot.team.health)}/${snapshot.team.maxHealth}  Wave ${snapshot.team.wave}  Kalan ${snapshot.team.enemiesLeft}${resourceStats}${zeynepStats}`);
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
        mover.curseMarker?.destroy();
        mover.doubtMarker?.destroy();
        mover.shieldHalo?.destroy();
        mover.armorBreakIcon?.destroy();
        this.enemies.delete(id);
      }
    }

    for (const enemy of enemies) {
      let mover = this.enemies.get(enemy.id);
      const texture = getEnemyTextureKey(enemy);

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
        mover.shieldHalo = this.add.circle(enemy.x, enemy.y, 18, 0x38bdf8, 0.08)
          .setStrokeStyle(2, 0x60a5fa, 0.86)
          .setDepth(7.6)
          .setVisible(false);
        mover.marker = this.add.text(enemy.x, enemy.y - 22, "T", {
          color: "#fde047",
          fontFamily: "Arial",
          fontSize: "12px",
          fontStyle: "bold",
          stroke: "#020617",
          strokeThickness: 3
        }).setOrigin(0.5).setDepth(14).setVisible(false);
        mover.curseMarker = this.add.text(enemy.x - 10, enemy.y - 20, "L1", {
          color: "#f0abfc",
          fontFamily: "Arial",
          fontSize: "9px",
          fontStyle: "bold",
          stroke: "#020617",
          strokeThickness: 3
        }).setOrigin(0.5).setDepth(15).setVisible(false);
        mover.doubtMarker = this.add.text(enemy.x + 10, enemy.y - 20, "Ş1", {
          color: "#5eead4",
          fontFamily: "Arial",
          fontSize: "9px",
          fontStyle: "bold",
          stroke: "#020617",
          strokeThickness: 3
        }).setOrigin(0.5).setDepth(15).setVisible(false);
        mover.armorBreakIcon = this.add.image(enemy.x + 12, enemy.y - 14, "status-armor-broken")
          .setOrigin(0.5)
          .setDepth(15)
          .setVisible(false);
        this.enemies.set(enemy.id, mover);
      }

      if (mover.sprite.texture.key !== texture) {
        mover.sprite.setTexture(texture);
      }
      const previousX = mover.sprite.x;
      const previousY = mover.sprite.y;
      mover.sprite.setPosition(enemy.x, enemy.y);
      mover.sprite.setDepth(enemy.movementKind === "air" ? 9 : 8);
      mover.sprite.setRotation(this.getEnemySpriteRotation(enemy, previousX, previousY, mover.sprite.rotation));
      const slowPulse = slowTierLevel > 0 ? Math.sin(performance.now() / 120) * 0.05 : 0;
      const baseSpriteScale = getEnemySpriteDisplaySize(enemy, this.getMapCellSize()) / 512;
      mover.sprite.setScale(baseSpriteScale * ((enemy.movementKind === "air" ? 1.28 : 1) + slowPulse));
      mover.sprite.setAlpha(enemy.movementKind === "air" ? 0.98 : 0.68 + 0.32 * (enemy.hp / enemy.maxHp));
      mover.sprite.setTint(enemy.isDominated ? 0xf0abfc : enemy.isWhisperTurned ? 0xa78bfa : slowTierLevel > 0 ? getZeynepSlowTint(slowTierLevel) : enemy.shield > 0 ? 0xbfdbfe : enemy.movementKind === "air" ? 0x67e8f9 : 0xffffff);
      const hasShield = enemy.shield > 0 && enemy.maxShield > 0;
      const shieldRatio = hasShield ? Phaser.Math.Clamp(enemy.shield / enemy.maxShield, 0, 1) : 0;
      const displayedEnemySize = getEnemySpriteDisplaySize(enemy, this.getMapCellSize()) * (enemy.movementKind === "air" ? 1.28 : 1) * (1 + slowPulse);
      const shieldRadius = displayedEnemySize * 0.48;
      const statusYOffset = Math.max(18, displayedEnemySize * 0.42);
      mover.shieldHalo?.setPosition(enemy.x, enemy.y);
      mover.shieldHalo?.setDepth(enemy.movementKind === "air" ? 8.6 : 7.6);
      mover.shieldHalo?.setRadius(shieldRadius);
      mover.shieldHalo?.setFillStyle(0x38bdf8, hasShield ? 0.04 + shieldRatio * 0.08 : 0);
      mover.shieldHalo?.setStrokeStyle(1.5, 0x60a5fa, hasShield ? 0.42 + shieldRatio * 0.45 : 0);
      mover.shieldHalo?.setVisible(hasShield);
      mover.marker?.setPosition(enemy.x, enemy.y - 22);
      const trackingStacks = enemy.trackingStacks ?? (enemy.isTracked ? 1 : 0);
      const curseLoad = enemy.curseLoad ?? 0;
      const isCursed = curseLoad > 0;
      const doubtStacks = enemy.doubtStacks ?? 0;
      const hasDoubt = doubtStacks > 0 || Boolean(enemy.isHesitating);
      const hasUnderworld = Boolean(enemy.isUnderworldLinked || enemy.isUndead);
      const hasSeparateMelisMarker = isCursed || hasDoubt;
      const hasCombatMarker = Boolean(enemy.isDominated || enemy.isWhisperTurned || enemy.isFeared || hasUnderworld || trackingStacks > 0);
      const slowLabel = slowTierLevel > 0 ? `SLOW ${slowTierLevel}` : "";
      mover.marker?.setPosition(enemy.x, enemy.y - statusYOffset - (hasSeparateMelisMarker ? 11 : 4));
      mover.marker?.setText(enemy.isDominated ? "ZORBA" : enemy.isWhisperTurned ? "DÖN" : enemy.isUndead ? "ÖLÜ" : enemy.isUnderworldLinked ? "BAĞ" : enemy.isFeared ? "KORKU" : trackingStacks > 1 ? `T${trackingStacks}` : hasCombatMarker ? "T" : slowLabel || "AIR");
      mover.marker?.setColor(enemy.isDominated ? "#f0abfc" : enemy.isWhisperTurned ? "#c4b5fd" : enemy.isUndead ? "#22d3ee" : enemy.isUnderworldLinked ? "#2dd4bf" : enemy.isFeared ? "#c084fc" : hasCombatMarker ? getTrackingMarkerColor(trackingStacks) : slowTierLevel > 0 ? getZeynepSlowTextColor(slowTierLevel) : "#67e8f9");
      mover.marker?.setFontSize(enemy.isDominated ? 9 : enemy.isWhisperTurned ? 10 : enemy.isUndead ? 9 : enemy.isUnderworldLinked ? 9 : enemy.isFeared ? 9 : hasCombatMarker ? 12 : slowTierLevel > 0 ? 8 : 8);
      mover.marker?.setVisible(Boolean(hasCombatMarker || slowTierLevel > 0 || enemy.movementKind === "air"));
      const curseText = `L${Math.min(999, Math.round(curseLoad))}`;
      const doubtText = enemy.isHesitating ? "Ş!" : `Ş${Math.max(1, doubtStacks)}`;
      const melisMarkerGap = isCursed && hasDoubt ? Math.max(10, displayedEnemySize * 0.2) : 0;
      mover.curseMarker?.setPosition(enemy.x - melisMarkerGap, enemy.y - statusYOffset);
      mover.curseMarker?.setText(curseText);
      mover.curseMarker?.setFontSize(curseLoad >= 100 ? 8 : 9);
      mover.curseMarker?.setVisible(isCursed);
      mover.doubtMarker?.setPosition(enemy.x + melisMarkerGap, enemy.y - statusYOffset);
      mover.doubtMarker?.setText(doubtText);
      mover.doubtMarker?.setColor(enemy.isHesitating ? "#99f6e4" : "#5eead4");
      mover.doubtMarker?.setVisible(hasDoubt);
      const iconPulse = enemy.isArmorBroken ? 1 + Math.sin(performance.now() / 95) * 0.08 : 1;
      mover.armorBreakIcon?.setPosition(enemy.x + 12, enemy.y - 15);
      mover.armorBreakIcon?.setScale(this.getTowerEffectScale() * 0.62 * iconPulse);
      mover.armorBreakIcon?.setAlpha(enemy.isArmorBroken ? 0.96 : 0);
      mover.armorBreakIcon?.setVisible(Boolean(enemy.isArmorBroken));
    }
  }

  private getEnemySpriteRotation(enemy: EnemySnapshot, previousX: number, previousY: number, previousRotation: number) {
    const dx = enemy.x - previousX;
    const dy = enemy.y - previousY;
    if (Math.abs(dx) + Math.abs(dy) > 0.05) {
      return Math.atan2(dy, dx) - Math.PI / 2;
    }

    return previousRotation;
  }

  private renderTowers(towers: TowerSnapshot[]) {
    const activeIds = new Set(towers.map((tower) => tower.id));
    this.towerSnapshots = new Map(towers.map((tower) => [tower.id, tower]));
    const cellSize = this.getMapCellSize();
    const linkRadius = Math.max(14, cellSize * 0.8);

    for (const [id, tower] of this.towers) {
      if (!activeIds.has(id)) {
        tower.halo.destroy();
        tower.effect.destroy();
        tower.linkHighlight.destroy();
        tower.base.destroy();
        tower.range.destroy();
        tower.isolation.destroy();
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
        // Above the sprite, not under it: an opaque tower would hide the ring.
        const halo = this.add.graphics().setDepth(12.6);
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
        rendered = { effect, linkHighlight, halo, base, range, isolation, key: "" };
        this.towers.set(tower.id, rendered);
      }

      // The disc covers exactly the tile it sits on -- 2x2 towers cover four --
      // and the sprite is sized larger only to make room for whatever the art
      // hangs outside the disc, such as Taht Muhru's barrel.
      const discSize = cellSize * getTowerGridSpan(tower.definitionId);
      const spriteSize = discSize / TOWER_ART_DISC_RATIO;

      const texture = `tower-${tower.definitionId}`;
      const key = `${tower.x}|${tower.y}|${tower.orientation ?? "horizontal"}|${tower.color}|${tower.ownerId}|${tower.name}|${tower.level}|${tower.range}|${tower.status}|${tower.waveBonusLevel ?? 0}|${tower.serverLinkWaveAge ?? 0}|${tower.zeynepFormationSize ?? 0}|${tower.zeynepFormationLevel ?? 0}|${texture}|${discSize}`;
      if (rendered.key !== key) {
        this.drawTowerLevelRing(rendered.halo, tower.x, tower.y, tower.level, discSize / 2);
        rendered.linkHighlight.setPosition(tower.x, tower.y);
        rendered.base.setPosition(tower.x, tower.y).setTexture(texture);
        rendered.range.setPosition(tower.x, tower.y).setRadius(tower.range);
        this.drawIsolationGrid(rendered.isolation, tower.x, tower.y);
        rendered.key = key;
      }
      this.applyTowerFacing(rendered, tower);
      const selectionScale = tower.id === this.selectedPlacedTowerId ? 1.18 : 1;
      const footprintScaleX = tower.definitionId === "zeynep-8" ? (tower.orientation === "vertical" ? 0.24 : 1.7) : 1;
      const footprintScaleY = tower.definitionId === "zeynep-8" ? (tower.orientation === "vertical" ? 1.7 : 0.24) : 1;
      // Derived from the frame rather than a constant: painted art and the
      // procedural glyphs ship at different sizes, but both reserve the same
      // disc-to-frame ratio, so this lands the disc on the tile either way.
      const textureScale = spriteSize / Math.max(1, rendered.base.frame.width);
      rendered.base.setScale(selectionScale * textureScale * footprintScaleX, selectionScale * textureScale * footprintScaleY);
      rendered.base.setVisible(tower.definitionId !== "zeynep-8");
      rendered.base.setTint(this.getTowerTint(tower));
      rendered.base.setAlpha(tower.status === "Tukenmis" || tower.disabled ? 0.42 : tower.ownerId === this.localSessionId ? 1 : 0.78);
      rendered.halo.setVisible(tower.definitionId !== "zeynep-8" && tower.status !== "Tukenmis" && tower.status !== "Hararet" && !tower.disabled);
      this.renderTowerSpriteEffects(rendered.effect, tower);
      rendered.range.setVisible(tower.id === this.selectedPlacedTowerId);
      rendered.isolation.setVisible(tower.id === this.selectedPlacedTowerId && tower.definitionId === "warrior-3");
      this.updateServerLinkHighlight(rendered.linkHighlight, tower);
    }
  }

  /**
   * Level ring. Three redundant ordinal cues so it reads without a legend and
   * without relying on hue: the arc fills clockwise as the tower levels (a full
   * circle is 10), the stroke thickens, and the colour heats from steel to
   * white. Drawn outside the sprite radius so painted art stays uncovered.
   */
  private drawTowerLevelRing(graphics: Phaser.GameObjects.Graphics, x: number, y: number, level: number, spriteRadius: number) {
    const style = getTowerLevelStyle(level);
    // Sits on the sprite's outer rim like a collar rather than orbiting outside
    // it: a ring wide enough to clear a 38px sprite would be 48px across on a
    // 34px cell, so neighbouring towers would overlap each other's rings. Drawn
    // above the sprite, so it stays visible on opaque art; the centre -- where
    // the eye, lens or muzzle lives -- is never covered.
    const radius = spriteRadius - 1;
    const start = -Math.PI / 2;
    const sweep = Math.PI * 2 * style.fill;

    graphics.clear();

    // Unfilled remainder. Has to stay visible against the dark map or level 1
    // reads as "no ring" instead of "one tenth of the dial".
    graphics.lineStyle(1, 0x64748b, 0.5);
    graphics.beginPath();
    graphics.arc(x, y, radius, 0, Math.PI * 2);
    graphics.strokePath();

    if (style.glow) {
      graphics.lineStyle(style.width + 3, style.color, 0.18);
      graphics.beginPath();
      graphics.arc(x, y, radius, start, start + sweep);
      graphics.strokePath();
    }

    graphics.lineStyle(style.width, style.color, 0.95);
    graphics.beginPath();
    graphics.arc(x, y, radius, start, start + sweep);
    graphics.strokePath();
  }

  /**
   * Turns the muzzle toward the server-reported bearing. The snapshot only
   * arrives every 33 ms, so the angle is eased per frame along the shortest arc
   * -- lerping the raw value would spin the long way round when it crosses PI.
   * Sprites are authored pointing right (+X), matching atan2's zero.
   */
  private applyTowerFacing(rendered: RenderTower, tower: TowerSnapshot) {
    if (typeof tower.facing !== "number") {
      return;
    }

    if (rendered.facing === undefined) {
      rendered.facing = tower.facing;
    } else {
      const step = TOWER_TURN_RATE_RADIANS_PER_SECOND * (this.game.loop.delta / 1000);
      rendered.facing = Phaser.Math.Angle.RotateTo(rendered.facing, tower.facing, step);
    }

    rendered.base.setRotation(rendered.facing);
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
    if (tower.status === "Hararet" || tower.status === "Tukenmis" || tower.disabled) {
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
    this.renderAbartiEdgeBody(graphics, tower);
    this.renderMelisGothicTowerRing(graphics, tower);
    this.renderMelisEvolutionStraps(graphics, tower);
    this.renderMelisFocusTowerEffect(graphics, tower);
    this.renderZeynepCommandTowerEffect(graphics, tower);
    this.renderServerLinkCodeEffect(graphics, tower);
    this.renderDebugLaserLevelPrism(graphics, tower);
    this.renderUcubeWaveEffect(graphics, tower);
  }

  private renderAbartiEdgeBody(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.definitionId !== "zeynep-8") {
      return;
    }

    const segments = this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation ?? "horizontal");
    const phase = (performance.now() % 1200) / 1200;
    const selected = tower.id === this.selectedPlacedTowerId;
    const pulse = 0.72 + Math.sin(phase * Math.PI * 2) * 0.16;
    const thickness = Math.max(5, this.getMapCellSize() * 0.16);
    const glowWidth = thickness * (selected ? 4.2 : 3.2);
    const coreWidth = Math.max(2, thickness * 0.42);

    for (const segment of segments) {
      const rect = this.getAbartiEdgeSegmentRect(segment);
      const horizontal = segment.orientation !== "vertical";
      const x1 = horizontal ? rect.left : (rect.left + rect.right) / 2;
      const y1 = horizontal ? (rect.top + rect.bottom) / 2 : rect.top;
      const x2 = horizontal ? rect.right : (rect.left + rect.right) / 2;
      const y2 = horizontal ? (rect.top + rect.bottom) / 2 : rect.bottom;

      graphics.lineStyle(glowWidth, 0x7c3aed, selected ? 0.3 : 0.18);
      graphics.lineBetween(x1, y1, x2, y2);
      graphics.lineStyle(thickness * 1.45, 0x2e1065, 0.94);
      graphics.lineBetween(x1, y1, x2, y2);
      graphics.lineStyle(thickness * 0.9, 0x6d28d9, 0.94);
      graphics.lineBetween(x1, y1, x2, y2);
      graphics.lineStyle(coreWidth, selected ? 0xfdf2f8 : 0xc4b5fd, pulse);
      graphics.lineBetween(x1, y1, x2, y2);

      graphics.fillStyle(selected ? 0xfdf2f8 : 0xa78bfa, selected ? 0.9 : 0.72);
      graphics.fillCircle(x1, y1, thickness * 0.55);
      graphics.fillCircle(x2, y2, thickness * 0.55);
    }
  }

  private renderMelisFocusTowerEffect(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.characterId !== "archer" || !tower.status?.startsWith("Odaklan")) {
      return;
    }

    const effectScale = this.getTowerEffectScale();
    const cellSize = this.getMapCellSize();
    const boosted = tower.status.includes("x5");
    const phase = ((performance.now() + tower.x * 11 + tower.y * 17) % 720) / 720;
    const radius = Math.max(11, cellSize * 0.48);
    const pulse = Math.sin(phase * Math.PI * 2);
    const primary = boosted ? 0xfacc15 : 0x67e8f9;
    const secondary = boosted ? 0xfb7185 : 0xc084fc;

    graphics.lineStyle((boosted ? 3.2 : 2.2) * effectScale, primary, boosted ? 0.92 : 0.78);
    graphics.strokeCircle(tower.x, tower.y, radius + pulse * 1.7 * effectScale);
    graphics.lineStyle(1.2 * effectScale, secondary, 0.7);
    graphics.strokeCircle(tower.x, tower.y, radius * 0.68 - pulse * 1.1 * effectScale);

    for (let index = 0; index < 4; index += 1) {
      const angle = phase * Math.PI * 2 + index * Math.PI * 0.5;
      const inner = radius * 0.78;
      const outer = radius + (boosted ? 7 : 5) * effectScale;
      const x1 = tower.x + Math.cos(angle) * inner;
      const y1 = tower.y + Math.sin(angle) * inner;
      const x2 = tower.x + Math.cos(angle) * outer;
      const y2 = tower.y + Math.sin(angle) * outer;
      graphics.lineStyle((boosted ? 2 : 1.35) * effectScale, index % 2 === 0 ? primary : secondary, 0.82);
      graphics.lineBetween(x1, y1, x2, y2);
    }
  }

  private renderMelisGothicTowerRing(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.characterId !== "archer" || tower.status !== "Gotik Kabus") {
      return;
    }

    const cellSize = this.getMapCellSize();
    const effectScale = this.getTowerEffectScale();
    const radius = Math.max(13, cellSize * 0.58);
    const phase = ((performance.now() + tower.x * 13 + tower.y * 7) % 1100) / 1100;
    const wave = Math.sin(phase * Math.PI * 2);

    graphics.fillStyle(0x020617, 0.2);
    graphics.fillCircle(tower.x, tower.y, radius + 1.5 * effectScale);

    for (let ring = 0; ring < 3; ring += 1) {
      const ringPhase = phase + ring * 0.23;
      const ringRadius = radius + Math.sin(ringPhase * Math.PI * 2) * 1.5 * effectScale + ring * 1.1 * effectScale;
      graphics.lineStyle((2.4 - ring * 0.45) * effectScale, 0x020617, 0.88 - ring * 0.18);
      graphics.strokeCircle(tower.x, tower.y, ringRadius);
      graphics.lineStyle(Math.max(0.8, 1.1 * effectScale), ring % 2 === 0 ? 0xff1b8d : 0x22d3ee, 0.18 + ring * 0.05);
      graphics.strokeCircle(tower.x, tower.y, ringRadius + 1.8 * effectScale);
    }

    const marks = 12;
    for (let index = 0; index < marks; index += 1) {
      const angle = index * (Math.PI * 2 / marks) + phase * Math.PI * 2 * 0.32;
      const wobble = Math.sin(phase * Math.PI * 6 + index * 1.7) * 2.2 * effectScale;
      const inner = radius - 2.8 * effectScale + wobble * 0.18;
      const outer = radius + 2.6 * effectScale + wobble;
      const x1 = tower.x + Math.cos(angle) * inner;
      const y1 = tower.y + Math.sin(angle) * inner;
      const x2 = tower.x + Math.cos(angle + wave * 0.05) * outer;
      const y2 = tower.y + Math.sin(angle + wave * 0.05) * outer;
      graphics.lineStyle((index % 3 === 0 ? 2.1 : 1.2) * effectScale, 0x020617, 0.78);
      graphics.lineBetween(x1, y1, x2, y2);
    }
  }

  private renderMelisEvolutionStraps(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.characterId !== "archer" || !tower.melisEvolutionLevel) {
      return;
    }

    const strapCount = Phaser.Math.Clamp(Math.floor(tower.melisEvolutionLevel), 1, 3);
    const cellSize = this.getMapCellSize();
    const spriteRadius = Math.max(20, cellSize * 1.12) / 2;
    const halfLength = spriteRadius * 0.84;
    const strapWidth = Math.max(1.2, cellSize * 0.038);
    const dx = Math.SQRT1_2;
    const dy = Math.SQRT1_2;
    const px = -Math.SQRT1_2;
    const py = Math.SQRT1_2;
    const offsets = strapCount === 1
      ? [0]
      : strapCount === 2
        ? [-spriteRadius * 0.22, spriteRadius * 0.22]
        : [-spriteRadius * 0.34, 0, spriteRadius * 0.34];

    for (const offset of offsets) {
      const centerX = tower.x + px * offset;
      const centerY = tower.y + py * offset;
      const startX = centerX - dx * halfLength;
      const startY = centerY - dy * halfLength;
      const endX = centerX + dx * halfLength;
      const endY = centerY + dy * halfLength;

      graphics.lineStyle(strapWidth + Math.max(1, strapWidth * 0.9), 0x020617, 0.58);
      graphics.lineBetween(startX, startY, endX, endY);
      graphics.lineStyle(strapWidth, 0xf8fafc, 0.96);
      graphics.lineBetween(startX, startY, endX, endY);
      graphics.lineStyle(Math.max(0.6, strapWidth * 0.38), 0xffffff, 0.85);
      graphics.lineBetween(startX, startY, endX, endY);
    }
  }

  private renderZeynepCommandTowerEffect(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.definitionId === "zeynep-8" || tower.status === "Hararet" || tower.status === "Tukenmis") {
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
      if (typeof projectile.vx === "number" && typeof projectile.vy === "number" && Math.abs(projectile.vx) + Math.abs(projectile.vy) > 0.01) {
        sprite.setRotation(Math.atan2(projectile.vy, projectile.vx));
      }
      const isMelisProjectile = projectile.definitionId?.startsWith("archer-");
      sprite.setAlpha(isMelisProjectile ? 0.92 : 1);
      sprite.setDepth(isMelisProjectile ? 11.2 : 11);
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

      const streakRule = event.streakTier
        ? getKillStreakRuleByTier(event.streakTier)
        : this.getTriggeredKillStreakRule(event.ownerId, event.serverTime, snapshot.team.wave);
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
    if (theme.style === "creepy") {
      this.showMelisKillStreakAnnouncement(message, rule, theme);
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

  private showMelisKillStreakAnnouncement(message: string, rule: KillStreakRule, theme: KillStreakVisualTheme) {
    const imageKey = theme.imageKey === undefined ? "melis-creepy" : theme.imageKey;
    const container = this.add.container(GAME_WORLD_WIDTH / 2, -88).setDepth(82).setAlpha(0);
    const chaos = rule.chaos;
    const plate = this.add.graphics();
    const width = 188 + chaos * 16;
    const height = 38 + chaos * 5;
    const slash = 18 + chaos * 3;

    plate.fillStyle(theme.fill, 0.94);
    plate.fillPoints([
      new Phaser.Geom.Point(-width, -height + 6),
      new Phaser.Geom.Point(width - slash, -height - chaos * 3),
      new Phaser.Geom.Point(width + 10, -4),
      new Phaser.Geom.Point(width - 22, height + 2),
      new Phaser.Geom.Point(-width + slash, height - 4),
      new Phaser.Geom.Point(-width - 10, -7)
    ], true);
    plate.lineStyle(2 + chaos, theme.primary, 0.9);
    plate.strokePoints([
      new Phaser.Geom.Point(-width, -height + 6),
      new Phaser.Geom.Point(width - slash, -height - chaos * 3),
      new Phaser.Geom.Point(width + 10, -4),
      new Phaser.Geom.Point(width - 22, height + 2),
      new Phaser.Geom.Point(-width + slash, height - 4),
      new Phaser.Geom.Point(-width - 10, -7)
    ], true);
    plate.lineStyle(2, theme.secondary, 0.68);
    plate.lineBetween(-width + 24, height - 9, -width + 82, -height + 10);
    plate.lineBetween(width - 118, -height - 2, width - 36, height - 8);
    plate.lineStyle(1, theme.accent, 0.58);
    plate.lineBetween(-44, -height - 7, -12, height + 9);
    plate.lineBetween(58, height + 6, 106 + chaos * 8, -height + 3);
    if (chaos >= 3) {
      plate.lineStyle(2, 0xfda4af, 0.5);
      plate.lineBetween(-width + 112, -height - 10, -width + 146, height + 10);
      plate.lineBetween(width - 70, -height - 12, width - 22, height + 12);
    }

    const imageObjects: Phaser.GameObjects.Image[] = [];
    if (imageKey) {
      const imageAngle = getMelisKillStreakImageAngle(imageKey, chaos);
      const image = this.add.image(getMelisKillStreakImageOffsetX(imageKey, width), getMelisKillStreakImageOffsetY(imageKey, height), imageKey)
        .setOrigin(0.5)
        .setDisplaySize(...getMelisKillStreakImageDisplaySize(this, imageKey, width, height, chaos))
        .setAngle(imageAngle)
        .setAlpha(imageKey === "melis-creepy-legend" ? 0.82 : imageKey === "melis-creepy-unstoppable" ? 0.74 : 0.78)
        .setBlendMode(Phaser.BlendModes.ADD);
      const imageGhostA = this.add.image(image.x + 5 + chaos, image.y - 2, imageKey)
        .setOrigin(0.5)
        .setDisplaySize(image.displayWidth, image.displayHeight)
        .setAngle(imageAngle)
        .setTint(theme.secondary)
        .setAlpha(0.22)
        .setBlendMode(Phaser.BlendModes.ADD);
      const imageGhostB = this.add.image(image.x - 5 - chaos, image.y + 2, imageKey)
        .setOrigin(0.5)
        .setDisplaySize(image.displayWidth, image.displayHeight)
        .setAngle(imageAngle)
        .setTint(theme.primary)
        .setAlpha(0.2)
        .setBlendMode(Phaser.BlendModes.ADD);
      imageObjects.push(imageGhostA, imageGhostB, image);
    }

    const fontSize = message.length > 21 ? "24px" : message.length > 17 ? "28px" : "32px";
    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "Impact, Arial Black, Arial",
      fontSize,
      fontStyle: "bold",
      color: theme.textColor,
      stroke: "#02010a",
      strokeThickness: 8
    };
    const mainText = this.add.text(0, -2, message, baseStyle)
      .setOrigin(0.5)
      .setAngle(-2 - chaos * 0.3);
    const hotText = this.add.text(5 + chaos, 1, message, {
      ...baseStyle,
      color: toCssColor(theme.primary),
      strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0.34);
    const coldText = this.add.text(-6 - chaos, -6, message, {
      ...baseStyle,
      color: toCssColor(theme.secondary),
      strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0.32);
    const glitches: Phaser.GameObjects.Rectangle[] = [];
    const glitchCount = 7 + chaos * 4;
    for (let index = 0; index < glitchCount; index += 1) {
      const y = Phaser.Math.Between(-height - 8, height + 8);
      const x = Phaser.Math.Between(-width + 18, width - 18);
      const barWidth = Phaser.Math.Between(14, 44 + chaos * 14);
      const color = index % 3 === 0 ? theme.primary : index % 3 === 1 ? theme.secondary : theme.accent;
      const bar = this.add.rectangle(x, y, barWidth, Phaser.Math.Between(2, 4 + chaos), color, 0.22 + chaos * 0.04)
        .setBlendMode(Phaser.BlendModes.ADD);
      glitches.push(bar);
    }

    container.add([plate, coldText, hotText, mainText, ...glitches, ...imageObjects]);
    this.rampageContainer = container;
    this.cameras.main.shake(130 + chaos * 180, 0.002 + chaos * chaos * 0.00125);

    this.tweens.add({
      targets: container,
      y: 86,
      alpha: 1,
      duration: Math.max(140, 250 - chaos * 22),
      ease: "Back.easeOut"
    });
    this.tweens.add({
      targets: container,
      angle: { from: -1.2 - chaos * 0.65, to: 1.2 + chaos * 0.65 },
      yoyo: true,
      repeat: 6 + chaos * 5,
      duration: Math.max(30, 76 - chaos * 8),
      ease: "Sine.easeInOut"
    });
    this.tweens.add({
      targets: glitches,
      alpha: { from: 0.06, to: 0.62 },
      yoyo: true,
      repeat: 10 + chaos * 6,
      duration: Math.max(20, 48 - chaos * 5),
      ease: "Stepped"
    });
    this.tweens.add({
      targets: [hotText, coldText],
      alpha: { from: 0.15, to: 0.54 },
      yoyo: true,
      repeat: 10 + chaos * 5,
      duration: Math.max(28, 58 - chaos * 4),
      ease: "Stepped"
    });
    this.tweens.add({
      targets: mainText,
      scaleX: { from: 0.96, to: 1.07 + chaos * 0.025 },
      scaleY: { from: 1.04, to: 0.94 - chaos * 0.015 },
      yoyo: true,
      repeat: 6 + chaos * 4,
      duration: 66,
      ease: "Sine.easeInOut"
    });
    this.tweens.add({
      targets: container,
      y: 58,
      alpha: 0,
      delay: 2200 + chaos * 300,
      duration: 520,
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
      } else if (beam.definitionId === "zeynep-6" || beam.definitionId === "zeynep-3-kin-wave") {
        this.drawKinConeWave(beam, color);
      } else if (beam.definitionId === "zeynep-3-kin-showcase") {
        this.drawKinShowcaseLight(beam, color);
      } else if (beam.definitionId === "archer-2-rage") {
        this.drawMelisRageWave(beam, color);
      } else if (beam.definitionId === "archer-3-curse" || beam.definitionId === "archer-3-curse-burst" || beam.definitionId === "archer-3-curse-pool") {
        this.drawMelisCursePulse(beam, color);
      } else if (beam.definitionId === "archer-6-whisper") {
        this.drawMelisWhisperWave(beam, color);
      } else if (beam.definitionId === "archer-6-whisper-turn") {
        this.drawMelisWhisperTurnShot(beam, color);
      } else if (beam.definitionId === "archer-6-whisper-suicide") {
        this.drawMelisWhisperSuicideBurst(beam, color);
      } else if (beam.definitionId === "archer-4-underworld-link" || beam.definitionId === "archer-4-underworld-execute" || beam.definitionId === "archer-4-undead-shot") {
        this.drawMelisUnderworldLink(beam, color);
      } else if (beam.definitionId === "archer-5-mirror") {
        this.drawMelisBrokenMirrorBurst(beam, color);
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

  private drawMelisRageWave(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 180) / 380, 0, 1);
    const pulse = 1 + Math.sin(Date.now() / 42) * 0.08;
    this.beamGraphics.fillStyle(color, 0.08 * life);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, radius * pulse);
    this.beamGraphics.lineStyle(3 * this.getTowerEffectScale(), color, 0.75 * life);
    this.beamGraphics.strokeCircle(beam.x1, beam.y1, radius * (1.02 - life * 0.18));
    this.beamGraphics.lineStyle(1.4 * this.getTowerEffectScale(), 0xfdf2f8, 0.62 * life);
    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10 + Date.now() / 480;
      const inner = radius * 0.45;
      const outer = radius * (0.82 + (index % 3) * 0.04);
      this.beamGraphics.lineBetween(
        beam.x1 + Math.cos(angle) * inner,
        beam.y1 + Math.sin(angle) * inner,
        beam.x1 + Math.cos(angle) * outer,
        beam.y1 + Math.sin(angle) * outer
      );
    }
  }

  private drawMelisCursePulse(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 180) / 360, 0, 1);
    const isBurst = beam.definitionId === "archer-3-curse-burst";
    const isPool = beam.definitionId === "archer-3-curse-pool";
    const pulse = 1 + Math.sin(Date.now() / 58) * 0.06;
    if (!isPool) {
      this.beamGraphics.lineStyle(1.2 * this.getTowerEffectScale(), 0xf5d0fe, 0.48 * life);
      this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    }
    this.beamGraphics.fillStyle(color, isPool ? 0.18 * life : isBurst ? 0.13 * life : 0.08 * life);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, radius * pulse);
    if (isBurst) {
      const now = Date.now();
      this.beamGraphics.fillStyle(0x020617, 0.7 * life);
      this.beamGraphics.fillCircle(beam.x2, beam.y2, radius * 0.34);
      this.beamGraphics.lineStyle(5.2 * this.getTowerEffectScale(), 0xf0abfc, 0.78 * life);
      this.beamGraphics.strokeCircle(beam.x2, beam.y2, radius * (1.34 - life * 0.24));
      this.beamGraphics.lineStyle(2.2 * this.getTowerEffectScale(), 0x7f1dff, 0.95 * life);
      for (let index = 0; index < 16; index += 1) {
        const angle = (Math.PI * 2 * index) / 16 + now / 380;
        const inner = radius * (0.2 + (index % 3) * 0.06);
        const mid = radius * (0.62 + (index % 4) * 0.09);
        const outer = radius * (1.08 + (index % 2) * 0.16);
        this.beamGraphics.lineBetween(
          beam.x2 + Math.cos(angle) * inner,
          beam.y2 + Math.sin(angle) * inner,
          beam.x2 + Math.cos(angle + 0.12) * mid,
          beam.y2 + Math.sin(angle + 0.12) * mid
        );
        this.beamGraphics.lineBetween(
          beam.x2 + Math.cos(angle + 0.12) * mid,
          beam.y2 + Math.sin(angle + 0.12) * mid,
          beam.x2 + Math.cos(angle - 0.08) * outer,
          beam.y2 + Math.sin(angle - 0.08) * outer
        );
      }
      this.beamGraphics.lineStyle(1.4 * this.getTowerEffectScale(), 0xfdf4ff, 0.72 * life);
      this.beamGraphics.strokeCircle(beam.x2, beam.y2, radius * (0.54 + Math.sin(now / 40) * 0.05));
      return;
    }
    this.beamGraphics.lineStyle((isBurst || isPool ? 3 : 2) * this.getTowerEffectScale(), color, 0.78 * life);
    this.beamGraphics.strokeCircle(beam.x2, beam.y2, radius * (1.05 - life * 0.22));
    this.beamGraphics.lineStyle(1.4 * this.getTowerEffectScale(), isPool ? 0xf0abfc : 0x020617, isPool ? 0.52 * life : 0.36 * life);
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8 + Date.now() / 520;
      const inner = radius * (isPool ? 0.12 : 0.22);
      const outer = radius * (isPool ? 0.9 : 0.72 + (index % 2) * 0.12);
      this.beamGraphics.lineBetween(
        beam.x2 + Math.cos(angle) * inner,
        beam.y2 + Math.sin(angle) * inner,
        beam.x2 + Math.cos(angle) * outer,
        beam.y2 + Math.sin(angle) * outer
      );
    }
    if (isPool) {
      this.beamGraphics.lineStyle(1 * this.getTowerEffectScale(), 0xd8b4fe, 0.38 * life);
      this.beamGraphics.strokeCircle(beam.x2, beam.y2, radius * (0.58 + Math.sin(Date.now() / 94) * 0.04));
    }
  }

  private drawMelisWhisperWave(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(8, beam.width / 2);
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 180) / 420, 0, 1);
    const now = Date.now();
    const scale = this.getTowerEffectScale();
    const pulse = 1 + Math.sin(now / 34) * 0.07;
    this.beamGraphics.lineStyle(4.8 * scale, 0x020617, 0.58 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(2.2 * scale, 0xccfbf1, 0.82 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(1.1 * scale, 0xf0abfc, 0.62 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.fillStyle(0x14b8a6, 0.14 * life);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, radius * 0.92 * pulse);
    this.beamGraphics.fillStyle(0x7c3aed, 0.075 * life);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, radius * 1.26 * pulse);

    for (let ring = 0; ring < 3; ring += 1) {
      const ringRadius = radius * (0.48 + ring * 0.24 + Math.sin(now / 80 + ring) * 0.035);
      this.beamGraphics.lineStyle((3 - ring * 0.55) * scale, ring === 1 ? 0xf0abfc : color, (0.82 - ring * 0.18) * life);
      this.beamGraphics.strokeCircle(beam.x2, beam.y2, ringRadius);
    }

    this.beamGraphics.lineStyle(1.5 * scale, 0xccfbf1, 0.74 * life);
    for (let index = 0; index < 14; index += 1) {
      const angle = (Math.PI * 2 * index) / 14 + Math.sin(now / 220 + index) * 0.32;
      const inner = radius * (0.22 + (index % 2) * 0.08);
      const outer = radius * (0.92 + (index % 4) * 0.09);
      this.beamGraphics.lineBetween(
        beam.x2 + Math.cos(angle) * inner,
        beam.y2 + Math.sin(angle) * inner,
        beam.x2 + Math.cos(angle) * outer,
        beam.y2 + Math.sin(angle) * outer
      );
    }
  }

  private drawMelisWhisperTurnShot(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const life = Phaser.Math.Clamp((beam.ttlMs ?? 180) / 180, 0, 1);
    const scale = this.getTowerEffectScale();
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const wobble = Math.sin(Date.now() / 35) * 4 * scale;
    this.beamGraphics.lineStyle(5.2 * scale, 0x020617, 0.72 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(2.4 * scale, 0xc4b5fd, 0.88 * life);
    this.beamGraphics.lineBetween(beam.x1 + nx * wobble, beam.y1 + ny * wobble, beam.x2 - nx * wobble, beam.y2 - ny * wobble);
    this.beamGraphics.lineStyle(1.2 * scale, color, 0.72 * life);
    for (let index = 0; index < 5; index += 1) {
      const t = (index + 0.5) / 5;
      const x = Phaser.Math.Linear(beam.x1, beam.x2, t);
      const y = Phaser.Math.Linear(beam.y1, beam.y2, t);
      this.beamGraphics.lineBetween(x - nx * 7 * scale - ux * 3, y - ny * 7 * scale - uy * 3, x + nx * 7 * scale + ux * 3, y + ny * 7 * scale + uy * 3);
    }
  }

  private drawMelisWhisperSuicideBurst(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(12, beam.width / 2);
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 380) / 380, 0, 1);
    const scale = this.getTowerEffectScale();
    const now = Date.now();
    this.beamGraphics.fillStyle(0x7f1d1d, 0.16 * life);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, radius * (0.62 + Math.sin(now / 40) * 0.04));
    this.beamGraphics.lineStyle(3.2 * scale, 0xef4444, 0.82 * life);
    this.beamGraphics.strokeCircle(beam.x1, beam.y1, radius * 0.52);
    this.beamGraphics.lineStyle(1.8 * scale, color, 0.72 * life);
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12 + now / 300;
      const inner = radius * 0.18;
      const outer = radius * (0.42 + (index % 3) * 0.1);
      this.beamGraphics.lineBetween(
        beam.x1 + Math.cos(angle) * inner,
        beam.y1 + Math.sin(angle) * inner,
        beam.x1 + Math.cos(angle) * outer,
        beam.y1 + Math.sin(angle) * outer
      );
    }
  }

  private drawMelisUnderworldLink(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const lifeBase = beam.definitionId === "archer-4-underworld-execute" ? 420 : 180;
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 180) / lifeBase, 0, 1);
    const now = Date.now();
    const width = Math.max(2, beam.width * this.getTowerEffectScale());
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const pull = beam.definitionId === "archer-4-underworld-execute";
    this.beamGraphics.lineStyle((pull ? 4.4 : width) * this.getTowerEffectScale(), 0x020617, 0.86 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle((pull ? 2.4 : 1.6) * this.getTowerEffectScale(), color, 0.72 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(0.9 * this.getTowerEffectScale(), 0xf0fdfa, 0.38 * life);
    for (let index = 0; index < 5; index += 1) {
      const t = (index + ((now / 220) % 1)) / 5;
      const x = Phaser.Math.Linear(beam.x1, beam.x2, t);
      const y = Phaser.Math.Linear(beam.y1, beam.y2, t);
      const wave = Math.sin(now / 70 + index * 1.8) * 4 * this.getTowerEffectScale();
      this.beamGraphics.lineBetween(x - nx * (5 + wave), y - ny * (5 + wave), x + nx * (5 - wave), y + ny * (5 - wave));
    }

    if (pull) {
      const radius = Math.max(10, beam.width / 2);
      this.beamGraphics.fillStyle(color, 0.18 * life);
      this.beamGraphics.fillCircle(beam.x2, beam.y2, radius * (1.05 + Math.sin(now / 48) * 0.08));
      this.beamGraphics.lineStyle(2.2 * this.getTowerEffectScale(), 0xf0fdfa, 0.7 * life);
      this.beamGraphics.strokeCircle(beam.x2, beam.y2, radius * (0.8 + life * 0.2));
    }
  }

  private drawMelisBrokenMirrorBurst(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const radius = Math.max(18, beam.width / 2);
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 180) / 520, 0, 1);
    const now = Date.now();
    const scale = this.getTowerEffectScale();
    const pulse = 1 + Math.sin(now / 32) * 0.05;
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;

    this.beamGraphics.lineStyle(9 * scale, 0x020617, 0.82 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(5.4 * scale, 0xfdf4ff, 0.64 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    this.beamGraphics.lineStyle(2.6 * scale, color, 0.92 * life);
    this.beamGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);

    this.beamGraphics.fillStyle(0xfdf4ff, 0.18 * life);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, radius * 0.92 * pulse);
    this.beamGraphics.fillStyle(0xe879f9, 0.12 * life);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, radius * 1.35 * pulse);
    this.beamGraphics.lineStyle(4.2 * scale, 0xfdf4ff, 0.92 * life);
    this.beamGraphics.strokeCircle(beam.x2, beam.y2, radius * (0.82 - life * 0.1));
    this.beamGraphics.lineStyle(2.5 * scale, color, 0.86 * life);
    this.beamGraphics.strokeCircle(beam.x2, beam.y2, radius * (1.18 - life * 0.16));

    this.beamGraphics.lineStyle(2.2 * scale, 0xf0abfc, 0.92 * life);
    for (let index = 0; index < 14; index += 1) {
      const angle = (Math.PI * 2 * index) / 14 + now / 260;
      const inner = radius * (0.18 + (index % 2) * 0.08);
      const outer = radius * (0.76 + (index % 5) * 0.13);
      this.beamGraphics.lineBetween(
        beam.x2 + Math.cos(angle) * inner,
        beam.y2 + Math.sin(angle) * inner,
        beam.x2 + Math.cos(angle) * outer,
        beam.y2 + Math.sin(angle) * outer
      );
    }

    this.beamGraphics.fillStyle(0xfdf4ff, 0.74 * life);
    for (let index = 0; index < 6; index += 1) {
      const t = (index + 1) / 7;
      const x = Phaser.Math.Linear(beam.x1, beam.x2, t);
      const y = Phaser.Math.Linear(beam.y1, beam.y2, t);
      const shard = (5 + (index % 3) * 2) * scale;
      this.beamGraphics.fillTriangle(
        x + nx * shard,
        y + ny * shard,
        x - nx * shard * 0.7,
        y - ny * shard * 0.7,
        x + dx / length * shard * 1.6,
        y + dy / length * shard * 1.6
      );
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

  private drawKinConeWave(beam: BeamSnapshot, color: number) {
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
    const halfWidth = Math.max(4, beam.width / 2);
    const isInstant = beam.definitionId === "zeynep-3-kin-showcase";
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 120) / (isInstant ? 260 : 120), 0, 1);
    const pulse = 0.9 + Math.sin(Date.now() / 70) * 0.1;
    const heading = Math.atan2(dy, dx);
    const halfAngle = Math.atan2(halfWidth, length);

    if (!isInstant) {
      const waveDepth = Math.min(Math.max(12, length * 0.34), 34 * this.getTowerEffectScale());
      const outerRadius = length;
      const innerRadius = Math.max(1, length - waveDepth);
      const steps = 12;
      const outerPoints: Phaser.Geom.Point[] = [];
      const innerPoints: Phaser.Geom.Point[] = [];

      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        const angle = heading - halfAngle + halfAngle * 2 * t;
        const ripple = Math.sin(Date.now() / 90 + index * 1.7) * 2.2 * this.getTowerEffectScale();
        outerPoints.push(new Phaser.Geom.Point(
          beam.x1 + Math.cos(angle) * (outerRadius + ripple),
          beam.y1 + Math.sin(angle) * (outerRadius + ripple)
        ));
        innerPoints.unshift(new Phaser.Geom.Point(
          beam.x1 + Math.cos(angle) * Math.max(1, innerRadius + ripple * 0.35),
          beam.y1 + Math.sin(angle) * Math.max(1, innerRadius + ripple * 0.35)
        ));
      }

      this.beamGraphics.fillStyle(color, 0.18 * life * pulse);
      this.beamGraphics.fillPoints([...outerPoints, ...innerPoints], true);
      for (let band = 0; band < 3; band += 1) {
        const radius = Math.max(1, outerRadius - band * waveDepth * 0.34);
        const alpha = (0.72 - band * 0.18) * life;
        this.beamGraphics.lineStyle(Math.max(1.5, (4 - band) * this.getTowerEffectScale()), band === 0 ? 0xffe4e6 : color, alpha);
        this.beamGraphics.beginPath();
        for (let index = 0; index <= steps; index += 1) {
          const t = index / steps;
          const angle = heading - halfAngle + halfAngle * 2 * t;
          const ripple = Math.sin(Date.now() / 85 + index * 1.6 + band) * 1.8 * this.getTowerEffectScale();
          const x = beam.x1 + Math.cos(angle) * (radius + ripple);
          const y = beam.y1 + Math.sin(angle) * (radius + ripple);
          if (index === 0) {
            this.beamGraphics.moveTo(x, y);
          } else {
            this.beamGraphics.lineTo(x, y);
          }
        }
        this.beamGraphics.strokePath();
      }
      this.beamGraphics.fillStyle(0x7f1d1d, 0.2 * life);
      this.beamGraphics.fillCircle(beam.x2, beam.y2, Math.max(3, halfWidth * 0.08));
      return;
    }

    const startInset = isInstant ? 4 : Math.min(18, length * 0.18);
    const startX = beam.x1 + ux * startInset;
    const startY = beam.y1 + uy * startInset;

    const left = new Phaser.Geom.Point(beam.x2 + nx * halfWidth, beam.y2 + ny * halfWidth);
    const right = new Phaser.Geom.Point(beam.x2 - nx * halfWidth, beam.y2 - ny * halfWidth);
    const origin = new Phaser.Geom.Point(startX, startY);
    const innerLeft = new Phaser.Geom.Point(beam.x2 + nx * halfWidth * 0.72 - ux * 18, beam.y2 + ny * halfWidth * 0.72 - uy * 18);
    const innerRight = new Phaser.Geom.Point(beam.x2 - nx * halfWidth * 0.72 - ux * 18, beam.y2 - ny * halfWidth * 0.72 - uy * 18);

    this.beamGraphics.fillStyle(color, (isInstant ? 0.18 : 0.12) * life * pulse);
    this.beamGraphics.fillPoints([origin, left, right], true);
    this.beamGraphics.lineStyle(Math.max(2, 4 * this.getTowerEffectScale()), color, (isInstant ? 0.74 : 0.52) * life);
    this.beamGraphics.beginPath();
    this.beamGraphics.moveTo(startX, startY);
    this.beamGraphics.lineTo(left.x, left.y);
    this.beamGraphics.moveTo(startX, startY);
    this.beamGraphics.lineTo(right.x, right.y);
    this.beamGraphics.moveTo(innerLeft.x, innerLeft.y);
    this.beamGraphics.lineTo(beam.x2, beam.y2);
    this.beamGraphics.lineTo(innerRight.x, innerRight.y);
    this.beamGraphics.strokePath();
    this.beamGraphics.lineStyle(Math.max(1, 2 * this.getTowerEffectScale()), isInstant ? 0xffe4e6 : 0xfca5a5, (isInstant ? 0.86 : 0.58) * life);
    this.beamGraphics.beginPath();
    this.beamGraphics.moveTo(innerLeft.x, innerLeft.y);
    this.beamGraphics.lineTo(beam.x2, beam.y2);
    this.beamGraphics.lineTo(innerRight.x, innerRight.y);
    this.beamGraphics.strokePath();

    if (isInstant) {
      this.beamGraphics.fillStyle(0xfff1f2, 0.52 * life);
      this.beamGraphics.fillCircle(beam.x2, beam.y2, Math.max(5, halfWidth * 0.12));
    }
  }

  private drawKinShowcaseLight(beam: BeamSnapshot, color: number) {
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
    const life = Phaser.Math.Clamp((beam.ttlMs ?? 260) / 260, 0, 1);
    const flash = Phaser.Math.Clamp((life - 0.18) / 0.82, 0, 1);
    const spread = Math.min(beam.width * 0.42, length * 0.5);
    const coreWidth = Math.max(5, Math.min(18, beam.width * 0.18));
    const pulse = 0.92 + Math.sin(Date.now() / 30) * 0.08;

    for (let index = -2; index <= 2; index += 1) {
      const ratio = index / 2;
      const endX = beam.x2 + nx * spread * ratio;
      const endY = beam.y2 + ny * spread * ratio;
      const width = coreWidth * (index === 0 ? 1.35 : 0.72);
      const alpha = (index === 0 ? 0.88 : 0.42) * flash * pulse;
      this.beamGraphics.lineStyle(width + 10, color, 0.13 * life);
      this.beamGraphics.lineBetween(beam.x1, beam.y1, endX, endY);
      this.beamGraphics.lineStyle(width + 4, color, 0.34 * life);
      this.beamGraphics.lineBetween(beam.x1, beam.y1, endX, endY);
      this.beamGraphics.lineStyle(Math.max(2, width), index === 0 ? 0xfff1f2 : 0xfca5a5, alpha);
      this.beamGraphics.lineBetween(beam.x1, beam.y1, endX, endY);
    }

    this.beamGraphics.fillStyle(color, 0.18 * life);
    this.beamGraphics.fillPoints([
      new Phaser.Geom.Point(beam.x1, beam.y1),
      new Phaser.Geom.Point(beam.x2 + nx * spread, beam.y2 + ny * spread),
      new Phaser.Geom.Point(beam.x2 - nx * spread, beam.y2 - ny * spread)
    ], true);
    this.beamGraphics.fillStyle(0xfff1f2, 0.86 * flash);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, Math.max(5, coreWidth * 0.7));
    this.beamGraphics.fillStyle(0xffe4e6, 0.48 * life);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, Math.max(8, spread * 0.08));
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

  private clearPlacedTowerSelection() {
    if (!this.selectedPlacedTowerId) {
      return;
    }

    this.selectedPlacedTowerId = undefined;
    this.updateSelectionUi();
  }

  private findTowerAt(x: number, y: number) {
    const abartiHit = Array.from(this.towerSnapshots.values()).find((tower) => {
      if (tower.definitionId !== "zeynep-8") {
        return false;
      }

      return this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation ?? "horizontal")
        .some((segment) => {
          const rect = this.getAbartiEdgeSegmentRect(segment);
          return x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 4 && y <= rect.bottom + 4;
        });
    });
    if (abartiHit) {
      return abartiHit;
    }

    const pointerCell = worldToGrid(x, y, this.selectedMapData);
    const sameCellTower = Array.from(this.towerSnapshots.values()).find((tower) => {
      return this.getTowerFootprintCells(tower.x, tower.y, tower.definitionId, tower.orientation)
        .some((cell) => cell.col === pointerCell.col && cell.row === pointerCell.row);
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
    this.updateAbartiOrientationButton(visible);
  }

  private updateAbartiOrientationButton(shopVisible = !this.selectedPlacedTowerId) {
    const visible = shopVisible && this.selectedTowerDefinition.id === "zeynep-8" && !this.selectedPlacedTowerId;
    this.abartiOrientationButton?.setVisible(visible);
    this.abartiOrientationText?.setVisible(visible);
    if (visible) {
      this.abartiOrientationButton?.setInteractive({ useHandCursor: true });
      this.abartiOrientationText?.setInteractive({ useHandCursor: true });
    } else {
      this.abartiOrientationButton?.disableInteractive();
      this.abartiOrientationText?.disableInteractive();
    }
    this.abartiOrientationText?.setText(this.abartiOrientation === "horizontal" ? "Yon: Yatay" : "Yon: Dikey");
  }

  private emitControlState() {
    const selectedTower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    const definition = selectedTower
      ? towerCatalog[selectedTower.characterId].find((tower) => tower.id === selectedTower.definitionId)
      : undefined;
    const upgradeCost = definition ? getTowerUpgradeCost(definition.cost, selectedTower?.level ?? 1, definition.id) : 0;
    const sellRefund = definition ? getTowerSellRefund(definition.cost, selectedTower?.level ?? 1, definition.id) : 0;
    const canUpgrade = Boolean(selectedTower && selectedTower.ownerId === this.localSessionId && selectedTower.level < 10);
    const canSell = Boolean(selectedTower && selectedTower.ownerId === this.localSessionId);
    const cooldowns = this.localPlayerSnapshot?.skillCooldowns ?? [0, 0, 0];
    const reputation = this.localPlayerSnapshot?.reputation ?? 0;
    const authorityChain = this.localPlayerSnapshot?.authorityChain ?? 0;
    const approval = this.localPlayerSnapshot?.approval ?? 0;
    const stress = this.localPlayerSnapshot?.stress ?? 0;
    const spectrumTotal = Math.max(1, approval + stress);
    const stressRatio = Phaser.Math.Clamp(stress / spectrumTotal, 0, 1);
    const isUnderworldTower = selectedTower?.definitionId === "archer-4";

    const orientationHint = !selectedTower && this.selectedTowerDefinition.id === "zeynep-8"
      ? ` | Yon: ${this.abartiOrientation === "horizontal" ? "Yatay" : "Dikey"}`
      : "";
    const towerHint = selectedTower
      ? `${selectedTower.name} Lv.${selectedTower.level} | Hasar ${Math.round(selectedTower.damageDealt ?? 0)} | DPS ${(selectedTower.currentDps ?? 0).toFixed(1)}`
      : `${this.selectedTowerDefinition.name}: ${this.selectedTowerDefinition.cost}g${orientationHint} | haritaya surukle`;

    this.game.events.emit("game:controls-state", {
      visible: true,
      characterName: this.selectedCharacter.displayName,
      hint: towerHint,
      selectedPlacedTowerId: selectedTower?.id,
      selectedTowerDefinitionId: this.selectedTowerDefinition.id,
      showOrientationToggle: this.selectedTowerDefinition.id === "zeynep-8" && !selectedTower,
      orientation: this.abartiOrientation,
      towers: this.selectedCharacter.towers.map((tower) => ({
        id: tower.id,
        name: tower.name,
        cost: tower.cost,
        color: `#${tower.color.toString(16).padStart(6, "0")}`,
        selected: tower.id === this.selectedTowerDefinition.id && !selectedTower
      })),
      skills: this.selectedCharacter.skills.map((skill, index) => {
        const cooldown = cooldowns[index] ?? 0;
        const zeynepCommand = this.localPlayerSnapshot?.characterId === "zeynep" ? getZeynepCommandButtonState(authorityChain) : undefined;
        return {
          slot: index,
          name: skill.name,
          label: cooldown > 0 ? `${cooldown}s` : zeynepCommand ? `${skill.name}\n${zeynepCommand.label}` : skill.name,
          disabled: cooldown > 0
        };
      }),
      zeynepTier: this.pendingZeynepCommandSlot === undefined ? undefined : {
        slot: this.pendingZeynepCommandSlot,
        reputation,
        chainReady: authorityChain >= 2
      },
      zeynepChain: this.localPlayerSnapshot?.characterId === "zeynep" ? {
        value: authorityChain,
        ready: authorityChain >= 2
      } : undefined,
      melisSpectrum: this.localPlayerSnapshot?.characterId === "archer" ? {
        approval,
        stress,
        ratio: stressRatio,
        zone: stressRatio < 0.32 ? "approval" : stressRatio > 0.68 ? "stress" : "balanced",
        intensity: approval + stress
      } : undefined,
      ultimate: {
        charge: this.currentUltimateCharge,
        ready: this.currentUltimateCharge >= 100,
        choiceOpen: this.ultimateChoiceOpen,
        needsChoice: this.selectedCharacterId === "warrior"
      },
      underworldMode: isUnderworldTower ? {
        current: selectedTower.melisUnderworldMode ?? "approval",
        pullCount: selectedTower.melisUnderworldPullCount ?? 0,
        canEdit: selectedTower.ownerId === this.localSessionId
      } : undefined,
      upgrade: {
        label: canUpgrade ? `Upgrade ${upgradeCost}g` : selectedTower ? "Max" : "Kule sec",
        enabled: canUpgrade
      },
      sell: {
        label: canSell ? `Sat ${sellRefund}g` : "Sat",
        enabled: canSell
      },
      selectedStats: selectedTower ? [
        `Toplam hasar: ${Math.round(selectedTower.damageDealt ?? 0)}`,
        `Anlik DPS: ${(selectedTower.currentDps ?? 0).toFixed(1)}`,
        ...(isUnderworldTower ? [
          `Ruh: ${selectedTower.melisUnderworldPullCount ?? 0}`,
          `Mod: ${(selectedTower.melisUnderworldMode ?? "approval") === "approval" ? "Onay" : "Stres"}`
        ] : []),
        canUpgrade ? `Sonraki: ${upgradeCost}g` : "Maksimum level",
        canSell ? `Satis: ${sellRefund}g` : "Sadece sahibi satar"
      ] : undefined
    });
  }

  private updateSelectionUi() {
    const selectedTower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    const selectionKey = selectedTower
      ? `placed|${selectedTower.id}|${selectedTower.level}|${selectedTower.range}|${selectedTower.ownerId}|${selectedTower.status}|${selectedTower.hp}|${selectedTower.maxHp}|${selectedTower.damageDealt}|${selectedTower.currentDps}|${selectedTower.linkedTowerIds?.join(",")}|${selectedTower.melisUnderworldMode ?? ""}|${selectedTower.melisUnderworldPullCount ?? 0}`
      : `new|${this.selectedTowerDefinition.id}|${this.abartiOrientation}`;
    if (this.lastSelectionKey === selectionKey) {
      this.updateAbartiOrientationButton();
      this.emitControlState();
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
      const orientationHint = this.selectedTowerDefinition.id === "zeynep-8"
        ? ` | ${this.abartiOrientation === "horizontal" ? "Yatay" : "Dikey"}`
        : "";
      this.hintText?.setText(`${this.selectedTowerDefinition.name}: ${this.selectedTowerDefinition.cost}g${orientationHint} | haritaya surukle`);
      this.upgradeText?.setText("Kule sec");
      this.upgradeButton?.setAlpha(0.6);
      this.sellText?.setText("Sat");
      this.sellButton?.setAlpha(0.42);
      this.emitControlState();
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
    const hpText = selectedTower.hp !== undefined && selectedTower.maxHp !== undefined
      ? ` | HP ${selectedTower.hp}/${selectedTower.maxHp} Zırh ${selectedTower.armor ?? 0}`
      : "";
    const ammoLabels = { bullet: "Mermi", auraCrystal: "Aura Kristali", powerCrystal: "Güç Kristali" } as const;
    const resourceText = selectedTower.resourceProvider
      ? ` | ${selectedTower.resourceProvider === "ammunition" ? "Mühimmat ikmali" : "Enerji ikmali"}`
      : selectedTower.ammoType
        ? ` | ${ammoLabels[selectedTower.ammoType]} ${selectedTower.ammo ?? 0}/${selectedTower.maxAmmo ?? 0} | Enerji ${selectedTower.energy ?? 0}/${selectedTower.maxEnergy ?? 0}`
        : "";
    const rangeText = selectedTower.definitionId === "warrior-2" ? "Global" : `${Math.round(selectedTower.range)}`;
    this.hintText?.setText(`${selectedTower.name} Lv.${selectedTower.level} | Menzil ${rangeText}${hpText}${resourceText}${status}${linkHint}`);
    this.selectedTowerStatsText?.setText([
      `Toplam hasar: ${Math.round(selectedTower.damageDealt ?? 0)}`,
      `Anlik DPS: ${(selectedTower.currentDps ?? 0).toFixed(1)}`,
      ...(selectedTower.definitionId === "archer-4" ? [
        `Ruh: ${selectedTower.melisUnderworldPullCount ?? 0}`,
        `Mod: ${(selectedTower.melisUnderworldMode ?? "approval") === "approval" ? "Onay" : "Stres"}`
      ] : []),
      canUpgrade ? `Sonraki upgrade: ${cost}g` : "Sonraki upgrade: maksimum level",
      canSell ? `Satis iadesi: ${sellRefund}g` : "Satis: sadece sahibi"
    ].join("\n"));
    this.upgradeText?.setText(canUpgrade ? `Upgrade ${cost}g` : "Upgrade yok");
    this.upgradeButton?.setAlpha(canUpgrade ? 1 : 0.5);
    this.sellText?.setText(canSell ? `Sat ${sellRefund}g` : "Satilamaz");
    this.sellButton?.setAlpha(canSell ? 1 : 0.42);
    this.emitControlState();
  }

  private updateSkillButtons(cooldowns: number[], player?: GameSnapshot["players"][number]) {
    const reputation = player?.reputation ?? 0;
    const authorityChain = player?.authorityChain ?? 0;
    const skillKey = `${cooldowns.join("|")}|${reputation}|${authorityChain}`;
    if (this.lastSkillKey === skillKey) {
      this.emitControlState();
      return;
    }
    this.lastSkillKey = skillKey;

    this.updateZeynepChainPanel(player?.characterId === "zeynep", authorityChain);

    this.selectedCharacter.skills.forEach((skill, index) => {
      const cooldown = cooldowns[index] ?? 0;
      const zeynepCommand = player?.characterId === "zeynep" ? getZeynepCommandButtonState(authorityChain) : undefined;
      const readyLabel = zeynepCommand ? `${skill.name}\n${zeynepCommand.label}` : skill.name;
      const isDisabled = cooldown > 0;
      this.skillTexts[index]?.setText(cooldown > 0 ? `${cooldown}s` : readyLabel);
      this.skillTexts[index]?.setColor(cooldown > 0 ? "#94a3b8" : "#dbeafe");
      this.skillButtons[index]?.setFillStyle(isDisabled ? 0x0f172a : 0x1e293b, isDisabled ? 0.72 : 0.94);
      this.skillButtons[index]?.setStrokeStyle(1, isDisabled ? 0x475569 : 0x60a5fa, isDisabled ? 0.45 : 0.75);
    });
    this.emitControlState();
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
      const y = this.skillRowY;
      graphics.strokeRoundedRect(x - 56, y - 17, 112, 34, 6);
      for (let link = 0; link < 4; link += 1) {
        const linkX = x - 42 + link * 28;
        graphics.lineStyle(2, link % 2 === 0 ? 0xf9a8d4 : 0xfdf2f8, 0.78);
        graphics.strokeEllipse(linkX, y - 20, 17, 7);
        graphics.strokeEllipse(linkX + 10, y - 20, 17, 7);
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
    this.latestPerfSnapshot = snapshot;
    this.snapshotCount += 1;
    this.renderMsSamples.push(renderMs);
    this.renderMsSamples = this.renderMsSamples.slice(-30);

    if (this.snapshotCount % 10 === 0 && snapshot.perf) {
      this.inboundKbSamples.push(snapshot.perf.snapshotBytes / 1024);
      this.inboundKbSamples = this.inboundKbSamples.slice(-12);
    }

    this.updatePerfOverlay(snapshot);
    this.updatePerfPopupText();
  }

  private recordClientPerfSection(section: string, ms: number) {
    const samples = this.clientPerfSectionSamples.get(section) ?? [];
    const now = performance.now();
    samples.push({ at: now, ms });
    const keepAfter = now - 10000;
    while (samples.length > 0 && samples[0].at < keepAfter) {
      samples.shift();
    }
    if (samples.length > 240) {
      samples.splice(0, samples.length - 240);
    }
    this.clientPerfSectionSamples.set(section, samples);
  }

  private getClientPerfAverage(section: string) {
    return average((this.clientPerfSectionSamples.get(section) ?? []).map((sample) => sample.ms));
  }

  private getClientPerfMax(section: string) {
    return maxValue((this.clientPerfSectionSamples.get(section) ?? []).map((sample) => sample.ms));
  }

  private getWorstClientPerfSection() {
    const sections = ["frame", "towers", "beams", "projectiles", "enemies", "drones", "hud", "events", "shop", "map", "snapshotRecv"];
    return sections
      .map((section) => ({
        section,
        averageMs: this.getClientPerfAverage(section),
        maxMs: this.getClientPerfMax(section)
      }))
      .sort((left, right) => right.maxMs - left.maxMs)[0];
  }

  private updatePerfPopupText() {
    if (!this.perfPopupOpen || !this.perfInfoText) {
      return;
    }

    this.perfInfoText.setText(this.getPerfPopupText());
    this.perfInfoText.setColor(this.getPerfDiagnosis().color);
  }

  private getPerfPopupText() {
    const snapshot = this.latestPerfSnapshot;
    const serverPerf = snapshot?.perf;
    const fps = Math.round(this.game.loop.actualFps);
    const averageRenderMs = average(this.renderMsSamples);
    const averageKb = average(this.inboundKbSamples);
    const diagnosis = this.getPerfDiagnosis();
    const worstClient = this.getWorstClientPerfSection();
    const memoryInfo = getBrowserMemoryInfo();
    const canvas = this.game.canvas;
    const entities = snapshot
      ? `Entity: E ${snapshot.enemies.length} | T ${snapshot.towers.length} | P ${snapshot.projectiles.length} | B ${snapshot.beams.length} | D ${snapshot.drones?.length ?? 0}`
      : "Entity: veri bekleniyor";
    const deviceLines = [
      "DEVICE",
      `DPR             ${window.devicePixelRatio.toFixed(2)}`,
      `Canvas px       ${canvas.width} x ${canvas.height}`,
      `CSS px          ${canvas.clientWidth} x ${canvas.clientHeight}`,
      `Memory          ${memoryInfo}`
    ];
    const clientLines = [
      "CLIENT",
      `FPS             ${fps}`,
      `Frame avg       ${roundClientMetric(this.getClientPerfAverage("frame"))} ms`,
      `Frame max10s    ${roundClientMetric(this.getClientPerfMax("frame"))} ms`,
      `Worst max10s    ${formatPerfSectionName(worstClient?.section)} ${roundClientMetric(worstClient?.maxMs ?? 0)} ms`,
      `Snapshot render ${roundClientMetric(averageRenderMs)} ms`,
      `Snapshot recv   ${roundClientMetric(this.getClientPerfAverage("snapshotRecv"))} ms`,
      `Enemies         ${roundClientMetric(this.getClientPerfAverage("enemies"))} ms`,
      `Towers          ${roundClientMetric(this.getClientPerfAverage("towers"))} ms`,
      `Beams           ${roundClientMetric(this.getClientPerfAverage("beams"))} ms`,
      `Projectiles     ${roundClientMetric(this.getClientPerfAverage("projectiles"))} ms`,
      `Drones          ${roundClientMetric(this.getClientPerfAverage("drones"))} ms`,
      `HUD             ${roundClientMetric(this.getClientPerfAverage("hud"))} ms`,
      `Events          ${roundClientMetric(this.getClientPerfAverage("events"))} ms`,
      `Shop sync       ${roundClientMetric(this.getClientPerfAverage("shop"))} ms`,
      `Inbound avg     ${roundClientMetric(averageKb)} KB`,
      `Buffer          q${this.snapshotBuffer.length} / alpha ${this.lastPlaybackAlpha.toFixed(2)} / drop ${this.droppedSnapshotCount}`
    ];
    const serverLines = serverPerf ? [
      "SERVER",
      `Tick avg/max    ${roundClientMetric(serverPerf.tickMs)} / ${roundClientMetric(serverPerf.tickMaxMs)} ms`,
      `Snapshot Hz     ${roundClientMetric(serverPerf.snapshotHz)}`,
      `Snapshot bytes  ${(serverPerf.snapshotBytes / 1024).toFixed(1)} KB`,
      `Spawn           ${roundClientMetric(serverPerf.sections.spawnMs)} ms`,
      `Towers          ${roundClientMetric(serverPerf.sections.towersMs)} ms`,
      `Projectiles     ${roundClientMetric(serverPerf.sections.projectilesMs)} ms`,
      `Enemies         ${roundClientMetric(serverPerf.sections.enemiesMs)} ms`,
      `Snapshot build  ${roundClientMetric(serverPerf.sections.snapshotMs)} ms`,
      `Target checks   ${serverPerf.ops.targetChecks}`,
      `AOE checks      ${serverPerf.ops.aoeChecks}`,
      `Chain checks    ${serverPerf.ops.chainChecks}`,
      `Damage events   ${serverPerf.ops.damageEvents}`
    ] : [
      "SERVER",
      "Veri bekleniyor"
    ];

    return [
      `STATUS: ${diagnosis.level}`,
      `BOTTLENECK: ${diagnosis.reason}`,
      "",
      entities,
      "",
      ...deviceLines,
      "",
      ...clientLines,
      "",
      ...serverLines
    ].join("\n");
  }

  private getPerfDiagnosis() {
    const snapshot = this.latestPerfSnapshot;
    const serverPerf = snapshot?.perf;
    const fps = Math.round(this.game.loop.actualFps);
    const frameMax = this.getClientPerfMax("frame");
    const worstClient = this.getWorstClientPerfSection();
    const averageKb = average(this.inboundKbSamples);

    if (serverPerf && (serverPerf.tickMs >= 18 || serverPerf.tickMaxMs >= 32)) {
      const serverSections = [
        ["towers", serverPerf.sections.towersMs],
        ["projectiles", serverPerf.sections.projectilesMs],
        ["enemies", serverPerf.sections.enemiesMs],
        ["snapshot", serverPerf.sections.snapshotMs],
        ["spawn", serverPerf.sections.spawnMs]
      ] as const;
      const worstServer = [...serverSections].sort((left, right) => right[1] - left[1])[0];
      return {
        level: "KIRMIZI",
        color: "#fb7185",
        reason: `server ${worstServer[0]} (${roundClientMetric(worstServer[1])}ms)`
      };
    }

    if (fps < 35 || frameMax > 34) {
      return {
        level: "KIRMIZI",
        color: "#fb7185",
        reason: `client ${formatPerfSectionName(worstClient?.section)} (${roundClientMetric(worstClient?.maxMs ?? 0)}ms max)`
      };
    }

    if (averageKb > 80 || (serverPerf?.snapshotBytes ?? 0) > 90000) {
      return {
        level: "SARI",
        color: "#fde047",
        reason: `snapshot/network (${roundClientMetric(averageKb)}KB avg)`
      };
    }

    if (serverPerf && (serverPerf.ops.targetChecks > 3500 || serverPerf.ops.aoeChecks > 1200 || serverPerf.ops.chainChecks > 900)) {
      return {
        level: "SARI",
        color: "#fde047",
        reason: `logic checks t${serverPerf.ops.targetChecks}/a${serverPerf.ops.aoeChecks}/c${serverPerf.ops.chainChecks}`
      };
    }

    if (fps < 50 || frameMax > 22 || (serverPerf?.tickMs ?? 0) > 10) {
      return {
        level: "SARI",
        color: "#fde047",
        reason: `borderline ${formatPerfSectionName(worstClient?.section)}`
      };
    }

    return {
      level: "YESIL",
      color: "#86efac",
      reason: "kritik darbogaz yok"
    };
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

function maxValue(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.max(...values);
}

function formatPerfSectionName(section: string | undefined) {
  if (!section) {
    return "unknown";
  }

  const labels: Record<string, string> = {
    frame: "frame",
    towers: "towers",
    beams: "beams",
    projectiles: "projectiles",
    enemies: "enemies",
    drones: "drones",
    hud: "hud",
    events: "events",
    shop: "shop",
    map: "map",
    snapshotRecv: "snapshot recv"
  };
  return labels[section] ?? section;
}

function getBrowserMemoryInfo() {
  const memory = (performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
  }).memory;
  if (!memory?.usedJSHeapSize || !memory.jsHeapSizeLimit) {
    return "destek yok";
  }

  return `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} / ${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(0)} MB`;
}

function getZeynepCommandButtonState(authorityChain: number) {
  return { cost: 10, label: authorityChain >= 2 ? "Zincir Sec" : "Sec" };
}

function getBackgroundMusicPath(characterId: CharacterId) {
  return characterId === "zeynep" || characterId === "archer" ? "/audio/zeynep-theme.mp3" : "/audio/background-theme.mp3";
}

function getEnemySpriteDisplaySize(enemy: Pick<EnemySnapshot, "race" | "type">, cellSize: number) {
  const base = {
    grunt: 34,
    brute: 43.2,
    runner: 40,
    shooter: 38
  }[enemy.type] ?? 34;
  const raceMultiplier = enemy.race === "spaceBug" && enemy.type === "brute" ? 1.3 : enemy.race === "fallen" && enemy.type === "brute" ? 1.1 : 1;
  return base * raceMultiplier * (cellSize / TOWER_GRID_SIZE);
}

function getEnemyTextureKey(enemy: EnemySnapshot) {
  return enemy.race === "meka" ? `enemy-${enemy.type}` : `enemy-${enemy.race}-${enemy.type}`;
}

function getKillStreakRuleByTier(tier: KillStreakTier) {
  return KILL_STREAK_RULES.find((rule) => rule.tier === tier);
}

function getMelisKillStreakImageDisplaySize(scene: Phaser.Scene, imageKey: string, plateHalfWidth: number, plateHalfHeight: number, chaos: number): [number, number] {
  const source = scene.textures.get(imageKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const aspectRatio = source.width / source.height;
  const fromHeight = (height: number): [number, number] => [height * aspectRatio, height];

  if (imageKey === "melis-creepy-legend") {
    return fromHeight(plateHalfHeight * 2.05);
  }

  if (imageKey === "melis-creepy-unstoppable") {
    return fromHeight(plateHalfHeight * 1.8);
  }

  return fromHeight(plateHalfHeight * 1.75);
}

function getMelisKillStreakImageOffsetX(imageKey: string, plateHalfWidth: number) {
  return imageKey === "melis-creepy-legend" ? -plateHalfWidth * 0.66 + 3 : imageKey === "melis-creepy-unstoppable" ? -plateHalfWidth * 0.64 : -plateHalfWidth * 0.6;
}

function getMelisKillStreakImageOffsetY(imageKey: string, plateHalfHeight: number) {
  return imageKey === "melis-creepy-legend" ? -plateHalfHeight * 0.72 : imageKey === "melis-creepy-unstoppable" ? -plateHalfHeight * 0.68 : -plateHalfHeight * 0.62;
}

function getMelisKillStreakImageAngle(imageKey: string, chaos: number) {
  return imageKey === "melis-creepy-unstoppable" ? -10 - chaos * 0.4 : -8 - chaos * 0.6;
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
      style: "creepy",
      textColor: rule.chaos >= 4 ? "#fff1f2" : "#fdf4ff",
      strokeColor: "#050013",
      motif: rule.chaos >= 4 ? "GOTHIC HORROR / BLOOD MIRROR" : rule.chaos >= 3 ? "CURSED BLOOM / CRIMSON STATIC" : "DARK FANTASY / HAUNTED APPROVAL",
      imageKey: rule.tier === "unstoppable" ? "melis-creepy-unstoppable" : rule.chaos >= 3 ? "melis-creepy-legend" : "melis-creepy",
      colors: rule.chaos >= 3
        ? [0xdc2626, 0x581c87, 0xf0abfc, 0x050008] as const
        : [0xbe123c, 0x6d28d9, 0xf43f5e, 0x07000f] as const
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

function roundClientMetric(value: number) {
  return Math.round(value * 10) / 10;
}

/**
 * Ordinal by construction: the old palette cycled through unrelated hues, so
 * level 7 looked no higher than level 3. This one only heats up -- steel, cyan,
 * lime, gold, ember, white -- and every other cue rises with it too.
 */
function getTowerLevelStyle(level: number) {
  const normalizedLevel = Phaser.Math.Clamp(Math.round(level), 1, 10);
  const heat = [
    0x94a3b8,
    0x7dd3fc,
    0x22d3ee,
    0x34d399,
    0xa3e635,
    0xfacc15,
    0xfb923c,
    0xf97316,
    0xef4444,
    0xfff1f2
  ];

  return {
    color: heat[normalizedLevel - 1],
    fill: normalizedLevel / 10,
    width: 1.8 + (normalizedLevel - 1) * (2.4 / 9),
    glow: normalizedLevel >= 6
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
