/**
 * VFX olcumu: 20 kademe-3 kule, 60 dusman, karede ne kadar cizim.
 *
 * Oyunun kendi cizicileri (AttackVfx, BeamRenderer) sayan sahte bir Graphics'e
 * ciziyor; sahne `createStressScenario` (galerinin yuk kipiyle ayni). Sayilan:
 * karedeki Graphics cagrisi, tahmini ucgenleme kosesi (mobilde asil maliyet
 * CPU'da her karede yeniden ucgenleme), canli ADD parlama sayisi (her biri
 * tek dortgen) ve node'da karedeki JS suresi.
 *
 * Kullanim: npm run build --workspace @karayel/shared && node tools/vfx-bench.mjs
 * Ciktiya `--json` verilirse makine okunur.
 */
import { createCountingGraphics, importWebModule } from "../tests/helpers/web-module.mjs";

const FRAME_MS = 1000 / 60;
const WARMUP_FRAMES = 180;
const FRAMES = 600;

export async function runVfxBench({ lodLevel = 0 } = {}) {
  const { createStressScenario } = await importWebModule("apps/web/src/vfx/vfx-scenario.ts");
  const { AttackVfx } = await importWebModule("apps/web/src/vfx/attack-vfx.ts");
  const { BeamRenderer } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
  const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");

  const scenario = createStressScenario();
  const lod = new VfxLod();
  lod.force(lodLevel);
  const body = createCountingGraphics();
  const glow = createCountingGraphics();
  const events = createCountingGraphics();
  const beam = createCountingGraphics();
  const beamGlow = createCountingGraphics();
  const live = [];
  const flashes = { flash(spec) { live.push(spec); } };
  // Damgalar: oyunda GlowStampPool (tek ADD dortgen); burada sayiliyor.
  const stamps = { count: 0, beginFrame() { this.count = 0; }, stamp() { this.count += 1; }, endFrame() {} };
  const vfx = new AttackVfx(body, glow, events, flashes, { lod, stamps });
  const beams = new BeamRenderer(beam, beamGlow, lod);
  const surfaces = [body, glow, events, beam, beamGlow];

  let now = 10_000;
  let since = now - FRAME_MS;
  let totals = { calls: 0, vertices: 0, earcut: 0, flashes: 0, stamps: 0, ms: 0, projectiles: 0, beams: 0 };
  for (let frame = 0; frame < WARMUP_FRAMES + FRAMES; frame += 1) {
    const state = scenario.frame(now, since);
    for (const surface of surfaces) surface.reset();
    const start = performance.now();
    for (const event of state.events) {
      const input = { x: event.x, y: event.y, angle: event.angle, definitionId: event.definitionId, tier: event.tier, own: event.own, key: event.key, bornAt: event.at, radius: event.type === "contact" ? event.radius : undefined };
      if (event.type === "anticipation") vfx.emitAnticipation(input);
      else if (event.type === "muzzle") vfx.emitMuzzle(input);
      else vfx.emitImpact(input);
    }
    vfx.renderProjectiles(state.projectiles, now, 1, () => true);
    beams.render(state.beams, { now, sceneNow: now, scale: 1 });
    vfx.render(now, 1);
    const ms = performance.now() - start;
    // Canli parlamalar (FlashPool'un yaptigi gibi omru dolani dusur).
    for (let index = live.length - 1; index >= 0; index -= 1) {
      if (now - live[index].bornAt >= live[index].durationMs) live.splice(index, 1);
    }
    if (frame >= WARMUP_FRAMES) {
      for (const surface of surfaces) {
        totals.calls += surface.stats.calls;
        totals.vertices += surface.stats.vertices;
        totals.earcut += surface.stats.earcut;
      }
      totals.flashes += Math.min(64, live.length);
      totals.stamps += stamps.count;
      totals.ms += ms;
      totals.projectiles += state.projectiles.length;
      totals.beams += state.beams.length;
    }
    since = now;
    now += FRAME_MS;
  }
  const per = (value) => Math.round((value / FRAMES) * 10) / 10;
  return {
    towers: scenario.towers.length,
    enemies: scenario.walkers.length,
    lodLevel,
    callsPerFrame: per(totals.calls),
    verticesPerFrame: per(totals.vertices),
    earcutPerFrame: per(totals.earcut),
    flashQuadsLive: per(totals.flashes),
    glowStampQuads: per(totals.stamps),
    msPerFrame: Math.round((totals.ms / FRAMES) * 1000) / 1000,
    projectilesInFlight: per(totals.projectiles),
    beamsPerFrame: per(totals.beams)
  };
}

// Dogrudan calistirildiginda tablo basiyor; testten ice aktarildiginda sessiz.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/vfx-bench.mjs")) {
  const results = [];
  for (const lodLevel of [0, 1, 2, 3]) results.push(await runVfxBench({ lodLevel }));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("VFX olcumu: 20 kademe-3 kule, 60 dusman, 600 kare (60 fps)");
    console.table(results);
  }
}
