/**
 * Bounty Board Arcade koprusu (apps/web/src/arcade.ts, apps/web/src/boot.ts).
 *
 * Inceleme notu: Bounty Board'un cercevesinde ilerleme hic kaydedilmiyordu.
 * Oyun tarayici depolamasina yaziyor, oradaki saydam olmayan koken ise
 * `localStorage`a erisimde hata firlatiyor; operatorlerin ve asamalarin cogu
 * bu yuzden acilamiyordu. Cozum SDK'nin bulut kaydina bagli depolama katmani.
 * Kilitlenen:
 * - katman depolamaya dokunan ilk koddan once kuruluyor ve oyun bulut
 *   okumasini bekliyor, ama sinirli bir sure;
 * - SDK yuk tasimiyor: barindirici yokken ya da SDK firlatinca oyun calisiyor;
 * - odullu reklam kapali;
 * - oynanis sinyalleri eslesiyor ve skor kosu basina bir kez, tam sayi olarak
 *   gidiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const arcadeModule = await importWebModule("apps/web/src/arcade.ts");
const { createArcadeBridge, ARCADE_STORAGE_WAIT_MS } = arcadeModule;
const { getArcadeRunScore } = await importWebModule("apps/web/src/arcade-score.ts");
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

function fakeHost(overrides = {}) {
  const calls = [];
  const host = {
    init: (options) => { calls.push(["init", options]); return Promise.resolve(); },
    gameLoadingFinished: () => calls.push(["gameLoadingFinished"]),
    gameplayStart: () => calls.push(["gameplayStart"]),
    gameplayStop: () => calls.push(["gameplayStop"]),
    gameOver: (score) => calls.push(["gameOver", score]),
    storage: {
      install: () => { calls.push(["install"]); return "cloud"; },
      ready: () => Promise.resolve("cloud"),
      flush: () => { calls.push(["flush"]); return Promise.resolve(); },
      ...overrides.storage
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "storage"))
  };
  return { host, calls, names: () => calls.map(([name]) => name) };
}

test("barındırıcı yokken (node, Vercel, itch) köprü hiçbir şeyi kırmıyor", async () => {
  const { arcade } = arcadeModule;
  arcade.loadingFinished();
  arcade.gameplayStart();
  arcade.gameOver(12);
  arcade.gameplayStop();
  arcade.flushStorage();
  const mode = await arcade.whenStorageReady(500);
  assert.notEqual(mode, "timeout", "barindirici yokken acilis bekledi");
});

test("başlangıç: depolama katmanı el sıkışmadan önce kuruluyor, ödüllü reklam kapalı", () => {
  const { host, calls, names } = fakeHost();
  createArcadeBridge(host).start();
  assert.deepEqual(names(), ["install", "init"]);
  assert.deepEqual(calls[1][1], { rewardedAds: { enabled: false } });
});

test("açılış bulut okumasını bekliyor ama sınırlı: geç kalan ya da bozulan barındırıcı oyunu durdurmuyor", async () => {
  assert.equal(await createArcadeBridge(fakeHost().host).whenStorageReady(1000), "cloud");
  // Hic cevap vermeyen barindirici: sure dolunca oyun aciliyor.
  const silent = fakeHost({ storage: { ready: () => new Promise(() => undefined) } });
  const started = Date.now();
  assert.equal(await createArcadeBridge(silent.host).whenStorageReady(40), "timeout");
  assert.ok(Date.now() - started < 1000);
  // Reddeden ya da firlatan `ready` de acilisi durdurmuyor.
  const rejecting = fakeHost({ storage: { ready: () => Promise.reject(new Error("x")) } });
  assert.equal(await createArcadeBridge(rejecting.host).whenStorageReady(1000), "error");
  const throwing = fakeHost({ storage: { ready: () => { throw new Error("x"); } } });
  assert.equal(await createArcadeBridge(throwing.host).whenStorageReady(1000), "error");
  assert.ok(ARCADE_STORAGE_WAIT_MS >= 3000 && ARCADE_STORAGE_WAIT_MS <= 15000);
});

test("SDK fırlatsa ya da reddetse de köprü oyuna hata taşımıyor", async () => {
  const boom = () => { throw new Error("sdk"); };
  const { host } = fakeHost({
    init: () => Promise.reject(new Error("init")),
    gameLoadingFinished: boom,
    gameplayStart: boom,
    gameplayStop: boom,
    gameOver: boom,
    storage: { install: boom, flush: () => Promise.reject(new Error("flush")) }
  });
  const bridge = createArcadeBridge(host);
  bridge.start();
  bridge.loadingFinished();
  bridge.gameplayStart();
  bridge.gameOver(5);
  bridge.gameplayStop();
  bridge.flushStorage();
  // Reddedilen sozler yakalanmamis hata olarak sizmiyor.
  await new Promise((resolve) => setTimeout(resolve, 10));
});

test("oynanış sinyalleri eşleşiyor; skor koşu başına bir kez ve tam sayı", () => {
  const { host, calls, names } = fakeHost();
  const bridge = createArcadeBridge(host);
  bridge.loadingFinished();
  bridge.loadingFinished();
  // Her anlik goruntude cagriliyor: yalnizca ilki gider.
  bridge.gameplayStart();
  bridge.gameplayStart();
  bridge.gameOver(47.9);
  bridge.gameOver(99);
  bridge.gameplayStop();
  assert.deepEqual(names(), ["gameLoadingFinished", "gameplayStart", "gameplayStop", "gameOver"]);
  assert.deepEqual(calls.at(-1), ["gameOver", 47]);
  // Yeni kosu: yeniden baslar, skor yeniden bir kez.
  bridge.gameplayStart();
  bridge.gameOver(-3);
  assert.deepEqual(calls.slice(-3), [["gameplayStart"], ["gameplayStop"], ["gameOver", 0]]);
});

test("canlı başlamamış koşu skor yollamıyor; menüye dönüş yalnızca oynanışı durduruyor", () => {
  const late = fakeHost();
  // Mac bittikten sonra katilan: canli anlik goruntu hic gelmedi.
  createArcadeBridge(late.host).gameOver(30);
  assert.deepEqual(late.names(), []);
  const quit = fakeHost();
  const bridge = createArcadeBridge(quit.host);
  bridge.gameplayStart();
  bridge.gameplayStop();
  bridge.gameplayStop();
  bridge.flushStorage();
  assert.deepEqual(quit.names(), ["gameplayStart", "gameplayStop", "flush"]);
});

test("skor aşamalar boyunca ulaşılan toplam dalga", () => {
  assert.equal(getArcadeRunScore({ stage: 1, wave: 7 }), 7);
  assert.equal(getArcadeRunScore({ stage: 3, wave: 7 }), 47);
  assert.equal(getArcadeRunScore({ stage: 5, wave: 20 }), 100);
  // Asama bilinmiyorsa 1; bozuk degerler sifira, dalga asamanin son dalgasina kirpiliyor.
  assert.equal(getArcadeRunScore({ wave: 12.8 }), 12);
  assert.equal(getArcadeRunScore({ stage: 2, wave: 999 }), 40);
  assert.equal(getArcadeRunScore({ stage: Number.NaN, wave: -4 }), 0);
  assert.equal(getArcadeRunScore({}), 0);
});

test("giriş dosyası önce depolamayı kuruyor, oyunu bulut okumasından sonra yüklüyor", () => {
  assert.match(source("apps/web/index.html"), /<script type="module" src="\/src\/boot\.ts"><\/script>/);
  const boot = source("apps/web/src/boot.ts");
  const imports = [...boot.matchAll(/^import\s.*?from\s+"([^"]+)";|^import\s+"([^"]+)";/gm)].map((match) => match[1] ?? match[2]);
  // Depolamaya dokunabilecek hicbir modul statik olarak ice aktarilmiyor.
  assert.deepEqual(imports, ["./arcade", "./style.css"]);
  assert.match(boot, /arcade\.whenStorageReady\(\)\.then\(\(\) => import\("\.\/main"\)\)/);
  // Katman modul yuklenirken kuruluyor; modul SDK disinda bir sey cekmiyor
  // (giris parcasi oyundan once yukleniyor, kucuk kalmali).
  const arcadeSource = source("apps/web/src/arcade.ts");
  assert.match(arcadeSource, /\narcade\.start\(\);\n/);
  assert.deepEqual([...arcadeSource.matchAll(/^import\s.*?from\s+"([^"]+)";/gm)].map((match) => match[1]), ["@bountyboard/arcade-sdk"]);
  const scene = source("apps/web/src/scenes/GameScene.ts");
  assert.equal(scene.split("arcade.gameOver(").length - 1, 1, "skor tek bir yerden gitmeli");
  const report = scene.slice(scene.indexOf("  private openRunReport("), scene.indexOf("  private recordWaveBadges("));
  assert.ok(report.includes("arcade.gameOver("), "skor kosu raporu acilirken gitmiyor");
  assert.ok(report.indexOf("this.matchResultShown = true;") < report.indexOf("arcade.gameOver("), "skor tek seferlik kapidan once gidiyor");
});
