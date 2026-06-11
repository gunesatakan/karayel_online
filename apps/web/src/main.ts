import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH, type PlayerSnapshot } from "@karayel/shared";
import "./style.css";

const gameServerUrl =
  import.meta.env.VITE_GAME_SERVER_URL ??
  (import.meta.env.PROD ? "wss://karayel-online.fly.dev" : `ws://${window.location.hostname}:2567`);
const healthUrl = gameServerUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:") + "/health";

class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f172a");
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x111827);
    this.add.circle(72, 84, 34, 0x22c55e, 0.95);
    this.add.circle(318, 190, 52, 0x38bdf8, 0.2);
    this.add.circle(54, 640, 78, 0x22c55e, 0.08);

    this.add.text(28, 132, "Karayel", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "46px",
      fontStyle: "bold"
    });
    this.add.text(30, 184, "Online", {
      color: "#38bdf8",
      fontFamily: "Arial",
      fontSize: "42px",
      fontStyle: "bold"
    });

    this.add.text(30, 268, "Oyuncu", {
      color: "#94a3b8",
      fontFamily: "Arial",
      fontSize: "14px"
    });
    this.add.text(30, 292, this.getPlayerName(), {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "22px",
      fontStyle: "bold"
    });

    this.createButton(30, 560, "Oyuna Basla", () => {
      this.scene.start("game");
    });

    this.add.text(GAME_WORLD_WIDTH / 2, 790, "karayelonline.vercel.app", {
      color: "#64748b",
      fontFamily: "Arial",
      fontSize: "12px"
    }).setOrigin(0.5);
  }

  private createButton(x: number, y: number, label: string, onClick: () => void) {
    const button = this.add.rectangle(x, y, GAME_WORLD_WIDTH - 60, 58, 0x22c55e, 1)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x + (GAME_WORLD_WIDTH - 60) / 2, y + 29, label, {
      color: "#052e16",
      fontFamily: "Arial",
      fontSize: "20px",
      fontStyle: "bold"
    }).setOrigin(0.5);

    button.on("pointerdown", () => button.setFillStyle(0x16a34a));
    button.on("pointerout", () => button.setFillStyle(0x22c55e));
    button.on("pointerup", () => {
      button.setFillStyle(0x22c55e);
      onClick();
    });
    text.setInteractive({ useHandCursor: true }).on("pointerup", onClick);
  }

  private getPlayerName() {
    const savedName = window.localStorage.getItem("karayel_player_name");
    if (savedName) {
      return savedName;
    }

    const generatedName = `Oyuncu ${Math.floor(Math.random() * 900 + 100)}`;
    window.localStorage.setItem("karayel_player_name", generatedName);
    return generatedName;
  }
}

class GameScene extends Phaser.Scene {
  private room?: Room;
  private localSessionId = "";
  private playerShapes = new Map<string, Phaser.GameObjects.Arc>();
  private playerLabels = new Map<string, Phaser.GameObjects.Text>();
  private statusText?: Phaser.GameObjects.Text;
  private pingText?: Phaser.GameObjects.Text;
  private joystickBase?: Phaser.GameObjects.Arc;
  private joystickKnob?: Phaser.GameObjects.Arc;
  private joystickVector = new Phaser.Math.Vector2(0, 0);
  private joystickPointerId?: number;
  private pingTimer?: Phaser.Time.TimerEvent;
  private pingSamples: number[] = [];
  private lastMoveSentAt = 0;
  private readonly joystickCenter = new Phaser.Math.Vector2(92, GAME_WORLD_HEIGHT - 112);
  private readonly joystickRadius = 54;

  constructor() {
    super("game");
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f172a");
    this.add.rectangle(GAME_WORLD_WIDTH / 2, GAME_WORLD_HEIGHT / 2, GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT, 0x111827);
    this.add.rectangle(GAME_WORLD_WIDTH / 2, 76, GAME_WORLD_WIDTH, 112, 0x0f172a, 0.82);
    this.add.text(20, 18, "Karayel Online", {
      color: "#f8fafc",
      fontFamily: "Arial",
      fontSize: "24px",
      fontStyle: "bold"
    });
    this.statusText = this.add.text(20, 52, "Sunucuya baglaniyor...", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "14px"
    });
    this.pingText = this.add.text(GAME_WORLD_WIDTH - 20, 18, "Ping: --", {
      color: "#cbd5e1",
      fontFamily: "Arial",
      fontSize: "13px",
      fontStyle: "bold"
    }).setOrigin(1, 0);

    this.createJoystick();

    void this.connect();
  }

  update(time: number) {
    if (!this.room || time - this.lastMoveSentAt < 50) {
      return;
    }

    this.sendMove(this.joystickVector.x, this.joystickVector.y);
    this.lastMoveSentAt = time;
  }

  private createJoystick() {
    this.joystickBase = this.add.circle(this.joystickCenter.x, this.joystickCenter.y, this.joystickRadius, 0x334155, 0.45)
      .setStrokeStyle(2, 0x94a3b8, 0.35)
      .setDepth(20);
    this.joystickKnob = this.add.circle(this.joystickCenter.x, this.joystickCenter.y, 22, 0x22c55e, 0.9)
      .setStrokeStyle(2, 0xf8fafc, 0.45)
      .setDepth(21);

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
    this.sendMove(0, 0);
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
      this.statusText?.setText("Sunucu kontrol ediliyor...");
      await this.checkServerHealth();

      this.statusText?.setText("Odaya baglaniyor...");
      const client = new Client(gameServerUrl);
      this.room = await client.joinOrCreate("match", {
        playerName: this.getPlayerName(),
        characterId: "karayel"
      });
      this.localSessionId = this.room.sessionId;
      this.statusText?.setText(`Oda: ${this.room.roomId}`);

      this.room.onMessage("snapshot", (players: PlayerSnapshot[]) => {
        this.renderPlayers(players);
      });
      this.room.onMessage("latency:pong", (message: { sentAt?: number }) => {
        this.updatePing(message.sentAt);
      });
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

  private startPingLoop() {
    this.pingTimer?.remove(false);
    this.sendPing();
    this.pingTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.sendPing()
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.pingTimer?.remove(false);
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

    const averagePing = Math.round(
      this.pingSamples.reduce((total, sample) => total + sample, 0) / this.pingSamples.length
    );

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

  private getPlayerName() {
    const savedName = window.localStorage.getItem("karayel_player_name");
    if (savedName) {
      return savedName;
    }

    const generatedName = `Oyuncu ${Math.floor(Math.random() * 900 + 100)}`;
    window.localStorage.setItem("karayel_player_name", generatedName);
    return generatedName;
  }

  private sendMove(x: number, y: number) {
    this.room?.send("move", { x, y });
  }

  private renderPlayers(players: PlayerSnapshot[]) {
    const activeIds = new Set(players.map((player) => player.id));

    for (const [id, shape] of this.playerShapes) {
      if (!activeIds.has(id)) {
        shape.destroy();
        this.playerShapes.delete(id);
        this.playerLabels.get(id)?.destroy();
        this.playerLabels.delete(id);
      }
    }

    for (const player of players) {
      const isLocal = player.id === this.localSessionId;
      let shape = this.playerShapes.get(player.id);
      let label = this.playerLabels.get(player.id);

      if (!shape) {
        shape = this.add.circle(player.x, player.y, 18, isLocal ? 0x22c55e : 0x38bdf8);
        this.playerShapes.set(player.id, shape);
      }

      if (!label) {
        label = this.add.text(player.x, player.y - 36, player.name, {
          color: "#f8fafc",
          fontFamily: "Arial",
          fontSize: "12px"
        }).setOrigin(0.5);
        this.playerLabels.set(player.id, label);
      }

      shape.setPosition(player.x, player.y);
      label.setPosition(player.x, player.y - 36);
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WORLD_WIDTH,
  height: GAME_WORLD_HEIGHT,
  scene: [MenuScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  input: {
    activePointers: 3
  }
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

let hasRequestedFullscreen = false;

function requestGameFullscreen() {
  if (hasRequestedFullscreen || document.fullscreenElement) {
    return;
  }

  const target = document.querySelector<HTMLElement>("#game") ?? document.documentElement;

  hasRequestedFullscreen = true;
  void target.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {
    hasRequestedFullscreen = false;
  });
}

document.addEventListener("pointerup", requestGameFullscreen, { passive: true });
document.addEventListener("touchend", requestGameFullscreen, { passive: true });
