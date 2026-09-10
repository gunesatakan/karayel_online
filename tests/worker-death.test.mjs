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
