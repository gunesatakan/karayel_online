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
  assert.equal(effectFor("hassas-servo").stat, "turnRate");
  assert.equal(effectFor("balistik-itici").stat, "projectileSpeed");
  assert.equal(effectFor("ince-ayar").stat, "accuracy");
});

test("işçi hız geliştirmeleri hareket ve kaynak çıkarma hızına uygulanır", () => {
  const baseRoom = new MatchRoom();
  baseRoom.state = { players: new Map([["p1", { runModifiers: [] }]]) };
  const fastRoom = new MatchRoom();
  fastRoom.state = { players: new Map([["p1", { runModifiers: [effectFor("isci-botlari"), effectFor("madenci-eldiveni")] }]]) };
  const baseWorker = { ownerId: "p1", x: 0, y: 0, speed: 10 };
  const fastWorker = { ownerId: "p1", x: 0, y: 0, speed: 10 };

  baseRoom.moveLogisticsWorker(baseWorker, 1000, 0, 1);
  fastRoom.moveLogisticsWorker(fastWorker, 1000, 0, 1);

  assert.ok(fastWorker.x > baseWorker.x);
  assert.equal(fastRoom.getWorkerGatherSpeedMultiplier(fastWorker), 1.2);
});

test("seri cephane hattı fabrikanın gerçek üretimini hızlandırır", () => {
  const makeRoom = (runModifiers) => {
    const room = new MatchRoom();
    room.state = { players: new Map([["p1", { runModifiers }]]) };
    const tower = {
      ownerId: "p1",
      hp: 100,
      definition: { resourceProvider: "ammunition" },
      energy: 100,
      rawAmmo: 100,
      ammo: 0,
      maxAmmo: 100,
      runModifiers: []
    };
    room.towers = new Map([["factory", tower]]);
    room.updateResourceFactories(1);
    return tower.ammo;
  };

  assert.ok(makeRoom([effectFor("seri-cephane-hatti")]) > makeRoom([]));
});
