/**
 * Isi temposu.
 *
 * Isi vurus basina odenir: hizli atesleyen kule daha cabuk isinir, cunku isiyi
 * ureten sey atisin kendisidir. Bu modelin tek tuzagi \`focus\` tipi -- bu
 * kuleler saniyede birkac kez vurdugu icin normal bir atis isisi onlari
 * saniyeler icinde kilitler. Debug Lazer 0.2 saniyede bir ateslerken atis isisi
 * 2.5 iken alti saniyede kilitleniyordu; tipin degeri o yuzden kasitli olarak
 * cok dusuk tutuluyor. Hiza Emri de ters ucta duruyordu: atis isisi 7 iken 38
 * saniye kesintisiz ates gerektirdigi icin pratikte hicbir zaman isinmiyordu.
 *
 * Sogutma saniyede 3 derece; asagidaki her olcum buna karsi yapiliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOWER_HEAT_BY_HIT_TYPE,
  TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER,
  calculateTowerShotHeat,
  getTowerRealFireIntervalMs,
  towerCatalog
} from "../packages/shared/dist/index.js";

const COOLING_PER_SECOND = 3;

/** Kesintisiz ates sirasinda saniyede kac derece. */
function sustainedHeatPerSecond(tower, level = 1) {
  const interval = getTowerRealFireIntervalMs(tower, level) / 1000;
  return calculateTowerShotHeat(tower, 0.5) / interval;
}

function findTower(id) {
  for (const list of Object.values(towerCatalog)) {
    const tower = list.find((entry) => entry.id === id);
    if (tower) return tower;
  }
  throw new Error(`${id} bulunamadi`);
}

test("atis isisi tip ve hasar tipinden hesaplanir", () => {
  for (const characterId of ["warrior", "zeynep", "archer", "onur"]) {
    for (const tower of towerCatalog[characterId]) {
      if (!tower.engine || tower.resourceProvider) {
        continue;
      }

      const beklenen = TOWER_HEAT_BY_HIT_TYPE[tower.hitType ?? "projectile"]
        * TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER[tower.damageType ?? "physical"];

      assert.ok(
        Math.abs(calculateTowerShotHeat(tower, 0.5) - beklenen) < 1e-6,
        `${tower.id}: atis isisi ${calculateTowerShotHeat(tower, 0.5)}, beklenen ${beklenen}`
      );
    }
  }
});

test("focus atis isisi digerlerinin cok altinda", () => {
  // Bu tipin kurali budur: saniyede birkac kez vurdugu icin vurus basina az
  // isinmali. Degeri mermi ve carpma tiplerine yaklasirsa bu kuleler yeniden
  // saniyeler icinde kilitlenir.
  assert.ok(
    TOWER_HEAT_BY_HIT_TYPE.focus * 4 <= TOWER_HEAT_BY_HIT_TYPE.projectile,
    `focus ${TOWER_HEAT_BY_HIT_TYPE.focus}, mermi ${TOWER_HEAT_BY_HIT_TYPE.projectile}: fark yeterince buyuk degil`
  );
  assert.ok(TOWER_HEAT_BY_HIT_TYPE.focus < TOWER_HEAT_BY_HIT_TYPE.impact);
});

test("Hiza Emri isinir", () => {
  // Isi hizi sogutmanin altinda kalirsa kule hicbir zaman kilitlenmez ve isi
  // mekanigi o kule icin yok demektir.
  const hiza = findTower("zeynep-1");
  const perSec = sustainedHeatPerSecond(hiza);
  assert.ok(perSec > COOLING_PER_SECOND, `Hiza Emri sogutmayi asmiyor: ${perSec.toFixed(2)}/sn`);
  assert.ok(100 / (perSec - COOLING_PER_SECOND) < 30, "Hiza Emri kilitlenmesi cok uzak");
});

test("Debug Lazer birkac saniyede kilitlenmiyor", () => {
  const lazer = findTower("warrior-5");
  assert.equal(lazer.hitType, "focus");
  const net = sustainedHeatPerSecond(lazer) - COOLING_PER_SECOND;
  assert.ok(net > 0, "Debug Lazer isinmali");

  const kilitSaniye = 100 / net;
  assert.ok(kilitSaniye > 12, `Debug Lazer ${kilitSaniye.toFixed(1)} saniyede kilitleniyor, cok hizli`);
});

test("performans kadrani isi pazarligini korur", () => {
  const hiza = findTower("zeynep-1");
  const taban = calculateTowerShotHeat(hiza, 0.5);
  assert.equal(calculateTowerShotHeat(hiza, 0), 0);
  assert.ok(Math.abs(calculateTowerShotHeat(hiza, 1) - taban * 4) < 1e-9, "tam performans dort kat isitmali");
});
