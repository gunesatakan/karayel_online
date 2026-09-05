import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import { performance } from "node:perf_hooks";
import {
  characters,
  DEFAULT_MAP_SCALE,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  MAP_PATH,
  PATH_WIDTH,
  STATUS_EFFECTS,
  TOWER_BUILD_BOTTOM,
  TOWER_BUILD_TOP,
  TOWER_GRID_SIZE,
  TOWER_BASE_CRITICAL_CHANCE,
  TOWER_MIN_FIRE_INTERVAL_MS,
  TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER,
  TOWER_TURN_RATE_RADIANS_PER_SECOND,
  createDefaultEditableMap,
  createOpenArenaMap,
  GAME_SPEED_MULTIPLIER,
  GLOBAL_TOWER_RANGE_MULTIPLIER,
  SYMPATHY_BLEED_DURATION_MS,
  SYMPATHY_BLEED_MAX_HEALTH_RATIO_PER_SECOND,
  SYMPATHY_DURATION_MS,
  SYMPATHY_LINK_HALF_WIDTH,
  SYMPATHY_SLOW_MULTIPLIER,
  ZEYNEP_SHOWCASE_BASE_LENGTH,
  buildSympathyLinks,
  selectSympathyContacts,
  getDebugLaserDamageMultiplier,
  getDebugLaserFireInterval,
  getKinFireInterval,
  getObsessionDamageMultiplier,
  getTowerLevelIntervalMultiplier,
  getTowerTier,
  getTrackerFireInterval,
  getUcubeGrowthDamageMultiplier,
  getZeynepHizaDamageCompensation,
  getZeynepHizaFireInterval,
  getZeynepShowcaseBeamLength,
  applyStatusResistance,
  applyEnemyMark,
  applyTowerStatusEffect,
  applyTowerStack,
  getTowerStackMultiplier,
  getTowerStatusOutcomes,
  applyTowerAuraModifier,
  dispatchTowerTriggers,
  evaluateTowerAuras,
  getTowerAuraLevelMultiplier,
  isTargetInsideAttackShape,
  selectAttackShapeTargets,
  selectTowerTarget,
  SpatialGrid,
  getPlacementFootprint,
  createBlindNavigatorState,
  stepBlindNavigator,
  type BlindHand,
  type BlindNavigatorState,
  getEdgeSegments,
  occupiesTowerSlot,
  isEdgeSegmentInsideBoard,
  SIEGE_STRUCTURE_DAMAGE_MULTIPLIER,
  SIEGE_FIRST_WAVE,
  SIEGE_SPAWN_RATIO,
  getStructureRepairCost,
  STRUCTURE_BREACH_HEALTH_RATIO,
  getStructureHealthMultiplier,
  isWallDefinition,
  WALL_TOWER_ID,
  WALL_EDGE_LENGTH,
  validateEdgePlacement,
  validateTowerPlacement,
  resetTowerStack,
  calculateTowerScaledBaseDamage,
  calculateTowerAmmoCost,
  calculateTowerShotEnergyCost,
  getTowerShotFuelModifierMultiplier,
  isPeriodicTowerAura,
  AURA_REFRESH_DURATION_MULTIPLIER,
  calculateTowerOperatingEnergy,
  shouldConsumeTowerOperatingEnergy,
  getTowerEnergyState,
  calculateTowerShotHeat,
  calculateOrbitContinuousCosts,
  getOrbitRotationSpeed,
  getOrbitBladeLength,
  getOrbitRotationSpeedForInterval,
  getOrbitTargetHitCooldownMs,
  selectOrbitSweepContacts,
  resolveOnurGamblerShot,
  appendLegacyMultiplier,
  advanceResourceExtraction,
  getMelisEvolutionStressCost,
  getUcubePerkTier,
  isUcubePerkOption,
  type UcubePerkId,
  getMelisSpectrumZone,
  type MelisStance,
  ZEYNEP_BURN_SYNTHESIS_RANGE_MULTIPLIER,
  ZEYNEP_RAY_SYNTHESIS_DAMAGE_MULTIPLIER,
  ZEYNEP_RAY_SYNTHESIS_LENGTH_CELLS,
  ZEYNEP_COLUMN_ULTIMATE_BEAM_MS,
  ZEYNEP_COLUMN_ULTIMATE_DAMAGE,
  ATAKAN_ULTIMATE_DRONE_DAMAGE,
  ULTIMATE_POWER_MAX_LEVEL,
  getUltimatePowerMultiplier,
  getUltimatePowerUpgradeCost,
  ZEYNEP_COLUMN_ULTIMATE_SLOW_MS,
  type HirableWorkerRole,
  getWorkerHireCost,
  isHirableWorkerRole,
  LOGISTICS_WORKER_CAPACITY,
  ENERGY_LOGISTICS_WORKER_CAPACITY,
  AMMO_LOGISTICS_WORKER_CAPACITY,
  AMMO_COLLECTOR_WORKER_CAPACITY,
  RESOURCE_PROVIDER_INITIAL_STOCK,
  AMMO_FACTORY_INITIAL_ENERGY,
  BACKUP_LINE_DURATION_MS,
  encodeUnlocks,
  resolveTowerAttackMultipliers,
  COLD_CRIT_CHANCE,
  COLD_CRIT_TEMPERATURE,
  RUN_HOT_DAMAGE_PER_DEGREE,
  RUN_HOT_HEAT_LOCK_THRESHOLD,
  getCardDefinition,
  resolveTowerEngine,
  canAcceptTargetedCard,
  canEquipShopItem,
  isGlobalShopItem,
  cardAppliesToTower,
  cardCatalog,
  drawCards,
  drawShopOffers,
  getShopItem,
  getShopItemPrice,
  getShopRerollPrice,
  shopCatalog,
  shopItemAppliesToTower,
  getModifierAdd,
  getModifierMultiplier,
  getMarkDamageMultiplier,
  resolveModifierBreakdown,
  FINAL_WAVE,
  PLAYER_TOWER_LIMIT,
  ENEMY_REWARD_MULTIPLIER,
  getWaveCompletionGold,
  getWaveEnemyCount,
  getArenaWaveEnemyCount,
  getWaveEnemyMaxHp,
  getWaveHpMultiplier,
  calculateDamageTaken,
  findPathToNearestNexus,
  findFirstLinearCollision,
  getBallisticCollisionRadius,
  getBallisticMovementSpeed,
  getMapMetrics,
  getMapOrigin,
  getMapWorldBounds,
  getMapScale,
  getEnemyCombatDefinition,
  getEnemyDamageResistances,
  getMapPoints,
  getMapGridSize,
  getTile,
  isInsideMap,
  inferTowerAmmoType,
  isStatusEffectActive,
  isTowerAligned,
  getTowerFireAlignmentTolerance,
  shouldRetainAimTargetLock,
  usesLinearBallistics,
  rotateTowerTowards,
  getTowerSellRefund,
  getTowerBuildCost,
  getTowerAttackRadius,
  getTowerGridSpan,
  getTowerModeDamageType,
  getTowerSlowDurationMs,
  gridToWorld,
  normalizeMapData,
  pathToWorldPoints,
  scaleEditableMap,
  setTile,
  worldToGrid,
  getTowerLevelExpCost,
  getTowerLevelGoldCost,
  getEnemyExp,
  towerAims,
  towerCatalog,
  type CharacterId,
  type CardDefinition,
  type ShopItem,
  type DamageEventSnapshot,
  type DamageType,
  type DroneSnapshot,
  type EnemyRace,
  type EnemyType,
  type EditableMapData,
  type MovementKind,
  type StatusEffectId,
  type StatusEffectRuntimeState,
  type TowerStatusEffectDefinition,
  type TowerStatusEffectType,
  type TowerStackRuntimeState,
  type TowerStackDefinition,
  type TowerStackTrigger,
  type TowerTriggerCondition,
  type TowerTriggerEvent,
  type BeamSnapshot,
  type GameSnapshot,
  type WireGameSnapshot,
  type HitType,
  type KillEventSnapshot,
  type LobbyStateSnapshot,
  type MapScale,
  type ModifierBreakdown,
  type ProjectileKind,
  type ProjectileSpawnSnapshot,
  type RoomListingSnapshot,
  type RunModifiers,
  type ServerPerfSnapshot,
  type TowerDefinition,
  type AmmoType,
  type AttackShapeQuery,
  type EdgeSegment,
  type TowerTargetingMode,
  type TowerAuraSource,
  type TowerAuraDefinition,
  type TowerSnapshot,
  type SympathyLink,
  type TowerAttackMultipliers,
  type TowerEngineConfig,
  type TowerGrant,
  type Unlock
} from "@karayel/shared";
import {
  createFullStaticSnapshot,
  createStaticEnemySnapshot,
  createStaticTowerSnapshot
} from "../snapshot/static-data.js";

/**
 * Baslangic kesesi. Herkes icin ayni.
 *
 * Melis bir sure 400 ile basliyordu, digerleri 480 ile. Fark artik yok: acilis
 * kesesi karakter dengesinin ayari olmaktan cikti, herkes ayni parayla ayni
 * kararlari veriyor.
 */
const PLAYER_START_GOLD = 550;
const MAX_TEAM_HEALTH = 100;
const MAX_TOWER_LEVEL = 10;
const TOWER_BASE_HP = 100;
const TOWER_BASE_ARMOR = 3;
const TOWER_BASE_AMMO = 20;
const TOWER_BASE_ENERGY = 100;
const LOGISTICS_WORKER_SPEED = 82;
const AMMO_FACTORY_RATE_PER_SECOND = 5;
const AMMO_FACTORY_ENERGY_PER_AMMO = 0.25;
const RESOURCE_PROVIDER_CAPACITY = 480;
const AMMO_RAW_MATERIAL_PER_AMMO = 1;
const TOWER_COOLING_PER_SECOND = 3;
const TOWER_HEAT_UNLOCK_THRESHOLD = 30;
/** Radyator: 100 derecede sogutma iki katina cikar, 0 derecede degismez. */
const RADIATOR_COOLING_BONUS_AT_MAX = 1;
/** Soguk dus: kilit bu sicaklikta acilir, varsayilan 30 yerine. */
const QUICK_RELEASE_HEAT_RELEASE_THRESHOLD = 60;
/** Buhar tahliyesi: her oldurme kuleyi bu kadar derece sogutur. */
const KILL_VENT_HEAT = 4;
/** Soguk zincir: menzilde yavaslatilmis dusman varken sogumaya eklenen pay. */
const CHILL_VENT_COOLING_BONUS = 0.5;
/**
 * Buz akusu: enerji bu oranin uzerindeyken sogumaya eklenen pay.
 *
 * Once oranla surekli olceklenip tam doluda iki kata cikiyordu. Oyunda kule
 * neredeyse hic tam dolu olmadigi icin egrinin tepesine ulasilamiyor, tabanindaki
 * ceza ise surekli isliyordu -- yani kart pratikte yalnizca cezaydi. Esik, kartin
 * gercekten gorulen bolgede calismasini sagliyor.
 */
const CHARGED_COOLING_ENERGY_RATIO = 0.7;
const CHARGED_COOLING_BONUS = 0.5;
/** Namlu molasi: muhimmati biten kulenin sogutma carpani. */
const EMPTY_VENT_COOLING_MULTIPLIER = 3;
/** Isi degisimi: bitisik kuleler arasinda saniyede tasinabilecek derece. */
const HEAT_EXCHANGE_PER_SECOND = 8;
const FOCUS_AIM_TARGET_LOCK_MS = 1500;
const ENEMY_TOWER_ATTACK_INTERVAL_MS = 850;
/**
 * Son dusman oldukten sonra dalga sonunu bekletme suresi.
 *
 * Dalga, dusman sayaci sifirlanir sifirlanmaz kapaniyordu ve kart secimi ayni
 * karede aciliyordu; oyuncu son olumu goremeden ekran ustune biniyordu. Olumun
 * kendisi de aninda gorunmuyor -- mermi hala yolda olabiliyor, hasar yazisi ve
 * olum efekti oynuyor, ustune istemci enterpolasyon tamponu kadar geriden
 * cizyor. Bu bekleme o kuyrugun ekranda tamamlanmasi icin.
 *
 * Duvar saati cinsinden: oyuncunun bekledigi sure oyun hizindan bagimsiz olmali.
 */
const WAVE_CLEAR_PAUSE_MS = 2000;
const ENEMY_MOVEMENT_SPEED_MULTIPLIER = 0.5;
const ENEMY_RACE_WAVE_ORDER: EnemyRace[] = ["meka", "spaceBug", "fourthDimensional", "holyGuardian", "fallen", "golem"];
/**
 * Kimlikten kule tanimina sabit zamanli erisim.
 *
 * Katalog calisma aninda hic degismiyor, ama tanim aramasi dusman yolu
 * hesabinin en sicak noktasindan cagriliyordu ve her cagri yedi karakterin
 * listesini bastan tariyordu. Tablo modul yuklenirken bir kez kuruluyor.
 */
const TOWER_DEFINITIONS_BY_ID = new Map(
  Object.values(towerCatalog).flat().map((definition) => [definition.id, definition])
);
const SNAPSHOT_SEND_INTERVAL_MS = 33;
const SNAPSHOT_BACKPRESSURE_LIMIT_BYTES = 256 * 1024;
const PERF_SEND_INTERVAL_MS = 1000;
const SNAPSHOT_SIZE_METRICS_ENABLED = process.env.SNAPSHOT_SIZE_METRICS === "true";
const SNAPSHOT_SIZE_SAMPLE_INTERVAL_MS = 1000;
const DEBUG_LASER_OVERDRIVE_DURATION_MS = 2000;
const DEBUG_LASER_MAX_SWEEP_RADIANS_PER_SECOND = degreesToRadians(30);
const DEBUG_LASER_OVERDRIVE_BEAM_RADIUS = 12;
const DEBUG_LASER_HEAT_WINDOW_MS = 20000;
const DEBUG_LASER_HEAT_LIMIT_MS = 10000;
const DEBUG_LASER_OVERHEAT_MS = 5000;
const TOWER_DPS_WINDOW_MS = 5000;
const UCUBE_STACK_INTERVAL_REDUCTION = (1 - 300 / 940) / 15;
const ATAKAN_ULTIMATE_EXHAUSTION_MS = 3000;
const ATAKAN_DRONE_REPAIR_AMOUNT = 3;
const ATAKAN_DRONE_ATTACK_SPEED = 180;
const ATAKAN_DRONE_REPAIR_SPEED = 150;
const ATAKAN_ULTIMATE_CHARGE_MULTIPLIER = 1 / 3;
const KILL_STREAK_BUFF_DURATION_MS = 3000;
const KILL_STREAK_RETRIGGER_LOCK_MS = 60000;
const PROJECTILE_GUIDANCE_RADIUS = 78;
const PROJECTILE_GUIDANCE_DAMAGE_MULTIPLIER = 1.3;
const ZEYNEP_MAX_REPUTATION = 100;
const ZEYNEP_SMALL_COMMAND_COST = 10;
const ZEYNEP_MEDIUM_COMMAND_COST = 40;
const ZEYNEP_BIG_COMMAND_COST = 80;
const ZEYNEP_REPUTATION_GAIN_MULTIPLIER = 1 / 3;
const ZEYNEP_MAX_AUTHORITY_QUALITY = 15;
const ZEYNEP_QUALITY_POWER_STEP = 0.035;
const ZEYNEP_QUALITY_DURATION_STEP = 0.015;
const ZEYNEP_SHOWCASE_BEAM_RADIUS = 9;
const ZEYNEP_SYNTHESIS_BEAM_RADIUS = 10;
const ZEYNEP_SYNTHESIS_BURN_RADIUS = 34;
const ZEYNEP_SYNTHESIS_BURN_LINE_RADIUS = 16;
const ZEYNEP_SYNTHESIS_BURN_DURATION_MS = 3000;
const ZEYNEP_SYNTHESIS_BURN_TICK_MS = 333;
const ZEYNEP_SYNTHESIS_RAY_SPEED = 930;
const ZEYNEP_SYNTHESIS_RAY_LENGTH = TOWER_GRID_SIZE * ZEYNEP_RAY_SYNTHESIS_LENGTH_CELLS;
const ZEYNEP_SYNTHESIS_RAY_TRAIL_TTL_MS = 140;
// Dizilim oyundaki en zor yerlesim sarti: tam ikili ya da tam ucgen ucluk
// kurulacak, gruba dorduncu kule girerse buff bozulacak. Karsiligi +%15 ve
// +%32 idi, yani tek bir kule seviyesinden azdi; oyunun en derin karar agaci
// en az odullendiren mekanikti. Ucluk artik neredeyse iki katina cikariyor.
const ZEYNEP_FORMATION_PAIR_DAMAGE_MULTIPLIER = 1.2;
const ZEYNEP_FORMATION_TRIO_DAMAGE_MULTIPLIER = 1.45;
const ZEYNEP_FORMATION_PAIR_FIRE_INTERVAL_MULTIPLIER = 0.88;
const ZEYNEP_FORMATION_TRIO_FIRE_INTERVAL_MULTIPLIER = 0.76;
const KIN_WAVE_ANGLE_RADIANS = degreesToRadians(60);
const KIN_SYNTHESIS_WAVE_ANGLE_RADIANS = degreesToRadians(90);
const KIN_WAVE_SPEED = 104;
const KIN_WAVE_BAND_DEPTH = 30;
/** `surge` trigger etkisinin suresi ve hasar bonusu. */
const SURGE_DURATION_MS = 8000;
const SURGE_DAMAGE_ADD = 0.8;
/** `heat:overheatBurst` kilidinin kilitlenme aninda verdigi hasar. */
const OVERHEAT_BURST_DAMAGE = 40;
/** `energy:backupLine` acikken atis basina yakilan muhimmat. */
const BACKUP_LINE_AMMO_PER_SHOT = 2;
/** `ammo:emptyBleed` kilidinin uyguladigi kanama. */
const AMMO_EMPTY_BLEED: TowerStatusEffectDefinition = { type: "bleed", magnitude: 0.012, durationMs: 5000, stacking: "refresh" };
const KIN_SLOW_NEAR_MULTIPLIER = 1;
const KIN_SLOW_FAR_MULTIPLIER = 0.6;
const KIN_SYNTHESIS_PUSHBACK_DISTANCE = 12;
const KIN_SYNTHESIS_TIP_HOLD_SECONDS = 0.5;
const KIN_SHOWCASE_ARMOR_BREAK_BASE = 8;
const KIN_SHOWCASE_ARMOR_BREAK_PER_LEVEL = 2;
const MELIS_MAX_FAVORITE_TOWERS = 3;
/**
 * Favori kule bonusu.
 *
 * Iki tavan farkli yerde doluyordu: atis araligi onay 29'da tabana carpiyor,
 * hasar 40'a kadar buyumeye devam ediyordu; arada biriken onayin yarisi bosa
 * gidiyordu. Artik ikisi de ayni noktada doluyor. Toplam buyukluk de kisildi:
 * favori ve evrim birlikte DPS'i x14 katliyordu, yani Atakan'in x1.24 ve
 * Zeynep'in x1.32 pasifleriyle ayni oyunda duracak bir sayi degildi.
 */
const MELIS_APPROVAL_CAP = 40;
const MELIS_FAVORITE_DAMAGE_PER_APPROVAL = 0.015;
const MELIS_FAVORITE_FIRE_INTERVAL_PER_APPROVAL = 0.00625;
const MELIS_FAVORITE_FIRE_INTERVAL_FLOOR = 0.75;
const MELIS_MAX_EVOLUTION_LEVEL = 3;

/**
 * Onde giden tarafin her dalga erimesi.
 *
 * Hicbir uc park yeri olmamali: bir konumu korumak surekli eylem istemeli.
 * Erime yalnizca onde olani geri ceker, geride olani bedavaya yukseltmez.
 */
const MELIS_SPECTRUM_LEAD_DECAY = 0.15;

/** Seri yapmadan gecen dalganin ve dusen performansin stres bedeli. */
const MELIS_QUIET_WAVE_STRESS = 2;
const MELIS_DECLINE_WAVE_STRESS = 1;
const MELIS_GOTHIC_NIGHTMARE_MS = 9000;
const MELIS_GOTHIC_NIGHTMARE_DAMAGE_MULTIPLIER = 1.5;
const MELIS_GOTHIC_NIGHTMARE_HASTE_MULTIPLIER = 1.25;
const MELIS_BULLY_RADIUS = 78;
const MELIS_BULLY_DURATION_MS = 7000;
const MELIS_BULLY_DAMAGE_RADIUS = 70;
const MELIS_BULLY_DAMAGE_MULTIPLIER = 3;
const MELIS_FOCUS_DURATION_MS = 5000;
const MELIS_FOCUS_PROJECTILE_SPEED_MULTIPLIER = 3;
const MELIS_FOCUS_KILL_HASTE_MULTIPLIER = 5;
const MELIS_PARLAMA_FEAR_MS = 500;
const MELIS_PARLAMA_STRESS_FRIENDLY_PAUSE_MS = 500;
const MELIS_CURSE_NORMAL_DURATION_MS = 5000;
const MELIS_CURSE_STRESS_DURATION_MS = 3000;
const MELIS_CURSE_APPROVAL_DURATION_MS = 7000;
const MELIS_CURSE_EVOLUTION_AREA_BONUS = 8;
const MELIS_CURSE_DEATH_BURST_RADIUS = 58;
const MELIS_CURSE_POOL_DURATION_MS = 3000;
const MELIS_CURSE_POOL_TICK_MS = 500;
const MELIS_DOUBT_BASE_DURATION_MS = 4000;
const MELIS_DOUBT_APPROVAL_BONUS_MS = 2000;
const MELIS_DOUBT_HESITATION_BASE_MS = 500;
const MELIS_DOUBT_STRESS_HASTE_MS = 500;
const MELIS_DOUBT_STRESS_HASTE_MULTIPLIER = 1.5;
const MELIS_DOUBT_SLOW_PER_STACK = 0.1;
const MELIS_DOUBT_SPREAD_RADIUS = 56;
const MELIS_DOUBT_TRIGGER_STACKS = 3;
const MELIS_WHISPER_TURN_MS = 1000;
const MELIS_WHISPER_TURN_ATTACK_RANGE = 92;
const MELIS_WHISPER_TURN_ATTACK_DAMAGE = 28;
const MELIS_WHISPER_TURN_ATTACK_INTERVAL_MS = 320;
const MELIS_WHISPER_TURN_BLOCK_RADIUS = 42;
const MELIS_WHISPER_TURN_EXPLOSION_RADIUS = 58;
const MELIS_UNDERWORLD_EXECUTE_MIN_RATIO = 0.03;
const MELIS_UNDERWORLD_EXECUTE_MAX_RATIO = 0.18;
const MELIS_UNDERWORLD_DIGEST_MAX_MS = 3000;
const MELIS_UNDERWORLD_DIGEST_MIN_MS = 1000;
const MELIS_UNDERWORLD_FEAR_RADIUS = 56;
const MELIS_UNDERWORLD_FEAR_MS = 1000;
const MELIS_UNDERWORLD_CHAIN_DAMAGE_INTERVAL_MS = 350;
const MELIS_UNDERWORLD_CHAIN_DAMAGE = 18;
const MELIS_UNDERWORLD_CHAIN_RADIUS = 12;
const MELIS_UNDERWORLD_UNDEAD_RANGE = 92;
const MELIS_UNDERWORLD_UNDEAD_DAMAGE = 34;
const MELIS_UNDERWORLD_UNDEAD_FIRE_INTERVAL_MS = 900;
const MELIS_UNDERWORLD_UNDEAD_BLOCK_RADIUS = 42;
const MELIS_UNDERWORLD_UNDEAD_TTL_MS = 18000;
const MELIS_BROKEN_MIRROR_BASE_CAPACITY = 180;
const MELIS_BROKEN_MIRROR_CAPACITY_MULTIPLIER = 1.5;
const MELIS_BROKEN_MIRROR_BASE_STORE_RATIO = 0.2;
const MELIS_BROKEN_MIRROR_EVOLUTION_STORE_BONUS = 0.04;
const MELIS_BROKEN_MIRROR_TRUE_DAMAGE_RATIO = 0.25;
const MELIS_BROKEN_MIRROR_DEATH_BURST_RATIO = 0.35;
const MELIS_BROKEN_MIRROR_DEATH_BURST_RADIUS = 58;
const MELIS_BROKEN_MIRROR_RELEASE_MIN_MULTIPLIER = 1.1;
const MELIS_BROKEN_MIRROR_RELEASE_MAX_MULTIPLIER = 2;
const MELIS_BROKEN_MIRROR_EVOLUTION_HASTE_MS = 2000;
const MELIS_BROKEN_MIRROR_EVOLUTION_HASTE_MULTIPLIER = 1.2;
const MELIS_INITIAL_APPROVAL = 6;
const MELIS_INITIAL_STRESS = 6;

class Player extends Schema {
  runModifiers: RunModifiers = [];
  ownedCardIds: string[] = [];
  /** Satin alinan her sey; fiyat artisi ve stok limiti bunun uzerinden isler. */
  ownedShopItemIds: string[] = [];
  /** Alinmis ama henuz bir kuleye takilmamis esyalar. */
  inventoryItemIds: string[] = [];
  /** Altinla alinmis ek isciler; rolu alim aninda oyuncu secer. */
  hiredWorkerRoles: HirableWorkerRole[] = [];
  shopOffers: ShopItem[] = [];
  shopRerolls = 0;
  nexusShieldCharges = 0;
  @type("string") name = "";
  @type("string") characterId: CharacterId = "warrior";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("number") gold = PLAYER_START_GOLD;
  @type("number") goldSpent = 0;
  @type("number") experience = 0;
  @type("number") towersBuilt = 0;
  @type("number") ultimateCharge = 0;
  /** Altinla alinmis ulti gucu kademesi; hasar carpani buradan cikar. */
  @type("number") ultimatePower = 0;
  @type("number") skill1CooldownMs = 0;
  @type("number") skill2CooldownMs = 0;
  @type("number") skill3CooldownMs = 0;
  @type("number") reputation = 0;
  @type("number") authorityChain = 0;
  @type("number") authorityQuality = 0;
  @type("number") approval = 0;
  @type("number") stress = 0;
  @type("number") currentWaveApproval = 0;
  @type("number") lastWaveApproval = -1;
  /** Serilerin hangi tarafa yazilacagi; oyuncunun bari surdugu direksiyon. */
  melisStance: MelisStance = "approval";
}

class MatchState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

type JoinOptions = {
  playerName?: string;
  characterId?: CharacterId;
  roomName?: string;
  mapScale?: MapScale;
  mapData?: EditableMapData;
  autoStart?: boolean;
};

type PlaceTowerMessage = {
  definitionId?: string;
  x?: number;
  y?: number;
  orientation?: TowerOrientation;
};

type UpgradeTowerMessage = {
  towerId?: string;
};

type SellTowerMessage = {
  towerId?: string;
};

type UseSkillMessage = {
  slot?: number;
  x?: number;
  y?: number;
  towerId?: string;
  commandTier?: ZeynepCommandTier;
};

type UseUltimateMessage = {
  mode?: "attack" | "repair";
  /** Zeynep ultisinin patlayacagi sutun. */
  column?: number;
};

type KillStreakTier = "granted" | "unstoppable" | "rampage" | "legendary";

type KillStreakRule = {
  tier: KillStreakTier;
  windowMs: number;
  kills: number;
  damageMultiplier: number;
  hasteMultiplier: number;
  fearAllMs: number;
};

type KillStreakLock = {
  unlockAt: number;
  wave: number;
};

const KILL_STREAK_RULES: KillStreakRule[] = [
  { tier: "legendary", windowMs: 11000, kills: 22, damageMultiplier: 1.2, hasteMultiplier: 1.2, fearAllMs: 3000 },
  { tier: "rampage", windowMs: 8000, kills: 16, damageMultiplier: 1.2, hasteMultiplier: 1.2, fearAllMs: 0 },
  { tier: "unstoppable", windowMs: 5000, kills: 10, damageMultiplier: 1.2, hasteMultiplier: 1, fearAllMs: 0 },
  { tier: "granted", windowMs: 2000, kills: 5, damageMultiplier: 1.1, hasteMultiplier: 1, fearAllMs: 0 }
];

const ARMOR_BREAK_MARKER_MS = 3000;

type PingMessage = {
  sentAt?: number;
};

type LinkServerMessage = {
  serverTowerId?: string;
  targetTowerId?: string;
};

type TowerModeMessage = {
  towerId?: string;
  mode?: "approval" | "stress" | "standby";
};

type EnemyModel = {
  id: string;
  type: EnemyType;
  race: EnemyRace;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  healthRegenPerSecond: number;
  shield: number;
  maxShield: number;
  movementKind: MovementKind;
  damageResistances: Partial<Record<DamageType, number>>;
  hitTypeResistances: Partial<Record<HitType, number>>;
  statusResistances: Partial<Record<StatusEffectId, number>>;
  statusEffects: Partial<Record<TowerStatusEffectType, StatusEffectRuntimeState>>;
  statusTickAt: Partial<Record<TowerStatusEffectType, number>>;
  stackStates: Record<string, TowerStackRuntimeState>;
  abilities: string[];
  speed: number;
  reward: number;
  attack: number;
  towerAttackCooldownMs: number;
  /**
   * Kirmaya karar verilen yapi.
   *
   * Akis alani bir yapi hasar aldikca degisir; kilit olmasa dusman her tick
   * yeniden karar verip iki gedik arasinda yalpalar ve hicbirini kiramaz.
   * Kilit yalnizca yapi yikilinca ya da dusman o hucreden ayrilinca duser.
   */
  structureTargetId?: string;
  /** Kor gezinme hafizasi: tutulan el ve bakilan yon. */
  navigator?: BlindNavigatorState;
  /** Bu hucre icin verilmis karar; hucre degisene kadar tekrarlanir. */
  navigatorStep?: { fromCol: number; fromRow: number; toCol: number; toRow: number };
  pathDistance: number;
  slowUntil: number;
  auraSlowMultiplier: number;
  kinSlowUntil: number;
  kinSlowMultiplier: number;
  fearUntil: number;
  armorBrokenUntil: number;
  dominatedUntil: number;
  dominatedOwnerId: string;
  trackingStackUntil: [number, number, number];
  melisCurseLoad: number;
  melisCurseBurstDamage: number;
  melisCurseUntil: number;
  melisCurseOwnerId: string;
  melisCurseTowerId: string;
  melisCurseEvolutionLevel: number;
  melisDoubtStacks: number;
  melisDoubtUntil: number;
  melisDoubtHesitateUntil: number;
  melisDoubtHasteUntil: number;
  melisWhisperTurnedUntil: number;
  melisWhisperTurnedOwnerId: string;
  melisWhisperTurnedSourceTowerId: string;
  melisWhisperTurnedEvolutionLevel: number;
  melisWhisperTurnedAttackCooldownMs: number;
  melisUndeadOwnerId: string;
  melisUndeadUntil: number;
  melisUndeadAttackCooldownMs: number;
  melisUndeadSourceTowerId: string;
  melisUnderworldVulnerableUntil: number;
  melisUnderworldDamageTakenMultiplier: number;
  activeMarkId: string;
  activeMarkAdd: number;
  activeMarkUntil: number;
  pathId: number;
};

type TowerModel = {
  id: string;
  ownerId: string;
  ownerName: string;
  characterId: CharacterId;
  definition: TowerDefinition;
  x: number;
  y: number;
  orientation: TowerOrientation;
  hp: number;
  maxHp: number;
  armor: number;
  ammoType: AmmoType;
  ammo: number;
  maxAmmo: number;
  energy: number;
  maxEnergy: number;
  energyDepletedAt: number;
  standby: boolean;
  wakeReadyAt: number;
  ammoLogisticsEnabled: boolean;
  temperature: number;
  misfortune: number;
  luckyWindowUntil: number;
  lastLuckMultiplier: number;
  bladeAngle: number;
  orbitLastHitAt: Map<string, number>;
  performance: number;
  heatLocked: boolean;
  rawAmmo: number;
  maxRawAmmo: number;
  level: number;
  cooldownMs: number;
  auraExpiresAt: number;
  focusTargetId: string;
  aimTargetId: string;
  aimTargetLockUntil: number;
  aimTargetHasFired: boolean;
  focusStacks: number;
  stackStates: Record<string, TowerStackRuntimeState>;
  triggerCooldowns: Record<string, number>;
  activeMs: number;
  overheatMs: number;
  offlineUntil: number;
  debugOverdriveUntil: number;
  debugSweepStartedAt: number;
  /**
   * Supurmenin ugrayacagi dusmanlar, kuleye yakinliga gore sirali.
   *
   * Once yol mesafesi tutuluyordu: kiris, olen hedefin yol uzerindeki
   * noktasindan arkadaki dusmanin noktasina donuyordu. Dusmanlar sabit bir yol
   * izlemeyi birakip korlemesine yurumeye baslayinca o mesafenin kime karsilik
   * geldigi belirsizlesti ve kiris bosluga donmeye basladi. Artik zincir
   * dusmanlarin kendisi.
   */
  debugSweepTargetIds: string[];
  /**
   * Kirisin en son **cizildigi** aci ve o anin zamani.
   *
   * Hedef acisini hesaplamak yetmiyor: zincirin acilari canli okundugu icin
   * ilk halka olunce baslangic noktasi degisiyor ve hesaplanan aci bir karede
   * siciriyordu. Donus hizi sinirini gercekten tutmak icin cizilen acinin
   * kendisi hatirlanmali; sinir hesaplanan degere degil, ekranda goze gorunen
   * harekete konuyor.
   */
  debugSweepAngle: number;
  debugSweepAngleAt: number;
  /** Son hasar karesinde kirisin durdugu aci; taranan yayin bir ucu. */
  debugSweepDamageAngle: number;
  debugSweepDamageAngleAt: number;
  debugSweepLastDamageAt: number;
  debugOverdriveHeatLastAt: number;
  debugOverdriveHeatSegments: DebugOverdriveHeatSegment[];
  linkBurstCooldownMs: number;
  /** Secilen seviye ozellikleri. */
  ucubePerks: UcubePerkId[];
  /** Secim bekleyen seviye; 0 ise bekleyen yok. */
  ucubePendingLevel: number;
  linkedTowerIds: string[];
  linkedTowerWaveAges: Record<string, number>;
  rangeMemoryEnemyIds: string[];
  streakDamageUntil: number;
  streakDamageMultiplier: number;
  streakHasteUntil: number;
  streakHasteMultiplier: number;
  zeynepFormationSize: number;
  zeynepFormationLevel: number;
  melisEvolutionLevel: number;
  melisUnderworldMode: "approval" | "stress";
  melisUnderworldTargetIds: string[];
  melisUnderworldPullCount: number;
  melisUnderworldChainLastAt: number;
  melisFocusUntil: number;
  melisFocusTargetId: string;
  melisFocusKillHasteUntil: number;
  melisMirrorCharge: number;
  facing: number;
  damageDealt: number;
  damageWindow: Array<{ dealtAt: number; amount: number }>;
  runModifiers: RunModifiers;
  targetedCardIds: string[];
  /** Bu kuleye takilmis magaza esyalari. Takilan esya sokulemez. */
  equippedShopItemIds: string[];
  targetingMode: TowerTargetingMode;
  shopKillStacks: number;
  shopWaveStacks: number;
  /** Cozulmus motor ve kilitler; `grantGeneration` degisince yeniden hesaplanir. */
  grantCache?: { generation: number; engine?: TowerEngineConfig; attackMultipliers: TowerAttackMultipliers; unlocks: Set<Unlock> };
  /** `surge` trigger etkisinin bitis zamani. */
  surgeUntil?: number;
  /** Gedik uyarisi yayildi mi; esik yukari asilinca duser. */
  breachAnnounced?: boolean;
  /** Kart kaynakli `activeSecond` stackleri icin ayri kesintisiz atis sayaci. */
  grantActiveMs?: number;
  /** Kart kaynakli `sameTarget` stackleri icin ayri hedef hafizasi. */
  grantTargetId?: string;
};

type RepairStructureMessage = { towerId?: string };
type HireWorkerMessage = { role?: HirableWorkerRole };
type ChooseUcubePerkMessage = { towerId?: string; perkId?: UcubePerkId };
type SetMelisStanceMessage = { stance?: MelisStance };
type ChooseCardMessage = { cardId?: string; towerId?: string };
type BuyShopItemMessage = { itemId?: string };
type SetTowerTargetingMessage = { towerId?: string; mode?: TowerTargetingMode };
type EquipShopItemMessage = { itemId?: string; towerId?: string };
type PlaceShopMapItemMessage = { itemId?: "bariyer" | "ziftli-zemin"; x?: number; y?: number };

type DebugOverdriveHeatSegment = {
  startedAt: number;
  endedAt: number;
};

type ProjectileModel = {
  id: string;
  towerId: string;
  definitionId: string;
  kind: ProjectileKind;
  damageType: DamageType;
  hitType: HitType;
  source: "tower";
  targetId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  maxHealthDamageRatio: number;
  aoeRadius: number;
  slowMs: number;
  pierceLimit: number;
  armorBreakAmount: number;
  piercedEnemyIds: string[];
};

type DroneModel = DroneSnapshot & {
  ownerId: string;
  targetId?: string;
  vx: number;
  vy: number;
  damage: number;
  repairAmount: number;
  ttlMs: number;
  logisticsPhase?: "pickup" | "deliver";
  extractionRemainingMs?: number;
  cargoAmmoType?: AmmoType;
};

type ToggleAmmoLogisticsMessage = {
  towerId?: string;
};

type SetTowerPerformanceMessage = {
  towerId?: string;
  performance?: number;
};

type BeamModel = BeamSnapshot & {
  ttlMs: number;
  delayMs?: number;
};

type MelisCursePoolModel = {
  id: string;
  ownerId: string;
  towerId: string;
  x: number;
  y: number;
  radius: number;
  burstDamage: number;
  evolutionLevel: number;
  expiresAt: number;
  affectedEnemyIds: Set<string>;
  lastAppliedAtByEnemyId: Map<string, number>;
};

type RaySegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
};

type ZeynepRayModel = {
  id: string;
  towerId: string;
  ownerId: string;
  segments: RaySegment[];
  segmentIndex: number;
  distanceOnSegment: number;
  x: number;
  y: number;
  speed: number;
  damage: number;
  abartiLevel: number;
  hitEnemyIds: string[];
};

type KinWaveModel = {
  id: string;
  towerId: string;
  ownerId: string;
  sourceDefinitionId: string;
  x: number;
  y: number;
  angle: number;
  halfAngle: number;
  distance: number;
  range: number;
  speed: number;
  bandDepth: number;
  slowMs: number;
  pushbackDistance: number;
  abartiLevel: number;
  tipHoldSeconds: number;
  hitEnemyIds: string[];
};

type TowerOrientation = NonNullable<TowerSnapshot["orientation"]>;

type BurnZoneModel = {
  id: string;
  ownerId: string;
  towerId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  radius: number;
  damage: number;
  damageType: DamageType;
  expiresAt: number;
  nextTickAt: number;
};

type DamageEventModel = DamageEventSnapshot & {
  ttlMs: number;
};

type KillEventModel = KillEventSnapshot & {
  ttlMs: number;
};

type ServerPerfCounters = {
  targetSearches: number;
  targetChecks: number;
  aoeChecks: number;
  chainChecks: number;
  damageEvents: number;
};

type ServerPerfFrame = ServerPerfCounters & {
  tickMs: number;
  spawnMs: number;
  towersMs: number;
  projectilesMs: number;
  enemiesMs: number;
  cooldownsMs: number;
  ultimatesMs: number;
  snapshotMs: number;
  snapshotBytes: number;
};

const pathSegments = MAP_PATH.slice(0, -1).map((point, index) => {
  const next = MAP_PATH[index + 1];
  const length = Math.hypot(next.x - point.x, next.y - point.y);

  return { from: point, to: next, length };
});

const totalPathLength = pathSegments.reduce((total, segment) => total + segment.length, 0);

type RuntimePath = {
  points: Array<{ x: number; y: number }>;
  segments: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; length: number }>;
  totalLength: number;
};

type ZeynepCommandTier = "small" | "medium" | "big";
type ZeynepCommandType = "haste" | "range" | "slow";
type ZeynepSynthesisMode = "dual-projectile" | "mirror-beam" | "burn-impact" | "copy-projectile" | "copy-showcase" | "kin-wave" | "kin-projectile" | "kin-showcase";
type ZeynepSynthesisComposition = {
  mode?: ZeynepSynthesisMode;
  hizaCount: number;
  showcaseCount: number;
  kinCount: number;
  linkedTowers: TowerModel[];
  synthesisTowerCount: number;
  copySourceTower?: TowerModel;
};

export class MatchRoom extends Room<MatchState> {
  towerDamageRandom: () => number = Math.random;
  towerCriticalRandom: () => number = Math.random;
  static rooms = new Map<string, MatchRoom>();
  static publicRooms = new Map<string, MatchRoom>();

  static listPublicRooms(): RoomListingSnapshot[] {
    return Array.from(MatchRoom.publicRooms.values())
      .filter((room) => room.hasJoinableSeat())
      .map((room) => room.toRoomListing())
      .filter((room) => room.playerCount > 0 || room.started)
      .sort((left, right) => left.roomName.localeCompare(right.roomName, "tr"));
  }

  static async prepareSingleRoomSlot(nextRoomId: string) {
    for (const room of MatchRoom.rooms.values()) {
      if (room.roomId === nextRoomId) {
        continue;
      }

      if (room.getConnectedPlayerCount() > 0) {
        throw new Error("Zaten aktif bir oda var.");
      }
    }

    const emptyRooms = Array.from(MatchRoom.rooms.values()).filter((room) => {
      return room.roomId !== nextRoomId && room.getConnectedPlayerCount() === 0;
    });
    await Promise.all(emptyRooms.map((room) => room.disconnect()));
  }

  maxClients = 4;
  autoDispose = false;
  private enemies = new Map<string, EnemyModel>();
  private readonly enemySpatialGrid = new SpatialGrid<EnemyModel>(128);
  private towers = new Map<string, TowerModel>();
  private projectiles = new Map<string, ProjectileModel>();
  private drones = new Map<string, DroneModel>();
  private beams = new Map<string, BeamModel>();
  private zeynepRays = new Map<string, ZeynepRayModel>();
  private kinWaves = new Map<string, KinWaveModel>();
  private burnZones = new Map<string, BurnZoneModel>();
  private melisCursePools = new Map<string, MelisCursePoolModel>();
  private damageEvents = new Map<string, DamageEventModel>();
  private killEvents = new Map<string, KillEventModel>();
  private playerKillStreakTimes = new Map<string, number[]>();
  private playerKillStreakLocks = new Map<string, Map<KillStreakTier, KillStreakLock>>();
  private melisFavoriteTowerIds = new Map<string, string[]>();
  private nextEnemyId = 1;
  private nextTowerId = 1;
  private nextProjectileId = 1;
  private nextDroneId = 1;
  private nextBeamId = 1;
  private nextZeynepRayId = 1;
  private nextKinWaveId = 1;
  private nextBurnZoneId = 1;
  private nextMelisCursePoolId = 1;
  private nextDamageEventId = 1;
  private nextKillEventId = 1;
  private teamHealth = MAX_TEAM_HEALTH;
  private wave = 1;
  private kills = 0;
  private waveSpawned = 0;
  /** Dalganin temizlendigi an (duvar saati). 0 ise dalga henuz temiz degil. */
  private waveClearedAt = 0;
  private waveTarget = getWaveEnemyCount(1);
  private spawnCooldownMs = 500;
  private projectileGuidanceUntil = 0;
  private projectileGuidanceX = GAME_WORLD_WIDTH / 2;
  private projectileGuidanceY = GAME_WORLD_HEIGHT / 2;
  private silentModeUntil = 0;
  private damageHasteUntil = 0;
  private zeynepHasteUntil = 0;
  private zeynepHasteMultiplier = 1;
  private zeynepHasteTier: ZeynepCommandTier = "small";
  private zeynepRangeUntil = 0;
  private zeynepRangeMultiplier = 1;
  private zeynepRangeTier: ZeynepCommandTier = "small";
  private zeynepSlowUntil = 0;
  private zeynepSlowMultiplier = 1;
  private zeynepSlowTier: ZeynepCommandTier = "small";
  private melisGothicNightmareUntil = 0;
  private melisGothicNightmareOwnerUntil = new Map<string, number>();
  private sympathyUntil = 0;
  private sympathyLinks: SympathyLink[] = [];
  /** Sempati kanamasi dusman basina bir kez; ulti bitince liste sifirlanir. */
  private sympathyBledEnemyIds = new Set<string>();
  private activeMap: EditableMapData = createDefaultEditableMap();
  private activePaths: RuntimePath[] = buildRuntimePaths(this.activeMap);
  /**
   * Nexusa dogru tek akis alani.
   *
   * Yonlendirmenin kendisi artik dusmanin kafasinda (kor gezinme), ama uyari
   * butun haritaya bakmak zorunda. Yapi degisince bir kez cozulur.
   */
  private mainGateDirty = true;
  /**
   * Turu kapanmis duvar girisleri; yapi degisince temizlenir.
   *
   * Bir hucreden duvari tutmaya baslayip ayni yere donen dusman, o hucreden
   * asagi cikis olmadigini ogrenmis olur. Bu bilgi ortak: arkadan gelen ayni
   * turu bastan atmaz, dogrudan kirmaya baslar.
   *
   * Hucreyi gecilmez isaretlemek olurdu **en yanlis** cozum: orasi acik zemin,
   * kapali olan sey oradan baslayan yol. Kapatmak hayalet duvar yaratir ve
   * dusmanlari hattan uzaklastirir.
   */
  private sealedCells = new Set<string>();
  /** Surunun en son hangi hucrede yogunlastigi; kayma uyarisi buna bakar. */
  private lastMainGate?: { col: number; row: number };
  /** Hucre -> kule; dogrusal `getTowerAtCell` taramasinin yerine gecer. */
  private towerCellIndex = new Map<string, TowerModel>();
  private towerCellIndexDirty = true;
  /** Kenar -> yapi; kare kaplamayan yapilar burada tutulur. */
  private edgeStructureIndex = new Map<string, TowerModel>();
  private edgeStructureIndexDirty = true;

  /** Yapi eklendi, yikildi, satildi ya da harita degisti. */
  private markNavigationDirty() {
    this.mainGateDirty = true;
    this.towerCellIndexDirty = true;
    this.edgeStructureIndexDirty = true;
    // Yapi degisti: kapali sanilan bir cikis acilmis olabilir. Hafizayi
    // korumak, oyuncunun actigi gecidi dusmanlarin gormemesi demek olurdu.
    this.sealedCells.clear();
  }

  /**
   * Hucre indeksi kendi kendini tazeler.
   *
   * Once yalnizca akis alani icinde kuruluyordu; indeksi baska bir yerden
   * okuyan kod bayat veri goruyordu. Tazelenmeyi okuma noktasina baglamak bu
   * hata sinifini tumden kapatir.
   */
  private getTowerCellIndex() {
    if (!this.towerCellIndexDirty) {
      return this.towerCellIndex;
    }

    this.towerCellIndex.clear();
    for (const tower of this.towers.values()) {
      // Kenara oturan yapilar kare kaplamaz; hucre indeksine girmezler.
      if (tower.definition.engine?.placement?.requiresEdge) continue;
      for (const cell of this.getTowerFootprintCells(tower.x, tower.y, tower.definition.id, tower.orientation)) {
        this.towerCellIndex.set(`${cell.col}:${cell.row}`, tower);
      }
    }
    this.towerCellIndexDirty = false;
    return this.towerCellIndex;
  }

  /**
   * Kenar -> yapi indeksi.
   *
   * Kenara oturan yapilarin bedeli hucreye degil gecise ait. Akis alani bunu
   * bilmezse kenardaki duvar yonlendirme hesabina hic girmez ve huni yalnizca
   * kagit uzerinde kalir.
   */
  private getEdgeStructureIndex() {
    if (!this.edgeStructureIndexDirty) {
      return this.edgeStructureIndex;
    }

    this.edgeStructureIndex.clear();
    for (const tower of this.towers.values()) {
      if (!tower.definition.engine?.placement?.requiresEdge || tower.hp <= 0) continue;
      for (const segment of this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation, this.getEdgeLength(tower.definition.id))) {
        this.edgeStructureIndex.set(`${segment.orientation}:${segment.col}:${segment.row}`, tower);
      }
    }
    this.edgeStructureIndexDirty = false;
    return this.edgeStructureIndex;
  }

  /** Iki komsu hucre arasindaki gecise oturmus yapi. */
  private getEdgeStructure(from: { col: number; row: number }, to: { col: number; row: number }) {
    const index = this.getEdgeStructureIndex();
    if (from.row === to.row) {
      return index.get(`vertical:${Math.max(from.col, to.col)}:${from.row}`);
    }
    if (from.col === to.col) {
      return index.get(`horizontal:${from.col}:${Math.max(from.row, to.row)}`);
    }
    return undefined;
  }

  /**
   * Surunun ana kapisi degistiginde oyuncuyu uyarir.
   *
   * Gedik uyarisi tek bir yapiyi haber verir; bu ise kutlenin nereye aktigini.
   * Hattin obur ucunda acilan bir delik butun dalgayi oraya cekebilir ve oyuncu
   * kill box'ini bosa kurmus olur. Uyari sunucudan gelir; istemcinin akis alanini
   * gormedigi icin bunu tahmin etmesi zaten mumkun degil.
   *
   * Ana kapi, ust siradaki her hucreden dusmanin kendi kuralini kosarak
   * bulunur -- sutun basina iki yuruyus, her biri en fazla harita kadar adim.
   */
  private announceFlowShift() {
    this.mainGateDirty = false;
    const gate = this.findMainGateCell();
    const previous = this.lastMainGate;
    this.lastMainGate = gate;

    // Acik haritada yogunlasma noktasi yoktur; gosterecek bir yer olmadan
    // uyari yaymak anlamsiz. Ilk huni olustugunda ise kayma gercektir.
    if (!gate) return;
    if (previous && previous.col === gate.col && previous.row === gate.row) return;

    const world = gridToWorld(gate.col, gate.row, this.activeMap);
    this.broadcast("flow:shift", {
      from: previous ?? null,
      to: gate,
      x: Math.round(world.x),
      y: Math.round(world.y)
    });
  }

  /**
   * Surunun yogunlastigi hucre.
   *
   * Kor gezinmede "en kisa yol" diye bir sey yok, ama huni yine olusur: bir
   * duvarin tek gedigi, iki yandan gelen yuruyuslerin ortak noktasidir. Bunu
   * bulmanin tek durust yolu dusmanin kendi kuralini kosmak -- her sutundan,
   * iki elle de yurutup hangi hucrenin en cok cignendigine bakmak. Alani
   * cozup "surunun oraya akmasi gerekirdi" demek artik yalan olurdu.
   *
   * Esitlikte satir-oncelikli dusuk indeks kazanir, boylece uyari belirlenimli.
   */
  private findMainGateCell() {
    const visits = new Map<string, { col: number; row: number; count: number }>();
    const exitRow = this.activeMap.rows - 1;
    const limit = this.activeMap.cols * this.activeMap.rows;
    const hands: BlindHand[] = ["left", "right"];

    for (let col = 0; col < this.activeMap.cols; col += 1) {
      for (const hand of hands) {
        let cell = { col, row: 0 };
        let state = createBlindNavigatorState(hand);
        for (let step = 0; step < limit; step += 1) {
          if (cell.row === exitRow) break;
          // Baslangic satiri her yuruyuste farkli, cikis satiri her yuruyuste ayni;
          // ikisi de nerede sikistigini soylemez.
          if (cell.row > 0) {
            const key = `${cell.col}:${cell.row}`;
            const entry = visits.get(key) ?? { col: cell.col, row: cell.row, count: 0 };
            entry.count += 1;
            visits.set(key, entry);
          }

          const result = stepBlindNavigator(cell, state, (c, r) => this.isCellWalkable(cell, c, r), () => hand);
          state = result.state;
          if (result.kind !== "move") break;
          cell = { col: result.col, row: result.row };
        }
      }
    }

    let best: { col: number; row: number } | undefined;
    // Bos haritada her hucreyi yalnizca kendi sutununun iki yuruyusu ciger;
    // esik bu yuzden el sayisi. Altinda kalan sey huni degil, duz inis.
    let bestCount = hands.length;
    for (const entry of [...visits.values()].sort((a, b) => (a.row - b.row) || (a.col - b.col))) {
      if (entry.count > bestCount) {
        bestCount = entry.count;
        best = { col: entry.col, row: entry.row };
      }
    }
    return best;
  }
  private lobbyRoomName = "Yeni Oda";
  private mapScale: MapScale = DEFAULT_MAP_SCALE;
  private hostSessionId = "";
  private gameStarted = false;
  private setupPhase = true;
  private matchResult?: "victory" | "defeat";
  private setupReadyPlayerIds = new Set<string>();
  private pendingCardChoices = new Map<string, CardDefinition[]>();
  private shopPlacementCharges = new Map<string, { bariyer: number; "ziftli-zemin": number }>();
  private tarredCells = new Set<string>();
  private debrisCells = new Map<string, number>();
  private autoStartOnFirstJoin = false;
  private serverLinkWaveAgeCache = new Map<string, number>();
  private lastSnapshotBroadcastAt = 0;
  private lastPerfBroadcastAt = 0;
  private lastSnapshotSizeSampleAt = 0;
  private snapshotBroadcastTimes: number[] = [];
  private perfCounters: ServerPerfCounters = this.createPerfCounters();
  private perfFrames: ServerPerfFrame[] = [];
  private latestPerfSnapshot: ServerPerfSnapshot = {
    tickMs: 0,
    tickMaxMs: 0,
    snapshotBytes: 0,
    snapshotHz: 0,
    sections: {
      spawnMs: 0,
      towersMs: 0,
      projectilesMs: 0,
      enemiesMs: 0,
      cooldownsMs: 0,
      ultimatesMs: 0,
      snapshotMs: 0
    },
    ops: {
      targetSearches: 0,
      targetChecks: 0,
      aoeChecks: 0,
      chainChecks: 0,
      damageEvents: 0
    }
  };

  async onCreate(options: JoinOptions = {}) {
    // Mobile networks and a waking/deploying Fly machine can take longer than
    // Colyseus' 15-second default between matchmaking and WebSocket upgrade.
    this.setSeatReservationTime(45);
    await MatchRoom.prepareSingleRoomSlot(this.roomId);
    MatchRoom.rooms.set(this.roomId, this);

    this.setState(new MatchState());
    this.lobbyRoomName = this.getRoomName(options.roomName);
    this.autoStartOnFirstJoin = options.autoStart === true;
    const baseMap = normalizeMapData(options.mapData);
    this.mapScale = this.getMapScaleChoice(options.mapScale ?? baseMap.scale);
    this.activeMap = scaleEditableMap(baseMap, this.mapScale);
    this.activePaths = buildRuntimePaths(this.activeMap);
    this.markNavigationDirty();
    this.waveTarget = this.getScaledWaveEnemyCount(this.wave);
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    this.onMessage("lobby:setCharacter", (client, message: { characterId?: CharacterId }) => {
      this.setLobbyCharacter(client, message.characterId);
    });

    this.onMessage("lobby:setReady", (client, message: { ready?: boolean }) => {
      this.setLobbyReady(client, message.ready);
    });

    this.onMessage("lobby:start", (client) => {
      this.startLobbyMatch(client);
    });

    this.onMessage("placeTower", (client, message: PlaceTowerMessage) => {
      if (!this.gameStarted) {
        return;
      }
      this.placeTower(client, message);
    });

    this.onMessage("upgradeTower", (client, message: UpgradeTowerMessage) => {
      if (!this.gameStarted) {
        return;
      }
      this.upgradeTower(client, message);
    });

    this.onMessage("sellTower", (client, message: SellTowerMessage) => {
      if (!this.gameStarted) {
        return;
      }
      this.sellTower(client, message);
    });

    this.onMessage("equipShopItem", (client, message: EquipShopItemMessage) => {
      if (!this.gameStarted) {
        return;
      }
      this.equipShopItem(client, message);
    });

    this.onMessage("useSkill", (client, message: UseSkillMessage) => {
      if (!this.gameStarted) {
        return;
      }
      this.useSkill(client, message);
    });

    this.onMessage("useUltimate", (client, message: UseUltimateMessage) => {
      if (!this.gameStarted) {
        return;
      }
      this.useUltimate(client, message);
    });

    this.onMessage("linkServer", (client, message: LinkServerMessage) => {
      if (!this.gameStarted) {
        return;
      }
      this.linkServerTower(client, message);
    });

    this.onMessage("setTowerMode", (client, message: TowerModeMessage) => {
      if (!this.gameStarted) {
        return;
      }
      this.setTowerMode(client, message);
    });

    this.onMessage("toggleAmmoLogistics", (client, message: ToggleAmmoLogisticsMessage) => {
      const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
      if (this.gameStarted && tower && tower.ownerId === client.sessionId && !tower.definition.resourceProvider) {
        tower.ammoLogisticsEnabled = !tower.ammoLogisticsEnabled;
      }
    });

    this.onMessage("setTowerPerformance", (client, message: SetTowerPerformanceMessage) => {
      const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
      if (this.gameStarted && tower && tower.ownerId === client.sessionId && !tower.definition.resourceProvider && typeof message.performance === "number") {
        tower.performance = Math.max(0, Math.min(1, message.performance));
      }
    });

    this.onMessage("latency:ping", (client, message: PingMessage) => {
      const serverAt = Date.now();
      const processingStartedAt = performance.now();
      client.send("latency:pong", {
        sentAt: typeof message.sentAt === "number" ? message.sentAt : Date.now(),
        serverAt,
        serverProcessingMs: roundMetric(performance.now() - processingStartedAt),
        bufferedAmount: getClientBufferedAmount(client)
      });
    });

    this.onMessage("wave:continue", (client) => {
      this.markSetupReady(client);
    });
    this.onMessage("card:choose", (client, message: ChooseCardMessage) => {
      this.chooseCard(client, message);
    });
    this.onMessage("snapshot:requestFull", (client) => this.sendFullStaticSnapshot(client));
    this.onMessage("card:sync", (client) => this.sendPendingCardChoices(client));
    this.onMessage("shop:buy", (client, message: BuyShopItemMessage) => this.buyShopItem(client, message));
    this.onMessage("shop:reroll", (client) => this.rerollShop(client));
    this.onMessage("structure:repair", (client, message: RepairStructureMessage) => this.repairStructure(client, message));
    this.onMessage("worker:hire", (client, message: HireWorkerMessage) => this.hireWorker(client, message));
    this.onMessage("ultimate:upgrade", (client) => this.upgradeUltimatePower(client));
    this.onMessage("ucube:choose", (client, message: ChooseUcubePerkMessage) => this.chooseUcubePerk(client, message));
    this.onMessage("melis:stance", (client, message: SetMelisStanceMessage) => this.setMelisStance(client, message));
    this.onMessage("tower:targeting", (client, message: SetTowerTargetingMessage) => this.setTowerTargeting(client, message));
    this.onMessage("shop:place", (client, message: PlaceShopMapItemMessage) => this.placeShopMapItem(client, message));

    this.syncRoomRegistry();
  }

  onJoin(client: Client, options: JoinOptions) {
    if (this.gameStarted) {
      this.joinStartedMatch(client, options);
      return;
    }

    const player = new Player();
    player.name = options.playerName?.slice(0, 20) || "Oyuncu";
    player.characterId = this.getAvailableCharacterId(options.characterId);
    player.ready = false;
    player.connected = true;
    player.gold = getPlayerStartGold(player.characterId);
    this.initializeMelisSpectrum(player);

    this.state.players.set(client.sessionId, player);
    if (!this.hostSessionId) {
      this.hostSessionId = client.sessionId;
    }

    if (this.autoStartOnFirstJoin && this.state.players.size === 1) {
      player.ready = true;
      this.configureArenaForScale();
      this.gameStarted = true;
      client.send("match:map", this.activeMap);
      this.syncRoomRegistry();
      return;
    }

    this.sendLobbyState(client);
    this.broadcastLobbyState();
  }

  async onLeave(client: Client, consented = false) {
    const player = this.state.players.get(client.sessionId);
    if (this.gameStarted && player) {
      player.connected = false;
      this.broadcastLobbyState();

      if (!consented) {
        try {
          const reconnectedClient = await this.allowReconnection(client, 20);
          player.connected = true;
          this.sendMatchResumeState(reconnectedClient);
          this.broadcastLobbyState();
          return;
        } catch {
          // The reconnect window expired. Keep the player slot available for
          // the existing started-match fallback in joinStartedMatch().
        }
      }

      this.tryFinishSetupPhase();
      return;
    }

    this.state.players.delete(client.sessionId);
    if (this.hostSessionId === client.sessionId) {
      this.hostSessionId = this.state.players.keys().next().value ?? "";
    }
    this.broadcastLobbyState();
  }

  private joinStartedMatch(client: Client, options: JoinOptions) {
    const disconnectedEntry = Array.from(this.state.players.entries()).find(([, player]) => !player.connected);
    if (disconnectedEntry) {
      const [previousSessionId, player] = disconnectedEntry;
      this.transferPlayerSession(previousSessionId, client.sessionId, player, options.playerName);
      this.sendMatchResumeState(client);
      this.syncRoomRegistry();
      return;
    }

    if (this.state.players.size >= this.maxClients) {
      throw new Error("Oda dolu.");
    }

    const player = new Player();
    player.name = options.playerName?.slice(0, 20) || "Oyuncu";
    player.characterId = this.getAvailableCharacterId(options.characterId);
    player.ready = true;
    player.connected = true;
    player.gold = getPlayerStartGold(player.characterId);
    this.initializeMelisSpectrum(player);
    this.state.players.set(client.sessionId, player);
    this.sendLobbyState(client);
    client.send("match:map", this.activeMap);
    client.send("lobby:started", { roomId: this.roomId });
    this.syncRoomRegistry();
  }

  private transferPlayerSession(previousSessionId: string, nextSessionId: string, player: Player, playerName?: string) {
    this.state.players.delete(previousSessionId);
    player.connected = true;
    player.name = playerName?.slice(0, 20) || player.name;
    this.state.players.set(nextSessionId, player);
    if (this.setupReadyPlayerIds.delete(previousSessionId)) {
      this.setupReadyPlayerIds.add(nextSessionId);
    }

    if (this.hostSessionId === previousSessionId) {
      this.hostSessionId = nextSessionId;
    }

    for (const tower of this.towers.values()) {
      if (tower.ownerId === previousSessionId) {
        tower.ownerId = nextSessionId;
        tower.ownerName = player.name;
        this.broadcastTowerSpawn(tower);
      }
    }

    for (const drone of this.drones.values()) {
      if (drone.ownerId === previousSessionId) {
        drone.ownerId = nextSessionId;
      }
    }

    this.transferMapKey(this.playerKillStreakTimes, previousSessionId, nextSessionId);
    this.transferMapKey(this.playerKillStreakLocks, previousSessionId, nextSessionId);
    this.transferMapKey(this.melisFavoriteTowerIds, previousSessionId, nextSessionId);
    this.transferMapKey(this.melisGothicNightmareOwnerUntil, previousSessionId, nextSessionId);
    this.transferMapKey(this.pendingCardChoices, previousSessionId, nextSessionId);
    this.transferMapKey(this.shopPlacementCharges, previousSessionId, nextSessionId);
  }

  private sendMatchResumeState(client: Client) {
    this.sendLobbyState(client);
    client.send("match:map", this.activeMap);
    client.send("lobby:started", { roomId: this.roomId });
    this.sendPendingCardChoices(client);
  }

  private sendPendingCardChoices(client: Client) {
    const choices = this.pendingCardChoices.get(client.sessionId);
    if (choices) client.send("card:choices", choices);
  }

  onDispose() {
    MatchRoom.rooms.delete(this.roomId);
    MatchRoom.publicRooms.delete(this.roomId);
  }

  private setLobbyCharacter(client: Client, requestedCharacterId: CharacterId | undefined) {
    const player = this.state.players.get(client.sessionId);
    const characterId = this.getCharacterId(requestedCharacterId);
    if (!player) {
      return;
    }

    const takenByOtherPlayer = Array.from(this.state.players.entries()).some(([sessionId, candidate]) => {
      return sessionId !== client.sessionId && candidate.characterId === characterId;
    });
    if (takenByOtherPlayer) {
      client.send("lobby:error", { message: "Bu karakter zaten secildi." });
      return;
    }

    player.characterId = characterId;
    player.gold = getPlayerStartGold(player.characterId);
    this.initializeMelisSpectrum(player);
    player.ready = false;
    this.broadcastLobbyState();
  }

  private initializeMelisSpectrum(player: Player) {
    if (player.characterId !== "archer") {
      player.approval = 0;
      player.stress = 0;
      player.currentWaveApproval = 0;
      player.lastWaveApproval = -1;
      return;
    }

    if (player.approval <= 0 && player.stress <= 0) {
      player.approval = MELIS_INITIAL_APPROVAL;
      player.stress = MELIS_INITIAL_STRESS;
    }
  }

  private setLobbyReady(client: Client, ready: boolean | undefined) {
    const player = this.state.players.get(client.sessionId);
    if (!player) {
      return;
    }

    player.ready = Boolean(ready);
    this.broadcastLobbyState();
  }

  private startLobbyMatch(client: Client) {
    if (client.sessionId !== this.hostSessionId) {
      client.send("lobby:error", { message: "Sadece oda kurucusu baslatabilir." });
      return;
    }

    if (!this.canStartLobbyMatch()) {
      client.send("lobby:error", { message: "Baslatmak icin herkes hazir olmali." });
      return;
    }

    this.configureArenaForScale();
    this.gameStarted = true;
    this.setupPhase = true;
    this.setupReadyPlayerIds.clear();
    this.syncRoomRegistry();
    this.broadcastLobbyState();
    this.broadcast("match:map", this.activeMap);
    this.broadcast("lobby:started", {
      roomId: this.roomId
    });
  }

  private canStartLobbyMatch() {
    return this.state.players.size > 0 && Array.from(this.state.players.values()).every((player) => player.ready);
  }

  private sendLobbyState(client: Client) {
    client.send("lobby:state", this.getLobbyState());
  }

  private broadcastLobbyState() {
    this.broadcast("lobby:state", this.getLobbyState());
    this.syncRoomRegistry();
  }

  private getLobbyState(): LobbyStateSnapshot {
    return {
      roomId: this.roomId,
      roomName: this.lobbyRoomName,
      hostId: this.hostSessionId,
      mapScale: this.mapScale,
      started: this.gameStarted,
      maxPlayers: this.maxClients,
      players: Array.from(this.state.players.entries()).map(([id, player]) => ({
        id,
        name: player.name,
        characterId: player.characterId,
        ready: player.ready,
        isHost: id === this.hostSessionId,
        connected: player.connected
      }))
    };
  }

  private toRoomListing(): RoomListingSnapshot {
    const hostName = this.state.players.get(this.hostSessionId)?.name ?? "Kurucu";
    return {
      roomId: this.roomId,
      roomName: this.lobbyRoomName,
      hostName,
      playerCount: this.getConnectedPlayerCount(),
      maxPlayers: this.maxClients,
      mapScale: this.mapScale,
      started: this.gameStarted
    };
  }

  private syncRoomRegistry() {
    if (!this.roomId) {
      return;
    }

    if (this.state.players.size === 0 || !this.hasJoinableSeat()) {
      MatchRoom.publicRooms.delete(this.roomId);
      return;
    }

    MatchRoom.publicRooms.set(this.roomId, this);
  }

  private getConnectedPlayerCount() {
    return Array.from(this.state.players.values()).filter((player) => player.connected).length;
  }

  private hasJoinableSeat() {
    if (this.state.players.size === 0) {
      return false;
    }

    if (!this.gameStarted) {
      return this.state.players.size < this.maxClients;
    }

    return this.state.players.size < this.maxClients || Array.from(this.state.players.values()).some((player) => !player.connected);
  }

  private transferMapKey<T>(map: Map<string, T>, previousKey: string, nextKey: string) {
    const value = map.get(previousKey);
    if (value === undefined) {
      return;
    }

    map.delete(previousKey);
    map.set(nextKey, value);
  }

  private getMapWorldScale() {
    return getMapGridSize(this.activeMap) / TOWER_GRID_SIZE;
  }

  private scaleWorldDistance(value: number) {
    return value * this.getMapWorldScale();
  }

  private scaleWorldSpeed(value: number) {
    return value * this.getMapWorldScale();
  }

  private getScaledWaveEnemyCount(wave: number) {
    return getArenaWaveEnemyCount(wave, this.mapScale, this.state.players.size);
  }

  private getActiveWorldBounds() {
    return getMapWorldBounds(this.activeMap);
  }

  private awardGoldToPlayers(amount: number) {
    const gold = Math.max(0, Math.round(amount));
    if (gold <= 0) {
      return;
    }

    for (const player of this.state.players.values()) {
      player.gold += gold;
    }
  }

  private awardEnemyGold(enemy: EnemyModel) {
    const players = Array.from(this.state.players.values());
    if (players.length === 0) {
      return;
    }

    const share = Math.max(1, Math.round(enemy.reward * ENEMY_REWARD_MULTIPLIER));
    for (const player of players) {
      player.gold += share * getModifierMultiplier(player.runModifiers, "goldGain");
    }
  }

  private update(deltaTime: number) {
    if (!this.gameStarted) {
      this.syncRoomRegistry();
      return;
    }

    const gameDeltaTime = deltaTime * GAME_SPEED_MULTIPLIER;
    const seconds = gameDeltaTime / 1000;
    const frameStart = performance.now();
    const timings = {
      spawnMs: 0,
      towersMs: 0,
      projectilesMs: 0,
      enemiesMs: 0,
      cooldownsMs: 0,
      ultimatesMs: 0,
      snapshotMs: 0
    };

    this.perfCounters = this.createPerfCounters();

    let sectionStart = performance.now();
    this.updateSpawning(gameDeltaTime);
    this.refreshServerLinkWaveAgeCache();
    timings.spawnMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.enemySpatialGrid.rebuild(this.enemies.values());
    this.resetAuraSlows();
    this.updateTowers(gameDeltaTime);
    this.updateSympathy();
    this.updateHeatExchange(gameDeltaTime / 1000);
    timings.towersMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.updateProjectiles(seconds);
    this.updateZeynepRays(seconds);
    this.updateKinWaves(seconds);
    this.updateBurnZones();
    this.updateMelisCursePools();
    this.updateDrones(gameDeltaTime, seconds);
    this.updateBeams(gameDeltaTime);
    this.updateDamageEvents(gameDeltaTime);
    timings.projectilesMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.updateEnemies(seconds);
    timings.enemiesMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.updateSkillCooldowns(gameDeltaTime);
    timings.cooldownsMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.chargeUltimates(seconds);
    timings.ultimatesMs = performance.now() - sectionStart;

    const now = performance.now();
    const shouldBroadcastSnapshot = now - this.lastSnapshotBroadcastAt >= SNAPSHOT_SEND_INTERVAL_MS;
    let snapshot: WireGameSnapshot | undefined;
    let snapshotBytes = 0;
    if (shouldBroadcastSnapshot) {
      sectionStart = performance.now();
      snapshot = this.getSnapshot();
      timings.snapshotMs = performance.now() - sectionStart;
      if (SNAPSHOT_SIZE_METRICS_ENABLED && now - this.lastSnapshotSizeSampleAt >= SNAPSHOT_SIZE_SAMPLE_INTERVAL_MS) {
        snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
        this.lastSnapshotSizeSampleAt = now;
      }
      this.lastSnapshotBroadcastAt = now;
    }
    const tickMs = performance.now() - frameStart;

    this.recordPerfFrame({
      ...this.perfCounters,
      ...timings,
      tickMs,
      snapshotBytes
    });

    if (snapshot) {
      if (this.sendSnapshotWithBackpressure(snapshot)) {
        this.recordSnapshotBroadcast(now);
      }
    }
    if (now - this.lastPerfBroadcastAt >= PERF_SEND_INTERVAL_MS) {
      this.broadcast("perf:snapshot", this.latestPerfSnapshot);
      this.lastPerfBroadcastAt = now;
    }
  }

  private sendSnapshotWithBackpressure(snapshot: WireGameSnapshot) {
    let sent = false;
    for (const client of this.clients) {
      if (getClientBufferedAmount(client) > SNAPSHOT_BACKPRESSURE_LIMIT_BYTES) continue;
      client.send("snapshot", snapshot);
      sent = true;
    }
    return sent;
  }

  private sendFullStaticSnapshot(client: Pick<Client, "send">) {
    client.send("snapshot:full", createFullStaticSnapshot(this.enemies.values(), this.towers.values(), this.activeMap));
  }

  private broadcastEnemySpawn(enemy: EnemyModel) {
    this.broadcast("enemy:spawn", createStaticEnemySnapshot(enemy));
  }

  private broadcastTowerSpawn(tower: TowerModel) {
    this.broadcast("tower:spawn", createStaticTowerSnapshot(tower, TOWER_COOLING_PER_SECOND));
  }

  private broadcastProjectileSpawn(projectile: ProjectileModel) {
    if (!usesLinearBallistics(projectile.hitType)) return;
    const bounds = this.getActiveWorldBounds();
    const margin = this.scaleWorldDistance(80);
    if (projectile.x < bounds.left - margin || projectile.x > bounds.right + margin ||
        projectile.y < bounds.top - margin || projectile.y > bounds.bottom + margin) return;
    const payload: ProjectileSpawnSnapshot = {
      id: projectile.id,
      kind: projectile.kind,
      source: projectile.source,
      definitionId: projectile.definitionId,
      hitType: projectile.hitType,
      x: roundNetworkNumber(projectile.x),
      y: roundNetworkNumber(projectile.y),
      vx: roundNetworkNumber(projectile.vx),
      vy: roundNetworkNumber(projectile.vy),
      tier: this.getProjectileTier(projectile),
      spawnedAt: Date.now()
    };
    this.broadcast("projectile:spawn", payload);
  }

  /**
   * Merminin gorsel kademesi, atisi yapan kulenin seviyesinden.
   *
   * Kule satildiysa veya yikildiysa mermi havada kalabilir; o durumda kademe 1
   * kabul edilir. Kademe 1 yazilmaz cunku tel uzerinde varsayilan odur.
   */
  /**
   * Isinin gorsel kademesi.
   *
   * Mermideki kuralla ayni: kademe 1 yazilmaz, cunku telde varsayilan odur.
   * Kule satilmis olabilir -- o durumda kademe yok, isin sade cizilir.
   */
  private getBeamTier(towerId: string | undefined) {
    const tower = towerId ? this.towers.get(towerId) : undefined;
    if (!tower) return undefined;
    const tier = getTowerTier(tower.level);
    return tier === 1 ? undefined : tier;
  }

  private getProjectileTier(projectile: ProjectileModel) {
    const tower = projectile.towerId ? this.towers.get(projectile.towerId) : undefined;
    if (!tower) return undefined;
    const tier = getTowerTier(tower.level);
    return tier === 1 ? undefined : tier;
  }

  private removeProjectile(id: string, projectile: ProjectileModel) {
    this.projectiles.delete(id);
    if (usesLinearBallistics(projectile.hitType)) {
      this.broadcast("projectile:hit", {
        id,
        x: roundNetworkNumber(projectile.x),
        y: roundNetworkNumber(projectile.y),
        tier: this.getProjectileTier(projectile)
      });
    }
  }

  private updateSpawning(deltaTime: number) {
    if (this.state.players.size === 0 || this.teamHealth <= 0 || this.matchResult) {
      return;
    }

    if (this.setupPhase) {
      return;
    }

    if (this.waveSpawned >= this.waveTarget && this.enemies.size === 0) {
      // Bekleme burada, dalga kapanisinin hemen onunde duruyor: boylece hem kart
      // secimi hem de son dalgadaki zafer ekrani ayni gecikmeyi aliyor. Ikisi de
      // ayni ani paylasiyor -- oyuncunun son olumu gordugu an.
      const clearedFor = Date.now() - this.waveClearedAt;
      if (this.waveClearedAt === 0) {
        this.waveClearedAt = Date.now();
        return;
      }
      if (clearedFor < WAVE_CLEAR_PAUSE_MS) {
        return;
      }
      this.waveClearedAt = 0;

      this.applyMelisWaveStress();
      this.advanceWaveGrowth();
      this.resetTowerHeatAfterWave();
      if (this.wave >= FINAL_WAVE) {
        this.finishMatch("victory");
        return;
      }
      const completedWave = this.wave;
      this.wave += 1;
      this.waveSpawned = 0;
      this.waveTarget = this.getScaledWaveEnemyCount(this.wave);
      this.spawnCooldownMs = 950;
      this.awardGoldToPlayers(getWaveCompletionGold(completedWave));
      for (const [playerId, player] of this.state.players.entries()) {
        if (this.playerHasUnlock(playerId, "goldInterest")) player.gold += Math.min(60, Math.floor(player.gold * 0.08));
      }
      this.setupPhase = true;
      this.setupReadyPlayerIds.clear();
      for (const player of this.state.players.values()) player.shopOffers = [];
      this.offerWaveCards();
      return;
    }

    // Dalga henuz temiz degil. Sayaci sifirlamak sart: Melis bir dusmani kendi
    // tarafina cevirip geri koydugunda ya da son dusman bir sekilde yeniden
    // ortaya ciktiginda, yarim kalmis bekleme bir sonraki temizlenmede aninda
    // dolmus sayilirdi ve gecikme hic yasanmazdi.
    this.waveClearedAt = 0;

    if (this.waveSpawned >= this.waveTarget) {
      return;
    }

    if (this.melisGothicNightmareUntil > Date.now()) {
      return;
    }

    this.spawnCooldownMs -= deltaTime;
    if (this.spawnCooldownMs > 0) {
      return;
    }

    this.spawnEnemy();
    this.waveSpawned += 1;
    this.spawnCooldownMs = Math.max(310, 980 - this.wave * 34);
  }

  private configureArenaForScale() {
    const dimensions = [
      { cols: 12, rows: 18 },
      { cols: 15, rows: 27 },
      { cols: 20, rows: 32 },
      { cols: 23, rows: 36 }
    ][this.mapScale - 1];
    this.activeMap = createOpenArenaMap(dimensions.cols, dimensions.rows);
    this.activePaths = buildRuntimePaths(this.activeMap);
    this.markNavigationDirty();
    this.waveTarget = this.getScaledWaveEnemyCount(this.wave);
  }

  private markSetupReady(client: Client) {
    if (!this.gameStarted || !this.setupPhase || this.pendingCardChoices.has(client.sessionId)) {
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected) {
      return;
    }
    this.setupReadyPlayerIds.add(client.sessionId);
    this.tryFinishSetupPhase();
  }

  private offerWaveCards() {
    for (const [playerId, player] of this.state.players.entries()) {
      const towers = Array.from(this.towers.values()).filter((tower) => tower.ownerId === playerId).map((tower) => tower.definition);
      const choices = drawCards({ preferredAxes: getCharacterCardAxes(player.characterId), towers, ownedCardIds: player.ownedCardIds });
      if (choices.length === 0) {
        this.openPlayerSetupShop(playerId, player);
        continue;
      }
      this.pendingCardChoices.set(playerId, choices);
      this.clients.find((client) => client.sessionId === playerId)?.send("card:choices", choices);
    }
  }

  private chooseCard(client: Client, message: ChooseCardMessage) {
    const player = this.state.players.get(client.sessionId);
    const choices = this.pendingCardChoices.get(client.sessionId);
    const card = choices?.find((choice) => choice.id === message.cardId);
    if (!player || !choices) {
      client.send("card:rejected", { reason: "Bekleyen kart seçimi bulunamadı. Bağlantı yenileniyor olabilir." });
      return;
    }
    if (!card) {
      client.send("card:rejected", { reason: "Bu kart artık geçerli bir seçenek değil." });
      client.send("card:choices", choices);
      return;
    }
    if (card.scope.kind === "targeted") {
      const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
      if (!tower || tower.ownerId !== client.sessionId || tower.definition.resourceProvider || !canAcceptTargetedCard(tower.targetedCardIds)) {
        client.send("card:rejected", { reason: "Seçilen kule bu kartı alamıyor. Başka bir kule seç." });
        client.send("card:choices", choices);
        return;
      }
      tower.runModifiers.push(...card.effects);
      tower.targetedCardIds.push(card.id);
    } else {
      const previousHealthMultiplier = getModifierMultiplier(player.runModifiers, "towerHealth");
      player.runModifiers.push(...card.effects);
      const nextHealthMultiplier = getModifierMultiplier(player.runModifiers, "towerHealth");
      if (nextHealthMultiplier !== previousHealthMultiplier) {
        const ratio = nextHealthMultiplier / previousHealthMultiplier;
        for (const tower of this.towers.values()) {
          if (tower.ownerId !== client.sessionId) continue;
          tower.maxHp *= ratio;
          tower.hp *= ratio;
        }
      }
    }
    player.ownedCardIds.push(card.id);
    this.invalidateTowerGrants();
    this.pendingCardChoices.delete(client.sessionId);
    client.send("card:applied", { cardId: card.id });
    this.openPlayerSetupShop(client.sessionId, player);
  }

  private tryFinishSetupPhase() {
    if (!this.setupPhase) {
      return;
    }
    const connectedPlayerIds = Array.from(this.state.players.entries())
      .filter(([, player]) => player.connected)
      .map(([id]) => id);
    if (connectedPlayerIds.length > 0 && connectedPlayerIds.every((id) => this.setupReadyPlayerIds.has(id))) {
      this.setupPhase = false;
      this.setupReadyPlayerIds.clear();
      this.spawnCooldownMs = 350;
      for (const playerId of this.state.players.keys()) {
        if (this.ownerHasTowerUnlock(playerId, "bloodBank") && this.teamHealth > 5) this.teamHealth -= 5;
      }
    }
  }

  private resetTowerHeatAfterWave() {
    for (const tower of this.towers.values()) {
      tower.temperature = 0;
      tower.heatLocked = false;
    }
  }

  private finishMatch(result: "victory" | "defeat") {
    if (this.matchResult) {
      return;
    }
    this.matchResult = result;
    this.setupPhase = false;
    this.setupReadyPlayerIds.clear();
    this.broadcast(`match:${result}`, { result, wave: this.wave, kills: this.kills });
  }

  private spawnEnemy() {
    const roll = Math.random();
    // Kusatma dusmani erken dalgalarda yok: duvar meta'si once kurulsun, cezasi
    // sonra gelsin.
    const type: EnemyType = this.wave >= SIEGE_FIRST_WAVE && roll < SIEGE_SPAWN_RATIO
      ? "siege"
      : roll > 0.88 ? "brute" : roll > 0.66 ? "runner" : roll > 0.48 ? "shooter" : "grunt";
    const definition = getEnemyCombatDefinition(type);
    const race = getEnemyRaceForWave(this.wave);
    const isFlyingEnemy = shouldSpawnFlyingEnemy(this.wave, this.waveSpawned);
    const waveScale = getWaveHpMultiplier(this.wave);
    const airHealthMultiplier = isFlyingEnemy ? 0.25 : 1;
    const multiplayerHealth = 1 + Math.max(0, this.state.players.size - 1) * 0.45;
    const maxHp = getWaveEnemyMaxHp(definition.maxHp, this.wave, airHealthMultiplier) * multiplayerHealth;
    const maxShield = Math.round(definition.shield * waveScale * airHealthMultiplier * multiplayerHealth);
    const speed = this.scaleWorldSpeed((definition.speed + this.wave * 2.4) * ENEMY_MOVEMENT_SPEED_MULTIPLIER);
    const pathId = 0;
    const openSpawnColumns = Array.from({ length: this.activeMap.cols }, (_, col) => col)
      .filter((col) => !this.getTowerAtCell(col, 0));
    const spawnCol = openSpawnColumns[Math.floor(Math.random() * Math.max(1, openSpawnColumns.length))] ?? 0;
    const start = gridToWorld(spawnCol, 0, this.activeMap);
    const id = `e${this.nextEnemyId++}`;

    this.enemies.set(id, {
      id,
      type,
      race,
      x: start.x,
      y: start.y,
      hp: maxHp,
      maxHp,
      armor: definition.armor,
      healthRegenPerSecond: definition.healthRegenPerSecond * waveScale,
      shield: maxShield,
      maxShield,
      movementKind: isFlyingEnemy ? "air" : definition.movementKind,
      damageResistances: getEnemyDamageResistances(definition, race),
      hitTypeResistances: { ...definition.hitTypeResistances },
      statusResistances: { ...definition.statusResistances },
      statusEffects: {},
      statusTickAt: {},
      stackStates: {},
      abilities: isFlyingEnemy ? [...(definition.abilities ?? []), "flying"] : [...(definition.abilities ?? [])],
      speed,
      reward: definition.reward,
      attack: definition.attack,
      towerAttackCooldownMs: 0,
      pathDistance: 0,
      slowUntil: 0,
      auraSlowMultiplier: 1,
      kinSlowUntil: 0,
      kinSlowMultiplier: 1,
      fearUntil: 0,
      armorBrokenUntil: 0,
      dominatedUntil: 0,
      dominatedOwnerId: "",
      trackingStackUntil: [0, 0, 0],
      melisCurseLoad: 0,
      melisCurseBurstDamage: 0,
      melisCurseUntil: 0,
      melisCurseOwnerId: "",
      melisCurseTowerId: "",
      melisCurseEvolutionLevel: 0,
      melisDoubtStacks: 0,
      melisDoubtUntil: 0,
      melisDoubtHesitateUntil: 0,
      melisDoubtHasteUntil: 0,
      melisWhisperTurnedUntil: 0,
      melisWhisperTurnedOwnerId: "",
      melisWhisperTurnedSourceTowerId: "",
      melisWhisperTurnedEvolutionLevel: 0,
      melisWhisperTurnedAttackCooldownMs: 0,
      melisUndeadOwnerId: "",
      melisUndeadUntil: 0,
      melisUndeadAttackCooldownMs: 0,
      melisUndeadSourceTowerId: "",
      melisUnderworldVulnerableUntil: 0,
      melisUnderworldDamageTakenMultiplier: 1,
      activeMarkId: "",
      activeMarkAdd: 0,
      activeMarkUntil: 0,
      pathId
    });
    this.broadcastEnemySpawn(this.enemies.get(id)!);
  }

  private updateResourceFactories(seconds: number) {
    for (const tower of this.towers.values()) {
      if (tower.hp <= 0 || tower.definition.resourceProvider !== "ammunition" || tower.energy <= 0 || tower.rawAmmo <= 0 || tower.ammo >= tower.maxAmmo) {
        continue;
      }
      const production = Math.min(
        AMMO_FACTORY_RATE_PER_SECOND * seconds
          * getModifierMultiplier(this.getTowerRunModifiers(tower), "resourceProduction")
          * getModifierMultiplier(this.getTowerRunModifiers(tower), "ammoProduction"),
        tower.maxAmmo - tower.ammo,
        tower.energy / AMMO_FACTORY_ENERGY_PER_AMMO,
        tower.rawAmmo / AMMO_RAW_MATERIAL_PER_AMMO
      );
      tower.ammo += production;
      tower.energy = Math.max(0, tower.energy - production * AMMO_FACTORY_ENERGY_PER_AMMO);
      tower.rawAmmo = Math.max(0, tower.rawAmmo - production * AMMO_RAW_MATERIAL_PER_AMMO);
    }
  }

  private canTowerFire(tower: TowerModel) {
    const now = Date.now();
    if (tower.standby || tower.wakeReadyAt > now || tower.performance <= 0 || tower.heatLocked) return false;
    if (this.isTowerOnBackupLine(tower, now)) return true;
    return getTowerEnergyState(tower.energy, tower.energyDepletedAt, now) === "powered"
      && tower.ammo >= this.getTowerAmmoCost(tower) && tower.energy >= this.getTowerEnergyCost(tower);
  }

  /**
   * Yedek Hat: enerjisi kesilen kule kisa sure muhimmatla ates etmeyi surdurur.
   *
   * Enerji kesintisi normalde kuleyi aninda susturur. Bu kilit kesintiyi
   * oldurucu olmaktan cikarip yonetilebilir bir riske cevirir; bedeli baska bir
   * kaynagin, muhimmatin, daha hizli tukenmesi.
   */
  private isTowerOnBackupLine(tower: TowerModel, now: number) {
    return this.towerHasUnlock(tower, "energy:backupLine")
      && tower.energyDepletedAt > 0
      && now - tower.energyDepletedAt < BACKUP_LINE_DURATION_MS
      && tower.ammo >= BACKUP_LINE_AMMO_PER_SHOT;
  }

  /** Kilitlenen kulenin cevresine verdigi hasar. */
  private applyOverheatBurst(tower: TowerModel, now: number) {
    const radius = this.getTowerRange(tower);
    for (const enemy of this.getEnemiesNear(tower.x, tower.y, radius)) {
      this.damageEnemy(enemy, OVERHEAT_BURST_DAMAGE, 0, "unlock:overheat-burst", tower.ownerId, "fire", 0, tower.level, tower.id, "impact");
    }
    void now;
  }

  /** Muhimmati biten kulenin menzilindeki dusmanlari kanatmasi. */
  private applyAmmoEmptyBleed(tower: TowerModel, now: number) {
    const radius = this.getTowerRange(tower);
    for (const enemy of this.getEnemiesNear(tower.x, tower.y, radius)) {
      this.applyEnemyStatusEffect(enemy, AMMO_EMPTY_BLEED, now, { sourceTowerId: tower.id, sourceOwnerId: tower.ownerId });
    }
  }

  private getTowerAmmoCost(tower: TowerModel) {
    const modifiers = this.getTowerRunModifiers(tower);
    return calculateTowerAmmoCost(tower.definition, getTowerShotFuelModifierMultiplier(modifiers, "ammoCost"));
  }

  private consumeTowerResources(tower: TowerModel) {
    const now = Date.now();
    const hadAmmo = tower.ammo > 0;
    const wasHeatLocked = tower.heatLocked;
    const onBackupLine = this.isTowerOnBackupLine(tower, now);
    tower.ammo = Math.max(0, tower.ammo - (onBackupLine ? BACKUP_LINE_AMMO_PER_SHOT : this.getTowerAmmoCost(tower)));
    if (!onBackupLine) tower.energy = Math.max(0, tower.energy - this.getTowerEnergyCost(tower));
    const heat = this.getTowerShotHeat(tower);
    tower.temperature = Math.min(100, tower.temperature + heat);
    if (tower.temperature >= this.getTowerHeatLockThreshold(tower)) {
      tower.heatLocked = true;
    }
    if (hadAmmo && tower.ammo <= 0) {
      this.runTowerTriggers(tower, "ammoEmpty");
      if (this.towerHasUnlock(tower, "ammo:emptyBleed")) this.applyAmmoEmptyBleed(tower, now);
    }
    if (!wasHeatLocked && tower.heatLocked) {
      this.runTowerTriggers(tower, "overheat");
      if (this.towerHasUnlock(tower, "heat:overheatBurst")) this.applyOverheatBurst(tower, now);
    }
  }

  private getTowerEnergyCost(tower: TowerModel) {
    const modifiers = this.getTowerRunModifiers(tower);
    return calculateTowerShotEnergyCost(tower.definition, tower.performance, getTowerShotFuelModifierMultiplier(modifiers, "energyCost"));
  }

  private getTowerShotHeat(tower: TowerModel) {
    return calculateTowerShotHeat(tower.definition, tower.performance, this.getTowerSpecialHeatMultiplier(tower))
      * getModifierMultiplier(this.getTowerRunModifiers(tower), "heat");
  }

  private getTowerSpecialHeatMultiplier(_tower: TowerModel) {
    return 1;
  }

  private getTowerPerformanceAttackMultiplier(tower: TowerModel) {
    const performanceMultiplier = tower.performance * 2;
    // Termal Kutle yumusak tavani kaldirir: 50 derecenin ustunde atis hizi
    // dusmez. Karsiliginda kart sogumayi %60 kirptigi icin kule kilide daha
    // hizli kosar; takas gercek.
    if (this.towerHasUnlock(tower, "heat:thermalMass")) return performanceMultiplier;
    const heatMultiplier = tower.temperature <= 50 ? 1 : Math.max(0, (100 - tower.temperature) / 50);
    return performanceMultiplier * heatMultiplier;
  }

  /** Kulenin kilitlenme sicakligi. Kizgin Namlu hasari isiya baglar ve esigi indirir. */
  /**
   * Saniyede kac derece atiliyor.
   *
   * Radyator sicakla hizlanir: kule ne kadar isindiysa o kadar cok atar. Duz
   * bir sogutma artisindan farki, kisa patlamalari serbest birakip surekli
   * atesi yine cezalandirmasi -- egrinin sekli degisiyor, seviyesi degil.
   */
  private getTowerCoolingPerSecond(tower: TowerModel) {
    let cooling = TOWER_COOLING_PER_SECOND * getModifierMultiplier(this.getTowerRunModifiers(tower), "cooling");

    if (this.towerHasUnlock(tower, "heat:radiator")) {
      cooling *= 1 + (Math.max(0, tower.temperature) / 100) * RADIATOR_COOLING_BONUS_AT_MAX;
    }

    if (this.towerHasUnlock(tower, "heat:chargedCooling")) {
      // Soguma enerjiye baglanir: depo dolu tutuldugu surece odul, altina
      // dusuldugunde yalnizca odulun kesilmesi. Enerji hatti zaten ayakta
      // tutulan bir sey oldugu icin bu kart lojistige verilen emegi isi
      // tarafinda da odetir.
      const capacity = Math.max(1, tower.maxEnergy);
      if (tower.energy / capacity > CHARGED_COOLING_ENERGY_RATIO) {
        cooling *= 1 + CHARGED_COOLING_BONUS;
      }
    }

    if (this.towerHasUnlock(tower, "heat:emptyVent") && tower.ammo <= 0) {
      // Muhimmat bitince kule zaten susuyor; bu kart o olu zamani sogutmaya
      // cevirir ve "bilerek bosalt" diye bir oynanis acar.
      cooling *= EMPTY_VENT_COOLING_MULTIPLIER;
    }

    // Menzil sorgusu pahali oldugu icin en sona ve kilidin arkasina konuyor:
    // karti almamis bir kule bunun bedelini hic odemez.
    if (this.towerHasUnlock(tower, "heat:chillVent") && this.hasSlowedEnemyInRange(tower)) {
      cooling *= 1 + CHILL_VENT_COOLING_BONUS;
    }

    return cooling;
  }

  private hasSlowedEnemyInRange(tower: TowerModel) {
    const now = Date.now();
    for (const enemy of this.enemySpatialGrid.queryCircle(tower.x, tower.y, this.getTowerRange(tower))) {
      if (enemy.slowUntil > now) return true;
    }
    return false;
  }

  /**
   * Bitisik kuleler arasinda isi tasir.
   *
   * Sogutma gecisinden **sonra** ayri bir tur olarak calisir: cift halinde is
   * gordugu icin kule dongusunun ortasinda yapilirsa sonuc kulelerin islenme
   * sirasina baglanirdi.
   *
   * Bir adimda farkin en fazla yarisi tasinir; bu, iki kulenin birbirine isi
   * atip salinmasini imkansiz kilar. Iki kule de karti tasiyorsa alisveris iki
   * kez isler, yani hat ne kadar cok degistiriciyle orulurse o kadar hizli
   * esitlenir.
   */
  private updateHeatExchange(deltaSeconds: number) {
    const budget = HEAT_EXCHANGE_PER_SECOND * Math.max(0, deltaSeconds);
    if (budget <= 0) return;

    for (const tower of this.towers.values()) {
      if (tower.definition.resourceProvider || !this.towerHasUnlock(tower, "heat:exchange")) continue;
      for (const other of this.getAdjacentFriendlyTowers(tower)) {
        if (other.definition.resourceProvider) continue;
        const gap = tower.temperature - other.temperature;
        if (gap === 0) continue;
        const moved = Math.sign(gap) * Math.min(budget, Math.abs(gap) / 2);
        tower.temperature = Math.max(0, Math.min(100, tower.temperature - moved));
        other.temperature = Math.max(0, Math.min(100, other.temperature + moved));
      }
    }
  }

  /**
   * Kilitlenen kulenin hangi sicaklikta acildigi.
   *
   * Kilit esigiyle karistirilmamali: o, kulenin ne zaman kilitlendigini soyler.
   * Bu ise kilidin ne zaman kalktigini, yani cezanin ne kadar surdugunu.
   */
  private getTowerHeatReleaseThreshold(tower: TowerModel) {
    return this.towerHasUnlock(tower, "heat:quickRelease")
      ? QUICK_RELEASE_HEAT_RELEASE_THRESHOLD
      : TOWER_HEAT_UNLOCK_THRESHOLD;
  }

  private getTowerHeatLockThreshold(tower: TowerModel) {
    return this.towerHasUnlock(tower, "heat:runHot") ? RUN_HOT_HEAT_LOCK_THRESHOLD : 100;
  }

  private adjustIntervalForPerformanceAndHeat(tower: TowerModel, interval: number) {
    return interval / Math.max(0.01, this.getTowerPerformanceAttackMultiplier(tower));
  }

  private updateTowers(deltaTime: number) {
    const now = Date.now();
    this.updateResourceFactories(deltaTime / 1000);
    this.refreshZeynepFormations();
    for (const tower of this.towers.values()) {
      if (!tower.definition.resourceProvider) {
        tower.temperature = Math.max(0, tower.temperature - this.getTowerCoolingPerSecond(tower) * (deltaTime / 1000));
        if (tower.luckyWindowUntil > 0 && tower.luckyWindowUntil <= now) {
          tower.luckyWindowUntil = 0;
          tower.misfortune = 0;
        }
        if (tower.heatLocked && tower.temperature <= this.getTowerHeatReleaseThreshold(tower)) {
          tower.heatLocked = false;
        }
      }
      if (tower.hp <= 0) {
        continue;
      }
      if (tower.standby) {
        continue;
      }
      this.updateGrantedActiveSeconds(tower, deltaTime);
      if (tower.performance > 0 && shouldConsumeTowerOperatingEnergy(tower.definition, this.setupPhase, tower.standby)) {
        const upkeep = calculateTowerOperatingEnergy(tower.definition, deltaTime / 1000, getModifierMultiplier(this.getTowerRunModifiers(tower), "operatingEnergyCost"));
        tower.energy = Math.max(0, tower.energy - upkeep);
        if (tower.energy <= 0 && tower.energyDepletedAt <= 0) tower.energyDepletedAt = now;
        if (tower.energy > 0) tower.energyDepletedAt = 0;
        if (tower.wakeReadyAt > now) continue;
      }
      if (this.silentModeUntil > now) {
        continue;
      }

      if (tower.offlineUntil > now) {
        continue;
      }

      if (tower.overheatMs > 0) {
        tower.overheatMs = Math.max(0, tower.overheatMs - deltaTime);
        continue;
      }

      if (tower.definition.resourceProvider) {
        continue;
      }

      if (tower.definition.engine?.attack.executor === "orbit") {
        this.updateOrbitTower(tower, deltaTime / 1000, now);
        continue;
      }

      if (tower.definition.id === "archer-4") {
        tower.cooldownMs = Math.max(0, tower.cooldownMs - deltaTime);
        if (tower.cooldownMs <= 0) {
          if (!this.canTowerFire(tower)) {
            continue;
          }
          this.consumeTowerResources(tower);
          tower.cooldownMs = this.getTowerFireInterval(tower);
        }
        this.updateMelisUnderworldLink(tower, now, deltaTime / 1000);
        continue;
      }

      if (tower.definition.id === "archer-5" && tower.melisMirrorCharge >= this.getMelisBrokenMirrorCapacity(tower)) {
        const mirrorTarget = this.findMelisBrokenMirrorExplosionTarget(tower);
        const isAimedAtMirrorTarget = this.aimTowerAt(tower, mirrorTarget, deltaTime / 1000);
        if (mirrorTarget && isAimedAtMirrorTarget && this.canTowerFire(tower) && this.fireMelisBrokenMirrorExplosion(tower, mirrorTarget)) {
          this.consumeTowerResources(tower);
          tower.cooldownMs = this.getTowerFireInterval(tower);
        }
        continue;
      }

      tower.cooldownMs -= deltaTime;
      tower.linkBurstCooldownMs = Math.max(0, tower.linkBurstCooldownMs - deltaTime);

      if (tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > now) {
        // Vurus ani burada kararlasir ve supurmeye bildirilir. Supurme kendi
        // sayacina bakarsa hicbir zaman hasar vermez: sayac hemen yukarida
        // sifirlaniyor, yani asagida her zaman dolu gorunuyor. Kiris cizilir,
        // dusmanlar yurumeye devam eder.
        let firesThisTick = false;
        if (tower.cooldownMs <= 0) {
          if (!this.canTowerFire(tower)) {
            continue;
          }
          this.consumeTowerResources(tower);
          tower.cooldownMs = this.adjustIntervalForPerformanceAndHeat(tower, 220);
          firesThisTick = true;
        }
        this.updateDebugLaserSweep(tower, firesThisTick);
        continue;
      }

      if (tower.definition.id === "warrior-5" && tower.debugSweepStartedAt > 0) {
        tower.debugSweepStartedAt = 0;
        tower.debugSweepTargetIds = [];
        tower.debugSweepAngleAt = 0;
        tower.debugSweepLastDamageAt = 0;
        tower.debugOverdriveHeatLastAt = 0;
      }

      if (tower.definition.id === "warrior-2") {
        continue;
      }

      const activeAuras = this.getActiveTowerAuras(tower);
      if (activeAuras.length > 0) {
        if (!this.setupPhase && tower.cooldownMs <= 0 && this.canTowerFire(tower)) {
          this.consumeTowerResources(tower);
          const interval = this.getTowerAuraTickInterval(tower, activeAuras);
          const refreshMultiplier = Math.max(...activeAuras.map((aura) => aura.refreshDurationMultiplier ?? AURA_REFRESH_DURATION_MULTIPLIER));
          tower.cooldownMs = interval;
          tower.auraExpiresAt = now + interval * refreshMultiplier;
        }
        this.applyTowerEnemyAuras(tower, activeAuras);
        continue;
      }

      const target = this.findTowerTarget(tower);
      const isAimedAtTarget = this.aimTowerAt(tower, target, deltaTime / 1000);
      this.updateUcubeRhythm(tower, target, deltaTime);
      if (tower.cooldownMs > 0) {
        continue;
      }

      if (!target) {
        continue;
      }

      if (!isAimedAtTarget) {
        continue;
      }

      if (!this.canTowerFire(tower)) {
        continue;
      }

      this.consumeTowerResources(tower);
      this.spawnTowerProjectile(tower, target);
      if (tower.aimTargetId === target.id) {
        tower.aimTargetHasFired = true;
      }
      tower.cooldownMs = this.getTowerFireInterval(tower);
    }

    this.updateServerLinks();
  }

  private updateOrbitTower(tower: TowerModel, seconds: number, now: number) {
    for (const enemyId of tower.orbitLastHitAt.keys()) {
      if (!this.enemies.has(enemyId)) tower.orbitLastHitAt.delete(enemyId);
    }
    const attack = this.getTowerEngine(tower)?.attack;
    if (!attack || attack.executor !== "orbit" || this.setupPhase || tower.performance <= 0 || tower.heatLocked || tower.energy <= 0) return;
    // Taban hiz kulenin kendi bicak sayisindan hesaplanir; karttan gelen ek
    // bicaklar hizi degistirmez, ayni hizda daha sik gecis demektir.
    const baseRotationSpeed = getOrbitRotationSpeedForInterval(
      tower.definition.engine?.attack.bladeCount ?? 1,
      tower.definition.fireIntervalMs
    );
    const effectiveRotationSpeed = getOrbitRotationSpeed(baseRotationSpeed, tower.definition.fireIntervalMs, this.getTowerFireInterval(tower));
    if (effectiveRotationSpeed <= 0) return;

    const previousAngle = tower.bladeAngle;
    tower.bladeAngle = previousAngle + effectiveRotationSpeed * Math.max(0, seconds);
    const rotationRatio = effectiveRotationSpeed / Math.max(0.001, baseRotationSpeed);
    const costs = calculateOrbitContinuousCosts(rotationRatio, seconds);
    tower.energy = Math.max(0, tower.energy - costs.energy * getModifierMultiplier(this.getTowerRunModifiers(tower), "energyCost"));
    tower.temperature = Math.min(100, tower.temperature + costs.heat * getModifierMultiplier(this.getTowerRunModifiers(tower), "heat"));
    if (tower.energy <= 0 && tower.energyDepletedAt <= 0) tower.energyDepletedAt = now;
    if (tower.temperature >= this.getTowerHeatLockThreshold(tower)) tower.heatLocked = true;

    const bladeLength = this.getOrbitBladeLengthForTower(tower);
    const candidates = this.getEnemiesNear(tower.x, tower.y, bladeLength + this.scaleWorldDistance(32));
    const sweepQuery = {
      x: tower.x,
      y: tower.y,
      previousAngle,
      nextAngle: tower.bladeAngle,
      bladeCount: attack.bladeCount ?? 1,
      bladeLength,
      bladeWidth: this.scaleWorldDistance(attack.width ?? 1),
      canHitAir: tower.definition.engine?.canHitAir ?? false
    };
    const contactCandidates = candidates.map((enemy) => ({
      ...enemy,
      radius: getEnemyCollisionRadius(enemy)
    }));
    const contacts = selectOrbitSweepContacts(sweepQuery, contactCandidates);
    const hitCooldownMs = getOrbitTargetHitCooldownMs(attack.bladeCount ?? 1, effectiveRotationSpeed);
    for (const contact of contacts) {
      const lastHitAt = tower.orbitLastHitAt.get(contact.target.id) ?? Number.NEGATIVE_INFINITY;
      if (now - lastHitAt < hitCooldownMs) continue;
      const enemy = this.enemies.get(contact.target.id);
      if (!enemy) continue;
      tower.orbitLastHitAt.set(enemy.id, now);
      this.prepareOnurGamblerShot(tower);
      this.damageEnemyFromTower(tower, enemy, this.getTowerDamage(tower), 0);
    }
  }

  private getOrbitBladeLengthForTower(tower: TowerModel) {
    const baseRange = Math.max(1, this.scaleWorldDistance(tower.definition.range));
    const rangeMultiplier = this.getTowerRange(tower) / baseRange;
    const baseBladeLength = tower.definition.engine?.attack.bladeLength ?? tower.definition.range;
    return getOrbitBladeLength(this.scaleWorldDistance(baseBladeLength), rangeMultiplier);
  }

  /**
   * Records which way an aiming tower is pointing. Kept sticky: when the target
   * dies the muzzle holds its last bearing instead of snapping back to zero.
   */
  private aimTowerAt(tower: TowerModel, target: { x: number; y: number } | undefined, deltaSeconds: number) {
    if (!target) {
      return false;
    }
    if (!towerAims(tower.definition.id)) {
      return true;
    }
    const energyState = getTowerEnergyState(tower.energy, tower.energyDepletedAt, Date.now());
    if (energyState === "tracking-off" || energyState === "offline") return false;

    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    if (dx === 0 && dy === 0) {
      return true;
    }

    const targetAngle = Math.atan2(dy, dx);
    const turnRate = getModifierMultiplier(this.getTowerRunModifiers(tower), "turnRate") * TOWER_TURN_RATE_RADIANS_PER_SECOND;
    tower.facing = rotateTowerTowards(tower.facing, targetAngle, deltaSeconds, turnRate);
    const accuracyBonus = getModifierAdd(this.getTowerRunModifiers(tower), "accuracy");
    return isTowerAligned(tower.facing, targetAngle, getTowerFireAlignmentTolerance(accuracyBonus));
  }

  private spawnTowerProjectile(tower: TowerModel, target: EnemyModel) {
    this.prepareTowerShot(tower, target);
    switch (tower.definition.engine?.attack.executor ?? "ballistic") {
      case "debug-laser": this.fireDebugLaser(tower, target); return;
      case "showcase-beam": this.fireZeynepShowcaseBeam(tower); return;
      case "synthesis": this.fireZeynepSynthesis(tower, target); return;
      case "kin-wave": this.fireKinWave(tower, target); return;
      case "curse-burst": this.fireMelisCurse(tower, target); return;
      case "whisper-chorus": this.fireMelisWhisperChorus(tower, target); return;
    }

    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const launchAngle = towerAims(tower.definition.id) ? tower.facing : Math.atan2(dy, dx);
    const hitType = tower.definition.hitType ?? "projectile";
    const speed = this.scaleWorldSpeed(getBallisticMovementSpeed(
      (tower.definition.projectileSpeed + tower.level * 22) * this.getMelisFocusProjectileSpeedMultiplier(tower),
      hitType
    )) * getModifierMultiplier(this.getTowerRunModifiers(tower), "projectileSpeed");
    const id = `p${this.nextProjectileId++}`;

    this.projectiles.set(id, {
      id,
      towerId: tower.id,
      definitionId: tower.definition.id,
      kind: "tower",
      damageType: tower.definition.damageType ?? "physical",
      hitType,
      source: "tower",
      targetId: target.id,
      x: tower.x,
      y: tower.y,
      vx: usesLinearBallistics(hitType) ? Math.cos(launchAngle) * speed : (dx / length) * speed,
      vy: usesLinearBallistics(hitType) ? Math.sin(launchAngle) * speed : (dy / length) * speed,
      damage: this.getTowerDamage(tower),
      maxHealthDamageRatio: this.getServerLinkedMaxHealthDamageRatio(tower),
      aoeRadius: this.scaleWorldDistance(this.getTowerAoeRadius(tower) + (tower.level - 1) * 5),
      slowMs: getTowerSlowDurationMs(tower.definition) + (tower.level - 1) * 90,
      pierceLimit: this.getTowerEngine(tower)?.attack.pierceCount ?? 1,
      armorBreakAmount: getModifierAdd(this.getTowerRunModifiers(tower), "armorBreak"),
      piercedEnemyIds: []
    });
    this.broadcastProjectileSpawn(this.projectiles.get(id)!);
  }

  private spawnSpecialProjectile(sourceTower: TowerModel, definitionId: string, target: EnemyModel, damage: number, speed: number, aoeRadius: number, slowMs: number) {
    const dx = target.x - sourceTower.x;
    const dy = target.y - sourceTower.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const launchAngle = towerAims(sourceTower.definition.id) ? sourceTower.facing : Math.atan2(dy, dx);
    const hitType = sourceTower.definition.hitType ?? "impact";
    const scaledSpeed = this.scaleWorldSpeed(getBallisticMovementSpeed(speed, hitType))
      * getModifierMultiplier(this.getTowerRunModifiers(sourceTower), "projectileSpeed");
    const id = `p${this.nextProjectileId++}`;

    this.projectiles.set(id, {
      id,
      towerId: sourceTower.id,
      definitionId,
      kind: "tower",
      damageType: sourceTower.definition.damageType ?? "electric",
      hitType,
      source: "tower",
      targetId: target.id,
      x: sourceTower.x,
      y: sourceTower.y,
      vx: usesLinearBallistics(hitType) ? Math.cos(launchAngle) * scaledSpeed : (dx / length) * scaledSpeed,
      vy: usesLinearBallistics(hitType) ? Math.sin(launchAngle) * scaledSpeed : (dy / length) * scaledSpeed,
      damage,
      maxHealthDamageRatio: 0,
      aoeRadius: this.scaleWorldDistance(aoeRadius),
      slowMs,
      pierceLimit: 1,
      armorBreakAmount: getModifierAdd(this.getTowerRunModifiers(sourceTower), "armorBreak"),
      piercedEnemyIds: []
    });
    this.broadcastProjectileSpawn(this.projectiles.get(id)!);
  }

  private updateBeams(deltaTime: number) {
    for (const [id, beam] of this.beams) {
      if (beam.delayMs && beam.delayMs > 0) {
        beam.delayMs = Math.max(0, beam.delayMs - deltaTime);
        continue;
      }

      beam.ttlMs -= deltaTime;
      if (beam.ttlMs <= 0) {
        this.beams.delete(id);
      }
    }
  }

  private updateDamageEvents(deltaTime: number) {
    for (const [id, event] of this.damageEvents) {
      event.ttlMs -= deltaTime;
      if (event.ttlMs <= 0) {
        this.damageEvents.delete(id);
      }
    }

    for (const [id, event] of this.killEvents) {
      event.ttlMs -= deltaTime;
      if (event.ttlMs <= 0) {
        this.killEvents.delete(id);
      }
    }
  }

  private fireDebugLaser(tower: TowerModel, target: EnemyModel) {
    const now = Date.now();
    const baseDamage = this.getTowerDamage(tower);
    const wasTracked = this.getTrackingStackCount(target, now) > 0;
    const killed = this.damageEnemyFromTower(tower, target, baseDamage, getTowerSlowDurationMs(tower.definition));

    if (wasTracked && killed) {
      this.runTowerTriggers(tower, "kill", { target, conditions: ["targetMarked"], now });
      this.consumeConfiguredMarks(tower, target, "kill");
      return;
    }

    this.consumeConfiguredMarks(tower, target, "hit");

    this.setBeam(tower, target.x, target.y, false);
  }

  private startDebugLaserOverdrive(tower: TowerModel, target: EnemyModel, now: number) {
    tower.debugSweepStartedAt = now;
    tower.debugSweepTargetIds = this.getDebugLaserSweepTargetIds(tower);
    // Ilk kare bir donus degil, dogus: kiris zincirin basinda aciliyor.
    tower.debugSweepAngle = this.getDebugLaserSweepAngles(tower)[0] ?? tower.facing;
    tower.debugSweepAngleAt = now;
    tower.debugSweepDamageAngle = tower.debugSweepAngle;
    tower.debugSweepDamageAngleAt = 0;
    tower.debugSweepLastDamageAt = 0;
    tower.debugOverdriveHeatLastAt = now;
    tower.debugOverdriveUntil = now + scaleGameDuration(DEBUG_LASER_OVERDRIVE_DURATION_MS);
    this.updateDebugLaserSweep(tower);
  }

  private setBeam(tower: TowerModel, x2: number, y2: number, overdrive: boolean, scanX?: number, scanY?: number) {
    const ttlMs = overdrive ? Math.max(180, this.getTowerFireInterval(tower) + 90) : Math.max(260, this.getTowerFireInterval(tower) + 90);
    this.beams.set(`beam-${tower.id}`, {
      id: `beam-${tower.id}`,
      definitionId: tower.definition.id,
      x1: tower.x,
      y1: tower.y,
      x2,
      y2,
      scanX,
      scanY,
      width: overdrive ? 8 : 4,
      color: overdrive ? 0xfbbf24 : 0xfb7185,
      overdrive,
      ttlMs,
      tier: this.getBeamTier(tower.id)
    });
  }

  private setUcubeChainBeam(projectile: ProjectileModel, from: EnemyModel, to: EnemyModel) {
    const id = `chain-${projectile.id}-${this.nextBeamId++}`;
    this.beams.set(id, {
      id,
      definitionId: "warrior-6",
      tier: this.getBeamTier(projectile.towerId),
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      width: 5,
      color: 0x38bdf8,
      overdrive: false,
      ttlMs: 190
    });
  }

  private fireZeynepShowcaseBeam(tower: TowerModel, damageOverride?: number, definitionIdOverride?: string, damageTypeOverride?: DamageType) {
    const result = this.findBestZeynepShowcaseLine(tower);
    if (!result) {
      return;
    }

    const damage = damageOverride ?? this.getTowerDamage(tower);
    for (const enemy of result.targets) {
      if (damageTypeOverride) {
        this.damageEnemyFromTowerAs(tower, enemy, damage, 0, damageTypeOverride);
      } else {
        this.damageEnemyFromTower(tower, enemy, damage, 0);
      }
    }

    const id = `showcase-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(id, {
      id,
      definitionId: definitionIdOverride ?? tower.definition.id,
      tier: this.getBeamTier(tower.id),
      x1: tower.x,
      y1: tower.y,
      x2: result.endX,
      y2: result.endY,
      width: this.scaleWorldDistance(ZEYNEP_SHOWCASE_BEAM_RADIUS * 2),
      color: result.abartiLevel > 0 ? this.getAbartiDarkenedBeamColor(tower.definition.color, result.abartiLevel) : tower.definition.color,
      overdrive: false,
      ttlMs: 260
    });
  }

  private findBestZeynepShowcaseLine(tower: TowerModel, rangeMultiplier = 1) {
    const length = this.getTowerRange(tower) * rangeMultiplier;
    // Arama yaricapi hattin kendisinden genis: hedef menzilin ucunda dursa bile
    // hat onun uzerinden gecebilir.
    const enemies = this.getEnemiesNear(tower.x, tower.y, length * 1.5).filter((enemy) => this.canTowerTargetEnemy(tower, enemy));
    if (enemies.length === 0) {
      return undefined;
    }
    let best: { endX: number; endY: number; targets: EnemyModel[]; score: number; abartiLevel: number } | undefined;

    for (const enemy of enemies) {
      const dx = enemy.x - tower.x;
      const dy = enemy.y - tower.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1) {
        continue;
      }

      const endX = tower.x + (dx / distance) * length;
      const endY = tower.y + (dy / distance) * length;
      const abartiLevel = this.getAbartiPassThroughLevel(tower.ownerId, tower.x, tower.y, endX, endY);
      const rangeMultiplier = abartiLevel > 0 ? getAbartiShowcaseRangeMultiplier(abartiLevel) : 1;
      const finalEndX = tower.x + (dx / distance) * length * rangeMultiplier;
      const finalEndY = tower.y + (dy / distance) * length * rangeMultiplier;
      const targets = this.selectEnemiesForAttackShape({
        shape: tower.definition.engine?.attack.shape ?? "line",
        x: tower.x,
        y: tower.y,
        aimX: finalEndX,
        aimY: finalEndY,
        length: Math.hypot(finalEndX - tower.x, finalEndY - tower.y),
        width: this.scaleWorldDistance(ZEYNEP_SHOWCASE_BEAM_RADIUS),
        canHitAir: tower.definition.engine?.canHitAir ?? false
      }, enemies);
      const score = targets.length * 100000 + targets.reduce((total, target) => total + target.pathDistance, 0);
      if (!best || score > best.score) {
        best = { endX: finalEndX, endY: finalEndY, targets, score, abartiLevel };
      }
    }

    return best;
  }

  private getZeynepSynthesisComposition(tower: TowerModel): ZeynepSynthesisComposition {
    const formationGroup = this.getZeynepFormationGroup(tower);
    if (!isValidZeynepFormationGroup(formationGroup, getMapGridSize(this.activeMap)) || formationGroup.length !== 3) {
      return { hizaCount: 0, showcaseCount: 0, kinCount: 0, linkedTowers: [], synthesisTowerCount: formationGroup.filter((member) => member.definition.id === "zeynep-3").length };
    }

    const linkedTowers = formationGroup.filter((member) => member.id !== tower.id);
    const hizaCount = formationGroup.filter((member) => member.definition.id === "zeynep-1").length;
    const showcaseCount = formationGroup.filter((member) => member.definition.id === "zeynep-2").length;
    const kinCount = formationGroup.filter((member) => member.definition.id === "zeynep-6").length;
    const synthesisTowerCount = formationGroup.filter((member) => member.definition.id === "zeynep-3").length;
    const copySourceTower = synthesisTowerCount === 2
      ? formationGroup.find((member) => member.definition.id === "zeynep-1" || member.definition.id === "zeynep-2")
      : undefined;
    const mode = synthesisTowerCount === 2 && copySourceTower
      ? copySourceTower.definition.id === "zeynep-1" ? "copy-projectile" : "copy-showcase"
      : hizaCount === 2
        ? "dual-projectile"
        : showcaseCount === 2
          ? "burn-impact"
          : kinCount === 2
            ? "kin-wave"
            : hizaCount === 1 && showcaseCount === 1
              ? "mirror-beam"
              : hizaCount === 1 && kinCount === 1
                ? "kin-projectile"
                : showcaseCount === 1 && kinCount === 1
                  ? "kin-showcase"
                  : undefined;

    return { mode, hizaCount, showcaseCount, kinCount, linkedTowers, synthesisTowerCount, copySourceTower };
  }

  private getZeynepFormationGroup(tower: TowerModel) {
    const group = new Map<string, TowerModel>([[tower.id, tower]]);
    const queue = [tower];
    const gridSize = getMapGridSize(this.activeMap);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      for (const candidate of this.towers.values()) {
        if (group.has(candidate.id) || !canJoinZeynepFormation(candidate)) {
          continue;
        }

        if (!areZeynepFormationNeighbors(current, candidate, gridSize)) {
          continue;
        }

        group.set(candidate.id, candidate);
        queue.push(candidate);
      }
    }

    return Array.from(group.values());
  }

  private fireZeynepSynthesis(tower: TowerModel, target: EnemyModel) {
    const composition = this.getZeynepSynthesisComposition(tower);
    if (!composition.mode) {
      return;
    }

    if (composition.mode === "dual-projectile") {
      this.fireZeynepSynthesisDualProjectiles(tower);
      return;
    }

    if (composition.mode === "burn-impact") {
      this.fireZeynepSynthesisBurnImpact(tower, target);
      return;
    }

    if (composition.mode === "kin-wave") {
      this.fireKinWave(tower, target, {
        angleRadians: KIN_SYNTHESIS_WAVE_ANGLE_RADIANS,
        sourceDefinitionId: "zeynep-3-kin-wave",
        pushbackDistance: this.scaleWorldDistance(KIN_SYNTHESIS_PUSHBACK_DISTANCE)
      });
      return;
    }

    if (composition.mode === "kin-projectile") {
      this.fireZeynepSynthesisKinProjectile(tower, target);
      return;
    }

    if (composition.mode === "kin-showcase") {
      this.fireZeynepSynthesisKinShowcase(tower, target);
      return;
    }

    if (composition.mode === "copy-projectile" && composition.copySourceTower) {
      this.fireZeynepSynthesisCopiedProjectile(tower, target, composition.copySourceTower);
      return;
    }

    if (composition.mode === "copy-showcase" && composition.copySourceTower) {
      this.fireZeynepShowcaseBeam(tower, this.getTowerDamage(composition.copySourceTower), "zeynep-2", "light");
      return;
    }

    this.fireZeynepSynthesisMirrorBeam(tower, target);
  }

  private fireKinWave(
    tower: TowerModel,
    target: EnemyModel,
    options: { angleRadians?: number; sourceDefinitionId?: string; pushbackDistance?: number } = {}
  ) {
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const angle = Math.atan2(dy, dx);
    const baseRange = this.getTowerRange(tower);
    const baseEndX = tower.x + Math.cos(angle) * baseRange;
    const baseEndY = tower.y + Math.sin(angle) * baseRange;
    const abartiLevel = this.getAbartiPassThroughLevel(tower.ownerId, tower.x, tower.y, baseEndX, baseEndY);
    const rangeMultiplier = abartiLevel > 0 ? getAbartiShowcaseRangeMultiplier(abartiLevel) : 1;
    const id = `kw${this.nextKinWaveId++}`;
    this.kinWaves.set(id, {
      id,
      towerId: tower.id,
      ownerId: tower.ownerId,
      sourceDefinitionId: options.sourceDefinitionId ?? tower.definition.id,
      x: tower.x,
      y: tower.y,
      angle,
      halfAngle: (options.angleRadians ?? this.getTowerConeAngleRadians(tower)) / 2,
      distance: 0,
      range: baseRange * rangeMultiplier,
      speed: this.scaleWorldSpeed(getBallisticMovementSpeed(KIN_WAVE_SPEED + tower.level * 4, "wave"))
        * getModifierMultiplier(this.getTowerRunModifiers(tower), "projectileSpeed"),
      bandDepth: this.scaleWorldDistance(KIN_WAVE_BAND_DEPTH),
      slowMs: getTowerSlowDurationMs(tower.definition) + (tower.level - 1) * 80,
      pushbackDistance: options.pushbackDistance ?? 0,
      abartiLevel,
      tipHoldSeconds: (options.pushbackDistance ?? 0) > 0 ? KIN_SYNTHESIS_TIP_HOLD_SECONDS : 0,
      hitEnemyIds: []
    });
  }

  private updateKinWaves(seconds: number) {
    for (const [id, wave] of this.kinWaves) {
      const tower = this.towers.get(wave.towerId);
      if (!tower) {
        this.kinWaves.delete(id);
        this.beams.delete(`kin-wave-${id}`);
        continue;
      }

      if (wave.distance < wave.range) {
        wave.distance = Math.min(wave.range, wave.distance + wave.speed * seconds);
      } else if (wave.tipHoldSeconds > 0) {
        wave.tipHoldSeconds = Math.max(0, wave.tipHoldSeconds - seconds);
      } else {
        wave.distance += wave.speed * seconds;
      }
      this.applyKinWaveHits(tower, wave, seconds);
      this.setKinWaveBeam(wave);

      if (wave.distance >= wave.range + wave.bandDepth && wave.tipHoldSeconds <= 0) {
        this.kinWaves.delete(id);
        this.beams.delete(`kin-wave-${id}`);
      }
    }
  }

  private applyKinWaveHits(tower: TowerModel, wave: KinWaveModel, seconds: number) {
    const isPushWave = wave.pushbackDistance > 0;
    for (const enemy of this.enemies.values()) {
      this.perfCounters.aoeChecks += 1;
      if ((!isPushWave && wave.hitEnemyIds.includes(enemy.id)) || !this.canTowerTargetEnemy(tower, enemy)) {
        continue;
      }

      const projection = getProjectionOnAngle(enemy.x, enemy.y, wave.x, wave.y, wave.angle);
      if (projection < Math.max(0, wave.distance - wave.bandDepth) || projection > wave.distance + getEnemyCollisionRadius(enemy)) {
        continue;
      }

      if (!isTargetInsideAttackShape({
        shape: tower.definition.engine?.attack.shape ?? "cone",
        x: wave.x,
        y: wave.y,
        aimX: wave.x + Math.cos(wave.angle) * wave.range,
        aimY: wave.y + Math.sin(wave.angle) * wave.range,
        length: wave.range,
        angle: wave.halfAngle * 2 * 180 / Math.PI,
        canHitAir: tower.definition.engine?.canHitAir ?? false
      }, { ...enemy, radius: getEnemyCollisionRadius(enemy) })) {
        continue;
      }

      if (isPushWave) {
        this.pushEnemyWithKinWave(enemy, wave, Math.min(wave.pushbackDistance, wave.speed * seconds));
        continue;
      }

      wave.hitEnemyIds.push(enemy.id);
      this.applyKinSlow(enemy, tower, projection, wave.range, wave.slowMs);
    }
  }

  private pushEnemyWithKinWave(enemy: EnemyModel, wave: KinWaveModel, distance: number) {
    if (distance <= 0) {
      return;
    }

    const pushX = Math.cos(wave.angle) * distance;
    const pushY = Math.sin(wave.angle) * distance;
    const path = this.activePaths[enemy.pathId] ?? this.activePaths[0];

    if (enemy.movementKind === "air") {
      const start = getAirSpawnPoint(path, this.activeMap);
      const bounds = this.getActiveWorldBounds();
      const end = path?.points[path.points.length - 1] ?? { x: bounds.left + bounds.width / 2, y: bounds.bottom - getMapGridSize(this.activeMap) / 2 };
      const flightLength = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
      const delta = (pushX * (end.x - start.x) + pushY * (end.y - start.y)) / flightLength;
      enemy.pathDistance = this.clamp(enemy.pathDistance + delta, 0, flightLength);
      return;
    }

    const pushedDistance = getClosestPathDistance(path, enemy.x + pushX, enemy.y + pushY);
    enemy.pathDistance = this.clamp(pushedDistance, 0, path?.totalLength ?? pushedDistance);
  }

  private applyKinSlow(enemy: EnemyModel, tower: TowerModel, distanceFromTower: number, range: number, slowMs: number) {
    const now = Date.now();
    const ratio = this.getKinDistanceRatio(distanceFromTower, range);
    const multiplier = KIN_SLOW_NEAR_MULTIPLIER + (KIN_SLOW_FAR_MULTIPLIER - KIN_SLOW_NEAR_MULTIPLIER) * ratio;
    this.applyConfiguredTowerStatus(tower, enemy, "slow", now, { durationMs: slowMs, scalingFactor: ratio });
    const duration = applyStatusResistance(slowMs, enemy.statusResistances.slow);
    enemy.kinSlowMultiplier = this.clamp(multiplier, KIN_SLOW_FAR_MULTIPLIER, KIN_SLOW_NEAR_MULTIPLIER);
    enemy.kinSlowUntil = now + scaleGameDuration(duration);
  }

  private applyEnemyStatusEffect(
    enemy: EnemyModel,
    definition: TowerStatusEffectDefinition,
    now: number,
    overrides: { durationMs?: number; magnitude?: number; scalingFactor?: number; sourceTowerId?: string; sourceOwnerId?: string } = {}
  ) {
    const scaledDefinition = {
      ...definition,
      durationMs: scaleGameDuration(overrides.durationMs ?? definition.durationMs)
    };
    const state = applyTowerStatusEffect(enemy.statusEffects[definition.type], scaledDefinition, {
      now,
      resistance: enemy.statusResistances[definition.type === "mark" ? "tracking" : definition.type],
      magnitude: overrides.magnitude,
      scalingFactor: overrides.scalingFactor,
      sourceTowerId: overrides.sourceTowerId,
      sourceOwnerId: overrides.sourceOwnerId
    });
    enemy.statusEffects[definition.type] = state;
    if (definition.type === "slow") {
      enemy.slowUntil = Math.max(enemy.slowUntil, state.expiresAt);
    } else if (definition.type === "fear") {
      enemy.fearUntil = Math.max(enemy.fearUntil, state.expiresAt);
    } else if (definition.type === "stun") {
      enemy.melisDoubtHesitateUntil = Math.max(enemy.melisDoubtHesitateUntil, state.expiresAt);
    }
    return state;
  }

  private applyConfiguredTowerStatus(
    tower: TowerModel,
    enemy: EnemyModel,
    type: TowerStatusEffectDefinition["type"],
    now: number,
    overrides: { durationMs?: number; magnitude?: number; scalingFactor?: number; sourceOwnerId?: string } = {}
  ) {
    const definition = this.getTowerEngine(tower)?.statusEffects?.find((effect) => effect.type === type);
    if (!definition) return undefined;
    const modifiers = this.getTowerRunModifiers(tower);
    return this.applyEnemyStatusEffect(enemy, definition, now, {
      durationMs: (overrides.durationMs ?? definition.durationMs) * getModifierMultiplier(modifiers, "statusDuration"),
      magnitude: (overrides.magnitude ?? definition.magnitude) * getModifierMultiplier(modifiers, "statusMagnitude"),
      scalingFactor: overrides.scalingFactor,
      sourceTowerId: tower.id,
      sourceOwnerId: overrides.sourceOwnerId ?? tower.ownerId
    });
  }

  private updateEnemyEngineStatusOutcomes(enemy: EnemyModel, now: number) {
    const outcomes = getTowerStatusOutcomes(enemy.statusEffects, now);
    if (outcomes.converted) {
      enemy.dominatedUntil = Math.max(enemy.dominatedUntil, outcomes.convertExpiresAt);
      enemy.dominatedOwnerId = outcomes.convertOwnerId || enemy.dominatedOwnerId;
    }
    if (outcomes.burnMaxHealthRatioPerSecond > 0 && (enemy.statusTickAt.burn ?? 0) <= now) {
      const burn = enemy.statusEffects.burn;
      enemy.statusTickAt.burn = now + 500;
      this.damageEnemy(
        enemy,
        enemy.maxHp * outcomes.burnMaxHealthRatioPerSecond * 0.5,
        0,
        "status:burn",
        burn?.sourceOwnerId ?? "",
        "fire",
        0,
        1,
        burn?.sourceTowerId ?? "",
        "aura"
      );
    }
    if (outcomes.bleedMaxHealthRatioPerSecond > 0 && (enemy.statusTickAt.bleed ?? 0) <= now) {
      const bleed = enemy.statusEffects.bleed;
      enemy.statusTickAt.bleed = now + 1000;
      this.damageEnemy(
        enemy,
        enemy.maxHp * outcomes.bleedMaxHealthRatioPerSecond,
        0,
        "status:bleed",
        bleed?.sourceOwnerId ?? "",
        "true",
        0,
        1,
        bleed?.sourceTowerId ?? ""
      );
    }
    return this.enemies.has(enemy.id);
  }

  private applyEngineStack(
    states: Record<string, TowerStackRuntimeState>,
    definition: TowerStackDefinition,
    options: { trigger: TowerStackTrigger; now: number; targetId?: string; amount?: number; maxCount?: number; maxValue?: number }
  ) {
    const state = applyTowerStack(states[definition.id], definition, options);
    if (state) {
      states[definition.id] = state;
    }
    return state;
  }

  private resetEngineStack(states: Record<string, TowerStackRuntimeState>, definition: TowerStackDefinition, reason: "targetChange" | "noTarget" | "waveEnd") {
    const state = resetTowerStack(states[definition.id], definition, reason);
    if (state) {
      states[definition.id] = state;
    } else {
      delete states[definition.id];
    }
  }

  private getEngineStackMultiplier(tower: TowerModel, stackId: string, fallback: number, now = Date.now()) {
    const definition = this.getTowerEngine(tower)?.stacks?.find((stack) => stack.id === stackId);
    return definition ? getTowerStackMultiplier(tower.stackStates[stackId], definition, now) : fallback;
  }

  private getEngineStackStatMultiplier(tower: TowerModel, stat: TowerStackDefinition["stat"], now = Date.now()) {
    return (this.getTowerEngine(tower)?.stacks ?? [])
      .filter((definition) => definition.stat === stat)
      .reduce((multiplier, definition) => multiplier * getTowerStackMultiplier(tower.stackStates[definition.id], definition, now), 1);
  }

  private applyTowerStacksForTrigger(tower: TowerModel, trigger: TowerStackTrigger, now: number, targetId?: string) {
    for (const definition of this.getTowerEngine(tower)?.stacks ?? []) {
      this.applyEngineStack(tower.stackStates, definition, { trigger, now, targetId });
    }
  }

  /**
   * Kule tanimlarina elle yazilmis stack kimlikleri.
   *
   * Bunlarin sayaclari `updateUcubeRhythm` ve `prepareTowerShot` icinde, kuleye
   * ozel limitler ve gorsel sayaclarla birlikte isletiliyor. Genel gecer dagitim
   * onlara da dokunursa ayni vurusta iki kez artarlar.
   */
  private static readonly MANUALLY_DRIVEN_STACK_IDS = new Set(["obsession", "ucube-fire-rate", "mirror-storage"]);

  /**
   * Kart ve esyalarin ekledigi stack'leri isletir.
   *
   * `sameTarget` ve `activeSecond` tetikleri motorda tanimliydi ama yalnizca iki
   * kulenin kendi kodundan cagriliyordu; yani bu tetikleri kullanan bir kart
   * yazilabilir olsa bile hicbir zaman islemezdi. Burasi o tetikleri her kule
   * icin genel hale getirir.
   */
  private applyGrantedStacks(tower: TowerModel, trigger: TowerStackTrigger, now: number, targetId?: string) {
    for (const definition of this.getTowerEngine(tower)?.stacks ?? []) {
      if (definition.trigger !== trigger || MatchRoom.MANUALLY_DRIVEN_STACK_IDS.has(definition.id)) continue;
      this.applyEngineStack(tower.stackStates, definition, { trigger, now, targetId });
    }
  }

  /**
   * Kart kaynakli `sameTarget` stackleri.
   *
   * Kulenin kendi `focusTargetId` alani Melis ve Ucube mekaniklerine bagli
   * oldugu icin ayri bir hedef hafizasi tutulur; paylasilsaydi bu stackler o
   * kulelerin ozel davranislarini yanlislikla sifirlardi.
   */
  private updateGrantedSameTargetStacks(tower: TowerModel, target: EnemyModel) {
    const now = Date.now();
    if (tower.grantTargetId === target.id) {
      this.applyGrantedStacks(tower, "sameTarget", now, target.id);
      return;
    }
    tower.grantTargetId = target.id;
    this.resetGrantedStacks(tower, "targetChange");
  }

  /** Kart kaynakli `activeSecond` stackleri; kesintisiz atis suresini sayar. */
  private updateGrantedActiveSeconds(tower: TowerModel, deltaTime: number) {
    const stacks = this.getTowerEngine(tower)?.stacks;
    if (!stacks?.some((stack) => stack.trigger === "activeSecond" && !MatchRoom.MANUALLY_DRIVEN_STACK_IDS.has(stack.id))) return;

    if (!tower.aimTargetId || !this.enemies.has(tower.aimTargetId)) {
      tower.grantActiveMs = 0;
      this.resetGrantedStacks(tower, "noTarget");
      return;
    }

    tower.grantActiveMs = (tower.grantActiveMs ?? 0) + deltaTime;
    const desired = Math.floor(tower.grantActiveMs / 1000);
    const now = Date.now();
    for (const definition of stacks) {
      if (definition.trigger !== "activeSecond" || MatchRoom.MANUALLY_DRIVEN_STACK_IDS.has(definition.id)) continue;
      const limit = Math.min(desired, definition.max ?? desired);
      while ((tower.stackStates[definition.id]?.count ?? 0) < limit) {
        const before = tower.stackStates[definition.id]?.count ?? 0;
        this.applyEngineStack(tower.stackStates, definition, { trigger: "activeSecond", now });
        if ((tower.stackStates[definition.id]?.count ?? 0) === before) break;
      }
    }
  }

  private resetGrantedStacks(tower: TowerModel, reason: "targetChange" | "noTarget") {
    for (const definition of this.getTowerEngine(tower)?.stacks ?? []) {
      if (MatchRoom.MANUALLY_DRIVEN_STACK_IDS.has(definition.id)) continue;
      this.resetEngineStack(tower.stackStates, definition, reason);
    }
  }

  private runTowerTriggers(
    tower: TowerModel,
    event: TowerTriggerEvent,
    context: { target?: EnemyModel; conditions?: TowerTriggerCondition[]; areaDamageMultiplier?: number; now?: number } = {}
  ) {
    const result = dispatchTowerTriggers(this.getTowerEngine(tower)?.triggers ?? [], event, {
      now: context.now ?? Date.now(),
      cooldowns: tower.triggerCooldowns,
      conditions: context.conditions
    });
    tower.triggerCooldowns = result.cooldowns;
    for (const effect of result.effects) {
      if (effect === "surge") {
        // Kart ve esyalarin trigger uzerinden verebildigi tek genel etki.
        // Ozel bir kule mekanigine baglanmadigi icin her olayla kullanilabilir.
        tower.surgeUntil = (context.now ?? Date.now()) + SURGE_DURATION_MS;
      } else if (effect === "disable") {
        tower.heatLocked = true;
      } else if (effect === "rage-wave") {
        this.triggerMelisRageWave(tower, context.areaDamageMultiplier ?? 0);
      } else if (effect === "rage-wave-on-kill" && tower.melisEvolutionLevel >= 1) {
        this.triggerMelisRageWave(tower);
      } else if (effect === "marked-overdrive" && context.target) {
        this.startDebugLaserOverdrive(tower, context.target, context.now ?? Date.now());
      }
    }
    return result.effects;
  }

  private selectEnemiesForAttackShape(query: AttackShapeQuery, enemies: EnemyModel[], includeCollisionRadius = true) {
    const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));
    return selectAttackShapeTargets(query, enemies.map((enemy) => ({
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
      radius: includeCollisionRadius ? getEnemyCollisionRadius(enemy) : 0,
      movementKind: enemy.movementKind
    }))).map((target) => byId.get(target.id)).filter((enemy): enemy is EnemyModel => Boolean(enemy));
  }

  private getKinDistanceRatio(distanceFromTower: number, range: number) {
    return this.clamp(distanceFromTower / Math.max(1, range), 0, 1);
  }

  private setKinWaveBeam(wave: KinWaveModel) {
    const visibleDistance = Math.min(wave.distance, wave.range);
    const x2 = wave.x + Math.cos(wave.angle) * visibleDistance;
    const y2 = wave.y + Math.sin(wave.angle) * visibleDistance;
    const baseColor = wave.sourceDefinitionId === "zeynep-3-kin-wave" ? 0xdc2626 : 0x7f1d1d;
    this.beams.set(`kin-wave-${wave.id}`, {
      id: `kin-wave-${wave.id}`,
      definitionId: wave.sourceDefinitionId,
      tier: this.getBeamTier(wave.towerId),
      x1: wave.x,
      y1: wave.y,
      x2,
      y2,
      width: Math.max(8, Math.tan(wave.halfAngle) * visibleDistance * 2),
      color: wave.abartiLevel > 0 ? this.getAbartiDarkenedBeamColor(baseColor, wave.abartiLevel) : baseColor,
      overdrive: false,
      ttlMs: 120
    });
  }

  private fireZeynepSynthesisKinProjectile(tower: TowerModel, target: EnemyModel) {
    const damage = this.getTowerDamage(tower) * 0.72;
    const speed = Math.max(1, tower.definition.projectileSpeed + tower.level * 22);
    this.spawnZeynepSynthesisProjectile(tower, target, damage, speed, "physical", 2, "zeynep-3-kin-projectile");
  }

  private fireZeynepSynthesisKinShowcase(tower: TowerModel, target: EnemyModel) {
    const result = this.findBestKinShowcaseCone(tower, target);
    if (!result) {
      return;
    }

    const baseArmorBreak = KIN_SHOWCASE_ARMOR_BREAK_BASE + tower.level * KIN_SHOWCASE_ARMOR_BREAK_PER_LEVEL;
    const range = this.getTowerRange(tower);
    const damage = this.getTowerDamage(tower) * 0.62;
    for (const enemy of result.targets) {
      const distanceRatio = this.getKinDistanceRatio(Math.hypot(enemy.x - tower.x, enemy.y - tower.y), range);
      const armorBreak = Math.round(baseArmorBreak * distanceRatio * 3);
      this.applyArmorBreak(enemy, armorBreak);
      this.damageEnemyFromTowerAs(tower, enemy, damage, 0, "light", 0);
    }

    const beamId = `kin-showcase-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(beamId, {
      id: beamId,
      definitionId: "zeynep-3-kin-showcase",
      tier: this.getBeamTier(tower.id),
      x1: tower.x,
      y1: tower.y,
      x2: result.endX,
      y2: result.endY,
      width: Math.max(12, Math.tan(this.getTowerConeAngleRadians(tower) / 2) * Math.hypot(result.endX - tower.x, result.endY - tower.y) * 2),
      color: result.abartiLevel > 0 ? this.getAbartiDarkenedBeamColor(0xef4444, result.abartiLevel) : 0xef4444,
      overdrive: false,
      ttlMs: 260
    });
  }

  private findBestKinShowcaseCone(tower: TowerModel, fallbackTarget: EnemyModel) {
    const enemies = this.getEnemiesNear(tower.x, tower.y, this.getTowerRange(tower) * 1.5).filter((enemy) => this.canTowerTargetEnemy(tower, enemy));
    if (enemies.length === 0) {
      return undefined;
    }

    const range = this.getTowerRange(tower);
    let best: { endX: number; endY: number; targets: EnemyModel[]; score: number; abartiLevel: number } | undefined;
    for (const enemy of enemies.length > 0 ? enemies : [fallbackTarget]) {
      const angle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x);
      const baseEndX = tower.x + Math.cos(angle) * range;
      const baseEndY = tower.y + Math.sin(angle) * range;
      const abartiLevel = this.getAbartiPassThroughLevel(tower.ownerId, tower.x, tower.y, baseEndX, baseEndY);
      const finalRange = range * (abartiLevel > 0 ? getAbartiShowcaseRangeMultiplier(abartiLevel) : 1);
      const targets = enemies.filter((candidate) => this.isPointInsideCone(candidate.x, candidate.y, tower.x, tower.y, angle, this.getTowerConeAngleRadians(tower) / 2, finalRange));
      const score = targets.length * 100000 + targets.reduce((total, candidate) => total + candidate.pathDistance, 0);
      if (!best || score > best.score) {
        best = {
          endX: tower.x + Math.cos(angle) * finalRange,
          endY: tower.y + Math.sin(angle) * finalRange,
          targets,
          score,
          abartiLevel
        };
      }
    }

    return best;
  }

  private isPointInsideCone(x: number, y: number, originX: number, originY: number, angle: number, halfAngle: number, range: number) {
    const dx = x - originX;
    const dy = y - originY;
    const distance = Math.hypot(dx, dy);
    if (distance > range) {
      return false;
    }
    return Math.abs(normalizeAngle(Math.atan2(dy, dx) - angle)) <= halfAngle;
  }

  private fireZeynepSynthesisCopiedProjectile(tower: TowerModel, target: EnemyModel, copySourceTower: TowerModel) {
    const damage = this.getTowerDamage(copySourceTower);
    const speed = copySourceTower.definition.projectileSpeed + copySourceTower.level * 22;
    this.spawnZeynepSynthesisProjectile(tower, target, damage, speed, "physical", 2, "zeynep-1");
  }

  private fireZeynepSynthesisDualProjectiles(tower: TowerModel) {
    const range = this.getTowerRange(tower);
    const targets = this.getEnemiesNear(tower.x, tower.y, range)
      .filter((enemy) => this.canTowerTargetEnemy(tower, enemy) && distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= this.getTowerRange(tower) * this.getTowerRange(tower))
      .sort((a, b) => b.pathDistance - a.pathDistance)
      .slice(0, 2);
    const damage = this.getTowerDamage(tower);
    const speed = Math.max(1, tower.definition.projectileSpeed + tower.level * 22);
    const pierceLimit = 2 + this.getZeynepSynthesisAmplifierBonus(tower.ownerId, "1-1");

    for (const target of targets) {
      this.spawnZeynepSynthesisProjectile(tower, target, damage, speed, getTowerModeDamageType(tower.definition, "dual-projectile"), pierceLimit);
    }
  }

  private fireZeynepSynthesisBurnImpact(tower: TowerModel, target: EnemyModel) {
    const result = this.findBestZeynepShowcaseLine(tower, ZEYNEP_BURN_SYNTHESIS_RANGE_MULTIPLIER);
    const endX = result?.endX ?? target.x;
    const endY = result?.endY ?? target.y;
    const targets = result?.targets ?? [target];
    const damage = this.getTowerDamage(tower);
    const burnDurationMs = ZEYNEP_SYNTHESIS_BURN_DURATION_MS + this.getZeynepSynthesisAmplifierBonus(tower.ownerId, "2-2") * 1000;
    for (const enemy of targets) {
      this.damageEnemyFromTowerAs(tower, enemy, damage, 0, getTowerModeDamageType(tower.definition, "burn-impact"));
    }
    this.addZeynepBurnLine(tower, tower.x, tower.y, endX, endY, damage * 0.42, burnDurationMs);

    const trailId = `zeynep-burn-trail-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(trailId, {
      id: trailId,
      definitionId: "zeynep-3-burn-trail",
      tier: this.getBeamTier(tower.id),
      x1: tower.x,
      y1: tower.y,
      x2: endX,
      y2: endY,
      width: this.scaleWorldDistance(ZEYNEP_SYNTHESIS_BURN_LINE_RADIUS * 2),
      color: 0x7c2d12,
      overdrive: false,
      ttlMs: scaleGameDuration(burnDurationMs),
      delayMs: scaleGameDuration(500)
    });

    const id = `zeynep-burn-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(id, {
      id,
      definitionId: "zeynep-3-burn",
      tier: this.getBeamTier(tower.id),
      x1: tower.x,
      y1: tower.y,
      x2: endX,
      y2: endY,
      width: this.scaleWorldDistance(ZEYNEP_SHOWCASE_BEAM_RADIUS * 2),
      color: (result?.abartiLevel ?? 0) > 0 ? this.getAbartiDarkenedBeamColor(0x22d3ee, result?.abartiLevel ?? 0) : 0x22d3ee,
      overdrive: false,
      ttlMs: 260
    });
  }

  private fireZeynepSynthesisMirrorBeam(tower: TowerModel, target: EnemyModel) {
    const bounces = 1 + this.getZeynepSynthesisAmplifierBonus(tower.ownerId, "1-2");
    const segments = getMirrorBeamSegments(tower.x, tower.y, target.x, target.y, bounces, this.getActiveWorldBounds());
    const abartiLevel = this.getAbartiPassThroughLevelForSegments(tower.ownerId, segments);
    const firstSegment = segments[0];
    const initialDistance = Math.min(this.scaleWorldDistance(ZEYNEP_SYNTHESIS_RAY_LENGTH), firstSegment.length);
    const initialHead = getPointOnRaySegments(segments, initialDistance);
    const id = `zr${this.nextZeynepRayId++}`;
    const ray: ZeynepRayModel = {
      id,
      towerId: tower.id,
      ownerId: tower.ownerId,
      segments,
      segmentIndex: 0,
      distanceOnSegment: initialDistance,
      x: initialHead.x,
      y: initialHead.y,
      speed: this.scaleWorldSpeed(getBallisticMovementSpeed(ZEYNEP_SYNTHESIS_RAY_SPEED, "impact"))
        * getModifierMultiplier(this.getTowerRunModifiers(tower), "projectileSpeed"),
      damage: this.getTowerDamage(tower) * ZEYNEP_RAY_SYNTHESIS_DAMAGE_MULTIPLIER,
      abartiLevel,
      hitEnemyIds: []
    };
    this.zeynepRays.set(id, ray);
    const visibleSegment = this.getZeynepRayVisibleSegment(ray);
    this.damageEnemiesAlongZeynepRay(ray, visibleSegment.x1, visibleSegment.y1, visibleSegment.x2, visibleSegment.y2);
    this.setZeynepRayBeam(ray, visibleSegment);
  }

  private updateZeynepRays(seconds: number) {
    for (const [id, ray] of this.zeynepRays) {
      let remainingDistance = ray.speed * seconds;
      let deleteRay = false;

      while (remainingDistance > 0 && !deleteRay) {
        const segment = ray.segments[ray.segmentIndex];
        if (!segment) {
          deleteRay = true;
          break;
        }

        const distanceLeftOnSegment = segment.length - ray.distanceOnSegment;
        const step = Math.min(remainingDistance, distanceLeftOnSegment);
        ray.distanceOnSegment += step;
        remainingDistance -= step;

        const ratio = segment.length <= 0 ? 1 : Math.min(1, ray.distanceOnSegment / segment.length);
        ray.x = segment.x1 + (segment.x2 - segment.x1) * ratio;
        ray.y = segment.y1 + (segment.y2 - segment.y1) * ratio;

        const visibleSegment = this.getZeynepRayVisibleSegment(ray);
        this.damageEnemiesAlongZeynepRay(ray, visibleSegment.x1, visibleSegment.y1, visibleSegment.x2, visibleSegment.y2);
        this.setZeynepRayBeam(ray, visibleSegment);

        if (ray.distanceOnSegment >= segment.length - 0.001) {
          ray.segmentIndex += 1;
          ray.distanceOnSegment = 0;
          if (ray.segmentIndex >= ray.segments.length) {
            deleteRay = true;
          } else {
            const nextSegment = ray.segments[ray.segmentIndex];
            ray.x = nextSegment.x1;
            ray.y = nextSegment.y1;
            ray.hitEnemyIds = [];
          }
        }
      }

      if (deleteRay) {
        this.zeynepRays.delete(id);
      }
    }
  }

  private getZeynepRayVisibleSegment(ray: ZeynepRayModel) {
    const headDistance = getRayAbsoluteDistance(ray.segments, ray.segmentIndex, ray.distanceOnSegment);
    const tail = getPointOnRaySegments(ray.segments, Math.max(0, headDistance - this.scaleWorldDistance(ZEYNEP_SYNTHESIS_RAY_LENGTH)));
    return {
      x1: tail.x,
      y1: tail.y,
      x2: ray.x,
      y2: ray.y
    };
  }

  private damageEnemiesAlongZeynepRay(ray: ZeynepRayModel, x1: number, y1: number, x2: number, y2: number) {
    const tower = this.towers.get(ray.towerId);
    if (!tower) {
      return;
    }

    for (const enemy of this.enemies.values()) {
      this.perfCounters.aoeChecks += 1;
      if (ray.hitEnemyIds.includes(enemy.id) || !this.canTowerTargetEnemy(tower, enemy)) {
        continue;
      }

      const hitRadius = this.scaleWorldDistance(ZEYNEP_SYNTHESIS_BEAM_RADIUS) + getEnemyCollisionRadius(enemy);
      if (distanceToSegmentSq(enemy.x, enemy.y, x1, y1, x2, y2) > hitRadius * hitRadius) {
        continue;
      }

      ray.hitEnemyIds.push(enemy.id);
      const abartiMultiplier = ray.abartiLevel > 0 ? 1 + Math.max(0, ray.hitEnemyIds.length - 1) * getAbartiRayDamageGrowth(ray.abartiLevel) : 1;
      this.damageEnemyFromTowerAs(tower, enemy, ray.damage * abartiMultiplier, 0, getTowerModeDamageType(tower.definition, "mirror-beam"), 0);
    }
  }

  private setZeynepRayBeam(ray: ZeynepRayModel, segment: { x1: number; y1: number; x2: number; y2: number }) {
    const id = `zeynep-ray-${ray.id}`;
    this.beams.set(id, {
      id,
      definitionId: "zeynep-3-ray",
      tier: this.getBeamTier(ray.towerId),
      x1: segment.x1,
      y1: segment.y1,
      x2: segment.x2,
      y2: segment.y2,
      width: this.scaleWorldDistance(ZEYNEP_SYNTHESIS_BEAM_RADIUS * 2),
      color: ray.abartiLevel > 0 ? this.getAbartiDarkenedBeamColor(ray.segmentIndex === 0 ? 0xe879f9 : 0xfdf2f8, ray.abartiLevel) : ray.segmentIndex === 0 ? 0xe879f9 : 0xfdf2f8,
      overdrive: false,
      ttlMs: ZEYNEP_SYNTHESIS_RAY_TRAIL_TTL_MS
    });
  }

  private spawnZeynepSynthesisProjectile(tower: TowerModel, target: EnemyModel, damage: number, speed: number, damageType: DamageType, pierceLimit: number, definitionId = tower.definition.id) {
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const launchAngle = towerAims(tower.definition.id) ? tower.facing : Math.atan2(dy, dx);
    const hitType = tower.definition.hitType ?? "projectile";
    const projectileSpeed = this.scaleWorldSpeed(getBallisticMovementSpeed(speed, hitType))
      * getModifierMultiplier(this.getTowerRunModifiers(tower), "projectileSpeed");
    const id = `p${this.nextProjectileId++}`;

    this.projectiles.set(id, {
      id,
      towerId: tower.id,
      definitionId,
      kind: "tower",
      damageType,
      hitType,
      source: "tower",
      targetId: target.id,
      x: tower.x,
      y: tower.y,
      vx: usesLinearBallistics(hitType) ? Math.cos(launchAngle) * projectileSpeed : (dx / length) * projectileSpeed,
      vy: usesLinearBallistics(hitType) ? Math.sin(launchAngle) * projectileSpeed : (dy / length) * projectileSpeed,
      damage,
      maxHealthDamageRatio: this.getServerLinkedMaxHealthDamageRatio(tower),
      aoeRadius: 0,
      slowMs: 0,
      pierceLimit,
      armorBreakAmount: getModifierAdd(this.getTowerRunModifiers(tower), "armorBreak"),
      piercedEnemyIds: []
    });
    this.broadcastProjectileSpawn(this.projectiles.get(id)!);
  }

  private addZeynepBurnLine(tower: TowerModel, x1: number, y1: number, x2: number, y2: number, damage: number, durationMs = ZEYNEP_SYNTHESIS_BURN_DURATION_MS) {
    const now = Date.now();
    const id = `burn-${this.nextBurnZoneId++}`;
    this.burnZones.set(id, {
      id,
      ownerId: tower.ownerId,
      towerId: tower.id,
      x1,
      y1,
      x2,
      y2,
      radius: this.scaleWorldDistance(ZEYNEP_SYNTHESIS_BURN_LINE_RADIUS),
      damage,
      damageType: "light",
      expiresAt: now + scaleGameDuration(durationMs),
      nextTickAt: now + scaleGameDuration(ZEYNEP_SYNTHESIS_BURN_TICK_MS)
    });
  }

  private getAbartiPassThroughLevel(ownerId: string, x1: number, y1: number, x2: number, y2: number) {
    let level = 0;
    for (const tower of this.towers.values()) {
      if (tower.ownerId !== ownerId || tower.definition.id !== "zeynep-8") {
        continue;
      }

      if (segmentIntersectsRect(x1, y1, x2, y2, this.getAbartiRect(tower))) {
        level = Math.max(level, tower.level);
      }
    }
    return level;
  }

  private getAbartiPassThroughLevelForSegments(ownerId: string, segments: RaySegment[]) {
    let level = 0;
    for (const segment of segments) {
      level = Math.max(level, this.getAbartiPassThroughLevel(ownerId, segment.x1, segment.y1, segment.x2, segment.y2));
    }
    return level;
  }

  private getAbartiRect(tower: TowerModel) {
    const gridSize = getMapGridSize(this.activeMap);
    const thickness = Math.max(5, gridSize * 0.16);
    if (tower.orientation === "vertical") {
      return {
        left: tower.x - thickness / 2,
        right: tower.x + thickness / 2,
        top: tower.y - gridSize,
        bottom: tower.y + gridSize
      };
    }

    return {
      left: tower.x - gridSize,
      right: tower.x + gridSize,
      top: tower.y - thickness / 2,
      bottom: tower.y + thickness / 2
    };
  }

  private getAbartiDarkenedBeamColor(color: number, level: number) {
    const factor = 0.78 - Math.min(9, Math.max(0, level - 1)) * 0.025;
    const r = Math.max(0, Math.round(((color >> 16) & 255) * factor));
    const g = Math.max(0, Math.round(((color >> 8) & 255) * factor));
    const b = Math.max(0, Math.round((color & 255) * factor));
    return (r << 16) | (g << 8) | b;
  }

  private getZeynepSynthesisAmplifierBonus(ownerId: string, combo: "1-1" | "2-2" | "1-2") {
    const requiredLevel = combo === "1-1" ? 2 : combo === "2-2" ? 3 : 6;
    let bonus = 0;
    for (const tower of this.towers.values()) {
      const providesSynthesisAura = tower.definition.engine?.auras?.some((aura) => aura.affects === "towers" && aura.stat === "synthesis");
      if (tower.ownerId === ownerId && providesSynthesisAura && tower.level >= requiredLevel && tower.hp > 0) {
        bonus += 1;
      }
    }
    return bonus;
  }

  private updateBurnZones() {
    const now = Date.now();
    for (const [id, zone] of this.burnZones) {
      if (now >= zone.expiresAt) {
        this.burnZones.delete(id);
        continue;
      }

      if (now < zone.nextTickAt) {
        continue;
      }

      zone.nextTickAt += scaleGameDuration(ZEYNEP_SYNTHESIS_BURN_TICK_MS);
      for (const enemy of this.enemies.values()) {
        this.perfCounters.aoeChecks += 1;
        const hitRadius = zone.radius + getEnemyCollisionRadius(enemy);
        if (distanceToSegmentSq(enemy.x, enemy.y, zone.x1, zone.y1, zone.x2, zone.y2) <= hitRadius * hitRadius) {
          this.damageEnemy(enemy, zone.damage, 0, "zeynep-3-burn", zone.ownerId, zone.damageType, 0, 1, zone.towerId, "aura");
        }
      }
    }
  }

  /**
   * Asiri yukleme kirisi.
   *
   * `firesThisTick` cagiran yerden gelir: kiris her karede ciziliyor ama hasar
   * yalnizca ates sayacinin doldugu karede uygulaniyor. Iki kare arasinda
   * taranan yay atlanmasin diye vurus testi onceki aciyla su anki aci arasini
   * birlikte olcer.
   */
  private updateDebugLaserSweep(tower: TowerModel, firesThisTick = false) {
    const now = Date.now();
    if (this.updateDebugLaserOverdriveHeat(tower, now)) {
      return;
    }

    if (tower.debugSweepStartedAt <= 0) {
      tower.debugSweepStartedAt = now;
    }

    const elapsedSeconds = this.clamp((now - tower.debugSweepStartedAt) / 1000, 0, DEBUG_LASER_OVERDRIVE_DURATION_MS / 1000);
    const sweepAngles = this.getDebugLaserSweepAngles(tower);
    const desiredAngle = getDebugLaserChainSweepAngle(sweepAngles, elapsedSeconds, tower.facing);

    // Donus hizi tavani cizilen acinin uzerinde.
    //
    // Zincirin toplam yayini sureye gore kismak, kare basina hareketi kismiyor:
    // acilar canli okundugu icin ilk halka oldugunde hesap bir anda zincirin
    // ikinci halkasindan baslar ve kiris o farki tek karede kapatir. Sinir
    // burada, gercekten donen sey uzerinde uygulaniyor -- altinda kalabilir,
    // ustune cikamaz.
    const previousAngle = tower.debugSweepAngleAt > 0 ? tower.debugSweepAngle : desiredAngle;
    const sinceLastFrame = tower.debugSweepAngleAt > 0 ? Math.max(0, now - tower.debugSweepAngleAt) / 1000 : 0;
    const currentAngle = rotateTowerTowards(previousAngle, desiredAngle, sinceLastFrame, DEBUG_LASER_MAX_SWEEP_RADIANS_PER_SECOND);
    tower.debugSweepAngle = currentAngle;
    tower.debugSweepAngleAt = now;
    const end = getRayAngleToWorldEdge(tower.x, tower.y, currentAngle, this.getActiveWorldBounds());
    const scanPoint = getPointOnRay(tower.x, tower.y, currentAngle, this.scaleWorldDistance(190));
    const finishedSweep = now - tower.debugSweepStartedAt >= DEBUG_LASER_OVERDRIVE_DURATION_MS;

    this.setBeam(tower, end.x, end.y, true, scanPoint.x, scanPoint.y);
    if (!firesThisTick) {
      if (finishedSweep) {
        tower.debugOverdriveUntil = now;
      }
      return;
    }

    const damage = this.getTowerDamage(tower);
    // Taranan yay artik yeniden hesaplanmiyor: kirisin bir onceki karede
    // gercekten durdugu aci ile su anki acisi arasi. Hesaplanan degerden yay
    // cikarmak, sinirin kirptigi hareketi de vurulmus saymak olurdu.
    const sweptFromAngle = tower.debugSweepDamageAngleAt > 0 ? tower.debugSweepDamageAngle : previousAngle;
    tower.debugSweepDamageAngle = currentAngle;
    tower.debugSweepDamageAngleAt = now;

    for (const enemy of Array.from(this.enemies.values())) {
      if (didDebugLaserSweepHitEnemy(tower, enemy, sweptFromAngle, currentAngle, end.x, end.y, this.scaleWorldDistance(DEBUG_LASER_OVERDRIVE_BEAM_RADIUS))) {
        this.damageEnemyFromTower(tower, enemy, damage, 0);
      }
    }
    tower.debugSweepLastDamageAt = now;
    if (finishedSweep) {
      tower.debugOverdriveUntil = now;
    }
  }

  private updateDebugLaserOverdriveHeat(tower: TowerModel, now: number) {
    if (tower.debugOverdriveHeatLastAt <= 0 || tower.debugOverdriveHeatLastAt > now) {
      tower.debugOverdriveHeatLastAt = now;
      this.pruneDebugLaserHeatSegments(tower, now);
      return false;
    }

    if (now > tower.debugOverdriveHeatLastAt) {
      this.addDebugLaserHeatSegment(tower, tower.debugOverdriveHeatLastAt, now);
      tower.debugOverdriveHeatLastAt = now;
    }

    this.pruneDebugLaserHeatSegments(tower, now);
    const heatMs = tower.debugOverdriveHeatSegments.reduce((total, segment) => total + Math.max(0, segment.endedAt - segment.startedAt), 0);
    if (heatMs <= DEBUG_LASER_HEAT_LIMIT_MS) {
      return false;
    }

    this.triggerDebugLaserOverheat(tower);
    return true;
  }

  private addDebugLaserHeatSegment(tower: TowerModel, startedAt: number, endedAt: number) {
    const previous = tower.debugOverdriveHeatSegments[tower.debugOverdriveHeatSegments.length - 1];
    if (previous && startedAt - previous.endedAt <= 80) {
      previous.endedAt = Math.max(previous.endedAt, endedAt);
      return;
    }

    tower.debugOverdriveHeatSegments.push({ startedAt, endedAt });
  }

  private pruneDebugLaserHeatSegments(tower: TowerModel, now: number) {
    const windowStart = now - DEBUG_LASER_HEAT_WINDOW_MS;
    tower.debugOverdriveHeatSegments = tower.debugOverdriveHeatSegments
      .filter((segment) => segment.endedAt > windowStart)
      .map((segment) => ({
        startedAt: Math.max(segment.startedAt, windowStart),
        endedAt: segment.endedAt
      }));
  }

  private triggerDebugLaserOverheat(tower: TowerModel) {
    tower.overheatMs = Math.max(tower.overheatMs, DEBUG_LASER_OVERHEAT_MS);
    tower.debugOverdriveUntil = 0;
    tower.debugSweepStartedAt = 0;
    tower.debugSweepTargetIds = [];
    tower.debugSweepAngleAt = 0;
    tower.debugSweepLastDamageAt = 0;
    tower.debugOverdriveHeatLastAt = 0;
    tower.debugOverdriveHeatSegments = [];
    this.beams.delete(`beam-${tower.id}`);
  }

  /**
   * Supurmenin ugrak sirasi: en yakin dusmandan baslayip uzaga dogru.
   *
   * Kiris menzil tanimadigi icin liste kulenin menziliyle degil sahadaki
   * dusmanlarla sinirli. Sira baslangicta bir kez donduruluyor; her karede
   * yeniden siralamak, dusmanlar birbirini gectikce kirisi ileri geri
   * sicratirdi.
   */
  private getDebugLaserSweepTargetIds(tower: TowerModel) {
    return Array.from(this.enemies.values())
      .map((enemy) => ({ id: enemy.id, distance: distanceSq(tower.x, tower.y, enemy.x, enemy.y) }))
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.id);
  }

  /**
   * Zincirin su anki acilari.
   *
   * Sira sabit ama acilar canli: hedefler yuruyor, kiris de onlari takip
   * etsin. Olen hedefler listeden dusuyor -- iki saniyelik supurmede surunun
   * yarisi olebilir ve olulere nisan almak kirisi bosluga cevirirdi.
   */
  private getDebugLaserSweepAngles(tower: TowerModel) {
    const angles: number[] = [];
    for (const id of tower.debugSweepTargetIds) {
      const enemy = this.enemies.get(id);
      if (!enemy) continue;
      angles.push(Math.atan2(enemy.y - tower.y, enemy.x - tower.x));
    }
    return angles;
  }
  private updateServerLinks() {
    const now = Date.now();

    for (const serverTower of this.towers.values()) {
      if (serverTower.definition.id !== "warrior-2" || serverTower.offlineUntil > now || serverTower.overheatMs > 0) {
        continue;
      }

      serverTower.linkedTowerIds = serverTower.linkedTowerIds.filter((towerId) => {
        const exists = this.towers.has(towerId);
        if (!exists) {
          delete serverTower.linkedTowerWaveAges[towerId];
        }
        return exists;
      });

      for (const linkedTowerId of serverTower.linkedTowerIds) {
        const linkedTower = this.towers.get(linkedTowerId);
        if (!linkedTower || linkedTower.offlineUntil > now || linkedTower.overheatMs > 0) {
          continue;
        }

        const linkedRange = this.getTowerRange(linkedTower);
        const currentEnemyIds = Array.from(this.enemies.values())
          .filter((enemy) => enemy.movementKind !== "air" && distanceSq(linkedTower.x, linkedTower.y, enemy.x, enemy.y) <= linkedRange * linkedRange)
          .map((enemy) => enemy.id);
        const previousEnemyIds = linkedTower.rangeMemoryEnemyIds;
        linkedTower.rangeMemoryEnemyIds = currentEnemyIds;

        if (linkedTower.linkBurstCooldownMs > 0) {
          continue;
        }

        const escapedEnemy = previousEnemyIds
          .map((enemyId) => this.enemies.get(enemyId))
          .find((enemy) => {
            if (!enemy || currentEnemyIds.includes(enemy.id)) {
              return false;
            }

            const linkedPath = this.activePaths[enemy.pathId] ?? this.activePaths[0];
            return enemy.pathDistance > getClosestPathDistance(linkedPath, linkedTower.x, linkedTower.y);
          });

        if (!escapedEnemy) {
          continue;
        }

        const damage = getServerLinkBurstDamage(serverTower.level);
        this.spawnSpecialProjectile(serverTower, "warrior-2", escapedEnemy, damage, 520, getServerLinkBurstRadius(serverTower.level), 0);
        linkedTower.linkBurstCooldownMs = Math.max(520, 1100 - serverTower.level * 80);
      }
    }
  }

  private updateProjectiles(seconds: number) {
    for (const [id, projectile] of this.projectiles) {
      const previousX = projectile.x;
      const previousY = projectile.y;

      if (usesLinearBallistics(projectile.hitType)) {
        projectile.x += projectile.vx * seconds;
        projectile.y += projectile.vy * seconds;
        this.updateProjectileAbartiModifier(projectile, previousX, previousY);
        const sourceTower = this.towers.get(projectile.towerId);
        const segmentLength = Math.hypot(projectile.x - previousX, projectile.y - previousY);
        const collisionCandidates = this.getEnemiesNear(
          (previousX + projectile.x) / 2,
          (previousY + projectile.y) / 2,
          segmentLength / 2 + this.scaleWorldDistance(48)
        );
        const collision = findFirstLinearCollision(
          { x: previousX, y: previousY },
          { x: projectile.x, y: projectile.y },
          collisionCandidates
            .filter((enemy) => !sourceTower || this.canTowerTargetEnemy(sourceTower, enemy))
            .filter((enemy) => !sourceTower || distanceSq(sourceTower.x, sourceTower.y, enemy.x, enemy.y) >= this.getTowerMinimumRange(sourceTower) ** 2)
            .map((enemy) => ({ id: enemy.id, x: enemy.x, y: enemy.y, radius: getEnemyCollisionRadius(enemy) })),
          getBallisticCollisionRadius(projectile.hitType),
          new Set(projectile.piercedEnemyIds)
        );
        if (collision) {
          // Carpisma govdesi yalnizca geometri tasir. Hasar canli dusman
          // nesnesine uygulanmali; govdenin kendisine yazilan can ve kalkan
          // degisiklikleri kaybolur.
          const hitEnemy = this.enemies.get(collision.body.id);
          projectile.x = previousX + (projectile.x - previousX) * collision.progress;
          projectile.y = previousY + (projectile.y - previousY) * collision.progress;
          if (hitEnemy) {
            this.applyProjectileHit(projectile, hitEnemy);
          }
          projectile.piercedEnemyIds.push(collision.body.id);
          if (projectile.piercedEnemyIds.length >= projectile.pierceLimit) {
            this.removeProjectile(id, projectile);
          }
          continue;
        }
        if (this.isProjectileOutOfBounds(projectile)) {
          this.removeProjectile(id, projectile);
        }
        continue;
      }

      if (projectile.piercedEnemyIds.length > 0 && projectile.piercedEnemyIds.length < projectile.pierceLimit) {
        projectile.x += projectile.vx * seconds;
        projectile.y += projectile.vy * seconds;
        this.updateProjectileAbartiModifier(projectile, previousX, previousY);

        if (this.isProjectileOutOfBounds(projectile)) {
          this.removeProjectile(id, projectile);
          continue;
        }

        const pierceTarget = this.findPierceLineTarget(projectile, previousX, previousY);
        if (!pierceTarget) {
          continue;
        }

        this.applyProjectileHit(projectile, pierceTarget);
        this.removeProjectile(id, projectile);
        continue;
      }

      const target = this.enemies.get(projectile.targetId);
      if (!target) {
        this.removeProjectile(id, projectile);
        continue;
      }

      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const speed = Math.max(1, Math.hypot(projectile.vx, projectile.vy));
      const travel = speed * seconds;
      const hitRadius = getEnemyCollisionRadius(target) + 4;

      projectile.vx = (dx / distance) * speed;
      projectile.vy = (dy / distance) * speed;

      if (distance <= travel + hitRadius) {
        projectile.x = target.x;
        projectile.y = target.y;
      } else {
        projectile.x += projectile.vx * seconds;
        projectile.y += projectile.vy * seconds;
      }
      this.updateProjectileAbartiModifier(projectile, previousX, previousY);

      if (this.isProjectileOutOfBounds(projectile)) {
        this.removeProjectile(id, projectile);
        continue;
      }

      if (distance > travel + hitRadius && !didProjectileHitTarget(projectile, target, previousX, previousY)) {
        continue;
      }

      projectile.x = target.x;
      projectile.y = target.y;
      this.applyProjectileHit(projectile, target);
      projectile.piercedEnemyIds.push(target.id);

      if (projectile.piercedEnemyIds.length >= projectile.pierceLimit) {
        this.removeProjectile(id, projectile);
      }
    }
  }

  private isProjectileOutOfBounds(projectile: ProjectileModel) {
    const bounds = this.getActiveWorldBounds();
    return (
      projectile.x < bounds.left - 30 ||
      projectile.x > bounds.right + 30 ||
      projectile.y < bounds.top - 30 ||
      projectile.y > bounds.bottom + 30
    );
  }

  private findPierceLineTarget(projectile: ProjectileModel, previousX: number, previousY: number) {
    return this.selectEnemiesForAttackShape({
      shape: "line",
      x: previousX,
      y: previousY,
      aimX: projectile.x,
      aimY: projectile.y,
      length: Math.hypot(projectile.x - previousX, projectile.y - previousY),
      width: 4,
      pierceCount: 1,
      canHitAir: true,
      alreadyHitIds: projectile.piercedEnemyIds
    }, Array.from(this.enemies.values()))[0];
  }

  private updateProjectileAbartiModifier(projectile: ProjectileModel, previousX: number, previousY: number) {
    if (projectile.damageType !== "physical" || !isAbartiArmorBreakProjectile(projectile.definitionId)) {
      return;
    }

    const tower = this.towers.get(projectile.towerId);
    if (!tower?.ownerId) {
      return;
    }

    const abartiLevel = this.getAbartiPassThroughLevel(tower.ownerId, previousX, previousY, projectile.x, projectile.y);
    if (abartiLevel <= 0) {
      return;
    }

    projectile.armorBreakAmount = Math.max(projectile.armorBreakAmount, getAbartiArmorBreak(abartiLevel));
  }

  private applyProjectileHit(projectile: ProjectileModel, target: EnemyModel) {
    const projectileTower = this.towers.get(projectile.towerId);
    const projectileOwnerId = projectileTower?.ownerId ?? "";
    const projectileTowerLevel = projectileTower?.level ?? 1;
    if (projectile.armorBreakAmount > 0) {
      this.applyArmorBreak(target, projectile.armorBreakAmount);
    }
    if (projectile.aoeRadius > 0) {
      const areaTargets = this.selectEnemiesForAttackShape({
        shape: "circle",
        x: projectile.x,
        y: projectile.y,
        aimX: target.x,
        aimY: target.y,
        radius: projectile.aoeRadius,
        canHitAir: true
      }, Array.from(this.enemies.values()), false);
      for (const enemy of areaTargets) {
        this.perfCounters.aoeChecks += 1;
        const killed = this.damageEnemy(enemy, this.getProjectileDamage(projectile, 0.82), projectile.slowMs, projectile.definitionId, projectileOwnerId, projectile.damageType, projectile.maxHealthDamageRatio, projectileTowerLevel, projectile.towerId, projectile.hitType);
        if (projectile.definitionId === "archer-6-whisper" && !killed && projectileTower) {
          this.applyMelisDoubt(projectileTower, enemy, Date.now());
        }
        this.applyKinProjectileSlow(projectile, enemy);
      }
    } else {
      this.damageEnemy(target, this.getProjectileDamage(projectile), projectile.slowMs, projectile.definitionId, projectileOwnerId, projectile.damageType, projectile.maxHealthDamageRatio, projectileTowerLevel, projectile.towerId, projectile.hitType);
      this.applyKinProjectileSlow(projectile, target);
    }
    this.applyPostHitEffects(projectile, target);
  }

  private applyArmorBreak(enemy: EnemyModel, amount: number) {
    if (amount <= 0) {
      return;
    }

    enemy.armor = Math.max(-100, enemy.armor - amount);
    enemy.armorBrokenUntil = Math.max(enemy.armorBrokenUntil, Date.now() + scaleGameDuration(ARMOR_BREAK_MARKER_MS));
  }

  private applyKinProjectileSlow(projectile: ProjectileModel, target: EnemyModel) {
    if (projectile.definitionId !== "zeynep-3-kin-projectile") {
      return;
    }

    const tower = this.towers.get(projectile.towerId);
    if (!tower) {
      return;
    }

    const distanceFromTower = Math.hypot(target.x - tower.x, target.y - tower.y);
    this.applyKinSlow(target, tower, distanceFromTower, this.getTowerRange(tower), 900 + tower.level * 70);
  }

  private updateDrones(deltaTime: number, seconds: number) {
    this.ensureLogisticsWorkers();
    const nexus = this.activePaths[0]?.points.at(-1);
    const bounds = this.getActiveWorldBounds();
    const nexusX = nexus?.x ?? bounds.left + bounds.width / 2;
    const nexusY = nexus?.y ?? bounds.bottom - getMapGridSize(this.activeMap) / 2;

    for (const [id, drone] of this.drones) {
      if (drone.mode === "crystalCollector" || drone.mode === "ammoCollector" || drone.mode === "energyTransport" || drone.mode === "ammoTransport") {
        // Isciler dusmana carpinca olmez: lojistik hattinin dusman yolunu
        // kesmesi kacinilmaz oldugu icin olum, oyuncunun engelleyemedigi bir
        // sebeple ekonomisinin durmasi demekti.
        if (this.setupPhase) {
          drone.vx = 0;
          drone.vy = 0;
          continue;
        }
        this.updateLogisticsWorker(drone, seconds);
        continue;
      }
      drone.ttlMs -= deltaTime;

      if (drone.mode === "attack") {
        let target = drone.targetId ? this.enemies.get(drone.targetId) : undefined;
        if (!target) {
          target = this.findNearestEnemy(drone.x, drone.y);
          drone.targetId = target?.id;
          if (!target) {
            this.drones.delete(id);
            continue;
          }
        }

        const dx = target.x - drone.x;
        const dy = target.y - drone.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const speed = this.scaleWorldSpeed(ATAKAN_DRONE_ATTACK_SPEED);
        drone.vx = (dx / length) * speed;
        drone.vy = (dy / length) * speed;
        drone.x += drone.vx * seconds;
        drone.y += drone.vy * seconds;

        const hitRadius = this.scaleWorldDistance(18);
        if (distanceSq(drone.x, drone.y, target.x, target.y) <= hitRadius * hitRadius) {
          this.damageEnemy(target, drone.damage, 0, "warrior-ultimate-drone", drone.ownerId);
          this.drones.delete(id);
        }
        if (drone.ttlMs <= 0) {
          this.drones.delete(id);
        }
        continue;
      }

      const dx = nexusX - drone.x;
      const dy = nexusY - drone.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const speed = this.scaleWorldSpeed(ATAKAN_DRONE_REPAIR_SPEED);
      drone.vx = (dx / length) * speed;
      drone.vy = (dy / length) * speed;
      drone.x += drone.vx * seconds;
      drone.y += drone.vy * seconds;

      const repairRadius = this.scaleWorldDistance(18);
      if (distanceSq(drone.x, drone.y, nexusX, nexusY) <= repairRadius * repairRadius) {
        this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + drone.repairAmount);
        this.drones.delete(id);
      }
      if (drone.ttlMs <= 0) {
        this.drones.delete(id);
      }
    }
  }

  private updateEnemies(seconds: number) {
    // Yapi degistiyse ana kapiyi bir kez yeniden olc: yonlendirme artik alani
    // sormadigi icin bunu tetikleyecek baska bir yer kalmadi.
    if (this.mainGateDirty) {
      this.announceFlowShift();
    }
    const now = Date.now();
    for (const [id, enemy] of this.enemies) {
      if (!this.updateEnemyEngineStatusOutcomes(enemy, now)) {
        continue;
      }
      if (enemy.melisUndeadUntil > now) {
        this.updateMelisUndead(enemy, seconds, now);
        continue;
      }

      if (enemy.melisWhisperTurnedUntil > now) {
        this.updateMelisWhisperTurnedEnemy(enemy, seconds, now);
        continue;
      }

      if (enemy.dominatedUntil > now) {
        this.applyDominatedEnemyAura(enemy, seconds);
        continue;
      }

      if (enemy.melisWhisperTurnedUntil > 0) {
        enemy.melisWhisperTurnedUntil = 0;
        enemy.melisWhisperTurnedOwnerId = "";
        enemy.melisWhisperTurnedSourceTowerId = "";
        enemy.melisWhisperTurnedEvolutionLevel = 0;
        enemy.melisWhisperTurnedAttackCooldownMs = 0;
      }

      if (enemy.healthRegenPerSecond > 0 && enemy.hp > 0) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.healthRegenPerSecond * seconds);
      }

      if (enemy.melisCurseLoad > 0 && enemy.melisCurseUntil <= now) {
        enemy.melisCurseLoad = 0;
        enemy.melisCurseBurstDamage = 0;
        enemy.melisCurseOwnerId = "";
        enemy.melisCurseTowerId = "";
        enemy.melisCurseEvolutionLevel = 0;
        delete enemy.stackStates["curse-pool"];
      }

      if (enemy.melisDoubtStacks > 0 && enemy.melisDoubtUntil <= now) {
        enemy.melisDoubtStacks = 0;
        delete enemy.stackStates["doubt"];
      }

      const isFeared = enemy.fearUntil > now;
      const isSlowed = enemy.slowUntil > now;
      const isHesitating = enemy.melisDoubtHesitateUntil > now;
      const kinSlowMultiplier = enemy.kinSlowUntil > now ? enemy.kinSlowMultiplier : 1;
      const zeynepSlowMultiplier = this.zeynepSlowUntil > now ? this.zeynepSlowMultiplier : 1;
      const doubtSlowMultiplier = enemy.melisDoubtUntil > now ? Math.max(0.1, 1 - Math.min(3, enemy.melisDoubtStacks) * MELIS_DOUBT_SLOW_PER_STACK) : 1;
      const doubtHasteMultiplier = enemy.melisDoubtHasteUntil > now ? MELIS_DOUBT_STRESS_HASTE_MULTIPLIER : 1;
      const undeadBlocker = this.getBlockingMelisUndead(enemy);
      const whisperBlocker = this.getBlockingMelisWhisperTurned(enemy);
      if (undeadBlocker) {
        undeadBlocker.hp -= enemy.maxHp * 0.18 * seconds;
        if (undeadBlocker.hp <= 0) {
          this.enemies.delete(undeadBlocker.id);
        }
      }
      if (whisperBlocker) {
        this.damageMelisWhisperTurnedBlocker(whisperBlocker, enemy.maxHp * 0.18 * seconds);
      }
      const statusSpeedMultiplier = getTowerStatusOutcomes(enemy.statusEffects, now).speedMultiplier;
      const enemyCell = worldToGrid(enemy.x, enemy.y, this.activeMap);
      const tarMultiplier = this.tarredCells.has(`${enemyCell.col}:${enemyCell.row}`) ? 0.75 : 1;
      const debrisMultiplier = (this.debrisCells.get(`${enemyCell.col}:${enemyCell.row}`) ?? 0) > now ? 0.6 : 1;
      const speedMultiplier = isHesitating || undeadBlocker || whisperBlocker
        ? 0
        : Math.min(isSlowed ? 0.48 : 1, statusSpeedMultiplier, enemy.auraSlowMultiplier, kinSlowMultiplier, zeynepSlowMultiplier, doubtSlowMultiplier, tarMultiplier, debrisMultiplier) * doubtHasteMultiplier;
      enemy.towerAttackCooldownMs = Math.max(0, enemy.towerAttackCooldownMs - seconds * 1000);
      const route = this.findEnemyRoute(enemy);
      if (route.reachedBottom) {
        if (this.melisGothicNightmareUntil > now) {
          enemy.y = Math.min(enemy.y, TOWER_BUILD_BOTTOM - 1);
        } else {
          this.runEnemyEscapeTriggers(enemy, now);
          this.enemies.delete(id);
          const shieldOwner = Array.from(this.state.players.values()).find((player) => player.nexusShieldCharges > 0);
          if (shieldOwner) shieldOwner.nexusShieldCharges -= 1;
          else this.teamHealth = Math.max(0, this.teamHealth - (enemy.type === "brute" ? 14 : 8));
          if (this.teamHealth === 0) {
            this.finishMatch("defeat");
          }
        }
        continue;
      }

      const nextCell = route.cells[1];
      const movementTarget = nextCell ? gridToWorld(nextCell.col, nextCell.row, this.activeMap) : route.exitPoint;
      if (movementTarget && !isFeared && speedMultiplier > 0) {
        const point = movementTarget;
        const dx = point.x - enemy.x;
        const dy = point.y - enemy.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        const movement = Math.min(distance, enemy.speed * speedMultiplier * seconds);
        enemy.x += dx / distance * movement;
        enemy.y += dy / distance * movement;
        enemy.pathDistance += movement;
      }

      if (route.targetTower && route.cells.length <= 1 && enemy.towerAttackCooldownMs <= 0) {
        // Kusatma dusmani yapilara cok daha sert vurur; duvar ormenin cezasi bu.
        const structureDamage = enemy.type === "siege"
          ? enemy.attack * SIEGE_STRUCTURE_DAMAGE_MULTIPLIER
          : enemy.attack;
        this.damageTower(route.targetTower, structureDamage);
        enemy.towerAttackCooldownMs = ENEMY_TOWER_ATTACK_INTERVAL_MS;
      }
    }
  }

  private getCrystalNodes() {
    const origin = getMapOrigin(this.activeMap);
    const { gridSize } = getMapMetrics(this.activeMap);
    const columns = [0.2, 0.5, 0.8];
    return columns.map((ratio, index) => ({
      id: `crystal-${index + 1}`,
      x: origin.x + Math.max(1, Math.min(this.activeMap.cols - 2, Math.round((this.activeMap.cols - 1) * ratio))) * gridSize + gridSize / 2,
      y: origin.y + Math.max(2, Math.min(this.activeMap.rows - 3, Math.round((this.activeMap.rows - 1) * (index % 2 === 0 ? 0.35 : 0.62)))) * gridSize + gridSize / 2
    }));
  }

  private getAmmoNodes() {
    const origin = getMapOrigin(this.activeMap);
    const { gridSize } = getMapMetrics(this.activeMap);
    const columns = [0.14, 0.56, 0.86];
    return columns.map((ratio, index) => ({
      id: `ammo-source-${index + 1}`,
      x: origin.x + Math.max(1, Math.min(this.activeMap.cols - 2, Math.round((this.activeMap.cols - 1) * ratio))) * gridSize + gridSize / 2,
      y: origin.y + Math.max(2, Math.min(this.activeMap.rows - 3, Math.round((this.activeMap.rows - 1) * (index % 2 === 0 ? 0.68 : 0.28)))) * gridSize + gridSize / 2
    }));
  }

  private ensureLogisticsWorkers() {
    const baseWorkerModes: Array<DroneSnapshot["mode"]> = ["ammoTransport", "crystalCollector", "ammoCollector", "energyTransport"];
    const origin = getMapOrigin(this.activeMap);
    const { gridSize } = getMapMetrics(this.activeMap);
    for (const ownerId of this.state.players.keys()) {
      const player = this.state.players.get(ownerId);
      // Temel dort isciden sonrakiler: magazadan gelen besinci ve altinla
      // alinanlar. Her birinin anahtari ayri olmali, yoksa ayni rolu iki kez
      // alan oyuncunun ikinci iscisi birincisinin uzerine yazilirdi.
      const extraModes: Array<DroneSnapshot["mode"]> = [
        ...(player?.ownedShopItemIds.includes("besinci-isci") ? ["ammoTransport" as const] : []),
        ...(player?.hiredWorkerRoles ?? [])
      ];
      const workerModes = [...baseWorkerModes, ...extraModes];
      for (const [index, mode] of workerModes.entries()) {
        const suffix = index >= baseWorkerModes.length ? `:extra${index - baseWorkerModes.length}` : "";
        const id = `logistics-${ownerId}-${mode}${suffix}`;
        const exists = this.drones.has(id);
        if (exists) {
          continue;
        }
        this.drones.set(id, {
          id,
          ownerId,
          mode,
          x: origin.x + gridSize * (1.5 + index),
          y: origin.y + gridSize * (this.activeMap.rows - 1.5),
          vx: 0,
          vy: 0,
          damage: 0,
          repairAmount: 0,
          ttlMs: Number.POSITIVE_INFINITY,
          logisticsPhase: "pickup",
          cargo: 0,
          capacity: mode === "ammoTransport"
            ? AMMO_LOGISTICS_WORKER_CAPACITY
            : mode === "ammoCollector"
              ? AMMO_COLLECTOR_WORKER_CAPACITY
            : mode === "crystalCollector" || mode === "energyTransport"
              ? ENERGY_LOGISTICS_WORKER_CAPACITY
              : LOGISTICS_WORKER_CAPACITY,
          speed: LOGISTICS_WORKER_SPEED
        });
      }
    }
  }

  private moveLogisticsWorker(worker: DroneModel, targetX: number, targetY: number, seconds: number) {
    const dx = targetX - worker.x;
    const dy = targetY - worker.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= this.scaleWorldDistance(7)) {
      worker.x = targetX;
      worker.y = targetY;
      worker.vx = 0;
      worker.vy = 0;
      return true;
    }
    const speed = this.scaleWorldSpeed(worker.speed ?? LOGISTICS_WORKER_SPEED)
      * getModifierMultiplier(this.getWorkerModifiers(worker), "workerSpeed");
    worker.vx = (dx / Math.max(1, distance)) * speed;
    worker.vy = (dy / Math.max(1, distance)) * speed;
    worker.x += worker.vx * seconds;
    worker.y += worker.vy * seconds;
    return false;
  }

  private getPlayerTowerDefinitions(playerId: string) {
    return Array.from(this.towers.values()).filter((tower) => tower.ownerId === playerId).map((tower) => tower.definition);
  }

  private openPlayerSetupShop(playerId: string, player: Player) {
    player.shopRerolls = 0;
    player.shopOffers = drawShopOffers({ wave: this.wave, preferredAxes: getCharacterCardAxes(player.characterId), towers: this.getPlayerTowerDefinitions(playerId), ownedItemIds: player.ownedShopItemIds });
  }

  private rerollShop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !this.setupPhase) return;
    const price = getShopRerollPrice(player.shopRerolls);
    if (player.gold < price) return;
    player.gold -= price;
    player.goldSpent += price;
    player.shopRerolls += 1;
    player.shopOffers = drawShopOffers({ wave: this.wave, preferredAxes: getCharacterCardAxes(player.characterId), towers: this.getPlayerTowerDefinitions(client.sessionId), ownedItemIds: player.ownedShopItemIds });
  }

  private buyShopItem(client: Client, message: BuyShopItemMessage) {
    const player = this.state.players.get(client.sessionId);
    const item = message.itemId ? getShopItem(message.itemId) : undefined;
    if (!player || !item || !this.setupPhase || !player.shopOffers.some(({ id }) => id === item.id)) return;
    if (item.id === "riskli-yatirim" && this.teamHealth <= 10) return;
    const price = getShopItemPrice(item, player.ownedShopItemIds);
    if (player.gold < price) return;
    player.gold -= price;
    player.goldSpent += price;
    player.ownedShopItemIds.push(item.id);
    this.invalidateTowerGrants();

    // Kuleye takilan esyalar satin alinca hicbir sey yapmaz; envantere girer ve
    // etkisini ancak oyuncu bir kule sectiginde gosterir.
    if (!isGlobalShopItem(item)) {
      player.inventoryItemIds.push(item.id);
      player.shopOffers = player.shopOffers.filter(({ id }) => id !== item.id);
      client.send("shop:purchased", { itemId: item.id, price, toInventory: true });
      return;
    }

    player.runModifiers.push(...item.effects);
    // Kilit uzerinden okunuyor ki ayni kilidi veren baska bir esya ya da kart
    // eklendiginde burasi degismek zorunda kalmasin.
    if (item.unlocks?.includes("nexusShield")) player.nexusShieldCharges += 3;
    if (item.id === "bariyer" || item.id === "ziftli-zemin") {
      const charges = this.shopPlacementCharges.get(client.sessionId) ?? { bariyer: 0, "ziftli-zemin": 0 };
      charges[item.id] += 1;
      this.shopPlacementCharges.set(client.sessionId, charges);
      client.send("shop:placement-required", { itemId: item.id });
    }
    if (item.id === "riskli-yatirim" && this.teamHealth > 10) {
      this.teamHealth -= 10;
      player.gold += 200;
    }
    player.shopOffers = player.shopOffers.filter(({ id }) => id !== item.id);
    client.send("shop:purchased", { itemId: item.id, price });
  }

  /**
   * Envanterdeki bir esyayi secilen kuleye takar.
   *
   * Takma geri alinamaz oldugu icin dogrulama tamamen sunucuda: sahiplik, esyanin
   * gercekten envanterde olmasi, kulenin esyayla uyumlulugu ve 5'li tavan burada
   * kontrol edilir. Arayuz ayni `canEquipShopItem` kuralini kullandigi icin
   * normalde buraya reddedilecek bir istek gelmez.
   */
  private equipShopItem(client: Client, message: EquipShopItemMessage) {
    const player = this.state.players.get(client.sessionId);
    const item = message.itemId ? getShopItem(message.itemId) : undefined;
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!player || !item || !tower || tower.ownerId !== client.sessionId) return;

    const inventoryIndex = player.inventoryItemIds.indexOf(item.id);
    if (inventoryIndex < 0) return;

    const check = canEquipShopItem(item, tower.definition, tower.equippedShopItemIds);
    if (!check.ok) {
      client.send("inventory:equip-rejected", { itemId: item.id, towerId: tower.id, reason: check.reason });
      return;
    }

    player.inventoryItemIds.splice(inventoryIndex, 1);
    tower.equippedShopItemIds.push(item.id);
    this.invalidateTowerGrants();

    // Can bonusu mevcut cana oranli uygulanmali, yoksa hasarli bir kule esya
    // takildiginda tam cana donerdi.
    const healthAdd = item.effects
      .filter(({ stat }) => stat === "towerHealth")
      .reduce((sum, modifier) => sum + modifier.add, 0);
    if (healthAdd !== 0) {
      const before = 1 + getModifierAdd(this.getTowerRunModifiers(tower), "towerHealth");
      const ratio = (before + healthAdd) / Math.max(0.01, before);
      tower.maxHp *= ratio;
      tower.hp *= ratio;
    }

    tower.runModifiers.push(...item.effects);
    client.send("inventory:equipped", { itemId: item.id, towerId: tower.id });
  }

  private setTowerTargeting(client: Client, message: SetTowerTargetingMessage) {
    const player = this.state.players.get(client.sessionId);
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!player || !tower || tower.ownerId !== client.sessionId || !message.mode) return;
    if (tower.definition.engine?.attack.shape === "orbit") return;
    // Ilk, en guclu ve isaretli modlari her kulede aciktir; digerleri kilit ister.
    const requiredUnlock = message.mode === "first" || message.mode === "strongest" || message.mode === "marked"
      ? undefined
      : `targeting:${message.mode}` as Unlock;
    if (requiredUnlock && !this.towerHasUnlock(tower, requiredUnlock)) return;
    tower.targetingMode = message.mode;
  }

  private placeShopMapItem(client: Client, message: PlaceShopMapItemMessage) {
    if (!this.setupPhase || !message.itemId || typeof message.x !== "number" || typeof message.y !== "number") return;
    const charges = this.shopPlacementCharges.get(client.sessionId);
    if (!charges || charges[message.itemId] <= 0) return;
    const cell = worldToGrid(message.x, message.y, this.activeMap);
    if (!isInsideMap(this.activeMap, cell.col, cell.row) || getTile(this.activeMap, cell.col, cell.row) !== "road" || cell.row === 0 || cell.row === this.activeMap.rows - 1) return;
    const key = `${cell.col}:${cell.row}`;
    if (message.itemId === "ziftli-zemin") {
      if (this.tarredCells.has(key)) return;
      this.tarredCells.add(key);
    } else {
      // Tam kapatma artik yasak degil: yapilar gecilmez engel olmaktan cikip
      // pahali hucreler oldu, yani kapatmanin bedelini dusmanlar kirarak oder.
      setTile(this.activeMap, cell.col, cell.row, "tower");
      this.activePaths = buildRuntimePaths(this.activeMap);
      this.markNavigationDirty();
      this.broadcast("match:map", this.activeMap);
    }
    charges[message.itemId] -= 1;
  }

  private awardEnemyExperience(enemy: EnemyModel) {
    const players = Array.from(this.state.players.values());
    if (players.length === 0) {
      return;
    }

    const share = getEnemyExp(this.wave, enemy.type, enemy.movementKind) / players.length;
    for (const player of players) {
      player.experience = (player.experience ?? 0) + share;
    }
  }

  private updateLogisticsWorker(worker: DroneModel, seconds: number) {
    const capacity = this.getWorkerCapacity(worker);
    if (worker.mode === "crystalCollector") {
      const reactor = this.getCrystalWorkerReactor(worker);
      if (!reactor) {
        worker.vx = 0;
        worker.vy = 0;
        worker.extractionRemainingMs = undefined;
        return;
      }
      if (worker.logisticsPhase === "pickup") {
        if (reactor.energy >= reactor.maxEnergy) {
          worker.vx = 0;
          worker.vy = 0;
          worker.extractionRemainingMs = undefined;
          return;
        }
        const node = this.getCrystalNodes()
          .sort((left, right) => distanceSq(reactor.x, reactor.y, left.x, left.y) - distanceSq(reactor.x, reactor.y, right.x, right.y))[0];
        if (this.moveLogisticsWorker(worker, node.x, node.y, seconds)) {
          const extraction = advanceResourceExtraction(worker.extractionRemainingMs, seconds * 1000 * this.getWorkerGatherSpeedMultiplier(worker));
          worker.extractionRemainingMs = extraction.remainingMs;
          if (extraction.completed) {
            worker.cargo = Math.min(capacity, reactor.maxEnergy - reactor.energy);
            worker.logisticsPhase = "deliver";
            worker.extractionRemainingMs = undefined;
          }
        } else {
          worker.extractionRemainingMs = undefined;
        }
        return;
      }
      if (reactor.energy < reactor.maxEnergy && this.moveLogisticsWorker(worker, reactor.x, reactor.y, seconds)) {
        const delivered = Math.min(worker.cargo ?? 0, reactor.maxEnergy - reactor.energy);
        reactor.energy += delivered;
        worker.cargo = 0;
        worker.logisticsPhase = "pickup";
      }
      return;
    }

    if (worker.mode === "ammoCollector") {
      const factory = this.getAmmoCollectorFactory(worker);
      if (!factory) {
        worker.vx = 0;
        worker.vy = 0;
        worker.extractionRemainingMs = undefined;
        return;
      }
      if (worker.logisticsPhase === "pickup") {
        if (factory.rawAmmo >= factory.maxRawAmmo) {
          worker.vx = 0;
          worker.vy = 0;
          worker.extractionRemainingMs = undefined;
          return;
        }
        const node = this.getAmmoNodes()
          .sort((left, right) => distanceSq(factory.x, factory.y, left.x, left.y) - distanceSq(factory.x, factory.y, right.x, right.y))[0];
        if (this.moveLogisticsWorker(worker, node.x, node.y, seconds)) {
          const extraction = advanceResourceExtraction(worker.extractionRemainingMs, seconds * 1000 * this.getWorkerGatherSpeedMultiplier(worker));
          worker.extractionRemainingMs = extraction.remainingMs;
          if (extraction.completed) {
            worker.cargo = Math.min(capacity, factory.maxRawAmmo - factory.rawAmmo);
            worker.logisticsPhase = "deliver";
            worker.extractionRemainingMs = undefined;
          }
        } else {
          worker.extractionRemainingMs = undefined;
        }
        return;
      }
      if (factory.rawAmmo < factory.maxRawAmmo && this.moveLogisticsWorker(worker, factory.x, factory.y, seconds)) {
        const delivered = Math.min(worker.cargo ?? 0, factory.maxRawAmmo - factory.rawAmmo);
        factory.rawAmmo += delivered;
        worker.cargo = 0;
        worker.logisticsPhase = "pickup";
      }
      return;
    }

    if (worker.mode === "energyTransport") {
      if (worker.logisticsPhase === "pickup") {
        const reactor = Array.from(this.towers.values()).find((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && tower.definition.resourceProvider === "energy");
        if (reactor && this.moveLogisticsWorker(worker, reactor.x, reactor.y, seconds) && reactor.energy > 0) {
          const loaded = Math.min(capacity, reactor.energy);
          reactor.energy -= loaded;
          worker.cargo = loaded;
          worker.logisticsPhase = "deliver";
          worker.targetTowerId = "";
        }
        return;
      }
      const energyTargets = Array.from(this.towers.values())
        .filter((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && tower.definition.resourceProvider !== "energy" && tower.energy < tower.maxEnergy);
      const factoryMinimumEnergy = AMMO_FACTORY_ENERGY_PER_AMMO * AMMO_LOGISTICS_WORKER_CAPACITY;
      const underpoweredAmmoFactory = energyTargets.find((tower) => (
        tower.definition.resourceProvider === "ammunition" && tower.energy < factoryMinimumEnergy
      ));
      const target = (worker.targetTowerId ? this.towers.get(worker.targetTowerId) : undefined)
        ?? underpoweredAmmoFactory
        ?? energyTargets.sort((left, right) => left.energy / Math.max(1, left.maxEnergy) - right.energy / Math.max(1, right.maxEnergy))[0];
      if (!target) {
        worker.logisticsPhase = "pickup";
        return;
      }
      worker.targetTowerId = target.id;
      if (this.moveLogisticsWorker(worker, target.x, target.y, seconds)) {
        const delivered = Math.min(worker.cargo ?? 0, target.maxEnergy - target.energy);
        target.energy += delivered;
        worker.cargo = Math.max(0, (worker.cargo ?? 0) - delivered);
        worker.logisticsPhase = "pickup";
        worker.targetTowerId = "";
      }
      return;
    }

    if (worker.logisticsPhase === "pickup") {
      const factory = Array.from(this.towers.values()).find((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && tower.definition.resourceProvider === "ammunition");
      if (!factory || !this.moveLogisticsWorker(worker, factory.x, factory.y, seconds)) {
        return;
      }
      const target = Array.from(this.towers.values())
        .filter((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && !tower.definition.resourceProvider && tower.ammoLogisticsEnabled && tower.ammo < tower.maxAmmo)
        .sort((left, right) => left.ammo / Math.max(1, left.maxAmmo) - right.ammo / Math.max(1, right.maxAmmo))[0];
      if (target && factory.ammo > 0) {
        const loaded = Math.min(capacity, factory.ammo);
        factory.ammo -= loaded;
        worker.cargo = loaded;
        worker.cargoAmmoType = target.ammoType;
        worker.targetTowerId = target.id;
        worker.logisticsPhase = "deliver";
      }
      return;
    }
    const target = worker.targetTowerId ? this.towers.get(worker.targetTowerId) : undefined;
    if (!target || !target.ammoLogisticsEnabled) {
      worker.cargo = 0;
      worker.logisticsPhase = "pickup";
      worker.targetTowerId = "";
      return;
    }
    if (this.moveLogisticsWorker(worker, target.x, target.y, seconds)) {
      const delivered = Math.min(worker.cargo ?? 0, target.maxAmmo - target.ammo);
      target.ammo += delivered;
      worker.cargo = Math.max(0, (worker.cargo ?? 0) - delivered);
      worker.logisticsPhase = "pickup";
      worker.targetTowerId = "";
    }
  }

  /** Iscinin tek seferde tasidigi yuk; kart ve esyalarla buyur. */
  private getWorkerCapacity(worker: DroneModel) {
    const base = worker.capacity ?? LOGISTICS_WORKER_CAPACITY;
    return Math.max(1, base * getModifierMultiplier(this.getWorkerModifiers(worker), "workerCapacity"));
  }

  private getWorkerGatherSpeedMultiplier(worker: DroneModel) {
    return getModifierMultiplier(this.getWorkerModifiers(worker), "workerGatherSpeed");
  }

  private getCrystalWorkerReactor(worker: DroneModel) {
    const boundReactor = worker.targetTowerId ? this.towers.get(worker.targetTowerId) : undefined;
    if (boundReactor && boundReactor.ownerId === worker.ownerId && boundReactor.hp > 0 && boundReactor.definition.resourceProvider === "energy") {
      return boundReactor;
    }

    const reactor = Array.from(this.towers.values())
      .filter((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && tower.definition.resourceProvider === "energy")
      .sort((left, right) => distanceSq(worker.x, worker.y, left.x, left.y) - distanceSq(worker.x, worker.y, right.x, right.y))[0];
    worker.targetTowerId = reactor?.id ?? "";
    return reactor;
  }

  private getAmmoCollectorFactory(worker: DroneModel) {
    const boundFactory = worker.targetTowerId ? this.towers.get(worker.targetTowerId) : undefined;
    if (boundFactory && boundFactory.ownerId === worker.ownerId && boundFactory.hp > 0 && boundFactory.definition.resourceProvider === "ammunition") {
      return boundFactory;
    }

    const factory = Array.from(this.towers.values())
      .filter((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && tower.definition.resourceProvider === "ammunition")
      .sort((left, right) => distanceSq(worker.x, worker.y, left.x, left.y) - distanceSq(worker.x, worker.y, right.x, right.y))[0];
    worker.targetTowerId = factory?.id ?? "";
    return factory;
  }

  /**
   * Dusmanin bu tick ne yapacagi: yurumek, saldirmak ya da cikisa varmak.
   *
   * Yol artik dusman basina aranmiyor; ortak akis alanindan tek hucrelik yon
   * okunuyor. Alanin bilmedigi tek sey Abarti'nin kenar engeli: o kare kaplamaz,
   * iki hucre arasindaki gecisi kapatir. Alan hucre tabanli oldugu icin bu
   * durum adim atilirken ayrica kontrol ediliyor.
   */
  private findEnemyRoute(enemy: EnemyModel) {
    const start = worldToGrid(enemy.x, enemy.y, this.activeMap);
    if (start.row === this.activeMap.rows - 1) {
      const exitPoint = { x: enemy.x, y: this.getArenaBottom() + this.getMapCellRadius() };
      enemy.structureTargetId = undefined;
      return {
        cells: [start],
        reachedBottom: enemy.y >= exitPoint.y - 0.01,
        targetTower: undefined,
        exitPoint
      };
    }

    // Ucanlar akis alanini tumden yok sayar ve nexusa dogru ucar. Duvar
    // meta'sinin ana karsi-oyunu bu: yerde ne kadar kalin ordu olursa olsun
    // havadan gelen dusman onu gormez. Yapiya saldirmazlar da.
    if (enemy.movementKind === "air") {
      const nexus = this.activePaths[0]?.points.at(-1);
      const bounds = this.getActiveWorldBounds();
      return {
        cells: [start],
        reachedBottom: false,
        targetTower: undefined,
        exitPoint: nexus ?? { x: bounds.left + bounds.width / 2, y: bounds.bottom }
      };
    }

    const startTower = this.getTowerCellIndex().get(`${start.col}:${start.row}`);
    if (startTower && startTower.hp > 0) {
      // Yapinin ustunde duruyor: onu kirmadan ilerlemek yok.
      return { cells: [start], reachedBottom: false, targetTower: startTower };
    }
    // Yikilan yapinin hucresi artik bos: dusman ne saldirir ne de orada donar.

    // Kilitli hedef hala ayaktaysa ve komsuysa, karar yenilenmez.
    const locked = enemy.structureTargetId ? this.towers.get(enemy.structureTargetId) : undefined;
    if (locked && locked.hp > 0 && this.isStructureAdjacent(start, locked)) {
      return { cells: [start], reachedBottom: false, targetTower: locked };
    }
    enemy.structureTargetId = undefined;

    // Karar hucre basina bir kez verilir.
    //
    // Dusman bir hucreyi gecmek icin onlarca tick yuruyor, ama yonlendirme her
    // tick soruluyor. Her seferinde yeniden adimlamak gezgini ayni hucrede
    // dondurur: duvari tutmaya baslanan kareden bir sonraki tick yine ayni yon
    // secilir, cevrim tespiti "buraya ayni yonle geri donuldu" der ve dusman
    // daha kimildamadan onundeki duvari kirmaya baslar. Algoritma bir hucre =
    // bir adim varsayiyor; karari saklamak o varsayimi geri veriyor.
    const committed = enemy.navigatorStep;
    if (committed && committed.fromCol === start.col && committed.fromRow === start.row) {
      if (this.isCellWalkable(start, committed.toCol, committed.toRow)) {
        return { cells: [start, { col: committed.toCol, row: committed.toRow }], reachedBottom: false, targetTower: undefined, exitPoint: undefined };
      }
      // Oyuncu tam o araliga yapi kurmus: karar gecersiz.
      enemy.navigatorStep = undefined;
    }

    // Bu hucrenin turu daha once kapanmissa dolasmanin anlami yok: onceki
    // dusman oradan cikis olmadigini ogrendi ve haber verdi.
    if (this.sealedCells.has(`${start.col}:${start.row}`)) {
      enemy.navigatorStep = undefined;
      return this.breakThrough(enemy, start, { col: start.col, row: start.row + 1 });
    }

    // Kor gezinme: dusman haritayi bilmiyor, cikisa dogru yuruyup onune
    // cikani duvar tutarak dolasiyor.
    enemy.navigator ??= createBlindNavigatorState(this.pickNavigatorHand());
    const result = stepBlindNavigator(
      start,
      enemy.navigator,
      (col, row) => this.isCellWalkable(start, col, row),
      () => this.pickNavigatorHand()
    );
    enemy.navigator = result.state;

    if (result.kind === "move") {
      enemy.navigatorStep = { fromCol: start.col, fromRow: start.row, toCol: result.col, toRow: result.row };
      return { cells: [start, { col: result.col, row: result.row }], reachedBottom: false, targetTower: undefined, exitPoint: undefined };
    }

    // Cevrim kapandi ya da dort yan da kapali: bu yoldan cikis yok.
    enemy.navigatorStep = undefined;
    this.rememberSealedCell(enemy.navigator);
    return this.breakThrough(enemy, start, { col: result.col, row: result.row });
  }

  /**
   * Dolasmak bitti, kirma basliyor.
   *
   * Once onundeki yapiyi, yoksa herhangi bir komsu yapiyi hedefler ve kilitler.
   * Kilit yalpalamayi onler: hedef her tick yeniden secilseydi hasar aldikca
   * secim degisir ve dusman hicbir duvari bitiremezdi.
   */
  private breakThrough(enemy: EnemyModel, start: { col: number; row: number }, ahead: { col: number; row: number }) {
    const blocker = this.getBlockingTowerBetween(start, ahead)
      ?? this.getTowerCellIndex().get(`${ahead.col}:${ahead.row}`)
      ?? this.findCheapestAdjacentStructure(start);
    const target = blocker && blocker.hp > 0 ? blocker : undefined;
    if (target) {
      enemy.structureTargetId = target.id;
    }
    return { cells: [start], reachedBottom: false, targetTower: target, exitPoint: undefined };
  }

  /**
   * Hucre yurunebilir mi.
   *
   * Gezinme acisindan tahta disi, yapiyla dolu ve tur boyunca kapali isaretlenmis
   * hucreler ayni sey: gecilemez. Kenara oturan yapilar hucreyi doldurmadigi
   * icin ayrica iki hucre arasindaki gecis de sorulur.
   */
  private isCellWalkable(from: { col: number; row: number }, col: number, row: number) {
    if (col < 0 || col >= this.activeMap.cols || row < 0 || row >= this.activeMap.rows) {
      return false;
    }
    const standing = this.getTowerCellIndex().get(`${col}:${row}`);
    if (standing && standing.hp > 0) {
      return false;
    }
    return !this.getBlockingTowerBetween(from, { col, row });
  }

  /** Ilk temasta el secimi: yarisi saga, yarisi sola. */
  private pickNavigatorHand(): BlindHand {
    return Math.random() < 0.5 ? "left" : "right";
  }

  /**
   * Kapali cikis hafizasi.
   *
   * Cevrimi kapatan dusman, girdigi hucreyi tur boyunca kapali isaretler ve
   * arkadan gelenler ayni turu bastan atmaz. Oyuncu hatti acinca hafiza
   * temizlenir ve dusmanlar yeniden iki yana esit dagilir.
   */
  private rememberSealedCell(state: BlindNavigatorState) {
    if (state.mode === "wall" && state.entryCol >= 0 && state.entryRow >= 0) {
      this.sealedCells.add(`${state.entryCol}:${state.entryRow}`);
    }
  }

  private isStructureAdjacent(cell: { col: number; row: number }, tower: TowerModel) {
    return this.getTowerFootprintCells(tower.x, tower.y, tower.definition.id, tower.orientation)
      .some((footprint) => Math.abs(footprint.col - cell.col) + Math.abs(footprint.row - cell.row) <= 1);
  }

  /**
   * Tikanan dusmanin kiracagi yapi.
   *
   * Komsular sabit sirada taranir ve ilk ayakta olan yapi secilir; esitlikte
   * hangi yapinin secildigi belirlenimli olmak zorunda, aksi halde cok
   * oyunculuda iki sunucu ayni durumdan farkli sonuca gider.
   */
  private findCheapestAdjacentStructure(cell: { col: number; row: number }) {
    for (const neighbor of this.getGridNeighbors(cell.col, cell.row)) {
      const tower = this.getTowerCellIndex().get(`${neighbor.col}:${neighbor.row}`)
        ?? this.getBlockingTowerBetween(cell, neighbor);
      if (tower && tower.hp > 0) return tower;
    }
    return undefined;
  }

  private reconstructGridRoute(end: { col: number; row: number }, start: { col: number; row: number }, parent: Map<string, { col: number; row: number }>) {
    const route = [end];
    let current = end;
    while (current.col !== start.col || current.row !== start.row) {
      const previous = parent.get(`${current.col}:${current.row}`);
      if (!previous) {
        break;
      }
      route.push(previous);
      current = previous;
    }
    return route.reverse();
  }

  private getGridNeighbors(col: number, row: number) {
    return [
      { col, row: row + 1 },
      { col: col - 1, row },
      { col: col + 1, row },
      { col, row: row - 1 }
    ].filter((cell) => isInsideMap(this.activeMap, cell.col, cell.row));
  }

  /**
   * Hucreyi kaplayan yapi.
   *
   * Cevap zaten `towerCellIndex`te duruyor ve ayni sozlugu `findEnemyRoute` de
   * okuyor. Burasi ise her cagrida butun yapilari gezip her biri icin ayak izi
   * uretiyordu; dusman basina bir kez cagrildigi icin maliyet dusman x yapi
   * olarak buyuyordu.
   *
   * Kenara oturan yapilar indekse hic girmez -- kare kaplamadiklari icin bu
   * sorunun cevabi olamazlar -- yani eski koddaki Abarti ayiklamasi da indeksin
   * kendisinde karsilaniyor.
   */
  private getTowerAtCell(col: number, row: number) {
    return this.getTowerCellIndex().get(`${col}:${row}`);
  }

  /**
   * Iki hucre arasindaki gecisi kapatan yapi.
   *
   * Yikilmis yapi engel degildir: cani sifira inen bir duvarin karesinden
   * gecilebilir. Bunu atlamak dusmanlarin kirdiklari duvara saldirmaya devam
   * etmesine yol aciyordu.
   */
  private getBlockingTowerBetween(from: { col: number; row: number }, to: { col: number; row: number }) {
    const occupiedTower = this.getTowerAtCell(to.col, to.row);
    if (occupiedTower && occupiedTower.hp > 0) {
      return occupiedTower;
    }

    // Kenara oturan her yapi gecisi kapatir, yalnizca Abarti degil. Bu esleme
    // `edgeStructureIndex`te hazir: akis alani gecis maliyetini zaten oradan
    // okuyor, dolayisiyla ayni soruyu burada yapilari tarayarak sormak ayni
    // cevabi pahaliya uretmekti. Can kontrolu indekste de var; burada tekrar
    // edilmesi gecersizlestirme atlanirsa yikik duvarin engel gorunmesini
    // onler.
    const edgeStructure = this.getEdgeStructure(from, to);
    return edgeStructure && edgeStructure.hp > 0 ? edgeStructure : undefined;
  }

  private getMapCellRadius() {
    return getMapGridSize(this.activeMap) / 2;
  }

  private getArenaBottom() {
    const origin = getMapOrigin(this.activeMap);
    return origin.y + this.activeMap.rows * getMapGridSize(this.activeMap);
  }

  /**
   * Gedik acildiginda oyuncuyu uyarir.
   *
   * Bir defa yayilir: esik asagi dogru gecildiginde. Her tick tekrar yaymak
   * uyariyi gurultuye cevirir ve oyuncu onemli olani kacirir. Onarilan yapi
   * esigin uzerine cikinca bayrak dusrer, yani ikinci kez kirilirsa yeniden
   * uyarilir.
   */
  private announceStructureBreach(tower: TowerModel) {
    const ratio = tower.maxHp > 0 ? tower.hp / tower.maxHp : 0;
    if (ratio > STRUCTURE_BREACH_HEALTH_RATIO) {
      tower.breachAnnounced = false;
      return;
    }
    if (tower.breachAnnounced || tower.hp <= 0) return;

    tower.breachAnnounced = true;
    this.broadcast("structure:breach", {
      towerId: tower.id,
      ownerId: tower.ownerId,
      definitionId: tower.definition.id,
      x: Math.round(tower.x),
      y: Math.round(tower.y),
      healthRatio: Math.round(ratio * 100) / 100
    });
  }

  /**
   * Hasarli yapiyi onarir.
   *
   * Yikilmis yapi onarilamaz -- oyuncu onu yeniden insa etmek zorunda. Ayakta
   * kalani onarmak yeniden insadan ucuz oldugu icin dalga arasi bakim anlamli
   * bir karar olur.
   */
  /**
   * Isci alimi.
   *
   * Rol alim aninda secilir ve sonradan degismez: karar geri alinabilir olsaydi
   * oyuncu her dalgada lojistigini bedava yeniden dagitir, secim de kararligini
   * yitirirdi. Bedel alinan isci sayisiyla buyur.
   */
  /**
   * Ucube seviye secimi.
   *
   * Secim kule basina: ayni oyuncunun iki Ucube'si ayri duzenler tasiyabilir.
   * Bekleyen seviye disindaki istekler yok sayilir, yani bir kademe iki kez
   * alinamaz ve secilmeyen secenek sonradan geri gelmez.
   */
  private chooseUcubePerk(client: Client, message: ChooseUcubePerkMessage) {
    const tower = message?.towerId ? this.towers.get(message.towerId) : undefined;
    if (!tower || tower.ownerId !== client.sessionId || tower.definition.id !== "warrior-6") {
      return;
    }
    if (tower.ucubePendingLevel <= 0 || !message.perkId) {
      return;
    }
    if (!isUcubePerkOption(tower.ucubePendingLevel, message.perkId)) {
      return;
    }

    tower.ucubePerks.push(message.perkId);
    tower.ucubePendingLevel = 0;

    if (message.perkId === "range-hull") {
      tower.maxHp *= 2;
      tower.hp = tower.maxHp;
    }
  }

  private hireWorker(client: Client, message: HireWorkerMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !isHirableWorkerRole(message?.role)) {
      return;
    }
    const cost = getWorkerHireCost(player.hiredWorkerRoles.length);
    if (player.gold < cost) {
      return;
    }

    player.gold -= cost;
    player.goldSpent += cost;
    player.hiredWorkerRoles.push(message.role);
    // Isci hemen sahaya ciksin: bir sonraki dalgayi beklemek alimin etkisini
    // oyuncunun goremedigi bir yere ertelerdi.
    this.ensureLogisticsWorkers();
    client.send("worker:hired", { role: message.role, cost });
  }

  private repairStructure(client: Client, message: RepairStructureMessage) {
    const player = this.state.players.get(client.sessionId);
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!player || !tower || tower.ownerId !== client.sessionId) return;
    if (tower.hp <= 0 || tower.hp >= tower.maxHp) return;

    const missingRatio = 1 - tower.hp / tower.maxHp;
    const cost = getStructureRepairCost(getTowerBuildCost(tower.definition.cost), missingRatio);
    if (cost <= 0 || player.gold < cost) return;

    player.gold -= cost;
    player.goldSpent += cost;
    tower.hp = tower.maxHp;
    tower.breachAnnounced = false;
    // Yol maliyeti kalan cana bagli: onarim akisi da degistirir.
    this.markNavigationDirty();
    client.send("structure:repaired", { towerId: tower.id, cost });
  }

  private damageTower(tower: TowerModel, rawDamage: number) {
    if (tower.hp <= 0) {
      return;
    }
    const effectiveArmor = applyTowerAuraModifier(tower.armor, this.getTowerAuraModifiers(tower), "armor");
    tower.hp = Math.max(0, tower.hp - Math.max(1, rawDamage - effectiveArmor));
    // Yol maliyeti kalan cana bagli oldugu icin her hasar alani eskitir.
    this.markNavigationDirty();
    this.announceStructureBreach(tower);
    if (tower.hp <= 0) {
      tower.cooldownMs = 0;
      tower.focusTargetId = "";
      tower.linkedTowerIds = [];
      this.runTowerTriggers(tower, "towerDeath");
      if (this.towerHasUnlock(tower, "trigger:debrisOnDeath")) {
        const cell = worldToGrid(tower.x, tower.y, this.activeMap);
        this.debrisCells.set(`${cell.col}:${cell.row}`, Date.now() + 12000);
      }
    }
  }

  private runEnemyEscapeTriggers(enemy: EnemyModel, now: number) {
    for (const tower of this.towers.values()) {
      if (tower.focusTargetId === enemy.id) {
        this.runTowerTriggers(tower, "escape", { target: enemy, now });
      }
    }
  }

  private applyDominatedEnemyAura(source: EnemyModel, seconds: number) {
    const damage = source.maxHp * 0.05 * MELIS_BULLY_DAMAGE_MULTIPLIER * seconds;
    const radius = this.scaleWorldDistance(MELIS_BULLY_DAMAGE_RADIUS);
    for (const enemy of Array.from(this.enemies.values())) {
      if (enemy.id === source.id || enemy.dominatedUntil > Date.now()) {
        continue;
      }

      if (distanceSq(source.x, source.y, enemy.x, enemy.y) <= radius * radius) {
        this.damageEnemy(enemy, damage, 0, "archer-skill-bully", source.dominatedOwnerId, "true");
      }
    }
  }

  /**
   * Oyuncunun kule kontenjani. Hem kuralin kendisi hem de istemciye giden
   * anlik goruntu buradan okuyor; iki yerde ayri hesaplanirsa onizleme ile
   * sunucu kurali ayrisir.
   */
  private getPlayerTowerLimit(player: Player) {
    return PLAYER_TOWER_LIMIT + Math.floor(getModifierAdd(player.runModifiers, "towerCapacity"));
  }

  private placeTower(client: Client, message: PlaceTowerMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || typeof message.x !== "number" || typeof message.y !== "number" || !message.definitionId) {
      return;
    }

    const towerLimit = this.getPlayerTowerLimit(player);
    const requested = this.findTowerDefinition(player.characterId, message.definitionId);
    // Duvar kontenjandan yer kapmaz; sinir yalnizca savas kuleleri icin.
    if (requested && occupiesTowerSlot(requested)) {
      const currentTowerCount = Array.from(this.towers.values())
        .filter((tower) => tower.ownerId === client.sessionId && occupiesTowerSlot(tower.definition))
        .length;
      if (currentTowerCount >= towerLimit) {
        return;
      }
    }

    const definition = this.findTowerDefinition(player.characterId, message.definitionId);
    const buildCost = definition ? getTowerBuildCost(definition.cost) : Number.POSITIVE_INFINITY;
    // Duvarin yonu oyuncunun sectigi bir sey degil, birakildigi kenarin
    // kendisi; istemciden gelen degere guvenmek yerine konumdan turetiliyor.
    const orientation = definition?.id === WALL_TOWER_ID
      ? this.getEdgeOrientationAt(message.x, message.y)
      : getTowerPlacementOrientation(definition?.id, message.orientation);
    const placement = this.snapToTowerGrid(message.x, message.y, definition?.id, orientation);
    if (!definition || player.gold < buildCost || !this.canPlaceTower(placement.x, placement.y, definition.id, orientation)) {
      return;
    }

    const applicableHealthModifiers = player.runModifiers.filter((modifier) => {
      if (!modifier.source.startsWith("shop:")) return true;
      const item = getShopItem(modifier.source.slice(5));
      return !item || item.scope.kind === "global" || shopItemAppliesToTower(item, definition);
    });
    // Duvarin cani kule tabanindan yuksek ve kalinlastirmayla buyur; kart ve
    // esya can bonuslari duvara da isler, yani duvar ormek roguelike katmaniyla
    // gercek bir sinerji tasir.
    const towerHealth = TOWER_BASE_HP
      * getStructureHealthMultiplier(definition, 1)
      * getModifierMultiplier(applicableHealthModifiers, "towerHealth");
    const tower: TowerModel = {
      id: `t${this.nextTowerId++}`,
      ownerId: client.sessionId,
      ownerName: player.name,
      characterId: player.characterId,
      definition,
      x: placement.x,
      y: placement.y,
      orientation,
      hp: towerHealth,
      maxHp: towerHealth,
      armor: TOWER_BASE_ARMOR,
      ammoType: inferTowerAmmoType(definition),
      ammo: definition.resourceProvider ? RESOURCE_PROVIDER_INITIAL_STOCK : TOWER_BASE_AMMO,
      maxAmmo: definition.resourceProvider === "ammunition" ? RESOURCE_PROVIDER_CAPACITY : definition.resourceProvider ? 0 : TOWER_BASE_AMMO,
      energy: definition.resourceProvider === "ammunition"
        ? AMMO_FACTORY_INITIAL_ENERGY
        : definition.resourceProvider ? RESOURCE_PROVIDER_INITIAL_STOCK : TOWER_BASE_ENERGY,
      maxEnergy: definition.resourceProvider ? RESOURCE_PROVIDER_CAPACITY : TOWER_BASE_ENERGY,
      energyDepletedAt: 0,
      standby: false,
      wakeReadyAt: 0,
      ammoLogisticsEnabled: true,
      temperature: 0,
      misfortune: 0,
      luckyWindowUntil: 0,
      lastLuckMultiplier: 1,
      bladeAngle: 0,
      orbitLastHitAt: new Map(),
      performance: 0.5,
      heatLocked: false,
      rawAmmo: RESOURCE_PROVIDER_INITIAL_STOCK,
      maxRawAmmo: definition.resourceProvider === "ammunition" ? RESOURCE_PROVIDER_CAPACITY : 0,
      level: 1,
      cooldownMs: 150,
      auraExpiresAt: 0,
      focusTargetId: "",
      aimTargetId: "",
      aimTargetLockUntil: 0,
      aimTargetHasFired: false,
      focusStacks: 0,
      stackStates: {},
      triggerCooldowns: {},
      runModifiers: [],
      targetedCardIds: [],
      equippedShopItemIds: [],
      targetingMode: definition.engine?.targeting ?? "first",
      shopKillStacks: 0,
      shopWaveStacks: 0,
      activeMs: 0,
      overheatMs: 0,
      offlineUntil: 0,
      debugOverdriveUntil: 0,
      debugSweepStartedAt: 0,
      debugSweepTargetIds: [],
      debugSweepAngle: 0,
      debugSweepAngleAt: 0,
      debugSweepDamageAngle: 0,
      debugSweepDamageAngleAt: 0,
      debugSweepLastDamageAt: 0,
      debugOverdriveHeatLastAt: 0,
      debugOverdriveHeatSegments: [],
      linkBurstCooldownMs: 0,
      ucubePerks: [],
      ucubePendingLevel: 0,
      linkedTowerIds: [],
      linkedTowerWaveAges: {},
      rangeMemoryEnemyIds: [],
      streakDamageUntil: 0,
      streakDamageMultiplier: 1,
      streakHasteUntil: 0,
      streakHasteMultiplier: 1,
      zeynepFormationSize: 0,
      zeynepFormationLevel: 0,
      melisEvolutionLevel: 0,
      melisUnderworldMode: "approval",
      melisUnderworldTargetIds: [],
      melisUnderworldPullCount: 0,
      melisUnderworldChainLastAt: 0,
      melisFocusUntil: 0,
      melisFocusTargetId: "",
      melisFocusKillHasteUntil: 0,
      melisMirrorCharge: 0,
      facing: Math.PI / 2,
      damageDealt: 0,
      damageWindow: []
    };

    this.towers.set(tower.id, tower);
    this.markNavigationDirty();
    this.broadcastTowerSpawn(tower);
    this.registerMelisFavoriteTower(tower);
    player.gold -= buildCost;
    player.goldSpent += buildCost;
    if (occupiesTowerSlot(definition)) {
      player.towersBuilt += 1;
    }
  }

  private upgradeTower(client: Client, message: UpgradeTowerMessage) {
    if (!message.towerId) {
      return;
    }

    const player = this.state.players.get(client.sessionId);
    const tower = this.towers.get(message.towerId);
    if (!player || !tower || tower.ownerId !== client.sessionId || tower.level >= MAX_TOWER_LEVEL) {
      return;
    }

    const cost = getTowerLevelExpCost(tower.definition.cost, tower.level);
    const goldCost = getTowerLevelGoldCost(tower.definition.cost, tower.level);
    if (player.experience < cost || player.gold < goldCost) {
      return;
    }

    player.experience = Math.max(0, player.experience - cost);
    player.gold -= goldCost;
    player.goldSpent += goldCost;
    tower.level += 1;
    if (tower.definition.id === "warrior-6" && getUcubePerkTier(tower.level)) {
      tower.ucubePendingLevel = tower.level;
      client.send("ucube:choice", { towerId: tower.id, level: tower.level });
    }
    // Kalinlastirma: duvarin can tavani seviyeyle buyur ve fark cana yansir.
    const healthRatio = getStructureHealthMultiplier(tower.definition, tower.level)
      / getStructureHealthMultiplier(tower.definition, tower.level - 1);
    if (healthRatio !== 1) {
      tower.maxHp *= healthRatio;
      tower.hp *= healthRatio;
      this.markNavigationDirty();
    }
  }

  private sellTower(client: Client, message: SellTowerMessage) {
    if (!message.towerId) {
      return;
    }

    const player = this.state.players.get(client.sessionId);
    const tower = this.towers.get(message.towerId);
    if (!player || !tower || tower.ownerId !== client.sessionId) {
      return;
    }

    const refund = getTowerSellRefund(tower.definition.cost, tower.level, tower.definition.id);
    player.gold += refund;
    player.goldSpent = Math.max(0, player.goldSpent - refund);
    if (occupiesTowerSlot(tower.definition)) {
      player.towersBuilt = Math.max(0, player.towersBuilt - 1);
    }
    this.removeTowerReferences(tower.id);
    this.towers.delete(tower.id);
    this.markNavigationDirty();
    this.broadcast("tower:remove", { id: tower.id });
  }

  private setTowerMode(client: Client, message: TowerModeMessage) {
    if (!message.towerId || !message.mode) {
      return;
    }

    const tower = this.towers.get(message.towerId);
    if (!tower || tower.ownerId !== client.sessionId) {
      return;
    }

    if (message.mode === "standby") {
      if (tower.definition.resourceProvider) return;
      tower.standby = !tower.standby;
      tower.wakeReadyAt = tower.standby ? 0 : Date.now() + 3500;
      return;
    }

    if (tower.definition.id !== "archer-4") return;

    tower.melisUnderworldMode = message.mode;
  }

  private removeTowerReferences(towerId: string) {
    for (const [ownerId, favoriteTowerIds] of this.melisFavoriteTowerIds) {
      this.melisFavoriteTowerIds.set(ownerId, favoriteTowerIds.filter((favoriteTowerId) => favoriteTowerId !== towerId));
    }

    for (const tower of this.towers.values()) {
      tower.linkedTowerIds = tower.linkedTowerIds.filter((linkedTowerId) => linkedTowerId !== towerId);
      delete tower.linkedTowerWaveAges[towerId];
      tower.rangeMemoryEnemyIds = tower.rangeMemoryEnemyIds.filter((enemyId) => enemyId !== towerId);
      if (tower.focusTargetId === towerId) {
        tower.focusTargetId = "";
      }
    }
  }

  private refactorTower(client: Client, message: UseSkillMessage) {
    if (!message.towerId || typeof message.x !== "number" || typeof message.y !== "number") {
      return false;
    }

    const tower = this.towers.get(message.towerId);
    const { x, y } = this.snapToTowerGrid(message.x, message.y, tower?.definition.id, tower?.orientation);
    if (!tower || tower.ownerId !== client.sessionId || !this.canPlaceTower(x, y, tower.definition.id, tower.orientation, tower.id)) {
      return false;
    }

    tower.x = x;
    tower.y = y;
    tower.cooldownMs = Math.min(tower.cooldownMs, 150);
    tower.rangeMemoryEnemyIds = [];
    this.broadcastTowerSpawn(tower);
    return true;
  }

  private linkServerTower(client: Client, message: LinkServerMessage) {
    if (!message.serverTowerId || !message.targetTowerId || message.serverTowerId === message.targetTowerId) {
      return;
    }

    const serverTower = this.towers.get(message.serverTowerId);
    const targetTower = this.towers.get(message.targetTowerId);

    if (
      !serverTower ||
      !targetTower ||
      serverTower.ownerId !== client.sessionId ||
      !this.canLinkTower(serverTower, targetTower)
    ) {
      return;
    }

    const existingIndex = serverTower.linkedTowerIds.indexOf(targetTower.id);
    if (existingIndex >= 0) {
      serverTower.linkedTowerIds.splice(existingIndex, 1);
      delete serverTower.linkedTowerWaveAges[targetTower.id];
      return;
    }

    if (serverTower.linkedTowerIds.length >= 2) {
      const removedTowerId = serverTower.linkedTowerIds.shift();
      if (removedTowerId) {
        delete serverTower.linkedTowerWaveAges[removedTowerId];
      }
    }
    serverTower.linkedTowerIds.push(targetTower.id);
    serverTower.linkedTowerWaveAges[targetTower.id] = serverTower.linkedTowerWaveAges[targetTower.id] ?? 0;
    targetTower.rangeMemoryEnemyIds = [];
  }

  private canLinkTower(sourceTower: TowerModel, targetTower: TowerModel) {
    if (sourceTower.definition.id === "warrior-2") {
      return targetTower.definition.id !== "warrior-2";
    }

    return false;
  }

  private useSkill(client: Client, message: UseSkillMessage) {
    const player = this.state.players.get(client.sessionId);
    const slot = typeof message.slot === "number" ? Math.floor(message.slot) : -1;
    if (!player || slot < 0 || slot > 2 || this.getSkillCooldown(player, slot) > 0) {
      return;
    }

    const skill = characters.find((character) => character.id === player.characterId)?.skills[slot];
    if (!skill) {
      return;
    }

    this.setSkillCooldown(player, slot, skill.cooldownMs);

    if (player.characterId === "warrior") {
      const didUseSkill = this.useAtakanSkill(client, slot, message);
      if (!didUseSkill) {
        this.setSkillCooldown(player, slot, 0);
      }
      return;
    }

    if (player.characterId === "zeynep") {
      const didUseCommand = this.useZeynepCommand(player, slot, message);
      if (!didUseCommand) {
        this.setSkillCooldown(player, slot, 0);
      }
      return;
    }

    if (player.characterId === "archer") {
      const didUseMelisSkill = this.useMelisSkill(client, player, slot, message);
      if (!didUseMelisSkill) {
        this.setSkillCooldown(player, slot, 0);
      }
      return;
    }

    if (slot === 0) {
      player.gold += 22;
      return;
    }

    if (slot === 1) {
      this.useSecondSkill(player.characterId, client.sessionId);
      return;
    }

    this.useThirdSkill(player.characterId, client.sessionId);
  }

  private useSecondSkill(characterId: CharacterId, ownerId: string) {
    if (characterId === "archer") {
      this.damageFrontEnemies(5, 55, 0, ownerId);
    } else if (characterId === "mage") {
      this.damageAllEnemies(50, 0, ownerId);
    } else if (characterId === "healer") {
      this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + 14);
      this.slowAllEnemies(1300);
    } else if (characterId === "tank") {
      this.damageAllEnemies(28, 2100, ownerId);
    } else if (characterId === "onur") {
      this.damageStrongestEnemy(120, 0, ownerId);
    } else {
      this.damageAllEnemies(15, 0, ownerId);
    }
  }

  private useAtakanSkill(client: Client, slot: number, message: UseSkillMessage) {
    const now = Date.now();

    if (slot === 0) {
      if (typeof message.x !== "number" || typeof message.y !== "number") {
        return false;
      }
      this.projectileGuidanceUntil = Math.max(this.projectileGuidanceUntil, now + scaleGameDuration(3000));
      const bounds = this.getActiveWorldBounds();
      this.projectileGuidanceX = this.clamp(message.x, bounds.left, bounds.right);
      this.projectileGuidanceY = this.clamp(message.y, bounds.top, bounds.bottom);
      return true;
    }

    if (slot === 1) {
      return this.refactorTower(client, message);
    }

    this.silentModeUntil = Math.max(this.silentModeUntil, now + scaleGameDuration(5000));
    this.damageHasteUntil = Math.max(this.damageHasteUntil, now + scaleGameDuration(10000));
    return true;
  }

  private useZeynepCommand(player: Player, slot: number, message: UseSkillMessage) {
    const now = Date.now();
    const commandType = getZeynepCommandType(slot);
    const isFinisher = player.authorityChain >= 2;
    const tier = getRequestedZeynepCommandTier(message.commandTier);
    const cost = getZeynepCommandCost(tier);
    if (player.reputation < cost) {
      return false;
    }

    player.reputation = Math.max(0, player.reputation - cost);
    this.applyZeynepCommand(commandType, tier, isFinisher, player.authorityQuality, now);

    if (isFinisher) {
      player.authorityQuality = Math.min(ZEYNEP_MAX_AUTHORITY_QUALITY, player.authorityQuality + 1);
      player.authorityChain = 0;
    } else {
      player.authorityChain = Math.min(2, player.authorityChain + 1);
    }

    return true;
  }

  private applyZeynepCommand(commandType: ZeynepCommandType, tier: ZeynepCommandTier, chained: boolean, authorityQuality: number, now: number) {
    const profile = getZeynepCommandProfile(commandType, tier, chained, authorityQuality);
    if (commandType === "haste") {
      this.applyZeynepHaste(profile.durationMs, profile.multiplier, tier, now);
      return;
    }
    if (commandType === "range") {
      this.applyZeynepRange(profile.durationMs, profile.multiplier, tier, now);
      return;
    }
    this.applyZeynepSlow(profile.durationMs, profile.multiplier, tier, now);
  }

  private useMelisSkill(client: Client, player: Player, slot: number, message: UseSkillMessage) {
    if (slot === 0) {
      return this.useMelisBully(client.sessionId, message);
    }

    if (slot === 1) {
      return this.evolveMelisTower(client.sessionId, player, message.towerId);
    }

    if (slot === 2) {
      return this.useMelisFocus(client.sessionId);
    }

    return false;
  }

  private useMelisBully(ownerId: string, message: UseSkillMessage) {
    if (typeof message.x !== "number" || typeof message.y !== "number") {
      return false;
    }

    const radius = this.scaleWorldDistance(MELIS_BULLY_RADIUS);
    const target = Array.from(this.enemies.values())
      .filter((enemy) => enemy.type === "brute" && enemy.dominatedUntil <= Date.now() && distanceSq(enemy.x, enemy.y, message.x!, message.y!) <= radius * radius)
      .sort((a, b) => b.maxHp - a.maxHp || b.pathDistance - a.pathDistance)[0];
    if (!target) {
      return false;
    }

    target.dominatedUntil = Date.now() + scaleGameDuration(MELIS_BULLY_DURATION_MS);
    target.dominatedOwnerId = ownerId;
    target.fearUntil = 0;
    target.slowUntil = 0;
    return true;
  }

  private evolveMelisTower(ownerId: string, player: Player, towerId?: string) {
    if (!towerId) {
      return false;
    }

    const tower = this.towers.get(towerId);
    if (!tower || tower.ownerId !== ownerId || tower.characterId !== "archer" || tower.melisEvolutionLevel >= MELIS_MAX_EVOLUTION_LEVEL) {
      return false;
    }

    if (!this.canMelisEvolveNextLevel(player, tower.melisEvolutionLevel + 1)) {
      return false;
    }

    tower.melisEvolutionLevel += 1;
    player.stress = Math.max(0, player.stress - getMelisEvolutionStressCost(tower.melisEvolutionLevel));
    tower.cooldownMs = Math.min(tower.cooldownMs, 120);
    return true;
  }

  private canMelisEvolveNextLevel(player: Player, nextEvolutionLevel: number) {
    const cost = getMelisEvolutionStressCost(nextEvolutionLevel);
    return cost > 0 && player.stress >= cost;
  }

  private useMelisFocus(ownerId: string) {
    const now = Date.now();
    const until = now + scaleGameDuration(MELIS_FOCUS_DURATION_MS);
    let lockedCount = 0;

    for (const tower of this.towers.values()) {
      if (tower.ownerId !== ownerId || tower.characterId !== "archer") {
        continue;
      }

      const target = this.findTowerTarget(tower);
      if (!target) {
        continue;
      }

      tower.melisFocusUntil = until;
      tower.melisFocusTargetId = target.id;
      tower.melisFocusKillHasteUntil = 0;
      tower.cooldownMs = Math.min(tower.cooldownMs, 120);
      lockedCount += 1;
    }

    return lockedCount > 0;
  }

  private applyZeynepHaste(durationMs: number, multiplier: number, tier: ZeynepCommandTier, now: number) {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepHasteUntil <= now || multiplier >= this.zeynepHasteMultiplier) {
      this.zeynepHasteUntil = until;
      this.zeynepHasteMultiplier = multiplier;
      this.zeynepHasteTier = tier;
    } else {
      this.zeynepHasteUntil = Math.max(this.zeynepHasteUntil, until);
    }
  }

  private applyZeynepRange(durationMs: number, multiplier: number, tier: ZeynepCommandTier, now: number) {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepRangeUntil <= now || multiplier >= this.zeynepRangeMultiplier) {
      this.zeynepRangeUntil = until;
      this.zeynepRangeMultiplier = multiplier;
      this.zeynepRangeTier = tier;
    } else {
      this.zeynepRangeUntil = Math.max(this.zeynepRangeUntil, until);
    }
  }

  private applyZeynepSlow(durationMs: number, multiplier: number, tier: ZeynepCommandTier, now: number) {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepSlowUntil <= now || multiplier <= this.zeynepSlowMultiplier) {
      this.zeynepSlowUntil = until;
      this.zeynepSlowMultiplier = multiplier;
      this.zeynepSlowTier = tier;
    } else {
      this.zeynepSlowUntil = Math.max(this.zeynepSlowUntil, until);
    }
  }

  private useThirdSkill(characterId: CharacterId, ownerId: string) {
    if (characterId === "archer") {
      this.damageFrontEnemies(8, 70, 0, ownerId);
    } else if (characterId === "mage") {
      this.damageAllEnemies(82, 0, ownerId);
    } else if (characterId === "healer") {
      const player = this.state.players.get(ownerId);
      if (player) {
        player.gold += 20;
      }
      this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + 25);
      this.slowAllEnemies(1600);
    } else if (characterId === "tank") {
      this.damageAllEnemies(45, 3200, ownerId);
    } else if (characterId === "onur") {
      this.damageStrongestEnemy(180, 0, ownerId);
    } else {
      const player = this.state.players.get(ownerId);
      if (player) {
        player.gold += 25;
      }
      this.damageAllEnemies(20, 0, ownerId);
    }
  }

  private useUltimate(client: Client, message: UseUltimateMessage = {}) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.ultimateCharge < 100) {
      return;
    }

    // Zeynep ultisi hedef ister. Dogrulama sarj harcanmadan once yapilir; aksi
    // halde gecersiz bir sutun dokunusu ultiyi hicbir sey yapmadan yakardi.
    const column = player.characterId === "zeynep" ? this.resolveUltimateColumn(message.column) : undefined;
    if (player.characterId === "zeynep" && column === undefined) {
      return;
    }

    player.ultimateCharge = 0;

    if (player.characterId === "zeynep" && column !== undefined) {
      this.fireZeynepColumnUltimate(client.sessionId, column);
      return;
    }

    // Asagidaki sabit hasarlar da ayni kademeyle buyur: ulti gucu karakterin
    // degil oyuncunun yatirimi.
    const ultimatePower = this.getUltimatePowerMultiplierFor(client.sessionId);

    if (player.characterId === "mage") {
      for (const enemy of this.enemies.values()) {
        this.damageEnemy(enemy, 85 * ultimatePower, 0, "ultimate", client.sessionId);
      }
      return;
    }

    if (player.characterId === "healer") {
      this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + 28);
      for (const enemy of this.enemies.values()) {
        const duration = applyStatusResistance(1800, enemy.statusResistances.slow);
        enemy.slowUntil = Math.max(enemy.slowUntil, Date.now() + scaleGameDuration(duration));
      }
      return;
    }

    if (player.characterId === "tank") {
      for (const enemy of this.enemies.values()) {
        this.damageEnemy(enemy, 35 * ultimatePower, 3200, "ultimate", client.sessionId);
      }
      return;
    }

    if (player.characterId === "onur") {
      this.startSympathy();
      return;
    }

    if (player.characterId === "archer") {
      const until = Date.now() + scaleGameDuration(MELIS_GOTHIC_NIGHTMARE_MS);
      this.melisGothicNightmareUntil = Math.max(this.melisGothicNightmareUntil, until);
      this.melisGothicNightmareOwnerUntil.set(client.sessionId, Math.max(this.melisGothicNightmareOwnerUntil.get(client.sessionId) ?? 0, until));
      for (const tower of this.towers.values()) {
        if (tower.ownerId === client.sessionId && tower.characterId === "archer") {
          tower.cooldownMs = Math.min(tower.cooldownMs, 80);
        }
      }
      return;
    }

    if (player.characterId === "warrior") {
      this.useAtakanUltimate(client, message.mode === "repair" ? "repair" : "attack");
      return;
    }

    for (const enemy of this.enemies.values()) {
      this.damageEnemy(enemy, 25 * ultimatePower, 0, "ultimate", client.sessionId);
    }
  }

  private resolveUltimateColumn(column: number | undefined) {
    if (typeof column !== "number" || !Number.isFinite(column)) {
      return undefined;
    }
    const rounded = Math.round(column);
    if (rounded < 0 || rounded >= this.activeMap.cols) {
      return undefined;
    }
    return rounded;
  }

  /**
   * Zeynep ultisi: secilen sutunun tamamini yakan isik patlamasi.
   *
   * Sutun haritanin on ikide biri: ulti yalnizca dogru anda dogru yere
   * basildiginda odul veriyor. Hasar sabit, buyumesi ulti gucu yatirimina
   * bagli.
   */
  private fireZeynepColumnUltimate(ownerId: string, column: number) {
    const gridSize = getMapGridSize(this.activeMap);
    const origin = getMapOrigin(this.activeMap);
    const bounds = getMapWorldBounds(this.activeMap);
    const left = origin.x + column * gridSize;
    const right = left + gridSize;
    const damage = this.getZeynepColumnUltimateDamage(ownerId);

    for (const enemy of this.enemies.values()) {
      if (enemy.x < left || enemy.x >= right) {
        continue;
      }
      this.damageEnemy(enemy, damage, ZEYNEP_COLUMN_ULTIMATE_SLOW_MS, "ultimate", ownerId);
    }

    const id = `zeynep-ultimate-${this.nextBeamId++}`;
    this.beams.set(id, {
      id,
      definitionId: "zeynep-ultimate-column",
      x1: left + gridSize / 2,
      y1: bounds.top,
      x2: left + gridSize / 2,
      y2: bounds.bottom,
      width: gridSize,
      color: 0xfde68a,
      overdrive: false,
      ttlMs: ZEYNEP_COLUMN_ULTIMATE_BEAM_MS
    });
  }

  private getZeynepColumnUltimateDamage(ownerId: string) {
    return Math.max(1, Math.round(ZEYNEP_COLUMN_ULTIMATE_DAMAGE * this.getUltimatePowerMultiplierFor(ownerId)));
  }

  private useAtakanUltimate(client: Client, mode: "attack" | "repair") {
    const ownTowers = Array.from(this.towers.values()).filter((tower) => tower.ownerId === client.sessionId && tower.characterId === "warrior");
    const repairNexus = mode === "repair";
    const droneDamage = this.getAtakanDroneDamage(client.sessionId);

    for (const tower of ownTowers) {
      this.spawnAtakanDrone(tower, repairNexus, droneDamage);
    }

    const now = Date.now();
    for (const tower of ownTowers) {
      tower.offlineUntil = Math.max(tower.offlineUntil, now + ATAKAN_ULTIMATE_EXHAUSTION_MS);
    }
  }

  private spawnAtakanDrone(tower: TowerModel, repairNexus: boolean, damage: number) {
    const target = repairNexus ? undefined : this.findNearestEnemy(tower.x, tower.y);
    if (!repairNexus && !target) {
      return;
    }

    const nexus = this.activePaths[0]?.points.at(-1);
    const bounds = this.getActiveWorldBounds();
    const targetX = repairNexus ? nexus?.x ?? bounds.left + bounds.width / 2 : target?.x ?? tower.x;
    const targetY = repairNexus ? nexus?.y ?? bounds.bottom - getMapGridSize(this.activeMap) / 2 : target?.y ?? tower.y;
    const speed = this.scaleWorldSpeed(repairNexus ? ATAKAN_DRONE_REPAIR_SPEED : ATAKAN_DRONE_ATTACK_SPEED);
    const dx = targetX - tower.x;
    const dy = targetY - tower.y;
    const length = Math.max(1, Math.hypot(dx, dy));

    const id = `d${this.nextDroneId++}`;
    this.drones.set(id, {
      id,
      ownerId: tower.ownerId,
      targetId: target?.id,
      mode: repairNexus ? "repair" : "attack",
      x: tower.x,
      y: tower.y,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      damage,
      repairAmount: ATAKAN_DRONE_REPAIR_AMOUNT,
      ttlMs: repairNexus ? 6500 : 8500
    });
  }

  private getAtakanDroneDamage(ownerId: string) {
    return Math.max(1, Math.round(ATAKAN_ULTIMATE_DRONE_DAMAGE * this.getUltimatePowerMultiplierFor(ownerId)));
  }

  /** Oyuncunun aldigi ulti gucu kademelerinin hasar carpani. */
  private getUltimatePowerMultiplierFor(ownerId: string) {
    return getUltimatePowerMultiplier(this.state.players.get(ownerId)?.ultimatePower ?? 0);
  }

  /**
   * Ulti gucunu bir kademe buyutur.
   *
   * Kademe tur boyunca kalici: ulti barinin doldugu her sefere isliyor. Bedeli
   * pesin almanin sebebi de bu -- yatirim, bir sonraki ultiye degil butun tura.
   */
  private upgradeUltimatePower(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.ultimatePower >= ULTIMATE_POWER_MAX_LEVEL) {
      return;
    }

    const cost = getUltimatePowerUpgradeCost(player.ultimatePower);
    if (cost === undefined || player.gold < cost) {
      return;
    }

    player.gold -= cost;
    player.goldSpent += cost;
    player.ultimatePower += 1;
    client.send("ultimate:upgraded", { level: player.ultimatePower, cost });
  }

  private findNearestEnemy(x: number, y: number) {
    return Array.from(this.enemies.values())
      .sort((a, b) => distanceSq(x, y, a.x, a.y) - distanceSq(x, y, b.x, b.y))[0];
  }

  private refreshZeynepFormations() {
    const allZeynepTowers = Array.from(this.towers.values()).filter((tower) => {
      return tower.characterId === "zeynep" && canJoinZeynepFormation(tower);
    });
    for (const tower of allZeynepTowers) {
      tower.zeynepFormationSize = 0;
      tower.zeynepFormationLevel = 0;
    }

    const towers = allZeynepTowers;
    const gridSize = getMapGridSize(this.activeMap);
    const visited = new Set<string>();
    for (const tower of towers) {
      if (visited.has(tower.id)) {
        continue;
      }

      const group: TowerModel[] = [];
      const queue = [tower];
      visited.add(tower.id);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }

        group.push(current);
        for (const candidate of towers) {
          if (visited.has(candidate.id)) {
            continue;
          }
          if (!areZeynepFormationNeighbors(current, candidate, gridSize)) {
            continue;
          }

          visited.add(candidate.id);
          queue.push(candidate);
        }
      }

      const isValidFormation = isValidZeynepFormationGroup(group, gridSize);
      const formationSize = isValidFormation ? group.length : 0;
      const formationLevel = isValidFormation ? Math.min(...group.map((member) => member.level)) : 0;
      for (const member of group) {
        if (member.characterId !== "zeynep" || member.definition.id === "zeynep-7" || member.definition.id === "zeynep-8") {
          continue;
        }
        member.zeynepFormationSize = formationSize;
        member.zeynepFormationLevel = formationLevel;
      }
    }
  }

  private canPlaceTower(x: number, y: number, definitionId = "", orientation: TowerOrientation = "horizontal", ignoreTowerId = "") {
    const definition = this.findTowerDefinitionById(definitionId);
    if (definition?.engine?.placement?.requiresEdge) {
      return this.canPlaceAbartiEdge(x, y, orientation, ignoreTowerId, definitionId);
    }

    const footprint = this.getTowerFootprintCells(x, y, definitionId, orientation);
    if (footprint.length === 0) {
      return false;
    }
    const otherTowers = Array.from(this.towers.values()).filter((tower) => tower.id !== ignoreTowerId);
    const occupiedCells = otherTowers.flatMap((tower) => this.getTowerFootprintCells(tower.x, tower.y, tower.definition.id, tower.orientation));
    const enemyCells = Array.from(this.enemies.values()).map((enemy) => worldToGrid(enemy.x, enemy.y, this.activeMap));
    const pathCells = getMapPoints(this.activeMap, "road").concat(getMapPoints(this.activeMap, "spawn"), getMapPoints(this.activeMap, "nexus"));
    const topLeft = footprint.reduce((result, cell) => ({ col: Math.min(result.col, cell.col), row: Math.min(result.row, cell.row) }), footprint[0]);
    return validateTowerPlacement({
      board: { cols: this.activeMap.cols, rows: this.activeMap.rows },
      col: topLeft.col,
      row: topLeft.row,
      span: this.getTowerPlacementSpan(definitionId),
      occupiedCells,
      enemyCells,
      existingTowerCells: occupiedCells,
      minDistanceFromTowers: definition?.engine?.placement?.minDistanceFromTowers,
      pathCells,
      requiresPathAdjacent: definition?.engine?.placement?.requiresPathAdjacent
    }).valid;
  }

  private snapToTowerGrid(x: number, y: number, definitionId = "", orientation: TowerOrientation = "horizontal") {
    const gridPoint = worldToGrid(x, y, this.activeMap);
    if (this.findTowerDefinitionById(definitionId)?.engine?.placement?.requiresEdge) {
      if (definitionId === WALL_TOWER_ID) orientation = this.getEdgeOrientationAt(x, y);
      const gridSize = getMapGridSize(this.activeMap);
      const origin = getMapOrigin(this.activeMap);
      // Konum segmentlerden turetiliyor: snap ile dogrulamanin ayri formuller
      // kullanmasi ikisinin ayrisabilecegi anlamina gelirdi ve tek cizgilik
      // duvarda tam olarak bu oldu -- yapi isaret edilenin bir alt karesine
      // oturuyordu. Merkez, kapladigi cizgilerin ortasidir.
      const length = this.getEdgeLength(definitionId);
      const [first] = this.getAbartiEdgeSegments(x, y, orientation, length);
      if (!first) return { x, y };
      return orientation === "vertical"
        ? { x: origin.x + first.col * gridSize, y: origin.y + (first.row + length / 2) * gridSize }
        : { x: origin.x + (first.col + length / 2) * gridSize, y: origin.y + first.row * gridSize };
    }

    // A 2x2 tower centres on a cell corner rather than a cell.
    if (this.getTowerPlacementSpan(definitionId) === 2) {
      const gridSize = getMapGridSize(this.activeMap);
      const origin = getMapOrigin(this.activeMap);
      const col = Math.max(1, Math.min(this.activeMap.cols - 1, Math.round((x - origin.x) / gridSize)));
      const row = Math.max(1, Math.min(this.activeMap.rows - 1, Math.round((y - origin.y) / gridSize)));
      return {
        x: origin.x + col * gridSize,
        y: origin.y + row * gridSize
      };
    }

    return gridToWorld(gridPoint.col, gridPoint.row, this.activeMap);
  }

  private getTowerFootprintCells(x: number, y: number, definitionId = "", orientation: TowerOrientation = "horizontal") {
    if (this.findTowerDefinitionById(definitionId)?.engine?.placement?.requiresEdge) {
      return [];
    }

    const span = this.getTowerPlacementSpan(definitionId);
    if (span === 2) {
      const gridSize = getMapGridSize(this.activeMap);
      const origin = getMapOrigin(this.activeMap);
      const col = Math.round((x - origin.x) / gridSize);
      const row = Math.round((y - origin.y) / gridSize);
      return getPlacementFootprint({ col: col - 1, row: row - 1, span }, { cols: this.activeMap.cols, rows: this.activeMap.rows });
    }

    const gridPoint = worldToGrid(x, y, this.activeMap);
    return getPlacementFootprint({ ...gridPoint, span }, { cols: this.activeMap.cols, rows: this.activeMap.rows });
  }

  private canPlaceAbartiEdge(x: number, y: number, orientation: TowerOrientation, ignoreTowerId = "", definitionId = "zeynep-8") {
    const length = this.getEdgeLength(definitionId);
    const segments = this.getAbartiEdgeSegments(x, y, orientation, length);
    const occupiedSegments: EdgeSegment[] = [];
    for (const tower of this.towers.values()) {
      if (tower.id !== ignoreTowerId && tower.definition.engine?.placement?.requiresEdge) {
        occupiedSegments.push(...this.getAbartiEdgeSegments(tower.x, tower.y, tower.orientation, this.getEdgeLength(tower.definition.id)));
      }
    }
    const edgeValidation = validateEdgePlacement({
      board: { cols: this.activeMap.cols, rows: this.activeMap.rows },
      orientation,
      col: segments[0]?.col ?? -1,
      row: segments[0]?.row ?? -1,
      length,
      occupiedSegments
    });
    if (!edgeValidation.valid || !segments.every((segment) => this.isValidAbartiEdgeSegment(segment, definitionId))) {
      return false;
    }
    return true;
  }

  /** Yapinin kapladigi kenar cizgisi sayisi. Duvar tek, Abarti iki. */
  private getEdgeLength(definitionId: string) {
    return definitionId === WALL_TOWER_ID ? WALL_EDGE_LENGTH : 2;
  }

  /**
   * Bir dunya noktasinin hangi kenara ait oldugunu soyler.
   *
   * Duvarin yonu oyuncu tarafindan secilmez, getirildigi kenardan turetilir:
   * imlec dikey bir cizgiye yataydakinden daha yakinsa duvar dikey durur. Boylece
   * yerlestirme "once yonu sec, sonra yere birak" degil, dogrudan "nereye
   * birakirsan o" oluyor.
   */
  private getEdgeOrientationAt(x: number, y: number): TowerOrientation {
    const gridSize = getMapGridSize(this.activeMap);
    const origin = getMapOrigin(this.activeMap);
    const colFraction = (x - origin.x) / gridSize;
    const rowFraction = (y - origin.y) / gridSize;
    const distanceToVerticalLine = Math.abs(colFraction - Math.round(colFraction));
    const distanceToHorizontalLine = Math.abs(rowFraction - Math.round(rowFraction));
    return distanceToVerticalLine <= distanceToHorizontalLine ? "vertical" : "horizontal";
  }

  private getAbartiEdgeSegments(x: number, y: number, orientation: TowerOrientation, length = 2) {
    return getEdgeSegments({
      x,
      y,
      orientation,
      length,
      gridSize: getMapGridSize(this.activeMap),
      origin: getMapOrigin(this.activeMap),
      board: { cols: this.activeMap.cols, rows: this.activeMap.rows }
    });
  }


  /**
   * Kenar segmenti gecerli mi.
   *
   * Abarti dost atislarini degistirdigi icin insa alaninin kenarina oturmak
   * zorunda: en az bir yani `tower` karesi olmali. Duvarin isi ise dusmani
   * yonlendirmek, yani onun dogal yeri dusmanin yurudugu zemin. Ayni sarti ona
   * uygulamak, hic `tower` karesi olmayan arena haritasinda duvari tumden
   * kurulamaz yapiyordu -- oyuncunun gordugu "her yer kirmizi" buydu.
   */
  private isValidAbartiEdgeSegment(segment: { orientation: TowerOrientation; col: number; row: number }, definitionId = "zeynep-8") {
    if (!isEdgeSegmentInsideBoard(segment, { cols: this.activeMap.cols, rows: this.activeMap.rows })) {
      return false;
    }
    if (definitionId === WALL_TOWER_ID) {
      return true;
    }

    return segment.orientation === "vertical"
      ? this.isTowerTile(segment.col - 1, segment.row) || this.isTowerTile(segment.col, segment.row)
      : this.isTowerTile(segment.col, segment.row - 1) || this.isTowerTile(segment.col, segment.row);
  }

  private isTowerTile(col: number, row: number) {
    return isInsideMap(this.activeMap, col, row) && getTile(this.activeMap, col, row) === "tower";
  }

  private findTowerTarget(tower: TowerModel) {
    const now = Date.now();
    if (tower.definition.id === "zeynep-3") {
      const composition = this.getZeynepSynthesisComposition(tower);
      if (!composition.mode) {
        return undefined;
      }
    }

    if (towerAims(tower.definition.id) && tower.aimTargetId) {
      const lockedTarget = this.enemies.get(tower.aimTargetId);
      const targetIsValid = Boolean(
        lockedTarget &&
        this.canTowerTargetEnemy(tower, lockedTarget) &&
        distanceSq(tower.x, tower.y, lockedTarget.x, lockedTarget.y) <= this.getTowerRange(tower) ** 2
      );
      if (shouldRetainAimTargetLock({
        now,
        lockUntil: tower.aimTargetLockUntil,
        hasFired: tower.aimTargetHasFired,
        targetIsValid
      })) {
        return lockedTarget;
      }
      if (!targetIsValid) {
        tower.aimTargetId = "";
        tower.aimTargetLockUntil = 0;
        tower.aimTargetHasFired = false;
      }
    }

    const isGuidedHit = this.projectileGuidanceUntil > now && (tower.definition.hitType === "projectile" || tower.definition.hitType === "impact");
    if (isGuidedHit) {
      const guidedTarget = Array.from(this.enemies.values())
        .filter((enemy) => this.canTowerTargetEnemy(tower, enemy) && this.isEnemyInProjectileGuidance(enemy, now))
        .sort((a, b) => b.pathDistance - a.pathDistance)[0];
      if (guidedTarget) {
        return guidedTarget;
      }
    }

    const melisFocusTarget = this.getMelisFocusSkillTarget(tower, now);
    if (melisFocusTarget) {
      return melisFocusTarget;
    }

    if (tower.definition.id === "archer-2") {
      const lockedTarget = tower.focusTargetId ? this.enemies.get(tower.focusTargetId) : undefined;
      if (lockedTarget) {
        const lockedTargetInRange = distanceSq(tower.x, tower.y, lockedTarget.x, lockedTarget.y) <= this.getTowerRange(tower) * this.getTowerRange(tower);
        if (!lockedTargetInRange && lockedTarget.fearUntil <= now) {
          this.runTowerTriggers(tower, "escape", { target: lockedTarget, areaDamageMultiplier: 2, now });
        }
        if (!lockedTargetInRange) {
          tower.focusTargetId = "";
        }
      }
    }

    const range = isGuidedHit ? Number.POSITIVE_INFINITY : this.getTowerRange(tower);
    this.perfCounters.targetSearches += 1;
    const candidates = Number.isFinite(range)
      ? this.getEnemiesNear(tower.x, tower.y, range)
      : Array.from(this.enemies.values());
    this.perfCounters.targetChecks += candidates.length;
    const preferredTargetIds = tower.definition.id === "archer-1" && tower.melisEvolutionLevel >= 1
      ? this.getMelisUnderworldLinkedEnemyIds(tower.ownerId)
      : [];
    if (tower.definition.id === "archer-1" && tower.melisEvolutionLevel >= 1 && tower.focusTargetId && !preferredTargetIds.includes(tower.focusTargetId)) {
      tower.focusTargetId = "";
    }
    const selected = this.selectEnemyTarget(tower, candidates, tower.targetingMode, {
      range,
      now,
      lockedTargetId: tower.focusTargetId,
      retainLockOutsideRange: tower.definition.id === "archer-1" && this.canMelisHedefciHoldLockOutsideRange(tower),
      preferredTargetIds
    });
    if (!selected && tower.definition.engine?.locksTarget) {
      tower.focusTargetId = "";
    }
    if (towerAims(tower.definition.id) && selected && selected.id !== tower.aimTargetId) {
      tower.aimTargetId = selected.id;
      tower.aimTargetLockUntil = now + FOCUS_AIM_TARGET_LOCK_MS + Math.max(0, getModifierAdd(this.getTowerRunModifiers(tower), "targetLockMs"));
      tower.aimTargetHasFired = false;
    }
    return selected;
  }

  private selectEnemyTarget(
    tower: TowerModel,
    enemies: EnemyModel[],
    mode: TowerTargetingMode,
    options: { range: number; now: number; lockedTargetId?: string; retainLockOutsideRange?: boolean; preferredTargetIds?: string[]; random?: () => number; strength?: (enemy: EnemyModel) => number; useTypePriority?: boolean }
  ) {
    const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));
    const selected = selectTowerTarget({
      mode,
      canHitAir: Boolean(tower.definition.engine?.canHitAir) || this.towerHasUnlock(tower, "canHitAir"),
      locksTarget: tower.definition.engine?.locksTarget,
      lockedTargetId: options.lockedTargetId,
      retainLockOutsideRange: options.retainLockOutsideRange,
      preferredTargetIds: options.preferredTargetIds,
      random: options.random
    }, enemies.map((enemy) => ({
      id: enemy.id,
      progress: enemy.pathDistance,
      health: enemy.hp + enemy.shield,
      strength: options.strength?.(enemy) ?? enemy.maxHp + enemy.maxShield,
      distance: Math.hypot(enemy.x - tower.x, enemy.y - tower.y),
      markScore: this.getTrackingStackCount(enemy, options.now),
      priorityScore: options.useTypePriority === false ? 0 : enemy.type === "brute" ? 1 : 0,
      inRange: distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= options.range * options.range
        && distanceSq(tower.x, tower.y, enemy.x, enemy.y) >= this.getTowerMinimumRange(tower) ** 2,
      eligible: this.canTowerTargetEnemy(tower, enemy),
      movementKind: enemy.movementKind
    })));
    return selected ? byId.get(selected.id) : undefined;
  }

  private canTowerTargetEnemy(tower: TowerModel, enemy: EnemyModel) {
    const now = Date.now();
    if (enemy.dominatedUntil > now || enemy.melisUndeadUntil > now || enemy.melisWhisperTurnedUntil > now) {
      return false;
    }

    if (enemy.movementKind !== "air") {
      return true;
    }

    return Boolean(tower.definition.engine?.canHitAir) || this.towerHasUnlock(tower, "canHitAir");
  }

  private getEnemiesNear(x: number, y: number, radius: number) {
    return this.enemySpatialGrid
      .queryCircle(x, y, radius)
      .filter((enemy) => this.enemies.get(enemy.id) === enemy);
  }

  private getMelisFocusSkillTarget(tower: TowerModel, now: number) {
    if (tower.characterId !== "archer" || tower.melisFocusUntil <= now || !tower.melisFocusTargetId) {
      return undefined;
    }

    const target = this.enemies.get(tower.melisFocusTargetId);
    if (!target || !this.canTowerTargetEnemy(tower, target)) {
      tower.melisFocusTargetId = "";
      return undefined;
    }

    return target;
  }

  private canMelisHedefciHoldLockOutsideRange(tower: TowerModel) {
    return tower.definition.id === "archer-1" && this.isMelisApprovalDominant(tower);
  }

  private getMelisUnderworldLinkedEnemyIds(ownerId: string) {
    const linkedEnemyIds = new Set<string>();
    for (const candidateTower of this.towers.values()) {
      if (candidateTower.definition.id !== "archer-4" || candidateTower.ownerId !== ownerId) {
        continue;
      }
      for (const enemyId of candidateTower.melisUnderworldTargetIds) {
        linkedEnemyIds.add(enemyId);
      }
    }

    return Array.from(linkedEnemyIds);
  }

  private isMelisUnderworldLinkedEnemyForOwner(ownerId: string, enemyId: string) {
    for (const tower of this.towers.values()) {
      if (tower.ownerId === ownerId && tower.definition.id === "archer-4" && tower.melisUnderworldTargetIds.includes(enemyId)) {
        return true;
      }
    }
    return false;
  }

  private damageEnemy(enemy: EnemyModel, damage: number, slowMs: number, sourceDefinitionId = "", sourceOwnerId = "", damageType: DamageType = "true", maxHealthDamageRatio = 0, sourceTowerLevel = 1, sourceTowerId = "", hitType?: HitType) {
    if (!this.enemies.has(enemy.id)) {
      return false;
    }

    if (enemy.dominatedUntil > Date.now() && sourceDefinitionId !== "archer-skill-bully" && !sourceDefinitionId.startsWith("status:")) {
      return false;
    }

    this.perfCounters.damageEvents += 1;
    const now = Date.now();
    if (this.isEnemyInProjectileGuidance(enemy, now)) {
      this.setEnemyMark(enemy, "guidance", PROJECTILE_GUIDANCE_DAMAGE_MULTIPLIER - 1, now + 100);
    }
    const activeMark = sourceDefinitionId === "warrior-1" && enemy.activeMarkId === "tracking" ? undefined : {
      id: enemy.activeMarkId, add: enemy.activeMarkAdd, expiresAt: enemy.activeMarkUntil
    };
    if (enemy.melisUnderworldVulnerableUntil <= now) {
      enemy.melisUnderworldDamageTakenMultiplier = 1;
    }
    const damageSourceTower = sourceTowerId ? this.towers.get(sourceTowerId) : undefined;
    const damagePlayer = this.state.players.get(sourceOwnerId);
    const damageModifiers = damageSourceTower ? this.getTowerRunModifiers(damageSourceTower) : [];
    // Isaret gucu vuran kulenin listesinden okunur.
    //
    // Yalnizca oyuncunun listesine bakmak, bir kuleye takilan Komuta Modulu'nu
    // sessizce olu birakiyordu: esyanin degistiricisi kulenin uzerinde duruyor
    // ve oradan kimse okumuyordu. Kule listesi oyuncunun kartlarini zaten
    // icerdigi icin kart tarafinda hicbir sey degismiyor.
    const markModifiers = damageSourceTower ? damageModifiers : damagePlayer?.runModifiers ?? [];
    const markMultiplier = getMarkDamageMultiplier(activeMark, markModifiers, now);
    let shopDamageAdd = 0;
    if (enemy.movementKind === "air") shopDamageAdd += getModifierAdd(damageModifiers, "airDamage");
    if (enemy.shield > 0) shopDamageAdd += getModifierAdd(damageModifiers, "damageVsShielded");
    if (enemy.type === "brute") shopDamageAdd += getModifierAdd(damageModifiers, "damageVsBrute");
    if (this.towerHasUnlock(damageSourceTower, "status:chill") && getTowerStatusOutcomes(enemy.statusEffects, now).speedMultiplier < 1) shopDamageAdd += 0.2;
    if (this.towerHasUnlock(damageSourceTower, "bloodBank")) shopDamageAdd += 0.2;
    const critical = damageSourceTower ? this.getTowerEngine(damageSourceTower)?.critical : undefined;
    // Soguk Celik: kule sogukken nisan alma sansi artar. Kizgin Namlu ile
    // kasten ters yonde calisir; ikisini birden almak kendi kendini bozar.
    const coldCritChance = damageSourceTower
      && this.towerHasUnlock(damageSourceTower, "heat:coldCrit")
      && damageSourceTower.temperature < COLD_CRIT_TEMPERATURE
      ? COLD_CRIT_CHANCE
      : 0;
    const conditionalCritical = critical?.bonusChanceAgainstStatus;
    const conditionalCritChance = conditionalCritical && isStatusEffectActive(enemy.statusEffects[conditionalCritical.type], now)
      ? conditionalCritical.chance
      : 0;
    const canCrit = Boolean(damageSourceTower && !sourceDefinitionId.startsWith("status:"));
    const critChance = canCrit
      ? Math.max(0, TOWER_BASE_CRITICAL_CHANCE + (critical?.baseChance ?? 0) + conditionalCritChance + coldCritChance + getModifierAdd(damageModifiers, "critChance"))
      : 0;
    const critDamageAdd = canCrit
      ? Math.max(0, (critical?.damageMultiplier ?? TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER) - 1 + getModifierAdd(damageModifiers, "critDamage"))
      : 0;
    const critAdd = critChance > 0 && this.towerCriticalRandom() < critChance ? critDamageAdd : 0;
    const result = calculateDamageTaken(
      { amount: damage * markMultiplier * Math.max(0, 1 + shopDamageAdd + critAdd), damageType, hitType },
      {
        armor: enemy.armor,
        shield: enemy.shield,
        damageResistances: enemy.damageResistances,
        hitTypeResistances: enemy.hitTypeResistances
      }
    );
    enemy.shield = result.remainingShield;
    let hpDamage = result.hpDamage;
    if (maxHealthDamageRatio > 0 && enemy.shield <= 0) {
      hpDamage += enemy.maxHp * maxHealthDamageRatio;
    }
    const dealtAmount = result.shieldDamage + Math.min(enemy.hp, hpDamage);
    enemy.hp -= hpDamage;
    this.recordTowerDamage(sourceTowerId, dealtAmount, now);
    this.addDamageEvent(enemy, dealtAmount);
    const markSourceTower = sourceTowerId ? this.towers.get(sourceTowerId) : undefined;
    if (sourceDefinitionId === "warrior-1") {
      const duration = applyStatusResistance(6500, enemy.statusResistances.tracking);
      this.applyTrackingStacks(enemy, now + scaleGameDuration(duration), this.getTrackingStackLimit(sourceTowerLevel));
    }
    const mark = markSourceTower?.definition.engine?.appliesMark;
    if (mark) {
      this.applyEnemyStatusEffect(enemy, { type: "mark", magnitude: mark.damageMultiplier, durationMs: mark.durationMs, stacking: "refresh" }, now);
    }
    if (slowMs > 0) {
      const sourceTower = sourceTowerId ? this.towers.get(sourceTowerId) : undefined;
      const modifiers = sourceTower ? this.getTowerRunModifiers(sourceTower) : [];
      this.applyEnemyStatusEffect(enemy, {
        type: "slow",
        magnitude: 0.52,
        durationMs: slowMs,
        stacking: "refresh"
      }, now, {
        durationMs: slowMs * getModifierMultiplier(modifiers, "statusDuration"),
        magnitude: 0.52 * getModifierMultiplier(modifiers, "statusMagnitude")
      });
    }

    if (enemy.hp > 0 && sourceTowerId && !sourceDefinitionId.startsWith("status:")) {
      const sourceTower = this.towers.get(sourceTowerId);
      if (sourceTower) {
        for (const definition of this.getTowerEngine(sourceTower)?.statusEffects ?? []) {
          if (definition.type === "burn" || definition.type === "bleed" || definition.type === "chill" || definition.type === "convert") {
            this.applyConfiguredTowerStatus(sourceTower, enemy, definition.type, now, { sourceOwnerId: sourceOwnerId || sourceTower.ownerId });
          }
        }
      }
      if (sourceTower && this.towerHasUnlock(sourceTower, "status:burn") && damageType === "fire") {
        this.applyEnemyStatusEffect(enemy, { type: "burn", magnitude: 0.015, durationMs: 4000, stacking: "refresh" }, now, { sourceTowerId, sourceOwnerId });
      }
    }

    if (enemy.hp > 0) {
      return false;
    }

    if (sourceDefinitionId !== "archer-4-underworld-execute") {
      this.resolveMelisUnderworldLinkedDeath(enemy, now);
    }
    this.triggerMelisCurseDeathBurst(enemy, now);
    this.enemies.delete(enemy.id);
    this.applyMelisFocusLastHitBuff(sourceTowerId, now);
    this.awardEnemyGold(enemy);
    this.awardEnemyExperience(enemy);
    this.kills += 1;
    const sourceTower = sourceTowerId ? this.towers.get(sourceTowerId) : undefined;
    if (sourceTower) {
      this.applyTowerStacksForTrigger(sourceTower, "kill", now, enemy.id);
      if (this.towerHasUnlock(sourceTower, "stack:kill")) sourceTower.shopKillStacks = Math.min(15, sourceTower.shopKillStacks + 1);
      if (this.towerHasUnlock(sourceTower, "ammoDrop") && Math.random() < 0.2) sourceTower.ammo = Math.min(sourceTower.maxAmmo, sourceTower.ammo + 4);
      if (this.towerHasUnlock(sourceTower, "heat:killVent")) {
        // Oldurme isiyi atar. Kilitli bir kule de yanik hasariyla oldurebilir,
        // o yuzden esik burada da yeniden bakiliyor: tahliye kilidi kaldirabilir.
        sourceTower.temperature = Math.max(0, sourceTower.temperature - KILL_VENT_HEAT);
        if (sourceTower.heatLocked && sourceTower.temperature <= this.getTowerHeatReleaseThreshold(sourceTower)) {
          sourceTower.heatLocked = false;
        }
      }
    }
    if (sourceOwnerId) {
      const player = this.state.players.get(sourceOwnerId);
      if (player?.characterId === "zeynep") {
        this.awardZeynepReputation(player, enemy.type);
      }
      this.addKillEvent(sourceOwnerId, enemy.id);
    }
    for (const player of this.state.players.values()) {
      player.ultimateCharge = Math.min(100, player.ultimateCharge + this.getUltimateChargeGain(player, 7));
    }
    return true;
  }

  private applyMelisFocusLastHitBuff(towerId: string, now: number) {
    if (!towerId) {
      return;
    }

    const tower = this.towers.get(towerId);
    if (!tower || tower.characterId !== "archer" || tower.melisFocusUntil <= now) {
      return;
    }

    tower.melisFocusKillHasteUntil = Math.max(tower.melisFocusKillHasteUntil, tower.melisFocusUntil);
  }

  private damageEnemyFromTower(tower: TowerModel, enemy: EnemyModel, damage: number, slowMs: number) {
    const damageType = this.isMelisGothicNightmareActiveForTower(tower, Date.now())
      ? "true"
      : tower.definition.damageType ?? "physical";
    return this.damageEnemy(enemy, damage, slowMs, tower.definition.id, tower.ownerId, damageType, this.getServerLinkedMaxHealthDamageRatio(tower), tower.level, tower.id, tower.definition.hitType);
  }

  private damageEnemyFromTowerAs(tower: TowerModel, enemy: EnemyModel, damage: number, slowMs: number, damageType: DamageType, maxHealthDamageRatio?: number) {
    return this.damageEnemy(enemy, damage, slowMs, tower.definition.id, tower.ownerId, damageType, maxHealthDamageRatio ?? this.getServerLinkedMaxHealthDamageRatio(tower), tower.level, tower.id, tower.definition.hitType);
  }

  private recordTowerDamage(towerId: string, amount: number, now = Date.now()) {
    if (!towerId || amount <= 0) {
      return;
    }

    const tower = this.towers.get(towerId);
    if (!tower) {
      return;
    }

    tower.damageDealt += amount;
    tower.damageWindow.push({ dealtAt: now, amount });
    this.pruneTowerDamageWindow(tower, now);
    this.absorbMelisBrokenMirrorDamage(tower, amount, now);
  }

  private absorbMelisBrokenMirrorDamage(sourceTower: TowerModel, amount: number, now: number) {
    if (sourceTower.characterId !== "archer" || sourceTower.definition.id === "archer-5") {
      return;
    }

    for (const mirror of this.towers.values()) {
      if (
        mirror.definition.id !== "archer-5" ||
        mirror.ownerId !== sourceTower.ownerId ||
        mirror.offlineUntil > now ||
        mirror.overheatMs > 0 ||
        !this.isMelisBrokenMirrorAdjacentSource(mirror, sourceTower)
      ) {
        continue;
      }

      const capacity = this.getMelisBrokenMirrorCapacity(mirror);
      const storedAmount = amount * this.getMelisBrokenMirrorStoreRatio(mirror);
      const stackDefinition = mirror.definition.engine?.stacks?.find((stack) => stack.id === "mirror-storage");
      const stackState = stackDefinition
        ? this.applyEngineStack(mirror.stackStates, stackDefinition, { trigger: "hit", now, amount: storedAmount, maxValue: capacity })
        : undefined;
      mirror.melisMirrorCharge = stackState?.value ?? Math.min(capacity, mirror.melisMirrorCharge + storedAmount);
    }
  }

  private isMelisBrokenMirrorAdjacentSource(mirror: TowerModel, sourceTower: TowerModel) {
    const mirrorCells = this.getTowerFootprintCells(mirror.x, mirror.y, mirror.definition.id, mirror.orientation);
    const sourceCells = this.getTowerFootprintCells(sourceTower.x, sourceTower.y, sourceTower.definition.id, sourceTower.orientation);
    return mirrorCells.some((mirrorCell) => {
      return sourceCells.some((sourceCell) => {
        const colDistance = Math.abs(sourceCell.col - mirrorCell.col);
        const rowDistance = Math.abs(sourceCell.row - mirrorCell.row);
        return colDistance <= 1 && rowDistance <= 1 && (colDistance > 0 || rowDistance > 0);
      });
    });
  }

  private fireMelisBrokenMirrorExplosion(tower: TowerModel, target = this.findMelisBrokenMirrorExplosionTarget(tower)) {
    if (!target) return false;

    const storedDamage = Math.max(0, tower.melisMirrorCharge);
    const releasedDamage = storedDamage * getMelisBrokenMirrorReleaseMultiplier(tower.level);
    tower.melisMirrorCharge = 0;
    delete tower.stackStates["mirror-storage"];
    if (storedDamage <= 0) {
      return false;
    }

    const isStress = this.isMelisStressDominant(tower);
    let killed = false;
    if (tower.melisEvolutionLevel >= 2) {
      killed = this.damageEnemy(target, releasedDamage * (1 - MELIS_BROKEN_MIRROR_TRUE_DAMAGE_RATIO), 0, tower.definition.id, tower.ownerId, "psychic", 0, tower.level, tower.id, "impact");
      if (!killed && this.enemies.has(target.id)) {
        killed = this.damageEnemy(target, releasedDamage * MELIS_BROKEN_MIRROR_TRUE_DAMAGE_RATIO, 0, tower.definition.id, tower.ownerId, "true", 0, tower.level, tower.id, "impact");
      }
    } else {
      killed = this.damageEnemy(target, releasedDamage, 0, tower.definition.id, tower.ownerId, "psychic", 0, tower.level, tower.id, "impact");
    }

    const beamId = `melis-broken-mirror-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(beamId, {
      id: beamId,
      definitionId: "archer-5-mirror",
      x1: tower.x,
      y1: tower.y,
      x2: target.x,
      y2: target.y,
      width: this.scaleWorldDistance(MELIS_BROKEN_MIRROR_DEATH_BURST_RADIUS * 2),
      color: tower.definition.color,
      overdrive: false,
      ttlMs: 520
    });

    if (killed) {
      if (!isStress) {
        this.triggerMelisBrokenMirrorDeathBurst(tower, target.x, target.y, releasedDamage);
      }
      if (tower.melisEvolutionLevel >= 3) {
        this.applyMelisBrokenMirrorEvolutionHaste(tower);
      }
    } else {
      const player = this.state.players.get(tower.ownerId);
      if (player?.characterId === "archer") {
        player.stress += 1;
      }
    }

    return true;
  }

  private findMelisBrokenMirrorExplosionTarget(tower: TowerModel) {
    const state = this.isMelisApprovalDominant(tower)
      ? "approval"
      : this.isMelisStressDominant(tower)
        ? "stress"
        : "balanced";
    const mode = tower.definition.engine?.targetingByState?.[state] ?? tower.definition.engine?.targeting ?? "strongest";
    return this.selectEnemyTarget(tower, Array.from(this.enemies.values()), mode, {
      range: Number.POSITIVE_INFINITY,
      now: Date.now(),
      strength: getEnemyHealthRatio,
      useTypePriority: false
    });
  }

  private triggerMelisBrokenMirrorDeathBurst(tower: TowerModel, x: number, y: number, storedDamage: number) {
    const radius = this.scaleWorldDistance(MELIS_BROKEN_MIRROR_DEATH_BURST_RADIUS);
    const radiusSq = radius * radius;
    const burstDamage = storedDamage * MELIS_BROKEN_MIRROR_DEATH_BURST_RATIO;
    for (const enemy of this.getEnemiesNear(x, y, radius)) {
      if (distanceSq(x, y, enemy.x, enemy.y) > radiusSq) {
        continue;
      }
      this.damageEnemy(enemy, burstDamage, 0, "archer-5-mirror-burst", tower.ownerId, "psychic", 0, tower.level, tower.id, "impact");
    }
  }

  private applyMelisBrokenMirrorEvolutionHaste(tower: TowerModel) {
    const now = Date.now();
    const until = now + scaleGameDuration(MELIS_BROKEN_MIRROR_EVOLUTION_HASTE_MS);
    for (const candidate of this.towers.values()) {
      if (candidate.ownerId !== tower.ownerId || candidate.characterId !== "archer" || candidate.definition.hitType === "focus") {
        continue;
      }
      candidate.streakHasteUntil = Math.max(candidate.streakHasteUntil, until);
      candidate.streakHasteMultiplier = Math.max(candidate.streakHasteMultiplier, MELIS_BROKEN_MIRROR_EVOLUTION_HASTE_MULTIPLIER);
    }
  }

  private getMelisBrokenMirrorCapacity(tower: TowerModel) {
    return MELIS_BROKEN_MIRROR_BASE_CAPACITY * MELIS_BROKEN_MIRROR_CAPACITY_MULTIPLIER ** Math.max(0, tower.level - 1);
  }

  private getMelisBrokenMirrorStoreRatio(tower: TowerModel) {
    return MELIS_BROKEN_MIRROR_BASE_STORE_RATIO + (tower.melisEvolutionLevel >= 1 ? MELIS_BROKEN_MIRROR_EVOLUTION_STORE_BONUS : 0);
  }

  private getTowerCurrentDps(tower: TowerModel, now = Date.now()) {
    this.pruneTowerDamageWindow(tower, now);
    const damage = tower.damageWindow.reduce((total, sample) => total + sample.amount, 0);
    return damage / (TOWER_DPS_WINDOW_MS / 1000);
  }

  private pruneTowerDamageWindow(tower: TowerModel, now = Date.now()) {
    const keepAfter = now - TOWER_DPS_WINDOW_MS;
    while (tower.damageWindow.length > 0 && tower.damageWindow[0].dealtAt < keepAfter) {
      tower.damageWindow.shift();
    }
  }

  private isEnemyInProjectileGuidance(enemy: EnemyModel, now = Date.now()) {
    const radius = this.scaleWorldDistance(PROJECTILE_GUIDANCE_RADIUS);
    return this.projectileGuidanceUntil > now && distanceSq(enemy.x, enemy.y, this.projectileGuidanceX, this.projectileGuidanceY) <= radius * radius;
  }

  private awardZeynepReputation(player: Player, enemyType: EnemyType) {
    const baseGain = enemyType === "brute" ? 4 : enemyType === "shooter" ? 3 : 2;
    const gain = baseGain * ZEYNEP_REPUTATION_GAIN_MULTIPLIER;
    player.reputation = Math.min(ZEYNEP_MAX_REPUTATION, player.reputation + gain);
  }

  private getTrackingStackCount(enemy: EnemyModel, now = Date.now()) {
    return enemy.trackingStackUntil.filter((until) => until > now).length;
  }

  private applyTrackingStacks(enemy: EnemyModel, expiresAt: number, stackLimit: number) {
    for (let index = 0; index < stackLimit; index += 1) {
      enemy.trackingStackUntil[index] = Math.max(enemy.trackingStackUntil[index], expiresAt);
    }
    this.setEnemyMark(enemy, "tracking", stackLimit * 0.2, expiresAt);
  }

  private setEnemyMark(enemy: EnemyModel, id: string, add: number, until: number) {
    const next = applyEnemyMark(
      enemy.activeMarkId ? { id: enemy.activeMarkId, add: enemy.activeMarkAdd, expiresAt: enemy.activeMarkUntil } : undefined,
      { id, add, expiresAt: until }
    );
    enemy.activeMarkId = next.id;
    enemy.activeMarkAdd = next.add;
    enemy.activeMarkUntil = next.expiresAt;
  }

  private getTrackingStackLimit(towerLevel: number) {
    if (towerLevel >= 10) {
      return 3;
    }
    if (towerLevel >= 5) {
      return 2;
    }
    return 1;
  }

  private getProjectileDamage(projectile: ProjectileModel, damageMultiplier = 1) {
    return projectile.damage * damageMultiplier;
  }

  private addKillEvent(ownerId: string, enemyId: string) {
    const now = Date.now();
    const streakRule = this.recordPlayerKillStreak(ownerId, now);
    const id = `k${this.nextKillEventId++}`;
    this.killEvents.set(id, {
      id,
      ownerId,
      enemyId,
      serverTime: now,
      streakTier: streakRule?.tier,
      ttlMs: 2200
    });

    if (this.killEvents.size > 80) {
      const oldestId = this.killEvents.keys().next().value;
      if (oldestId) {
        this.killEvents.delete(oldestId);
      }
    }
  }

  private recordPlayerKillStreak(ownerId: string, serverTime: number) {
    const killTimes = [...(this.playerKillStreakTimes.get(ownerId) ?? []), serverTime]
      .filter((time) => serverTime - time <= Math.max(...KILL_STREAK_RULES.map((rule) => rule.windowMs)));
    this.playerKillStreakTimes.set(ownerId, killTimes);

    const rule = this.getTriggeredKillStreakRule(ownerId, serverTime, killTimes);
    if (!rule) {
      return undefined;
    }

    const locks = this.getPlayerKillStreakLocks(ownerId);
    for (const candidate of KILL_STREAK_RULES) {
      if (candidate.kills <= rule.kills) {
        locks.set(candidate.tier, {
          unlockAt: serverTime + KILL_STREAK_RETRIGGER_LOCK_MS,
          wave: this.wave
        });
      }
    }

    this.awardMelisSpectrum(ownerId, getMelisApprovalGain(rule.tier));
    this.applyKillStreakBuff(ownerId, rule, serverTime);
    return rule;
  }

  private getTriggeredKillStreakRule(ownerId: string, serverTime: number, killTimes: number[]) {
    const locks = this.getPlayerKillStreakLocks(ownerId);
    return KILL_STREAK_RULES.find((rule) => {
      const lock = locks.get(rule.tier);
      if (lock && lock.wave === this.wave && serverTime < lock.unlockAt) {
        return false;
      }

      return killTimes.filter((time) => serverTime - time <= rule.windowMs).length >= rule.kills;
    });
  }

  private getPlayerKillStreakLocks(ownerId: string) {
    let locks = this.playerKillStreakLocks.get(ownerId);
    if (!locks) {
      locks = new Map<KillStreakTier, KillStreakLock>();
      this.playerKillStreakLocks.set(ownerId, locks);
    }
    return locks;
  }

  /**
   * Seri kazancini oyuncunun sectigi tarafa yazar.
   *
   * `currentWaveApproval` yonlendirmeden bagimsiz olarak dalga icindeki
   * hareketliligi olcer: dalga sonu cezasi "seri yaptin mi" sorusunun cevabi
   * olmali, "kazanci nereye yazdin" sorusunun degil.
   */
  private awardMelisSpectrum(ownerId: string, amount: number) {
    const player = this.state.players.get(ownerId);
    if (!player || player.characterId !== "archer") {
      return;
    }

    player.currentWaveApproval += amount;
    if (player.melisStance === "stress") {
      player.stress += amount;
    } else {
      player.approval += amount;
    }
  }

  private setMelisStance(client: Client, message: SetMelisStanceMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.characterId !== "archer") {
      return;
    }
    if (message?.stance !== "approval" && message?.stance !== "stress") {
      return;
    }

    player.melisStance = message.stance;
  }

  private applyMelisWaveStress() {
    for (const player of this.state.players.values()) {
      if (player.characterId !== "archer") {
        continue;
      }

      const approval = player.currentWaveApproval;
      if (approval <= 0) {
        player.stress += MELIS_QUIET_WAVE_STRESS;
      } else if (player.lastWaveApproval >= 0 && approval < player.lastWaveApproval) {
        player.stress += MELIS_DECLINE_WAVE_STRESS;
      }

      player.lastWaveApproval = approval;
      player.currentWaveApproval = 0;
      this.applyMelisSpectrumDecay(player);
    }
  }

  /** Onde giden taraf her dalga bir miktar geri cekilir; uclar park yeri degil. */
  private applyMelisSpectrumDecay(player: Player) {
    if (player.approval > player.stress) {
      player.approval = Math.max(player.stress, player.approval - (player.approval - player.stress) * MELIS_SPECTRUM_LEAD_DECAY);
    } else if (player.stress > player.approval) {
      player.stress = Math.max(player.approval, player.stress - (player.stress - player.approval) * MELIS_SPECTRUM_LEAD_DECAY);
    }
  }

  private applyKillStreakBuff(ownerId: string, rule: KillStreakRule, serverTime: number) {
    const buffUntil = serverTime + scaleGameDuration(KILL_STREAK_BUFF_DURATION_MS);
    for (const tower of this.towers.values()) {
      if (tower.ownerId !== ownerId) {
        continue;
      }

      if (tower.streakDamageUntil <= serverTime || rule.damageMultiplier >= tower.streakDamageMultiplier) {
        tower.streakDamageUntil = buffUntil;
        tower.streakDamageMultiplier = rule.damageMultiplier;
      } else {
        tower.streakDamageUntil = Math.max(tower.streakDamageUntil, buffUntil);
      }
      if (rule.hasteMultiplier > 1 && tower.definition.hitType !== "focus") {
        if (tower.streakHasteUntil <= serverTime || rule.hasteMultiplier >= tower.streakHasteMultiplier) {
          tower.streakHasteUntil = buffUntil;
          tower.streakHasteMultiplier = rule.hasteMultiplier;
        } else {
          tower.streakHasteUntil = Math.max(tower.streakHasteUntil, buffUntil);
        }
      }
    }

    if (rule.fearAllMs > 0) {
      for (const enemy of this.enemies.values()) {
        const duration = applyStatusResistance(rule.fearAllMs, enemy.statusResistances.fear);
        enemy.fearUntil = Math.max(enemy.fearUntil, serverTime + scaleGameDuration(duration));
      }
    }
  }

  private addDamageEvent(enemy: EnemyModel, amount: number) {
    if (amount <= 0) {
      return;
    }

    const id = `d${this.nextDamageEventId++}`;
    this.damageEvents.set(id, {
      id,
      x: enemy.x + (Math.random() - 0.5) * 14,
      y: enemy.y - 16 + (Math.random() - 0.5) * 8,
      // Floating combat text must not claim more damage than was actually
      // applied. Rounding every hit up can accumulate into a visible total
      // larger than the enemy's real shield/HP loss.
      amount: Math.max(1, Math.floor(amount)),
      ttlMs: 900
    });

    if (this.damageEvents.size > 120) {
      const oldestId = this.damageEvents.keys().next().value;
      if (oldestId) {
        this.damageEvents.delete(oldestId);
      }
    }
  }

  private damageAllEnemies(damage: number, slowMs: number, ownerId = "") {
    for (const enemy of Array.from(this.enemies.values())) {
      this.damageEnemy(enemy, damage, slowMs, "skill", ownerId);
    }
  }

  private damageFrontEnemies(count: number, damage: number, slowMs: number, ownerId = "") {
    for (const enemy of Array.from(this.enemies.values()).sort((a, b) => b.pathDistance - a.pathDistance).slice(0, count)) {
      this.damageEnemy(enemy, damage, slowMs, "skill", ownerId);
    }
  }

  private damageStrongestEnemy(damage: number, slowMs: number, ownerId = "") {
    const enemy = Array.from(this.enemies.values()).sort((a, b) => b.hp - a.hp)[0];
    if (enemy) {
      this.damageEnemy(enemy, damage, slowMs, "skill", ownerId);
    }
  }

  private slowAllEnemies(slowMs: number) {
    const now = Date.now();
    for (const enemy of this.enemies.values()) {
      this.applyEnemyStatusEffect(enemy, { type: "slow", magnitude: 0.52, durationMs: slowMs, stacking: "refresh" }, now);
    }
  }

  private fireMelisCurse(tower: TowerModel, target: EnemyModel) {
    const now = Date.now();
    const radius = this.getMelisCurseAreaRadius(tower);
    const burstDamage = this.getTowerDamage(tower);
    const expiresAt = now + scaleGameDuration(this.getMelisCurseDurationMs(tower));

    const targets = this.selectEnemiesForAttackShape({
      shape: tower.definition.engine?.attack.shape ?? "circle",
      x: tower.x,
      y: tower.y,
      aimX: target.x,
      aimY: target.y,
      radius,
      canHitAir: tower.definition.engine?.canHitAir ?? false
    }, Array.from(this.enemies.values()), false);
    for (const enemy of targets) {
      this.perfCounters.aoeChecks += 1;
      this.applyMelisCurseLoad(enemy, tower.ownerId, tower.id, tower.melisEvolutionLevel, burstDamage, expiresAt);
    }

    this.beams.set(`melis-curse-${tower.id}`, {
      id: `melis-curse-${tower.id}`,
      definitionId: "archer-3-curse",
      x1: tower.x,
      y1: tower.y,
      x2: target.x,
      y2: target.y,
      width: radius * 2,
      color: 0x7f1dff,
      overdrive: false,
      ttlMs: 320
    });
  }

  private applyMelisCurseLoad(enemy: EnemyModel, ownerId: string, towerId: string, evolutionLevel: number, burstDamage: number, expiresAt: number) {
    const now = Date.now();
    const tower = this.towers.get(towerId);
    if (tower) this.applyConfiguredTowerStatus(tower, enemy, "curse", now, { durationMs: Math.max(0, expiresAt - now) });
    const stackDefinition = tower?.definition.engine?.stacks?.find((stack) => stack.id === "curse-pool");
    const stackState = stackDefinition
      ? this.applyEngineStack(enemy.stackStates, stackDefinition, { trigger: "hit", now, amount: burstDamage })
      : undefined;
    enemy.melisCurseLoad = stackState?.count ?? enemy.melisCurseLoad + 1;
    enemy.melisCurseBurstDamage = stackState?.value ?? enemy.melisCurseBurstDamage + burstDamage;
    enemy.melisCurseUntil = Math.max(enemy.melisCurseUntil, expiresAt);
    enemy.melisCurseOwnerId = ownerId;
    enemy.melisCurseTowerId = towerId;
    enemy.melisCurseEvolutionLevel = Math.max(enemy.melisCurseEvolutionLevel, evolutionLevel);
  }

  private triggerMelisCurseDeathBurst(enemy: EnemyModel, now: number) {
    if (enemy.melisCurseLoad <= 0 || enemy.melisCurseUntil <= now) {
      return;
    }

    const ownerId = enemy.melisCurseOwnerId;
    const towerId = enemy.melisCurseTowerId;
    const evolutionLevel = enemy.melisCurseEvolutionLevel;
    const curseLoad = enemy.melisCurseLoad;
    const damage = enemy.melisCurseBurstDamage;
    const curseTower = this.towers.get(towerId);
    if (curseTower && !this.runTowerTriggers(curseTower, "kill", { target: enemy, now }).includes("death-burst")) {
      return;
    }
    enemy.melisCurseLoad = 0;
    enemy.melisCurseBurstDamage = 0;
    enemy.melisCurseOwnerId = "";
    enemy.melisCurseTowerId = "";
    enemy.melisCurseEvolutionLevel = 0;
    delete enemy.stackStates["curse-pool"];
    const radius = this.scaleWorldDistance(MELIS_CURSE_DEATH_BURST_RADIUS);
    const radiusSq = radius * radius;

    for (const target of Array.from(this.enemies.values())) {
      if (target.id === enemy.id || distanceSq(enemy.x, enemy.y, target.x, target.y) > radiusSq) {
        continue;
      }

      this.damageEnemy(target, damage, 0, "archer-3-curse-burst", ownerId, "psychic", 0, 1, towerId, "curse");
    }

    const beamId = `melis-curse-burst-${enemy.id}-${this.nextBeamId++}`;
    this.beams.set(beamId, {
      id: beamId,
      definitionId: "archer-3-curse-burst",
      x1: enemy.x,
      y1: enemy.y,
      x2: enemy.x,
      y2: enemy.y,
      width: radius * 2,
      color: 0xa855f7,
      overdrive: false,
      ttlMs: 360
    });

    if (evolutionLevel >= 2) {
      this.createMelisCursePool(enemy.x, enemy.y, radius, ownerId, towerId, evolutionLevel, damage / Math.max(1, curseLoad));
    }
  }

  private createMelisCursePool(x: number, y: number, radius: number, ownerId: string, towerId: string, evolutionLevel: number, burstDamage: number) {
    const id = `melis-curse-pool-${this.nextMelisCursePoolId++}`;
    this.melisCursePools.set(id, {
      id,
      ownerId,
      towerId,
      x,
      y,
      radius,
      burstDamage: Math.max(1, burstDamage),
      evolutionLevel,
      expiresAt: Date.now() + scaleGameDuration(MELIS_CURSE_POOL_DURATION_MS),
      affectedEnemyIds: new Set<string>(),
      lastAppliedAtByEnemyId: new Map<string, number>()
    });
  }

  private updateMelisCursePools() {
    const now = Date.now();
    for (const [id, pool] of Array.from(this.melisCursePools.entries())) {
      if (pool.expiresAt <= now) {
        this.melisCursePools.delete(id);
        this.beams.delete(id);
        continue;
      }

      const radiusSq = pool.radius * pool.radius;
      for (const enemy of Array.from(this.enemies.values())) {
        this.perfCounters.aoeChecks += 1;
        if (distanceSq(pool.x, pool.y, enemy.x, enemy.y) > radiusSq) {
          continue;
        }

        const lastAppliedAt = pool.lastAppliedAtByEnemyId.get(enemy.id) ?? 0;
        const canApply = pool.evolutionLevel >= 3
          ? now - lastAppliedAt >= scaleGameDuration(MELIS_CURSE_POOL_TICK_MS)
          : !pool.affectedEnemyIds.has(enemy.id);
        if (!canApply) {
          continue;
        }

        pool.affectedEnemyIds.add(enemy.id);
        pool.lastAppliedAtByEnemyId.set(enemy.id, now);
        this.applyMelisCurseLoad(enemy, pool.ownerId, pool.towerId, pool.evolutionLevel, pool.burstDamage, now + scaleGameDuration(this.getMelisCursePoolCurseDurationMs(pool)));
      }

      this.beams.set(id, {
        id,
        definitionId: "archer-3-curse-pool",
        x1: pool.x,
        y1: pool.y,
        x2: pool.x,
        y2: pool.y,
        width: pool.radius * 2,
        color: 0x581c87,
        overdrive: false,
        ttlMs: Math.max(0, pool.expiresAt - now)
      });
    }
  }

  private getMelisCursePoolCurseDurationMs(pool: MelisCursePoolModel) {
    const tower = this.towers.get(pool.towerId);
    return tower ? this.getMelisCurseDurationMs(tower) : MELIS_CURSE_NORMAL_DURATION_MS;
  }

  private getMelisCurseDurationMs(tower: TowerModel) {
    if (this.isMelisStressDominant(tower)) {
      return MELIS_CURSE_STRESS_DURATION_MS;
    }

    if (this.isMelisApprovalDominant(tower)) {
      return MELIS_CURSE_APPROVAL_DURATION_MS;
    }

    return MELIS_CURSE_NORMAL_DURATION_MS;
  }

  private getMelisCurseAreaRadius(tower: TowerModel) {
    const evolutionBonus = tower.melisEvolutionLevel >= 1 ? MELIS_CURSE_EVOLUTION_AREA_BONUS : 0;
    const baseRadius = this.getTowerAoeRadius(tower) + (tower.level - 1) * 4 + evolutionBonus;
    return this.scaleWorldDistance(baseRadius);
  }

  private fireMelisWhisperChorus(tower: TowerModel, target: EnemyModel) {
    const radius = this.getMelisWhisperRadius(tower);
    const damage = this.getTowerDamage(tower);
    this.spawnSpecialProjectile(tower, "archer-6-whisper", target, damage, 360, radius, 0);
  }

  private applyMelisDoubt(tower: TowerModel, enemy: EnemyModel, now: number, fromSpread = false) {
    if (enemy.melisDoubtUntil <= now) {
      enemy.melisDoubtStacks = 0;
    }

    enemy.melisDoubtStacks = Math.min(3, enemy.melisDoubtStacks + 1);
    enemy.melisDoubtUntil = Math.max(enemy.melisDoubtUntil, now + scaleGameDuration(this.getMelisDoubtDurationMs(tower)));
    this.applyConfiguredTowerStatus(tower, enemy, "slow", now, { durationMs: this.getMelisDoubtDurationMs(tower) });
    const doubtStackDefinition = tower.definition.engine?.stacks?.find((stack) => stack.id === "doubt");
    if (doubtStackDefinition) {
      const state = this.applyEngineStack(enemy.stackStates, doubtStackDefinition, { trigger: "hit", now, maxCount: 3 });
      enemy.melisDoubtStacks = state?.count ?? enemy.melisDoubtStacks;
    }

    if (enemy.melisDoubtStacks < MELIS_DOUBT_TRIGGER_STACKS) {
      return;
    }

    enemy.melisDoubtStacks = 0;
    enemy.melisDoubtUntil = 0;
    delete enemy.stackStates["doubt"];
    const stunState = this.applyConfiguredTowerStatus(tower, enemy, "stun", now, { durationMs: this.getMelisDoubtHesitationMs(tower) });
    if (stunState) {
      enemy.melisDoubtHesitateUntil = Math.max(enemy.melisDoubtHesitateUntil, stunState.expiresAt);
    } else {
      enemy.melisDoubtHesitateUntil = Math.max(enemy.melisDoubtHesitateUntil, now + scaleGameDuration(this.getMelisDoubtHesitationMs(tower)));
    }
    if (this.isMelisStressDominant(tower)) {
      enemy.melisDoubtHasteUntil = Math.max(enemy.melisDoubtHasteUntil, enemy.melisDoubtHesitateUntil + scaleGameDuration(MELIS_DOUBT_STRESS_HASTE_MS));
    }
    if (tower.melisEvolutionLevel >= 1 && enemy.fearUntil > now) {
      this.activateMelisWhisperTurnedEnemy(tower, enemy, now);
    }

    if (!fromSpread && tower.melisEvolutionLevel >= 3) {
      this.spreadMelisDoubt(tower, enemy, now);
    }
  }

  private spreadMelisDoubt(tower: TowerModel, source: EnemyModel, now: number) {
    const radius = this.scaleWorldDistance(MELIS_DOUBT_SPREAD_RADIUS);
    const radiusSq = radius * radius;
    for (const enemy of this.enemies.values()) {
      if (
        enemy.id === source.id ||
        enemy.dominatedUntil > now ||
        enemy.melisUndeadUntil > now ||
        enemy.melisWhisperTurnedUntil > now ||
        distanceSq(source.x, source.y, enemy.x, enemy.y) > radiusSq
      ) {
        continue;
      }
      this.applyMelisDoubt(tower, enemy, now, true);
    }
  }

  private getMelisDoubtDurationMs(tower: TowerModel) {
    const evolutionBonus = tower.melisEvolutionLevel >= 1 ? 1000 : 0;
    const approvalBonus = this.isMelisApprovalDominant(tower) ? MELIS_DOUBT_APPROVAL_BONUS_MS : 0;
    return MELIS_DOUBT_BASE_DURATION_MS + evolutionBonus + approvalBonus;
  }

  private getMelisDoubtHesitationMs(tower: TowerModel) {
    const evolutionBonus = tower.melisEvolutionLevel >= 2 ? 500 : 0;
    return MELIS_DOUBT_HESITATION_BASE_MS + evolutionBonus;
  }

  private getMelisWhisperRadius(tower: TowerModel) {
    return this.scaleWorldDistance(this.getTowerAoeRadius(tower) + (tower.level - 1) * 3 + tower.melisEvolutionLevel * 6);
  }

  private activateMelisWhisperTurnedEnemy(tower: TowerModel, enemy: EnemyModel, now: number) {
    enemy.fearUntil = 0;
    enemy.melisDoubtHesitateUntil = Math.max(enemy.melisDoubtHesitateUntil, now + scaleGameDuration(MELIS_WHISPER_TURN_MS));
    enemy.melisWhisperTurnedUntil = Math.max(enemy.melisWhisperTurnedUntil, now + scaleGameDuration(MELIS_WHISPER_TURN_MS));
    enemy.melisWhisperTurnedOwnerId = tower.ownerId;
    enemy.melisWhisperTurnedSourceTowerId = tower.id;
    enemy.melisWhisperTurnedEvolutionLevel = Math.max(enemy.melisWhisperTurnedEvolutionLevel, tower.melisEvolutionLevel);
    enemy.melisWhisperTurnedAttackCooldownMs = 0;
  }

  private updateMelisWhisperTurnedEnemy(enemy: EnemyModel, seconds: number, now: number) {
    if (enemy.hp <= 0 || enemy.melisWhisperTurnedUntil <= now) {
      this.clearMelisWhisperTurnedEnemy(enemy);
      return;
    }

    if (enemy.melisWhisperTurnedEvolutionLevel >= 3 && enemy.hp / Math.max(1, enemy.maxHp) <= 0.1) {
      this.explodeMelisWhisperTurnedEnemy(enemy);
      return;
    }

    enemy.melisWhisperTurnedAttackCooldownMs = Math.max(0, enemy.melisWhisperTurnedAttackCooldownMs - seconds * 1000);
    if (enemy.melisWhisperTurnedAttackCooldownMs > 0) {
      return;
    }

    const target = this.findMelisWhisperTurnedTarget(enemy, now);
    if (!target) {
      return;
    }

    const damage = Math.max(MELIS_WHISPER_TURN_ATTACK_DAMAGE, enemy.maxHp * 0.035);
    this.damageEnemy(target, damage, 0, "archer-6-whisper-turn", enemy.melisWhisperTurnedOwnerId, "psychic", 0, 1, enemy.melisWhisperTurnedSourceTowerId, "wave");
    enemy.melisWhisperTurnedAttackCooldownMs = scaleGameDuration(MELIS_WHISPER_TURN_ATTACK_INTERVAL_MS);
    const beamId = `melis-whisper-turn-${enemy.id}-${this.nextBeamId++}`;
    this.beams.set(beamId, {
      id: beamId,
      definitionId: "archer-6-whisper-turn",
      x1: enemy.x,
      y1: enemy.y,
      x2: target.x,
      y2: target.y,
      width: this.scaleWorldDistance(6),
      color: 0xa855f7,
      overdrive: false,
      ttlMs: 180
    });
  }

  private clearMelisWhisperTurnedEnemy(enemy: EnemyModel) {
    enemy.melisWhisperTurnedUntil = 0;
    enemy.melisWhisperTurnedOwnerId = "";
    enemy.melisWhisperTurnedSourceTowerId = "";
    enemy.melisWhisperTurnedEvolutionLevel = 0;
    enemy.melisWhisperTurnedAttackCooldownMs = 0;
  }

  private findMelisWhisperTurnedTarget(source: EnemyModel, now: number) {
    const range = this.scaleWorldDistance(MELIS_WHISPER_TURN_ATTACK_RANGE);
    const rangeSq = range * range;
    return this.getEnemiesNear(source.x, source.y, range)
      .filter((enemy) => (
        enemy.id !== source.id &&
        enemy.dominatedUntil <= now &&
        enemy.melisUndeadUntil <= now &&
        enemy.melisWhisperTurnedUntil <= now &&
        distanceSq(source.x, source.y, enemy.x, enemy.y) <= rangeSq
      ))
      .sort((a, b) => b.pathDistance - a.pathDistance)[0];
  }

  private getBlockingMelisWhisperTurned(enemy: EnemyModel) {
    const now = Date.now();
    const radius = this.scaleWorldDistance(MELIS_WHISPER_TURN_BLOCK_RADIUS);
    const radiusSq = radius * radius;
    return this.getEnemiesNear(enemy.x, enemy.y, radius).find((candidate) => (
      candidate.id !== enemy.id &&
      candidate.melisWhisperTurnedUntil > now &&
      candidate.melisWhisperTurnedEvolutionLevel >= 2 &&
      candidate.pathId === enemy.pathId &&
      distanceSq(candidate.x, candidate.y, enemy.x, enemy.y) <= radiusSq
    ));
  }

  private damageMelisWhisperTurnedBlocker(enemy: EnemyModel, amount: number) {
    enemy.hp -= amount;
    if (enemy.melisWhisperTurnedEvolutionLevel >= 3 && enemy.hp > 0 && enemy.hp / Math.max(1, enemy.maxHp) <= 0.1) {
      this.explodeMelisWhisperTurnedEnemy(enemy);
      return;
    }

    if (enemy.hp <= 0) {
      this.enemies.delete(enemy.id);
    }
  }

  private explodeMelisWhisperTurnedEnemy(enemy: EnemyModel) {
    if (!this.enemies.has(enemy.id)) {
      return;
    }

    const damage = Math.max(1, enemy.hp);
    const radius = this.scaleWorldDistance(MELIS_WHISPER_TURN_EXPLOSION_RADIUS);
    const radiusSq = radius * radius;
    for (const target of this.getEnemiesNear(enemy.x, enemy.y, radius)) {
      if (
        target.id === enemy.id ||
        target.melisUndeadUntil > Date.now() ||
        target.melisWhisperTurnedUntil > Date.now() ||
        distanceSq(enemy.x, enemy.y, target.x, target.y) > radiusSq
      ) {
        continue;
      }
      this.damageEnemy(target, damage, 0, "archer-6-whisper-suicide", enemy.melisWhisperTurnedOwnerId, "physical", 0, 1, enemy.melisWhisperTurnedSourceTowerId, "impact");
    }

    const beamId = `melis-whisper-suicide-${enemy.id}-${this.nextBeamId++}`;
    this.beams.set(beamId, {
      id: beamId,
      definitionId: "archer-6-whisper-suicide",
      x1: enemy.x,
      y1: enemy.y,
      x2: enemy.x,
      y2: enemy.y,
      width: radius * 2,
      color: 0xef4444,
      overdrive: false,
      ttlMs: 380
    });
    this.enemies.delete(enemy.id);
  }

  private updateMelisUnderworldLink(tower: TowerModel, now: number, deltaSeconds: number) {
    const maxLinks = tower.melisEvolutionLevel >= 2 ? 2 : 1;
    tower.melisUnderworldTargetIds = tower.melisUnderworldTargetIds.filter((enemyId) => {
      const enemy = this.enemies.get(enemyId);
      return Boolean(enemy && enemy.melisUndeadUntil <= now && enemy.dominatedUntil <= now && enemy.melisWhisperTurnedUntil <= now);
    }).slice(0, maxLinks);

    while (tower.melisUnderworldTargetIds.length < maxLinks) {
      const target = this.findMelisUnderworldTarget(tower, tower.melisUnderworldTargetIds, now);
      if (!target) {
        break;
      }
      tower.melisUnderworldTargetIds.push(target.id);
      this.applyConfiguredTowerStatus(tower, target, "bind", now);
    }

    if (tower.melisUnderworldTargetIds.length === 0) {
      return;
    }

    const isStressMode = tower.melisUnderworldMode === "stress";
    for (const targetId of [...tower.melisUnderworldTargetIds]) {
      const target = this.enemies.get(targetId);
      if (!target) {
        continue;
      }

      if (!this.aimTowerAt(tower, target, deltaSeconds)) {
        break;
      }
      this.applyMelisUnderworldLinkEffects(tower, target, isStressMode, now);
      this.renderMelisUnderworldLink(tower, target, isStressMode);

      if (tower.melisUnderworldPullCount >= 100 && now - tower.melisUnderworldChainLastAt >= scaleGameDuration(MELIS_UNDERWORLD_CHAIN_DAMAGE_INTERVAL_MS)) {
        this.damageMelisUnderworldLinkLine(tower, target);
        tower.melisUnderworldChainLastAt = now;
      }

      if (target.hp / Math.max(1, target.maxHp) <= this.getMelisUnderworldExecuteRatio(tower, target)) {
        this.executeMelisUnderworldTarget(tower, target, isStressMode, now);
      }
    }
  }

  private findMelisUnderworldTarget(tower: TowerModel, existingTargetIds: string[], now: number) {
    const range = this.getTowerRange(tower);
    const candidates = Array.from(this.enemies.values()).filter((enemy) => !existingTargetIds.includes(enemy.id) && enemy.melisUndeadUntil <= now);
    return this.selectEnemyTarget(tower, candidates, tower.definition.engine?.targeting ?? "first", { range, now });
  }

  private applyMelisUnderworldLinkEffects(tower: TowerModel, enemy: EnemyModel, isStressMode: boolean, now: number) {
    if (tower.melisUnderworldPullCount < 20) {
      return;
    }

    const distanceMultiplier = tower.melisUnderworldPullCount >= 50
      ? this.getMelisUnderworldDistanceMultiplier(tower, enemy)
      : 1;

    if (isStressMode) {
      const slowAmount = 0.1 * distanceMultiplier;
      const resistance = enemy.statusResistances.slow ?? 0;
      const resistedMultiplier = 1 - slowAmount * Math.max(0, 1 - resistance);
      enemy.auraSlowMultiplier = Math.min(enemy.auraSlowMultiplier, resistedMultiplier);
      return;
    }

    enemy.melisUnderworldVulnerableUntil = Math.max(enemy.melisUnderworldVulnerableUntil, now + 140);
    enemy.melisUnderworldDamageTakenMultiplier = Math.max(enemy.melisUnderworldDamageTakenMultiplier, 1 + 0.2 * distanceMultiplier);
    this.setEnemyMark(enemy, "underworld", enemy.melisUnderworldDamageTakenMultiplier - 1, now + 140);
  }

  private damageMelisUnderworldLinkLine(tower: TowerModel, linkedEnemy: EnemyModel) {
    const radius = this.scaleWorldDistance(MELIS_UNDERWORLD_CHAIN_RADIUS);
    for (const enemy of Array.from(this.enemies.values())) {
      this.perfCounters.aoeChecks += 1;
      if (enemy.id === linkedEnemy.id || enemy.melisUndeadUntil > Date.now() || enemy.dominatedUntil > Date.now() || enemy.melisWhisperTurnedUntil > Date.now()) {
        continue;
      }

      if (distanceToSegment(enemy.x, enemy.y, tower.x, tower.y, linkedEnemy.x, linkedEnemy.y) <= radius + getEnemyCollisionRadius(enemy)) {
        this.damageEnemy(enemy, this.getMelisUnderworldChainDamage(tower), 0, "archer-4-underworld-link", tower.ownerId, "psychic", 0, tower.level, tower.id, "focus");
      }
    }
  }

  private executeMelisUnderworldTarget(tower: TowerModel, enemy: EnemyModel, isStressMode: boolean, now: number) {
    const killed = this.damageEnemy(enemy, enemy.hp + enemy.shield + enemy.maxHp + 1, 0, "archer-4-underworld-execute", tower.ownerId, "true", 0, tower.level, tower.id, "focus");
    if (!killed) {
      return;
    }

    this.completeMelisUnderworldPull(tower, enemy, isStressMode, now);
  }

  private resolveMelisUnderworldLinkedDeath(enemy: EnemyModel, now: number) {
    for (const tower of this.towers.values()) {
      if (tower.definition.id !== "archer-4" || !tower.melisUnderworldTargetIds.includes(enemy.id)) {
        continue;
      }

      this.completeMelisUnderworldPull(tower, enemy, tower.melisUnderworldMode === "stress", now);
    }
  }

  private completeMelisUnderworldPull(tower: TowerModel, enemy: EnemyModel, isStressMode: boolean, now: number) {
    const x = enemy.x;
    const y = enemy.y;
    const pathId = enemy.pathId;
    const canRaiseShooter = tower.melisEvolutionLevel >= 3 && enemy.type === "shooter";
    tower.melisUnderworldPullCount += 1;
    tower.melisUnderworldTargetIds = tower.melisUnderworldTargetIds.filter((enemyId) => enemyId !== enemy.id);
    const player = this.state.players.get(tower.ownerId);
    if (player?.characterId === "archer") {
      if (isStressMode) {
        player.stress += 1;
      } else {
        player.approval += 1;
        player.currentWaveApproval += 1;
      }
    }

    if (tower.melisEvolutionLevel >= 1) {
      this.fearEnemiesAroundMelisUnderworldPull(tower, x, y, now);
    }

    if (canRaiseShooter) {
      this.spawnMelisUndeadShooter(tower, pathId, now);
    }

    tower.offlineUntil = Math.max(tower.offlineUntil, now + scaleGameDuration(this.getMelisUnderworldDigestMs(tower)));
    const beamId = `melis-underworld-execute-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(beamId, {
      id: beamId,
      definitionId: "archer-4-underworld-execute",
      x1: tower.x,
      y1: tower.y,
      x2: x,
      y2: y,
      width: this.scaleWorldDistance(34),
      color: isStressMode ? 0xef4444 : 0x2dd4bf,
      overdrive: false,
      ttlMs: 420
    });
  }

  private fearEnemiesAroundMelisUnderworldPull(tower: TowerModel, x: number, y: number, now: number) {
    const radius = this.scaleWorldDistance(MELIS_UNDERWORLD_FEAR_RADIUS);
    const radiusSq = radius * radius;
    for (const enemy of this.enemies.values()) {
      if (enemy.melisUndeadUntil > now || distanceSq(x, y, enemy.x, enemy.y) > radiusSq) {
        continue;
      }
      const duration = applyStatusResistance(MELIS_UNDERWORLD_FEAR_MS, enemy.statusResistances.fear);
      enemy.fearUntil = Math.max(enemy.fearUntil, now + scaleGameDuration(duration));
    }
  }

  private spawnMelisUndeadShooter(tower: TowerModel, pathId: number, now: number) {
    const definition = getEnemyCombatDefinition("shooter");
    const race: EnemyRace = "fallen";
    const path = this.activePaths[pathId] ?? this.activePaths[0];
    const pathDistance = Math.max(0, (path?.totalLength ?? totalPathLength) - 1);
    const point = getPointAlongRuntimePath(path, pathDistance);
    const waveScale = getWaveHpMultiplier(this.wave);
    const maxHp = Math.max(1, Math.round(definition.maxHp * waveScale * 0.55));
    const id = `e${this.nextEnemyId++}`;
    this.enemies.set(id, {
      id,
      type: "shooter",
      race,
      x: point.x,
      y: point.y,
      hp: maxHp,
      maxHp,
      armor: definition.armor,
      healthRegenPerSecond: 0,
      shield: 0,
      maxShield: 0,
      movementKind: "ground",
      damageResistances: getEnemyDamageResistances(definition, race),
      hitTypeResistances: { ...definition.hitTypeResistances },
      statusResistances: { ...definition.statusResistances },
      statusEffects: {},
      statusTickAt: {},
      stackStates: {},
      abilities: ["melis-undead"],
      speed: this.scaleWorldSpeed(Math.max(42, definition.speed * 0.72) * ENEMY_MOVEMENT_SPEED_MULTIPLIER),
      reward: 0,
      attack: definition.attack,
      towerAttackCooldownMs: 0,
      pathDistance,
      slowUntil: 0,
      auraSlowMultiplier: 1,
      kinSlowUntil: 0,
      kinSlowMultiplier: 1,
      fearUntil: 0,
      armorBrokenUntil: 0,
      dominatedUntil: 0,
      dominatedOwnerId: "",
      trackingStackUntil: [0, 0, 0],
      melisCurseLoad: 0,
      melisCurseBurstDamage: 0,
      melisCurseUntil: 0,
      melisCurseOwnerId: "",
      melisCurseTowerId: "",
      melisCurseEvolutionLevel: 0,
      melisDoubtStacks: 0,
      melisDoubtUntil: 0,
      melisDoubtHesitateUntil: 0,
      melisDoubtHasteUntil: 0,
      melisWhisperTurnedUntil: 0,
      melisWhisperTurnedOwnerId: "",
      melisWhisperTurnedSourceTowerId: "",
      melisWhisperTurnedEvolutionLevel: 0,
      melisWhisperTurnedAttackCooldownMs: 0,
      melisUndeadOwnerId: tower.ownerId,
      melisUndeadUntil: now + scaleGameDuration(MELIS_UNDERWORLD_UNDEAD_TTL_MS),
      melisUndeadAttackCooldownMs: 0,
      melisUndeadSourceTowerId: tower.id,
      melisUnderworldVulnerableUntil: 0,
      melisUnderworldDamageTakenMultiplier: 1,
      activeMarkId: "",
      activeMarkAdd: 0,
      activeMarkUntil: 0,
      pathId
    });
    this.broadcastEnemySpawn(this.enemies.get(id)!);
  }

  private updateMelisUndead(enemy: EnemyModel, seconds: number, now: number) {
    if (enemy.hp <= 0 || enemy.melisUndeadUntil <= now) {
      this.enemies.delete(enemy.id);
      return;
    }

    enemy.melisUndeadAttackCooldownMs = Math.max(0, enemy.melisUndeadAttackCooldownMs - seconds * 1000);
    const target = this.findMelisUndeadTarget(enemy, now);
    if (target) {
      if (enemy.melisUndeadAttackCooldownMs <= 0) {
        this.damageEnemy(target, MELIS_UNDERWORLD_UNDEAD_DAMAGE, 0, "archer-4-undead-shot", enemy.melisUndeadOwnerId, "psychic", 0, 1, enemy.melisUndeadSourceTowerId, "projectile");
        enemy.melisUndeadAttackCooldownMs = scaleGameDuration(MELIS_UNDERWORLD_UNDEAD_FIRE_INTERVAL_MS);
        const beamId = `melis-undead-shot-${enemy.id}-${this.nextBeamId++}`;
        this.beams.set(beamId, {
          id: beamId,
          definitionId: "archer-4-undead-shot",
          x1: enemy.x,
          y1: enemy.y,
          x2: target.x,
          y2: target.y,
          width: this.scaleWorldDistance(5),
          color: 0x22d3ee,
          overdrive: false,
          ttlMs: 180
        });
      }
      return;
    }

    enemy.pathDistance = Math.max(0, enemy.pathDistance - enemy.speed * seconds);
    if (enemy.pathDistance <= 0) {
      this.enemies.delete(enemy.id);
      return;
    }
    const point = getPointAlongRuntimePath(this.activePaths[enemy.pathId] ?? this.activePaths[0], enemy.pathDistance);
    enemy.x = point.x;
    enemy.y = point.y;
  }

  private findMelisUndeadTarget(source: EnemyModel, now: number) {
    const range = this.scaleWorldDistance(MELIS_UNDERWORLD_UNDEAD_RANGE);
    const rangeSq = range * range;
    return this.getEnemiesNear(source.x, source.y, range)
      .filter((enemy) => enemy.id !== source.id && enemy.melisUndeadUntil <= now && enemy.dominatedUntil <= now && enemy.melisWhisperTurnedUntil <= now && distanceSq(source.x, source.y, enemy.x, enemy.y) <= rangeSq)
      .sort((a, b) => a.pathDistance - b.pathDistance)[0];
  }

  private getBlockingMelisUndead(enemy: EnemyModel) {
    const now = Date.now();
    const radius = this.scaleWorldDistance(MELIS_UNDERWORLD_UNDEAD_BLOCK_RADIUS);
    const radiusSq = radius * radius;
    return this.getEnemiesNear(enemy.x, enemy.y, radius).find((candidate) => (
      candidate.id !== enemy.id &&
      candidate.melisUndeadUntil > now &&
      candidate.pathId === enemy.pathId &&
      distanceSq(candidate.x, candidate.y, enemy.x, enemy.y) <= radiusSq
    ));
  }

  private renderMelisUnderworldLink(tower: TowerModel, enemy: EnemyModel, isStressMode: boolean) {
    const beamId = `melis-underworld-link-${tower.id}-${enemy.id}`;
    this.beams.set(beamId, {
      id: beamId,
      definitionId: "archer-4-underworld-link",
      x1: tower.x,
      y1: tower.y,
      x2: enemy.x,
      y2: enemy.y,
      width: this.scaleWorldDistance(7 + Math.min(10, tower.melisUnderworldPullCount / 12)),
      color: isStressMode ? 0xef4444 : 0x2dd4bf,
      overdrive: false,
      ttlMs: 120
    });
  }

  private getMelisUnderworldExecuteRatio(tower: TowerModel, enemy: EnemyModel) {
    const levelRatio = (Math.max(1, Math.min(MAX_TOWER_LEVEL, tower.level)) - 1) / (MAX_TOWER_LEVEL - 1);
    const baseRatio = MELIS_UNDERWORLD_EXECUTE_MIN_RATIO + (MELIS_UNDERWORLD_EXECUTE_MAX_RATIO - MELIS_UNDERWORLD_EXECUTE_MIN_RATIO) * levelRatio;
    const distanceRatio = Math.min(1, Math.hypot(tower.x - enemy.x, tower.y - enemy.y) / this.getMelisUnderworldFullDistance());
    return baseRatio / (1 + distanceRatio);
  }

  private getMelisUnderworldDigestMs(tower: TowerModel) {
    const levelRatio = (Math.max(1, Math.min(MAX_TOWER_LEVEL, tower.level)) - 1) / (MAX_TOWER_LEVEL - 1);
    return MELIS_UNDERWORLD_DIGEST_MAX_MS - (MELIS_UNDERWORLD_DIGEST_MAX_MS - MELIS_UNDERWORLD_DIGEST_MIN_MS) * levelRatio;
  }

  private getMelisUnderworldDistanceMultiplier(tower: TowerModel, enemy: EnemyModel) {
    const distanceRatio = Math.min(1, Math.hypot(tower.x - enemy.x, tower.y - enemy.y) / this.getMelisUnderworldFullDistance());
    return 1 + distanceRatio;
  }

  private getMelisUnderworldFullDistance() {
    return Math.max(1, this.activeMap.rows * getMapGridSize(this.activeMap));
  }

  private getMelisUnderworldChainDamage(tower: TowerModel) {
    return MELIS_UNDERWORLD_CHAIN_DAMAGE * (1 + (tower.level - 1) * 0.18) * this.getMelisEvolutionDamageMultiplier(tower);
  }

  private getMelisParlamaFearMs(tower: TowerModel) {
    return MELIS_PARLAMA_FEAR_MS + (tower.melisEvolutionLevel >= 3 ? 500 : 0);
  }

  private triggerMelisRageWave(tower: TowerModel, areaDamageMultiplier = 0) {
    const now = Date.now();
    const radius = this.getTowerRange(tower);
    const targets = this.selectEnemiesForAttackShape({
      shape: tower.definition.engine?.attack.shape ?? "circle",
      x: tower.x,
      y: tower.y,
      aimX: tower.x,
      aimY: tower.y,
      radius,
      canHitAir: tower.definition.engine?.canHitAir ?? false
    }, Array.from(this.enemies.values()), false);
    for (const enemy of targets) {
      const rangeExitDamage = areaDamageMultiplier > 0 ? this.getTowerDamage(tower) * areaDamageMultiplier : 0;
      const shieldDamage = tower.melisEvolutionLevel >= 2 && enemy.shield > 0 ? this.getTowerDamage(tower) * 2 : 0;
      const waveDamage = Math.max(rangeExitDamage, shieldDamage);
      if (waveDamage > 0) {
        const killed = this.damageEnemy(
          enemy,
          waveDamage,
          0,
          "archer-2-rage",
          tower.ownerId,
          "psychic",
          0,
          tower.level,
          tower.id,
          "wave"
        );
        if (killed || !this.enemies.has(enemy.id)) {
          continue;
        }
      }

      this.applyConfiguredTowerStatus(tower, enemy, "fear", now, { durationMs: this.getMelisParlamaFearMs(tower) });
      break;
    }

    if (this.isMelisStressDominant(tower)) {
      this.pauseFriendlyTowersInMelisParlamaArea(tower, now);
    }

    const beamId = `melis-rage-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(beamId, {
      id: beamId,
      definitionId: "archer-2-rage",
      x1: tower.x,
      y1: tower.y,
      x2: tower.x,
      y2: tower.y,
      width: radius * 2,
      color: 0xdb2777,
      overdrive: false,
      ttlMs: 380
    });
  }

  private pauseFriendlyTowersInMelisParlamaArea(tower: TowerModel, now: number) {
    const radius = this.getTowerRange(tower);
    const radiusSq = radius * radius;
    const pauseUntil = now + scaleGameDuration(MELIS_PARLAMA_STRESS_FRIENDLY_PAUSE_MS);

    for (const candidate of this.towers.values()) {
      if (candidate.id === tower.id || distanceSq(tower.x, tower.y, candidate.x, candidate.y) > radiusSq) {
        continue;
      }

      candidate.offlineUntil = Math.max(candidate.offlineUntil, pauseUntil);
    }
  }

  private updateSkillCooldowns(deltaTime: number) {
    for (const player of this.state.players.values()) {
      // Bekleme suresi cok yerde kuruldugu icin kurulum yerine tuketim hizi
      // olceklenir: -%20 bekleme, sayacin 1/0.8 hizla akmasi demektir.
      const step = deltaTime / Math.max(0.1, getModifierMultiplier(player.runModifiers, "skillCooldown"));
      player.skill1CooldownMs = Math.max(0, player.skill1CooldownMs - step);
      player.skill2CooldownMs = Math.max(0, player.skill2CooldownMs - step);
      player.skill3CooldownMs = Math.max(0, player.skill3CooldownMs - step);
    }
  }

  private chargeUltimates(seconds: number) {
    for (const player of this.state.players.values()) {
      player.ultimateCharge = Math.min(100, player.ultimateCharge + this.getUltimateChargeGain(player, seconds * 1.4));
    }
  }

  private getUltimateChargeGain(player: Player, amount: number) {
    const base = player.characterId === "warrior" ? amount * ATAKAN_ULTIMATE_CHARGE_MULTIPLIER : amount;
    return base * getModifierMultiplier(player.runModifiers, "ultimateCharge");
  }

  private getSnapshot(): WireGameSnapshot {
    const now = Date.now();
    const worldBounds = this.getActiveWorldBounds();
    const projectileMargin = this.scaleWorldDistance(80);
    this.refreshZeynepFormations();
    const underworldLinkedEnemyIds = new Set<string>();
    for (const tower of this.towers.values()) {
      if (tower.definition.id === "archer-4") {
        for (const enemyId of tower.melisUnderworldTargetIds) {
          underworldLinkedEnemyIds.add(enemyId);
        }
      }
    }
    const teamResources = {
      energy: 0,
      maxEnergy: 0,
      ammunition: { bullet: 0, auraCrystal: 0, powerCrystal: 0 },
      maxAmmunition: { bullet: 0, auraCrystal: 0, powerCrystal: 0 }
    };
    for (const tower of this.towers.values()) {
      if (tower.definition.resourceProvider) {
        continue;
      }
      teamResources.energy += tower.energy;
      teamResources.maxEnergy += tower.maxEnergy;
      teamResources.ammunition[tower.ammoType] += tower.ammo;
      teamResources.maxAmmunition[tower.ammoType] += tower.maxAmmo;
    }
    return {
      serverTime: now,
      hostId: this.hostSessionId,
      players: Array.from(this.state.players.entries()).map(([id, player]) => ({
        id,
        name: player.name,
        characterId: player.characterId,
        gold: Math.floor(player.gold),
        goldSpent: player.goldSpent,
        experience: Math.round(player.experience * 100) / 100,
        ownedShopItemIds: [...player.ownedShopItemIds],
        inventoryItemIds: [...player.inventoryItemIds],
        shopOffers: player.shopOffers,
        shopRerollPrice: getShopRerollPrice(player.shopRerolls),
        towersBuilt: player.towersBuilt,
        towerLimit: this.getPlayerTowerLimit(player),
        ultimateCharge: Math.round(player.ultimateCharge),
        ultimatePower: player.ultimatePower,
        skillCooldowns: [
          Math.ceil(player.skill1CooldownMs / 1000),
          Math.ceil(player.skill2CooldownMs / 1000),
          Math.ceil(player.skill3CooldownMs / 1000)
        ],
        reputation: player.characterId === "zeynep" ? Math.floor(player.reputation + 0.0001) : undefined,
        authorityChain: player.characterId === "zeynep" ? player.authorityChain : undefined,
        authorityQuality: player.characterId === "zeynep" ? player.authorityQuality : undefined,
        approval: player.characterId === "archer" ? player.approval : undefined,
        stress: player.characterId === "archer" ? player.stress : undefined,
        melisStance: player.characterId === "archer" ? player.melisStance : undefined,
        hiredWorkerRoles: [...player.hiredWorkerRoles]
      })),
      enemies: Array.from(this.enemies.values()).map((enemy) => ({
        id: enemy.id,
        x: roundNetworkNumber(enemy.x),
        y: roundNetworkNumber(enemy.y),
        hp: roundNetworkNumber(Math.max(0, enemy.hp)),
        armor: enemy.armor,
        shield: roundNetworkNumber(Math.max(0, enemy.shield)),
        pathDistance: roundNetworkNumber(enemy.pathDistance),
        trackingStacks: this.getTrackingStackCount(enemy, now),
        isTracked: this.getTrackingStackCount(enemy, now) > 0,
        isFeared: enemy.fearUntil > now,
        isArmorBroken: enemy.armorBrokenUntil > now,
        isDominated: enemy.dominatedUntil > now,
        isWhisperTurned: enemy.melisWhisperTurnedUntil > now,
        curseLoad: enemy.melisCurseUntil > now ? Math.round(enemy.melisCurseLoad) : 0,
        doubtStacks: enemy.melisDoubtUntil > now ? enemy.melisDoubtStacks : 0,
        isHesitating: enemy.melisDoubtHesitateUntil > now,
        isBleeding: isStatusEffectActive(enemy.statusEffects.bleed, now),
        isUnderworldLinked: underworldLinkedEnemyIds.has(enemy.id),
        isUndead: enemy.melisUndeadUntil > now
      })),
      towers: Array.from(this.towers.values()).map((tower) => ({
        id: tower.id,
        facing: towerAims(tower.definition.id) ? Math.round(tower.facing * 1000) / 1000 : undefined,
        level: tower.level,
        range: roundNetworkNumber(this.getTowerRange(tower)),
        minimumRange: roundNetworkNumber(this.getTowerMinimumRange(tower)),
        hp: Math.round(tower.hp),
        maxHp: Math.round(tower.maxHp),
        armor: tower.armor,
        disabled: tower.hp <= 0,
        ammo: Math.floor(tower.ammo),
        maxAmmo: tower.maxAmmo,
        energy: Math.floor(tower.energy),
        maxEnergy: tower.maxEnergy,
        standby: tower.standby,
        wakeRemainingMs: Math.max(0, tower.wakeReadyAt - now),
        energyState: getTowerEnergyState(tower.energy, tower.energyDepletedAt, now),
        ammoLogisticsEnabled: tower.ammoLogisticsEnabled,
        temperature: Math.round(tower.temperature * 10) / 10,
        misfortune: tower.characterId === "onur" && tower.definition.damage > 0 ? Math.round(tower.misfortune * 10) / 10 : undefined,
        luckyWindowRemainingMs: tower.characterId === "onur" ? Math.max(0, tower.luckyWindowUntil - now) : undefined,
        lastLuckMultiplier: tower.characterId === "onur" && tower.definition.damage > 0 ? Math.round(tower.lastLuckMultiplier * 100) / 100 : undefined,
        bladeAngle: tower.definition.engine?.attack.executor === "orbit" ? roundNetworkNumber(tower.bladeAngle) : undefined,
        bladeLength: tower.definition.engine?.attack.executor === "orbit" ? roundNetworkNumber(this.getOrbitBladeLengthForTower(tower)) : undefined,
        performance: Math.round(tower.performance * 100) / 100,
        rawAmmo: Math.floor(tower.rawAmmo),
        maxRawAmmo: tower.maxRawAmmo,
        status: this.getTowerStatus(tower),
        damageDealt: Math.round(tower.damageDealt),
        currentDps: roundMetric(this.getTowerCurrentDps(tower, now)),
        melisEvolutionLevel: tower.characterId === "archer" ? tower.melisEvolutionLevel : undefined,
        isMelisFavorite: tower.characterId === "archer" ? this.isMelisFavoriteTower(tower) : undefined,
        melisUnderworldMode: tower.definition.id === "archer-4" ? tower.melisUnderworldMode : undefined,
        melisUnderworldPullCount: tower.definition.id === "archer-4" ? tower.melisUnderworldPullCount : undefined,
        ucubePerks: tower.definition.id === "warrior-6" ? [...tower.ucubePerks] : undefined,
        ucubePendingLevel: tower.definition.id === "warrior-6" && tower.ucubePendingLevel > 0 ? tower.ucubePendingLevel : undefined,
        serverLinkWaveAge: this.getServerLinkWaveAge(tower),
        linkedTowerIds: [...tower.linkedTowerIds],
        zeynepFormationSize: tower.zeynepFormationSize > 0 ? tower.zeynepFormationSize : undefined,
        zeynepFormationLevel: tower.zeynepFormationLevel > 0 ? tower.zeynepFormationLevel : undefined
        ,targetingMode: tower.definition.engine?.attack.executor === "orbit" ? undefined : tower.targetingMode
        ,equippedShopItemIds: tower.equippedShopItemIds.length > 0 ? [...tower.equippedShopItemIds] : undefined
        ,unlockBits: this.getTowerUnlockBits(tower)
      })),
      projectiles: Array.from(this.projectiles.values())
        .filter((projectile) => !usesLinearBallistics(projectile.hitType)
          && projectile.x >= worldBounds.left - projectileMargin && projectile.x <= worldBounds.right + projectileMargin
          && projectile.y >= worldBounds.top - projectileMargin && projectile.y <= worldBounds.bottom + projectileMargin)
        .map((projectile) => ({
        id: projectile.id,
        kind: projectile.kind,
        source: projectile.source,
        definitionId: projectile.definitionId,
        hitType: projectile.hitType,
        x: roundNetworkNumber(projectile.x),
        y: roundNetworkNumber(projectile.y),
        vx: roundNetworkNumber(projectile.vx),
        vy: roundNetworkNumber(projectile.vy),
        tier: this.getProjectileTier(projectile)
      })),
      drones: Array.from(this.drones.values()).map((drone) => ({
        id: drone.id,
        mode: drone.mode,
        x: roundNetworkNumber(drone.x),
        y: roundNetworkNumber(drone.y),
        ownerId: drone.ownerId,
        cargo: drone.cargo,
        capacity: drone.capacity,
        speed: drone.speed,
        targetTowerId: drone.targetTowerId
      })),
      crystalNodes: this.getCrystalNodes(),
      ammoNodes: this.getAmmoNodes(),
      beams: Array.from(this.beams.values())
        .filter((beam) => !beam.delayMs || beam.delayMs <= 0)
        .map((beam) => ({
          id: beam.id,
          definitionId: beam.definitionId,
          x1: roundNetworkNumber(beam.x1),
          y1: roundNetworkNumber(beam.y1),
          x2: roundNetworkNumber(beam.x2),
          y2: roundNetworkNumber(beam.y2),
          scanX: beam.scanX === undefined ? undefined : roundNetworkNumber(beam.scanX),
          scanY: beam.scanY === undefined ? undefined : roundNetworkNumber(beam.scanY),
          width: roundNetworkNumber(beam.width),
          color: beam.color,
          overdrive: beam.overdrive,
          ttlMs: Math.max(0, Math.round(beam.ttlMs))
        })),
      damageEvents: Array.from(this.damageEvents.values()).map((event) => ({
        id: event.id,
        x: roundNetworkNumber(event.x),
        y: roundNetworkNumber(event.y),
        amount: roundNetworkNumber(event.amount)
      })),
      killEvents: Array.from(this.killEvents.values()).map((event) => ({
        id: event.id,
        ownerId: event.ownerId,
        enemyId: event.enemyId,
        serverTime: event.serverTime,
        streakTier: event.streakTier
      })),
      zeynepCommands: this.getZeynepCommandEffectsSnapshot(now),
      melisGothicNightmareActive: this.melisGothicNightmareUntil > now,
      result: this.matchResult,
      setupPhase: this.setupPhase,
      setupReadyPlayerIds: Array.from(this.setupReadyPlayerIds),
      team: {
        health: this.teamHealth,
        maxHealth: MAX_TEAM_HEALTH,
        energy: Math.floor(teamResources.energy),
        maxEnergy: teamResources.maxEnergy,
        ammunition: {
          bullet: Math.floor(teamResources.ammunition.bullet),
          auraCrystal: Math.floor(teamResources.ammunition.auraCrystal),
          powerCrystal: Math.floor(teamResources.ammunition.powerCrystal)
        },
        maxAmmunition: teamResources.maxAmmunition,
        gold: Math.floor(Array.from(this.state.players.values()).reduce((total, player) => total + player.gold, 0)),
        wave: this.wave,
        enemiesLeft: Math.max(0, this.waveTarget - this.waveSpawned) + this.enemies.size,
        kills: this.kills
      }
    };
  }

  private getZeynepCommandEffectsSnapshot(now: number) {
    const commands: GameSnapshot["zeynepCommands"] = {};
    if (this.zeynepHasteUntil > now) {
      commands.haste = {
        tier: this.zeynepHasteTier,
        multiplier: roundMetric(this.zeynepHasteMultiplier),
        remainingMs: Math.max(0, Math.round(this.zeynepHasteUntil - now))
      };
    }
    if (this.zeynepRangeUntil > now) {
      commands.range = {
        tier: this.zeynepRangeTier,
        multiplier: roundMetric(this.zeynepRangeMultiplier),
        remainingMs: Math.max(0, Math.round(this.zeynepRangeUntil - now))
      };
    }
    if (this.zeynepSlowUntil > now) {
      commands.slow = {
        tier: this.zeynepSlowTier,
        multiplier: roundMetric(this.zeynepSlowMultiplier),
        remainingMs: Math.max(0, Math.round(this.zeynepSlowUntil - now))
      };
    }

    return commands.haste || commands.range || commands.slow ? commands : undefined;
  }

  private findTowerDefinition(characterId: CharacterId, definitionId: string) {
    return towerCatalog[characterId].find((definition) => definition.id === definitionId);
  }

  private findTowerDefinitionById(definitionId: string) {
    return TOWER_DEFINITIONS_BY_ID.get(definitionId);
  }

  private getTowerPlacementSpan(definitionId: string) {
    return Math.max(1, this.findTowerDefinitionById(definitionId)?.engine?.placement?.footprintSpan ?? 1);
  }

  private getTowerAuraModifiers(target: TowerModel) {
    const sources: TowerAuraSource[] = [];
    for (const source of this.towers.values()) {
      for (const aura of this.getActiveTowerAuras(source)) {
        if (aura.affects !== "towers") {
          continue;
        }
        const runtimeAura = { ...aura, radius: this.scaleWorldDistance(aura.radius) };
        if (aura.shape === "line") {
          const rect = this.getAbartiRect(source);
          sources.push({
            x: source.orientation === "vertical" ? source.x : rect.left,
            y: source.orientation === "vertical" ? rect.top : source.y,
            x2: source.orientation === "vertical" ? source.x : rect.right,
            y2: source.orientation === "vertical" ? rect.bottom : source.y,
            ownerId: source.ownerId,
            enabled: this.isTowerAuraPowered(source),
            aura: runtimeAura
          });
        } else {
          sources.push({
            x: source.x,
            y: source.y,
            ownerId: source.ownerId,
            enabled: this.isTowerAuraPowered(source),
            aura: runtimeAura
          });
        }
      }
    }
    return evaluateTowerAuras(sources, { x: target.x, y: target.y, kind: "tower", ownerId: target.ownerId });
  }

  private getActiveTowerAuras(tower: TowerModel) {
    return (this.getTowerEngine(tower)?.auras ?? []).filter((aura) => {
      const activation = aura.activation ?? "always";
      return activation !== "isolated" || this.isTowerIsolated(tower);
    });
  }

  private getTowerAuraTickInterval(tower: TowerModel, auras = this.getActiveTowerAuras(tower)) {
    const baseInterval = Math.min(...auras.map((aura) => aura.tickIntervalMs ?? tower.definition.fireIntervalMs));
    const adjustedInterval = this.adjustIntervalForPerformanceAndHeat(tower, baseInterval);
    return adjustedInterval / Math.max(0.01, getModifierMultiplier(this.getTowerRunModifiers(tower), "fireRate"));
  }

  private isTowerAuraPowered(tower: TowerModel) {
    const now = Date.now();
    const periodicAura = isPeriodicTowerAura(tower.definition);
    const refreshActive = !periodicAura || tower.auraExpiresAt >= now;
    const energyStateActive = periodicAura || getTowerEnergyState(tower.energy, tower.energyDepletedAt, now) !== "offline";
    return refreshActive && tower.hp > 0 && !tower.standby && tower.wakeReadyAt <= now
      && tower.offlineUntil <= now
      && energyStateActive;
  }

  private getTowerRange(tower: TowerModel) {
    const applyRangeAura = (range: number) => applyTowerAuraModifier(range, this.getTowerAuraModifiers(tower), "range")
      * getModifierMultiplier(this.getTowerRunModifiers(tower), "range")
      * (this.towerHasUnlock(tower, "isolationBonus") && this.isTowerIsolated(tower) ? 1.15 : 1);
    if (tower.definition.id === "warrior-2") {
      const bounds = this.getActiveWorldBounds();
      return applyRangeAura(Math.hypot(bounds.width, bounds.height));
    }

    const now = Date.now();
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower);
    const zeynepRangeMultiplier = this.zeynepRangeUntil > now ? this.zeynepRangeMultiplier : 1;
    if (hasUcubePerk(tower, "range-hull")) {
      return applyRangeAura(this.scaleWorldDistance((tower.definition.range * 2 + (tower.level - 1) * 11) * passiveMultiplier * zeynepRangeMultiplier * GLOBAL_TOWER_RANGE_MULTIPLIER));
    }

    if (tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > now) {
      const bounds = this.getActiveWorldBounds();
      return applyRangeAura(Math.hypot(bounds.width, bounds.height));
    }

    if (tower.definition.id === "zeynep-2") {
      return applyRangeAura(this.scaleWorldDistance(getZeynepShowcaseBeamLength(tower.level) * passiveMultiplier * zeynepRangeMultiplier * GLOBAL_TOWER_RANGE_MULTIPLIER));
    }

    if (tower.definition.id === "zeynep-3") {
      const composition = this.getZeynepSynthesisComposition(tower);
      if (composition.mode) {
        const baseRange = this.getZeynepSynthesisBaseRange(composition);
        return applyRangeAura(this.scaleWorldDistance((baseRange + (tower.level - 1) * 11) * passiveMultiplier * zeynepRangeMultiplier * GLOBAL_TOWER_RANGE_MULTIPLIER));
      }
    }

    const scaledRange = this.scaleWorldDistance((tower.definition.range + (tower.level - 1) * 11) * passiveMultiplier * zeynepRangeMultiplier * this.getMelisEvolutionRangeMultiplier(tower) * GLOBAL_TOWER_RANGE_MULTIPLIER);
    if (tower.definition.engine?.attack.rangeStartsAtFootprint) {
      const footprintRadius = this.scaleWorldDistance(TOWER_GRID_SIZE * getTowerGridSpan(tower.definition.id) / 2);
      return footprintRadius + applyRangeAura(scaledRange);
    }
    return applyRangeAura(scaledRange);
  }

  private getTowerMinimumRange(tower: TowerModel) {
    const multiplier = Math.max(0, tower.definition.engine?.attack.minimumRangeMultiplier ?? 0);
    if (!tower.definition.engine?.attack.rangeStartsAtFootprint) {
      return this.getTowerRange(tower) * multiplier;
    }
    const footprintRadius = this.scaleWorldDistance(TOWER_GRID_SIZE * getTowerGridSpan(tower.definition.id) / 2);
    return footprintRadius + Math.max(0, this.getTowerRange(tower) - footprintRadius) * multiplier;
  }

  private getZeynepSynthesisBaseRange(composition: ZeynepSynthesisComposition) {
    const sourceTowers = composition.copySourceTower
      ? [composition.copySourceTower, composition.copySourceTower]
      : composition.linkedTowers.filter((tower) => tower.definition.id !== "zeynep-3");

    if (sourceTowers.length === 0) {
      return 0;
    }

    const totalBaseRange = sourceTowers.reduce((total, tower) => total + getZeynepBaseRange(tower.definition), 0);
    return (totalBaseRange / sourceTowers.length) * 1.1;
  }

  private getTowerFireInterval(tower: TowerModel) {
    if (tower.definition.engine?.fixedFireInterval) {
      return tower.definition.fireIntervalMs;
    }
    return this.adjustIntervalForPerformanceAndHeat(tower, this.getTowerBaseFireInterval(tower))
      / Math.max(0.01, getModifierMultiplier(this.getTowerRunModifiers(tower), "fireRate"));
  }

  /**
   * Kulenin taban atis araligi, karakter carpanlari dahil.
   *
   * Melis'in favori ve evrim hizlanmalari bir donem yalnizca en alttaki genel
   * dalda uygulaniyordu; `impact` kuleleri ondan once donuyordu. Sonuc: Kirik
   * Ayna favori secilse bile hasar bonusunu aliyor, atis hizi bonusunu
   * alamiyordu -- ayni pasifin iki yarisi iki farkli kuleye gidiyordu. Carpanlar
   * artik dal ayrimi olmadan burada uygulaniyor.
   */
  private getTowerBaseFireInterval(tower: TowerModel) {
    const characterMultiplier = tower.characterId === "archer"
      ? this.getMelisFavoriteFireIntervalMultiplier(tower)
        * this.getMelisEvolutionFireIntervalMultiplier(tower)
        * this.getMelisHedefciDoubtFireIntervalMultiplier(tower)
      : 1;
    return Math.max(TOWER_MIN_FIRE_INTERVAL_MS, this.getTowerRawFireInterval(tower) * characterMultiplier);
  }

  private getTowerRawFireInterval(tower: TowerModel) {
    const now = Date.now();
    const stackMultiplier = this.getEngineStackStatMultiplier(tower, "fireRate", now);
    const hasteMultiplier = this.damageHasteUntil > now && tower.definition.classType === "damage" ? 1 / 3 : 1;
    const zeynepHasteMultiplier = this.zeynepHasteUntil > now ? 1 / this.zeynepHasteMultiplier : 1;
    const streakHasteMultiplier = this.getTowerStreakFireIntervalMultiplier(tower, now);
    const zeynepFormationMultiplier = getZeynepFormationFireIntervalMultiplier(tower);
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower) > 1 ? 0.9 : 1;
    const melisNightmareHasteMultiplier = this.isMelisGothicNightmareActiveForTower(tower, now) ? 1 / MELIS_GOTHIC_NIGHTMARE_HASTE_MULTIPLIER : 1;
    const melisFocusKillHasteMultiplier = tower.characterId === "archer" && tower.melisFocusKillHasteUntil > now ? 1 / MELIS_FOCUS_KILL_HASTE_MULTIPLIER : 1;

    if (tower.definition.id === "warrior-5") {
      return getDebugLaserFireInterval(tower.level, tower.debugOverdriveUntil > Date.now()) * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier;
    }

    if (tower.definition.id === "zeynep-3") {
      const composition = this.getZeynepSynthesisComposition(tower);
      let baseInterval = tower.definition.fireIntervalMs;
      if (composition.mode === "dual-projectile" || composition.mode === "copy-projectile") {
        baseInterval = getZeynepHizaFireInterval(composition.copySourceTower?.level ?? tower.level);
      } else if (composition.mode === "kin-projectile") {
        baseInterval = getZeynepHizaFireInterval(tower.level);
      } else if (composition.mode === "kin-wave" || composition.mode === "kin-showcase") {
        baseInterval = getKinFireInterval(tower.level);
      } else if (composition.mode === "copy-showcase") {
        baseInterval = composition.copySourceTower?.definition.fireIntervalMs ?? tower.definition.fireIntervalMs;
      }
      return Math.max(80, baseInterval * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier);
    }

    if (tower.definition.hitType === "impact") {
      return Math.max(80, tower.definition.fireIntervalMs * stackMultiplier * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier);
    }

    if (tower.definition.id === "warrior-1") {
      return getTrackerFireInterval(tower.level) * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier;
    }

    if (tower.definition.id === "zeynep-1") {
      return getZeynepHizaFireInterval(tower.level) * stackMultiplier * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier;
    }

    if (tower.definition.id === "zeynep-6") {
      return getKinFireInterval(tower.level) * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier;
    }

    const levelMultiplier = getTowerLevelIntervalMultiplier(tower.definition.id, tower.level);
    const minimumInterval = 80;
    return Math.max(minimumInterval, tower.definition.fireIntervalMs * levelMultiplier * stackMultiplier * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier);
  }

  private isMelisGothicNightmareActiveForTower(tower: TowerModel, now = Date.now()) {
    return tower.characterId === "archer" && (this.melisGothicNightmareOwnerUntil.get(tower.ownerId) ?? 0) > now;
  }

  private getTowerDamage(tower: TowerModel) {
    return resolveModifierBreakdown(this.getTowerDamageBreakdown(tower));
  }

  private getTowerDamageBreakdown(tower: TowerModel): ModifierBreakdown {
    const now = Date.now();
    let breakdown: ModifierBreakdown = {
      base: calculateTowerScaledBaseDamage(tower.definition, tower.level),
      mods: []
    };
    const add = (source: string, multiplier: number) => {
      breakdown = appendLegacyMultiplier(breakdown, source, multiplier);
    };
    add("character:atakan-passive", this.getAtakanPassiveMultiplier(tower));
    if (tower.characterId === "onur" && tower.definition.damage > 0) {
      add("character:onur-gambler", tower.lastLuckMultiplier);
    }
    add("tower:kill-streak", this.getTowerStreakDamageMultiplier(tower, now));
    add("character:zeynep-formation", getZeynepFormationDamageMultiplier(tower));

    if (tower.definition.id === "warrior-4") {
      add("tower:warrior-4:obsession", getObsessionDamageMultiplier(tower.level));
    }

    if (tower.definition.id === "warrior-5") {
      add("tower:warrior-5:debug", getDebugLaserDamageMultiplier(tower.level, tower.debugOverdriveUntil > now));
    }

    if (tower.definition.id === "warrior-6") {
      add("tower:warrior-6:growth", getUcubeGrowthDamageMultiplier(tower.level));
    }

    if (tower.definition.id === "zeynep-1") {
      add("tower:zeynep-1:compensation", getZeynepHizaDamageCompensation(tower.level));
    }

    if (tower.characterId === "archer") {
      add("character:melis-favorite", this.getMelisFavoriteDamageMultiplier(tower));
      add("character:melis-evolution", this.getMelisEvolutionDamageMultiplier(tower));
      if (this.isMelisGothicNightmareActiveForTower(tower, now)) {
        add("character:melis-nightmare", MELIS_GOTHIC_NIGHTMARE_DAMAGE_MULTIPLIER);
      }
    }

    if (tower.definition.id === "archer-1") {
      add("tower:archer-1:focus", this.getMelisHedefciFocusDamageMultiplier(tower));
    }

    if (tower.definition.hitType === "impact") {
      add("tower:warrior-2:server-link", this.getServerLinkedImpactDamageMultiplier(tower));
    }

    add("engine:stack", this.getEngineStackStatMultiplier(tower, "damage", now));
    if ((tower.surgeUntil ?? 0) > now) add("grant:surge", 1 + SURGE_DAMAGE_ADD);
    // Kizgin Namlu: sicaklik artik bir ceza degil, olculen bir kaynak.
    if (this.towerHasUnlock(tower, "heat:runHot")) {
      breakdown.mods.push({ source: "unlock:heat:runHot", scope: "tower", stat: "damage", add: tower.temperature * RUN_HOT_DAMAGE_PER_DEGREE });
    }
    breakdown.mods.push({ source: "shop:zafer-serisi", scope: "player", stat: "damage", add: tower.shopKillStacks * 0.03 });
    breakdown.mods.push({ source: "shop:kidem", scope: "player", stat: "damage", add: tower.shopWaveStacks * 0.02 });
    const shopOwner = this.state.players.get(tower.ownerId);
    if (this.towerHasUnlock(tower, "adjacencyBonus")) breakdown.mods.push({ source: "shop:bitisik-devre", scope: "tower", stat: "damage", add: Math.min(4, this.countAdjacentFriendlyTowers(tower)) * 0.08 });
    if (this.towerHasUnlock(tower, "isolationBonus") && this.isTowerIsolated(tower)) breakdown.mods.push({ source: "shop:yalniz-kurt", scope: "tower", stat: "damage", add: 0.25 });

    if (hasUcubePerk(tower, "damage-step")) {
      add("tower:warrior-6:damage-step", 1.2);
    }

    if (hasUcubePerk(tower, "endurance")) {
      add("tower:warrior-6:endurance", getUcubeLateDamageMultiplier(tower.level));
    }

    if (hasUcubePerk(tower, "damage-double")) {
      add("tower:warrior-6:damage-double", 2);
    }

    if (tower.definition.hitType === "impact") {
      add("engine:impact-compensation", this.getImpactFireRateDamageCompensation(tower));
    }

    add("engine:aura", applyTowerAuraModifier(1, this.getTowerAuraModifiers(tower), "damage"));
    if (tower.ammo <= 0) {
      add("card:son-atis", 1 + getModifierAdd(this.getTowerRunModifiers(tower), "ammoEmptyDamage"));
    }
    const playerModifiers = this.getTowerRunModifiers(tower).filter((modifier) => modifier.scope === "player");
    breakdown.mods.push(
      ...playerModifiers.filter((modifier) => modifier.stat === "damage"),
      ...tower.runModifiers.filter((modifier) => modifier.stat === "damage")
    );
    return breakdown;
  }

  private getTowerRunModifiers(tower: TowerModel): RunModifiers {
    const playerModifiers = this.state.players.get(tower.ownerId)?.runModifiers ?? [];
    return [
      ...playerModifiers.filter((modifier) => {
        const shopId = modifier.source.startsWith("shop:") ? modifier.source.slice(5) : "";
        const shopItem = shopId ? shopCatalog.find((candidate) => candidate.id === shopId) : undefined;
        if (shopItem) return shopItem.scope.kind === "global" || shopItemAppliesToTower(shopItem, tower.definition);
        const cardId = modifier.source.startsWith("card:") ? modifier.source.slice(5) : "";
        const card = cardCatalog.find((candidate) => candidate.id === cardId);
        return !card || card.scope.kind === "global" || cardAppliesToTower(card, tower.definition);
      }),
      ...tower.runModifiers
    ];
  }

  /**
   * Kart ve esya sahipligi degistiginde artan sayac.
   *
   * Kule basina cozulmus motor ve kilit kumesi onbellege alinir; onbellegi ne
   * zaman atacagimizi bu sayac soyler. Sahiplik yalnizca kart secildiginde veya
   * esya alinip takildiginda degistigi icin tek bir sayac yeterli, ve karsiliginda
   * cozumleme atis basina degil dalga basina bir kez calisir.
   */
  private grantGeneration = 0;

  private invalidateTowerGrants() {
    this.grantGeneration += 1;
  }

  /**
   * Kuleye etki eden kart ve esyalarin motor eklerini toplar.
   *
   * Hedefli kartlar ve takili esyalar dogrudan kulenindir. Genel ve etiketli
   * kartlar oyuncuda durur ve ancak kuleye uyuyorsa sayilir; bu, modifier
   * kapsam kuraliyla ayni kural olmak zorunda, yoksa "sadece isin kulelerinde"
   * yazan bir kart butun kulelerin motorunu degistirirdi.
   */
  private collectTowerGrants(tower: TowerModel) {
    const grants: TowerGrant[] = [];
    const unlocks = new Set<Unlock>();

    const takeShopItem = (itemId: string) => {
      const item = getShopItem(itemId);
      if (!item) return;
      if (item.grants) grants.push(item.grants);
      for (const unlock of item.unlocks ?? []) unlocks.add(unlock);
    };
    const takeCard = (card: CardDefinition | undefined) => {
      if (!card) return;
      if (card.grants) grants.push(card.grants);
      for (const unlock of card.unlocks ?? []) unlocks.add(unlock);
    };

    for (const itemId of tower.equippedShopItemIds) takeShopItem(itemId);
    for (const cardId of tower.targetedCardIds) takeCard(getCardDefinition(cardId));
    for (const cardId of this.state.players.get(tower.ownerId)?.ownedCardIds ?? []) {
      const card = getCardDefinition(cardId);
      if (!card || card.scope.kind === "targeted") continue;
      if (card.scope.kind === "global" || cardAppliesToTower(card, tower.definition)) takeCard(card);
    }

    return {
      generation: this.grantGeneration,
      engine: resolveTowerEngine(tower.definition.engine, grants),
      attackMultipliers: resolveTowerAttackMultipliers(grants),
      unlocks
    };
  }

  private getTowerGrantState(tower: TowerModel) {
    if (!tower.grantCache || tower.grantCache.generation !== this.grantGeneration) {
      tower.grantCache = this.collectTowerGrants(tower);
    }
    return tower.grantCache;
  }

  /**
   * Kulenin calisan motoru: sabit tanim, kartlarin ve esyalarin ekledikleriyle
   * birlestirilmis hali.
   *
   * Sunucunun stack, aura, trigger ve durum etkisi okumalari buradan gecer.
   * Sabit tanimi dogrudan okuyan bir yer kalirsa oradaki davranis kartlara
   * kapali kalir, o yuzden yeni kod yazarken kural basit: motoru buradan al.
   */
  private getTowerEngine(tower: TowerModel) {
    return this.getTowerGrantState(tower).engine;
  }

  /**
   * Kulenin alan etkisi yaricapi. `getTowerAttackRadius` sabit tanimi okudugu
   * icin cozulmus motorun yerini tutmaz; yaricapi buyuten bir kart oradan
   * gecmezdi.
   */
  private getTowerAoeRadius(tower: TowerModel) {
    const state = this.getTowerGrantState(tower);
    const base = tower.definition.engine?.attack.radius ?? tower.definition.aoeRadius ?? 0;
    return base * state.attackMultipliers.radius;
  }

  /**
   * Koni saldirilarinin acisi (radyan).
   *
   * Deger kule tanimlarinda zaten yaziliydi ama sunucu onu okumak yerine ayni
   * sayiyi sabit olarak tasiyordu; boylece aciyi degistiren bir kart yazmak
   * imkansizdi. Tanim yoksa eski sabite duseriz.
   */
  private getTowerConeAngleRadians(tower: TowerModel) {
    const degrees = tower.definition.engine?.attack.angle;
    const base = degrees === undefined ? KIN_WAVE_ANGLE_RADIANS : degreesToRadians(degrees);
    return base * this.getTowerGrantState(tower).attackMultipliers.angle;
  }

  /**
   * Bir kulenin sahip oldugu davranis kilidini kaynagindan bagimsiz cozer.
   *
   * Kilitler once yalnizca esya kimligine bakan elle yazilmis dallardi; bu
   * yuzden ayni davranisi veren bir kart eklemek imkansizdi. Artik hem takili
   * esyalar hem kartlar ayni `unlocks` verisini bildiriyor ve tek bir yerden
   * okunuyor, boylece yeni icerik kod degil veri isi.
   */
  private towerHasUnlock(tower: TowerModel | undefined, unlock: Unlock) {
    return tower ? this.getTowerGrantState(tower).unlocks.has(unlock) : false;
  }

  /** Snapshot icin kulenin acik kilitleri; hicbiri yoksa alan gonderilmez. */
  private getTowerUnlockBits(tower: TowerModel) {
    const state = this.getTowerGrantState(tower);
    return state.unlocks.size === 0 ? undefined : encodeUnlocks(state.unlocks);
  }

  /** Kuleye degil oyuncuya ait kilitler: nexus, altin ekonomisi gibi. */
  private playerHasUnlock(playerId: string, unlock: Unlock) {
    const player = this.state.players.get(playerId);
    if (!player) return false;
    for (const itemId of player.ownedShopItemIds) {
      if (getShopItem(itemId)?.unlocks?.includes(unlock)) return true;
    }
    for (const cardId of player.ownedCardIds) {
      if (cardCatalog.find((card) => card.id === cardId)?.unlocks?.includes(unlock)) return true;
    }
    return false;
  }

  /** Oyuncunun herhangi bir kulesinde bu kilit var mi. */
  private ownerHasTowerUnlock(ownerId: string, unlock: Unlock) {
    for (const tower of this.towers.values()) {
      if (tower.ownerId === ownerId && this.towerHasUnlock(tower, unlock)) return true;
    }
    return false;
  }

  /** Isci esyalari, iscinin o an hizmet ettigi binaya takili olanlardan gelir. */
  /**
   * Isciye isleyen modifikatorler.
   *
   * Iki kaynak var: oyuncunun kuresel kartlari ve iscinin o an hizmet ettigi
   * binaya takili esyalar. Yalnizca binaya bakmak iki seyi birden bozuyordu --
   * kart katmani isciler icin tumden oluydu, ve bir hedefe baglanmamis isci
   * (dugume yururken, yuk toplarken) hicbir buff gormuyordu.
   */
  private getWorkerModifiers(worker: DroneModel): RunModifiers {
    const playerModifiers = worker.ownerId ? this.state.players.get(worker.ownerId)?.runModifiers ?? [] : [];
    const globalModifiers = playerModifiers.filter((modifier) => {
      const shopId = modifier.source.startsWith("shop:") ? modifier.source.slice(5) : "";
      const shopItem = shopId ? shopCatalog.find((candidate) => candidate.id === shopId) : undefined;
      if (shopItem) return shopItem.scope.kind === "global";
      const cardId = modifier.source.startsWith("card:") ? modifier.source.slice(5) : "";
      const card = cardCatalog.find((candidate) => candidate.id === cardId);
      return !card || card.scope.kind === "global";
    });

    const tower = worker.targetTowerId ? this.towers.get(worker.targetTowerId) : undefined;
    return tower && tower.ownerId === worker.ownerId
      ? [...globalModifiers, ...tower.runModifiers]
      : globalModifiers;
  }

  private getTowerStreakDamageMultiplier(tower: TowerModel, now: number) {
    return tower.streakDamageUntil > now ? tower.streakDamageMultiplier : 1;
  }

  private getTowerStreakFireIntervalMultiplier(tower: TowerModel, now: number) {
    if (tower.definition.hitType === "focus" || tower.streakHasteUntil <= now) {
      return 1;
    }

    return 1 / tower.streakHasteMultiplier;
  }

  private getImpactFireRateDamageCompensation(tower: TowerModel) {
    const stackMultiplier = tower.definition.id === "warrior-6" ? this.getEngineStackMultiplier(tower, "ucube-fire-rate", getUcubeStackIntervalMultiplier(tower.focusStacks)) : 1;
    const hasteMultiplier = this.damageHasteUntil > Date.now() && tower.definition.classType === "damage" ? 1 / 3 : 1;
    const zeynepHasteMultiplier = this.zeynepHasteUntil > Date.now() ? 1 / this.zeynepHasteMultiplier : 1;
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower) > 1 ? 0.9 : 1;
    const previousLevelMultiplier = getTowerLevelIntervalMultiplier(tower.definition.id, tower.level);
    const previousInterval = Math.max(80, tower.definition.fireIntervalMs * previousLevelMultiplier * stackMultiplier * hasteMultiplier * zeynepHasteMultiplier * passiveMultiplier);
    const currentInterval = Math.max(80, tower.definition.fireIntervalMs * stackMultiplier * hasteMultiplier * zeynepHasteMultiplier * passiveMultiplier);
    return currentInterval / Math.max(1, previousInterval);
  }

  private getServerLinkWaveAge(tower: TowerModel) {
    return this.serverLinkWaveAgeCache.get(tower.id) ?? 0;
  }

  private refreshServerLinkWaveAgeCache() {
    this.serverLinkWaveAgeCache.clear();
    for (const serverTower of this.towers.values()) {
      if (serverTower.definition.id !== "warrior-2") {
        continue;
      }

      for (const linkedTowerId of serverTower.linkedTowerIds) {
        const linkedTower = this.towers.get(linkedTowerId);
        if (!linkedTower) {
          continue;
        }

        const previousAge = this.serverLinkWaveAgeCache.get(linkedTowerId) ?? 0;
        const nextAge = Math.max(previousAge, serverTower.linkedTowerWaveAges[linkedTowerId] ?? 0);
        this.serverLinkWaveAgeCache.set(linkedTowerId, nextAge);
      }
    }
  }

  private getServerLinkedMaxHealthDamageRatio(tower: TowerModel) {
    const serverLevel = this.getStrongestServerLinkLevel(tower, 10);
    return serverLevel > 0 ? getServerLinkMaxHealthDamageRatio(serverLevel) : 0;
  }

  private getServerLinkedImpactDamageMultiplier(tower: TowerModel) {
    const serverLevel = this.getStrongestServerLinkLevel(tower, 5);
    return serverLevel > 0 ? 1 + getServerLinkImpactDamageBonus(serverLevel) : 1;
  }

  private getStrongestServerLinkLevel(tower: TowerModel, minimumAge: number) {
    let bestLevel = 0;
    for (const serverTower of this.towers.values()) {
      if (serverTower.definition.id !== "warrior-2") {
        continue;
      }

      if (!serverTower.linkedTowerIds.includes(tower.id)) {
        continue;
      }

      if ((serverTower.linkedTowerWaveAges[tower.id] ?? 0) < minimumAge) {
        continue;
      }

      bestLevel = Math.max(bestLevel, serverTower.level);
    }

    return bestLevel;
  }

  private getTowerStatus(tower: TowerModel) {
    const now = Date.now();
    if (tower.hp <= 0) {
      return "Devre Disi";
    }
    if (tower.definition.resourceProvider === "ammunition") {
      return tower.rawAmmo <= 0
        ? "Cephane Hammaddesi Yok"
        : tower.energy > 0
          ? `Fabrika ${Math.floor(tower.ammo)}/${tower.maxAmmo}`
          : "Fabrika Enerjisiz";
    }
    if (tower.definition.resourceProvider === "energy") {
      return `Enerji Deposu ${Math.floor(tower.energy)}/${tower.maxEnergy}`;
    }
    if (tower.standby) return "Beklemede";
    if (tower.wakeReadyAt > now) return `Isiniyor ${Math.ceil((tower.wakeReadyAt - now) / 1000)}sn`;
    if (tower.offlineUntil > now) {
      return "Tukenmis";
    }
    if (tower.overheatMs > 0) {
      return "Hararet";
    }
    if (!tower.definition.resourceProvider && tower.performance <= 0) {
      return "Performans Kapali";
    }
    if (!tower.definition.resourceProvider && tower.heatLocked) {
      return "Asiri Sicak";
    }
    if (tower.ammo < this.getTowerAmmoCost(tower)) {
      return "Muhimmat Yok";
    }
    const minimumEnergy = tower.definition.engine?.attack.executor === "orbit" ? Number.EPSILON : this.getTowerEnergyCost(tower);
    if (getTowerEnergyState(tower.energy, tower.energyDepletedAt, now) !== "powered" || tower.energy < minimumEnergy) {
      return "Enerji Yok";
    }
    if (tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > now) {
      return "Overdrive";
    }
    if (tower.characterId === "archer" && tower.melisFocusUntil > now) {
      return tower.melisFocusKillHasteUntil > now ? "Odaklan x5" : "Odaklan";
    }
    if (this.isMelisGothicNightmareActiveForTower(tower, now)) {
      return "Gotik Kabus";
    }
    if (tower.definition.id === "archer-5") {
      const capacity = this.getMelisBrokenMirrorCapacity(tower);
      return `Ayna ${Math.min(100, Math.round((tower.melisMirrorCharge / Math.max(1, capacity)) * 100))}%`;
    }
    if (tower.definition.id === "archer-4") {
      return `Bag ${tower.melisUnderworldTargetIds.length}/${tower.melisEvolutionLevel >= 2 ? 2 : 1} | Ruh ${tower.melisUnderworldPullCount} | ${tower.melisUnderworldMode === "approval" ? "Onay" : "Stres"}`;
    }
    if (tower.streakDamageUntil > now || tower.streakHasteUntil > now) {
      const damageBonus = tower.streakDamageUntil > now ? Math.round((tower.streakDamageMultiplier - 1) * 100) : 0;
      const hasteBonus = tower.streakHasteUntil > now ? Math.round((tower.streakHasteMultiplier - 1) * 100) : 0;
      return hasteBonus > 0 ? `Streak +${damageBonus}%/+${hasteBonus}%` : `Streak +${damageBonus}%`;
    }
    if (tower.characterId === "archer" && tower.melisEvolutionLevel > 0) {
      return `${this.isMelisFavoriteTower(tower) ? "Favori " : ""}Evrim ${tower.melisEvolutionLevel}`;
    }
    if (this.isMelisFavoriteTower(tower)) {
      return "Favori";
    }
    if (tower.definition.id === "warrior-2" && tower.linkedTowerIds.length > 0) {
      const maxAge = Math.max(...tower.linkedTowerIds.map((towerId) => tower.linkedTowerWaveAges[towerId] ?? 0));
      return `Link ${tower.linkedTowerIds.length}/2 ${maxAge}T`;
    }
    if (tower.definition.id === "zeynep-3") {
      const composition = this.getZeynepSynthesisComposition(tower);
      if (composition.mode === "dual-projectile") {
        return "Sentez 1+1";
      }
      if (composition.mode === "burn-impact") {
        return "Sentez 2+2";
      }
      if (composition.mode === "mirror-beam") {
        return "Sentez 1+2";
      }
      if (composition.mode === "copy-projectile") {
        return "Kopya 1";
      }
      if (composition.mode === "copy-showcase") {
        return "Kopya 2";
      }
      return "Ucgen bekliyor";
    }
    const serverLinkAge = this.getServerLinkWaveAge(tower);
    if (serverLinkAge >= 10) {
      return "Sunucu 10T";
    }
    if (serverLinkAge >= 5) {
      return "Sunucu 5T";
    }
    if (tower.zeynepFormationSize === 3) {
      return `Dizilim 3 Lv.${tower.zeynepFormationLevel}`;
    }
    if (tower.zeynepFormationSize === 2) {
      return `Dizilim 2 Lv.${tower.zeynepFormationLevel}`;
    }
    if (tower.characterId === "warrior" && this.getAtakanPassiveMultiplier(tower) > 1) {
      return "Pasif";
    }
    return "";
  }

  private getAtakanPassiveMultiplier(tower: TowerModel) {
    return tower.characterId === "warrior" && tower.definition.id !== "warrior-2" && this.isTowerIsolated(tower) ? 1.12 : 1;
  }

  private registerMelisFavoriteTower(tower: TowerModel) {
    if (tower.characterId !== "archer") {
      return;
    }

    const favorites = this.melisFavoriteTowerIds.get(tower.ownerId) ?? [];
    if (favorites.length >= MELIS_MAX_FAVORITE_TOWERS || favorites.includes(tower.id)) {
      return;
    }

    favorites.push(tower.id);
    this.melisFavoriteTowerIds.set(tower.ownerId, favorites);
  }

  private isMelisFavoriteTower(tower: TowerModel) {
    return tower.characterId === "archer" && (this.melisFavoriteTowerIds.get(tower.ownerId) ?? []).includes(tower.id);
  }

  private getMelisSpectrumZoneFor(tower: TowerModel) {
    if (tower.characterId !== "archer") {
      return undefined;
    }

    const player = this.state.players.get(tower.ownerId);
    return player ? getMelisSpectrumZone(player.approval, player.stress) : undefined;
  }

  /**
   * Stres baskin mi.
   *
   * Stres tarafi yalnizca bedel tasir: kisalan lanet suresi, rastgele ayna
   * hedefi, cikmayan olum patlamasi, supheden sonra hizlanan dusman ve Parlama'nin
   * dost kuleleri durdurmasi. Odulu kule etkilerinde degil, evrim kapisinda --
   * stres/onay orani evrimin para birimi. Bu ayrimi bozan her "streste sunu da
   * kazan" eklemesi, stresi biriktirmeyi kendi basina karli hale getirir ve
   * mekanigi bir tercihten cikarip tek yonlu bir kaydiraga cevirir.
   */
  private isMelisStressDominant(tower: TowerModel) {
    return this.getMelisSpectrumZoneFor(tower) === "stress";
  }

  private isMelisApprovalDominant(tower: TowerModel) {
    return this.getMelisSpectrumZoneFor(tower) === "approval";
  }

  private getMelisFavoriteDamageMultiplier(tower: TowerModel) {
    if (!this.isMelisFavoriteTower(tower)) {
      return 1;
    }

    const approval = this.state.players.get(tower.ownerId)?.approval ?? 0;
    return 1 + Math.min(MELIS_APPROVAL_CAP, approval) * MELIS_FAVORITE_DAMAGE_PER_APPROVAL;
  }

  private getMelisFavoriteFireIntervalMultiplier(tower: TowerModel) {
    if (!this.isMelisFavoriteTower(tower)) {
      return 1;
    }

    const approval = this.state.players.get(tower.ownerId)?.approval ?? 0;
    return Math.max(MELIS_FAVORITE_FIRE_INTERVAL_FLOOR, 1 - Math.min(MELIS_APPROVAL_CAP, approval) * MELIS_FAVORITE_FIRE_INTERVAL_PER_APPROVAL);
  }

  private getMelisEvolutionDamageMultiplier(tower: TowerModel) {
    return tower.characterId === "archer" ? 1 + tower.melisEvolutionLevel * 0.18 : 1;
  }

  private getMelisEvolutionFireIntervalMultiplier(tower: TowerModel) {
    return tower.characterId === "archer" ? Math.max(0.8, 1 - tower.melisEvolutionLevel * 0.0667) : 1;
  }

  private getMelisEvolutionRangeMultiplier(tower: TowerModel) {
    return tower.characterId === "archer" ? 1 + tower.melisEvolutionLevel * 0.1 : 1;
  }

  private getMelisHedefciFocusDamageMultiplier(tower: TowerModel) {
    if (tower.definition.id !== "archer-1" || tower.melisEvolutionLevel < 2 || !tower.focusTargetId) {
      return 1;
    }

    const focusedHedefciCount = Array.from(this.towers.values()).filter((candidate) => (
      candidate.ownerId === tower.ownerId &&
      candidate.definition.id === "archer-1" &&
      candidate.focusTargetId === tower.focusTargetId
    )).length;

    return focusedHedefciCount > 0 ? 1.5 ** focusedHedefciCount : 1;
  }

  private getMelisFocusProjectileSpeedMultiplier(tower: TowerModel) {
    return tower.characterId === "archer" && tower.melisFocusUntil > Date.now()
      ? MELIS_FOCUS_PROJECTILE_SPEED_MULTIPLIER
      : 1;
  }

  private getMelisHedefciDoubtFireIntervalMultiplier(tower: TowerModel) {
    if (tower.definition.id !== "archer-1" || tower.melisEvolutionLevel < 3 || !tower.focusTargetId) {
      return 1;
    }

    const target = this.enemies.get(tower.focusTargetId);
    if (!target || target.melisDoubtUntil <= Date.now()) {
      return 1;
    }

    const doubtStacks = Math.max(0, Math.min(3, target.melisDoubtStacks));
    const attackSpeedBonus = doubtStacks >= 3 ? 0.4 : doubtStacks * 0.1;
    return 1 / (1 + attackSpeedBonus);
  }

  private updateUcubeRhythm(tower: TowerModel, target: EnemyModel | undefined, deltaTime: number) {
    if (tower.definition.id !== "warrior-6") {
      return;
    }

    if (!target) {
      tower.activeMs = 0;
      tower.focusStacks = 0;
      tower.focusTargetId = "";
      const definition = tower.definition.engine?.stacks?.find((stack) => stack.id === "ucube-fire-rate");
      if (definition) {
        this.resetEngineStack(tower.stackStates, definition, "noTarget");
      }
      return;
    }

    tower.activeMs += deltaTime;
    tower.focusTargetId = target.id;
    const stackLimit = hasUcubePerk(tower, "stacks-20") ? 20 : hasUcubePerk(tower, "stacks-15") ? 15 : 10;
    const desiredStacks = Math.min(stackLimit, Math.floor(tower.activeMs / 1000));
    const definition = tower.definition.engine?.stacks?.find((stack) => stack.id === "ucube-fire-rate");
    if (definition) {
      let state: TowerStackRuntimeState | undefined = tower.stackStates[definition.id];
      while ((state?.count ?? 0) < desiredStacks) {
        state = this.applyEngineStack(tower.stackStates, definition, { trigger: "activeSecond", now: Date.now(), maxCount: stackLimit });
      }
      tower.focusStacks = state?.count ?? 0;
    } else {
      tower.focusStacks = desiredStacks;
    }

    if (!hasUcubePerk(tower, "endurance") && tower.activeMs >= 20000) {
      tower.overheatMs = 10000;
      tower.activeMs = 0;
      tower.focusStacks = 0;
      delete tower.stackStates["ucube-fire-rate"];
    }
  }

  private isTowerIsolated(tower: TowerModel) {
    const towerCell = worldToGrid(tower.x, tower.y, this.activeMap);
    for (const other of this.towers.values()) {
      if (other.id === tower.id) {
        continue;
      }

      const otherCell = worldToGrid(other.x, other.y, this.activeMap);
      if (Math.abs(otherCell.col - towerCell.col) <= 1 && Math.abs(otherCell.row - towerCell.row) <= 1) {
        return false;
      }
    }

    return true;
  }

  private countAdjacentFriendlyTowers(tower: TowerModel) {
    return this.getAdjacentFriendlyTowers(tower).length;
  }

  /** Ayni oyuncunun bir kare mesafedeki kuleleri; kosegenler dahil. */
  private getAdjacentFriendlyTowers(tower: TowerModel) {
    const towerCell = worldToGrid(tower.x, tower.y, this.activeMap);
    const neighbours: TowerModel[] = [];
    for (const other of this.towers.values()) {
      if (other.id === tower.id || other.ownerId !== tower.ownerId) continue;
      const otherCell = worldToGrid(other.x, other.y, this.activeMap);
      if (Math.abs(otherCell.col - towerCell.col) <= 1 && Math.abs(otherCell.row - towerCell.row) <= 1) neighbours.push(other);
    }
    return neighbours;
  }

  private applyTowerEnemyAuras(tower: TowerModel, activeAuras = this.getActiveTowerAuras(tower)) {
    const range = this.getTowerRange(tower);
    for (const definition of activeAuras) {
      if (definition.affects !== "enemies" || definition.stat !== "slow") continue;
      const runtimeDefinition: TowerAuraDefinition = {
        ...definition,
        radius: range,
        multiplier: getTowerAuraLevelMultiplier(definition, tower.level)
      };
      for (const enemy of this.enemies.values()) {
        this.perfCounters.aoeChecks += 1;
        const modifier = evaluateTowerAuras([{
          x: tower.x,
          y: tower.y,
          ownerId: tower.ownerId,
          enabled: this.isTowerAuraPowered(tower),
          aura: runtimeDefinition
        }], { x: enemy.x, y: enemy.y, kind: "enemy" }).slow;
        if (modifier !== undefined) {
          const resistance = enemy.statusResistances.slow ?? 0;
          const resistedMultiplier = 1 - (1 - modifier) * Math.max(0, 1 - resistance);
          enemy.auraSlowMultiplier = Math.min(enemy.auraSlowMultiplier, resistedMultiplier);
        }
      }
    }
  }

  private resetAuraSlows() {
    for (const enemy of this.enemies.values()) {
      enemy.auraSlowMultiplier = 1;
    }
  }

  private startSympathy() {
    this.sympathyUntil = Date.now() + scaleGameDuration(SYMPATHY_DURATION_MS);
    this.sympathyBledEnemyIds.clear();
    this.sympathyLinks = [];
  }

  /**
   * Sempati agini her tick yeniden kurar ve baga degen dusmanlari isler.
   *
   * Ag her tick yeniden hesaplanir cunku ulti suresi boyunca kule kurulabilir,
   * satilabilir veya yikilabilir; "en yakin kule" o anki sahaya gore gecerli
   * olmali. Yavaslatma aura kanalindan gider: aura carpani her tickte 1'e
   * donduruldugu icin dusman bagi gectigi anda yavaslama kendiliginden biter,
   * ayrica bir sure takibi gerekmez.
   */
  private updateSympathy() {
    const now = Date.now();
    if (this.sympathyUntil <= now) {
      if (this.sympathyLinks.length > 0) {
        this.sympathyLinks = [];
        this.sympathyBledEnemyIds.clear();
      }
      return;
    }

    this.sympathyLinks = buildSympathyLinks(Array.from(this.towers.values(), (tower) => ({
      id: tower.id,
      x: tower.x,
      y: tower.y
    })));

    const halfWidth = this.scaleWorldDistance(SYMPATHY_LINK_HALF_WIDTH);
    for (const link of this.sympathyLinks) {
      this.beams.set(link.id, {
        id: link.id,
        definitionId: "onur-sympathy",
        x1: link.x1,
        y1: link.y1,
        x2: link.x2,
        y2: link.y2,
        width: halfWidth * 2,
        color: 0x2dd4bf,
        ttlMs: Math.max(80, SNAPSHOT_SEND_INTERVAL_MS * 3)
      });
    }

    const contacts = selectSympathyContacts(this.sympathyLinks, Array.from(this.enemies.values()), halfWidth);
    for (const enemy of contacts) {
      const resistedMultiplier = 1 - applyStatusResistance(
        1 - SYMPATHY_SLOW_MULTIPLIER,
        enemy.statusResistances.slow
      );
      enemy.auraSlowMultiplier = Math.min(enemy.auraSlowMultiplier, resistedMultiplier);

      if (this.sympathyBledEnemyIds.has(enemy.id)) continue;
      this.sympathyBledEnemyIds.add(enemy.id);
      this.applyEnemyStatusEffect(
        enemy,
        {
          type: "bleed",
          magnitude: SYMPATHY_BLEED_MAX_HEALTH_RATIO_PER_SECOND,
          durationMs: SYMPATHY_BLEED_DURATION_MS,
          stacking: "refresh"
        },
        now
      );
    }
  }

  private advanceWaveGrowth() {
    const now = Date.now();
    for (const tower of this.towers.values()) {
      tower.shopKillStacks = 0;
      if (this.towerHasUnlock(tower, "stack:wave")) tower.shopWaveStacks += 1;
      for (const definition of this.getTowerEngine(tower)?.stacks ?? []) {
        this.resetEngineStack(tower.stackStates, definition, "waveEnd");
      }
      this.applyTowerStacksForTrigger(tower, "wave", now);
    }

    for (const tower of this.towers.values()) {
      if (tower.definition.id === "warrior-2") {
        tower.linkedTowerIds = tower.linkedTowerIds.filter((towerId) => this.towers.has(towerId));
        for (const linkedTowerId of tower.linkedTowerIds) {
          tower.linkedTowerWaveAges[linkedTowerId] = (tower.linkedTowerWaveAges[linkedTowerId] ?? 0) + 1;
        }
      }
    }

  }

  private prepareTowerShot(tower: TowerModel, target: EnemyModel) {
    this.prepareOnurGamblerShot(tower);
    this.updateGrantedSameTargetStacks(tower, target);
    if (tower.definition.id === "archer-1" || tower.definition.id === "archer-2") {
      tower.focusTargetId = target.id;
      return;
    }

    if (tower.definition.id !== "warrior-4") {
      return;
    }

    const definition = tower.definition.engine?.stacks?.find((stack) => stack.id === "obsession");
    if (tower.focusTargetId === target.id) {
      const state = definition
        ? this.applyEngineStack(tower.stackStates, definition, { trigger: "sameTarget", now: Date.now(), targetId: target.id })
        : undefined;
      tower.focusStacks = state?.count ?? Math.min(10, tower.focusStacks + 1);
    } else {
      tower.focusTargetId = target.id;
      tower.focusStacks = 0;
      if (definition) {
        this.resetEngineStack(tower.stackStates, definition, "targetChange");
      }
    }
  }

  private applyPostHitEffects(projectile: ProjectileModel, target: EnemyModel) {
    const tower = this.towers.get(projectile.towerId);
    if (!tower) {
      return;
    }
    this.applyGrantedStacks(tower, "hit", Date.now(), target.id);

    if (!this.enemies.has(target.id)) {
      this.runTowerTriggers(tower, "kill", { target });
      if (tower.definition.id === "archer-1" || tower.definition.id === "archer-2") {
        tower.focusTargetId = "";
        return;
      }
    }
    this.consumeConfiguredMarks(tower, target, this.enemies.has(target.id) ? "hit" : "kill");

    if (tower.definition.id === "warrior-4") {
      if (tower.focusTargetId === target.id && tower.focusStacks >= 2 && this.enemies.has(target.id)) {
        if (tower.level >= 3) {
          const duration = applyStatusResistance(getObsessionFearDurationMs(tower.level), target.statusResistances.fear);
          target.fearUntil = Math.max(target.fearUntil, Date.now() + scaleGameDuration(duration));
        }
      }
      return;
    }

    if (tower.definition.id !== "warrior-6") {
      return;
    }

    if (hasUcubePerk(tower, "chain")) {
      const chainedEnemies = Array.from(this.enemies.values())
        .filter((enemy) => {
          this.perfCounters.chainChecks += 1;
          return enemy.id !== target.id && enemy.pathDistance < target.pathDistance;
        })
        .sort((a, b) => b.pathDistance - a.pathDistance)
        .slice(0, 2);
      for (const enemy of chainedEnemies) {
        this.setUcubeChainBeam(projectile, target, enemy);
        this.damageEnemy(enemy, this.getProjectileDamage(projectile, getUcubeChainDamageMultiplier(tower)), 0, projectile.definitionId, tower.ownerId, projectile.damageType, projectile.maxHealthDamageRatio, tower.level, tower.id, projectile.hitType);
      }
    }

    if (hasUcubePerk(tower, "pushback") && this.enemies.has(target.id)) {
      target.pathDistance = Math.max(0, target.pathDistance - this.scaleWorldDistance(18));
    }
  }

  private consumeConfiguredMarks(tower: TowerModel, target: EnemyModel, event: "hit" | "kill") {
    for (const rawRule of tower.definition.engine?.consumesMarks ?? []) {
      const rule = typeof rawRule === "string" ? { id: rawRule, event: "hit" as const, consumeStacks: 1 } : rawRule;
      if ((rule.event ?? "hit") !== event || target.activeMarkId !== rule.id || target.activeMarkUntil <= Date.now()) continue;
      if (rule.id === "tracking") {
        let remainingToConsume = Math.max(1, rule.consumeStacks ?? 1);
        const activeIndexes = target.trackingStackUntil
          .map((until, index) => ({ until, index }))
          .filter((entry) => entry.until > Date.now())
          .sort((left, right) => left.until - right.until);
        for (const entry of activeIndexes) {
          if (remainingToConsume <= 0) break;
          target.trackingStackUntil[entry.index] = 0;
          remainingToConsume -= 1;
        }
        const remaining = target.trackingStackUntil.filter((until) => until > Date.now());
        target.activeMarkAdd = remaining.length * 0.2;
        target.activeMarkUntil = remaining.length > 0 ? Math.max(...remaining) : 0;
        if (remaining.length === 0) target.activeMarkId = "";
      } else {
        target.activeMarkId = "";
        target.activeMarkAdd = 0;
        target.activeMarkUntil = 0;
      }
    }
  }

  private prepareOnurGamblerShot(tower: TowerModel) {
    if (tower.characterId !== "onur" || tower.definition.damage <= 0 || tower.definition.resourceProvider) {
      tower.lastLuckMultiplier = 1;
      return;
    }
    const result = resolveOnurGamblerShot(
      { misfortune: tower.misfortune, luckyWindowUntil: tower.luckyWindowUntil },
      this.getTowerFireInterval(tower),
      this.towerDamageRandom,
      Date.now()
    );
    tower.misfortune = result.misfortune;
    tower.luckyWindowUntil = result.luckyWindowUntil;
    tower.lastLuckMultiplier = result.multiplier;
  }

  private getSkillCooldown(player: Player, slot: number) {
    return slot === 0 ? player.skill1CooldownMs : slot === 1 ? player.skill2CooldownMs : player.skill3CooldownMs;
  }

  private setSkillCooldown(player: Player, slot: number, cooldownMs: number) {
    if (slot === 0) {
      player.skill1CooldownMs = cooldownMs;
    } else if (slot === 1) {
      player.skill2CooldownMs = cooldownMs;
    } else {
      player.skill3CooldownMs = cooldownMs;
    }
  }

  private distanceToPath(x: number, y: number) {
    return Math.min(...pathSegments.map((segment) => distanceToSegment(x, y, segment.from.x, segment.from.y, segment.to.x, segment.to.y)));
  }

  private getCharacterId(value: unknown): CharacterId {
    if (value === "zeynep" || value === "archer" || value === "mage" || value === "healer" || value === "tank" || value === "onur" || value === "warrior") {
      return value;
    }

    return "warrior";
  }

  private getAvailableCharacterId(requestedCharacterId: unknown) {
    const requested = this.getCharacterId(requestedCharacterId);
    const taken = new Set(Array.from(this.state.players.values()).map((player) => player.characterId));
    if (!taken.has(requested)) {
      return requested;
    }

    return characters.find((character) => !taken.has(character.id))?.id ?? requested;
  }

  private getRoomName(value: unknown) {
    const roomName = typeof value === "string" ? value.trim().slice(0, 24) : "";
    return roomName || "Yeni Oda";
  }

  private getMapScaleChoice(value: unknown): MapScale {
    return getMapScale(typeof value === "number" ? value : DEFAULT_MAP_SCALE);
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private createPerfCounters(): ServerPerfCounters {
    return {
      targetSearches: 0,
      targetChecks: 0,
      aoeChecks: 0,
      chainChecks: 0,
      damageEvents: 0
    };
  }

  private recordPerfFrame(frame: ServerPerfFrame) {
    this.perfFrames.push(frame);
    this.perfFrames = this.perfFrames.slice(-60);

    const sampleCount = Math.max(1, this.perfFrames.length);
    const average = (key: keyof ServerPerfFrame) => this.perfFrames.reduce((total, sample) => total + sample[key], 0) / sampleCount;
    const averageSentSnapshot = (key: "snapshotMs" | "snapshotBytes") => {
      const sentFrames = this.perfFrames.filter((sample) => sample.snapshotBytes > 0);
      const count = Math.max(1, sentFrames.length);
      return sentFrames.reduce((total, sample) => total + sample[key], 0) / count;
    };
    const maxTickMs = this.perfFrames.reduce((max, sample) => Math.max(max, sample.tickMs), 0);

    this.latestPerfSnapshot = {
      tickMs: roundMetric(average("tickMs")),
      tickMaxMs: roundMetric(maxTickMs),
      snapshotBytes: Math.round(averageSentSnapshot("snapshotBytes")),
      snapshotHz: roundMetric(this.getSnapshotBroadcastHz()),
      sections: {
        spawnMs: roundMetric(average("spawnMs")),
        towersMs: roundMetric(average("towersMs")),
        projectilesMs: roundMetric(average("projectilesMs")),
        enemiesMs: roundMetric(average("enemiesMs")),
        cooldownsMs: roundMetric(average("cooldownsMs")),
        ultimatesMs: roundMetric(average("ultimatesMs")),
        snapshotMs: roundMetric(averageSentSnapshot("snapshotMs"))
      },
      ops: {
        targetSearches: Math.round(average("targetSearches")),
        targetChecks: Math.round(average("targetChecks")),
        aoeChecks: Math.round(average("aoeChecks")),
        chainChecks: Math.round(average("chainChecks")),
        damageEvents: Math.round(average("damageEvents"))
      }
    };
  }

  private recordSnapshotBroadcast(now: number) {
    const keepAfter = now - 1000;
    this.snapshotBroadcastTimes.push(now);
    this.snapshotBroadcastTimes = this.snapshotBroadcastTimes.filter((time) => time >= keepAfter);
  }

  private getSnapshotBroadcastHz() {
    if (this.snapshotBroadcastTimes.length < 2) {
      return this.snapshotBroadcastTimes.length;
    }

    const elapsedMs = Math.max(1, this.snapshotBroadcastTimes[this.snapshotBroadcastTimes.length - 1] - this.snapshotBroadcastTimes[0]);
    return ((this.snapshotBroadcastTimes.length - 1) / elapsedMs) * 1000;
  }
}

function getPointAlongPath(distance: number) {
  let remaining = distance;

  for (const segment of pathSegments) {
    if (remaining <= segment.length) {
      const ratio = remaining / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio
      };
    }

    remaining -= segment.length;
  }

  const end = MAP_PATH[MAP_PATH.length - 1];
  return { x: end.x, y: end.y };
}

function buildRuntimePaths(map: EditableMapData): RuntimePath[] {
  const spawns = getMapPoints(map, "spawn");
  const paths = spawns
    .map((spawn) => pathToWorldPoints(findPathToNearestNexus(map, spawn), map))
    .filter((points) => points.length >= 2)
    .map((points) => {
      const segments = points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        return {
          from: point,
          to: next,
          length: Math.hypot(next.x - point.x, next.y - point.y)
        };
      });

      return {
        points,
        segments,
        totalLength: segments.reduce((total, segment) => total + segment.length, 0)
      };
    });

  if (paths.length > 0) {
    return paths;
  }

  const fallbackMap = createDefaultEditableMap(getMapScale(map));
  const fallbackPoints = pathToWorldPoints(findPathToNearestNexus(fallbackMap, getMapPoints(fallbackMap, "spawn")[0]), fallbackMap);
  const fallbackSegments = fallbackPoints.slice(0, -1).map((point, index) => {
    const next = fallbackPoints[index + 1];
    return {
      from: point,
      to: next,
      length: Math.hypot(next.x - point.x, next.y - point.y)
    };
  });
  return [{
    points: fallbackPoints,
    segments: fallbackSegments,
    totalLength: fallbackSegments.reduce((total, segment) => total + segment.length, 0)
  }];
}

function getPointAlongRuntimePath(path: RuntimePath | undefined, distance: number) {
  if (!path) {
    return getPointAlongPath(distance);
  }

  let remaining = distance;
  for (const segment of path.segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length <= 0 ? 0 : remaining / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio
      };
    }
    remaining -= segment.length;
  }

  return path.points[path.points.length - 1] ?? getPointAlongPath(distance);
}

function getAirSpawnPoint(path: RuntimePath | undefined, map: EditableMapData = createDefaultEditableMap()) {
  const bounds = getMapWorldBounds(map);
  const nexus = path?.points[path.points.length - 1] ?? { x: bounds.left + bounds.width / 2, y: bounds.bottom - getMapGridSize(map) / 2 };
  const metrics = getMapMetrics(map);
  const corners = [
    gridToWorld(0, 0, map),
    gridToWorld(metrics.cols - 1, 0, map),
    gridToWorld(0, metrics.rows - 1, map),
    gridToWorld(metrics.cols - 1, metrics.rows - 1, map)
  ];

  return corners.sort((a, b) => distanceSq(b.x, b.y, nexus.x, nexus.y) - distanceSq(a.x, a.y, nexus.x, nexus.y))[0] ?? gridToWorld(0, 0, map);
}

function getClosestPathDistance(path: RuntimePath | undefined, x: number, y: number) {
  if (!path || path.segments.length === 0) {
    return 0;
  }

  let traversed = 0;
  let bestDistance = 0;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (const segment of path.segments) {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const lengthSq = Math.max(1, dx * dx + dy * dy);
    const t = Math.max(0, Math.min(1, ((x - segment.from.x) * dx + (y - segment.from.y) * dy) / lengthSq));
    const closestX = segment.from.x + dx * t;
    const closestY = segment.from.y + dy * t;
    const candidateDistanceSq = distanceSq(x, y, closestX, closestY);

    if (candidateDistanceSq < bestDistanceSq) {
      bestDistanceSq = candidateDistanceSq;
      bestDistance = traversed + segment.length * t;
    }

    traversed += segment.length;
  }

  return bestDistance;
}

function shouldSpawnFlyingEnemy(wave: number, waveSpawned: number) {
  return isPureFlyingWave(wave) || (isMixedFlyingWave(wave) && waveSpawned % 2 === 0);
}

function isPureFlyingWave(wave: number) {
  return wave === 5 || wave === 10;
}

function isMixedFlyingWave(wave: number) {
  return wave === 15 || wave === 20;
}

function getCharacterCardAxes(characterId: CharacterId): import("@karayel/shared").TowerAxis[] {
  if (characterId === "warrior") return ["dps", "amplify"];
  if (characterId === "archer") return ["cc", "dps"];
  if (characterId === "zeynep") return ["amplify", "dps"];
  return ["dps"];
}

function getObsessionFearDurationMs(level: number) {
  if (level >= 10) {
    return 6000;
  }
  if (level >= 7) {
    return 4500;
  }
  if (level >= 5) {
    return 3000;
  }

  return 1500;
}

function hasUcubePerk(tower: TowerModel, perkId: UcubePerkId) {
  return tower.definition.id === "warrior-6" && tower.ucubePerks.includes(perkId);
}

function getUcubeStackIntervalMultiplier(stacks: number) {
  return 1 - stacks * UCUBE_STACK_INTERVAL_REDUCTION;
}

function getServerLinkImpactDamageBonus(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 0.1 + clampedLevel * 0.02;
}

function getServerLinkBurstDamage(level: number) {
  const damageByLevel = [160, 240, 330, 420, 500, 1000, 1500, 2000, 3000, 4000];
  return damageByLevel[Math.min(Math.max(level, 1), 10) - 1] ?? 160;
}

function getServerLinkBurstRadius(level: number) {
  return (24 + Math.min(Math.max(level, 1), 10) * 5) / 4;
}

function getServerLinkMaxHealthDamageRatio(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 0.001 + ((clampedLevel - 1) / 9) * 0.004;
}

function getZeynepCommandType(slot: number): ZeynepCommandType {
  if (slot === 0) {
    return "haste";
  }
  if (slot === 1) {
    return "range";
  }
  return "slow";
}

function getRequestedZeynepCommandTier(tier: unknown): ZeynepCommandTier {
  if (tier === "medium" || tier === "big") {
    return tier;
  }
  return "small";
}

function getZeynepCommandCost(tier: ZeynepCommandTier) {
  if (tier === "big") {
    return ZEYNEP_BIG_COMMAND_COST;
  }
  if (tier === "medium") {
    return ZEYNEP_MEDIUM_COMMAND_COST;
  }
  return ZEYNEP_SMALL_COMMAND_COST;
}

function getZeynepCommandProfile(commandType: ZeynepCommandType, tier: ZeynepCommandTier, chained: boolean, authorityQuality: number) {
  const quality = chained ? Math.min(Math.max(authorityQuality, 0), ZEYNEP_MAX_AUTHORITY_QUALITY) : 0;
  const powerMultiplier = 1 + quality * ZEYNEP_QUALITY_POWER_STEP;
  const durationMultiplier = 1 + quality * ZEYNEP_QUALITY_DURATION_STEP;

  const scaleProfile = (durationMs: number, multiplier: number) => {
    const scaledDurationMs = Math.round(durationMs * durationMultiplier);
    if (commandType === "slow") {
      const potency = 1 - multiplier;
      return { durationMs: scaledDurationMs, multiplier: Math.max(0.4, 1 - potency * powerMultiplier) };
    }

    return { durationMs: scaledDurationMs, multiplier: 1 + (multiplier - 1) * powerMultiplier };
  };

  if (commandType === "slow") {
    if (tier === "big") {
      return scaleProfile(chained ? 7000 : 6000, chained ? 0.52 : 0.62);
    }
    if (tier === "medium") {
      return scaleProfile(chained ? 4500 : 4000, chained ? 0.72 : 0.78);
    }
    return scaleProfile(chained ? 2500 : 2000, chained ? 0.84 : 0.88);
  }

  if (tier === "big") {
    return scaleProfile(8000, chained ? 1.45 : 1.32);
  }
  if (tier === "medium") {
    return scaleProfile(6000, chained ? 1.24 : 1.18);
  }
  return scaleProfile(3000, chained ? 1.12 : 1.08);
}

function getZeynepBaseRange(definition: TowerDefinition) {
  if (definition.id === "zeynep-2") {
    return ZEYNEP_SHOWCASE_BASE_LENGTH;
  }

  return definition.range;
}

function getUcubeLateDamageMultiplier(level: number) {
  if (level >= 10) return 1.3;
  if (level >= 9) return 1.4;
  if (level >= 8) return 1.5;
  if (level >= 7) return 1.6;
  return 1;
}

function getUcubeChainDamageMultiplier(tower: TowerModel) {
  if (!hasUcubePerk(tower, "chain")) return 0;
  if (tower.level >= 10) return 1;
  if (tower.level >= 9) return 0.93;
  if (tower.level >= 8) return 0.85;
  if (tower.level >= 7) return 0.72;
  if (tower.level >= 6) return 0.5;
  if (tower.level >= 5) return 0.48;
  if (tower.level >= 4) return 0.46;
  return 0.42;
}

function getAbartiShowcaseRangeMultiplier(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 1.1 + ((clampedLevel - 1) / 9) * 0.9;
}

function getAbartiArmorBreak(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return Math.round(10 + ((clampedLevel - 1) / 9) * 20);
}

function isAbartiArmorBreakProjectile(definitionId: string) {
  return definitionId === "zeynep-1" ||
    definitionId === "zeynep-3" ||
    definitionId === "zeynep-3-kin-projectile";
}

function getAbartiRayDamageGrowth(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 0.01 + ((clampedLevel - 1) / 9) * 0.04;
}

function getEnemyHealthRatio(enemy: EnemyModel) {
  return (Math.max(0, enemy.hp) + Math.max(0, enemy.shield)) / Math.max(1, enemy.maxHp + enemy.maxShield);
}

function getMelisApprovalGain(tier: KillStreakTier) {
  if (tier === "legendary") return 4;
  if (tier === "rampage") return 3;
  if (tier === "unstoppable") return 2;
  return 1;
}

/** Karakterden bagimsiz; imza cagri yerlerini bozmamak icin duruyor. */
export function getPlayerStartGold(_characterId: CharacterId) {
  return PLAYER_START_GOLD;
}

export function getClientBufferedAmount(client: Pick<Client, "ref">) {
  const transport = client.ref as typeof client.ref & {
    bufferedAmount?: number;
    _socket?: { bufferedAmount?: number };
  };
  const amount = transport.bufferedAmount ?? transport._socket?.bufferedAmount ?? 0;
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function roundNetworkNumber(value: number) {
  return Math.round(value * 10) / 10;
}

function getTowerPlacementOrientation(definitionId?: string, orientation?: TowerOrientation): TowerOrientation {
  if (definitionId !== "zeynep-8") {
    return "horizontal";
  }

  return orientation === "vertical" ? "vertical" : "horizontal";
}

function areZeynepFormationNeighbors(towerA: TowerModel, towerB: TowerModel, gridSize: number) {
  const dx = Math.abs(towerA.x - towerB.x);
  const dy = Math.abs(towerA.y - towerB.y);
  return dx <= gridSize + 2 && dy <= gridSize + 2 && dx + dy > 2;
}

function isCompleteZeynepFormation(group: TowerModel[], gridSize: number) {
  for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
      if (!areZeynepFormationNeighbors(group[firstIndex], group[secondIndex], gridSize)) {
        return false;
      }
    }
  }
  return true;
}

/**
   * Yapi dizilime katilir mi.
   *
   * Duvar kule degil: kontenjandan yer kapmaz, hedef secmez, hasar vermez.
   * Dizilime katilmasi yalnizca anlamsiz degil, zararli -- ucluye komsu bir
   * duvar grubu dorde cikarip bonusu tumden dusuruyordu. Kural uc yerde birden
   * geciyor, o yuzden tek yerde yaziliyor.
   */
function canJoinZeynepFormation(tower: TowerModel) {
  // Abarti icin ayrica ad yazmaya gerek yok: kenara oturdugu icin kule
  // kontenjanindan da yer kapmiyor, ikisi ayni kuralin sonucu.
  return occupiesTowerSlot(tower.definition) && tower.definition.id !== "zeynep-7";
}

function isValidZeynepFormationGroup(group: TowerModel[], gridSize: number) {
  if (!group.every((member) => member.characterId === "zeynep" && canJoinZeynepFormation(member))) {
    return false;
  }

  return group.length === 2 || (group.length === 3 && isCompleteZeynepFormation(group, gridSize));
}

function getZeynepFormationLevelRatio(tower: TowerModel) {
  if (tower.zeynepFormationLevel <= 0) {
    return 0;
  }

  return Math.min(Math.max(tower.zeynepFormationLevel, 1), 10) / 10;
}

function getZeynepFormationDamageMultiplier(tower: TowerModel) {
  const levelRatio = getZeynepFormationLevelRatio(tower);
  if (tower.zeynepFormationSize === 3) {
    return 1 + (ZEYNEP_FORMATION_TRIO_DAMAGE_MULTIPLIER - 1) * levelRatio;
  }
  if (tower.zeynepFormationSize === 2) {
    return 1 + (ZEYNEP_FORMATION_PAIR_DAMAGE_MULTIPLIER - 1) * levelRatio;
  }
  return 1;
}

function getZeynepFormationFireIntervalMultiplier(tower: TowerModel) {
  const levelRatio = getZeynepFormationLevelRatio(tower);
  if (tower.zeynepFormationSize === 3) {
    return 1 - (1 - ZEYNEP_FORMATION_TRIO_FIRE_INTERVAL_MULTIPLIER) * levelRatio;
  }
  if (tower.zeynepFormationSize === 2) {
    return 1 - (1 - ZEYNEP_FORMATION_PAIR_FIRE_INTERVAL_MULTIPLIER) * levelRatio;
  }
  return 1;
}

function getMelisBrokenMirrorReleaseMultiplier(level: number) {
  const levelRatio = Math.max(0, Math.min(1, (level - 1) / 9));
  return MELIS_BROKEN_MIRROR_RELEASE_MIN_MULTIPLIER + (MELIS_BROKEN_MIRROR_RELEASE_MAX_MULTIPLIER - MELIS_BROKEN_MIRROR_RELEASE_MIN_MULTIPLIER) * levelRatio;
}

function scaleGameDuration(durationMs: number) {
  return durationMs / GAME_SPEED_MULTIPLIER;
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getSignedShortestAngleDelta(angleA: number, angleB: number) {
  return Math.atan2(Math.sin(angleB - angleA), Math.cos(angleB - angleA));
}

/**
 * Zincir boyunca donen kirisin su anki acisi.
 *
 * Aci listesi ugrak sirasi: birinciye nisan alinir, oradan ikinciye, ikinciden
 * ucuncuye donulur. Donus acisal hizla sinirli oldugu icin iki saniyede zincirin
 * ancak bir kismi kat edilebilir; kalan sure bittiginde kiris nerede kaldiysa
 * orada durur.
 *
 * Liste bossa -- supurme sirasinda butun dusmanlar oldu ya da baslarken hic yoktu
 * -- kule kendi nisan acisini korur. Bir seye nisan almak, hicbir seye nisan
 * almaktan daha iyi.
 */
function getDebugLaserChainSweepAngle(angles: readonly number[], elapsedSeconds: number, fallbackAngle: number) {
  if (angles.length === 0) {
    return fallbackAngle;
  }

  let remainingAngle = DEBUG_LASER_MAX_SWEEP_RADIANS_PER_SECOND * Math.max(0, elapsedSeconds);
  let currentAngle = angles[0];

  for (let index = 1; index < angles.length; index += 1) {
    const angleDelta = getSignedShortestAngleDelta(currentAngle, angles[index]);
    const angleStep = Math.abs(angleDelta);

    if (remainingAngle <= angleStep) {
      return currentAngle + Math.sign(angleDelta) * remainingAngle;
    }

    remainingAngle -= angleStep;
    currentAngle += angleDelta;
  }

  return currentAngle;
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function getSegmentProjection(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) {
    return 0;
  }

  return ((px - ax) * dx + (py - ay) * dy) / lengthSq;
}

function getProjectionOnAngle(px: number, py: number, originX: number, originY: number, angle: number) {
  const dx = px - originX;
  const dy = py - originY;
  return dx * Math.cos(angle) + dy * Math.sin(angle);
}

function getPerpendicularDistanceOnAngle(px: number, py: number, originX: number, originY: number, angle: number) {
  const dx = px - originX;
  const dy = py - originY;
  return dx * -Math.sin(angle) + dy * Math.cos(angle);
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: { left: number; right: number; top: number; bottom: number }
) {
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) {
    return true;
  }

  return segmentsIntersect(x1, y1, x2, y2, rect.left, rect.top, rect.right, rect.top) ||
    segmentsIntersect(x1, y1, x2, y2, rect.right, rect.top, rect.right, rect.bottom) ||
    segmentsIntersect(x1, y1, x2, y2, rect.right, rect.bottom, rect.left, rect.bottom) ||
    segmentsIntersect(x1, y1, x2, y2, rect.left, rect.bottom, rect.left, rect.top);
}

function pointInRect(x: number, y: number, rect: { left: number; right: number; top: number; bottom: number }) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = orientation(ax, ay, bx, by, cx, cy);
  const d2 = orientation(ax, ay, bx, by, dx, dy);
  const d3 = orientation(cx, cy, dx, dy, ax, ay);
  const d4 = orientation(cx, cy, dx, dy, bx, by);

  if (d1 === 0 && pointOnSegment(cx, cy, ax, ay, bx, by)) return true;
  if (d2 === 0 && pointOnSegment(dx, dy, ax, ay, bx, by)) return true;
  if (d3 === 0 && pointOnSegment(ax, ay, cx, cy, dx, dy)) return true;
  if (d4 === 0 && pointOnSegment(bx, by, cx, cy, dx, dy)) return true;

  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  return Math.abs(value) < 0.000001 ? 0 : value > 0 ? 1 : -1;
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  return px >= Math.min(ax, bx) - 0.000001 &&
    px <= Math.max(ax, bx) + 0.000001 &&
    py >= Math.min(ay, by) - 0.000001 &&
    py <= Math.max(ay, by) + 0.000001;
}

function didProjectileHitTarget(projectile: ProjectileModel, target: EnemyModel, previousX: number, previousY: number) {
  const hitRadius = getEnemyCollisionRadius(target);
  const segmentDistanceSq = distanceToSegmentSq(target.x, target.y, previousX, previousY, projectile.x, projectile.y);
  if (segmentDistanceSq <= hitRadius * hitRadius) {
    return true;
  }

  const previousDistanceSq = distanceSq(previousX, previousY, target.x, target.y);
  const currentDistanceSq = distanceSq(projectile.x, projectile.y, target.x, target.y);
  const traveledSq = distanceSq(previousX, previousY, projectile.x, projectile.y);

  return currentDistanceSq > previousDistanceSq && previousDistanceSq <= traveledSq + hitRadius * hitRadius;
}

function getEnemyRaceForWave(wave: number): EnemyRace {
  return ENEMY_RACE_WAVE_ORDER[Math.max(0, wave - 1) % ENEMY_RACE_WAVE_ORDER.length];
}

function getEnemyCollisionRadius(enemy: EnemyModel) {
  return enemy.type === "brute" ? 19 : enemy.type === "runner" ? 13 : 15;
}

function didDebugLaserSweepHitEnemy(
  tower: TowerModel,
  enemy: EnemyModel,
  previousAngle: number,
  currentAngle: number,
  endX: number,
  endY: number,
  beamRadius: number
) {
  const hitRadius = beamRadius + getEnemyCollisionRadius(enemy);
  if (distanceToSegmentSq(enemy.x, enemy.y, tower.x, tower.y, endX, endY) <= hitRadius * hitRadius) {
    return true;
  }

  const dx = enemy.x - tower.x;
  const dy = enemy.y - tower.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 1) {
    return true;
  }

  const sweptAngle = getSignedShortestAngleDelta(previousAngle, currentAngle);
  if (Math.abs(sweptAngle) <= 0.0001) {
    return false;
  }

  const enemyAngle = Math.atan2(dy, dx);
  const enemyFromPrevious = getSignedShortestAngleDelta(previousAngle, enemyAngle);
  const angleTolerance = Math.min(0.42, Math.asin(Math.min(0.98, hitRadius / distance)));

  if (sweptAngle > 0) {
    return enemyFromPrevious >= -angleTolerance && enemyFromPrevious <= sweptAngle + angleTolerance;
  }

  return enemyFromPrevious <= angleTolerance && enemyFromPrevious >= sweptAngle - angleTolerance;
}

type WorldBounds = ReturnType<typeof getMapWorldBounds>;

function getRayAngleToWorldEdge(x1: number, y1: number, angle: number, bounds: WorldBounds) {
  return getRayDirectionToWorldEdge(x1, y1, Math.cos(angle), Math.sin(angle), bounds);
}

function getMirrorBeamSegments(x1: number, y1: number, targetX: number, targetY: number, bounces: number, bounds: WorldBounds) {
  const dx = targetX - x1;
  const dy = targetY - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  let nx = dx / length;
  let ny = dy / length;
  let startX = x1;
  let startY = y1;
  const segments: RaySegment[] = [];
  const segmentCount = Math.max(1, Math.min(12, Math.round(bounces) + 1));

  for (let index = 0; index < segmentCount; index += 1) {
    const hit = getRayBoundaryHit(startX, startY, nx, ny, bounds);
    segments.push(makeRaySegment(startX, startY, hit.x, hit.y));
    nx = hit.axis === "x" ? -nx : nx;
    ny = hit.axis === "y" ? -ny : ny;
    startX = hit.x + nx * 0.01;
    startY = hit.y + ny * 0.01;
  }

  return segments;
}

function makeRaySegment(x1: number, y1: number, x2: number, y2: number): RaySegment {
  return {
    x1,
    y1,
    x2,
    y2,
    length: Math.hypot(x2 - x1, y2 - y1)
  };
}

function getRayAbsoluteDistance(segments: RaySegment[], segmentIndex: number, distanceOnSegment: number) {
  let distance = distanceOnSegment;
  for (let index = 0; index < segmentIndex; index += 1) {
    distance += segments[index]?.length ?? 0;
  }
  return distance;
}

function getPointOnRaySegments(segments: RaySegment[], distance: number) {
  let remaining = Math.max(0, distance);
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length <= 0 ? 1 : remaining / segment.length;
      return {
        x: segment.x1 + (segment.x2 - segment.x1) * ratio,
        y: segment.y1 + (segment.y2 - segment.y1) * ratio
      };
    }
    remaining -= segment.length;
  }

  const last = segments[segments.length - 1];
  return last ? { x: last.x2, y: last.y2 } : { x: 0, y: 0 };
}

function getRayBoundaryHit(x1: number, y1: number, nx: number, ny: number, bounds: WorldBounds) {
  const candidates: Array<{ t: number; axis: "x" | "y" }> = [];

  if (nx > 0) {
    candidates.push({ t: (bounds.right - x1) / nx, axis: "x" });
  } else if (nx < 0) {
    candidates.push({ t: (bounds.left - x1) / nx, axis: "x" });
  }

  if (ny > 0) {
    candidates.push({ t: (bounds.bottom - y1) / ny, axis: "y" });
  } else if (ny < 0) {
    candidates.push({ t: (bounds.top - y1) / ny, axis: "y" });
  }

  const hit = candidates
    .filter((candidate) => candidate.t > 0.0001)
    .sort((a, b) => a.t - b.t)[0] ?? { t: 1, axis: "x" as const };

  return {
    x: Math.min(bounds.right, Math.max(bounds.left, x1 + nx * hit.t)),
    y: Math.min(bounds.bottom, Math.max(bounds.top, y1 + ny * hit.t)),
    axis: hit.axis
  };
}

function getPointOnRay(x1: number, y1: number, angle: number, distance: number) {
  return {
    x: x1 + Math.cos(angle) * distance,
    y: y1 + Math.sin(angle) * distance
  };
}

function getRayDirectionToWorldEdge(x1: number, y1: number, nx: number, ny: number, bounds: WorldBounds) {
  const candidates: number[] = [];

  if (nx > 0) {
    candidates.push((bounds.right - x1) / nx);
  } else if (nx < 0) {
    candidates.push((bounds.left - x1) / nx);
  }

  if (ny > 0) {
    candidates.push((bounds.bottom - y1) / ny);
  } else if (ny < 0) {
    candidates.push((bounds.top - y1) / ny);
  }

  const distance = Math.max(1, Math.min(...candidates.filter((candidate) => candidate > 0)));
  return {
    x: x1 + nx * distance,
    y: y1 + ny * distance
  };
}

function distanceToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const x = ax + t * dx;
  const y = ay + t * dy;

  return distanceSq(px, py, x, y);
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

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}
