/**
 * VFX olcumu: 20 kademe-3 kule, 60 dusman, karede ne kadar cizim.
 *
 * Oyunun kendi cizicileri (AttackVfx, BeamRenderer, AtakanSignatureVfx) sayan sahte bir Graphics'e
 * ciziyor; sahne `createStressScenario` (galerinin yuk kipiyle ayni; Atakan'in
 * alti kulesi sv 10'da, yigin alanlariyla: Obsesyon ipi, Ucube gostergesi,
 * Sunucu bagi, Izolasyon alani ve dortte bir dusmanda uc yiginli isaret). Sayilan:
 * karedeki Graphics cagrisi, tahmini ucgenleme kosesi (mobilde asil maliyet
 * CPU'da her karede yeniden ucgenleme), canli ADD parlama sayisi (her biri
 * tek dortgen) ve node'da karedeki JS suresi.
 *
 * `markEvery`: her N. dusman uc yiginla isaretli (varsayilan 4 = 15 dusman;
 * 1 = 60 dusmanin hepsi -- birkac Takipci lazeri besliyorken gercekci).
 *
 * Zeynep imzalari da olculuyor (ZeynepSignatureVfx, oyundaki izleyiciyle:
 * Hiza'nin ferman cizgisi, Gosteri'nin spot isiklari, Taht mizraklari, Kin
 * damgalari). `kinBrandEvery`: her N. dusman surekli Kin damgali (1 = 60
 * dusmanin hepsi -- iki Kin kulesinin kalabalik dalgadaki en kotu durumu).
 *
 * Kullanim: npm run build --workspace @karayel/shared && node tools/vfx-bench.mjs
 * Ciktiya `--json` verilirse makine okunur.
 */
import { createCountingGraphics, importWebModule } from "../tests/helpers/web-module.mjs";

const FRAME_MS = 1000 / 60;
const WARMUP_FRAMES = 180;
const FRAMES = 600;

export async function runVfxBench({ lodLevel = 0, markEvery = 4, kinBrandEvery = 0 } = {}) {
  const { createStressScenario } = await importWebModule("apps/web/src/vfx/vfx-scenario.ts");
  const { AttackVfx } = await importWebModule("apps/web/src/vfx/attack-vfx.ts");
  const { BeamRenderer } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
  const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");
  const { AtakanSignatureVfx } = await importWebModule("apps/web/src/vfx/atakan-signatures.ts");
  const { ScenarioCourtFeed } = await importWebModule("apps/web/src/vfx/vfx-scenario.ts");
  const { ZeynepSignatureVfx } = await importWebModule("apps/web/src/vfx/zeynep-signatures.ts");

  const scenario = createStressScenario(390, 90, 640, { teamMarkEvery: markEvery, kinBrandEvery });
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
  const signatureGround = createCountingGraphics();
  const signatureLinks = createCountingGraphics();
  const signatureGlow = createCountingGraphics();
  const signatureMarks = createCountingGraphics();
  const signatures = new AtakanSignatureVfx(signatureGround, signatureLinks, signatureGlow, signatureMarks, { lod });
  const signatureSurfaces = [signatureGround, signatureLinks, signatureGlow, signatureMarks];
  const courtSurfaces = [createCountingGraphics(), createCountingGraphics(), createCountingGraphics(), createCountingGraphics()];
  const court = new ZeynepSignatureVfx(...courtSurfaces, { lod });
  // Harita karesi 28 (yuk sahnesinin karesi): Kin bandi ve Abarti rayi bununla.
  const courtFeed = new ScenarioCourtFeed(court, { gridSize: 28, worldScale: 28 / 34, isOwnOwner: (ownerId) => ownerId === undefined });
  const courtFrame = { enemies: [], now: 0, scale: 1, enemySize: () => 34 };
  const surfaces = [body, glow, events, beam, beamGlow, ...signatureSurfaces, ...courtSurfaces];
  // Dusmanin ekrandaki capi: grunt 34 birim (GameScene getEnemySpriteDisplaySize).
  const signatureFrame = { towers: [], enemies: [], now: 0, scale: 1, cellSize: 28, isOwn: (tower) => tower.ownerId === undefined, enemySize: () => 34 };

  let now = 10_000;
  let since = now - FRAME_MS;
  let totals = { calls: 0, vertices: 0, earcut: 0, flashes: 0, stamps: 0, ms: 0, projectiles: 0, beams: 0, signatureCalls: 0, signatureVertices: 0, courtCalls: 0, courtVertices: 0, courtEvents: 0 };
  for (let frame = 0; frame < WARMUP_FRAMES + FRAMES; frame += 1) {
    const state = scenario.frame(now, since);
    for (const surface of surfaces) surface.reset();
    const start = performance.now();
    for (const event of state.events) {
      if (event.type === "court") continue;
      const input = { x: event.x, y: event.y, angle: event.angle, definitionId: event.definitionId, tier: event.tier, own: event.own, key: event.key, bornAt: event.at, radius: event.type === "contact" ? event.radius : undefined };
      if (event.type === "anticipation") vfx.emitAnticipation(input);
      else if (event.type === "muzzle") vfx.emitMuzzle(input);
      else vfx.emitImpact(input);
    }
    vfx.renderProjectiles(state.projectiles, now, 1, () => true);
    beams.render(state.beams, { now, sceneNow: now, scale: 1 });
    vfx.render(now, 1);
    signatureFrame.towers = state.signatureTowers;
    signatureFrame.enemies = state.signatureEnemies;
    signatureFrame.now = now;
    signatures.render(signatureFrame);
    courtFeed.feed(state, now);
    courtFrame.enemies = state.signatureEnemies;
    courtFrame.now = now;
    court.render(courtFrame);
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
      for (const surface of signatureSurfaces) {
        totals.signatureCalls += surface.stats.calls;
        totals.signatureVertices += surface.stats.vertices;
      }
      for (const surface of courtSurfaces) {
        totals.courtCalls += surface.stats.calls;
        totals.courtVertices += surface.stats.vertices;
      }
      totals.courtEvents += court.liveEvents;
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
    marked: Math.ceil(scenario.walkers.length / markEvery),
    kinBranded: kinBrandEvery > 0 ? Math.ceil(scenario.walkers.length / kinBrandEvery) : 0,
    lodLevel,
    callsPerFrame: per(totals.calls),
    verticesPerFrame: per(totals.vertices),
    earcutPerFrame: per(totals.earcut),
    flashQuadsLive: per(totals.flashes),
    glowStampQuads: per(totals.stamps),
    msPerFrame: Math.round((totals.ms / FRAMES) * 1000) / 1000,
    projectilesInFlight: per(totals.projectiles),
    beamsPerFrame: per(totals.beams),
    // Atakan imzalarinin payi (yukaridaki toplamlarin icinde).
    signatureCallsPerFrame: per(totals.signatureCalls),
    signatureVerticesPerFrame: per(totals.signatureVertices),
    // Zeynep imzalarinin payi (yukaridaki toplamlarin icinde).
    courtCallsPerFrame: per(totals.courtCalls),
    courtVerticesPerFrame: per(totals.courtVertices),
    courtEventsLive: per(totals.courtEvents)
  };
}

// Dogrudan calistirildiginda tablo basiyor; testten ice aktarildiginda sessiz.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/vfx-bench.mjs")) {
  const results = [];
  for (const lodLevel of [0, 1, 2, 3]) results.push(await runVfxBench({ lodLevel }));
  // Hepsi isaretli: 60 dusman, uc yigin.
  for (const lodLevel of [0, 1, 2, 3]) results.push(await runVfxBench({ lodLevel, markEvery: 1 }));
  // Zeynep'in en kotu durumu: 60 dusmanin hepsi Kin damgali (isaret varsayilan).
  for (const lodLevel of [0, 1, 2, 3]) results.push(await runVfxBench({ lodLevel, kinBrandEvery: 1 }));
  // Birlesik en kotu durum: 60 dusmanin hepsi hem Takipci isaretli hem Kin damgali.
  for (const lodLevel of [0, 1, 2, 3]) results.push(await runVfxBench({ lodLevel, markEvery: 1, kinBrandEvery: 1 }));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("VFX olcumu: 20 kademe-3 kule, 60 dusman (15 ya da 60'i isaretli; ya da 60'i Kin damgali), 600 kare (60 fps)");
    console.table(results);
  }
}
