import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  MAP_PATH,
  PATH_WIDTH,
  towerCatalog,
  type CharacterId,
  type EnemyType,
  type GameSnapshot,
  type ProjectileKind,
  type TowerDefinition
} from "@karayel/shared";

const TEAM_START_GOLD = 240;
const MAX_TEAM_HEALTH = 100;
const TOWER_MIN_DISTANCE = 34;
const BUILD_MARGIN = 18;

class Player extends Schema {
  @type("string") name = "";
  @type("string") characterId: CharacterId = "warrior";
  @type("number") goldSpent = 0;
  @type("number") towersBuilt = 0;
  @type("number") ultimateCharge = 0;
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

type PingMessage = {
  sentAt?: number;
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
};

type TowerModel = {
  id: string;
  ownerId: string;
  ownerName: string;
  characterId: CharacterId;
  definition: TowerDefinition;
  x: number;
  y: number;
  level: number;
  cooldownMs: number;
};

type ProjectileModel = {
  id: string;
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
  private nextEnemyId = 1;
  private nextTowerId = 1;
  private nextProjectileId = 1;
  private teamHealth = MAX_TEAM_HEALTH;
  private teamGold = TEAM_START_GOLD;
  private wave = 1;
  private kills = 0;
  private waveSpawned = 0;
  private waveTarget = 10;
  private spawnCooldownMs = 500;

  onCreate() {
    this.setState(new MatchState());
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    this.onMessage("placeTower", (client, message: PlaceTowerMessage) => {
      this.placeTower(client, message);
    });

    this.onMessage("upgradeTower", (client, message: UpgradeTowerMessage) => {
      this.upgradeTower(client, message);
    });

    this.onMessage("useUltimate", (client) => {
      this.useUltimate(client);
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

    this.updateSpawning(deltaTime);
    this.updateTowers(deltaTime);
    this.updateProjectiles(seconds);
    this.updateEnemies(seconds);
    this.chargeUltimates(seconds);
    this.broadcast("snapshot", this.getSnapshot());
  }

  private updateSpawning(deltaTime: number) {
    if (this.state.players.size === 0 || this.teamHealth <= 0) {
      return;
    }

    if (this.waveSpawned >= this.waveTarget && this.enemies.size === 0) {
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
      slowUntil: 0
    });
  }

  private updateTowers(deltaTime: number) {
    for (const tower of this.towers.values()) {
      tower.cooldownMs -= deltaTime;
      if (tower.cooldownMs > 0) {
        continue;
      }

      const target = this.findTowerTarget(tower);
      if (!target) {
        continue;
      }

      this.spawnTowerProjectile(tower, target);
      tower.cooldownMs = this.getTowerFireInterval(tower);
    }
  }

  private spawnTowerProjectile(tower: TowerModel, target: EnemyModel) {
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = tower.definition.projectileSpeed + tower.level * 22;
    const id = `p${this.nextProjectileId++}`;

    this.projectiles.set(id, {
      id,
      kind: "tower",
      source: "tower",
      targetId: target.id,
      x: tower.x,
      y: tower.y,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      damage: tower.definition.damage * (1 + (tower.level - 1) * 0.42),
      aoeRadius: tower.definition.aoeRadius + (tower.level - 1) * 5,
      slowMs: tower.definition.slowMs + (tower.level - 1) * 90
    });
  }

  private updateProjectiles(seconds: number) {
    for (const [id, projectile] of this.projectiles) {
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

      if (distanceSq(projectile.x, projectile.y, target.x, target.y) > 14 * 14) {
        continue;
      }

      if (projectile.aoeRadius > 0) {
        for (const enemy of this.enemies.values()) {
          if (distanceSq(enemy.x, enemy.y, target.x, target.y) <= projectile.aoeRadius * projectile.aoeRadius) {
            this.damageEnemy(enemy, projectile.damage * 0.82, projectile.slowMs);
          }
        }
      } else {
        this.damageEnemy(target, projectile.damage, projectile.slowMs);
      }

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
      level: 1,
      cooldownMs: 150
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
    if (!player || !tower || tower.ownerId !== client.sessionId || tower.level >= 5) {
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

    for (const enemy of this.enemies.values()) {
      this.damageEnemy(enemy, 25, 0);
    }
  }

  private canPlaceTower(x: number, y: number) {
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
      if (distanceSq(x, y, tower.x, tower.y) < TOWER_MIN_DISTANCE * TOWER_MIN_DISTANCE) {
        return false;
      }
    }

    return true;
  }

  private findTowerTarget(tower: TowerModel) {
    const range = this.getTowerRange(tower);

    return Array.from(this.enemies.values())
      .filter((enemy) => distanceSq(tower.x, tower.y, enemy.x, enemy.y) <= range * range)
      .sort((a, b) => b.pathDistance - a.pathDistance)[0];
  }

  private damageEnemy(enemy: EnemyModel, damage: number, slowMs: number) {
    if (!this.enemies.has(enemy.id)) {
      return;
    }

    enemy.hp -= damage;
    if (slowMs > 0) {
      enemy.slowUntil = Math.max(enemy.slowUntil, Date.now() + slowMs);
    }

    if (enemy.hp > 0) {
      return;
    }

    this.enemies.delete(enemy.id);
    this.teamGold += enemy.reward;
    this.kills += 1;
    for (const player of this.state.players.values()) {
      player.ultimateCharge = Math.min(100, player.ultimateCharge + 7);
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
        ultimateCharge: Math.round(player.ultimateCharge)
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
        color: tower.definition.color
      })),
      projectiles: Array.from(this.projectiles.values()).map((projectile) => ({
        id: projectile.id,
        kind: projectile.kind,
        source: projectile.source,
        x: projectile.x,
        y: projectile.y
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
    return tower.definition.range + (tower.level - 1) * 11;
  }

  private getTowerFireInterval(tower: TowerModel) {
    return Math.max(120, tower.definition.fireIntervalMs * (1 - (tower.level - 1) * 0.1));
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

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const x = ax + t * dx;
  const y = ay + t * dy;

  return Math.hypot(px - x, py - y);
}
