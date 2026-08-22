import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_COUNT_WAVE_MULTIPLIER,
  ENEMY_HP_WAVE_MULTIPLIER,
  ENEMY_HP_BALANCE_MULTIPLIER,
  PLAYER_POWER_COMPENSATION,
  ENEMY_REWARD_MULTIPLIER,
  FINAL_WAVE,
  getEnemyCombatDefinition,
  getWaveCompletionGold,
  getWaveEnemyCount,
  getArenaWaveEnemyCount,
  getWaveEnemyMaxHp,
  getWaveHpMultiplier,
  getTowerRealDps,
  getTowerBaseLevelDamage,
  calculateDamageTaken,
  EARLY_WAVE_CONVERGENCE_WAVE,
  towerCatalog
} from "../packages/shared/dist/index.js";

test("20 dalgalık kazanılabilirlik eğrisini sabitler", () => {
  assert.equal(FINAL_WAVE, 20);
  // Zorluk kalinliktan kalabaliga kaydi: dalga basina dusman sayisi daha dik
  // artiyor, tek dusmanin cani daha yavas. 20. dalgada 73 kalin dusman yerine
  // 142 ince dusman var.
  assert.equal(ENEMY_COUNT_WAVE_MULTIPLIER, 1.15);
  assert.equal(ENEMY_HP_WAVE_MULTIPLIER, 1.17);
  // Taban egri degismedi; uzerine oyuncu tarafindaki guc degisimlerini karsilayan
  // telafi carpani bindi. Ikisi ayri tutuluyor ki hangi sayinin neden degistigi
  // sonradan okunabilsin.
  assert.equal(PLAYER_POWER_COMPENSATION, 1.95);
  assert.ok(Math.abs(ENEMY_HP_BALANCE_MULTIPLIER - 1.1 * 4 / 3 * PLAYER_POWER_COMPENSATION) < 1e-12);
  assert.equal(getWaveEnemyCount(20), 142);

  const gruntHp = getWaveEnemyMaxHp(getEnemyCombatDefinition("grunt").maxHp, 20);
  assert.equal(gruntHp, 2598);
  assert.equal(gruntHp * getWaveEnemyCount(20), 368_916);
});

/**
 * Seviye atlamak hicbir kuleyi kotulestiremez.
 *
 * Elle yazilmis carpan tablolari bu kurali sessizce ihlal edebiliyordu: Ucube'nin
 * tablosunda 6->7 gecisinde bir delik vardi ve oyuncu altin ile deneyim harcayip
 * kulesinin DPS'ini 59.8'den 48.5'e dusuruyordu. Yeni bir kule egrisi yazan
 * herkesin ayni tuzaga dusmesini bu test engeller.
 */
test("hiçbir kule seviye atlayınca zayıflamaz", () => {
  for (const towers of Object.values(towerCatalog)) {
    for (const tower of towers) {
      if (tower.resourceProvider || getTowerRealDps(tower, 1) <= 0) continue;
      for (let level = 2; level <= 10; level += 1) {
        const previous = getTowerRealDps(tower, level - 1);
        const current = getTowerRealDps(tower, level);
        assert.ok(
          current >= previous,
          `${tower.id}: seviye ${level - 1} -> ${level} DPS'i ${previous.toFixed(1)} -> ${current.toFixed(1)} dusuruyor`
        );
      }
    }
  }
});

/**
 * Seviye tek basina oyunu belirlememeli.
 *
 * 1'den 10'a cikmak bir donem DPS'i 48 katina cikariyordu; kart katmaninin
 * tamami x2-3, karakterlerin imza mekanikleri ise +%24 ile +%32 arasindaydi.
 * Boyle bir farkta oyunun butun ilginc kararlari anlamsizlasir ve dogru oynanis
 * "iki kuleyi maxla" olur. Ust sinir o dengesizligin geri donmesini engeller.
 */
test("seviye egrisi diger guc kaynaklarini ezmez", () => {
  for (const towers of Object.values(towerCatalog)) {
    for (const tower of towers) {
      if (tower.resourceProvider || getTowerRealDps(tower, 1) <= 0) continue;
      const ratio = getTowerRealDps(tower, 10) / getTowerRealDps(tower, 1);
      assert.ok(ratio <= 30, `${tower.id}: seviye egrisi x${ratio.toFixed(1)} ile cok dik`);
    }
  }
});

/**
 * Ilk dalgalarin referans hissi.
 *
 * Dalga egrisi her dalgada ayni oranda buyudugu icin 1. dalga dusmani bile taban
 * caninin birkac kati canla geliyordu ve seviye 1 bir kule en zayif dusmani bile
 * tek vurusta dusuremiyordu. Ilk dalgalar oyuncunun kurulusunu tanidigi yer;
 * referans olarak seviye 1 Hiza Emri normal dusmani tek, zirhliyi iki vurusta
 * oldurmeli.
 *
 * Egri, kule hasari ya da dusman statlari degistiginde bu his sessizce kayar,
 * o yuzden sayilar degil hissin kendisi sabitleniyor.
 */
test("ilk üç dalgada seviye 1 Hiza Emri referans vuruş sayısını tutturur", () => {
  const hiza = towerCatalog.zeynep.find((tower) => tower.id === "zeynep-1");
  assert.ok(hiza);
  const shotDamage = getTowerBaseLevelDamage(hiza, 1);

  const hitsToKill = (enemyType, wave) => {
    const enemy = getEnemyCombatDefinition(enemyType);
    let hp = getWaveEnemyMaxHp(enemy.maxHp, wave);
    // MatchRoom.spawnEnemy ile birebir: can denge carpanini alir, kalkan almaz.
    let shield = Math.round(enemy.shield * getWaveHpMultiplier(wave));
    let hits = 0;
    while (hp > 0 && hits < 50) {
      const result = calculateDamageTaken(
        { amount: shotDamage, damageType: hiza.damageType, hitType: hiza.hitType },
        {
          armor: enemy.armor,
          shield,
          damageResistances: enemy.damageResistances,
          hitTypeResistances: enemy.hitTypeResistances
        }
      );
      shield = result.remainingShield;
      hp -= result.hpDamage;
      hits += 1;
    }
    return hits;
  };

  for (const wave of [1, 2, 3]) {
    assert.equal(hitsToKill("grunt", wave), 1, `dalga ${wave}: grunt tek vurusta olmuyor`);
    assert.equal(hitsToKill("runner", wave), 1, `dalga ${wave}: runner tek vurusta olmuyor`);
    assert.equal(hitsToKill("shooter", wave), 2, `dalga ${wave}: shooter iki vurusta olmuyor`);
    assert.equal(hitsToKill("brute", wave), 2, `dalga ${wave}: brute iki vurusta olmuyor`);
  }
});

/**
 * Yumusatma yalnizca erken dalgalari ilgilendirir.
 *
 * Rampa `EARLY_WAVE_CONVERGENCE_WAVE` dalgasinda mevcut egriye oturur; o dalgadan
 * itibaren tek bir sayi bile degismemeli, yoksa gec oyun dengesi farkinda
 * olmadan kayar.
 */
test("erken yumuşatma 10. dalgadan sonra hiçbir şeyi değiştirmez", () => {
  for (let wave = EARLY_WAVE_CONVERGENCE_WAVE; wave <= FINAL_WAVE; wave += 1) {
    const smoothed = getWaveHpMultiplier(wave);
    const original = ENEMY_HP_WAVE_MULTIPLIER ** (wave - 1);
    assert.ok(Math.abs(smoothed - original) < 1e-9, `dalga ${wave}: egri kaymis`);
  }

  // Ve rampa gercekten yumusatiyor: erken dalgalar duz egrinin altinda kalmali.
  for (let wave = 1; wave < EARLY_WAVE_CONVERGENCE_WAVE; wave += 1) {
    assert.ok(
      getWaveHpMultiplier(wave) < ENEMY_HP_WAVE_MULTIPLIER ** (wave - 1),
      `dalga ${wave}: yumusatma islememis`
    );
  }
});

test("dalga canı hiçbir dalgada geriye gitmez", () => {
  for (let wave = 2; wave <= FINAL_WAVE; wave += 1) {
    assert.ok(
      getWaveHpMultiplier(wave) > getWaveHpMultiplier(wave - 1),
      `dalga ${wave}: can carpani onceki dalgadan dusuk`
    );
  }
});

test("düşman sayısı harita ölçeği ve oyuncu sayısıyla çarpılır", () => {
  assert.equal(getArenaWaveEnemyCount(1, 1, 1), 10);
  assert.equal(getArenaWaveEnemyCount(1, 2, 1), 20);
  assert.equal(getArenaWaveEnemyCount(1, 3, 1), 30);
  assert.equal(getArenaWaveEnemyCount(1, 4, 1), 40);
  assert.equal(getArenaWaveEnemyCount(1, 4, 4), 82);
});

test("dalga ekonomisini ve rejenerasyon ölçeklemesini sabitler", () => {
  assert.equal(ENEMY_REWARD_MULTIPLIER, 1.5);
  assert.equal(getWaveCompletionGold(1), 26);
  assert.equal(getWaveCompletionGold(19), 80);

  const brute = getEnemyCombatDefinition("brute");
  const wave20Regen = brute.healthRegenPerSecond * getWaveHpMultiplier(20);
  assert.equal(Math.round(wave20Regen * 1000) / 1000, 6.912);
});
