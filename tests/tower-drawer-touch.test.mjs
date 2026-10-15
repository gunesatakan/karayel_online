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
 *   3. Kule dugmesi `pointerdown`da parmagi yakaliyor; yeniden kurma basili
 *      parmakta erteleniyor.
 *   4. Kayan cekmecede parmak karar veriyor: dikey kayma kaydirir, yana cekme
 *      ya da kisa basili tutus kuleyi alir, dokunus yalnizca secer.
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

test("kule dugmesi pointerdown'da parmagi yakaliyor; basili parmakta yeniden kurma erteleniyor", () => {
  const button = source.slice(source.indexOf("const makeTowerButton = "), source.indexOf("const makeMelisSpectrum = "));
  const handler = button.slice(button.indexOf("button.addEventListener(\"pointerdown\""));
  assert.match(handler, /button\.setPointerCapture\(event\.pointerId\);/);
  // Basista surukleme yok: dokunus yalnizca secsin, cekmece kayabiliyorsa kaydirsin.
  assert.match(handler, /const scrollable = Boolean\(drawer && drawer\.scrollHeight - drawer\.clientHeight > 1\);/);
  assert.match(handler, /mode: "pending",\n\s+scrollable,/);
  assert.doesNotMatch(handler.slice(0, handler.indexOf("towerGesture = {")), /beginTowerDrag\(/);
  assert.match(handler, /beginTowerDrag\(towerId, gesture\.lastX, gesture\.lastY\);\n\s+\}, TOWER_HOLD_MS\)/);
  const begin = source.slice(source.indexOf("const beginTowerDrag = "), source.indexOf("const clearActiveTowerDrag = "));
  assert.match(begin, /dispatch\(\{ action: "selectTower", towerId \}\);\n\s+dispatch\(\{ action: "towerDragStart", towerId, clientX, clientY \}\);/);

  const render = source.slice(source.indexOf("const render = (state: ControlState) => {"));
  assert.match(render.slice(0, render.indexOf("clearPanel();")), /if \(pressedPointers\.size > 0\) \{\n\s+rebuildDeferred = true;\n\s+return;\n\s+\}/);
});


test("kayan kule cekmecesinde dikey kayma kaydirir, yana cekme kuleyi alir, dokunus yalnizca secer", () => {
  const move = source.slice(source.indexOf("const handleTowerDragMove = "), source.indexOf("const handleTowerDragEnd = "));
  assert.match(move, /if \(Math\.hypot\(dx, dy\) < TOWER_GESTURE_SLOP_PX\) \{\n\s+return;/);
  assert.match(move, /if \(!gesture\.scrollable \|\| Math\.abs\(dx\) > Math\.abs\(dy\)\) \{\n[^]*?beginTowerDrag\(activeTowerId, gesture\.startX, gesture\.startY\);/);
  assert.match(move, /gesture\.mode = "scroll";/);
  assert.match(move, /drawer\.scrollTop = gesture\.startScroll - \(event\.clientY - gesture\.startY\);/);
  // Kaydirma kararindan sonra sahneye surukleme gitmiyor.
  const scroll = move.slice(move.indexOf('gesture.mode = "scroll";'), move.lastIndexOf("dispatch("));
  assert.match(scroll, /\n\s+return;\n\s+\}\n\s+$/);

  const end = source.slice(source.indexOf("const handleTowerDragEnd = "), source.indexOf("const handleTowerDragEnd = ") + 1200);
  assert.match(end, /if \(gesture\.mode === "pending" && event\.type === "pointerup"\) \{\n[^\n]*\n\s+dispatch\(\{ action: "selectTower", towerId: activeTowerId \}\);/);
  assert.doesNotMatch(end.slice(0, end.indexOf("clearActiveTowerDrag();")), /towerDragEnd/, "karar verilmemis parmak yerlestirme denemesin");
  // Karar verilmeden kaybedilen parmak sahnede iptal gondermiyor (acik surukleme yok).
  const lost = source.slice(source.indexOf("const handleTowerDragLost = "), source.indexOf("window.addEventListener(\"blur\", handleTowerDragLost);"));
  assert.ok(lost.indexOf("if (towerGesture)") < lost.indexOf("towerDragCancel"));
});

test("kule secilince ya da alininca kule cekmecesi kapaniyor; surukleme boyunca gorunmuyor", () => {
  const close = source.slice(source.indexOf("const closeTowersDrawer = "), source.indexOf("const beginTowerDrag = "));
  assert.match(close, /if \(openDrawer !== "towers"\) return;\n\s+openDrawer = undefined;/);
  // Olay bitmeden kurulmuyor: parmagi yakalayan dugme DOM'dan cikarsa parmak kaybedilir.
  assert.match(close, /queueMicrotask\(/);
  const begin = source.slice(source.indexOf("const beginTowerDrag = "), source.indexOf("const clearActiveTowerDrag = "));
  assert.match(begin, /getOpenDrawer\(\)\?\.classList\.add\("game-controls__drawer--hidden"\);\n\s+closeTowersDrawer\(\);/);
  const end = source.slice(source.indexOf("const handleTowerDragEnd = "), source.indexOf("const handleTowerDragEnd = ") + 1200);
  assert.match(end, /dispatch\(\{ action: "selectTower", towerId: activeTowerId \}\);\n\s+closeTowersDrawer\(\);/);
  const css = readFileSync(new URL("../apps/web/src/style.css", import.meta.url), "utf8");
  assert.match(css, /\.game-controls__drawer\.game-controls__drawer--hidden \{\s+visibility: hidden;/);
});
