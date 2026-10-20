import { HARVESTER_QUOTA } from "@karayel/shared";
import { buildWorkerRoster, getWorkerRosterRole, listResourceNodes, resolveWorkerMapTarget, type WorkerPick, type WorkerRosterState } from "../worker-roster";
import { getTowerMaxLevel } from "@karayel/shared";
import { ACTIVE_WORKER_ROLES, isTransportProduct } from "@karayel/shared";
import Phaser from "phaser";
import { openChoiceDialog, openConfirmDialog, openDefenseDialog, defenseSummaryLines } from "../defense-ui";
import { TOWER_STATS_REFRESH_MS, type TowerStatsWire } from "@karayel/shared";
import { isTutorialPrepareId, type TutorialProgressMessage } from "@karayel/shared";
import type { TutorialCommand, TutorialFacts } from "../tutorial";
import type { TowerSheetInput, TowerSheetNote } from "../tower-sheet";
import type { TowerSheetRect, TowerSheetReport } from "../game-control-ui";
import { placeSelectedPanel, screenRatioRectToWorld, type PlacementSide } from "../selected-panel-placement";
import type { DefenseSummary, TowerPreview, LogisticsPriority, MapScale, QuickStartMode, RunSummary, RunUltimateMoment } from "@karayel/shared";
import {
  ArchiveOfferLatch,
  BadgeNoticeQueue,
  BadgeRunWatch,
  DEFAULT_MAP_SCALE,
  countsAsTower,
  formatBadgeNotice,
  formatBannerSecondLine,
  getBadgeDefinition,
  getBadgeNoticeMoment,
  getTowerCrownPoints,
  isRepairDepotDefinition,
  resolveFirstLiveWave,
  TOWER_HEALTH_BAR_LIFT_PX,
  MatchResultLatch,
  RUN_REPORT_ACTIONABLE_AFTER_MS,
  buildRunReportView,
  getArchiveRun,
  getRunReportCues,
  isFinaleClear,
  pickBetterUltimate,
  planRunReportActions,
  resolveLocalRunSlot,
  CARD_PICKABLE_AFTER_MS,
  ComboStampGate,
  WaveReportTracker,
  getComboStampText,
  getSynergyCulpritNotice,
  sanitizeComboStampMessage,
  type ComboStampMessage,
  CHAMPION_LABEL,
  getChampionDownText,
  getHeavyWaveHpStep,
  sanitizeChampionDownMessage,
  type ChampionDownMessage,
  getHeaterRadius,
  type CounterSurgeSnapshot,
  type SpecialEnemyKind
} from "@karayel/shared";
import { Room } from "colyseus.js";
import { CombatVfx, readTextureAccent } from "../vfx/combat-vfx";
import { AtakanSignatureVfx, type SignatureFrame } from "../vfx/atakan-signatures";
import { TAHT_COPY_ID, ZeynepReceiptTracker, ZeynepSignatureVfx, type CourtEventInput, type CourtFrame, type ReceiptContext } from "../vfx/zeynep-signatures";
import { getTowerBodySize, getTowerSpriteSize, getTowerTextureKey, TOWER_VISUAL_SCALE } from "../tower-art";
import { ATAKAN_ULTIMATE_DRONE_VISUAL_SCALE, PROJECTILE_VISUAL_SCALE, WORKER_VISUAL_SCALE } from "../visual-scale";
import { arcade } from "../arcade";
import { getArcadeRunScore } from "../arcade-score";
import { AttackVfx, findHomingMuzzleOrigin } from "../vfx/attack-vfx";
import { BeamInterpolator, BeamRenderer, type BeamRenderOptions } from "../vfx/beam-renderer";
import { FlashPool, GlowStampPool } from "../vfx/flash-pool";
import { fnvHash, hashNoise, TEAMMATE_EXTRA_ALPHA, toTier } from "../vfx/kit";
import { drawServerReactorArcs, type ServerReactorInput } from "../vfx/server-reactor";
import { VfxLod } from "../vfx/lod";
import { LegendaryProcVfx, sanitizeLegendaryProc } from "../vfx/legendary-procs";
import { getProfileDefinitionId, getVfxProfile, getVfxTier } from "../vfx/vfx-profiles";
import type { ProjectileContactSnapshot } from "@karayel/shared";
import type { MekaShieldSnapshot, RaceMechanicId } from "@karayel/shared";
import {
  AssistToastGate,
  decodeKillAssists,
  getKillAssistText,
  pickLocalKillAssist,
  characters,
  resolvePlayableCharacterId,
  GAME_WORLD_WIDTH,
  HIRABLE_WORKER_ROLES,
  type HirableWorkerRole,
  WORKER_ROLE_DESCRIPTIONS,
  WORKER_ROLE_LABELS,
  WORKER_DEVELOPMENT_CELLS,
  WORKER_SKILL_TIERS,
  WORKER_SPECIALIZATION_CHOICES,
  getWorkerHireCostWithModifiers,
  isHirableWorkerRole,
  TOWER_BUILD_TOP,
  TOWER_GRID_SIZE,
  GAME_SPEED_MULTIPLIER,
  createDefaultEditableMap,
  getMapGridSize as getSharedMapGridSize,
  getMapOrigin,
  getEdgeSegments,
  isAbartiEdgeAnchored,
  isEdgeSegmentInsideBoard,
  occupiesTowerSlot,
  DEFAULT_ARENA_CHROME,
  type ArenaChrome,
  getArenaCameraView,
  MELIS_EVOLUTION_STRESS_COSTS,
  getMelisSpectrumZone,
  getUltimatePowerMultiplier,
  getUltimatePowerUpgradeCost,
  getUcubePerkTier,
  getMelisZoneEffectText,
  getMapWorldBounds,
  getMapPoints,
  getLinearProjectilePosition,
  getTerminalProjectileSnapshot,
  getTowerGridSpan,
  getStage,
  getTowerTier,
  getTowerBuildCost,
  PLAYER_TOWER_LIMIT,
  resolveTowerRefund,
  getTowerLevelExpCost,
  getTowerLevelGoldCost,
  getTowerPerformanceFlameIntensity,
  getShopItem,
  getShopItemPrice,
  getTowerGrantedUnlocks,
  isShopItemAlreadyUnlocked,
  isShopItemUnlockRedundant,
  MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER,
  getTile,
  gridToWorld,
  hydrateWireSnapshot,
  mergeDynamicEnemySnapshots,
  mergeDynamicRecordSnapshots,
  mergeDynamicTowerSnapshots,
  isInsideMap,
  isClientProjectileExpired,
  normalizeMapData,
  pruneStaticSnapshotCache,
  worldToGrid,
  canAcceptTargetedCard,
  canTowerHoldTargetedCard,
  cardReachesTower,
  getCardDefinition,
  getCardRarity,
  getCardTowerReach,
  MAX_TARGETED_CARDS_PER_TOWER,
  towerCatalog,
  type CharacterDefinition,
  type CardDefinition,
  type CharacterId,
  type DamageEventSnapshot,
  FEEDBACK_KIND_RULES,
  getDamageEventOwnerSlot,
  RecentEnemyTraces,
  COIN_CARRY_MS,
  UPGRADE_READY_FLASH_GAP_MS,
  getLumpGoldGain,
  getUpgradeReadyTowerIds,
  getDeathBurstShape,
  getKillFeedbackWeight,
  isEnemyHitFlashActive,
  shouldStartEnemyHitFlash,
  tintAccentColor,
  CARD_PICK_STAMP_MS,
  WAVE_CLEAR_STAMP_MS,
  WaveClearWatch,
  getCardDealTiming,
  getCardDraftTitle,
  getCardDraftWave,
  getCardRevealCues,
  getWaveClearStampText,
  countEquippableTowers,
  getInventoryEquipCue,
  getInventoryEquipRejectedCue,
  canEquipShopItem,
  getShopPurchaseCue,
  getStructureRepairCue,
  getStructureRepairAllCue,
  getUltimateUpgradeCue,
  getWorkerDevelopmentCue,
  KillComboWatch,
  STREAK_BANNER_HANDOFF_MS,
  STREAK_VOICE_HOLD_MAX_MS,
  StreakBannerQueue,
  KILL_STREAK_VOICE_URLS,
  killStreakRuleGrantsBuff,
  getKillStreakRule as getSharedKillStreakRule,
  getKillStreakTierRank,
  getComboWindowMs,
  getKillStreakBuffRealMs,
  getKillStreakBuffText,
  getStreakBuffedTowerIds,
  getStreakGlowAlpha,
  isStaleKillEvent,
  FreshTowerSpawns,
  TIER_CEREMONY_MS,
  TIER_CEREMONY_SHARDS,
  TOWER_LANDING_DUST_MS,
  TOWER_LANDING_MS,
  getTowerLandingScale,
  getTowerLevelCeremony,
  type TowerLevelCeremony,
  ULTIMATE_CAST_ZOOM_MS,
  ULTIMATE_SHOCKWAVE_MS,
  ULTIMATE_STAMP_LAG_MS,
  ULTIMATE_STAMP_MS,
  UltimateReadyWatch,
  getUltimateCastZoom,
  getUltimateColumnSpan,
  getUltimateResultKind,
  getUltimateStampText,
  getUltimateTeamChipText,
  type UltimateCastMessage,
  getServerLinkJoinedText,
  getRiskyInvestmentNoticeText,
  getServerKnowledgeBonus,
  getServerKnowledgeTopBonus,
  SERVER_KNOWLEDGE_EFFECTS,
  SERVER_KNOWLEDGE_TYPES,
  ATAKAN_EXECUTE_SLOT,
  ATAKAN_SHIELD_SLOT,
  beginMetalShieldGesture,
  endMetalShieldGesture,
  getMetalShieldMaxLength,
  getMetalShieldRejectText,
  getMetalShieldWallDurationMs,
  moveMetalShieldGesture,
  type MetalShieldGesture,
  type MetalShieldGestureContext,
  type MetalShieldSegment,
  type MetalShieldSnapshot,
  SKILL_GESTURE_SLOT,
  ZEYNEP_COMMAND_TIER_COST,
  beginSkillGesture,
  dropSkillGesturePointer,
  endSkillGesture,
  getSkillGestureHoldProgress,
  getSkillGestureTargets,
  getSkillGestureThresholds,
  getSkillGestureTier,
  getSkillGestureTierLabel,
  moveSkillGesture,
  tickSkillGesture,
  type SkillGesture,
  type SkillGestureCast,
  type SkillGestureContext,
  getExecuteRejectText,
  isExecuteImmune,
  isExecuteTeamSide,
  pickExecuteTapTarget,
  type ExecuteTapCandidate,
  type SkillExecuteMessage,
  type SkillRejectedMessage,
  type ServerLinkJoinedMessage,
  type RiskyInvestmentMessage,
  type UltimateResultMessage,
  type KillStreakTier,
  type ConfirmationPulseStyle,
  type InventoryEquipRejectedMessage,
  type InventoryEquippedMessage,
  type ServerConfirmationCue,
  type ShopPurchasedMessage,
  type StructureRepairedMessage,
  type StructureRepairedAllMessage,
  type RepairAllCandidate,
  type UltimateUpgradedMessage,
  type WorkerDevelopmentUnlockedMessage,
  type CardRarity,
  type EnemyType,
  type KillEventSnapshot,
  type CrystalNodeSnapshot,
  type AmmoNodeSnapshot,
  type DroneSnapshot,
  type EditableMapData,
  type EnemySnapshot,
  type BeamSnapshot,
  type GameSnapshot,
  type ProjectileSnapshot,
  type ProjectileSpawnSnapshot,
  type ProjectileHitSnapshot,
  type ServerPerfSnapshot,
  hasUnlockBit,
  TOWER_HEAT_BRAKE_TEMPERATURE,
  DEBUG_LASER_OVERDRIVE_UNLOCK_LEVEL,
  DEBUG_LASER_TWIN_OVERDRIVE_LEVEL,
  getStructureRepairCostWithModifiers,
  planRepairAll,
  getRepairAllButtonState,
  WALL_TOWER_ID,
  WALL_LINE_HANDLE_DRAG_PX,
  WALL_LINE_HANDLE_TOUCH_PX,
  WALL_LINE_HANDLE_VISIBLE_MS,
  advanceWallDwell,
  constrainWallHandleFinger,
  getAffordableWallPieces,
  getWallDwellProgress,
  getWallLine,
  getWallRunEnds,
  getWallSegmentCenter,
  pickAffordableWallPieces,
  startWallDwell,
  wallTower,
  type EdgeSegment,
  type WallDwellState,
  type WallLineAxis,
  isOperationalTower,
  type StaticEnemySnapshot,
  type StaticSnapshot,
  type DynamicEnemySnapshot,
  type DynamicTowerSnapshot,
  type StaticTowerSnapshot,
  type TowerDefinition,
  type TowerSnapshot,
  type WireGameSnapshot,
  // Dusmanin cizilen boyu ve isabet govdesi ayni tablodan (enemy-display,
  // enemy-body): sunucu vurusu, burada cizilen govdeyle hesapliyor.
  AIR_ENEMY_DISPLAY_SCALE,
  // Saldiri dronunun cizim olcegi sunucunun dron govdesiyle ayni sayi.
  ATAKAN_ATTACK_DRONE_BODY,
  // Yorunge bicaginin cizilen govdesi sunucunun bicak taramasiyla ayni oranlardan.
  ORBIT_BLADE_BODY,
  getOrbitBladeInner,
  ENEMY_TEXTURE_SIZE,
  // Dokunun acisi sunucunun govde yonuyle ayni yonden (enemy-body).
  getBodyHeadingRotation,
  getProjectileSceneScale,
  getEnemyArtScale,
  getEnemyBodyScale,
  getEnemySpriteDisplaySize,
  getEnemyTextureKey
} from "@karayel/shared";
import type { WorkerSkillChoice } from "@karayel/shared";
import { gameServerUrl, healthUrl } from "../config";
import { SnapshotPlaybackClock } from "@karayel/shared";
import {
  clearActiveLobbyRoom,
  clearMatchReconnect,
  createOwnerSecret,
  getActiveLobbyRoom,
  getSharedClient,
  isServerFullError,
  leaveMatchAndReload,
  retryExpiredSeatReservation,
  saveMatchReconnect,
  setActiveLobbyRoom,
  takeResumedMatch,
  withWireCaps
} from "../online-session";
import { configureHiDpiCamera, getSceneRenderScale } from "../rendering";
import { getClearedStages, markStageCleared } from "../stage-progress";
import { recordRun, type RunRecordOutcome } from "../run-records";
import { markArchiveOffered, recordArchiveRunResult } from "../card-archive";
import { removeRunReport, renderRunReport, type RunReportChoice, type RunReportNote } from "../run-report-ui";
import { saveQuickStartIntent } from "../quick-start";
import { readResolvedCosmetics, recordRunProgress, recordWaveBadges, resolveRoomFirstLiveWave, type RunProgressOutcome } from "../progress-store";
import { createWaveReportElement, getWaveReportKey } from "../wave-report-ui";
import { ammoTypeLabels, attackShapeLabels, cardRarityLabels, damageTypeCodex, hitTypeCodex, towerAxisLabels } from "../codex";
import type { HudState, TeamAssistToast, TeamNoticeToast, TeamStreakToast, TeamUltimateChip, UltimateStampEvent } from "../game-control-ui";
import { EMPTY_HUD_STATS } from "../game-control-ui";
import { FeedbackDirector, type FeedbackKind } from "../feedback-director";
import {
  ATLAS_DUCK_GAIN,
  ATLAS_DUCK_TIME_CONSTANT,
  AtlasOnceSet,
  AtlasTowerWatch,
  AtlasVoice,
  AtlasWaveWatch,
  createAtlasWebAudio,
  readAtlasEnabled,
  readAtlasWelcomed,
  writeAtlasEnabled,
  writeAtlasWelcomed
} from "../atlas-voice";
import {
  AtlasNexusDropWatch,
  AtlasSkillComboWatch,
  findDueAtlasDialogues,
  getAtlasDialogueUrls,
  getStageDialogues,
  isAtlasDialogueEvent,
  readAtlasDialoguePlayed,
  writeAtlasDialoguePlayed
} from "../atlas-dialogue";
import { AtlasAmbientScheduler, ATLAS_AMBIENT_LINES } from "../atlas-ambient";
import { BLADE_TOWER_ID, BeamHitTracker, getBladeHitTier, isHitSoundFresh, resolveHitVoice, type HitVoiceId } from "../hit-sounds";
import { getKillSoundCue } from "../sfx-samples";
import { COIN_LIFT_RATIO, DamageNumberPool } from "../vfx/damage-numbers";
import { WorldLabelPool } from "../vfx/world-labels";
import {
  SPECIAL_MARK_COLORS,
  SpecialThreatNotices,
  drawEaterDrain,
  drawSpecialEnemyMarker,
  interpolateCounterSurges,
  isSpecialEnemyKind,
  sanitizeSurgeHitMessage
} from "../vfx/special-threats";
import {
  MekaShieldImpacts,
  RACE_MECHANIC_NOTICE_KEYS,
  RACE_TRANSIENT,
  RaceMechanicNotices,
  RaceTransientEffects,
  drawBurrowCracks,
  drawBurrowFurrow,
  drawFoldWarning,
  drawMekaShield,
  drawPetrifyPlating,
  drawPhaseGhost,
  drawSoulDrawerMark,
  getBurrowTelegraphProgress,
  getFoldWarningProgress,
  getMekaShieldFlightProgress,
  getRaceMaxHpScale,
  getVisibleRaceMechanic,
  raceSeed,
  readMekaShields,
  readRaceTraitView,
  sanitizeMekaBlockMessage,
  sanitizeSoulDrawMessage,
  type RaceTraitView
} from "../vfx/race-traits";
import {
  AEGIS_BLOCK_SOUND_CUE,
  AegisImpacts,
  COUNTER_SURGE_NOTICE_KEYS,
  COUNTER_SURGE_SOUND_CUES,
  COUNTER_SURGE_STYLES,
  createCounterSurgeBand,
  drawCounterSurge,
  getCounterSurgeAlertPoint,
  getCounterSurgeBand,
  readCounterSurges,
  sanitizeSurgeBlockMessage,
  type CounterSurgeBand
} from "../vfx/counter-surge";
import { drawMetalShield, drawMetalShieldPreview, getMetalShieldExtent, interpolateMetalShields, isMetalShieldSnapshot } from "../vfx/metal-shield";
import { OPERATOR_BODY_DISPLAY_SIZE, OperatorBodyView, interpolateOperatorBodies } from "../vfx/operator-bodies";
import { SynergyMarks, type SynergyAnnouncement } from "../vfx/synergy-marks";
import { EnemyHeadingTracker, findContactEnemy, getContactServerTime, resolveHitAnchor, type HitAnchor } from "../vfx/enemy-bodies";
import { PlacementRangePreview } from "../vfx/placement-range";
import { WallLineView, type WallHandleMark } from "../vfx/wall-line";
import { SkillGestureView } from "../vfx/skill-gesture";
import { MatchEndStage } from "../vfx/match-end-stage";
import { MATCH_END_HUSK_TINT, MATCH_END_POWERED_DOWN_TINT } from "../vfx/match-end-vfx";
import { MATCH_END_TIMING, getAtlasLineSeconds, shouldPlayMatchEndSequence, type MatchEndStructure } from "../match-end-sequence";
import { drawBuildZones, getBuildZoneRenderKey, isPlacementBlockedByBuildZone } from "../vfx/build-zones";
import type { BuildZoneMap } from "@karayel/shared";
import { CHARACTER_CLASS_COLORS, getCharacterColorCss, getCharacterColorValue } from "../character-colors";
import { isTelemetryActive, reportTelemetryError, runTelemetry } from "../telemetry";
import { MatchDebugSampler, browserFamily, osFamily } from "../match-debug";
import { assetUrl } from "../asset-url";
// Muzik kaydiricisinin deposu ve varsayilani menudeki lobi muzigiyle ortak.
import { DEFAULT_MUSIC_VOLUME, MUSIC_VOLUME_STORAGE_KEY } from "../menu-music";
import { getWaveMusicLevel, getWaveMusicTrackForState, WAVE_MUSIC_TRACKS, WaveMusicPlayer } from "../wave-music";
import { getLocale, t, tMaybe, upper } from "../i18n";
import type { MessageKey } from "../locales/tr";
import { describeServerError, localizeDefenseSummary, localizeRunSummary, localizeServerText, localizeTowerPreview } from "../server-text";
import { enChampionLabel } from "../locales/catalog/en-progression";

type GameSceneData = {
  characterId?: CharacterId;
  mapData?: EditableMapData;
  creative?: boolean;
  /** Ogretici asamasi (menudeki Eğitim); sunucu tek kisilik odada kabul ediyor. */
  tutorial?: boolean;
  stage?: number;
};

/**
 * Sonuc ekraninin girdisi: `match:*` mesaji ya da sonucu tasiyan snapshot.
 * Asama ve yaratici bayragi kaydin kapisina gidiyor; ikisi de sunucudan.
 */
type MatchResultSummary = {
  wave: number;
  kills: number;
  stage?: number;
  creative?: boolean;
  /** Ogretici kosusu (`match:*` mesaji ya da snapshot bayragi). */
  tutorial?: boolean;
  /** Kosu raporu; yalnizca `match:*` mesajinda var, snapshot'ta yok. */
  run?: RunSummary;
  /** Yenilgi bir operator bedeninin dusmesiyle geldiyse sahibi. */
  bodyOwnerId?: string;
};

/**
 * Acik kosu raporunun durumu. Asama, yaratici bayragi ve asama kaydi ekran
 * acilirken bir kez sabitleniyor; rapor sonradan gelirse yalnizca `run`
 * dolup ekran yeniden ciziliyor.
 */
type MatchReportState = {
  result: "victory" | "defeat";
  summary: MatchResultSummary;
  run?: RunSummary;
  creative: boolean;
  /** Ogretici kosusu: rapor yalnizca "Ana Menü" ve "kaydedilmez" satiriyla. */
  tutorial?: boolean;
  stage?: number;
  stageResult?: ReturnType<typeof markStageCleared>;
};

/** Sunucunun yaratici modda yolladigi o anki kurulum. */
type CreativeLoadout = {
  wave: number;
  cardIds: string[];
  itemIds: string[];
  towers: Array<{ id: string; definitionId: string; level: number; cardIds: string[]; itemIds: string[] }>;
};

type ControlActionDetail = {
  action:
    | "selectTower"
    | "towerDragStart"
    | "towerDragMove"
    | "towerDragEnd"
    | "towerDragCancel"
    | "useSkill"
    | "useZeynepTier"
    | "useUltimate"
    | "useUltimateMode"
    | "upgradeUltimatePower"
    | "upgradeTower"
    | "creativeLevel"
    | "creativeCard"
    | "creativeItem"
    | "creativeWave"
    | "creativeSpawn"
    | "sellTower"
    | "clearTowerSelection"
    | "repairStructure"
    | "repairAll"
    | "setUnderworldMode"
    | "toggleAmmoLogistics"
    | "setFactoryProduction"
    | "setLogisticsPriority"
    | "showDefenseSummary"
    | "toggleWallGate"
    | "toggleWorkerBanMode"
    | "toggleTowerStandby"
    | "setWorkerTier"
    | "hireWorker"
    | "selectWorker"
    | "setWorkerProduct"
    | "cancelWorkerAssign"
    | "unlockWorkerDevelopment"
    | "setMelisStance"
    | "setTowerPerformance"
    | "buyShopItem"
    | "rerollShop"
    | "closeShop"
    | "setTargeting"
    | "toggleAbartiOrientation"
    | "continueWave"
    | "togglePerfHud"
    | "toggleStatsHud"
    | "setStatsTab"
    | "toggleAudioHud"
    | "setMusicVolume"
    | "setVoiceVolume"
    | "setSfxVolume"
    | "setHitVolume"
    | "setVibration"
    | "setAtlasVoice"
    | "quitMatch"
    | "openInventory"
    | "closeInventory"
    | "selectInventoryItem"
    | "cancelEquip"
    | "clearSelection";
  towerId?: string;
  ammoType?: "bullet" | "auraCrystal" | "powerCrystal";
  priority?: LogisticsPriority;
  slot?: number;
  tier?: ZeynepCommandTier;
  role?: string;
  skillId?: string;
  stance?: string;
  mode?: "attack" | "repair";
  underworldMode?: "approval" | "stress";
  performance?: number;
  itemId?: string;
  targetingMode?: string;
  clientX?: number;
  clientY?: number;
  level?: number;
  cardId?: string;
  wave?: number;
  count?: number;
  on?: boolean;
  value?: number;
  workerId?: string;
  product?: string;
};

type RenderTower = {
  effect: Phaser.GameObjects.Graphics;
  linkHighlight: Phaser.GameObjects.Arc;
  /** Level dial, drawn over the sprite. Replaces the old under-sprite halo. */
  halo: Phaser.GameObjects.Graphics;
  base: Phaser.GameObjects.Image;
  /**
   * Yukseltme nabzi. Ayri bir carpan olarak durur cunku `base`in olcegi her
   * snapshot'ta secim ve ayak izinden yeniden hesaplaniyor; dogrudan
   * scaleX/scaleY tweenlemek bir sonraki snapshot'ta silinirdi.
   */
  punch: { value: number };
  /**
   * Nabiz ve inis haric olcek: son snapshot'ta secim, doku ve ayak izinden.
   * Karede yalnizca carpan degisiyor; kurulumda snapshot 500 ms'de bir
   * gelebildigi icin carpan oraya birakilsa 150 ms'lik inis hic gorunmezdi.
   */
  scaleX: number;
  scaleY: number;
  /** Yerlestirme inisinin basladigi an; inis bitince yok. */
  landingAt?: number;
  range: Phaser.GameObjects.Arc;
  deadZone: Phaser.GameObjects.Arc;
  isolation: Phaser.GameObjects.Graphics;
  healthBar: Phaser.GameObjects.Graphics;
  key: string;
};

type RenderMover = {
  sprite: Phaser.Physics.Arcade.Sprite;
  healthBar?: Phaser.GameObjects.Graphics;
  shieldHalo?: Phaser.GameObjects.Arc;
  marker?: Phaser.GameObjects.Text;
  curseMarker?: Phaser.GameObjects.Text;
  doubtMarker?: Phaser.GameObjects.Text;
  armorBreakIcon?: Phaser.GameObjects.Image;
  bleedEffect?: Phaser.GameObjects.Graphics;
  /** Kirag ve buz kabugu ayni yuzeyde: ikisi de ayni sogugun iki siddeti. */
  frostEffect?: Phaser.GameObjects.Graphics;
  /** Son karede cizilen tur ve hareket bicimi; kaldirilinca olum patlamasina iz oluyor. */
  type?: EnemyType;
  air?: boolean;
  /** Son karedeki ekran boyu (dunya px). */
  displaySize?: number;
  /** Flas haric taban ton; patlamanin rengi flasin beyazini almasin. */
  baseTint?: number;
  /** Bir onceki karedeki can + kalkan; dusus vurus demek. */
  lastEffectiveHp?: number;
  /** Son vurus flasinin basladigi an; hiz siniri da buradan. */
  hitFlashAt?: number;
  /** Kozmetik itmenin ani ve yonu (piksel); karedeki uygulanan payi. */
  knockAt?: number;
  knockX?: number;
  knockY?: number;
  knockDx?: number;
  knockDy?: number;
  /** Sampiyonun sabit isareti ("[Ş]"); normal dusmanda yok. */
  crown?: Phaser.GameObjects.Text;
  /** Ozel dusmanin isareti (avci ayraclari, isitici halkasi, yiyici altigeni ve emme hatti). */
  specialEffect?: Phaser.GameObjects.Graphics;
  /** Ozel dusman turu; infaz dokunusunda bagisiklik icin. */
  specialKind?: SpecialEnemyKind;
  /** Son karede takimin tarafinda mi (hukmedilmis, olumsuz, cevrilmis); Execute bunlari secmiyor. */
  teamSide?: boolean;
  /** Irk mekanigi yuzeyi (tas levhalar, faz hayaleti, yigin kertikleri); yalnizca gereken dusmanda aciliyor. */
  raceEffect?: Phaser.GameObjects.Graphics;
  /** Son karede yer altinda mi (kazma tozu ve cikis patlamasi gecisten). */
  raceBurrowed?: boolean;
  /** Son karede hedeflenemez mi (yer alti ya da faz); Execute dokunusu atliyor. */
  raceUntargetable?: boolean;
  /** Son karedeki katlanma uyarisi (hedef); kalkinca sicrama mi oldu iptal mi, konumdan. */
  raceFoldX?: number;
  raceFoldY?: number;
  /** Uyari evresinde son gorulen konum: kirisigin kalkis ucu. */
  raceFoldFromX?: number;
  raceFoldFromY?: number;
};

/** Kaldirilan dusmanin izi: oldurme olayi patlamayi buradan ciziyor. */
type RemovedEnemyTrace = {
  x: number;
  y: number;
  size: number;
  texture: string;
  tint: number;
  type: EnemyType;
  air: boolean;
  /** Olum sesi icin: sampiyon mu (sampiyon buyuk portalla dusuyor). */
  champion: boolean;
  /** Ozel tehdit (Kule Avcisi, Enerji Yiyici...); ATLAS'in ovgusu icin. */
  special?: SpecialEnemyKind;
};

/**
 * Rapor dugmesine kosunun raporu gelmeden basildiginda yeniden yuklemenin en
 * fazla bekledigi sure. `run:sync` cevabi normalde bir gidis-donus; sinir olu
 * bir baglantinin oyuncuyu raporda tutmasini engelliyor.
 */
const RUN_REPORT_RELOAD_WAIT_MS = 1500;
/** Performans kolu surukleme gonderimi: saniyede en fazla ~25 mesaj. */
const PERFORMANCE_SEND_INTERVAL_MS = 40;

/** Takim arkadasinin oldurmesinin patlamasi: gorunsun ama seninkiyle yarismasin. */
const TEAMMATE_DEATH_BURST_INTENSITY = 0.5;
/** Takim arkadasinin kademe sutunu ve inis tozu: ayni kural, soluk. */
const TEAMMATE_TOWER_MOMENT_INTENSITY = 0.5;
/**
 * Seviye etiketinin kulenin diskinin ustunden yuksekligi (dunya px): can
 * cubugunun (disk ustu - 8) ve "yukseltme hazir" ▲'inin (disk ustu - 11)
 * ustunde, ikisini ortmesin.
 */
const LEVEL_LABEL_LIFT_PX = 26;
/**
 * Etiket boyu: kademe siradan seviyeden buyuk, takim arkadasininki en kucuk ve
 * soluk. Kademe etiketi uzun ("SV 5 · KADEME 2", arenanin ~%30'u); daha
 * buyugu dalga ortasinda yolu ortuyordu, vurguyu renk ve pop veriyor.
 */
const LEVEL_LABEL_FONT_PX = 12;
const TIER_LABEL_FONT_PX = 13;
const TEAMMATE_LEVEL_LABEL_FONT_PX = 11;
const TEAMMATE_LEVEL_LABEL_ALPHA = 0.55;
/**
 * Sinerji damgasinin renkleri: yalnizlik Izolasyon alaninin turkuazi, dizilim
 * sentez isininin pembesi, bozulma ise hayaletin "konamaz" kirmizisinin acigi.
 * Kazanc ve kayip bakmadan ayrilsin.
 */
const SYNERGY_ISOLATION_FILL = "#7fe5e8";
const SYNERGY_FORMATION_FILL = "#f9a8d4";
const SYNERGY_LOST_FILL = "#fca5a5";
/** Takim arkadasi sinerjini bozdu bildirimi: kisa, ve ust uste kurulumda bir kez. */
const SYNERGY_NOTICE_MS = 2600;
const SYNERGY_NOTICE_GAP_MS = 4000;
/**
 * Execute isareti (`playExecuteMark`): nisangah kilidi + sert beyaz flas.
 * Can cubugunun (16) ve sampiyon tacinin (16.2) ustunde, kule hazir
 * isaretinin (16.5) altinda. Renk tek: soguk bir beyaz; parilti yok.
 */
const EXECUTE_MARK_DEPTH = 16.3;
const EXECUTE_MARK_MS = 320;
/** Koselerin kilitlendigi pay (~90 ms); gerisi arti ve flas. */
const EXECUTE_MARK_LOCK_FRACTION = 0.28;
const EXECUTE_MARK_COLOR = 0xe2e8f0;
const EXECUTE_MARK_CORNERS: ReadonlyArray<readonly [number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
/**
 * Metal Kalkan (AttackLord, yuva 1). Bariyer karsi atak seridinin sert
 * kenarlarinin (12.7) ustunde, can cubugunun (16) altinda; surukleme
 * onizlemesi Yonlendirme onizlemesiyle ayni katta (55).
 */
const METAL_SHIELD_DEPTH = 12.8;
const METAL_SHIELD_PREVIEW_DEPTH = 55;
/** Birakistan sonra sunucunun kalkani gelene kadar cizilen soluk yanki (ms). */
const METAL_SHIELD_ECHO_MS = 1600;
/** "N sn sonra hazir" bildirimi en fazla bu siklikta (ms): surukleme bildirim yagdirmasin. */
const METAL_SHIELD_NOTICE_GAP_MS = 2500;
/** Sunucu baginin rengi: reaktorun turkuazi. */
const SERVER_LINK_JOIN_COLOR = 0x22d3ee;
/** Kart perdesi kapanana kadar bekleyen bag anlari; birkac tane birikebiliyor. */
const PENDING_LINK_MOMENT_LIMIT = 4;
/** Perde kapandiktan sonra anin oynamasi icin kisa bekleme; perdenin cikis gecisi bitsin. */
const LINK_MOMENT_AFTER_CURTAIN_MS = 320;
const LEVEL_LABEL_STROKE = "#0f172a";
/**
 * Onur jackpot damgasi: kritik sayinin (15 px x 1.5) hemen ustunde, sayiyla
 * birlikte yukseliyor. Renk kritik turuncusunun altini: "!" sayinin, damga
 * zarin; ikisi ayni ani anlatiyor ama sayi sisirilmiyor.
 */
const JACKPOT_LABEL_LIFT_PX = 18;
const JACKPOT_LABEL_FONT_PX = 11;
const JACKPOT_LABEL_FILL = "#fde047";
const JACKPOT_LABEL_STROKE = "#431407";
/**
 * Kombo damgalari: Debug Lazer'in isaretli oldurmeden asiri yuklemesi ve
 * supurme sonucu lazerin kirmizi-turuncusunda, Onur'un sans penceresi jackpot
 * altininda (ayni zarin hikayesi). Kulenin seviye etiketinin biraz ustunde;
 * ikisi ayni anda gelirse ust uste binmesin.
 */
const COMBO_LABEL_LIFT_PX = LEVEL_LABEL_LIFT_PX + 14;
const COMBO_OVERDRIVE_FILL = "#fdba74";
const COMBO_OVERDRIVE_STROKE = "#431407";
const COMBO_LUCKY_FILL = "#fde047";
/**
 * Sampiyon: isaret, etiket ve can cubugu ayni koyu kizil kimlikte (agir, sert
 * dil: altin tac ve sallanma yok); kirik beyaz yazi, kalin koyu kizil kontur.
 * Dunyadaki hicbir durum isaretiyle (takip, mor lanet) karismiyor. Isaret can
 * cubugunun (16) hemen ustunde, etiketlerin (30.5) altinda.
 */
const CHAMPION_FILL = "#f1e4e1";
const CHAMPION_STROKE = "#6b1414";
const CHAMPION_BAR_FRAME = 0xb33a3a;
/** Govdenin ustundeki sabit sampiyon isareti: koseli ayrac icinde "S" (sallanmiyor). */
const CHAMPION_MARK = "[Ş]";
const CHAMPION_CROWN_DEPTH = 16.2;
const CHAMPION_LABEL_LIFT_PX = 16;
/** Ozel dusmanin ilk gorulme bildirimi (macta tur basina bir kez). */
const SPECIAL_NOTICE_KEYS = {
  harvester: "scene.special.harvester",
  bomber: "scene.special.bomber",
  hunter: "scene.special.hunter",
  heater: "scene.special.heater",
  eater: "scene.special.eater"
} as const satisfies Record<SpecialEnemyKind, MessageKey>;
/**
 * "Yukseltme hazir" isareti: kule sprite'larinin (12) ve can cubugunun (16)
 * ustunde, yuzen sayilarin (30) ve secili kule panelinin (66) altinda.
 */
const UPGRADE_READY_MARKER_DEPTH = 16.5;
/** Yesil: "yukari/hazir" okunuyor ve haritadaki hicbir durum rengiyle karismiyor. */
const UPGRADE_READY_MARKER_FILL = 0x4ade80;
const UPGRADE_READY_MARKER_STROKE = 0x052e16;
/** Salinim: en fazla 3 px yukari, yaklasik 1.1 sn'de bir. */
const UPGRADE_READY_BOB_PX = 3;
const UPGRADE_READY_BOB_RATE = 1 / 180;
/** Doygun rengi olmayan doku (tas golem) icin patlama rengi. */
const ENEMY_ACCENT_FALLBACK = 0xd6d3d1;
const ENEMY_HIT_FLASH_COLOR = 0xffffff;
/** Kozmetik itmenin geri oturma suresi (kendi agir vurusun; yalnizca govdenin cizimi). */
const ENEMY_KNOCK_MS = 90;
/** Buz kabugu: soluk celik-mavisi (eski pastel camgobegi rozetin yerine), donmuyor. */
const FROST_CRUST_FILL = 0x8aa1b4;
const FROST_CRUST_EDGE = 0xc3d0dc;
const FROST_CRACK = 0x7890a6;
/** Kabugun kenar noktalari: karede yeniden yaziliyor (nesne uretilmiyor). */
const FROST_POINTS = Array.from({ length: 6 }, () => new Phaser.Geom.Point());
/**
 * Sunucu onayi atimlarinin renkleri.
 *
 * Takma turuncu: kademe halkasinin (mavi / altin / beyaz) ve kart eksenlerinin
 * hicbirine denk gelmiyor, "seviye atladi" ya da "kart islendi" diye
 * okunmasin. Onarim, can cubugunun dolu yesili: halka cubukla ayni anda
 * doluyor.
 */
const CONFIRMATION_PULSE_COLORS: Readonly<Record<ConfirmationPulseStyle, number>> = {
  equip: 0xfb923c,
  repair: 0x22c55e
};

type HydratedGameSnapshot = Omit<GameSnapshot, "enemies" | "towers"> & {
  enemies: EnemySnapshot[];
  towers: TowerSnapshot[];
};

type BufferedSnapshot = {
  snapshot: HydratedGameSnapshot;
  receivedAt: number;
};

type PlaybackFrame = {
  snapshot: HydratedGameSnapshot;
  alpha: number;
};

type ClientPerfSample = {
  at: number;
  ms: number;
};

type PendingAction =
  | { type: "guidance" }
  /** AttackLord Execute: bir sonraki dokunus bir dusmani secer; bos zemin iptal. */
  | { type: "execute" }
  | undefined;

/**
 * Seri afisinin gorunumu. Esik ve guc burada degil: seriyi yalnizca sunucu
 * veriyor (`KillEventSnapshot.streakTier`), buff'i afise paylasilan tablo
 * (`getKillStreakBuffText`) yaziyor.
 */
type KillStreakRule = {
  tier: KillStreakTier;
  label: string;
  primary: number;
  secondary: number;
  accent: number;
  fill: number;
  chaos: number;
};

/** Sirada bekleyen ya da ekrandaki kendi seri afisin. */
type StreakBannerItem = {
  characterId: CharacterId;
  rule: KillStreakRule;
  /** Buff'in bittigi an (performance.now); afis beklerken dolduysa guc satiri yazilmiyor. */
  buffUntil: number;
};

/** Seri buff'i suren sahibin kuleleri; gercek sure boyunca parliyor. */
type StreakGlow = {
  ownerId: string;
  own: boolean;
  towerIds: string[];
  startedAt: number;
  until: number;
};

/** Takim arkadasinin serisi: soluk parlama, kisik ses, kendi kuleleri. */
const TEAMMATE_STREAK_GLOW_INTENSITY = 0.45;
/** Takim arkadasinin seri klibi seslendirme seviyesinin bu kadari. */
const TEAMMATE_STREAK_VOICE_GAIN = 0.35;
let mediaVolumeSettable: boolean | undefined;
/**
 * Medya ogesinin sesi yazilabiliyor mu.
 *
 * iOS Safari `HTMLAudioElement.volume` yazmayi yok sayiyor (okuma hep 1).
 * Takim arkadasinin seri klibi yalnizca bu seviyeyle kisiliyor; orada tam
 * sesle calip senin sesini ele gecirirdi. Bir kez olculuyor.
 */
function canSetMediaVolume() {
  if (mediaVolumeSettable === undefined) {
    try {
      const probe = new Audio();
      probe.volume = 0.5;
      mediaVolumeSettable = Math.abs(probe.volume - 0.5) < 0.01;
    } catch {
      mediaVolumeSettable = false;
    }
  }
  return mediaVolumeSettable;
}
/** Seri parlamasi zeminde: dusmanlar ve mermiler ustunden gecer, kule govdesi ortuyor. */
const STREAK_GLOW_DEPTH = 4.6;
/** Parlamanin nabzi (rad/ms): ~0.7 sn'de bir; hareket azaltmada sabit. */
const STREAK_GLOW_PULSE_RATE = (Math.PI * 2) / 700;
/** Seri afisi: kompakt ust plaka (CSS px); ortadaki savas alanina inmiyor. */
const STREAK_PLATE_MAX_WIDTH_PX = 280;
const STREAK_PLATE_HEIGHT_PX = 56;
/** Afisin ekranda kalisi (giristen cikisa); kademe basina +60 ms. */
const STREAK_PLATE_HOLD_MS = 1500;

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

/** Tani icin saklanan dokunus sayisi; performans kutusuna sigacak kadar. */
const TAP_LOG_SIZE = 6;

/**
 * Bir dokunusun ne oldugunun kaydi.
 *
 * "Dokunmatik gitti" sikayetini uzaktan kovalamak mumkun degil: dokunusun
 * ulasip ulasmadigini, dogru dunya noktasina dustugunu, ustunde bir kaplama
 * olup olmadigini ve hangi kapida durduruldugunu bilmek gerekiyor. Bunlarin
 * hepsi dokunus aninda okunur, sonradan uretilemez.
 */
type TapLogEntry = {
  atMs: number;
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
  arenaIcinde: boolean;
  ustEleman: string;
  sonuc: string;
};

/**
 * Yerel yankinin en fazla ne kadar ayakta kalacagi.
 *
 * Sunucu komutlara onay ya da ret gondermiyor -- kartlar disinda hepsi
 * ateSle-unut. Yani bir tahminin dogru cikip cikmadigi ancak yetkili durumun
 * kendisinden anlasilir, o da gelmezse tahmin sonsuza kadar asili kalirdi.
 * Bu sure normal gidis-gelisin cok ustunde, tikanmis bir baglantinin ise
 * altinda: yaniliyorsa kisa surede kendini toparliyor.
 */
const LOCAL_ECHO_TIMEOUT_MS = 2500;
/**
 * Atakan ultisinde sok dalgasi drone'larin kalktigi kulelerde; kalabalik bir
 * kurulumda hepsine halka cizmek dalgayi gurultuye cevirirdi.
 */
const CAST_WAVE_TOWER_LIMIT = 8;
/** Kule panelinin altindaki satis dugmesinin yuksekligi (dunya birimi). */
const SELL_BUTTON_HEIGHT = 20;
/** Performans alevinin cizildigi en dusuk yogunluk (~%54 performans); altindaki pilot isik gorunmuyordu. */
const PERFORMANCE_FLAME_MIN_INTENSITY = 0.15;

/**
 * Etki kalemlerinin ekranda okunacak adlari.
 *
 * Sunucu ham anahtar gonderiyor (`bleed`, `slowed`, ...) ve cevirisi
 * sozlukte (`scene.effect.<anahtar>`): dil istemcinin isi, sunucunun degil.
 * Sozlukte olmayan bir anahtar ham haliyle gosteriliyor -- yeni bir etki
 * eklendiginde panel bos kalmasin.
 */
function getEffectStatLabel(key: string) {
  return tMaybe(`scene.effect.${key}`) ?? key;
}

/** Tanim kimliginden katalog kaydi; ilk cagrida bir kez kuruluyor. */
let towerDefinitionsById: Map<string, TowerDefinition> | undefined;

/**
 * Kulenin ekranda okunacak adi. Snapshot'taki `name` sunucudan Turkce
 * geliyor; katalog nesnesinin adi ise dile bakiyor (catalog-locale), o
 * yuzden tanim kimligiyle oradan okunuyor. Katalogda yoksa snapshot adi.
 */
function getTowerDisplayName(definitionId: string | undefined, fallback: string) {
  towerDefinitionsById ??= new Map(Object.values(towerCatalog).flat().map((definition) => [definition.id, definition]));
  return (definitionId ? towerDefinitionsById.get(definitionId)?.name : undefined) || fallback;
}

/**
 * Kart seciminde okunacak ad ve aciklama. `card:choices` sunucunun Turkce
 * kopyasini tasiyor; katalog nesnesi dile bakiyor. Katalogda yoksa sunucununki.
 */
function getCardText(card: Pick<CardDefinition, "id" | "name" | "description">) {
  const entry = getCardDefinition(card.id);
  return { name: entry?.name ?? card.name, description: entry?.description ?? card.description };
}

/** Sunucunun yolladigi uzmanlik secenegi; ad ve aciklama katalogdan, dile gore. */
function localizeWorkerSpecialization<T extends { id: HirableWorkerRole; name: string; description: string }>(option: T): T {
  const entry = WORKER_SPECIALIZATION_CHOICES.find((choice) => choice.id === option.id);
  return entry ? { ...option, name: entry.name, description: entry.description } : option;
}

/**
 * Sunucunun yolladigi isci becerisi; ad ve aciklama katalogdan (gelisim
 * hucreleri, eski katmanlar). Katalogda yoksa sunucunun metni.
 */
function localizeWorkerSkillChoice(choice: WorkerSkillChoice): WorkerSkillChoice {
  const pairs = [
    ...Object.values(WORKER_DEVELOPMENT_CELLS).flatMap((cells) => cells.map((cell) => cell.options ?? [])),
    ...Object.values(WORKER_SKILL_TIERS).flat()
  ];
  for (const pair of pairs) {
    const entry = pair.find((option) => option.id === choice.id);
    if (entry) return { ...choice, name: entry.name, description: entry.description };
  }
  return choice;
}

/** Iki kimlik listesi ayni sirada ayni mi; karsilastirma icin kopya uretmez. */
function haveSameIds(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/** Degeri saniye olan kalemler; gerisi hasar. */
const SECOND_VALUED_EFFECT_STATS = new Set(["slowed", "stopped"]);

/**
 * Besgenin cevrel yaricapi, gizlenen govdenin genisliginin kati.
 *
 * Yarim degil: isci dokusu kare cercevesinin icinde bosluk birakiyor, yani
 * gorunen disk cercevenin tamami degil. Yarim alinsaydi besgen normal isciden
 * gozle secilecek kadar buyuk dururdu -- oysa iki kademe ayni olcude olmali,
 * ayrimi sekil tasiyor.
 */
const ADVANCED_WORKER_BODY_RADIUS_RATIO = 0.42;
const GUIDANCE_RADIUS = 78;
// Fast enough that the muzzle is on target before the projectile leaves it,
// slow enough to read as a sweep rather than a snap.

type ZeynepCommandTier = "small" | "medium" | "big";
type AudioVolumeChannel = "music" | "voice" | "sfx" | "hit";
/** Testere'nin (onur-1) vurus sesi: katalogdaki vurus turu, kesme. */
const BLADE_HIT_VOICE: HitVoiceId = resolveHitVoice(BLADE_TOWER_ID) ?? "slash";
/** Kule tepsisindeki sutun sayisi; satirlarin tepsiye sigmasini belirler. */
const TOWER_TRAY_COLUMNS = 5;

type TowerOrientation = NonNullable<TowerSnapshot["orientation"]>;

/** Sunucunun yaydigi gedik uyarisi: hangi yapi, nerede, ne kadar cani kaldi. */
type StructureBreachMessage = {
  towerId: string;
  ownerId: string;
  definitionId: string;
  x: number;
  y: number;
  healthRatio: number;
};

/** Surunun yogunlastigi nokta degistiginde gelen uyari. */
type FlowShiftMessage = {
  from: { col: number; row: number } | null;
  to: { col: number; row: number };
  x: number;
  y: number;
};

/**
 * Kademe basina afis gorunumu; anahtar tipli: yeni kademe eklenince derleyici
 * burada eksigi soyluyor. `chaos` 0-5 tamsayi (tween tekrarlari tamsayi
 * istiyor): NOT BAD sakin bir plaka (0), en ustteki WHAT ARE YOU en kaotik (5).
 * Ikili kademeler (GOOD/GRANTED, RAMPAGE/SLAUGHTER, LEGENDARY/I MADE YOU FOR
 * THIS) ayni hareketi paylasiyor, renkleri ayiriyor.
 */
const KILL_STREAK_BANNER_STYLES: Record<KillStreakTier, Omit<KillStreakRule, "tier">> = {
  whatAreYou: {
    label: "WHAT ARE YOU?",
    primary: 0xf0abfc,
    secondary: 0xef4444,
    accent: 0xf8fafc,
    fill: 0x0a0010,
    chaos: 5
  },
  madeForThis: {
    label: "I MADE YOU FOR THIS",
    primary: 0xf8fafc,
    secondary: 0x22d3ee,
    accent: 0xfacc15,
    fill: 0x020617,
    chaos: 4
  },
  legendary: {
    label: "LEGENDARY",
    primary: 0xfacc15,
    secondary: 0xff2d55,
    accent: 0xf8fafc,
    fill: 0x13070a,
    chaos: 4
  },
  slaughter: {
    label: "SLAUGHTER",
    primary: 0xdc2626,
    secondary: 0xf97316,
    accent: 0xfde68a,
    fill: 0x0c0303,
    chaos: 3
  },
  rampage: {
    label: "RAMPAGE",
    primary: 0xef4444,
    secondary: 0x22d3ee,
    accent: 0xfacc15,
    fill: 0x050505,
    chaos: 3
  },
  unstoppable: {
    label: "UNSTOPPABLE",
    primary: 0x8b5cf6,
    secondary: 0x38bdf8,
    accent: 0xfb7185,
    fill: 0x111027,
    chaos: 2
  },
  granted: {
    label: "GRANTED",
    primary: 0x22c55e,
    secondary: 0xa7f3d0,
    accent: 0xf8fafc,
    fill: 0x052e16,
    chaos: 1
  },
  good: {
    label: "GOOD",
    primary: 0x14b8a6,
    secondary: 0x99f6e4,
    accent: 0xf8fafc,
    fill: 0x042f2e,
    chaos: 1
  },
  notBad: {
    label: "NOT BAD",
    primary: 0x94a3b8,
    secondary: 0xcbd5e1,
    accent: 0xf8fafc,
    fill: 0x0b1220,
    chaos: 0
  }
};
const KILL_STREAK_RULES: KillStreakRule[] = (Object.keys(KILL_STREAK_BANNER_STYLES) as KillStreakTier[])
  .map((tier) => ({ tier, ...KILL_STREAK_BANNER_STYLES[tier] }));
const VOICE_VOLUME_STORAGE_KEY = "karayel.voiceVolume";
const SFX_VOLUME_STORAGE_KEY = "karayel.sfxVolume";
const HIT_VOLUME_STORAGE_KEY = "karayel.hitVolume";
const VIBRATION_STORAGE_KEY = "karayel.vibration";
const DEFAULT_VOICE_VOLUME = 0.6;
/**
 * Efekt sesleri seslendirmeden kisik basliyor: onlar saniyede birkac kez
 * caliyor, seri anonsu dalgada bir. Ayni seviyede baslasa muzigi boguyordu.
 */
const DEFAULT_SFX_VOLUME = 0.6;
/**
 * Vurus sesleri Efektler'in ustune carpan ve orta seviyede basliyor: oyunun
 * en sik sesi, odul seslerinin (oldurme, altin) altinda kalmali.
 */
const DEFAULT_HIT_VOLUME = 0.5;

/** Uzatma tutamaci: ilk bos kenarin merkezi, tutamacin baktigi eksen ve yon. */
type WallHandleTarget = { x: number; y: number; axis: WallLineAxis; direction: 1 | -1 };

export class GameScene extends Phaser.Scene {
  private room?: Room;
  private localSessionId = "";
  private selectedCharacterId: CharacterId = "zeynep";
  private selectedCharacter: CharacterDefinition = characters[0];
  private selectedTowerDefinition: TowerDefinition = towerCatalog.zeynep[0];
  private inventoryOpen = false;
  /** Envanterden secilmis, kule bekleyen esya. */
  private pendingEquipItemId?: string;
  /**
   * Hedefli kartin kulesi haritadan seciliyor: kart perdesi gizli, haritanin
   * cevresinde secim cercevesi, ustte kartin adi ve geri donus.
   */
  private cardTargetPick?: { card: CardDefinition; color: number; banner: HTMLElement };
  private mapPickFrame?: Phaser.GameObjects.Graphics;
  private latestDefenseSummary?: DefenseSummary;
  private pendingPreview?: { requestId: string; apply: () => void; dialog: HTMLDialogElement };
  private previewSequence = 0;
  /**
   * Kule panelinin sunucu blogu (`tower:stats`): yalnizca secili kule icin,
   * panel acikken yarim saniyede bir tazeleniyor. Sira numarasi eski cevabi
   * ayikliyor; anahtar (kule, seviye, kart, esya) degisince beklemeden isteniyor.
   */
  private towerStatsBlock?: TowerStatsWire;
  private towerStatsSequence = 0;
  private towerStatsRequestKey = "";
  private towerStatsTimer?: Phaser.Time.TimerEvent;
  /** Kule panelinin yeri; esikte gidip gelmesin diye son karar hatirlaniyor. */
  private towerSheetDock: "top" | "bottom" = "bottom";
  /**
   * Arayuzun bildirdigi panel: gorunur mu (baska bir cekmece onune gecmis
   * olabilir) ve tavan boyu tuvalin ne kadari. Yer karari bundan.
   */
  private towerSheetReport: TowerSheetReport = { visible: true, heightRatio: 0.41, expanded: false };
  /**
   * Kule panelinin (ya da onune gecen cekmecenin) ekrandaki gercek yeri,
   * tuvale gore oranla. Harita paneli bununla ortusmeyen yere cizilir.
   */
  private towerSheetRect?: TowerSheetRect;
  /** Harita panelinin son tarafi; sigdikca degismiyor (titremesin). */
  private selectedResourceSide?: { towerId: string; side: PlacementSide };
  private selectedMapData: EditableMapData = createDefaultEditableMap();
  private selectedPlacedTowerId?: string;
  private enemies = new Map<string, RenderMover>();
  /**
   * Bu karede kaldirilan dusmanlarin izi.
   *
   * Sprite `renderEnemies`te hemen havuza donuyor, oldurme olayi ise ayni
   * karede ama sonra isleniyor. Iz tek kullanimlik ve kisa omurlu: sizintinin
   * oldurme olayi yok, izi kimse almiyor ve siliniyor.
   */
  private readonly removedEnemyTraces = new RecentEnemyTraces<RemovedEnemyTrace>();
  /** Doku basina vurgu rengi; bir kez okunuyor. */
  private readonly enemyAccentColors = new Map<string, number>();
  private towers = new Map<string, RenderTower>();
  private projectiles = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private linearProjectileSnapshots = new Map<string, ProjectileSpawnSnapshot>();
  private terminalProjectileSnapshots = new Map<string, { projectile: ProjectileSnapshot; removeAfter: number; anchor?: HitAnchor }>();
  /**
   * Dusmanlarin ekranda baktigi yon, gelen snapshot'lardan: sunucunun yonlu
   * govdesi istemcide bu yonle (Gosteri / Kin secimi, carpmanin dusmani).
   */
  private readonly enemyHeadings = new EnemyHeadingTracker();
  /**
   * Merminin son temasi (`projectile:contact`) ve geldigi an: ayni tikte
   * gelen kaldirma mesajinin (`projectile:hit`) dusmani. Delip gecip sonra
   * menzil disinda kalkan merminin kaydi eski temasi kullanmiyor (geldigi an).
   */
  private readonly lastProjectileContact = new Map<string, { anchor: HitAnchor; receivedAt: number }>();
  private drones = new Map<string, Phaser.Physics.Arcade.Sprite>();
  /**
   * Gelismis iscilerin govdesi.
   *
   * Isci basina bir nesne degil, hepsi icin tek bir cizim yuzeyi: her karede
   * temizlenip yeniden ciziliyor, boylece olen isciyle birlikte sekli
   * temizlemeyi unutmak diye bir hata kalmiyor.
   */
  private advancedWorkerGraphics?: Phaser.GameObjects.Graphics;
  /** Cani eksilmis isciler; olumu harita degisiminden ayirmak icin. */
  private readonly hasarliIsciler = new Set<string>();
  private workerBanGraphics?: Phaser.GameObjects.Graphics;
  private mapGraphics?: Phaser.GameObjects.Graphics;
  private terrainImage?: Phaser.GameObjects.Image;
  private towerGroundGraphics?: Phaser.GameObjects.Graphics;
  private crystalGraphics?: Phaser.GameObjects.Graphics;
  private resourceAmountLabels = new Map<string, Phaser.GameObjects.Text>();
  private resourceSprites = new Map<string, Phaser.GameObjects.Image>();
  private ammoNodeGraphics?: Phaser.GameObjects.Graphics;
  private selectedResourceGraphics?: Phaser.GameObjects.Graphics;
  private selectedAmmoText?: Phaser.GameObjects.Text;
  private selectedEnergyText?: Phaser.GameObjects.Text;
  private selectedTemperatureText?: Phaser.GameObjects.Text;
  private selectedMisfortuneText?: Phaser.GameObjects.Text;
  private selectedPerformanceText?: Phaser.GameObjects.Text;
  private performanceSliderHitZone?: Phaser.GameObjects.Rectangle;
  private performanceSliderLeft = 0;
  private performanceSliderRight = 0;
  private performanceSliderTowerId = "";
  private performanceSliderDragging = false;
  private optimisticPerformance?: { towerId: string; value: number };
  /**
   * Performans kolu gonderimi kisiliyor: surukleme her `pointermove`da
   * yolluyordu, 240 Hz ekranda saniyede 240 mesaj. Sunucunun kovasi bunu
   * kesiyor ve birakis degeri dusebiliyordu. Son deger hep gidiyor: bekleyen
   * deger aralik dolunca ve parmak kalkinca hemen gonderiliyor.
   */
  private lastPerformanceSendAt = 0;
  private pendingPerformanceSend?: { towerId: string; performance: number };
  private pendingPerformanceTimer?: number;
  private melisNightmareMapGraphics?: Phaser.GameObjects.Graphics;
  private renderedMapKey = "";
  /**
   * Kurulum yasak bolgeler: tam statik anlik goruntuden (mac basina sabit).
   * Olcusu haritayla tutmazsa sorgu bos sayiliyor.
   */
  private buildZones?: BuildZoneMap;
  private beamGraphics?: Phaser.GameObjects.Graphics;
  private projectileTrailGraphics?: Phaser.GameObjects.Graphics;
  /** Isinlarin ADD karisimli dusumu (ve lazerin omuzlari); govde `beamGraphics`te. */
  private beamGlowGraphics?: Phaser.GameObjects.Graphics;
  /** Isin cizimi (lazer, Zeynep, Melis, ultiler); her karede, ara degerli isinlarla. */
  private beamRenderer?: BeamRenderer;
  private readonly beamInterpolator = new BeamInterpolator();
  /** Profil gudumlu mermi, namlu ve carpma cizimi. */
  private attackVfx?: AttackVfx;
  /**
   * Atakan kulelerinin dunya ici imzalari: isaret nisangahi, Sunucu bagi,
   * kapatma alani, Obsesyon ipi, Ucube gostergesi. Her karede.
   */
  private atakanSignatures?: AtakanSignatureVfx;
  /** Son cizilen snapshot'in kuleleri (dizi): imzalar karede bundan okuyor. */
  private signatureTowers: readonly TowerSnapshot[] = [];
  /** Imza karesinin girdisi: bir kez kuruluyor, karede yerinde yaziliyor. */
  private readonly signatureFrame: SignatureFrame = {
    towers: [],
    enemies: [],
    now: 0,
    scale: 1,
    cellSize: 28,
    isOwn: (tower) => tower.ownerId === undefined || tower.ownerId === this.localSessionId,
    enemySize: (enemy) => getEnemySpriteDisplaySize(enemy as EnemySnapshot, this.getMapCellSize())
  };
  /**
   * Zeynep imzalari: ferman cizgisi, spot isigi, Kin damgasi, Abarti gecisi,
   * Taht atisinda dizilim, ayna sekmesi. Olaylar gelen snapshot'tan ve
   * mesajlardan turuyor (`zeynepReceipt`), oynatmaya siralanip cizilyor.
   */
  private zeynepSignatures?: ZeynepSignatureVfx;
  private readonly zeynepReceipt = new ZeynepReceiptTracker((event, delayMs) => this.queueCourtEvent(event, delayMs));
  /** Bu snapshot'tan turuyen gecikmesiz olaylar: tek gecikmeli efektle oynatiliyor. */
  private courtBatch?: CourtEventInput[];
  private readonly courtContext: ReceiptContext = {
    gridSize: 34,
    worldScale: 1,
    isOwnOwner: (ownerId) => ownerId === undefined || ownerId === this.localSessionId,
    // Sunucu mermiyi oyun hiziyla yurutuyor: raya varis gercek saatte bu kadar uzun.
    timeScale: 1 / GAME_SPEED_MULTIPLIER,
    headings: this.enemyHeadings
  };
  private readonly courtFrame: CourtFrame = {
    enemies: [],
    now: 0,
    scale: 1,
    // Sprite'in gercek boyu (sampiyon, hava ve yavaslama nabzi dahil): isaretler govdeyi sariyor.
    enemySize: (enemy) => this.enemies.get(enemy.id)?.displaySize ?? getEnemySpriteDisplaySize(enemy as EnemySnapshot, this.getMapCellSize())
  };
  /** Kisa omurlu ADD parlamalari (en fazla 64 canli). */
  private flashPool?: FlashPool;
  /** Mermilerin isisi (kademe 2-3): karede tek dortgenlik ADD damgalar. */
  private glowStamps?: GlowStampPool;
  /** Yuk altinda once kivilcim, sonra duman, sonra yer izi, en son iz uzunlugu dusuyor. */
  private readonly vfxLod = new VfxLod();
  private lastVfxFrameAt = 0;
  /** Bu karede efektlere giden CPU suresi (LOD olcusu). */
  private vfxFrameCost = 0;
  /** Mermiyi atan kule yerel oyuncunun mu; atis aninda kulenin konumundan. */
  private readonly projectileOwnership = new Map<string, boolean>();
  /**
   * Kulelerin konumu ve sahibi (snapshot basina bir kez): isinin ve merminin
   * cikis noktasi kuleyi soyluyor. Duz diziler; karede metin anahtari yok.
   */
  private readonly towerSpotX: number[] = [];
  private readonly towerSpotY: number[] = [];
  private readonly towerSpotOwner: string[] = [];
  /** Testere bicaklarinin snapshot'lar arasi acisi: bir onceki ve son deger. */
  private readonly bladeAngles = new Map<string, { from: number; to: number; at: number; interval: number }>();
  /** Karede ayni nesne: isin cizimi secenekleri ve sahiplik cozucusu. */
  private readonly beamRenderOptions: BeamRenderOptions = {
    now: 0,
    sceneNow: 0,
    scale: 1,
    isOwn: (beam) => this.isOwnBeam(beam),
    reducedMotion: false
  };
  private readonly projectileOwnResolver = (projectile: ProjectileSnapshot) => this.projectileOwnership.get(projectile.id) ?? true;
  private combatVfx?: CombatVfx;
  /** Efsanevi vurus etkileri (`legendary:procs`): zincir, patlama, dondurma cercevesi, bag... */
  private legendaryProcs?: LegendaryProcVfx;
  /** Efsanevi etkilerin dusman konumu: cizilen sprite, karede yeniden kullanilan nesne. */
  private readonly legendarySpot = { x: 0, y: 0, size: 0 };
  private readonly legendaryLookup = (id: string) => {
    const view = this.enemies.get(id);
    if (!view || !view.sprite.active) return undefined;
    const spot = this.legendarySpot;
    spot.x = view.sprite.x;
    spot.y = view.sprite.y;
    spot.size = view.displaySize ?? 0;
    return spot;
  };
  /** Yuzen hasar sayilarinin sabit havuzu; kac tanesinin gorunecegini yonetmen soyluyor. */
  private damageNumbers?: DamageNumberPool;
  /** "SV 3", "SV 5 · KADEME 2" etiketlerinin havuzu; yonetmenin etiket butcesi kadar. */
  private levelLabels?: WorldLabelPool;
  /** Yalnizlik ve dizilim: surukleme onizlemesi, kalici isaret ve damga verisi. */
  private synergyMarks?: SynergyMarks;
  private placementRange?: PlacementRangePreview;
  /** Duvar cizgisi isaretleri (halka, capa, tutamaclar, bedel etiketi). */
  private wallLineView?: WallLineView;
  /** Cekmeceden suruklenen duvarin cizgi jesti; yalnizca duvar surukleniyorken var. */
  private wallGesture?: {
    dwell: WallDwellState;
    /** Parmagin ekran konumu (CSS px): bekleme toleransi piksel cinsinden. */
    client: { x: number; y: number };
    /** Hayaletin onizleme noktasi (dunya). */
    finger: { x: number; y: number };
    /** Sabitlenmis capa (kenar merkezi, dunya); yoksa jest hala bekleme asamasinda. */
    anchor?: { x: number; y: number };
  };
  /** Gorunen uzatma tutamaclari: dizinin bir duvari ve gorunurluk bitisi. */
  private wallHandles?: { segment: EdgeSegment; until: number };
  /** Az once gonderilen duvar: sunucu onaylayinca tutamaclar acilir. */
  private wallHandlePending?: { segment: EdgeSegment; until: number };
  private wallHandleTargets: WallHandleTarget[] = [];
  private wallHandleDrag?: { target: WallHandleTarget; startClient: { x: number; y: number }; moved: boolean; finger: { x: number; y: number } };
  private wallMarksActive = false;
  /** Cizginin ilk parcasinin merkezi (capa isaretinin yeri). */
  private wallLineStart?: { x: number; y: number };
  /** Takim arkadasi bildiriminin son ani; ust uste kurulumlar bildirimi bogmasin. */
  private synergyNoticeAt = Number.NEGATIVE_INFINITY;
  /** Sunucunun onayladigi (`tower:spawn`) ama oynatmada henuz cizilmemis kuleler. */
  private readonly freshTowerSpawns = new FreshTowerSpawns();
  /**
   * Kuleler en az bir kez cizildi mi. Ilk karedeki kuleler (katilma, sayfa
   * yenileme) inmez: onlar oyuncunun gozunun onunde kurulmadi.
   */
  private towersPrimed = false;
  /** Olcegi snapshot'lar arasinda degisen kuleler (nabiz ya da inis); karede yalnizca bunlar. */
  private readonly animatedTowers = new Set<RenderTower>();
  private towerSnapshots = new Map<string, TowerSnapshot>();
  private staticEnemySnapshots = new Map<string, StaticEnemySnapshot>();
  private staticTowerSnapshots = new Map<string, StaticTowerSnapshot>();
  /**
   * Her kulenin en son bilinen tam dinamik kaydi.
   *
   * Sunucu yalnizca degiseni yolladigi icin tam hal burada birikiyor.
   * Statik onbellekten ayri duruyor: statikler kule kurulunca bir kez
   * geliyor, bu ise her karede tazeleniyor.
   */
  private dynamicTowerSnapshots = new Map<string, DynamicTowerSnapshot>();
  /** Dusmanlarin en son bilinen tam dinamik kaydi; kulelerdekiyle ayni is. */
  private dynamicEnemySnapshots = new Map<string, DynamicEnemySnapshot>();
  /** Oyuncu ve isci kayitlari da delta geliyor; en son bilinen tam halleri. */
  private dynamicPlayerSnapshots = new Map<string, GameSnapshot["players"][number]>();
  private dynamicDroneSnapshots = new Map<string, DroneSnapshot>();
  private lastFullSnapshotRequestAt = 0;
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private projectileGroup?: Phaser.Physics.Arcade.Group;
  private placementGrid?: Phaser.GameObjects.Graphics;
  private ultimateColumnPreview?: Phaser.GameObjects.Graphics;
  private placementGhost?: Phaser.GameObjects.Image;
  private guidancePreview?: Phaser.GameObjects.Graphics;
  private isGuidanceDragging = false;
  private seenDamageEventIds: string[] = [];
  private seenDamageEventSet = new Set<string>();
  private seenKillEventIds: string[] = [];
  private seenKillEventSet = new Set<string>();
  /** Son islenen snapshotta ilk kez gorulen oldurme olayi; cipteki "+N" icin. */
  private newKillEventsInSnapshot = 0;
  /** Bir onceki snapshottaki altin; ilk snapshotta yok, o zaman etiket de yok. */
  private lastSnapshotGold?: number;
  /** Dunyadaki altin sayisina eklenemeyen altin; bir sonraki sayiya tasiniyor. */
  private coinCarry = { amount: 0, at: 0 };
  /** Sonraki seviyesi odenebilen en ucuz yerel kuleler ve isaretlerinin yeri. */
  private upgradeReadyAnchors: Array<{ id: string; x: number; y: number }> = [];
  private upgradeReadyMarkers: Phaser.GameObjects.Graphics[] = [];
  private upgradeReadyMarkerHalfWidth = 0;
  /** Hazir kule sayisi; ilk hesapta yok, yeniden baglanmada ★ parlamasin diye. */
  private upgradeReadyCount?: number;
  private lastUpgradeReadyFlashAt = Number.NEGATIVE_INFINITY;
  private goldShopWasOpen = false;
  /** Kozmetik kombo: kendi oldurme zincirin ve takimin ortak zinciri. */
  private readonly killCombo = new KillComboWatch();
  /** Co-op asist bildirimi: ayni iki oyuncu arasinda 5 sn'de bir. */
  private readonly assistToasts = new AssistToastGate();
  private killStreakSounds: Record<KillStreakTier, HTMLAudioElement[]> = {
    notBad: [],
    good: [],
    granted: [],
    unstoppable: [],
    rampage: [],
    slaughter: [],
    legendary: [],
    madeForThis: [],
    whatAreYou: []
  };
  /**
   * Su an calan seri klibi ve kimin serisi. Takim arkadasininki calan bir
   * klibi kesmiyor, yeniden baslatmiyor; seninki onunkini kesebiliyor.
   */
  private streakVoice?: { audio: HTMLAudioElement; own: boolean };
  /** Ekrandaki kendi afisinin klibi; bitene kadar siradaki afis bekliyor. */
  private streakVoiceHold?: HTMLAudioElement;
  private rampageContainer?: Phaser.GameObjects.Container;
  /** Ekrandaki afisin cikis tween'i; siradaki afis bekliyorsa one cekiliyor. */
  private rampageExit?: { tween: Phaser.Tweens.Tween; exitY: number; startsAt: number };
  /** Kendi seri afislerin: silinmiyor, sirayla geliyor. */
  // Daha yuksek kademe sirada bekleyen dusugu dusuruyor (kendi klibin kesilmedigi icin bekleme uzayabiliyor).
  private readonly streakBanners = new StreakBannerQueue<StreakBannerItem>(undefined, (item) => getKillStreakTierRank(item.rule.tier));
  private streakGlows: StreakGlow[] = [];
  private streakGlowGraphics?: Phaser.GameObjects.Graphics;
  private backgroundMusic?: HTMLAudioElement;
  private backgroundMusicPath = "";
  private gameAudioUnlocked = false;
  private musicVolume = readStoredVolume(MUSIC_VOLUME_STORAGE_KEY, DEFAULT_MUSIC_VOLUME);
  private voiceVolume = readStoredVolume(VOICE_VOLUME_STORAGE_KEY, DEFAULT_VOICE_VOLUME);
  private sfxVolume = readStoredVolume(SFX_VOLUME_STORAGE_KEY, DEFAULT_SFX_VOLUME);
  private hitVolume = readStoredVolume(HIT_VOLUME_STORAGE_KEY, DEFAULT_HIT_VOLUME);
  /** Isinlarin vurus ani: cizildigi karede, oynatma gecikmesinden sonra. */
  private readonly beamHitTracker = new BeamHitTracker((beam, voice, tick) => {
    this.feedback?.playHit(voice, beam.tier, this.isOwnBeam(beam), beam.id, tick);
  });
  /** Titresim ayari; cihaz desteklemiyorsa ayar gorunmuyor ama deger kaliyor. */
  private vibrationEnabled = readStoredFlag(VIBRATION_STORAGE_KEY, true);
  /**
   * Odul geri bildiriminin tek kapisi: sentez sesi, sarsinti, titresim ve
   * ekran butcesi. Sahneyle kuruluyor, sahneyle kapaniyor.
   */
  private feedback?: FeedbackDirector;
  /**
   * ATLAS telsiz anonslari (`atlas-voice.ts`): tek yonetmen, olaylar asagidaki
   * kancalardan. Geri bildirim yonetmeninin baglamini kullaniyor.
   */
  private atlas?: AtlasVoice;
  private atlasEnabled = readAtlasEnabled();
  /** ATLAS'in bu macin anahtari (oda:asama); degisince izciler sifirlaniyor. */
  private atlasMatchKey?: string;
  private readonly atlasTowerWatch = new AtlasTowerWatch();
  private readonly atlasWaveWatch = new AtlasWaveWatch();
  private readonly atlasSurgeCuts = new AtlasOnceSet();
  /** ATLAS konusurken muzigin carpani (dalga muzigi de kisiliyor). */
  private atlasMusicDuck = 1;
  /** Muzikli dalgalarin dongusu (`wave-music.ts`); efekt baglamini paylasiyor. */
  private waveMusic?: WaveMusicPlayer;
  /** ATLAS-VESAYET konusmalarinin olay izcileri (`atlas-dialogue.ts`). */
  private readonly atlasNexusDropWatch = new AtlasNexusDropWatch();
  private readonly atlasComboWatch = new AtlasSkillComboWatch();
  /** ATLAS'in ara sozleri (`atlas-ambient.ts`): kosu tohumlu plan, dalga icinde an. */
  private readonly atlasAmbient = new AtlasAmbientScheduler();
  private audioSettingsOpen = false;
  private audioSettingsItems: Phaser.GameObjects.GameObject[] = [];
  private perfPopupOpen = false;
  private perfPopupItems: Phaser.GameObjects.GameObject[] = [];
  private matchResultShown = false;
  /**
   * Mac sonu sahnesi (`match-end-sequence`): rapordan once yenilgide yapilar
   * nexus'tan disari patliyor, zaferde sevkiyat isini yukseliyor. Sahne
   * oynarken rapor bekliyor (`matchEndReport`); bitince ya da gecilince bir
   * kez aciliyor. Kozmetik ve yerel: sunucuya hicbir sey gitmiyor.
   */
  private matchEndStage?: MatchEndStage;
  private matchEndReport?: { result: "victory" | "defeat"; summary: MatchResultSummary };
  private matchEndSafetyTimer?: number;
  /** Bu baglantida sonucsuz snapshot goruldu mu: sonuctan sonra yeniden baglanan sahneyi gormuyor. */
  private liveSinceBind = false;
  /**
   * Kosunun rekor kaydinin sonucu; kosu raporu "YENİ REKOR" ve siradaki
   * hedef satirini buradan yaziyor. Kayit yalnizca raporlu mesajla yapiliyor.
   */
  private runRecordOutcome?: RunRecordOutcome;
  /**
   * Sonucun kapisi: ekran bir kez aciliyor, kayit kosu basina bir kez
   * yaziliyor, rapor ekrandan sonra gelirse ekran bir kez tazeleniyor.
   * Sahne yeniden baslatilmiyor (Tekrar sayfayi yeniliyor), alan baslaticisi yeter.
   */
  private readonly matchResultLatch = new MatchResultLatch();
  private matchReport?: MatchReportState;
  /** Sonuc snapshot'tan geldi ama rapor gelmedi; `run:sync` bir kez isteniyor. */
  private runSyncRequested = false;
  /** Kendi ultilerinin en iyisi; raporun "en iyi an" adaylarindan. Takim arkadasininki bu istemciye gelmiyor. */
  private bestOwnUltimate?: RunUltimateMoment;
  /** Oda lobiden geldi: rapordaki "Tekrar" oda kurma ekranini aciyor. */
  private startedFromLobby = false;
  /** Sunucunun hata yuzunden kapattigi oda; kopunca yeniden baglanma denenmiyor. */
  private roomAbortedId = "";
  private runReportCueTimers: number[] = [];
  private runReportRecordCuePlayed = false;
  /**
   * Raporun ilk acildigi an; dugmeler bundan `RUN_REPORT_ACTIONABLE_AFTER_MS`
   * sonra dokunusu kabul ediyor. Tazelemede degismiyor.
   */
  private runReportOpenedAt = 0;
  /**
   * Rapor dugmesine basildi ama kosunun raporu henuz gelmedi: yeniden yukleme
   * rapor gelip kaydedilene kadar (en fazla kisa bir sure) bekliyor.
   */
  private runReportReloadPending = false;
  /**
   * Bu sahne sonucsuz bir snapshot gordu, yani maci oynarken buradaydi. Ilk
   * snapshot zaten sonucu tasiyorsa istemci odaya mac bittikten sonra girmis
   * demek: o kosunun rekoru, asama ilerlemesi ve arsiv sayaci onun degil.
   */
  private liveSnapshotSeen = false;
  /**
   * Kosunun oynandigi harita olcegi; Tekrar ayni olcekte baslasin ve ayni rekor
   * satirina yazsin. Sunucunun arenasi olcegi tasimiyor (acik arena hep 1
   * yaziyor), o yuzden `syncMap`den once, sahneye verilen haritadan okunuyor.
   */
  private runMapScale: MapScale = DEFAULT_MAP_SCALE;
  private cardChoiceRoot?: HTMLElement;
  private cardChoices: CardDefinition[] = [];
  private cardChoicePending = false;
  private cardChoiceTimeout?: number;
  /** Acik elde kalan ucretsiz yenileme; sunucu `card:rerollState` ile her elden once yaziyor. */
  private cardRerollsRemaining = 0;
  /** Yenileme istendi, yeni el bekleniyor: gelen el ayni molanin eli (nisan satiri kalsin). */
  private cardRerollRequested = false;
  /** Dalga temizlenmesini yakalayan saf kural; dalganin tabanini kurulumda aliyor. */
  private readonly waveClearWatch = new WaveClearWatch();
  /**
   * Dalga karnesinin parcalari dalgasina bagli: sunucunun karnesi, o dalganin
   * kendi ultisi, damganin altini ve nexus cani. Karne kart perdesinin basliginda.
   */
  private readonly waveReports = new WaveReportTracker();
  /**
   * Nisanlarin olgulari: karneler, kendi kulelerin ve kendi ultin. Kayit
   * dalga sonunda ve mac sonunda; dalga ortasinda yalnizca not aliniyor.
   */
  private readonly badgeWatch = new BadgeRunWatch();
  /** Acilan nisanin bildirimi: dalga molasina ve kosu raporuna, dalga ortasina hic. */
  private readonly badgeNotices = new BadgeNoticeQueue();
  /** Kart perdesinin nisan satiri; ayni el yeniden cizilince kaybolmasin. */
  private cardDraftBadgeNotice?: string;
  /** Mac sonu nisan ve ustalik kaydi; sayfada bir kez. */
  private runProgressOutcome?: RunProgressOutcome;
  /** Bu tarayicinin kozmetigi (unvan, tac, muhur); sahne basinda bir kez okunuyor. */
  private cosmetics = readResolvedCosmetics();
  /** Kombo damgalarinin kapisi: tur + sahip basina 4 sn, ekranda en fazla iki. */
  private readonly comboStamps = new ComboStampGate();
  /** Dogus etiketi gosterilmis sampiyonlar: etiket dusman basina bir kez. */
  private readonly announcedChampionIds = new Set<string>();
  /** Irk mekanikleri: ilk gorulme bildirimi (mekanik basina macta bir kez), gecici efektler ve kalkan isaretleri. */
  private readonly raceNotices = new RaceMechanicNotices();
  private readonly raceTransients = new RaceTransientEffects();
  private readonly mekaImpacts = new MekaShieldImpacts();
  /** Meka kalkanlarinin sahne yuzeyi (kalkanlar, catlaklar, katlanma isaretleri, gecici efektler). */
  private raceGraphics?: Phaser.GameObjects.Graphics;
  private raceGraphicsDrawn = false;
  /** Bu karede cizilecek yer isaretleri (catlak, katlanma); dusman dongusu dolduruyor. */
  private readonly raceGroundMarks: Array<{ kind: 0 | 1; x: number; y: number; progress: number; seed: number }> = [];
  private readonly mekaShieldScratch: MekaShieldSnapshot[] = [];
  /** Son gorulen meka kalkanlari (`race:block` noktasi icin) ve ucusun yerel saati. */
  private readonly mekaShieldsById = new Map<number, MekaShieldSnapshot>();
  private readonly mekaShieldFlights = new Map<number, { seenAt: number; remaining: number }>();
  /** Karenin oynatma ani (sunucu saati): catlak ve katlanma uyarilari buradan. */
  private racePlaybackServerTime = 0;
  /** Ozel dusman turu ve karsi atak bildirimleri: tur basina macta bir kez, serit basina bir kez. */
  private readonly specialNotices = new SpecialThreatNotices();
  /** Karsi atak seridi: dolgu dusmanlarin altinda, sert kenarlar kulelerin ustunde. */
  private surgeFillGraphics?: Phaser.GameObjects.Graphics;
  private surgeEdgeGraphics?: Phaser.GameObjects.Graphics;
  /** Seritlerin (en fazla iki) karedeki geometrisi; ayni nesneler yeniden dolduruluyor. */
  private readonly surgeBands: CounterSurgeBand[] = [createCounterSurgeBand(), createCounterSurgeBand()];
  private readonly surgeEntries: CounterSurgeSnapshot[] = [];
  /** Siperde durdurulan atislarin isaretleri (sabit tampon). */
  private readonly aegisImpacts = new AegisImpacts();
  /** Son karede cizili serit vardi: yoksa yuzeyler her karede yeniden temizlenmiyor. */
  private surgeDrawn = false;
  /** Son siper carpma sesi (gercek saat): saniyede birkac kez. */
  private aegisBlockSoundAt = 0;
  /** Metal Kalkan: sahadaki bariyerler (herkesin) ve yerel surukleme onizlemesi. */
  private shieldGraphics?: Phaser.GameObjects.Graphics;
  private shieldPreviewGraphics?: Phaser.GameObjects.Graphics;
  private shieldDrawn = false;
  /** Izlenen surukleme jesti (paylasilan durum makinesi); jest yokken `undefined`. */
  private shieldGesture?: MetalShieldGesture;
  /** Birakilan kalkanin yankisi: sunucunun kalkani kareye girene kadar soluk cizilir. */
  private shieldEcho?: { segment: MetalShieldSegment; until: number };
  /** Acilis sesi calinmis kalkanlar (kimlik); kalkan kalkinca siliniyor. */
  private readonly shieldSeenIds = new Set<number>();
  private shieldCooldownNoticeAt = 0;
  /**
   * Harita jestiyle beceri (bkz. `skill-gestures`): 1. beceri basili tut +
   * surukle (asagi haric), 2. beceri surukle, 3. beceri basili tut + asagi
   * surukle. Jest yokken `undefined`.
   */
  private skillGesture?: SkillGesture;
  private skillGestureView?: SkillGestureView;
  /** Yonlendirme onizlemesi jestten cizildi: jest bitince silinecek. */
  private skillGestureGuidanceShown = false;
  private skillGestureNoticeAt = 0;
  /** Acik kart perdesinin dalgasi; gec gelen veri karneyi bu dalga icin tazeliyor. */
  private cardDraftWave?: number;
  /**
   * Dagitilmis elin kimligi (dalga + kartlar). Ayni el yeniden acildiginda
   * (hedef listesinden geri, sunucunun yeniden gondermesi) kartlar yeniden
   * dagitilmiyor: oyuncu ayni eli ikinci kez "kazanmiyor".
   */
  private cardDealKey = "";
  /**
   * Kart Arsivi'nin "YENİ" etiketleri; kart eli ve magaza vitrini icin ayri.
   * Kimlik sunulur sunulmaz gorulmus yaziliyor, etiket ise ayni sunum ekranda
   * kaldikca (hedef listesinden donus, magazanin yeniden kurulmasi) kaliyor.
   */
  private readonly cardArchiveLatch = new ArchiveOfferLatch();
  private readonly shopArchiveLatch = new ArchiveOfferLatch();
  private cardDealStartedAt = 0;
  /** Kart acilisinin ses zamanlayicilari; perde kapaninca iptal. */
  private cardDealTimers: number[] = [];
  /** Secim damgasinin bittigi an; kule atimi ve toast bundan once baslamiyor. */
  private cardPickStampUntil = 0;
  private cardAppliedTimer?: number;
  private reconnecting = false;
  /** Durum cubuguna en son yazilan "Kurulum n/m" metni; kurulum bitince silinecek olan. */
  private setupStatusText?: string;
  private perfText?: Phaser.GameObjects.Text;
  private hudState: HudState = {
    status: t("scene.status.connecting"),
    stats: EMPTY_HUD_STATS,
    ping: "-- ms",
    pingTone: "warn",
    pingDetail: "",
    continueVisible: false,
    continueWaiting: false,
    perfOpen: false,
    perfText: "",
    audioOpen: false,
    musicVolume: DEFAULT_MUSIC_VOLUME,
    voiceVolume: DEFAULT_VOICE_VOLUME,
    sfxVolume: DEFAULT_SFX_VOLUME,
    hitVolume: DEFAULT_HIT_VOLUME,
    vibration: true,
    atlasVoice: true,
    statsOpen: false,
    statsTab: "damage",
    statsTowers: [],
    statsEffects: [],
    forecastEnemyCount: 0,
    airWarning: false,
    upgradeReady: false
  };
  /**
   * Hava uyarisinin toast olarak soylendigi kurulum arasi.
   *
   * Uyari kutusu kurulum boyunca duruyor; toast ise ara basina bir kez
   * cikiyor, yoksa her kule kurulusunda yeniden belirip ekrani doldururdu.
   */
  private airWarningSetupSession = -1;
  /**
   * Kisa omurlu bildirim.
   *
   * Eskiden kalici ipucu satiriyla ayni alandan gidiyordu; o satirin cizimi
   * kalkinca bildirimler de sessizce kayboldu. Artik kendi alani var ve
   * arayuz onu ayri bir toast olarak gosteriyor.
   */
  private transientNotice?: { id: number; text: string; durationMs: number; until: number };
  /**
   * Bildirim kimligi sahneden bagimsiz artiyor: yeni macta sahne yeniden
   * kurulunca sayac sifirlansaydi arayuz ayni kimligi "zaten gosterildi"
   * sanip mesaji yutardi.
   */
  private static noticeSequence = 0;
  private abartiOrientation: TowerOrientation = "horizontal";
  private ultimateChoiceItems: Phaser.GameObjects.GameObject[] = [];
  private ultimateChoiceOpen = false;
  private zeynepTierChoiceItems: Phaser.GameObjects.GameObject[] = [];
  private pendingZeynepCommandSlot?: number;
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
  /** Menude yaratici mod secildi mi; odayi kurarken sunucuya gidiyor. */
  private creativeRequested = false;
  /** Solo odanin sahip sirri; yeniden baglanma kaydina yaziliyor (`rememberMatchReconnect`). */
  private soloOwnerSecret?: string;
  /** Oyuncu menuye donuyor: odadan izinli cikildi, kopma sanilip yeniden baglanilmasin. */
  private leavingRoom = false;
  /** Oynanan asama; dusman irki sunucuda buradan cikiyor. */
  private selectedStage = 1;
  /** Sunucu bayragi acti mi; panel ve bedava yerlestirme buna bakiyor. */
  private creativeMode = false;
  /** Menude Eğitim secildi mi; odayi kurarken sunucuya gidiyor. */
  private tutorialRequested = false;
  /**
   * Sunucu ogretici bayragini acti mi (snapshot). Adim motoru (tutorial.ts)
   * ve ilerleme kapilari buna bakiyor; magaza dalga icinde de aciliyor.
   */
  private tutorialMode = false;
  /** Ogretici: elle atanmis cephane tasiyicisi bir kuleye teslimat yapti mi (sunucudan). */
  private tutorialAmmoDelivered = false;
  /**
   * Odanin gercek asamasi, her snapshot'ta sunucudan.
   *
   * `selectedStage` menudeki secim; baskasinin odasina katilan oyuncuda odanin
   * asamasiyla ayni olmak zorunda degil. Sonuc ekrani ve kayit buna bakiyor.
   */
  private roomStage?: number;
  private creativeLoadout?: CreativeLoadout;
  /**
   * Ulti basildi, sunucu daha onaylamadi.
   *
   * Sunucudan gelen sarj, komut isleninceye kadar hala 100 goruyor. Bu bayrak
   * olmadan dugme basildiktan sonra bir sure daha "hazir" duruyor: oyuncu
   * bastigini anlamiyor ve kotu baglantida ustune bir daha basiyor.
   */
  private ultimateEchoUntil = 0;
  /** Ulti sarjinin "hazir" gecisi; ilk gozlem gecis sayilmiyor. */
  private readonly ultimateReadyWatch = new UltimateReadyWatch();
  /** Hazir atiminin basladigi an; panel yeniden kurulsa da atim kaldigi yerden suruyor. */
  private ultimateReadyPulseAt?: number;
  /** Atisin yerel zoomu: kameranin kendi yakinlastirmasi (`base`) uzerine carpan. */
  private ultimateZoomPunch?: { startedAt: number; base: number; last: number };
  /**
   * Gonderilmis ama sahada henuz gorunmeyen yerlestirme.
   *
   * Kule ancak sunucu onaylayip `tower:spawn` gonderince beliriyordu; arada
   * harita bos kaliyor ve oyuncu ya bastigini saniyor ya da tekrar deniyor.
   */
  /**
   * Operator bedeni kuleyi varinca kuruyor: ard arda birakilan kulelerin her
   * biri kendi hayaletiyle bekliyor (beden sirayla geziyor). Hayalet, kendi
   * bedenin kuyrugunda hedef durdukca kalkmiyor.
   */
  private pendingPlacements: Array<{ x: number; y: number; definitionId: string; until: number; ghost: Phaser.GameObjects.Image }> = [];
  /** Operator bedenlerinin cizimi (ZentaX, AttackLord). */
  private operatorBodyView?: OperatorBodyView;
  /** Yerelde baslatilan beceri sogumalari; sunucununki gelene kadar gecerli. */
  private skillEchoUntil: number[] = [0, 0, 0];
  private arenaPlayerCount = 1;
  private lastArenaTapAt = 0;
  private lastArenaTapX = 0;
  private lastArenaTapY = 0;
  private arenaZoomed = false;
  /** HTML kaplamalarin tuvali ne kadar ortugu; kamera seridi bundan cikar. */
  private arenaChrome: ArenaChrome = DEFAULT_ARENA_CHROME;
  /** Tuvale inen dokunus sayisi. */
  private canvasGestureCount = 0;
  /** Son dokunuslarin ne oldugu; performans kutusunda gorunur. */
  private tapLog: TapLogEntry[] = [];
  /** Kule panelindeki satis dugmesinin dunya dikdortgeni; yoksa satilamaz. */
  private sellButtonRect?: { x: number; y: number; width: number; height: number };
  private selectedSellText?: Phaser.GameObjects.Text;
  /** Dunya kadar buyuk zemin; olcu degisince birlikte buyur. */
  private backdrop?: Phaser.GameObjects.Rectangle;
  /** Tuvalin son saglam olcusu; hic olculmediyse yok. */
  private lastUsableCanvasRect?: { left: number; top: number; width: number; height: number };
  /** Kac kez tuval olcusu 0x0 okundu; tani satirinda gorunur. */
  private degenerateCanvasRectCount = 0;
  /** Sahne kuruldugundan beri gecen sureyi okumak icin baslangic ani. */
  private readonly sceneStartedAt = performance.now();
  /**
   * Isci cekmecesinin "Ise Al" bolumunde secili kademe.
   *
   * Kademe rolun yanina degil ustune konuyor: dort rolun her biri icin iki
   * ayri dugme sekiz dugme demekti ve telefonda cekmece tasiyordu. Ustelik
   * kademe rolden bagimsiz bir karar -- once "ne kadar harcayacagim", sonra
   * "ne is yapacak".
   */
  private workerHireAdvanced = false;
  /** Zeynep ultisi sutun bekliyor mu; haritaya dokunulunca cozulur. */
  private pendingUltimateColumn = false;
  private localPlayerSnapshot?: GameSnapshot["players"][number];
  /**
   * Son karedeki butun oyuncular. Takim arkadasinin kulesi secildiginde o
   * kuleye etki eden kartlar kule sahibinin destesinden okunuyor.
   */
  private playerSnapshots: GameSnapshot["players"] = [];
  /**
   * Secili kuleye isleyen deste kartlarinin onbellegi.
   *
   * Kontrol durumu her anlik goruntude yeniden kuruluyor ve oyuncu kayitlari
   * her karede yeni dizilerle geliyor, oysa deste yalnizca kart secilince
   * degisiyor. Girdi ayni kaldikca suzme tekrarlanmiyor ve ayni dizi donuyor.
   */
  private towerCardsCache?: { definitionId: string; source: string[]; applied: string[] };
  private zeynepCommandEffects?: GameSnapshot["zeynepCommands"];
  /** Kart perdesi acikken gelen bag anlari; perde kapaninca oynuyor. */
  private pendingLinkMoments: Array<() => void> = [];
  private lastHudKey = "";
  private lastSkillKey = "";
  private lastSelectionKey = "";
  /**
   * Secili kule toast'unun anahtari: yalnizca kule, seviye ve sahip.
   * Canli sayilar her anlik goruntude degisiyor; onlar toast'u da
   * tetikleseydi okuma hic kaybolmaz ve gedik/akis uyarilarini ezerdi.
   */
  private lastSelectionNoticeKey = "";
  private lastPerfOverlayAt = 0;
  private lastShopEventAt = 0;
  private lastRenderedSnapshotServerTime = 0;
  /**
   * Yerel saatten sunucu saatine donusum farki (serverTime - performance.now()).
   *
   * Eskiden bunun yerine "en son gelen snapshot" demir olarak tutuluyor ve
   * oynatma zamani her pakette o paketin varis anina gore yeniden kuruluyordu.
   * Boylece her paketin kendi ag jitteri dogrudan render saatine biniyordu:
   * erken gelen paket zamani ileri, gec gelen geri itiyordu. Dusmanlar yol
   * uzerinde ileri geri mikro sicramalar yapiyordu cunku bazi kareler zamanda
   * geriye gidiyordu.
   *
   * Fark artik tek tek paketlere gore zipllamak yerine yumusatiliyor; gercek
   * saat kaymasi yavas oldugu icin bu yeterince hizli, jitter icin fazlasiyla
   * yavas.
   */
  private droppedSnapshotCount = 0;
  /** Mac kaydedicisinin istemci ornegi (`match-debug.ts`); yalnizca izinli oyuncuda gonderiyor. */
  private matchDebug?: MatchDebugSampler;
  private lastPlaybackAlpha = 0;
  private snapshotBuffer: BufferedSnapshot[] = [];
  private latestPerfSnapshot?: GameSnapshot;
  private latestServerPerf?: ServerPerfSnapshot;
  private pendingShopPlacement?: "bariyer" | "ziftli-zemin";
  /** Isci yol yasagi kipi acik mi; acikken haritaya basmak kare kapatir. */
  private workerBanMode = false;
  /**
   * Isci cekmecesinde secilen ve haritada hedefi beklenen isci. Acikken
   * haritaya dokunus atamaya gider; cekmece o sirada tek satirlik seride iner.
   */
  private workerPick?: WorkerPick;
  /** Isci kadrosunun okundugu son anlik goruntu (isciler ve kaynaklar). */
  private workerRosterSource?: Pick<GameSnapshot, "drones" | "crystalNodes" | "ammoNodes">;
  private shopDismissedWave = 0;
  private pendingAction: PendingAction;
  private draggedTowerDefinition?: TowerDefinition;
  /** Kac kez yarim kalmis surukleme temizlendi; tani satirinda gorunur. */
  private strandedTowerDragCount = 0;
  private ignoreMapPointerUntil = 0;
  private readonly playbackDelayMs = 500;
  private readonly playbackClock = new SnapshotPlaybackClock(this.playbackDelayMs);
  private readonly dragPreviewOffsetY = 64;
  private readonly controlTop = 698;
  private readonly skillRowY = 710;
  private readonly handleControlAction = (event: Event) => {
    this.handleDomControlAction(event as CustomEvent<ControlActionDetail>);
  };

  constructor() {
    super("game");
  }

  init(data: GameSceneData) {
    // Menu kilitli operatorle sahne acmiyor; yine de sahne kendi basina da
    // oynanabilir operatore dusuyor (varsayilan ZentaX).
    this.selectedCharacterId = resolvePlayableCharacterId(data.characterId, "zeynep");
    this.selectedCharacter = characters.find((character) => character.id === this.selectedCharacterId) ?? characters[0];
    this.selectedTowerDefinition = towerCatalog[this.selectedCharacter.id][0];
    this.selectedMapData = normalizeMapData(data.mapData);
    // Olcek burada yetkili: solo oda olcegi bu haritadan aliyor, online'da
    // menu haritayi lobinin olcegine cevirip veriyor. `syncMap` sonra
    // `selectedMapData`yi sunucunun arenasiyla degistiriyor ve arena olcegi
    // tasimiyor (`createOpenArenaMap` hep 1 yaziyor).
    this.runMapScale = this.selectedMapData.scale;
    this.creativeRequested = data.creative === true;
    this.tutorialRequested = data.tutorial === true && !this.creativeRequested;
    this.tutorialMode = false;
    this.tutorialAmmoDelivered = false;
    this.hudState = { ...this.hudState, tutorial: false };
    this.selectedStage = getStage(data.stage).id;
    this.roomStage = undefined;
  }

  private getMapCellSize() {
    return getSharedMapGridSize(this.selectedMapData);
  }

  private scaleWorldDistance(value: number) {
    return value * (this.getMapCellSize() / TOWER_GRID_SIZE);
  }

  /**
   * Kule efektlerinin ve mermilerin sahne olcegi. Mermi cizilen govdesiyle
   * vurdugu icin sunucunun isabet sekli ayni fonksiyondan
   * (`getProjectileSceneScale`): olcek burada degisirse vurus da degisiyor.
   */
  private getTowerEffectScale() {
    return getProjectileSceneScale(this.getMapCellSize());
  }

  create() {
    configureHiDpiCamera(this);
    // Haritanin disinda kalan her sey de siyah: arenanin kenarinda ton degisimi
    // olursa oyun alani bir kutunun icinde duruyormus gibi gorunuyor, oysa
    // istenen sey uzayin kesintisiz devam etmesi.
    this.cameras.main.setBackgroundColor("#000000");
    const world = this.getWorldSize();
    // Zemin dunya kadar: yukseklik cihaza gore degistigi icin sabit bir
    // dikdortgen uzun ekranlarda altta bosluk birakirdi.
    this.backdrop = this.add.rectangle(world.width / 2, world.height / 2, world.width, world.height, 0x000000);
    this.drawMap();
    this.configureArenaCamera();
    this.createPlacementGrid();
    this.feedback = new FeedbackDirector({
      sfxVolume: this.sfxVolume,
      hitVolume: this.hitVolume,
      vibration: this.vibrationEnabled,
      getCamera: () => this.cameras.main
    });
    const feedback = this.feedback;
    this.waveMusic = new WaveMusicPlayer({ getContext: () => feedback.getSharedAudioContext() });
    this.waveMusic.setLevel(getWaveMusicLevel(this.musicVolume, this.atlasMusicDuck));
    this.createAtlasVoice();
    this.createHeader();
    window.addEventListener("karayel:control-action", this.handleControlAction);
    this.beamGraphics = this.add.graphics().setDepth(10);
    // Omuzlar ve haleler ADD: siyah zeminde ust uste binen ton beyaza yaniyor,
    // daha az katmanla daha zengin bir parlama.
    this.beamGlowGraphics = this.add.graphics().setDepth(10.05).setBlendMode(Phaser.BlendModes.ADD);
    this.beamRenderer = new BeamRenderer(this.beamGraphics, this.beamGlowGraphics, this.vfxLod);
    this.beamInterpolator.clear();
    this.beamHitTracker.clear();
    // Mermi izleri mermilerin (11) hemen altinda: iz cekirdegi ortmemeli.
    this.projectileTrailGraphics = this.add.graphics().setDepth(10.9);
    const projectileGlow = this.add.graphics().setDepth(10.85).setBlendMode(Phaser.BlendModes.ADD);
    // Namlu ve carpma kule govdesinin (12) ustunde, seviye halkasinin (12.6)
    // altinda: namlu cakmasi eskiden kulenin altinda kaliyordu.
    const attackEvents = this.add.graphics().setDepth(12.45);
    this.flashPool = new FlashPool(this, 12.5);
    this.glowStamps = new GlowStampPool(this, 10.86);
    this.attackVfx = new AttackVfx(this.projectileTrailGraphics, projectileGlow, attackEvents, this.flashPool, {
      lod: this.vfxLod,
      stamps: this.glowStamps,
      reducedMotion: () => this.feedback?.reducedMotion ?? false,
      // Agir tek vurus (Sunucu, Jackpot; kademe 3, yalnizca kendi kulen):
      // yonetmenin mikro sarsintisi. Aralik, ust sinir ve hareket azaltma orada.
      onHeavyImpact: () => this.feedback?.shakeCamera({ own: true, priority: 1, px: 1.5, durationMs: 90 }),
      // Kendi agir / kinetik kademe 2+ vurusun: vurulan dusman 1-2 px itiliyor
      // (yalnizca istemcide, govdenin cizimi; konum ve can cubugu yerinde).
      onKnock: (x, y, angle, px, enemyId) => this.knockEnemyNear(x, y, angle, px, enemyId),
      // Yanik izleri dusmanlarin (8) altinda.
      ground: this.add.graphics().setDepth(7.3)
    });
    // Atakan isaretleri: alan dusmanlarin altinda (7.4), bag ve ip mermilerin
    // altinda (10.4, ADD omuzlari 10.42), nisangah ve gosterge dusman ve kule
    // govdesinin ustunde, can cubugunun (16) altinda (13.2).
    this.atakanSignatures = new AtakanSignatureVfx(
      this.add.graphics().setDepth(7.4),
      this.add.graphics().setDepth(10.4),
      this.add.graphics().setDepth(10.42).setBlendMode(Phaser.BlendModes.ADD),
      this.add.graphics().setDepth(13.2),
      { lod: this.vfxLod, reducedMotion: () => this.feedback?.reducedMotion ?? false }
    );
    this.signatureTowers = [];
    // Zeynep imzalari: hat isaretinin yer golgesi dusmanlarin altinda (7.45),
    // delme ve dizilim cizgileri mermilerin altinda (10.41, ADD isi 10.43),
    // halka, damga ve kertikler dusman govdesinin ustunde, can cubugunun (16)
    // altinda (13.25).
    this.zeynepSignatures = new ZeynepSignatureVfx(
      this.add.graphics().setDepth(7.45),
      this.add.graphics().setDepth(10.41),
      this.add.graphics().setDepth(10.43).setBlendMode(Phaser.BlendModes.ADD),
      this.add.graphics().setDepth(13.25),
      { lod: this.vfxLod, reducedMotion: () => this.feedback?.reducedMotion ?? false }
    );
    this.zeynepReceipt.clear();
    this.enemyHeadings.clear();
    this.lastProjectileContact.clear();
    this.projectileOwnership.clear();
    // Olumun yer izi (yanik, leke, toz) dusmanlarin altinda; govde, kirinti
    // ve duman ustlerinde. Kivilcim, duman ve iz efektlerin LOD'uyla dusuyor.
    this.combatVfx = new CombatVfx(this.add.graphics().setDepth(11.7), this.add.graphics().setDepth(7.35), this.vfxLod);
    // Efsanevi etkiler: cekim halkalari dusmanlarin altinda (7.38), geri
    // kalani dusman ve kule govdesinin ustunde, can cubugunun (16) altinda (13.3).
    this.legendaryProcs = new LegendaryProcVfx(this.add.graphics().setDepth(13.3), this.add.graphics().setDepth(7.38), {
      lod: this.vfxLod,
      flash: this.flashPool,
      reducedMotion: () => this.feedback?.reducedMotion ?? false,
      fallbackEnemySize: this.getMapCellSize()
    });
    this.damageNumbers = new DamageNumberPool(this, 30);
    // Sayilarin hemen ustunde: seviye etiketi seyrek ve oyuncunun satin aldigi an.
    this.levelLabels = new WorldLabelPool(this, 30.5);
    // Isaretler kule govdesinin (12) ve seviye halkasinin (12.6) hemen ustunde,
    // can cubugunun (16) altinda; onizleme hayaletin (28) ustunde.
    this.synergyMarks = new SynergyMarks(this, { glyph: 12.8, preview: 29 });
    // Menzil halkasi yerlestirme izgarasinin (24) ustunde, hayaletin (28) altinda.
    this.placementRange = new PlacementRangePreview(this, 26);
    // Cizgi isaretleri izgara (24) ve menzil halkasinin (26) ustunde, hayaletin (28) altinda.
    this.wallLineView?.destroy();
    this.wallLineView = new WallLineView(this, 27);
    this.wallGesture = undefined;
    this.wallHandles = undefined;
    this.wallHandlePending = undefined;
    this.wallHandleTargets = [];
    this.wallHandleDrag = undefined;
    this.wallMarksActive = false;
    this.synergyNoticeAt = Number.NEGATIVE_INFINITY;
    // Onceki macin bekleyen bag anlari ve infaz hedeflemesi yeni maca tasinmasin.
    this.pendingLinkMoments = [];
    this.pendingAction = undefined;
    // Sahne ayni nesneyle yeniden baslarsa alan baslaticilari yeniden
    // calismiyor; ilk snapshot yine "ilk" sayilsin, ★ ve etiket yanlis cikmasin.
    this.freshTowerSpawns.clear();
    this.towersPrimed = false;
    this.animatedTowers.clear();
    this.lastSnapshotGold = undefined;
    this.upgradeReadyCount = undefined;
    this.upgradeReadyAnchors = [];
    this.coinCarry = { amount: 0, at: 0 };
    this.goldShopWasOpen = false;
    this.waveClearWatch.reset();
    this.waveReports.reset();
    this.badgeWatch.reset();
    this.badgeNotices.reset();
    this.cardDraftBadgeNotice = undefined;
    this.cosmetics = readResolvedCosmetics();
    this.comboStamps.reset();
    this.announcedChampionIds.clear();
    // Ozel dusman bildirimleri macta bir kez: yeni macta yeniden.
    this.specialNotices.reset();
    // Irk mekanikleri: bildirimler macta bir kez; kalkanlar ve gecici efektler yeni macta bos.
    this.raceNotices.reset();
    this.raceTransients.clear();
    this.mekaShieldsById.clear();
    this.mekaShieldFlights.clear();
    // Meka kalkani ve catlaklar kule govdesinin (12) ustunde, Metal Kalkan'in (12.8) altinda.
    this.raceGraphics = this.add.graphics().setDepth(12.75);
    this.raceGraphicsDrawn = false;
    // Serit dolgusu dusmanlarin (8) altinda, zeminin ustunde; kenarlar kule
    // govdesinin (12) ve seviye halkasinin (12.6) ustunde, can cubugunun (16) altinda.
    this.surgeFillGraphics = this.add.graphics().setDepth(7.25);
    this.surgeEdgeGraphics = this.add.graphics().setDepth(12.7);
    this.surgeDrawn = false;
    this.shieldGraphics = this.add.graphics().setDepth(METAL_SHIELD_DEPTH);
    this.shieldPreviewGraphics = this.add.graphics().setDepth(METAL_SHIELD_PREVIEW_DEPTH);
    this.skillGestureView?.destroy();
    this.skillGestureView = new SkillGestureView(this, METAL_SHIELD_PREVIEW_DEPTH + 0.5);
    this.skillGesture = undefined;
    this.skillGestureGuidanceShown = false;
    this.operatorBodyView?.destroy();
    this.operatorBodyView = new OperatorBodyView(this, {
      lod: this.vfxLod,
      reducedMotion: () => this.feedback?.reducedMotion ?? false,
      flash: this.flashPool,
      localSessionId: () => this.localSessionId,
      onLowHp: (body) => {
        // Uyari gorsel: kendi bedeninde bir not, takim arkadasinda yalnizca halka.
        if (body.id === this.localSessionId && !this.matchResultShown) this.showNotice(t("scene.body.lowHp"));
      }
    });
    this.shieldDrawn = false;
    this.shieldGesture = undefined;
    this.shieldEcho = undefined;
    this.shieldSeenIds.clear();
    this.shieldCooldownNoticeAt = 0;
    this.cardDraftWave = undefined;
    this.ultimateReadyWatch.reset();
    this.ultimateReadyPulseAt = undefined;
    this.ultimateZoomPunch = undefined;
    this.cardDealKey = "";
    this.cardPickStampUntil = 0;
    this.killCombo.reset();
    this.assistToasts.reset();
    this.streakBanners.clear();
    this.streakGlows = [];
    this.streakVoice = undefined;
    this.streakVoiceHold = undefined;
    this.rampageExit = undefined;
    // Zemin katmani: kule govdesinin altinda, dusmanlarin altinda.
    this.streakGlowGraphics = this.add.graphics().setDepth(STREAK_GLOW_DEPTH);
    this.createKillStreakAudio();
    this.createBackgroundMusic();
    this.emitControlState();

    this.enemyGroup = this.physics.add.group({ defaultKey: "enemy-grunt" });
    this.projectileGroup = this.physics.add.group({ defaultKey: "projectile-tower", maxSize: 260 });

    this.game.events.on("game:chrome", this.applyArenaChrome, this);
    this.game.events.on("game:tower-sheet", this.applyTowerSheetReport, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off("game:tower-sheet", this.applyTowerSheetReport, this));
    this.game.events.on("game:tower-sheet-rect", this.applyTowerSheetRect, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off("game:tower-sheet-rect", this.applyTowerSheetRect, this));
    // Ogretici adim motorunun istekleri (tutorial.ts): hazirlik, Devam, bitis.
    this.game.events.on("game:tutorial-command", this.handleTutorialCommand, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off("game:tutorial-command", this.handleTutorialCommand, this));
    // Cihaz donunce ya da arac cubugu acilip kapaninca tuvalin orani degisiyor;
    // kamera o anki olcuden kuruldugu icin yeniden kurulmasi gerekiyor.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.installMapPointerInput();
    // Mac kaydedicisi: sekme gizlenmesi ve WebGL kaybi kare olcusunu acikliyor.
    const onDebugVisibility = () => this.matchDebug?.noteVisibility(document.visibilityState === "hidden");
    const onDebugContextLost = () => this.matchDebug?.noteContextLost();
    document.addEventListener("visibilitychange", onDebugVisibility);
    this.game.events.on("contextlost", onDebugContextLost);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener("visibilitychange", onDebugVisibility);
      this.game.events.off("contextlost", onDebugContextLost);
      this.matchDebug = undefined;
      // Bounty Board: menuye donus oynanisi durdurur; bekleyen kayit hemen gider.
      arcade.gameplayStop();
      arcade.flushStorage();
      document.querySelector("#defense-dialog")?.remove();
      removeRunReport();
      for (const timer of this.runReportCueTimers) window.clearTimeout(timer);
      this.runReportCueTimers = [];
      this.pendingPreview = undefined;
      this.latestDefenseSummary = undefined;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
      window.removeEventListener("karayel:control-action", this.handleControlAction);
      this.pingTimer?.remove(false);
      this.towerStatsTimer?.remove(false);
      this.towerStatsTimer = undefined;
      this.towerStatsBlock = undefined;
      this.towerStatsRequestKey = "";
      this.placementGrid?.destroy();
      this.melisNightmareMapGraphics?.destroy();
      this.placementGhost?.destroy();
      this.guidancePreview?.destroy();
      this.rampageContainer?.destroy(true);
      this.rampageContainer = undefined;
      this.rampageExit = undefined;
      this.streakBanners.clear();
      this.streakGlows = [];
      this.streakGlowGraphics?.destroy();
      this.streakGlowGraphics = undefined;
      this.surgeFillGraphics?.destroy();
      this.surgeFillGraphics = undefined;
      this.surgeEdgeGraphics?.destroy();
      this.surgeEdgeGraphics = undefined;
      this.surgeDrawn = false;
      this.shieldGraphics?.destroy();
      this.shieldGraphics = undefined;
      this.shieldPreviewGraphics?.destroy();
      this.shieldPreviewGraphics = undefined;
      this.skillGestureView?.destroy();
      this.skillGestureView = undefined;
      this.skillGesture = undefined;
      this.skillGestureGuidanceShown = false;
      this.operatorBodyView?.destroy();
      this.operatorBodyView = undefined;
      this.clearPendingPlacement();
      this.shieldDrawn = false;
      this.shieldGesture = undefined;
      this.shieldEcho = undefined;
      this.streakVoice?.audio.pause();
      this.streakVoice = undefined;
      this.streakVoiceHold = undefined;
      this.hideAudioSettingsPanel();
      this.hidePerfPopup();
      this.hideUltimateChoices();
      this.hideZeynepTierChoices();
      // Perdeyi kapatmak bekleyen bag anlarini oynatirdi; kapanan sahnede degil.
      this.pendingLinkMoments = [];
      this.hideCardChoices();
      window.clearTimeout(this.cardAppliedTimer);
      this.cardAppliedTimer = undefined;
      this.backgroundMusic?.pause();
      // Mac sonu sahnesi: katman, govde sinifi ve zamanlayici kalmasin (rapor acilmiyor; sahne kapaniyor).
      window.clearTimeout(this.matchEndSafetyTimer);
      this.matchEndSafetyTimer = undefined;
      this.matchEndReport = undefined;
      this.matchEndStage?.destroy();
      this.matchEndStage = undefined;
      // Dalga muzigi de ayni baglamda: kapanmadan once birakiliyor.
      this.waveMusic?.destroy();
      this.waveMusic = undefined;
      // ATLAS baglami geri bildirimden aliyor: baglam kapanmadan once sussun.
      this.atlas?.destroy();
      this.atlas = undefined;
      this.atlasMatchKey = undefined;
      this.atlasTowerWatch.reset();
      this.atlasWaveWatch.reset();
      this.atlasSurgeCuts.reset();
      this.atlasNexusDropWatch.reset();
      this.atlasComboWatch.reset();
      this.atlasAmbient.reset();
      this.game.events.emit("game:hud-atlas", false);
      this.feedback?.destroy();
      this.feedback = undefined;
      this.beamHitTracker.clear();
      this.flashPool?.destroy();
      this.flashPool = undefined;
      this.glowStamps?.destroy();
      this.glowStamps = undefined;
      this.attackVfx?.clear();
      this.atakanSignatures?.clear();
      this.signatureTowers = [];
      this.zeynepSignatures?.clear();
      this.legendaryProcs?.clear();
      this.legendaryProcs = undefined;
      this.zeynepReceipt.clear();
      this.enemyHeadings.clear();
      this.lastProjectileContact.clear();
      this.beamInterpolator.clear();
      this.projectileOwnership.clear();
      this.damageNumbers?.destroy();
      this.damageNumbers = undefined;
      this.levelLabels?.destroy();
      this.levelLabels = undefined;
      this.synergyMarks?.destroy();
      this.synergyMarks = undefined;
      this.placementRange?.destroy();
      this.placementRange = undefined;
      this.wallLineView?.destroy();
      this.wallLineView = undefined;
      this.animatedTowers.clear();
      this.freshTowerSpawns.clear();
      for (const marker of this.upgradeReadyMarkers) marker.destroy();
      this.upgradeReadyMarkers = [];
      this.upgradeReadyAnchors = [];
      this.workerPick = undefined;
      this.workerRosterSource = undefined;
      this.game.events.emit("game:controls-state", { visible: false });
      this.game.events.emit("game:hud-hide");
    });

    void this.connect();
  }

  update() {
    const now = performance.now();
    const frameMs = this.lastVfxFrameAt > 0 ? now - this.lastVfxFrameAt : 16.7;
    this.lastVfxFrameAt = now;
    this.matchDebug?.noteFrame(frameMs, now);
    this.vfxFrameCost = 0;
    this.renderPlaybackFrame(now);
    const vfxStart = performance.now();
    this.combatVfx?.render(now, this.getTowerEffectScale());
    this.attackVfx?.render(now, this.getTowerEffectScale());
    this.legendaryProcs?.render(now, this.legendaryLookup);
    this.updateMatchEnd(now);
    this.flashPool?.update(now);
    const eventsMs = performance.now() - vfxStart;
    this.recordClientPerfSection("vfx", eventsMs);
    // LOD olcusu: isinlar + mermi efektleri + olaylar, ve kare araligi.
    this.vfxLod.note(this.vfxFrameCost + eventsMs, frameMs, now);
    if (this.matchDebug) {
      this.matchDebug.noteLod(this.vfxLod.level);
      this.matchDebug.tick(now);
    }
    this.damageNumbers?.update(now);
    this.levelLabels?.update(now);
    this.updateAnimatedTowers(now);
    this.updateUltimateZoomPunch(now);
    this.updateUpgradeReadyMarkers(now);
    this.renderStreakGlows(now);
    this.resolvePendingPlacement();
    this.tickWallLine(now);
    this.renderMapPickFrame(now);
  }

  private drawMap() {
    const graphics = this.mapGraphics ?? this.add.graphics().setDepth(1);
    this.mapGraphics = graphics;
    graphics.clear();
    this.renderedMapKey = this.getMapRenderKey(this.selectedMapData);
    const cellSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    const tileColumns = this.selectedMapData.cols;
    const tileRows = this.selectedMapData.rows;
    const bounds = getMapWorldBounds(this.selectedMapData);

    const sky = this.getTerrainBackdropBounds();
    const texture = `terrain-stage-${getStage(this.roomStage ?? this.selectedStage).id}`;
    if (!this.terrainImage?.active) this.terrainImage = this.add.image(0, 0, texture).setDepth(0.9);
    this.terrainImage.setTexture(texture).setPosition(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      .setDisplaySize(bounds.width, bounds.height).setTint(0xb8b8b8);
    // Cover only the outside of the arena; the opaque floor stays below gameplay.
    graphics.fillStyle(0x06080c, 1);
    graphics.fillRect(sky.left, sky.top, sky.width, Math.max(0, bounds.top - sky.top));
    graphics.fillRect(sky.left, bounds.bottom, sky.width, Math.max(0, sky.top + sky.height - bounds.bottom));
    graphics.fillRect(sky.left, bounds.top, Math.max(0, bounds.left - sky.left), bounds.height);
    graphics.fillRect(bounds.right, bounds.top, Math.max(0, sky.left + sky.width - bounds.right), bounds.height);

    // Kurulum yasak bolgeler: zeminin ustunde, oyun ogelerinin altinda.
    drawBuildZones(graphics, this.getActiveBuildZones(), { originX: origin.x, originY: origin.y, cellSize });

    // Arenanin siniri: izgara gidince oyun alaninin nerede bittigi baska hicbir
    // seyden okunmuyor. Uzay artik arenanin disinda da surdugu icin sinir
    // biraz daha belirgin: oyun alaninin nerede bittigini soyleyen tek sey bu.
    const arenaWidth = tileColumns * cellSize;
    const arenaHeight = tileRows * cellSize;
    graphics.lineStyle(1, 0x38bdf8, 0.34);
    graphics.lineBetween(origin.x, origin.y, origin.x, origin.y + arenaHeight);
    graphics.lineBetween(origin.x + arenaWidth, origin.y, origin.x + arenaWidth, origin.y + arenaHeight);
    // Dogum ve nexus satirlari boyanmiyor (sahibin istegi): yalnizca en ust ve
    // en alt kenar kendi renginde, kareler zeminle ayni kaliyor.
    graphics.lineStyle(2, 0x67e8f9, 0.75);
    graphics.lineBetween(origin.x, origin.y, origin.x + arenaWidth, origin.y);
    graphics.lineStyle(2, 0xf9a8d4, 0.75);
    graphics.lineBetween(origin.x, origin.y + arenaHeight, origin.x + arenaWidth, origin.y + arenaHeight);
  }

  /** Haritanin cizim anahtari: kareler ve yasak bolgeler; ayniysa yeniden cizilmiyor. */
  private getMapRenderKey(map: EditableMapData) {
    const zones = this.buildZones && this.buildZones.cols === map.cols && this.buildZones.rows === map.rows ? this.buildZones : undefined;
    return `${map.cols}x${map.rows}:${map.tiles.join("")}|${getBuildZoneRenderKey(zones)}`;
  }

  /** Secili haritaya ait yasak bolgeler; olcu tutmuyorsa (eski arena) yok. */
  private getActiveBuildZones() {
    const zones = this.buildZones;
    const map = this.selectedMapData;
    return zones && zones.cols === map.cols && zones.rows === map.rows ? zones : undefined;
  }

  /**
   * Hayaletin yerlestirmesi yasak bolgeye mi degiyor (sunucudaki kuralla
   * ayni): kulenin herhangi bir karesi bolgede ya da kenar yapisinin bir
   * segmenti bolge karesine degiyor.
   */
  private isPreviewInBuildZone(x: number, y: number, definitionId = this.draggedTowerDefinition?.id ?? this.selectedTowerDefinition.id) {
    const zones = this.getActiveBuildZones();
    if (!zones) return false;
    const board = { cols: this.selectedMapData.cols, rows: this.selectedMapData.rows };
    if (this.isEdgePlacedDefinition(definitionId)) {
      const segments = this.getAbartiEdgeSegments(x, y, this.getPlacementOrientation(definitionId, x, y), this.getEdgeLength(definitionId));
      return isPlacementBlockedByBuildZone(zones, board, { segments });
    }
    return isPlacementBlockedByBuildZone(zones, board, { footprint: this.getTowerPreviewFootprintCells(x, y) });
  }

  /**
   * Gokyuzunun kaplayacagi alan: kameranin gorebilecegi her yer.
   *
   * `configureArenaCamera` ile ayni dikdortgen, ayni paylarla. Ikisi ayrisirsa
   * kameranin gidebildigi ama yildizin cizilmedigi bir serit kalir.
   */
  private getTerrainBackdropBounds() {
    const view = getArenaCameraView(this.selectedMapData, this.arenaChrome, this.getWorldSize());
    const padding = TOWER_GRID_SIZE;
    return {
      left: view.left - padding,
      top: view.top - padding,
      width: view.width + padding * 2,
      height: view.height + padding * 2
    };
  }

  private createPlacementGrid() {
    this.placementGrid = this.add.graphics().setDepth(24).setVisible(false);
  }

  private createHeader() {
    this.hudState.musicVolume = this.musicVolume;
    this.hudState.voiceVolume = this.voiceVolume;
    this.hudState.sfxVolume = this.sfxVolume;
    this.hudState.hitVolume = this.hitVolume;
    this.hudState.vibration = this.vibrationEnabled;
    this.hudState.atlasVoice = this.atlasEnabled;
    this.emitHudState();
  }

  /**
   * Oyuncuya kisa bir mesaj gosterir.
   *
   * Durum hemen yollaniyor; toast'u kapatan arayuzun kendi zamanlayicisi,
   * cunku dalga aralarinda anlik goruntu akisi susuyor ve sahne suresi dolan
   * bildirim icin yeni durum yollamayabiliyor.
   */
  private showNotice(text: string, durationMs = 3200) {
    GameScene.noticeSequence += 1;
    this.transientNotice = { id: GameScene.noticeSequence, text, durationMs, until: performance.now() + durationMs };
    this.emitControlState();
  }

  private getActiveNotice() {
    if (!this.transientNotice) return undefined;
    if (this.transientNotice.until <= performance.now()) {
      this.transientNotice = undefined;
      return undefined;
    }
    const { id, text, durationMs } = this.transientNotice;
    return { id, text, durationMs };
  }

  /**
   * Istatistik panelinin verisi.
   *
   * Yalnizca panel acikken hesaplaniyor: kapaliyken her karede kule
   * listesi kurup etki tablosu cevirmenin karsiligi yok.
   *
   * Kuleler oyuncunun kendi kuleleri, etkiler ise odanin tamami. Ikisi
   * farkli kapsamda cunku yavaslatma ve durdurma bircok kaynagin
   * birlestigi bir zincirden cikiyor; orada "kim yavaslatti" diye tek bir
   * cevap yok. Etkiler sekmesinin basligi da bunu soyluyor.
   */
  private getStatsHudPatch(): Partial<HudState> {
    if (!this.hudState.statsOpen) return {};
    const towers = [...this.towerSnapshots.values()]
      .filter((tower) => tower.ownerId === this.localSessionId)
      .map((tower) => ({
        id: tower.id,
        name: getTowerDisplayName(tower.definitionId, tower.name),
        level: tower.level,
        damage: tower.damageDealt ?? 0,
        dps: tower.currentDps ?? 0
      }));

    const stats = this.latestPerfSnapshot?.effectStats ?? {};
    const effects = Object.entries(stats)
      .map(([key, value]) => ({
        label: getEffectStatLabel(key),
        value,
        unit: SECOND_VALUED_EFFECT_STATS.has(key) ? ("seconds" as const) : ("damage" as const)
      }))
      .sort((a, b) => b.value - a.value);

    return { statsTowers: towers, statsEffects: effects };
  }

  private emitHudState(patch: Partial<HudState> = {}) {
    const changed = Object.entries(patch).some(([key, value]) => this.hudState[key as keyof HudState] !== value);
    if (!changed && Object.keys(patch).length > 0) {
      return;
    }
    this.hudState = { ...this.hudState, ...patch };
    this.game.events.emit("game:hud-state", { ...this.hudState });
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
    this.audioSettingsOpen = false;
    this.perfPopupOpen = true;
    this.emitHudState({ perfOpen: true, audioOpen: false, perfText: this.getPerfPopupText() });
  }

  private hidePerfPopup() {
    for (const item of this.perfPopupItems) {
      item.destroy();
    }
    this.perfPopupItems = [];
    this.perfPopupOpen = false;
    this.emitHudState({ perfOpen: false });
  }

  private createAudioSettingsButton() {
    const x = GAME_WORLD_WIDTH - 48;
    const y = 52;
    const button = this.add.rectangle(x, y, 58, 24, 0x1e293b, 0.96)
      .setStrokeStyle(1, 0x94a3b8, 0.62)
      .setInteractive({ useHandCursor: true })
      .setDepth(62);
    const label = this.add.text(x, y, t("scene.audio.button"), {
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
    this.perfPopupOpen = false;
    this.audioSettingsOpen = true;
    // Istatistik acikken panel her snapshotta yeniden ciziliyor ve kaydiricilar
    // acilistaki eski degerlerle kurulup suruklemeyi koparirdi; iki pencere,
    // `toggleStatsHud`in sesi kapattigi gibi, birbirini disliyor.
    this.emitHudState({
      audioOpen: true,
      perfOpen: false,
      statsOpen: false,
      ...this.getAudioHudPatch()
    });
  }

  private hideAudioSettingsPanel() {
    for (const item of this.audioSettingsItems) {
      item.destroy();
    }
    this.audioSettingsItems = [];
    this.audioSettingsOpen = false;
    this.emitHudState({ audioOpen: false });
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
    if (channel === "music") return this.musicVolume;
    if (channel === "sfx") return this.sfxVolume;
    if (channel === "hit") return this.hitVolume;
    return this.voiceVolume;
  }

  /**
   * Ses paneline giden degerlerin tamami.
   *
   * Kaydiricilar surulurken durum yollanmiyor (panel yeniden cizilir ve
   * surukleme kopar). Panel baska bir nedenle yeniden cizildiginde -- titresim
   * kutusu -- eski degerle cizilmesin diye hepsi birlikte gidiyor.
   */
  private getAudioHudPatch(): Partial<HudState> {
    return {
      musicVolume: this.musicVolume,
      voiceVolume: this.voiceVolume,
      sfxVolume: this.sfxVolume,
      hitVolume: this.hitVolume,
      vibration: this.vibrationEnabled,
      atlasVoice: this.atlasEnabled
    };
  }

  private setAudioVolume(channel: AudioVolumeChannel, value: number) {
    const volume = Phaser.Math.Clamp(value, 0, 1);
    if (channel === "music") {
      this.musicVolume = volume;
      writeStoredVolume(MUSIC_VOLUME_STORAGE_KEY, volume);
    } else if (channel === "sfx") {
      this.sfxVolume = volume;
      writeStoredVolume(SFX_VOLUME_STORAGE_KEY, volume);
    } else if (channel === "hit") {
      this.hitVolume = volume;
      writeStoredVolume(HIT_VOLUME_STORAGE_KEY, volume);
    } else {
      this.voiceVolume = volume;
      writeStoredVolume(VOICE_VOLUME_STORAGE_KEY, volume);
      // ATLAS da seslendirme kanalinda: calan satir yeni seviyeye.
      this.atlas?.setVolume(volume);
    }
    this.applyAudioVolumes();
    if (channel === "sfx") {
      // Onizleme: oyuncu kaydiriciyi surerken yeni seviyeyi duysun -- hafif
      // bir oldurme sesi, en fazla 250 ms'de bir. Kaydirici bir dokunus
      // oldugu icin baglam burada acilabiliyor; ilk hareketin onizlemesi
      // yonetmende bir an tutulup baglam acilinca caliyor.
      this.feedback?.unlockAudio();
      this.feedback?.previewSfx();
    } else if (channel === "hit") {
      // Onizleme: kendi mermi vurusun, sv 1. Oyunun vurus butcesinin disinda
      // (savas ortasinda da duyulur) ve 250 ms'de bir; baglam bu dokunusta
      // aciliyorsa ilk hareket sessiz.
      this.feedback?.unlockAudio();
      this.feedback?.previewHit();
    }
  }

  /**
   * Titresim ayari.
   *
   * Acilinca bir kez kisa titriyor: oyuncu ayarin ise yaradigini o an
   * hissetsin. Kapaliyken yonetmen hicbir olayda titretmiyor.
   */
  private setVibrationEnabled(on: boolean) {
    this.vibrationEnabled = on;
    writeStoredFlag(VIBRATION_STORAGE_KEY, on);
    this.feedback?.setVibration(on);
    if (on) {
      this.feedback?.vibrate(12);
    }
    this.emitHudState(this.getAudioHudPatch());
  }

  /** "ATLAS sesi" kutusu: kapaliyken hicbir satir calmiyor, calan susuyor. */
  private setAtlasVoiceEnabled(on: boolean) {
    this.atlasEnabled = on;
    writeAtlasEnabled(on);
    this.atlas?.setEnabled(on);
    this.emitHudState(this.getAudioHudPatch());
  }

  /**
   * ATLAS yonetmeni. Ses geri bildirim yonetmeninin baglamindan (iOS kilidi
   * tek yerde), seviye seslendirme kaydiricisindan. Konusurken efekt ve muzik
   * ~%35 kisiliyor, ust bilgide telsiz gostergesi yaniyor ve calan seri anonsu
   * susuyor (ATLAS oncelikli; konusurken yeni seri anonsu da baslamiyor).
   */
  private createAtlasVoice() {
    const feedback = this.feedback;
    this.atlas = new AtlasVoice({
      audio: createAtlasWebAudio({ getContext: () => feedback?.getSharedAudioContext() }),
      getVolume: () => this.voiceVolume,
      enabled: this.atlasEnabled,
      onSpeaking: (speaking) => this.handleAtlasSpeaking(speaking),
      // Gosterge: ATLAS satirinda ve konusmanin ATLAS satirinda "ATLAS",
      // VESAYET satirinda "VESAYET"; konusmanin bosluklarinda kapali.
      onSpeaker: (speaker) => this.game.events.emit("game:hud-atlas", speaker ?? false)
    });
  }

  /**
   * Muzikli dalganin savasi suruyorsa dongu caliyor; kurulum, temizlenme ve
   * mac sonu solduruyor (`wave-music.ts`). Ogreticide muzik yok. Bir sonraki
   * muzikli dalga yaklasinca dosya onceden indiriliyor.
   */
  private updateWaveMusic(snapshot: GameSnapshot) {
    const music = this.waveMusic;
    if (!music) return;
    const wave = snapshot.team.wave;
    const over = Boolean(snapshot.result) || this.matchResultShown || this.tutorialMode;
    for (const track of WAVE_MUSIC_TRACKS) {
      if (!over && track.waves.some((musicWave) => musicWave - 1 === wave || musicWave === wave)) music.prefetch(track);
    }
    music.update(getWaveMusicTrackForState({
      wave,
      setupPhase: Boolean(snapshot.setupPhase),
      enemiesLeft: snapshot.team.enemiesLeft,
      over
    }));
  }

  private handleAtlasSpeaking(speaking: boolean) {
    this.feedback?.setDuck(speaking ? ATLAS_DUCK_GAIN : 1, ATLAS_DUCK_TIME_CONSTANT);
    this.atlasMusicDuck = speaking ? ATLAS_DUCK_GAIN : 1;
    if (this.backgroundMusic) this.backgroundMusic.volume = this.musicVolume * this.atlasMusicDuck;
    this.waveMusic?.setLevel(getWaveMusicLevel(this.musicVolume, this.atlasMusicDuck));
    if (speaking && this.streakVoice && !this.streakVoice.audio.paused) {
      this.streakVoice.audio.pause();
    }
  }

  /**
   * ATLAS'in snapshot kancalari (oynatilan snapshot basina bir kez): macin
   * basi (karsilama), dalga basi, nexus cani, yerel kule yikilmasi ve Metal
   * Kalkan'in bir karsi atagi yutmasi. Ayni olay snapshot'ta tekrar gelse de
   * izciler bir kez sayiyor.
   */
  private observeAtlas(snapshot: HydratedGameSnapshot) {
    const atlas = this.atlas;
    if (!atlas || !this.room || snapshot.result || this.matchResultShown) return;
    const key = `${this.room.roomId}:${snapshot.stage ?? this.roomStage ?? 0}`;
    if (this.atlasMatchKey !== key) {
      this.atlasMatchKey = key;
      this.atlasTowerWatch.reset();
      this.atlasWaveWatch.reset();
      this.atlasSurgeCuts.reset();
      this.atlasNexusDropWatch.reset();
      this.atlasComboWatch.reset();
      atlas.startMatch(key, readAtlasWelcomed(key));
      // Bu asamanin konusmalari (birkac yuz KB): tetik aninda dosya hazir olsun.
      atlas.prefetchUrls(getAtlasDialogueUrls(getStageDialogues(snapshot.stage ?? this.roomStage)));
      // Ara sozlerin plani: tohum oda kimligi + asama (co-op'ta herkes ayni plan).
      this.atlasAmbient.start(key, snapshot.stage ?? this.roomStage, { seed: key });
      atlas.prefetchUrls(this.atlasAmbient.entries.map((entry) => entry.line.url));
    }
    if (!atlas.hasWelcomed) {
      atlas.welcome();
      writeAtlasWelcomed(key);
    }
    const started = this.atlasWaveWatch.observe({ wave: snapshot.team.wave, setupPhase: Boolean(snapshot.setupPhase), over: false });
    if (started !== undefined) {
      atlas.waveStarted(started);
      // Ilk dalga basladi: geri kalan kategoriler arka planda.
      atlas.prefetchRest();
    }
    // Konusmalar nexus uyarisindan once: ayni vurus konusmayi tetikliyorsa
    // (conv-5) seviye-3 uyarisi konusmanin icinde kaliyor ve dusuyor.
    this.observeAtlasDialogues(snapshot, key);
    atlas.nexusHealth(snapshot.team.health, snapshot.team.maxHealth);
    if (this.atlasTowerWatch.observe(snapshot.towers, this.localSessionId, (id) => id === WALL_TOWER_ID) > 0) {
      atlas.towerDestroyed();
    }
    for (const surge of snapshot.surges ?? []) {
      if (Array.isArray(surge.cut) && surge.cut.length > 0 && this.atlasSurgeCuts.first(surge.id)) atlas.praise();
    }
    // Ara soz en sonda: ayni snapshot'taki olaylar (ve konusmalar) once.
    this.observeAtlasAmbient(snapshot);
  }

  /**
   * ATLAS'in ara sozu: plan ve an `atlas-ambient.ts`'de. Hicbir sesi kesmiyor:
   * ATLAS, konusma ya da seri anonsu caliyorsa bekliyor. Ogretici ve
   * yaratici kosuda yok.
   */
  private observeAtlasAmbient(snapshot: HydratedGameSnapshot) {
    const atlas = this.atlas;
    if (!atlas || ATLAS_AMBIENT_LINES.length === 0) return;
    if (snapshot.tutorial === true || this.isTutorialRun() || snapshot.creative === true || this.creativeMode) return;
    const streakPlaying = Boolean(this.streakVoice && !this.streakVoice.audio.paused && !this.streakVoice.audio.ended);
    const busy = atlas.isSpeaking || atlas.inDialogue || streakPlaying;
    const line = this.atlasAmbient.due({
      wave: snapshot.team.wave,
      setupPhase: Boolean(snapshot.setupPhase),
      waveEnemyCount: snapshot.team.waveEnemyCount,
      enemiesLeft: snapshot.team.enemiesLeft
    }, busy);
    if (line && atlas.sayAmbient(line.url)) this.atlasAmbient.markPlayed(line.id, snapshot.team.wave);
  }

  /**
   * ATLAS-VESAYET konusmalari (`atlas-dialogue.ts`): tablo, tetikler ve kosu
   * basina bir kez kaydi orada; burada snapshot olgulari. Izciler her
   * snapshot'ta ilerliyor (ogretici/yaratici kosuda da; tetik orada reddediliyor).
   * Pencere tetigi (dalga ortasi) yalnizca basladiginda kaydediliyor ve
   * baslayamazsa sonraki snapshot'ta yeniden deneniyor; olay tetigi (kombo,
   * nexus) o an harcaniyor. Calan konusma varken yenisi siraya giriyor.
   */
  private observeAtlasDialogues(snapshot: HydratedGameSnapshot, runKey: string) {
    const atlas = this.atlas;
    if (!atlas) return;
    const local = snapshot.players.find((player) => player.id === this.localSessionId);
    const skillCombo = local ? this.atlasComboWatch.observe(local, snapshot.serverTime) : false;
    const nexusDrop = this.atlasNexusDropWatch.observe(snapshot.team.health, snapshot.team.maxHealth);
    const due = findDueAtlasDialogues({
      stage: snapshot.stage ?? this.roomStage,
      wave: snapshot.team.wave,
      setupPhase: Boolean(snapshot.setupPhase),
      tutorial: snapshot.tutorial === true || this.isTutorialRun(),
      creative: snapshot.creative === true || this.creativeMode,
      over: Boolean(snapshot.result) || this.matchResultShown,
      waveEnemyCount: snapshot.team.waveEnemyCount,
      enemiesLeft: snapshot.team.enemiesLeft,
      skillCombo,
      nexusDrop
    }, (id) => readAtlasDialoguePlayed(runKey, id));
    for (const dialogue of due) {
      const started = atlas.playDialogue(dialogue, { queue: true });
      if (started || isAtlasDialogueEvent(dialogue)) writeAtlasDialoguePlayed(runKey, dialogue.id);
    }
  }

  private applyAudioVolumes() {
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.musicVolume * this.atlasMusicDuck;
    }
    this.waveMusic?.setLevel(getWaveMusicLevel(this.musicVolume, this.atlasMusicDuck));

    for (const audio of Object.values(this.killStreakSounds).flat()) {
      // Calan takim arkadasi klibi kisik kalir; kaydirici onu tam sese cekmesin.
      const teammate = this.streakVoice?.audio === audio && !this.streakVoice.own;
      audio.volume = this.voiceVolume * (teammate ? TEAMMATE_STREAK_VOICE_GAIN : 1);
    }
    this.feedback?.setSfxVolume(this.sfxVolume);
    this.feedback?.setHitVolume(this.hitVolume);
    // Uyari tonu burada yok cunku seviyeyi her calista kendisi okuyor. Onceki
    // uyari sesi bir HTMLAudioElement'ti ve seviyesi yalnizca kurulusta bir kez
    // yaziliyordu -- listeye eklenmedigi icin ayarlardan kisilamiyordu.
  }

  // ------------------------------------------------------------ Duvar cizgisi

  /** CSS pikselinin dunya birimi karsiligi (kamera yakinlastirmasi dahil). */
  private getWorldPerCssPx() {
    const rect = this.lastUsableCanvasRect;
    const canvasPerCssPx = rect && rect.width > 0 ? this.game.canvas.width / rect.width : 1;
    return canvasPerCssPx / Math.max(0.0001, this.cameras.main.zoom);
  }

  private getWallUnitCost() {
    const definition = towerCatalog[this.selectedCharacter.id].find((tower) => tower.id === WALL_TOWER_ID) ?? wallTower;
    return getTowerBuildCost(definition.cost);
  }

  private getWallLineGeometry() {
    return {
      gridSize: this.getMapCellSize(),
      origin: getMapOrigin(this.selectedMapData),
      board: { cols: this.selectedMapData.cols, rows: this.selectedMapData.rows }
    };
  }

  /**
   * Cizginin parcalari ve her birinin durumu. Sunucu ayni cizgiyi
   * `getWallLine` ile cozuyor; gecerlilik tekli yerlestirmenin kuraliyla
   * (yasak bolge, dolu kenar) soruluyor.
   */
  private computeWallLinePreview(anchor: { x: number; y: number }, finger: { x: number; y: number }, axis?: WallLineAxis) {
    const geometry = this.getWallLineGeometry();
    const line = getWallLine({ ...geometry, anchor, finger, axis });
    let zoneBlocked = 0;
    const pieces = line.segments.map((segment) => {
      const center = getWallSegmentCenter(segment, geometry);
      const inZone = this.isPreviewInBuildZone(center.x, center.y, WALL_TOWER_ID);
      if (inZone) zoneBlocked += 1;
      const valid = !inZone && this.canPlaceEdgePreview(center.x, center.y, segment.orientation, "", WALL_TOWER_ID);
      return { segment, center, valid, funded: false };
    });
    const unit = this.getWallUnitCost();
    const affordable = getAffordableWallPieces(this.currentTeamGold, unit);
    const picked = pickAffordableWallPieces(pieces, affordable);
    for (const piece of picked.placed) piece.funded = true;
    const validCount = pieces.filter((piece) => piece.valid).length;
    return { line, pieces, validCount, placed: picked.placed, unit, zoneBlocked, affordable };
  }

  private drawWallLineGrid() {
    const grid = this.placementGrid;
    if (!grid) return;
    const cellSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    const arenaRight = origin.x + this.selectedMapData.cols * cellSize;
    const arenaBottom = origin.y + this.selectedMapData.rows * cellSize;
    grid.clear();
    grid.lineStyle(1, 0xe2e8f0, 0.16);
    for (let x = origin.x; x <= arenaRight + 0.01; x += cellSize) grid.lineBetween(x, origin.y, x, arenaBottom);
    for (let y = origin.y; y <= arenaBottom + 0.01; y += cellSize) grid.lineBetween(origin.x, y, arenaRight, y);
  }

  /**
   * Cizgi onizlemesi: her parca yesil (kurulur), kehribar (gecerli ama altin
   * yetmiyor) ya da kirmizi (gecersiz); parmagin yaninda parca sayisi ve bedel.
   */
  private renderWallLinePreview(anchor: { x: number; y: number }, finger: { x: number; y: number }, axis?: WallLineAxis) {
    const grid = this.placementGrid;
    const view = this.wallLineView;
    if (!grid || !view) return undefined;
    const preview = this.computeWallLinePreview(anchor, finger, axis);
    grid.setVisible(true);
    this.drawWallLineGrid();
    for (const piece of preview.pieces) {
      const rect = this.getAbartiEdgeSegmentRect(piece.segment);
      const fill = !piece.valid ? 0xef4444 : piece.funded ? 0x22c55e : 0xf59e0b;
      const stroke = !piece.valid ? 0xfca5a5 : piece.funded ? 0x86efac : 0xfcd34d;
      grid.fillStyle(fill, 0.42);
      grid.lineStyle(2, stroke, 0.95);
      grid.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      grid.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    }

    // Capa isareti cizginin gercek ilk parcasinda: hayalet baska yonde olabilir.
    this.wallLineStart = preview.pieces[0]?.center;
    const placeable = preview.placed.length;
    let text: string;
    let warn = false;
    if (preview.validCount === 0) {
      text = t("scene.line.none");
      warn = true;
    } else if (placeable === 0) {
      text = t("scene.line.noGold");
      warn = true;
    } else if (placeable < preview.validCount) {
      text = t("scene.line.costShort", { n: placeable, total: preview.validCount, cost: placeable * preview.unit });
      warn = true;
    } else {
      text = t("scene.line.cost", { n: placeable, cost: placeable * preview.unit });
    }
    const wpp = this.getWorldPerCssPx();
    const origin = getMapOrigin(this.selectedMapData);
    const arenaWidth = this.selectedMapData.cols * this.getMapCellSize();
    const x = Math.max(origin.x + 70 * wpp, Math.min(origin.x + arenaWidth - 70 * wpp, finger.x));
    view.setLabel(text, x, finger.y - 22 * wpp, warn);
    return preview;
  }

  /** Bekleme doldu: hayaletin kenari cizginin basi olur. */
  private lockWallAnchor(gesture: NonNullable<GameScene["wallGesture"]>) {
    const cell = this.snapToTowerGrid(gesture.finger.x, gesture.finger.y, WALL_TOWER_ID);
    gesture.anchor = { x: cell.x, y: cell.y };
    this.placementGhost?.setVisible(false);
    this.synergyMarks?.clearPreview();
    this.placementRange?.clear();
    // Titresim ayari kapaliysa yonetmen zaten titretmiyor.
    this.feedback?.vibrate(18);
  }

  private clearWallGesture() {
    this.wallGesture = undefined;
    this.wallLineStart = undefined;
    this.wallLineView?.clear();
    this.wallMarksActive = false;
  }

  /**
   * Cizgiyi sunucuya yollar. Hicbir parca kurulamiyorsa istek gitmez ve neden
   * soylenir; sunucu zaten ayni kurali yeniden soruyor.
   */
  private sendWallLine(anchor: { x: number; y: number }, finger: { x: number; y: number }, axis?: WallLineAxis) {
    const preview = this.computeWallLinePreview(anchor, finger, axis);
    if (preview.validCount === 0) {
      this.showNotice(t(preview.zoneBlocked === preview.pieces.length ? "scene.place.forbiddenZone" : "scene.line.none"));
      return false;
    }
    if (preview.placed.length === 0) {
      this.showNotice(t("scene.line.noGold"));
      return false;
    }
    this.room?.send("wall:line", {
      definitionId: WALL_TOWER_ID,
      x1: anchor.x,
      y1: anchor.y,
      x2: finger.x,
      y2: finger.y,
      ...(axis ? { axis } : {})
    });
    // Capadan en uzaktaki kurulacak parca: tutamaclar onaydan sonra oradan acilir.
    const last = preview.placed[preview.placed.length - 1];
    if (last) this.queueWallHandles(last.segment);
    return true;
  }

  // ---- Uzatma tutamaclari

  /** Baska bir eylem bekliyorken ya da suruyorken tutamac gorunmez ve basilamaz. */
  private isWallHandleBlocked() {
    return !this.room || this.creativeMode || this.matchResultShown || Boolean(
      this.pendingAction || this.isGuidanceDragging || this.draggedTowerDefinition || this.workerPick
      || this.pendingUltimateColumn || this.pendingShopPlacement || this.workerBanMode
      || this.performanceSliderDragging || this.cardChoiceRoot
    );
  }

  /** Kurulan duvarin dizisinde tutamaclar acilsin; sunucu onaylayinca gorunur. */
  private queueWallHandles(segment: EdgeSegment) {
    this.wallHandles = undefined;
    this.wallHandleTargets = [];
    this.wallHandlePending = { segment, until: performance.now() + 3000 };
  }

  private hideWallHandles() {
    if (!this.wallHandles && !this.wallHandlePending) return;
    this.wallHandles = undefined;
    this.wallHandlePending = undefined;
    this.wallHandleTargets = [];
    if (this.wallMarksActive && !this.wallGesture) {
      this.wallLineView?.clearMarks();
      this.wallMarksActive = false;
    }
  }

  /**
   * Dizinin serbest uclari. Duvar henuz yoksa (sunucu onaylamadi) `undefined`,
   * dizi her yonden kapaliysa bos dizi. Yalnizca oyuncunun kendi duvarlari
   * diziyi surer; baskasinin duvari bir uc'u kapatir ama diziye girmez.
   */
  private computeWallHandleTargets(segment: EdgeSegment): WallHandleTarget[] | undefined {
    const key = (entry: EdgeSegment) => `${entry.orientation}:${entry.col}:${entry.row}`;
    const own = new Set<string>();
    const all = new Set<string>();
    for (const tower of this.towerSnapshots.values()) {
      if (tower.definitionId !== WALL_TOWER_ID || (tower.hp !== undefined && tower.hp <= 0)) continue;
      const [edge] = this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation ?? "horizontal", 1);
      if (!edge) continue;
      all.add(key(edge));
      if (tower.ownerId === this.localSessionId) own.add(key(edge));
    }
    if (!own.has(key(segment))) return undefined;
    const geometry = this.getWallLineGeometry();
    return getWallRunEnds(segment, own, geometry.board)
      .filter((end) => !all.has(key(end.next)))
      .map((end) => ({ end, center: getWallSegmentCenter(end.next, geometry) }))
      // Yasak bolgeye ya da kurulamayan kenara giden uc tutamac gostermez.
      .filter(({ end, center }) => !this.isPreviewInBuildZone(center.x, center.y, WALL_TOWER_ID)
        && this.canPlaceEdgePreview(center.x, center.y, end.next.orientation, "", WALL_TOWER_ID))
      .map(({ end, center }) => ({ x: center.x, y: center.y, axis: end.next.orientation, direction: end.direction }));
  }

  /** Kare basina: bekleyen duvari cozer, tutamaclari cizer ya da kapatir, bekleme halkasini surer. */
  private tickWallLine(now: number) {
    const view = this.wallLineView;
    if (!view) return;

    const gesture = this.wallGesture;
    if (gesture && this.draggedTowerDefinition) {
      view.clearMarks();
      this.wallMarksActive = true;
      const radius = this.getMapCellSize() * 0.5;
      if (!gesture.anchor) {
        gesture.dwell = advanceWallDwell(gesture.dwell, gesture.client.x, gesture.client.y, now);
        if (gesture.dwell.locked) {
          this.lockWallAnchor(gesture);
          if (gesture.anchor) this.renderWallLinePreview(gesture.anchor, gesture.finger);
        } else {
          const progress = getWallDwellProgress(gesture.dwell, now);
          const ghost = this.placementGhost;
          if (progress >= 0.1 && ghost) view.drawDwellRing(ghost.x, ghost.y, progress, radius * 1.1);
        }
      }
      if (gesture.anchor) {
        const start = this.wallLineStart ?? gesture.anchor;
        view.drawAnchor(start.x, start.y, radius, now);
      }
      return;
    }

    const pending = this.wallHandlePending;
    if (pending) {
      const targets = this.computeWallHandleTargets(pending.segment);
      if (targets !== undefined) {
        this.wallHandlePending = undefined;
        this.wallHandles = { segment: pending.segment, until: now + WALL_LINE_HANDLE_VISIBLE_MS };
      } else if (now >= pending.until) {
        this.wallHandlePending = undefined;
      }
    }

    const handles = this.wallHandles;
    if (!handles) {
      if (this.wallMarksActive) {
        view.clearMarks();
        this.wallMarksActive = false;
      }
      return;
    }
    // Basili tutamac suren surukleme sirasinda sure dolmaz: parmak havada.
    if ((now >= handles.until && !this.wallHandleDrag) || this.isWallHandleBlocked()) {
      this.hideWallHandles();
      return;
    }
    if (this.wallHandleDrag?.moved) {
      view.clearMarks();
      return;
    }
    const targets = this.computeWallHandleTargets(handles.segment);
    if (!targets || targets.length === 0) {
      this.hideWallHandles();
      return;
    }
    this.wallHandleTargets = targets;
    const marks: WallHandleMark[] = targets;
    // Son 600 ms'de solarak kapanir.
    const alpha = Math.max(0.25, Math.min(1, (handles.until - now) / 600));
    view.clearMarks();
    view.drawHandles(marks, this.getMapCellSize() * 0.3, now, alpha);
    this.wallMarksActive = true;
  }

  private tryBeginWallHandleDrag(pointer: Phaser.Input.Pointer) {
    if (!this.wallHandles || this.wallHandleTargets.length === 0 || this.isWallHandleBlocked()) return false;
    const radius = (WALL_LINE_HANDLE_TOUCH_PX / 2) * this.getWorldPerCssPx();
    let best: { target: WallHandleTarget; distance: number } | undefined;
    for (const target of this.wallHandleTargets) {
      const distance = Math.hypot(pointer.worldX - target.x, pointer.worldY - target.y);
      if (distance <= radius && (!best || distance < best.distance)) best = { target, distance };
    }
    if (!best) return false;
    const event = (pointer as unknown as { domEvent?: PointerEvent }).domEvent;
    this.wallHandleDrag = {
      target: best.target,
      startClient: { x: event?.clientX ?? 0, y: event?.clientY ?? 0 },
      moved: false,
      finger: { x: pointer.worldX, y: pointer.worldY }
    };
    return true;
  }

  private moveWallHandleDrag(pointer: Phaser.Input.Pointer) {
    const drag = this.wallHandleDrag;
    if (!drag) return false;
    const event = (pointer as unknown as { domEvent?: PointerEvent }).domEvent;
    if (!drag.moved && event
      && Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) > WALL_LINE_HANDLE_DRAG_PX) {
      drag.moved = true;
      // Suruklemeye gecince tutamaclar kapanir; cizgi onizlemesi devralir.
      this.wallLineView?.clearMarks();
      this.wallMarksActive = false;
    }
    drag.finger = { x: pointer.worldX, y: pointer.worldY };
    if (drag.moved) this.renderWallHandlePreview(drag);
    return true;
  }

  private renderWallHandlePreview(drag: NonNullable<GameScene["wallHandleDrag"]>) {
    const anchor = { x: drag.target.x, y: drag.target.y };
    const finger = constrainWallHandleFinger(anchor, drag.finger, drag.target.axis, drag.target.direction);
    this.renderWallLinePreview(anchor, finger, drag.target.axis);
    // Etiket parmagin gercek konumunda (cizgi eksenine indirilmis noktada degil).
    const wpp = this.getWorldPerCssPx();
    this.wallLineView?.setLabelPosition(drag.finger.x, drag.finger.y - 30 * wpp);
  }

  /** Birakis. Dokunus (kayma yok) ise `false`: normal harita dokunusu islesin. */
  private finishWallHandleDrag(pointer: Phaser.Input.Pointer) {
    const drag = this.wallHandleDrag;
    if (!drag) return false;
    this.wallHandleDrag = undefined;
    if (!drag.moved) return false;
    this.ignoreMapPointerUntil = performance.now() + 180;
    this.placementGrid?.clear().setVisible(false);
    this.wallLineView?.hideLabel();
    const anchor = { x: drag.target.x, y: drag.target.y };
    const finger = constrainWallHandleFinger(anchor, { x: pointer.worldX, y: pointer.worldY }, drag.target.axis, drag.target.direction);
    this.feedback?.unlockAudio();
    this.sendWallLine(anchor, finger, drag.target.axis);
    return true;
  }

  private cancelWallHandleDrag() {
    if (!this.wallHandleDrag) return;
    const moved = this.wallHandleDrag.moved;
    this.wallHandleDrag = undefined;
    if (moved) {
      this.placementGrid?.clear().setVisible(false);
      this.wallLineView?.hideLabel();
    }
  }

  private startTowerDrag(tower: TowerDefinition, pointer: Phaser.Input.Pointer) {
    this.startTowerDragAt(tower, this.getTowerDragPreviewPoint(pointer));
  }

  private startTowerDragAt(tower: TowerDefinition, previewPoint: { x: number; y: number }, client?: { x: number; y: number }) {
    this.cancelExecuteTargeting();
    this.cancelWallHandleDrag();
    this.hideWallHandles();
    this.clearWallGesture();
    // Kule yerlestirme kalkan jestinden once gelir: suren jest kapaniyor.
    this.cancelShieldGesture();
    this.draggedTowerDefinition = tower;
    this.selectedTowerDefinition = tower;
    this.selectedPlacedTowerId = undefined;
    this.placementGrid?.setVisible(true);
    this.placementGhost?.destroy();
    // Matches the placed sprite: disc on the tile, frame slightly larger to hold
    // whatever overhangs it.
    const ghost = this.getGhostSize(tower.id, this.getPlacementOrientation(tower.id, previewPoint.x, previewPoint.y));
    this.placementGhost = this.add.image(previewPoint.x, previewPoint.y, getTowerTextureKey(tower.id, 1, this.selectedCharacterId))
      .setDisplaySize(ghost.width, ghost.height)
      .setAlpha(0.78)
      .setDepth(28);
    // Duvar surukleniyorsa parmak 450 ms durursa cizgi basi sabitlenir. Yaratici
    // modda duvar bedelsiz ve ayri kanaldan gidiyor; cizgi mesaji bedelli, o yuzden kapali.
    if (tower.id === WALL_TOWER_ID && client && !this.creativeMode) {
      this.wallGesture = { dwell: startWallDwell(client.x, client.y, performance.now()), client, finger: previewPoint };
    }
    this.updateTowerDragAt(previewPoint);
    this.updateSelectionUi();
  }

  /**
   * Surukleme hayaletinin olcusu.
   *
   * Kenar yapilari kare kaplamaz. Duvari bu daldan gecirmemek onu tam kare bir
   * disk olarak cizdiriyordu; yesil/kirmizi tint de disk bicimli oldugu icin
   * oyuncunun gordugu sey bir kenar degil dairesel bir alan oluyordu.
   */
  private getGhostSize(definitionId: string, orientation: TowerOrientation) {
    const size = getTowerSpriteSize(definitionId, this.getMapCellSize() * getTowerGridSpan(definitionId));
    if (!this.isEdgePlacedDefinition(definitionId)) {
      return { width: size, height: size };
    }

    const long = this.getEdgeLength(definitionId) === 1 ? 0.92 : 1.7;
    return {
      width: size * (orientation === "vertical" ? 0.24 : long),
      height: size * (orientation === "vertical" ? long : 0.24)
    };
  }

  private updateTowerDrag(pointer: Phaser.Input.Pointer) {
    this.updateTowerDragAt(this.getTowerDragPreviewPoint(pointer));
  }

  private updateTowerDragAt(previewPoint: { x: number; y: number }, client?: { x: number; y: number }) {
    if (!this.draggedTowerDefinition) {
      return;
    }

    const gesture = this.wallGesture;
    if (gesture) {
      gesture.finger = previewPoint;
      if (client) gesture.client = client;
      if (!gesture.anchor) {
        gesture.dwell = advanceWallDwell(gesture.dwell, gesture.client.x, gesture.client.y, performance.now());
        if (gesture.dwell.locked) this.lockWallAnchor(gesture);
      }
      if (gesture.anchor) {
        // Capadan sonra tek hayalet yok, cizgi var.
        this.renderWallLinePreview(gesture.anchor, previewPoint);
        return;
      }
    }

    const definitionId = this.draggedTowerDefinition.id;
    const cell = this.snapToTowerGrid(previewPoint.x, previewPoint.y, definitionId);
    const canPlace = this.canPlaceTowerPreview(cell.x, cell.y);
    const ghost = this.getGhostSize(definitionId, this.getPlacementOrientation(definitionId, previewPoint.x, previewPoint.y));
    this.placementGhost?.setPosition(cell.x, cell.y)
      .setDisplaySize(ghost.width, ghost.height)
      .setTint(canPlace ? 0x86efac : 0xf87171);
    this.drawPlacementGrid(cell.x, cell.y, canPlace);
    // Kare degismedikce yeniden hesaplanmiyor (onizleme kendi anahtarini tutuyor).
    this.synergyMarks?.preview({
      definition: this.draggedTowerDefinition,
      characterId: this.selectedCharacter.id,
      x: cell.x,
      y: cell.y,
      canPlace,
      localSessionId: this.localSessionId,
      map: this.selectedMapData,
      cellSize: this.getMapCellSize(),
      bounds: getMapWorldBounds(this.selectedMapData),
      pending: this.pendingPlacements
    });
    // Hayaletin menzili, o karede alacagi haliyle (yalnizlik dahil). Ayni
    // kare ve ayni sahada yeniden cizilmiyor.
    this.placementRange?.update({
      definition: this.draggedTowerDefinition,
      characterId: this.selectedCharacter.id,
      x: cell.x,
      y: cell.y,
      canPlace,
      map: this.selectedMapData,
      structures: this.synergyMarks?.getStructures() ?? []
    });
  }

  private finishTowerDrag(pointer: Phaser.Input.Pointer) {
    this.finishTowerDragAt(this.getTowerDragPreviewPoint(pointer));
  }

  private finishTowerDragAt(previewPoint: { x: number; y: number }) {
    const tower = this.draggedTowerDefinition;
    if (!tower) {
      return;
    }

    // Yon ham noktadan turetilir: snap sonrasi nokta zaten cizgi uzerinde oldugu
    // icin oradan yon okumak bilgiyi kaybeder.
    const orientation = this.getPlacementOrientation(tower.id, previewPoint.x, previewPoint.y);
    const cell = this.snapToTowerGrid(previewPoint.x, previewPoint.y, tower.id, orientation);
    const canPlace = this.canPlaceTowerPreview(cell.x, cell.y);
    const lineAnchor = this.wallGesture?.anchor;
    if (lineAnchor) {
      // Capa atilmis: birakis tek duvar degil cizgi. Capaya donen parmak tek parca birakir.
      if (this.room) {
        this.feedback?.unlockAudio();
        this.sendWallLine(lineAnchor, previewPoint);
      }
    } else if (this.room && canPlace) {
      // Inisin tok sesi onay donunce caliyor; birakis bir kullanici hareketi,
      // oyuncu tuvale hic dokunmadan (kule tepsisinden) surukleyebiliyor.
      this.feedback?.unlockAudio();
      // Yaratici modda ayni yerlestirme akisi bedelsiz kanaldan gidiyor;
      // suruklemenin, onizlemenin ve yonun tekrar yazilmasi gerekmiyor.
      this.room.send(this.creativeMode ? "creative:tower" : "placeTower", {
        definitionId: tower.id,
        x: cell.x,
        y: cell.y,
        orientation: tower.id === "zeynep-8" ? this.abartiOrientation : undefined,
        // Duvarda yon sunucuda konumdan cozulur; buradaki yalnizca onizleme icin.
      
      });
      this.echoPlacement(cell.x, cell.y, tower.id);
      // Tek duvar kuruldu: dizinin uclarinda uzatma tutamaclari acilacak.
      if (tower.id === WALL_TOWER_ID && !this.creativeMode) {
        const [placed] = this.getAbartiEdgeSegments(cell.x, cell.y, orientation, 1);
        if (placed) this.queueWallHandles(placed);
      }
    } else {
      // Yasak bolgede neden kurulamadigi ayrica soyleniyor.
      this.showNotice(t(this.isPreviewInBuildZone(cell.x, cell.y) ? "scene.place.forbiddenZone" : "scene.place.blocked"));
    }

    this.clearWallGesture();
    this.draggedTowerDefinition = undefined;
    this.ignoreMapPointerUntil = performance.now() + 180;
    this.synergyMarks?.clearPreview();
    this.placementRange?.clear();
    this.placementGrid?.clear().setVisible(false);
    this.placementGhost?.destroy();
    this.placementGhost = undefined;
    this.updateSelectionUi();
  }

  /**
   * Yerlestirmeden vazgecer.
   *
   * `finishTowerDragAt`'in sunucuya istek gondermeyen hali. Surukleme yalnizca
   * parmagin birakma olayiyla bitiyordu; o olay gelmezse `draggedTowerDefinition`
   * kalici olarak dolu kaliyor ve **butun harita kapaniyor**: `isBattlePointer`
   * false donuyor, `handleMapPointer` ilk kapida donuyor. Disaridan gorunen sey
   * ne kulelere ne haritaya tiklanabilmesi, ulti sutununun da secilememesi.
   */
  private cancelTowerDrag() {
    if (!this.draggedTowerDefinition) {
      return;
    }
    this.clearWallGesture();
    this.draggedTowerDefinition = undefined;
    this.synergyMarks?.clearPreview();
    this.placementRange?.clear();
    this.placementGrid?.clear().setVisible(false);
    this.placementGhost?.destroy();
    this.placementGhost = undefined;
    this.updateSelectionUi();
  }

  /**
   * Haritaya inen parmak, acik kalmis bir suruklemeyi gecersiz kilar.
   *
   * Panelden baslayan bir surukleme tuvale `pointerdown` uretmez -- basma
   * dugmenin uzerinde olur, hareketler pencereden akar. Dolayisiyla tuvale yeni
   * bir parmak inerken hala acik duran bir surukleme, birakma olayini kaybetmis
   * demektir. Bedeli, surukleme sirasinda ikinci bir parmakla haritaya dokunma
   * gibi gercekte kullanilmayan bir hareketin suruklemeyi iptal etmesi; karsiligi
   * ise hangi sebeple takilirsa takilsin bir sonraki dokunusta kendini
   * toparlamasi.
   */
  private releaseStrandedTowerDrag() {
    if (!this.draggedTowerDefinition) {
      return;
    }
    this.strandedTowerDragCount += 1;
    this.cancelTowerDrag();
    this.showNotice(t("scene.place.strandedCancelled"));
  }

  /**
   * Gonderilen yerlestirmeyi sahada hemen gosterir.
   *
   * Kule, sunucu onaylayip `tower:spawn` gonderene kadar hic gorunmuyordu.
   * Iyi baglantida bu bir goz kirpmasi, kotusunde saniyeler: oyuncu kareye
   * bakip bir sey olmadigini gorunce ya tekrar deniyor ya vazgeciyor.
   *
   * Hayalet gercek kuleden ayirt edilebilir kaliyor (soluk ve solup parliyor):
   * gosterilen sey "kuruldu" degil, "istek yolda".
   */
  private echoPlacement(x: number, y: number, definitionId: string) {
    // Ayni karenin eski hayaleti yenisine yer birakiyor; digerleri kuyrukta bekliyor.
    for (const entry of [...this.pendingPlacements]) {
      if (Math.abs(entry.x - x) < 1 && Math.abs(entry.y - y) < 1) this.clearPendingPlacement(entry);
    }
    const span = this.getGhostSize(definitionId, this.getPlacementOrientation(definitionId, x, y));
    const ghost = this.add.image(x, y, getTowerTextureKey(definitionId, 1, this.selectedCharacterId))
      .setDisplaySize(span.width, span.height)
      .setAlpha(0.5)
      .setDepth(27);
    this.tweens.add({
      targets: ghost,
      alpha: 0.24,
      duration: 420,
      yoyo: true,
      repeat: -1
    });
    this.pendingPlacements.push({ x, y, definitionId, until: performance.now() + LOCAL_ECHO_TIMEOUT_MS, ghost });
    // Kuyrukta ust uste binen istekler sinirsiz hayalet birakmasin.
    while (this.pendingPlacements.length > 10) this.clearPendingPlacement(this.pendingPlacements[0]);
  }

  /** Tek hayaleti (verilmezse hepsini) kaldirir. */
  private clearPendingPlacement(entry?: GameScene["pendingPlacements"][number]) {
    const entries = entry ? [entry] : [...this.pendingPlacements];
    for (const pending of entries) {
      this.tweens.killTweensOf(pending.ghost);
      pending.ghost.destroy();
      const index = this.pendingPlacements.indexOf(pending);
      if (index >= 0) this.pendingPlacements.splice(index, 1);
    }
  }

  /** Sunucu bu karedeki yerlestirmeyi reddetti (beden varinca kare doluydu): hayalet gidiyor. */
  private dropPendingPlacementAt(x: unknown, y: unknown) {
    if (typeof x !== "number" || typeof y !== "number") return;
    for (const entry of [...this.pendingPlacements]) {
      if (Math.abs(entry.x - x) < 1 && Math.abs(entry.y - y) < 1) this.clearPendingPlacement(entry);
    }
  }

  /**
   * Bekleyen yerlestirme gerceklestiyse ya da zaman asimina ugradiysa birakir.
   *
   * Gerceklesme olcutu, hedeflenen karede o oyuncuya ait bir kulenin belirmesi.
   * Sunucu onay mesaji gondermedigi icin tek kanit bu. Kendi bedeninin
   * kuyrugunda (en son gelen snapshot) hedef durdukca sure dolmuyor.
   */
  private resolvePendingPlacement() {
    if (this.pendingPlacements.length === 0) {
      return;
    }
    const now = performance.now();
    const queue = this.snapshotBuffer[this.snapshotBuffer.length - 1]?.snapshot.bodies?.find((body) => body.id === this.localSessionId)?.q;
    for (const pending of [...this.pendingPlacements]) {
      let built = false;
      for (const tower of this.towerSnapshots.values()) {
        if (tower.ownerId !== this.localSessionId) continue;
        if (Math.abs(tower.x - pending.x) < 1 && Math.abs(tower.y - pending.y) < 1) {
          built = true;
          break;
        }
      }
      if (built) {
        this.clearPendingPlacement(pending);
        continue;
      }
      let queued = false;
      for (let index = 0; queue && index + 1 < queue.length; index += 2) {
        if (Math.abs(queue[index] - pending.x) < 1 && Math.abs(queue[index + 1] - pending.y) < 1) queued = true;
      }
      // Beden hala yolda: hayalet kalsin; kurulduktan sonra oynatma gecikmesi kadar daha.
      if (queued) pending.until = Math.max(pending.until, now + this.playbackDelayMs + 700);
      else if (now >= pending.until) this.clearPendingPlacement(pending);
    }
  }

  private getTowerDragPreviewPoint(pointer: Phaser.Input.Pointer) {
    return {
      x: pointer.worldX,
      y: pointer.worldY - this.dragPreviewOffsetY / this.getArenaFitFactor()
    };
  }

  private getTowerDragPreviewPointFromClient(clientX: number, clientY: number) {
    const rect = this.game.canvas.getBoundingClientRect();
    const screenX = ((clientX - rect.left) / rect.width) * this.cameras.main.width;
    const screenY = ((clientY - rect.top) / rect.height) * this.cameras.main.height;
    const world = this.cameras.main.getWorldPoint(screenX, screenY);
    return {
      x: world.x,
      y: world.y - this.dragPreviewOffsetY / this.getArenaFitFactor()
    };
  }

  private handleDomControlAction(event: CustomEvent<ControlActionDetail>) {
    const detail = event.detail;
    if (!detail) {
      return;
    }
    // Her HUD eylemi bir pointerup/change/input isleyicisinden eszamanli
    // geliyor, yani bir kullanici etkinlestirmesinin icinde: askidaki ses
    // baglami (arka plandan donus, iOS kesintisi) burada surdurulsun. Surukleme
    // hareketi pointermove'dan geliyor, etkinlestirme sayilmiyor; atlaniyor.
    if (detail.action !== "towerDragMove") {
      this.feedback?.unlockAudio();
    }

    // Kurulabilir liste, karakterin kiti degil: duvar kimsenin kiti degil ama
    // herkes kurabiliyor. Kiti aramak duvar butonunu tumden tepkisiz birakiyordu.
    const findTower = () => towerCatalog[this.selectedCharacter.id].find((tower) => tower.id === detail.towerId);
    const previewPoint = () => {
      if (detail.clientX === undefined || detail.clientY === undefined) {
        return undefined;
      }
      return this.getTowerDragPreviewPointFromClient(detail.clientX, detail.clientY);
    };
    const getClientPoint = () => detail.clientX === undefined || detail.clientY === undefined
      ? undefined
      : { x: detail.clientX, y: detail.clientY };

    switch (detail.action) {
      case "continueWave":
        this.room?.send("wave:continue");
        this.ignoreMapPointerUntil = performance.now() + 220;
        break;
      case "togglePerfHud":
        this.togglePerfPopup();
        break;
      case "toggleStatsHud":
        this.emitHudState({
          statsOpen: !this.hudState.statsOpen,
          perfOpen: false,
          audioOpen: false,
          ...this.getStatsHudPatch()
        });
        break;
      case "setStatsTab": {
        const sekmeler = ["damage", "dps", "effects"] as const;
        const sekme = sekmeler[detail.value ?? 0] ?? "damage";
        this.emitHudState({ statsTab: sekme, ...this.getStatsHudPatch() });
        break;
      }
      case "toggleAudioHud":
        this.toggleAudioSettingsPanel();
        break;
      case "setMusicVolume":
        if (typeof detail.value === "number") this.setAudioVolume("music", detail.value);
        break;
      case "setVoiceVolume":
        if (typeof detail.value === "number") this.setAudioVolume("voice", detail.value);
        break;
      case "setSfxVolume":
        if (typeof detail.value === "number") this.setAudioVolume("sfx", detail.value);
        break;
      case "setHitVolume":
        if (typeof detail.value === "number") this.setAudioVolume("hit", detail.value);
        break;
      case "setVibration":
        this.setVibrationEnabled(detail.value === 1);
        break;
      case "setAtlasVoice":
        this.setAtlasVoiceEnabled(detail.value === 1);
        break;
      case "quitMatch":
        this.confirmQuitMatch();
        break;
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
        this.startTowerDragAt(tower, point, getClientPoint());
        break;
      }
      case "towerDragMove": {
        const point = previewPoint();
        if (point) {
          this.updateTowerDragAt(point, getClientPoint());
        }
        break;
      }
      case "towerDragEnd": {
        const point = previewPoint();
        if (point) {
          this.finishTowerDragAt(point);
        } else {
          // Nokta okunamadiysa yerlestirme yapilamaz, ama surukleme de acik
          // birakilamaz: acik surukleme haritayi tumden kapatiyor.
          this.cancelTowerDrag();
        }
        break;
      }
      case "towerDragCancel":
        this.cancelTowerDrag();
        break;
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
          this.echoUltimateCast({});
        }
        this.hideUltimateChoices();
        this.clearPlacedTowerSelection();
        break;
      case "upgradeUltimatePower":
        // Onayin sesi sunucudan donunce caliyor ve dokunusun disinda baglam
        // acilamiyor; oyuncu tuvale hic dokunmadiysa baglam burada acilsin.
        this.feedback?.unlockAudio();
        this.room?.send("ultimate:upgrade", {});
        break;
      case "upgradeTower":
        this.hideZeynepTierChoicesIfOpen();
        if (this.selectedPlacedTowerId) {
          // Seviye tinisi snapshot'ta seviye degisince caliyor; baglam ancak
          // dokunusun icinde acilabiliyor.
          this.feedback?.unlockAudio();
          this.room?.send("upgradeTower", { towerId: this.selectedPlacedTowerId });
        }
        break;
      case "creativeLevel":
        if (this.selectedPlacedTowerId && typeof detail.level === "number") {
          this.feedback?.unlockAudio();
          this.room?.send("creative:level", { towerId: this.selectedPlacedTowerId, level: detail.level });
        }
        break;
      case "creativeCard":
        if (detail.cardId) {
          this.room?.send("creative:card", { cardId: detail.cardId, towerId: this.selectedPlacedTowerId, on: detail.on });
        }
        break;
      case "creativeItem":
        if (detail.itemId) {
          this.room?.send("creative:item", { itemId: detail.itemId, towerId: this.selectedPlacedTowerId, on: detail.on });
        }
        break;
      case "creativeWave":
        if (typeof detail.wave === "number") {
          this.room?.send("creative:wave", { wave: detail.wave });
        }
        break;
      case "creativeSpawn":
        this.room?.send("creative:spawn", { count: detail.count ?? 1 });
        break;
      case "repairStructure":
        if (this.selectedPlacedTowerId) {
          this.feedback?.unlockAudio();
          this.room?.send("structure:repair", { towerId: this.selectedPlacedTowerId });
        }
        return;
      case "repairAll":
        // Liste ve bedel sunucuda yeniden hesaplaniyor; istemci sayi yollamiyor.
        this.feedback?.unlockAudio();
        this.room?.send("structure:repairAll", {});
        return;
      case "clearTowerSelection":
        this.clearPlacedTowerSelection();
        break;
      case "sellTower":
        this.hideZeynepTierChoicesIfOpen();
        this.requestSellSelectedTower();
        break;
      case "setUnderworldMode":
        this.hideZeynepTierChoicesIfOpen();
        if (this.selectedPlacedTowerId && detail.underworldMode) {
          this.room?.send("setTowerMode", { towerId: this.selectedPlacedTowerId, mode: detail.underworldMode });
        }
        break;
      case "toggleAmmoLogistics":
        if (this.selectedPlacedTowerId) {
          this.room?.send("toggleAmmoLogistics", { towerId: this.selectedPlacedTowerId });
        }
        break;
      case "setFactoryProduction":
        this.room?.send("factory:production", { towerId: this.selectedPlacedTowerId, ammoType: detail.ammoType });
        break;
      case "setLogisticsPriority":
        this.room?.send("tower:priority", { towerId: this.selectedPlacedTowerId, priority: detail.priority });
        break;
      case "showDefenseSummary":
        if (this.latestDefenseSummary) openDefenseDialog(t("scene.defense.title", { wave: this.latestDefenseSummary.wave }), defenseSummaryLines(this.latestDefenseSummary));
        break;
      case "toggleWallGate":
        if (this.selectedPlacedTowerId) {
          this.room?.send("toggleWallGate", { towerId: this.selectedPlacedTowerId });
        }
        break;
      case "toggleWorkerBanMode":
        this.workerBanMode = !this.workerBanMode;
        this.showNotice(this.workerBanMode ? t("scene.workerBan.on") : t("scene.workerBan.off"));
        this.emitControlState();
        break;
      case "toggleTowerStandby":
        if (this.selectedPlacedTowerId) {
          this.room?.send("setTowerMode", { towerId: this.selectedPlacedTowerId, mode: "standby" });
        }
        break;
      case "setMelisStance":
        if (detail.stance === "approval" || detail.stance === "stress") {
          this.room?.send("melis:stance", { stance: detail.stance });
        }
        break;
      case "setWorkerTier":
        this.workerHireAdvanced = detail.on === true;
        this.updateSelectionUi();
        break;
      case "hireWorker":
        this.room?.send("worker:hire", { role: isHirableWorkerRole(detail.role) ? detail.role : undefined, advanced: this.workerHireAdvanced });
        this.updateSelectionUi();
        break;
      case "selectWorker": {
        // Urun iscinin su anki isinden baslar: oyuncu cogu zaman yalnizca
        // binayi degistirmek istiyor.
        const worker = detail.workerId ? this.workerRosterSource?.drones.find((drone) => drone.id === detail.workerId) : undefined;
        if (!worker || worker.ownerId !== this.localSessionId || !getWorkerRosterRole(worker.mode)) break;
        this.workerPick = { workerId: worker.id, product: worker.assignment?.product ?? "energy" };
        this.emitControlState();
        break;
      }
      case "setWorkerProduct":
        if (this.workerPick && isTransportProduct(detail.product)) {
          this.workerPick = { ...this.workerPick, product: detail.product };
          this.emitControlState();
        }
        break;
      case "cancelWorkerAssign":
        if (this.workerPick) {
          this.workerPick = undefined;
          this.emitControlState();
        }
        break;
      case "unlockWorkerDevelopment":
        if (isHirableWorkerRole(detail.role) && detail.skillId) {
          this.feedback?.unlockAudio();
          this.room?.send("worker:development", { role: detail.role, skillId: detail.skillId });
        }
        break;
      case "setTowerPerformance":
        if (this.selectedPlacedTowerId && typeof detail.performance === "number") {
          this.room?.send("setTowerPerformance", { towerId: this.selectedPlacedTowerId, performance: detail.performance });
        }
        break;
      case "buyShopItem":
        if (detail.itemId) {
          this.feedback?.unlockAudio();
          this.room?.send("shop:buy", { itemId: detail.itemId });
        }
        break;
      case "rerollShop":
        this.room?.send("shop:reroll");
        break;
      case "closeShop":
        this.shopDismissedWave = this.latestPerfSnapshot?.team.wave ?? 0;
        this.refreshSetupForecast();
        this.emitControlState();
        break;
      case "setTargeting":
        if (this.selectedPlacedTowerId && detail.targetingMode) this.room?.send("tower:targeting", { towerId: this.selectedPlacedTowerId, mode: detail.targetingMode });
        break;
      case "toggleAbartiOrientation":
        this.hideZeynepTierChoicesIfOpen();
        this.abartiOrientation = this.abartiOrientation === "horizontal" ? "vertical" : "horizontal";
        this.updateSelectionUi();
        break;
      case "openInventory":
        this.inventoryOpen = true;
        this.pendingEquipItemId = undefined;
        this.emitControlState();
        break;
      case "closeInventory":
        this.inventoryOpen = false;
        this.emitControlState();
        break;
      case "selectInventoryItem":
        // Esya secildi; panel kapanir ve oyuncu haritadan bir kule secer.
        this.pendingEquipItemId = detail.itemId;
        this.inventoryOpen = false;
        this.emitControlState();
        break;
      case "cancelEquip":
        this.pendingEquipItemId = undefined;
        this.emitControlState();
        break;
      case "clearSelection":
        this.hideZeynepTierChoicesIfOpen();
        this.clearPlacedTowerSelection();
        break;
    }
  }

  /**
   * Envanterden bir esya secildikten sonra dokunulan kule hedef olur.
   *
   * Esyanin is gormedigi kule (`canEquipShopItem`, sunucunun kurali) burada
   * reddediliyor: onizleme acilmiyor, kisa sebep yaziliyor ve esya secili
   * kaliyor -- oyuncu baska bir kuleye dokunabilir. Sunucu yine dogruluyor.
   */
  private tryEquipPendingItem(towerId: string) {
    if (!this.pendingEquipItemId) {
      return false;
    }

    const itemId = this.pendingEquipItemId;
    const snapshot = this.latestPerfSnapshot?.towers.find((entry) => entry.id === towerId);
    const rejection = snapshot ? this.getPendingEquipRejection(itemId, snapshot) : undefined;
    if (rejection) {
      const text = getInventoryEquipRejectedCue({ itemId, reason: rejection.reason, need: rejection.need }, { creative: true })?.text;
      if (text) this.showNotice(text, 4200);
      return true;
    }
    // Takma engellenmiyor (sunucu da engellemiyor); yalnizca soyleniyor:
    // kartin ya da baska bir esyanin zaten actigi kilidi ikinci kez vermek
    // hicbir sey eklemiyor.
    if (this.isShopItemAlreadyUnlockedOnTower(itemId, towerId)) {
      this.showNotice(t("scene.equip.alreadyUnlocked", { item: getShopItem(itemId)?.name ?? t("scene.equip.thisItem") }), 4200);
    }
    this.previewTowerChange({ itemId, towerId }, () => {
      // Onizlemenin "uygula" dugmesi bir dokunus: takma sesinin baglami burada acilabilir.
      this.feedback?.unlockAudio();
      this.room?.send("equipShopItem", { itemId, towerId });
      this.pendingEquipItemId = undefined;
    });
    return true;
  }

  /**
   * Secili esya bu kuleye takilamiyorsa sebebi; takilabiliyorsa yok. Yalnizca
   * yerel oyuncunun kuleleri: baskasinin kulesini sunucu zaten reddediyor.
   * Kule haritada da soluk ciziliyor (`getTowerEquipAlpha`).
   */
  private getPendingEquipRejection(itemId: string, tower: TowerSnapshot) {
    if (tower.ownerId !== this.localSessionId) return undefined;
    const item = getShopItem(itemId);
    const definition = towerCatalog[tower.characterId]?.find((entry) => entry.id === tower.definitionId);
    if (!item || !definition) return undefined;
    const check = canEquipShopItem(item, definition, tower.equippedShopItemIds ?? []);
    return check.ok ? undefined : check;
  }

  /** Esya secilmisken takilamayacagi yerel kuleler soluk. */
  private getTowerEquipAlpha(tower: TowerSnapshot) {
    const itemId = this.pendingEquipItemId;
    if (!itemId || tower.ownerId !== this.localSessionId) return 1;
    return this.getPendingEquipRejection(itemId, tower) ? 0.35 : 1;
  }

  private previewTowerChange(change: { towerId: string; cardId?: string; itemId?: string }, apply: () => void) {
    const requestId = String(++this.previewSequence);
    const dialog = openDefenseDialog(t("scene.preview.title"), [t("scene.preview.loading")]);
    this.pendingPreview = { requestId, apply, dialog };
    this.room?.send("tower:preview", { ...change, requestId });
    this.time.delayedCall(8000, () => {
      if (this.pendingPreview?.requestId !== requestId || !dialog.isConnected) return;
      this.pendingPreview = undefined;
      openDefenseDialog(t("scene.preview.failedTitle"), [t("scene.preview.failedBody")]);
    });
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

    const previewDefinitionId = this.draggedTowerDefinition?.id ?? this.selectedTowerDefinition.id;
    if (this.isEdgePlacedDefinition(previewDefinitionId)) {
      grid.lineStyle(1, 0xe2e8f0, 0.16);
      for (let x = origin.x; x <= arenaRight + 0.01; x += cellSize) {
        grid.lineBetween(x, origin.y, x, arenaBottom);
      }
      for (let y = origin.y; y <= arenaBottom + 0.01; y += cellSize) {
        grid.lineBetween(origin.x, y, arenaRight, y);
      }

      const segments = this.getAbartiEdgeSegments(
        highlightX,
        highlightY,
        this.getPlacementOrientation(previewDefinitionId, highlightX, highlightY),
        this.getEdgeLength(previewDefinitionId)
      );
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

  private snapToTowerGrid(x: number, y: number, definitionId = this.selectedTowerDefinition.id, orientation = this.getPlacementOrientation(definitionId, x, y)) {
    const gridPoint = worldToGrid(x, y, this.selectedMapData);
    // Kenara oturan her yapi buradan gecer, yalnizca Abarti degil. Duvari bu
    // daldan gecirmemek onu kare merkezine oturtuyordu -- ve kare merkezinde
    // yatay ile dikey cizgiye uzaklik esit oldugu icin her duvar dikey cikiyordu.
    if (this.isEdgePlacedDefinition(definitionId)) {
      const gridSize = this.getMapCellSize();
      const origin = getMapOrigin(this.selectedMapData);
      const length = definitionId === WALL_TOWER_ID ? 1 : 2;
      // Sunucudaki ile ayni formul: bir eksen cizgi, digeri hucre sirasi.
      const cellStart = (fraction: number) => Math.floor(fraction - (length - 1) / 2);
      if (orientation === "vertical") {
        const lineCol = Math.max(0, Math.min(this.selectedMapData.cols, Math.round((x - origin.x) / gridSize)));
        const startRow = Math.max(0, Math.min(this.selectedMapData.rows - length, cellStart((y - origin.y) / gridSize)));
        return {
          x: origin.x + lineCol * gridSize,
          y: origin.y + (startRow + length / 2) * gridSize
        };
      }

      const startCol = Math.max(0, Math.min(this.selectedMapData.cols - length, cellStart((x - origin.x) / gridSize)));
      const lineRow = Math.max(0, Math.min(this.selectedMapData.rows, Math.round((y - origin.y) / gridSize)));
      return {
        x: origin.x + (startCol + length / 2) * gridSize,
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
    if (this.draggedTowerDefinition && this.currentTeamGold < getTowerBuildCost(this.draggedTowerDefinition.cost)) {
      return false;
    }

    const definitionId = this.draggedTowerDefinition?.id ?? this.selectedTowerDefinition.id;
    // Sinir sunucudan geliyor. Burada elle yazilan bir sayi duruyordu ve
    // sunucununkiyle ayni kalmak zorundaydi; sunucu 15'e cikinca istemci hala
    // 10'da onizlemeyi reddederdi. Sunucunun gonderdigi deger kapasite kartini
    // da iceriyor -- elle yazilan sayi icermiyordu, yani "Ek Yuva Planı" alan
    // oyuncu kazandigi yuvayi kullanamiyordu.
    const towerLimit = this.localPlayerSnapshot?.towerLimit ?? PLAYER_TOWER_LIMIT;
    // Duvar kontenjandan yer kapmadigi icin sinir dolu olsa da kurulabilir.
    const placedDefinition = towerCatalog[this.selectedCharacter.id].find((tower) => tower.id === definitionId);
    if (!ignoreTowerId && placedDefinition && occupiesTowerSlot(placedDefinition) && (this.localPlayerSnapshot?.towersBuilt ?? 0) >= towerLimit) {
      return false;
    }

    // Kurulum yasak bolge: kule karesi bolgede ya da kenar bolge karesine degiyor.
    if (this.isPreviewInBuildZone(x, y)) {
      return false;
    }

    if (this.isEdgePlacedDefinition(definitionId)) {
      return this.canPlaceEdgePreview(x, y, this.getPlacementOrientation(definitionId, x, y), ignoreTowerId, definitionId);
    }

    const footprint = this.getTowerPreviewFootprintCells(x, y);
    if (footprint.length === 0) {
      return false;
    }

    for (const cell of footprint) {
      const world = gridToWorld(cell.col, cell.row, this.selectedMapData);
      if (world.y + this.getMapCellSize() / 2 > getMapWorldBounds(this.selectedMapData).bottom) {
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
    // Kenar yapilari kare degil cizgi kaplar. Kare dondurmek duvarin oturdugu
    // cizginin yuvarlandigi komsu kareyi dolu gosteriyordu: duvarin bir yanina
    // kule kurulabiliyor, obur yanina kurulamiyordu.
    if (this.isEdgePlacedDefinition(definitionId)) {
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

  private canPlaceEdgePreview(x: number, y: number, orientation: TowerOrientation, ignoreTowerId = "", definitionId = "zeynep-8") {
    const length = this.getEdgeLength(definitionId);
    const segments = this.getAbartiEdgeSegments(x, y, orientation, length);
    if (segments.length !== length || !segments.every((segment) => this.isValidAbartiEdgeSegment(segment, definitionId))) {
      return false;
    }
    // Sunucudaki kuralla ayni: Abarti bir kulenin yanina (ya da insa alaninin
    // kenarina) dayanir, duvar serbest.
    if (definitionId !== WALL_TOWER_ID && !isAbartiEdgeAnchored(
      segments,
      { cols: this.selectedMapData.cols, rows: this.selectedMapData.rows },
      (col, row) => this.isTowerTile(col, row),
      (col, row) => this.isStandingStructureCell(col, row, ignoreTowerId)
    )) {
      return false;
    }

    for (const tower of this.towerSnapshots.values()) {
      // Kenara oturan her yapi yeri kapatir, yalnizca Abarti degil.
      if (tower.id === ignoreTowerId || !this.isEdgePlacedDefinition(tower.definitionId)) {
        continue;
      }

      const existingSegments = this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation ?? "horizontal", this.getEdgeLength(tower.definitionId));
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

  /** Yapinin kapladigi kenar cizgisi sayisi. Duvar tek, Abarti iki. */
  private getEdgeLength(definitionId: string) {
    return definitionId === WALL_TOWER_ID ? 1 : 2;
  }

  private getAbartiEdgeSegments(x: number, y: number, orientation: TowerOrientation, length = 2) {
    return getEdgeSegments({
      x,
      y,
      orientation,
      length,
      gridSize: this.getMapCellSize(),
      origin: getMapOrigin(this.selectedMapData),
      board: { cols: this.selectedMapData.cols, rows: this.selectedMapData.rows }
    });
  }


  /** Sunucudaki kuralla ayni: segment tahtanin icinde (Abarti dayanagi `isAbartiEdgeAnchored`ta). */
  private isValidAbartiEdgeSegment(segment: { orientation: TowerOrientation; col: number; row: number }, _definitionId = "zeynep-8") {
    return isEdgeSegmentInsideBoard(segment, { cols: this.selectedMapData.cols, rows: this.selectedMapData.rows });
  }

  /** Hucreyi kaplayan, ayakta bir yapi var mi (kenar yapilari kare kaplamaz). */
  private isStandingStructureCell(col: number, row: number, ignoreTowerId = "") {
    for (const tower of this.towerSnapshots.values()) {
      if (tower.id === ignoreTowerId || (tower.hp !== undefined && tower.hp <= 0)) continue;
      if (this.getTowerFootprintCells(tower.x, tower.y, tower.definitionId, tower.orientation)
        .some((cell) => cell.col === col && cell.row === row)) return true;
    }
    return false;
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

  /**
   * Secili yapinin onarim dugmesi durumu.
   *
   * Bedel sunucudaki `getStructureRepairCost` ile ayni fonksiyondan geliyor;
   * arayuzun kendi hesabini yazmasi iki tarafin kacinilmaz olarak ayrismasi
   * demek olurdu. Sunucu yine de son sozu soyluyor, burasi sadece gosterim.
   */
  /**
   * Isci alma paneli.
   *
   * Bedel ve kontenjan sunucudaki kuralin aynisindan hesaplanir; buradaki
   * yalnizca dugmenin ne yazacagini belirler, gecerlilik kararini sunucu verir.
   */
  /**
   * Siradaki evrimin bedeli.
   *
   * Oyuncunun bari surerken bilmesi gereken tek sayi bu: ne kadar stres
   * biriktirmesi gerektigi. Sahadaki en az evrimlesmis kule hedef alinir, cunku
   * bir sonraki "Olumcul Stres" onun icin kullanilir.
   */
  private getNextMelisEvolutionCost() {
    const levels = Array.from(this.towerSnapshots.values())
      .filter((tower) => tower.ownerId === this.localSessionId && tower.characterId === "archer")
      .map((tower) => tower.melisEvolutionLevel ?? 0);
    if (levels.length === 0) {
      return MELIS_EVOLUTION_STRESS_COSTS[0];
    }

    return MELIS_EVOLUTION_STRESS_COSTS[Math.min(...levels)];
  }

  /**
   * Yaratici panelin okudugu durum.
   *
   * Katalogun kendisi panelde duruyor; buradan yalnizca **hangilerinin acik**
   * oldugu gidiyor. Kart ve esya listeleri her kare yeniden cizilen bir
   * durumun icinde tasinacak kadar buyuk.
   */
  private getCreativeControlState() {
    if (!this.creativeMode) return undefined;
    const selected = this.creativeLoadout?.towers.find(({ id }) => id === this.selectedPlacedTowerId);
    return {
      wave: this.creativeLoadout?.wave ?? 1,
      cardIds: this.creativeLoadout?.cardIds ?? [],
      itemIds: this.creativeLoadout?.itemIds ?? [],
      selectedTowerId: this.selectedPlacedTowerId,
      selectedTowerLevel: selected?.level,
      selectedTowerCardIds: selected?.cardIds ?? [],
      selectedTowerItemIds: selected?.itemIds ?? []
    };
  }

  /**
   * Secili kuleye etki eden kartlar.
   *
   * Yalnizca kule sahibinin kartlari: kart sahibinin kulelerine isliyor, baska
   * oyuncunun destesi bu kuleye dokunmuyor. Sahibi odadan ayrildiysa destesi
   * de yok; kuleye bagli hedefli kartlar yine gorunuyor. Deste suzmesi kart
   * secim ekraninin "N kulene etki eder" satiri ve `card:applied` listesiyle
   * ayni fonksiyondan (`cardReachesTower`) geciyor: duvara hasar karti,
   * her kuleye altin karti yazan bir liste secim ekraniyla celisirdi.
   */
  private getTowerCardState(tower: TowerSnapshot | undefined, definition: TowerDefinition | undefined) {
    if (!tower) return undefined;
    const ownerCardIds = this.playerSnapshots.find((player) => player.id === tower.ownerId)?.ownedCardIds ?? [];
    return {
      targetedCardIds: tower.targetedCardIds ?? [],
      ownerCardIds: definition ? this.getOwnerCardsForTower(definition, ownerCardIds) : []
    };
  }

  private getOwnerCardsForTower(definition: TowerDefinition, ownerCardIds: readonly string[]) {
    const cached = this.towerCardsCache;
    if (cached && cached.definitionId === definition.id && haveSameIds(cached.source, ownerCardIds)) {
      return cached.applied;
    }
    const applied = ownerCardIds.filter((cardId) => {
      const card = getCardDefinition(cardId);
      return card ? cardReachesTower(card, definition) : false;
    });
    this.towerCardsCache = { definitionId: definition.id, source: [...ownerCardIds], applied };
    return applied;
  }

  /**
   * Ogretici adim motorunun okudugu oyun hali (tutorial.ts `TutorialFacts`):
   * hedefi zaten saglanmis adim (depo onceden kurulmus, tamirci zaten var)
   * etkin olur olmaz geciliyor. Yalnizca yerel oyuncunun ayakta duran yapilari.
   */
  private getTutorialFacts(): TutorialFacts {
    const ownTowers = [...this.towerSnapshots.values()].filter((tower) => tower.ownerId === this.localSessionId && (tower.hp === undefined || tower.hp > 0));
    const ownDrones = (this.workerRosterSource?.drones ?? []).filter((drone) => drone.ownerId === this.localSessionId);
    const nodes = listResourceNodes(this.workerRosterSource?.crystalNodes, this.workerRosterSource?.ammoNodes);
    return {
      definitionIds: ownTowers.map((tower) => tower.definitionId),
      upgraded: ownTowers.some((tower) => (tower.level ?? 1) > 1),
      hired: this.localPlayerSnapshot?.hiredWorkers?.length ?? 0,
      manualAssignments: ownDrones.filter((drone) => drone.assignment && !drone.autoAssigned).length,
      repairers: ownDrones.filter((drone) => drone.mode === "repairer").length,
      treeUnlocks: this.localPlayerSnapshot?.workerSkillIds?.length ?? 0,
      // Muhimmat zinciri adimlari: cephaneligin uretimi ve iscilerin elle isleri.
      production: ownTowers.find((tower) => tower.resourceProvider === "ammunition")?.productionAmmo ?? (ownTowers.some((tower) => tower.resourceProvider === "ammunition") ? "bullet" : undefined),
      workers: ownDrones.map((drone) => {
        const manual = Boolean(drone.assignment) && !drone.autoAssigned;
        const nodeId = drone.assignment?.nodeId;
        const sourceTowerId = drone.assignment?.sourceTowerId;
        return {
          mode: drone.mode,
          manual,
          nodeKind: nodeId ? nodes.find((node) => node.id === nodeId)?.kind : undefined,
          product: drone.assignment?.product,
          sourceDefinitionId: sourceTowerId ? this.towerSnapshots.get(sourceTowerId)?.definitionId : undefined
        };
      }),
      ammoDelivered: this.tutorialAmmoDelivered
    };
  }

  private getWorkerHireState() {
    const hired = this.localPlayerSnapshot?.hiredWorkers ?? [];
    // Indirim carpani sunucudan geliyor: onu doguran kart listesi tele
    // cikmiyor, yani istemci indirimi kendi bulamaz. Eksikse 1.
    const costMultiplier = this.localPlayerSnapshot?.workerHireCostMultiplier ?? 1;
    // Iki bedel de gonderiliyor: oyuncu kademeyi secmeden once ikisini de
    // gormeli, yoksa secim ancak deneyerek ogrenilen bir sey olur.
    const cost = getWorkerHireCostWithModifiers(hired.length, false, costMultiplier);
    const advancedCost = getWorkerHireCostWithModifiers(hired.length, true, costMultiplier);
    const gold = this.localPlayerSnapshot?.gold ?? 0;
    const advanced = this.workerHireAdvanced;
    return {
      hired: hired.length,
      cost,
      advancedCost,
      advanced,
      affordable: gold >= (advanced ? advancedCost : cost),
      generic: true,
      // Rolu secilmemis isci varken sunucu yeni alim yerine secimi yeniden acar.
      pendingSpecialization: hired.some((worker) => !worker.role),
      roles: ACTIVE_WORKER_ROLES.map((role) => ({
        id: role,
        label: WORKER_ROLE_LABELS[role],
        description: WORKER_ROLE_DESCRIPTIONS[role],
        owned: hired.filter((owned) => owned.role === role && !owned.advanced).length,
        ownedAdvanced: hired.filter((owned) => owned.role === role && owned.advanced).length
      }))
    };
  }

  /**
   * Performans kolunun cekmecedeki hali.
   *
   * Kol haritadaki kule panelinde de duruyor ama tek yeri orasi olamaz:
   * cekmece tuvalin alt yarisini kapliyor ve haritanin alt sirasindaki bir
   * kulenin paneli tam onun altina dusuyor. O kulenin performansi hic
   * ayarlanamiyordu -- satis dugmesiyle ayni hata, ayni cozum.
   *
   * Deger yuzde olarak tasiniyor: panelin yeniden kurulup kurulmayacagina
   * karar veren anahtar sayilari yuvarliyor, 0-1 arasi bir oran orada
   * 0 ya da 1'e duserdi ve kol ekranda kimildamazdi.
   *
   * Iyimser deger burada da okunuyor: iki kol ayni sayiyi gostermeli,
   * yoksa suruklerken biri digerinin gerisinde kalir.
   */
  /**
   * Bu yapi bir **kule islemine** dahil olur mu.
   *
   * Sunucudaki `acceptsTowerOperation` ile ayni cumle, ayni sebep: mühimmat
   * akisi, performans kolu, beklemeye alma, hedefleme -- hepsi yakitla
   * calisan bir yapi icin var. Duvar ve Tamir Merkezi calismaz. Olcut bir
   * donem `!resourceProvider` idi ve duvar butun bunlari miras aliyordu:
   * cekmecede bir duvarin altinda performans kolu duruyordu.
   */
  private acceptsTowerOperation(selectedTower: TowerSnapshot | undefined) {
    if (!selectedTower) return false;
    const definition = towerCatalog[selectedTower.characterId]?.find((tower) => tower.id === selectedTower.definitionId);
    return Boolean(definition) && isOperationalTower(definition!);
  }

  private getPerformanceControlState(selectedTower: TowerSnapshot | undefined) {
    if (!this.acceptsTowerOperation(selectedTower) || !selectedTower) return undefined;
    const server = Phaser.Math.Clamp(selectedTower.performance ?? 0.5, 0, 1);
    const value = this.optimisticPerformance?.towerId === selectedTower.id
      ? this.optimisticPerformance.value
      : server;
    return {
      percent: Math.round(Phaser.Math.Clamp(value, 0, 1) * 100),
      canEdit: selectedTower.ownerId === this.localSessionId
    };
  }

  private getRepairState(selectedTower: TowerSnapshot | undefined, definition: TowerDefinition | undefined) {
    if (!selectedTower || !definition || selectedTower.ownerId !== this.localSessionId) return undefined;
    const maxHp = selectedTower.maxHp ?? 0;
    const hp = selectedTower.hp ?? 0;
    if (maxHp <= 0) return undefined;
    if (hp <= 0) return { label: t("scene.repair.destroyed"), enabled: false };
    if (hp >= maxHp) return { label: t("scene.repair.intact"), enabled: false };

    // Carpan sunucudan geliyor: onu doguran kart ve esya listesi tele
    // cikmiyor, yani istemci indirimi kendi bulamaz. Eksikse 1.
    const cost = getStructureRepairCostWithModifiers(
      getTowerBuildCost(definition.cost),
      1 - hp / maxHp,
      selectedTower.repairCostMultiplier ?? 1
    );
    const affordable = (this.localPlayerSnapshot?.gold ?? 0) >= cost;
    return { label: t("scene.repair.action", { cost }), enabled: affordable && cost > 0 };
  }

  /**
   * "Tumunu Onar" dugmesi. Plan sunucunun kullandigi `planRepairAll` ile ve
   * tekli onarim dugmesinin bedel girdileriyle (tanim bedeli, sunucudan gelen
   * carpan): dugmedeki sayi dokununca odenecek olan. Sunucu yine son sozu
   * soyluyor; bedene verilmis onarimlari o ayikliyor.
   */
  private getRepairAllState() {
    const candidates: RepairAllCandidate[] = [];
    for (const tower of this.towerSnapshots.values()) {
      if (tower.ownerId !== this.localSessionId) continue;
      const definition = towerCatalog[tower.characterId]?.find((entry) => entry.id === tower.definitionId);
      if (!definition) continue;
      candidates.push({
        id: tower.id,
        hp: tower.hp ?? 0,
        maxHp: tower.maxHp ?? 0,
        buildCost: getTowerBuildCost(definition.cost),
        costMultiplier: tower.repairCostMultiplier ?? 1
      });
    }
    const button = getRepairAllButtonState(planRepairAll(candidates, this.localPlayerSnapshot?.gold ?? 0));
    return { label: t(`controls.repairAll.${button.key}`, button.params), enabled: button.enabled };
  }

  /**
   * Kenara yerlesen yapi mi (Abarti, duvar): kare degil kenar kaplayan tanimlar.
   *
   * Tanim butun kataloglarda araniyor: yalnizca kendi karakterinin
   * katalogunda arandiginda Zeynep olmayan oyuncunun ekraninda takim
   * arkadasinin Abartisi kare bir sprite olarak ciziliyordu.
   */
  private isEdgePlacedDefinition(definitionId: string) {
    return EDGE_PLACED_DEFINITION_IDS.has(definitionId);
  }

  private getPlacementOrientation(definitionId = this.selectedTowerDefinition.id, x?: number, y?: number): TowerOrientation {
    // Duvarin yonu secilmez, birakildigi kenardan gelir: dikey bir cizgiye daha
    // yakinsa dikey durur. Sunucu ayni hesabi tekrar yapar; buradaki yalnizca
    // onizleme icin.
    if (definitionId === WALL_TOWER_ID) {
      if (x === undefined || y === undefined) return "horizontal";
      const gridSize = getSharedMapGridSize(this.selectedMapData);
      const origin = getMapOrigin(this.selectedMapData);
      const toVertical = Math.abs((x - origin.x) / gridSize - Math.round((x - origin.x) / gridSize));
      const toHorizontal = Math.abs((y - origin.y) / gridSize - Math.round((y - origin.y) / gridSize));
      return toVertical <= toHorizontal ? "vertical" : "horizontal";
    }
    return definitionId === "zeynep-8" ? this.abartiOrientation : "horizontal";
  }

  /**
   * Gedik ve akis kaymasi uyarilari.
   *
   * Ikisi de sunucudan gelir; istemci akis alanini gormedigi icin bunlari
   * tahmin edemez. Amaci oyuncuyu dalga ortasinda mudahaleye zorlamak, o yuzden
   * uyari hem gorsel hem sesli: haritanin obur ucuna bakan oyuncu da fark etsin.
   */
  private showStructureBreach(message: StructureBreachMessage) {
    this.pulseAlertMarker(message.x, message.y, 0xf97316);
    this.showNotice(t("scene.alert.breach", { hp: t("format.percent", { v: Math.round(message.healthRatio * 100) }) }));
    this.playAlertSound("breach");
  }

  private showFlowShift(message: FlowShiftMessage) {
    this.pulseAlertMarker(message.x, message.y, 0x38bdf8);
    this.showNotice(t("scene.alert.flowShift"));
    this.playAlertSound("flow");
  }

  /** Uyarilan noktayi kisa sure buyuyup sonen bir halka ile isaretler. */
  /**
   * Donma ani.
   *
   * Halka **iceri** kapaniyor, disari acilmiyor. Oyundaki butun oteki
   * patlamalar disari aciliyor ve donma onlarin tersi bir sey: bir seyi
   * yaymiyor, bir seyi topluyor. Ic donen halka o ani tek basina anlatiyor.
   */
  private showFreezeBurst(x: number, y: number) {
    const ring = this.add.circle(x, y, 34, 0x67e8f9, 0)
      .setStrokeStyle(3, 0xe0f2fe, 0.95)
      .setDepth(24);
    this.tweens.add({
      targets: ring,
      radius: 9,
      alpha: 0,
      duration: 260,
      ease: "Cubic.easeIn",
      onComplete: () => ring.destroy()
    });

    // Kapanmanin bittigi yerde kisa bir parlama: buz tuttu.
    const flash = this.add.circle(x, y, 4, 0xe0f2fe, 0.9).setDepth(24.1).setScale(0.4);
    this.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      delay: 220,
      duration: 320,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });
  }

  /**
   * Kritik yavaslatma.
   *
   * Kucuk ve keskin: kritik hasarin kendi isareti var (turuncu, "!" ve pop
   * yapan sayi; bkz. `showDamageNumber`) ve bu onunla yarismamali. Uc kiymik
   * disari firliyor, yani "bir sey kirildi" diyor
   * ama sahneyi kaplamiyor -- yavaslatma her vurusta olabilen bir sey.
   */
  private showSlowCritBurst(x: number, y: number) {
    for (let i = 0; i < 3; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const shard = this.add.rectangle(x, y, 2, 9, 0xa5f3fc, 0.95)
        .setDepth(24)
        .setRotation(angle);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * 22,
        y: y + Math.sin(angle) * 22,
        alpha: 0,
        duration: 300,
        ease: "Quad.easeOut",
        onComplete: () => shard.destroy()
      });
    }
  }

  private pulseAlertMarker(x: number, y: number, color: number) {
    const marker = this.add.circle(x, y, 10, color, 0)
      .setStrokeStyle(3, color, 0.95)
      .setDepth(24);
    this.tweens.add({
      targets: marker,
      radius: 34,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => marker.destroy()
    });
  }

  /**
   * Atis ve isabet parlamalari icin halka havuzu.
   *
   * Uyari isaretcisi gibi olay basina `add.circle` + `destroy` yapilamaz: uyari
   * dalgada birkac kez cikar, bunlar ise saniyede yuzlerce kez. Mobil tarayicida
   * o kadar nesne dogurup oldurmek cop toplayiciyi tetikler ve tam kalabalik
   * anda -- yani efektin en cok gerektigi anda -- kare atlatir.
   *
   * Havuz dolduysa efekt sessizce atlanir. Zaten ekranda otuz parlama varken
   * otuz birincinin gorsel katkisi yok, ama maliyeti var.
   */
  private effectPool: Phaser.GameObjects.Arc[] = [];
  private activeEffectCount = 0;
  private static readonly MAX_CONCURRENT_EFFECTS = 28;

  private spawnFlashRing(x: number, y: number, options: {
    color: number;
    startRadius: number;
    endRadius: number;
    durationMs: number;
    thickness: number;
    depth: number;
    fill?: number;
  }) {
    if (this.activeEffectCount >= GameScene.MAX_CONCURRENT_EFFECTS) {
      return;
    }

    const ring = this.effectPool.pop() ?? this.add.circle(0, 0, 1);
    this.activeEffectCount += 1;

    ring
      .setPosition(x, y)
      .setRadius(options.startRadius)
      .setFillStyle(options.color, options.fill ?? 0)
      .setStrokeStyle(options.thickness, options.color, 0.95)
      .setDepth(options.depth)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);

    this.tweens.add({
      targets: ring,
      radius: options.endRadius,
      alpha: 0,
      duration: options.durationMs,
      ease: "Cubic.easeOut",
      onComplete: () => {
        ring.setActive(false).setVisible(false);
        this.activeEffectCount -= 1;
        // Havuzu sinirli tut: bir kalabalik ani gecici olarak cok halka
        // acabilir, hepsini sonsuza dek tutmanin anlami yok.
        if (this.effectPool.length < GameScene.MAX_CONCURRENT_EFFECTS) {
          this.effectPool.push(ring);
        } else {
          ring.destroy();
        }
      }
    });
  }

  /**
   * Gecikmeli efekt kuyrugu.
   *
   * Sunucu olaylari aninda gelir ama sahne interpolasyon gecikmesiyle cizilir.
   * Parlamayi mesaj gelir gelmez oynatmak onu merminin bir adim onune atar:
   * namlu, mermi daha ortada yokken patlar. Efekt de ayni gecikmeyi beklemeli.
   */
  private pendingEffects: Array<{ dueAt: number; play: () => void }> = [];

  private queueDelayedEffect(play: () => void, leadMs = 0) {
    // Kuyrugun kendisi de sinirli: bagalanti donarsa birikmis yuzlerce efekt
    // cozuldugu anda hep birden patlamamali. 20 kulelik dalgada saniyede ~60
    // atis + temas + hazirlik vurusu geliyor; 500 ms'lik gecikme bunu tutmali.
    if (this.pendingEffects.length >= 160) {
      return;
    }
    // `leadMs`: oynatmadan biraz once (namlunun hazirlik vurusu). Kuyruk sirali
    // kalmali, bosaltma ilk vakti gelmemis kayitta duruyor.
    const dueAt = performance.now() + this.playbackDelayMs - Math.max(0, leadMs);
    let index = this.pendingEffects.length;
    while (index > 0 && this.pendingEffects[index - 1].dueAt > dueAt) {
      index -= 1;
    }
    this.pendingEffects.splice(index, 0, { dueAt, play });
  }

  private drainPendingEffects(now: number) {
    if (this.pendingEffects.length === 0) {
      return;
    }
    let index = 0;
    while (index < this.pendingEffects.length && this.pendingEffects[index].dueAt <= now) {
      this.pendingEffects[index].play();
      index += 1;
    }
    if (index > 0) {
      this.pendingEffects.splice(0, index);
    }
  }

  /**
   * Uyari sesi.
   *
   * Bu ses bir donem `streak-granted.mp3` idi -- yani kill-streak anonsunun ta
   * kendisi. Ayni dosya iki isi goruyordu ve ikisinin birbiriyle ilgisi yoktu:
   * duvar dikmek dusman akisini kaydirdigi icin oyuncu her duvarda ortada hicbir
   * seri yokken "COMMAND GRANTED" anonsunu duyuyordu.
   *
   * Uyarinin artik kendi sesi var ve dosya gerektirmiyor: iki kisa ton. Ikisi
   * ayni da degil, cunku iki uyari ayni sey degil -- gedik alcalan bir ton
   * (kotu, hemen bak), akis kaymasi yukselen (bilgi, kurulusunu gozden gecir).
   *
   * Ses seviyesi her calista okunuyor. Eskiden yalnizca kurulusta bir kez
   * yaziliyordu, o yuzden ayarlardan kisilmasi hicbir sey degistirmiyordu.
   */
  private playAlertSound(kind: "breach" | "flow") {
    // Tonlar geri bildirim yonetmeninde sentezleniyor; efekt sesleriyle ayni
    // tek baglami kullaniyor ama seviyesi seslendirme kanalindan geliyor.
    // ATLAS-VESAYET konusmasi surerken uyari tonu yok (konusma her sesi susturuyor).
    if (this.atlas?.inDialogue) return;
    this.feedback?.playAlert(kind, this.voiceVolume);
  }

  private createKillStreakAudio() {
    // Dosyalar paylasilan tablodan (KILL_STREAK_VOICE_URLS): dokuz kademe, kademe basina bir klip.
    const sounds = {} as Record<KillStreakTier, HTMLAudioElement[]>;
    for (const tier of Object.keys(KILL_STREAK_VOICE_URLS) as KillStreakTier[]) {
      sounds[tier] = [new Audio(assetUrl(KILL_STREAK_VOICE_URLS[tier]))];
    }
    this.killStreakSounds = sounds;

    for (const audio of Object.values(this.killStreakSounds).flat()) {
      audio.preload = "auto";
      audio.volume = this.voiceVolume;
    }
  }

  private createBackgroundMusic() {
    this.backgroundMusicPath = getBackgroundMusicPath(this.selectedCharacterId);
    if (!this.backgroundMusicPath) {
      return;
    }
    this.backgroundMusic = new Audio(this.backgroundMusicPath);
    this.backgroundMusic.preload = "auto";
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = this.musicVolume;
  }

  private unlockGameAudio() {
    // Uyari ve efekt sesinin ortak baglami da burada aciliyor: iOS ses
    // baglamini yalnizca gercek bir kullanici hareketi icinde baslatiyor,
    // sonra istedigi zaman calabiliyor.
    this.feedback?.unlockAudio();
    // Kilit acilmadan gelen ATLAS karsilamasi (8 sn icindeyse) bu dokunusta.
    this.atlas?.unlocked();

    // Bir kez yeter. Eskiden `input.once` ile baglanmisti; artik her dokunustan
    // cagriliyor cunku ilk gercek kullanici hareketini yakalamanin tek guvenilir
    // yolu tuvalin kendi olayi. Nobet burada duruyor.
    if (this.gameAudioUnlocked) {
      return;
    }
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

  /** Dunya x'inin dustugu sutun; harita disi noktalar secilemez. */
  private getUltimateColumnAt(worldX: number) {
    const gridSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    const column = Math.floor((worldX - origin.x) / gridSize);
    return column >= 0 && column < this.selectedMapData.cols ? column : undefined;
  }

  private drawUltimateColumnPreview(worldX: number) {
    const column = this.getUltimateColumnAt(worldX);
    const preview = this.ultimateColumnPreview ?? this.add.graphics().setDepth(56);
    this.ultimateColumnPreview = preview;
    preview.clear();
    if (column === undefined) {
      return;
    }

    const gridSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    const bounds = getMapWorldBounds(this.selectedMapData);
    const left = origin.x + column * gridSize;
    preview.fillStyle(0xfde68a, 0.18);
    preview.fillRect(left, bounds.top, gridSize, bounds.height);
    preview.lineStyle(2, 0xfef3c7, 0.85);
    preview.strokeRect(left, bounds.top, gridSize, bounds.height);
  }

  private clearUltimateColumnPreview() {
    this.ultimateColumnPreview?.clear();
  }

  /**
   * Ulti basildigini aninda gosterir.
   *
   * Gosterilen sey **komutun gittigi**, sonucu degil: sarj sifirlaniyor, sok
   * dalgasi ve bas vurusu geliyor. Patlamanin kendisi yetkili tarafta kaliyor --
   * hasari yerelde uydurmak, sunucu reddettiginde olmamis bir olumu gostermek
   * olurdu. Kotu baglantida hissedilen fark bunun buyuk kismi zaten: oyuncu
   * bastigini bilmek istiyor.
   */
  private echoUltimateCast(cast: { column?: number; y?: number }) {
    this.ultimateEchoUntil = performance.now() + LOCAL_ECHO_TIMEOUT_MS;
    this.currentUltimateCharge = 0;
    this.emitControlState();
    this.playUltimateCastFeedback(cast);
  }

  /**
   * Dokunusun haritadaki karsiligi: karakter renginde sok dalgasi, bas vurusu
   * ve kucuk bir yerel zoom (1.03, 120 ms).
   *
   * Eskiden 220 ms'lik soluk bir ekran tonuydu. Dalga ultinin gercekten
   * vurdugu yeri gosteriyor: Zeynep'te secilen sutun, Atakan'da drone'larin
   * kalktigi kuleler, butun sahaya vuran ultilerde arenanin ortasindan her
   * yere. Yalnizca atanin ekraninda; takim arkadasi kenardan cip goruyor.
   * Zoom gercek hit-stop degil, oyun saati durmuyor. Hareket azaltmada dalga
   * yayilmadan yerinde soner, zoom hic yok.
   */
  private playUltimateCastFeedback(cast: { column?: number; y?: number }) {
    // Dokunusun icindeyiz: baglam askidaysa burada surduruluyor. Surdurme
    // hemen bitmiyor; bas vurusu yonetmende bir an tutulup baglam acilir
    // acilmaz caliyor.
    this.feedback?.unlockAudio();
    this.feedback?.playSfx("ultimate");
    const still = this.feedback?.reducedMotion ?? false;
    const now = performance.now();
    const color = getCharacterColorValue(this.selectedCharacterId);
    const cellSize = this.getMapCellSize();
    const bounds = getMapWorldBounds(this.selectedMapData);
    const wave = { color, durationMs: ULTIMATE_SHOCKWAVE_MS, still, bornAt: now };

    if (cast.column !== undefined) {
      const span = getUltimateColumnSpan(getMapOrigin(this.selectedMapData).x, cellSize, cast.column);
      this.combatVfx?.emitCastWave({
        ...wave, shape: "column", x: (span.left + span.right) / 2,
        y: Phaser.Math.Clamp(cast.y ?? bounds.top + bounds.height / 2, bounds.top, bounds.bottom),
        width: cellSize, top: bounds.top, bottom: bounds.bottom, radius: 0
      });
    } else {
      const launchers = getUltimateResultKind(this.selectedCharacterId) === "drones"
        ? [...this.towerSnapshots.values()].filter((tower) => tower.ownerId === this.localSessionId && tower.characterId === "warrior")
        : [];
      if (launchers.length > 0) {
        for (const tower of launchers.slice(0, CAST_WAVE_TOWER_LIMIT)) {
          this.combatVfx?.emitCastWave({ ...wave, shape: "ring", x: tower.x, y: tower.y, radius: cellSize * 1.6 });
        }
      } else {
        this.combatVfx?.emitCastWave({
          ...wave, shape: "ring", x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2,
          radius: Math.hypot(bounds.width, bounds.height) / 2
        });
      }
    }

    if (!still) {
      this.startUltimateZoomPunch(now);
    }
  }

  /**
   * Atisin yerel zoomu: 120 ms'de 1.03'e ve geri.
   *
   * Kameranin kendi yakinlastirmasi (arena sigdirma, kalabalik haritada cift
   * dokunus) baska yerde kuruluyor; burasi onu yalnizca carpanla oynatip tam
   * haline geri koyuyor. Arada kamera yeniden kurulursa (ekran dondu, arena
   * yakinlasti) zoom birakiliyor: yeni kurulum kazanir.
   */
  private startUltimateZoomPunch(now: number) {
    const camera = this.cameras.main;
    const base = this.ultimateZoomPunch?.base ?? camera.zoom;
    this.ultimateZoomPunch = { startedAt: now, base, last: camera.zoom };
  }

  private updateUltimateZoomPunch(now: number) {
    const punch = this.ultimateZoomPunch;
    if (!punch) {
      return;
    }
    const camera = this.cameras.main;
    if (Math.abs(camera.zoom - punch.last) > 1e-6) {
      this.ultimateZoomPunch = undefined;
      return;
    }
    const elapsed = now - punch.startedAt;
    const done = elapsed >= ULTIMATE_CAST_ZOOM_MS;
    camera.setZoom(done ? punch.base : punch.base * getUltimateCastZoom(elapsed));
    punch.last = camera.zoom;
    if (done) {
      this.ultimateZoomPunch = undefined;
    }
  }

  /**
   * Ulti hazir: dugme (ve kapaliysa Beceriler cekmecesinin dugmesi) bir kez
   * atiyor, kisa bir "hazir" sesi caliyor. Atimin baslangici panelde
   * tutuluyor; panel saniyede birkac kez yeniden kurulsa da atim kaldigi
   * yerden suruyor.
   */
  private signalUltimateReady() {
    this.ultimateReadyPulseAt = performance.now();
    this.feedback?.playSfx("ultimateReady");
    this.emitControlState();
  }

  /**
   * Kendi ultinin karnesi.
   *
   * Sunucu sonucu sahnedeki patlamadan once yolluyor (istemci 500 ms geriden
   * oynatiyor); karne patlama gorunduktan kisa sure sonra iniyor. Yonetmenin
   * P0 etiket butcesine giriyor ama sessiz: bas vurusu atista caldi. Kart
   * perdesi ya da sonuc ekrani acildiysa karne yok -- HUD perdenin ustunde
   * kalirdi.
   */
  private receiveUltimateResult(message: UltimateResultMessage) {
    if (!message || typeof message.kind !== "string") {
      return;
    }
    // Raporun "en iyi an"i icin kendi ultilerinin en iyisi tutuluyor; mesaj
    // basina bir karsilastirma, sicak yolda degil.
    this.bestOwnUltimate = pickBetterUltimate(this.bestOwnUltimate, message);
    // Nisan olgusu yalnizca not ediliyor; yazim ve bildirim dalga sonunda.
    this.badgeWatch.noteUltimate(message);
    // Dalga karnesinin one cikan satiri: bu dalganin karnesi gelince ona
    // yaziliyor. Suresi dalga bitince dolan ulti (Kabus, Sempati, drone)
    // kurulumda raporlaniyor; o zaman az once biten dalganin karnesine gidiyor
    // ve o dalganin perdesi aciksa serit tazeleniyor.
    if (this.waveReports.noteUltimate(message)) this.refreshWaveReportCard();
    if (this.matchResultShown) {
      return;
    }
    const stamp: UltimateStampEvent = { ...getUltimateStampText(message), color: getCharacterColorCss(this.selectedCharacterId) };
    this.time.delayedCall(this.playbackDelayMs + ULTIMATE_STAMP_LAG_MS, () => {
      if (this.matchResultShown || this.cardChoiceRoot || !this.feedback) {
        return;
      }
      this.feedback.emit("ultimate", { own: true, silent: true, weight: 0, lifetimeMs: ULTIMATE_STAMP_MS });
      this.game.events.emit("game:hud-ultimate", stamp);
    });
  }

  /**
   * Takim arkadasinin ultisi: kenarda, onun renginde tek satirlik cip
   * ("Zeynep ULTİ · 4 öldü"). Senin kamerana, sesine ve karnene dokunmuyor.
   */
  private receiveTeamUltimate(message: UltimateCastMessage) {
    if (!message || message.ownerId === this.localSessionId || this.matchResultShown) {
      return;
    }
    const owner = this.playerSnapshots.find((player) => player.id === message.ownerId);
    const character = owner ? characters.find((candidate) => candidate.id === owner.characterId) : undefined;
    const chip: TeamUltimateChip = {
      text: getUltimateTeamChipText(character?.displayName ?? t("scene.teammate"), message),
      color: getCharacterColorCss(owner?.characterId)
    };
    this.time.delayedCall(this.playbackDelayMs + ULTIMATE_STAMP_LAG_MS, () => {
      if (this.matchResultShown || this.cardChoiceRoot) {
        return;
      }
      this.game.events.emit("game:hud-team-ultimate", chip);
    });
  }

  /** Oyuncunun karakter adi ve rengi; bildirimler ulti cipiyle ayni dili konussun. */
  private describePlayer(playerId: string) {
    const owner = this.playerSnapshots.find((player) => player.id === playerId);
    const character = owner ? characters.find((candidate) => candidate.id === owner.characterId) : undefined;
    return { name: character?.displayName, color: getCharacterColorCss(owner?.characterId) };
  }

  /**
   * Execute infaz edildi (`skill:execute`, herkese).
   *
   * Gorsel ve ses dunyayla ayni anda: istemci sunucunun yarim saniye
   * gerisinden oynuyor, dusman ekranda o kadar sonra oluyor. Konum sunucunun
   * infaz anindaki konumu; gecikmeden sonra ekrandaki dusman tam orada.
   * Atanin ekraninda tam guc (ses, hafif sarsinti), takim arkadasinda soluk
   * ve sessiz: sahada ne oldugunu gorsun, ses butcesini yemesin.
   */
  private receiveSkillExecute(message: SkillExecuteMessage) {
    if (!message || typeof message.casterId !== "string" || !Number.isFinite(message.x) || !Number.isFinite(message.y) || this.matchResultShown) {
      return;
    }
    const own = message.casterId === this.localSessionId;
    this.time.delayedCall(this.playbackDelayMs, () => {
      if (this.matchResultShown || !this.feedback) {
        return;
      }
      const decision = this.feedback.emit("execute", { own, x: message.x, y: message.y });
      if (!decision.show) {
        return;
      }
      this.playExecuteMark(message.x, message.y, own, decision.reducedMotion ?? this.feedback.reducedMotion);
    });
  }

  /**
   * Execute reddedildi (`skill:rejected`, yalnizca atana): sunucu bekleme
   * suresini geri aldi. Dugmenin "gitti, bekleniyor" yankisi da kalkiyor.
   */
  private receiveSkillRejected(message: SkillRejectedMessage) {
    if (!message || !Number.isFinite(message.slot)) {
      return;
    }
    const slot = Math.floor(message.slot);
    if (slot >= 0 && slot < this.skillEchoUntil.length) {
      this.skillEchoUntil[slot] = 0;
    }
    if (this.selectedCharacterId === "warrior" && slot === ATAKAN_EXECUTE_SLOT) {
      this.showNotice(getExecuteRejectText(message.reason === "immune" ? "immune" : "invalid"));
    }
    if (this.selectedCharacterId === "warrior" && slot === ATAKAN_SHIELD_SLOT) {
      // Kalkan cekilmedi: soluk yanki kalksin, gerekce yazilsin.
      this.shieldEcho = undefined;
      this.drawShieldPreview();
      this.showNotice(getMetalShieldRejectText(message.reason === "short" || message.reason === "bounds" ? message.reason : "invalid"));
    }
    this.emitControlState();
  }

  /**
   * Infazin dunyadaki isareti: nisangah koseleri hedefin uzerine disaridan
   * kilitleniyor (~90 ms), kilitlendigi an ince bir arti ve sert beyaz bir
   * flas; toplam ~320 ms. Parilti, kivilcim, renk gecisi yok -- tek renk,
   * keskin cizgi. Hareket azaltmada koseler yerinde cikiyor, flas buyumuyor.
   */
  private playExecuteMark(x: number, y: number, own: boolean, still: boolean) {
    const cell = this.getMapCellSize();
    const radius = Math.max(9, cell * 0.42);
    const alpha = own ? 1 : 0.5;
    const lineWidth = Math.max(1.5, cell * 0.06);
    const graphics = this.add.graphics().setDepth(EXECUTE_MARK_DEPTH);
    const state = { t: 0 };
    const draw = () => {
      graphics.clear();
      const t = state.t;
      const lock = Math.min(1, t / EXECUTE_MARK_LOCK_FRACTION);
      const eased = 1 - (1 - lock) ** 3;
      const r = still ? radius : radius * (2.1 - 1.1 * eased);
      const fade = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
      const arm = r * 0.45;
      graphics.lineStyle(lineWidth, EXECUTE_MARK_COLOR, alpha * fade);
      for (const [sx, sy] of EXECUTE_MARK_CORNERS) {
        const cx = x + sx * r;
        const cy = y + sy * r;
        graphics.lineBetween(cx, cy, cx - sx * arm, cy);
        graphics.lineBetween(cx, cy, cx, cy - sy * arm);
      }
      if (lock < 1) {
        return;
      }
      const flashT = (t - EXECUTE_MARK_LOCK_FRACTION) / (1 - EXECUTE_MARK_LOCK_FRACTION);
      const flashAlpha = alpha * Math.max(0, 1 - flashT * 1.6);
      if (flashAlpha > 0) {
        graphics.fillStyle(0xffffff, flashAlpha * 0.95).fillCircle(x, y, radius * (still ? 0.6 : 0.55 + 0.35 * flashT));
      }
      graphics.lineStyle(Math.max(1, lineWidth * 0.7), 0xffffff, alpha * fade);
      graphics.lineBetween(x - r * 1.25, y, x + r * 1.25, y);
      graphics.lineBetween(x, y - r * 1.25, x, y + r * 1.25);
    };
    draw();
    this.tweens.add({
      targets: state,
      t: 1,
      duration: EXECUTE_MARK_MS,
      ease: "Linear",
      onUpdate: draw,
      onComplete: () => graphics.destroy()
    });
  }

  /**
   * Execute hedeflemesinde dokunulan dusman: ekranda cizilen konuma gore
   * (sunucunun degil), dokunusa en yakin olan; govdenin biraz disi da sayiliyor,
   * parmak kucuk dusmani tam tutturamiyor. Takimin tarafindaki (hukmedilmis,
   * olumsuz, cevrilmis) dusmanlar atlaniyor: asil hedefle temas halinde
   * duruyor ve dokunusu yutuyorlardi. Bos zeminde undefined.
   */
  private findEnemyAt(x: number, y: number) {
    const candidates: ExecuteTapCandidate[] = [];
    for (const [id, mover] of this.enemies) {
      // Yer altindaki (gizli) ve fazdaki dusman hedeflenemiyor: sunucu reddederdi.
      if (!mover.sprite.active || !mover.sprite.visible || mover.raceUntargetable) continue;
      candidates.push({
        id,
        x: mover.sprite.x,
        y: mover.sprite.y,
        size: mover.displaySize ?? 0,
        type: mover.type,
        champion: Boolean(mover.crown),
        teamSide: Boolean(mover.teamSide),
        special: mover.specialKind
      });
    }
    return pickExecuteTapTarget(candidates, x, y, this.getMapCellSize() * 0.55);
  }

  /**
   * Bag anlarini oynatir; kart perdesi acikken perde kapanana kadar bekletir:
   * o an oynasa perdenin altinda kaybolurdu.
   */
  private queueLinkMoment(play: () => void) {
    this.time.delayedCall(this.playbackDelayMs, () => {
      if (this.matchResultShown) {
        return;
      }
      if (this.cardChoiceRoot) {
        this.pendingLinkMoments.push(play);
        if (this.pendingLinkMoments.length > PENDING_LINK_MOMENT_LIMIT) {
          this.pendingLinkMoments.shift();
        }
        return;
      }
      play();
    });
  }

  private flushLinkMoments() {
    if (this.pendingLinkMoments.length === 0) {
      return;
    }
    const moments = this.pendingLinkMoments;
    this.pendingLinkMoments = [];
    this.time.delayedCall(LINK_MOMENT_AFTER_CURTAIN_MS, () => {
      if (this.matchResultShown || this.cardChoiceRoot) {
        return;
      }
      for (const play of moments) {
        play();
      }
    });
  }

  /**
   * Takim arkadasinin Sunucusu senin kulene baglandi: adini veren tek satir
   * ve kulende turkuaz bir nabiz. Sunucu bu mesaji yalnizca kulenin sahibine
   * yolluyor; yani hep "senin" anin.
   */
  /**
   * Takim arkadasi Riskli Yatirim aldi: nexus bu dalga 10 can kaybetti ve
   * esya bu dalga takimda bir daha alinamaz. Alan kendi alimini zaten goruyor.
   */
  private receiveRiskyInvestment(message: RiskyInvestmentMessage) {
    if (!message || typeof message.buyerId !== "string" || this.matchResultShown) return;
    if (message.buyerId === this.localSessionId) return;
    const buyer = this.describePlayer(message.buyerId);
    const toast: TeamNoticeToast = { ...getRiskyInvestmentNoticeText(buyer.name, message.nexusCost, message.gold), color: buyer.color };
    this.game.events.emit("game:hud-team-notice", toast);
  }

  private receiveServerLinkJoined(message: ServerLinkJoinedMessage) {
    if (!message || typeof message.targetTowerId !== "string" || this.matchResultShown) {
      return;
    }
    this.queueLinkMoment(() => {
      const tower = this.towerSnapshots.get(message.targetTowerId);
      if (!tower) {
        return;
      }
      const decision = this.feedback?.emit("linkJoined", { own: true, x: tower.x, y: tower.y });
      if (decision && !decision.show) {
        return;
      }
      const owner = this.describePlayer(message.serverOwnerId);
      const toast: TeamNoticeToast = { ...getServerLinkJoinedText(owner.name), color: owner.color };
      this.game.events.emit("game:hud-team-notice", toast);
      this.playTowerPulse(tower, getTowerBodySize(tower.definitionId, this.getMapCellSize() * getTowerGridSpan(tower.definitionId)), SERVER_LINK_JOIN_COLOR, false);
    });
  }

  /**
   * Kombo damgasi: "İŞARET → OVERDRIVE", "Tarama: 3 öldü", "ŞANS PENCERESİ
   * 10 sn". Kulenin ustunde, oynatma gecikmesi kadar sonra (supurme ekrana o
   * zaman geliyor).
   *
   * Kapi (`ComboStampGate`) tur + sahip basina 4 sn'de bir ve ekranda en
   * fazla iki damga birakiyor; etiket butcesini yonetmen tutuyor. Kendi
   * kulenin damgasi parlak, takim arkadasininki kucuk ve soluk; sans penceresi
   * yalnizca senin. Damga alt cubugun altina dusmuyor. Kart perdesi aciksa ya
   * da rapor ekrandaysa an gecmis sayiliyor: bekletilmiyor.
   */
  private receiveComboStamp(raw: ComboStampMessage) {
    const message = sanitizeComboStampMessage(raw);
    if (!message || this.matchResultShown) {
      return;
    }
    const own = message.ownerId === this.localSessionId;
    if (message.kind === "luckyWindow" && !own) {
      return;
    }
    this.time.delayedCall(this.playbackDelayMs, () => {
      if (this.matchResultShown || this.cardChoiceRoot) {
        return;
      }
      this.showComboStamp(message, own);
    });
  }

  private showComboStamp(message: ComboStampMessage, own: boolean) {
    const labels = this.levelLabels;
    const text = getComboStampText(message);
    if (!labels || !text) {
      return;
    }
    const now = performance.now();
    if (!this.comboStamps.admit(message.kind, message.ownerId, now)) {
      return;
    }
    const tower = this.towerSnapshots.get(message.towerId);
    const x = tower?.x ?? message.x;
    const discSize = getTowerBodySize(tower?.definitionId ?? "", this.getMapCellSize() * getTowerGridSpan(tower?.definitionId ?? ""));
    const y = (tower?.y ?? message.y) - discSize / 2 - COMBO_LABEL_LIFT_PX;
    const lifetimeMs = FEEDBACK_KIND_RULES.combo.visualMs;
    const decision = this.feedback?.emit("combo", { own, x, y, lifetimeMs });
    const lucky = message.kind === "luckyWindow";
    const fill = lucky ? COMBO_LUCKY_FILL : COMBO_OVERDRIVE_FILL;
    const stroke = lucky ? JACKPOT_LABEL_STROKE : COMBO_OVERDRIVE_STROKE;
    const key = `combo:${message.kind}:${message.towerId}`;
    if (decision?.merge) {
      labels.merge(key, text, fill, stroke);
      return;
    }
    if (decision && !decision.show) {
      return;
    }
    this.comboStamps.commit(now, lifetimeMs);
    labels.spawn({
      key,
      text,
      x,
      y,
      fill,
      stroke,
      fontPx: own ? LEVEL_LABEL_FONT_PX : TEAMMATE_LEVEL_LABEL_FONT_PX,
      alpha: own ? 1 : TEAMMATE_LEVEL_LABEL_ALPHA,
      pop: false,
      lifetimeMs,
      still: decision?.reducedMotion ?? this.feedback?.reducedMotion ?? false,
      bounds: this.getWorldLabelBoundsAboveBottomBar()
    }, now, decision?.recycle ?? false);
  }

  /**
   * Sampiyon dogdu: govdenin ustunde kisa bir "SAMPIYON". Oynatma aninda
   * cagriliyor (dusman ekrana o an geliyor), dusman basina bir kez; etiket
   * butcesi ve hiz siniri yonetmende. Kart perdesi ya da rapor ekrandaysa
   * an gecmis sayiliyor.
   */
  private announceChampion(enemy: EnemySnapshot, displayedSize: number) {
    const labels = this.levelLabels;
    if (!labels || this.matchResultShown || this.cardChoiceRoot) return;
    const x = enemy.x;
    const y = enemy.y - displayedSize / 2 - CHAMPION_LABEL_LIFT_PX;
    const lifetimeMs = FEEDBACK_KIND_RULES.champion.visualMs;
    const decision = this.feedback?.emit("champion", { own: true, x, y, lifetimeMs });
    if (decision && !decision.show) return;
    const reducedMotion = decision?.reducedMotion ?? this.feedback?.reducedMotion ?? false;
    labels.spawn({
      key: `champion:${enemy.id}`,
      // Paylasilan sabit Turkce; katalog katmani sabiti cevirmiyor, Ingilizcesi burada.
      text: getLocale() === "en" ? enChampionLabel : CHAMPION_LABEL,
      x,
      y,
      fill: CHAMPION_FILL,
      stroke: CHAMPION_STROKE,
      fontPx: LEVEL_LABEL_FONT_PX,
      alpha: 1,
      pop: !reducedMotion,
      lifetimeMs,
      still: reducedMotion,
      bounds: this.getWorldLabelBoundsAboveBottomBar()
    }, performance.now(), decision?.recycle ?? false);
  }

  /**
   * Ozel dusmanin isareti (govde normal irk cizimi) ve enerji yiyicinin emme
   * hatti; yuzey dusmanla birlikte kuruluyor ve yikiliyor. Tur macta ilk kez
   * goruldugunde HUD bildirimi ve konumunda kisa bir uyari halkasi.
   */
  // --- Irk mekanikleri (races/race-mechanics) -------------------------------------------

  /**
   * Dusmanin irk mekanigi: Taslasma levhalari, yer alti (govde gizli, yer
   * izi ve cikis catlaklari), ruh cekici halkasi ve yigin kertikleri, faz
   * hayaleti ve katlanma uyarisi. Yuzey ilk gereken karede aciliyor; irk
   * alani kalkinca bir kez temizleniyor.
   */
  private renderEnemyRaceTrait(mover: RenderMover, enemy: EnemySnapshot, view: RaceTraitView | undefined, size: number, now: number) {
    const reducedMotion = this.feedback?.reducedMotion ?? false;
    const cellSize = this.getMapCellSize();
    const burrowed = Boolean(view?.burrow);
    const phased = Boolean(view?.phased);
    // Yer altina giris ve cikis: gorulen gecisten (toz halkasi, cikis patlamasi).
    if (burrowed !== Boolean(mover.raceBurrowed)) {
      this.raceTransients.add(burrowed ? RACE_TRANSIENT.dig : RACE_TRANSIENT.emerge, enemy.x, enemy.y, now);
    }
    mover.raceBurrowed = burrowed;
    mover.raceUntargetable = burrowed || phased;
    if (mover.sprite.visible === burrowed) mover.sprite.setVisible(!burrowed);
    if (burrowed) {
      mover.healthBar?.clear();
      mover.shieldHalo?.setVisible(false);
      mover.bleedEffect?.setVisible(false);
      mover.frostEffect?.setVisible(false);
    } else if (phased) {
      mover.sprite.setAlpha(0.32);
    }

    // Katlanma: uyari kalkti ve dusman hedefte -> iki uca kirisik (iptalde yok).
    const fold = view?.fold;
    if (!fold && mover.raceFoldX !== undefined && mover.raceFoldY !== undefined) {
      if (Math.hypot(enemy.x - mover.raceFoldX, enemy.y - mover.raceFoldY) <= cellSize * 0.6) {
        const fromX = mover.raceFoldFromX ?? enemy.x;
        const fromY = mover.raceFoldFromY ?? enemy.y;
        this.raceTransients.add(RACE_TRANSIENT.fold, fromX, fromY, now, enemy.x - fromX, enemy.y - fromY);
        this.raceTransients.add(RACE_TRANSIENT.fold, enemy.x, enemy.y, now, enemy.x - fromX, enemy.y - fromY);
      }
      mover.raceFoldX = undefined;
      mover.raceFoldY = undefined;
    }
    if (fold) {
      mover.raceFoldX = fold.x;
      mover.raceFoldY = fold.y;
      mover.raceFoldFromX = enemy.x;
      mover.raceFoldFromY = enemy.y;
      this.raceGroundMarks.push({ kind: 1, x: fold.x, y: fold.y, progress: getFoldWarningProgress(fold.at, this.racePlaybackServerTime), seed: 0 });
    }

    const seed = raceSeed(enemy.id);
    if (view?.burrow) {
      const progress = getBurrowTelegraphProgress(view.burrow.emergeAt, this.racePlaybackServerTime);
      if (progress !== undefined) {
        const cell = gridToWorld(view.burrow.col, view.burrow.row, this.selectedMapData);
        this.raceGroundMarks.push({ kind: 0, x: cell.x, y: cell.y, progress, seed });
      }
    }

    const mechanic = view ? getVisibleRaceMechanic(view) : undefined;
    if (mechanic) this.noteRaceMechanic(mechanic);

    const needsSurface = Boolean(view && (view.petrify > 0 || view.trait === "drawer" || phased || (burrowed && this.vfxLod.decals)));
    if (!needsSurface) {
      if (mover.raceEffect?.visible) mover.raceEffect.clear().setVisible(false);
      return;
    }
    if (!mover.raceEffect) mover.raceEffect = this.add.graphics();
    const graphics = mover.raceEffect;
    setDepthIfChanged(graphics, enemy.movementKind === "air" ? 9.12 : 8.12);
    graphics.clear().setVisible(true);
    const options = { now, reducedMotion };
    if (burrowed) {
      drawBurrowFurrow(graphics, enemy.x, enemy.y, size, seed, options);
      return;
    }
    if (view!.petrify > 0) drawPetrifyPlating(graphics, enemy.x, enemy.y, size, view!.petrify, seed);
    if (view!.trait === "drawer") drawSoulDrawerMark(graphics, enemy.x, enemy.y, size, view!.drawer);
    if (phased) drawPhaseGhost(graphics, enemy.x, enemy.y, size, seed, options);
  }

  /** Mekanigin ilk gorulme bildirimi (macta bir kez; sonuc ekraninda yok). */
  private noteRaceMechanic(mechanic: RaceMechanicId) {
    if (this.matchResultShown || !this.raceNotices.note(mechanic)) return;
    this.showNotice(t(RACE_MECHANIC_NOTICE_KEYS[mechanic] as Parameters<typeof t>[0]), 4200);
  }

  /**
   * Sahne yuzeyi: meka kalkanlari (ucus yerel saatte akiyor), durdurulan
   * atislarin parlamalari, cikis catlaklari, katlanma uyarilari ve gecici
   * efektler. Hicbiri yokken yuzey bir kez temizlenip birakiliyor.
   */
  private renderRaceScene(rawShields: unknown, now: number) {
    const graphics = this.raceGraphics;
    if (!graphics) return;
    const shields = readMekaShields(rawShields, this.mekaShieldScratch);
    const transients = this.raceTransients.active(now);
    const impacts = this.mekaImpacts.active(now);
    if (shields.length === 0 && this.raceGroundMarks.length === 0 && !transients && !impacts) {
      if (this.raceGraphicsDrawn) {
        graphics.clear();
        this.raceGraphicsDrawn = false;
      }
      if (this.mekaShieldsById.size > 0) this.mekaShieldsById.clear();
      if (this.mekaShieldFlights.size > 0) this.mekaShieldFlights.clear();
      return;
    }
    graphics.clear();
    this.raceGraphicsDrawn = true;
    const cellSize = this.getMapCellSize();
    const reducedMotion = this.feedback?.reducedMotion ?? false;
    for (const mark of this.raceGroundMarks) {
      if (mark.kind === 0) drawBurrowCracks(graphics, mark.x, mark.y, cellSize, mark.progress, mark.seed);
      else drawFoldWarning(graphics, mark.x, mark.y, cellSize, mark.progress);
    }
    this.raceGroundMarks.length = 0;
    // Kimligi artik telde olmayan kalkanin ucus kaydi siliniyor.
    if (this.mekaShieldsById.size > shields.length) this.mekaShieldsById.clear();
    for (const shield of shields) {
      if (!this.mekaShieldsById.has(shield.id)) this.noteRaceMechanic("thrower");
      this.mekaShieldsById.set(shield.id, shield);
      let flight: number | undefined;
      if (typeof shield.f === "number" && shield.f > 0) {
        let record = this.mekaShieldFlights.get(shield.id);
        if (!record) {
          record = { seenAt: now, remaining: shield.f };
          this.mekaShieldFlights.set(shield.id, record);
        }
        flight = getMekaShieldFlightProgress(record.remaining - (now - record.seenAt));
      } else if (this.mekaShieldFlights.has(shield.id)) {
        this.mekaShieldFlights.delete(shield.id);
      }
      drawMekaShield(graphics, shield, flight, cellSize, { now, reducedMotion });
    }
    if (impacts) this.mekaImpacts.draw(graphics, cellSize, now, reducedMotion);
    if (transients) {
      this.raceTransients.draw(graphics, cellSize, now, {
        reducedMotion,
        resolve: (id) => {
          const mover = this.enemies.get(id);
          return mover ? { x: mover.sprite.x, y: mover.sprite.y } : undefined;
        }
      });
    }
  }

  /** `race:block`: meka kalkaninin durdurdugu atislar (siperin isaretiyle ayni dil). */
  private receiveMekaShieldBlock(raw: unknown) {
    const message = sanitizeMekaBlockMessage(raw);
    if (!message || this.matchResultShown) return;
    this.time.delayedCall(this.playbackDelayMs, () => {
      if (this.matchResultShown) return;
      const shield = this.mekaShieldsById.get(message.id);
      if (!shield) return;
      const now = performance.now();
      for (const along of message.a) this.mekaImpacts.add(shield, along, now);
      if (now - this.aegisBlockSoundAt >= 320) {
        this.aegisBlockSoundAt = now;
        this.feedback?.playSampleCue(AEGIS_BLOCK_SOUND_CUE.family, AEGIS_BLOCK_SOUND_CUE.rate, AEGIS_BLOCK_SOUND_CUE.gain, `mblock:${message.id}`);
      }
    });
  }

  /** `race:soul`: olen dusmustan ruh cekiciye ince soluk iz (cekici yururken onu izliyor). */
  private receiveSoulDraw(raw: unknown) {
    const message = sanitizeSoulDrawMessage(raw);
    if (!message || this.matchResultShown) return;
    this.time.delayedCall(this.playbackDelayMs, () => {
      if (this.matchResultShown) return;
      const mover = this.enemies.get(message.to);
      this.raceTransients.add(RACE_TRANSIENT.wisp, message.x, message.y, performance.now(), mover?.sprite.x ?? message.x, mover?.sprite.y ?? message.y, message.to);
    });
  }

  private renderSpecialEnemy(mover: RenderMover, enemy: EnemySnapshot, kind: SpecialEnemyKind, displayedSize: number, now: number) {
    if (!isSpecialEnemyKind(kind)) return;
    mover.specialKind = kind;
    const air = enemy.movementKind === "air";
    if (!mover.specialEffect) mover.specialEffect = this.add.graphics();
    const graphics = mover.specialEffect;
    // Emme hatti ve isi halkasi govdenin altinda kalmasin diye govdenin hemen ustunde.
    setDepthIfChanged(graphics, air ? 9.15 : 8.15);
    graphics.clear();
    const options = this.specialDrawOptions;
    options.now = now;
    options.reducedMotion = this.feedback?.reducedMotion ?? false;
    const cellSize = this.getMapCellSize();
    drawSpecialEnemyMarker(graphics, kind, enemy.x, enemy.y, displayedSize, getHeaterRadius(cellSize), options);
    if (kind === "harvester") {
      const width = displayedSize * 0.7;
      graphics.fillStyle(0x111827, 0.9).fillRect(enemy.x - width / 2, enemy.y + displayedSize * 0.6, width, 3);
      graphics.fillStyle(enemy.escaping ? 0xff725e : 0xe0ad52, 1).fillRect(enemy.x - width / 2, enemy.y + displayedSize * 0.6, width * Math.min(1, (enemy.cargo ?? 0) / HARVESTER_QUOTA), 3);
    }
    if (kind === "eater" && typeof enemy.drain === "string") {
      const target = this.towerSnapshots.get(enemy.drain);
      if (target) {
        drawEaterDrain(graphics, enemy.x, enemy.y, target.x, target.y, getTowerBodySize(target.definitionId, cellSize * getTowerGridSpan(target.definitionId)), options);
      }
    }
    if (this.specialNotices.noteKind(kind)) {
      this.showNotice(t(SPECIAL_NOTICE_KEYS[kind]), 4200);
      this.pulseAlertMarker(enemy.x, enemy.y, SPECIAL_MARK_COLORS[kind]);
    }
  }

  private readonly specialDrawOptions = { now: 0, reducedMotion: false };

  private readonly surgeDrawOptions = { now: 0, reducedMotion: false, lod: 0 };

  /**
   * Karsi atak seritleri (en fazla iki), her karede oynatma saatinde: her
   * cesit kendi yonunde, renginde ve silueti ile (\`vfx/counter-surge.ts\`).
   * Seritler snapshot'tan dustugunde yuzeyler bir kez temizleniyor. Serit ilk
   * goruldugunde (kimlik basina bir kez) cesidin bildirimi, giris kenarinda
   * isaret, uyari tonu ve cesidin kayitli ornegi.
   */
  private renderCounterSurge(surges: readonly CounterSurgeSnapshot[] | undefined, now: number) {
    const fill = this.surgeFillGraphics;
    const edge = this.surgeEdgeGraphics;
    if (!fill || !edge) return;
    const entries = readCounterSurges(surges, this.surgeEntries);
    if (entries.length === 0) {
      if (this.surgeDrawn) {
        fill.clear();
        edge.clear();
        this.surgeDrawn = false;
      }
      return;
    }
    fill.clear();
    edge.clear();
    this.surgeDrawn = true;
    const cellSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    const options = this.surgeDrawOptions;
    options.now = now;
    options.reducedMotion = this.feedback?.reducedMotion ?? false;
    options.lod = this.vfxLod.level;
    for (let index = 0; index < entries.length; index += 1) {
      const surge = entries[index];
      const band = getCounterSurgeBand(surge, origin, cellSize, this.selectedMapData.cols, this.selectedMapData.rows, this.surgeBands[index]);
      drawCounterSurge(fill, edge, band, cellSize, options);
      if (band.kind === "aegis") this.aegisImpacts.draw(edge, band, cellSize, now, options.reducedMotion);
      if (this.specialNotices.noteSurge(surge.id) && !this.matchResultShown) {
        this.showNotice(t(COUNTER_SURGE_NOTICE_KEYS[band.kind]), 4200);
        const point = getCounterSurgeAlertPoint(band, cellSize);
        this.pulseAlertMarker(point.x, point.y, COUNTER_SURGE_STYLES[band.kind].rim);
        this.playAlertSound("breach");
        const cue = COUNTER_SURGE_SOUND_CUES[band.kind];
        this.feedback?.playSampleCue(cue.family, cue.rate, cue.gain, `surge:${surge.id}`);
      }
    }
  }

  /**
   * Siper atislari durdurdu (seyrek mesaj): on cizgide carpma isaretleri,
   * oynatma gecikmesi kadar sonra (mermi o an siperde kayboluyor). Ses en
   * fazla ~3 kez/sn.
   */
  private receiveSurgeBlock(raw: unknown) {
    const message = sanitizeSurgeBlockMessage(raw);
    if (!message || this.matchResultShown) return;
    this.time.delayedCall(this.playbackDelayMs, () => {
      if (this.matchResultShown) return;
      const now = performance.now();
      for (const across of message.a) this.aegisImpacts.add(message.id, across, now);
      if (now - this.aegisBlockSoundAt >= 320) {
        this.aegisBlockSoundAt = now;
        this.feedback?.playSampleCue(AEGIS_BLOCK_SOUND_CUE.family, AEGIS_BLOCK_SOUND_CUE.rate, AEGIS_BLOCK_SOUND_CUE.gain, `block:${message.id}`);
      }
    });
  }

  // --- Metal Kalkan (AttackLord, yuva 1) -------------------------------------------

  /**
   * Sahadaki Metal Kalkanlar, her karede oynatma saatinde (dusmanlarla ayni
   * an: kalkan onlari durdurdugu karede beliriyor). Herkes goruyor. Kalkan
   * snapshot'tan dustugunde yuzey bir kez temizleniyor. Kimlik ilk
   * goruldugunde yere oturus sesi; atanin yankisi da o an kalkiyor.
   */
  private renderMetalShields(shields: readonly MetalShieldSnapshot[] | undefined, now: number) {
    const graphics = this.shieldGraphics;
    if (!graphics) return;
    this.tickShieldGesture();
    this.tickMapSkillGesture();
    if (!Array.isArray(shields) || shields.length === 0) {
      if (this.shieldDrawn) {
        graphics.clear();
        this.shieldDrawn = false;
      }
      if (this.shieldSeenIds.size > 0) this.shieldSeenIds.clear();
      return;
    }
    graphics.clear();
    this.shieldDrawn = true;
    const cellSize = this.getMapCellSize();
    const total = getMetalShieldWallDurationMs();
    const options = this.specialDrawOptions;
    options.now = now;
    options.reducedMotion = this.feedback?.reducedMotion ?? false;
    for (const shield of shields) {
      if (!isMetalShieldSnapshot(shield)) continue;
      if (!this.shieldSeenIds.has(shield.id)) {
        this.shieldSeenIds.add(shield.id);
        this.announceShieldDeploy(shield);
      }
      drawMetalShield(graphics, shield, cellSize, getMetalShieldExtent(shield.ms, total), options);
    }
  }

  /**
   * Kalkan sahada ilk kez goruldu: yere oturus sesi (kayitli celik levha
   * darbesi). Atanin ekraninda tam, takim arkadasinda kisik. Bekleyen yanki
   * bu kalkaninsa kalkiyor: gercegi geldi.
   */
  private announceShieldDeploy(shield: MetalShieldSnapshot) {
    const echo = this.shieldEcho;
    const reach = this.getMapCellSize() * 0.5;
    const own = Boolean(echo) && Math.hypot(echo!.segment.x1 - shield.x1, echo!.segment.y1 - shield.y1) <= reach;
    if (own) {
      this.shieldEcho = undefined;
      this.drawShieldPreview();
    }
    if (this.matchResultShown) return;
    this.feedback?.emit("metalShield", { own, x: (shield.x1 + shield.x2) / 2, y: (shield.y1 + shield.y2) / 2 });
  }

  /**
   * Metal Kalkan jestinin o anki kosullari: paylasilan durum makinesinin
   * (`metal-shield.ts`) girdisi. `pressBusy`: bu basis surukleme ya da dokunma
   * anlami olan bir seyin ustunde basladi.
   */
  private getShieldGestureContext(pointer: Phaser.Input.Pointer, pressBusy = false): MetalShieldGestureContext {
    const rect = this.lastUsableCanvasRect;
    const canvasPerCssPx = rect && rect.width > 0 ? this.game.canvas.width / rect.width : 1;
    const cooldowns = this.resolveSkillEcho(this.localPlayerSnapshot?.skillCooldowns ?? [0, 0, 0]);
    return {
      available: Boolean(this.room) && !this.matchResultShown
        && (this.localPlayerSnapshot?.characterId ?? this.selectedCharacterId) === "warrior",
      busy: pressBusy || this.isShieldGestureBlocked(),
      cooldownSeconds: cooldowns[ATAKAN_SHIELD_SLOT] ?? 0,
      inside: this.isBattlePointer(pointer),
      gridSize: this.getMapCellSize(),
      worldPerScreenPx: canvasPerCssPx / Math.max(0.0001, this.cameras.main.zoom)
    };
  }

  /**
   * Haritada baska bir eylem bekliyor ya da suruyor mu. Bunlarin her birinin
   * harita dokunusunda kendi anlami var ve hepsi kalkan jestinden once gelir:
   * cekmeceden kule surukleme, Yonlendirme / Execute hedeflemesi, isci hedefi,
   * ulti sutunu, esya yerlestirme, isci yasagi, performans kolu, kart perdesi.
   */
  private isShieldGestureBlocked() {
    return Boolean(
      this.pendingAction || this.isGuidanceDragging || this.draggedTowerDefinition || this.workerPick
      || this.pendingUltimateColumn || this.pendingShopPlacement || this.workerBanMode
      || this.performanceSliderDragging || this.cardChoiceRoot || this.cardTargetPick
    ) || performance.now() < this.ignoreMapPointerUntil;
  }

  /**
   * Basis, sahnenin tuvale cizdigi bir kontrolun ustunde mi: secili kulenin
   * sat dugmesi, performans kolu, bilgi dugmesi, ses paneli. Onlarin basma ve
   * surukleme anlami kalkan jestinden once gelir.
   */
  private isShieldPressOnControl(pointer: Phaser.Input.Pointer) {
    if (this.hitSellButton(pointer)) return true;
    try {
      return this.input.hitTestPointer(pointer).length > 0;
    } catch {
      return false;
    }
  }

  private toShieldPointer(pointer: Phaser.Input.Pointer) {
    const event = (pointer as unknown as { domEvent?: PointerEvent }).domEvent;
    return { pointerId: pointer.id, pointerType: event?.pointerType, button: event?.button, x: pointer.worldX, y: pointer.worldY };
  }

  /**
   * Haritaya basildi: kalkan jesti yalnizca izlenmeye baslar. Esik asilana
   * kadar hicbir sey gorunmez ve hicbir sey gitmez; duz dokunus eskisi gibi
   * isler. Izlenen bir jest varken gelen ikinci parmak jesti oldurur.
   */
  private beginShieldGesture(pointer: Phaser.Input.Pointer, pressBusy: boolean) {
    const context = this.getShieldGestureContext(pointer, pressBusy);
    if (!this.shieldGesture && context.available && !context.busy && context.inside && this.isShieldPressOnControl(pointer)) {
      context.busy = true;
    }
    this.shieldGesture = beginMetalShieldGesture(this.shieldGesture, this.toShieldPointer(pointer), context);
    this.drawShieldPreview();
  }

  private moveShieldGesture(pointer: Phaser.Input.Pointer) {
    if (!this.shieldGesture) return;
    const moved = moveMetalShieldGesture(this.shieldGesture, this.toShieldPointer(pointer), this.getShieldGestureContext(pointer));
    this.shieldGesture = moved.gesture;
    if (moved.cooldownNotice !== undefined) this.showShieldCooldownNotice(moved.cooldownNotice);
    this.drawShieldPreview();
  }

  /**
   * Birakis. Onizleme gorunuyorsa kalkan istegi gider (baslangic = basis
   * noktasi, uc = birakis noktasi; sunucu yeniden dogruluyor). `true`:
   * birakis bir kalkan suruklemesiydi, siradan harita dokunusu olarak
   * islenmemeli.
   */
  private finishShieldGesture(pointer: Phaser.Input.Pointer) {
    if (!this.shieldGesture) return false;
    const ended = endMetalShieldGesture(this.shieldGesture, this.toShieldPointer(pointer), this.getShieldGestureContext(pointer));
    this.shieldGesture = ended.gesture;
    if (ended.cooldownNotice !== undefined) this.showShieldCooldownNotice(ended.cooldownNotice);
    const cast = ended.cast;
    if (cast && this.room) {
      this.room.send("useSkill", { slot: ATAKAN_SHIELD_SLOT, x: cast.x1, y: cast.y1, x2: cast.x2, y2: cast.y2 });
      this.echoSkillUse(ATAKAN_SHIELD_SLOT);
      // Istek yolda: sunucunun kalkani kareye girene kadar yerinde soluk bir iz.
      this.shieldEcho = { segment: cast, until: performance.now() + METAL_SHIELD_ECHO_MS };
    }
    this.drawShieldPreview();
    return ended.consumed;
  }

  /** Jesti sessizce kapatir: pointercancel, yakalama kaybi, baska bir surukleme basladi. */
  private cancelShieldGesture() {
    if (!this.shieldGesture) return;
    this.shieldGesture = undefined;
    this.drawShieldPreview();
  }

  /**
   * Kare basina: suren yankinin suresi doldu mu, onizleme gorunurken araya
   * baska bir eylem girdi mi (parmak kimildamadan da onizleme kalksin).
   */
  private tickShieldGesture() {
    if (this.shieldEcho && performance.now() >= this.shieldEcho.until) {
      this.shieldEcho = undefined;
      this.drawShieldPreview();
    }
    const gesture = this.shieldGesture;
    if (gesture?.preview && (this.isShieldGestureBlocked() || this.matchResultShown)) {
      this.shieldGesture = { ...gesture, preview: undefined, dead: true };
      this.drawShieldPreview();
    }
  }

  /** Surukleme onizlemesi; jest yokken birakilan kalkanin soluk yankisi. */
  private drawShieldPreview() {
    const graphics = this.shieldPreviewGraphics;
    if (!graphics) return;
    graphics.clear();
    const cellSize = this.getMapCellSize();
    const preview = this.shieldGesture?.preview;
    if (preview) {
      const maxed = Math.hypot(preview.x2 - preview.x1, preview.y2 - preview.y1) >= getMetalShieldMaxLength(cellSize) - 0.01;
      drawMetalShieldPreview(graphics, preview, cellSize, { maxed });
      return;
    }
    if (this.shieldEcho) drawMetalShieldPreview(graphics, this.shieldEcho.segment, cellSize, { alpha: 0.45 });
  }

  /** "N sn sonra hazir": beklemedeki surukleme icin, seyrek (bildirim yagmasin). */
  private showShieldCooldownNotice(seconds: number) {
    const now = performance.now();
    if (now - this.shieldCooldownNoticeAt < METAL_SHIELD_NOTICE_GAP_MS) return;
    this.shieldCooldownNoticeAt = now;
    this.showNotice(t("scene.skill.shieldCooldown", { seconds }), 1800);
  }

  // --- Harita jestiyle beceri (yuva sirasina sabit) ---------------------------------

  /**
   * Jestin o anki kosullari: paylasilan durum makinesinin girdisi. Yuvalarin
   * jest hedefi operatorden (`getSkillGestureTargets`); Metal Kalkan yuvasi
   * "external": onu kendi makinesi yurutuyor. `pointer` yoksa (kare basina)
   * nokta harita icinde sayiliyor.
   */
  private getSkillGestureContext(pointer: Phaser.Input.Pointer | undefined, pressBusy = false): SkillGestureContext {
    const rect = this.lastUsableCanvasRect;
    const canvasPerCssPx = rect && rect.width > 0 ? this.game.canvas.width / rect.width : 1;
    const cooldowns = this.resolveSkillEcho(this.localPlayerSnapshot?.skillCooldowns ?? [0, 0, 0]);
    const targets = getSkillGestureTargets(this.getSkillGestureCharacterId());
    return {
      busy: pressBusy || !this.room || this.matchResultShown || this.isShieldGestureBlocked(),
      inside: pointer ? this.isBattlePointer(pointer) : true,
      gridSize: this.getMapCellSize(),
      worldPerScreenPx: canvasPerCssPx / Math.max(0.0001, this.cameras.main.zoom),
      slots: targets.map((target, slot) => ({ enabled: target !== "none", cooldownSeconds: cooldowns[slot] ?? 0, external: target === "shield" }))
    };
  }

  /** Yuvanin harita jesti, tek satir (farede 3. beceri sag tusla da suruklenebiliyor). */
  private getSkillMapHint(slot: number) {
    if (slot === SKILL_GESTURE_SLOT.hold) return t("scene.skill.mapHintHold");
    if (slot === SKILL_GESTURE_SLOT.drag) return t("scene.skill.mapHintDrag");
    return t("scene.skill.mapHintDown");
  }

  private getSkillGestureCharacterId() {
    return this.localPlayerSnapshot?.characterId ?? this.selectedCharacterId;
  }

  /**
   * Haritaya basildi: jest izlenmeye baslar, hicbir sey gitmez. Ikinci parmak
   * suren jesti oldurur, hicbir beceri atmaz.
   */
  private beginMapSkillGesture(pointer: Phaser.Input.Pointer, pressBusy: boolean) {
    const context = this.getSkillGestureContext(pointer, pressBusy);
    if (!this.skillGesture && !context.busy && context.inside && this.isShieldPressOnControl(pointer)) {
      context.busy = true;
    }
    this.skillGesture = beginSkillGesture(this.skillGesture, this.toShieldPointer(pointer), performance.now(), context);
    this.drawMapSkillGesture();
  }

  private moveMapSkillGesture(pointer: Phaser.Input.Pointer) {
    if (!this.skillGesture) return;
    this.skillGesture = moveSkillGesture(this.skillGesture, this.toShieldPointer(pointer), performance.now(), this.getSkillGestureContext(pointer));
    this.claimHoldFromShield();
    this.drawMapSkillGesture();
  }

  /** Kare basina: halka parmak kimildamasa da dolsun; araya giren eylem jesti oldursun. */
  private tickMapSkillGesture() {
    if (!this.skillGesture) return;
    this.skillGesture = tickSkillGesture(this.skillGesture, performance.now(), this.getSkillGestureContext(undefined));
    this.claimHoldFromShield();
    this.drawMapSkillGesture();
  }

  /** Halka doldu: bu bir tutma jesti (1. ya da 3. beceri), Metal Kalkan'in suruklemesi degil. */
  private claimHoldFromShield() {
    const phase = this.skillGesture?.phase;
    if ((phase === "held" || phase === "hold" || phase === "down") && this.shieldGesture) this.cancelShieldGesture();
  }

  /**
   * Birakis. Esigi gecmis jest beceriyi atar (sekmedeki dugmeyle ayni
   * `useSkill`); beklemedeyse bugunku bekleme bildirimi. `true`: birakis
   * siradan bir harita dokunusu degil.
   */
  private finishMapSkillGesture(pointer: Phaser.Input.Pointer) {
    if (!this.skillGesture) return false;
    const ended = endSkillGesture(this.skillGesture, this.toShieldPointer(pointer), performance.now(), this.getSkillGestureContext(pointer));
    this.skillGesture = ended.gesture;
    if (ended.cooldownSlot !== undefined) this.showSkillGestureCooldownNotice(ended.cooldownSlot, ended.cooldownSeconds ?? 1);
    if (ended.cast) this.castMapSkillGesture(ended.cast);
    this.drawMapSkillGesture();
    return ended.consumed;
  }

  /** Parmak birakilmadan dustu: jest atmadan kapanir. */
  private dropMapSkillGesturePointer(pointerId: number) {
    if (!this.skillGesture) return;
    this.skillGesture = dropSkillGesturePointer(this.skillGesture, pointerId);
    this.drawMapSkillGesture();
  }

  /**
   * Jestin atisi: yuvanin hedefine gore sekmedeki yolun mesaji.
   *   - "area": birakis noktasina alan (Yonlendirme / Zorba).
   *   - "enemy": birakis noktasindaki dusman; yoksa ya da bagisiksa istek gitmez.
   *   - "tier": kademe cekilen boydan; itibar yetmiyorsa istek gitmez.
   *   - "cast": hedefsiz.
   */
  private castMapSkillGesture(cast: SkillGestureCast) {
    if (!this.room) return;
    const target = getSkillGestureTargets(this.getSkillGestureCharacterId())[cast.slot];
    if (target === "area") {
      const point = this.getClampedGuidancePoint({ worldX: cast.x, worldY: cast.y } as Phaser.Input.Pointer);
      this.room.send("useSkill", { slot: cast.slot, x: point.x, y: point.y });
      this.echoSkillUse(cast.slot);
      this.clearPlacedTowerSelection();
      if (this.getSkillGestureCharacterId() === "warrior") this.showNotice(t("scene.skill.redirectSent"));
      return;
    }
    if (target === "enemy") {
      const enemy = this.findEnemyAt(cast.x, cast.y);
      if (!enemy) {
        this.showNotice(t("scene.skill.gestureNoEnemy"));
        return;
      }
      if (enemy.champion || (enemy.type && isExecuteImmune({ type: enemy.type, special: enemy.special }))) {
        this.showNotice(getExecuteRejectText("immune"));
        return;
      }
      this.room.send("useSkill", { slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy.id });
      this.echoSkillUse(ATAKAN_EXECUTE_SLOT);
      return;
    }
    if (target === "tier") {
      const context = this.getSkillGestureContext(undefined);
      const tier = getSkillGestureTier(cast.length, getSkillGestureThresholds(context.gridSize, context.worldPerScreenPx));
      if (!tier) return;
      const cost = ZEYNEP_COMMAND_TIER_COST[tier];
      if ((this.localPlayerSnapshot?.reputation ?? 0) < cost) {
        this.showNotice(t("scene.skill.gestureNoReputation", { cost }));
        return;
      }
      this.room.send("useSkill", { slot: cast.slot, commandTier: tier });
      this.echoSkillUse(cast.slot);
      this.hideZeynepTierChoicesIfOpen();
      this.clearPlacedTowerSelection();
      return;
    }
    if (target === "cast") {
      this.room.send("useSkill", { slot: cast.slot });
      this.echoSkillUse(cast.slot);
      this.clearPlacedTowerSelection();
    }
  }

  /** "Beceri N sn sonra hazir": seyrek, bildirim yagmasin. */
  private showSkillGestureCooldownNotice(slot: number, seconds: number) {
    const now = performance.now();
    if (now - this.skillGestureNoticeAt < METAL_SHIELD_NOTICE_GAP_MS) return;
    this.skillGestureNoticeAt = now;
    const name = this.selectedCharacter.skills[slot]?.name ?? "";
    this.showNotice(t("scene.skill.gestureCooldownNotice", { name, seconds }), 1800);
  }

  /**
   * Jestin onizlemesi. Tutma halkasi (gecikmeli, her dokunusta yanip
   * sonmesin); 1./3. becerinin izi ve hedefi (Yonlendirme alani, Execute
   * nisangahi); ZentaX'ta kademe cubugu, kademe adi ve itibar bedeli.
   * Beklemede gri, yetmeyen bedelde carpi.
   */
  private drawMapSkillGesture() {
    const view = this.skillGestureView;
    if (!view) return;
    view.clear();
    let guidance: { x: number; y: number } | undefined;
    const gesture = this.skillGesture;
    if (gesture && gesture.phase !== "dead") {
      guidance = this.drawMapSkillGestureInto(view, gesture);
    }
    if (guidance) {
      this.drawGuidancePreview(guidance.x, guidance.y);
      this.skillGestureGuidanceShown = true;
    } else if (this.skillGestureGuidanceShown) {
      this.skillGestureGuidanceShown = false;
      if (!this.isGuidanceDragging) this.clearGuidancePreview();
    }
  }

  private drawMapSkillGestureInto(view: SkillGestureView, gesture: SkillGesture) {
    const context = this.getSkillGestureContext(undefined);
    const cell = this.getMapCellSize();
    if (gesture.phase === "pending" || gesture.phase === "held") {
      const hold = context.slots[SKILL_GESTURE_SLOT.hold];
      const down = context.slots[SKILL_GESTURE_SLOT.down];
      const progress = getSkillGestureHoldProgress(gesture, performance.now());
      if (progress === undefined || !(hold?.enabled || down?.enabled)) return undefined;
      const radius = cell * 0.75;
      const ringReady = Boolean((hold?.enabled && hold.cooldownSeconds <= 0) || (down?.enabled && down.cooldownSeconds <= 0));
      view.drawHoldRing(gesture.originX, gesture.originY, progress, radius, ringReady);
      // Halka doldu, yon secilmedi: alttaki soluk ok "asagi = 3. beceri" diyor.
      if (gesture.phase === "held" && down?.enabled) {
        view.drawDownHint(gesture.originX, gesture.originY + radius * 1.45, radius * 0.4, down.cooldownSeconds <= 0);
        view.setLabel(`↓ ${this.selectedCharacter.skills[SKILL_GESTURE_SLOT.down]?.name ?? ""}`, gesture.originX, gesture.originY - radius * 1.25);
      }
      return undefined;
    }
    if (gesture.phase === "dead") return undefined;
    const slot = SKILL_GESTURE_SLOT[gesture.phase];
    const state = context.slots[slot];
    if (!state?.enabled || state.external) return undefined;
    const target = getSkillGestureTargets(this.getSkillGestureCharacterId())[slot];
    const ready = state.cooldownSeconds <= 0;
    // Etiket parmagin ustunde; asagi cekilen cizgide ustu cubuk oldugu icin
    // yana (haritanin ortasina dogru) kayiyor.
    const downward = gesture.endY - gesture.startY > Math.abs(gesture.endX - gesture.startX);
    const toCenter = gesture.endX > this.cameras.main.worldView.centerX ? -1 : 1;
    const labelX = downward ? gesture.endX + toCenter * cell * 2.4 : gesture.endX;
    const labelY = downward ? gesture.endY - cell * 0.3 : gesture.endY - cell * 1.1;
    const name = this.selectedCharacter.skills[slot]?.name ?? "";
    const cooldownText = `${name} · ${t("scene.skill.gestureCooldown", { seconds: Math.max(1, Math.ceil(state.cooldownSeconds)) })}`;
    if (target === "tier") {
      const thresholds = getSkillGestureThresholds(context.gridSize, context.worldPerScreenPx);
      const tier = gesture.active ? getSkillGestureTier(gesture.length, thresholds) : undefined;
      const cost = tier ? ZEYNEP_COMMAND_TIER_COST[tier] : 0;
      const affordable = (this.localPlayerSnapshot?.reputation ?? 0) >= cost;
      view.drawTierBar({ startX: gesture.startX, startY: gesture.startY, endX: gesture.endX, endY: gesture.endY, thresholds, tier, affordable, ready }, cell);
      if (!ready) {
        view.setLabel(cooldownText, labelX, labelY, { warn: true });
      } else if (!tier) {
        view.setLabel(`${name} · ${t("scene.skill.gestureCancelHint")}`, labelX, labelY);
      } else {
        // Ad basta: 1. ve 3. komut ayni cubugu ciziyor, hangisinin secildigi buradan okunuyor.
        const text = `${name} · ${t("scene.skill.gestureTierCost", { tier: getSkillGestureTierLabel(tier), cost })}`;
        view.setLabel(affordable ? text : `${text} · ${t("scene.skill.gestureNotEnough")}`, labelX, labelY, affordable ? { tier } : { warn: true });
      }
      return undefined;
    }
    view.drawTrace(gesture.startX, gesture.startY, gesture.endX, gesture.endY, gesture.active, ready, cell);
    if (!ready) {
      if (gesture.active) view.setLabel(cooldownText, labelX, labelY, { warn: true });
      return undefined;
    }
    if (!gesture.active) {
      view.setLabel(`${name} · ${t("scene.skill.gestureCancelHint")}`, labelX, labelY);
      return undefined;
    }
    if (target === "area") {
      view.setLabel(name, labelX, labelY);
      return this.getClampedGuidancePoint({ worldX: gesture.endX, worldY: gesture.endY } as Phaser.Input.Pointer);
    }
    if (target === "enemy") {
      const enemy = this.findEnemyAt(gesture.endX, gesture.endY);
      if (!enemy) {
        view.setLabel(`${name} · ${t("scene.skill.gestureNoEnemy")}`, labelX, labelY);
        return undefined;
      }
      const immune = Boolean(enemy.champion || (enemy.type && isExecuteImmune({ type: enemy.type, special: enemy.special })));
      view.drawEnemyReticle(enemy.x, enemy.y, enemy.size || cell, immune, ready);
      view.setLabel(immune ? getExecuteRejectText("immune") : name, labelX, labelY, immune ? { warn: true } : {});
      return undefined;
    }
    view.setLabel(name, labelX, labelY);
    return undefined;
  }

  /**
   * Karsi atak yapilari vurdu: sunucu mesaji oynatmadan once yolluyor, cizim
   * oynatma gecikmesi kadar sonra (on kenar o an yapinin ustunde). Her yapida
   * sert kenarli kare flas, kisa nabiz ve eksi isaretli hasar sayisi.
   */
  private receiveSurgeHit(raw: unknown) {
    const message = sanitizeSurgeHitMessage(raw);
    if (!message || this.matchResultShown) return;
    this.time.delayedCall(this.playbackDelayMs, () => {
      if (this.matchResultShown) return;
      const now = performance.now();
      const cellSize = this.getMapCellSize();
      const reducedMotion = this.feedback?.reducedMotion ?? false;
      const style = COUNTER_SURGE_STYLES[this.getSurgeKindById(message.id)];
      for (const hit of message.hits) {
        const tower = this.towerSnapshots.get(hit.towerId);
        if (!tower) continue;
        const size = getTowerBodySize(tower.definitionId, cellSize * getTowerGridSpan(tower.definitionId));
        this.flashStructureHit(tower.x, tower.y, size, reducedMotion, style.body, style.edge);
        if (!reducedMotion) this.punchTower(tower.id, true);
        this.showStructureDamage(hit.towerId, tower.x, tower.y - size * 0.3, hit.amount, now);
      }
    });
  }

  /** Vuran seridin cesidi: son karede cizilen seritlerden; bulunamazsa bugunku serit. */
  private getSurgeKindById(id: number) {
    for (let index = 0; index < this.surgeEntries.length; index += 1) {
      if (this.surgeEntries[index].id === id) return this.surgeBands[index].kind;
    }
    return "band" as const;
  }

  /** Yapi vurusu: cesidin renginde sert kenarli kare flas. */
  private flashStructureHit(x: number, y: number, size: number, reducedMotion: boolean, color = COUNTER_SURGE_STYLES.band.body, edgeColor = COUNTER_SURGE_STYLES.band.edge) {
    const square = this.add.rectangle(x, y, size, size, color, 0.24)
      .setStrokeStyle(2, edgeColor, 0.95)
      .setDepth(24);
    this.tweens.add({
      targets: square,
      alpha: 0,
      scale: reducedMotion ? 1 : 1.12,
      duration: 420,
      ease: "Quad.easeOut",
      onComplete: () => square.destroy()
    });
  }

  /** Yapinin aldigi hasar: hasar sayisi havuzundan, kendi rengiyle ("-35"). */
  private showStructureDamage(towerId: string, x: number, y: number, amount: number, now: number) {
    const pool = this.damageNumbers;
    if (!pool) return;
    // Takimin ortak derdi: herkes icin "kendi" olay; son vurus gibi P1, sessiz.
    const lifetimeMs = FEEDBACK_KIND_RULES.lastHit.visualMs;
    const decision = this.feedback?.emit("lastHit", { own: true, x, y, lifetimeMs });
    if (decision && !decision.show && !decision.merge) return;
    pool.spawn({
      key: `surge:${towerId}`,
      x,
      y,
      amount,
      own: true,
      crit: false,
      killingBlow: false,
      bucket: 2,
      lifetimeMs,
      still: decision?.reducedMotion ?? false,
      structure: true
    }, now, decision?.recycle ?? false);
  }

  /**
   * Sampiyon devrildi: "SAMPIYON DEVRILDI - 10,6 sn (onceki 12,1)". Sunucu
   * bir kez yolluyor; oldurme olayi kadar gecikmeyle (oynatma gecikmesi)
   * dusmanin son yerinde. Oldurme kredisi ve asist zaten oldurme olayinda.
   */
  private receiveChampionDown(raw: ChampionDownMessage) {
    const message = sanitizeChampionDownMessage(raw);
    if (!message || this.matchResultShown) return;
    this.badgeWatch.noteChampionDown(message);
    this.time.delayedCall(this.playbackDelayMs, () => {
      // ATLAS ovgusu: sampiyon devrildi (60 sn'de en fazla bir ovgu).
      if (!this.matchResultShown) this.atlas?.praise();
      const labels = this.levelLabels;
      if (!labels || this.matchResultShown || this.cardChoiceRoot) return;
      const y = message.y - CHAMPION_LABEL_LIFT_PX;
      const lifetimeMs = FEEDBACK_KIND_RULES.championDown.visualMs;
      const decision = this.feedback?.emit("championDown", { own: true, x: message.x, y, lifetimeMs });
      if (decision && !decision.show) return;
      const reducedMotion = decision?.reducedMotion ?? this.feedback?.reducedMotion ?? false;
      labels.spawn({
        key: `champion:${message.enemyId}`,
        text: getChampionDownText(message),
        x: message.x,
        y,
        fill: CHAMPION_FILL,
        stroke: CHAMPION_STROKE,
        fontPx: LEVEL_LABEL_FONT_PX,
        alpha: 1,
        pop: !reducedMotion,
        lifetimeMs,
        still: reducedMotion,
        bounds: this.getWorldLabelBoundsAboveBottomBar()
      }, performance.now(), decision?.recycle ?? false);
    });
  }

  /**
   * Dunya etiketinin siniri: arena, ama alt cubugun ustu. Alt cubuk (HTML)
   * tuvalin altini ortuyor; kamera haritayi iki serit arasina sigdirsa da
   * haritanin alt sirasindaki bir kulenin damgasi cubugun arkasina dusebilir.
   */
  private getWorldLabelBoundsAboveBottomBar() {
    const bounds = getMapWorldBounds(this.selectedMapData);
    const view = getArenaCameraView(this.selectedMapData, this.arenaChrome, this.getWorldSize());
    const bandBottom = view.top + view.height * (1 - this.arenaChrome.bottomRatio);
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: Math.min(bounds.bottom, bandBottom) };
  }

  /**
   * Sunucunun sarji yetisti mi.
   *
   * Sarj dustuyse komut islenmis demektir, yanki birakilir. Sure dolduysa
   * komut ya kayboldu ya reddedildi; yankiyi birakmak dugmeyi geri veriyor.
   */
  private resolveUltimateEcho(serverCharge: number) {
    if (this.ultimateEchoUntil === 0) {
      return serverCharge;
    }
    if (serverCharge < 100 || performance.now() >= this.ultimateEchoUntil) {
      this.ultimateEchoUntil = 0;
      return serverCharge;
    }
    return 0;
  }

  private handleUltimateButton() {
    if (!this.room) {
      return;
    }

    this.cancelExecuteTargeting();
    this.clearPlacedTowerSelection();

    if (this.currentUltimateCharge < 100) {
      this.hideUltimateChoices();
      this.showNotice(t("scene.ultimate.notReady"));
      return;
    }

    // Zeynep ultisi hedefli: once sutun secilir, sonra patlar.
    if (this.selectedCharacterId === "zeynep") {
      this.pendingUltimateColumn = !this.pendingUltimateColumn;
      this.clearUltimateColumnPreview();
      this.showNotice(this.pendingUltimateColumn ? t("scene.ultimate.pickColumn") : t("scene.ultimate.cancelled"));
      this.emitControlState();
      return;
    }

    if (this.selectedCharacterId !== "warrior") {
      this.room.send("useUltimate", {});
      this.echoUltimateCast({});
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
    // Ikinci temas: suren tutamac surukleme geri alinir, temas yutulur.
    if (this.wallHandleDrag) {
      this.cancelWallHandleDrag();
      return;
    }
    // Uzatma tutamacina basis: kalkan jesti ve kule secimi baslamaz.
    if (this.tryBeginWallHandleDrag(pointer)) {
      return;
    }
    // Acik kalmis bir kule suruklemesini kapatan basis kalkan jesti baslatmaz.
    const strandedDrag = Boolean(this.draggedTowerDefinition);
    this.releaseStrandedTowerDrag();
    // Metal Kalkan: jest burada yalnizca izlenmeye baslar (bkz. `beginShieldGesture`).
    this.beginShieldGesture(pointer, strandedDrag);
    // Harita jestiyle beceri: o da yalnizca izlenmeye baslar (bkz. `beginMapSkillGesture`).
    this.beginMapSkillGesture(pointer, strandedDrag);
    // Ilk temas: olay Phaser'a hic ulasmiyorsa kayit bos kalir, ulasiyor ama
    // yanlis yere dusuyorsa koordinatlar bunu gosterir.
    if (this.pendingAction?.type !== "guidance" || !this.isBattlePointer(pointer)) {
      return;
    }

    this.isGuidanceDragging = true;
    this.hideUltimateChoices();
    this.drawGuidancePreview(pointer.worldX, pointer.worldY);
    this.showNotice(t("scene.skill.redirectDragging"));
  }

  /**
   * Dokunusun hangi kapida durduruldugu.
   *
   * `handleMapPointer` icindeki dallarin aynisini okur ama hicbirini
   * uygulamaz. Ayni kosullari iki yerde tutmanin bedeli var; karsiligi, "hicbir
   * sey olmadi" sikayetinin sebebini cihazda tek satirda gormek.
   */
  private describeTapOutcome(pointer: Phaser.Input.Pointer) {
    if (this.workerPick && this.isBattlePointer(pointer)) return "isci atama";
    if (this.hitSellButton(pointer)) return "sat dugmesi";
    if (this.draggedTowerDefinition) return "YARIM SURUKLEME";
    if (performance.now() < this.ignoreMapPointerUntil) return "beklemede";
    if (this.pendingUltimateColumn) return this.isBattlePointer(pointer) ? "ulti sutunu" : "ULTI: ARENA DISI";
    if (this.pendingShopPlacement) return this.isBattlePointer(pointer) ? "esya yerlestirme" : "ESYA: ARENA DISI";
    if (this.workerBanMode) return this.isBattlePointer(pointer) ? "isci yasagi" : "YASAK: ARENA DISI";
    if (this.isGuidanceDragging) return "yonlendirme";
    if (!this.isBattlePointer(pointer)) return "ARENA DISI";
    if (this.findTowerAt(pointer.worldX, pointer.worldY)) return "kule secimi";
    return "bos kare";
  }

  private handleMapPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.moveWallHandleDrag(pointer)) {
      return;
    }
    this.moveShieldGesture(pointer);
    this.moveMapSkillGesture(pointer);
    if (this.pendingUltimateColumn) {
      this.drawUltimateColumnPreview(pointer.worldX);
    }
    if (!this.isGuidanceDragging) {
      return;
    }

    const point = this.getClampedGuidancePoint(pointer);
    this.drawGuidancePreview(point.x, point.y);
  }

  /**
   * Dokunusun ne oldugunu kaydeder.
   *
   * Cihazda hata ayiklamanin tek yolu bu: oyuncunun elindeki telefonda dokunus
   * dusuyorsa, dusme sebebini ancak dokunus aninda okunan degerler soyleyebilir
   * -- dunya noktasi, arena icinde olup olmadigi, ustunde duran eleman ve hangi
   * kapida durduruldugu.
   */
  private logTap(pointer: Phaser.Input.Pointer, sonuc: string) {
    const event = (pointer as unknown as { domEvent?: PointerEvent }).domEvent;
    const clientX = event?.clientX ?? -1;
    const clientY = event?.clientY ?? -1;
    let ustEleman = "-";
    if (clientX >= 0) {
      const element = document.elementFromPoint(clientX, clientY);
      ustEleman = element ? `${element.tagName.toLowerCase()}${element.id ? "#" + element.id : ""}${typeof element.className === "string" && element.className ? "." + element.className.trim().split(/\s+/)[0] : ""}` : "yok";
    }
    this.tapLog.push({
      atMs: performance.now() - this.sceneStartedAt,
      clientX: Math.round(clientX),
      clientY: Math.round(clientY),
      worldX: Math.round(pointer.worldX),
      worldY: Math.round(pointer.worldY),
      arenaIcinde: this.isBattlePointer(pointer),
      ustEleman,
      sonuc
    });
    if (this.tapLog.length > TAP_LOG_SIZE) {
      this.tapLog.shift();
    }
  }

  /** Kule oyuncunun mu; baskasinin kulesi satilamaz. */
  private canSellSelectedTower(tower: TowerSnapshot) {
    return tower.id === this.selectedPlacedTowerId && tower.ownerId === this.localSessionId;
  }

  /**
   * Satistan donecek altin ve bunun bir geri alim olup olmadigi.
   *
   * Tek yerden hesaplaniyor cunku ayni sayi uc ayri yerde yaziyor -- kule
   * uzerindeki dugme, cekmecedeki dugme ve istatistik satiri. Ucu ayri
   * hesaplasaydi biri gunun birinde otekinden farkli bir sayi gosterirdi.
   */
  /**
   * Secili yapiyi sat: satis onay istiyor, geri alma istemiyor.
   *
   * Parmak kule panelindeki ya da haritadaki satis tusuna kazara degip kuleyi
   * ya da duvari satiyordu; satis iadesi bedelin bir kismi, yani hata pahali.
   * Geri alma (kurulumda yeni kurulanin tam iadesi) bir hata duzeltmesi:
   * onu ikinci bir dokunusla yavaslatmak gereksiz, dogrudan gidiyor. Onay
   * acikken yapi baska bir sebeple gitmisse sunucu satisi zaten reddediyor.
   */
  private requestSellSelectedTower() {
    const towerId = this.selectedPlacedTowerId;
    if (!towerId) return;
    const tower = this.towerSnapshots.get(towerId);
    const refund = tower ? this.getTowerRefundState(tower) : undefined;
    const sell = () => {
      this.room?.send("sellTower", { towerId });
      if (this.selectedPlacedTowerId === towerId) {
        this.selectedPlacedTowerId = undefined;
        this.updateSelectionUi();
      }
    };
    if (!tower || !refund || refund.undoable) {
      sell();
      return;
    }
    const name = getTowerDisplayName(tower.definitionId, tower.name);
    openConfirmDialog(
      t("scene.sell.confirmTitle", { name }),
      [t("scene.sell.confirmBody", { name, amount: refund.amount })],
      { confirm: t("scene.sell.confirm", { amount: refund.amount }), cancel: t("scene.sell.cancel") },
      sell
    );
  }

  private getTowerRefundState(tower: TowerSnapshot) {
    const definition = towerCatalog[tower.characterId]?.find((entry) => entry.id === tower.definitionId);
    if (!definition) return { amount: 0, undoable: false };
    // Kuralin tamami paylasilan fonksiyonda; burada yalnizca cagriliyor.
    // Kendi kopyasini tasidigi surece bir gun sunucudan ayrisirdi ve
    // ayristigini kimse fark etmezdi -- iki taraf da makul sayilar uretir.
    return resolveTowerRefund(
      { ...tower, cost: definition.cost, definitionId: definition.id },
      {
        setupPhase: this.latestPerfSnapshot?.setupPhase,
        setupSession: this.latestPerfSnapshot?.setupSession,
        refundMultiplier: tower.sellRefundMultiplier ?? 1
      }
    );
  }

  /**
   * Satis dugmesine mi basildi.
   *
   * Dugme Phaser ile ciziliyor ama tiklamasi Phaser'in giris sisteminden
   * gecmiyor: haritanin girdisi tek yoldan yurutuluyor ve o yol dunya
   * koordinatini zaten hesapliyor. Ayni yoldan gecmek, dugmenin haritanin
   * geri kalaniyla ayni guvenilirlikte olmasi demek.
   */
  private hitSellButton(pointer: Phaser.Input.Pointer) {
    const rect = this.sellButtonRect;
    if (!rect || !this.selectedPlacedTowerId) {
      return false;
    }
    return pointer.worldX >= rect.x && pointer.worldX <= rect.x + rect.width
      && pointer.worldY >= rect.y && pointer.worldY <= rect.y + rect.height;
  }

  /**
   * Hedef bekleyen isci icin haritaya dokunuldu. Uygun hedef varsa atama
   * sunucuya gider ve cekmece Yonetim'e doner; tukenmis kaynak ya da yanlis
   * bina reddedilir ve secim acik kalir. Bos kareye dokunus sessiz: serit
   * neyin beklendigini zaten soyluyor.
   */
  private resolveWorkerPickTap(pointer: Phaser.Input.Pointer) {
    const pick = this.workerPick;
    const source = this.workerRosterSource;
    const worker = pick ? source?.drones.find((drone) => drone.id === pick.workerId) : undefined;
    const role = worker ? getWorkerRosterRole(worker.mode) : undefined;
    if (!pick || !source || !worker || !role) {
      this.workerPick = undefined;
      this.emitControlState();
      return;
    }
    const target = resolveWorkerMapTarget({
      workerId: worker.id,
      role,
      product: pick.product,
      x: pointer.worldX,
      y: pointer.worldY,
      radius: this.getMapCellSize() * 0.8,
      nodes: listResourceNodes(source.crystalNodes, source.ammoNodes),
      towers: this.towerSnapshots.values(),
      hitTowerId: this.findTowerAt(pointer.worldX, pointer.worldY)?.id,
      ownerId: this.localSessionId
    });
    if (target.kind === "assign") {
      this.room?.send("worker:assign", target.message);
      this.workerPick = undefined;
      this.emitControlState();
    } else if (target.kind === "depleted") {
      this.showNotice(t("server.worker.nodeDepleted"));
    } else if (target.kind === "wrongBuilding") {
      this.showNotice(t("scene.worker.wrongBuilding"));
    }
  }

  /**
   * Isci cekmecesinin "Yonetim" bolumu icin oyuncunun iscileri. Hedefi beklenen
   * isci artik sahada degilse (oldu) secim de kapanir.
   */
  private getWorkerRosterState(): WorkerRosterState | undefined {
    const source = this.workerRosterSource;
    if (!source) return undefined;
    const roster = buildWorkerRoster({
      drones: source.drones ?? [],
      nodes: listResourceNodes(source.crystalNodes, source.ammoNodes),
      getTower: (id) => this.towerSnapshots.get(id),
      ownerId: this.localSessionId,
      pick: this.workerPick
    });
    if (this.workerPick && !roster.picking) this.workerPick = undefined;
    return roster;
  }

  private handleMapPointer(pointer: Phaser.Input.Pointer) {
    // Tutamac suruklemesinin birakisi cizgiyi kurar. Kayma esigini asmayan
    // basis dokunustur: normal akisa dusuyor (altindaki kule secilebilsin).
    if (this.finishWallHandleDrag(pointer)) {
      this.logTap(pointer, "duvar cizgisi");
      return;
    }
    // Tutamacin disindaki her dokunus tutamaclari kapatir.
    this.hideWallHandles();
    // Metal Kalkan suruklemesinin birakisi (kalkan cekildi ya da vazgecildi)
    // siradan bir harita dokunusu degil: kule secmez, secimi kaldirmaz.
    // Esigi asmamis jest burada hicbir sey yapmaz; dokunus eskisi gibi isler.
    // Iki jest de her birakisi gormeli (biri yutsa bile oteki durumunu kapatsin).
    const shieldConsumed = this.finishShieldGesture(pointer);
    const skillGestureConsumed = this.finishMapSkillGesture(pointer);
    if (shieldConsumed) {
      this.logTap(pointer, "metal kalkan");
      return;
    }
    // Beceri jesti (atildi, iptal edildi ya da iki parmagin ikincisi) dokunus degil.
    if (skillGestureConsumed) {
      this.logTap(pointer, "beceri jesti");
      return;
    }
    this.logTap(pointer, this.describeTapOutcome(pointer));
    // Hedef bekleyen isci varken haritaya dokunus atamadir: kule secmez,
    // satmaz, yerlestirmez.
    if (this.workerPick && this.isBattlePointer(pointer)) {
      this.resolveWorkerPickTap(pointer);
      return;
    }
    // Hedefli kartin kulesi seciliyor: dokunus yalnizca hedef secer.
    if (this.cardTargetPick && this.isBattlePointer(pointer)) {
      this.resolveCardTargetTap(pointer);
      return;
    }
    if (this.hitSellButton(pointer)) {
      this.requestSellSelectedTower();
      return;
    }
    if (this.pendingUltimateColumn && this.isBattlePointer(pointer)) {
      const column = this.getUltimateColumnAt(pointer.worldX);
      if (column !== undefined) {
        // `y`: ZentaX'in bedeni sutunun dokunulan hizasina ucuyor.
        this.room?.send("useUltimate", { column, y: pointer.worldY });
        this.echoUltimateCast({ column, y: pointer.worldY });
        this.pendingUltimateColumn = false;
        this.clearUltimateColumnPreview();
        this.emitControlState();
        return;
      }
    }
    if (this.pendingShopPlacement && this.isBattlePointer(pointer)) {
      this.room?.send("shop:place", { itemId: this.pendingShopPlacement, x: pointer.worldX, y: pointer.worldY });
      this.pendingShopPlacement = undefined;
      return;
    }
    // Yasak kipi kule secmeden once bakiliyor: kip acikken haritaya basmanin
    // tek anlami kare kapatmak olmali, yoksa kulenin ustundeki kareler
    // yasaklanamazdi.
    if (this.workerBanMode && this.isBattlePointer(pointer)) {
      this.room?.send("worker:banCell", { x: pointer.worldX, y: pointer.worldY });
      return;
    }
    if (this.isGuidanceDragging) {
      const point = this.getClampedGuidancePoint(pointer);
      this.room?.send("useSkill", { slot: 0, x: point.x, y: point.y });
      this.echoSkillUse(0);
      this.isGuidanceDragging = false;
      this.pendingAction = undefined;
      this.clearPlacedTowerSelection();
      this.clearGuidancePreview();
      this.showNotice(t("scene.skill.redirectSent"));
      return;
    }

    if (this.draggedTowerDefinition || performance.now() < this.ignoreMapPointerUntil) {
      return;
    }
    if (!this.isBattlePointer(pointer)) {
      return;
    }
    if (this.handleArenaZoomTap(pointer)) {
      return;
    }
    // Yakinlastiran ilk dokunus da hedef seciyor: dunya koordinati dokunus
    // anindan, yakinlastirmadan once hesaplanmis.
    if (this.pendingAction?.type === "execute") {
      this.resolveExecuteTap(pointer);
      return;
    }
    this.hideUltimateChoices();
    this.hideZeynepTierChoicesIfOpen();

    if (this.pendingAction?.type === "guidance") {
      this.showNotice(this.selectedCharacterId === "archer" ? t("scene.skill.tyrantDragHint") : t("scene.skill.redirectDragHint"));
      return;
    }

    const tower = this.findTowerAt(pointer.worldX, pointer.worldY);
    if (tower) {
      if (this.tryLinkServerTower(tower)) {
        return;
      }
      this.tryEquipPendingItem(tower.id);
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
      this.showNotice(t("scene.skill.pickCommandTier"));
      return;
    }

    if (this.selectedCharacterId === "archer") {
      this.hideZeynepTierChoices();
      if (index === 0) {
        this.pendingAction = { type: "guidance" };
        this.clearPlacedTowerSelection();
        this.showNotice(t("scene.skill.tyrantArmed"));
        return;
      }
      if (index === 1) {
        const towerId = this.selectedPlacedTowerId;
        if (!towerId) {
          this.showNotice(t("scene.skill.lethalStressNeedsTower"));
          return;
        }
        this.room.send("useSkill", { slot: index, towerId });
        this.echoSkillUse(index);
        this.clearPlacedTowerSelection();
        return;
      }
      this.room.send("useSkill", { slot: index });
      this.echoSkillUse(index);
      this.clearPlacedTowerSelection();
      return;
    }

    if (this.selectedCharacterId !== "warrior") {
      this.hideZeynepTierChoices();
      this.room.send("useSkill", { slot: index });
      this.echoSkillUse(index);
      this.clearPlacedTowerSelection();
      return;
    }

    if (index === 0) {
      this.hideZeynepTierChoices();
      this.pendingAction = { type: "guidance" };
      this.clearPlacedTowerSelection();
      this.showNotice(t("scene.skill.redirectArmed"));
      return;
    }

    if (index === ATAKAN_SHIELD_SLOT) {
      // Metal Kalkan sekmeden silahlandirilmiyor: haritada basili tutup
      // suruklenerek cekiliyor. Sekmedeki satir bilgi; dokunus ipucunu gosterir.
      this.hideZeynepTierChoices();
      this.showNotice(t("scene.skill.shieldHint"));
      return;
    }

    if (index === ATAKAN_EXECUTE_SLOT) {
      this.hideZeynepTierChoices();
      // Ikinci basis hedeflemeyi kapatiyor: ayri bir iptal dugmesi yok.
      if (this.pendingAction?.type === "execute") {
        this.pendingAction = undefined;
        this.showNotice(t("scene.skill.executeCancelled"));
        this.emitControlState();
        return;
      }
      this.pendingAction = { type: "execute" };
      this.clearPlacedTowerSelection();
      this.showNotice(t("scene.skill.executePickEnemy"));
      this.emitControlState();
      return;
    }

    this.hideZeynepTierChoices();
    this.room.send("useSkill", { slot: index });
    this.echoSkillUse(index);
    this.clearPlacedTowerSelection();
  }

  /**
   * Execute hedeflemesinde haritaya dokunuldu. Dusman yoksa kip kapaniyor;
   * ezici ya da sampiyonsa istek hic gitmiyor ("Etkisiz", bekleme harcanmaz).
   * Sunucu ayni kurali yeniden soruyor: istemcinin gordugu dusman orada
   * coktan olmus ya da hukmedilmis olabilir, o zaman `skill:rejected` geliyor.
   */
  /**
   * Infaz hedeflemesini kapatir: baska bir kip acildi (ulti, magaza
   * yerlestirmesi, kule surukleme) ya da dalga bitti. Acik degilse hicbir sey.
   */
  private cancelExecuteTargeting() {
    if (this.pendingAction?.type !== "execute") {
      return false;
    }
    this.pendingAction = undefined;
    this.emitControlState();
    return true;
  }

  private resolveExecuteTap(pointer: Phaser.Input.Pointer) {
    this.pendingAction = undefined;
    const enemy = this.findEnemyAt(pointer.worldX, pointer.worldY);
    if (!enemy) {
      this.showNotice(t("scene.skill.executeCancelled"));
      this.emitControlState();
      return;
    }
    if (enemy.champion || (enemy.type && isExecuteImmune({ type: enemy.type, special: enemy.special }))) {
      this.showNotice(getExecuteRejectText("immune"));
      this.emitControlState();
      return;
    }
    this.room?.send("useSkill", { slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy.id });
    this.echoSkillUse(ATAKAN_EXECUTE_SLOT);
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
    this.showNotice(t("scene.link.requestSent", { source: linkRequest.sourceName, target: linkRequest.targetName }));
    return true;
  }

  private getLinkRequest(selectedTower: TowerSnapshot, targetTower: TowerSnapshot) {
    if (selectedTower.definitionId === "warrior-2") {
      return targetTower.definitionId !== "warrior-2"
        ? {
          serverTowerId: selectedTower.id,
          targetTowerId: targetTower.id,
          sourceName: getTowerDisplayName(selectedTower.definitionId, selectedTower.name),
          targetName: getTowerDisplayName(targetTower.definitionId, targetTower.name)
        }
        : undefined;
    }

    return undefined;
  }

  private async connect() {
    try {
      await this.checkServerHealth();
      this.emitHudState({ status: t("scene.status.connecting") });

      const resumed = takeResumedMatch();
      const existingRoom = getActiveLobbyRoom();
      if (resumed) {
        // Sayfa yenilendi ve kayitli anahtarla suren maca donuldu.
        this.room = resumed.room;
        this.startedFromLobby = resumed.mode === "online";
        this.soloOwnerSecret = resumed.ownerSecret;
      } else if (existingRoom) {
        this.room = existingRoom;
        this.startedFromLobby = true;
      } else {
        const client = getSharedClient(gameServerUrl);
        // Lobiden gecmeden dogrudan baslatma yolu. Menudeki iki yol rezervasyon
        // yeniden denemesini kullaniyordu ama burasi atlanmisti; oyunu dogrudan
        // baslatan oyuncu, uyanan ya da deploy edilen sunucuda hatayi ham haliyle
        // goruyordu.
        // Sahip sirri bir kez: yeniden denemeler ayni sirla kuruyor.
        const ownerSecret = createOwnerSecret();
        this.soloOwnerSecret = ownerSecret;
        this.room = await retryExpiredSeatReservation(() => client.create("match", withWireCaps({
          playerName: this.selectedCharacter.displayName,
          characterId: this.selectedCharacterId,
          mapData: this.selectedMapData,
          autoStart: true,
          creative: this.creativeRequested,
          tutorial: this.tutorialRequested,
          stage: this.selectedStage,
          ownerSecret
        })));
      }
      this.localSessionId = this.room.sessionId;
      this.emitHudState({ status: `#${this.room.roomId}` });
      this.bindRoomHandlers(this.room);
      this.room.send("snapshot:requestFull");
      this.room.send("card:sync");
      this.rememberMatchReconnect(this.room);
      runTelemetry.attach({
        roomId: this.room.roomId,
        online: this.startedFromLobby,
        // Ogretici kosusu da yaratici sayiliyor: kazanma oranlarina girmiyor.
        creative: this.creativeRequested || this.tutorialRequested,
        resumed: Boolean(resumed),
        operator: this.selectedCharacterId
      });
      this.startPingLoop();
      this.startTowerStatsLoop();
    } catch (error) {
      // Dolu sunucu bir ariza degil: tam metin bildirimde, cubukta kisa hali.
      if (isServerFullError(error)) {
        console.warn(error);
        this.showNotice(describeServerError(error), 8000);
        this.emitHudState({ status: t("scene.status.serverFull") });
        return;
      }
      console.error(error);
      reportTelemetryError(error, "connect");
      this.emitHudState({ status: this.formatConnectionError(error) });
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

  private queueSnapshot(snapshot: WireGameSnapshot) {
    const receiveStart = performance.now();
    // Sonucsuz bir snapshot: bu sahne maci oynarken odadaydi. Ilk snapshot
    // zaten sonucu tasiyorsa istemci mac bittikten sonra girmis demek; o
    // kosunun kaydi ve ilerlemesi onun degil (`recordRunResult`).
    if (!snapshot.result) this.liveSnapshotSeen = true;
    // Bu baglantida canli: sonuc gelince mac sonu sahnesi oynanabilir.
    if (!snapshot.result) this.liveSinceBind = true;
    // Bounty Board: canli mac oynaniyor (kopru yinelenen cagriyi yutuyor).
    if (!snapshot.result && !this.matchResultShown) arcade.gameplayStart();
    if (snapshot.stage !== undefined && snapshot.stage !== this.roomStage) {
      this.roomStage = snapshot.stage;
      this.drawMap();
    }
    if (snapshot.result) {
      // Sonuc mesaji kacirildiysa (kopma, yeniden baglanma) ekran buradan
      // aciliyor; asama ve yaratici bayragi da ayni snapshot'tan gelmeli ki
      // kayit menudeki secime dusmesin. Mac bittikten sonra her snapshot
      // sonucu tasiyor; kapi ikinci geliste hicbir sey yapmiyor.
      this.handleMatchResult(snapshot.result, {
        wave: snapshot.team.wave,
        kills: snapshot.team.kills,
        stage: snapshot.stage,
        creative: snapshot.creative,
        tutorial: snapshot.tutorial
      });
      // Snapshot kosu raporunu tasimiyor; rekor yalnizca rapordan yaziliyor.
      // Mesaj kacirildiysa bir kez isteniyor, ayni kosu kimligiyle geliyor ve
      // kayit kimlige baktigi icin ikinci kez yazilmiyor.
      if (this.matchResultLatch.awaitingRun && !this.runSyncRequested) {
        this.runSyncRequested = true;
        this.room?.send("run:sync");
      }
    }
    const hydratedSnapshot = this.hydrateSnapshot(snapshot);
    if (!hydratedSnapshot) {
      this.requestFullStaticSnapshot();
      return;
    }
    this.noteBadgeSnapshot(hydratedSnapshot);
    runTelemetry.noteSnapshot(hydratedSnapshot, this.localSessionId);
    this.noteProjectileOwnership(hydratedSnapshot.projectiles, hydratedSnapshot.towers);
    // Yon secimden once: bu snapshot oynatilirken dokunun baktigi yon.
    this.enemyHeadings.note(hydratedSnapshot.enemies, hydratedSnapshot.serverTime);
    this.noteZeynepReceipt(hydratedSnapshot);
    // Dalga karnesinin kapanis araligi burada kapaniyor: snapshot mesajlarla
    // ayni soketten, ayni sirayla geliyor (oynatma saati ise ~500 ms geride,
    // o yuzden oynatilan snapshot degil). Karnesi gelmis dalgadan baska bir
    // dalga savasta: sonraki ulti sonuclari o dalganin. Esitsizlik (buyuktur
    // degil): yaratici mod dalgayi geri sarabiliyor.
    const latestReportedWave = this.waveReports.latestWave;
    if (latestReportedWave !== undefined && !hydratedSnapshot.setupPhase && hydratedSnapshot.team.wave !== latestReportedWave) {
      this.waveReports.noteWaveStarted();
    }
    const bufferedSnapshot = {
      snapshot: hydratedSnapshot,
      receivedAt: performance.now()
    };
    this.snapshotBuffer.push(bufferedSnapshot);
    this.snapshotBuffer.sort((a, b) => a.snapshot.serverTime - b.snapshot.serverTime);
    this.playbackClock.observe(snapshot.serverTime, bufferedSnapshot.receivedAt);

    if (this.snapshotBuffer.length > 120) {
      this.droppedSnapshotCount += this.snapshotBuffer.length - 120;
      this.snapshotBuffer.splice(0, this.snapshotBuffer.length - 120);
    }
    this.matchDebug?.noteSnapshot(this.snapshotBuffer.length, this.droppedSnapshotCount);
    this.recordClientPerfSection("snapshotRecv", performance.now() - receiveStart);
  }

  /**
   * Nisanin snapshot olgulari, alindigi an (oynatma ~500 ms geride; mac biterken
   * son yukseltme ya da zar oynatilmadan kaybolmasin).
   *
   * Ilk sonucsuz snapshot kosunun canli gorulen ilk dalgasini sabitliyor:
   * sonradan katilan ya da yuva devralan oyuncu kendinden onceki dalgalari
   * almiyor. Deger oda kimligiyle oturum deposunda; yeniden baglanma ve sayfa
   * yenileme ilk degeri koruyor.
   */
  private noteBadgeSnapshot(snapshot: HydratedGameSnapshot) {
    if (!snapshot.result && this.badgeWatch.firstLiveWave === undefined) {
      const candidate = resolveFirstLiveWave({ wave: snapshot.team.wave, setupPhase: snapshot.setupPhase });
      this.badgeWatch.noteFirstLiveWave(resolveRoomFirstLiveWave(this.room?.roomId, candidate));
    }
    for (const tower of snapshot.towers) {
      if (tower.ownerId === this.localSessionId) this.noteBadgeTowerFacts(tower);
    }
  }

  /**
   * Dogrusal olmayan mermilerin (gudumlu, odak, lanet...) sahipligi ilk
   * gorulduklerinde: bunlar `projectile:spawn` gondermiyor. Alindigi anda
   * (oynatmadan ~500 ms once) mermi henuz kulesinin yanindayken. Gorulmeyen
   * kayitlar siliniyor; dogrusal mermiler kendi atis/isabet mesajlariyla.
   */
  private noteProjectileOwnership(projectiles: readonly ProjectileSnapshot[], towers: readonly TowerSnapshot[]) {
    const seen = this.ownershipSeen;
    seen.clear();
    for (const projectile of projectiles) {
      seen.add(projectile.id);
      if (projectile.source !== "tower" || this.projectileOwnership.has(projectile.id)) continue;
      const own = this.isOwnShotFrom(projectile.x, projectile.y);
      this.projectileOwnership.set(projectile.id, own);
      this.emitHomingMuzzle(projectile, own, towers);
    }
    for (const id of this.projectileOwnership.keys()) {
      if (!seen.has(id) && !this.linearProjectileSnapshots.has(id)) this.projectileOwnership.delete(id);
    }
  }

  private readonly ownershipSeen = new Set<string>();

  /**
   * Zeynep olaylari gelen snapshot'tan: isinlar, dusmanlar ve kuleler ayni
   * andan (oynatilan snapshot ~500 ms geride; yeni Gosteri hattinin dusmanlari
   * ve yeni kurulan Abarti orada yok). Turuyen olaylar tek gecikmeli efektle
   * oynatmaya siralaniyor.
   */
  private noteZeynepReceipt(snapshot: HydratedGameSnapshot) {
    const context = this.updateCourtContext();
    this.courtBatch = [];
    this.zeynepReceipt.noteSnapshot(snapshot.beams, snapshot.enemies, snapshot.towers, context, performance.now());
    const batch = this.courtBatch;
    this.courtBatch = undefined;
    if (batch.length > 0) {
      this.queueDelayedEffect(() => {
        const now = performance.now();
        for (const event of batch) this.zeynepSignatures?.emit(event, now);
      });
    }
  }

  private updateCourtContext() {
    const cell = this.getMapCellSize();
    this.courtContext.gridSize = cell;
    this.courtContext.worldScale = cell / TOWER_GRID_SIZE;
    return this.courtContext;
  }

  /**
   * Izleyicinin olayi: gecikmesizler snapshot'in toplu efektinde. Gecikmeli
   * olan (merminin Abarti rayina varisi) dogrudan imza havuzuna, oynatma
   * saatinde ileri tarihli: havuz dogmamis olayi cizmiyor, mermi raya
   * varmadan durursa `projectile:hit` onu iptal ediyor. Paylasilan efekt
   * kuyrugunu 1.6 sn mesgul etmiyor, yan kayit da gerekmiyor.
   */
  private queueCourtEvent(event: CourtEventInput, delayMs: number) {
    if (delayMs <= 0 && this.courtBatch) {
      this.courtBatch.push(event);
      return;
    }
    this.zeynepSignatures?.emit(event, performance.now() + this.playbackDelayMs + Math.max(0, delayMs));
  }

  /**
   * Temasin dusmani: gelen son snapshot'ta gorunen govdesinin kenari temas
   * noktasina en yakin dusman (`findContactEnemy`; temas mesaji snapshot'la
   * ayni soketten geliyor, sunucunun temasi govdenin kenarinda). Yoksa
   * `undefined`.
   */
  private findContactSnapshotEnemy(x: number, y: number) {
    const latest = this.snapshotBuffer[this.snapshotBuffer.length - 1]?.snapshot;
    return latest ? findContactEnemy(latest.enemies, x, y, this.enemyHeadings, this.getMapCellSize()) : undefined;
  }

  /** Dusmanin ekrandaki capi (Zeynep kertigi); bilinmiyorsa `undefined`: kertik grunt boyunda. */
  private getEnemyBodySize(enemy: EnemySnapshot | undefined) {
    if (!enemy) return undefined;
    return this.enemies.get(enemy.id)?.displaySize ?? getEnemySpriteDisplaySize(enemy, this.getMapCellSize());
  }

  /**
   * Kozmetik itme: carpmanin cizildigi anda (oynatma saati) vurulan dusman
   * `px` piksel vurus yonunde itiliyor ve ENEMY_KNOCK_MS'de yerine oturuyor.
   * Dusman temas aninda bulunuyor (`enemyId`); bulunamadiysa carpmanin
   * cizildigi yere en yakin cizili dusman, en buyuk govdenin erisimi kadar
   * (temas govdenin kenarinda: havadaki tam yigin ruh cekicide merkezden ~30
   * birim; eski 26 birimlik arama onu bulamiyordu). Yalnizca kendi agir
   * vurusun (AttackVfx karar veriyor; hareket azaltmada hic). Sunucunun
   * konumu ve can cubugu degismiyor.
   */
  private knockEnemyNear(x: number, y: number, angle: number, px: number, enemyId?: string) {
    let target = enemyId ? this.enemies.get(enemyId) : undefined;
    if (!target) {
      let best = (KNOCK_SEARCH_RADIUS * this.getMapCellSize() / TOWER_GRID_SIZE) ** 2;
      for (const mover of this.enemies.values()) {
        const gap = (mover.sprite.x - x) ** 2 + (mover.sprite.y - y) ** 2;
        if (gap < best) {
          best = gap;
          target = mover;
        }
      }
    }
    if (!target) return;
    target.knockAt = performance.now();
    target.knockX = Math.cos(angle) * px;
    target.knockY = Math.sin(angle) * px;
  }

  /** Carpmanin dusmana gore yeri, gelen snapshot'lardan (`resolveHitAnchor`). */
  private resolveHitAnchor(anchor: HitAnchor, extra?: HydratedGameSnapshot) {
    return resolveHitAnchor(anchor, this.snapshotBuffer, extra);
  }

  /**
   * Temas aninin carpma kaydi: dusman (kenari temasa en yakin) ve temasin
   * sunucu saati: mesajin geldigi anin sunucu saatinden (`getServerTimeAt`)
   * bir tik once (`getContactServerTime`: temas o tikin dusman hareketinden
   * once hesaplaniyor). Dusman ya da saat yoksa yok.
   */
  private createHitAnchor(x: number, y: number, receivedAt: number): HitAnchor | undefined {
    const enemy = this.findContactSnapshotEnemy(x, y);
    const received = this.playbackClock.getServerTimeAt(receivedAt);
    if (!enemy || received === undefined) return undefined;
    return { enemyId: enemy.id, x, y, at: getContactServerTime(received), offsetX: 0, offsetY: 0, state: "pending" };
  }

  /**
   * Carpmanin ekrandaki yeri, cizildigi anda (oynatma saati carpma aninda):
   * vurulan dusmanin cizilen konumu + temasin dusmana gore yeri. Oynatma
   * gecikmesi icinde dusman yurudugu icin sabit nokta govdeyle 1-4 birim
   * ortusurdu ya da arada bosluk kalirdi. Cozulemezse sunucunun noktasi.
   */
  private getAnchoredHitPoint(anchor: HitAnchor | undefined, x: number, y: number) {
    if (!anchor || !this.resolveHitAnchor(anchor)) return { x, y };
    const mover = this.enemies.get(anchor.enemyId);
    if (!mover) return { x, y };
    return { x: mover.sprite.x - (mover.knockDx ?? 0) + anchor.offsetX, y: mover.sprite.y - (mover.knockDy ?? 0) + anchor.offsetY };
  }

  /**
   * Gudumlu atisin namlusu (Izolasyon Kulesi): sunucu gudumlu mermi icin
   * `projectile:spawn` gondermiyor, mermi ilk kez snapshot'ta goruluyor.
   * Goruldugu an (oynatmadan ~500 ms once) atan kulenin yaninda; namlu ve
   * kademe 2+ hazirlik vurusu kulenin kendi konumundan, oynatmaya siralaniyor.
   * Yalnizca profili gudumlu teslim olan kuleler: Melis'in odak ve lanet
   * mermileri kendi dilinde, dokunulmuyor. Ek tel yok.
   *
   * Kuleler mermiyle ayni (gelen) snapshot'tan: oynatilan snapshot ~500 ms
   * geride, yeni kurulan kule orada henuz yok.
   */
  private emitHomingMuzzle(projectile: ProjectileSnapshot, own: boolean, towers: readonly TowerSnapshot[]) {
    const origin = findHomingMuzzleOrigin(projectile, towers, this.getMapCellSize() * 2);
    if (!origin) return;
    const definitionId = projectile.definitionId ?? "";
    const originX = origin.x;
    const originY = origin.y;
    const angle = Math.atan2(projectile.vy ?? projectile.y - originY, projectile.vx ?? projectile.x - originX);
    const recipe = getVfxTier(getVfxProfile(definitionId), projectile.tier);
    if (recipe.muzzle.anticipationMs > 0) {
      this.queueDelayedEffect(() => this.attackVfx?.emitAnticipation({
        x: originX, y: originY, angle, definitionId, tier: projectile.tier, own, key: projectile.id, bornAt: performance.now()
      }), recipe.muzzle.anticipationMs);
    }
    this.queueDelayedEffect(() => this.attackVfx?.emitMuzzle({
      x: originX, y: originY, angle, definitionId, tier: projectile.tier, own, key: projectile.id, bornAt: performance.now()
    }));
  }

  private hydrateSnapshot(snapshot: WireGameSnapshot): HydratedGameSnapshot | undefined {
    // Tam kare (atlanip geri gelen istemci): kayitlar birlestirilmiyor, yerine
    // konuyor. Birlestirilseydi tam kayitta artik olmayan alan eski degerde kalirdi.
    if (snapshot.wireFull) {
      this.dynamicTowerSnapshots.clear();
      this.dynamicEnemySnapshots.clear();
      this.dynamicPlayerSnapshots.clear();
      this.dynamicDroneSnapshots.clear();
    }
    // Delta once tamamlaniyor: hidratlama tam kayit bekliyor.
    const towers = mergeDynamicTowerSnapshots(this.dynamicTowerSnapshots, snapshot.towers);
    const enemies = mergeDynamicEnemySnapshots(this.dynamicEnemySnapshots, snapshot.enemies);
    const players = mergeDynamicRecordSnapshots(this.dynamicPlayerSnapshots, snapshot.players);
    const drones = mergeDynamicRecordSnapshots(this.dynamicDroneSnapshots, snapshot.drones ?? []);
    const hydrated = hydrateWireSnapshot({ ...snapshot, towers, enemies, players, drones }, this.staticEnemySnapshots, this.staticTowerSnapshots);
    if (!hydrated) return undefined;
    pruneStaticSnapshotCache(this.staticEnemySnapshots, snapshot.enemies.map((enemy) => enemy.id));
    pruneStaticSnapshotCache(this.staticTowerSnapshots, snapshot.towers.map((tower) => tower.id));
    pruneStaticSnapshotCache(this.dynamicTowerSnapshots, snapshot.towers.map((tower) => tower.id));
    pruneStaticSnapshotCache(this.dynamicEnemySnapshots, snapshot.enemies.map((enemy) => enemy.id));
    pruneStaticSnapshotCache(this.dynamicPlayerSnapshots, snapshot.players.map((player) => player.id));
    pruneStaticSnapshotCache(this.dynamicDroneSnapshots, (snapshot.drones ?? []).map((drone) => drone.id));
    const linearProjectiles: ProjectileSnapshot[] = [];
    for (const [id, projectile] of this.linearProjectileSnapshots) {
      if (isClientProjectileExpired(projectile, snapshot.serverTime)) {
        this.linearProjectileSnapshots.delete(id);
        continue;
      }
      linearProjectiles.push({ ...projectile, ...getLinearProjectilePosition(projectile, snapshot.serverTime) });
    }
    const now = performance.now();
    const terminalProjectiles: ProjectileSnapshot[] = [];
    for (const [id, terminal] of this.terminalProjectileSnapshots) {
      if (now >= terminal.removeAfter) {
        this.terminalProjectileSnapshots.delete(id);
        continue;
      }
      // Duran mermi vurdugu dusmanla birlikte: bu snapshot'taki konumu +
      // temasin dusmana gore yeri. Oynatma ara degerlemesi onu dusmanla
      // birlikte yurutuyor; yerinde dondurulmus mermi oynatma gecikmesi
      // boyunca yuruyen govdeye 1-4 birim giriyor ya da ondan kopuyordu.
      const anchor = terminal.anchor;
      const enemy = anchor && this.resolveHitAnchor(anchor, hydrated) ? hydrated.enemies.find((entry) => entry.id === anchor.enemyId) : undefined;
      terminalProjectiles.push(enemy ? { ...terminal.projectile, x: enemy.x + anchor!.offsetX, y: enemy.y + anchor!.offsetY } : terminal.projectile);
    }
    return { ...hydrated, projectiles: [...hydrated.projectiles, ...linearProjectiles, ...terminalProjectiles] };
  }

  private applyFullStaticSnapshot(snapshot: StaticSnapshot) {
    this.staticEnemySnapshots = new Map(snapshot.enemies.map((enemy) => [enemy.id, enemy]));
    this.staticTowerSnapshots = new Map(snapshot.towers.map((tower) => [tower.id, tower]));
    // Tam statik istegi sunucuda delta tabanini da sifirliyor; buradaki
    // birikimi de birakmak gerekiyor ki eski alanlar yeni kayda sizmasin.
    this.dynamicTowerSnapshots.clear();
    this.dynamicEnemySnapshots.clear();
    this.dynamicPlayerSnapshots.clear();
    this.dynamicDroneSnapshots.clear();
    // Harita buradan da gelir: `match:map` mesaji dinleyiciler takilmadan once
    // cikabildigi icin tek basina guvenilir degil. Yanlis haritayla oynayan
    // istemci kareleri baska yere cizer, dokunuslari baska hucreye yazar ve
    // sunucunun kullandigi sutunlari hic bilmez.
    // Kurulum yasak bolgeler de yalnizca burada geliyor (mac basina sabit);
    // haritadan once yaziliyor ki cizim anahtari ikisini birlikte gorsun.
    this.buildZones = snapshot.buildZones;
    if (snapshot.map) {
      this.syncMap(snapshot.map);
    } else if (this.getMapRenderKey(this.selectedMapData) !== this.renderedMapKey) {
      this.drawMap();
    }
  }

  private requestFullStaticSnapshot() {
    const now = performance.now();
    if (now - this.lastFullSnapshotRequestAt < 1000) return;
    this.lastFullSnapshotRequestAt = now;
    this.room?.send("snapshot:requestFull");
  }

  private renderPlaybackFrame(now: number) {
    const frameStart = performance.now();
    // Kare ciziminden once: efektler sahnenin gordugu ana yetismeli. Snapshot
    // hazir olmasa bile calisir, yoksa bekleyen parlamalar orada takili kalir.
    this.drainPendingEffects(now);
    const frame = this.getPlaybackFrame(now);
    if (!frame) {
      this.matchDebug?.noteStarve();
      return;
    }

    this.zeynepCommandEffects = frame.snapshot.zeynepCommands;
    let sectionStart = performance.now();
    this.renderEnemies(frame.snapshot.enemies);
    this.recordClientPerfSection("enemies", performance.now() - sectionStart);
    sectionStart = performance.now();
    this.renderDrones(frame.snapshot.drones ?? []);
    // Operator bedenleri iscilerin ustunde; ZentaX'in halkasi acik emirlerden.
    this.operatorBodyView?.render(frame.snapshot.bodies, {
      now,
      scale: this.getMapCellSize() / TOWER_GRID_SIZE,
      zeynepCommands: frame.snapshot.zeynepCommands
    });
    this.renderWorkerBannedCells();
    this.renderCrystalNodes(frame.snapshot.crystalNodes ?? []);
    this.renderAmmoNodes(frame.snapshot.ammoNodes ?? []);
    this.recordClientPerfSection("drones", performance.now() - sectionStart);
    sectionStart = performance.now();
    this.renderProjectiles(frame.snapshot.projectiles);
    const projectilesMs = performance.now() - sectionStart;
    this.recordClientPerfSection("projectiles", projectilesMs);
    this.vfxFrameCost += projectilesMs;
    // Isinlar ve kule ustu canli katmanlar her karede: eskiden yalnizca
    // snapshot geldiginde (~15 Hz) ciziliyorlardi ve zamana bagli her sey
    // (Gosteri'nin ikinci perdesi, Ucube zinciri, Melis patlamalari)
    // basamakli oynuyordu.
    sectionStart = performance.now();
    this.renderBeamFrame(frame.snapshot.beams, now, frame.snapshot.enemies);
    const beamsMs = performance.now() - sectionStart;
    this.recordClientPerfSection("beams", beamsMs);
    this.vfxFrameCost += beamsMs;
    this.renderTowerOverlays();
    // Seritler de efekt butcesinde: LOD yuk altinda once onlarin ayrintisini kisiyor.
    sectionStart = performance.now();
    this.renderCounterSurge(frame.snapshot.surges, now);
    this.vfxFrameCost += performance.now() - sectionStart;
    this.renderMetalShields(frame.snapshot.shields, now);
    // Irk mekanikleri: meka kalkanlari, catlaklar, katlanma uyarilari, gecici efektler.
    sectionStart = performance.now();
    this.renderRaceScene(frame.snapshot.mshields, now);
    this.vfxFrameCost += performance.now() - sectionStart;
    sectionStart = performance.now();
    this.renderAtakanSignatures(frame.snapshot.enemies, now);
    this.renderZeynepSignatures(frame.snapshot.enemies, now);
    const signaturesMs = performance.now() - sectionStart;
    this.recordClientPerfSection("signatures", signaturesMs);
    this.vfxFrameCost += signaturesMs;
    this.lastPlaybackAlpha = frame.alpha;

    if (frame.snapshot.serverTime !== this.lastRenderedSnapshotServerTime) {
      this.renderSnapshotPayload(frame.snapshot);
      this.lastRenderedSnapshotServerTime = frame.snapshot.serverTime;
    }
    this.recordClientPerfSection("frame", performance.now() - frameStart);
  }

  private getPlaybackFrame(now: number): PlaybackFrame | undefined {
    if (this.snapshotBuffer.length === 0 || !this.playbackClock.isReady()) {
      return undefined;
    }

    const targetServerTime = this.playbackClock.getTargetServerTime(now);
    // Irk uyarilari (catlak, katlanma) sunucu saatindeki anlara bagli: oynatma ani.
    this.racePlaybackServerTime = targetServerTime;
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

  private interpolateSnapshot(previous: HydratedGameSnapshot, next: HydratedGameSnapshot, alpha: number): HydratedGameSnapshot {
    const previousEnemies = new Map(previous.enemies.map((enemy) => [enemy.id, enemy]));
    const enemies = next.enemies.map((enemy) => {
      const oldEnemy = previousEnemies.get(enemy.id);
      const pathDistance = oldEnemy
        ? Phaser.Math.Linear(oldEnemy.pathDistance, enemy.pathDistance, alpha)
        : enemy.pathDistance;
      // Katlanma sicramasi ve kazicinin cikisi isinlanma: iki kare arasinda
      // kaydirilmiyor, yeni yerde beliriyor.
      const teleported = Boolean(oldEnemy && ((oldEnemy.fj && !enemy.fj) || (oldEnemy.bu && !enemy.bu)));
      const lerpPosition = oldEnemy && !teleported;

      return {
        ...enemy,
        x: lerpPosition ? Phaser.Math.Linear(oldEnemy!.x, enemy.x, alpha) : enemy.x,
        y: lerpPosition ? Phaser.Math.Linear(oldEnemy!.y, enemy.y, alpha) : enemy.y,
        pathDistance,
        hp: oldEnemy ? Phaser.Math.Linear(oldEnemy.hp, enemy.hp, alpha) : enemy.hp,
        shield: oldEnemy ? Phaser.Math.Linear(oldEnemy.shield, enemy.shield, alpha) : enemy.shield,
        // Iki snapshot arasinda yon onceki snapshot'in: sunucu bu araliktaki
        // vuruslari o yonle yapiyor (`noteSnapshotHeadings` yeni yonu ancak
        // sonraki yayinda yaziyor). Sonrakinin yonu sprite'i bir aralik erken
        // donduruyordu.
        hx: oldEnemy?.hx ?? enemy.hx,
        hy: oldEnemy?.hy ?? enemy.hy
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

      // vx/vy oyun saatinde; snapshot araligi duvar saati.
      const remainingSeconds = snapshotDeltaSeconds * (1 - alpha) * GAME_SPEED_MULTIPLIER;
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
      projectiles,
      // Karsi atagin on kenari snapshotlar arasinda yumusak ilerlesin.
      surges: interpolateCounterSurges(previous.surges, next.surges, alpha),
      // Metal Kalkan'in acilisi ve kapanisi da snapshot adimiyla basamaklanmasin.
      shields: interpolateMetalShields(previous.shields, next.shields, alpha),
      // Bedenler hizli ucuyor: snapshot adimiyla sicramasinlar.
      bodies: interpolateOperatorBodies(previous.bodies, next.bodies, alpha),
      beams: this.beamInterpolator.interpolate(previous.beams, next.beams, alpha, next.serverTime - previous.serverTime)
    };
  }

  /**
   * Karenin isinlari: ara degerlenmis uclar ve yerelde akan omur.
   *
   * Lazerin cizimi kitten ve eskisiyle bire bir ayni
   * (tests/vfx-kit-laser-identity.test.mjs); degisen yalnizca ne siklikla
   * cizildigi.
   */
  private renderBeamFrame(beams: readonly BeamSnapshot[], now: number, enemies: readonly { x: number; y: number }[]) {
    const options = this.beamRenderOptions;
    options.now = now;
    options.sceneNow = this.time.now;
    options.scale = this.getTowerEffectScale();
    options.reducedMotion = this.feedback?.reducedMotion ?? false;
    this.beamRenderer?.render(beams, options);
    // Isinin vurus sesi cizimle ayni karede: tek atis isini dogusunda,
    // surekli isin (lazer) nabizla, alan isini icinde dusman varken tikle.
    this.beamHitTracker.update(beams, now, enemies);
  }

  /**
   * Kule ustundeki canli katmanlar (performans alevi, Testere bicaklari,
   * Odaklan halkasi, Zeynep emirleri, Debug Lazer prizmasi, Izolasyon alani...)
   * her karede. Eskiden yalnizca snapshot geldiginde ciziliyordu.
   */
  private renderTowerOverlays() {
    for (const [id, rendered] of this.towers) {
      const tower = this.towerSnapshots.get(id);
      if (tower) this.renderTowerSpriteEffects(rendered.effect, tower);
    }
  }

  /**
   * Atakan imzalari: karedeki (ara degerlenmis) dusmanlar ve son snapshot'in
   * kuleleri. Girdi nesnesi yeniden kullaniliyor.
   */
  private renderAtakanSignatures(enemies: readonly EnemySnapshot[], now: number) {
    const signatures = this.atakanSignatures;
    if (!signatures) return;
    const frame = this.signatureFrame;
    frame.towers = this.signatureTowers;
    frame.enemies = enemies;
    frame.now = now;
    frame.scale = this.getTowerEffectScale();
    frame.cellSize = this.getMapCellSize();
    frame.map = this.selectedMapData;
    signatures.render(frame);
  }

  /** Zeynep imzalari: karedeki (ara degerlenmis) dusmanlar; girdi nesnesi yeniden kullaniliyor. */
  private renderZeynepSignatures(enemies: readonly EnemySnapshot[], now: number) {
    const signatures = this.zeynepSignatures;
    if (!signatures) return;
    const frame = this.courtFrame;
    frame.enemies = enemies;
    frame.now = now;
    frame.scale = this.getTowerEffectScale();
    signatures.render(frame);
  }

  /**
   * Konumun en yakin kulesinin sahibi; `reach` icinde kule yoksa `undefined`.
   * Kule sayisi en fazla birkac duzine: duz tarama.
   */
  private findTowerOwnerNear(x: number, y: number, reach: number) {
    let best = reach * reach;
    let owner: string | undefined;
    for (let index = 0; index < this.towerSpotX.length; index += 1) {
      const dx = this.towerSpotX[index] - x;
      const dy = this.towerSpotY[index] - y;
      const gap = dx * dx + dy * dy;
      if (gap <= best) {
        best = gap;
        owner = this.towerSpotOwner[index];
      }
    }
    return owner;
  }

  /**
   * Isini atan yerel oyuncu mu (takim arkadasinin kademe 3 eklentileri %70).
   *
   * - Ulti isinlari (Zeynep sutunu, Sempati agi) kuleye degil atana ait;
   *   sunucu atani yazmiyor, ama ultinin karakteri belli: yerel oyuncu o
   *   karakterse kendi ultisi (kendi ultisi soluk cizilmesin).
   * - Kuleden cikan isin: cikis noktasinin yarim karelik cevresindeki kule.
   * - Kimlikte kule kimligi (`t12`) gecen isin: o kule.
   * - Gerisi (dusmandan cikan Melis isinlari): yerel oyuncu Melis'se kendi,
   *   degilse bilinmiyor ve takim arkadasininki sayiliyor.
   */
  private isOwnBeam(beam: BeamSnapshot) {
    if (beam.definitionId === "zeynep-ultimate-column") return this.selectedCharacterId === "zeynep";
    if (beam.definitionId === "onur-sympathy") return this.selectedCharacterId === "onur";
    const nearOrigin = this.findTowerOwnerNear(beam.x1, beam.y1, this.getMapCellSize() * 0.5);
    if (nearOrigin !== undefined) return nearOrigin === this.localSessionId;
    const towerId = BEAM_TOWER_ID_PATTERN.exec(beam.id)?.[1];
    const tower = towerId ? this.towerSnapshots.get(towerId) : undefined;
    if (tower) return tower.ownerId === this.localSessionId;
    return beam.definitionId.startsWith("archer-") && this.selectedCharacterId === "archer";
  }

  /** Atis aninda mermiyi atan kule; kule bulunamazsa yerel sayilir (soluklastirma yalnizca bilinene). */
  private isOwnShotFrom(x: number, y: number) {
    const owner = this.findTowerOwnerNear(x, y, this.getMapCellSize() * 1.5);
    return owner === undefined || owner === this.localSessionId;
  }

  private renderSnapshotPayload(snapshot: HydratedGameSnapshot) {
    const renderStart = performance.now();
    const now = performance.now();

    this.syncBackgroundMusic(snapshot);
    // `renderHud` asagida alt barin durumunu yayinliyor; kadro o durumda.
    this.workerRosterSource = snapshot;
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
    this.renderKillEvents(snapshot);
    this.renderDamageEvents(snapshot);
    this.recordClientPerfSection("events", performance.now() - sectionStart);
    sectionStart = performance.now();
    this.renderHud(snapshot);
    this.watchWaveClear(snapshot);
    this.observeAtlas(snapshot);
    this.updateWaveMusic(snapshot);
    this.refreshUpgradeReady(snapshot);
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
    if (!nextPath) {
      this.backgroundMusic = undefined;
      return;
    }
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

  private bindRoomHandlers(room: Room) {
    // Yeni baglanti: sonuc bu baglantinin ilk sonucsuz snapshot'indan once
    // gelirse istemci sonuctan sonra dondu, mac sonu sahnesi oynanmiyor.
    this.liveSinceBind = false;
    this.matchDebug = this.createMatchDebugSampler(room);
    room.onMessage("bomber:explode", (message: { x: number; y: number; radius: number; killed: boolean }) => {
      if (!message || ![message.x, message.y, message.radius].every(Number.isFinite) || message.radius <= 0) return;
      const diameter = Math.min(1000, message.radius * 2);
      const still = this.feedback?.reducedMotion ?? false;
      this.flashPool?.flash({ x: message.x, y: message.y, texture: "ring", tint: 0xff782e,
        alpha: message.killed ? 0.45 : 0.8, sizeFrom: still ? diameter : 10, sizeTo: diameter,
        durationMs: 420, bornAt: performance.now() });
    });
    // Yeni oda (ilk baglanti ya da yeniden baglanma): eski odanin isin
    // kimlikleri yeni odada baska isinlar olabilir.
    this.beamHitTracker.clear();
    room.onMessage("match:map", (map: EditableMapData) => this.syncMap(map));
    room.onMessage("creative:loadout", (loadout: CreativeLoadout) => {
      this.creativeLoadout = loadout;
      this.emitControlState();
    });
    // Ogretici: sunucunun olctugu, gercekten yapilmis eylem; adim motoruna gidiyor.
    room.onMessage("tutorial:progress", (progress: TutorialProgressMessage) => {
      // Ilk teslimat kalici bir olgu: "teslimat" adimi sonra gelse de goruyor.
      if (progress?.action === "ammoDelivered" && !this.tutorialAmmoDelivered) {
        this.tutorialAmmoDelivered = true;
        this.emitControlState();
      }
      this.game.events.emit("game:tutorial-progress", progress);
    });
    room.onMessage("enemy:spawn", (enemy: StaticEnemySnapshot) => this.staticEnemySnapshots.set(enemy.id, enemy));
    room.onMessage("tower:spawn", (tower: StaticTowerSnapshot) => {
      this.staticTowerSnapshots.set(tower.id, tower);
      // Sunucunun yerlestirme onayi: kule oynatmada belirince inecek. Zaten
      // cizili kule (yeniden baglananin kuleleri) yeniden kurulmadi; o inmez.
      if (!this.towers.has(tower.id)) {
        this.freshTowerSpawns.note(tower.id, performance.now());
      }
    });
    room.onMessage("tower:remove", (message: { id: string }) => {
      this.staticTowerSnapshots.delete(message.id);
      this.dynamicTowerSnapshots.delete(message.id);
      this.freshTowerSpawns.forget(message.id);
    });
    room.onMessage("projectile:spawn", (projectile: ProjectileSpawnSnapshot) => {
      // Zeynep: Taht'in atisi (dizilim), kopyalanan Hiza mermisi (istemci
      // kimligi, kendi mizragi) ve Abarti rayina varis. Kuleler gelen son
      // snapshot'tan.
      const latestTowers = this.snapshotBuffer[this.snapshotBuffer.length - 1]?.snapshot.towers;
      if (latestTowers) {
        const remapped = this.zeynepReceipt.noteProjectileSpawn(projectile, latestTowers, this.updateCourtContext(), performance.now());
        if (remapped) projectile.definitionId = remapped;
      }
      this.linearProjectileSnapshots.set(projectile.id, projectile);
      // Sahiplik atis aninda kulenin konumundan: takim arkadasinin kademe 3
      // eklentileri soluk, kendi kulen tam.
      if (this.projectileOwnership.size > 600) this.projectileOwnership.clear();
      const own = this.isOwnShotFrom(projectile.x, projectile.y);
      this.projectileOwnership.set(projectile.id, own);
      const definitionId = projectile.definitionId ?? "";
      const angle = Math.atan2(projectile.vy ?? 0, projectile.vx ?? 1);
      const recipe = getVfxTier(getVfxProfile(definitionId), projectile.tier);
      // Kademe 2+: namluda 80-120 ms'lik hazirlik vurusu. Atis mesaji oynatmadan
      // ~500 ms once geldigi icin hazirlik gercekten atistan once oynuyor.
      if (recipe.muzzle.anticipationMs > 0) {
        this.queueDelayedEffect(() => this.attackVfx?.emitAnticipation({
          x: projectile.x, y: projectile.y, angle, definitionId, tier: projectile.tier, own, key: projectile.id, bornAt: performance.now()
        }), recipe.muzzle.anticipationMs);
      }
      this.queueDelayedEffect(() => this.attackVfx?.emitMuzzle({
        x: projectile.x, y: projectile.y, angle, definitionId, tier: projectile.tier, own, key: projectile.id, bornAt: performance.now()
      }));
    });
    // Carpma cizimi her temasta (delip gecen ara temaslar dahil) ve her kulede:
    // profil kulenin carpma dilini, kademesini ve rengini veriyor. Eskiden
    // yalnizca alti kulenin temasi ciziliyordu, gerisi kaldirma mesajinda
    // ortak bir halka aliyordu.
    room.onMessage("projectile:contact", (message: ProjectileContactSnapshot) => {
      const own = this.projectileOwnership.get(message.id) ?? true;
      const key = `${message.id}@${message.x}:${message.y}`;
      const voice = resolveHitVoice(message.definitionId);
      const receivedAt = performance.now();
      // Zeynep'in delen mermileri: kertik dusmanin boyunda, temaslar tek ferman
      // cizgisinde. Kopyalanan Hiza mermisi Taht'in mizragi olarak.
      const linear = this.linearProjectileSnapshots.get(message.id);
      const definitionId = linear?.definitionId === TAHT_COPY_ID && message.definitionId === "zeynep-1" ? TAHT_COPY_ID : message.definitionId;
      const pierce = getVfxProfile(definitionId).silhouette === "lance";
      // Temasin dusmani ve carpma ani: carpma cizimi ve duran mermi o dusmana bagli.
      const anchor = this.createHitAnchor(message.x, message.y, receivedAt);
      // Yalnizca dogrusal mermi icin: kaldirma mesajini (`projectile:hit`) o gonderiyor, kayit orada siliniyor.
      if (anchor && linear) this.lastProjectileContact.set(message.id, { anchor, receivedAt });
      const size = pierce ? this.getEnemyBodySize(anchor ? this.snapshotBuffer[this.snapshotBuffer.length - 1]?.snapshot.enemies.find((enemy) => enemy.id === anchor.enemyId) : undefined) : undefined;
      this.queueDelayedEffect(() => {
        const at = this.getAnchoredHitPoint(anchor, message.x, message.y);
        this.attackVfx?.emitImpact({
          x: at.x,
          y: at.y,
          angle: message.angle,
          definitionId,
          tier: message.tier,
          own,
          key,
          radius: message.r,
          size,
          enemyId: anchor?.enemyId,
          bornAt: performance.now()
        });
        if (pierce) {
          this.zeynepSignatures?.emit({ kind: "pierce", key: message.id, x: at.x, y: at.y, angle: message.angle, definitionId, tier: message.tier, own }, performance.now());
        }
        // Vurus sesi carpmanin cizildigi anda; mesajin geldigi anda degil.
        // Sekme gizliyken biriken kuyruk donuste hep birden bosaliyor: o
        // gec carpmalar cizilir ama sessiz kalir.
        if (voice && isHitSoundFresh(receivedAt, performance.now(), this.playbackDelayMs)) {
          this.feedback?.playHit(voice, message.tier, own, key);
        }
      });
    });
    room.onMessage("projectile:hit", (message: ProjectileHitSnapshot) => {
      // Kaldirma ayri bir olay: carpma temastan cizildi, menzil sonunda bosa
      // giden mermi carpma cizmiyor.
      this.finishLinearProjectile(message);
      this.projectileOwnership.delete(message.id);
      // Mermi durdu: raya henuz varmadiysa (nabiz kaldirmadan sonraya tarihli) gecis yok.
      this.zeynepSignatures?.cancelCrossing(message.id, performance.now() + this.playbackDelayMs);
    });
    room.onMessage("snapshot:full", (snapshot: StaticSnapshot) => this.applyFullStaticSnapshot(snapshot));
    room.onMessage("snapshot", (snapshot: WireGameSnapshot) => this.queueSnapshot(snapshot));
    room.onMessage("structure:breach", (message: StructureBreachMessage) => this.showStructureBreach(message));
room.onMessage("enemy:frozen", (message: { x: number; y: number }) => this.showFreezeBurst(message.x, message.y));
    // Efsanevi vurus etkisi: ekrandaki dusman oynatma gecikmesi kadar geride, isaret de oyle.
    // Sunucu bir tikin olaylarini tek dizide yolluyor (`legendary:procs`).
    room.onMessage("legendary:procs", (messages: unknown) => {
      if (!Array.isArray(messages) || this.matchResultShown) return;
      const at = performance.now() + this.playbackDelayMs;
      for (const message of messages.slice(0, 64)) {
        const proc = sanitizeLegendaryProc(message);
        if (proc) this.legendaryProcs?.emit(proc, at);
      }
    });
room.onMessage("slow:critical", (message: { x: number; y: number }) => this.showSlowCritBurst(message.x, message.y));
    room.onMessage("flow:shift", (message: FlowShiftMessage) => this.showFlowShift(message));
    room.onMessage("ucube:choice", (message: { towerId: string; level: number }) => this.showUcubeChoice(message));
    room.onMessage("worker:hired", (message: { role?: HirableWorkerRole; advanced?: boolean; cost: number }) => {
      const role = message.role ? WORKER_ROLE_LABELS[message.role] : t("scene.worker.generic");
      const worker = message.advanced ? t("scene.worker.advanced", { role }) : role;
      this.showNotice(t("scene.worker.hired", { worker, cost: message.cost }));
    });
    room.onMessage("worker:specialization-choice", (message: { workerId: string; options: readonly { id: HirableWorkerRole; name: string; description: string }[] }) => {
      openChoiceDialog(
        t("scene.worker.specializationTitle"),
        [t("scene.worker.specializationBody")],
        // Secenek metinleri sunucunun kopyasi (Turkce); katalogdan dile gore.
        message.options.map(localizeWorkerSpecialization),
        (role) => this.room?.send("worker:specialization", { workerId: message.workerId, role }),
        // Rolsuz isci yeni alimi kilitliyor; oyuncu nereden devam edecegini bilmeli.
        () => this.showNotice(t("scene.worker.specializationSkipped"), 4200)
      );
    });
    room.onMessage("worker:skill-choice", (message: { workerId: string; tier: number; role: HirableWorkerRole; options: readonly [WorkerSkillChoice, WorkerSkillChoice]; legacy?: boolean }) => {
      if (message.legacy) return;
      const [first, second] = message.options.map(localizeWorkerSkillChoice);
      const dialog = openDefenseDialog(t("scene.worker.skillTitle", { role: WORKER_ROLE_LABELS[message.role], tier: message.tier + 1 }), [
        t("scene.worker.skillBody"),
        `\n${first.name}\n${first.description}\n\n${second.name}\n${second.description}`
      ]);
      const actions = dialog.querySelector("div:last-child");
      for (const option of [first, second]) {
        const button = document.createElement("button");
        button.textContent = option.name;
        button.style.cssText = "padding:10px 18px;color:#fff;background:#244664;border:1px solid #5c8dad;border-radius:8px;cursor:pointer";
        button.onclick = () => { dialog.close(); this.room?.send("worker:skill", { workerId: message.workerId, skillId: option.id }); };
        actions?.append(button);
      }
    });
    room.onMessage("worker:skill-complete", (message: { role?: HirableWorkerRole }) => this.showNotice(message.role ? t("scene.worker.skillCompleteRole", { role: WORKER_ROLE_LABELS[message.role] }) : t("scene.worker.skillComplete")));
    room.onMessage("match:victory", (message: MatchResultSummary) => this.handleMatchResult("victory", message));
    room.onMessage("match:defeat", (message: MatchResultSummary) => this.handleMatchResult("defeat", message));
    room.onMessage("card:choices", (cards: CardDefinition[]) => this.showCardChoices(cards));
    // Elden once gelir; perde aciksa (ret sonrasi) dugme hemen tazelenir.
    room.onMessage("card:rerollState", (message: { remaining?: number }) => {
      this.cardRerollsRemaining = Math.max(0, Math.floor(Number(message?.remaining) || 0));
      this.updateCardRerollButton();
    });
    room.onMessage("tower:stats", (block: TowerStatsWire) => this.receiveTowerStats(block));
    room.onMessage("tower:preview", (preview: TowerPreview) => {
      const pending = this.pendingPreview;
      if (!pending || pending.requestId !== preview.requestId || !pending.dialog.isConnected) return;
      this.pendingPreview = undefined;
      // Sunucunun metinleri Turkce; secili dilde anahtar ve kimliklerden (`server-text`).
      const text = localizeTowerPreview(preview);
      openDefenseDialog(text.title ?? t("scene.preview.fallbackTitle"), text.error ? [text.error] : [...(text.lines ?? []), "", text.description ?? ""], text.error ? undefined : pending.apply, text.error ? undefined : preview.changed);
    });
    room.onMessage("defense:summary", (summary: DefenseSummary) => {
      this.latestDefenseSummary = summary;
      this.emitControlState();
      this.refreshWaveReportCard();
    });
    // Takimin dalga karnesi: kart seciminden hemen once, dalga basina bir kez
    // (yeniden baglanmada tekrar). Karne kart perdesinin basliginda.
    room.onMessage("wave:report", (record: unknown) => {
      if (this.waveReports.receiveReport(record)) this.refreshWaveReportCard();
      if (this.badgeWatch.noteWave(record)) this.recordWaveBadges();
    });
    room.send("defense:request");
    room.onMessage("card:applied", (message: { cardId?: string; towerIds?: string[] }) => this.receiveCardApplied(message));
    room.onMessage("card:rejected", (message: { reason?: string; key?: string }) => {
      // Sunucunun gerekcesi Turkce; anahtari varsa secili dilde, yedek dile bakiyor.
      this.cardRerollRequested = false;
      this.setCardChoicePending(false, localizeServerText(message.reason, message.key) ?? t("scene.card.rejected"));
    });
    // Atama reddi: istemci tukenmis kaynagi kendisi de reddediyor, buraya
    // kaynak dokunus ile istek arasinda tukenirse dusuluyor.
    room.onMessage("worker:rejected", (message: { reason?: string; key?: string }) => {
      this.showNotice(localizeServerText(message?.reason, message?.key) ?? t("server.worker.nodeDepleted"));
    });
    // Sunucunun yerlestirme reddi (kurulum yasak bolge): onizleme atlatildiysa.
    room.onMessage("placement:rejected", (message: { message?: string; key?: string; x?: number; y?: number }) => {
      // Beden varinca kare doluydu: o karenin hayaleti de gidiyor (altin iade edildi).
      this.dropPendingPlacementAt(message?.x, message?.y);
      this.showNotice(localizeServerText(message?.message, message?.key) ?? t("scene.place.forbiddenZone"));
    });
    // Operator bedeninin isi varista gecersizdi ya da kuyruk dolu: kisa not.
    room.onMessage("body:task-failed", (message: { message?: string; key?: string }) => {
      // Geri cekilme butun kuyrugu iptal etti: bekleyen hayaletler de gidiyor.
      if (message?.key === "body.retreated") this.clearPendingPlacement();
      this.showNotice(localizeServerText(message?.message, message?.key) ?? t("server.body.repairFailed"));
    });
    // Duvar cizgisi ozeti: parca atlandiysa neden kisaca soyleniyor. Hicbiri
    // kurulamadiysa sunucu `placement:rejected` yolluyor, burada susuyoruz.
    room.onMessage("wall:line-result", (message: { placed?: number; skipped?: number }) => {
      const placed = Number(message?.placed);
      const skipped = Number(message?.skipped);
      if (Number.isFinite(placed) && Number.isFinite(skipped) && placed > 0 && skipped > 0) {
        this.showNotice(t("scene.line.result", { placed, skipped }));
      }
    });
    room.onMessage("shop:placement-required", (message: { itemId?: "bariyer" | "ziftli-zemin" }) => {
      this.pendingShopPlacement = message.itemId;
      this.cancelExecuteTargeting();
      this.showNotice(message.itemId === "bariyer" ? t("scene.shop.pickBarrierTile") : t("scene.shop.pickTarTile"));
    });
    // Sunucu bu onaylari yalnizca yapan oyuncuya yolluyor; hepsi ayni
    // yoldan geciyor: toast, yonetmen sesi, kule varsa atim.
    room.onMessage("shop:purchased", (message: ShopPurchasedMessage) => this.confirmServerAction(getShopPurchaseCue(message, {
      equippableTowers: message?.toInventory ? this.countEquippableLocalTowers(message.itemId) : 0,
      // Kare isteyen esyanin talimati onaydan hemen once geldi; onay onu ezmesin.
      placementPending: Boolean(message?.itemId) && this.pendingShopPlacement === message.itemId
    })));
    room.onMessage("inventory:equipped", (message: InventoryEquippedMessage) => {
      this.confirmServerAction(getInventoryEquipCue(message, this.findTowerName(message?.towerId)));
    });
    room.onMessage("inventory:equip-rejected", (message: InventoryEquipRejectedMessage) => this.confirmServerAction(getInventoryEquipRejectedCue(message, { creative: this.creativeMode })));
    room.onMessage("structure:repaired", (message: StructureRepairedMessage) => {
      this.confirmServerAction(getStructureRepairCue(message, this.findTowerName(message?.towerId)));
    });
    // "Tumunu Onar": tek toast ve tek ses; atim her onarilan kuleye.
    room.onMessage("structure:repairedAll", (message: StructureRepairedAllMessage) => {
      const cue = getStructureRepairAllCue(message);
      if (!cue) return;
      this.confirmServerAction(cue);
      for (const towerId of (Array.isArray(message.towerIds) ? message.towerIds : []).slice(0, 12)) {
        if (typeof towerId === "string") this.pulseConfirmedTower(towerId, "repair");
      }
    });
    room.onMessage("ultimate:upgraded", (message: UltimateUpgradedMessage) => this.confirmServerAction(getUltimateUpgradeCue(message)));
    // Ulti karnesi yalnizca atana; takim arkadaslarina tek satirlik cip.
    room.onMessage("ultimate:result", (message: UltimateResultMessage) => this.receiveUltimateResult(message));
    room.onMessage("ultimate:cast", (message: UltimateCastMessage) => this.receiveTeamUltimate(message));
    // AttackLord'un Execute'u: infaz herkese (gorsel), red yalnizca atana.
    room.onMessage("skill:execute", (message: SkillExecuteMessage) => this.receiveSkillExecute(message));
    room.onMessage("skill:rejected", (message: SkillRejectedMessage) => this.receiveSkillRejected(message));
    // Sunucu baska birinin kulesine baglanabiliyor: tek seferlik mesaj.
    room.onMessage("link:joined", (message: ServerLinkJoinedMessage) => this.receiveServerLinkJoined(message));
    // Riskli Yatirim takimda dalga basina bir kez ve bedeli takimin nexusundan.
    room.onMessage("shop:risky-investment", (message: RiskyInvestmentMessage) => this.receiveRiskyInvestment(message));
    // Sonucu degistiren kombolar: tek seferlik mesaj, damga kulenin ustunde.
    room.onMessage("combo:stamp", (message: ComboStampMessage) => this.receiveComboStamp(message));
    room.onMessage("champion:down", (message: ChampionDownMessage) => this.receiveChampionDown(message));
    // Karsi atak yapilari vurdu: yapi basina bir kez, mesaj temizlenerek okunuyor.
    room.onMessage("surge:hit", (message: unknown) => this.receiveSurgeHit(message));
    // Irk mekanikleri: meka kalkaninin durdurdugu atislar ve ruh cekicinin izi.
    room.onMessage("race:block", (message: unknown) => this.receiveMekaShieldBlock(message));
    room.onMessage("race:soul", (message: unknown) => this.receiveSoulDraw(message));
    // Siper dalgasi atislari durdurdu: seyrek mesaj, carpma isaretleri on cizgide.
    room.onMessage("surge:block", (message: unknown) => this.receiveSurgeBlock(message));
    room.onMessage("worker:development-unlocked", (message: WorkerDevelopmentUnlockedMessage) => this.confirmServerAction(getWorkerDevelopmentCue(message)));
    room.onMessage("latency:pong", (message: { sentAt?: number; serverProcessingMs?: number; bufferedAmount?: number }) => this.updatePing(message));
    room.onMessage("perf:snapshot", (perf: ServerPerfSnapshot) => {
      this.latestServerPerf = perf;
      runTelemetry.noteServerTick(perf?.tickMs, perf?.tickMaxMs);
      if (this.latestPerfSnapshot) this.latestPerfSnapshot.perf = perf;
    });
    // Sunucu bozulan odayi kapatiyor: yeniden baglanmayi denemenin anlami yok.
    room.onMessage("room:error", (message: { message?: string; key?: string }) => {
      this.roomAbortedId = room.roomId;
      clearMatchReconnect(room.roomId);
      // Sunucunun metni Turkce; anahtari varsa secili dilde, yedek dile bakiyor.
      const text = localizeServerText(message?.message, message?.key) ?? t("scene.room.serverError");
      this.showNotice(text, 8000);
      this.emitHudState({ status: text });
    });
    room.onLeave((code) => {
      if (this.room !== room) return;
      // Oyuncu menuye donuyor: kendi istegiyle ciktik, yeniden baglanma yok.
      if (this.leavingRoom) return;
      if (this.roomAbortedId === room.roomId) {
        clearActiveLobbyRoom(room.roomId);
        return;
      }
      // Rapor ekranda ve kosunun raporu gelip islendi: bitmis odaya 18 sn
      // yeniden baglanmaya calismanin bir getirisi yok (sunucu yeni bir oda
      // kurulurken bitmis odayi kapatiyor). Rapor DOM'da, kapanan soketten
      // etkilenmiyor. Rapor henuz gelmediyse baglanti yine deneniyor.
      if (this.matchResultShown && this.matchReport?.run) {
        clearActiveLobbyRoom(room.roomId);
        clearMatchReconnect(room.roomId);
        return;
      }
      void this.reconnectRoom(room, code);
    });
  }

  private finishLinearProjectile(message: { id: string; x: number; y: number }) {
    const projectile = this.linearProjectileSnapshots.get(message.id);
    this.linearProjectileSnapshots.delete(message.id);
    // Ayni tikin temasi (varsa; ayni mesaj kumesiyle gelmis) kaldirmanin dusmani: duran mermi o dusmana bagli.
    const last = this.lastProjectileContact.get(message.id);
    this.lastProjectileContact.delete(message.id);
    const contact = last && performance.now() - last.receivedAt < SAME_TICK_MESSAGE_MS ? last.anchor : undefined;
    if (!projectile) return;
    this.terminalProjectileSnapshots.set(message.id, {
      // Keep the authoritative impact position through the interpolation delay,
      // then let the normal projectile renderer remove it on the next frame.
      // Velocity stays: it sets the drawn direction, and a zeroed copy was
      // drawn as a horizontal body just before vanishing.
      projectile: getTerminalProjectileSnapshot(projectile, message.x, message.y),
      removeAfter: performance.now() + this.playbackDelayMs + 50,
      // Merminin kendi konumu (temas noktasi degil) dusmana gore.
      anchor: contact ? { ...contact, x: message.x, y: message.y, offsetX: 0, offsetY: 0, state: "pending" } : undefined
    });
  }

  /**
   * Suren macin yeniden baglanma anahtarini sekmeye yazar. Sayfa yenilenirse
   * menu once bu anahtarla ayni yuvaya donmeyi deniyor (bkz. `menu-ui`).
   */
  private rememberMatchReconnect(room: Room) {
    if (this.matchResultShown) return;
    saveMatchReconnect(room, {
      mode: this.startedFromLobby ? "online" : "solo",
      characterId: this.selectedCharacterId,
      // Solo odaya `create`te verilen ad ve sahip sirri; pencereden sonra
      // donuste sunucu yuvayi yalnizca sirri gosterene veriyor.
      playerName: this.startedFromLobby ? undefined : this.selectedCharacter.displayName,
      ownerSecret: this.startedFromLobby ? undefined : this.soloOwnerSecret,
      mapScale: this.runMapScale,
      stage: this.selectedStage
    });
  }

  private async reconnectRoom(disconnectedRoom: Room, code: number) {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.setCardChoicePending(true, t("scene.reconnect.renewing"));
    this.emitHudState({ status: t("scene.status.reconnecting") });
    const client = getSharedClient(gameServerUrl);
    const deadline = Date.now() + 18_000;

    while (Date.now() < deadline) {
      try {
        const room = await client.reconnect(disconnectedRoom.reconnectionToken);
        this.room = room;
        this.localSessionId = room.sessionId;
        setActiveLobbyRoom(room);
        this.bindRoomHandlers(room);
        room.send("snapshot:requestFull");
        room.send("card:sync");
        this.rememberMatchReconnect(room);
        this.reconnecting = false;
        this.setCardChoicePending(false, t("scene.reconnect.renewed"));
        this.emitHudState({ status: `#${room.roomId}` });
        return;
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    }

    this.reconnecting = false;
    clearActiveLobbyRoom(disconnectedRoom.roomId);
    clearMatchReconnect(disconnectedRoom.roomId);
    this.setCardChoicePending(false, t("scene.reconnect.failed"));
    this.emitHudState({ status: t("scene.status.disconnected", { code }) });
  }

  /**
   * Sonuc: once rekor kaydi, sonra kosu raporu.
   *
   * Sonuc uc yoldan geliyor -- raporlu `match:*` mesaji, sonucu tasiyan her
   * snapshot ve yeniden baglanmada ya da `run:sync` ile tekrar gelen mesaj.
   * Kapi (`MatchResultLatch`) ekrani bir kez aciyor, kaydi kosu basina bir kez
   * yazdiriyor ve rapor ekrandan sonra geldiyse acik ekrani bir kez tazeliyor.
   * Kayit modulunun kendi kimlik kontrolu de var; ikisi birlikte ayni kosunun
   * iki kez sayilmasini engelliyor.
   */
  private handleMatchResult(result: "victory" | "defeat", summary: MatchResultSummary) {
    runTelemetry.end(result, summary.run);
    // Bitmis maca yeniden yuklemede donulmuyor; rapor kaydi zaten yazildi.
    if (this.room) clearMatchReconnect(this.room.roomId);
    const step = this.matchResultLatch.receive({ run: summary.run });
    if (step.record) this.recordRunResult(summary);
    // Dugmeye rapor gelmeden basilmisti: kayit yukarida (esanli) yazildi,
    // bekleyen yeniden yukleme simdi. Tazelemeden once, yoksa yeniden cizim
    // basilmis dugmeyi yeniden acardi.
    if (this.runReportReloadPending && !this.matchResultLatch.awaitingRun) {
      this.reloadAfterLeavingRoom();
      return;
    }
    if (step.open) {
      this.beginMatchEnd(result, summary);
    } else if (step.refresh && this.matchEndReport && summary.run) {
      // Mac sonu sahnesi oynarken rapor geldi: bekleyen rapora yaziliyor,
      // sahne bitince rapor onunla aciliyor.
      const pending = this.matchEndReport;
      pending.summary = { ...pending.summary, run: summary.run, creative: pending.summary.creative === true || summary.creative === true || summary.run.creative === true ? true : pending.summary.creative };
    } else if (step.refresh && this.matchReport && summary.run) {
      this.matchReport.run = summary.run;
      // Bayrak yalnizca acilabiliyor, kapanmiyor: rapor yaratici diyorsa
      // ekran da yildizsiz ve "kaydedilmez" satiriyla ciziliyor.
      if (summary.creative === true || summary.run.creative === true) this.matchReport.creative = true;
      this.renderMatchReport(false);
    }
  }

  /**
   * Mac sonu sahnesi, sonra rapor. Sahne yalnizca maci bu baglantida canli
   * goren istemcide; sonuctan sonra giren ya da yeniden baglanan raporu hemen
   * goruyor. ATLAS'in son satiri sahnenin basinda (yonetmenin kapisi satiri
   * kosu basina bir kez caliyor; raporun acilisindaki cagri o zaman bos
   * donuyor). Sunucuya mesaj yok: oynanis bitti. Kare dongusu durursa
   * (gizli sekme) rapor bir guvenlik zamanlayicisiyla yine aciliyor.
   */
  private beginMatchEnd(result: "victory" | "defeat", summary: MatchResultSummary) {
    if (this.matchResultShown || this.matchEndReport) return;
    if (!shouldPlayMatchEndSequence({ liveSnapshotSeen: this.liveSnapshotSeen, liveSinceBind: this.liveSinceBind })) {
      this.openRunReport(result, summary);
      return;
    }
    this.matchEndReport = { result, summary };
    this.hideArenaHudOverlays();
    this.hideCardChoices();
    // Acik kademe secimi (ZentaX) ve halkasi sahnenin ustunde kalmasin.
    this.hideZeynepTierChoicesIfOpen();
    this.cancelTowerDrag();
    const stage = this.matchEndStage ?? new MatchEndStage(this, {
      flash: this.flashPool,
      lod: this.vfxLod,
      reducedMotion: () => this.feedback?.reducedMotion ?? false,
      playSample: (cue, key) => this.feedback?.playSampleCue(cue.family, cue.rate, cue.gain, key),
      shake: (px, durationMs) => this.feedback?.shakeCamera({ own: true, priority: 0, px, durationMs })
    });
    this.matchEndStage = stage;
    const cellSize = this.getMapCellSize();
    const structures: MatchEndStructure[] = [];
    for (const tower of this.towerSnapshots.values()) {
      // Zaten yikik yapi patlamiyor, gucunu de devretmiyor.
      if (tower.hp !== undefined && tower.hp <= 0) continue;
      structures.push({
        id: tower.id,
        x: tower.x,
        y: tower.y,
        size: getTowerBodySize(tower.definitionId, cellSize * getTowerGridSpan(tower.definitionId)),
        wall: this.isEdgePlacedDefinition(tower.definitionId)
      });
    }
    const enemies = [...this.enemies.entries()].map(([id, enemy]) => ({ id, x: enemy.sprite.x, y: enemy.sprite.y, size: enemy.displaySize ?? 30 }));
    const plan = stage.play({
      kind: result,
      structures,
      nexus: this.getMatchEndNexus(),
      nexusSize: cellSize * 2,
      enemies,
      skyY: getMapWorldBounds(this.selectedMapData).top - cellSize * 8,
      cameraEase: true,
      now: performance.now(),
      speak: () => {
        const atlas = this.atlas;
        if (!atlas) return undefined;
        atlas.matchEnded(result);
        return atlas.playingCategory === (result === "victory" ? "ending" : "death") ? getAtlasLineSeconds(atlas.playingUrl) : undefined;
      },
      openReport: () => this.finishMatchEnd()
    }).schedule;
    window.clearTimeout(this.matchEndSafetyTimer);
    this.matchEndSafetyTimer = window.setTimeout(() => this.matchEndStage?.current?.finish(), (plan?.reportAtMs ?? 0) + MATCH_END_TIMING.safetyMarginMs);
    // Yenilgiyi bir operator bedeni getirdi: beden sahnenin ilk patlamasi
    // (yapilarla ayni dil), yeri sunucunun en son bildirdigi konum.
    if (result === "defeat" && summary.bodyOwnerId) {
      const body = this.snapshotBuffer[this.snapshotBuffer.length - 1]?.snapshot.bodies?.find((entry) => entry.id === summary.bodyOwnerId)
        ?? this.operatorBodyView?.position(summary.bodyOwnerId);
      if (body) stage.vfx.detonate(body.x, body.y, OPERATOR_BODY_DISPLAY_SIZE * (cellSize / TOWER_GRID_SIZE) * 1.6, "tower", performance.now(), 3);
    }
  }

  /** Sahnenin tek cikisi: bekleyen rapor bir kez aciliyor. */
  private finishMatchEnd() {
    window.clearTimeout(this.matchEndSafetyTimer);
    this.matchEndSafetyTimer = undefined;
    const pending = this.matchEndReport;
    this.matchEndReport = undefined;
    if (pending) this.openRunReport(pending.result, pending.summary);
  }

  /** Nexus kareleri ortasi; harita nexus'suzsa alt kenarin ortasi. */
  private getMatchEndNexus() {
    const points = getMapPoints(this.selectedMapData, "nexus");
    if (points.length === 0) {
      const bounds = getMapWorldBounds(this.selectedMapData);
      return { x: bounds.left + bounds.width / 2, y: bounds.bottom - this.getMapCellSize() / 2 };
    }
    let x = 0;
    let y = 0;
    for (const point of points) {
      const world = gridToWorld(point.col, point.row, this.selectedMapData);
      x += world.x;
      y += world.y;
    }
    return { x: x / points.length, y: y / points.length };
  }

  /**
   * Mac sonu sahnesinin karesi: adimlar, cizim ve sahnenin yapilara ve
   * dusmanlara yazdigi hal. Snapshot cizimi tonu ve alfayi her geliste
   * yeniden yaziyor; bu cagri ondan sonra (ayni karede) geliyor.
   */
  private updateMatchEnd(now: number) {
    const stage = this.matchEndStage;
    if (!stage) return;
    stage.update(now);
    for (const [id, tower] of this.towers) {
      const state = stage.structureState(id);
      if (!state) continue;
      tower.base.setTint(state === "husk" ? MATCH_END_HUSK_TINT : MATCH_END_POWERED_DOWN_TINT);
      tower.base.setAlpha(state === "husk" ? 0.92 : 0.72);
      tower.halo.setVisible(false);
      tower.healthBar.setVisible(false);
      // Kenar yapisinin govdesi bu yuzeyde: patlayan duvarin yerinde enkaz kaliyor.
      if (state === "husk") tower.effect.setVisible(false);
    }
    for (const [id, enemy] of this.enemies) {
      const alpha = stage.enemyAlpha(id);
      if (alpha >= 1) continue;
      enemy.sprite.setAlpha(alpha);
      enemy.healthBar?.setVisible(false);
      enemy.shieldHalo?.setVisible(false);
      enemy.marker?.setVisible(false);
    }
  }

  /**
   * Kosu raporunu acar; Phaser katmanindaki eski sonuc ekraninin yerinde.
   *
   * Ilerleme zaferle birlikte yaziliyor. Asama sunucudan geliyor: istemcinin
   * kendi sectigi degeri yazmasi, reddedilmis bir istekten sonra olmayan bir
   * asamayi, baskasinin odasinda ise yanlis asamayi acardi. Menudeki secime
   * bilerek dusulmuyor; asama bilinmiyorsa kayit hic yazilmiyor.
   *
   * Yaratici bayragi uc kaynaktan birlestiriliyor ve biri acik diyorsa acik
   * sayiliyor: yanlislikla yazilmis bir kayit geri alinamaz.
   */
  private openRunReport(result: "victory" | "defeat", summary: MatchResultSummary) {
    if (this.matchResultShown) {
      return;
    }
    this.matchResultShown = true;
    // ATLAS'in son satiri: yalnizca maci canli oynayan istemcide (sonuctan
    // sonra giren oyuncu bu yenilgiyi/zaferi yasamadi). Kapi kosu basina bir kez.
    if (this.liveSnapshotSeen) this.atlas?.matchEnded(result);
    this.runReportOpenedAt = performance.now();
    this.hideArenaHudOverlays();
    // Acik bir kart perdesi raporun altinda kalip zamanlayicilarini
    // surdurmesin; mac bitti, secim artik bir sey degistirmiyor.
    this.hideCardChoices();
    const stage = this.roomStage ?? summary.stage;
    const tutorial = summary.tutorial === true || this.isTutorialRun();
    const creative = summary.creative === true || summary.run?.creative === true || this.creativeMode || tutorial;
    // Bounty Board: oynanis bitti, skor bir kez. Yaratici kosu skor tasimiyor;
    // canli baslamamis kosuda kopru hicbir sey yollamiyor.
    arcade.gameOver(creative ? 0 : getArcadeRunScore({ stage, wave: summary.wave }));
    // Mac bittikten sonra giren istemci (ilk snapshot sonucu tasiyordu) bu
    // zaferi oynamadi: asama onun yolunda acilmamali.
    const stageResult = result === "victory" && this.liveSnapshotSeen ? markStageCleared({ creative, stage }) : undefined;
    this.matchReport = { result, summary, run: summary.run, creative, tutorial, stage, stageResult };
    this.renderMatchReport(true);
  }

  /**
   * Kosuyu rekorlara ve kosu kaydina yazar; sayfada bir kez.
   *
   * Kapi (yaratici, asama, kilitli asama) kayit modulunde. Asama ve yaratici
   * bayragi asama ilerlemesiyle ayni kaynaktan: odanin asamasi ve iki
   * kaynaktan birlesmis bayrak.
   *
   * Sahne maci hic sonucsuz gormediyse (ilk snapshot sonucu tasiyordu)
   * istemci odaya mac bittikten sonra girdi: ne rekor ne arsiv sayaci. Sunucu
   * bitmis maca girisi zaten reddediyor; bu ikinci savunma hatti.
   */
  private recordRunResult(message: MatchResultSummary) {
    if (!message.run || this.runRecordOutcome || !this.liveSnapshotSeen) return;
    const run = message.run;
    const creative = message.creative === true || run.creative === true || this.creativeMode || this.isTutorialRun();
    const slot = this.getRunLocalSlot(run);
    this.runRecordOutcome = recordRun(
      run,
      { creative, stage: this.roomStage ?? message.stage },
      { slot, characterId: this.selectedCharacterId }
    );
    // Arsivin "kac kosuda secildi" sayaci rekor kapisina bagli degil: co-op'ta
    // kilitli asamada da kartlari sen sectin. Yalnizca yaratici kosu disarida.
    recordArchiveRunResult(getArchiveRun(run, { slot, creative: creative || this.isArchiveSandbox() }));
    // Nisan ve ustalik rekor ve arsivden sonra: "Her Cephede" bu temizlemeyi,
    // "Arşivci" bu kosunun kartlarini gormeli. Kapi kayit modulunde.
    this.runProgressOutcome = recordRunProgress({
      run,
      creative: creative || this.isArchiveSandbox(),
      stage: this.roomStage ?? message.stage,
      live: this.liveSnapshotSeen,
      local: { slot, characterId: this.selectedCharacterId },
      watch: this.badgeWatch
    });
    if (this.runProgressOutcome) this.badgeNotices.push(this.runProgressOutcome.badges);
    // Rekor, arsiv, nisan ve ustalik yazildi: Bounty Board'da bulut kaydi hemen gitsin.
    arcade.flushStorage();
  }

  /**
   * Dalga sonu nisanlari: karne geldi (dalga molasi, kart perdesinden hemen
   * once). Yeni nisan depoya yaziliyor ve kuyruga giriyor; bildirim kart
   * perdesinde ya da bir sonraki temizleme damgasinda, dalga ortasinda hic.
   * Kapi (yaratici, asama, kilitli asama, canli mac) depo modulunde.
   */
  private recordWaveBadges() {
    if (this.matchResultShown) return;
    const stage = this.roomStage;
    // Canli dalga bilinmiyorsa karne katilirken yeniden gonderilendir: nisan yok.
    if (stage === undefined || this.badgeWatch.firstLiveWave === undefined) return;
    const characterId = this.localPlayerSnapshot?.characterId ?? this.selectedCharacterId;
    const fresh = recordWaveBadges(
      this.badgeWatch.buildFacts({ characterId, stage }),
      { creative: this.creativeMode || this.isArchiveSandbox(), stage, live: this.liveSnapshotSeen }
    );
    this.badgeWatch.noteAwarded(fresh);
    this.badgeNotices.push(fresh);
  }

  /**
   * Arsive yazilmayan kosu: menude yaratici istendi ya da sunucu bayragi acik.
   * Biri acik diyorsa acik; yanlislikla gorulmus yazilan kart geri alinamaz.
   */
  private isArchiveSandbox() {
    return this.creativeRequested || this.creativeMode || this.isTutorialRun();
  }

  /**
   * Ogretici kosusu: menuden istendi ya da sunucu bayragi acik. Biri acik
   * diyorsa acik; ogretici hicbir ilerleme (asama, rekor, arsiv, nisan,
   * ustalik, Bounty Board skoru) yazmiyor.
   */
  private isTutorialRun() {
    return this.tutorialRequested || this.tutorialMode;
  }

  /**
   * Adim motorunun istegi (tutorial.ts, `game:tutorial-command`). Yalnizca
   * sunucu ogretici bayragini actiktan sonra ve mac surerken; sunucu kapisi
   * (`MESSAGE_RULES`) zaten ogretici disinda hicbir seyi kabul etmiyor.
   */
  private handleTutorialCommand(command: TutorialCommand) {
    const room = this.room;
    if (!room || !this.tutorialMode || this.matchResultShown || !command) return;
    switch (command.type) {
      case "prepare":
        if (!isTutorialPrepareId(command.step)) return;
        // Kapatilmis vitrin yeniden istenince gorunsun: kapatma dalgaya bagli
        // ve ogreticide dalga sayaci ilerlemiyor.
        if (command.step === "shop") this.shopDismissedWave = 0;
        room.send("tutorial:prepare", { step: command.step });
        return;
      case "continue":
        if (this.latestPerfSnapshot?.setupPhase) room.send("wave:continue", {});
        return;
      case "complete":
        room.send("tutorial:complete", {});
        return;
      case "closeShop":
        // Magaza adimi gecildi: vitrin "Mağazayı Kapat" ile ayni yoldan kapaniyor.
        this.shopDismissedWave = this.latestPerfSnapshot?.team.wave ?? 0;
        this.emitControlState();
        return;
      default:
        return;
    }
  }

  /** Raporda yerel oyuncunun yuvasi: snapshot'taki, yoksa operatorden. */
  private getRunLocalSlot(run: RunSummary | undefined) {
    const local = this.playerSnapshots.find((player) => player.id === this.localSessionId);
    return resolveLocalRunSlot(run, { hasSnapshot: Boolean(local), snapshotSlot: local?.slot, characterId: this.selectedCharacterId });
  }

  /** Tekrar niyetinin kipi: yaratici, lobiden gelen oda (co-op) ya da solo. */
  private getQuickStartMode(creative: boolean): QuickStartMode {
    if (creative) return "creative";
    return this.startedFromLobby ? "online" : "solo";
  }

  /**
   * Raporu ciz. Ilk cizimde (hareket azaltma kapaliysa) canlaniyor ve acilis
   * sesi caliyor; rapor sonradan gelirse ayni kart hareketsiz yeniden
   * ciziliyor ve yalnizca rekor rozeti yeniyse onun kisa tinisi caliyor.
   */
  private renderMatchReport(first: boolean) {
    const report = this.matchReport;
    if (!report) return;
    const outcome = this.runRecordOutcome;
    // Depoya yazilamayan kayit kutlanmiyor: bos deftere karsi yapilan
    // birlestirme her kosuda ayni "ilk temizleme"yi yeniden kutlardi. Kosunun
    // olgulari (yildizlar temiz dalgadan) ve "saklanamadı" satiri kaliyor.
    const merge = outcome?.status === "recorded" && outcome.saved ? outcome.merge : undefined;
    const cleared = getClearedStages();
    const reducedMotion = this.feedback?.reducedMotion ?? false;
    const view = buildRunReportView({
      result: report.result,
      wave: report.summary.wave,
      kills: report.summary.kills,
      stage: report.stage,
      creative: report.creative,
      // Kule adlari secili dilde (tanim kimligiyle katalogdan).
      run: localizeRunSummary(report.run),
      localSlot: this.getRunLocalSlot(report.run),
      merge,
      ultimate: this.bestOwnUltimate,
      finale: isFinaleClear({ result: report.result, stage: report.stage, creative: report.creative, clearedStageIds: cleared }),
      fallbackCardIds: this.localPlayerSnapshot?.ownedCardIds
    });
    if (report.tutorial) {
      // Ogreticide asama ve dalga sayaci anlamsiz (sayac hic ilerlemiyor,
      // zafer adimlarla geliyor): baslik ve kahraman egitimin, dalga seridi yok.
      view.heading = { tone: view.heading.tone, eyebrow: t("scene.report.tutorialEyebrow"), title: view.heading.title };
      view.hero = { kind: "wave", text: t("scene.report.tutorialHero") };
      view.strip = [];
    }
    // Ogretici raporunda yalnizca "Ana Menü": Tekrar ve Sonraki aşama normal
    // kosu baslatirdi, ogreticinin devami degil.
    const actions = report.tutorial ? { primary: "retry" as const } : planRunReportActions({
      result: report.result,
      stage: report.stage,
      mode: this.getQuickStartMode(report.creative),
      characterId: this.selectedCharacterId,
      // `selectedMapData` burada sunucunun arenasi ve olcegi hep 1; oynanan
      // olcek sahneye verilen haritadan saklandi.
      mapScale: this.runMapScale,
      clearedStageIds: cleared,
      now: Date.now()
    });
    const notes: RunReportNote[] = [];
    if (report.stageResult?.unlockedStage) {
      notes.push({ tone: "unlock", text: t("scene.report.stageUnlocked", { stage: report.stageResult.unlockedStage }) });
    }
    if (report.tutorial) {
      notes.push({ tone: "dim", text: t("scene.report.tutorialNoProgress") });
    } else if (report.creative) {
      // Yaratici kosu sessizce kaydedilmiyor olsaydi oyuncu acilis ya da rekor
      // bekleyip bulamazdi; nedenini soluk bir satir soyluyor.
      notes.push({ tone: "dim", text: t("scene.report.creativeNoProgress") });
    } else if (!this.liveSnapshotSeen) {
      // Rapor baskasinin kosusu: sessizce kaydedilmiyor olsaydi oyuncu rekorunu arardi.
      notes.push({ tone: "dim", text: t("scene.report.joinedLate") });
    } else if (report.stageResult?.locked || (outcome?.status === "skipped" && outcome.reason === "locked")) {
      // Co-op'ta katilan oyuncunun henuz acmadigi asama: kayit yazilmadi.
      // Yenilgide asama isaretlenmiyor; kilidi rekor kapisi soyluyor.
      notes.push({ tone: "dim", text: t("scene.report.stageLocked") });
    } else if (outcome?.status === "recorded" && !outcome.saved) {
      notes.push({ tone: "dim", text: t("scene.report.notSaved") });
    }
    const summary = this.latestDefenseSummary;
    renderRunReport({
      view,
      actions,
      notes,
      animate: first && !reducedMotion,
      // Odak hareketten bagimsiz: hareket azaltan ekran okuyucu kullanicisi
      // da diyaloga tasinmali. Tazelemede odak oldugu yerde kaliyor.
      focus: first,
      // Rapor kendiliginden aciliyor; HUD'a yapilan son dokunus dugmeye
      // inmesin. Hareket ayarindan bagimsiz: kaza dokunusu canlanmayla ilgili degil.
      actionableAt: this.runReportOpenedAt + RUN_REPORT_ACTIONABLE_AFTER_MS,
      onChoice: (choice) => this.chooseRunReportAction(choice),
      progress: this.buildRunReportProgress(report.creative),
      stamp: this.cosmetics.stamp,
      // Ogreticide "son dalganin savunma ozeti" yok: dalga numarasi anlamsiz.
      onDefenseSummary: summary && !report.tutorial
        ? () => openDefenseDialog(t("scene.defense.title", { wave: summary.wave }), defenseSummaryLines(summary))
        : undefined
    });

    // Yeni nisan ya da ustalik seviyesi de rozet tinisini caliyor (bir kez);
    // ses yonetmenden, ayri bir ses yok.
    const progressMoment = (this.runProgressOutcome?.badges.length ?? 0) > 0 || this.runProgressOutcome?.mastery?.levelUp === true;
    const celebrated = view.badge?.celebrated === true || progressMoment;
    for (const cue of getRunReportCues({ result: report.result, celebrated, reducedMotion })) {
      if (cue.kind === "reportRecord") {
        if (this.runReportRecordCuePlayed) continue;
        this.runReportRecordCuePlayed = true;
      } else if (!first) {
        continue;
      }
      // Tazelemede rozet hareketsiz ve hemen gorunuyor; tini da beklemiyor.
      const delay = first ? cue.atMs : 0;
      const timer = window.setTimeout(() => {
        this.runReportCueTimers = this.runReportCueTimers.filter((entry) => entry !== timer);
        this.feedback?.playSfx(cue.kind);
      }, delay);
      this.runReportCueTimers.push(timer);
    }
  }

  /**
   * Raporun nisan ve ustalik bolumu. Nisanlar kuyrugun "rapor" ani: bu kosuda
   * acilan her nisan, dalga molasinda gosterilenler de. Yaratici kosuda yok.
   */
  private buildRunReportProgress(creative: boolean) {
    if (creative) return undefined;
    const badges = this.badgeNotices.take("report")
      .map((id) => getBadgeDefinition(id))
      .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge))
      .map((badge) => ({ name: badge.name, condition: badge.condition }));
    const outcome = this.runProgressOutcome;
    if (badges.length === 0 && !outcome?.mastery && !outcome?.cosmetics.length) return undefined;
    return { badges, mastery: outcome?.mastery, cosmetics: outcome?.cosmetics ?? [] };
  }

  /**
   * Raporun dugmeleri. Hepsi sayfayi yeniden yukluyor; Tekrar ve Sonraki
   * asama menuye bir niyet birakiyor, menu acilista onu okuyup oyunu hemen
   * baslatiyor. Sahne yeniden baslatilmiyor: durumunun cogu alan
   * baslaticilarinda ve restart onlari yeniden calistirmazdi. Niyetin zamani
   * dokunus aninda: rapor uzun sure acik kalsa da niyet taze.
   *
   * Ekran snapshot'tan acildi ve kosunun raporu (`run:sync`) hala yoldaysa
   * yeniden yukleme odadan cikar ve kosu hic kaydedilmezdi: rekor, yildiz,
   * kosu kaydi ve arsiv sayaci kalici olarak kaybolurdu. O zaman rapor
   * gelene kadar bekleniyor (gelince `handleMatchResult` yukluyor). Bekleme
   * sinirli: olu bir baglanti oyuncuyu raporda tutmasin. Basilan dugme bu
   * arada kapali (bekleme imleci) kaliyor.
   */
  private chooseRunReportAction(choice: RunReportChoice) {
    if (choice !== "menu") saveQuickStartIntent({ ...choice.intent, at: Date.now() });
    if (this.matchResultLatch.awaitingRun) {
      this.runReportReloadPending = true;
      window.setTimeout(() => this.reloadAfterLeavingRoom(), RUN_REPORT_RELOAD_WAIT_MS);
      return;
    }
    this.reloadAfterLeavingRoom();
  }

  /**
   * Odadan izinli cikip sayfayi yeniden yukler: raporun dugmeleri ve mac
   * icindeki "Menüye dön" (`leaveMatchAndReload`).
   *
   * Kosu izi yuklemeden once kapaniyor: suren kosu `abandon` (menu) ve
   * `run_end` (abandoned) aliyor, bekleyen sonuc varsa o gidiyor. Kosu
   * bittigi icin yuklemedeki `pagehide` ("closed") ikinci kez saymiyor.
   */
  private reloadAfterLeavingRoom() {
    if (this.leavingRoom) return;
    this.leavingRoom = true;
    runTelemetry.leave("menu");
    void leaveMatchAndReload(this.room);
  }

  /**
   * Mac icinde menuye donus (ayarlar ve menu panelinin en ustundeki dugme). Once oyun ici
   * onay: solo kosu kayboluyor, co-op'ta takim sensiz devam ediyor (kuleler
   * ve isciler sahada kaliyor). Onayda raporun dugmeleriyle ayni yol.
   */
  private confirmQuitMatch() {
    this.hideAudioSettingsPanel();
    if (this.leavingRoom) return;
    const coop = this.startedFromLobby && (this.latestPerfSnapshot?.players.length ?? 0) > 1;
    openConfirmDialog(
      t("hud.quit.title"),
      [t(coop ? "hud.quit.coop" : "hud.quit.solo")],
      { confirm: t("hud.quit.confirm"), cancel: t("hud.quit.cancel") },
      () => this.reloadAfterLeavingRoom()
    );
  }

  /**
   * Dalga odulu: kart secimi.
   *
   * Baslik hangi dalganin odulu oldugunu soyluyor ("DALGA 7 ÖDÜLÜ"). Kartlar
   * 80 ms arayla ters gelip donuyor, her biri yuzu gorundugunde kisa bir
   * cevirme sesi. Nadirlik kenarda: yaygin duz, seyrek gumus, nadir altin,
   * epik cift cizgili koyu kan kirmizisi; nadir kart bir kez parliyor ve kendi
   * tinisini caliyor -- yaklasik her uc secimden birinde nadir var, gelmesi
   * kendi basina kucuk bir odul. Epik kart parlamiyor (fark cercevede), ama
   * ayni tiniyi aliyor.
   *
   * Kart ancak dagitimi baslayali 250 ms olunca secilebiliyor: ekran dalga
   * sonunda kendiliginden aciliyor ve haritaya yapilan son dokunus bir karti
   * secmemeli. Ayni el yeniden acildiginda dagitim yok. Hareket azaltmada
   * donus ve parlama yok; kartlar hemen yuzu acik, sesler kaliyor.
   */
  private showCardChoices(cards: CardDefinition[]) {
    // Mac bitti: rapor ekranda. Yeniden baglanmada eski bir el gelebilir;
    // raporun altinda perde kurulmasin, dagitim sesi calmasin ve hic
    // gorunmeyen kartlar arsive gorulmus yazilmasin.
    if (this.matchResultShown) return;
    const latest = this.latestPerfSnapshot;
    const draftWave = getCardDraftWave(latest ? { wave: latest.team.wave, setupPhase: latest.setupPhase } : undefined);
    const dealKey = `${draftWave ?? "-"}:${cards.map((card) => card.id).join(",")}`;
    const deal = dealKey !== this.cardDealKey;
    // Kart Arsivi: elin kartlari sunuldugu an gorulmus sayiliyor; hic
    // gorulmemis olanlar bu el boyunca sessiz bir "YENİ" etiketi tasiyor.
    // Etiket yalnizca bir etiket -- ne bonus ne siralama -- ki secimi
    // yeniligin cekimine kaptirmasin. Yaratici kosu arsive yazmiyor.
    const fresh = this.cardArchiveLatch.resolve(dealKey, () => markArchiveOffered(
      "cards",
      cards.map((card) => card.id),
      { creative: this.isArchiveSandbox() }
    ));
    this.hideCardChoices();
    // Damga HUD'da, yani kart perdesinin ustunde: perde acilinca kalkmali.
    this.hideArenaHudOverlays();
    this.cardChoicePending = false;
    this.cardChoices = cards;
    // Yenilenen el ayni molanin eli: nisan satiri yeniden okunmuyor.
    const rerolled = this.cardRerollRequested;
    this.cardRerollRequested = false;
    const root = document.querySelector<HTMLElement>("#card-root");
    if (!root) return;
    this.cardChoiceRoot = root;
    const reducedMotion = this.feedback?.reducedMotion ?? false;
    if (deal) {
      this.cardDealKey = dealKey;
      this.cardDealStartedAt = performance.now();
      // Dalga molasi: bu dalgada acilan nisan perdenin basliginda bir satir.
      // Ayni el yeniden cizilince satir kaliyor, yeni elde yeniden okunuyor.
      if (!rerolled) {
        const moment = getBadgeNoticeMoment({ over: this.matchResultShown, setupPhase: true, enemiesLeft: 0, draftOpen: true });
        this.cardDraftBadgeNotice = formatBadgeNotice(this.badgeNotices.take(moment));
      }
    }
    const animate = deal && !reducedMotion;
    root.className = "card-draft card-draft--visible";
    root.innerHTML = `
      <div class="card-draft__veil"></div>
      <section class="card-draft__panel" role="dialog" aria-modal="true" aria-label="${t("scene.card.draftAria")}">
        <header class="card-draft__header" data-wave-report-slot>
          <span class="card-draft__eyebrow">${this.tutorialMode ? t("scene.card.tutorialEyebrow") : getCardDraftTitle(draftWave)}</span>
          <h2>${t("scene.card.draftTitle")}</h2>
          <p>${t("scene.card.draftSubtitle")}</p>
          <span class="card-draft__status" role="status" aria-live="polite"></span>
        </header>
        <div class="card-draft__grid"></div>
        <div class="card-draft__actions">
          <button class="card-draft__reroll" type="button" data-card-reroll>
            <span class="card-draft__reroll-glyph" aria-hidden="true">↻</span>
            <span class="card-draft__reroll-label">${upper(t("scene.card.reroll"))}</span>
            <span class="card-draft__reroll-count" aria-hidden="true"></span>
          </button>
        </div>
      </section>`;
    this.cardDraftWave = draftWave;
    root.querySelector<HTMLButtonElement>("[data-card-reroll]")?.addEventListener("click", () => this.requestCardReroll());
    this.updateCardRerollButton();
    const header = root.querySelector<HTMLElement>("[data-wave-report-slot]");
    if (header) this.mountWaveReportCard(header, animate);
    if (header && this.cardDraftBadgeNotice) {
      const notice = document.createElement("span");
      notice.className = `card-draft__badge${animate ? " card-draft__badge--animate" : ""}`;
      notice.textContent = `◈ ${this.cardDraftBadgeNotice}`;
      header.querySelector(".card-draft__status")?.before(notice);
    }
    const grid = root.querySelector<HTMLElement>(".card-draft__grid");
    const localTowers = this.getLocalTowerProfiles();
    const rarities: CardRarity[] = [];
    cards.forEach((card, index) => {
      const scope = this.getCardScopeLabel(card);
      const reach = this.getCardReach(card, localTowers);
      const accent = this.getCardAccent(card);
      const rarity = getCardRarity(card);
      const timing = getCardDealTiming(index, reducedMotion);
      rarities.push(rarity);
      const button = document.createElement("button");
      button.type = "button";
      const isNew = fresh.has(card.id);
      button.className = `run-card run-card--${rarity}${isNew ? " run-card--new" : ""}${animate ? " run-card--deal" : ""}${animate && rarity === "rare" ? " run-card--shine" : ""}`;
      button.dataset.cardId = card.id;
      button.style.setProperty("--card-accent", accent);
      if (animate) {
        button.style.setProperty("--deal-delay", `${timing.delayMs}ms`);
        button.style.setProperty("--shine-delay", `${timing.faceUpMs}ms`);
      }
      // Yaygin kart etiketsiz ("duz"); digerlerinde renk tek isaret olmasin.
      const rarityTag = rarity === "common"
        ? ""
        : `<span class="run-card__rarity">${upper(cardRarityLabels[rarity])}</span>`;
      // Sunucunun kart nesnesi Turkce kopya; ad ve aciklama katalogdan, dile gore.
      const text = getCardText(card);
      button.innerHTML = `
        <span class="run-card__back" aria-hidden="true"></span>
        <span class="run-card__index">0${index + 1}${isNew ? `<span class="run-card__new">${t("scene.card.new")}</span>` : ""}</span>
        <span class="run-card__glow"></span>
        <span class="run-card__axis">${card.axes.map((axis) => upper(towerAxisLabels[axis])).join(" • ")}${rarityTag}</span>
        <strong>${text.name}</strong>
        <span class="run-card__description">${text.description}</span>
        <span class="run-card__scope">${scope}</span>
        <span class="run-card__reach${reach.muted ? " run-card__reach--muted" : ""}">${reach.text}</span>`;
      button.addEventListener("click", () => {
        if (this.cardChoicePending) return;
        if (performance.now() < this.cardDealStartedAt + timing.pickableAtMs) return;
        if (card.scope.kind === "targeted") this.startCardTargetPick(card);
        else this.submitCardChoice({ cardId: card.id });
      });
      grid?.append(button);
    });
    if (deal) this.scheduleCardRevealCues(rarities, reducedMotion);
  }

  /**
   * Dalga karnesi, kart perdesinin basliginda: yeni bir pencere degil, zaten
   * acilan molanin ilk satiri.
   *
   * Co-op'ta karne senin: yuvanin oldurmesi, kendi kulen, kendi altinin.
   * Seride dokunmak o dalganin Savunma Ozeti'ni aciyor; perde kendiliginden
   * acildigi icin haritaya yapilan son dokunus seridi de "basmamali" -- kartlarla
   * ayni koruma suresi. Dar ekranda karne alt basligin yerini aliyor (CSS):
   * kartlar ekrandan asagi itilmesin.
   */
  private mountWaveReportCard(header: HTMLElement, animate: boolean) {
    const card = this.buildWaveReportCard();
    const summary = card && this.latestDefenseSummary?.wave === card.wave ? this.latestDefenseSummary : undefined;
    header.querySelector(".wave-report")?.remove();
    header.classList.toggle("card-draft__header--report", Boolean(card));
    if (!card) return;
    const element = createWaveReportElement(card, {
      animate,
      onOpen: summary
        ? () => {
          if (performance.now() < this.cardDealStartedAt + CARD_PICKABLE_AFTER_MS) return;
          openDefenseDialog(t("scene.defense.title", { wave: summary.wave }), defenseSummaryLines(summary));
        }
        : undefined
    });
    header.querySelector(".card-draft__eyebrow")?.after(element);
  }

  /** Kart perdesinin karnesi: acik perdenin dalgasi icin, elde ne varsa. */
  private buildWaveReportCard() {
    // Ogreticide dalga karnesi yok: dalga sayaci ilerlemiyor, "Dalga 1" yaniltirdi.
    if (this.tutorialMode) return undefined;
    const local = this.playerSnapshots.find((player) => player.id === this.localSessionId);
    const team = this.latestPerfSnapshot?.team;
    return this.waveReports.build({
      wave: this.cardDraftWave,
      localSlot: local?.slot ?? 0,
      coop: this.playerSnapshots.length > 1,
      creative: this.creativeMode,
      defense: localizeDefenseSummary(this.latestDefenseSummary),
      health: team ? { health: team.health, maxHealth: team.maxHealth } : undefined
    });
  }

  /**
   * Perde acikken gec gelen parca (karne, ozet, damganin altini) karneyi
   * tazeliyor. Normalde hepsi perdeden once geliyor; ag gecikmesinde perde
   * damgadan once acilabiliyor. Icerik degismediyse dokunulmuyor ki parilti
   * yarida kesilmesin. Hedef kule listesinde ve ucube seciminde karne yok.
   */
  private refreshWaveReportCard() {
    const header = this.cardChoiceRoot?.querySelector<HTMLElement>("[data-wave-report-slot]");
    if (!header) return;
    const card = this.buildWaveReportCard();
    const tappable = Boolean(card && this.latestDefenseSummary?.wave === card.wave);
    const current = header.querySelector<HTMLElement>(".wave-report")?.dataset.waveReportKey ?? "";
    if (current === getWaveReportKey(card, tappable)) return;
    this.mountWaveReportCard(header, false);
  }

  /** Kart acilisinin sesleri: yuzu gorunen her kartta cevirme, nadirde bir kez tini. */
  private scheduleCardRevealCues(rarities: readonly CardRarity[], reducedMotion: boolean) {
    for (const cue of getCardRevealCues(rarities, reducedMotion)) {
      const timer = window.setTimeout(() => {
        this.cardDealTimers = this.cardDealTimers.filter((entry) => entry !== timer);
        this.feedback?.playSfx(cue.kind);
      }, cue.atMs);
      this.cardDealTimers.push(timer);
    }
  }

  private clearCardDealTimers() {
    for (const timer of this.cardDealTimers) window.clearTimeout(timer);
    this.cardDealTimers = [];
  }

  /**
   * Kule hedefli kart tasiyabilir mi.
   *
   * Olcut sunucudakiyle ayni fonksiyonlardan geliyor: vurusu olan kule ve
   * dolmamis hedefli kart yuvasi. Arayuzun de suzmesi sart: sunucu zaten
   * reddediyor ama oyuncunun once secip sonra reddedilmesi, listede hic
   * gormemesinden cok daha kotu. Kart ekranindaki "N kule tasiyabilir"
   * sayisi da buradan geciyor, yani sayi ile hedef listesi ayni kuleler.
   */
  private canTowerHoldCard(tower: TowerSnapshot) {
    const definition = towerCatalog[tower.characterId]?.find((entry) => entry.id === tower.definitionId);
    return definition ? canTowerHoldTargetedCard(definition) && canAcceptTargetedCard(tower.targetedCardIds ?? []) : false;
  }

  /** Yerel oyuncunun kuleleri tanimlariyla birlikte; kart erisimi tanimdan okunuyor. */
  private getLocalTowerProfiles() {
    const profiles: Array<{ tower: TowerSnapshot; definition: TowerDefinition }> = [];
    for (const tower of this.latestPerfSnapshot?.towers ?? []) {
      if (tower.ownerId !== this.localSessionId) continue;
      const definition = towerCatalog[tower.characterId]?.find((entry) => entry.id === tower.definitionId);
      if (definition) profiles.push({ tower, definition });
    }
    return profiles;
  }

  /**
   * Kart secim ekranindaki erisim satiri.
   *
   * Tek dokunusla alinan kart bir donem hangi kuleye isleyecegini hic
   * soylemiyordu. Sayi sunucunun secimden sonra parlattigi listeyle ayni
   * fonksiyondan (`cardReachesTower`) geliyor. Sifirda kart gizlenmiyor --
   * oyuncu kuleyi sonra kuracak olabilir -- ama bunu bilerek almali.
   */
  private getCardReach(card: CardDefinition, towers: ReadonlyArray<{ tower: TowerSnapshot; definition: TowerDefinition }>) {
    if (card.scope.kind === "targeted") {
      const count = towers.filter(({ tower }) => this.canTowerHoldCard(tower)).length;
      return count > 0
        ? { text: t("scene.card.reachTargeted", { count }), muted: false }
        : { text: t("scene.card.reachTargetedNone"), muted: true };
    }
    if (getCardTowerReach(card) === "none") {
      return { text: t("scene.card.reachPlayer"), muted: false };
    }
    const count = towers.filter(({ definition }) => cardReachesTower(card, definition)).length;
    return count > 0
      ? { text: t("scene.card.reachTowers", { count }), muted: false }
      : { text: t("scene.card.reachTowersNone"), muted: true };
  }

  /**
   * Hedefli kartin kulesi haritadan seciliyor.
   *
   * Eskiden kuleler perdede bir liste olarak geliyordu; ayni turden kuleler
   * yalnizca adlariyla birbirinden ayrilmiyordu. Simdi perde gizleniyor ve
   * oyuncu kuleyi haritada, yerini gorerek seciyor. Secim kipinde oldugu
   * haritanin cevresindeki cerceveden ve uygun kulelerin halkasindan
   * okunuyor. Kartin tasiyabilecegi kule yoksa liste ekraninin bos mesaji
   * kaliyor: oyuncu cikmaz sokakta kalmasin.
   */
  private startCardTargetPick(card: CardDefinition) {
    const root = this.cardChoiceRoot ?? document.querySelector<HTMLElement>("#card-root");
    const eligible = (this.latestPerfSnapshot?.towers ?? [])
      .some((tower) => tower.ownerId === this.localSessionId && this.canTowerHoldCard(tower));
    if (!root || !eligible) {
      this.showTargetedTowerChoices(card);
      return;
    }
    this.endCardTargetPick();
    const accent = this.getCardAccent(card);
    const banner = document.createElement("div");
    banner.className = "map-pick-banner";
    banner.style.setProperty("--pick-color", accent);
    banner.setAttribute("role", "status");
    banner.innerHTML = `
      <span class="map-pick-banner__text">
        <small>${upper(getCardText(card).name)}</small>
        <strong>${t("scene.card.mapPickTitle")}</strong>
      </span>
      <button type="button">${t("scene.card.backToCards")}</button>`;
    banner.querySelector("button")?.addEventListener("click", () => this.endCardTargetPick());
    document.body.append(banner);
    root.classList.add("card-draft--map-pick");
    this.cardTargetPick = { card, color: Number.parseInt(accent.slice(1), 16), banner };
    // Karta dokunan parmak haritaya da dusmesin.
    this.ignoreMapPointerUntil = performance.now() + 250;
  }

  /** Haritadan secim biter; kart perdesi (hala aciksa) geri gelir. */
  private endCardTargetPick() {
    const pick = this.cardTargetPick;
    if (!pick) return;
    this.cardTargetPick = undefined;
    pick.banner.remove();
    (this.cardChoiceRoot ?? document.querySelector<HTMLElement>("#card-root"))?.classList.remove("card-draft--map-pick");
    this.mapPickFrame?.clear().setVisible(false);
  }

  /**
   * Secim kipinde haritaya dokunuldu. Kartin tasiyabilecegi kuleyse onizleme
   * aciliyor ve "uygula" karti gonderiyor; tasiyamayacagi kulede kisa sebep,
   * kip acik kaliyor. Bos kareye dokunus sessiz: cerceve ne beklendigini soyluyor.
   */
  private resolveCardTargetTap(pointer: Phaser.Input.Pointer) {
    const pick = this.cardTargetPick;
    if (!pick || performance.now() < this.ignoreMapPointerUntil) return;
    const tower = this.findTowerAt(pointer.worldX, pointer.worldY);
    if (!tower) return;
    if (tower.ownerId !== this.localSessionId || !this.canTowerHoldCard(tower)) {
      this.showNotice(t("scene.card.mapPickInvalid"));
      return;
    }
    const cardId = pick.card.id;
    this.previewTowerChange({ cardId, towerId: tower.id }, () => {
      this.endCardTargetPick();
      this.submitCardChoice({ cardId, towerId: tower.id });
    });
  }

  /**
   * Secim kipinin isareti: haritanin cevresinde kartin renginde ince bir
   * cerceve ve kose ayraclari, karti alabilecek kulelerde halka. Yavas bir
   * nabiz; hareket azaltmada sabit.
   */
  private renderMapPickFrame(now: number) {
    const pick = this.cardTargetPick;
    if (!pick) return;
    const frame = this.mapPickFrame ?? this.add.graphics().setDepth(57);
    this.mapPickFrame = frame;
    frame.clear().setVisible(true);
    const bounds = getMapWorldBounds(this.selectedMapData);
    const still = this.feedback?.reducedMotion ?? false;
    const pulse = still ? 1 : 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(now / 320));
    const inset = 3;
    const left = bounds.left + inset;
    const top = bounds.top + inset;
    const right = bounds.left + bounds.width - inset;
    const bottom = bounds.top + bounds.height - inset;
    frame.lineStyle(2, pick.color, 0.55 * pulse).strokeRect(left, top, right - left, bottom - top);
    const arm = Math.min(right - left, bottom - top) * 0.09;
    frame.lineStyle(4, pick.color, 0.95 * pulse);
    for (const [x, y, dx, dy] of [[left, top, 1, 1], [right, top, -1, 1], [left, bottom, 1, -1], [right, bottom, -1, -1]]) {
      frame.lineBetween(x, y, x + dx * arm, y);
      frame.lineBetween(x, y, x, y + dy * arm);
    }
    const cellSize = this.getMapCellSize();
    for (const tower of this.latestPerfSnapshot?.towers ?? []) {
      if (tower.ownerId !== this.localSessionId || !this.canTowerHoldCard(tower)) continue;
      const radius = getTowerBodySize(tower.definitionId, cellSize * getTowerGridSpan(tower.definitionId)) * 0.62;
      frame.lineStyle(2, pick.color, 0.9 * pulse).strokeCircle(tower.x, tower.y, radius);
    }
  }

  private showTargetedTowerChoices(card: CardDefinition) {
    const root = this.cardChoiceRoot ?? document.querySelector<HTMLElement>("#card-root");
    if (!root) return;
    const towers = (this.latestPerfSnapshot?.towers ?? [])
      .filter((tower) => tower.ownerId === this.localSessionId && this.canTowerHoldCard(tower));
    const panel = root.querySelector<HTMLElement>(".card-draft__panel");
    if (!panel) return;
    panel.classList.add("card-draft__panel--targets");
    panel.innerHTML = `
      <header class="card-draft__header">
        <button class="card-draft__back" type="button" aria-label="${t("scene.card.backToCards")}">←</button>
        <span class="card-draft__eyebrow">${upper(getCardText(card).name)}</span>
        <h2>${t("scene.card.targetTitle")}</h2>
        <p>${t("scene.card.targetSubtitle")}</p>
        <span class="card-draft__status" role="status" aria-live="polite"></span>
      </header>
      <div class="tower-choice-list"></div>`;
    const currentChoices = [...this.cardChoices];
    panel.querySelector(".card-draft__back")?.addEventListener("click", () => this.showCardChoices(currentChoices));
    const list = panel.querySelector<HTMLElement>(".tower-choice-list");
    if (towers.length === 0) {
      // Cikmaz sokak birakmamak icin: elinde yalnizca duvar ve kaynak
      // binasi olan oyuncu bos bir listeye bakip ne yapacagini bilemezdi.
      const empty = document.createElement("p");
      empty.className = "tower-choice-empty";
      empty.textContent = t("scene.card.targetNone", { max: MAX_TARGETED_CARDS_PER_TOWER });
      list?.append(empty);
    }
    towers.forEach((tower) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tower-choice";
      button.dataset.towerId = tower.id;
      button.innerHTML = `<span class="tower-choice__orb" style="--tower-color:#${tower.color.toString(16).padStart(6, "0")}"></span><span><strong>${getTowerDisplayName(tower.definitionId, tower.name)}</strong><small>${t("scene.card.towerChoiceMeta", { level: tower.level, damage: Math.round(tower.damageDealt ?? 0) })}</small></span><span class="tower-choice__arrow">→</span>`;
      button.addEventListener("click", () => this.previewTowerChange({ cardId: card.id, towerId: tower.id }, () => this.submitCardChoice({ cardId: card.id, towerId: tower.id })));
      list?.append(button);
    });
  }

  /**
   * Ucube seviye secimi.
   *
   * Kart secim cekmecesinin ayni kabugu kullaniliyor: oyuncu bu ekrani zaten
   * taniyor ve secim akisi ayni -- iki secenek, biri aliniyor, digeri geri
   * gelmiyor.
   */
  private showUcubeChoice(message: { towerId: string; level: number }) {
    const tier = getUcubePerkTier(message.level);
    const root = document.querySelector<HTMLElement>("#card-root");
    if (!tier || !root) {
      return;
    }

    // Ayni perde: HUD'daki dalga damgasi perdenin ustunde kalmasin.
    this.hideArenaHudOverlays();
    this.cardChoiceRoot = root;
    root.className = "card-draft card-draft--visible";
    root.innerHTML = `
      <div class="card-draft__veil"></div>
      <section class="card-draft__panel" role="dialog" aria-modal="true" aria-label="${t("scene.ucube.aria")}">
        <header class="card-draft__header">
          <span class="card-draft__eyebrow">${t("scene.ucube.level", { level: message.level })}</span>
          <h2>${t("scene.ucube.title")}</h2>
          <span class="card-draft__status">${t("scene.ucube.status")}</span>
        </header>
        <div class="card-draft__grid"></div>
      </section>`;

    const grid = root.querySelector<HTMLElement>(".card-draft__grid");
    for (const option of tier.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "run-card";
      button.innerHTML = `<span>ucube</span><strong>${option.name}</strong><small>${option.description}</small>`;
      button.addEventListener("pointerup", () => {
        this.room?.send("ucube:choose", { towerId: message.towerId, perkId: option.id });
        this.hideCardChoices();
        this.showNotice(t("scene.ucube.picked", { name: option.name }));
      });
      grid?.append(button);
    }
  }

  /**
   * Secilen kartin karsiligi.
   *
   * Kart ekrani bir donem yalnizca kapaniyordu; oyuncu karti aldigini ve
   * nereye isledigini hicbir yerde goremiyordu. Kule listesi sunucudan
   * geliyor -- secim ekranindaki sayiyla ayni kural -- ve hedefli kartta
   * yalnizca secilen kule. Halka yukseltmeyle ayni dil, rengi kartin.
   */
  private handleCardApplied(message: { cardId?: string; towerIds?: string[] }) {
    this.hideCardChoices();
    // El kapandi: siradaki kart ekrani yeniden dagitilsin.
    this.cardDealKey = "";
    this.cardPickStampUntil = 0;
    const card = message.cardId ? getCardDefinition(message.cardId) : undefined;
    if (!card) return;
    const towerIds = new Set(message.towerIds ?? []);
    const color = Number.parseInt(this.getCardAccent(card).slice(1), 16);
    const cellSize = this.getMapCellSize();
    for (const tower of this.latestPerfSnapshot?.towers ?? []) {
      if (!towerIds.has(tower.id)) continue;
      this.playTowerPulse(tower, getTowerBodySize(tower.definitionId, cellSize * getTowerGridSpan(tower.definitionId)), color, card.scope.kind === "targeted");
    }
    if (card.scope.kind !== "targeted" && getCardTowerReach(card) === "none") {
      this.showNotice(t("scene.card.applied", { name: card.name }));
    } else if (towerIds.size > 0) {
      this.showNotice(t("scene.card.appliedTowers", { name: card.name, count: towerIds.size }));
    } else {
      this.showNotice(t("scene.card.appliedNone", { name: card.name }));
    }
  }

  /**
   * Sunucu karti uyguladi. Secim damgasi (150 ms) henuz bitmediyse kule atimi
   * ve toast onu bekliyor: yerel sunucuda cevap damgadan once gelebiliyor ve
   * perde damga gorunmeden kapanirdi. Sira hep damga -> atim -> toast.
   */
  private receiveCardApplied(message: { cardId?: string; towerIds?: string[] }) {
    window.clearTimeout(this.cardAppliedTimer);
    this.cardAppliedTimer = undefined;
    const wait = this.cardPickStampUntil - performance.now();
    if (wait > 0) {
      this.cardAppliedTimer = window.setTimeout(() => {
        this.cardAppliedTimer = undefined;
        this.handleCardApplied(message);
      }, wait);
      return;
    }
    this.handleCardApplied(message);
  }

  /**
   * Sunucu onayinin karsiligi: toast, yonetmen sesi, kule varsa atim.
   *
   * `handleCardApplied`'in magaza, takma, onarim, ulti gucu ve isci agacina
   * genellenmis hali. Metin ve ses tarifi paylasilan modulde
   * (feedback/confirmations), burasi yalnizca yurutuyor. Kule atiminin
   * halkasi CombatVfx tamponunda ciziliyor, 28 slotluk halka havuzunda degil;
   * ses `playSfx` ile yonetmenin butcesinden geciyor.
   */
  private confirmServerAction(cue: ServerConfirmationCue | undefined) {
    if (!cue) return;
    this.showNotice(cue.text, cue.durationMs);
    if (cue.sfx) this.feedback?.playSfx(cue.sfx, { step: cue.step });
    if (cue.pulse) this.pulseConfirmedTower(cue.pulse.towerId, cue.pulse.style);
  }

  /**
   * Onaylanan kulenin atimi.
   *
   * Onarim atimi oynatma gecikmesini bekliyor: can cubugu sahneyle birlikte
   * 500 ms geriden doluyor ve halka once oynarsa "onarildi" diyen halka hala
   * yarim cana bakan bir cubugun ustunde patlar. Takma kart atimi gibi hemen:
   * kulede o an gorunen bir sey degismiyor, bekletmek yalnizca dokunusu
   * gecikmis hissettirirdi. Ses ikisinde de hemen, dokunusun cevabi o.
   * Konum oynatma aninda okunuyor; arada satilan kulede halka acilmiyor.
   *
   * Halka CombatVfx'in sinirli tamponunda (kule anlari, 12'lik tavan): 28
   * slotluk halka havuzu kalabalik dalgada atis ve carpma parlamalariyla
   * dolu; onay halkasi orada ya kendisi dusuyor ya da onlari itiyordu. Katman
   * kule govdesinin altinda, halka sprite'in altindan yayiliyor. Kulenin
   * nabzi ayni, hareket azaltmada yok.
   */
  private pulseConfirmedTower(towerId: string, style: ConfirmationPulseStyle) {
    const play = () => {
      const tower = this.latestPerfSnapshot?.towers.find((entry) => entry.id === towerId);
      if (!tower) return;
      const discSize = getTowerBodySize(tower.definitionId, this.getMapCellSize() * getTowerGridSpan(tower.definitionId));
      const strong = style === "equip";
      const still = this.feedback?.reducedMotion ?? false;
      this.combatVfx?.emitTowerMoment({
        kind: "confirm",
        x: tower.x,
        y: tower.y,
        size: discSize,
        color: CONFIRMATION_PULSE_COLORS[style],
        shards: 0,
        strong,
        durationMs: strong ? 620 : 380,
        intensity: 1,
        still,
        bornAt: performance.now()
      });
      if (!still) this.punchTower(tower.id, strong);
    };
    if (style === "repair") this.queueDelayedEffect(play);
    else play();
  }

  /** Esyanin su an takilabilecegi yerel kule sayisi; sunucunun takma kuraliyla. */
  /**
   * Esyanin kilidi kartlardan zaten geliyor mu: vitrin ve envanter etiketi.
   * Cekilisin olu agirlik verdigi kuralla ayni fonksiyon.
   */
  private isShopItemAlreadyUnlockedLocally(itemId: string) {
    const item = getShopItem(itemId);
    if (!item) return false;
    return isShopItemAlreadyUnlocked(item, this.localPlayerSnapshot?.ownedCardIds ?? [], this.getLocalTowerProfiles().map(({ definition }) => definition));
  }

  /** Secilen kulede kartlar, hedefli kartlar ve takili esyalar kilidi zaten aciyor mu. */
  private isShopItemAlreadyUnlockedOnTower(itemId: string, towerId: string) {
    const item = getShopItem(itemId);
    const profile = this.getLocalTowerProfiles().find(({ tower }) => tower.id === towerId);
    if (!item || !profile) return false;
    return isShopItemUnlockRedundant(item, getTowerGrantedUnlocks({
      tower: profile.definition,
      ownedCardIds: this.localPlayerSnapshot?.ownedCardIds ?? [],
      targetedCardIds: profile.tower.targetedCardIds ?? [],
      equippedItemIds: profile.tower.equippedShopItemIds ?? []
    }));
  }

  private countEquippableLocalTowers(itemId?: string) {
    const item = itemId ? getShopItem(itemId) : undefined;
    if (!item) return 0;
    return countEquippableTowers(item, this.getLocalTowerProfiles().map(({ tower, definition }) => ({
      definition,
      equippedItemIds: tower.equippedShopItemIds
    })));
  }

  private findTowerName(towerId?: string) {
    const tower = towerId ? this.latestPerfSnapshot?.towers.find((entry) => entry.id === towerId) : undefined;
    return tower ? getTowerDisplayName(tower.definitionId, tower.name) : undefined;
  }

  private hideCardChoices() {
    this.endCardTargetPick();
    this.clearCardChoiceTimeout();
    this.clearCardDealTimers();
    this.cardChoicePending = false;
    const root = this.cardChoiceRoot ?? document.querySelector<HTMLElement>("#card-root");
    root?.replaceChildren();
    if (root) root.className = "";
    this.cardChoiceRoot = undefined;
    this.cardChoices = [];
    this.cardDraftWave = undefined;
    this.flushLinkMoments();
  }

  private submitCardChoice(message: { cardId: string; towerId?: string }) {
    if (!this.room || this.cardChoicePending) return;
    this.stampPickedChoice(message);
    this.setCardChoicePending(true, t("scene.card.applying"));
    this.room.send("card:choose", message);
    this.cardChoiceTimeout = window.setTimeout(() => {
      this.setCardChoicePending(false, t("scene.card.noResponse"));
    }, 4500);
  }

  /**
   * Eli yenile: elde bir kez, ucretsiz. Sunucu yeni eli `card:choices` ile
   * yolluyor ve perde yeni dagitimla yeniden kuruluyor; ret gelirse dugme
   * sunucunun sayisina doner. Kartlarla ayni koruma: perde kendiliginden
   * acildigi icin haritaya yapilan son dokunus eli yenilememeli.
   */
  private requestCardReroll() {
    if (!this.room || this.cardChoicePending || this.cardRerollsRemaining <= 0) return;
    if (performance.now() < this.cardDealStartedAt + CARD_PICKABLE_AFTER_MS) return;
    this.cardRerollRequested = true;
    this.setCardChoicePending(true, t("scene.card.rerolling"));
    this.room.send("card:reroll");
    this.cardChoiceTimeout = window.setTimeout(() => {
      this.cardRerollRequested = false;
      this.setCardChoicePending(false, t("scene.card.noResponse"));
    }, 4500);
  }

  /** Yenile dugmesi: kalan hak, bekleme ve hak bitince kapali. */
  private updateCardRerollButton() {
    const button = this.cardChoiceRoot?.querySelector<HTMLButtonElement>("[data-card-reroll]");
    if (!button) return;
    const remaining = this.cardRerollsRemaining;
    button.disabled = remaining <= 0 || this.cardChoicePending;
    button.classList.toggle("is-spent", remaining <= 0);
    button.setAttribute("aria-label", t("scene.card.rerollAria", { count: remaining }));
    const count = button.querySelector<HTMLElement>(".card-draft__reroll-count");
    if (count) count.textContent = String(remaining);
  }

  /**
   * Secim damgasi: secilen kart (hedefli kartta secilen kule) 150 ms'de bir
   * kez basiliyor, "SEÇİLDİ" iniyor ve damga sesi caliyor. Istek hemen
   * gidiyor; beklemeyi `receiveCardApplied` yapiyor, yani damga gecikme
   * eklemiyor. Secilen kart bekleme boyunca parlak kaliyor, digerleri
   * sonukleserek geri cekiliyor.
   */
  private stampPickedChoice(message: { cardId: string; towerId?: string }) {
    const buttons = this.cardChoiceRoot?.querySelectorAll<HTMLElement>(message.towerId ? ".tower-choice" : ".run-card");
    const picked = Array.from(buttons ?? []).find((button) => (message.towerId
      ? button.dataset.towerId === message.towerId
      : button.dataset.cardId === message.cardId));
    // Dagitim sinifi secilen karttan kalkiyor: kalirsa ret ya da zaman
    // asiminda `is-picked` silininca dagitim animasyonu yeniden basliyor,
    // kart gecikmesi kadar kaybolup arka yuzu olmadan bir daha donuyordu.
    // Kart ancak yuzu acildiktan sonra secilebildigi icin gorunen bir sey
    // kesilmiyor. Parilti (`run-card--shine`) kaliyor, secimden bagimsiz.
    picked?.classList.remove("run-card--deal");
    picked?.classList.add("is-picked");
    this.cardPickStampUntil = performance.now() + CARD_PICK_STAMP_MS;
    this.feedback?.playSfx("cardPick");
  }

  private setCardChoicePending(pending: boolean, status = "") {
    this.cardChoicePending = pending;
    if (!pending) this.clearCardChoiceTimeout();
    const root = this.cardChoiceRoot ?? document.querySelector<HTMLElement>("#card-root");
    root?.querySelectorAll<HTMLButtonElement>(".run-card, .tower-choice").forEach((button) => {
      button.disabled = pending;
      // Reddedilen ya da zaman asimina ugrayan secimin damgasi kalkiyor.
      if (!pending) button.classList.remove("is-picked");
    });
    const statusElement = root?.querySelector<HTMLElement>(".card-draft__status");
    if (statusElement) {
      statusElement.textContent = status;
      statusElement.classList.toggle("card-draft__status--error", !pending && Boolean(status));
    }
    this.updateCardRerollButton();
  }

  private clearCardChoiceTimeout() {
    if (this.cardChoiceTimeout !== undefined) {
      window.clearTimeout(this.cardChoiceTimeout);
      this.cardChoiceTimeout = undefined;
    }
  }

  /**
   * Kartin kapsam etiketi, kartin gercek suzgecinden.
   *
   * Etiket bir donem yalnizca eksene bakiyordu ve etiketli kartlarin cogunu
   * "Kontrol kuleleri" diye yaziyordu -- ates, mermi ya da yorunge kartini
   * da. Artik suzgecin her alani okunuyor; hasar ve vurus adlari kodeksle
   * ayni. Ayni alandaki degerlerden biri yeter ("/"), farkli alanlarin
   * hepsi birden saglanmali (" · "). Kuleye dokunmayan genel kart "Genel".
   */
  private getCardScopeLabel(card: CardDefinition) {
    const scope = card.scope;
    if (scope.kind === "global") return getCardTowerReach(card) === "none" ? t("scene.scope.general") : t("scene.scope.allTowers");
    if (scope.kind === "targeted") return t("scene.scope.pickTower");
    const parts = [
      scope.aims ? t("scene.scope.aims") : "",
      scope.projectiles ? t("scene.scope.projectiles") : "",
      scope.alongFacing ? t("scene.scope.alongFacing") : "",
      scope.combat ? t("scene.scope.combat") : "",
      scope.axes?.length ? t("scene.scope.towersOf", { list: scope.axes.map((axis) => towerAxisLabels[axis]).join(" / ") }) : "",
      scope.hitTypes?.length ? t("scene.scope.towersOf", { list: scope.hitTypes.map((type) => hitTypeCodex[type].name).join(" / ") }) : "",
      scope.damageTypes?.length ? t("scene.scope.damageTypes", { list: scope.damageTypes.map((type) => damageTypeCodex[type].name).join(" / ") }) : "",
      scope.shapes?.length ? t("scene.scope.towersOf", { list: scope.shapes.map((shape) => attackShapeLabels[shape]).join(" / ") }) : "",
      scope.ammoTypes?.length ? t("scene.scope.ammoTypes", { list: scope.ammoTypes.map((ammo) => ammoTypeLabels[ammo]).join(" / ") }) : "",
      scope.hasAreaRadius ? t("scene.scope.areaRadius") : ""
    ].filter(Boolean);
    return parts.join(" · ") || t("scene.scope.allTowers");
  }

  private getCardAccent(card: CardDefinition) {
    return card.axes.includes("dps") ? "#fb7185" : card.axes.includes("economy") ? "#facc15" : card.axes.includes("amplify") ? "#a78bfa" : card.axes.includes("cc") ? "#22d3ee" : "#60a5fa";
  }

  private renderSetupPhase(snapshot: GameSnapshot) {
    const active = Boolean(snapshot.setupPhase);
    const localReady = Boolean(this.localSessionId && snapshot.setupReadyPlayerIds?.includes(this.localSessionId));
    // Kart secimi acikken ongoru kutusu cizilmiyor: cubugun altina asili kutu
    // secim penceresinin basligini ortuyordu. Magaza ve isci alma perdesi de
    // ayni: telefonda ust kenara yapisiyorlar ve HUD katmani onlarin ustunde,
    // kutu ilk teklifin adini (ornegin Ucaksavar Kiti'ni) ortuyordu. Hava
    // etiketi o sirada dalga numarasinin yaninda duruyor, yani gorunur kaliyor.
    const localPlayer = snapshot.players.find((player) => player.id === this.localSessionId);
    const choosingCard = this.cardChoiceRoot !== undefined;
    const forecastVisible = active && !choosingCard && !this.isGoldShopOpen(snapshot, localPlayer);
    const airWarning = active && Boolean(localPlayer?.noAirDefense);
    const hudPatch: Partial<HudState> = {
      continueVisible: active,
      continueWaiting: localReady,
      waveAirMode: snapshot.team.waveAirMode,
      forecastEnemyCount: forecastVisible ? snapshot.team.waveEnemyCount ?? 0 : 0,
      // Kurulumda `wave` siradaki dalga: adim onu bir onceki kara dalgasiyla kiyasliyor.
      forecastHpStep: forecastVisible ? getHeavyWaveHpStep(snapshot.team.wave) : undefined,
      // Siradaki dalganin paterni (sunucunun plani): "Sürü", "Zırhlı kol".
      forecastPattern: forecastVisible ? snapshot.team.wavePattern : undefined,
      airWarning
    };
    if (active) {
      const readyCount = snapshot.setupReadyPlayerIds?.length ?? 0;
      hudPatch.status = t("scene.status.setup", { ready: readyCount, total: snapshot.players.length });
      this.setupStatusText = hudPatch.status;
    } else if (this.setupStatusText !== undefined && this.hudState.status === this.setupStatusText) {
      // On ek yerine yazilan metin: "Kurulum" dile gore degisiyor.
      hudPatch.status = `#${this.room?.roomId ?? "-"}`;
      this.setupStatusText = undefined;
    }
    this.emitHudState(hudPatch);
    // Toast kutuya bagli degil: bildirim kontrollerin icinde magazanin
    // ustunde ciziliyor, magaza kapanmayi beklemesine gerek yok.
    if (active && !choosingCard) this.announceMissingAirDefense(snapshot, airWarning);
  }

  /**
   * Magaza ya da isci perdesi acilip kapaninca ongoru kutusunu hemen
   * gunceller: kurulumda tahta durunca anlik goruntu akisi susuyor ve kutu
   * bir sonraki goruntuyu beklese perde kapandiktan sonra da gizli kalirdi.
   */
  private refreshSetupForecast() {
    if (this.latestPerfSnapshot) this.renderSetupPhase(this.latestPerfSnapshot);
  }

  /**
   * Kurulum magazasi ekranda mi. Kontrol durumu ve ongoru kutusu ayni
   * kurali okuyor; ayri yazilsalar kutu acik magazanin ustune dusebilirdi.
   */
  private isGoldShopOpen(snapshot: Pick<GameSnapshot, "setupPhase" | "team"> | undefined, player: GameSnapshot["players"][number] | undefined) {
    // Ogreticide kurulum yok: vitrin adim istedigi an dalga icinde aciliyor.
    return Boolean((snapshot?.setupPhase || this.tutorialMode) && snapshot && player && (player.shopOffers?.length ?? 0) > 0 && this.shopDismissedWave !== snapshot.team.wave);
  }

  /**
   * Acik magaza vitrininin "YENİ" etiketleri. Esya, magaza ekrandayken
   * gorulmus sayiliyor; kurulumda hic acilmayan vitrin arsive yazilmiyor.
   *
   * Sunumun kimligi dalga ve yenileme bedeli, vitrinin kimlikleri degil.
   * Satin alinan esya vitrinden dusuyor ama bu yeni bir sunum degil: kalan
   * esyalar acilista zaten gorulmus yazildi, yeniden hesap butun etiketleri
   * ayni vitrin ekrandayken silerdi. Yenileme bedeli bir kurulumda sabit ve
   * her yenilemede artiyor (magaza kart seciminden sonra aciliyor, bedeli
   * degistiren tek sey bir kart), yani yenileme yeni bir kapsam. Kapsam ayni
   * ve kimlikler ilk vitrinin alt kumesiyse kalanlarin etiketi yerinde
   * (`resolveNarrowing`); panel her anlik goruntude yeniden kurulabiliyor,
   * depo yalnizca yeni vitrinde okunuyor.
   */
  private resolveShopNovelty(): ReadonlySet<string> {
    const ids = (this.localPlayerSnapshot?.shopOffers ?? []).map((item) => item.id);
    const scope = `${this.latestPerfSnapshot?.team.wave ?? "-"}:${this.localPlayerSnapshot?.shopRerollPrice ?? "-"}`;
    return this.shopArchiveLatch.resolveNarrowing(scope, ids, () => markArchiveOffered("items", ids, { creative: this.isArchiveSandbox() }));
  }

  /**
   * Hava uyarisini kurulum arasi basina bir kez toast olarak da soyler.
   *
   * Kart secimi kapanana kadar bekliyor (cagiran taraf): toast secim
   * perdesinin altinda kaliyor ve suresi orada doluyordu. Ekranda baska bir
   * bildirim varsa onun bitmesini bekliyor -- kart secilince gelen "alindi"
   * bildirimi ayni anda dusuyor ve biri digerini silerdi. Ara acildiginda
   * uyari yoksa ara kapanmis sayiliyor: sonradan kule satilirsa kutu zaten
   * uyariyor, toast "kurulum basinda" sozunu asmiyor.
   */
  private announceMissingAirDefense(snapshot: GameSnapshot, airWarning: boolean) {
    const session = snapshot.setupSession ?? 0;
    if (this.airWarningSetupSession === session) return;
    if (airWarning && this.getActiveNotice()) return;
    this.airWarningSetupSession = session;
    if (!airWarning) return;
    this.showNotice(t(snapshot.team.waveAirMode === "mixed" ? "scene.air.warningMixed" : "scene.air.warningAll"), 5000);
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
        // Yakınlaştırılmış haritadaki normal dokunuş seçim/yerleştirme akışına
        // devam etmeli. Yalnız çift dokunuş zoom-out tarafından tüketilir.
        return false;
      }
      this.resetArenaZoom();
      this.lastArenaTapAt = 0;
      return true;
    }

    const camera = this.cameras.main;
    camera.panEffect.reset();
    camera.zoomEffect.reset();
    camera.setZoom(getSceneRenderScale(this));
    camera.centerOn(pointer.worldX, pointer.worldY);
    this.arenaZoomed = true;
    return false;
  }

  private resetArenaZoom() {
    this.cameras.main.panEffect.reset();
    this.cameras.main.zoomEffect.reset();
    this.configureArenaCamera();
  }

  private getClampedGuidancePoint(pointer: Phaser.Input.Pointer) {
    const radius = this.scaleWorldDistance(GUIDANCE_RADIUS);
    const bounds = getMapWorldBounds(this.selectedMapData);
    return {
      x: Phaser.Math.Clamp(pointer.worldX, bounds.left + radius, bounds.right - radius),
      y: Phaser.Math.Clamp(pointer.worldY, bounds.top + radius, bounds.bottom - radius)
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

    this.syncMap(snapshot.map);
  }

  private syncMap(mapData: EditableMapData) {
    const map = normalizeMapData(mapData);
    const mapKey = this.getMapRenderKey(map);
    if (mapKey === this.renderedMapKey) {
      return;
    }

    this.selectedMapData = map;
    this.renderedMapKey = mapKey;
    this.drawMap();
    this.configureArenaCamera();
  }

  /** Tuvalin dunya birimindeki olcusu; cihazin oranina gore degisir. */
  private getWorldSize() {
    const scale = getSceneRenderScale(this);
    return {
      width: this.scale.gameSize.width / scale,
      height: this.scale.gameSize.height / scale
    };
  }

  private handleScaleResize() {
    const world = this.getWorldSize();
    configureHiDpiCamera(this);
    this.backdrop?.setPosition(world.width / 2, world.height / 2).setSize(world.width, world.height);
    this.configureArenaCamera();
    // Gokyuzu kameranin gordugu alani kapliyor; o alan degistiyse yeniden cizilmeli.
    this.drawMap();
  }

  private getArenaFitFactor() {
    return getArenaCameraView(this.selectedMapData, this.arenaChrome, this.getWorldSize()).fit;
  }

  /**
   * Kaplama olculeri degisince kamerayi yeniden kurar.
   *
   * Ust cubuk sarilip uzayabiliyor ve iOS'ta tuval kisaldikca ayni HTML tuvalin
   * daha buyuk bir kismini ortuyor; serit sabit kalirsa harita altta kaliyor.
   */
  private applyArenaChrome(chrome: ArenaChrome) {

    if (!Number.isFinite(chrome?.topRatio) || !Number.isFinite(chrome?.bottomRatio)) {
      return;
    }
    if (Math.abs(chrome.topRatio - this.arenaChrome.topRatio) < 0.002
      && Math.abs(chrome.bottomRatio - this.arenaChrome.bottomRatio) < 0.002) {
      return;
    }

    this.arenaChrome = { topRatio: chrome.topRatio, bottomRatio: chrome.bottomRatio };
    this.configureArenaCamera();
    // Serit kaydi: kameranin gordugu alan da kaydi, gokyuzu onu izlemeli.
    this.drawMap();
  }

  private configureArenaCamera() {
    const camera = this.cameras.main;
    const view = getArenaCameraView(this.selectedMapData, this.arenaChrome, this.getWorldSize());
    // Phaser scroll'u kamera sınırına sıkıştırır ve kesirli fit değerlerinde
    // ideal scroll birkaç alt piksel dışarı taşabilir. İstenen dikdörtgenin iki
    // yanına da simetrik pay bırakılırsa clamp bu payı tek tarafa yaslayamaz;
    // centerOn aralığın tam ortasına oturur.
    const padding = TOWER_GRID_SIZE / 2;
    camera.setBounds(view.left - padding, view.top - padding, view.width + padding * 2, view.height + padding * 2);
    camera.setZoom(getSceneRenderScale(this) * view.fit);
    camera.centerOn(view.left + view.width / 2, view.top + view.height / 2);
    this.arenaZoomed = false;
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
    this.playerSnapshots = snapshot.players;
    const charge = player?.ultimateCharge ?? 0;
    const gold = player?.gold ?? 0;
    const experience = player?.experience ?? 0;
    this.currentTeamGold = gold;
    this.currentUltimateCharge = this.resolveUltimateEcho(charge);
    if (charge < 100 && this.ultimateChoiceOpen) {
      this.hideUltimateChoices();
    }
    // Dugmenin gosterdigi sarjdan: basildiktan sonra yanki sifir tutuyor, yani
    // atis "hazir" sayilmiyor; sunucu reddederse dugme geri dolunca yine hazir.
    if (this.ultimateReadyWatch.observe(this.currentUltimateCharge, { over: Boolean(snapshot.result) || this.matchResultShown })) {
      this.signalUltimateReady();
    }

    const reputation = player?.reputation ?? 0;
    const authorityChain = player?.authorityChain ?? 0;
    const authorityQuality = player?.authorityQuality ?? 0;
    if (player?.characterId !== "zeynep") {
      this.hideZeynepTierChoices();
    }
    const approval = player?.approval ?? 0;
    const stress = player?.stress ?? 0;
    const ammunition = snapshot.team.ammunition ?? { bullet: 0, auraCrystal: 0, powerCrystal: 0 };
    // Karaktere ozel sayaclar barin sabit alanlarina girmez: her karakterde
    // farkli sayida olduklari icin sabit bir yer ayirmak ya bosluk ya tasma
    // uretirdi. Ikincil seride ek rozet olarak akiyorlar.
    const extras = player?.characterId === "zeynep"
      ? [
        { label: t("scene.resource.prestige"), icon: "✦", value: `${reputation}/100` },
        { label: t("scene.resource.chain"), icon: "⛓", value: `${authorityChain}/2` },
        { label: t("scene.resource.quality"), icon: "◈", value: `${authorityQuality}/15` }
      ]
      : player?.characterId === "archer"
        ? [
          { label: t("scene.resource.approval"), icon: "☺", value: `${Math.round(approval)}` },
          { label: t("scene.resource.stress"), icon: "☹", value: `${Math.round(stress)}` }
        ]
        : [];
    const hudKey = `${gold}|${experience}|${Math.round(snapshot.team.health)}|${snapshot.team.wave}|${snapshot.team.enemiesLeft}|${charge}|${reputation}|${authorityChain}|${authorityQuality}|${approval}|${stress}|${Math.floor(snapshot.team.energy ?? 0)}|${snapshot.team.maxEnergy ?? 0}|${Math.floor(ammunition.bullet)}|${Math.floor(ammunition.auraCrystal)}|${Math.floor(ammunition.powerCrystal)}`;
    if (this.lastHudKey !== hudKey) {
      this.emitHudState({
        stats: {
          gold,
          experience,
          health: snapshot.team.health,
          maxHealth: snapshot.team.maxHealth,
          wave: snapshot.team.wave,
          enemiesLeft: snapshot.team.enemiesLeft,
          energy: snapshot.team.energy ?? 0,
          maxEnergy: snapshot.team.maxEnergy ?? 0,
          ammo: ammunition,
          extras
        }
      });
      this.lastHudKey = hudKey;
    }
    this.announceLumpGold(player ? gold : undefined);
    // Panel acikken sayilar akmali: kapaliyken hicbir sey hesaplanmiyor.
    if (this.hudState.statsOpen) this.emitHudState(this.getStatsHudPatch());
    this.updateSkillButtons(player?.skillCooldowns ?? [0, 0, 0], player);
    this.updateSelectionUi();
  }

  private renderEnemies(enemies: EnemySnapshot[]) {
    const activeIds = new Set(enemies.map((enemy) => enemy.id));
    const slowCommand = this.zeynepCommandEffects?.slow;
    const slowTierLevel = slowCommand ? getZeynepCommandTierLevel(slowCommand.tier) : 0;
    const now = performance.now();
    this.removedEnemyTraces.prune(now);

    for (const [id, mover] of this.enemies) {
      if (!activeIds.has(id)) {
        // Olmus mu sizmis mi burada bilinmiyor; iz ikisinde de birakiliyor,
        // patlamayi yalnizca oldurme olayi baslatiyor (`playKillConfirmation`).
        if (mover.type && mover.displaySize !== undefined) {
          this.removedEnemyTraces.remember(id, {
            x: mover.sprite.x,
            y: mover.sprite.y,
            size: mover.displaySize,
            texture: mover.sprite.texture.key,
            tint: mover.baseTint ?? 0xffffff,
            type: mover.type,
            air: Boolean(mover.air),
            champion: Boolean(mover.crown),
            special: mover.specialKind
          }, now);
        }
        this.enemyGroup?.killAndHide(mover.sprite);
        if (mover.sprite.body) {
          mover.sprite.body.enable = false;
        }
        mover.marker?.destroy();
        mover.curseMarker?.destroy();
        mover.doubtMarker?.destroy();
        mover.healthBar?.destroy();
        mover.shieldHalo?.destroy();
        mover.armorBreakIcon?.destroy();
        mover.bleedEffect?.destroy();
        mover.frostEffect?.destroy();
        mover.crown?.destroy();
        mover.specialEffect?.destroy();
        mover.raceEffect?.destroy();
        this.announcedChampionIds.delete(id);
        this.enemies.delete(id);
      }
    }

    for (const enemy of enemies) {
      let mover = this.enemies.get(enemy.id);
      const texture = getEnemyTextureKey(enemy);
      // Irk alanlari: cogu dusmanda yok (tek karsilastirma, nesne yok).
      const raceView = readRaceTraitView(enemy);

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
        // Havuzdan gelen doku olen dusmanin acisini tasiyor: yeni dusman
        // dondurulmemis dokuyla basliyor, asagida bu snapshot'in yonu yaziliyor
        // (`getEnemySpriteRotation`).
        sprite.setRotation(0);
        mover.shieldHalo = this.add.circle(enemy.x, enemy.y, 18, 0x38bdf8, 0.08)
          .setStrokeStyle(2, 0x60a5fa, 0.86)
          .setDepth(7.6)
          .setVisible(false);
        mover.healthBar = this.add.graphics().setDepth(16);
        mover.bleedEffect = this.add.graphics().setDepth(7.9).setVisible(false);
        mover.frostEffect = this.add.graphics().setDepth(8.1).setVisible(false);
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
        if (enemy.champion) {
          mover.crown = this.add.text(enemy.x, enemy.y - 24, CHAMPION_MARK, {
            color: CHAMPION_FILL,
            fontFamily: "Arial",
            fontSize: "11px",
            fontStyle: "bold",
            stroke: CHAMPION_STROKE,
            strokeThickness: 4
          }).setOrigin(0.5).setDepth(CHAMPION_CROWN_DEPTH);
        }
        this.enemies.set(enemy.id, mover);
      }

      if (mover.sprite.texture.key !== texture) {
        mover.sprite.setTexture(texture);
      }
      // Kozmetik itme (kendi agir vurusun, 1-2 px): yalnizca govdenin cizimi,
      // ENEMY_KNOCK_MS'de yerine oturuyor. Konum, can cubugu ve yon etkilenmiyor.
      const knock = mover.knockAt === undefined ? 0 : 1 - (now - mover.knockAt) / ENEMY_KNOCK_MS;
      mover.knockDx = knock > 0 ? (mover.knockX ?? 0) * knock : 0;
      mover.knockDy = knock > 0 ? (mover.knockY ?? 0) * knock : 0;
      mover.sprite.setPosition(enemy.x + mover.knockDx, enemy.y + mover.knockDy);
      // Karede degismeyen derinlik yeniden yazilmiyor: her `setDepth` sahnenin
      // siralamasini kuyruga sokuyor ve bu dongu her karede her dusmanda donuyor.
      setDepthIfChanged(mover.sprite, enemy.movementKind === "air" ? 9 : 8);
      mover.sprite.setRotation(this.getEnemySpriteRotation(enemy, mover.sprite.rotation));
      const slowPulse = slowTierLevel > 0 ? Math.sin(performance.now() / 120) * 0.05 : 0;
      // Sampiyon govdesi ceyrek buyuk: kalabalikta ilk bakista secilsin. Ruh
      // cekici yiginla buyuyor (+%6 / yigin): govde, halo ve cubuk birlikte.
      // Olcekler sunucunun isabet govdesiyle ayni fonksiyonlardan (enemy-display);
      // yalnizca yavaslatma nabzi gorsel (ortalamasi sifir, sunucu evresini bilmiyor).
      const championScale = getEnemyBodyScale({ champion: enemy.champion, ds: raceView?.drawer });
      const baseSpriteScale = getEnemySpriteDisplaySize(enemy, this.getMapCellSize()) * championScale / ENEMY_TEXTURE_SIZE;
      const artScale = getEnemyArtScale(enemy);
      mover.sprite.setScale(baseSpriteScale * artScale * ((enemy.movementKind === "air" ? AIR_ENEMY_DISPLAY_SCALE : 1) + slowPulse));
      mover.sprite.setAlpha(enemy.movementKind === "air" ? 0.98 : 0.68 + 0.32 * (enemy.hp / enemy.maxHp));
      const baseTint = enemy.isDominated ? 0xf0abfc : enemy.isWhisperTurned ? 0xa78bfa : slowTierLevel > 0 ? getZeynepSlowTint(slowTierLevel) : enemy.shield > 0 ? 0xbfdbfe : enemy.movementKind === "air" ? 0x67e8f9 : 0xffffff;
      // Vurus flasi burada, tonun her karede yeniden yazildigi yerde: baska
      // bir yerde verilse bir sonraki kare onu silerdi. Kaynak dusmanin kendi
      // can + kalkan dususu. Melis'in olu ve cevrilmis birlikleri haric: yolu
      // tutarken her kare can kaybediyorlar, flas durmadan yanardi. Hareket
      // azaltmada duz beyaz flas hic yok: can cubugu vurusu zaten gosteriyor.
      const effectiveHp = enemy.hp + enemy.shield;
      if (!enemy.isUndead && !enemy.isWhisperTurned && !this.feedback?.reducedMotion
        && shouldStartEnemyHitFlash(mover.lastEffectiveHp, effectiveHp, mover.hitFlashAt, now)) {
        mover.hitFlashAt = now;
      }
      mover.lastEffectiveHp = effectiveHp;
      mover.baseTint = baseTint;
      if (isEnemyHitFlashActive(mover.hitFlashAt, now)) {
        mover.sprite.setTintFill(ENEMY_HIT_FLASH_COLOR);
      } else {
        mover.sprite.setTint(baseTint);
      }
      const hasShield = enemy.shield > 0 && enemy.maxShield > 0;
      const shieldRatio = hasShield ? Phaser.Math.Clamp(enemy.shield / enemy.maxShield, 0, 1) : 0;
      const displayedEnemySize = getEnemySpriteDisplaySize(enemy, this.getMapCellSize()) * championScale * (enemy.movementKind === "air" ? AIR_ENEMY_DISPLAY_SCALE : 1) * (1 + slowPulse);
      mover.type = enemy.type;
      mover.air = enemy.movementKind === "air";
      mover.teamSide = isExecuteTeamSide(enemy);
      mover.displaySize = displayedEnemySize;
      const shieldRadius = displayedEnemySize * 0.48;
      const statusYOffset = Math.max(18, displayedEnemySize * 0.42);
      mover.shieldHalo?.setPosition(enemy.x, enemy.y);
      if (mover.shieldHalo) setDepthIfChanged(mover.shieldHalo, enemy.movementKind === "air" ? 8.6 : 7.6);
      // Yaricap degisince daire yeniden ucgenleniyor; ayni yaricapi yazma.
      if (mover.shieldHalo && mover.shieldHalo.radius !== shieldRadius) mover.shieldHalo.setRadius(shieldRadius);
      mover.shieldHalo?.setFillStyle(0x38bdf8, hasShield ? 0.04 + shieldRatio * 0.08 : 0);
      mover.shieldHalo?.setStrokeStyle(1.5, 0x60a5fa, hasShield ? 0.42 + shieldRatio * 0.45 : 0);
      mover.shieldHalo?.setVisible(hasShield);
      this.drawEnemyBleedEffect(mover.bleedEffect, enemy, displayedEnemySize);
      this.drawEnemyFrostEffect(mover.frostEffect, enemy, displayedEnemySize);
      this.drawEnemyHealthBar(mover.healthBar, enemy, displayedEnemySize);
      if (mover.crown) {
        // Sampiyon isareti govdenin ustunde sabit (sallanma yok).
        mover.crown.setPosition(enemy.x, enemy.y - displayedEnemySize * 0.5 - 6);
        mover.crown.setScale(Math.max(0.8, displayedEnemySize / 44));
      }
      if (enemy.champion && !this.announcedChampionIds.has(enemy.id)) {
        this.announcedChampionIds.add(enemy.id);
        this.announceChampion(enemy, displayedEnemySize);
      }
      if (enemy.special) {
        this.renderSpecialEnemy(mover, enemy, enemy.special, displayedEnemySize, now);
      }
      if (raceView || mover.raceEffect || mover.raceBurrowed || mover.raceUntargetable) {
        this.renderEnemyRaceTrait(mover, enemy, raceView, displayedEnemySize, now);
      }
      mover.marker?.setPosition(enemy.x, enemy.y - 22);
      const curseLoad = enemy.curseLoad ?? 0;
      const isCursed = curseLoad > 0;
      const doubtStacks = enemy.doubtStacks ?? 0;
      const hasDoubt = doubtStacks > 0 || Boolean(enemy.isHesitating);
      const hasUnderworld = Boolean(enemy.isUnderworldLinked || enemy.isUndead);
      const hasSeparateMelisMarker = isCursed || hasDoubt;
      // Takipci isareti artik yazi degil, dusmanin uzerinde nisangah
      // (atakan-signatures): yigin kadar kertik, yiginla daralan ayraclar.
      // Eski "T/T2/T3" etiketi burada yok; kertik sayisi renk gormeden de okunuyor.
      const hasCombatMarker = Boolean(enemy.isDominated || enemy.isWhisperTurned || enemy.isFeared || hasUnderworld);
      const slowLabel = slowTierLevel > 0 ? `SLOW ${slowTierLevel}` : "";
      mover.marker?.setPosition(enemy.x, enemy.y - statusYOffset - (hasSeparateMelisMarker ? 11 : 4));
      mover.marker?.setText(enemy.isDominated ? t("scene.marker.dominated") : enemy.isWhisperTurned ? t("scene.marker.turned") : enemy.isUndead ? t("scene.marker.undead") : enemy.isUnderworldLinked ? t("scene.marker.linked") : enemy.isFeared ? t("scene.marker.feared") : slowLabel || "AIR");
      // Renk ve punto yalnizca degistiginde: Phaser ikisinde de metnin tuvalini
      // yeniden ciziyor (punto olcumleri de yeniden hesapliyor) ve bu her karede
      // her dusmanda iki etiket demekti.
      if (mover.marker) {
        setTextColorIfChanged(mover.marker, enemy.isDominated ? "#f0abfc" : enemy.isWhisperTurned ? "#c4b5fd" : enemy.isUndead ? "#22d3ee" : enemy.isUnderworldLinked ? "#2dd4bf" : enemy.isFeared ? "#c084fc" : slowTierLevel > 0 ? getZeynepSlowTextColor(slowTierLevel) : "#67e8f9");
        setFontSizeIfChanged(mover.marker, enemy.isDominated ? 9 : enemy.isWhisperTurned ? 10 : enemy.isUndead ? 9 : enemy.isUnderworldLinked ? 9 : enemy.isFeared ? 9 : hasCombatMarker ? 12 : slowTierLevel > 0 ? 8 : 8);
      }
      mover.marker?.setVisible(Boolean(hasCombatMarker || slowTierLevel > 0 || enemy.movementKind === "air"));
      const curseText = `L${Math.min(999, Math.round(curseLoad))}`;
      const doubtText = enemy.isHesitating ? t("scene.marker.hesitating") : t("scene.marker.doubt", { n: Math.max(1, doubtStacks) });
      const melisMarkerGap = isCursed && hasDoubt ? Math.max(10, displayedEnemySize * 0.2) : 0;
      mover.curseMarker?.setPosition(enemy.x - melisMarkerGap, enemy.y - statusYOffset);
      mover.curseMarker?.setText(curseText);
      if (mover.curseMarker) setFontSizeIfChanged(mover.curseMarker, curseLoad >= 100 ? 8 : 9);
      mover.curseMarker?.setVisible(isCursed);
      mover.doubtMarker?.setPosition(enemy.x + melisMarkerGap, enemy.y - statusYOffset);
      mover.doubtMarker?.setText(doubtText);
      if (mover.doubtMarker) setTextColorIfChanged(mover.doubtMarker, enemy.isHesitating ? "#99f6e4" : "#5eead4");
      mover.doubtMarker?.setVisible(hasDoubt);
      const iconPulse = enemy.isArmorBroken ? 1 + Math.sin(performance.now() / 95) * 0.08 : 1;
      mover.armorBreakIcon?.setPosition(enemy.x + 12, enemy.y - 15);
      mover.armorBreakIcon?.setScale(this.getTowerEffectScale() * 0.62 * iconPulse);
      mover.armorBreakIcon?.setAlpha(enemy.isArmorBroken ? 0.96 : 0);
      mover.armorBreakIcon?.setVisible(Boolean(enemy.isArmorBroken));
    }
  }

  /**
   * Kirag ve buz kabugu.
   *
   * Iki durum tek yuzeyde ciziliyor cunku ikisi ayni sogugun iki siddeti:
   * Sogutma Kanali kiragi birakiyor, Derin Dondurma onu kabuga ceviriyor.
   * Ayri ayri cizilseydi ikisi ayni anda oldugunda ust uste biner ve
   * dusman iki kez donmus gorunurdu.
   *
   * Kabuk **donuyor**, kirag titriyor. Hareket ayrimin kendisi: donmus
   * dusman zaten yerinde duruyor, yani duran bir govdenin uzerinde donen
   * bir kabuk uzaktan da okunuyor.
   */
  private drawEnemyFrostEffect(graphics: Phaser.GameObjects.Graphics | undefined, enemy: EnemySnapshot, displayedSize: number) {
    if (!graphics) return;
    graphics.clear();
    if (!enemy.isChilled && !enemy.isFrozen) {
      graphics.setVisible(false);
      return;
    }

    graphics.setVisible(true);
    setDepthIfChanged(graphics, enemy.movementKind === "air" ? 9.1 : 8.1);
    const radius = Math.max(7, displayedSize * 0.46);
    // Buzun bicimi dusmanin kimliginden: donmuyor, titremiyor (agir, sert dil).
    const seed = fnvHash(enemy.id) % 997;

    if (enemy.isFrozen) {
      // Kabuk: kirik kenarli, soluk celik-mavisi bir buz kabugu; yerinde duruyor.
      const turn = hashNoise(seed) * Math.PI;
      for (let i = 0; i < FROST_POINTS.length; i += 1) {
        const angle = turn + (i * Math.PI * 2) / FROST_POINTS.length;
        const r = radius * (0.84 + hashNoise(seed + i + 1) * 0.3);
        FROST_POINTS[i].setTo(enemy.x + Math.cos(angle) * r, enemy.y + Math.sin(angle) * r);
      }
      graphics.fillStyle(FROST_CRUST_FILL, 0.22);
      graphics.fillPoints(FROST_POINTS, true);
      graphics.lineStyle(Math.max(1.1, radius * 0.1), FROST_CRUST_EDGE, 0.85);
      graphics.strokePoints(FROST_POINTS, true, true);

      // Ic catlaklar: merkezden kenarlara uc kirik, sabit.
      graphics.lineStyle(Math.max(0.8, radius * 0.07), FROST_CRACK, 0.75);
      for (let i = 0; i < 3; i += 1) {
        const angle = turn + 0.4 + (i * Math.PI * 2) / 3 + (hashNoise(seed + i + 9) - 0.5) * 0.6;
        graphics.lineBetween(
          enemy.x + Math.cos(angle) * radius * 0.18,
          enemy.y + Math.sin(angle) * radius * 0.18,
          enemy.x + Math.cos(angle) * radius * 0.9,
          enemy.y + Math.sin(angle) * radius * 0.9
        );
      }
      return;
    }

    // Kirag: govdenin kenarinda ince, sonuk bir buz cizgisi ve dort kisa
    // buz kertigi; kabuktan cok daha sonuk, cunku yavaslatma durdurmak degil.
    graphics.lineStyle(Math.max(1, radius * 0.08), FROST_CRUST_EDGE, 0.4);
    graphics.strokeCircle(enemy.x, enemy.y, radius * 0.92);
    graphics.lineStyle(Math.max(0.8, radius * 0.07), FROST_CRACK, 0.6);
    for (let i = 0; i < 4; i += 1) {
      const angle = hashNoise(seed) * Math.PI + (i * Math.PI * 2) / 4;
      graphics.lineBetween(
        enemy.x + Math.cos(angle) * radius * 0.8,
        enemy.y + Math.sin(angle) * radius * 0.8,
        enemy.x + Math.cos(angle) * radius * 1.02,
        enemy.y + Math.sin(angle) * radius * 1.02
      );
    }
  }

  private drawEnemyBleedEffect(graphics: Phaser.GameObjects.Graphics | undefined, enemy: EnemySnapshot, displayedSize: number) {
    if (!graphics) return;
    graphics.clear();
    if (!enemy.isBleeding) {
      graphics.setVisible(false);
      return;
    }

    graphics.setVisible(true);
    setDepthIfChanged(graphics, enemy.movementKind === "air" ? 8.9 : 7.9);
    const radius = Math.max(8, displayedSize * 0.34);
    const groundY = enemy.y + displayedSize * 0.34;
    const phase = performance.now() / 520;
    const pulse = 0.82 + Math.sin(phase * Math.PI * 2) * 0.12;
    graphics.fillStyle(0x450a0a, 0.34 * pulse);
    graphics.fillEllipse(enemy.x, groundY + 3, radius * 1.45, Math.max(3, radius * 0.3));
    graphics.fillStyle(0x991b1b, 0.58 * pulse);
    graphics.fillEllipse(enemy.x - radius * 0.18, groundY + 2, radius * 0.72, Math.max(2, radius * 0.18));

    const offsets = [-0.42, 0.06, 0.38];
    for (let index = 0; index < offsets.length; index += 1) {
      const fall = (phase + index * 0.31) % 1;
      const x = enemy.x + radius * offsets[index] + Math.sin(phase * 5 + index) * 1.2;
      const y = enemy.y + displayedSize * 0.05 + fall * displayedSize * 0.34;
      const dropRadius = Math.max(1.2, displayedSize * (0.035 + fall * 0.018));
      graphics.fillStyle(index === 1 ? 0xef4444 : 0xdc2626, 0.9 - fall * 0.25);
      graphics.fillCircle(x, y, dropRadius);
      graphics.fillTriangle(
        x,
        y - dropRadius * 1.8,
        x - dropRadius * 0.72,
        y,
        x + dropRadius * 0.72,
        y
      );
    }
  }

  /**
   * Dokunun acisi: oynatilan snapshot adiminin yonu (`hx`, `hy`; yon izi
   * `EnemyHeadingTracker` snapshot gelince kayda yaziyor, ara degerleme
   * kaydi sonraki snapshot'tan kuruyor), dokunun +y ekseni yon
   * (`getBodyHeadingRotation`). Sunucunun govdesi ayni yonu ayni kuralla
   * yayinda olcuyor: doku her snapshot sinirinda govdenin yonunde, iki
   * snapshot arasinda o adimin yonunde (yurudugu yone, adimin basinda).
   *
   * Eskiden doku her karede gosterilen konum farkiyla donuyordu (esik
   * gosterilen sureyle olcekli): iki snapshot'i asan karede iki adimin
   * karisik yonune donup, sonraki adim esigin altindaysa o yonde
   * kalabiliyordu; karenin evresine bagliydi. Yon yoksa (eski kayit) onceki aci.
   */
  private getEnemySpriteRotation(enemy: EnemySnapshot, previousRotation: number) {
    const hx = enemy.hx;
    const hy = enemy.hy;
    return hx !== undefined && hy !== undefined ? getBodyHeadingRotation(hx, hy) : previousRotation;
  }

  private renderTowers(towers: TowerSnapshot[]) {
    const activeIds = new Set(towers.map((tower) => tower.id));
    this.towerSnapshots = new Map(towers.map((tower) => [tower.id, tower]));
    this.signatureTowers = towers;
    const cellSize = this.getMapCellSize();
    const linkRadius = Math.max(14, cellSize * 0.8);
    if (!this.towerGroundGraphics?.active) this.towerGroundGraphics = this.add.graphics().setDepth(2);
    const ground = this.towerGroundGraphics;
    ground.clear();
    for (const tower of towers) {
      if (this.isEdgePlacedDefinition(tower.definitionId)) continue;
      const size = getTowerSpriteSize(tower.definitionId, cellSize * getTowerGridSpan(tower.definitionId));
      ground.fillStyle(0x000000, tower.disabled ? 0.2 : 0.38);
      ground.fillEllipse(tower.x + size * 0.035, tower.y + size * 0.06, size * 1.04, size * 0.97);
      ground.lineStyle(Math.max(0.5, cellSize * 0.018), 0x71685a, 0.22);
      ground.strokeEllipse(tower.x, tower.y, size * 1.02, size * 0.98);
    }
    this.selectedResourceGraphics?.clear().setVisible(false);
    this.selectedAmmoText?.setVisible(false);
    this.selectedEnergyText?.setVisible(false);
    this.selectedTemperatureText?.setVisible(false);
    this.selectedMisfortuneText?.setVisible(false);
    this.selectedPerformanceText?.setVisible(false);
    this.performanceSliderHitZone?.setVisible(false).disableInteractive();
    // Satis dugmesi de panelle birlikte gider: kule satildiginda dugmenin
    // haritada asili kalmasi hem yanlis gorunur hem de olmayan bir kuleyi
    // isaret eder.
    this.selectedSellText?.setVisible(false);
    this.sellButtonRect = undefined;

    for (const [id, tower] of this.towers) {
      if (!activeIds.has(id)) {
        // Nabiz tween'i yikilan sprite'a yazmaya devam etmesin.
        this.tweens.killTweensOf(tower.punch);
        this.animatedTowers.delete(tower);
        tower.halo.destroy();
        tower.effect.destroy();
        tower.linkHighlight.destroy();
        tower.base.destroy();
        tower.range.destroy();
        tower.deadZone.destroy();
        tower.isolation.destroy();
        tower.healthBar.destroy();
        this.towers.delete(id);
        this.bladeAngles.delete(id);
        // Seviye kaydi da gitmeli: ayni kimlik yeniden kullanilirsa eski seviye
        // sahte bir yukseltme parlamasi uretirdi.
        this.towerLevels.delete(id);
      }
    }
    if (this.selectedPlacedTowerId && !activeIds.has(this.selectedPlacedTowerId)) {
      this.selectedPlacedTowerId = undefined;
      this.updateSelectionUi();
    }

    const now = performance.now();
    this.towerSpotX.length = 0;
    this.towerSpotY.length = 0;
    this.towerSpotOwner.length = 0;
    for (const tower of towers) {
      this.towerSpotX.push(tower.x);
      this.towerSpotY.push(tower.y);
      this.towerSpotOwner.push(tower.ownerId);
      if (tower.bladeAngle !== undefined) this.noteBladeAngle(tower.id, tower.bladeAngle, now);
    }
    for (const tower of towers) {
      let rendered = this.towers.get(tower.id);
      let landing = false;
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
        const deadZone = this.add.circle(tower.x, tower.y, tower.minimumRange ?? 0, 0x0f172a, 0.24)
          .setStrokeStyle(2, 0xf97316, 0.85)
          .setVisible(false)
          .setDepth(5.2);
        const isolation = this.add.graphics()
          .setVisible(false)
          .setDepth(6);
        const healthBar = this.add.graphics().setDepth(16);
        const base = this.add.image(tower.x, tower.y, getTowerTextureKey(tower.definitionId, tower.level, tower.characterId))
          .setDisplaySize(52, 52)
          .setAlpha(tower.ownerId === this.localSessionId ? 1 : 0.78)
          .setDepth(12);
        rendered = { effect, linkHighlight, halo, base, punch: { value: 1 }, scaleX: 1, scaleY: 1, range, deadZone, isolation, healthBar, key: "" };
        this.towers.set(tower.id, rendered);
        // Yalnizca sunucunun az once onayladigi kule iner; ilk karedeki kuleler
        // (katilma, sayfa yenileme) zaten oradaydi.
        landing = this.towersPrimed && this.freshTowerSpawns.take(tower.id, now);
      }

      // The disc covers exactly the tile it sits on -- 2x2 towers cover four --
      // and the sprite is sized larger only to make room for whatever the art
      // hangs outside the disc, such as Taht Muhru's barrel.
      const discSize = cellSize * getTowerGridSpan(tower.definitionId);
      // Takipçi and Ucube artwork already fills its square frame (tower-art.ts).
      // Applying the generic painted-art overhang would make its circular base
      // spill into neighbours.
      const spriteSize = getTowerSpriteSize(tower.definitionId, discSize);
      // Govdeye yapisik cizimler (halka, tac, can cubugu, nabiz) govdenin
      // gorunen capini izliyor (visual-scale); iz ve dokunma alani `discSize`.
      const bodySize = getTowerBodySize(tower.definitionId, discSize);

      this.playTowerLevelUpIfChanged(tower, bodySize);
      if (landing) {
        this.playTowerLanding(tower, rendered, bodySize, now);
      }

      const texture = getTowerTextureKey(tower.definitionId, tower.level, tower.characterId);
      // Durum anahtarda yok: asagidaki blok onu okumuyor, "Isı freni %X" ise
      // savasta neredeyse her anlik goruntude degisip halkayi ve izgarayi
      // bosuna yeniden ciziyordu. Durumu okuyan gorseller blogun disinda.
      const key = `${tower.x}|${tower.y}|${tower.orientation ?? "horizontal"}|${tower.color}|${tower.ownerId}|${tower.name}|${tower.level}|${tower.range}|${tower.ucubePerks?.join(",") ?? ""}|${tower.zeynepFormationSize ?? 0}|${tower.zeynepFormationLevel ?? 0}|${texture}|${discSize}`;
      if (rendered.key !== key) {
        this.drawTowerLevelRing(rendered.halo, tower.x, tower.y, tower.level, bodySize / 2, this.getTowerTierColor(tower, getTowerTier(tower.level)));
        if (this.shouldDrawTowerCrown(tower)) this.drawTowerCrown(rendered.halo, tower.x, tower.y, bodySize / 2);
        rendered.linkHighlight.setPosition(tower.x, tower.y);
        rendered.base.setPosition(tower.x, tower.y).setTexture(texture);
        rendered.range.setPosition(tower.x, tower.y).setRadius(tower.range);
        rendered.deadZone.setPosition(tower.x, tower.y).setRadius(tower.minimumRange ?? 0);
        this.drawIsolationGrid(rendered.isolation, tower.x, tower.y);
        rendered.key = key;
      }
      this.applyTowerFacing(rendered, tower);
      const selectionScale = tower.id === this.selectedPlacedTowerId ? 1.18 : 1;
      // Kenar yapilari kare kaplamaz; dairesel taban yerine ince bir cubuk
      // olarak cizilirler. Duvar tek cizgi oldugu icin uzun eksende Abarti kadar
      // uzamaz.
      const edgeLength = this.isEdgePlacedDefinition(tower.definitionId) ? this.getEdgeLength(tower.definitionId) : 0;
      const edgeLong = edgeLength === 1 ? 0.92 : 1.7;
      const footprintScaleX = edgeLength > 0 ? (tower.orientation === "vertical" ? 0.24 : edgeLong) : 1;
      const footprintScaleY = edgeLength > 0 ? (tower.orientation === "vertical" ? edgeLong : 0.24) : 1;
      // Derived from the frame rather than a constant: painted art and the
      // procedural glyphs ship at different sizes, but both reserve the same
      // disc-to-frame ratio, so this lands the disc on the tile either way.
      const textureScale = spriteSize / Math.max(1, rendered.base.frame.width);
      rendered.scaleX = selectionScale * textureScale * footprintScaleX;
      rendered.scaleY = selectionScale * textureScale * footprintScaleY;
      this.applyTowerScale(rendered, now);
      const edgePlaced = this.isEdgePlacedDefinition(tower.definitionId);
      rendered.base.setVisible(!edgePlaced);
      rendered.base.setTint(this.getTowerTint(tower));
      rendered.base.setAlpha((tower.status === "Tukenmis" || tower.disabled ? 0.42 : tower.ownerId === this.localSessionId ? 1 : 0.78) * this.getTowerEquipAlpha(tower));
      rendered.halo.setVisible(!edgePlaced && tower.status !== "Tukenmis" && tower.status !== "Hararet" && !tower.disabled);
      this.drawTowerHealthBar(rendered.healthBar, tower, bodySize);
      if (tower.id === this.selectedPlacedTowerId) {
        this.drawSelectedTowerResources(tower, discSize);
      }
      if (tower.definitionId === "onur-1") {
        rendered.range
          .setRadius(tower.bladeLength ?? tower.range)
          .setFillStyle(tower.color, 0)
          .setStrokeStyle(5, tower.color, 0.38);
      } else {
        rendered.range
          .setRadius(tower.range)
          .setFillStyle(tower.color, 0.13)
          .setStrokeStyle(2, tower.color, 0.7);
      }
      rendered.range.setVisible(tower.id === this.selectedPlacedTowerId && tower.definitionId !== "repair-depot-1");
      rendered.deadZone.setVisible(tower.id === this.selectedPlacedTowerId && (tower.minimumRange ?? 0) > 0);
      rendered.isolation.setVisible(tower.id === this.selectedPlacedTowerId && tower.definitionId === "warrior-3");
      this.updateServerLinkHighlight(rendered.linkHighlight, tower);
    }
    // Ilk goruntu olay degil: katilan oyuncunun ekraninda butun yalnizliklar
    // birden "kuruldu" demesin.
    const synergyAnnouncements = this.synergyMarks?.sync(towers, this.selectedMapData, this.localSessionId, cellSize, this.towersPrimed) ?? [];
    // Suren suruklemede saha degistiyse (takim arkadasi yanina kurdu) halka
    // tazelenir; dizi ayniysa hicbir sey yapilmiyor.
    if (this.draggedTowerDefinition && this.synergyMarks) {
      this.placementRange?.refresh(this.synergyMarks.getStructures());
    }
    for (const announcement of synergyAnnouncements) {
      this.showSynergyStamp(announcement);
    }
    this.towersPrimed = true;
  }

  /**
   * Yerlesim sinerjisinin tek seferlik damgasi: "Yalnız ×1,5", "Yalnızlık
   * bozuldu", "Dizilim kuruldu", "Dizilim bozuldu".
   *
   * Seviye etiketiyle ayni havuz ve ayni dil: kendi kulen parlak, takim
   * arkadasininki kucuk ve soluk, butceyi yonetmen tutuyor. Takim arkadasinin
   * kurulumu senin sinerjini bozduysa adini veren kisa bir bildirim; bozulan
   * seyi ekranda ararken kimin yaptigini da bil.
   */
  private showSynergyStamp(announcement: SynergyAnnouncement) {
    const now = performance.now();
    if (announcement.culprit && now - this.synergyNoticeAt >= SYNERGY_NOTICE_GAP_MS) {
      this.synergyNoticeAt = now;
      const kind = announcement.kind === "isolationLost" ? "isolationLost" : "formationBroken";
      this.showNotice(getSynergyCulpritNotice(kind, announcement.culprit), SYNERGY_NOTICE_MS);
    }

    const labels = this.levelLabels;
    const own = announcement.own;
    const y = announcement.y - LEVEL_LABEL_LIFT_PX;
    const lifetimeMs = FEEDBACK_KIND_RULES.synergy.visualMs;
    const decision = this.feedback?.emit("synergy", { own, x: announcement.x, y, lifetimeMs });
    if (!labels || (decision && !decision.show && !decision.merge)) {
      return;
    }
    const lost = announcement.kind === "isolationLost" || announcement.kind === "formationBroken";
    const fill = lost ? SYNERGY_LOST_FILL : announcement.kind === "formationFormed" ? SYNERGY_FORMATION_FILL : SYNERGY_ISOLATION_FILL;
    const key = `synergy:${announcement.anchorId}`;
    if (decision?.merge) {
      labels.merge(key, announcement.text, fill, LEVEL_LABEL_STROKE);
      return;
    }
    labels.spawn({
      key,
      text: announcement.text,
      x: announcement.x,
      y,
      fill,
      stroke: LEVEL_LABEL_STROKE,
      fontPx: own ? LEVEL_LABEL_FONT_PX : TEAMMATE_LEVEL_LABEL_FONT_PX,
      alpha: own ? 1 : TEAMMATE_LEVEL_LABEL_ALPHA,
      pop: false,
      lifetimeMs,
      still: decision?.reducedMotion ?? this.feedback?.reducedMotion ?? false,
      bounds: getMapWorldBounds(this.selectedMapData)
    }, now, decision?.recycle ?? false);
  }

  /**
   * Kulenin olcegi: snapshot'taki taban olcek, nabiz ve inis carpaniyla.
   *
   * Taban olcek snapshot'ta hesaplaniyor; nabiz ve inis karede degisiyor.
   * Ikisi ayri tutuluyor ki gelen snapshot suren bir inisi sifirlamasin.
   */
  private applyTowerScale(rendered: RenderTower, now: number) {
    const landing = rendered.landingAt === undefined ? 1 : getTowerLandingScale(now - rendered.landingAt);
    const multiplier = rendered.punch.value * landing;
    rendered.base.setScale(rendered.scaleX * multiplier, rendered.scaleY * multiplier);
  }

  /**
   * Karede yalnizca olcegi degisen kuleler (nabiz ya da inis) yeniden olcekleniyor.
   *
   * Eskiden nabiz yalnizca snapshot geldiginde uygulaniyordu: dalga sirasinda
   * 60 ms'de bir, kurulumda tahta durunca 500 ms'de bir. 120-180 ms'lik nabiz
   * de 150 ms'lik inis de ya birkac kareye bolunuyor ya hic gorunmuyordu.
   * Kume genelde bos; doluyken bir iki kule.
   */
  private updateAnimatedTowers(now: number) {
    if (this.animatedTowers.size === 0) {
      return;
    }
    for (const rendered of this.animatedTowers) {
      if (rendered.landingAt !== undefined && now - rendered.landingAt >= TOWER_LANDING_MS) {
        rendered.landingAt = undefined;
      }
      this.applyTowerScale(rendered, now);
      if (rendered.landingAt === undefined && !this.tweens.isTweening(rendered.punch)) {
        this.animatedTowers.delete(rendered);
      }
    }
  }

  /**
   * Yerlestirme inisi: kule 150 ms'de 1.25'ten yerine basiyor, altindan toz
   * halkasi yayiliyor, "tok" sesi.
   *
   * Yalnizca sunucu onayladiginda (`tower:spawn`) ve kule oynatmada ilk kez
   * cizildiginde: hayalet (`echoPlacement`) "istek yolda" diyordu, inis
   * "kuruldu" diyor. Reddedilen yerlestirmenin inisi yok. Tok ses yalnizca
   * kendi kulende (yonetmen: takim arkadasinin yerlestirmesi sessiz); takim
   * arkadasinin kulesi de iniyor ama tozu soluk. Hareket azaltmada basma yok,
   * toz halkasi yerinde soner.
   */
  private playTowerLanding(tower: TowerSnapshot, rendered: RenderTower, discSize: number, now: number) {
    const own = tower.ownerId === this.localSessionId;
    const decision = this.feedback?.emit("place", { own, x: tower.x, y: tower.y });
    const still = decision?.reducedMotion ?? this.feedback?.reducedMotion ?? false;
    if (!still) {
      rendered.landingAt = now;
      this.animatedTowers.add(rendered);
    }
    this.combatVfx?.emitTowerMoment({
      kind: "landing",
      x: tower.x,
      y: tower.y,
      size: discSize,
      color: 0,
      shards: 0,
      durationMs: TOWER_LANDING_DUST_MS,
      intensity: own ? 1 : TEAMMATE_TOWER_MOMENT_INTENSITY,
      still,
      bornAt: now
    });
  }

  /**
   * Nisanin kule olgulari: kendi kulelerinin seviyesi, Zeynep dizilimi, Melis
   * evrimi ve Onur'un zari. Anlik goruntude zaten olan alanlar; yalnizca not
   * aliniyor, yazim dalga sonunda. Taban kulenin ilk gorulen hali
   * (`BadgeRunWatch.noteOwnTower`): miras kalan kule bir sey acmiyor. Duvar ve
   * tamir deposu kule sayilmiyor.
   */
  private noteBadgeTowerFacts(tower: TowerSnapshot) {
    const definition = { id: tower.definitionId };
    this.badgeWatch.noteOwnTower({
      id: tower.id,
      level: tower.level,
      countsAsTower: countsAsTower(definition) && !isRepairDepotDefinition(definition),
      formationSize: tower.characterId === "zeynep" ? tower.zeynepFormationSize : undefined,
      evolution: tower.characterId === "archer" ? tower.melisEvolutionLevel : undefined,
      luck: tower.characterId === "onur" ? tower.lastLuckMultiplier : undefined,
      luckyWindowRemainingMs: tower.characterId === "onur" ? tower.luckyWindowRemainingMs : undefined,
      serverKnowledgeBonus: tower.definitionId === "warrior-2" ? getServerKnowledgeTopBonus(tower.serverKnowledge, tower.level) : undefined
    });
  }

  /**
   * Tac susu: yalnizca kendi onuncu seviye kulelerinde ve kozmetik aciksa.
   * Bu tarayicinin secimi; takim arkadasi gormuyor, sunucu bilmiyor.
   */
  private shouldDrawTowerCrown(tower: TowerSnapshot) {
    return this.cosmetics.crown && tower.ownerId === this.localSessionId && getTowerTier(tower.level) >= 3;
  }

  /**
   * Kulenin tepesinde kucuk bir tac: uc dis, altin. Can cubugunun ustunde
   * (cubuk kadranin 4-9 px ustunde, derinligi 16); seviye etiketinin
   * altinda. Olculer paylasilan kuralda (`getTowerCrownPoints`), test cubukla
   * cakismadigini oradan olcuyor.
   */
  private drawTowerCrown(graphics: Phaser.GameObjects.Graphics, x: number, y: number, spriteRadius: number) {
    const points = getTowerCrownPoints(x, y, spriteRadius).map((point) => new Phaser.Geom.Point(point.x, point.y));
    graphics.fillStyle(0xfacc15, 0.95);
    graphics.fillPoints(points, true);
    graphics.lineStyle(1.5, 0x422006, 0.9);
    graphics.strokePoints(points, true);
  }

  /**
   * Kulenin kademe rengi: kendi profilinin rampasindan.
   *
   * Eskiden butun kulelerde ayni genel renkler (celik, altin, beyaz) idi:
   * Omer'in kademe 2 altini kulenin kendi sarisiydi ve tamamen kayboluyordu.
   * Tören, rozet ve saldiri artik ayni rampayi konusuyor.
   */
  private getTowerTierColor(tower: Pick<TowerSnapshot, "definitionId" | "color">, tier: number) {
    const ramp = getVfxProfile(tower.definitionId, tower.color).ramp;
    return ramp[Math.max(0, Math.min(2, tier - 1))];
  }

  /**
   * Level ring. Three redundant ordinal cues so it reads without a legend and
   * without relying on hue: the arc fills clockwise as the tower levels (a full
   * circle is 10), the stroke thickens up to level 9, and the colour heats from
   * steel to white. Level 10 is the full white circle at half thickness: the
   * complete ring already says "max", a heavy white stroke hid the art's rim.
   * Drawn outside the sprite radius so painted art stays uncovered.
   */
  private drawTowerLevelRing(graphics: Phaser.GameObjects.Graphics, x: number, y: number, level: number, spriteRadius: number, tierColor = 0xfacc15) {
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
      graphics.lineStyle(style.glowWidth, style.color, 0.18);
      graphics.beginPath();
      graphics.arc(x, y, radius, start, start + sweep);
      graphics.strokePath();
    }

    graphics.lineStyle(style.width, style.color, 0.95);
    graphics.beginPath();
    graphics.arc(x, y, radius, start, start + sweep);
    graphics.strokePath();

    const tier = getTowerTier(level);
    if (tier >= 2) {
      this.drawTowerTierBadge(graphics, x, y + radius, tier, radius, tierColor);
    }
  }

  /**
   * Kalici kademe rozeti: kadranin altinda, kademe renginde nokta sayisi.
   *
   * Seviyeye bagli sanat yalnizca Takipci'de var; diger kulelerde 5 ve 10
   * kalici hicbir iz birakmiyordu. Rozet kadranla ayni Graphics'e, kadran
   * yeniden cizildiginde (seviye degisince) bir kez ciziliyor: karede maliyeti
   * yok, yeni sprite yok. Nokta sayisi etiketteki kademe ("KADEME 2" iki
   * nokta), renk mermi ve sutunla ayni; renk tek basina bilgi tasimiyor.
   * Seviye 5'te kadranin yayi tam rozetin oldugu yere, alta variyor.
   */
  private drawTowerTierBadge(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, tier: number, radius: number, color: number) {
    const pip = Math.max(1.5, radius * 0.1);
    const gap = pip * 2.6;
    const width = gap * (tier - 1) + pip * 4.4;
    const height = pip * 3.8;
    const left = cx - width / 2;
    const top = cy - height / 2;
    graphics.fillStyle(0x020617, 0.9);
    graphics.fillRoundedRect(left, top, width, height, height / 2);
    graphics.lineStyle(1, color, 0.9);
    graphics.strokeRoundedRect(left, top, width, height, height / 2);
    graphics.fillStyle(color, 1);
    for (let index = 0; index < tier; index += 1) {
      graphics.fillCircle(cx - (gap * (tier - 1)) / 2 + gap * index, cy, pip);
    }
  }

  /**
   * Uses the authoritative bearing directly. Applying another client-side turn
   * step here leaves the sprite one snapshot behind the projectile, making an
   * aligned server shot look as if it left a sideways muzzle. Sprites are
   * authored pointing right (+X), matching atan2's zero.
   */
  private applyTowerFacing(rendered: RenderTower, tower: TowerSnapshot) {
    if (typeof tower.facing !== "number") {
      return;
    }
    rendered.base.setRotation(tower.facing);
  }

  /**
   * Yukseltme anini gorunur kilar.
   *
   * Seviye atlamak simdiye kadar sessizdi: altin gidiyor, panelde bir sayi
   * degisiyor, ekranda hicbir sey olmuyordu. Odul hissi harcamanin oldugu yerde
   * verilmeli. Kademe atlandiginda -- 5 ve 10 -- daha buyugu oynanir, cunku o an
   * kulenin mermisi ve carpmasi da degisiyor; anin bunu haber vermesi gerek.
   */
  private towerLevels = new Map<string, number>();

  private playTowerLevelUpIfChanged(tower: TowerSnapshot, discSize: number) {
    const previous = this.towerLevels.get(tower.id);
    this.towerLevels.set(tower.id, tower.level);
    // Ilk gorulus bir yukseltme degil: mac ortasinda katilan oyuncunun ekraninda
    // butun kuleler birden parlamamali. Kural `getTowerLevelCeremony`de.
    const ceremony = getTowerLevelCeremony(previous, tower.level);
    if (!ceremony) {
      return;
    }

    this.playTowerPulse(tower, discSize, this.getTowerTierColor(tower, ceremony.tier), ceremony.kind === "tier");
    this.playTowerLevelCeremony(tower, discSize, ceremony);
  }

  /**
   * Seviye toreni: "SV 3" etiketi ve iki notali tini; 5 ve 10'da yaklasik
   * 1 sn'lik isik sutunu, ice donen 12 kiymik, "SV 5 · KADEME 2", uc nota ve bas.
   *
   * Halka ve nabiz `playTowerPulse`ta (var olan); yeni gorseller 28 slotluk
   * halka havuzuna degil CombatVfx tamponuna ciziliyor, kalabalik dalgada
   * atis halkalari onlari dusurmesin. Etiket, ses, sarsinti ve titresim
   * yonetmenden: kendi kademen P0 (hic dusmez; en fazla 3 px sarsinti ve
   * 15 ms titresim), kendi seviyen P2. Takim arkadasininki P3: soluk sutun,
   * kucuk soluk etiket, kisik ses, kamerana ve telefonuna hic dokunmuyor.
   * Kisa ve engelsiz: yukseltme dalga ortasinda da yapilabiliyor.
   */
  private playTowerLevelCeremony(tower: TowerSnapshot, discSize: number, ceremony: TowerLevelCeremony) {
    const now = performance.now();
    const own = tower.ownerId === this.localSessionId;
    const tierMoment = ceremony.kind === "tier";
    const labelY = tower.y - discSize / 2 - LEVEL_LABEL_LIFT_PX;
    const decision = this.feedback?.emit(ceremony.kind, { own, x: tower.x, y: labelY, lifetimeMs: ceremony.labelMs });
    const still = decision?.reducedMotion ?? this.feedback?.reducedMotion ?? false;
    const tierColor = this.getTowerTierColor(tower, ceremony.tier);

    if (tierMoment) {
      this.combatVfx?.emitTowerMoment({
        kind: "tier",
        x: tower.x,
        y: tower.y,
        size: discSize,
        color: tierColor,
        shards: TIER_CEREMONY_SHARDS,
        durationMs: TIER_CEREMONY_MS,
        intensity: own ? 1 : TEAMMATE_TOWER_MOMENT_INTENSITY,
        still,
        bornAt: now
      });
    }

    const labels = this.levelLabels;
    if (!labels || (decision && !decision.show && !decision.merge)) {
      return;
    }
    // Siradan seviyede etiket kadranin o seviyedeki renginde; kademede sutun
    // ve mermiyle ayni kademe renginde.
    const fill = toCssColor(tierMoment ? tierColor : getTowerLevelStyle(ceremony.level).color);
    const key = `level:${tower.id}`;
    if (decision?.merge) {
      labels.merge(key, ceremony.label, fill, LEVEL_LABEL_STROKE);
      return;
    }
    const bounds = getMapWorldBounds(this.selectedMapData);
    labels.spawn({
      key,
      text: ceremony.label,
      x: tower.x,
      y: labelY,
      fill,
      stroke: LEVEL_LABEL_STROKE,
      fontPx: own ? (tierMoment ? TIER_LABEL_FONT_PX : LEVEL_LABEL_FONT_PX) : TEAMMATE_LEVEL_LABEL_FONT_PX,
      alpha: own ? 1 : TEAMMATE_LEVEL_LABEL_ALPHA,
      pop: own && tierMoment,
      lifetimeMs: ceremony.labelMs,
      still,
      bounds
    }, now, decision?.recycle ?? false);
  }

  /**
   * Kulenin uzerinde parlama halkasi ve kisa bir nabiz.
   *
   * Yukseltme ve kart secimi ayni dili konusuyor: "bu kule az once guclendi".
   * `strong` buyuk ani isaretler -- kademe atlamak, tek kuleye baglanan kart.
   */
  private playTowerPulse(tower: Pick<TowerSnapshot, "id" | "x" | "y">, discSize: number, color: number, strong: boolean) {
    // Hareket azaltma: halka buyumeden yerinde soner, kule nabiz atmaz. Renk
    // ve an -- yani bilgi -- kaliyor, yalnizca hareket kalkiyor.
    if (this.feedback?.reducedMotion) {
      const radius = discSize * (strong ? 0.75 : 0.6);
      this.spawnFlashRing(tower.x, tower.y, {
        color,
        startRadius: radius,
        endRadius: radius,
        durationMs: strong ? 620 : 380,
        thickness: strong ? 3 : 2,
        depth: 13,
        fill: strong ? 0.2 : 0.1
      });
      return;
    }

    this.spawnFlashRing(tower.x, tower.y, {
      color,
      startRadius: discSize * 0.3,
      endRadius: discSize * (strong ? 1.5 : 0.95),
      durationMs: strong ? 620 : 380,
      thickness: strong ? 3 : 2,
      depth: 13,
      fill: strong ? 0.2 : 0.1
    });

    if (strong) {
      // Ikinci, gecikmeli halka: tek halka "bir sey oldu" der, iki halka
      // "onemli bir sey oldu" der.
      this.spawnFlashRing(tower.x, tower.y, {
        color: 0xffffff,
        startRadius: discSize * 0.15,
        endRadius: discSize * 1.05,
        durationMs: 420,
        thickness: 1.5,
        depth: 13.1
      });
    }

    this.punchTower(tower.id, strong);
  }

  /**
   * Kulenin kendisinin kisa nabzi; halka cagiranda (halka havuzu ya da
   * CombatVfx tamponu). Hareket azaltmada cagrilmamali.
   */
  private punchTower(towerId: string, strong: boolean) {
    const rendered = this.towers.get(towerId);
    if (rendered) {
      // Kulenin kendisi de tepki versin: kisa bir nabiz, sonra normale doner.
      // Tween carpanin uzerinde calisir, sprite'in olceginde degil -- olcek her
      // snapshot'ta yeniden hesaplandigi icin oraya yazilan bir deger silinirdi.
      // Carpani karede `updateAnimatedTowers` uyguluyor.
      this.tweens.killTweensOf(rendered.punch);
      rendered.punch.value = 1;
      // Kisa, sert bir sikisma (en fazla %6, asma yok): esneyen Back egrisi
      // ve 1.3 katlik pop sekerleme gibi ziplatiyordu.
      this.tweens.add({
        targets: rendered.punch,
        value: strong ? 1.06 : 1.04,
        duration: strong ? 70 : 50,
        ease: "Quad.easeOut",
        yoyo: true,
        onComplete: () => {
          rendered.punch.value = 1;
        }
      });
      this.animatedTowers.add(rendered);
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
    if (tower.status === "Hararet" || tower.status === "Tukenmis" || tower.disabled) {
      return 0x94a3b8;
    }
    if (tower.energyState && tower.energyState !== "powered") {
      return 0xf87171;
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
    // Kenar yapilarinin (duvar, Abarti) govdesi duragan: yalnizca durumu
    // degisince yeniden cizilir. Her karede cizilen govde, 40 duvarli sahada
    // telefonun kare suresinin buyuk kismini Phaser'in yeniden ucgenlemesine
    // harciyordu (2026-10 uretim kaydi).
    if (this.isEdgePlacedDefinition(tower.definitionId)) {
      const broken = tower.disabled === true || (tower.hp !== undefined && tower.hp <= 0);
      const key = `${tower.x}|${tower.y}|${tower.orientation ?? ""}|${tower.definitionId}|${tower.id === this.selectedPlacedTowerId}|${broken}|${tower.gate === true}|${this.getMapCellSize()}`;
      if (this.edgeBodyKeys.get(graphics) === key) return;
      this.edgeBodyKeys.set(graphics, key);
    }
    graphics.clear();
    this.renderTowerPerformanceFlames(graphics, tower);
    this.renderOrbitBlades(graphics, tower);
    if (tower.energyState && tower.energyState !== "powered") {
      const size = Math.max(5, this.getMapCellSize() * 0.14);
      graphics.fillStyle(0x7f1d1d, 0.94).fillCircle(tower.x + size * 1.9, tower.y - size * 1.9, size);
      graphics.lineStyle(Math.max(2, size * 0.35), 0xfef2f2, 1);
      graphics.lineBetween(tower.x + size * 1.45, tower.y - size * 2.35, tower.x + size * 2.35, tower.y - size * 1.45);
    }
    this.renderAbartiEdgeBody(graphics, tower);
    this.renderMelisGothicTowerRing(graphics, tower);
    this.renderMelisEvolutionStraps(graphics, tower);
    this.renderMelisFocusTowerEffect(graphics, tower);
    this.renderZeynepCommandTowerEffect(graphics, tower);
    this.renderServerReactorArcs(graphics, tower);
    this.renderUcubeWaveEffect(graphics, tower);
  }

  /** Kenar yapisi govdesinin son cizildigi durum (`renderTowerSpriteEffects`). */
  private readonly edgeBodyKeys = new WeakMap<Phaser.GameObjects.Graphics, string>();

  private readonly serverReactorInput: ServerReactorInput = { x: 0, y: 0, half: 0, rotation: 0, tier: 1, now: 0, still: false, alpha: 1 };

  /**
   * Sunucu'nun reaktor arklari (vfx/server-reactor.ts). Dokudaki boyali arklar
   * silindi; burada canli ve hafifce dalgalaniyorlar. Olcu dokunun ekrandaki
   * boyundan: secim ve inis olcegiyle birlikte buyuyor. Arklar bagin calistigi
   * surece yaniyor: yikik ya da devre disi (Tukenmis) Sunucu bag tasimiyor.
   */
  private renderServerReactorArcs(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.definitionId !== "warrior-2" || tower.disabled || tower.status === "Tukenmis") return;
    const base = this.towers.get(tower.id)?.base;
    if (!base) return;
    const input = this.serverReactorInput;
    input.x = base.x;
    input.y = base.y;
    input.half = base.displayWidth / 2;
    input.rotation = base.rotation;
    input.tier = toTier(getTowerTier(tower.level));
    input.now = Date.now();
    input.still = this.feedback?.reducedMotion ?? false;
    input.alpha = tower.ownerId === this.localSessionId ? 1 : TEAMMATE_EXTRA_ALPHA;
    drawServerReactorArcs(graphics, input);
  }

  /**
   * Testere acisinin snapshot'lar arasi gecisi: yeni aci geldiginde bir
   * oncekinden ona, snapshot araligi boyunca. Bicaklar 15 Hz'de basamakli
   * donuyordu; bir aralik gecikme karsiliginda akici.
   */
  private noteBladeAngle(towerId: string, angle: number, now: number) {
    const entry = this.bladeAngles.get(towerId);
    if (!entry) {
      this.bladeAngles.set(towerId, { from: angle, to: angle, at: now, interval: 60 });
      return;
    }
    if (entry.to === angle) return;
    entry.from = this.getBladeAngle(towerId, angle, now);
    entry.interval = Math.max(16, Math.min(250, now - entry.at));
    entry.to = angle;
    entry.at = now;
  }

  private getBladeAngle(towerId: string, fallback: number, now: number) {
    const entry = this.bladeAngles.get(towerId);
    if (!entry) return fallback;
    let turn = entry.to - entry.from;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    const t = Math.max(0, Math.min(1, (now - entry.at) / entry.interval));
    return entry.from + turn * t;
  }

  private renderOrbitBlades(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (tower.definitionId !== "onur-1" || tower.bladeAngle === undefined || tower.bladeLength === undefined) return;
    const definition = getOrbitDefinition(tower.definitionId);
    const bladeCount = definition?.engine?.attack.bladeCount ?? 2;
    const bladeWidth = Math.max(3, definition?.engine?.attack.width ?? 8);
    const bladeLength = tower.bladeLength;
    const baseAngle = this.getBladeAngle(tower.id, tower.bladeAngle, performance.now());
    // Govde cokgeninin oranlari paylasilan pakette (`ORBIT_BLADE_BODY`): sunucu
    // bicagin taradigi alani bu cokgenle hesapliyor (sivri uc boyun kendisinde).
    const inner = getOrbitBladeInner(this.getMapCellSize());
    const bladeBody = ORBIT_BLADE_BODY;
    for (let blade = 0; blade < bladeCount; blade += 1) {
      const angle = baseAngle + blade * Math.PI * 2 / bladeCount;
      const forwardX = Math.cos(angle);
      const forwardY = Math.sin(angle);
      // Noktalar modul duzeyindeki dizilerde: karede bicak basina yeni nokta yok.
      setBladePoint(BLADE_SHADOW, 0, tower.x, tower.y, forwardX, forwardY, inner - 1.5, -bladeWidth * 0.58);
      setBladePoint(BLADE_SHADOW, 1, tower.x, tower.y, forwardX, forwardY, inner - 1.5, bladeWidth * 0.58);
      setBladePoint(BLADE_SHADOW, 2, tower.x, tower.y, forwardX, forwardY, bladeLength + 2, bladeWidth * 0.08);
      setBladePoint(BLADE_SHADOW, 3, tower.x, tower.y, forwardX, forwardY, bladeLength * 0.87, -bladeWidth * 0.67);
      setBladePoint(BLADE_BODY, 0, tower.x, tower.y, forwardX, forwardY, inner, -bladeWidth * bladeBody.root);
      setBladePoint(BLADE_BODY, 1, tower.x, tower.y, forwardX, forwardY, inner, bladeWidth * bladeBody.root);
      setBladePoint(BLADE_BODY, 2, tower.x, tower.y, forwardX, forwardY, bladeLength * bladeBody.edgeAlong, bladeWidth * bladeBody.edge);
      setBladePoint(BLADE_BODY, 3, tower.x, tower.y, forwardX, forwardY, bladeLength, bladeWidth * bladeBody.tip);
      setBladePoint(BLADE_BODY, 4, tower.x, tower.y, forwardX, forwardY, bladeLength * bladeBody.spineAlong, bladeWidth * bladeBody.spine);
      setBladePoint(BLADE_EDGE, 0, tower.x, tower.y, forwardX, forwardY, inner + 1, -bladeWidth * 0.2);
      setBladePoint(BLADE_EDGE, 1, tower.x, tower.y, forwardX, forwardY, inner + 1, bladeWidth * 0.2);
      setBladePoint(BLADE_EDGE, 2, tower.x, tower.y, forwardX, forwardY, bladeLength * 0.77, bladeWidth * 0.33);
      setBladePoint(BLADE_EDGE, 3, tower.x, tower.y, forwardX, forwardY, bladeLength, bladeWidth * 0.05);
      setBladePoint(BLADE_EDGE, 4, tower.x, tower.y, forwardX, forwardY, bladeLength * 0.83, -bladeWidth * 0.18);
      const rootLeft = BLADE_BODY[0];
      const rootRight = BLADE_BODY[1];
      const cuttingTip = BLADE_BODY[3];
      const spineTip = BLADE_BODY[4];

      graphics.fillStyle(0x050a12, 0.92).fillPoints(BLADE_SHADOW, true);
      graphics.fillStyle(0x64748b, 1).fillPoints(BLADE_BODY, true);
      graphics.fillStyle(0xb8c4d1, 0.95).fillPoints(BLADE_EDGE, true);
      graphics.lineStyle(Math.max(1.2, bladeWidth * 0.18), 0xf8fafc, 1)
        .lineBetween(rootRight.x, rootRight.y, cuttingTip.x, cuttingTip.y);
      graphics.lineStyle(Math.max(0.8, bladeWidth * 0.1), 0x334155, 0.95)
        .lineBetween(rootLeft.x, rootLeft.y, spineTip.x, spineTip.y);
      graphics.fillStyle(0x0f172a, 1).fillCircle(rootLeft.x, rootLeft.y, bladeWidth * 0.22);
    }
  }

  private renderTowerPerformanceFlames(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    // Performansi olmayan yapi (duvar, kenar yapisi) alev almiyor; eskiden
    // varsayilan %50 ile her duvara gorunmez bir pilot alev ciziliyordu.
    if (tower.resourceProvider || tower.performance === undefined || this.isEdgePlacedDefinition(tower.definitionId)) return;
    const intensity = getTowerPerformanceFlameIntensity(tower.performance);
    // %50'deki pilot isik (%3 alfa) gorunmuyor ama kule basina ~225 cizim
    // komutu her karede yeniden ucgenleniyordu.
    if (intensity < PERFORMANCE_FLAME_MIN_INTENSITY) return;

    const cellSize = this.getMapCellSize();
    const footprintRadius = getTowerBodySize(tower.definitionId, cellSize * getTowerGridSpan(tower.definitionId)) * 0.47;
    const phase = performance.now() / 210;
    const flameCount = 5 + Math.round(intensity * 9);
    const glowAlpha = 0.025 + intensity * 0.13;

    graphics.fillStyle(0xef4444, glowAlpha);
    graphics.fillCircle(tower.x, tower.y, footprintRadius * (1.08 + intensity * 0.32));
    graphics.lineStyle(1 + intensity * 2.2, 0xf97316, 0.12 + intensity * 0.58);
    graphics.strokeCircle(tower.x, tower.y, footprintRadius * (0.95 + Math.sin(phase) * 0.035));

    for (let index = 0; index < flameCount; index += 1) {
      const angle = (index / flameCount) * Math.PI * 2 + Math.sin(phase * 0.42 + index * 1.7) * 0.09;
      const flicker = 0.72 + Math.sin(phase * 1.65 + index * 2.31) * 0.2 + Math.sin(phase * 2.7 + index) * 0.08;
      const baseDistance = footprintRadius * (0.82 + intensity * 0.08);
      const flameHeight = cellSize * (0.07 + intensity * 0.36) * flicker;
      const halfWidth = cellSize * (0.018 + intensity * 0.075);
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      const tangentX = -radialY;
      const tangentY = radialX;
      const baseX = tower.x + radialX * baseDistance;
      const baseY = tower.y + radialY * baseDistance;
      const tipX = baseX + radialX * flameHeight;
      const tipY = baseY + radialY * flameHeight;

      graphics.fillStyle(0xef4444, 0.06 + intensity * 0.2);
      graphics.fillCircle(tipX, tipY, halfWidth * (1.8 + intensity));
      graphics.fillStyle(0xf97316, 0.18 + intensity * 0.7);
      graphics.fillTriangle(
        baseX + tangentX * halfWidth, baseY + tangentY * halfWidth,
        baseX - tangentX * halfWidth, baseY - tangentY * halfWidth,
        tipX, tipY
      );
      graphics.fillStyle(0xfacc15, 0.12 + intensity * 0.78);
      graphics.fillTriangle(
        baseX + tangentX * halfWidth * 0.42, baseY + tangentY * halfWidth * 0.42,
        baseX - tangentX * halfWidth * 0.42, baseY - tangentY * halfWidth * 0.42,
        baseX + radialX * flameHeight * 0.58, baseY + radialY * flameHeight * 0.58
      );

      if (intensity > 0.55 && index % 2 === 0) {
        const emberDistance = flameHeight * (1.25 + ((index * 37) % 5) * 0.08);
        graphics.fillStyle(index % 4 === 0 ? 0xfef08a : 0xfb923c, 0.3 + intensity * 0.55);
        graphics.fillCircle(
          baseX + radialX * emberDistance + tangentX * Math.sin(phase + index) * halfWidth,
          baseY + radialY * emberDistance + tangentY * Math.sin(phase + index) * halfWidth,
          Math.max(0.7, halfWidth * 0.28)
        );
      }
    }
  }

  private renderAbartiEdgeBody(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    if (!this.isEdgePlacedDefinition(tower.definitionId)) {
      return;
    }

    const segments = this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation ?? "horizontal", this.getEdgeLength(tower.definitionId));
    const selected = tower.id === this.selectedPlacedTowerId;
    // Yikilan yapi haritadan silinmez -- onarilabilmesi buna bagli -- ama ayakta
    // duruyormus gibi de gorunmemeli: govde sonuyor ve ortasindan aciliyor.
    const broken = tower.disabled === true || (tower.hp !== undefined && tower.hp <= 0);
    // Cekirdek nabzi yok: govde duragan cizilip onbellekte tutuluyor.
    const pulse = 0.78;
    const thickness = Math.max(5, this.getMapCellSize() * 0.16) * TOWER_VISUAL_SCALE;
    const glowWidth = thickness * (selected ? 4.2 : 3.2);
    const coreWidth = Math.max(2, thickness * 0.42);

    for (const segment of segments) {
      const bounds = this.getAbartiEdgeSegmentRect(segment);
      const rect = {
        left: tower.x + (bounds.left - tower.x) * TOWER_VISUAL_SCALE,
        right: tower.x + (bounds.right - tower.x) * TOWER_VISUAL_SCALE,
        top: tower.y + (bounds.top - tower.y) * TOWER_VISUAL_SCALE,
        bottom: tower.y + (bounds.bottom - tower.y) * TOWER_VISUAL_SCALE
      };
      const horizontal = segment.orientation !== "vertical";
      const x1 = horizontal ? rect.left : (rect.left + rect.right) / 2;
      const y1 = horizontal ? (rect.top + rect.bottom) / 2 : rect.top;
      const x2 = horizontal ? rect.right : (rect.left + rect.right) / 2;
      const y2 = horizontal ? (rect.top + rect.bottom) / 2 : rect.bottom;

      if (broken) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const stump = 0.34;
        const ax = x1 + (midX - x1) * (1 - stump);
        const ay = y1 + (midY - y1) * (1 - stump);
        const bx = x2 + (midX - x2) * (1 - stump);
        const by = y2 + (midY - y2) * (1 - stump);
        graphics.lineStyle(thickness * 1.1, 0x1e1b4b, 0.55);
        graphics.lineBetween(x1, y1, ax, ay);
        graphics.lineBetween(x2, y2, bx, by);
        graphics.lineStyle(coreWidth * 0.8, selected ? 0xcbd5f5 : 0x64748b, 0.5);
        graphics.lineBetween(x1, y1, ax, ay);
        graphics.lineBetween(x2, y2, bx, by);
        graphics.fillStyle(0x475569, 0.5);
        graphics.fillCircle(ax, ay, thickness * 0.3);
        graphics.fillCircle(bx, by, thickness * 0.3);
        continue;
      }

      // Kapili duvar ortasindan aciliyor: govde iki yana cekiliyor ve
      // aradaki bosluk kehribar rengi iki sovele isaretleniyor. Yikilan
      // duvarin acilisindan rengiyle ayriliyor -- biri kayip, oteki karar.
      const gateRatio = tower.gate === true ? 0.34 : 0;
      const gx1 = x1 + (x2 - x1) * (0.5 - gateRatio / 2);
      const gy1 = y1 + (y2 - y1) * (0.5 - gateRatio / 2);
      const gx2 = x1 + (x2 - x1) * (0.5 + gateRatio / 2);
      const gy2 = y1 + (y2 - y1) * (0.5 + gateRatio / 2);
      const halves: Array<[number, number, number, number]> = gateRatio > 0
        ? [[x1, y1, gx1, gy1], [gx2, gy2, x2, y2]]
        : [[x1, y1, x2, y2]];

      for (const [ax, ay, bx, by] of halves) {
        graphics.lineStyle(glowWidth, 0x7c3aed, selected ? 0.3 : 0.18);
        graphics.lineBetween(ax, ay, bx, by);
        graphics.lineStyle(thickness * 1.45, 0x2e1065, 0.94);
        graphics.lineBetween(ax, ay, bx, by);
        graphics.lineStyle(thickness * 0.9, 0x6d28d9, 0.94);
        graphics.lineBetween(ax, ay, bx, by);
        graphics.lineStyle(coreWidth, selected ? 0xfdf2f8 : 0xc4b5fd, pulse);
        graphics.lineBetween(ax, ay, bx, by);
      }

      graphics.fillStyle(selected ? 0xfdf2f8 : 0xa78bfa, selected ? 0.9 : 0.72);
      graphics.fillCircle(x1, y1, thickness * 0.55);
      graphics.fillCircle(x2, y2, thickness * 0.55);
      if (gateRatio > 0) {
        graphics.fillStyle(0xf59e0b, 0.95);
        graphics.fillCircle(gx1, gy1, thickness * 0.42);
        graphics.fillCircle(gx2, gy2, thickness * 0.42);
      }
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
    // Surekli faz: `% 1100` ile isaretlerin 0.32 turluk donusu her turda basa sicriyordu.
    const phase = (performance.now() + tower.x * 13 + tower.y * 7) / 1100;
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
    if (this.isEdgePlacedDefinition(tower.definitionId) || tower.status === "Hararet" || tower.status === "Tukenmis") {
      return;
    }

    const commands = this.zeynepCommandEffects;
    if (!commands?.haste && !commands?.range) {
      return;
    }

    // Faz surekli: `(now % 1000) / 1000` ile carpilan 1.7 ve -0.65 tam sayi
    // olmadigi icin isaretler her saniye basa sicriyordu.
    const phase = performance.now() / 1000;
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

  private renderUcubeWaveEffect(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot) {
    // Halkalar secilen ozellik sayisini gosterir: oyuncu kulenin ne kadar
    // ilerledigini haritadan okuyabilsin. Kulenin kenarinda, seviye kadraninin
    // hemen icinde (tas bilezigin ustunde) donuyorlar: ortadaki top ve namlu
    // ortulmuyor. Olcu kule izinden, yani 2x2 Ucube'de iki kare eninde.
    const perkCount = tower.ucubePerks?.length ?? 0;
    if (tower.definitionId !== "warrior-6" || perkCount < 2 || tower.status === "Hararet" || tower.status === "Tukenmis") {
      return;
    }

    const waveCount = perkCount >= 3 ? 4 : 2;
    const phase = (Date.now() % 900) / 900;
    const effectScale = this.getTowerEffectScale();
    const discRadius = getTowerBodySize(tower.definitionId, this.getMapCellSize() * getTowerGridSpan(tower.definitionId)) / 2;
    const jagUnit = discRadius * 0.03;
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex += 1) {
      const radius = discRadius * (0.84 + waveIndex * 0.022);
      const segments = 18 + waveIndex * 2;
      const offset = phase * Math.PI * 2 + waveIndex * 0.85;
      graphics.lineStyle((waveIndex % 2 === 0 ? 1.5 : 1) * effectScale, 0xffffff, perkCount >= 3 ? 0.86 : 0.66);
      graphics.beginPath();
      for (let pointIndex = 0; pointIndex <= segments; pointIndex += 1) {
        const angle = offset + (pointIndex / segments) * Math.PI * 2;
        const jag = (pointIndex % 2 === 0 ? 1 : -0.7) * jagUnit;
        // Seviye kadrani `discRadius - 1`de: halkalar onun icinde kaliyor.
        const clampedRadius = Phaser.Math.Clamp(radius + jag, discRadius * 0.78, discRadius * 0.92);
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

  /**
   * Merminin dokusu: kulenin kendi cizimi; yoksa turun jenerik dokusu.
   *
   * Kademe varyantlari (--t2/--t3) emekli: kademe artik profilin kesitinden,
   * izinden ve rengiden geliyor, dokunun cevresine eklenen genel haleden degil.
   * Sunucu ozel atislara son ek veriyor ("archer-6-whisper"); doku kulenin
   * kendisi. Eskiden bu anahtar bulunamiyor, Fisilti Korosu beyaz yedek
   * noktayla ciziliyordu.
   */
  private getProjectileTextureKey(projectile: Pick<ProjectileSnapshot, "definitionId" | "kind">) {
    const definitionId = projectile.definitionId;
    if (definitionId && this.textures.exists(`projectile-${definitionId}`)) return `projectile-${definitionId}`;
    const towerId = getProfileDefinitionId(definitionId);
    if (towerId && this.textures.exists(`projectile-${towerId}`)) return `projectile-${towerId}`;
    return `projectile-${projectile.kind}`;
  }

  private readonly activeProjectileIds = new Set<string>();

  private renderProjectiles(projectiles: ProjectileSnapshot[]) {
    const scale = this.getTowerEffectScale();
    // Govde, iz ve kademe eklentileri profilden (attack-vfx). Kendi cizilmis
    // dokusu olan Melis mermileri disinda sprite gizli: siluet profilden.
    this.attackVfx?.renderProjectiles(projectiles, performance.now(), scale, this.projectileOwnResolver);
    const activeIds = this.activeProjectileIds;
    activeIds.clear();
    for (const projectile of projectiles) activeIds.add(projectile.id);

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
      const fromTower = projectile.source === "tower";
      const profile = fromTower ? getVfxProfile(projectile.definitionId) : undefined;
      const showSprite = !profile || profile.silhouette === "sprite";
      let sprite = this.projectiles.get(projectile.id);
      if (!showSprite) {
        // Gizli mermiye sprite acilmiyor: govdesi profilin cizimi.
        if (sprite?.visible) sprite.setVisible(false);
        continue;
      }
      const texture = this.getProjectileTextureKey(projectile);

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
      if (!sprite.visible) sprite.setVisible(true);
      sprite.setPosition(projectile.x, projectile.y);
      if (profile) {
        // Siluet profilden (12-16 birim), carpisma boyundan (8) degil. Kademe
        // 2-3te doku beyaz-sicak cekirdege dogru isiniyor (pastel ara ton yok).
        const recipe = getVfxTier(profile, projectile.tier);
        const size = recipe.silhouette * scale * PROJECTILE_VISUAL_SCALE;
        sprite.setDisplaySize(size, size);
        const tint = toTier(projectile.tier) >= 2 ? recipe.core : 0xffffff;
        if (sprite.tintTopLeft !== tint) sprite.setTint(tint);
      } else {
        // Havuzdan gelen sprite onceki bir Melis mermisinin tonunu tasiyabilir.
        if (sprite.tintTopLeft !== 0xffffff) sprite.clearTint();
        if (projectile.hitType === "projectile" || projectile.hitType === "impact") {
          // Kulesiz (dusman kaynakli) mermi: kendi dokusu sabit boyda; isabet sekli
          // kule mermilerinde cizilen govdeden (`projectile-body`), bunda yok.
          const diameter = projectile.hitType === "impact" ? 16 : 8;
          sprite.setDisplaySize(diameter, diameter);
        } else {
          sprite.setScale(scale);
        }
      }
      if (typeof projectile.vx === "number" && typeof projectile.vy === "number" && Math.abs(projectile.vx) + Math.abs(projectile.vy) > 0.01) {
        sprite.setRotation(Math.atan2(projectile.vy, projectile.vx));
      }
      const isMelisProjectile = projectile.definitionId?.startsWith("archer-");
      sprite.setAlpha(isMelisProjectile ? 0.92 : 1);
      // Derinlik her karede yeniden yazilinca Phaser her karede sahneyi siraliyor.
      const depth = isMelisProjectile ? 11.2 : 11;
      if (sprite.depth !== depth) sprite.setDepth(depth);
    }
  }

  private renderDrones(drones: DroneSnapshot[]) {
    const activeIds = new Set(drones.map((drone) => drone.id));

    for (const [id, sprite] of this.drones) {
      if (!activeIds.has(id)) {
        // Yaralanmisken kaybolan isci oldu; sagligi yerindeyken kaybolan
        // ise haritanin ya da odanin degismesiyle silinmistir. Ikisini
        // ayirmadan patlatmak, her dalga sonunda ekrani patlatirdi.
        if (this.hasarliIsciler.has(id)) {
          this.showWorkerDeathBurst(sprite.x, sprite.y);
        }
        sprite.destroy();
        this.drones.delete(id);
      }
    }
    for (const id of this.hasarliIsciler) {
      if (!activeIds.has(id)) this.hasarliIsciler.delete(id);
    }

    const pulse = 1 + Math.sin(Date.now() / 90) * 0.08;
    const mapEntityScale = this.getMapCellSize() / TOWER_GRID_SIZE;
    // Gizlenen govdeyle ayni derinlikte: besgen govdenin yerini aliyor, altina
    // konan bir sus degil.
    const govdeler = this.advancedWorkerGraphics ?? (this.advancedWorkerGraphics = this.add.graphics().setDepth(42));
    govdeler.clear();
    for (const drone of drones) {
      const texture = drone.mode === "repair" || drone.mode === "repairer" || drone.mode === "crystalCollector" || drone.mode === "energyTransport" ? "drone-repair" : "drone-attack";
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
      const isLogisticsWorker = (HIRABLE_WORKER_ROLES as readonly string[]).includes(drone.mode);
      // Lojistik iscinin govdesi gorunuste %10 kucuk (visual-scale); yol ve
      // secme alani ayni. Operator bedenleri bundan bagimsiz (operator-bodies).
      // Ulti dronlari (saldiri, onarim) gorunuste 2/3 (visual-scale).
      const workerScale = isLogisticsWorker ? 0.69 * 0.75 * WORKER_VISUAL_SCALE : (drone.mode === "attack" ? ATAKAN_ATTACK_DRONE_BODY.spriteScale : 1.38) * ATAKAN_ULTIMATE_DRONE_VISUAL_SCALE;
      sprite.setScale(workerScale * mapEntityScale * pulse);
      sprite.setAlpha(drone.mode === "attack" ? 1 : 0.95);
      const tint = drone.mode === "crystalCollector" ? 0xa78bfa : drone.mode === "ammoCollector" ? 0x84cc16 : drone.mode === "energyTransport" ? 0x22d3ee : drone.mode === "ammoTransport" ? 0xf59e0b : drone.mode === "repairer" ? 0xf472b6 : 0xffffff;
      sprite.setTint(tint);
      sprite.setBlendMode(Phaser.BlendModes.ADD);
      // Gelismis isci ayni boyutta ama baska bir sekil: yuvarlak govde
      // yerine besgen. Ayirt edici olan olcu degil siluet oldugu icin yuk
      // tasirken buyuyup kuculmesi kademeyi bulanistirmiyor.
      sprite.setVisible(!drone.advanced);
      if (drone.advanced) {
        this.drawAdvancedWorkerBody(govdeler, drone, tint, sprite.displayWidth * ADVANCED_WORKER_BODY_RADIUS_RATIO, sprite.rotation);
      }
      // Can cubugu yalnizca yaralida: her iscinin ustunde duran dolu bir
      // cubuk, dolu olmayan tek cubugu gorunmez kilardi.
      const maxHp = drone.maxHp ?? 0;
      const hp = drone.hp ?? maxHp;
      if (maxHp > 0 && hp < maxHp) {
        this.hasarliIsciler.add(drone.id);
        this.drawWorkerHealthBar(govdeler, drone, hp / maxHp, sprite.displayWidth);
      } else {
        this.hasarliIsciler.delete(drone.id);
      }
      if (drone.mode === "repairer" && drone.repairing && drone.targetTowerId) {
        const target = this.towerSnapshots.get(drone.targetTowerId);
        if (target && (target.hp ?? 1) > 0) this.drawWorkerWelding(govdeler, drone, target, mapEntityScale);
      }
    }
  }

  /** Kaynak noktasinda beyaz-mavi ark, metal yansimasi ve sicrayan kivilcimlar. */
  private drawWorkerWelding(
    graphics: Phaser.GameObjects.Graphics,
    worker: DroneSnapshot,
    target: TowerSnapshot,
    scale: number
  ) {
    const seed = [...worker.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const time = this.time.now;
    const angle = Math.atan2(target.y - worker.y, target.x - worker.x);
    const distance = Math.hypot(target.x - worker.x, target.y - worker.y);
    const reach = Math.max(0, distance - 8 * scale);
    const x = worker.x + Math.cos(angle) * reach;
    const y = worker.y + Math.sin(angle) * reach;
    const flicker = 0.65 + 0.35 * Math.sin(time / 23 + seed) ** 2;
    graphics.fillStyle(0x38bdf8, 0.12 * flicker);
    graphics.fillCircle(x, y, 12 * scale);
    graphics.fillStyle(0xbae6fd, 0.25 * flicker);
    graphics.fillEllipse(x + Math.cos(angle) * 4 * scale, y + Math.sin(angle) * 4 * scale, 13 * scale, 7 * scale);
    const startX = x - Math.cos(angle) * 7 * scale;
    const startY = y - Math.sin(angle) * 7 * scale;
    const jitter = Math.sin(time / 17 + seed) * 2.5 * scale;
    for (const [width, color, alpha] of [[3, 0x38bdf8, 0.45], [1, 0xe0f2fe, 0.95]]) {
      graphics.lineStyle(width * scale, color, alpha * flicker);
      graphics.beginPath();
      graphics.moveTo(startX, startY);
      graphics.lineTo((startX + x) / 2 - Math.sin(angle) * jitter, (startY + y) / 2 + Math.cos(angle) * jitter);
      graphics.lineTo(x, y);
      graphics.strokePath();
    }
    graphics.fillStyle(0xffffff, flicker);
    graphics.fillCircle(x, y, 2 * scale);
    // Analitik parcaciklar: her karede yeni obje/tween olusturmadan kisa,
    // yercekimiyle kivrilan metal capaklari. Her isci farkli fazda parlar.
    for (let i = 0; i < 7; i++) {
      const age = ((time + seed * 13 + i * 47) % 360) / 360;
      const direction = angle + Math.PI + Math.sin(seed + i * 2.4) * 1.9;
      const speed = (12 + i * 2) * scale;
      const sx = x + Math.cos(direction) * speed * age;
      const sy = y + Math.sin(direction) * speed * age + 12 * scale * age * age;
      graphics.lineStyle((i % 2 ? 1 : 1.4) * scale, i % 3 ? 0xfbbf24 : 0xe0f2fe, (1 - age) * flicker);
      graphics.lineBetween(sx, sy, sx - Math.cos(direction) * 2.5 * scale, sy - Math.sin(direction) * 2.5 * scale);
    }
  }

  /**
   * Iscilere kapatilan kareler.
   *
   * Gorunmeyen bir yasak kullanilamaz: oyuncu hangi kareyi kapattigini
   * hatirlamak zorunda kalirdi ve ikinci kez basip yanlislikla acardi.
   *
   * Cizim yalnizca oyuncunun kendi yasaklarini gosteriyor -- yasak zaten
   * oyuncu basina ve baskasinin tercihini haritada gormek kafa karistirirdi.
   */
  private renderWorkerBannedCells() {
    const graphics = this.workerBanGraphics ?? (this.workerBanGraphics = this.add.graphics().setDepth(9.6));
    graphics.clear();
    const cells = this.localPlayerSnapshot?.workerBannedCells ?? [];
    if (cells.length === 0) return;

    const cellSize = this.getMapCellSize();
    const origin = getMapOrigin(this.selectedMapData);
    const inset = cellSize * 0.18;
    for (const key of cells) {
      const [col, row] = key.split(":").map(Number);
      if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
      const left = origin.x + col * cellSize;
      const top = origin.y + row * cellSize;
      graphics.fillStyle(0xf43f5e, 0.16);
      graphics.fillRect(left, top, cellSize, cellSize);
      graphics.lineStyle(1.5, 0xfb7185, 0.75);
      graphics.strokeRect(left + 1, top + 1, cellSize - 2, cellSize - 2);
      // Capraz: kareyi kapali okutan sey renk degil sekil.
      graphics.lineStyle(2, 0xfb7185, 0.85);
      graphics.lineBetween(left + inset, top + inset, left + cellSize - inset, top + cellSize - inset);
      graphics.lineBetween(left + cellSize - inset, top + inset, left + inset, top + cellSize - inset);
    }
  }

  /** Yarali iscinin ustundeki ince cubuk. */
  private drawWorkerHealthBar(
    graphics: Phaser.GameObjects.Graphics,
    drone: DroneSnapshot,
    ratio: number,
    bodyWidth: number
  ) {
    const width = Math.max(12, bodyWidth * 0.9);
    const height = 2;
    const x = drone.x - width / 2;
    const y = drone.y - bodyWidth * 0.7;
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    graphics.fillStyle(0x020617, 0.9).fillRect(x - 1, y - 1, width + 2, height + 2);
    graphics.fillStyle(clamped > 0.5 ? 0x22c55e : clamped > 0.25 ? 0xf59e0b : 0xef4444, 1)
      .fillRect(x, y, width * clamped, height);
  }

  /**
   * Olen iscinin yerinde kalan kisa isaret.
   *
   * Isci sessizce kayboluyordu ve oyuncu lojistigin neden durdugunu ancak
   * kule yakiti bitince fark ediyordu. Patlama kucuk ve kirmizi: bu bir
   * kayip, bir efekt degil.
   */
  private showWorkerDeathBurst(x: number, y: number) {
    const ring = this.add.circle(x, y, 6, 0xef4444, 0)
      .setStrokeStyle(2, 0xfca5a5, 0.9)
      .setDepth(43);
    this.tweens.add({
      targets: ring,
      radius: 18,
      alpha: 0,
      duration: 320,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy()
    });
  }

  /**
   * Gelismis isciyi besgen olarak cizer.
   *
   * Govdenin yerini aliyor, ustune eklenmiyor: iki kademe ayni olcude
   * durdugu icin ayrimi tasiyan tek sey siluet. Yaricap gizlenen govdenin
   * kendi genisliginden okunuyor, boylece iki kademe her harita olceginde
   * ayni yeri kapliyor ve yuk nabzi ikisinde de ayni.
   *
   * Bir kose yurune yone bakiyor: besgen dairenin aksine yonunu
   * gosterebilir, yani sekil hem kademeyi hem gidisi anlatiyor.
   */
  private drawAdvancedWorkerBody(
    graphics: Phaser.GameObjects.Graphics,
    drone: DroneSnapshot,
    tint: number,
    radius: number,
    rotation: number
  ) {
    const points: Phaser.Geom.Point[] = [];
    for (let i = 0; i < 5; i += 1) {
      const angle = rotation + (i * Math.PI * 2) / 5;
      points.push(new Phaser.Geom.Point(drone.x + Math.cos(angle) * radius, drone.y + Math.sin(angle) * radius));
    }
    graphics.fillStyle(tint, 0.92);
    graphics.fillPoints(points, true);
    // Ince beyaz kontur: rol rengi koyu zeminde erirken silueti tutan sey.
    graphics.lineStyle(Math.max(1, radius * 0.18), 0xffffff, 0.7);
    graphics.strokePoints(points, true, true);
  }

  private drawTowerHealthBar(graphics: Phaser.GameObjects.Graphics, tower: TowerSnapshot, discSize: number) {
    const width = Math.max(22, discSize * 0.88);
    const height = 3;
    const x = tower.x - width / 2;
    const y = tower.y - discSize / 2 - TOWER_HEALTH_BAR_LIFT_PX;
    const ratio = Phaser.Math.Clamp((tower.hp ?? 0) / Math.max(1, tower.maxHp ?? 1), 0, 1);
    // Tam canda cubuk yok (iscilerde de oyle); cubuk yalnizca degisince
    // yeniden ciziliyor. Duz dikdortgen: yuvarlak kose her karede yeniden
    // ucgenleniyordu.
    const full = ratio >= 1;
    const key = full ? "full" : `${x}|${y}|${width}|${Math.round(ratio * width)}`;
    if (this.healthBarKeys.get(graphics) === key) return;
    this.healthBarKeys.set(graphics, key);
    graphics.clear();
    graphics.setVisible(!full);
    if (full) return;
    graphics.fillStyle(0x020617, 0.94).fillRect(x - 1, y - 1, width + 2, height + 2);
    graphics.fillStyle(ratio > 0.5 ? 0x22c55e : ratio > 0.2 ? 0xf59e0b : 0xef4444, 1)
      .fillRect(x, y, width * ratio, height);
  }

  /** Can cubugunun son cizildigi durum (`drawTowerHealthBar`). */
  private readonly healthBarKeys = new WeakMap<Phaser.GameObjects.Graphics, string>();

  /**
   * Secili yapinin haritadaki paneli.
   *
   * Duvarda kaynak paneli **cizilmiyor**: mühimmat, enerji, isi ve
   * performans cubuklarinin dordu de duvarda anlamsiz. Panel yok ama satis
   * tusu duruyor -- haritada satmanin tek yeri orasi. Panel yuksekligi
   * sifira inince tus kulenin hemen altina oturuyor.
   */
  /**
   * Secili yapinin haritadaki panelinin ve satis tusunun yeri.
   *
   * Cizim ve kule panelinin (`tower-sheet`) hangi kenara yaslanacagi ayni
   * hesabi okuyor: panel yalnizca kulenin merkezine bakinca kulenin altindaki
   * cubuklari ortebiliyordu.
   *
   * Panel kulenin altina; harita orada bitiyorsa ustune. Ustteyken satis tusu
   * da panelin ustune cikiyor: eskiden panelin altinda kaliyor ve haritanin
   * alt kisimdaki kulenin tam uzerine oturuyordu.
   */
  private getSelectedResourceLayout(tower: TowerSnapshot, discSize: number, options: { ignoreSheet?: boolean } = {}) {
    const showsResources = this.acceptsTowerOperation(tower) || Boolean(tower.resourceProvider);
    const panelWidth = Math.max(147, Math.min(169, discSize * 1.6));
    const panelHeight = showsResources ? 98 : 0;
    const canSell = this.canSellSelectedTower(tower);
    const sellSpace = canSell ? SELL_BUTTON_HEIGHT + 4 : 0;
    // Kulenin govdesi ve ustundeki can cubugu: panel bunlari da ortmuyor.
    const towerTop = tower.y - discSize / 2 - TOWER_HEALTH_BAR_LIFT_PX - 4;
    const towerBottom = tower.y + discSize / 2 + 1;
    const towerHalfWidth = Math.max(12, discSize / 2) + 1;
    const towerRect = { left: tower.x - towerHalfWidth, right: tower.x + towerHalfWidth, top: towerTop, bottom: towerBottom };
    // Cizilebilen alan: harita ile ekranda gorunen bandin (ust cubugun alti,
    // alt barin ustu) kesisimi.
    const bounds = getMapWorldBounds(this.selectedMapData);
    const view = this.cameras.main?.worldView;
    const visible = Boolean(view && view.height > 0 && view.width > 0);
    const area = view && visible
      ? {
        left: Math.max(bounds.left, view.x),
        right: Math.min(bounds.right, view.right),
        top: Math.max(bounds.top, view.y + view.height * this.arenaChrome.topRatio),
        bottom: Math.min(bounds.bottom, view.y + view.height * (1 - this.arenaChrome.bottomRatio))
      }
      : { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
    // Kule paneli (DOM) ekranda nerede: dunyaya cevrilip engel. Panelin
    // kenarini secen hesap (`getTowerSheetDock`) engelsiz yeri okuyor; yoksa
    // panelin kenari kendi yerine bagli kalirdi.
    const sheet = this.towerSheetRect;
    const blockers = !options.ignoreSheet && sheet?.visible && view && visible ? [screenRatioRectToWorld(sheet, view)] : [];
    const placement = placeSelectedPanel({
      tower: towerRect,
      width: panelWidth,
      height: panelHeight + sellSpace,
      area,
      blockers,
      gap: 6,
      margin: 4,
      previous: this.selectedResourceSide?.towerId === tower.id ? this.selectedResourceSide.side : undefined
    });
    if (placement.side === "hidden") {
      return {
        showsResources: false, hidden: true, side: undefined, panelX: 0, panelY: 0, panelWidth, panelHeight: 0,
        sell: undefined, top: towerTop, bottom: towerBottom
      };
    }
    // Ustte satis tusu panelin ustunde (kuleden uzakta); diger yerlerde altinda.
    const panelX = placement.left;
    const panelY = placement.side === "above" ? placement.top + sellSpace : placement.top;
    const sell = canSell
      ? { x: panelX + 10, y: placement.side === "above" ? placement.top : panelY + panelHeight + 4, width: panelWidth - 20, height: SELL_BUTTON_HEIGHT }
      : undefined;
    return {
      showsResources,
      hidden: false,
      side: placement.side,
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      sell,
      top: Math.min(towerTop, placement.top),
      bottom: Math.max(towerBottom, placement.top + placement.height)
    };
  }

  private drawSelectedTowerResources(tower: TowerSnapshot, discSize: number) {
    const graphics = this.selectedResourceGraphics ?? this.add.graphics().setDepth(66);
    this.selectedResourceGraphics = graphics;
    graphics.clear().setVisible(true);
    const { showsResources, hidden, side, panelX, panelY, panelWidth, panelHeight, sell: sellRect } = this.getSelectedResourceLayout(tower, discSize);
    // Kule paneliyle ortusmeyen bir yer yoksa harita paneli cizilmiyor; ayni
    // sayilar kule panelinde (stok ve Kaynak bolumu), satis alt seridinde.
    this.selectedResourceSide = side ? { towerId: tower.id, side } : undefined;
    const barX = panelX + 10;
    const barWidth = panelWidth - 20;
    const barHeight = 6;
    const ammoBarY = panelY + 16;
    const energyBarY = panelY + 38;
    const temperatureBarY = panelY + 60;
    const performanceBarY = panelY + 82;
    // Satis kulenin oldugu yerde: alt bar tek satira indigi icin oradan cikti,
    // ve zaten dogru yer burasi -- oyuncu hangi kuleyi sattigini gorerek basiyor.
    this.sellButtonRect = sellRect;
    const hasPerformanceControl = !hidden && this.acceptsTowerOperation(tower);
    const usesAmmo = tower.resourceProvider === "ammunition" || tower.shotFuel !== "energy";
    const ammoRatio = Phaser.Math.Clamp((tower.ammo ?? 0) / Math.max(1, tower.maxAmmo ?? 1), 0, 1);
    const energyRatio = Phaser.Math.Clamp((tower.energy ?? 0) / Math.max(1, tower.maxEnergy ?? 1), 0, 1);
    const temperatureRatio = Phaser.Math.Clamp((tower.temperature ?? 0) / 100, 0, 1);
    const hasMisfortune = tower.characterId === "onur" && tower.misfortune !== undefined;
    const misfortuneRatio = Phaser.Math.Clamp((tower.misfortune ?? 0) / 100, 0, 1);
    const rawAmmoRatio = Phaser.Math.Clamp((tower.rawAmmo ?? 0) / Math.max(1, tower.maxRawAmmo ?? 1), 0, 1);
    const isAmmoFactory = tower.resourceProvider === "ammunition";
    const serverPerformance = Phaser.Math.Clamp(tower.performance ?? 0.5, 0, 1);
    if (!this.performanceSliderDragging && this.optimisticPerformance?.towerId === tower.id && Math.abs(serverPerformance - this.optimisticPerformance.value) < 0.015) {
      this.optimisticPerformance = undefined;
    }
    const performanceRatio = Phaser.Math.Clamp(
      this.optimisticPerformance?.towerId === tower.id ? this.optimisticPerformance.value : serverPerformance,
      0,
      1
    );
    // Cubuk blogunun disinda da okunuyor: sicaklik ve sans etiketleri bu
    // yarim genislige gore yerlesiyor.
    const splitBarWidth = (barWidth - 4) / 2;
    // Cubuklarin tamami kule isi. Duvarda hicbiri cizilmiyor.
    if (showsResources) {
      graphics.fillStyle(0x020617, 0.96).fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 6);
      graphics.lineStyle(1.5, 0x64748b, 0.9).strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 6);
      graphics.fillStyle(0x172033, 1).fillRoundedRect(barX, ammoBarY, barWidth, barHeight, 3);
      if (usesAmmo) {
        graphics.fillStyle(0xf59e0b, 1).fillRoundedRect(barX, ammoBarY, barWidth * ammoRatio, barHeight, 3);
      } else {
        graphics.fillStyle(0x475569, 0.9).fillRoundedRect(barX, ammoBarY, barWidth, barHeight, 3);
        graphics.lineStyle(2, 0xf87171, 0.95);
        graphics.lineBetween(barX + 2, ammoBarY + 1, barX + barWidth - 2, ammoBarY + barHeight - 1);
        graphics.lineBetween(barX + 2, ammoBarY + barHeight - 1, barX + barWidth - 2, ammoBarY + 1);
      }
      graphics.fillStyle(0x172033, 1).fillRoundedRect(barX, energyBarY, barWidth, barHeight, 3);
      graphics.fillStyle(0x22d3ee, 1).fillRoundedRect(barX, energyBarY, barWidth * energyRatio, barHeight, 3);
      const temperatureBarWidth = hasMisfortune ? splitBarWidth : barWidth;
      graphics.fillStyle(0x172033, 1).fillRoundedRect(barX, temperatureBarY, temperatureBarWidth, barHeight, 3);
      graphics.fillStyle(isAmmoFactory ? 0x84cc16 : temperatureRatio > 0.75 ? 0xef4444 : temperatureRatio > 0.5 ? 0xf97316 : 0xfacc15, 1)
        .fillRoundedRect(barX, temperatureBarY, temperatureBarWidth * (isAmmoFactory ? rawAmmoRatio : temperatureRatio), barHeight, 3);
      if (hasMisfortune) {
        const misfortuneBarX = barX + splitBarWidth + 4;
        graphics.fillStyle(0x172033, 1).fillRoundedRect(misfortuneBarX, temperatureBarY, splitBarWidth, barHeight, 3);
        graphics.fillStyle((tower.luckyWindowRemainingMs ?? 0) > 0 ? 0xfacc15 : 0xa855f7, 1)
          .fillRoundedRect(misfortuneBarX, temperatureBarY, splitBarWidth * misfortuneRatio, barHeight, 3);
      }
      if (hasPerformanceControl) {
        graphics.fillStyle(0x172033, 1).fillRoundedRect(barX, performanceBarY, barWidth, barHeight, 3);
        graphics.fillStyle(0x22c55e, 1).fillRoundedRect(barX, performanceBarY, barWidth * performanceRatio, barHeight, 3);
        graphics.fillStyle(0xf8fafc, 1).fillCircle(barX + barWidth * performanceRatio, performanceBarY + barHeight / 2, 5);
      }
    }

    const sell = this.sellButtonRect;
    if (sell) {
      graphics.fillStyle(0x2a1220, 0.96).fillRoundedRect(sell.x, sell.y, sell.width, sell.height, 4);
      graphics.lineStyle(1, 0xfb7185, 0.85).strokeRoundedRect(sell.x, sell.y, sell.width, sell.height, 4);
    }

    const labelCenterX = barX + barWidth / 2;
    this.selectedAmmoText ??= this.add.text(0, 0, "", { color: "#fef3c7", fontFamily: "Arial", fontSize: "9px", fontStyle: "bold" }).setOrigin(0.5, 0).setDepth(67);
    this.selectedEnergyText ??= this.add.text(0, 0, "", { color: "#cffafe", fontFamily: "Arial", fontSize: "9px", fontStyle: "bold" }).setOrigin(0.5, 0).setDepth(67);
    this.selectedTemperatureText ??= this.add.text(0, 0, "", { color: "#fde68a", fontFamily: "Arial", fontSize: "9px", fontStyle: "bold" }).setOrigin(0.5, 0).setDepth(67);
    this.selectedMisfortuneText ??= this.add.text(0, 0, "", { color: "#e9d5ff", fontFamily: "Arial", fontSize: "8px", fontStyle: "bold" }).setOrigin(0.5, 0).setDepth(67);
    this.selectedPerformanceText ??= this.add.text(0, 0, "", { color: "#dcfce7", fontFamily: "Arial", fontSize: "9px", fontStyle: "bold" }).setOrigin(0.5, 0).setDepth(67);
    this.selectedAmmoText
      .setText(usesAmmo ? t("scene.tower.ammo", { n: Math.floor(tower.ammo ?? 0), max: tower.maxAmmo ?? 0 }) : t("scene.tower.ammoUnused"))
      .setColor(usesAmmo ? "#fef3c7" : "#fecaca")
      .setPosition(labelCenterX, panelY + 2)
      .setVisible(showsResources);
    this.selectedEnergyText.setText(t("scene.tower.energy", { n: Math.floor(tower.energy ?? 0), max: tower.maxEnergy ?? 0 })).setPosition(labelCenterX, panelY + 24).setVisible(showsResources);
    this.selectedTemperatureText
      .setText(isAmmoFactory
        ? t("scene.tower.rawAmmo", { n: Math.floor(tower.rawAmmo ?? 0), max: tower.maxRawAmmo ?? 0 })
        : t("scene.tower.temperature", { v: t("format.percent", { v: Math.round(tower.temperature ?? 0) }) }))
      .setPosition(hasMisfortune ? barX + splitBarWidth / 2 : labelCenterX, panelY + 46)
      .setVisible(showsResources);
    this.selectedMisfortuneText
      .setText((tower.luckyWindowRemainingMs ?? 0) > 0
        ? t("scene.tower.lucky", { s: (tower.luckyWindowRemainingMs! / 1000).toFixed(1) })
        : t("scene.tower.luck", { v: t("format.percent", { v: Math.round(tower.misfortune ?? 0) }) }))
      .setPosition(barX + splitBarWidth + 4 + splitBarWidth / 2, panelY + 46)
      .setVisible(showsResources && hasMisfortune);
    this.selectedPerformanceText.setText(t("scene.tower.performance", { v: t("format.percent", { v: Math.round(performanceRatio * 100) }) })).setPosition(labelCenterX, panelY + 68).setVisible(hasPerformanceControl);

    const refundState = this.getTowerRefundState(tower);
    this.selectedSellText = this.selectedSellText ?? this.add.text(0, 0, "", {
      fontFamily: "Rajdhani, Arial",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#fecdd3"
    }).setOrigin(0.5).setDepth(67);
    this.selectedSellText
      .setText(sell ? `${refundState.undoable ? t("scene.tower.undo") : t("scene.tower.sell")}  +${refundState.amount}g` : "")
      .setPosition(sell ? sell.x + sell.width / 2 : 0, sell ? sell.y + sell.height / 2 : 0)
      .setVisible(Boolean(sell));

    this.performanceSliderLeft = barX;
    this.performanceSliderRight = barX + barWidth;
    this.performanceSliderTowerId = tower.id;
    if (!this.performanceSliderHitZone) {
      this.performanceSliderHitZone = this.add.rectangle(labelCenterX, performanceBarY, barWidth + 12, 24, 0xffffff, 0.001)
        .setDepth(68)
        .setInteractive({ useHandCursor: true });
      const updatePerformance = (pointer: Phaser.Input.Pointer) => this.setSelectedTowerPerformanceFromX(pointer.worldX);
      this.performanceSliderHitZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.performanceSliderDragging = true;
        updatePerformance(pointer);
      });
      this.performanceSliderHitZone.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (pointer.isDown) {
          updatePerformance(pointer);
        }
      });
      this.input.on("pointerup", () => {
        if (this.performanceSliderDragging) this.flushPerformanceSend();
        this.performanceSliderDragging = false;
      });
    }
    this.performanceSliderHitZone.setPosition(labelCenterX, performanceBarY).setSize(barWidth + 12, 24).setVisible(hasPerformanceControl);
    if (hasPerformanceControl && tower.ownerId === this.localSessionId) {
      this.performanceSliderHitZone.setInteractive({ useHandCursor: true });
    } else {
      this.performanceSliderHitZone.disableInteractive();
    }
  }

  private setSelectedTowerPerformanceFromX(worldX: number) {
    if (!this.performanceSliderTowerId || this.performanceSliderRight <= this.performanceSliderLeft) {
      return;
    }
    const performance = Phaser.Math.Clamp((worldX - this.performanceSliderLeft) / (this.performanceSliderRight - this.performanceSliderLeft), 0, 1);
    this.optimisticPerformance = { towerId: this.performanceSliderTowerId, value: performance };
    const tower = this.towerSnapshots.get(this.performanceSliderTowerId);
    if (tower) {
      const discSize = this.getMapCellSize() * getTowerGridSpan(tower.definitionId);
      this.drawSelectedTowerResources({ ...tower, performance }, discSize);
    }
    this.queuePerformanceSend(this.performanceSliderTowerId, performance);
  }

  private queuePerformanceSend(towerId: string, value: number) {
    if (this.pendingPerformanceSend && this.pendingPerformanceSend.towerId !== towerId) this.flushPerformanceSend();
    this.pendingPerformanceSend = { towerId, performance: value };
    const wait = PERFORMANCE_SEND_INTERVAL_MS - (performance.now() - this.lastPerformanceSendAt);
    if (wait <= 0) {
      this.flushPerformanceSend();
      return;
    }
    this.pendingPerformanceTimer ??= window.setTimeout(() => this.flushPerformanceSend(), wait);
  }

  private flushPerformanceSend() {
    if (this.pendingPerformanceTimer !== undefined) {
      window.clearTimeout(this.pendingPerformanceTimer);
      this.pendingPerformanceTimer = undefined;
    }
    const pending = this.pendingPerformanceSend;
    if (!pending) return;
    this.pendingPerformanceSend = undefined;
    this.lastPerformanceSendAt = performance.now();
    this.room?.send("setTowerPerformance", pending);
  }

  private drawEnemyHealthBar(graphics: Phaser.GameObjects.Graphics | undefined, enemy: EnemySnapshot, displayedSize: number) {
    if (!graphics) {
      return;
    }
    // Sampiyonun cubugu genis, kalin ve altin cerceveli: erimesi okunsun,
    // "bu sefer ne kadar surdu" sorusu cubuktan da izlenebilsin.
    const champion = Boolean(enemy.champion);
    const width = champion ? Math.max(30, Math.min(58, displayedSize * 0.95)) : Math.max(17, Math.min(38, displayedSize * 0.68));
    const height = champion ? 3 : 2;
    const x = enemy.x - width / 2;
    const y = enemy.y + displayedSize * 0.5 + 5;
    // Ruh cekicinin azami cani yiginla buyuyor; statik kayit dogumdaki degeri tasiyor.
    const maxHp = enemy.maxHp * getRaceMaxHpScale(readRaceTraitView(enemy));
    const hpRatio = Phaser.Math.Clamp(enemy.hp / Math.max(1, maxHp), 0, 1);
    graphics.clear();
    graphics.fillStyle(0x020617, 0.92).fillRoundedRect(x - 1, y - 1, width + 2, height + 2, 2);
    if (champion) graphics.lineStyle(1, CHAMPION_BAR_FRAME, 0.95).strokeRoundedRect(x - 1.5, y - 1.5, width + 3, height + 3, 2);
    graphics.fillStyle(0xef4444, 1).fillRoundedRect(x, y, width * hpRatio, height, 1);
    if (enemy.maxShield > 0) {
      const shieldRatio = Phaser.Math.Clamp(enemy.shield / Math.max(1, enemy.maxShield), 0, 1);
      const shieldY = y + height + 2;
      graphics.fillStyle(0x020617, 0.92).fillRoundedRect(x - 1, shieldY - 1, width + 2, height + 2, 2);
      graphics.fillStyle(0x38bdf8, 1).fillRoundedRect(x, shieldY, width * shieldRatio, height, 1);
    }
  }

  private renderCrystalNodes(nodes: CrystalNodeSnapshot[]) {
    this.crystalGraphics?.clear();
    this.renderResourceSprites(nodes.map((node) => ({ ...node, kind: "energy" })), "energy");
  }

  private renderAmmoNodes(nodes: AmmoNodeSnapshot[]) {
    this.ammoNodeGraphics?.clear();
    this.renderResourceSprites(nodes.map((node) => ({ ...node, kind: node.kind ?? "gunpowder" })), "materials");
  }

  private renderResourceSprites(nodes: Array<{ id: string; x: number; y: number; kind: string; remaining?: number }>, group: string) {
    const current = new Set(nodes.map((node) => `${group}:${node.id}`));
    for (const [id, sprite] of this.resourceSprites) {
      if (id.startsWith(`${group}:`) && !current.has(id)) { sprite.destroy(); this.resourceSprites.delete(id); this.resourceAmountLabels.get(id)?.destroy(); this.resourceAmountLabels.delete(id); }
    }
    for (const node of nodes) {
      const id = `${group}:${node.id}`;
      let sprite = this.resourceSprites.get(id);
      if (!sprite || !sprite.active) {
        sprite = this.add.image(node.x, node.y, `resource-${node.kind}`).setDepth(8);
        this.resourceSprites.set(id, sprite);
      }
      const cell = this.getMapCellSize();
      sprite.setPosition(node.x, node.y).setDisplaySize(cell * 0.95 * 0.75, cell * 0.95 * 0.75)
        .setAlpha(node.remaining === 0 ? 0.25 : 1);
      let label = this.resourceAmountLabels.get(id);
      if (!label || !label.active) {
        label = this.add.text(node.x, node.y, "", { fontFamily: "monospace", color: "#e2e8f0", stroke: "#080e18", strokeThickness: 2 }).setOrigin(0.5, 0).setDepth(9);
        this.resourceAmountLabels.set(id, label);
      }
      label.setPosition(node.x, node.y + cell * 0.36).setFontSize(Math.max(8, cell * 0.17))
        .setText(node.remaining === undefined ? "" : String(Math.floor(node.remaining)))
        .setAlpha(node.remaining === 0 ? 0.5 : 1);
    }
  }

  private renderDamageEvents(snapshot: GameSnapshot) {
    // Yuva her karede snapshottan: yeniden baglanma ya da ilk kare HUD'dan
    // once gelebiliyor ve `localPlayerSnapshot` o an eski olabiliyor.
    const localSlot = snapshot.players.find((player) => player.id === this.localSessionId)?.slot ?? 0;
    const now = performance.now();
    for (const event of snapshot.damageEvents) {
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

      this.showDamageNumber(event, localSlot, now);
      if (event.b === 1) {
        this.playBladeHitSound(event, snapshot, localSlot);
      }
    }
  }

  /**
   * Testere'nin kesme sesi.
   *
   * Bicagin temas mesaji yok; sunucu bicagin dogrudan temasindan dogan hasar
   * olayini `b` ile isaretliyor (kanama tiki, yakindaki baska kule ve alan
   * tikleri isaretsiz). Ses olay sayisiyla ayni anda, oynatma gecikmesinden
   * sonra. Sahiplik olayin vuran yuvasindan; kademe vuranin en yakin
   * Testere'sinden.
   */
  private playBladeHitSound(event: DamageEventSnapshot, snapshot: GameSnapshot, localSlot: number) {
    const slot = getDamageEventOwnerSlot(event);
    let ownerId: string | undefined;
    for (const player of snapshot.players) {
      if ((player.slot ?? 0) === slot) {
        ownerId = player.id;
        break;
      }
    }
    const tier = getBladeHitTier(event, this.towerSnapshots.values(), ownerId);
    if (tier === undefined) return;
    this.feedback?.playHit(BLADE_HIT_VOICE, tier, slot === localSlot, event.id);
  }

  /**
   * Tek hasar sayisi.
   *
   * Sayi hep gercekte inen hasar; hiyerarsi renk, boyut ve isaretle kuruluyor.
   * Kendi vurusun parlak, takim arkadasininki gri ve kucuk; kritik turuncu,
   * 1.5 kat, "!" ile ve kisa bir popla; son vurus altin ve "✕" ile ama
   * buyutulmeden. Boyut hasarin dusmanin toplam canina oranindan (sunucunun
   * kovasi), sabit bir esikten degil.
   *
   * Gorunup gorunmeyecegine yonetmen karar veriyor: kendi kritigin ve son
   * vurusun hic dusmez, siradan vurusun 12 sayida, takim arkadasininki ekranda
   * 6 sayi varken duser. Kritik citirtisi da oradan, yalnizca senin kritiginde.
   * Birlesen sayi bayraklari da birlestiriyor (oldurucu kritik "✕" tasir);
   * birlesecek sayi coktan baska sayiya gectiyse kendi kritigin ya da son
   * vurusun yeni sayi aciyor. Kendi kritik son vurusun kisa titresim, Onur
   * zarinin jackpot'u sayinin ustunde damga (`showJackpotStamp`).
   */
  private showDamageNumber(event: DamageEventSnapshot, localSlot: number, now: number) {
    const pool = this.damageNumbers;
    if (!pool) {
      return;
    }

    const own = getDamageEventOwnerSlot(event) === localSlot;
    const crit = event.c === 1;
    const killingBlow = event.k === 1;
    if (own && crit && killingBlow) {
      // Oldurme olayi kritik bayragi tasimiyor; kritik son vurus yalnizca
      // burada biliniyor. Titresimin araligini ve ayarini yonetmen tutuyor.
      this.feedback?.vibrate(FEEDBACK_KIND_RULES.kill.vibrateMs);
    }
    const kind: FeedbackKind = crit ? "crit" : killingBlow ? "lastHit" : "hit";
    const lifetimeMs = FEEDBACK_KIND_RULES[kind].visualMs;
    const key = own ? kind : `${kind}:team`;
    const decision = this.feedback?.emit(kind, { own, x: event.x, y: event.y, lifetimeMs });
    if (own && crit && event.j) {
      this.showJackpotStamp(event);
    }
    let recycle = decision?.recycle ?? false;
    if (decision?.merge) {
      if (pool.merge(key, event.amount, { crit, killingBlow })) {
        return;
      }
      // Birlesilecek sayinin yuvasi baska sayiya gecmis. Kendi kritigin ya da
      // son vurusun hic dusmemeli: yeni sayi en eski canli sayinin yerine.
      if (!own || !(crit || killingBlow)) {
        return;
      }
      recycle = true;
    } else if (decision && !decision.show) {
      return;
    }

    pool.spawn({
      key,
      x: event.x,
      y: event.y,
      amount: event.amount,
      own,
      crit,
      killingBlow,
      bucket: event.r ?? 0,
      lifetimeMs,
      still: decision?.reducedMotion ?? false
    }, now, recycle);
  }

  /**
   * Onur jackpot damgasi: kendi kritiginde zar esigin ustundeyse kritik
   * sayinin hemen ustunde "JACKPOT ×1.9".
   *
   * Sayi yine gercekte inen hasar; damga yalnizca o hasarin neden buyuk
   * oldugunu (zarin) soyluyor. Carpan sunucudan (`j`, on kati), istemci
   * zari bilmiyor. Etiket butcesinden (P1) ve dunya etiket havuzundan: yeni
   * Text acilmiyor. Hareket azaltmada yukselmeden yerinde soner.
   */
  private showJackpotStamp(event: DamageEventSnapshot) {
    const labels = this.levelLabels;
    const luck = (event.j ?? 0) / 10;
    if (!labels || !(luck > 0)) {
      return;
    }
    const now = performance.now();
    const y = event.y - JACKPOT_LABEL_LIFT_PX;
    const lifetimeMs = FEEDBACK_KIND_RULES.jackpot.visualMs;
    const text = `JACKPOT ×${luck.toFixed(1)}`;
    const decision = this.feedback?.emit("jackpot", { own: true, x: event.x, y, lifetimeMs });
    if (decision?.merge) {
      labels.merge("jackpot", text, JACKPOT_LABEL_FILL, JACKPOT_LABEL_STROKE);
      return;
    }
    if (decision && !decision.show) {
      return;
    }
    labels.spawn({
      key: "jackpot",
      text,
      x: event.x,
      y,
      fill: JACKPOT_LABEL_FILL,
      stroke: JACKPOT_LABEL_STROKE,
      fontPx: JACKPOT_LABEL_FONT_PX,
      alpha: 1,
      pop: false,
      lifetimeMs,
      still: decision?.reducedMotion ?? this.feedback?.reducedMotion ?? false,
      bounds: getMapWorldBounds(this.selectedMapData)
    }, now, decision?.recycle ?? false);
  }

  private renderKillEvents(snapshot: GameSnapshot) {
    this.newKillEventsInSnapshot = 0;
    const comboWindowMs = getComboWindowMs(snapshot.team.wave);
    let comboTouched = false;
    // Kritik oldurme: oldurme olayi kritik bayragi tasimiyor, ama oldurucu
    // hasar olayi (`c:1, k:1`) ayni snapshot'ta geliyor. Bu kontrol oldurme
    // olaylarinin hasar olaylarindan ONCE islenmesine dayaniyor
    // (`renderSnapshotPayload`): hasar olayi henuz "gorulmemis" olmali.
    // Snapshot duzeyi yeter; durtme ve titresim konumsuz ve yonetmen onlari
    // 400/300 ms'de bire indiriyor.
    const localSlot = snapshot.players.find((player) => player.id === this.localSessionId)?.slot ?? 0;
    const ownCritKill = snapshot.damageEvents.some((damage) => damage.c === 1
      && damage.k === 1
      && !this.seenDamageEventSet.has(damage.id)
      && getDamageEventOwnerSlot(damage) === localSlot);
    for (const event of snapshot.killEvents) {
      if (this.seenKillEventSet.has(event.id)) {
        continue;
      }

      this.newKillEventsInSnapshot += 1;
      this.seenKillEventSet.add(event.id);
      this.seenKillEventIds.push(event.id);
      if (this.seenKillEventIds.length > 240) {
        const oldestId = this.seenKillEventIds.shift();
        if (oldestId) {
          this.seenKillEventSet.delete(oldestId);
        }
      }

      // Kombo sunucunun oldurme anindan sayiliyor; bayat olay (yeniden
      // baglanma, arka plandan donus) sayilmiyor, perde de yonetmenin kendi
      // zincirine kaliyor. Ayni kural patlamayi, sesi ve altin sayisini da
      // susturuyor (`playKillConfirmation`).
      const own = Boolean(event.ownerId) && event.ownerId === this.localSessionId;
      const stale = isStaleKillEvent(event.serverTime, snapshot.serverTime);
      let comboStep: number | undefined;
      if (event.ownerId && !stale) {
        const ownCount = this.killCombo.record(event.serverTime, own, comboWindowMs);
        comboStep = ownCount !== undefined ? ownCount - 1 : undefined;
        comboTouched = true;
      }

      this.playKillConfirmation(event, comboStep, stale, ownCritKill);
      if (!stale && event.a) {
        this.presentKillAssist(snapshot, event, localSlot);
      }

      if (!event.ownerId || !event.streakTier) {
        continue;
      }
      // Seri yalnizca sunucudan: istemci eskiden oldurme zamanlarindan kendi
      // serisini de hesapliyordu. Yeniden baglanan istemcide kilitler
      // bilinmedigi icin sunucunun vermedigi bir seriyi -- ve artik afisin
      // yazdigi buff'i -- gosterebilirdi.
      this.announceKillStreak(snapshot, event, event.streakTier);
    }

    if (comboTouched) {
      this.presentKillCombo(snapshot, comboWindowMs);
    }
  }

  /**
   * Co-op asisti: "Atakan işaretledi → Zeynep bitirdi".
   *
   * Yalnizca iki tarafin ekraninda (oldurensen ilk asist, asist verdiysen
   * seninki); ucuncu oyuncu hicbir sey gormuyor. HUD yigininda soluk tek
   * satir: ses, sarsinti ve titresim yok -- oldurmenin kendi sesi zaten caldi.
   * Ayni iki oyuncu arasinda 5 sn'de en fazla bir kez; zaman sunucunun oldurme
   * ani, oynatma gecikmesi araligi bozmasin. Kart perdesi ve sonuc ekrani
   * acikken yok: perde HUD'un ustunde, satir gorulmeden kaybolurdu.
   */
  private presentKillAssist(snapshot: GameSnapshot, event: KillEventSnapshot, localSlot: number) {
    if (snapshot.players.length < 2 || this.cardChoiceRoot || this.matchResultShown || snapshot.result) {
      return;
    }
    const killer = snapshot.players.find((player) => player.id === event.ownerId);
    if (!killer) {
      return;
    }
    const killerSlot = killer.slot ?? 0;
    const assist = pickLocalKillAssist(killerSlot, decodeKillAssists(event.a), localSlot);
    const assister = assist ? snapshot.players.find((player) => (player.slot ?? 0) === assist.slot) : undefined;
    if (!assist || !assister || !this.assistToasts.allow(killerSlot, assist.slot, event.serverTime)) {
      return;
    }
    const decision = this.feedback?.emit("assist", { own: true });
    if (decision && !decision.show) {
      return;
    }
    // Kenar rengi karsi tarafin: satir "kiminle" sorusunu renkle de soylesin.
    const partner = killer.id === this.localSessionId ? assister : killer;
    const toast: TeamAssistToast = {
      text: getKillAssistText(assist.kind, this.describePlayer(assister.id).name, this.describePlayer(killer.id).name),
      color: this.describePlayer(partner.id).color
    };
    this.game.events.emit("game:hud-assist", toast);
  }

  /**
   * Kozmetik kombo hapi (HUD'da, arenanin sag ustunde).
   *
   * Yalnizca gosterge: oyuna, seriye ve esiklere hic dokunmuyor. Kendi
   * serinin afisi ekrandayken hap yok -- hap afise "donusmus" oluyor; afis
   * kalkinca kombo suruyorsa bir sonraki oldurmede geri geliyor. Kart
   * perdesi, sonuc ekrani ve mac sonu da hapi kaldiriyor.
   */
  private presentKillCombo(snapshot: GameSnapshot, windowMs: number) {
    const state = this.killCombo.getHudState(snapshot.serverTime, windowMs, snapshot.players.length > 1);
    if (!state || this.rampageContainer || this.cardChoiceRoot || this.matchResultShown || snapshot.result) {
      this.game.events.emit("game:hud-combo-hide");
      return;
    }
    this.game.events.emit("game:hud-combo", state);
  }

  /**
   * Sunucunun verdigi seri.
   *
   * Sahibinin ates eden kuleleri buff'in gercek suresi boyunca parliyor
   * (3000 oyun-ms = 3.75 sn); olay gec geldiyse (yeniden baglanma) kalan
   * sure kadar. Kendi serin: temali afis siraya giriyor; ses klibi, sarsinti
   * ve titresim afis gercekten ekrana gelince (`showKillStreakAnnouncement`),
   * yoksa siradaki afisin klibi ekrandakinin klibini keser ve henuz
   * gorunmeyen kademeyi soylerdi. Siradaki afis ekrandakinin klibi bitene
   * kadar bekliyor (`StreakBannerQueue.holdUntil`); kendi klibin kesilmiyor. Takim arkadasinin serisi: kendi renginde
   * kucuk bir yan toast, soluk parlama, kisik ses -- kamerana, afisine ve
   * calan klibe dokunmuyor. Kart/Ucube perdesi acikken ondan yalnizca soluk
   * parlama kaliyor.
   */
  private announceKillStreak(snapshot: GameSnapshot, event: KillEventSnapshot, tier: KillStreakTier) {
    const rule = getKillStreakRuleByTier(tier);
    if (!rule) {
      return;
    }
    const remainingMs = getKillStreakBuffRealMs() - Math.max(0, snapshot.serverTime - event.serverTime);
    // Sonuc ekraninda (son dalganin son oldurmesi) afis ve toast yok; buff da bitti sayilir.
    if (remainingMs <= 0 || this.matchResultShown) {
      return;
    }

    const own = event.ownerId === this.localSessionId;
    const owner = snapshot.players.find((candidate) => candidate.id === event.ownerId);
    // NOT BAD gucsuz: kule parlamasi yok (ve suren daha yuksek bir parlamayi silmiyor).
    const sharedRule = getSharedKillStreakRule(tier);
    if (sharedRule && killStreakRuleGrantsBuff(sharedRule)) {
      this.startStreakGlow(snapshot, event.ownerId, own, remainingMs);
    }

    if (!own) {
      // Kart/Ucube perdesi acikken takim arkadasinin toast'u ve sesi yok: HUD
      // perdenin ustunde kalir, baskasinin olayi senin secimine girerdi;
      // soluk parlama yeter.
      if (this.cardChoiceRoot) {
        return;
      }
      this.playKillStreakAnnouncement(rule, false);
      const characterId = owner?.characterId;
      const character = characterId ? characters.find((candidate) => candidate.id === characterId) : undefined;
      const toast: TeamStreakToast = {
        name: character?.displayName ?? t("scene.teammate"),
        label: rule.label,
        buff: getKillStreakBuffText(tier),
        color: (characterId && CHARACTER_CLASS_COLORS[characterId]) || "#94a3b8"
      };
      this.game.events.emit("game:hud-team-streak", toast);
      return;
    }

    this.game.events.emit("game:hud-combo-hide");
    const now = performance.now();
    const item: StreakBannerItem = { characterId: owner?.characterId ?? this.selectedCharacterId, rule, buffUntil: now + remainingMs };
    if (this.streakBanners.offer(item, now) === "show") {
      this.showKillStreakAnnouncement(item);
    } else {
      this.hastenStreakBanner();
    }
  }

  /**
   * Sahibinin kulelerine parlama. Ayni sahibin yeni serisi eskisinin yerini
   * aliyor (sunucu da sureyi yeni seriden yaziyor); kule listesi seri
   * anindaki -- sonradan kurulan kule buff almiyor, parlamiyor.
   */
  private startStreakGlow(snapshot: GameSnapshot, ownerId: string, own: boolean, remainingMs: number) {
    const towerIds = getStreakBuffedTowerIds(snapshot.towers, ownerId);
    if (towerIds.length === 0) {
      return;
    }
    const now = performance.now();
    const previous = this.streakGlows.find((glow) => glow.ownerId === ownerId && glow.until > now);
    this.streakGlows = this.streakGlows.filter((glow) => glow.ownerId !== ownerId);
    this.streakGlows.push({ ownerId, own, towerIds, startedAt: previous?.startedAt ?? now, until: now + remainingMs });
  }

  /**
   * Seri parlamasi: tek Graphics, yalnizca parlama varken ciziliyor.
   *
   * Kulenin altinda altin bir hale -- govde ortasini ortuyor, kenardan tasan
   * kisim "bu kule su an guclu" diyor. Seviye halkasina, kule rengine ve
   * durum renklerine dokunmuyor; onlar oyun bilgisi tasiyor. Hareket
   * azaltmada nabiz yok, parlama sabit durup soner.
   */
  private renderStreakGlows(now: number) {
    const graphics = this.streakGlowGraphics;
    if (!graphics) {
      return;
    }
    if (this.streakGlows.length === 0) {
      if (graphics.visible) {
        graphics.clear().setVisible(false);
      }
      return;
    }

    this.streakGlows = this.streakGlows.filter((glow) => glow.until > now);
    graphics.clear().setVisible(true);
    const cellSize = this.getMapCellSize();
    const still = this.feedback?.reducedMotion ?? false;
    const pulse = still ? 1 : 0.82 + Math.sin(now * STREAK_GLOW_PULSE_RATE) * 0.18;
    for (const glow of this.streakGlows) {
      const alpha = getStreakGlowAlpha(now - glow.startedAt, glow.until - now)
        * (glow.own ? 1 : TEAMMATE_STREAK_GLOW_INTENSITY)
        * pulse;
      if (alpha <= 0) {
        continue;
      }
      for (const id of glow.towerIds) {
        const tower = this.towerSnapshots.get(id);
        if (!tower) {
          continue;
        }
        const radius = getTowerBodySize(tower.definitionId, cellSize * getTowerGridSpan(tower.definitionId)) / 2;
        graphics.fillStyle(0xfacc15, 0.12 * alpha);
        graphics.fillCircle(tower.x, tower.y, radius * 1.34);
        graphics.fillStyle(0xfde68a, 0.2 * alpha);
        graphics.fillCircle(tower.x, tower.y, radius * 1.08);
        graphics.lineStyle(2, 0xfbbf24, 0.85 * alpha);
        graphics.strokeCircle(tower.x, tower.y, radius * 1.16);
      }
    }
  }

  /**
   * Oldurme onayi: olum patlamasi, oldurme sesi, agir dusmanda ya da kritik
   * oldurmede kucuk durtme.
   *
   * Yalnizca oldurme olayindan: sizintinin olayi yok, o sessizce kaybolmaya
   * devam ediyor. Iz yoksa dusman bu istemcide hic cizilmedi (yeniden
   * baglanmada gelen eski olay, iki snapshot arasinda dogup olen dusman);
   * o zaman ses de yok, yoksa baglaninca bir yigin oldurme sesi patlardi.
   *
   * Bayat olay (`stale`, kombonun 400 ms kurali): arka plandan donuste ilk
   * kare aradaki butun olen dusmanlari kaldiriyor ve her biri icin eski
   * konumunda iz birakiyor; son 2.2 sn'nin oldurme olaylari o izleri ayni
   * karede buluyor, TTL korumuyor. Iz yine aliniyor (bir daha patlamasin)
   * ama patlama, ses, durtme ve altin sayisi yok -- olmayan bir yerde
   * cikarlardi. HUD altini zaten dogru.
   *
   * Kendi oldurmen parlak ve sesli; takim arkadasininki soluk, sesi yonetmende
   * kisik ve seyrek, kamerana hic dokunmuyor. Durtme ve titresimi de yonetmen
   * veriyor: yalnizca senin agir dusman ya da kritik oldurmende
   * (`ownCritKill`: bu snapshot'ta senin kritik son vurusun var). Kritik son
   * vurus ayrica `showDamageNumber`da titretiyor; iz bulunmasa da. Altinin
   * "+N"i da yalnizca senin oldurmende (`playKillCoin`).
   */
  private playKillConfirmation(event: KillEventSnapshot, comboStep?: number, stale = false, ownCritKill = false) {
    const now = performance.now();
    const trace = this.removedEnemyTraces.take(event.enemyId, now);
    if (!trace || stale) {
      return;
    }
    // ATLAS ovgusu: ozel tehdit sayaci -- Kule Avcisi ya da Enerji Yiyici dustu.
    if (trace.special === "hunter" || trace.special === "eater") {
      this.atlas?.praise();
    }

    const own = Boolean(event.ownerId) && event.ownerId === this.localSessionId;
    const shape = getDeathBurstShape(trace.type);
    // Ses bir "portal": boyu dusmanin agirligindan (siradan ve ucan kucuk,
    // agir normal, sampiyon buyuk). A ve D tarzi sirayla; yogunluk siniri
    // yonetmende. Kombo perdeyi degil yalnizca seviyeyi biraz artiriyor;
    // basamak kombo hapiyla ayni sayidan.
    const decision = this.feedback?.emit("kill", {
      own,
      x: trace.x,
      y: trace.y,
      weight: getKillFeedbackWeight(trace.type, own && ownCritKill),
      step: own ? comboStep : undefined
    }, getKillSoundCue(trace.type, trace.air, trace.champion), event.enemyId);
    if (own) {
      this.playKillCoin(event, trace, decision?.step, now);
    }
    if (decision && !decision.show) {
      return;
    }

    this.combatVfx?.emitDeath({
      x: trace.x,
      y: trace.y,
      size: trace.size,
      color: tintAccentColor(this.getEnemyAccentColor(trace.texture), trace.tint),
      shards: shape.shards,
      durationMs: shape.durationMs,
      intensity: own ? 1 : TEAMMATE_DEATH_BURST_INTENSITY,
      still: decision?.reducedMotion ?? this.feedback?.reducedMotion ?? false,
      bornAt: now,
      // Malzeme irkin dokusundan (metal, kitin, kristal, tas, kul); agirlik tipten.
      // Ucan dusmanin altinda zemin yok: yer izi ve inis yalnizca yerdeki govdede.
      texture: trace.texture,
      heavy: shape.heavy,
      air: trace.air
    });
  }

  /**
   * Kendi oldurmenin altini: govdenin ustunden kucuk bir "+18◆".
   *
   * Sayi sunucunun oldurme olayina yazdigi gercek altin (senin carpaninla,
   * tabana yuvarli). Saniyede en fazla 3 sayi; arada gelen altin yonetmenin
   * kararina gore canli onceki sayiya ekleniyor, o da yoksa bir sonrakine
   * tasiniyor -- gosterilen toplam gercekten kazanilani hic asmiyor (kesir
   * kismi HUD sayiminda). Takim arkadasinin oldurmesi
   * buraya hic gelmiyor: senin de payin var ama o HUD sayiminda goruluyor,
   * dunyada senin gozunu cekmiyor.
   *
   * Sesi yok: oldurmenin kendi sesi yetiyor; her oldurmede ikinci bir tini
   * savas sesini maskeliyordu. Butce ve birlestirme yine yonetmenden.
   */
  private playKillCoin(event: KillEventSnapshot, trace: { x: number; y: number; size: number }, step: number | undefined, now: number) {
    const gold = event.g ?? 0;
    const pool = this.damageNumbers;
    if (!(gold > 0) || !pool) {
      return;
    }

    const x = trace.x;
    const y = trace.y - trace.size * COIN_LIFT_RATIO;
    const decision = this.feedback?.emit("coin", { own: true, x, y, step });
    if (decision?.merge) {
      const total = gold + this.takeCarriedCoin(now);
      if (!pool.merge("coin", total)) {
        this.carryCoin(total, now);
      }
      return;
    }
    if (decision && !decision.show) {
      this.carryCoin(gold, now);
      return;
    }

    pool.spawn({
      key: "coin",
      x,
      y,
      amount: gold + this.takeCarriedCoin(now),
      own: true,
      crit: false,
      killingBlow: false,
      bucket: 0,
      lifetimeMs: FEEDBACK_KIND_RULES.coin.visualMs,
      still: decision?.reducedMotion ?? false,
      coin: true
    }, now, decision?.recycle ?? false);
  }

  private carryCoin(gold: number, now: number) {
    const carry = this.coinCarry;
    carry.amount = (now - carry.at <= COIN_CARRY_MS ? carry.amount : 0) + gold;
    carry.at = now;
  }

  /** Tasinan altin; bayatsa (`COIN_CARRY_MS`) atiliyor, HUD sayimi yine dogru. */
  private takeCarriedCoin(now: number) {
    const carry = this.coinCarry;
    const amount = now - carry.at <= COIN_CARRY_MS ? carry.amount : 0;
    carry.amount = 0;
    return amount;
  }

  /**
   * Oldurmeyle gelmeyen altin cipin yaninda "+N" (dalga bonusu, faiz, satis,
   * beceri altini). Oldurme altini dunyada ve HUD sayiminda zaten goruluyor;
   * ayirma kurali `getLumpGoldGain`de. Oyuncu kaydi yoksa bir sonraki
   * snapshot yine "ilk" sayiliyor, arada birikmis fark etiket olmasin.
   */
  private announceLumpGold(gold: number | undefined) {
    if (gold === undefined) {
      this.lastSnapshotGold = undefined;
      return;
    }
    const lump = getLumpGoldGain(this.lastSnapshotGold, gold, this.newKillEventsInSnapshot);
    this.lastSnapshotGold = gold;
    if (lump > 0) {
      this.game.events.emit("game:hud-gold-gain", lump);
    }
  }

  /**
   * HUD kart perdesinin ve sonuc ekraninin ustunde duruyor: perde acilinca
   * arenanin ustundeki damgalar (dalga, ulti), kombo hapi ve takim toast'u
   * hemen kalkmali.
   */
  private hideArenaHudOverlays() {
    this.game.events.emit("game:hud-wave-clear-hide");
    this.game.events.emit("game:hud-combo-hide");
    this.game.events.emit("game:hud-team-streak-hide");
    this.game.events.emit("game:hud-ultimate-hide");
  }

  /**
   * Dalga temizleme damgasi ve akoru.
   *
   * Temizlenme istemcide yakalaniyor: kurulum disinda kalan dusman sifira
   * iniyor -- sunucu tam o an 2 sn'lik molayi baslatiyor, kart ekrani molanin
   * sonunda geliyor. Kural ve sayilar `WaveClearWatch`ta: dusman takimin bu
   * dalgadaki oldurmesi, altin senin bu dalgada kazandigin (harcama ve satis
   * haric), bonus sunucunun molanin sonunda yazacagi dalga bonusu. Son dalgada
   * damga yok, sonuc ekrani konusuyor.
   *
   * Kart ekrani zaten aciksa (ag gecikmesiyle kartlar oynatmadan once geldi)
   * damga da akor da yok: baslik o ani "DALGA N ÖDÜLÜ" diye anlatiyor ve HUD
   * perdenin ustunde kalirdi. Akor yonetmenden (P1, etiket butcesi); dalga
   * takimin ortak ani, her oyuncu kendi ekraninda goruyor ve duyuyor.
   */
  private watchWaveClear(snapshot: GameSnapshot) {
    const player = this.localPlayerSnapshot;
    const summary = this.waveClearWatch.observe({
      wave: snapshot.team.wave,
      enemiesLeft: snapshot.team.enemiesLeft,
      setupPhase: Boolean(snapshot.setupPhase),
      over: Boolean(snapshot.result) || this.matchResultShown,
      kills: snapshot.team.kills,
      earned: player ? (player.gold ?? 0) + (player.goldSpent ?? 0) : undefined
    });
    if (summary) {
      // Dalga bitti: hedef kalmadi, acik infaz hedeflemesi bir sonraki dalgaya tasinmasin.
      this.cancelExecuteTargeting();
      // Karne ayni sayilari kullaniyor: damga "+412 ◆" dediyse karne de ayni
      // altini yaziyor. Can temizlenme anindan; "Kıl payı" o ana bakiyor.
      this.waveReports.noteClear({
        wave: summary.wave,
        gold: summary.gold,
        kills: summary.kills,
        health: snapshot.team.health,
        maxHealth: snapshot.team.maxHealth
      });
      // Perde damgadan once acildiysa (ag gecikmesi) karne simdi tamamlaniyor.
      if (this.cardChoiceRoot) this.refreshWaveReportCard();
      // ATLAS: dalga basina tek zar (%33); izci dalgayi bir kez veriyor.
      this.atlas?.waveCleared(summary.wave);
    }
    // Ogreticide "DALGA 1 TEMİZLENDİ" damgasi yok: dongu ayni dalgayi yeniden doguruyor.
    if (!summary || this.cardChoiceRoot || this.tutorialMode) {
      return;
    }
    this.feedback?.emit("waveClear", { own: true, lifetimeMs: WAVE_CLEAR_STAMP_MS });
    const stamp = getWaveClearStampText(summary);
    // Kart perdesine sigmayan (perdesiz dalga, gec karne) nisan bildirimi
    // bir sonraki temizleme damgasinin son satiri; dalga ortasinda hic.
    const moment = getBadgeNoticeMoment({ over: false, setupPhase: Boolean(snapshot.setupPhase), enemiesLeft: snapshot.team.enemiesLeft });
    const notice = formatBadgeNotice(this.badgeNotices.take(moment));
    if (notice) stamp.lines.push({ kind: "badge", text: notice });
    this.game.events.emit("game:hud-wave-clear", stamp);
  }

  /**
   * "Yukseltme hazir": XP ve altin bir kulenin sonraki seviyesine yettiginde
   * en ucuz 3 yerel kulenin ustunde sallanan kucuk bir ▲, ★ cipi de bir kez
   * parliyor.
   *
   * Bu an dalganin ortasinda geliyor ve eskiden hicbir yerde gorunmuyordu:
   * odenebilirlik yalnizca secili kule icin hesaplaniyordu. Hesap snapshot
   * basina bir kez (kule sayisi kadar kucuk bir dongu); karede yalnizca uc
   * isaretin konumu yaziliyor.
   *
   * Parlama yalnizca "hic yoktu -> var" gecisinde ve iki saniyede en fazla
   * bir kez. Ilk hesap gecis sayilmiyor: yeniden baglanan oyuncunun cipi
   * aninda yanmasin. Isaret mac bitince kalkiyor; sonuc ekraninda
   * yukseltilecek bir sey yok.
   */
  private refreshUpgradeReady(snapshot: GameSnapshot) {
    const player = this.localPlayerSnapshot;
    const ids = player && !snapshot.result
      ? getUpgradeReadyTowerIds(snapshot.towers, this.localSessionId, { gold: player.gold ?? 0, experience: player.experience ?? 0 })
      : [];
    const cellSize = this.getMapCellSize();
    this.upgradeReadyAnchors = ids.flatMap((id) => {
      const tower = this.towerSnapshots.get(id);
      if (!tower) {
        return [];
      }
      // Can cubugunun (disk ustu - 8 px) hemen ustu.
      const discSize = getTowerBodySize(tower.definitionId, cellSize * getTowerGridSpan(tower.definitionId));
      return [{ id, x: tower.x, y: tower.y - discSize / 2 - 11 }];
    });

    const previous = this.upgradeReadyCount;
    this.upgradeReadyCount = ids.length;
    this.emitHudState({ upgradeReady: ids.length > 0 });
    const now = performance.now();
    if (previous === 0 && ids.length > 0 && now - this.lastUpgradeReadyFlashAt >= UPGRADE_READY_FLASH_GAP_MS) {
      this.lastUpgradeReadyFlashAt = now;
      this.game.events.emit("game:hud-upgrade-ready");
    }
  }

  /** Karede yalnizca konum: ucgenler bir kez ciziliyor, havuzda uc Graphics var. */
  private updateUpgradeReadyMarkers(now: number) {
    const anchors = this.upgradeReadyAnchors;
    if (anchors.length === 0 && this.upgradeReadyMarkers.every((marker) => !marker.visible)) {
      return;
    }

    const halfWidth = Math.max(4, this.getMapCellSize() * 0.15);
    if (halfWidth !== this.upgradeReadyMarkerHalfWidth) {
      this.upgradeReadyMarkerHalfWidth = halfWidth;
      for (const marker of this.upgradeReadyMarkers) {
        this.drawUpgradeReadyGlyph(marker, halfWidth);
      }
    }
    const still = this.feedback?.reducedMotion ?? false;
    const bob = still ? 0 : (Math.sin(now * UPGRADE_READY_BOB_RATE) * 0.5 + 0.5) * UPGRADE_READY_BOB_PX;
    for (let index = 0; index < Math.max(anchors.length, this.upgradeReadyMarkers.length); index += 1) {
      const anchor = anchors[index];
      let marker = this.upgradeReadyMarkers[index];
      if (!anchor) {
        marker?.setVisible(false);
        continue;
      }
      if (!marker) {
        marker = this.add.graphics().setDepth(UPGRADE_READY_MARKER_DEPTH);
        this.drawUpgradeReadyGlyph(marker, halfWidth);
        this.upgradeReadyMarkers.push(marker);
      }
      marker.setPosition(anchor.x, anchor.y - bob).setVisible(true);
    }
  }

  /** Ucu yukarida kucuk bir ucgen; tabani (0, 0) noktasinda. */
  private drawUpgradeReadyGlyph(graphics: Phaser.GameObjects.Graphics, halfWidth: number) {
    const height = halfWidth * 1.35;
    graphics.clear();
    graphics.fillStyle(UPGRADE_READY_MARKER_FILL, 1);
    graphics.fillTriangle(-halfWidth, 0, halfWidth, 0, 0, -height);
    graphics.lineStyle(1.5, UPGRADE_READY_MARKER_STROKE, 0.95);
    graphics.strokeTriangle(-halfWidth, 0, halfWidth, 0, 0, -height);
  }

  private getEnemyAccentColor(textureKey: string) {
    let color = this.enemyAccentColors.get(textureKey);
    if (color === undefined) {
      const source = this.textures.exists(textureKey) ? this.textures.get(textureKey).getSourceImage() : undefined;
      color = readTextureAccent(source, ENEMY_ACCENT_FALLBACK);
      this.enemyAccentColors.set(textureKey, color);
    }
    return color;
  }

  /**
   * Seri klibi.
   *
   * Klipler paylasiliyor (kademe basina tek HTMLAudioElement) ve eskiden her
   * seri calan klibi durdurup bastan baslatiyordu: takim arkadasinin serisi
   * seninkini yarida kesiyordu. Artik takim arkadasininki yalnizca bir klip
   * calmiyorken ve kisik caliyor; seninki gerekirse onunkini kesiyor. Kendi
   * klibini ise hicbir sey kesmiyor: siradaki kendi afisin (ve klibi) bu
   * klip bitene kadar sirada bekliyor (`holdKillStreakVoice`); kesme yalnizca
   * `STREAK_VOICE_HOLD_MAX_MS` tavani asildiysa olabilir.
   *
   * Calan klibi donduruyor (calmadiysa `undefined`).
   *
   * Kisiklik yalnizca medya ogesinin `volume`u ile; iOS Safari onu yok
   * sayiyor. Orada takim arkadasinin klibi hic calmiyor (toast ve soluk
   * parlama kaliyor), yoksa tam sesle senin sesini ele gecirirdi. Ayni
   * nedenle seslendirme kaydiricisi sifirdayken hicbir klip baslamiyor.
   */
  private playKillStreakAnnouncement(rule: KillStreakRule, own: boolean): HTMLAudioElement | undefined {
    const sounds = this.killStreakSounds[rule.tier];
    if (sounds.length === 0 || this.voiceVolume <= 0) {
      return undefined;
    }
    // ATLAS konusurken seri anonsu yok: ikisi ust uste binmesin (afis kaliyor).
    if (this.atlas?.isSpeaking) {
      return undefined;
    }
    if (!own && !canSetMediaVolume()) {
      return undefined;
    }

    const playing = this.streakVoice && !this.streakVoice.audio.paused && !this.streakVoice.audio.ended
      ? this.streakVoice
      : undefined;
    if (!own && playing) {
      return undefined;
    }

    const audio = Phaser.Utils.Array.GetRandom(sounds);
    if (playing && playing.audio !== audio) {
      playing.audio.pause();
    }
    audio.pause();
    audio.currentTime = 0;
    audio.volume = this.voiceVolume * (own ? 1 : TEAMMATE_STREAK_VOICE_GAIN);
    this.streakVoice = { audio, own };
    void audio.play().catch(() => {
      // Mobile browsers may block audio until the first real touch; the next streak can retry.
      // Calmayan klip siradaki afisi bekletmesin.
      if (own) this.releaseKillStreakVoiceHold(audio);
    });
    return audio;
  }

  /**
   * Kendi klibin bitene kadar afis ekranda, siradaki afis sirada: bitis ani
   * klibin suresinden (metadata yoksa `STREAK_VOICE_HOLD_MAX_MS` tavani).
   * Klip erken durursa (bitti, ATLAS kesti, tarayici calmadi) `pause` olayi
   * tutusu birakiyor. Afisin kalacagi sure (ms) donuyor; klip yoksa 0.
   */
  private holdKillStreakVoice(voice: HTMLAudioElement | undefined, now: number) {
    this.streakVoiceHold = voice;
    if (!voice) {
      return 0;
    }
    const remainingMs = Number.isFinite(voice.duration) && voice.duration > 0
      ? Math.max(0, voice.duration - voice.currentTime) * 1000
      : STREAK_VOICE_HOLD_MAX_MS;
    const holdMs = Math.min(STREAK_VOICE_HOLD_MAX_MS, remainingMs);
    this.streakBanners.holdUntil(now + holdMs);
    voice.addEventListener("pause", () => this.releaseKillStreakVoiceHold(voice), { once: true });
    return holdMs;
  }

  /** Klip durdu: ekrandaki afisin tutusu biter, bekleyen afis varsa hemen yer aliyor. */
  private releaseKillStreakVoiceHold(voice: HTMLAudioElement) {
    // play() oncesindeki pause() olayi gec gelebiliyor; klip calarken birakma.
    if (this.streakVoiceHold !== voice || !voice.paused) {
      return;
    }
    this.streakVoiceHold = undefined;
    this.streakBanners.holdUntil(performance.now());
    this.hastenStreakBanner();
  }

  /**
   * Kendi serinin afisi: kompakt ust bildirim, ama karakter temasiyla.
   *
   * Eski afisler (titreyen, parazitli, kayarak gelen tema plakalari) ekranin
   * ortasina kadar iniyordu; 703e911 onlari duz bir plakayla degistirdi. Tema
   * ve hareket geri geldi, boyut gelmedi: plaka en fazla 280 CSS px genislik,
   * `STREAK_PLATE_HEIGHT_PX` yukseklik, HUD'un hemen altinda; kapsayici
   * CSS pikseline olcekli (`displayScale / zoom`), yani olculer her DPR'de
   * gercek CSS pikseli. Hicbir tween plakayi seridin
   * ortasina tasimiyor: giris 14 px yukaridan, cikis 8 px yukari.
   *
   * Sure eskisi gibi ~1.7-1.9 sn (`STREAK_PLATE_HOLD_MS` + kademe), sira
   * (`StreakBannerQueue`, `hastenStreakBanner`) degismedi. Ses klibi burada,
   * afis ekrana geldigi an; sarsinti ve titresim yonetmenden ("streak": 2 px,
   * yalnizca kendi serin, hareket azaltmada yok). Hareket azaltmada ayni
   * plaka yerinde belirip soner (`settleStreakBannerStill`).
   *
   * Zeynep'in kukla elleri bu boyda okunmuyor (390x260 bir resimdi); yerine
   * plakaya inen ince kukla iplari. Melis'in yuzu kucuk bir amblem olarak
   * solda kaliyor.
   */
  private showKillStreakAnnouncement(item: StreakBannerItem) {
    const { characterId, rule } = item;
    // Kendi klibin: afis klip bitene kadar kaliyor, siradaki bekliyor (tavan STREAK_VOICE_HOLD_MAX_MS).
    const voiceHoldMs = this.holdKillStreakVoice(this.playKillStreakAnnouncement(rule, true), performance.now());
    this.feedback?.emit("streak", { own: true });
    const theme = getKillStreakVisualTheme(characterId, rule);
    const chaos = rule.chaos;
    const view = getArenaCameraView(this.selectedMapData, this.arenaChrome, this.getWorldSize());
    const zoom = Math.max(0.01, this.cameras.main.zoom);
    // Plaka icinde birim CSS pikseli: tuval yuksek DPR'de CSS'ten genis (375 CSS
    // genislikte 780 oyun pikseli), olcu ve yazilar her ekranda ayni boyda.
    const gamePxPerCss = Math.max(0.01, this.scale.displayScale.x);
    const cssPx = gamePxPerCss / zoom;
    const width = Math.min(STREAK_PLATE_MAX_WIDTH_PX, (view.width * zoom) / gamePxPerCss - 24);
    const height = STREAK_PLATE_HEIGHT_PX;
    const halfW = width / 2;
    const halfH = height / 2;
    const x = view.left + view.width / 2;
    const y = view.top + view.height * this.arenaChrome.topRatio + (8 + height / 2) * cssPx;
    const container = this.add.container(x, y).setDepth(80).setAlpha(0).setScale(cssPx);

    // Kirik koseli plaka; kademe yukseldikce kesik buyuyor.
    const cut = 7 + chaos * 2;
    const outline = [
      new Phaser.Geom.Point(-halfW + cut, -halfH),
      new Phaser.Geom.Point(halfW, -halfH),
      new Phaser.Geom.Point(halfW, halfH - cut),
      new Phaser.Geom.Point(halfW - cut, halfH),
      new Phaser.Geom.Point(-halfW, halfH),
      new Phaser.Geom.Point(-halfW, -halfH + cut)
    ];
    const plate = this.add.graphics();
    plate.fillStyle(theme.fill, 0.94);
    plate.fillPoints(outline, true);
    plate.lineStyle(1.5 + chaos * 0.4, theme.primary, 0.92);
    plate.strokePoints(outline, true);
    plate.lineStyle(1.5, theme.secondary, 0.8);
    plate.lineBetween(-halfW + 12, halfH - 3, -halfW + 26, -halfH + 3);
    plate.lineBetween(halfW - 30, -halfH + 3, halfW - 16, halfH - 3);
    plate.lineStyle(1.5, theme.accent, 0.7);
    plate.lineBetween(-halfW + 4, halfH - cut - 4, -halfW + 14, halfH - 3);
    if (chaos >= 3) {
      plate.lineStyle(1, 0xffffff, 0.3);
      plate.lineBetween(-halfW * 0.3, -halfH + 2, -halfW * 0.3 + 12, halfH - 2);
      plate.lineBetween(halfW * 0.45, -halfH + 2, halfW * 0.45 + 12, halfH - 2);
    }
    if (theme.style === "command") {
      // Kukla iplari: ustten plakaya inen ince cizgiler, uclarinda dugum.
      // Ortadaki motif yazisinin iki yaninda, kenar cizgilerinin icinde.
      plate.lineStyle(1.5, theme.secondary, 0.75);
      for (const offset of [-0.72, -0.58, 0.58, 0.72]) {
        const stringX = halfW * offset;
        plate.lineBetween(stringX, -halfH, stringX, -halfH + 10);
        plate.fillStyle(theme.accent, 0.85);
        plate.fillRect(stringX - 1.5, -halfH + 10, 3, 3);
      }
    }

    // Melis: yuz amblemi solda, iki renkli hayaletiyle (ADD, koyu plakada).
    const imageObjects: Phaser.GameObjects.Image[] = [];
    let contentX = 0;
    // Kenar cizgileri (kenardan 12-26 px) yazinin altinda kalmasin.
    let contentWidth = width - 44;
    const imageKey = theme.style === "creepy" ? theme.imageKey ?? "melis-creepy" : undefined;
    if (imageKey && this.textures.exists(imageKey)) {
      const source = this.textures.get(imageKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const imageHeight = height * (imageKey === "melis-creepy-legend" ? 0.92 : 0.84);
      const imageWidth = Math.min(48, imageHeight * (source.width / Math.max(1, source.height)));
      const imageX = -halfW + 8 + imageWidth / 2;
      const angle = getMelisKillStreakImageAngle(imageKey, chaos) * 0.6;
      const make = (dx: number, dy: number) => this.add.image(imageX + dx, dy, imageKey)
        .setOrigin(0.5)
        .setDisplaySize(imageWidth, imageHeight)
        .setAngle(angle)
        .setBlendMode(Phaser.BlendModes.ADD);
      imageObjects.push(
        make(2 + chaos * 0.5, -1).setTint(theme.secondary).setAlpha(0.22),
        make(-2 - chaos * 0.5, 1).setTint(theme.primary).setAlpha(0.2),
        make(0, 0).setAlpha(0.8)
      );
      contentX = (imageWidth + 8) / 2;
      contentWidth = width - imageWidth - 30;
    }

    const name = characters.find(character => character.id === characterId)?.displayName ?? this.selectedCharacter.displayName;
    const message = `${name}! ${rule.label}!`;
    const titleY = -3;
    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "Impact, Arial Black, Arial",
      fontSize: "20px",
      fontStyle: "bold",
      color: theme.textColor,
      stroke: theme.strokeColor,
      strokeThickness: 4
    };
    const creepy = theme.style === "creepy";
    const coldGhost = this.add.text(contentX + 1.5 + chaos * 0.5, titleY + 1, message, {
      ...baseStyle,
      color: toCssColor(theme.secondary),
      stroke: "#020617",
      strokeThickness: 2
    }).setOrigin(0.5).setAngle(creepy ? 0 : -1 - chaos * 0.2).setAlpha(creepy ? 0.32 : 0.62 + chaos * 0.04);
    const hotGhost = this.add.text(contentX - 1.5 - chaos * 0.5, titleY - 1, message, {
      ...baseStyle,
      color: toCssColor(theme.primary),
      stroke: "#020617",
      strokeThickness: 2
    }).setOrigin(0.5).setAngle(creepy ? 0 : 0.8 + chaos * 0.2).setAlpha(creepy ? 0.34 : 0.66 + chaos * 0.04);
    const mainText = this.add.text(contentX, titleY, message, {
      ...baseStyle,
      stroke: creepy ? "#02010a" : toCssColor(theme.fill)
    }).setOrigin(0.5).setAngle(creepy ? -1 - chaos * 0.2 : chaos >= 4 ? -1.5 : -0.8);
    const titleScale = Math.min(1, contentWidth / Math.max(1, mainText.width));
    for (const text of [coldGhost, hotGhost, mainText]) {
      text.setScale(titleScale);
    }

    const command = theme.style === "command";
    const motifText = this.add.text(command ? contentX : contentX - contentWidth / 2 + (imageObjects.length > 0 ? 0 : 6), -halfH + 7, theme.motif, {
      fontFamily: "Arial Black, Arial",
      fontSize: "9px",
      color: toCssColor(theme.accent),
      stroke: "#020617",
      strokeThickness: 2
    }).setOrigin(command ? 0.5 : 0, 0.5).setAlpha(0.8);
    if (motifText.width > contentWidth * 0.8) {
      motifText.setScale((contentWidth * 0.8) / motifText.width);
    }

    // Parazit seritleri (Melis): yazinin ustunde kisa yanip sonen kesitler.
    const glitches: Phaser.GameObjects.Rectangle[] = [];
    if (creepy) {
      const count = 5 + chaos * 2;
      for (let index = 0; index < count; index += 1) {
        const color = index % 3 === 0 ? theme.primary : index % 3 === 1 ? theme.secondary : theme.accent;
        glitches.push(this.add.rectangle(
          Phaser.Math.Between(-halfW + 12, halfW - 12),
          Phaser.Math.Between(-halfH + 4, halfH - 4),
          Phaser.Math.Between(8, 22 + chaos * 6),
          Phaser.Math.Between(1, 2 + Math.ceil(chaos / 2)),
          color,
          0.2 + chaos * 0.04
        ).setBlendMode(Phaser.BlendModes.ADD));
      }
    }

    const parts: Phaser.GameObjects.GameObject[] = [plate, coldGhost, hotGhost, mainText, motifText, ...glitches, ...imageObjects];
    // Ikinci satir en ustte: serinin gercek gucu, sigarsa bu tarayicinin unvani.
    // Afis sirada beklerken buff dolduysa guc satiri yok (artik dogru degil); NOT BAD'in zaten yok.
    const buffText = performance.now() < item.buffUntil ? getKillStreakBuffText(rule.tier) : "";
    const buffLine = formatBannerSecondLine(buffText, this.cosmetics.title);
    if (buffLine) {
      const bonus = this.add.text(contentX, halfH - 9, buffLine, {
        fontFamily: "Arial Black, Arial",
        fontSize: "11px",
        color: "#fde68a",
        stroke: "#020617",
        strokeThickness: 3
      }).setOrigin(0.5);
      if (bonus.width > contentWidth) {
        bonus.setScale(contentWidth / bonus.width);
      }
      parts.push(bonus);
    }
    // Yazilar CSS boyunda ama tuval cozunurlugunde: buyutulunce bulaniklasmasin.
    for (const part of parts) {
      if (part instanceof Phaser.GameObjects.Text) part.setResolution(Math.max(1, gamePxPerCss));
    }
    container.add(parts);
    this.rampageContainer = container;
    // Klip afisten uzunsa afis klibin sonuna (+150 ms) kadar kaliyor.
    const voiceTailMs = voiceHoldMs > 0 ? voiceHoldMs + 150 : 0;
    const holdMs = Math.max(STREAK_PLATE_HOLD_MS + chaos * 60, voiceTailMs);
    const stillHoldMs = Math.max(STREAK_PLATE_HOLD_MS, voiceTailMs);
    if (this.feedback?.reducedMotion) {
      // Kayma, sallanma, parazit yok: yerinde belirip sonen ayni plaka.
      this.settleStreakBannerStill(container, y, stillHoldMs, 200);
      return;
    }

    // Giris: HUD'un altindan 14 px kayarak, hafif asarak.
    container.setY(y - 14 * cssPx);
    this.tweens.add({
      targets: container,
      y,
      alpha: 1,
      duration: Math.max(150, 240 - chaos * 20),
      ease: "Back.easeOut"
    });
    // Titreme: en fazla ~1.7 derece (280 px plakada kenarlar ~4 px oynuyor).
    const tilt = 0.5 + chaos * 0.3;
    this.tweens.add({
      targets: container,
      angle: { from: -tilt, to: tilt },
      yoyo: true,
      // ~0.6-0.9 sn: plaka okunacak kadar erken duruyor.
      repeat: 2 + Math.round(chaos * 1.5),
      duration: Math.max(40, 80 - chaos * 8),
      ease: "Sine.easeInOut",
      onComplete: () => container.setAngle(0)
    });
    // Yatay kesik: kademe 2+ plaka girerken birkac kare yana atliyor.
    if (chaos >= 2) {
      this.tweens.add({
        targets: container,
        x: x + (1 + chaos) * cssPx,
        yoyo: true,
        repeat: 1 + chaos,
        delay: 120,
        duration: 40,
        ease: "Stepped",
        onComplete: () => container.setX(x)
      });
    }
    if (creepy) {
      this.tweens.add({
        targets: [hotGhost, coldGhost],
        alpha: { from: 0.12, to: 0.5 },
        yoyo: true,
        repeat: 6 + chaos * 3,
        duration: Math.max(28, 58 - chaos * 4),
        ease: "Stepped"
      });
      this.tweens.add({
        targets: glitches,
        alpha: { from: 0.06, to: 0.6 },
        yoyo: true,
        repeat: 8 + chaos * 3,
        duration: Math.max(20, 48 - chaos * 5),
        ease: "Stepped"
      });
    } else if (command || chaos >= 2) {
      this.tweens.add({
        targets: [coldGhost, hotGhost],
        x: `+=${1 + chaos}`,
        yoyo: true,
        repeat: 6 + chaos * 2,
        duration: 45,
        ease: "Stepped"
      });
    }
    if (command) {
      this.tweens.add({
        targets: motifText,
        alpha: { from: 0.42, to: 0.95 },
        yoyo: true,
        repeat: 5 + chaos * 2,
        duration: 72,
        ease: "Sine.easeInOut"
      });
    }
    if (creepy || chaos >= 4) {
      // Efsane (ve Melis): yazi nabiz gibi esniyor, sonunda olcegine donuyor.
      this.tweens.add({
        targets: mainText,
        scaleX: { from: titleScale * 0.98, to: titleScale * (1.06 + chaos * 0.01) },
        scaleY: { from: titleScale * 1.03, to: titleScale * 0.95 },
        yoyo: true,
        repeat: creepy ? 4 + chaos * 2 : 9,
        duration: creepy ? 66 : 56,
        ease: "Sine.easeInOut",
        onComplete: () => mainText.setScale(titleScale)
      });
    }
    this.scheduleStreakBannerExit(container, y - 8 * cssPx, holdMs, 220);
  }

  /**
   * Hareket azaltma: afis son yerinde belirip soner; kayma, sallanma,
   * parazit ve titreme yok, yazi ve buff satiri bilgiyi tasiyor. Cikis da
   * yerinde (`exitY === restY`), yani `hastenStreakBanner`in hizli cikisi da
   * yerinde bir sonme.
   */
  private settleStreakBannerStill(container: Phaser.GameObjects.Container, restY: number, holdMs: number, exitMs: number) {
    container.setY(restY).setAngle(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 160, ease: "Linear" });
    this.scheduleStreakBannerExit(container, restY, holdMs, exitMs);
  }

  /**
   * Afisin cikisi. Tween saklaniyor: siradaki afis beklerken
   * `hastenStreakBanner` onu one cekiyor. Bitince siradaki afis geliyor.
   */
  private scheduleStreakBannerExit(container: Phaser.GameObjects.Container, exitY: number, delay: number, duration: number) {
    const tween = this.tweens.add({
      targets: container,
      y: exitY,
      alpha: 0,
      delay,
      duration,
      ease: "Cubic.easeIn",
      onComplete: () => this.finishStreakBanner(container)
    });
    if (this.rampageContainer === container) {
      this.rampageExit = { tween, exitY, startsAt: performance.now() + delay };
    }
  }

  /**
   * Siradaki afis bekliyor: ekrandaki en az `STREAK_BANNER_MIN_VISIBLE_MS`
   * kaldiktan sonra hizli bir cikisla yer aciyor. Silinmiyor -- okunmadan
   * kaybolan afis eskiden yeni afisin kendisi kadar gurultuydu.
   */
  private hastenStreakBanner() {
    const container = this.rampageContainer;
    const exit = this.rampageExit;
    const handoffAt = this.streakBanners.handoffAt();
    const now = performance.now();
    if (!container || !exit || handoffAt === undefined || exit.startsAt <= now) {
      return;
    }
    const delay = Math.max(0, handoffAt - now);
    if (now + delay >= exit.startsAt) {
      return;
    }
    exit.tween.stop();
    this.scheduleStreakBannerExit(container, exit.exitY, delay, STREAK_BANNER_HANDOFF_MS);
  }

  /** Afis bitti: nesneler ve tween'leri gidiyor, siradaki (bayatlamamis) afis geliyor. */
  private finishStreakBanner(container: Phaser.GameObjects.Container) {
    // Hizlanan cikis ic tween'ler bitmeden gelebiliyor; yikilan nesneye yazmasinlar.
    this.tweens.killTweensOf([container, ...container.list]);
    container.destroy(true);
    if (this.rampageContainer !== container) {
      return;
    }
    this.rampageContainer = undefined;
    this.rampageExit = undefined;
    this.streakVoiceHold = undefined;
    const next = this.streakBanners.finish(performance.now());
    if (next) {
      this.showKillStreakAnnouncement(next);
      // Arkasinda hala bekleyen varsa bu da tam suresini beklemesin.
      this.hastenStreakBanner();
    }
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
      if (!this.isEdgePlacedDefinition(tower.definitionId)) {
        return false;
      }

      return this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation ?? "horizontal", this.getEdgeLength(tower.definitionId))
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
      .filter((tower) => !this.isEdgePlacedDefinition(tower.definitionId))
      .map((tower) => ({
        tower,
        distanceSq: Phaser.Math.Distance.Squared(x, y, tower.x, tower.y)
      }))
      .filter((candidate) => candidate.distanceSq <= hitRadius * hitRadius)
      .sort((left, right) => left.distanceSq - right.distanceSq)[0]?.tower;
  }

  private updateAbartiOrientationButton(shopVisible = !this.selectedPlacedTowerId) {
    const visible = shopVisible && this.selectedTowerDefinition.id === "zeynep-8" && !this.selectedPlacedTowerId;
    if (visible) {
    } else {
    }
  }

  /**
   * Basilan beceriyi sunucu duyana kadar mesgul gosterir.
   *
   * Soguma sunucudan geliyor ve komut islenene kadar hala sifir: dugme
   * basildiktan sonra bir sure daha hazir duruyordu. Kotu baglantida oyuncu
   * bunu "islemedi" diye okuyup ustune basiyor -- ikinci basis da bosa gidiyor
   * cunku sunucu ilkini zaten islemis oluyor.
   *
   * Uydurma bir geri sayim gostermiyoruz: beceri sureleri sunucunun bilgisi.
   * Gosterilen sey yalnizca "gitti, bekleniyor" -- sunucunun sogumasi gelince
   * onun yerini aliyor.
   */
  private resolveSkillEcho(serverCooldowns: number[]) {
    const now = performance.now();
    return serverCooldowns.map((cooldown, slot) => {
      const echoUntil = this.skillEchoUntil[slot] ?? 0;
      if (echoUntil === 0) {
        return cooldown;
      }
      if (cooldown > 0 || now >= echoUntil) {
        this.skillEchoUntil[slot] = 0;
        return cooldown;
      }
      // Sifirdan buyuk herhangi bir deger dugmeyi mesgul yapar; sure sunucudan
      // gelince gercek sayiyla degisiyor.
      return cooldown || 1;
    });
  }

  private echoSkillUse(slot: number) {
    this.skillEchoUntil[slot] = performance.now() + LOCAL_ECHO_TIMEOUT_MS;
    this.emitControlState();
  }

  private emitControlState() {
    const selectedTower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    this.syncTowerStatsRequest(selectedTower);
    const definition = selectedTower
      ? towerCatalog[selectedTower.characterId].find((tower) => tower.id === selectedTower.definitionId)
      : undefined;
    const upgradeCost = definition ? getTowerLevelExpCost(definition.cost, selectedTower?.level ?? 1) : 0;
    const upgradeGoldCost = definition ? getTowerLevelGoldCost(definition.cost, selectedTower?.level ?? 1, definition.id) : 0;
    const refundState = selectedTower ? this.getTowerRefundState(selectedTower) : undefined;
    const sellRefund = refundState?.amount ?? 0;
    const canUpgrade = Boolean(selectedTower && definition && selectedTower.ownerId === this.localSessionId && selectedTower.level < getTowerMaxLevel(definition)
      && (this.localPlayerSnapshot?.experience ?? 0) >= upgradeCost
      && (this.localPlayerSnapshot?.gold ?? 0) >= upgradeGoldCost);
    // Her seviye atlama XP ve altin istiyor; ikisi yan yana (paylasilan `getTowerLevelGoldCost`).
    const upgradePriceLabel = upgradeGoldCost > 0
      ? t("scene.upgrade.price", { xp: upgradeCost, gold: upgradeGoldCost })
      : `${upgradeCost} XP`;
    const canSell = Boolean(selectedTower && selectedTower.ownerId === this.localSessionId);
    // Onarim yalnizca hasarli ve ayakta duran yapilarda anlamli: yikilan yapi
    // geri gelmez, yeniden insa edilir. Bedel sunucudaki formulun aynisi.
    const repairState = this.getRepairState(selectedTower, definition);
    const cooldowns = this.resolveSkillEcho(this.localPlayerSnapshot?.skillCooldowns ?? [0, 0, 0]);
    const reputation = this.localPlayerSnapshot?.reputation ?? 0;
    const authorityChain = this.localPlayerSnapshot?.authorityChain ?? 0;
    const approval = this.localPlayerSnapshot?.approval ?? 0;
    const stress = this.localPlayerSnapshot?.stress ?? 0;
    const ultimatePower = this.localPlayerSnapshot?.ultimatePower ?? 0;
    const ultimatePowerCost = getUltimatePowerUpgradeCost(ultimatePower);
    const spectrumTotal = Math.max(1, approval + stress);
    const stressRatio = Phaser.Math.Clamp(stress / spectrumTotal, 0, 1);
    const isUnderworldTower = selectedTower?.definitionId === "archer-4";
    // Kule islemleri (mühimmat, isi, performans, hedefleme) tek olcutten
    // geciyor: bunlarin hepsi vuran bir yapi icin var.
    const towerOperations = this.acceptsTowerOperation(selectedTower);
    // Ruh hali kule davranisini degistiriyor; oyuncu bunu ancak secili kulenin
    // panelinde, tam ihtiyaci oldugu anda okuyabilir.
    const melisZone = getMelisSpectrumZone(approval, stress);
    const melisZoneEffect = selectedTower?.characterId === "archer"
      ? getMelisZoneEffectText(selectedTower.definitionId, melisZone)
      : undefined;
    const melisZoneLabel = melisZone === "approval" ? t("scene.resource.approval") : melisZone === "stress" ? t("scene.resource.stress") : t("scene.resource.balance");
    const ownedShopItems = this.localPlayerSnapshot?.ownedShopItemIds ?? [];
    // Kule esyalarinin fiyati kule basina; sunucunun `getPlayerShopLoadout` yukuyle ayni.
    const shopLoadout = {
      towers: this.getLocalTowerProfiles().map(({ tower, definition }) => ({ definition, equippedItemIds: tower.equippedShopItemIds ?? [] })),
      inventoryItemIds: this.localPlayerSnapshot?.inventoryItemIds ?? []
    };
    // Hedefleme modlari artik kulenin acik kilitlerinden okunur; kilidi veren
    // sey esya da olabilir kart da, ikisini de sunucu cozup gonderiyor.
    const towerUnlockBits = selectedTower?.unlockBits;
    const targetModes = [definition?.engine?.targeting ?? "first"];
    for (const [unlock, mode] of [
      ["targeting:weakest", "weakest"],
      ["targeting:random", "random"],
      ["targeting:closest", "closest"],
      ["targeting:last", "last"]
    ] as const) {
      if (hasUnlockBit(towerUnlockBits, unlock) && !targetModes.includes(mode)) targetModes.push(mode);
    }
    // Magaza acilinca HUD'daki altin sayimi beklemeden gercek degere oturuyor:
    // magazanin basligi gercek altini yaziyor, cip bir an bile farkli okunmasin.
    const goldShopOpen = this.isGoldShopOpen(this.latestPerfSnapshot, this.localPlayerSnapshot);
    if (goldShopOpen && !this.goldShopWasOpen) {
      this.game.events.emit("game:hud-gold-settle");
    }
    this.goldShopWasOpen = goldShopOpen;
    const shopFresh = goldShopOpen ? this.resolveShopNovelty() : undefined;

    this.game.events.emit("game:controls-state", {
      visible: true,
      characterName: this.selectedCharacter.displayName,
      // Kalici ipucu satiri yok: icindeki canli DPS her anlik goruntude
      // degisip paneli bastan kurduruyordu ve cizimi zaten kalkmisti.
      notice: this.getActiveNotice(),
      selectedPlacedTowerId: selectedTower?.id,
      selectedTowerDefinitionId: this.selectedTowerDefinition.id,
      showOrientationToggle: this.selectedTowerDefinition.id === "zeynep-8" && !selectedTower,
      orientation: this.abartiOrientation,
      // Panel "ne kurabilirim" sorusunu cevaplar, "kitimde ne var" sorusunu degil:
      // duvar kimsenin kiti degil ama herkes kurabilir.
      towers: towerCatalog[this.selectedCharacter.id].map((tower) => ({
        id: tower.id,
        name: tower.name,
        cost: getTowerBuildCost(tower.cost),
        color: `#${tower.color.toString(16).padStart(6, "0")}`,
        selected: tower.id === this.selectedTowerDefinition.id && !selectedTower
      })),
      skills: this.selectedCharacter.skills.map((skill, index) => {
        const cooldown = cooldowns[index] ?? 0;
        const zeynepCommand = this.localPlayerSnapshot?.characterId === "zeynep" ? getZeynepCommandButtonState(authorityChain) : undefined;
        // Execute hedeflemesi acikken dugme ikinci basisin iptal ettigini soyluyor.
        const executeArmed = index === ATAKAN_EXECUTE_SLOT && this.selectedCharacterId === "warrior" && this.pendingAction?.type === "execute";
        // Metal Kalkan sekmeden atilmiyor (haritada basili tutup surukle):
        // satiri bilgi olarak gidiyor -- ad, nasil kullanildigi, bekleme durumu.
        const shieldGesture = index === ATAKAN_SHIELD_SLOT && this.selectedCharacterId === "warrior";
        // Haritadaki jest (yuva sirasina sabit): her dugmenin altinda tek satir.
        const mapHint = getSkillGestureTargets(this.getSkillGestureCharacterId())[index] === "none" ? undefined : this.getSkillMapHint(index);
        return {
          slot: index,
          name: skill.name,
          label: cooldown > 0 ? `${cooldown}s` : zeynepCommand ? `${skill.name}\n${zeynepCommand.label}` : executeArmed ? `${skill.name}\n${t("scene.skill.cancel")}` : skill.name,
          disabled: cooldown > 0,
          ...(mapHint && !shieldGesture ? { mapHint } : {}),
          ...(shieldGesture ? {
            gesture: {
              hint: t("scene.skill.shieldGesture"),
              status: cooldown > 0 ? t("scene.skill.gestureCooldown", { seconds: cooldown }) : t("scene.skill.gestureReady"),
              ready: cooldown <= 0
            }
          } : {})
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
      melisStance: this.localPlayerSnapshot?.characterId === "archer" ? {
        current: this.localPlayerSnapshot.melisStance ?? "approval",
        evolutionCost: this.getNextMelisEvolutionCost(),
        stress
      } : undefined,
      melisSpectrum: this.localPlayerSnapshot?.characterId === "archer" ? {
        approval,
        stress,
        ratio: stressRatio,
        zone: getMelisSpectrumZone(approval, stress),
        intensity: approval + stress
      } : undefined,
      ultimate: {
        charge: this.currentUltimateCharge,
        ready: this.currentUltimateCharge >= 100,
        choiceOpen: this.ultimateChoiceOpen,
        needsChoice: this.selectedCharacterId === "warrior",
        power: ultimatePower,
        powerMultiplier: getUltimatePowerMultiplier(ultimatePower),
        upgradeCost: ultimatePowerCost,
        canUpgrade: ultimatePowerCost !== undefined && Math.floor(this.localPlayerSnapshot?.gold ?? 0) >= ultimatePowerCost,
        readyPulseAt: this.currentUltimateCharge >= 100 ? this.ultimateReadyPulseAt : undefined
      },
      underworldMode: isUnderworldTower ? {
        current: selectedTower.melisUnderworldMode ?? "approval",
        pullCount: selectedTower.melisUnderworldPullCount ?? 0,
        canEdit: selectedTower.ownerId === this.localSessionId
      } : undefined,
      // Kapi yalnizca duvarda. Baska yapilarda "gecis" diye bir sey yok:
      // kule kareyi kapliyor, duvar iki kare arasindaki cizgiyi.
      workerBan: {
        active: this.workerBanMode,
        count: this.localPlayerSnapshot?.workerBannedCells?.length ?? 0
      },
      gate: selectedTower && selectedTower.definitionId === WALL_TOWER_ID ? {
        open: selectedTower.gate === true,
        canEdit: selectedTower.ownerId === this.localSessionId
      } : undefined,
      ammoLogistics: selectedTower && towerOperations ? {
        enabled: selectedTower.ammoLogisticsEnabled !== false,
        canEdit: selectedTower.ownerId === this.localSessionId
      } : undefined,
      standby: selectedTower && towerOperations ? {
        active: selectedTower.standby === true,
        waking: (selectedTower.wakeRemainingMs ?? 0) > 0,
        canEdit: selectedTower.ownerId === this.localSessionId
      } : undefined,
      targeting: selectedTower && towerOperations && definition?.engine?.attack.shape !== "orbit"
        ? { current: selectedTower.targetingMode ?? definition?.engine?.targeting ?? "first", modes: [...new Set(targetModes)] }
        : undefined,
      goldShop: goldShopOpen && this.localPlayerSnapshot ? {
        gold: Math.floor(this.localPlayerSnapshot.gold),
        rerollPrice: this.localPlayerSnapshot.shopRerollPrice ?? 40,
        offers: (this.localPlayerSnapshot.shopOffers ?? []).map((item) => {
          const price = getShopItemPrice(item, ownedShopItems, shopLoadout);
          // Teklif sunucunun kopyasi (Turkce metin); ad ve aciklama katalogdan, dile gore.
          const local = getShopItem(item.id);
          return { id: item.id, name: local?.name ?? item.name, description: local?.description ?? item.description, price, category: item.category, affordable: this.localPlayerSnapshot!.gold >= price, fresh: shopFresh?.has(item.id) === true, alreadyUnlocked: this.isShopItemAlreadyUnlockedLocally(item.id) };
        })
      } : undefined,
      equippedItems: selectedTower?.equippedShopItemIds?.map((itemId) => {
        const item = getShopItem(itemId);
        return { id: itemId, name: item?.name ?? itemId, description: item?.description ?? "" };
      }) ?? [],
      equippedCapacity: MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER,
      // Kimlikler gidiyor, metin degil: ad ve aciklama arayuzun kendi
      // katalogundan okunuyor. Dizi icerigi ayni kaldikca panel anahtari da
      // ayni kaliyor, yani deste her karede yeniden kurma sebebi olmuyor.
      ownedCardIds: this.localPlayerSnapshot?.ownedCardIds ?? [],
      towerCards: this.getTowerCardState(selectedTower, definition),
      inventory: {
        open: this.inventoryOpen,
        pendingItemId: this.pendingEquipItemId,
        repairAll: this.getRepairAllState(),
        // Ayni esyadan birden fazla olabilir; listede tek satirda sayilir.
        items: Object.values(
          (this.localPlayerSnapshot?.inventoryItemIds ?? []).reduce<Record<string, { id: string; name: string; description: string; category: string; count: number; alreadyUnlocked: boolean }>>((grouped, itemId) => {
            const item = getShopItem(itemId);
            const existing = grouped[itemId];
            if (existing) {
              existing.count += 1;
              return grouped;
            }
            grouped[itemId] = {
              id: itemId,
              name: item?.name ?? itemId,
              description: item?.description ?? "",
              category: item?.category ?? "power",
              count: 1,
              alreadyUnlocked: this.isShopItemAlreadyUnlockedLocally(itemId)
            };
            return grouped;
          }, {})
        )
      },
      workerRoster: this.getWorkerRosterState(),
      workerHire: this.getWorkerHireState(),
      workerDevelopment: {
        experience: this.localPlayerSnapshot?.experience ?? 0,
        selectedSkillIds: [...(this.localPlayerSnapshot?.workerSkillIds ?? [])],
        open: false
      },
      creative: this.getCreativeControlState(),
      // Ogretici adim motoru (tutorial.ts) yalnizca bu bayrak acikken calisiyor.
      tutorial: this.tutorialMode,
      tutorialRoomId: this.tutorialMode ? this.room?.roomId : undefined,
      tutorialFacts: this.tutorialMode ? this.getTutorialFacts() : undefined,
      upgrade: {
        label: selectedTower && definition && selectedTower.level >= getTowerMaxLevel(definition) ? t("scene.upgrade.max") : selectedTower ? t("scene.upgrade.action", { price: upgradePriceLabel }) : t("scene.upgrade.noTower"),
        enabled: canUpgrade
      },
      sell: {
        // "Geri Al" ve "Sat" ayni dugme ama ayni sey degil: biri alimi
        // iptal ediyor, digeri zarara satiyor. Oyuncunun hangisini
        // yaptigini basmadan once bilmesi gerekiyor.
        label: canSell ? `${refundState?.undoable ? t("scene.tower.undo") : t("scene.tower.sell")} ${sellRefund}g` : t("scene.tower.sell"),
        enabled: canSell
      },
      repair: repairState,
      performance: this.getPerformanceControlState(selectedTower),
      selectedTowerId: this.selectedPlacedTowerId,
      defenseSummaryAvailable: Boolean(this.latestDefenseSummary),
      productionAmmo: selectedTower?.resourceProvider === "ammunition" ? { value: selectedTower.productionAmmo ?? "bullet", canEdit: selectedTower.ownerId === this.localSessionId } : undefined,
      logisticsPriority: selectedTower ? { value: selectedTower.logisticsPriority ?? "normal", canEdit: selectedTower.ownerId === this.localSessionId } : undefined,
      // Kule paneli: sunucunun blogu, canli sayilar ve bolum notlari. Eskiden
      // hepsi " | " ile dizilmis tek bir metin satiriydi (`selectedStats`).
      towerSheet: selectedTower ? this.buildTowerSheetInput(selectedTower, definition, {
        towerOperations,
        melisZoneEffect,
        melisZoneLabel,
        upgradeXp: upgradeCost,
        upgradeGold: upgradeGoldCost,
        refund: canSell && refundState ? { amount: sellRefund, undoable: Boolean(refundState.undoable) } : undefined
      }) : undefined
    });
  }

  /**
   * Kule panelindeki isi freni notu (Kaynak bolumu).
   *
   * Kural hep yaziyor: fren uzun sure hicbir yerde gorunmuyordu ve oyuncu
   * isiyi yalnizca kilit sanip atis hizi kartini sogutmanin onune koyuyordu.
   */
  private getHeatBrakeLine(tower: TowerSnapshot, definition: TowerDefinition | undefined) {
    // Etki araligiyla calisan kulede atis yok ama fren o araligi da uzatiyor.
    // Esik isi cubugunun birimiyle ("%X") yaziliyor; "°C" panelde baska
    // hicbir yerde gecmiyordu ve oyuncu ikisini eslestiremiyordu. Isinin
    // izin verdigi surekli hiz artik ritim satirinin altinda (sunucu blogu).
    const temp = t("format.percent", { v: TOWER_HEAT_BRAKE_TEMPERATURE });
    return hasUnlockBit(tower.unlockBits, "heat:thermalMass")
      ? t("scene.heat.noBrakeThermalMass")
      : definition?.engine?.fixedFireInterval
        ? t("scene.heat.noBrakeFixedInterval")
        : t(tower.effectIntervalMs !== undefined ? "scene.heat.brakeEffect" : "scene.heat.brakeFire", { temp });
  }

  private updateSelectionUi() {
    const selectedTower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    const selectionKey = selectedTower
      ? `placed|${selectedTower.id}|${selectedTower.level}|${selectedTower.range}|${selectedTower.ownerId}|${selectedTower.status}|${selectedTower.hp}|${selectedTower.maxHp}|${selectedTower.ammo}|${selectedTower.energy}|${selectedTower.temperature}|${selectedTower.performance}|${selectedTower.misfortune}|${selectedTower.luckyWindowRemainingMs}|${selectedTower.lastLuckMultiplier}|${selectedTower.damageDealt}|${selectedTower.currentDps}|${selectedTower.linkedTowerIds?.join(",")}|${selectedTower.melisUnderworldMode ?? ""}|${selectedTower.melisUnderworldPullCount ?? 0}|${this.localPlayerSnapshot?.approval ?? 0}:${this.localPlayerSnapshot?.stress ?? 0}|${selectedTower.productionAmmo}|${JSON.stringify(selectedTower.ammoStock)}|${JSON.stringify(selectedTower.materials)}|${selectedTower.ammoLogisticsEnabled}|${selectedTower.gate === true}|${this.localPlayerSnapshot?.experience ?? 0}|${this.localPlayerSnapshot?.gold ?? 0}`
      : `new|${this.selectedTowerDefinition.id}|${this.abartiOrientation}`;
    if (this.lastSelectionKey === selectionKey) {
      this.updateAbartiOrientationButton();
      this.emitControlState();
      return;
    }
    this.lastSelectionKey = selectionKey;
    this.game.events.emit("tower:selected", selectedTower?.id);

    if (!selectedTower) {
      // Secili kule yokken bildirim yok: kurulacak kulenin adi ve bedeli
      // Kuleler cekmecesinde zaten yaziyor, her secim degisiminde toast
      // cikarmak ayni bilgiyi gurultuye cevirirdi.
      // Ayni kule yeniden secilince okuma tekrar ciksin diye sifirlaniyor.
      this.lastSelectionNoticeKey = "";
      this.emitControlState();
      return;
    }

    // Kulenin adi, seviyesi, menzili, cani ve kaynaklari artik kule panelinde;
    // ayni bilgiyi bir de bildirim olarak yazmak paneli tekrarliyordu. Kalan
    // tek bildirim, panelde olmayan bir eylem ipucu: Sunucu baglantisi ve
    // Sentez dizilimi. Yalnizca secim, seviye ya da sahip degisince cikiyor.
    const linkHint = selectedTower.definitionId === "warrior-2"
      ? t("scene.link.hint", { n: selectedTower.linkedTowerIds?.length ?? 0 })
      : selectedTower.definitionId === "zeynep-3"
        ? t("scene.synthesis.hint")
        : "";
    const noticeKey = `${selectedTower.id}|${selectedTower.level}|${selectedTower.ownerId}`;
    if (noticeKey !== this.lastSelectionNoticeKey) {
      this.lastSelectionNoticeKey = noticeKey;
      if (linkHint) this.showNotice(linkHint);
    }
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

  /**
   * Kule paneli acikken sunucudan blogu tazeler.
   *
   * Tek bir dongu: kule secili degilse hicbir sey gitmiyor. Phaser saati
   * oldugu icin sekme arka plandayken o da duruyor. Secim degisimi
   * (`syncTowerStatsRequest`) donguyu beklemeden ayrica istiyor.
   */
  private startTowerStatsLoop() {
    this.towerStatsTimer?.remove(false);
    this.towerStatsTimer = this.time.addEvent({
      delay: TOWER_STATS_REFRESH_MS,
      loop: true,
      callback: () => {
        // Panel baska bir cekmecenin arkasindaysa okuyan yok; yoklama duruyor.
        if (this.selectedPlacedTowerId && this.towerSheetReport.visible) this.requestTowerStats(this.selectedPlacedTowerId);
      }
    });
  }

  /**
   * Arayuz panelin gorunurlugunu ve tavan boyunu bildirdi. Panel yeniden
   * gorunur olduysa blok beklemeden isteniyor; boy degistiyse yer yeniden
   * seciliyor (genisletilen panel kuleyi kapatmasin).
   */
  private applyTowerSheetReport(report: TowerSheetReport) {
    if (!report || !Number.isFinite(report.heightRatio)) return;
    const becameVisible = report.visible && !this.towerSheetReport.visible;
    const resized = Math.abs(report.heightRatio - this.towerSheetReport.heightRatio) >= 0.01 || report.expanded !== this.towerSheetReport.expanded;
    this.towerSheetReport = { ...report, heightRatio: report.heightRatio > 0 ? report.heightRatio : this.towerSheetReport.heightRatio };
    if (becameVisible && this.selectedPlacedTowerId) this.requestTowerStats(this.selectedPlacedTowerId);
    if (resized && report.visible && this.selectedPlacedTowerId) this.emitControlState();
  }

  /**
   * Kule panelinin ekrandaki yeri degisti (acildi, kapandi, genisledi, kenar
   * degistirdi): harita panelini sonraki anlik goruntuyu beklemeden yerlestir.
   */
  private applyTowerSheetRect(rect: TowerSheetRect) {
    if (!rect || ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return;
    this.towerSheetRect = rect;
    const tower = this.selectedPlacedTowerId ? this.towerSnapshots.get(this.selectedPlacedTowerId) : undefined;
    if (tower && this.selectedResourceGraphics?.visible) {
      this.drawSelectedTowerResources(tower, this.getMapCellSize() * getTowerGridSpan(tower.definitionId));
    }
  }

  private requestTowerStats(towerId: string) {
    this.towerStatsSequence = (this.towerStatsSequence + 1) % 1_000_000_000;
    this.room?.send("tower:stats", { towerId, q: this.towerStatsSequence });
  }

  /**
   * Secili kule, seviyesi, kartlari ya da esyalari degistiyse blogu hemen
   * ister; baska kuleye gecildiyse eski blogu atar ki panel bir an onceki
   * kulenin sayilarini gostermesin.
   */
  private syncTowerStatsRequest(tower: TowerSnapshot | undefined) {
    const key = tower
      ? `${tower.id}|${tower.level}|${(tower.targetedCardIds ?? []).join(",")}|${(tower.equippedShopItemIds ?? []).join(",")}|${tower.targetingMode ?? ""}`
      : "";
    if (key === this.towerStatsRequestKey) return;
    this.towerStatsRequestKey = key;
    if (this.towerStatsBlock && this.towerStatsBlock.id !== tower?.id) this.towerStatsBlock = undefined;
    if (tower) this.requestTowerStats(tower.id);
  }

  private receiveTowerStats(block: TowerStatsWire) {
    if (!block || typeof block.id !== "string" || block.id !== this.selectedPlacedTowerId) return;
    // Yolda bekleyen eski bir cevap yenisinin ustune yazmasin.
    const previous = this.towerStatsBlock;
    if (previous?.id === block.id && previous.q !== undefined && block.q !== undefined && block.q < previous.q
      && previous.q - block.q < 500_000_000) return;
    this.towerStatsBlock = block;
    this.emitControlState();
  }

  /**
   * Panel kuleyi ve savundugu hatti kapatmasin.
   *
   * Esik sabit degil: arayuzun bildirdigi panel tavanindan (dar ya da genis)
   * ve ust/alt seritlerin olculen boyundan. Alta yaslanan panel tuvalin
   * `1 - alt - panel` cizgisinin altini, uste yaslanan `ust + panel`
   * cizgisinin ustunu kapliyor; kule hangisinin disinda kaliyorsa oraya. Iki
   * taraf da kapatiyorsa (genis panel) kuleden daha uzak kenara: genisken
   * kuleyi ortmek kabul, ama mumkunse degil. Mevcut taraf hala aciksa
   * degismiyor; kamera yakinlasirken panel gidip gelmesin.
   */
  private getTowerSheetDock(tower: TowerSnapshot): "top" | "bottom" {
    const view = this.cameras.main?.worldView;
    if (!view || view.height <= 0) return this.towerSheetDock;
    // Kulenin tamami: can cubugu, govde, haritadaki kaynak paneli ve satis tusu.
    const discSize = this.getMapCellSize() * getTowerGridSpan(tower.definitionId);
    const footprint = this.getSelectedResourceLayout(tower, discSize, { ignoreSheet: true });
    const top = (footprint.top - view.y) / view.height;
    const bottom = (footprint.bottom - view.y) / view.height;
    const sheet = this.towerSheetReport.heightRatio;
    const margin = 0.01;
    const bottomEdge = 1 - this.arenaChrome.bottomRatio - sheet - 0.01;
    const topEdge = this.arenaChrome.topRatio + sheet + 0.01;
    const clearBottom = bottom < bottomEdge - margin;
    const clearTop = top > topEdge + margin;
    if (this.towerSheetDock === "bottom" ? clearBottom : clearTop) return this.towerSheetDock;
    if (clearBottom) this.towerSheetDock = "bottom";
    else if (clearTop) this.towerSheetDock = "top";
    // Iki taraf da bir kismini ortuyor: daha azini ortene.
    else this.towerSheetDock = bottom - bottomEdge <= topEdge - top ? "bottom" : "top";
    return this.towerSheetDock;
  }

  /**
   * Kule panelinin girdisi. Sunucunun blogu ve anlik goruntunun canli
   * sayilari; metin notlari burada, ait olduklari bolume etiketli. Eskiden
   * hepsi tek satirlik `selectedStats` metniydi.
   */
  /**
   * Sunucu'nun bilgi satirlari: tur basina oldurme ve bagli kulelere verdigi
   * artis ("Koşucu bilgisi 12 · yavaşlatma +%7"). Bilgi yoksa nasil
   * toplandigini soyleyen tek satir.
   */
  private getServerKnowledgeLines(tower: TowerSnapshot) {
    const lines: string[] = [];
    for (const type of SERVER_KNOWLEDGE_TYPES) {
      const kills = tower.serverKnowledge?.[type] ?? 0;
      if (kills <= 0) continue;
      lines.push(t("scene.sheet.knowledge", {
        type: t(`menu.enemy.type.${type}`),
        n: kills,
        effect: t(`scene.sheet.knowledge.${SERVER_KNOWLEDGE_EFFECTS[type]}`),
        v: t("format.percent", { v: Math.round(getServerKnowledgeBonus(kills, tower.level) * 100) })
      }));
    }
    return lines.length > 0 ? lines : [t("scene.sheet.knowledgeEmpty")];
  }

  /** Kuleyi bir Sunucu bagliyor mu (anlik goruntudeki baglar). */
  private isServerLinkedTower(towerId: string) {
    for (const candidate of this.towerSnapshots.values()) {
      if (candidate.definitionId === "warrior-2" && candidate.linkedTowerIds?.includes(towerId)) return true;
    }
    return false;
  }

  private buildTowerSheetInput(
    tower: TowerSnapshot,
    definition: TowerDefinition | undefined,
    context: { towerOperations: boolean; melisZoneEffect?: string; melisZoneLabel: string; upgradeXp: number; upgradeGold: number; refund?: { amount: number; undoable: boolean } }
  ): TowerSheetInput {
    const notes: TowerSheetNote[] = [];
    const ownsTower = tower.ownerId === this.localSessionId;
    if (tower.definitionId === "warrior-5") notes.push({ section: "effects", text: formatDebugLaserOverdriveLine(tower.level) });
    // Etki metni paylasilan modulden (getMelisZoneEffectText), Turkce kaliyor.
    if (context.melisZoneEffect) notes.push({ section: "effects", text: t("scene.sheet.mood", { zone: context.melisZoneLabel, effect: context.melisZoneEffect }) });
    if (tower.definitionId === "archer-4") {
      notes.push({ section: "effects", text: t("scene.sheet.underworld", { souls: tower.melisUnderworldPullCount ?? 0, mode: (tower.melisUnderworldMode ?? "approval") === "approval" ? t("scene.resource.approval") : t("scene.resource.stress") }) });
    }
    if (tower.characterId === "onur") {
      notes.push({ section: "attack", text: t("scene.sheet.misfortune", {
        v: t("format.percent", { v: Math.round(tower.misfortune ?? 0) }),
        // toFixed + ayirac: Intl esitlikte farkli yuvarliyor (1,005 -> "1,01"), eski "1,00" kalsin.
        roll: getLocale() === "tr" ? (tower.lastLuckMultiplier ?? 1).toFixed(2).replace(".", ",") : (tower.lastLuckMultiplier ?? 1).toFixed(2)
      }) });
    }
    if (context.towerOperations && tower.definitionId !== "warrior-2") notes.push({ section: "resources", text: this.getHeatBrakeLine(tower, definition) });
    if (context.towerOperations && tower.energyState && tower.energyState !== "powered") notes.push({ section: "status", text: t("scene.sheet.noEnergy") });
    if (tower.definitionId === WALL_TOWER_ID) notes.push({ section: "status", text: tower.gate ? t("scene.sheet.gateOpen") : t("scene.sheet.gateClosed") });
    if (tower.definitionId === "warrior-2") {
      notes.push({ section: "effects", text: t("scene.sheet.linked", { n: tower.linkedTowerIds?.length ?? 0 }) });
      for (const text of this.getServerKnowledgeLines(tower)) notes.push({ section: "effects", text });
    } else if (this.isServerLinkedTower(tower.id)) {
      notes.push({ section: "effects", text: t("scene.sheet.serverLinked") });
    }
    const owner = ownsTower ? undefined : this.playerSnapshots.find((player) => player.id === tower.ownerId)?.name ?? tower.ownerName;
    return {
      towerId: tower.id,
      definitionId: tower.definitionId,
      characterId: tower.characterId,
      name: getTowerDisplayName(tower.definitionId, tower.name),
      level: tower.level,
      color: `#${(definition?.color ?? tower.color ?? 0x60a5fa).toString(16).padStart(6, "0")}`,
      ownerName: owner,
      readOnly: !ownsTower,
      dock: this.getTowerSheetDock(tower),
      stats: this.towerStatsBlock?.id === tower.id ? this.towerStatsBlock : undefined,
      live: {
        hp: tower.hp,
        maxHp: tower.maxHp,
        armor: tower.armor,
        temperature: tower.temperature,
        ammo: tower.ammo,
        maxAmmo: tower.maxAmmo,
        productionAmmo: tower.productionAmmo,
        materials: tower.materials,
        ammoStock: tower.ammoStock,
        repairParts: tower.repairParts,
        rawAmmo: tower.rawAmmo,
        maxRawAmmo: tower.maxRawAmmo,
        energy: tower.energy,
        maxEnergy: tower.maxEnergy,
        shotFuel: tower.shotFuel,
        resourceProvider: tower.resourceProvider,
        performance: context.towerOperations ? tower.performance ?? 0.5 : undefined,
        damageDealt: tower.damageDealt,
        currentDps: tower.currentDps,
        status: tower.status,
        insight: tower.insight
      },
      notes,
      progress: {
        maxed: tower.level >= getTowerMaxLevel(definition ?? { resourceProvider: tower.resourceProvider }),
        upgradeXp: context.upgradeXp,
        upgradeGold: context.upgradeGold,
        poolXp: this.localPlayerSnapshot?.experience ?? 0,
        poolGold: this.localPlayerSnapshot?.gold ?? 0,
        refund: ownsTower ? context.refund : undefined
      }
    };
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

  private updatePing(message: { sentAt?: number; serverProcessingMs?: number; bufferedAmount?: number }) {
    if (typeof message.sentAt !== "number") {
      return;
    }

    const ping = Math.max(0, Math.round(performance.now() - message.sentAt));
    runTelemetry.notePing(ping);
    this.matchDebug?.notePing(ping, (message.bufferedAmount ?? 0) / 1024);
    this.pingSamples.push(ping);
    this.pingSamples = this.pingSamples.slice(-5);
    const averagePing = Math.round(this.pingSamples.reduce((total, sample) => total + sample, 0) / this.pingSamples.length);
    const jitter = Math.max(...this.pingSamples) - Math.min(...this.pingSamples);
    // Rozet basamak kazandikca genisleyemez.
    //
    // Ping saniyede bir degisiyor ve seritteki rozet onunla birlikte buyuyup
    // kuculuyordu. Serit sardigi icin birkac piksel sarma noktasini kaydirmaya
    // yetiyor; cubuk bir satir uzuyor, kamera da haritayi cubugun altina
    // sigdirdigi icin harita gozle gorulur bicimde yeniden olcekleniyordu.
    // Sayilar bu yuzden bir tavanda duruyor: tavani asan deger gizlenmiyor,
    // yalnizca "+" ile bildiriliyor ve metnin uzunlugu sabit kaliyor.
    const queueKb = Math.ceil((message.bufferedAmount ?? 0) / 1024);
    this.emitHudState({
      ping: `${averagePing > 999 ? "999+" : averagePing} ms ±${jitter > 99 ? "99+" : jitter}`,
      pingTone: averagePing < 90 && jitter < 35 ? "good" : averagePing < 180 && jitter < 80 ? "warn" : "bad",
      // Kuyruk nadir ama uzun; metinden cikip ipucunda duruyor.
      pingDetail: queueKb > 0 ? t("scene.ping.detailQueue", { ping: averagePing, jitter, queue: queueKb }) : t("scene.ping.detail", { ping: averagePing, jitter })
    });
  }

  /**
   * Mac kaydedicisinin istemci ornegi: bes saniyede bir, ayni oda
   * baglantisindan (`debug:client`). Izin anonim veri ayarindan
   * (`isTelemetryActive`): kapaliysa hicbir sey toplanmiyor ve gitmiyor.
   */
  private createMatchDebugSampler(room: Room) {
    const game = this.game;
    return new MatchDebugSampler({
      now: () => performance.now(),
      isEnabled: () => isTelemetryActive(),
      send: (sample) => {
        if (this.room === room) room.send("debug:client", sample);
      },
      device: () => {
        const nav = navigator as Navigator & { deviceMemory?: number };
        const userAgent = nav.userAgent ?? "";
        const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
        const shortSide = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight);
        return {
          dpr: Math.round((window.devicePixelRatio ?? 1) * 100) / 100,
          cw: game.canvas?.width,
          ch: game.canvas?.height,
          cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
          memGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
          device: coarse ? (shortSide >= 600 ? "tablet" : "mobile") : "desktop",
          browser: browserFamily(userAgent),
          os: osFamily(userAgent, nav.maxTouchPoints ?? 0),
          renderer: game.renderer?.type === Phaser.WEBGL ? "webgl" : "canvas"
        };
      },
      heap: () => {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        return memory ? { usedMb: memory.usedJSHeapSize / 1048576, limitMb: memory.jsHeapSizeLimit / 1048576 } : undefined;
      }
    });
  }

  private recordClientPerf(snapshot: GameSnapshot, renderMs: number) {
    snapshot.perf = this.latestServerPerf;
    this.latestPerfSnapshot = snapshot;
    // Bayrak sunucudan geliyor; istemcinin istegi tek basina yetmiyor ki
    // reddedilen bir istek panelin acik gorunmesine yol acmasin.
    if (Boolean(snapshot.creative) !== this.creativeMode) {
      this.creativeMode = Boolean(snapshot.creative);
      if (this.creativeMode) this.room?.send("creative:sync", {});
      this.emitControlState();
    }
    // Ogretici bayragi da sunucudan: adim motoru kontrol durumundan okuyor.
    if (Boolean(snapshot.tutorial) !== this.tutorialMode) {
      this.tutorialMode = Boolean(snapshot.tutorial);
      this.emitControlState();
      this.emitHudState({ tutorial: this.tutorialMode });
    }
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
    this.matchDebug?.noteSection(section, ms);
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
    if (!this.perfPopupOpen) {
      return;
    }
    this.emitHudState({ perfText: this.getPerfPopupText() });
  }

  /**
   * Haritanin girdisi: tek yol, dogrudan tuvalden.
   *
   * Burasi bir donem **iki** yoldu. Phaser'in kendi giris sistemi asildi ve
   * yaninda, o sussa devreye giren bir yedek duruyordu; hangisinin gecerli
   * oldugu her dokunusta yeniden kararlastiriliyordu. Iki yolun yarismasi
   * kendi basina bir hata kaynagiydi: bir jestin basmasi bir yoldan, birakmasi
   * otekinden gelebiliyor ve arada kalan durum takiliyordu.
   *
   * Daha onemlisi, Phaser dunya koordinatini kendi onbellekledigi tuval
   * olcusunden turetiyor. iOS'ta arac cubugu acilip kapandiginda o olcu
   * eskiyor ve olay **ulassa bile** yanlis dunya noktasina dusuyor -- dokunus
   * arenanin disinda sayilip sessizce dusuruluyor. Disaridan gorunen sey
   * "dokunmatik kendiliginden gitti".
   *
   * Simdi tek yol var ve koordinat her dokunusta tuvalin **o anki** kutusundan
   * hesaplaniyor; eskiyecek bir onbellek yok. Isaretci yakalamasi da jestin
   * parmagi tuvalden ciksa bile ayni yoldan bitmesini garantiliyor.
   */
  private installMapPointerInput() {
    const canvas = this.game.canvas;

    canvas.addEventListener("pointerdown", (event) => {
      this.canvasGestureCount += 1;
      // Parmagi yakala: jest tuvalin disina tasarsa bile hareket ve birakma
      // buraya gelir. Yakalanmazsa panele kayan bir parmagin birakmasi hic
      // gelmiyor ve yarim kalan surukleme kaliciyor.
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Desteklenmiyorsa jest yine calisir, yalnizca tuvalin disina tasamaz.
      }
      this.unlockGameAudio();
      const pointer = this.createBridgePointer(event);
      if (pointer) {
        this.handleMapPointerDown(pointer);
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      const pointer = this.createBridgePointer(event);
      if (pointer) {
        this.handleMapPointerMove(pointer);
      }
    });

    canvas.addEventListener("pointerup", (event) => {
      // Dokunmatik pointerdown kullanici etkinlestirmesi sayilmiyor; iOS
      // baglami ancak birakmada surduruyor. Arka plandan donuste de burada.
      this.feedback?.unlockAudio();
      const pointer = this.createBridgePointer(event);
      if (pointer) {
        this.handleMapPointer(pointer);
      }
    });

    // iOS bir dokunusu kendi jestine devralabiliyor; o durumda birakma olayi
    // hic gelmiyor. Yakalamanin kaybi da ayni anlama geliyor. Ikisi de yarim
    // kalan suruklemeyi kapatmali, yoksa harita kalici olarak kilitleniyor.
    // Beceri jesti parmak bazinda kapaniyor: yakalama kaybi her birakistan
    // sonra da geliyor ve yalnizca o parmagin jestini kapatmali.
    const abandon = (event: PointerEvent) => {
      this.dropMapSkillGesturePointer(event.pointerId);
      this.abandonMapGesture();
    };
    canvas.addEventListener("pointercancel", abandon);
    canvas.addEventListener("lostpointercapture", abandon);
    // Farede sag tusla surukleme 3. beceri: tarayicinin menusu acilmasin.
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  /**
   * Birakilmadan dusen bir dokunusu geri alir.
   *
   * Surukleme bayragi yalnizca birakma olayinda iniyor. O olay gelmezse harita
   * kalici olarak "yonlendirme surukleniyor" durumunda kaliyor ve sonraki
   * dokunuslar kule secmek yerine beceri gonderiyor.
   */
  private abandonMapGesture() {
    // Metal Kalkan jesti de ayni yoldan kapaniyor: birakma gelmeyecek.
    this.cancelShieldGesture();
    this.cancelWallHandleDrag();
    if (!this.isGuidanceDragging) {
      return;
    }
    this.isGuidanceDragging = false;
    this.clearGuidancePreview();
  }

  /**
   * Tuvalin ekrandaki kutusu.
   *
   * Kutu her dokunusta yeniden okunuyor: onbelleklenmis bir olcu iOS'ta arac
   * cubugu acilip kapandiginda eskiyor ve dokunus dogru geldigi halde yanlis
   * dunya noktasina dusuyor.
   *
   * Ama okuma bazen **0x0** donuyor -- sayfa arka plandayken, gorunurluk
   * degisiminin ortasinda, ya da yerlesim henuz oturmamisken. Eski kod bu
   * durumda koordinati sifira dusuruyordu: dokunus kayboluyordu ki bu gorunmez
   * bir ariza. Ekranin sol ust kosesi arenanin disinda oldugu icin her dokunus
   * "arena disi" sayilip sessizce dusuyor -- disaridan tam olarak "dokunmatik
   * kendiliginden gitti".
   *
   * Bu yuzden son saglam olcu saklaniyor. Bozuk bir olcu geldiginde onu
   * kullaniyor ve olcegi tazelemesi icin Phaser'a haber veriyoruz; boylece
   * dokunus kaybolmak yerine bir onceki dogru cerceveye gore cozuluyor.
   */
  private getCanvasRect() {
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.lastUsableCanvasRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      return this.lastUsableCanvasRect;
    }

    this.degenerateCanvasRectCount += 1;
    // Olcu bir daha kendiliginden duzelmeyebilir; Phaser'a yeniden olcmesini soyle.
    this.scale.refresh();
    return this.lastUsableCanvasRect;
  }

  /**
   * DOM olayindan sahne isaretcisi.
   *
   * Ham olay da tasiniyor: tani gunlugu ekran koordinatini ve o noktadaki
   * elemani ondan okuyor.
   */
  private createBridgePointer(event: PointerEvent) {
    const canvas = this.game.canvas;
    const rect = this.getCanvasRect();
    if (!rect) {
      // Tuvalin nerede oldugunu bilmiyoruz. Uydurulmus bir nokta dokunusu
      // haritanin baska bir yerine goturur; hicbir sey yapmamak dogrusu.
      return undefined;
    }
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const world = this.cameras.main.getWorldPoint(x, y);
    return { x, y, worldX: world.x, worldY: world.y, id: event.pointerId, domEvent: event } as unknown as Phaser.Input.Pointer;
  }

  /**
   * Girisin hangi yoldan geldigi.
   *
   * iOS'ta Phaser sahneye tek bir isaretci olayi tasimiyor; oyun oradaki
   * dokunuslari yedek yoldan aliyor. Hangi yolun calistigini gormek, bir daha
   * "dokunma calismiyor" denildiginde aramayi tek satira indiriyor.
   */
  /**
   * Olcek uyusmazligini gosteren satir.
   *
   * Harita ile kaplamalar arasinda ust/alt bant kaliyorsa sebep tek bir sey
   * olabilir: Phaser'in FIT olcegi tuvali `#game` kutusuna sigdirirken oyunun
   * orani o kutunun oraniyla tutmuyordur. Iki orani yan yana yazmak, hangi
   * cihazda ne kadar ayristiklarini uzaktan gormenin tek yolu -- Android'de
   * bunun oldugu bildirildi ama burada uretilemiyor.
   */
  private getScaleDiagnosticLine() {
    const host = document.getElementById("game")?.getBoundingClientRect();
    const oyun = this.scale.gameSize;
    const kutuOrani = host && host.height > 0 ? host.width / host.height : 0;
    const oyunOrani = oyun.height > 0 ? oyun.width / oyun.height : 0;
    const sapma = kutuOrani > 0 ? Math.abs(oyunOrani - kutuOrani) / kutuOrani : 0;
    const vv = window.visualViewport;
    return `Olcek           kutu ${Math.round(host?.width ?? 0)}x${Math.round(host?.height ?? 0)} (${kutuOrani.toFixed(4)})`
      + ` · oyun ${Math.round(oyun.width)}x${Math.round(oyun.height)} (${oyunOrani.toFixed(4)})`
      + ` · sapma %${(sapma * 100).toFixed(2)}${sapma > 0.005 ? " BANT VAR" : ""}`
      + ` · dpr ${(window.devicePixelRatio || 1).toFixed(2)} rs ${getSceneRenderScale(this).toFixed(2)}`
      + ` · vv ${Math.round(vv?.width ?? 0)}x${Math.round(vv?.height ?? 0)}@${(vv?.scale ?? 1).toFixed(2)}`
      + ` · inner ${window.innerWidth}x${window.innerHeight}`;
  }

  private getInputPathLine() {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const bounds = getMapWorldBounds(this.selectedMapData);
    const durum = [
      `dokunus ${this.canvasGestureCount}`,
      `yarim ${this.strandedTowerDragCount}`,
      this.draggedTowerDefinition ? `SURUKLEME ACIK (${this.draggedTowerDefinition.id})` : undefined,
      this.isGuidanceDragging ? "YONLENDIRME ACIK" : undefined
    ].filter(Boolean).join(", ");

    const satirlar = [
      `Giris           ${durum}`,
      `Tuval           ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)} · ic ${canvas.width}x${canvas.height}`
        + (this.degenerateCanvasRectCount > 0 ? ` · BOZUK OLCUM ${this.degenerateCanvasRectCount}` : ""),
      `Arena           ${Math.round(bounds.left)},${Math.round(bounds.top)} - ${Math.round(bounds.right)},${Math.round(bounds.bottom)} · zoom ${this.cameras.main.zoom.toFixed(2)}`,
      this.getScaleDiagnosticLine()
    ];

    if (this.tapLog.length === 0) {
      satirlar.push("Dokunuslar      henuz yok");
      return satirlar.join("\n");
    }

    satirlar.push(`Dokunuslar (son ${TAP_LOG_SIZE})`);
    for (const tap of this.tapLog) {
      satirlar.push(
        `  ${(tap.atMs / 1000).toFixed(1)}s ekran ${tap.clientX},${tap.clientY}`
          + ` -> dunya ${tap.worldX},${tap.worldY}`
          + ` ${tap.arenaIcinde ? "ic" : "DIS"} · ${tap.ustEleman} · ${tap.sonuc}`
      );
    }
    return satirlar.join("\n");
  }

  private getFeedbackBudgetLine() {
    const usage = this.feedback?.getBudgetUsage();
    if (!usage) {
      return "Feedback        --";
    }
    const motion = usage.reducedMotion ? " / az hareket" : "";
    return `Feedback        num ${usage.numbers}/${usage.limits.numbers} | lbl ${usage.labels}/${usage.limits.labels} | sfx ${usage.voices}/${usage.limits.sounds}${motion}`;
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
      `Buffer          q${this.snapshotBuffer.length} / alpha ${this.lastPlaybackAlpha.toFixed(2)} / drop ${this.droppedSnapshotCount}`,
      // Odul geri bildiriminin butce dolulugu: telefonda sinirin tuttugu
      // buradan okunuyor (sayi 12, etiket 3, ses 6).
      this.getFeedbackBudgetLine()
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

    // Teshis blogu basta: panel uzun ve telefonda kaydirmak zor, en cok
    // ihtiyac duyulan satirlar once gelmeli.
    return [
      this.getInputPathLine(),
      "",
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

  /**
   * Hatanin cubuga sigan hali.
   *
   * Metin birincil satirda, altin ve can ile ayni yerde duruyor; kendine satir
   * acamaz. Uzun bir hata orada ya tasar ya da butonlari iter, o yuzden
   * kirpiliyor. Tamami zaten konsolda ve "i" kutusunda duruyor.
   */
  private formatConnectionError(error: unknown) {
    // Bilinen oda redleri ("Oda dolu.") secili dilde; obur hatalar oldugu gibi.
    const message = describeServerError(error);
    // "Hata:" gibi bir on ek yer yiyor ve hicbir sey soylemiyor -- yazi zaten
    // yalnizca bir sey ters gittiginde cikiyor. Butonlarin yaninda kalan en dar
    // alan 22 harf kadar; sinir oradan.
    return message.length > 22 ? `${message.slice(0, 21)}…` : message;
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
  return { cost: 10, label: authorityChain >= 2 ? t("scene.skill.zeynepPickChain") : t("scene.skill.zeynepPick") };
}

/**
 * Operator muzigi yok: eski iki parca lisanssiz ticari kayitti ve kaldirildi
 * (bkz. CREDITS.md). Dalga muzigi ayri (`wave-music.ts`, WebAudio). Lobi muzigi ("Last Stand") yalnizca menude calar ve mac
 * baslarken susar (menu-music.ts); maca bilerek tasinmiyor. Mac icin parca
 * gelince operatore gore yol burada dondurulur; bos yol "muzik yok" demek.
 */
function getBackgroundMusicPath(_characterId: CharacterId): string {
  return "";
}

// Dusmanin ekrandaki boyu, bombacinin gorsel olcegi ve dokusunun anahtari
// paylasilan pakette (`enemy-display`): isabet govdesi ayni sayilardan.

/** Kimligi bilinmeyen carpmanin itecegi dusmanin aranacagi yaricap (harita olcegi 1'de): en buyuk govdenin erisimi. */
const KNOCK_SEARCH_RADIUS = 32;

/** Ayni tikin mesajlari ayni soket kumesinde: temas ile kaldirma bu kadar ms icinde geliyorsa ayni tik. */
const SAME_TICK_MESSAGE_MS = 8;

function getKillStreakRuleByTier(tier: KillStreakTier) {
  return KILL_STREAK_RULES.find((rule) => rule.tier === tier);
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
      notBad: [0x93c5fd, 0xc4b5fd, 0xe2e8f0, 0x111827, "COMMAND NOTED"],
      good: [0x7dd3fc, 0xd8b4fe, 0xfde68a, 0x150a2a, "COMMAND ACCEPTED"],
      granted: [0x7dd3fc, 0xf0abfc, 0xfacc15, 0x160a2d, "COMMAND GRANTED"],
      unstoppable: [0x38bdf8, 0xe879f9, 0xfde047, 0x14052c, "TEMPO CONTROL / RANGE UP"],
      rampage: [0x22d3ee, 0xffffff, 0xf0abfc, 0x10031f, "FIELD DIRECTIVE / OVERRIDE"],
      slaughter: [0x06b6d4, 0xfb7185, 0xffffff, 0x0d0219, "FIELD DIRECTIVE / PURGE"],
      legendary: [0xfdf2f8, 0x67e8f9, 0xfacc15, 0x0f0324, "GLOBAL COMMAND / EXECUTE"],
      madeForThis: [0xffffff, 0x22d3ee, 0xfacc15, 0x07021a, "PRIME DIRECTIVE / BUILT FOR THIS"],
      whatAreYou: [0xf5d0fe, 0xef4444, 0xffffff, 0x0a0014, "UNKNOWN COMMAND / NO LIMIT"]
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

function readStoredFlag(key: string, fallback: boolean) {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue === null ? fallback : storedValue === "1";
  } catch {
    return fallback;
  }
}

function writeStoredFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
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

  // 10. seviyede halka tam tur ve beyaz; cizgisi ve halesi yari kalinlikta.
  // Tam beyaz halka zaten en ust seviyeyi soyluyor; kalin hali boyali kulenin
  // kenarini ortuyordu.
  const thickness = normalizedLevel >= 10 ? 0.5 : 1;
  const width = 1.8 + (normalizedLevel - 1) * (2.4 / 9);
  return {
    color: heat[normalizedLevel - 1],
    fill: normalizedLevel / 10,
    width: width * thickness,
    // Hale kademe sinirinda aciliyor (5), bir seviye sonra degil.
    glow: normalizedLevel >= 5,
    glowWidth: (width + 3) * thickness
  };
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

/**
 * Karede cagrilan ayar fonksiyonlari icin degisim kontrolleri.
 *
 * Phaser `setDepth`te her seferinde sahne siralamasini kuyruga sokuyor,
 * `setColor` ve `setFontSize`ta metnin tuvalini yeniden ciziyor. Bu cagrilar
 * dusman dongusunde her karede her dusmanda donuyor; deger ayniysa yazilmiyor.
 */
function setDepthIfChanged(target: { depth: number; setDepth(value: number): unknown }, depth: number) {
  if (target.depth !== depth) target.setDepth(depth);
}

function setTextColorIfChanged(text: Phaser.GameObjects.Text, color: string) {
  if (text.style.color !== color) text.setColor(color);
}

function setFontSizeIfChanged(text: Phaser.GameObjects.Text, px: number) {
  const size = `${px}px`;
  if (text.style.fontSize !== size) text.setFontSize(px);
}

/** Testere bicaginin cokgenleri: karede yeniden yazilan sabit diziler. */
const BLADE_SHADOW = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));
const BLADE_BODY = Array.from({ length: 5 }, () => ({ x: 0, y: 0 }));
const BLADE_EDGE = Array.from({ length: 5 }, () => ({ x: 0, y: 0 }));
function setBladePoint(list: Array<{ x: number; y: number }>, index: number, x: number, y: number, forwardX: number, forwardY: number, distance: number, side: number) {
  list[index].x = x + forwardX * distance - forwardY * side;
  list[index].y = y + forwardY * distance + forwardX * side;
}
const ORBIT_DEFINITIONS = new Map<string, TowerDefinition | undefined>();
function getOrbitDefinition(definitionId: string) {
  if (!ORBIT_DEFINITIONS.has(definitionId)) {
    ORBIT_DEFINITIONS.set(definitionId, towerCatalog.onur.find((candidate) => candidate.id === definitionId));
  }
  return ORBIT_DEFINITIONS.get(definitionId);
}

/** Isin kimligindeki kule kimligi (`melis-curse-t12`, `showcase-t4-91`, ikiz lazer `beam-t3-b`). */
const BEAM_TOWER_ID_PATTERN = /(?:^|-)(t\d+)(?=-|$)/;

/**
 * Debug Lazer panelinde overdrive satiri: seviyeye gore ne acik, yukseltme ne
 * getirecek. Overdrive 5. seviyede aciliyor, 10. seviyede sola ve saga supuren iki isin.
 */
function formatDebugLaserOverdriveLine(level: number) {
  if (level < DEBUG_LASER_OVERDRIVE_UNLOCK_LEVEL) {
    return t("scene.overdrive.locked", { unlock: DEBUG_LASER_OVERDRIVE_UNLOCK_LEVEL, twin: DEBUG_LASER_TWIN_OVERDRIVE_LEVEL });
  }
  if (level < DEBUG_LASER_TWIN_OVERDRIVE_LEVEL) {
    return t("scene.overdrive.chain", { twin: DEBUG_LASER_TWIN_OVERDRIVE_LEVEL });
  }
  return t("scene.overdrive.full");
}

/** Kenara yerlesen yapilar (Abarti, duvar), butun karakterlerin kataloglarindan. */
const EDGE_PLACED_DEFINITION_IDS: ReadonlySet<string> = new Set(
  Object.values(towerCatalog).flat().filter((tower) => tower.engine?.placement?.requiresEdge).map((tower) => tower.id)
);
