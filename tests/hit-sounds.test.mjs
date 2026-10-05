/**
 * Vurus sesleri.
 *
 * Her vurus turunun (ve turu olmayan kulelerin siluetinin) kendi sesi var:
 * asil ses kayitli bir ornek ailesi (tests/sfx-samples.test.mjs), buradaki
 * sentez tarifleri ornekler yuklenmeden once ya da yuklenemezse calan
 * yedek. Bu dosyadaki yonetmen baglaminda `decodeAudioData` yok, yani her
 * vurus yedek yoldan geciyor. Oyunun en sik sesi oldugu icin butcesi sert:
 *
 * - Her HitType ve vurus turu olmayan her saldiran kule bir sese iniyor;
 *   hicbiri sessiz ya da tek bir genel seste degil.
 * - Sesler birbirinden ve odul/arayuz seslerinden ayirt edilebilir.
 * - Ayni anda en fazla 6 ses, tur basina 70 ms, tik tur basina 150 ms;
 *   takim arkadasi kisik ve ilk o dusuyor.
 * - Seviye 0 ise hic ses dugumu kurulmuyor; sekme gizliyse ya da baglam
 *   acik degilse de.
 * - Kademe katman ekliyor; perde kaymasi olay kimliginden, deterministik.
 *
 * Ses sahte bir AudioContext ile olculuyor: kurulan her dugum kayitli.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const hit = await importWebModule("apps/web/src/hit-sounds.ts");
const director = await importWebModule("apps/web/src/feedback-director.ts");
const codex = await importWebModule("apps/web/src/codex.ts");
const profiles = await importWebModule("apps/web/src/vfx/vfx-profiles.ts");
const { towerCatalog, GAME_SPEED_MULTIPLIER, MELIS_CURSE_POOL_TICK_MS, ZEYNEP_SYNTHESIS_BURN_TICK_MS } = await import("../packages/shared/dist/index.js");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

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
}

class FakeContext {
  static instances = [];
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = { kind: "destination" };
    this.created = [];
    FakeContext.instances.push(this);
  }
  createOscillator() {
    const node = new FakeSource(this, "oscillator");
    node.type = "sine";
    node.frequency = new FakeParam(440);
    node.detune = new FakeParam(0);
    return node;
  }
  createGain() {
    const node = new FakeNode(this, "gain");
    node.gain = new FakeParam(1);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeNode(this, "filter");
    node.type = "lowpass";
    node.frequency = new FakeParam(350);
    node.Q = new FakeParam(1);
    return node;
  }
  createBufferSource() {
    const node = new FakeSource(this, "bufferSource");
    node.buffer = null;
    return node;
  }
  createDynamicsCompressor() {
    const node = new FakeNode(this, "compressor");
    for (const key of ["threshold", "knee", "ratio", "attack", "release"]) node[key] = new FakeParam(0);
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    this.buffers = (this.buffers ?? 0) + 1;
    const data = new Float32Array(length);
    return { numberOfChannels: channels, length, sampleRate, getChannelData: () => data };
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  close() { this.state = "closed"; return Promise.resolve(); }
}

globalThis.window = { AudioContext: FakeContext };

function makeDirector(options = {}) {
  const instance = new director.FeedbackDirector({ sfxVolume: 0.6, hitVolume: 0.5, vibration: false, getCamera: () => undefined, ...options });
  instance.unlockAudio();
  const context = FakeContext.instances.at(-1);
  return { instance, context };
}

/** Sesin kendi kazanc dugumu: vurus kanalina (o da Efektler'e) bagli olan. */
function voiceGains(context) {
  return context.created.filter((node) => node.kind === "gain"
    && node.connections[0]?.kind === "gain"
    && node.connections[0].connections[0]?.kind === "gain"
    && node.connections[0].connections[0].connections[0]?.kind === "compressor");
}

/* ------------------------------------------------------------------ */
/* Kapsam                                                              */
/* ------------------------------------------------------------------ */

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

test("her vurus turunun kendi sesi var; 'none' disinda hicbiri eksik degil", () => {
  const hitTypes = Object.keys(codex.hitTypeCodex).filter((type) => type !== "none");
  assert.equal(hitTypes.length, 8);
  for (const type of hitTypes) {
    assert.ok(hit.HIT_VOICE_IDS.includes(type), `${type} bir ses olmali`);
    for (const tier of [1, 2, 3]) {
      assert.ok(hit.getHitVoiceRecipe(type, tier).length > 0, `${type} kademe ${tier} tarifi bos`);
    }
    assert.equal(hit.HIT_VOICE_LABELS[type], codex.hitTypeCodex[type].name, `${type} adi kodeksten`);
  }
});

test("her saldiran kule bir sese iniyor; vurus turu olanlar kendi turune", () => {
  assert.equal(attacking.length, 40, "galerideki 40 saldiran kule");
  for (const definition of attacking) {
    const voice = hit.resolveHitVoice(definition.id);
    assert.ok(voice, `${definition.id} sessiz kalmamali`);
    if (definition.hitType && definition.hitType !== "none") {
      assert.equal(voice, definition.hitType, `${definition.id} kendi vurus turunu calmali`);
    }
  }
});

test("vurus turu olmayan kuleler siluetlerinden ses aliyor, tek bir genel seste degil", () => {
  const stubs = attacking.filter((definition) => !definition.hitType || definition.hitType === "none");
  assert.ok(stubs.length >= 18, `${stubs.length} turu olmayan kule`);
  const voices = new Set();
  for (const definition of stubs) {
    const voice = hit.resolveHitVoice(definition.id);
    const profile = profiles.getVfxProfile(definition.id, definition.color);
    assert.equal(voice, hit.getProfileHitVoice(profile), `${definition.id} profilden turemeli`);
    voices.add(voice);
  }
  assert.equal(hit.resolveHitVoice("mage-1"), "orb");
  assert.equal(hit.resolveHitVoice("healer-3"), "ring");
  assert.equal(hit.resolveHitVoice("tank-6"), "ball");
  assert.equal(hit.resolveHitVoice("onur-4"), "dart");
  assert.ok(voices.size >= 4, `turu olmayan kuleler ${voices.size} farkli seste`);
  // Profilin her siluet ve carpma dili bir sese iniyor.
  for (const silhouette of ["dart", "orb", "ball", "ring", "sprite", "combat", "none"]) {
    for (const impact of ["fragments", "brackets", "collapse", "bolt", "splash", "shatter", "curse", "ripple", "slash"]) {
      assert.ok(hit.HIT_VOICE_IDS.includes(hit.getProfileHitVoice({ silhouette, impact })));
    }
  }
});

test("ozel atis kimlikleri kulenin sesine; kule olmayan isinlar sessiz", () => {
  assert.equal(hit.resolveHitVoice("archer-6-whisper"), "wave");
  assert.equal(hit.resolveHitVoice("archer-3-curse-burst"), "curse");
  assert.equal(hit.resolveHitVoice("archer-4-underworld-link"), "focus");
  assert.equal(hit.resolveHitVoice("zeynep-3-kin-projectile"), "impact");
  assert.equal(hit.resolveHitVoice("warrior-5"), "focus", "Debug Lazer odak nabzi");
  assert.equal(hit.resolveHitVoice("onur-1"), "slash", "Testere kesme");
  assert.equal(hit.resolveHitVoice("enemy-shot"), undefined);
  assert.equal(hit.resolveHitVoice("zeynep-ultimate-column"), undefined);
  assert.equal(hit.resolveHitVoice("onur-sympathy"), undefined);
  assert.equal(hit.resolveHitVoice("warrior-7"), undefined, "kaynak binasi vurmaz");
  assert.equal(hit.resolveHitVoice(undefined), undefined);
});

/* ------------------------------------------------------------------ */
/* Ayirt edilebilirlik                                                 */
/* ------------------------------------------------------------------ */

function fingerprint(layers) {
  const lead = layers[0];
  const kinds = [...new Set(layers.map((layer) => (layer.type === "noise" ? `noise:${layer.filter}` : `osc:${layer.wave}`)))].sort().join(",");
  const end = layers.reduce((max, layer) => Math.max(max, layer.at + layer.dur), 0);
  return {
    kinds,
    lead: lead.type === "noise" ? `noise:${lead.filter}` : `osc:${lead.wave ?? lead.type}`,
    octave: Math.round(Math.log2(lead.from)),
    sweep: lead.to === undefined ? "flat" : lead.to > lead.from ? "up" : "down",
    length: Math.round(end / 0.03),
    soft: layers.some((layer) => (layer.attack ?? 0.002) >= 0.015),
    noise: layers.some((layer) => layer.type === "noise")
  };
}

function differences(a, b) {
  return Object.keys(a).filter((key) => a[key] !== b[key]);
}

test("vurus sesleri ikiser ikiser ayri: dalga, perde, zarf ve gurultu", () => {
  const ids = hit.HIT_VOICE_IDS;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = hit.getHitVoiceRecipe(ids[i], 1);
      const b = hit.getHitVoiceRecipe(ids[j], 1);
      assert.notDeepEqual(a, b);
      const diff = differences(fingerprint(a), fingerprint(b));
      assert.ok(diff.length >= 2, `${ids[i]} ile ${ids[j]} yalnizca ${diff.join(",") || "hicbir"} ozellikte ayrisiyor`);
    }
  }
});

test("vurus sesleri kisa (40-160 ms) ve odul/arayuz seslerinden ayri", () => {
  for (const id of hit.HIT_VOICE_IDS) {
    const seconds = hit.getHitVoiceDuration(id, 1);
    assert.ok(seconds >= 0.04 && seconds <= 0.16, `${id} ${seconds} sn`);
    assert.ok(hit.getHitVoiceDuration(id, 3) <= 0.23, `${id} sv 10 kuyrugu kisa kalmali`);
  }
  const sfx = director.getFeedbackSfxTones();
  assert.ok(sfx.length > 10);
  for (const id of hit.HIT_VOICE_IDS) {
    const voice = fingerprint(hit.getHitVoiceRecipe(id, 1));
    for (const { kind, tones } of sfx) {
      const other = fingerprint(tones.map((tone) => ({ type: "osc", ...tone })));
      const diff = differences(voice, other);
      assert.ok(diff.length >= 2, `${id} ile '${kind}' yalnizca ${diff.join(",") || "hicbir"} ozellikte ayrisiyor`);
    }
  }
});

test("kademe katman ekliyor: sv 5-9 bir katman, sv 10 bir katman daha; taban ayni", () => {
  for (const id of hit.HIT_VOICE_IDS) {
    const one = hit.getHitVoiceRecipe(id, 1);
    const two = hit.getHitVoiceRecipe(id, 2);
    const three = hit.getHitVoiceRecipe(id, 3);
    assert.ok(two.length > one.length, `${id} sv 5 katman eklemeli`);
    assert.ok(three.length > two.length, `${id} sv 10 katman eklemeli`);
    assert.deepEqual(two.slice(0, one.length), [...one], `${id} sv 5 tabani korumali`);
    assert.deepEqual(three.slice(0, two.length), [...two], `${id} sv 10 sv 5'i korumali`);
    // Kademe ince: eklenen katman tabanin en guclu katmanindan kisik.
    const loudest = Math.max(...one.map((layer) => layer.gain));
    for (const layer of three.slice(one.length)) {
      assert.ok(layer.gain < loudest, `${id} kademe katmani tabandan baskin`);
    }
    assert.ok(Object.isFrozen(one) && Object.isFrozen(one[0]), "tarifler vurus basina kopyalanmiyor");
    assert.equal(hit.getHitVoiceRecipe(id, 2), two, "ayni tarif nesnesi, vurus basina yeni dizi yok");
    assert.equal(hit.getHitVoiceRecipe(id, undefined), one, "kademe yazilmayan (sv 1-4) mermi");
  }
});

/* ------------------------------------------------------------------ */
/* Butce                                                               */
/* ------------------------------------------------------------------ */

test("ayni anda en fazla 6 vurus sesi", () => {
  const governor = new hit.HitSoundGovernor();
  let admitted = 0;
  for (const id of hit.HIT_VOICE_IDS) {
    if (governor.admit(id, true, false, 200, 0) >= 0) admitted += 1;
  }
  assert.equal(admitted, hit.HIT_SOUND_LIMITS.voices);
  assert.equal(governor.activeVoices(1), 6);
  // Sesler bitince butce bosaliyor.
  assert.ok(governor.admit("projectile", true, false, 50, 201) >= 0);
});

test("tur basina aralik: ayni tur 70 ms'den sik calmiyor, baska tur calabiliyor", () => {
  const governor = new hit.HitSoundGovernor();
  assert.ok(governor.admit("projectile", true, false, 10, 0) >= 0);
  assert.equal(governor.admit("projectile", true, false, 10, 50), -1);
  assert.ok(governor.admit("impact", true, false, 10, 50) >= 0, "baska tur kendi araliginda");
  assert.ok(governor.admit("projectile", true, false, 10, 71) >= 0);
  // Saniyede en fazla ~14 ayni tur.
  const fresh = new hit.HitSoundGovernor();
  let played = 0;
  for (let now = 0; now < 1000; now += 10) if (fresh.admit("slash", true, false, 5, now) >= 0) played += 1;
  assert.ok(played <= Math.ceil(1000 / hit.HIT_SOUND_LIMITS.gapMs), `${played} kesme sesi`);
  assert.ok(hit.HIT_SOUND_LIMITS.gapMs >= 60 && hit.HIT_SOUND_LIMITS.gapMs <= 90);
});

test("tikler birlesiyor: surekli isin, alan ve sizinti tur basina 150 ms'de bir", () => {
  const governor = new hit.HitSoundGovernor();
  let ticks = 0;
  for (let now = 0; now < 1500; now += 16) if (governor.admit("focus", true, true, 40, now) >= 0) ticks += 1;
  assert.ok(ticks <= Math.ceil(1500 / hit.HIT_SOUND_LIMITS.tickGapMs), `${ticks} odak tiki`);
  assert.ok(ticks >= 8, "nabiz duyulmali");

  const aura = new hit.HitSoundGovernor();
  assert.ok(aura.admit("aura", true, false, 10, 0) >= 0);
  assert.equal(aura.admit("aura", true, false, 10, 100), -1, "aura kendiliginden tik");
  assert.ok(aura.admit("aura", true, false, 10, 151) >= 0);
  assert.ok(aura.admit("contamination", true, false, 10, 151) >= 0);
  assert.equal(aura.admit("contamination", true, false, 10, 260), -1, "sizinti kendiliginden tik");

  // Tik olmayan odak vurusu tik izine takilmiyor, ama tur araligi gecerli.
  const mixed = new hit.HitSoundGovernor();
  assert.ok(mixed.admit("focus", true, true, 10, 0) >= 0);
  assert.ok(mixed.admit("focus", true, false, 10, 80) >= 0);
});

test("takim arkadasi: dar butce, seyrek, ve dolu butcede ilk o dusuyor", () => {
  const governor = new hit.HitSoundGovernor();
  const ids = hit.HIT_VOICE_IDS;
  for (let index = 0; index < 3; index += 1) assert.ok(governor.admit(ids[index], false, false, 500, 0) >= 0);
  assert.equal(governor.admit(ids[3], false, false, 500, 0), -1, "arkadasin en fazla 3 sesi");
  for (let index = 3; index < 6; index += 1) assert.ok(governor.admit(ids[index], true, false, 500, 0) >= 0);
  assert.equal(governor.activeVoices(1), 6);

  const slot = governor.admit(ids[6], true, false, 500, 1);
  assert.ok(slot >= 0, "kendi vurusun dolu butcede yer bulur");
  assert.equal(governor.stole, true, "arkadasin sesi kaldirildi");
  assert.equal(governor.activeVoices(2, false), 2);
  assert.equal(governor.activeVoices(2, true), 4);

  // Hepsi kendi sesinse yeni ses (kendi ya da arkadasin) duser.
  const own = new hit.HitSoundGovernor();
  for (let index = 0; index < 6; index += 1) own.admit(ids[index], true, false, 500, 0);
  assert.equal(own.admit(ids[7], true, false, 500, 1), -1);
  assert.equal(own.admit(ids[8], false, false, 500, 1), -1);

  // Arkadasin araligi kendi izinde ve daha seyrek; seninkini yemiyor.
  const gaps = new hit.HitSoundGovernor();
  assert.ok(gaps.admit("projectile", false, false, 5, 0) >= 0);
  assert.ok(gaps.admit("projectile", true, false, 5, 1) >= 0, "arkadasin vurusu senin araligini doldurmaz");
  assert.equal(gaps.admit("projectile", false, false, 5, 90), -1, "arkadasin araligi daha uzun");
  assert.ok(gaps.admit("projectile", false, false, 5, 120) >= 0);
  assert.ok(hit.HIT_SOUND_LIMITS.teammateGain >= 0.4 && hit.HIT_SOUND_LIMITS.teammateGain <= 0.5);
});

/* ------------------------------------------------------------------ */
/* Perde                                                               */
/* ------------------------------------------------------------------ */

test("perde kaymasi olay kimliginden: deterministik, hafif ve cesitli; Math.random yok", () => {
  const original = Math.random;
  Math.random = () => { throw new Error("Math.random kullanildi"); };
  try {
    assert.equal(hit.getHitPitchRatio("p12@40:80"), hit.getHitPitchRatio("p12@40:80"));
    assert.equal(hit.getHitPitchRatio(undefined), 1);
    const ratios = new Set();
    let sum = 0;
    for (let index = 0; index < 400; index += 1) {
      const ratio = hit.getHitPitchRatio(`p${index}@${index * 3}:${index * 7}`);
      const semitones = 12 * Math.log2(ratio);
      assert.ok(Math.abs(semitones) <= hit.HIT_SOUND_LIMITS.pitchSemitones + 1e-9, `${semitones} yarim ton`);
      ratios.add(ratio.toFixed(4));
      sum += ratio;
    }
    assert.ok(ratios.size > 100, "ust uste gelen vuruslar ayni perdede degil");
    assert.ok(Math.abs(sum / 400 - 1) < 0.01, "ortalama perde kaymiyor");

    const { instance, context } = makeDirector();
    assert.equal(instance.playHit("projectile", 1, true, "p1@1:1"), true);
    instance.destroy();
    const oscillator = context.created.find((node) => node.kind === "oscillator");
    const ratio = hit.getHitPitchRatio("p1@1:1");
    assert.ok(Math.abs(oscillator.frequency.events[0][1] - 520 * ratio) < 1e-6, "sentez perdeyi uyguluyor");
  } finally {
    Math.random = original;
  }
});

/* ------------------------------------------------------------------ */
/* Sentez                                                              */
/* ------------------------------------------------------------------ */

test("sentez: Efektler kanalindan, paylasilan gurultu tamponu, katman basina en az dugum", () => {
  const { instance, context } = makeDirector();
  assert.equal(instance.playHit("impact", 3, true, "a"), true);
  const recipe = hit.getHitVoiceRecipe("impact", 3);
  const oscillators = context.created.filter((node) => node.kind === "oscillator");
  const noises = context.created.filter((node) => node.kind === "bufferSource");
  assert.equal(oscillators.length + noises.length, recipe.length, "katman basina bir kaynak");
  assert.equal(context.created.filter((node) => node.kind === "filter").length, noises.length, "gurultu katmani basina bir suzgec");
  assert.equal(voiceGains(context).length, 1, "ses vurus kanalina, o da Efektler'e bagli");
  for (const source of [...oscillators, ...noises]) assert.ok(source.stopAt > source.startAt, "her kaynak duruyor");

  const before = context.buffers;
  assert.equal(instance.playHit("wave", 1, true, "b"), true);
  assert.equal(context.buffers, before, "gurultu tamponu bir kez kuruluyor");
  const waveNoises = context.created.filter((node) => node.kind === "bufferSource").slice(noises.length);
  assert.ok(waveNoises.every((node) => node.buffer === noises[0].buffer), "tampon paylasiliyor");
  instance.destroy();
});

test("biten sesin dugumleri bir sonraki vurusta ayriliyor", () => {
  const { instance, context } = makeDirector();
  instance.playHit("projectile", 1, true, "a");
  const first = context.created.slice();
  context.currentTime = 1;
  instance.playHit("impact", 1, true, "b");
  const firstVoice = first.filter((node) => node.kind !== "compressor" && !voiceBus(node, context));
  assert.ok(firstVoice.length > 0);
  assert.ok(firstVoice.every((node) => node.disconnected), "ilk sesin dugumleri grafikte asili kalmadi");
  instance.destroy();
});

/** Kanal dugumleri (vurus ve Efektler kanali): sesle birlikte ayrilmiyor. */
function voiceBus(node) {
  return node.kind === "gain" && (node.connections[0]?.kind === "compressor" || node.connections[0]?.connections?.[0]?.kind === "compressor");
}

test("takim arkadasinin kulesi kisik calar", () => {
  const { instance, context } = makeDirector();
  instance.playHit("projectile", 1, true, "own");
  instance.playHit("impact", 1, false, "mate");
  const [own, mate] = voiceGains(context);
  assert.equal(own.gain.value, 1);
  assert.equal(mate.gain.value, hit.HIT_SOUND_LIMITS.teammateGain);
  assert.ok(mate.gain.value < own.gain.value);
  instance.destroy();
});

test("dolu butcede kendi vurusun arkadasin sesini sondurup yerini aliyor", () => {
  const { instance, context } = makeDirector();
  const ids = hit.HIT_VOICE_IDS;
  for (let index = 0; index < 3; index += 1) assert.equal(instance.playHit(ids[index], 1, false, `m${index}`), true);
  for (let index = 3; index < 6; index += 1) assert.equal(instance.playHit(ids[index], 1, true, `o${index}`), true);
  assert.equal(instance.playHit(ids[6], 1, false, "late-mate"), false, "dolu butcede arkadasinki duser");
  const mates = voiceGains(context).filter((node) => node.gain.value === hit.HIT_SOUND_LIMITS.teammateGain);
  assert.equal(instance.playHit(ids[7], 1, true, "late-own"), true);
  const faded = mates.filter((node) => node.gain.events.some(([type, value]) => type === "lin" && value === 0));
  assert.equal(faded.length, 1, "en eski arkadas sesi sonduruldu");
  instance.destroy();
});

test("seviye 0 iken hic ses dugumu kurulmuyor", () => {
  const { instance, context } = makeDirector({ hitVolume: 0 });
  const before = context.created.length;
  for (const id of hit.HIT_VOICE_IDS) assert.equal(instance.playHit(id, 3, true, id), false);
  assert.equal(context.created.length, before, "vurus seviyesi 0");

  instance.setHitVolume(0.4);
  assert.equal(instance.playHit("projectile", 1, true, "x"), true);
  const afterOne = context.created.length;
  instance.setHitVolume(0);
  assert.equal(instance.playHit("impact", 1, true, "y"), false);
  assert.equal(context.created.length, afterOne, "kaydirici 0'a cekildi");
  instance.destroy();

  const muted = makeDirector({ sfxVolume: 0 });
  const mutedBefore = muted.context.created.length;
  assert.equal(muted.instance.playHit("projectile", 1, true, "z"), false);
  assert.equal(muted.context.created.length, mutedBefore, "Efektler 0 ise vurus da sessiz");
  muted.instance.destroy();
});

test("baglam acik degilse ya da sekme gizliyse hicbir sey kurulmuyor ve kuyruga girmiyor", () => {
  const { instance, context } = makeDirector();
  context.state = "suspended";
  const before = context.created.length;
  assert.equal(instance.playHit("projectile", 1, true, "a"), false);
  context.state = "running";
  assert.equal(context.created.length, before, "askidaki baglamda dugum yok");

  globalThis.document = { visibilityState: "hidden" };
  try {
    assert.equal(instance.playHit("impact", 1, true, "b"), false);
    assert.equal(context.created.length, before, "gizli sekmede dugum yok");
  } finally {
    delete globalThis.document;
  }
  assert.equal(instance.playHit("impact", 1, true, "c"), true, "acilinca normal");
  instance.destroy();

  const fresh = new director.FeedbackDirector({ sfxVolume: 1, hitVolume: 1, vibration: false, getCamera: () => undefined });
  const count = FakeContext.instances.length;
  assert.equal(fresh.playHit("projectile", 1, true, "d"), false, "dokunustan once baglam yok");
  assert.equal(FakeContext.instances.length, count, "vurus baglami kendisi acmiyor");
  fresh.destroy();
});

/* ------------------------------------------------------------------ */
/* Isinlar                                                             */
/* ------------------------------------------------------------------ */

function beam(id, definitionId, ttlMs = 200, tier) {
  return { id, definitionId, tier, x1: 0, y1: 0, x2: 50, y2: 0, width: 4, color: 0xffffff, ttlMs };
}

test("surekli isin (Debug Lazer) vizilti degil nabiz; tek atis isini bir kez", () => {
  const calls = [];
  const tracker = new hit.BeamHitTracker((b, voice, tick) => calls.push([b.id, voice, tick]));
  for (let now = 0; now <= 1000; now += 16) {
    tracker.update([beam("beam-t1", "warrior-5", 260, 3), beam("showcase-t2-1", "zeynep-2", 260 - now / 10)], now);
  }
  const laser = calls.filter(([id]) => id === "beam-t1");
  assert.ok(laser.every(([, voice, tick]) => voice === "focus" && tick === true));
  assert.ok(laser.length >= 5 && laser.length <= Math.ceil(1000 / hit.FOCUS_BEAM_PULSE_MS) + 1, `${laser.length} lazer nabzi`);
  const showcase = calls.filter(([id]) => id === "showcase-t2-1");
  assert.deepEqual(showcase, [["showcase-t2-1", "impact", false]]);
});

test("ayni kimlikle yeniden atilan isin yeniden calar; dalga yalnizca dogusta", () => {
  const calls = [];
  const tracker = new hit.BeamHitTracker((b) => calls.push(b.id));
  let ttl = 320;
  for (let now = 0; now < 1200; now += 16) {
    ttl = now % 600 < 16 ? 320 : ttl - 16;
    tracker.update([beam("melis-curse-t3", "archer-3-curse", ttl), beam("kin-wave-9", "zeynep-6", 100 + (now % 48))], now);
  }
  assert.equal(calls.filter((id) => id === "melis-curse-t3").length, 2, "iki atis, iki ses");
  assert.equal(calls.filter((id) => id === "kin-wave-9").length, 1, "Kin dalgasi tek ses");
});

test("kule olmayan isinlar sessiz; kaybolan isin unutuluyor", () => {
  const calls = [];
  const tracker = new hit.BeamHitTracker((b) => calls.push(b.id));
  tracker.update([beam("enemy-shot-1", "enemy-shot"), beam("col-1", "zeynep-ultimate-column"), beam("link-1", "onur-sympathy")], 0);
  assert.deepEqual(calls, []);
  tracker.update([beam("chain-1", "warrior-6")], 10);
  assert.equal(tracker.size, 1);
  tracker.update([], 20);
  assert.equal(tracker.size, 0);
  tracker.update([beam("chain-1", "warrior-6")], 30);
  assert.deepEqual(calls, ["chain-1", "chain-1"]);
});

/* ------------------------------------------------------------------ */
/* Baglanti                                                            */
/* ------------------------------------------------------------------ */


test("alan isinlari: bos alan sessiz, icinde dusman varken sunucunun tik ritminde", () => {
  const poolTick = MELIS_CURSE_POOL_TICK_MS / GAME_SPEED_MULTIPLIER;
  const burnTick = ZEYNEP_SYNTHESIS_BURN_TICK_MS / GAME_SPEED_MULTIPLIER;
  assert.equal(hit.AREA_BEAM_TICK_MS["archer-3-curse-pool"], poolTick, "havuz sunucunun sabitiyle");
  assert.equal(hit.AREA_BEAM_TICK_MS["zeynep-3-burn-trail"], burnTick, "iz sunucunun sabitiyle");

  const pool = { id: "pool-1", definitionId: "archer-3-curse-pool", x1: 100, y1: 100, x2: 100, y2: 100, width: 60, color: 0, ttlMs: 2000 };
  const trail = { id: "trail-1", definitionId: "zeynep-3-burn-trail", x1: 0, y1: 0, x2: 200, y2: 0, width: 32, color: 0, ttlMs: 2000 };
  const calls = [];
  const tracker = new hit.BeamHitTracker((b, voice, tick) => calls.push([b.id, voice, tick]));
  for (let now = 0; now < 3000; now += 16) tracker.update([pool, trail], now, []);
  assert.deepEqual(calls, [], "bos alan hic calmiyor");

  const inside = [{ x: 110, y: 120 }, { x: 150, y: 12 }];
  for (let now = 3000; now < 6000; now += 16) tracker.update([pool, trail], now, inside);
  const poolTicks = calls.filter(([id]) => id === "pool-1");
  const trailTicks = calls.filter(([id]) => id === "trail-1");
  assert.ok(poolTicks.every(([, voice, tick]) => voice === "curse" && tick));
  assert.ok(trailTicks.every(([, voice, tick]) => voice === "impact" && tick));
  assert.ok(Math.abs(poolTicks.length - 3000 / poolTick) <= 1, `${poolTicks.length} havuz tiki`);
  assert.ok(Math.abs(trailTicks.length - 3000 / burnTick) <= 1, `${trailTicks.length} iz tiki`);

  // Alanin hemen disi sayilmiyor.
  assert.equal(hit.isAreaBeamOccupied(pool, [{ x: 100, y: 100 + 30 + 11 }]), false);
  assert.equal(hit.isAreaBeamOccupied(pool, [{ x: 100, y: 100 + 30 + 9 }]), true);
  assert.equal(hit.isAreaBeamOccupied(trail, [{ x: 250, y: 0 }]), false, "parcanin ucunun otesi");
  assert.equal(hit.isAreaBeamOccupied(trail, [{ x: 199, y: 20 }]), true);
});

test("gecikmeli carpma: sekmeden donuste biriken carpmalar sessiz", () => {
  assert.equal(hit.isHitSoundFresh(1000, 1500, 500), true, "tam zamaninda");
  assert.equal(hit.isHitSoundFresh(1000, 1500 + hit.STALE_HIT_SLACK_MS, 500), true, "pay icinde");
  assert.equal(hit.isHitSoundFresh(1000, 1500 + hit.STALE_HIT_SLACK_MS + 1, 500), false, "gec bosalan kuyruk");
  assert.equal(hit.isHitSoundFresh(1000, 9000, 500), false, "sekme saniyelerce gizliydi");
  assert.ok(hit.STALE_HIT_SLACK_MS >= 80 && hit.STALE_HIT_SLACK_MS <= 200);
});

test("bicak sesi: yalnizca sunucunun bicak bayragi, konum degil", () => {
  const towers = [
    { definitionId: "onur-1", x: 0, y: 0, level: 10, ownerId: "p1" },
    { definitionId: "onur-1", x: 40, y: 0, level: 5, ownerId: "p2" },
    { definitionId: "onur-2", x: 2, y: 0, level: 1, ownerId: "p1" }
  ];
  // Testere'nin dibindeki isaretsiz olay (kanama tiki, baska kule): ses yok.
  assert.equal(hit.getBladeHitTier({ x: 1, y: 1 }, towers, "p1"), undefined);
  // Isaretli olay bicak ucunda, konumu kaymis olsa da: vuranin Testere'si.
  assert.equal(hit.getBladeHitTier({ b: 1, x: 90, y: -16 }, towers, "p1"), 3);
  assert.equal(hit.getBladeHitTier({ b: 1, x: -60, y: 10 }, towers, "p2"), 2, "baska sahibin Testere'si");
  assert.equal(hit.getBladeHitTier({ b: 1, x: 0, y: 0 }, [], "p1"), 1, "kule bulunamazsa kademe 1");
});

test("iki saat ayrisinca (iOS askidan donus) calan ses kesilmiyor, sonduruluyor", () => {
  const realNow = performance.now;
  let clock = 0;
  performance.now = () => clock;
  try {
    const { instance, context } = makeDirector();
    assert.equal(instance.playHit("projectile", 1, true, "a"), true);
    const [first] = voiceGains(context);
    // Yonetmenin saati ilerledi, baglamin saati durdu: yuva bos sanilir ama ses suruyor.
    clock += 5000;
    assert.equal(instance.playHit("impact", 1, true, "b"), true);
    assert.equal(first.disconnected, false, "calan ses aniden ayrilmadi");
    assert.ok(first.gain.events.some(([type, value]) => type === "lin" && value === 0), "calan ses sonduruldu");
    instance.destroy();
  } finally {
    performance.now = realNow;
  }
});

test("kaydirici onizlemesi: oyunun butcesinin disinda, 250 ms'de bir, seviye 0'da dugumsuz", () => {
  const realNow = performance.now;
  let clock = 10_000;
  performance.now = () => clock;
  try {
    const { instance, context } = makeDirector();
    const ids = hit.HIT_VOICE_IDS;
    for (let index = 0; index < 6; index += 1) assert.equal(instance.playHit(ids[index], 1, true, `o${index}`), true);
    assert.equal(instance.playHit(ids[6], 1, true, "full"), false, "oyun butcesi dolu");
    assert.equal(instance.previewHit(), true, "onizleme yine de caliyor");
    assert.equal(instance.getBudgetUsage().hitVoices, 6, "onizleme oyunun yuvasini yemiyor");
    clock += 100;
    assert.equal(instance.previewHit(), false, "surukleme: 250 ms dolmadan ikincisi yok");
    clock += director.HIT_PREVIEW_GAP_MS;
    assert.equal(instance.previewHit(), true);

    instance.setHitVolume(0);
    clock += 1000;
    const before = context.created.length;
    assert.equal(instance.previewHit(), false);
    assert.equal(context.created.length, before, "seviye 0: dugum yok");
    instance.destroy();
  } finally {
    performance.now = realNow;
  }
});

test("oyun: carpmanin sesi gecikmeli carpmanin icinde ve tazelik kontrolunden geciyor", () => {
  // GameScene node'da kurulamiyor; burada yalnizca siralama kilitleniyor.
  const scene = read("apps/web/src/scenes/GameScene.ts");
  const contact = scene.slice(scene.indexOf('room.onMessage("projectile:contact"'), scene.indexOf('room.onMessage("projectile:hit"'));
  const delayed = contact.slice(contact.indexOf("this.queueDelayedEffect("));
  assert.ok(delayed.indexOf("emitImpact") >= 0 && delayed.indexOf("playHit") > delayed.indexOf("emitImpact"), "ses carpma cizildikten sonra");
  assert.ok(delayed.indexOf("isHitSoundFresh") >= 0 && delayed.indexOf("isHitSoundFresh") < delayed.indexOf("playHit"), "bayat carpma sessiz");
});
