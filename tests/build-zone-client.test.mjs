/**
 * Kurulum yasak bolgeler: istemci.
 *
 * 1. Cizim (apps/web/src/vfx/build-zones.ts): koyu zemin, kareye kirpilmis
 *    capraz tarama, sabit catlaklar ve leke basina tek birlesik dis kontur
 *    (kare kare degil). Hareket yok: cizim harita degisince bir kez.
 * 2. Onizleme kurali sunucununkiyle ayni: kule ayak izi (2x2 dahil) ve kenar
 *    yapisinin segmenti; gecersiz karede hayalet ve menzil halkasi soluk
 *    kirmizi, birakista neden soyleniyor.
 * 3. Tel: bolgeler tam statik anlik goruntuden okunuyor, harita anahtarina
 *    giriyor; sunucunun reddi (`placement:rejected`) bildirim olarak.
 * 4. Brifing kutusu kart perdesindeki Yenile dugmesini ortmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBuildZoneRandom, generateBuildZones, getEdgeSegments } from "../packages/shared/dist/index.js";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const zonesModule = await importWebModule("apps/web/src/vfx/build-zones.ts");
const tutorial = await importWebModule("apps/web/src/tutorial.ts");
const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const metrics = { originX: 0, originY: 86, cellSize: 34 };

/** 12x18: L bicimli uc karelik leke ve ayri tek kare. */
const sample = { cols: 12, rows: 18, cells: [3 * 12 + 2, 3 * 12 + 3, 4 * 12 + 2, 8 * 12 + 7] };

test("kontur leke basina tek, birlesik ve dis sinirda", () => {
  const contours = zonesModule.getBuildZoneContours(sample);
  assert.equal(contours.length, 2, "iki leke, iki kontur");
  // L: 6 kose (bitisik kareler arasinda cizgi yok, ara koseler atilmis).
  const lShape = contours.find((contour) => contour.length === 6);
  assert.ok(lShape, "L konturu 6 koseli degil");
  const corners = new Set(lShape.map((corner) => `${corner.col}:${corner.row}`));
  for (const corner of ["2:3", "4:3", "4:4", "3:4", "3:5", "2:5"]) assert.ok(corners.has(corner), `${corner} eksik`);
  const single = contours.find((contour) => contour.length === 4);
  assert.deepEqual(single.map((corner) => `${corner.col}:${corner.row}`).sort(), ["7:8", "7:9", "8:8", "8:9"]);

  // Gercek uretimde de: kontur sayisi leke sayisi, kontur koseleri leke sinirinda.
  for (let seed = 0; seed < 40; seed += 1) {
    const zones = generateBuildZones({ cols: 16, rows: 24, random: createBuildZoneRandom(seed) });
    assert.equal(zonesModule.getBuildZoneContours(zones).length, zones.blobs.length, `tohum ${seed}`);
  }
});

test("tarama kareye kirpilmis ve dunyaya hizali; catlaklar sabit", () => {
  const segments = zonesModule.getBuildZoneHatchSegments(sample, metrics);
  assert.ok(segments.length >= sample.cells.length * 3, "tarama cok seyrek");
  const inside = (x, y) => sample.cells.some((index) => {
    const col = index % 12;
    const row = Math.floor(index / 12);
    const x0 = col * 34;
    const y0 = 86 + row * 34;
    return x >= x0 - 1e-6 && x <= x0 + 34 + 1e-6 && y >= y0 - 1e-6 && y <= y0 + 34 + 1e-6;
  });
  const spacing = 34 * zonesModule.BUILD_ZONE_STYLE.hatchSpacing;
  for (const segment of segments) {
    assert.ok(inside(segment.x1, segment.y1) && inside(segment.x2, segment.y2), "tarama kare disina tasiyor");
    // "/" yonunde, x + y = k * aralik (bitisik karede kesintisiz).
    const k = (segment.x1 + segment.y1) / spacing;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-6);
    assert.ok(Math.abs((segment.x2 + segment.y2) - (segment.x1 + segment.y1)) < 1e-6);
  }
  assert.deepEqual(zonesModule.getBuildZoneCrackPaths(sample, metrics), zonesModule.getBuildZoneCrackPaths(sample, metrics));
});

test("cizim: koyu zemin, ince tarama, pas rengi tek kontur; bos bolgede hic cagri yok", () => {
  const graphics = createRecorder();
  zonesModule.drawBuildZones(graphics, sample, metrics);
  const calls = graphics.calls;
  assert.equal(calls.filter(([name]) => name === "fillRect").length, sample.cells.length, "kare basina bir zemin");
  const outlines = calls.filter(([name, , close]) => name === "strokePoints" && close === true);
  assert.equal(outlines.length, 2, "leke basina tek kapali kontur");
  const style = zonesModule.BUILD_ZONE_STYLE;
  const lineStyles = calls.filter(([name]) => name === "lineStyle");
  assert.ok(lineStyles.some(([, , color]) => color === style.outline), "kontur rengi yok");
  assert.ok(lineStyles.some(([, , color]) => color === style.hatch), "tarama rengi yok");
  // Sessiz: soluk tarama, parilti yok (toplamali karisim ya da isik yok).
  assert.ok(style.hatchAlpha <= 0.3);
  assert.ok(!calls.some(([name]) => name === "setBlendMode" || /glow/i.test(name)));
  assert.deepEqual([...new Set(calls.map(([name]) => name))].sort(), ["fillRect", "fillStyle", "lineBetween", "lineStyle", "strokePoints"]);
  const fill = calls.find(([name]) => name === "fillStyle");
  assert.ok(fill[2] >= 0.35 && fill[2] <= 0.65, "zemin koyulastirmasi");

  const empty = createRecorder();
  zonesModule.drawBuildZones(empty, undefined, metrics);
  zonesModule.drawBuildZones(empty, { cols: 12, rows: 18, cells: [] }, metrics);
  assert.equal(empty.calls.length, 0);
});

test("onizleme kurali: kule karesi, 2x2'nin tek karesi ve degen kenar gecersiz", () => {
  const board = { cols: 12, rows: 18 };
  const blocked = (placement) => zonesModule.isPlacementBlockedByBuildZone(sample, board, placement);
  assert.equal(blocked({ footprint: [{ col: 2, row: 3 }] }), true);
  assert.equal(blocked({ footprint: [{ col: 5, row: 3 }] }), false);
  assert.equal(blocked({ footprint: [{ col: 0, row: 2 }, { col: 1, row: 2 }, { col: 1, row: 3 }, { col: 2, row: 3 }] }), true, "2x2'nin bir karesi bolgede");
  assert.equal(blocked({ footprint: [{ col: 5, row: 5 }, { col: 6, row: 5 }, { col: 5, row: 6 }, { col: 6, row: 6 }] }), false);
  // Duvar: istemcinin kullandigi paylasilan segment hesabiyla.
  const segmentsAt = (x, y, orientation) => getEdgeSegments({ x, y, orientation, length: 1, gridSize: 34, origin: { x: 0, y: 86 }, board });
  // (4,3)'un sol kenari = (3,3)'un sag kenari: bolgeye degiyor.
  assert.equal(blocked({ segments: segmentsAt(4 * 34 + 1, 86 + 3.5 * 34, "vertical") }), true);
  // (5,3)'un sol kenari: (4,3) ve (5,3) bos.
  assert.equal(blocked({ segments: segmentsAt(5 * 34 + 1, 86 + 3.5 * 34, "vertical") }), false);
  // (7,8)'in alt kenari.
  assert.equal(blocked({ segments: segmentsAt(7.5 * 34, 86 + 9 * 34 + 1, "horizontal") }), true);
  // Olcusu tutmayan (eski arena) bolge yok sayiliyor.
  assert.equal(zonesModule.isPlacementBlockedByBuildZone(sample, { cols: 16, rows: 24 }, { footprint: [{ col: 2, row: 3 }] }), false);
});

test("sahne: onizleme bolgeyi reddediyor, birakista neden soyleniyor, cizim ve tel bagli", () => {
  const source = readSource("apps/web/src/scenes/GameScene.ts");
  const body = (name) => {
    const start = source.indexOf(`  private ${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    return source.slice(start, source.indexOf("\n  }\n", start));
  };
  // Hem kule hem kenar yolundan once: tek kapi.
  const preview = body("canPlaceTowerPreview");
  assert.ok(preview.indexOf("this.isPreviewInBuildZone(x, y)") >= 0);
  assert.ok(preview.indexOf("this.isPreviewInBuildZone(x, y)") < preview.indexOf("this.isEdgePlacedDefinition(definitionId)"));
  const zone = body("isPreviewInBuildZone");
  assert.match(zone, /isPlacementBlockedByBuildZone\(zones, board, \{ segments \}\)/);
  assert.match(zone, /isPlacementBlockedByBuildZone\(zones, board, \{ footprint: this\.getTowerPreviewFootprintCells\(x, y\) \}\)/);
  // Hayalet ve halka ayni `canPlace`i okuyor (gecersizde soluk kirmizi).
  const update = body("updateTowerDragAt");
  assert.match(update, /const canPlace = this\.canPlaceTowerPreview\(cell\.x, cell\.y\)/);
  assert.match(update, /setTint\(canPlace \? 0x86efac : 0xf87171\)/);
  assert.match(update, /this\.placementRange\?\.update\(\{[\s\S]*canPlace,/);
  assert.match(body("finishTowerDragAt"), /this\.isPreviewInBuildZone\(cell\.x, cell\.y\) \? "scene\.place\.forbiddenZone" : "scene\.place\.blocked"/);
  // Cizim: tepe/cukur isaretleriyle ayni grafikte (zeminin ustunde); egik 3D
  // gorunum bolgeleri kendisi ciziyor, orada gizli. Anahtar bolgeleri de iceriyor.
  const map = body("drawMap");
  assert.match(map, /const reliefs = this\.buildZoneReliefGraphics \?\? this\.add\.graphics\(\)/);
  assert.match(map, /drawBuildZones\(reliefs, this\.getActiveBuildZones\(\), \{ originX: origin\.x, originY: origin\.y, cellSize \}\)/);
  assert.ok(map.indexOf("drawBuildZones(reliefs") < map.indexOf("this.syncBuildZoneReliefVisibility()"), "gorunurluk cizimden sonra");
  assert.match(body("syncBuildZoneReliefVisibility"), /this\.buildZoneReliefGraphics\?\.setVisible\(this\.towerLayer3d\?\.getView\(\) !== "angled"\)/);
  assert.match(body("getMapRenderKey"), /getBuildZoneRenderKey\(zones\)/);
  assert.match(body("syncMap"), /this\.getMapRenderKey\(map\)/);
  // Tel: tam statik anlik goruntu; haritadan once yaziliyor.
  const full = body("applyFullStaticSnapshot");
  assert.ok(full.indexOf("this.buildZones = snapshot.buildZones") >= 0);
  assert.ok(full.indexOf("this.buildZones = snapshot.buildZones") < full.indexOf("this.syncMap(snapshot.map)"));
  // Red konumu da tasiyabiliyor (operator bedeni varinca kare doluydu): o karenin hayaleti kalkiyor.
  assert.match(source, /room\.onMessage\("placement:rejected", \(message: \{ message\?: string; key\?: string; x\?: number; y\?: number \}\) => \{\n(?:\s*\/\/.*\n)?\s*this\.dropPendingPlacementAt\(message\?\.x, message\?\.y\);\n\s*this\.showNotice\(localizeServerText\(message\?\.message, message\?\.key\) \?\? t\("scene\.place\.forbiddenZone"\)\)/);
});

test("metinler: TR ve EN, sunucu anahtari sozlukte", () => {
  const scene = readSource("apps/web/src/locales/areas/scene.ts");
  const server = readSource("apps/web/src/locales/areas/server.ts");
  assert.match(scene, /"scene\.place\.forbiddenZone": "Bu bölgeye kurulum yapılamaz"/);
  assert.match(scene, /"scene\.place\.forbiddenZone": "Can't build in a no-build zone"/);
  assert.match(server, /"server\.placement\.forbiddenZone": "Bu bölgeye kurulum yapılamaz"/);
  assert.match(server, /"server\.placement\.forbiddenZone": "Can't build in a no-build zone"/);
  assert.match(readSource("docs/i18n-glossary.md"), /\| Kurulum yasak bölge \| No-build zone \|/);
});

test("brifing kutusu kart perdesinde Yenile dugmesini ortmuyor", () => {
  const { pickTutorialBoxTop, TUTORIAL_CARD_AVOID_SELECTOR } = tutorial;
  assert.equal(TUTORIAL_CARD_AVOID_SELECTOR, ".card-draft__actions");
  // 375x812: kutu ~110 px; alt kenardaki yeri (690) Yenile satirinin (674-718) ustune biniyordu.
  const viewportHeight = 812;
  const boxHeight = 110;
  const reroll = { top: 674, bottom: 718 };
  const preferred = viewportHeight - boxHeight - 12;
  const overlaps = (top, span) => top < span.bottom && top + boxHeight > span.top;
  assert.equal(overlaps(preferred, reroll), true, "senaryo eski hatayi kurmuyor");
  const top = pickTutorialBoxTop({ viewportHeight, boxHeight, preferred, avoid: [reroll] });
  assert.equal(overlaps(top, reroll), false, `kutu (${top}) Yenile dugmesini ortuyor`);
  assert.ok(top >= 0 && top + boxHeight <= viewportHeight);
  // Yenile satirinin altinda yer varsa oraya; ortusme yoksa yer degismiyor.
  assert.equal(pickTutorialBoxTop({ viewportHeight, boxHeight, preferred, avoid: [{ top: 420, bottom: 464 }] }), preferred);
  const below = pickTutorialBoxTop({ viewportHeight: 1000, boxHeight, preferred: 878, avoid: [{ top: 600, bottom: 644 }] });
  assert.equal(below, 878);
  const tall = pickTutorialBoxTop({ viewportHeight: 1000, boxHeight, preferred: 640, avoid: [{ top: 600, bottom: 644 }] });
  assert.equal(overlaps(tall, { top: 600, bottom: 644 }), false);

  // Kaynak: kart adimi Yenile satirindan kaciniyor; kutu yerlesimi onu okuyor.
  const source = readSource("apps/web/src/tutorial.ts");
  assert.match(source, /if \(id === "card"\) \{\n\s*\/\/[^\n]*\n\s*return \{ element: null, anchor: "bottom", avoid: document\.querySelector\(TUTORIAL_CARD_AVOID_SELECTOR\) \};/);
  assert.match(source, /top = pickTutorialBoxTop\(\{ viewportHeight: viewport\.height, boxHeight, preferred: top, avoid: \[avoidRect\] \}\)/);
  assert.match(source, /place\(target, anchor, avoid\)/);
  // Yenile satiri gercekten bu sinifta (kart perdesi).
  assert.match(readSource("apps/web/src/scenes/GameScene.ts"), /<div class="card-draft__actions">\s*<button class="card-draft__reroll"/);
});
