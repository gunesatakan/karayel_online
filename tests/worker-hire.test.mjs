/**
 * Isci alimi.
 *
 * Her oyuncu dort temel isciyle basliyor: iki toplayici (enerji kristali ve
 * barut) ve iki tasiyici (enerji binasi ve cephanelik). Satin alinan isci tek
 * tip (sahibin istegi, 2026-11-24): rolu yok, alimda uzmanlik secilmiyor,
 * bosta doguyor; isi atandigi yerden geliyor. Testler bedelin her alimda
 * buyudugunu, sayida ust sinir olmadigini, iki alimin iki ayri isci
 * dogurdugunu ve yeni iscinin bir ise atanana kadar bekledigini sabitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ADVANCED_WORKER_COST_MULTIPLIER,
  cardCatalog,
  getWorkerHireCostWithModifiers,
  ADVANCED_WORKER_CAPACITY_MULTIPLIER,
  ADVANCED_WORKER_GATHER_SPEED_MULTIPLIER,
  ADVANCED_WORKER_MOVE_SPEED_MULTIPLIER,
  HIRABLE_WORKER_ROLES,
  RESOURCE_EXTRACTION_DURATION_MS,
  WORKER_HIRE_BASE_COST,
  WORKER_HIRE_COST_GROWTH,
  canHireWorker,
  getWorkerHireCost,
  isHirableWorkerRole
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/**
 * Altinla bir isci alir. Sunucunun `worker:hired` bildirimi ve bildirimdeki
 * kimlikle sahaya cikan isci de donuyor (alim basarisizsa ikisi de yok).
 */
function hire(room, { gold = 100000, advanced = false } = {}) {
  const player = room.state.players.get("p1");
  player.gold = gold;
  let notice;
  const listener = { sessionId: "p1", send: (type, value) => { if (type === "worker:hired") notice = value; } };
  room.hireWorker(listener, { advanced });
  return { player, notice, drone: notice ? room.drones.get(notice.workerId) : undefined };
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
    room.hireWorker(client, {});
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

test("alinan isci rolsuz ve bosta sahaya cikar", () => {
  // Uzmanlik secimi yok: isci bir ise atanana kadar (dugum ya da bina) bekliyor.
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const oncekiSayi = workersOf(room).length;

  const { player, notice, drone } = hire(room);
  assert.deepEqual(player.hiredWorkers, [{ advanced: undefined }], "kayda rol yazilmis");
  assert.equal(notice.workerId, `logistics-p1-worker:${player.hiredWorkers[0].id}`);
  assert.equal(workersOf(room).length, oncekiSayi + 1, "isci sahaya cikmadi");
  assert.ok(drone, "alim bildirimindeki kimlikle sahada isci yok");
  assert.equal(drone.assignment, undefined, "yeni isci kendiliginden bir ise atanmis");
  // Teldeki kip isin aynasi; bosta isci tasiyici kipinde ama atamasi yok.
  assert.equal(drone.mode, "energyTransport");

  const { x, y } = drone;
  for (let tick = 0; tick < 30; tick += 1) room.updateDrones(100, 0.1);
  assert.deepEqual([drone.x, drone.y, drone.cargo], [x, y, 0], "bosta isci kendiliginden is yapti");
});

test("iki alim iki ayri isci olur", () => {
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const oncekiSayi = workersOf(room).length;

  const birinci = hire(room).drone;
  const ikinci = hire(room).drone;

  assert.equal(workersOf(room).length, oncekiSayi + 2, "ikinci isci birincinin uzerine yazilmis");
  assert.notEqual(birinci.id, ikinci.id, "isci kimlikleri cakisiyor");
  assert.ok(room.drones.get(birinci.id) === birinci && room.drones.get(ikinci.id) === ikinci);
});

test("altin yetmezse isci alinmaz", () => {
  const room = createRoom("warrior");
  const oncekiSayi = workersOf(room).length;

  const { player, notice } = hire(room, { gold: getWorkerHireCost(0) - 1 });

  assert.deepEqual(player.hiredWorkers, [], "bedeli karsilanmayan isci alinmis");
  assert.equal(notice, undefined, "alinmayan isci icin alim bildirimi gitmis");
  assert.equal(workersOf(room).length, oncekiSayi, "bedeli karsilanmayan isci sahaya cikmis");
  assert.equal(canHireWorker(0, player.gold), false);
});

test("bedel altindan dusulur ve harcama sayacina yazilir", () => {
  const room = createRoom("warrior");
  const oncekiHarcama = room.state.players.get("p1").goldSpent;
  const bedel = getWorkerHireCost(0);

  const { player, notice } = hire(room, { gold: 1000 });

  assert.equal(player.gold, 1000 - bedel);
  assert.equal(player.goldSpent, oncekiHarcama + bedel);
  assert.equal(notice.cost, bedel, "bildirilen bedel tahsil edilenden farkli");
});

test("eski istemcinin yolladigi rol yok sayilir", () => {
  // Eski paket alimda rol yolluyordu. Rol, gecerli olsun olmasin, ne kayda
  // ne iscinin isine yansiyor: alim her seferinde tek tip isci.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 1000;

  room.hireWorker(client, { role: "crystalCollector" });
  room.hireWorker(client, { role: "attack" });
  room.hireWorker(client, {});

  assert.deepEqual(player.hiredWorkers, [{ advanced: undefined }, { advanced: undefined }, { advanced: undefined }]);
  assert.equal(player.gold, 1000 - getWorkerHireCost(0) - getWorkerHireCost(1) - getWorkerHireCost(2));
  const yeniler = workersOf(room).filter((worker) => worker.id.startsWith("logistics-p1-worker:"));
  assert.equal(yeniler.length, 3);
  assert.ok(yeniler.every((worker) => worker.assignment === undefined), "rol alani isciye is vermis");

  // Oyuncu olmayan oturumun istegi bir sey yapmiyor.
  const yabanci = { sessionId: "yabanci", send() { assert.fail("oyuncu olmayana bildirim gitti"); } };
  room.hireWorker(yabanci, {});
  assert.equal(player.hiredWorkers.length, 3);
});

test("alinan isciler anlik goruntuye yazilir", () => {
  const room = createRoom("warrior");
  const { drone } = hire(room);
  const snapshot = room.getSnapshot();
  const player = snapshot.players.find((entry) => entry.id === "p1");
  // Sunucu kaydi rolsuz; tel eski istemci icin bir rol gosteriyor (rolsuz
  // kaydi "uzmanlik bekliyor" sayip ikinci isci aldiriyordu).
  assert.deepEqual(player.hiredWorkers, [{ role: "energyTransport", advanced: undefined }]);
  assert.equal(room.state.players.get("p1").hiredWorkers[0].role, undefined);

  // Bosta iscinin teldeki atamasi bos; temel isciler varsayilan isleriyle.
  const wire = snapshot.drones.find((entry) => entry.id === drone.id);
  assert.ok(wire, "alinan isci anlik goruntude yok");
  assert.equal(wire.assignment, undefined);
  assert.equal(wire.autoAssigned, undefined);
  const temel = snapshot.drones.find((entry) => entry.id === "logistics-p1-energyTransport");
  assert.deepEqual([temel.assignment, temel.autoAssigned], [{ postKind: "energy" }, true]);
});

test("temel isciler ve Besinci Isci kimliklerini ve varsayilan islerini koruyor", () => {
  // Eski rol kayitlari yalnizca kimlik ve varsayilan is veriyor; kip isin aynasi.
  const room = createRoom("warrior");
  room.state.players.get("p1").ownedShopItemIds.push("besinci-isci");
  room.ensureLogisticsWorkers();
  const nodeKind = (worker) => room.getEconomyNodes().find((node) => node.id === worker.assignment?.nodeId)?.kind;

  const kristal = room.drones.get("logistics-p1-crystalCollector");
  const enerji = room.drones.get("logistics-p1-energyTransport");
  const barut = room.drones.get("logistics-p1-ammoCollector");
  const cephane = room.drones.get("logistics-p1-ammoTransport");
  const besinci = room.drones.get("logistics-p1-ammoTransport:extra0");
  assert.ok(kristal && enerji && barut && cephane && besinci, "temel isci kimligi degismis");

  assert.equal(nodeKind(kristal), "energy", "kristal toplayici enerji dugumunde degil");
  assert.equal(nodeKind(barut), "gunpowder", "barut toplayici barut yataginda degil");
  assert.deepEqual(enerji.assignment, { postKind: "energy" });
  assert.deepEqual(cephane.assignment, { postKind: "factory" });
  assert.deepEqual(besinci.assignment, { postKind: "factory" });
  assert.deepEqual(
    [kristal, enerji, barut, cephane, besinci].map((worker) => worker.mode),
    ["crystalCollector", "energyTransport", "crystalCollector", "energyTransport", "energyTransport"]
  );
});

/**
 * Gelismis isci.
 *
 * Her eksen kendi katinda: tasima uc kat, yurume bir bucuk kat, toplama iki
 * kat, bedel dort kat. Bir donem hepsi uc katti; kapasite ile iki hiz ust
 * uste binince hat dokuz kata yaklasiyordu, hizlar bu yuzden indi. Testler
 * her ekseni kendi sabitine bagliyor ki biri ayarlanirken oteki kaymasin.
 */

test("gelismis iscinin bedeli ayni sayacta normalin bedel katı", () => {
  // Bedel ile is ayri sabitler: gelismis isci dort iscinin parasini istiyor.
  // Test ikisini karistirmasin diye bedel sabitini okuyor.
  assert.equal(getWorkerHireCost(0, true), 400, "ilk gelismis isci 400 altin olmali");
  for (let count = 0; count < 15; count += 1) {
    assert.equal(
      getWorkerHireCost(count, true),
      getWorkerHireCost(count) * ADVANCED_WORKER_COST_MULTIPLIER,
      `${count}. isci: gelismis bedel normalin bedel katinda degil`
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
  room.hireWorker(client, {});
  assert.equal(
    getWorkerHireCost(player.hiredWorkers.length, true),
    getWorkerHireCost(1, true),
    "normal alim gelismisin bedelini yukseltmedi"
  );
  assert.ok(getWorkerHireCost(1, true) > gelismisIlk);

  const oncekiAltin = player.gold;
  room.hireWorker(client, { advanced: true });
  assert.equal(oncekiAltin - player.gold, getWorkerHireCost(1, true), "gelismis alim yanlis bedelle gecti");
  assert.equal(
    getWorkerHireCost(player.hiredWorkers.length),
    getWorkerHireCost(2),
    "gelismis alim normalin bedelini yukseltmedi"
  );
});

test("gelismis isci uc kat tasir ve bir bucuk kat hizli yurur", () => {
  // Sahibinin sayilari: yurume 1,5 kat (once 3); kapasiteye dokunulmadi.
  assert.equal(ADVANCED_WORKER_CAPACITY_MULTIPLIER, 3);
  assert.equal(ADVANCED_WORKER_MOVE_SPEED_MULTIPLIER, 1.5);
  const room = createRoom("warrior");
  room.ensureLogisticsWorkers();
  const normalIsci = room.drones.get("logistics-p1-crystalCollector");

  hire(room, { advanced: true });
  room.ensureLogisticsWorkers();
  const gelismis = workersOf(room).filter((worker) => worker.advanced);
  assert.equal(gelismis.length, 1, "gelismis isci sahaya cikmadi");
  assert.equal(gelismis[0].capacity, normalIsci.capacity * ADVANCED_WORKER_CAPACITY_MULTIPLIER);
  assert.equal(gelismis[0].speed, normalIsci.speed * ADVANCED_WORKER_MOVE_SPEED_MULTIPLIER);
  assert.equal(gelismis[0].speed, normalIsci.speed * 1.5);
});

/**
 * Gelismis iscinin toplayici olmasi icin bir dugume atanmasi yetiyor; alimda
 * secilen bir rol yok. Normal isci, ayni dugumdeki temel kristal toplayici.
 */
function gelismisToplayici(room) {
  room.ensureLogisticsWorkers();
  const normal = room.drones.get("logistics-p1-crystalCollector");
  const { drone: gelismis } = hire(room, { advanced: true });
  room.assignWorker(client, { workerId: gelismis.id, nodeId: normal.assignment.nodeId });
  assert.equal(gelismis.mode, "crystalCollector", "dugume atanan isci toplayici olmadi");
  assert.deepEqual(gelismis.assignment, { nodeId: normal.assignment.nodeId });
  return { normal, gelismis };
}

test("toplama hizi iki kat ve kart carpaniyla carpiliyor", () => {
  // Toplaniyor degil carpiliyor: isci hizlandiran bir kart, gelismis isciyi de
  // ayni **oranda** hizlandirmali. Toplansaydi kartin degeri gelismis iscide
  // yariya duserdi.
  assert.equal(ADVANCED_WORKER_GATHER_SPEED_MULTIPLIER, 2);
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  const { normal, gelismis } = gelismisToplayici(room);
  assert.equal(
    room.getWorkerGatherSpeedMultiplier(gelismis),
    room.getWorkerGatherSpeedMultiplier(normal) * ADVANCED_WORKER_GATHER_SPEED_MULTIPLIER
  );
  assert.equal(room.getWorkerGatherSpeedMultiplier(gelismis), 2);

  player.runModifiers = [{ source: "card:test", scope: "player", stat: "workerGatherSpeed", add: 0.5 }];
  assert.equal(room.getWorkerGatherSpeedMultiplier(normal), 1.5, "kart carpani normal isciye islemedi");
  assert.equal(
    room.getWorkerGatherSpeedMultiplier(gelismis),
    1.5 * ADVANCED_WORKER_GATHER_SPEED_MULTIPLIER,
    "kart carpani ile kademe carpani carpilmadi"
  );
});

test("gelismis iscinin cikarma suresi normalin yarisi", () => {
  // Carpan hiz carpani: sureyi boluyor (7,11 sn -> 3,56 sn), eklemiyor.
  // Ayni saat diliminde gelismis isci tam iki kat ilerlemeli.
  const room = createRoom("warrior");
  const { normal, gelismis } = gelismisToplayici(room);
  const sure = (worker) => RESOURCE_EXTRACTION_DURATION_MS / room.getWorkerGatherSpeedMultiplier(worker);
  assert.equal(sure(normal), RESOURCE_EXTRACTION_DURATION_MS);
  assert.equal(sure(gelismis), RESOURCE_EXTRACTION_DURATION_MS / 2);
});

test("kademe anlik goruntuye ve alim bildirimine yaziliyor", () => {
  // Istemci iki kademeyi ancak telden gelen bu bayrakla ayirt edebiliyor;
  // dusmesi halinde gelismis isci normal gibi cizilirdi.
  const gelenler = [];
  const dinleyen = { sessionId: "p1", send: (tip, veri) => gelenler.push([tip, veri]) };
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 100000;
  room.hireWorker(dinleyen, { advanced: true });
  room.ensureLogisticsWorkers();

  const bildirim = gelenler.find(([tip]) => tip === "worker:hired")?.[1];
  assert.deepEqual(bildirim, {
    advanced: true,
    cost: getWorkerHireCost(0, true),
    workerId: `logistics-p1-worker:${player.hiredWorkers[0].id}`
  });
  // Alimin ardindan secim penceresi (uzmanlik ya da kademe) acilmiyor.
  assert.deepEqual(gelenler.map(([tip]) => tip), ["worker:hired"]);

  const snapshot = room.getSnapshot();
  assert.deepEqual(snapshot.players.find((entry) => entry.id === "p1").hiredWorkers, [
    { role: "energyTransport", advanced: true }
  ]);
  const drone = snapshot.drones.find((entry) => entry.advanced);
  assert.ok(drone, "gelismis isci anlik goruntude isaretlenmemis");
  assert.equal(drone.id, bildirim.workerId);
  assert.equal(drone.mode, "energyTransport");
});

test("gelismis istegi bedeli karsilanmiyorsa normal isciye dusmuyor", () => {
  // Sessizce normale dusmek en kotu davranis olurdu: oyuncu gelismis istedi,
  // parasi yetmedi, elinde normal isci bulurdu.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = getWorkerHireCost(0, true) - 1;
  room.hireWorker(client, { advanced: true });
  assert.deepEqual(player.hiredWorkers, [], "bedeli karsilanmayan gelismis isci alinmis");
  assert.equal(canHireWorker(0, player.gold, true), false);
  assert.equal(canHireWorker(0, player.gold), true, "normal isci hala alinabilmeliydi");
});

/**
 * "Isci Pazarligi" (-%30) ve arayuzun gordugu sayi.
 *
 * Hata sunucuda degildi: sunucu indirimi hep uyguluyordu, ama cekmece kendi
 * formulunu yazdigi icin eski sayiyi gosteriyordu. Oyuncu karti aliyor, fiyat
 * degismemis gorunuyor, kartin ise yaramadigini saniyordu.
 *
 * Testin tuttugu sey tam olarak bu: **gorulen sayi ile tahsil edilen sayinin
 * ayni olmasi**. Indirimin uygulanmasi tek basina yeterli degil -- gorunmeyen
 * bir indirim, oyuncu icin olmayan bir indirimdir.
 */
function pazarlikKartiniAl(room, client = { sessionId: "p1", send() {} }) {
  const kart = cardCatalog.find((card) => card.id === "isci-pazarligi");
  room.pendingCardChoices = new Map([["p1", [kart]]]);
  room.broadcast = () => {};
  room.chooseCard(client, { cardId: kart.id });
  return kart;
}

test("isci pazarligi bedeli hem dusuruyor hem cekmecede gorunuyor", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  pazarlikKartiniAl(room);

  const carpan = room.getWorkerHireCostMultiplier(player);
  assert.equal(Math.round(carpan * 100) / 100, 0.7, "kart carpani islemedi");

  // Arayuzun yazacagi sayi.
  const gorunen = getWorkerHireCostWithModifiers(player.hiredWorkers.length, false, carpan);
  assert.equal(gorunen, Math.ceil(WORKER_HIRE_BASE_COST * 0.7));

  const oncekiAltin = player.gold;
  room.hireWorker({ sessionId: "p1", send() {} }, {});
  assert.equal(oncekiAltin - player.gold, gorunen, "tahsil edilen bedel gorunenden farkli");
});

test("indirim gelismis isciye de isliyor ve iki sayi da tutuyor", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  pazarlikKartiniAl(room);
  const carpan = room.getWorkerHireCostMultiplier(player);

  const gorunen = getWorkerHireCostWithModifiers(player.hiredWorkers.length, true, carpan);
  assert.ok(gorunen < getWorkerHireCost(0, true), "gelismis bedel indirimden etkilenmedi");

  const oncekiAltin = player.gold;
  room.hireWorker({ sessionId: "p1", send() {} }, { advanced: true });
  assert.equal(oncekiAltin - player.gold, gorunen);
});

test("carpan sayac ilerledikce de gorunenle tahsil edileni ayni tutuyor", () => {
  // Sayac her alimda degistigi icin tek bir bedel gondermek yetmezdi; telden
  // carpan geciyor ve iki taraf ayni fonksiyonu cagiriyor.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  pazarlikKartiniAl(room);
  const carpan = room.getWorkerHireCostMultiplier(player);

  for (let i = 0; i < 6; i += 1) {
    const gelismis = i % 2 === 1;
    const gorunen = getWorkerHireCostWithModifiers(player.hiredWorkers.length, gelismis, carpan);
    const oncekiAltin = player.gold;
    room.hireWorker({ sessionId: "p1", send() {} }, { advanced: gelismis });
    assert.equal(oncekiAltin - player.gold, gorunen, `${i}. alimda gorunen ile tahsil edilen ayrildi`);
  }
});

test("carpan anlik goruntuye yaziliyor, indirim yokken yazilmiyor", () => {
  // 1 iken yazilmiyor: indirimsiz oyunda her karede bir sayi gondermenin
  // karsiligi yok, okuyan taraf eksik alani 1 sayiyor.
  const room = createRoom("warrior");
  const oyuncuKaydi = () => room.getSnapshot().players.find((entry) => entry.id === "p1");
  assert.equal(oyuncuKaydi().workerHireCostMultiplier, undefined, "indirim yokken carpan gonderilmis");

  pazarlikKartiniAl(room);
  assert.equal(Math.round(oyuncuKaydi().workerHireCostMultiplier * 100) / 100, 0.7);
});
