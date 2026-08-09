import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTowerAmmoCost,
  calculateTowerOperatingEnergy,
  calculateTowerShotEnergyCost,
  deriveTowerResources,
  ENERGY_LOGISTICS_WORKER_CAPACITY,
  getTowerEnergyState,
  getTowerShotFuelModifierMultiplier,
  cardCatalog,
  shouldConsumeTowerOperatingEnergy,
  towerCatalog
} from "../packages/shared/dist/index.js";

const tower = (id) => Object.values(towerCatalog).flat().find((definition) => definition.id === id);

test("focus ve aura enerji, diğer vuruş türleri mühimmat yakar", () => {
  for (const definition of Object.values(towerCatalog).flat()) {
    const expected = definition.hitType === "focus" || definition.hitType === "aura" ? "energy" : "ammo";
    assert.equal(definition.engine.resources.shotFuel, expected, definition.id);
  }
});

test("enerji lojistiği de standart işçi kapasitesini kullanır", () => {
  assert.equal(ENERGY_LOGISTICS_WORKER_CAPACITY, 12);
});

test("enerji kesintisi atış, takip ve aura sırasıyla ilerler", () => {
  assert.equal(getTowerEnergyState(0, 1_000, 1_100), "fire-off");
  assert.equal(getTowerEnergyState(0, 1_000, 2_100), "tracking-off");
  assert.equal(getTowerEnergyState(0, 1_000, 3_100), "offline");
  assert.equal(getTowerEnergyState(1, 1_000, 9_000), "powered");
});

test("açık kaynak profili türetilen yakıtı override eder", () => {
  const resources = deriveTowerResources({ hitType: "focus", fireIntervalMs: 700 }, { shotFuel: "ammo", operatingEnergyPerSecond: 2 });
  assert.equal(resources.shotFuel, "ammo");
  assert.equal(resources.operatingEnergyPerSecond, 2);
});

test("kullanılmayan atış yakıtının maliyeti sıfırdır", () => {
  assert.equal(calculateTowerAmmoCost(tower("warrior-5")), 0);
  assert.equal(calculateTowerShotEnergyCost(tower("warrior-4"), 0.5), 0);
});

test("enerji ve mühimmat tüketim bantları tasarım değerlerine yakındır", () => {
  const debug = tower("warrior-5");
  const kin = tower("zeynep-6");
  const hiza = tower("zeynep-1");
  assert.ok(Math.abs(calculateTowerShotEnergyCost(debug, 0.5) / (debug.fireIntervalMs / 1000) + debug.engine.resources.operatingEnergyPerSecond - 9.87) < 0.2);
  assert.ok(Math.abs(calculateTowerShotEnergyCost(kin, 0.5) / (kin.fireIntervalMs / 1000) + kin.engine.resources.operatingEnergyPerSecond - 5.15) < 0.3);
  assert.ok(Math.abs(calculateTowerAmmoCost(hiza) / (hiza.fireIntervalMs / 1000) - 1.73) < 0.15);
});

test("pasif aura çalışırken enerji harcar, lojistik binası harcamaz", () => {
  assert.equal(calculateTowerOperatingEnergy(tower("zeynep-7"), 10), 12);
  assert.equal(calculateTowerOperatingEnergy(tower("zeynep-10"), 10), 0);
});

test("çalışma enerjisi yalnız aktif dalgada tüketilir", () => {
  const combatTower = tower("warrior-1");
  const provider = tower("warrior-8");
  assert.equal(shouldConsumeTowerOperatingEnergy(combatTower, true, false), false);
  assert.equal(shouldConsumeTowerOperatingEnergy(combatTower, false, false), true);
  assert.equal(shouldConsumeTowerOperatingEnergy(combatTower, false, true), false);
  assert.equal(shouldConsumeTowerOperatingEnergy(provider, false, false), false);
});

test("shotFuelCost mühimmat ve enerji atış maliyetlerini etkiler", () => {
  const modifier = [{ source: "test", scope: "tower", stat: "shotFuelCost", add: -0.3 }];
  const multiplier = getTowerShotFuelModifierMultiplier(modifier, "ammoCost");
  assert.equal(multiplier, 0.7);
  assert.equal(calculateTowerAmmoCost(tower("zeynep-1"), multiplier), calculateTowerAmmoCost(tower("zeynep-1")) * 0.7);
  assert.equal(calculateTowerShotEnergyCost(tower("warrior-5"), 0.5, multiplier), calculateTowerShotEnergyCost(tower("warrior-5"), 0.5) * 0.7);
});

test("shotFuelCost spesifik maliyetle toplamsal birleşir ve çalışma enerjisini etkilemez", () => {
  const modifiers = [
    { source: "generic", scope: "tower", stat: "shotFuelCost", add: -0.3 },
    { source: "specific", scope: "tower", stat: "ammoCost", add: -0.4 }
  ];
  assert.ok(Math.abs(getTowerShotFuelModifierMultiplier(modifiers, "ammoCost") - 0.3) < 1e-9);
  assert.equal(getTowerShotFuelModifierMultiplier(modifiers, "energyCost"), 0.7);
  assert.equal(calculateTowerOperatingEnergy(tower("warrior-1"), 1, 1), tower("warrior-1").engine.resources.operatingEnergyPerSecond);
});

test("seri-atis Debug Lazer atış enerjisine yüzde 35 ceza uygular", () => {
  const card = cardCatalog.find((candidate) => candidate.id === "seri-atis");
  const multiplier = getTowerShotFuelModifierMultiplier(card.effects, "energyCost");
  assert.equal(multiplier, 1.35);
  assert.equal(card.effects.some((effect) => effect.stat === "shotFuelCost"), true);
});
