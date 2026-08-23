/**
 * Isci alimi.
 *
 * Her oyuncu dort temel isciyle basliyor: her rolden bir tane. Satin alinan isci
 * bunlarin uzerine biner ve rolu alim aninda secilir. Testler uc seyi sabitliyor
 * -- bedelin her alimda buyudugu, sayida ust sinir olmadigi, ve ayni rolu iki
 * kez almanin iki ayri isci dogurdugu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  HIRABLE_WORKER_ROLES,
  WORKER_HIRE_BASE_COST,
  WORKER_HIRE_COST_GROWTH,
  canHireWorker,
  getWorkerHireCost,
  isHirableWorkerRole
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function hire(room, role, gold = 100000) {
  const player = room.state.players.get("p1");
  player.gold = gold;
  room.hireWorker(client, { role });
  return player;
}

function workersOf(room, ownerId = "p1") {
  return [...room.drones.values()].filter((drone) => drone.ownerId === ownerId);
}

test("ilk iscinin bedeli taban bedel, sonrakiler pahalilanir", () => {
  assert.equal(getWorkerHireCost(0), WORKER_HIRE_BASE_COST);
  for (let count = 1; count < 25; count += 1) {
    assert.ok(
      getWorkerHireCost(count) > getWorkerHireCost(count - 1),
      `${count}. isci oncekinden ucuz olmamali`
    );
  }
});

test("isci sayisinda ust sinir yok", () => {
  // Sinir yerine artan bedel var: kadro her zaman buyutulebilir ama her alim
  // bir sonrakini pahalilastirir.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 10_000_000;

  for (let index = 0; index < 12; index += 1) {
    room.hireWorker(client, { role: "crystalCollector" });
  }

  assert.equal(player.hiredWorkerRoles.length, 12, "isci alimi bir yerde durdu");
  assert.equal(canHireWorker(12, 10_000_000), true, "kadro doluymus gibi davraniyor");
});

test("bedel her alimda ayni oranda artar", () => {
  const ilk = getWorkerHireCost(0);
  const onuncu = getWorkerHireCost(9);
  assert.equal(Math.round(ilk * WORKER_HIRE_COST_GROWTH ** 9), onuncu);
});

test("rol dogrulamasi yalnizca bilinen rolleri gecirir", () => {
  for (const role of HIRABLE_WORKER_ROLES) {
    assert.ok(isHirableWorkerRole(role));
  }
  for (const role of ["attack", "repair", "", undefined, null, 7]) {
    assert.equal(isHirableWorkerRole(role), false, `${String(role)} rol sayilmamali`);
  }
});

test("alinan isci secilen rolle sahaya cikar", () => {
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const oncekiSayi = workersOf(room).length;
  const oncekiEnerji = workersOf(room).filter((worker) => worker.mode === "energyTransport").length;

  const player = hire(room, "energyTransport");
  assert.deepEqual(player.hiredWorkerRoles, ["energyTransport"]);

  const isciler = workersOf(room);
  assert.equal(isciler.length, oncekiSayi + 1, "isci sahaya cikmadi");
  assert.equal(
    isciler.filter((worker) => worker.mode === "energyTransport").length,
    oncekiEnerji + 1,
    "yeni isci secilen rolde degil"
  );
});

test("ayni rol iki kez alinabilir ve iki ayri isci olur", () => {
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const oncekiKristal = workersOf(room).filter((worker) => worker.mode === "crystalCollector").length;

  hire(room, "crystalCollector");
  hire(room, "crystalCollector");

  const kristalciler = workersOf(room).filter((worker) => worker.mode === "crystalCollector");
  assert.equal(kristalciler.length, oncekiKristal + 2, "ikinci isci birincinin uzerine yazilmis");
  assert.equal(new Set(kristalciler.map((worker) => worker.id)).size, kristalciler.length, "isci kimlikleri cakisiyor");
});

test("altin yetmezse isci alinmaz", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = getWorkerHireCost(0) - 1;
  const oncekiSayi = workersOf(room).length;

  room.hireWorker(client, { role: "ammoCollector" });

  assert.deepEqual(player.hiredWorkerRoles, [], "bedeli karsilanmayan isci alinmis");
  assert.equal(workersOf(room).length, oncekiSayi, "bedeli karsilanmayan isci sahaya cikmis");
  assert.equal(canHireWorker(0, player.gold), false);
});

test("bedel altindan dusulur ve harcama sayacina yazilir", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 1000;
  const oncekiHarcama = player.goldSpent;
  const bedel = getWorkerHireCost(0);

  room.hireWorker(client, { role: "ammoTransport" });

  assert.equal(player.gold, 1000 - bedel);
  assert.equal(player.goldSpent, oncekiHarcama + bedel);
});

test("gecersiz rol istegi yok sayilir", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 1000;

  room.hireWorker(client, { role: "attack" });
  room.hireWorker(client, {});

  assert.deepEqual(player.hiredWorkerRoles, []);
  assert.equal(player.gold, 1000, "gecersiz istek altin harcamis");
});

test("alinan isciler anlik goruntuye yazilir", () => {
  const room = createRoom("warrior");
  hire(room, "ammoCollector");
  const snapshot = room.getSnapshot();
  const player = snapshot.players.find((entry) => entry.id === "p1");
  assert.deepEqual(player.hiredWorkerRoles, ["ammoCollector"]);
});
