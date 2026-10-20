/**
 * Dalga muzigi (apps/web/src/wave-music.ts).
 *
 * TRACK_01 6, 10, 14, 18. dalgalarin savasinda; TRACK_02 4, 9, 16. dalgalarda.
 * Kaydirici varsayilandayken %30. WebAudio dongusu dosyanin icindeki dongu
 * noktalarini kullaniyor; oynatici sahte baglamla calistiriliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const music = await importWebModule("apps/web/src/wave-music.ts");
const { DEFAULT_MUSIC_VOLUME } = await importWebModule("apps/web/src/menu-music.ts");
const {
  WAVE_MUSIC_TRACKS,
  WAVE_MUSIC_GAIN,
  WAVE_MUSIC_FADE_IN_SEC,
  WAVE_MUSIC_FADE_OUT_SEC,
  MP3_ENCODER_DELAY_SEC,
  WaveMusicPlayer,
  getWaveMusicTrack,
  getWaveMusicTrackForState,
  getWaveMusicLevel,
  getWaveMusicLoopPoints
} = music;

test("dalga listesi: TRACK_01 6-10-14-18, TRACK_02 4-9-16, digerleri muziksiz", () => {
  const byWave = {};
  for (let wave = 1; wave <= 20; wave += 1) byWave[wave] = getWaveMusicTrack(wave)?.id;
  assert.deepEqual(Object.entries(byWave).filter(([, id]) => id).map(([wave, id]) => `${wave}:${id}`), [
    "4:track-02", "6:track-01", "9:track-02", "10:track-01", "14:track-01", "16:track-02", "18:track-01"
  ]);
});

test("yalnizca savas sirasinda: kurulum, temizlenme ve mac sonu sessiz", () => {
  const base = { wave: 6, setupPhase: false, enemiesLeft: 12, over: false };
  assert.equal(getWaveMusicTrackForState(base)?.id, "track-01");
  assert.equal(getWaveMusicTrackForState({ ...base, setupPhase: true }), undefined);
  assert.equal(getWaveMusicTrackForState({ ...base, enemiesLeft: 0 }), undefined);
  assert.equal(getWaveMusicTrackForState({ ...base, over: true }), undefined);
  assert.equal(getWaveMusicTrackForState({ ...base, wave: 5 }), undefined);
  assert.equal(getWaveMusicTrackForState({ ...base, wave: 9 })?.id, "track-02");
});

test("seviye: varsayilan kaydiricida %30, kaydiriciyla olcekli, ATLAS kisiyor", () => {
  assert.equal(WAVE_MUSIC_GAIN, 0.3);
  assert.ok(Math.abs(getWaveMusicLevel(DEFAULT_MUSIC_VOLUME) - 0.3) < 1e-9);
  assert.equal(getWaveMusicLevel(0), 0);
  assert.ok(Math.abs(getWaveMusicLevel(DEFAULT_MUSIC_VOLUME / 2) - 0.15) < 1e-9);
  assert.ok(Math.abs(getWaveMusicLevel(DEFAULT_MUSIC_VOLUME, 0.65) - 0.195) < 1e-9);
});

test("dongu noktalari dosyayla tutarli; kirpilmamis kodlayici gecikmesi kaydiriliyor", () => {
  for (const track of WAVE_MUSIC_TRACKS) {
    assert.ok(track.loopStartSec > 0 && track.loopStartSec < track.loopEndSec, track.id);
    assert.ok(track.loopEndSec <= track.lengthSec + 1e-9, track.id);
    assert.ok(track.loopEndSec - track.loopStartSec > 20, `${track.id} dongu cok kisa`);
    const trimmed = getWaveMusicLoopPoints(track, track.lengthSec);
    assert.deepEqual(trimmed, { offset: 0, loopStart: track.loopStartSec, loopEnd: track.loopEndSec });
    const raw = getWaveMusicLoopPoints(track, track.lengthSec + 0.05);
    assert.equal(raw.offset, MP3_ENCODER_DELAY_SEC);
    assert.ok(Math.abs(raw.loopEnd - track.loopEndSec - MP3_ENCODER_DELAY_SEC) < 1e-12);
    const size = statSync(new URL(`../apps/web/public/${track.path}`, import.meta.url)).size;
    assert.ok(size > 300 * 1024 && size < 2 * 1024 * 1024, `${track.id}: ${size}`);
  }
  // Service worker muzigi onden onbelleğe almiyor (menu muzigi kurali).
  assert.doesNotMatch(read("apps/web/public/sw.js"), /audio\/music|track-0/);
});

class FakeParam {
  constructor(value) { this.value = value; this.events = []; }
  setValueAtTime(v, t) { this.events.push(["set", v, t]); this.value = v; }
  linearRampToValueAtTime(v, t) { this.events.push(["ramp", v, t]); this.value = v; }
  setTargetAtTime(v, t, c) { this.events.push(["target", v, t, c]); this.value = v; }
  cancelScheduledValues(t) { this.events.push(["cancel", t]); }
}
class FakeContext {
  constructor() { this.state = "running"; this.currentTime = 10; this.sources = []; this.gains = []; this.destination = {}; this.resumes = 0; }
  createGain() { const g = { gain: new FakeParam(1), connect: (to) => { g.to = to; }, disconnect() { g.disconnected = true; } }; this.gains.push(g); return g; }
  createBufferSource() {
    const s = { connect: (to) => { s.to = to; }, disconnect() {}, start: (at, offset) => { s.started = [at, offset]; }, stop: (at) => { s.stoppedAt = at ?? "now"; } };
    this.sources.push(s);
    return s;
  }
  decodeAudioData(bytes) { return Promise.resolve({ duration: bytes.duration }); }
  resume() { this.resumes += 1; return Promise.resolve(); }
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("oynatici: dongu kuruluyor, ayni parca yeniden baslamiyor, temizlenince soluyor", async () => {
  const ctx = new FakeContext();
  const loads = [];
  const player = new WaveMusicPlayer({
    getContext: () => ctx,
    load: (url) => { loads.push(url); return Promise.resolve({ duration: WAVE_MUSIC_TRACKS[0].lengthSec }); }
  });
  player.setLevel(0.3);
  const track = getWaveMusicTrack(6);
  player.update(track);
  player.update(track);
  await flush();
  assert.equal(ctx.sources.length, 1, "ayni parca ikinci kez baslamamali");
  assert.equal(loads.length, 1);
  assert.match(loads[0], /audio\/music\/track-01\.mp3$/);
  const source = ctx.sources[0];
  assert.equal(source.loop, true);
  assert.equal(source.loopStart, track.loopStartSec);
  assert.equal(source.loopEnd, track.loopEndSec);
  assert.deepEqual(source.started, [10, 0], "giris bir kez, bastan");
  const [master, voice] = ctx.gains;
  assert.equal(master.to, ctx.destination);
  assert.equal(master.gain.value, 0.3);
  assert.deepEqual(voice.gain.events.at(-1), ["ramp", 1, 10 + WAVE_MUSIC_FADE_IN_SEC]);
  assert.equal(player.playingTrackId, "track-01");

  player.setLevel(0.15);
  assert.deepEqual(master.gain.events.at(-1).slice(0, 2), ["target", 0.15]);

  ctx.currentTime = 40;
  player.update(undefined);
  assert.deepEqual(voice.gain.events.at(-1), ["ramp", 0, 40 + WAVE_MUSIC_FADE_OUT_SEC]);
  assert.ok(source.stoppedAt > 40 + WAVE_MUSIC_FADE_OUT_SEC);
  assert.equal(player.playingTrackId, undefined);

  // Sonraki muzikli dalga parcayi bastan aliyor; tampon onbellekte.
  player.update(getWaveMusicTrack(10));
  await flush();
  assert.equal(ctx.sources.length, 2);
  assert.equal(loads.length, 1);
  player.destroy();
  assert.ok(ctx.sources[1].stoppedAt);
});

test("oynatici: kilitli baglamda baslamiyor, acilinca sonraki cagrida basliyor; yuklenirken iptal", async () => {
  const ctx = new FakeContext();
  ctx.state = "suspended";
  const player = new WaveMusicPlayer({ getContext: () => ctx, load: () => Promise.resolve({ duration: 30 }) });
  const track = getWaveMusicTrack(4);
  player.update(track);
  await flush();
  assert.equal(ctx.sources.length, 0);
  assert.equal(ctx.resumes, 1);
  ctx.state = "running";
  player.update(track);
  player.update(undefined); // dalga yuklenirken bitti
  await flush();
  assert.equal(ctx.sources.length, 0, "iptal edilen ses baslamamali");
  player.update(track);
  await flush();
  assert.equal(ctx.sources.length, 1);
  // Kirpilmamis cozum: gecikme kadar kaydiriliyor.
  assert.deepEqual(ctx.sources[0].started, [10, MP3_ENCODER_DELAY_SEC]);
  assert.equal(ctx.sources[0].loopStart, track.loopStartSec + MP3_ENCODER_DELAY_SEC);
});

test("GameScene baglantisi: snapshot, seviye, ATLAS kisilmasi, kapanis", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /this\.observeAtlas\(snapshot\);\n\s+this\.updateWaveMusic\(snapshot\);/);
  assert.match(scene, /new WaveMusicPlayer\(\{ getContext: \(\) => feedback\.getSharedAudioContext\(\) \}\)/);
  assert.equal((scene.match(/this\.waveMusic\?\.setLevel\(getWaveMusicLevel\(this\.musicVolume, this\.atlasMusicDuck\)\)/g) ?? []).length, 2);
  assert.match(scene, /this\.waveMusic\?\.destroy\(\);\n\s+this\.waveMusic = undefined;[\s\S]{0,600}this\.feedback\?\.destroy\(\);/);
  assert.match(scene, /const over = Boolean\(snapshot\.result\) \|\| this\.matchResultShown \|\| this\.tutorialMode;/);
});
