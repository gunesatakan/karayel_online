/**
 * Tamirci isci.
 *
 * Hattin altin harcamayan onarim yolu. Testler dort seyi tutuyor: gercekten
 * onariyor, yikilan yapiyi diriltmiyor (altinla onarimin kurali da bu, ikisi
 * ayrisamaz), hedefini kilitliyor ve gelismis kademesi uc kat calisiyor.
 *
 * Kilit en kritik detay. Kilit olmasa "en hasarli yapi" her tick yeniden
 * secilirdi: tamirci bir duvari onardikca o duvar listede geri duser, secim
 * baskasina kayar ve tamirci iki yapi arasinda gidip gelirken hicbirini
 * bitiremezdi. Dusmanin kirma hedefini kilitlemesiyle ayni sebep.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ADVANCED_WORKER_MULTIPLIER,
  HIRABLE_WORKER_ROLES,
  WORKER_REPAIR_PER_SECOND,
  WORKER_ROLE_LABELS
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function tamirciTut(room, { advanced = false } = {}) {
  room.state.players.get("p1").hiredWorkers.push({ role: "repairer", advanced: advanced || undefined });
  room.updateDrones(16, 0.016);
  const tamirci = [...room.drones.values()].find((drone) => drone.mode === "repairer");
  assert.ok(tamirci, "tamirci sahaya cikmadi");
  return tamirci;
}

function kur(room, definitionId) {
  const nokta = findBuildableSpot(room, definitionId);
  assert.ok(nokta, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId });
  return [...room.towers.values()].at(-1);
}

/** Tamirciyi hedefin uzerine koyup tek tick surer. */
function onart(room, tamirci, hedef, saniye) {
  tamirci.x = hedef.x;
  tamirci.y = hedef.y;
  room.updateDrones(saniye * 1000, saniye);
}

test("tamirci alınabilir bir rol olarak listede", () => {
  assert.ok(HIRABLE_WORKER_ROLES.includes("repairer"));
  assert.equal(WORKER_ROLE_LABELS.repairer, "Tamirci");
});

test("tamirci hasarlı yapıya saniyede sabit can yazar", () => {
  const room = oda();
  const duvar = kur(room, "wall-1");
  duvar.hp = 1;
  const tamirci = tamirciTut(room);
  onart(room, tamirci, duvar, 0.5);
  assert.ok(
    Math.abs(duvar.hp - (1 + WORKER_REPAIR_PER_SECOND * 0.5)) < 1e-6,
    `yarim saniyede ${duvar.hp} oldu`
  );
});

test("gelişmiş tamirci üç kat hızlı onarır", () => {
  const room = oda();
  const duvar = kur(room, "wall-1");
  duvar.hp = 1;
  const tamirci = tamirciTut(room, { advanced: true });
  onart(room, tamirci, duvar, 0.5);
  assert.ok(
    Math.abs(duvar.hp - (1 + WORKER_REPAIR_PER_SECOND * ADVANCED_WORKER_MULTIPLIER * 0.5)) < 1e-6,
    `yarim saniyede ${duvar.hp} oldu`
  );
});

test("tamirci canı tavana çıkarınca durur", () => {
  const room = oda();
  const duvar = kur(room, "wall-1");
  duvar.hp = duvar.maxHp - 1;
  const tamirci = tamirciTut(room);
  onart(room, tamirci, duvar, 5);
  assert.equal(duvar.hp, duvar.maxHp, "can tavani asilmis ya da doldurulmamis");
});

test("tamirci yıkılan yapıyı diriltmez", () => {
  // Altinla onarim da diriltmiyor: yikilan yapi yeniden insa isi. Iki yolun
  // ayni seyi soylemesi gerek, yoksa tamirci altinla yapilamayani yapardi.
  const room = oda();
  const duvar = kur(room, "wall-1");
  duvar.hp = 0;
  const tamirci = tamirciTut(room);
  onart(room, tamirci, duvar, 2);
  assert.equal(duvar.hp, 0, "yikilan yapi dirildi");
});

test("tamirci hedefini kilitler, onardıkça başkasına kaymaz", () => {
  const room = oda();
  const ilk = kur(room, "wall-1");
  const ikinci = kur(room, "warrior-1");
  // Ikisi de hasarli; ilki daha kotu durumda, yani ilk secim o olmali.
  ilk.hp = ilk.maxHp * 0.2;
  ikinci.hp = ikinci.maxHp * 0.3;
  const tamirci = tamirciTut(room);

  assert.equal(room.getRepairWorkerTarget(tamirci).id, ilk.id, "en kotu durumdaki yapi secilmedi");
  tamirci.targetTowerId = ilk.id;
  // Onarim ilerledi ve artik oteki daha kotu durumda: kilit olmasa secim kayardi.
  ilk.hp = ilk.maxHp * 0.9;
  assert.equal(room.getRepairWorkerTarget(tamirci).id, ilk.id, "hedef onarim sirasinda kaydi");

  ilk.hp = ilk.maxHp;
  assert.equal(room.getRepairWorkerTarget(tamirci).id, ikinci.id, "biten hedef birakilmadi");
});

test("onaracak bir şey yoksa tamirci yerinde durur", () => {
  const room = oda();
  const tamirci = tamirciTut(room);
  const x = tamirci.x;
  const y = tamirci.y;
  room.updateDrones(1000, 1);
  assert.equal(tamirci.x, x);
  assert.equal(tamirci.y, y);
});
