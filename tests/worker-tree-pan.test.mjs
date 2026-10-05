/**
 * Isci gelisim agacinin kaydirmasi (mobil).
 *
 * Oyuncu agaci surukleyip birakinca agac baslangica geri donuyordu: kaydirma
 * cekmeceyi kuran fonksiyonun yerel degiskenindeydi ve parmak kalkinca
 * bekleyen yeniden kurulum onu sifirliyordu. Surukleme ayrica CSS'teki
 * `-50%` ortalamasini eziyor, dugmenin ustunden de baslayamiyordu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const pan = await importWebModule("apps/web/src/worker-tree-pan.ts");

// Bes uzmanlik sutunu: 5 x 224 + 4 x 14 + 2 x 20 = 1216 px; telefonda pencere ~350 px.
const PHONE = { treeWidth: 1216, treeHeight: 620, viewportWidth: 350, viewportHeight: 300 };

test("transform CSS'teki ortalamayi koruyor", () => {
  assert.equal(pan.formatTreePanTransform({ x: 0, y: 0 }), "translate(calc(-50% + 0px), 0px)");
  assert.equal(pan.formatTreePanTransform({ x: -120.4, y: 33.6 }), "translate(calc(-50% + -120px), 34px)");
  const css = readSource("apps/web/src/style.css");
  const tree = css.slice(css.indexOf("\n.worker-development__tree {"));
  assert.match(tree.slice(0, tree.indexOf("}")), /transform: translateX\(-50%\);/, "ilk kurulumdaki ortalama JS'inkiyle ayni olmali");
});

test("telefonda agacin her ucuna kaydirilabiliyor, ama pencereden kaybolmuyor", () => {
  const half = (PHONE.treeWidth - PHONE.viewportWidth) / 2;
  // En sol ve en sag sutun pencereye gelebiliyor.
  assert.ok(pan.clampTreePan({ x: half, y: 0 }, PHONE).x >= half);
  assert.ok(pan.clampTreePan({ x: -half, y: 0 }, PHONE).x <= -half);
  // Agacin alti da.
  const bottom = PHONE.viewportHeight - pan.TREE_TOP_PX - PHONE.treeHeight;
  assert.ok(pan.clampTreePan({ x: 0, y: bottom }, PHONE).y <= bottom);
  // Ote yana savrulmuyor.
  const far = pan.clampTreePan({ x: 5000, y: -5000 }, PHONE);
  assert.ok(far.x < half + 40, `x ${far.x}`);
  assert.ok(far.y > bottom - 40, `y ${far.y}`);
  assert.ok(pan.clampTreePan({ x: 0, y: 5000 }, PHONE).y < 40, "ust kenar asagi cekilip agac kaybolmamali");
});

test("pencereden dar agac yerinde kaliyor", () => {
  const wide = { treeWidth: 300, treeHeight: 200, viewportWidth: 900, viewportHeight: 330 };
  const clamped = pan.clampTreePan({ x: 400, y: -400 }, wide);
  assert.ok(Math.abs(clamped.x) <= 24);
  assert.ok(Math.abs(clamped.y) <= 24);
});

test("kisa hareket dokunus, esigi asan surukleme", () => {
  assert.equal(pan.exceedsTreeDragThreshold(3, 4), false);
  assert.equal(pan.exceedsTreeDragThreshold(pan.TREE_DRAG_THRESHOLD_PX, 0), false);
  assert.equal(pan.exceedsTreeDragThreshold(pan.TREE_DRAG_THRESHOLD_PX + 1, 0), true);
});

test("kaydirma cekmecenin yeniden kurulumundan sagkaliyor", () => {
  const ui = readSource("apps/web/src/game-control-ui.ts");
  const start = ui.indexOf("const buildWorkerDevelopmentDrawer");
  const end = ui.indexOf("const buildInventoryDrawer");
  assert.ok(start > 0 && end > start);
  const builder = ui.slice(start, end);
  const outside = ui.slice(0, start);
  assert.match(outside, /let workerTreePan: TreePan = \{ x: 0, y: 0 \};/, "kaydirma kurucunun disinda tutulmali");
  assert.doesNotMatch(builder, /let (workerTreePan|dragX|dragY)\b/, "kurucu kaydirmayi yeniden sifirlamamali");
  assert.match(builder, /applyTransform\(\);\n/, "yeni kurulan agac kayitli kaydirmayla cizilmeli");
  // Dugmenin ustunden baslayan surukleme reddedilmiyor (agacin cogu dugme).
  assert.doesNotMatch(builder, /closest\("button"\)\) return/);
  // Cekmece kapaninca bir dahaki acilis baslangictan, incelenen secenek de bos.
  assert.match(ui, /if \(drawerId !== "workerDevelopment"\) \{\n\s+workerTreePan = \{ x: 0, y: 0 \};\n\s+workerTreeFocus = undefined;/);
});

test("secenege dokunmak secimi acmiyor; acma ayrintidaki dugmede", () => {
  const ui = readSource("apps/web/src/game-control-ui.ts");
  const builder = ui.slice(ui.indexOf("const buildWorkerDevelopmentDrawer"), ui.indexOf("const buildInventoryDrawer"));
  // Secim geri alinamaz ve telefonda aciklama ancak dokununca gorunuyor.
  const unlocks = builder.match(/action: "unlockWorkerDevelopment"/g) ?? [];
  assert.equal(unlocks.length, 1, "agacta tek acma yolu olmali");
  assert.match(builder, /"worker-development__unlock", true, \(\) => \{\n\s+dispatch\(\{ action: "unlockWorkerDevelopment"/);
  // Secenek dugmeleri devre disi degil: kilitli olan da okunabiliyor.
  assert.match(builder, /`game-controls__worker-development is-\$\{status\.kind\}`, true,/);
});
