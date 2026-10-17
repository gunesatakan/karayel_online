/**
 * Isci aramasi her tick yeniden kosmuyor (`workerStepCache`): ayni isci, ayni
 * hedef ve ayni kare icin onceki aramanin sonucu kullaniliyor. Bunun oyuncuya
 * gorunur tek riski bayat cevap: yerlesim degismeden (`markNavigationDirty`
 * cagrilmadan) degisen bir sey -- kapi, duvarin cani, yasak kare -- aramaya
 * hic yansimazsa isci kapali yoldan gecmeye ya da acilan yolu gormemeye
 * baslar. Bu testler o degisikliklerin bir sonraki soruda **aninda**
 * islendigini, ayni soruyu tekrar ederek (onbellegin dolu oldugu durumda)
 * sinuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getMapGridSize, gridToWorld, worldToGrid } from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function isciKoy(room, cell, fields = {}) {
  const point = gridToWorld(cell.col, cell.row, room.activeMap);
  return {
    id: "test-isci",
    ownerId: "p1",
    mode: "energyTransport",
    x: point.x,
    y: point.y,
    vx: 0,
    vy: 0,
    speed: 82,
    cargo: 0,
    capacity: 12,
    hp: 60,
    maxHp: 60,
    targetTowerId: "",
    logisticsPhase: "pickup",
    ...fields
  };
}

function duvarOr(room, a, b) {
  const first = gridToWorld(a.col, a.row, room.activeMap);
  const second = gridToWorld(b.col, b.row, room.activeMap);
  room.placeTower(client, { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, definitionId: "wall-1" });
  const duvar = [...room.towers.values()].at(-1);
  assert.ok(duvar && duvar.definition.id === "wall-1", "duvar orulemedi");
  assert.ok(room.getEdgeStructure(a, b) === duvar, "duvar beklenen kenara oturmadi");
  return duvar;
}

function bosKomsuIkili(room) {
  for (let row = 2; row < room.activeMap.rows - 2; row += 1) {
    for (let col = 0; col < room.activeMap.cols - 1; col += 1) {
      const sol = { col, row };
      const sag = { col: col + 1, row };
      if (room.isWorkerCellOpen(sol.col, sol.row) && room.isWorkerCellOpen(sag.col, sag.row)) return { sol, sag };
    }
  }
  throw new Error("bos komsu ikili bulunamadi");
}

const adimHucresi = (room, isci, hedef) => {
  isci.routeStep = undefined;
  const adim = room.getWorkerApproachPoint(isci, hedef.x, hedef.y);
  return adim && worldToGrid(adim.x, adim.y, room.activeMap);
};

test("duvarın canı sıfıra inince (eskitme olmadan da) işçi aynı soruda içinden geçer", () => {
  const room = oda();
  const { sol, sag } = bosKomsuIkili(room);
  const duvar = duvarOr(room, sol, sag);
  const hedef = gridToWorld(sag.col, sag.row, room.activeMap);
  const isci = isciKoy(room, sol);

  // Iki kez: ikincisi onbellekten.
  for (let tekrar = 0; tekrar < 2; tekrar += 1) {
    assert.notDeepEqual(adimHucresi(room, isci, hedef), sag, "isci ayakta duvarin icinden gecti");
  }
  const can = duvar.hp;
  duvar.hp = 0;
  for (let tekrar = 0; tekrar < 2; tekrar += 1) {
    assert.deepEqual(adimHucresi(room, isci, hedef), sag, "yikik duvarin etrafindan dolasti");
  }
  duvar.hp = can;
  for (let tekrar = 0; tekrar < 2; tekrar += 1) {
    assert.notDeepEqual(adimHucresi(room, isci, hedef), sag, "cani geri gelen duvardan gecti");
  }
});

test("duvarla çevrili kule: teslimat yoklaması kapı açılınca hedefi bulur, kapanınca bırakır", () => {
  const room = oda();
  const { sol, sag } = bosKomsuIkili(room);
  // Kule sagdaki karede; dort kenari da duvar.
  room.placeTower(client, { ...gridToWorld(sag.col, sag.row, room.activeMap), definitionId: "warrior-1" });
  const kule = [...room.towers.values()].at(-1);
  assert.equal(kule.definition.id, "warrior-1");
  const kuleHucre = worldToGrid(kule.x, kule.y, room.activeMap);
  const gridSize = getMapGridSize(room.activeMap);
  const duvarlar = [];
  for (const [dx, dy] of [[gridSize / 2, 0], [-gridSize / 2, 0], [0, gridSize / 2], [0, -gridSize / 2]]) {
    room.placeTower(client, { x: kule.x + dx, y: kule.y + dy, definitionId: "wall-1" });
    const duvar = [...room.towers.values()].at(-1);
    assert.equal(duvar.definition.id, "wall-1", "kule cevresine duvar orulemedi");
    duvarlar.push(duvar);
  }
  kule.energy = 0;
  assert.ok(kule.maxEnergy > 0, "kulenin enerji deposu yok");
  const isci = isciKoy(room, sol, { assignment: { product: "energy" } });
  const kapi = duvarlar.find((duvar) => room.getEdgeStructure(sol, kuleHucre) === duvar);
  assert.ok(kapi, "kule ile isci arasinda duvar yok");

  const yokla = () => room.selectDeliveryTarget(isci, "energy");
  for (let tekrar = 0; tekrar < 2; tekrar += 1) assert.equal(yokla(), undefined, "kapali kuleye yol bulundu");
  kapi.gate = true;
  for (let tekrar = 0; tekrar < 2; tekrar += 1) assert.equal(yokla(), kule, "kapi acikken kule bulunamadi");
  kapi.gate = false;
  for (let tekrar = 0; tekrar < 2; tekrar += 1) assert.equal(yokla(), undefined, "kapi kapandiktan sonra da yol bulundu");
  kapi.hp = 0;
  for (let tekrar = 0; tekrar < 2; tekrar += 1) assert.equal(yokla(), kule, "yikik duvar hala yolu kesiyor");
});

test("yasak kare konunca ve kalkınca aynı soru yeni cevabı verir", () => {
  const room = oda();
  const basla = { col: 4, row: 5 };
  const orta = { col: 4, row: 6 };
  const son = { col: 4, row: 7 };
  const hedef = gridToWorld(son.col, son.row, room.activeMap);
  const isci = isciKoy(room, basla);
  const ortaNokta = gridToWorld(orta.col, orta.row, room.activeMap);

  for (let tekrar = 0; tekrar < 2; tekrar += 1) assert.deepEqual(adimHucresi(room, isci, hedef), orta);
  room.toggleWorkerBannedCell(client, ortaNokta);
  for (let tekrar = 0; tekrar < 2; tekrar += 1) {
    const adim = adimHucresi(room, isci, hedef);
    assert.ok(adim, "yasak konunca yol kalmadi");
    assert.notDeepEqual(adim, orta, "yasak kareye adim atildi");
  }
  room.toggleWorkerBannedCell(client, ortaNokta);
  for (let tekrar = 0; tekrar < 2; tekrar += 1) assert.deepEqual(adimHucresi(room, isci, hedef), orta, "kalkan yasak hala dolastiriyor");
});
