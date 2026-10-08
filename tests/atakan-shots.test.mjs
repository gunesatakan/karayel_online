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
