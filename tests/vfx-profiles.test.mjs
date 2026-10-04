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
const { BeamInterpolator } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");

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
