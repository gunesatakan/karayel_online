import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTowerScaledBaseDamage,
  calculateTowerShotEnergy,
  calculateTowerShotHeat,
  inferTowerAmmoType,
  TOWER_BASE_AMMO_COST,
  towerCatalog
} from "../packages/shared/dist/index.js";

const expectedProfiles = {
  warrior: [
    ["warrior-1", "projectile", "physical", "bullet", 7, 24, 114.72, null],
    ["warrior-2", "impact", "electric", "bullet", 28.6, 0, 0, null],
    ["warrior-3", "aura", "none", "auraCrystal", 1, 0, 0, null],
    ["warrior-4", "impact", "psychic", "bullet", 8.8, 36, 172.08, null],
    ["warrior-5", "focus", "fire", "powerCrystal", 4, 10, 47.8, null],
    ["warrior-6", "impact", "electric", "bullet", 28.6, 27, 129.06, null],
    ["warrior-7", "aura", "none", "auraCrystal", 1, 0, 0, "ammunition"],
    ["warrior-8", "aura", "none", "auraCrystal", 1, 0, 0, "energy"]
  ],
  zeynep: [
    ["zeynep-1", "projectile", "physical", "bullet", 7, 48, 229.44, null],
    ["zeynep-2", "impact", "light", "powerCrystal", 24.2, 84, 401.52, null],
    ["zeynep-3", "impact", "none", "powerCrystal", 22, 60, 286.8, null],
    ["zeynep-6", "aura", "none", "auraCrystal", 1, 0, 0, null],
    ["zeynep-7", "aura", "none", "auraCrystal", 1, 0, 0, null],
    ["zeynep-8", "aura", "none", "auraCrystal", 1, 0, 0, null],
    ["zeynep-9", "aura", "none", "auraCrystal", 1, 0, 0, "ammunition"],
    ["zeynep-10", "aura", "none", "auraCrystal", 1, 0, 0, "energy"]
  ],
  archer: [
    ["archer-1", "projectile", "psychic", "bullet", 2.8, 64, 305.92, null],
    ["archer-2", "projectile", "psychic", "bullet", 2.8, 44, 210.32, null],
    ["archer-3", "curse", "psychic", "auraCrystal", 0.2, 30, 143.4, null],
    ["archer-4", "focus", "psychic", "powerCrystal", 1, 0, 0, null],
    ["archer-5", "impact", "psychic", "bullet", 8.8, 20, 95.6, null],
    ["archer-6", "wave", "psychic", "auraCrystal", 8, 10, 47.8, null],
    ["archer-7", "aura", "none", "auraCrystal", 1, 0, 0, "ammunition"],
    ["archer-8", "aura", "none", "auraCrystal", 1, 0, 0, "energy"]
  ]
};

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function profile(tower) {
  return [
    tower.id,
    tower.hitType,
    tower.damageType,
    inferTowerAmmoType(tower),
    round(calculateTowerShotHeat(tower, 0.5)),
    round(calculateTowerScaledBaseDamage(tower, 1)),
    round(calculateTowerScaledBaseDamage(tower, 10)),
    tower.resourceProvider ?? null
  ];
}

for (const [characterId, expected] of Object.entries(expectedProfiles)) {
  test(`${characterId} kulelerinin davranış profili değişmedi`, () => {
    assert.deepEqual(towerCatalog[characterId].map(profile), expected);
  });
}

test("Atakan, Zeynep ve Melis kule kimlikleri benzersiz ve mekanik tanımları dolu", () => {
  const towers = [
    ...towerCatalog.warrior,
    ...towerCatalog.zeynep,
    ...towerCatalog.archer
  ];
  assert.equal(towers.length, 24);
  assert.equal(new Set(towers.map((tower) => tower.id)).size, towers.length);
  for (const tower of towers) {
    assert.ok(tower.hitType, `${tower.id}: hitType eksik`);
    assert.ok(tower.damageType, `${tower.id}: damageType eksik`);
    assert.ok(tower.mechanics?.length, `${tower.id}: mechanics eksik`);
  }
});

test("her karakterin bir cephane ve bir enerji sağlayıcısı var", () => {
  for (const characterId of ["warrior", "zeynep", "archer"]) {
    const providers = towerCatalog[characterId]
      .map((tower) => tower.resourceProvider)
      .filter(Boolean)
      .sort();
    assert.deepEqual(providers, ["ammunition", "energy"]);
  }
});

test("performans enerji maliyeti ara değerleri dahil karakterize edildi", () => {
  assert.equal(TOWER_BASE_AMMO_COST, 1);
  assert.equal(calculateTowerShotEnergy(0), 0);
  assert.equal(calculateTowerShotEnergy(0.25), 2);
  assert.equal(calculateTowerShotEnergy(0.4), 3.2);
  assert.equal(calculateTowerShotEnergy(0.5), 4);
  assert.equal(calculateTowerShotEnergy(0.6), 5.6);
  assert.equal(calculateTowerShotEnergy(0.75), 8);
  assert.equal(calculateTowerShotEnergy(1), 12);
});

test("ısı performans eğrisi yüzde 50'de 1x ve yüzde 100'de 4x", () => {
  const projectile = towerCatalog.warrior.find((tower) => tower.id === "warrior-1");
  assert.ok(projectile);
  assert.equal(calculateTowerShotHeat(projectile, 0), 0);
  assert.equal(calculateTowerShotHeat(projectile, 0.5), 7);
  assert.equal(calculateTowerShotHeat(projectile, 1), 28);
});

test("temel hasar seviye 1-10 aralığına sabitleniyor", () => {
  const tower = towerCatalog.zeynep.find((candidate) => candidate.id === "zeynep-1");
  assert.ok(tower);
  assert.equal(calculateTowerScaledBaseDamage(tower, 0), 48);
  assert.equal(round(calculateTowerScaledBaseDamage(tower, 10)), 229.44);
  assert.equal(round(calculateTowerScaledBaseDamage(tower, 99)), 229.44);
});

test("24 kulenin tamamı ortak motor profiline taşındı", () => {
  const towers = [...towerCatalog.warrior, ...towerCatalog.zeynep, ...towerCatalog.archer];
  for (const tower of towers) {
    assert.ok(tower.engine, `${tower.id}: ortak motor profili eksik`);
    assert.ok(tower.engine.attack.shape, `${tower.id}: saldırı şekli eksik`);
    assert.ok(tower.engine.targeting, `${tower.id}: hedefleme modu eksik`);
    assert.ok(tower.engine.resources.ammoType, `${tower.id}: mühimmat türü eksik`);
    assert.equal(typeof tower.engine.canHitAir, "boolean", `${tower.id}: hava hedefleme kuralı eksik`);
    assert.equal(inferTowerAmmoType(tower), tower.engine.resources.ammoType);
  }
});

test("ortak motor hedefleme ve saldırı profilleri kule davranışlarını koruyor", () => {
  const expected = {
    "warrior-4": ["strongest", "single", 1, true],
    "warrior-5": ["marked", "beam", null, false],
    "zeynep-1": ["first", "line", 2, true],
    "zeynep-6": ["first", "cone", null, true],
    "archer-3": ["first", "circle", null, false],
    "archer-4": ["first", "beam", null, true]
  };
  const towers = Object.fromEntries([...towerCatalog.warrior, ...towerCatalog.zeynep, ...towerCatalog.archer].map((tower) => [tower.id, tower]));
  for (const [id, profile] of Object.entries(expected)) {
    const engine = towers[id].engine;
    assert.deepEqual([engine.targeting, engine.attack.shape, engine.attack.pierceCount ?? null, engine.canHitAir], profile, id);
  }
});

test("durum, birikim, aura, tetikleyici ve yerleşim sistemleri veriyle tanımlı", () => {
  const byId = Object.fromEntries([...towerCatalog.warrior, ...towerCatalog.zeynep, ...towerCatalog.archer].map((tower) => [tower.id, tower.engine]));
  assert.equal(byId["warrior-3"].statusEffects[0].type, "slow");
  assert.equal(byId["warrior-4"].stacks[0].trigger, "sameTarget");
  assert.equal(byId["warrior-1"].appliesMark.id, "tracking");
  assert.equal(byId["zeynep-8"].placement.requiresEdge, true);
  assert.equal(byId["zeynep-7"].auras[0].stat, "synthesis");
  assert.equal(byId["archer-2"].triggers[0].event, "escape");
  assert.equal(byId["archer-6"].statusEffects[1].type, "stun");
  assert.deepEqual(byId["warrior-4"].stacks[0], {
    id: "obsession",
    trigger: "sameTarget",
    stat: "damage",
    perStack: 0.2,
    max: 10,
    resetOn: "targetChange"
  });
  assert.equal(byId["warrior-6"].stacks[0].trigger, "activeSecond");
  assert.equal(byId["archer-3"].stacks[0].stat, "storedDamage");
  assert.equal(byId["archer-5"].stacks[0].id, "mirror-storage");
  assert.deepEqual(byId["archer-5"].targetingByState, {
    approval: "first",
    stress: "random",
    balanced: "strongest"
  });
  assert.equal(byId["archer-6"].stacks[0].max, 3);
  assert.deepEqual(byId["warrior-5"].triggers[1], {
    event: "kill",
    effect: "marked-overdrive",
    condition: "targetMarked"
  });
  assert.equal(byId["archer-2"].triggers.some((trigger) => trigger.event === "escape"), true);
  assert.equal(byId["archer-3"].triggers[0].effect, "death-burst");
  assert.deepEqual(byId["warrior-3"].auras[0], {
    affects: "enemies",
    shape: "circle",
    radius: 104,
    stat: "slow",
    multiplier: 0.48,
    stacking: "strongest"
  });
  assert.equal(byId["zeynep-7"].placement.footprintSpan, 2);
  assert.equal(byId["zeynep-8"].placement.requiresEdge, true);
});
