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
  ADVANCED_WORKER_MULTIPLIER,
  HIRABLE_WORKER_ROLES,
  WORKER_HIRE_BASE_COST,
  WORKER_HIRE_COST_GROWTH,
  canHireWorker,
  getWorkerHireCost,
  isHirableWorkerRole
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function hire(room, role, gold = 100000, advanced = false) {
  const player = room.state.players.get("p1");
  player.gold = gold;
  room.hireWorker(client, { role, advanced });
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

  assert.equal(player.hiredWorkers.length, 12, "isci alimi bir yerde durdu");
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
  assert.deepEqual(player.hiredWorkers, [{ role: "energyTransport", advanced: undefined }]);

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

  assert.deepEqual(player.hiredWorkers, [], "bedeli karsilanmayan isci alinmis");
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

  assert.deepEqual(player.hiredWorkers, []);
  assert.equal(player.gold, 1000, "gecersiz istek altin harcamis");
});

test("alinan isciler anlik goruntuye yazilir", () => {
  const room = createRoom("warrior");
  hire(room, "ammoCollector");
  const snapshot = room.getSnapshot();
  const player = snapshot.players.find((entry) => entry.id === "p1");
  assert.deepEqual(player.hiredWorkers, [{ role: "ammoCollector", advanced: undefined }]);
});

/**
 * Gelismis isci.
 *
 * Takas duz olmali: her sey uc kat -- toplama, tasima, yurume, bedel. Uc
 * normal isciden farki yer kaplamada: tek beden, tek yol, takip edilecek tek
 * hedef. Testler bu duzlugu tutuyor, cunku bir kalemin uc kattan sapmasi
 * takasin kendisini bozar.
 */

test("gelismis iscinin bedeli ayni sayacta normalin uc kati", () => {
  for (let count = 0; count < 15; count += 1) {
    assert.equal(
      getWorkerHireCost(count, true),
      Math.round(getWorkerHireCost(count) * ADVANCED_WORKER_MULTIPLIER),
      `${count}. isci: gelismis bedel normalin uc kati degil`
    );
  }
});

test("sayac ortak: normal alim gelismisin bedelini de yukseltir, tersi de", () => {
  // En kolay kacamak burada olurdu: iki ayri sayac tutmak, gelismis isciyi
  // ucuz normal alimlarla taban fiyatta tutmanin yolunu acardi.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 10_000_000;

  const gelismisIlk = getWorkerHireCost(0, true);
  room.hireWorker(client, { role: "crystalCollector" });
  assert.equal(
    getWorkerHireCost(player.hiredWorkers.length, true),
    getWorkerHireCost(1, true),
    "normal alim gelismisin bedelini yukseltmedi"
  );
  assert.ok(getWorkerHireCost(1, true) > gelismisIlk);

  const oncekiAltin = player.gold;
  room.hireWorker(client, { role: "crystalCollector", advanced: true });
  assert.equal(oncekiAltin - player.gold, getWorkerHireCost(1, true), "gelismis alim yanlis bedelle gecti");
  assert.equal(
    getWorkerHireCost(player.hiredWorkers.length),
    getWorkerHireCost(2),
    "gelismis alim normalin bedelini yukseltmedi"
  );
});

test("gelismis isci uc kat tasir ve uc kat hizli yurur", () => {
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const normalIsci = workersOf(room).find((worker) => worker.mode === "crystalCollector");

  hire(room, "crystalCollector", 100000, true);
  room.ensureLogisticsWorkers();
  const gelismis = workersOf(room).filter((worker) => worker.mode === "crystalCollector" && worker.advanced);
  assert.equal(gelismis.length, 1, "gelismis isci sahaya cikmadi");
  assert.equal(gelismis[0].capacity, normalIsci.capacity * ADVANCED_WORKER_MULTIPLIER);
  assert.equal(gelismis[0].speed, normalIsci.speed * ADVANCED_WORKER_MULTIPLIER);
});

test("toplama hizi uc kat ve kart carpaniyla carpiliyor", () => {
  // Toplaniyor degil carpiliyor: isci hizlandiran bir kart, gelismis isciyi de
  // ayni **oranda** hizlandirmali. Toplansaydi kartin degeri gelismis iscide
  // uctebire duserdi.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  room.ensureLogisticsWorkers();
  hire(room, "crystalCollector", 100000, true);
  room.ensureLogisticsWorkers();

  const normal = workersOf(room).find((worker) => worker.mode === "crystalCollector" && !worker.advanced);
  const gelismis = workersOf(room).find((worker) => worker.mode === "crystalCollector" && worker.advanced);
  assert.equal(
    room.getWorkerGatherSpeedMultiplier(gelismis),
    room.getWorkerGatherSpeedMultiplier(normal) * ADVANCED_WORKER_MULTIPLIER
  );

  player.runModifiers = [{ source: "card:test", scope: "player", stat: "workerGatherSpeed", add: 0.5 }];
  assert.equal(room.getWorkerGatherSpeedMultiplier(normal), 1.5, "kart carpani normal isciye islemedi");
  assert.equal(
    room.getWorkerGatherSpeedMultiplier(gelismis),
    1.5 * ADVANCED_WORKER_MULTIPLIER,
    "kart carpani ile kademe carpani carpilmadi"
  );
});

test("kademe anlik goruntuye ve alim bildirimine yaziliyor", () => {
  // Istemci iki kademeyi ancak telden gelen bu bayrakla ayirt edebiliyor;
  // dusmesi halinde gelismis isci normal gibi cizilirdi.
  const gelenler = [];
  const dinleyen = { sessionId: "p1", send: (tip, veri) => gelenler.push([tip, veri]) };
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 100000;
  room.hireWorker(dinleyen, { role: "ammoTransport", advanced: true });
  room.ensureLogisticsWorkers();

  assert.deepEqual(gelenler.find(([tip]) => tip === "worker:hired")?.[1], {
    role: "ammoTransport",
    advanced: true,
    cost: getWorkerHireCost(0, true)
  });

  const snapshot = room.getSnapshot();
  assert.deepEqual(snapshot.players.find((entry) => entry.id === "p1").hiredWorkers, [
    { role: "ammoTransport", advanced: true }
  ]);
  const drone = snapshot.drones.find((entry) => entry.advanced);
  assert.ok(drone, "gelismis isci anlik goruntude isaretlenmemis");
  assert.equal(drone.mode, "ammoTransport");
});

test("gelismis istegi bedeli karsilanmiyorsa normal isciye dusmuyor", () => {
  // Sessizce normale dusmek en kotu davranis olurdu: oyuncu gelismis istedi,
  // parasi yetmedi, elinde normal isci bulurdu.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = getWorkerHireCost(0, true) - 1;
  room.hireWorker(client, { role: "crystalCollector", advanced: true });
  assert.deepEqual(player.hiredWorkers, [], "bedeli karsilanmayan gelismis isci alinmis");
  assert.equal(canHireWorker(0, player.gold, true), false);
  assert.equal(canHireWorker(0, player.gold), true, "normal isci hala alinabilmeliydi");
});
