/**
 * Kayitli savas sesleri (vurus, oldurme, kritik).
 *
 * Ornekler `apps/web/public/audio/sfx/` altinda, tools/build-sfx.mjs
 * Kenney'nin CC0 paketlerinden uretiyor. Buradaki testler sozleri kilitliyor:
 *
 * - Her vurus turu ve turu olmayan kulelerin siluet sesi kendi ailesine
 *   iniyor; aileler ayni dosyayi ya da ayni kaynagi paylasmiyor.
 * - Manifestteki her dosya diskte, sure ve boyut butcesinin altinda;
 *   lisans notu yaninda.
 * - Oldurme sesi bir portal: boyu dusmandan, A ve D tarzi sirayla, saniyede
 *   en fazla 6 (arkadas 2), sampiyon her zaman. Kombo ile tirmanmiyor;
 *   oldurme basina muzikal tini yok.
 * - Vurus butcesi (6 ses, aralik, tik), seviye 0, gizli sekme ve saat
 *   ayrismasi kurallari orneklerle de gecerli.
 * - Cozme basarisizsa ses sentezle devam ediyor, hicbir yol hata firlatmiyor.
 * - Cesit ve hiz kaymasi deterministik: Math.random yok.
 *
 * Ses sahte bir AudioContext ile olculuyor: `decodeAudioData` ve
 * `createBufferSource` dahil, kurulan her dugum kayitli.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const samples = await importWebModule("apps/web/src/sfx-samples.ts");
const hit = await importWebModule("apps/web/src/hit-sounds.ts");
const director = await importWebModule("apps/web/src/feedback-director.ts");
const profiles = await importWebModule("apps/web/src/vfx/vfx-profiles.ts");
const { RECIPES, SFX_BUDGET, MAX_HIT_SECONDS, MAX_PORTAL_SECONDS, MAX_SMALL_SWELL_SECONDS, MAX_TICK_SECONDS, MAX_CUE_SECONDS, MIN_MID_BAND_DB } = await import("../tools/build-sfx.mjs");
const portal = await import("../tools/sfx-portal.mjs");
const { towerCatalog, FEEDBACK_KIND_RULES, FEEDBACK_LIMITS, FeedbackGovernor } = await import("../packages/shared/dist/index.js");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sfxDir = new URL("../apps/web/public/audio/sfx/", import.meta.url);
const manifest = JSON.parse(read("apps/web/public/audio/sfx/manifest.json"));
const manifestByFile = new Map(manifest.files.map((entry) => [entry.file, entry]));

/* ------------------------------------------------------------------ */
/* Sahte ses baglami                                                   */
/* ------------------------------------------------------------------ */

class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(value, time) { this.events.push(["set", value, time]); this.value = value; return this; }
  exponentialRampToValueAtTime(value, time) { this.events.push(["exp", value, time]); return this; }
  linearRampToValueAtTime(value, time) { this.events.push(["lin", value, time]); return this; }
  setTargetAtTime(value, time, constant) { this.events.push(["target", value, time, constant]); this.value = value; return this; }
  cancelScheduledValues(time) { this.events.push(["cancel", time]); return this; }
}

class FakeNode {
  constructor(context, kind) {
    this.context = context;
    this.kind = kind;
    this.connections = [];
    this.disconnected = false;
    context.created.push(this);
  }
  connect(target) { this.connections.push(target); return target; }
  disconnect() { this.disconnected = true; }
}

class FakeSource extends FakeNode {
  start(time, offset) { this.startAt = time; this.offset = offset; }
  stop(time) { this.stopAt = time; }
  /** Gercek baglamda kaynak bitince tarayici cagiriyor; testte elle. */
  end() { this.onended?.({ target: this }); }
}

class FakeContext {
  static instances = [];
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = { kind: "destination" };
    this.created = [];
    this.decoded = 0;
    /** "ok" | "reject" | "throw" | "callback": cozmenin davranisi. */
    this.decodeMode = FakeContext.nextDecodeMode ?? "ok";
    FakeContext.instances.push(this);
  }
  createOscillator() {
    const node = new FakeSource(this, "oscillator");
    node.type = "sine";
    node.frequency = new FakeParam(440);
    return node;
  }
  createGain() {
    const node = new FakeNode(this, "gain");
    node.gain = new FakeParam(1);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeNode(this, "filter");
    node.frequency = new FakeParam(350);
    node.Q = new FakeParam(1);
    return node;
  }
  createBufferSource() {
    const node = new FakeSource(this, "bufferSource");
    node.buffer = null;
    node.playbackRate = new FakeParam(1);
    return node;
  }
  createDynamicsCompressor() {
    const node = new FakeNode(this, "compressor");
    for (const key of ["threshold", "knee", "ratio", "attack", "release"]) node[key] = new FakeParam(0);
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
  }
  decodeAudioData(data, ok, fail) {
    const file = data.file;
    const entry = manifestByFile.get(file);
    const buffer = { file, duration: (entry?.durationMs ?? 100) / 1000 };
    if (this.decodeMode === "throw") throw new Error("cozulemedi");
    if (this.decodeMode === "reject" || (this.decodeMode === "reject-impact" && file.startsWith("impact-"))) {
      const error = new Error("cozulemedi");
      queueMicrotask(() => fail?.(error));
      return Promise.reject(error);
    }
    this.decoded += 1;
    if (this.decodeMode === "callback") {
      // Eski Safari: yalnizca geri cagirma, soz yok.
      queueMicrotask(() => ok?.(buffer));
      return undefined;
    }
    return Promise.resolve(buffer);
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  close() { this.state = "closed"; return Promise.resolve(); }
}

globalThis.window = { AudioContext: FakeContext };

/**
 * Yonetmenin saati elde: butcenin araliklari (70 ms, 150 ms) gercek zamana
 * bagli kalmasin. Her test kendi basinda saati ileri sariyor.
 */
let clock = 1_000_000;
performance.now = () => clock;
const advance = (ms = 10_000) => { clock += ms; };

/** Sahte yukleyici: dosya adini tasiyan bir "tampon". */
const requested = [];
const fakeLoader = (url) => {
  requested.push(url);
  const file = url.slice(url.lastIndexOf("/") + 1);
  return Promise.resolve({ file });
};

async function makeDirector(options = {}, decodeMode = "ok") {
  FakeContext.nextDecodeMode = decodeMode;
  const instance = new director.FeedbackDirector({ sfxVolume: 0.6, hitVolume: 0.5, vibration: false, getCamera: () => undefined, loadSample: fakeLoader, ...options });
  instance.unlockAudio();
  const context = FakeContext.instances.at(-1);
  FakeContext.nextDecodeMode = undefined;
  await instance.whenSamplesLoaded();
  return { instance, context };
}

const sources = (context) => context.created.filter((node) => node.kind === "bufferSource");
const oscillators = (context) => context.created.filter((node) => node.kind === "oscillator");
const familyOf = (file) => manifestByFile.get(file)?.family;
/** Oldurme sesleri: siradan (er), agir (kaba), ucan, sampiyon. */
const LIGHT = samples.getKillSoundCue("grunt");
const HEAVY = samples.getKillSoundCue("brute");
const AIR = samples.getKillSoundCue("runner", true);
const CHAMPION = samples.getKillSoundCue("grunt", false, true);
const isPortal = (node) => familyOf(node.buffer?.file)?.startsWith("portal");
const styleOf = (node) => manifestByFile.get(node.buffer?.file)?.style;
/** Kanal dugumleri (vurus ve Efektler kanali): ses basina degil, bir kez kuruluyor. */
const isBus = (node) => node.connections[0]?.kind === "compressor" || node.connections[0]?.connections?.[0]?.kind === "compressor";

/** Butun saldiran kuleler (galerideki 40). */
const attacking = [];
{
  const seen = new Set();
  for (const towers of Object.values(towerCatalog)) {
    for (const tower of towers) {
      if (seen.has(tower.id) || !profiles.isAttackingDefinition(tower)) continue;
      seen.add(tower.id);
      attacking.push(tower);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Aileler                                                              */
/* ------------------------------------------------------------------ */

test("her vurus turu ve siluet sesi kendi ornek ailesine iniyor; her saldiran kule bir aileye", () => {
  for (const voice of hit.HIT_VOICE_IDS) {
    const family = samples.SAMPLE_FAMILIES[voice];
    assert.ok(family, `${voice} ailesi yok`);
    assert.ok(family.files.length >= 2, `${voice} en az iki cesit`);
    assert.ok(family.gain > 0 && family.gain <= 1, `${voice} seviyesi`);
  }
  for (const silhouette of ["orb", "ring", "ball", "dart"]) {
    assert.ok(samples.SAMPLE_FAMILIES[silhouette].files.length >= 2, `${silhouette} siluet ailesi`);
  }
  for (const definition of attacking) {
    const voice = hit.resolveHitVoice(definition.id);
    assert.ok(voice && samples.SAMPLE_FAMILIES[voice], `${definition.id} bir aileye inmeli`);
  }
  for (const family of samples.KILL_SOUND_FAMILIES) {
    assert.ok(samples.SAMPLE_FAMILIES[family].files.length >= 2, `${family} cesitleri`);
  }
});

test("aileler ayri: dosya da kaynak da paylasilmiyor", () => {
  const fileOwner = new Map();
  const sourceOwner = new Map();
  for (const id of samples.SAMPLE_FAMILY_IDS) {
    for (const file of samples.SAMPLE_FAMILIES[id].files) {
      assert.equal(fileOwner.get(file), undefined, `${file} iki ailede`);
      fileOwner.set(file, id);
      const entry = manifestByFile.get(file);
      assert.ok(entry, `${file} manifestte yok`);
      assert.equal(entry.family, id, `${file} manifestte baska ailede`);
      // Oldurme portalinin uc boyu ayni tarifin uc olcegi: sisme kaynagi ortak, darbe kaydi farkli.
      if (samples.KILL_SOUND_FAMILIES.includes(id)) continue;
      const owner = sourceOwner.get(entry.source);
      assert.ok(owner === undefined || owner === id, `${entry.source} hem ${owner} hem ${id} ailesinde`);
      sourceOwner.set(entry.source, id);
    }
  }
  // Bir ailenin cesitleri de ayri kaynak dosyalardan (ayni kaydin iki dilimi degil).
  for (const id of samples.SAMPLE_FAMILY_IDS) {
    const sources = samples.SAMPLE_FAMILIES[id].files.map((file) => manifestByFile.get(file).source);
    assert.equal(new Set(sources).size, sources.length, `${id} cesitleri ayni kaynaktan`);
  }
  // Iki ailenin ayni kaynak cesidi yok.
  const hitFamilies = hit.HIT_VOICE_IDS.map((voice) => samples.SAMPLE_FAMILIES[voice].files.map((file) => manifestByFile.get(file).source).sort().join("|"));
  assert.equal(new Set(hitFamilies).size, hit.HIT_VOICE_IDS.length, "her vurus ailesinin kaynak kumesi farkli");
});

/** Ailenin etkin tepesi: kazanc x en yuksek dosya tepesi (manifestten). */
function effectivePeak(id, extraGain = 1) {
  const peak = Math.max(...samples.SAMPLE_FAMILIES[id].files.map((file) => 10 ** (manifestByFile.get(file).peakDb / 20)));
  return samples.SAMPLE_FAMILIES[id].gain * extraGain * peak;
}

test("seviyeler sentezle eslesik: ailenin etkin tepesi hedef araliginda, oldurme vurusu bastirmiyor", () => {
  const ticks = new Set(["focus", "aura", "contamination", "curse"]);
  for (const voice of hit.HIT_VOICE_IDS) {
    const peak = effectivePeak(voice);
    // Tiklerin alt siniri dusuk: ezilmis lanet tepeden degil RMS ten kisiliyor (tepesi -12.6 dBFS).
    const [low, high] = ticks.has(voice) ? [0.07, 0.25] : [0.15, 0.36];
    assert.ok(peak >= low && peak <= high, `${voice} etkin tepe ${peak.toFixed(3)} (${low}-${high})`);
    // RMS de sinirli: yogun (ezilmis) bir ses tepeden kisik olsa da gurultu duvari olmasin.
    const rms = Math.max(...samples.SAMPLE_FAMILIES[voice].files.map((file) => 10 ** (manifestByFile.get(file).rmsDb / 20)));
    assert.ok(samples.SAMPLE_FAMILIES[voice].gain * rms <= 0.052, `${voice} RMS cok yuksek`);
    // Sv 10: kademe kazanci ve govde (tepeleri ust uste gelse bile) 0.6yi asmiyor; gerisi sinirlayicinin isi.
    const top = samples.SAMPLE_TIERS[2].gain;
    assert.ok(effectivePeak(voice, top) + effectivePeak("heft", samples.SAMPLE_FAMILIES[voice].gain * top) <= 0.6, `${voice} sv 10 cok yuksek`);
  }
  for (const [id, low, high] of [["crit", 0.1, 0.2], ["execute", 0.2, 0.3]]) {
    const peak = effectivePeak(id);
    assert.ok(peak >= low && peak <= high, `${id} etkin tepe ${peak.toFixed(3)} (${low}-${high})`);
  }
  // Oldurme portali: dosyalar -20 LUFS; kazanc eski govde + olum sesi karisiminin
  // olculen seviyesinde (kucuk ~0.2, agir ~0.36-0.47). Boy buyudukce seviye artiyor.
  const gains = samples.KILL_SOUND_FAMILIES.map((id) => samples.SAMPLE_FAMILIES[id].gain);
  assert.deepEqual(gains, [...gains].sort((a, b) => a - b), "kucuk <= agir <= sampiyon");
  assert.ok(gains[0] >= 0.18 && gains[0] <= 0.3, `kucuk portal ${gains[0]}`);
  assert.ok(gains[2] <= 0.5, `sampiyon portal ${gains[2]}`);
  const rmsOf = (id) => samples.SAMPLE_FAMILIES[id].gain * Math.max(...samples.SAMPLE_FAMILIES[id].files.map((file) => 10 ** (manifestByFile.get(file).rmsDb / 20)));
  for (const id of samples.KILL_SOUND_FAMILIES) {
    for (const file of samples.SAMPLE_FAMILIES[id].files) {
      const entry = manifestByFile.get(file);
      assert.ok(Math.abs(entry.lufs - portal.PORTAL_TARGET_LUFS) <= 1, `${file} ${entry.lufs} LUFS`);
      assert.ok(entry.peakDb <= portal.PORTAL_PEAK_DB + 0.5, `${file} tepe ${entry.peakDb}`);
    }
    // Kombo (+%16) ve tepesi ile bile sinirlayicidan (-3 dBFS) uzak.
    assert.ok(effectivePeak(id, samples.getKillComboGain(8)) <= 0.4, `${id} etkin tepe cok yuksek`);
    assert.ok(rmsOf(id) <= 0.07, `${id} RMS cok yuksek`);
  }
  // Vurus kanali varsayilan 0.5: en yuksek vurus Efektler'de kucuk portaldan (RMS) kisik ama yarisindan yuksek.
  // Tepe degil RMS: portalin tepe/RMS orani vurustan dusuk (uzun, yuvarlak bir ses).
  const loudestHit = Math.max(...hit.HIT_VOICE_IDS.map((voice) => rmsOf(voice))) * 0.5;
  assert.ok(loudestHit < rmsOf("portalSmall") && loudestHit > rmsOf("portalSmall") * 0.5, `vurus ${loudestHit.toFixed(4)} / oldurme ${rmsOf("portalSmall").toFixed(4)}`);
});

test("Efektler kanali sikistirici ve son bir sinirlayicidan cikiyor", async () => {
  const { instance, context } = await makeDirector();
  advance();
  instance.playHit("impact", 1, true, "x");
  const compressors = context.created.filter((node) => node.kind === "compressor");
  assert.equal(compressors.length, 2);
  const limiter = compressors.find((node) => node.connections[0] === context.destination);
  const compressor = compressors.find((node) => node.connections[0] === limiter);
  assert.ok(limiter && compressor, "kanal -> sikistirici -> sinirlayici -> cikis");
  assert.equal(limiter.threshold.value, -3);
  assert.equal(limiter.ratio.value, 20);
  assert.equal(limiter.attack.value, 0.001);
  assert.equal(limiter.knee.value, 0);
  instance.destroy();
});

test("tik sesleri butceyi doldurmuyor: en fazla 150 ms yer, 2 yuva vuruslara ayrik", async () => {
  // Manifest: tik aileleri tik araligindan kisa.
  for (const id of ["focus", "aura", "contamination", "curse"]) {
    for (const file of samples.SAMPLE_FAMILIES[id].files) {
      assert.ok(manifestByFile.get(file).durationMs <= MAX_TICK_SECONDS * 1000 + 1, `${file} ${manifestByFile.get(file).durationMs} ms`);
      assert.equal(manifestByFile.get(file).tick, true);
    }
  }
  assert.ok(MAX_TICK_SECONDS * 1000 < hit.HIT_SOUND_LIMITS.tickGapMs);

  const { instance } = await makeDirector();
  advance();
  // Surekli isinlar: dort ayri kulenin odak/alan/sizinti/lanet tikleri ust uste.
  const tickVoices = ["focus", "aura", "contamination", "curse", "focus", "aura"];
  let playing = 0;
  for (let round = 0; round < 6; round += 1) {
    for (const voice of tickVoices) if (instance.playHit(voice, 1, true, `${voice}${round}`, true)) playing += 1;
    advance(40);
  }
  assert.ok(instance.getBudgetUsage().hitVoices <= hit.HIT_SOUND_LIMITS.voices - hit.HIT_SOUND_LIMITS.reservedHitSlots, "tikler en fazla 4 yuva");
  assert.equal(instance.playHit("projectile", 1, true, "p"), true, "mermi yine calar");
  assert.equal(instance.playHit("impact", 1, true, "i"), true, "carpma yine calar");
  assert.ok(playing > 0);
  instance.destroy();

  // Butce: tik en fazla tik araligi kadar yer tutuyor.
  const governor = new hit.HitSoundGovernor();
  assert.ok(governor.admit("aura", true, false, 400, 0) >= 0);
  assert.equal(governor.activeVoices(hit.HIT_SOUND_LIMITS.tickGapMs + 1), 0, "uzun tik bile 150 ms'de bosaliyor");
  assert.ok(governor.admit("projectile", true, false, 400, 0) >= 0);
  assert.equal(governor.activeVoices(hit.HIT_SOUND_LIMITS.tickGapMs + 1), 1, "tik olmayan ses tam suresiyle");
  const full = new hit.HitSoundGovernor();
  let ticks = 0;
  for (const voice of ["focus", "aura", "contamination", "curse", "wave", "slash"]) if (full.admit(voice, true, true, 100, 0) >= 0) ticks += 1;
  assert.equal(ticks, hit.HIT_SOUND_LIMITS.voices - hit.HIT_SOUND_LIMITS.reservedHitSlots);
  assert.ok(full.admit("projectile", true, false, 100, 0) >= 0);
  assert.ok(full.admit("impact", true, false, 100, 0) >= 0);
});

test("sv 10 govdesi yuvayi paylasiyor: butce ikisinden uzununu tutuyor", async () => {
  const { instance } = await makeDirector();
  advance();
  const shape = samples.SAMPLE_TIERS[2];
  const heft = manifestByFile.get("heft-1.mp3").durationMs;
  const main = Math.max(...samples.SAMPLE_FAMILIES.impact.files.map((file) => manifestByFile.get(file).durationMs));
  assert.ok(heft > main, "bu ailede govde ana ornekten uzun");
  instance.playHit("impact", 3, true, "k");
  advance(heft / shape.rate - 2);
  assert.equal(instance.getBudgetUsage().hitVoices, 1, "govde bitene kadar yuva dolu");
  advance(40);
  assert.equal(instance.getBudgetUsage().hitVoices, 0);
  instance.destroy();
});

test("oldurme tek bir portal sesi: butcede ornegin suresiyle; arkadasinki kisik", async () => {
  const { instance, context } = await makeDirector();
  advance();
  instance.emit("kill", { own: true, x: 0, y: 0 }, HEAVY, "h1");
  const layers = sources(context);
  assert.deepEqual(layers.map((node) => familyOf(node.buffer.file)), ["portalNormal"], "agir oldurme: tek kaynak, govde ya da yaratik sesi yok");
  const longest = Math.max(...samples.SAMPLE_FAMILIES.portalNormal.files.map((file) => manifestByFile.get(file).durationMs));
  advance(longest - 50);
  assert.equal(instance.getBudgetUsage().voices, 1, "agir oldurme sesi bitene kadar butcede");
  advance(200);
  assert.equal(instance.getBudgetUsage().voices, 0);
  assert.equal(FEEDBACK_KIND_RULES.kill.soundMs, 120, "kural yalnizca sentez yedegi icin");

  advance();
  const before = sources(context).length;
  const mate = instance.emit("kill", { own: false, x: 90, y: 0 }, HEAVY, "m1");
  assert.equal(mate.sound, true);
  const played = sources(context).slice(before);
  assert.equal(played.length, 1);
  assert.ok(Math.abs(played[0].connections[0].gain.value - samples.SAMPLE_FAMILIES.portalNormal.gain * 0.35) < 1e-9, "arkadasin oldurmesi x0.35");
  instance.destroy();
});

test("boy esleme: siradan ve ucan kucuk, agir normal, sampiyon buyuk; ucan biraz tiz", () => {
  const types = ["grunt", "runner", "shooter", "brute", "siege"];
  for (const type of types) {
    for (const air of [false, true]) {
      for (const champion of [false, true]) {
        const cue = samples.getKillSoundCue(type, air, champion);
        const heavy = type === "brute" || type === "siege";
        const size = champion ? "large" : heavy ? "normal" : "small";
        assert.equal(cue.size, size, `${type}/${air}/${champion}`);
        assert.equal(cue.family, { small: "portalSmall", normal: "portalNormal", large: "portalLarge" }[size]);
        assert.equal(cue.champion, champion);
        assert.equal(cue.rate, air && !heavy && !champion ? samples.KILL_AIR_RATE : 1, "yalnizca ucan siradan dusman tiz");
        assert.equal(samples.getKillSoundCue(type, air, champion), cue, "onceden kurulmus, oldurme basina nesne yok");
      }
    }
  }
  assert.ok(samples.KILL_AIR_RATE > 1 && samples.KILL_AIR_RATE <= 1.1, "hava biraz tiz, cizgi film degil");
  assert.equal(samples.getKillSoundCue(undefined), LIGHT, "tur bilinmiyorsa kucuk");
  assert.equal(AIR.family, "portalSmall");
  assert.equal(CHAMPION.family, "portalLarge");
  // Her boyun iki cesidi: A ve D, ayni sirayla.
  for (const id of samples.KILL_SOUND_FAMILIES) {
    assert.deepEqual(samples.SAMPLE_FAMILIES[id].files.map((file) => manifestByFile.get(file).style), ["a", "d"], id);
  }
  // Galeri: kucuk, hava, agir, sampiyon.
  assert.deepEqual(samples.GALLERY_KILL_CUES.map((entry) => entry.cue.family), ["portalSmall", "portalSmall", "portalNormal", "portalLarge"]);
  assert.ok(samples.GALLERY_KILL_CUES.every((entry) => /portal/i.test(entry.label)));
  assert.equal(samples.GALLERY_KILL_CUES[1].cue.rate, samples.KILL_AIR_RATE);
});

test("portal dosyalari Kenney'den uretiliyor; eski ezilme ve yaratik sesleri yok", () => {
  const killFiles = samples.KILL_SOUND_FAMILIES.flatMap((id) => samples.SAMPLE_FAMILIES[id].files);
  assert.deepEqual([...killFiles].sort(), [
    "death-portal-a-large.mp3", "death-portal-a-normal.mp3", "death-portal-a-small.mp3",
    "death-portal-d-large.mp3", "death-portal-d-normal.mp3", "death-portal-d-small.mp3"
  ]);
  const license = read("apps/web/public/audio/sfx/LICENSE.txt");
  for (const file of killFiles) {
    const entry = manifestByFile.get(file);
    assert.ok(entry, `${file} manifestte yok`);
    assert.ok(existsSync(new URL(file, sfxDir)), `${file} diskte yok`);
    assert.equal(entry.kill, "portal");
    assert.ok(entry.durationMs / 1000 <= MAX_PORTAL_SECONDS[entry.size] + 0.005, `${file} ${entry.durationMs} ms`);
    for (const source of [entry.source, ...entry.layers]) {
      assert.match(source, /^(scifi|impact)\//, `${file}: ${source}`);
      assert.ok(license.includes(source), `LICENSE.txt kaynagi saymiyor: ${source}`);
    }
    assert.ok(license.includes(file), `LICENSE.txt ${file} dosyasini saymiyor`);
    // Manifest tarifle ayni: kaynaklar tools/sfx-portal.mjs'deki katmanlar.
    const design = portal.getPortalDesign(entry.style, entry.size);
    assert.deepEqual([entry.source, ...entry.layers].map((source) => source.replace(/\.(ogg|mp3)$/, "")), design.layers.map((layer) => layer.src));
    assert.equal(entry.swellMs, Math.round(design.swell * 1000));
  }
  // Sisme: kucuk boy kisa (sik oldurme gec kalmasin), normal ve buyuk sahibin dinledigi gibi.
  for (const style of portal.PORTAL_STYLES) {
    for (const size of portal.PORTAL_SIZES) {
      const swell = portal.getPortalDesign(style.id, size.id).swell;
      if (size.id === "small") assert.ok(swell <= MAX_SMALL_SWELL_SECONDS + 1e-9 && swell >= 0.1, `${style.id} kucuk sisme ${swell}`);
      else assert.ok(Math.abs(swell - style.swell * size.k) < 1e-9, `${style.id}/${size.id} sisme degismis`);
    }
  }
  assert.equal(MAX_SMALL_SWELL_SECONDS, 0.15);
  assert.ok(Math.max(...Object.values(MAX_PORTAL_SECONDS)) <= 0.9, "sure siniri yalnizca gerektigi kadar");
  // Eski organik oldurme tamamen gitti: dosya, aile, paket.
  for (const name of readdirSync(sfxDir)) assert.doesNotMatch(name, /^kill-/, `eski oldurme dosyasi kaldi: ${name}`);
  assert.deepEqual(Object.keys(manifest.sources).sort(), ["impact", "scifi"]);
  assert.doesNotMatch(license, /squish|creature|EZduzziteh|rubberduck/i);
  assert.ok(RECIPES.every((recipe) => !/^(squish|creature)/.test(recipe.src ?? "")));
  assert.ok(samples.SAMPLE_FAMILY_IDS.every((id) => !/^(body|voice)/.test(id)));
});

test("oldurme sesi siniri: kendi 6/sn, arkadas 2/sn, sampiyon her zaman; deterministik", () => {
  const original = Math.random;
  Math.random = () => { throw new Error("Math.random kullanildi"); };
  try {
    const run = () => {
      const limiter = new samples.KillSoundLimiter();
      const log = [];
      // On saniye: saniyede 25 kendi, 25 arkadas oldurmesi (ulti ve kalabalik dalga).
      for (let ms = 0; ms < 10_000; ms += 40) {
        for (const own of [true, false]) {
          if (limiter.check(own, false, ms)) {
            limiter.commit(own, ms);
            log.push([own, ms]);
          }
        }
      }
      return log;
    };
    const first = run();
    assert.deepEqual(run(), first, "ayni oldurmeler ayni sesler");
    const { ownPerSecond, teammatePerSecond, windowMs } = samples.KILL_SOUND_LIMITS;
    assert.equal(ownPerSecond, 6);
    assert.equal(teammatePerSecond, 2);
    for (const [mine, limit] of [[true, ownPerSecond], [false, teammatePerSecond]]) {
      const times = first.filter(([own]) => own === mine).map(([, ms]) => ms);
      assert.ok(times.length >= limit * 9 && times.length <= limit * 10, `${mine ? "kendi" : "arkadas"}: 10 sn'de ${times.length}`);
      // Kayan pencere: hicbir 1 sn'de sinirdan fazla baslangic yok.
      for (let index = limit; index < times.length; index += 1) {
        assert.ok(times[index] - times[index - limit] >= windowMs, `${mine ? "kendi" : "arkadas"} ${times[index]} ms'de sinir asildi`);
      }
    }

    // Sampiyon her zaman: sinir dolu olsa da; arkadasin oldurmesi senin sayacini doldurmuyor.
    const limiter = new samples.KillSoundLimiter();
    for (let index = 0; index < ownPerSecond; index += 1) limiter.commit(true, index);
    assert.equal(limiter.check(true, false, 10), false, "kendi sinir dolu");
    assert.equal(limiter.check(true, true, 10), true, "sampiyon yine calar");
    assert.equal(limiter.check(false, false, 10), true, "arkadasin sayaci ayri");
    assert.equal(limiter.check(true, false, windowMs + 1), true, "pencere gecince yeniden");
    limiter.reset();
    assert.equal(limiter.check(true, false, 11), true);
  } finally {
    Math.random = original;
  }
});

test("yonetmende: A ve D sirayla, ayni cesit art arda yok; boy dusmandan, hava tiz", async () => {
  const { instance, context } = await makeDirector();
  advance();
  const play = (cue, key, own = true) => {
    const before = sources(context).length;
    advance(400);
    context.currentTime += 0.4;
    assert.equal(instance.emit("kill", { own, x: 0, y: 0 }, cue, key).sound, true, key);
    const played = sources(context).slice(before);
    assert.equal(played.length, 1, "oldurme basina tek kaynak");
    return played[0];
  };
  for (const [cue, family] of [[LIGHT, "portalSmall"], [HEAVY, "portalNormal"], [CHAMPION, "portalLarge"], [AIR, "portalSmall"]]) {
    const styles = [];
    for (let index = 0; index < 8; index += 1) {
      const node = play(cue, `${family}-${index}`);
      assert.equal(familyOf(node.buffer.file), family);
      styles.push(styleOf(node));
      const base = cue === AIR ? samples.KILL_AIR_RATE : 1;
      assert.ok(Math.abs(node.playbackRate.value / base - 1) <= samples.SAMPLE_RATE_SPREAD + 1e-9, "+-4% hiz kaymasi");
      if (cue === AIR) assert.ok(node.playbackRate.value > 1, "hava tiz");
    }
    assert.ok(styles.every((style, index) => index === 0 || style !== styles[index - 1]), `${family}: ayni tarz art arda (${styles.join("")})`);
    assert.deepEqual(new Set(styles), new Set(["a", "d"]), `${family}: iki tarz da caliyor`);
  }
  instance.destroy();

  // Iki istemci ayni olaylarda ayni cesit ve hizi caliyor.
  const runs = [];
  for (let round = 0; round < 2; round += 1) {
    const made = await makeDirector();
    for (let index = 0; index < 6; index += 1) {
      advance(400);
      made.context.currentTime += 0.4;
      made.instance.emit("kill", { own: true, x: index, y: 0 }, index % 3 === 2 ? HEAVY : LIGHT, `d${index}`);
    }
    runs.push(sources(made.context).map((node) => [node.buffer.file, node.playbackRate.value]));
    made.instance.destroy();
  }
  assert.deepEqual(runs[0], runs[1]);
});

test("yonetmende yogunluk: kendi en fazla 6/sn, arkadas 2/sn, sampiyon hep; butce arayuz seslerini kesmiyor", async () => {
  const { instance, context } = await makeDirector();
  advance();
  // Ulti: bir saniyede 25 kendi oldurmesi.
  let heard = 0;
  for (let index = 0; index < 25; index += 1) {
    if (instance.emit("kill", { own: true, x: index * 30, y: 0 }, LIGHT, `u${index}`).sound) heard += 1;
    advance(40);
  }
  assert.ok(heard <= samples.KILL_SOUND_LIMITS.ownPerSecond, `1 sn'de ${heard} oldurme sesi`);
  assert.ok(heard >= 4, `yeterince duyuluyor (${heard})`);
  assert.ok(instance.getBudgetUsage().voices <= FEEDBACK_LIMITS.killSounds, "ayni anda en fazla 4 oldurme sesi");
  // Sinir dolu: sampiyon yine calar, buyuk portal.
  const before = sources(context).length;
  assert.equal(instance.emit("kill", { own: true, x: 999, y: 0 }, CHAMPION, "champ").sound, true, "sampiyon her zaman");
  assert.equal(familyOf(sources(context).slice(before)[0].buffer.file), "portalLarge");
  // Sampiyon 70 ms araligina da takilmiyor.
  assert.equal(instance.emit("kill", { own: true, x: 998, y: 0 }, CHAMPION, "champ2").sound, true);

  // Arkadas: iki saniye boyunca 10/sn.
  advance(5000);
  let mates = 0;
  for (let index = 0; index < 20; index += 1) {
    if (instance.emit("kill", { own: false, x: index * 30, y: 50 }, LIGHT, `t${index}`).sound) mates += 1;
    advance(100);
  }
  assert.ok(mates <= samples.KILL_SOUND_LIMITS.teammatePerSecond * 2 && mates >= 2, `arkadas 2 sn'de ${mates}`);
  instance.destroy();

  // Butce: oldurme sesi yalnizca oldurme sesinin yerini aliyor; kritik ve arayuz onaylari kesilmiyor.
  const governor = new FeedbackGovernor();
  assert.equal(governor.admitSound("purchase", true, 0, 5000).play, true);
  assert.equal(governor.admitSound("equip", true, 0, 5000).play, true);
  assert.equal(governor.admitSound("crit", true, 0, 5000).play, true);
  for (let ms = 100; ms <= 1000; ms += 100) assert.equal(governor.admitSound("kill", true, ms, 600).play, true, `kendi oldurmesi ${ms}`);
  assert.equal(governor.activeVoices(1000), FEEDBACK_LIMITS.sounds, "butce dolu ama asilmiyor");
  assert.equal(governor.activeVoices(1700), 3, "oldurmeler bitti, arayuz sesleri hala caliyor");
  // Arayuz onayi dolu butcede bir oldurme sesinin yerini aliyor.
  for (let ms = 2000; ms < 2300; ms += 100) governor.admitSound("kill", true, ms, 2000);
  assert.equal(governor.activeVoices(2300), FEEDBACK_LIMITS.sounds);
  const pick = governor.admitSound("cardPick", true, 2300, 5000);
  assert.equal(pick.play && pick.steal, true);
  assert.equal(governor.activeVoices(4400), 4, "kurban bir oldurme sesiydi");
  // Yalnizca oldurmeler: en fazla killSounds kadar ayni anda.
  const kills = new FeedbackGovernor();
  for (let ms = 0; ms < 800; ms += 100) kills.admitSound("kill", true, ms, 2000);
  assert.equal(kills.activeVoices(800), FEEDBACK_LIMITS.killSounds);
  assert.ok(FEEDBACK_LIMITS.killSounds <= FEEDBACK_LIMITS.sounds - 2, "kritik ve arayuze en az iki yer");
  // Takim arkadasinin sampiyonu dolu arkadas butcesinde de calar.
  const team = new FeedbackGovernor();
  for (const kind of ["level", "place", "crit"]) team.admitSound(kind, true, 0, 5000);
  assert.equal(team.admitSound("kill", false, 10, 600).play, false, "arkadasin siradan oldurmesi duser");
  assert.equal(team.admitSound("kill", false, 20, 600, true).play, true, "arkadasin sampiyonu calar");
});

/* ------------------------------------------------------------------ */
/* Dosyalar                                                             */
/* ------------------------------------------------------------------ */

test("manifestteki her dosya diskte, sure ve boyut butcesinin altinda; lisans yaninda", () => {
  let total = 0;
  for (const entry of manifest.files) {
    const path = new URL(entry.file, sfxDir);
    assert.ok(existsSync(path), `${entry.file} diskte yok`);
    const bytes = statSync(path).size;
    assert.equal(bytes, entry.bytes, `${entry.file} manifestle ayni boyutta degil (yeniden uretin)`);
    const kill = entry.kill !== undefined;
    assert.ok(bytes <= (kill ? SFX_BUDGET.killBytes : SFX_BUDGET.hitBytes), `${entry.file} ${bytes} bayt`);
    const limit = kill ? MAX_PORTAL_SECONDS[entry.size] : entry.tick ? MAX_TICK_SECONDS : entry.cue ? MAX_CUE_SECONDS : MAX_HIT_SECONDS;
    assert.ok(entry.durationMs / 1000 <= limit + 0.005, `${entry.file} ${entry.durationMs} ms`);
    assert.ok(entry.midBandDb >= MIN_MID_BAND_DB, `${entry.file} telefon bandinda enerji yok (${entry.midBandDb} dB)`);
    assert.ok(entry.peakDb <= -0.5, `${entry.file} tepe ${entry.peakDb} dBFS`);
    assert.match(entry.file, /\.mp3$/, "her tarayicinin cozdugu bicim");
    total += bytes;
  }
  assert.equal(total, manifest.totalBytes);
  assert.ok(total <= SFX_BUDGET.totalBytes, `toplam ${total} bayt`);
  assert.deepEqual(manifest.budget, SFX_BUDGET, "manifest betigin butcesiyle");

  // Istemcinin istedigi her dosya manifestte; diskte fazladan ses yok.
  const wanted = new Set(samples.SAMPLE_FAMILY_IDS.flatMap((id) => samples.SAMPLE_FAMILIES[id].files));
  assert.deepEqual([...wanted].sort(), manifest.files.map((entry) => entry.file).sort());
  const onDisk = readdirSync(sfxDir).filter((name) => /\.(mp3|m4a|ogg|wav)$/.test(name)).sort();
  assert.deepEqual(onDisk, [...wanted].sort(), "diskteki sesler tam olarak istemcinin listesi");

  // Uretim betigi ayni dosyalari uretiyor.
  assert.deepEqual(RECIPES.map((recipe) => `${recipe.id}.mp3`).sort(), [...wanted].sort());
  for (const recipe of RECIPES) assert.equal(familyOf(`${recipe.id}.mp3`), recipe.family);

  const license = read("apps/web/public/audio/sfx/LICENSE.txt");
  assert.match(license, /CC0/);
  assert.match(license, /Kenney/);
  assert.match(license, /Impact Sounds/);
  assert.match(license, /Sci-Fi Sounds/);
});

/* ------------------------------------------------------------------ */
/* Cesit ve hiz                                                         */
/* ------------------------------------------------------------------ */

test("hiz kaymasi ve cesit sirasi deterministik, hafif; Math.random yok", async () => {
  const original = Math.random;
  Math.random = () => { throw new Error("Math.random kullanildi"); };
  try {
    assert.equal(samples.getSampleRateJitter("p1@2:3"), samples.getSampleRateJitter("p1@2:3"));
    assert.equal(samples.getSampleRateJitter(undefined), 1);
    let sum = 0;
    const rates = new Set();
    for (let index = 0; index < 400; index += 1) {
      const rate = samples.getSampleRateJitter(`p${index}@${index * 3}`);
      assert.ok(Math.abs(rate - 1) <= samples.SAMPLE_RATE_SPREAD + 1e-9, `${rate}`);
      assert.ok(samples.SAMPLE_RATE_SPREAD >= 0.03 && samples.SAMPLE_RATE_SPREAD <= 0.05);
      rates.add(rate.toFixed(4));
      sum += rate;
    }
    assert.ok(rates.size > 100, "ust uste gelen vuruslar ayni hizda degil");
    assert.ok(Math.abs(sum / 400 - 1) < 0.01, "ortalama kaymiyor");

    // Cesit art arda hic ayni degil.
    for (const count of [2, 3]) {
      let previous = -1;
      for (let index = 0; index < 200; index += 1) {
        const next = samples.nextSampleVariant(count, previous, `k${index}`);
        assert.ok(next >= 0 && next < count);
        assert.notEqual(next, previous, "ayni cesit art arda");
        previous = next;
      }
    }
    assert.equal(samples.nextSampleVariant(1, 0, "x"), 0);

    // Iki istemci ayni olaylarda ayni cesit ve hizi caliyor.
    const runs = [];
    for (let run = 0; run < 2; run += 1) {
      const { instance, context } = await makeDirector();
      for (let index = 0; index < 8; index += 1) {
        advance(1000);
        context.currentTime = index;
        instance.playHit("projectile", 1, true, `p${index}`);
      }
      runs.push(sources(context).map((node) => [node.buffer.file, node.playbackRate.value]));
      instance.destroy();
    }
    assert.deepEqual(runs[0], runs[1]);
    assert.ok(new Set(runs[0].map(([file]) => file)).size >= 2, "cesitler donuyor");
  } finally {
    Math.random = original;
  }
});

/* ------------------------------------------------------------------ */
/* Yonetmen: vurus                                                      */
/* ------------------------------------------------------------------ */

test("ornekler acilistan sonra bir kez yukleniyor; vurus kendi ailesinden bir kaynak ve bir kazancla", async () => {
  requested.length = 0;
  const { instance, context } = await makeDirector();
  const total = samples.SAMPLE_FAMILY_IDS.reduce((sum, id) => sum + samples.SAMPLE_FAMILIES[id].files.length, 0);
  assert.equal(context.decoded, total, "dosya basina bir cozme");
  assert.ok(requested.every((url) => url.startsWith(samples.SFX_SAMPLE_BASE_URL)));
  instance.unlockAudio();
  await instance.whenSamplesLoaded();
  assert.equal(context.decoded, total, "ikinci acilis yeniden yuklemiyor");

  for (const voice of hit.HIT_VOICE_IDS) {
    const before = context.created.length;
    advance(1000);
    context.currentTime += 1;
    assert.equal(instance.playHit(voice, 1, true, `k-${voice}`), true, voice);
    const made = context.created.slice(before);
    const played = made.filter((node) => node.kind === "bufferSource");
    assert.equal(played.length, 1, `${voice}: tek kaynak`);
    assert.equal(familyOf(played[0].buffer.file), voice, `${voice} kendi ailesini caliyor`);
    assert.equal(made.filter((node) => node.kind === "gain" && !isBus(node)).length, 1, `${voice}: tek kazanc`);
    assert.equal(made.filter((node) => node.kind === "oscillator" || node.kind === "filter").length, 0, `${voice}: sentez yok`);
    const gain = made.find((node) => node.kind === "gain");
    assert.ok(Math.abs(gain.gain.value - samples.SAMPLE_FAMILIES[voice].gain) < 1e-9);
    assert.equal(played[0].connections[0], gain);
  }
  instance.destroy();
});

test("kademe: sv 5-9 biraz yavas ve dolgun, sv 10 ayrica govde katmani; perde muzikal adim degil", async () => {
  const { instance, context } = await makeDirector();
  const play = (tier, key) => {
    advance(1000);
    context.currentTime += 1;
    const before = context.created.length;
    instance.playHit("impact", tier, true, key);
    return context.created.slice(before);
  };
  const one = play(1, "same");
  const two = play(2, "same");
  const three = play(3, "same");
  const rate = (nodes) => nodes.find((node) => node.kind === "bufferSource").playbackRate.value;
  const gain = (nodes) => nodes.find((node) => node.kind === "gain").gain.value;
  assert.ok(rate(two) < rate(one) && rate(three) < rate(two), "kademe yavaslatiyor");
  assert.ok(rate(three) / rate(one) > 0.9, "en fazla ~%7 (bir yarim tondan az)");
  assert.ok(gain(two) > gain(one) && gain(three) > gain(two));
  assert.ok(gain(three) / gain(one) <= 1.25, "ince");
  assert.equal(one.filter((node) => node.kind === "bufferSource").length, 1);
  assert.equal(two.filter((node) => node.kind === "bufferSource").length, 1);
  const heavy = three.filter((node) => node.kind === "bufferSource");
  assert.equal(heavy.length, 2, "sv 10 govde katmani");
  assert.equal(familyOf(heavy[1].buffer.file), "heft");
  assert.equal(heavy[1].connections[0], heavy[0].connections[0], "ayni kazanca bagli, ek dugum yok");
  instance.destroy();
});

test("butce orneklerle de gecerli: 6 ses, tur araligi, tikler, takim arkadasi kisik", async () => {
  advance();
  {
    const { instance, context } = await makeDirector();
    const ids = hit.HIT_VOICE_IDS;
    for (let index = 0; index < 6; index += 1) assert.equal(instance.playHit(ids[index], 1, true, `o${index}`), true);
    assert.equal(instance.playHit(ids[6], 1, true, "seventh"), false, "en fazla 6 ses");
    assert.equal(instance.getBudgetUsage().hitVoices, 6);
    assert.equal(sources(context).length, 6);

    clock += 2000;
    context.currentTime += 2;
    assert.equal(instance.playHit("projectile", 1, true, "a"), true);
    clock += 30;
    assert.equal(instance.playHit("projectile", 1, true, "b"), false, "ayni tur 70 ms'den sik degil");
    assert.equal(instance.playHit("slash", 1, true, "c"), true, "baska tur calar");
    clock += 2000;
    context.currentTime += 2;
    assert.equal(instance.playHit("focus", 1, true, "t1", true), true);
    clock += 100;
    assert.equal(instance.playHit("focus", 1, true, "t2", true), false, "tik 150 ms'de bir");

    clock += 2000;
    context.currentTime += 2;
    const before = context.created.length;
    assert.equal(instance.playHit("ball", 1, false, "mate"), true);
    const mateGain = context.created.slice(before).find((node) => node.kind === "gain");
    assert.ok(Math.abs(mateGain.gain.value - samples.SAMPLE_FAMILIES.ball.gain * hit.HIT_SOUND_LIMITS.teammateGain) < 1e-9, "arkadasin sesi kisik");
    instance.destroy();
  }
});

test("seviye 0, kapali baglam ya da gizli sekme: hic dugum yok", async () => {
  const { instance, context } = await makeDirector({ hitVolume: 0 });
  const before = context.created.length;
  for (const voice of hit.HIT_VOICE_IDS) assert.equal(instance.playHit(voice, 3, true, voice), false);
  assert.equal(instance.previewHit("impact", 3, true), false);
  assert.equal(context.created.length, before, "vurus seviyesi 0");
  instance.destroy();

  const muted = await makeDirector({ sfxVolume: 0 });
  const mutedBefore = muted.context.created.length;
  assert.equal(muted.instance.playHit("projectile", 1, true, "z"), false);
  assert.equal(muted.instance.emit("kill", { own: true }, HEAVY, "m").sound, false);
  assert.equal(muted.instance.previewKill(HEAVY), false);
  assert.equal(muted.context.created.length, mutedBefore, "Efektler 0: oldurme de vurus da sessiz");
  muted.instance.destroy();

  const hidden = await makeDirector();
  globalThis.document = { visibilityState: "hidden" };
  try {
    const count = hidden.context.created.length;
    assert.equal(hidden.instance.playHit("impact", 1, true, "h"), false);
    assert.equal(hidden.context.created.length, count, "gizli sekmede dugum yok");
  } finally {
    delete globalThis.document;
  }
  hidden.instance.destroy();
});

test("biten ornegin dugumleri ayriliyor: kaynak bitince ya da bir sonraki vurusta", async () => {
  const { instance, context } = await makeDirector();
  instance.playHit("projectile", 1, true, "a");
  const [first] = sources(context);
  const firstGain = first.connections[0];
  context.currentTime = 5;
  first.end();
  assert.equal(first.disconnected, true, "kaynak bitince ayrildi");
  assert.equal(firstGain.disconnected, true, "kazanc da");

  // Calan sesin erken gelen bitisi (sv 10'un kisa govdesi) sesi kesmiyor.
  context.currentTime = 10;
  advance(1000);
  instance.playHit("impact", 3, true, "b");
  const [main, heft] = sources(context).slice(1);
  heft.end();
  assert.equal(main.disconnected, false, "ana ornek hala caliyor");
  instance.destroy();
});

test("iki saat ayrisinca calan ornek kesilmiyor, sonduruluyor", async () => {
  advance();
  {
    const { instance, context } = await makeDirector();
    assert.equal(instance.playHit("projectile", 1, true, "a"), true);
    const gain = sources(context)[0].connections[0];
    clock += 5000;
    assert.equal(instance.playHit("impact", 1, true, "b"), true);
    assert.equal(gain.disconnected, false);
    assert.ok(gain.gain.events.some(([type, value]) => type === "lin" && value === 0), "sonduruldu");
    instance.destroy();
  }
});

test("onizleme ornegi caliyor, oyunun butcesinin disinda", async () => {
  advance();
  {
    const { instance, context } = await makeDirector();
    for (let index = 0; index < 6; index += 1) instance.playHit(hit.HIT_VOICE_IDS[index], 1, true, `o${index}`);
    assert.equal(instance.previewHit("curse", 3, true), true);
    const played = sources(context).slice(6);
    assert.equal(familyOf(played[0].buffer.file), "curse");
    assert.equal(familyOf(played[1].buffer.file), "heft", "Sv 10 dinlemesi govdeyle");
    assert.equal(instance.getBudgetUsage().hitVoices, 6, "onizleme yuva yemiyor");
    clock += director.HIT_PREVIEW_GAP_MS;
    assert.equal(instance.previewKill(HEAVY), true);
    const first = sources(context).at(-1);
    assert.equal(familyOf(first.buffer.file), "portalNormal", "galeri agir portali caliyor");
    // Galeri yogunluk sinirina takilmiyor; art arda basista A ve D sirayla.
    for (let index = 0; index < 8; index += 1) {
      clock += director.HIT_PREVIEW_GAP_MS;
      assert.equal(instance.previewKill(LIGHT), true, `galeri ${index}`);
    }
    const styles = sources(context).slice(-8).map(styleOf);
    assert.ok(styles.every((style, index) => index === 0 || style !== styles[index - 1]), styles.join(""));
    instance.destroy();
  }
});

/* ------------------------------------------------------------------ */
/* Oldurme ve altin                                                     */
/* ------------------------------------------------------------------ */

test("oldurme sesi dusmanin ailesinden; kombo perdeyi degistirmiyor", async () => {
  advance();
  {
    const rateAt = async (step) => {
      const { instance, context } = await makeDirector();
      const decision = instance.emit("kill", { own: true, step }, HEAVY, "same");
      assert.equal(decision.sound, true);
      const [source] = sources(context);
      assert.equal(familyOf(source.buffer.file), "portalNormal");
      const gain = source.connections[0].gain.value;
      instance.destroy();
      return { rate: source.playbackRate.value, gain };
    };
    const calm = await rateAt(0);
    const combo = await rateAt(9);
    assert.equal(combo.rate, calm.rate, "kombo perdeyi yukseltmiyor");
    assert.ok(combo.gain >= calm.gain && combo.gain / calm.gain <= 1.2, "kombo yalnizca biraz dolgun");

    // Zincir boyunca perde tirmanmiyor: hizlar +-4% icinde ve yukselen bir dizi degil.
    const { instance, context } = await makeDirector();
    for (let index = 0; index < 10; index += 1) {
      clock += 200;
      context.currentTime += 0.2;
      instance.emit("kill", { own: true, x: index * 50, y: 0 }, LIGHT, `c${index}`);
    }
    const rates = sources(context).filter(isPortal).map((node) => node.playbackRate.value);
    assert.equal(rates.length, 10);
    assert.ok(rates.every((rate) => Math.abs(rate - 1) <= samples.SAMPLE_RATE_SPREAD + 1e-9));
    assert.ok(rates.slice(1).some((rate, index) => rate < rates[index]), "tirmanan perde yok");
    assert.ok(sources(context).every((node) => familyOf(node.buffer.file) === "portalSmall"));

    // Takim arkadasinin oldurmesi kisik.
    clock += 5000;
    context.currentTime += 5;
    const before = sources(context).length;
    instance.emit("kill", { own: false }, LIGHT, "mate");
    const mate = sources(context).slice(before).find(isPortal).connections[0].gain.value;
    assert.ok(mate < samples.SAMPLE_FAMILIES.portalSmall.gain * 0.5, "arkadasin oldurmesi kisik");
    instance.destroy();
  }
});

test("ornek yokken de oldurme perdesi kombodan bagimsiz (sentez yedegi)", async () => {
  const freqs = async (step) => {
    const instance = new director.FeedbackDirector({ sfxVolume: 0.6, vibration: false, getCamera: () => undefined, loadSample: () => Promise.reject(new Error("yok")) });
    instance.unlockAudio();
    const context = FakeContext.instances.at(-1);
    await instance.whenSamplesLoaded();
    advance();
    instance.emit("kill", { own: true, step });
    const result = oscillators(context).map((node) => node.frequency.events.map(([, value]) => value));
    instance.destroy();
    return result;
  };
  const base = await freqs(0);
  assert.ok(base.length > 0, "sentez caliyor");
  assert.deepEqual(await freqs(5), base);
  assert.deepEqual(await freqs(10), base);
});

test("oldurme basina altin tinisi yok; altin yalnizca gorunuyor", async () => {
  assert.equal(FEEDBACK_KIND_RULES.coin.soundMs, 0, "altinin ses butcesi yok");
  const governor = new FeedbackGovernor();
  for (let now = 0; now < 1000; now += 50) {
    const decision = governor.decide("coin", { own: true, x: now, y: 0 }, now);
    assert.equal(decision.sound, false);
  }
  assert.ok(!director.getFeedbackSfxTones().some(({ kind }) => kind === "coin"), "altin tarifi yok");

  // Kendi oldurmen: oldurme sesi ve altin olayi; tek kaynak, tini yok.
  const { instance, context } = await makeDirector();
  instance.emit("kill", { own: true, x: 0, y: 0 }, LIGHT, "coin-kill");
  const coin = instance.emit("coin", { own: true, x: 0, y: -10 });
  assert.equal(coin.show, true, "+N sayisi yine cikiyor");
  assert.equal(coin.sound, false);
  assert.equal(sources(context).filter(isPortal).length, 1);
  assert.ok(sources(context).every(isPortal), "yalnizca oldurmenin portal sesi");
  assert.equal(oscillators(context).length, 0, "muzikal tini yok");

  // Savasta sik calan sentez seslerinde (oldurme yedegi, seviye, kademe) sabit nota yok: hepsi kayiyor.
  for (const { kind, tones } of director.getFeedbackSfxTones()) {
    if (!["kill", "level", "tier"].includes(kind)) continue;
    for (const tone of tones) assert.ok(tone.to !== undefined && tone.to !== tone.from, `${kind} sabit bir nota caliyor (${tone.from} Hz)`);
  }
  instance.destroy();
});

test("kritik ornekli; Efektler onizlemesi hafif oldurme sesi ve seyrek", async () => {
  advance();
  {
    const { instance, context } = await makeDirector();
    instance.emit("crit", { own: true, x: 0, y: 0 });
    assert.equal(familyOf(sources(context)[0].buffer.file), "crit");
    clock += 1000;
    assert.equal(instance.previewSfx(), true);
    assert.ok(sources(context).slice(1).some((node) => familyOf(node.buffer.file) === "portalSmall"));
    clock += 100;
    assert.equal(instance.previewSfx(), false, "surukleme: 250 ms dolmadan ikincisi yok");
    instance.destroy();
  }
});

/* ------------------------------------------------------------------ */
/* Yedek                                                                */
/* ------------------------------------------------------------------ */

test("cozme basarisizsa ses sentezle devam ediyor; hata firlamiyor", async () => {
  for (const mode of ["reject", "throw"]) {
    const { instance, context } = await makeDirector({}, mode);
    assert.equal(instance.hasSample("projectile"), false);
    assert.equal(instance.playHit("projectile", 1, true, "a"), true, `${mode}: vurus yine caliyor`);
    assert.equal(sources(context).filter((node) => node.buffer?.file).length, 0, "ornek yok");
    assert.ok(oscillators(context).length > 0, "sentez yedegi");
    assert.equal(instance.emit("kill", { own: true }, HEAVY, "f").sound, true);
    instance.destroy();
  }

  // Yukleyici yoksa ya da ag hatasi: ayni.
  const offline = await makeDirector({ loadSample: () => Promise.reject(new Error("ag")) });
  assert.equal(offline.instance.playHit("impact", 1, true, "x"), true);
  assert.ok(oscillators(offline.context).length > 0);
  offline.instance.destroy();

  // Yalnizca bir aile bozuksa digerleri ornekle.
  const partial = await makeDirector({}, "reject-impact");
  assert.equal(partial.instance.hasSample("impact"), false);
  assert.equal(partial.instance.hasSample("projectile"), true);
  partial.instance.playHit("impact", 1, true, "i");
  partial.context.currentTime += 1;
  advance(1000);
  partial.instance.playHit("projectile", 1, true, "p");
  assert.ok(oscillators(partial.context).length > 0, "carpma sentezle");
  assert.equal(familyOf(sources(partial.context).find((node) => node.buffer?.file)?.buffer.file), "projectile");
  partial.instance.destroy();

  // Eski Safari: decodeAudioData yalnizca geri cagirmayla.
  const legacy = await makeDirector({}, "callback");
  assert.equal(legacy.instance.hasSample("dart"), true);
  legacy.instance.destroy();
});

test("dosyalar dokunustan once iniyor, ilk dokunusta (askidaki baglamda da) cozuluyor", async () => {
  requested.length = 0;
  const fresh = new director.FeedbackDirector({ sfxVolume: 1, hitVolume: 1, vibration: false, getCamera: () => undefined, loadSample: fakeLoader });
  await Promise.resolve();
  await Promise.resolve();
  const total = samples.SAMPLE_FAMILY_IDS.reduce((sum, id) => sum + samples.SAMPLE_FAMILIES[id].files.length, 0);
  assert.equal(requested.length, total, "yonetmen kurulurken her dosya bir kez iniyor");
  assert.equal(fresh.playHit("projectile", 1, true, "d"), false, "dokunustan once ses yok");
  fresh.destroy();

  // Askidaki baglam: cozme kilit acilmasini beklemiyor; ayni veri yeniden indirilmiyor.
  requested.length = 0;
  const suspended = new director.FeedbackDirector({ sfxVolume: 1, vibration: false, getCamera: () => undefined, loadSample: fakeLoader });
  const originalResume = FakeContext.prototype.resume;
  FakeContext.prototype.resume = function resume() { return new Promise(() => undefined); };
  try {
    const context = new FakeContext();
    context.state = "suspended";
    window.AudioContext = function AudioContext() { return context; };
    suspended.unlockAudio();
    await suspended.whenSamplesLoaded();
    assert.equal(context.decoded, total, "askida da cozuldu");
    assert.equal(requested.length, total, "onceden inen veri kullanildi");
    assert.equal(suspended.hasSample("portalNormal"), true);
    assert.equal(suspended.hasSample("portalLarge"), true);
  } finally {
    FakeContext.prototype.resume = originalResume;
    window.AudioContext = FakeContext;
  }
  suspended.destroy();

  const bank = new samples.SampleBank(fakeLoader);
  await bank.load({});
  assert.equal(bank.has("projectile"), false, "decodeAudioData yoksa yukleme baslamiyor");
});

test("cozulurken ornekli sesler sessiz (eski sentez caliyor degil); gelince ornek", async () => {
  advance();
  const gates = [];
  const slowLoader = (url) => new Promise((resolve) => gates.push(() => resolve({ file: url.slice(url.lastIndexOf("/") + 1) })));
  const instance = new director.FeedbackDirector({ sfxVolume: 0.6, hitVolume: 0.5, vibration: false, getCamera: () => undefined, loadSample: slowLoader });
  instance.unlockAudio();
  const context = FakeContext.instances.at(-1);
  const kill = instance.emit("kill", { own: true, x: 0, y: 0 }, LIGHT, "early");
  assert.equal(kill.sound, false, "oldurme sessiz");
  assert.equal(kill.show, true, "gorsel yine karar aliyor");
  assert.equal(instance.playHit("impact", 1, true, "a"), false, "vurus sessiz");
  assert.equal(instance.emit("crit", { own: true, x: 9, y: 9 }).sound, false);
  assert.equal(instance.getBudgetUsage().voices, 0, "sessiz ses butceyi doldurmuyor");
  assert.equal(oscillators(context).length, 0, "sentez yok");
  // Yukleyici bir mikro gorevde cagriliyor; kapilar ondan sonra dolu.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(gates.length, samples.SAMPLE_FAMILY_IDS.reduce((sum, id) => sum + samples.SAMPLE_FAMILIES[id].files.length, 0));
  for (const open of gates) open();
  await instance.whenSamplesLoaded();
  advance();
  assert.equal(instance.emit("kill", { own: true, x: 50, y: 0 }, HEAVY, "late").sound, true);
  assert.deepEqual(sources(context).map((node) => familyOf(node.buffer.file)), ["portalNormal"]);
  instance.destroy();
});

test("gelmeyen dosya sonraki dokunusta yeniden deneniyor, en fazla 3 kez", async () => {
  let attempts = 0;
  let healthy = false;
  const flaky = (url) => {
    attempts += 1;
    return healthy ? fakeLoader(url) : Promise.reject(new Error("ag"));
  };
  const { instance, context } = await makeDirector({ loadSample: flaky });
  assert.equal(instance.hasSample("projectile"), false);
  advance();
  assert.equal(instance.playHit("projectile", 1, true, "a"), true, "basarisizlikta sentez");
  assert.ok(oscillators(context).length > 0);
  healthy = true;
  instance.unlockAudio();
  await instance.whenSamplesLoaded();
  assert.equal(instance.hasSample("projectile"), true, "ikinci dokunusta geldi");
  instance.destroy();

  const bank = new samples.SampleBank(() => Promise.reject(new Error("bozuk")));
  const decodeOnly = { decodeAudioData: () => Promise.resolve({ duration: 0.1 }) };
  for (let round = 0; round < 6; round += 1) await bank.load(decodeOnly);
  assert.equal(bank.retryable, false, "en fazla SAMPLE_MAX_ATTEMPTS deneme");
  assert.equal(samples.SAMPLE_MAX_ATTEMPTS, 3);
  assert.ok(attempts > 0);
});

test("bastaki kodlayici dolgusu atlaniyor: kaynak ilk duyulan ornekten basliyor", async () => {
  const rate = 44100;
  const padded = (lead) => {
    const data = new Float32Array(rate / 10);
    data.fill(0.3, lead);
    return { duration: data.length / rate, sampleRate: rate, getChannelData: () => data };
  };
  assert.equal(samples.findSampleLead(padded(1105)), 1105 / rate, "MP3 dolgusu kirpilmamis");
  assert.equal(samples.findSampleLead(padded(0)), 0, "tarayici kirpmis");
  assert.equal(samples.findSampleLead({ duration: 0.1 }), 0, "kanal okunamazsa 0");

  const loader = (url) => Promise.resolve({ file: url.slice(url.lastIndexOf("/") + 1) });
  const instance = new director.FeedbackDirector({ sfxVolume: 0.6, hitVolume: 0.5, vibration: false, getCamera: () => undefined, loadSample: loader });
  const original = FakeContext.prototype.decodeAudioData;
  FakeContext.prototype.decodeAudioData = function decodeAudioData(data) {
    return Promise.resolve({ ...padded(1105), file: data.file });
  };
  try {
    instance.unlockAudio();
    await instance.whenSamplesLoaded();
  } finally {
    FakeContext.prototype.decodeAudioData = original;
  }
  const context = FakeContext.instances.at(-1);
  advance();
  instance.playHit("projectile", 1, true, "p");
  instance.emit("kill", { own: true }, HEAVY, "lead");
  for (const source of sources(context)) assert.ok(Math.abs(source.offset - 1105 / rate) < 1e-9, "dolgu atlandi");
  instance.destroy();
});

/* ------------------------------------------------------------------ */
/* Baglanti                                                            */
/* ------------------------------------------------------------------ */

test("oyun ve galeri baglantisi: oldurme ailesi dusmandan, kaydirici onizlemesi, galeride oldurme sesleri", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  const kill = scene.slice(scene.indexOf("private playKillConfirmation("), scene.indexOf("private playKillCoin("));
  assert.ok(/emit\("kill",[\s\S]*getKillSoundCue\(trace\.type, trace\.air, trace\.champion\), event\.enemyId\)/.test(kill), "oldurme sesi dusmanin agirligindan, sampiyonlugundan ve kimliginden");
  assert.ok(/air: Boolean\(mover\.air\),\s*champion: Boolean\(mover\.crown\)/.test(scene), "iz havayi ve sampiyonu tasiyor");
  assert.ok(!scene.includes('playSfx("coin"'), "altin tinisi hicbir yerde calinmiyor");
  assert.ok(scene.includes("this.feedback?.previewSfx()"), "Efektler kaydiricisi onizlemesi");

  const gallery = read("apps/web/src/scenes/VfxGalleryScene.ts");
  assert.ok(gallery.includes("GALLERY_KILL_CUES"), "secicide oldurme portal sesleri");
  assert.ok(gallery.includes("previewKill("), "Sv dugmeleri oldurme sesini caliyor");
});
