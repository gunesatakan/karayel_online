/**
 * Zeynep ultisi: sutun isik patlamasi.
 *
 * Ulti artik haritayi bastan silmiyor, bir sutun seciyor. Bu ucunu birden
 * sabitlemek gerekiyor: yalnizca secilen sutunun vurulmasi, gecersiz bir secimin
 * sarji yakmamasi, ve hasarin dusman caniyla ayni egriden buyumesi -- sabit
 * hasarli bir ulti dalga 3'te haritayi siler, dalga 20'de hicbir sey yapmaz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ZEYNEP_COLUMN_ULTIMATE_GRUNT_EQUIVALENT,
  getMapGridSize,
  getMapOrigin,
  getWaveEnemyMaxHp,
  getEnemyCombatDefinition
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/** Her sutuna bir dusman koyar; hangi sutunun vuruldugu boylece okunabilir. */
function fillColumns(room) {
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const enemies = [];
  for (let column = 0; column < room.activeMap.cols; column += 1) {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    enemy.x = origin.x + column * gridSize + gridSize / 2;
    enemy.y = origin.y + gridSize * 3;
    enemy.maxHp = 10_000_000;
    enemy.hp = enemy.maxHp;
    enemy.shield = 0;
    enemies.push({ column, enemy });
  }
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return enemies;
}

function readyUltimate(room) {
  const player = room.state.players.get("p1");
  player.ultimateCharge = 100;
  return player;
}

test("ulti yalnizca secilen sutundaki dusmanlari vurur", () => {
  const room = createRoom("zeynep");
  const enemies = fillColumns(room);
  readyUltimate(room);
  const hedef = 4;

  room.useUltimate(client, { column: hedef });

  for (const { column, enemy } of enemies) {
    if (column === hedef) {
      assert.ok(enemy.hp < enemy.maxHp, `sutun ${column} vurulmadi`);
    } else {
      assert.equal(enemy.hp, enemy.maxHp, `sutun ${column} vurulmamaliydi`);
    }
  }
});

test("ulti sutunun tum yuksekligini kapsar", () => {
  const room = createRoom("zeynep");
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const hedef = 2;
  const satirlar = [1, Math.floor(room.activeMap.rows / 2), room.activeMap.rows - 2];
  const enemies = [];

  for (const row of satirlar) {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    enemy.x = origin.x + hedef * gridSize + gridSize / 2;
    enemy.y = origin.y + row * gridSize + gridSize / 2;
    enemy.maxHp = 10_000_000;
    enemy.hp = enemy.maxHp;
    enemy.shield = 0;
    enemies.push({ row, enemy });
  }
  room.enemySpatialGrid.rebuild(room.enemies.values());
  readyUltimate(room);

  room.useUltimate(client, { column: hedef });

  for (const { row, enemy } of enemies) {
    assert.ok(enemy.hp < enemy.maxHp, `satir ${row} vurulmadi`);
  }
});

test("gecersiz sutun sarji yakmaz", () => {
  const room = createRoom("zeynep");
  fillColumns(room);

  for (const column of [undefined, -1, room.activeMap.cols, Number.NaN, "3"]) {
    const player = readyUltimate(room);
    room.useUltimate(client, { column });
    assert.equal(player.ultimateCharge, 100, `${String(column)} sarji yakti`);
  }
});

test("gecerli sutun sarji harcar", () => {
  const room = createRoom("zeynep");
  fillColumns(room);
  const player = readyUltimate(room);

  room.useUltimate(client, { column: 0 });

  assert.equal(player.ultimateCharge, 0);
});

test("sarj dolu degilse ulti calismaz", () => {
  const room = createRoom("zeynep");
  const enemies = fillColumns(room);
  const player = room.state.players.get("p1");
  player.ultimateCharge = 99;

  room.useUltimate(client, { column: 1 });

  assert.equal(player.ultimateCharge, 99);
  assert.equal(enemies[1].enemy.hp, enemies[1].enemy.maxHp);
});

test("hasar dusman caniyla ayni egriden buyur", () => {
  // Sabit hasar dalga 20'de anlamsizlasirdi: grunt cani orada dalga 3'tekinin
  // 40 katindan fazla.
  const olculen = [];
  for (const wave of [3, 10, 20]) {
    const room = createRoom("zeynep");
    room.wave = wave;
    const enemies = fillColumns(room);
    readyUltimate(room);
    room.useUltimate(client, { column: 6 });

    const hedef = enemies.find((entry) => entry.column === 6).enemy;
    const verilen = hedef.maxHp - hedef.hp;
    const gruntCani = getWaveEnemyMaxHp(getEnemyCombatDefinition("grunt").maxHp, wave, 1);
    olculen.push({ wave, verilen, gruntCani });

    // Zirh hasari biraz kirpar; olcu grunt caninin katina yakin durmali.
    const oran = verilen / gruntCani;
    assert.ok(
      oran > ZEYNEP_COLUMN_ULTIMATE_GRUNT_EQUIVALENT * 0.7,
      `dalga ${wave}: ulti grunt caninin ${oran.toFixed(2)} katini vurdu, beklenen ~${ZEYNEP_COLUMN_ULTIMATE_GRUNT_EQUIVALENT}`
    );
  }

  for (let index = 1; index < olculen.length; index += 1) {
    assert.ok(
      olculen[index].verilen > olculen[index - 1].verilen,
      `dalga ${olculen[index].wave} hasari onceki dalgadan buyuk degil`
    );
  }
});

test("patlama gorsel olarak sutunun uzerine oturur", () => {
  const room = createRoom("zeynep");
  fillColumns(room);
  readyUltimate(room);
  const gridSize = getMapGridSize(room.activeMap);
  const origin = getMapOrigin(room.activeMap);
  const hedef = 5;

  room.useUltimate(client, { column: hedef });

  const beam = [...room.beams.values()].find((entry) => entry.definitionId === "zeynep-ultimate-column");
  assert.ok(beam, "isik patlamasi olusmadi");
  assert.equal(beam.x1, origin.x + hedef * gridSize + gridSize / 2, "patlama sutunun ortasinda degil");
  assert.equal(beam.x1, beam.x2, "patlama dikey degil");
  assert.equal(beam.width, gridSize, "patlama sutun genisliginde degil");
  assert.ok(beam.y2 > beam.y1, "patlama haritayi bastan asagi kapsamiyor");
});
