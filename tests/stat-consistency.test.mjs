import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, getShopItem, applyTowerStack, getTowerStackMultiplier } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function setup(characterId, definitionId) {
  const room = createRoom(characterId);
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot);
  room.placeTower(client, { ...spot, definitionId });
  return { room, tower: [...room.towers.values()][0], player: room.state.players.get("p1") };
}
function pick(room, id, towerId) {
  room.pendingCardChoices.set("p1", [cardCatalog.find(card => card.id === id)]);
  room.chooseCard(client, { cardId: id, towerId });
}
function warmUp(room, tower) {
  pick(room, "isinma-turu");
  tower.aimTargetId = "warmup-target";
  room.enemies.set(tower.aimTargetId, { id: tower.aimTargetId });
  room.updateGrantedActiveSeconds(tower, 10_000);
  assert.equal(tower.stackStates["card-isinma-turu"].count, 10);
}

for (const [character, id] of [
  ["warrior", "warrior-1"], ["warrior", "warrior-4"], ["warrior", "warrior-6"],
  ["zeynep", "zeynep-1"], ["zeynep", "zeynep-2"], ["zeynep", "zeynep-3"], ["zeynep", "zeynep-6"]
]) {
  test(`${id}: hız kartı ve yığını aynı yüzdeyi uygular ve birlikte toplanır`, () => {
    const { room, tower } = setup(character, id);
    // Ucube'nin kendi ritmi test edilen karttan bağımsız tutulur.
    const base = room.getTowerFireInterval(tower);
    warmUp(room, tower);
    near(room.getTowerFireInterval(tower), base / 1.3);
    pick(room, "seri-atis", tower.id);
    near(room.getTowerFireInterval(tower), base / 1.5);
    room.enemies.clear();
    room.updateGrantedActiveSeconds(tower, 16);
    near(room.getTowerFireInterval(tower), base / 1.2);
  });
}

test("Taht Mührü: bütün sentez aralıklarına hız yığını uygulanır", () => {
  const { room, tower } = setup("zeynep", "zeynep-3");
  warmUp(room, tower);
  for (const mode of ["dual-projectile", "copy-projectile", "burn-impact", "mirror-beam", "kin-projectile", "kin-wave", "kin-showcase", "copy-showcase"]) {
    // Geometri değil, bileşim seçildikten sonraki stat uygulaması ölçülüyor.
    room.getZeynepSynthesisComposition = () => ({ mode });
    const state = tower.stackStates["card-isinma-turu"];
    delete tower.stackStates["card-isinma-turu"];
    const base = room.getTowerFireInterval(tower);
    tower.stackStates["card-isinma-turu"] = state;
    near(room.getTowerFireInterval(tower), base / 1.3);
  }
});

for (const id of ["warrior-5", "warrior-3"]) {
  test(`${id}: etki aralığı normal hız bonusundan ve hız yığınından etkilenmez`, () => {
    const { room, tower } = setup("warrior", id);
    const base = room.getTowerFireInterval(tower);
    warmUp(room, tower);
    pick(room, "seri-atis", tower.id);
    near(room.getTowerFireInterval(tower), base);
  });
}

test("yığın motoru hız artışı ile aralık azaltmayı ayrı hesaplar", () => {
  for (const [stat, expected] of [["fireRate", 1 / 1.3], ["fireIntervalReduction", 0.7]]) {
    const definition = { id: "test", trigger: "hit", stat, perStack: 0.03 };
    let state;
    for (let i = 0; i < 10; i++) state = applyTowerStack(state, definition, { trigger: "hit", now: 1 });
    near(getTowerStackMultiplier(state, definition, 1), expected);
  }
});

test("Ucube'nin özel aralık eğrisi hız kartıyla birlikte korunur", () => {
  const { room, tower } = setup("warrior", "warrior-6");
  room.isTowerIsolated = () => false;
  const base = room.getTowerFireInterval(tower);
  for (let i = 0; i < 15; i++) room.applyTowerStacksForTrigger(tower, "activeSecond", Date.now());
  const interval = base * (1 - 15 * 0.04539007092198582);
  near(room.getTowerFireInterval(tower), interval);
  warmUp(room, tower);
  near(room.getTowerFireInterval(tower), interval / 1.3);
});

test("hasar kartları pasifli hasarı artırır, birbirleriyle toplanır ve eşya bir kez sayılır", () => {
  const { room, tower, player } = setup("warrior", "warrior-1");
  const base = room.getTowerDamage(tower);
  near(base, 36);
  pick(room, "kalibre-artisi", tower.id);
  near(room.getTowerDamage(tower), 50.4);
  pick(room, "namlu-asinmasi");
  near(room.getTowerDamage(tower), base * 1.65);
  player.shopOffers = [getShopItem("delici-cekirdek")];
  room.setupPhase = true;
  room.buyShopItem(client, { itemId: "delici-cekirdek" });
  room.equipShopItem(client, { itemId: "delici-cekirdek", towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes("delici-cekirdek"));
  near(room.getTowerDamage(tower), base * 1.85);
  room.isTowerIsolated = () => false;
  near(room.getTowerDamage(tower), 24 * 1.85);
});

for (const advanced of [false, true]) {
  test(`can bonuslu işçi alımı ve yeniden doğma tam can verir (gelişmiş=${advanced})`, () => {
    const room = createRoom("warrior");
    const player = room.state.players.get("p1");
    player.runModifiers.push(...cardCatalog.find(card => card.id === "zirhli-tulum").effects);
    room.hireWorker(client, { role: "crystalCollector", advanced });
    const worker = [...room.drones.values()].find(w => w.id.includes(":extra"));
    assert.ok(worker);
    const expected = 60 * 1.75 * (advanced ? 3 : 1);
    near(worker.hp, expected);
    near(room.getWorkerMaxHp(worker), expected);
    room.drones.delete(worker.id);
    room.workerRespawnAt.set(worker.id, Date.now() - 1);
    room.ensureLogisticsWorkers();
    near(room.drones.get(worker.id).hp, expected);
  });
}
