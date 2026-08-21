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
import { worldToGrid, gridToWorld, getStructureTravelCost } from "../packages/shared/dist/index.js";

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

/**
 * Yapilar gecilmez engel olmaktan cikip pahali hucreler oldu.
 *
 * Once bu hucrenin maliyeti `Infinity` idi ve dusman ancak tamamen cevrelenince
 * saldiriyordu. Artik bedel kirma suresiyle orantili: surus haritanin en zayif
 * noktasina akar, tam kapatmak da gecerli ama pahali bir strateji olur.
 */
test("kule hücresi geçilebilir ama canıyla orantılı olarak pahalıdır", () => {
  const { room } = roomWithEnemy();
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const cell = worldToGrid(spot.x, spot.y, room.activeMap);
  const tower = [...room.towers.values()][0];

  const cost = room.getCellTravelCost(cell.col, cell.row);
  assert.ok(Number.isFinite(cost), "yapi hala gecilmez sayiliyor");
  assert.equal(cost, getStructureTravelCost(tower.hp));
  assert.ok(cost > 1, "yapinin bedeli bos hucreden yuksek olmali");
  assert.equal(room.getCellTravelCost(cell.col, 0), 1, "bos hucre bedelsiz kalmali");
});

test("hasar alan yapı ucuzlar, yıkılan yapı bedelsiz olur", () => {
  const { room } = roomWithEnemy();
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const cell = worldToGrid(spot.x, spot.y, room.activeMap);
  const tower = [...room.towers.values()][0];

  const full = room.getCellTravelCost(cell.col, cell.row);
  tower.hp *= 0.25;
  const damaged = room.getCellTravelCost(cell.col, cell.row);
  assert.ok(damaged < full, "hasarli yapi hala tam bedelli");

  tower.hp = 0;
  assert.equal(room.getCellTravelCost(cell.col, cell.row), 1, "yikilan yapi hala engel");
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

/** Oyuncunun kule kapasitesini test suresince acar. */
function unlockCapacity(room) {
  room.state.players.get("p1").runModifiers.push({ source: "test", scope: "player", stat: "towerCapacity", add: 40 });
}

/** Verilen satiri, birakilan bosluk disinda bastan sona kapatir. */
function sealRow(room, row, gapCol) {
  const built = [];
  for (let col = 0; col < room.activeMap.cols; col += 1) {
    if (col === gapCol) continue;
    const world = gridToWorld(col, row, room.activeMap);
    if (!room.canPlaceTower(world.x, world.y, "warrior-1", "horizontal")) continue;
    room.placeTower({ sessionId: "p1" }, { x: world.x, y: world.y, definitionId: "warrior-1" });
    built.push(col);
  }
  return built;
}

test("tek zayıf kapı bırakılınca akış duvarı kırmak yerine kapıya yönelir", () => {
  const room = createRoom("warrior");
  unlockCapacity(room);
  const wallRow = 4;
  const gapCol = 8;
  sealRow(room, wallRow, gapCol);

  // Duvarin ustundeki her hucreden akisi izle: hepsi gedige varmali.
  for (let col = 0; col < room.activeMap.cols; col += 1) {
    let cell = { col, row: wallRow - 1 };
    let steps = 0;
    while (cell.row < wallRow && steps < 60) {
      const next = room.getFlowNextCell(cell);
      assert.ok(next, `${col}: akis kesildi`);
      cell = next;
      steps += 1;
    }
    assert.equal(cell.col, gapCol, `${col}. sutundaki dusman duvari kirmayi secti`);
  }
});

test("kapı kapatılınca akış en ucuz duvarı hedefler ve düşman sıkışmaz", () => {
  const room = createRoom("warrior");
  unlockCapacity(room);
  const wallRow = 4;
  sealRow(room, wallRow, -1);

  // Bir duvar hasarli: en ucuz gecis noktasi orasi olmali.
  const towers = [...room.towers.values()].sort((a, b) => a.x - b.x);
  assert.ok(towers.length >= 3, "test icin yeterli duvar kurulamadi");
  const weakest = towers[2];
  weakest.hp = Math.max(1, weakest.hp * 0.1);
  room.markFlowFieldDirty();

  const weakCell = worldToGrid(weakest.x, weakest.y, room.activeMap);
  const above = gridToWorld(weakCell.col, wallRow - 1, room.activeMap);
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.x = above.x;
  enemy.y = above.y;

  const route = room.findEnemyRoute(enemy);
  assert.ok(route.targetTower, "tamamen kapali haritada dusman saldirmali");
  assert.equal(route.targetTower.id, weakest.id, "en ucuz duvar hedeflenmedi");
  assert.equal(enemy.structureTargetId, weakest.id, "hedef kilitlenmedi");
});

test("duvar yıkılınca akış yeni boşluktan geçer", () => {
  const room = createRoom("warrior");
  unlockCapacity(room);
  const wallRow = 4;
  sealRow(room, wallRow, -1);

  const towers = [...room.towers.values()].sort((a, b) => a.x - b.x);
  const broken = towers[1];
  const brokenCell = worldToGrid(broken.x, broken.y, room.activeMap);

  broken.hp = 0;
  room.markFlowFieldDirty();

  const above = { col: brokenCell.col, row: wallRow - 1 };
  const next = room.getFlowNextCell(above);
  assert.deepEqual(next, brokenCell, "akis acilan bosluktan gecmiyor");
  assert.equal(room.getCellTravelCost(brokenCell.col, brokenCell.row), 1);
});

test("uçan düşmanlar duvarları tamamen yok sayar", () => {
  const room = createRoom("warrior");
  unlockCapacity(room);
  sealRow(room, 4, -1);

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.movementKind = "air";
  const above = gridToWorld(0, 3, room.activeMap);
  enemy.x = above.x;
  enemy.y = above.y;

  const route = room.findEnemyRoute(enemy);
  assert.equal(route.targetTower, undefined, "ucan dusman yapiya saldiriyor");
  assert.ok(route.exitPoint, "ucan dusmana nexus hedefi verilmemis");
  assert.ok(route.exitPoint.y > enemy.y, "ucan dusman nexusa dogru yonelmiyor");
});

test("kara düşman aynı hatta hâlâ duvara takılır", () => {
  // Ucan dali kara davranisini bozmamali: karsi-oyun yalnizca havaya ait.
  const room = createRoom("warrior");
  unlockCapacity(room);
  sealRow(room, 4, -1);

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  const above = gridToWorld(0, 3, room.activeMap);
  enemy.x = above.x;
  enemy.y = above.y;

  assert.ok(room.findEnemyRoute(enemy).targetTower, "kara dusman duvari gormezden geldi");
});
