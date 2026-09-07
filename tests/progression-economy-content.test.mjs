/**
 * Her turda cekilen ama uzun sure icerige kapali kalan bes kol.
 *
 * Tecrube kazanci sabitti, onarim ve isci fiyati sabitti, satis hep yarisini
 * geri veriyordu ve ultinin gucu yalnizca altinla buyuyordu -- sarj hizinin bir
 * karsiligi vardi, gucun yoktu. Bes kol da oyunun her turunda cekiliyor, yani
 * roguelike katmaninin en cok konusmasi gereken yerlerdi.
 *
 * Testler sayinin dogru olmasindan cok **kolun gercekten baglandigini** tutuyor:
 * her biri sunucunun o degeri okudugu yerden geciyor, tanimdan degil.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cardCatalog,
  getStructureRepairCost,
  getTowerBuildCost,
  getTowerSellRefund,
  getWorkerHireCost,
  shopCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const mod = (stat, add) => ({ source: "test", scope: "player", stat, add });

function odaVeKule(definitionId = "warrior-1") {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot);
  room.placeTower(client, { ...spot, definitionId });
  return { room, tower: [...room.towers.values()][0], player: room.state.players.get("p1") };
}

test("tecrube kazanci oyuncu basina olceklenir", () => {
  const { room, player } = odaVeKule();
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];

  player.experience = 0;
  room.awardEnemyExperience(enemy);
  const cip = player.experience;
  assert.ok(cip > 0, "temel tecrube sifir geldi");

  player.experience = 0;
  player.runModifiers = [mod("experienceGain", 1)];
  room.awardEnemyExperience(enemy);
  assert.ok(Math.abs(player.experience - cip * 2) < 1e-9, `kazanc olceklenmedi: ${player.experience}`);
});

test("onarim bedeli icerige bagli", () => {
  const { room, tower, player } = odaVeKule();
  tower.hp = tower.maxHp * 0.5;
  player.gold = 1_000_000;

  const tam = Math.ceil(getStructureRepairCost(getTowerBuildCost(tower.definition.cost), 0.5));
  const oncekiAltin = player.gold;
  room.repairStructure(client, { towerId: tower.id });
  assert.equal(oncekiAltin - player.gold, tam);

  tower.hp = tower.maxHp * 0.5;
  player.runModifiers = [mod("repairCost", -0.5)];
  room.invalidateTowerGrants();
  const ikinciOncesi = player.gold;
  room.repairStructure(client, { towerId: tower.id });
  const indirimli = ikinciOncesi - player.gold;
  assert.ok(indirimli < tam, `onarim ucuzlamadi: ${indirimli} / ${tam}`);
});

test("satis iadesi icerige bagli", () => {
  const { room, tower, player } = odaVeKule();
  const tam = getTowerSellRefund(tower.definition.cost, tower.level, tower.definition.id);
  player.runModifiers = [mod("sellRefund", 0.5)];
  room.invalidateTowerGrants();

  const oncekiAltin = player.gold;
  room.sellTower(client, { towerId: tower.id });
  assert.ok(player.gold - oncekiAltin > tam, `iade artmadi: ${player.gold - oncekiAltin} / ${tam}`);
});

test("isci alim bedeli icerige bagli", () => {
  const { room, player } = odaVeKule();
  player.gold = 1_000_000;
  const tam = getWorkerHireCost(player.hiredWorkers.length);

  player.runModifiers = [mod("workerHireCost", -0.5)];
  const oncekiAltin = player.gold;
  room.hireWorker(client, { role: "crystalCollector" });
  const odenen = oncekiAltin - player.gold;
  assert.ok(odenen > 0 && odenen < tam, `isci ucuzlamadi: ${odenen} / ${tam}`);
});

test("ulti hasar carpani icerige bagli", () => {
  const { room, player } = odaVeKule();
  const cip = room.getUltimatePowerMultiplierFor("p1");
  player.runModifiers = [mod("ultimateDamage", 0.5)];
  assert.ok(
    Math.abs(room.getUltimatePowerMultiplierFor("p1") - cip * 1.5) < 1e-9,
    "ulti hasari olceklenmedi"
  );
});

test("bes kolun da bir karti var", () => {
  const statlar = ["experienceGain", "repairCost", "sellRefund", "workerHireCost", "ultimateDamage"];
  for (const stat of statlar) {
    const kart = cardCatalog.find((card) => card.effects.some((modifier) => modifier.stat === stat));
    assert.ok(kart, `${stat} icin kart yok`);
  }
});

test("tecrube ve onarim kule basina da alinabiliyor", () => {
  for (const id of ["egitim-sahasi", "kaynak-makinesi"]) {
    const item = shopCatalog.find((entry) => entry.id === id);
    assert.ok(item, `${id} katalogda yok`);
    assert.equal(item.target, "tower");
    assert.ok(item.description.includes("Takıldığı"), `${id} kuleye takildigini soylemiyor`);
  }
});
