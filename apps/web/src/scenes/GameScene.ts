import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import {
  BATTLE_TOP,
  characters,
  GAME_WORLD_HEIGHT,
  GAME_WORLD_WIDTH,
  SHOP_TOP,
  type CharacterId,
  type EnemySnapshot,
  type GameSnapshot,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type UpgradeId
} from "@karayel/shared";
import { gameServerUrl, healthUrl } from "../config";

type GameSceneData = {
  characterId?: CharacterId;
};

type RenderPlayer = {
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  hpBack: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
};

export class GameScene extends Phaser.Scene {
  private room?: Room;
  private localSessionId = "";
  private selectedCharacterId: CharacterId = "warrior";
  private players = new Map<string, RenderPlayer>();
  private enemies = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private projectiles = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private projectileGroup?: Phaser.Physics.Arcade.Group;
  private statusText?: Phaser.GameObjects.Text;
  private pingText?: Phaser.GameObjects.Text;
  private joystickKnob?: Phaser.GameObjects.Arc;
  private joystickVector = new Phaser.Math.Vector2(0, 0);
  private joystickPointerId?: number;
  private pingTimer?: Phaser.Time.TimerEvent;
  private pingSamples: number[] = [];
  private lastMoveSentAt = 0;
  private readonly joystickCenter = new Phaser.Math.Vector2(82, SHOP_TOP - 64);
  private readonly joystickRadius = 48;

  constructor() {
    super("game");
  }

  init(data: GameSceneData) {
    this.selectedCharacterId = data.characterId ?? "warrior";
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f172a");
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x111827);
    this.add.rectangle(GAME_WORLD_WIDTH / 2, BATTLE_TOP / 2, GAME_WORLD_WIDTH, BATTLE_TOP, 0x0f172a, 0.86);
    this.add.line(0, SHOP_TOP, 0, 0, GAME_WORLD_WIDTH, 0, 0x475569, 0.55).setOrigin(0, 0);
    this.add.text(18, 16, "Karayel Online", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "22px",
      fontStyle: "bold"
    });
    this.statusText = this.add.text(18, 48, "Sunucu kontrol ediliyor...", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "13px"
    });
    this.pingText = this.add.text(GAME_WORLD_WIDTH - 18, 18, "Ping: --", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "13px",
      fontStyle: "bold"
    }).setOrigin(1, 0);

    this.enemyGroup = this.physics.add.group({ defaultKey: "enemy-grunt", maxSize: 80 });
    this.projectileGroup = this.physics.add.group({ defaultKey: "projectile-bolt", maxSize: 120 });
    this.createJoystick();

    this.game.events.on("shop:buy", this.buyUpgrade, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("shop:buy", this.buyUpgrade, this);
      this.pingTimer?.remove(false);
    });

    void this.connect();
  }

  update(time: number, delta: number) {
    this.smoothPlayers(delta);

    if (!this.room || time - this.lastMoveSentAt < 50) {
      return;
    }

    this.room.send("move", { x: this.joystickVector.x, y: this.joystickVector.y });
    this.lastMoveSentAt = time;
  }

  private createJoystick() {
    this.add.circle(this.joystickCenter.x, this.joystickCenter.y, this.joystickRadius, 0x334155, 0.42)
      .setStrokeStyle(2, 0x94a3b8, 0.35)
      .setDepth(30);
    this.joystickKnob = this.add.circle(this.joystickCenter.x, this.joystickCenter.y, 20, 0x22c55e, 0.92)
      .setStrokeStyle(2, 0xf8fafc, 0.45)
      .setDepth(31);

    this.input.on("pointerdown", this.handleJoystickDown, this);
    this.input.on("pointermove", this.handleJoystickMove, this);
    this.input.on("pointerup", this.handleJoystickUp, this);
    this.input.on("pointerupoutside", this.handleJoystickUp, this);
  }

  private handleJoystickDown(pointer: Phaser.Input.Pointer) {
    if (this.joystickPointerId !== undefined) {
      return;
    }

    const position = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    if (position.distance(this.joystickCenter) > this.joystickRadius + 34) {
      return;
    }

    this.joystickPointerId = pointer.id;
    this.updateJoystick(position);
  }

  private handleJoystickMove(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.joystickPointerId) {
      return;
    }

    this.updateJoystick(new Phaser.Math.Vector2(pointer.worldX, pointer.worldY));
  }

  private handleJoystickUp(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.joystickPointerId) {
      return;
    }

    this.joystickPointerId = undefined;
    this.joystickVector.set(0, 0);
    this.joystickKnob?.setPosition(this.joystickCenter.x, this.joystickCenter.y);
    this.room?.send("move", { x: 0, y: 0 });
  }

  private updateJoystick(position: Phaser.Math.Vector2) {
    const offset = position.clone().subtract(this.joystickCenter);
    const distance = Math.min(offset.length(), this.joystickRadius);

    if (offset.lengthSq() > 0) {
      offset.normalize();
    }

    this.joystickVector.set(offset.x, offset.y);
    this.joystickKnob?.setPosition(
      this.joystickCenter.x + offset.x * distance,
      this.joystickCenter.y + offset.y * distance
    );
  }

  private async connect() {
    try {
      await this.checkServerHealth();
      this.statusText?.setText("Odaya baglaniyor...");

      const client = new Client(gameServerUrl);
      this.room = await client.joinOrCreate("match", {
        playerName: this.getSelectedCharacterName(),
        characterId: this.selectedCharacterId
      });
      this.localSessionId = this.room.sessionId;
      this.statusText?.setText(`Oda: ${this.room.roomId}`);

      this.scene.launch("shop-ui");
      this.room.onMessage("snapshot", (snapshot: GameSnapshot) => this.renderSnapshot(snapshot));
      this.room.onMessage("latency:pong", (message: { sentAt?: number }) => this.updatePing(message.sentAt));
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

  private renderSnapshot(snapshot: GameSnapshot) {
    this.renderPlayers(snapshot.players);
    this.renderEnemies(snapshot.enemies);
    this.renderProjectiles(snapshot.projectiles);
    this.game.events.emit("game:snapshot", snapshot);
  }

  private renderPlayers(players: PlayerSnapshot[]) {
    const activeIds = new Set(players.map((player) => player.id));

    for (const [id, player] of this.players) {
      if (!activeIds.has(id)) {
        player.sprite.destroy();
        player.label.destroy();
        player.hpBack.destroy();
        player.hpFill.destroy();
        this.players.delete(id);
      }
    }

    for (const player of players) {
      let rendered = this.players.get(player.id);
      const texture = `player-${player.characterId}`;

      if (!rendered) {
        const sprite = this.physics.add.sprite(player.x, player.y, texture).setDepth(10);
        const label = this.add.text(player.x, player.y - 34, player.name, {
          color: "#f8fafc",
          fontFamily: "Arial",
          fontSize: "12px"
        }).setOrigin(0.5).setDepth(11);
        const hpBack = this.add.rectangle(player.x, player.y - 24, 34, 4, 0x450a0a, 0.9).setDepth(11);
        const hpFill = this.add.rectangle(player.x - 17, player.y - 24, 34, 4, 0x22c55e, 1).setOrigin(0, 0.5).setDepth(12);
        rendered = { sprite, label, hpBack, hpFill, targetX: player.x, targetY: player.y, hp: player.hp, maxHp: player.maxHp };
        this.players.set(player.id, rendered);
      }

      rendered.targetX = player.x;
      rendered.targetY = player.y;
      rendered.hp = player.hp;
      rendered.maxHp = player.maxHp;
      rendered.sprite.setTexture(texture);
      rendered.sprite.setAlpha(player.hp <= 0 ? 0.35 : player.id === this.localSessionId ? 1 : 0.86);
    }
  }

  private smoothPlayers(delta: number) {
    const alpha = Math.min(1, delta / 85);

    for (const player of this.players.values()) {
      player.sprite.x = Phaser.Math.Linear(player.sprite.x, player.targetX, alpha);
      player.sprite.y = Phaser.Math.Linear(player.sprite.y, player.targetY, alpha);
      player.label.setPosition(Math.round(player.sprite.x), Math.round(player.sprite.y - 34));
      player.hpBack.setPosition(Math.round(player.sprite.x), Math.round(player.sprite.y - 24));
      player.hpFill.setPosition(Math.round(player.sprite.x - 17), Math.round(player.sprite.y - 24));
      player.hpFill.width = 34 * Phaser.Math.Clamp(player.hp / Math.max(1, player.maxHp), 0, 1);
    }
  }

  private renderEnemies(enemies: EnemySnapshot[]) {
    const activeIds = new Set(enemies.map((enemy) => enemy.id));

    for (const [id, sprite] of this.enemies) {
      if (!activeIds.has(id)) {
        this.enemyGroup?.killAndHide(sprite);
        if (sprite.body) {
          sprite.body.enable = false;
        }
        this.enemies.delete(id);
      }
    }

    for (const enemy of enemies) {
      let sprite = this.enemies.get(enemy.id);
      const texture = `enemy-${enemy.type}`;

      if (!sprite) {
        sprite = this.enemyGroup?.get(enemy.x, enemy.y, texture) as Phaser.Physics.Arcade.Sprite | undefined;
        if (!sprite) {
          continue;
        }
        sprite.setActive(true).setVisible(true).setDepth(6);
        if (sprite.body) {
          sprite.body.enable = true;
        }
        this.enemies.set(enemy.id, sprite);
      }

      sprite.setTexture(texture);
      sprite.setPosition(enemy.x, enemy.y);
      sprite.setAlpha(0.72 + 0.28 * (enemy.hp / enemy.maxHp));
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
      const texture = projectile.source === "enemy" ? "projectile-enemy" : `projectile-${projectile.kind}`;

      if (!sprite) {
        sprite = this.projectileGroup?.get(projectile.x, projectile.y, texture) as Phaser.Physics.Arcade.Sprite | undefined;
        if (!sprite) {
          continue;
        }
        sprite.setActive(true).setVisible(true).setDepth(8);
        if (sprite.body) {
          sprite.body.enable = true;
        }
        this.projectiles.set(projectile.id, sprite);
      }

      sprite.setTexture(texture);
      sprite.setPosition(projectile.x, projectile.y);
    }
  }

  private buyUpgrade(upgradeId: UpgradeId) {
    this.room?.send("buyUpgrade", { upgradeId });
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
    this.pingText?.setText(`${averagePing} ms`);
    this.pingText?.setColor(averagePing < 90 ? "#22c55e" : averagePing < 160 ? "#facc15" : "#fb7185");
  }

  private formatConnectionError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const shortMessage = message.length > 42 ? `${message.slice(0, 39)}...` : message;

    if (message.startsWith("Health")) {
      return `HTTP hata: ${shortMessage}`;
    }

    return `Oda/WebSocket hatasi: ${shortMessage}`;
  }

  private getSelectedCharacterName() {
    return characters.find((character) => character.id === this.selectedCharacterId)?.displayName ?? "Atakan";
  }
}
