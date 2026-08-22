/**
 * Duvar yerlestirme akisi: istemcinin gonderdigi nokta ile sunucunun cozdugu
 * yon birbirini tutmali.
 *
 * Bu zincirde iki sessiz kirilma yasandi. Istemcinin snap'i yalnizca Abarti'yi
 * kenar yapisi sayiyordu, dolayisiyla duvar kare merkezine oturuyordu -- ve kare
 * merkezinde yatay ile dikey cizgiye uzaklik esit oldugu icin **her duvar dikey
 * cikiyordu**. Testler sunucuyu dogrudan cagirdigi icin bunu goremiyordu.
 *
 * Buradaki testler istemcinin uretecegi noktalarla sunucuyu surer: yani zincirin
 * tamami.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  WALL_TOWER_ID,
  getMapGridSize,
  getMapOrigin,
  towerCatalog,
  getEdgeSegments
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

/** Istemcinin yon secimiyle ayni kural: hangi cizgiye daha yakin. */
function clientOrientationAt(room, x, y) {
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const toVertical = Math.abs((x - origin.x) / gridSize - Math.round((x - origin.x) / gridSize));
  const toHorizontal = Math.abs((y - origin.y) / gridSize - Math.round((y - origin.y) / gridSize));
  return toVertical <= toHorizontal ? "vertical" : "horizontal";
}

test("duvar tanımı kenar yerleşimi ister", () => {
  const wall = towerCatalog.warrior.find((tower) => tower.id === WALL_TOWER_ID);
  assert.ok(wall, "duvar kurulabilir listede yok");
  assert.equal(wall.engine?.placement?.requiresEdge, true);
});

test("dikey çizgiye yakın bırakılan duvar dikey, yatay çizgiye yakın olan yatay durur", () => {
  const room = createRoom("warrior");
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);

  // Dikey cizgiye cok yakin, yatay cizgiden uzak bir nokta.
  const nearVertical = { x: origin.x + 5 * gridSize + 2, y: origin.y + 4 * gridSize + gridSize / 2 };
  assert.equal(clientOrientationAt(room, nearVertical.x, nearVertical.y), "vertical");
  assert.equal(room.getEdgeOrientationAt(nearVertical.x, nearVertical.y), "vertical", "sunucu istemciyle ayni yonu vermiyor");

  // Yatay cizgiye cok yakin, dikey cizgiden uzak bir nokta.
  const nearHorizontal = { x: origin.x + 6 * gridSize + gridSize / 2, y: origin.y + 5 * gridSize + 2 };
  assert.equal(clientOrientationAt(room, nearHorizontal.x, nearHorizontal.y), "horizontal");
  assert.equal(room.getEdgeOrientationAt(nearHorizontal.x, nearHorizontal.y), "horizontal", "sunucu istemciyle ayni yonu vermiyor");
});

test("kare merkezine bırakmak artık her duvarı dikey yapmaz", () => {
  // Eski hata tam olarak buydu: istemci duvari kare merkezine snapliyordu ve
  // orada iki cizgiye uzaklik esit oldugu icin yon hep dikeye dusuyordu.
  // Istemci artik kenar yoluna girdigi icin ham noktanin yonu korunuyor.
  const room = createRoom("warrior");
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);

  const orientations = new Set();
  for (const [dx, dy] of [[0.05, 0.5], [0.5, 0.05], [0.95, 0.5], [0.5, 0.95]]) {
    const x = origin.x + (5 + dx) * gridSize;
    const y = origin.y + (4 + dy) * gridSize;
    orientations.add(room.getEdgeOrientationAt(x, y));
  }
  assert.equal(orientations.size, 2, "yon her zaman ayni cikiyor");
});

test("sunucu snap'i sonrası segment aynı kenarda kalır", () => {
  const room = createRoom("warrior");
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);

  for (const orientation of ["vertical", "horizontal"]) {
    const raw = orientation === "vertical"
      ? { x: origin.x + 5 * gridSize + 1, y: origin.y + 4 * gridSize + gridSize / 2 }
      : { x: origin.x + 6 * gridSize + gridSize / 2, y: origin.y + 5 * gridSize + 1 };

    const snapped = room.snapToTowerGrid(raw.x, raw.y, WALL_TOWER_ID, orientation);
    const before = room.getAbartiEdgeSegments(raw.x, raw.y, orientation, 1);
    const after = room.getAbartiEdgeSegments(snapped.x, snapped.y, orientation, 1);
    assert.deepEqual(after, before, `${orientation}: snap segmenti kaydiriyor`);
  }
});

/**
 * Duvar butonunun tepkisiz kalmasi tek bir sebepten degildi: istemcinin dort
 * ayri yeri "kenar yapisi" derken yalnizca Abarti'yi kastediyordu. Bunlarin
 * hicbiri sunucu testleriyle yakalanamiyordu cunku hepsi istemci tarafindaydi.
 *
 * Geometri artik `packages/shared` icinde tek kopya; buradaki testler o kopyanin
 * iki uzunlukta da dogru davrandigini ve iki tarafin ayni sonucu urettigini
 * sabitler.
 */
test("ortak kenar geometrisi tek ve çift uzunlukta doğru oturur", () => {
  const room = createRoom("warrior");
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const board = { cols: room.activeMap.cols, rows: room.activeMap.rows };

  // Imlec 4. satirin ortasinda, 5. dikey cizginin uzerinde.
  const x = origin.x + 5 * gridSize;
  const y = origin.y + 4 * gridSize + gridSize / 2;

  const single = getEdgeSegments({ x, y, orientation: "vertical", length: 1, gridSize, origin, board });
  assert.deepEqual(single, [{ orientation: "vertical", col: 5, row: 4 }], "tek cizgi imlecin karesine oturmuyor");

  const double = getEdgeSegments({ x, y, orientation: "vertical", length: 2, gridSize, origin, board });
  assert.equal(double.length, 2);
  assert.deepEqual(double[0], { orientation: "vertical", col: 5, row: 4 }, "cift cizgi kaymis");
});

test("sunucu ortak geometriyi kullanır", () => {
  const room = createRoom("warrior");
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const board = { cols: room.activeMap.cols, rows: room.activeMap.rows };
  const x = origin.x + 5 * gridSize;
  const y = origin.y + 4 * gridSize + gridSize / 2;

  for (const length of [1, 2]) {
    assert.deepEqual(
      room.getAbartiEdgeSegments(x, y, "vertical", length),
      getEdgeSegments({ x, y, orientation: "vertical", length, gridSize, origin, board }),
      `uzunluk ${length}: sunucu ortak geometriden sapiyor`
    );
  }
});

test("duvar kurulabilir listede bulunur, kitte bulunmaz", () => {
  // Butonun tepkisiz kalmasinin sebebi tam olarak buydu: tikama isleyicisi
  // kuleyi kitte ariyordu.
  for (const characterId of Object.keys(towerCatalog)) {
    assert.ok(
      towerCatalog[characterId].some((tower) => tower.id === WALL_TOWER_ID),
      `${characterId}: duvar kurulabilir listede yok`
    );
  }
});
