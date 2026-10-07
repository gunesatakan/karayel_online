/**
 * Ilk dil (apps/web/src/i18n.ts): kayitli secim (`uzay_locale`) her zaman
 * kazanir. Secim yoksa tarayicinin ilk tercih ettigi dil Turkceyse ("tr*")
 * Turkce, baska her durumda Ingilizce. Depolama ya da navigator okunamazsa
 * oyun yine aciliyor; sayfanin `lang` niteligi secilen dile esitleniyor.
 *
 * Modul acilista dili bir kez okuyor; her senaryo icin paket yeni bir sorgu
 * ekiyle yeniden degerlendiriliyor (sahte window/navigator/document ile).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { importWebModule } from "./helpers/web-module.mjs";

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

const { resolveInitialLocale, LOCALE_STORAGE_KEY } = await importWebModule("tests/fixtures/i18n-entry.ts");

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
    const module = await import(`${pathToFileURL(bundleFile).href}?boot=${evaluation}`);
    return module.getLocale();
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

test("resolveInitialLocale: kayitli secim kazanir, yoksa tarayici dili", () => {
  assert.equal(LOCALE_STORAGE_KEY, "uzay_locale", "anahtar degismedi (oyuncunun secimi kaybolmasin)");
  assert.equal(resolveInitialLocale("tr", ["en-US"]), "tr");
  assert.equal(resolveInitialLocale("en", ["tr-TR"]), "en");
  assert.equal(resolveInitialLocale(null, ["tr-TR", "en-US"]), "tr");
  assert.equal(resolveInitialLocale(null, ["tr"]), "tr");
  assert.equal(resolveInitialLocale(undefined, ["TR-tr"]), "tr", "buyuk-kucuk harf fark etmiyor");
  assert.equal(resolveInitialLocale(null, ["en-US", "tr-TR"]), "en", "ilk tercih kazanir");
  assert.equal(resolveInitialLocale(null, ["de-DE"]), "en");
  assert.equal(resolveInitialLocale(null, ["trk"]), "en", "yalnizca 'tr' dil kodu");
  assert.equal(resolveInitialLocale(null, []), "en");
  assert.equal(resolveInitialLocale(null, [undefined, "", "tr-TR"]), "tr", "bos girdiler atlaniyor");
  assert.equal(resolveInitialLocale("fr", ["tr-TR"]), "tr", "gecersiz kayit yok sayiliyor");
  assert.equal(resolveInitialLocale("fr", ["fr-FR"]), "en");
});

test("acilis: secim yok, tarayici Turkce -> Turkce ve lang=tr", async () => {
  const document = fakeDocument();
  document.documentElement.lang = "en";
  const locale = await bootWith({
    window: { localStorage: fakeStorage() },
    navigator: { language: "tr-TR", languages: ["tr-TR", "en-US"] },
    document
  });
  assert.equal(locale, "tr");
  assert.equal(document.documentElement.lang, "tr");
});

test("acilis: secim yok, tarayici Ingilizce ya da baska dil -> Ingilizce ve lang=en", async () => {
  for (const navigator of [{ language: "en-US", languages: ["en-US"] }, { language: "de-DE", languages: [] }]) {
    const document = fakeDocument();
    const locale = await bootWith({ window: { localStorage: fakeStorage() }, navigator, document });
    assert.equal(locale, "en", navigator.language);
    assert.equal(document.documentElement.lang, "en", navigator.language);
  }
});

test("acilis: kayitli secim tarayici dilini yeniyor", async () => {
  const toTr = fakeDocument();
  assert.equal(await bootWith({
    window: { localStorage: fakeStorage({ [LOCALE_STORAGE_KEY]: "tr" }) },
    navigator: { language: "en-US", languages: ["en-US"] },
    document: toTr
  }), "tr");
  assert.equal(toTr.documentElement.lang, "tr");

  const toEn = fakeDocument();
  assert.equal(await bootWith({
    window: { localStorage: fakeStorage({ [LOCALE_STORAGE_KEY]: "en" }) },
    navigator: { language: "tr-TR", languages: ["tr-TR"] },
    document: toEn
  }), "en");
  assert.equal(toEn.documentElement.lang, "en");
});

test("acilis: depolama ve navigator hata verse de ya da hic olmasa da acilir", async () => {
  const throwingWindow = { get localStorage() { throw new Error("SecurityError"); } };
  const throwingNavigator = { get languages() { throw new Error("yok"); }, get language() { throw new Error("yok"); } };
  assert.equal(await bootWith({ window: throwingWindow, navigator: throwingNavigator, document: fakeDocument() }), "en");
  // Depolama kapali ama tarayici Turkce: yine Turkce.
  assert.equal(await bootWith({ window: throwingWindow, navigator: { language: "tr-TR" }, document: fakeDocument() }), "tr");
  // Node gibi: window, navigator ve document yok.
  assert.equal(await bootWith({ window: undefined, navigator: undefined, document: undefined }), "en");
});
