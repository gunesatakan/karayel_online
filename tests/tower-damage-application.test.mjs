/**
 * Atakan, Zeynep ve Melis'in her kulesi icin ayri ayri: hareket eden kalkanli
 * bir dusmana ates edildiginde, ekranda gosterilen hasarin gercekten dusmanin
 * kalkanina ve canina islemesi gerekir.
 *
 * Bu testler gercek MatchRoom boru hattini surer (hedefleme -> ates -> mermi
 * carpismasi -> hasar), cunku hata bu zincirin icinde yasiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { towerCatalog } from "../packages/shared/dist/index.js";
import {
  SHIELDED_ENEMIES,
  isDamageDealingTower,
  simulateTowerAgainstMovingShieldedEnemy
} from "./helpers/match-room-harness.mjs";

const CHARACTERS = [
  ["warrior", "Atakan"],
  ["zeynep", "Zeynep"],
  ["archer", "Melis"]
];

for (const [characterId, characterName] of CHARACTERS) {
  for (const definition of towerCatalog[characterId].filter(isDamageDealingTower)) {
    for (const [enemyName, enemyProfile] of Object.entries(SHIELDED_ENEMIES)) {
      test(`${characterName} ${definition.name} (${definition.id}) hareket eden kalkanli ${enemyName} dusmanina hasarini gercekten uygular`, () => {
        const result = simulateTowerAgainstMovingShieldedEnemy({
          characterId,
          definition,
          enemyProfile
        });

        assert.ok(result.placed, `${definition.id}: ${result.reason}`);

        // Asil kural: hasar her zaman haritadaki canli dusman nesnesine yazilmali.
        // Kopyaya yazilan hasar ekranda gorunur ama dusmana hic islemez.
        assert.equal(
          result.detachedCopyHits,
          0,
          `${definition.id}: hasar ${result.detachedCopyHits} kez dusmanin kopyasina uygulandi, ` +
          `canli nesneye yalnizca ${result.liveInstanceHits} kez ulasti`
        );

        if (result.displayedDamage > 0) {
          assert.ok(
            result.appliedDamage > 0,
            `${definition.id}: ekranda ${result.displayedDamage} hasar gosterildi ama ` +
            `dusmanin cani ${result.remainingHp} ve kalkani ${result.remainingShield} hic inmedi`
          );
        }
      });
    }
  }
}

test("kalkanli dusman tek atista olmese bile birden fazla vurusun hasari birikir", () => {
  // Takipci tek atista kalkanli shooter'i oldurecek kadar vurmaz; bu yuzden
  // hasarin vuruslar arasinda birikmesi gerekir. Birikmiyorsa dusman olumsuzdur.
  const definition = towerCatalog.warrior.find((tower) => tower.id === "warrior-1");
  const result = simulateTowerAgainstMovingShieldedEnemy({
    characterId: "warrior",
    definition,
    enemyProfile: SHIELDED_ENEMIES.shooter
  });

  assert.ok(result.placed, "Takipci kurulamadi");
  assert.ok(result.displayedDamage > 0, "Takipci hic ates etmedi");
  assert.ok(
    result.appliedDamage > 0,
    `Takipci ${result.displayedDamage} hasar gosterdi ama dusmanin efektif cani hic inmedi`
  );
});

test("gosterilen toplam hasar dusmana inen hasardan fazla olamaz", () => {
  // Gosterge ile gercek arasindaki fark, kaybolan hasarin dogrudan olcusu.
  for (const [characterId] of CHARACTERS) {
    for (const definition of towerCatalog[characterId].filter(isDamageDealingTower)) {
      const result = simulateTowerAgainstMovingShieldedEnemy({
        characterId,
        definition,
        enemyProfile: SHIELDED_ENEMIES.shooter
      });
      if (!result.placed || result.displayedDamage === 0) {
        continue;
      }
      assert.ok(
        result.appliedDamage >= Math.min(result.displayedDamage, result.startingEffectiveHp) - 1,
        `${definition.id}: ${result.displayedDamage} hasar gosterildi ama yalnizca ` +
        `${result.appliedDamage} hasar islendi`
      );
    }
  }
});
