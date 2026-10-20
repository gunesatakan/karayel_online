/**
 * Vurus turunun imzasi (apps/web/src/vfx/hit-signatures.ts).
 *
 * Sahibin istegi (2026-10-20): kuleler vurdugunda tatmin; her vurus turu
 * farkli tarzda. Mermi delip geciyor, Carpma eziyor, Odak eritiyor, Aura
 * kilitliyor, Dalga supuruyor, Lanet curutuyor, Kesme biciyor, Bulasma
 * yayiliyor. Olcu dusmanin govdesinden; LOD ve hareket azaltma kapilari.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const signatures = await importWebModule("apps/web/src/vfx/hit-signatures.ts");
const kit = await importWebModule("apps/web/src/vfx/kit.ts");
const { getHitSignature, drawHitSignature, HIT_SIGNATURE_MS } = signatures;

/** Cagrilari kaydeden sahte Graphics. */
function recorder() {
  const calls = [];
  return new Proxy({ calls }, { get: (target, key) => (key in target ? target[key] : (...args) => { calls.push([key, ...args]); return target; }) });
}
const input = (overrides = {}) => ({ x: 100, y: 100, angle: 0, size: 34, tier: 3, seed: 7, hue: 0x4dffbd, heat: 0.88, weight: 1.6, extra: 1, beamHeat: 0.5, ...overrides });
const gates = (overrides = {}) => ({ sparks: true, smoke: true, still: false, ...overrides });
const draw = (signature, at, inputOverrides, gateOverrides) => {
  const g = recorder();
  drawHitSignature(g, signature, input(inputOverrides), at, 1, gates(gateOverrides), g);
  return g.calls;
};
const geometry = (calls) => JSON.stringify(calls.filter(([name]) => name !== "lineStyle" && name !== "fillStyle"));

test("her vurus turu kendi imzasina iniyor; Kin dalga gibi itiyor", () => {
  assert.equal(getHitSignature("warrior-1"), "pierce", "Takipci mermi: delip gecme");
  assert.equal(getHitSignature("zeynep-1"), "pierce", "Hiza mermi");
  assert.equal(getHitSignature("warrior-4"), "crush", "Obsesyon carpma: ezme");
  assert.equal(getHitSignature("warrior-6"), "crush", "Ucube carpma");
  assert.equal(getHitSignature("warrior-5"), "melt", "Debug Lazer odak: eritme");
  assert.equal(getHitSignature("warrior-3"), "lock", "Izolasyon aura: kilitleme");
  assert.equal(getHitSignature("zeynep-6"), "sweep", "Kin dalgasi: supurme");
  assert.equal(getHitSignature("archer-3"), "decay", "Melis lanet: curutme");
  assert.equal(getHitSignature("onur-1"), "cleave", "Testere kesme: bicme");
  assert.equal(getHitSignature("archer-6"), "sweep", "Melis dalga");
  assert.equal(getHitSignature("zeynep-3-kin-projectile"), getHitSignature("zeynep-3"), "son ekli kimlik kulenin imzasi");
});

test("imzalar birbirinden farkli ciziliyor ve ana cizimden uzun yasiyor", () => {
  const all = ["pierce", "crush", "melt", "lock", "sweep", "decay", "cleave", "spread"];
  const shapes = new Set(all.map((signature) => geometry(draw(signature, 60))));
  assert.equal(shapes.size, all.length, "iki imza ayni cizimi veriyor");
  for (const signature of all) {
    assert.ok(draw(signature, 60).length > 0, `${signature} 60 ms'de cizilmiyor`);
    assert.ok(HIT_SIGNATURE_MS[signature] >= 220, `${signature} cok kisa`);
    assert.equal(draw(signature, HIT_SIGNATURE_MS[signature]).length, 0, `${signature} omrunden sonra cizilmeli degil`);
  }
});

test("olcu dusmanin govdesinden: iri dusmanda ezme halkasi ve kafes buyuk", () => {
  const ringRadius = (size) => {
    const calls = draw("crush", 100, { size });
    const ring = calls.filter(([name]) => name === "lineBetween");
    const xs = ring.flatMap(([, x1, , x2]) => [x1, x2]);
    return Math.max(...xs) - 100;
  };
  assert.ok(ringRadius(56) > ringRadius(34) * 1.4, "ezme govdeyle buyumuyor");
  const pierceExit = (size) => Math.max(...draw("pierce", 20, { size }).filter(([name]) => name === "lineBetween").map(([, , , x2]) => x2));
  assert.ok(pierceExit(56) > pierceExit(34), "delme izi govdenin arkasina kadar gitmiyor");
});

test("hareket azaltmada sekil zamanla kaymiyor; kivilcim kapisi kapaliyken balistik cizgi yok", () => {
  for (const signature of ["crush", "lock", "sweep", "decay", "cleave", "pierce"]) {
    assert.equal(geometry(draw(signature, 120, {}, { still: true })), geometry(draw(signature, 150, {}, { still: true })), `${signature} hareket azaltmada kayiyor`);
  }
  const withSparks = draw("pierce", 60).filter(([name]) => name === "lineBetween").length;
  const noSparks = draw("pierce", 60, {}, { sparks: false }).filter(([name]) => name === "lineBetween").length;
  assert.ok(noSparks < withSparks, "LOD kivilcimi kesmiyor");
  // Eritme isiyla buyuyor.
  const poolRadius = (beamHeat) => {
    let reach = 0;
    for (const [name, ...args] of draw("melt", 40, { beamHeat }, { sparks: false, smoke: false })) {
      if (name === "fillTriangle") for (let index = 0; index < 6; index += 2) reach = Math.max(reach, Math.abs(args[index] - 100));
      if (name === "fillRect") reach = Math.max(reach, Math.abs(args[0] - 100), Math.abs(args[0] + args[2] - 100));
    }
    return reach;
  };
  assert.ok(poolRadius(1) > poolRadius(0), "erimis nokta isiyla buyumuyor");
});

test("renkler yere indirilmis: beyaz-sicak cekirdek ya da sinirli doygunluk (seker rengi yok)", () => {
  const hsl = (color) => {
    const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    return { s, l };
  };
  for (const signature of ["pierce", "crush", "melt", "lock", "sweep", "decay", "cleave", "spread"]) {
    for (const hue of [kit.groundHue(0xec4899), kit.groundHue(0x4dffbd), kit.groundHue(0xef4444)]) {
      for (const at of [10, 60, 150]) {
        for (const [name, , color] of draw(signature, at, { hue }).filter(([name]) => name === "lineStyle" || name === "fillStyle").map(([name, a, b]) => [name, a, name === "lineStyle" ? b : a])) {
          const { s, l } = hsl(color);
          // vfx-hard-language ile ayni kural: beyaz-sicak (l >= 0.9) ve koyu serbest, acik tonda doygunluk sinirli.
          const grounded = l <= 0.22 || l >= 0.9 || (l > 0.7 ? s <= 0.35 : s <= kit.GROUNDED_MAX_SATURATION);
          assert.ok(grounded, `${signature} ${name}: seker renk ${color.toString(16)} (s ${s.toFixed(2)}, l ${l.toFixed(2)})`);
        }
      }
    }
  }
});

test("baglanti: carpma ve isin temasinda imza; govde boyu her temasta, lazerin isisi eritmeye", () => {
  const attack = readFileSync(new URL("../apps/web/src/vfx/attack-vfx.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(attack, /event\.signature = getHitSignature\(input\.definitionId\);/);
  assert.match(attack, /if \(kind === "impact" \|\| kind === "beamHit"\) event\.lifeMs = Math\.max\(event\.lifeMs, HIT_SIGNATURE_MS\[event\.signature\]\);/);
  const scene = readFileSync(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(scene, /const size = anchor \? this\.getEnemyBodySize\(/);
  assert.match(scene, /beamHeat: heat, size: mover\?\.displaySize/);
});
