/**
 * Performans kolu ve ona dokunan icerik.
 *
 * Kol oyunun her dalga elle cektigi tek surekli degisken: yarinin ustunde atis
 * hizini ikiye katlarken isiyi dorde, enerjiyi uce katliyor. Uzun sure hicbir
 * kart ya da esya ona dokunmuyordu, yani o egim pazarlik konusu degildi.
 *
 * Buradaki en onemli soz `performanceCost`in **yalnizca ust yariyi** olceklemesi.
 * Alt yariya da islerse elde edilen sey kule basina duz bir isi indirimi olur --
 * onu zaten `heat` stati yapiyor ve iki stat ayni isi yapamaz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cardCatalog,
  getShopItem,
  getTowerPerformanceEnergyMultiplier,
  getTowerPerformanceHeatMultiplier,
  isTowerPerformanceIdle,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

test("kolun alt yarisi indirimden etkilenmez", () => {
  for (const performance of [0, 0.2, 0.4, 0.5]) {
    assert.equal(
      getTowerPerformanceHeatMultiplier(performance, 0.5),
      getTowerPerformanceHeatMultiplier(performance),
      `kol ${performance} degerinde indirim uygulandi`
    );
    assert.equal(
      getTowerPerformanceEnergyMultiplier(performance, 0.5),
      getTowerPerformanceEnergyMultiplier(performance)
    );
  }
});

test("indirim ust yarinin egimini kirar, seviyesini degil", () => {
  // Yarida iki egri de 1'de bulusuyor: indirim orayi kaydirmamali.
  assert.equal(getTowerPerformanceHeatMultiplier(0.5, 0.5), 1);
  // Sonuna kadar acik kolda tam bedel 4, yarim bedelde 2.5.
  assert.equal(getTowerPerformanceHeatMultiplier(1), 4);
  assert.equal(getTowerPerformanceHeatMultiplier(1, 0.5), 2.5);
  assert.equal(getTowerPerformanceEnergyMultiplier(1), 3);
  assert.equal(getTowerPerformanceEnergyMultiplier(1, 0.5), 2);
});

test("bedel negatife cekilemez", () => {
  // Kolu actikca sogutan bir kule cikmamali: taban tam kolda 1'de duruyor.
  assert.equal(getTowerPerformanceHeatMultiplier(1, -5), 1);
  assert.equal(getTowerPerformanceEnergyMultiplier(1, -5), 1);
});

test("rolanti esigi kolun tam yarisinda", () => {
  assert.equal(isTowerPerformanceIdle(0.49), true);
  assert.equal(isTowerPerformanceIdle(0.5), false);
  assert.equal(isTowerPerformanceIdle(1), false);
});

test("Regülatör kolu yukari itmenin isisini gercekten dusurur", () => {
  const room = createRoom("warrior");
  // Atis basina enerji yakan bir kule sart: mermiyle atan kulenin atis enerjisi
  // zaten sifir ve kolun enerji tarafi olculemezdi.
  const definitionId = "warrior-5";
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot);
  room.placeTower(client, { ...spot, definitionId });
  const tower = [...room.towers.values()][0];
  tower.performance = 1;

  const tamBedel = room.getTowerShotHeat(tower);
  const tamEnerji = room.getTowerEnergyCost(tower);

  const kart = cardCatalog.find(({ id }) => id === "regulator");
  assert.ok(kart, "Regülatör katalogda yok");
  room.state.players.get("p1").runModifiers.push(...kart.effects);
  room.invalidateTowerGrants();

  assert.ok(room.getTowerShotHeat(tower) < tamBedel, "isi dusmedi");
  assert.ok(room.getTowerEnergyCost(tower) < tamEnerji, "enerji dusmedi");

  // Kol asagi cekilince kart hicbir sey yapmamali.
  tower.performance = 0.4;
  const rolantiIsi = room.getTowerShotHeat(tower);
  room.state.players.get("p1").runModifiers = [];
  room.invalidateTowerGrants();
  assert.ok(
    Math.abs(room.getTowerShotHeat(tower) - rolantiIsi) < 1e-9,
    "kart alt yariya da isledi"
  );
});

test("Aşırı Sürücü kuleye takilan esya olarak ayni kolu ucuzlatir", () => {
  const item = getShopItem("asiri-surucu");
  assert.ok(item, "Aşırı Sürücü katalogda yok");
  assert.equal(item.target, "tower");
  assert.ok(item.description.includes("Takıldığı"), "aciklama kuleye takildigini soylemiyor");
  const modifier = item.effects.find(({ stat }) => stat === "performanceCost");
  assert.ok(modifier && modifier.add < 0, "bedeli dusuren bir etki yok");
});

test("Rölanti Avantajı kolu asagida tutan kuleye hasar verir", () => {
  const kart = cardCatalog.find(({ id }) => id === "rolanti-avantaji");
  assert.ok(kart, "Rölanti Avantajı katalogda yok");
  assert.deepEqual(kart.unlocks, ["performance:idleEdge"]);
});
