import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import { performance } from "node:perf_hooks";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  MAP_PATH,
  PATH_WIDTH,
  STATUS_EFFECTS,
  TOWER_BUILD_BOTTOM,
  TOWER_BUILD_TOP,
  TOWER_GRID_SIZE,
  getTowerRepairCost,
  getTowerUpgradeCost,
  towerCatalog,
  type CharacterId,
  type DamageEventSnapshot,
  type EnemyType,
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
const DEBUG_LASER_OVERDRIVE_DURATION_MS = 2000;
const DEBUG_LASER_MAX_SWEEP_RADIANS_PER_SECOND = degreesToRadians(30);
const DEBUG_LASER_OVERDRIVE_BEAM_RADIUS = 12;
const DEBUG_LASER_HEAT_WINDOW_MS = 20000;
const DEBUG_LASER_HEAT_LIMIT_MS = 10000;
const DEBUG_LASER_OVERHEAT_MS = 5000;
const TRACKING_MARK_DURATION_MS = 6500;
const TRACKING_STACK_DAMAGE_BONUS = 0.2;
const SHOOTER_TOWER_ATTACK_RANGE = 168;
const SHOOTER_TOWER_ATTACK_COOLDOWN_MS = 1650;

class Player extends Schema {
  @type("string") name = "";
  @type("string") characterId: CharacterId = "warrior";
  @type("number") goldSpent = 0;
  @type("number") towersBuilt = 0;
  @type("number") ultimateCharge = 0;
  @type("number") skill1CooldownMs = 0;
  @type("number") skill2CooldownMs = 0;
  @type("number") skill3CooldownMs = 0;
}

class MatchState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

type JoinOptions = {
  playerName?: string;
  characterId?: CharacterId;
};

type PlaceTowerMessage = {
  definitionId?: string;
  x?: number;
  y?: number;
};

type UpgradeTowerMessage = {
  towerId?: string;
};

type RepairTowerMessage = {
  towerId?: string;
};

type UseSkillMessage = {
  slot?: number;
  x?: number;
  y?: number;
  towerId?: string;
};

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
  speed: number;
  reward: number;
  pathDistance: number;
  slowUntil: number;
  fearUntil: number;
  trackingUntil: number;
  trackingStackUntil: [number, number, number];
  towerAttackCooldownMs: number;
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
  debugSweepStartDistance: number;
  debugSweepEndDistance: number;
  debugSweepLastDamageAt: number;
  debugOverdriveHeatLastAt: number;
  debugOverdriveHeatSegments: DebugOverdriveHeatSegment[];
  linkBurstCooldownMs: number;
  waveBonusLevel: number;
  linkedTowerIds: string[];
  rangeMemoryEnemyIds: string[];
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
  source: "tower";
  targetId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  aoeRadius: number;
  slowMs: number;
};

type BeamModel = BeamSnapshot & {
  ttlMs: number;
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

export class MatchRoom extends Room<MatchState> {
  maxClients = 7;
  private enemies = new Map<string, EnemyModel>();
  private towers = new Map<string, TowerModel>();
  private projectiles = new Map<string, ProjectileModel>();
  private beams = new Map<string, BeamModel>();
  private damageEvents = new Map<string, DamageEventModel>();
  private killEvents = new Map<string, KillEventModel>();
  private nextEnemyId = 1;
  private nextTowerId = 1;
  private nextProjectileId = 1;
  private nextBeamId = 1;
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

    this.onMessage("repairTower", (client, message: RepairTowerMessage) => {
      this.repairTower(client, message);
    });

    this.onMessage("useSkill", (client, message: UseSkillMessage) => {
      this.useSkill(client, message);
    });

    this.onMessage("useUltimate", (client) => {
      this.useUltimate(client);
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
    const player = new Player();
    player.name = options.playerName?.slice(0, 20) || "Oyuncu";
    player.characterId = this.getCharacterId(options.characterId);

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private update(deltaTime: number) {
    const seconds = deltaTime / 1000;
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
    this.updateSpawning(deltaTime);
    timings.spawnMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.updateTowers(deltaTime);
    timings.towersMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.updateProjectiles(seconds);
    this.updateBeams(deltaTime);
    this.updateDamageEvents(deltaTime);
    timings.projectilesMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.updateEnemies(seconds);
    this.updateEnemyTowerAttacks(deltaTime);
    timings.enemiesMs = performance.now() - sectionStart;

    sectionStart = performance.now();
    this.updateSkillCooldowns(deltaTime);
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
    const waveScale = getWaveHpMultiplier(this.wave);
    const maxHp = Math.round((type === "brute" ? 76 : type === "runner" ? 30 : type === "shooter" ? 42 : 46) * waveScale);
    const speed = (type === "runner" ? 78 : type === "brute" ? 34 : type === "shooter" ? 44 : 50) + this.wave * 2.4;
    const start = MAP_PATH[0];
    const id = `e${this.nextEnemyId++}`;

    this.enemies.set(id, {
      id,
      type,
      x: start.x,
      y: start.y,
      hp: maxHp,
      maxHp,
      speed,
      reward: type === "brute" ? 18 : type === "runner" ? 11 : type === "shooter" ? 14 : 12,
      pathDistance: 0,
      slowUntil: 0,
      fearUntil: 0,
      trackingUntil: 0,
      trackingStackUntil: [0, 0, 0],
      towerAttackCooldownMs: Math.random() * 700
    });
  }

  private updateTowers(deltaTime: number) {
    const now = Date.now();
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
      source: "tower",
      targetId: target.id,
      x: tower.x,
      y: tower.y,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      damage: this.getTowerDamage(tower),
      aoeRadius: tower.definition.aoeRadius + (tower.level - 1) * 5,
      slowMs: tower.definition.slowMs + (tower.level - 1) * 90
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
      source: "tower",
      targetId: target.id,
      x: sourceTower.x,
      y: sourceTower.y,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      damage,
      aoeRadius,
      slowMs
    });
  }

  private updateBeams(deltaTime: number) {
    for (const [id, beam] of this.beams) {
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
    const wasTracked = getTrackingStackCount(target, now) > 0;
    const killed = this.damageEnemy(target, baseDamage, tower.definition.slowMs, tower.definition.id, tower.ownerId);

    if (wasTracked && killed) {
      tower.debugSweepStartedAt = now;
      tower.debugSweepStartDistance = target.pathDistance;
      tower.debugSweepEndDistance = this.getRearMostEnemyDistance(target.pathDistance);
      tower.debugSweepLastDamageAt = 0;
      tower.debugOverdriveHeatLastAt = now;
      tower.debugOverdriveUntil = now + DEBUG_LASER_OVERDRIVE_DURATION_MS;
      this.updateDebugLaserSweep(tower);
      return;
    }

    this.setBeam(tower, target.x, target.y, false);
  }

  private setBeam(tower: TowerModel, x2: number, y2: number, overdrive: boolean, scanX?: number, scanY?: number) {
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
      ttlMs: overdrive ? 180 : 140
    });
  }

  private setInstantBeam(id: string, x1: number, y1: number, x2: number, y2: number, definitionId: string, color: number, width: number, ttlMs: number) {
    this.beams.set(id, {
      id,
      definitionId,
      x1,
      y1,
      x2,
      y2,
      width,
      color,
      overdrive: false,
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

  private updateDebugLaserSweep(tower: TowerModel) {
    const now = Date.now();
    if (this.updateDebugLaserOverdriveHeat(tower, now)) {
      return;
    }

    if (tower.debugSweepStartedAt <= 0) {
      tower.debugSweepStartedAt = now;
    }

    const elapsedSeconds = this.clamp((now - tower.debugSweepStartedAt) / 1000, 0, DEBUG_LASER_OVERDRIVE_DURATION_MS / 1000);
    const currentAngle = getDebugLaserPathSweepAngle(
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
      tower.x,
      tower.y,
      tower.debugSweepStartDistance,
      tower.debugSweepEndDistance,
      previousElapsedSeconds
    );

    for (const enemy of Array.from(this.enemies.values())) {
      if (didDebugLaserSweepHitEnemy(tower, enemy, previousAngle, currentAngle, end.x, end.y)) {
        this.damageEnemy(enemy, damage, 0, tower.definition.id, tower.ownerId);
      }
    }
    tower.cooldownMs = 50;
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
    tower.debugSweepLastDamageAt = 0;
    tower.debugOverdriveHeatLastAt = 0;
    tower.debugOverdriveHeatSegments = [];
    this.beams.delete(`beam-${tower.id}`);
  }

  private getRearMostEnemyDistance(startDistance: number) {
    const behindEnemies = Array.from(this.enemies.values())
      .filter((enemy) => enemy.pathDistance < startDistance)
      .sort((a, b) => a.pathDistance - b.pathDistance);

    return behindEnemies[0]?.pathDistance ?? Math.max(0, startDistance - 260);
  }
  private updateServerLinks() {
    const now = Date.now();

    for (const serverTower of this.towers.values()) {
      if (serverTower.definition.id !== "warrior-2" || serverTower.offlineUntil > now || serverTower.overheatMs > 0) {
        continue;
      }

      serverTower.linkedTowerIds = serverTower.linkedTowerIds.filter((towerId) => this.towers.has(towerId));

      for (const linkedTowerId of serverTower.linkedTowerIds) {
        const linkedTower = this.towers.get(linkedTowerId);
        if (!linkedTower || linkedTower.offlineUntil > now || linkedTower.overheatMs > 0) {
          continue;
        }

        const linkedRange = this.getTowerRange(linkedTower);
        const currentEnemyIds = Array.from(this.enemies.values())
          .filter((enemy) => distanceSq(linkedTower.x, linkedTower.y, enemy.x, enemy.y) <= linkedRange * linkedRange)
          .map((enemy) => enemy.id);
        const previousEnemyIds = linkedTower.rangeMemoryEnemyIds;
        linkedTower.rangeMemoryEnemyIds = currentEnemyIds;

        if (linkedTower.linkBurstCooldownMs > 0) {
          continue;
        }

        const escapedEnemy = previousEnemyIds
          .map((enemyId) => this.enemies.get(enemyId))
          .find((enemy) => enemy && !currentEnemyIds.includes(enemy.id));

        if (!escapedEnemy) {
          continue;
        }

        const damage = 95 + serverTower.level * 32 + linkedTower.level * 12;
        this.spawnSpecialProjectile(serverTower, "warrior-2", escapedEnemy, damage, 520, 24 + serverTower.level * 5, 0);
        linkedTower.linkBurstCooldownMs = Math.max(520, 1100 - serverTower.level * 80);
      }
    }
  }

  private updateProjectiles(seconds: number) {
    for (const [id, projectile] of this.projectiles) {
      const previousX = projectile.x;
      const previousY = projectile.y;

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

      if (
        projectile.x < -30 ||
        projectile.x > GAME_WORLD_WIDTH + 30 ||
        projectile.y < -30 ||
        projectile.y > GAME_WORLD_HEIGHT + 30
      ) {
        this.projectiles.delete(id);
        continue;
      }

      if (distance > travel + hitRadius && !didProjectileHitTarget(projectile, target, previousX, previousY)) {
        continue;
      }

      const sourceTower = this.towers.get(projectile.towerId);
      const projectileOwnerId = sourceTower?.ownerId ?? "";
      const sourceTowerLevel = sourceTower?.level ?? 1;
      if (projectile.aoeRadius > 0) {
        for (const enemy of this.enemies.values()) {
          this.perfCounters.aoeChecks += 1;
          if (distanceSq(enemy.x, enemy.y, target.x, target.y) <= projectile.aoeRadius * projectile.aoeRadius) {
            this.damageEnemy(enemy, projectile.damage * 0.82, projectile.slowMs, projectile.definitionId, projectileOwnerId, sourceTowerLevel);
          }
        }
      } else {
        this.damageEnemy(target, projectile.damage, projectile.slowMs, projectile.definitionId, projectileOwnerId, sourceTowerLevel);
      }
      this.applyPostHitEffects(projectile, target);

      this.projectiles.delete(id);
    }
  }

  private updateEnemies(seconds: number) {
    const now = Date.now();
    for (const [id, enemy] of this.enemies) {
      const isFeared = enemy.fearUntil > now;
      const isSlowed = enemy.slowUntil > now;
      const speedMultiplier = isSlowed ? 0.48 : 1;
      if (isFeared) {
        enemy.pathDistance = Math.max(0, enemy.pathDistance - enemy.speed * 0.86 * speedMultiplier * seconds);
      } else {
        enemy.pathDistance += enemy.speed * speedMultiplier * seconds;
      }

      if (enemy.pathDistance >= totalPathLength) {
        this.enemies.delete(id);
        this.teamHealth = Math.max(0, this.teamHealth - (enemy.type === "brute" ? 14 : 8));
        continue;
      }

      const point = getPointAlongPath(enemy.pathDistance);
      enemy.x = point.x;
      enemy.y = point.y;
    }
  }

  private updateEnemyTowerAttacks(deltaTime: number) {
    for (const enemy of this.enemies.values()) {
      if (enemy.type !== "shooter") {
        continue;
      }

      enemy.towerAttackCooldownMs = Math.max(0, enemy.towerAttackCooldownMs - deltaTime);
      if (enemy.towerAttackCooldownMs > 0) {
        continue;
      }

      const targetTower = Array.from(this.towers.values())
        .filter((tower) => tower.offlineUntil <= Date.now() && distanceSq(enemy.x, enemy.y, tower.x, tower.y) <= SHOOTER_TOWER_ATTACK_RANGE * SHOOTER_TOWER_ATTACK_RANGE)
        .sort((a, b) => distanceSq(enemy.x, enemy.y, a.x, a.y) - distanceSq(enemy.x, enemy.y, b.x, b.y))[0];
      if (!targetTower) {
        enemy.towerAttackCooldownMs = 420;
        continue;
      }

      const damage = 7 + this.wave * 1.6;
      this.damageTower(targetTower, damage);
      this.setInstantBeam(`enemy-shot-${enemy.id}-${this.nextBeamId++}`, enemy.x, enemy.y, targetTower.x, targetTower.y, "enemy-shot", 0xfb7185, 4, 180);
      enemy.towerAttackCooldownMs = SHOOTER_TOWER_ATTACK_COOLDOWN_MS;
    }
  }

  private damageTower(tower: TowerModel, damage: number) {
    tower.hp = Math.max(0, tower.hp - damage);
    if (tower.hp > 0) {
      return;
    }

    this.towers.delete(tower.id);
    for (const other of this.towers.values()) {
      other.linkedTowerIds = other.linkedTowerIds.filter((towerId) => towerId !== tower.id);
      other.rangeMemoryEnemyIds = [];
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
      debugSweepStartDistance: 0,
      debugSweepEndDistance: 0,
      debugSweepLastDamageAt: 0,
      debugOverdriveHeatLastAt: 0,
      debugOverdriveHeatSegments: [],
      linkBurstCooldownMs: 0,
      waveBonusLevel: 0,
      linkedTowerIds: [],
      rangeMemoryEnemyIds: []
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

    const cost = getTowerUpgradeCost(tower.definition.upgradeCost, tower.level);
    if (this.teamGold < cost) {
      return;
    }

    this.teamGold -= cost;
    player.goldSpent += cost;
    tower.level += 1;
  }

  private repairTower(client: Client, message: RepairTowerMessage) {
    if (!message.towerId) {
      return;
    }

    const player = this.state.players.get(client.sessionId);
    const tower = this.towers.get(message.towerId);
    if (!player || !tower || tower.ownerId !== client.sessionId || tower.hp >= tower.maxHp) {
      return;
    }

    const cost = getTowerRepairCost(tower.level, tower.maxHp - tower.hp, tower.maxHp);
    if (cost <= 0 || this.teamGold < cost) {
      return;
    }

    this.teamGold -= cost;
    player.goldSpent += cost;
    tower.hp = tower.maxHp;
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
      targetTower.ownerId !== client.sessionId ||
      serverTower.definition.id !== "warrior-2" ||
      targetTower.definition.id === "warrior-2"
    ) {
      return;
    }

    const existingIndex = serverTower.linkedTowerIds.indexOf(targetTower.id);
    if (existingIndex >= 0) {
      serverTower.linkedTowerIds.splice(existingIndex, 1);
      return;
    }

    if (serverTower.linkedTowerIds.length >= 2) {
      serverTower.linkedTowerIds.shift();
    }
    serverTower.linkedTowerIds.push(targetTower.id);
    targetTower.rangeMemoryEnemyIds = [];
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

    if (slot === 0) {
      this.teamGold += player.characterId === "zeynep" ? 35 : 22;
      return;
    }

    if (slot === 1) {
      this.useSecondSkill(player.characterId, client.sessionId);
      return;
    }

    this.useThirdSkill(player.characterId, client.sessionId);
  }

  private useSecondSkill(characterId: CharacterId, ownerId: string) {
    if (characterId === "zeynep") {
      this.damageAllEnemies(70, 700, ownerId);
    } else if (characterId === "archer") {
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
      this.projectileGuidanceUntil = Math.max(this.projectileGuidanceUntil, now + 1000);
      this.projectileGuidanceX = this.clamp(message.x, 0, GAME_WORLD_WIDTH);
      this.projectileGuidanceY = this.clamp(message.y, 0, GAME_WORLD_HEIGHT);
      return true;
    }

    if (slot === 1) {
      return this.refactorTower(client, message);
    }

    this.silentModeUntil = Math.max(this.silentModeUntil, now + 5000);
    this.damageHasteUntil = Math.max(this.damageHasteUntil, now + 10000);
    return true;
  }

  private useThirdSkill(characterId: CharacterId, ownerId: string) {
    if (characterId === "zeynep") {
      this.teamGold += 25;
      this.damageAllEnemies(95, 900, ownerId);
    } else if (characterId === "archer") {
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

  private useUltimate(client: Client) {
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
        enemy.slowUntil = Math.max(enemy.slowUntil, Date.now() + 1800);
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
      this.useAtakanUltimate(client);
      return;
    }

    for (const enemy of this.enemies.values()) {
      this.damageEnemy(enemy, 25, 0, "ultimate", client.sessionId);
    }
  }

  private useAtakanUltimate(client: Client) {
    const now = Date.now();
    const ownTowers = Array.from(this.towers.values()).filter((tower) => tower.ownerId === client.sessionId && tower.characterId === "warrior");

    for (const tower of ownTowers) {
      const criticalTower = ownTowers
        .filter((candidate) => candidate.hp / candidate.maxHp < 0.2 && distanceSq(candidate.x, candidate.y, tower.x, tower.y) <= 140 * 140)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

      if (criticalTower) {
        criticalTower.hp = Math.max(criticalTower.hp, criticalTower.maxHp * 0.5);
        this.setInstantBeam(`drone-repair-${tower.id}-${this.nextBeamId++}`, tower.x, tower.y, criticalTower.x, criticalTower.y, "warrior-ultimate-drone-repair", 0x34d399, 5, 520);
        continue;
      }

      const target = Array.from(this.enemies.values())
        .filter((enemy) => getTrackingStackCount(enemy, now) > 0 && distanceSq(enemy.x, enemy.y, tower.x, tower.y) <= 220 * 220)
        .sort((a, b) => b.pathDistance - a.pathDistance)[0] ??
        Array.from(this.enemies.values())
          .filter((enemy) => distanceSq(enemy.x, enemy.y, tower.x, tower.y) <= 180 * 180)
          .sort((a, b) => b.pathDistance - a.pathDistance)[0];

      if (target) {
        this.damageEnemy(target, 48 + tower.level * 10, 0, "warrior-ultimate-drone", client.sessionId);
        this.setInstantBeam(`drone-strike-${tower.id}-${this.nextBeamId++}`, tower.x, tower.y, target.x, target.y, "warrior-ultimate-drone", 0xfacc15, 5, 520);
      }
    }

    for (const tower of ownTowers) {
      tower.offlineUntil = Math.max(tower.offlineUntil, now + 5000);
    }
  }

  private canPlaceTower(x: number, y: number, ignoreTowerId = "") {
    const halfCell = TOWER_GRID_SIZE / 2;
    if (
      x < BUILD_MARGIN ||
      x > GAME_WORLD_WIDTH - BUILD_MARGIN ||
      y < Math.max(BUILD_MARGIN, TOWER_BUILD_TOP + halfCell) ||
      y > Math.min(GAME_WORLD_HEIGHT - BUILD_MARGIN, TOWER_BUILD_BOTTOM - halfCell) ||
      this.distanceToPath(x, y) < PATH_WIDTH / 2 + 16
    ) {
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
    const isGuidedHit = this.projectileGuidanceUntil > now && (tower.definition.hitType === "projectile" || tower.definition.hitType === "impact");
    if (isGuidedHit) {
      const guidedTarget = Array.from(this.enemies.values())
        .filter((enemy) => distanceSq(enemy.x, enemy.y, this.projectileGuidanceX, this.projectileGuidanceY) <= 78 * 78)
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
        return distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= range * range;
      });

    if (tower.definition.id === "warrior-4") {
      return candidates.sort((a, b) => Number(b.type === "brute") - Number(a.type === "brute") || b.pathDistance - a.pathDistance)[0];
    }

    if (tower.definition.id === "warrior-5") {
      return candidates.sort((a, b) => getTrackingStackCount(b, now) - getTrackingStackCount(a, now) || b.pathDistance - a.pathDistance)[0];
    }

    return candidates.sort((a, b) => b.pathDistance - a.pathDistance)[0];
  }

  private damageEnemy(enemy: EnemyModel, damage: number, slowMs: number, sourceDefinitionId = "", sourceOwnerId = "", sourceTowerLevel = 1) {
    if (!this.enemies.has(enemy.id)) {
      return false;
    }

    this.perfCounters.damageEvents += 1;
    const now = Date.now();
    const trackingStacks = getTrackingStackCount(enemy, now);
    const trackingBonus = sourceDefinitionId !== "warrior-1" ? 1 + trackingStacks * TRACKING_STACK_DAMAGE_BONUS : 1;
    const effectiveDamage = damage * trackingBonus;
    enemy.hp -= effectiveDamage;
    this.addDamageEvent(enemy, effectiveDamage);
    if (sourceDefinitionId === "warrior-1") {
      applyTrackingStacks(enemy, sourceTowerLevel, now);
    }
    if (slowMs > 0) {
      enemy.slowUntil = Math.max(enemy.slowUntil, now + slowMs);
    }

    if (enemy.hp > 0) {
      return false;
    }

    this.enemies.delete(enemy.id);
    this.teamGold += enemy.reward;
    this.kills += 1;
    if (sourceOwnerId) {
      this.addKillEvent(sourceOwnerId, enemy.id);
    }
    for (const player of this.state.players.values()) {
      player.ultimateCharge = Math.min(100, player.ultimateCharge + 7);
    }
    return true;
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
      enemy.slowUntil = Math.max(enemy.slowUntil, Date.now() + slowMs);
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
      player.ultimateCharge = Math.min(100, player.ultimateCharge + seconds * 1.4);
    }
  }

  private getSnapshot(): GameSnapshot {
    const now = Date.now();
    return {
      serverTime: now,
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
        ]
      })),
      enemies: Array.from(this.enemies.values()).map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        hp: Math.max(0, enemy.hp),
        maxHp: enemy.maxHp,
        pathDistance: enemy.pathDistance,
        isTracked: getTrackingStackCount(enemy, now) > 0,
        trackingStacks: getTrackingStackCount(enemy, now),
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
        waveBonusLevel: tower.definition.id === "warrior-6" ? tower.waveBonusLevel : undefined,
        linkedTowerIds: [...tower.linkedTowerIds]
      })),
      projectiles: Array.from(this.projectiles.values()).map((projectile) => ({
        id: projectile.id,
        kind: projectile.kind,
        source: projectile.source,
        definitionId: projectile.definitionId,
        x: projectile.x,
        y: projectile.y
      })),
      beams: Array.from(this.beams.values()).map((beam) => ({
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
        overdrive: beam.overdrive
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

    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower);
    if (tower.definition.id === "warrior-6" && tower.waveBonusLevel >= 5) {
      return (tower.definition.range * 2 + (tower.level - 1) * 11) * passiveMultiplier;
    }

    if (tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > Date.now()) {
      return GAME_WORLD_HEIGHT;
    }

    return (tower.definition.range + (tower.level - 1) * 11) * passiveMultiplier;
  }

  private getTowerFireInterval(tower: TowerModel) {
    const levelMultiplier = 1 - (tower.level - 1) * 0.1;
    const stackMultiplier = tower.definition.id === "warrior-6" ? Math.max(0.35, 1 - tower.focusStacks * 0.055) : 1;
    const hasteMultiplier = this.damageHasteUntil > Date.now() && tower.definition.classType === "damage" ? 1 / 3 : 1;
    const passiveMultiplier = this.getAtakanPassiveMultiplier(tower) > 1 ? 0.9 : 1;
    const minimumInterval = tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > Date.now() ? 50 : 80;

    return Math.max(minimumInterval, tower.definition.fireIntervalMs * levelMultiplier * stackMultiplier * hasteMultiplier * passiveMultiplier);
  }

  private getTowerDamage(tower: TowerModel) {
    let damage = tower.definition.damage * (1 + (tower.level - 1) * 0.42) * this.getAtakanPassiveMultiplier(tower);

    if (tower.definition.id === "warrior-4") {
      damage *= 1 + tower.focusStacks * 0.2;
    }

    if (tower.definition.id === "warrior-5" && tower.debugOverdriveUntil > Date.now()) {
      damage *= 1.2;
    }

    if (tower.definition.id === "warrior-6" && tower.waveBonusLevel >= 3) {
      damage *= 1.2;
    }

    return damage;
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
    if (tower.definition.id === "warrior-2" && tower.linkedTowerIds.length > 0) {
      return `Link ${tower.linkedTowerIds.length}/2`;
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
    for (const other of this.towers.values()) {
      if (other.id !== tower.id && distanceSq(tower.x, tower.y, other.x, other.y) <= 76 * 76) {
        return false;
      }
    }

    return true;
  }

  private applyIsolationAura(tower: TowerModel) {
    const range = this.getTowerRange(tower);
    const slowMs = tower.definition.slowMs + 650 + (tower.level - 1) * 120;
    const now = Date.now();

    for (const enemy of this.enemies.values()) {
      this.perfCounters.aoeChecks += 1;
      if (distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= range * range) {
        enemy.slowUntil = Math.max(enemy.slowUntil, now + slowMs);
      }
    }
  }

  private advanceWaveGrowth() {
    for (const tower of this.towers.values()) {
      if (tower.definition.id === "warrior-6") {
        const previousLevel = tower.waveBonusLevel;
        tower.waveBonusLevel = Math.min(6, tower.waveBonusLevel + 1);
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
          target.fearUntil = Math.max(target.fearUntil, Date.now() + STATUS_EFFECTS.fear.durationMs);
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
        this.damageEnemy(enemy, projectile.damage * 0.42, 0, projectile.definitionId, tower.ownerId);
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

function getWaveEnemyCount(wave: number) {
  return Math.max(1, Math.round(BASE_WAVE_ENEMY_COUNT * ENEMY_COUNT_WAVE_MULTIPLIER ** Math.max(0, wave - 1)));
}

function getWaveHpMultiplier(wave: number) {
  return ENEMY_HP_WAVE_MULTIPLIER ** Math.max(0, wave - 1);
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getAngleToPathDistance(x: number, y: number, pathDistance: number) {
  const point = getPointAlongPath(pathDistance);
  return Math.atan2(point.y - y, point.x - x);
}

function getSignedShortestAngleDelta(angleA: number, angleB: number) {
  return Math.atan2(Math.sin(angleB - angleA), Math.cos(angleB - angleA));
}

function getDebugLaserPathSweepAngle(x: number, y: number, startDistance: number, endDistance: number, elapsedSeconds: number) {
  let remainingAngle = DEBUG_LASER_MAX_SWEEP_RADIANS_PER_SECOND * elapsedSeconds;
  const totalDistance = Math.abs(startDistance - endDistance);
  if (totalDistance <= 0 || remainingAngle <= 0) {
    return getAngleToPathDistance(x, y, startDistance);
  }

  const direction = Math.sign(endDistance - startDistance) || -1;
  const sampleStep = 8;
  let previousAngle = getAngleToPathDistance(x, y, startDistance);

  for (let distanceOffset = sampleStep; distanceOffset <= totalDistance + sampleStep; distanceOffset += sampleStep) {
    const pathDistance = startDistance + direction * Math.min(distanceOffset, totalDistance);
    const nextAngle = getAngleToPathDistance(x, y, pathDistance);
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

function getTrackingStackCount(enemy: EnemyModel, now: number) {
  return enemy.trackingStackUntil.filter((expiresAt) => expiresAt > now).length;
}

function getMaxTrackingStacksForTowerLevel(level: number) {
  if (level >= 10) {
    return 3;
  }
  if (level >= 5) {
    return 2;
  }
  return 1;
}

function applyTrackingStacks(enemy: EnemyModel, towerLevel: number, now: number) {
  const maxStacks = getMaxTrackingStacksForTowerLevel(towerLevel);
  const expiresAt = now + TRACKING_MARK_DURATION_MS;
  for (let index = 0; index < maxStacks; index += 1) {
    enemy.trackingStackUntil[index] = Math.max(enemy.trackingStackUntil[index], expiresAt);
  }
  enemy.trackingUntil = Math.max(...enemy.trackingStackUntil);
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
