/**
 * Irk mekanikleri (races/race-mechanics): golem Taslasma, meka kalkan
 * atici, uzay bocegi kazici, dusmus ruh cekici, 4. boyut faz ve katlanma.
 *
 * Paylasilan kurallar dogrudan, sunucu davranisi gercek odadan
 * (MatchRoom, headless). Zaman sahte duvar saatiyle suruluyor; sureler oyun
 * suresi oldugu icin `oyun(ms)` ile duvar saatine cevriliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ATAKAN_SHIELD_SLOT,
  BUG_BURROWER,
  FALLEN_SOUL_DRAWER,
  FOURTH_FOLD_JUMP,
  FOURTH_PHASE_SHIFT,
  GAME_SPEED_MULTIPLIER,
  GOLEM_PETRIFY,
  MEKA_SHIELD_THROWER,
  RACE_TRAIT_CODES,
  calculateArmorDamageMultiplier,
  countsAsGolemPetrifyHit,
  decodeRaceTrait,
  findNearestFreeCell,
  getBurrowEmergenceBounds,
  getBurrowTelegraphStart,
  getMapGridSize,
  getMekaShieldGeometry,
  getSegmentCrossingT,
  getSoulDrawerMultipliers,
  gridToWorld,
  hashRaceTraitSeed,
  pickBurrowEmergence,
  pickFoldDestination,
  rollRaceTrait,
  worldToGrid
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const oyun = (ms) => ms / GAME_SPEED_MULTIPLIER;

function makeClient() {
  return { sessionId: "p1", sent: [], send(type, payload) { this.sent.push({ type, payload }); } };
}

/** Acik 12x18 arena, istenen asama. Yayinlar `room.sent`e yaziliyor. */
function oda(stage) {
  const room = createRoom("warrior");
  const client = makeClient();
  const sent = [];
  room.broadcast = (type, payload) => sent.push({ type, payload });
  room.clients = [client];
  room.mapScale = 1;
  room.configureArenaForScale();
  // Kurulum yasak bolgeleri (rastgele) bu testlerin konusu degil.
  room.buildZones = undefined;
  room.stage = stage;
  room.wave = 8;
  room.sent = sent;
  room.client = client;
  return room;
}

function sahteSaat(fn) {
  const gercek = Date.now;
  const saat = { now: 1_800_000_000_000 };
  Date.now = () => saat.now;
  try {
    return fn(saat);
  } finally {
    Date.now = gercek;
  }
}

function kur(room, definitionId, col, row) {
  const point = gridToWorld(col, row, room.activeMap);
  const before = room.towers.size;
  room.placeTower(room.client, { x: point.x, y: point.y, definitionId });
  assert.equal(room.towers.size, before + 1, `${definitionId} (${col},${row}) kurulamadi`);
  return [...room.towers.values()].at(-1);
}

/** Hucre ortasinda bir yer dusmani; ozellik yok (asamanin irkinda). */
function dusman(room, col, row, extra = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  const point = gridToWorld(col, row, room.activeMap);
  Object.assign(enemy, {
    type: "grunt", movementKind: "ground", x: point.x, y: point.y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0,
    navigator: undefined, navigatorStep: undefined, structureTargetId: undefined, special: undefined, champion: undefined,
    attackRange: 0, towerAttackCooldownMs: 0, attack: 0, speed: 0, abilities: [], raceTrait: undefined, untargetable: undefined
  }, extra);
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return enemy;
}

/**
 * Dusmana istenen ozelligi verir: zar belirlenimli oldugu icin o ozelligi
 * veren bir sira numarasi araniyor ve durum dusmana tasiniyor (taban can ve
 * hiz dusmaninkine, dogum ani simdiye).
 */
function ozellikVer(room, enemy, trait) {
  for (let serial = 1; serial < 5000; serial += 1) {
    const dummy = { id: `e${serial}`, race: enemy.race, movementKind: "ground", maxHp: enemy.maxHp, speed: enemy.speed };
    room.assignRaceTrait(dummy, false, false);
    if (dummy.raceTrait?.trait === trait) {
      enemy.raceTrait = { ...dummy.raceTrait, baseMaxHp: enemy.maxHp, baseSpeed: enemy.speed };
      return enemy.raceTrait;
    }
  }
  throw new Error(`${trait} veren sira bulunamadi`);
}

function hucre(room, enemy) {
  return worldToGrid(enemy.x, enemy.y, room.activeMap);
}

function sur(room, saat, ms, kosul = () => false, step = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    saat.now += step;
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateEnemies(step / 1000 * GAME_SPEED_MULTIPLIER);
    if (kosul()) return true;
  }
  return false;
}

/** Zarin payi: `count` tohum, belirli irk. */
function pay(race, trait, opts = {}) {
  let hits = 0;
  const count = 20000;
  for (let serial = 1; serial <= count; serial += 1) {
    if (rollRaceTrait(race, { seed: hashRaceTraitSeed(1337, serial), ...opts }) === trait) hits += 1;
  }
  return hits / count;
}

// --- Dagitim ----------------------------------------------------------------------

test("dağıtım: paylar tablodaki gibi; şampiyon ve özel düşman almıyor; uçan kalkan atıcı/kazıcı/katlanan olmuyor", () => {
  assert.ok(Math.abs(pay("meka", "thrower") - MEKA_SHIELD_THROWER.share) < 0.015);
  assert.ok(Math.abs(pay("spaceBug", "burrower") - BUG_BURROWER.share) < 0.015);
  assert.ok(Math.abs(pay("fallen", "drawer") - FALLEN_SOUL_DRAWER.share) < 0.015);
  assert.ok(Math.abs(pay("fourthDimensional", "phaser") - FOURTH_PHASE_SHIFT.share) < 0.015);
  assert.ok(Math.abs(pay("fourthDimensional", "folder") - FOURTH_FOLD_JUMP.share) < 0.015);
  for (const race of ["meka", "spaceBug", "fallen", "fourthDimensional", "golem"]) {
    assert.equal(pay(race, undefined, { champion: true }) , 1, `${race} sampiyon ozellik aldi`);
    assert.equal(pay(race, undefined, { special: true }), 1, `${race} ozel dusman ozellik aldi`);
  }
  assert.equal(pay("meka", "thrower", { air: true }), 0);
  assert.equal(pay("spaceBug", "burrower", { air: true }), 0);
  assert.equal(pay("fourthDimensional", "folder", { air: true }), 0);
  // Tel kodu gidip geliyor; bilinmeyen kod yok sayiliyor.
  for (const [trait, code] of Object.entries(RACE_TRAIT_CODES)) assert.equal(decodeRaceTrait(code), trait);
  assert.equal(decodeRaceTrait(99), undefined);
  assert.equal(decodeRaceTrait("x"), undefined);
});

test("dağıtım: sunucuda belirlenimli ve oda zarını (Math.random) tüketmiyor", () => {
  const izler = [];
  for (let run = 0; run < 2; run += 1) {
    const room = oda(5);
    room.wavePatternSeed = 4242;
    const iz = [];
    for (let index = 0; index < 60; index += 1) {
      room.spawnEnemy();
      const enemy = [...room.enemies.values()].at(-1);
      iz.push(`${enemy.id}:${enemy.movementKind}:${enemy.raceTrait?.trait ?? "-"}`);
    }
    izler.push(iz.join(","));
  }
  assert.equal(izler[0], izler[1]);
  assert.match(izler[0], /phaser/);
  assert.match(izler[0], /folder/);

  const room = oda(2);
  const enemy = dusman(room, 5, 5);
  const gercek = Math.random;
  let cekilen = 0;
  Math.random = () => { cekilen += 1; return gercek(); };
  try {
    for (let index = 0; index < 50; index += 1) room.assignRaceTrait({ ...enemy, id: `e${index + 100}`, raceTrait: undefined }, false, false);
  } finally {
    Math.random = gercek;
  }
  assert.equal(cekilen, 0, "ozellik zari Math.random cekti");
});

// --- Golem: Taslasma ----------------------------------------------------------------

test("golem: her doğrudan vuruş +1 zırh, durum tiki ve yanan zemin saymıyor; tavan +200", () => {
  const room = oda(1);
  const golem = dusman(room, 5, 5);
  assert.equal(golem.race, "golem");
  assert.equal(golem.golemStacks, 0);
  for (let index = 0; index < 5; index += 1) room.damageEnemy(golem, 10, 0, "warrior-1", "p1", "physical");
  assert.equal(golem.golemStacks, 5);
  assert.equal(golem.armor, 5);
  room.damageEnemy(golem, 10, 0, "status:burn", "p1", "fire");
  room.damageEnemy(golem, 10, 0, "status:bleed", "p1", "physical");
  room.damageEnemy(golem, 10, 0, "zeynep-3-burn", "p1", "fire");
  assert.equal(golem.golemStacks, 5, "DoT tiki yigin verdi");
  assert.equal(countsAsGolemPetrifyHit("status:poison"), false);
  assert.equal(countsAsGolemPetrifyHit("atakan-execute"), true);
  golem.golemStacks = GOLEM_PETRIFY.maxStacks - 1;
  room.damageEnemy(golem, 10, 0, "warrior-1", "p1", "physical");
  room.damageEnemy(golem, 10, 0, "warrior-1", "p1", "physical");
  assert.equal(golem.golemStacks, GOLEM_PETRIFY.maxStacks);
  assert.equal(golem.armor, 5 + 1, "tavandan sonra zirh artti");
  // Sampiyon golem de tasiyor.
  room.spawnEnemy({ type: "brute", hpMultiple: 4, replaced: 3, gold: 30, exp: 30, leakDamage: 6, reputation: 3 });
  const sampiyon = [...room.enemies.values()].at(-1);
  assert.ok(sampiyon.champion);
  assert.equal(sampiyon.golemStacks, 0);
  // Tel: yigin `ga`, zirh `armor`.
  const wire = room.getSnapshot().enemies.find((entry) => entry.id === golem.id);
  assert.equal(wire.ga, GOLEM_PETRIFY.maxStacks);
  assert.equal(wire.rt, undefined);
});

test("golem: hasar zırhla düşüyor; eşit DPS'te çok sık vuran kule az ve ağır vurandan çok daha az hasar veriyor", () => {
  const room = oda(1);
  const ilk = dusman(room, 5, 5);
  const before = ilk.hp;
  room.damageEnemy(ilk, 100, 0, "warrior-1", "p1", "true");
  // Gercek hasar zirhi deliyor ama yine yigin veriyor.
  assert.equal(before - ilk.hp, 100);
  assert.equal(ilk.golemStacks, 1);
  ilk.golemStacks = 0;
  ilk.armor = 0;
  let onceki = ilk.hp;
  room.damageEnemy(ilk, 100, 0, "warrior-1", "p1", "physical");
  const tazeVurus = onceki - ilk.hp;
  ilk.armor = 100;
  ilk.golemStacks = 100;
  onceki = ilk.hp;
  room.damageEnemy(ilk, 100, 0, "warrior-1", "p1", "physical");
  const zirhliVurus = onceki - ilk.hp;
  assert.ok(Math.abs(zirhliVurus / tazeVurus - calculateArmorDamageMultiplier(100)) < 1e-6);

  // Esit DPS (saniyede 200): Debug Lazer gibi 100 kucuk vurus ve 2 agir vurus.
  const sik = dusman(room, 4, 5);
  const agir = dusman(room, 6, 5);
  const verilen = (enemy, hits, damage) => {
    const start = enemy.hp;
    for (let index = 0; index < hits; index += 1) room.damageEnemy(enemy, damage, 0, "warrior-5", "p1", "physical");
    return start - enemy.hp;
  };
  const sikToplam = verilen(sik, 100, 2);
  const agirToplam = verilen(agir, 2, 100);
  assert.ok(agirToplam > sikToplam * 1.3, `sik ${sikToplam.toFixed(1)} / agir ${agirToplam.toFixed(1)}`);
  assert.equal(sik.golemStacks, 100);
  assert.equal(agir.golemStacks, 2);
});

// --- Meka: Kalkan atici -------------------------------------------------------------

test("meka kalkanı: 2 hücre uçuyor, 2 hücre boyunda, atış yönüne dik (çapraz atışta çapraz)", () => {
  const cell = 34;
  const duz = getMekaShieldGeometry(0, 0, 10 * cell, 0, cell);
  assert.deepEqual([duz.cx, duz.cy], [2 * cell, 0]);
  assert.ok(Math.abs(Math.hypot(duz.x2 - duz.x1, duz.y2 - duz.y1) - 2 * cell) < 1e-9);
  assert.ok(Math.abs(duz.x1 - duz.x2) < 1e-9, "duz atista kalkan dikey degil");
  const capraz = getMekaShieldGeometry(0, 0, 5 * cell, 5 * cell, cell);
  assert.ok(Math.abs(Math.hypot(capraz.cx, capraz.cy) - 2 * cell) < 1e-9);
  const sx = capraz.x2 - capraz.x1;
  const sy = capraz.y2 - capraz.y1;
  assert.ok(Math.abs(Math.hypot(sx, sy) - 2 * cell) < 1e-9);
  assert.ok(Math.abs(sx * 1 + sy * 1) < 1e-9, "capraz kalkan atis yonune dik degil");
  assert.ok(Math.abs(sx) > 1 && Math.abs(sy) > 1, "capraz kalkan capraz degil");
  // Kalkanin ortasi atis hattinin uzerinde; hat kalkani kesiyor.
  assert.ok(getSegmentCrossingT(0, 0, 5 * cell, 5 * cell, capraz.x1, capraz.y1, capraz.x2, capraz.y2) !== undefined);
  assert.equal(getSegmentCrossingT(0, 0, cell, 0, duz.x1, duz.y1, duz.x2, duz.y2), undefined, "kisa hat kalkana degmeden kesti");
  // Kule cok yakinsa kalkan kulenin onunde iniyor.
  const yakin = getMekaShieldGeometry(0, 0, 1.5 * cell, 0, cell);
  assert.equal(yakin.cx, cell);
});

/** Aticiyi kulenin 3 hucre onune koyar ve ilk kalkani bekler. */
function aticiKur(room, saat) {
  const kule = kur(room, "warrior-1", 5, 12);
  const meka = dusman(room, 5, 9, { hp: 1e6, maxHp: 1e6 });
  ozellikVer(room, meka, "thrower");
  room.updateEnemies(0.016);
  return { kule, meka };
}

test("meka kalkanı: kuleye 4 hücre yaklaşınca atıyor; uçuş, 3 sn ömür ve 8 sn bekleme; en fazla bir kalkan", () => {
  sahteSaat((saat) => {
    const room = oda(2);
    const { kule, meka } = aticiKur(room, saat);
    assert.equal(room.mekaShields.length, 1, "atici kalkan atmadi");
    const shield = room.mekaShields[0];
    assert.equal(shield.ownerEnemyId, meka.id);
    assert.ok(Math.abs(shield.landAt - saat.now - oyun(MEKA_SHIELD_THROWER.flightMs)) < 1e-6);
    assert.ok(Math.abs(shield.expiresAt - shield.landAt - oyun(MEKA_SHIELD_THROWER.lifetimeMs)) < 1e-6);
    const cell = getMapGridSize(room.activeMap);
    assert.ok(Math.abs((shield.x1 + shield.x2) / 2 - meka.x) < 1e-6);
    assert.ok(Math.abs((shield.y1 + shield.y2) / 2 - (meka.y + 2 * cell)) < 1e-6, "kalkan 2 hucre ileri inmedi");
    // Ucarken atis kesmiyor ve telde ucus bilgisi var.
    room.updateMekaShields(saat.now);
    assert.equal(room.activeMekaShieldCount, 0);
    const ucan = room.getSnapshot().mshields[0];
    assert.ok(ucan.f > 0 && typeof ucan.ox === "number");
    void kule;
    // Inis: atis kesmeye basliyor.
    saat.now = shield.landAt;
    room.updateEnemies(0.016);
    assert.equal(room.activeMekaShieldCount, 1);
    assert.ok(!("f" in room.getSnapshot().mshields[0]));
    // Omur: 3 sn sonra kalkiyor; bekleme dolmadan yenisi yok.
    saat.now = shield.expiresAt + 1;
    room.updateEnemies(0.016);
    assert.equal(room.mekaShields.length, 0, "kalkan omrunden sonra kalmadi");
    assert.ok(!("mshields" in room.getSnapshot()));
    const ilkAtis = shield.landAt - oyun(MEKA_SHIELD_THROWER.flightMs);
    saat.now = ilkAtis + oyun(MEKA_SHIELD_THROWER.cooldownMs) - 100;
    room.updateEnemies(0.016);
    assert.equal(room.mekaShields.length, 0, "bekleme dolmadan yeni kalkan");
    saat.now = ilkAtis + oyun(MEKA_SHIELD_THROWER.cooldownMs) + 1;
    room.updateEnemies(0.016);
    assert.equal(room.mekaShields.length, 1, "bekleme dolunca kalkan atilmadi");
  });
});

test("meka kalkanı: duvar ve kaynak binası saldıran kule sayılmıyor; menzil dışında atış yok", () => {
  sahteSaat((saat) => {
    const room = oda(2);
    kur(room, "warrior-8", 5, 12);
    const meka = dusman(room, 5, 9);
    ozellikVer(room, meka, "thrower");
    room.updateEnemies(0.016);
    assert.equal(room.mekaShields.length, 0, "enerji binasina kalkan atildi");
    const uzak = kur(room, "warrior-1", 5, 16);
    saat.now += 1000;
    room.updateEnemies(0.016);
    assert.equal(room.mekaShields.length, 0, "4 hucreden uzaktaki kuleye atildi");
    void uzak;
  });
});

test("meka kalkanı: hedeflemeyi, uçan mermiyi ve ışını kesiyor; durma noktası seyrek mesajla; düşmanı durdurmuyor", () => {
  sahteSaat((saat) => {
    const room = oda(2);
    const kule = kur(room, "warrior-1", 5, 14);
    kule.level = 10;
    const hedef = dusman(room, 5, 11);
    const cell = getMapGridSize(room.activeMap);
    assert.equal(room.findTowerTarget(kule)?.id, hedef.id, "kalkansiz hedef secilemedi");
    const orta = gridToWorld(5, 12.5, room.activeMap);
    room.mekaShields.push({ id: 77, ownerEnemyId: "x", ox: orta.x, oy: orta.y - cell, x1: orta.x - cell, y1: orta.y, x2: orta.x + cell, y2: orta.y, landAt: saat.now - 1, expiresAt: saat.now + 5000 });
    room.updateMekaShields(saat.now);
    assert.ok(room.isLineBlockedByAegis(kule.x, kule.y, hedef.x, hedef.y));
    assert.equal(room.findTowerTarget(kule), undefined, "kalkanin ardindaki dusman hedeflendi");
    // Yandaki (hatti kalkani kesmeyen) dusman secilebiliyor.
    const yandaki = dusman(room, 7, 14);
    assert.equal(room.findTowerTarget(kule)?.id, yandaki.id);
    room.enemies.delete(yandaki.id);

    // Ucan mermi kalkanda duruyor, hasar yok.
    for (const hitType of ["projectile", "focus"]) {
      room.projectiles.set("px", {
        id: "px", towerId: kule.id, definitionId: kule.definition.id, kind: "tower", damageType: "physical", hitType, source: "tower",
        targetId: hedef.id, x: kule.x, y: kule.y, vx: 0, vy: -cell * 8, damage: 500, maxHealthDamageRatio: 0, aoeRadius: 0, slowMs: 0,
        pierceLimit: 1, armorBreakAmount: 0, piercedEnemyIds: []
      });
      const hp = hedef.hp;
      for (let index = 0; index < 60 && room.projectiles.has("px"); index += 1) room.updateProjectiles(0.02);
      assert.ok(!room.projectiles.has("px"), `${hitType}: mermi durmadi`);
      assert.equal(hedef.hp, hp, `${hitType}: mermi kalkani gecti`);
    }

    // Isin kalkanda bitiyor.
    room.setBeam(kule, hedef.x, hedef.y, false);
    const beam = room.beams.get(`beam-${kule.id}`);
    assert.ok(Math.abs(beam.y2 - orta.y) < 1e-6, `isin kalkanda bitmedi (${beam.y2} / ${orta.y})`);

    // Seyrek mesaj: kalkan boyunca 0..1 konum (ortadan kesildi).
    saat.now += 400;
    room.updateMekaShields(saat.now);
    const blocks = room.sent.filter((entry) => entry.type === "race:block");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].payload.id, 77);
    assert.ok(blocks[0].payload.a.length >= 1 && blocks[0].payload.a.every((value) => Math.abs(value - 0.5) < 0.02));

    // Dusmani durdurmuyor: hareket eden dusmanin adimi kalkani kesebiliyor.
    assert.equal(room.isShieldBlockingSegment(orta.x, orta.y - cell, orta.x, orta.y + cell), false);
  });
});

// --- Uzay bocegi: Kazici -----------------------------------------------------------

test("kazıcı: çıkış hücresi kuralları (4-7 satır, nexusa 2 satırdan yakın değil, kenardan 1 hücre, yapı yerine en yakın boş hücre)", () => {
  const cols = 12;
  const rows = 18;
  const bounds = getBurrowEmergenceBounds(cols, rows);
  assert.deepEqual(bounds, { minCol: 1, maxCol: 10, minRow: 1, maxRow: 14 });
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let index = 0; index < 2000; index += 1) {
    const row = index % 4;
    const cell = pickBurrowEmergence({ row, cols, rows, random, isFree: () => true });
    assert.ok(cell.col >= 1 && cell.col <= cols - 2, `sutun ${cell.col}`);
    assert.ok(cell.row >= row + BUG_BURROWER.emergeMinRows && cell.row <= row + BUG_BURROWER.emergeMaxRows, `satir ${cell.row}`);
    assert.ok(rows - 1 - cell.row > BUG_BURROWER.nexusClearRows, "nexusa fazla yakin");
  }
  // Derin kazista satir nexus sinirina kirpiliyor.
  const derin = pickBurrowEmergence({ row: 12, cols, rows, random, isFree: () => true });
  assert.equal(derin.row, 14);
  // Dolu hucre: en yakin bos hucre.
  const dolu = new Set(["5:8", "4:8", "6:8", "5:7", "5:9"]);
  const yakin = findNearestFreeCell(5, 8, bounds, (col, row) => !dolu.has(`${col}:${row}`));
  assert.equal(Math.max(Math.abs(yakin.col - 5), Math.abs(yakin.row - 8)), 1);
  assert.ok(!dolu.has(`${yakin.col}:${yakin.row}`));
});

test("kazıcı: kazıyor, yer altında hedeflenemez ve hasar almaz, duvarların altından geçiyor, çatlak 1,5 sn önce; çıkınca normal ve öldürülebilir", () => {
  sahteSaat((saat) => {
    const room = oda(3);
    // 4. satirin altina boydan boya duvar: yuruyen bocek oradan gecemez.
    const grid = getMapGridSize(room.activeMap);
    const duvarlar = [];
    for (let col = 0; col < room.activeMap.cols; col += 1) {
      const point = gridToWorld(col, 4, room.activeMap);
      const before = room.towers.size;
      room.placeTower(room.client, { x: point.x, y: point.y + grid / 2, definitionId: "wall-1" });
      if (room.towers.size > before) duvarlar.push([...room.towers.values()].at(-1));
    }
    assert.ok(duvarlar.length >= room.activeMap.cols - 1, `duvar ${duvarlar.length}`);
    const kule = kur(room, "warrior-1", 6, 2);
    kule.level = 10;
    const bocek = dusman(room, 5, 0, { hp: 500, maxHp: 500, speed: 60 });
    const state = ozellikVer(room, bocek, "burrower");
    state.spawnedAt = saat.now;
    // Ilk satira inince kaziyor.
    assert.ok(sur(room, saat, 3000, () => state.burrowPhase === 1), "kazici kazmadi");
    assert.ok(bocek.untargetable);
    assert.ok(state.emergeRow >= 5, `cikis satiri ${state.emergeRow}`);
    assert.equal(room.canTowerTargetEnemy(kule, bocek), false);
    assert.equal(room.getExecuteRejectReason(bocek, saat.now), "invalid");
    const hp = bocek.hp;
    assert.equal(room.damageEnemy(bocek, 1e6, 0, "warrior-1", "p1", "true"), false);
    assert.equal(bocek.hp, hp, "yer altinda hasar aldi");
    // Yavaslatma islemiyor: hiz sifir olsa da ilerliyor.
    bocek.speed = 0;
    const wire = room.getSnapshot().enemies.find((entry) => entry.id === bocek.id);
    assert.equal(wire.rt, RACE_TRAIT_CODES.burrower);
    assert.deepEqual(wire.bu.slice(0, 2), [state.emergeCol, state.emergeRow]);
    assert.equal(wire.bu[2], Math.round(state.emergeAt));
    assert.ok(Math.abs(state.emergeAt - state.digAt - oyun(BUG_BURROWER.undergroundMs)) < 1e-6);
    assert.ok(Math.abs(state.emergeAt - getBurrowTelegraphStart(state.emergeAt) - oyun(BUG_BURROWER.telegraphMs)) < 1e-6);
    // Yeni katilan da goruyor: tam kare ayni alani tasiyor.
    assert.ok(room.getSnapshot().enemies.find((entry) => entry.id === bocek.id).bu);
    assert.ok(sur(room, saat, 5000, () => state.burrowPhase === 2), "kazici cikmadi");
    assert.equal(bocek.untargetable, false);
    const cikis = hucre(room, bocek);
    assert.deepEqual([cikis.col, cikis.row], [state.emergeCol, state.emergeRow]);
    assert.ok(cikis.row > 4, "duvarin altindan gecmedi");
    assert.ok(duvarlar.every((wall) => wall.hp === wall.maxHp), "kazici duvara vurdu");
    assert.equal(room.getSnapshot().enemies.find((entry) => entry.id === bocek.id).bu, undefined);
    // Dalga takilmiyor: cikan bocek oldurulebiliyor ve sayac dusuyor.
    assert.equal(room.damageEnemy(bocek, 1e6, 0, "warrior-1", "p1", "true"), true);
    assert.equal(room.enemies.has(bocek.id), false);
  });
});

test("kazıcı: çıkış hücresine yapı kurulursa en yakın boş hücreden çıkıyor", () => {
  sahteSaat((saat) => {
    const room = oda(3);
    const bocek = dusman(room, 5, 1, { hp: 500, maxHp: 500, speed: 60 });
    const state = ozellikVer(room, bocek, "burrower");
    state.spawnedAt = saat.now;
    sur(room, saat, 100, () => state.burrowPhase === 1);
    assert.equal(state.burrowPhase, 1);
    const hedef = { col: state.emergeCol, row: state.emergeRow };
    kur(room, "warrior-1", hedef.col, hedef.row);
    sur(room, saat, 5000, () => state.burrowPhase === 2);
    const cikis = hucre(room, bocek);
    assert.notDeepEqual([cikis.col, cikis.row], [hedef.col, hedef.row]);
    assert.equal(Math.max(Math.abs(cikis.col - hedef.col), Math.abs(cikis.row - hedef.row)), 1);
  });
});

// --- Dusmus: Ruh cekici -------------------------------------------------------------

test("ruh çekici: yalnızca 2,5 hücre içindeki düşmüş ölümleri yığın veriyor; +%8 can (iyileşerek), +%4 hız, boy; 10'da duruyor", () => {
  sahteSaat(() => {
    const room = oda(4);
    const cekici = dusman(room, 5, 5, { hp: 400, maxHp: 500, speed: 40 });
    const state = ozellikVer(room, cekici, "drawer");
    const yakin = dusman(room, 5, 7, { hp: 10, maxHp: 10 });
    const uzak = dusman(room, 5, 9, { hp: 10, maxHp: 10 });
    room.damageEnemy(uzak, 100, 0, "warrior-1", "p1", "true");
    assert.equal(state.stacks, 0, "uzaktaki olum yigin verdi");
    room.damageEnemy(yakin, 100, 0, "warrior-1", "p1", "true");
    assert.equal(state.stacks, 1);
    assert.ok(Math.abs(cekici.maxHp - 500 * (1 + FALLEN_SOUL_DRAWER.hpPerStack)) < 1e-6);
    assert.ok(Math.abs(cekici.hp - (400 + 500 * FALLEN_SOUL_DRAWER.hpPerStack)) < 1e-6, "can iyilesmedi");
    assert.ok(Math.abs(cekici.speed - 40 * (1 + FALLEN_SOUL_DRAWER.speedPerStack)) < 1e-6);
    const soul = room.sent.filter((entry) => entry.type === "race:soul");
    assert.equal(soul.length, 1);
    assert.equal(soul[0].payload.to, cekici.id);
    assert.equal(soul[0].payload.n, 1);
    for (let index = 0; index < 14; index += 1) {
      const olen = dusman(room, 6, 5, { hp: 1, maxHp: 1 });
      room.damageEnemy(olen, 10, 0, "warrior-1", "p1", "true");
    }
    assert.equal(state.stacks, FALLEN_SOUL_DRAWER.maxStacks);
    const carpan = getSoulDrawerMultipliers(state.stacks);
    assert.ok(Math.abs(cekici.maxHp - 500 * carpan.hp) < 1e-6);
    assert.ok(Math.abs(carpan.size - (1 + 10 * FALLEN_SOUL_DRAWER.sizePerStack)) < 1e-9);
    assert.equal(room.getSnapshot().enemies.find((entry) => entry.id === cekici.id).ds, FALLEN_SOUL_DRAWER.maxStacks);
  });
});

// --- 4. boyut: Faz ve katlanma ------------------------------------------------------

test("faz: her 6 sn'de 1,5 sn hedeflenemez ve hasar almaz, yürümeye devam ediyor", () => {
  sahteSaat((saat) => {
    const room = oda(5);
    const kule = kur(room, "warrior-1", 5, 14);
    const faz = dusman(room, 5, 3, { hp: 1e6, maxHp: 1e6, speed: 30 });
    const state = ozellikVer(room, faz, "phaser");
    state.spawnedAt = saat.now;
    state.phaseAt = saat.now + oyun(FOURTH_PHASE_SHIFT.intervalMs);
    sur(room, saat, oyun(FOURTH_PHASE_SHIFT.intervalMs) - 100);
    assert.equal(faz.untargetable, false, "faz erken basladi");
    const y0 = faz.y;
    sur(room, saat, 150);
    assert.equal(faz.untargetable, true, "faz baslamadi");
    assert.equal(room.canTowerTargetEnemy(kule, faz), false);
    const hp = faz.hp;
    assert.equal(room.damageEnemy(faz, 1000, 0, "warrior-1", "p1", "true"), false);
    assert.equal(faz.hp, hp);
    assert.ok(room.getSnapshot().enemies.find((entry) => entry.id === faz.id).ph);
    sur(room, saat, oyun(FOURTH_PHASE_SHIFT.durationMs) - 200);
    assert.equal(faz.untargetable, true);
    assert.ok(faz.y > y0, "fazda yurumedi");
    sur(room, saat, 200);
    assert.equal(faz.untargetable, false, "faz bitmedi");
    assert.equal(room.getSnapshot().enemies.find((entry) => entry.id === faz.id).ph, undefined);
    assert.ok(Math.abs(state.phaseAt - (state.spawnedAt + 2 * oyun(FOURTH_PHASE_SHIFT.intervalMs))) < 1e-6);
  });
});

/** Katlanani hucresinde, asagi bakan kararla kurar; uyari anina kadar surer. */
function katlanan(room, saat, col, row) {
  const enemy = dusman(room, col, row, { hp: 1e6, maxHp: 1e6, speed: 0 });
  const state = ozellikVer(room, enemy, "folder");
  state.foldAt = saat.now + oyun(FOURTH_FOLD_JUMP.intervalMs);
  enemy.navigatorStep = { fromCol: col, fromRow: row, toCol: col, toRow: row + 1 };
  return { enemy, state };
}

test("katlanma: 0,8 sn önce hedefte uyarı, sonra gezinme yönünde 3 hücre ileri", () => {
  sahteSaat((saat) => {
    const room = oda(5);
    const { enemy, state } = katlanan(room, saat, 5, 3);
    saat.now = state.foldAt - oyun(FOURTH_FOLD_JUMP.warningMs) - 10;
    room.updateEnemies(0);
    assert.equal(state.foldPending, false, "uyari erken");
    assert.equal(room.getSnapshot().enemies.find((entry) => entry.id === enemy.id).fj, undefined);
    saat.now += 20;
    room.updateEnemies(0);
    assert.equal(state.foldPending, true, "uyari yok");
    const hedef = gridToWorld(5, 6, room.activeMap);
    const wire = room.getSnapshot().enemies.find((entry) => entry.id === enemy.id);
    assert.deepEqual(wire.fj, [Math.round(hedef.x * 10) / 10, Math.round(hedef.y * 10) / 10, Math.round(state.foldAt)]);
    const sicrama = state.foldAt;
    saat.now = sicrama - 1;
    room.updateEnemies(0);
    assert.deepEqual([hucre(room, enemy).col, hucre(room, enemy).row], [5, 3], "erken sicradi");
    saat.now = sicrama;
    room.updateEnemies(0);
    assert.deepEqual([hucre(room, enemy).col, hucre(room, enemy).row], [5, 6]);
    assert.ok(Math.abs(state.foldAt - sicrama - oyun(FOURTH_FOLD_JUMP.intervalMs)) < 1e-6, "sonraki sicrama 7 sn sonra degil");
  });
});

test("katlanma: yapıya, haritanın dışına ve nexusa 1 satırdan yakına sıçramıyor (kısalıyor); Metal Kalkan iptal ediyor", () => {
  const free = () => true;
  const none = () => false;
  assert.deepEqual(pickFoldDestination({ col: 5, row: 3, dc: 0, dr: 1, cols: 12, rows: 18, isFree: free, crossesShield: none }), { col: 5, row: 6 });
  assert.deepEqual(pickFoldDestination({ col: 5, row: 3, dc: 0, dr: 1, cols: 12, rows: 18, isFree: (c, r) => r !== 6, crossesShield: none }), { col: 5, row: 5 });
  // Nexus satiri 17: en fazla 15. satir.
  assert.deepEqual(pickFoldDestination({ col: 5, row: 14, dc: 0, dr: 1, cols: 12, rows: 18, isFree: free, crossesShield: none }), { col: 5, row: 15 });
  assert.deepEqual(pickFoldDestination({ col: 10, row: 5, dc: 1, dr: 0, cols: 12, rows: 18, isFree: free, crossesShield: none }), { col: 11, row: 5 });
  assert.equal(pickFoldDestination({ col: 5, row: 3, dc: 0, dr: 1, cols: 12, rows: 18, isFree: free, crossesShield: () => true }), undefined);
  assert.equal(pickFoldDestination({ col: 5, row: 15, dc: 0, dr: 1, cols: 12, rows: 18, isFree: free, crossesShield: none }), undefined);

  sahteSaat((saat) => {
    const room = oda(5);
    // Sunucuda: uyari evresinde hedefe yapi kuruldu -> iptal (yerinde kaliyor).
    const ilk = katlanan(room, saat, 3, 3);
    saat.now = ilk.state.foldAt - oyun(FOURTH_FOLD_JUMP.warningMs);
    room.updateEnemies(0);
    assert.equal(ilk.state.foldPending, true);
    kur(room, "warrior-1", 3, 6);
    saat.now = ilk.state.foldAt;
    room.updateEnemies(0);
    assert.deepEqual([hucre(room, ilk.enemy).col, hucre(room, ilk.enemy).row], [3, 3], "yapinin uzerine sicradi");

    // Metal Kalkan hattin onunde: sicrama yok.
    const ikinci = katlanan(room, saat, 8, 3);
    saat.now = ikinci.state.foldAt - oyun(FOURTH_FOLD_JUMP.warningMs) - 50;
    const grid = getMapGridSize(room.activeMap);
    const a = gridToWorld(7, 4, room.activeMap);
    const b = gridToWorld(9, 4, room.activeMap);
    room.useSkill(room.client, { slot: ATAKAN_SHIELD_SLOT, x: a.x - grid / 2, y: a.y + grid / 2, x2: b.x + grid / 2, y2: b.y + grid / 2 });
    assert.equal(room.metalShields.length, 1, "Metal Kalkan kurulamadi");
    saat.now = ikinci.state.foldAt;
    room.updateEnemies(0);
    room.updateEnemies(0);
    assert.deepEqual([hucre(room, ikinci.enemy).col, hucre(room, ikinci.enemy).row], [8, 3], "Metal Kalkan'in otesine sicradi");
  });
});

test("tel: kalkan kaydı ve düşman alanları yalnızca doluyken; özelliksiz düşmanda irk anahtarı yok", () => {
  sahteSaat(() => {
    const room = oda(4);
    const sade = dusman(room, 2, 2);
    const wire = room.getSnapshot().enemies.find((entry) => entry.id === sade.id);
    for (const key of ["rt", "ga", "bu", "ds", "ph", "fj"]) assert.ok(!(key in wire), `${key} ozelliksiz dusmanda`);
    const cekici = dusman(room, 5, 5);
    ozellikVer(room, cekici, "drawer");
    const cekiciWire = room.getSnapshot().enemies.find((entry) => entry.id === cekici.id);
    assert.equal(cekiciWire.rt, RACE_TRAIT_CODES.drawer);
    assert.ok(!("ds" in cekiciWire));
    assert.ok(!("mshields" in room.getSnapshot()));
  });
});
