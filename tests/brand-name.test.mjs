/**
 * Oyunun adi "Defense Protocol": marka adi, her dilde ayni, cevrilmiyor.
 * Sayfa basligi, PWA manifesti, menu logosu, emegi gecenler, belgeler ve
 * itch paketi bu adi tasiyor; eski ad ("Uzay Savunma") oyuncuya gorunen hicbir
 * yerde kalmadi. Depo anahtarlari (`karayel_*`, `uzay_*`) ve paket adlari
 * (`@karayel/*`) ic kimlik: degismiyor, yoksa oyuncunun ilerlemesi silinir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const BRAND = "Defense Protocol";
const OLD_NAME = /uzay[\s-]*savunma/i;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const PLAYER_FACING = [
  "apps/web/index.html",
  "apps/web/public/manifest.webmanifest",
  "apps/web/public/audio/sfx/LICENSE.txt",
  "apps/web/src/menu-ui.ts",
  "apps/web/src/locales/areas/credits.ts",
  "apps/web/src/locales/tr.ts",
  "apps/web/src/locales/en.ts",
  "tools/build-sfx.mjs",
  "tools/build-itch.mjs",
  "PRIVACY.md",
  "CREDITS.md",
  "README.md",
  "docs/itch-io.md",
  "docs/itch-page/README.md",
  "docs/itch-page/tr.md",
  "docs/itch-page/en.md",
  "docs/mobile-test-checklist.md"
];

test("sayfa basligi, ana ekran adi ve PWA manifesti yeni adda", () => {
  const html = read("apps/web/index.html");
  assert.match(html, /<title>Defense Protocol<\/title>/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Defense Protocol"/);
  const manifest = JSON.parse(read("apps/web/public/manifest.webmanifest"));
  assert.equal(manifest.name, BRAND);
  assert.equal(manifest.short_name, BRAND);
});

test("menu logosu ve emegi gecenler ekrani yeni adda; ad cevrilmiyor", async () => {
  const menu = read("apps/web/src/menu-ui.ts");
  assert.ok(menu.includes(`<h1 class="brand__word">${BRAND}</h1>`));
  assert.ok(menu.includes(`<h2>${BRAND}</h2>`));
  const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
  assert.ok(i18n.tr["credits.intro"].startsWith(`${BRAND}'de `), "Turkce ek kesme isaretiyle");
  assert.ok(i18n.en["credits.intro"].includes(BRAND));
});

test("itch paketi defense-protocol-web.zip; belge ayni adi veriyor", () => {
  assert.ok(read("tools/build-itch.mjs").includes('"dist/itch/defense-protocol-web.zip"'));
  const doc = read("docs/itch-io.md");
  assert.ok(doc.includes("`dist/itch/defense-protocol-web.zip`"));
  assert.ok(doc.includes("`defense-protocol-web.zip`"));
});

test("oyuncuya gorunen dosyalarda eski ad kalmadi; ic kimlikler yerinde", () => {
  for (const path of PLAYER_FACING) assert.doesNotMatch(read(path), OLD_NAME, path);
  assert.ok(read("apps/web/src/i18n.ts").includes('LOCALE_STORAGE_KEY = "uzay_locale"'));
  assert.ok(read("apps/web/src/tutorial.ts").includes('"uzay_tutorial_v1"'));
  assert.ok(read("apps/web/src/telemetry.ts").includes('"karayel_install_id"'));
  assert.match(read("apps/server/fly.toml"), /^app = "karayel-online"/m);
});
