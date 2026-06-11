import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import type { CharacterId, GameSnapshot, UpgradeId } from "@karayel/shared";

const GAME_WORLD_WIDTH = 390;
const GAME_WORLD_HEIGHT = 844;
const BATTLE_TOP = 86;
const PLAYER_RADIUS = 13;
const PLAYER_MIN_Y = BATTLE_TOP + PLAYER_RADIUS;
const PLAYER_MAX_Y = GAME_WORLD_HEIGHT - PLAYER_RADIUS;
const PLAYER_SPEED = 220;

type ClassStats = {
  maxHp: number;
  damage: number;
  fireIntervalMs: number;
  projectileSpeed: number;
  projectileKind: "arrow" | "bolt" | "orb" | "light" | "chain";
  multiShot: number;
  aoeRadius: number;
  slowMs: number;
};

const classStats: Record<CharacterId, ClassStats> = {
  warrior: { maxHp: 100, damage: 14, fireIntervalMs: 650, projectileSpeed: 320, projectileKind: "bolt", multiShot: 1, aoeRadius: 0, slowMs: 0 },
  archer: { maxHp: 85, damage: 7, fireIntervalMs: 320, projectileSpeed: 420, projectileKind: "arrow", multiShot: 2, aoeRadius: 0, slowMs: 0 },
  mage: { maxHp: 75, damage: 24, fireIntervalMs: 1100, projectileSpeed: 250, projectileKind: "orb", multiShot: 1, aoeRadius: 48, slowMs: 0 },
  healer: { maxHp: 90, damage: 8, fireIntervalMs: 720, projectileSpeed: 330, projectileKind: "light", multiShot: 1, aoeRadius: 0, slowMs: 0 },
  tank: { maxHp: 130, damage: 10, fireIntervalMs: 800, projectileSpeed: 280, projectileKind: "chain", multiShot: 1, aoeRadius: 0, slowMs: 1200 }
};

const upgradeCosts: Record<UpgradeId, number> = {
  damage: 35,
  fireRate: 40,
  projectileSpeed: 30,
  heal: 45
};

class Player extends Schema {
  @type("string") name = "";
  @type("string") characterId: CharacterId = "warrior";
  @type("number") x = GAME_WORLD_WIDTH / 2;
  @type("number") y = 570;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") damageLevel = 0;
  @type("number") fireRateLevel = 0;
  @type("number") projectileSpeedLevel = 0;
  @type("number") goldSpent = 0;
  fireCooldownMs = 0;
}

class MatchState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

type JoinOptions = {
  playerName?: string;
  characterId?: CharacterId;
};

type MoveMessage = {
  x?: number;
  y?: number;
};

type PingMessage = {
  sentAt?: number;
};

type BuyUpgradeMessage = {
  upgradeId?: UpgradeId;
};

type EnemyModel = {
  id: string;
  type: "grunt" | "brute" | "runner" | "shooter";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  reward: number;
  slowUntil: number;
  stopY: number;
  fireCooldownMs: number;
};

type ProjectileModel = {
  id: string;
  ownerId: string;
  kind: "arrow" | "bolt" | "orb" | "light" | "chain" | "enemy";
  source: "player" | "enemy";
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  aoeRadius: number;
  slowMs: number;
};

export class MatchRoom extends Room<MatchState> {
  maxClients = 5;
  private enemies = new Map<string, EnemyModel>();
  private projectiles = new Map<string, ProjectileModel>();
  private nextEnemyId = 1;
  private nextProjectileId = 1;
  private teamHealth = 100;
  private readonly maxTeamHealth = 100;
  private teamGold = 0;
  private wave = 1;
  private kills = 0;
  private waveSpawned = 0;
  private waveTarget = 8;
  private spawnCooldownMs = 800;

  onCreate() {
    this.setState(new MatchState());
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    this.onMessage("move", (client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        return;
      }

      player.vx = this.clampDirection(message.x);
      player.vy = this.clampDirection(message.y);
    });

    this.onMessage("buyUpgrade", (client, message: BuyUpgradeMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !message.upgradeId) {
        return;
      }

      this.buyUpgrade(player, message.upgradeId);
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
    player.maxHp = classStats[player.characterId].maxHp;
    player.hp = player.maxHp;
    player.x = GAME_WORLD_WIDTH / 2 + (Math.random() - 0.5) * 120;
    player.y = GAME_WORLD_HEIGHT - 190 + Math.random() * 56;

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private update(deltaTime: number) {
    const seconds = deltaTime / 1000;

    this.updatePlayers(seconds);
    this.updateSpawning(deltaTime);
    this.updateAutoFire(deltaTime);
    this.updateProjectiles(seconds);
    this.updateEnemyFire(deltaTime);
    this.updateEnemies(seconds);
    this.broadcast("snapshot", this.getSnapshot());
  }

  private updatePlayers(seconds: number) {
    for (const player of this.state.players.values()) {
      const stats = classStats[this.getCharacterId(player.characterId)];
      const speed = PLAYER_SPEED * (stats === classStats.tank ? 0.92 : 1);
      player.x = this.clamp(player.x + player.vx * speed * seconds, PLAYER_RADIUS, GAME_WORLD_WIDTH - PLAYER_RADIUS);
      player.y = this.clamp(player.y + player.vy * speed * seconds, PLAYER_MIN_Y, PLAYER_MAX_Y);
    }
  }

  private updateSpawning(deltaTime: number) {
    if (this.state.players.size === 0 || this.teamHealth <= 0) {
      return;
    }

    if (this.waveSpawned >= this.waveTarget && this.enemies.size === 0) {
      this.wave += 1;
      this.waveSpawned = 0;
      this.waveTarget = 8 + this.wave * 3;
      this.spawnCooldownMs = 900;
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
    this.spawnCooldownMs = Math.max(360, 1050 - this.wave * 45);
  }

  private spawnEnemy() {
    const roll = Math.random();
    const isRangedWave = this.wave % 3 === 0;
    const type: EnemyModel["type"] = isRangedWave || roll > 0.86 ? "shooter" : roll > 0.68 ? "brute" : roll > 0.48 ? "runner" : "grunt";
    const waveScale = 1 + this.wave * 0.12;
    const maxHp = Math.round((type === "brute" ? 56 : type === "runner" ? 22 : type === "shooter" ? 30 : 34) * waveScale);
    const speed = (type === "runner" ? 68 : type === "brute" ? 34 : type === "shooter" ? 38 : 46) + this.wave * 2.2;

    const id = `e${this.nextEnemyId++}`;

    this.enemies.set(id, {
      id,
      type,
      x: 28 + Math.random() * (GAME_WORLD_WIDTH - 56),
      y: BATTLE_TOP - 24,
      hp: maxHp,
      maxHp,
      speed,
      reward: type === "brute" ? 12 : type === "runner" ? 7 : type === "shooter" ? 10 : 9,
      slowUntil: 0,
      stopY: isRangedWave || type === "shooter" ? 150 + Math.random() * 130 : GAME_WORLD_HEIGHT - 12,
      fireCooldownMs: 700 + Math.random() * 900
    });
  }

  private updateAutoFire(deltaTime: number) {
    for (const [playerId, player] of this.state.players.entries()) {
      if (player.hp <= 0) {
        continue;
      }

      player.fireCooldownMs -= deltaTime;
      if (player.fireCooldownMs > 0) {
        continue;
      }

      const stats = classStats[this.getCharacterId(player.characterId)];
      const fireInterval = Math.max(140, stats.fireIntervalMs * (1 - player.fireRateLevel * 0.08));
      this.spawnPlayerProjectiles(playerId, player, stats);

      player.fireCooldownMs = fireInterval;
    }
  }

  private spawnPlayerProjectiles(ownerId: string, player: Player, stats: ClassStats) {
    const speed = stats.projectileSpeed + player.projectileSpeedLevel * 32;
    const offsets = stats.multiShot > 1 ? [-8, 8] : [0];

    for (const offset of offsets) {
      const id = `p${this.nextProjectileId++}`;
      this.projectiles.set(id, {
        id,
        ownerId,
        kind: stats.projectileKind,
        source: "player",
        x: player.x + offset,
        y: player.y - 16,
        vx: offset * 2.2,
        vy: -speed,
        damage: stats.damage + player.damageLevel * 4,
        aoeRadius: stats.aoeRadius,
        slowMs: stats.slowMs
      });
    }
  }

  private updateProjectiles(seconds: number) {
    for (const [id, projectile] of this.projectiles) {
      projectile.x += projectile.vx * seconds;
      projectile.y += projectile.vy * seconds;

      if (projectile.x < -24 || projectile.x > GAME_WORLD_WIDTH + 24 || projectile.y < BATTLE_TOP - 48 || projectile.y > GAME_WORLD_HEIGHT + 24) {
        this.projectiles.delete(id);
        continue;
      }

      const hit = projectile.source === "player" ? this.findEnemyHit(projectile) : this.findPlayerHit(projectile);
      if (!hit) {
        continue;
      }

      if (projectile.source === "player") {
        const enemyHit = hit as EnemyModel;
        if (projectile.aoeRadius > 0) {
          for (const enemy of this.enemies.values()) {
            if (PhaserDistanceSq(enemyHit.x, enemyHit.y, enemy.x, enemy.y) <= projectile.aoeRadius * projectile.aoeRadius) {
              this.damageEnemy(enemy, projectile.damage * 0.8, projectile.slowMs);
            }
          }
        } else {
          this.damageEnemy(enemyHit, projectile.damage, projectile.slowMs);
        }
      } else {
        this.damagePlayer(hit as Player, projectile.damage);
      }

      this.projectiles.delete(id);
    }
  }

  private updateEnemyFire(deltaTime: number) {
    if (this.state.players.size === 0) {
      return;
    }

    for (const enemy of this.enemies.values()) {
      if (enemy.type !== "shooter" && this.wave % 3 !== 0) {
        continue;
      }

      enemy.fireCooldownMs -= deltaTime;
      if (enemy.fireCooldownMs > 0 || enemy.y < enemy.stopY - 12) {
        continue;
      }

      this.spawnEnemyProjectile(enemy);
      enemy.fireCooldownMs = 1300 + Math.random() * 900;
    }
  }

  private spawnEnemyProjectile(enemy: EnemyModel) {
    const target = this.findClosestLivingPlayer(enemy.x, enemy.y);
    if (!target) {
      return;
    }

    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = 185 + this.wave * 4;
    const id = `p${this.nextProjectileId++}`;

    this.projectiles.set(id, {
      id,
      ownerId: enemy.id,
      kind: "enemy",
      source: "enemy",
      x: enemy.x,
      y: enemy.y + 18,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      damage: enemy.type === "brute" ? 14 : 9,
      aoeRadius: 0,
      slowMs: 0
    });
  }

  private findEnemyHit(projectile: ProjectileModel) {
    for (const enemy of this.enemies.values()) {
      if (PhaserDistanceSq(projectile.x, projectile.y, enemy.x, enemy.y) < 16 * 16) {
        return enemy;
      }
    }

    return undefined;
  }

  private findPlayerHit(projectile: ProjectileModel) {
    for (const player of this.state.players.values()) {
      if (player.hp > 0 && PhaserDistanceSq(projectile.x, projectile.y, player.x, player.y) < 16 * 16) {
        return player;
      }
    }

    return undefined;
  }

  private findClosestLivingPlayer(x: number, y: number) {
    return Array.from(this.state.players.values())
      .filter((player) => player.hp > 0)
      .sort((a, b) => PhaserDistanceSq(x, y, a.x, a.y) - PhaserDistanceSq(x, y, b.x, b.y))[0];
  }

  private damageEnemy(enemy: EnemyModel, damage: number, slowMs: number) {
    enemy.hp -= damage;
    if (slowMs > 0) {
      enemy.slowUntil = Date.now() + slowMs;
    }

    if (enemy.hp <= 0) {
      this.enemies.delete(enemy.id);
      this.teamGold += enemy.reward;
      this.kills += 1;
    }
  }

  private updateEnemies(seconds: number) {
    for (const [id, enemy] of this.enemies) {
      const isSlowed = enemy.slowUntil > Date.now();
      if (enemy.y < enemy.stopY) {
        enemy.y += enemy.speed * (isSlowed ? 0.45 : 1) * seconds;
      }

      const contactedPlayer = this.findEnemyContact(enemy);
      if (contactedPlayer) {
        this.damagePlayer(contactedPlayer, enemy.type === "brute" ? 18 : 11);
        this.enemies.delete(id);
        continue;
      }

      if (enemy.y >= GAME_WORLD_HEIGHT - 10) {
        this.enemies.delete(id);
        this.teamHealth = Math.max(0, this.teamHealth - (enemy.type === "brute" ? 14 : 9));
      }
    }
  }

  private findEnemyContact(enemy: EnemyModel) {
    for (const player of this.state.players.values()) {
      if (player.hp > 0 && PhaserDistanceSq(enemy.x, enemy.y, player.x, player.y) < 23 * 23) {
        return player;
      }
    }

    return undefined;
  }

  private damagePlayer(player: Player, damage: number) {
    const reduction = player.characterId === "tank" ? 0.75 : 1;
    player.hp = Math.max(0, player.hp - damage * reduction);
    this.teamHealth = Math.max(0, this.teamHealth - Math.max(1, Math.round(damage * 0.2)));
  }

  private buyUpgrade(player: Player, upgradeId: UpgradeId) {
    const cost = upgradeCosts[upgradeId];
    if (this.teamGold < cost) {
      return;
    }

    if (upgradeId === "heal") {
      this.teamGold -= cost;
      this.teamHealth = Math.min(this.maxTeamHealth, this.teamHealth + 28);
      for (const teammate of this.state.players.values()) {
        teammate.hp = Math.min(teammate.maxHp, teammate.hp + 22);
      }
      return;
    }

    if (upgradeId === "damage") {
      player.damageLevel += 1;
    } else if (upgradeId === "fireRate") {
      player.fireRateLevel += 1;
    } else if (upgradeId === "projectileSpeed") {
      player.projectileSpeedLevel += 1;
    }

    player.goldSpent += cost;
    this.teamGold -= cost;
  }

  private getSnapshot(): GameSnapshot {
    return {
      players: Array.from(this.state.players.entries()).map(([id, player]) => ({
        id,
        name: player.name,
        characterId: player.characterId,
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        goldSpent: player.goldSpent,
        upgrades: {
          damage: player.damageLevel,
          fireRate: player.fireRateLevel,
          projectileSpeed: player.projectileSpeedLevel
        }
      })),
      enemies: Array.from(this.enemies.values()).map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        hp: Math.max(0, enemy.hp),
        maxHp: enemy.maxHp
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
        maxHealth: this.maxTeamHealth,
        gold: this.teamGold,
        wave: this.wave,
        enemiesLeft: Math.max(0, this.waveTarget - this.waveSpawned) + this.enemies.size,
        kills: this.kills
      }
    };
  }

  private clampDirection(value: unknown) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 0;
    }

    return this.clamp(value, -1, 1);
  }

  private getCharacterId(value: unknown): CharacterId {
    if (value === "archer" || value === "mage" || value === "healer" || value === "tank" || value === "warrior") {
      return value;
    }

    return "warrior";
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}

function PhaserDistanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
