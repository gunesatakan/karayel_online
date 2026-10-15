/**
 * Mac sonu sahnesi (apps/web/src/match-end-sequence.ts, vfx/match-end-vfx.ts,
 * vfx/match-end-stage.ts) ve GameScene baglantisi.
 *
 * Siralama (yenilgide nexus'tan disari, zaferde disaridan iceri), zamanlama
 * (sure ATLAS satirindan, aralik 80-450 ms, duvarlar toplu, nexus en son,
 * 0,8 sn bekleme), denetleyici (gecis, rapor tam bir kez, ATLAS satiri bir
 * kez, gec katilana sahne yok), ses yonetmeni, renk kurali (agir sert dil:
 * pastel ve doygun parlak yok) ve sahnenin kaynak duzeyindeki baglantilari.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const sequenceModule = await importWebModule("apps/web/src/match-end-sequence.ts");
const {
  ATLAS_FINAL_LINE_COUNT,
  ATLAS_FINAL_LINE_SECONDS,
  MATCH_END_SOUND_RULES,
  MATCH_END_TIMING,
  MatchEndSequence,
  MatchEndSoundGovernor,
  getAtlasFinalLineUrls,
  getAtlasLineSeconds,
  getMatchEndDurationMs,
  orderMatchEndStructures,
  planMatchEndSchedule,
  shouldPlayMatchEndSequence
} = sequenceModule;
const vfxModule = await importWebModule("apps/web/src/vfx/match-end-vfx.ts");
const { MatchEndVfx, MATCH_END_EVENT_CAP } = vfxModule;
const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");
const { AtlasVoice } = await importWebModule("apps/web/src/atlas-voice.ts");

const NEXUS = { x: 0, y: 0 };
const tower = (id, x, y, wall = false) => ({ id, x, y, size: 30, wall });
const ring = (count, { wall = false, prefix = "t" } = {}) =>
  Array.from({ length: count }, (_, index) => tower(`${prefix}${String(index).padStart(3, "0")}`, Math.cos(index) * (40 + index * 7), Math.sin(index) * (40 + index * 7), wall));

// --- Siralama -----------------------------------------------------------------

test("sıra: yenilgide nexus'tan dışarı, zaferde dışarıdan içeri; eşitlikte kimlik", () => {
  const structures = [tower("far", 300, 0), tower("near", 10, 0), tower("mid", 0, 120), tower("b-tie", 0, 50), tower("a-tie", 50, 0)];
  assert.deepEqual(orderMatchEndStructures("defeat", structures, NEXUS).map((s) => s.id), ["near", "a-tie", "b-tie", "mid", "far"]);
  assert.deepEqual(orderMatchEndStructures("victory", structures, NEXUS).map((s) => s.id), ["far", "mid", "a-tie", "b-tie", "near"]);
  // Girdi degismiyor; gecersiz konum dusuyor.
  assert.equal(structures[0].id, "far");
  assert.equal(orderMatchEndStructures("defeat", [tower("nan", Number.NaN, 0)], NEXUS).length, 0);
});

// --- Zamanlama ----------------------------------------------------------------

test("süre: ATLAS satırından (sınırlı), satır yoksa ~5 sn", () => {
  assert.equal(getMatchEndDurationMs(undefined), 5000);
  assert.equal(getMatchEndDurationMs(Number.NaN), 5000);
  assert.equal(getMatchEndDurationMs(0), 5000);
  assert.equal(getMatchEndDurationMs(6.746), 6746);
  assert.equal(getMatchEndDurationMs(2), MATCH_END_TIMING.minDurationMs);
  assert.equal(getMatchEndDurationMs(10.508), MATCH_END_TIMING.maxDurationMs);
  assert.equal(getAtlasLineSeconds("audio/atlas/death/death-01.mp3"), 6.746);
  assert.equal(getAtlasLineSeconds("audio/atlas/welcome/welcome-01.mp3"), undefined);
  assert.equal(getAtlasLineSeconds(undefined), undefined);
});

test("süre tablosu manifestle aynı (ölüm ve son satırları)", () => {
  const manifest = JSON.parse(read("apps/web/public/audio/atlas/manifest.json"));
  const finals = manifest.files.filter((file) => file.category === "death" || file.category === "ending");
  assert.equal(finals.length, ATLAS_FINAL_LINE_COUNT);
  assert.deepEqual(Object.keys(ATLAS_FINAL_LINE_SECONDS).sort(), getAtlasFinalLineUrls().sort());
  for (const file of finals) assert.equal(ATLAS_FINAL_LINE_SECONDS[file.url], file.duration, file.url);
});

test("zamanlama: aralık 80-450 ms, nexus en son, rapor 0,8 sn sonra", () => {
  for (const kind of ["defeat", "victory"]) {
    for (const count of [0, 1, 3, 12, 40, 120]) {
      for (const durationMs of [5000, 6746, 9000]) {
        const plan = planMatchEndSchedule({ kind, structures: ring(count), nexus: NEXUS, durationMs });
        const structureSteps = plan.steps.slice(0, -1);
        const last = plan.steps[plan.steps.length - 1];
        assert.equal(last.role, "nexus", `${kind} ${count}`);
        assert.equal(plan.steps.filter((step) => step.role === "nexus").length, 1);
        assert.equal(structureSteps.length, count);
        assert.equal(last.atMs, plan.climaxMs);
        assert.equal(plan.reportAtMs, plan.climaxMs + 800);
        for (let index = 1; index < structureSteps.length; index += 1) {
          const gap = structureSteps[index].atMs - structureSteps[index - 1].atMs;
          assert.ok(gap >= MATCH_END_TIMING.minGapMs - 1 && gap <= MATCH_END_TIMING.maxGapMs + 1, `${kind} ${count} aralik ${gap}`);
        }
        if (structureSteps.length > 0) assert.ok(last.atMs - structureSteps[structureSteps.length - 1].atMs >= MATCH_END_TIMING.nexusLeadMs - 1);
        if (kind === "defeat") assert.ok(plan.climaxMs >= durationMs * 0.6 - 1, "nexus satirin en az %60'inda");
        else assert.ok(plan.climaxMs >= durationMs, "isin satirin sonunda tepe yapiyor");
      }
    }
  }
});

test("zamanlama: çok kule satıra yayılıyor, az kule sürünmüyor", () => {
  const many = planMatchEndSchedule({ kind: "defeat", structures: ring(14), nexus: NEXUS, durationMs: 6746 });
  assert.ok(many.gapMs >= 80 && many.gapMs <= 450);
  assert.ok(many.climaxMs >= 6000 && many.climaxMs <= 6746 + 1, `nexus satirin sonunda: ${many.climaxMs}`);
  const few = planMatchEndSchedule({ kind: "defeat", structures: ring(3), nexus: NEXUS, durationMs: 6746 });
  assert.equal(few.gapMs, 450);
  const crowd = planMatchEndSchedule({ kind: "defeat", structures: ring(150), nexus: NEXUS, durationMs: 6746 });
  assert.equal(crowd.gapMs, 80);
});

test("zamanlama: ardışık duvarlar dörderli gruplarda, hafif adım", () => {
  const walls = ring(10, { wall: true, prefix: "w" });
  const plan = planMatchEndSchedule({ kind: "defeat", structures: walls, nexus: NEXUS, durationMs: 5000 });
  const groups = plan.steps.filter((step) => step.role === "walls");
  assert.deepEqual(groups.map((step) => step.items.length), [4, 4, 2]);
  const mixed = planMatchEndSchedule({ kind: "defeat", structures: [...walls.slice(0, 2), ...ring(2)], nexus: NEXUS, durationMs: 5000 });
  assert.equal(mixed.steps.reduce((sum, step) => sum + step.items.length, 0), 4);
  assert.ok(mixed.steps.every((step) => step.role !== "walls" || step.items.every((item) => item.wall)));
});

// --- Denetleyici --------------------------------------------------------------

function fakePorts({ seconds = 6.746, throwIn } = {}) {
  const log = { speak: 0, begin: 0, steps: [], end: [], reports: 0 };
  const ports = {
    speak() {
      log.speak += 1;
      if (throwIn === "speak") throw new Error("ses");
      return seconds;
    },
    begin() {
      log.begin += 1;
    },
    step(step) {
      log.steps.push(step.role);
      if (throwIn === "step") throw new Error("cizim");
    },
    end(skipped) {
      log.end.push(skipped);
    },
    openReport() {
      log.reports += 1;
    }
  };
  return { ports, log };
}

test("denetleyici: adımlar sırayla, rapor sonunda tam bir kez, ATLAS bir kez", () => {
  const { ports, log } = fakePorts();
  const sequence = new MatchEndSequence("defeat", ring(6), NEXUS, ports);
  const plan = sequence.start(1000);
  sequence.start(1000);
  assert.equal(log.speak, 1, "satir bir kez");
  assert.equal(log.begin, 1);
  assert.equal(plan.durationMs, 6746);
  sequence.tick(1000 + plan.steps[2].atMs);
  assert.equal(log.steps.length, 3);
  assert.equal(log.reports, 0);
  sequence.tick(1000 + plan.reportAtMs - 1);
  assert.equal(log.steps.at(-1), "nexus");
  assert.equal(log.reports, 0);
  sequence.tick(1000 + plan.reportAtMs);
  sequence.tick(1000 + plan.reportAtMs + 500);
  sequence.skip();
  sequence.finish();
  assert.equal(log.reports, 1, "rapor tam bir kez");
  assert.deepEqual(log.end, [false]);
  assert.ok(sequence.done);
});

test("denetleyici: dokunuş doğrudan rapora geçiyor; kalan adım atılmıyor", () => {
  const { ports, log } = fakePorts();
  const sequence = new MatchEndSequence("victory", ring(8), NEXUS, ports);
  sequence.start(0);
  sequence.tick(400);
  const fired = log.steps.length;
  sequence.skip();
  assert.equal(log.reports, 1);
  assert.deepEqual(log.end, [true]);
  sequence.tick(60_000);
  sequence.skip();
  assert.equal(log.steps.length, fired, "gecisten sonra adim yok");
  assert.equal(log.reports, 1);
});

test("denetleyici: ses ya da çizim hatası raporu durdurmuyor; ses yoksa ~5 sn", () => {
  const silent = fakePorts({ throwIn: "speak" });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const a = new MatchEndSequence("defeat", ring(3), NEXUS, silent.ports);
    assert.equal(a.start(0).durationMs, 5000);
    a.tick(60_000);
    assert.equal(silent.log.reports, 1);
    const broken = fakePorts({ throwIn: "step" });
    const b = new MatchEndSequence("defeat", ring(3), NEXUS, broken.ports);
    b.start(0);
    b.tick(60_000);
    assert.equal(broken.log.reports, 1);
    assert.equal(broken.log.steps.length, 4);
  } finally {
    console.warn = warn;
  }
  const none = fakePorts({ seconds: null });
  assert.equal(new MatchEndSequence("victory", [], NEXUS, none.ports).start(0).durationMs, 5000);
});

test("gec katılan ve sonuçtan sonra yeniden bağlanan sahneyi görmüyor", () => {
  assert.equal(shouldPlayMatchEndSequence({ liveSnapshotSeen: true, liveSinceBind: true }), true);
  assert.equal(shouldPlayMatchEndSequence({ liveSnapshotSeen: false, liveSinceBind: false }), false, "gec katilan");
  assert.equal(shouldPlayMatchEndSequence({ liveSnapshotSeen: true, liveSinceBind: false }), false, "sonuctan sonra yeniden baglanan");
});

test("ATLAS: sahne satırı söyletiyor, raporun açılışındaki ikinci çağrı boş; süre çalan satırdan", () => {
  const plays = [];
  const audio = {
    isReady: () => true,
    onReady() {},
    prefetch() {},
    play(url, _volume, onEnded) {
      plays.push(url);
      return { stop() { onEnded(); }, setVolume() {} };
    }
  };
  const atlas = new AtlasVoice({ audio, getVolume: () => 1, random: () => 0, now: () => 0 });
  atlas.startMatch("oda:1");
  let seconds;
  const { ports, log } = fakePorts();
  ports.speak = () => {
    atlas.matchEnded("defeat");
    seconds = atlas.playingCategory === "death" ? getAtlasLineSeconds(atlas.playingUrl) : undefined;
    return seconds;
  };
  ports.openReport = () => {
    log.reports += 1;
    // GameScene.openRunReport: `if (this.liveSnapshotSeen) this.atlas?.matchEnded(result);`
    assert.equal(atlas.matchEnded("defeat"), false);
  };
  const sequence = new MatchEndSequence("defeat", ring(4), NEXUS, ports);
  const plan = sequence.start(0);
  assert.equal(plays.length, 1);
  assert.match(plays[0], /^audio\/atlas\/death\/death-0\d\.mp3$/);
  assert.equal(seconds, ATLAS_FINAL_LINE_SECONDS[plays[0]]);
  assert.equal(plan.durationMs, getMatchEndDurationMs(seconds));
  sequence.skip();
  assert.equal(plays.length, 1, "satir tam bir kez");
  assert.equal(log.reports, 1);
});

// --- Ses yonetmeni ------------------------------------------------------------

test("ses yönetmeni: aralık ve pencere sınırı, yoğunlukta kısılma, nexus geçiyor", () => {
  const governor = new MatchEndSoundGovernor();
  const first = governor.admit("tower", 0, "a");
  assert.equal(first.length, 1);
  assert.equal(first[0].family, "impact");
  assert.ok(first[0].rate >= 0.6 && first[0].rate <= 0.82);
  assert.deepEqual(governor.admit("tower", MATCH_END_SOUND_RULES.minGapMs - 1, "b"), [], "cok yakin");
  const gains = [first[0].gain];
  const admitted = [0];
  for (let index = 1; index < 40; index += 1) {
    const cues = governor.admit("tower", index * 80, `t${index}`);
    if (cues.length) {
      gains.push(cues[0].gain);
      admitted.push(index * 80);
    }
  }
  for (const at of admitted) {
    const inWindow = admitted.filter((other) => other >= at && other - at <= MATCH_END_SOUND_RULES.windowMs).length;
    assert.ok(inWindow <= MATCH_END_SOUND_RULES.maxInWindow, `pencere siniri: ${inWindow}`);
  }
  assert.ok(admitted.length < 40, "her patlama ses almiyor");
  assert.ok(gains[1] < gains[0], "yogunlukta kisiliyor");
  assert.equal(governor.admit("walls", 5000, "w")[0].family, "ball");
  assert.equal(governor.admit("power", 6000, "p")[0].family, "focus");
  assert.deepEqual(governor.admit("nexus", 6001, "n").map((cue) => cue.family), ["impact", "heft"]);
  assert.equal(governor.admit("launch", 6002, "l")[0].family, "wave");
  // Perde kimlikten: ayni kimlik ayni perde.
  assert.equal(new MatchEndSoundGovernor().admit("tower", 0, "x")[0].rate, new MatchEndSoundGovernor().admit("tower", 0, "x")[0].rate);
});

// --- Cizim: renk kurali, havuz, LOD ------------------------------------------

const channels = (color) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map((value) => value / 255);
function hsl(color) {
  const [r, g, b] = channels(color);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}
/** tests/vfx-hard-language.test.mjs ile ayni kural: ton, beyaz-sicak ya da koyu; pastel bant yok. */
const grounded = (color) => {
  const { s, l } = hsl(color);
  if (l <= 0.22 || l >= 0.9) return true;
  if (l > 0.7) return s <= 0.35;
  return s <= 0.625;
};

function drawAll({ lod = 0, still = false } = {}) {
  const ground = createRecorder();
  const body = createRecorder();
  const glow = createRecorder();
  const flashes = [];
  const level = new VfxLod();
  level.force(lod);
  const vfx = new MatchEndVfx(ground, body, glow, { flash: { flash: (spec) => flashes.push(spec) }, lod: level, reducedMotion: () => still });
  vfx.startBeam(0, 0, 60, 0, 5000, -900);
  vfx.detonate(40, 40, 30, "tower", 0, 11);
  vfx.detonate(80, 40, 30, "wall", 50, 12);
  vfx.detonate(0, 0, 60, "nexus", 100, 13);
  vfx.powerDown(120, -80, 30, { x: 0, y: 0 }, 0, 14);
  vfx.dissolve(-60, -60, 28, 0, 15);
  for (const at of [0, 40, 120, 300, 500, 700, 1200, 2000, 3000, 5000]) {
    if (at === 5000) vfx.launch(at);
    vfx.render(at);
  }
  return { ground, body, glow, flashes, vfx };
}

const colorsOf = (...recorders) => recorders.flatMap((recorder) => recorder.calls
  .filter(([name]) => name === "lineStyle" || name === "fillStyle")
  .map(([name, a, b]) => (name === "lineStyle" ? b : a)));

test("renk kuralı: patlama, kabuk, ışın, güç devri ve çözülme yere indirilmiş", () => {
  for (const options of [{}, { still: true }, { lod: 2 }]) {
    const { ground, body, glow, flashes } = drawAll(options);
    const colors = colorsOf(ground, body, glow);
    assert.ok(colors.length > 100, "cizim var");
    for (const color of colors) assert.ok(grounded(color), `pastel/doygun renk: ${color.toString(16)}`);
    for (const spec of flashes) assert.ok(grounded(spec.tint), `flas tonu: ${spec.tint.toString(16)}`);
  }
  for (const name of ["MATCH_END_EMBER", "MATCH_END_SHOCK", "MATCH_END_COLD", "MATCH_END_COLD_HOT", "MATCH_END_COLD_CORE", "MATCH_END_HUSK_TINT", "MATCH_END_POWERED_DOWN_TINT", "MATCH_END_SMOKE_DARK", "MATCH_END_SMOKE_LIGHT"]) {
    assert.ok(grounded(vfxModule[name]), name);
  }
});

test("çizim: kabuk kalıyor, LOD ayrıntı düşürüyor, havuz sınırlı, temizlik tam", () => {
  const full = drawAll();
  const light = drawAll({ lod: 3 });
  assert.ok(light.body.calls.length < full.body.calls.length, "LOD 3 daha az cizim");
  assert.equal(full.vfx.huskCount, 2, "kule ve duvar kabugu; nexus kabuk degil");
  // Ilk flas sert beyaz.
  assert.equal(full.flashes[0].tint, 0xffffff);
  const vfx = full.vfx;
  for (let index = 0; index < MATCH_END_EVENT_CAP * 2; index += 1) vfx.detonate(index, 0, 20, "tower", 10_000, index);
  assert.ok(vfx.liveCount <= MATCH_END_EVENT_CAP);
  vfx.clear();
  assert.equal(vfx.liveCount, 0);
  assert.equal(vfx.huskCount, 0);
});

// --- Sahne baglantisi (kaynak duzeyinde) --------------------------------------

test("GameScene: sonuç önce sahneyi, sahne bitince raporu bir kez açıyor; sunucuya mesaj yok", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  const body = (name) => {
    const start = scene.indexOf(`  private ${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    const next = scene.indexOf("\n  private ", start + 10);
    return scene.slice(start, next);
  };
  const handle = body("handleMatchResult");
  assert.match(handle, /runTelemetry\.end\(result, summary\.run\);/);
  assert.match(handle, /if \(step\.open\) \{\s*this\.beginMatchEnd\(result, summary\);/);
  assert.match(handle, /step\.refresh && this\.matchEndReport && summary\.run[\s\S]*pending\.summary = \{ \.\.\.pending\.summary, run: summary\.run/);
  const begin = body("beginMatchEnd");
  assert.match(begin, /if \(this\.matchResultShown \|\| this\.matchEndReport\) return;/);
  assert.match(begin, /if \(!shouldPlayMatchEndSequence\(\{ liveSnapshotSeen: this\.liveSnapshotSeen, liveSinceBind: this\.liveSinceBind \}\)\) \{\s*this\.openRunReport\(result, summary\);\s*return;/);
  assert.match(begin, /atlas\.matchEnded\(result\);[\s\S]*getAtlasLineSeconds\(atlas\.playingUrl\)/);
  assert.match(begin, /openReport: \(\) => this\.finishMatchEnd\(\)/);
  assert.match(begin, /this\.matchEndSafetyTimer = window\.setTimeout/);
  const finish = body("finishMatchEnd");
  assert.match(finish, /const pending = this\.matchEndReport;\s*this\.matchEndReport = undefined;\s*if \(pending\) this\.openRunReport\(pending\.result, pending\.summary\);/);
  for (const name of ["beginMatchEnd", "finishMatchEnd", "updateMatchEnd", "getMatchEndNexus"]) {
    assert.doesNotMatch(body(name), /room\??\.send|\.send\(/, `${name} sunucuya yolluyor`);
  }
  // Raporun kendi kapisi ve ATLAS kapisi degismedi.
  assert.match(body("openRunReport"), /if \(this\.matchResultShown\) \{\s*return;\s*\}\s*this\.matchResultShown = true;[\s\S]*if \(this\.liveSnapshotSeen\) this\.atlas\?\.matchEnded\(result\);/);
  // Yeni baglanti ve canli snapshot.
  assert.match(body("bindRoomHandlers"), /^\s*private bindRoomHandlers\(room: Room\) \{[\s\S]{0,300}this\.liveSinceBind = false;/);
  assert.match(body("queueSnapshot"), /if \(!snapshot\.result\) this\.liveSnapshotSeen = true;[\s\S]{0,120}if \(!snapshot\.result\) this\.liveSinceBind = true;/);
  // Karede sahne; yapilar ve dusmanlar.
  assert.match(scene, /\n  update\(\) \{[\s\S]*?this\.updateMatchEnd\(now\);[\s\S]*?\n  \}/);
  const update = body("updateMatchEnd");
  assert.match(update, /stage\.structureState\(id\)/);
  assert.match(update, /MATCH_END_HUSK_TINT : MATCH_END_POWERED_DOWN_TINT/);
  assert.match(update, /stage\.enemyAlpha\(id\)/);
  // Kapanista sizinti yok.
  assert.match(scene, /window\.clearTimeout\(this\.matchEndSafetyTimer\);[\s\S]{0,200}this\.matchEndReport = undefined;\s*this\.matchEndStage\?\.destroy\(\);\s*this\.matchEndStage = undefined;/);
});

test("sahne: Geç katmanı, HUD kararması, iki dilli metin, galeri sayfası", async () => {
  const stage = read("apps/web/src/vfx/match-end-stage.ts");
  assert.match(stage, /button\.textContent = t\("scene\.matchEnd\.skip"\)/);
  assert.match(stage, /overlay\.addEventListener\("pointerup"[\s\S]*this\.skip\(\);/);
  assert.match(stage, /document\.body\.classList\.toggle\("match-ending", on\)/);
  assert.match(stage, /if \(input\.cameraEase && !this\.deps\.reducedMotion\(\)\) this\.easeCamera/);
  const css = read("apps/web/src/style.css");
  assert.match(css, /body\.match-ending \.game-hud,\s*body\.match-ending \.game-controls \{[\s\S]*opacity: 0\.32;[\s\S]*pointer-events: none;/);
  assert.match(css, /\.match-end-skip__button \{[\s\S]*min-width: 44px;\s*min-height: 44px;/);
  assert.match(css, /\.match-end-skip \{[\s\S]*z-index: 78;/);
  const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
  assert.equal(i18n.tr["scene.matchEnd.skip"], "Geç");
  assert.equal(i18n.en["scene.matchEnd.skip"], "Skip");
  assert.ok(i18n.tr["scene.matchEnd.skipAria"] && i18n.en["scene.matchEnd.skipAria"]);
  const gallery = read("apps/web/src/scenes/VfxGalleryScene.ts");
  assert.match(gallery, /type Mode = [^;]*"ending"/);
  assert.match(gallery, /button\("Maç sonu"/);
  assert.match(gallery, /this\.endingStage = new MatchEndStage\(this,/);
  assert.match(gallery, /stage\.play\(\{\s*kind,/);
});
