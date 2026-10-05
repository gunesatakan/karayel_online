/**
 * Kademe dili (agir, sert): her saldiran kulenin profili var ve uc kademesi
 * gercekten farkli -- ama sus ile degil, yogunlukla.
 *
 * c59c79b alti kuleyi sessizce kademe halkalarindan dusurdu ve hicbir test
 * bunu gormedi: testler yalnizca kademenin tele ciktigini sayiyordu, ekranda
 * neyin cizildigini degil. Buradaki testler:
 *
 * - Katalogdaki her saldiran kulenin kayitli bir profili var (turetilmis yedek
 *   degil); uc kademesi cekirdegin sicakliginda, govdenin agirliginda ve
 *   vurusun gucunde kesin olarak artiyor.
 * - Ton kulenin kendi tonu, yere indirilmis: varsayilan yesil yok, rampa ayni
 *   tonda kaliyor (pembe -> altin -> beyaz altin gibi rutbe rampasi yok).
 * - Cizici kademe yukseldikce daha agir ve daha sicak ciziyor; carpma daha
 *   cok kivilcim ve kirinti sacip daha buyuk ve sert parliyor.
 * - LOD once kivilcimi, sonra dumani, sonra yer izini, en son iz uzunlugunu
 *   kesiyor.
 * - Isinlar snapshot'lar arasinda kimlikle ara degerleniyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { towerCatalog } from "../packages/shared/dist/index.js";
import { createCountingGraphics, createRecorder, importWebModule } from "./helpers/web-module.mjs";

const profiles = await importWebModule("apps/web/src/vfx/vfx-profiles.ts");
const { AttackVfx } = await importWebModule("apps/web/src/vfx/attack-vfx.ts");
const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");
const { BeamInterpolator, BeamRenderer } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
const signatures = await importWebModule("apps/web/src/vfx/atakan-signatures.ts");
const { VfxScenario } = await importWebModule("apps/web/src/vfx/vfx-scenario.ts");

const attacking = [...new Map(Object.values(towerCatalog).flat().map((tower) => [tower.id, tower])).values()]
  .filter((tower) => profiles.isAttackingDefinition(tower));

/** Rengin HSL acikligi (0-1). */
const lightness = (color) => {
  const [r, g, b] = channels(color).map((value) => value / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};
/** Vurusun gucu: kivilcim, kirinti, catirti, parlama ve hiz birlikte. */
const force = (recipe) => recipe.impact.sparks + recipe.impact.debris + recipe.impact.crackle + recipe.impact.flash / 4 + recipe.impact.force / 50;

const channels = (color) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
const distance = (a, b) => {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

test("katalogdaki her saldıran kulenin kayıtlı bir profili var", () => {
  assert.ok(attacking.length >= 40, `saldiran kule sayisi ${attacking.length}`);
  const missing = attacking.filter((tower) => !profiles.hasExplicitVfxProfile(tower.id)).map((tower) => tower.id);
  assert.deepEqual(missing, [], `profilsiz saldiri: ${missing.join(", ")}`);
  // Destek yapilari profil listesine sizmasin.
  for (const id of ["zeynep-7", "zeynep-8", "wall-1", "repair-depot-1", "warrior-7", "archer-8"]) {
    assert.ok(!attacking.some((tower) => tower.id === id), `${id} saldiri sayilmamali`);
  }
});

test("her profilin üç kademesi yoğunlukta ayrışır: çekirdek daha sıcak, gövde daha ağır, vuruş daha güçlü", () => {
  for (const tower of attacking) {
    const profile = profiles.getVfxProfile(tower.id);
    const [t1, t2, t3] = profile.tiers;
    assert.deepEqual([t1.tier, t2.tier, t3.tier], [1, 2, 3]);
    for (const [a, b, label] of [[t1, t2, "1-2"], [t2, t3, "2-3"]]) {
      assert.ok(b.heat > a.heat, `${tower.id} kademe ${label}: cekirdek isinmiyor`);
      assert.ok(lightness(b.core) > lightness(a.core), `${tower.id} kademe ${label}: cekirdek beyazlasmiyor`);
      assert.ok(b.weight > a.weight, `${tower.id} kademe ${label}: govde agirlasmiyor`);
      assert.ok(force(b) > force(a), `${tower.id} kademe ${label}: vurus guclenmiyor`);
      assert.ok(b.impact.flash > a.impact.flash, `${tower.id} kademe ${label}: sert parlama buyumuyor`);
      assert.ok(b.trail.points >= a.trail.points, `${tower.id} kademe ${label}: iz kisaliyor`);
    }
    // Sok halkasi yalnizca kademe 3'te ve yalnizca agir ya da alan vurusunda.
    assert.equal(t1.impact.shockRing || t2.impact.shockRing, false, `${tower.id}: sok halkasi kademe 3'un`);
    assert.equal(t3.impact.shockRing, profile.heavy || profile.aoe, `${tower.id}: sok halkasi agir/alan vurusunda`);
    // Siluet kademeyle buyumuyor; agirlik ve cekirdek buyuyor.
    assert.equal(t1.silhouette, t3.silhouette, `${tower.id} siluet buyumemeli`);
    assert.ok(t1.silhouette >= 12 && t1.silhouette <= 16, `${tower.id} siluet ${t1.silhouette} (12-16)`);
    // Kisa sert iz: en fazla 5 nokta; namlu sarji kisa.
    assert.ok(t3.trail.points <= 5, `${tower.id} iz ${t3.trail.points} nokta`);
    assert.ok(t3.muzzle.anticipationMs <= 120, `${tower.id} namlu sarji ${t3.muzzle.anticipationMs} ms`);
  }
});

test("rampa kulenin kendi tonunda ve yere indirilmiş: varsayılan yeşil yok, altın rütbe rampası yok", () => {
  const saturation = (color) => {
    const [r, g, b] = channels(color).map((value) => value / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    return max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  };
  for (const tower of attacking) {
    const { ramp } = profiles.getVfxProfile(tower.id);
    assert.ok(!ramp.includes(0x86efac), `${tower.id} varsayilan yesili kullaniyor`);
    // Debug Lazer'in rampasi sunucunun lazer renkleri (kirmizi, mavi, beyaz): dokunulmadi.
    if (tower.id === "warrior-5") continue;
    for (const legacy of [0xf59e0b, 0xfde68a, 0xfacc15, 0x93c5fd, 0xfff1f2]) {
      assert.ok(!ramp.includes(legacy), `${tower.id} eski rutbe/genel kademe rengi ${legacy.toString(16)}`);
    }
    for (const stop of ramp) {
      assert.ok(profiles.hueDistance(stop, ramp[0]) <= 6, `${tower.id} rampa tonu kayiyor (${stop.toString(16)})`);
      assert.ok(saturation(stop) <= 0.625, `${tower.id} rampa doygun (${stop.toString(16)}: ${saturation(stop).toFixed(2)})`);
    }
    const [r, g, b] = channels(ramp[2]);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) >= 12, `${tower.id} kademe 3 tumuyle beyaz (${ramp[2].toString(16)})`);
  }
  // Zeynep'in kuleleri kendi tonlarinda: kizil, gul, eflatun -- altin degil.
  for (const id of ["zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6"]) {
    const { ramp, base } = profiles.getVfxProfile(id);
    assert.ok(profiles.hueDistance(ramp[2], base) <= 6, `${id} kademe 3 tonu kulenin tonu degil`);
  }
});

test("profil çizicisi kademe yükseldikçe daha ağır ve daha sıcak çiziyor; kademe 2+ ısısı ADD katmanında", () => {
  const lod = new VfxLod();
  lod.force(0);
  for (const tower of attacking) {
    const profile = profiles.getVfxProfile(tower.id);
    if (profile.silhouette === "none") continue;
    const hottest = [];
    const glowCalls = [];
    for (const tier of [1, 2, 3]) {
      const body = createRecorder();
      const glow = createRecorder();
      const events = createRecorder();
      const vfx = new AttackVfx(body, glow, events, undefined, { lod });
      // Birkac kare: izin noktalari dolsun.
      for (let frame = 0; frame < 6; frame += 1) {
        vfx.renderProjectiles([{ id: "p1", kind: "tower", source: "tower", definitionId: tower.id, x: 100 + frame * 4, y: 200, vx: 240, vy: 0, tier: tier === 1 ? undefined : tier }], 1000 + frame * 16, 1);
      }
      const colors = body.calls.filter(([name]) => name === "lineStyle" || name === "fillStyle").map(([name, a, b]) => (name === "lineStyle" ? b : a));
      hottest.push(colors.length > 0 ? Math.max(...colors.map(lightness)) : 0);
      glowCalls.push(glow.calls.filter(([name]) => name !== "clear").length);
    }
    if (profile.silhouette !== "sprite") {
      assert.ok(hottest[1] > hottest[0] && hottest[2] > hottest[1], `${tower.id} cekirdek isinmiyor: ${hottest.map((value) => value.toFixed(3)).join(" / ")}`);
    }
    assert.ok(glowCalls[1] > 0 && glowCalls[2] > 0, `${tower.id} kademe 2-3 isisi ADD katmanina gitmiyor`);
  }
});

test("çarpma: kademe yükseldikçe daha güçlü; sert parlama 1-3 kare, büyümüyor; iğne ucu yalnızca kademe 3", () => {
  const lod = new VfxLod();
  lod.force(0);
  for (const tower of attacking) {
    const vertices = [];
    const flashes = [];
    for (const tier of [1, 2, 3]) {
      const events = createCountingGraphics();
      const flashLog = [];
      const vfx = new AttackVfx(createRecorder(), createRecorder(), events, { flash: (spec) => flashLog.push(spec) }, { lod });
      vfx.emitImpact({ x: 50, y: 50, angle: 0.3, definitionId: tower.id, tier, bornAt: 0, key: "c1" });
      // Bir kac kare: kivilcim, kirinti ve duman olayin omru boyunca.
      for (const at of [20, 60, 120, 200]) vfx.render(at, 1);
      vertices.push(events.stats.vertices);
      flashes.push(flashLog);
    }
    assert.ok(vertices[1] > vertices[0] && vertices[2] > vertices[1], `${tower.id} carpma kosesi ${vertices.join(" / ")}`);
    for (const log of flashes) {
      const hard = log[0];
      assert.equal(hard.texture, "glow");
      assert.equal(hard.sizeFrom, hard.sizeTo, `${tower.id} sert parlama buyumemeli`);
      assert.ok(hard.durationMs <= 50, `${tower.id} sert parlama ${hard.durationMs} ms (1-3 kare)`);
    }
    assert.ok(flashes[2][0].sizeFrom > flashes[0][0].sizeFrom, `${tower.id} kademe 3 parlamasi daha buyuk`);
    const pinpoint = (log) => log.some((spec) => spec.tint === 0xffffff && spec.durationMs <= 40);
    assert.equal(pinpoint(flashes[0]) || pinpoint(flashes[1]), false, `${tower.id} igne ucu kademe 3'un`);
    assert.ok(pinpoint(flashes[2]), `${tower.id} kademe 3 igne ucu yok`);
    // Halka en fazla bir tane ve yalnizca kademe 3'te (agir vurus).
    for (const [index, log] of flashes.entries()) {
      assert.ok(log.filter((spec) => spec.texture === "ring").length <= (index === 2 ? 1 : 0), `${tower.id} kademe ${index + 1} halka yigiyor`);
    }
  }
});

test("takım arkadaşının kademe 3 eklentileri soluk, kendi kulen tam", () => {
  const lod = new VfxLod();
  lod.force(0);
  const alphaSum = (own) => {
    const events = createRecorder();
    const vfx = new AttackVfx(createRecorder(), createRecorder(), events, undefined, { lod });
    vfx.emitImpact({ x: 50, y: 50, angle: 0, definitionId: "warrior-1", tier: 3, own, bornAt: 0, key: "c" });
    vfx.render(150, 1);
    return events.calls
      .filter(([name]) => name === "lineStyle" || name === "fillStyle")
      .reduce((sum, [name, ...args]) => sum + (name === "lineStyle" ? args[2] : args[1]), 0);
  };
  assert.ok(alphaSum(false) < alphaSum(true), "takim arkadasinin eklentileri soluk degil");
});

test("ağır tek vuruş yalnızca kademe 3'te ve yalnızca kendi kulende sarsıyor", () => {
  const shakes = [];
  const vfx = new AttackVfx(createRecorder(), createRecorder(), createRecorder(), undefined, { lod: new VfxLod(), onHeavyImpact: () => shakes.push(1) });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "warrior-2", tier: 2, own: true, bornAt: 0 });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "warrior-2", tier: 3, own: false, bornAt: 0 });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "warrior-1", tier: 3, own: true, bornAt: 0 });
  assert.equal(shakes.length, 0);
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "warrior-2", tier: 3, own: true, bornAt: 0 });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "onur-2", tier: 3, own: true, bornAt: 0 });
  assert.equal(shakes.length, 2);
});

test("LOD önce kıvılcımı, sonra dumanı, sonra yer izini, en son iz uzunluğunu düşürüyor; renk hiç", () => {
  const lod = new VfxLod();
  let now = 0;
  const run = (vfxMs, frameMs, ms) => {
    for (let t = 0; t < ms; t += 16) {
      now += 16;
      lod.note(vfxMs, frameMs, now);
    }
  };
  const state = () => [lod.level, lod.sparks, lod.smoke, lod.decals, lod.trailScale];
  run(1, 16, 1000);
  assert.deepEqual(state(), [0, true, true, true, 1]);
  // Yuk altinda her yarim saniyede bir basamak; her basamak bir sey daha dokuyor.
  const expected = [
    [1, false, true, true, 1],
    [2, false, false, true, 1],
    [3, false, false, false, 1],
    [4, false, false, false, 0.5]
  ];
  for (const step of expected) {
    for (let guard = 0; guard < 200 && lod.level < step[0]; guard += 1) run(6, 30, 16);
    assert.deepEqual(state(), step);
  }
  run(6, 30, 2000);
  assert.equal(lod.level, 4, "ust sinir 4");
  // Rahatlayinca yavas geri donuyor.
  run(0.5, 16, 1500);
  assert.equal(lod.level, 4, "bir buçuk saniyede donmemeli");
  run(0.5, 16, 9000);
  assert.equal(lod.level, 0);
});

test("ışın uçları kimlikle ara değerleniyor: küçük dönüş yay, hedef değişimi kesme", () => {
  const interpolator = new BeamInterpolator();
  const laser = (id, x2, y2, extra = {}) => ({ id, definitionId: "warrior-5", x1: 0, y1: 0, x2, y2, width: 4, color: 1, ttlMs: 200, ...extra });
  // Kucuk donus (0.2 rad, supurur gibi): aci ve boy ara degerleniyor, kiris degil yay.
  const small = Math.atan2(Math.sin(0.2) * 100, Math.cos(0.2) * 100);
  const arc = interpolator.interpolate([laser("beam-t1", 100, 0)], [laser("beam-t1", Math.cos(0.2) * 100, Math.sin(0.2) * 100, { ttlMs: 140 })], 0.5, 60)[0];
  assert.ok(Math.abs(Math.hypot(arc.x2, arc.y2) - 100) < 1e-6, "boy korunmali (yay)");
  assert.ok(Math.abs(Math.atan2(arc.y2, arc.x2) - small / 2) < 1e-6);
  assert.equal(arc.ttlMs, 170);

  // Hedef degistirme (90 derece): ayni kimlik, ama ara deger yok, kesme.
  const cut = interpolator.interpolate([laser("beam-t1", 100, 0)], [laser("beam-t1", 0, 100)], 0.5, 60)[0];
  assert.deepEqual([cut.x2, cut.y2], [0, 100], "hedef degisimi yay cizmemeli");
  // Normal <-> asiri yukleme gecisi: kesme.
  const mode = interpolator.interpolate([laser("beam-t1", 100, 0)], [laser("beam-t1", 99, 10, { overdrive: true })], 0.5, 60)[0];
  assert.deepEqual([mode.x2, mode.y2], [99, 10]);
  // Asiri yukleme supurmesi: uzak uc bir kareden fazla gitse de ara degerleniyor.
  const sweep = interpolator.interpolate([laser("beam-t1", 300, 0, { overdrive: true })], [laser("beam-t1", Math.cos(0.3) * 300, Math.sin(0.3) * 300, { overdrive: true })], 0.5, 60)[0];
  assert.ok(Math.abs(Math.atan2(sweep.y2, sweep.x2) - 0.15) < 1e-6, "supurme ara degerlenmeli");
  // Lanet diski hedef degistirdi (uc bir kareden fazla sicradi): kesme.
  const curse = (x2) => ({ id: "melis-curse-t3", definitionId: "archer-3-curse", x1: 0, y1: 0, x2, y2: 40, width: 30, color: 3, ttlMs: 300 });
  const jump = interpolator.interpolate([curse(0)], [curse(60)], 0.5, 60)[0];
  assert.equal(jump.x2, 60);

  // Iki snapshot arasinda dogan isin biraz daha genc; uzatma bir aralikla sinirli.
  const born = interpolator.interpolate([], [{ id: "showcase-new", definitionId: "zeynep-2", x1: 5, y1: 5, x2: 50, y2: 5, width: 20, color: 2, ttlMs: 230 }], 0.5, 60)[0];
  assert.equal(born.ttlMs, 260);
  const late = interpolator.interpolate([], [{ id: "showcase-new", definitionId: "zeynep-2", x1: 5, y1: 5, x2: 50, y2: 5, width: 20, color: 2, ttlMs: 230 }], 0, 900)[0];
  assert.equal(late.ttlMs, 290, "kopuk baglantida uzatma 60 ms ile sinirli");
  // Havuz: ikinci cagri yeni nesne uretmiyor.
  const again = interpolator.interpolate([laser("beam-t1", 100, 0)], [laser("beam-t1", 100, 1)], 0.25, 60);
  assert.equal(again[0], cut);
});

test("LOD 30 Hz'e kilitli cihazda (düşük güç kipi) kendiliğinden yükselmiyor", () => {
  const lod = new VfxLod();
  let now = 0;
  for (let t = 0; t < 8000; t += 33.3) {
    now += 33.3;
    lod.note(1, 33.3, now);
  }
  assert.equal(lod.level, 0, "30 Hz cihazin her karesi yavas sayilmamali");
  // Ayni cihazda gercek takilma (kare 60 ms) yine yukseltiyor.
  for (let t = 0; t < 1500; t += 60) {
    now += 60;
    lod.note(1, 60, now);
  }
  assert.ok(lod.level >= 1);
});

test("LOD 2-3 çarpma ayrıntısını da kısıyor: imza sınırı ve ikinci vuruş halkası", () => {
  const lod = new VfxLod();
  const count = (level) => {
    lod.force(level);
    const events = createCountingGraphics();
    const vfx = new AttackVfx(createRecorder(), createRecorder(), events, undefined, { lod });
    for (let index = 0; index < 12; index += 1) {
      vfx.emitImpact({ x: index * 20, y: 50, angle: 0, definitionId: "warrior-4", tier: 3, bornAt: 0, key: `c${index}` });
    }
    vfx.render(200, 1);
    return events.stats.vertices;
  };
  const full = count(0);
  const shed = count(3);
  assert.ok(shed < full * 0.75, `LOD 3 carpma kosesi ${shed} / ${full}`);
});

test("hareket azaltmada ADD parlamaları büyümüyor, iğne ucu ve genişleyen halka yok", () => {
  const flashes = [];
  const vfx = new AttackVfx(createRecorder(), createRecorder(), createRecorder(), { flash: (spec) => flashes.push(spec) }, { lod: new VfxLod(), reducedMotion: () => true });
  vfx.emitMuzzle({ x: 0, y: 0, angle: 0, definitionId: "warrior-1", tier: 3, bornAt: 0 });
  vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "warrior-1", tier: 3, bornAt: 0 });
  assert.ok(flashes.length > 0);
  for (const spec of flashes) {
    assert.equal(spec.sizeFrom, spec.sizeTo, `${spec.texture} buyumemeli`);
    assert.notEqual(spec.texture, "ring");
    assert.notEqual(spec.texture, "spark");
  }
});

test("tek karelik beyaz iğne ucu saniyede en fazla 3 kez", () => {
  const flashes = [];
  const vfx = new AttackVfx(createRecorder(), createRecorder(), createRecorder(), { flash: (spec) => flashes.push(spec) }, { lod: new VfxLod() });
  for (let at = 0; at < 1000; at += 50) {
    vfx.emitImpact({ x: 0, y: 0, angle: 0, definitionId: "warrior-1", tier: 3, bornAt: at, key: `p${at}` });
  }
  const pinpoints = flashes.filter((spec) => spec.texture === "glow" && spec.tint === 0xffffff && spec.durationMs <= 40);
  assert.ok(pinpoints.length <= 3, `bir saniyede ${pinpoints.length} igne ucu`);
});

test("yük testi bütçesi: 20 kademe-3 kule ve 60 düşmanda karede çizim sınırlı", async () => {
  // Olcum tools/vfx-bench.mjs ile ayni (Phaser'in gercek ucgenleme maliyetiyle
  // sayan sahte Graphics). Ilk cizim ayni sahnede ~34.6k kose ve ~24 earcut,
  // sus dili (d7ae205-529aeca) ~14.9k kose uretiyordu.
  const { runVfxBench } = await import("../tools/vfx-bench.mjs");
  const full = await runVfxBench({ lodLevel: 0 });
  const shed = await runVfxBench({ lodLevel: 3 });
  const trail = await runVfxBench({ lodLevel: 4 });
  assert.ok(full.verticesPerFrame < 20000, `kose ${full.verticesPerFrame}`);
  // Agir, sert dil eskisinden ucuz: ayni sahnede 14.9k kose idi.
  assert.ok(full.verticesPerFrame < 12000, `kose ${full.verticesPerFrame} (eski 14.9k)`);
  assert.ok(trail.verticesPerFrame <= shed.verticesPerFrame, "LOD 4 iz uzunlugunu kisaltiyor");
  assert.ok(full.earcutPerFrame < 16, `earcut ${full.earcutPerFrame}`);
  assert.ok(full.flashQuadsLive <= 64 && full.glowStampQuads <= 192);
  assert.ok(shed.callsPerFrame < full.callsPerFrame, "LOD cizimi azaltmali");
  assert.ok(shed.verticesPerFrame <= full.verticesPerFrame);
});

/* ------------------------------------------------------------------ */
/* Atakan imzalari: ham sinyal -> derlenmis -> asiri yukleme            */
/* ------------------------------------------------------------------ */

const ACCENT = 0x22c55e;
const ATAKAN_SIGNED = ["warrior-1", "warrior-2", "warrior-3", "warrior-4", "warrior-6"];
const lineColors = (recorder) => new Set(recorder.calls.filter(([name]) => name === "lineStyle").map(([, , color]) => color));
const fillColors = (recorder) => new Set(recorder.calls.filter(([name]) => name === "fillStyle").map(([, color]) => color));

test("Atakan imzaları mekaniği taşıyor, süs taşımıyor; Debug Lazer'e dokunulmadı", () => {
  assert.equal(profiles.getVfxProfile("warrior-5").signature, undefined, "lazerin profili imza almamali");
  const mechanics = new Set();
  for (const id of ATAKAN_SIGNED) {
    const signature = profiles.getVfxProfile(id).signature;
    assert.ok(signature, `${id} imzasi yok`);
    mechanics.add(signature.mechanic);
    // Imza yalnizca mekanik: kademe basina sus bayragi (aksan, paket, kod biti) yok.
    assert.deepEqual(Object.keys(signature), ["mechanic"], `${id} imzasi sus tasiyor`);
  }
  assert.equal(mechanics.size, ATAKAN_SIGNED.length, "her kulenin kendi mekanik imzasi olmali");
  // Ucube artik Sunucu'nun yeniden boyanmis simsegi degil.
  assert.notEqual(profiles.getVfxProfile("warrior-6").silhouette, profiles.getVfxProfile("warrior-2").silhouette);
  assert.notEqual(profiles.getVfxProfile("warrior-6").impact, profiles.getVfxProfile("warrior-2").impact);
});

test("Atakan çizimi: terminal yeşili aksan ve kod biti yok; kademe ağırlıkla ve sıcaklıkla", () => {
  const lod = new VfxLod();
  lod.force(0);
  for (const id of ATAKAN_SIGNED) {
    const drawn = [1, 2, 3].map((tier) => {
      const body = createRecorder();
      const glow = createRecorder();
      const events = createRecorder();
      const vfx = new AttackVfx(body, glow, events, undefined, { lod });
      for (let frame = 0; frame < 6; frame += 1) {
        vfx.renderProjectiles([{ id: "p1", kind: "tower", source: "tower", definitionId: id, x: 100 + frame * 4, y: 200, vx: 240, vy: 0, tier: tier === 1 ? undefined : tier }], 1000 + frame * 16, 1);
      }
      vfx.emitMuzzle({ x: 0, y: 0, angle: 0, definitionId: id, tier, bornAt: 2000, key: "m1" });
      vfx.emitImpact({ x: 50, y: 50, angle: 0.3, definitionId: id, tier, bornAt: 2000, key: "c1" });
      vfx.render(2040, 1);
      vfx.render(2150, 1);
      const all = [...body.calls, ...glow.calls, ...events.calls];
      return {
        accent: all.some(([name, a, b]) => (name === "lineStyle" && b === ACCENT) || (name === "fillStyle" && a === ACCENT)),
        width: Math.max(...all.filter(([name]) => name === "lineStyle").map(([, width]) => width))
      };
    });
    for (const [index, entry] of drawn.entries()) assert.equal(entry.accent, false, `${id} kademe ${index + 1}: terminal yesili aksan`);
    assert.ok(drawn[0].width < drawn[1].width && drawn[1].width < drawn[2].width, `${id} cizgi agirlasmiyor: ${drawn.map((entry) => entry.width.toFixed(2)).join(" / ")}`);
  }
});

test("Sunucu çarpması gerçek yarıçapta: halka sunucunun r'sinde", () => {
  const events = createRecorder();
  const vfx = new AttackVfx(createRecorder(), createRecorder(), events, undefined, { lod: new VfxLod() });
  vfx.emitImpact({ x: 100, y: 100, angle: 0, definitionId: "warrior-2", tier: 1, bornAt: 0, key: "s", radius: 40 });
  vfx.render(200, 1);
  const ringPoint = events.calls.find(([name, x, y]) => name === "moveTo" && Math.abs(Math.hypot(x - 100, y - 100) - 40) < 0.5);
  assert.ok(ringPoint, "Sunucu halkasi 40 birimlik alani cizmeli");
});

test("Takipçi nişangâhı gövdeyi sarıyor, yığın başına daralıyor, kertikler okunur ve yazının yolunda değil", () => {
  // Girdi dusmanin ekrandaki capi: grunt 34, iri brute ~56 birim.
  const GRUNT = 34;
  assert.ok(signatures.getMarkReticleHalf(GRUNT, 1) > signatures.getMarkReticleHalf(GRUNT, 2));
  assert.ok(signatures.getMarkReticleHalf(GRUNT, 2) > signatures.getMarkReticleHalf(GRUNT, 3));
  // Govdeyi sariyor: 1 yiginda bile sprite'in yari boyunu (17) asmiyor; iri brute'ta da.
  assert.ok(signatures.getMarkReticleHalf(GRUNT, 1) <= GRUNT / 2);
  assert.ok(signatures.getMarkReticleHalf(56, 1) <= 56 / 2);
  const lod = new VfxLod();
  const extents = [];
  for (const stacks of [1, 2, 3]) {
    lod.force(0);
    const marks = createRecorder();
    const glow = createRecorder();
    const vfx = new signatures.AtakanSignatureVfx(createRecorder(), createRecorder(), glow, marks, { lod, reducedMotion: () => true });
    vfx.render({ towers: [], enemies: [{ id: "e1", x: 100, y: 100, trackingStacks: stacks }], now: 500, scale: 1, cellSize: 34, enemySize: () => GRUNT });
    const lines = [...marks.calls, ...glow.calls].filter(([name]) => name === "lineBetween");
    extents.push(Math.max(...lines.map(([, x1, y1]) => Math.max(Math.abs(x1 - 100), Math.abs(y1 - 100)))));
    const half = signatures.getMarkReticleHalf(GRUNT, stacks);
    // Kertikler nisangahin solunda; durum yazisinin (ust) ve can cubugunun (alt) bandinda degil.
    const pips = marks.calls.filter(([name, x]) => name === "fillRect" && x < 100 - half);
    assert.equal(pips.length, stacks, `${stacks} yiginda ${pips.length} kertik`);
    for (const [, , y, w, h] of pips) {
      assert.ok(w >= signatures.MARK_PIP_SIZE && h >= signatures.MARK_PIP_SIZE, `kertik ${w}x${h}`);
      assert.ok(y >= 100 - half && y + h <= 100 + half, "kertik nisangahin dikey araliginda kalmali");
    }
    const ys = pips.map(([, , y]) => y).sort((a, b) => a - b);
    for (let index = 1; index < ys.length; index += 1) {
      assert.ok(ys[index] - ys[index - 1] - signatures.MARK_PIP_SIZE >= signatures.MARK_PIP_GAP, "kertik araligi en az 2 birim");
    }
    // Son basamak (VFX_LOD_MAX): tek dikdortgenlik serit, boyu yigini soyluyor.
    lod.force(4);
    const shed = createRecorder();
    new signatures.AtakanSignatureVfx(createRecorder(), createRecorder(), createRecorder(), shed, { lod, reducedMotion: () => true })
      .render({ towers: [], enemies: [{ id: "e1", x: 100, y: 100, trackingStacks: stacks }], now: 500, scale: 1, cellSize: 34, enemySize: () => GRUNT });
    const strip = shed.calls.filter(([name]) => name === "fillRect");
    assert.equal(strip.length, 1);
    assert.equal(strip[0][4], stacks * signatures.MARK_PIP_SIZE + (stacks - 1) * signatures.MARK_PIP_GAP);
  }
  assert.ok(extents[0] > extents[1] && extents[1] > extents[2], `nisangah daralmali: ${extents.join(" / ")}`);
  // Isaretsiz dusmanda hicbir sey yok.
  lod.force(0);
  const empty = createRecorder();
  new signatures.AtakanSignatureVfx(createRecorder(), createRecorder(), createRecorder(), empty, { lod }).render({ towers: [], enemies: [{ id: "e2", x: 0, y: 0 }], now: 0, scale: 1, cellSize: 34 });
  assert.equal(empty.calls.filter(([name]) => name !== "clear").length, 0);
});

test("Takipçi nişangâhı: ağırlık ve sıcaklık işaretleyen kulenin kademesinden, yığın yalnızca darlık", () => {
  const lod = new VfxLod();
  lod.force(0);
  const ramp = profiles.getVfxProfile("warrior-1").ramp;
  const towers = [
    { id: "t-l1", definitionId: "warrior-1", x: 0, y: 0, level: 2, ownerId: "me" },
    { id: "t-l10", definitionId: "warrior-1", x: 0, y: 0, level: 10, ownerId: "me" },
    { id: "t-mate", definitionId: "warrior-1", x: 0, y: 0, level: 10, ownerId: "mate" }
  ];
  const draw = (k, stacks) => {
    const marks = createRecorder();
    const glow = createRecorder();
    new signatures.AtakanSignatureVfx(createRecorder(), createRecorder(), glow, marks, { lod, reducedMotion: () => true })
      .render({ towers, enemies: [{ id: "e", x: 50, y: 50, trackingStacks: stacks, k }], now: 0, scale: 1, cellSize: 34, enemySize: () => 34, isOwn: (tower) => tower.ownerId === "me" });
    return { marks, glow, colors: new Set([...lineColors(marks), ...lineColors(glow)]) };
  };
  // Sv 10 Takipci'nin isareti Debug Lazer'in tukettigi tek yiginda bile kademe 3 renginde.
  assert.ok(draw("t-l10", 1).colors.has(ramp[2]));
  assert.ok(!draw("t-l10", 1).colors.has(ramp[0]));
  // Kaynak bilinmiyor: ham kademe, notr ilk durak; 3 yigin rengi degistirmiyor.
  assert.ok(draw(undefined, 3).colors.has(ramp[0]));
  assert.ok(draw("t-l1", 3).colors.has(ramp[0]));
  // Kademe 3'un beyaz-sicak cekirdek cizgisi takim arkadasinin isaretinde %70.
  const core = (k) => draw(k, 3).marks.calls.filter(([name, , color]) => name === "lineStyle" && color !== ramp[2]).map(([, , , alpha]) => alpha);
  assert.ok(core("t-l10").length > 0, "kademe 3 cekirdek cizgisi");
  assert.ok(Math.abs(Math.min(...core("t-mate")) / Math.min(...core("t-l10")) - 0.7) < 1e-6, "arkadasin cekirdegi %70");
  // Kademe ayraclarin kalinligini artiriyor.
  const width = (k) => Math.max(...draw(k, 1).marks.calls.filter(([name]) => name === "lineStyle").map(([, value]) => value));
  assert.ok(width("t-l10") > width("t-l1"), "kademe 3 ayraci daha kalin");
});

test("Takipçi nişangâhı LOD'da gerçekten azalıyor: 2'de çekirdek çizgisi, en son yalnızca ayraç ve şerit; kertikler izden önce sıkışmıyor", () => {
  const lod = new VfxLod();
  const towers = [{ id: "t", definitionId: "warrior-1", x: 0, y: 0, level: 10 }];
  const enemies = Array.from({ length: 60 }, (_, index) => ({ id: `e${index}`, x: (index % 10) * 40, y: Math.floor(index / 10) * 40, trackingStacks: 3, k: "t" }));
  const cost = (level) => {
    lod.force(level);
    const surfaces = [createCountingGraphics(), createCountingGraphics(), createCountingGraphics(), createCountingGraphics()];
    new signatures.AtakanSignatureVfx(...surfaces, { lod }).render({ towers, enemies, now: 300, scale: 1, cellSize: 34, enemySize: () => 34 });
    return surfaces.reduce((sum, surface) => ({ calls: sum.calls + surface.stats.calls, vertices: sum.vertices + surface.stats.vertices }), { calls: 0, vertices: 0 });
  };
  const full = cost(0);
  const mid = cost(2);
  const decals = cost(3);
  const shed = cost(4);
  // Yuzeylerin karedeki temizligi (4 `clear`) dusman basina degil.
  const perEnemy = (entry) => (entry.calls - 4) / enemies.length;
  assert.ok(mid.calls < full.calls * 0.7, `LOD 2 cagrilar ${mid.calls} / ${full.calls}`);
  // Bilgi isareti en son sikisiyor: yer izi basamaginda kertikler hala ayri.
  assert.equal(decals.calls, mid.calls, "LOD 3 isareti degistirmemeli");
  // Son basamak: dusman basina 8 kose cizgisi + bir stil ve tek serit (11 cagri; tam hali 22).
  assert.ok(perEnemy(full) >= 20, `tam nisangah ${perEnemy(full)} cagri`);
  assert.ok(perEnemy(shed) <= 11, `LOD 4 nisangah ${perEnemy(shed)} cagri`);
  assert.ok(shed.vertices / enemies.length <= 54, `LOD 4 kose ${shed.vertices / enemies.length}`);
});

test("Obsesyon ipi yığınla kalınlaşıyor, hedef değişince kopup sıfırdan başlıyor", () => {
  const lod = new VfxLod();
  lod.force(0);
  const tower = (o, t, level = 1) => ({ id: "t4", definitionId: "warrior-4", x: 0, y: 0, level, o, t });
  const enemies = [{ id: "e1", x: 80, y: 0 }, { id: "e2", x: 0, y: 90 }];
  const bodyWidth = (stack) => {
    const links = createRecorder();
    const vfx = new signatures.AtakanSignatureVfx(createRecorder(), links, createRecorder(), createRecorder(), { lod, reducedMotion: () => true });
    vfx.render({ towers: [tower(stack, "e1")], enemies, now: 100, scale: 1, cellSize: 28 });
    return links.calls.find(([name]) => name === "lineStyle")[1];
  };
  assert.ok(bodyWidth(2) < bodyWidth(6) && bodyWidth(6) < bodyWidth(10), `ip kalinligi ${[2, 6, 10].map(bodyWidth).join(" / ")}`);
  assert.ok(signatures.getTetherWidth(10, 1) > signatures.getTetherWidth(1, 1));

  // Hedef degisimi: onceki ip kopuyor (iki yari), yeni ip ince basliyor.
  const links = createRecorder();
  const vfx = new signatures.AtakanSignatureVfx(createRecorder(), links, createRecorder(), createRecorder(), { lod });
  vfx.render({ towers: [tower(8, "e1")], enemies, now: 1000, scale: 1, cellSize: 28 });
  assert.equal(vfx.liveTethers, 1);
  links.calls.length = 0;
  vfx.render({ towers: [tower(undefined, undefined)], enemies, now: 1060, scale: 1, cellSize: 28 });
  const snapLines = links.calls.filter(([name]) => name === "lineBetween");
  assert.equal(snapLines.length, 2, "kopan ip iki yari olarak cizilmeli");
  // Yarilar geri cekiliyor: ikisi de eski ipin (80 birim) yarisindan kisa.
  for (const [, x1, y1, x2, y2] of snapLines) assert.ok(Math.hypot(x2 - x1, y2 - y1) < 40);
  vfx.render({ towers: [tower(undefined, undefined)], enemies, now: 1060 + signatures.TETHER_SNAP_MS + 1, scale: 1, cellSize: 28 });
  assert.equal(vfx.liveTethers, 0, "kopma bitince kayit havuza donmeli");
  links.calls.length = 0;
  vfx.render({ towers: [tower(1, "e2")], enemies, now: 1500, scale: 1, cellSize: 28 });
  const fresh = links.calls.find(([name]) => name === "lineStyle");
  assert.ok(fresh[1] < bodyWidth(8), "yeni hedefte ip ince baslamali");
  const toNewTarget = links.calls.find(([name, , , x2, y2]) => name === "lineBetween" && x2 === 0 && y2 === 90);
  assert.ok(toNewTarget, "ip yeni hedefe gitmeli");
});

test("Ucube göstergesi tavan kadar dilim, yığın kadar yanık dilim çiziyor", () => {
  const lod = new VfxLod();
  lod.force(3);
  for (const [u, m] of [[4, undefined], [9, 15], [20, 20]]) {
    const marks = createRecorder();
    const vfx = new signatures.AtakanSignatureVfx(createRecorder(), createRecorder(), createRecorder(), marks, { lod, reducedMotion: () => true });
    vfx.render({ towers: [{ id: "u1", definitionId: "warrior-6", x: 0, y: 0, level: 1, u, m }], enemies: [], now: 0, scale: 1, cellSize: 28 });
    // Tavan kertigi (tepede, dikey) dilim degil.
    const segments = marks.calls.filter(([name, x1, , x2]) => name === "lineBetween" && !(x1 === 0 && x2 === 0)).length;
    assert.equal(segments, m ?? 10, `tavan ${m ?? 10}, dilim ${segments}`);
    let litAlpha = 0;
    let lit = 0;
    for (const call of marks.calls) {
      if (call[0] === "lineStyle") litAlpha = call[3];
      else if (call[0] === "lineBetween" && litAlpha > 0.9) lit += 1;
    }
    assert.equal(lit, u, `yigin ${u}`);
  }
});

test("Ucube zinciri tek ton ailesinde ve zamanla yeniden tohumlanıyor; hareket azaltmada sabit", () => {
  const chain = { id: "chain-p9-3", definitionId: "warrior-6", x1: 0, y1: 0, x2: 60, y2: 20, width: 5, color: 0xadf765, ttlMs: 150 };
  const pathAt = (now, reducedMotion = false) => {
    const recorder = createRecorder();
    new BeamRenderer(recorder).render([chain], { now, sceneNow: now, scale: 1, reducedMotion });
    return { recorder, points: recorder.calls.filter(([name]) => name === "lineTo").map(([, x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ") };
  };
  assert.notEqual(pathAt(0).points, pathAt(130).points, "zincir yeniden tohumlanmali");
  assert.equal(pathAt(0, true).points, pathAt(130, true).points, "hareket azaltmada zincir sabit");
  for (const tier of [undefined, 2, 3]) {
    const recorder = createRecorder();
    new BeamRenderer(recorder).render([{ ...chain, tier }], { now: 40, sceneNow: 40, scale: 1 });
    const colors = new Set([...lineColors(recorder), ...fillColors(recorder)]);
    for (const old of [0x93c5fd, 0x67e8f9, 0x38bdf8]) assert.ok(!colors.has(old), `kademe ${tier ?? 1}: eski gok mavisi ${old.toString(16)}`);
  }
});

test("İzolasyon: yalnızken kapatma alanı ve mühürlü kare, komşu varken ihlal işareti", () => {
  const lod = new VfxLod();
  lod.force(0);
  const draw = (auraActive, level, neighbour) => {
    const ground = createRecorder();
    const marks = createRecorder();
    const vfx = new signatures.AtakanSignatureVfx(ground, createRecorder(), createRecorder(), marks, { lod, reducedMotion: () => true });
    const towers = [{ id: "i1", definitionId: "warrior-3", x: 100, y: 100, level, range: 60, auraActive }];
    if (neighbour) towers.push({ id: "n1", definitionId: "warrior-1", x: 128, y: 100, level: 1 });
    vfx.render({ towers, enemies: [], now: 0, scale: 1, cellSize: 28 });
    return { ground, marks };
  };
  const raw = draw(true, 1);
  const compiled = draw(true, 5);
  assert.ok(raw.ground.calls.some(([name]) => name === "strokePath"), "alanin siniri cizilmeli");
  // Terminal yesili dugum yok; kademe siniri kalinlastiriyor.
  assert.ok(!fillColors(compiled.ground).has(ACCENT) && !lineColors(compiled.ground).has(ACCENT));
  const boundary = (drawn) => Math.max(...drawn.ground.calls.filter(([name]) => name === "lineStyle").map(([, width]) => width));
  assert.ok(boundary(compiled) > boundary(raw), "kademe 2 siniri daha kalin");
  // Muhurlu kare yalnizken; komsu varken alan yok, kehribar ihlal var.
  const breached = draw(false, 5, true);
  assert.equal(breached.ground.calls.filter(([name]) => name !== "clear").length, 0, "komsu varken alan cizilmemeli");
  assert.ok(lineColors(breached.marks).has(0xf59e0b), "komsuya ihlal isareti");
  assert.ok(!lineColors(compiled.marks).has(0xf59e0b), "yalnizken ihlal yok");
});

test("güdümlü atışın namlusu: gelen snapshot'taki kendi kulesinden, yalnızca güdümlü profilde", async () => {
  const { findHomingMuzzleOrigin } = await importWebModule("apps/web/src/vfx/attack-vfx.ts");
  const shot = { id: "p1", source: "tower", definitionId: "warrior-3", x: 112, y: 100 };
  // Yeni (gelen) snapshot: kule Refactor ile (100, 100)'e tasindi; eski yeri (300, 300).
  const fresh = [
    { id: "i1", definitionId: "warrior-3", x: 100, y: 100 },
    { id: "i2", definitionId: "warrior-3", x: 180, y: 100 },
    { id: "x1", definitionId: "warrior-1", x: 110, y: 100 }
  ];
  const stale = [{ id: "i1", definitionId: "warrior-3", x: 300, y: 300 }];
  assert.equal(findHomingMuzzleOrigin(shot, fresh, 68), fresh[0], "en yakin ayni tanimli kule");
  assert.equal(findHomingMuzzleOrigin(shot, stale, 68), undefined, "eski konumdaki kule namlu vermemeli");
  // Kulesinden uzakta ilk kez gorulen mermi (yeniden baglanma): namlu yok.
  assert.equal(findHomingMuzzleOrigin({ ...shot, x: 400 }, fresh, 68), undefined);
  // Gudumlu olmayan profil (Melis, Takipci) ve dusman mermisi: dokunulmuyor.
  assert.equal(findHomingMuzzleOrigin({ ...shot, definitionId: "warrior-1" }, fresh, 68), undefined);
  assert.equal(findHomingMuzzleOrigin({ ...shot, definitionId: "archer-1" }, fresh, 68), undefined);
  assert.equal(findHomingMuzzleOrigin({ ...shot, source: "enemy" }, fresh, 68), undefined);
});

test("Obsesyon ipi hedef ölünce kopuyor; kule kaldırılınca iz bırakmadan bırakılıyor", () => {
  const lod = new VfxLod();
  lod.force(0);
  const tower = { id: "t4", definitionId: "warrior-4", x: 0, y: 0, level: 5, o: 7, t: "e1" };
  const alive = [{ id: "e1", x: 80, y: 0 }];
  const links = createRecorder();
  const vfx = new signatures.AtakanSignatureVfx(createRecorder(), links, createRecorder(), createRecorder(), { lod });
  vfx.render({ towers: [tower], enemies: alive, now: 1000, scale: 1, cellSize: 34 });
  // Hedef oldu: sunucu yigini henuz sifirlamadi (o, t duruyor) ama dusman listede yok.
  links.calls.length = 0;
  vfx.render({ towers: [tower], enemies: [], now: 1060, scale: 1, cellSize: 34 });
  assert.equal(links.calls.filter(([name]) => name === "lineBetween").length, 2, "olen hedefte ip iki yari olarak kopmali");
  vfx.render({ towers: [tower], enemies: [], now: 1060 + signatures.TETHER_SNAP_MS + 1, scale: 1, cellSize: 34 });
  assert.equal(vfx.liveTethers, 0);

  // Kule kaldirildi (satildi, yikildi): ip ve kaydi hemen gidiyor, kopma cizilmiyor.
  vfx.render({ towers: [tower], enemies: alive, now: 2000, scale: 1, cellSize: 34 });
  assert.equal(vfx.liveTethers, 1);
  links.calls.length = 0;
  vfx.render({ towers: [], enemies: alive, now: 2016, scale: 1, cellSize: 34 });
  assert.equal(vfx.liveTethers, 0, "kaldirilan kulenin kaydi havuza donmeli");
  assert.equal(links.calls.filter(([name]) => name !== "clear").length, 0, "kaldirilan kulenin ipi cizilmemeli");
});

test("İzolasyon ihlal işareti sunucunun kuralıyla aynı: kenar ve 2x2 yapı yanlış ihlal vermiyor", async () => {
  const shared = await import("../packages/shared/dist/index.js");
  const map = shared.createDefaultEditableMap();
  const size = shared.getMapGridSize(map);
  const cell = (col, row) => shared.gridToWorld(col, row, map);
  const center = cell(5, 5);
  const towers = [
    { id: "iso", definitionId: "warrior-3", ...center, level: 5, auraActive: false },
    // Gercek komsu: kosegendeki kare.
    { id: "near", definitionId: "warrior-1", ...cell(6, 6), level: 1 },
    // 2x2 yapi: merkezi kare kosesinde, bir kare otede (merkez mesafesi 1.5 kare).
    { id: "big", definitionId: "zeynep-7", x: center.x + size * 1.5, y: center.y + size * 1.5, level: 1 },
    // Kenar yapisi: dikey kenarda, bir kare otede (merkez mesafesi 1.5 kare).
    { id: "edge", definitionId: "zeynep-8", x: center.x + size * 1.5, y: center.y, level: 1 },
    // Duvar sayilmiyor.
    { id: "wall", definitionId: "wall-1", ...cell(4, 5), level: 1 }
  ];
  const definitions = new Map(Object.values(shared.towerCatalog).flat().map((definition) => [definition.id, definition]));
  const expected = shared.findIsolationBlockers(towers[0], towers.map((tower) => ({ ...tower, definition: definitions.get(tower.definitionId) })), map).map((entry) => entry.id);
  assert.deepEqual(expected, ["near"], "sunucunun kurali: yalnizca kosegendeki kule");

  const marks = createRecorder();
  const vfx = new signatures.AtakanSignatureVfx(createRecorder(), createRecorder(), createRecorder(), marks, { lod: new VfxLod(), reducedMotion: () => true });
  vfx.render({ towers, enemies: [], now: 0, scale: 1, cellSize: size, map });
  const breaches = marks.calls.filter(([name, , color]) => name === "lineStyle" && color === 0xf59e0b).length;
  assert.equal(breaches, expected.length, "istemcinin ihlal isareti sunucunun komsu listesiyle ayni");
  const crossAt = marks.calls.filter(([name, x1]) => name === "lineBetween" && Math.abs(x1 - (cell(6, 6).x - 2.4)) < 0.01);
  assert.ok(crossAt.length >= 1, "ihlal carpisi gercek komsunun uzerinde");
});

test("galeri senaryosu yığın alanlarını besliyor: Obsesyon yükseliyor, Ucube tavana çıkıyor, Takipçi işaretliyor", () => {
  const towers = [
    { id: "g-warrior-1-10", definitionId: "warrior-1", level: 10, x: 20, y: 50, color: 0x22c55e, own: true, walker: 0, intervalMs: 720 },
    { id: "g-warrior-4-5", definitionId: "warrior-4", level: 5, x: 20, y: 150, color: 0x22c55e, own: true, walker: 1, intervalMs: 760 },
    { id: "g-warrior-6-10", definitionId: "warrior-6", level: 10, x: 20, y: 250, color: 0x22c55e, own: true, walker: 2, intervalMs: 940 },
    { id: "g-warrior-3-1", definitionId: "warrior-3", level: 1, x: 20, y: 350, color: 0x22c55e, own: true, walker: 3, intervalMs: 620, displayRange: 34, anchor: { x: 42, y: 350 } }
  ];
  const walkers = [0, 1, 2, 3].map((index) => ({ id: `w${index}`, cx: 100, cy: 50 + index * 100, rx: 20, ry: 10, periodMs: 3400, phase: 0 }));
  const scenario = new VfxScenario(towers, walkers);
  const stacks = [];
  const gauge = [];
  let marked = 0;
  const isolation = new Set();
  for (let now = 0; now <= 12000; now += 100) {
    const frame = scenario.frame(now, now - 100);
    const obsession = frame.signatureTowers.find((tower) => tower.id === "g-warrior-4-5");
    stacks.push(obsession.o ?? 0);
    if (obsession.o) assert.equal(obsession.t, "w1");
    const ucube = frame.signatureTowers.find((tower) => tower.id === "g-warrior-6-10");
    gauge.push(ucube.u ?? 0);
    assert.equal(ucube.m, 20);
    if ((frame.signatureEnemies[0].trackingStacks ?? 0) === 3) marked += 1;
    isolation.add(frame.signatureTowers.find((tower) => tower.id === "g-warrior-3-1").auraActive);
  }
  assert.equal(Math.max(...stacks), 10, "Obsesyon yigini tavana cikmali");
  assert.ok(stacks.some((value, index) => index > 0 && value < stacks[index - 1]), "hedef degisimiyle sifirlanmali");
  assert.equal(Math.max(...gauge), 20, "Ucube sv 10 tavani 20");
  assert.ok(marked > 0, "Takipci sv 10 yuruyucuyu uc yiginla isaretlemeli");
  assert.deepEqual([...isolation].sort(), [false, true], "Izolasyon yalniz ve komsulu evreler");
});

/* ------------------------------------------------------------------ */
/* Zeynep imzalari: kenar tonu, beyaz-sicak cekirdek, islevsel isaret    */
/* ------------------------------------------------------------------ */

const zeynep = await importWebModule("apps/web/src/vfx/zeynep-signatures.ts");
const GOLD = 0xf59e0b;
const WHITE_GOLD = 0xfde68a;
const ZEYNEP_SIGNED = ["zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6", "zeynep-8"];
const allColors = (...recorders) => new Set(recorders.flatMap((recorder) => recorder.calls
  .filter(([name]) => name === "lineStyle" || name === "fillStyle")
  .map(([name, a, b]) => (name === "lineStyle" ? b : a))));
const maxWidth = (...recorders) => Math.max(...recorders.flatMap((recorder) => recorder.calls.filter(([name]) => name === "lineStyle").map(([, width]) => width)));

test("Zeynep imzaları mekaniği taşıyor; ferman/nişan/regalya süsleri yok", () => {
  const mechanics = new Set();
  for (const id of ZEYNEP_SIGNED) {
    const profile = profiles.getVfxProfile(id);
    assert.equal(profile.signature, undefined, `${id} Atakan imzasi almamali`);
    assert.ok(profile.court, `${id} imzasi yok`);
    mechanics.add(profile.court.mechanic);
    assert.deepEqual(Object.keys(profile.court), ["mechanic"], `${id} imzasi sus tasiyor`);
  }
  assert.equal(mechanics.size, ZEYNEP_SIGNED.length, "her kulenin kendi mekanik imzasi olmali");
  // Abarti saldiri sayilmiyor ama imzasi var.
  assert.ok(!attacking.some((tower) => tower.id === "zeynep-8"));
});

test("Zeynep mızrağı: gövde kipin tonunda, altın yok; kademe ağırlıkla ve sıcaklıkla", () => {
  const lod = new VfxLod();
  lod.force(0);
  const colors = zeynep.ZEYNEP_MEMBER_COLORS;
  const draw = (definitionId, tier) => {
    const body = createRecorder();
    const glow = createRecorder();
    const vfx = new AttackVfx(body, glow, createRecorder(), undefined, { lod });
    for (let frame = 0; frame < 6; frame += 1) {
      vfx.renderProjectiles([{ id: "p1", kind: "tower", source: "tower", definitionId, x: 100 + frame * 4, y: 200, vx: 240, vy: 0, tier: tier === 1 ? undefined : tier }], 1000 + frame * 16, 1);
    }
    return { body, glow, colors: allColors(body, glow), width: maxWidth(body) };
  };
  for (const [definitionId, bodyColor] of [["zeynep-1", colors.hiza], ["zeynep-3", colors.taht], ["zeynep-3-kin-projectile", colors.kin], [zeynep.TAHT_COPY_ID, colors.hiza]]) {
    const [t1, t2, t3] = [1, 2, 3].map((tier) => draw(definitionId, tier));
    for (const drawn of [t1, t2, t3]) {
      assert.ok(drawn.colors.has(bodyColor), `${definitionId} govdesi kipin tonunda olmali`);
      assert.ok(!drawn.colors.has(GOLD) && !drawn.colors.has(WHITE_GOLD), `${definitionId}: altin rutbe`);
    }
    assert.ok(t1.width < t2.width && t2.width < t3.width, `${definitionId} govde agirlasmiyor ${t1.width} / ${t2.width} / ${t3.width}`);
  }
  // Taht'in kertikleri: uyelerin tonunda uc isaret; Hiza'da yok.
  const sigil = (definitionId) => draw(definitionId, 1).body.calls.filter(([name]) => name === "fillStyle").map(([, color]) => color);
  assert.ok(sigil("zeynep-3-kin-projectile").includes(colors.kin) && sigil("zeynep-3-kin-projectile").includes(colors.hiza), "Kin kipi: Hiza ve Kin isaretleri");
  assert.ok(!sigil("zeynep-1").includes(colors.taht), "Hiza'nin dizilim isareti olmamali");
  assert.deepEqual(zeynep.getLanceSigil("copy"), [colors.taht, colors.taht, colors.hiza], "kopya: iki Taht ve Hiza");
});

test("Zeynep olay imzaları: altın yok, kademe ağırlıkla; LOD sırayla döküyor, renk hiç", () => {
  const enemies = [{ id: "e1", x: 100, y: 100 }, { id: "e2", x: 140, y: 100 }];
  const inputs = [
    { kind: "spotlight", key: "e1", x: 100, y: 100, color: 0xf9a8d4 },
    { kind: "brand", key: "e2", x: 140, y: 100, color: 0x7f1d1d, durationMs: 1200, strength: 3 },
    { kind: "crossing", x: 60, y: 100, vertical: true, railHalf: 34, color: 0x7c3aed },
    { kind: "formation", key: "t3", x: 20, y: 20, members: [{ x: 20, y: -14, definitionId: "zeynep-1" }, { x: 54, y: -14, definitionId: "zeynep-2" }] },
    { kind: "bounce", key: "r1@0,0", x: 30, y: 200, angle: Math.PI / 2, color: 0xe879f9 }
  ];
  const draw = (tier, level = 0, at = 160) => {
    const lod = new VfxLod();
    lod.force(level);
    const surfaces = [createRecorder(), createRecorder(), createRecorder(), createRecorder()];
    const vfx = new zeynep.ZeynepSignatureVfx(...surfaces, { lod });
    for (const input of inputs) vfx.emit({ ...input, tier }, 0);
    vfx.emit({ kind: "pierce", key: "p1", x: 100, y: 100, angle: 0, definitionId: "zeynep-1", tier }, 0);
    vfx.emit({ kind: "pierce", key: "p1", x: 140, y: 100, angle: 0, definitionId: "zeynep-1", tier }, 20);
    vfx.render({ enemies, now: at, scale: 1, enemySize: () => 34 });
    // Agirlik govde yuzeylerinde (ADD isisi sabit, LOD ilk onu dokuyor).
    return { colors: allColors(...surfaces), calls: surfaces.reduce((sum, surface) => sum + surface.calls.length, 0), width: maxWidth(surfaces[0], surfaces[1], surfaces[3]) };
  };
  const [t1, t2, t3] = [1, 2, 3].map((tier) => draw(tier));
  for (const drawn of [t1, t2, t3]) assert.ok(!drawn.colors.has(GOLD) && !drawn.colors.has(WHITE_GOLD), "altin rutbe trimi yok");
  assert.ok(t1.width < t2.width && t2.width < t3.width, `kademe agirlasmiyor ${t1.width} / ${t2.width} / ${t3.width}`);
  // Uyelerin tonlari kademe 3'te de cizili.
  for (const color of [zeynep.ZEYNEP_MEMBER_COLORS.hiza, zeynep.ZEYNEP_MEMBER_COLORS.gosteri]) assert.ok(t3.colors.has(color), `uye tonu ${color.toString(16)} kayboldu`);
  // LOD: once ADD isi, sonra yer golgesi ve kertikler; renk hic.
  const costs = [0, 1, 2, 3].map((level) => draw(3, level).calls);
  assert.ok(costs[0] >= costs[1] && costs[1] >= costs[2] && costs[2] >= costs[3] && costs[0] > costs[3], `LOD ${costs.join(" / ")}`);
  assert.ok(draw(3, 3).colors.has(zeynep.ZEYNEP_MEMBER_COLORS.hiza), "LOD 3'te de kenar tonu");
});
