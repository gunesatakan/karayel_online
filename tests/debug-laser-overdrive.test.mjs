/**
 * Debug Lazer'in asiri yuklemesi.
 *
 * Takipte isaretli bir hedefi oldurunce lazer iki saniyeligine haritanin
 * kenarina kadar uzanan bir kirise donusuyor, olen hedeften arkadaki dusmanlara
 * dogru donuyor ve gectigi her dusmani vuruyor. Kulenin normal menzilinin
 * disina ciktigi tek an bu.
 *
 * Buradaki testlerin isi kirisin **hasar verdigini** kanitlamak. Gorsel ile
 * hasar iki ayri yoldan gectigi icin biri sessizce dusebiliyor: kiris ciziliyor,
 * dusmanlar yurumeye devam ediyor ve ozellik yalnizca efekt olarak kaliyor.
 *
 * Iki tuzak var, ikisi de bu dosyanin bir kez ogrendigi seyler:
 *
 * 1. Supurmenin acisi duvar saatinden okunuyor, tikten degil. Testler saati
 *    kendileri ilerletmezse kiris hic donmez ve hicbir sey olcmus olmazlar.
 * 2. Donus acisal hizla sinirli, yani iki saniyede tam tur atmaz. Kurban,
 *    kirisin gercekten tarayacagi yayin icine konmali.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { getPointAlongRuntimePath } from "../packages/shared/dist/index.js";

const OVERDRIVE_MS = 2000;
const TICK_MS = 50;

/** Testin ilerletebildigi bir saatle calistirir. */
function withClock(run) {
  const gercekNow = Date.now;
  let simdi = gercekNow();
  Date.now = () => simdi;
  try {
    return run((ms) => {
      simdi += ms;
    });
  } finally {
    Date.now = gercekNow;
  }
}

/** Kuleye en yakin yol mesafesi. */
function closestPathDistance(path, x, y) {
  let best = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let distance = 0; distance < path.totalLength; distance += 2) {
    const point = getPointAlongRuntimePath(path, distance);
    const gap = Math.hypot(point.x - x, point.y - y);
    if (gap < bestGap) {
      bestGap = gap;
      best = distance;
    }
  }
  return best;
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Kurbani kirisin tarayacagi yayin ortasina, istenen uzakliga koyar.
 *
 * Yay, olen hedefin acisindan arkadaki en geri dusmanin acisina uzaniyor;
 * ikisi de yoldan okundugu icin kurbanin **yol mesafesi** yayi belirler,
 * **konumu** ise mesafeyi. Ikisini ayirmak, menzil iddiasini yol seklinden
 * bagimsiz olcmeyi saglar.
 */
function overdriveScene({ distanceFromTower }) {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-5");
  assert.ok(spot, "Debug Lazer icin yer bulunamadi");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-5" });

  const tower = [...room.towers.values()][0];
  assert.ok(tower, "Debug Lazer kurulamadi");
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;

  const path = room.activePaths[0];
  const closest = closestPathDistance(path, tower.x, tower.y);
  const targetDistance = closest + 120;
  const rearDistance = closest + 80;

  const angleTo = (pathDistance) => {
    const point = getPointAlongRuntimePath(path, pathDistance);
    return Math.atan2(point.y - tower.y, point.x - tower.x);
  };
  const sweepStart = angleTo(targetDistance);
  const sweepMiddle = sweepStart + shortestAngleDelta(sweepStart, angleTo(rearDistance)) / 2;

  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  enemy.pathId = 0;
  enemy.pathDistance = rearDistance;
  enemy.x = tower.x + distanceFromTower * Math.cos(sweepMiddle);
  enemy.y = tower.y + distanceFromTower * Math.sin(sweepMiddle);
  // Olmesin: olcunun konusu hasarin inip inmedigi, ne kadar indigi degil.
  enemy.hp = 100_000;
  enemy.maxHp = 100_000;
  enemy.shield = 0;
  enemy.armor = 0;
  enemy.damageResistances = {};
  enemy.hitTypeResistances = {};
  enemy.statusResistances = {};

  room.startDebugLaserOverdrive(tower, { pathId: 0, pathDistance: targetDistance }, Date.now());
  return { room, tower, enemy };
}

/** Kuleyi surer; dusmanlar yerinde kalir ki olcum yalnizca kirisi gostersin. */
function runTicks(room, ilerlet, durationMs) {
  for (let elapsed = 0; elapsed < durationMs; elapsed += TICK_MS) {
    ilerlet(TICK_MS);
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.resetAuraSlows();
    room.updateTowers(TICK_MS);
    room.updateBeams(TICK_MS);
  }
}

test("asiri yukleme kirisi gectigi dusmana hasar verir", () => {
  withClock((ilerlet) => {
    const { room, enemy } = overdriveScene({ distanceFromTower: 70 });
    const oncekiCan = enemy.hp;

    runTicks(room, ilerlet, OVERDRIVE_MS);

    assert.ok(enemy.hp < oncekiCan, `kiris hasar vermedi (can ${enemy.hp}/${oncekiCan})`);
  });
});

test("asiri yukleme kirisi kulenin normal menzilinin otesini vurur", () => {
  // Ozelligin butun anlami bu: iki saniyeligine menzil haritanin kosegeni olur.
  withClock((ilerlet) => {
    const { room, tower, enemy } = overdriveScene({ distanceFromTower: 260 });
    const uzaklik = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
    assert.ok(uzaklik > tower.definition.range, `dusman zaten menzil icinde (${uzaklik.toFixed(0)})`);

    const oncekiCan = enemy.hp;
    runTicks(room, ilerlet, OVERDRIVE_MS);

    assert.ok(enemy.hp < oncekiCan, `menzil disindaki dusman vurulmadi (${uzaklik.toFixed(0)} birim)`);
  });
});

test("asiri yukleme bitince uzaktan vurma da biter", () => {
  withClock((ilerlet) => {
    const { room, tower, enemy } = overdriveScene({ distanceFromTower: 260 });
    runTicks(room, ilerlet, OVERDRIVE_MS * 2);
    assert.ok(tower.debugOverdriveUntil <= Date.now(), "asiri yukleme bitmedi");

    const bitisteki = enemy.hp;
    runTicks(room, ilerlet, 1000);

    assert.equal(enemy.hp, bitisteki, "asiri yukleme bittikten sonra da menzil disindan vuruyor");
  });
});
