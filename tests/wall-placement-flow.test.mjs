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
  towerCatalog
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
