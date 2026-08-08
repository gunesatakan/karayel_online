import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseMatchTelemetryStore } from "../apps/server/dist/persistence/supabase.js";

test("Supabase ayarları yokken kalıcılık devre dışıdır", () => {
  assert.equal(createSupabaseMatchTelemetryStore({}, async () => new Response()), undefined);
});

test("maç telemetrisi service-role başlıklarıyla REST tablosuna yazılır", async () => {
  let request;
  const store = createSupabaseMatchTelemetryStore(
    { SUPABASE_URL: "https://example.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "secret" },
    async (url, init) => {
      request = { url, init };
      return new Response(null, { status: 201 });
    }
  );
  await store.recordMatch({
    roomId: "room-1", startedAt: "2026-08-08T00:00:00.000Z", endedAt: "2026-08-08T00:01:00.000Z",
    outcome: "defeat", wave: 3, kills: 12, teamHealth: 0, mapScale: "1x", players: []
  });
  assert.equal(request.url, "https://example.supabase.co/rest/v1/match_telemetry");
  assert.equal(request.init.headers.Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(request.init.body), {
    room_id: "room-1", started_at: "2026-08-08T00:00:00.000Z", ended_at: "2026-08-08T00:01:00.000Z",
    outcome: "defeat", wave: 3, kills: 12, team_health: 0, map_scale: "1x", players: []
  });
});

test("Supabase hatası sessizce başarılı sayılmaz", async () => {
  const store = createSupabaseMatchTelemetryStore(
    { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" },
    async () => new Response(null, { status: 500 })
  );
  await assert.rejects(() => store.recordMatch({
    roomId: "room-1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: "abandoned",
    wave: 1, kills: 0, teamHealth: 100, mapScale: "1x", players: []
  }), /failed: 500/);
});
