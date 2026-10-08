/**
 * Sunucu'nun reaktor arklari (apps/web/src/vfx/server-reactor.ts).
 *
 * Sahibin istegi: gorseldeki reaktorun cevresine sizan elektrik arklari
 * resimde donuk duruyordu; hafifce dalgalaniyormus gibi canlansinlar. Reaktor
 * tam merkezde degil. Kilitlenen:
 * - arklar kulenin merkezinin degil, asagidaki cekirdegin cevresinde;
 * - hareket yumusak: ardisik karelerde noktalar az kayiyor (titreme yok),
 *   ama zamanla bicim degisiyor;
 * - hareket azaltmada bicim ve parlaklik sabit;
 * - bicim dokunun boyu ve donusuyle birlikte.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const reactor = await importWebModule("apps/web/src/vfx/server-reactor.ts");

const HALF = 17;

function draw(overrides = {}) {
  const g = createRecorder();
  reactor.drawServerReactorArcs(g, { x: 100, y: 200, half: HALF, rotation: 0, tier: 1, now: 5000, still: false, alpha: 1, ...overrides });
  return g.calls;
}

/** Her arkin cizgi noktalari (yol basina bir dizi). */
function paths(calls) {
  const out = [];
  for (const [name, x, y] of calls) {
    if (name === "moveTo") out.push([{ x, y }]);
    else if (name === "lineTo") out.at(-1).push({ x, y });
  }
  return out;
}

const core = (x = 100, y = 200, half = HALF) => ({ x: x + reactor.SERVER_REACTOR_CORE.x * half, y: y + reactor.SERVER_REACTOR_CORE.y * half });

test("arklar merkezdeki değil aşağıdaki reaktör çekirdeğinin çevresinde", () => {
  assert.ok(reactor.SERVER_REACTOR_CORE.y > 0.1, "cekirdek merkezin altinda olmali");
  const arcs = paths(draw());
  assert.equal(arcs.length, reactor.SERVER_REACTOR_ARCS.length * 2, "ark basina isima ve cekirdek");
  const centre = core();
  for (const arc of arcs) {
    for (const point of arc) {
      const distance = Math.hypot(point.x - centre.x, point.y - centre.y) / HALF;
      assert.ok(distance > 0.14 && distance < 0.4, `nokta cekirdekten ${distance.toFixed(3)} yari boy uzakta`);
    }
  }
  const roots = arcs.map((arc) => arc[0]);
  const meanX = roots.reduce((sum, point) => sum + point.x, 0) / roots.length;
  const meanY = roots.reduce((sum, point) => sum + point.y, 0) / roots.length;
  assert.ok(Math.hypot(meanX - centre.x, meanY - centre.y) < 0.03 * HALF, "kokler cekirdegi cevrelemiyor");
  assert.ok(Math.hypot(meanX - 100, meanY - 200) > 0.1 * HALF, "kokler kulenin merkezini cevreliyor");
});

test("dalgalanma yumuşak: kareden kareye az, zamanla belirgin kayıyor", () => {
  let largest = 0;
  let travel = 0;
  const first = paths(draw({ now: 5000 }));
  let previous = first;
  for (let now = 5016; now <= 7000; now += 16) {
    const current = paths(draw({ now }));
    current.forEach((arc, index) => arc.forEach((point, k) => {
      largest = Math.max(largest, Math.hypot(point.x - previous[index][k].x, point.y - previous[index][k].y));
      travel = Math.max(travel, Math.hypot(point.x - first[index][k].x, point.y - first[index][k].y));
    }));
    previous = current;
  }
  assert.ok(largest < 0.012 * HALF, `16 ms'de ${(largest / HALF).toFixed(4)} yari boy: titriyor`);
  assert.ok(travel > 0.02 * HALF, `iki saniyede yalnizca ${(travel / HALF).toFixed(4)} yari boy: kipirdamiyor`);
  assert.ok(travel < 0.1 * HALF, `iki saniyede ${(travel / HALF).toFixed(4)} yari boy: hafif degil`);
});

test("hareket azaltmada biçim ve parlaklık sabit", () => {
  for (const tier of [1, 2, 3]) {
    assert.deepEqual(draw({ tier, still: true, now: 1000 }), draw({ tier, still: true, now: 4321 }));
  }
});

test("biçim dokunun boyu ve dönüşüyle birlikte", () => {
  const small = paths(draw());
  const large = paths(draw({ half: HALF * 2 }));
  small.forEach((arc, index) => arc.forEach((point, k) => {
    assert.ok(Math.abs((large[index][k].x - 100) - (point.x - 100) * 2) < 1e-6);
    assert.ok(Math.abs((large[index][k].y - 200) - (point.y - 200) * 2) < 1e-6);
  }));
  // Ceyrek tur: asagidaki cekirdek sola donuyor.
  const turned = paths(draw({ rotation: Math.PI / 2 }));
  const roots = turned.map((arc) => arc[0]);
  const meanX = roots.reduce((sum, point) => sum + point.x, 0) / roots.length;
  assert.ok(meanX < 100 - 0.1 * HALF, "donen dokuda cekirdek yerinde kaldi");
});

test("kademe 3 çatal kazanıyor; takım arkadaşının arkları soluk", () => {
  const forks = (calls) => calls.filter(([name]) => name === "lineBetween").length;
  assert.equal(forks(draw({ tier: 2 })), 0);
  assert.equal(forks(draw({ tier: 3 })), reactor.SERVER_REACTOR_ARCS.length);
  const alphas = (calls) => calls.filter(([name]) => name === "lineStyle").map((call) => call[3]);
  const own = alphas(draw());
  const mate = alphas(draw({ alpha: 0.7 }));
  own.forEach((alpha, index) => assert.ok(Math.abs(mate[index] - alpha * 0.7) < 1e-9));
  assert.deepEqual(draw({ alpha: 0 }), []);
});
