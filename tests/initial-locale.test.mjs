/**
 * Ilk dil (apps/web/src/i18n.ts): kayitli secim (`uzay_locale`) her zaman
 * kazanir. Secim yoksa oyun Ingilizce aciliyor; tarayici dili bakilmiyor
 * (sahibin karari). Depolama okunamazsa oyun yine aciliyor; sayfanin `lang`
 * niteligi secilen dile esitleniyor.
 *
 * Modul acilista dili bir kez okuyor; her senaryo icin paket yeni bir sorgu
 * ekiyle yeniden degerlendiriliyor (sahte window/navigator/document ile).
 * Bu paket oyunla ayni: `__DEFAULT_LOCALE__` tanimsiz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  entryPoints: [join(root, "apps/web/src/i18n.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "silent"
});
const dir = mkdtempSync(join(tmpdir(), "karayel-locale-"));
process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
const bundleFile = join(dir, "i18n.mjs");
writeFileSync(bundleFile, bundle.outputFiles[0].text, "utf8");

let evaluation = 0;
const GLOBALS = ["window", "navigator", "document"];

/** Sahte ortamda modulu bastan degerlendirir; globaller sonra geri konuyor. */
async function bootWith({ window, navigator, document }) {
  const saved = GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const install = (name, value) => {
    if (value === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, { value, configurable: true, writable: true, enumerable: true });
  };
  install("window", window);
  install("navigator", navigator);
  install("document", document);
  try {
    evaluation += 1;
    return await import(`${pathToFileURL(bundleFile).href}?boot=${evaluation}`);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) };
}

const fakeDocument = () => ({ documentElement: { lang: "tr" } });
const turkishBrowser = { language: "tr-TR", languages: ["tr-TR", "en-US"] };

test("resolveInitialLocale: kayitli gecerli secim kazanir, yoksa varsayilan", async () => {
  const module = await bootWith({ window: undefined, navigator: undefined, document: undefined });
  const { resolveInitialLocale, LOCALE_STORAGE_KEY, DEFAULT_LOCALE } = module;
  assert.equal(LOCALE_STORAGE_KEY, "uzay_locale", "anahtar degismedi (oyuncunun secimi kaybolmasin)");
  assert.equal(DEFAULT_LOCALE, "en", "oyun varsayilan olarak Ingilizce");
  assert.equal(resolveInitialLocale("tr"), "tr");
  assert.equal(resolveInitialLocale("en"), "en");
  assert.equal(resolveInitialLocale(null), "en");
  assert.equal(resolveInitialLocale(undefined), "en");
  assert.equal(resolveInitialLocale("fr"), "en", "gecersiz kayit yok sayiliyor");
  assert.equal(resolveInitialLocale(null, "tr"), "tr", "varsayilan disaridan verilebilir");
});

test("acilis: secim yok -> tarayici Turkce olsa da Ingilizce ve lang=en", async () => {
  for (const navigator of [turkishBrowser, { language: "en-US", languages: ["en-US"] }, { language: "de-DE", languages: [] }]) {
    const document = fakeDocument();
    const module = await bootWith({ window: { localStorage: fakeStorage() }, navigator, document });
    assert.equal(module.getLocale(), "en", navigator.language);
    assert.equal(document.documentElement.lang, "en", navigator.language);
  }
});

test("acilis: kayitli secim kazanir", async () => {
  const toTr = fakeDocument();
  const tr = await bootWith({
    window: { localStorage: fakeStorage({ uzay_locale: "tr" }) },
    navigator: { language: "en-US", languages: ["en-US"] },
    document: toTr
  });
  assert.equal(tr.getLocale(), "tr");
  assert.equal(toTr.documentElement.lang, "tr");

  const toEn = fakeDocument();
  const en = await bootWith({ window: { localStorage: fakeStorage({ uzay_locale: "en" }) }, navigator: turkishBrowser, document: toEn });
  assert.equal(en.getLocale(), "en");
  assert.equal(toEn.documentElement.lang, "en");
});

test("acilis: depolama hata verse de ya da hic olmasa da Ingilizce acilir", async () => {
  const throwingWindow = { get localStorage() { throw new Error("SecurityError"); } };
  assert.equal((await bootWith({ window: throwingWindow, navigator: turkishBrowser, document: fakeDocument() })).getLocale(), "en");
  // Node gibi: window, navigator ve document yok.
  assert.equal((await bootWith({ window: undefined, navigator: undefined, document: undefined })).getLocale(), "en");
});
