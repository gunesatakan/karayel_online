/**
 * Stres tarafinin bedeli var, odulu yok.
 *
 * Onay/stres bir tercih olmali: onay kule etkilerini iyilestirir, stres ise
 * evrimin para birimidir. Stres tarafina kule buff'i eklemek bu tercihi bozar --
 * stres biriktirmek kendi basina karli hale gelir ve mekanik tek yonlu bir
 * kaydiraga doner. Testler stres bolgesinin hicbir kuleye avantaj vermedigini,
 * ama bedellerini korudugunu sabitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { towerCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

/** Melis kulesi kurup ruh halini istenen bolgeye getirir. */
function melisTower(definitionId, zone) {
  const room = createRoom("archer");
  const definition = towerCatalog.archer.find((tower) => tower.id === definitionId);
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer bulunamadi`);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId });

  const player = room.state.players.get("p1");
  player.characterId = "archer";
  if (zone === "stress") {
    player.approval = 4;
    player.stress = 12;
  } else if (zone === "approval") {
    player.approval = 12;
    player.stress = 4;
  } else {
    player.approval = 6;
    player.stress = 6;
  }

  const tower = [...room.towers.values()].find((entry) => entry.definition.id === definitionId);
  assert.ok(tower, `${definitionId} kurulamadi`);
  return { room, tower, player };
}

const ZONES = ["approval", "balanced", "stress"];

test("lanet alani ruh halinden etkilenmez", () => {
  const radii = ZONES.map((zone) => {
    const { room, tower } = melisTower("archer-3", zone);
    return room.getMelisCurseAreaRadius(tower);
  });

  assert.equal(new Set(radii).size, 1, `lanet alani bolgeye gore degisiyor: ${radii.join(", ")}`);
});

test("kirik ayna biriktirme orani ruh halinden etkilenmez", () => {
  const ratios = ZONES.map((zone) => {
    const { room, tower } = melisTower("archer-5", zone);
    return room.getMelisBrokenMirrorStoreRatio(tower);
  });

  assert.equal(new Set(ratios).size, 1, `biriktirme orani bolgeye gore degisiyor: ${ratios.join(", ")}`);
});

test("supheyi tetikleyen yigin sayisi ruh halinden etkilenmez", () => {
  for (const zone of ZONES) {
    const { room, tower } = melisTower("archer-6", zone);
    room.spawnEnemy();
    const enemy = [...room.enemies.values()][0];
    enemy.maxHp = 1_000_000;
    enemy.hp = enemy.maxHp;

    let now = 10_000;
    room.applyMelisDoubt(tower, enemy, now);
    room.applyMelisDoubt(tower, enemy, now);
    assert.equal(
      enemy.melisDoubtHesitateUntil,
      0,
      `${zone}: suphe iki yiginda patladi, uc yigin beklenirdi`
    );

    room.applyMelisDoubt(tower, enemy, now);
    assert.ok(enemy.melisDoubtHesitateUntil > 0, `${zone}: suphe uc yiginda patlamadi`);
  }
});

test("lanet suresi streste kisalir", () => {
  const stress = melisTower("archer-3", "stress");
  const balanced = melisTower("archer-3", "balanced");
  const approval = melisTower("archer-3", "approval");

  const stressMs = stress.room.getMelisCurseDurationMs(stress.tower);
  const balancedMs = balanced.room.getMelisCurseDurationMs(balanced.tower);
  const approvalMs = approval.room.getMelisCurseDurationMs(approval.tower);

  assert.ok(stressMs < balancedMs, "stres laneti kisaltmiyor");
  assert.ok(approvalMs > balancedMs, "onay laneti uzatmiyor");
});

test("olum patlamasi yalnizca stres disinda cikar", () => {
  // Kirik Ayna oldurdugunde cevreye patlama sacar; streste bu sonuyor. Bedel
  // duruyor mu diye ayni senaryoyu iki bolgede birden calistiriyoruz.
  const olcum = (zone) => {
    const { room, tower } = melisTower("archer-5", zone);
    let burst = 0;
    room.triggerMelisBrokenMirrorDeathBurst = () => { burst += 1; };

    room.spawnEnemy();
    const enemy = [...room.enemies.values()][0];
    enemy.maxHp = 1;
    enemy.hp = 1;
    enemy.shield = 0;
    enemy.armor = 0;
    tower.melisMirrorCharge = 100_000;
    room.enemySpatialGrid.rebuild(room.enemies.values());

    const fired = room.fireMelisBrokenMirrorExplosion(tower, enemy);
    return { fired, burst, alive: room.enemies.has(enemy.id) };
  };

  const dengeli = olcum("balanced");
  assert.equal(dengeli.fired, true, "patlama hic calismadi");
  assert.equal(dengeli.alive, false, "hedef olmedi, olcum anlamsiz");
  assert.equal(dengeli.burst, 1, "dengede olum patlamasi cikmadi");

  const stresli = olcum("stress");
  assert.equal(stresli.fired, true, "streste patlama calismadi");
  assert.equal(stresli.alive, false, "streste hedef olmedi, olcum anlamsiz");
  assert.equal(stresli.burst, 0, "streste olum patlamasi cikti");
});

test("parlama streste dost kuleleri durdurur", () => {
  const { room, tower } = melisTower("archer-2", "stress");
  const komsuId = towerCatalog.archer.find((entry) => entry.id === "archer-1").id;
  const spot = findBuildableSpot(room, komsuId);
  room.placeTower({ sessionId: "p1" }, { ...spot, definitionId: komsuId });
  const komsu = [...room.towers.values()].find((entry) => entry.definition.id === komsuId);
  assert.ok(komsu, "komsu kule kurulamadi");
  komsu.x = tower.x;
  komsu.y = tower.y;

  const now = Date.now();
  room.pauseFriendlyTowersInMelisParlamaArea(tower, now);

  assert.ok(komsu.offlineUntil > now, "streste dost kule durdurulmadi");
});
