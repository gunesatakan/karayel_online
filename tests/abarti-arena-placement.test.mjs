/**
 * Abarti (zeynep-8) acik arenada kurulabilir.
 *
 * Kenar yapisi eskiden her segmentin yaninda `tower` harita karesi istiyordu
 * (insa alaninin kenari). Acik arenada hic `tower` karesi yok: 494 kenarin
 * 0'inda kurulabiliyordu (docs/simulator.md). Kuralin niyeti Abarti'yi bir
 * kulenin ates hattina oturtmak; arenada bu "kare kaplayan, ayakta bir
 * yapinin yanindaki kenar" demek. Kurulum yasak bolgesine degen kenar hala
 * yasak; duvarin kurali degismedi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, clearBuildZones } from "./helpers/match-room-harness.mjs";
import { getMapGridSize, getMapOrigin, gridToWorld, isAbartiEdgeAnchored } from "../packages/shared/dist/index.js";

function arena() {
  const room = createRoom("zeynep");
  room.broadcast = () => {};
  room.clients = [];
  room.mapScale = 1;
  room.stage = 1;
  room.resourceLayoutSeed = 5;
  room.configureArenaForScale();
  clearBuildZones(room);
  room.state.players.get("p1").runModifiers.push({ source: "test", scope: "player", stat: "towerCapacity", add: 20 });
  return room;
}

/** `col` cizgisi uzerinde, `row` ve `row+1` satirlarini ayiran dikey Abarti'nin merkezi. */
function verticalEdge(room, col, row) {
  const size = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  return { x: origin.x + col * size, y: origin.y + (row + 1) * size };
}

/** Butun dikey ve yatay Abarti konumlari icin gecerlilik sayimi. */
function countValidEdges(room) {
  const size = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const { cols, rows } = room.activeMap;
  let total = 0;
  let valid = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      total += 1;
      if (room.canPlaceTower(origin.x + col * size, origin.y + (row + 1) * size, "zeynep-8", "vertical")) valid += 1;
    }
  }
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      total += 1;
      if (room.canPlaceTower(origin.x + (col + 1) * size, origin.y + row * size, "zeynep-8", "horizontal")) valid += 1;
    }
  }
  return { total, valid };
}

function placeZeynepTower(room, col, row, definitionId = "zeynep-1") {
  const world = gridToWorld(col, row, room.activeMap);
  assert.ok(room.canPlaceTower(world.x, world.y, definitionId, "horizontal"), `kurgu: ${definitionId} (${col},${row}) kurulamiyor`);
  room.placeTower({ sessionId: "p1" }, { x: world.x, y: world.y, definitionId });
  return [...room.towers.values()].at(-1);
}

test("boş arenada Abartı'nın dayanacağı bir şey yok", () => {
  const room = arena();
  assert.equal(room.activeMap.tiles.includes("tower"), false, "kurgu: arenada tower karesi var");
  assert.equal(countValidEdges(room).valid, 0);
});

test("ZentaX kulesinin yanındaki kenara Abartı kurulur", () => {
  const room = arena();
  placeZeynepTower(room, 5, 8);
  const edge = verticalEdge(room, 6, 8); // kulenin sag kenari, 8-9. satirlar
  assert.equal(room.canPlaceTower(edge.x, edge.y, "zeynep-8", "vertical"), true, "kulenin yanindaki kenar reddedildi");

  const before = room.towers.size;
  room.placeTower({ sessionId: "p1" }, { x: edge.x, y: edge.y, definitionId: "zeynep-8", orientation: "vertical" });
  assert.equal(room.towers.size, before + 1, "Abarti kurulmadi");
  const abarti = [...room.towers.values()].at(-1);
  assert.equal(abarti.definition.id, "zeynep-8");
  assert.equal(abarti.orientation, "vertical");

  const { total, valid } = countValidEdges(room);
  assert.ok(valid > 0 && valid < total, `gecerli kenar sayisi ${valid}/${total}`);
});

test("kuleden uzak kenar reddedilir; yıkık kule dayanak değildir", () => {
  const room = arena();
  const tower = placeZeynepTower(room, 5, 8);
  const far = verticalEdge(room, 1, 3);
  assert.equal(room.canPlaceTower(far.x, far.y, "zeynep-8", "vertical"), false, "kuleden uzak kenar kabul edildi");
  // Segmentlerden biri kulenin yanindaysa yeter.
  const half = verticalEdge(room, 6, 7); // 7-8. satirlar: 8. satir kulenin yani
  assert.equal(room.canPlaceTower(half.x, half.y, "zeynep-8", "vertical"), true, "segmentlerden biri kulenin yaninda: kabul edilmeli");
  // Yalnizca kosesinden degen kenar dayanak degil.
  const below = verticalEdge(room, 6, 9); // 9-10. satirlar: kule 8. satirda
  assert.equal(room.canPlaceTower(below.x, below.y, "zeynep-8", "vertical"), false, "kuleye degmeyen kenar kabul edildi");

  tower.hp = 0;
  room.markNavigationDirty();
  const edge = verticalEdge(room, 6, 8);
  assert.equal(room.canPlaceTower(edge.x, edge.y, "zeynep-8", "vertical"), false, "yikik kule dayanak sayildi");
});

test("kurulum yasak bölgesine değen kenar kulenin yanında da reddedilir", () => {
  const room = arena();
  placeZeynepTower(room, 5, 8);
  const edge = verticalEdge(room, 6, 8);
  const { cols, rows } = room.activeMap;
  // Kenarin obur yanindaki kare (6,8) bolge.
  room.buildZones = { cols, rows, cells: [8 * cols + 6] };
  assert.equal(room.canPlaceTower(edge.x, edge.y, "zeynep-8", "vertical"), false, "bolgeye degen kenar kabul edildi");
  // Kulenin obur yanindaki kenar bolgeye degmiyor.
  const left = verticalEdge(room, 5, 8);
  assert.equal(room.canPlaceTower(left.x, left.y, "zeynep-8", "vertical"), true, "bolgeye degmeyen kenar reddedildi");
});

test("duvarın kuralı değişmedi: boş arenada da kurulur", () => {
  const room = arena();
  const size = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  assert.equal(room.canPlaceTower(origin.x + 4 * size, origin.y + 6.5 * size, "wall-1", "vertical"), true);
});

test("paylaşılan kural: yapı yanı ya da (eski) inşa alanı kenarı", () => {
  const board = { cols: 4, rows: 4 };
  const segments = [{ orientation: "vertical", col: 2, row: 1 }, { orientation: "vertical", col: 2, row: 2 }];
  const none = () => false;
  assert.equal(isAbartiEdgeAnchored(segments, board, none, none), false);
  // Tek segmentin yaninda yapi yeter.
  assert.equal(isAbartiEdgeAnchored(segments, board, none, (col, row) => col === 1 && row === 2), true);
  // Insa alani kenari: her segmentin bir yani `tower` karesi olmali.
  assert.equal(isAbartiEdgeAnchored(segments, board, (col, row) => col === 2 && row === 1, none), false);
  assert.equal(isAbartiEdgeAnchored(segments, board, (col) => col === 2, none), true);
  assert.equal(isAbartiEdgeAnchored([], board, () => true, () => true), false);
});
