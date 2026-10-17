/**
 * Operator bedeni, istemci tarafi: boy, doku hatti, ZentaX'in emir halkalari,
 * cizimin (sahte sahneyle) davranisi ve GameScene baglantisi.
 *
 * Sozler: beden gelismis iscinin %50 buyugu; doku saydam ve kirpilmis
 * (kaynak `assets-src/operator-bodies/`); ZentaX'in bedeni acik emir
 * kademesine gore isiniyor (kademe kadar yay); is basinda isin, yaralida can
 * cubugu, dusuk canda uyari halkasi; hareket azaltmada iz yok; sahne bedeni
 * telden ciziyor, kuyruktaki hayaletleri tutuyor, red gelince hayaleti
 * kaldiriyor ve yenilgide bedeni patlatiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const bodies = await importWebModule("apps/web/src/vfx/operator-bodies.ts");
const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const scene = read("apps/web/src/scenes/GameScene.ts");

test("boy: mutlak (~19,6), iscilerin %10 kuculmesinden bagimsiz; isci hesabi GameScene'le ayni", () => {
  // GameScene: drone dokusu 30, isci olcegi 0.69 * 0.75 * WORKER_VISUAL_SCALE, gelismis govde orani 0.42.
  assert.match(scene, /const ADVANCED_WORKER_BODY_RADIUS_RATIO = 0\.42;/);
  assert.match(scene, /const workerScale = isLogisticsWorker \? 0\.69 \* 0\.75 \* WORKER_VISUAL_SCALE :/);
  assert.match(read("apps/web/src/scenes/PreloaderScene.ts"), /createDroneTexture\(key: string, color: number, accent: number\) \{\n\s+const graphics = this\.make\.graphics\(\{ x: 0, y: 0 \}, false\);\n\s+const size = 30;/);
  assert.ok(Math.abs(bodies.ADVANCED_WORKER_DISPLAY_DIAMETER - 30 * 0.69 * 0.75 * 0.9 * 0.42 * 2) < 1e-9);
  // Beden eski boyunda: iscinin kuculmeden onceki capi x 1.5 = 19,5615.
  assert.ok(Math.abs(bodies.OPERATOR_BODY_DISPLAY_SIZE - 19.5615) < 1e-9);
  assert.ok(Math.abs(bodies.OPERATOR_BODY_SIZE_RATIO - 1.5 / 0.9) < 1e-9);
});

test("doku: iki operatorun saydam dokusu var, kaynaklari ve yapim araci depoda", () => {
  for (const [characterId, path] of Object.entries(bodies.OPERATOR_BODY_TEXTURE_PATHS)) {
    const file = new URL(`../apps/web/public/${path}`, import.meta.url);
    assert.ok(existsSync(file), `${characterId} dokusu yok`);
    const bytes = readFileSync(file);
    // RIFF....WEBPVP8L: kayipsiz, alfali webp.
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "RIFF");
    assert.equal(bytes.subarray(8, 15).toString("latin1"), "WEBPVP8");
    assert.ok(statSync(file).size < 80_000, `${characterId} dokusu buyuk`);
  }
  assert.deepEqual(Object.keys(bodies.OPERATOR_BODY_TEXTURE_PATHS).sort(), ["warrior", "zeynep"]);
  for (const source of ["assets-src/operator-bodies/zentax-body.webp", "assets-src/operator-bodies/attacklord-body.webp", "tools/build-operator-bodies.mjs"]) {
    assert.ok(existsSync(new URL(`../${source}`, import.meta.url)), `${source} yok`);
  }
  const preloader = read("apps/web/src/scenes/PreloaderScene.ts");
  assert.match(preloader, /OPERATOR_BODY_TEXTURE_PATHS/);
  assert.match(preloader, /getOperatorBodyTextureKey/);
});

test("ZentaX halkasi: acik emir basina bir halka, kademe kadar yay; bitince yok", () => {
  assert.deepEqual(bodies.getZeynepBodyAura(undefined), []);
  assert.deepEqual(bodies.getZeynepBodyAura({}), []);
  const one = bodies.getZeynepBodyAura({ haste: { tier: "small", multiplier: 1.2, remainingMs: 4000 } });
  assert.equal(one.length, 1);
  assert.equal(one[0].command, "haste");
  assert.equal(one[0].arcs, 1);
  const all = bodies.getZeynepBodyAura({
    haste: { tier: "big", multiplier: 1.6, remainingMs: 4000 },
    range: { tier: "medium", multiplier: 1.3, remainingMs: 3000 },
    slow: { tier: "small", multiplier: 0.8, remainingMs: 2000 }
  });
  assert.deepEqual(all.map((ring) => [ring.command, ring.tier, ring.arcs]).sort(), [["haste", 3, 3], ["range", 2, 2], ["slow", 1, 1]]);
  // Kademe yukseldikce daha belirgin.
  const tiers = ["small", "medium", "big"].map((tier) => bodies.getZeynepBodyAura({ haste: { tier, multiplier: 1, remainingMs: 1 } })[0].alpha);
  assert.ok(tiers[0] < tiers[1] && tiers[1] < tiers[2]);
  // Biten emir halka birakmiyor.
  assert.deepEqual(bodies.getZeynepBodyAura({ haste: { tier: "big", multiplier: 1.6, remainingMs: 0 } }), []);
  // Halkalar farkli yaricapta; ust uste binmiyor.
  assert.equal(new Set(all.map((ring) => ring.radius)).size, 3);
});

test("dusuk can: esigin altinda uyari; olmeyen kipte (ogretici/yaratici) ve dusmus bedende yok", () => {
  assert.equal(bodies.isOperatorBodyLowHp({ hp: 100, mhp: 360, s: "i" }), true);
  assert.equal(bodies.isOperatorBodyLowHp({ hp: 200, mhp: 360, s: "i" }), false);
  assert.equal(bodies.isOperatorBodyLowHp({ hp: 100, mhp: 360, s: "i", inv: 1 }), false);
  assert.equal(bodies.isOperatorBodyLowHp({ hp: 0, mhp: 360, s: "d" }), false);
});

test("ara degerleme: ayni bedende konum ve can dogrusal; yeni gelen oldugu gibi", () => {
  const previous = [{ id: "a", c: "zeynep", x: 0, y: 0, hp: 100, mhp: 360, s: "m" }];
  const next = [{ id: "a", c: "zeynep", x: 100, y: 50, hp: 200, mhp: 360, s: "m" }, { id: "b", c: "warrior", x: 5, y: 5, hp: 360, mhp: 360, s: "i" }];
  const [a, b] = bodies.interpolateOperatorBodies(previous, next, 0.5);
  assert.deepEqual([a.x, a.y, a.hp], [50, 25, 150]);
  assert.equal(b, next[1]);
  assert.equal(bodies.interpolateOperatorBodies(undefined, next, 0.5), next);
});

/** Sahte sahne: imaj kaydi ve kayitci Graphics. */
function fakeScene() {
  const images = [];
  const graphics = [];
  const scene = {
    textures: { exists: (key) => key.startsWith("operator-body-") },
    add: {
      graphics() {
        const recorder = createRecorder();
        graphics.push(recorder);
        return recorder;
      },
      image(x, y, key) {
        const image = { key, x, y, rotation: 0, displayWidth: 0, alpha: 1, tint: undefined, destroyed: false };
        image.setDepth = () => image;
        image.setPosition = (px, py) => { image.x = px; image.y = py; return image; };
        image.setRotation = (r) => { image.rotation = r; return image; };
        image.setDisplaySize = (w) => { image.displayWidth = w; return image; };
        image.setAlpha = (a) => { image.alpha = a; return image; };
        image.setTint = (t) => { image.tint = t; return image; };
        image.clearTint = () => { image.tint = undefined; return image; };
        image.destroy = () => { image.destroyed = true; };
        images.push(image);
        return image;
      }
    }
  };
  return { scene, images, graphics };
}

const callsOf = (graphics, name) => graphics.flatMap((g) => g.calls).filter((call) => call[0] === name);

test("cizim: doku, boy, is isini, can cubugu, dusuk can uyarisi ve dusus", () => {
  const { scene, images, graphics } = fakeScene();
  const lows = [];
  const downs = [];
  const view = new bodies.OperatorBodyView(scene, {
    lod: new VfxLod(),
    reducedMotion: () => false,
    localSessionId: () => "p1",
    onLowHp: (body) => lows.push(body.id),
    onDown: (body) => downs.push(body.id)
  });
  const base = { id: "p1", c: "warrior", x: 100, y: 100, hp: 360, mhp: 360, s: "i" };
  view.render([base], { now: 1000, scale: 1 });
  assert.equal(images.length, 1);
  assert.equal(images[0].key, "operator-body-warrior");
  assert.ok(Math.abs(images[0].displayWidth * bodies.OPERATOR_BODY_TEXTURE_CONTENT - bodies.OPERATOR_BODY_DISPLAY_SIZE) < 0.5);
  // Tam canda cubuk yok.
  assert.equal(callsOf(graphics, "fillRect").length, 0);

  // Is basinda: govdeden hedefe isin.
  for (const g of graphics) g.calls.length = 0;
  view.render([{ ...base, s: "w", wx: 140, wy: 100 }], { now: 1016, scale: 1 });
  assert.ok(callsOf(graphics, "lineBetween").some((call) => call[3] === 140 && call[4] === 100), "is isini yok");

  // Yarali: can cubugu; dusuk canda bir kez uyari.
  for (const g of graphics) g.calls.length = 0;
  view.render([{ ...base, hp: 90 }], { now: 1032, scale: 1 });
  view.render([{ ...base, hp: 80 }], { now: 1048, scale: 1 });
  assert.ok(callsOf(graphics, "fillRect").length >= 2, "can cubugu yok");
  assert.deepEqual(lows, ["p1"]);

  // Dustu: bir kez, sonuk kabuk.
  view.render([{ ...base, hp: 0, s: "d" }], { now: 1064, scale: 1 });
  view.render([{ ...base, hp: 0, s: "d" }], { now: 1080, scale: 1 });
  assert.deepEqual(downs, ["p1"]);
  assert.ok(images[0].tint !== undefined);

  // Telden kalkan beden siliniyor.
  view.render(undefined, { now: 1100, scale: 1 });
  assert.equal(images[0].destroyed, true);
  view.destroy();
});

test("cizim: ucusta kisa iz; hareket azaltmada iz yok; ZentaX emir halkasi yay ciziyor", () => {
  for (const still of [false, true]) {
    const { scene, graphics } = fakeScene();
    const view = new bodies.OperatorBodyView(scene, { lod: new VfxLod(), reducedMotion: () => still, localSessionId: () => "p1" });
    for (let frame = 0; frame < 8; frame += 1) {
      view.render([{ id: "p1", c: "zeynep", x: 100 + frame * 12, y: 100, hp: 360, mhp: 360, s: "m" }], {
        now: 1000 + frame * 16,
        scale: 1,
        zeynepCommands: { haste: { tier: "big", multiplier: 1.6, remainingMs: 4000 } }
      });
    }
    const [, trail] = graphics;
    const trailLines = trail.calls.filter((call) => call[0] === "lineBetween").length;
    if (still) assert.equal(trailLines, 0, "hareket azaltmada iz cizildi");
    else assert.ok(trailLines > 0, "ucusta iz yok");
    assert.ok(callsOf(graphics, "arc").length >= 3, "buyuk kademe uc yay cizmedi");
    view.destroy();
  }
});

test("GameScene baglantisi: telden cizim, ara degerleme, hayaletler, red, ulti hizasi, yenilgi patlamasi", () => {
  assert.match(scene, /this\.operatorBodyView\?\.render\(frame\.snapshot\.bodies, \{/);
  assert.match(scene, /zeynepCommands: frame\.snapshot\.zeynepCommands/);
  assert.match(scene, /bodies: interpolateOperatorBodies\(previous\.bodies, next\.bodies, alpha\)/);
  // Ard arda birakilan kulelerin her biri kendi hayaletiyle; bedenin kuyrugu hayaleti tutuyor.
  assert.match(scene, /private pendingPlacements: Array</);
  assert.match(scene, /snapshot\.bodies\?\.find\(\(body\) => body\.id === this\.localSessionId\)\?\.q/);
  assert.match(scene, /this\.dropPendingPlacementAt\(message\?\.x, message\?\.y\);/);
  assert.match(scene, /room\.onMessage\("body:task-failed"/);
  assert.match(scene, /this\.room\?\.send\("useUltimate", \{ column, y: pointer\.worldY \}\);/);
  assert.match(scene, /if \(result === "defeat" && summary\.bodyOwnerId\) \{/);
  assert.match(scene, /stage\.vfx\.detonate\(body\.x, body\.y,/);
  assert.match(scene, /t\("scene\.body\.lowHp"\)/);
});
