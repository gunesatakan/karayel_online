/**
 * Iscinin nereye girebildigi ve nereye giremedigi.
 *
 * Iki kural birbirinin tersi. Lojistik binalari -- cephane, enerji, Tamir
 * Merkezi -- isciye **acik**: isci onlarin icinde calisiyor. Disarida durup
 * teslim etmek hattin kaynaktan dogrudan kuleye gittigi izlenimini veriyordu,
 * cunku isci binaya hic dokunmuyordu. Savas kulelerine yalnizca teslimat
 * hedefi olan enerji ve muhimmat iscileri girer.
 *
 * Yasak ise oyuncunun karari: bir kareyi iscilere kapatiyor ve isciler o
 * kareden gecmeyen bir yol bulmak zorunda kaliyor. Kesif degil tercih oldugu
 * icin cikmaz sokak hafizasindan ayri tutuluyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { gridToWorld, worldToGrid, REPAIR_DEPOT_TOWER_ID } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId) {
  const nokta = findBuildableSpot(room, definitionId);
  assert.ok(nokta, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId });
  return [...room.towers.values()].at(-1);
}

function isci(room, { mode = "energyTransport", phase = "deliver", targetTowerId = "" } = {}) {
  return {
    id: "test-isci",
    ownerId: "p1",
    mode,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 82,
    cargo: 0,
    capacity: 6,
    hp: 60,
    maxHp: 60,
    targetTowerId,
    logisticsPhase: phase
  };
}

const hucre = (room, tower) => worldToGrid(tower.x, tower.y, room.activeMap);

test("işçi enerji, cephane ve tamir binalarına girebilir", () => {
  const room = oda();
  const calisan = isci(room);
  for (const id of ["warrior-8", "warrior-7", REPAIR_DEPOT_TOWER_ID]) {
    const bina = kur(room, id);
    const c = hucre(room, bina);
    assert.equal(room.isWorkerCellOpen(c.col, c.row, calisan), true, `${id}: isciye kapali`);
  }
});

test("işçi savaş kulesine giremez", () => {
  // Kontrol: kural \"her yapiya gir\" degil. Kule dibinden teslim aliyor.
  const room = oda();
  const kule = kur(room, "warrior-1");
  const c = hucre(room, kule);
  assert.equal(room.isWorkerCellOpen(c.col, c.row, isci(room)), false, "kuleye girildi");
});

test("işçi yükleme yaptığı yapıya girebilir", () => {
  // \"Yukleme yaptiklari binaya da girebilirler\": hedef hangi yapi olursa olsun.
  const room = oda();
  const kule = kur(room, "warrior-1");
  const c = hucre(room, kule);

  const yukluyor = isci(room, { phase: "pickup", targetTowerId: kule.id });
  assert.equal(room.isWorkerCellOpen(c.col, c.row, yukluyor), true, "yukleme yapilan yapiya girilemedi");

  // Teslimat da hedef yapinin icinde yapilir.
  const teslim = isci(room, { phase: "deliver", targetTowerId: kule.id });
  assert.equal(room.isWorkerCellOpen(c.col, c.row, teslim), true, "teslimat hedefine girilemedi");
});

for (const mode of ["energyTransport", "ammoTransport"]) {
  test(`${mode}: yükü kule merkezinde bırakır ve sonra kuleden çıkar`, () => {
    const room = oda();
    const tower = kur(room, "warrior-1");
    const cell = hucre(room, tower);
    const start = [
      { col: cell.col - 1, row: cell.row }, { col: cell.col + 1, row: cell.row },
      { col: cell.col, row: cell.row - 1 }, { col: cell.col, row: cell.row + 1 }
    ].find(c => room.isWorkerCellOpen(c.col, c.row));
    assert.ok(start);
    const worker = isci(room, { mode, targetTowerId: tower.id });
    Object.assign(worker, gridToWorld(start.col, start.row, room.activeMap), { cargo: 2 });
    const resource = mode === "energyTransport" ? "energy" : "ammo";
    tower[resource] = 0;
    room.updateLogisticsWorker(worker, 0.016);
    assert.equal(tower[resource], 0, "komşu kareden teslim etti");
    for (let i = 0; i < 300 && tower[resource] === 0; i++) room.updateLogisticsWorker(worker, 0.016);
    assert.equal(tower[resource], 2);
    assert.equal(worker.x, tower.x);
    assert.equal(worker.y, tower.y);
    assert.equal(worker.logisticsPhase, "pickup");
    const exit = gridToWorld(start.col, start.row, room.activeMap);
    for (let i = 0; i < 300; i++) {
      if (room.moveLogisticsWorker(worker, exit.x, exit.y, 0.016)) break;
    }
    assert.deepEqual(worldToGrid(worker.x, worker.y, room.activeMap), start);
  });
}

test("teslimat hedefi yasaksa dışarıdan yük bırakamaz; tamirci kuleye giremez", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  const worker = isci(room, { targetTowerId: tower.id });
  const cell = hucre(room, tower);
  Object.assign(worker, gridToWorld(cell.col - 1, cell.row, room.activeMap));
  room.toggleWorkerBannedCell(client, { x: tower.x, y: tower.y });
  assert.equal(room.getWorkerApproachPoint(worker, tower.x, tower.y), undefined);
  assert.equal(room.canWorkerEnterStructure({ ...worker, mode: "repairer" }, tower), false);
  assert.equal(room.canWorkerEnterStructure({ ...worker, ownerId: "p2" }, tower), false);
});

test("kristal işçisi reaktörün karesine gerçekten giriyor", () => {
  // Uctan uca: sikayetin kendisi buydu -- isci binaya dokunmuyordu.
  const room = oda();
  const reaktor = kur(room, "warrior-8");
  const rc = hucre(room, reaktor);
  room.updateDrones(16, 0.016);
  const toplayici = [...room.drones.values()].find((drone) => drone.mode === "crystalCollector");
  assert.ok(toplayici, "kristal iscisi yok");

  let binadaTick = 0;
  for (let i = 0; i < 60 * 60; i += 1) {
    room.updateDrones(16.6, 0.0166);
    const c = worldToGrid(toplayici.x, toplayici.y, room.activeMap);
    if (c.col === rc.col && c.row === rc.row) binadaTick += 1;
  }
  assert.ok(binadaTick > 0, "isci bir dakikada reaktorun icine hic girmedi");
});

test("yasaklanan kareden işçi geçmez", () => {
  const room = oda();
  const calisan = isci(room);
  const sol = { col: 4, row: 6 };
  const sag = { col: 5, row: 6 };
  assert.equal(room.canWorkerEnter(sol, sag, calisan), true, "kare bastan kapali");

  const nokta = gridToWorld(sag.col, sag.row, room.activeMap);
  room.toggleWorkerBannedCell(client, { x: nokta.x, y: nokta.y });
  assert.equal(room.canWorkerEnter(sol, sag, calisan), false, "yasak kareye girildi");
});

test("yasak aynı kareye ikinci basışta kalkar", () => {
  const room = oda();
  const calisan = isci(room);
  const sol = { col: 4, row: 6 };
  const sag = { col: 5, row: 6 };
  const nokta = gridToWorld(sag.col, sag.row, room.activeMap);

  room.toggleWorkerBannedCell(client, { x: nokta.x, y: nokta.y });
  assert.equal(room.canWorkerEnter(sol, sag, calisan), false);
  room.toggleWorkerBannedCell(client, { x: nokta.x, y: nokta.y });
  assert.equal(room.canWorkerEnter(sol, sag, calisan), true, "yasak kaldirilamadi");
});

test("işçi yasaklı kareyi dolaşan bir yol bulur", () => {
  const room = oda();
  const basla = { col: 4, row: 5 };
  const hedef = { col: 4, row: 7 };
  const ortadaki = { col: 4, row: 6 };

  const nokta = gridToWorld(hedef.col, hedef.row, room.activeMap);
  const baslaNokta = gridToWorld(basla.col, basla.row, room.activeMap);
  const calisan = isci(room);
  calisan.x = baslaNokta.x;
  calisan.y = baslaNokta.y;

  // Yasaksiz: duz asagi.
  const duz = room.getWorkerApproachPoint(calisan, nokta.x, nokta.y);
  assert.deepEqual(worldToGrid(duz.x, duz.y, room.activeMap), ortadaki, "yasaksiz yol duz degil");

  // Aradaki kare kapatilinca yandan dolasmali, ama yine de bir yol bulmali.
  const ortaNokta = gridToWorld(ortadaki.col, ortadaki.row, room.activeMap);
  room.toggleWorkerBannedCell(client, { x: ortaNokta.x, y: ortaNokta.y });
  calisan.routeStep = undefined;
  const dolasan = room.getWorkerApproachPoint(calisan, nokta.x, nokta.y);
  assert.ok(dolasan, "yasak konunca yol bulunamadi");
  assert.notDeepEqual(worldToGrid(dolasan.x, dolasan.y, room.activeMap), ortadaki, "yasak kareye girdi");
});

test("yasak yalnızca koyan oyuncunun işçilerini bağlar", () => {
  const room = oda();
  const sol = { col: 4, row: 6 };
  const sag = { col: 5, row: 6 };
  const nokta = gridToWorld(sag.col, sag.row, room.activeMap);
  room.toggleWorkerBannedCell(client, { x: nokta.x, y: nokta.y });

  const benim = isci(room);
  const otekinin = { ...isci(room), ownerId: "p2" };
  assert.equal(room.canWorkerEnter(sol, sag, benim), false);
  assert.equal(room.canWorkerEnter(sol, sag, otekinin), true, "baskasinin iscisi de baglandi");
});
