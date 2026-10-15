/**
 * ATLAS telsiz anonslari (apps/web/src/atlas-voice.ts).
 *
 * Yonetmen saf: saat, rastgelelik ve ses arka ucu sahte. Kurallar sahibin
 * kararlari: karsilama asama basina bir kez, dalga basi/sonu %33, nexus uc
 * seviye ve ortak 60 sn (ilk kritik haric), kule 15 sn, ovgu 60 sn, tek satir
 * ve oncelik, yenilgi/zafer beklemesi, torba, seslendirme kaydiricisi ve
 * kisma, kilit acilmadan gelen karsilama. Ardindan sahne kancalari (kaynak
 * duzeyinde) ve varliklar (manifest, dosyalar, uretim betigi).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const fileUrl = (path) => new URL(`../${path}`, import.meta.url);

const atlasModule = await importWebModule("apps/web/src/atlas-voice.ts");
const {
  ATLAS_CATEGORIES,
  ATLAS_DUCK_GAIN,
  ATLAS_VOICE_GAIN,
  ATLAS_LINE_COUNTS,
  ATLAS_PRIORITY,
  ATLAS_RULES,
  AtlasLineBag,
  AtlasOnceSet,
  AtlasTowerWatch,
  AtlasVoice,
  AtlasWaveWatch,
  createAtlasWebAudio,
  getAtlasLineUrls,
  getNexusDamageLevel
} = atlasModule;

/** Sahte ses: her `play` bir kayit; `stop` solmayi bitmis sayip `onEnded` cagiriyor. */
function fakeAudio({ ready = true } = {}) {
  const port = {
    ready,
    listeners: [],
    prefetched: [],
    plays: [],
    isReady() {
      return port.ready;
    },
    onReady(listener) {
      port.listeners.push(listener);
    },
    prefetch(urls) {
      port.prefetched.push(...urls);
    },
    play(url, volume, onEnded) {
      const playback = {
        url,
        volume,
        stoppedWith: undefined,
        volumes: [],
        ended: false,
        stop(fadeMs) {
          playback.stoppedWith = fadeMs;
          playback.end();
        },
        setVolume(next) {
          playback.volumes.push(next);
        },
        end() {
          if (playback.ended) return;
          playback.ended = true;
          onEnded();
        }
      };
      port.plays.push(playback);
      return playback;
    },
    unlock() {
      port.ready = true;
      for (const listener of port.listeners) listener();
    },
    get last() {
      return port.plays[port.plays.length - 1];
    }
  };
  return port;
}

const categoryOf = (playback) => /audio\/atlas\/([^/]+)\//.exec(playback.url)[1];

function setup(options = {}) {
  const audio = fakeAudio(options);
  const clock = { t: 0 };
  const speaking = [];
  let volume = options.volume ?? 0.8;
  const randoms = options.randoms ? [...options.randoms] : undefined;
  const voice = new AtlasVoice({
    audio,
    now: () => clock.t,
    random: () => (randoms && randoms.length > 0 ? randoms.shift() : options.random ?? 0),
    getVolume: () => volume,
    onSpeaking: (value) => speaking.push(value)
  });
  voice.startMatch(options.key ?? "room:1");
  return { audio, clock, voice, speaking, setVolume: (next) => { volume = next; } };
}

const SEC = 1000;

test("karsilama mac (oda:asama) basina bir kez; yeniden baglanma ve yenileme tekrar calmiyor", () => {
  const { audio, voice } = setup();
  assert.equal(voice.welcome(), true);
  assert.equal(categoryOf(audio.last), "welcome");
  audio.last.end();
  assert.equal(voice.welcome(), false, "ayni macta ikinci karsilama");
  voice.startMatch("room:1");
  assert.equal(voice.welcome(), false, "yeniden baglanma (ayni anahtar) sifirlamamali");
  assert.equal(audio.plays.length, 1);

  // Sayfa yenilendi: oturum deposu "karsilandi" diyor.
  const reloaded = setup({ key: "room:1" });
  reloaded.voice.startMatch("room:1b", true);
  assert.equal(reloaded.voice.welcome(), false);

  // Yeni asama: yeniden karsilama.
  voice.startMatch("room:2");
  assert.equal(voice.welcome(), true);
  assert.equal(audio.plays.length, 2);
});

test("dalga basi ve dalga sonu: dalga basina tek zar, %33", () => {
  const pass = setup({ random: 0.32 });
  assert.equal(pass.voice.waveStarted(1), true);
  assert.equal(categoryOf(pass.audio.last), "wave-start");
  pass.audio.last.end();
  assert.equal(pass.voice.waveStarted(1), false, "ayni dalga ikinci kez zar atmiyor");
  assert.equal(pass.voice.waveCleared(1), true);
  assert.equal(categoryOf(pass.audio.last), "wave-clear");
  pass.audio.last.end();
  assert.equal(pass.voice.waveCleared(1), false);

  const fail = setup({ random: 0.33 });
  assert.equal(fail.voice.waveStarted(1), false);
  assert.equal(fail.voice.waveCleared(1), false);
  assert.equal(fail.audio.plays.length, 0);

  // Uzun vadede ~%33: dusuk zar calar, yuksek zar susar.
  assert.equal(ATLAS_RULES.waveChance, 0.33);
  let played = 0;
  const many = setup({ randoms: Array.from({ length: 400 }, (_, index) => ((index * 37) % 100) / 100) });
  for (let wave = 1; wave <= 100; wave += 1) {
    if (many.voice.waveStarted(wave)) {
      played += 1;
      many.audio.last.end();
    }
  }
  assert.ok(played >= 25 && played <= 40, `beklenen ~33, cikan ${played}`);
});

test("nexus seviyeleri vurustan sonraki orandan: 100-50 / 50-20 / <=20", () => {
  assert.equal(getNexusDamageLevel(1), 1);
  assert.equal(getNexusDamageLevel(0.51), 1);
  assert.equal(getNexusDamageLevel(0.5), 2);
  assert.equal(getNexusDamageLevel(0.21), 2);
  assert.equal(getNexusDamageLevel(0.2), 3);
  assert.equal(getNexusDamageLevel(0.01), 3);
});

test("nexus: ilk deger yalnizca kaydediliyor, uc seviye 60 sn'lik ortak araliga uyuyor", () => {
  const { audio, clock, voice } = setup();
  assert.equal(voice.nexusHealth(100, 100), false, "ilk gozlem (yeniden baglanma) uyari degil");
  assert.equal(voice.nexusHealth(90, 100), true);
  assert.equal(categoryOf(audio.last), "nexus-damage-lvl1");
  audio.last.end();
  clock.t = 30 * SEC;
  assert.equal(voice.nexusHealth(45, 100), false, "aralik icinde seviye 2 de bekliyor");
  clock.t = 61 * SEC;
  assert.equal(voice.nexusHealth(44, 100), true);
  assert.equal(categoryOf(audio.last), "nexus-damage-lvl2");
  audio.last.end();
  clock.t = 70 * SEC;
  assert.equal(voice.nexusHealth(60, 100), false, "can artisi (onarim) uyari degil");
  clock.t = 130 * SEC;
  assert.equal(voice.nexusHealth(55, 100), true);
  assert.equal(categoryOf(audio.last), "nexus-damage-lvl1", "seviye vurustan sonraki candan");
});

test("nexus: ilk kritik uyari araligi beklemiyor; sonrakiler bekliyor", () => {
  const { audio, clock, voice } = setup();
  voice.nexusHealth(100, 100);
  voice.nexusHealth(80, 100);
  audio.last.end();
  clock.t = 10 * SEC;
  assert.equal(voice.nexusHealth(30, 100), false, "seviye 2 araliga takiliyor");
  assert.equal(voice.nexusHealth(15, 100), true, "ilk kritik hemen");
  assert.equal(categoryOf(audio.last), "nexus-damage-lvl3");
  audio.last.end();
  clock.t = 20 * SEC;
  assert.equal(voice.nexusHealth(10, 100), false, "ikinci kritik araliga uyuyor");
  clock.t = 71 * SEC;
  assert.equal(voice.nexusHealth(8, 100), true);
  assert.equal(voice.nexusHealth(0, 100), false, "can bitti: yenilgi satiri konusacak");
});

test("kule yikildi 15 sn'de bir, ovgu 60 sn'de bir; bekleme yalnizca satir calinca", () => {
  const { audio, clock, voice } = setup();
  assert.equal(voice.towerDestroyed(), true);
  audio.last.end();
  clock.t = 14 * SEC;
  assert.equal(voice.towerDestroyed(), false);
  clock.t = 15 * SEC;
  assert.equal(voice.towerDestroyed(), true);
  audio.last.end();

  assert.equal(voice.praise(), true);
  audio.last.end();
  clock.t += 59 * SEC;
  assert.equal(voice.praise(), false);
  clock.t += 1 * SEC;
  assert.equal(voice.praise(), true);
  audio.last.end();

  // Dusen satir bekleme baslatmiyor: ovgu kule satirina takildi, o bitince hemen calabiliyor.
  clock.t += 61 * SEC;
  voice.towerDestroyed();
  assert.equal(voice.praise(), false, "dusuk oncelik dusuyor");
  audio.last.end();
  assert.equal(voice.praise(), true, "dusen ovgu bekleme sayaci kurmamis");
});

test("oncelik: yuksek olan ~120 ms solmayla kesiyor, dusuk ya da esit olan dusuyor", () => {
  assert.deepEqual(
    [...ATLAS_CATEGORIES].sort((a, b) => ATLAS_PRIORITY[b] - ATLAS_PRIORITY[a]),
    ["death", "ending", "nexus-damage-lvl3", "nexus-damage-lvl2", "tower-destroyed", "nexus-damage-lvl1", "welcome", "wave-start", "wave-clear", "praising"]
  );
  assert.equal(ATLAS_PRIORITY["wave-start"], ATLAS_PRIORITY["wave-clear"]);
  const { audio, voice, speaking } = setup();
  voice.praise();
  const praise = audio.last;
  assert.equal(voice.towerDestroyed(), true);
  assert.equal(praise.stoppedWith, ATLAS_RULES.interruptFadeMs);
  assert.equal(ATLAS_RULES.interruptFadeMs, 120);
  const tower = audio.last;
  assert.equal(categoryOf(tower), "tower-destroyed");
  assert.equal(voice.playingCategory, "tower-destroyed");
  assert.equal(voice.waveStarted(3), false, "dalga basi kule satirinin altinda");
  assert.equal(voice.welcome(), false, "karsilama da altinda");
  assert.equal(audio.plays.length, 2, "ayni anda tek satir");
  assert.equal(voice.nexusHealth(100, 100), false);
  assert.equal(voice.nexusHealth(70, 100), false, "nexus 1 kule satirinin altinda");
  assert.equal(voice.nexusHealth(45, 100), true, "nexus 2 kule satirini kesiyor");
  assert.equal(tower.stoppedWith, 120);
  // Konusma kesintide kopmuyor: gosterge ve kisma bir kez acilip sonunda bir kez kapaniyor.
  audio.last.end();
  assert.deepEqual(speaking, [true, false]);
});

test("yenilgi/zafer: daha dusugu kesiyor, sonra baska satir yok; esit olan bekleyip ardindan caliyor", () => {
  const { audio, voice, clock } = setup();
  voice.towerDestroyed();
  const tower = audio.last;
  assert.equal(voice.matchEnded("defeat"), true);
  assert.equal(tower.stoppedWith, 120);
  assert.equal(categoryOf(audio.last), "death");
  clock.t += 120 * SEC;
  assert.equal(voice.praise(), false, "mac bitti");
  assert.equal(voice.nexusHealth(1, 100), false);
  assert.equal(voice.matchEnded("victory"), false, "son satir bir kez");

  // Esit oncelik: calan son satirin ustune gelen son satir kuyruga giriyor.
  const other = setup();
  assert.equal(other.voice.say("death"), true);
  const death = other.audio.last;
  assert.equal(other.voice.say("ending"), true, "kuyruga girdi");
  assert.equal(other.audio.plays.length, 1, "ust uste binmiyor");
  assert.equal(death.stoppedWith, undefined, "kesilmedi");
  death.end();
  assert.equal(categoryOf(other.audio.last), "ending", "bitince caldi");
  assert.equal(other.voice.isSpeaking, true);
  other.audio.last.end();
  assert.equal(other.voice.isSpeaking, false);
  assert.equal(other.voice.say("praising"), true, "son satirdan sonra yeni olay calabilir (yalnizca matchEnded kilitliyor)");
});

test("torba: kategori icinde ayni dosya ust uste gelmiyor, her turda hepsi bir kez", () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (const size of [2, 4, 5, 7, 8]) {
    const bag = new AtlasLineBag(size, random);
    let previous;
    const draws = [];
    for (let index = 0; index < size * 40; index += 1) {
      const value = bag.next();
      assert.notEqual(value, previous, `boy ${size}: ust uste ${value}`);
      previous = value;
      draws.push(value);
    }
    for (let start = 0; start < draws.length; start += size) {
      assert.deepEqual([...draws.slice(start, start + size)].sort(), Array.from({ length: size }, (_, index) => index));
    }
  }
  assert.equal(new AtlasLineBag(1, Math.random).next(), 0);

  // Yonetmen uzerinden: ardisik ovgu satirlari farkli dosya.
  const { audio, clock, voice } = setup({ random: 0.99 });
  let previousUrl;
  for (let index = 0; index < 20; index += 1) {
    clock.t += 61 * SEC;
    assert.equal(voice.praise(), true);
    assert.notEqual(audio.last.url, previousUrl);
    previousUrl = audio.last.url;
    audio.last.end();
  }
});

test("seviye seslendirme kaydiricisindan; kaydirici calan satiri izliyor, sifirda susuyor; konusurken kisma", () => {
  const { audio, voice, speaking, setVolume } = setup({ volume: 0.4 });
  voice.towerDestroyed();
  assert.ok(Math.abs(ATLAS_VOICE_GAIN - 0.8) < 1e-9, "ATLAS kaydiricidan %20 kisik");
  assert.ok(Math.abs(audio.last.volume - 0.4 * 0.8) < 1e-9);
  assert.deepEqual(speaking, [true]);
  voice.setVolume(0.7);
  assert.ok(Math.abs(audio.last.volumes[0] - 0.7 * 0.8) < 1e-9);
  setVolume(0);
  voice.setVolume(0);
  assert.equal(audio.last.stoppedWith, 120);
  assert.deepEqual(speaking, [true, false]);
  assert.equal(voice.praise(), false, "seviye sifirken hic satir yok");
  assert.equal(audio.plays.length, 1);
  assert.ok(Math.abs(ATLAS_DUCK_GAIN - 0.65) < 1e-9, "muzik ve efektler ~%35 kisiliyor");

  // Ayar kapali: calan susuyor, yenisi baslamiyor.
  const off = setup();
  off.voice.towerDestroyed();
  off.voice.setEnabled(false);
  assert.equal(off.audio.last.stoppedWith, 120);
  assert.equal(off.voice.praise(), false);
  off.voice.setEnabled(true);
  assert.equal(off.voice.praise(), true);
});

test("kilit acilmadan gelen karsilama 8 sn bekliyor; gec acilirsa atlaniyor", () => {
  const early = setup({ ready: false });
  assert.equal(early.voice.welcome(), false);
  assert.equal(early.audio.plays.length, 0);
  early.clock.t = 7.9 * SEC;
  early.audio.unlock();
  assert.equal(early.audio.plays.length, 1);
  assert.equal(categoryOf(early.audio.last), "welcome");
  early.voice.unlocked();
  assert.equal(early.audio.plays.length, 1, "ikinci acilis tekrar calmiyor");

  const late = setup({ ready: false });
  late.voice.welcome();
  late.clock.t = 8.1 * SEC;
  late.audio.unlock();
  assert.equal(late.audio.plays.length, 0);
  assert.equal(late.voice.welcome(), false, "karsilama hakki kullanildi");

  // Kilit kapaliyken diger olaylar beklemiyor (hazir degilken calma istegi de yok).
  const other = setup({ ready: false });
  other.voice.welcome();
  other.audio.ready = true;
  other.voice.towerDestroyed();
  other.voice.unlocked();
  assert.deepEqual(other.audio.plays.map(categoryOf), ["tower-destroyed"], "karsilama kule satirinin altinda kaldi");
});

test("tembel yukleme: macta karsilama, dalga basi ve nexus; geri kalani ilk dalgadan sonra", () => {
  const { audio, voice } = setup();
  const firstBatch = new Set(audio.prefetched.map((url) => url.split("/")[2]));
  assert.deepEqual([...firstBatch].sort(), ["nexus-damage-lvl1", "nexus-damage-lvl2", "nexus-damage-lvl3", "wave-start", "welcome"]);
  voice.prefetchRest();
  const all = new Set(audio.prefetched.map((url) => url.split("/")[2]));
  assert.deepEqual([...all].sort(), [...ATLAS_CATEGORIES].sort());
  for (const url of audio.prefetched) assert.match(url, /^audio\/atlas\//, "goreli adres");
});

test("izciler: yerel kule yikilmasi bir kez, dalga basi kurulumdan sonra bir kez, kimlik basina bir kez", () => {
  const towers = new AtlasTowerWatch();
  const me = "me";
  const wall = (id) => id === "wall";
  assert.equal(towers.observe([{ id: "a", ownerId: me, definitionId: "x", hp: 0 }], me, wall), 0, "ilk gorulen yikik sayilmiyor");
  assert.equal(towers.observe([
    { id: "a", ownerId: me, definitionId: "x", hp: 0 },
    { id: "b", ownerId: me, definitionId: "x", hp: 10 },
    { id: "c", ownerId: "mate", definitionId: "x", hp: 10 },
    { id: "w", ownerId: me, definitionId: "wall", hp: 10 }
  ], me, wall), 0);
  assert.equal(towers.observe([
    { id: "b", ownerId: me, definitionId: "x", hp: 0 },
    { id: "c", ownerId: "mate", definitionId: "x", hp: 0 },
    { id: "w", ownerId: me, definitionId: "wall", hp: 0 }
  ], me, wall), 1, "yalnizca yerel, duvar degil");
  assert.equal(towers.observe([{ id: "b", ownerId: me, definitionId: "x", hp: 0 }], me, wall), 0, "ayni yikik ikinci snapshot'ta sayilmiyor");

  const waves = new AtlasWaveWatch();
  assert.equal(waves.observe({ wave: 3, setupPhase: false, over: false }), undefined, "dalga ortasinda katilma");
  assert.equal(waves.observe({ wave: 4, setupPhase: true, over: false }), undefined);
  assert.equal(waves.observe({ wave: 4, setupPhase: false, over: false }), 4);
  assert.equal(waves.observe({ wave: 4, setupPhase: false, over: false }), undefined);

  const once = new AtlasOnceSet();
  assert.equal(once.first(5), true);
  assert.equal(once.first(5), false, "snapshot ve mesaj ayni olayi iki kez tetiklemiyor");
});

test("Web Audio arka ucu: assetUrl ile goreli adres, dosya basina tek indirme, hata yutuluyor ve yeniden deneniyor", async () => {
  const loads = [];
  let fail = true;
  const port = createAtlasWebAudio({
    getContext: () => undefined,
    load: (url) => {
      loads.push(url);
      return fail ? Promise.reject(new Error("404")) : Promise.resolve(new ArrayBuffer(8));
    }
  });
  port.prefetch(["audio/atlas/welcome/welcome-01.mp3"]);
  port.prefetch(["audio/atlas/welcome/welcome-01.mp3"]);
  assert.equal(loads.length, 1);
  assert.equal(loads[0], "/audio/atlas/welcome/welcome-01.mp3", "testte BASE_URL '/'; paketde './'");
  await new Promise((resolve) => setTimeout(resolve, 0));
  fail = false;
  port.prefetch(["audio/atlas/welcome/welcome-01.mp3"]);
  assert.equal(loads.length, 2, "basarisiz indirme yeniden deneniyor");
  assert.equal(port.isReady(), false, "baglam yok");
  assert.equal(port.play("audio/atlas/welcome/welcome-01.mp3", 1, () => undefined), undefined);

  // Askidaki baglam: hazir degil, acmayi deniyor; acilinca dinleyici.
  let resumed = 0;
  const listeners = [];
  const context = {
    state: "suspended",
    resume() {
      resumed += 1;
      return Promise.resolve();
    },
    addEventListener(type, listener) {
      if (type === "statechange") listeners.push(listener);
    }
  };
  const ready = [];
  const suspended = createAtlasWebAudio({ getContext: () => context, load: () => Promise.resolve(new ArrayBuffer(8)) });
  suspended.onReady(() => ready.push(true));
  assert.equal(suspended.isReady(), false);
  assert.equal(resumed, 1);
  context.state = "running";
  for (const listener of listeners) listener();
  assert.deepEqual(ready, [true]);
  assert.equal(suspended.isReady(), true);
});

// --- Sahne kancalari ---------------------------------------------------------

test("sahne kancalari yonetmeni cagiriyor", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  const body = (name) => {
    const start = scene.indexOf(`  private ${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    const next = scene.indexOf("\n  private ", start + 10);
    return scene.slice(start, next);
  };
  // Tek yonetmen, geri bildirimin baglamiyla; sahne kapanirken baglamdan once susuyor.
  assert.match(body("createAtlasVoice"), /new AtlasVoice\(\{[\s\S]*createAtlasWebAudio\(\{ getContext: \(\) => feedback\?\.getSharedAudioContext\(\) \}\)[\s\S]*getVolume: \(\) => this\.voiceVolume/);
  assert.match(scene, /this\.atlas\?\.destroy\(\);[\s\S]{0,400}this\.feedback\?\.destroy\(\);/);
  // Snapshot: karsilama (oturum deposuyla), dalga basi, nexus, yerel kule, Metal Kalkan yutmasi.
  assert.match(body("renderSnapshotPayload"), /this\.watchWaveClear\(snapshot\);\s*this\.observeAtlas\(snapshot\);/);
  const observe = body("observeAtlas");
  assert.match(observe, /atlas\.startMatch\(key, readAtlasWelcomed\(key\)\)/);
  assert.match(observe, /atlas\.welcome\(\);\s*writeAtlasWelcomed\(key\);/);
  assert.match(observe, /atlasWaveWatch\.observe[\s\S]*atlas\.waveStarted\(started\);\s*[\s\S]*atlas\.prefetchRest\(\);/);
  assert.match(observe, /atlas\.nexusHealth\(snapshot\.team\.health, snapshot\.team\.maxHealth\)/);
  assert.match(observe, /atlasTowerWatch\.observe\(snapshot\.towers, this\.localSessionId, \(id\) => id === WALL_TOWER_ID\) > 0[\s\S]*atlas\.towerDestroyed\(\)/);
  assert.match(observe, /surge\.cut[\s\S]*this\.atlasSurgeCuts\.first\(surge\.id\)\) atlas\.praise\(\)/);
  assert.match(observe, /snapshot\.result \|\| this\.matchResultShown\) return;/);
  // Dalga sonu, sampiyon, ozel tehdit, mac sonu.
  assert.match(body("watchWaveClear"), /this\.atlas\?\.waveCleared\(summary\.wave\)/);
  assert.match(body("receiveChampionDown"), /this\.atlas\?\.praise\(\)/);
  assert.match(body("playKillConfirmation"), /if \(!trace \|\| stale\) \{\s*return;\s*\}[\s\S]*trace\.special === "hunter" \|\| trace\.special === "eater"\) \{\s*this\.atlas\?\.praise\(\);/);
  assert.match(scene, /special: mover\.specialKind/);
  assert.match(body("openRunReport"), /this\.matchResultShown = true;[\s\S]*if \(this\.liveSnapshotSeen\) this\.atlas\?\.matchEnded\(result\);/);
  // Kilit, seviye, kisma, gosterge, seri anonsu.
  assert.match(body("unlockGameAudio"), /this\.feedback\?\.unlockAudio\(\);[\s\S]*this\.atlas\?\.unlocked\(\);[\s\S]*if \(this\.gameAudioUnlocked\)/);
  assert.match(body("setAudioVolume"), /this\.voiceVolume = volume;[\s\S]*this\.atlas\?\.setVolume\(volume\);/);
  const speaking = body("handleAtlasSpeaking");
  assert.match(speaking, /this\.feedback\?\.setDuck\(speaking \? ATLAS_DUCK_GAIN : 1, ATLAS_DUCK_TIME_CONSTANT\)/);
  assert.match(speaking, /this\.backgroundMusic\.volume = this\.musicVolume \* this\.atlasMusicDuck/);
  assert.match(speaking, /this\.streakVoice\.audio\.pause\(\)/);
  assert.match(speaking, /this\.game\.events\.emit\("game:hud-atlas", speaking\)/);
  assert.match(body("playKillStreakAnnouncement"), /if \(this\.atlas\?\.isSpeaking\) \{\s*return;/);
  assert.match(body("applyAudioVolumes"), /this\.musicVolume \* this\.atlasMusicDuck/);
  // Ayar kutusu.
  assert.match(scene, /case "setAtlasVoice":\s*this\.setAtlasVoiceEnabled\(detail\.value === 1\);/);
  assert.match(body("setAtlasVoiceEnabled"), /writeAtlasEnabled\(on\);\s*this\.atlas\?\.setEnabled\(on\);/);
});

test("geri bildirim yonetmeni: efekt kanali ATLAS'la kisiliyor, baglam paylasiliyor", () => {
  const source = read("apps/web/src/feedback-director.ts");
  assert.match(source, /setDuck\(gain: number, timeConstant = 0\.12\) \{[\s\S]*this\.sfxBus\.gain\.setTargetAtTime\(this\.sfxVolume \* this\.duckGain, this\.context\.currentTime, timeConstant\)/);
  assert.match(source, /setSfxVolume\(value: number\) \{[\s\S]*this\.sfxVolume \* this\.duckGain/);
  assert.match(source, /bus\.gain\.value = this\.sfxVolume \* this\.duckGain;/);
  assert.match(source, /getSharedAudioContext\(\) \{\s*return this\.getAudioContext\(\);/);
});

test("ust bilgi: telsiz gostergesi ve ATLAS sesi kutusu; metinler iki dilde; hareket azaltma", async () => {
  const ui = read("apps/web/src/game-control-ui.ts");
  assert.match(ui, /class="game-hud__atlas" data-hud-atlas role="img" hidden>[\s\S]*<b>ATLAS<\/b>/);
  assert.match(ui, /atlasNode\.setAttribute\("aria-label", t\("hud\.atlas\.speaking"\)\)/);
  assert.match(ui, /game\.events\.on\("game:hud-atlas", showAtlas\)/);
  assert.match(ui, /data-toggle="atlas" type="checkbox"\$\{next\.atlasVoice \? " checked" : ""\}/);
  assert.match(ui, /dispatch\("setAtlasVoice", input\.checked \? 1 : 0\)/);
  const css = read("apps/web/src/style.css");
  assert.match(css, /\.game-hud__atlas \{[\s\S]*top: calc\(100% \+ 6px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.game-hud__atlas-level i \{ animation: none;/);
  assert.match(css, /\.game-hud__forecast:not\(\[hidden\]\) ~ \.game-hud__atlas/);
  const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
  assert.equal(i18n.tr["hud.audio.atlas"], "ATLAS sesi");
  assert.equal(i18n.en["hud.audio.atlas"], "ATLAS voice");
  assert.ok(i18n.tr["hud.atlas.speaking"] && i18n.en["hud.atlas.speaking"]);
  assert.notEqual(i18n.tr["hud.atlas.speaking"], i18n.en["hud.atlas.speaking"]);
});

// --- Varliklar ----------------------------------------------------------------

const manifest = JSON.parse(read("apps/web/public/audio/atlas/manifest.json"));

test("manifest: goreli adresler, modulun sayilariyla ayni, her dosya var", () => {
  assert.deepEqual(manifest.categories, [...ATLAS_CATEGORIES]);
  const expected = ATLAS_CATEGORIES.flatMap((category) => getAtlasLineUrls(category));
  assert.deepEqual(manifest.files.map((file) => file.url), expected);
  assert.equal(expected.length, 61);
  for (const file of manifest.files) {
    assert.match(file.url, /^audio\/atlas\/[a-z0-9-]+\/[a-z0-9-]+-\d\d\.mp3$/, "goreli, kok mutlak degil");
    assert.ok(existsSync(fileUrl(`apps/web/public/${file.url}`)), `yok: ${file.url}`);
    assert.ok(file.duration > 0.5 && file.duration < 15, `${file.url}: sure ${file.duration}`);
  }
  for (const category of ATLAS_CATEGORIES) {
    assert.equal(manifest.files.filter((file) => file.category === category).length, ATLAS_LINE_COUNTS[category], category);
  }
  // Pakette yalnizca kodlanmis surumler: ham ElevenLabs dosyasi yok.
  const shipped = readdirSync(fileUrl("apps/web/public/audio/atlas/"), { recursive: true }).map(String);
  assert.ok(shipped.every((name) => !/ElevenLabs/i.test(name)), "ham dosya pakette");
  assert.equal(shipped.filter((name) => name.endsWith(".mp3")).length, 61);
});

/** Ilk MPEG cercevesinin basligi (ID3 yok): MPEG-1 Layer III, kanal modu ve bit hizi. */
function firstFrame(buffer) {
  let offset = 0;
  if (buffer.toString("latin1", 0, 3) === "ID3") {
    offset = 10 + ((buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9]);
  }
  while (offset < buffer.length - 4 && !(buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0)) offset += 1;
  const header = buffer.subarray(offset, offset + 4);
  return {
    version: (header[1] >> 3) & 3,
    layer: (header[1] >> 1) & 3,
    bitrateIndex: header[2] >> 4,
    sampleRateIndex: (header[2] >> 2) & 3,
    channelMode: header[3] >> 6
  };
}

test("dosyalar mono, 44,1 kHz, 64 kb/s, kucuk; ozetler ve olcumler manifestte", () => {
  let total = 0;
  for (const file of manifest.files) {
    const buffer = readFileSync(fileUrl(`apps/web/public/${file.url}`));
    total += buffer.length;
    assert.equal(buffer.length, file.bytes, file.url);
    assert.equal(createHash("sha256").update(buffer).digest("hex"), file.sha256, `${file.url}: ozet farkli (betikle yeniden uretin)`);
    const frame = firstFrame(buffer);
    assert.equal(frame.version, 3, "MPEG-1");
    assert.equal(frame.layer, 1, "Layer III");
    assert.equal(frame.channelMode, 3, `${file.url}: mono degil`);
    assert.equal(frame.bitrateIndex, 5, `${file.url}: 64 kb/s degil`);
    assert.equal(frame.sampleRateIndex, 0, "44,1 kHz");
    assert.ok(buffer.length < 120 * 1024, `${file.url}: ${buffer.length} bayt`);
    assert.ok(file.lufs >= -19.5 && file.lufs <= -16.5, `${file.url}: ${file.lufs} LUFS`);
    assert.ok(file.truePeak <= -1.5, `${file.url}: ${file.truePeak} dBTP`);
  }
  assert.ok(total < 3.2 * 1024 * 1024, `toplam ${total}`);
  assert.equal(manifest.encoding.channels, 1);
  assert.equal(manifest.encoding.bitrateKbps, 64);
  assert.equal(manifest.encoding.targetLufs, -18);
  assert.equal(manifest.encoding.truePeakDb, -1.5);
});

test("uretim betigi tekrar uretilebilir: kaynaklar pakette degil, ozetleri tutuyor, bitexact ve --check", async () => {
  const script = read("tools/build-atlas-voice.mjs");
  for (const flag of ['"-map_metadata", "-1"', '"-fflags", "+bitexact"', '"-flags:a", "+bitexact"', '"-id3v2_version", "0"', '"-b:a", `${bitrateKbps}k`', "linear=true"]) {
    assert.ok(script.includes(flag), `betikte yok: ${flag}`);
  }
  assert.match(script, /args\.includes\("--check"\)/);
  const { ATLAS_CATEGORIES: scriptCategories, ATLAS_URL_PREFIX, listAtlasSources } = await import(new URL("../tools/build-atlas-voice.mjs", import.meta.url));
  assert.deepEqual(scriptCategories, [...ATLAS_CATEGORIES]);
  assert.equal(ATLAS_URL_PREFIX, "audio/atlas/");
  // Kaynaklar assets-src altinda (apps/web/public disinda) ve manifestin ozetleriyle ayni.
  const sources = listAtlasSources();
  assert.deepEqual(sources.map((entry) => entry.url), manifest.files.map((file) => file.url));
  for (const [index, entry] of sources.entries()) {
    const path = fileUrl(`assets-src/atlas/${entry.source}`);
    assert.ok(statSync(path).size > 0);
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), manifest.files[index].sourceSha256, entry.source);
  }
  assert.ok(!existsSync(fileUrl("apps/web/public/audio/atlas/source-manifest.json")));
});
