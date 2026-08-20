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
  assert.equal(PLAYER_POWER_COMPENSATION, 1.8);
  assert.ok(Math.abs(ENEMY_HP_BALANCE_MULTIPLIER - 1.1 * 4 / 3 * PLAYER_POWER_COMPENSATION) < 1e-12);
  assert.equal(getWaveEnemyCount(20), 142);

  const gruntHp = getWaveEnemyMaxHp(getEnemyCombatDefinition("grunt").maxHp, 20);
  assert.equal(gruntHp, 2398);
  assert.equal(gruntHp * getWaveEnemyCount(20), 340_516);
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
