/**
 * Oyunun adi "Nexhold": marka adi, her dilde ayni, cevrilmiyor. Turkce ekler
 * kesme isaretiyle ("Nexhold'da", "Nexhold'un").
 * Sayfa basligi, PWA manifesti, menu logosu, emegi gecenler, belgeler ve
 * itch paketi bu adi tasiyor; eski adlar ("Uzay Savunma", "Defense Protocol")
 * oyuncuya gorunen hicbir yerde kalmadi. Depo anahtarlari (`karayel_*`,
 * `uzay_*`) ve paket adlari (`@karayel/*`) ic kimlik: degismiyor, yoksa
 * oyuncunun ilerlemesi silinir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const BRAND = "Nexhold";
const OLD_NAMES = [/uzay[\s-]*savunma/i, /defense[\s-]*protocol/i];
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
  "tools/itch-cover/cover.html",
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
  assert.match(html, /<title>Nexhold<\/title>/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Nexhold"/);
  const manifest = JSON.parse(read("apps/web/public/manifest.webmanifest"));
  assert.equal(manifest.name, BRAND);
  assert.equal(manifest.short_name, BRAND);
});

test("menu logosu ve emegi gecenler ekrani yeni adda; ad cevrilmiyor", async () => {
  const menu = read("apps/web/src/menu-ui.ts");
  assert.ok(menu.includes(`<h1 class="brand__word">${BRAND}</h1>`));
  assert.ok(menu.includes(`<h2>${BRAND}</h2>`));
  const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
  assert.ok(i18n.tr["credits.intro"].startsWith(`${BRAND}'da `), "Turkce ek kesme isaretiyle");
  assert.ok(i18n.en["credits.intro"].includes(`used in ${BRAND}.`));
  assert.ok(read("CREDITS.md").includes(`${BRAND}'un oyunla birlikte`));
});

test("ses lisans dosyasi ve ureticisi ayni basligi tasiyor", () => {
  const header = `${BRAND} savas sesi ornekleri\n${"=".repeat(`${BRAND} savas sesi ornekleri`.length)}\n`;
  assert.ok(read("apps/web/public/audio/sfx/LICENSE.txt").startsWith(header));
  assert.ok(read("tools/build-sfx.mjs").includes(`return \`${header}`));
});

test("itch paketi nexhold-web.zip; belge ayni adi veriyor", () => {
  assert.ok(read("tools/build-itch.mjs").includes('"dist/itch/nexhold-web.zip"'));
  const doc = read("docs/itch-io.md");
  assert.ok(doc.includes("`dist/itch/nexhold-web.zip`"));
  assert.ok(doc.includes("`nexhold-web.zip`"));
});

test("kapak afisi yeni adda; alt baslik ayni", () => {
  const cover = read("tools/itch-cover/cover.html");
  assert.ok(cover.includes("<h1>NEXHOLD</h1>"));
  assert.ok(cover.includes("CO-OP TOWER DEFENSE"));
});

test("oyuncuya gorunen dosyalarda eski adlar kalmadi; ic kimlikler yerinde", () => {
  for (const path of PLAYER_FACING) {
    const text = read(path);
    for (const old of OLD_NAMES) assert.doesNotMatch(text, old, path);
  }
  assert.ok(read("apps/web/src/i18n.ts").includes('LOCALE_STORAGE_KEY = "uzay_locale"'));
  assert.ok(read("apps/web/src/tutorial.ts").includes('"uzay_tutorial_v1"'));
  assert.ok(read("apps/web/src/telemetry.ts").includes('"karayel_install_id"'));
  assert.match(read("apps/server/fly.toml"), /^app = "karayel-online"/m);
});
