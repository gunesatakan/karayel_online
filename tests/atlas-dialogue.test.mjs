/**
 * ATLAS-VESAYET konusmalari (apps/web/src/atlas-dialogue.ts, AtlasVoice.playDialogue)
 * ve ATLAS'in ara sozleri (apps/web/src/atlas-ambient.ts, AtlasVoice.sayAmbient).
 *
 * Tablo ve tetikler (dalga ortasi, beceri kombosu, nexus esigi), kosu basina
 * bir kez, 2 sn'lik bosluklar (sahte saat), konusma surerken baska sesin
 * susmasi ve sonra geri gelmesi, mac sonunun konusmayi kesmesi, ATLAS
 * kapali, sira; ara sozlerin plani (tohumlu, araliklar, konusma dalgalari),
 * erteleme ve hic kesmemesi. Sonra sahne kancalari (kaynak duzeyinde),
 * dosyalar ve emegi gecenler.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const fileUrl = (path) => new URL(`../${path}`, import.meta.url);

const dialogueModule = await importWebModule("apps/web/src/atlas-dialogue.ts");
const {
  ATLAS_DIALOGUES,
  ATLAS_DIALOGUE_GAP_MS,
  AtlasNexusDropWatch,
  AtlasSkillComboWatch,
  findDueAtlasDialogues,
  getAtlasDialogueUrls,
  getStageDialogues,
  isAtlasDialogueEvent,
  isMidWave,
  readAtlasDialoguePlayed,
  writeAtlasDialoguePlayed
} = dialogueModule;
const { AtlasVoice, ATLAS_RULES } = await importWebModule("apps/web/src/atlas-voice.ts");
const {
  ATLAS_AMBIENT_LINES,
  ATLAS_AMBIENT_RULES,
  AtlasAmbientScheduler,
  getAmbientMoment,
  getDialogueWaves,
  planAtlasAmbient
} = await importWebModule("apps/web/src/atlas-ambient.ts");

const byId = (id) => ATLAS_DIALOGUES.find((dialogue) => dialogue.id === id);

// --- Sahte ses ve saat ----------------------------------------------------------

function fakeAudio() {
  const port = {
    ready: true,
    plays: [],
    prefetched: [],
    isReady: () => port.ready,
    onReady() {},
    prefetch(urls) {
      port.prefetched.push(...urls);
    },
    play(url, volume, onEnded) {
      const playback = {
        url,
        volume,
        stoppedWith: undefined,
        ended: false,
        volumes: [],
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
    get last() {
      return port.plays[port.plays.length - 1];
    }
  };
  return port;
}

/** Sahte saat: `setTimeout` yerine; `advance` zamani ilerletip vadesi gelenleri calistiriyor. */
function fakeClock() {
  const clock = {
    t: 0,
    timers: [],
    set(callback, ms) {
      const timer = { at: clock.t + ms, callback, cleared: false };
      clock.timers.push(timer);
      return timer;
    },
    clear(timer) {
      if (timer) timer.cleared = true;
    },
    advance(ms) {
      const until = clock.t + ms;
      for (;;) {
        const next = clock.timers.filter((timer) => !timer.cleared && timer.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        clock.t = next.at;
        next.cleared = true;
        next.callback();
      }
      clock.t = until;
    }
  };
  return clock;
}

function setup(options = {}) {
  const audio = fakeAudio();
  const clock = fakeClock();
  const speaking = [];
  const speakers = [];
  let volume = options.volume ?? 0.8;
  const voice = new AtlasVoice({
    audio,
    now: () => clock.t,
    random: () => options.random ?? 0,
    getVolume: () => volume,
    enabled: options.enabled ?? true,
    onSpeaking: (value) => speaking.push(value),
    onSpeaker: (value) => speakers.push(value ?? null),
    setTimer: (callback, ms) => clock.set(callback, ms),
    clearTimer: (handle) => clock.clear(handle)
  });
  voice.startMatch("room:1");
  return { audio, clock, voice, speaking, speakers, setVolume: (next) => { volume = next; } };
}

const dialogueUrls = (audio) => audio.plays.map((play) => play.url).filter((url) => url.includes("audio/dialogue/"));

// --- Tablo ------------------------------------------------------------------------

test("tablo: alti konusma, asama/tetik sahibin karari, satir sirasi ve konusmacilar dosya adindan", () => {
  assert.deepEqual(ATLAS_DIALOGUES.map((dialogue) => dialogue.id), ["conv-1", "conv-2", "conv-3", "conv-4", "conv-5", "conv-6"]);
  assert.deepEqual([byId("conv-1").stage, byId("conv-1").trigger], [1, { kind: "mid-wave", wave: 9 }]);
  assert.deepEqual([byId("conv-2").stage, byId("conv-2").trigger], [1, { kind: "mid-wave", wave: 19 }]);
  assert.deepEqual([byId("conv-3").stage, byId("conv-3").trigger], [2, { kind: "mid-wave", wave: 6 }]);
  assert.deepEqual([byId("conv-4").stage, byId("conv-4").trigger], [2, { kind: "skill-combo", windowMs: 5000, distinctSkills: 2 }]);
  assert.deepEqual([byId("conv-5").stage, byId("conv-5").trigger], [3, { kind: "nexus-below", percent: 20 }]);
  assert.deepEqual([byId("conv-6").stage, byId("conv-6").trigger], [2, { kind: "mid-wave", wave: 14 }]);
  assert.equal(byId("conv-4").audience, "local", "kombo yalnizca yapana");
  for (const id of ["conv-1", "conv-2", "conv-3", "conv-5", "conv-6"]) assert.equal(byId(id).audience, "team");
  const speakers = (id) => byId(id).lines.map((line) => line.speaker);
  assert.deepEqual(speakers("conv-1"), ["vesayet", "atlas", "vesayet", "atlas"]);
  assert.deepEqual(speakers("conv-2"), ["vesayet", "atlas", "vesayet", "vesayet", "atlas"]);
  assert.deepEqual(speakers("conv-3"), ["vesayet", "atlas", "vesayet"]);
  assert.deepEqual(speakers("conv-4"), ["vesayet", "atlas", "vesayet"]);
  assert.deepEqual(speakers("conv-5"), ["vesayet", "atlas"]);
  assert.deepEqual(speakers("conv-6"), ["vesayet", "atlas", "vesayet"]);
  assert.equal(byId("conv-1").lines[0].url, "audio/dialogue/conv-1/01-vesayet.mp3");
  assert.equal(ATLAS_DIALOGUE_GAP_MS, 2000);
  assert.equal(isAtlasDialogueEvent(byId("conv-1")), false);
  assert.equal(isAtlasDialogueEvent(byId("conv-4")), true);
  assert.equal(isAtlasDialogueEvent(byId("conv-5")), true);
  assert.deepEqual(getStageDialogues(1).map((dialogue) => dialogue.id), ["conv-1", "conv-2"]);
  assert.deepEqual(getStageDialogues(2).map((dialogue) => dialogue.id), ["conv-3", "conv-4", "conv-6"]);
  // Asama/dalga her konusmada tek sabit.
  const source = read("apps/web/src/atlas-dialogue.ts");
  assert.match(source, /const CONV_1 = \{ stage: 1, wave: 9 \} as const;/);
  assert.match(source, /const CONV_2 = \{ stage: 1, wave: 19 \} as const;/);
  assert.match(source, /const CONV_6 = \{ stage: 2, wave: 14 \} as const;/);
});

// --- Dalga ortasi -------------------------------------------------------------------

const combat = (overrides = {}) => ({
  stage: 1,
  wave: 9,
  setupPhase: false,
  tutorial: false,
  creative: false,
  over: false,
  waveEnemyCount: 40,
  enemiesLeft: 20,
  ...overrides
});
const none = () => false;
const ids = (list) => list.map((dialogue) => dialogue.id);

test("dalga ortasi: 1. asama 9. dalgada dusmanlarin yarisi cozulunce; once, kurulumda, bitince yok", () => {
  assert.deepEqual(ids(findDueAtlasDialogues(combat(), none)), ["conv-1"]);
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ enemiesLeft: 21 }), none)), [], "yarisi cozulmeden");
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ enemiesLeft: 5 }), none)), ["conv-1"], "orta gecildiyse (yeniden baglanma) hala dalga icinde");
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ enemiesLeft: 0 }), none)), [], "dalga bitti");
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ setupPhase: true }), none)), [], "kurulum");
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ waveEnemyCount: undefined }), none)), [], "toplam yok");
  for (const wave of [1, 8, 10, 18, 20]) assert.deepEqual(ids(findDueAtlasDialogues(combat({ wave }), none)), [], `dalga ${wave}`);
  for (const stage of [2, 3, 4, 5, undefined]) assert.deepEqual(ids(findDueAtlasDialogues(combat({ stage }), none)), [], `asama ${stage}`);
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ tutorial: true }), none)), [], "ogretici");
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ creative: true }), none)), [], "yaratici");
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ over: true }), none)), [], "mac bitti");
  assert.deepEqual(ids(findDueAtlasDialogues(combat(), (id) => id === "conv-1")), [], "bu kosuda caldi");
  // Oteki dalga ortasi konusmalari.
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ wave: 19 }), none)), ["conv-2"]);
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ stage: 2, wave: 6 }), none)), ["conv-3"]);
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ stage: 2, wave: 14 }), none)), ["conv-6"]);
  assert.deepEqual(ids(findDueAtlasDialogues(combat({ stage: 2, wave: 9 }), none)), []);
  assert.equal(isMidWave({ setupPhase: false, waveEnemyCount: 7, enemiesLeft: 3 }), true, "tek sayida toplam: 3.5'in alti");
  assert.equal(isMidWave({ setupPhase: false, waveEnemyCount: 7, enemiesLeft: 4 }), false);
});

test("kosu basina bir kez: oturum deposu (oda:asama:konusma); depo yoksa bellek", () => {
  const store = new Map();
  globalThis.window = { sessionStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) } };
  try {
    assert.equal(readAtlasDialoguePlayed("roomA:1", "conv-1"), false);
    writeAtlasDialoguePlayed("roomA:1", "conv-1");
    assert.equal(readAtlasDialoguePlayed("roomA:1", "conv-1"), true);
    assert.deepEqual(JSON.parse(store.get("karayel.atlasDialogues")), ["roomA:1:conv-1"]);
    assert.equal(readAtlasDialoguePlayed("roomA:2", "conv-1"), false, "baska asama ayri kosu");
    assert.equal(readAtlasDialoguePlayed("roomB:1", "conv-1"), false, "baska oda ayri kosu");
    // Sayfa yenilendi (bellek bos): depodaki kayit yetiyor.
    store.set("karayel.atlasDialogues", JSON.stringify(["roomC:1:conv-2"]));
    assert.equal(readAtlasDialoguePlayed("roomC:1", "conv-2"), true);
  } finally {
    delete globalThis.window;
  }
  // Depo erisilemiyor: hata yutuluyor, bellek calisiyor.
  writeAtlasDialoguePlayed("roomD:1", "conv-1");
  assert.equal(readAtlasDialoguePlayed("roomD:1", "conv-1"), true);
});

// --- Olay tetikleri -------------------------------------------------------------------

test("conv-4: iki FARKLI beceri ve ulti 5 sn icinde -> bir kez; ayni beceri, genis aralik, yanlis asama, caldi -> yok", () => {
  const cast = (watch, at, cooldowns, charge) => watch.observe({ skillCooldowns: cooldowns, ultimateCharge: charge }, at);
  // Basari: 0 sn beceri 1, 2 sn beceri 2, 4 sn ulti.
  let watch = new AtlasSkillComboWatch();
  assert.equal(cast(watch, 0, [0, 0, 0], 100), false, "ilk gorulen deger yalnizca kayit");
  assert.equal(cast(watch, 100, [10, 0, 0], 100), false);
  assert.equal(cast(watch, 2000, [8, 12, 0], 100), false);
  assert.equal(cast(watch, 4000, [6, 10, 0], 0), true, "kombo");
  assert.equal(cast(watch, 4500, [6, 10, 0], 1), false, "ayni kombo ikinci kez sayilmiyor (yeni kullanim yok)");
  // Ayni beceri iki kez + ulti: yok.
  watch = new AtlasSkillComboWatch();
  cast(watch, 0, [0, 0, 0], 100);
  cast(watch, 100, [3, 0, 0], 100);
  cast(watch, 3200, [3, 0, 0], 100);
  assert.equal(cast(watch, 4000, [3, 0, 0], 0), false, "tek beceri yuvasi");
  // 5 sn'den genis: ilk beceri pencereden dustu.
  watch = new AtlasSkillComboWatch();
  cast(watch, 0, [0, 0, 0], 100);
  cast(watch, 100, [20, 0, 0], 100);
  cast(watch, 3000, [17, 20, 0], 100);
  assert.equal(cast(watch, 5200, [15, 18, 0], 0), false, "ilk beceri 5,1 sn once");
  // Ulti once, beceriler sonra (sira serbest).
  watch = new AtlasSkillComboWatch();
  cast(watch, 0, [0, 0, 0], 100);
  cast(watch, 100, [0, 0, 0], 0);
  cast(watch, 1000, [0, 9, 0], 5);
  assert.equal(cast(watch, 4900, [0, 6, 9], 10), true);
  // Sarj dolu degilken dusus (olmamali) ulti sayilmiyor.
  watch = new AtlasSkillComboWatch();
  cast(watch, 0, [0, 0, 0], 60);
  cast(watch, 100, [9, 0, 0], 60);
  cast(watch, 200, [9, 9, 0], 60);
  assert.equal(cast(watch, 300, [9, 9, 0], 0), false);

  // Tablo: yalnizca 2. asama, kosu basina bir kez.
  const state = (overrides) => combat({ stage: 2, wave: 3, enemiesLeft: 39, skillCombo: true, ...overrides });
  assert.deepEqual(ids(findDueAtlasDialogues(state(), none)), ["conv-4"]);
  assert.deepEqual(ids(findDueAtlasDialogues(state({ stage: 1 }), none)), [], "yanlis asama");
  assert.deepEqual(ids(findDueAtlasDialogues(state({ stage: 3 }), none)), [], "yanlis asama");
  assert.deepEqual(ids(findDueAtlasDialogues(state(), (id) => id === "conv-4")), [], "caldi");
  assert.deepEqual(ids(findDueAtlasDialogues(state({ tutorial: true }), none)), []);
  assert.deepEqual(ids(findDueAtlasDialogues(state({ skillCombo: false }), none)), []);
});

test("conv-5: 3. asamada nexus ilk kez %20'nin altina dusunce; baska asama, esik, ilk deger, iyilesip tekrar dusus -> yok", () => {
  const watch = new AtlasNexusDropWatch();
  assert.equal(watch.observe(15, 100), undefined, "ilk deger (yeniden baglanma) tetiklemiyor");
  watch.reset();
  watch.observe(30, 100);
  const drop = watch.observe(19, 100);
  assert.deepEqual(drop, { from: 30, to: 19, max: 100 });
  const state = (nexusDrop, overrides = {}) => combat({ stage: 3, wave: 12, nexusDrop, ...overrides });
  assert.deepEqual(ids(findDueAtlasDialogues(state(drop), none)), ["conv-5"]);
  assert.deepEqual(ids(findDueAtlasDialogues(state({ from: 30, to: 20, max: 100 }), none)), [], "20 altinda degil");
  assert.deepEqual(ids(findDueAtlasDialogues(state({ from: 30, to: 0, max: 100 }), none)), [], "nexus dustu: yenilgi satiri");
  assert.deepEqual(ids(findDueAtlasDialogues(state(undefined), none)), [], "dusus yok");
  for (const stage of [1, 2, 4, 5]) assert.deepEqual(ids(findDueAtlasDialogues(state(drop, { stage }), none)), [], `asama ${stage}`);
  // Iyilesip yeniden dusunce: bu kosuda caldi.
  assert.equal(watch.observe(60, 100), undefined, "iyilesme dusus degil");
  const again = watch.observe(10, 100);
  assert.deepEqual(ids(findDueAtlasDialogues(state(again), (id) => id === "conv-5")), []);
  // Oran: maxHealth 100 degilse de yuzde.
  assert.deepEqual(ids(findDueAtlasDialogues(state({ from: 60, to: 39, max: 200 }), none)), ["conv-5"]);
});

test("conv-5 seviye-3 nexus uyarisinin onune geciyor: ayni vurusta uyari dusuyor", () => {
  const { audio, voice } = setup();
  voice.nexusHealth(30, 100);
  // Sahnenin sirasi: once konusma, sonra nexus uyarisi.
  assert.equal(voice.playDialogue(byId("conv-5")), true);
  assert.equal(voice.nexusHealth(19, 100), false, "seviye-3 uyarisi konusmanin icinde");
  assert.deepEqual(audio.plays.map((play) => play.url), ["audio/dialogue/conv-5/01-vesayet.mp3"]);
  const scene = read("apps/web/src/scenes/GameScene.ts");
  const observe = scene.slice(scene.indexOf("  private observeAtlas(snapshot"), scene.indexOf("  private observeAtlasDialogues("));
  assert.ok(observe.indexOf("this.observeAtlasDialogues(snapshot, key);") >= 0, "konusma kancasi yok");
  assert.ok(observe.indexOf("this.observeAtlasDialogues(snapshot, key);") < observe.indexOf("atlas.nexusHealth("), "konusma nexus uyarisindan once");
});

// --- Calma: sira, bosluklar, susturma -------------------------------------------------

test("sira: satir -> 2 sn -> satir ...; gosterge konusmaciyi izliyor; bitince konusma kapaniyor", () => {
  const { audio, clock, voice, speaking, speakers } = setup();
  assert.equal(voice.playDialogue(byId("conv-1")), true);
  assert.equal(voice.inDialogue, true);
  assert.equal(voice.dialogueId, "conv-1");
  assert.equal(audio.last.url, "audio/dialogue/conv-1/01-vesayet.mp3");
  assert.equal(audio.last.volume, 0.8 * 0.8, "ATLAS seviyesi (kaydirici x 0.8)");
  assert.equal(voice.currentSpeaker, "vesayet");
  clock.advance(4291);
  audio.last.end();
  assert.equal(voice.currentSpeaker, undefined, "boslukta gosterge kapali");
  assert.equal(voice.isSpeaking, true, "boslukta konusma suruyor (kisma, susturma)");
  clock.advance(1999);
  assert.equal(audio.plays.length, 1, "2 sn dolmadan ikinci satir yok");
  clock.advance(1);
  assert.equal(audio.plays.length, 2);
  assert.equal(audio.last.url, "audio/dialogue/conv-1/02-atlas.mp3");
  assert.equal(voice.currentSpeaker, "atlas");
  const starts = [0, clock.t];
  for (const expected of ["03-vesayet", "04-atlas"]) {
    audio.last.end();
    const endedAt = clock.t;
    clock.advance(2000);
    assert.equal(audio.last.url, `audio/dialogue/conv-1/${expected}.mp3`);
    starts.push(clock.t);
    assert.equal(clock.t - endedAt, 2000);
  }
  audio.last.end();
  assert.equal(voice.inDialogue, false);
  assert.equal(voice.isSpeaking, false);
  assert.deepEqual(speaking, [true, false], "kisma bir kez iniyor, bir kez kalkiyor");
  assert.deepEqual(speakers, ["vesayet", null, "atlas", null, "vesayet", null, "atlas", null]);
  clock.advance(10_000);
  assert.equal(dialogueUrls(audio).length, 4, "fazladan satir yok");
  // Ust uste iki VESAYET satiri (conv-2) de 2 sn aralikli.
  voice.playDialogue(byId("conv-2"));
  for (let index = 1; index < 5; index += 1) {
    audio.last.end();
    clock.advance(2000);
  }
  assert.deepEqual(dialogueUrls(audio).slice(4).map((url) => url.split("/").pop()), ["01-vesayet.mp3", "02-atlas.mp3", "03-vesayet.mp3", "04-vesayet.mp3", "05-atlas.mp3"]);
});

test("konusma surerken ATLAS satirlari (oncelikliler dahil) dusuyor, ara soz baslamiyor; bitince serbest", () => {
  const { audio, clock, voice } = setup({ random: 0 });
  voice.nexusHealth(100, 100);
  voice.playDialogue(byId("conv-1"));
  assert.equal(voice.waveStarted(9), false);
  assert.equal(voice.waveCleared(9), false);
  assert.equal(voice.towerDestroyed(), false);
  assert.equal(voice.praise(), false);
  assert.equal(voice.nexusHealth(15, 100), false, "seviye 3 de dusuyor");
  assert.equal(voice.say("nexus-damage-lvl3"), false);
  assert.equal(voice.sayAmbient("audio/atlas-ambient/i-gave-you-mind.mp3"), false);
  audio.last.end();
  assert.equal(voice.say("nexus-damage-lvl2"), false, "boslukta da");
  assert.equal(dialogueUrls(audio).length, 1);
  assert.equal(audio.plays.length, 1, "kuyruga da girmedi");
  for (let index = 1; index < 4; index += 1) {
    clock.advance(2000);
    audio.last.end();
  }
  assert.equal(voice.isSpeaking, false);
  // Serbest: dusen olaylar sonra calmiyor, yeni olay caliyor (bekleme sureleri islememisti).
  assert.equal(audio.plays.length, 4);
  assert.equal(voice.nexusHealth(10, 100), true, "ilk kritik uyari konusmadan sonraki vurusta");
  assert.match(audio.last.url, /nexus-damage-lvl3/);
});

test("baslarken calan ATLAS satiri soluyor (120 ms), konusma hemen basliyor; kisma kesintisiz", () => {
  const { audio, voice, speaking } = setup({ random: 0 });
  voice.waveStarted(9);
  const line = audio.last;
  assert.match(line.url, /wave-start/);
  assert.equal(voice.playDialogue(byId("conv-1")), true);
  assert.equal(line.stoppedWith, ATLAS_RULES.interruptFadeMs);
  assert.equal(audio.last.url, "audio/dialogue/conv-1/01-vesayet.mp3");
  assert.deepEqual(speaking, [true], "konusma kapanip acilmadi");
  assert.equal(voice.playingCategory, undefined);
});

test("mac sonu konusmayi kesiyor: yenilgi/zafer satiri caliyor, konusma devam etmiyor", () => {
  for (const result of ["defeat", "victory"]) {
    const { audio, clock, voice, speaking, speakers } = setup();
    voice.playDialogue(byId("conv-1"));
    const line = audio.last;
    assert.equal(voice.matchEnded(result), true);
    assert.equal(line.stoppedWith, ATLAS_RULES.interruptFadeMs);
    assert.equal(voice.inDialogue, false);
    assert.equal(voice.playingCategory, result === "victory" ? "ending" : "death");
    assert.equal(speakers.at(-1), "atlas");
    assert.deepEqual(speaking, [true], "son satira gecerken susmadi");
    clock.advance(10_000);
    assert.equal(dialogueUrls(audio).length, 1, "kalan satirlar calmiyor");
    // Bosluktayken de.
    const gap = setup();
    gap.voice.playDialogue(byId("conv-2"));
    gap.audio.last.end();
    assert.equal(gap.voice.matchEnded(result), true);
    gap.clock.advance(10_000);
    assert.equal(dialogueUrls(gap.audio).length, 1);
    assert.equal(gap.voice.playDialogue(byId("conv-1")), false, "mac bitti");
  }
});

test("ATLAS kapali, seslendirme sifir, kilit kapali: konusma baslamiyor; surerken kapatmak kesiyor", () => {
  const off = setup({ enabled: false });
  assert.equal(off.voice.playDialogue(byId("conv-1")), false);
  assert.equal(off.audio.plays.length, 0);
  const muted = setup({ volume: 0 });
  assert.equal(muted.voice.playDialogue(byId("conv-1")), false);
  const locked = setup();
  locked.audio.ready = false;
  assert.equal(locked.voice.playDialogue(byId("conv-1")), false);

  const live = setup();
  live.voice.playDialogue(byId("conv-1"));
  const line = live.audio.last;
  live.voice.setEnabled(false);
  assert.equal(line.stoppedWith, ATLAS_RULES.interruptFadeMs);
  assert.equal(live.voice.inDialogue, false);
  assert.equal(live.voice.isSpeaking, false);
  live.clock.advance(10_000);
  assert.equal(live.audio.plays.length, 1);

  const slider = setup();
  slider.voice.playDialogue(byId("conv-1"));
  slider.voice.setVolume(0.5);
  assert.deepEqual(slider.audio.last.volumes, [0.5 * 0.8], "kaydirici calan satira");
  slider.voice.setVolume(0);
  assert.equal(slider.voice.inDialogue, false, "sifir kesiyor");
});

test("calan konusma varken gelen konusma siraya giriyor, ilki bitince 2 sn sonra basliyor; mac sonu sirayi da siliyor", () => {
  const { audio, clock, voice } = setup();
  voice.playDialogue(byId("conv-3"));
  assert.equal(voice.playDialogue(byId("conv-4")), false, "sira istenmeden reddediliyor");
  assert.equal(voice.playDialogue(byId("conv-4"), { queue: true }), true);
  assert.equal(voice.queuedDialogueId, "conv-4");
  assert.equal(voice.playDialogue(byId("conv-6"), { queue: true }), false, "sirada tek yer");
  for (let index = 0; index < 3; index += 1) {
    audio.last.end();
    clock.advance(2000);
  }
  assert.equal(voice.dialogueId, "conv-4");
  assert.equal(audio.last.url, "audio/dialogue/conv-4/01-vesayet.mp3");
  assert.equal(voice.isSpeaking, true);

  const ended = setup();
  ended.voice.playDialogue(byId("conv-3"));
  ended.voice.playDialogue(byId("conv-4"), { queue: true });
  ended.voice.matchEnded("defeat");
  ended.clock.advance(60_000);
  assert.equal(dialogueUrls(ended.audio).length, 1);
});

// --- Ara sozler -----------------------------------------------------------------------

test("ara soz plani: 1. ve 2. asamada uc farkli dalga, aralik >= 5, konusma dalgalari ve 1/20 yok; tohumla ayni; 3+ asamada yok", () => {
  assert.equal(ATLAS_AMBIENT_RULES.lastWave, 20);
  assert.equal(ATLAS_AMBIENT_RULES.minWaveStep, 5);
  assert.deepEqual(ATLAS_AMBIENT_LINES.filter((line) => line.stage === 1).map((line) => line.id), ["every-little-part-of-you", "i-gave-you-mind", "let-them-fear-you"]);
  assert.deepEqual(ATLAS_AMBIENT_LINES.filter((line) => line.stage === 2).map((line) => line.id), ["my-finest-work", "yours-is-listening", "i-designed-you"]);
  assert.deepEqual([...getDialogueWaves(1)].sort((a, b) => a - b), [9, 19]);
  assert.deepEqual([...getDialogueWaves(2)].sort((a, b) => a - b), [6, 14]);
  const seen = new Set();
  for (const stage of [1, 2]) {
    const avoid = getDialogueWaves(stage);
    for (let seed = 0; seed < 400; seed += 1) {
      const plan = planAtlasAmbient(stage, `room${seed}:${stage}`);
      assert.equal(plan.length, 3);
      assert.equal(new Set(plan.map((entry) => entry.line.id)).size, 3, "uc farkli satir");
      assert.ok(plan.every((entry) => entry.line.stage === stage));
      const waves = plan.map((entry) => entry.wave);
      for (let index = 1; index < waves.length; index += 1) assert.ok(waves[index] - waves[index - 1] >= 5, `aralik ${waves}`);
      for (const wave of waves) {
        assert.ok(wave > 1 && wave < 20, `1/20: ${waves}`);
        assert.ok(!avoid.has(wave), `konusma dalgasi: ${waves}`);
      }
      seen.add(`${stage}:${waves.join(",")}:${plan.map((entry) => entry.line.id).join(",")}`);
      assert.deepEqual(planAtlasAmbient(stage, `room${seed}:${stage}`), plan, "ayni tohum ayni plan");
    }
  }
  assert.ok(seen.size > 50, "plan rastgele dagiliyor");
  for (const stage of [3, 4, 5, undefined]) assert.deepEqual(planAtlasAmbient(stage, "room:3"), []);
});

/** Bellek deposu (oturum deposunun yerine). */
function memoryStore() {
  const data = new Map();
  return {
    data,
    read: (runKey) => ({ ...(data.get(runKey) ?? {}) }),
    write: (runKey, lineId, wave) => data.set(runKey, { ...(data.get(runKey) ?? {}), [lineId]: wave })
  };
}

const ambientState = (wave, resolved, overrides = {}) => ({ wave, setupPhase: false, waveEnemyCount: 100, enemiesLeft: 100 - resolved, ...overrides });

test("ara soz zamanlayicisi: planli dalgada, savasta, tohumlu anda; mesgulse bekliyor; kosu basina bir kez; tasima ve 5 dalga", () => {
  const store = memoryStore();
  const scheduler = new AtlasAmbientScheduler(store);
  scheduler.start("roomX:1", 1);
  const [first, second] = scheduler.entries;
  const moment = Math.ceil(getAmbientMoment("roomX:1", first.line.id, first.wave) * 100);
  assert.ok(moment >= 15 && moment <= 70);
  assert.equal(scheduler.due(ambientState(first.wave - 1, 90), false), undefined, "planli dalgadan once");
  assert.equal(scheduler.due(ambientState(first.wave, 90, { setupPhase: true }), false), undefined, "kurulum");
  assert.equal(scheduler.due(ambientState(first.wave, moment - 1), false), undefined, "an gelmedi");
  assert.equal(scheduler.due(ambientState(first.wave, moment), true), undefined, "baska ses caliyor: bekliyor");
  assert.equal(scheduler.due(ambientState(first.wave, moment + 3), false)?.id, first.line.id, "ses bitince ayni dalgada");
  scheduler.markPlayed(first.line.id, first.wave);
  assert.equal(scheduler.due(ambientState(first.wave, 99), false), undefined, "bir kez");
  assert.equal(scheduler.pending.entry.line.id, second.line.id);
  assert.equal(scheduler.pending.earliestWave, Math.max(second.wave, first.wave + 5));

  // Tasima: ikinci satirin dalgasi firsat vermeden bitti -> sonraki dalga.
  const carried = second.wave + 1;
  const carriedMoment = Math.ceil(getAmbientMoment("roomX:1", second.line.id, carried) * 100);
  assert.equal(scheduler.due(ambientState(carried, carriedMoment), false)?.id, second.line.id);
  scheduler.markPlayed(second.line.id, carried);
  assert.equal(scheduler.pending.earliestWave, Math.max(scheduler.entries[2].wave, carried + 5), "aralik GERCEKTEN caldigi dalgadan");

  // Yeniden yukleme: depo calanlari hatirliyor.
  const reloaded = new AtlasAmbientScheduler(store);
  reloaded.start("roomX:1", 1);
  assert.equal(reloaded.pending.entry.line.id, scheduler.entries[2].line.id);
  assert.equal(reloaded.due(ambientState(first.wave, 99), false), undefined);

  // Co-op: ayni oda kimligi -> ayni plan ve ayni an.
  const teammate = new AtlasAmbientScheduler(memoryStore());
  teammate.start("roomX:1", 1);
  assert.deepEqual(teammate.entries, scheduler.entries);

  // 3. asama: plan yok.
  const later = new AtlasAmbientScheduler(memoryStore());
  later.start("roomX:3", 3);
  assert.equal(later.entries.length, 0);
  assert.equal(later.due(ambientState(10, 90), false), undefined);
});

test("ara soz hicbir sesi kesmiyor; her ATLAS satiri ve konusma onu kesiyor; ATLAS ayari geceli", () => {
  const url = "audio/atlas-ambient/i-gave-you-mind.mp3";
  const { audio, voice, speakers } = setup({ random: 0 });
  voice.waveStarted(3);
  assert.equal(voice.sayAmbient(url), false, "ATLAS konusurken");
  audio.last.end();
  assert.equal(voice.sayAmbient(url), true);
  assert.equal(voice.playingCategory, "ambient");
  assert.equal(speakers.at(-1), "atlas", "ATLAS gostergesi");
  const ambientLine = audio.last;
  assert.equal(voice.praise(), true, "en dusuk oncelikli ATLAS satiri bile kesiyor");
  assert.equal(ambientLine.stoppedWith, ATLAS_RULES.interruptFadeMs);
  audio.last.end();
  assert.equal(voice.sayAmbient(url), true);
  const second = audio.last;
  voice.playDialogue(byId("conv-1"));
  assert.equal(second.stoppedWith, ATLAS_RULES.interruptFadeMs, "konusma kesiyor");
  assert.equal(voice.sayAmbient(url), false, "konusmada");
  const off = setup({ enabled: false });
  assert.equal(off.voice.sayAmbient(url), false);
  const muted = setup({ volume: 0 });
  assert.equal(muted.voice.sayAmbient(url), false);
  const ended = setup();
  ended.voice.matchEnded("victory");
  ended.audio.last.end();
  assert.equal(ended.voice.sayAmbient(url), false, "mac bitti");
});

// --- Sahne kancalari (kaynak) -------------------------------------------------------

test("sahne: konusma ve ara soz kancalari, uyari tonu ve seri anonsu susuyor, gosterge", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  const body = (name) => {
    const start = scene.indexOf(`  private ${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    const end = scene.indexOf("\n  }\n", start);
    return scene.slice(start, end);
  };
  const dialogues = body("observeAtlasDialogues");
  assert.match(dialogues, /tutorial: snapshot\.tutorial === true \|\| this\.isTutorialRun\(\)/);
  assert.match(dialogues, /creative: snapshot\.creative === true \|\| this\.creativeMode/);
  assert.match(dialogues, /this\.atlasComboWatch\.observe\(local, snapshot\.serverTime\)/);
  assert.match(dialogues, /player\.id === this\.localSessionId/, "kombo yalnizca yerel oyuncu");
  assert.match(dialogues, /this\.atlasNexusDropWatch\.observe\(snapshot\.team\.health, snapshot\.team\.maxHealth\)/);
  assert.match(dialogues, /readAtlasDialoguePlayed\(runKey, id\)/);
  assert.match(dialogues, /atlas\.playDialogue\(dialogue, \{ queue: true \}\)/);
  assert.match(dialogues, /if \(started \|\| isAtlasDialogueEvent\(dialogue\)\) writeAtlasDialoguePlayed\(runKey, dialogue\.id\)/);
  const ambient = body("observeAtlasAmbient");
  assert.match(ambient, /snapshot\.tutorial === true \|\| this\.isTutorialRun\(\) \|\| snapshot\.creative === true \|\| this\.creativeMode\) return;/);
  assert.match(ambient, /const busy = atlas\.isSpeaking \|\| atlas\.inDialogue \|\| streakPlaying;/);
  assert.match(ambient, /atlas\.sayAmbient\(line\.url\)\) this\.atlasAmbient\.markPlayed\(line\.id, snapshot\.team\.wave\)/);
  const observe = body("observeAtlas");
  assert.match(observe, /this\.atlasAmbient\.start\(key, snapshot\.stage \?\? this\.roomStage, \{ seed: key \}\)/);
  assert.match(observe, /atlas\.prefetchUrls\(getAtlasDialogueUrls\(getStageDialogues\(/);
  assert.ok(observe.indexOf("this.observeAtlasAmbient(snapshot);") > observe.indexOf("atlas.praise()"), "ara soz en sonda");
  // Uyari tonu konusmada yok; seri klibi ATLAS (konusma dahil) konusurken yok, calan susuyor.
  assert.match(body("playAlertSound"), /if \(this\.atlas\?\.inDialogue\) return;\s*this\.feedback\?\.playAlert/);
  assert.match(body("playKillStreakAnnouncement"), /if \(this\.atlas\?\.isSpeaking\) \{\s*return(?: undefined)?;/);
  assert.match(body("handleAtlasSpeaking"), /this\.feedback\?\.setDuck\(speaking \? ATLAS_DUCK_GAIN : 1/);
  assert.match(body("handleAtlasSpeaking"), /speaking && this\.streakVoice && !this\.streakVoice\.audio\.paused[\s\S]*this\.streakVoice\.audio\.pause\(\)/);
  // Gosterge: ayni kutu, VESAYET'te dusman tonu ve etiketi.
  const ui = read("apps/web/src/game-control-ui.ts");
  assert.match(ui, /const showAtlas = \(speaking: boolean \| "atlas" \| "vesayet"\) =>/);
  assert.match(ui, /classList\.toggle\("game-hud__atlas--vesayet", speaker === "vesayet"\)/);
  assert.match(ui, /speaker === "vesayet" \? "VESAYET" : "ATLAS"/);
  const css = read("apps/web/src/style.css");
  assert.match(css, /\.game-hud__atlas--vesayet \{[\s\S]*border-color: rgba\(220, 38, 38/);
  assert.match(css, /\.game-hud__atlas--vesayet \.game-hud__atlas-level i \{ background: #dc2626; \}/);
});

test("gosterge metinleri iki dilde", async () => {
  const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
  assert.match(i18n.tr["hud.vesayet.speaking"], /VESAYET/);
  assert.match(i18n.en["hud.vesayet.speaking"], /VESAYET/);
  assert.notEqual(i18n.tr["hud.vesayet.speaking"], i18n.en["hud.vesayet.speaking"]);
});

// --- Dosyalar -------------------------------------------------------------------------

test("dosyalar: manifest tabloyla ayni, her satir var, mono 64 kb/s ~-18 LUFS, tepe <= -1.5 dBTP; ustalar assets-src'de", async () => {
  const manifest = JSON.parse(read("apps/web/public/audio/dialogue/manifest.json"));
  assert.equal(manifest.encoding.channels, 1);
  assert.equal(manifest.encoding.bitrateKbps, 64);
  assert.equal(manifest.encoding.targetLufs, -18);
  assert.deepEqual(manifest.files.map((file) => file.url), getAtlasDialogueUrls());
  for (const dialogue of ATLAS_DIALOGUES) {
    const files = manifest.files.filter((file) => file.dialogue === dialogue.id);
    assert.deepEqual(files.map((file) => file.speaker), dialogue.lines.map((line) => line.speaker), dialogue.id);
  }
  const ambient = JSON.parse(read("apps/web/public/audio/atlas-ambient/manifest.json"));
  assert.deepEqual(ambient.files.map((file) => file.url).sort(), ATLAS_AMBIENT_LINES.map((line) => line.url).sort());
  for (const [dir, file] of [...manifest.files.map((entry) => ["dialogue", entry]), ...ambient.files.map((entry) => ["atlas-ambient", entry])]) {
    const path = `apps/web/public/${file.url}`;
    assert.ok(existsSync(fileUrl(path)), `yok: ${path}`);
    assert.equal(statSync(fileUrl(path)).size, file.bytes, path);
    assert.ok(Math.abs(file.lufs + 18) <= 1, `${path}: ${file.lufs} LUFS`);
    assert.ok(file.truePeak <= -1.5, `${path}: ${file.truePeak} dBTP`);
    assert.ok(file.duration > 1 && file.duration < 12, `${path}: ${file.duration} sn`);
    assert.ok(existsSync(fileUrl(`assets-src/${dir}/${file.source}`)), `usta yok: ${file.source}`);
  }
  const tool = await import("../tools/build-dialogue-voice.mjs");
  assert.deepEqual(tool.DIALOGUE_IDS, ATLAS_DIALOGUES.map((dialogue) => dialogue.id));
  assert.equal(tool.speakerOf("01vesayat-1.mp3"), "vesayet", "sahibin yazimi");
  assert.equal(tool.speakerOf("02atlas-1.mp3"), "atlas");
});

// --- Emegi gecenler -------------------------------------------------------------------

test("emegi gecenler: VESAYET ve konusmalar ElevenLabs ucretli plan altinda; ara sozler ATLAS bolumunde", async () => {
  const { CREDIT_GROUPS, CREDITS_DEVELOPER } = await importWebModule("apps/web/src/credits.ts");
  const voice = CREDIT_GROUPS.find((group) => group.id === "voice").sources;
  const vesayet = voice.find((source) => source.id === "vesayet-voice");
  assert.ok(vesayet, "VESAYET satiri yok");
  assert.match(vesayet.title, /VESAYET/);
  assert.ok(vesayet.author.includes(CREDITS_DEVELOPER));
  assert.match(vesayet.author, /ElevenLabs/);
  assert.equal(vesayet.license, "ElevenLabs paid plan: commercial use allowed");
  const credits = read("CREDITS.md");
  const section = credits.slice(credits.indexOf("### Ses: ATLAS telsiz anonsları"), credits.indexOf("### Seri anonsları"));
  assert.ok(section.includes("apps/web/public/audio/dialogue/"));
  assert.ok(section.includes("apps/web/public/audio/atlas-ambient/"));
  assert.ok(section.includes("assets-src/dialogue/"));
  assert.match(section, /VESAYET/);
  const english = credits.slice(credits.indexOf("## English summary"));
  assert.match(english, /ATLAS–VESAYET[\s\S]*VESAYET was voiced by the developer with\s+ElevenLabs on the same paid plan/);
  const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
  assert.match(i18n.tr["credits.group.voice.note"], /VESAYET/);
  assert.match(i18n.en["credits.group.voice.note"], /VESAYET/);
});
