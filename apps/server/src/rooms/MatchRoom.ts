import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import { performance } from "node:perf_hooks";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  MAP_GRID_COLS,
  MAP_GRID_ROWS,
  MAP_PATH,
  PATH_WIDTH,
  STATUS_EFFECTS,
  TOWER_BUILD_BOTTOM,
  TOWER_BUILD_TOP,
  TOWER_GRID_SIZE,
  createDefaultEditableMap,
  applyStatusResistance,
  calculateDamageTaken,
  findPathToNearestNexus,
  getEnemyCombatDefinition,
  getMapPoints,
  getTile,
  gridToWorld,
  normalizeMapData,
  pathToWorldPoints,
  worldToGrid,
  getTowerUpgradeCost,
  towerCatalog,
  type CharacterId,
  type DamageEventSnapshot,
  type DamageType,
  type DroneSnapshot,
  type EnemyType,
  type EditableMapData,
  type MovementKind,
  type StatusEffectId,
  type BeamSnapshot,
  type GameSnapshot,
  type KillEventSnapshot,
  type ProjectileKind,
  type ServerPerfSnapshot,
  type TowerDefinition
} from "@karayel/shared";

const TEAM_START_GOLD = 240;
const MAX_TEAM_HEALTH = 100;
const MAX_TOWER_LEVEL = 10;
const TOWER_MIN_DISTANCE = 34;
const BUILD_MARGIN = 18;
const BASE_WAVE_ENEMY_COUNT = 10;
const ENEMY_COUNT_WAVE_MULTIPLIER = 1.2;
const ENEMY_HP_WAVE_MULTIPLIER = 1.5;
const GAME_SPEED_MULTIPLIER = 0.8;
const DEBUG_LASER_OVERDRIVE_DURATION_MS = 2000;
const DEBUG_LASER_MAX_SWEEP_RADIANS_PER_SECOND = degreesToRadians(30);
const DEBUG_LASER_OVERDRIVE_BEAM_RADIUS = 12;
const DEBUG_LASER_HEAT_WINDOW_MS = 20000;
const DEBUG_LASER_HEAT_LIMIT_MS = 10000;
const DEBUG_LASER_OVERHEAT_MS = 5000;
const TOWER_DPS_WINDOW_MS = 5000;
const UCUBE_WAVE_BONUS_THRESHOLDS = [2, 4, 6, 8, 10, 14, 16];
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
const ZEYNEP_SHOWCASE_BASE_LENGTH = 190;
const ZEYNEP_SHOWCASE_LENGTH_PER_LEVEL = 18;
const ZEYNEP_SHOWCASE_BEAM_RADIUS = 9;
const ZEYNEP_SYNTHESIS_BEAM_RADIUS = 10;
const ZEYNEP_SYNTHESIS_BURN_RADIUS = 34;
const ZEYNEP_SYNTHESIS_BURN_LINE_RADIUS = 16;
const ZEYNEP_SYNTHESIS_BURN_DURATION_MS = 3000;
const ZEYNEP_SYNTHESIS_BURN_TICK_MS = 333;
const ZEYNEP_SYNTHESIS_RAY_SPEED = 930;
const ZEYNEP_SYNTHESIS_RAY_LENGTH = 92;
const ZEYNEP_SYNTHESIS_RAY_TRAIL_TTL_MS = 140;
const ZEYNEP_FORMATION_PAIR_DAMAGE_MULTIPLIER = 1.08;
const ZEYNEP_FORMATION_TRIO_DAMAGE_MULTIPLIER = 1.16;
const ZEYNEP_FORMATION_PAIR_FIRE_INTERVAL_MULTIPLIER = 0.94;
const ZEYNEP_FORMATION_TRIO_FIRE_INTERVAL_MULTIPLIER = 0.88;

class Player extends Schema {
  @type("string") name = "";
  @type("string") characterId: CharacterId = "warrior";
  @type("number") goldSpent = 0;
  @type("number") towersBuilt = 0;
  @type("number") ultimateCharge = 0;
  @type("number") skill1CooldownMs = 0;
  @type("number") skill2CooldownMs = 0;
  @type("number") skill3CooldownMs = 0;
  @type("number") reputation = 0;
  @type("number") authorityChain = 0;
  @type("number") authorityQuality = 0;
}

class MatchState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

type JoinOptions = {
  playerName?: string;
  characterId?: CharacterId;
  mapData?: EditableMapData;
};

type PlaceTowerMessage = {
  definitionId?: string;
  x?: number;
  y?: number;
};

type UpgradeTowerMessage = {
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

type PingMessage = {
  sentAt?: number;
};

type LinkServerMessage = {
  serverTowerId?: string;
  targetTowerId?: string;
};

type EnemyModel = {
  id: string;
  type: EnemyType;
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
  statusResistances: Partial<Record<StatusEffectId, number>>;
  abilities: string[];
  speed: number;
  reward: number;
  pathDistance: number;
  slowUntil: number;
  auraSlowMultiplier: number;
  fearUntil: number;
  trackingStackUntil: [number, number, number];
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
  hp: number;
  maxHp: number;
  level: number;
  cooldownMs: number;
  focusTargetId: string;
  focusStacks: number;
  activeMs: number;
  overheatMs: number;
  offlineUntil: number;
  debugOverdriveUntil: number;
  debugSweepStartedAt: number;
  debugSweepPathId: number;
  debugSweepStartDistance: number;
  debugSweepEndDistance: number;
  debugSweepLastDamageAt: number;
  debugOverdriveHeatLastAt: number;
  debugOverdriveHeatSegments: DebugOverdriveHeatSegment[];
  linkBurstCooldownMs: number;
  waveBonusLevel: number;
  waveBonusProgress: number;
  linkedTowerIds: string[];
  linkedTowerWaveAges: Record<string, number>;
  rangeMemoryEnemyIds: string[];
  streakDamageUntil: number;
  streakDamageMultiplier: number;
  streakHasteUntil: number;
  streakHasteMultiplier: number;
  zeynepFormationSize: number;
  zeynepFormationLevel: number;
  damageDealt: number;
  damageWindow: Array<{ dealtAt: number; amount: number }>;
};

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
};

type BeamModel = BeamSnapshot & {
  ttlMs: number;
  delayMs?: number;
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
  hitEnemyIds: string[];
};

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
type ZeynepSynthesisMode = "dual-projectile" | "mirror-beam" | "burn-impact" | "copy-projectile" | "copy-showcase";
type ZeynepSynthesisComposition = {
  mode?: ZeynepSynthesisMode;
  hizaCount: number;
  showcaseCount: number;
  linkedTowers: TowerModel[];
  synthesisTowerCount: number;
  copySourceTower?: TowerModel;
};

export class MatchRoom extends Room<MatchState> {
  maxClients = 7;
  private enemies = new Map<string, EnemyModel>();
  private towers = new Map<string, TowerModel>();
  private projectiles = new Map<string, ProjectileModel>();
  private drones = new Map<string, DroneModel>();
  private beams = new Map<string, BeamModel>();
  private zeynepRays = new Map<string, ZeynepRayModel>();
  private burnZones = new Map<string, BurnZoneModel>();
  private damageEvents = new Map<string, DamageEventModel>();
  private killEvents = new Map<string, KillEventModel>();
  private playerKillStreakTimes = new Map<string, number[]>();
  private playerKillStreakLocks = new Map<string, Map<KillStreakTier, KillStreakLock>>();
  private nextEnemyId = 1;
  private nextTowerId = 1;
  private nextProjectileId = 1;
  private nextDroneId = 1;
  private nextBeamId = 1;
  private nextZeynepRayId = 1;
  private nextBurnZoneId = 1;
  private nextDamageEventId = 1;
  private nextKillEventId = 1;
  private teamHealth = MAX_TEAM_HEALTH;
  private teamGold = TEAM_START_GOLD;
  private wave = 1;
  private kills = 0;
  private waveSpawned = 0;
  private waveTarget = getWaveEnemyCount(1);
  private spawnCooldownMs = 500;
  private projectileGuidanceUntil = 0;
  private projectileGuidanceX = GAME_WORLD_WIDTH / 2;
  private projectileGuidanceY = GAME_WORLD_HEIGHT / 2;
  private silentModeUntil = 0;
  private damageHasteUntil = 0;
  private zeynepHasteUntil = 0;
  private zeynepHasteMultiplier = 1;
  private zeynepRangeUntil = 0;
  private zeynepRangeMultiplier = 1;
  private zeynepSlowUntil = 0;
  private zeynepSlowMultiplier = 1;
  private activeMap: EditableMapData = createDefaultEditableMap();
  private activePaths: RuntimePath[] = buildRuntimePaths(this.activeMap);
  private serverLinkWaveAgeCache = new Map<string, number>();
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

  onCreate() {
    this.setState(new MatchState());
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    this.onMessage("placeTower", (client, message: PlaceTowerMessage) => {
      this.placeTower(client, message);
    });

    this.onMessage("upgradeTower", (client, message: UpgradeTowerMessage) => {
      this.upgradeTower(client, message);
    });

    this.onMessage("useSkill", (client, message: UseSkillMessage) => {
      this.useSkill(client, message);
    });

    this.onMessage("useUltimate", (client, message: UseUltimateMessage) => {
      this.useUltimate(client, message);
    });

    this.onMessage("linkServer", (client, message: LinkServerMessage) => {
      this.linkServerTower(client, message);
    });

    this.onMessage("latency:ping", (client, message: PingMessage) => {
      client.send("latency:pong", {
        sentAt: typeof message.sentAt === "number" ? message.sentAt : Date.now()
      });
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    if (this.state.players.size === 0) {
      this.activeMap = normalizeMapData(options.mapData);
      this.activePaths = buildRuntimePaths(this.activeMap);
    }

    const player = new Player();
    player.name = options.playerName?.slice(0, 20) || "Oyuncu";
    player.characterId = this.getCharacterId(options.characterId);

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private update(deltaTime: number) {
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
    this.resetAuraSlows();
    this.updateTowers(gameDeltaTime);
    timings.towersMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.updateProjectiles(seconds);
    this.updateZeynepRays(seconds);
    this.updateBurnZones();
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

    sectionStart = performance.now();
    const snapshot = this.getSnapshot();
    timings.snapshotMs = performance.now() - sectionStart;
    snapshot.perf = this.latestPerfSnapshot;
    const snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
    const tickMs = performance.now() - frameStart;

    this.recordPerfFrame({
      ...this.perfCounters,
      ...timings,
      tickMs,
      snapshotBytes
    });

    snapshot.perf = this.latestPerfSnapshot;
    this.broadcast("snapshot", snapshot);
  }

  private updateSpawning(deltaTime: number) {
    if (this.state.players.size === 0 || this.teamHealth <= 0) {
      return;
    }

    if (this.waveSpawned >= this.waveTarget && this.enemies.size === 0) {
      this.advanceWaveGrowth();
      this.wave += 1;
      this.waveSpawned = 0;
      this.waveTarget = getWaveEnemyCount(this.wave);
      this.spawnCooldownMs = 950;
      this.teamGold += 20 + this.wave * 3;
    }

    if (this.waveSpawned >= this.waveTarget) {
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

  private spawnEnemy() {
    const roll = Math.random();
    const type: EnemyType = roll > 0.88 ? "brute" : roll > 0.66 ? "runner" : roll > 0.48 ? "shooter" : "grunt";
    const definition = getEnemyCombatDefinition(type);
    const isFlyingEnemy = shouldSpawnFlyingEnemy(this.wave, this.waveSpawned);
    const waveScale = getWaveHpMultiplier(this.wave);
    const airHealthMultiplier = isFlyingEnemy ? 0.25 : 1;
    const maxHp = Math.max(1, Math.round(definition.maxHp * waveScale * airHealthMultiplier));
    const maxShield = Math.round(definition.shield * waveScale * airHealthMultiplier);
    const speed = definition.speed + this.wave * 2.4;
    const pathId = Math.floor(Math.random() * Math.max(1, this.activePaths.length));
    const path = this.activePaths[pathId] ?? buildRuntimePaths(createDefaultEditableMap())[0];
    const start = isFlyingEnemy ? getAirSpawnPoint(path) : path.points[0] ?? gridToWorld(0, 0);
    const id = `e${this.nextEnemyId++}`;

    this.enemies.set(id, {
      id,
      type,
      x: start.x,
      y: start.y,
      hp: maxHp,
      maxHp,
      armor: definition.armor,
      healthRegenPerSecond: definition.healthRegenPerSecond,
      shield: maxShield,
      maxShield,
      movementKind: isFlyingEnemy ? "air" : definition.movementKind,
      damageResistances: { ...definition.damageResistances },
      statusResistances: { ...definition.statusResistances },
      abilities: isFlyingEnemy ? [...(definition.abilities ?? []), "flying"] : [...(definition.abilities ?? [])],
      speed,
      reward: definition.reward,
      pathDistance: 0,
      slowUntil: 0,
      auraSlowMultiplier: 1,
      fearUntil: 0,
      trackingStackUntil: [0, 0, 0],
      pathId
    });
  }

  private updateTowers(deltaTime: number) {
    const now = Date.now();
    this.refreshZeynepFormations();
    for (const tower of this.towers.values()) {
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

      tower.cooldownMs -= deltaTime;
      tower.linkBurstCooldownMs = Math.max(0, tower.linkBurstCooldownMs - deltaTime);

      if (tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > now) {
        this.updateDebugLaserSweep(tower);
        continue;
      }

      if (tower.definition.id === "warrior-5" && tower.debugSweepStartedAt > 0) {
        tower.debugSweepStartedAt = 0;
        tower.debugSweepPathId = 0;
        tower.debugSweepLastDamageAt = 0;
        tower.debugOverdriveHeatLastAt = 0;
      }

      if (tower.definition.id === "warrior-2") {
        continue;
      }

      if (tower.definition.id === "warrior-3" && this.isTowerIsolated(tower)) {
        this.applyIsolationAura(tower);
        tower.cooldownMs = Math.max(tower.cooldownMs, 220);
        continue;
      }

      const target = this.findTowerTarget(tower);
      this.updateUcubeRhythm(tower, target, deltaTime);
      if (tower.cooldownMs > 0) {
        continue;
      }

      if (!target) {
        continue;
      }

      this.spawnTowerProjectile(tower, target);
      tower.cooldownMs = this.getTowerFireInterval(tower);
    }

    this.updateServerLinks();
  }

  private spawnTowerProjectile(tower: TowerModel, target: EnemyModel) {
    this.prepareTowerShot(tower, target);

    if (tower.definition.id === "warrior-5") {
      this.fireDebugLaser(tower, target);
      return;
    }

    if (tower.definition.id === "zeynep-2") {
      this.fireZeynepShowcaseBeam(tower);
      return;
    }

    if (tower.definition.id === "zeynep-3") {
      this.fireZeynepSynthesis(tower, target);
      return;
    }

    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = tower.definition.projectileSpeed + tower.level * 22;
    const id = `p${this.nextProjectileId++}`;

    this.projectiles.set(id, {
      id,
      towerId: tower.id,
      definitionId: tower.definition.id,
      kind: "tower",
      damageType: tower.definition.damageType ?? "physical",
      source: "tower",
      targetId: target.id,
      x: tower.x,
      y: tower.y,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      damage: this.getTowerDamage(tower),
      maxHealthDamageRatio: this.getServerLinkedMaxHealthDamageRatio(tower),
      aoeRadius: tower.definition.aoeRadius + (tower.level - 1) * 5,
      slowMs: tower.definition.slowMs + (tower.level - 1) * 90,
      pierceLimit: tower.definition.id === "zeynep-1" ? 2 : 1,
      piercedEnemyIds: []
    });
  }

  private spawnSpecialProjectile(sourceTower: TowerModel, definitionId: string, target: EnemyModel, damage: number, speed: number, aoeRadius: number, slowMs: number) {
    const dx = target.x - sourceTower.x;
    const dy = target.y - sourceTower.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const id = `p${this.nextProjectileId++}`;

    this.projectiles.set(id, {
      id,
      towerId: sourceTower.id,
      definitionId,
      kind: "tower",
      damageType: sourceTower.definition.damageType ?? "electric",
      source: "tower",
      targetId: target.id,
      x: sourceTower.x,
      y: sourceTower.y,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      damage,
      maxHealthDamageRatio: 0,
      aoeRadius,
      slowMs,
      pierceLimit: 1,
      piercedEnemyIds: []
    });
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
    const killed = this.damageEnemyFromTower(tower, target, baseDamage, tower.definition.slowMs);

    if (wasTracked && killed) {
      tower.debugSweepStartedAt = now;
      tower.debugSweepPathId = target.pathId;
      tower.debugSweepStartDistance = target.pathDistance;
      tower.debugSweepEndDistance = this.getRearMostEnemyDistance(target.pathDistance, target.pathId);
      tower.debugSweepLastDamageAt = 0;
      tower.debugOverdriveHeatLastAt = now;
      tower.debugOverdriveUntil = now + scaleGameDuration(DEBUG_LASER_OVERDRIVE_DURATION_MS);
      this.updateDebugLaserSweep(tower);
      return;
    }

    this.setBeam(tower, target.x, target.y, false);
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
      ttlMs
    });
  }

  private setUcubeChainBeam(projectile: ProjectileModel, from: EnemyModel, to: EnemyModel) {
    const id = `chain-${projectile.id}-${this.nextBeamId++}`;
    this.beams.set(id, {
      id,
      definitionId: "warrior-6",
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
      x1: tower.x,
      y1: tower.y,
      x2: result.endX,
      y2: result.endY,
      width: ZEYNEP_SHOWCASE_BEAM_RADIUS * 2,
      color: tower.definition.color,
      overdrive: false,
      ttlMs: 260
    });
  }

  private findBestZeynepShowcaseLine(tower: TowerModel) {
    const enemies = Array.from(this.enemies.values()).filter((enemy) => this.canTowerTargetEnemy(tower, enemy));
    if (enemies.length === 0) {
      return undefined;
    }

    const length = this.getTowerRange(tower);
    let best: { endX: number; endY: number; targets: EnemyModel[]; score: number } | undefined;

    for (const enemy of enemies) {
      const dx = enemy.x - tower.x;
      const dy = enemy.y - tower.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1) {
        continue;
      }

      const endX = tower.x + (dx / distance) * length;
      const endY = tower.y + (dy / distance) * length;
      const targets = enemies.filter((candidate) => {
        const hitRadius = ZEYNEP_SHOWCASE_BEAM_RADIUS + getEnemyCollisionRadius(candidate);
        const projection = getSegmentProjection(candidate.x, candidate.y, tower.x, tower.y, endX, endY);
        return projection >= 0 && projection <= 1 && distanceToSegmentSq(candidate.x, candidate.y, tower.x, tower.y, endX, endY) <= hitRadius * hitRadius;
      });
      const score = targets.length * 100000 + targets.reduce((total, target) => total + target.pathDistance, 0);
      if (!best || score > best.score) {
        best = { endX, endY, targets, score };
      }
    }

    return best;
  }

  private getZeynepSynthesisComposition(tower: TowerModel): ZeynepSynthesisComposition {
    const formationGroup = this.getZeynepFormationGroup(tower);
    if (formationGroup.length !== 3 || !isCompleteZeynepFormation(formationGroup)) {
      return { hizaCount: 0, showcaseCount: 0, linkedTowers: [], synthesisTowerCount: formationGroup.filter((member) => member.definition.id === "zeynep-3").length };
    }

    const linkedTowers = formationGroup.filter((member) => member.id !== tower.id);
    const hizaCount = formationGroup.filter((member) => member.definition.id === "zeynep-1").length;
    const showcaseCount = formationGroup.filter((member) => member.definition.id === "zeynep-2").length;
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
          : hizaCount === 1 && showcaseCount === 1
            ? "mirror-beam"
            : undefined;

    return { mode, hizaCount, showcaseCount, linkedTowers, synthesisTowerCount, copySourceTower };
  }

  private getZeynepFormationGroup(tower: TowerModel) {
    const group = new Map<string, TowerModel>([[tower.id, tower]]);
    const queue = [tower];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      for (const candidate of this.towers.values()) {
        if (
          group.has(candidate.id) ||
          candidate.ownerId !== tower.ownerId ||
          candidate.characterId !== "zeynep"
        ) {
          continue;
        }

        if (!areZeynepFormationNeighbors(current, candidate)) {
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

  private fireZeynepSynthesisCopiedProjectile(tower: TowerModel, target: EnemyModel, copySourceTower: TowerModel) {
    const damage = this.getTowerDamage(copySourceTower);
    const speed = copySourceTower.definition.projectileSpeed + copySourceTower.level * 22;
    this.spawnZeynepSynthesisProjectile(tower, target, damage, speed, "physical", 2, "zeynep-1");
  }

  private fireZeynepSynthesisDualProjectiles(tower: TowerModel) {
    const targets = Array.from(this.enemies.values())
      .filter((enemy) => this.canTowerTargetEnemy(tower, enemy) && distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= this.getTowerRange(tower) * this.getTowerRange(tower))
      .sort((a, b) => b.pathDistance - a.pathDistance)
      .slice(0, 2);
    const damage = this.getTowerDamage(tower);
    const speed = Math.max(1, tower.definition.projectileSpeed + tower.level * 22);

    for (const target of targets) {
      this.spawnZeynepSynthesisProjectile(tower, target, damage, speed, "physical", 2);
    }
  }

  private fireZeynepSynthesisBurnImpact(tower: TowerModel, target: EnemyModel) {
    const result = this.findBestZeynepShowcaseLine(tower);
    const endX = result?.endX ?? target.x;
    const endY = result?.endY ?? target.y;
    const targets = result?.targets ?? [target];
    const damage = this.getTowerDamage(tower);
    for (const enemy of targets) {
      this.damageEnemyFromTowerAs(tower, enemy, damage, 0, "light");
    }
    this.addZeynepBurnLine(tower, tower.x, tower.y, endX, endY, damage * 0.42);

    const trailId = `zeynep-burn-trail-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(trailId, {
      id: trailId,
      definitionId: "zeynep-3-burn-trail",
      x1: tower.x,
      y1: tower.y,
      x2: endX,
      y2: endY,
      width: ZEYNEP_SYNTHESIS_BURN_LINE_RADIUS * 2,
      color: 0x7c2d12,
      overdrive: false,
      ttlMs: scaleGameDuration(ZEYNEP_SYNTHESIS_BURN_DURATION_MS),
      delayMs: scaleGameDuration(500)
    });

    const id = `zeynep-burn-${tower.id}-${this.nextBeamId++}`;
    this.beams.set(id, {
      id,
      definitionId: "zeynep-3-burn",
      x1: tower.x,
      y1: tower.y,
      x2: endX,
      y2: endY,
      width: ZEYNEP_SHOWCASE_BEAM_RADIUS * 2,
      color: 0x22d3ee,
      overdrive: false,
      ttlMs: 260
    });
  }

  private fireZeynepSynthesisMirrorBeam(tower: TowerModel, target: EnemyModel) {
    const segments = getMirrorBeamSegments(tower.x, tower.y, target.x, target.y);
    const firstSegment = segments[0];
    const initialDistance = Math.min(ZEYNEP_SYNTHESIS_RAY_LENGTH, firstSegment.length);
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
      speed: ZEYNEP_SYNTHESIS_RAY_SPEED,
      damage: this.getTowerDamage(tower),
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
    const tail = getPointOnRaySegments(ray.segments, Math.max(0, headDistance - ZEYNEP_SYNTHESIS_RAY_LENGTH));
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

      const hitRadius = ZEYNEP_SYNTHESIS_BEAM_RADIUS + getEnemyCollisionRadius(enemy);
      if (distanceToSegmentSq(enemy.x, enemy.y, x1, y1, x2, y2) > hitRadius * hitRadius) {
        continue;
      }

      ray.hitEnemyIds.push(enemy.id);
      this.damageEnemyFromTowerAs(tower, enemy, ray.damage * 0.5, 0, "physical", 0);
      this.damageEnemyFromTowerAs(tower, enemy, ray.damage * 0.5, 0, "light", 0);
    }
  }

  private setZeynepRayBeam(ray: ZeynepRayModel, segment: { x1: number; y1: number; x2: number; y2: number }) {
    const id = `zeynep-ray-${ray.id}`;
    this.beams.set(id, {
      id,
      definitionId: "zeynep-3-ray",
      x1: segment.x1,
      y1: segment.y1,
      x2: segment.x2,
      y2: segment.y2,
      width: ZEYNEP_SYNTHESIS_BEAM_RADIUS * 2,
      color: ray.segmentIndex === 0 ? 0xe879f9 : 0xfdf2f8,
      overdrive: false,
      ttlMs: ZEYNEP_SYNTHESIS_RAY_TRAIL_TTL_MS
    });
  }

  private spawnZeynepSynthesisProjectile(tower: TowerModel, target: EnemyModel, damage: number, speed: number, damageType: DamageType, pierceLimit: number, definitionId = tower.definition.id) {
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const id = `p${this.nextProjectileId++}`;

    this.projectiles.set(id, {
      id,
      towerId: tower.id,
      definitionId,
      kind: "tower",
      damageType,
      source: "tower",
      targetId: target.id,
      x: tower.x,
      y: tower.y,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      damage,
      maxHealthDamageRatio: this.getServerLinkedMaxHealthDamageRatio(tower),
      aoeRadius: 0,
      slowMs: 0,
      pierceLimit,
      piercedEnemyIds: []
    });
  }

  private addZeynepBurnLine(tower: TowerModel, x1: number, y1: number, x2: number, y2: number, damage: number) {
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
      radius: ZEYNEP_SYNTHESIS_BURN_LINE_RADIUS,
      damage,
      damageType: "light",
      expiresAt: now + scaleGameDuration(ZEYNEP_SYNTHESIS_BURN_DURATION_MS),
      nextTickAt: now + scaleGameDuration(ZEYNEP_SYNTHESIS_BURN_TICK_MS)
    });
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
          this.damageEnemy(enemy, zone.damage, 0, "zeynep-3-burn", zone.ownerId, zone.damageType, 0, 1, zone.towerId);
        }
      }
    }
  }

  private updateDebugLaserSweep(tower: TowerModel) {
    const now = Date.now();
    if (this.updateDebugLaserOverdriveHeat(tower, now)) {
      return;
    }

    if (tower.debugSweepStartedAt <= 0) {
      tower.debugSweepStartedAt = now;
    }

    const elapsedSeconds = this.clamp((now - tower.debugSweepStartedAt) / 1000, 0, DEBUG_LASER_OVERDRIVE_DURATION_MS / 1000);
    const sweepPath = this.activePaths[tower.debugSweepPathId] ?? this.activePaths[0];
    const currentAngle = getDebugLaserPathSweepAngle(
      sweepPath,
      tower.x,
      tower.y,
      tower.debugSweepStartDistance,
      tower.debugSweepEndDistance,
      elapsedSeconds
    );
    const end = getRayAngleToWorldEdge(tower.x, tower.y, currentAngle);
    const scanPoint = getPointOnRay(tower.x, tower.y, currentAngle, 190);
    const finishedSweep = now - tower.debugSweepStartedAt >= DEBUG_LASER_OVERDRIVE_DURATION_MS;

    this.setBeam(tower, end.x, end.y, true, scanPoint.x, scanPoint.y);
    if (tower.cooldownMs > 0) {
      if (finishedSweep) {
        tower.debugOverdriveUntil = now;
      }
      return;
    }

    const damage = this.getTowerDamage(tower);
    const previousDamageAt = tower.debugSweepLastDamageAt > 0 ? tower.debugSweepLastDamageAt : Math.max(tower.debugSweepStartedAt, now - 50);
    const previousElapsedSeconds = this.clamp((previousDamageAt - tower.debugSweepStartedAt) / 1000, 0, DEBUG_LASER_OVERDRIVE_DURATION_MS / 1000);
    const previousAngle = getDebugLaserPathSweepAngle(
      sweepPath,
      tower.x,
      tower.y,
      tower.debugSweepStartDistance,
      tower.debugSweepEndDistance,
      previousElapsedSeconds
    );

    for (const enemy of Array.from(this.enemies.values())) {
      if (didDebugLaserSweepHitEnemy(tower, enemy, previousAngle, currentAngle, end.x, end.y)) {
        this.damageEnemyFromTower(tower, enemy, damage, 0);
      }
    }
    tower.cooldownMs = this.getTowerFireInterval(tower);
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
    tower.debugSweepPathId = 0;
    tower.debugSweepLastDamageAt = 0;
    tower.debugOverdriveHeatLastAt = 0;
    tower.debugOverdriveHeatSegments = [];
    this.beams.delete(`beam-${tower.id}`);
  }

  private getRearMostEnemyDistance(startDistance: number, pathId: number) {
    const behindEnemies = Array.from(this.enemies.values())
      .filter((enemy) => enemy.pathId === pathId && enemy.pathDistance < startDistance)
      .sort((a, b) => a.pathDistance - b.pathDistance);

    return behindEnemies[0]?.pathDistance ?? Math.max(0, startDistance - 260);
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

      if (projectile.piercedEnemyIds.length > 0 && projectile.piercedEnemyIds.length < projectile.pierceLimit) {
        projectile.x += projectile.vx * seconds;
        projectile.y += projectile.vy * seconds;

        if (this.isProjectileOutOfBounds(projectile)) {
          this.projectiles.delete(id);
          continue;
        }

        const pierceTarget = this.findPierceLineTarget(projectile, previousX, previousY);
        if (!pierceTarget) {
          continue;
        }

        this.applyProjectileHit(projectile, pierceTarget);
        this.projectiles.delete(id);
        continue;
      }

      const target = this.enemies.get(projectile.targetId);
      if (!target) {
        this.projectiles.delete(id);
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

      if (this.isProjectileOutOfBounds(projectile)) {
        this.projectiles.delete(id);
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
        this.projectiles.delete(id);
      }
    }
  }

  private isProjectileOutOfBounds(projectile: ProjectileModel) {
    return (
      projectile.x < -30 ||
      projectile.x > GAME_WORLD_WIDTH + 30 ||
      projectile.y < -30 ||
      projectile.y > GAME_WORLD_HEIGHT + 30
    );
  }

  private findPierceLineTarget(projectile: ProjectileModel, previousX: number, previousY: number) {
    let bestTarget: EnemyModel | undefined;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies.values()) {
      if (projectile.piercedEnemyIds.includes(enemy.id)) {
        continue;
      }

      const hitRadius = getEnemyCollisionRadius(enemy) + 4;
      if (distanceToSegmentSq(enemy.x, enemy.y, previousX, previousY, projectile.x, projectile.y) > hitRadius * hitRadius) {
        continue;
      }

      const segmentDistanceSq = distanceSq(previousX, previousY, enemy.x, enemy.y);
      if (segmentDistanceSq < bestDistanceSq) {
        bestTarget = enemy;
        bestDistanceSq = segmentDistanceSq;
      }
    }

    return bestTarget;
  }

  private applyProjectileHit(projectile: ProjectileModel, target: EnemyModel) {
    const projectileTower = this.towers.get(projectile.towerId);
    const projectileOwnerId = projectileTower?.ownerId ?? "";
    const projectileTowerLevel = projectileTower?.level ?? 1;
    if (projectile.aoeRadius > 0) {
      for (const enemy of this.enemies.values()) {
        this.perfCounters.aoeChecks += 1;
        if (distanceSq(enemy.x, enemy.y, target.x, target.y) <= projectile.aoeRadius * projectile.aoeRadius) {
          this.damageEnemy(enemy, this.getProjectileDamage(projectile, 0.82), projectile.slowMs, projectile.definitionId, projectileOwnerId, projectile.damageType, projectile.maxHealthDamageRatio, projectileTowerLevel, projectile.towerId);
        }
      }
    } else {
      this.damageEnemy(target, this.getProjectileDamage(projectile), projectile.slowMs, projectile.definitionId, projectileOwnerId, projectile.damageType, projectile.maxHealthDamageRatio, projectileTowerLevel, projectile.towerId);
    }
    this.applyPostHitEffects(projectile, target);
  }

  private updateDrones(deltaTime: number, seconds: number) {
    const nexusX = GAME_WORLD_WIDTH / 2;
    const nexusY = GAME_WORLD_HEIGHT - 26;

    for (const [id, drone] of this.drones) {
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
        const speed = ATAKAN_DRONE_ATTACK_SPEED;
        drone.vx = (dx / length) * speed;
        drone.vy = (dy / length) * speed;
        drone.x += drone.vx * seconds;
        drone.y += drone.vy * seconds;

        if (distanceSq(drone.x, drone.y, target.x, target.y) <= 18 * 18) {
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
      const speed = ATAKAN_DRONE_REPAIR_SPEED;
      drone.vx = (dx / length) * speed;
      drone.vy = (dy / length) * speed;
      drone.x += drone.vx * seconds;
      drone.y += drone.vy * seconds;

      if (distanceSq(drone.x, drone.y, nexusX, nexusY) <= 18 * 18) {
        this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + drone.repairAmount);
        this.drones.delete(id);
      }
      if (drone.ttlMs <= 0) {
        this.drones.delete(id);
      }
    }
  }

  private updateEnemies(seconds: number) {
    const now = Date.now();
    for (const [id, enemy] of this.enemies) {
      if (enemy.healthRegenPerSecond > 0 && enemy.hp > 0) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.healthRegenPerSecond * seconds);
      }

      const isFeared = enemy.fearUntil > now;
      const isSlowed = enemy.slowUntil > now;
      const zeynepSlowMultiplier = this.zeynepSlowUntil > now ? this.zeynepSlowMultiplier : 1;
      const speedMultiplier = Math.min(isSlowed ? 0.48 : 1, enemy.auraSlowMultiplier, zeynepSlowMultiplier);
      if (isFeared) {
        enemy.pathDistance = Math.max(0, enemy.pathDistance - enemy.speed * 0.86 * speedMultiplier * seconds);
      } else {
        enemy.pathDistance += enemy.speed * speedMultiplier * seconds;
      }

      const path = this.activePaths[enemy.pathId] ?? this.activePaths[0];
      if (enemy.movementKind === "air") {
        const pathPoints = path?.points ?? [];
        const start = getAirSpawnPoint(path);
        const end = pathPoints[pathPoints.length - 1] ?? { x: GAME_WORLD_WIDTH / 2, y: GAME_WORLD_HEIGHT - 26 };
        const flightLength = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
        if (enemy.pathDistance >= flightLength) {
          this.enemies.delete(id);
          this.teamHealth = Math.max(0, this.teamHealth - (enemy.type === "brute" ? 14 : 8));
          continue;
        }

        const progress = Math.min(1, enemy.pathDistance / flightLength);
        enemy.x = start.x + (end.x - start.x) * progress;
        enemy.y = start.y + (end.y - start.y) * progress;
        continue;
      }

      const pathLength = path?.totalLength ?? totalPathLength;
      if (enemy.pathDistance >= pathLength) {
        this.enemies.delete(id);
        this.teamHealth = Math.max(0, this.teamHealth - (enemy.type === "brute" ? 14 : 8));
        continue;
      }

      const point = getPointAlongRuntimePath(path, enemy.pathDistance);
      enemy.x = point.x;
      enemy.y = point.y;
    }
  }

  private placeTower(client: Client, message: PlaceTowerMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || typeof message.x !== "number" || typeof message.y !== "number" || !message.definitionId) {
      return;
    }

    const definition = this.findTowerDefinition(player.characterId, message.definitionId);
    const placement = this.snapToTowerGrid(message.x, message.y);
    if (!definition || this.teamGold < definition.cost || !this.canPlaceTower(placement.x, placement.y)) {
      return;
    }

    const tower: TowerModel = {
      id: `t${this.nextTowerId++}`,
      ownerId: client.sessionId,
      ownerName: player.name,
      characterId: player.characterId,
      definition,
      x: placement.x,
      y: placement.y,
      hp: 100,
      maxHp: 100,
      level: 1,
      cooldownMs: 150,
      focusTargetId: "",
      focusStacks: 0,
      activeMs: 0,
      overheatMs: 0,
      offlineUntil: 0,
      debugOverdriveUntil: 0,
      debugSweepStartedAt: 0,
      debugSweepPathId: 0,
      debugSweepStartDistance: 0,
      debugSweepEndDistance: 0,
      debugSweepLastDamageAt: 0,
      debugOverdriveHeatLastAt: 0,
      debugOverdriveHeatSegments: [],
      linkBurstCooldownMs: 0,
      waveBonusLevel: 0,
      waveBonusProgress: 0,
      linkedTowerIds: [],
      linkedTowerWaveAges: {},
      rangeMemoryEnemyIds: [],
      streakDamageUntil: 0,
      streakDamageMultiplier: 1,
      streakHasteUntil: 0,
      streakHasteMultiplier: 1,
      zeynepFormationSize: 0,
      zeynepFormationLevel: 0,
      damageDealt: 0,
      damageWindow: []
    };

    this.towers.set(tower.id, tower);
    this.teamGold -= definition.cost;
    player.goldSpent += definition.cost;
    player.towersBuilt += 1;
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

    const cost = getTowerUpgradeCost(tower.definition.cost, tower.level, tower.definition.id);
    if (this.teamGold < cost) {
      return;
    }

    this.teamGold -= cost;
    player.goldSpent += cost;
    tower.level += 1;
  }

  private refactorTower(client: Client, message: UseSkillMessage) {
    if (!message.towerId || typeof message.x !== "number" || typeof message.y !== "number") {
      return false;
    }

    const tower = this.towers.get(message.towerId);
    const { x, y } = this.snapToTowerGrid(message.x, message.y);
    if (!tower || tower.ownerId !== client.sessionId || !this.canPlaceTower(x, y, tower.id)) {
      return false;
    }

    tower.x = x;
    tower.y = y;
    tower.cooldownMs = Math.min(tower.cooldownMs, 150);
    tower.rangeMemoryEnemyIds = [];
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

    if (slot === 0) {
      this.teamGold += 22;
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
      this.projectileGuidanceX = this.clamp(message.x, 0, GAME_WORLD_WIDTH);
      this.projectileGuidanceY = this.clamp(message.y, 0, GAME_WORLD_HEIGHT);
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
      this.applyZeynepHaste(profile.durationMs, profile.multiplier, now);
      return;
    }
    if (commandType === "range") {
      this.applyZeynepRange(profile.durationMs, profile.multiplier, now);
      return;
    }
    this.applyZeynepSlow(profile.durationMs, profile.multiplier, now);
  }

  private applyZeynepHaste(durationMs: number, multiplier: number, now: number) {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepHasteUntil <= now || multiplier >= this.zeynepHasteMultiplier) {
      this.zeynepHasteUntil = until;
      this.zeynepHasteMultiplier = multiplier;
    } else {
      this.zeynepHasteUntil = Math.max(this.zeynepHasteUntil, until);
    }
  }

  private applyZeynepRange(durationMs: number, multiplier: number, now: number) {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepRangeUntil <= now || multiplier >= this.zeynepRangeMultiplier) {
      this.zeynepRangeUntil = until;
      this.zeynepRangeMultiplier = multiplier;
    } else {
      this.zeynepRangeUntil = Math.max(this.zeynepRangeUntil, until);
    }
  }

  private applyZeynepSlow(durationMs: number, multiplier: number, now: number) {
    const until = now + scaleGameDuration(durationMs);
    if (this.zeynepSlowUntil <= now || multiplier <= this.zeynepSlowMultiplier) {
      this.zeynepSlowUntil = until;
      this.zeynepSlowMultiplier = multiplier;
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
      this.teamGold += 20;
      this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + 25);
      this.slowAllEnemies(1600);
    } else if (characterId === "tank") {
      this.damageAllEnemies(45, 3200, ownerId);
    } else if (characterId === "onur") {
      this.damageStrongestEnemy(180, 0, ownerId);
    } else {
      this.teamGold += 25;
      this.damageAllEnemies(20, 0, ownerId);
    }
  }

  private useUltimate(client: Client, message: UseUltimateMessage = {}) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.ultimateCharge < 100) {
      return;
    }

    player.ultimateCharge = 0;

    if (player.characterId === "zeynep") {
      for (const enemy of this.enemies.values()) {
        this.damageEnemy(enemy, 120, 700, "ultimate", client.sessionId);
      }
      return;
    }

    if (player.characterId === "mage") {
      for (const enemy of this.enemies.values()) {
        this.damageEnemy(enemy, 85, 0, "ultimate", client.sessionId);
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
        this.damageEnemy(enemy, 35, 3200, "ultimate", client.sessionId);
      }
      return;
    }

    if (player.characterId === "onur") {
      const enemy = Array.from(this.enemies.values()).sort((a, b) => b.hp - a.hp)[0];
      if (enemy) {
        this.damageEnemy(enemy, 220, 0, "ultimate", client.sessionId);
      }
      return;
    }

    if (player.characterId === "archer") {
      for (const enemy of Array.from(this.enemies.values()).sort((a, b) => b.pathDistance - a.pathDistance).slice(0, 6)) {
        this.damageEnemy(enemy, 70, 0, "ultimate", client.sessionId);
      }
      return;
    }

    if (player.characterId === "warrior") {
      this.useAtakanUltimate(client, message.mode === "repair" ? "repair" : "attack");
      return;
    }

    for (const enemy of this.enemies.values()) {
      this.damageEnemy(enemy, 25, 0, "ultimate", client.sessionId);
    }
  }

  private useAtakanUltimate(client: Client, mode: "attack" | "repair") {
    const ownTowers = Array.from(this.towers.values()).filter((tower) => tower.ownerId === client.sessionId && tower.characterId === "warrior");
    const repairNexus = mode === "repair";
    const droneDamage = this.getAtakanDroneDamage();

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

    const targetX = repairNexus ? GAME_WORLD_WIDTH / 2 : target?.x ?? tower.x;
    const targetY = repairNexus ? GAME_WORLD_HEIGHT - 26 : target?.y ?? tower.y;
    const speed = repairNexus ? ATAKAN_DRONE_REPAIR_SPEED : ATAKAN_DRONE_ATTACK_SPEED;
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

  private getAtakanDroneDamage() {
    return Math.max(1, Math.round(this.wave ** 3));
  }

  private findNearestEnemy(x: number, y: number) {
    return Array.from(this.enemies.values())
      .sort((a, b) => distanceSq(x, y, a.x, a.y) - distanceSq(x, y, b.x, b.y))[0];
  }

  private refreshZeynepFormations() {
    const towers = Array.from(this.towers.values()).filter((tower) => tower.characterId === "zeynep");
    for (const tower of towers) {
      tower.zeynepFormationSize = 0;
      tower.zeynepFormationLevel = 0;
    }

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
          if (visited.has(candidate.id) || candidate.ownerId !== current.ownerId) {
            continue;
          }
          if (!areZeynepFormationNeighbors(current, candidate)) {
            continue;
          }

          visited.add(candidate.id);
          queue.push(candidate);
        }
      }

      const isValidFormation = group.length === 2 || (group.length === 3 && isCompleteZeynepFormation(group));
      const formationSize = isValidFormation ? group.length : 0;
      const formationLevel = isValidFormation ? Math.min(...group.map((member) => member.level)) : 0;
      for (const member of group) {
        member.zeynepFormationSize = formationSize;
        member.zeynepFormationLevel = formationLevel;
      }
    }
  }

  private canPlaceTower(x: number, y: number, ignoreTowerId = "") {
    const halfCell = TOWER_GRID_SIZE / 2;
    if (
      x < BUILD_MARGIN ||
      x > GAME_WORLD_WIDTH - BUILD_MARGIN ||
      y < Math.max(BUILD_MARGIN, TOWER_BUILD_TOP + halfCell) ||
      y > Math.min(GAME_WORLD_HEIGHT - BUILD_MARGIN, TOWER_BUILD_BOTTOM - halfCell)
    ) {
      return false;
    }

    const gridPoint = worldToGrid(x, y);
    if (getTile(this.activeMap, gridPoint.col, gridPoint.row) !== "tower") {
      return false;
    }

    for (const tower of this.towers.values()) {
      if (tower.id === ignoreTowerId) {
        continue;
      }
      if (distanceSq(x, y, tower.x, tower.y) < TOWER_MIN_DISTANCE * TOWER_MIN_DISTANCE) {
        return false;
      }
    }

    return true;
  }

  private snapToTowerGrid(x: number, y: number) {
    const halfCell = TOWER_GRID_SIZE / 2;
    const top = Math.max(BUILD_MARGIN, TOWER_BUILD_TOP);
    const bottom = Math.min(GAME_WORLD_HEIGHT - BUILD_MARGIN, TOWER_BUILD_BOTTOM - halfCell);
    return {
      x: this.clamp(Math.floor(x / TOWER_GRID_SIZE) * TOWER_GRID_SIZE + halfCell, BUILD_MARGIN, GAME_WORLD_WIDTH - BUILD_MARGIN),
      y: this.clamp(Math.floor((y - top) / TOWER_GRID_SIZE) * TOWER_GRID_SIZE + top + halfCell, top + halfCell, bottom)
    };
  }

  private findTowerTarget(tower: TowerModel) {
    const now = Date.now();
    if (tower.definition.id === "zeynep-3") {
      const composition = this.getZeynepSynthesisComposition(tower);
      if (!composition.mode) {
        return undefined;
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

    const range = isGuidedHit ? Number.POSITIVE_INFINITY : this.getTowerRange(tower);
    this.perfCounters.targetSearches += 1;
    const candidates = Array.from(this.enemies.values())
      .filter((enemy) => {
        this.perfCounters.targetChecks += 1;
        return this.canTowerTargetEnemy(tower, enemy) && distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= range * range;
      });

    if (tower.definition.id === "warrior-4") {
      return candidates.sort((a, b) => Number(b.type === "brute") - Number(a.type === "brute") || b.pathDistance - a.pathDistance)[0];
    }

    if (tower.definition.id === "warrior-5") {
      return candidates.sort((a, b) => this.getTrackingStackCount(b, now) - this.getTrackingStackCount(a, now) || b.pathDistance - a.pathDistance)[0];
    }

    return candidates.sort((a, b) => b.pathDistance - a.pathDistance)[0];
  }

  private canTowerTargetEnemy(tower: TowerModel, enemy: EnemyModel) {
    if (enemy.movementKind !== "air") {
      return true;
    }

    return tower.definition.id === "warrior-1" ||
      tower.definition.id === "warrior-4" ||
      tower.definition.id === "warrior-6" ||
      tower.definition.id === "zeynep-1" ||
      tower.definition.id === "zeynep-2" ||
      (tower.definition.id === "zeynep-3" && Boolean(this.getZeynepSynthesisComposition(tower).mode));
  }

  private damageEnemy(enemy: EnemyModel, damage: number, slowMs: number, sourceDefinitionId = "", sourceOwnerId = "", damageType: DamageType = "true", maxHealthDamageRatio = 0, sourceTowerLevel = 1, sourceTowerId = "") {
    if (!this.enemies.has(enemy.id)) {
      return false;
    }

    this.perfCounters.damageEvents += 1;
    const now = Date.now();
    const trackingStacks = this.getTrackingStackCount(enemy, now);
    const trackingBonus = sourceDefinitionId !== "warrior-1" ? 1 + trackingStacks * 0.2 : 1;
    const guidanceBonus = this.isEnemyInProjectileGuidance(enemy, now) ? PROJECTILE_GUIDANCE_DAMAGE_MULTIPLIER : 1;
    const result = calculateDamageTaken(
      { amount: damage * trackingBonus * guidanceBonus, damageType },
      {
        armor: enemy.armor,
        shield: enemy.shield,
        damageResistances: enemy.damageResistances
      }
    );
    enemy.shield = result.remainingShield;
    let hpDamage = result.hpDamage;
    if (maxHealthDamageRatio > 0 && enemy.shield <= 0) {
      hpDamage += enemy.maxHp * maxHealthDamageRatio;
    }
    const dealtAmount = result.shieldDamage + Math.min(enemy.hp, hpDamage);
    enemy.hp -= hpDamage;
    this.addDamageEvent(enemy, result.shieldDamage + hpDamage);
    this.recordTowerDamage(sourceTowerId, dealtAmount, now);
    if (sourceDefinitionId === "warrior-1") {
      const duration = applyStatusResistance(6500, enemy.statusResistances.tracking);
      this.applyTrackingStacks(enemy, now + scaleGameDuration(duration), this.getTrackingStackLimit(sourceTowerLevel));
    }
    if (slowMs > 0) {
      const duration = applyStatusResistance(slowMs, enemy.statusResistances.slow);
      enemy.slowUntil = Math.max(enemy.slowUntil, now + scaleGameDuration(duration));
    }

    if (enemy.hp > 0) {
      return false;
    }

    this.enemies.delete(enemy.id);
    this.teamGold += enemy.reward;
    this.kills += 1;
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

  private damageEnemyFromTower(tower: TowerModel, enemy: EnemyModel, damage: number, slowMs: number) {
    return this.damageEnemy(enemy, damage, slowMs, tower.definition.id, tower.ownerId, tower.definition.damageType ?? "physical", this.getServerLinkedMaxHealthDamageRatio(tower), tower.level, tower.id);
  }

  private damageEnemyFromTowerAs(tower: TowerModel, enemy: EnemyModel, damage: number, slowMs: number, damageType: DamageType, maxHealthDamageRatio?: number) {
    return this.damageEnemy(enemy, damage, slowMs, tower.definition.id, tower.ownerId, damageType, maxHealthDamageRatio ?? this.getServerLinkedMaxHealthDamageRatio(tower), tower.level, tower.id);
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
    return this.projectileGuidanceUntil > now && distanceSq(enemy.x, enemy.y, this.projectileGuidanceX, this.projectileGuidanceY) <= PROJECTILE_GUIDANCE_RADIUS * PROJECTILE_GUIDANCE_RADIUS;
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
    const id = `k${this.nextKillEventId++}`;
    this.killEvents.set(id, {
      id,
      ownerId,
      enemyId,
      serverTime: now,
      ttlMs: 2200
    });

    if (this.killEvents.size > 80) {
      const oldestId = this.killEvents.keys().next().value;
      if (oldestId) {
        this.killEvents.delete(oldestId);
      }
    }

    this.recordPlayerKillStreak(ownerId, now);
  }

  private recordPlayerKillStreak(ownerId: string, serverTime: number) {
    const killTimes = [...(this.playerKillStreakTimes.get(ownerId) ?? []), serverTime]
      .filter((time) => serverTime - time <= Math.max(...KILL_STREAK_RULES.map((rule) => rule.windowMs)));
    this.playerKillStreakTimes.set(ownerId, killTimes);

    const rule = this.getTriggeredKillStreakRule(ownerId, serverTime, killTimes);
    if (!rule) {
      return;
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

    this.applyKillStreakBuff(ownerId, rule, serverTime);
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
      amount: Math.max(1, Math.round(amount)),
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
    for (const enemy of this.enemies.values()) {
      const duration = applyStatusResistance(slowMs, enemy.statusResistances.slow);
      enemy.slowUntil = Math.max(enemy.slowUntil, Date.now() + scaleGameDuration(duration));
    }
  }

  private updateSkillCooldowns(deltaTime: number) {
    for (const player of this.state.players.values()) {
      player.skill1CooldownMs = Math.max(0, player.skill1CooldownMs - deltaTime);
      player.skill2CooldownMs = Math.max(0, player.skill2CooldownMs - deltaTime);
      player.skill3CooldownMs = Math.max(0, player.skill3CooldownMs - deltaTime);
    }
  }

  private chargeUltimates(seconds: number) {
    for (const player of this.state.players.values()) {
      player.ultimateCharge = Math.min(100, player.ultimateCharge + this.getUltimateChargeGain(player, seconds * 1.4));
    }
  }

  private getUltimateChargeGain(player: Player, amount: number) {
    return player.characterId === "warrior" ? amount * ATAKAN_ULTIMATE_CHARGE_MULTIPLIER : amount;
  }

  private getSnapshot(): GameSnapshot {
    const now = Date.now();
    this.refreshZeynepFormations();
    return {
      serverTime: now,
      map: this.activeMap,
      players: Array.from(this.state.players.entries()).map(([id, player]) => ({
        id,
        name: player.name,
        characterId: player.characterId,
        goldSpent: player.goldSpent,
        towersBuilt: player.towersBuilt,
        ultimateCharge: Math.round(player.ultimateCharge),
        skillCooldowns: [
          Math.ceil(player.skill1CooldownMs / 1000),
          Math.ceil(player.skill2CooldownMs / 1000),
          Math.ceil(player.skill3CooldownMs / 1000)
        ],
        reputation: player.characterId === "zeynep" ? Math.floor(player.reputation + 0.0001) : undefined,
        authorityChain: player.characterId === "zeynep" ? player.authorityChain : undefined,
        authorityQuality: player.characterId === "zeynep" ? player.authorityQuality : undefined
      })),
      enemies: Array.from(this.enemies.values()).map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        hp: Math.max(0, enemy.hp),
        maxHp: enemy.maxHp,
        armor: enemy.armor,
        healthRegenPerSecond: enemy.healthRegenPerSecond,
        shield: Math.max(0, enemy.shield),
        maxShield: enemy.maxShield,
        movementKind: enemy.movementKind,
        pathDistance: enemy.pathDistance,
        pathId: enemy.pathId,
        trackingStacks: this.getTrackingStackCount(enemy, now),
        isTracked: this.getTrackingStackCount(enemy, now) > 0,
        isFeared: enemy.fearUntil > now
      })),
      towers: Array.from(this.towers.values()).map((tower) => ({
        id: tower.id,
        ownerId: tower.ownerId,
        ownerName: tower.ownerName,
        characterId: tower.characterId,
        definitionId: tower.definition.id,
        name: tower.definition.name,
        x: tower.x,
        y: tower.y,
        level: tower.level,
        range: this.getTowerRange(tower),
        color: tower.definition.color,
        hp: Math.round(tower.hp),
        maxHp: Math.round(tower.maxHp),
        status: this.getTowerStatus(tower),
        damageDealt: Math.round(tower.damageDealt),
        currentDps: roundMetric(this.getTowerCurrentDps(tower, now)),
        waveBonusLevel: tower.definition.id === "warrior-6" ? tower.waveBonusLevel : undefined,
        serverLinkWaveAge: this.getServerLinkWaveAge(tower),
        linkedTowerIds: [...tower.linkedTowerIds],
        zeynepFormationSize: tower.zeynepFormationSize > 0 ? tower.zeynepFormationSize : undefined,
        zeynepFormationLevel: tower.zeynepFormationLevel > 0 ? tower.zeynepFormationLevel : undefined
      })),
      projectiles: Array.from(this.projectiles.values()).map((projectile) => ({
        id: projectile.id,
        kind: projectile.kind,
        source: projectile.source,
        definitionId: projectile.definitionId,
        x: projectile.x,
        y: projectile.y
      })),
      drones: Array.from(this.drones.values()).map((drone) => ({
        id: drone.id,
        mode: drone.mode,
        x: drone.x,
        y: drone.y
      })),
      beams: Array.from(this.beams.values())
        .filter((beam) => !beam.delayMs || beam.delayMs <= 0)
        .map((beam) => ({
          id: beam.id,
          definitionId: beam.definitionId,
          x1: beam.x1,
          y1: beam.y1,
          x2: beam.x2,
          y2: beam.y2,
          scanX: beam.scanX,
          scanY: beam.scanY,
          width: beam.width,
          color: beam.color,
          overdrive: beam.overdrive,
          ttlMs: Math.max(0, Math.round(beam.ttlMs))
        })),
      damageEvents: Array.from(this.damageEvents.values()).map((event) => ({
        id: event.id,
        x: event.x,
        y: event.y,
        amount: event.amount
      })),
      killEvents: Array.from(this.killEvents.values()).map((event) => ({
        id: event.id,
        ownerId: event.ownerId,
        enemyId: event.enemyId,
        serverTime: event.serverTime
      })),
      team: {
        health: this.teamHealth,
        maxHealth: MAX_TEAM_HEALTH,
        gold: this.teamGold,
        wave: this.wave,
        enemiesLeft: Math.max(0, this.waveTarget - this.waveSpawned) + this.enemies.size,
        kills: this.kills
      }
    };
  }

  private findTowerDefinition(characterId: CharacterId, definitionId: string) {
    return towerCatalog[characterId].find((definition) => definition.id === definitionId);
  }

  private getTowerRange(tower: TowerModel) {
    if (tower.definition.id === "warrior-2") {
      return GAME_WORLD_HEIGHT;
    }

    const now = Date.now();
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower);
    const zeynepRangeMultiplier = this.zeynepRangeUntil > now ? this.zeynepRangeMultiplier : 1;
    if (tower.definition.id === "warrior-6" && tower.waveBonusLevel >= 5) {
      return (tower.definition.range * 2 + (tower.level - 1) * 11) * passiveMultiplier * zeynepRangeMultiplier;
    }

    if (tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > now) {
      return GAME_WORLD_HEIGHT;
    }

    if (tower.definition.id === "zeynep-2") {
      return getZeynepShowcaseBeamLength(tower.level) * passiveMultiplier * zeynepRangeMultiplier;
    }

    if (tower.definition.id === "zeynep-3") {
      const composition = this.getZeynepSynthesisComposition(tower);
      if (composition.copySourceTower?.definition.id === "zeynep-2") {
        return getZeynepShowcaseBeamLength(composition.copySourceTower.level) * passiveMultiplier * zeynepRangeMultiplier;
      }
      if (composition.copySourceTower?.definition.id === "zeynep-1") {
        return (composition.copySourceTower.definition.range + (composition.copySourceTower.level - 1) * 11) * passiveMultiplier * zeynepRangeMultiplier;
      }
    }

    return (tower.definition.range + (tower.level - 1) * 11) * passiveMultiplier * zeynepRangeMultiplier;
  }

  private getTowerFireInterval(tower: TowerModel) {
    const now = Date.now();
    const stackMultiplier = tower.definition.id === "warrior-6" ? getUcubeStackIntervalMultiplier(tower.focusStacks) : 1;
    const hasteMultiplier = this.damageHasteUntil > now && tower.definition.classType === "damage" ? 1 / 3 : 1;
    const zeynepHasteMultiplier = this.zeynepHasteUntil > now ? 1 / this.zeynepHasteMultiplier : 1;
    const streakHasteMultiplier = this.getTowerStreakFireIntervalMultiplier(tower, now);
    const zeynepFormationMultiplier = getZeynepFormationFireIntervalMultiplier(tower);
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower) > 1 ? 0.9 : 1;

    if (tower.definition.id === "warrior-5") {
      return getDebugLaserFireInterval(tower.level, tower.debugOverdriveUntil > Date.now()) * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * passiveMultiplier;
    }

    if (tower.definition.id === "zeynep-3") {
      const composition = this.getZeynepSynthesisComposition(tower);
      const baseInterval = composition.mode === "dual-projectile" || composition.mode === "copy-projectile"
        ? getZeynepHizaFireInterval(composition.copySourceTower?.level ?? tower.level)
        : composition.mode === "copy-showcase"
          ? composition.copySourceTower?.definition.fireIntervalMs ?? tower.definition.fireIntervalMs
          : tower.definition.fireIntervalMs;
      return Math.max(80, baseInterval * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier);
    }

    if (tower.definition.hitType === "impact") {
      return Math.max(80, tower.definition.fireIntervalMs * stackMultiplier * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier);
    }

    if (tower.definition.id === "warrior-1") {
      return getTrackerFireInterval(tower.level) * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier;
    }

    if (tower.definition.id === "zeynep-1") {
      return getZeynepHizaFireInterval(tower.level) * stackMultiplier * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier;
    }

    const levelMultiplier = tower.definition.id === "warrior-4" ? 1 - (tower.level - 1) * 0.17 : 1 - (tower.level - 1) * 0.1;
    const minimumInterval = 80;
    return Math.max(minimumInterval, tower.definition.fireIntervalMs * levelMultiplier * stackMultiplier * hasteMultiplier * zeynepHasteMultiplier * zeynepFormationMultiplier * streakHasteMultiplier * passiveMultiplier);
  }

  private getTowerDamage(tower: TowerModel) {
    const now = Date.now();
    let damage = tower.definition.damage * (1 + (tower.level - 1) * 0.42) * this.getAtakanPassiveMultiplier(tower) * this.getTowerStreakDamageMultiplier(tower, now) * getZeynepFormationDamageMultiplier(tower);

    if (tower.definition.id === "warrior-4") {
      damage *= getObsessionDamageMultiplier(tower.level);
    }

    if (tower.definition.id === "warrior-5") {
      damage *= getDebugLaserDamageMultiplier(tower.level, tower.debugOverdriveUntil > Date.now());
    }

    if (tower.definition.id === "warrior-6") {
      damage *= getUcubeGrowthDamageMultiplier(tower.level);
    }

    if (tower.definition.id === "zeynep-1") {
      damage *= getZeynepHizaDamageCompensation(tower.level);
    }

    if (tower.definition.hitType === "impact") {
      damage *= this.getServerLinkedImpactDamageMultiplier(tower);
    }

    if (tower.definition.id === "warrior-4") {
      damage *= 1 + tower.focusStacks * 0.2;
    }

    if (tower.definition.id === "warrior-6" && tower.waveBonusLevel >= 3) {
      damage *= 1.2;
    }

    if (tower.definition.id === "warrior-6" && tower.waveBonusLevel >= 6) {
      damage *= getUcubeLateDamageMultiplier(tower.level);
    }

    if (tower.definition.id === "warrior-6" && tower.waveBonusLevel >= 7) {
      damage *= 2;
    }

    if (tower.definition.hitType === "impact") {
      damage *= this.getImpactFireRateDamageCompensation(tower);
    }

    return damage;
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
    const stackMultiplier = tower.definition.id === "warrior-6" ? getUcubeStackIntervalMultiplier(tower.focusStacks) : 1;
    const hasteMultiplier = this.damageHasteUntil > Date.now() && tower.definition.classType === "damage" ? 1 / 3 : 1;
    const zeynepHasteMultiplier = this.zeynepHasteUntil > Date.now() ? 1 / this.zeynepHasteMultiplier : 1;
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower) > 1 ? 0.9 : 1;
    const previousLevelMultiplier = tower.definition.id === "warrior-4" ? 1 - (tower.level - 1) * 0.17 : 1 - (tower.level - 1) * 0.1;
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
    if (tower.offlineUntil > now) {
      return "Tukenmis";
    }
    if (tower.overheatMs > 0) {
      return "Hararet";
    }
    if (tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > now) {
      return "Overdrive";
    }
    if (tower.streakDamageUntil > now || tower.streakHasteUntil > now) {
      const damageBonus = tower.streakDamageUntil > now ? Math.round((tower.streakDamageMultiplier - 1) * 100) : 0;
      const hasteBonus = tower.streakHasteUntil > now ? Math.round((tower.streakHasteMultiplier - 1) * 100) : 0;
      return hasteBonus > 0 ? `Streak +${damageBonus}%/+${hasteBonus}%` : `Streak +${damageBonus}%`;
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

  private updateUcubeRhythm(tower: TowerModel, target: EnemyModel | undefined, deltaTime: number) {
    if (tower.definition.id !== "warrior-6") {
      return;
    }

    if (!target) {
      tower.activeMs = 0;
      tower.focusStacks = 0;
      tower.focusTargetId = "";
      return;
    }

    tower.activeMs += deltaTime;
    tower.focusTargetId = target.id;
    tower.focusStacks = Math.min(tower.waveBonusLevel >= 4 ? 15 : 10, Math.floor(tower.activeMs / 1000));

    if (tower.waveBonusLevel < 6 && tower.activeMs >= 20000) {
      tower.overheatMs = 10000;
      tower.activeMs = 0;
      tower.focusStacks = 0;
    }
  }

  private isTowerIsolated(tower: TowerModel) {
    const towerCell = worldToGrid(tower.x, tower.y);
    for (const other of this.towers.values()) {
      if (other.id === tower.id) {
        continue;
      }

      const otherCell = worldToGrid(other.x, other.y);
      if (Math.abs(otherCell.col - towerCell.col) <= 1 && Math.abs(otherCell.row - towerCell.row) <= 1) {
        return false;
      }
    }

    return true;
  }

  private applyIsolationAura(tower: TowerModel) {
    const range = this.getTowerRange(tower);
    const speedMultiplier = getIsolationAuraSpeedMultiplier(tower.level);

    for (const enemy of this.enemies.values()) {
      this.perfCounters.aoeChecks += 1;
      if (distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= range * range) {
        const resistance = enemy.statusResistances.slow ?? 0;
        const resistedMultiplier = 1 - (1 - speedMultiplier) * Math.max(0, 1 - resistance);
        enemy.auraSlowMultiplier = Math.min(enemy.auraSlowMultiplier, resistedMultiplier);
      }
    }
  }

  private resetAuraSlows() {
    for (const enemy of this.enemies.values()) {
      enemy.auraSlowMultiplier = 1;
    }
  }

  private advanceWaveGrowth() {
    for (const tower of this.towers.values()) {
      if (tower.definition.id === "warrior-2") {
        tower.linkedTowerIds = tower.linkedTowerIds.filter((towerId) => this.towers.has(towerId));
        for (const linkedTowerId of tower.linkedTowerIds) {
          tower.linkedTowerWaveAges[linkedTowerId] = (tower.linkedTowerWaveAges[linkedTowerId] ?? 0) + 1;
        }
      }
    }

    for (const tower of this.towers.values()) {
      if (tower.definition.id === "warrior-6") {
        const previousLevel = tower.waveBonusLevel;
        tower.waveBonusProgress += 1;
        tower.waveBonusLevel = getUcubeWaveBonusLevel(tower.waveBonusProgress);
        if (previousLevel < 5 && tower.waveBonusLevel >= 5) {
          tower.maxHp *= 2;
          tower.hp = tower.maxHp;
        }
      }
    }
  }

  private prepareTowerShot(tower: TowerModel, target: EnemyModel) {
    if (tower.definition.id !== "warrior-4") {
      return;
    }

    if (tower.focusTargetId === target.id) {
      tower.focusStacks = Math.min(10, tower.focusStacks + 1);
    } else {
      tower.focusTargetId = target.id;
      tower.focusStacks = 0;
    }
  }

  private applyPostHitEffects(projectile: ProjectileModel, target: EnemyModel) {
    const tower = this.towers.get(projectile.towerId);
    if (!tower) {
      return;
    }

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

    if (tower.waveBonusLevel >= 1) {
      const chainedEnemies = Array.from(this.enemies.values())
        .filter((enemy) => {
          this.perfCounters.chainChecks += 1;
          return enemy.id !== target.id && enemy.pathDistance < target.pathDistance;
        })
        .sort((a, b) => b.pathDistance - a.pathDistance)
        .slice(0, 2);
      for (const enemy of chainedEnemies) {
        this.setUcubeChainBeam(projectile, target, enemy);
        this.damageEnemy(enemy, this.getProjectileDamage(projectile, getUcubeChainDamageMultiplier(tower)), 0, projectile.definitionId, tower.ownerId, projectile.damageType, projectile.maxHealthDamageRatio, tower.level, tower.id);
      }
    }

    if (tower.waveBonusLevel >= 2 && this.enemies.has(target.id)) {
      target.pathDistance = Math.max(0, target.pathDistance - 18);
    }
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
    const maxTickMs = this.perfFrames.reduce((max, sample) => Math.max(max, sample.tickMs), 0);
    const snapshotHz = frame.tickMs > 0 ? 1000 / frame.tickMs : 0;

    this.latestPerfSnapshot = {
      tickMs: roundMetric(average("tickMs")),
      tickMaxMs: roundMetric(maxTickMs),
      snapshotBytes: Math.round(average("snapshotBytes")),
      snapshotHz: roundMetric(snapshotHz),
      sections: {
        spawnMs: roundMetric(average("spawnMs")),
        towersMs: roundMetric(average("towersMs")),
        projectilesMs: roundMetric(average("projectilesMs")),
        enemiesMs: roundMetric(average("enemiesMs")),
        cooldownsMs: roundMetric(average("cooldownsMs")),
        ultimatesMs: roundMetric(average("ultimatesMs")),
        snapshotMs: roundMetric(average("snapshotMs"))
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
    .map((spawn) => pathToWorldPoints(findPathToNearestNexus(map, spawn)))
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

  const fallbackPoints = pathToWorldPoints(findPathToNearestNexus(createDefaultEditableMap(), getMapPoints(createDefaultEditableMap(), "spawn")[0]));
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

function getAirSpawnPoint(path: RuntimePath | undefined) {
  const nexus = path?.points[path.points.length - 1] ?? { x: GAME_WORLD_WIDTH / 2, y: GAME_WORLD_HEIGHT - 26 };
  const corners = [
    gridToWorld(0, 0),
    gridToWorld(MAP_GRID_COLS - 1, 0),
    gridToWorld(0, MAP_GRID_ROWS - 1),
    gridToWorld(MAP_GRID_COLS - 1, MAP_GRID_ROWS - 1)
  ];

  return corners.sort((a, b) => distanceSq(b.x, b.y, nexus.x, nexus.y) - distanceSq(a.x, a.y, nexus.x, nexus.y))[0] ?? gridToWorld(0, 0);
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

function getWaveEnemyCount(wave: number) {
  const count = Math.max(1, Math.round(BASE_WAVE_ENEMY_COUNT * ENEMY_COUNT_WAVE_MULTIPLIER ** Math.max(0, wave - 1)));
  return count;
}

function getWaveHpMultiplier(wave: number) {
  return ENEMY_HP_WAVE_MULTIPLIER ** Math.max(0, wave - 1);
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

function getIsolationAuraSpeedMultiplier(level: number) {
  return Math.max(0.25, 0.48 - (level - 1) * 0.026);
}

function getObsessionDamageMultiplier(level: number) {
  const multipliers = [1, 1.018, 1.036, 1.054, 1.072, 1.085349, 0.94697, 1.05753, 1.144, 1.162];
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}

function getObsessionFearDurationMs(level: number) {
  if (level >= 10) {
    return 4000;
  }

  return level >= 7 ? STATUS_EFFECTS.fear.durationMs : 1500;
}

function getDebugLaserDamageMultiplier(level: number, overdrive: boolean) {
  const normalMultipliers = [1.3333, 1.5904, 1.89, 2.2505, 2.432, 2.508, 2.5632, 2.5976, 2.6112, 2.604];
  const overdriveMultipliers = [1.92, 2.0611, 2.1773, 2.2685, 2.3347, 2.4077, 2.4607, 2.4937, 2.5068, 2.4998];
  const multipliers = overdrive ? overdriveMultipliers : normalMultipliers;
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}

function getDebugLaserFireInterval(level: number, overdrive: boolean) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  const normalRealMs = clampedLevel <= 5
    ? 200 - (clampedLevel - 1) * 10
    : 160 - (clampedLevel - 5) * 8;
  const realMs = overdrive ? normalRealMs / 2 : normalRealMs;
  return realMs * GAME_SPEED_MULTIPLIER;
}

function getUcubeGrowthDamageMultiplier(level: number) {
  const multipliers = [0.45, 0.4, 0.34, 0.34, 0.35, 0.42, 0.24, 0.25, 0.64, 1.05];
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}

function getUcubeWaveBonusLevel(completedWaves: number) {
  return UCUBE_WAVE_BONUS_THRESHOLDS.filter((threshold) => completedWaves >= threshold).length;
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

function getTrackerFireInterval(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 720 - ((clampedLevel - 1) / 9) * (720 - 333);
}

function getZeynepHizaFireInterval(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 500 - ((clampedLevel - 1) / 9) * 300;
}

function getZeynepHizaDamageCompensation(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  const oldInterval = Math.max(80, 330 * (1 - (clampedLevel - 1) * 0.1));
  const newInterval = getZeynepHizaFireInterval(clampedLevel);
  return newInterval / oldInterval;
}

function getUcubeLateDamageMultiplier(level: number) {
  if (level >= 10) return 1.3;
  if (level >= 9) return 1.4;
  if (level >= 8) return 1.5;
  if (level >= 7) return 1.6;
  return 1;
}

function getUcubeChainDamageMultiplier(tower: TowerModel) {
  if (tower.waveBonusLevel < 1) return 0;
  if (tower.level >= 10) return 1;
  if (tower.level >= 9) return 0.93;
  if (tower.level >= 8) return 0.85;
  if (tower.level >= 7) return 0.72;
  if (tower.level >= 6) return 0.5;
  if (tower.level >= 5) return 0.48;
  if (tower.level >= 4) return 0.46;
  return 0.42;
}

function getZeynepShowcaseBeamLength(level: number) {
  return ZEYNEP_SHOWCASE_BASE_LENGTH + (Math.max(1, level) - 1) * ZEYNEP_SHOWCASE_LENGTH_PER_LEVEL;
}

function areZeynepFormationNeighbors(towerA: TowerModel, towerB: TowerModel) {
  const dx = Math.abs(towerA.x - towerB.x);
  const dy = Math.abs(towerA.y - towerB.y);
  return dx <= TOWER_GRID_SIZE + 2 && dy <= TOWER_GRID_SIZE + 2 && dx + dy > 2;
}

function isCompleteZeynepFormation(group: TowerModel[]) {
  for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
      if (!areZeynepFormationNeighbors(group[firstIndex], group[secondIndex])) {
        return false;
      }
    }
  }
  return true;
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

function scaleGameDuration(durationMs: number) {
  return durationMs / GAME_SPEED_MULTIPLIER;
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getAngleToPathDistance(path: RuntimePath | undefined, x: number, y: number, pathDistance: number) {
  const point = getPointAlongRuntimePath(path, pathDistance);
  return Math.atan2(point.y - y, point.x - x);
}

function getSignedShortestAngleDelta(angleA: number, angleB: number) {
  return Math.atan2(Math.sin(angleB - angleA), Math.cos(angleB - angleA));
}

function getDebugLaserPathSweepAngle(path: RuntimePath | undefined, x: number, y: number, startDistance: number, endDistance: number, elapsedSeconds: number) {
  let remainingAngle = DEBUG_LASER_MAX_SWEEP_RADIANS_PER_SECOND * elapsedSeconds;
  const totalDistance = Math.abs(startDistance - endDistance);
  if (totalDistance <= 0 || remainingAngle <= 0) {
    return getAngleToPathDistance(path, x, y, startDistance);
  }

  const direction = Math.sign(endDistance - startDistance) || -1;
  const sampleStep = 8;
  let previousAngle = getAngleToPathDistance(path, x, y, startDistance);

  for (let distanceOffset = sampleStep; distanceOffset <= totalDistance + sampleStep; distanceOffset += sampleStep) {
    const pathDistance = startDistance + direction * Math.min(distanceOffset, totalDistance);
    const nextAngle = getAngleToPathDistance(path, x, y, pathDistance);
    const angleDelta = getSignedShortestAngleDelta(previousAngle, nextAngle);
    const angleStep = Math.abs(angleDelta);

    if (remainingAngle <= angleStep) {
      return previousAngle + Math.sign(angleDelta) * remainingAngle;
    }

    remainingAngle -= angleStep;
    previousAngle += angleDelta;

    if (distanceOffset >= totalDistance) {
      break;
    }
  }

  return previousAngle;
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
  return enemy.type === "brute" ? 19 : enemy.type === "runner" ? 13 : 15;
}

function didDebugLaserSweepHitEnemy(
  tower: TowerModel,
  enemy: EnemyModel,
  previousAngle: number,
  currentAngle: number,
  endX: number,
  endY: number
) {
  const hitRadius = DEBUG_LASER_OVERDRIVE_BEAM_RADIUS + getEnemyCollisionRadius(enemy);
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

function getRayToWorldEdge(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / length;
  const ny = dy / length;
  return getRayDirectionToWorldEdge(x1, y1, nx, ny);
}

function getRayAngleToWorldEdge(x1: number, y1: number, angle: number) {
  return getRayDirectionToWorldEdge(x1, y1, Math.cos(angle), Math.sin(angle));
}

function getMirrorBeamSegments(x1: number, y1: number, targetX: number, targetY: number) {
  const dx = targetX - x1;
  const dy = targetY - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / length;
  const ny = dy / length;
  const firstHit = getRayBoundaryHit(x1, y1, nx, ny);
  const reflectedX = firstHit.axis === "x" ? -nx : nx;
  const reflectedY = firstHit.axis === "y" ? -ny : ny;
  const secondStartX = firstHit.x + reflectedX * 0.01;
  const secondStartY = firstHit.y + reflectedY * 0.01;
  const secondHit = getRayBoundaryHit(secondStartX, secondStartY, reflectedX, reflectedY);

  return [
    makeRaySegment(x1, y1, firstHit.x, firstHit.y),
    makeRaySegment(firstHit.x, firstHit.y, secondHit.x, secondHit.y)
  ];
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

function getRayBoundaryHit(x1: number, y1: number, nx: number, ny: number) {
  const candidates: Array<{ t: number; axis: "x" | "y" }> = [];

  if (nx > 0) {
    candidates.push({ t: (GAME_WORLD_WIDTH - x1) / nx, axis: "x" });
  } else if (nx < 0) {
    candidates.push({ t: (0 - x1) / nx, axis: "x" });
  }

  if (ny > 0) {
    candidates.push({ t: (GAME_WORLD_HEIGHT - y1) / ny, axis: "y" });
  } else if (ny < 0) {
    candidates.push({ t: (0 - y1) / ny, axis: "y" });
  }

  const hit = candidates
    .filter((candidate) => candidate.t > 0.0001)
    .sort((a, b) => a.t - b.t)[0] ?? { t: 1, axis: "x" as const };

  return {
    x: Math.min(GAME_WORLD_WIDTH, Math.max(0, x1 + nx * hit.t)),
    y: Math.min(GAME_WORLD_HEIGHT, Math.max(0, y1 + ny * hit.t)),
    axis: hit.axis
  };
}

function getPointOnRay(x1: number, y1: number, angle: number, distance: number) {
  return {
    x: x1 + Math.cos(angle) * distance,
    y: y1 + Math.sin(angle) * distance
  };
}

function getRayDirectionToWorldEdge(x1: number, y1: number, nx: number, ny: number) {
  const candidates: number[] = [];

  if (nx > 0) {
    candidates.push((GAME_WORLD_WIDTH - x1) / nx);
  } else if (nx < 0) {
    candidates.push((0 - x1) / nx);
  }

  if (ny > 0) {
    candidates.push((GAME_WORLD_HEIGHT - y1) / ny);
  } else if (ny < 0) {
    candidates.push((0 - y1) / ny);
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
