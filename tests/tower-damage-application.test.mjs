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
  ["warrior", "AttackLord"],
  ["zeynep", "ZentaX"],
  ["archer", "DualiTemp"]
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
  // Hedef 30 birim/sn yuruyor (dogdugu hiz ~46): isabet kutusu gorunen govde
  // ve nisan oncul nisansiz (sahibin karari), 46'da ates konisinin kenarindan
  // cikan tek atis kosan govdenin yanindan gecebiliyor ve kule menzilde bir
  // kez ateslemeye yetisiyor. Burada sinanan hasarin vuruslar arasinda
  // birikmesi; bunun icin vuruslarin inmesi gerekiyor. Dogum hizindaki
  // iskalama orani asagidaki ayri testte olculuyor (60 tohumda 11; 30'da 0).
  const result = simulateTowerAgainstMovingShieldedEnemy({
    characterId: "warrior",
    definition,
    enemyProfile: { ...SHIELDED_ENEMIES.shooter, speed: 30 }
  });

  assert.ok(result.placed, "Takipci kurulamadi");
  assert.ok(result.displayedDamage > 0, "Takipci hic ates etmedi");
  assert.ok(
    result.appliedDamage > 0,
    `Takipci ${result.displayedDamage} hasar gosterdi ama dusmanin efektif cani hic inmedi`
  );
});

/** Tohumlu rastgele (dogumun irki, turu ve sapmalar): olcum her calismada ayni. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("denge: Takipci dogum hizindaki kalkanli nisanciyi bazen iskaliyor (60 tohumda en fazla 15), 30 birim/sn'de hic", () => {
  // Gorunen govde ve oncul nisansiz atis (sahibin karari, 2026-10): ates
  // konisinin kenarindan cikan atis dogum hizinda (~46 birim/sn) yuruyen
  // nisancinin govdesinin yanindan gecebiliyor. Bu tohumlarla olculen: cokgen
  // govdeyle 60'ta 11, eski daire yaricapiyla (4 birim) 0. Bu bir denge
  // olcumu, hata degil: oran 15'i gecerse (ya da 30 birim/sn'de iskalarsa) bir
  // sey Takipci'nin isabetini bozmus demek.
  const definition = towerCatalog.warrior.find((tower) => tower.id === "warrior-1");
  const random = Math.random;
  const misses = { spawn: 0, slow: 0 };
  try {
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const [key, profile] of [["spawn", SHIELDED_ENEMIES.shooter], ["slow", { ...SHIELDED_ENEMIES.shooter, speed: 30 }]]) {
        Math.random = mulberry32(seed * 7919);
        const result = simulateTowerAgainstMovingShieldedEnemy({ characterId: "warrior", definition, enemyProfile: profile });
        if (!(result.appliedDamage > 0)) misses[key] += 1;
      }
    }
  } finally {
    Math.random = random;
  }
  assert.ok(misses.spawn <= 15, `dogum hizinda ${misses.spawn} / 60 iskalama`);
  assert.equal(misses.slow, 0, "30 birim/sn'de iskalama");
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
