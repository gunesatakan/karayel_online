import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH, type PlayerSnapshot } from "@karayel/shared";
import "./style.css";

const gameServerUrl =
  import.meta.env.VITE_GAME_SERVER_URL ??
  (import.meta.env.PROD ? "wss://karayel-online.fly.dev" : "ws://localhost:2567");

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
  private pointerTarget?: Phaser.Math.Vector2;
  private lastMoveSentAt = 0;

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

    this.input.on("pointerdown", this.updatePointerTarget, this);
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.updatePointerTarget(pointer);
      }
    });
    this.input.on("pointerup", () => {
      this.pointerTarget = undefined;
      this.sendMove(0, 0);
    });

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
    this.pointerTarget = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(pointer.worldX, 0, GAME_WORLD_WIDTH),
      Phaser.Math.Clamp(pointer.worldY, 0, GAME_WORLD_HEIGHT)
    );
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
