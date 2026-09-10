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
  REPAIR_DEPOT_TOWER_ID,
  WORKER_REPAIR_PER_SECOND,
  WORKER_ROLE_LABELS,
  isOperationalTower,
  occupiesTowerSlot,
  towerCatalog
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

test("kaynak efekti yalnızca gerçek onarım sırasında etkinleşir", () => {
  const room = oda();
  const tower = kur(room, "warrior-1");
  tower.hp = 1;
  const worker = tamirciTut(room);
  onart(room, worker, tower, 0.1);
  assert.equal(worker.repairing, true);
  assert.equal(room.getSnapshot().drones.find(d => d.id === worker.id).repairing, true);
  tower.hp = tower.maxHp;
  room.updateRepairWorker(worker, 0.1);
  assert.equal(worker.repairing, undefined);
  assert.equal(room.getSnapshot().drones.find(d => d.id === worker.id).repairing, undefined);
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

/**
 * Tamir Merkezi: Tamircinin ussu.
 *
 * Iki soz veriyor. Bosta kalan isci oraya doner -- yoksa iscinin durdugu yer
 * bir karar degil, son isinin bittigi yerdir. Ve mudahale oradan baslar: once
 * merkezin cemberi, sonra haritanin kalani.
 *
 * Cemberin **sinir degil oncelik** olmasi kasitli ve testi ayri: sinir olsaydi
 * merkezi yanlis koseye kuran oyuncunun iscisi bosa alinmis olurdu.
 */

const merkezTanimi = () => towerCatalog.warrior.find((tower) => tower.id === REPAIR_DEPOT_TOWER_ID);

/** Merkezi verilen dunya noktasina kurar. */
function merkezKur(room, x, y) {
  room.placeTower(client, { x, y, definitionId: REPAIR_DEPOT_TOWER_ID });
  const merkez = [...room.towers.values()].at(-1);
  assert.equal(merkez.definition.id, REPAIR_DEPOT_TOWER_ID, "merkez kurulamadi");
  return merkez;
}

test("tamir merkezi her karakterin listesinde", () => {
  for (const [karakter, liste] of Object.entries(towerCatalog)) {
    assert.ok(liste.some((tower) => tower.id === REPAIR_DEPOT_TOWER_ID), `${karakter}: merkez listede yok`);
  }
});

test("tamir merkezi ateş etmez, deposu da yoktur", () => {
  // Duvarin dustugu tuzak: ates etmeyen yapiya kapasite verilirse isciler ona
  // ates etmeyecegi mühimmati tasir.
  assert.equal(isOperationalTower(merkezTanimi()), false);
  const room = oda();
  const merkez = merkezKur(room, ...Object.values(findBuildableSpot(room, REPAIR_DEPOT_TOWER_ID)));
  assert.equal(merkez.maxAmmo, 0, "merkezin mühimmat deposu var");
  assert.equal(merkez.maxEnergy, 0, "merkezin enerji deposu var");
  assert.equal(room.acceptsTowerOperation(merkez), false, "merkez kule islemine giriyor");
});

test("tamir merkezi kule kontenjanından yer yer", () => {
  // Kareyi kapliyor. Duvar gibi bedava olsaydi kurmak bir karar olmazdi.
  assert.equal(occupiesTowerSlot(merkezTanimi()), true);
});

test("boşta kalan tamirci merkeze döner", () => {
  const room = oda();
  const nokta = findBuildableSpot(room, REPAIR_DEPOT_TOWER_ID);
  const merkez = merkezKur(room, nokta.x, nokta.y);
  const tamirci = tamirciTut(room);
  // Isciyi merkezden uzaga koy: onaracak bir sey yok, tek isi eve donmek.
  tamirci.x = merkez.x + 300;
  tamirci.y = merkez.y + 300;
  const onceki = Math.hypot(tamirci.x - merkez.x, tamirci.y - merkez.y);
  room.updateDrones(500, 0.5);
  const sonraki = Math.hypot(tamirci.x - merkez.x, tamirci.y - merkez.y);
  assert.ok(sonraki < onceki, `tamirci merkeze yaklasmadi: ${onceki} -> ${sonraki}`);
});

test("merkezi olmayan tamirci boşta yerinde durur", () => {
  // Kontrol: donus davranisi gercekten merkezden geliyor.
  const room = oda();
  const tamirci = tamirciTut(room);
  const x = tamirci.x;
  const y = tamirci.y;
  room.updateDrones(500, 0.5);
  assert.equal(tamirci.x, x);
  assert.equal(tamirci.y, y);
});

test("tamirci önce merkezinin çevresine bakar", () => {
  const room = oda();
  const nokta = findBuildableSpot(room, REPAIR_DEPOT_TOWER_ID);
  const merkez = merkezKur(room, nokta.x, nokta.y);
  const tamirci = tamirciTut(room);

  const yakin = kur(room, "wall-1");
  const uzak = kur(room, "warrior-1");
  // Yakini merkezin cemberine, uzagi disina tasi.
  yakin.x = merkez.x + 20;
  yakin.y = merkez.y + 20;
  uzak.x = merkez.x + 900;
  uzak.y = merkez.y + 900;
  room.markNavigationDirty();

  // Uzaktaki DAHA kotu durumda: merkez olmasa o secilirdi.
  yakin.hp = yakin.maxHp * 0.8;
  uzak.hp = uzak.maxHp * 0.1;
  tamirci.targetTowerId = "";

  assert.equal(room.getRepairWorkerTarget(tamirci).id, yakin.id, "merkez cemberi onceligi islemedi");
});

test("çevre temizse tamirci haritanın kalanına bakar", () => {
  // Cember bir sinir degil oncelik: icerisi tamamsa isci bosta beklemez.
  const room = oda();
  const nokta = findBuildableSpot(room, REPAIR_DEPOT_TOWER_ID);
  const merkez = merkezKur(room, nokta.x, nokta.y);
  const tamirci = tamirciTut(room);

  const uzak = kur(room, "warrior-1");
  uzak.x = merkez.x + 900;
  uzak.y = merkez.y + 900;
  uzak.hp = uzak.maxHp * 0.3;
  room.markNavigationDirty();
  tamirci.targetTowerId = "";

  assert.equal(room.getRepairWorkerTarget(tamirci).id, uzak.id, "cember disindaki yapi hic secilmedi");
});
