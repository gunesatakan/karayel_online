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
 * - Oldurme sesi kombo ile tirmanmiyor; oldurme basina muzikal tini yok.
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
const { RECIPES, SFX_BUDGET, MAX_HIT_SECONDS, MAX_BODY_SECONDS, MAX_VOICE_SECONDS, MAX_TICK_SECONDS, MAX_CUE_SECONDS, MIN_MID_BAND_DB } = await import("../tools/build-sfx.mjs");
const { towerCatalog, FEEDBACK_KIND_RULES, FeedbackGovernor } = await import("../packages/shared/dist/index.js");

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
/** Oldurme sesleri: meka hafif (er), agir (kaba), ucan (kosucu). */
const LIGHT = samples.getKillSoundCue("grunt", "meka");
const HEAVY = samples.getKillSoundCue("brute", "meka");
const isBody = (node) => familyOf(node.buffer?.file)?.startsWith("body");
const isVoice = (node) => familyOf(node.buffer?.file)?.startsWith("voice");
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
  // Oldurme: govde eski oldurme seviyesinde (hafif ~0.2, agir ~0.3), olum sesi onun altinda.
  const ranges = [["bodyLight", 0.15, 0.22], ["bodyAir", 0.15, 0.22], ["bodyHeavy", 0.22, 0.3], ["crit", 0.1, 0.2], ["execute", 0.2, 0.3]];
  for (const family of samples.KILL_VOICE_FAMILIES) {
    ranges.push(family.endsWith("Heavy") ? [family, 0.14, 0.22] : [family, 0.1, 0.16]);
  }
  for (const [id, low, high] of ranges) {
    const peak = effectivePeak(id);
    assert.ok(peak >= low && peak <= high, `${id} etkin tepe ${peak.toFixed(3)} (${low}-${high})`);
  }
  for (const voice of samples.KILL_VOICE_FAMILIES) {
    const rms = Math.max(...samples.SAMPLE_FAMILIES[voice].files.map((file) => 10 ** (manifestByFile.get(file).rmsDb / 20)));
    assert.ok(samples.SAMPLE_FAMILIES[voice].gain * rms <= 0.046, `${voice} RMS cok yuksek`);
  }
  assert.ok(effectivePeak("bodyHeavy") > effectivePeak("bodyLight"), "agir govde hafiften dolgun");
  // Iki katmanin tepeleri ust uste gelse bile en agir oldurme 0.5'i asmiyor.
  for (const race of samples.ENEMY_RACES) {
    const cue = samples.getKillSoundCue("brute", race, false, true);
    assert.ok(effectivePeak(cue.body) + effectivePeak(cue.voice) <= 0.5, `${race} agir oldurme cok yuksek`);
  }
  // Vurus kanali varsayilan 0.5: en yuksek vurus Efektler'de hafif oldurme govdesinden kisik ama yarisindan yuksek.
  const loudestHit = Math.max(...hit.HIT_VOICE_IDS.map((voice) => effectivePeak(voice))) * 0.5;
  assert.ok(loudestHit < effectivePeak("bodyLight") && loudestHit > effectivePeak("bodyLight") * 0.5);
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

test("oldurme butcede en uzun katmanin suresiyle; arkadasinki kisik ve kisa sesli", async () => {
  const { instance, context } = await makeDirector();
  advance();
  instance.emit("kill", { own: true, x: 0, y: 0 }, HEAVY, "h1");
  const layers = sources(context);
  assert.deepEqual(layers.map((node) => familyOf(node.buffer.file)), ["bodyHeavy", "voiceMekaHeavy"], "agir oldurme: govde ve derin ses");
  advance(400);
  assert.equal(instance.getBudgetUsage().voices, 1, "agir oldurme 400 ms sonra hala butcede (ses 420 ms)");
  advance(200);
  assert.equal(instance.getBudgetUsage().voices, 0);
  assert.equal(FEEDBACK_KIND_RULES.kill.soundMs, 120, "kural yalnizca sentez yedegi icin");

  advance();
  const before = sources(context).length;
  const mate = instance.emit("kill", { own: false, x: 90, y: 0 }, HEAVY, "m1");
  assert.equal(mate.sound, true);
  const played = sources(context).slice(before);
  const body = played.find(isBody);
  assert.ok(body.connections[0].gain.value < samples.SAMPLE_FAMILIES.bodyHeavy.gain * 0.5, "arkadasin govdesi kisik");
  for (const node of played.filter(isVoice)) assert.ok(familyOf(node.buffer.file).endsWith("Light"), "arkadasin sesi hep kisa");

  // Normal co-op yogunlugu: saniyede ~3 arkadas oldurmesi ve senin 1 oldurmen; arkadasinkiler duyuluyor.
  advance();
  let mates = 0;
  let mateHeard = 0;
  for (let ms = 0; ms < 3000; ms += 50) {
    if (ms % 1000 === 0) instance.emit("kill", { own: true, x: ms, y: 5 }, LIGHT, `o${ms}`);
    if (ms % 350 === 0) {
      mates += 1;
      if (instance.emit("kill", { own: false, x: ms, y: 40 }, ms % 700 === 0 ? HEAVY : LIGHT, `t${ms}`).sound) mateHeard += 1;
    }
    advance(50);
  }
  assert.ok(mateHeard >= mates * 0.8, `${mateHeard}/${mates} arkadas oldurmesi duyuldu`);
  instance.destroy();
});

test("her irk x agirlik x hava x sampiyon organik bir govde ve olum sesine iniyor", () => {
  const types = ["grunt", "runner", "shooter", "brute", "siege"];
  for (const race of samples.ENEMY_RACES) {
    for (const type of types) {
      for (const air of [false, true]) {
        for (const champion of [false, true]) {
          const cue = samples.getKillSoundCue(type, race, air, champion);
          const heavy = type === "brute" || type === "siege";
          assert.equal(cue.body, heavy ? "bodyHeavy" : air ? "bodyAir" : "bodyLight", `${race}/${type}/${air}`);
          assert.ok(samples.KILL_VOICE_FAMILIES.includes(cue.voice) && samples.KILL_VOICE_FAMILIES.includes(cue.teammateVoice));
          if (heavy || champion) {
            assert.equal(cue.voice, `voice${race[0].toUpperCase()}${race.slice(1)}Heavy`, "agir ve sampiyon irkin derin sesi");
            assert.equal(cue.forceVoice, true);
          } else {
            assert.equal(cue.voice, air ? "voiceAir" : `voice${race[0].toUpperCase()}${race.slice(1)}Light`);
            assert.equal(cue.forceVoice, false);
          }
          assert.ok(!cue.teammateVoice.endsWith("Heavy") || champion, "arkadasin sesi kisa");
          assert.equal(samples.getKillSoundCue(type, race, air, champion), cue, "onceden kurulmus, oldurme basina nesne yok");
        }
      }
    }
  }
  assert.equal(samples.getKillSoundCue("grunt", undefined), LIGHT, "irk bilinmiyorsa meka");
  // Galeri: irk x (hafif, agir) ve hava.
  assert.equal(samples.GALLERY_KILL_CUES.length, samples.ENEMY_RACES.length * 2 + 1);
  assert.ok(samples.GALLERY_KILL_CUES.some((entry) => entry.label === "Ölüm: böcek (hafif)"));
});

test("oldurmede metal ya da patlama yok: govde ezilme paketinden, ses yaratik paketlerinden", () => {
  for (const family of samples.KILL_SOUND_FAMILIES) {
    for (const file of samples.SAMPLE_FAMILIES[family].files) {
      const entry = manifestByFile.get(file);
      assert.doesNotMatch(entry.source, /metal|explosion|crunch|glass|plate|impact\/|scifi\/|tin|bell/i, `${file}: ${entry.source}`);
      if (family.startsWith("body")) assert.match(entry.source, /^squish\//, `${file} govde ezilme paketinden`);
      else assert.match(entry.source, /^creature[12]\//, `${file} ses yaratik paketlerinden`);
      // Komik ya da insan sesleri yok.
      assert.doesNotMatch(entry.source, /cute|burp|cough|snore|nose|bark|human|ooh|eat_/, `${file}: ${entry.source}`);
      assert.equal(entry.layer, family.startsWith("body") ? "body" : "voice");
    }
  }
  for (const name of readdirSync(sfxDir)) assert.doesNotMatch(name, /^kill-(light|heavy|air)-/, `eski oldurme dosyasi kaldi: ${name}`);
});

test("olum sesi seyrek ve deterministik: kendi ~3/sn, arkadas ~1/sn; agir ve sampiyon her zaman", () => {
  const original = Math.random;
  Math.random = () => { throw new Error("Math.random kullanildi"); };
  try {
    const run = () => {
      const gate = new samples.KillVoiceGate();
      const log = [];
      // On saniye: saniyede 12 kendi, 12 arkadas oldurmesi (kalabalik dalga).
      for (let ms = 0; ms < 10_000; ms += 40) {
        for (const own of [true, false]) {
          const key = `${own ? "o" : "t"}${ms}`;
          if (gate.check(own, LIGHT, key, ms)) {
            gate.commit(own, ms);
            log.push([own, ms]);
          }
        }
      }
      return log;
    };
    const first = run();
    assert.deepEqual(run(), first, "ayni oldurmeler ayni sesler");
    const own = first.filter(([mine]) => mine).length;
    const mate = first.filter(([mine]) => !mine).length;
    assert.ok(own <= 31 && own >= 15, `kendi: 10 sn'de ${own} ses`);
    assert.ok(mate <= 10 && mate >= 4, `arkadas: 10 sn'de ${mate} ses`);
    for (let index = 1; index < first.length; index += 1) {
      assert.ok(first[index][1] - first[index - 1][1] >= samples.KILL_VOICE_LIMITS.minGapMs, "iki ses ust uste binmiyor");
    }

    // Agir dusman: her biri (araliklar en az 120 ms); sampiyon araliga da bakmiyor.
    const gate = new samples.KillVoiceGate();
    for (let ms = 0; ms < 3000; ms += 150) {
      assert.equal(gate.check(true, HEAVY, `h${ms}`, ms), true, `agir oldurme ${ms}`);
      gate.commit(true, ms);
    }
    const champion = samples.getKillSoundCue("grunt", "golem", false, true);
    assert.equal(gate.check(true, champion, "c", 2851), true, "sampiyon hemen arkasindan da");
    assert.equal(gate.check(false, champion, "c2", 2852), true, "arkadasin sampiyonu da");
    assert.equal(gate.check(false, HEAVY, "x", 2900), false, "arkadasin agir oldurmesi seyreltiliyor");
  } finally {
    Math.random = original;
  }
});

test("yonetmende: govde her oldurmede, ses seyrek; agir oldurme hep sesli", async () => {
  const { instance, context } = await makeDirector();
  advance();
  let bodies = 0;
  for (let index = 0; index < 40; index += 1) {
    if (instance.emit("kill", { own: true, x: index * 20, y: 0 }, LIGHT, `k${index}`).sound) bodies += 1;
    advance(80);
  }
  assert.equal(sources(context).filter(isBody).length, bodies, "her calan oldurmede govde");
  const voices = sources(context).filter(isVoice).length;
  assert.ok(voices > 0 && voices <= Math.ceil((40 * 80) / samples.KILL_VOICE_LIMITS.ownGapMs), `${voices} ses / ${bodies} oldurme`);

  advance();
  for (let index = 0; index < 5; index += 1) {
    const before = sources(context).length;
    assert.equal(instance.emit("kill", { own: true, x: index * 40, y: 99 }, HEAVY, `b${index}`).sound, true);
    assert.equal(sources(context).slice(before).filter(isVoice).length, 1, "agir oldurme sesli");
    advance(400);
  }
  instance.destroy();
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
    const kill = entry.layer !== undefined;
    assert.ok(bytes <= (kill ? SFX_BUDGET.killBytes : SFX_BUDGET.hitBytes), `${entry.file} ${bytes} bayt`);
    const limit = entry.layer === "body" ? MAX_BODY_SECONDS : entry.layer === "voice" ? MAX_VOICE_SECONDS : entry.cue ? MAX_CUE_SECONDS : MAX_HIT_SECONDS;
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
    assert.deepEqual(sources(context).slice(-2).map((node) => familyOf(node.buffer.file)), ["bodyHeavy", "voiceMekaHeavy"], "galeri govde ve sesi birlikte caliyor");
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
      assert.equal(familyOf(source.buffer.file), "bodyHeavy");
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
    const rates = sources(context).filter(isBody).map((node) => node.playbackRate.value);
    assert.equal(rates.length, 10);
    assert.ok(rates.every((rate) => Math.abs(rate - 1) <= samples.SAMPLE_RATE_SPREAD + 1e-9));
    assert.ok(rates.slice(1).some((rate, index) => rate < rates[index]), "tirmanan perde yok");
    assert.ok(sources(context).every((node) => ["bodyLight", "voiceMekaLight"].includes(familyOf(node.buffer.file))));

    // Takim arkadasinin oldurmesi kisik.
    clock += 5000;
    context.currentTime += 5;
    const before = sources(context).length;
    instance.emit("kill", { own: false }, LIGHT, "mate");
    const mate = sources(context).slice(before).find(isBody).connections[0].gain.value;
    assert.ok(mate < samples.SAMPLE_FAMILIES.bodyLight.gain * 0.5, "arkadasin oldurmesi kisik");
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
  assert.equal(sources(context).filter(isBody).length, 1);
  assert.ok(sources(context).every((node) => isBody(node) || isVoice(node)), "yalnizca oldurmenin katmanlari");
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
    assert.ok(sources(context).slice(1).some((node) => familyOf(node.buffer.file) === "bodyLight"));
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
    assert.equal(suspended.hasSample("bodyHeavy"), true);
    assert.equal(suspended.hasSample("voiceGolemHeavy"), true);
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
  assert.deepEqual(sources(context).map((node) => familyOf(node.buffer.file)), ["bodyHeavy", "voiceMekaHeavy"]);
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
  assert.ok(/emit\("kill",[\s\S]*getKillSoundCue\(trace\.type, trace\.race, trace\.air, trace\.champion\), event\.enemyId\)/.test(kill), "oldurme sesi dusmanin agirligindan, irkindan ve kimliginden");
  assert.ok(/race: mover\.race,\s*champion: Boolean\(mover\.crown\)/.test(scene), "iz irki ve sampiyonu tasiyor");
  assert.ok(!scene.includes('playSfx("coin"'), "altin tinisi hicbir yerde calinmiyor");
  assert.ok(scene.includes("this.feedback?.previewSfx()"), "Efektler kaydiricisi onizlemesi");

  const gallery = read("apps/web/src/scenes/VfxGalleryScene.ts");
  assert.ok(gallery.includes("GALLERY_KILL_CUES"), "secicide irk ve agirlik oldurme sesleri");
  assert.ok(gallery.includes("previewKill("), "Sv dugmeleri oldurme sesini caliyor");
});
