/**
 * Bes asama, asama basina yirmi tur, asama basina tek dusman irki.
 *
 * Irk bir donem dalga dalga donuyordu ve bu okunmuyordu: direnc tablosu her
 * dalgada degistigi icin oyuncunun kurdugu dizilim bir dalga dogru, bir dalga
 * yanlis oluyordu -- ve iki dalga arasinda dizilimi degistirmenin bir yolu yok.
 * Sistem kuruluydu ama karsisinda oynanamiyordu.
 *
 * En kritik soz burada: **bir asamanin yirmi turu boyunca tek irk**. Bu bozulursa
 * asama secmenin anlami kalmaz ve oyun sessizce eski donen duzene doner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FINAL_WAVE,
  STAGE_COUNT,
  WAVES_PER_STAGE,
  enemyRaceDefinitions,
  getHighestUnlockedStage,
  getStage,
  getStageDamageProfile,
  getStageRace,
  isStageUnlocked,
  stageCatalog
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

test("bes asama var ve her biri yirmi tur", () => {
  assert.equal(stageCatalog.length, STAGE_COUNT);
  assert.equal(STAGE_COUNT, 5);
  assert.equal(WAVES_PER_STAGE, FINAL_WAVE);
  assert.equal(WAVES_PER_STAGE, 20);
  assert.deepEqual(stageCatalog.map(({ id }) => id), [1, 2, 3, 4, 5]);
});

test("her asamanin irki farkli", () => {
  const irklar = stageCatalog.map(({ race }) => race);
  assert.equal(new Set(irklar).size, irklar.length, "iki asama ayni irki paylasiyor");
  for (const race of irklar) {
    assert.ok(enemyRaceDefinitions[race], `${race} bilinen bir irk degil`);
  }
});

test("bir asamanin yirmi turu boyunca tek irk geliyor", () => {
  for (const stage of stageCatalog) {
    const room = createRoom("warrior");
    room.stage = stage.id;
    const gorulen = new Set();
    for (let wave = 1; wave <= WAVES_PER_STAGE; wave += 1) {
      room.wave = wave;
      room.enemies.clear();
      for (let index = 0; index < 6; index += 1) room.spawnEnemy();
      for (const enemy of room.enemies.values()) gorulen.add(enemy.race);
    }
    assert.deepEqual([...gorulen], [stage.race], `${stage.id}. asamada birden fazla irk cikti`);
  }
});

test("asama kimligi gecersizse ilk asamaya duser", () => {
  for (const gecersiz of [undefined, 0, -3, 99, Number.NaN]) {
    assert.equal(getStage(gecersiz).id, 1, `${gecersiz} ilk asamaya dusmedi`);
  }
  assert.equal(getStageRace(undefined), stageCatalog[0].race);
});

test("ilk asama her zaman acik, digerleri bir oncekini istiyor", () => {
  assert.equal(isStageUnlocked(1, []), true);
  assert.equal(isStageUnlocked(2, []), false);
  assert.equal(isStageUnlocked(2, [1]), true);
  assert.equal(isStageUnlocked(3, [1]), false);
  assert.equal(isStageUnlocked(3, [1, 2]), true);
  assert.equal(isStageUnlocked(STAGE_COUNT + 1, [1, 2, 3, 4, 5]), false);
});

test("atlanmis ilerleme bir sonraki asamayi acmiyor", () => {
  // Depo elle kurcalanabilir. Ucuncu asamayi tamamlanmis gostermek dorduncuyu
  // acmali ama ikinciyi atlayan oyuncuyu ucuncuye dusurmemeli.
  assert.equal(isStageUnlocked(2, [3]), false);
  assert.equal(isStageUnlocked(4, [3]), true);
  assert.equal(getHighestUnlockedStage([3]), 4);
  assert.equal(getHighestUnlockedStage([]), 1);
  assert.equal(getHighestUnlockedStage([1, 2, 3, 4, 5]), STAGE_COUNT);
});

test("asamanin zayif ve direncli tipleri direnc tablosundan turer", () => {
  for (const stage of stageCatalog) {
    const profile = getStageDamageProfile(stage.id);
    const table = enemyRaceDefinitions[stage.race].damageResistances;
    // Metin elle yazilsaydi sahadaki dirençle ayrilabilir ve oyuncuya yalan
    // soylerdi; bu yuzden iki taraf ayni tablodan okunuyor.
    for (const type of profile.weakTo) assert.ok(table[type] < 0, `${stage.id}: ${type} zayiflik degil`);
    for (const type of profile.resistantTo) assert.ok(table[type] > 0, `${stage.id}: ${type} direnc degil`);
    assert.ok(profile.weakTo.length > 0, `${stage.id}. asamanin zayifligi yok`);
    assert.ok(profile.resistantTo.length > 0, `${stage.id}. asamanin direnci yok`);
  }
});

test("ilk asama baslangic kulelerinin hasar tipine acik, son asama kapali", () => {
  // Yedi karakterin baslangic kulelerinin cogu fiziksel vuruyor. Ilk asamada
  // oyuncu elindekiyle kazanabilmeli, son asamada varsayilan hasar tipi
  // cezalandirilmali -- asamalar arasinda ogrenilecek bir sey olsun diye.
  const ilk = enemyRaceDefinitions[stageCatalog[0].race].damageResistances;
  const son = enemyRaceDefinitions[stageCatalog[STAGE_COUNT - 1].race].damageResistances;
  assert.ok((ilk.physical ?? 0) < 0, "ilk asama fiziksele acik degil");
  assert.ok((son.physical ?? 0) > 0, "son asama fizikseli cezalandirmiyor");
});

test("oda asamasini secenekten aliyor ve dusman irki oradan cikiyor", () => {
  for (const stage of stageCatalog) {
    const room = createRoom("warrior");
    room.stage = getStage(stage.id).id;
    room.wave = 7;
    room.spawnEnemy();
    assert.equal([...room.enemies.values()][0].race, stage.race);
  }
});
