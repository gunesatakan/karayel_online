import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTowerScaledBaseDamage,
  calculateTowerShotEnergy,
  calculateTowerShotHeat,
  getTowerModeDamageType,
  inferTowerAmmoType,
  TOWER_BASE_AMMO_COST,
  towerCatalog,
  getCharacterTowers,
  WALL_TOWER_ID
} from "../packages/shared/dist/index.js";

const expectedProfiles = {
  warrior: [
    ["warrior-1", "projectile", "physical", "bullet", 10, 24, 132, null],
    ["warrior-2", "impact", "electric", "bullet", 28.6, 0, 0, null],
    ["warrior-3", "aura", "none", "auraCrystal", 1, 0, 0, null],
    ["warrior-4", "impact", "psychic", "bullet", 8.8, 54, 297, null],
    ["warrior-5", "focus", "fire", "powerCrystal", 1.6, 10, 55, null],
    ["warrior-6", "impact", "electric", "bullet", 28.6, 27, 148.5, null],
    ["warrior-7", "none", "none", "auraCrystal", 0, 0, 0, "ammunition"],
    ["warrior-8", "none", "none", "auraCrystal", 0, 0, 0, "energy"]
  ],
  zeynep: [
    ["zeynep-1", "projectile", "physical", "bullet", 10, 48, 264, null],
    ["zeynep-2", "impact", "light", "powerCrystal", 24.2, 84, 462, null],
    ["zeynep-3", "impact", "none", "powerCrystal", 22, 72, 396, null],
    ["zeynep-6", "aura", "none", "auraCrystal", 1, 0, 0, null],
    ["zeynep-7", "aura", "none", "auraCrystal", 1, 0, 0, null],
    ["zeynep-8", "aura", "none", "auraCrystal", 1, 0, 0, null],
    ["zeynep-9", "none", "none", "auraCrystal", 0, 0, 0, "ammunition"],
    ["zeynep-10", "none", "none", "auraCrystal", 0, 0, 0, "energy"]
  ],
  archer: [
    ["archer-1", "projectile", "psychic", "bullet", 4, 64, 352, null],
    ["archer-2", "projectile", "light", "bullet", 11, 44, 242, null],
    ["archer-3", "curse", "cellular", "auraCrystal", 0.15, 30, 165, null],
    ["archer-4", "focus", "psychic", "powerCrystal", 0.4, 0, 0, null],
    ["archer-5", "impact", "psychic", "bullet", 8.8, 20, 110, null],
    ["archer-6", "wave", "psychic", "auraCrystal", 8, 10, 55, null],
    ["archer-7", "none", "none", "auraCrystal", 0, 0, 0, "ammunition"],
    ["archer-8", "none", "none", "auraCrystal", 0, 0, 0, "energy"]
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
    assert.deepEqual(getCharacterTowers(characterId).map(profile), expected);
  });
}

test("Atakan, Zeynep ve Melis kule kimlikleri benzersiz ve mekanik tanımları dolu", () => {
  const towers = [
    ...getCharacterTowers("warrior"),
    ...getCharacterTowers("zeynep"),
    ...getCharacterTowers("archer")
  ];
  assert.equal(towers.length, 24);
  assert.equal(new Set(towers.map((tower) => tower.id)).size, towers.length);
  for (const tower of towers) {
    assert.ok(tower.hitType, `${tower.id}: hitType eksik`);
    assert.ok(tower.damageType, `${tower.id}: damageType eksik`);
    assert.ok(tower.engine, `${tower.id}: ortak motor profili eksik`);
  }
});

test("her karakterin bir cephane ve bir enerji sağlayıcısı var", () => {
  for (const characterId of ["warrior", "zeynep", "archer"]) {
    const providers = getCharacterTowers(characterId)
      .map((tower) => tower.resourceProvider)
      .filter(Boolean)
      .sort();
    assert.deepEqual(providers, ["ammunition", "energy"]);
  }
});

test("lojistik binaları saldırı üretmeyen none vuruş türünü kullanır", () => {
  for (const towers of Object.values(towerCatalog)) {
    for (const tower of towers.filter((candidate) => candidate.resourceProvider)) {
      assert.equal(tower.hitType, "none", tower.id);
      assert.equal(tower.damage, 0, tower.id);
    }
  }
});

test("performans enerji maliyeti ara değerleri dahil karakterize edildi", () => {
  assert.equal(TOWER_BASE_AMMO_COST, 1);
  assert.equal(calculateTowerShotEnergy(0), 0);
  assert.equal(calculateTowerShotEnergy(0.25), 2.05);
  assert.equal(calculateTowerShotEnergy(0.4), 3.28);
  assert.equal(calculateTowerShotEnergy(0.5), 4.1);
  assert.ok(Math.abs(calculateTowerShotEnergy(0.6) - 5.74) < 1e-9);
  assert.equal(calculateTowerShotEnergy(0.75), 8.2);
  assert.ok(Math.abs(calculateTowerShotEnergy(1) - 12.3) < 1e-9);
});

test("ısı performans eğrisi yüzde 50'de 1x ve yüzde 100'de 4x", () => {
  const projectile = towerCatalog.warrior.find((tower) => tower.id === "warrior-1");
  assert.ok(projectile);
  const taban = calculateTowerShotHeat(projectile, 0.5);
  assert.ok(taban > 0);
  assert.equal(calculateTowerShotHeat(projectile, 0), 0);
  assert.ok(Math.abs(calculateTowerShotHeat(projectile, 1) - taban * 4) < 1e-9, "tam performans dort kat isitmali");
});

test("temel hasar seviye 1-10 aralığına sabitleniyor", () => {
  const tower = towerCatalog.zeynep.find((candidate) => candidate.id === "zeynep-1");
  assert.ok(tower);
  assert.equal(tower.fireIntervalMs, 1000);
  assert.equal(calculateTowerScaledBaseDamage(tower, 0), 48);
  assert.equal(round(calculateTowerScaledBaseDamage(tower, 10)), 264);
  assert.equal(round(calculateTowerScaledBaseDamage(tower, 99)), 264);
});

test("24 kulenin tamamı ortak motor profiline taşındı", () => {
  const towers = [...getCharacterTowers("warrior"), ...getCharacterTowers("zeynep"), ...getCharacterTowers("archer")];
  for (const tower of towers) {
    assert.ok(tower.engine, `${tower.id}: ortak motor profili eksik`);
    assert.ok(tower.engine.attack.shape, `${tower.id}: saldırı şekli eksik`);
    assert.ok(tower.engine.targeting, `${tower.id}: hedefleme modu eksik`);
    assert.ok(tower.engine.resources.ammoType, `${tower.id}: mühimmat türü eksik`);
    assert.deepEqual(tower.engine.levelScaling, [{ stat: "damage", perLevel: 0.5, source: "base" }], `${tower.id}: seviye ölçeği eksik`);
    assert.equal(typeof tower.engine.canHitAir, "boolean", `${tower.id}: hava hedefleme kuralı eksik`);
    assert.equal(inferTowerAmmoType(tower), tower.engine.resources.ammoType);
  }
});

test("motor seviye ölçekleri keystone katkılarıyla birleşir", () => {
  const base = towerCatalog.warrior.find((tower) => tower.id === "warrior-1");
  assert.ok(base);
  const withKeystone = {
    ...base,
    engine: {
      ...base.engine,
      levelScaling: [
        ...base.engine.levelScaling,
        { stat: "damage", perLevel: 0.08, source: "keystone" }
      ]
    }
  };
  assert.equal(calculateTowerScaledBaseDamage(withKeystone, 1), 24);
  assert.equal(calculateTowerScaledBaseDamage(withKeystone, 2), 37.92);
});

test("Taht Mührü kombinasyonları doğru hasar türünü seçer", () => {
  const throneSeal = towerCatalog.zeynep.find((tower) => tower.id === "zeynep-3");
  assert.ok(throneSeal);
  assert.equal(getTowerModeDamageType(throneSeal, "dual-projectile"), "physical");
  assert.equal(getTowerModeDamageType(throneSeal, "mirror-beam"), "light");
  assert.equal(getTowerModeDamageType(throneSeal, "burn-impact"), "light");
});

test("tüm karakter kuleleri seviye ölçeğini ortak motordan alır", () => {
  for (const towers of Object.values(towerCatalog)) {
    for (const tower of towers) {
      assert.ok(tower.engine?.levelScaling.length, `${tower.id}: motor seviye ölçeği eksik`);
    }
  }
});

test("Atakan, Melis ve Zeynep kule eksenleri tasarım tablosuyla eşleşir", () => {
  const expected = {
    "warrior-1": ["amplify", "dps"], "warrior-2": ["amplify", "dps"], "warrior-3": ["cc"],
    "warrior-4": ["dps"], "warrior-5": ["dps"], "warrior-6": ["dps"],
    "warrior-7": ["economy"], "warrior-8": ["economy"],
    "archer-1": ["dps", "amplify"], "archer-2": ["dps", "cc"], "archer-3": ["dps"],
    "archer-4": ["barricade", "dps"], "archer-5": ["dps"], "archer-6": ["cc", "barricade"],
    "archer-7": ["economy"], "archer-8": ["economy"],
    "zeynep-1": ["dps"], "zeynep-2": ["dps"], "zeynep-3": ["amplify", "dps"],
    "zeynep-6": ["cc"], "zeynep-7": ["amplify"], "zeynep-8": ["amplify"],
    "zeynep-9": ["economy"], "zeynep-10": ["economy"]
  };
  const towers = [...getCharacterTowers("warrior"), ...getCharacterTowers("archer"), ...getCharacterTowers("zeynep")];
  assert.deepEqual(Object.fromEntries(towers.map((tower) => [tower.id, tower.axes])), expected);

  // Duvar kimsenin kiti degil ama herkesin listesinde; ekseni ayrica sabitlenir.
  assert.deepEqual(towerCatalog.warrior.find((tower) => tower.id === WALL_TOWER_ID)?.axes, ["barricade"]);
});

test("kule tanımlarında eski mechanics etiketi bulunmuyor", () => {
  const towers = [...getCharacterTowers("warrior"), ...getCharacterTowers("zeynep"), ...getCharacterTowers("archer")];
  for (const tower of towers) {
    assert.equal(Object.hasOwn(tower, "mechanics"), false, `${tower.id}: mechanics kaldırılmadı`);
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
  const towers = Object.fromEntries([...getCharacterTowers("warrior"), ...getCharacterTowers("zeynep"), ...getCharacterTowers("archer")].map((tower) => [tower.id, tower]));
  for (const [id, profile] of Object.entries(expected)) {
    const engine = towers[id].engine;
    assert.deepEqual([engine.targeting, engine.attack.shape, engine.attack.pierceCount ?? null, engine.canHitAir], profile, id);
  }
});

test("özel saldırılar kule kimliği yerine ortak executor verisiyle yönlendirilir", () => {
  const byId = Object.fromEntries([...getCharacterTowers("warrior"), ...getCharacterTowers("zeynep"), ...getCharacterTowers("archer")].map((tower) => [tower.id, tower.engine]));
  assert.equal(byId["warrior-5"].attack.executor, "debug-laser");
  assert.equal(byId["zeynep-2"].attack.executor, "showcase-beam");
  assert.equal(byId["zeynep-3"].attack.executor, "synthesis");
  assert.equal(byId["zeynep-6"].attack.executor, "kin-wave");
  assert.equal(byId["archer-3"].attack.executor, "curse-burst");
  assert.equal(byId["archer-6"].attack.executor, "whisper-chorus");
});

test("durum, birikim, aura, tetikleyici ve yerleşim sistemleri veriyle tanımlı", () => {
  const byId = Object.fromEntries([...getCharacterTowers("warrior"), ...getCharacterTowers("zeynep"), ...getCharacterTowers("archer")].map((tower) => [tower.id, tower.engine]));
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
    stacking: "strongest",
    tickIntervalMs: 220,
    refreshDurationMultiplier: 2,
    activation: "isolated",
    multiplierPerLevel: -0.026,
    minMultiplier: 0.25
  });
  assert.equal(byId["zeynep-7"].placement.footprintSpan, 2);
  assert.equal(byId["zeynep-8"].placement.requiresEdge, true);
});
