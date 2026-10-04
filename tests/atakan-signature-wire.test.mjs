/**
 * Atakan imzalarinin tel alanlari: `o`, `t` (Obsesyon) ve `u`, `m` (Ucube).
 *
 * Istemci bu mekanikleri baska yerden ogrenemiyordu: Obsesyon'un vurus basina
 * +%20 yigini ve Ucube'nin atis hizi yigini ekranda yoktu. Alanlar tek harfli,
 * varsayilanda anahtar olarak da yok (`undefined` bile degil) ve kule kayitlari
 * delta ile gittigi icin yalnizca degistiklerinde telde. Testler:
 *
 * - Alan yalnizca ilgili kulede ve yalnizca deger varken yaziliyor.
 * - Obsesyon yigini sunucunun kendi atis hazirligiyla (ayni hedef) artiyor,
 *   hedef degisince ikisi birden dusuyor.
 * - Ucube yigini saniyede bir artiyor; tavan 10'da yok, 15 / 20'de var.
 * - Delta: degismeyen yigin tekrar gitmiyor, biten yigin `null` ile siliniyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1" };

function placeTower(definitionId) {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId }, { free: true, ignoreLimit: true });
  const tower = [...room.towers.values()].find((candidate) => candidate.definition.id === definitionId);
  assert.ok(tower, `${definitionId} kurulamadi`);
  return { room, tower };
}

const record = (room, tower) => room.getSnapshot().towers.find((entry) => entry.id === tower.id);
const SIGNATURE_KEYS = ["o", "t", "u", "m"];

test("Obsesyon yığını ve hedefi telde; yığın yokken anahtar da yok", () => {
  const { room, tower } = placeTower("warrior-4");
  let wire = record(room, tower);
  for (const key of SIGNATURE_KEYS) assert.ok(!(key in wire), `bos yiginda ${key} anahtari yazilmamali`);

  tower.focusTargetId = "e7";
  tower.focusStacks = 4;
  wire = record(room, tower);
  assert.equal(wire.o, 4);
  assert.equal(wire.t, "e7");
  assert.ok(!("u" in wire) && !("m" in wire), "Ucube alanlari Obsesyon'da yok");
});

test("Obsesyon yığını aynı hedefte artıyor, hedef değişince ikisi birden düşüyor", () => {
  const { room, tower } = placeTower("warrior-4");
  const first = { id: "e-bir" };
  const second = { id: "e-iki" };
  // Sunucunun kendi atis hazirligi: ilk atis hedefi kilitliyor (yigin 0),
  // sonrakiler ayni hedefte yigini artiriyor.
  room.prepareTowerShot(tower, first);
  room.prepareTowerShot(tower, first);
  room.prepareTowerShot(tower, first);
  let wire = record(room, tower);
  assert.equal(wire.o, 2);
  assert.equal(wire.t, "e-bir");
  for (let index = 0; index < 20; index += 1) room.prepareTowerShot(tower, first);
  assert.equal(record(room, tower).o, 10, "yigin 10'da duruyor");

  room.prepareTowerShot(tower, second);
  wire = record(room, tower);
  assert.ok(!("o" in wire) && !("t" in wire), "hedef degisince yigin ve hedef birlikte dusmeli");
  room.prepareTowerShot(tower, second);
  wire = record(room, tower);
  assert.equal(wire.o, 1);
  assert.equal(wire.t, "e-iki");
});

test("Ucube yığını saniyede bir artıyor; tavan 10 yazılmıyor, 15 ve 20 yazılıyor", () => {
  const { room, tower } = placeTower("warrior-6");
  let wire = record(room, tower);
  for (const key of SIGNATURE_KEYS) assert.ok(!(key in wire), `bos yiginda ${key} anahtari yazilmamali`);

  const target = { id: "e1" };
  for (let second = 0; second < 3; second += 1) room.updateUcubeRhythm(tower, target, 1000);
  wire = record(room, tower);
  assert.equal(wire.u, 3);
  assert.ok(!("m" in wire), "varsayilan tavan (10) yazilmamali");
  assert.ok(!("o" in wire) && !("t" in wire), "Obsesyon alanlari Ucube'de yok");

  tower.ucubePerks.push("stacks-15");
  assert.equal(record(room, tower).m, 15);
  tower.ucubePerks.push("stacks-20");
  assert.equal(record(room, tower).m, 20);

  // Hedefsiz kalinca yigin sifirlaniyor; tavan (kalici ozellik) kaliyor.
  room.updateUcubeRhythm(tower, undefined, 16);
  wire = record(room, tower);
  assert.ok(!("u" in wire), "sifir yigin yazilmamali");
  assert.equal(wire.m, 20);
});

test("Atakan imza alanları başka kulelere sızmıyor", () => {
  for (const definitionId of ["warrior-1", "warrior-2", "warrior-3", "warrior-5"]) {
    const { room, tower } = placeTower(definitionId);
    tower.focusStacks = 5;
    tower.focusTargetId = "e1";
    const wire = record(room, tower);
    for (const key of SIGNATURE_KEYS) assert.ok(!(key in wire), `${definitionId} ${key} yazmamali`);
  }
});

test("Takipçi işaretinin kaynağı (k) yalnızca işaret varken telde", () => {
  const { room, tower } = placeTower("warrior-1");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()][0];
  const enemyRecord = () => room.getSnapshot().enemies.find((entry) => entry.id === enemy.id);
  assert.ok(!("k" in enemyRecord()), "isaretsiz dusmanda k yok");
  // Gercek yol: Takipci'nin vurusu isaret koyuyor ve kaynagi yaziyor.
  enemy.hp = 1e9;
  enemy.maxHp = 1e9;
  room.damageEnemy(enemy, 1, 0, "warrior-1", "p1", "physical", 0, tower.level, tower.id);
  const marked = enemyRecord();
  assert.ok(marked.trackingStacks > 0);
  assert.equal(marked.k, tower.id);
  // Isaret bitince kaynak da telden dusuyor (eski kaynak modelde kalsa bile).
  enemy.trackingStackUntil.fill(0);
  assert.ok(!("k" in enemyRecord()));
});

test("delta: değişmeyen yığın tekrar gitmiyor, biten yığın null ile siliniyor", () => {
  const { room, tower } = placeTower("warrior-4");
  tower.focusTargetId = "e7";
  tower.focusStacks = 3;
  const send = () => {
    const { wire, towerBaseline, enemyBaseline } = room.applyWireDelta(room.getSnapshot());
    room.commitWireBaseline(towerBaseline, enemyBaseline);
    return wire.towers.find((entry) => entry.id === tower.id);
  };
  const full = send();
  assert.equal(full.o, 3);
  const same = send();
  assert.ok(!("o" in same) && !("t" in same), "degismeyen yigin tekrar gonderilmemeli");
  tower.focusStacks = 4;
  const grown = send();
  assert.equal(grown.o, 4);
  assert.ok(!("t" in grown), "hedef degismedi, tekrar gitmemeli");
  tower.focusStacks = 0;
  const reset = send();
  assert.equal(reset.o, null, "biten yigin null ile silinmeli");
  assert.equal(reset.t, null);
});
