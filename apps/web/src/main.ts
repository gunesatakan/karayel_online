import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import type { PlayerSnapshot } from "@karayel/shared";
import "./style.css";

const gameServerUrl =
  import.meta.env.VITE_GAME_SERVER_URL ??
  (import.meta.env.PROD ? "wss://karayel-online.fly.dev" : "ws://localhost:2567");

class MainScene extends Phaser.Scene {
  private room?: Room;
  private localSessionId = "";
  private playerShapes = new Map<string, Phaser.GameObjects.Arc>();
  private playerLabels = new Map<string, Phaser.GameObjects.Text>();
  private background?: Phaser.GameObjects.Rectangle;
  private titleText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private pointerTarget?: Phaser.Math.Vector2;
  private lastMoveSentAt = 0;
  private hasRequestedFullscreen = false;

  constructor() {
    super("main");
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#0f172a");
    this.background = this.add.rectangle(width / 2, height / 2, width, height, 0x111827);
    this.titleText = this.add.text(20, 18, "Karayel Online", {
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

    this.input.on("pointerdown", this.updatePointerTarget, this);
    this.input.on("pointerdown", this.requestFullscreenOnce, this);
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.updatePointerTarget(pointer);
      }
    });
    this.input.on("pointerup", () => {
      this.pointerTarget = undefined;
      this.sendMove(0, 0);
    });

    this.scale.on("resize", this.resizeScene, this);
    this.resizeScene({ width, height });

    void this.connect();
  }

  update(time: number) {
    if (!this.pointerTarget || !this.room || time - this.lastMoveSentAt < 50) {
      return;
    }

    const localShape = this.playerShapes.get(this.localSessionId);
    if (!localShape) {
      return;
    }

    const direction = new Phaser.Math.Vector2(
      this.pointerTarget.x - localShape.x,
      this.pointerTarget.y - localShape.y
    );

    if (direction.lengthSq() < 36) {
      this.sendMove(0, 0);
      this.lastMoveSentAt = time;
      return;
    }

    direction.normalize();
    this.sendMove(direction.x, direction.y);
    this.lastMoveSentAt = time;
  }

  private updatePointerTarget(pointer: Phaser.Input.Pointer) {
    this.pointerTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
  }

  private resizeScene(gameSize: { width: number; height: number }) {
    this.background?.setPosition(gameSize.width / 2, gameSize.height / 2);
    this.background?.setSize(gameSize.width, gameSize.height);
    this.titleText?.setPosition(20, 18);
    this.statusText?.setPosition(20, 52);
  }

  private requestFullscreenOnce() {
    if (this.hasRequestedFullscreen || document.fullscreenElement) {
      return;
    }

    this.hasRequestedFullscreen = true;
    void document.documentElement.requestFullscreen?.().catch(() => {
      // Some mobile browsers only allow fullscreen for installed PWAs.
    });
  }

  private async connect() {
    try {
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
    } catch (error) {
      console.error(error);
      this.statusText?.setText("Sunucuya baglanilamadi.");
    }
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

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: getViewportSize().width,
  height: getViewportSize().height,
  scene: MainScene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  input: {
    activePointers: 3
  }
});

function getViewportSize() {
  return {
    width: Math.round(window.visualViewport?.width ?? window.innerWidth),
    height: Math.round(window.visualViewport?.height ?? window.innerHeight)
  };
}

function resizeGameToViewport() {
  const { width, height } = getViewportSize();
  game.scale.resize(width, height);
}

window.visualViewport?.addEventListener("resize", resizeGameToViewport);
window.addEventListener("resize", resizeGameToViewport);
window.addEventListener("orientationchange", () => window.setTimeout(resizeGameToViewport, 250));

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
