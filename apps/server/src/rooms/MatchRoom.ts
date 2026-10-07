import { Client, Protocol, Room, ServerError, getMessageBytes, type AuthContext } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import { createHash, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { FixedWindowRateLimiter, ipRateKey, readClientIp } from "../rate-limit.js";
import { activityLabels, createDefenseRow, deliveryScore, type DefenseRow, type DefenseSummary, type LogisticsPriority, type TowerActivity } from "@karayel/shared";
import { RunLedger, createRunId, getRunMapKey, type MatchResultPayload } from "@karayel/shared";
// Istemciye giden sabit metinler: Turkcesi buradan, yaninda anahtari (`key`).
import { PREVIEW_EQUIP_REJECTED_KEY, SERVER_TEXT, type ServerTextKey } from "@karayel/shared";
import { ATAKAN_EXECUTE_SLOT, ATAKAN_EXECUTE_SOURCE_ID, isExecuteImmune, type ExecuteRejectReason, type SkillExecuteMessage, type SkillRejectedMessage } from "@karayel/shared";
// Kule paneli: secili kulenin savasta okunan sayilari (`sendTowerStats`).
import { closeTowerStatValue, getTowerBaseLevelFireIntervalMs, getTowerBaseLevelRange, groupTowerStatSources, roundTowerStat, towerFiresProjectiles, type TowerEffectWire, type TowerStatSource, type TowerStatsWire } from "@karayel/shared";
// Zeynep atislarinin geometrisi paylasilan pakette: istemcinin imzalari ayni kurali cagiriyor.
import { KIN_WAVE_BAND_DEPTH, getAbartiRailRect, getAbartiShowcaseRangeMultiplier, getEnemyTypeCollisionRadius, isAbartiArmorBreakProjectile } from "@karayel/shared";
import {
  ComboStampThrottle,
  DEBUG_SWEEP_STAMP_MIN_KILLS,
  getAtakanIsolationShare,
  getZeynepFormationShare,
  type ComboStampKind,
  type ComboStampMessage
} from "@karayel/shared";
import {
  characters,
  DAMAGE_EVENT_NO_OWNER,
  DEFAULT_MAP_SCALE,
  getDamageSizeBucket,
  ONUR_JACKPOT_MIN_LUCK,
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
  ZEYNEP_SYNTHESIS_BURN_TICK_MS,
  MELIS_CURSE_POOL_TICK_MS,
  getDebugLaserDamageMultiplier,
  getDebugLaserFireInterval,
  getDebugLaserTwinBeamIds,
  DEBUG_LASER_OVERDRIVE_UNLOCK_LEVEL,
  DEBUG_LASER_TWIN_OVERDRIVE_LEVEL,
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
  countsAsTower,
  isOperationalTower,
  isRepairDepotDefinition,
  occupiesTowerSlot,
  isEdgeSegmentInsideBoard,
  ATAKAN_ISOLATION_MULTIPLIER,
  collectZeynepSynthesisGroup,
  findIsolationBlockers,
  getZeynepFormationDamageMultiplier,
  getZeynepFormationFireIntervalMultiplier,
  isStructureIsolated,
  isValidZeynepFormationGroup,
  receivesAtakanIsolationBonus,
  resolveZeynepFormations,
  SIEGE_STRUCTURE_DAMAGE_MULTIPLIER,
  getStructureRepairCostWithModifiers,
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
  TOWER_HEAT_BRAKE_TEMPERATURE,
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
  getUltimateVisualTier,
  getUltimatePowerUpgradeCost,
  getBestUltimateColumnHits,
  type TowerTier,
  getUltimateResultKind,
  type UltimateCastMessage,
  SERVER_LINK_NOTICE_COOLDOWN_MS,
  getServerLinkMaturity,
  type ServerLinkJoinedMessage,
  type RiskyInvestmentMessage,
  type ShopItemLoadout,
  type ServerLinkMaturedMessage,
  type UltimateResultKind,
  type UltimateResultMessage,
  ZEYNEP_COLUMN_ULTIMATE_SLOW_MS,
  type HirableWorkerRole,
  type HiredWorker,
  type WorkerSkillId,
  ADVANCED_WORKER_MULTIPLIER,
  HIRABLE_WORKER_ROLES,
  WORKER_MAX_HP,
  WORKER_REPAIR_PER_SECOND,
  WORKER_RESPAWN_MS,
  getWorkerHireCostWithModifiers,
  isHirableWorkerRole,
  LOGISTICS_WORKER_CAPACITY,
  ENERGY_LOGISTICS_WORKER_CAPACITY,
  AMMO_LOGISTICS_WORKER_CAPACITY,
  AMMO_COLLECTOR_WORKER_CAPACITY,
  RESOURCE_PROVIDER_INITIAL_STOCK,
  AMMO_FACTORY_INITIAL_ENERGY,
  WORKER_SPECIALIZATION_CHOICES,
  WORKER_DEVELOPMENT_XP_COSTS,
  WORKER_DEVELOPMENT_CELLS,
  LOAD_SHEDDER_CRISIS_ENERGY_RATIO,
  LOAD_SHEDDER_DURATION_MS,
  FREQUENCY_SHARE_ENERGY_RATIO,
  FREQUENCY_SHARE_DURATION_MS,
  getWorkerSkillTiers,
  isWorkerSkillForRole,
  isWorkerSkillId,
  resolveWorkerDevelopmentEffect,
  WORKER_FULL_TANK_ENERGY_RATIO,
  type WorkerDevelopmentSkillId,
  type WorkerSkillChoice,
  BACKUP_LINE_DURATION_MS,
  encodeUnlocks,
  resolveTowerAttackMultipliers,
  COLD_CRIT_CHANCE,
  COLD_CRIT_TEMPERATURE,
  MARKED_CRIT_CHANCE,
  ISOLATED_CRIT_CHANCE,
  KILL_SNAP_TURN_RATE,
  KILL_SNAP_DURATION_MS,
  FAST_TARGET_TURN_RATE,
  COLD_ACCURACY_TEMPERATURE,
  COLD_ACCURACY_BONUS,
  CLEAN_WAVE_GOLD,
  GOLD_INTEREST_RATE,
  RISKY_INVESTMENT_GOLD,
  RISKY_INVESTMENT_NEXUS_COST,
  CRIT_KILL_GOLD,
  DAMAGE_GOLD_PER_DAMAGE,
  MULTI_KILL_GOLD_COUNT,
  MULTI_KILL_GOLD_WINDOW_MS,
  HOT_KILL_TEMPERATURE,
  LONG_RANGE_KILL_FRACTION,
  LONG_RANGE_KILL_MAX_FRACTION,
  DELIVERY_GOLD_AMMO_UNIT,
  DELIVERY_GOLD_ENERGY_UNIT,
  towerHasBoundedRange,
  towerDealsDamage,
  isCleanWave,
  resolveStatConversions,
  getAccuracyCritChance,
  RUN_HOT_DAMAGE_PER_DEGREE,
  RUN_HOT_HEAT_LOCK_THRESHOLD,
  getCardDefinition,
  resolveTowerEngine,
  canAcceptTargetedCard,
  canEquipShopItem,
  getInventoryEquipRejectedCue,
  isGlobalShopItem,
  canTowerHoldTargetedCard,
  cardAppliesToTower,
  cardReachesTower,
  ownedCardAppliesToTower,
  cardCatalog,
  drawCards,
  getOwnedItemUnlocks,
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
  getWaveSpawnIntervalMs,
  KILL_STREAK_BUFF_DURATION_MS,
  KILL_STREAK_RETRIGGER_LOCK_MS,
  KILL_STREAK_RULES,
  type KillStreakRule,
  type KillStreakTier,
  getWaveEnemyCount,
  getArenaWaveEnemyCount,
  getWaveEnemyMaxHp,
  getWaveHpMultiplier,
  getWaveAirMode,
  isFlyingWaveSpawn,
  pickWaveEnemyType,
  getEnemyLeakDamage,
  AIR_ENEMY_HEALTH_MULTIPLIER,
  getWaveChampionPlan,
  splitChampionLeakDamage,
  getEnemyZeynepReputationGain,
  type WaveChampionPlan,
  type ChampionDownMessage,
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
  DEEP_FREEZE_COOLDOWN_MS,
  DEEP_FREEZE_DURATION_MS,
  DEEP_FREEZE_SPEED_THRESHOLD,
  encodeKillAssists,
  resolveKillAssists,
  type KillAssist,
  type KillAssistCandidate,
  isStatusEffectActive,
  isTowerAligned,
  isTowerPerformanceIdle,
  type EnergyWorkerSkillId,
  getStage,
  getStageRace,
  getTowerFireAlignmentTolerance,
  shouldRetainAimTargetLock,
  usesLinearBallistics,
  rotateTowerTowards,
  SLOW_STATUS_SPEED_MULTIPLIER,
  SLOW_STATUS_FRACTION,
  KIN_SLOW_FAR_FRACTION,
  getCriticalSlowFraction,
  getStatusSlowFraction,
  canRefundTowerPurchase,
  usesEffectInterval,
  resolveTowerRefund,
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
  PLAYABLE_CHARACTER_IDS,
  FALLBACK_PLAYABLE_CHARACTER_ID,
  isPlayableCharacterId,
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
  SERVER_FULL_MESSAGE,
  WIRE_DELTA_PROTOCOL,
  type Modifier,
  type ModifierStat,
  type RunModifiers,
  type StatConversion,
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
// Ozel dusmanlar ve karsi atak (2. asamadan itibaren): tablo ve sayilar paylasilan pakette.
import {
  COUNTER_SURGE_CROSS_MS,
  COUNTER_SURGE_DAMAGE_RATIO,
  COUNTER_SURGE_TELEGRAPH_MS,
  ENERGY_EATER_DRAIN_PER_SECOND,
  ENERGY_EATER_HP_MULTIPLIER,
  ENERGY_EATER_MIN_CONTACT_MS,
  ENERGY_EATER_SPAWN_BOTTOM_MARGIN_ROWS,
  HEATER_HEAT_PER_SECOND_RATIO,
  HEATER_RADIUS_CELLS,
  SPECIAL_BASE_TYPE,
  SPECIAL_ENEMIES_FIRST_STAGE,
  SPECIAL_ROUTE_BLOCKER_COST,
  TOWER_HUNTER_ATTACK_INTERVAL_MS,
  TOWER_HUNTER_HIT_DAMAGE,
  createSpecialRandom,
  getWaveSpecialSpawnReduction,
  planWaveSpecials,
  type CounterSurgeHitMessage,
  type CounterSurgeSnapshot,
  type SpecialEnemyKind,
  type WaveSpecialPlan,
  type WaveSpecialSpawn
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
/** Tek komutta gonderilebilecek en fazla dusman; yaratici mod da olsa oda kilitlenmemeli. */
const CREATIVE_MAX_SPAWN_BURST = 40;
const TOWER_BASE_HP = 100;
const TOWER_BASE_ARMOR = 3;
const TOWER_BASE_AMMO = 20;
const TOWER_BASE_ENERGY = 100;
const LOGISTICS_WORKER_SPEED = 82;
/**
 * Iscinin "temas" mesafesi.
 *
 * Iki bedenin yaricapi kadar: isci dusmanin icinden gecerken hasar alsin,
 * yanindan gecerken almasin. Buyutmek isciyi dusman yolundan uzak durmaya
 * degil, hic cikmamaya iterdi.
 */
const WORKER_CONTACT_RADIUS = 16;

/**
 * Onarim penceresinin kuyrugu.
 *
 * Tamirci her tick onariyor ama tikler arasinda bosluk var; pencere bu kadar
 * sarkmasa onarim odulleri karede bir yanip sonerdi. Kisa tutuluyor ki
 * Tamirci ayrildiginda odul de hemen bitsin.
 */
const REPAIR_WINDOW_LINGER_MS = 400;
/** Tamir Atesi: onarim suresince hasar. */
const REPAIR_DAMAGE_BONUS = 0.45;
/** Sogutmali Kaynak: onarim suresince soguma. */
const REPAIR_COOLING_BONUS = 1.2;
/**
 * Kalibrasyon Turu: performans kolunun cikisi bu kadar katlanir.
 *
 * Kol yine %100'de duruyor; katlanan sey kolun **verdigi** carpan, yani tam
 * acikken x2 yerine x4. Isi ve enerji bedeli kolun kendi konumundan
 * hesaplandigi icin degismiyor -- takasin bir yanini agirlastiran degil,
 * oteki yanini bedava buyuten bir kart.
 */
const REPAIR_PERFORMANCE_MULTIPLIER = 2;

/**
 * Bu mod bir lojistik iscisi mi.
 *
 * Dron listesi hem savasci dronlari hem isci hattini tasiyor ve ayrim uc
 * ayri yerde elle yazilmisti; besinci rol eklendiginde biri unutulmustu.
 * Tek soru, tek yer.
 */
function isLogisticsWorkerMode(mode: DroneSnapshot["mode"]) {
  return (HIRABLE_WORKER_ROLES as readonly string[]).includes(mode);
}
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
/** Rolanti odulunun hasar payi: kol yarinin altindayken. */
const PERFORMANCE_IDLE_EDGE_DAMAGE = 0.3;
/** Beklemeden uyanan kulenin hasar penceresi ve payi. */
const COLD_START_WINDOW_MS = 4000;
const COLD_START_DAMAGE = 0.6;
/** Lojistigi kapali kulenin hasar payi. */
const SELF_SUFFICIENT_DAMAGE = 0.25;
/** Dalga sonunda nexusa yazilan can. */
const NEXUS_MEND_HEAL = 4;
/**
 * Ucube'nin elektriginin atlayabilecegi en uzak mesafe (dunya birimi).
 *
 * Deger olculdu, secilmedi. Sahada bir dusmanin en yakin komsusuna uzakligi
 * ortancada 1,8 kare; iki karelik bir yaricap dusmanlarin ancak yarisini
 * yakaliyor ve sekme oyuncuya duzensiz gorunuyordu. Uc kare ucte ikisini
 * yakaliyor ve hala arenanin dortte biri kadar -- sinirsiz birakildiginda
 * ise sekme "yakindakine atlayan elektrik" olmaktan cikip haritanin obur
 * ucuna uzanan bir baglantiya donusuyor.
 */
/**
 * Sogutma Kanali: saniyedeki soguma basina yavaslatma.
 *
 * Taban soguma 3/sn, yani karti alan sade bir kule %9 yavaslatiyor. Kucuk
 * bir sayi ve oyle olmali: kart tek basina bir kontrol kulesi yaratmiyor,
 * sogutmaya yapilan yatirimi kontrole ceviriyor. Sogutmayi ikiye katlayan
 * bir oyuncu ayni anda yavaslatmasini da ikiye katlamis oluyor.
 */
const COOLANT_SLOW_PER_COOLING = 0.03;

/**
 * Sogutma yavaslatmasinin tavani.
 *
 * Soguma kartlarla katlanabiliyor ve tavansiz birakilirsa yeterince
 * sogutan bir kule dusmani tamamen durdururdu. Durdurmak Derin
 * Dondurma'nin isi; bu kartin isi yavaslatmak.
 */
const COOLANT_SLOW_MAX = 0.6;

/** Sogutma yavaslatmasinin suresi; her vurusta yenilenir. */
const COOLANT_SLOW_DURATION_MS = 1500;

/** Ayni kulenin iki `slow:critical` yayini arasindaki en kisa sure (duvar saati). */
const SLOW_CRIT_BROADCAST_INTERVAL_MS = 150;

/** Donmus hedefe nisan alma kolayligi. */
const FROZEN_CRIT_CHANCE = 0.3;

const UCUBE_CHAIN_RADIUS = TOWER_GRID_SIZE * 3;
/** Tek vurusta kac dusmana sekiyor. */
const UCUBE_CHAIN_TARGETS = 2;
/** Genis arama acikken gosterilen kart sayisi. */
const WIDE_SEARCH_CARD_COUNT = 4;
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
 * Menzilli dusman vurusunun izi.
 *
 * Isin kimliginin kule kimligi olmadigi tek yer: istemci bunu gorunce
 * kule kademesi aramaz, kirmizi bir izleyici cizer.
 */
const ENEMY_SHOT_BEAM_ID = "enemy-shot";
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
/** Kule ozeti (`insight`) bu siklikta yeniden kuruluyor. */
const TOWER_INSIGHT_REFRESH_MS = 1000;
/** Ardisik kurulan kulelerin ozet evreleri arasindaki kayma; ~bir snapshot araligi. */
const TOWER_INSIGHT_PHASE_STEP_MS = 67;
/** Isci aramasinin komsu sirasi (`getGridNeighbors` ile ayni): asagi, sol, sag, yukari. */
const WORKER_NEIGHBOR_COL_STEPS = [0, -1, 1, 0] as const;
const WORKER_NEIGHBOR_ROW_STEPS = [1, 0, 0, -1] as const;
/**
 * Onbellekten donen, dondurulmus modifier listesi. Tipi de salt okunur:
 * cagiran yerinde degistirmeye kalkarsa derleyici durduruyor (dondurulmus
 * diziye `push` calisma aninda sessizce ya da hatayla duserdi).
 */
type FrozenRunModifiers = readonly Modifier[];
/** Sahipsiz kulenin oyuncu modifierlari: her cagrida yeni bos dizi kurulmasin. */
const EMPTY_RUN_MODIFIERS: FrozenRunModifiers = Object.freeze([]);

/** Iki modifier listesi ayni nesneleri ayni sirada mi tutuyor (kopyasiz, tahsissiz). */
function sameModifierElements(cached: readonly Modifier[], current: readonly Modifier[]) {
  if (cached.length !== current.length) return false;
  for (let index = 0; index < cached.length; index += 1) {
    if (cached[index] !== current[index]) return false;
  }
  return true;
}

/**
 * Tel deltasinin alan karsilastirmasi: `JSON.stringify(a) === JSON.stringify(b)`
 * ile birebir ayni sonuc, ama sayi/metin/bayrak ve ilkel dizilerde metin
 * kurmadan. Her karede her kayit icin her alanda cagriliyor.
 *
 * Ozel durumlar JSON'un kendisinden: NaN ve sonsuzluklar `null` yaziliyor
 * (ikisi de sonlu degilse esit), dizide ayni olmayan bir eleman ya da nesne
 * goruldugunde eski yola, metne dusuluyor.
 */
export function wireValueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const typeA = typeof a;
  if (typeA === typeof b) {
    if (typeA === "number") return !Number.isFinite(a as number) && !Number.isFinite(b as number);
    if (typeA === "string" || typeA === "boolean") return false;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      let identical = true;
      for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) {
          identical = false;
          break;
        }
      }
      if (identical) return true;
    }
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
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
/**
 * Snapshot araligi: 15 kare/sn.
 *
 * 33 ms (30 Hz) idi. Istemci zaten yarim saniyelik bir oynatma tamponu tutuyor
 * ve iki snapshot arasini aradegerliyor, yani 30 Hz'in verdigi fazladan
 * puruzsuzlugu kimse gormuyordu -- karsiliginda her istemciye giden bant bir
 * kat buyuktu.
 *
 * Deger **60**, 66,67 degil. Aralik tik sinirlarinda kontrol ediliyor ve
 * sunucu 60 Hz kosuyor, yani gercek hiz her zaman bir tik katina yuvarlaniyor:
 * 50 ms uc tike (20 kare/sn), 60 ms dort tike (15 kare/sn), 66,67 ms ise bes
 * tike duserek 12 kare/sn veriyor. Istenen sayiyi yazmak istenen sayiyi
 * vermiyor; kat secmek gerekiyor.
 *
 * Bu, zayif baglantidaki oyuncu icin dogrudan kazanc: gonderilen her bayt onun
 * kuyruguna giriyor ve kuyruktaki her bayt kendi girdisinin gecikmesi demek.
 */
export const SNAPSHOT_SEND_INTERVAL_MS = 60;
/**
 * Bir istemcinin cikis kuyrugu bu kadari asarsa ona snapshot gonderilmez.
 *
 * Sinir 256 KB idi ve fazlaligi tek basina bir hataydi: kuyruktaki her bayt o
 * istemciye giden **her seyin** gecikmesi demek -- ping cevabi, kart teklifi,
 * kendi bastigi ultinin sonucu. 23 KB'lik bir snapshotla 256 KB, on bir
 * snapshot, yani zayif bir baglantida saniyelerce kuyruk. Iki kisilik odada bir
 * oyuncunun pingi 999+ oluyordu ve kendi hareketini karsi taraf aninda goruyor,
 * kendisi gec goruyordu: komut yukari gidiyor, sonuc kuyrugun arkasinda
 * bekliyordu.
 *
 * Gercek zamanli bir oyunda snapshot **atmak**, biriktirmekten her zaman
 * iyidir: istemci zaten iki snapshot arasini aradegerliyor, ama biriken kuyrugu
 * telafi edemiyor. Bu sinir birkac snapshotluk, yani onda birkac saniyelik.
 */
export const SNAPSHOT_BACKPRESSURE_LIMIT_BYTES = 48 * 1024;
/**
 * Duran tahtada, icerik degismese bile en fazla bu kadar sessiz kalinir.
 *
 * Istemcinin oynatma saati ve tamponu icin bir nabiz; ayrica bu arada yeniden
 * baglanan biri guncel durumu en gec bu kadar sonra goruyor.
 */
const SNAPSHOT_IDLE_HEARTBEAT_MS = 500;
/**
 * Kopan oyuncunun yuvasinin ona ayrildigi sure (sn).
 *
 * Bu pencerede yuva devralinamiyor: yeni gelen bos yuva aliyor ya da oda
 * doluysa reddediliyor. Pencere kapaninca oyuncu "ayrilmis" sayiliyor --
 * kulesi sahada kaliyor, yuvasi takim arkadasinin geri donusune (ya da
 * listeden katilan birine) acik, ama dalga boyunu, dusman canini ve tecrube
 * payini artik buyutmuyor.
 */
const RECONNECT_WINDOW_SECONDS = 20;
/**
 * Hic istemcisi kalmayan odanin kapanmadan once bekledigi sure.
 *
 * `autoDispose` kapali: son istemci gidince oda hemen kapanmasin, pencere
 * kapandiktan sonra listeden geri donen oyuncu macini bulsun -- sekmesi
 * mobil tarayicida oldurulen oyuncu dakikalar sonra donebiliyor. Ama terk
 * edilmis bir mac sonsuza kadar tick atmamali ve oda sinirinda yer tutmamali.
 * Bitmis mac beklemiyor: ona donulecek bir sey yok, son istemci gidince
 * kapaniyor.
 */
export const ABANDONED_ROOM_DISPOSE_MS = 10 * 60 * 1000;
/**
 * Ayni anda acik oda sinirinin varsayilani (`MAX_CONCURRENT_ROOMS` yoksa).
 *
 * Varsayilan Fly makinesi tek paylasimli cekirdek ve her oda kendi 60 Hz
 * simulasyonunu donduruyor. Olculdu: gec oyundaki bir oda hizli bir masaustu
 * cekirdeginin ~%9'unu yiyor; paylasimli Fly cekirdegi bundan yavas ve
 * komsulariyla paylasiliyor. Alti oda o cekirdekte tick'leri zamaninda
 * tutmanin ust siniri; daha guclu makinede ortam degiskeniyle artiyor.
 */
export const DEFAULT_MAX_CONCURRENT_ROOMS = 6;
/** Bir co-op odanin ust siniri; oynanabilir operator sayisi bunu daha da kisar. */
export const MAX_COOP_PLAYERS = 4;
/** Sinir doluyken oda kurma reddinin kodu; Colyseus istemciye metinle birlikte yolluyor. */
export const SERVER_FULL_ERROR_CODE = 4290;
/**
 * Hic kimsenin girmedigi yeni oda bu sure boyunca yerinden edilmiyor.
 *
 * Colyseus odayi kurduktan sonra kurucunun koltugunu ayiriyor; arada (ve
 * koltuk ayrilip soket gelene kadar) oda bos gorunuyor. Sinir doluyken gelen
 * baska bir kurulum o odayi terk edilmis sanip kapatmasin. Koltuk
 * rezervasyon suresiyle (`setSeatReservationTime(45)`) ayni.
 */
export const FRESH_ROOM_EVICTION_GRACE_MS = 45_000;
/** IP basina dakikada en fazla bu kadar oda kurulumu (`/matchmake/create`). */
export const ROOM_CREATE_LIMIT_PER_MINUTE = 6;

/** `MAX_CONCURRENT_ROOMS` ortam degiskeni; pozitif tam sayi degilse varsayilan. */
export function readMaxConcurrentRooms(raw: string | undefined) {
  const value = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_CONCURRENT_ROOMS;
}
/** Tick hatasindan sonra simulasyonun bekledigi en uzun sure; hata dongusu kurulmasin. */
const TICK_ERROR_BACKOFF_MAX_MS = 2000;
/**
 * Ust uste bu kadar basarisiz tick'ten sonra oda kapatiliyor (beklemelerle
 * ~11 sn). Donmus oda oyunculari bagli tutuyor ve oda sinirinda yer
 * tutuyor; kapanmak beklemekten iyi.
 */
export const TICK_FAILURE_LIMIT = 10;
/** Lobi ve katilim akisinin bilinen redleri; hata degil, gunluge yazilmiyor. */
const EXPECTED_ROOM_REJECTIONS = new Set<string>([SERVER_TEXT["room.full"], SERVER_TEXT["room.matchOver"], SERVER_FULL_MESSAGE]);
/** `{ message }` mesajinin anahtarli hali: Turkce metin ayni, istemci anahtari kendi dilinde yaziyor. */
function serverTextMessage(key: ServerTextKey) {
  return { message: SERVER_TEXT[key], key };
}
/** Ayni yerden gelen hata gunlugu en fazla bu siklikta yaziliyor. */
const ROOM_ERROR_LOG_INTERVAL_MS = 10_000;
const PERF_SEND_INTERVAL_MS = 1000;
const SNAPSHOT_SIZE_METRICS_ENABLED = process.env.SNAPSHOT_SIZE_METRICS === "true";
const SNAPSHOT_SIZE_SAMPLE_INTERVAL_MS = 1000;
const DEBUG_LASER_OVERDRIVE_DURATION_MS = 2000;
const DEBUG_LASER_MAX_SWEEP_RADIANS_PER_SECOND = degreesToRadians(30);
const DEBUG_LASER_OVERDRIVE_BEAM_RADIUS = 12;
/**
 * 10. seviyede zincir kirisine eklenen iki ters donen kirisin her birinin
 * asiri yukleme boyunca taradigi aci: tam tur. Biri saat yonunde, digeri
 * tersine; ikisi baslangicin tam karsisinda yarida kesisiyor, sonda
 * baslangicta bulusuyor -- cember iki kez taraniyor. Zincir rotasinin 30
 * derece/sn tavani bunlara uygulanmiyor: o tavan hedef olunce rotanin bir
 * karede sicramasini engelliyor; bu kirisler sabit hizla donuyor, kare basina
 * adimlari zaten `hiz x kare suresi`.
 */
const DEBUG_LASER_TWIN_SWEEP_RADIANS = Math.PI * 2;
/** Ters donen kirislerin yonu, `getDebugLaserTwinBeamIds` sirasiyla: `-b` saat yonunde, `-c` tersine. */
const DEBUG_LASER_TWIN_DIRECTIONS = [1, -1] as const;
/** Taranan yay bu dilimlerden buyukse vurus testi dilimlere bolunuyor. */
const DEBUG_LASER_TWIN_MAX_HIT_ARC = Math.PI / 4;
/** Asiri yukleme bittikten sonra kapanis vurusunun yapilabildigi en gec an. */
const DEBUG_LASER_CLOSING_PASS_WINDOW_MS = 250;
const DEBUG_LASER_HEAT_WINDOW_MS = 20000;
const DEBUG_LASER_HEAT_LIMIT_MS = 10000;
const DEBUG_LASER_OVERHEAT_MS = 5000;

/**
 * Debug Lazerin kademeye gore rengi: yildiz sicakligi gibi.
 *
 * Seviye atlamanin ilk kademesi zaten kirisin kenarina hat, ikincisi kafes
 * ekliyordu -- ikisi de yakindan bakinca goruluyor. Renk uzaktan da okunuyor:
 * oyuncu haritanin obur ucundan hangi lazerin olgunlastigini goruyor.
 *
 * Sicak uc beyaz. Kademe 1 kendi kimlik rengini koruyor ki degisim bir gelisme
 * gibi okunsun, rastgele bir renk degil.
 */
const DEBUG_LASER_TIER_COLORS: Record<number, { beam: number; overdrive: number }> = {
  1: { beam: 0xef4444, overdrive: 0xfbbf24 },
  2: { beam: 0x60a5fa, overdrive: 0x60a5fa },
  3: { beam: 0xffffff, overdrive: 0xffffff }
};
const TOWER_DPS_WINDOW_MS = 5000;
const UCUBE_STACK_INTERVAL_REDUCTION = (1 - 300 / 940) / 15;
const ATAKAN_ULTIMATE_EXHAUSTION_MS = 3000;
const ATAKAN_DRONE_REPAIR_AMOUNT = 3;
const ATAKAN_DRONE_ATTACK_SPEED = 180;
const ATAKAN_DRONE_REPAIR_SPEED = 150;
const ATAKAN_ULTIMATE_CHARGE_MULTIPLIER = 1 / 3;
// Seri kademeleri, buff suresi ve kilit @karayel/shared'de: istemcinin afisi
// buff'i ayni tablodan yaziyor, iki kopya birbirinden kaymasin.
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
const ZEYNEP_SYNTHESIS_RAY_SPEED = 930;
const ZEYNEP_SYNTHESIS_RAY_LENGTH = TOWER_GRID_SIZE * ZEYNEP_RAY_SYNTHESIS_LENGTH_CELLS;
const ZEYNEP_SYNTHESIS_RAY_TRAIL_TTL_MS = 140;
// Dizilim carpanlari ve kurali paylasilan pakette (`synergy`): istemci
// yerlestirme onizlemesinde ayni hesabi yapiyor, iki kopya ayrisirdi.
const KIN_WAVE_ANGLE_RADIANS = degreesToRadians(60);
const KIN_SYNTHESIS_WAVE_ANGLE_RADIANS = degreesToRadians(90);
const KIN_WAVE_SPEED = 104;
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
const KIN_SLOW_FAR_MULTIPLIER = 1 - KIN_SLOW_FAR_FRACTION;
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
  /** Altinla alinmis ek isciler; uzmanlik ilk kalici secimde belirlenir. */
  /**
   * Alinmis isciler; secilen uzmanligi ve kademesiyle.
   *
   * Tek liste tutuluyor cunku fiyat sayaci **ortak**: normal ya da gelismis,
   * her alim bir sonrakini pahalilastiriyor. Ayri listeler tutmak gelismis
   * isciyi normal alimlarla ucuza getirmenin yolunu acardi.
   */
  hiredWorkers: HiredWorker[] = [];
  /** XP ile acilan ortak isci gelisim agaci; tum ayni rol hucrelerine uygulanir. */
  workerSkillIds: WorkerSkillId[] = [];
  shopOffers: ShopItem[] = [];
  shopRerolls = 0;
  nexusShieldCharges = 0;
  /**
   * Vadeli Mevduat (esyanin `deposit` alani): her alimin odenecegi dalga ve
   * tutari. `dueWave` dalgasi tamamlaninca, dalga sonu primleriyle birlikte
   * odenip listeden dusuyor.
   */
  goldDeposits?: Array<{ dueWave: number; amount: number }> = [];

  /**
   * Odadaki sabit yuva (0-3); katilista bos olan en kucuk sayi.
   *
   * Hasar olayi vuranini bununla soyluyor. Kayitla birlikte yasiyor: yeniden
   * baglanan oyuncu ayni kaydi, dolayisiyla ayni yuvayi aliyor.
   */
  slot = 0;
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
  creative?: boolean;
  stage?: number;
  /**
   * Istemcinin anladigi tel surumu (`WIRE_DELTA_PROTOCOL`). Yoksa eski
   * istemci: oyuncu ve isci kayitlarini her karede tam bekliyor.
   */
  wireDelta?: number;
  /**
   * Solo odanin sahip sirri: kurulumda istemcinin urettigi rastgele metin.
   * Pencereden sonra kimlikle geri donus bunu gostermek zorunda.
   */
  ownerSecret?: string;
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
  /** Execute'un hedefi: istemcinin dokundugu dusmanin kimligi. */
  enemyId?: string;
  commandTier?: ZeynepCommandTier;
};

type UseUltimateMessage = {
  mode?: "attack" | "repair";
  /** Zeynep ultisinin patlayacagi sutun. */
  column?: number;
};

/**
 * Bir ultinin karnesi: ne kadar dusmana indi, kacini oldurdu.
 *
 * Aninda sonuclanan ulti (sutun, meteor, kilit alan, can dalgasi) atis aninda
 * raporlaniyor. Drone'lu ve sureli olanlar acik kaliyor ve etki bitince
 * raporlaniyor; atisi hicbir sey beklemiyor.
 */
type UltimateReport = {
  ownerId: string;
  kind: UltimateResultKind;
  hits: number;
  kills: number;
  /** Zeynep sutunu: atis aninda en kalabalik sutunun yakalayacagi dusman. */
  best?: number;
  /** Zeynep sutunu: atis aninda secilen sutunda vurulabilir dusman (nisan). */
  aim?: number;
  /** Tamir ve can dalgasi: usse gercekten donen can. */
  heal?: number;
  /** Atakan: bu atisin henuz dusmeyen drone'lari; hepsi bitince rapor gidiyor. */
  droneIds?: Set<string>;
  /** Sureli ulti (Kabus, Sempati): bu andan sonra rapor gidiyor. */
  until?: number;
  /** Sempati: baga takilip kanayan dusmanlar; olumler bunlardan sayiliyor. */
  markedIds?: Set<string>;
};

type KillStreakLock = {
  unlockAt: number;
  wave: number;
};

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
  /** Sifirsa yalnizca bitisigine vurur. Dunya olceginde. */
  attackRange: number;
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
  /**
   * Herhangi bir yavaslatmanin bittigi en gec an ("yavaslamis mi" sorusu).
   * Hizi bu degil `slowSpeedFloors` belirliyor.
   */
  slowUntil: number;
  /**
   * Aktif yavaslatmalarin hiz tabanlari; dusmanin hizi en gucluleri.
   *
   * Tek bir sayi yetmiyordu: yavaslatmanin gucu artik kaynaktan kaynaga
   * degisiyor (Izolasyon seviyeyle %10 -> %50, kritik 1,5 kat) ve her
   * birinin suresi ayri. Anahtar kaynak + guc, yani ayni kulenin yenilenen
   * vurusu kendi kaydini tazeliyor; kritik vurus ayri kayit, bir sonraki
   * kritiksiz vurus onu silmiyor -- kendi suresi bitene kadar en guclu o.
   */
  slowSpeedFloors?: Record<string, { speedMultiplier: number; expiresAt: number; ownerId?: string }>;
  /**
   * Bu dusmanin yeniden donabilecegi an.
   *
   * Donmus dusmanin hizi sifir, yani donma esiginin altinda. Bekleme
   * olmasaydi cozuldugu karede yeniden donar ve bir daha hic yurumezdi.
   */
  freezeReadyAt: number;
  /**
   * Sogutma Kanali'nin kendi yavaslatma kanali.
   *
   * Ayri kanal, cunku kartin sozu "kendisiyle stacklenmez ama baska
   * yavaslatmalarla birlikte durabilir". Ortak `slow` yuvasina yazsaydi
   * kulenin kendi yavaslatmasinin uzerine biner ve onu ezerdi.
   */
  coolantSlowUntil: number;
  coolantSlowMultiplier: number;
  /**
   * Sogutma kanalini son kuran kulenin sahibi: co-op asisti icin
   * (`resolveEnemyKillAssists`). Yalnizca taninma; yavaslatmayi etkilemiyor.
   */
  coolantSlowOwnerId?: string;
  auraSlowMultiplier: number;
  /** Hareket hesabinin son tikte yazdigi yavaslatma carpani (hizlanma ve durdurma haric); Soguk Av Kaydi okuyor. */
  movementSlowMultiplier?: number;
  trackingSourceTowerId?: string;
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
  /**
   * Dalganin sampiyonu: yerine gectigi normal dogumlarin butcesi.
   *
   * Altin, deneyim, sizinti ve ulti sarji normal dusmanda turden ve dalgadan
   * turetiliyor; sampiyonda bu kayittan okunuyor, cunku dalganin toplami
   * yerine gecilen dogumlarin beklenen toplamina esit kalmali
   * (`getWaveChampionPlan`). `spawnedAt` devrilme suresi icin (duvar saati).
   */
  champion?: { replaced: number; gold: number; exp: number; leakDamage: number; reputation: number; spawnedAt: number };
  /**
   * Ozel dusman (2. asamadan itibaren): kule avcisi, isitici, enerji yiyici.
   * Sampiyon degil -- tac, sampiyon primi, nisan ya da "sampiyon devrildi"
   * yok. Avcinin butcesi (`budget`) o dalganin sampiyon butcesi: altin,
   * deneyim, sizinti ve oldurme birimi yerine gectigi dogumlar kadar.
   */
  special?: SpecialEnemyState;
};

type SpecialSpawnOptions = {
  kind: SpecialEnemyKind;
  type: EnemyType;
  /** Can, kalkan ve yenilenme kati (sampiyon katiyla ayni yer). */
  healthMultiplier: number;
  start: { x: number; y: number };
  budget?: SpecialEnemyState["budget"];
};

/** Ozel dusman yol karari; `findEnemyRoute`un donusuyle ayni sekil, arti emme. */
type SpecialEnemyRoute = {
  cells: Array<{ col: number; row: number }>;
  reachedBottom: false;
  targetTower: TowerModel | undefined;
  exitPoint: undefined;
  /** Enerji yiyici hedefine vardi: bunu emiyor. */
  drainTower?: TowerModel;
};

const SPECIAL_ROUTE_COL_STEPS = [0, -1, 1, 0] as const;
const SPECIAL_ROUTE_ROW_STEPS = [1, 0, 0, -1] as const;

/**
 * Yol alani icin kucuk ikili yigin (hucre indeksi, maliyet). Esitlikte
 * ekleme sirasi belirlenimli: ayni yerlesim her zaman ayni alani uretiyor.
 */
class SpecialRouteHeap {
  private readonly indices: number[] = [];
  private readonly costs: number[] = [];
  private readonly orders: number[] = [];
  private counter = 0;
  /** Son `pop`un maliyeti (bayat kaydi ayiklamak icin). */
  lastCost = 0;

  get size() {
    return this.indices.length;
  }

  push(index: number, cost: number) {
    this.indices.push(index);
    this.costs.push(cost);
    this.orders.push(this.counter++);
    let child = this.indices.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!this.less(child, parent)) break;
      this.swap(child, parent);
      child = parent;
    }
  }

  pop() {
    const top = this.indices[0];
    this.lastCost = this.costs[0];
    const last = this.indices.length - 1;
    this.swap(0, last);
    this.indices.pop();
    this.costs.pop();
    this.orders.pop();
    let parent = 0;
    for (;;) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < this.indices.length && this.less(left, smallest)) smallest = left;
      if (right < this.indices.length && this.less(right, smallest)) smallest = right;
      if (smallest === parent) break;
      this.swap(parent, smallest);
      parent = smallest;
    }
    return top;
  }

  private less(a: number, b: number) {
    return this.costs[a] < this.costs[b] || (this.costs[a] === this.costs[b] && this.orders[a] < this.orders[b]);
  }

  private swap(a: number, b: number) {
    [this.indices[a], this.indices[b]] = [this.indices[b], this.indices[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
    [this.orders[a], this.orders[b]] = [this.orders[b], this.orders[a]];
  }
}

type SpecialEnemyState = {
  kind: SpecialEnemyKind;
  budget?: { replaced: number; gold: number; exp: number; leakDamage: number; reputation: number };
  /** Enerji yiyici: su anda emilen bina; yalnizca emerken. */
  drainId?: string;
  /** Enerji yiyici: ayni binaya kesintisiz temas suresi (oyun ms). */
  drainContactMs?: number;
};

/**
 * Ozel dusmanlarin ortak yol alani: her hucreden en yakin hedefe (avci icin
 * duvar disi her kare kaplayan yapi, yiyici icin enerji binasi) bir sonraki
 * adim. Hedef yapilarin karelerinden geriye dogru Dijkstra; duvar gecmek ya
 * da hedef olmayan bir yapiyi kirmak `SPECIAL_ROUTE_BLOCKER_COST`. Yapi
 * degisince (`markNavigationDirty`) atiliyor; dusman basina arama yok.
 */
type SpecialRouteField = {
  cols: number;
  /** Hucreden hedefe maliyet; ulasilamazsa sonsuz. */
  cost: Float64Array;
  /** Bir sonraki hucrenin indeksi; hedef karesinde -1. */
  next: Int32Array;
  /** Hucre bir hedefin karesi mi. */
  target: Uint8Array;
};

/** Karsi atak: ust kenardan inen, gectigi yapilari bir kez vuran serit. */
type CounterSurgeModel = {
  id: number;
  col: number;
  width: number;
  /** Uyarinin basladigi ve seridin kalktigi an (duvar saati). */
  createdAt: number;
  launchAt: number;
  hitIds: Set<string>;
};

/**
 * Isci gelisim agacinin yon/derinlestirme secimlerinin kuleye biraktigi
 * etkiler. Her biri bir sure (duvar saati, oteki isci becerileriyle ayni) ya
 * da atis/vurus sayisiyla bitiyor; ust uste gelen ayni etki en gucluyu ve en
 * uzun sureyi tutuyor, toplanmiyor.
 *
 * - energyCost / ammoCost / heat / damageTaken: `1 - value` carpani.
 * - cooling / range / fireRate: `1 + value` (atis hizi araliga bolen).
 * - damage / damageShots / fullTankDamage: vurus hasarina eklenen pay.
 * - pierce: mermiye eklenen delme sayisi.
 * - markShots: `value` ms suren Takip isareti; slowShots: `value` ms yavaslatma.
 * - markGuard / stackGuard / upkeepFree: yalnizca sure.
 */
type WorkerBoostKind =
  | "energyCost" | "ammoCost" | "heat" | "cooling" | "damage" | "damageShots" | "fullTankDamage"
  | "range" | "fireRate" | "pierce" | "markGuard" | "stackGuard" | "markShots" | "slowShots"
  | "damageTaken" | "upkeepFree";
type WorkerBoost = { until: number; value: number; shots?: number };

/** Atisla biten etkilerin yedek omru: oyuncu kuleyi bir dalga susturursa sonsuza kalmasin. */
const WORKER_SHOT_BOOST_LIFETIME_MS = 60_000;

type TowerModel = {
  logisticsPriority?: LogisticsPriority;
  formationReason?: string;
  id: string;
  ownerId: string;
  ownerName: string;
  characterId: CharacterId;
  definition: TowerDefinition;
  /** Kurulurken odenen altin; kurulum icinde geri alinirsa bu iade ediliyor. */
  buildGold: number;
  /** Kuruldugu kurulum arasi; dalga sirasinda kurulduysa yok. */
  builtInSetupSession?: number;
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
  energyRelayUntil?: number;
  energyRelaySourceId?: string;
  energyLocalReserve?: number;
  energyBridgeUntil?: number;
  energyShedUntil?: number;
  energyFrequencyUntil?: number;
  energyScenarioCharge?: number;
  energyConduitUntil?: number;
  energyConduitSourceId?: string;
  energyFreeUntil?: number;
  crystalReserve?: number;
  crystalResonanceReadyAt?: number;
  crystalConduitWave?: number;
  crystalLastCoreWave?: number;
  crystalCriticalResonanceWave?: number;
  ammoFactoryShield?: number;
  ammoRecyclingClaimedWave?: number;
  ammoBlackBoxWave?: number;
  ammoRefinerUntil?: number;
  ammoPayloadUntil?: number;
  ammoPayloadKind?: "refined" | "special";
  ammoPayloadShots?: number;
  ammoEmergencyShots?: number;
  ammoAssaultArmedUntil?: number;
  ammoAssaultUntil?: number;
  ammoEvacuationUntil?: number;
  /** Isci agacinin yon secimlerinden gelen etkiler (`WorkerBoostKind`). */
  workerBoosts?: Partial<Record<WorkerBoostKind, WorkerBoost>>;
  /** Patlama Rezervi / Dalgasi: bu reaktorde bir sonraki tetigin acildigi an. */
  crystalBurstReadyAt?: number;
  repairFortificationUntil?: number;
  repairFortificationHp?: number;
  repairBreachUntil?: number;
  repairRebuildWave?: number;
  standby: boolean;
  wakeReadyAt: number;
  ammoLogisticsEnabled: boolean;
  /** Duvara acilmis kapi: isci gecer, dusman gecmez. */
  gate: boolean;
  /**
   * Tamircinin bu kuleye en son dokundugu andan kisa bir sure sonrasi.
   *
   * Onarim tik tik ilerledigi icin "su anda onariliyor mu" sorusu tek bir
   * ana bakarak cevaplanamaz: iki tik arasinda cevap hep hayir olurdu ve
   * pencereye bagli her odul karede bir yanip sonerdi. Kisa bir kuyruk
   * cevabi surekli kiliyor.
   */
  repairedUntil: number;
  /**
   * Kalibrasyon Turu'nun verildigi dalga.
   *
   * Sure bir zaman damgasi degil bir **dalga numarasi**: "o tur boyunca"
   * dendiginde kastedilen sure bu ve dalga uzunlugu sabit degil. Damga
   * tutulsaydi kisa dalgada uzun, uzun dalgada kisa surerdi.
   */
  repairPerformanceWave: number;
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
  /** Aurasi acik mi; her tik yazilir, anlik goruntu buradan okur. */
  auraActive: boolean;
  focusTargetId: string;
  aimTargetId: string;
  /** `aimTowerAt`'in en son dondurdugu dusman; namlunun gercek hedefi. */
  turnTargetId?: string;
  aimTargetLockUntil: number;
  aimTargetHasFired: boolean;
  focusStacks: number;
  stackStates: Record<string, TowerStackRuntimeState>;
  triggerCooldowns: Record<string, number>;
  activeMs: number;
  overheatMs: number;
  offlineUntil: number;
  debugOverdriveUntil: number;
  debugSweepRouteAngles?: number[];
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
  /**
   * 10. seviyenin asiri yuklemesi: zincir kirisine eklenen iki ters donen
   * kirisin ortak baslangic acisi. Tanimsizsa yalnizca zincir kirisi.
   */
  debugTwinStartAngle?: number;
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
  /** Savas Tazminati'nin saydigi, bu dalga verilen hasar; dalga sonunda okunup sifirlaniyor. */
  waveDamageDealt?: number;
  /** Ikmal Senedi: tam birime ulasmamis teslimatin altin kesri. */
  deliveryGoldCarry?: number;
  /** Terfi Ikramiyesi: bu kulenin gelistirmelerinden odenen prim; ayni hazirlikta geri alinirsa geri aliniyor. */
  upgradeBonusGold?: number;
  /** Toplu Imha Primi: son oldurmelerin zamani (pencere icinde). */
  recentKillTimes?: number[];
  /** `aim:killSnap`: son oldurmeden sonraki donus hizi penceresinin sonu. */
  killSnapUntil?: number;
  /** Bu kosuda oldurdugu dusman (kule paneli); yalnizca sayac, hicbir kural okumuyor. */
  killCount?: number;
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
  grantCache?: {
    generation: number;
    engine?: TowerEngineConfig;
    attackMultipliers: TowerAttackMultipliers;
    /** Onarim ve satis carpanlari; ikisi de kart/esya degisince yeniden cozulur. */
    repairCostMultiplier: number;
    sellRefundMultiplier: number;
    /** Durum etkisi gucu ve suresi; panelde gosterilen sayilar buradan. */
    statusMagnitudeMultiplier: number;
    statusDurationMultiplier: number;
    unlocks: Set<Unlock>;
    /** Kuleye isleyen Epik kartlarin stat cevrimleri; kaynak modifier adi ile. */
    conversions: Array<StatConversion & { source: string }>;
    /**
     * Motorda kulelere isleyen (`affects: "towers"`) bir aura var mi.
     * `getTowerAuraModifiers` her cagrida butun kuleleri tariyor; aurasi
     * olmayanlari burada eleyip tarama basina tahsisi atliyor.
     */
    hasTowerAura?: boolean;
  };
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
type HireWorkerMessage = { role?: HirableWorkerRole; advanced?: boolean };
type ChooseWorkerSpecializationMessage = { workerId?: string; role?: HirableWorkerRole };
type ChooseWorkerSkillMessage = { workerId?: string; skillId?: WorkerSkillId };
type WorkerDevelopmentMessage = { role?: HirableWorkerRole; skillId?: WorkerSkillId };
type ChooseUcubePerkMessage = { towerId?: string; perkId?: UcubePerkId };
type SetMelisStanceMessage = { stance?: MelisStance };
type ChooseCardMessage = { cardId?: string; towerId?: string };
type BuyShopItemMessage = { itemId?: string };
type SetTowerTargetingMessage = { towerId?: string; mode?: TowerTargetingMode };
type EquipShopItemMessage = { itemId?: string; towerId?: string };
type PlaceShopMapItemMessage = { itemId?: "bariyer" | "ziftli-zemin"; x?: number; y?: number };

/**
 * Yaratici mod komutlari.
 *
 * Hepsi bedelsiz ve dogrulamasi gevsek; bu yuzden `getCreativePlayer`
 * kapisindan gecmeyen hicbiri is yapmiyor.
 */
type CreativeTowerMessage = { definitionId?: string; x?: number; y?: number; orientation?: TowerOrientation };
type CreativeLevelMessage = { towerId?: string; level?: number };
type CreativeCardMessage = { cardId?: string; towerId?: string; on?: boolean };
type CreativeItemMessage = { itemId?: string; towerId?: string; on?: boolean };
type CreativeWaveMessage = { wave?: number };
type CreativeSpawnMessage = { count?: number };

/**
 * Istemci mesajlarinin kapisi: hangi asamada, hangi alanlarla, ne siklikta.
 *
 * Mesaj govdesi istemciden geliyor ve hicbir sekline guvenilemez. Govdesiz
 * gonderilen mesaj `undefined` olarak geliyor; bir donem yirmi kadar isleyici
 * alanini korumasiz okuyordu ve Colyseus'un yakalanmamis hata kancasi tum
 * sureci kapatiyordu -- tek bir `room.send("latency:ping")` butun maclari
 * bitiriyordu. NaN ve Infinity de `typeof === "number"` testinden geciyordu
 * (NaN performans kolu muhimmatli kuleyi her tick ateslettiriyordu).
 *
 * Kural tek yerde, isleyicide degil: `onMessage` bu tabloya bakarak govdeyi
 * duz bir nesneye indiriyor ve yalnizca bildirilen alanlari, dogru tipte ve
 * sonlu sayi olarak birakiyor. Isleyici yine kendi aralik kontrolunu yapiyor;
 * burasi yalnizca seklin dogrulugunu garanti ediyor.
 */
type MessageFieldKind = "string" | "number" | "boolean";
export type MessageRule = {
  /** "lobby": yalnizca mac baslamadan; "match": yalnizca macta; "any": her zaman. */
  phase: "lobby" | "match" | "any";
  /** Yalnizca yaratici odada; bayrak govde okunmadan once soruluyor. */
  creative?: boolean;
  fields: Readonly<Record<string, MessageFieldKind>>;
  /** Mesaj turu basina kova; verilmezse `MESSAGE_RATE_DEFAULT`. */
  rate?: MessageRate;
  /**
   * "Son deger kazanir": kovayi asan mesaj dusmuyor, bu alanin degeri
   * basina saklaniyor ve bir sonraki tick'te uygulaniyor. Kaydirici gibi
   * yalnizca son degeri anlamli olan mesajlar icin; birakis degeri kaybolmaz.
   */
  latestWinsBy?: string;
};
type MessageRate = { burst: number; perSecond: number };

/** Kimlik ve secim metinleri kisa; uzunu gecersiz sayiliyor, kirpilmiyor. */
const MESSAGE_STRING_MAX_LENGTH = 80;
/**
 * Mesaj turu basina varsayilan kova. Elle oynayan bir oyuncu buna hic
 * dokunmuyor; amac dongude gonderen istemcinin isini sinirlamak.
 */
const MESSAGE_RATE_DEFAULT: MessageRate = { burst: 40, perSecond: 20 };
/**
 * Istemci basina butun turlerin toplami. Performans kolu surukleme boyunca
 * kare basina mesaj yolluyor; tavan ona yer birakacak kadar genis.
 */
const MESSAGE_RATE_TOTAL: MessageRate = { burst: 300, perSecond: 200 };

export const MESSAGE_RULES: Readonly<Record<string, MessageRule>> = {
  "lobby:setCharacter": { phase: "lobby", fields: { characterId: "string" } },
  "lobby:setReady": { phase: "lobby", fields: { ready: "boolean" } },
  "lobby:start": { phase: "lobby", fields: {} },
  placeTower: { phase: "match", fields: { definitionId: "string", x: "number", y: "number", orientation: "string" } },
  upgradeTower: { phase: "match", fields: { towerId: "string" } },
  sellTower: { phase: "match", fields: { towerId: "string" } },
  equipShopItem: { phase: "match", fields: { itemId: "string", towerId: "string" } },
  // Beceri dokunusla gidiyor; sogumasi zaten saniyeler. Kova insan elinin
  // rahatca sigdigi kadar, dongude gonderen istemciyi kesiyor.
  useSkill: { phase: "match", fields: { slot: "number", x: "number", y: "number", towerId: "string", enemyId: "string", commandTier: "string" }, rate: { burst: 10, perSecond: 4 } },
  useUltimate: { phase: "match", fields: { mode: "string", column: "number" } },
  linkServer: { phase: "match", fields: { serverTowerId: "string", targetTowerId: "string" } },
  setTowerMode: { phase: "match", fields: { towerId: "string", mode: "string" } },
  toggleWallGate: { phase: "match", fields: { towerId: "string" } },
  toggleAmmoLogistics: { phase: "match", fields: { towerId: "string" } },
  "tower:priority": { phase: "match", fields: { towerId: "string", priority: "string" } },
  "tower:preview": { phase: "match", fields: { requestId: "string", towerId: "string", cardId: "string", itemId: "string" } },
  // Kule paneli acikken istemci yarim saniyede bir istiyor (`TOWER_STATS_REFRESH_MS`);
  // kova secim degisiminde aninda istege ve bir yeniden baglanmaya yer birakiyor.
  "tower:stats": { phase: "match", fields: { towerId: "string", q: "number" }, rate: { burst: 4, perSecond: 3 } },
  "defense:request": { phase: "any", fields: {}, rate: { burst: 5, perSecond: 1 } },
  // Kol surukleme boyunca her karede gidiyor; son deger dusmemeli.
  setTowerPerformance: { phase: "match", fields: { towerId: "string", performance: "number" }, rate: { burst: 120, perSecond: 120 }, latestWinsBy: "towerId" },
  // Istemci saniyede bir yolluyor.
  "latency:ping": { phase: "any", fields: { sentAt: "number" }, rate: { burst: 4, perSecond: 2 } },
  "wave:continue": { phase: "match", fields: {} },
  "card:choose": { phase: "match", fields: { cardId: "string", towerId: "string" } },
  // Tam statik kayit butun haritayi tasiyor; istemci kendisi saniyede birden sik istemiyor.
  "snapshot:requestFull": { phase: "any", fields: {}, rate: { burst: 3, perSecond: 1 } },
  "card:sync": { phase: "any", fields: {}, rate: { burst: 5, perSecond: 1 } },
  "run:sync": { phase: "any", fields: {}, rate: { burst: 5, perSecond: 1 } },
  "shop:buy": { phase: "match", fields: { itemId: "string" } },
  "shop:reroll": { phase: "match", fields: {} },
  "structure:repair": { phase: "match", fields: { towerId: "string" } },
  "worker:hire": { phase: "match", fields: { role: "string", advanced: "boolean" } },
  "worker:specialization": { phase: "match", fields: { workerId: "string", role: "string" } },
  "worker:skill": { phase: "match", fields: { workerId: "string", skillId: "string" } },
  "worker:development": { phase: "match", fields: { role: "string", skillId: "string" } },
  "ultimate:upgrade": { phase: "match", fields: {} },
  "ucube:choose": { phase: "match", fields: { towerId: "string", perkId: "string" } },
  "melis:stance": { phase: "match", fields: { stance: "string" } },
  "tower:targeting": { phase: "match", fields: { towerId: "string", mode: "string" } },
  "shop:place": { phase: "match", fields: { itemId: "string", x: "number", y: "number" } },
  "worker:banCell": { phase: "match", fields: { x: "number", y: "number" } },
  "creative:sync": { phase: "match", creative: true, fields: {} },
  "creative:tower": { phase: "match", creative: true, fields: { definitionId: "string", x: "number", y: "number", orientation: "string" } },
  "creative:level": { phase: "match", creative: true, fields: { towerId: "string", level: "number" } },
  "creative:card": { phase: "match", creative: true, fields: { cardId: "string", towerId: "string", on: "boolean" } },
  "creative:item": { phase: "match", creative: true, fields: { itemId: "string", towerId: "string", on: "boolean" } },
  "creative:wave": { phase: "match", creative: true, fields: { wave: "number" } },
  // Her biri kirk dusmana kadar dogurabiliyor.
  "creative:spawn": { phase: "match", creative: true, fields: { count: "number" }, rate: { burst: 10, perSecond: 4 } }
};

/**
 * Govdeyi duz bir nesneye indirir; yalnizca bildirilen alanlar, dogru tipte.
 *
 * Sayi sonlu olmali (NaN ve Infinity dusuyor), metin kisa olmali. Tipi
 * tutmayan alan yok sayiliyor: isleyici onu hic gelmemis gibi goruyor ve
 * zaten eksik alan icin reddetme yolunu biliyor. Govde nesne degilse (yok,
 * `null`, metin, sayi, dizi) sonuc bos nesne.
 */
export function sanitizeMessagePayload(raw: unknown, fields: Readonly<Record<string, MessageFieldKind>>): Record<string, unknown> {
  const message: Record<string, unknown> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return message;
  }
  const source = raw as Record<string, unknown>;
  for (const [name, kind] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
    const value = source[name];
    if (kind === "number" ? typeof value === "number" && Number.isFinite(value)
      : kind === "string" ? typeof value === "string" && value.length <= MESSAGE_STRING_MAX_LENGTH
      : typeof value === "boolean") {
      message[name] = value;
    }
  }
  return message;
}

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
  /**
   * Onur kulesinin atista zarladigi sans carpani. Mermi ucarken kule yeniden
   * zar atabiliyor; jackpot damgasi (`j`) bu mermiyi atan zardan okunmali.
   */
  luck?: number;
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
  /**
   * Bir hucre boyunca saklanan adim.
   *
   * Yol arama hucre basina bir kez kosuyor; her tick kosmasi ayni cevabi
   * onlarca kez uretmek olurdu. Adim gecersizlestiginde (oyuncu tam o
   * araliga duvar ordu) yeniden araniyor.
   */
  routeStep?: { fromCol: number; fromRow: number; goalCol: number; goalRow: number; toCol: number; toRow: number };
  hiredWorkerId?: string;
  extractionRemainingMs?: number;
  cargoAmmoType?: AmmoType;
  skillIds?: WorkerSkillId[];
  cargoSpecial?: boolean;
  cargoAmmoPayloadKind?: "refined" | "special";
};

type WorkerBanCellMessage = {
  x?: number;
  y?: number;
};

type ToggleWallGateMessage = {
  towerId?: string;
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
  /**
   * Bu surecteki odalar: yalnizca sayim (oda siniri) icin.
   *
   * Odalar birbirine dokunmuyor. Eskiden burasi tek oda kuraliydi: bagli
   * oyuncusu olan bir oda varken yeni oda kurulamiyordu ("Zaten aktif bir
   * oda var.") ve yeni oda kurulurken bos odalar kapatiliyordu. Simdi her mac
   * kendi durumuyla yasiyor; kimsesiz oda kendi zamanlayicisiyla kapaniyor
   * (`checkAbandoned`). Tek istisna dolu sunucu: yeni kurulum yalnizca
   * gercekten terk edilmis bir odanin yerini alabiliyor (`evictAbandonedRoom`).
   */
  static rooms = new Map<string, MatchRoom>();
  /** Listede gorunebilecek odalar; `syncRoomRegistry` her durum degisiminde tazeliyor. */
  static publicRooms = new Map<string, MatchRoom>();
  /**
   * Ayni anda acik oda siniri. Her oda kendi simulasyon dongusunu tek Node
   * surecinde donduruyor; sinirsiz oda bir dolu sunucuda herkesin tick'ini
   * yavaslatirdi. `MAX_CONCURRENT_ROOMS` ile degisiyor.
   */
  static maxConcurrentRooms = readMaxConcurrentRooms(process.env.MAX_CONCURRENT_ROOMS);
  /**
   * Istemcinin secebildigi operatorler. Kilitli (gelistirme asamasindaki)
   * operatoru isteyen eski istemci reddedilmiyor, AttackLord'a cevriliyor.
   * Testler butun kadroyla calissin diye degistirilebilir; test duzenegi
   * (tests/helpers/match-room-harness.mjs) listeyi butun karakterlere acar.
   */
  static playableCharacterIds: readonly CharacterId[] = PLAYABLE_CHARACTER_IDS;

  /**
   * Katilinabilir co-op odalari. Yalnizca listede duran odalar dolasiliyor
   * (oda siniri kadar), oda basina is oyuncu sayisi kadar.
   */
  static listPublicRooms(): RoomListingSnapshot[] {
    const listings: RoomListingSnapshot[] = [];
    for (const room of MatchRoom.publicRooms.values()) {
      if (!room.hasJoinableSeat()) continue;
      const listing = room.toRoomListing();
      if (listing.playerCount > 0 || listing.started) listings.push(listing);
    }
    return listings.sort((left, right) => left.roomName.localeCompare(right.roomName, "tr"));
  }

  /** Sinira sayilan odalar: kapanmakta olanlar haric. */
  static countOpenRooms() {
    let count = 0;
    for (const room of MatchRoom.rooms.values()) {
      if (!room.abandonDisposing) count += 1;
    }
    return count;
  }

  /**
   * Yeni odaya yer ayirir; sinir doluysa once terk edilmis bir odayi
   * kapatip yerini veriyor, o da yoksa reddediyor.
   *
   * Esanli: sayim, kapatma ve kayit arasinda `await` yok; ayni anda gelen iki
   * kurulum son bos yeri birlikte alamiyor, ayni odayi iki kez de kapatamiyor
   * (kapanan oda `abandonDisposing` ile sayimdan ve adaylardan hemen cikiyor).
   */
  static claimRoomSlot(room: MatchRoom, now = Date.now()) {
    if (MatchRoom.countOpenRooms() >= MatchRoom.maxConcurrentRooms && !MatchRoom.evictAbandonedRoom(now)) {
      throw new ServerError(SERVER_FULL_ERROR_CODE, SERVER_FULL_MESSAGE);
    }
    MatchRoom.rooms.set(room.roomId, room);
  }

  /**
   * Sinir doluyken en uzun suredir terk edilmis odayi kapatir.
   *
   * Istemci mac icin hic izinli cikis yollamiyor (sekme kapatma da menuye
   * donus de izinsiz): kimsesiz odalar on dakikalik kapanma suresi boyunca
   * sinirda yer tutuyordu ve dolu sunucu yeni oyuncuyu bosuna reddediyordu.
   * Aday yalnizca gercekten kimsesiz oda: bagli istemci yok, ayrilmis koltuk
   * yok, yeniden baglanma penceresi acik oyuncu yok. Hic kimsenin girmedigi
   * yeni oda da aday degil: kurucusunun koltugu henuz ayrilmamis olabilir.
   * Bagli istemcisi ya da acik penceresi olan oda asla kapatilmiyor.
   */
  static evictAbandonedRoom(now = Date.now()) {
    // Tick henuz gormediyse (`abandonedSince` 0) simdi terk edilmis sayiliyor.
    const candidates = Array.from(MatchRoom.rooms.values())
      .filter((room) => room.isEvictable(now))
      .map((room) => ({ room, since: room.abandonedSince > 0 ? room.abandonedSince : now }))
      .sort((left, right) => left.since - right.since);
    // Kapatilamayan (henuz kurulan) oda atlaniyor, siradaki deneniyor.
    return candidates.some(({ room }) => room.disposeAbandoned("evict"));
  }

  /** `evictAbandonedRoom` icin: kimsesiz ve kimsenin donmesini beklemeyen oda. */
  private isEvictable(now: number) {
    if (this.abandonDisposing || this.clients.length > 0 || this.hasPendingSeats()) return false;
    return this.everJoined || now - this.roomCreatedAt >= FRESH_ROOM_EVICTION_GRACE_MS;
  }

  /**
   * IP basina oda kurma siniri (`/matchmake/create` ve `joinOrCreate`).
   *
   * Kimliksiz bir POST oda kuruyor ve sinirda yer tutuyordu; tek bir istemci
   * butun yerleri doldurabilirdi. Kurulum bu kapidan geciyor: Colyseus
   * eslestirme isteklerini Express'ten once kendisi aliyor (`index.ts`'teki
   * ara katman oraya hic ulasmiyor), statik `onAuth` ise `onCreate`ten once
   * cagriliyor. Katilim (`joinById`) sayilmiyor.
   */
  static roomCreateLimiter = new FixedWindowRateLimiter(ROOM_CREATE_LIMIT_PER_MINUTE).startPruning();

  static async onAuth(_token: string, _options: unknown, context?: AuthContext) {
    const request = context?.req;
    if (request && isRoomCreateRequest(request.url)) {
      const key = ipRateKey(readClientIp(request.headers, request.socket?.remoteAddress));
      if (!MatchRoom.roomCreateLimiter.hit(key)) {
        throw new ServerError(SERVER_FULL_ERROR_CODE, SERVER_FULL_MESSAGE);
      }
    }
    return true;
  }

  // Co-op oda kapasitesi oynanabilir operator sayisini gecmez: her oyuncu
  // ayri operator alsin (su an 2). Testler listeyi genisletince 4'e cikar.
  maxClients = Math.min(MAX_COOP_PLAYERS, MatchRoom.playableCharacterIds.length);
  autoDispose = false;
  private enemies = new Map<string, EnemyModel>();
  private readonly enemySpatialGrid = new SpatialGrid<EnemyModel>(128);
  private towers = new Map<string, TowerModel>();
  private projectiles = new Map<string, ProjectileModel>();
  private drones = new Map<string, DroneModel>();
  private beams = new Map<string, BeamModel>();
  /**
   * Olen iscinin hangi ana kadar sahada olmayacagi; anahtar isci kimligi.
   *
   * Kadro `ensureLogisticsWorkers` tarafindan her tick yeniden kuruluyor,
   * yani olen isciyi silmek yetmez -- bir sonraki tick geri gelirdi. Sayac
   * o yeniden kurmayi geciktiren tek sey.
   */
  private workerRespawnAt = new Map<string, number>();
  private crystalTrapUntil = new Map<string, number>();
  private crystalTrapKeys = new Set<string>();
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
  private nextHiredWorkerId = 1;
  private nextBeamId = 1;
  private nextZeynepRayId = 1;
  private nextKinWaveId = 1;
  private nextBurnZoneId = 1;
  private nextMelisCursePoolId = 1;
  private nextDamageEventId = 1;
  /**
   * Siradaki hasar bir yorunge bicaginin dogrudan temasi: kule ve dusman.
   * `updateOrbitTower` vurustan hemen once yaziyor, `damageEnemy` ilk eslesen
   * vurusta tuketiyor; o vurusun ic etkileri (kanama tiki, baska kule)
   * bayragi tasimiyor. Yalnizca istemcinin kesme sesi icin, oyuna etkisi yok.
   */
  private pendingOrbitHit?: { towerId: string; enemyId: string };
  private nextKillEventId = 1;
  private teamHealth = MAX_TEAM_HEALTH;
  private wave = 1;
  private kills = 0;
  private waveSpawned = 0;
  /** Dalganin temizlendigi an (duvar saati). 0 ise dalga henuz temiz degil. */
  private waveClearedAt = 0;
  private defenseWave = 0;
  private defenseRows = new Map<string, DefenseRow>();
  private lastDefenseSummary = new Map<string, DefenseSummary>();
  /**
   * Bu dalgada sahip basina karar payi: yalnizligin ve dizilimin kattigi
   * tahmini hasar (`estimateSynergyShare`). Savunma ozetiyle ayni dalgaya
   * bagli ve onunla birlikte, dalgada bir kez gidiyor; tick'te veri yok.
   */
  private synergyShareWave = 0;
  private readonly synergyShares = new Map<string, { isolation: number; formation: number }>();
  /**
   * Karar payi icin kule -> yalniz mi, yalnizca `update` suresince. Payin her
   * vurusta butun kuleleri taramasini onluyor. Yalnizlik yalnizca kule
   * yerlesimine bagli ve yerlesim (kur, sat, tasi) istemci mesajlariyla, yani
   * tick'ler arasinda degisiyor: tick icinde onbellek her zaman dogru. Tick
   * disindaki cagrilar (testler, mesajlar) onbellegi kullanmiyor.
   */
  private synergyIsolationCache?: Map<string, boolean>;
  /**
   * Ayni gerekce, yerlesimin kendisine bagli iki sorgu icin: kulenin yalniz
   * olup olmadigi (`isTowerIsolated`) ve sentez kulesinin bagli grubu. Ikisi de
   * yalnizca kulelerin konumuna ve tanimina bakiyor. Gec oyunda tick basina
   * yuzlerce kez soruluyor ve her biri butun kuleleri tariyor (grup aramasi
   * karesel). Yerlesim tick icinde degisirse (`markNavigationDirty`) atiliyor.
   */
  private tickLayoutCache?: { isolated: Map<TowerModel, boolean>; synthesisGroups: Map<TowerModel, TowerModel[]> };
  /**
   * Suren Debug Lazer supurmeleri: kule -> sahibi ve supurmenin oldurdugu
   * dusman. Supurme bitince "Tarama: N öldü" damgasi buradan; kayit yalnizca
   * isaretli oldurmeyle baslayan supurmede aciliyor.
   */
  private readonly debugSweepRuns = new Map<string, { ownerId: string; kills: number }>();
  /** Kombo damgalarinin tur + sahip basina hiz siniri (4 sn). */
  private readonly comboStampThrottle = new ComboStampThrottle();
  /**
   * Kosu izi: sizinti, temiz dalga serisi, oyuncu basina oldurme ve hasar,
   * MVP kule, en yuksek seri, ilk onuncu seviye.
   *
   * Dalga karnesi, kosu raporu ve istemcideki rekorlar ayni defterden
   * besleniyor; her biri kendi sayacini tutsaydi birbirini yalanlardi.
   * Oyuncular oturum kimligiyle degil yuvayla yaziliyor, o yuzden yeniden
   * baglanmada tasinacak bir sey yok.
   */
  private runLedger = new RunLedger();
  /** Kosunun kimligi; ayni rapor yeniden baglanmada gelince istemci ikinci kez kaydetmesin. */
  private runId = createRunId();
  /** Gonderilmis sonuc mesaji; yeniden baglanan oyuncu raporu buradan aliyor. */
  private matchResultPayload?: MatchResultPayload;
  private insightElapsed = 0;
  private logisticsClock = 0;
  private deliveryWaitingSince = new Map<string, number>();
  private previewRequestTimes = new Map<string, number>();
  private towerInsightCache = new WeakMap<TowerModel, { at: number; value: string }>();
  /**
   * Kule ozetlerinin tazelenme evresi.
   *
   * Ozet kule basina saniyede bir yeniden kuruluyor. Ayni anda kurulan kuleler
   * (mac basi, yeniden baglanma) hep ayni karede tazeleniyordu: olculdu, gec
   * oyunda saniyede bir ~5 ms'lik ek tick ve normalin iki kati buyuklugunde
   * (17.8 KB) bir snapshot -- pingte saniyelik bir sicrama. Ilk kayitta kuleye
   * kaydirilmis bir evre veriliyor; tazeleme sikligi ayni (saniyede bir), yuk
   * ise saniyenin karelerine yayiliyor. Yalnizca arayuz metni; oyuna etkisi yok.
   */
  private towerInsightPhaseCursor = 0;
  private waveTarget = getWaveEnemyCount(1);
  /**
   * Sampiyon plani ve dogum sirasindaki kayma.
   *
   * Hava kurali (`isFlyingWaveSpawn`) dalganin **orijinal** dogum sirasini
   * okuyor; sampiyon birkac dogumun yerine gectigi icin ondan sonraki dogumlar
   * o kadar ileri kayiyor. Kayma sampiyon dogana kadar 0, yani sampiyonsuz
   * dalgada sira `waveSpawned`in kendisi -- eski davranisin aynisi.
   */
  private waveChampionPlan?: WaveChampionPlan;
  private waveSlotOffset = 0;
  /** Bu dalganin sampiyonu dogdu mu; yaratici patlamasi sirayi atlasa da bir kez dogsun. */
  private waveChampionSpawned = false;
  /**
   * Sampiyon kurali acik mi. Yalnizca olcum icin: denge karsilastirmasi ayni
   * odayi sampiyonsuz kosturup oncesini olcebilsin diye (bkz. rapor). Oyunda
   * hep acik.
   */
  private championsEnabled = true;
  /** Bu kosuda en son devrilen sampiyonun suresi (oyun ms); damganin "onceki" sayisi. */
  private lastChampionKillMs?: number;
  /**
   * Ozel dusman tohumu: oda basina bir kez, yalnizca 2. asama ve sonrasinda
   * (ilk planda) cekiliyor. 1. asamada hic zar atilmiyor; dogum sirasi ve
   * olcum parmak izi eskisiyle bire bir ayni kaliyor.
   */
  private specialSeed?: number;
  /** Dalganin ozel dusman plani ve dalga basina tohumlu zari. */
  private waveSpecialPlan?: WaveSpecialPlan;
  private specialRandom?: () => number;
  /** Plandaki siradaki ozel dogum. */
  private waveSpecialCursor = 0;
  /** Bu dalganin karsi atagi basladi mi (dalgada en fazla bir). */
  private waveSurgeStarted = false;
  private counterSurge?: CounterSurgeModel;
  private nextCounterSurgeId = 1;
  /** Isiticinin tick ici tekrar onleyici listesi (tahsis yok). */
  private readonly heaterScratch: TowerModel[] = [];
  /** Ozel dusman yol alanlari; yapi degisince atiliyor. `null`: hedef yok. */
  private specialRouteFields = new Map<"hunter" | "eater", SpecialRouteField | null>();
  private spawnCooldownMs = 500;
  private projectileGuidanceUntil = 0;
  private projectileGuidanceX = GAME_WORLD_WIDTH / 2;
  private projectileGuidanceY = GAME_WORLD_HEIGHT / 2;
  /** Sunucu-kule cifti basina son "baglandi" bildirimi; ac-kapa bildirim yagdirmasin. */
  private readonly serverLinkNoticeAt = new Map<string, number>();
  private zeynepHasteUntil = 0;
  private zeynepHasteMultiplier = 1;
  /*
   * Acik komutu veren oyuncu (hiz / menzil / yavaslatma). Komut butun sahaya
   * isliyor ve kimin verdigi oyunda hicbir seyi degistirmiyor; yalnizca
   * co-op asistinin "kim komut verdi" sorusu icin. Daha guclu komut eskisinin
   * yerine gecince sahibi de degisiyor, yalnizca uzatan komut sahibini birakiyor.
   */
  private zeynepHasteOwnerId = "";
  private zeynepRangeOwnerId = "";
  private zeynepSlowOwnerId = "";
  private zeynepHasteTier: ZeynepCommandTier = "small";
  private zeynepRangeUntil = 0;
  private zeynepRangeMultiplier = 1;
  private zeynepRangeTier: ZeynepCommandTier = "small";
  private zeynepSlowUntil = 0;
  private zeynepSlowMultiplier = 1;
  private zeynepSlowTier: ZeynepCommandTier = "small";
  /** Kule basina son `slow:critical` yayini (duvar saati); bkz. `broadcastSlowCritical`. */
  private slowCritBroadcastAt = new Map<string, number>();
  private melisGothicNightmareUntil = 0;
  private melisGothicNightmareOwnerUntil = new Map<string, number>();
  /** Sonucu henuz belli olmayan ultiler (drone, Kabus, Sempati); bitince raporlaniyor. */
  private openUltimateReports: UltimateReport[] = [];
  /**
   * Bagisiklik kapisini gecen her vurusta artiyor. `damageEnemy` inmeyen
   * vurusu da "olmedi" diye donduruyor; ulti karnesi isabeti bununla ayiriyor.
   */
  private landedHitCount = 0;
  private sympathyUntil = 0;
  /** Sempati baglarinin gorsel kademesi: atanin ulti gucunden, kademe 1 yazilmaz. */
  private sympathyBeamTier?: TowerTier;
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
  /**
   * Ortak cikmaz sokak hafizasi.
   *
   * Bir dusman bir hucreyi cikmaz sokak olarak gordugunde buraya yaziliyor ve
   * o andan itibaren **butun** dusmanlar o hucreyi kapali sayiyor -- oraya hic
   * gitmemis olanlar da. Dusmanlar haritayi bilmiyor ama birbirlerine haber
   * veriyorlar; kesif hala kesif, yalnizca bir kez yapiliyor.
   *
   * Hafiza kendi uzerine yigiliyor: bir hucre kapandiginda komsusunun acik
   * yan sayisi duser ve o da cikmaz sokak olabilir. Boylece kor bir sokagin
   * yalnizca ucu degil tamami zamanla haritadan dusuyor ve agzina gelen
   * dusman iceri hic girmiyor.
   */
  private deadEndCells = new Set<string>();
  /**
   * Oyuncunun iscilerine kapattigi kareler.
   *
   * Cikmaz sokak hafizasindan farki: bu bir **karar**, kesif degil. Oyuncu
   * hattinin nereden gecmesini istemedigini soyluyor ve isciler o kareyi
   * gecmeyen bir yol bulmak zorunda. Yol kalmazsa isci bekler -- kendi
   * hattini kapatmak da oyuncunun hakki.
   *
   * Oyuncu basina tutuluyor: bir oyuncunun tercihi otekinin iscilerini
   * baglamaz.
   */
  private workerBannedCells = new Map<string, Set<string>>();
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
    // Yerlesim degisti: tick ici yerlesim onbellegi artik eski.
    if (this.tickLayoutCache) this.tickLayoutCache = { isolated: new Map(), synthesisGroups: new Map() };
    this.mainGateDirty = true;
    this.towerCellIndexDirty = true;
    this.edgeStructureIndexDirty = true;
    // Ozel dusmanlarin yol alani da yerlesimden; bir sonraki soruda yeniden kuruluyor.
    if (this.specialRouteFields.size > 0) this.specialRouteFields.clear();
    // Yapi degisti: kapali sanilan bir cikis acilmis olabilir. Hafizayi
    // korumak, oyuncunun actigi gecidi dusmanlarin gormemesi demek olurdu.
    this.sealedCells.clear();
    // Cikmaz sokak hafizasi da ayni sebeple: yigilarak kuruldugu icin tek bir
    // hucreyi tek tek dogrulamak yetmez, tamami yeniden kesfedilmeli.
    this.deadEndCells.clear();
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
  /**
   * Odanin asamasi. Dusman irki tumuyle buradan cikiyor.
   *
   * Irk bir donem dalga dalga donuyordu ve oyuncu dizilimini ona gore
   * kuramiyordu -- dalga arasinda kule degistirmenin yolu yok. Asama basina
   * tek irk, o secimi girmeden once alinan bir karara ceviriyor.
   */
  /**
   * Her kuleye en son **gonderilmis** tam kayit.
   *
   * Kule kaydinin 375 baytinin 286'si kareler arasinda hic degismiyor:
   * menzil, can tavani, muhimmat tavani, hedefleme kipi, performans kolu.
   * Saniyede 20 kez tekrarlandiginda bu, 40 kulelik bir sahada istemci
   * basina 223 KB/sn saf tekrar demek. Burasi neyin gittigini hatirliyor ki
   * yalnizca degiseni gonderelim.
   *
   * Yalnizca **gonderim basarili olunca** guncelleniyor. Taban gonderilmemis
   * bir kareye kayarsa istemcinin elindeki kayit bir daha asla
   * tamamlanmazdi.
   */
  private lastSentTowerWire = new Map<string, Record<string, unknown>>();
  /**
   * Her dusmana en son gonderilen tam kayit.
   *
   * Kuleye gore daha az sabit alan var: 132 baytin 50'si degismiyor
   * (kimlik, zirh, lanet yuku, suphe yigini), gerisi -- konum, yol mesafesi,
   * can, kalkan -- her karede degisiyor. Yine de 18. dalgada dusmanlar telin
   * %63'unu kapladigi icin bu %38 en buyuk tek kalemden kesiliyor.
   */
  private lastSentEnemyWire = new Map<string, Record<string, unknown>>();
  /**
   * Oyuncu ve isci kayitlari da delta.
   *
   * Olculdu (dalga 20, dort oyuncu, 78 kule): oyuncu bolumu karenin en buyuk
   * kalemiydi -- 15 KB'nin 5.8 KB'i, cogu sahip olunan esya ve kart listeleri
   * -- ve neredeyse hic degismiyor. Isciler 2.8 KB; konum disinda sabit.
   */
  private lastSentPlayerWire = new Map<string, Record<string, unknown>>();
  private lastSentDroneWire = new Map<string, Record<string, unknown>>();
  /**
   * Bir sonraki kare herkese delta degil tam gitmeli.
   *
   * Delta yalnizca istemci onceki kareyi aldiysa dogru. Tek bir istemcinin
   * eksigi (tikanma, katilma, kopma, tam kayit istegi) istemci basina
   * `wireSyncedSessionIds` ile izleniyor; bu bayrak yalnizca tabanin kendisi
   * guvenilmez oldugunda kalkiyor (ilk kare, yarim kalan tick).
   */
  private towerWireNeedsFullResend = true;
  /**
   * Elindeki kayit tabanla ayni olan istemciler; delta yalnizca onlara gidiyor.
   *
   * Bayrak bir donem tek ve ortakti: tikanan istemci atlaninca kalkiyor, ama
   * kareyi baska biri aldiysa taban ilerlerken siliniyordu. Atlanan istemci
   * bir daha tam kayit almiyor, eksik alanlari ekranda eski degerleriyle
   * kaliyordu. Kume istemci basina: atlanan, kopan ya da tam kayit isteyen
   * buradan dusuyor ve bir sonraki karede yalnizca **o** tam kayit aliyor.
   */
  private wireSyncedSessionIds = new Set<string>();
  /**
   * Oyuncu ve isci deltasini anlayan oturumlar (`wireDelta` secenegi).
   *
   * Digerleri eski istemci: o iki bolumu her karede tam aliyor, tam
   * olarak eski surumdeki gibi. Oturuma bagli: yeniden baglanma ayni oturum
   * kimligiyle geliyor ve secenek tasimiyor, bayrak ilk girisinden kaliyor.
   */
  private wireDeltaSessionIds = new Set<string>();
  /** Yeniden baglanma penceresi acik oturumlar: yuvalari onlara ayrilmis. */
  private reconnectingSessionIds = new Set<string>();
  /**
   * Acik pencerelerin Colyseus beklemesi. Yeniden yuklenen sayfa anahtarini
   * kaybettiyse ayni oyuncu listeden yeni bir oturumla geliyor; o zaman
   * bekleme burada reddedilip yuva yeni oturuma veriliyor.
   */
  private pendingReconnections = new Map<string, ReturnType<Room["allowReconnection"]>>();
  /** Kovayi asan "son deger kazanir" mesajlari; anahtar tur, oturum ve hedef. */
  private latestMessageStash = new Map<string, { sessionId: string; apply: () => void }>();
  /**
   * Penceresi kapanan ya da kendi istegiyle cikan oyuncular.
   *
   * Kayitlari duruyor (kuleleri, altinlari; yuva geri donuse acik) ama
   * takimin olcegine artik girmiyorlar: dalga boyu, dusman cani ve tecrube
   * payi yalnizca kalanlarla hesaplaniyor. Yuva devralininca kume temizleniyor.
   */
  private departedSessionIds = new Set<string>();
  /** Istemci basina mesaj kovalari; anahtar mesaj turu, `*` toplam. */
  private messageBuckets = new Map<string, Map<string, { tokens: number; at: number }>>();
  /** Hata gunlugu kisici: yer -> son yazilan an ve arada yutulan sayi. */
  private roomErrorLog = new Map<string, { at: number; suppressed: number }>();
  /** Ust uste basarisiz tick sayisi ve simulasyonun bekleyecegi an. */
  private tickFailures = 0;
  private tickBackoffUntil = 0;
  /** Terk edilmis oda denetimi; yalnizca gercek oda (`onCreate`) icin acik. */
  private abandonCheckEnabled = false;
  private abandonedSince = 0;
  private abandonDisposing = false;
  private stage = 1;
  /**
   * Etki basina biriken is: hasar ya da saniye.
   *
   * Oda genelinde tutuluyor, oyuncu basina degil. Yavaslatma ve durdurma
   * bircok kaynagin en gucluse birakan bir zincirinden cikiyor; o zincirde
   * "kimin yavaslattigi" diye tek bir cevap yok. Hasarda cevap var ama
   * ikisini ayri kapsamda tutmak paneli yalanci yapardi -- bir sekme
   * takimin, otekisi senin olurdu.
   */
  private effectStats = new Map<string, number>();

  private setupPhase = true;
  /**
   * Kacinci kurulum arasindayiz.
   *
   * Her kurulum evresi acildiginda artiyor. Dalga numarasini kullanmak
   * yeterli gorunuyor ama degil: yaratici mod kurulum evresini dalga
   * numarasina dokunmadan kapatip acabiliyor, ve o durumda onceki aranin
   * kuleleri yeni arada geri alinabilir hale gelirdi.
   */
  private setupSession = 1;
  /**
   * Yaratici mod: bedava kule, serbest seviye, kart ve esya anahtarlari.
   *
   * Yalnizca dogrudan baslatilan tek kisilik odada aciliyor. Lobiden gecen bir
   * oda `autoStart` almadigi icin bayragi hicbir zaman alamaz.
   */
  private creativeMode = false;
  /** Dogrudan baslatilan tek kisilik oda (`autoStart`): ozel, listede yok, yabanci giremiyor. */
  private soloRoom = false;
  /**
   * Mac basladiktan sonra kendi istegiyle cikan oturumlar (menuye donus).
   * Odadaki her oyuncu kaydi boyle ciktiysa oda beklemeden kapaniyor.
   */
  private consentedLeaveSessionIds = new Set<string>();
  /**
   * Solo odanin sahip sirrinin ozeti (`ownerSecret` kurulum secenegi).
   *
   * Oda kimligi HUD'da gorunuyor (#oda). Pencere kapandiktan sonra kimlikle
   * donus eskiden ad ve operatorle eslesiyordu: kimligi bilen biri ayni
   * operatoru secip baskasinin solo ya da yaratici kosusunu devralabiliyordu.
   * Sir yalnizca bu alanda; snapshot'a, listeye ya da lobi durumuna girmiyor.
   */
  private soloOwnerSecretHash?: Buffer;
  /** Odaya en az bir istemci kabul edildi mi; hic girilmemis yeni oda yerinden edilmiyor. */
  private everJoined = false;
  /** Odanin kuruldugu an (`onCreate`). */
  private roomCreatedAt = Date.now();
  private matchResult?: "victory" | "defeat";
  private setupReadyPlayerIds = new Set<string>();
  private pendingCardChoices = new Map<string, CardDefinition[]>();
  private shopPlacementCharges = new Map<string, { bariyer: number; "ziftli-zemin": number }>();
  private tarredCells = new Set<string>();
  private debrisCells = new Map<string, number>();
  private autoStartOnFirstJoin = false;
  private serverLinkWaveAgeCache = new Map<string, number>();
  private lastSnapshotBroadcastAt = 0;
  /** Duran tahtada en son gonderilen snapshotin icerigi ve ani. */
  private lastIdleSnapshotSignature = "";
  private lastIdleSnapshotSentAt = 0;
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
    this.roomCreatedAt = Date.now();
    try {
      MatchRoom.claimRoomSlot(this, this.roomCreatedAt);
    } catch (error) {
      this.releaseRejectedRoom();
      throw error;
    }
    try {
      this.setupRoom(options);
    } catch (error) {
      // Kurulamayan oda sinirda yer tutmasin.
      MatchRoom.rooms.delete(this.roomId);
      MatchRoom.publicRooms.delete(this.roomId);
      this.releaseRejectedRoom();
      throw error;
    }
  }

  /**
   * Reddedilen odanin Colyseus zamanlayicilari.
   *
   * Colyseus yama araligini ve saati `onCreate`ten once baslatiyor; `onCreate`
   * reddedince odayi birakiyor ama aralik calismaya devam ediyordu. Her
   * reddedilen kurulum (dolu sunucu) bir aralik sizdirmasin.
   */
  private releaseRejectedRoom() {
    try {
      this.setSimulationInterval(undefined);
      this.setPatchRate(null);
      this.clock.clear();
      this.clock.stop();
    } catch (error) {
      this.reportRoomError("onCreate:release", error);
    }
  }

  private setupRoom(options: JoinOptions) {
    this.setState(new MatchState());
    this.lobbyRoomName = this.getRoomName(options.roomName);
    this.autoStartOnFirstJoin = options.autoStart === true;
    // Dogrudan baslatilan oda (solo, yaratici, hizli baslat) tek kisilik ve
    // ozel: listede yok, Colyseus `join`/`joinOrCreate` ona bakmiyor, kimligi
    // bilen yabanci da giremiyor (`joinStartedMatch`). Ayni sunucuda birden
    // fazla mac surdugu icin baskasinin solo macina dusmek mumkun olmamali.
    this.soloRoom = options.autoStart === true;
    // Yaratici bayragi lobi yoluna sizmasin diye dogrudan baslatmaya bagli.
    this.creativeMode = options.creative === true && options.autoStart === true;
    // Yaratici oda tek kisilik ve oyle kaliyor: ikinci oyuncu girseydi
    // `getCreativePlayer` kapisi sahibinin komutlarini da kapatirdi. Oda
    // listede gorunmuyor (`hasJoinableSeat`) ve tek koltuk sahibinin.
    if (this.soloRoom) {
      this.maxClients = 1;
      this.hideFromMatchmaking();
      // Sirsiz kurulan solo odaya (eski istemci) pencereden sonra donus yok.
      this.soloOwnerSecretHash = hashOwnerSecret(options.ownerSecret);
    }
    // Gecersiz kimlik ilk asamaya duser; eksik veri odanin kurulmasini
    // engellememeli.
    this.stage = getStage(options.stage).id;
    const baseMap = normalizeMapData(options.mapData);
    this.mapScale = this.getMapScaleChoice(options.mapScale ?? baseMap.scale);
    this.activeMap = scaleEditableMap(baseMap, this.mapScale);
    this.activePaths = buildRuntimePaths(this.activeMap);
    this.markNavigationDirty();
    this.planWaveSpawns(this.wave);
    this.abandonCheckEnabled = true;
    this.abandonedSince = Date.now();
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    // Her kayit `onMessage` uzerinden geciyor ve orada sarmalaniyor: govde
    // `MESSAGE_RULES`e gore duzeltiliyor, hiz siniri ve asama soruluyor,
    // isleyicinin firlattigi hata yakalanip gunluge yaziliyor.
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

    this.onMessage("toggleWallGate", (client, message: ToggleWallGateMessage) => this.toggleWallGate(client, message));

    this.onMessage("toggleAmmoLogistics", (client, message: ToggleAmmoLogisticsMessage) => this.toggleAmmoLogistics(client, message));
    this.onMessage("tower:priority", (client, message) => this.setLogisticsPriority(client, message));
    this.onMessage("tower:preview", (client, message) => this.sendTowerPreview(client, message));
    this.onMessage("tower:stats", (client, message) => this.sendTowerStats(client, message));
    this.onMessage("defense:request", (client) => {
      const summary = this.lastDefenseSummary.get(client.sessionId);
      if (summary) client.send("defense:summary", summary);
    });
    this.onMessage("setTowerPerformance", (client, message: SetTowerPerformanceMessage) => this.setTowerPerformance(client, message));

    this.onMessage("latency:ping", (client, message: PingMessage) => {
      const serverAt = Date.now();
      const processingStartedAt = performance.now();
      client.send("latency:pong", {
        sentAt: isFiniteNumber(message.sentAt) ? message.sentAt : Date.now(),
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
    this.onMessage("snapshot:requestFull", (client) => {
      // Statikleri isteyen istemcinin dinamik tarafi da eksik olabilir. Tam
      // kayit yalnizca ona: isteyen herkese tam kare yollatamasin.
      this.markTowerWireStale(client.sessionId);
      this.sendFullStaticSnapshot(client);
    });
    this.onMessage("card:sync", (client) => this.sendPendingCardChoices(client));
    this.onMessage("run:sync", (client) => this.sendRunState(client));
    this.onMessage("shop:buy", (client, message: BuyShopItemMessage) => this.buyShopItem(client, message));
    this.onMessage("shop:reroll", (client) => this.rerollShop(client));
    this.onMessage("structure:repair", (client, message: RepairStructureMessage) => this.repairStructure(client, message));
    this.onMessage("worker:hire", (client, message: HireWorkerMessage) => this.hireWorker(client, message));
    this.onMessage("worker:specialization", (client, message: ChooseWorkerSpecializationMessage) => this.chooseWorkerSpecialization(client, message));
    this.onMessage("worker:skill", (client, message: ChooseWorkerSkillMessage) => this.chooseWorkerSkill(client, message));
    this.onMessage("worker:development", (client, message: WorkerDevelopmentMessage) => this.unlockWorkerDevelopment(client, message));
    this.onMessage("ultimate:upgrade", (client) => this.upgradeUltimatePower(client));
    this.onMessage("ucube:choose", (client, message: ChooseUcubePerkMessage) => this.chooseUcubePerk(client, message));
    this.onMessage("melis:stance", (client, message: SetMelisStanceMessage) => this.setMelisStance(client, message));
    this.onMessage("tower:targeting", (client, message: SetTowerTargetingMessage) => this.setTowerTargeting(client, message));
    this.onMessage("shop:place", (client, message: PlaceShopMapItemMessage) => this.placeShopMapItem(client, message));
    this.onMessage("worker:banCell", (client, message: WorkerBanCellMessage) => this.toggleWorkerBannedCell(client, message));

    this.onMessage("creative:sync", (client) => {
      if (!this.getCreativePlayer(client)) return;
      this.sendCreativeLoadout(client);
    });
    this.onMessage("creative:tower", (client, message: CreativeTowerMessage) => this.creativePlaceTower(client, message));
    this.onMessage("creative:level", (client, message: CreativeLevelMessage) => this.creativeSetTowerLevel(client, message));
    this.onMessage("creative:card", (client, message: CreativeCardMessage) => this.creativeToggleCard(client, message));
    this.onMessage("creative:item", (client, message: CreativeItemMessage) => this.creativeToggleItem(client, message));
    this.onMessage("creative:wave", (client, message: CreativeWaveMessage) => this.creativeSetWave(client, message));
    this.onMessage("creative:spawn", (client, message: CreativeSpawnMessage) => this.creativeSpawnEnemies(client, message));

    this.syncRoomRegistry();
  }

  /**
   * Butun mesaj kayitlarinin tek kapisi.
   *
   * Colyseus'un kendi `onMessage`i sarmalaniyor ki unutulan bir kayit olmasin:
   * bugun yazilan da yarin eklenen de ayni yoldan geciyor. Sira onemli --
   * once hiz siniri (ucuz), sonra asama ve yaratici bayragi (govde okunmadan),
   * en son govdenin duzeltilmesi. Isleyicinin hatasi burada yakalaniyor; tek
   * bir bozuk mesaj odayi da sureci de dusurmuyor.
   */
  onMessage<T = any>(messageType: "*", callback: (client: Client, type: string | number, message: T) => void): any;
  onMessage<T = any>(messageType: string | number, callback: (client: Client, message: T) => void, validate?: (message: unknown) => T): any;
  onMessage(messageType: string | number, callback: (...args: any[]) => void, validate?: (message: unknown) => unknown) {
    if (messageType === "*") {
      return super.onMessage("*", callback as (client: Client, type: string | number, message: unknown) => void);
    }
    const type = String(messageType);
    const rule = MESSAGE_RULES[type];
    const guarded = (client: Client, raw: unknown) => {
      try {
        const allowed = this.consumeMessageToken(client.sessionId, type, rule?.rate ?? MESSAGE_RATE_DEFAULT);
        if (!allowed && !rule?.latestWinsBy) return;
        if (rule?.phase === "lobby" && this.gameStarted) return;
        if (rule?.phase === "match" && !this.gameStarted) return;
        if (rule?.creative && !this.creativeMode) return;
        // Kurali olmayan tur alan tasimiyor: yeni bir mesaj tabloya yazilmadan
        // govdesini okuyamaz. Test bunu her kayitli tur icin ayrica soruyor.
        const message = sanitizeMessagePayload(raw, rule?.fields ?? {});
        if (rule?.latestWinsBy) {
          const key = `${type}|${client.sessionId}|${String(message[rule.latestWinsBy] ?? "")}`;
          // Kabul edilen yeni deger bekleyen eskisini geciyor; sinirda kalan
          // ise eskisinin yerine yaziliyor. Ayni hedef icin tek kayit var,
          // yani bekleyen is istemci basina hedef sayisiyla sinirli.
          this.latestMessageStash.delete(key);
          if (!allowed) {
            this.latestMessageStash.set(key, { sessionId: client.sessionId, apply: () => callback(client, message) });
            return;
          }
        }
        callback(client, message);
      } catch (error) {
        this.reportRoomError(`onMessage:${type}`, error);
      }
    };
    return super.onMessage(messageType, guarded, validate);
  }

  /**
   * Colyseus'un son savunma hatti: mesaj, tick, zamanlayici ve yasam dongusu
   * hatalari sureci kapatmak yerine buraya geliyor. Mesaj ve tick zaten kendi
   * kapilarinda yakalaniyor; burasi onlarin kacirdigi icin.
   */
  onUncaughtException(error: unknown, methodName: string) {
    // Colyseus asil hatayi kendi istisna sinifina sariyor; yigin izi
    // sarmalayicinin degil asil hatanin olmali.
    const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
    // Dolu oda, bitmis mac, dolu sunucu: bilinen redler. Colyseus onlari
    // istemciye zaten donduruyor; hata gunlugune girmiyorlar.
    if (cause instanceof Error && EXPECTED_ROOM_REJECTIONS.has(cause.message)) return;
    this.reportRoomError(methodName, cause);
  }

  /** Hata gunlugu; ayni yerden gelen hata en fazla on saniyede bir yaziliyor. */
  private reportRoomError(context: string, error: unknown) {
    const now = Date.now();
    const entry = this.roomErrorLog.get(context);
    if (entry && now - entry.at < ROOM_ERROR_LOG_INTERVAL_MS) {
      entry.suppressed += 1;
      return;
    }
    const suppressed = entry?.suppressed ?? 0;
    this.roomErrorLog.set(context, { at: now, suppressed: 0 });
    const cause = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[MatchRoom ${this.roomId}] ${context} hatasi${suppressed ? ` (+${suppressed} yutuldu)` : ""}: ${cause}`);
  }

  /**
   * Jeton kovasi: tur basina ve istemci basina toplam.
   *
   * Asilan mesaj sessizce dusuyor. Kova once doluyor, sonra harcaniyor;
   * toplam kova yalnizca tur kovasi izin verdiyse harcaniyor ki reddedilen
   * bir tur digerlerinin payini yemesin.
   */
  private consumeMessageToken(sessionId: string, type: string, rate: MessageRate) {
    const now = Date.now();
    let buckets = this.messageBuckets.get(sessionId);
    if (!buckets) {
      buckets = new Map();
      this.messageBuckets.set(sessionId, buckets);
    }
    const refill = (key: string, limit: MessageRate) => {
      const bucket = buckets!.get(key) ?? { tokens: limit.burst, at: now };
      bucket.tokens = Math.min(limit.burst, bucket.tokens + Math.max(0, now - bucket.at) / 1000 * limit.perSecond);
      bucket.at = now;
      buckets!.set(key, bucket);
      return bucket;
    };
    const typed = refill(type, rate);
    const total = refill("*", MESSAGE_RATE_TOTAL);
    if (typed.tokens < 1 || total.tokens < 1) return false;
    typed.tokens -= 1;
    total.tokens -= 1;
    return true;
  }

  /** Oturumun mesaj kovalari ve tel durumu; oturum odadan tamamen cikinca. */
  private forgetSession(sessionId: string) {
    this.messageBuckets.delete(sessionId);
    this.wireSyncedSessionIds.delete(sessionId);
    this.wireDeltaSessionIds.delete(sessionId);
    for (const [key, entry] of this.latestMessageStash) {
      if (entry.sessionId === sessionId) this.latestMessageStash.delete(key);
    }
  }

  /** Kovayi asmis "son deger kazanir" mesajlarini uygular; her tick bir kez. */
  private flushLatestMessages() {
    if (this.latestMessageStash.size === 0) return;
    const entries = Array.from(this.latestMessageStash.values());
    this.latestMessageStash.clear();
    for (const entry of entries) {
      try {
        entry.apply();
      } catch (error) {
        this.reportRoomError("onMessage:latest", error);
      }
    }
  }

  /** Acik yeniden baglanma penceresi ya da ayrilmis koltuk var mi. */
  private hasPendingSeats() {
    return this.reconnectingSessionIds.size > 0 || Object.keys(this.reservedSeats ?? {}).length > 0;
  }

  /**
   * Baslamis macin her oyuncusu kendi istegiyle cikti (`onLeave` consented,
   * menuye donus). Kopma (pencere dolsa da) sayilmiyor: o oyuncu solo odaya
   * kimligiyle, co-op odaya listeden donebiliyor.
   *
   * Solo oda icin sahibi birakti demek. Co-op icin de dogru: herkes menuye
   * dondu, kimse geri gelmeyecek; listedeki yabanci bos koltuga girseydi
   * terk edilmis bir kosuyu devralirdi. Yuvayi devralan yeni oturum kumede
   * olmadigi icin oda yeniden dolunca bu yol kapaniyor.
   */
  private isLeftByEveryone() {
    if (!this.gameStarted || this.state.players.size === 0) return false;
    for (const sessionId of this.state.players.keys()) {
      if (!this.consentedLeaveSessionIds.has(sessionId)) return false;
    }
    return true;
  }

  /**
   * Odayi Colyseus eslestirmesinden gizler: `join`/`joinOrCreate` ozel odaya
   * hic bakmiyor. Kimligi bilenin `joinById`si ise `joinStartedMatch`te
   * duruyor. Test duzeneklerinde Colyseus kaydi (`listing`) yok.
   */
  private hideFromMatchmaking() {
    if (!this.listing) return;
    void Promise.resolve(this.setPrivate(true)).catch((error) => this.reportRoomError("setPrivate", error));
  }

  onJoin(client: Client, rawOptions: JoinOptions) {
    // Katilim secenekleri de istemciden: sekli tutmayan alan yok sayiliyor.
    const options: JoinOptions = typeof rawOptions === "object" && rawOptions !== null ? rawOptions : {};
    this.admitClient(client, options);
    // Buraya yalnizca kabul edilen giris geliyor; red firlatiyor ve oturum
    // hic kaydedilmiyor.
    this.everJoined = true;
    if (typeof options.wireDelta === "number" && options.wireDelta >= WIRE_DELTA_PROTOCOL) {
      this.wireDeltaSessionIds.add(client.sessionId);
    } else {
      this.wireDeltaSessionIds.delete(client.sessionId);
    }
  }

  private admitClient(client: Client, options: JoinOptions) {
    if (this.gameStarted) {
      this.joinStartedMatch(client, options);
      return;
    }

    const player = new Player();
    player.name = getJoinPlayerName(options.playerName) || "Oyuncu";
    player.characterId = this.getAvailableCharacterId(options.characterId);
    player.ready = false;
    player.connected = true;
    player.gold = getPlayerStartGold(player.characterId);
    player.slot = this.getFreePlayerSlot();
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
    // Kopan istemcinin elindeki kayit artik tabanla ayni degil; geri donerse
    // (ayni oturumla da olsa) tam kayit almali.
    this.wireSyncedSessionIds.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (this.gameStarted && player) {
      player.connected = false;
      // Oyuncu menuye dondu: herkes boyle ciktiysa oda beklemeden kapanacak
      // (`checkAbandoned`, `isLeftByEveryone`).
      if (consented) this.consentedLeaveSessionIds.add(client.sessionId);

      if (!consented) {
        // Pencere boyunca yuva bu oturumun: yeni gelen onu devralamaz.
        this.reconnectingSessionIds.add(client.sessionId);
        this.broadcastLobbyState();
        try {
          const reconnection = this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
          this.pendingReconnections.set(client.sessionId, reconnection);
          const reconnectedClient = await reconnection;
          this.pendingReconnections.delete(client.sessionId);
          this.reconnectingSessionIds.delete(client.sessionId);
          player.connected = true;
          this.sendMatchResumeState(reconnectedClient);
          this.broadcastLobbyState();
          return;
        } catch {
          // Pencere kapandi ya da yuva ayni oyuncunun yeni oturumuna verildi
          // (`reclaimReconnectingSlot`). Ilkinde yuva geri donuse acik.
          this.pendingReconnections.delete(client.sessionId);
          this.reconnectingSessionIds.delete(client.sessionId);
        }
      }

      // Kayit hala bu oturumdaysa oyuncu ayrildi: takimin olcegine artik girmiyor.
      if (this.state.players.get(client.sessionId) === player) {
        this.departedSessionIds.add(client.sessionId);
      }
      this.forgetSession(client.sessionId);
      this.broadcastLobbyState();
      this.tryFinishSetupPhase();
      return;
    }

    this.forgetSession(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.hostSessionId === client.sessionId) {
      this.hostSessionId = this.state.players.keys().next().value ?? "";
    }
    this.broadcastLobbyState();
  }

  /**
   * Takimin olcegine giren oyuncu sayisi: ayrilanlar haric.
   *
   * Penceresi suren oyuncu sayiliyor -- birkac saniye icinde donmesi bekleniyor
   * ve dalga ortasinda olcegi oynatmak bir sey kazandirmaz. En az bir: oda hic
   * kimsesiz kalsa da dalga formulleri tek oyuncu olcegine dussun.
   */
  private getActivePlayerCount() {
    let count = 0;
    for (const sessionId of this.state.players.keys()) {
      if (!this.departedSessionIds.has(sessionId)) count += 1;
    }
    return Math.max(1, count);
  }

  private joinStartedMatch(client: Client, options: JoinOptions) {
    // Bitmis maca giris yok. Rapor ve kayit o kosuyu oynayanlarin: yeni gelen
    // bitmis bir kosunun raporunu kendi rekoru diye yazardi, kopan birinin
    // yuvasini devralan da onun kosusunu ve destesini miras alirdi. Kopan
    // oyuncunun kendisi yeniden baglanmayla (`allowReconnection`) donuyor,
    // o yol buraya ugramiyor.
    if (this.matchResult) {
      throw new Error(SERVER_TEXT["room.matchOver"]);
    }

    // Sayfasi yenilenen oyuncu once kendi (penceresi suren) yuvasina.
    if (this.reclaimReconnectingSlot(client, options)) {
      return;
    }

    // Devralinabilen yuva yalnizca penceresi kapanmis olan. Pencere acikken
    // yuvayi yeni gelene vermek, kulesini ve altinini ona vermek demekti;
    // geri donen asil oyuncu da yuvasiz bir hayalet olarak kaliyordu.
    // Ayni karakteri secmis olan once: listeden geri donen oyuncu kendi
    // yuvasini bulsun. Tek kisilik odada yuva yalnizca sahibinin: kurulumdaki
    // sirri gosteren (`isSoloOwner`). Ad ve operator yetmiyor -- oda kimligi
    // HUD'da yaziyor; kimligi bilen yabanci "Oda dolu." aliyor.
    const soloOwner = this.soloRoom && this.isSoloOwner(options);
    const takeoverCandidates = Array.from(this.state.players.entries())
      .filter(([sessionId, player]) => !player.connected && !this.reconnectingSessionIds.has(sessionId))
      .filter(() => !this.soloRoom || soloOwner);
    const disconnectedEntry = takeoverCandidates.find(([, player]) => player.characterId === options.characterId)
      ?? takeoverCandidates[0];
    if (disconnectedEntry) {
      const [previousSessionId, player] = disconnectedEntry;
      this.transferPlayerSession(previousSessionId, client.sessionId, player, getJoinPlayerName(options.playerName));
      this.sendMatchResumeState(client);
      this.syncRoomRegistry();
      return;
    }

    if (this.state.players.size >= this.maxClients) {
      throw new Error(SERVER_TEXT["room.full"]);
    }

    const player = new Player();
    player.name = getJoinPlayerName(options.playerName) || "Oyuncu";
    player.characterId = this.getAvailableCharacterId(options.characterId);
    player.ready = true;
    player.connected = true;
    player.gold = getPlayerStartGold(player.characterId);
    player.slot = this.getFreePlayerSlot();
    this.initializeMelisSpectrum(player);
    this.state.players.set(client.sessionId, player);
    this.sendLobbyState(client);
    client.send("match:map", this.activeMap);
    client.send("lobby:started", { roomId: this.roomId });
    this.syncRoomRegistry();
  }

  /**
   * Penceresi suren yuvayi ayni oyuncunun yeni oturumuna verir.
   *
   * Sayfasi yenilenen oyuncunun elinde yeniden baglanma anahtari kalmayabilir;
   * listeden yeni bir oturumla geliyor. Ayni operator ve ayni adla gelen
   * kendi yuvasini aliyor: Colyseus beklemesi reddediliyor, eski oturumun
   * `onLeave`i yuvanin el degistirdigini gorup onu ayrilmis saymiyor.
   * Farkli adla gelen pencere boyunca yuvaya dokunamiyor.
   */
  /**
   * Gelen, solo odayi kuranin sirrini mi gosteriyor. Ozetler sabit zamanda
   * karsilastiriliyor; sirsiz kurulan odada (eski istemci) kimse sahip degil.
   */
  private isSoloOwner(options: JoinOptions) {
    const expected = this.soloOwnerSecretHash;
    const given = hashOwnerSecret(options.ownerSecret);
    return Boolean(expected && given && timingSafeEqual(expected, given));
  }

  private reclaimReconnectingSlot(client: Client, options: JoinOptions) {
    const name = getJoinPlayerName(options.playerName);
    if (!name) return false;
    // Solo odada ad ve operator yetmiyor; sahip sirri sart (`joinStartedMatch`).
    if (this.soloRoom && !this.isSoloOwner(options)) return false;
    const entry = Array.from(this.state.players.entries()).find(([sessionId, player]) =>
      this.reconnectingSessionIds.has(sessionId) && !player.connected
      && player.characterId === options.characterId && player.name === name);
    if (!entry) return false;
    const [previousSessionId, player] = entry;
    const reconnection = this.pendingReconnections.get(previousSessionId);
    this.pendingReconnections.delete(previousSessionId);
    this.reconnectingSessionIds.delete(previousSessionId);
    // Colyseus pencere zamanlayicisini reddedilen beklemede temizlemiyor.
    const timeout = this.reservedSeatTimeouts?.[previousSessionId];
    if (timeout) clearTimeout(timeout);
    this.transferPlayerSession(previousSessionId, client.sessionId, player, name);
    // Reddedilmeyen bekleme de zararsiz: pencere dolunca eski `onLeave`
    // yuvanin el degistirdigini goruyor ve dokunmuyor.
    if (typeof reconnection?.reject === "function") reconnection.reject(new Error("Yuva yeni oturuma devredildi."));
    this.sendMatchResumeState(client);
    this.syncRoomRegistry();
    return true;
  }

  private transferPlayerSession(previousSessionId: string, nextSessionId: string, player: Player, playerName?: string) {
    this.state.players.delete(previousSessionId);
    player.connected = true;
    player.name = getJoinPlayerName(playerName) || player.name;
    this.state.players.set(nextSessionId, player);
    // Yuvayi devralan oturum takimin olcegine yeniden giriyor.
    this.departedSessionIds.delete(previousSessionId);
    this.reconnectingSessionIds.delete(previousSessionId);
    this.consentedLeaveSessionIds.delete(previousSessionId);
    this.forgetSession(previousSessionId);
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

    // Lojistik iscilerinin kimligi sahibin oturumunu tasiyor
    // (`logistics-<oturum>-<rol>`). Yalnizca sahibi degistirmek yetmiyordu:
    // `ensureLogisticsWorkers` yeni anahtarla isciyi bulamayip tam bir kadro
    // daha kuruyordu ve her devralmada isci sayisi katlaniyordu. Isci yeni
    // anahtara tasiniyor, yuku ve konumu korunuyor; olum sayaci da onunla.
    const previousWorkerPrefix = `logistics-${previousSessionId}-`;
    for (const [droneId, drone] of Array.from(this.drones.entries())) {
      if (drone.ownerId !== previousSessionId) continue;
      drone.ownerId = nextSessionId;
      if (!droneId.startsWith(previousWorkerPrefix)) continue;
      const nextId = `logistics-${nextSessionId}-${droneId.slice(previousWorkerPrefix.length)}`;
      this.drones.delete(droneId);
      drone.id = nextId;
      this.drones.set(nextId, drone);
    }
    for (const [workerId, respawnAt] of Array.from(this.workerRespawnAt.entries())) {
      if (!workerId.startsWith(previousWorkerPrefix)) continue;
      this.workerRespawnAt.delete(workerId);
      this.workerRespawnAt.set(`logistics-${nextSessionId}-${workerId.slice(previousWorkerPrefix.length)}`, respawnAt);
    }
    this.transferMapKey(this.workerBannedCells, previousSessionId, nextSessionId);
    // Acik Zeynep komutunun asisti yeni oturumun yuvasina yazilsin.
    if (this.zeynepHasteOwnerId === previousSessionId) this.zeynepHasteOwnerId = nextSessionId;
    if (this.zeynepRangeOwnerId === previousSessionId) this.zeynepRangeOwnerId = nextSessionId;
    if (this.zeynepSlowOwnerId === previousSessionId) this.zeynepSlowOwnerId = nextSessionId;
    // Dusmandaki durumlarin ve soguma yavaslatmasinin kaynagi yeni oturuma:
    // yoksa yeniden baglanan oyuncunun isaret / yavaslatma / donma asisti
    // eski kimlige yaziliyor ve yuvasi bulunamadigi icin kayboluyordu.
    for (const enemy of this.enemies.values()) {
      for (const state of Object.values(enemy.statusEffects)) {
        if (state?.sourceOwnerId === previousSessionId) state.sourceOwnerId = nextSessionId;
      }
      if (enemy.coolantSlowOwnerId === previousSessionId) enemy.coolantSlowOwnerId = nextSessionId;
      // Melis'in dusmana yazdigi sahipler: cevrilmis, olumsuz ve lanetli
      // dusmanin oldurmesi bu kimlikle geliyor; eskisinde kalirsa altin ve
      // oldurme kaydi kayboluyordu.
      if (enemy.melisWhisperTurnedOwnerId === previousSessionId) enemy.melisWhisperTurnedOwnerId = nextSessionId;
      if (enemy.melisUndeadOwnerId === previousSessionId) enemy.melisUndeadOwnerId = nextSessionId;
      if (enemy.melisCurseOwnerId === previousSessionId) enemy.melisCurseOwnerId = nextSessionId;
      for (const key in enemy.slowSpeedFloors ?? {}) {
        const floor = enemy.slowSpeedFloors![key];
        if (floor.ownerId === previousSessionId) floor.ownerId = nextSessionId;
      }
    }
    // Havadaki drone'larin karnesi yeni oturuma gitmeli; eskisine giden rapor kaybolurdu.
    for (const report of this.openUltimateReports) {
      if (report.ownerId === previousSessionId) {
        report.ownerId = nextSessionId;
      }
    }

    this.transferMapKey(this.playerKillStreakTimes, previousSessionId, nextSessionId);
    this.transferMapKey(this.playerKillStreakLocks, previousSessionId, nextSessionId);
    this.transferMapKey(this.melisFavoriteTowerIds, previousSessionId, nextSessionId);
    this.transferMapKey(this.melisGothicNightmareOwnerUntil, previousSessionId, nextSessionId);
    this.transferMapKey(this.pendingCardChoices, previousSessionId, nextSessionId);
    this.transferMapKey(this.lastDefenseSummary, previousSessionId, nextSessionId);
    for (const row of this.defenseRows.values()) if (row.ownerId === previousSessionId) row.ownerId = nextSessionId;
    // Dalganin karar payi da yeni oturumun ozetine gitsin.
    this.transferMapKey(this.synergyShares, previousSessionId, nextSessionId);
    for (const run of this.debugSweepRuns.values()) if (run.ownerId === previousSessionId) run.ownerId = nextSessionId;
    this.transferMapKey(this.shopPlacementCharges, previousSessionId, nextSessionId);
  }

  /**
   * Bos olan en kucuk oyuncu yuvasi.
   *
   * Sayac degil: lobiden cikan oyuncunun yuvasi bir sonrakine kaliyor, yoksa
   * gir-cik yapan bir lobi yuvayi 0-3 disina tasirdi. Yuvasi yazilmamis kayit
   * 0 sayiliyor; testlerin elle kurdugu oyuncu da boyle.
   */
  private getFreePlayerSlot() {
    const used = new Set<number>();
    for (const player of this.state.players.values()) {
      used.add(player.slot ?? 0);
    }
    let slot = 0;
    while (used.has(slot)) {
      slot += 1;
    }
    return slot;
  }

  private sendMatchResumeState(client: Client) {
    this.sendLobbyState(client);
    client.send("match:map", this.activeMap);
    client.send("lobby:started", { roomId: this.roomId });
    // Kart seciminden once: normal akista da karne ve ozet kartlardan once
    // geliyor, secim ekraninin basligi onlari okuyor.
    this.sendRunState(client);
    this.sendPendingCardChoices(client);
    this.sendWorkerDevelopmentState(client);
    const pending = this.state.players.get(client.sessionId)?.hiredWorkers?.find((worker) => {
      if (!worker.role) return true;
      // Rol belirtilerek alınan eski API işçileri per-worker seçim akışını
      // korur; yeni genel işçiler global gelişim ağacını kullanır.
      return Boolean((worker as HiredWorker & { legacySuffix?: boolean }).legacySuffix)
        && (worker.skillIds?.length ?? 0) < getWorkerSkillTiers(worker.role).length;
    });
    if (pending?.id) {
      if (pending.role) this.sendWorkerSkillChoice(client, pending.id, pending.skillIds?.length ?? 0);
      else this.sendWorkerSpecializationChoice(client, pending.id);
    }
  }

  private sendPendingCardChoices(client: Client) {
    const choices = this.pendingCardChoices.get(client.sessionId);
    if (choices) client.send("card:choices", choices);
  }

  /**
   * Kosu izinin son hali: son dalga karnesi, oyuncunun kendi savunma ozeti ve
   * mac bittiyse sonuc raporu.
   *
   * Yeniden baglanmada kendiliginden gidiyor; `run:sync` ile de isteniyor,
   * cunku sayfasi yeniden acilan istemci dinleyicilerini kurmadan gelen mesaji
   * kaybediyor (kart secimindeki `card:sync` ile ayni sebep). Sonuc raporu
   * ayni kimlikle geliyor, istemci ikinci kez kaydetmiyor.
   */
  private sendRunState(client: Client) {
    const latestWave = this.runLedger.latestWave;
    if (latestWave) client.send("wave:report", latestWave);
    const defense = this.lastDefenseSummary.get(client.sessionId);
    if (defense) client.send("defense:summary", defense);
    if (this.matchResult && this.matchResultPayload) client.send(`match:${this.matchResult}`, this.matchResultPayload);
  }

  onDispose() {
    MatchRoom.rooms.delete(this.roomId);
    MatchRoom.publicRooms.delete(this.roomId);
  }

  private setLobbyCharacter(client: Client, requestedCharacterId: CharacterId | undefined) {
    // Karakter secimi altini baslangic degerine yaziyor. Mac basladiktan sonra
    // bu, ayni karakteri yeniden secerek sinirsiz altin demekti; ustelik
    // kuleler ve kartlar eski karaktere bagli kalirdi.
    if (this.gameStarted) {
      return;
    }
    const player = this.state.players.get(client.sessionId);
    const characterId = this.getCharacterId(requestedCharacterId);
    if (!player) {
      return;
    }

    const takenByOtherPlayer = Array.from(this.state.players.entries()).some(([sessionId, candidate]) => {
      return sessionId !== client.sessionId && candidate.characterId === characterId;
    });
    if (takenByOtherPlayer) {
      client.send("lobby:error", serverTextMessage("lobby.characterTaken"));
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
    if (!player || this.gameStarted) {
      return;
    }

    player.ready = Boolean(ready);
    this.broadcastLobbyState();
  }

  private startLobbyMatch(client: Client) {
    // Baslamis maci yeniden baslatmak arenayi sifirlar, dalga ortasinda kurulum
    // evresini acar ve kurulum sonu iyilesmelerini (`nexus:mend`) yeniden
    // tetiklerdi.
    if (this.gameStarted) {
      return;
    }
    if (client.sessionId !== this.hostSessionId) {
      client.send("lobby:error", serverTextMessage("lobby.hostOnlyStart"));
      return;
    }

    if (!this.canStartLobbyMatch()) {
      client.send("lobby:error", serverTextMessage("lobby.notAllReady"));
      return;
    }

    this.configureArenaForScale();
    this.gameStarted = true;
    this.setupPhase = true;
    this.setupSession += 1;
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
      stage: this.stage,
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
      started: this.gameStarted,
      stage: this.stage
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

    // Bitmis mac katilinabilir gorunmemeli: listede "Devam ediyor" diye
    // duran oda, girene baskasinin kosusunun raporunu verirdi.
    if (this.matchResult) {
      return false;
    }

    // Dogrudan baslatilan oda (solo, yaratici) tek kisilik: listede yok,
    // katilinamaz. Kapanmakta olan oda da listelenmiyor.
    if (this.soloRoom || this.creativeMode || this.abandonDisposing) {
      return false;
    }

    if (!this.gameStarted) {
      return this.state.players.size < this.maxClients;
    }

    // Penceresi suren yuva sahibinin; listede bos koltuk sayilmiyor.
    return this.state.players.size < this.maxClients || Array.from(this.state.players.entries())
      .some(([sessionId, player]) => !player.connected && !this.reconnectingSessionIds.has(sessionId));
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
    // Ayrilan oyuncu dalgayi buyutmuyor; kalanlar onun payini savunmak zorunda kalirdi.
    return getArenaWaveEnemyCount(wave, this.mapScale, this.getActivePlayerCount());
  }

  /**
   * Dalganin dogum planini kurar: orijinal sayi, sampiyon ve gercek hedef.
   *
   * `waveTarget` gercekten dogacak dusman sayisi -- sampiyon bir dusman,
   * yerine gectigi dogumlar yok. Kurulum ongorusu ve "kalan" sayaci bunu
   * okuyor; orijinal sayiyi yazsalardi dalga hic gelmeyecek dusmanlari
   * sayardi.
   */
  private planWaveSpawns(wave: number) {
    const slotCount = this.getScaledWaveEnemyCount(wave);
    this.waveChampionPlan = this.championsEnabled ? getWaveChampionPlan(wave, slotCount) : undefined;
    this.waveSlotOffset = 0;
    this.waveChampionSpawned = false;
    this.planWaveSpecials(wave, slotCount);
    this.waveTarget = slotCount - (this.waveChampionPlan ? this.waveChampionPlan.replaced - 1 : 0)
      - getWaveSpecialSpawnReduction(this.waveSpecialPlan);
  }

  /**
   * Dalganin ozel dusman ve karsi atak plani (2. asamadan itibaren).
   *
   * 1. asamada zar hic atilmiyor ve tohum hic cekilmiyor: oradaki maclar
   * eskisiyle bire bir ayni. Dalga basina ayri bir tohumlu zar: ozel
   * dusmanin kararlari normal dogumun zarini kaydirmiyor.
   */
  private planWaveSpecials(wave: number, slotCount: number) {
    this.waveSpecialCursor = 0;
    this.waveSurgeStarted = false;
    // Serit dalgayla yasiyor: yeni dalga planinda suren serit kalkiyor.
    this.counterSurge = undefined;
    if (this.stage < SPECIAL_ENEMIES_FIRST_STAGE) {
      this.waveSpecialPlan = undefined;
      this.specialRandom = undefined;
      return;
    }
    this.specialSeed ??= Math.floor(Math.random() * 0x1_0000_0000);
    const random = createSpecialRandom(this.specialSeed, wave);
    const champion = this.waveChampionPlan;
    this.waveSpecialPlan = planWaveSpecials({
      stage: this.stage,
      wave,
      slotCount,
      champion: champion ? { replaced: champion.replaced, slot: champion.slot } : undefined,
      cols: this.activeMap.cols,
      random
    });
    this.specialRandom = random;
  }

  /** Siradaki dogum ozel dusman mi; sampiyonun sirasi her zaman once. */
  private getPendingSpecial(): WaveSpecialSpawn | undefined {
    const plan = this.waveSpecialPlan;
    if (!plan || plan.wave !== this.wave) return undefined;
    const spawn = plan.spawns[this.waveSpecialCursor];
    return spawn && this.waveSpawned >= spawn.index ? spawn : undefined;
  }

  /**
   * Siradaki dogumun sampiyon olup olmadigi.
   *
   * Sira `>=` ile: yaratici moddaki dusman patlamasi sampiyonun sirasini tek
   * hamlede gecebiliyor; esitlik arasaydi sampiyon hic dogmaz, hedef sayac ise
   * onu bekleyerek zaten kucuk kalirdi. Plan baska bir dalganin olabilir
   * (testler ve olcum araclari sayaclari elle yaziyor); o zaman normal dogum.
   */
  private getPendingChampion() {
    const plan = this.waveChampionPlan;
    if (!plan || plan.wave !== this.wave || this.waveChampionSpawned) return undefined;
    return this.waveSpawned + this.waveSlotOffset >= plan.slot ? plan : undefined;
  }

  /** Bir dusman dogurur (sirasi geldiyse sampiyonu) ve sayaclari ilerletir; dogan sampiyonsa planini dondurur. */
  private spawnNextWaveEnemy() {
    const champion = this.getPendingChampion();
    const special = champion ? undefined : this.getPendingSpecial();
    if (special) {
      this.spawnSpecialEnemy(special);
      this.waveSpecialCursor += 1;
    } else {
      this.spawnEnemy(champion);
    }
    this.waveSpawned += 1;
    if (champion) {
      this.waveChampionSpawned = true;
      this.waveSlotOffset += champion.replaced - 1;
    }
    this.maybeStartCounterSurge();
    return champion;
  }

  /**
   * Ozel dusman dogurur. Govde normal dogum yolundan; tur, can kati ve
   * dogum yeri ozel zardan (normal dogumun zarina dokunmuyor).
   *
   * - Avci: o dalganin sampiyon butcesi ve cani, ust kenardan.
   * - Isitici: dalganin normal dusmani, ust kenardan.
   * - Enerji yiyici: normalin 1,5 kati can, sol ya da sag kenardan.
   */
  private spawnSpecialEnemy(spawn: WaveSpecialSpawn) {
    const random = this.specialRandom ?? Math.random;
    const plan = this.waveSpecialPlan;
    if (spawn.kind === "hunter" && plan?.hunter) {
      const budget = plan.hunter;
      this.spawnEnemy(undefined, {
        kind: "hunter",
        type: budget.type,
        healthMultiplier: budget.hpMultiple,
        start: this.pickSpecialTopSpawn(random),
        budget: { replaced: budget.replaced, gold: budget.gold, exp: budget.exp, leakDamage: budget.leakDamage, reputation: budget.reputation }
      });
      return;
    }
    if (spawn.kind === "eater") {
      this.spawnEnemy(undefined, {
        kind: "eater",
        type: SPECIAL_BASE_TYPE,
        healthMultiplier: ENERGY_EATER_HP_MULTIPLIER,
        start: this.pickSpecialSideSpawn(random)
      });
      return;
    }
    this.spawnEnemy(undefined, {
      kind: "heater",
      type: SPECIAL_BASE_TYPE,
      healthMultiplier: 1,
      start: this.pickSpecialTopSpawn(random)
    });
  }

  /** Ust kenarda bos bir hucre (normal dogumla ayni kural, ozel zarla). */
  private pickSpecialTopSpawn(random: () => number) {
    const open: number[] = [];
    for (let col = 0; col < this.activeMap.cols; col += 1) {
      if (!this.getTowerAtCell(col, 0)) open.push(col);
    }
    const col = open[Math.floor(random() * Math.max(1, open.length))] ?? 0;
    return gridToWorld(col, 0, this.activeMap);
  }

  /**
   * Sol ya da sag kenarda yurunebilir bir hucre. Ust satir disinda, nexusun
   * hemen ustundeki satirlara da degil: yiyici yandan sizip hedefine yurusun,
   * dogdugu yerde nexusa dusmesin.
   */
  private pickSpecialSideSpawn(random: () => number) {
    const sideCol = random() < 0.5 ? 0 : this.activeMap.cols - 1;
    const lastRow = Math.max(1, this.activeMap.rows - 1 - ENERGY_EATER_SPAWN_BOTTOM_MARGIN_ROWS);
    const rows: Array<{ col: number; row: number }> = [];
    for (const col of [sideCol, sideCol === 0 ? this.activeMap.cols - 1 : 0]) {
      for (let row = 1; row <= lastRow; row += 1) {
        const tower = this.getTowerAtCell(col, row);
        if (!tower || tower.hp <= 0) rows.push({ col, row });
      }
      // Once secilen kenar; tamamen doluysa obur kenar.
      if (rows.length > 0) break;
    }
    const cell = rows[Math.floor(random() * Math.max(1, rows.length))] ?? { col: sideCol, row: 1 };
    return gridToWorld(cell.col, cell.row, this.activeMap);
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

  /**
   * Oldurme altini: odadaki herkes tam payi aliyor.
   *
   * Donen deger oldurenin bu oldurmeden aldigi altin (kendi kart ve esya
   * carpaniyla). Oldurme olayina o yaziliyor ki istemci dunyada "+N"
   * gosterebilsin; oldurenin disindakiler kendi paylarini HUD'da goruyor,
   * o yuzden baskasinin carpani tele cikmiyor.
   */
  private awardEnemyGold(enemy: EnemyModel, ownerId?: string) {
    if (this.state.players.size === 0) {
      return 0;
    }

    // Sampiyonun payi yerine gectigi dogumlarin beklenen toplami.
    const share = enemy.champion?.gold ?? enemy.special?.budget?.gold ?? Math.max(1, Math.round(enemy.reward * ENEMY_REWARD_MULTIPLIER));
    let ownerGain = 0;
    // Anahtar oturum kimligi: yeniden baglanan oyuncunun kaydi yeni anahtara
    // tasiniyor, oldurme olayinin sahibi de o anahtar.
    for (const [playerId, player] of this.state.players.entries()) {
      const gain = share * getModifierMultiplier(player.runModifiers, "goldGain");
      player.gold += gain;
      if (playerId === ownerId) {
        ownerGain = gain;
      }
    }
    return ownerGain;
  }

  /**
   * Dalga sonu primleri, oyuncu basina ve oyuncunun kendi kartlarindan.
   *
   * Bes kaynak, hicbiri tavanli degil: Garnizon Maasi (ayakta olan hasar veren kule basina), dalga geliri (`waveIncome`; genel kart ve ayakta duran
   * binaya takili esya), temiz dalga primi (`gold:cleanWave`), vadesi gelen
   * mevduat ve kulenin o dalga verdigi hasarin primi (`damageGold`, Savas
   * Tazminati). Hepsi duz: oyuncunun biriktirdigi altinla buyumuyor,
   * yani faize benzer bir dongu kurmuyor. Co-op'ta her oyuncu yalnizca
   * kendi kartinin ve esyasinin karsiligini aliyor; temizlik kosulu ise
   * takimin -- sizinti takimin nexusundan.
   */
  private awardWaveEndBonusGold(completedWave: number, clean: boolean) {
    for (const [playerId, player] of this.state.players.entries()) {
      let bonus = this.getPlayerWaveIncome(playerId);
      // Garnizon Maasi: ayakta olan her hasar veren kule (kule kontenjani tutan).
      const perTower = getModifierAdd(player.runModifiers ?? [], "garrisonGold");
      if (perTower > 0) {
        let standing = 0;
        for (const tower of this.towers.values()) {
          if (tower.ownerId === playerId && tower.hp > 0 && occupiesTowerSlot(tower.definition) && towerDealsDamage(tower.definition)) standing += 1;
        }
        bonus += standing * perTower;
      }
      if (clean && this.playerHasUnlock(playerId, "gold:cleanWave")) bonus += CLEAN_WAVE_GOLD;
      const deposits = player.goldDeposits ?? [];
      const due = deposits.filter((deposit) => deposit.dueWave <= completedWave);
      if (due.length > 0) {
        bonus += due.reduce((sum, deposit) => sum + deposit.amount, 0);
        player.goldDeposits = deposits.filter((deposit) => deposit.dueWave > completedWave);
      }
      if (bonus > 0) player.gold += bonus;
    }
    // Savas Tazminati: her kule o dalga verdigi hasarin karsiligini aliyor.
    // Sayac her kulede sifirlaniyor (primi olmasa da).
    for (const tower of this.towers.values()) {
      const perThousand = getModifierAdd(this.getTowerRunModifiers(tower), "damageGold");
      const dealt = tower.waveDamageDealt ?? 0;
      tower.waveDamageDealt = 0;
      if (perThousand > 0 && this.state.players.has(tower.ownerId)) {
        const amount = Math.floor(dealt / DAMAGE_GOLD_PER_DAMAGE) * perThousand;
        this.state.players.get(tower.ownerId)!.gold += amount;
      }
    }
  }

  /** Vadeli altin: bu dalga dahil `waves` dalga tamamlaninca `payout`. */
  private addGoldDeposit(player: Player, deposit: { payout: number; waves: number }) {
    player.goldDeposits = [...(player.goldDeposits ?? []), { dueWave: this.wave + deposit.waves - 1, amount: deposit.payout }];
  }

  /**
   * Oyuncunun dalga geliri: kendi listesindeki genel kartlar ve kendi
   * kulelerinin **kendi** listeleri. `getTowerRunModifiers` oyuncu
   * listesini her kuleye kopyaladigi icin burada kullanilmiyor -- genel kart
   * kule sayisi kadar sayilirdi. Yikik bina gelir getirmiyor.
   */
  private getPlayerWaveIncome(playerId: string) {
    const player = this.state.players.get(playerId);
    if (!player) return 0;
    let income = getModifierAdd(player.runModifiers ?? [], "waveIncome");
    for (const tower of this.towers.values()) {
      if (tower.ownerId !== playerId || tower.hp <= 0) continue;
      income += getModifierAdd(tower.runModifiers, "waveIncome");
    }
    return Math.max(0, Math.round(income));
  }

  /** Kulenin sahibine altin primi oduyor; odenen altini doner. Tavan yok. */
  private payTowerOwnerGold(tower: TowerModel, amount: number) {
    const player = this.state.players.get(tower.ownerId);
    if (!player || !(amount > 0)) return 0;
    player.gold += amount;
    return amount;
  }

  /** Oyuncuya altin primi oduyor; odenen altini doner. Tavan yok. */
  private payPlayerGold(playerId: string, amount: number) {
    const player = this.state.players.get(playerId);
    if (!player || !(amount > 0)) return 0;
    player.gold += amount;
    return amount;
  }

  /**
   * Oldurme primleri, olduren kulenin listesinden: ucan dusman (Dusurme
   * Primi), kisa pencerede uc oldurme (Toplu Imha Primi), tasan hasar
   * (Artik Enerji Toplayici), sicak namlu (Ates Hatti Primi), yavaslamis
   * hedef (Soguk Av Kaydi) ve uzak menzil (Uzak Menzil Primi). Hepsi kulenin
   * sahibine; tavan yok. Kulenin yanma ve kanamasi da kulenin oldurmesi
   * sayiliyor -- Uzak Menzil haric: tik haritanin her yerinde gelebilir.
   */
  private awardKillBountyGold(tower: TowerModel, enemy: EnemyModel, overkill: number, now: number, sourceDefinitionId = "") {
    const modifiers = this.getTowerRunModifiers(tower);
    let gained = 0;
    const air = getModifierAdd(modifiers, "airKillGold");
    if (air > 0 && enemy.movementKind === "air") gained += this.payTowerOwnerGold(tower, air);
    const multi = getModifierAdd(modifiers, "multiKillGold");
    if (multi > 0) {
      const recent = (tower.recentKillTimes ?? []).filter((time) => now - time < MULTI_KILL_GOLD_WINDOW_MS);
      recent.push(now);
      if (recent.length >= MULTI_KILL_GOLD_COUNT) {
        gained += this.payTowerOwnerGold(tower, multi);
        // Her uclu bir kez: sonraki prim yeni uc oldurme istiyor.
        recent.length = 0;
      }
      tower.recentKillTimes = recent;
    }
    const overkillShare = getModifierAdd(modifiers, "overkillGold");
    if (overkillShare > 0 && overkill > 0) gained += this.payTowerOwnerGold(tower, overkill * overkillShare);
    const hot = getModifierAdd(modifiers, "hotKillGold");
    if (hot > 0 && tower.temperature >= HOT_KILL_TEMPERATURE) gained += this.payTowerOwnerGold(tower, hot);
    const slowed = getModifierAdd(modifiers, "slowedKillGold");
    if (slowed > 0 && this.isEnemySlowed(enemy, now)) gained += this.payTowerOwnerGold(tower, slowed);
    // Uzak Menzil: menzilin dis dortte biri ile menzilin %110'u arasi. Durum
    // tikleri sayilmiyor (dusman haritanin obur ucunda olebilir), menzili
    // haritayi kaplayan kule (Sunucu kapsamda degil; Debug Lazer asiri
    // yuklemede) sayilmiyor.
    const longRange = getModifierAdd(modifiers, "longRangeKillGold");
    const mapWideNow = tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > now;
    if (longRange > 0 && !sourceDefinitionId.startsWith("status:") && towerHasBoundedRange(tower.definition) && !mapWideNow) {
      const range = this.getTowerRange(tower);
      const inner = range * LONG_RANGE_KILL_FRACTION;
      const outer = range * LONG_RANGE_KILL_MAX_FRACTION;
      const distance = distanceSq(tower.x, tower.y, enemy.x, enemy.y);
      if (distance >= inner * inner && distance <= outer * outer) gained += this.payTowerOwnerGold(tower, longRange);
    }
    return gained;
  }

  /**
   * Sampiyon primi (Odul Fermani): sampiyon olunce primi olan her oyuncuya,
   * kim oldururse oldursun. Esya kuresel, stat yalnizca oyuncunun listesinden
   * okunuyor. Odenenleri oyuncu kimligiyle doner.
   */
  private awardChampionBountyGold() {
    const gains = new Map<string, number>();
    for (const [playerId, player] of this.state.players.entries()) {
      const gain = this.payPlayerGold(playerId, getModifierAdd(player.runModifiers ?? [], "championGold"));
      if (gain > 0) gains.set(playerId, gain);
    }
    return gains;
  }

  /**
   * Oyuncunun kartlarindan gelen oldurme primleri: agir hedef (brute,
   * kusatma) ve oyuncunun yanma ya da kanamasiyla gelen olum. Oldurenin
   * sahibine; tavan yok.
   */
  private awardPlayerKillBountyGold(playerId: string, enemy: EnemyModel, sourceDefinitionId: string) {
    const player = this.state.players.get(playerId);
    if (!player) return 0;
    const modifiers = player.runModifiers ?? [];
    let gained = 0;
    if (enemy.type === "brute" || enemy.type === "siege") {
      gained += this.payPlayerGold(playerId, getModifierAdd(modifiers, "heavyKillGold"));
    }
    if (sourceDefinitionId === "status:burn" || sourceDefinitionId === "status:bleed") {
      gained += this.payPlayerGold(playerId, getModifierAdd(modifiers, "statusKillGold"));
    }
    return gained;
  }

  /**
   * Ikmal Senedi: teslim edilen miktar basina (`DELIVERY_GOLD_AMMO_UNIT`
   * muhimmat ya da `DELIVERY_GOLD_ENERGY_UNIT` enerji basina `deliveryGold`).
   * Teslimat sayisina degil miktara bakiyor: kucuk ve yarim yukler olayi
   * cogaltip altini cogaltamasin. Tam altina ulasmayan kesir kulede birikiyor.
   */
  private awardDeliveryGold(tower: TowerModel, delivered: number, resource: "ammo" | "energy") {
    const perUnit = getModifierAdd(this.getTowerRunModifiers(tower), "deliveryGold");
    if (!(perUnit > 0) || !(delivered > 0)) return 0;
    const unit = resource === "ammo" ? DELIVERY_GOLD_AMMO_UNIT : DELIVERY_GOLD_ENERGY_UNIT;
    const total = (tower.deliveryGoldCarry ?? 0) + (delivered / unit) * perUnit;
    const paid = Math.floor(total);
    tower.deliveryGoldCarry = total - paid;
    return this.payTowerOwnerGold(tower, paid);
  }

  /**
   * Yavaslatilmis dusman (Soguk Av Kaydi). Ana olcu hareket hesabinin son
   * tikte yazdigi yavaslatma carpani (`movementSlowMultiplier`, hizlanma
   * haric): Zeynep'in kuresel yavaslatmasi, Melis'in supheleri, zift, enkaz,
   * kristal tuzagi ve onarim gedigi dahil hepsi orada. Son tikten bu yana
   * vurusla gelen yavaslatma ve Sogutma Kanali da ayrica sayiliyor.
   */
  private isEnemySlowed(enemy: EnemyModel, now: number) {
    return (enemy.movementSlowMultiplier ?? 1) < 1
      || this.getEnemySlowSpeedMultiplier(enemy, now) < 1
      || getTowerStatusOutcomes(enemy.statusEffects, now).speedMultiplier < 1
      || enemy.coolantSlowUntil > now;
  }

  /**
   * Kritik oldurme primi (`gold:critKill`): oldurenin sahibine. Kilit
   * oldurenin kulesinden okunuyor: genel kart her kuleye, Kelle Defteri
   * yalnizca takildigi kuleye isliyor; ikisi birlikte primi katlamiyor.
   * Tavan yok. Donen deger odenen altin.
   */
  private awardCritKillGold(sourceTower: TowerModel | undefined, ownerId: string) {
    if (!sourceTower || !this.towerHasUnlock(sourceTower, "gold:critKill")) return 0;
    return this.payPlayerGold(ownerId, CRIT_KILL_GOLD);
  }


  /**
   * Tick'in hata siniri.
   *
   * Tick bir donem korumasizdi: icindeki tek bir istisna Colyseus'un surec
   * kancasina kadar cikiyor ve butun odalari kapatiyordu. Simdi hata
   * gunluge yaziliyor ve oda yasamaya devam ediyor. Ayni hata her tick
   * tekrarlanirsa simulasyon katlanarak artan (en fazla iki saniyelik)
   * araliklarla bekliyor; saniyede altmis yigin izi ve tam islemci yerine
   * ara ara bir deneme.
   */
  private update(deltaTime: number) {
    const now = Date.now();
    this.checkAbandoned(now);
    if (this.abandonDisposing || now < this.tickBackoffUntil) {
      return;
    }
    // Kovayi asan son degerler (performans kolu) tick'ten once uygulaniyor.
    this.flushLatestMessages();
    try {
      this.runTick(deltaTime);
      this.tickFailures = 0;
    } catch (error) {
      this.tickFailures += 1;
      this.tickBackoffUntil = now + Math.min(TICK_ERROR_BACKOFF_MAX_MS, 50 * 2 ** (this.tickFailures - 1));
      this.synergyIsolationCache = undefined;
      this.tickLayoutCache = undefined;
      // Yarim kalan tick tabanla gonderilen arasini bozmus olabilir; herkes tam kayit alsin.
      this.markTowerWireStale();
      this.reportRoomError("update", error);
      if (this.tickFailures >= TICK_FAILURE_LIMIT) {
        this.abortBrokenRoom();
      }
    }
  }

  /**
   * Kurtarilamayan odayi kapatir.
   *
   * Tick her denemede ayni hatayi veriyorsa oda donmus demek: oyuncular bagli
   * kaliyor, hicbir sey ilerlemiyor ve oda sinirda yer tutuyor. Oyunculara kisa bir mesaj gidiyor (istemci
   * yeniden baglanmayi denemiyor), sonra oda kapaniyor. Sonuc raporu yok:
   * bozuk durumdan uretilen rapor gercek bir yenilgi gibi kaydedilirdi.
   */
  private abortBrokenRoom() {
    if (this.abandonDisposing) {
      return;
    }
    this.abandonDisposing = true;
    MatchRoom.publicRooms.delete(this.roomId);
    try {
      this.broadcast("room:error", serverTextMessage("room.serverError"));
    } catch (error) {
      this.reportRoomError("abort", error);
    }
    try {
      void Promise.resolve(this.disconnect()).catch((error) => this.reportRoomError("abort", error));
    } catch (error) {
      this.reportRoomError("abort", error);
    }
  }

  /**
   * Kimsesiz odayi kapatir.
   *
   * Istemci yok, pencere acik oturum yok, rezerve koltuk yok ve bu durum
   * `ABANDONED_ROOM_DISPOSE_MS` boyunca suruyor. Bitmis mac beklemiyor: ona
   * kimse giremiyor ("Maç bitti."), oda sinirda bosuna yer tutardi. Sahibi
   * kendi istegiyle cikmis solo oda da beklemiyor: listede degil, sahibi
   * birakti; kopan (istemsiz) sahip ise on dakika boyunca donebiliyor. Her oda
   * yalnizca kendini kapatiyor. Test duzenekleri `onCreate` cagirmadigi icin
   * denetim onlarda kapali.
   */
  private checkAbandoned(now: number) {
    if (!this.abandonCheckEnabled || this.abandonDisposing) {
      return;
    }
    if (this.clients.length > 0 || this.hasPendingSeats()) {
      this.abandonedSince = 0;
      return;
    }
    if (this.abandonedSince === 0) {
      this.abandonedSince = now;
      return;
    }
    // Bos lobi de beklemiyor: mac baslamadan cikan oyuncunun kaydi siliniyor,
    // donulecek bir yuva yok ve oda listede de degil.
    const emptyLobby = !this.gameStarted && this.state.players.size === 0;
    const disposeAfterMs = this.matchResult || emptyLobby || this.isLeftByEveryone() ? 0 : ABANDONED_ROOM_DISPOSE_MS;
    if (now - this.abandonedSince < disposeAfterMs) {
      return;
    }
    this.disposeAbandoned("dispose");
  }

  /**
   * Kimsesiz odayi kapatir; kapanis basladiysa `true`.
   *
   * `abandonDisposing` hemen yaziliyor: oda o andan itibaren sinira
   * sayilmiyor ve yerinden etme adayi degil (`evictAbandonedRoom`).
   */
  private disposeAbandoned(context: "dispose" | "evict") {
    this.abandonDisposing = true;
    MatchRoom.publicRooms.delete(this.roomId);
    try {
      void Promise.resolve(this.disconnect()).catch((error) => this.reportRoomError(context, error));
      return true;
    } catch (error) {
      // Oda henuz kurulurken kapatilamaz; bir sonraki tick yeniden denesin.
      this.abandonDisposing = false;
      this.reportRoomError(context, error);
      return false;
    }
  }

  private runTick(deltaTime: number) {
    if (!this.gameStarted) {
      this.syncRoomRegistry();
      return;
    }

    const gameDeltaTime = deltaTime * GAME_SPEED_MULTIPLIER;
    const seconds = gameDeltaTime / 1000;
    const frameStart = performance.now();
    this.synergyIsolationCache = new Map();
    this.tickLayoutCache = { isolated: new Map(), synthesisGroups: new Map() };
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
    this.settleUltimateReports();
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

      if (this.isBoardIdle() && this.isRepeatOfLastIdleSnapshot(snapshot, now)) {
        snapshot = undefined;
      }
    }
    this.synergyIsolationCache = undefined;
    this.tickLayoutCache = undefined;
    const tickMs = performance.now() - frameStart;

    this.recordPerfFrame({
      ...this.perfCounters,
      ...timings,
      tickMs,
      snapshotBytes
    });

    if (snapshot) {
      // Delta burada uygulaniyor, `getSnapshot` icinde degil: o yontem hem
      // testlerden hem baska yollardan cagriliyor ve yan etkili olmasi,
      // okuyanin tam kayit sandigi yerde delta almasina yol acardi.
      // Tabanla ayni olmayan istemci (atlanan, kopan, tam kayit isteyen) deltayi
      // degil tam kareyi aliyor; digerleri deltayi.
      const { wire, towerBaseline, enemyBaseline, extraBaselines } = this.applyWireDelta(snapshot);
      if (this.sendSnapshotWithBackpressure(wire, snapshot)) {
        this.commitWireBaseline(towerBaseline, enemyBaseline, extraBaselines);
        this.recordSnapshotBroadcast(now);
      }
    }
    if (now - this.lastPerfBroadcastAt >= PERF_SEND_INTERVAL_MS) {
      this.broadcast("perf:snapshot", this.latestPerfSnapshot);
      this.lastPerfBroadcastAt = now;
    }
  }

  /**
   * Dunya duruyor mu.
   *
   * Dalga arasi ve kurulum evresi: dusman yok, mermi yok, kimse kimildamiyor.
   * Oyuncunun kart sectigi an tam olarak bu.
   */
  private isBoardIdle() {
    return this.setupPhase || this.waveClearedAt !== 0;
  }

  /**
   * Duran bir tahtada ayni snapshotu tekrar gondermeyi engeller.
   *
   * Dalga arasinda oyun duruyor ama snapshot yayini durmuyordu: 20 kuleyle
   * saniyede 175 KB, ve olculdu -- altmis karenin elli sekizi `serverTime`
   * disinda **bire bir ayni** veriyi tasiyor. Yani kuyrugun bosalmasi gereken
   * tek an, kuyrugun degismemis veriyle doldurulduğu andi. Kart teklifi ve
   * oyuncunun cevabi o yigin birikintinin arkasinda bekliyordu.
   *
   * Karsilastirma yalnizca tahta dururken yapiliyor: dalga sirasinda zaten her
   * kare farkli, kiyaslamak bosuna is olurdu. Yine de belirli araliklarla bir
   * kare geciyor -- istemcinin oynatma saati ve tamponu taze kalsin, arada
   * yeniden baglanan biri de guncel durumu gorsun diye.
   */
  private isRepeatOfLastIdleSnapshot(snapshot: WireGameSnapshot, now: number) {
    if (now - this.lastIdleSnapshotSentAt >= SNAPSHOT_IDLE_HEARTBEAT_MS) {
      this.lastIdleSnapshotSignature = idleSnapshotSignature(snapshot);
      this.lastIdleSnapshotSentAt = now;
      return false;
    }

    const signature = idleSnapshotSignature(snapshot);
    if (signature === this.lastIdleSnapshotSignature) {
      return true;
    }
    this.lastIdleSnapshotSignature = signature;
    this.lastIdleSnapshotSentAt = now;
    return false;
  }

  /**
   * Kule kayitlarini yalnizca degisen alanlara indirir.
   *
   * `id` her zaman kaliyor: dizi ayni zamanda **hangi kulelerin hayatta**
   * oldugunu soyluyor, o yuzden hic degismemis bir kule listeden dusemez.
   * Bir alan bu karede kayboldiysa istemcideki eski degeri asili birakmamak
   * icin acikca `null` gonderiliyor.
   *
   * Yeni taban dondurulyor ama yazilmiyor; yazma isi gonderim basarili
   * olunca `commitTowerWireBaseline` ile yapiliyor.
   */
  /**
   * Bir kayit dizisini yalnizca degisen alanlara indirir.
   *
   * `id` her zaman kaliyor: dizi ayni zamanda **hangi varliklarin hayatta**
   * oldugunu soyluyor, o yuzden hic degismemis bir kayit listeden dusemez.
   * Bir alan bu karede kayboldiysa istemcideki eski degeri asili birakmamak
   * icin acikca `null` gonderiliyor.
   *
   * Yeni taban dondurulyor ama yazilmiyor; yazma isi gonderim basarili
   * olunca yapiliyor.
   */
  private toWireDelta<T extends { id: string }>(
    records: readonly T[],
    previousWire: Map<string, Record<string, unknown>>,
    full: boolean
  ) {
    const baseline = new Map<string, Record<string, unknown>>();
    const wire = records.map((entry) => {
      const record = entry as unknown as Record<string, unknown>;
      baseline.set(entry.id, record);
      const previous = full ? undefined : previousWire.get(entry.id);
      if (!previous) return entry;

      const delta: Record<string, unknown> = { id: entry.id };
      for (const key of Object.keys(record)) {
        if (key === "id") continue;
        if (!wireValueEquals(record[key], previous[key])) delta[key] = record[key];
      }
      for (const key of Object.keys(previous)) {
        if (key !== "id" && !(key in record)) delta[key] = null;
      }
      return delta as unknown as T;
    });
    return { wire, baseline };
  }

  private applyWireDelta(snapshot: WireGameSnapshot) {
    const full = this.towerWireNeedsFullResend;
    const towers = this.toWireDelta(snapshot.towers, this.lastSentTowerWire, full);
    const enemies = this.toWireDelta(snapshot.enemies, this.lastSentEnemyWire, full);
    const players = this.toWireDelta(snapshot.players, this.lastSentPlayerWire, full);
    const drones = snapshot.drones ? this.toWireDelta(snapshot.drones, this.lastSentDroneWire, full) : undefined;
    return {
      wire: {
        ...snapshot,
        towers: towers.wire,
        enemies: enemies.wire,
        players: players.wire,
        ...(drones ? { drones: drones.wire } : {})
      },
      towerBaseline: towers.baseline,
      enemyBaseline: enemies.baseline,
      extraBaselines: { players: players.baseline, drones: drones?.baseline }
    };
  }

  /**
   * Gonderilen karenin kayitlarini taban yapar.
   *
   * Oyuncu ve isci tabanlari istege bagli: verilmezse eskisi duruyor ve o
   * bolumler bir sonraki karede yine tam gidiyor (yanlis degil, yalnizca
   * kucultulmemis).
   */
  private commitWireBaseline(
    towerBaseline: Map<string, Record<string, unknown>>,
    enemyBaseline: Map<string, Record<string, unknown>>,
    extraBaselines?: { players?: Map<string, Record<string, unknown>>; drones?: Map<string, Record<string, unknown>> }
  ) {
    this.lastSentTowerWire = towerBaseline;
    this.lastSentEnemyWire = enemyBaseline;
    if (extraBaselines?.players) this.lastSentPlayerWire = extraBaselines.players;
    if (extraBaselines?.drones) this.lastSentDroneWire = extraBaselines.drones;
    this.towerWireNeedsFullResend = false;
  }

  /**
   * Bir sonraki kare tam gitsin: elindeki kayit eksik olabilecek biri var.
   *
   * Oturum verilirse yalnizca o istemci; verilmezse herkes.
   */
  private markTowerWireStale(sessionId?: string) {
    if (sessionId === undefined) {
      this.towerWireNeedsFullResend = true;
      return;
    }
    this.wireSyncedSessionIds.delete(sessionId);
  }

  /**
   * Kareyi kuyrugu bosalan istemcilere yollar.
   *
   * `snapshot` delta, `full` ayni karenin tam hali. Tabanla ayni olan
   * istemci deltayi, olmayan tam kareyi aliyor; atlanan istemci kumeden
   * dusuyor ve bir sonraki gonderimde tam kare aliyor -- kareyi baskasi
   * almis olsa bile. Biri bile aldiysa `true`; o zaman taban ilerliyor.
   * Tabanla ayni ama `wireDelta` bildirmemis (eski) istemci ucuncu cesidi
   * aliyor: kule ve dusman delta, oyuncu ve isci tam (`toLegacyWireFrame`).
   */
  private sendSnapshotWithBackpressure(snapshot: WireGameSnapshot, full: WireGameSnapshot = snapshot) {
    let sent = false;
    const recipients: string[] = [];
    // Tam kare isaretli: istemci delta onbelleklerini atip kayitlari
    // birlestirmek yerine yerine koyuyor. Aksi halde atlanip geri gelen
    // istemcide tam kayitta artik olmayan bir alan eski degeriyle kalirdi.
    const fullFrame: WireGameSnapshot = full === snapshot ? full : { ...full, wireFull: true };
    // Kare cesit basina bir kez kodlaniyor (delta, eski istemci deltasi ve
    // tam), istemci basina degil: `client.send` her cagrida ayni nesneyi
    // yeniden msgpack'liyordu.
    let deltaBytes: Uint8Array | undefined;
    let legacyBytes: Uint8Array | undefined;
    let fullBytes: Uint8Array | undefined;
    let legacyFrame: WireGameSnapshot | undefined;
    for (const client of this.clients) {
      if (getClientBufferedAmount(client) > SNAPSHOT_BACKPRESSURE_LIMIT_BYTES) {
        // Atlanan istemci bu deltayi kacirdi; bir daha yakalayamaz.
        this.wireSyncedSessionIds.delete(client.sessionId);
        continue;
      }
      const synced = !this.towerWireNeedsFullResend && this.wireSyncedSessionIds.has(client.sessionId);
      // Eski istemci (`wireDelta` bildirmeyen) kule ve dusman deltasini
      // anliyor ama oyuncu ve isci kayitlarini tam bekliyor: kendi cesidi
      // o iki bolumu tam kareden aliyor. Yalnizca boyle biri varsa kuruluyor.
      const variant = !synced ? "full" : this.wireDeltaSessionIds.has(client.sessionId) ? "delta" : "legacy";
      if (variant === "legacy" && !legacyFrame) legacyFrame = toLegacyWireFrame(snapshot, full);
      const payload = variant === "delta" ? snapshot : variant === "legacy" ? legacyFrame! : fullFrame;
      if (typeof (client as Partial<Client>).enqueueRaw === "function") {
        const bytes = variant === "delta"
          ? (deltaBytes ??= getMessageBytes.raw(Protocol.ROOM_DATA, "snapshot", payload))
          : variant === "legacy"
            ? (legacyBytes ??= getMessageBytes.raw(Protocol.ROOM_DATA, "snapshot", payload))
            : (fullBytes ??= getMessageBytes.raw(Protocol.ROOM_DATA, "snapshot", payload));
        client.enqueueRaw(bytes);
      } else {
        client.send("snapshot", payload);
      }
      recipients.push(client.sessionId);
      sent = true;
    }
    for (const sessionId of recipients) {
      this.wireSyncedSessionIds.add(sessionId);
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

  /**
   * Ulti isinlarinin (Zeynep sutunu, Sempati) gorsel kademesi: atanin ulti
   * gucunden. Kule isinlarindaki kural: kademe 1 telde yazilmaz.
   */
  private getUltimateBeamTier(ownerId: string): TowerTier | undefined {
    const tier = getUltimateVisualTier(this.state.players.get(ownerId)?.ultimatePower ?? 0);
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
      this.finishDefenseSummary();
      const waveRecord = this.closeRunWave(false);
      this.advanceWaveGrowth();
      this.resetTowerHeatAfterWave();
      if (this.wave >= FINAL_WAVE) {
        this.finishMatch("victory");
        return;
      }
      const completedWave = this.wave;
      this.wave += 1;
      this.waveSpawned = 0;
      this.planWaveSpawns(this.wave);
      this.spawnCooldownMs = 950;
      this.awardGoldToPlayers(getWaveCompletionGold(completedWave));
      for (const [playerId, player] of this.state.players.entries()) {
        if (this.playerHasUnlock(playerId, "goldInterest")) player.gold += Math.floor(player.gold * GOLD_INTEREST_RATE);
      }
      // Faizden sonra: duz primler faizin tabanina girmesin.
      this.awardWaveEndBonusGold(completedWave, isCleanWave(waveRecord));
      this.setupPhase = true;
      this.setupSession += 1;
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

    // Sampiyon orijinal sirada kendi dogumuna gelince doguyor.
    const champion = this.spawnNextWaveEnemy();
    // Formul paylasilan pakette: istemcinin kombo penceresi ayni aralikla sayiyor.
    //
    // Sampiyon yerine gectigi dogumlarin araliklarini bosaltiyor: dalganin
    // suresi ayni kaliyor ve sampiyon sahnede bir sure tek basina. Boslugun
    // `leadSlots` kadari sampiyondan once, gerisi sonra.
    const next = champion ? undefined : this.getPendingChampion();
    const slots = champion ? champion.replaced - champion.leadSlots : next ? 1 + next.leadSlots : 1;
    this.spawnCooldownMs = getWaveSpawnIntervalMs(this.wave) * slots;
  }

  /**
   * Arena olculeri: her kademe ayni en/boy oraninda.
   *
   * Kamera haritayi ekrana sigdirirken iki kisittan dar olani baglar; artan pay
   * obur eksende bosluga gider. 12x18 (2:3) tuvalin kaplamalardan artan seridiyle
   * neredeyse birebir ayni oranda oldugu icin 1x ekrani iki yandan tam dolduruyor,
   * oysa eski 15x27 (5:9) belirgin olarak daha uzundu: yukseklik bagliyor ve
   * harita iki yanindan 32'ser piksel iceri cekiliyordu. Oran her kademede ayni
   * tutulunca buyuk haritalar da kucugu gibi oturuyor.
   *
   * Sutun ve satirlar 12/18'in tam katlari: 16x24, 20x30, 24x36. Alanlar eski
   * degerlere yakin (405 -> 384, 640 -> 600, 828 -> 864), yani kademelerin
   * buyume hissi degismiyor.
   */
  private configureArenaForScale() {
    const dimensions = [
      { cols: 12, rows: 18 },
      { cols: 16, rows: 24 },
      { cols: 20, rows: 30 },
      { cols: 24, rows: 36 }
    ][this.mapScale - 1];
    this.activeMap = createOpenArenaMap(dimensions.cols, dimensions.rows);
    this.activePaths = buildRuntimePaths(this.activeMap);
    this.markNavigationDirty();
    this.planWaveSpawns(this.wave);
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
      const ownedTowers = Array.from(this.towers.values()).filter((tower) => tower.ownerId === playerId);
      const towers = ownedTowers.map((tower) => tower.definition);
      const choices = drawCards({
        preferredAxes: getCharacterCardAxes(player.characterId),
        towers,
        ownedCardIds: player.ownedCardIds,
        marksAvailable: this.canTeamMarkEnemies(),
        // Epik kart kaynagi kurulusta olmadan bos bir secenek: kart ve esya
        // bonusu (kosullu paylar degil -- dalga sonunda gecici bir pencereye
        // bakmak zari oynatirdi).
        sourceBonuses: {
          player: (stat) => getModifierAdd(player.runModifiers ?? [], stat),
          towers: ownedTowers.map((tower) => {
            const modifiers = this.getTowerStaticRunModifiers(tower);
            return { tower: tower.definition, bonus: (stat: ModifierStat) => getModifierAdd(modifiers, stat) };
          })
        },
        // Kilidi esyadan zaten gelen kart: magazanin "zaten acik" kurali.
        ownedUnlocks: getOwnedItemUnlocks(player.ownedShopItemIds ?? [], ownedTowers),
        count: this.playerHasUnlock(playerId, "card:wideSearch") ? WIDE_SEARCH_CARD_COUNT : undefined
      });
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
      client.send("card:rejected", { reason: SERVER_TEXT["card.noPendingChoice"], key: "card.noPendingChoice" });
      return;
    }
    if (!card) {
      client.send("card:rejected", { reason: SERVER_TEXT["card.invalidChoice"], key: "card.invalidChoice" });
      client.send("card:choices", choices);
      return;
    }
    let reachedTowerIds: string[];
    if (card.scope.kind === "targeted") {
      const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
      // Kaynak binasi ve duvar ayni olcutle eleniyor: ates etmeyen yapi
      // savas karti tasiyamaz.
      if (!tower || tower.ownerId !== client.sessionId
        || !canTowerHoldTargetedCard(tower.definition)
        || !canAcceptTargetedCard(tower.targetedCardIds)) {
        client.send("card:rejected", { reason: SERVER_TEXT["card.towerCannotTake"], key: "card.towerCannotTake" });
        client.send("card:choices", choices);
        return;
      }
      // Hedefli can karti (Zirhli Govde) bir donem yalnizca modifier
      // listesine yaziliyordu ve can tavani hic buyumuyordu; esya takmayla
      // ayni oranli kural burada da isliyor.
      const healthRatio = this.getTowerHealthRescaleRatio(tower, card.effects);
      tower.maxHp *= healthRatio;
      tower.hp *= healthRatio;
      tower.runModifiers.push(...card.effects);
      tower.targetedCardIds.push(card.id);
      reachedTowerIds = [tower.id];
    } else {
      // Secim ekraninin "N kulene etki eder" satiriyla ayni kural: istemci
      // bu listeyi parlatip sayisini soyluyor, ikisi ayri hesaplansa ekran
      // bir sayi soyleyip baska kuleleri parlatabilirdi.
      reachedTowerIds = [];
      for (const tower of this.towers.values()) {
        if (tower.ownerId === client.sessionId && cardReachesTower(card, tower.definition)) reachedTowerIds.push(tower.id);
      }
      // Can orani kule basina, kulenin kendi toplamina gore: oyuncu
      // carpaninin eski/yeni orani kuledeki Zirhli Govde gibi eklemeleri
      // de carpiyordu ve sonuc kart secim sirasina bagliydi. Kurulum ve
      // yaratici modun yeniden kurulumu tabani (1 + toplam) ile carpiyor;
      // ayni kural burada da isliyor. Etiketli kart (Yuvarlak Temel)
      // yalnizca uydugu yapiya isler. Oran etkiler listeye yazilmadan
      // once okunmali.
      if (getModifierAdd(card.effects, "towerHealth") !== 0) {
        for (const tower of this.towers.values()) {
          if (tower.ownerId !== client.sessionId || !ownedCardAppliesToTower(card, tower.definition)) continue;
          const ratio = this.getTowerHealthRescaleRatio(tower, card.effects);
          tower.maxHp *= ratio;
          tower.hp *= ratio;
        }
      }
      player.runModifiers.push(...card.effects);
    }
    player.ownedCardIds.push(card.id);
    this.invalidateTowerGrants();
    this.pendingCardChoices.delete(client.sessionId);
    client.send("card:applied", { cardId: card.id, towerIds: reachedTowerIds });
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
        if (this.playerHasUnlock(playerId, "nexus:mend")) {
          this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + NEXUS_MEND_HEAL);
        }
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
    // Oda listeden hemen dussun; bir sonraki lobi yayinini beklemesin.
    this.syncRoomRegistry();
    if (result === "defeat") {
      this.finishDefenseSummary();
      // Olunen dalga da karneye giriyor: raporun dalga seridi yenilginin
      // nerede geldigini gostermeli. Zaferde son dalga temizlenirken kapandi.
      this.closeRunWave(true);
    }
    this.setupPhase = false;
    this.setupReadyPlayerIds.clear();
    // Mac bitti; bekleyen kart eli artik bir sey degistirmiyor. Kopup geri
    // donen oyuncuya yeniden gonderilirse raporun altinda bir kart perdesi
    // kurulur, sesleri calar ve hic gorunmeyen kartlar gorulmus sayilirdi.
    // Bagli bir oyuncu burada el tutamaz: yenilgi yalnizca dalgada gelir,
    // dalga da ancak bagli herkes secimini yapinca basliyor.
    this.pendingCardChoices.clear();
    // Sonuc mesaji kendi basina yetsin: istemci kaydi (asama, ileride rekor)
    // bu mesajdan yaziyor ve yaratici kosu hic yazmamali. Bayrak yalnizca
    // aciksa gidiyor: `creative: undefined` anahtari yine telde yaziyor
    // (msgpack), o yuzden kosullu yayma.
    const payload: MatchResultPayload = {
      result,
      wave: this.wave,
      kills: this.kills,
      stage: this.stage,
      ...(this.creativeMode ? { creative: true } : {}),
      run: this.buildRunSummary(result)
    };
    this.matchResultPayload = payload;
    this.broadcast(`match:${result}`, payload);
  }

  /**
   * Dalgayi kosu defterinde kapatir ve karnesini herkese bir kez yollar.
   *
   * Karne takimin: sizinti ve temiz seri ortak, oldurme yuva basina. Kart
   * seciminden once gidiyor ki secim ekraninin basligi onu gosterebilsin;
   * savunma ozeti gibi sahibine ozel degil, o yuzden ayri bir mesaj.
   */
  private closeRunWave(died: boolean) {
    const record = this.runLedger.closeWave(this.wave, { died, slots: this.getRunSlots() });
    this.broadcast("wave:report", record);
    return record;
  }

  private buildRunSummary(result: "victory" | "defeat") {
    return this.runLedger.summarize({
      id: this.runId,
      result,
      stage: this.stage,
      wave: this.wave,
      creative: this.creativeMode,
      mapKey: getRunMapKey(this.mapScale),
      players: Array.from(this.state.players.values(), (player) => ({
        slot: player.slot ?? 0,
        name: player.name,
        characterId: player.characterId,
        cards: player.ownedCardIds ?? []
      }))
    });
  }

  /** Odadaki oyuncularin yuvalari; karnede hic oldurmeyen oyuncu da 0 olarak gorunsun. */
  private getRunSlots() {
    return Array.from(this.state.players.values(), (player) => player.slot ?? 0);
  }

  /** Oturumun yuvasi; oyuncu yoksa yok (sahipsiz oldurme takima yaziliyor). */
  private getPlayerSlot(sessionId: string | undefined) {
    if (!sessionId) return undefined;
    const player = this.state.players.get(sessionId);
    return player ? player.slot ?? 0 : undefined;
  }

  private spawnEnemy(champion?: WaveChampionPlan, special?: SpecialSpawnOptions) {
    // Ozel dusman normal dogumun zarini tuketmiyor (tur ve yer kendi zarindan).
    const roll = special ? 0 : Math.random();
    // Kusatma dusmani erken dalgalarda yok: duvar meta'si once kurulsun, cezasi
    // sonra gelsin. Karisim paylasilan pakette: sampiyon butcesi ayni
    // agirliklardan hesaplaniyor. Sampiyonun turu zardan degil plandan.
    const type: EnemyType = special?.type ?? champion?.type ?? pickWaveEnemyType(this.wave, roll);
    const definition = getEnemyCombatDefinition(type);
    const race = getStageRace(this.stage);
    // Sampiyon her zaman karada; karisik dalgada da (bkz. `getWaveChampionPlan`).
    const isFlyingEnemy = !champion && !special && isFlyingWaveSpawn(this.wave, this.waveSpawned + this.waveSlotOffset);
    const waveScale = getWaveHpMultiplier(this.wave);
    const airHealthMultiplier = isFlyingEnemy ? AIR_ENEMY_HEALTH_MULTIPLIER : 1;
    // Normal dusmanda 1: carpim degeri degistirmiyor, eski sayilar bire bir ayni.
    const championMultiplier = champion?.hpMultiple ?? special?.healthMultiplier ?? 1;
    const multiplayerHealth = 1 + Math.max(0, this.getActivePlayerCount() - 1) * 0.45;
    const maxHp = getWaveEnemyMaxHp(definition.maxHp, this.wave, airHealthMultiplier * championMultiplier) * multiplayerHealth;
    const maxShield = Math.round(definition.shield * waveScale * airHealthMultiplier * championMultiplier * multiplayerHealth);
    const speed = this.scaleWorldSpeed((definition.speed + this.wave * 2.4) * ENEMY_MOVEMENT_SPEED_MULTIPLIER);
    const pathId = 0;
    const start = special?.start ?? this.pickNormalSpawnPoint();
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
      // Yenilenme de kalinlikla carpiliyor: oransal yenilenme normal dusmanla ayni.
      healthRegenPerSecond: definition.healthRegenPerSecond * waveScale * championMultiplier,
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
      attackRange: this.scaleWorldDistance(definition.attackRange ?? 0),
      towerAttackCooldownMs: 0,
      pathDistance: 0,
      slowUntil: 0,
      freezeReadyAt: 0,
      coolantSlowUntil: 0,
      coolantSlowMultiplier: 1,
      auraSlowMultiplier: 1,
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
      pathId,
      ...(champion ? {
        champion: {
          replaced: champion.replaced,
          gold: champion.gold,
          exp: champion.exp,
          leakDamage: champion.leakDamage,
          reputation: champion.reputation,
          spawnedAt: Date.now()
        }
      } : {}),
      ...(special ? { special: { kind: special.kind, ...(special.budget ? { budget: special.budget } : {}) } } : {})
    });
    this.broadcastEnemySpawn(this.enemies.get(id)!);
  }

  /** Normal dogum yeri: ust satirda bos bir sutun. */
  private pickNormalSpawnPoint() {
    const openSpawnColumns = Array.from({ length: this.activeMap.cols }, (_, col) => col)
      .filter((col) => !this.getTowerAtCell(col, 0));
    const spawnCol = openSpawnColumns[Math.floor(Math.random() * Math.max(1, openSpawnColumns.length))] ?? 0;
    return gridToWorld(spawnCol, 0, this.activeMap);
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
    if (tower.energyShedUntil && tower.energyShedUntil > now) return false;
    if (tower.energyFrequencyUntil && tower.energyFrequencyUntil > now
      && (Math.floor(now / 250) + this.stableTowerHash(tower.id)) % 2 !== 0) return false;
    if (this.isTowerOnBackupLine(tower, now)) return true;
    const bridge = tower.energyBridgeUntil && tower.energyBridgeUntil > now && tower.energy <= 0;
    const scenarioCharge = (tower.energyScenarioCharge ?? 0) > 0;
    const emergencyShots = (tower.ammoEmergencyShots ?? 0) > 0;
    const source = this.getTowerEnergySource(tower, now);
    const freeEnergy = (source.energyFreeUntil ?? 0) > now;
    return (bridge || scenarioCharge || freeEnergy || getTowerEnergyState(this.getTowerAvailableEnergy(tower, now), tower.energyDepletedAt, now) === "powered")
      && (emergencyShots || tower.ammo >= this.getTowerAmmoCost(tower))
      && (bridge || scenarioCharge || freeEnergy || this.getTowerAvailableEnergy(tower, now) >= this.getTowerEnergyCost(tower));
  }

  private stableTowerHash(id: string) {
    return [...id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7) % 2;
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
    return calculateTowerAmmoCost(tower.definition, getTowerShotFuelModifierMultiplier(modifiers, "ammoCost"))
      * this.getWorkerBoostReduction(tower, "ammoCost");
  }

  private consumeTowerResources(tower: TowerModel) {
    const now = Date.now();
    const hadAmmo = tower.ammo > 0;
    const wasHeatLocked = tower.heatLocked;
    const onBackupLine = this.isTowerOnBackupLine(tower, now);
    const bridge = tower.energyBridgeUntil && tower.energyBridgeUntil > now && tower.energy <= 0;
    const emergencyShot = (tower.ammoEmergencyShots ?? 0) > 0 && tower.ammo < this.getTowerAmmoCost(tower);
    tower.ammo = Math.max(0, tower.ammo - (onBackupLine || emergencyShot ? BACKUP_LINE_AMMO_PER_SHOT : this.getTowerAmmoCost(tower)));
    if (emergencyShot) tower.ammoEmergencyShots = Math.max(0, (tower.ammoEmergencyShots ?? 0) - 1);
    const scenarioCharge = (tower.energyScenarioCharge ?? 0) > 0;
    const source = this.getTowerEnergySource(tower, now);
    const freeEnergy = (source.energyFreeUntil ?? 0) > now;
    if (!onBackupLine && !bridge && !scenarioCharge && !freeEnergy && this.getTowerEnergyCost(tower) > 0) this.consumeTowerEnergy(tower, this.getTowerEnergyCost(tower), now);
    if (scenarioCharge) tower.energyScenarioCharge = 0;
    if ((tower.ammoPayloadShots ?? 0) > 0) {
      tower.ammoPayloadShots = Math.max(0, (tower.ammoPayloadShots ?? 0) - 1);
      if (tower.ammoPayloadShots === 0) tower.ammoPayloadUntil = 0;
    }
    this.spendWorkerBoostShot(tower, "damageShots", now);
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

  /**
   * Performans kolunun ust yarisinin bedel carpani.
   *
   * Yalnizca kol yarinin ustundeyken is goruyor; asagida kalan bir kule
   * icin sonuc degismiyor. Sifirin altina inmiyor: bedeli negatife cekmek
   * kolu actikca **sogutan** bir kule uretirdi.
   */
  private getTowerPerformanceCostMultiplier(tower: TowerModel) {
    return getModifierMultiplier(this.getTowerRunModifiers(tower), "performanceCost");
  }

  private getTowerEnergyCost(tower: TowerModel) {
    const modifiers = this.getTowerRunModifiers(tower);
    return calculateTowerShotEnergyCost(
      tower.definition,
      tower.performance,
      getTowerShotFuelModifierMultiplier(modifiers, "energyCost"),
      this.getTowerPerformanceCostMultiplier(tower)
    ) * this.getWorkerBoostReduction(tower, "energyCost");
  }

  private getTowerShotHeat(tower: TowerModel) {
    return calculateTowerShotHeat(
      tower.definition,
      tower.performance,
      this.getTowerSpecialHeatMultiplier(tower),
      this.getTowerPerformanceCostMultiplier(tower)
    ) * getModifierMultiplier(this.getTowerRunModifiers(tower), "heat");
  }

  private getTowerSpecialHeatMultiplier(tower: TowerModel) {
    return this.getWorkerBoostReduction(tower, "heat");
  }

  /**
   * `withHeat` yalnizca surekli atis hesabi icin kapaniyor: o hesap kulenin
   * frensiz tam hizini isi dengesiyle karsilastiriyor.
   */
  private getTowerPerformanceAttackMultiplier(tower: TowerModel, withHeat = true) {
    const performanceMultiplier = tower.performance * 2
      * (this.hasRepairPerformanceBoost(tower) ? REPAIR_PERFORMANCE_MULTIPLIER : 1);
    return withHeat ? performanceMultiplier * this.getTowerHeatFireRateMultiplier(tower) : performanceMultiplier;
  }

  /**
   * Isi freninin atis hizi carpani; frende degilse 1.
   *
   * Ayri duruyor cunku kule durumu da ayni sayiyi yaziyor. Kopyalansa panel
   * bir kurali, savas baska bir kurali isletirdi.
   */
  private getTowerHeatFireRateMultiplier(tower: TowerModel) {
    // Termal Kutle yumusak tavani kaldirir: 50 derecenin ustunde atis hizi
    // dusmez. Karsiliginda kart sogumayi %60 kirptigi icin kule kilide daha
    // hizli kosar; takas gercek.
    if (this.towerHasUnlock(tower, "heat:thermalMass")) return 1;
    return tower.temperature <= TOWER_HEAT_BRAKE_TEMPERATURE
      ? 1
      : Math.max(0, (100 - tower.temperature) / (100 - TOWER_HEAT_BRAKE_TEMPERATURE));
  }

  /** Kulenin kilitlenme sicakligi. Kizgin Namlu hasari isiya baglar ve esigi indirir. */
  /**
   * Saniyede kac derece atiliyor.
   *
   * Radyator sicakla hizlanir: kule ne kadar isindiysa o kadar cok atar. Duz
   * bir sogutma artisindan farki, kisa patlamalari serbest birakip surekli
   * atesi yine cezalandirmasi -- egrinin sekli degisiyor, seviyesi degil.
   */
  /** Tamirci su anda bu kuleye dokunuyor mu; onarim odulleri buna bakiyor. */
  private isTowerUnderRepair(tower: TowerModel) {
    return tower.repairedUntil > Date.now();
  }

  /**
   * Kalibrasyon Turu bu kulede hala gecerli mi.
   *
   * Dalga numarasi karsilastirmasi kendini temizliyor: yeni dalga basladigi
   * anda esitlik bozuluyor, ayrica bir sifirlama gezintisi gerekmiyor.
   */
  private hasRepairPerformanceBoost(tower: TowerModel) {
    return tower.repairPerformanceWave === this.wave
      && this.towerHasUnlock(tower, "repair:performanceCeiling");
  }

  /**
   * `temperature` ve `sustained` yalnizca surekli atis hesabi icin: Radyator
   * o hesapta kulenin surekli ateste oturdugu sicaklikta okunuyor, Namlu
   * Molasi ise hic girmiyor, cunku yalnizca kule atamazken isliyor. Savas
   * cagrilari varsayilanla kulenin o anki halini kullaniyor.
   */
  private getTowerCoolingPerSecond(tower: TowerModel, options: { temperature?: number; sustained?: boolean } = {}) {
    const temperature = options.temperature ?? tower.temperature;
    let cooling = TOWER_COOLING_PER_SECOND * getModifierMultiplier(this.getTowerRunModifiers(tower), "cooling")
      * (1 + (this.getWorkerBoost(tower, "cooling")?.value ?? 0));

    if (this.isTowerUnderRepair(tower) && this.towerHasUnlock(tower, "repair:coolingBoost")) {
      cooling *= 1 + REPAIR_COOLING_BONUS;
    }

    if (this.towerHasUnlock(tower, "heat:radiator")) {
      cooling *= 1 + (Math.max(0, temperature) / 100) * RADIATOR_COOLING_BONUS_AT_MAX;
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

    if (!options.sustained && this.towerHasUnlock(tower, "heat:emptyVent") && tower.ammo <= 0) {
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

  private adjustIntervalForPerformanceAndHeat(tower: TowerModel, interval: number, withHeat = true) {
    return interval / Math.max(0.01, this.getTowerPerformanceAttackMultiplier(tower, withHeat));
  }

  /**
   * Kulenin isi butcesiyle uzun vadede surdurebildigi tetikleme hizi.
   *
   * Isi dengesi: uzun vadede uretilen isi sogumayla atilani gecemez, yani kule
   * saniyede `soguma / tetikleme isisi` kadardan fazla tetikleyemez. Fren onu
   * oraya yumusakca indiriyor; Termal Kutle'de ve sabit aralikli kulede ayni
   * tavana kilit-acilma dongusuyle variliyor. Bu yuzden onlar istisna degil:
   * Termal Kutle'yi "isiya takilmaz" saymak soguma cezasini gizler, karti
   * bedava gosterirdi. Birim tetikleme: Cifte Namlu'da bir tetik iki mermi.
   *
   * Birim oyun saniyesi. Radyator kulenin surekli ateste oturdugu sicaklikta
   * okunuyor (`getTowerHeatSettleCooling`): anlik sicaklikla okunsaydi soguk
   * kulede kart hicbir sey degistirmiyor gorunur, savasta da sayi her anlik
   * goruntude oynardi. Namlu Molasi hic girmiyor, cunku yalnizca kule
   * atamazken isliyor. Bu ikisi disinda onizlemedeki "Soğutma / sn" ile
   * ayni; Buz Akusu, Soguk Zincir ve onarim anlik haliyle giriyor, olay basina
   * gelen sogutma (oldurme, isci) giremiyor, cunku bir hizi yok.
   *
   * Isiyi hic baglamayan yapida tanimsiz: kaynak binasi, ates etmeyen yapi,
   * Sunucu (hic tetiklemiyor), ucgeni kurulmamis Sentez (hic ates etmiyor) ve
   * kendi aralik ve isi penceresiyle calisan Debug Lazer asiri yuklemesi.
   */
  private getTowerHeatBudget(tower: TowerModel) {
    const definition = tower.definition;
    if (definition.resourceProvider || !isOperationalTower(definition) || definition.id === "warrior-2") return undefined;
    if (definition.id === "warrior-5" && tower.debugOverdriveUntil > Date.now()) return undefined;
    if (definition.id === "zeynep-3" && !this.getZeynepSynthesisComposition(tower).mode) return undefined;
    // Yorunge isiyi atis basina degil donus hizina gore uretiyor; tanimli
    // aralik basina dusen isi, tetikleme isisinin karsiligi.
    const heatPerAttack = definition.engine?.attack.executor === "orbit"
      ? calculateOrbitContinuousCosts(1, definition.fireIntervalMs / 1000).heat * getModifierMultiplier(this.getTowerRunModifiers(tower), "heat")
      : this.getTowerShotHeat(tower) * this.getTowerShotsPerTrigger(tower);
    if (!(heatPerAttack > 0)) return undefined;
    const nominal = 1000 / Math.max(1, this.getTowerEffectInterval(tower, false));
    return { nominal, sustained: Math.min(nominal, this.getTowerHeatSettleCooling(tower, nominal, heatPerAttack) / heatPerAttack) };
  }

  /**
   * Surekli ateste kulenin saniyedeki sogumasi.
   *
   * Radyatorsuz kulede anlik soguma (Namlu Molasi haric). Radyator sicaklikla
   * buyudugu icin kulenin oturdugu sicaklik bulunuyor: frenli kulede isi
   * uretimi `tam hiz * (100 - T) / 50 * isi`, soguma `taban * (1 + R * T / 100)`;
   * ikisi T'de dogrusal, denge dogrudan cozuluyor. Termal Kutle ve sabit
   * aralikli kule kilit ile acilma arasinda gidip geliyor; ortalamasi alinir.
   * Sonuc frenin basladigi sicaklik ile kilit arasina sikistiriliyor: altinda
   * kule zaten tam hizda, ustunde atamiyor.
   */
  private getTowerHeatSettleCooling(tower: TowerModel, nominal: number, heatPerAttack: number) {
    if (!this.towerHasUnlock(tower, "heat:radiator")) return this.getTowerCoolingPerSecond(tower, { sustained: true });
    const base = this.getTowerCoolingPerSecond(tower, { temperature: 0, sustained: true });
    const lock = this.getTowerHeatLockThreshold(tower);
    let settle: number;
    if (this.towerHasUnlock(tower, "heat:thermalMass") || tower.definition.engine?.fixedFireInterval) {
      settle = (this.getTowerHeatReleaseThreshold(tower) + lock) / 2;
    } else {
      const k = nominal * heatPerAttack / (100 - TOWER_HEAT_BRAKE_TEMPERATURE);
      settle = (100 * k - base) / Math.max(1e-9, k + base * RADIATOR_COOLING_BONUS_AT_MAX / 100);
    }
    settle = Math.min(lock, Math.max(TOWER_HEAT_BRAKE_TEMPERATURE, settle));
    return this.getTowerCoolingPerSecond(tower, { temperature: settle, sustained: true });
  }

  /**
   * Kule panelinin surekli atis sayisi (`TowerStatsWire.su`); yalnizca isi
   * tam hizi kisiyorsa. Eskiden her karede her kule icin anlik goruntuye
   * yaziliyordu; artik yalnizca panelin istedigi kule icin okunuyor.
   */
  private getSustainedAttacksPerSecond(tower: TowerModel) {
    const budget = this.getTowerHeatBudget(tower);
    if (!budget) return undefined;
    const sustained = Math.round(budget.sustained * 100) / 100;
    return sustained < Math.round(budget.nominal * 100) / 100 ? sustained : undefined;
  }

  private updateTowers(deltaTime: number) {
    const now = Date.now();
    this.settleDebugSweepRuns(now);
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
        // Kararli Akis: calisma enerjisi bir sure hic harcanmiyor.
        const upkeep = this.getWorkerBoost(tower, "upkeepFree", now)
          ? 0
          : calculateTowerOperatingEnergy(tower.definition, deltaTime / 1000, getModifierMultiplier(this.getTowerRunModifiers(tower), "operatingEnergyCost"));
        tower.energy = Math.max(0, tower.energy - upkeep);
        if (tower.energy <= 0 && tower.energyDepletedAt <= 0) tower.energyDepletedAt = now;
        if (tower.energy > 0) tower.energyDepletedAt = 0;
        if (tower.wakeReadyAt > now) continue;
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
            this.deleteDebugLaserOverdriveBeams(tower);
            continue;
          }
          this.consumeTowerResources(tower);
          // Normal lazerle ayni ritim. Eskiden sabit 220 ms'ydi (kaynak
          // tuketiminin araligi olarak kalmisti): seviyenin araligini ve atis
          // hizi carpanlarini -- Izolasyon pasifi dahil -- atliyor, kirisin
          // altindaki dusman normal lazerdekinin yarisindan az vuruluyordu.
          tower.cooldownMs = this.getTowerFireInterval(tower);
          firesThisTick = true;
        }
        this.updateDebugLaserSweep(tower, firesThisTick);
        continue;
      }

      if (tower.definition.id === "warrior-5" && tower.debugSweepStartedAt > 0) {
        // Asiri yukleme dogal sonuna vardi: ters donen kirislerin son
        // vurustan bitise kadar taradigi yay burada kapatiliyor (yoksa son
        // dilim, yani baslangic acisi, hic vurulmazdi), sonra her sey sifir.
        this.finishDebugLaserOverdrive(tower, now);
        // Kapanisin oldurmeleri de "Tarama: N öldü" sayisina girdi; kayit simdi kapaniyor.
        this.finishDebugSweepRun(tower.id);
        // Normal lazer kirisin durdugu yerden devam ediyor: namlu asiri yukleme
        // boyunca eski acisinda kaliyordu ve geri donerken kiris ~1 sn kayboluyordu.
        if (Number.isFinite(tower.debugSweepAngle)) tower.facing = tower.debugSweepAngle;
        tower.debugSweepStartedAt = 0;
        tower.debugSweepTargetIds = [];
        tower.debugSweepAngleAt = 0;
        tower.debugSweepLastDamageAt = 0;
        tower.debugOverdriveHeatLastAt = 0;
        tower.debugTwinStartAngle = undefined;
        // Yalnizca donen kirisler kalkiyor; zincir kirisi omru dolana ya da
        // normal lazerin kirisi onun yerine yazilana kadar kaliyor (bosluk yok).
        for (const id of getDebugLaserTwinBeamIds(tower.id)) this.beams.delete(id);
      }

      if (tower.definition.id === "warrior-2") {
        continue;
      }

      const activeAuras = this.getActiveTowerAuras(tower);
      // Tik basina bir kez yaziliyor: anlik goruntunun ayrica hesaplamasi,
      // kule basina yalnizlik taramasi demekti.
      tower.auraActive = activeAuras.length > 0;
      if (activeAuras.length > 0) {
        if (!this.setupPhase && tower.cooldownMs <= 0 && this.canTowerFire(tower)) {
          this.consumeTowerResources(tower);
          const interval = this.getTowerAuraTickInterval(tower, activeAuras);
          const refreshMultiplier = Math.max(...activeAuras.map((aura) => aura.refreshDurationMultiplier ?? AURA_REFRESH_DURATION_MULTIPLIER));
          tower.cooldownMs = interval;
          tower.auraExpiresAt = now + interval * refreshMultiplier;
          // Vurus yapmayan kulenin "vurusu" bu: etki araligi. Sogutma
          // Kanali burada uygulaniyor, yani aura kulesi de karti her
          // tikta bir kez kullaniyor -- her karede degil.
          if (this.towerHasUnlock(tower, "status:coolantSlow")) {
            const range = this.getTowerRange(tower);
            for (const enemy of this.getEnemiesNear(tower.x, tower.y, range)) {
              if (distanceSq(tower.x, tower.y, enemy.x, enemy.y) > range * range) continue;
              this.applyCoolantSlow(tower, enemy, now);
            }
          }
        }
        this.applyTowerEnemyAuras(tower, activeAuras, deltaTime / 1000);
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
      // Cifte Namlu: ikinci mermi de ayni tetikten cikiyor ama kaynagi
      // ayrica tuketiyor. Bedava olsaydi kart hasari iki katina cikaran
      // sade bir carpan olurdu; boyle oldugunda muhimmat hatti ve isi
      // butcesi de ikiye katlaniyor, yani karsiligi var.
      if (this.towerHasUnlock(tower, "attack:doubleShot") && this.canTowerFire(tower)) {
        this.consumeTowerResources(tower);
        this.spawnTowerProjectile(tower, target);
      }
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
      canHitAir: this.canTowerHitAir(tower)
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
      this.pendingOrbitHit = { towerId: tower.id, enemyId: enemy.id };
      try {
        this.damageEnemyFromTower(tower, enemy, this.getTowerDamage(tower), 0);
      } finally {
        this.pendingOrbitHit = undefined;
      }
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
  private aimTowerAt(tower: TowerModel, target: { x: number; y: number; id?: string } | undefined, deltaSeconds: number) {
    // Namlunun su an dondugu dusman. `aimTargetId` yalnizca hedef seciminin
    // yazdigi kilit; Oluler Bagi, Kirik Ayna'nin patlamasi ve gudumlu donusler
    // namluyu baska bir dusmana ceviriyor. Hedefe bakan kosullu paylar
    // (Ongorulu Takip) bunu okuyor.
    tower.turnTargetId = target?.id ?? "";
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
    // Kosullu paylar (Av Refleksi'nin penceresi, Ongorulu Takip'in hizli
    // hedefi) modifier havuzuna eklenir, ayri bir carpan olarak degil --
    // kartin metni "+%150" diyor, "x2,5" degil. Cevrimler de ayni sayiyi
    // okuyor (`getTowerStatBonus`).
    const modifiers = this.getTowerRunModifiers(tower);
    const turnRate = Math.max(0, 1 + this.getTowerStatBonus(tower, "turnRate", modifiers)) * TOWER_TURN_RATE_RADIANS_PER_SECOND;
    tower.facing = rotateTowerTowards(tower.facing, targetAngle, deltaSeconds, turnRate);
    const accuracyBonus = this.getTowerStatBonus(tower, "accuracy", modifiers);
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
    )) * this.getTowerProjectileSpeedMultiplier(tower);
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
      // Seviye buyumesi yalnizca **zaten alani olan** kuleye isliyor.
      //
      // Buyume kosulsuz eklenirken tek hedefe atan bir kule seviye atladikca
      // sessizce alan silahina donusuyordu: Hiza Emri tanimda 0 yaricap
      // bildirdigi halde mermisi 2. seviyede 5, 10. seviyede 45 birimlik bir
      // patlama tasiyordu -- kule izgarasinin bir buçuk karesi. Delip iki
      // dusmana carpmasi gereken bir mermi surunun ortasina dustugunde
      // hepsini birden oldurüyordu.
      aoeRadius: this.getTowerAoeRadius(tower) > 0
        ? this.scaleWorldDistance(this.getTowerAoeRadius(tower) + (tower.level - 1) * 5)
        : 0,
      // Yavaslatma da alan gibi kosullu: bildirmeyen kule seviyeyle
      // kazanmiyor. Buyume kosulsuzken yavaslatmasi olmayan 22 kule 10.
      // seviyede her vurusta 810 ms yavaslatiyordu -- Baransel'in meteoru,
      // Omer'in kuleleri, Ucube. Kimsenin aciklamasinda yazmayan bir kontrol
      // etkisiydi ve kontrol kulelerinin kimligini de bosa cikariyordu.
      slowMs: getTowerSlowDurationMs(tower.definition) > 0
        ? getTowerSlowDurationMs(tower.definition) + (tower.level - 1) * 90
        : 0,
      pierceLimit: (this.getTowerEngine(tower)?.attack.pierceCount ?? 1) + this.getWorkerPierceBonus(tower),
      armorBreakAmount: getModifierAdd(this.getTowerRunModifiers(tower), "armorBreak"),
      piercedEnemyIds: [],
      luck: tower.characterId === "onur" ? tower.lastLuckMultiplier : undefined
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
      * this.getTowerProjectileSpeedMultiplier(sourceTower);
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
      piercedEnemyIds: [],
      luck: sourceTower.characterId === "onur" ? sourceTower.lastLuckMultiplier : undefined
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
    tower.debugSweepRouteAngles = undefined;
    tower.debugSweepRouteAngles = this.getDebugLaserSweepAngles(tower);
    if (tower.debugSweepRouteAngles.length === 0) {
      tower.debugSweepRouteAngles.push(Number.isFinite(target.x) && Number.isFinite(target.y)
        ? Math.atan2(target.y - tower.y, target.x - tower.x) : tower.facing);
    }
    // Ilk kare bir donus degil, dogus: kiris zincirin basinda aciliyor.
    tower.debugSweepAngle = this.getDebugLaserSweepAngles(tower)[0] ?? tower.facing;
    tower.debugSweepAngleAt = now;
    tower.debugSweepDamageAngle = tower.debugSweepAngle;
    tower.debugSweepDamageAngleAt = 0;
    tower.debugSweepLastDamageAt = 0;
    // 10. seviye: zincir kirisine ek olarak iki ters donen kiris, zincirin
    // dogdugu acidan ve zincirden bagimsiz.
    tower.debugTwinStartAngle = tower.level >= DEBUG_LASER_TWIN_OVERDRIVE_LEVEL ? tower.debugSweepAngle : undefined;
    if (tower.debugTwinStartAngle === undefined) {
      for (const id of getDebugLaserTwinBeamIds(tower.id)) this.beams.delete(id);
    }
    tower.debugOverdriveHeatLastAt = now;
    tower.debugOverdriveUntil = now + scaleGameDuration(DEBUG_LASER_OVERDRIVE_DURATION_MS);
    this.updateDebugLaserSweep(tower);
  }

  /**
   * Isinin rengi.
   *
   * Yalnizca Debug Lazer kademeyle isiniyor; obur kuleler kendi kimlik
   * renklerinde kaliyor. Kademe yoksa ya da baska bir kuleyse eski renkler.
   */
  private getDebugLaserBeamColor(tower: TowerModel, overdrive: boolean) {
    const fallback = overdrive ? 0xfbbf24 : 0xfb7185;
    if (tower.definition.id !== "warrior-5") {
      return fallback;
    }
    const tierColors = DEBUG_LASER_TIER_COLORS[getTowerTier(tower.level)];
    if (!tierColors) {
      return fallback;
    }
    return overdrive ? tierColors.overdrive : tierColors.beam;
  }

  /**
   * Asiri yuklemenin butun kirislerini kaldirir: zincir kirisi (normal lazerin
   * kirisine donmusse dokunulmuyor) ve 10. seviyenin iki ters donen kirisi.
   */
  private deleteDebugLaserOverdriveBeams(tower: TowerModel) {
    const mainId = `beam-${tower.id}`;
    if (this.beams.get(mainId)?.overdrive) this.beams.delete(mainId);
    for (const id of getDebugLaserTwinBeamIds(tower.id)) this.beams.delete(id);
  }

  private setBeam(tower: TowerModel, x2: number, y2: number, overdrive: boolean, scanX?: number, scanY?: number, id = `beam-${tower.id}`) {
    const ttlMs = overdrive ? Math.max(180, this.getTowerFireInterval(tower) + 90) : Math.max(260, this.getTowerFireInterval(tower) + 90);
    this.beams.set(id, {
      id,
      definitionId: tower.definition.id,
      x1: tower.x,
      y1: tower.y,
      x2,
      y2,
      scanX,
      scanY,
      width: overdrive ? 8 : 4,
      color: this.getDebugLaserBeamColor(tower, overdrive),
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
      // Ucube'nin limonu: mermisi ve zinciri ayni ton ailesinde (eskiden gok mavisi).
      color: 0xadf765,
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
        canHitAir: this.canTowerHitAir(tower)
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

  private getZeynepFormationGroup(tower: TowerModel): readonly TowerModel[] {
    const cache = this.tickLayoutCache?.synthesisGroups;
    const cached = cache?.get(tower);
    if (cached) return cached;
    // Kural paylasilan pakette: istemci onizlemesi ayni zinciri kuruyor.
    const group = collectZeynepSynthesisGroup(tower, this.towers.values(), getMapGridSize(this.activeMap));
    cache?.set(tower, group);
    return group;
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
        * this.getTowerProjectileSpeedMultiplier(tower),
      bandDepth: this.scaleWorldDistance(KIN_WAVE_BAND_DEPTH),
      slowMs: getTowerSlowDurationMs(tower.definition) > 0
        ? getTowerSlowDurationMs(tower.definition) + (tower.level - 1) * 80
        : 0,
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
        canHitAir: this.canTowerHitAir(tower)
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

  /**
   * Kin yavaslatmasi: kulenin dibinde %0, menzil ucunda %40, arasi dogrusal.
   *
   * Kesir yavaslatma tabanina dogrudan yaziliyor (oteki kule yavaslatmalari
   * gibi), Buz Kirigi kritigi de ona isliyor: menzil ucunda %60. Eskiden
   * mesafe carpani ayri bir kanaldaydi ve kulenin yanina duz %52'lik bir
   * yavaslatma durumu da yaziliyordu; `min` icinde duz olan hep kazaniyordu,
   * yani panelin "-%0...-%40 (uzaklikla)" sozu hicbir mesafede tutmuyordu.
   *
   * Dibinde yakalanan dusmana hic yavaslatma yazilmiyor: sifir kesir kayit
   * birakmiyor ve kayitsiz `slowUntil` duz 0,48'e dusecekti.
   */
  private applyKinSlow(enemy: EnemyModel, tower: TowerModel, distanceFromTower: number, range: number, slowMs: number) {
    const now = Date.now();
    const ratio = this.getKinDistanceRatio(distanceFromTower, range);
    const multiplier = this.clamp(
      KIN_SLOW_NEAR_MULTIPLIER + (KIN_SLOW_FAR_MULTIPLIER - KIN_SLOW_NEAR_MULTIPLIER) * ratio,
      KIN_SLOW_FAR_MULTIPLIER,
      KIN_SLOW_NEAR_MULTIPLIER
    );
    const slowFraction = 1 - multiplier;
    // Her temas yeniden hesaplaniyor (kartin sozu: "ust uste binmez"): kule
    // basina tek kayit, kritik de olsa bir sonraki temas onun yerine geciyor.
    const slowFloorKey = `${tower.id}:kin`;
    if (slowFraction <= 0) {
      this.removeEnemySlowFloor(enemy, slowFloorKey);
      return;
    }
    if (this.applyConfiguredTowerStatus(tower, enemy, "slow", now, { durationMs: slowMs, scalingFactor: ratio, slowFraction, slowFloorKey })) return;
    // Taht'in Kin mermisi (zeynep-3) tanimda yavaslatma bildirmiyor: ayni
    // kural, tanim yerine burada. Sure eskisi gibi kart carpansiz.
    this.applyEnemyStatusEffect(enemy, { type: "slow", magnitude: 1, durationMs: slowMs, stacking: "refresh" }, now, {
      slowFraction: this.rollTowerSlowFraction(tower, undefined, tower.level, enemy, slowFraction),
      slowFloorKey,
      sourceTowerId: tower.id,
      sourceOwnerId: tower.ownerId
    });
  }

  private applyEnemyStatusEffect(
    enemy: EnemyModel,
    definition: TowerStatusEffectDefinition,
    now: number,
    overrides: { durationMs?: number; magnitude?: number; scalingFactor?: number; sourceTowerId?: string; sourceOwnerId?: string; slowFraction?: number; slowFloorKey?: string } = {}
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
      // Hizi durumun `magnitude` degeri degil yavaslatma kesri belirliyor;
      // bildirilmemisse duz %52. Sure durumla ayni hesap (direnc dahil),
      // ama bu vurusun kendi suresi: ortak durumun en gec bitisi degil.
      //
      // `slowUntil` yalnizca `addEnemySlowFloor` icinden buyuyor. Durumun
      // `expiresAt`i eski ve yeni bitisin en buyugu; ondan yazilsaydi kaydi
      // bitmis eski bir yavaslatma `slowUntil`i uzatir ve taban bitince hiz
      // kayitsiz `slowUntil` yedegine (duz 0,48) duserdi.
      const durationMs = applyStatusResistance(scaledDefinition.durationMs, enemy.statusResistances.slow);
      // Sifir kesir kayit birakmiyor: kayitsiz bir `slowUntil` duz 0,48
      // sayiliyor, yani "yavaslatmayan" vurus dusmani %52 yavaslatirdi.
      if (durationMs > 0 && (overrides.slowFraction ?? SLOW_STATUS_FRACTION) > 0) {
        this.addEnemySlowFloor(
          enemy,
          1 - (overrides.slowFraction ?? SLOW_STATUS_FRACTION),
          now + durationMs,
          overrides.sourceTowerId ?? "flat",
          now,
          overrides.slowFloorKey,
          overrides.sourceOwnerId
        );
      }
    } else if (definition.type === "fear") {
      enemy.fearUntil = Math.max(enemy.fearUntil, state.expiresAt);
    } else if (definition.type === "stun") {
      enemy.melisDoubtHesitateUntil = Math.max(enemy.melisDoubtHesitateUntil, state.expiresAt);
    }
    return state;
  }

  /**
   * Bir yavaslatmanin hiz tabanini kaydeder; bitmis kayitlari da temizler.
   *
   * Ayni kaynak ayni gucte yeniden vurursa kayit yalnizca uzuyor. Kayitlar
   * en fazla kule basina iki (kritikli/kritiksiz) ve sureleri bir saniye
   * mertebesinde, yani tablo kucuk kaliyor.
   */
  private addEnemySlowFloor(enemy: EnemyModel, speedMultiplier: number, expiresAt: number, sourceKey: string, now: number, replaceKey?: string, ownerId?: string) {
    const floors = enemy.slowSpeedFloors ?? (enemy.slowSpeedFloors = {});
    for (const key in floors) {
      if (floors[key].expiresAt <= now) delete floors[key];
    }
    const safeMultiplier = Math.max(0, Math.min(1, speedMultiplier));
    if (replaceKey) {
      // Yeniden hesaplanan yavaslatma (Kin): her temas kendi kaydinin
      // yerine geciyor, daha zayif ya da daha kisa olsa bile.
      floors[replaceKey] = { speedMultiplier: safeMultiplier, expiresAt, ...(ownerId ? { ownerId } : {}) };
      this.syncEnemySlowUntil(enemy);
      return;
    }
    // Kulesiz (duz) kayit sahibine gore ayriliyor: iki oyuncunun ayni
    // guclu yetenegi tek kayda dussaydi son yazan oburunun asistini silerdi.
    const key = `${sourceKey === "flat" && ownerId ? `flat@${ownerId}` : sourceKey}:${safeMultiplier.toFixed(3)}`;
    const owner = ownerId ?? floors[key]?.ownerId;
    floors[key] = { speedMultiplier: safeMultiplier, expiresAt: Math.max(floors[key]?.expiresAt ?? 0, expiresAt), ...(owner ? { ownerId: owner } : {}) };
    enemy.slowUntil = Math.max(enemy.slowUntil, expiresAt);
  }

  /** Bir kaydi siler (Kin'in dibinde yakalanan dusman: yavaslatma yok). */
  private removeEnemySlowFloor(enemy: EnemyModel, key: string) {
    if (!enemy.slowSpeedFloors?.[key]) return;
    delete enemy.slowSpeedFloors[key];
    this.syncEnemySlowUntil(enemy);
  }

  /**
   * `slowUntil`i kayitlarin en gec bitisine ceker. Kisalan ya da silinen
   * bir kayittan sonra gerekli: yoksa kayitsiz kalan `slowUntil` duz 0,48
   * yedegine duserdi.
   */
  private syncEnemySlowUntil(enemy: EnemyModel) {
    let latest = 0;
    for (const key in enemy.slowSpeedFloors ?? {}) latest = Math.max(latest, enemy.slowSpeedFloors![key].expiresAt);
    enemy.slowUntil = latest;
  }

  /**
   * Durum yolundan gecmeyen duz yavaslatmalar (isci mermisi, reaktor,
   * ulti): eskisi gibi %52, ama kaydi ayni tabloda ki daha guclu ya da
   * daha zayif bir kule yavaslatmasiyla `min` icinde dogru yarissin.
   */
  private extendFlatSlow(enemy: EnemyModel, until: number, now: number) {
    if (until <= now) return;
    this.addEnemySlowFloor(enemy, SLOW_STATUS_SPEED_MULTIPLIER, until, "flat", now);
  }

  /**
   * Yavaslatmalarin dusman hizina verdigi carpan: aktif olanlarin en
   * guclusu. Kaydi olmayan bir `slowUntil` (eski kayitlar, testlerin elle
   * yazdigi deger) duz yavaslatma sayiliyor.
   */
  private getEnemySlowSpeedMultiplier(enemy: EnemyModel, now: number) {
    if (enemy.slowUntil <= now) return 1;
    let multiplier = 1;
    let active = false;
    const floors = enemy.slowSpeedFloors;
    if (floors) {
      for (const key in floors) {
        const floor = floors[key];
        if (floor.expiresAt <= now) continue;
        active = true;
        if (floor.speedMultiplier < multiplier) multiplier = floor.speedMultiplier;
      }
    }
    return active ? multiplier : SLOW_STATUS_SPEED_MULTIPLIER;
  }

  /**
   * Bir kule vurusunun yavaslatma kesri; Buz Kirigi zari burada.
   *
   * Kesir tanimdan (`slowByLevel` varsa seviyeden, yoksa duz %52). Kritik
   * gelirse 1,5 kat, %90 tavanla; oyuncu gorsun diye `slow:critical`
   * yayiniyor. Butun kule vurus yavaslatmalari bu kapidan geciyor.
   */
  private rollTowerSlowFraction(tower: TowerModel | undefined, definition: TowerStatusEffectDefinition | undefined, level: number, enemy: EnemyModel, baseFraction?: number) {
    const fraction = baseFraction ?? getStatusSlowFraction(definition, level);
    // Sifir yavaslatma kritik gelemez: 0 x 1,5 hala sifir ve "kritik"
    // patlamasi yavaslamayan bir dusmanin uzerinde yalan olurdu.
    if (!tower || fraction <= 0 || !this.rollSlowCrit(tower)) return fraction;
    this.broadcastSlowCritical(tower, enemy);
    return getCriticalSlowFraction(fraction);
  }

  /**
   * Kritik yavaslatmanin gorsel isareti; kule basina 150 ms'de bir.
   *
   * Zar her dusmana ayri atiliyor: alan vuran bir kule tek vurusta bir
   * suruye kritik yavaslatma verebiliyor ve hizli atan Izolasyon bunu
   * saniyede onlarca kez yapar. Her biri ayri mesaj olsaydi tel ve ekran
   * ayni patlamayla dolardi; biri yeterince soyluyor. Ayni vurusta olen
   * dusmana yayin yok -- yavaslatacak kimse kalmadi.
   */
  private broadcastSlowCritical(tower: TowerModel, enemy: EnemyModel, now = Date.now()) {
    if (enemy.hp <= 0 || !this.enemies.has(enemy.id)) return;
    const last = this.slowCritBroadcastAt.get(tower.id);
    if (last !== undefined && now - last < SLOW_CRIT_BROADCAST_INTERVAL_MS) return;
    if (this.slowCritBroadcastAt.size > 256) {
      for (const towerId of this.slowCritBroadcastAt.keys()) {
        if (!this.towers.has(towerId)) this.slowCritBroadcastAt.delete(towerId);
      }
    }
    this.slowCritBroadcastAt.set(tower.id, now);
    this.broadcast("slow:critical", { enemyId: enemy.id, towerId: tower.id, x: roundNetworkNumber(enemy.x), y: roundNetworkNumber(enemy.y) });
  }

  private applyConfiguredTowerStatus(
    tower: TowerModel,
    enemy: EnemyModel,
    type: TowerStatusEffectDefinition["type"],
    now: number,
    overrides: { durationMs?: number; magnitude?: number; scalingFactor?: number; sourceOwnerId?: string; slowFraction?: number; slowFloorKey?: string } = {}
  ) {
    const definition = this.getTowerEngine(tower)?.statusEffects?.find((effect) => effect.type === type);
    if (!definition) return undefined;
    const modifiers = this.getTowerRunModifiers(tower);
    return this.applyEnemyStatusEffect(enemy, definition, now, {
      durationMs: (overrides.durationMs ?? definition.durationMs) * getModifierMultiplier(modifiers, "statusDuration"),
      magnitude: (overrides.magnitude ?? definition.magnitude) * getModifierMultiplier(modifiers, "statusMagnitude"),
      // Buz Kirigi yalnizca yavaslatmaya bakiyor: yanma ya da lanet kritik
      // gelseydi kart "durum etkileri kritik gelebilir" olurdu ve o baska
      // bir kart. Kritik `magnitude`a degil kesre isliyor -- hiz kesirden.
      ...(definition.type === "slow" ? { slowFraction: this.rollTowerSlowFraction(tower, definition, tower.level, enemy, overrides.slowFraction), slowFloorKey: overrides.slowFloorKey } : {}),
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
    const definitions = (this.getTowerEngine(tower)?.stacks ?? [])
      .filter((definition) => definition.stat === stat);
    if (stat === "fireRate") {
      const speedAdd = definitions.reduce((sum, definition) =>
        sum + 1 / getTowerStackMultiplier(tower.stackStates[definition.id], definition, now) - 1, 0);
      return 1 / Math.max(0.01, 1 + speedAdd);
    }
    return definitions
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
    // Hedef Kilidi: hedef degisse de, hedef kalmasa da birikimler duruyor.
    if (this.getWorkerBoost(tower, "stackGuard")) return;
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
      } else if (effect === "marked-overdrive" && context.target && tower.level >= DEBUG_LASER_OVERDRIVE_UNLOCK_LEVEL) {
        // Asiri yukleme 5. seviyede aciliyor; altinda isaretli oldurme siradan bir oldurme.
        this.startDebugLaserOverdrive(tower, context.target, context.now ?? Date.now());
        this.noteMarkedOverdriveStarted(tower, context.now ?? Date.now());
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
    const pierceLimit = 2 + this.getZeynepSynthesisAmplifierBonus(tower.ownerId, "1-1") + this.getWorkerPierceBonus(tower);

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
      // Yanigin camgobegi kor: flasla ayni kimlik (eskiden kahverengi bir serit).
      color: 0x0e7490,
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
        * this.getTowerProjectileSpeedMultiplier(tower),
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
    const tailDistance = Math.max(0, headDistance - this.scaleWorldDistance(ZEYNEP_SYNTHESIS_RAY_LENGTH));
    const tail = getPointOnRaySegments(ray.segments, tailDistance);
    return {
      x1: tail.x,
      y1: tail.y,
      x2: ray.x,
      y2: ray.y,
      // Gorunen parca bir sekmeyi asiyorsa koseleri: istemci isini kirik ciziyor.
      bounces: getRayBounceVertices(ray.segments, tailDistance, headDistance)
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

  private setZeynepRayBeam(ray: ZeynepRayModel, segment: { x1: number; y1: number; x2: number; y2: number; bounces?: number[] }) {
    const id = `zeynep-ray-${ray.id}`;
    // Sekmeden sonraki renk Taht leylagi: eski 0xfdf2f8 beyazdan ayirt edilmiyordu
    // ve kademe 3'te isin tumuyle beyaz okunuyordu.
    const baseColor = ray.segmentIndex === 0 ? 0xe879f9 : 0xf0abfc;
    this.beams.set(id, {
      id,
      definitionId: "zeynep-3-ray",
      tier: this.getBeamTier(ray.towerId),
      x1: segment.x1,
      y1: segment.y1,
      x2: segment.x2,
      y2: segment.y2,
      width: this.scaleWorldDistance(ZEYNEP_SYNTHESIS_BEAM_RADIUS * 2),
      color: ray.abartiLevel > 0 ? this.getAbartiDarkenedBeamColor(baseColor, ray.abartiLevel) : baseColor,
      overdrive: false,
      ttlMs: ZEYNEP_SYNTHESIS_RAY_TRAIL_TTL_MS,
      // Yalnizca sekme gorunurken; yoksa anahtar hic yazilmiyor.
      ...(segment.bounces ? { b: segment.bounces } : {})
    });
  }

  private spawnZeynepSynthesisProjectile(tower: TowerModel, target: EnemyModel, damage: number, speed: number, damageType: DamageType, pierceLimit: number, definitionId = tower.definition.id) {
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const launchAngle = towerAims(tower.definition.id) ? tower.facing : Math.atan2(dy, dx);
    const hitType = tower.definition.hitType ?? "projectile";
    const projectileSpeed = this.scaleWorldSpeed(getBallisticMovementSpeed(speed, hitType))
      * this.getTowerProjectileSpeedMultiplier(tower);
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
      piercedEnemyIds: [],
      luck: tower.characterId === "onur" ? tower.lastLuckMultiplier : undefined
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
    // Paylasilan dikdortgen: istemcinin gecis nabzi da ayni yerde.
    return getAbartiRailRect(tower.x, tower.y, tower.orientation, getMapGridSize(this.activeMap));
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
   *
   * 10. seviyede zincir kirisine iki ters donen kiris ekleniyor. Uc kirisin
   * vuruslari ayni atista birlesiyor: dusman basina atis basina en fazla bir
   * vurus. Kaynak ve isi kule basina (atis basina bir tuketim, asiri yukleme
   * isi penceresi zamana gore), kiris basina degil. Havayi vuramayan lazer
   * hicbir kirisle ucani vurmuyor.
   */
  private updateDebugLaserSweep(tower: TowerModel, firesThisTick = false) {
    const now = Date.now();
    if (this.updateDebugLaserOverdriveHeat(tower, now)) {
      return;
    }

    if (tower.debugSweepStartedAt <= 0) {
      tower.debugSweepStartedAt = now;
    }

    const elapsedSeconds = Math.max(0, (now - tower.debugSweepStartedAt) / 1000);
    const sweepAngles = this.getDebugLaserSweepAngles(tower);
    const durationSeconds = (tower.debugOverdriveUntil - tower.debugSweepStartedAt) / 1000;
    const turnAt = durationSeconds * 0.75;
    const routeSeconds = elapsedSeconds <= turnAt ? elapsedSeconds : Math.max(0, 2 * turnAt - elapsedSeconds);
    const desiredAngle = getDebugLaserChainSweepAngle(sweepAngles, routeSeconds, tower.debugSweepAngle);

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

    this.setBeam(tower, end.x, end.y, true, scanPoint.x, scanPoint.y);
    this.drawDebugLaserTwinBeams(tower, now);
    if (!firesThisTick) {
      return;
    }

    // Taranan yay artik yeniden hesaplanmiyor: kirisin bir onceki karede
    // gercekten durdugu aci ile su anki acisi arasi. Hesaplanan degerden yay
    // cikarmak, sinirin kirptigi hareketi de vurulmus saymak olurdu.
    const sweptFromAngle = tower.debugSweepDamageAngleAt > 0 ? tower.debugSweepDamageAngle : previousAngle;
    const hit = new Set<EnemyModel>();
    this.collectDebugLaserChainHits(tower, sweptFromAngle, currentAngle, hit);
    this.collectDebugLaserTwinHits(tower, tower.debugSweepDamageAngleAt, now, hit);
    tower.debugSweepDamageAngle = currentAngle;
    tower.debugSweepDamageAngleAt = now;
    this.damageDebugLaserSweepHits(tower, hit);
    tower.debugSweepLastDamageAt = now;
  }

  /**
   * 10. seviye: asiri yukleme dogal sonuna vardiktan sonraki ilk karede
   * ters donen kirislerin kapanis vurusu.
   *
   * Sweep yalnizca `debugOverdriveUntil > now` iken calisiyor, yani ters
   * donen kirislerin son vurustan bitise kadar taradigi yay -- tam turun son
   * dilimi, baslangic acisi -- hic vurulmuyordu. Burada bir kez, bitis anina
   * kadar kapatiliyor. Yalnizca donen kirislerin yayi: zincir kirisi
   * yerinde duruyor ve onun "kapanisi" ritim disi bir ekstra vurus olurdu
   * (5-9. seviyede kapanis hic yok). Kule ates edemiyorsa ya da bitisin
   * ustunden uzun sure gectiyse (kule askida kaldi) kapanis yok. Bir atis
   * sayiliyor: kaynak bir kez tukeniyor, hasar asiri yukleme carpaniyla,
   * normal lazer bir aralik bekliyor.
   */
  private finishDebugLaserOverdrive(tower: TowerModel, now: number) {
    if (tower.debugTwinStartAngle === undefined) {
      return;
    }
    const endedAt = tower.debugOverdriveUntil;
    if (endedAt <= 0 || endedAt > now || now - endedAt > DEBUG_LASER_CLOSING_PASS_WINDOW_MS) {
      return;
    }
    if (!this.canTowerFire(tower)) {
      return;
    }
    const hit = new Set<EnemyModel>();
    this.collectDebugLaserTwinHits(tower, tower.debugSweepDamageAngleAt, endedAt, hit);
    if (hit.size === 0) {
      return;
    }
    this.consumeTowerResources(tower);
    tower.cooldownMs = Math.max(tower.cooldownMs, this.getTowerFireInterval(tower));
    this.damageDebugLaserSweepHits(tower, hit);
  }

  /** Zincir kirisinin `from`dan `to`ya taradigi yaydaki dusmanlar. */
  private collectDebugLaserChainHits(tower: TowerModel, from: number, to: number, hit: Set<EnemyModel>) {
    const end = getRayAngleToWorldEdge(tower.x, tower.y, to, this.getActiveWorldBounds());
    const beamRadius = this.scaleWorldDistance(DEBUG_LASER_OVERDRIVE_BEAM_RADIUS);
    const canHitAir = this.canTowerHitAir(tower);
    for (const enemy of this.enemies.values()) {
      if (hit.has(enemy) || (!canHitAir && enemy.movementKind === "air")) continue;
      if (didDebugLaserSweepHitEnemy(tower, enemy, from, to, end.x, end.y, beamRadius)) {
        hit.add(enemy);
      }
    }
  }

  /**
   * Ters donen kirislerin `time` anindaki donusu (radyan, 0..tam tur). Aci
   * zamandan hesaplaniyor, yani kare atlansa da kiris sicramiyor.
   */
  private getDebugLaserTwinTurn(tower: TowerModel, time: number) {
    const durationMs = Math.max(1, tower.debugOverdriveUntil - tower.debugSweepStartedAt);
    return (Math.min(durationMs, Math.max(0, time - tower.debugSweepStartedAt)) / durationMs) * DEBUG_LASER_TWIN_SWEEP_RADIANS;
  }

  /**
   * 10. seviyenin ters donen iki kirisi, zincir kirisine ek olarak.
   *
   * Ikisi de zincirin dogdugu acidan cikiyor; `-b` saat yonunde, `-c` tersine,
   * sabit acisal hizla ve hedeflerden bagimsiz. Her biri asiri yukleme boyunca
   * tam tur atiyor: yarida baslangicin karsisinda kesisiyor, sonda baslangicta
   * bulusuyor.
   */
  private drawDebugLaserTwinBeams(tower: TowerModel, now: number) {
    const startAngle = tower.debugTwinStartAngle;
    if (startAngle === undefined) {
      return;
    }
    const turned = this.getDebugLaserTwinTurn(tower, now);
    const bounds = this.getActiveWorldBounds();
    getDebugLaserTwinBeamIds(tower.id).forEach((id, index) => {
      const angle = startAngle + DEBUG_LASER_TWIN_DIRECTIONS[index] * turned;
      const end = getRayAngleToWorldEdge(tower.x, tower.y, angle, bounds);
      const scanPoint = getPointOnRay(tower.x, tower.y, angle, this.scaleWorldDistance(190));
      this.setBeam(tower, end.x, end.y, true, scanPoint.x, scanPoint.y, id);
    });
  }

  /**
   * Ters donen kirislerin son vurustan (ilk atista asiri yuklemenin
   * basindan, yani baslangic acisi dahil) `until`a kadar taradigi yaylar.
   * Buyuk yay dilimlere bolunuyor: vurus testi en kisa aci farkiyla olcuyor.
   */
  private collectDebugLaserTwinHits(tower: TowerModel, lastDamageAt: number, until: number, hit: Set<EnemyModel>) {
    const startAngle = tower.debugTwinStartAngle;
    if (startAngle === undefined) {
      return;
    }
    const fromTurn = lastDamageAt > 0 ? this.getDebugLaserTwinTurn(tower, lastDamageAt) : 0;
    const toTurn = this.getDebugLaserTwinTurn(tower, until);
    const span = Math.max(0, toTurn - fromTurn);
    const slices = Math.max(1, Math.ceil(span / DEBUG_LASER_TWIN_MAX_HIT_ARC));
    const bounds = this.getActiveWorldBounds();
    const beamRadius = this.scaleWorldDistance(DEBUG_LASER_OVERDRIVE_BEAM_RADIUS);
    const canHitAir = this.canTowerHitAir(tower);
    for (const direction of DEBUG_LASER_TWIN_DIRECTIONS) {
      for (let slice = 0; slice < slices; slice += 1) {
        const sliceFrom = startAngle + direction * (fromTurn + (span * slice) / slices);
        const sliceTo = startAngle + direction * (fromTurn + (span * (slice + 1)) / slices);
        const end = getRayAngleToWorldEdge(tower.x, tower.y, sliceTo, bounds);
        for (const enemy of this.enemies.values()) {
          if (hit.has(enemy) || (!canHitAir && enemy.movementKind === "air")) continue;
          if (didDebugLaserSweepHitEnemy(tower, enemy, sliceFrom, sliceTo, end.x, end.y, beamRadius)) {
            hit.add(enemy);
          }
        }
      }
    }
  }

  /** Atisin birlesik vurus listesi: her dusmana bir kez kule hasari. */
  private damageDebugLaserSweepHits(tower: TowerModel, hit: Set<EnemyModel>) {
    if (hit.size === 0) {
      return;
    }
    // Her zaman asiri yukleme vurusu: kapanis vurusu bitisten sonraki karede
    // geliyor ve saate baksaydi normal carpanla vururdu.
    const damage = this.getTowerDamage(tower, true);
    for (const enemy of hit) {
      this.damageEnemyFromTower(tower, enemy, damage, 0);
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
    tower.debugTwinStartAngle = undefined;
    this.deleteDebugLaserOverdriveBeams(tower);
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
    const remaining = Array.from(this.enemies.values()).filter((enemy) => enemy.hp > 0);
    const ids: string[] = [];
    let origin = { x: tower.x, y: tower.y };
    while (remaining.length) {
      remaining.sort((a, b) => distanceSq(origin.x, origin.y, a.x, a.y) - distanceSq(origin.x, origin.y, b.x, b.y) || a.id.localeCompare(b.id));
      const next = remaining.shift()!;
      ids.push(next.id);
      origin = next;
    }
    return ids;
  }

  /**
   * Zincirin su anki acilari.
   *
   * Hedefler yururken acilar guncellenir. Olen hedefin son acisi rotada
   * kalir; boylece yol kisalmaz ve geri donus ayni rotayi izler.
   */
  private getDebugLaserSweepAngles(tower: TowerModel) {
    if (tower.debugSweepRouteAngles) {
      tower.debugSweepTargetIds.forEach((id, index) => {
        const enemy = this.enemies.get(id);
        if (enemy) tower.debugSweepRouteAngles![index] = Math.atan2(enemy.y - tower.y, enemy.x - tower.x);
      });
      return tower.debugSweepRouteAngles;
    }
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
    this.broadcast("projectile:contact", {
      id: projectile.id,
      definitionId: projectile.definitionId,
      x: roundNetworkNumber(projectile.x),
      y: roundNetworkNumber(projectile.y),
      angle: Math.atan2(projectile.vy, projectile.vx),
      tier: this.getProjectileTier(projectile),
      // Alan hasarinin gercek yaricapi: istemci patlamayi o boyda ciziyor
      // (Baransel'in 42-87 birimlik alani 14 birimlik bir halkaydi). Alani
      // olmayan mermide anahtar hic yok.
      ...(projectile.aoeRadius > 0 ? { r: Math.round(projectile.aoeRadius) } : {})
    });
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
        const killed = this.damageEnemy(enemy, this.getProjectileDamage(projectile, 0.82), projectile.slowMs, projectile.definitionId, projectileOwnerId, projectile.damageType, projectile.maxHealthDamageRatio, projectileTowerLevel, projectile.towerId, projectile.hitType, projectile.luck);
        if (projectile.definitionId === "archer-6-whisper" && !killed && projectileTower) {
          this.applyMelisDoubt(projectileTower, enemy, Date.now());
        }
        this.applyKinProjectileSlow(projectile, enemy);
      }
    } else {
      this.damageEnemy(target, this.getProjectileDamage(projectile), projectile.slowMs, projectile.definitionId, projectileOwnerId, projectile.damageType, projectile.maxHealthDamageRatio, projectileTowerLevel, projectile.towerId, projectile.hitType, projectile.luck);
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
    // Alan vurusu hedefi kuleye sormadan seciyor; Kin dalgasi gibi burada da
    // kule hedef alamayacagi dusmani (tahakkum, olu, donmus fisilti)
    // yavaslatmiyor -- yoksa onlara durum, kritik ve yayin yaziliyordu.
    if (!this.canTowerTargetEnemy(tower, target)) {
      return;
    }

    const distanceFromTower = Math.hypot(target.x - tower.x, target.y - tower.y);
    this.applyKinSlow(target, tower, distanceFromTower, this.getTowerRange(tower), 900 + tower.level * 70);
  }

  private updateDrones(deltaTime: number, seconds: number) {
    if (!this.setupPhase) this.logisticsClock += seconds;
    this.updateDefenseInsights(seconds);
    this.ensureLogisticsWorkers();
    const nexus = this.activePaths[0]?.points.at(-1);
    const bounds = this.getActiveWorldBounds();
    const nexusX = nexus?.x ?? bounds.left + bounds.width / 2;
    const nexusY = nexus?.y ?? bounds.bottom - getMapGridSize(this.activeMap) / 2;

    for (const [id, drone] of this.drones) {
      if (isLogisticsWorkerMode(drone.mode)) {
        // Isciler dusmana carpinca olmez: lojistik hattinin dusman yolunu
        // kesmesi kacinilmaz oldugu icin olum, oyuncunun engelleyemedigi bir
        // sebeple ekonomisinin durmasi demekti.
        if (this.setupPhase) {
          drone.vx = 0;
          drone.vy = 0;
          continue;
        }
        if (this.damageWorkerOnEnemyContact(drone, seconds)) {
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
          const report = this.findDroneUltimateReport(id);
          if (report) {
            this.strikeForUltimate(report, target, drone.damage, 0, "warrior-ultimate-drone", drone.ownerId);
          } else {
            this.damageEnemy(target, drone.damage, 0, "warrior-ultimate-drone", drone.ownerId);
          }
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
        const healthBefore = this.teamHealth;
        this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + drone.repairAmount);
        // Karneye usse gercekten donen can: tavanda kirpilan kisim yazilmiyor.
        const report = this.findDroneUltimateReport(id);
        if (report) {
          report.heal = (report.heal ?? 0) + (this.teamHealth - healthBefore);
        }
        this.drones.delete(id);
      }
      if (drone.ttlMs <= 0) {
        this.drones.delete(id);
      }
    }
  }

  private updateEnemies(seconds: number) {
    const deepFreezeTowers = this.collectDeepFreezeTowers();
    // Yapi degistiyse ana kapiyi bir kez yeniden olc: yonlendirme artik alani
    // sormadigi icin bunu tetikleyecek baska bir yer kalmadi.
    if (this.mainGateDirty) {
      this.announceFlowShift();
    }
    const now = Date.now();
    // Karsi atak dusman degil ama dusman tikinde ilerliyor: dalgayla yasiyor.
    if (this.counterSurge) this.updateCounterSurge(now);
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
      const slowStatusMultiplier = this.getEnemySlowSpeedMultiplier(enemy, now);
      const isHesitating = enemy.melisDoubtHesitateUntil > now;
      const zeynepSlowMultiplier = this.zeynepSlowUntil > now ? this.zeynepSlowMultiplier : 1;
      const doubtSlowMultiplier = enemy.melisDoubtUntil > now ? Math.max(0.1, 1 - Math.min(3, enemy.melisDoubtStacks) * MELIS_DOUBT_SLOW_PER_STACK) : 1;
      const doubtHasteMultiplier = enemy.melisDoubtHasteUntil > now ? MELIS_DOUBT_STRESS_HASTE_MULTIPLIER : 1;
      const coolantSlowMultiplier = enemy.coolantSlowUntil > now ? enemy.coolantSlowMultiplier : 1;
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
      const crystalTrapMultiplier = this.getCrystalTrapMultiplier(enemy, now);
      const repairBreachMultiplier = this.getRepairBreachMultiplier(enemy, now);
      const movementSlowMultiplier = Math.min(slowStatusMultiplier, statusSpeedMultiplier, enemy.auraSlowMultiplier, zeynepSlowMultiplier, doubtSlowMultiplier, tarMultiplier, debrisMultiplier, crystalTrapMultiplier, repairBreachMultiplier) * coolantSlowMultiplier;
      // Soguk Av Kaydi okuyor: tikin yavaslatma carpani (hizlanma ve durdurma haric).
      enemy.movementSlowMultiplier = movementSlowMultiplier;
      const speedMultiplier = isHesitating || undeadBlocker || whisperBlocker
        ? 0
        // Sogutma yavaslatmasi `min` icinde degil, sonucun **carpani**.
        //
        // Oyunun oteki yavaslatmalari birbiriyle yarisir ve en gucluse
        // birakir; sogutma ise kartin kendi metninde yazdigi gibi
        // ustlerine biner. Icerde olsaydi %9'luk bir yavaslatma, %52'lik
        // bir yavaslatmanin yaninda hicbir sey yapmazdi -- olcup gorduk:
        // 0,48 varken 0,91 hic gorunmuyordu.
        : movementSlowMultiplier * doubtHasteMultiplier;
      // Derin Dondurma burada bakiyor: karar dusmanin **su anki** hizina
      // gore veriliyor, yavaslatmayi kimin verdigine gore degil. Kartin
      // sozu bu -- kule yavaslatmayi kendi yapmak zorunda degil, yalnizca
      // yavaslamis dusmani menzilinde tutmak zorunda.
      if (deepFreezeTowers.length > 0) this.tryDeepFreeze(enemy, speedMultiplier, deepFreezeTowers, now);
      // Kontrolun "isi": engellenen yuruyus. Yavaslatma icin kaybedilen
      // hiz oraniyla, durdurma icin gecen surenin tamamiyla olculuyor --
      // ikisi ayri kalem cunku oyuncunun kafasinda da ayri seyler.
      if (speedMultiplier <= 0) {
        this.addEffectStat("stopped", seconds);
      } else if (speedMultiplier < 1) {
        this.addEffectStat("slowed", (1 - speedMultiplier) * seconds);
      }
      enemy.towerAttackCooldownMs = Math.max(0, enemy.towerAttackCooldownMs - seconds * 1000);
      // Avci ve yiyici kendi yol alanindan; hedef kalmadiysa normal yola dusuyor.
      const special = enemy.special;
      const specialRoute = special && special.kind !== "heater" ? this.findSpecialEnemyRoute(enemy, special.kind) : undefined;
      const route = specialRoute ?? this.findEnemyRoute(enemy);
      if (route.reachedBottom) {
        if (this.melisGothicNightmareUntil > now) {
          enemy.y = Math.min(enemy.y, TOWER_BUILD_BOTTOM - 1);
        } else {
          this.runEnemyEscapeTriggers(enemy, now);
          this.enemies.delete(id);
          const healthBefore = this.teamHealth;
          // Sampiyon yerine gectigi dogumlar kadar birim: her birim kendi
          // kalkan sarjini yiyor ya da kendi payini vuruyor. Tek birim gibi
          // davransaydi bir kalkan sarji bes dusmanlik sizintiyi yutardi.
          const leakBudget = enemy.champion ?? enemy.special?.budget;
          const leakParts = leakBudget
            ? splitChampionLeakDamage(leakBudget.leakDamage, leakBudget.replaced)
            : [getEnemyLeakDamage(enemy.type)];
          // Kalkan tuttu sayilmasi icin her birimi tutmus olmali: nexus can
          // kaybettiyse sizinti kalkanda kalmadi.
          let absorbedParts = 0;
          for (const part of leakParts) {
            const shieldOwner = Array.from(this.state.players.values()).find((player) => player.nexusShieldCharges > 0);
            if (shieldOwner) {
              shieldOwner.nexusShieldCharges -= 1;
              absorbedParts += 1;
            } else {
              this.teamHealth = Math.max(0, this.teamHealth - part);
            }
          }
          // Kalkanin tuttugu dusman da sizinti: temiz dalga ve yildiz candan
          // degil kacan dusmandan sayiliyor. Yenilgiden once yaziliyor ki
          // olunen dalganin karnesi olduren sizintiyi da icersin. Sampiyon
          // tek dusman, tek sizinti.
          this.runLedger.recordLeak({
            air: enemy.movementKind === "air",
            absorbed: absorbedParts === leakParts.length,
            hpLost: healthBefore - this.teamHealth
          });
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

      if (special) {
        if (special.kind === "heater") this.applyHeaterHeat(enemy, seconds);
        else if (special.kind === "eater") this.updateEnergyDrain(special, specialRoute?.drainTower, seconds);
      }

      if (enemy.towerAttackCooldownMs <= 0) {
        // Bitisikteki hedef menzillinin onunde gelir: duvara yaslanmis bir
        // nisanci arkadaki kuleyi vurup onundeki duvari birakmamalı.
        const target = (route.targetTower && route.cells.length <= 1 ? route.targetTower : undefined)
          ?? this.findRangedStructureTarget(enemy);
        if (target) {
          this.strikeStructure(enemy, target);
        }
      }
    }
  }

  /**
   * Dusmanin yapiya vurusu.
   *
   * Menzilli ve bitisik vurus ayni yerden geciyor: ikisi de ayni kolun
   * sallanmasi, tek fark mesafe. Kusatma carpani da burada, yoksa menzilli
   * hatta unutulurdu.
   */
  private strikeStructure(enemy: EnemyModel, tower: TowerModel) {
    // Kule avcisi kendi vurusuyla (`TOWER_HUNTER_HIT_DAMAGE`): kusatma
    // carpani ona binmiyor, yoksa kusatma turundeki avci kuleyi bir saniyede indirirdi.
    const hunter = enemy.special?.kind === "hunter";
    const structureDamage = hunter
      ? TOWER_HUNTER_HIT_DAMAGE
      : enemy.type === "siege"
        ? enemy.attack * SIEGE_STRUCTURE_DAMAGE_MULTIPLIER
        : enemy.attack;
    if (enemy.attackRange > 0) {
      this.spawnEnemyShotBeam(enemy, tower);
    }
    this.damageTower(tower, structureDamage);
    enemy.towerAttackCooldownMs = hunter ? TOWER_HUNTER_ATTACK_INTERVAL_MS : ENEMY_TOWER_ATTACK_INTERVAL_MS;
  }

  /**
   * Ozel dusmanin yol alani: once kesinlesmis olani, yoksa kurar. Hedef
   * yoksa `undefined` (dusman normal yola duser).
   */
  private getSpecialRouteField(kind: "hunter" | "eater") {
    const cached = this.specialRouteFields.get(kind);
    if (cached !== undefined) return cached ?? undefined;
    const field = this.buildSpecialRouteField(kind);
    this.specialRouteFields.set(kind, field ?? null);
    return field;
  }

  /**
   * Hedef: avci icin duvar disinda kare kaplayan her ayakta yapi (savas
   * kulesi, kaynak binasi, Tamir Merkezi), yiyici icin enerji binasi.
   * Kenara oturan yapilar (duvar, Abarti) hedef degil, engel.
   */
  private isSpecialRouteTarget(kind: "hunter" | "eater", tower: TowerModel) {
    if (tower.hp <= 0 || tower.definition.engine?.placement?.requiresEdge) return false;
    return kind === "eater" ? tower.definition.resourceProvider === "energy" : !isWallDefinition(tower.definition);
  }

  /**
   * Hedef yapilarin karelerinden geriye dogru Dijkstra.
   *
   * Adim 1 hucre; duvar (kenar yapisi) gecmek ya da hedef olmayan bir yapinin
   * karesine girmek (kirmak) ek `SPECIAL_ROUTE_BLOCKER_COST`. Bedel cok
   * buyuk oldugu icin sira sozlukseldir: once duvarsiz ulasilan en yakin
   * hedef; hepsi duvarla kapaliysa en az engel kirilarak, esitlikte en kisa
   * yoldan. Kirilacak duvar o yolun uzerindeki ilk engel, yani en yakin
   * hedefe giden yolun duvari. Harita en fazla 24x36: kurulum mikro saniye.
   */
  private buildSpecialRouteField(kind: "hunter" | "eater"): SpecialRouteField | undefined {
    const cols = this.activeMap.cols;
    const rows = this.activeMap.rows;
    const size = cols * rows;
    const occupied = new Uint8Array(size);
    const target = new Uint8Array(size);
    const cost = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
    const next = new Int32Array(size).fill(-1);
    const heap = new SpecialRouteHeap();
    for (const tower of this.towers.values()) {
      if (tower.hp <= 0 || tower.definition.engine?.placement?.requiresEdge) continue;
      const isTarget = this.isSpecialRouteTarget(kind, tower);
      for (const cell of this.getTowerFootprintCells(tower.x, tower.y, tower.definition.id, tower.orientation)) {
        if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) continue;
        const index = cell.row * cols + cell.col;
        occupied[index] = 1;
        if (isTarget && !target[index]) {
          target[index] = 1;
          cost[index] = 0;
          heap.push(index, 0);
        }
      }
    }
    if (heap.size === 0) return undefined;

    const from = { col: 0, row: 0 };
    const to = { col: 0, row: 0 };
    while (heap.size > 0) {
      const current = heap.pop();
      const base = cost[current];
      if (heap.lastCost > base) continue;
      const col = current % cols;
      const row = (current - col) / cols;
      // Esit uzunluktaki yollar arasinda engeli hedefe en yakin olani: engel
      // bedeline engelden sonra kalan adim sayisinin kucuk bir kesri biniyor.
      // Duz bir duvar hattinda avci hattin boyunca kulenin tam ustundeki
      // duvara yuruyor. Kesir bir adimdan hep kucuk; uzunluk sirasini bozmuyor.
      const blockerCost = SPECIAL_ROUTE_BLOCKER_COST + (Math.floor(base % SPECIAL_ROUTE_BLOCKER_COST) / 4096);
      // Hedef olmayan dolu kareye girmek o yapiyi kirmak demek.
      const entering = !target[current] && occupied[current] ? blockerCost : 0;
      to.col = col;
      to.row = row;
      for (let step = 0; step < 4; step += 1) {
        const neighborCol = col + SPECIAL_ROUTE_COL_STEPS[step];
        const neighborRow = row + SPECIAL_ROUTE_ROW_STEPS[step];
        if (neighborCol < 0 || neighborCol >= cols || neighborRow < 0 || neighborRow >= rows) continue;
        const neighbor = neighborRow * cols + neighborCol;
        if (target[neighbor]) continue;
        from.col = neighborCol;
        from.row = neighborRow;
        const edge = this.getEdgeStructure(from, to);
        const total = base + 1 + entering + (edge && edge.hp > 0 ? blockerCost : 0);
        if (total < cost[neighbor]) {
          cost[neighbor] = total;
          next[neighbor] = current;
          heap.push(neighbor, total);
        }
      }
    }
    return { cols, cost, next, target };
  }

  /**
   * Avcinin ve yiyicinin bu tickteki karari: yurumek, engeli kirmak ya da
   * hedefe varmak (avci vurur, yiyici emer). Alan hucre basina bir sonraki
   * adimi tutuyor; burada yalnizca canli kontrol var, arama yok.
   */
  private findSpecialEnemyRoute(enemy: EnemyModel, kind: "hunter" | "eater"): SpecialEnemyRoute | undefined {
    const field = this.getSpecialRouteField(kind);
    if (!field) return undefined;
    const start = worldToGrid(enemy.x, enemy.y, this.activeMap);
    if (!isInsideMap(this.activeMap, start.col, start.row)) return undefined;
    const index = start.row * field.cols + start.col;
    const standing = this.getTowerAtCell(start.col, start.row);
    if (standing && standing.hp > 0) {
      // Yapinin ustunde duruyor (ustune kuruldu): hedefse ona, degilse kirarak.
      return kind === "eater" && field.target[index]
        ? { cells: [start], reachedBottom: false, targetTower: undefined, exitPoint: undefined, drainTower: standing }
        : { cells: [start], reachedBottom: false, targetTower: standing, exitPoint: undefined };
    }
    const nextIndex = field.next[index];
    if (!Number.isFinite(field.cost[index]) || nextIndex < 0) return undefined;
    const nextCell = { col: nextIndex % field.cols, row: Math.floor(nextIndex / field.cols) };
    const edge = this.getEdgeStructure(start, nextCell);
    if (edge && edge.hp > 0) {
      return { cells: [start], reachedBottom: false, targetTower: edge, exitPoint: undefined };
    }
    const occupant = this.getTowerAtCell(nextCell.col, nextCell.row);
    if (occupant && occupant.hp > 0) {
      if (kind === "eater" && field.target[nextIndex]) {
        return { cells: [start], reachedBottom: false, targetTower: undefined, exitPoint: undefined, drainTower: occupant };
      }
      return { cells: [start], reachedBottom: false, targetTower: occupant, exitPoint: undefined };
    }
    return { cells: [start, nextCell], reachedBottom: false, targetTower: undefined, exitPoint: undefined };
  }

  /**
   * Enerji yiyicinin emmesi. Emilen enerji kayboluyor; bina bosalinca (ve en
   * az `ENERGY_EATER_MIN_CONTACT_MS` temasla) yikiliyor. Yikim yol alanini
   * eskitiyor, yiyici bir sonraki tickte siradaki enerji binasina donuyor.
   */
  private updateEnergyDrain(special: SpecialEnemyState, tower: TowerModel | undefined, seconds: number) {
    if (!tower || tower.hp <= 0) {
      special.drainId = undefined;
      special.drainContactMs = 0;
      return;
    }
    if (special.drainId !== tower.id) {
      special.drainId = tower.id;
      special.drainContactMs = 0;
    }
    special.drainContactMs = (special.drainContactMs ?? 0) + seconds * 1000;
    tower.energy = Math.max(0, tower.energy - ENERGY_EATER_DRAIN_PER_SECOND * seconds);
    if (tower.energy <= 0 && special.drainContactMs >= ENERGY_EATER_MIN_CONTACT_MS) {
      this.destroyStructure(tower);
      special.drainId = undefined;
      special.drainContactMs = 0;
    }
  }

  /** Yapiyi yikar; yikimin yan etkileri (`damageTower`) aynen isliyor. */
  private destroyStructure(tower: TowerModel) {
    this.damageTower(tower, 1e12, { pierceArmor: true });
  }

  /**
   * Isiticinin yakinindaki kuleleri isitmasi: yaricap icindeki her ates
   * eden kuleye saniyede kilit esiginin `HEATER_HEAT_PER_SECOND_RATIO` payi.
   * Kule hucre indeksinden bakiliyor (cevredeki 5x5 hucre), tarama yok.
   */
  private applyHeaterHeat(enemy: EnemyModel, seconds: number) {
    if (!(seconds > 0)) return;
    const gridSize = getMapGridSize(this.activeMap);
    const radius = gridSize * HEATER_RADIUS_CELLS;
    const radiusSq = radius * radius;
    const cell = worldToGrid(enemy.x, enemy.y, this.activeMap);
    const reach = Math.ceil(HEATER_RADIUS_CELLS);
    const index = this.getTowerCellIndex();
    const heated = this.heaterScratch;
    heated.length = 0;
    for (let dr = -reach; dr <= reach; dr += 1) {
      for (let dc = -reach; dc <= reach; dc += 1) {
        const tower = index.get(`${cell.col + dc}:${cell.row + dr}`);
        if (!tower || heated.includes(tower)) continue;
        heated.push(tower);
        if (tower.hp <= 0 || tower.definition.resourceProvider || !isOperationalTower(tower.definition)) continue;
        if (distanceSq(enemy.x, enemy.y, tower.x, tower.y) > radiusSq) continue;
        this.addExternalTowerHeat(tower, HEATER_HEAT_PER_SECOND_RATIO * this.getTowerHeatLockThreshold(tower) * seconds);
      }
    }
    heated.length = 0;
  }

  /**
   * Disaridan gelen isi (isitici). Atisin isisiyle ayni kurallar: ust sinir
   * 100, kilit esigi kulenin kendi esigi, kilide giriste "overheat"
   * tetikleri ve Asiri Isi Patlamasi. Fren atis hizini sicakliktan okudugu
   * icin kendiliginden isliyor.
   */
  private addExternalTowerHeat(tower: TowerModel, heat: number) {
    if (!(heat > 0)) return;
    const wasHeatLocked = tower.heatLocked;
    tower.temperature = Math.min(100, tower.temperature + heat);
    if (tower.temperature >= this.getTowerHeatLockThreshold(tower)) {
      tower.heatLocked = true;
    }
    if (!wasHeatLocked && tower.heatLocked) {
      this.runTowerTriggers(tower, "overheat");
      if (this.towerHasUnlock(tower, "heat:overheatBurst")) this.applyOverheatBurst(tower, Date.now());
    }
  }

  /** Planin karsi atagi, sirasi gelen dogumla birlikte uyariya basliyor. */
  private maybeStartCounterSurge() {
    const plan = this.waveSpecialPlan;
    const surge = plan?.surge;
    if (!plan || !surge || this.waveSurgeStarted || plan.wave !== this.wave || this.waveSpawned <= surge.atSpawn) return;
    this.startCounterSurge(surge.col, surge.width);
  }

  private startCounterSurge(col: number, width: number, now = Date.now()) {
    this.waveSurgeStarted = true;
    this.counterSurge = {
      id: this.nextCounterSurgeId++,
      col: Math.max(0, Math.min(this.activeMap.cols - 1, Math.floor(col))),
      width: Math.max(1, Math.floor(width)),
      createdAt: now,
      launchAt: now + COUNTER_SURGE_TELEGRAPH_MS,
      hitIds: new Set()
    };
  }

  private getCounterSurgeProgress(surge: CounterSurgeModel, now: number) {
    return Math.max(0, Math.min(1, (now - surge.launchAt) / COUNTER_SURGE_CROSS_MS));
  }

  /**
   * Seridin ilerlemesi ve vuruslari. On cizgisi yapinin merkezini gecince
   * yapi bir kez, azami caninin `COUNTER_SURGE_DAMAGE_RATIO` payi kadar
   * (zirh delinir) vuruluyor. Kuleler, kaynak binalari ve duvarlar; dusman,
   * isci ve nexus degil. Serit tek; yapilar tick basina bir kez taraniyor.
   */
  private updateCounterSurge(now: number) {
    const surge = this.counterSurge;
    if (!surge || now < surge.launchAt) return;
    const progress = this.getCounterSurgeProgress(surge, now);
    const origin = getMapOrigin(this.activeMap);
    const gridSize = getMapGridSize(this.activeMap);
    const frontY = origin.y + progress * this.activeMap.rows * gridSize;
    const left = origin.x + surge.col * gridSize;
    const right = left + surge.width * gridSize;
    const hits: CounterSurgeHitMessage["hits"] = [];
    for (const tower of this.towers.values()) {
      if (tower.hp <= 0 || tower.y > frontY || surge.hitIds.has(tower.id)) continue;
      if (!this.isInCounterSurgeBand(tower, left, right, gridSize)) continue;
      surge.hitIds.add(tower.id);
      const before = tower.hp;
      this.damageTower(tower, tower.maxHp * COUNTER_SURGE_DAMAGE_RATIO, { pierceArmor: true });
      hits.push({ towerId: tower.id, amount: Math.max(0, Math.round(before - tower.hp)) });
    }
    if (hits.length > 0) {
      const message: CounterSurgeHitMessage = { id: surge.id, hits };
      this.broadcast("surge:hit", message);
    }
    if (progress >= 1) this.counterSurge = undefined;
  }

  /** Yapi seridin sutunlarina biniyor mu (dikey kenar yapisi sinirda da sayiliyor). */
  private isInCounterSurgeBand(tower: TowerModel, left: number, right: number, gridSize: number) {
    const edge = tower.definition.engine?.placement?.requiresEdge;
    if (edge && tower.orientation === "vertical") return tower.x >= left - 0.5 && tower.x <= right + 0.5;
    const half = edge
      ? (gridSize * this.getEdgeLength(tower.definition.id)) / 2
      : (gridSize * this.getTowerPlacementSpan(tower.definition.id)) / 2;
    return tower.x + half > left + 0.5 && tower.x - half < right - 0.5;
  }

  private getCounterSurgeWire(now: number): CounterSurgeSnapshot | undefined {
    const surge = this.counterSurge;
    if (!surge) return undefined;
    return {
      id: surge.id,
      col: surge.col,
      w: surge.width,
      p: Math.round(this.getCounterSurgeProgress(surge, now) * 1000) / 1000,
      ...(now < surge.launchAt ? { warn: true as const } : {})
    };
  }

  /**
   * Menzilli dusmanin vuracagi yapi.
   *
   * En yakin olan seciliyor, kule/duvar ayrimi yok: nisanci onundeki neyse
   * ona atar. Duvar da hedef -- oyuncunun duvari nisancinin menzili disinda
   * tutmasi gereken bir sey, dokunulmaz bir zemin degil.
   */
  private findRangedStructureTarget(enemy: EnemyModel) {
    if (enemy.attackRange <= 0) return undefined;
    const rangeSq = enemy.attackRange * enemy.attackRange;
    let best: TowerModel | undefined;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const tower of this.towers.values()) {
      if (tower.hp <= 0) continue;
      const distance = distanceSq(enemy.x, enemy.y, tower.x, tower.y);
      if (distance > rangeSq || distance >= bestDistanceSq) continue;
      best = tower;
      bestDistanceSq = distance;
    }
    return best;
  }

  /** Menzilli vurusun izi; hasar zaten dusmustur, bu yalnizca gorunen kismi. */
  private spawnEnemyShotBeam(enemy: EnemyModel, tower: TowerModel) {
    const id = `enemy-shot-${this.nextBeamId++}`;
    this.beams.set(id, {
      id,
      definitionId: ENEMY_SHOT_BEAM_ID,
      x1: enemy.x,
      y1: enemy.y,
      x2: tower.x,
      y2: tower.y,
      width: 2,
      color: 0xf87171,
      ttlMs: 140
    });
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

  private getCrystalTrapMultiplier(enemy: EnemyModel, now: number) {
    let multiplier = 1;
    for (const node of this.getCrystalNodes()) {
      const until = Array.from(this.crystalTrapUntil.entries())
        .find(([key]) => key.endsWith(`:${node.id}`))?.[1] ?? 0;
      if (until > now && distanceSq(enemy.x, enemy.y, node.x, node.y) <= getMapGridSize(this.activeMap) ** 2 * 2.25) multiplier = Math.min(multiplier, 0.65);
    }
    return multiplier;
  }

  private getRepairBreachMultiplier(enemy: EnemyModel, now: number) {
    let multiplier = 1;
    const radius = getMapGridSize(this.activeMap) * 1.25;
    for (const tower of this.towers.values()) {
      if ((tower.repairBreachUntil ?? 0) > now && tower.hp > 0
        && distanceSq(enemy.x, enemy.y, tower.x, tower.y) <= radius * radius) multiplier = Math.min(multiplier, 0.7);
    }
    return multiplier;
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
    // Kurulumda kadro tam baslar: olum bir dalganin cezasi, kalici kayip degil.
    //
    // Yaralar da burada kapaniyor. Iscinin kendiliginden iyilesmesi yok ve
    // Tamirci yapilari onariyor, iscileri degil; boyle olmasaydi ucuncu
    // dalgada 59 hasar yiyen isci sonsuza kadar 1 canla dolasir ve dorduncu
    // dalgada aninda olurdu. Can karti da o iscide hicbir sey ifade etmezdi.
    if (this.setupPhase) {
      this.workerRespawnAt.clear();
      for (const drone of this.drones.values()) {
        if (drone.maxHp === undefined) continue;
        drone.hp = this.getWorkerMaxHp(drone);
      }
    }
    const now = Date.now();
    const baseWorkerModes: Array<DroneSnapshot["mode"]> = ["ammoTransport", "crystalCollector", "ammoCollector", "energyTransport"];
    const origin = getMapOrigin(this.activeMap);
    const { gridSize } = getMapMetrics(this.activeMap);
    for (const ownerId of this.state.players.keys()) {
      const player = this.state.players.get(ownerId);
      // Temel dort isciden sonrakiler: magazadan gelen besinci ve altinla
      // alinanlar. Her birinin anahtari ayri olmali, yoksa ayni rolu iki kez
      // alan oyuncunun ikinci iscisi birincisinin uzerine yazilirdi.
      const extraWorkers: HiredWorker[] = [
        ...(player?.ownedShopItemIds.includes("besinci-isci") ? [{ role: "ammoTransport" as const }] : []),
        ...(player?.hiredWorkers ?? [])
      ];
      const workers: HiredWorker[] = [
        ...baseWorkerModes.map((role) => ({ role: role as HirableWorkerRole })),
        ...extraWorkers.filter((worker) => isHirableWorkerRole(worker.role))
      ];
      for (const [index, worker] of workers.entries()) {
        const mode = worker.role as DroneSnapshot["mode"];
        const legacySuffix = Boolean((worker as HiredWorker & { legacySuffix?: boolean }).legacySuffix);
        const suffix = index >= baseWorkerModes.length ? `:${legacySuffix ? `extra${index - baseWorkerModes.length}` : worker.id ?? `extra${index - baseWorkerModes.length}`}` : "";
        const id = `logistics-${ownerId}-${mode}${suffix}`;
        if (this.drones.has(id)) {
          continue;
        }
        const respawnAt = this.workerRespawnAt.get(id);
        if (respawnAt !== undefined) {
          if (respawnAt > now) continue;
          this.workerRespawnAt.delete(id);
        }
        this.drones.set(id, {
          id,
          hiredWorkerId: worker.id,
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
          // Gelismis isci uc kat tasiyor ve uc kat hizli yuruyor. Toplama
          // hizi burada degil, tasima sirasinda carpiliyor (bkz.
          // `getWorkerGatherSpeedMultiplier`).
          capacity: (mode === "ammoTransport"
            ? AMMO_LOGISTICS_WORKER_CAPACITY
            : mode === "ammoCollector"
              ? AMMO_COLLECTOR_WORKER_CAPACITY
            : mode === "crystalCollector" || mode === "energyTransport"
              ? ENERGY_LOGISTICS_WORKER_CAPACITY
              : LOGISTICS_WORKER_CAPACITY) * (worker.advanced ? ADVANCED_WORKER_MULTIPLIER : 1),
          speed: LOGISTICS_WORKER_SPEED * (worker.advanced ? ADVANCED_WORKER_MULTIPLIER : 1),
          // Can da uc kat: gelismis isci her eksende uc normal isci
          // ediyor, dayaniklilikta ayrı tutulsaydi uc katlik yatirim tek
          // bir sizmayla silinirdi. Kart ve esya carpani okuma aninda
          // biniyor (bkz. `getWorkerMaxHp`), yani kosu ortasinda alinan
          // bir can karti sahadaki isciye de isliyor.
          hp: this.getWorkerBaseMaxHp(worker.advanced, ownerId),
          maxHp: this.getWorkerBaseMaxHp(worker.advanced),
          advanced: worker.advanced,
          skillIds: worker.skillIds?.filter(isWorkerSkillId)
        });
      }
    }
  }

  /**
   * Dusmanla temas eden isciye saniyelik hasar.
   *
   * Temastaki her dusman ayri ayri vuruyor, en gucluye birakilmiyor: isci
   * kalabaligin icinde kalmisken tek bir dusmanin karsisindaymis gibi
   * dayanmasi, kalabaligi hicbir sey yapmayan bir dekora cevirirdi.
   *
   * Zirh yok: iscinin zirhi yok. Dusmanin `attack` degeri oldugu gibi iniyor.
   *
   * `true` donerse isci o tick olmustur ve artik yurumez.
   */
  private damageWorkerOnEnemyContact(worker: DroneModel, seconds: number) {
    if (worker.maxHp === undefined) return false;
    const contactRadius = this.scaleWorldDistance(WORKER_CONTACT_RADIUS);
    let damagePerSecond = 0;
    for (const enemy of this.enemySpatialGrid.queryCircle(worker.x, worker.y, contactRadius)) {
      damagePerSecond += enemy.attack;
    }
    if (damagePerSecond <= 0) return false;

    worker.hp = Math.max(0, Math.min(this.getWorkerMaxHp(worker), worker.hp ?? worker.maxHp) - damagePerSecond * seconds);
    if (worker.hp > 0) return false;

    // Tasidigi yuk de gidiyor: olumun bedeli yalnizca eksik beden degil,
    // o seferin kendisi.
    if (worker.mode === "ammoTransport" && (worker.cargo ?? 0) > 0 && this.hasWorkerSkill(worker, "ammo-lost-convoy")) {
      const factory = Array.from(this.towers.values()).find((tower) => tower.ownerId === worker.ownerId
        && tower.hp > 0 && tower.definition.resourceProvider === "ammunition");
      if (factory) factory.ammo = Math.min(factory.maxAmmo, factory.ammo + (worker.cargo ?? 0));
    }
    this.drones.delete(worker.id);
    this.workerRespawnAt.set(worker.id, Date.now() + WORKER_RESPAWN_MS);
    return true;
  }

  /**
   * Iscinin hedefe dogru bir tick yurumesi. `true` donerse varmistir.
   *
   * Isci artik duz cizgide gitmiyor: yapilarin icinden ve duvarlardan
   * gecemiyor, yani yol aranmasi gerek. Dusmanin kor gezinmesi burada
   * kullanilamaz -- dusman haritayi bilmiyor, isci biliyor; duvari oren
   * zaten oyuncunun kendisi. Bu yuzden isci gercek en kisa yolu buluyor.
   *
   * Sevkiyat iscisi kendi hedef yapisinin merkezine girer. Tamirci gibi
   * yapiya giris izni olmayan isciler bitisik erisilebilir karede durur.
   */
  private moveLogisticsWorker(worker: DroneModel, targetX: number, targetY: number, seconds: number) {
    const approach = this.getWorkerApproachPoint(worker, targetX, targetY);
    if (!approach) {
      // Kapali hat: isci bekler. Kendini duvara yaslayip titremesindense
      // durmasi, oyuncuya sorunun nerede oldugunu daha iyi gosteriyor.
      worker.vx = 0;
      worker.vy = 0;
      return false;
    }
    const reached = this.stepWorkerToward(worker, approach.x, approach.y, seconds);
    return reached && approach.final;
  }

  /** Tek bir noktaya duz yuruyus; hucreler arasi adimin kendisi. */
  private stepWorkerToward(worker: DroneModel, targetX: number, targetY: number, seconds: number) {
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

  /**
   * Iscinin bu tick yonelecegi nokta ve orasinin son durak olup olmadigi.
   *
   * `undefined` donerse hedefe hicbir yol yok.
   */
  private getWorkerApproachPoint(worker: DroneModel, targetX: number, targetY: number) {
    const start = worldToGrid(worker.x, worker.y, this.activeMap);
    const goal = worldToGrid(targetX, targetY, this.activeMap);
    const goalOpen = this.isWorkerCellOpen(goal.col, goal.row, worker)
      && !this.isWorkerCellBanned(worker, goal.col, goal.row);
    // Sevkiyat hedefinin icine girilmeden yuk bosaltilmaz. Yasakli hedef
    // karesine komsu olmak da teslimat sayilmaz.
    const deliveryTarget = worker.logisticsPhase === "deliver"
      && (worker.mode === "energyTransport" || worker.mode === "ammoTransport")
      ? this.towers.get(worker.targetTowerId ?? "") : undefined;
    if (deliveryTarget && targetX === deliveryTarget.x && targetY === deliveryTarget.y && !goalOpen) return undefined;

    if (goalOpen) {
      if (start.col === goal.col && start.row === goal.row) {
        return { x: targetX, y: targetY, final: true };
      }
    } else if (this.isWorkerDeliveryReach(start, goal)) {
      // Yapinin dibindeyiz: daha ileri gitmek onun icine girmek olurdu.
      worker.vx = 0;
      worker.vy = 0;
      return { x: worker.x, y: worker.y, final: true };
    }

    const step = this.findWorkerStep(worker, start, goal, goalOpen);
    if (!step) return undefined;
    const point = gridToWorld(step.col, step.row, this.activeMap);
    return { x: point.x, y: point.y, final: false };
  }

  /** Isci hucreye girebilir mi: ayakta yapi yok ya da o yapi isciye acik. */
  private isWorkerCellOpen(col: number, row: number, worker?: DroneModel) {
    if (!isInsideMap(this.activeMap, col, row)) return false;
    const standing = this.getTowerCellIndex().get(`${col}:${row}`);
    if (!standing || standing.hp <= 0) return true;
    return this.canWorkerEnterStructure(worker, standing);
  }

  /**
   * Iki komsu hucre arasindaki gecis isciye acik mi.
   *
   * Dusmandan tek farki burasi: kapisi olan duvar isciye acik. Kapinin
   * `getBlockingTowerBetween` tarafinda karsiligi **yok** -- dusman kapidan
   * gecmez, kapinin butun anlami bu.
   */
  private isWorkerEdgeOpen(from: { col: number; row: number }, to: { col: number; row: number }) {
    const edge = this.getEdgeStructure(from, to);
    if (!edge || edge.hp <= 0) return true;
    return edge.gate === true;
  }

  private canWorkerEnter(from: { col: number; row: number }, to: { col: number; row: number }, worker?: DroneModel) {
    if (this.isWorkerCellBanned(worker, to.col, to.row)) return false;
    return this.isWorkerCellOpen(to.col, to.row, worker) && this.isWorkerEdgeOpen(from, to);
  }

  /**
   * Isci yapiya teslim edebilecek kadar yakin mi.
   *
   * Bitisik kare yeter, ama arada duvar olmamali: duvarin oteki yanindan
   * teslim etmek kapinin butun anlamini bosa cikarirdi.
   *
   * Yapinin **kendi** karesi de sayiliyor. Isci oraya dusebiliyor -- oyuncu
   * tam ustune kule kurdugunda, ya da kadro haritanin degistigi bir anda
   * dogdugunda. O isci teslim edemeseydi, cikip geri gelir ve ayni kareye
   * dusup sonsuza kadar gidip gelirdi.
   */
  private isWorkerDeliveryReach(cell: { col: number; row: number }, goal: { col: number; row: number }) {
    const distance = Math.abs(cell.col - goal.col) + Math.abs(cell.row - goal.row);
    if (distance === 0) return true;
    if (distance !== 1) return false;
    return this.isWorkerEdgeOpen(cell, goal);
  }

  /**
   * Hedefe giden yolun ilk adimi.
   *
   * Genislik oncelikli arama: isci haritayi biliyor, yani en kisa yolu
   * bulmali. Adim hucre boyunca saklaniyor; her tick yeniden aramak ayni
   * cevabi onlarca kez uretmek olurdu.
   */
  private findWorkerStep(
    worker: DroneModel,
    start: { col: number; row: number },
    goal: { col: number; row: number },
    goalOpen: boolean
  ) {
    const cached = worker.routeStep;
    if (
      cached
      && cached.fromCol === start.col && cached.fromRow === start.row
      && cached.goalCol === goal.col && cached.goalRow === goal.row
      && this.canWorkerEnter(start, { col: cached.toCol, row: cached.toRow }, worker)
    ) {
      return { col: cached.toCol, row: cached.toRow };
    }

    const step = this.searchWorkerStep(worker, start, goal, goalOpen);
    worker.routeStep = step
      ? { fromCol: start.col, fromRow: start.row, goalCol: goal.col, goalRow: goal.row, toCol: step.col, toRow: step.row }
      : undefined;
    return step;
  }

  private searchWorkerStep(
    worker: DroneModel,
    start: { col: number; row: number },
    goal: { col: number; row: number },
    goalOpen: boolean
  ) {
    const map = this.activeMap;
    if (!isInsideMap(map, start.col, start.row) || !Number.isInteger(start.col) || !Number.isInteger(start.row)) {
      return this.searchWorkerStepByKey(worker, start, goal, goalOpen);
    }
    // Ayni genislik oncelikli arama, ayni komsu sirasi ve ayni giris kurali;
    // yalnizca hucreler metin anahtar yerine dizi indeksinde tutuluyor. Gec
    // oyunda isciler ve kule ozetleri (teslimat yolu acik mi) bunu tick basina
    // onlarca kez kosuyordu ve maliyetin cogu anahtar/nesne tahsisiydi.
    const cols = map.cols;
    const size = cols * map.rows;
    const seen = new Uint8Array(size);
    /** Ilk adimin hucre indeksi + 1; 0 = baslangic (adim yok). */
    const firstStep = new Int32Array(size);
    const queue = new Int32Array(size);
    let tail = 0;
    const startIndex = start.row * cols + start.col;
    queue[tail++] = startIndex;
    seen[startIndex] = 1;
    // Komsu kontrolleri bu iki nesneyi yalnizca okuyor; her adimda yenisi kurulmuyor.
    const cell = { col: start.col, row: start.row };
    const neighbor = { col: 0, row: 0 };
    for (let head = 0; head < tail; head += 1) {
      const index = queue[head];
      cell.col = index % cols;
      cell.row = (index - cell.col) / cols;
      if (goalOpen ? cell.col === goal.col && cell.row === goal.row : this.isWorkerDeliveryReach(cell, goal)) {
        const step = firstStep[index];
        return step === 0 ? undefined : { col: (step - 1) % cols, row: Math.floor((step - 1) / cols) };
      }
      // `getGridNeighbors` sirasi: asagi, sol, sag, yukari.
      for (let direction = 0; direction < 4; direction += 1) {
        neighbor.col = cell.col + WORKER_NEIGHBOR_COL_STEPS[direction];
        neighbor.row = cell.row + WORKER_NEIGHBOR_ROW_STEPS[direction];
        if (!isInsideMap(map, neighbor.col, neighbor.row)) continue;
        const neighborIndex = neighbor.row * cols + neighbor.col;
        if (seen[neighborIndex] === 1 || !this.canWorkerEnter(cell, neighbor, worker)) continue;
        seen[neighborIndex] = 1;
        firstStep[neighborIndex] = firstStep[index] !== 0 ? firstStep[index] : neighborIndex + 1;
        queue[tail++] = neighborIndex;
      }
    }
    return undefined;
  }

  /** Haritanin disinda baslayan arama icin eski, anahtarli yol (indeks orada tanimsiz). */
  private searchWorkerStepByKey(
    worker: DroneModel,
    start: { col: number; row: number },
    goal: { col: number; row: number },
    goalOpen: boolean
  ) {
    const startKey = `${start.col}:${start.row}`;
    // Isci yapinin icinde kalmis olabilir (kule tam ustune kuruldu):
    // aramanin baslangici yine de gecerli sayiliyor, yoksa cikamazdi.
    const firstStep = new Map<string, { col: number; row: number }>();
    const queue: Array<{ col: number; row: number }> = [start];
    const seen = new Set<string>([startKey]);

    for (let head = 0; head < queue.length; head += 1) {
      const cell = queue[head];
      const cellKey = `${cell.col}:${cell.row}`;
      if (goalOpen ? cell.col === goal.col && cell.row === goal.row : this.isWorkerDeliveryReach(cell, goal)) {
        return firstStep.get(cellKey);
      }
      for (const neighbor of this.getGridNeighbors(cell.col, cell.row)) {
        const key = `${neighbor.col}:${neighbor.row}`;
        if (seen.has(key) || !this.canWorkerEnter(cell, neighbor, worker)) continue;
        seen.add(key);
        firstStep.set(key, firstStep.get(cellKey) ?? neighbor);
        queue.push(neighbor);
      }
    }
    return undefined;
  }


  /**
   * Kule esyalarinin kule basina sinirlari ve fiyati icin oyuncunun yuku:
   * kuleleri, takili esyalariyla, ve envanterde bekleyen esyalar.
   */
  private getPlayerShopLoadout(playerId: string, player: Player): ShopItemLoadout {
    return {
      towers: Array.from(this.towers.values()).filter((tower) => tower.ownerId === playerId).map((tower) => ({ definition: tower.definition, equippedItemIds: tower.equippedShopItemIds })),
      inventoryItemIds: player.inventoryItemIds
    };
  }

  private getPlayerTowerDefinitions(playerId: string) {
    return Array.from(this.towers.values()).filter((tower) => tower.ownerId === playerId).map((tower) => tower.definition);
  }

  /**
   * Takimda dusmani isaretleyebilen bir kaynak var mi.
   *
   * Isaret dusmanin uzerinde durur ve kimin kulesi vurursa vursun isler, o
   * yuzden bakilan oyuncunun degil takimin tamami. Uc kaynak var: izci
   * kulesinin takip isareti (`appliesMark`), Melis'in yeralti bagi
   * (archer-4) ve Atakan'in Yonlendirme becerisi. Hicbiri yoksa isarete
   * bagli kart ve esyalar bos secimdir ve cekilis onlari geri ceker.
   */
  private canTeamMarkEnemies() {
    for (const player of this.state.players.values()) {
      if (player.characterId === "warrior") return true;
    }
    for (const tower of this.towers.values()) {
      if (tower.definition.engine?.appliesMark || tower.definition.id === "archer-4") return true;
    }
    return false;
  }

  private openPlayerSetupShop(playerId: string, player: Player) {
    player.shopRerolls = 0;
    player.shopOffers = drawShopOffers({ wave: this.wave, preferredAxes: getCharacterCardAxes(player.characterId), towers: this.getPlayerTowerDefinitions(playerId), ownedItemIds: player.ownedShopItemIds, ownedCardIds: player.ownedCardIds, marksAvailable: this.canTeamMarkEnemies(), excludeItemIds: this.getShopOfferExclusions(player), loadout: this.getPlayerShopLoadout(playerId, player) });
  }

  /**
   * Bu dalga vitrine bir daha cikmayacak esyalar. Riskli Yatirim dalga basina
   * bir kez: alinan teklif vitrinden dusuyordu ama yenileme onu ayni hazirlikta
   * geri getirebiliyordu ve ikinci alim bir +400 daha veriyordu.
   */
  private getShopOfferExclusions(_player: Player) {
    return this.riskyInvestmentWave === this.wave ? ["riskli-yatirim"] : [];
  }

  /**
   * Riskli Yatirim'in bu macta en son alindigi dalga. Takimda dalga basina
   * bir kez: bedel takimin nexusundan odeniyor, yani co-op'ta herkes ayri
   * alabilseydi takim bir dalgada 10 yerine 40 can kaybedebilirdi. Odada
   * duruyor, oyuncuda degil: yuva devri ve yeniden baglanma onu etkilemiyor.
   */
  private riskyInvestmentWave = -1;

  private rerollShop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !this.setupPhase) return;
    const price = Math.ceil(getShopRerollPrice(player.shopRerolls) * getModifierMultiplier(player.runModifiers, "shopRerollCost"));
    if (player.gold < price) return;
    player.gold -= price;
    player.goldSpent += price;
    player.shopRerolls += 1;
    player.shopOffers = drawShopOffers({ wave: this.wave, preferredAxes: getCharacterCardAxes(player.characterId), towers: this.getPlayerTowerDefinitions(client.sessionId), ownedItemIds: player.ownedShopItemIds, ownedCardIds: player.ownedCardIds, marksAvailable: this.canTeamMarkEnemies(), excludeItemIds: this.getShopOfferExclusions(player), loadout: this.getPlayerShopLoadout(client.sessionId, player) });
  }

  private buyShopItem(client: Client, message: BuyShopItemMessage) {
    const player = this.state.players.get(client.sessionId);
    const item = message.itemId ? getShopItem(message.itemId) : undefined;
    if (!player || !item || !this.setupPhase || !player.shopOffers.some(({ id }) => id === item.id)) return;
    if (item.id === "riskli-yatirim" && (this.teamHealth <= RISKY_INVESTMENT_NEXUS_COST || this.riskyInvestmentWave === this.wave)) return;
    const price = getShopItemPrice(item, player.ownedShopItemIds, this.getPlayerShopLoadout(client.sessionId, player));
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
    if (item.deposit) this.addGoldDeposit(player, item.deposit);
    if (item.id === "bariyer" || item.id === "ziftli-zemin") {
      const charges = this.shopPlacementCharges.get(client.sessionId) ?? { bariyer: 0, "ziftli-zemin": 0 };
      charges[item.id] += 1;
      this.shopPlacementCharges.set(client.sessionId, charges);
      client.send("shop:placement-required", { itemId: item.id });
    }
    if (item.id === "riskli-yatirim" && this.teamHealth > RISKY_INVESTMENT_NEXUS_COST) {
      this.riskyInvestmentWave = this.wave;
      this.teamHealth -= RISKY_INVESTMENT_NEXUS_COST;
      player.gold += RISKY_INVESTMENT_GOLD;
      // Takimin vitrinlerinden de duser; herkese kimin aldigi soyleniyor.
      for (const other of this.state.players.values()) {
        if (other !== player) other.shopOffers = other.shopOffers.filter(({ id }) => id !== "riskli-yatirim");
      }
      const notice: RiskyInvestmentMessage = { buyerId: client.sessionId, nexusCost: RISKY_INVESTMENT_NEXUS_COST, gold: RISKY_INVESTMENT_GOLD };
      this.broadcast("shop:risky-investment", notice);
    }
    player.shopOffers = player.shopOffers.filter(({ id }) => id !== item.id);
    client.send("shop:purchased", { itemId: item.id, price });
  }

  /**
   * Envanterdeki bir esyayi secilen kuleye takar.
   *
   * Takma geri alinamaz oldugu icin dogrulama tamamen sunucuda: sahiplik, esyanin
   * gercekten envanterde olmasi, kulenin esyayla uyumlulugu, esyanin kule basina
   * siniri ve 10'lu tavan burada
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

    const healthRatio = this.getTowerHealthRescaleRatio(tower, item.effects);
    tower.maxHp *= healthRatio;
    tower.hp *= healthRatio;

    tower.runModifiers.push(...item.effects);
    client.send("inventory:equipped", { itemId: item.id, towerId: tower.id });
  }

  /**
   * Kuleye yeni eklenecek etkilerin can tavanina getirdigi oran.
   *
   * Can bonusu mevcut cana oranli uygulanmali, yoksa hasarli bir kule esya
   * takildiginda tam cana donerdi. Esya takma, hedefli kart ve onizleme ayni
   * orani buradan okur; biri ayri hesaplarsa onizleme ile sonuc ayrisir.
   * Etkiler henuz kulenin listesine yazilmamis olmali.
   */
  private getTowerHealthRescaleRatio(tower: TowerModel, effects: RunModifiers) {
    const healthAdd = getModifierAdd(effects, "towerHealth");
    if (healthAdd === 0) return 1;
    const before = 1 + getModifierAdd(this.getTowerRunModifiers(tower), "towerHealth");
    return (before + healthAdd) / Math.max(0.01, before);
  }

  private setTowerTargeting(client: Client, message: SetTowerTargetingMessage) {
    const player = this.state.players.get(client.sessionId);
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!player || !tower || tower.ownerId !== client.sessionId || !message.mode) return;
    if (!this.acceptsTowerOperation(tower)) return;
    if (tower.definition.engine?.attack.shape === "orbit") return;
    // Ilk, en guclu ve isaretli modlari her kulede aciktir; digerleri kilit ister.
    const requiredUnlock = message.mode === "first" || message.mode === "strongest" || message.mode === "marked"
      ? undefined
      : `targeting:${message.mode}` as Unlock;
    if (requiredUnlock && !this.towerHasUnlock(tower, requiredUnlock)) return;
    tower.targetingMode = message.mode;
  }

  private placeShopMapItem(client: Client, message: PlaceShopMapItemMessage) {
    // Esya kimligi iki degerden biri olmali. Bir donem yalnizca hakkin
    // `<= 0` olmadigina bakiliyordu: "constructor" gibi bir kimlik nesnenin
    // prototipinden bir fonksiyon okuyordu, karsilastirma yanlis cikiyor ve
    // tek bir alimdan sonra sinirsiz bariyer kuruluyordu (her biri butun
    // haritayi yayinliyordu).
    const itemId = message.itemId;
    if (itemId !== "bariyer" && itemId !== "ziftli-zemin") return;
    if (!this.setupPhase || !isFiniteNumber(message.x) || !isFiniteNumber(message.y)) return;
    const charges = this.shopPlacementCharges.get(client.sessionId);
    if (!charges || !(charges[itemId] > 0)) return;
    const cell = worldToGrid(message.x, message.y, this.activeMap);
    if (!isInsideMap(this.activeMap, cell.col, cell.row) || getTile(this.activeMap, cell.col, cell.row) !== "road" || cell.row === 0 || cell.row === this.activeMap.rows - 1) return;
    const key = `${cell.col}:${cell.row}`;
    if (itemId === "ziftli-zemin") {
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
    charges[itemId] -= 1;
  }

  /**
   * `sourceTower`: olduren kule. Ona takili esyanin ya da hedefli kartin
   * tecrube bonusu (Egitim Sahasi) yalnizca kulenin sahibinin payina ve
   * yalnizca kulenin **kendi** listesinden ekleniyor -- oyuncunun listesi
   * zaten okunuyor, `getTowerRunModifiers` onu ikinci kez sayardi. Bir donem
   * bu yol yoktu ve Egitim Sahasi takildigi kulede hicbir sey yapmiyordu.
   */
  private awardEnemyExperience(enemy: EnemyModel, sourceTower?: TowerModel) {
    // Ayrilan oyuncu pay almiyor: tecrube kalanlar arasinda bolunuyor.
    const players = Array.from(this.state.players.entries())
      .filter(([sessionId]) => !this.departedSessionIds.has(sessionId))
      .map(([, player]) => player);
    if (players.length === 0) {
      return;
    }

    const share = (enemy.champion?.exp ?? enemy.special?.budget?.exp ?? getEnemyExp(this.wave, enemy.type, enemy.movementKind)) / players.length;
    const killer = sourceTower ? this.state.players.get(sourceTower.ownerId) : undefined;
    for (const player of players) {
      // Kazanc oyuncu basina olceklenir: tecrube kartlari oyuncunun kendi
      // ilerlemesini hizlandirmali, odadaki herkesinkini degil. Kart ve esya
      // bonuslari ayni havuzda toplaniyor (`1 + toplam`).
      const modifiers = player === killer && sourceTower
        ? [...(player.runModifiers ?? []), ...(sourceTower.runModifiers ?? [])]
        : player.runModifiers ?? [];
      player.experience = (player.experience ?? 0) + share * getModifierMultiplier(modifiers, "experienceGain");
    }
  }

  private updateLogisticsWorker(worker: DroneModel, seconds: number) {
    const capacity = this.getWorkerCapacity(worker);
    if (worker.mode === "repairer") {
      this.updateRepairWorker(worker, seconds);
      return;
    }
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
            this.applyCrystalNodePickup(worker, node.id);
          }
        } else {
          worker.extractionRemainingMs = undefined;
        }
        return;
      }
      if (reactor.energy < reactor.maxEnergy && this.moveLogisticsWorker(worker, reactor.x, reactor.y, seconds)) {
        const delivered = Math.min(worker.cargo ?? 0, reactor.maxEnergy - reactor.energy);
        const becameFull = reactor.energy + delivered >= reactor.maxEnergy;
        reactor.energy += delivered;
        worker.cargo = 0;
        if (delivered > 0) this.applyCrystalWorkerArrival(worker, reactor, becameFull);
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
        if (delivered > 0) this.applyAmmoCollectorArrival(worker, factory);
        worker.logisticsPhase = "pickup";
      }
      return;
    }

    if (worker.mode === "energyTransport") {
      if (worker.logisticsPhase === "pickup") {
        if ((worker.cargo ?? 0) > 0) { worker.logisticsPhase = "deliver"; return; }
        const recipient = this.selectDeliveryTarget(worker, "energy");
        const reactor = Array.from(this.towers.values()).find((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && tower.definition.resourceProvider === "energy");
        if (reactor && this.moveLogisticsWorker(worker, reactor.x, reactor.y, seconds) && reactor.energy > 0) {
          const loaded = Math.min(capacity, reactor.energy, recipient ? Math.max(0, recipient.maxEnergy - recipient.energy - this.getReservedCargo(worker, recipient)) : capacity);
          reactor.energy -= loaded;
          worker.cargo = loaded;
          worker.logisticsPhase = "deliver";
          worker.targetTowerId = recipient?.id ?? "";
        }
        return;
      }
      const locked = worker.targetTowerId ? this.towers.get(worker.targetTowerId) : undefined;
      const target = locked && locked.hp > 0 && locked.ownerId === worker.ownerId && locked.energy < locked.maxEnergy
        && this.getWorkerApproachPoint(worker, locked.x, locked.y)
        ? locked : this.selectDeliveryTarget(worker, "energy");
      if (!target) {
        worker.targetTowerId = "";
        return;
      }
      worker.targetTowerId = target.id;
      if (this.moveLogisticsWorker(worker, target.x, target.y, seconds)) {
        const delivered = Math.min(worker.cargo ?? 0, target.maxEnergy - target.energy);
        target.energy += delivered;
        worker.cargo = Math.max(0, (worker.cargo ?? 0) - delivered);
        if (delivered > 0) this.applyEnergyWorkerArrival(worker, target);
        if (delivered > 0) this.awardDeliveryGold(target, delivered, "energy");
        worker.logisticsPhase = (worker.cargo ?? 0) > 0 ? "deliver" : "pickup";
        this.deliveryWaitingSince.delete(`energy:${target.id}`);
        worker.targetTowerId = "";
      }
      return;
    }

    if (worker.logisticsPhase === "pickup") {
      if ((worker.cargo ?? 0) > 0) { worker.logisticsPhase = "deliver"; return; }
      const factory = Array.from(this.towers.values()).find((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && tower.definition.resourceProvider === "ammunition");
      if (!factory || !this.moveLogisticsWorker(worker, factory.x, factory.y, seconds)) {
        return;
      }
      const target = this.selectDeliveryTarget(worker, "ammo");
      if (target && factory.ammo > 0) {
        const loaded = Math.min(capacity, factory.ammo, Math.max(0, target.maxAmmo - target.ammo - this.getReservedCargo(worker, target)));
        factory.ammo -= loaded;
        worker.cargo = loaded;
        worker.cargoSpecial = Boolean(factory.ammoRefinerUntil && factory.ammoRefinerUntil > Date.now());
        worker.cargoAmmoPayloadKind = worker.cargoSpecial ? "refined" : undefined;
        worker.cargoAmmoType = target.ammoType;
        worker.targetTowerId = target.id;
        worker.logisticsPhase = "deliver";
      }
      return;
    }
    const locked = worker.targetTowerId ? this.towers.get(worker.targetTowerId) : undefined;
    const target = locked && locked.hp > 0 && locked.ownerId === worker.ownerId && locked.ammoLogisticsEnabled && locked.ammo < locked.maxAmmo
      && this.getWorkerApproachPoint(worker, locked.x, locked.y)
      ? locked : this.selectDeliveryTarget(worker, "ammo");
    if (!target) {
      worker.targetTowerId = "";
      return;
    }
    worker.targetTowerId = target.id;
    if (this.moveLogisticsWorker(worker, target.x, target.y, seconds)) {
      const delivered = Math.min(worker.cargo ?? 0, target.maxAmmo - target.ammo);
      const hadNoAmmo = target.ammo <= 0;
      target.ammo += delivered;
      worker.cargo = Math.max(0, (worker.cargo ?? 0) - delivered);
      if (delivered > 0) this.applyAmmoTransportArrival(worker, target, hadNoAmmo);
      if (delivered > 0) this.awardDeliveryGold(target, delivered, "ammo");
      worker.logisticsPhase = (worker.cargo ?? 0) > 0 ? "deliver" : "pickup";
      this.deliveryWaitingSince.delete(`ammo:${target.id}`);
      worker.targetTowerId = "";
    }
  }

  private hasWorkerSkill(worker: DroneModel, skill: WorkerSkillId) {
    if ((worker.skillIds ?? []).includes(skill)) return true;
    const player = this.state.players.get(worker.ownerId);
    return Boolean(player?.workerSkillIds?.includes(skill));
  }

  private hasWorkerSkillForOwner(ownerId: string, role: HirableWorkerRole, skill: WorkerSkillId) {
    return Array.from(this.drones.values()).some((drone) => drone.ownerId === ownerId && drone.mode === role && this.hasWorkerSkill(drone, skill));
  }

  /** Etkin bir isci agaci etkisi; suresi dolmus ya da atislari bitmisse yok. */
  private getWorkerBoost(tower: TowerModel, kind: WorkerBoostKind, now = Date.now()) {
    const boost = tower.workerBoosts?.[kind];
    if (!boost || boost.until <= now || (boost.shots !== undefined && boost.shots <= 0)) return undefined;
    return boost;
  }

  /** `1 - value` carpani (maliyet, isi, alinan hasar); etki yoksa 1. */
  private getWorkerBoostReduction(tower: TowerModel, kind: "energyCost" | "ammoCost" | "heat" | "damageTaken") {
    return Math.max(0, 1 - (this.getWorkerBoost(tower, kind)?.value ?? 0));
  }

  private getWorkerPierceBonus(tower: TowerModel) {
    return Math.round(this.getWorkerBoost(tower, "pierce")?.value ?? 0);
  }

  private getWorkerBoostDamageAdd(tower: TowerModel, now: number) {
    if (!tower.workerBoosts) return 0;
    let add = (this.getWorkerBoost(tower, "damage", now)?.value ?? 0) + (this.getWorkerBoost(tower, "damageShots", now)?.value ?? 0);
    const fullTank = this.getWorkerBoost(tower, "fullTankDamage", now);
    if (fullTank && tower.maxEnergy > 0 && tower.energy >= tower.maxEnergy * WORKER_FULL_TANK_ENERGY_RATIO) add += fullTank.value;
    return add;
  }

  /**
   * Etkiyi kuleye yazar. Ayni etki yeniden gelirse toplanmiyor: en guclu
   * deger ve en uzun sure kaliyor, atis sayisi da en buyugune tamamlaniyor.
   */
  private grantWorkerBoost(tower: TowerModel, kind: WorkerBoostKind, value: number, durationMs: number, shots?: number, now = Date.now()) {
    const boosts = tower.workerBoosts ??= {};
    const current = this.getWorkerBoost(tower, kind, now);
    boosts[kind] = {
      until: Math.max(current?.until ?? 0, now + durationMs),
      value: Math.max(current?.value ?? 0, value),
      shots: shots === undefined ? undefined : Math.max(current?.shots ?? 0, shots)
    };
  }

  private spendWorkerBoostShot(tower: TowerModel, kind: WorkerBoostKind, now: number) {
    const boost = this.getWorkerBoost(tower, kind, now);
    if (boost?.shots !== undefined) boost.shots -= 1;
  }

  /** Isaretleyen ve yavaslatan mermiler: kulenin her dogrudan vurusu bir hak harciyor. */
  private applyWorkerHitBoosts(towerId: string, enemy: EnemyModel, now: number) {
    const tower = this.towers.get(towerId);
    if (!tower?.workerBoosts) return;
    const mark = this.getWorkerBoost(tower, "markShots", now);
    if (mark) {
      this.spendWorkerBoostShot(tower, "markShots", now);
      // Var olan Takip yiginini tazeliyor, yoksa bir yigin aciyor; yigini buyutmuyor.
      this.applyTrackingStacks(enemy, now + mark.value, Math.max(1, this.getTrackingStackCount(enemy, now)));
    }
    const slow = this.getWorkerBoost(tower, "slowShots", now);
    if (slow) {
      this.spendWorkerBoostShot(tower, "slowShots", now);
      this.extendFlatSlow(enemy, now + slow.value, now);
    }
  }

  private getWorkerDevelopmentEffect(worker: DroneModel, direction: WorkerDevelopmentSkillId) {
    return resolveWorkerDevelopmentEffect((skill) => this.hasWorkerSkill(worker, skill), direction);
  }

  private getOwnerDevelopmentTowers(ownerId: string) {
    return Array.from(this.towers.values()).filter((tower) => tower.ownerId === ownerId && tower.hp > 0 && isOperationalTower(tower.definition));
  }

  /** Enerji tasiyicinin yon secimleri: teslim alan kuleye. */
  private applyEnergyWorkerDevelopment(worker: DroneModel, target: TowerModel, now: number) {
    const voltage = this.getWorkerDevelopmentEffect(worker, "energy-high-voltage");
    if (voltage) this.grantWorkerBoost(target, "energyCost", voltage.value ?? 0, voltage.durationMs ?? 0, undefined, now);
    const coil = this.getWorkerDevelopmentEffect(worker, "energy-cooling-coil");
    if (coil) {
      target.temperature = Math.max(0, target.temperature - (coil.value ?? 0));
      if (this.hasWorkerSkill(worker, "energy-cryo-coil")) target.heatLocked = false;
    }
    const markGuard = this.getWorkerDevelopmentEffect(worker, "energy-mark-guard");
    if (markGuard) this.grantWorkerBoost(target, "markGuard", 1, markGuard.durationMs ?? 0, undefined, now);
    const stackGuard = this.getWorkerDevelopmentEffect(worker, "energy-target-lock");
    if (stackGuard) this.grantWorkerBoost(target, "stackGuard", 1, stackGuard.durationMs ?? 0, undefined, now);
    const line = this.getWorkerDevelopmentEffect(worker, "energy-long-line");
    if (line) this.grantWorkerBoost(target, "range", line.value ?? 0, line.durationMs ?? 0, undefined, now);
    const tank = this.getWorkerDevelopmentEffect(worker, "energy-full-tank");
    if (tank) this.grantWorkerBoost(target, "fullTankDamage", tank.value ?? 0, tank.durationMs ?? 0, undefined, now);
  }

  /** Kristal toplayicinin yon secimleri: reaktor teslimatinda sahibin kulelerine. */
  private applyCrystalWorkerDevelopment(worker: DroneModel, reactor: TowerModel, becameFull: boolean, now: number) {
    const overload = this.getWorkerDevelopmentEffect(worker, "crystal-overload");
    const vent = this.getWorkerDevelopmentEffect(worker, "crystal-heat-vent");
    const burst = this.getWorkerDevelopmentEffect(worker, "crystal-burst-reserve");
    const steady = this.getWorkerDevelopmentEffect(worker, "crystal-steady-flow");
    const field = this.getWorkerDevelopmentEffect(worker, "crystal-near-field");
    const link = this.getWorkerDevelopmentEffect(worker, "crystal-far-link");
    if (!overload && !vent && !burst && !steady && !field && !link) return;
    const towers = this.getOwnerDevelopmentTowers(worker.ownerId).filter((tower) => tower.id !== reactor.id && !tower.definition.resourceProvider);
    if (overload) for (const tower of towers) this.grantWorkerBoost(tower, "energyCost", overload.value ?? 0, overload.durationMs ?? 0, undefined, now);
    if (vent) {
      const hottest = [...towers].sort((left, right) => right.temperature - left.temperature).slice(0, vent.count ?? 0);
      for (const tower of hottest) tower.temperature = Math.max(0, tower.temperature - (vent.value ?? 0));
    }
    if (burst && becameFull && (reactor.crystalBurstReadyAt ?? 0) <= now) {
      reactor.crystalBurstReadyAt = now + (burst.cooldownMs ?? 0);
      for (const tower of towers) tower.energyFreeUntil = Math.max(tower.energyFreeUntil ?? 0, now + (burst.durationMs ?? 0));
    }
    if (steady) for (const tower of towers) this.grantWorkerBoost(tower, "upkeepFree", 1, steady.durationMs ?? 0, undefined, now);
    if (field) {
      const radius = getMapGridSize(this.activeMap) * (field.radiusCells ?? 0);
      for (const tower of towers) {
        if (distanceSq(tower.x, tower.y, reactor.x, reactor.y) <= radius * radius) this.grantWorkerBoost(tower, "damage", field.value ?? 0, field.durationMs ?? 0, undefined, now);
      }
    }
    if (link) {
      const farthest = [...towers]
        .filter((tower) => tower.maxEnergy > 0)
        .sort((left, right) => distanceSq(reactor.x, reactor.y, right.x, right.y) - distanceSq(reactor.x, reactor.y, left.x, left.y))
        .slice(0, link.count ?? 0);
      for (const tower of farthest) {
        tower.energy = Math.min(tower.maxEnergy, tower.energy + (link.value ?? 0));
        if (tower.energy > 0) tower.energyDepletedAt = 0;
      }
    }
  }

  /**
   * Muhimmat teslimati: tasiyicinin kendi yon secimleri ve fabrikanin
   * (mühimmat toplayicinin) partiye kattiklari. Toplayici secimleri o roldeki
   * canli bir isciye bagli, oteki fabrika becerileri gibi.
   */
  private applyAmmoWorkerDevelopment(worker: DroneModel, target: TowerModel, now: number) {
    const owner = (skill: WorkerSkillId) => this.hasWorkerSkillForOwner(worker.ownerId, "ammoCollector", skill);
    const heavy = resolveWorkerDevelopmentEffect(owner, "ammo-heavy-cast");
    if (heavy) this.grantWorkerBoost(target, "damageShots", heavy.value ?? 0, WORKER_SHOT_BOOST_LIFETIME_MS, heavy.shots, now);
    const light = resolveWorkerDevelopmentEffect(owner, "ammo-light-cast");
    if (light) this.grantWorkerBoost(target, "ammoCost", light.value ?? 0, light.durationMs ?? 0, undefined, now);
    const casing = resolveWorkerDevelopmentEffect(owner, "ammo-heat-sink-casing");
    if (casing) this.grantWorkerBoost(target, "heat", casing.value ?? 0, casing.durationMs ?? 0, undefined, now);
    const core = resolveWorkerDevelopmentEffect(owner, "ammo-piercing-core");
    if (core) this.grantWorkerBoost(target, "pierce", core.value ?? 0, core.durationMs ?? 0, undefined, now);
    const crate = resolveWorkerDevelopmentEffect(owner, "ammo-armored-crate");
    if (crate) this.grantWorkerBoost(target, "damageTaken", crate.value ?? 0, crate.durationMs ?? 0, undefined, now);
    const barrel = resolveWorkerDevelopmentEffect(owner, "ammo-long-barrel");
    if (barrel) this.grantWorkerBoost(target, "range", barrel.value ?? 0, barrel.durationMs ?? 0, undefined, now);

    const jacket = this.getWorkerDevelopmentEffect(worker, "ammo-heat-jacket");
    if (jacket) this.grantWorkerBoost(target, "cooling", jacket.value ?? 0, jacket.durationMs ?? 0, undefined, now);
    const feed = this.getWorkerDevelopmentEffect(worker, "ammo-fast-feed");
    if (feed) this.grantWorkerBoost(target, "fireRate", feed.value ?? 0, feed.durationMs ?? 0, undefined, now);
    const trace = this.getWorkerDevelopmentEffect(worker, "ammo-trace-rounds");
    if (trace) this.grantWorkerBoost(target, "markShots", trace.durationMs ?? 0, WORKER_SHOT_BOOST_LIFETIME_MS, trace.shots, now);
    const concussion = this.getWorkerDevelopmentEffect(worker, "ammo-concussion-rounds");
    if (concussion) this.grantWorkerBoost(target, "slowShots", concussion.durationMs ?? 0, WORKER_SHOT_BOOST_LIFETIME_MS, concussion.shots, now);
    const shared = this.getWorkerDevelopmentEffect(worker, "ammo-shared-crate");
    if (shared) {
      for (const neighbor of this.getAdjacentFriendlyTowers(target)) {
        if (neighbor.hp <= 0 || neighbor.maxAmmo <= 0 || neighbor.ammoType !== target.ammoType) continue;
        neighbor.ammo = Math.min(neighbor.maxAmmo, neighbor.ammo + (shared.value ?? 0));
      }
    }
    const lone = this.getWorkerDevelopmentEffect(worker, "ammo-lone-courier");
    if (lone && this.isTowerIsolated(target)) this.grantWorkerBoost(target, "damage", lone.value ?? 0, lone.durationMs ?? 0, undefined, now);
  }

  /** Tamircinin yon secimleri: onarimi biten (tam cana donen) kuleye. */
  private applyRepairWorkerDevelopment(worker: DroneModel, target: TowerModel, now: number) {
    const tune = this.getWorkerDevelopmentEffect(worker, "repair-tune-up");
    if (tune) this.grantWorkerBoost(target, "energyCost", tune.value ?? 0, tune.durationMs ?? 0, undefined, now);
    const coolant = this.getWorkerDevelopmentEffect(worker, "repair-coolant");
    if (coolant) {
      target.temperature = 0;
      target.heatLocked = false;
      this.grantWorkerBoost(target, "cooling", coolant.value ?? 0, coolant.durationMs ?? 0, undefined, now);
    }
    const plating = this.getWorkerDevelopmentEffect(worker, "repair-armor-plating");
    if (plating) this.grantWorkerBoost(target, "damageTaken", plating.value ?? 0, plating.durationMs ?? 0, undefined, now);
    const sight = this.getWorkerDevelopmentEffect(worker, "repair-sight-tuning");
    if (sight) this.grantWorkerBoost(target, "range", sight.value ?? 0, sight.durationMs ?? 0, undefined, now);
    const parts = this.getWorkerDevelopmentEffect(worker, "repair-spare-parts");
    if (parts && target.maxAmmo > 0) target.ammo = Math.min(target.maxAmmo, target.ammo + target.maxAmmo * (parts.value ?? 0));
    const battery = this.getWorkerDevelopmentEffect(worker, "repair-battery-swap");
    if (battery && target.maxEnergy > 0) {
      target.energy = Math.min(target.maxEnergy, target.energy + target.maxEnergy * (battery.value ?? 0));
      if (target.energy > 0) target.energyDepletedAt = 0;
    }
  }

  private getOwnerWorker(ownerId: string, role: HirableWorkerRole) {
    return Array.from(this.drones.values()).find((drone) => drone.ownerId === ownerId && drone.mode === role);
  }

  private applyCrystalWorkerArrival(worker: DroneModel, reactor: TowerModel, becameFull: boolean) {
    const now = Date.now();
    if (this.hasWorkerSkill(worker, "crystal-reserve")) {
      reactor.crystalReserve = Math.min(24, (reactor.crystalReserve ?? 0) + 12);
    }
    if (becameFull && this.hasWorkerSkill(worker, "crystal-resonance") && (reactor.crystalResonanceReadyAt ?? 0) <= now) {
      reactor.crystalResonanceReadyAt = now + 12_000;
      for (const tower of this.towers.values()) {
        if (tower.ownerId !== worker.ownerId || tower.hp <= 0 || !isOperationalTower(tower.definition)) continue;
        tower.temperature = Math.max(0, tower.temperature - 25);
        if (tower.heatLocked) tower.heatLocked = false;
      }
    }
    if (this.hasWorkerSkill(worker, "crystal-conduit") && reactor.crystalConduitWave !== this.wave) {
      reactor.crystalConduitWave = this.wave;
      const linked = Array.from(this.towers.values())
        .filter((tower) => tower.ownerId === worker.ownerId && tower.hp > 0 && isOperationalTower(tower.definition))
        .sort((left, right) => distanceSq(reactor.x, reactor.y, left.x, left.y) - distanceSq(reactor.x, reactor.y, right.x, right.y))
        .slice(0, 2);
      for (const tower of linked) {
        tower.energyConduitUntil = now + 10_000;
        tower.energyConduitSourceId = reactor.id;
      }
    }
    this.applyCrystalWorkerDevelopment(worker, reactor, becameFull, now);
  }

  private applyCrystalNodePickup(worker: DroneModel, nodeId: string) {
    if (!this.hasWorkerSkill(worker, "crystal-trap")) return;
    const key = `${worker.ownerId}:${nodeId}:${this.wave}`;
    if (this.crystalTrapKeys.has(key)) return;
    this.crystalTrapKeys.add(key);
    this.crystalTrapUntil.set(`${worker.ownerId}:${nodeId}`, Date.now() + 5_000);
  }

  private applyCrystalReactorEmergency(reactor: TowerModel, now: number) {
    if (reactor.energy > 0 || reactor.definition.resourceProvider !== "energy") return;
    if ((reactor.crystalReserve ?? 0) > 0) {
      reactor.energy = Math.min(reactor.maxEnergy, reactor.crystalReserve ?? 0);
      reactor.crystalReserve = 0;
      reactor.energyDepletedAt = 0;
    }
    if (this.hasWorkerSkillForOwner(reactor.ownerId, "crystalCollector", "crystal-last-core") && reactor.crystalLastCoreWave !== this.wave) {
      reactor.crystalLastCoreWave = this.wave;
      reactor.energy = Math.min(reactor.maxEnergy, reactor.energy + 25);
      for (const tower of this.towers.values()) {
        if (tower.ownerId === reactor.ownerId && tower.hp > 0 && isOperationalTower(tower.definition)) tower.energyFreeUntil = now + 3_000;
      }
      reactor.energyDepletedAt = 0;
      return;
    }
    if (this.hasWorkerSkillForOwner(reactor.ownerId, "crystalCollector", "crystal-critical-resonance") && reactor.crystalCriticalResonanceWave !== this.wave) {
      reactor.crystalCriticalResonanceWave = this.wave;
      const radius = getMapGridSize(this.activeMap) * 3;
      for (const enemy of this.enemies.values()) {
        if (distanceSq(enemy.x, enemy.y, reactor.x, reactor.y) <= radius * radius) this.extendFlatSlow(enemy, now + 3_000, now);
      }
      for (const tower of this.towers.values()) {
        if (tower.ownerId === reactor.ownerId && distanceSq(tower.x, tower.y, reactor.x, reactor.y) <= radius * radius) tower.heatLocked = false;
      }
    }
  }

  private applyAmmoCollectorArrival(worker: DroneModel, factory: TowerModel) {
    const now = Date.now();
    if (this.hasWorkerSkill(worker, "ammo-refiner")) factory.ammoRefinerUntil = now + 20_000;
    if (this.hasWorkerSkill(worker, "ammo-cast-shell")) factory.ammoFactoryShield = Math.min(40, (factory.ammoFactoryShield ?? 0) + 20);
    if (this.hasWorkerSkill(worker, "ammo-emergency-refinery") && factory.energy <= 0) {
      const batch = Math.min(6, factory.rawAmmo, factory.maxAmmo - factory.ammo);
      factory.rawAmmo = Math.max(0, factory.rawAmmo - batch);
      factory.ammo = Math.min(factory.maxAmmo, factory.ammo + batch);
    }
  }

  private applyAmmoTransportArrival(worker: DroneModel, target: TowerModel, hadNoAmmo: boolean) {
    const now = Date.now();
    if (worker.cargoSpecial || this.hasWorkerSkill(worker, "ammo-special-payload")) {
      target.ammoPayloadUntil = now + 20_000;
      target.ammoPayloadKind = worker.cargoAmmoPayloadKind ?? "special";
      target.ammoPayloadShots = 6;
    }
    if (hadNoAmmo && this.hasWorkerSkill(worker, "ammo-emergency-magazine")) target.ammoEmergencyShots = 3;
    if (this.hasWorkerSkill(worker, "ammo-assault-convoy")) {
      if ((target.ammoAssaultArmedUntil ?? 0) > now) {
        target.ammoAssaultUntil = now + 5_000;
        target.ammoAssaultArmedUntil = 0;
      } else target.ammoAssaultArmedUntil = now + 20_000;
    }
    if (target.hp / Math.max(1, target.maxHp) < 0.35 && this.hasWorkerSkill(worker, "ammo-evacuation-convoy")) {
      target.ammoEvacuationUntil = now + 10_000;
    }
    if (this.hasWorkerSkill(worker, "ammo-transfer-dock") && (worker.cargo ?? 0) > 0) {
      const neighbor = this.getAdjacentFriendlyTowers(target).find((tower) => tower.hp > 0 && tower.ammo < tower.maxAmmo);
      if (neighbor) {
        const moved = Math.min(worker.cargo ?? 0, neighbor.maxAmmo - neighbor.ammo);
        neighbor.ammo += moved;
        worker.cargo = Math.max(0, (worker.cargo ?? 0) - moved);
      }
    }
    this.applyAmmoWorkerDevelopment(worker, target, now);
    worker.cargoSpecial = false;
    worker.cargoAmmoPayloadKind = undefined;
  }

  private hasEnergyWorkerSkill(worker: DroneModel, skill: EnergyWorkerSkillId) {
    return worker.mode === "energyTransport" && this.hasWorkerSkill(worker, skill);
  }

  /**
   * Enerji krizi: sahibin ayakta duran savas kulelerinden birinin kendi
   * enerjisi tavaninin %25'inin altinda. Bosalmis kule de bu esigin altinda
   * oldugu icin ayrica "enerjisiz" durumuna bakmak gerekmiyor.
   */
  private isOwnerInEnergyCrisis(ownerId: string) {
    for (const tower of this.towers.values()) {
      if (tower.ownerId !== ownerId || tower.hp <= 0 || !isOperationalTower(tower.definition) || tower.maxEnergy <= 0) continue;
      if (tower.energy < tower.maxEnergy * LOAD_SHEDDER_CRISIS_ENERGY_RATIO) return true;
    }
    return false;
  }

  private applyEnergyWorkerArrival(worker: DroneModel, target: TowerModel) {
    const now = Date.now();
    if (this.hasEnergyWorkerSkill(worker, "energy-relay")) {
      target.energyRelayUntil = now + 8_000;
      target.energyRelaySourceId = target.id;
      for (const neighbor of this.getAdjacentFriendlyTowers(target)) {
        if (neighbor.id === target.id || !isOperationalTower(neighbor.definition)) continue;
        neighbor.energyRelayUntil = now + 8_000;
        neighbor.energyRelaySourceId = target.id;
      }
    }
    if (this.hasEnergyWorkerSkill(worker, "local-capacitor")) {
      target.energyLocalReserve = Math.min(18, (target.energyLocalReserve ?? 0) + 18);
    }
    // Yuk Kesici yalnizca krizde ve yalnizca oyuncunun "Dusuk" diye
    // isaretledigi kuleleri kapatir. Bir donem her teslimatta teslim alan
    // disindaki butun kuleleri susturuyordu; oyuncu oncelik secse de secmese
    // de sonuc ayniydi, yani oncelik bir karar degildi.
    if (this.hasEnergyWorkerSkill(worker, "load-shedder") && this.isOwnerInEnergyCrisis(worker.ownerId)) {
      for (const tower of this.towers.values()) {
        if (tower.ownerId !== worker.ownerId || tower.id === target.id || !isOperationalTower(tower.definition)
          || tower.logisticsPriority !== "low") continue;
        tower.energyShedUntil = now + LOAD_SHEDDER_DURATION_MS;
      }
    }
    // Frekans Paylastirici yalnizca enerjisi azalan kuleleri donusumlu
    // calistirir; dolu bir kuleyi yavaslatmanin karsiligi yok.
    if (this.hasEnergyWorkerSkill(worker, "frequency-share")) {
      for (const tower of this.towers.values()) {
        if (tower.ownerId !== worker.ownerId || !isOperationalTower(tower.definition)
          || tower.energy >= tower.maxEnergy * FREQUENCY_SHARE_ENERGY_RATIO) continue;
        tower.energyFrequencyUntil = now + FREQUENCY_SHARE_DURATION_MS;
      }
    }
    if (this.hasEnergyWorkerSkill(worker, "scenario-charge")) {
      target.energyScenarioCharge = 1;
      target.cooldownMs = Math.min(target.cooldownMs, 120);
    }
    if (this.hasEnergyWorkerSkill(worker, "emergency-bridge")) {
      target.energyBridgeUntil = now + 4_000;
    }
    this.applyEnergyWorkerDevelopment(worker, target, now);
  }

  private getEnergyRelaySource(tower: TowerModel, now = Date.now()) {
    if (tower.energyRelayUntil && tower.energyRelayUntil > now) {
      const source = this.towers.get(tower.energyRelaySourceId ?? "");
      if (source && source.hp > 0 && source.ownerId === tower.ownerId && source.id !== tower.id) {
        const gridSize = getMapGridSize(this.activeMap);
        if (Math.abs(source.x - tower.x) <= gridSize + 2 && Math.abs(source.y - tower.y) <= gridSize + 2) return source;
      }
    }
    if (tower.energyConduitUntil && tower.energyConduitUntil > now) {
      const source = this.towers.get(tower.energyConduitSourceId ?? "");
      if (source && source.hp > 0 && source.ownerId === tower.ownerId && source.definition.resourceProvider === "energy") return source;
    }
    return undefined;
  }

  private getTowerEnergySource(tower: TowerModel, now = Date.now()) {
    const source = this.getEnergyRelaySource(tower, now) ?? tower;
    if (source.definition.resourceProvider === "energy") this.applyCrystalReactorEmergency(source, now);
    return source;
  }

  private getTowerAvailableEnergy(tower: TowerModel, now = Date.now()) {
    const source = this.getTowerEnergySource(tower, now);
    return source.energy + (source === tower ? (tower.energyLocalReserve ?? 0) : 0);
  }

  private consumeTowerEnergy(tower: TowerModel, amount: number, now = Date.now()) {
    const source = this.getTowerEnergySource(tower, now);
    const fromSource = Math.min(source.energy, amount);
    source.energy = Math.max(0, source.energy - fromSource);
    const remainder = amount - fromSource;
    if (remainder > 0 && source === tower) tower.energyLocalReserve = Math.max(0, (tower.energyLocalReserve ?? 0) - remainder);
    if (source.energy <= 0 && source.energyDepletedAt <= 0) source.energyDepletedAt = now;
  }

  /**
   * Tamirci.
   *
   * Hattin altin harcamayan onarim yolu: hasarli yapiya yuruyup saniyede
   * sabit bir can yaziyor. Yikilan yapiyi diriltmiyor -- altinla onarim da
   * diriltmiyor, o bir yeniden insa isi ve iki yolun ayni seyi soylemesi
   * gerekiyor.
   *
   * Hedef kilitleniyor. Kilit olmasa "en hasarli yapi" her tick yeniden
   * secilirdi: tamirci bir duvari onardikca o duvar listede geri duser,
   * secim baskasina kayar ve tamirci iki yapi arasinda gidip gelirken
   * hicbirini bitiremezdi. Dusmanin kirma hedefini kilitlemesiyle ayni
   * sebep.
   */
  private updateRepairWorker(worker: DroneModel, seconds: number) {
    worker.repairing = undefined;
    if (this.hasWorkerSkill(worker, "repair-nexus-watch") && this.teamHealth <= MAX_TEAM_HEALTH * 0.4) {
      const nexus = this.activePaths[0]?.points.at(-1);
      if (nexus && this.moveLogisticsWorker(worker, nexus.x, nexus.y, seconds)) {
        this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + 2 * seconds);
        worker.repairing = true;
      }
      return;
    }
    const target = this.getRepairWorkerTarget(worker);
    if (!target) {
      // Bosta: merkeze don. Merkez yoksa oldugu yerde bekler -- iscinin
      // haritanin ortasinda durdugu yer bir karar degil, sadece son isinin
      // bittigi yer; merkez o keyfiligi oyuncunun karari haline getiriyor.
      const depot = this.getRepairDepot(worker);
      if (depot) {
        this.moveLogisticsWorker(worker, depot.x, depot.y, seconds);
      } else {
        worker.vx = 0;
        worker.vy = 0;
      }
      return;
    }
    worker.targetTowerId = target.id;
    if (!this.moveLogisticsWorker(worker, target.x, target.y, seconds)) {
      return;
    }
    // Eskitme yok: onarim yikilan yapiyi diriltmiyor, yani gecilebilirlik
    // degismiyor. Her tick eskitmek cikmaz sokak hafizasini surekli silerdi.
    const previousHp = target.hp;
    const wasCritical = previousHp / Math.max(1, target.maxHp) <= 0.2;
    target.hp = Math.min(target.maxHp, target.hp + this.getWorkerRepairPerSecond(worker) * seconds);
    worker.repairing = target.hp > previousHp || undefined;
    if (worker.repairing && this.hasWorkerSkill(worker, "repair-thermal-welder")) {
      target.heatLocked = false;
      target.temperature = Math.max(0, target.temperature - TOWER_COOLING_PER_SECOND * 0.3 * seconds);
    }
    if (!this.setupPhase) {
      this.getDefenseRow(target).repaired += target.hp - previousHp;
      // Tamirci unvani onarani sayiyor: iscinin sahibi, kulenin sahibi degil.
      this.runLedger.recordRepair(this.getPlayerSlot(worker.ownerId), target.hp - previousHp);
    }
    // Pencere burada aciliyor: Tamirci dokundugu surece acik kaliyor.
    target.repairedUntil = Date.now() + REPAIR_WINDOW_LINGER_MS;
    // Kalibrasyon Turu dokunmayla veriliyor ve dalga numarasiyla suruyor.
    if (this.towerHasUnlock(target, "repair:performanceCeiling")) {
      target.repairPerformanceWave = this.wave;
    }
    if (target.hp >= target.maxHp) {
      target.breachAnnounced = false;
      if (this.hasWorkerSkill(worker, "repair-fortification-seal")) {
        target.repairFortificationHp = 30;
        target.repairFortificationUntil = Date.now() + 10_000;
      }
      if (previousHp < target.maxHp) this.applyRepairWorkerDevelopment(worker, target, Date.now());
      worker.targetTowerId = "";
    }
    if (wasCritical && target.hp / Math.max(1, target.maxHp) > 0.2 && this.hasWorkerSkill(worker, "repair-breach-engineer")) {
      target.repairBreachUntil = Date.now() + 5_000;
    }
  }

  /**
   * Tamircinin onaracagi yapi.
   *
   * Kilitli hedef hala hasarliysa ona devam edilir. Yeni secimde olcut can
   * **orani**: oyuncunun kaygisi "hangisi dusmeye en yakin", eksik can
   * miktari degil. Esitlik mesafeyle bozuluyor ki secim belirlenimli olsun.
   *
   * Merkez varsa once onun cemberine bakiliyor. Cember bir **oncelik**,
   * bir sinir degil: icerisi temizse isci haritanin geri kalanina bakar.
   * Sinir olsaydi merkezi yanlis koseye kuran oyuncunun iscisi bosa alinmis
   * olurdu; oncelik olunca merkez "onarim nereye yogunlassin" sorusunun
   * cevabi oluyor.
   */
  private getRepairWorkerTarget(worker: DroneModel) {
    const locked = worker.targetTowerId ? this.towers.get(worker.targetTowerId) : undefined;
    if (locked && locked.ownerId === worker.ownerId && locked.hp > 0 && locked.hp < locked.maxHp) {
      return locked;
    }
    const depot = this.getRepairDepot(worker);
    return (depot && this.findWorstStructure(worker, depot)) ?? this.findWorstStructure(worker);
  }

  /**
   * En kotu durumdaki onarilabilir yapi.
   *
   * `depot` verilirse yalnizca onun cemberindekiler sayilir ve mesafe de
   * merkezden olculur -- cemberin icinde "yakin" demek iscinin o anda
   * nerede durdugu degil, merkeze ne kadar yakin oldugu demek.
   */
  private findWorstStructure(worker: DroneModel, depot?: TowerModel) {
    const origin = depot ?? worker;
    const rangeSq = depot ? this.getTowerRange(depot) ** 2 : Number.POSITIVE_INFINITY;
    let best: TowerModel | undefined;
    let bestRatio = Number.POSITIVE_INFINITY;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const tower of this.towers.values()) {
      if (tower.ownerId !== worker.ownerId || tower.hp <= 0 || tower.hp >= tower.maxHp) continue;
      const distance = distanceSq(origin.x, origin.y, tower.x, tower.y);
      if (distance > rangeSq) continue;
      const ratio = tower.hp / Math.max(1, tower.maxHp);
      if (ratio > bestRatio || (ratio === bestRatio && distance >= bestDistanceSq)) continue;
      best = tower;
      bestRatio = ratio;
      bestDistanceSq = distance;
    }
    return best;
  }

  /**
   * Iscinin bagli oldugu Tamir Merkezi: ayaktakilerin en yakini.
   *
   * Yikilan merkez us sayilmaz; iscinin enkazda beklemesinin bir anlami yok.
   */
  private getRepairDepot(worker: DroneModel) {
    let best: TowerModel | undefined;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const tower of this.towers.values()) {
      if (tower.ownerId !== worker.ownerId || tower.hp <= 0) continue;
      if (!isRepairDepotDefinition(tower.definition)) continue;
      const distance = distanceSq(worker.x, worker.y, tower.x, tower.y);
      if (distance >= bestDistanceSq) continue;
      best = tower;
      bestDistanceSq = distance;
    }
    return best;
  }

  /**
   * Tamircinin saniyelik onarimi; gelismis kademe uc kati.
   *
   * Carpan iscinin canindaki gibi yalnizca kuresel listeden okunuyor.
   * Tamircinin "hizmet ettigi bina" her an onardigi kule oldugu icin
   * binadan okumak, hizin hedef degistikce ziplamasi olurdu.
   */
  private getWorkerRepairPerSecond(worker: DroneModel) {
    const runModifiers = worker.ownerId ? this.state.players.get(worker.ownerId)?.runModifiers ?? [] : [];
    return WORKER_REPAIR_PER_SECOND
      * (worker.advanced ? ADVANCED_WORKER_MULTIPLIER : 1)
      * getModifierMultiplier(runModifiers, "workerRepairRate");
  }

  /**
   * Iscinin can tavani.
   *
   * Carpan yalnizca oyuncunun **kuresel** listesinden okunuyor, iscinin
   * hizmet ettigi binadan degil. Bir iscinin dayanikliligi kendisine ait;
   * binadan okunsaydi tavan isci her hedef degistirdiginde ziplardi ve
   * kaynak dugumune giden isci yolda birden dayaniksizlasirdi.
   */
  private getWorkerMaxHp(worker: DroneModel) {
    return this.getWorkerBaseMaxHp(worker.advanced, worker.ownerId);
  }

  private getWorkerBaseMaxHp(advanced?: boolean, ownerId?: string) {
    const runModifiers = ownerId ? this.state.players.get(ownerId)?.runModifiers ?? [] : [];
    return Math.max(1, WORKER_MAX_HP
      * (advanced ? ADVANCED_WORKER_MULTIPLIER : 1)
      * getModifierMultiplier(runModifiers, "workerHealth"));
  }

  /** Iscinin tek seferde tasidigi yuk; kart ve esyalarla buyur. */
  private getWorkerCapacity(worker: DroneModel) {
    const base = worker.capacity ?? LOGISTICS_WORKER_CAPACITY;
    return Math.max(1, base * getModifierMultiplier(this.getWorkerModifiers(worker), "workerCapacity"));
  }

  /**
   * Iscinin toplama hizi carpani.
   *
   * Kart ve esya carpani her isci icin ayni; gelismis isci onun uzerine kendi
   * uc katini koyuyor. Ikisi carpiliyor, toplanmiyor: normal isciyi
   * hizlandiran bir kart gelismis isciyi de ayni oranda hizlandirmali.
   */
  private getWorkerGatherSpeedMultiplier(worker: DroneModel) {
    return getModifierMultiplier(this.getWorkerModifiers(worker), "workerGatherSpeed")
      * (worker.advanced ? ADVANCED_WORKER_MULTIPLIER : 1);
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
  /**
   * Isci bu yapinin karesine girebilir mi.
   *
   * Lojistik binalari -- cephane, enerji ve Tamir Merkezi -- isciye acik.
   * Isci onlarin **icinde** calisiyor; disarida durup teslim etmesi, hattin
   * kaynaktan dogrudan kuleye gittigi izlenimini veriyordu, cunku binaya hic
   * dokunmuyordu. Bir de o an yuk aldigi bina: hangi yapi olursa olsun,
   * yukleme yaptigi yere girebilir.
   *
   * Sevkiyat iscisi yalnizca kendi teslimat hedefine girer; diger savas
   * kulelerini kestirme yol olarak kullanamaz. Tamirci disaridan calisir.
   */
  private canWorkerEnterStructure(worker: DroneModel | undefined, tower: TowerModel) {
    if (tower.definition.resourceProvider || isRepairDepotDefinition(tower.definition)) return true;
    if (!worker || worker.ownerId !== tower.ownerId || worker.targetTowerId !== tower.id) return false;
    return worker.logisticsPhase === "pickup"
      || (worker.logisticsPhase === "deliver" && (worker.mode === "energyTransport" || worker.mode === "ammoTransport"));
  }

  private isCellWalkable(from: { col: number; row: number }, col: number, row: number) {
    if (!this.isCellPassable(from, col, row)) {
      return false;
    }
    // Cikmaz sokaktan **cikmak** her zaman serbest: kural iceri girmeyi
    // yasakliyor, iceride kalmis bir dusmani hapsetmeyi degil. Aksi halde
    // sokak haritalanmadan once iceri girmis dusman, yuruyerek cikabilecekken
    // duvar kirmaya baslardi.
    if (this.deadEndCells.has(`${from.col}:${from.row}`)) {
      return true;
    }
    return !this.isDeadEnd(col, row);
  }

  /** Yapi ve harita siniri acisindan gecilebilirlik; cikmaz sokak hafizasi haric. */
  private isCellPassable(from: { col: number; row: number }, col: number, row: number) {
    if (col < 0 || col >= this.activeMap.cols || row < 0 || row >= this.activeMap.rows) {
      return false;
    }
    const standing = this.getTowerCellIndex().get(`${col}:${row}`);
    if (standing && standing.hp > 0) {
      return false;
    }
    return !this.getBlockingTowerBetween(from, { col, row });
  }

  /**
   * Bu hucre cikmaz sokak mi -- ve oyleyse hafizaya yaz.
   *
   * Olcut: dort yanindan ucu kapali, yani icinden **gecilemiyor**. Boyle bir
   * hucreye giren dusman ayni yandan geri cikmak zorunda; oraya gitmenin
   * hicbir karsiligi yok.
   *
   * Kapalilik sayilirken hafizadaki oteki cikmaz sokaklar da kapali sayiliyor:
   * yigilma buradan geliyor. Yigilmanin gecerli bir yolu kapatmasi mumkun
   * degil, cunku her adimda yalnizca **icinden gecilemeyen** bir hucre
   * eleniyor -- eleme, gecen hicbir yolu kisaltmaz.
   *
   * Tek istisna cikis satiri: orasi hedefin kendisi. Cikisa dar bir koridorun
   * ucundan variliyorsa o hucrenin uc yani kapalidir ve elenmesi oyunu
   * kazanilmaz kilardi.
   */
  private isDeadEnd(col: number, row: number) {
    const key = `${col}:${row}`;
    if (this.deadEndCells.has(key)) {
      return true;
    }
    if (row === this.activeMap.rows - 1) {
      return false;
    }
    const cell = { col, row };
    let open = 0;
    for (const neighbor of this.getGridNeighbors(col, row)) {
      if (!this.isCellPassable(cell, neighbor.col, neighbor.row)) continue;
      if (this.deadEndCells.has(`${neighbor.col}:${neighbor.row}`)) continue;
      open += 1;
      if (open > 1) return false;
    }
    // Gorulen sokak haber verilir: bundan sonra butun dusmanlar biliyor.
    this.deadEndCells.add(key);
    return true;
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
    const hasRoleField = Boolean(message && Object.prototype.hasOwnProperty.call(message, "role"));
    if (!player || (!hasRoleField && message?.advanced === undefined) || (message?.role !== undefined && !isHirableWorkerRole(message.role))) {
      return;
    }
    const role = isHirableWorkerRole(message?.role) ? message.role : undefined;
    // Secim penceresi acikken ikinci isci alinmasin; aksi halde iki is
    // atamasindan yalnizca biri gorunur ve digeri baglanti yenilenene kadar
    // sessizce bekler. Pencere secimsiz kapandiysa istek sessizce dusmesin:
    // bekleyen iscinin secimi yeniden acilir, altin harcanmaz.
    const pending = role ? undefined : player.hiredWorkers.find((worker) => !worker.role);
    if (pending) {
      if (pending.id) this.sendWorkerSpecializationChoice(client, pending.id);
      return;
    }
    const advanced = message.advanced === true;
    const cost = getWorkerHireCostWithModifiers(
      player.hiredWorkers.length,
      advanced,
      this.getWorkerHireCostMultiplier(player)
    );
    if (player.gold < cost) {
      return;
    }

    player.gold -= cost;
    player.goldSpent += cost;
    const workerId = `worker-${this.nextHiredWorkerId++}`;
    // Kimlik ve secimler teldeki eski snapshot testlerini sisirmesin diye
    // enumerable degil; sunucu bunlari kalici kayit olarak yine tutuyor.
    const hiredWorker: HiredWorker = role ? { role, advanced: advanced || undefined } : { advanced: advanced || undefined };
    Object.defineProperties(hiredWorker, {
      id: { value: workerId, writable: true, configurable: true, enumerable: false },
      skillIds: { value: [], writable: true, configurable: true, enumerable: false },
      legacySuffix: { value: Boolean(role && role !== "energyTransport"), writable: true, configurable: true, enumerable: false }
    });
    player.hiredWorkers.push(hiredWorker);
    // Isci hemen sahaya ciksin: bir sonraki dalgayi beklemek alimin etkisini
    // oyuncunun goremedigi bir yere ertelerdi.
    this.ensureLogisticsWorkers();
    client.send("worker:hired", { role, advanced, cost });
    if (role) this.sendWorkerSkillChoice(client, workerId, 0);
    else this.sendWorkerSpecializationChoice(client, workerId);
  }

  private sendWorkerSpecializationChoice(client: Client, workerId: string) {
    client.send("worker:specialization-choice", { workerId, options: WORKER_SPECIALIZATION_CHOICES });
  }

  private sendWorkerSkillChoice(client: Client, workerId: string, tier: number) {
    const player = this.state.players.get(client.sessionId);
    const hired = player?.hiredWorkers.find((worker) => worker.id === workerId);
    const pair = hired?.role ? getWorkerSkillTiers(hired.role)[tier] : undefined;
    if (!hired?.role || !pair) {
      client.send("worker:skill-complete", { workerId, role: hired?.role });
      return;
    }
    client.send("worker:skill-choice", { workerId, tier, role: hired.role, options: pair, legacy: true });
  }

  private getWorkerDevelopmentState(player: Player) {
    return {
      experience: Math.floor(player.experience),
      selectedSkillIds: [...(player.workerSkillIds ?? [])],
      costs: [...WORKER_DEVELOPMENT_XP_COSTS],
      trees: HIRABLE_WORKER_ROLES.map((role) => ({
        role,
        cells: WORKER_DEVELOPMENT_CELLS[role],
        selectedSkillIds: (player.workerSkillIds ?? []).filter((skill) => isWorkerSkillForRole(role, skill))
      }))
    };
  }

  private sendWorkerDevelopmentState(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) client.send("worker:development-state", this.getWorkerDevelopmentState(player));
  }

  private unlockWorkerDevelopment(client: Client, message: WorkerDevelopmentMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !isHirableWorkerRole(message?.role) || !message.skillId) return;
    if (!isWorkerSkillForRole(message.role, message.skillId) || (player.workerSkillIds ?? []).includes(message.skillId)) return;
    const cells = WORKER_DEVELOPMENT_CELLS[message.role];
    const cellIndex = cells.findIndex((cell) => cell.options?.some((skill) => skill.id === message.skillId));
    const option = cellIndex < 0 ? undefined : cells[cellIndex].options?.find((skill) => skill.id === message.skillId);
    const owned = (player.workerSkillIds ?? []).filter((skill) => isWorkerSkillForRole(message.role!, skill));
    // Hucreler sirayla, her hucreden tek secenek: sahip olunan secim sayisi
    // hucrenin sirasina esit olmali. Derinlestirme ustundeki yonu istiyor.
    if (!option || owned.length !== cellIndex) return;
    if (option.requires && !owned.includes(option.requires)) return;
    const cost = WORKER_DEVELOPMENT_XP_COSTS[cellIndex];
    if (cost === undefined || player.experience < cost) return;
    player.experience -= cost;
    (player.workerSkillIds ??= []).push(message.skillId);
    // Tum ayni rol hucreleri bunu kullanir; drone kopyalari yalnizca eski
    // per-worker API ile tutulan secimleri gostermeye devam eder.
    client.send("worker:development-unlocked", { role: message.role, skillId: message.skillId, cost });
    this.sendWorkerDevelopmentState(client);
    this.broadcast("lobby:state", this.getLobbyState());
  }

  private chooseWorkerSpecialization(client: Client, message: ChooseWorkerSpecializationMessage) {
    const player = this.state.players.get(client.sessionId);
    const hired = player?.hiredWorkers.find((worker) => worker.id === message.workerId);
    if (!player || !hired || hired.role || !isHirableWorkerRole(message.role)) return;
    hired.role = message.role;
    this.ensureLogisticsWorkers();
    // Eski istemci/test protokolu icin secim olayi gonderilebilir; yeni UI bu
    // legacy isaretli olayi gostermez. Gelisim agaci secimi ayri ve globaldir.
    this.sendWorkerSkillChoice(client, hired.id!, 0);
  }

  private chooseWorkerSkill(client: Client, message: ChooseWorkerSkillMessage) {
    const player = this.state.players.get(client.sessionId);
    const hired = player?.hiredWorkers.find((worker) => worker.id === message.workerId);
    if (!player || !hired || !hired.role || !message.skillId || !isWorkerSkillForRole(hired.role, message.skillId)) return;
    const skills = hired.skillIds ?? (hired.skillIds = []);
    const tier = skills.length;
    const pair = getWorkerSkillTiers(hired.role)[tier];
    if (!pair?.some((skill) => skill.id === message.skillId)) return;
    if (skills.includes(message.skillId)) return;
    skills.push(message.skillId);
    this.sendWorkerSkillChoice(client, hired.id!, tier + 1);
    this.drones.forEach((drone) => {
      if (drone.ownerId === client.sessionId && (drone.hiredWorkerId === hired.id || drone.id.endsWith(`:${hired.id}`))) drone.skillIds = skills.filter(isWorkerSkillId);
    });
  }

  /** Isci alim bedelinin kart ve esya carpani. */
  private getWorkerHireCostMultiplier(player: Player) {
    return getModifierMultiplier(player.runModifiers ?? [], "workerHireCost");
  }

  /**
   * Duvara kapi acar ya da kapatir.
   *
   * Kapi yalnizca duvarda. Kare kaplayan bir yapida "gecis" diye bir sey
   * yok -- kule karenin kendisi, duvar iki kare arasindaki cizgi. Kapi o
   * cizgide bir aciklik, yani ancak cizgisi olan yapida anlamli.
   *
   * Bedeli yok. Duvarin isciyi de tutmasi zaten oyuncunun odedigi bedel;
   * kapi o bedeli kaldirmiyor, nereye kaldirilacagina karar verdiriyor.
   */
  private getDefenseRow(tower: TowerModel) {
    if (this.defenseWave !== this.wave) {
      this.defenseRows.clear();
      this.defenseWave = this.wave;
      this.insightElapsed = 0;
    }
    let row = this.defenseRows.get(tower.id);
    if (!row) {
      row = createDefenseRow(tower.id, tower.ownerId, tower.definition.name, tower.definition.id);
      this.defenseRows.set(tower.id, row);
    }
    return row;
  }

  private getTowerActivity(tower: TowerModel): TowerActivity {
    const now = Date.now();
    if (tower.hp <= 0 || tower.standby || tower.performance <= 0 || tower.wakeReadyAt > now
      || tower.offlineUntil > now) return "disabled";
    if (tower.heatLocked || tower.overheatMs > 0) return "heat";
    if (tower.definition.resourceProvider || !countsAsTower(tower.definition)) return "support";
    if (tower.definition.id === "warrior-2") return "support";
    const range = this.getTowerRange(tower);
    const minimum = this.getTowerMinimumRange(tower);
    const hasTarget = this.getEnemiesNear(tower.x, tower.y, range).some((enemy) => {
      const distance = distanceSq(tower.x, tower.y, enemy.x, enemy.y);
      return enemy.hp > 0 && this.canTowerTargetEnemy(tower, enemy) && distance <= range * range && distance >= minimum * minimum;
    });
    if (!hasTarget) return "target";
    if (!this.isTowerOnBackupLine(tower, now)) {
      if (getTowerEnergyState(tower.energy, tower.energyDepletedAt, now) !== "powered"
        || tower.energy < this.getTowerEnergyCost(tower)) return "energy";
      if (tower.ammo < this.getTowerAmmoCost(tower)) return "ammo";
    }
    return this.getActiveTowerAuras(tower).length > 0 ? "support" : "cycle";
  }

  private updateDefenseInsights(seconds: number) {
    if (this.setupPhase || this.waveClearedAt !== 0) return;
    // Four samples/second, accumulated on the server; no per-hit telemetry messages.
    if (this.defenseWave !== this.wave) {
      this.defenseRows.clear();
      this.defenseWave = this.wave;
      this.insightElapsed = 0;
    }
    this.insightElapsed += seconds;
    if (this.insightElapsed < 0.25) return;
    for (const tower of this.towers.values()) {
      this.getDefenseRow(tower).seconds[this.getTowerActivity(tower)] += this.insightElapsed;
    }
    this.insightElapsed = 0;
  }

  private finishDefenseSummary() {
    if (this.defenseWave !== this.wave) return;
    for (const ownerId of this.state.players.keys()) {
      const rows = [...this.defenseRows.values()].filter((row) => row.ownerId === ownerId)
        .sort((left, right) => right.damage - left.damage)
        .map((row) => ({ ...row, damage: Math.round(row.damage), repaired: Math.round(row.repaired), markAssistDamage: Math.round(row.markAssistDamage), auraEnemySeconds: Math.round(row.auraEnemySeconds * 10) / 10,
          seconds: Object.fromEntries(Object.entries(row.seconds).map(([key, value]) => [key, Math.round(value * 10) / 10])) as DefenseRow["seconds"] }));
      const summary: DefenseSummary = { wave: this.wave, rows };
      // Karar payi: yalnizca bu dalganin ve yalnizca bu sahibin kulelerinin.
      const shares = this.synergyShareWave === this.wave ? this.synergyShares.get(ownerId) : undefined;
      const isolationShare = Math.round(shares?.isolation ?? 0);
      if (isolationShare > 0) summary.isolationShare = isolationShare;
      const formationShare = Math.round(shares?.formation ?? 0);
      if (formationShare > 0) summary.formationShare = formationShare;
      this.lastDefenseSummary.set(ownerId, summary);
      this.clients.find((client) => client.sessionId === ownerId)?.send("defense:summary", summary);
    }
  }

  private getTowerInsight(tower: TowerModel) {
    const now = Date.now();
    const cached = this.towerInsightCache.get(tower);
    if (cached && now - cached.at < TOWER_INSIGHT_REFRESH_MS) return cached.value;
    const reasons: string[] = [];
    if (this.acceptsTowerOperation(tower) && !this.setupPhase) reasons.push(activityLabels[this.getTowerActivity(tower)]);
    reasons.push(this.getTowerStatus(tower));
    if (this.acceptsTowerOperation(tower) || tower.definition.resourceProvider === "ammunition") {
      if (tower.energy < tower.maxEnergy) reasons.push(this.getDeliveryReason(tower, "energy"));
      if (tower.ammo < tower.maxAmmo && !tower.definition.resourceProvider) reasons.push(this.getDeliveryReason(tower, "ammo"));
    }
    if (receivesAtakanIsolationBonus(tower)) {
      const blockers = findIsolationBlockers(tower, this.towers.values(), this.activeMap);
      reasons.push(blockers.length ? `Yalnızlık kapalı: ${blockers.map((other) => other.definition.name).join(", ")}`
        : `Yalnızlık açık: hasar ×${ATAKAN_ISOLATION_MULTIPLIER}`);
    }
    if (tower.formationReason) reasons.push(tower.formationReason);
    if (this.defenseWave === this.wave) {
      const row = this.defenseRows.get(tower.id);
      if (row) reasons.push(`Bu dalga: döngü ${Math.floor(row.seconds.cycle)} sn · hedef ${Math.floor(row.seconds.target)} sn · mühimmat ${Math.floor(row.seconds.ammo)} sn · enerji ${Math.floor(row.seconds.energy)} sn · soğuma ${Math.floor(row.seconds.heat)} sn`);
    }
    const value = reasons.filter(Boolean).join(" | ");
    // Ilk kayitta evre kaydiriliyor (bkz. `towerInsightPhaseCursor`): ilk
    // tazeleme biraz erken geliyor, sonrakiler yine saniyede bir.
    const phase = cached ? 0 : (this.towerInsightPhaseCursor++ * TOWER_INSIGHT_PHASE_STEP_MS) % TOWER_INSIGHT_REFRESH_MS;
    this.towerInsightCache.set(tower, { at: now - phase, value });
    return value;
  }

  private getDeliveryReason(tower: TowerModel, resource: "ammo" | "energy") {
    const label = resource === "ammo" ? "Mühimmat" : "Enerji";
    if (resource === "ammo" && !tower.ammoLogisticsEnabled) return `${label}: sevkiyat kapalı`;
    const workers = [...this.drones.values()].filter((worker) => worker.ownerId === tower.ownerId && worker.mode === (resource === "ammo" ? "ammoTransport" : "energyTransport"));
    const incoming = workers.filter((worker) => worker.logisticsPhase === "deliver" && worker.targetTowerId === tower.id && (worker.cargo ?? 0) > 0);
    const reachable = workers.some((worker) => this.getWorkerApproachPoint({ ...worker, targetTowerId: tower.id, logisticsPhase: "deliver", routeStep: undefined }, tower.x, tower.y));
    if (workers.length && !reachable) return `${label}: yol kapalı`;
    if (incoming.length) return `${label}: ${incoming.reduce((sum, worker) => sum + (worker.cargo ?? 0), 0).toFixed(1)} yolda`;
    const source = [...this.towers.values()].find((entry) => entry.ownerId === tower.ownerId && entry.hp > 0 && entry.definition.resourceProvider === (resource === "ammo" ? "ammunition" : "energy"));
    if (!source) return `${label}: kaynak binası yok`;
    if (source[resource] <= 0) return `${label}: kaynak deposu boş`;
    if (workers.length && !workers.some((worker) => this.getWorkerApproachPoint({ ...worker, logisticsPhase: "pickup", routeStep: undefined }, source.x, source.y))) return `${label}: kaynak yolu kapalı`;
    return `${label}: ${workers.length ? "taşıma sırası bekliyor" : "taşıyıcı yok"}`;
  }

  private setLogisticsPriority(client: Client, message: { towerId?: string; priority?: LogisticsPriority } | undefined) {
    const tower = message?.towerId ? this.towers.get(message.towerId) : undefined;
    if (!this.gameStarted || !tower || tower.ownerId !== client.sessionId
      || !["critical", "normal", "low"].includes(message?.priority ?? "")) return;
    tower.logisticsPriority = message!.priority;
  }

  private selectDeliveryTarget(worker: DroneModel, resource: "ammo" | "energy") {
    for (const key of this.deliveryWaitingSince.keys()) {
      if (!key.startsWith(`${resource}:`)) continue;
      const tower = this.towers.get(key.slice(resource.length + 1));
      if (!tower || tower[resource] >= (resource === "ammo" ? tower.maxAmmo : tower.maxEnergy)) this.deliveryWaitingSince.delete(key);
    }
    const candidates = [...this.towers.values()].filter((tower) => tower.ownerId === worker.ownerId && tower.hp > 0
      && (resource === "energy" ? tower.definition.resourceProvider !== "energy" && tower.energy < tower.maxEnergy
        : this.acceptsTowerOperation(tower) && tower.ammoLogisticsEnabled && tower.ammo < tower.maxAmmo
          && (!(worker.cargo ?? 0) || !worker.cargoAmmoType || worker.cargoAmmoType === tower.ammoType)));
    const ranked = candidates.map((tower) => {
      const max = resource === "ammo" ? tower.maxAmmo : tower.maxEnergy;
      const current = tower[resource];
      const reserved = this.getReservedCargo(worker, tower);
      const key = `${resource}:${tower.id}`;
      if (!this.deliveryWaitingSince.has(key)) this.deliveryWaitingSince.set(key, this.logisticsClock);
      return { tower, remaining: max - current - reserved, score: deliveryScore(tower.logisticsPriority ?? "normal",
        (current + reserved) / Math.max(1, max), this.logisticsClock - this.deliveryWaitingSince.get(key)!,
        Math.hypot(worker.x - tower.x, worker.y - tower.y)) };
    }).filter((entry) => entry.remaining > 0.01).sort((a, b) => b.score - a.score || a.tower.id.localeCompare(b.tower.id));
    for (const { tower } of ranked) {
      const probe = { ...worker, targetTowerId: tower.id, logisticsPhase: "deliver" as const, routeStep: undefined };
      if (this.getWorkerApproachPoint(probe, tower.x, tower.y)) return tower;
    }
    return undefined;
  }

  private getReservedCargo(worker: DroneModel, tower: TowerModel) {
    return [...this.drones.values()].filter((other) => other.id !== worker.id && other.ownerId === worker.ownerId
      && other.mode === worker.mode && other.logisticsPhase === "deliver" && other.targetTowerId === tower.id)
      .reduce((sum, other) => sum + (other.cargo ?? 0), 0);
  }

  private sendTowerPreview(client: Client, message: { requestId?: string; towerId?: string; cardId?: string; itemId?: string } | undefined) {
    if (!message || typeof message.requestId !== "string" || message.requestId.length > 80) return;
    // Ret metni Turkce; yaninda anahtari (`errorKey`) ve gerekirse parametreleri.
    const reject = (errorKey: ServerTextKey | typeof PREVIEW_EQUIP_REJECTED_KEY, error: string = SERVER_TEXT[errorKey as ServerTextKey], errorParams?: Record<string, string>) =>
      client.send("tower:preview", { requestId: message.requestId, error, errorKey, ...(errorParams ? { errorParams } : {}) });
    const now = Date.now();
    if (now - (this.previewRequestTimes.get(client.sessionId) ?? 0) < 40) return reject("preview.tooSoon");
    this.previewRequestTimes.set(client.sessionId, now);
    const player = this.state.players.get(client.sessionId);
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    const card = this.pendingCardChoices.get(client.sessionId)?.find((entry) => entry.id === message.cardId && entry.scope.kind === "targeted");
    const item = message.itemId ? getShopItem(message.itemId) : undefined;
    if (!player || !tower || tower.ownerId !== client.sessionId || (!!message.cardId === !!message.itemId)) return reject("preview.invalidTarget");
    if (message.cardId && (!card || !canTowerHoldTargetedCard(tower.definition) || !canAcceptTargetedCard(tower.targetedCardIds))) return reject("preview.cardRejected");
    if (message.itemId && (!item || !player.inventoryItemIds.includes(item.id))) return reject("preview.itemRejected");
    if (item) {
      // Takmayla ayni ret metni; ek ("envanterde kaldi") onizlemede yanlis olurdu.
      const check = canEquipShopItem(item, tower.definition, tower.equippedShopItemIds);
      if (!check.ok) {
        const text = getInventoryEquipRejectedCue({ itemId: item.id, reason: check.reason }, { creative: true })?.text;
        return text ? reject(PREVIEW_EQUIP_REJECTED_KEY, text, { itemId: item.id, reason: check.reason }) : reject("preview.itemRejected");
      }
    }
    const change = card ?? item;
    if (!change) return reject("preview.optionGone");
    const after: TowerModel = { ...tower, grantCache: undefined, runModifiers: [...tower.runModifiers, ...change.effects],
      targetedCardIds: card ? [...tower.targetedCardIds, card.id] : [...tower.targetedCardIds],
      equippedShopItemIds: item ? [...tower.equippedShopItemIds, item.id] : [...tower.equippedShopItemIds] };
    after.maxHp *= this.getTowerHealthRescaleRatio(tower, change.effects);
    // Etiketin anahtari `preview.stat.<anahtar>`; Turkce metni `SERVER_TEXT`te.
    type PreviewStat = [key: string, get: (value: TowerModel) => number];
    // Cifte Namlu: bedel tetikleme basina, yani mermi sayisiyla carpiliyor.
    // Satir yalnizca iki mermiden birinde gorunur; tek mermili kulede gurultu.
    const shots = (value: TowerModel) => this.getTowerShotsPerTrigger(value);
    const shotStats: PreviewStat[] = shots(tower) !== 1 || shots(after) !== 1 ? [["shots", shots]] : [];
    // Surekli tetikleme ustundeki aralik, isi ve soguma satirlarinin sonucu.
    // Atis hizi ile sogutma secenegini ancak bu satir durust karsilastiriyor:
    // isi baglayan kulede atis hizi karti burada kipirdamaz, sogutma karti
    // buyur. Birim "tetikleme", ustteki "/ tetikleme" satirlariyla ayni:
    // "atis" deseydi Cifte Namlu surekli atisi yariya indiriyor gorunurdu.
    const sustainedStats: PreviewStat[] = this.getTowerHeatBudget(tower)
      ? [["sustained", (value) => this.getTowerHeatBudget(value)?.sustained ?? 0]]
      : [];
    const stats: PreviewStat[] = [
      // Vurus aninda eklenen kule bonuslari da sayiya dahil; yoksa Kan
      // Bankasi gibi her vurusa +%20 veren bir esya hicbir sey degistirmiyor
      // gorunuyordu.
      ["damage", (value) => this.getTowerDamage(value) * (1 + this.getTowerHitDamageAdd(value, now))],
      ["interval", (value) => this.getTowerEffectInterval(value) / 1000],
      ["range", (value) => this.getTowerRange(value)], ["maxHp", (value) => value.maxHp],
      ...shotStats,
      ["ammo", (value) => this.getTowerAmmoCost(value) * shots(value)],
      ["energy", (value) => this.getTowerEnergyCost(value) * shots(value)],
      ["heat", (value) => this.getTowerShotHeat(value) * shots(value)],
      ["cooling", (value) => this.getTowerCoolingPerSecond(value)],
      ...sustainedStats
    ];
    const values = stats.map(([key, get]) => ({ key: `preview.stat.${key}`, label: SERVER_TEXT[`preview.stat.${key}` as ServerTextKey], before: get(tower).toFixed(2), after: get(after).toFixed(2) }));
    const lines = values.map(({ label, before, after: next }) => `${label}: ${before} → ${next}`);
    // Istemci degisen satiri one cikarir; ayni kalanlar arasinda kaybolmasin.
    const changed = values.map(({ before, after: next }) => before !== next);
    client.send("tower:preview", { requestId: message.requestId, title: `${change.name} · ${tower.definition.name}`,
      description: `${change.description} ${SERVER_TEXT["preview.disclaimer"]}`, lines, changed,
      // Istemci baslik, aciklama ve etiketleri kendi dilinde bunlardan kuruyor.
      lineKeys: values.map(({ key }) => key), ...(card ? { cardId: card.id } : { itemId: change.id }), definitionId: tower.definition.id });
  }

  /**
   * Kule panelinin istegi: secili kulenin blogu, yalnizca isteyene.
   *
   * Takim arkadasinin kulesi de okunabiliyor -- co-op'ta herkes ayni hatti
   * savunuyor -- ama blok salt okunur isaretiyle gidiyor; kuleyi degistiren
   * her komut sahipligi zaten kendisi soruyor. Odada oyuncusu olmayan oturum
   * ve var olmayan kule cevapsiz kaliyor. Hiz siniri `MESSAGE_RULES`ta.
   */
  private sendTowerStats(client: Client, message: { towerId?: string; q?: number } | undefined) {
    if (!this.state.players.has(client.sessionId)) return;
    const tower = typeof message?.towerId === "string" ? this.towers.get(message.towerId) : undefined;
    if (!tower) return;
    const q = typeof message?.q === "number" && Number.isInteger(message.q) && message.q >= 0 && message.q <= 1e9 ? message.q : undefined;
    client.send("tower:stats", this.getTowerStatsBlock(tower, client.sessionId, q));
  }

  /**
   * Kule panelinin blogu (`TowerStatsWire`).
   *
   * Her sayi savasin okudugu fonksiyondan geliyor: hasar `getTowerDamageBreakdown`
   * ve vurus paylari (onizlemeyle ayni), ritim `getTowerEffectInterval`, donus
   * hizi ve ates konisi `aimTowerAt`'in formulu, mermi hizi
   * `spawnTowerProjectile`'in, kritik `getTowerCritChance` ve `damageEnemy`'nin
   * carpani. Panel kendi kural yazmiyor; yazsaydi ilk denge turunda yalan
   * soylemeye baslardi. Hedefe bagli olanlar (hava, kalkan, donmus hedef)
   * hedef olmadan bilinmiyor; onlar ayri bir listede kosul olarak gidiyor.
   */
  private getTowerStatsBlock(tower: TowerModel, viewerId: string, requestId?: number): TowerStatsWire {
    const now = Date.now();
    const definition = tower.definition;
    const engine = this.getTowerEngine(tower);
    const modifiers = this.getTowerRunModifiers(tower);
    const sourcesOf = (stat: ModifierStat) => groupTowerStatSources(modifiers.filter((modifier) => modifier.stat === stat));
    const block: TowerStatsWire = { id: tower.id, c: roundTowerStat(this.scaleWorldDistance(TOWER_GRID_SIZE)) };
    if (requestId !== undefined) block.q = requestId;
    if (tower.ownerId !== viewerId) block.ro = 1;
    if ((tower.killCount ?? 0) > 0) block.k = tower.killCount;
    if (tower.equippedShopItemIds.length > 0) block.it = [...tower.equippedShopItemIds];
    if (tower.targetedCardIds.length > 0) block.tc = [...tower.targetedCardIds];
    // Kaynak binasi ve ates etmeyen yapi (duvar, Tamir Merkezi): savas sayisi yok.
    if (definition.resourceProvider || !isOperationalTower(definition)) return block;

    const executor = definition.engine?.attack.executor;
    const ballistic = !executor || executor === "ballistic";
    if (executor !== "orbit") block.tm = tower.targetingMode;
    if (definition.damageType) block.dt = definition.damageType;
    if (definition.hitType) block.ht = definition.hitType;

    // Menzil. Sunucu ve asiri yuklenmis Debug Lazer haritanin kosegeni: tek sayi degil.
    const range = this.getTowerRange(tower);
    if (definition.id === "warrior-2" || (definition.id === "warrior-5" && tower.debugOverdriveUntil > now)) {
      block.rg = 1;
    } else {
      block.r = closeTowerStatValue(range, this.scaleWorldDistance(getTowerBaseLevelRange(definition, tower.level)), sourcesOf("range"),
        [["character:atakan-passive", this.getAtakanPassiveMultiplier(tower)]]);
    }

    // Hasar: tabani seviyeli tanim, paylari dokumun kendisi. Vurus paylari
    // (Kan Bankasi, rolanti, onarim) havuzun ustune carpiyor; dokumde ayri kalem.
    const breakdown = this.getTowerDamageBreakdown(tower);
    const hitAdd = this.getTowerHitDamageAdd(tower, now);
    const resolvedDamage = resolveModifierBreakdown(breakdown);
    const damage = resolvedDamage * (1 + hitAdd);
    const dealsDamage = towerDealsDamage(definition) && damage > 0;
    if (dealsDamage) {
      // Kart ve esya paylari ham yaziliyor, atis hizi satiriyla ayni dilde:
      // dokum onlari karakter/motor havuzuyla carpiyor ve
      // `b * (1 + L + havuz * C) = b * havuz * (1 + C)`. Havuz kendi
      // kalemleriyle carpan olarak duruyor; "-%10" yazan kart "-%15" gorunmuyor.
      const runDamageCount = modifiers.filter((modifier) => modifier.stat === "damage").length;
      const poolMods = breakdown.mods.slice(0, breakdown.mods.length - runDamageCount);
      const pool = new Map<string, number>();
      let current = 1;
      for (const modifier of poolMods) {
        if (current <= 0) break;
        pool.set(modifier.source, (pool.get(modifier.source) ?? 1) * (1 + modifier.add / current));
        current += modifier.add;
      }
      block.d = closeTowerStatValue(damage, breakdown.base, sourcesOf("damage"), [...pool, ["hit", 1 + hitAdd]]);
    }

    // Ritim. Aura ve odak kulesinde etki tiki (hiz kartlari islemez), sabit
    // aralikli kulede tanim (performans ve isi islemez).
    const auras = this.getActiveTowerAuras(tower);
    const effectInterval = usesEffectInterval(definition);
    const fixedPath = Boolean(definition.engine?.fixedFireInterval) && auras.length === 0;
    const interval = this.getTowerEffectInterval(tower);
    const baseInterval = auras.length > 0
      ? Math.min(...auras.map((aura) => aura.tickIntervalMs ?? definition.fireIntervalMs))
      : getTowerBaseLevelFireIntervalMs(definition, tower.level);
    const rateSources: TowerStatSource[] = [];
    const rateMultipliers: TowerStatSource[] = [];
    if (!fixedPath) {
      rateMultipliers.push(["perf", this.getTowerPerformanceAttackMultiplier(tower, false)], ["heat", this.getTowerHeatFireRateMultiplier(tower)]);
      // Atakan'in yalnizlik pasifi kulenin kendi ritmine isliyor; aura tiki ondan gecmiyor.
      if (auras.length === 0 && this.getAtakanPassiveMultiplier(tower) > 1) rateMultipliers.push(["character:atakan-passive", ATAKAN_ISOLATION_MULTIPLIER]);
    }
    if (!effectInterval && !fixedPath) {
      rateSources.push(...sourcesOf("fireRate"), ["engine:stack", 1 / this.getEngineStackStatMultiplier(tower, "fireRate") - 1]);
    }
    const rate = 1000 / Math.max(1, interval);
    block.f = closeTowerStatValue(rate, 1000 / Math.max(1, baseInterval), rateSources, rateMultipliers);
    if (effectInterval) block.e = 1;
    if (fixedPath) block.fx = 1;
    const shots = this.getTowerShotsPerTrigger(tower);
    if (shots !== 1) block.n = shots;
    const sustained = this.getSustainedAttacksPerSecond(tower);
    if (sustained !== undefined) block.su = sustained;

    // Kritik: `damageEnemy`'nin zari. Kulenin kendisine bakan paylar (isabetten
    // kritik, komsusuz kule, soguk namlu) toplamda; hedefe bakanlar kosul listesinde.
    if (dealsDamage) {
      const critical = engine?.critical;
      const definitionBaseChance = TOWER_BASE_CRITICAL_CHANCE + (definition.engine?.critical?.baseChance ?? 0);
      const coldCrit = this.towerHasUnlock(tower, "heat:coldCrit") && tower.temperature < COLD_CRIT_TEMPERATURE ? COLD_CRIT_CHANCE : 0;
      // Kulenin kendi kosulu yer hedefiyle okunuyor: ucan hedefe isabet payi
      // (Irtifa Olcer, isabetten kritik) namlunun o anki hedefine bagli ve
      // ana sayiyi titretirdi; o pay kosul listesinde "Hava hedefine".
      const groundTarget = { movementKind: "ground" } as EnemyModel;
      const ownGround = this.getTowerOwnConditionalCritChance(tower, groundTarget);
      const ownAir = this.getTowerOwnConditionalCritChance(tower, { movementKind: "air" } as EnemyModel);
      const critChanceMods = getModifierAdd(modifiers, "critChance");
      const engineBaseChance = TOWER_BASE_CRITICAL_CHANCE + (critical?.baseChance ?? 0);
      block.cc = closeTowerStatValue(Math.max(0, engineBaseChance + ownGround + critChanceMods) + coldCrit, definitionBaseChance, [
        ["engine:critical", engineBaseChance - definitionBaseChance],
        ...sourcesOf("critChance"),
        ["cond:own", ownGround],
        ["cond:cold", coldCrit]
      ], [], "absolute");
      const conditional: TowerStatSource[] = [];
      if (critical?.bonusChanceAgainstStatus) conditional.push([`st:${critical.bonusChanceAgainstStatus.type}`, critical.bonusChanceAgainstStatus.chance]);
      if (this.towerHasUnlock(tower, "crit:vsFrozen")) conditional.push(["frozen", FROZEN_CRIT_CHANCE]);
      if (this.towerHasUnlock(tower, "crit:vsMarked")) conditional.push(["marked", MARKED_CRIT_CHANCE]);
      if (ownAir - ownGround > 0.0005) conditional.push(["air", roundTowerStat(ownAir - ownGround)]);
      if (conditional.length > 0) block.ccx = conditional;
      const definitionCritDamage = definition.engine?.critical?.damageMultiplier ?? TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER;
      const engineCritDamage = critical?.damageMultiplier ?? TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER;
      const critDamage = 1 + Math.max(0, engineCritDamage - 1 + getModifierAdd(modifiers, "critDamage"));
      block.cm = closeTowerStatValue(critDamage, definitionCritDamage, [["engine:critical", engineCritDamage - definitionCritDamage], ...sourcesOf("critDamage")], [], "absolute");

      // Hedefe bagli hasar paylari: `damageEnemy` onlari vurus ve kritik
      // paylariyla ayni toplama ekliyor; hedef olmadan bilinmiyor, liste.
      const targetDamage: TowerStatSource[] = [
        ["air", getModifierAdd(modifiers, "airDamage")],
        ["shielded", getModifierAdd(modifiers, "damageVsShielded")],
        ["brute", getModifierAdd(modifiers, "damageVsBrute")],
        ["grunt", getModifierAdd(modifiers, "damageVsGrunt")],
        ["runner", getModifierAdd(modifiers, "damageVsRunner")],
        ["shooter", getModifierAdd(modifiers, "damageVsShooter")],
        ["siege", getModifierAdd(modifiers, "damageVsSiege")],
        ["slowed", this.towerHasUnlock(tower, "status:chill") ? 0.2 : 0],
        ["marked", getModifierAdd(modifiers, "markAmplification")]
      ];
      const dx = targetDamage.filter(([, add]) => Math.abs(add) >= 0.0005).map(([kind, add]): TowerStatSource => [kind, roundTowerStat(add)]);
      if (dx.length > 0) block.dx = dx;

      // Beklenen saniyelik hasar yalnizca tetik basina bir vurus atan yolda:
      // yorunge, dalga, lanet ve sentez hasari baska bir ritimle dagitiyor.
      // `damageEnemy` gibi: vurus ve kritik paylari toplaniyor, carpilmiyor.
      if (ballistic || executor === "debug-laser") {
        block.dps = roundTowerStat(resolvedDamage * (1 + hitAdd + block.cc.v * (critDamage - 1)) * shots * rate);
      }
    }

    // Nisan: `aimTowerAt`'in formulu.
    if (towerAims(definition.id)) {
      const degrees = 180 / Math.PI;
      const turnBonus = this.getTowerStatBonus(tower, "turnRate", modifiers);
      block.tr = closeTowerStatValue(
        Math.max(0, 1 + turnBonus) * TOWER_TURN_RATE_RADIANS_PER_SECOND * degrees,
        TOWER_TURN_RATE_RADIANS_PER_SECOND * degrees,
        [...sourcesOf("turnRate"), ["cond:turnRate", this.getTowerConditionalStatAdd(tower, "turnRate", modifiers, now)]]
      );
      // Koni carpanla degil tabandan kesirle daraliyor; dokum kendiliginden kapali.
      block.ac = closeTowerStatValue(
        getTowerFireAlignmentTolerance(this.getTowerStatBonus(tower, "accuracy", modifiers)) * degrees,
        getTowerFireAlignmentTolerance(0) * degrees,
        [...sourcesOf("accuracy"), ["cond:accuracy", this.getTowerConditionalStatAdd(tower, "accuracy", modifiers, now)]],
        [],
        "none"
      );
    }

    // Mermi hizi: `spawnTowerProjectile` ve Kin dalgasi; obur yurutuculerde
    // mermi hizi tek bir sayi degil, yalnizca carpan gidiyor.
    if (towerFiresProjectiles(definition)) {
      const multiplier = this.getTowerProjectileSpeedMultiplier(tower);
      const speedSources: TowerStatSource[] = [...sourcesOf("projectileSpeed"), ["cond:projectileSpeed", this.getTowerConditionalStatAdd(tower, "projectileSpeed", modifiers, now)]];
      const hitType = definition.hitType ?? "projectile";
      if (ballistic && definition.id !== "warrior-2") {
        const raw = definition.projectileSpeed + tower.level * 22;
        const speed = this.scaleWorldSpeed(getBallisticMovementSpeed(raw * this.getMelisFocusProjectileSpeedMultiplier(tower), hitType)) * multiplier;
        block.ps = closeTowerStatValue(speed, this.scaleWorldSpeed(getBallisticMovementSpeed(raw, hitType)), speedSources);
      } else if (executor === "kin-wave") {
        const base = this.scaleWorldSpeed(getBallisticMovementSpeed(KIN_WAVE_SPEED + tower.level * 4, "wave"));
        block.ps = closeTowerStatValue(base * multiplier, base, speedSources);
      } else {
        block.ps = closeTowerStatValue(multiplier, 1, speedSources);
        block.pr = 1;
      }
    }

    // Vurusun sekli.
    if (ballistic) {
      const aoe = this.getTowerAoeRadius(tower);
      if (aoe > 0) block.a = roundTowerStat(this.scaleWorldDistance(aoe + (tower.level - 1) * 5));
      const pierce = (engine?.attack.pierceCount ?? 1) + this.getWorkerPierceBonus(tower);
      if (pierce > 1) block.pl = pierce;
    }
    if (definition.engine?.attack.shape === "cone") block.ca = roundTowerStat(this.getTowerConeAngleRadians(tower) * 180 / Math.PI);
    if (executor === "orbit") block.bl = engine?.attack.bladeCount ?? 1;

    // Etkiler: hiz carpanlari sahadaki fonksiyonlardan (`getTowerSlowStatus`,
    // aura), digerleri `applyConfiguredTowerStatus`'un okudugu carpanlarla.
    const effects: TowerEffectWire[] = [];
    const slow = this.getTowerSlowStatus(tower);
    if (slow) {
      effects.push(slow.farSpeedMultiplier === undefined
        ? ["slow", roundTowerStat(1 - slow.speedMultiplier), slow.durationMs]
        : ["slow", roundTowerStat(1 - slow.speedMultiplier), slow.durationMs, roundTowerStat(1 - slow.farSpeedMultiplier)]);
      if (this.towerHasUnlock(tower, "status:slowCrit")) block.sc = 1;
    }
    const auraSlow = this.getTowerAuraSlowMultiplier(tower);
    if (auraSlow !== undefined) effects.push(["aslow", roundTowerStat(1 - auraSlow)]);
    const magnitudeMultiplier = getModifierMultiplier(modifiers, "statusMagnitude");
    const durationMultiplier = getModifierMultiplier(modifiers, "statusDuration");
    for (const status of engine?.statusEffects ?? []) {
      if (status.type === "slow") continue;
      const stacks = status.stacking === "add" && status.maxStacks ? status.maxStacks : 0;
      const entry: TowerEffectWire = [status.type, roundTowerStat(status.magnitude * magnitudeMultiplier), Math.round(status.durationMs * durationMultiplier)];
      if (stacks > 0) entry.push(stacks);
      effects.push(entry);
    }
    if (this.towerHasUnlock(tower, "status:burn") && definition.damageType === "fire") effects.push(["burn", 0.015, 4000]);
    if (this.towerHasUnlock(tower, "status:coolantSlow")) {
      const coolant = Math.min(COOLANT_SLOW_MAX, this.getTowerCoolingPerSecond(tower) * COOLANT_SLOW_PER_COOLING * magnitudeMultiplier);
      if (coolant > 0) effects.push(["coolant", roundTowerStat(coolant), Math.round(COOLANT_SLOW_DURATION_MS * durationMultiplier)]);
    }
    // Takipci'nin isareti dusmani seviyeye gore %20/%40/%60 fazla hasar alir yapiyor.
    if (definition.id === "warrior-1") effects.push(["mark", roundTowerStat(this.getTrackingStackLimit(tower.level) * 0.2), 6500]);
    const armorBreak = getModifierAdd(modifiers, "armorBreak");
    if (armorBreak > 0) effects.push(["armor", roundTowerStat(armorBreak)]);
    if (definition.id === "zeynep-8") effects.push(["armorAura", roundTowerStat(getAbartiArmorBreak(tower.level))]);
    if (effects.length > 0) block.fe = effects;

    // Kaynak: tetik basina bedel ve soguma; anlik doluluk anlik goruntude zaten var.
    if (definition.id !== "warrior-2") {
      block.hs = roundTowerStat(this.getTowerShotHeat(tower) * shots);
      block.hc = roundTowerStat(this.getTowerCoolingPerSecond(tower));
      block.hl = this.getTowerHeatLockThreshold(tower);
      block.hr = this.getTowerHeatReleaseThreshold(tower);
      if (this.towerHasUnlock(tower, "heat:thermalMass") || definition.engine?.fixedFireInterval) block.nb = 1;
    }
    const energyCost = this.getTowerEnergyCost(tower) * shots;
    if (energyCost > 0) block.ec = roundTowerStat(energyCost);
    const ammoCost = this.getTowerAmmoCost(tower) * shots;
    if (ammoCost > 0) block.am = roundTowerStat(ammoCost);
    // Calisma enerjisi `updateTowers`'in harcadigi: kart carpani dahil, oyun saniyesi basina.
    const upkeep = this.getWorkerBoost(tower, "upkeepFree", now)
      ? 0
      : calculateTowerOperatingEnergy(definition, 1, getModifierMultiplier(modifiers, "operatingEnergyCost"));
    if (upkeep > 0) block.oe = roundTowerStat(upkeep);
    return block;
  }

  /**
   * Bir tetiklemede cikan mermi sayisi.
   *
   * Cifte Namlu ikinci mermiyi ayni tetikte atar ve muhimmat, enerji ve isiyi
   * ikinci kez oder (`updateTowers`). Onizleme bunu gostermiyordu, yani kart
   * bedelsiz gorunuyordu. Ikinci mermi yalnizca standart atis yolunda
   * cikiyor: yorunge, aura ve kendi dongusu olan kuleler (archer-4,
   * warrior-2) o yola hic girmiyor, o yuzden onlarda kart bir sey degistirmez.
   */
  private getTowerShotsPerTrigger(tower: TowerModel) {
    if (!this.towerHasUnlock(tower, "attack:doubleShot")) return 1;
    const id = tower.definition.id;
    if (tower.definition.engine?.attack.executor === "orbit" || id === "archer-4" || id === "warrior-2"
      || this.getActiveTowerAuras(tower).length > 0) return 1;
    return 2;
  }

  private toggleAmmoLogistics(client: Client, message: ToggleAmmoLogisticsMessage) {
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!this.gameStarted || !tower || tower.ownerId !== client.sessionId) return;
    if (!this.acceptsTowerOperation(tower)) return;
    tower.ammoLogisticsEnabled = !tower.ammoLogisticsEnabled;
  }

  private setTowerPerformance(client: Client, message: SetTowerPerformanceMessage) {
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!this.gameStarted || !tower || tower.ownerId !== client.sessionId) return;
    // NaN kolu atis araligini NaN yapiyordu: muhimmatli kule her tick atesliyor,
    // hic isi kilidine girmiyor ve bakim bedeli odemiyordu.
    if (!this.acceptsTowerOperation(tower) || !isFiniteNumber(message.performance)) return;
    tower.performance = Math.max(0, Math.min(1, message.performance));
  }

  /**
   * Bir kareyi iscilere kapatir ya da acar.
   *
   * Ayni kareye ikinci kez basmak yasagi kaldiriyor: yasak geri alinamaz
   * olsaydi yanlis kareye basmak kalici bir hata olurdu.
   *
   * Kurulum sarti yok. Yasak bir yapi degil bir yonlendirme tercihi; dalga
   * ortasinda hattin yanlis yerden gectigini goren oyuncu o an duzeltebilmeli.
   */
  private toggleWorkerBannedCell(client: Client, message: WorkerBanCellMessage) {
    if (!this.gameStarted || !isFiniteNumber(message?.x) || !isFiniteNumber(message?.y)) return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const cell = worldToGrid(message.x, message.y, this.activeMap);
    if (!isInsideMap(this.activeMap, cell.col, cell.row)) return;

    const banned = this.workerBannedCells.get(client.sessionId) ?? new Set<string>();
    const key = `${cell.col}:${cell.row}`;
    if (banned.has(key)) banned.delete(key);
    else banned.add(key);
    this.workerBannedCells.set(client.sessionId, banned);
    // Saklanan adim bu karari bilmiyor: bir sonraki tick yeniden aransin.
    for (const drone of this.drones.values()) {
      if (drone.ownerId === client.sessionId) drone.routeStep = undefined;
    }
  }

  private isWorkerCellBanned(worker: DroneModel | undefined, col: number, row: number) {
    if (!worker?.ownerId) return false;
    return this.workerBannedCells.get(worker.ownerId)?.has(`${col}:${row}`) === true;
  }

  private toggleWallGate(client: Client, message: ToggleWallGateMessage) {
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!this.gameStarted || !tower || tower.ownerId !== client.sessionId) return;
    if (!isWallDefinition(tower.definition)) return;
    tower.gate = !tower.gate;
  }

  private repairStructure(client: Client, message: RepairStructureMessage) {
    const player = this.state.players.get(client.sessionId);
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!player || !tower || tower.ownerId !== client.sessionId) return;
    if (tower.hp <= 0 || tower.hp >= tower.maxHp) return;

    const missingRatio = 1 - tower.hp / tower.maxHp;
    const cost = getStructureRepairCostWithModifiers(
      getTowerBuildCost(tower.definition.cost),
      missingRatio,
      this.getTowerRepairCostMultiplier(tower)
    );
    if (cost <= 0 || player.gold < cost) return;

    player.gold -= cost;
    player.goldSpent += cost;
    // Eskitme yok: onarim yalnizca ayakta duran yapiya isliyor (hp <= 0
    // reddediliyor), yani hicbir hucrenin gecilebilirligi degismiyor.
    tower.hp = tower.maxHp;
    tower.breachAnnounced = false;
    client.send("structure:repaired", { towerId: tower.id, cost });
  }

  private damageTower(tower: TowerModel, rawDamage: number, options: { pierceArmor?: boolean } = {}) {
    if (tower.hp <= 0) {
      return;
    }
    if ((tower.repairFortificationHp ?? 0) > 0 && (tower.repairFortificationUntil ?? 0) > Date.now()) {
      const absorbed = Math.min(tower.repairFortificationHp ?? 0, Math.max(0, rawDamage));
      tower.repairFortificationHp = (tower.repairFortificationHp ?? 0) - absorbed;
      rawDamage -= absorbed;
      if (rawDamage <= 0) return;
    }
    if ((tower.ammoFactoryShield ?? 0) > 0 && tower.definition.resourceProvider === "ammunition") {
      const absorbed = Math.min(tower.ammoFactoryShield ?? 0, Math.max(0, rawDamage));
      tower.ammoFactoryShield = (tower.ammoFactoryShield ?? 0) - absorbed;
      rawDamage -= absorbed;
      if (rawDamage <= 0) return;
    }
    if ((tower.ammoEvacuationUntil ?? 0) > Date.now()) {
      rawDamage *= 0.5;
      tower.ammoEvacuationUntil = 0;
    }
    if (this.isTowerUnderRepair(tower) && this.hasWorkerSkillForOwner(tower.ownerId, "repairer", "repair-bulwark")) {
      rawDamage *= 0.7;
    }
    rawDamage *= this.getWorkerBoostReduction(tower, "damageTaken");
    // Karsi atak ve yikim zirhi deliyor: oransal hasar zirhla kirpilmasin.
    const effectiveArmor = options.pierceArmor ? 0 : applyTowerAuraModifier(tower.armor, this.getTowerAuraModifiers(tower), "armor");
    tower.hp = Math.max(0, tower.hp - Math.max(1, rawDamage - effectiveArmor));
    this.announceStructureBreach(tower);
    if (tower.hp <= 0) {
      if (this.tryAmmoFactoryBlackBox(tower)) return;
      if (this.tryEmergencyRebuild(tower)) return;
      // Eskitme yalnizca burada: gecilebilirlik canin kendisine degil,
      // **sifira inmesine** bagli. Her vurusta eskitmek akis alani
      // donemindeki yol maliyetinden kalmaydi ve artik hicbir sey okumuyor;
      // dahasi zararliydi -- cikmaz sokak hafizasi her vurusta silinirdi.
      this.markNavigationDirty();
      tower.cooldownMs = 0;
      tower.focusTargetId = "";
      tower.linkedTowerIds = [];
      if (tower.definition.id === "warrior-5") {
        // Yikilan kule dongude atlaniyor: asiri yukleme kirisleri omurleri
        // dolana kadar olu kuleden cikmaya devam ederdi. Asiri yukleme de bitiyor.
        tower.debugOverdriveUntil = 0;
        this.beams.delete(`beam-${tower.id}`);
        this.deleteDebugLaserOverdriveBeams(tower);
      }
      this.runTowerTriggers(tower, "towerDeath");
      if (this.towerHasUnlock(tower, "trigger:debrisOnDeath")) {
        const cell = worldToGrid(tower.x, tower.y, this.activeMap);
        this.debrisCells.set(`${cell.col}:${cell.row}`, Date.now() + 12000);
      }
    }
  }

  private tryEmergencyRebuild(tower: TowerModel) {
    if (tower.repairRebuildWave === this.wave || !this.hasWorkerSkillForOwner(tower.ownerId, "repairer", "repair-emergency-rebuild")) return false;
    tower.repairRebuildWave = this.wave;
    tower.hp = Math.max(1, tower.maxHp * 0.2);
    tower.offlineUntil = Date.now() + 5_000;
    tower.heatLocked = false;
    tower.temperature = 0;
    tower.breachAnnounced = false;
    this.markNavigationDirty();
    return true;
  }

  private tryAmmoFactoryBlackBox(tower: TowerModel) {
    if (tower.definition.resourceProvider !== "ammunition" || tower.ammoBlackBoxWave === this.wave
      || !this.hasWorkerSkillForOwner(tower.ownerId, "ammoCollector", "ammo-black-box")) return false;
    tower.ammoBlackBoxWave = this.wave;
    tower.hp = 1;
    tower.offlineUntil = Date.now() + 5_000;
    tower.breachAnnounced = false;
    this.markNavigationDirty();
    return true;
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

  private placeTower(client: Client, message: PlaceTowerMessage, options: { free?: boolean; ignoreLimit?: boolean } = {}) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !isFiniteNumber(message.x) || !isFiniteNumber(message.y) || typeof message.definitionId !== "string") {
      return;
    }

    const towerLimit = this.getPlayerTowerLimit(player);
    const requested = this.findTowerDefinition(player.characterId, message.definitionId);
    // Duvar kontenjandan yer kapmaz; sinir yalnizca savas kuleleri icin.
    if (!options.ignoreLimit && requested && occupiesTowerSlot(requested)) {
      const currentTowerCount = Array.from(this.towers.values())
        .filter((tower) => tower.ownerId === client.sessionId && occupiesTowerSlot(tower.definition))
        .length;
      if (currentTowerCount >= towerLimit) {
        return;
      }
    }

    const definition = this.findTowerDefinition(player.characterId, message.definitionId);
    const buildCost = options.free ? 0 : definition ? getTowerBuildCost(definition.cost) : Number.POSITIVE_INFINITY;
    // Duvarin yonu oyuncunun sectigi bir sey degil, birakildigi kenarin
    // kendisi; istemciden gelen degere guvenmek yerine konumdan turetiliyor.
    const orientation = definition?.id === WALL_TOWER_ID
      ? this.getEdgeOrientationAt(message.x, message.y)
      : getTowerPlacementOrientation(definition?.id, message.orientation);
    const placement = this.snapToTowerGrid(message.x, message.y, definition?.id, orientation);
    if (!definition || player.gold < buildCost || !this.canPlaceTower(placement.x, placement.y, definition.id, orientation)) {
      return;
    }

    const applicableHealthModifiers = this.getStructureHealthModifiers(player, definition);
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
      buildGold: buildCost,
      builtInSetupSession: this.setupPhase ? this.setupSession : undefined,
      x: placement.x,
      y: placement.y,
      orientation,
      hp: towerHealth,
      maxHp: towerHealth,
      armor: TOWER_BASE_ARMOR,
      ammoType: inferTowerAmmoType(definition),
      // Yakitla calismayan yapinin deposu yok -- ne dolu ne bos, hic.
      // Kapasitesi olsaydi isciler ona ates etmeyecegi mühimmati ve
      // harcamayacagi enerjiyi tasirdi; duvara tasiyorlardi da.
      ammo: definition.resourceProvider
        ? RESOURCE_PROVIDER_INITIAL_STOCK
        : isOperationalTower(definition) ? TOWER_BASE_AMMO : 0,
      maxAmmo: definition.resourceProvider === "ammunition"
        ? RESOURCE_PROVIDER_CAPACITY
        : definition.resourceProvider || !isOperationalTower(definition) ? 0 : TOWER_BASE_AMMO,
      energy: definition.resourceProvider === "ammunition"
        ? AMMO_FACTORY_INITIAL_ENERGY
        : definition.resourceProvider ? RESOURCE_PROVIDER_INITIAL_STOCK
        : isOperationalTower(definition) ? TOWER_BASE_ENERGY : 0,
      maxEnergy: definition.resourceProvider
        ? RESOURCE_PROVIDER_CAPACITY
        : isOperationalTower(definition) ? TOWER_BASE_ENERGY : 0,
      energyDepletedAt: 0,
      energyConduitUntil: 0,
      energyFreeUntil: 0,
      crystalReserve: 0,
      crystalResonanceReadyAt: 0,
      crystalConduitWave: 0,
      crystalLastCoreWave: 0,
      crystalCriticalResonanceWave: 0,
      ammoFactoryShield: 0,
      ammoRecyclingClaimedWave: 0,
      ammoBlackBoxWave: 0,
      ammoRefinerUntil: 0,
      ammoPayloadUntil: 0,
      ammoPayloadShots: 0,
      ammoEmergencyShots: 0,
      ammoAssaultUntil: 0,
      ammoAssaultArmedUntil: 0,
      ammoEvacuationUntil: 0,
      repairFortificationUntil: 0,
      repairFortificationHp: 0,
      repairBreachUntil: 0,
      repairRebuildWave: 0,
      standby: false,
      wakeReadyAt: 0,
      ammoLogisticsEnabled: true,
      gate: false,
      repairedUntil: 0,
      repairPerformanceWave: 0,
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
      auraActive: false,
      focusTargetId: "",
      aimTargetId: "",
      turnTargetId: "",
      waveDamageDealt: 0,
      deliveryGoldCarry: 0,
      upgradeBonusGold: 0,
      recentKillTimes: [],
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
      killCount: 0,
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
    // Terfi Ikramiyesi: yalnizca kule kontenjani tutan hasar kulesinin
    // gelistirmesi (Garnizon Maasi ile ayni olcu). Duvar ucuz ve tam iadeyle
    // geri alinabildigi icin bir altin pompasi olurdu. Odenen prim kulede
    // yaziliyor ve ayni hazirlikta tam iadeyle geri alinirsa geri aliniyor.
    if (occupiesTowerSlot(tower.definition) && towerDealsDamage(tower.definition)) {
      const paid = this.payPlayerGold(client.sessionId, getModifierAdd(player.runModifiers ?? [], "upgradeGold"));
      tower.upgradeBonusGold = (tower.upgradeBonusGold ?? 0) + paid;
    }
    // Yalnizca oynanarak varilan seviye an sayiliyor; yaratici seviye yazmak
    // (`creativeSetTowerLevel`) bir an degil, buraya ugramiyor.
    this.runLedger.recordTowerLevel(tower, player.slot ?? 0, this.wave);
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

    // Kuralin tamami paylasilan `resolveTowerRefund` icinde: kurulum arasi
    // geri alimi, iade carpani, ve geri alimin carpandan muaf olusu.
    // Arayuz ayni fonksiyonu cagiriyor, yani dugmede yazan sayi ile burada
    // odenen sayi ayrisamaz.
    const { amount: refund, undoable } = resolveTowerRefund(
      { ...tower, cost: tower.definition.cost, definitionId: tower.definition.id },
      {
        setupPhase: this.setupPhase,
        setupSession: this.setupSession,
        refundMultiplier: this.getTowerSellRefundMultiplier(tower)
      }
    );
    player.gold += refund;
    player.goldSpent = Math.max(0, player.goldSpent - refund);
    // Ayni hazirlikta tam iadeyle geri alinan kule: gelistirmelerinden odenen
    // Terfi Ikramiyesi de geri aliniyor (kur, gelistir, geri al dongusu).
    if (undoable && (tower.upgradeBonusGold ?? 0) > 0) {
      player.gold = Math.max(0, player.gold - (tower.upgradeBonusGold ?? 0));
    }
    if (occupiesTowerSlot(tower.definition)) {
      player.towersBuilt = Math.max(0, player.towersBuilt - 1);
    }
    this.removeTowerReferences(tower.id);
    // Satilan kulenin kirisleri hemen kalkiyor; yoksa bir omur boyunca bos
    // yerden cikmaya devam ederlerdi (Debug Lazer asiri yuklemede uc kiris).
    this.beams.delete(`beam-${tower.id}`);
    this.deleteDebugLaserOverdriveBeams(tower);
    this.towers.delete(tower.id);
    this.markNavigationDirty();
    this.broadcast("tower:remove", { id: tower.id });
  }


  /**
   * Yaratici mod komutlari icin ortak kapi.
   *
   * Iki kosul birden araniyor. Oda yaratici olarak kurulmus olmali: bayrak
   * yalnizca dogrudan baslatilan tek kisilik odada aciliyor, lobiden gecen bir
   * oda hicbir zaman alamiyor. Ve odada tek oyuncu bulunmali -- bayrak tek
   * basina yeterli degil, cunku bir sekilde ikinci bir oyuncu girerse
   * karsisinda bedava kule koyan biri olurdu.
   */
  private getCreativePlayer(client: Client) {
    if (!this.creativeMode || this.state.players.size > 1) return undefined;
    return this.state.players.get(client.sessionId);
  }

  /**
   * Kule cani icin oyuncudan gelen carpanlar.
   *
   * Esya kapsami burada suzuluyor: "yalnizca isin kulelerinde" yazan bir
   * esyanin can bonusu her kuleye islememeli. Etiketli kart da ayni suzgecten
   * geciyor (`getTowerRunModifiers` ile ayni kural): "Dairesel yapilarin
   * cani" yazan Yuvarlak Temel bir donem her yapinin canini buyutuyordu ve
   * secim ekrani ile kart bildirimi baska bir sey soyluyordu.
   */
  private getStructureHealthModifiers(player: Player, definition: TowerDefinition): RunModifiers {
    return player.runModifiers.filter((modifier) => {
      if (modifier.source.startsWith("card:")) {
        const card = getCardDefinition(modifier.source.slice(5));
        return !card || card.scope.kind === "global" || cardAppliesToTower(card, definition);
      }
      if (!modifier.source.startsWith("shop:")) return true;
      const item = getShopItem(modifier.source.slice(5));
      return !item || item.scope.kind === "global" || shopItemAppliesToTower(item, definition);
    });
  }

  /**
   * Kart ve esya etkilerini kimlik listelerinden sifirdan kurar.
   *
   * Normal oyunda **eklemek** yetiyor: modifier listeye itiliyor, can farki o
   * anki degere oranlaniyor. Yaratici modda cikarmak da gerekiyor ve cikarma o
   * yolun tersi degil -- oranla buyutulmus bir can, oran geri bolununce ayni
   * sayiya donmuyor ve modifier listesinde hangi girdinin hangi karttan geldigi
   * de yalnizca sirayla belli. Bu yuzden ekleme de cikarma da buradan geciyor:
   * kimlik listeleri tek dogru kaynak, sayisal katman her seferinde onlardan
   * yeniden turuyor.
   *
   * Kilitler ve motor ekleri zaten kimlik listelerinden okunuyor
   * (`collectTowerGrants`), burada yalnizca modifier listeleri ve can tavani
   * yeniden kuruluyor.
   */
  private rebuildCreativeLoadout(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    const playerModifiers: RunModifiers = [];
    for (const cardId of player.ownedCardIds) {
      const card = getCardDefinition(cardId);
      if (card && card.scope.kind !== "targeted") playerModifiers.push(...card.effects);
    }
    for (const itemId of player.ownedShopItemIds) {
      const item = getShopItem(itemId);
      if (item && isGlobalShopItem(item)) playerModifiers.push(...item.effects);
    }
    player.runModifiers = playerModifiers;

    for (const tower of this.towers.values()) {
      if (tower.ownerId !== sessionId) continue;
      const towerModifiers: RunModifiers = [];
      for (const cardId of tower.targetedCardIds) {
        const card = getCardDefinition(cardId);
        if (card) towerModifiers.push(...card.effects);
      }
      for (const itemId of tower.equippedShopItemIds) {
        const item = getShopItem(itemId);
        if (item) towerModifiers.push(...item.effects);
      }
      tower.runModifiers = towerModifiers;

      // Hasar orani korunuyor: yarim canla duran bir kule kart eklenince tam
      // cana donmemeli.
      const damageRatio = tower.maxHp > 0 ? Math.min(1, tower.hp / tower.maxHp) : 1;
      tower.maxHp = TOWER_BASE_HP
        * getStructureHealthMultiplier(tower.definition, tower.level)
        * getModifierMultiplier([...this.getStructureHealthModifiers(player, tower.definition), ...towerModifiers], "towerHealth");
      tower.hp = tower.maxHp * damageRatio;
    }

    this.invalidateTowerGrants();
    this.markNavigationDirty();
  }

  /** Arayuzun kutucuklari isaretleyebilmesi icin o anki yaratici durum. */
  private getCreativeLoadout(sessionId: string) {
    const player = this.state.players.get(sessionId);
    return {
      wave: this.wave,
      cardIds: [...(player?.ownedCardIds ?? [])],
      itemIds: [...(player?.ownedShopItemIds ?? [])],
      towers: Array.from(this.towers.values())
        .filter((tower) => tower.ownerId === sessionId)
        .map((tower) => ({
          id: tower.id,
          definitionId: tower.definition.id,
          level: tower.level,
          cardIds: [...tower.targetedCardIds],
          itemIds: [...tower.equippedShopItemIds]
        }))
    };
  }

  private sendCreativeLoadout(client: Client) {
    client.send("creative:loadout", this.getCreativeLoadout(client.sessionId));
  }

  private creativePlaceTower(client: Client, message: CreativeTowerMessage) {
    if (!this.getCreativePlayer(client)) return;
    this.placeTower(client, message, { free: true, ignoreLimit: true });
    this.sendCreativeLoadout(client);
  }

  /**
   * Kuleyi dogrudan istenen seviyeye tasir.
   *
   * Yukseltme yolu tek tek ilerliyor ve her adimda tecrube ile altin yakiyor;
   * burasi ikisini de atlayip seviyeyi yaziyor. Can tavani yeniden kurulumdan
   * cikiyor, cunku yapi carpani seviyeye bagli.
   *
   * Ucube'nin perk secimi yalnizca **varilan** seviye icin aciliyor, aradaki
   * kademeler atlaniyor. Hepsini gormek isteyen seviyeyi birer birer verebilir.
   */
  private creativeSetTowerLevel(client: Client, message: CreativeLevelMessage) {
    // Kapi her seyden once: yaratici olmayan odada govde hic okunmuyor.
    const player = this.getCreativePlayer(client);
    if (!player) return;
    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!tower || tower.ownerId !== client.sessionId) return;
    const level = Math.max(1, Math.min(MAX_TOWER_LEVEL, Math.round(isFiniteNumber(message.level) ? message.level : tower.level)));
    if (level === tower.level) return;
    tower.level = level;
    if (tower.definition.id === "warrior-6" && getUcubePerkTier(level)) {
      tower.ucubePendingLevel = level;
      client.send("ucube:choice", { towerId: tower.id, level });
    }
    this.rebuildCreativeLoadout(client.sessionId);
    this.sendCreativeLoadout(client);
  }

  private countOwned(ids: string[], id: string) {
    return ids.reduce((total, candidate) => candidate === id ? total + 1 : total, 0);
  }

  private creativeToggleCard(client: Client, message: CreativeCardMessage) {
    const player = this.getCreativePlayer(client);
    if (!player) return;
    const card = message.cardId ? getCardDefinition(message.cardId) : undefined;
    if (!card) return;

    if (card.scope.kind === "targeted") {
      const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
      if (!tower || tower.ownerId !== client.sessionId) return;
      const index = tower.targetedCardIds.indexOf(card.id);
      if (message.on === false) {
        if (index < 0) return;
        tower.targetedCardIds.splice(index, 1);
      } else {
        if (index >= 0) return;
        tower.targetedCardIds.push(card.id);
      }
    }

    const owned = player.ownedCardIds.indexOf(card.id);
    if (message.on === false) {
      if (owned >= 0) player.ownedCardIds.splice(owned, 1);
    } else if (owned < 0 || (card.stackable && this.countOwned(player.ownedCardIds, card.id) < (card.maxStacks ?? Infinity))) {
      player.ownedCardIds.push(card.id);
    }

    this.rebuildCreativeLoadout(client.sessionId);
    this.sendCreativeLoadout(client);
  }

  /**
   * Esyayi takar ya da cikarir.
   *
   * Kuresel esyalar dogrudan oyuncuya yaziliyor. Kuleye takilanlarda
   * `canEquipShopItem` kurali korunuyor: on esyalik tavan ve uyumluluk gercek
   * oyun kurallari ve onlari delmek, geri kalan kodun beklemedigi bir kule
   * uretirdi.
   */
  private creativeToggleItem(client: Client, message: CreativeItemMessage) {
    const player = this.getCreativePlayer(client);
    if (!player) return;
    const item = message.itemId ? getShopItem(message.itemId) : undefined;
    if (!item) return;
    const adding = message.on !== false;

    if (isGlobalShopItem(item)) {
      const owned = player.ownedShopItemIds.indexOf(item.id);
      if (adding) {
        if (owned >= 0 && !item.repeatable) return;
        if (item.repeatable && this.countOwned(player.ownedShopItemIds, item.id) >= (item.maxStacks ?? Infinity)) return;
        player.ownedShopItemIds.push(item.id);
        // Magazadaki alimla ayni: vadeli altin bu dalgadan sayilmaya basliyor.
        if (item.deposit) this.addGoldDeposit(player, item.deposit);
      } else {
        if (owned < 0) return;
        player.ownedShopItemIds.splice(owned, 1);
        // Cikarilan mevduatin henuz odenmemis son kaydi da duser.
        if (item.deposit) {
          const deposits = player.goldDeposits ?? [];
          const index = deposits.map((deposit) => deposit.amount).lastIndexOf(item.deposit.payout);
          if (index >= 0) player.goldDeposits = deposits.filter((_, position) => position !== index);
        }
      }
      this.rebuildCreativeLoadout(client.sessionId);
      this.sendCreativeLoadout(client);
      return;
    }

    const tower = message.towerId ? this.towers.get(message.towerId) : undefined;
    if (!tower || tower.ownerId !== client.sessionId) return;
    const equipped = tower.equippedShopItemIds.indexOf(item.id);
    if (adding) {
      if (equipped >= 0) return;
      const check = canEquipShopItem(item, tower.definition, tower.equippedShopItemIds);
      if (!check.ok) {
        client.send("inventory:equip-rejected", { itemId: item.id, towerId: tower.id, reason: check.reason });
        return;
      }
      tower.equippedShopItemIds.push(item.id);
      player.ownedShopItemIds.push(item.id);
    } else {
      if (equipped < 0) return;
      tower.equippedShopItemIds.splice(equipped, 1);
      const owned = player.ownedShopItemIds.indexOf(item.id);
      if (owned >= 0) player.ownedShopItemIds.splice(owned, 1);
    }
    this.rebuildCreativeLoadout(client.sessionId);
    this.sendCreativeLoadout(client);
  }

  /**
   * Dalga numarasini dogrudan yazar.
   *
   * Dusman gucu tamamen `this.wave` uzerinden turedigi icin (can, kalkan, hiz,
   * irk, ucan orani) sayiyi degistirmek o dalganin dusmanlarini getirmeye
   * yetiyor; birikmis bir buyume durumu yok.
   */
  private creativeSetWave(client: Client, message: CreativeWaveMessage) {
    if (!this.getCreativePlayer(client)) return;
    // NaN dalga her tick NaN canli, olumsuz bir dusman doguruyordu.
    const wave = Math.max(1, Math.min(FINAL_WAVE, Math.round(isFiniteNumber(message.wave) ? message.wave : this.wave)));
    this.wave = wave;
    this.waveSpawned = 0;
    this.planWaveSpawns(wave);
    this.waveClearedAt = 0;
    this.sendCreativeLoadout(client);
  }

  /**
   * Istenen sayida dusman gonderir.
   *
   * Kurulum evresinden cikmak sart: evre acikken `updateSpawning` erken donuyor
   * ve gonderilen dusman yerinde duruyor. Hedef sayaci da buyutuluyor, yoksa
   * dalga "zaten dolmus" sayilip bir sonrakine gecerdi.
   */
  private creativeSpawnEnemies(client: Client, message: CreativeSpawnMessage) {
    if (!this.getCreativePlayer(client)) return;
    const count = Math.max(1, Math.min(CREATIVE_MAX_SPAWN_BURST, Math.round(isFiniteNumber(message.count) ? message.count : 1)));
    this.setupPhase = false;
    this.setupReadyPlayerIds.clear();
    this.waveClearedAt = 0;
    this.waveTarget = Math.max(this.waveTarget, this.waveSpawned + count);
    // Ayni dogum yolu: patlama sampiyonun sirasini gecerse sampiyon da gelir.
    for (let index = 0; index < count; index += 1) this.spawnNextWaveEnemy();
  }

  private setTowerMode(client: Client, message: TowerModeMessage) {
    if (!message.towerId || (message.mode !== "standby" && message.mode !== "approval" && message.mode !== "stress")) {
      return;
    }

    const tower = this.towers.get(message.towerId);
    if (!tower || tower.ownerId !== client.sessionId) {
      return;
    }

    if (message.mode === "standby") {
      if (!this.acceptsTowerOperation(tower)) return;
      tower.standby = !tower.standby;
      tower.wakeReadyAt = tower.standby ? 0 : Date.now() + 3500;
      return;
    }

    if (tower.definition.id !== "archer-4") return;

    tower.melisUnderworldMode = message.mode;
  }

  /**
   * Bu yapi bir **kule islemine** dahil olur mu.
   *
   * Uc kol var ve ucu de ayni cumleyi soyluyor: mühimmat akisi, performans
   * kolu, beklemeye alma, hedefleme modu. Hepsi bir seyi vuran bir sey icin
   * anlamli. Kaynak binasi vurmaz -- zaten disariydi. Duvar da vurmaz, ama
   * `!resourceProvider` testinden geciyordu ve boylece kule islemlerinin
   * tamamini miras aliyordu: isciler ona mühimmat tasiyor, oyuncu ona
   * performans kolu cekiyordu.
   *
   * Duvar kule degil. Tek soru, tek yer.
   */
  private acceptsTowerOperation(tower: TowerModel) {
    return isOperationalTower(tower.definition);
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
    if (!message.towerId || !isFiniteNumber(message.x) || !isFiniteNumber(message.y)) {
      return false;
    }

    const tower = this.towers.get(message.towerId);
    const { x, y } = this.snapToTowerGrid(message.x, message.y, tower?.definition.id, tower?.orientation);
    if (!tower || tower.ownerId !== client.sessionId || !this.canPlaceTower(x, y, tower.definition.id, tower.orientation, tower.id)) {
      return false;
    }

    tower.x = x;
    tower.y = y;
    // Yapi yer degistirdi: hucre indeksi eski karede hayalet bir engel
    // birakiyordu ve dusmanlar yeni karedeki kuleyi gormuyordu.
    this.markNavigationDirty();
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
    this.notifyServerLinkJoined(serverTower, targetTower);
  }

  /**
   * Takim arkadasinin kulesine bag kuruldu: kulenin sahibine tek satir.
   *
   * Bag o kuleye bonus veriyor ama sahibi bunu hic gormuyordu. Kendi kulene
   * kurdugun bag icin bildirim yok (dokunus zaten senin). Ayni cift icin
   * kisa surede ikinci bildirim yok: bag dokunusla ac-kapa yapilabiliyor.
   */
  private notifyServerLinkJoined(serverTower: TowerModel, targetTower: TowerModel) {
    if (targetTower.ownerId === serverTower.ownerId) {
      return;
    }
    const recipient = this.clients.find((candidate) => candidate.sessionId === targetTower.ownerId);
    if (!recipient) {
      return;
    }
    const now = Date.now();
    const key = `${serverTower.id}>${targetTower.id}`;
    const last = this.serverLinkNoticeAt.get(key);
    if (last !== undefined && now - last < SERVER_LINK_NOTICE_COOLDOWN_MS) {
      return;
    }
    this.serverLinkNoticeAt.set(key, now);
    const message: ServerLinkJoinedMessage = {
      serverTowerId: serverTower.id,
      targetTowerId: targetTower.id,
      serverOwnerId: serverTower.ownerId
    };
    recipient.send("link:joined", message);
  }

  /**
   * Bag 5 ya da 10 dalgaya ulasti: iki sahibe de tek mesaj (ayni kisiyse bir
   * kez). Bonus o dalgada aciliyor; bunu soyleyen bir an yoktu.
   */
  private notifyServerLinkMatured(serverTower: TowerModel, targetTower: TowerModel, previousAge: number, nextAge: number) {
    const waves = getServerLinkMaturity(previousAge, nextAge);
    if (!waves) {
      return;
    }
    const message: ServerLinkMaturedMessage = {
      serverTowerId: serverTower.id,
      targetTowerId: targetTower.id,
      serverOwnerId: serverTower.ownerId,
      targetOwnerId: targetTower.ownerId,
      waves
    };
    for (const ownerId of new Set([serverTower.ownerId, targetTower.ownerId])) {
      this.clients.find((candidate) => candidate.sessionId === ownerId)?.send("link:matured", message);
    }
  }

  private canLinkTower(sourceTower: TowerModel, targetTower: TowerModel) {
    if (sourceTower.definition.id === "warrior-2") {
      return targetTower.definition.id !== "warrior-2";
    }

    return false;
  }

  private useSkill(client: Client, message: UseSkillMessage) {
    const player = this.state.players.get(client.sessionId);
    const slot = isFiniteNumber(message.slot) ? Math.floor(message.slot) : -1;
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
      const didUseCommand = this.useZeynepCommand(player, slot, message, client.sessionId);
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
      if (!isFiniteNumber(message.x) || !isFiniteNumber(message.y)) {
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

    if (slot === ATAKAN_EXECUTE_SLOT) {
      return this.executeEnemyBySkill(client, message, now);
    }

    return false;
  }

  /**
   * Execute: dokunulan tek dusmani infaz eder.
   *
   * Hedef kimlikle geliyor, konumla degil: istemci dunyayi sunucunun yarim
   * saniye kadar gerisinden ciziyor ve dokunulan noktada sunucu tarafinda
   * coktan baska bir dusman (ya da hic) olabiliyor. Kimlik oyuncunun gordugu
   * dusmani seciyor.
   *
   * Hedef ezici (brute) ya da sampiyonsa "immune", yoksa / olmus /
   * hukmedilmis / olumsuz / cevrilmisse "invalid" ile reddediliyor; ikisinde
   * de `useSkill` bekleme suresini geri aliyor. Oldurme normal yoldan:
   * `damageEnemy` -> `finishEnemyKill` (altin, XP, seri, asist, defter,
   * sampiyon). Hasar yapay oldugu icin tasan hasar primi sayilmiyor
   * (`SYNTHETIC_KILL_SOURCES`).
   */
  private executeEnemyBySkill(client: Client, message: UseSkillMessage, now: number) {
    const enemy = message.enemyId ? this.enemies.get(message.enemyId) : undefined;
    const reason = this.getExecuteRejectReason(enemy, now);
    if (reason || !enemy) {
      this.rejectSkill(client, ATAKAN_EXECUTE_SLOT, reason ?? "invalid");
      return false;
    }
    const x = enemy.x;
    const y = enemy.y;
    // Kalkan yariya hasar aliyor (`SHIELD_DAMAGE_TAKEN_MULTIPLIER`): kalkanin
    // iki kati, ustune can ve azami can. "true" hasar zirhi ve direnci asiyor.
    const killed = this.damageEnemy(enemy, enemy.hp + enemy.shield * 2 + enemy.maxHp + 1, 0, ATAKAN_EXECUTE_SOURCE_ID, client.sessionId, "true");
    if (!killed) {
      this.rejectSkill(client, ATAKAN_EXECUTE_SLOT, "invalid");
      return false;
    }
    const cast: SkillExecuteMessage = { casterId: client.sessionId, enemyId: enemy.id, x: roundNetworkNumber(x), y: roundNetworkNumber(y) };
    this.broadcast("skill:execute", cast);
    return true;
  }

  private getExecuteRejectReason(enemy: EnemyModel | undefined, now: number): ExecuteRejectReason | undefined {
    if (!enemy || enemy.hp <= 0 || this.enemies.get(enemy.id) !== enemy) return "invalid";
    // Bagisiklik once: ezici ya da sampiyon hukmedilmis olsa da "etkisiz".
    if (isExecuteImmune({ type: enemy.type, champion: enemy.champion, special: enemy.special?.kind })) return "immune";
    // Kulelerin hedef kurali (`canTowerTargetEnemy`): hukmedilen, olumsuz ve
    // cevrilmis dusman takimin tarafinda, ona dokunulmuyor. Ucan dusman serbest.
    if (enemy.dominatedUntil > now || enemy.melisUndeadUntil > now || enemy.melisWhisperTurnedUntil > now) return "invalid";
    return undefined;
  }

  /** Beceri reddi yalnizca atana: istemci gerekceyi yazip hedefleme kipini kapatiyor. */
  private rejectSkill(client: Pick<Client, "send">, slot: number, reason: ExecuteRejectReason) {
    const payload: SkillRejectedMessage = { slot, reason };
    client.send("skill:rejected", payload);
  }

  private useZeynepCommand(player: Player, slot: number, message: UseSkillMessage, ownerId = "") {
    const now = Date.now();
    const commandType = getZeynepCommandType(slot);
    const isFinisher = player.authorityChain >= 2;
    const tier = getRequestedZeynepCommandTier(message.commandTier);
    const cost = getZeynepCommandCost(tier);
    if (player.reputation < cost) {
      return false;
    }

    player.reputation = Math.max(0, player.reputation - cost);
    this.applyZeynepCommand(commandType, tier, isFinisher, player.authorityQuality, now, ownerId);

    if (isFinisher) {
      player.authorityQuality = Math.min(ZEYNEP_MAX_AUTHORITY_QUALITY, player.authorityQuality + 1);
      player.authorityChain = 0;
    } else {
      player.authorityChain = Math.min(2, player.authorityChain + 1);
    }

    return true;
  }

  private applyZeynepCommand(commandType: ZeynepCommandType, tier: ZeynepCommandTier, chained: boolean, authorityQuality: number, now: number, ownerId = "") {
    const profile = getZeynepCommandProfile(commandType, tier, chained, authorityQuality);
    if (commandType === "haste") {
      this.applyZeynepHaste(profile.durationMs, profile.multiplier, tier, now, ownerId);
      return;
    }
    if (commandType === "range") {
      this.applyZeynepRange(profile.durationMs, profile.multiplier, tier, now, ownerId);
      return;
    }
    this.applyZeynepSlow(profile.durationMs, profile.multiplier, tier, now, ownerId);
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
    if (!isFiniteNumber(message.x) || !isFiniteNumber(message.y)) {
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
    target.slowSpeedFloors = undefined;
    // Yavaslatma durumu da gidiyor: kalsaydi sonraki bir vurus onun eski
    // bitisini devralirdi ve asist kaydi bitmis bir yavaslatmayi sayardi.
    delete target.statusEffects.slow;
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

  private applyZeynepHaste(durationMs: number, multiplier: number, tier: ZeynepCommandTier, now: number, ownerId = "") {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepHasteUntil <= now || multiplier >= this.zeynepHasteMultiplier) {
      this.zeynepHasteUntil = until;
      this.zeynepHasteMultiplier = multiplier;
      this.zeynepHasteTier = tier;
      this.zeynepHasteOwnerId = ownerId;
    } else {
      this.zeynepHasteUntil = Math.max(this.zeynepHasteUntil, until);
    }
  }

  private applyZeynepRange(durationMs: number, multiplier: number, tier: ZeynepCommandTier, now: number, ownerId = "") {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepRangeUntil <= now || multiplier >= this.zeynepRangeMultiplier) {
      this.zeynepRangeUntil = until;
      this.zeynepRangeMultiplier = multiplier;
      this.zeynepRangeTier = tier;
      this.zeynepRangeOwnerId = ownerId;
    } else {
      this.zeynepRangeUntil = Math.max(this.zeynepRangeUntil, until);
    }
  }

  private applyZeynepSlow(durationMs: number, multiplier: number, tier: ZeynepCommandTier, now: number, ownerId = "") {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepSlowUntil <= now || multiplier <= this.zeynepSlowMultiplier) {
      this.zeynepSlowUntil = until;
      this.zeynepSlowMultiplier = multiplier;
      this.zeynepSlowTier = tier;
      this.zeynepSlowOwnerId = ownerId;
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
    const mode = message.mode === "repair" ? "repair" : "attack";
    // Karne: ultinin ne yaptigini sunucu sayiyor, istemci yalnizca soyluyor.
    const report: UltimateReport = { ownerId: client.sessionId, kind: getUltimateResultKind(player.characterId, mode), hits: 0, kills: 0 };

    if (player.characterId === "zeynep" && column !== undefined) {
      this.fireZeynepColumnUltimate(client.sessionId, column, report);
      this.finishUltimateReport(report);
      return;
    }

    // Asagidaki sabit hasarlar da ayni kademeyle buyur: ulti gucu karakterin
    // degil oyuncunun yatirimi.
    const ultimatePower = this.getUltimatePowerMultiplierFor(client.sessionId);

    if (player.characterId === "mage") {
      for (const enemy of this.enemies.values()) {
        this.strikeForUltimate(report, enemy, 85 * ultimatePower, 0);
      }
      this.finishUltimateReport(report);
      return;
    }

    if (player.characterId === "healer") {
      const healthBefore = this.teamHealth;
      this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + 28);
      // Tavanda kirpilan can karneye yazilmiyor: usse donmeyen can soylenmemeli.
      report.heal = this.teamHealth - healthBefore;
      for (const enemy of this.enemies.values()) {
        const duration = applyStatusResistance(1800, enemy.statusResistances.slow);
        this.extendFlatSlow(enemy, Date.now() + scaleGameDuration(duration), Date.now());
        report.hits += 1;
      }
      this.finishUltimateReport(report);
      return;
    }

    if (player.characterId === "tank") {
      for (const enemy of this.enemies.values()) {
        this.strikeForUltimate(report, enemy, 35 * ultimatePower, 3200);
      }
      this.finishUltimateReport(report);
      return;
    }

    if (player.characterId === "onur") {
      this.startSympathy(client.sessionId);
      this.openTimedUltimateReport(report, this.sympathyUntil);
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
      this.openTimedUltimateReport(report, this.melisGothicNightmareOwnerUntil.get(client.sessionId) ?? until);
      return;
    }

    if (player.characterId === "warrior") {
      this.useAtakanUltimate(client, mode, report);
      return;
    }

    for (const enemy of this.enemies.values()) {
      this.strikeForUltimate(report, enemy, 25 * ultimatePower, 0);
    }
    this.finishUltimateReport(report);
  }

  /**
   * Ultinin tek vurusu; karneye isler.
   *
   * `damageEnemy` inmeyen vurusu da (bagisik dusman) "olmedi" diye donduruyor;
   * isabet inen vurus sayacindan ayriliyor. Olum ayni cagrinin cevabi:
   * zincirleme patlamalarin oldurdugu sayilmiyor, yalnizca ultinin kendi vurusu.
   */
  private strikeForUltimate(report: UltimateReport, enemy: EnemyModel, damage: number, slowMs: number, sourceDefinitionId = "ultimate", ownerId = report.ownerId) {
    const landedBefore = this.landedHitCount;
    const killed = this.damageEnemy(enemy, damage, slowMs, sourceDefinitionId, ownerId);
    if (this.landedHitCount !== landedBefore) {
      report.hits += 1;
    }
    if (killed) {
      report.kills += 1;
    }
    return killed;
  }

  /**
   * Sureli ulti (Kabus, Sempati) etki bitene kadar sayiyor.
   *
   * Ayni turden acik bir karne varsa (ulti suresi bitmeden yeniden atildi)
   * o simdiye kadarki sayilariyla raporlaniyor; sonrasi yeni atisin.
   */
  private openTimedUltimateReport(report: UltimateReport, until: number) {
    for (const open of [...this.openUltimateReports]) {
      if (open.ownerId === report.ownerId && open.kind === report.kind) {
        this.finishUltimateReport(open);
      }
    }
    report.until = until;
    if (report.kind === "sympathy") {
      report.markedIds = new Set();
    }
    this.openUltimateReports.push(report);
  }

  /**
   * Sureli ultilerin sayaci; `damageEnemy` inen her vurusta cagiriyor.
   *
   * Kabus: sahibinin Melis kulelerinin suredeki kendi vuruslari -- ultinin
   * guclendirdigi sey tam olarak bu. Durum tikleri (kanama, yanma) ne gercek
   * hasara geciyor ne hizlaniyor; sayilmiyor, sayi sisirilmesin.
   * Sempati: baga takilip kanayan dusmanlardan suredeki olumler.
   */
  private tallyTimedUltimateHit(enemy: EnemyModel, sourceDefinitionId: string, sourceTower: TowerModel | undefined, killed: boolean, now: number) {
    for (const report of this.openUltimateReports) {
      if (report.until === undefined || now >= report.until) {
        continue;
      }
      if (report.kind === "nightmare") {
        if (!sourceTower || sourceTower.ownerId !== report.ownerId || sourceTower.characterId !== "archer" || sourceDefinitionId.startsWith("status:")) {
          continue;
        }
        report.hits += 1;
        if (killed) {
          report.kills += 1;
        }
      } else if (report.kind === "sympathy" && killed && report.markedIds?.has(enemy.id)) {
        report.kills += 1;
      }
    }
  }

  /** Drone'lari dusen ve suresi biten karneler her tick burada raporlaniyor. */
  private settleUltimateReports() {
    if (this.openUltimateReports.length === 0) {
      return;
    }
    const now = Date.now();
    for (const report of [...this.openUltimateReports]) {
      const dronesDone = report.droneIds !== undefined && ![...report.droneIds].some((id) => this.drones.has(id));
      const timeUp = report.until !== undefined && now >= report.until;
      if (dronesDone || timeUp) {
        this.finishUltimateReport(report);
      }
    }
  }

  private findDroneUltimateReport(droneId: string) {
    return this.openUltimateReports.find((report) => report.droneIds?.has(droneId));
  }

  /**
   * Karneyi yollar: sahibine sayilarin tamami (`ultimate:result`), odanin
   * geri kalanina tek satirlik cip icin ozet (`ultimate:cast`).
   *
   * Sahibi odadan ciktiysa rapor sessizce birakiliyor. Ikisi de atis basina
   * bir kez gidiyor; bos alan yazilmiyor.
   */
  private finishUltimateReport(report: UltimateReport) {
    const index = this.openUltimateReports.indexOf(report);
    if (index >= 0) {
      this.openUltimateReports.splice(index, 1);
    }
    if (!this.state.players.has(report.ownerId)) {
      return;
    }

    const hits = Math.max(0, Math.round(report.hits));
    const kills = Math.max(0, Math.round(report.kills));
    const heal = report.heal === undefined ? undefined : Math.max(0, Math.round(report.heal));
    // Nisan yalnizca isabetten farkliysa: cogu atista ayni sayi, varsayilan
    // (isabet) yazilmiyor. Yalnizca atana giden karnede; takim cipinde yok.
    const aim = report.aim === undefined ? undefined : Math.max(0, Math.round(report.aim));
    const result: UltimateResultMessage = {
      kind: report.kind,
      hits,
      kills,
      ...(report.best !== undefined ? { best: report.best } : {}),
      ...(aim !== undefined && aim !== hits ? { aim } : {}),
      ...(heal !== undefined ? { heal } : {})
    };
    const owner = this.clients.find((client) => client.sessionId === report.ownerId);
    owner?.send("ultimate:result", result);

    const cast: UltimateCastMessage = { ownerId: report.ownerId, kind: report.kind, hits, kills, ...(heal ? { heal } : {}) };
    this.broadcast("ultimate:cast", cast, owner ? { except: owner } : undefined);
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
   *
   * Karneye en iyi sutun da yaziliyor: atis anindaki sahada en kalabalik
   * sutunun yakalayacagi dusman. Nisanin derecesi bununla olculuyor, o yuzden
   * vurusla ayni kurali (bagisik dusman sayilmaz, sol <= x < sag) kullaniyor.
   */
  private fireZeynepColumnUltimate(ownerId: string, column: number, report: UltimateReport) {
    const gridSize = getMapGridSize(this.activeMap);
    const origin = getMapOrigin(this.activeMap);
    const bounds = getMapWorldBounds(this.activeMap);
    const left = origin.x + column * gridSize;
    const right = left + gridSize;
    const damage = this.getZeynepColumnUltimateDamage(ownerId);

    const now = Date.now();
    const reachable: number[] = [];
    // Nisan: secilen sutunda atis anindaki vurulabilir dusman, en iyi sutunla
    // ayni kural. Isabetle kiyaslamak zincir olumlerde (Melis lanet patlamasi
    // sutundaki komsuyu sirasi gelmeden olduruyor) mukemmel nisani
    // imkansiz kiliyordu; olen komsuyu isabet saymak da sayiyi sisirirdi.
    let aimed = 0;
    for (const enemy of this.enemies.values()) {
      if (!this.isEnemyDominatedAgainst(enemy, "ultimate", now)) {
        reachable.push(enemy.x);
        if (enemy.x >= left && enemy.x < right) aimed += 1;
      }
    }
    report.best = getBestUltimateColumnHits(reachable, origin.x, gridSize, this.activeMap.cols);
    report.aim = aimed;

    for (const enemy of this.enemies.values()) {
      if (enemy.x < left || enemy.x >= right) {
        continue;
      }
      this.strikeForUltimate(report, enemy, damage, ZEYNEP_COLUMN_ULTIMATE_SLOW_MS, "ultimate", ownerId);
    }

    const id = `zeynep-ultimate-${this.nextBeamId++}`;
    this.beams.set(id, {
      id,
      definitionId: "zeynep-ultimate-column",
      // Ulti kademesi kulenin seviyesinden degil ulti gucunden (0-2/3-4/5).
      tier: this.getUltimateBeamTier(ownerId),
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

  /**
   * Atakan ultisi: her Atakan kulesinden bir drone.
   *
   * Drone'lar zamanla sonuclaniyor; atis hicbir seyi beklemiyor. Karne bu
   * atisin drone'larini tutuyor ve sonuncusu dusunce (vurdu, hedefsiz kaldi ya
   * da suresi bitti) raporlaniyor. Hic drone cikmadiysa hemen.
   */
  private useAtakanUltimate(client: Client, mode: "attack" | "repair", report: UltimateReport) {
    const ownTowers = Array.from(this.towers.values()).filter((tower) => tower.ownerId === client.sessionId && tower.characterId === "warrior");
    const repairNexus = mode === "repair";
    const droneDamage = this.getAtakanDroneDamage(client.sessionId);

    const droneIds = new Set<string>();
    for (const tower of ownTowers) {
      const droneId = this.spawnAtakanDrone(tower, repairNexus, droneDamage);
      if (droneId) {
        droneIds.add(droneId);
      }
    }

    const now = Date.now();
    for (const tower of ownTowers) {
      tower.offlineUntil = Math.max(tower.offlineUntil, now + ATAKAN_ULTIMATE_EXHAUSTION_MS);
    }

    if (repairNexus) {
      report.heal = 0;
    }
    if (droneIds.size === 0) {
      this.finishUltimateReport(report);
      return;
    }
    report.droneIds = droneIds;
    this.openUltimateReports.push(report);
  }

  private spawnAtakanDrone(tower: TowerModel, repairNexus: boolean, damage: number) {
    const target = repairNexus ? undefined : this.findNearestEnemy(tower.x, tower.y);
    if (!repairNexus && !target) {
      return undefined;
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
    return id;
  }

  private getAtakanDroneDamage(ownerId: string) {
    return Math.max(1, Math.round(ATAKAN_ULTIMATE_DRONE_DAMAGE * this.getUltimatePowerMultiplierFor(ownerId)));
  }

  /** Oyuncunun aldigi ulti gucu kademelerinin hasar carpani. */
  private getUltimatePowerMultiplierFor(ownerId: string) {
    const player = this.state.players.get(ownerId);
    return getUltimatePowerMultiplier(player?.ultimatePower ?? 0)
      * getModifierMultiplier(player?.runModifiers ?? [], "ultimateDamage");
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

  /**
   * Dizilim gruplarini yeniden cozer ve kulelere yazar.
   *
   * Kural paylasilan pakette (`resolveZeynepFormations`): istemci yerlestirme
   * onizlemesinde ayni fonksiyonu cagiriyor, iki kopya ayrisamasin diye.
   * Gruba yalnizca dizilime katilabilen Zeynep yapilari giriyor; Abarti ve
   * zeynep-7 orada eleniyor, burada ayrica ad yazmaya gerek yok.
   */
  private refreshZeynepFormations() {
    const groups = resolveZeynepFormations(this.towers.values(), getMapGridSize(this.activeMap));
    for (const group of groups) {
      for (const member of group.members) {
        member.zeynepFormationSize = group.size;
        member.zeynepFormationLevel = group.level;
        member.formationReason = group.valid
          ? `Dizilim ${group.size}: en düşük seviye ${group.level} (${group.members.filter((entry) => entry.level === group.level).map((entry) => entry.definition.name).join(", ")})`
          : `Dizilim yok: ${group.members.length} bağlı kule; geçerli ikili veya üçlü yerleşim gerekiyor`;
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
      canHitAir: this.canTowerHitAir(tower),
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

    return this.canTowerHitAir(tower);
  }

  /**
   * Kule havadaki dusmani hedefleyebilir mi: tanimi izin veriyorsa ya da bir
   * kart veya esya kilidi actiysa.
   *
   * Hedef secimi, alan vuruslari (yorunge, vitrin, dalga, lanet, ofke) ve
   * kurulumdaki hava uyarisi ayni soruyu buradan soruyor. Yorunge bir donem
   * yalnizca tanima bakiyordu: Ucaksavar Kiti uyariyi kaldiriyor ama bicaklar
   * ucani yine geciyordu.
   */
  private canTowerHitAir(tower: TowerModel) {
    return Boolean(tower.definition.engine?.canHitAir) || this.towerHasUnlock(tower, "canHitAir");
  }

  /**
   * Oyuncunun ayakta, havayi vurabilen en az bir kulesi var mi.
   *
   * Yalnizca gercekten vuran yapi sayiliyor. Ucaksavar Kiti genel kapsamli
   * ve duvara, tamir merkezine ya da Sunucu'ya da takilabiliyor; onlar hic
   * ates etmedigi halde uyari kalkiyordu. Sunucu `canTowerHoldTargetedCard`
   * olcutunden geciyor ama hic tetiklemiyor, ayrica eleniyor.
   */
  private playerHasAirDefense(playerId: string) {
    for (const tower of this.towers.values()) {
      if (tower.ownerId !== playerId || tower.hp <= 0) continue;
      if (!canTowerHoldTargetedCard(tower.definition) || tower.definition.id === "warrior-2") continue;
      if (this.canTowerHitAir(tower)) return true;
    }
    return false;
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

  /**
   * Vurus aninda eklenen ama dusmana bakmayan hasar bonuslari.
   *
   * Hepsi yalnizca kulenin kendisine bagli: takili esya, kolun konumu,
   * lojistik anahtari, onarim ve uyanma penceresi. Ayri bir yerde duruyorlar
   * cunku `getTowerDamage` bunlari icermiyor ve onizleme de ayni sayiyi
   * okumak zorunda -- Kan Bankasi bir donem onizlemede "36 -> 36" gorunuyordu,
   * oysa her vurusa +%20 ekliyordu. Dusmana bagli olanlar (hava, kalkan, tur,
   * yavaslatilmis hedef) kosullu oldugu icin `damageEnemy` icinde kaliyor.
   */
  private getTowerHitDamageAdd(tower: TowerModel, now = Date.now()) {
    let add = 0;
    if ((tower.ammoPayloadShots ?? 0) > 0 && (tower.ammoPayloadUntil ?? 0) > now) add += 0.25;
    add += this.getWorkerBoostDamageAdd(tower, now);
    if (this.towerHasUnlock(tower, "bloodBank")) add += 0.2;
    // Rolanti odulu: kolu asagida tutmak da bir karar olsun. Kolun ust
    // yarisi zaten atis hizi veriyor; alt yarinin tek karsiligi dusuk isi
    // ve enerjiydi, yani secim degil fedakarlikti.
    if (this.towerHasUnlock(tower, "performance:idleEdge") && isTowerPerformanceIdle(tower.performance)) {
      add += PERFORMANCE_IDLE_EDGE_DAMAGE;
    }
    // Tamir Atesi: onarim penceresi acikken hasar. Odulu "hasar almis"
    // olmaya degil **onariliyor** olmaya baglamak kasitli -- birincisi
    // oyuncunun kacinmaya calistigi bir durum, ikincisi verdigi bir karar.
    if (this.towerHasUnlock(tower, "repair:damageBoost") && this.isTowerUnderRepair(tower)) {
      add += REPAIR_DAMAGE_BONUS;
    }
    // Soguk kalkis: bekleme modundan cikan kulenin ilk saniyeleri.
    //
    // Ayri bir zaman damgasi tutulmuyor -- `wakeReadyAt` zaten uyanma anini
    // tasiyor ve bir sonraki beklemeye kadar orada duruyor. Sifir olmasi
    // kulenin o an beklemede oldugu anlamina geliyor, o yuzden pencere
    // yalnizca pozitif degerde aciliyor.
    if (this.towerHasUnlock(tower, "tower:coldStart") && tower.wakeReadyAt > 0 && now < tower.wakeReadyAt + COLD_START_WINDOW_MS) {
      add += COLD_START_DAMAGE;
    }
    // Kendi kendine yeten: lojistigi kapatmak bir karar olsun. Anahtarin bir
    // tarafi hicbir sey vermiyorsa o anahtar bir karar degil, bir sustur.
    if (this.towerHasUnlock(tower, "logistics:selfSufficient") && !tower.ammoLogisticsEnabled) {
      add += SELF_SUFFICIENT_DAMAGE;
    }
    return add;
  }

  /**
   * Hukmedilen dusman (Melis'in zorbasi) yalnizca zorbanin kendisinden ve
   * durum tiklerinden hasar alir. Kapi tek yerde: ulti karnesindeki "en iyi
   * sutun" da bagisik dusmani ayni kuralla disarida birakmali.
   */
  private isEnemyDominatedAgainst(enemy: EnemyModel, sourceDefinitionId: string, now: number) {
    return enemy.dominatedUntil > now && sourceDefinitionId !== "archer-skill-bully" && !sourceDefinitionId.startsWith("status:");
  }

  private damageEnemy(enemy: EnemyModel, damage: number, slowMs: number, sourceDefinitionId = "", sourceOwnerId = "", damageType: DamageType = "true", maxHealthDamageRatio = 0, sourceTowerLevel = 1, sourceTowerId = "", hitType?: HitType, luckMultiplier?: number) {
    if (!this.enemies.has(enemy.id)) {
      return false;
    }

    if (this.isEnemyDominatedAgainst(enemy, sourceDefinitionId, Date.now())) {
      return false;
    }

    this.perfCounters.damageEvents += 1;
    this.landedHitCount += 1;
    const now = Date.now();
    if (sourceTowerId && hitType) this.applyWorkerHitBoosts(sourceTowerId, enemy, now);
    if (this.isEnemyInProjectileGuidance(enemy, now)) {
      this.setEnemyMark(enemy, "guidance", PROJECTILE_GUIDANCE_DAMAGE_MULTIPLIER - 1, now + 100);
    }
    // Takip isareti Atakan'in izci kulesini buyutmez: isaretin kendi katkisi
    // warrior-1 vuruslarinda sifirlanir. Isaret yine de etkin sayilir, cunku
    // kart ve esya bonusu "isaretli dusmana" diyor ve dusman isaretli; aksi
    // halde Komuta Modulu izci kulesinde neredeyse hic calismazdi.
    const ownTrackingMark = sourceDefinitionId === "warrior-1" && enemy.activeMarkId === "tracking";
    const activeMark = {
      id: enemy.activeMarkId, add: ownTrackingMark ? 0 : enemy.activeMarkAdd, expiresAt: enemy.activeMarkUntil
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
    if (enemy.type === "grunt") shopDamageAdd += getModifierAdd(damageModifiers, "damageVsGrunt");
    if (enemy.type === "runner") shopDamageAdd += getModifierAdd(damageModifiers, "damageVsRunner");
    if (enemy.type === "shooter") shopDamageAdd += getModifierAdd(damageModifiers, "damageVsShooter");
    if (enemy.type === "siege") shopDamageAdd += getModifierAdd(damageModifiers, "damageVsSiege");
    if (this.towerHasUnlock(damageSourceTower, "status:chill") && getTowerStatusOutcomes(enemy.statusEffects, now).speedMultiplier < 1) shopDamageAdd += 0.2;
    if (damageSourceTower) shopDamageAdd += this.getTowerHitDamageAdd(damageSourceTower, now);
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
    // Kirilgan Buz: donmus hedefe nisan almak kolay.
    //
    // Yalnizca gercekten donmus olana bakiyor -- sersemleme, korku ve
    // baglanma sayilmiyor. Kart bir donem hepsini sayiyordu; kapsam
    // bilerek daraltildi.
    const frozenCritChance = damageSourceTower
      && this.towerHasUnlock(damageSourceTower, "crit:vsFrozen")
      && isStatusEffectActive(enemy.statusEffects.freeze, now)
      ? FROZEN_CRIT_CHANCE
      : 0;
    // Av Izi: isaret baska bir kaynaktan geldiginde sayiliyor -- baska bir
    // Takipci (takim arkadasininki dahil), Melis'in yeralti isareti, gudum.
    // Isaret gucunun okundugu ayni `activeMark`. Kulenin kendi koydugu takip
    // isareti sayilmiyor: Takipci vurdugu her hedefi isaretledigi icin aksi
    // halde kosul onun icin kosulsuz bir +%20 olurdu.
    const ownMarkOnly = activeMark.id === "tracking" && enemy.trackingSourceTowerId === damageSourceTower?.id;
    const markedCritChance = damageSourceTower
      && activeMark.id && activeMark.expiresAt > now && !ownMarkOnly
      && this.towerHasUnlock(damageSourceTower, "crit:vsMarked")
      ? MARKED_CRIT_CHANCE
      : 0;
    const critChance = canCrit
      ? Math.max(0, TOWER_BASE_CRITICAL_CHANCE + (critical?.baseChance ?? 0) + conditionalCritChance + coldCritChance + frozenCritChance + markedCritChance
        + (damageSourceTower ? this.getTowerOwnConditionalCritChance(damageSourceTower, enemy) : 0) + getModifierAdd(damageModifiers, "critChance"))
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
      },
      {
        resistancePierce: getModifierAdd(damageModifiers, "resistancePierce"),
        weaknessBonus: getModifierAdd(damageModifiers, "weaknessBonus")
      }
    );
    // Same hit, resistance, shield and critical roll, with only the tracking mark removed.
    // This is a subset of the attacker's damage, never an additional damage total.
    const assistTower = activeMark.id === "tracking" && !ownTrackingMark && markMultiplier > 1 && enemy.trackingSourceTowerId
      ? this.towers.get(enemy.trackingSourceTowerId) : undefined;
    if (assistTower && !this.setupPhase) {
      const withoutMark = calculateDamageTaken(
        { amount: damage * Math.max(0, 1 + shopDamageAdd + critAdd), damageType, hitType },
        { armor: enemy.armor, shield: enemy.shield, damageResistances: enemy.damageResistances, hitTypeResistances: enemy.hitTypeResistances },
        { resistancePierce: getModifierAdd(damageModifiers, "resistancePierce"), weaknessBonus: getModifierAdd(damageModifiers, "weaknessBonus") }
      );
      const actual = result.shieldDamage + Math.min(enemy.hp, result.hpDamage + (result.remainingShield <= 0 ? enemy.maxHp * maxHealthDamageRatio : 0));
      const baseline = withoutMark.shieldDamage + Math.min(enemy.hp, withoutMark.hpDamage + (withoutMark.remainingShield <= 0 ? enemy.maxHp * maxHealthDamageRatio : 0));
      this.getDefenseRow(assistTower).markAssistDamage += Math.max(0, actual - baseline);
    }
    enemy.shield = result.remainingShield;
    let hpDamage = result.hpDamage;
    if (maxHealthDamageRatio > 0 && enemy.shield <= 0) {
      hpDamage += enemy.maxHp * maxHealthDamageRatio;
    }
    const dealtAmount = result.shieldDamage + Math.min(enemy.hp, hpDamage);
    // Oldurucu vurusta canin ustune tasan hasar (Artik Enerji Toplayici).
    // Vurus basina dusmanin azami caniyla sinirli: tek dev vurus zayif bir
    // hedefte dalga tavanini doldurmasin. Yapay hasarli oldurmeler (Oluler
    // Bagi'nin infazi: "can + kalkan + azami can + 1") tasan hasar sayilmiyor.
    const overkill = isSyntheticKillSource(sourceDefinitionId)
      ? 0
      : Math.min(enemy.maxHp, Math.max(0, hpDamage - Math.max(0, enemy.hp)));
    enemy.hp -= hpDamage;
    this.recordTowerDamage(sourceTowerId, dealtAmount, now);
    // Savas Tazminati: kulenin bu dalga verdigi hasar; dalga sonunda okunup
    // sifirlaniyor. Cani zaten bitmis hedefe vurus eksi sayilmasin.
    if (damageSourceTower && dealtAmount > 0) damageSourceTower.waveDamageDealt = (damageSourceTower.waveDamageDealt ?? 0) + dealtAmount;
    // Yanik ve kanama tikleri kulenin carpanlarini tasimiyor; pay yalnizca vuruslarda.
    if (!sourceDefinitionId.startsWith("status:")) this.recordSynergyShare(sourceTowerId, dealtAmount);
    // Oyuncunun kosu hasari yalnizca kuleler degil: yetenek ve ulti de onun.
    if (damagePlayer) this.runLedger.recordPlayerDamage(damagePlayer.slot ?? 0, dealtAmount);
    // Yapay oldurmede (infaz) hasar isaretten gelmiyor: isaretli hedefte bile
    // "isaret" payi sisirilmesin.
    this.recordEffectDamage(sourceDefinitionId, dealtAmount, {
      critAdd,
      shopDamageAdd,
      markMultiplier: isSyntheticKillSource(sourceDefinitionId) ? 1 : markMultiplier
    });
    // Kritik ve son vurus burada biliniyor, istemcide bilinemiyor: sayinin
    // kendisi ikisini de anlatmiyor (son vurusta kalan can kadar).
    //
    // Sans carpani mermide atistaki zardan geliyor (mermi ucarken kule yeniden
    // zar atabiliyor). Mermisiz vurusta `prepareOnurGamblerShot` hemen once
    // kostugu icin kulenin son zari bu vurusun zari.
    const luck = luckMultiplier
      ?? (damageSourceTower?.characterId === "onur" ? damageSourceTower.lastLuckMultiplier : undefined);
    const pendingOrbitHit = this.pendingOrbitHit;
    const orbit = Boolean(pendingOrbitHit
      && pendingOrbitHit.towerId === sourceTowerId
      && pendingOrbitHit.enemyId === enemy.id
      && !sourceDefinitionId.startsWith("status:"));
    if (orbit) this.pendingOrbitHit = undefined;
    this.addDamageEvent(enemy, dealtAmount, { crit: critAdd > 0, killingBlow: enemy.hp <= 0, ownerId: sourceOwnerId, luck, orbit });
    // Co-op asisti oldurucu vurusun kendi yazimlarindan once okunuyor: asagidaki
    // takip, isaret ve yavaslatma yazimlari kaynagi oldurenle degistiriyor ve
    // takim arkadasinin yavaslatma / isaret asistini siliyordu. Oyuna etkisi yok.
    const killAssists = enemy.hp <= 0 && sourceOwnerId
      ? this.resolveEnemyKillAssists(enemy, sourceOwnerId, sourceTowerId, sourceDefinitionId, now)
      : undefined;
    const markSourceTower = sourceTowerId ? this.towers.get(sourceTowerId) : undefined;
    if (sourceDefinitionId === "warrior-1") {
      const duration = applyStatusResistance(6500, enemy.statusResistances.tracking);
      this.applyTrackingStacks(enemy, now + scaleGameDuration(duration), this.getTrackingStackLimit(sourceTowerLevel));
      enemy.trackingSourceTowerId = sourceTowerId;
    }
    const mark = markSourceTower?.definition.engine?.appliesMark;
    if (mark) {
      // Kaynak yalnizca co-op asisti icin yaziliyor; isaretin gucunu degistirmiyor.
      this.applyEnemyStatusEffect(enemy, { type: "mark", magnitude: mark.damageMultiplier, durationMs: mark.durationMs, stacking: "refresh" }, now, {
        sourceTowerId: markSourceTower?.id,
        sourceOwnerId: markSourceTower?.ownerId
      });
    }
    if (slowMs > 0) {
      const sourceTower = sourceTowerId ? this.towers.get(sourceTowerId) : undefined;
      const modifiers = sourceTower ? this.getTowerRunModifiers(sourceTower) : [];
      // Kule vurusunun yavaslatma gucu kulenin tanimindan: Izolasyon seviyeyle
      // (%10 -> %50), otekiler duz %52. Kule satildiysa mermi tanimi ve
      // seviyesiyle; kulesiz kaynaklar (yetenek, ulti) duz.
      const slowDefinition = (sourceTower ? this.getTowerEngine(sourceTower) : sourceTowerId ? this.findTowerDefinitionById(sourceDefinitionId)?.engine : undefined)
        ?.statusEffects?.find((effect) => effect.type === "slow");
      const slowFraction = this.rollTowerSlowFraction(sourceTower, slowDefinition, sourceTower?.level ?? sourceTowerLevel, enemy);
      this.applyEnemyStatusEffect(enemy, {
        type: "slow",
        magnitude: 0.52,
        durationMs: slowMs,
        stacking: "refresh"
      }, now, {
        durationMs: slowMs * getModifierMultiplier(modifiers, "statusDuration"),
        magnitude: 0.52 * getModifierMultiplier(modifiers, "statusMagnitude"),
        slowFraction,
        // Kaynak co-op asisti ve yavaslatma kaydinin anahtari icin.
        sourceTowerId: sourceTower?.id,
        sourceOwnerId: sourceOwnerId || sourceTower?.ownerId
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
      // Vurus yapan kule icin burasi: patlamanin ve delmenin degdigi her
      // dusman ayri ayri buradan geciyor, yani kart "vuruslarin ve varsa
      // patlama etkilerinin" hepsini kapsiyor.
      if (sourceTower && this.towerHasUnlock(sourceTower, "status:coolantSlow")) {
        this.applyCoolantSlow(sourceTower, enemy, now);
      }
    }

    if (this.openUltimateReports.length > 0) {
      this.tallyTimedUltimateHit(enemy, sourceDefinitionId, damageSourceTower, enemy.hp <= 0, now);
    }

    if (enemy.hp > 0) {
      return false;
    }

    if (sourceDefinitionId !== "archer-4-underworld-execute") {
      this.resolveMelisUnderworldLinkedDeath(enemy, now);
    }
    this.triggerMelisCurseDeathBurst(enemy, now);
    this.finishEnemyKill(enemy, { sourceOwnerId, sourceTowerId, sourceDefinitionId, now, killAssists, critKill: critAdd > 0, overkill });
    return true;
  }

  /**
   * Oldurmenin odul kuyrugu: dusmani siler, altin, deneyim, sayac, kule
   * tetikleri, itibar, oldurme olayi, ulti sarji ve sampiyon damgasi.
   *
   * `damageEnemy` disinda Melis'in cevrilmis sampiyonu da buradan oluyor:
   * sampiyon yerine gectigi dogumlarin butcesini tasiyor ve sessizce silinmesi
   * o butceyi dalgadan dusururdu.
   */
  private finishEnemyKill(enemy: EnemyModel, context: {
    sourceOwnerId: string;
    sourceTowerId: string;
    sourceDefinitionId: string;
    now: number;
    killAssists?: KillAssist[];
    /** Oldurucu vurus kritik miydi (`gold:critKill`). Durum tiki hicbir zaman. */
    critKill?: boolean;
    /** Oldurucu vurusta canin ustune tasan hasar (`overkillGold`). */
    overkill?: number;
  }) {
    const { sourceOwnerId, sourceTowerId, sourceDefinitionId, now, killAssists } = context;
    const damagePlayer = this.state.players.get(sourceOwnerId);
    // Sampiyon yerine gectigi dogumlar kadar oldurme sayiliyor: seri, kule
    // yiginlari ve ulti sarji (dalganin toplami ayni kalsin). Oldurme sayaci,
    // defter ve mermi dusurme sansi dusman basina.
    const killUnits = enemy.champion?.replaced ?? enemy.special?.budget?.replaced ?? 1;
    this.enemies.delete(enemy.id);
    this.applyMelisFocusLastHitBuff(sourceTowerId, now);
    let ownerGold = this.awardEnemyGold(enemy, sourceOwnerId);
    // Kritik oldurme primi oldurme olayinin "+N"ine de giriyor: oyuncu
    // kazandigini oldugu yerde goruyor.
    if (context.critKill && sourceOwnerId) {
      ownerGold += this.awardCritKillGold(sourceTowerId ? this.towers.get(sourceTowerId) : undefined, sourceOwnerId);
    }
    // Oldurme primleri: olduren kulenin sahibine; sampiyon primi esyasi olan herkese.
    const killerTower = sourceTowerId ? this.towers.get(sourceTowerId) : undefined;
    // Prim her zaman kulenin sahibine (`awardTowerBountyGold`); oldurme
    // olayinin "+N"ine yalnizca olduren ayni oyuncuysa ekleniyor (cevrilmis,
    // olumsuz ya da lanetli dusmanin oldurmesi eski bir kimlikle gelebilir).
    if (killerTower) {
      const bounty = this.awardKillBountyGold(killerTower, enemy, context.overkill ?? 0, now, sourceDefinitionId);
      if (killerTower.ownerId === sourceOwnerId) ownerGold += bounty;
    }
    if (enemy.champion) {
      const gains = this.awardChampionBountyGold();
      ownerGold += gains.get(sourceOwnerId) ?? 0;
    }
    if (sourceOwnerId) ownerGold += this.awardPlayerKillBountyGold(sourceOwnerId, enemy, sourceDefinitionId);
    this.awardEnemyExperience(enemy, sourceTowerId ? this.towers.get(sourceTowerId) : undefined);
    this.kills += 1;
    if (killerTower) killerTower.killCount = (killerTower.killCount ?? 0) + 1;
    this.runLedger.recordKill(damagePlayer ? damagePlayer.slot ?? 0 : undefined);
    // Supurmenin kendi oldurmesi: suren supurmede o kulenin vurusu (durum tiki degil).
    const sweepRun = sourceTowerId && !sourceDefinitionId.startsWith("status:") ? this.debugSweepRuns.get(sourceTowerId) : undefined;
    if (sweepRun) sweepRun.kills += 1;
    if (sourceOwnerId && (enemy.type === "brute" || enemy.type === "siege")) {
      const recycleRadius = getMapGridSize(this.activeMap) * 3;
      const factory = Array.from(this.towers.values()).find((candidate) => candidate.ownerId === sourceOwnerId
        && candidate.definition.resourceProvider === "ammunition" && candidate.hp > 0
        && candidate.ammoRecyclingClaimedWave !== this.wave
        && this.hasWorkerSkillForOwner(sourceOwnerId, "ammoCollector", "ammo-recycling")
        && distanceSq(candidate.x, candidate.y, enemy.x, enemy.y) <= recycleRadius * recycleRadius);
      if (factory) {
        factory.ammoRecyclingClaimedWave = this.wave;
        factory.rawAmmo = Math.min(factory.maxRawAmmo, factory.rawAmmo + 6);
      }
    }
    const sourceTower = sourceTowerId ? this.towers.get(sourceTowerId) : undefined;
    if (sourceTower) {
      for (let unit = 0; unit < killUnits; unit += 1) this.applyTowerStacksForTrigger(sourceTower, "kill", now, enemy.id);
      if (this.towerHasUnlock(sourceTower, "stack:kill")) sourceTower.shopKillStacks = Math.min(15, sourceTower.shopKillStacks + killUnits);
      if (this.towerHasUnlock(sourceTower, "ammoDrop") && Math.random() < 0.2) sourceTower.ammo = Math.min(sourceTower.maxAmmo, sourceTower.ammo + 4);
      if (this.towerHasUnlock(sourceTower, "aim:killSnap")) sourceTower.killSnapUntil = now + KILL_SNAP_DURATION_MS;
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
        // Sampiyonun itibari yerine gectigi dogumlarin turlerinden beklenen toplam.
        this.awardZeynepReputation(player, enemy.champion?.reputation ?? enemy.special?.budget?.reputation ?? getEnemyZeynepReputationGain(enemy.type));
      }
      const assists = killAssists ?? this.resolveEnemyKillAssists(enemy, sourceOwnerId, sourceTowerId, sourceDefinitionId, now);
      for (const assist of assists) this.runLedger.recordAssist(assist.slot, assist.kind);
      this.addKillEvent(sourceOwnerId, enemy.id, ownerGold, assists, killUnits);
    }
    for (const player of this.state.players.values()) {
      player.ultimateCharge = Math.min(100, player.ultimateCharge + this.getUltimateChargeGain(player, 7 * killUnits));
    }
    if (enemy.champion) this.announceChampionDown(enemy, now);
  }

  /**
   * Sampiyon devrildi: dogumdan olume oyun suresi ve bir oncekinin suresi,
   * bir kez. Oldurme kredisi ve asistler normal oldurme olayinda; bu mesaj
   * yalnizca "guc buyudu mu" sorusunun cevabi.
   */
  private announceChampionDown(enemy: EnemyModel, now: number) {
    if (!enemy.champion) return;
    const ms = Math.max(0, Math.round((now - enemy.champion.spawnedAt) * GAME_SPEED_MULTIPLIER));
    const message: ChampionDownMessage = {
      enemyId: enemy.id,
      ms,
      x: roundNetworkNumber(enemy.x),
      y: roundNetworkNumber(enemy.y)
    };
    if (this.lastChampionKillMs !== undefined) message.prevMs = this.lastChampionKillMs;
    this.lastChampionKillMs = ms;
    this.broadcast("champion:down", message);
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
    // Kule silinse de defterde kaliyor: MVP butun kosunun toplami.
    this.runLedger.recordTowerDamage(tower, this.getPlayerSlot(tower.ownerId), amount);
    if (!this.setupPhase) this.getDefenseRow(tower).damage += amount;
    tower.damageWindow.push({ dealtAt: now, amount });
    this.pruneTowerDamageWindow(tower, now);
    this.absorbMelisBrokenMirrorDamage(tower, amount, now);
  }

  /**
   * Vurusun yerlesim kararina dusen tahmini payi (yalnizlik ya da dizilim).
   *
   * Bonus vurus aninda aciksa sayiliyor: yalnizlik kulenin su an yalniz durup
   * durmadigina, dizilim kulenin bu tick'teki dizilim durumuna bakiyor
   * (`refreshZeynepFormations`). Formul ve sinirlari `estimateSynergyShare`ta;
   * "dealt" hasar sayilariyla ayni, asiri oldurme disarida. Kurulumda hasar
   * sayilmiyor (savunma ozetiyle ayni kural).
   */
  private recordSynergyShare(towerId: string, dealt: number) {
    if (this.setupPhase || !towerId || !(dealt > 0)) {
      return;
    }
    const tower = this.towers.get(towerId);
    if (!tower) {
      return;
    }
    // Asiri yukleme supurmesi de normal lazerin araligiyla atiyor (atis hizi
    // carpanlari dahil), yani pay her iki eksenden.
    const isolation = receivesAtakanIsolationBonus(tower)
      ? getAtakanIsolationShare(dealt, this.isTowerIsolatedForShare(tower))
      : 0;
    const formation = tower.zeynepFormationSize > 0 ? getZeynepFormationShare(dealt, tower) : 0;
    if (isolation <= 0 && formation <= 0) {
      return;
    }
    if (this.synergyShareWave !== this.wave) {
      this.synergyShares.clear();
      this.synergyShareWave = this.wave;
    }
    let entry = this.synergyShares.get(tower.ownerId);
    if (!entry) {
      entry = { isolation: 0, formation: 0 };
      this.synergyShares.set(tower.ownerId, entry);
    }
    entry.isolation += isolation;
    entry.formation += formation;
    const slot = this.getPlayerSlot(tower.ownerId);
    if (isolation > 0) this.runLedger.recordSynergyShare(slot, "isolation", isolation);
    if (formation > 0) this.runLedger.recordSynergyShare(slot, "formation", formation);
  }

  /** `getAtakanPassiveMultiplier(tower) > 1`, tick icinde kule basina bir kez. */
  private isTowerIsolatedForShare(tower: TowerModel) {
    const cache = this.synergyIsolationCache;
    const cached = cache?.get(tower.id);
    if (cached !== undefined) return cached;
    const isolated = this.getAtakanPassiveMultiplier(tower) > 1;
    cache?.set(tower.id, isolated);
    return isolated;
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
      tier: this.getBeamTier(tower.id),
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

  /** `baseGain` tur kazanci (`getEnemyZeynepReputationGain`) ya da sampiyonun toplami. */
  private awardZeynepReputation(player: Player, baseGain: number) {
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

  /**
   * Co-op asisti: oldurme aninda dusmanin uzerindeki, oldurenden farkli
   * oyunculara ait katkilar.
   *
   * Yalnizca zaten tutulan veriye bakiyor: Takipci'nin isareti (yigin suresi
   * ve koyan kule), isaret durumu, acik Zeynep komutu, donma / yavaslatma /
   * soguma durumunun kaynagi. Hicbiri oyuna geri donmuyor; altin, XP ve ulti
   * sarji eskisi gibi oldurene ve herkese.
   *
   * Hiz ve menzil komutu kuleyi buyutuyor, yani yalnizca kulenin kendi
   * vurusuyla gelen oldurmede asist (durum tiki komuttan buyumuyor).
   * Yavaslatma komutu dusmani tutuyor; her oldurmede asist.
   *
   * Soloda hic calismiyor: tek oyuncu kendine asist yapamaz, hesap da
   * yapilmasin.
   */
  private resolveEnemyKillAssists(enemy: EnemyModel, killerId: string, sourceTowerId: string, sourceDefinitionId: string, now: number): KillAssist[] {
    if (this.state.players.size < 2) return [];
    const killerSlot = this.getPlayerSlot(killerId);
    if (killerSlot === undefined) return [];
    const candidates: KillAssistCandidate[] = [];
    // Yigin sayisi, ilk yuva degil: isaret tuketen kule (warrior-5) once en
    // erken biten yuvayi -- cogunlukla 0'i -- siliyor, kalan yiginlar suruyor.
    if (enemy.trackingSourceTowerId && this.getTrackingStackCount(enemy, now) > 0) {
      const tracker = this.towers.get(enemy.trackingSourceTowerId);
      if (tracker) candidates.push({ slot: this.getPlayerSlot(tracker.ownerId), kind: "mark" });
    }
    const mark = enemy.statusEffects.mark;
    if (isStatusEffectActive(mark, now) && mark?.sourceOwnerId) {
      candidates.push({ slot: this.getPlayerSlot(mark.sourceOwnerId), kind: "mark" });
    }
    const towerKill = Boolean(sourceTowerId) && !sourceDefinitionId.startsWith("status:");
    if (towerKill && this.zeynepHasteUntil > now && this.zeynepHasteOwnerId) {
      candidates.push({ slot: this.getPlayerSlot(this.zeynepHasteOwnerId), kind: "command" });
    }
    if (towerKill && this.zeynepRangeUntil > now && this.zeynepRangeOwnerId) {
      candidates.push({ slot: this.getPlayerSlot(this.zeynepRangeOwnerId), kind: "command" });
    }
    if (this.zeynepSlowUntil > now && this.zeynepSlowOwnerId) {
      candidates.push({ slot: this.getPlayerSlot(this.zeynepSlowOwnerId), kind: "command" });
    }
    const freeze = enemy.statusEffects.freeze;
    if (isStatusEffectActive(freeze, now) && freeze?.sourceOwnerId) {
      candidates.push({ slot: this.getPlayerSlot(freeze.sourceOwnerId), kind: "freeze" });
    }
    // Yavaslatma asisti kaynak basina kayitlardan: ortak `slow` durumunun
    // tek bir sahibi var ve her yeni vurus onu eziyordu -- arkadasin
    // Izolasyon'u yavaslatip ardindan oldurenin Kin'i dokununca asist
    // kayboluyordu. Kayit kendi kaynagini ve bitisini biliyor.
    for (const key in enemy.slowSpeedFloors ?? {}) {
      const floor = enemy.slowSpeedFloors![key];
      if (floor.expiresAt > now && floor.ownerId && floor.speedMultiplier < 1) {
        candidates.push({ slot: this.getPlayerSlot(floor.ownerId), kind: "slow" });
      }
    }
    const chill = enemy.statusEffects.chill;
    if (isStatusEffectActive(chill, now) && chill?.sourceOwnerId) {
      candidates.push({ slot: this.getPlayerSlot(chill.sourceOwnerId), kind: "slow" });
    }
    if (enemy.coolantSlowUntil > now && enemy.coolantSlowOwnerId) {
      candidates.push({ slot: this.getPlayerSlot(enemy.coolantSlowOwnerId), kind: "slow" });
    }
    return resolveKillAssists(killerSlot, candidates);
  }

  private addKillEvent(ownerId: string, enemyId: string, ownerGold = 0, assists: readonly KillAssist[] = [], kills = 1) {
    const now = Date.now();
    const streakRule = this.recordPlayerKillStreak(ownerId, now, kills);
    if (streakRule) this.runLedger.recordStreak(this.getPlayerSlot(ownerId), streakRule.tier, this.wave);
    const id = `k${this.nextKillEventId++}`;
    // Tabana yuvarli tam sayi: HUD altini da tabana yuvarli ve hasar sayisi
    // gibi dunyadaki "+N" gercekte kazanilandan fazlasini soylememeli (21.6
    // "+22" degil "+21"). Tek baytlik tam sayi kesirli sayinin dokuz baytina karsi.
    const gold = Math.floor(ownerGold);
    this.killEvents.set(id, {
      id,
      ownerId,
      enemyId,
      serverTime: now,
      streakTier: streakRule?.tier,
      g: gold > 0 ? gold : undefined,
      a: encodeKillAssists(assists),
      ttlMs: 2200
    });

    if (this.killEvents.size > 80) {
      const oldestId = this.killEvents.keys().next().value;
      if (oldestId) {
        this.killEvents.delete(oldestId);
      }
    }
  }

  /** `kills`: bu andaki oldurme sayisi; sampiyon yerine gectigi dogumlar kadar sayiyor. */
  private recordPlayerKillStreak(ownerId: string, serverTime: number, kills = 1) {
    const killTimes = [...(this.playerKillStreakTimes.get(ownerId) ?? []), ...Array.from({ length: Math.max(1, Math.floor(kills)) }, () => serverTime)]
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

  private addDamageEvent(enemy: EnemyModel, amount: number, flags: { crit?: boolean; killingBlow?: boolean; ownerId?: string; luck?: number; orbit?: boolean } = {}) {
    if (amount <= 0) {
      return;
    }

    const id = `d${this.nextDamageEventId++}`;
    // Floating combat text must not claim more damage than was actually
    // applied. Rounding every hit up can accumulate into a visible total
    // larger than the enemy's real shield/HP loss.
    const shownAmount = Math.max(1, Math.floor(amount));
    const event: DamageEventModel = {
      id,
      x: enemy.x + (Math.random() - 0.5) * 14,
      y: enemy.y - 16 + (Math.random() - 0.5) * 8,
      amount: shownAmount,
      ttlMs: 900
    };
    // Varsayilanlar kayda hic yazilmiyor: telde anahtar olarak da gitmesinler
    // (bkz. `toDamageEventWire`).
    if (flags.crit) {
      event.c = 1;
    }
    if (flags.killingBlow) {
      event.k = 1;
    }
    const owner = flags.ownerId ? this.state.players.get(flags.ownerId) : undefined;
    const ownerSlot = owner ? owner.slot ?? 0 : DAMAGE_EVENT_NO_OWNER;
    if (ownerSlot !== 0) {
      event.o = ownerSlot;
    }
    // Boyut gosterilen sayidan: son vurusta kalan can kucukse sayi da kucuk
    // kaliyor; o vurusu isaretle ayirmak istemcinin isi, sayiyi buyutmek degil.
    const bucket = getDamageSizeBucket(shownAmount, enemy.maxHp + enemy.maxShield);
    if (bucket !== 0) {
      event.r = bucket;
    }
    // Jackpot yalnizca kritikte ve esigin ustundeki zarda; carpan onda bir
    // hassasiyetle tamsayi (1.9 -> 19), telde tek kucuk sayi.
    if (flags.crit && flags.luck !== undefined && flags.luck >= ONUR_JACKPOT_MIN_LUCK) {
      event.j = Math.round(flags.luck * 10);
    }
    // Bicak temasi: istemcinin kesme sesi. Kanama tiki tasimiyor.
    if (flags.orbit) {
      event.b = 1;
    }
    this.damageEvents.set(id, event);

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
      canHitAir: this.canTowerHitAir(tower)
    }, Array.from(this.enemies.values()), false);
    for (const enemy of targets) {
      this.perfCounters.aoeChecks += 1;
      this.applyMelisCurseLoad(enemy, tower.ownerId, tower.id, tower.melisEvolutionLevel, burstDamage, expiresAt);
    }

    this.beams.set(`melis-curse-${tower.id}`, {
      id: `melis-curse-${tower.id}`,
      definitionId: "archer-3-curse",
      tier: this.getBeamTier(tower.id),
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
      tier: this.getBeamTier(towerId),
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
        tier: this.getBeamTier(pool.towerId),
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
      tier: this.getBeamTier(enemy.melisWhisperTurnedSourceTowerId),
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
      this.removeMelisWhisperTurnedEnemy(enemy);
    }
  }

  /**
   * Cevrilmis dusmanin sonu. Normal dusman oldugu gibi siliniyor (cevrilen
   * dusman odul vermiyor, eski kural). Sampiyon ise yerine gectigi dogumlarin
   * butcesini tasiyor: odul kuyrugundan geciyor, kredi onu ceviren oyuncuya;
   * oyuncu ayrildiysa sahipsiz oldurme (altin ve deneyim yine herkese).
   */
  private removeMelisWhisperTurnedEnemy(enemy: EnemyModel) {
    if (!this.enemies.has(enemy.id)) return;
    if (!enemy.champion) {
      this.enemies.delete(enemy.id);
      return;
    }
    const ownerId = this.state.players.has(enemy.melisWhisperTurnedOwnerId) ? enemy.melisWhisperTurnedOwnerId : "";
    const towerId = this.towers.has(enemy.melisWhisperTurnedSourceTowerId) ? enemy.melisWhisperTurnedSourceTowerId : "";
    this.finishEnemyKill(enemy, { sourceOwnerId: ownerId, sourceTowerId: towerId, sourceDefinitionId: "archer-6-whisper-turned", now: Date.now() });
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
      tier: this.getBeamTier(enemy.melisWhisperTurnedSourceTowerId),
      x1: enemy.x,
      y1: enemy.y,
      x2: enemy.x,
      y2: enemy.y,
      width: radius * 2,
      color: 0xef4444,
      overdrive: false,
      ttlMs: 380
    });
    this.removeMelisWhisperTurnedEnemy(enemy);
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
      tier: this.getBeamTier(tower.id),
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
      // Dirilen dusman menzilini kaybeder: Melis'in ordusu oyuncunun
      // yapilarina degil, yoldaki dusmanlara duvar olsun diye var.
      attackRange: 0,
      towerAttackCooldownMs: 0,
      pathDistance,
      slowUntil: 0,
      freezeReadyAt: 0,
      coolantSlowUntil: 0,
      coolantSlowMultiplier: 1,
      auraSlowMultiplier: 1,
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
          tier: this.getBeamTier(enemy.melisUndeadSourceTowerId),
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
      tier: this.getBeamTier(tower.id),
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
      canHitAir: this.canTowerHitAir(tower)
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
      tier: this.getBeamTier(tower.id),
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
    const waveAirMode = getWaveAirMode(this.wave);
    // Hava uyarisi yalnizca kurulumda: oyuncunun kule kurup esya takarak
    // cevap verebildigi tek an o. Kurulumda `this.wave` siradaki dalga.
    const checkAirDefense = this.setupPhase && waveAirMode !== "none";
    return {
      serverTime: now,
      hostId: this.hostSessionId,
      players: Array.from(this.state.players.entries()).map(([id, player]) => ({
        id,
        name: player.name,
        characterId: player.characterId,
        // 0. yuva yazilmiyor; `slot: undefined` bile msgpack'te anahtar tasirdi.
        ...(player.slot > 0 ? { slot: player.slot } : {}),
        gold: Math.floor(player.gold),
        goldSpent: player.goldSpent,
        experience: Math.round(player.experience * 100) / 100,
        workerSkillIds: [...(player.workerSkillIds ?? [])],
        // Oyuncu kaydi her karede tam gidiyor; kartsiz oyuncu icin bos dizi
        // tasimanin karsiligi yok.
        ownedCardIds: player.ownedCardIds.length > 0 ? [...player.ownedCardIds] : undefined,
        ownedShopItemIds: [...player.ownedShopItemIds],
        inventoryItemIds: [...player.inventoryItemIds],
        // Kopya: delta tabani bu kaydi tutuyor; dizi bir gun yerinde
        // degisirse taban da degisir ve fark hic gorulmezdi.
        shopOffers: player.shopOffers ? [...player.shopOffers] : player.shopOffers,
        shopRerollPrice: Math.ceil(getShopRerollPrice(player.shopRerolls) * getModifierMultiplier(player.runModifiers, "shopRerollCost")),
        towersBuilt: player.towersBuilt,
        towerLimit: this.getPlayerTowerLimit(player),
        // Tabana: telde 100 "sunucu atisi kabul eder" demek. Yuvarlamada 99.5
        // hazir gorunuyor, hazir sesi caliyor ve atis sessizce reddediliyordu.
        // Sarj Math.min(100, ...) ile kirpildigi icin gercek esikte yine 100.
        ultimateCharge: Math.floor(player.ultimateCharge),
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
        // Derin kopya: `chooseWorkerSkill` beceri listesini yerinde buyutuyor.
        // Paylasilan dizi delta tabanini da buyutur, secim hic gonderilmezdi.
        hiredWorkers: player.hiredWorkers.map(toHiredWorkerWire),
        workerBannedCells: [...(this.workerBannedCells.get(id) ?? [])],
        // 1 ise yazilmiyor: indirimsiz oyunda her karede bir sayi
        // gondermenin karsiligi yok, okuyan taraf eksik alani 1 sayiyor.
        workerHireCostMultiplier: this.getWorkerHireCostMultiplier(player) === 1
          ? undefined
          : this.getWorkerHireCostMultiplier(player),
        noAirDefense: checkAirDefense && !this.playerHasAirDefense(id) ? true : undefined
      })),
      enemies: Array.from(this.enemies.values()).map((enemy) => stripWireDefaults({
        id: enemy.id,
        x: roundNetworkNumber(enemy.x),
        y: roundNetworkNumber(enemy.y),
        hp: roundNetworkNumber(Math.max(0, enemy.hp)),
        armor: enemy.armor,
        shield: roundNetworkNumber(Math.max(0, enemy.shield)),
        pathDistance: roundNetworkNumber(enemy.pathDistance),
        trackingStacks: this.getTrackingStackCount(enemy, now),
        isTracked: this.getTrackingStackCount(enemy, now) > 0,
        // Isareti koyan kule (Atakan imzasi `k`): istemci nisangahi kulenin
        // kademesinde ve sahibinin alfasinda ciziyor. Yalnizca isaret varken;
        // delta yuzunden yalnizca isaretleyen kule degisince telde.
        ...this.getTrackingSourceWire(enemy, now),
        isFeared: enemy.fearUntil > now,
        isArmorBroken: enemy.armorBrokenUntil > now,
        isDominated: enemy.dominatedUntil > now,
        isWhisperTurned: enemy.melisWhisperTurnedUntil > now,
        curseLoad: enemy.melisCurseUntil > now ? Math.round(enemy.melisCurseLoad) : 0,
        doubtStacks: enemy.melisDoubtUntil > now ? enemy.melisDoubtStacks : 0,
        isHesitating: enemy.melisDoubtHesitateUntil > now,
        isBleeding: isStatusEffectActive(enemy.statusEffects.bleed, now),
        isChilled: enemy.coolantSlowUntil > now,
        isFrozen: isStatusEffectActive(enemy.statusEffects.freeze, now),
        isUnderworldLinked: underworldLinkedEnemyIds.has(enemy.id),
        isUndead: enemy.melisUndeadUntil > now,
        // Yalnizca emerken: anahtar normal dusmanda hic yazilmiyor.
        ...(enemy.special?.drainId ? { drain: enemy.special.drainId } : {})
      })),
      towers: Array.from(this.towers.values()).map((tower) => stripWireDefaults({
        id: tower.id,
        facing: towerAims(tower.definition.id) ? Math.round(tower.facing * 1000) / 1000 : undefined,
        level: tower.level,
        // Onbellekten geliyorlar: cozumleme kart/esya degistiginde bir kez
        // kosuyor, her karede degil. Delta degismeyen kareleri atiyor.
        auraActive: tower.auraActive,
        repairCostMultiplier: this.getTowerRepairCostMultiplier(tower),
        sellRefundMultiplier: this.getTowerSellRefundMultiplier(tower),
        effectIntervalMs: usesEffectInterval(tower.definition)
          ? Math.round(this.getTowerEffectInterval(tower))
          : undefined,
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
        energyRelayUntil: tower.energyRelayUntil && tower.energyRelayUntil > now ? tower.energyRelayUntil : undefined,
        energyRelaySourceId: tower.energyRelaySourceId,
        energyLocalReserve: tower.energyLocalReserve ? Math.round(tower.energyLocalReserve * 10) / 10 : undefined,
        energyBridgeUntil: tower.energyBridgeUntil && tower.energyBridgeUntil > now ? tower.energyBridgeUntil : undefined,
        energyShedUntil: tower.energyShedUntil && tower.energyShedUntil > now ? tower.energyShedUntil : undefined,
        energyFrequencyUntil: tower.energyFrequencyUntil && tower.energyFrequencyUntil > now ? tower.energyFrequencyUntil : undefined,
        energyScenarioCharge: tower.energyScenarioCharge ? tower.energyScenarioCharge : undefined,
        energyConduitUntil: tower.energyConduitUntil && tower.energyConduitUntil > now ? tower.energyConduitUntil : undefined,
        energyConduitSourceId: tower.energyConduitSourceId,
        energyFreeUntil: tower.energyFreeUntil && tower.energyFreeUntil > now ? tower.energyFreeUntil : undefined,
        crystalReserve: tower.crystalReserve ? Math.round(tower.crystalReserve * 10) / 10 : undefined,
        crystalTrapUntil: undefined,
        ammoFactoryShield: tower.ammoFactoryShield ? Math.round(tower.ammoFactoryShield) : undefined,
        ammoRefinerUntil: tower.ammoRefinerUntil && tower.ammoRefinerUntil > now ? tower.ammoRefinerUntil : undefined,
        ammoPayloadUntil: tower.ammoPayloadUntil && tower.ammoPayloadUntil > now ? tower.ammoPayloadUntil : undefined,
        ammoPayloadKind: tower.ammoPayloadKind,
        ammoEmergencyShots: tower.ammoEmergencyShots ? tower.ammoEmergencyShots : undefined,
        ammoAssaultUntil: tower.ammoAssaultUntil && tower.ammoAssaultUntil > now ? tower.ammoAssaultUntil : undefined,
        ammoEvacuationUntil: tower.ammoEvacuationUntil && tower.ammoEvacuationUntil > now ? tower.ammoEvacuationUntil : undefined,
        repairFortificationUntil: tower.repairFortificationUntil && tower.repairFortificationUntil > now ? tower.repairFortificationUntil : undefined,
        repairFortificationHp: tower.repairFortificationHp ? Math.round(tower.repairFortificationHp) : undefined,
        repairBreachUntil: tower.repairBreachUntil && tower.repairBreachUntil > now ? tower.repairBreachUntil : undefined,
        ammoLogisticsEnabled: tower.ammoLogisticsEnabled,
        logisticsPriority: tower.logisticsPriority ?? "normal",
        insight: this.getTowerInsight(tower),
        gate: tower.gate,
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
        ...this.getAtakanStackWire(tower),
        serverLinkWaveAge: this.getServerLinkWaveAge(tower),
        linkedTowerIds: [...tower.linkedTowerIds],
        zeynepFormationSize: tower.zeynepFormationSize > 0 ? tower.zeynepFormationSize : undefined,
        zeynepFormationLevel: tower.zeynepFormationLevel > 0 ? tower.zeynepFormationLevel : undefined
        ,targetingMode: tower.definition.engine?.attack.executor === "orbit" ? undefined : tower.targetingMode
        ,equippedShopItemIds: tower.equippedShopItemIds.length > 0 ? [...tower.equippedShopItemIds] : undefined
        // Kopya sart: delta tabani bu kaydi tutuyor, dizi yerinde buyurse
        // karsilastirma degisikligi goremezdi. Bos liste `stripWireDefaults`
        // ile dusuyor; alan kayittan tumuyle ciktigi icin yaratici modda son
        // kart sokuldugunde delta istemciye `null` gonderebiliyor.
        ,targetedCardIds: [...tower.targetedCardIds]
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
        targetTowerId: drone.targetTowerId,
        repairing: drone.repairing,
        // Istemci iki kademeyi ancak buradan ayirt ediyor.
        advanced: drone.advanced,
        // Kopya: delta tabani diziyi paylasmasin (bkz. `hiredWorkers`).
        skillIds: drone.skillIds ? [...drone.skillIds] : undefined,
        hp: drone.hp === undefined ? undefined : Math.round(drone.hp),
        maxHp: drone.maxHp === undefined ? undefined : Math.round(this.getWorkerMaxHp(drone))
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
          ttlMs: Math.max(0, Math.round(beam.ttlMs)),
          // Kademe telde yoktu: `setBeam` onu isin nesnesine yaziyordu ama bu
          // liste alanlari tek tek saydigi icin sunucudan hic cikmiyordu. Sekiz
          // ayri yerde hesaplanan deger, hicbir isin kulesinde ekrana ulasmadi.
          tier: beam.tier,
          // Ayna isininin sekme koseleri: yalnizca sekme gorunurken, yoksa anahtar yok.
          ...(beam.b ? { b: beam.b } : {})
        })),
      damageEvents: Array.from(this.damageEvents.values()).map(toDamageEventWire),
      killEvents: Array.from(this.killEvents.values()).map(toKillEventWire),
      zeynepCommands: this.getZeynepCommandEffectsSnapshot(now),
      melisGothicNightmareActive: this.melisGothicNightmareUntil > now,
      result: this.matchResult,
      effectStats: this.getEffectStatsSnapshot(),
      setupPhase: this.setupPhase,
      setupSession: this.setupSession,
      // Yalnizca yaratici odada: `undefined` degerli anahtar msgpack'te yine
      // yaziliyor ve her snapshotta her istemciye ~12 bayt demek.
      ...(this.creativeMode ? { creative: true as const } : {}),
      stage: this.stage,
      // Yalnizca serit varken: 1. asamada ve seritsiz dalgada anahtar yok.
      ...(this.counterSurge ? { surges: [this.getCounterSurgeWire(now)!] } : {}),
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
        // Takim kaydi her karede tam gidiyor; ucansiz dalgada alanin yoklugu
        // bir sonraki karede eski degeri kendiliginden siliyor.
        waveEnemyCount: this.waveTarget,
        waveAirMode: waveAirMode === "none" ? undefined : waveAirMode,
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
      // Kulelere isleyen aurasi olmayan kaynak hicbir sey eklemez; aktif aura
      // suzgecini (tahsis + yalnizlik sorgusu) onun icin calistirmaya gerek yok.
      if (this.getTowerGrantState(source).hasTowerAura === false) continue;
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

  /**
   * Auranin tazeleme araligi.
   *
   * Saldiri hizi burada okunmuyor: bu bir atis degil, alanin kendini
   * tazelemesi. Performans kolu isliyor cunku o kolun anlami kulenin ne
   * kadar zorlandigi -- isi ve enerji karsiliginda daha sik tazeleme.
   */
  private getTowerAuraTickInterval(tower: TowerModel, auras = this.getActiveTowerAuras(tower), withHeat = true) {
    const baseInterval = Math.min(...auras.map((aura) => aura.tickIntervalMs ?? tower.definition.fireIntervalMs));
    return this.adjustIntervalForPerformanceAndHeat(tower, baseInterval, withHeat);
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
      * (1 + (this.getWorkerBoost(tower, "range")?.value ?? 0))
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
      // Carpani sifir olan kulelerin (neredeyse hepsi) sonucu menzilden
      // bagimsiz olarak 0; menzil hesabi pahali (aura ve modifier taramasi).
      return multiplier === 0 ? 0 : this.getTowerRange(tower) * multiplier;
    }
    const footprintRadius = this.scaleWorldDistance(TOWER_GRID_SIZE * getTowerGridSpan(tower.definition.id) / 2);
    if (multiplier === 0) return footprintRadius;
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

  private getTowerFireInterval(tower: TowerModel, withHeat = true) {
    if (tower.definition.engine?.fixedFireInterval) {
      return tower.definition.fireIntervalMs * this.getAmmoAssaultIntervalMultiplier(tower);
    }
    const interval = this.adjustIntervalForPerformanceAndHeat(tower, this.getTowerBaseFireInterval(tower), withHeat);
    // Etki araligi saldiri hizindan etkilenmez.
    //
    // Ritmi bir alan tazelemesi olan kulede "daha hizli atis" diye bir sey
    // yok; alan zaten surekli orada. Bolme burada kalsaydi Debug Lazer
    // kartla hizlanir, Izolasyon Kulesi'nin aurasi da 220 ms yerine 183 ms'de
    // tazelenirdi -- ikisi de kuralin disi.
    if (usesEffectInterval(tower.definition)) return interval;
    // Kart/esya ve yigin hiz bonuslari ayni toplamsal havuzdur. Karaktere
    // ozel atis dallarindan sonra uygulanir; hicbir dal bonusu atlayamaz.
    const stackSpeedAdd = 1 / this.getEngineStackStatMultiplier(tower, "fireRate") - 1;
    return interval / Math.max(0.01, 1 + getModifierAdd(this.getTowerRunModifiers(tower), "fireRate") + stackSpeedAdd)
      * this.getAmmoAssaultIntervalMultiplier(tower);
  }

  /** Saldiri Kervani ve isci agacinin atis hizi etkisi (Hizli/Serit Besleme). */
  private getAmmoAssaultIntervalMultiplier(tower: TowerModel) {
    const assault = (tower.ammoAssaultUntil ?? 0) > Date.now() ? 0.65 : 1;
    return assault / (1 + (this.getWorkerBoost(tower, "fireRate")?.value ?? 0));
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
    const stackMultiplier = this.getEngineStackStatMultiplier(tower, "fireIntervalReduction", now);
    const zeynepHasteMultiplier = this.zeynepHasteUntil > now ? 1 / this.zeynepHasteMultiplier : 1;
    const streakHasteMultiplier = this.getTowerStreakFireIntervalMultiplier(tower, now);
    const zeynepFormationMultiplier = getZeynepFormationFireIntervalMultiplier(tower);
    // Atis araligi carpanin **tersi**: menzil ve hasar 1,5 kat buyurken
    // aralik 1,5 kat kisaliyor. Ayri bir sayi olsaydi pasifin uc ekseni
    // birbirinden habersiz kayardi -- bir donem tam bu olmustu (1,12 ve 0,9).
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower) > 1 ? 1 / ATAKAN_ISOLATION_MULTIPLIER : 1;
    const melisNightmareHasteMultiplier = this.isMelisGothicNightmareActiveForTower(tower, now) ? 1 / MELIS_GOTHIC_NIGHTMARE_HASTE_MULTIPLIER : 1;
    const melisFocusKillHasteMultiplier = tower.characterId === "archer" && tower.melisFocusKillHasteUntil > now ? 1 / MELIS_FOCUS_KILL_HASTE_MULTIPLIER : 1;

    if (tower.definition.id === "warrior-5") {
      // Asiri yuklemede de ayni aralik: kiris normal lazerin ritminde vuruyor.
      return getDebugLaserFireInterval(tower.level) * zeynepHasteMultiplier * zeynepFormationMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier;
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
      return Math.max(80, baseInterval * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier);
    }

    if (tower.definition.hitType === "impact") {
      return Math.max(80, tower.definition.fireIntervalMs * stackMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier);
    }

    if (tower.definition.id === "warrior-1") {
      return getTrackerFireInterval(tower.level) * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier;
    }

    if (tower.definition.id === "zeynep-1") {
      return getZeynepHizaFireInterval(tower.level) * stackMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier;
    }

    if (tower.definition.id === "zeynep-6") {
      return getKinFireInterval(tower.level) * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier;
    }

    const levelMultiplier = getTowerLevelIntervalMultiplier(tower.definition.id, tower.level);
    const minimumInterval = 80;
    return Math.max(minimumInterval, tower.definition.fireIntervalMs * levelMultiplier * stackMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier * melisNightmareHasteMultiplier * melisFocusKillHasteMultiplier);
  }

  private isMelisGothicNightmareActiveForTower(tower: TowerModel, now = Date.now()) {
    return tower.characterId === "archer" && (this.melisGothicNightmareOwnerUntil.get(tower.ownerId) ?? 0) > now;
  }

  /** `debugOverdrive`: Debug Lazer asiri yukleme carpaniyla (saat bitisi gecmis olsa da). */
  private getTowerDamage(tower: TowerModel, debugOverdrive = false) {
    return resolveModifierBreakdown(this.getTowerDamageBreakdown(tower, debugOverdrive));
  }

  private getTowerDamageBreakdown(tower: TowerModel, debugOverdrive = false): ModifierBreakdown {
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
      add("tower:warrior-5:debug", getDebugLaserDamageMultiplier(tower.level, debugOverdrive || tower.debugOverdriveUntil > now));
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
    // Kart/esya bonuslari kendi aralarinda toplanir, karakter ve motor
    // etkileriyle cozulmus hasari carpar. Her kaynak yalnizca bir kez sayilir;
    // takili esyanin scope alani player olsa da liste zaten kuleyi icerir.
    const damageMultiplier = getModifierMultiplier(breakdown.mods, "damage", {});
    breakdown.mods.push(...this.getTowerRunModifiers(tower)
      .filter((modifier) => modifier.stat === "damage")
      .map((modifier) => ({ ...modifier, add: modifier.add * damageMultiplier })));
    return breakdown;
  }

  /**
   * Kuleye isleyen modifierlar: kartlar, esyalar ve Epik kartlarin cevrimleri.
   *
   * Cevrimler kaynagi `getTowerStatBonus` uzerinden okuyor -- kart ve esya
   * toplami arti o anki kosullu paylar -- ve hedefe birer modifier olarak
   * ekleniyor. Atis hizini, hasari ve menzili okuyan her yer zaten bu listeyi
   * okudugu icin cevrim icin ayri bir okuma dali yok. Cevrimsiz kulede liste
   * eskisiyle birebir ayni.
   */
  private getTowerRunModifiers(tower: TowerModel): FrozenRunModifiers {
    const base = this.getTowerStaticRunModifiers(tower);
    const conversions = this.getTowerGrantState(tower).conversions;
    if (conversions.length === 0) return base;
    return [...base, ...resolveStatConversions(conversions, (stat) => this.getTowerStatBonus(tower, stat, base))];
  }

  /**
   * Kulenin bir stattaki gercek bonusu: kart ve esya toplami arti o an
   * gecerli kosullu paylar. Kosullu paylar modifier listesine yazilmiyor
   * (zamana ve hedefe bagli); onlari okuyan yerler (namlu donusu, ates
   * konisi, isabetten kritik, cevrimler) bunu cagiriyor ki ayni sayiyi
   * gorsunler.
   */
  private getTowerStatBonus(tower: TowerModel, stat: ModifierStat, modifiers: readonly Modifier[] = this.getTowerStaticRunModifiers(tower)) {
    return getModifierAdd(modifiers, stat) + this.getTowerConditionalStatAdd(tower, stat, modifiers);
  }

  /**
   * Mermi hizi carpani; mermi, ozel mermi, Kin dalgasi ve sentez okuyuculari
   * hep buradan. Kosullu pay (Sessiz Mevzi) duz okumada gorunmezdi.
   */
  private getTowerProjectileSpeedMultiplier(tower: TowerModel) {
    return Math.max(0, 1 + this.getTowerStatBonus(tower, "projectileSpeed", this.getTowerRunModifiers(tower)));
  }

  /**
   * Kosullu stat paylari; hepsi kulenin o anki durumuna bakiyor. Donus
   * hizina Av Refleksi'nin oldurme penceresi ve Ongorulu Takip'in hizli
   * hedefi; isabete Isil Kalibrasyon'un soguk namlusu ve ucan hedefe donuk
   * namlunun `accuracyVsAir` payi (Irtifa Olcer); mermi hizina komsusuz
   * kulenin `projectileSpeedIsolated` payi (Sessiz Mevzi).
   */
  private getTowerConditionalStatAdd(tower: TowerModel, stat: ModifierStat, modifiers: readonly Modifier[], now = Date.now()) {
    if (stat === "turnRate") {
      let add = 0;
      if ((tower.killSnapUntil ?? 0) > now && this.towerHasUnlock(tower, "aim:killSnap")) add += KILL_SNAP_TURN_RATE;
      if (this.towerHasUnlock(tower, "aim:fastTargets") && this.isTowerAimingAtFastTarget(tower)) add += FAST_TARGET_TURN_RATE;
      return add;
    }
    if (stat === "accuracy") {
      let add = this.getTowerColdAccuracyAdd(tower);
      const vsAir = getModifierAdd(modifiers, "accuracyVsAir");
      if (vsAir !== 0 && this.isTowerAimingAtAirTarget(tower)) add += vsAir;
      return add;
    }
    if (stat === "projectileSpeed") {
      const isolated = getModifierAdd(modifiers, "projectileSpeedIsolated");
      return isolated !== 0 && this.isTowerIsolated(tower) ? isolated : 0;
    }
    return 0;
  }

  /** Isil Kalibrasyon / Termal Kilif: soguk namlunun isabet payi. */
  private getTowerColdAccuracyAdd(tower: TowerModel) {
    return this.towerHasUnlock(tower, "aim:coldAccuracy") && tower.temperature < COLD_ACCURACY_TEMPERATURE ? COLD_ACCURACY_BONUS : 0;
  }

  /** Namlunun dondugu hedef (`turnTargetId`) ucan bir dusman mi. */
  private isTowerAimingAtAirTarget(tower: TowerModel) {
    const target = tower.turnTargetId ? this.enemies.get(tower.turnTargetId) : undefined;
    return target?.movementKind === "air";
  }

  /**
   * Namlunun dondugu hedef kosucu ya da ucan bir dusman mi. Hedef secim
   * kilidi (`aimTargetId`) degil, `aimTowerAt`'in kaydettigi gercek hedef:
   * Oluler Bagi ve Kirik Ayna namluyu kilit disindaki dusmana ceviriyor.
   */
  private isTowerAimingAtFastTarget(tower: TowerModel) {
    const target = tower.turnTargetId ? this.enemies.get(tower.turnTargetId) : undefined;
    return Boolean(target && (target.type === "runner" || target.movementKind === "air"));
  }

  /**
   * Kart ve esya modifierlari, cevrimsiz. Kule motoru ve kilit kumesi
   * cozulurken (`collectTowerGrants`) bu okunuyor: cevrimler o kumeden
   * geldigi icin orada tam listeyi okumak kendi kendini cagirmak olurdu.
   */
  private getTowerStaticRunModifiers(tower: TowerModel): FrozenRunModifiers {
    const playerModifiers = this.state.players.get(tower.ownerId)?.runModifiers ?? EMPTY_RUN_MODIFIERS;
    // Gec oyunda en sicak nokta buydu: kule basina tick'te onlarca cagri, her
    // biri liste kurup her modifier icin katalogda dogrusal arama yapiyordu.
    // Sonuc yalnizca iki listenin elemanlarina ve kule tanimina bagli;
    // onbellek o elemanlari birebir (referansla) dogrulayarak tekrar kullaniliyor.
    // Listeler yerinde degisse de (push, yeni dizi) dogrulama kaciramaz.
    const cached = this.staticRunModifierCache.get(tower);
    if (cached
      && cached.definition === tower.definition
      && sameModifierElements(cached.playerModifiers, playerModifiers)
      && sameModifierElements(cached.towerModifiers, tower.runModifiers)) {
      return cached.result;
    }
    const result: FrozenRunModifiers = Object.freeze([
      ...playerModifiers.filter((modifier) => {
        const shopId = modifier.source.startsWith("shop:") ? modifier.source.slice(5) : "";
        const shopItem = shopId ? getShopItem(shopId) : undefined;
        if (shopItem) return shopItem.scope.kind === "global" || shopItemAppliesToTower(shopItem, tower.definition);
        const cardId = modifier.source.startsWith("card:") ? modifier.source.slice(5) : "";
        const card = getCardDefinition(cardId);
        return !card || card.scope.kind === "global" || cardAppliesToTower(card, tower.definition);
      }),
      ...tower.runModifiers
    ]);
    this.staticRunModifierCache.set(tower, {
      definition: tower.definition,
      playerModifiers: [...playerModifiers],
      towerModifiers: [...tower.runModifiers],
      result
    });
    return result;
  }

  /** `getWorkerModifiers` kuresel suzgeci; oyuncunun modifier dizisi anahtar, elemanlar dogrulaniyor. */
  private workerGlobalModifierCache = new WeakMap<readonly Modifier[], { source: Modifier[]; result: FrozenRunModifiers }>();

  /** `getTowerStaticRunModifiers` sonucu; kule nesnesine yazilmiyor ki kule kaydi degismesin. */
  private staticRunModifierCache = new WeakMap<TowerModel, {
    definition: TowerDefinition;
    playerModifiers: Modifier[];
    towerModifiers: Modifier[];
    result: FrozenRunModifiers;
  }>();

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
    // Cevrimler kart basina bir kez: ayni kart iki yoldan gelse de (hedefli ve
    // desteden) tavan ikiye katlanmasin.
    const conversions = new Map<string, StatConversion & { source: string }>();

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
      (card.conversions ?? []).forEach((conversion, index) => {
        const source = `conversion:${card.id}:${index}`;
        conversions.set(source, { ...conversion, source });
      });
    };

    // `getTowerRunModifiers` cevrimler icin buraya bakiyor ve her kule
    // modelinde (testlerin elle kurdugu yari modeller dahil) cagriliyor;
    // listeler eksikse bos say.
    for (const itemId of tower.equippedShopItemIds ?? []) takeShopItem(itemId);
    for (const cardId of tower.targetedCardIds ?? []) takeCard(getCardDefinition(cardId));
    for (const cardId of this.state.players.get(tower.ownerId)?.ownedCardIds ?? []) {
      const card = getCardDefinition(cardId);
      // Modifier kapsam kuraliyla ayni. Arayuzun "bu kuleye etki edenler"
      // listesi bunun alt kumesini (`cardReachesTower`) gosteriyor.
      if (card && ownedCardAppliesToTower(card, tower.definition)) takeCard(card);
    }

    // Altin carpanlari da burada cozuluyor.
    //
    // Ikisi de her karede kule basina anlik goruntuye yaziliyor ve
    // `getTowerRunModifiers` her cagrisinda katalogda arama yapiyor.
    // Onbellek zaten tam dogru anda -- kart secildiginde, esya alinip
    // takildiginda -- atiliyor, yani carpanlarin yeri burasi.
    //
    // Cevrimsiz liste: cevrimler bu cozumlemenin ciktisi. Hicbir cevrimin
    // hedefi bu dort stattan biri degil (katalog testi).
    const goldModifiers = this.getTowerStaticRunModifiers(tower);
    const engine = resolveTowerEngine(tower.definition.engine, grants);
    return {
      generation: this.grantGeneration,
      engine,
      hasTowerAura: (engine?.auras ?? []).some((aura) => aura.affects === "towers"),
      attackMultipliers: resolveTowerAttackMultipliers(grants),
      repairCostMultiplier: getModifierMultiplier(goldModifiers, "repairCost"),
      sellRefundMultiplier: getModifierMultiplier(goldModifiers, "sellRefund"),
      statusMagnitudeMultiplier: getModifierMultiplier(goldModifiers, "statusMagnitude"),
      statusDurationMultiplier: getModifierMultiplier(goldModifiers, "statusDuration"),
      unlocks,
      conversions: [...conversions.values()]
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

  /** Onarim bedelinin kart ve esya carpani. */
  private getTowerRepairCostMultiplier(tower: TowerModel) {
    return this.getTowerGrantState(tower).repairCostMultiplier;
  }

  /** Satis iadesinin kart ve esya carpani. */
  private getTowerSellRefundMultiplier(tower: TowerModel) {
    return this.getTowerGrantState(tower).sellRefundMultiplier;
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
  private getWorkerModifiers(worker: DroneModel): FrozenRunModifiers {
    const playerModifiers = worker.ownerId ? this.state.players.get(worker.ownerId)?.runModifiers ?? EMPTY_RUN_MODIFIERS : EMPTY_RUN_MODIFIERS;
    // Kuresel suzgecin sonucu yalnizca oyuncu listesinin elemanlarina bagli;
    // `getTowerStaticRunModifiers` gibi elemanlar birebir dogrulanarak tekrar
    // kullaniliyor (isci basina tick'te birkac cagri, her biri katalog taramasiydi).
    let globalModifiers: FrozenRunModifiers;
    const cached = this.workerGlobalModifierCache.get(playerModifiers);
    if (cached && sameModifierElements(cached.source, playerModifiers)) {
      globalModifiers = cached.result;
    } else {
      globalModifiers = Object.freeze(playerModifiers.filter((modifier) => {
        const shopId = modifier.source.startsWith("shop:") ? modifier.source.slice(5) : "";
        const shopItem = shopId ? getShopItem(shopId) : undefined;
        if (shopItem) return shopItem.scope.kind === "global";
        const cardId = modifier.source.startsWith("card:") ? modifier.source.slice(5) : "";
        const card = getCardDefinition(cardId);
        return !card || card.scope.kind === "global";
      }));
      this.workerGlobalModifierCache.set(playerModifiers, { source: [...playerModifiers], result: globalModifiers });
    }

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
    const zeynepHasteMultiplier = this.zeynepHasteUntil > Date.now() ? 1 / this.zeynepHasteMultiplier : 1;
    // Atis araligi carpanin **tersi**: menzil ve hasar 1,5 kat buyurken
    // aralik 1,5 kat kisaliyor. Ayri bir sayi olsaydi pasifin uc ekseni
    // birbirinden habersiz kayardi -- bir donem tam bu olmustu (1,12 ve 0,9).
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower) > 1 ? 1 / ATAKAN_ISOLATION_MULTIPLIER : 1;
    const previousLevelMultiplier = getTowerLevelIntervalMultiplier(tower.definition.id, tower.level);
    const previousInterval = Math.max(80, tower.definition.fireIntervalMs * previousLevelMultiplier * stackMultiplier * zeynepHasteMultiplier * passiveMultiplier);
    const currentInterval = Math.max(80, tower.definition.fireIntervalMs * stackMultiplier * zeynepHasteMultiplier * passiveMultiplier);
    return currentInterval / Math.max(1, previousInterval);
  }

  private getTrackingSourceWire(enemy: EnemyModel, now: number): { k: string } | undefined {
    if (!enemy.trackingSourceTowerId || this.getTrackingStackCount(enemy, now) <= 0) return undefined;
    return { k: enemy.trackingSourceTowerId };
  }

  private getServerLinkWaveAge(tower: TowerModel) {
    return this.serverLinkWaveAgeCache.get(tower.id) ?? 0;
  }

  /**
   * Atakan imzalarinin tel alanlari (`o`, `t`, `u`, `m`): yalnizca
   * Obsesyon ve Ucube'de, varsayilanda hic yok.
   *
   * Anahtar yazilmiyor -- `undefined` bile degil: tam karede msgpack
   * anahtari tasirdi. Deger kaybolunca delta `null` gonderiyor, istemci
   * siliyor (yigin sifirlandi). Yigin tamamen sunucuda; bu yalnizca okuma.
   */
  private getAtakanStackWire(tower: TowerModel): { o?: number; t?: string; u?: number; m?: number } | undefined {
    if (tower.definition.id === "warrior-4") {
      if (tower.focusStacks <= 0 || !tower.focusTargetId) return undefined;
      return { o: tower.focusStacks, t: tower.focusTargetId };
    }
    if (tower.definition.id === "warrior-6") {
      const limit = getUcubeStackLimit(tower);
      if (tower.focusStacks <= 0) return limit === UCUBE_DEFAULT_STACK_LIMIT ? undefined : { m: limit };
      return limit === UCUBE_DEFAULT_STACK_LIMIT ? { u: tower.focusStacks } : { u: tower.focusStacks, m: limit };
    }
    return undefined;
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
      const factoryStatus = tower.rawAmmo <= 0
        ? "Cephane Hammaddesi Yok"
        : tower.energy > 0
          ? `Fabrika ${Math.floor(tower.ammo)}/${tower.maxAmmo}`
          : "Fabrika Enerjisiz";
      return (tower.ammoFactoryShield ?? 0) > 0 ? `${factoryStatus} · Kalkan ${Math.ceil(tower.ammoFactoryShield ?? 0)}` : factoryStatus;
    }
    if (tower.definition.resourceProvider === "energy") {
      return `Enerji Deposu ${Math.floor(tower.energy)}/${tower.maxEnergy}`;
    }
    if (tower.standby) return "Beklemede";
    if ((tower.ammoEmergencyShots ?? 0) > 0) return `Acil Şarjör ${tower.ammoEmergencyShots}`;
    if ((tower.ammoPayloadShots ?? 0) > 0) return `Özel mühimmat ${tower.ammoPayloadShots}`;
    if ((tower.ammoAssaultUntil ?? 0) > now) return "Saldırı Kervanı";
    if ((tower.ammoEvacuationUntil ?? 0) > now) return "Tahliye Kervanı";
    if ((tower.repairFortificationHp ?? 0) > 0 && (tower.repairFortificationUntil ?? 0) > now) return `Tahkimat ${Math.ceil(tower.repairFortificationHp ?? 0)}`;
    if ((tower.repairBreachUntil ?? 0) > now) return "Gedik Mühendisi";
    if (tower.wakeReadyAt > now) return `Isiniyor ${Math.ceil((tower.wakeReadyAt - now) / 1000)}sn`;
    if (tower.energyBridgeUntil && tower.energyBridgeUntil > now && tower.energy <= 0) return "Acil Köprü";
    if (tower.energyFreeUntil && tower.energyFreeUntil > now) return "Son Çekirdek";
    if (tower.energyConduitUntil && tower.energyConduitUntil > now) return "İletken Damar";
    if (this.getEnergyRelaySource(tower, now)) return "Röle hattı";
    if (tower.energyShedUntil && tower.energyShedUntil > now) return "Yük kesildi";
    if (tower.energyFrequencyUntil && tower.energyFrequencyUntil > now) return "Frekans paylaşımı";
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
    // Ucgensiz Sentez hic ates etmiyor (`findTowerTarget`); fren orada
    // anlamsiz, asil engel dizilim. Diger engelleyiciler gibi frenden once.
    if (tower.definition.id === "zeynep-3" && !this.getZeynepSynthesisComposition(tower).mode) {
      return "Ucgen bekliyor";
    }
    // Isi freni engelleyicilerden sonra: kule atamiyorsa asil sebep o.
    // Overdrive, Odaklan ve Gotik Kabus'tan da sonra, cunku istemci onlarin
    // efektini bu metinden okuyor. Ayna, Bag ve Streak de yalnizca bu
    // metinde gorunuyor ve isi baglayan kulede fren neredeyse hic kalkmiyor;
    // onlari silmek yerine fren yanlarina ekleniyor. Diger bilgi
    // satirlarindan (Evrim, Pasif...) once: fren su an atis hizini yiyen
    // sey. Sabit aralikli kule frenlenmiyor, kilide kadar ayni hizda atiyor.
    // Ates etmeyen yapi (Tamir Merkezi, Sunucu) Isi Degisimi ile isinabiliyor
    // ama frenleyecek bir atisi yok.
    const brakes = !tower.definition.engine?.fixedFireInterval && isOperationalTower(tower.definition)
      && tower.definition.id !== "warrior-2";
    const heatRate = brakes ? this.getTowerHeatFireRateMultiplier(tower) : 1;
    // Uclar yuvarlanmiyor: %100 "fren yok", %0 ise kilit diye okunurdu.
    const brakeText = heatRate < 1 ? `Isı freni %${Math.min(99, Math.max(1, Math.round(heatRate * 100)))}` : "";
    const withBrake = (info: string) => brakeText ? `${info} · ${brakeText}` : info;
    if (tower.definition.id === "archer-5") {
      const capacity = this.getMelisBrokenMirrorCapacity(tower);
      return withBrake(`Ayna ${Math.min(100, Math.round((tower.melisMirrorCharge / Math.max(1, capacity)) * 100))}%`);
    }
    if (tower.definition.id === "archer-4") {
      return withBrake(`Bag ${tower.melisUnderworldTargetIds.length}/${tower.melisEvolutionLevel >= 2 ? 2 : 1} | Ruh ${tower.melisUnderworldPullCount} | ${tower.melisUnderworldMode === "approval" ? "Onay" : "Stres"}`);
    }
    if (tower.streakDamageUntil > now || tower.streakHasteUntil > now) {
      const damageBonus = tower.streakDamageUntil > now ? Math.round((tower.streakDamageMultiplier - 1) * 100) : 0;
      const hasteBonus = tower.streakHasteUntil > now ? Math.round((tower.streakHasteMultiplier - 1) * 100) : 0;
      return withBrake(hasteBonus > 0 ? `Streak +${damageBonus}%/+${hasteBonus}%` : `Streak +${damageBonus}%`);
    }
    if (brakeText) return brakeText;
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

  /**
   * Atakan'in yalnizlik pasifi.
   *
   * Duvar disarida. Pasif bir **kule** buffi: yalniz duran kuleye hasar
   * yaziyor. Duvar hicbir sey vurmadigi icin sayi hicbir yere islemiyordu
   * ama panelde duvarin durumu "Pasif" yaziyordu -- oyuncuya duvarinin bir
   * seyler kazandigini soyleyen bir yalan.
   */
  private getAtakanPassiveMultiplier(tower: TowerModel) {
    // Kimin odul alacagi paylasilan kuralda; yalnizlik sorusu metotta kaliyor
    // cunku testler onu degistirip pasifi kapatabiliyor.
    return receivesAtakanIsolationBonus(tower) && this.isTowerIsolated(tower)
      ? ATAKAN_ISOLATION_MULTIPLIER
      : 1;
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
      // Hedef Kilidi: hedefsiz gecen an birikimi silmiyor.
      if (this.getWorkerBoost(tower, "stackGuard")) return;
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
    const stackLimit = getUcubeStackLimit(tower);
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

  /**
   * Kulenin bir kare cevresinde baska kule yok mu.
   *
   * Duvar sayilmaz. Duvar bir kule degil, bir cizgi: kenara oturuyor,
   * kare kaplamiyor, ates etmiyor. Yalnizligi bozan sey komsu bir kule
   * olmali -- yoksa Izolasyon Kulesi'nin onune cekilen bir duvar hatti
   * kulenin kendi yetenegini kapatirdi.
   */
  private isTowerIsolated(tower: TowerModel) {
    const cache = this.tickLayoutCache?.isolated;
    const cached = cache?.get(tower);
    if (cached !== undefined) return cached;
    // Kural paylasilan pakette: istemci yerlestirme onizlemesi ayni soruyu soruyor.
    const isolated = isStructureIsolated(tower, this.towers.values(), this.activeMap);
    cache?.set(tower, isolated);
    return isolated;
  }

  private countAdjacentFriendlyTowers(tower: TowerModel) {
    return this.getAdjacentFriendlyTowers(tower).length;
  }

  /**
   * Ayni oyuncunun bir kare mesafedeki kuleleri; kosegenler dahil.
   *
   * Duvar komsu sayilmaz -- yalnizligin aynasi burasi. Sayilsaydi 10
   * altinlik duvarlarla kuleyi cevrelemek "Bitisik Devre"nin tam bonusunu
   * bedavaya verirdi.
   */
  private getAdjacentFriendlyTowers(tower: TowerModel) {
    const towerCell = worldToGrid(tower.x, tower.y, this.activeMap);
    const neighbours: TowerModel[] = [];
    for (const other of this.towers.values()) {
      if (other.id === tower.id || other.ownerId !== tower.ownerId || !countsAsTower(other.definition)) continue;
      const otherCell = worldToGrid(other.x, other.y, this.activeMap);
      if (Math.abs(otherCell.col - towerCell.col) <= 1 && Math.abs(otherCell.row - towerCell.row) <= 1) neighbours.push(other);
    }
    return neighbours;
  }

  private applyTowerEnemyAuras(tower: TowerModel, activeAuras = this.getActiveTowerAuras(tower), seconds = 0) {
    // Yavaslatma aurasi kritik gelmiyor (Buz Kirigi): aura her 220 ms'de bir
    // tazeleniyor ve her tikte zar atsaydik yavaslatma tikten tike titrerdi.
    // Izolasyon'da kart vurus yavaslatmasindan isliyor; aura sabit egride.
    const range = this.getTowerRange(tower);
    const affected = new Set<string>();
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
          if (resistedMultiplier < 1) affected.add(enemy.id);
        }
      }
    }
    // Exposure, not additional damage or prevented movement; overlapping auras may overlap.
    if (!this.setupPhase && affected.size && seconds > 0) this.getDefenseRow(tower).auraEnemySeconds += affected.size * seconds;
  }

  /**
   * Derin Dondurma karti takili, calisir durumdaki kuleler.
   *
   * Tik basina bir kez toplaniyor: dusman dongusunun icinde her dusman icin
   * butun kuleleri taramak, sahada bir tane bile boyle kule yokken bile
   * bedel odemek olurdu.
   */
  private collectDeepFreezeTowers() {
    const towers: TowerModel[] = [];
    for (const tower of this.towers.values()) {
      if (!this.towerHasUnlock(tower, "control:deepFreeze")) continue;
      if (tower.hp <= 0 || tower.standby || tower.heatLocked) continue;
      towers.push(tower);
    }
    return towers;
  }

  /**
   * Yeterince yavaslamis dusmani dondurur.
   *
   * Donma yavaslatmanin daha fazlasi degil, baskasi: hareketi tumden
   * kesiyor. Bu yuzden kendi durum kanalindan geciyor ve kendi beklemesi
   * var -- yoksa donmus dusmanin sifir hizi onu sonsuza kadar dondururdu.
   */
  private tryDeepFreeze(enemy: EnemyModel, speedMultiplier: number, towers: TowerModel[], now: number) {
    // Esik dahil: tam %60 yavaslama (hiz 0,4) donduruyor. Kucuk pay kayan
    // noktadan: 1 - 0,4 * 1,5 tam 0,4 cikmayabiliyor.
    if (speedMultiplier > DEEP_FREEZE_SPEED_THRESHOLD + 1e-9) return;
    if (enemy.freezeReadyAt > now) return;
    if (isStatusEffectActive(enemy.statusEffects.freeze, now)) return;

    const source = towers.find((tower) => {
      const range = this.getTowerRange(tower);
      return distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= range * range;
    });
    if (!source) return;

    this.applyEnemyStatusEffect(
      enemy,
      { type: "freeze", magnitude: 1, durationMs: DEEP_FREEZE_DURATION_MS, stacking: "refresh" },
      now,
      {
        durationMs: DEEP_FREEZE_DURATION_MS * getModifierMultiplier(this.getTowerRunModifiers(source), "statusDuration"),
        sourceTowerId: source.id,
        sourceOwnerId: source.ownerId
      }
    );
    enemy.freezeReadyAt = now + scaleGameDuration(DEEP_FREEZE_DURATION_MS + DEEP_FREEZE_COOLDOWN_MS);
    this.broadcast("enemy:frozen", { enemyId: enemy.id, towerId: source.id, x: roundNetworkNumber(enemy.x), y: roundNetworkNumber(enemy.y) });
  }

  /**
   * Kulenin kritik ihtimali.
   *
   * Hasar yolundaki hesabin kartlara acik olan parcasi; "Buz Kirigi"nin
   * okudugu sayi bu. Hedefe bakan kosullar (donmus hedef, isaretli hedef,
   * motorun durum etkisine bagli kritigi) burada yok, cunku yavaslatma
   * zarinda bakilacak bir vurus hedefi yok. Kulenin kendisine bakan iki
   * kosul (isabetten gelen kritik, komsusuz kule) burada da var.
   *
   * Soguk Celik (`heat:coldCrit`) bir istisna: hedefe degil kulenin kendi
   * sicakligina bakiyor, ama bilerek yalnizca hasar yolunda kaliyor. Buz
   * Kirigi'nin dengesi o pay olmadan kuruldu; buraya eklemek sogutma
   * kurulumlarinin yavaslatmasini da +%25 kritik yapardi ve davranis
   * degisikligi olurdu, yorum duzeltmesi degil.
   */
  private getTowerCritChance(tower: TowerModel) {
    const critical = this.getTowerEngine(tower)?.critical;
    return Math.max(0, TOWER_BASE_CRITICAL_CHANCE
      + (critical?.baseChance ?? 0)
      + this.getTowerOwnConditionalCritChance(tower)
      + getModifierAdd(this.getTowerRunModifiers(tower), "critChance"));
  }

  /**
   * Hedefe degil kulenin kendisine bakan kosullu kritik: Goz Karari isabet
   * bonusunu kritige ceviriyor, Gozcu Yuvasi komsusuz kuleye kritik veriyor.
   * Komsuluk kurali Yalniz Nisanci ile ayni (`isTowerIsolated`).
   */
  /**
   * `hitEnemy`: vurulan dusman. Ucan hedefe isabet payi (`accuracyVsAir`)
   * kritikte vurulan dusmana bakiyor, namlunun o anki yonune degil: mermi
   * ucarken namlu baska hedefe donmus olabilir. Ates konisi ve Balistik
   * cevrimi ates anindaki namlu hedefini okumaya devam ediyor. Dusman yoksa
   * (yavaslatma zari, panel) namlunun hedefi.
   */
  private getTowerOwnConditionalCritChance(tower: TowerModel, hitEnemy?: EnemyModel) {
    let chance = 0;
    if (this.towerHasUnlock(tower, "crit:fromAccuracy")) {
      // Ates konisinin okudugu sayinin aynisi (soguk namlu dahil); ucan hedef payi vurulan dusmandan.
      const modifiers = this.getTowerRunModifiers(tower);
      const accuracy = hitEnemy
        ? getModifierAdd(modifiers, "accuracy") + this.getTowerColdAccuracyAdd(tower) + (hitEnemy.movementKind === "air" ? getModifierAdd(modifiers, "accuracyVsAir") : 0)
        : this.getTowerStatBonus(tower, "accuracy", modifiers);
      chance += getAccuracyCritChance(accuracy);
    }
    if (this.towerHasUnlock(tower, "crit:isolated") && this.isTowerIsolated(tower)) chance += ISOLATED_CRIT_CHANCE;
    return chance;
  }

  /**
   * Yavaslatma kritik geldi mi.
   *
   * Buz Kirigi yavaslatmayi hasar gibi ele aliyor: ayni zar, ayni ihtimal.
   * Kritik gelen yavaslatma daha derin -- suresi degil gucu buyuyor, cunku
   * sure zaten kartlarla ayri ayri uzatilabiliyor ve ikisini birden
   * buyutmek tek kartta iki kart olurdu.
   */
  private rollSlowCrit(tower: TowerModel) {
    if (!this.towerHasUnlock(tower, "status:slowCrit")) return false;
    return this.towerCriticalRandom() < this.getTowerCritChance(tower);
  }

  /**
   * Sogutma Kanali: kulenin sogumasini yavaslatmaya cevirir.
   *
   * Sogumaya baglanmasi kartin butun anlami: isiyi atma hizi o ana kadar
   * yalnizca "ne siklikta ates edebilirim" sorusuydu, simdi ayni sayi
   * sahada bir kontrol degeri. Sogutma kartlari ve esyalari boylece
   * kendiliginden bu karta da yariyor.
   */
  private applyCoolantSlow(tower: TowerModel, enemy: EnemyModel, now: number) {
    const modifiers = this.getTowerRunModifiers(tower);
    const critical = this.rollSlowCrit(tower);
    const baseMagnitude = Math.min(
      COOLANT_SLOW_MAX,
      this.getTowerCoolingPerSecond(tower) * COOLANT_SLOW_PER_COOLING
        * getModifierMultiplier(modifiers, "statusMagnitude")
    );
    if (baseMagnitude <= 0) return;
    // Kritik, tavandan **sonra**: oteki yavaslatmalarla ayni kural (kesir
    // 1,5 kat, %90 tavan). Once carpilsaydi tavandaki kulede kritik hicbir
    // sey yapmazdi.
    const magnitude = critical ? getCriticalSlowFraction(baseMagnitude) : baseMagnitude;

    // Yenileniyor, uzerine eklenmiyor: kart kendisiyle stacklenmiyor.
    // Aktifken gelen daha zayif bir vurus guclu olani zayiflatmasin diye
    // de guclu olan tutuluyor.
    const active = enemy.coolantSlowUntil > now;
    enemy.coolantSlowMultiplier = Math.min(active ? enemy.coolantSlowMultiplier : 1, 1 - magnitude);
    const duration = COOLANT_SLOW_DURATION_MS * getModifierMultiplier(modifiers, "statusDuration");
    enemy.coolantSlowUntil = Math.max(enemy.coolantSlowUntil, now + scaleGameDuration(applyStatusResistance(duration, enemy.statusResistances.slow)));
    enemy.coolantSlowOwnerId = tower.ownerId;
    if (critical) this.broadcastSlowCritical(tower, enemy);
  }

  /**
   * Panelde gosterilecek etki ozeti.
   *
   * Sifir kalemler atiliyor ve sayilar yuvarlaniyor: kayit her karede
   * gidiyor ve "Kanama 0" satiri ne oyuncuya ne de tele bir sey katiyor.
   */
  private getEffectStatsSnapshot() {
    const stats: Record<string, number> = {};
    for (const [key, value] of this.effectStats) {
      if (value >= 0.05) stats[key] = Math.round(value * 10) / 10;
    }
    return Object.keys(stats).length > 0 ? stats : undefined;
  }

  /**
   * Etki araliginin uzunlugu.
   *
   * Aurasi olan kulede auranin tazeleme tiki, focus kulesinde ritmin kendisi.
   * Ikisi de sahada isleyen fonksiyondan geciyor, yani panelde yazan sayi ile
   * gercekten olan sey ayni.
   */
  private getTowerEffectInterval(tower: TowerModel, withHeat = true) {
    const auras = this.getActiveTowerAuras(tower);
    return auras.length > 0 ? this.getTowerAuraTickInterval(tower, auras, withHeat) : this.getTowerFireInterval(tower, withHeat);
  }

  /**
   * Kulenin aurasinin dusman hizina uyguladigi carpan.
   *
   * Yalnizca gosterim icin: sahada uygulanan deger `applyTowerEnemyAuras`
   * icinde ayni fonksiyondan cikiyor, yani panelde yazan sayi ile sahada
   * isleyen sayi ayni.
   */
  private getTowerAuraSlowMultiplier(tower: TowerModel) {
    const aura = this.getActiveTowerAuras(tower)
      .find((definition) => definition.affects === "enemies" && definition.stat === "slow");
    if (!aura) return undefined;
    return Math.round(getTowerAuraLevelMultiplier(aura, tower.level) * 1000) / 1000;
  }

  /**
   * Kulenin vuruslarinin dusman hizina yapacagi sey.
   *
   * Durumun `magnitude` degeri degil gercek carpan donuyor: hiz yavaslatma
   * kesrinden (`slowByLevel` varsa seviyeden, yoksa duz %52). Mesafeye gore
   * olcekleniyorsa iki uc da donuyor, cunku o kulelerde tek bir sayi yalan
   * olurdu. Kritik (Buz Kirigi) haric: o bir zar, kulenin sabit degeri degil.
   */
  private getTowerSlowStatus(tower: TowerModel) {
    const definition = this.getTowerEngine(tower)?.statusEffects?.find((effect) => effect.type === "slow");
    if (!definition) return undefined;
    const durationMs = Math.round(definition.durationMs * this.getTowerGrantState(tower).statusDurationMultiplier);
    if (definition.scaling === "distance") {
      return { speedMultiplier: KIN_SLOW_NEAR_MULTIPLIER, farSpeedMultiplier: KIN_SLOW_FAR_MULTIPLIER, durationMs };
    }
    return { speedMultiplier: Math.round((1 - getStatusSlowFraction(definition, tower.level)) * 1000) / 1000, durationMs };
  }

  private addEffectStat(key: string, amount: number) {
    if (!(amount > 0)) return;
    this.effectStats.set(key, (this.effectStats.get(key) ?? 0) + amount);
  }

  /**
   * Bir hasar olayini etki kalemlerine dagitir.
   *
   * Kritigin ve isaretin payi orantiyla cikariliyor: zincirin geri kalani
   * (zirh, direnc, kalkan) carpansal oldugu icin "kritik olmasaydi ne
   * olurdu" sorusunun cevabi tam olarak bu oran.
   */
  private recordEffectDamage(
    sourceDefinitionId: string,
    dealtAmount: number,
    parts: { critAdd: number; shopDamageAdd: number; markMultiplier: number }
  ) {
    if (!(dealtAmount > 0)) return;
    if (sourceDefinitionId.startsWith("status:")) {
      this.addEffectStat(sourceDefinitionId.slice(7), dealtAmount);
      return;
    }
    const toplamCarpan = 1 + parts.shopDamageAdd + parts.critAdd;
    if (parts.critAdd > 0 && toplamCarpan > 0) {
      this.addEffectStat("crit", dealtAmount * (parts.critAdd / toplamCarpan));
    }
    if (parts.markMultiplier > 1) {
      this.addEffectStat("mark", dealtAmount * (1 - 1 / parts.markMultiplier));
    }
  }

  private resetAuraSlows() {
    for (const enemy of this.enemies.values()) {
      enemy.auraSlowMultiplier = 1;
    }
  }

  private startSympathy(ownerId?: string) {
    this.sympathyUntil = Date.now() + scaleGameDuration(SYMPATHY_DURATION_MS);
    this.sympathyBeamTier = ownerId ? this.getUltimateBeamTier(ownerId) : undefined;
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

    // Duvar bagin ucu olamaz: ag kuleler arasinda kuruluyor ve 10 altinlik
    // bir cizgi "en yakin kule"yi degistirerek agi sekillendirmemeli.
    this.sympathyLinks = buildSympathyLinks(
      Array.from(this.towers.values())
        .filter((tower) => countsAsTower(tower.definition))
        .map((tower) => ({ id: tower.id, x: tower.x, y: tower.y }))
    );

    const halfWidth = this.scaleWorldDistance(SYMPATHY_LINK_HALF_WIDTH);
    for (const link of this.sympathyLinks) {
      this.beams.set(link.id, {
        id: link.id,
        definitionId: "onur-sympathy",
        tier: this.sympathyBeamTier,
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
    // Karne: baga takilip kanayan her dusman bir "baglandi"; olumler bunlardan sayiliyor.
    const report = this.openUltimateReports.find((entry) => entry.kind === "sympathy");
    for (const enemy of contacts) {
      const resistedMultiplier = 1 - applyStatusResistance(
        1 - SYMPATHY_SLOW_MULTIPLIER,
        enemy.statusResistances.slow
      );
      enemy.auraSlowMultiplier = Math.min(enemy.auraSlowMultiplier, resistedMultiplier);

      if (this.sympathyBledEnemyIds.has(enemy.id)) continue;
      this.sympathyBledEnemyIds.add(enemy.id);
      if (report?.markedIds && !report.markedIds.has(enemy.id)) {
        report.markedIds.add(enemy.id);
        report.hits += 1;
      }
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
    this.crystalTrapKeys.clear();
    for (const [key, until] of this.crystalTrapUntil) if (until <= now) this.crystalTrapUntil.delete(key);
    for (const tower of this.towers.values()) {
      if (tower.definition.resourceProvider === "ammunition"
        && this.hasWorkerSkillForOwner(tower.ownerId, "ammoCollector", "ammo-wave-stock")) {
        tower.rawAmmo = Math.min(tower.maxRawAmmo, tower.rawAmmo + tower.rawAmmo * 0.3);
      }
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
          const previousAge = tower.linkedTowerWaveAges[linkedTowerId] ?? 0;
          tower.linkedTowerWaveAges[linkedTowerId] = previousAge + 1;
          const linkedTower = this.towers.get(linkedTowerId);
          if (linkedTower) this.notifyServerLinkMatured(tower, linkedTower, previousAge, previousAge + 1);
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
    // Hedef Kilidi: yeni hedef eskisinin birikimini devraliyor.
    if (tower.focusTargetId && tower.focusTargetId !== target.id && this.getWorkerBoost(tower, "stackGuard")) {
      tower.focusTargetId = target.id;
      // Yigin kendi hedefini de tutuyor; yeni hedef ona da yaziliyor.
      const state = definition ? tower.stackStates[definition.id] : undefined;
      if (state) state.targetId = target.id;
    }
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
      // Sekme yakinliga bakiyor, yolun sirasina degil.
      //
      // Once yalnizca hedefin **arkasindaki** dusmanlar seciliyordu ve
      // mesafe hic bakilmiyordu. Iki sonucu vardi: kule surunun en
      // gerisindeki dusmani vurdugunda hicbir sey sekmiyordu -- oyuncunun
      // gordugu "bazen calisiyor bazen calismiyor" buydu -- ve sektiginde
      // haritanin obur ucundaki bir dusmana da sekebiliyordu.
      //
      // Yakinlik olcutu ayrica sekmenin ne oldugunu anlatiyor: elektrik
      // atliyor, siraya girmiyor.
      const chainRadius = this.scaleWorldDistance(UCUBE_CHAIN_RADIUS);
      const chainRadiusSq = chainRadius * chainRadius;
      const chainedEnemies = Array.from(this.enemies.values())
        .map((enemy) => {
          this.perfCounters.chainChecks += 1;
          return { enemy, distanceSq: distanceSq(enemy.x, enemy.y, target.x, target.y) };
        })
        .filter((entry) => entry.enemy.id !== target.id && entry.distanceSq <= chainRadiusSq)
        .sort((a, b) => a.distanceSq - b.distanceSq)
        .slice(0, UCUBE_CHAIN_TARGETS)
        .map((entry) => entry.enemy);
      for (const enemy of chainedEnemies) {
        this.setUcubeChainBeam(projectile, target, enemy);
        this.damageEnemy(enemy, this.getProjectileDamage(projectile, getUcubeChainDamageMultiplier(tower)), 0, projectile.definitionId, tower.ownerId, projectile.damageType, projectile.maxHealthDamageRatio, tower.level, tower.id, projectile.hitType, projectile.luck);
      }
    }

    if (hasUcubePerk(tower, "pushback") && this.enemies.has(target.id)) {
      target.pathDistance = Math.max(0, target.pathDistance - this.scaleWorldDistance(18));
    }
  }

  private consumeConfiguredMarks(tower: TowerModel, target: EnemyModel, event: "hit" | "kill") {
    // Isaret Koruma: kule bir sure vurdugu dusmanin isaretini yemiyor.
    if (this.getWorkerBoost(tower, "markGuard")) return;
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
    const now = Date.now();
    const windowWasOpen = tower.luckyWindowUntil > now;
    const result = resolveOnurGamblerShot(
      { misfortune: tower.misfortune, luckyWindowUntil: tower.luckyWindowUntil },
      this.getTowerFireInterval(tower),
      this.towerDamageRandom,
      now
    );
    tower.misfortune = result.misfortune;
    tower.luckyWindowUntil = result.luckyWindowUntil;
    tower.lastLuckMultiplier = result.multiplier;
    // Kotu sans sayaci doldu, pencere bu atista acildi: yalnizca sahibine,
    // kulenin ustunde. Kural degismedi; damga yalnizca olani soyluyor.
    if (!windowWasOpen && result.luckyWindowUntil > now) {
      this.sendComboStamp("luckyWindow", tower, { ownerOnly: true });
    }
  }

  /**
   * Isaretli oldurme Debug Lazer'i asiri yuklemeye gecirdi: "İŞARET →
   * OVERDRIVE" ve supurmenin oldurmelerini saymaya basla.
   *
   * Asiri yukleme hemen isindan kesildiyse (isi siniri asilmis) supurme yok,
   * damga da yok. Supurme surerken yeniden tetiklenirse onceki supurmenin
   * sonucu once kapatiliyor; iki supurmenin oldurmesi birbirine karismasin.
   */
  private noteMarkedOverdriveStarted(tower: TowerModel, now: number) {
    if (this.debugSweepRuns.has(tower.id)) {
      this.finishDebugSweepRun(tower.id);
    }
    if (tower.debugOverdriveUntil <= now) {
      return;
    }
    this.debugSweepRuns.set(tower.id, { ownerId: tower.ownerId, kills: 0 });
    this.sendComboStamp("markOverdrive", tower);
  }

  /**
   * Biten supurmeleri kapatir: tick basinda bir kez. Supurme kendi sonunu
   * `debugOverdriveUntil`i simdiye cekerek isaretliyor, isi kesintisi onu
   * sifirliyor, satilan kule haritadan kalkiyor; ucu de burada yakalaniyor.
   */
  private settleDebugSweepRuns(now: number) {
    if (this.debugSweepRuns.size === 0) {
      return;
    }
    for (const towerId of Array.from(this.debugSweepRuns.keys())) {
      const tower = this.towers.get(towerId);
      if (tower && tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > now) {
        continue;
      }
      // Dogal sonuna varmis ama kapanis vurusu henuz yapilmamis supurme: kule
      // dongusu kapanisin oldurmelerini sayip kaydi kendisi kapatiyor. Kule o
      // donguye varamazsa (askida, yikik) pencere dolunca burada kapanir.
      if (tower && tower.definition.id === "warrior-5" && tower.debugSweepStartedAt > 0
        && now - tower.debugOverdriveUntil <= DEBUG_LASER_CLOSING_PASS_WINDOW_MS) {
        continue;
      }
      this.finishDebugSweepRun(towerId);
    }
  }

  /** "Tarama: N öldü": yalnizca en az iki oldurmede; tek oldurme normal atisin isi. */
  private finishDebugSweepRun(towerId: string) {
    const run = this.debugSweepRuns.get(towerId);
    this.debugSweepRuns.delete(towerId);
    const tower = this.towers.get(towerId);
    if (!run || !tower || run.kills < DEBUG_SWEEP_STAMP_MIN_KILLS) {
      return;
    }
    this.sendComboStamp("sweepKills", tower, { kills: run.kills });
  }

  /**
   * Kombo damgasini yollar; tur + sahip basina 4 sn'de en fazla bir kez.
   *
   * Tek seferlik mesaj, tick'te veri yok. Herkese gidiyor (takim arkadasinda
   * soluk ciziliyor), `ownerOnly` ise yalnizca sahibine. Istemci basina
   * `send`: yayin ile ayni sonuc, ama kendi istemci listesiyle surulen
   * testlerde de calisiyor.
   */
  private sendComboStamp(kind: ComboStampKind, tower: TowerModel, options: { kills?: number; ownerOnly?: boolean } = {}) {
    if (!this.comboStampThrottle.admit(kind, tower.ownerId, Date.now())) {
      return false;
    }
    const message: ComboStampMessage = { kind, ownerId: tower.ownerId, towerId: tower.id, x: Math.round(tower.x), y: Math.round(tower.y) };
    if (options.kills !== undefined) {
      message.kills = options.kills;
    }
    for (const client of this.clients) {
      if (!options.ownerOnly || client.sessionId === tower.ownerId) {
        client.send("combo:stamp", message);
      }
    }
    return true;
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

  /**
   * Istemciden gelen kimlik: oynanabilir operatorse kendisi, degilse (kilitli,
   * bilinmeyen, bos) AttackLord. Kilitli istek girisi bozmuyor; yalnizca
   * hata ayiklama kaydina dusuyor.
   */
  private getCharacterId(value: unknown): CharacterId {
    const playable = MatchRoom.playableCharacterIds;
    if (isPlayableCharacterId(value, playable)) {
      return value;
    }
    const fallback = playable.includes(FALLBACK_PLAYABLE_CHARACTER_ID) ? FALLBACK_PLAYABLE_CHARACTER_ID : playable[0] ?? FALLBACK_PLAYABLE_CHARACTER_ID;
    if (value !== undefined) {
      console.debug(`[MatchRoom ${this.roomId ?? "?"}] oynanamayan operator istegi ${JSON.stringify(value)} -> ${fallback}`);
    }
    return fallback;
  }

  private getAvailableCharacterId(requestedCharacterId: unknown) {
    const requested = this.getCharacterId(requestedCharacterId);
    const taken = new Set(Array.from(this.state.players.values()).map((player) => player.characterId));
    if (!taken.has(requested)) {
      return requested;
    }

    // Bos yuva yalnizca oynanabilirlerden; hepsi alinmissa istek (ayni operator iki kez).
    const playable = MatchRoom.playableCharacterIds;
    return characters.find((character) => playable.includes(character.id) && !taken.has(character.id))?.id ?? requested;
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

/** Ucube atis hizi yiginin tavani; seviye ozellikleri 15 ve 20'ye cikariyor. */
const UCUBE_DEFAULT_STACK_LIMIT = 10;
function getUcubeStackLimit(tower: TowerModel) {
  return hasUcubePerk(tower, "stacks-20") ? 20 : hasUcubePerk(tower, "stacks-15") ? 15 : UCUBE_DEFAULT_STACK_LIMIT;
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

/** Sonlu sayi mi; NaN ve Infinity `typeof` testinden geciyor, buradan gecmiyor. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Katilim secenegindeki oyuncu adi: metin degilse yok sayiliyor, 20 harfe kirpiliyor. */
function getJoinPlayerName(value: unknown) {
  return typeof value === "string" ? value.slice(0, 20) : "";
}

/** Eslestirme yolu oda kuruyor mu: `/matchmake/create/...` ya da `/matchmake/joinOrCreate/...`. */
function isRoomCreateRequest(url: string | undefined) {
  return typeof url === "string" && /\/matchmake\/(?:create|joinOrCreate)\//.test(url);
}

/** Sahip sirrinin ozeti; sir kendisi saklanmiyor. Bicimi tutmayan sir yok sayiliyor. */
function hashOwnerSecret(secret: unknown) {
  if (typeof secret !== "string" || secret.length < 16 || secret.length > 128) return undefined;
  return createHash("sha256").update(secret).digest();
}

/**
 * Eski istemcinin delta karesi: kule ve dusman delta, oyuncu ve isci tam.
 *
 * Oyuncu ve isci deltasi sonradan geldi; onu bilmeyen istemci (bayat sekme,
 * yeniden yuklenmemis itch derlemesi) kismi kaydi tam sanip HUD'unu ve isci
 * dokularini bozuyordu. Bu iki bolum tam kareden aynen aliniyor; eski
 * surumde de her karede tam gidiyorlardi.
 */
function toLegacyWireFrame(delta: WireGameSnapshot, full: WireGameSnapshot): WireGameSnapshot {
  if (delta === full) return full;
  const frame: WireGameSnapshot = { ...delta, players: full.players };
  if (full.drones) frame.drones = full.drones;
  return frame;
}

/**
 * Kiralik iscinin tel kopyasi.
 *
 * Yayilim yalnizca sayilabilir alanlari aliyor: kimlik ve secimler
 * `hireWorker`da gizli (sayilamaz) tutuluyor ve telde yok, bu degismiyor.
 * Beceri listesi sayilabilir oldugunda (eski kayitlar) kopyalaniyor; aksi
 * halde delta tabani canli diziyi paylasir ve yerinde eklenen secim hic
 * fark olarak gorunmezdi.
 */
function toHiredWorkerWire(worker: HiredWorker): HiredWorker {
  const copy = { ...worker };
  if (Array.isArray(copy.skillIds)) copy.skillIds = [...copy.skillIds];
  return copy;
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

function getAbartiArmorBreak(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return Math.round(10 + ((clampedLevel - 1) / 9) * 20);
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
/**
 * Hasari gercek bir vurus olmayan oldurmeler: tasan hasar primi bunlari
 * saymiyor. Oluler Bagi'nin infazi hedefi yapay bir hasarla (can + kalkan +
 * azami can + 1) olduruyor; AttackLord'un Execute becerisi de oyle.
 */
const SYNTHETIC_KILL_SOURCES: ReadonlySet<string> = new Set(["archer-4-underworld-execute", ATAKAN_EXECUTE_SOURCE_ID]);
function isSyntheticKillSource(sourceDefinitionId: string) {
  return SYNTHETIC_KILL_SOURCES.has(sourceDefinitionId);
}

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

/**
 * Kapali bayraklari ve bos dizileri telden dusurur.
 *
 * JSON'da bedeli odeten sey deger degil **anahtar adi**:
 * `"isUnderworldLinked":false` 26 bayt ve dusmanlarin cogunda bu bayraklarin
 * hepsi kapali. Olculdu -- 20 kule, 46 dusman: snapshot 23.2 KB, yalnizca kapali
 * bayraklar ve bos diziler dusunce 13.9 KB.
 *
 * Atlamak guvenli, cunku istemci alanlari statik snapshotla birlestiriyor
 * (`{ ...statik, ...telden }`) ve bu bayraklarin hicbiri statik snapshotta yok:
 * eksik alan `undefined` kaliyor, o da `false` ile ayni sekilde falsy.
 *
 * Sayilar bilerek disarida. Eksik bir sayi istemcide statik snapshottaki degere
 * duser -- `hp` icin bu, olmek uzere olan bir dusmani dogdugu canla gostermek
 * demek olurdu.
 */
/**
 * Bir snapshotin **iceriginin** imzasi; zaman damgasi disarida.
 *
 * `serverTime` her karede degistigi icin snapshotlar hicbir zaman birebir ayni
 * olmuyor, oysa duran bir tahtada tasidiklari bilgi ayni.
 */
export function idleSnapshotSignature(snapshot: WireGameSnapshot) {
  return JSON.stringify({ ...snapshot, serverTime: 0 });
}

export function stripWireDefaults<T extends Record<string, unknown>>(entity: T): T {
  const trimmed: Record<string, unknown> = {};
  for (const key of Object.keys(entity)) {
    const value = entity[key];
    if (value === false || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    trimmed[key] = value;
  }
  return trimmed as T;
}

export function roundNetworkNumber(value: number) {
  return Math.round(value * 10) / 10;
}

/**
 * Oldurme olayinin tel bicimi.
 *
 * Olay 2.2 sn boyunca her snapshotta (60 ms) yeniden gidiyor, yani anahtar
 * basina bedel otuz kati. Seri kademesi cogu olayda yok; eskiden yine de
 * `undefined` degerle yaziliyordu ve msgpack anahtari yine gonderiyordu
 * (on bir baytlik ad + bos deger). Yok olan alan artik anahtar olarak da
 * yok. Model alanlari (ttlMs) disarida kaliyor.
 */
export function toKillEventWire(event: KillEventSnapshot): KillEventSnapshot {
  const wire: KillEventSnapshot = {
    id: event.id,
    ownerId: event.ownerId,
    enemyId: event.enemyId,
    serverTime: event.serverTime
  };
  if (event.streakTier) wire.streakTier = event.streakTier;
  if (event.g !== undefined && event.g > 0) wire.g = event.g;
  if (event.a && event.a.length > 0) wire.a = event.a;
  return wire;
}

/**
 * Hasar olayinin tel hali.
 *
 * Bayraklar yalnizca varsa kopyalaniyor. `c: event.c` gibi bir atama degeri
 * `undefined` olsa bile anahtari tasiyor ve msgpack onu da yaziyor; olay
 * telde ~19 kez gittigi icin bu her olayda bayrak basina birkac bayt demek.
 */
export function toDamageEventWire(event: DamageEventSnapshot): DamageEventSnapshot {
  const wire: DamageEventSnapshot = {
    id: event.id,
    x: roundNetworkNumber(event.x),
    y: roundNetworkNumber(event.y),
    amount: roundNetworkNumber(event.amount)
  };
  if (event.c) wire.c = 1;
  if (event.k) wire.k = 1;
  if (event.o !== undefined && event.o !== 0) wire.o = event.o;
  if (event.r) wire.r = event.r;
  if (event.j) wire.j = event.j;
  if (event.b) wire.b = 1;
  return wire;
}

function getTowerPlacementOrientation(definitionId?: string, orientation?: TowerOrientation): TowerOrientation {
  if (definitionId !== "zeynep-8") {
    return "horizontal";
  }

  return orientation === "vertical" ? "vertical" : "horizontal";
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


function getEnemyCollisionRadius(enemy: EnemyModel) {
  return getEnemyTypeCollisionRadius(enemy.type);
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

/**
 * Kuyruk ile bas arasindaki sekme koseleri, duz `[x, y, ...]` (yuvarlanmis);
 * aralikta sekme yoksa `undefined` (telde anahtar yok).
 */
function getRayBounceVertices(segments: RaySegment[], tailDistance: number, headDistance: number) {
  let vertices: number[] | undefined;
  let travelled = 0;
  for (let index = 0; index < segments.length - 1; index += 1) {
    travelled += segments[index].length;
    if (travelled <= tailDistance) continue;
    if (travelled >= headDistance) break;
    vertices ??= [];
    vertices.push(roundNetworkNumber(segments[index].x2), roundNetworkNumber(segments[index].y2));
  }
  return vertices;
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
