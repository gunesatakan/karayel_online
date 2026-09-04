/**
 * Ulti gucu.
 *
 * Ulti hasari eskiden dalgayla kendiliginden buyuyordu; oyuncunun ustunde soz
 * hakki yoktu ve Atakan ultisi 1. dalgada tam olarak 1 hasar veriyordu (dalga
 * sayisinin kupu). Artik hasar sabit, buyumesi altina bagli: bes kademe, her
 * biri hasari ikiye katliyor, bedeli %50 artiyor.
 *
 * Buradaki testlerin tuttugu sozler: hasar dalgadan bagimsiz, kademe egrisi
 * dogru, ve Atakan ultisi ilk turda geliştirmesiz her dusmani tek atiyor --
 * ultinin kendi tarifi bu, altina inen bir deger onu yarim birakir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ATAKAN_ULTIMATE_DRONE_DAMAGE,
  ULTIMATE_POWER_BASE_COST,
  ULTIMATE_POWER_MAX_LEVEL,
  ZEYNEP_COLUMN_ULTIMATE_DAMAGE,
  canUpgradeUltimatePower,
  getUltimatePowerMultiplier,
  getUltimatePowerUpgradeCost
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

test("bes kademe var, her biri hasari ikiye katlar", () => {
  assert.equal(ULTIMATE_POWER_MAX_LEVEL, 5);
  assert.deepEqual(
    Array.from({ length: 6 }, (_, level) => getUltimatePowerMultiplier(level)),
    [1, 2, 4, 8, 16, 32]
  );
  // Sinirin otesi son kademede kalir; carpani ustunde bir sey yok.
  assert.equal(getUltimatePowerMultiplier(9), 32);
  assert.equal(getUltimatePowerMultiplier(-3), 1);
});

test("bedel 100'den baslar ve her kademede %50 artar", () => {
  assert.equal(ULTIMATE_POWER_BASE_COST, 100);
  assert.deepEqual(
    Array.from({ length: 5 }, (_, level) => getUltimatePowerUpgradeCost(level)),
    [100, 150, 225, 338, 506]
  );
  assert.equal(getUltimatePowerUpgradeCost(5), undefined, "son kademeden sonra alinacak sey yok");
});

test("odeyemeyen gelistiremez, tamamlayan da", () => {
  assert.equal(canUpgradeUltimatePower(0, 99), false);
  assert.equal(canUpgradeUltimatePower(0, 100), true);
  assert.equal(canUpgradeUltimatePower(5, 1_000_000), false);
});

test("Atakan ulti hasari dalgadan bagimsizdir", () => {
  // Asil degisiklik bu: sayi artik oyuncunun karariyla buyuyor, saatle degil.
  const room = createRoom("warrior");
  const olculen = new Set();
  for (const wave of [1, 2, 5, 10, 20]) {
    room.wave = wave;
    olculen.add(room.getAtakanDroneDamage("p1"));
  }

  assert.equal(olculen.size, 1, `hasar dalgayla degisti: ${[...olculen].join(", ")}`);
  assert.equal([...olculen][0], ATAKAN_ULTIMATE_DRONE_DAMAGE);
});

test("Zeynep sutun ultisi de dalgadan bagimsizdir", () => {
  const room = createRoom("zeynep");
  const olculen = new Set();
  for (const wave of [1, 3, 10, 20]) {
    room.wave = wave;
    olculen.add(room.getZeynepColumnUltimateDamage("p1"));
  }

  assert.equal(olculen.size, 1, `hasar dalgayla degisti: ${[...olculen].join(", ")}`);
  assert.equal([...olculen][0], ZEYNEP_COLUMN_ULTIMATE_DAMAGE);
});

test("Atakan ultisi ilk turda gelistirmesiz her dusmani tek atar", () => {
  const room = createRoom("warrior");
  room.wave = 1;
  // Dalganin tum tiplerini gormek icin bol doğum: tip secimi rastgele.
  for (let index = 0; index < 400; index += 1) {
    room.spawnEnemy();
  }

  const hasar = room.getAtakanDroneDamage("p1");
  assert.equal(room.state.players.get("p1").ultimatePower ?? 0, 0, "test gelistirmesiz olmali");

  let enDayanikli = 0;
  for (const enemy of room.enemies.values()) {
    // Drone hasari gercek hasar, yani zirh ve direncler devrede degil. Ama
    // kalkan yarim oranda soguruyor: bir kalkan puani iki hasara mal oluyor.
    // Can ile kalkani duz toplamak dusmani oldugundan zayif gosterir.
    const gereken = enemy.hp + enemy.shield * 2;
    enDayanikli = Math.max(enDayanikli, gereken);
    assert.ok(hasar >= gereken, `${enemy.type} tek atilmiyor: ${hasar} < ${gereken}`);
  }

  assert.ok(enDayanikli > 0, "dalga 1'de hic dusman dogmadi");
});

test("gelistirme altini duser, kademeyi yukseltir ve hasari iki katlar", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 100;

  const oncekiHasar = room.getAtakanDroneDamage("p1");
  room.upgradeUltimatePower(client);

  assert.equal(player.ultimatePower, 1);
  assert.equal(player.gold, 0, "bedel dusulmedi");
  assert.equal(player.goldSpent, 100, "harcama kaydedilmedi");
  assert.equal(room.getAtakanDroneDamage("p1"), oncekiHasar * 2);
});

test("altin yetmiyorsa gelistirme olmaz", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 99;

  room.upgradeUltimatePower(client);

  assert.equal(player.ultimatePower, 0, "bedava gelistirildi");
  assert.equal(player.gold, 99, "altin dusuruldu");
});

test("bes kademeden fazlasi alinamaz", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 1_000_000;

  let odenen = 0;
  for (let deneme = 0; deneme < 8; deneme += 1) {
    const oncekiAltin = player.gold;
    room.upgradeUltimatePower(client);
    odenen += oncekiAltin - player.gold;
  }

  assert.equal(player.ultimatePower, ULTIMATE_POWER_MAX_LEVEL);
  assert.equal(odenen, 100 + 150 + 225 + 338 + 506, "toplam bedel egriyle uyusmuyor");
  assert.equal(room.getAtakanDroneDamage("p1"), ATAKAN_ULTIMATE_DRONE_DAMAGE * 32);
});

test("ulti gucu anlik goruntude oyuncuya bildirilir", () => {
  // Istemci kademeyi kendi sayamaz: bedel ve carpan sunucudan gelmeli, yoksa
  // dugmedeki fiyat ile gercek fiyat ayrisir.
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.gold = 250;
  room.upgradeUltimatePower(client);

  const own = room.getSnapshot().players.find((entry) => entry.id === "p1");
  assert.equal(own?.ultimatePower, 1);
});

/**
 * Tek atma sozunun ucdan uca kaniti.
 *
 * Yukaridaki test hasarin cana yettigini olcuyor; bu test ultinin gercekten
 * basildigini, drone'un ucup hedefine vardigini ve dusmanin oldugunu goruyor.
 * Ikisi ayri sey: yeterli hasar, uygulanmayan hasar olabilir.
 */
function fireAtakanUltimateAt(enemyType) {
  const room = createRoom("warrior");
  room.wave = 1;

  const spot = findBuildableSpot(room, "warrior-1");
  assert.ok(spot, "Atakan kulesi icin yer bulunamadi");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];

  // Istenen tipi yakalayana kadar dogur, gerisini sahadan cikar: tip secimi
  // rastgele ve testin konusu tek bir tipin dayanikliligi.
  let hedef;
  for (let deneme = 0; deneme < 600 && !hedef; deneme += 1) {
    room.spawnEnemy();
    const enemy = [...room.enemies.values()].at(-1);
    if (enemy.type === enemyType) {
      hedef = enemy;
    }
  }
  assert.ok(hedef, `${enemyType} dogmadi`);

  for (const [id, enemy] of [...room.enemies]) {
    if (enemy !== hedef) room.enemies.delete(id);
  }
  hedef.x = tower.x + 20;
  hedef.y = tower.y;
  const etkinCan = hedef.hp + hedef.shield;
  room.enemySpatialGrid.rebuild(room.enemies.values());

  room.state.players.get("p1").ultimateCharge = 100;
  room.useUltimate(client, { mode: "attack" });

  for (let tick = 0; tick < 400 && room.drones.size > 0; tick += 1) {
    room.updateDrones(50, 0.05);
  }

  return { oldu: !room.enemies.has(hedef.id), etkinCan, kalan: hedef.hp + hedef.shield };
}

test("ilk turdaki her dusman tipi tek drone ile olur", () => {
  for (const enemyType of ["grunt", "runner", "shooter", "brute"]) {
    const sonuc = fireAtakanUltimateAt(enemyType);
    assert.ok(
      sonuc.oldu,
      `${enemyType} tek atilmadi: ${sonuc.etkinCan} candan ${sonuc.kalan} kaldi`
    );
  }
});
