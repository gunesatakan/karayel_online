/**
 * Satis onay istiyor, geri alma istemiyor.
 *
 * Parmak kule panelindeki ya da haritadaki satis tusuna kazara degip kuleyi
 * ya da duvari satiyordu. Iki yol (panelin "Sat" dugmesi ve haritadaki tus)
 * ayni fonksiyondan geciyor; geri alinabilir (kurulumda tam iade) yapi onaysiz.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const scene = read("apps/web/src/scenes/GameScene.ts");
const method = (name) => {
  const start = scene.indexOf(`  private ${name}(`);
  assert.ok(start > 0, `${name} yok`);
  return scene.slice(start, scene.indexOf("\n  private ", start + 10));
};

test("panel ve harita satisi ayni onayli yoldan geciyor", () => {
  assert.match(scene, /case "sellTower":\n\s+this\.hideZeynepTierChoicesIfOpen\(\);\n\s+this\.requestSellSelectedTower\(\);\n\s+break;/);
  assert.match(scene, /if \(this\.hitSellButton\(pointer\)\) \{\n\s+this\.requestSellSelectedTower\(\);\n\s+return;/);
  assert.equal(scene.match(/this\.room\?\.send\("sellTower"/g)?.length, 1, "satis mesaji tek yerden gitmeli");
});

test("geri alma onaysiz, satis onayli", () => {
  const sell = method("requestSellSelectedTower");
  assert.match(sell, /if \(!tower \|\| !refund \|\| refund\.undoable\) \{\n\s+sell\(\);\n\s+return;/);
  assert.match(sell, /openConfirmDialog\(/);
  assert.ok(sell.indexOf("refund.undoable") < sell.indexOf("openConfirmDialog("), "geri alma onaydan once ayrilmali");
});

test("onay metinleri iki dilde", () => {
  const locale = read("apps/web/src/locales/areas/scene.ts");
  for (const key of ["scene.sell.confirmTitle", "scene.sell.confirmBody", "scene.sell.confirm", "scene.sell.cancel"]) {
    assert.equal(locale.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g"))?.length, 2, key);
  }
});
