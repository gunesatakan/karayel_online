/**
 * Dusman yonlendirmesi.
 *
 * Yol bulma dusman basina BFS'ten ortak akis alanina tasindi. Buradaki testler
 * sunucu tarafindaki iki sozu tutar: yonlendirme hala nexusa goturur, ve
 * tikanan dusman bir yapiyi hedef aldiginda o karari her tick yeniden vermez.
 *
 * Yalpalama bu sistemin en kritik detayi: kilit olmasa yapi hasar aldikca alan
 * degisir, dusman iki gedik arasinda gidip gelir ve hicbirini kiramaz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { worldToGrid, gridToWorld } from "../packages/shared/dist/index.js";

function roomWithEnemy() {
  const room = createRoom("warrior");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  return { room, enemy };
}

test("engelsiz haritada akış düşmanı aşağı, çıkışa doğru götürür", () => {
  const { room, enemy } = roomWithEnemy();
  const before = worldToGrid(enemy.x, enemy.y, room.activeMap);
  const route = room.findEnemyRoute(enemy);

  assert.equal(route.reachedBottom, false);
  assert.equal(route.targetTower, undefined, "engelsiz haritada yapiya saldirmamali");
  assert.ok(route.cells[1], "akis bir sonraki hucreyi vermeli");
  assert.ok(route.cells[1].row > before.row, "akis nexusa dogru inmeli");
});

test("akış alanı yapı değişene kadar yeniden hesaplanmaz", () => {
  const { room } = roomWithEnemy();
  const first = room.getFlowField();
  assert.equal(room.getFlowField(), first, "degisiklik yokken alan yeniden kurulmus");

  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  assert.notEqual(room.getFlowField(), first, "kule kurulunca alan tazelenmemis");
});

test("kule kurulunca o hücre akış için geçilmez olur", () => {
  const { room } = roomWithEnemy();
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const cell = worldToGrid(spot.x, spot.y, room.activeMap);

  assert.equal(room.getCellTravelCost(cell.col, cell.row), Number.POSITIVE_INFINITY);
  assert.equal(room.getCellTravelCost(cell.col, 0), 1, "bos hucre gecilebilir kalmali");
});

/**
 * Kapana kisilmis dusman kurar.
 *
 * Haritayi bastan sona kapatmak su an hala yasak (`hasOpenGridRoute`); o kural
 * duvarlar "gecilebilir ama pahali" olunca kalkacak. Bu yuzden kilit, dusmanin
 * yerel olarak cevrelendigi durumda sinaniyor: harita genelinde yol acik kaldigi
 * icin yerlestirme kabul ediliyor, ama o hucreden cikis yok.
 */
function trapEnemyInCorner() {
  const room = createRoom("warrior");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];

  // Kose hucre: solda harita kenari var, kalan uc yon kapatiliyor.
  const trapped = { col: 0, row: 2 };
  const spot = gridToWorld(trapped.col, trapped.row, room.activeMap);
  enemy.x = spot.x;
  enemy.y = spot.y;

  for (const cell of [{ col: 0, row: 1 }, { col: 1, row: 2 }, { col: 0, row: 3 }]) {
    const world = gridToWorld(cell.col, cell.row, room.activeMap);
    assert.ok(
      room.canPlaceTower(world.x, world.y, "warrior-1", "horizontal"),
      `${cell.col}:${cell.row} kapatilamadi`
    );
    room.placeTower({ sessionId: "p1" }, { x: world.x, y: world.y, definitionId: "warrior-1" });
  }
  return { room, enemy };
}

test("kapana kısılan düşman hedefini kilitler ve her tick yeniden karar vermez", () => {
  const { room, enemy } = trapEnemyInCorner();

  const first = room.findEnemyRoute(enemy);
  assert.ok(first.targetTower, "cikisi olmayan dusman bir yapi hedeflemeli");
  assert.equal(enemy.structureTargetId, first.targetTower.id, "hedef kilitlenmemis");

  // Yapi hasar alsa bile karar degismemeli: yalpalamanin onlendigi yer burasi.
  first.targetTower.hp *= 0.4;
  for (let tick = 0; tick < 5; tick += 1) {
    const route = room.findEnemyRoute(enemy);
    assert.equal(route.targetTower?.id, first.targetTower.id, `tick ${tick}: hedef degisti`);
  }
});

test("hedef yıkılınca kilit düşer", () => {
  const { room, enemy } = trapEnemyInCorner();
  const locked = room.findEnemyRoute(enemy).targetTower;
  assert.ok(locked);

  locked.hp = 0;
  const route = room.findEnemyRoute(enemy);
  assert.notEqual(route.targetTower?.id, locked.id, "yikilan yapi hala hedefleniyor");
});
