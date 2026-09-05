/**
 * Debug Lazer'in asiri yuklemesi.
 *
 * Takipte isaretli bir hedefi oldurunce lazer iki saniyeligine haritanin
 * kenarina kadar uzanan bir kirise donusuyor. Kiris en yakin dusmana nisan
 * aliyor, oradan bir sonraki en yakina, oradan bir sonrakine donuyor ve
 * gectigi herkesi vuruyor. Kulenin normal menzilinin disina ciktigi tek an bu.
 *
 * Ugrak sirasi bir ara **yol mesafesinden** okunuyordu: olen hedefin yol
 * uzerindeki noktasindan arkadaki dusmanin noktasina donuluyordu. Dusmanlar
 * sabit yol izlemeyi birakip korlemesine yurumeye baslayinca o mesafenin kime
 * karsilik geldigi belirsizlesti ve kiris bosluga donmeye basladi.
 *
 * Iki tuzak var, ikisi de bu dosyanin bir kez ogrendigi seyler:
 *
 * 1. Supurmenin acisi duvar saatinden okunuyor, tikten degil. Testler saati
 *    kendileri ilerletmezse kiris hic donmez ve hicbir sey olcmus olmazlar.
 * 2. Donus acisal hizla sinirli (saniyede 30 derece), yani iki saniyede en
 *    fazla 60 derece. Zincirin ikinci halkasi bundan uzaga konursa kiris ona
 *    hic varamaz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const OVERDRIVE_MS = 2000;
const TICK_MS = 50;
/** Kirisin saniyede donebildigi aci; zincir bunu asamaz. */
const MAX_SWEEP_DEGREES_PER_SECOND = 30;

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

function beamAngle(room, tower) {
  const beam = room.beams.get(`beam-${tower.id}`);
  return beam ? Math.atan2(beam.y2 - tower.y, beam.x2 - tower.x) : undefined;
}

function degrees(radians) {
  return (radians * 180) / Math.PI;
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Kuleyi kurar ve verilen (aci, uzaklik) noktalarina birer dusman koyar.
 *
 * Konumlar dogrudan yaziliyor cunku olculen sey zincirin **geometrisi**: hangi
 * dusmana once nisan alindigi ve donusun hangi yone gittigi. Yol sekli bu
 * hesaba artik hic girmiyor.
 */
function overdriveScene(spots) {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-5");
  assert.ok(spot, "Debug Lazer icin yer bulunamadi");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-5" });

  const tower = [...room.towers.values()][0];
  assert.ok(tower, "Debug Lazer kurulamadi");
  tower.ammo = tower.maxAmmo;
  tower.energy = tower.maxEnergy;

  const enemies = spots.map(({ degrees: angleDegrees, distance }) => {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    const radians = (angleDegrees * Math.PI) / 180;
    enemy.x = tower.x + distance * Math.cos(radians);
    enemy.y = tower.y + distance * Math.sin(radians);
    // Olmesinler: olcunun konusu kirisin nereye baktigi, kimin oldugu degil.
    enemy.hp = 1_000_000;
    enemy.maxHp = enemy.hp;
    enemy.shield = 0;
    enemy.armor = 0;
    enemy.damageResistances = {};
    enemy.hitTypeResistances = {};
    enemy.statusResistances = {};
    return enemy;
  });

  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.startDebugLaserOverdrive(tower, { pathId: 0, pathDistance: 0 }, Date.now());
  return { room, tower, enemies };
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

test("kiriş önce en yakın düşmana nişan alır", () => {
  withClock((ilerlet) => {
    // En yakin olan 20 derecede; uzaktaki 0 derecede, yani sira mesafeye gore.
    const { room, tower } = overdriveScene([
      { degrees: 0, distance: 240 },
      { degrees: 20, distance: 60 }
    ]);

    runTicks(room, ilerlet, TICK_MS);

    const aci = beamAngle(room, tower);
    assert.ok(aci !== undefined, "kiris cizilmedi");
    assert.ok(
      Math.abs(degrees(shortestAngleDelta(aci, (20 * Math.PI) / 180))) < 3,
      `kiris en yakina bakmiyor: ${degrees(aci).toFixed(1)} derece`
    );
  });
});

test("kiriş sıradaki en yakına doğru döner", () => {
  withClock((ilerlet) => {
    const { room, tower } = overdriveScene([
      { degrees: 40, distance: 240 },
      { degrees: 0, distance: 60 }
    ]);

    const baslangic = (runTicks(room, ilerlet, TICK_MS), beamAngle(room, tower));
    runTicks(room, ilerlet, OVERDRIVE_MS - TICK_MS);
    const bitis = beamAngle(room, tower);

    const donus = degrees(shortestAngleDelta(baslangic, bitis));
    assert.ok(donus > 5, `kiris donmedi: ${donus.toFixed(1)} derece`);
    assert.ok(donus <= 40 + 1, `kiris ikinci hedefi asti: ${donus.toFixed(1)} derece`);
    // Iki saniyede en fazla 60 derece; 40 derecelik zincir tamamlanabilmeli.
    assert.ok(
      Math.abs(donus - 40) < 6,
      `kiris ikinci hedefe varmadi: ${donus.toFixed(1)} derece`
    );
  });
});

test("kiriş boşluğa değil düşmanlara döner", () => {
  // Asil sikayet buydu: kiris kimsenin olmadigi yone bakiyordu. Zincirin her
  // ugragi bir dusman oldugu icin bu artik tanim geregi mumkun degil.
  withClock((ilerlet) => {
    const { room, tower, enemies } = overdriveScene([
      { degrees: 10, distance: 70 },
      { degrees: 45, distance: 200 }
    ]);

    const gorulenAcilar = [];
    for (let elapsed = 0; elapsed < OVERDRIVE_MS; elapsed += TICK_MS) {
      runTicks(room, ilerlet, TICK_MS);
      const aci = beamAngle(room, tower);
      if (aci !== undefined) gorulenAcilar.push(degrees(aci));
    }

    const dusmanAcilari = enemies.map((enemy) => degrees(Math.atan2(enemy.y - tower.y, enemy.x - tower.x)));
    const enKucuk = Math.min(...dusmanAcilari) - 2;
    const enBuyuk = Math.max(...dusmanAcilari) + 2;

    assert.ok(gorulenAcilar.length > 0, "kiris hic cizilmedi");
    for (const aci of gorulenAcilar) {
      assert.ok(
        aci >= enKucuk && aci <= enBuyuk,
        `kiris dusmanlarin disina bakti: ${aci.toFixed(1)} derece (${enKucuk.toFixed(1)}..${enBuyuk.toFixed(1)})`
      );
    }
  });
});

test("aşırı yükleme kirişi geçtiği düşmana hasar verir", () => {
  withClock((ilerlet) => {
    const { room, enemies } = overdriveScene([
      { degrees: 0, distance: 70 },
      { degrees: 30, distance: 90 }
    ]);
    const oncekiCan = enemies.map((enemy) => enemy.hp);

    runTicks(room, ilerlet, OVERDRIVE_MS);

    assert.ok(
      enemies.some((enemy, index) => enemy.hp < oncekiCan[index]),
      "kiris hicbirine hasar vermedi"
    );
  });
});

test("aşırı yükleme kirişi kulenin normal menzilinin ötesini vurur", () => {
  // Ozelligin butun anlami bu: iki saniyeligine menzil haritanin kosegeni olur.
  withClock((ilerlet) => {
    const { room, tower, enemies } = overdriveScene([
      { degrees: 0, distance: 60 },
      { degrees: 25, distance: 260 }
    ]);
    const uzak = enemies[1];
    const uzaklik = Math.hypot(uzak.x - tower.x, uzak.y - tower.y);
    assert.ok(uzaklik > tower.definition.range, `dusman zaten menzil icinde (${uzaklik.toFixed(0)})`);

    const oncekiCan = uzak.hp;
    runTicks(room, ilerlet, OVERDRIVE_MS);

    assert.ok(uzak.hp < oncekiCan, `menzil disindaki dusman vurulmadi (${uzaklik.toFixed(0)} birim)`);
  });
});

test("aşırı yükleme bitince uzaktan vurma da biter", () => {
  withClock((ilerlet) => {
    const { room, tower, enemies } = overdriveScene([
      { degrees: 0, distance: 60 },
      { degrees: 25, distance: 260 }
    ]);
    runTicks(room, ilerlet, OVERDRIVE_MS * 2);
    assert.ok(tower.debugOverdriveUntil <= Date.now(), "asiri yukleme bitmedi");

    const bitisteki = enemies[1].hp;
    runTicks(room, ilerlet, 1000);

    assert.equal(enemies[1].hp, bitisteki, "asiri yukleme bittikten sonra da menzil disindan vuruyor");
  });
});

test("dönüş hızı sınırı korunuyor", () => {
  // Zincirin ikinci halkasi cok uzaktaysa kiris ona varamaz. Bu bir kusur
  // degil, kirisin taradigi yayin sinirli olmasinin sonucu -- test bunu
  // sabitliyor ki sinir sessizce kalkmasin.
  withClock((ilerlet) => {
    const { room, tower } = overdriveScene([
      { degrees: 170, distance: 240 },
      { degrees: 0, distance: 60 }
    ]);

    const baslangic = (runTicks(room, ilerlet, TICK_MS), beamAngle(room, tower));
    runTicks(room, ilerlet, OVERDRIVE_MS);
    const donus = Math.abs(degrees(shortestAngleDelta(baslangic, beamAngle(room, tower))));

    const tavan = (MAX_SWEEP_DEGREES_PER_SECOND * OVERDRIVE_MS) / 1000;
    assert.ok(donus <= tavan + 2, `kiris hiz sinirini asti: ${donus.toFixed(1)} > ${tavan}`);
  });
});
