import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import type { PlayerSnapshot } from "@karayel/shared";

const GAME_WORLD_WIDTH = 390;
const GAME_WORLD_HEIGHT = 844;
const PLAYER_RADIUS = 18;

class Player extends Schema {
  @type("string") name = "";
  @type("string") characterId = "karayel";
  @type("number") x = 320;
  @type("number") y = 240;
  @type("number") vx = 0;
  @type("number") vy = 0;
}

class MatchState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

type JoinOptions = {
  playerName?: string;
  characterId?: string;
};

type MoveMessage = {
  x?: number;
  y?: number;
};

export class MatchRoom extends Room<MatchState> {
  maxClients = 5;
  private readonly speed = 220;

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
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new Player();
    player.name = options.playerName?.slice(0, 20) || "Oyuncu";
    player.characterId = options.characterId?.slice(0, 32) || "karayel";
    player.x = 80 + Math.random() * (GAME_WORLD_WIDTH - 160);
    player.y = 180 + Math.random() * (GAME_WORLD_HEIGHT - 320);

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private update(deltaTime: number) {
    const seconds = deltaTime / 1000;

    for (const player of this.state.players.values()) {
      player.x = this.clamp(player.x + player.vx * this.speed * seconds, PLAYER_RADIUS, GAME_WORLD_WIDTH - PLAYER_RADIUS);
      player.y = this.clamp(player.y + player.vy * this.speed * seconds, 96, GAME_WORLD_HEIGHT - PLAYER_RADIUS);
    }

    this.broadcast("snapshot", this.getSnapshot());
  }

  private getSnapshot(): PlayerSnapshot[] {
    return Array.from(this.state.players.entries()).map(([id, player]) => ({
      id,
      name: player.name,
      characterId: player.characterId,
      x: player.x,
      y: player.y
    }));
  }

  private clampDirection(value: unknown) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 0;
    }

    return this.clamp(value, -1, 1);
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}
