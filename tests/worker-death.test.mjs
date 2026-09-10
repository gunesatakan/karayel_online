/**
 * Iscinin olumu.
 *
 * Bir donem isciler olumsuzdu ve kodda gerekcesi de yaziliydi: lojistik hatti
 * dusman yolunu kesmek zorunda oldugu icin olum, oyuncunun engelleyemedigi bir
 * sebeple ekonomisinin durmasi demekti. Olum geri geldi ama o itiraz hala
 * gecerli -- bu yuzden kayip kalici degil, sureli. Testler ikisini birlikte
 * tutuyor: isci gercekten oluyor **ve** gercekten geri geliyor.
 *
 * Kontrol testi onemli: dusmandan uzaktaki isci hicbir sey kaybetmemeli.
 * O olmadan "her isci her saniye erir" hatasi da gecerdi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ADVANCED_WORKER_MULTIPLIER,
  WORKER_MAX_HP,
  WORKER_RESPAWN_MS,
  enemyCombatDefinitions
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const LOJISTIK_ROLLER = ["crystalCollector", "ammoCollector", "energyTransport", "ammoTransport"];

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [];
  // Kadroyu sahaya cikar.
  room.updateDrones(16, 0.016);
  return room;
}

function isciler(room) {
  return [...room.drones.values()].filter((drone) => LOJISTIK_ROLLER.includes(drone.mode));
}

/** Verilen iscinin uzerine, temas mesafesinde bir dusman koyar. */
function temasEttir(room, isci, { type = "grunt", adet = 1 } = {}) {
  for (let i = 0; i < adet; i += 1) {
    room.spawnEnemy();
    const dusman = [...room.enemies.values()].at(-1);
    dusman.type = type;
    dusman.attack = enemyCombatDefinitions[type].attack;
    dusman.x = isci.x;
    dusman.y = isci.y;
  }
  room.enemySpatialGrid.rebuild(room.enemies.values());
}

/** Yalnizca isci hattini surer; dusman yuruyusu olcumu bulandirmasin diye. */
function tikla(room, saniye) {
  room.updateDrones(saniye * 1000, saniye);
}

test("işçiler canla sahaya çıkar, gelişmiş işçi üç katıyla", () => {
  const room = oda();
  for (const isci of isciler(room)) {
    assert.equal(isci.maxHp, WORKER_MAX_HP, `${isci.mode}: can yok`);
    assert.equal(isci.hp, WORKER_MAX_HP);
  }

  const oyuncu = room.state.players.get("p1");
  oyuncu.hiredWorkers.push({ role: "ammoTransport", advanced: true });
  room.updateDrones(16, 0.016);
  const gelismis = [...room.drones.values()].find((drone) => drone.advanced);
  assert.ok(gelismis, "gelismis isci sahaya cikmadi");
  assert.equal(gelismis.maxHp, WORKER_MAX_HP * ADVANCED_WORKER_MULTIPLIER);
});

test("temas eden işçi düşmanın saldırı gücü kadar saniyelik hasar alır", () => {
  const room = oda();
  const isci = isciler(room)[0];
  temasEttir(room, isci);
  const once = isci.hp;
  tikla(room, 0.5);
  const inen = once - isci.hp;
  assert.ok(
    Math.abs(inen - enemyCombatDefinitions.grunt.attack * 0.5) < 1e-6,
    `yarim saniyede ${inen} indi, beklenen ${enemyCombatDefinitions.grunt.attack * 0.5}`
  );
});

test("kalabalıktaki işçi her düşmandan ayrı ayrı yer", () => {
  // En gucluye birakilsaydi kalabalik hicbir sey yapmayan bir dekor olurdu.
  const room = oda();
  const isci = isciler(room)[0];
  temasEttir(room, isci, { adet: 3 });
  const once = isci.hp;
  tikla(room, 0.2);
  const inen = once - isci.hp;
  assert.ok(
    Math.abs(inen - enemyCombatDefinitions.grunt.attack * 3 * 0.2) < 1e-6,
    `uc dusman ${inen} indirdi`
  );
});

test("düşmandan uzaktaki işçi hiçbir şey kaybetmez", () => {
  const room = oda();
  const isci = isciler(room)[0];
  room.spawnEnemy();
  const dusman = [...room.enemies.values()].at(-1);
  dusman.x = isci.x + 400;
  dusman.y = isci.y + 400;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  const once = isci.hp;
  tikla(room, 1);
  assert.equal(isci.hp, once, "uzaktaki dusman isciyi yedi");
});

test("canı biten işçi sahadan kalkar ve hemen geri gelmez", () => {
  const room = oda();
  const isci = isciler(room)[0];
  const kimlik = isci.id;
  temasEttir(room, isci, { type: "brute" });
  isci.hp = 1;
  tikla(room, 1);
  assert.equal(room.drones.has(kimlik), false, "olen isci sahada kaldi");

  // Kadro her tick yeniden kuruluyor: sayac olmasa bir sonraki tick geri gelirdi.
  tikla(room, 0.016);
  assert.equal(room.drones.has(kimlik), false, "olen isci bir sonraki tickte geri geldi");
});

test("ölen işçi bekleme süresi dolunca geri gelir", () => {
  const room = oda();
  const isci = isciler(room)[0];
  const kimlik = isci.id;
  temasEttir(room, isci, { type: "brute" });
  isci.hp = 1;
  tikla(room, 1);
  assert.equal(room.drones.has(kimlik), false);

  // Dusmani sahadan kaldir: yerine dogan isci ayni brute'un icine dogup
  // olcumu bozmasin. Geri gelmenin kendisi olculuyor, dogar dogmaz yenmek degil.
  room.enemies.clear();
  room.enemySpatialGrid.rebuild(room.enemies.values());
  room.workerRespawnAt.set(kimlik, Date.now() - 1);
  tikla(room, 0.016);
  const yeni = room.drones.get(kimlik);
  assert.ok(yeni, "bekleme dolunca isci geri gelmedi");
  assert.equal(yeni.hp, WORKER_MAX_HP, "geri gelen isci yarali geldi");
  assert.ok(WORKER_RESPAWN_MS > 0);
});

test("kurulum aşaması kadroyu tamamlar", () => {
  // Olum bir dalganin cezasi; bir sonraki dalgaya eksik baslamak degil.
  const room = oda();
  const isci = isciler(room)[0];
  const kimlik = isci.id;
  temasEttir(room, isci, { type: "brute" });
  isci.hp = 1;
  tikla(room, 1);
  assert.equal(room.drones.has(kimlik), false);

  room.setupPhase = true;
  tikla(room, 0.016);
  assert.ok(room.drones.has(kimlik), "kurulumda kadro tamamlanmadi");
});

/**
 * Isci cani kart ve esyalarla buyur.
 *
 * Olum geri geldiginden beri bu bir eksen: lojistik hatti dusman yolunu kesmek
 * zorunda, yani "isci ne kadar dayanir" oyuncunun uzerinde soz sahibi oldugu
 * bir sey olmali.
 *
 * Iki sey ayri ayri tutuluyor. Carpan **okuma aninda** biniyor, yani kosu
 * ortasinda alinan kart sahadaki isciye de isliyor -- dogarken hesaplansaydi
 * kart yalnizca bir sonraki iscide gorunurdu. Ve yaralar kurulumda kapaniyor;
 * iscinin kendiliginden iyilesmesi yok ve Tamirci yapilari onariyor, iscileri
 * degil.
 */
import { cardCatalog, getShopItem } from "../packages/shared/dist/index.js";

const canKarti = (id) => {
  const kart = cardCatalog.find((candidate) => candidate.id === id);
  assert.ok(kart, `${id} katalogda yok`);
  return kart;
};

test("işçi canı kartları ve eşyaları katalogda", () => {
  for (const id of ["zirhli-tulum", "agir-vardiya"]) {
    const kart = canKarti(id);
    assert.ok(kart.effects.some((m) => m.stat === "workerHealth" && m.add > 0), `${id}: can vermiyor`);
  }
  for (const id of ["celik-yelek", "sahra-reviri"]) {
    const esya = getShopItem(id);
    assert.ok(esya, `${id} katalogda yok`);
    assert.ok(esya.effects.some((m) => m.stat === "workerHealth" && m.add > 0), `${id}: can vermiyor`);
    // Isci esyasi kuresel olmali: iscinin dayanikliligi bir binaya takilmaz.
    assert.equal(esya.target, "global", `${id} kuleye takiliyor`);
  }
});

test("koşu ortasında alınan can kartı sahadaki işçiye de işler", () => {
  const room = oda();
  const isci = isciler(room)[0];
  const once = room.getWorkerMaxHp(isci);

  room.state.players.get("p1").runModifiers.push(...canKarti("zirhli-tulum").effects);
  const sonra = room.getWorkerMaxHp(isci);
  assert.ok(
    Math.abs(sonra - once * 1.75) < 1e-6,
    `tavan ${once} -> ${sonra}, beklenen ${once * 1.75}`
  );
});

test("can kartı işçiyi gerçekten daha uzun ayakta tutar", () => {
  const olcum = (kartli) => {
    const room = oda();
    if (kartli) room.state.players.get("p1").runModifiers.push(...canKarti("agir-vardiya").effects);
    const isci = isciler(room)[0];
    isci.hp = room.getWorkerMaxHp(isci);
    temasEttir(room, isci, { type: "brute" });
    let saniye = 0;
    while (room.drones.has(isci.id) && saniye < 60) {
      tikla(room, 0.1);
      saniye += 0.1;
    }
    return saniye;
  };
  const kartsiz = olcum(false);
  const kartli = olcum(true);
  assert.ok(kartli > kartsiz + 0.05, `kartsiz ${kartsiz.toFixed(1)}sn, kartli ${kartli.toFixed(1)}sn`);
});

test("kurulum aşaması yaralı işçiyi de iyileştirir", () => {
  const room = oda();
  const isci = isciler(room)[0];
  isci.hp = 3;
  room.setupPhase = true;
  tikla(room, 0.016);
  assert.equal(isci.hp, room.getWorkerMaxHp(isci), "kurulumda yara kapanmadi");
});
