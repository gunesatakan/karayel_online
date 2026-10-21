/**
 * Tecrube kartlari ve esyalari (2026-10).
 *
 * Sahibin istegi: "Tecrube de yetmiyor. Tecrube kazanimini artiran kart ve
 * esyalar olustur. Bazilari yuzeysel olsun bazilari derin olsun."
 * Yuzeysel: Hizli Ogrenme, Ogrenci Bursu (altindan takas), Egitim Kilavuzu
 * (`experienceGain`). Derin: Harp Akademisi (dalga sonu ayakta kule), Temiz
 * Ders (sizintisiz dalga), Tecrube Aktarimi (gelistirme bedelinden geri
 * donen pay), Ders Defteri (kulenin dalga hasari), Zor Ders (agir hedefin
 * tecrubesi). Hepsi gercek oda yoluyla (kart secimi, magaza, takma).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, getTowerLevelExpCost, shopCatalog } from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const { enCards } = await importWebModule("apps/web/src/locales/catalog/en-cards.ts");
const { enShopItems } = await importWebModule("apps/web/src/locales/catalog/en-shop.ts");
const client = { sessionId: "p1", send() {} };
const card = (id) => cardCatalog.find((entry) => entry.id === id);
const item = (id) => shopCatalog.find((entry) => entry.id === id);

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId = "warrior-1") {
  const spot = findBuildableSpot(room, definitionId);
  room.placeTower(client, { ...spot, definitionId });
  return [...room.towers.values()].at(-1);
}

function kartAl(room, cardId) {
  room.pendingCardChoices = new Map([[client.sessionId, [card(cardId)]]]);
  room.chooseCard(client, { cardId });
}

function satinAl(room, itemId) {
  const player = room.state.players.get("p1");
  room.setupPhase = true;
  player.gold = 1e6;
  player.shopOffers = [item(itemId)];
  const before = player.ownedShopItemIds.length;
  room.buyShopItem(client, { itemId });
  room.setupPhase = false;
  return player.ownedShopItemIds.length === before + 1;
}

function esyaTak(room, tower, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  const before = tower.equippedShopItemIds.length;
  room.equipShopItem(client, { itemId, towerId: tower.id });
  return tower.equippedShopItemIds.length === before + 1;
}

/** Olduren kuleyle bir dusmanin tecrubesi (verilen tur). */
function oldurTecrube(room, tower, type = "grunt", extra = {}) {
  const player = room.state.players.get("p1");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { type, champion: undefined, special: undefined, ...extra });
  player.experience = 0;
  room.awardEnemyExperience(enemy, tower);
  return player.experience;
}

test("katalog: 5 kart ve 3 esya, Turkce ve Ingilizce metinli, kart ve esya kurallarina uygun", () => {
  for (const id of ["hizli-ogrenme", "ogrenci-bursu", "harp-akademisi", "temiz-ders", "tecrube-aktarimi"]) {
    assert.ok(card(id), id);
    assert.ok(enCards[id]?.name && enCards[id]?.description, `${id}: Ingilizce metin`);
  }
  for (const id of ["egitim-kilavuzu", "ders-defteri", "zor-ders"]) {
    assert.ok(item(id), id);
    assert.ok(enShopItems[id]?.name && enShopItems[id]?.description, `${id}: Ingilizce metin`);
  }
  assert.equal(item("egitim-kilavuzu").target, "global");
  assert.equal(item("ders-defteri").target, "tower");
  assert.equal(item("zor-ders").target, "tower");
});

test("yuzeysel: Hizli Ogrenme +%20 (uc kez), Ogrenci Bursu +%80 tecrube -%15 altin, Egitim Kilavuzu +%30", () => {
  const room = oda();
  const tower = kur(room);
  const base = oldurTecrube(room, tower);
  assert.ok(base > 0);
  kartAl(room, "hizli-ogrenme");
  assert.ok(Math.abs(oldurTecrube(room, tower) - base * 1.2) < 1e-9);
  kartAl(room, "ogrenci-bursu");
  assert.ok(Math.abs(oldurTecrube(room, tower) - base * 2.0) < 1e-9);
  assert.ok(satinAl(room, "egitim-kilavuzu"));
  assert.ok(Math.abs(oldurTecrube(room, tower) - base * 2.3) < 1e-9);
  // Ogrenci Bursu altini da kesiyor.
  const player = room.state.players.get("p1");
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  enemy.reward = 100; enemy.champion = undefined; enemy.special = undefined;
  player.gold = 0;
  room.awardEnemyGold(enemy, "p1");
  assert.ok(Math.abs(player.gold - Math.round(100 * 4.212) * 0.85) < 1e-6, `altin ${player.gold}`);
});

test("Harp Akademisi: dalga sonunda ayakta olan her hasar veren kule icin +10 tecrube", () => {
  const room = oda();
  kur(room); kur(room); kur(room);
  const duvar = kur(room, "wall-1");
  const player = room.state.players.get("p1");
  kartAl(room, "harp-akademisi");
  player.experience = 0;
  room.awardWaveEndBonusExperience(false);
  assert.equal(player.experience, 30, "uc hasar kulesi (duvar sayilmaz)");
  [...room.towers.values()][0].hp = 0;
  player.experience = 0;
  room.awardWaveEndBonusExperience(false);
  assert.equal(player.experience, 20, "yikilan kule sayilmaz");
  assert.ok(duvar);
});

test("Temiz Ders: yalnizca sizintisiz dalgada +80 tecrube", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  kartAl(room, "temiz-ders");
  player.experience = 0;
  room.awardWaveEndBonusExperience(false);
  assert.equal(player.experience, 0);
  room.awardWaveEndBonusExperience(true);
  assert.equal(player.experience, 80);
});

test("Tecrube Aktarimi: gelistirmenin tecrube bedelinin %20'si geri donuyor, altin bedeli ayni", () => {
  const room = oda();
  const tower = kur(room);
  const player = room.state.players.get("p1");
  kartAl(room, "tecrube-aktarimi");
  const cost = getTowerLevelExpCost(tower.definition.cost, tower.level);
  player.experience = cost;
  player.gold = 1e6;
  room.upgradeTower(client, { towerId: tower.id });
  assert.equal(tower.level, 2);
  assert.ok(Math.abs(player.experience - cost * 0.2) < 1e-9, `kalan ${player.experience}`);
  // Bedelin tamami yine gerekiyor: eksik tecrubeyle gelistirilmiyor.
  player.experience = getTowerLevelExpCost(tower.definition.cost, tower.level) - 1;
  room.upgradeTower(client, { towerId: tower.id });
  assert.equal(tower.level, 2);
});

test("Ders Defteri: takildigi kule dalga sonunda o dalga verdigi her 1000 hasar icin +10 tecrube", () => {
  const room = oda();
  const tower = kur(room);
  const other = kur(room);
  const player = room.state.players.get("p1");
  assert.ok(esyaTak(room, tower, "ders-defteri"));
  tower.waveDamageDealt = 3500;
  other.waveDamageDealt = 9000;
  player.experience = 0;
  room.awardWaveEndBonusExperience(false);
  assert.equal(player.experience, 30, "yalnizca takildigi kule, tam binler");
  // Altin primi ayni dalgada sayaci sifirliyor; tecrube ondan once okunuyor.
  room.awardWaveEndBonusGold(room.wave, false);
  assert.equal(tower.waveDamageDealt, 0);
});

test("Zor Ders: takildigi kulenin oldurdugu agir hedeften tecrube +%100, siradan dusmanda ve baska kulede degisiklik yok", () => {
  const room = oda();
  const tower = kur(room);
  const other = kur(room);
  const brute = oldurTecrube(room, tower, "brute");
  const grunt = oldurTecrube(room, tower, "grunt");
  assert.ok(esyaTak(room, tower, "zor-ders"));
  assert.ok(Math.abs(oldurTecrube(room, tower, "brute") - brute * 2) < 1e-9, "brute");
  assert.ok(Math.abs(oldurTecrube(room, tower, "siege") / oldurTecrube(room, other, "siege") - 2) < 1e-9, "kusatma");
  assert.ok(Math.abs(oldurTecrube(room, tower, "grunt") - grunt) < 1e-9, "siradan dusman degismez");
  assert.ok(Math.abs(oldurTecrube(room, other, "brute") - brute) < 1e-9, "baska kule degismez");
});
