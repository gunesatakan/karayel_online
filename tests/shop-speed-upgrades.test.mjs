import assert from "node:assert/strict";
import test from "node:test";
import { shopCatalog } from "../packages/shared/dist/index.js";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";

const effectFor = (id) => {
  const item = shopCatalog.find((candidate) => candidate.id === id);
  assert.ok(item);
  assert.ok(item.price <= 65);
  assert.equal(item.repeatable, true);
  return item.effects[0];
};

test("yeni ekonomik mağaza geliştirmeleri ortak modifier verisi taşır", () => {
  assert.equal(effectFor("sogutucu-kanatlar").stat, "cooling");
  assert.equal(effectFor("madenci-eldiveni").stat, "workerGatherSpeed");
  assert.equal(effectFor("seri-cephane-hatti").stat, "ammoProduction");
  assert.equal(effectFor("isci-botlari").stat, "workerSpeed");
});

test("namlu geliştirmeleri tek seferlik ve güçlü kalır", () => {
  // Ucuz ve tekrarlanabilir kucuk kademeler (hassas-servo, ince-ayar,
  // balistik-itici) buyuk kardeslerinin kopyasiydi; katalogdan cikarildilar.
  const strongFor = (id) => shopCatalog.find((candidate) => candidate.id === id);
  assert.equal(strongFor("namlu-yatagi").effects[0].stat, "turnRate");
  assert.equal(strongFor("nisangah").effects[0].stat, "accuracy");
  assert.equal(strongFor("hafif-muhimmat").effects[0].stat, "projectileSpeed");
  assert.equal(shopCatalog.filter((item) => item.id === "hassas-servo").length, 0);
});

/**
 * Isci esyalari artik oyuncuya degil bir ekonomi binasina takiliyor, o yuzden
 * kazanci yalnizca o binaya hizmet eden isci aliyor. Testler de modifierlari
 * kulenin uzerine koyar.
 */
function makeWorkerRoom(towerModifiers) {
  const room = new MatchRoom();
  room.state = { players: new Map([["p1", { runModifiers: [] }]]) };
  room.towers = new Map([["reactor", { id: "reactor", ownerId: "p1", hp: 100, runModifiers: towerModifiers }]]);
  return room;
}

test("işçi hız geliştirmeleri hizmet ettiği binadan gelir", () => {
  const baseRoom = makeWorkerRoom([]);
  const fastRoom = makeWorkerRoom([effectFor("isci-botlari"), effectFor("madenci-eldiveni")]);
  const baseWorker = { ownerId: "p1", x: 0, y: 0, speed: 10, targetTowerId: "reactor" };
  const fastWorker = { ownerId: "p1", x: 0, y: 0, speed: 10, targetTowerId: "reactor" };

  baseRoom.moveLogisticsWorker(baseWorker, 1000, 0, 1);
  fastRoom.moveLogisticsWorker(fastWorker, 1000, 0, 1);

  assert.ok(fastWorker.x > baseWorker.x);
  assert.equal(fastRoom.getWorkerGatherSpeedMultiplier(fastWorker), 1.2);
});

test("başka binaya bağlı işçi o binanın eşyasından yararlanmaz", () => {
  const room = makeWorkerRoom([effectFor("madenci-eldiveni")]);
  const unboundWorker = { ownerId: "p1", x: 0, y: 0, speed: 10, targetTowerId: "" };
  assert.equal(room.getWorkerGatherSpeedMultiplier(unboundWorker), 1);
});

test("seri cephane hattı takıldığı fabrikanın üretimini hızlandırır", () => {
  const makeRoom = (towerModifiers) => {
    const room = new MatchRoom();
    room.state = { players: new Map([["p1", { runModifiers: [] }]]) };
    const tower = {
      ownerId: "p1",
      hp: 100,
      definition: { resourceProvider: "ammunition" },
      energy: 100,
      rawAmmo: 100,
      ammo: 0,
      maxAmmo: 100,
      runModifiers: towerModifiers
    };
    room.towers = new Map([["factory", tower]]);
    room.updateResourceFactories(1);
    return tower.ammo;
  };

  assert.ok(makeRoom([effectFor("seri-cephane-hatti")]) > makeRoom([]));
});
