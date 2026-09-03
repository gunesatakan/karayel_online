/**
 * Dusman yonlendirmesi.
 *
 * Yonlendirme ortak akis alanindan kor gezinmeye tasindi: dusman haritanin
 * tamamini bilmiyor, cikisa dogru yuruyup onune cikani duvar tutarak dolasiyor.
 * Buradaki testler sunucu tarafindaki uc sozu tutar: yuruyus hala nexusa
 * goturur, gercekten kapali hat kirilir, ve tikanan dusman bir yapiyi hedef
 * aldiginda o karari her tick yeniden vermez.
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

test("kule indeksi yapı değişene kadar yeniden kurulmaz", () => {
  // Kor gezinme her adimda "bu hucre acik mi" diye soruyor; o sorunun cevabi
  // dogrusal kule taramasi olsaydi maliyet dusman sayisiyla carpilirdi.
  const { room } = roomWithEnemy();
  const first = room.getTowerCellIndex();
  assert.equal(room.getTowerCellIndex(), first, "degisiklik yokken indeks yeniden kurulmus");

  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const cell = worldToGrid(spot.x, spot.y, room.activeMap);
  assert.ok(room.getTowerCellIndex().get(`${cell.col}:${cell.row}`), "kule kurulunca indeks tazelenmemis");
});

/**
 * Yapilar dusman icin gecilmez engeldir, ama yalnizca ayaktayken.
 *
 * Bir ara yapilar "gecilebilir ama pahali" hucrelerdi: akis alani kirmanin
 * dolasmaya deger olup olmadigini hesaplardi. Kor gezinmede boyle bir tartma
 * yok -- dusman bedeli bilmiyor, yalnizca onunun acik olup olmadigini biliyor.
 */
test("ayakta duran yapı hücreyi kapatır, yıkılan yapı serbest bırakır", () => {
  const { room } = roomWithEnemy();
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const cell = worldToGrid(spot.x, spot.y, room.activeMap);
  const tower = [...room.towers.values()][0];
  const ust = { col: cell.col, row: cell.row - 1 };

  assert.equal(room.isCellWalkable(ust, cell.col, cell.row), false, "yapi hucresi acik sayiliyor");
  assert.equal(room.isCellWalkable(ust, cell.col, 0), true, "bos hucre kapali sayiliyor");

  // Hasar yolu acmaz: yalnizca yikilmak acar. Aksi halde dusman yarilanmis
  // duvarin icinden gecerdi.
  tower.hp *= 0.25;
  assert.equal(room.isCellWalkable(ust, cell.col, cell.row), false, "hasarli yapi yolu acmis");

  tower.hp = 0;
  assert.equal(room.isCellWalkable(ust, cell.col, cell.row), true, "yikilan yapi hala engel");
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

/**
 * Dusmani gercek yonlendirmeyle adim adim yurutur.
 *
 * Kor gezinmede tek bir cagri artik hicbir sey soylemiyor: dusman duvari
 * tutup dolasirken her adimda "saldirmiyorum" der. Anlamli olan sorunun
 * cevabi ancak yuruyusun sonunda cikar -- gedigi buldu mu, yoksa turu
 * kapatip kirmaya mi basladi.
 */
function driveEnemy(room, enemy, { maxTicks = 400 } = {}) {
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    const route = room.findEnemyRoute(enemy);
    if (route.targetTower) {
      return { outcome: "attack", tick, tower: route.targetTower, cell: worldToGrid(enemy.x, enemy.y, room.activeMap) };
    }

    const next = route.cells[1];
    if (!next) {
      return { outcome: "stuck", tick, cell: worldToGrid(enemy.x, enemy.y, room.activeMap) };
    }

    const world = gridToWorld(next.col, next.row, room.activeMap);
    enemy.x = world.x;
    enemy.y = world.y;
    if (next.row >= room.activeMap.rows - 1) {
      return { outcome: "exit", tick, cell: next };
    }
  }
  return { outcome: "loop", tick: maxTicks, cell: worldToGrid(enemy.x, enemy.y, room.activeMap) };
}

/** Verilen hucreye yerlestirilmis taze bir dusman. */
function enemyAt(room, col, row) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  const world = gridToWorld(col, row, room.activeMap);
  enemy.x = world.x;
  enemy.y = world.y;
  return enemy;
}

test("gedik birakilinca dusman duvari kirmadan gedigi bulur", () => {
  const room = createRoom("warrior");
  unlockCapacity(room);
  const wallRow = 4;
  const gapCol = 8;
  sealRow(room, wallRow, gapCol);

  // Hangi sutundan gelirse gelsin: duvari kirmadan asagi inebilmeli. Kor
  // gezinmenin butun mesele ettigi sey bu -- en kisa yol degil, **bir** yol.
  for (let col = 0; col < room.activeMap.cols; col += 1) {
    const enemy = enemyAt(room, col, wallRow - 1);
    const sonuc = driveEnemy(room, enemy);
    assert.equal(sonuc.outcome, "exit", `${col}. sutun: ${sonuc.outcome}`);
  }
});

test("hat bastan basa orulunce dusman dolasir, sonra kirar ve hedefini kilitler", () => {
  const room = createRoom("warrior");
  unlockCapacity(room);
  const wallRow = 4;
  sealRow(room, wallRow, -1);

  const enemy = enemyAt(room, 3, wallRow - 1);
  const sonuc = driveEnemy(room, enemy);

  assert.equal(sonuc.outcome, "attack", `orulu hattan gecildi: ${sonuc.outcome}`);
  assert.ok(sonuc.cell.row < wallRow, "dusman duvarin altina inmis");
  assert.equal(enemy.structureTargetId, sonuc.tower.id, "hedef kilitlenmedi");

  // Kilit hasarla bozulmamali: yalpalarsa dusman hicbir duvari kiramaz.
  sonuc.tower.hp *= 0.4;
  for (let tick = 0; tick < 5; tick += 1) {
    assert.equal(room.findEnemyRoute(enemy).targetTower?.id, sonuc.tower.id, `tick ${tick}: hedef degisti`);
  }
});

/**
 * Cikmaz sokak haberi.
 *
 * Turu kapatan dusman ogrendigini paylasir; arkadan gelen ayni turu bastan
 * atmaz. Bu yalnizca hiz meselesi degil, denge meselesi: her dusmanin ayri
 * ayri butun hatti taramasi, orulu hatti oyunun en guclu araci yapardi.
 */
test("kapanan cikis tur boyunca hatirlanir, hat acilinca unutulur", () => {
  const room = createRoom("warrior");
  unlockCapacity(room);
  sealRow(room, 4, -1);

  const oncu = driveEnemy(room, enemyAt(room, 3, 3));
  assert.equal(oncu.outcome, "attack");
  assert.ok(oncu.tick > 1, "oncu hic dolasmadan kirmaya basladi");
  assert.ok(room.sealedCells.size > 0, "kapanan tur hatirlanmadi");

  // Ayni yerden gelen ikinci dusman dolasmadan kirmali.
  const takipci = driveEnemy(room, enemyAt(room, 3, 3));
  assert.equal(takipci.outcome, "attack");
  assert.equal(takipci.tick, 1, `takipci turu bastan atti (${takipci.tick} adim)`);

  // Oyuncu hatti acinca hafiza gecersiz: yeni gedik denenmeli.
  room.markNavigationDirty();
  assert.equal(room.sealedCells.size, 0, "hat degisince hafiza temizlenmedi");
});

test("hatirlanan hucre hayalet duvara donusmez", () => {
  // Hafiza "buradan cikis yok" der, "burasi kapali" demez. Hucreyi gecilmez
  // isaretlemek dusmanlari acik zeminden kacirir ve hattan uzaklastirirdi.
  const room = createRoom("warrior");
  unlockCapacity(room);
  sealRow(room, 4, -1);
  driveEnemy(room, enemyAt(room, 3, 3));

  const [key] = [...room.sealedCells];
  const [col, row] = key.split(":").map(Number);
  assert.equal(room.isCellWalkable({ col, row: row - 1 }, col, row), true, "hatirlanan hucre kapatilmis");
});

test("duvar yikilinca dusman acilan bosluktan gecer", () => {
  const room = createRoom("warrior");
  unlockCapacity(room);
  const wallRow = 4;
  sealRow(room, wallRow, -1);

  const towers = [...room.towers.values()].sort((a, b) => a.x - b.x);
  const broken = towers[1];
  const brokenCell = worldToGrid(broken.x, broken.y, room.activeMap);
  broken.hp = 0;
  room.markNavigationDirty();

  const enemy = enemyAt(room, brokenCell.col, wallRow - 1);
  const sonuc = driveEnemy(room, enemy);

  assert.equal(sonuc.outcome, "exit", `acilan bosluktan gecilemedi: ${sonuc.outcome}`);
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

test("kara düşman aynı hatta hâlâ takılır", () => {
  // Ucan dali kara davranisini bozmamali: karsi-oyun yalnizca havaya ait.
  const room = createRoom("warrior");
  unlockCapacity(room);
  sealRow(room, 4, -1);

  const sonuc = driveEnemy(room, enemyAt(room, 0, 3));

  assert.equal(sonuc.outcome, "attack", "kara dusman orulu hattan gecti");
  assert.ok(sonuc.cell.row < 4, "kara dusman duvarin altina inmis");
});
