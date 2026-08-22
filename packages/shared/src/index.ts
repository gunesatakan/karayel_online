import type { EditableMapData, MapScale } from "./map.js";
import type { EnemyRace, HitType, MovementKind } from "./combat.js";

export type CharacterId = "zeynep" | "warrior" | "archer" | "mage" | "healer" | "tank" | "onur";
export type UpgradeId = "damage" | "fireRate" | "projectileSpeed" | "heal";
export type EnemyType = "grunt" | "brute" | "runner" | "shooter" | "siege";
export type ProjectileKind = "arrow" | "bolt" | "orb" | "light" | "chain" | "enemy" | "tower";
export type { DamageType, EnemyRace, HitType, MovementKind, StatusEffectId } from "./combat.js";
export { SHIELD_DAMAGE_TAKEN_MULTIPLIER, applyStatusResistance, calculateArmorDamageMultiplier, calculateDamageTaken, enemyCombatDefinitions, enemyRaceDefinitions, getEnemyCombatDefinition, getEnemyDamageResistances } from "./combat.js";

export const GAME_WORLD_WIDTH = 390;
export const GAME_WORLD_HEIGHT = 844;
export const BATTLE_TOP = 86;
export const SHOP_TOP = 650;
export const SHOP_HEIGHT = GAME_WORLD_HEIGHT - SHOP_TOP;
export const PATH_WIDTH = 54;
export const TOWER_GRID_SIZE = 34;
export const TOWER_BUILD_TOP = BATTLE_TOP;
export const TOWER_BUILD_BOTTOM = 698;

export const MAP_PATH = [
  { x: 34, y: 104 },
  { x: 326, y: 104 },
  { x: 326, y: 244 },
  { x: 82, y: 244 },
  { x: 82, y: 392 },
  { x: 318, y: 392 },
  { x: 318, y: 540 },
  { x: 72, y: 540 },
  { x: 72, y: 610 },
  { x: 356, y: 610 },
  { x: 356, y: 681 }
] as const;

export type PlayerSnapshot = {
  id: string;
  name: string;
  characterId: CharacterId;
  gold: number;
  goldSpent: number;
  experience: number;
  ownedShopItemIds?: string[];
  /** Alinmis ama henuz bir kuleye takilmamis esyalar. */
  inventoryItemIds?: string[];
  shopOffers?: import("./shop/index.js").ShopItem[];
  shopRerollPrice?: number;
  towersBuilt: number;
  ultimateCharge: number;
  skillCooldowns: number[];
  reputation?: number;
  authorityChain?: number;
  authorityQuality?: number;
  approval?: number;
  stress?: number;
  deadLogisticsWorkers?: Array<{ mode: DroneSnapshot["mode"]; remainingSeconds: number }>;
};

export type LobbyPlayerSnapshot = {
  id: string;
  name: string;
  characterId: CharacterId;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
};

export type LobbyStateSnapshot = {
  roomId: string;
  roomName: string;
  hostId: string;
  mapScale: MapScale;
  started: boolean;
  players: LobbyPlayerSnapshot[];
  maxPlayers: number;
};

export type RoomListingSnapshot = {
  roomId: string;
  roomName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  mapScale: MapScale;
  started: boolean;
};

export type EnemySnapshot = {
  id: string;
  type: EnemyType;
  race: EnemyRace;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  attack: number;
  healthRegenPerSecond: number;
  shield: number;
  maxShield: number;
  movementKind: MovementKind;
  pathDistance: number;
  pathId?: number;
  isTracked?: boolean;
  trackingStacks?: number;
  isFeared?: boolean;
  isArmorBroken?: boolean;
  isDominated?: boolean;
  isWhisperTurned?: boolean;
  curseLoad?: number;
  doubtStacks?: number;
  isHesitating?: boolean;
  isBleeding?: boolean;
  isUnderworldLinked?: boolean;
  isUndead?: boolean;
};

export type StaticEnemySnapshot = Required<Pick<EnemySnapshot,
  "id" | "type" | "race" | "maxHp" | "attack" |
  "healthRegenPerSecond" | "maxShield" | "movementKind"
>> & Pick<EnemySnapshot, "pathId">;
export type DynamicEnemySnapshot = Omit<EnemySnapshot, keyof StaticEnemySnapshot> & { id: string };

export type TowerSnapshot = {
  id: string;
  ownerId: string;
  ownerName: string;
  characterId: CharacterId;
  definitionId: string;
  name: string;
  x: number;
  y: number;
  orientation?: "horizontal" | "vertical";
  /** Radians toward the current target. Only sent for towers that aim. */
  facing?: number;
  level: number;
  range: number;
  minimumRange?: number;
  color: number;
  hp?: number;
  maxHp?: number;
  armor?: number;
  disabled?: boolean;
  ammoType?: import("./characters/common/types.js").AmmoType;
  ammo?: number;
  maxAmmo?: number;
  energy?: number;
  maxEnergy?: number;
  shotFuel?: "ammo" | "energy";
  operatingEnergyPerSecond?: number;
  standby?: boolean;
  wakeRemainingMs?: number;
  energyState?: import("./tower-rules.js").TowerEnergyState;
  resourceProvider?: import("./characters/common/types.js").TowerResourceProvider;
  ammoLogisticsEnabled?: boolean;
  temperature?: number;
  misfortune?: number;
  luckyWindowRemainingMs?: number;
  lastLuckMultiplier?: number;
  bladeAngle?: number;
  bladeLength?: number;
  performance?: number;
  coolingRate?: number;
  rawAmmo?: number;
  maxRawAmmo?: number;
  status?: string;
  damageDealt?: number;
  currentDps?: number;
  melisEvolutionLevel?: number;
  isMelisFavorite?: boolean;
  melisUnderworldMode?: "approval" | "stress";
  melisUnderworldPullCount?: number;
  waveBonusLevel?: number;
  serverLinkWaveAge?: number;
  linkedTowerIds?: string[];
  zeynepFormationSize?: number;
  zeynepFormationLevel?: number;
  targetingMode?: import("./characters/common/types.js").TowerTargetingMode;
  /** Bu kuleye takili magaza esyalari; takilan esya sokulemez. */
  equippedShopItemIds?: string[];
  /**
   * Kulenin acik davranis kilitleri, bit maskesi olarak. Sunucu cozup gonderir;
   * istemci ayni cozumlemeyi tekrar yazarsa iki taraf kacinilmaz olarak ayrisir.
   * Okumak icin `hasUnlockBit` veya `decodeUnlocks`.
   */
  unlockBits?: number;
};

export type StaticTowerSnapshot = Required<Pick<TowerSnapshot,
  "id" | "ownerId" | "ownerName" | "characterId" | "definitionId" |
  "name" | "x" | "y" | "color"
>> & Pick<TowerSnapshot,
  "orientation" | "ammoType" | "shotFuel" | "operatingEnergyPerSecond" |
  "resourceProvider" | "coolingRate"
>;
export type DynamicTowerSnapshot = Omit<TowerSnapshot, keyof StaticTowerSnapshot> & { id: string };

export type StaticSnapshot = {
  enemies: StaticEnemySnapshot[];
  towers: StaticTowerSnapshot[];
};

export type ProjectileSnapshot = {
  id: string;
  kind: ProjectileKind;
  source: "tower" | "enemy";
  definitionId?: string;
  hitType?: HitType;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
};

export type ProjectileSpawnSnapshot = ProjectileSnapshot & { spawnedAt: number };
export type ProjectileHitSnapshot = { id: string; x: number; y: number };

export type DroneSnapshot = {
  id: string;
  mode: "attack" | "repair" | "crystalCollector" | "ammoCollector" | "energyTransport" | "ammoTransport";
  x: number;
  y: number;
  ownerId?: string;
  cargo?: number;
  capacity?: number;
  speed?: number;
  targetTowerId?: string;
};

export type CrystalNodeSnapshot = {
  id: string;
  x: number;
  y: number;
};

export type AmmoNodeSnapshot = {
  id: string;
  x: number;
  y: number;
};

export type BeamSnapshot = {
  id: string;
  definitionId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  scanX?: number;
  scanY?: number;
  width: number;
  color: number;
  overdrive?: boolean;
  ttlMs?: number;
};

export type DamageEventSnapshot = {
  id: string;
  x: number;
  y: number;
  amount: number;
};

export type KillEventSnapshot = {
  id: string;
  ownerId: string;
  enemyId: string;
  serverTime: number;
  streakTier?: "granted" | "unstoppable" | "rampage" | "legendary";
};

export type ZeynepCommandTier = "small" | "medium" | "big";

export type ZeynepCommandEffectSnapshot = {
  tier: ZeynepCommandTier;
  multiplier: number;
  remainingMs: number;
};

export type TeamSnapshot = {
  health: number;
  maxHealth: number;
  gold: number;
  wave: number;
  enemiesLeft: number;
  kills: number;
  energy: number;
  maxEnergy: number;
  ammunition: Record<import("./characters/common/types.js").AmmoType, number>;
  maxAmmunition: Record<import("./characters/common/types.js").AmmoType, number>;
};

export type ServerPerfSnapshot = {
  tickMs: number;
  tickMaxMs: number;
  snapshotBytes: number;
  snapshotHz: number;
  sections: {
    spawnMs: number;
    towersMs: number;
    projectilesMs: number;
    enemiesMs: number;
    cooldownsMs: number;
    ultimatesMs: number;
    snapshotMs: number;
  };
  ops: {
    targetSearches: number;
    targetChecks: number;
    aoeChecks: number;
    chainChecks: number;
    damageEvents: number;
  };
};

export type GameSnapshot = {
  serverTime: number;
  hostId: string;
  map?: EditableMapData;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  towers: TowerSnapshot[];
  projectiles: ProjectileSnapshot[];
  drones: DroneSnapshot[];
  crystalNodes: CrystalNodeSnapshot[];
  ammoNodes: AmmoNodeSnapshot[];
  beams: BeamSnapshot[];
  damageEvents: DamageEventSnapshot[];
  killEvents: KillEventSnapshot[];
  zeynepCommands?: {
    haste?: ZeynepCommandEffectSnapshot;
    range?: ZeynepCommandEffectSnapshot;
    slow?: ZeynepCommandEffectSnapshot;
  };
  melisGothicNightmareActive?: boolean;
  result?: "victory" | "defeat";
  team: TeamSnapshot;
  setupPhase?: boolean;
  setupReadyPlayerIds?: string[];
  perf?: ServerPerfSnapshot;
};

export type WireGameSnapshot = Omit<GameSnapshot, "enemies" | "towers"> & {
  enemies: DynamicEnemySnapshot[];
  towers: DynamicTowerSnapshot[];
};

export {
  CLIENT_PROJECTILE_MAX_LIFETIME_MS,
  getLinearProjectilePosition,
  hydrateWireSnapshot,
  isClientProjectileExpired,
  pruneStaticSnapshotCache,
  SERVER_CLOCK_RESYNC_THRESHOLD_MS,
  SERVER_CLOCK_SMOOTHING,
  SnapshotPlaybackClock
} from "./snapshot/index.js";

export { WALL_EDGE_LENGTH, SHARED_STRUCTURE_IDS, getCharacterTowers, isSharedStructure, WALL_TOWER_ID, getStructureHealthMultiplier, isWallDefinition, wallTower, characters, towerCatalog, attachTowerEngine, deriveTowerResources, getTowerAttackRadius, getTowerModeDamageType, getTowerSlowDurationMs } from "./characters/index.js";
export {
  ONUR_LUCKY_WINDOW_MS,
  ONUR_MISFORTUNE_MAX,
  getOnurMisfortuneContribution,
  resolveOnurGamblerShot
} from "./characters/onur/passive/index.js";
export { SpatialGrid, type SpatialPoint } from "./spatial/index.js";
export type { CharacterDefinition, SkillDefinition, TowerDefinition } from "./characters/index.js";
export type {
  AmmoType,
  TowerAxis,
  TowerResourceProvider,
  TowerEngineConfig,
  TowerTargetingMode,
  TowerAttackShape,
  TowerStatusEffectType,
  TowerStatusEffectDefinition,
  TowerStackDefinition,
  TowerStackTrigger,
  TowerStackStat,
  TowerStackResetReason,
  TowerAuraDefinition,
  TowerAuraStat,
  TowerLevelScalingDefinition,
  TowerTriggerCondition,
  TowerTriggerDefinition,
  TowerTriggerEvent
} from "./characters/common/types.js";
export {
  TOWER_BASE_AMMO_COST,
  TOWER_BASE_ENERGY_COST,
  TOWER_BASE_DAMAGE_MULTIPLIER,
  TOWER_BASE_CRITICAL_CHANCE,
  TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER,
  FUEL_NORMALIZATION_INTERVAL_MS,
  FUEL_NORMALIZATION_EXPONENT,
  PASSIVE_TOWER_INTERVAL_THRESHOLD_MS,
  NON_FIRING_INTERVAL_MS,
  PASSIVE_AURA_TICK_INTERVAL_MS,
  AURA_REFRESH_DURATION_MULTIPLIER,
  ORBIT_BLADE_LENGTH_MAX_MULTIPLIER,
  ORBIT_CONTINUOUS_ENERGY_PER_SECOND,
  ORBIT_CONTINUOUS_HEAT_PER_SECOND,
  ENERGY_OUTAGE_TRACKING_DELAY_MS,
  ENERGY_OUTAGE_AURA_DELAY_MS,
  TOWER_OPERATING_ENERGY_BY_HIT_TYPE,
  getTowerFuelCostMultiplier,
  getTowerShotFuel,
  getTowerOperatingEnergyPerSecond,
  TOWER_HEAT_BY_HIT_TYPE,
  TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER,
  getTowerPerformanceHeatMultiplier,
  getTowerPerformanceEnergyMultiplier,
  getTowerPerformanceFlameIntensity,
  calculateTowerShotHeat,
  getOrbitRotationSpeed,
  getOrbitBladeLength,
  calculateOrbitContinuousCosts,
  calculateTowerShotEnergy,
  calculateTowerAmmoCost,
  calculateTowerShotEnergyCost,
  getTowerShotFuelModifierMultiplier,
  calculateTowerOperatingEnergy,
  isPeriodicTowerAura,
  calculateTowerEnergyPerSecond,
  shouldConsumeTowerOperatingEnergy,
  getTowerEnergyState,
  type TowerEnergyState,
  calculateTowerScaledBaseDamage,
  inferTowerAmmoType
} from "./tower-rules.js";
export {
  STATUS_EFFECTS,
  applyTowerStatusEffect,
  getActiveStatusMagnitude,
  getTowerStatusOutcomes,
  isStatusEffectActive
} from "./statuses/index.js";
export type { ApplyStatusEffectOptions, StatusEffectRuntimeState } from "./statuses/index.js";
export { applyTowerStack, getTowerStackMultiplier, resetTowerStack } from "./stacks/index.js";
export type { ApplyTowerStackOptions, TowerStackRuntimeState } from "./stacks/index.js";
export {
  MAX_TARGETED_CARDS_PER_TOWER,
  DEFAULT_MODIFIER_CAPS,
  appendLegacyMultiplier,
  canAcceptTargetedCard,
  getModifierAdd,
  getModifierMultiplier,
  resolveModifierBreakdown
} from "./modifiers/index.js";
export type { Modifier, ModifierBreakdown, ModifierCaps, ModifierScope, ModifierStat, RunModifiers } from "./modifiers/index.js";
export {
  ALL_UNLOCKS,
  BACKUP_LINE_DURATION_MS,
  CARD_RARITY_WEIGHT,
  MAX_ENCODABLE_UNLOCKS,
  decodeUnlocks,
  encodeUnlocks,
  hasUnlockBit,
  COLD_CRIT_CHANCE,
  COLD_CRIT_TEMPERATURE,
  RUN_HOT_DAMAGE_PER_DEGREE,
  RUN_HOT_HEAT_LOCK_THRESHOLD,
  cardCatalog,
  cardAppliesToTower,
  drawCards,
  getCardDefinition,
  getCardRarity
} from "./cards/index.js";
export type { CardDefinition, CardRarity, CardScope, CardTowerProfile, Unlock } from "./cards/index.js";
export { NEUTRAL_ATTACK_MULTIPLIERS, isEmptyTowerGrant, resolveTowerAttackMultipliers, resolveTowerEngine } from "./grants/index.js";
export type { TowerAttackGrant, TowerAttackMultipliers, TowerGrant } from "./grants/index.js";
export {
  SHOP_OFFER_COUNT,
  SHOP_REROLL_BASE_PRICE,
  SHOP_REROLL_PRICE_STEP,
  DEFAULT_SHOP_PRICE_GROWTH,
  GLOBAL_SHOP_ITEM_IDS,
  MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER,
  canEquipShopItem,
  isGlobalShopItem,
  shopItemAppliesToTower,
  getShopItemCount,
  getShopItemPrice,
  getShopRerollPrice,
  isShopItemAvailable,
  getShopItem,
  drawShopOffers,
  shopCatalog
} from "./shop/index.js";
export type { EquipShopItemFailure, ShopItem, ShopItemCategory, ShopItemTarget, ShopState, ShopUnlock } from "./shop/index.js";
export { applyEnemyMark, getMarkDamageMultiplier } from "./marks/index.js";
export type { ActiveMark } from "./marks/index.js";
export {
  TOWER_TURN_RATE_RADIANS_PER_SECOND,
  TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS,
  getTowerFireAlignmentTolerance,
  shouldRetainAimTargetLock,
  shortestAngleDelta,
  rotateTowerTowards,
  isTowerAligned
} from "./aiming/index.js";
export { LINEAR_BALLISTIC_HIT_TYPES, LINEAR_BALLISTIC_SPEED_MULTIPLIER, LINEAR_BALLISTIC_COLLISION_RADIUS, getBallisticMovementSpeed, getBallisticCollisionRadius, usesLinearBallistics, findFirstLinearCollision } from "./ballistics/index.js";
export type { BallisticCollisionBody } from "./ballistics/index.js";
export {
  RESOURCE_EXTRACTION_DURATION_MS,
  LOGISTICS_WORKER_CAPACITY,
  ENERGY_LOGISTICS_WORKER_CAPACITY,
  AMMO_LOGISTICS_WORKER_CAPACITY,
  AMMO_COLLECTOR_WORKER_CAPACITY,
  RESOURCE_PROVIDER_INITIAL_STOCK,
  AMMO_FACTORY_INITIAL_ENERGY,
  LOGISTICS_WORKER_RESPAWN_DELAY_MS,
  LOGISTICS_WORKER_INSTANT_REVIVE_COST,
  advanceResourceExtraction,
  getLogisticsWorkerRespawnRemainingMs
} from "./logistics/index.js";
export {
  FINAL_WAVE,
  BASE_WAVE_ENEMY_COUNT,
  ENEMY_COUNT_WAVE_MULTIPLIER,
  ENEMY_HP_WAVE_MULTIPLIER,
  ENEMY_HP_BALANCE_MULTIPLIER,
  EARLY_WAVE_HP_RATIO,
  EARLY_WAVE_RAMP_EXPONENT,
  EARLY_WAVE_CONVERGENCE_WAVE,
  PLAYER_POWER_COMPENSATION,
  ENEMY_REWARD_MULTIPLIER,
  WALL_COST_COEFFICIENT,
  REFERENCE_STRUCTURE_BREAK_DPS,
  getStructureTravelCost,
  SIEGE_STRUCTURE_DAMAGE_MULTIPLIER,
  SIEGE_FIRST_WAVE,
  SIEGE_SPAWN_RATIO,
  getStructureRepairCost,
  STRUCTURE_REPAIR_COST_RATIO,
  STRUCTURE_BREACH_HEALTH_RATIO,
  getWaveEnemyCount,
  getArenaWaveEnemyCount,
  getWaveHpMultiplier,
  getWaveEnemyMaxHp,
  getWaveCompletionGold
} from "./balance/index.js";
export {
  GAME_SPEED_MULTIPLIER,
  GLOBAL_TOWER_RANGE_MULTIPLIER,
  TOWER_RANGE_PER_LEVEL,
  TOWER_MIN_FIRE_INTERVAL_MS,
  ZEYNEP_SHOWCASE_BASE_LENGTH,
  ZEYNEP_SHOWCASE_LENGTH_PER_LEVEL,
  getDebugLaserDamageMultiplier,
  getDebugLaserFireInterval,
  getKinFireInterval,
  getObsessionDamageMultiplier,
  getTowerBaseLevelDamage,
  getTowerBaseLevelFireIntervalMs,
  getTowerBaseLevelMinimumRange,
  getTowerBaseLevelRange,
  getTowerDisplayStats,
  getTowerImpactDamageCompensation,
  getTowerLevelIntervalMultiplier,
  getTowerRealDps,
  getTowerRealFireIntervalMs,
  getTrackerFireInterval,
  getUcubeGrowthDamageMultiplier,
  getZeynepHizaDamageCompensation,
  getZeynepHizaFireInterval,
  getZeynepShowcaseBeamLength,
  hasGlobalTowerRange
} from "./tower-stats/index.js";
export type { TowerDisplayStats } from "./tower-stats/index.js";
export {
  SYMPATHY_BLEED_DURATION_MS,
  SYMPATHY_BLEED_MAX_HEALTH_RATIO_PER_SECOND,
  SYMPATHY_DURATION_MS,
  SYMPATHY_LINK_HALF_WIDTH,
  SYMPATHY_SLOW_MULTIPLIER,
  buildSympathyLinks,
  getDistanceToSegment,
  isTouchingSympathyLink,
  selectSympathyContacts
} from "./sympathy/index.js";
export type { SympathyContactTarget, SympathyLink, SympathyTower } from "./sympathy/index.js";
export { dispatchTowerTriggers } from "./triggers/index.js";
export type { DispatchTowerTriggerOptions, TowerTriggerDispatchResult, TriggerCooldowns } from "./triggers/index.js";
export { applyTowerAuraModifier, evaluateTowerAuras, getTowerAuraLevelMultiplier, isPointInsideTowerAura } from "./auras/index.js";
export type { TowerAuraModifiers, TowerAuraSource, TowerAuraTarget } from "./auras/index.js";
export { isTargetInsideAttackShape, selectAttackShapeTargets } from "./attacks/index.js";
export type { AttackShapeQuery, AttackShapeTarget } from "./attacks/index.js";
export { getOrbitTargetHitCooldownMs, selectOrbitSweepContacts, selectOrbitSweepTargets } from "./attacks/orbit.js";
export type { OrbitSweepContact, OrbitSweepQuery } from "./attacks/orbit.js";
export { selectTowerTarget } from "./targeting/index.js";
export type { TowerTargetCandidate, TowerTargetingQuery } from "./targeting/index.js";
export { getPlacementFootprint, hasOpenGridRoute, validateEdgePlacement, validateTowerPlacement } from "./placement/index.js";
export {
  computeFlowField,
  getFlowCost,
  getFlowFieldIndex,
  getFlowNext,
  isInsideFlowField
} from "./flow-field/index.js";
export type { FlowField, FlowFieldCell } from "./flow-field/index.js";
export type { EdgeOrientation, EdgeSegment, PlacementBoard, PlacementCell, PlacementFailureReason, PlacementValidation } from "./placement/index.js";
export {
  MAP_GRID_COLS,
  MAP_GRID_ROWS,
  MAP_STORAGE_KEY,
  DEFAULT_MAP_SCALE,
  MAX_MAP_SCALE,
  createDefaultEditableMap,
  createOpenArenaMap,
  getMapGridSize,
  getMapMetrics,
  getMapOrigin,
  getMapWorldBounds,
  getMapScale,
  findPathToNearestNexus,
  buildRuntimePaths,
  getMapPoints,
  getPointAlongRuntimePath,
  getTile,
  gridToWorld,
  isInsideMap,
  isWalkableTile,
  normalizeMapData,
  pathToWorldPoints,
  scaleEditableMap,
  setTile,
  worldToGrid,
  type EditableMapData,
  type GridPoint,
  type MapScale,
  type MapTileKind,
  type RuntimePath,
  type WorldPoint
} from "./map.js";

/**
 * Towers whose muzzle should turn toward what they are shooting.
 *
 * Kept as an explicit list rather than inferred from hitType: Kin Kulesi is an
 * aura tower but fires a directional cone, while Sunucu throws projectiles yet
 * is a global rack with no muzzle. Auras, passives and area curses never aim.
 *
 * Taht Muhru was excluded while it was a socketed seal, but its art now carries
 * an explicit barrel on the right, and a muzzle that never turns reads worse
 * than one that does.
 */
const AIMING_TOWER_IDS = new Set<string>([
  "zeynep-1",
  "zeynep-2",
  "zeynep-3",
  "zeynep-6",
  "warrior-1",
  "warrior-4",
  "warrior-5",
  "warrior-6",
  "archer-1",
  "archer-2",
  "archer-4",
  "archer-5"
]);

export function towerAims(definitionId: string) {
  return AIMING_TOWER_IDS.has(definitionId);
}

/**
 * How many grid cells a tower covers per side. Saray Arsivi is a 2x2 vault, so
 * it snaps to a cell corner and occupies four tiles. Abarti is not a tile tower
 * at all and goes through the edge placement path instead.
 */
export function getTowerGridSpan(definitionId: string) {
  return definitionId === "zeynep-7" ? 2 : 1;
}

/**
 * Painted tower art reserves a margin around the disc so muzzles and spikes can
 * overhang without making the disc itself smaller. The disc is this fraction of
 * the frame, which lets the renderer size a sprite so its disc lands exactly on
 * the tile regardless of how much the art sticks out.
 */
export const TOWER_ART_DISC_RATIO = 0.7;

export const upgradeCosts: Record<UpgradeId, number> = {
  damage: 35,
  fireRate: 40,
  projectileSpeed: 30,
  heal: 45
};

const TOWER_BUILD_COST_MULTIPLIER = 2;

export function getTowerBuildCost(towerCost: number) {
  return Math.round(towerCost * TOWER_BUILD_COST_MULTIPLIER);
}

export function getTowerLevelExpCost(towerCost: number, currentLevel: number) {
  if (currentLevel < 1 || currentLevel >= 10) {
    return 0;
  }
  const safeLevel = Math.round(currentLevel);
  return getTowerBuildCost(towerCost) * safeLevel;
}

export function getTowerLevelGoldCost(towerCost: number, currentLevel: number) {
  const nextLevel = Math.round(currentLevel) + 1;
  if (nextLevel === 5) return getTowerBuildCost(towerCost);
  if (nextLevel === 10) return getTowerBuildCost(towerCost) * 2;
  return 0;
}

export function getEnemyExp(wave: number, enemyType: EnemyType, movementKind: MovementKind = "ground") {
  const typeMultiplier: Record<EnemyType, number> = {
    grunt: 1,
    runner: 1,
    shooter: 1.6,
    brute: 2.5,
    siege: 1.4
  };
  const flyingMultiplier = movementKind === "air" ? 0.7 : 1;
  return Math.round((4 + Math.max(0, Math.round(wave))) * typeMultiplier[enemyType] * flyingMultiplier * 100) / 100;
}

export function getTowerTotalInvestedGold(towerCost: number, currentLevel: number, towerId?: string) {
  void currentLevel;
  void towerId;
  return getTowerBuildCost(towerCost);
}

export function getTowerSellRefund(towerCost: number, currentLevel: number, towerId?: string) {
  return Math.floor(getTowerTotalInvestedGold(towerCost, currentLevel, towerId) / 2);
}
