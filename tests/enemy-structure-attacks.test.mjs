/**
 * Dusmanin yapilara vurusu.
 *
 * Iki soru burada tutuluyor. Birincisi: her dusmanin kendi saldiri gucu var mi.
 * Bir sure hepsi 12'ydi ve o sayi bir yer tutucuydu -- kacan runner ile agir
 * brute ayni sertlikte vuruyordu. Ikincisi: nisanci gercekten **uzaktan**
 * vuruyor mu. "Menzilli dusman" bir sifattan ibaret kalmasin diye test dokunma
 * mesafesinin disindan hasar aramak zorunda.
 *
 * Her menzilli testin bir de kontrolu var: ayni yerdeki menzilsiz dusman hicbir
 * sey yapmiyor. O olmadan "herkes her yerden vuruyor" hatasi da gecerdi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_STRUCTURE_DAMAGE_FINAL_WAVE_MULTIPLIER,
  ENEMY_STRUCTURE_DAMAGE_FIRST_WAVE,
  ENEMY_STRUCTURE_DAMAGE_FIRST_WAVE_MULTIPLIER,
  FINAL_WAVE,
  REFERENCE_STRUCTURE_BREAK_DPS,
  SIEGE_STRUCTURE_DAMAGE_MULTIPLIER,
  TOWER_HUNTER_HIT_DAMAGE,
  enemyCombatDefinitions,
  getEnemyLeakDamage,
  getEnemyStructureDamageMultiplier,
  getMapGridSize,
  getReferenceStructureBreakDps,
  getWaveChampionPlan,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

/** Bir yapi kurar ve onun `attackRange` disina, ama menzil icine bir dusman koyar. */
function nisanciKarsisindaYapi(room, definitionId, { type = "shooter", mesafe } = {}) {
  const nokta = findBuildableSpot(room, definitionId);
  assert.ok(nokta, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId });
  const yapi = [...room.towers.values()].at(-1);
  assert.ok(yapi, `${definitionId} kurulamadi`);

  room.spawnEnemy();
  const dusman = [...room.enemies.values()].at(-1);
  dusman.type = type;
  const tanim = enemyCombatDefinitions[type];
  dusman.attack = tanim.attack;
  dusman.attackRange = room.scaleWorldDistance(tanim.attackRange ?? 0);
  dusman.towerAttackCooldownMs = 0;
  // Bir hucreden uzakta ama menzil icinde: bitisik vurusun kapsayamayacagi yer.
  const gridSize = getMapGridSize(room.activeMap);
  dusman.x = yapi.x;
  dusman.y = yapi.y - (mesafe ?? gridSize * 2);
  return { yapi, dusman };
}

test("her düşmanın kendi saldırı gücü var", () => {
  const guçler = Object.values(enemyCombatDefinitions).map((tanim) => tanim.attack);
  for (const [tur, tanim] of Object.entries(enemyCombatDefinitions)) {
    assert.ok(tanim.attack > 0, `${tur}: saldiri gucu yok`);
  }
  // Asil sinav bu: hepsi ayni sayiysa "saldiri gucu" diye bir stat yok demektir.
  assert.ok(new Set(guçler).size > 1, "butun dusmanlar ayni sertlikte vuruyor");
  assert.ok(
    enemyCombatDefinitions.brute.attack > enemyCombatDefinitions.runner.attack,
    "agir govde kacan dusmandan sert vurmali"
  );
});

test("menzil yalnızca nişancıda var ve kule menzilinin altında kalır", () => {
  const menzilliler = Object.entries(enemyCombatDefinitions).filter(([, tanim]) => (tanim.attackRange ?? 0) > 0);
  assert.deepEqual(menzilliler.map(([tur]) => tur), ["shooter"]);

  // Duello kulenin lehine acik kalmali: nisanci kuleyi vurabilmeli ama kule
  // once vurmali. Karsilastirma atis yapan kulelerin ortancasina karsi.
  const kuleMenzilleri = Object.values(towerCatalog).flat()
    .filter((tanim) => tanim.range > 0 && tanim.range < 400)
    .map((tanim) => tanim.range)
    .sort((a, b) => a - b);
  const ortanca = kuleMenzilleri[Math.floor(kuleMenzilleri.length / 2)];
  assert.ok(
    enemyCombatDefinitions.shooter.attackRange < ortanca,
    `nisanci menzili (${enemyCombatDefinitions.shooter.attackRange}) kule ortancasindan (${ortanca}) kisa olmali`
  );
});

test("nişancı dokunmadığı kuleyi vurur", () => {
  const room = oda();
  const { yapi, dusman } = nisanciKarsisindaYapi(room, "warrior-1");
  const once = yapi.hp;
  room.updateEnemies(0.05);
  assert.ok(yapi.hp < once, "menzilli dusman kuleye hasar vermedi");
  assert.ok(dusman.towerAttackCooldownMs > 0, "vurus bekleme suresi baslamadi");
});

test("nişancı duvarı da vurur", () => {
  // Duvar dokunulmaz bir zemin degil. Menzilli dusman duvari da hedefe alir,
  // yoksa nisancinin karsi-oyunu "duvarin arkasina saklan" olurdu.
  const room = oda();
  const { yapi } = nisanciKarsisindaYapi(room, "wall-1");
  const once = yapi.hp;
  room.updateEnemies(0.05);
  assert.ok(yapi.hp < once, "menzilli dusman duvara hasar vermedi");
});

test("menzilsiz düşman aynı yerden hiçbir şey yapamaz", () => {
  const room = oda();
  const { yapi } = nisanciKarsisindaYapi(room, "warrior-1", { type: "grunt" });
  const once = yapi.hp;
  room.updateEnemies(0.05);
  assert.equal(yapi.hp, once, "menzilsiz dusman uzaktan vurdu");
});

test("nişancının atışı ekranda bir iz bırakır", () => {
  // Hasar gorunmuyorsa oyuncu kulesinin neden eridigini anlamaz.
  const room = oda();
  nisanciKarsisindaYapi(room, "warrior-1");
  room.updateEnemies(0.05);
  const izler = [...room.beams.values()].filter((isin) => isin.definitionId === "enemy-shot");
  assert.equal(izler.length, 1, "menzilli vurusun izi cizilmedi");
  assert.ok(izler[0].ttlMs > 0);
});

test("kuşatma düşmanı yapı çarpanını bitişik vuruşta korur", () => {
  // Menzilli ve bitisik vurus ayni yerden geciyor; carpanin o tasinmada
  // dusmedigini dogrulamak icin.
  const room = oda();
  const nokta = findBuildableSpot(room, "wall-1");
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId: "wall-1" });
  const duvar = [...room.towers.values()].at(-1);

  room.spawnEnemy();
  const kusatma = [...room.enemies.values()].at(-1);
  kusatma.type = "siege";
  kusatma.attack = enemyCombatDefinitions.siege.attack;
  kusatma.attackRange = 0;
  const oncekiHp = duvar.hp;
  room.strikeStructure(kusatma, duvar);
  const kusatmaHasari = oncekiHp - duvar.hp;

  duvar.hp = oncekiHp;
  const grunt = { ...kusatma, type: "grunt", attack: enemyCombatDefinitions.siege.attack, towerAttackCooldownMs: 0 };
  room.strikeStructure(grunt, duvar);
  const normalHasar = oncekiHp - duvar.hp;

  assert.ok(kusatmaHasari > normalHasar, "kusatma carpani kaybolmus");
});

// --- Dalga carpani ------------------------------------------------------------------

test("yapı hasarının dalga çarpanı: 1. dalga ×1,25, 20. dalga ×2,5, arası doğrusal, uçlarda kesik", () => {
  assert.equal(ENEMY_STRUCTURE_DAMAGE_FIRST_WAVE, 1);
  assert.equal(ENEMY_STRUCTURE_DAMAGE_FIRST_WAVE_MULTIPLIER, 1.25);
  assert.equal(ENEMY_STRUCTURE_DAMAGE_FINAL_WAVE_MULTIPLIER, 2.5);
  assert.equal(FINAL_WAVE, 20, "formulun paydasi (19) son dalgaya bagli");
  assert.equal(getEnemyStructureDamageMultiplier(1), 1.25);
  assert.equal(getEnemyStructureDamageMultiplier(20), 2.5);
  for (let wave = 1; wave <= 20; wave += 1) {
    const beklenen = 1.25 + 1.25 * (wave - 1) / 19;
    assert.ok(Math.abs(getEnemyStructureDamageMultiplier(wave) - beklenen) < 1e-12, `${wave}. dalga`);
  }
  assert.ok(Math.abs(getEnemyStructureDamageMultiplier(10) - 1.8421052631578947) < 1e-12);
  // Dalga 1'in alti 1'e, sonsuz dalga olmadigi icin 20'nin ustu 20'ye.
  assert.equal(getEnemyStructureDamageMultiplier(0), 1.25);
  assert.equal(getEnemyStructureDamageMultiplier(-5), 1.25);
  assert.equal(getEnemyStructureDamageMultiplier(Number.NaN), 1.25);
  assert.equal(getEnemyStructureDamageMultiplier(21), 2.5);
  assert.equal(getEnemyStructureDamageMultiplier(400), 2.5);
  // Simulatorun referansi ayni carpani okuyor.
  assert.equal(getReferenceStructureBreakDps(1), REFERENCE_STRUCTURE_BREAK_DPS * 1.25);
  assert.equal(getReferenceStructureBreakDps(20), REFERENCE_STRUCTURE_BREAK_DPS * 2.5);
});

/** Yapiya tek vurus; yapinin kaybettigi can. Yapi her seferinde tam cana donuyor. */
function tekVurus(room, dusman, yapi) {
  yapi.hp = yapi.maxHp;
  room.strikeStructure({ ...dusman, towerAttackCooldownMs: 0 }, yapi);
  return yapi.maxHp - yapi.hp;
}

test("her düşman → yapı vuruşu aynı dalga çarpanını zırhtan önce alıyor: bitişik, nişancı, kuşatma, avcı, şampiyon", () => {
  for (const wave of [1, 10, 20]) {
    const room = oda();
    room.wave = wave;
    const carpan = getEnemyStructureDamageMultiplier(wave);
    const kuleNokta = findBuildableSpot(room, "warrior-1");
    room.placeTower(client, { x: kuleNokta.x, y: kuleNokta.y, definitionId: "warrior-1" });
    const kule = [...room.towers.values()].at(-1);
    const duvarNokta = findBuildableSpot(room, "wall-1");
    room.placeTower(client, { x: duvarNokta.x, y: duvarNokta.y, definitionId: "wall-1" });
    const duvar = [...room.towers.values()].at(-1);
    // Buyuk can: tek vurus hicbir yapiyi sifira kirpmasin, fark tam okunsun.
    for (const yapi of [kule, duvar]) {
      yapi.maxHp = 10_000;
      yapi.hp = 10_000;
      assert.ok(yapi.armor > 0, "zirhsiz yapi zirhtan onceyi olcemez");
    }

    room.spawnEnemy();
    const govde = [...room.enemies.values()].at(-1);
    const dusman = (type, ek = {}) => ({
      ...govde,
      type,
      attack: enemyCombatDefinitions[type].attack,
      attackRange: room.scaleWorldDistance(enemyCombatDefinitions[type].attackRange ?? 0),
      ...ek
    });
    const sampiyonPlani = getWaveChampionPlan(wave, 60, { firstWave: 1 });
    const vakalar = [
      ["grunt", dusman("grunt"), enemyCombatDefinitions.grunt.attack],
      ["runner", dusman("runner"), enemyCombatDefinitions.runner.attack],
      ["brute", dusman("brute"), enemyCombatDefinitions.brute.attack],
      ["shooter", dusman("shooter"), enemyCombatDefinitions.shooter.attack],
      ["siege", dusman("siege"), enemyCombatDefinitions.siege.attack * SIEGE_STRUCTURE_DAMAGE_MULTIPLIER],
      // Avci kendi taban vurusuyla; kusatma turunde de kusatma carpani binmiyor.
      ["avci", dusman("grunt", { special: { kind: "hunter" } }), TOWER_HUNTER_HIT_DAMAGE],
      ["kusatma avci", dusman("siege", { special: { kind: "hunter" } }), TOWER_HUNTER_HIT_DAMAGE],
      // Sampiyonun ayri bir saldiri kati yok: turunun tabani, ayni dalga carpani.
      ["sampiyon", dusman("brute", { champion: { ...sampiyonPlani, spawnedAt: 0 } }), enemyCombatDefinitions.brute.attack]
    ];
    for (const [ad, vuran, taban] of vakalar) {
      for (const yapi of [kule, duvar]) {
        const beklenen = Math.max(1, taban * carpan - yapi.armor);
        const inen = tekVurus(room, vuran, yapi);
        assert.ok(
          Math.abs(inen - beklenen) < 1e-9,
          `${wave}. dalga, ${ad} -> ${yapi.definition.id}: ${inen} indi, beklenen ${beklenen}`
        );
      }
    }
  }
});

test("çarpan dalgayla büyüyor ve düşmanın taban saldırısını, nexus sızıntısını değiştirmiyor", () => {
  const hasar = (wave) => {
    const room = oda();
    room.wave = wave;
    const { yapi, dusman } = nisanciKarsisindaYapi(room, "warrior-1");
    yapi.maxHp = 10_000;
    yapi.hp = 10_000;
    room.updateEnemies(0.05);
    // Dogan dusmanin `attack`i dalgadan bagimsiz: carpan vurusta biniyor.
    assert.equal(dusman.attack, enemyCombatDefinitions.shooter.attack);
    return { inen: 10_000 - yapi.hp, zirh: yapi.armor };
  };
  const ilk = hasar(1);
  const orta = hasar(10);
  const son = hasar(20);
  assert.ok(ilk.inen < orta.inen && orta.inen < son.inen, `${ilk.inen} / ${orta.inen} / ${son.inen}`);
  // Nisanci: 9 ham. 1. dalga 11,25 - 3 = 8,25; 20. dalga 22,5 - 3 = 19,5.
  assert.ok(Math.abs(ilk.inen - (9 * 1.25 - ilk.zirh)) < 1e-9, `1. dalga ${ilk.inen}`);
  assert.ok(Math.abs(son.inen - (9 * 2.5 - son.zirh)) < 1e-9, `20. dalga ${son.inen}`);
  // Sizinti hasari ayri tablo; dalga almiyor bile.
  assert.equal(getEnemyLeakDamage("grunt"), 8);
  assert.equal(getEnemyLeakDamage("brute"), 14);
});
