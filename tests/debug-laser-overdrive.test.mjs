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
/* Vurus ritmi, 5. seviye kilidi ve 10. seviyenin ters donen kirisleri */
/* ------------------------------------------------------------------ */

/** Asiri yuklemenin gercek suresi: 2000 oyun ms'si / oyun hizi 0.8. */
const OVERDRIVE_REAL_MS = 2500;

/** 10. seviyede zincir kirisine eklenen iki kiris: `-b` saat yonunde, `-c` tersine. */
function spinBeamIds(tower) {
  return [`beam-${tower.id}-b`, `beam-${tower.id}-c`];
}

function angleOf(room, tower, id) {
  const beam = room.beams.get(id);
  return beam ? Math.atan2(beam.y2 - tower.y, beam.x2 - tower.x) : undefined;
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
    // 10. seviyede uc kiris birden: dusman atis basina yine bir kez.
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
        for (const id of spinBeamIds(tower)) assert.equal(room.beams.has(id), false, `${level}. seviyede ${id} var`);
      }
    });
  }
});

test("10. seviyede zincir kirişine ek olarak iki ters dönen kiriş", () => {
  withClock((advance) => {
    const start = (20 * Math.PI) / 180;
    const { room, tower, enemies } = overdriveScene([{ degrees: 20, distance: 60 }, { degrees: 40, distance: 200 }], { level: 10 });
    const [cw, ccw] = spinBeamIds(tower);

    // Dogus: uc kiris de zincirin dogdugu acida, ayni gorunuste.
    for (const id of [`beam-${tower.id}`, cw, ccw]) {
      assert.ok(Math.abs(shortestAngleDelta(start, angleOf(room, tower, id))) < 0.01, `${id} baslangicta degil`);
    }
    const main = room.beams.get(`beam-${tower.id}`);
    for (const id of [cw, ccw]) {
      const beam = room.beams.get(id);
      for (const field of ["definitionId", "overdrive", "width", "color", "tier", "x1", "y1", "ttlMs"]) {
        assert.equal(beam[field], main[field], `${id} kirisinin ${field} alani farkli`);
      }
    }

    // Ayni hizla ters yonlere; zincir kirisi kendi rotasinda kaliyor.
    runTicks(room, advance, 500);
    const turnCw = shortestAngleDelta(start, angleOf(room, tower, cw));
    const turnCcw = shortestAngleDelta(start, angleOf(room, tower, ccw));
    const expected = (500 / OVERDRIVE_REAL_MS) * Math.PI * 2;
    assert.ok(turnCw > 0 && turnCcw < 0, `kirisler ayni yone dondu: ${degrees(turnCw).toFixed(1)}, ${degrees(turnCcw).toFixed(1)}`);
    assert.ok(Math.abs(turnCw - expected) < 0.02, `saat yonundeki kiris ${degrees(turnCw).toFixed(1)} derece dondu`);
    assert.ok(Math.abs(turnCw + turnCcw) < 0.02, "ters donen kirisler ayni hizla donmuyor");
    const chainAngles = enemies.map((enemy) => Math.atan2(enemy.y - tower.y, enemy.x - tower.x));
    const chain = angleOf(room, tower, `beam-${tower.id}`);
    assert.ok(chain >= Math.min(...chainAngles) - 0.03 && chain <= Math.max(...chainAngles) + 0.03, "zincir kirisi rotasindan cikti");

    // Yarida baslangicin tam karsisinda kesisiyorlar.
    runTicks(room, advance, OVERDRIVE_REAL_MS / 2 - 500);
    assert.ok(Math.abs(shortestAngleDelta(angleOf(room, tower, cw), angleOf(room, tower, ccw))) < 0.03, "kirisler karsida kesismedi");
    assert.ok(Math.abs(Math.abs(shortestAngleDelta(start, angleOf(room, tower, cw))) - Math.PI) < 0.03);
  });
});

test("10. seviye: birden fazla kirişin altındaki düşman atış başına bir kez vurulur", () => {
  withClock((advance) => {
    // Biri baslangicta (uc kiris de ustunde doguyor, sonda bulusuyor), biri
    // tam karsida (yarida kesisme noktasi), biri yanda.
    const { room, tower, enemies } = overdriveScene([{ degrees: 0, distance: 70 }, { degrees: 180, distance: 90 }, { degrees: 90, distance: 120 }], { level: 10 });
    const hits = recordHits(room, tower, advance, OVERDRIVE_REAL_MS + 200);
    assertOneHitPerShot(hits);
    for (const enemy of enemies) {
      assert.ok(hits.some((hit) => hit.id === enemy.id), `${enemy.id} hic vurulmadi`);
    }
  });
});

test("10. seviye: ters dönen kirişler başlangıç açısını hem başta hem sonda vurur", () => {
  // Kor nokta: ilk vurus son kareden olculurse baslangic dilimi, asiri
  // yukleme bitisten once kesilirse son dilim hic taranmiyordu. Zincir
  // kirisi kapatiliyor ki olculen yalnizca ters donen kirisler olsun.
  withClock((advance) => {
    const { room, tower, enemies } = overdriveScene([{ degrees: 0, distance: 60 }, { degrees: 0, distance: 320 }], { level: 10 });
    room.collectDebugLaserChainHits = () => {};
    const startedAt = Date.now();
    const endsAt = tower.debugOverdriveUntil;
    // Ilk atis birkac kare sonra: arada cizilen kareler baslangic dilimini yutmasin.
    tower.cooldownMs = 3 * TICK_MS;
    const far = enemies[1];
    const hits = recordHits(room, tower, advance, OVERDRIVE_REAL_MS + 200).filter((hit) => hit.id === far.id);
    assert.ok(hits.some((hit) => hit.at <= startedAt + 4 * TICK_MS), `uzak dusman basta vurulmadi: ${hits.map((hit) => hit.at - startedAt).join(", ")}`);
    assert.ok(hits.some((hit) => hit.at >= endsAt), `uzak dusman sonda vurulmadi: ${hits.map((hit) => hit.at - startedAt).join(", ")}`);
    assertOneHitPerShot(hits);
  });
});

for (const level of [5, 10]) {
  test(`${level}. seviye: overdrive kirişleri havadaki düşmanı vurmaz`, () => {
    withClock((advance) => {
      const { room, tower, enemies } = overdriveScene([{ degrees: 0, distance: 60 }, { degrees: 0, distance: 120 }, { degrees: 180, distance: 90 }], { level });
      const air = [enemies[1], enemies[2]];
      for (const enemy of air) enemy.movementKind = "air";
      const before = air.map((enemy) => enemy.hp);
      const hits = recordHits(room, tower, advance, OVERDRIVE_REAL_MS + 200);
      assert.ok(hits.some((hit) => hit.id === enemies[0].id), "yerdeki dusman vurulmadi");
      air.forEach((enemy, index) => assert.equal(enemy.hp, before[index], `havadaki ${enemy.id} vuruldu`));
    });
  });
}

test("10. seviye: üç kiriş overdrive bitince, kule ateş edemeyince ve hararette kalkar", () => {
  withClock((advance) => {
    const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level: 10 });
    runTicks(room, advance, TICK_MS);
    for (const id of spinBeamIds(tower)) assert.ok(room.beams.has(id));
    while (tower.debugOverdriveUntil > Date.now()) runTicks(room, advance, TICK_MS);
    runTicks(room, advance, TICK_MS);
    for (const id of spinBeamIds(tower)) assert.equal(room.beams.has(id), false, `${id} bitiste kalmadi`);
    assert.notEqual(room.beams.get(`beam-${tower.id}`)?.overdrive, true, "zincir kirisi bitiste kaldi");
  });

  withClock((advance) => {
    const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level: 10 });
    for (const id of spinBeamIds(tower)) assert.ok(room.beams.has(id));
    tower.energy = 0;
    tower.cooldownMs = 0;
    runTicks(room, advance, TICK_MS);
    for (const id of [`beam-${tower.id}`, ...spinBeamIds(tower)]) assert.equal(room.beams.has(id), false, `${id} kalmadi mi`);
  });

  withClock(() => {
    const { room, tower } = overdriveScene([{ degrees: 0, distance: 60 }], { level: 10 });
    room.triggerDebugLaserOverheat(tower);
    for (const id of [`beam-${tower.id}`, ...spinBeamIds(tower)]) assert.equal(room.beams.has(id), false);
    assert.equal(tower.debugTwinStartAngle, undefined);
  });
});

/** Asiri yukleme boyunca dusmanlara inen toplam hasar ve vurulan dusman sayisi. */
function overdriveDamage(level, spots) {
  return withClock((advance) => {
    const { room, tower, enemies } = overdriveScene(spots, { level });
    room.towerDamageRandom = () => 0.5;
    const before = enemies.map((enemy) => enemy.hp);
    recordHits(room, tower, advance, OVERDRIVE_REAL_MS + 200);
    const dealt = enemies.map((enemy, index) => before[index] - enemy.hp);
    return { total: dealt.reduce((sum, value) => sum + value, 0), touched: dealt.filter((value) => value > 0).length };
  });
}

test("10. seviye gerçek bir yükseltme: tek hedefte en az 9. seviye kadar, kalabalıkta çok daha güçlü", () => {
  const single = [{ degrees: 0, distance: 60 }];
  assert.ok(overdriveDamage(10, single).total >= overdriveDamage(9, single).total, "tek hedefte 10. seviye 9'un altinda");
  const ring = Array.from({ length: 12 }, (_, index) => ({ degrees: index * 30, distance: 120 }));
  const nine = overdriveDamage(9, ring);
  const ten = overdriveDamage(10, ring);
  assert.equal(ten.touched, 12, "halkanin tamami taranmadi");
  assert.ok(ten.total >= nine.total * 2, `kalabalikta 10. seviye ${ten.total.toFixed(0)}, 9. seviye ${nine.total.toFixed(0)}`);
});
