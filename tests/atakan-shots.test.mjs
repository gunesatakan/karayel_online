/**
 * Obsesyon ve Ucube'nin mermileri (apps/web/src/vfx/atakan-shots.ts).
 *
 * Sahibin istegi: iki merminin 1, 5 ve 10. seviyesi ayri ayri gelissin,
 * seviye arttikca daha goz alici olsun, ucusu izlemek keyif versin. Kilitlenen:
 * - her kademe bir oncekinden fazlasini ciziyor (yeni parcalar), ama butce
 *   icinde: kademe 3 mermi 420 koseyi gecmiyor, earcut hic yok;
 * - ucus canli: ayni yerdeki mermi zamanla degisiyor (donen iris, yeniden
 *   cizilen simsek, sarmal ve dokulen kivilcimlar);
 * - hareket azaltmada bicim zamanla kaymiyor;
 * - LOD kivilcimlari kesince sarmal ve dokulme gidiyor, takim arkadasinin
 *   kademe 3 eklentileri soluk.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createCountingGraphics, createRecorder, importWebModule } from "./helpers/web-module.mjs";

const shots = await importWebModule("apps/web/src/vfx/atakan-shots.ts");
const profiles = await importWebModule("apps/web/src/vfx/vfx-profiles.ts");
const kit = await importWebModule("apps/web/src/vfx/kit.ts");

const DRAW = { "warrior-4": shots.drawObsessionShot, "warrior-6": shots.drawUcubeShot };

/** Bes karelik bir iz: mermi saga ucuyor, son konum (100, 200). */
function trail() {
  const capacity = 8;
  const xs = new Float32Array(capacity);
  const ys = new Float32Array(capacity);
  for (let index = 0; index < 5; index += 1) {
    xs[index] = 100 - (4 - index) * 2;
    ys[index] = 200;
  }
  return { xs, ys, head: 5, count: 5, seen: 0 };
}

function input(definitionId, tier, overrides = {}) {
  const recipe = profiles.getVfxProfile(definitionId).tiers[tier - 1];
  return {
    x: 100, y: 200, angle: 0, radius: 7, scale: 1, tier, recipe, hue: recipe.color,
    now: 1000, seed: 17, still: false, sparks: true, extra: 1, trail: trail(), trailCapacity: 8, trailScale: 1,
    ...overrides
  };
}

const geometry = (recorder) => JSON.stringify(recorder.calls.filter(([name]) => name !== "lineStyle" && name !== "fillStyle"));

for (const definitionId of Object.keys(DRAW)) {
  test(`${definitionId}: her kademe daha fazlasını çiziyor, bütçe içinde ve earcut yok`, () => {
    const cost = [1, 2, 3].map((tier) => {
      const g = createCountingGraphics();
      DRAW[definitionId](g, input(definitionId, tier));
      return g.stats;
    });
    assert.ok(cost[0].calls < cost[1].calls && cost[1].calls < cost[2].calls, `cagri ${cost.map((entry) => entry.calls).join(" / ")}`);
    assert.ok(cost[0].vertices < cost[1].vertices && cost[1].vertices < cost[2].vertices, `kose ${cost.map((entry) => entry.vertices).join(" / ")}`);
    assert.ok(cost[2].vertices <= 420, `kademe 3 ${cost[2].vertices} kose`);
    for (const entry of cost) assert.equal(entry.earcut, 0, "earcut");
  });

  test(`${definitionId}: uçuş canlı; hareket azaltmada biçim yerinde`, () => {
    for (const tier of [1, 2, 3]) {
      const at = (now, still) => {
        const g = createRecorder();
        DRAW[definitionId](g, input(definitionId, tier, { now, still }));
        return geometry(g);
      };
      if (tier >= 2 || definitionId === "warrior-6") {
        assert.notEqual(at(1000, false), at(1137, false), `kademe ${tier}: ucus donuk`);
      }
      assert.equal(at(1000, true), at(1137, true), `kademe ${tier}: hareket azaltmada bicim kayiyor`);
    }
  });

  test(`${definitionId}: LOD kıvılcımı kesince kademe 3 süsü azalıyor; takım arkadaşının eklentileri soluk`, () => {
    const count = (sparks) => {
      const g = createRecorder();
      DRAW[definitionId](g, input(definitionId, 3, { sparks }));
      return g.calls.length;
    };
    assert.ok(count(false) < count(true), "LOD kivilcimlari kesmiyor");
    const alphaSum = (extra) => {
      const g = createRecorder();
      DRAW[definitionId](g, input(definitionId, 3, { extra }));
      return g.calls.filter(([name]) => name === "lineStyle" || name === "fillStyle").reduce((sum, [name, ...args]) => sum + (name === "lineStyle" ? args[2] : args[1]), 0);
    };
    assert.ok(alphaSum(0.7) < alphaSum(1), "takim arkadasinin eklentileri soluk degil");
  });
}

test("Obsesyon bir göz: badem mercek, uçuşa dik yarık göz bebeği; seviye 5'te iris, 10'da dönen diyafram", () => {
  const draw = (tier, now = 1000) => {
    const g = createRecorder();
    shots.drawObsessionShot(g, input("warrior-4", tier, { now }));
    return g.calls;
  };
  // Gozbebegi: en sicak renkle iki ucgen; uclari ucusa dik (y ekseninde).
  const recipe = profiles.getVfxProfile("warrior-4").tiers[0];
  const calls = draw(1);
  const hot = calls.findIndex(([name, color]) => name === "fillStyle" && color === profiles.getVfxProfile("warrior-4").tiers[0].core);
  const pupil = calls.slice(hot + 1, hot + 3).filter(([name]) => name === "fillTriangle");
  assert.equal(pupil.length, 2, "gozbebegi yok");
  const ys = pupil.flatMap(([, , y1, , y2, , y3]) => [y1, y2, y3]);
  const xs = pupil.flatMap(([, x1, , x2, , x3]) => [x1, x2, x3]);
  assert.ok(Math.max(...ys) - Math.min(...ys) > (Math.max(...xs) - Math.min(...xs)) * 2, "yarik ucusa dik degil");
  assert.ok(recipe.heat < profiles.getVfxProfile("warrior-4").tiers[2].heat);
  // Kademe 3'un diyaframi donuyor: ayni yerde farkli anda kanatlar baska acida.
  const blades = (now) => JSON.stringify(draw(3, now).filter(([name]) => name === "lineBetween").slice(-6));
  assert.notEqual(blades(1000), blades(1300));
});

/** Cizimin kapladigi kutu (ucus saga, merkez 100,200): ucgen, cizgi ve kare koseleri. */
function boundsOf(calls) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const add = (x, y) => {
    box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
  };
  for (const [name, ...args] of calls) {
    if (name === "fillTriangle") { add(args[0], args[1]); add(args[2], args[3]); add(args[4], args[5]); }
    else if (name === "lineBetween") { add(args[0], args[1]); add(args[2], args[3]); }
    else if (name === "fillRect") { add(args[0], args[1]); add(args[0] + args[2], args[1] + args[3]); }
    else if (name === "moveTo" || name === "lineTo") add(args[0], args[1]);
  }
  return box;
}

function unionBounds(definitionId, tier) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let seed = 1; seed <= 40; seed += 1) {
    for (let now = 1000; now < 1600; now += 37) {
      const g = createRecorder();
      DRAW[definitionId](g, input(definitionId, tier, { seed, now }));
      const b = boundsOf(g.calls);
      box.minX = Math.min(box.minX, b.minX); box.maxX = Math.max(box.maxX, b.maxX);
      box.minY = Math.min(box.minY, b.minY); box.maxY = Math.max(box.maxY, b.maxY);
    }
  }
  return box;
}

for (const definitionId of Object.keys(DRAW)) {
  test(`${definitionId}: seviye 5 ve 10 mermiyi büyütmüyor; boy ve en kademe 1'in zarfında`, () => {
    const base = unionBounds(definitionId, 1);
    for (const tier of [2, 3]) {
      const box = unionBounds(definitionId, tier);
      // Rastgele arklarin tohumu kademeyle kayiyor: %3 pay (bir kat buyume degil).
      const tolerance = 0.03 * Math.max(base.maxX - base.minX, base.maxY - base.minY);
      assert.ok(box.minX >= base.minX - tolerance && box.maxX <= base.maxX + tolerance, `kademe ${tier}: boy ${(box.maxX - box.minX).toFixed(2)} > ${(base.maxX - base.minX).toFixed(2)}`);
      assert.ok(box.minY >= base.minY - tolerance && box.maxY <= base.maxY + tolerance, `kademe ${tier}: en ${(box.maxY - box.minY).toFixed(2)} > ${(base.maxY - base.minY).toFixed(2)}`);
    }
  });

  test(`${definitionId}: kademe tonu değişiyor (1, 5, 10 üç ayrı renk)`, () => {
    const silhouette = profiles.getVfxProfile(definitionId).silhouette;
    const recipe = profiles.getVfxProfile(definitionId).tiers[0];
    const hues = [1, 2, 3].map((tier) => shots.getAtakanShotHue(silhouette, tier, recipe.color));
    assert.equal(hues[0], recipe.color, "kademe 1 profilin tonu olmali");
    assert.equal(new Set(hues).size, 3, `tonlar ayni: ${hues.map((hue) => hue.toString(16)).join(" / ")}`);
    // Sert dil: kademe tonu da yere indirilmis (seker renk yok).
    for (const hue of hues) assert.ok(kit.toHsl(hue).s <= kit.GROUNDED_MAX_SATURATION + 1e-9, `doygun ton ${hue.toString(16)}`);
    assert.equal(shots.getAtakanShotGlowSize(silhouette, 7, recipe.thickness), shots.getAtakanShotGlowSize(silhouette, 7, recipe.thickness), "damga kademeden bagimsiz");
  });
}

test("Obsesyon: kalınlık eski kademe 1'in 2/3'ü, kuyruk yarısı", () => {
  const g = createRecorder();
  shots.drawObsessionShot(g, input("warrior-4", 1));
  const box = boundsOf(g.calls);
  const r = 7;
  const length = r * 2.15;
  // Eski: yari en 0.62r, kuyruk ucu merkezden 0.42L + 1.25L geride.
  const half = 0.62 * r * (2 / 3);
  assert.ok(box.maxY - 200 <= half + 1e-6 && box.maxY - 200 > half * 0.9, `yari en ${(box.maxY - 200).toFixed(3)}, beklenen <= ${half.toFixed(3)}`);
  assert.ok(Math.abs((100 - box.minX) - (0.42 * length + 1.25 * length * 0.5)) < 1e-6, `kuyruk ${(100 - box.minX).toFixed(3)}`);
});

test("Ucube: mermi eski kademe 1'in 3/4'ü", () => {
  const g = createRecorder();
  shots.drawUcubeShot(g, input("warrior-6", 1, { now: 1000 }));
  const triangles = g.calls.filter(([name]) => name === "fillTriangle");
  const xs = triangles.flatMap(([, x1, , x2, , x3]) => [x1, x2, x3]);
  const r = 7;
  // Eski: kuyruk 2.6r, bas yaricapi 0.4r x kalinlik (2).
  assert.ok(Math.abs((100 - Math.min(...xs)) - 2.6 * r * 0.75) < 1e-6, `kuyruk ${(100 - Math.min(...xs)).toFixed(3)}`);
  const [, , y1] = triangles[0];
  assert.ok(Math.abs((y1 - 200) - 0.4 * r * 2 * 0.75) < 1e-6, `bas ${(y1 - 200).toFixed(3)}`);
});
