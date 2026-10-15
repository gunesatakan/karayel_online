/**
 * Duvar cizgisi istemci baglantisi (kaynak duzeyinde, tower-drawer-touch gibi).
 *
 * Saf kurallar (bekleme suresi, eksen, kenar uretimi, bedel) ve sunucu
 * tests/wall-line.test.mjs'te. Burada kilitlenen sey sahnenin bunlari dogru
 * yerlere bagladigi: durakla-sabitle jesti, cizgi onizlemesi, tutamaclar --
 * ve eski davranisin bozulmadigi: bos birakista tek duvar hala `placeTower` ile
 * kuruluyor, tutamaca dokunmak (kayma yok) normal harita dokunusu.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const scene = read("apps/web/src/scenes/GameScene.ts");
const controls = read("apps/web/src/game-control-ui.ts");
const view = read("apps/web/src/vfx/wall-line.ts");

/** `  private name(...) {` yontemin govdesi (bir sonraki ayni girintili yontem ya da belge yorumuna kadar). */
function method(name) {
  const start = scene.search(new RegExp(`\\n  (private )?${name}\\(`));
  assert.ok(start >= 0, `${name} yok`);
  const rest = scene.slice(start + 1);
  const next = rest.slice(1).search(/\n  (\/\*\*|private |public |protected |[a-zA-Z]+\()/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

test("sabitler paylasilan modulden geliyor, sahnede elle yazilmis sayi yok", () => {
  assert.match(scene, /WALL_LINE_HANDLE_VISIBLE_MS,/);
  assert.match(scene, /WALL_LINE_HANDLE_TOUCH_PX,/);
  assert.match(scene, /WALL_LINE_HANDLE_DRAG_PX,/);
  assert.match(scene, /advanceWallDwell,/);
  const gestureCode = [method("lockWallAnchor"), method("tickWallLine"), method("tryBeginWallHandleDrag")].join("\n");
  assert.doesNotMatch(gestureCode, /\b450\b|\b4000\b|\b44\b/, "bekleme / gorunurluk / hedef sayisi sahnede elle yazilmis");
});

test("surukleme yalnizca duvarda ve istemci koordinatiyla cizgi jesti baslatir", () => {
  const start = method("startTowerDragAt");
  assert.match(start, /tower\.id === WALL_TOWER_ID && client && !this\.creativeMode/);
  assert.match(start, /startWallDwell\(client\.x, client\.y, performance\.now\(\)\)/);
  // Her surukleme eski jesti ve tutamaclari temizler.
  assert.match(start, /this\.cancelWallHandleDrag\(\);\n\s+this\.hideWallHandles\(\);\n\s+this\.clearWallGesture\(\);/);
  // Cekmece olaylari istemci noktasini sahneye tasiyor.
  assert.match(scene, /this\.startTowerDragAt\(tower, point, getClientPoint\(\)\)/);
  assert.match(scene, /this\.updateTowerDragAt\(point, getClientPoint\(\)\)/);
  assert.match(controls, /dispatch\(\{ action: "towerDragMove", towerId: activeTowerId, clientX: event\.clientX, clientY: event\.clientY \}\)/);
  assert.match(controls, /dispatch\(\{ action: "towerDragStart", towerId, clientX, clientY \}\)/);
});

test("hareket olayi beklemeyi ilerletir, capa atilinca onizleme cizgiye gecer ve tek hayalet guncellenmez", () => {
  const move = method("updateTowerDragAt");
  const gesture = move.indexOf("const gesture = this.wallGesture;");
  const ghost = move.indexOf("const definitionId = this.draggedTowerDefinition.id;");
  assert.ok(gesture > 0 && ghost > gesture, "jest kontrolu tek hayalet guncellemesinden once degil");
  assert.match(move, /advanceWallDwell\(gesture\.dwell, gesture\.client\.x, gesture\.client\.y, performance\.now\(\)\)/);
  assert.match(move, /if \(gesture\.dwell\.locked\) this\.lockWallAnchor\(gesture\);/);
  assert.match(move, /this\.renderWallLinePreview\(gesture\.anchor, previewPoint\);\n\s+return;/);
});

test("kare dongusu parmak kipirdamasa da beklemeyi ilerletir; halka, capa isareti", () => {
  const tick = method("tickWallLine");
  assert.match(tick, /gesture\.dwell = advanceWallDwell\(gesture\.dwell, gesture\.client\.x, gesture\.client\.y, now\)/);
  assert.match(tick, /getWallDwellProgress\(gesture\.dwell, now\)/);
  assert.match(tick, /view\.drawDwellRing\(/);
  assert.match(tick, /const start = this\.wallLineStart \?\? gesture\.anchor;\n\s+view\.drawAnchor\(start\.x, start\.y/, "capa isareti cizginin ilk parcasinda degil");
  assert.match(scene, /this\.resolvePendingPlacement\(\);\n\s+this\.tickWallLine\(now\);/, "dongu cizgi tikini cagirmiyor");
});

test("kilitlenme titrer (ayar varsa), hayaleti saklar, capayi hayaletin kenarindan alir", () => {
  const lock = method("lockWallAnchor");
  assert.match(lock, /snapToTowerGrid\(gesture\.finger\.x, gesture\.finger\.y, WALL_TOWER_ID\)/);
  assert.match(lock, /placementGhost\?\.setVisible\(false\)/);
  assert.match(lock, /this\.feedback\?\.vibrate\(/, "titresim yonetmenden geciyor (ayar kapaliysa titremez)");
  assert.doesNotMatch(lock, /navigator\.vibrate/);
});

test("cizgi onizlemesi: gecerli yesil, gecersiz kirmizi, altin yetmeyen kehribar; bedel etiketi", () => {
  const render = method("renderWallLinePreview");
  assert.match(render, /!piece\.valid \? 0xef4444 : piece\.funded \? 0x22c55e : 0xf59e0b/);
  assert.match(render, /"scene\.line\.cost"/);
  assert.match(render, /"scene\.line\.costShort"/);
  assert.match(render, /"scene\.line\.noGold"/);
  assert.match(render, /"scene\.line\.none"/);
  const compute = method("computeWallLinePreview");
  assert.match(compute, /getWallLine\(\{ \.\.\.geometry, anchor, finger, axis \}\)/);
  assert.match(compute, /this\.isPreviewInBuildZone\(center\.x, center\.y, WALL_TOWER_ID\)/);
  assert.match(compute, /this\.canPlaceEdgePreview\(center\.x, center\.y, segment\.orientation, "", WALL_TOWER_ID\)/);
  assert.match(compute, /pickAffordableWallPieces\(pieces, affordable\)/);
});

test("birakis: capa varsa wall:line, yoksa eski tekli placeTower; capaya donen tek parca", () => {
  const finish = method("finishTowerDragAt");
  assert.match(finish, /const lineAnchor = this\.wallGesture\?\.anchor;\n\s+if \(lineAnchor\) \{/);
  assert.match(finish, /this\.sendWallLine\(lineAnchor, previewPoint\)/);
  // Gerileme: bos birakis eskisi gibi tek duvar kuruyor ve yankisini gosteriyor.
  assert.match(finish, /\} else if \(this\.room && canPlace\) \{/);
  assert.match(finish, /this\.room\.send\(this\.creativeMode \? "creative:tower" : "placeTower", \{\n\s+definitionId: tower\.id,\n\s+x: cell\.x,\n\s+y: cell\.y,/);
  assert.match(finish, /this\.echoPlacement\(cell\.x, cell\.y, tower\.id\);/);
  assert.match(finish, /this\.showNotice\(t\(this\.isPreviewInBuildZone\(cell\.x, cell\.y\) \? "scene\.place\.forbiddenZone" : "scene\.place\.blocked"\)\)/);
  // Tek duvar kurulunca tutamaclar siraya girer.
  assert.match(finish, /tower\.id === WALL_TOWER_ID && !this\.creativeMode/);
  assert.match(finish, /this\.queueWallHandles\(placed\)/);
  assert.match(finish, /this\.clearWallGesture\(\);\n\s+this\.draggedTowerDefinition = undefined;/);
});

test("sendWallLine: gecerli parca yoksa ya da altin yoksa istek gitmez; mesaj sunucu alanlariyla birebir", () => {
  const send = method("sendWallLine");
  assert.ok(send.indexOf("preview.validCount === 0") < send.indexOf('send("wall:line"'));
  assert.ok(send.indexOf("preview.placed.length === 0") < send.indexOf('send("wall:line"'));
  assert.match(send, /definitionId: WALL_TOWER_ID,\n\s+x1: anchor\.x,\n\s+y1: anchor\.y,\n\s+x2: finger\.x,\n\s+y2: finger\.y,\n\s+\.\.\.\(axis \? \{ axis \} : \{\}\)/);
  assert.match(send, /this\.queueWallHandles\(last\.segment\)/, "capadan en uzak kurulan parca tutamac icin kayit edilmiyor");
});

test("iptal kurallari: surukleme iptali jesti siler; ikinci temas ve pointercancel tutamac suruklemesini kapatir", () => {
  assert.match(method("cancelTowerDrag"), /this\.clearWallGesture\(\);/);
  assert.match(method("abandonMapGesture"), /this\.cancelWallHandleDrag\(\);/);
  const down = method("handleMapPointerDown");
  assert.match(down, /if \(this\.wallHandleDrag\) \{\n\s+this\.cancelWallHandleDrag\(\);\n\s+return;\n\s+\}/);
  // Tutamac basisi kalkan jestinden ve kule secimi akisindan once.
  assert.ok(down.indexOf("tryBeginWallHandleDrag") < down.indexOf("beginShieldGesture"));
  assert.ok(down.indexOf("tryBeginWallHandleDrag") < down.indexOf("releaseStrandedTowerDrag"));
});

test("tutamaclar: yalnizca kendi duvarlarin, serbest uclarda, 44 px hedef, 4 sn", () => {
  const targets = method("computeWallHandleTargets");
  assert.match(targets, /tower\.ownerId === this\.localSessionId\) own\.add/);
  assert.match(targets, /getWallRunEnds\(segment, own, geometry\.board\)/);
  assert.match(targets, /\.filter\(\(end\) => !all\.has\(key\(end\.next\)\)\)/, "baskasinin duvariyla kapanan uc tutamac gosteriyor");
  assert.match(targets, /tower\.definitionId !== WALL_TOWER_ID/);
  const tick = method("tickWallLine");
  assert.match(tick, /until: now \+ WALL_LINE_HANDLE_VISIBLE_MS/);
  assert.match(tick, /\(now >= handles\.until && !this\.wallHandleDrag\) \|\| this\.isWallHandleBlocked\(\)/);
  assert.match(method("tryBeginWallHandleDrag"), /\(WALL_LINE_HANDLE_TOUCH_PX \/ 2\) \* this\.getWorldPerCssPx\(\)/);
  // Gorunen daire hedeften kucuk: yarim hucre yaricapindan kucuk.
  assert.match(tick, /view\.drawHandles\(marks, this\.getMapCellSize\(\) \* 0\.3,/);
});

test("baska eylem bekliyorken tutamaclar gizli ve basilamaz", () => {
  const blocked = method("isWallHandleBlocked");
  for (const flag of ["pendingAction", "isGuidanceDragging", "draggedTowerDefinition", "workerPick", "pendingUltimateColumn", "pendingShopPlacement", "workerBanMode", "performanceSliderDragging", "cardChoiceRoot", "matchResultShown", "creativeMode"]) {
    assert.match(blocked, new RegExp(`this\\.${flag}\\b`), `${flag} tutamaci engellemiyor`);
  }
  assert.match(method("tryBeginWallHandleDrag"), /this\.isWallHandleBlocked\(\)/);
});

test("tutamac suruklemesi: esik alti dokunus normal harita dokunusuna duser, esik ustu cizgi yollar", () => {
  const finish = method("finishWallHandleDrag");
  assert.match(finish, /if \(!drag\.moved\) return false;/);
  assert.match(finish, /this\.sendWallLine\(anchor, finger, drag\.target\.axis\)/);
  assert.match(finish, /constrainWallHandleFinger\(/);
  const move = method("moveWallHandleDrag");
  assert.match(move, />\s*WALL_LINE_HANDLE_DRAG_PX/);
  // Dokunus akisi: tutamac suruklemesi bitince degilse normal yol, her dokunus tutamaclari kapatir.
  const tap = method("handleMapPointer");
  assert.match(tap, /if \(this\.finishWallHandleDrag\(pointer\)\) \{\n\s+this\.logTap\(pointer, "duvar cizgisi"\);\n\s+return;\n\s+\}\n\s+\/\/[^\n]*\n\s+this\.hideWallHandles\(\);/);
  assert.ok(tap.indexOf("hideWallHandles") < tap.indexOf("finishShieldGesture"), "kalkan jestinden sonra: kalkan birakisi tutamaclari kapatmiyor");
  assert.match(method("handleMapPointerMove"), /if \(this\.moveWallHandleDrag\(pointer\)\) \{\n\s+return;\n\s+\}/);
  // Satma dugmesi ve kule secimi tutamac yokken eskisi gibi: dokunus yollari yerinde.
  assert.match(tap, /this\.room\?\.send\("sellTower"/);
  assert.match(tap, /this\.selectedPlacedTowerId = tower\.id;/);
});

test("sunucu ozeti yalnizca kismen kurulan cizgide bildirim gosterir", () => {
  assert.match(scene, /room\.onMessage\("wall:line-result"/);
  assert.match(scene, /placed > 0 && skipped > 0/);
  assert.match(scene, /t\("scene\.line\.result", \{ placed, skipped \}\)/);
});

test("gorunum: dokunmatikte okunur, parlama yok, tek yerde sabit renkler", () => {
  assert.match(view, /drawDwellRing/);
  assert.match(view, /drawAnchor/);
  assert.match(view, /drawHandles/);
  assert.doesNotMatch(view, /BlendModes|postFX|preFX|setBlendMode/, "sert bilimkurgu: parilti yok");
});
