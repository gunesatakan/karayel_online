/**
 * Lobi muzigi (apps/web/src/menu-music.ts).
 *
 * Menude ve co-op bekleme odasinda tek parca ("Last Stand"): ilk dokunusta
 * calmaya basliyor, mac baslarken ~600 ms'de susup kaynagini birakiyor, sekme
 * gizlenince duruyor. Seviye oyun icindeki muzik kaydiricisinin yarisi. Mac
 * kendisi muziksiz kaliyor (GameScene `getBackgroundMusicPath` bos yol).
 *
 * Denetleyici sahte ses ogesi, depo ve zamanlayiciyla calistiriliyor; menu ve
 * sahnedeki baglanti kaynaktan dogrulaniyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const {
  MenuMusic,
  MENU_MUSIC_PATH,
  MENU_MUSIC_GAIN,
  MENU_MUSIC_FADE_MS,
  MUSIC_VOLUME_STORAGE_KEY,
  MENU_MUSIC_MUTED_STORAGE_KEY,
  DEFAULT_MUSIC_VOLUME,
  readMusicSetting
} = await importWebModule("apps/web/src/menu-music.ts");
const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");

/** Tarayicinin `HTMLAudioElement`i gibi davranan sahte; play() istenirse reddediyor. */
function createFakeAudio({ reject = false } = {}) {
  const audio = {
    src: "",
    preload: "",
    loop: false,
    volume: 1,
    paused: true,
    plays: 0,
    loads: 0,
    attributes: new Set(),
    reject,
    play() {
      audio.plays += 1;
      if (audio.reject) return Promise.reject(new Error("NotAllowedError"));
      audio.paused = false;
      return Promise.resolve();
    },
    pause() {
      audio.paused = true;
    },
    load() {
      audio.loads += 1;
    },
    removeAttribute(name) {
      if (name === "src") audio.src = "";
    }
  };
  return audio;
}

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map
  };
}

/** Elle ilerletilen zamanlayici: kisilma adimlarini tek tek yurutmek icin. */
function createTimers() {
  const intervals = new Map();
  let next = 1;
  return {
    setInterval: (callback, ms) => {
      const id = next++;
      intervals.set(id, { callback, ms });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    advance(ms) {
      for (const [id, interval] of [...intervals]) {
        let elapsed = 0;
        while (intervals.has(id) && elapsed + interval.ms <= ms) {
          elapsed += interval.ms;
          interval.callback();
        }
      }
    },
    get active() {
      return intervals.size;
    }
  };
}

function setup({ storage = createStorage(), reject = false } = {}) {
  const created = [];
  const timers = createTimers();
  const music = new MenuMusic({
    createAudio: () => {
      const audio = createFakeAudio({ reject });
      created.push(audio);
      return audio;
    },
    storage: () => storage,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval
  });
  return { music, created, timers, storage };
}

test("menu gorununce kaynak baglaniyor ama dokunusa kadar calmiyor", () => {
  const { music, created } = setup();
  music.attach();
  assert.equal(created.length, 1);
  const [audio] = created;
  assert.equal(audio.preload, "auto");
  assert.equal(audio.loop, true);
  assert.equal(audio.src, `/${MENU_MUSIC_PATH}`, "assetUrl ile cozuluyor");
  assert.equal(audio.plays, 0, "otomatik calma yok");
  assert.equal(audio.paused, true);
  music.attach();
  assert.equal(created.length, 1, "ikinci attach yeni oge acmiyor");
});

test("ilk dokunusta caliyor; ikinci dokunus yeniden play() cagirmiyor", () => {
  const { music, created } = setup();
  music.attach();
  music.handleGesture();
  assert.equal(created[0].plays, 1);
  assert.equal(music.isPlaying, true);
  music.handleGesture();
  assert.equal(created[0].plays, 1);
});

test("attach'tan once gelen dokunus kaynagi kendisi baglayip caliyor", () => {
  const { music, created } = setup();
  music.handleGesture();
  assert.equal(created.length, 1);
  assert.equal(created[0].plays, 1);
});

test("tarayici reddederse hata yutuluyor, sonraki dokunus yeniden deniyor", async () => {
  const { music, created } = setup({ reject: true });
  music.attach();
  assert.doesNotThrow(() => music.handleGesture());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(music.isPlaying, false);
  created[0].reject = false;
  music.handleGesture();
  assert.equal(created[0].plays, 2);
  assert.equal(music.isPlaying, true);
});

test("seviye: oyun icindeki muzik kaydiricisinin yarisi; ayar yoksa varsayilanin yarisi", () => {
  const stored = setup({ storage: createStorage({ [MUSIC_VOLUME_STORAGE_KEY]: "0.8" }) });
  stored.music.handleGesture();
  assert.equal(MENU_MUSIC_GAIN, 0.5);
  assert.ok(Math.abs(stored.created[0].volume - 0.4) < 1e-9);

  const fresh = setup();
  fresh.music.handleGesture();
  assert.ok(Math.abs(fresh.created[0].volume - DEFAULT_MUSIC_VOLUME * MENU_MUSIC_GAIN) < 1e-9);

  const silent = setup({ storage: createStorage({ [MUSIC_VOLUME_STORAGE_KEY]: "0" }) });
  silent.music.handleGesture();
  assert.equal(silent.created[0].volume, 0, "kaydirici sifirsa lobi de sessiz");

  assert.equal(readMusicSetting(() => createStorage({ [MUSIC_VOLUME_STORAGE_KEY]: "abc" })), DEFAULT_MUSIC_VOLUME);
  assert.equal(readMusicSetting(() => createStorage({ [MUSIC_VOLUME_STORAGE_KEY]: "7" })), 1);
  assert.equal(readMusicSetting(() => { throw new Error("SecurityError"); }), DEFAULT_MUSIC_VOLUME, "depo hatasi yutuluyor");
});

test("mac baslayinca ~600 ms'de kisilip duruyor ve kaynak birakiliyor", () => {
  const { music, created, timers } = setup();
  music.handleGesture();
  const [audio] = created;
  const start = audio.volume;
  music.stop();
  assert.equal(MENU_MUSIC_FADE_MS, 600);
  assert.equal(music.isStopped, true);
  assert.equal(audio.paused, false, "kisilma bitmeden durmuyor");
  timers.advance(MENU_MUSIC_FADE_MS / 2);
  assert.ok(audio.volume < start && audio.volume > 0, "yarida seviye inmis");
  timers.advance(MENU_MUSIC_FADE_MS);
  assert.equal(audio.paused, true);
  assert.equal(audio.volume, 0);
  assert.equal(audio.src, "", "kaynak birakildi: mac sirasinda indirme yok");
  assert.equal(audio.loads, 1);
  assert.equal(timers.active, 0);
});

test("durdurulduktan sonra dokunus, gorunurluk ve dugme yeniden caldirmiyor", () => {
  const { music, created, timers } = setup();
  music.handleGesture();
  music.stop();
  timers.advance(1000);
  music.handleGesture();
  music.setHidden(true);
  music.setHidden(false);
  music.setMuted(false);
  music.attach();
  assert.equal(created.length, 1, "mac sirasinda yeni kaynak baglanmiyor");
  assert.equal(created[0].plays, 1);
  assert.equal(created[0].paused, true);
});

test("calmadan once mac baslarsa kisilma beklemeden kaynak birakiliyor", () => {
  const { music, created, timers } = setup();
  music.attach();
  music.stop();
  assert.equal(timers.active, 0);
  assert.equal(created[0].src, "");
  assert.equal(created[0].plays, 0);
});

test("sekme gizlenince duruyor, gorununce caliyorduysa devam ediyor", () => {
  const { music, created } = setup();
  music.handleGesture();
  music.setHidden(true);
  assert.equal(created[0].paused, true);
  music.setHidden(false);
  assert.equal(created[0].paused, false);
  assert.equal(created[0].plays, 2);

  const idle = setup();
  idle.music.attach();
  idle.music.setHidden(true);
  idle.music.setHidden(false);
  assert.equal(idle.created[0].plays, 0, "hic calmadiysa gorununce de calmiyor");
});

test("sessiz dugmesi: kalici bayrak, kapatinca duruyor, acinca caliyor", () => {
  const storage = createStorage();
  const { music, created } = setup({ storage });
  music.handleGesture();
  music.setMuted(true);
  assert.equal(created[0].paused, true);
  assert.equal(storage.map.get(MENU_MUSIC_MUTED_STORAGE_KEY), "1");
  assert.equal(storage.map.has(MUSIC_VOLUME_STORAGE_KEY), false, "kaydiricinin degeri ezilmiyor");
  music.handleGesture();
  assert.equal(created[0].paused, true, "sessizken dokunus caldirmiyor");
  music.setMuted(false);
  assert.equal(created[0].paused, false);
  assert.equal(storage.map.get(MENU_MUSIC_MUTED_STORAGE_KEY), "0");

  const reloaded = setup({ storage: createStorage({ [MENU_MUSIC_MUTED_STORAGE_KEY]: "1" }) });
  assert.equal(reloaded.music.isMuted, true, "yenilemede korunuyor");
  reloaded.music.attach();
  reloaded.music.handleGesture();
  assert.equal(reloaded.created.length, 0, "sessizken parca indirilmiyor");
  reloaded.music.setMuted(false);
  assert.equal(reloaded.created.length, 1, "acinca baglanip caliyor");
  assert.equal(reloaded.created[0].plays, 1);
});

test("depo hata atsa da dugme calisiyor", () => {
  const created = [];
  const music = new MenuMusic({
    createAudio: () => { const audio = createFakeAudio(); created.push(audio); return audio; },
    storage: () => { throw new Error("SecurityError"); },
    setInterval: () => 0,
    clearInterval: () => undefined
  });
  assert.equal(music.isMuted, false);
  assert.doesNotThrow(() => music.handleGesture());
  assert.doesNotThrow(() => music.setMuted(true));
  assert.equal(music.isMuted, true);
});

test("menu muzigi kuruyor, mac baslarken susturuyor; alt seritte iki dilli dugme var", () => {
  const menu = read("apps/web/src/menu-ui.ts");
  assert.match(menu, /installMenuMusic\(/);
  const startGame = menu.slice(menu.indexOf("const startGame = "), menu.indexOf("const bindLobbyRoom = "));
  assert.match(startGame, /onlineGameStarting = true;[\s\S]*menuMusic\.stop\(\);[\s\S]*game\.scene\.start\("game"/, "sahne baslamadan once susuyor");
  assert.match(menu, /data-menu-music-toggle/);
  assert.match(menu, /\$\{renderMusicToggle\(readMenuMusicMuted\(\)\)\}\s*\$\{renderLocalePicker\(\)\}/);
  for (const key of ["menu.music.label", "menu.music.on", "menu.music.off"]) {
    assert.ok(key in i18n.tr && key in i18n.en, key);
    assert.notEqual(i18n.tr[key], i18n.en[key], `${key} cevrilmemis`);
  }
});

test("mac muziksiz: GameScene arka plan muzigi icin bos yol donduruyor ve lobi parcasini yuklemiyor", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /function getBackgroundMusicPath\(_characterId: CharacterId\): string \{\n\s*return "";\n\}/);
  assert.doesNotMatch(scene, /last-stand|MENU_MUSIC_PATH/);
  assert.match(scene, /import \{ DEFAULT_MUSIC_VOLUME, MUSIC_VOLUME_STORAGE_KEY \} from "\.\.\/menu-music"/, "kaydirici ayni depo anahtarini kullaniyor");
});

test("parca pakette, makul boyutta; service worker onden onbelleğe almiyor", () => {
  const size = statSync(new URL(`../apps/web/public/${MENU_MUSIC_PATH}`, import.meta.url)).size;
  assert.ok(size > 500 * 1024, `cok kucuk: ${size}`);
  assert.ok(size < 5 * 1024 * 1024, `cok buyuk: ${size}`);
  const sw = read("apps/web/public/sw.js");
  assert.doesNotMatch(sw, /last-stand|audio\/music/);
});
