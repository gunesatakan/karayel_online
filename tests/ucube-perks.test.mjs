/**
 * Ucube seviye secimleri.
 *
 * Ucube'nin sekiz ozelligi eskiden dalga gectikce kendiliginden aciliyordu:
 * secim yoktu, dolayisiyla her Ucube ayni Ucube oluyordu. Artik ozellikler
 * dortlu kademeye bolunuyor ve her kademede ikisinden biri aliniyor -- bir
 * Ucube sekiz ozelligin ancak yarisini tasiyabilir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  UCUBE_PERK_LEVELS,
  UCUBE_PERK_TIERS,
  getUcubePerkTier,
  isUcubePerkOption,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function ucubeRoom() {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-6");
  assert.ok(spot, "Ucube icin yer bulunamadi");
  room.placeTower(client, { ...spot, definitionId: "warrior-6" });
  const tower = [...room.towers.values()].find((entry) => entry.definition.id === "warrior-6");
  assert.ok(tower, "Ucube kurulamadi");
  const player = room.state.players.get("p1");
  player.experience = 10_000_000;
  player.gold = 10_000_000;
  return { room, tower, player };
}

/** Kuleyi hedef seviyeye cikarir; yolda cikan secimleri istege gore yanitlar. */
function upgradeTo(room, tower, hedefSeviye, sec) {
  while (tower.level < hedefSeviye) {
    room.upgradeTower(client, { towerId: tower.id });
    if (tower.ucubePendingLevel > 0) {
      if (!sec) break;
      room.chooseUcubePerk(client, { towerId: tower.id, perkId: sec(tower.ucubePendingLevel) });
    }
  }
}

test("kademeler dort seviyede ve ikiser secenekli", () => {
  assert.deepEqual(UCUBE_PERK_LEVELS, [4, 6, 8, 10]);
  assert.equal(UCUBE_PERK_TIERS.length, 4);

  const tumIdler = [];
  for (const tier of UCUBE_PERK_TIERS) {
    assert.equal(tier.options.length, 2, `${tier.level}. seviyede iki secenek olmali`);
    for (const option of tier.options) {
      assert.ok(option.name && option.description, `${option.id}: metin eksik`);
      tumIdler.push(option.id);
    }
  }

  assert.equal(tumIdler.length, 8, "toplam sekiz ozellik olmali");
  assert.equal(new Set(tumIdler).size, 8, "ozellik kimlikleri benzersiz olmali");
});

test("secim yalnizca bu seviyenin seceneklerini kabul eder", () => {
  assert.equal(isUcubePerkOption(4, "chain"), true);
  assert.equal(isUcubePerkOption(4, "pushback"), true);
  assert.equal(isUcubePerkOption(4, "damage-double"), false, "baska kademenin secenegi kabul edilmemeli");
  assert.equal(isUcubePerkOption(5, "chain"), false, "secim seviyesi olmayan seviyede secenek yok");
});

test("seviye 4-6-8-10'da secim acilir, digerlerinde acilmaz", () => {
  const { room, tower } = ucubeRoom();
  const acilanlar = [];

  while (tower.level < 10) {
    room.upgradeTower(client, { towerId: tower.id });
    if (tower.ucubePendingLevel > 0) {
      acilanlar.push(tower.ucubePendingLevel);
      room.chooseUcubePerk(client, { towerId: tower.id, perkId: getUcubePerkTier(tower.ucubePendingLevel).options[0].id });
    }
  }

  assert.deepEqual(acilanlar, [4, 6, 8, 10]);
});

test("secilen ozellik kuleye yazilir, secilmeyen gelmez", () => {
  const { room, tower } = ucubeRoom();
  upgradeTo(room, tower, 4, () => "pushback");

  assert.deepEqual(tower.ucubePerks, ["pushback"]);
  assert.equal(tower.ucubePendingLevel, 0, "secimden sonra bekleyen kalmamali");
  assert.equal(tower.ucubePerks.includes("chain"), false, "secilmeyen secenek de verilmis");
});

test("bekleyen secim varken gecersiz istek yok sayilir", () => {
  const { room, tower } = ucubeRoom();
  upgradeTo(room, tower, 4);
  assert.equal(tower.ucubePendingLevel, 4, "seviye 4'te secim bekliyor olmali");

  room.chooseUcubePerk(client, { towerId: tower.id, perkId: "damage-double" });
  room.chooseUcubePerk(client, { towerId: tower.id, perkId: "yok-boyle-bir-sey" });
  room.chooseUcubePerk(client, { towerId: tower.id });

  assert.deepEqual(tower.ucubePerks, [], "gecersiz istek ozellik vermis");
  assert.equal(tower.ucubePendingLevel, 4, "gecersiz istek bekleyen secimi kapatmis");
});

test("bir kademe iki kez alinamaz", () => {
  const { room, tower } = ucubeRoom();
  upgradeTo(room, tower, 4, () => "chain");

  room.chooseUcubePerk(client, { towerId: tower.id, perkId: "pushback" });

  assert.deepEqual(tower.ucubePerks, ["chain"], "kademe ikinci kez alinmis");
});

test("baska oyuncunun kulesi secilemez", () => {
  const { room, tower } = ucubeRoom();
  upgradeTo(room, tower, 4);

  room.chooseUcubePerk({ sessionId: "p2", send() {} }, { towerId: tower.id, perkId: "chain" });

  assert.deepEqual(tower.ucubePerks, []);
  assert.equal(tower.ucubePendingLevel, 4);
});

test("secim kule basina ayri tutulur", () => {
  const { room, tower } = ucubeRoom();
  const ikinciSpot = findBuildableSpot(room, "warrior-6");
  room.placeTower(client, { ...ikinciSpot, definitionId: "warrior-6" });
  const ikinci = [...room.towers.values()].filter((entry) => entry.definition.id === "warrior-6")[1];
  assert.ok(ikinci && ikinci.id !== tower.id, "ikinci Ucube kurulamadi");

  upgradeTo(room, tower, 4, () => "chain");
  upgradeTo(room, ikinci, 4, () => "pushback");

  assert.deepEqual(tower.ucubePerks, ["chain"]);
  assert.deepEqual(ikinci.ucubePerks, ["pushback"]);
});

test("govde secimi cani iki katina cikarir", () => {
  const { room, tower } = ucubeRoom();
  upgradeTo(room, tower, 8, (level) => (level === 8 ? "range-hull" : getUcubePerkTier(level).options[0].id));

  const oncekiMaxHp = tower.maxHp;
  assert.ok(tower.ucubePerks.includes("range-hull"), "govde secimi alinmadi");
  assert.equal(tower.hp, oncekiMaxHp, "can dolmamis");
});

test("Ucube disindaki kuleler secim acmaz", () => {
  const room = createRoom("warrior");
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower(client, { ...spot, definitionId: "warrior-1" });
  const tower = [...room.towers.values()][0];
  const player = room.state.players.get("p1");
  player.experience = 10_000_000;
  player.gold = 10_000_000;

  while (tower.level < 10) {
    room.upgradeTower(client, { towerId: tower.id });
    assert.equal(tower.ucubePendingLevel ?? 0, 0, `warrior-1 sv${tower.level}: secim acilmamali`);
  }

  assert.equal(towerCatalog.warrior.find((entry) => entry.id === "warrior-1").id, "warrior-1");
});
