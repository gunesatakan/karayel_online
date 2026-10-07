/**
 * Emegi gecenler (apps/web/src/credits.ts) ve CREDITS.md ayni listeyi
 * tasiyor: moduldeki her kaynagin adi, yazari, lisansi ve baglantisi
 * CREDITS.md'de geciyor. Ses grubu sfx manifestiyle (tools/build-sfx.mjs)
 * ayni paketleri listeliyor. Ekran menude bir girisle aciliyor ve metinleri
 * iki dilde de var.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const { CREDIT_GROUPS, CREDIT_SOURCES, CREDITS_DEVELOPER, creditLinkLabel } = await importWebModule("apps/web/src/credits.ts");
const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
const credits = read("CREDITS.md");

test("moduldeki her kaynak CREDITS.md'de: ad, yazar, lisans, baglanti", () => {
  assert.ok(CREDIT_SOURCES.length > 0);
  for (const source of CREDIT_SOURCES) {
    for (const field of ["title", "author", "license", "url"]) {
      assert.ok(source[field].trim().length > 0, `${source.id}.${field} bos`);
      assert.ok(credits.includes(source[field]), `CREDITS.md'de yok: ${source.id}.${field} = ${source[field]}`);
    }
  }
  assert.ok(credits.includes(CREDITS_DEVELOPER), "gelistirici adi CREDITS.md'de yok");
});

test("kaynak kimlikleri tekil, baglantilar https", () => {
  const ids = CREDIT_SOURCES.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const source of CREDIT_SOURCES) assert.match(source.url, /^https:\/\//, source.id);
  assert.equal(creditLinkLabel("https://www.kenney.nl/assets/impact-sounds/"), "kenney.nl/assets/impact-sounds");
});

test("ses grubu sfx manifesti ve LICENSE.txt ile ayni paketler", () => {
  const manifest = JSON.parse(read("apps/web/public/audio/sfx/manifest.json"));
  const license = read("apps/web/public/audio/sfx/LICENSE.txt");
  const audio = CREDIT_GROUPS.find((group) => group.id === "audio").sources;
  const fromManifest = Object.values(manifest.sources).map((source) => `${source.title}|${source.author}|${source.url}`).sort();
  const fromModule = audio.map((source) => `${source.title}|${source.author}|${source.url}`).sort();
  assert.deepEqual(fromModule, fromManifest);
  for (const source of Object.values(manifest.sources)) {
    assert.equal(source.license, "CC0-1.0");
    assert.ok(license.includes(source.url), `LICENSE.txt'de yok: ${source.url}`);
    assert.ok(credits.includes(source.url), `CREDITS.md'de yok: ${source.url}`);
  }
  for (const source of audio) assert.equal(source.license, "CC0 1.0");
});

test("grup basliklari ve notlari iki dilde, kaynak adlari cevrilmiyor", () => {
  for (const group of CREDIT_GROUPS) {
    for (const key of [group.titleKey, group.noteKey]) {
      assert.ok(key in i18n.tr, `${key} Turkcede yok`);
      assert.ok(key in i18n.en, `${key} Ingilizcede yok`);
      assert.notEqual(i18n.tr[key], i18n.en[key], `${key} cevrilmemis`);
    }
  }
  for (const key of ["credits.menuButton", "credits.title", "credits.license", "credits.linkAria", "credits.game.body"]) {
    assert.ok(key in i18n.tr && key in i18n.en, key);
  }
});

test("menude Emegi gecenler girisi ve ekrani var; ekran modulden ciziliyor", () => {
  const menu = read("apps/web/src/menu-ui.ts");
  assert.match(menu, /data-view="credits"/);
  assert.match(menu, /view === "credits" \? renderCredits\(\)/);
  assert.match(menu, /function renderCredits\(\)[\s\S]*CREDIT_GROUPS\.map/);
  assert.match(menu, /rel="noopener noreferrer"/);
});

test("lisanssiz ticari muzik pakette yok ve oyun muzik yuklemiyor", () => {
  for (const path of ["apps/web/public/audio/background-theme.mp3", "apps/web/public/audio/zeynep-theme.mp3"]) {
    assert.ok(!existsSync(new URL(`../${path}`, import.meta.url)), `hala pakette: ${path}`);
  }
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.doesNotMatch(scene, /background-theme|zeynep-theme/);
});

test("geliştirici yapımı varliklar CREDITS.md'de yollariyla listeli", () => {
  const start = credits.indexOf("## Geliştirici yapımı varlıklar");
  assert.ok(start >= 0, "bolum yok");
  assert.ok(!credits.includes("## Kaynağı doğrulanamayanlar"), "eski bolum hala duruyor");
  const section = credits.slice(start, credits.indexOf("## Notlar"));
  assert.ok(section.includes(CREDITS_DEVELOPER), "bolum gelistirici adini anmiyor");
  for (const path of [
    "apps/web/public/audio/streak-granted.mp3",
    "apps/web/public/audio/kill-streak-deep.mp3",
    "apps/web/public/images/enemies/enemy-grunt.png",
    "apps/web/public/images/towers/tower-zeynep-1.webp",
    "apps/web/public/images/towers/tower-warrior-1-level-10.png",
    "apps/web/public/images/splash-siege.webp",
    "apps/web/public/images/zeynep-puppet-hands.png",
    "apps/web/public/images/melis-creepy.png"
  ]) {
    assert.ok(section.includes(path), `listede yok: ${path}`);
  }
});

test("yapay zeka beyani CREDITS.md'de Turkce ve Ingilizce, ekran metinlerinde iki dilde", () => {
  const english = credits.slice(credits.indexOf("## English summary"));
  assert.match(credits, /### Yapay zekâ beyanı/);
  assert.match(credits.slice(0, credits.indexOf("## English summary")), /üretken yapay zekâ araçlarıyla/);
  assert.match(english, /\*\*AI disclosure:\*\*[\s\S]*generative AI/);
  assert.match(english, /game currently has no music/);
  assert.match(i18n.tr["credits.game.body"], /yapay zekâ/);
  assert.match(i18n.en["credits.game.body"], /generative AI/);
});
