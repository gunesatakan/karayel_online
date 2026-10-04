/**
 * Kademe dili: her saldiran kulenin profili var ve uc kademesi gercekten farkli.
 *
 * c59c79b alti kuleyi sessizce kademe halkalarindan dusurdu ve hicbir test
 * bunu gormedi: testler yalnizca kademenin tele ciktigini sayiyordu, ekranda
 * neyin cizildigini degil. Buradaki testler:
 *
 * - Katalogdaki her saldiran kulenin kayitli bir profili var (turetilmis yedek
 *   degil), uc kademesi renkte ve en az bir ozellik bayraginda ayrisiyor.
 * - Rampa kulenin kendi renginden: varsayilan yesil yok, ucuncu durak tumuyle
 *   beyaz degil, Omer'in kademe 2'si kulenin kendi sarisi degil.
 * - Profil cizicisi kademe yukseldikce gercekten daha fazla ciziyor ve kademe
 *   2+ omuzlarini ADD katmanina koyuyor.
 * - LOD once kivilcimi, sonra haleyi, en son iz uzunlugunu kesiyor.
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

const flags = (recipe) => JSON.stringify({
  shoulders: recipe.shoulders,
  trail: recipe.trail,
  muzzle: recipe.muzzle,
  impact: { ...recipe.impact, scale: undefined, durationMs: undefined },
  alive: recipe.alive
});

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

test("her profilin üç kademesi renkte ve en az bir özellikte ayrışır", () => {
  for (const tower of attacking) {
    const profile = profiles.getVfxProfile(tower.id);
    const [t1, t2, t3] = profile.tiers;
    assert.deepEqual([t1.tier, t2.tier, t3.tier], [1, 2, 3]);
    for (const [a, b, label] of [[t1, t2, "1-2"], [t2, t3, "2-3"], [t1, t3, "1-3"]]) {
      assert.ok(distance(a.color, b.color) > 40, `${tower.id} kademe ${label} rengi ayni gibi (${a.color.toString(16)} / ${b.color.toString(16)})`);
      assert.notEqual(flags(a), flags(b), `${tower.id} kademe ${label} ayni ozellikleri tasiyor`);
    }
    // Siluet kademeyle buyumuyor; varlik buyuyor.
    assert.equal(t1.silhouette, t3.silhouette, `${tower.id} siluet buyumemeli`);
    assert.ok(t1.silhouette >= 12 && t1.silhouette <= 16, `${tower.id} siluet ${t1.silhouette} (12-16)`);
  }
});

test("rampa kulenin kendi renginden: varsayılan yeşil yok, üst kademe tümüyle beyaz değil", () => {
  for (const tower of attacking) {
    const { ramp } = profiles.getVfxProfile(tower.id);
    assert.ok(!ramp.includes(0x86efac), `${tower.id} varsayilan yesili kullaniyor`);
    for (const legacy of [0x93c5fd, 0xfacc15, 0xfff1f2]) {
      // Eski genel kademe renkleri (celik, altin, beyaz) saldirida yok; Omer'in
      // sarisi kulenin kendi rengi olarak ilk durakta kalabilir.
      if (legacy === 0xfacc15 && ramp[0] === 0xfacc15) continue;
      assert.ok(!ramp.slice(1).includes(legacy), `${tower.id} eski genel kademe rengi ${legacy.toString(16)}`);
    }
    const [r, g, b] = channels(ramp[2]);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) >= 12, `${tower.id} kademe 3 tumuyle beyaz (${ramp[2].toString(16)})`);
  }
  // Omer'in kademe 2 altini eskiden tam olarak kulenin sarisiydi ve kayboluyordu.
  const tank = profiles.getVfxProfile("tank-1");
  assert.ok(distance(tank.ramp[1], 0xfacc15) > 40, "Omer kademe 2 kulenin govdesinde kayboluyor");
});

test("profil çizicisi kademe yükseldikçe daha fazla çiziyor, omuzlar ADD katmanında", () => {
  const lod = new VfxLod();
  lod.force(0);
  for (const tower of attacking) {
    const profile = profiles.getVfxProfile(tower.id);
    if (profile.silhouette === "none") continue;
    const counts = [];
    const glowCounts = [];
    for (const tier of [1, 2, 3]) {
      const body = createCountingGraphics();
      const glow = createCountingGraphics();
      const events = createCountingGraphics();
      const vfx = new AttackVfx(body, glow, events, undefined, { lod });
      // Birkac kare: izin noktalari dolsun.
      for (let frame = 0; frame < 6; frame += 1) {
        vfx.renderProjectiles([{ id: "p1", kind: "tower", source: "tower", definitionId: tower.id, x: 100 + frame * 4, y: 200, vx: 240, vy: 0, tier: tier === 1 ? undefined : tier }], 1000 + frame * 16, 1);
      }
      counts.push(body.stats.calls + glow.stats.calls);
      glowCounts.push(glow.stats.calls);
    }
    assert.ok(counts[1] > counts[0] && counts[2] > counts[1], `${tower.id} cagri sayilari ${counts.join(" / ")}`);
    assert.ok(glowCounts[1] > glowCounts[0], `${tower.id} kademe 2 omuzlari ADD katmanina gitmiyor`);
  }
});

test("çarpma: kademe 1 tek darbe, 2 ikinci vuruş, 3 imza ve iğne ucu", () => {
  const lod = new VfxLod();
  lod.force(0);
  for (const tower of attacking) {
    const calls = [];
    const flashes = [];
    for (const tier of [1, 2, 3]) {
      const events = createCountingGraphics();
      const flashLog = [];
      const vfx = new AttackVfx(createRecorder(), createRecorder(), events, { flash: (spec) => flashLog.push(spec) }, { lod });
      vfx.emitImpact({ x: 50, y: 50, angle: 0.3, definitionId: tower.id, tier, bornAt: 0, key: "c1" });
      // Ikinci vurus 80 ms sonra; 140 ms'deki kare hepsini gormeli.
      vfx.render(140, 1);
      calls.push(events.stats.calls);
      flashes.push(flashLog.length);
    }
    assert.ok(calls[1] > calls[0] && calls[2] > calls[1], `${tower.id} carpma cagrilari ${calls.join(" / ")}`);
    assert.ok(flashes[2] > flashes[0], `${tower.id} kademe 3 igne ucu yok`);
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

test("LOD önce kıvılcımı, sonra haleyi, en son iz uzunluğunu düşürüyor; renk hiç", () => {
  const lod = new VfxLod();
  let now = 0;
  const run = (vfxMs, frameMs, ms) => {
    for (let t = 0; t < ms; t += 16) {
      now += 16;
      lod.note(vfxMs, frameMs, now);
    }
  };
  run(1, 16, 1000);
  assert.deepEqual([lod.level, lod.sparks, lod.corona, lod.trailScale], [0, true, true, 1]);
  run(6, 16, 900);
  assert.equal(lod.level, 1);
  assert.deepEqual([lod.sparks, lod.corona, lod.trailScale], [false, true, 1]);
  run(6, 16, 600);
  assert.deepEqual([lod.level, lod.sparks, lod.corona, lod.trailScale], [2, false, false, 1]);
  run(6, 30, 600);
  assert.deepEqual([lod.level, lod.trailScale], [3, 0.5]);
  run(6, 30, 2000);
  assert.equal(lod.level, 3, "ust sinir 3");
  // Rahatlayinca yavas geri donuyor.
  run(0.5, 16, 1500);
  assert.equal(lod.level, 3, "bir buçuk saniyede donmemeli");
  run(0.5, 16, 7000);
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
  // sayan sahte Graphics). Eski cizim ayni sahnede ~34.6k kose ve ~24 earcut
  // uretiyordu (28 halkalik havuzun tween'li yaylari dahil).
  const { runVfxBench } = await import("../tools/vfx-bench.mjs");
  const full = await runVfxBench({ lodLevel: 0 });
  const shed = await runVfxBench({ lodLevel: 3 });
  assert.ok(full.verticesPerFrame < 20000, `kose ${full.verticesPerFrame}`);
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

test("Atakan imzalarının üç kademesi türde ayrışıyor; Debug Lazer'e dokunulmadı", () => {
  assert.equal(profiles.getVfxProfile("warrior-5").signature, undefined, "lazerin profili imza almamali");
  const mechanics = new Set();
  for (const id of ATAKAN_SIGNED) {
    const signature = profiles.getVfxProfile(id).signature;
    assert.ok(signature, `${id} imzasi yok`);
    mechanics.add(signature.mechanic);
    const [raw, compiled, overdrive] = signature.tiers;
    assert.deepEqual([raw.act, compiled.act, overdrive.act], ["raw", "compiled", "overdrive"]);
    // Ham: duz serit, aksan yok, cikartma yok.
    assert.equal(raw.trailMotif, "plain");
    assert.equal(raw.accent, false);
    assert.equal(raw.decal, "none");
    // Derlenmis: motifli iz, terminal yesili, izgara/altigen; asiri yukleme yok.
    assert.notEqual(compiled.trailMotif, "plain", `${id} derlenmis iz motifi yok`);
    assert.equal(compiled.accent, true);
    assert.notEqual(compiled.decal, "none");
    assert.deepEqual([compiled.whiteCore, compiled.glints, compiled.codeSparks], [false, false, false]);
    // Asiri yukleme: beyaz-sicak cekirdek, kosan parlama, kod kivilcimi.
    assert.deepEqual([overdrive.whiteCore, overdrive.glints, overdrive.codeSparks], [true, true, true]);
  }
  assert.equal(mechanics.size, ATAKAN_SIGNED.length, "her kulenin kendi mekanik imzasi olmali");
  // Ucube artik Sunucu'nun yeniden boyanmis simsegi degil.
  assert.notEqual(profiles.getVfxProfile("warrior-6").silhouette, profiles.getVfxProfile("warrior-2").silhouette);
  assert.notEqual(profiles.getVfxProfile("warrior-6").impact, profiles.getVfxProfile("warrior-2").impact);
});

test("Atakan imzası çizimde de türde ayrışıyor: yeşil aksan kademe 2'de, kod bitleri kademe 3'te", () => {
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
        accentLines: all.some(([name, , color]) => name === "lineStyle" && color === ACCENT),
        accentFills: all.some(([name, color]) => name === "fillStyle" && color === ACCENT),
        calls: all.length
      };
    });
    assert.equal(drawn[0].accentLines || drawn[0].accentFills, false, `${id} kademe 1 ham sinyal: aksan olmamali`);
    assert.ok(drawn[1].accentLines, `${id} kademe 2 derlenmis aksan cizmiyor`);
    assert.equal(drawn[1].accentFills, false, `${id} kademe 2 kod biti dokmemeli`);
    assert.ok(drawn[2].accentFills, `${id} kademe 3 kod kivilcimi yok`);
    assert.ok(drawn[0].calls < drawn[1].calls && drawn[1].calls < drawn[2].calls, `${id} cagrilar ${drawn.map((entry) => entry.calls).join(" / ")}`);
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
    // LOD 3: tek dikdortgenlik serit, boyu yigini soyluyor.
    lod.force(3);
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

test("Takipçi nişangâhı: renk ve perde işaretleyen kulenin kademesinden, yığın yalnızca darlık", () => {
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
  // Kademe 3 eklentileri (beyaz kose dugumleri) takim arkadasinin isaretinde %70.
  const nodeAlpha = (k) => draw(k, 3).marks.calls.filter(([name, color]) => name === "fillStyle" && color !== 0x22c55e).map(([, , alpha]) => alpha);
  assert.ok(Math.min(...nodeAlpha("t-mate")) < Math.min(...nodeAlpha("t-l10")), "arkadasin eklentileri soluk olmali");
});

test("Takipçi nişangâhı LOD'da gerçekten azalıyor: 2'de iç kertik ve düğüm, 3'te yalnızca ayraç ve şerit", () => {
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
  const shed = cost(3);
  assert.ok(mid.calls < full.calls * 0.7, `LOD 2 cagrilar ${mid.calls} / ${full.calls}`);
  assert.ok(shed.calls <= full.calls * 0.5, `LOD 3 cagrilar ${shed.calls} / ${full.calls}`);
  assert.ok(shed.vertices <= full.vertices * 0.6, `LOD 3 kose ${shed.vertices} / ${full.vertices}`);
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
    const segments = marks.calls.filter(([name]) => name === "lineBetween").length;
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
  // Derlenmis sinir altigen: alti kose dugumu terminal yesilinde.
  assert.ok(!fillColors(raw.ground).has(ACCENT));
  assert.ok(fillColors(compiled.ground).has(ACCENT), "kademe 2 altigen dugumleri");
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
/* Zeynep imzalari: ferman -> nisan -> regalya                          */
/* ------------------------------------------------------------------ */

const zeynep = await importWebModule("apps/web/src/vfx/zeynep-signatures.ts");
const GOLD = 0xf59e0b;
const WHITE_GOLD = 0xfde68a;
const ZEYNEP_SIGNED = ["zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6", "zeynep-8"];
const allColors = (...recorders) => new Set(recorders.flatMap((recorder) => recorder.calls
  .filter(([name]) => name === "lineStyle" || name === "fillStyle")
  .map(([name, a, b]) => (name === "lineStyle" ? b : a))));

test("Zeynep imzalarının üç kademesi türde ayrışıyor: ferman, nişan, regalya", () => {
  const mechanics = new Set();
  for (const id of ZEYNEP_SIGNED) {
    const profile = profiles.getVfxProfile(id);
    assert.equal(profile.signature, undefined, `${id} Atakan imzasi (yesil aksan) almamali`);
    assert.ok(profile.court, `${id} saray imzasi yok`);
    mechanics.add(profile.court.mechanic);
    const [decree, insignia, regalia] = profile.court.tiers;
    assert.deepEqual([decree.act, insignia.act, regalia.act], ["decree", "insignia", "regalia"]);
    // Ferman: temiz bir mizrak / cizgi; nisan ve regalya bayraklarinin hicbiri yok.
    assert.deepEqual([decree.chevrons, decree.encore, decree.parade, decree.seal, decree.crown, decree.giltMotes, decree.snap], [false, false, false, false, false, false, false]);
    // Nisan: altin serit, ikinci perde, gecit toreni; regalya yok.
    assert.deepEqual([insignia.chevrons, insignia.encore, insignia.parade], [true, true, true]);
    assert.deepEqual([insignia.seal, insignia.crown, insignia.giltMotes, insignia.snap], [false, false, false, false]);
    // Regalya: muhur, tac, yaldiz, kapanan ferman.
    assert.deepEqual([regalia.seal, regalia.crown, regalia.giltMotes, regalia.snap], [true, true, true, true]);
    // Rutbe trimi: govdenin acigi -> altin -> beyaz altin (hicbiri tumuyle beyaz degil).
    assert.equal(insignia.trim, GOLD);
    assert.equal(regalia.trim, WHITE_GOLD);
    assert.ok(distance(decree.trim, insignia.trim) > 40 && distance(insignia.trim, regalia.trim) > 40);
  }
  assert.equal(mechanics.size, ZEYNEP_SIGNED.length, "her kulenin kendi mekanik imzasi olmali");
  // Abarti saldiri sayilmiyor ama imzasi var.
  assert.ok(!attacking.some((tower) => tower.id === "zeynep-8"));
});

test("Zeynep mızrağı çizimde türde ayrışıyor: gövde kipin renginde, altın kademe 2'de, beyaz altın 3'te", () => {
  const lod = new VfxLod();
  lod.force(0);
  const draw = (definitionId, tier) => {
    const body = createRecorder();
    const glow = createRecorder();
    const vfx = new AttackVfx(body, glow, createRecorder(), undefined, { lod });
    for (let frame = 0; frame < 6; frame += 1) {
      vfx.renderProjectiles([{ id: "p1", kind: "tower", source: "tower", definitionId, x: 100 + frame * 4, y: 200, vx: 240, vy: 0, tier: tier === 1 ? undefined : tier }], 1000 + frame * 16, 1);
    }
    return { body, glow, colors: allColors(body, glow), calls: body.calls.length + glow.calls.length };
  };
  for (const [definitionId, bodyColor] of [["zeynep-1", 0xec4899], ["zeynep-3", 0xe879f9], ["zeynep-3-kin-projectile", 0xdc2626], [zeynep.TAHT_COPY_ID, 0xec4899]]) {
    const [t1, t2, t3] = [1, 2, 3].map((tier) => draw(definitionId, tier));
    for (const drawn of [t1, t2, t3]) assert.ok(drawn.colors.has(bodyColor), `${definitionId} govdesi kipin renginde olmali`);
    assert.ok(!t1.colors.has(GOLD) && !t1.colors.has(WHITE_GOLD), `${definitionId} ferman: rutbe yok`);
    assert.ok(t2.colors.has(GOLD), `${definitionId} nisan: altin serit`);
    assert.ok(t3.colors.has(WHITE_GOLD), `${definitionId} regalya: beyaz altin`);
    assert.ok(t1.calls < t2.calls && t2.calls < t3.calls, `${definitionId} cagrilar ${t1.calls} / ${t2.calls} / ${t3.calls}`);
  }
  // Taht'in muhru: uyelerin renginde uc isaret; Hiza'da muhur yok.
  const sigil = (definitionId) => draw(definitionId, 1).body.calls.filter(([name]) => name === "fillStyle").map(([, color]) => color);
  assert.ok(sigil("zeynep-3-kin-projectile").includes(0xdc2626) && sigil("zeynep-3-kin-projectile").includes(0xec4899), "Kin kipi: Hiza ve Kin isaretleri");
  assert.ok(!sigil("zeynep-1").includes(0xe879f9), "Hiza'nin muhru olmamali");
  assert.deepEqual(zeynep.getLanceSigil("copy"), [0xe879f9, 0xe879f9, 0xec4899], "kopya: iki Taht ve Hiza");
  // Gecit toreni (hayalet kopyalar) LOD 2'de dusuyor; govde ve renk kaliyor.
  lod.force(2);
  const shed = draw("zeynep-1", 2);
  lod.force(0);
  assert.ok(shed.calls < draw("zeynep-1", 2).calls, "LOD 2 hayaletleri dusurmeli");
  assert.ok(shed.colors.has(0xec4899) && shed.colors.has(GOLD));
});

test("Zeynep olay imzaları çizimde türde ayrışıyor ve LOD sırayla döküyor", () => {
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
    return { colors: allColors(...surfaces), calls: surfaces.reduce((sum, surface) => sum + surface.calls.length, 0) };
  };
  const [t1, t2, t3] = [1, 2, 3].map((tier) => draw(tier));
  assert.ok(!t1.colors.has(GOLD) && !t1.colors.has(WHITE_GOLD), "ferman: rutbe trimi govdenin acigi");
  assert.ok(t2.colors.has(GOLD) && !t2.colors.has(WHITE_GOLD), "nisan: altin");
  assert.ok(t3.colors.has(WHITE_GOLD), "regalya: beyaz altin");
  assert.ok(t1.calls < t2.calls && t2.calls < t3.calls, `cagrilar ${t1.calls} / ${t2.calls} / ${t3.calls}`);
  // Kombo kimligi govdede: Gosteri pembesi (spot havuzu), Abarti menekse, dizilim
  // uyelerinin renkleri kademe 3'te de cizili; rutbe yalnizca trim.
  for (const color of [0xf9a8d4, 0x7c3aed, 0xec4899]) assert.ok(t3.colors.has(color), `govde rengi ${color.toString(16)} kademe 3'te kayboldu`);
  // LOD: once zerre, sonra ikinci perde, en son serit seridi; renk hic.
  const costs = [0, 1, 2, 3].map((level) => draw(3, level).calls);
  assert.ok(costs[0] > costs[1] && costs[1] > costs[2] && costs[2] >= costs[3], `LOD ${costs.join(" / ")}`);
  assert.ok(draw(3, 3).colors.has(WHITE_GOLD), "LOD 3'te de kademe rengi");
});
