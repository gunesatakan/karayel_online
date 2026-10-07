/**
 * Istemci (apps/web) modulunu node testinde calistirmak.
 *
 * Testler derlenmis `dist`i okuyor; istemcinin derlenmis bir node ciktisi
 * yok (vite tarayici paketi uretiyor). Saf cizim modulleri (kit, profiller,
 * isin cizicisi) Phaser'a calisma aninda dokunmuyor, yalnizca tipini
 * kullaniyor; esbuild onlari tek dosyaya paketleyip gecici bir yere yaziyor.
 * `phaser` yine de bir yerden calisma aninda istenirse kucuk bir koca
 * yonleniyor: testin gercek WebGL'e ihtiyaci yok.
 */
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const cache = new Map();
let outDir;

export async function importWebModule(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath);
  const result = await build({
    entryPoints: [join(root, relativePath)],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    write: false,
    logLevel: "silent",
    alias: {
      phaser: join(root, "tests/helpers/phaser-stub.mjs"),
      // Colyseus istemcisi node'a ESM olarak paketlenemiyor (dinamik `require`).
      // Oturum modulu yalnizca sinifin kendisini tutuyor; testler sahte oda veriyor.
      "colyseus.js": join(root, "tests/helpers/colyseus-client-stub.mjs")
    }
  });
  if (!outDir) {
    outDir = mkdtempSync(join(tmpdir(), "karayel-web-"));
    // Paketler ice aktarildiktan sonra dosyaya gerek yok; surec biterken
    // gecici klasor siliniyor (test calismalari temp'i doldurmasin).
    const dir = outDir;
    process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  }
  const file = join(outDir, `${relativePath.replace(/[\\/.:]/g, "_")}.mjs`);
  writeFileSync(file, result.outputFiles[0].text, "utf8");
  const loaded = withTurkishBrowser(() => import(pathToFileURL(file).href));
  cache.set(relativePath, loaded);
  return loaded;
}

/**
 * Istemcinin dili acilista tarayici dilinden seciliyor (apps/web/src/i18n.ts);
 * node'un `navigator.language`i makinenin diline bakiyor. Testler Turkce
 * kaynak metne gore yazili: paket degerlendirilirken tarayici Turkce
 * gorunuyor, sonuc makineden bagimsiz. Dili sinayan test kendi sahte
 * navigator'unu kuruyor (tests/initial-locale.test.mjs).
 */
let turkishDepth = 0;
let savedNavigator;

async function withTurkishBrowser(load) {
  if (turkishDepth === 0) {
    savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: {
        hardwareConcurrency: original?.hardwareConcurrency,
        platform: original?.platform,
        userAgent: original?.userAgent,
        language: "tr-TR",
        languages: ["tr-TR"]
      },
      configurable: true,
      writable: true,
      enumerable: true
    });
  }
  turkishDepth += 1;
  try {
    return await load();
  } finally {
    turkishDepth -= 1;
    if (turkishDepth === 0) {
      if (savedNavigator) Object.defineProperty(globalThis, "navigator", savedNavigator);
      else delete globalThis.navigator;
    }
  }
}

/**
 * Kayitci Graphics: her cagriyi adi ve argumanlariyla yaziyor.
 *
 * Iki cizimin "ayni" oldugunu soylemek icin piksel degil cagri dizisi
 * karsilastiriliyor: ayni sirada ayni sayilarla ayni cagrilar ayni goruntu.
 * Zincirleme (`fillStyle(...).fillCircle(...)`) icin her cagri kendini dondurur.
 */
export function createRecorder() {
  const calls = [];
  const handler = {
    get(_object, property) {
      if (property === "calls") return calls;
      if (property === "then") return undefined;
      return (...args) => {
        calls.push([property, ...args.map(normalizeArgument)]);
        return proxy;
      };
    }
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

function normalizeArgument(value) {
  if (Array.isArray(value)) {
    return value.map((point) => (point && typeof point === "object" ? { x: point.x, y: point.y } : point));
  }
  return value;
}

/**
 * Sayan Graphics: cagri, uretilen kose ve ucgenleme (earcut) sayisi.
 *
 * Mobilde Graphics'in maliyeti CPU'da her karede yeniden ucgenlemek. Sayilar
 * Phaser 3.90'in WebGL cizicisinden (GraphicsWebGLRenderer, MultiPipeline):
 *
 * - Her yay (fillCircle, strokeCircle, arc) yaricaptan bagimsiz 101 nokta
 *   (`iterStep = 0.01`). Dolu daire 101 noktalik bir cokgen: earcut ve ~99
 *   ucgen (297 kose). Cizgi daire 101 parca: her parca bir dortgen, aradaki
 *   her eklem bir dortgen daha (~1212 kose).
 * - lineBetween tek dortgen (6 kose). Yol cizgisi parca basina ~12 kose.
 * - fillPoints / fillPath / fillEllipse earcut; ellipse varsayilan 32 nokta.
 *
 * Daire bu yuzden bir cizgiden ~50-200 kat pahali: olcumun asil sordugu sey.
 */
export const ARC_POINTS = 101;

export function createCountingGraphics() {
  const stats = { calls: 0, vertices: 0, earcut: 0, byMethod: Object.create(null) };
  let pathPoints = 0;
  const fillPolygon = (points) => {
    stats.earcut += 1;
    return Math.max(0, points - 2) * 3;
  };
  const strokePolyline = (points) => Math.max(0, points - 1) * 12;
  const costs = {
    lineBetween: () => 6,
    fillCircle: () => fillPolygon(ARC_POINTS),
    strokeCircle: () => strokePolyline(ARC_POINTS + 1),
    fillEllipse: (args) => fillPolygon(args[4] ?? 32),
    strokeEllipse: (args) => strokePolyline((args[4] ?? 32) + 1),
    fillTriangle: () => 3,
    strokeTriangle: () => strokePolyline(4),
    fillRect: () => 6,
    strokeRect: () => strokePolyline(5),
    fillRoundedRect: () => fillPolygon(4 * 26),
    strokeRoundedRect: () => strokePolyline(4 * 26),
    fillPoints: (args) => fillPolygon(Array.isArray(args[0]) ? args[0].length : 0),
    strokePoints: (args) => strokePolyline(Array.isArray(args[0]) ? args[0].length + 1 : 0)
  };
  const handler = {
    get(_object, property) {
      if (property === "stats") return stats;
      if (property === "reset") return () => { stats.calls = 0; stats.vertices = 0; stats.earcut = 0; stats.byMethod = Object.create(null); };
      if (property === "then") return undefined;
      return (...args) => {
        stats.calls += 1;
        stats.byMethod[property] = (stats.byMethod[property] ?? 0) + 1;
        if (property === "beginPath") pathPoints = 0;
        if (property === "moveTo" || property === "lineTo") pathPoints += 1;
        if (property === "arc") pathPoints += ARC_POINTS;
        if (property === "strokePath") stats.vertices += strokePolyline(pathPoints);
        if (property === "fillPath") stats.vertices += fillPolygon(pathPoints);
        const cost = costs[property];
        if (cost) stats.vertices += cost(args);
        return proxy;
      };
    }
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}
