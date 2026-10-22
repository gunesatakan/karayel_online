/**
 * Donmus dusman: kor gezinmenin "kir" karari kiracak yapi bulamayinca.
 *
 * Simulatorun buldugu hata (docs/simulator.md, asama 1, tohum 1,
 * Zeynep/balanced, 4. dalga): dusman duvar tutarken takip ettigi yapi
 * yikiliyor ya da satiliyor. Gezgin hala "duvar" kipinde ve girisin
 * yukarisinda oldugu icin duvari birakamiyor; acik zeminde el kurali onu
 * kucuk bir cembere sokuyor, cevrim tespiti "kapali" diyor ve `breakThrough`
 * kiracak komsu yapi bulamiyor. Gezgin sifirlanmadigi icin her tick ayni
 * karar: dusman o karede sonsuza kadar duruyor, dalga bitmiyor.
 *
 * Iki katman sinaniyor: (1) yapi bulunamayinca gezgin arama kipine donuyor,
 * (2) genel emniyet agi -- yurumesi gereken dusman 6 oyun saniyesi
 * kimildamazsa gezinme zorla sifirlaniyor; mesru bekleyis (yapiya saldiri,
 * donma, Metal Kalkan) sayilmiyor ve oda zarina dokunulmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, clearBuildZones } from "./helpers/match-room-harness.mjs";
import { ENEMY_STALL_RESET_SECONDS } from "../apps/server/dist/rooms/MatchRoom.js";
import { WALL_TOWER_ID, getMapGridSize, getMapOrigin, gridToWorld, worldToGrid } from "../packages/shared/dist/index.js";

const TICK = 1 / 60;

function unlockCapacity(room) {
  room.state.players.get("p1").runModifiers.push({ source: "test", scope: "player", stat: "towerCapacity", add: 60 });
}

function enemyAt(room, col, row) {
  // Navigation fixture must use a melee grunt. A random shooter can hit
  // nearby structures while correctly walking through the gap.
  const runtime = room.runtime;
  const pattern = room.wavePatternPlan;
  room.wavePatternPlan = undefined;
  room.runtime = Object.create(runtime);
  room.runtime.random = () => 0;
  try {
    room.spawnEnemy();
  } finally {
    room.runtime = runtime;
    room.wavePatternPlan = pattern;
  }
  const enemy = [...room.enemies.values()].at(-1);
  assert.equal(enemy.type, "grunt");
  const world = gridToWorld(col, row, room.activeMap);
  enemy.x = world.x;
  enemy.y = world.y;
  // Irk ozelligi (kazici, katlanma) testin konusu degil.
  enemy.raceTrait = undefined;
  return enemy;
}

/**
 * Simulatorde donan maçin yerlesimi (Atakan/balanced, asama 1, tohum 36,
 * 8. dalga; 12x18 arena). 10. ile 11. satir arasinda 4. sutunda gedigi olan
 * bir duvar hatti, hattin ustunde ve altinda kuleler. Sag elle hatta degen
 * dusman sag kenara gidip 9. satira tirmaniyor ve 9. satir boyunca sola
 * yuruyor: o satirdan birakma sarti (girisin altina inmek) hic saglanmiyor,
 * gedigi gormeden sol kenarda cevrim kapaniyor. Cevrimin kapandigi (1,9)
 * karesinin hicbir yaninda yapi yok -- `breakThrough` hedefsiz donuyordu.
 */
function simulatorFreezeLayout() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [];
  room.mapScale = 1;
  room.stage = 1;
  room.resourceLayoutSeed = 1;
  room.configureArenaForScale();
  clearBuildZones(room);
  unlockCapacity(room);
  const size = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const towerCells = [[0, 10], [2, 10], [7, 10], [5, 11], [3, 12], [7, 12], [1, 14], [3, 14], [5, 14], [9, 14], [1, 16], [3, 16], [5, 16]];
  for (const [col, row] of towerCells) {
    const world = gridToWorld(col, row, room.activeMap);
    room.placeTower({ sessionId: "p1" }, { x: world.x, y: world.y, definitionId: "warrior-1" });
  }
  const wallCols = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11];
  for (const col of wallCols) {
    room.placeTower({ sessionId: "p1" }, { x: origin.x + (col + 0.5) * size, y: origin.y + 11 * size, definitionId: WALL_TOWER_ID });
  }
  assert.equal(room.towers.size, towerCells.length + wallCols.length, "kurgu: yerlesim eksik kuruldu");
  const enemy = enemyAt(room, 8, 8);
  // Simulatordeki zar: ilk temasta sag el.
  enemy.navigator = undefined;
  enemy.navigatorHandHint = "right";
  return { room, enemy };
}

/** Dusmani gercek tempoda surer; cikisa vardi mi ve en uzun kac sn kimildamadi. */
function driveRealtime(room, enemy, seconds = 60) {
  let still = 0;
  let longestStill = 0;
  let last = { x: enemy.x, y: enemy.y };
  for (let tick = 0; tick < seconds / TICK; tick += 1) {
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateEnemies(TICK);
    if (!room.enemies.has(enemy.id)) return { exited: true, longestStill, seconds: tick * TICK };
    if (Math.hypot(enemy.x - last.x, enemy.y - last.y) < 1e-6) {
      still += TICK;
      longestStill = Math.max(longestStill, still);
    } else {
      still = 0;
    }
    last = { x: enemy.x, y: enemy.y };
  }
  return { exited: false, longestStill, seconds };
}

test("kurgu: sifirlama olmadan dusman yapisiz karede sonsuza kadar duruyor (eski hata)", () => {
  const { room, enemy } = simulatorFreezeLayout();
  // Iki katman da kapatiliyor: eski davranis birebir.
  room.forceEnemyReroute = () => {};
  const result = driveRealtime(room, enemy, 60);
  assert.equal(result.exited, false, "kurgu eski hatayi uretmiyor: dusman cikti");
  assert.ok(result.longestStill >= 30, `kurgu eski hatayi uretmiyor: en uzun durus ${result.longestStill.toFixed(1)} sn`);
  const cell = worldToGrid(enemy.x, enemy.y, room.activeMap);
  assert.deepEqual([cell.col, cell.row], [1, 9], "kurgu simulatordeki kareyi uretmiyor");
  assert.equal(enemy.structureTargetId, undefined, "kurgu: donan dusman bir yapiya saldiriyor");
});

test("kiracak yapi bulunamayinca gezgin arama kipine doner ve dusman gedigi bulur", () => {
  const { room, enemy } = simulatorFreezeLayout();
  // Yalnizca birinci katman: emniyet agi kapali, duzeltme kendi basina yetmeli.
  room.watchEnemyStall = () => {};
  const result = driveRealtime(room, enemy, 120);
  assert.equal(result.exited, true, `dusman cikisa varamadi (en uzun durus ${result.longestStill.toFixed(1)} sn)`);
  assert.ok(result.longestStill < 1, `dusman ${result.longestStill.toFixed(2)} sn durdu`);
  // Gedikten gecti, duvar kirmadi.
  for (const tower of room.towers.values()) assert.equal(tower.hp, tower.maxHp, `${tower.definition.id} hasar aldi`);
});

test("yalnizca emniyet agi da ayni donmayi cozer", () => {
  const { room, enemy } = simulatorFreezeLayout();
  // Birinci katman kapali (eski breakThrough), emniyet agi acik.
  const reroute = room.forceEnemyReroute.bind(room);
  let netResets = 0;
  room.breakThrough = function (target, start) {
    return { cells: [start], reachedBottom: false, targetTower: undefined, exitPoint: undefined };
  };
  room.forceEnemyReroute = (...args) => { netResets += 1; return reroute(...args); };
  const result = driveRealtime(room, enemy, 120);
  assert.equal(result.exited, true, "emniyet agi donan dusmani kurtaramadi");
  assert.ok(netResets >= 1, "emniyet agi devreye girmedi");
  assert.ok(result.longestStill < ENEMY_STALL_RESET_SECONDS + 0.5, `dusman ${result.longestStill.toFixed(1)} sn durdu`);
});

test("emniyet agi: kimildamayan dusmanin gezinmesi 6 oyun saniyesinde sifirlanir, zar cekilmez", () => {
  const room = clearBuildZones(createRoom("warrior"));
  room.broadcast = () => {};
  const enemy = enemyAt(room, 4, 3);
  // Bilinmeyen bir gezinme hatasi: gezgin "duvar" kipinde kaldikca yol yok.
  enemy.navigator = { mode: "wall", hand: "left", heading: 0, entryCol: 4, entryRow: 9, entryHeading: 0, seen: new Set() };
  const original = room.findEnemyRoute.bind(room);
  room.findEnemyRoute = (target) => target.navigator?.mode === "wall"
    ? { cells: [worldToGrid(target.x, target.y, room.activeMap)], reachedBottom: false, targetTower: undefined, exitPoint: undefined }
    : original(target);

  const random = Math.random;
  let draws = 0;
  Math.random = () => { draws += 1; return random(); };
  let resetAt;
  try {
    for (let tick = 1; tick <= 10 / TICK; tick += 1) {
      room.enemySpatialGrid.rebuild(room.enemies.values());
      room.updateEnemies(TICK);
      if (resetAt === undefined && enemy.navigator?.mode !== "wall") resetAt = tick * TICK;
    }
  } finally {
    Math.random = random;
  }
  assert.ok(resetAt !== undefined, "emniyet agi hic devreye girmedi");
  assert.ok(resetAt >= ENEMY_STALL_RESET_SECONDS - 0.05 && resetAt <= ENEMY_STALL_RESET_SECONDS + 0.1, `sifirlama ${resetAt.toFixed(2)}. sn'de`);
  assert.equal(draws, 0, "emniyet agi oda zarindan cekti");
  assert.ok(worldToGrid(enemy.x, enemy.y, room.activeMap).row > 3 || !room.enemies.has(enemy.id), "sifirlamadan sonra dusman yurumedi");
});

test("emniyet agi: yapiya saldiran dusmana dokunmaz", () => {
  const room = clearBuildZones(createRoom("warrior"));
  room.broadcast = () => {};
  unlockCapacity(room);
  // Kose: solda harita kenari, kalan uc yan kapali; dusman kirmak zorunda.
  const enemy = enemyAt(room, 0, 2);
  for (const cell of [{ col: 0, row: 1 }, { col: 1, row: 2 }, { col: 0, row: 3 }]) {
    const world = gridToWorld(cell.col, cell.row, room.activeMap);
    room.placeTower({ sessionId: "p1" }, { x: world.x, y: world.y, definitionId: "warrior-1" });
  }
  // Yapilar yikilmasin: saldiri bekleyisi uzun sursun.
  for (const tower of room.towers.values()) tower.hp = tower.maxHp = 1e9;
  let resets = 0;
  const original = room.forceEnemyReroute.bind(room);
  room.forceEnemyReroute = (...args) => { resets += 1; return original(...args); };
  for (let tick = 0; tick < 15 / TICK; tick += 1) {
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateEnemies(TICK);
  }
  assert.ok(enemy.structureTargetId, "kurgu: dusman yapiya saldirmiyor");
  assert.equal(resets, 0, "yapiya saldiran dusman zorla yeniden yonlendirildi");
});

test("emniyet agi: mesru bekleyis sureyi durdurur ama sifirlamaz", () => {
  const room = createRoom("warrior");
  const enemy = { x: 100, y: 100 };
  room.watchEnemyStall(enemy, TICK, false);
  let resets = 0;
  room.forceEnemyReroute = (target) => { resets += 1; target.stallSeconds = 0; };
  // Metal Kalkan / donma / sersemleme: 30 sn bekleyis, sifirlama yok.
  for (let tick = 0; tick < 30 / TICK; tick += 1) room.watchEnemyStall(enemy, TICK, true);
  assert.equal(resets, 0, "bekleyen dusman zorla yonlendirildi");
  // Bekleyis bitti, dusman hala kimildamiyor: sure kaldigi yerden.
  for (let tick = 0; tick < (ENEMY_STALL_RESET_SECONDS + 0.1) / TICK; tick += 1) room.watchEnemyStall(enemy, TICK, false);
  assert.equal(resets, 1, "bekleyisten sonra takili dusman yakalanmadi");
});

test("emniyet agi: yuruyen dusmanin suresi her ilerlemede sifirlanir", () => {
  const room = createRoom("warrior");
  const enemy = { x: 100, y: 100 };
  let resets = 0;
  room.forceEnemyReroute = () => { resets += 1; };
  for (let tick = 0; tick < 60 / TICK; tick += 1) {
    enemy.y += 1; // ~60 px/sn: yavas ama ilerliyor
    room.watchEnemyStall(enemy, TICK, false);
  }
  assert.equal(resets, 0, "ilerleyen dusman takili sayildi");
});
