/**
 * Isci yol bulmasi ve duvar kapilari.
 *
 * Iki kural birbirine bagli. Birincisi: isci de dusman gibi yapilarin icinden
 * ve duvarlardan gecemez. Ikincisi olmadan birincisi oyuncuyu kendi hattini
 * ormekten cezalandirirdi -- duvarla cevrilmis bir us, kendi lojistigini de
 * disarda birakirdi. Kapi o cikis: isci gecer, dusman gecmez.
 *
 * Her kapi testinin iki tarafi var. Kapi isciye acilmali **ve** dusmana kapali
 * kalmali; yalnizca birincisi olsaydi "kapi duvari kaldirir" hatasi da gecerdi.
 *
 * Isci dusmanin kor gezinmesini kullanmiyor: dusman haritayi bilmez, isci
 * bilir. Duvari oren zaten oyuncunun kendisi.
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

/** Iki komsu hucrenin arasindaki kenara duvar orer. */
function duvarOr(room, a, b) {
  const first = gridToWorld(a.col, a.row, room.activeMap);
  const second = gridToWorld(b.col, b.row, room.activeMap);
  room.placeTower(client, {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    definitionId: "wall-1"
  });
  const duvar = [...room.towers.values()].at(-1);
  assert.ok(duvar && duvar.definition.id === "wall-1", "duvar orulemedi");
  // Duvarin gercekten o gecise oturdugunu dogruluyoruz; aksi halde test
  // hicbir sey sinamadan gecerdi.
  assert.ok(room.getEdgeStructure(a, b) === duvar, "duvar beklenen kenara oturmadi");
  return duvar;
}

/** Haritanin ortasinda, yan yana iki bos hucre bulur. */
function bosKomsuIkili(room) {
  for (let row = 2; row < room.activeMap.rows - 2; row += 1) {
    for (let col = 0; col < room.activeMap.cols - 1; col += 1) {
      const sol = { col, row };
      const sag = { col: col + 1, row };
      if (room.isWorkerCellOpen(sol.col, sol.row) && room.isWorkerCellOpen(sag.col, sag.row)) {
        return { sol, sag };
      }
    }
  }
  throw new Error("bos komsu ikili bulunamadi");
}

function isciKoy(room, cell) {
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
    logisticsPhase: "pickup"
  };
}

test("duvar işçiyi durdurur", () => {
  const room = oda();
  const { sol, sag } = bosKomsuIkili(room);
  assert.equal(room.canWorkerEnter(sol, sag), true, "duvarsiz gecis zaten kapali");
  duvarOr(room, sol, sag);
  assert.equal(room.canWorkerEnter(sol, sag), false, "isci duvardan gecti");
});

test("kapılı duvardan işçi geçer, düşman geçemez", () => {
  const room = oda();
  const { sol, sag } = bosKomsuIkili(room);
  const duvar = duvarOr(room, sol, sag);

  duvar.gate = true;
  assert.equal(room.canWorkerEnter(sol, sag), true, "isci kendi kapisindan gecemedi");
  // Kapinin butun anlami bu: dusman tarafinda hicbir karsiligi yok.
  assert.equal(room.getBlockingTowerBetween(sol, sag), duvar, "dusman kapidan gecti");
  assert.equal(room.isCellWalkable(sol, sag.col, sag.row), false, "dusman kapidan gecti");
});

test("yıkılan kapılı duvar kimseyi tutmaz", () => {
  const room = oda();
  const { sol, sag } = bosKomsuIkili(room);
  const duvar = duvarOr(room, sol, sag);
  duvar.gate = true;
  duvar.hp = 0;
  room.markNavigationDirty();
  assert.equal(room.canWorkerEnter(sol, sag), true);
  assert.equal(room.getBlockingTowerBetween(sol, sag), undefined);
});

test("işçi kulenin içinden geçemez ama dibinden teslim eder", () => {
  const room = oda();
  const { sol, sag } = bosKomsuIkili(room);
  room.placeTower(client, { ...gridToWorld(sag.col, sag.row, room.activeMap), definitionId: "warrior-1" });
  const kule = [...room.towers.values()].at(-1);
  assert.equal(kule.definition.id, "warrior-1");

  assert.equal(room.isWorkerCellOpen(sag.col, sag.row), false, "kule karesi isciye acik kaldi");

  // Kulenin bitisigindeki isci, kulenin karesine girmeden teslim etmeli.
  const isci = isciKoy(room, sol);
  assert.equal(room.moveLogisticsWorker(isci, kule.x, kule.y, 0.2), true, "bitisikten teslim edilemedi");
  const durdugu = worldToGrid(isci.x, isci.y, room.activeMap);
  assert.deepEqual({ col: durdugu.col, row: durdugu.row }, sol, "isci kulenin icine girdi");
});

test("işçi hedefe giderken duvarın etrafından dolaşır", () => {
  const room = oda();
  const { sol, sag } = bosKomsuIkili(room);
  const duvar = duvarOr(room, sol, sag);
  const hedef = gridToWorld(sag.col, sag.row, room.activeMap);
  const isci = isciKoy(room, sol);

  const adim = room.getWorkerApproachPoint(isci, hedef.x, hedef.y);
  assert.ok(adim, "duvarin etrafinda yol bulunamadi");
  const adimHucre = worldToGrid(adim.x, adim.y, room.activeMap);
  assert.notDeepEqual({ col: adimHucre.col, row: adimHucre.row }, sag, "isci duvarin icinden gecti");

  // Kapi acilinca dogrudan gecis: dolasmanin sebebi gercekten duvardi.
  duvar.gate = true;
  isci.routeStep = undefined;
  const kapili = room.getWorkerApproachPoint(isci, hedef.x, hedef.y);
  const kapiliHucre = worldToGrid(kapili.x, kapili.y, room.activeMap);
  assert.deepEqual({ col: kapiliHucre.col, row: kapiliHucre.row }, sag, "kapi acikken bile dolasti");
});

test("kapalı hatta işçi yerinde durur", () => {
  const room = oda();
  const { sol } = bosKomsuIkili(room);
  const isci = isciKoy(room, sol);
  // Dort yani da duvarla kapatilan bir isci hicbir yere gidemez.
  const gridSize = getMapGridSize(room.activeMap);
  for (const [dx, dy] of [[gridSize / 2, 0], [-gridSize / 2, 0], [0, gridSize / 2], [0, -gridSize / 2]]) {
    room.placeTower(client, { x: isci.x + dx, y: isci.y + dy, definitionId: "wall-1" });
  }
  const uzakHedef = gridToWorld(sol.col, room.activeMap.rows - 2, room.activeMap);
  const x = isci.x;
  const y = isci.y;
  assert.equal(room.moveLogisticsWorker(isci, uzakHedef.x, uzakHedef.y, 0.2), false);
  assert.equal(isci.x, x, "yolu kapali isci kimildadi");
  assert.equal(isci.y, y, "yolu kapali isci kimildadi");
});

test("kapı yalnızca duvarda ve yalnızca sahibi için açılır", () => {
  const room = oda();
  const { sol, sag } = bosKomsuIkili(room);
  const duvar = duvarOr(room, sol, sag);
  room.placeTower(client, { ...gridToWorld(sag.col, sag.row, room.activeMap), definitionId: "warrior-1" });
  const kule = [...room.towers.values()].at(-1);

  const gonder = (towerId, sessionId = "p1") =>
    room.toggleWallGate({ sessionId, send() {} }, { towerId });

  gonder(duvar.id);
  assert.equal(duvar.gate, true, "duvarda kapi acilmadi");
  gonder(duvar.id);
  assert.equal(duvar.gate, false, "kapi kapatilamadi");

  gonder(kule.id);
  assert.equal(kule.gate, false, "kulede kapi acildi");

  gonder(duvar.id, "p2");
  assert.equal(duvar.gate, false, "baskasinin duvarinda kapi acildi");
});
