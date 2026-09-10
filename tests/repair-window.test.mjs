/**
 * Tamirci ekseni: onarim hizi ve onarim penceresi.
 *
 * Onarim uzun sure yalnizca "kule yikilmasin" isiydi. Uc kart onu bir
 * **pencere**ye ceviriyor: Tamircinin o an dokundugu kule baska bir sey de
 * kazaniyor, yani onarimi yonetmek savasin parcasi oluyor.
 *
 * Pencerenin kisa bir kuyrugu var ve testlerin bir kismi tam olarak onu
 * tutuyor. Onarim tik tik ilerliyor; "su anda onariliyor mu" sorusu tek ana
 * bakarak sorulsaydi iki tik arasinda cevap hep hayir olur ve pencereye bagli
 * her odul karede bir yanip sonerdi.
 *
 * Odulun **onariliyor olmaya** bagli olmasi da kasitli, "hasar almis olmaya"
 * degil: birincisi oyuncunun verdigi bir karar, ikincisi kacinmaya calistigi
 * bir durum.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, getShopItem, towerCatalog, REPAIR_DEPOT_TOWER_ID } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

const kart = (id) => {
  const bulunan = cardCatalog.find((candidate) => candidate.id === id);
  assert.ok(bulunan, `${id} katalogda yok`);
  return bulunan;
};

function kur(room, definitionId) {
  const nokta = findBuildableSpot(room, definitionId);
  assert.ok(nokta, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId });
  return [...room.towers.values()].at(-1);
}

function tamirciTut(room) {
  room.state.players.get("p1").hiredWorkers.push({ role: "repairer" });
  room.updateDrones(16, 0.016);
  const tamirci = [...room.drones.values()].find((drone) => drone.mode === "repairer");
  assert.ok(tamirci, "tamirci sahaya cikmadi");
  return tamirci;
}

/** Oyuncuya bir kartin etkilerini ve kilitlerini verir. */
function kartAl(room, id) {
  const secilen = kart(id);
  const oyuncu = room.state.players.get("p1");
  oyuncu.runModifiers.push(...secilen.effects);
  oyuncu.ownedCardIds.push(id);
  room.invalidateTowerGrants();
  return secilen;
}

test("onarım hızı kart ve eşyaları katalogda", () => {
  for (const id of ["usta-cirak", "seri-kaynak"]) {
    assert.ok(
      kart(id).effects.some((m) => m.stat === "workerRepairRate" && m.add > 0),
      `${id}: onarim hizi vermiyor`
    );
  }
  for (const id of ["pnomatik-anahtar", "yedek-parca-sandigi"]) {
    const esya = getShopItem(id);
    assert.ok(esya, `${id} katalogda yok`);
    assert.ok(esya.effects.some((m) => m.stat === "workerRepairRate" && m.add > 0), `${id}: onarim hizi vermiyor`);
    // Tamircinin hizi kendisine ait; hedefi her an degistigi icin binaya takilamaz.
    assert.equal(esya.target, "global", `${id} kuleye takiliyor`);
  }
});

test("onarım hızı kartı gerçekten daha hızlı onarır", () => {
  const olc = (kartli) => {
    const room = oda();
    const duvar = kur(room, "wall-1");
    duvar.hp = 1;
    if (kartli) kartAl(room, "usta-cirak");
    const tamirci = tamirciTut(room);
    tamirci.x = duvar.x;
    tamirci.y = duvar.y;
    room.updateDrones(500, 0.5);
    return duvar.hp - 1;
  };
  const kartsiz = olc(false);
  const kartli = olc(true);
  assert.ok(
    Math.abs(kartli - kartsiz * 1.6) < 1e-6,
    `kartsiz ${kartsiz}, kartli ${kartli}, beklenen ${kartsiz * 1.6}`
  );
});

test("tamirci dokunduğu sürece onarım penceresi açık kalır", () => {
  const room = oda();
  const duvar = kur(room, "wall-1");
  duvar.hp = 1;
  const tamirci = tamirciTut(room);
  assert.equal(room.isTowerUnderRepair(duvar), false, "dokunulmadan pencere acik");

  tamirci.x = duvar.x;
  tamirci.y = duvar.y;
  room.updateDrones(16, 0.016);
  assert.equal(room.isTowerUnderRepair(duvar), true, "onarim penceresi acilmadi");
});

test("tamirci ayrılınca pencere kapanır", () => {
  // Kuyruk kisa olmali: odul Tamirci gidince bitmeli, yoksa \"onarilmis olmak\"
  // kalici bir buff olurdu.
  const room = oda();
  const duvar = kur(room, "wall-1");
  duvar.hp = 1;
  const tamirci = tamirciTut(room);
  tamirci.x = duvar.x;
  tamirci.y = duvar.y;
  room.updateDrones(16, 0.016);
  assert.equal(room.isTowerUnderRepair(duvar), true);

  duvar.repairedUntil = Date.now() - 1;
  assert.equal(room.isTowerUnderRepair(duvar), false, "pencere kendiliginden kapanmadi");
});

test("Tamir Ateşi yalnızca onarım penceresinde hasar verir", () => {
  const room = oda();
  const kule = kur(room, "warrior-1");
  kule.ammo = kule.maxAmmo;
  kule.energy = kule.maxEnergy;
  kartAl(room, "tamir-atesi");

  const olc = () => {
    room.spawnEnemy();
    const dusman = [...room.enemies.values()].at(-1);
    Object.assign(dusman, { hp: 100000, maxHp: 100000, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
    const once = dusman.hp;
    room.damageEnemy(dusman, 100, 0, "warrior-1", "p1", "physical", 0, kule.level, kule.id);
    const inen = once - dusman.hp;
    room.enemies.delete(dusman.id);
    return inen;
  };

  kule.repairedUntil = 0;
  const penceresiz = olc();
  kule.repairedUntil = Date.now() + 5000;
  const pencereli = olc();

  assert.ok(pencereli > penceresiz, `pencerede ${pencereli}, disinda ${penceresiz}`);
});

test("Tamir Ateşi kartsız hiçbir şey yapmaz", () => {
  // Kontrol: odulu veren kartin kendisi, pencerenin varligi degil.
  const room = oda();
  const kule = kur(room, "warrior-1");
  kule.ammo = kule.maxAmmo;
  kule.energy = kule.maxEnergy;

  const olc = () => {
    room.spawnEnemy();
    const dusman = [...room.enemies.values()].at(-1);
    Object.assign(dusman, { hp: 100000, maxHp: 100000, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
    const once = dusman.hp;
    room.damageEnemy(dusman, 100, 0, "warrior-1", "p1", "physical", 0, kule.level, kule.id);
    const inen = once - dusman.hp;
    room.enemies.delete(dusman.id);
    return inen;
  };

  kule.repairedUntil = 0;
  const penceresiz = olc();
  kule.repairedUntil = Date.now() + 5000;
  const pencereli = olc();

  assert.equal(pencereli, penceresiz, "kart yokken pencere hasar verdi");
});

test("Soğutmalı Kaynak yalnızca onarım penceresinde soğutur", () => {
  const room = oda();
  const kule = kur(room, "warrior-1");
  kartAl(room, "sogutmali-kaynak");

  kule.repairedUntil = 0;
  const penceresiz = room.getTowerCoolingPerSecond(kule);
  kule.repairedUntil = Date.now() + 5000;
  const pencereli = room.getTowerCoolingPerSecond(kule);

  assert.ok(
    Math.abs(pencereli - penceresiz * 2.2) < 1e-6,
    `pencerede ${pencereli}, disinda ${penceresiz}`
  );
});

test("Soğutmalı Kaynak kartsız hiçbir şey yapmaz", () => {
  const room = oda();
  const kule = kur(room, "warrior-1");

  kule.repairedUntil = 0;
  const penceresiz = room.getTowerCoolingPerSecond(kule);
  kule.repairedUntil = Date.now() + 5000;
  assert.equal(room.getTowerCoolingPerSecond(kule), penceresiz, "kart yokken pencere sogutma verdi");
});

test("tamir merkezi hâlâ her karakterin listesinde", () => {
  // Bu turda katalog buyudu; ortak yapinin listeden dusmedigini dogruluyoruz.
  for (const [karakter, liste] of Object.entries(towerCatalog)) {
    assert.ok(liste.some((tower) => tower.id === REPAIR_DEPOT_TOWER_ID), `${karakter}: merkez listede yok`);
  }
});
