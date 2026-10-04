/**
 * Debug Lazer ortak kitin ustunde: gorunusu bir piksel bile degismedi.
 *
 * Lazer sahibin begendigi tek efekt ve kitin olcutu. Cizimi GameScene'den
 * `BeamRenderer`a tasindi ve teknikleri (kesit, beyaza cekme, hale, kosan
 * parlamalar, kivilcimlar, namlu) kitin saf fonksiyonlarina ayrildi. Bu test
 * eski cizimin harfi harfine kopyasini (tests/fixtures/legacy-debug-laser.ts)
 * ve yeni cizimi ayni kayitci Graphics'e cizdirip **her cagriyi, her sayiyi**
 * karsilastiriyor. Ayni cagrilar ayni sirada ayni sayilarla = ayni goruntu.
 *
 * Kapsam: uc kademe, asiri yukleme acik/kapali, farkli genislikler, yonler
 * (yatay, capraz, sifir boy) ve sahne saatleri (kivilcim kusaklari, nefes,
 * dugumun turu).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const { LegacyDebugLaser } = await importWebModule("tests/fixtures/legacy-debug-laser.ts");
const { BeamRenderer } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
const kit = await importWebModule("apps/web/src/vfx/kit.ts");

const geometries = [
  { x1: 120, y1: 300, x2: 260, y2: 300 },
  { x1: 195, y1: 410, x2: 37.25, y2: -12.5 },
  { x1: 50, y1: 50, x2: 50.4, y2: 50.3 },
  { x1: 300, y1: 120, x2: 301, y2: 690 }
];
const sceneTimes = [0, 16.7, 123.4, 999.99, 5555.5, 98765.4321, 1234567.8];
const tierColors = { 1: [0xef4444, 0xfbbf24], 2: [0x60a5fa, 0x60a5fa], 3: [0xffffff, 0xffffff] };

function* laserBeams() {
  let index = 0;
  for (const tier of [undefined, 2, 3]) {
    for (const overdrive of [false, true]) {
      for (const geometry of geometries) {
        const colors = tierColors[tier ?? 1];
        yield {
          id: `beam-t${index++}`,
          definitionId: "warrior-5",
          tier,
          ...geometry,
          width: overdrive ? 8 : 4,
          color: overdrive ? colors[1] : colors[0],
          overdrive,
          ttlMs: 260
        };
      }
    }
  }
}

test("Debug Lazer kitle cizildiginde eski cizimle cagri cagri ayni", () => {
  let compared = 0;
  for (const beam of laserBeams()) {
    for (const sceneNow of sceneTimes) {
      const before = createRecorder();
      new LegacyDebugLaser(before, { now: sceneNow }).draw(beam, beam.color);

      const after = createRecorder();
      // Efekt saati bilerek farkli: lazer yalnizca sahne saatini okumali.
      // Hareket azaltma da lazeri degistirmiyor: HEAD'in lazer cizimi bu ayari okumuyordu.
      new BeamRenderer(after).render([beam], { now: sceneNow * 3 + 17, sceneNow, scale: 1.37, reducedMotion: sceneNow % 2 > 1 });
      const drawn = after.calls.filter(([method]) => method !== "clear");

      assert.ok(before.calls.length > 0, "eski cizim bos");
      assert.deepStrictEqual(drawn, before.calls, `${beam.id} t${beam.tier ?? 1} od=${beam.overdrive} saat=${sceneNow}`);
      compared += 1;
    }
  }
  assert.equal(compared, 3 * 2 * geometries.length * sceneTimes.length);
});

test("kademe 3 asiri yukleme gercekten hale, parlama, kivilcim ve namlu ciziyor", () => {
  // Karsilastirmanin bos bir yolu karsilastirmadigindan emin ol: kademe 3
  // asiri yuklemede cagri sayisi duz isinin birkac katı olmali.
  const flat = createRecorder();
  const alive = createRecorder();
  const base = { id: "b", definitionId: "warrior-5", x1: 0, y1: 0, x2: 200, y2: 0, width: 8, color: 0xffffff, ttlMs: 200 };
  new BeamRenderer(flat).render([{ ...base, overdrive: false }], { now: 0, sceneNow: 400, scale: 1 });
  new BeamRenderer(alive).render([{ ...base, overdrive: true, tier: 3 }], { now: 0, sceneNow: 400, scale: 1 });
  assert.ok(alive.calls.length > flat.calls.length * 5, `${alive.calls.length} vs ${flat.calls.length}`);
});

test("FNV-1a bilinen degerleri veriyor ve uzunlugu ayni kimlikleri ayiriyor", () => {
  assert.equal(kit.fnvHash(""), 0x811c9dc5);
  assert.equal(kit.fnvHash("a"), 0xe40c292c);
  assert.equal(kit.fnvHash("foobar"), 0xbf9cf968);
  // Eski tohum `id.length` idi: bu iki zincir ayni zikzagi ciziyordu.
  assert.notEqual(kit.fnvHash("chain-p12-3"), kit.fnvHash("chain-p45-9"));
  const unit = kit.fnvUnit("showcase-t1-7", 3);
  assert.ok(unit >= 0 && unit < 1);
});

test("liftToWhite tonu koruyor, beyaza ceker", () => {
  assert.equal(kit.liftToWhite(0xef4444, 0), 0xef4444);
  assert.equal(kit.liftToWhite(0xef4444, 1), 0xffffff);
  const half = kit.liftToWhite(0x0000ff, 0.5);
  assert.equal(half & 0xff, 0xff);
  assert.equal((half >> 16) & 0xff, 128);
});
