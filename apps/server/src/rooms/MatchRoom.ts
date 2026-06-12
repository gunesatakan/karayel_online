import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import { performance } from "node:perf_hooks";
import {
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  MAP_PATH,
  PATH_WIDTH,
  towerCatalog,
  type CharacterId,
  type DamageEventSnapshot,
  type EnemyType,
  type BeamSnapshot,
  type GameSnapshot,
  type ProjectileKind,
  type ServerPerfSnapshot,
  type TowerDefinition
} from "@karayel/shared";

const TEAM_START_GOLD = 240;
const MAX_TEAM_HEALTH = 100;
const MAX_TOWER_LEVEL = 10;
const TOWER_MIN_DISTANCE = 34;
const BUILD_MARGIN = 18;

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
  trackingUntil: number;
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
  debugSweepCenterAngle: number;
  debugSweepAnchorDistance: number;
  linkBurstCooldownMs: number;
  waveBonusLevel: number;
  linkedTowerIds: string[];
  rangeMemoryEnemyIds: string[];
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
  private nextEnemyId = 1;
  private nextTowerId = 1;
  private nextProjectileId = 1;
  private nextDamageEventId = 1;
  private teamHealth = MAX_TEAM_HEALTH;
  private teamGold = TEAM_START_GOLD;
  private wave = 1;
  private kills = 0;
  private waveSpawned = 0;
  private waveTarget = 10;
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
      this.waveTarget = 10 + this.wave * 3;
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
    const waveScale = 1 + this.wave * 0.14;
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
      trackingUntil: 0
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
  }

  private fireDebugLaser(tower: TowerModel, target: EnemyModel) {
    const now = Date.now();
    const baseDamage = this.getTowerDamage(tower);
    const wasTracked = target.trackingUntil > now;
    const killed = this.damageEnemy(target, baseDamage, tower.definition.slowMs, tower.definition.id);

    if (wasTracked && killed) {
      tower.debugOverdriveUntil = Math.max(tower.debugOverdriveUntil, now + 2000);
      tower.debugSweepStartedAt = now;
      tower.debugSweepAnchorDistance = Math.max(0, target.pathDistance - 130);
      const sweepCenter = getPointAlongPath(tower.debugSweepAnchorDistance);
      tower.debugSweepCenterAngle = Math.atan2(sweepCenter.y - tower.y, sweepCenter.x - tower.x);
      this.updateDebugLaserSweep(tower);
      return;
    }

    this.setBeam(tower, target.x, target.y, false);
  }

  private setBeam(tower: TowerModel, x2: number, y2: number, overdrive: boolean) {
    this.beams.set(`beam-${tower.id}`, {
      id: `beam-${tower.id}`,
      definitionId: tower.definition.id,
      x1: tower.x,
      y1: tower.y,
      x2,
      y2,
      width: overdrive ? 8 : 4,
      color: overdrive ? 0xfbbf24 : 0xfb7185,
      overdrive,
      ttlMs: overdrive ? 180 : 140
    });
  }

  private updateDebugLaserSweep(tower: TowerModel) {
    const now = Date.now();
    if (tower.debugSweepStartedAt <= 0) {
      tower.debugSweepStartedAt = now;
    }

    const sweepDurationMs = 2000;
    const sweepArc = Math.PI * 0.42;
    const progress = this.clamp((now - tower.debugSweepStartedAt) / sweepDurationMs, 0, 1);
    const angle = tower.debugSweepCenterAngle - sweepArc / 2 + sweepArc * progress;
    const end = getRayByAngleToWorldEdge(tower.x, tower.y, angle);

    this.setBeam(tower, end.x, end.y, true);
    if (tower.cooldownMs > 0) {
      return;
    }

    const damage = this.getTowerDamage(tower) * 0.66;
    for (const enemy of Array.from(this.enemies.values())) {
      if (enemy.pathDistance > tower.debugSweepAnchorDistance + 95) {
        continue;
      }
      if (distanceToSegmentSq(enemy.x, enemy.y, tower.x, tower.y, end.x, end.y) <= 17 * 17) {
        this.damageEnemy(enemy, damage, 0, tower.definition.id);
      }
    }
    tower.cooldownMs = 50;
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

        const damage = 28 + serverTower.level * 8 + linkedTower.level * 4;
        this.spawnSpecialProjectile(linkedTower, "warrior-2", escapedEnemy, damage, 460, 16 + serverTower.level * 3, 0);
        linkedTower.linkBurstCooldownMs = Math.max(520, 1100 - serverTower.level * 80);
      }
    }
  }

  private updateProjectiles(seconds: number) {
    for (const [id, projectile] of this.projectiles) {
      const previousX = projectile.x;
      const previousY = projectile.y;
      projectile.x += projectile.vx * seconds;
      projectile.y += projectile.vy * seconds;

      const target = this.enemies.get(projectile.targetId);
      if (!target) {
        this.projectiles.delete(id);
        continue;
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

      if (!didProjectileHitTarget(projectile, target, previousX, previousY)) {
        continue;
      }

      if (projectile.aoeRadius > 0) {
        for (const enemy of this.enemies.values()) {
          this.perfCounters.aoeChecks += 1;
          if (distanceSq(enemy.x, enemy.y, target.x, target.y) <= projectile.aoeRadius * projectile.aoeRadius) {
            this.damageEnemy(enemy, projectile.damage * 0.82, projectile.slowMs, projectile.definitionId);
          }
        }
      } else {
        this.damageEnemy(target, projectile.damage, projectile.slowMs, projectile.definitionId);
      }
      this.applyPostHitEffects(projectile, target);

      this.projectiles.delete(id);
    }
  }

  private updateEnemies(seconds: number) {
    for (const [id, enemy] of this.enemies) {
      const isSlowed = enemy.slowUntil > Date.now();
      enemy.pathDistance += enemy.speed * (isSlowed ? 0.48 : 1) * seconds;

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

  private placeTower(client: Client, message: PlaceTowerMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || typeof message.x !== "number" || typeof message.y !== "number" || !message.definitionId) {
      return;
    }

    const definition = this.findTowerDefinition(player.characterId, message.definitionId);
    if (!definition || this.teamGold < definition.cost || !this.canPlaceTower(message.x, message.y)) {
      return;
    }

    const tower: TowerModel = {
      id: `t${this.nextTowerId++}`,
      ownerId: client.sessionId,
      ownerName: player.name,
      characterId: player.characterId,
      definition,
      x: this.clamp(message.x, BUILD_MARGIN, GAME_WORLD_WIDTH - BUILD_MARGIN),
      y: this.clamp(message.y, BUILD_MARGIN, GAME_WORLD_HEIGHT - BUILD_MARGIN),
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
      debugSweepCenterAngle: -Math.PI / 2,
      debugSweepAnchorDistance: 0,
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

    const cost = Math.round(tower.definition.upgradeCost * tower.level * 1.35);
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
    const x = this.clamp(message.x, BUILD_MARGIN, GAME_WORLD_WIDTH - BUILD_MARGIN);
    const y = this.clamp(message.y, BUILD_MARGIN, GAME_WORLD_HEIGHT - BUILD_MARGIN);
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
      this.useSecondSkill(player.characterId);
      return;
    }

    this.useThirdSkill(player.characterId);
  }

  private useSecondSkill(characterId: CharacterId) {
    if (characterId === "zeynep") {
      this.damageAllEnemies(70, 700);
    } else if (characterId === "archer") {
      this.damageFrontEnemies(5, 55, 0);
    } else if (characterId === "mage") {
      this.damageAllEnemies(50, 0);
    } else if (characterId === "healer") {
      this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + 14);
      this.slowAllEnemies(1300);
    } else if (characterId === "tank") {
      this.damageAllEnemies(28, 2100);
    } else if (characterId === "onur") {
      this.damageStrongestEnemy(120, 0);
    } else {
      this.damageAllEnemies(15, 0);
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

  private useThirdSkill(characterId: CharacterId) {
    if (characterId === "zeynep") {
      this.teamGold += 25;
      this.damageAllEnemies(95, 900);
    } else if (characterId === "archer") {
      this.damageFrontEnemies(8, 70, 0);
    } else if (characterId === "mage") {
      this.damageAllEnemies(82, 0);
    } else if (characterId === "healer") {
      this.teamGold += 20;
      this.teamHealth = Math.min(MAX_TEAM_HEALTH, this.teamHealth + 25);
      this.slowAllEnemies(1600);
    } else if (characterId === "tank") {
      this.damageAllEnemies(45, 3200);
    } else if (characterId === "onur") {
      this.damageStrongestEnemy(180, 0);
    } else {
      this.teamGold += 25;
      this.damageAllEnemies(20, 0);
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
        this.damageEnemy(enemy, 120, 700);
      }
      return;
    }

    if (player.characterId === "mage") {
      for (const enemy of this.enemies.values()) {
        this.damageEnemy(enemy, 85, 0);
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
        this.damageEnemy(enemy, 35, 3200);
      }
      return;
    }

    if (player.characterId === "onur") {
      const enemy = Array.from(this.enemies.values()).sort((a, b) => b.hp - a.hp)[0];
      if (enemy) {
        this.damageEnemy(enemy, 220, 0);
      }
      return;
    }

    if (player.characterId === "archer") {
      for (const enemy of Array.from(this.enemies.values()).sort((a, b) => b.pathDistance - a.pathDistance).slice(0, 6)) {
        this.damageEnemy(enemy, 70, 0);
      }
      return;
    }

    if (player.characterId === "warrior") {
      this.useAtakanUltimate(client);
      return;
    }

    for (const enemy of this.enemies.values()) {
      this.damageEnemy(enemy, 25, 0);
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
        continue;
      }

      const target = Array.from(this.enemies.values())
        .filter((enemy) => enemy.trackingUntil > now && distanceSq(enemy.x, enemy.y, tower.x, tower.y) <= 220 * 220)
        .sort((a, b) => b.pathDistance - a.pathDistance)[0] ??
        Array.from(this.enemies.values())
          .filter((enemy) => distanceSq(enemy.x, enemy.y, tower.x, tower.y) <= 180 * 180)
          .sort((a, b) => b.pathDistance - a.pathDistance)[0];

      if (target) {
        this.damageEnemy(target, 48 + tower.level * 10, 0, "warrior-ultimate-drone");
      }
    }

    for (const tower of ownTowers) {
      tower.offlineUntil = Math.max(tower.offlineUntil, now + 5000);
    }
  }

  private canPlaceTower(x: number, y: number, ignoreTowerId = "") {
    if (
      x < BUILD_MARGIN ||
      x > GAME_WORLD_WIDTH - BUILD_MARGIN ||
      y < BUILD_MARGIN ||
      y > GAME_WORLD_HEIGHT - BUILD_MARGIN ||
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

  private findTowerTarget(tower: TowerModel) {
    const now = Date.now();
    const isGuidedProjectile = this.projectileGuidanceUntil > now && tower.definition.hitType === "projectile";
    if (isGuidedProjectile) {
      const guidedTarget = Array.from(this.enemies.values())
        .filter((enemy) => distanceSq(enemy.x, enemy.y, this.projectileGuidanceX, this.projectileGuidanceY) <= 78 * 78)
        .sort((a, b) => b.pathDistance - a.pathDistance)[0];
      if (guidedTarget) {
        return guidedTarget;
      }
    }

    const range = isGuidedProjectile ? Number.POSITIVE_INFINITY : this.getTowerRange(tower);
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
      return candidates.sort((a, b) => Number(b.trackingUntil > now) - Number(a.trackingUntil > now) || b.pathDistance - a.pathDistance)[0];
    }

    return candidates.sort((a, b) => b.pathDistance - a.pathDistance)[0];
  }

  private damageEnemy(enemy: EnemyModel, damage: number, slowMs: number, sourceDefinitionId = "") {
    if (!this.enemies.has(enemy.id)) {
      return false;
    }

    this.perfCounters.damageEvents += 1;
    const now = Date.now();
    const trackingBonus = enemy.trackingUntil > now && sourceDefinitionId !== "warrior-1" ? 1.2 : 1;
    const effectiveDamage = damage * trackingBonus;
    enemy.hp -= effectiveDamage;
    this.addDamageEvent(enemy, effectiveDamage);
    if (sourceDefinitionId === "warrior-1") {
      enemy.trackingUntil = Math.max(enemy.trackingUntil, now + 6500);
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
    for (const player of this.state.players.values()) {
      player.ultimateCharge = Math.min(100, player.ultimateCharge + 7);
    }
    return true;
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

  private damageAllEnemies(damage: number, slowMs: number) {
    for (const enemy of Array.from(this.enemies.values())) {
      this.damageEnemy(enemy, damage, slowMs);
    }
  }

  private damageFrontEnemies(count: number, damage: number, slowMs: number) {
    for (const enemy of Array.from(this.enemies.values()).sort((a, b) => b.pathDistance - a.pathDistance).slice(0, count)) {
      this.damageEnemy(enemy, damage, slowMs);
    }
  }

  private damageStrongestEnemy(damage: number, slowMs: number) {
    const enemy = Array.from(this.enemies.values()).sort((a, b) => b.hp - a.hp)[0];
    if (enemy) {
      this.damageEnemy(enemy, damage, slowMs);
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
    return {
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
        maxHp: enemy.maxHp
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
        this.damageEnemy(enemy, projectile.damage * 0.42, 0, projectile.definitionId);
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

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function didProjectileHitTarget(projectile: ProjectileModel, target: EnemyModel, previousX: number, previousY: number) {
  const hitRadius = target.type === "brute" ? 19 : target.type === "runner" ? 13 : 15;
  const segmentDistanceSq = distanceToSegmentSq(target.x, target.y, previousX, previousY, projectile.x, projectile.y);
  if (segmentDistanceSq <= hitRadius * hitRadius) {
    return true;
  }

  const previousDistanceSq = distanceSq(previousX, previousY, target.x, target.y);
  const currentDistanceSq = distanceSq(projectile.x, projectile.y, target.x, target.y);
  const traveledSq = distanceSq(previousX, previousY, projectile.x, projectile.y);

  return currentDistanceSq > previousDistanceSq && previousDistanceSq <= traveledSq + hitRadius * hitRadius;
}

function getRayToWorldEdge(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / length;
  const ny = dy / length;
  return getRayDirectionToWorldEdge(x1, y1, nx, ny);
}

function getRayByAngleToWorldEdge(x: number, y: number, angle: number) {
  return getRayDirectionToWorldEdge(x, y, Math.cos(angle), Math.sin(angle));
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
