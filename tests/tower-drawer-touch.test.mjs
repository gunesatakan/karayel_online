/**
 * Mobilde Kuleler cekmecesi kule kurduktan sonra takili kaliyordu.
 *
 * Kule dugmesi isini `pointerdown`da yapiyor (secim + surukleme baslangici) ve
 * sahne yeni durumu ayni anda yayinliyor. Panelin "parmak basili" kaydi kokun
 * kabarcik evresindeydi, yani dugmenin kendi dinleyicisinden SONRA calisiyordu:
 * o an liste bos goruluyor, panel hemen yeniden kuruluyor ve parmagin altindaki
 * dugme DOM'dan cikiyordu. Dokunmatikte jestin geri kalani kopuk dugmeye gidiyor,
 * `pointerup` koke ve pencereye hic ulasmiyor; parmak listede kaliyor ve butun
 * yeniden kurmalar sonsuza dek erteleniyordu. Sonuc: × de, Kuleler de, Beceriler
 * de cekmeceyi degistiremiyordu; surukleme de acik kaliyordu.
 *
 * Kilitlenen sozler:
 *   1. Kokun `pointerdown` kaydi yakalama evresinde (dugmelerden once).
 *   2. Yeni birincil isaretci eski kayitlari siliyor: kaybolmus bir birakma
 *      paneli bir daha kilitleyemiyor.
 *   3. Kule dugmesi hala `pointerdown`da secim yolluyor (kaydin neden once
 *      olmasi gerektigi); yeniden kurma basili parmakta erteleniyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const source = read("apps/web/src/game-control-ui.ts");

/** `root.addEventListener("pointerdown", ...)` cagrisinin tamami. */
const rootPointerdownCall = () => {
  const start = source.indexOf("root.addEventListener(\"pointerdown\"");
  assert.ok(start > 0, "kokun pointerdown dinleyicisi yok");
  return source.slice(start, source.indexOf("root.addEventListener(\"pointerup\"", start)).trim();
};

test("kok pointerdown kaydi yakalama evresinde, dugmelerden once", () => {
  const call = rootPointerdownCall();
  assert.match(call, /pressedPointers\.add\(event\.pointerId\);/);
  assert.match(call, /\}, \{ capture: true \}\);$/, "kayit kabarcik evresine geri dondu: kule dugmesi paneli parmak altinda yeniden kurdurur");
  // Ayni olaya ikinci bir kabarcik kaydi eklenmemis.
  assert.equal(source.match(/root\.addEventListener\("pointerdown"/g).length, 1);
});

test("yeni birincil isaretci kaybolmus birakmalari siliyor", () => {
  const call = rootPointerdownCall();
  const clear = call.indexOf("if (event.isPrimary) pressedPointers.clear();");
  assert.ok(clear > 0, "birincil isaretcide eski kayitlar silinmiyor");
  assert.ok(clear < call.indexOf("pressedPointers.add(event.pointerId);"), "silme eklemeden sonra: yeni parmak da silinir");
});

test("kule dugmesi pointerdown'da seciyor; basili parmakta yeniden kurma erteleniyor", () => {
  const button = source.slice(source.indexOf("const makeTowerButton = "), source.indexOf("const makeMelisSpectrum = "));
  const handler = button.slice(button.indexOf("button.addEventListener(\"pointerdown\""));
  assert.match(handler, /dispatch\(\{ action: "selectTower", towerId: tower\.id \}\);/);
  assert.match(handler, /button\.setPointerCapture\(event\.pointerId\);/);

  const render = source.slice(source.indexOf("const render = (state: ControlState) => {"));
  assert.match(render.slice(0, render.indexOf("clearPanel();")), /if \(pressedPointers\.size > 0\) \{\n\s+rebuildDeferred = true;\n\s+return;\n\s+\}/);
});

