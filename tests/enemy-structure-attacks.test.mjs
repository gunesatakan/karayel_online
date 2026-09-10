/**
 * Dusmanin yapilara vurusu.
 *
 * Iki soru burada tutuluyor. Birincisi: her dusmanin kendi saldiri gucu var mi.
 * Bir sure hepsi 12'ydi ve o sayi bir yer tutucuydu -- kacan runner ile agir
 * brute ayni sertlikte vuruyordu. Ikincisi: nisanci gercekten **uzaktan**
 * vuruyor mu. "Menzilli dusman" bir sifattan ibaret kalmasin diye test dokunma
 * mesafesinin disindan hasar aramak zorunda.
 *
 * Her menzilli testin bir de kontrolu var: ayni yerdeki menzilsiz dusman hicbir
 * sey yapmiyor. O olmadan "herkes her yerden vuruyor" hatasi da gecerdi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { enemyCombatDefinitions, getMapGridSize, towerCatalog } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

/** Bir yapi kurar ve onun `attackRange` disina, ama menzil icine bir dusman koyar. */
function nisanciKarsisindaYapi(room, definitionId, { type = "shooter", mesafe } = {}) {
  const nokta = findBuildableSpot(room, definitionId);
  assert.ok(nokta, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId });
  const yapi = [...room.towers.values()].at(-1);
  assert.ok(yapi, `${definitionId} kurulamadi`);

  room.spawnEnemy();
  const dusman = [...room.enemies.values()].at(-1);
  dusman.type = type;
  const tanim = enemyCombatDefinitions[type];
  dusman.attack = tanim.attack;
  dusman.attackRange = room.scaleWorldDistance(tanim.attackRange ?? 0);
  dusman.towerAttackCooldownMs = 0;
  // Bir hucreden uzakta ama menzil icinde: bitisik vurusun kapsayamayacagi yer.
  const gridSize = getMapGridSize(room.activeMap);
  dusman.x = yapi.x;
  dusman.y = yapi.y - (mesafe ?? gridSize * 2);
  return { yapi, dusman };
}

test("her düşmanın kendi saldırı gücü var", () => {
  const guçler = Object.values(enemyCombatDefinitions).map((tanim) => tanim.attack);
  for (const [tur, tanim] of Object.entries(enemyCombatDefinitions)) {
    assert.ok(tanim.attack > 0, `${tur}: saldiri gucu yok`);
  }
  // Asil sinav bu: hepsi ayni sayiysa "saldiri gucu" diye bir stat yok demektir.
  assert.ok(new Set(guçler).size > 1, "butun dusmanlar ayni sertlikte vuruyor");
  assert.ok(
    enemyCombatDefinitions.brute.attack > enemyCombatDefinitions.runner.attack,
    "agir govde kacan dusmandan sert vurmali"
  );
});

test("menzil yalnızca nişancıda var ve kule menzilinin altında kalır", () => {
  const menzilliler = Object.entries(enemyCombatDefinitions).filter(([, tanim]) => (tanim.attackRange ?? 0) > 0);
  assert.deepEqual(menzilliler.map(([tur]) => tur), ["shooter"]);

  // Duello kulenin lehine acik kalmali: nisanci kuleyi vurabilmeli ama kule
  // once vurmali. Karsilastirma atis yapan kulelerin ortancasina karsi.
  const kuleMenzilleri = Object.values(towerCatalog).flat()
    .filter((tanim) => tanim.range > 0 && tanim.range < 400)
    .map((tanim) => tanim.range)
    .sort((a, b) => a - b);
  const ortanca = kuleMenzilleri[Math.floor(kuleMenzilleri.length / 2)];
  assert.ok(
    enemyCombatDefinitions.shooter.attackRange < ortanca,
    `nisanci menzili (${enemyCombatDefinitions.shooter.attackRange}) kule ortancasindan (${ortanca}) kisa olmali`
  );
});

test("nişancı dokunmadığı kuleyi vurur", () => {
  const room = oda();
  const { yapi, dusman } = nisanciKarsisindaYapi(room, "warrior-1");
  const once = yapi.hp;
  room.updateEnemies(0.05);
  assert.ok(yapi.hp < once, "menzilli dusman kuleye hasar vermedi");
  assert.ok(dusman.towerAttackCooldownMs > 0, "vurus bekleme suresi baslamadi");
});

test("nişancı duvarı da vurur", () => {
  // Duvar dokunulmaz bir zemin degil. Menzilli dusman duvari da hedefe alir,
  // yoksa nisancinin karsi-oyunu "duvarin arkasina saklan" olurdu.
  const room = oda();
  const { yapi } = nisanciKarsisindaYapi(room, "wall-1");
  const once = yapi.hp;
  room.updateEnemies(0.05);
  assert.ok(yapi.hp < once, "menzilli dusman duvara hasar vermedi");
});

test("menzilsiz düşman aynı yerden hiçbir şey yapamaz", () => {
  const room = oda();
  const { yapi } = nisanciKarsisindaYapi(room, "warrior-1", { type: "grunt" });
  const once = yapi.hp;
  room.updateEnemies(0.05);
  assert.equal(yapi.hp, once, "menzilsiz dusman uzaktan vurdu");
});

test("nişancının atışı ekranda bir iz bırakır", () => {
  // Hasar gorunmuyorsa oyuncu kulesinin neden eridigini anlamaz.
  const room = oda();
  nisanciKarsisindaYapi(room, "warrior-1");
  room.updateEnemies(0.05);
  const izler = [...room.beams.values()].filter((isin) => isin.definitionId === "enemy-shot");
  assert.equal(izler.length, 1, "menzilli vurusun izi cizilmedi");
  assert.ok(izler[0].ttlMs > 0);
});

test("kuşatma düşmanı yapı çarpanını bitişik vuruşta korur", () => {
  // Menzilli ve bitisik vurus ayni yerden geciyor; carpanin o tasinmada
  // dusmedigini dogrulamak icin.
  const room = oda();
  const nokta = findBuildableSpot(room, "wall-1");
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId: "wall-1" });
  const duvar = [...room.towers.values()].at(-1);

  room.spawnEnemy();
  const kusatma = [...room.enemies.values()].at(-1);
  kusatma.type = "siege";
  kusatma.attack = enemyCombatDefinitions.siege.attack;
  kusatma.attackRange = 0;
  const oncekiHp = duvar.hp;
  room.strikeStructure(kusatma, duvar);
  const kusatmaHasari = oncekiHp - duvar.hp;

  duvar.hp = oncekiHp;
  const grunt = { ...kusatma, type: "grunt", attack: enemyCombatDefinitions.siege.attack, towerAttackCooldownMs: 0 };
  room.strikeStructure(grunt, duvar);
  const normalHasar = oncekiHp - duvar.hp;

  assert.ok(kusatmaHasari > normalHasar, "kusatma carpani kaybolmus");
});
