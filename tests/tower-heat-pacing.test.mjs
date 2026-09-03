/**
 * Isi temposu.
 *
 * Isi eskiden atis basina sabitti, yani bir kulenin saniyede ne kadar isindigi
 * tamamen atis araligina bagliydi. Sonuc tip icinde bile tutarsizdi: ayni
 * \`focus\` tipindeki Debug Lazer 0.2 saniyede bir atesledigi icin 6 saniyede
 * kilitleniyor, Oluler Bagi 1.7 saniyede bir atesledigi icin hic isinmiyordu.
 * Hiza Emri de 38 saniye kesintisiz ates gerektirdigi icin pratikte hicbir
 * zaman isinmiyordu.
 *
 * Artik isi hizi tipin ozelligi: kule ne kadar hizli aterse atesin, saniyede
 * ayni kadar isinir. Testler bunu ve bildirilen iki uc durumu sabitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER,
  TOWER_HEAT_PER_SECOND_BY_HIT_TYPE,
  calculateTowerShotHeat,
  getTowerRealFireIntervalMs,
  towerCatalog
} from "../packages/shared/dist/index.js";

/** Kesintisiz ates sirasinda saniyede kac derece. */
function sustainedHeatPerSecond(tower, level = 1) {
  const interval = getTowerRealFireIntervalMs(tower, level);
  return calculateTowerShotHeat(tower, 0.5, 1, interval) / (interval / 1000);
}

function findTower(id) {
  for (const list of Object.values(towerCatalog)) {
    const tower = list.find((entry) => entry.id === id);
    if (tower) return tower;
  }
  throw new Error(`${id} bulunamadi`);
}

test("isi hizi tipten gelir, atis hizindan degil", () => {
  for (const characterId of ["warrior", "zeynep", "archer", "onur"]) {
    for (const tower of towerCatalog[characterId]) {
      if (!tower.engine || tower.hitType === "none" || tower.resourceProvider) {
        continue;
      }

      // Yazilmamis alanlar icin hesap da ayni varsayilanlara duser.
      const beklenen = TOWER_HEAT_PER_SECOND_BY_HIT_TYPE[tower.hitType ?? "projectile"]
        * TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER[tower.damageType ?? "physical"];

      for (const level of [1, 5, 10]) {
        const olculen = sustainedHeatPerSecond(tower, level);
        assert.ok(
          Math.abs(olculen - beklenen) < 1e-6,
          `${tower.id} sv${level}: isi hizi ${olculen.toFixed(2)}, beklenen ${beklenen.toFixed(2)}`
        );
      }
    }
  }
});

test("ayni tipteki kuleler ayni tabandan olculur", () => {
  // Bildirilen sikayet buydu: iki \`focus\` kule arasindaki fark atis hizindan
  // geliyordu. Artik yalnizca hasar tipinden gelebilir.
  const lazer = findTower("warrior-5");
  const bag = findTower("archer-4");
  assert.equal(lazer.hitType, "focus");
  assert.equal(bag.hitType, "focus");

  const taban = (tower) => sustainedHeatPerSecond(tower) / TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER[tower.damageType ?? "physical"];
  assert.ok(
    Math.abs(taban(lazer) - taban(bag)) < 1e-6,
    `focus tabani ayrisiyor: ${taban(lazer).toFixed(2)} vs ${taban(bag).toFixed(2)}`
  );
});

test("Hiza Emri isinir", () => {
  // Sogutma saniyede 3 derece. Isi hizi bunun altinda kalirsa kule hicbir zaman
  // kilitlenmez ve isi mekanigi o kule icin yok demektir.
  const hiza = findTower("zeynep-1");
  assert.ok(
    sustainedHeatPerSecond(hiza) > 3,
    `Hiza Emri sogutmayi asmiyor: ${sustainedHeatPerSecond(hiza).toFixed(2)}/sn`
  );
});

test("Debug Lazer artik birkac saniyede kilitlenmiyor", () => {
  const lazer = findTower("warrior-5");
  const net = sustainedHeatPerSecond(lazer) - 3;
  assert.ok(net > 0, "Debug Lazer isinmali");

  const kilitSaniye = 100 / net;
  assert.ok(kilitSaniye > 7, `Debug Lazer ${kilitSaniye.toFixed(1)} saniyede kilitleniyor, cok hizli`);
  // En sicak kule olmasi dogru -- hizli atesleyen bir lazer -- ama uc noktada degil.
  assert.ok(kilitSaniye < 20, `Debug Lazer ${kilitSaniye.toFixed(1)} saniyede kilitleniyor, isi anlamsizlasmis`);
});

test("performans kadrani isi pazarligini korur", () => {
  const hiza = findTower("zeynep-1");
  const taban = calculateTowerShotHeat(hiza, 0.5);
  assert.equal(calculateTowerShotHeat(hiza, 0), 0);
  assert.ok(Math.abs(calculateTowerShotHeat(hiza, 1) - taban * 4) < 1e-9, "tam performans dort kat isitmali");
});
