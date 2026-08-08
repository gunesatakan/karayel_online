export type MatchTelemetry = {
  roomId: string;
  startedAt: string;
  endedAt: string;
  outcome: "defeat" | "abandoned";
  wave: number;
  kills: number;
  teamHealth: number;
  mapScale: string;
  players: Array<{
    name: string;
    characterId: string;
    gold: number;
    goldSpent: number;
    towersBuilt: number;
  }>;
};

type FetchLike = typeof fetch;

export class SupabaseMatchTelemetryStore {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async recordMatch(match: MatchTelemetry) {
    const response = await this.fetchImpl(`${this.url.replace(/\/$/, "")}/rest/v1/match_telemetry`, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        room_id: match.roomId,
        started_at: match.startedAt,
        ended_at: match.endedAt,
        outcome: match.outcome,
        wave: match.wave,
        kills: match.kills,
        team_health: match.teamHealth,
        map_scale: match.mapScale,
        players: match.players
      })
    });
    if (!response.ok) {
      throw new Error(`Supabase telemetry request failed: ${response.status}`);
    }
  }
}

export function createSupabaseMatchTelemetryStore(env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch) {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? new SupabaseMatchTelemetryStore(url, key, fetchImpl) : undefined;
}
