/**
 * Magaza esyalarinin gercekten baglanip baglanmadigi.
 *
 * Bir esyanin degistiricisi iki yerden birine yazilir: kuresel esyalarinki
 * oyuncunun listesine, kuleye takilanlarinki o kulenin listesine. Vaat edilen
 * seyi okuyan kod da bir katmandan okur. Ikisi tutmazsa esya satin alinir,
 * takilir, arayuzde gorunur ve **hicbir sey yapmaz** -- hata sessizdir, cunku
 * kirilan bir sey yoktur, sadece hicbir sey olmaz.
 *
 * Dort esya boyle olmustu:
 *
 *   - Ganimet Kesesi kuleye takiliyordu, altin kazanci oyuncudan okunuyordu.
 *   - Komuta Modulu kuleye takiliyordu, isaret gucu oyuncudan okunuyordu.
 *   - Vardiya Amiri ve Seyyar Depo "tum iscilerin" diyordu ama kuleye
 *     takiliyordu; ustelik isci calistiran kaynak binalarina takilamiyordu, yani
 *     hicbir isciye ulasamiyorlardi.
 *
 * Asagidaki son test bu sinifi topluca kapatir: kuleye takilan hicbir esya,
 * yalnizca oyuncu katmanindan okunan bir stat vaat edemez.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canEquipShopItem,
  getModifierAdd,
  getShopItem,
  isGlobalShopItem,
  shopCatalog,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/** Esyayi satin alinmis sayar: kureselse oyuncuya, degilse envantere. */
function buyItem(room, itemId) {
  const item = getShopItem(itemId);
  assert.ok(item, `${itemId} katalogda yok`);
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  if (isGlobalShopItem(item)) {
    player.runModifiers.push(...item.effects);
  } else {
    player.inventoryItemIds.push(itemId);
  }
  return item;
}

test("Ganimet Kesesi düşman altınını gerçekten artırır", () => {
  const olc = (esyali) => {
    const room = createRoom("warrior");
    const spot = findBuildableSpot(room, "warrior-1");
    room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    if (esyali) buyItem(room, "ganimet-kesesi");

    const player = room.state.players.get("p1");
    player.gold = 0;
    room.spawnEnemy();
    const enemy = [...room.enemies.values()][0];
    // Odulu sabitle: olcunun konusu carpan, dusman tipinin rastgeleligi degil.
    enemy.reward = 100;
    room.damageEnemy(enemy, 1e9, 0, "warrior-1", "p1");
    return player.gold;
  };

  const esyasiz = olc(false);
  const esyali = olc(true);
  assert.ok(esyasiz > 0, "esyasiz olcum altin vermedi");
  assert.ok(esyali > esyasiz, `esya altini artirmadi: ${esyasiz} -> ${esyali}`);
  assert.ok(Math.abs(esyali / esyasiz - 1.2) < 0.01, `beklenen x1.2, olculen x${(esyali / esyasiz).toFixed(2)}`);
});

test("Komuta Modülü takıldığı kulenin işaret gücünü artırır", () => {
  const item = getShopItem("komuta-modulu");
  const uygunKule = Object.values(towerCatalog).flat().find((tower) => canEquipShopItem(item, tower, []).ok);
  assert.ok(uygunKule, "Komuta Modulu hicbir kuleye takilamiyor");

  const room = createRoom(uygunKule.characterId);
  const spot = findBuildableSpot(room, uygunKule.id);
  assert.ok(spot, `${uygunKule.id} icin yer bulunamadi`);
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: uygunKule.id });
  const tower = [...room.towers.values()].find((entry) => entry.definition.id === uygunKule.id);
  assert.ok(tower);

  buyItem(room, "komuta-modulu");
  room.equipShopItem(client, { itemId: "komuta-modulu", towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes("komuta-modulu"), "esya takilamadi");

  // Hasar yolunun okudugu liste kulenin listesi olmali; oyuncunun listesinde
  // duran kartlar da bu listeye dahil oldugu icin kart tarafi bozulmaz.
  assert.equal(getModifierAdd(room.getTowerRunModifiers(tower), "markAmplification", {}), 0.3);

  // Isaretli dusmana inen hasar gercekten buyumeli.
  const olc = (kuleyle) => {
    const hedefRoom = createRoom(uygunKule.characterId);
    const hedefSpot = findBuildableSpot(hedefRoom, uygunKule.id);
    hedefRoom.placeTower(client, { x: hedefSpot.x, y: hedefSpot.y, definitionId: uygunKule.id });
    const hedefTower = [...hedefRoom.towers.values()].find((entry) => entry.definition.id === uygunKule.id);
    if (kuleyle) {
      buyItem(hedefRoom, "komuta-modulu");
      hedefRoom.equipShopItem(client, { itemId: "komuta-modulu", towerId: hedefTower.id });
    }

    hedefRoom.spawnEnemy();
    const enemy = [...hedefRoom.enemies.values()][0];
    enemy.hp = 1_000_000;
    enemy.maxHp = 1_000_000;
    enemy.shield = 0;
    enemy.armor = 0;
    enemy.damageResistances = {};
    enemy.hitTypeResistances = {};
    enemy.statusResistances = {};
    hedefRoom.setEnemyMark(enemy, "test", 0.2, Date.now() + 5000);
    hedefRoom.damageEnemy(enemy, 1000, 0, hedefTower.definition.id, "p1", "true", 0, 1, hedefTower.id);
    return 1_000_000 - enemy.hp;
  };

  const esyasiz = olc(false);
  const esyali = olc(true);
  assert.ok(esyali > esyasiz, `isaret gucu artmadi: ${esyasiz} -> ${esyali}`);
});

test("işçi eşyaları bütün işçilere ulaşır", () => {
  // "Tum iscilerin" diyen esya, hangi binaya bakildigindan bagimsiz olmali.
  for (const itemId of ["vardiya-amiri", "seyyar-depo"]) {
    const item = getShopItem(itemId);
    assert.ok(isGlobalShopItem(item), `${itemId} hala kuleye takiliyor`);

    const room = createRoom("warrior");
    buyItem(room, itemId);
    room.ensureLogisticsWorkers();

    const workers = [...room.drones.values()].filter((worker) => worker.ownerId === "p1");
    assert.ok(workers.length > 0, "isci yok");
    for (const worker of workers) {
      const stat = item.effects[0].stat;
      assert.ok(
        getModifierAdd(room.getWorkerModifiers(worker), stat) > 0,
        `${itemId}: bir isciye ulasmadi (${stat})`
      );
    }
  }
});

test("binaya takılan işçi eşyaları o binanın işçisine ulaşmayı sürdürür", () => {
  // Kuresele cevirdigimiz esyalar, kasten bina basina calisan kardeslerini
  // bozmamali: bunlar zaten dogru yazilmisti.
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-7");
  assert.ok(spot, "Cephane Merkezi icin yer bulunamadi");
  room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "warrior-7" });
  const bina = [...room.towers.values()].find((entry) => entry.definition.id === "warrior-7");
  assert.ok(bina);

  buyItem(room, "madenci-eldiveni");
  room.equipShopItem(client, { itemId: "madenci-eldiveni", towerId: bina.id });
  assert.ok(bina.equippedShopItemIds.includes("madenci-eldiveni"), "bina esyasi takilamadi");
  room.ensureLogisticsWorkers();

  let ulasti = false;
  for (let tick = 0; tick < 2000 && !ulasti; tick += 1) {
    room.updateDrones(50, 0.05);
    for (const worker of room.drones.values()) {
      if (worker.ownerId !== "p1") continue;
      if (getModifierAdd(room.getWorkerModifiers(worker), "workerGatherSpeed") > 0) ulasti = true;
    }
  }
  assert.ok(ulasti, "binaya takilan esya o binaya hizmet eden isciye ulasmiyor");
});

/**
 * Sinifin tamamini kapatan bekci.
 *
 * Asagidaki statlarin tek okuyucusu oyuncunun listesi. Bunlardan birini vaat
 * eden bir esya kuleye takiliyorsa, esya sessizce olu demektir -- dort esyayi
 * birden kaciran bosluk tam olarak buydu.
 */
test("kuleye takılan eşya yalnızca oyuncudan okunan bir stat vaat edemez", () => {
  const yalnizcaOyuncudanOkunanlar = new Set(["goldGain", "towerCapacity", "ultimateCharge", "skillCooldown"]);

  for (const item of shopCatalog) {
    if (isGlobalShopItem(item)) continue;
    for (const modifier of item.effects ?? []) {
      assert.ok(
        !yalnizcaOyuncudanOkunanlar.has(modifier.stat),
        `${item.id} ("${item.name}") kuleye takiliyor ama ${modifier.stat} yalnizca oyuncudan okunuyor: `
          + "ya GLOBAL_SHOP_ITEM_IDS listesine girmeli ya da stat kule katmanindan da okunmali"
      );
    }
  }
});
