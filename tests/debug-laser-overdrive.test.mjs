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
function overdriveScene(spots, { level = 5, overdrive = true } = {}) {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-5");
  assert.ok(spot, "Debug Lazer icin yer bulunamadi");
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId: "warrior-5" });

  const tower = [...room.towers.values()][0];
  assert.ok(tower, "Debug Lazer kurulamadi");
  // Asiri yukleme 5. seviyede aciliyor; testler varsayilan olarak oradan.
  tower.level = level;
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
  if (overdrive) room.startDebugLaserOverdrive(tower, { pathId: 0, pathDistance: 0 }, Date.now());
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

test("son işaretli düşmana son vuruş boş haritada kesintisiz lazer açar", () => {
  withClock((advance) => {
    const { room, tower, enemies } = overdriveScene([{ degrees: 0, distance: 60 }]);
    tower.debugOverdriveUntil = 0;
    const target = enemies[0];
    target.hp = 1;
    target.trackingStackUntil = [Date.now() + 5000];
    room.fireDebugLaser(tower, target);
    assert.equal(room.enemies.size, 0);
    assert.ok(tower.debugOverdriveUntil > Date.now());
    for (let i = 0; i < 30; i++) {
      runTicks(room, advance, TICK_MS);
      assert.equal(room.beams.get(`beam-${tower.id}`)?.overdrive, true);
    }
  });
});

for (const resource of ["energy"]) {
  test(`${resource} bittiğinde özel lazer hasar vermez ve kiriş kesilir`, () => {
    withClock((advance) => {
      const { room, tower, enemies } = overdriveScene([{ degrees: 0, distance: 60 }]);
      tower[resource] = 0;
      tower.cooldownMs = 0;
      const hp = enemies[0].hp;
      runTicks(room, advance, TICK_MS);
      assert.equal(enemies[0].hp, hp);
      assert.equal(room.beams.has(`beam-${tower.id}`), false);
    });
  });
}

for (const scenario of ["unmarked-kill", "marked-survivor", "expired-mark-kill", "other-tower-kill"]) {
  test(`özel mod açılmaz: ${scenario}`, () => {
    withClock(() => {
      const { room, tower, enemies } = overdriveScene([{ degrees: 0, distance: 60 }]);
      tower.debugOverdriveUntil = 0;
      const target = enemies[0];
      target.trackingStackUntil = scenario === "unmarked-kill" ? [] : [Date.now() + (scenario === "expired-mark-kill" ? -1 : 5000)];
      target.hp = scenario === "marked-survivor" ? 1_000_000 : 1;
      if (scenario === "other-tower-kill") {
        const spot = findBuildableSpot(room, "warrior-1");
        room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: "warrior-1" });
        const other = [...room.towers.values()].find((entry) => entry !== tower);
        room.damageEnemyFromTower(other, target, 1_000_000, 0);
      } else {
        room.fireDebugLaser(tower, target);
      }
      assert.equal(tower.debugOverdriveUntil, 0);
    });
  });
}

test("lazer son çeyrekte geri döner ve hedefler ölünce sönmez", () => {
  withClock((advance) => {
    const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }, { degrees: 60, distance: 240 }]);
    runTicks(room, advance, 1850);
    const outward = beamAngle(room, tower);
    room.enemies.clear();
    runTicks(room, advance, 500);
    assert.ok(beamAngle(room, tower) < outward - 0.05);
    assert.equal(room.beams.get(`beam-${tower.id}`)?.overdrive, true);
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

/**
 * Kare basina donus sinirinin gercek sinavi.
 *
 * Zincirin acilari canli okundugu icin ilk halka olunce hesap bir anda ikinci
 * halkadan baslar. Sinir yalnizca "sureye gore toplam yay" olarak konursa kiris
 * o farki tek karede kapatiyor ve ekranda isinlanmis gibi gorunuyordu -- toplam
 * yay hala tavanin altinda oldugu icin de kimse fark etmiyordu.
 *
 * Bu test aciyi her karede olcer: iki kare arasindaki fark, gecen sureye dusen
 * donus payini asamaz. Altinda kalabilir; ustune cikamaz.
 */
test("kiriş kare başına dönüş hızını aşamaz", () => {
  withClock((ilerlet) => {
    const { room, tower, enemies } = overdriveScene([
      { degrees: 0, distance: 60 },
      { degrees: 50, distance: 200 }
    ]);

    const paySn = (MAX_SWEEP_DEGREES_PER_SECOND * TICK_MS) / 1000;
    let oncekiAci = beamAngle(room, tower);
    let enBuyukSicrama = 0;

    for (let elapsed = 0; elapsed < OVERDRIVE_MS; elapsed += TICK_MS) {
      // Yarida zincirin **ilk** halkasini sahadan cikar: hesap ikinci halkadan
      // baslamak zorunda kalir, yani sicrama tam burada olusur.
      if (elapsed === TICK_MS * 6) {
        room.enemies.delete(enemies[0].id);
        room.enemySpatialGrid.rebuild(room.enemies.values());
      }

      runTicks(room, ilerlet, TICK_MS);
      const aci = beamAngle(room, tower);
      if (aci === undefined || oncekiAci === undefined) {
        oncekiAci = aci;
        continue;
      }

      const adim = Math.abs(degrees(shortestAngleDelta(oncekiAci, aci)));
      enBuyukSicrama = Math.max(enBuyukSicrama, adim);
      assert.ok(
        adim <= paySn + 0.5,
        `kiris bir karede ${adim.toFixed(1)} derece dondu, tavan ${paySn.toFixed(1)}`
      );
      oncekiAci = aci;
    }

    assert.ok(enBuyukSicrama > 0, "kiris hic donmedi, test bir sey olcmemis olur");
  });
});

/* ------------------------------------------------------------------ */
/* Vurus ritmi, 5. seviye kilidi ve 10. seviyenin supuren kirisleri    */
/* ------------------------------------------------------------------ */

/** Asiri yuklemenin gercek suresi: 2000 oyun ms'si / oyun hizi 0.8. */
const OVERDRIVE_REAL_MS = 2500;
/** 10. seviyede: 3000 oyun ms'si / oyun hizi 0.8. */
const TWIN_REAL_MS = 3750;

/** 10. seviyenin iki kirisi: `-b` sola, `-c` saga supuren. */
function sweepBeamIds(tower) {
  return [`beam-${tower.id}-b`, `beam-${tower.id}-c`];
}

function angleOf(room, tower, id) {
  const beam = room.beams.get(id);
  return beam ? Math.atan2(beam.y2 - tower.y, beam.x2 - tower.x) : undefined;
}

/** Kulenin `dy` kadar ustunde (ekranda yukarida) yatay bir dusman sirasi; `dx` ofsetleriyle. */
function rowSpots(offsets, dy = -120) {
  return offsets.map((dx) => ({ degrees: degrees(Math.atan2(dy, dx)), distance: Math.hypot(dx, dy) }));
}

/**
 * Kuleyi surer ve kulenin her vurusunu (zaman, dusman) olarak kaydeder.
 * Isi ve yakit her tikte tazeleniyor: olculen sey ritim, isi freni degil.
 */
function recordHits(room, tower, advance, durationMs) {
  const hits = [];
  room.damageEnemyFromTower = function (source, target, ...rest) {
    if (source === tower) hits.push({ at: Date.now(), id: target.id });
    return Object.getPrototypeOf(this).damageEnemyFromTower.call(this, source, target, ...rest);
  };
  try {
    for (let elapsed = 0; elapsed < durationMs; elapsed += TICK_MS) {
      advance(TICK_MS);
      tower.temperature = 0;
      tower.ammo = tower.maxAmmo;
      tower.energy = tower.maxEnergy;
      room.enemySpatialGrid.rebuild(room.enemies.values());
      room.resetAuraSlows();
      room.updateTowers(TICK_MS);
      room.updateBeams(TICK_MS);
    }
  } finally {
    delete room.damageEnemyFromTower;
  }
  return hits;
}

function meanGap(hits) {
  const gaps = hits.slice(1).map((hit, index) => hit.at - hits[index].at);
  return gaps.reduce((total, gap) => total + gap, 0) / Math.max(1, gaps.length);
}

function assertOneHitPerShot(hits) {
  const seen = new Set();
  for (const hit of hits) {
    const key = `${hit.at}:${hit.id}`;
    assert.ok(!seen.has(key), `${hit.id} ayni atista iki kez vuruldu`);
    seen.add(key);
  }
}

for (const level of [5, 10]) {
  test(`${level}. seviye: asiri yukleme altindaki dusmani normal lazer kadar sik vurur`, () => {
    // Sikayet buydu: kiris sabit 220 ms'de atiyordu, normal lazer seviyesinin
    // araligiyla (Izolasyon pasifiyle 100 ms'nin altinda) -- yarisindan az vurus.
    // 10. seviyede iki kiris birden: dusman atis basina yine bir kez.
    const normal = withClock((advance) => {
      const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level, overdrive: false });
      recordHits(room, tower, advance, 1000); // nisan alma
      return recordHits(room, tower, advance, 2000);
    });
    const overdrive = withClock((advance) => {
      const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level });
      return recordHits(room, tower, advance, 2000);
    });
    assert.ok(normal.length >= 10, `normal lazer olculemedi: ${normal.length} vurus`);
    assertOneHitPerShot(overdrive);
    assert.ok(overdrive.length >= normal.length - 1, `asiri yukleme ${overdrive.length} vurus, normal ${normal.length}`);
    assert.ok(meanGap(overdrive) <= meanGap(normal) + 0.5, `asiri yukleme araligi ${meanGap(overdrive).toFixed(1)} ms, normal ${meanGap(normal).toFixed(1)} ms`);
  });
}

for (const [level, opens] of [[1, false], [4, false], [5, true], [9, true], [10, true]]) {
  test(`işaretli öldürme ${level}. seviyede overdrive ${opens ? "açar" : "açmaz"}`, () => {
    withClock(() => {
      const { room, tower, enemies } = overdriveScene([{ degrees: 0, distance: 60 }], { level, overdrive: false });
      const target = enemies[0];
      target.hp = 1;
      target.trackingStackUntil = [Date.now() + 5000];
      room.fireDebugLaser(tower, target);
      assert.equal(room.enemies.has(target.id), false, "hedef olmedi");
      assert.equal(tower.debugOverdriveUntil > Date.now(), opens);
    });
  });
}

test("5-9. seviyede yalnızca zincir kirişi", () => {
  for (const level of [5, 9]) {
    withClock((advance) => {
      const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }, { degrees: 30, distance: 200 }], { level });
      for (let elapsed = 0; elapsed < 2000; elapsed += TICK_MS) {
        runTicks(room, advance, TICK_MS);
        assert.equal(room.beams.get(`beam-${tower.id}`)?.overdrive, true);
        for (const id of sweepBeamIds(tower)) assert.equal(room.beams.has(id), false, `${level}. seviyede ${id} var`);
      }
    });
  }
});

test("10. seviye: 3 saniye boyunca yalnızca iki süpüren ışın; zincir kirişi de normal lazer de susar", () => {
  withClock((advance) => {
    const { room, tower } = overdriveScene(rowSpots([-90, -45, 0, 45, 90]), { level: 10 });
    assert.equal(tower.debugOverdriveUntil - Date.now(), TWIN_REAL_MS);
    let ticks = 0;
    while (tower.debugOverdriveUntil > Date.now()) {
      // `beam-<kule>` hem zincir kirisi hem normal lazerin kirisi: ikisi de yok.
      assert.equal(room.beams.has(`beam-${tower.id}`), false, `${ticks * TICK_MS} ms: zincir ya da normal kiris acik`);
      for (const id of sweepBeamIds(tower)) assert.equal(room.beams.get(id)?.overdrive, true, `${ticks * TICK_MS} ms: ${id} yok`);
      recordHits(room, tower, advance, TICK_MS);
      ticks += 1;
    }
    assert.ok(ticks * TICK_MS >= TWIN_REAL_MS - TICK_MS, `asiri yukleme ${ticks * TICK_MS} ms surdu`);
  });
});

test("10. seviye: iki ışın ortadaki düşmandan başlar, biri sola diğeri sağa süpürür, sonda ortada buluşur", () => {
  withClock((advance) => {
    // Soldan saga: -90, -45, 0, 45, 90. Ortadaki x = 0'daki.
    const { room, tower, enemies } = overdriveScene(rowSpots([45, -90, 0, 90, -45]), { level: 10 });
    const angleTo = (enemy) => Math.atan2(enemy.y - tower.y, enemy.x - tower.x);
    const middle = angleTo(enemies[2]);
    const [left, right] = sweepBeamIds(tower);
    for (const id of [left, right]) {
      assert.ok(Math.abs(shortestAngleDelta(middle, angleOf(room, tower, id))) < 0.01, `${id} ortadaki dusmanda dogmadi`);
    }

    recordHits(room, tower, advance, 600);
    // Ekranda sol: x kuculuyor. Kiris ucunun x'i ortadakinden solda/sagda.
    const middleX = enemies[2].x;
    const xAtRow = (id) => {
      const beam = room.beams.get(id);
      const t = (enemies[2].y - tower.y) / (beam.y2 - tower.y);
      return tower.x + (beam.x2 - tower.x) * t;
    };
    assert.ok(xAtRow(left) < middleX - 10, `sol kiris sola gitmedi: ${(xAtRow(left) - middleX).toFixed(1)}`);
    assert.ok(xAtRow(right) > middleX + 10, `sag kiris saga gitmedi: ${(xAtRow(right) - middleX).toFixed(1)}`);

    // Son karede ikisi de ortaya donmus.
    while (tower.debugOverdriveUntil - Date.now() > TICK_MS) recordHits(room, tower, advance, TICK_MS);
    for (const id of [left, right]) {
      const delta = degrees(shortestAngleDelta(middle, angleOf(room, tower, id)));
      assert.ok(Math.abs(delta) < 2, `${id} ortaya donmedi: ${delta.toFixed(1)} derece`);
    }
  });
});

test("10. seviye: ileri en fazla 1,5 saniye; erken varan ışın kalan sürede döner, ışınlar düşmanda beklemez", () => {
  withClock((advance) => {
    // Ortadaki dusman tam yukarida (-90). Solda kisa bir rota (10 derece),
    // sagda uzun bir rota (90 derece): sag kiris yarida bile ucuna varamaz.
    const { room, tower } = overdriveScene([
      { degrees: -100, distance: 150 },
      { degrees: -95, distance: 150 },
      { degrees: -90, distance: 150 },
      { degrees: -45, distance: 150 },
      { degrees: 0, distance: 150 }
    ], { level: 10 });
    const startedAt = Date.now();
    const half = TWIN_REAL_MS / 2;
    const [left, right] = sweepBeamIds(tower);
    const samples = [];
    while (tower.debugOverdriveUntil > Date.now()) {
      samples.push({
        at: Date.now() - startedAt,
        left: degrees(shortestAngleDelta(-Math.PI / 2, angleOf(room, tower, left))),
        right: degrees(shortestAngleDelta(-Math.PI / 2, angleOf(room, tower, right)))
      });
      recordHits(room, tower, advance, TICK_MS);
    }

    // Sol: 10 dereceyi 30 derece/sn ile ~333 ms'de bitirir, kalan ~3417 ms'de doner.
    const leftmost = samples.reduce((best, sample) => (sample.left < best.left ? sample : best));
    assert.ok(Math.abs(leftmost.left + 10) < 0.6, `sol kiris soldaki son dusmana varmadi: ${leftmost.left.toFixed(1)}`);
    assert.ok(Math.abs(leftmost.at - 333) <= TICK_MS, `sol kiris ${leftmost.at} ms'de dondu, ~333 bekleniyordu`);
    const leftAtHalf = samples.find((sample) => sample.at >= half);
    const expectedLeftAtHalf = -10 * (1 - (leftAtHalf.at - 1000 / 3) / (TWIN_REAL_MS - 1000 / 3));
    assert.ok(Math.abs(leftAtHalf.left - expectedLeftAtHalf) < 0.6, `sol kiris yarida ${leftAtHalf.left.toFixed(1)}, ${expectedLeftAtHalf.toFixed(1)} bekleniyordu (yavas donus)`);

    // Sag: yarida (1875 ms) 56.25 derecede doner, kalan 1875 ms'de ortaya iner.
    const rightmost = samples.reduce((best, sample) => (sample.right > best.right ? sample : best));
    assert.ok(Math.abs(rightmost.right - 56.25) < 1.6, `sag kiris ${rightmost.right.toFixed(1)} dereceye kadar gitti`);
    assert.ok(Math.abs(rightmost.at - half) <= TICK_MS, `sag kiris ${rightmost.at} ms'de dondu, yarida (${half}) bekleniyordu`);

    // Dusmanda beklemiyor: ileri giderken her karede ayni adim, -45'teki dusmanin uzerinden gecerken de.
    const outward = samples.filter((sample) => sample.at > 0 && sample.at <= half - TICK_MS);
    outward.slice(1).forEach((sample, index) => {
      const step = sample.right - outward[index].right;
      assert.ok(step > 1.3 && step < 1.7, `${sample.at} ms: sag kiris ${step.toFixed(2)} derece ilerledi (30 derece/sn bekleniyordu)`);
    });

    const last = samples.at(-1);
    assert.ok(Math.abs(last.left) < 1 && Math.abs(last.right) < 2.5, `sonda ortada degil: sol ${last.left.toFixed(1)}, sag ${last.right.toFixed(1)}`);
  });
});

test("10. seviye: geçtiği düşmanları vurur; iki ışının altındaki düşman atış başına bir kez", () => {
  withClock((advance) => {
    const { room, tower, enemies } = overdriveScene(rowSpots([-120, -80, -40, 0, 40, 80, 120]), { level: 10 });
    const hits = recordHits(room, tower, advance, TWIN_REAL_MS);
    assertOneHitPerShot(hits);
    for (const enemy of enemies) {
      assert.ok(hits.some((hit) => hit.id === enemy.id), `${enemy.id} hic vurulmadi`);
    }
    // Ortadaki dusman: iki kiris de ustunde doguyor ve sonda ustunde bulusuyor.
    const middle = enemies[3];
    const middleHits = hits.filter((hit) => hit.id === middle.id).map((hit) => hit.at);
    assert.ok(middleHits.length >= 2, "ortadaki dusman basta ve sonda vurulmadi");
  });
});

for (const level of [5, 10]) {
  test(`${level}. seviye: overdrive kirişleri havadaki düşmanı vurmaz`, () => {
    withClock((advance) => {
      const { room, tower, enemies } = overdriveScene([{ degrees: 0, distance: 60 }, { degrees: 0, distance: 120 }, { degrees: 180, distance: 90 }], { level });
      const air = [enemies[1], enemies[2]];
      for (const enemy of air) enemy.movementKind = "air";
      const before = air.map((enemy) => enemy.hp);
      const hits = recordHits(room, tower, advance, (level >= 10 ? TWIN_REAL_MS : OVERDRIVE_REAL_MS) + 200);
      assert.ok(hits.some((hit) => hit.id === enemies[0].id), "yerdeki dusman vurulmadi");
      air.forEach((enemy, index) => assert.equal(enemy.hp, before[index], `havadaki ${enemy.id} vuruldu`));
    });
  });
}

test("10. seviye: ışınlar bitişte kalkar, namlu buluştukları yerden devam eder ve normal lazer döner; ateş edemeyince ve hararette kalkarlar", () => {
  withClock((advance) => {
    const { room, tower } = overdriveScene(rowSpots([-60, 0, 60]), { level: 10 });
    const main = `beam-${tower.id}`;
    recordHits(room, tower, advance, TICK_MS);
    for (const id of sweepBeamIds(tower)) assert.ok(room.beams.has(id));
    while (tower.debugOverdriveUntil > Date.now()) recordHits(room, tower, advance, TICK_MS);
    const sweepAngle = tower.debugSweepAngle;
    recordHits(room, tower, advance, TICK_MS);
    for (const id of sweepBeamIds(tower)) assert.equal(room.beams.has(id), false, `${id} bitiste kalmadi`);
    // Namlu iki kirisin bulustugu yerden, ortadaki dusmandan devam ediyor.
    assert.ok(Math.abs(shortestAngleDelta(-Math.PI / 2, sweepAngle)) < 0.05, `bulusma ${degrees(sweepAngle).toFixed(1)} derecede`);
    assert.ok(Math.abs(shortestAngleDelta(sweepAngle, tower.facing)) < 0.2, `namlu ${degrees(tower.facing).toFixed(1)} derecede, kiris ${degrees(sweepAngle).toFixed(1)}`);
    let normal = false;
    for (let elapsed = 0; elapsed < 600 && !normal; elapsed += TICK_MS) {
      normal = room.beams.get(main)?.overdrive === false;
      if (!normal) recordHits(room, tower, advance, TICK_MS);
    }
    assert.ok(normal, "normal lazer geri donmedi");
  });

  withClock((advance) => {
    const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level: 10 });
    for (const id of sweepBeamIds(tower)) assert.ok(room.beams.has(id));
    tower.energy = 0;
    tower.cooldownMs = 0;
    runTicks(room, advance, TICK_MS);
    for (const id of [`beam-${tower.id}`, ...sweepBeamIds(tower)]) assert.equal(room.beams.has(id), false, `${id} kalmadi mi`);
  });

  withClock(() => {
    const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level: 10 });
    room.triggerDebugLaserOverheat(tower);
    for (const id of [`beam-${tower.id}`, ...sweepBeamIds(tower)]) assert.equal(room.beams.has(id), false);
    assert.equal(tower.debugTwinSweep, undefined);
  });
});

test("asiri yuklemede satilan Debug Lazer'in kirisleri hemen kalkar", () => {
  withClock((advance) => {
    const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level: 10 });
    room.broadcast = () => {};
    recordHits(room, tower, advance, TICK_MS);
    for (const id of sweepBeamIds(tower)) assert.ok(room.beams.has(id));
    room.sellTower({ sessionId: "p1" }, { towerId: tower.id });
    assert.equal(room.towers.has(tower.id), false, "kule satilmadi");
    for (const id of [`beam-${tower.id}`, ...sweepBeamIds(tower)]) assert.equal(room.beams.has(id), false, `${id} satistan sonra kaldi`);
  });
});

/** Kapanis vurusunu izler: `damageDebugLaserSweepHits` cagrilari, bitisten sonra yapilanlar ayri. */
function watchClosingPass(room, tower) {
  const proto = Object.getPrototypeOf(room);
  const log = { sweepDamage: [] };
  let inSweep = false;
  room.damageDebugLaserSweepHits = function (source, hit) {
    inSweep = true;
    try {
      return proto.damageDebugLaserSweepHits.call(this, source, hit);
    } finally {
      inSweep = false;
    }
  };
  const originalDamage = room.damageEnemyFromTower.bind(room);
  room.damageEnemyFromTower = (source, target, damage, ...rest) => {
    if (inSweep && source === tower) log.sweepDamage.push({ at: Date.now(), afterEnd: tower.debugOverdriveUntil <= Date.now(), id: target.id, damage });
    return originalDamage(source, target, damage, ...rest);
  };
  return log;
}

for (const level of [5, 9]) {
  test(`${level}. seviyede kapanis vurusu yok: bitisten sonra ritim disi vurus olmuyor`, () => {
    withClock((advance) => {
      const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level });
      const log = watchClosingPass(room, tower);
      runTicks(room, advance, OVERDRIVE_REAL_MS + 4 * TICK_MS);
      assert.ok(log.sweepDamage.length > 0, "asiri yukleme hic vurmadi");
      assert.deepEqual(log.sweepDamage.filter((hit) => hit.afterEnd), [], "5-9. seviyede kapanis vurusu oldu");
    });
  });
}

test("10. seviye kapanis vurusu: ışınların son yayı, asiri yukleme carpaniyla", () => {
  withClock((advance) => {
    const { room, tower } = overdriveScene(rowSpots([-60, 0, 60]), { level: 10 });
    const log = watchClosingPass(room, tower);
    for (let elapsed = 0; elapsed < TWIN_REAL_MS + 4 * TICK_MS; elapsed += TICK_MS) {
      Object.assign(tower, { temperature: 0, ammo: tower.maxAmmo, energy: tower.maxEnergy });
      runTicks(room, advance, TICK_MS);
    }
    const closing = log.sweepDamage.filter((hit) => hit.afterEnd);
    assert.ok(closing.length > 0, "kapanis vurusu olmadi");
    const overdriveDamage = room.getTowerDamage(tower, true);
    const normalDamage = room.getTowerDamage(tower);
    assert.ok(overdriveDamage > normalDamage, "carpanlar ayni, test bir sey olcmez");
    for (const hit of closing) assert.ok(Math.abs(hit.damage - overdriveDamage) < 1e-6, `kapanis ${hit.damage} vurdu, asiri yukleme ${overdriveDamage}`);
  });
});

test("10. seviye kapanis vurusunun oldurmeleri \"Tarama\" sayisina girer", () => {
  withClock((advance) => {
    const { room, tower } = overdriveScene([{ degrees: 90, distance: 60 }], { level: 10 });
    const stamps = [];
    room.sendComboStamp = (kind, source, options = {}) => {
      stamps.push({ kind, towerId: source.id, kills: options.kills });
      return true;
    };
    room.debugSweepRuns.set(tower.id, { ownerId: tower.ownerId, kills: 0 });
    // Bitise bir kare kalana kadar sur.
    while (tower.debugOverdriveUntil - Date.now() > TICK_MS) recordHits(room, tower, advance, TICK_MS);
    // Bitisi gecen karede, kirislerin bulustugu acida iki zayif dusman:
    // yalnizca kapanis vurusu onlari gorebilir.
    advance(tower.debugOverdriveUntil - Date.now() + 1);
    const meeting = tower.debugSweepAngle;
    for (const distance of [150, 250]) {
      room.spawnEnemy();
      const enemy = [...room.enemies.values()].at(-1);
      Object.assign(enemy, { x: tower.x + distance * Math.cos(meeting), y: tower.y + distance * Math.sin(meeting), hp: 1, maxHp: 1, shield: 0, armor: 0 });
    }
    tower.temperature = 0;
    tower.ammo = tower.maxAmmo;
    tower.energy = tower.maxEnergy;
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateTowers(1);
    const sweep = stamps.filter((stamp) => stamp.kind === "sweepKills");
    assert.equal(sweep.length, 1, "tarama damgasi yok");
    assert.equal(sweep[0].kills, 2, "kapanisin oldurmeleri sayilmadi");
    assert.equal(room.debugSweepRuns.has(tower.id), false, "kayit kapanmadi");
  });
});

/** Asiri yukleme boyunca dusmanlara inen toplam hasar ve vurulan dusman sayisi. */
function overdriveDamage(level, spots) {
  return withClock((advance) => {
    const { room, tower, enemies } = overdriveScene(spots, { level });
    room.towerDamageRandom = () => 0.5;
    const before = enemies.map((enemy) => enemy.hp);
    recordHits(room, tower, advance, (level >= 10 ? TWIN_REAL_MS : OVERDRIVE_REAL_MS) + 200);
    const dealt = enemies.map((enemy, index) => before[index] - enemy.hp);
    return { total: dealt.reduce((sum, value) => sum + value, 0), touched: dealt.filter((value) => value > 0).length };
  });
}

test("10. seviye gerçek bir yükseltme: tek hedefte en az 9. seviye kadar, yana yayılmış kalabalıkta çok daha güçlü", () => {
  const single = [{ degrees: 0, distance: 60 }];
  assert.ok(overdriveDamage(10, single).total >= overdriveDamage(9, single).total, "tek hedefte 10. seviye 9'un altinda");
  const row = rowSpots([-160, -120, -80, -40, 0, 40, 80, 120, 160]);
  const nine = overdriveDamage(9, row);
  const ten = overdriveDamage(10, row);
  assert.equal(ten.touched, 9, "siranin tamami taranmadi");
  assert.ok(ten.touched > nine.touched, `10. seviye ${ten.touched}, 9. seviye ${nine.touched} dusmana degdi`);
  assert.ok(ten.total >= nine.total * 1.5, `kalabalikta 10. seviye ${ten.total.toFixed(0)}, 9. seviye ${nine.total.toFixed(0)}`);
});
