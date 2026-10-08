/**
 * Sunucu'nun yeni calisma mantigi (MatchRoom + packages/shared/src/server-knowledge).
 *
 * Sahibin kurallari:
 * - Sunucu iki kuleye baglanir; bagli iki kule birbirinin sogumasini ve
 *   menzilini kullanir: hangisininki buyukse oteki de ona erisir.
 * - Bagli kule bir dusmana son vurusu yapinca Sunucu o turden +1 bilgi yazar.
 *   Bilgi Sunucu'nun: bag kalksa da silinmez, yalnizca birikir.
 * - Bilgi bagli kulelere o ture karsi oransal artis verir: Kosucu'da
 *   yavaslatma miktari, Atici'da kalkana hasar, Ezici'de zirh kirma, Suru ve
 *   Kusatma'da hasar. Sunucu etki vermez, yalnizca var olani carpar.
 * - Getiri azalir: 40 oldurmede ~%20.
 * - Eski bag mekanikleri (kacana patlama, dalga yasi bonuslari) yok.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { getServerKnowledgeBonus, SERVER_KNOWLEDGE_EFFECTS } from "../packages/shared/dist/index.js";

const client = { sessionId: "p1", send() {} };

function setup(...definitionIds) {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  const build = (definitionId) => {
    const spot = findBuildableSpot(room, definitionId);
    assert.ok(spot, `${definitionId} icin yer yok`);
    room.placeTower(client, { x: spot.x, y: spot.y, definitionId });
    const tower = [...room.towers.values()].at(-1);
    assert.equal(tower.definition.id, definitionId);
    return tower;
  };
  const server = build("warrior-2");
  const towers = definitionIds.map(build);
  const link = (tower) => room.linkServerTower(client, { serverTowerId: server.id, targetTowerId: tower.id });
  return { room, server, towers, link };
}

function spawn(room, tower, type, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    type, x: tower.x + 30, y: tower.y, hp: 1_000_000, maxHp: 1_000_000, shield: 0, maxShield: 0, armor: 0,
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides
  });
  return enemy;
}

const hit = (room, tower, enemy, damage) =>
  room.damageEnemy(enemy, damage, 0, tower.definition.id, tower.ownerId, "true", 0, tower.level, tower.id, tower.definition.hitType);

test("bilgi azalan getiriyle büyüyor: 40 öldürmede ~%20, hiç %100'e varmıyor; seviye ağırlığı artırıyor", () => {
  assert.equal(getServerKnowledgeBonus(0, 1), 0);
  assert.ok(Math.abs(getServerKnowledgeBonus(40, 1) - 0.2) < 1e-9);
  assert.ok(Math.abs(getServerKnowledgeBonus(160, 1) - 0.5) < 1e-9);
  assert.ok(getServerKnowledgeBonus(100_000, 10) < 1);
  assert.ok(getServerKnowledgeBonus(40, 10) > getServerKnowledgeBonus(40, 5));
  assert.ok(getServerKnowledgeBonus(40, 5) > getServerKnowledgeBonus(40, 1));
  assert.deepEqual(SERVER_KNOWLEDGE_EFFECTS, { runner: "slow", shooter: "shieldDamage", brute: "armorBreak", grunt: "damage", siege: "damage" });
});

test("Sunucu en fazla iki kuleye bağlanıyor; üçüncü bağ en eskisini düşürüyor", () => {
  const { server, towers, link } = setup("warrior-1", "warrior-4", "warrior-5");
  towers.forEach(link);
  assert.deepEqual(server.linkedTowerIds, [towers[1].id, towers[2].id]);
});

test("bağlı iki kule menzili paylaşıyor: kısa menzilli uzununa erişiyor, bağ kalkınca geri dönüyor", () => {
  const { room, towers: [a, b], link } = setup("warrior-1", "warrior-4");
  const ownA = room.getTowerRange(a);
  const ownB = room.getTowerRange(b);
  assert.notEqual(ownA, ownB, "iki kulenin menzili ayni: test bir sey olcmez");
  link(a);
  assert.equal(room.getTowerRange(a), ownA, "tek bagli kule paylasacak ortak bulamaz");
  link(b);
  const shared = Math.max(ownA, ownB);
  assert.equal(room.getTowerRange(a), shared);
  assert.equal(room.getTowerRange(b), shared);
  link(b);
  assert.equal(room.getTowerRange(a), ownA, "bag kalkti ama menzil paylasiliyor");
  assert.equal(room.getTowerRange(b), ownB);
});

test("bağlı iki kule soğumayı paylaşıyor: yüksek olan kazanıyor", () => {
  const { room, towers: [cold, hot], link } = setup("warrior-1", "warrior-4");
  const original = room.getTowerRunModifiers.bind(room);
  room.getTowerRunModifiers = (tower) => tower.id === cold.id
    ? [...original(tower), { source: "test", scope: "tower", stat: "cooling", add: 1 }]
    : original(tower);
  const coldOwn = room.getTowerCoolingPerSecond(cold);
  const hotOwn = room.getTowerCoolingPerSecond(hot);
  assert.ok(coldOwn > hotOwn, "test kulesi daha hizli sogumuyor");
  link(cold);
  link(hot);
  assert.equal(room.getTowerCoolingPerSecond(hot), coldOwn);
  assert.equal(room.getTowerCoolingPerSecond(cold), coldOwn);
});

test("bağlı kulenin son vuruşu türe +1 bilgi yazıyor; bağ kalkınca bilgi Sunucu'da kalıyor", () => {
  const { room, server, towers: [tower, other], link } = setup("warrior-1", "warrior-4");
  link(tower);
  const brute = spawn(room, tower, "brute", { hp: 10, maxHp: 10 });
  hit(room, tower, brute, 1000);
  assert.equal(room.enemies.has(brute.id), false);
  assert.deepEqual(server.serverKnowledge, { brute: 1 });
  // Son vurus degil: bilgi yok.
  const runner = spawn(room, tower, "runner");
  hit(room, tower, runner, 10);
  assert.deepEqual(server.serverKnowledge, { brute: 1 });
  // Bagsiz kulenin oldurmesi sayilmiyor.
  const loose = spawn(room, other, "runner", { hp: 10, maxHp: 10 });
  hit(room, other, loose, 1000);
  assert.deepEqual(server.serverKnowledge, { brute: 1 });
  link(tower);
  assert.deepEqual(server.linkedTowerIds, []);
  assert.deepEqual(server.serverKnowledge, { brute: 1 }, "bag kalkinca bilgi silindi");
  const snapshot = room.getSnapshot().towers.find((entry) => entry.id === server.id);
  assert.deepEqual(snapshot.serverKnowledge, { brute: 1 });
});

test("Sürü ve Kuşatma bilgisi o türe verilen hasarı, Atıcı bilgisi yalnızca kalkana gideni çarpıyor", () => {
  const { room, server, towers: [tower], link } = setup("warrior-1");
  link(tower);
  const measure = (type, overrides) => {
    const enemy = spawn(room, tower, type, overrides);
    const before = { hp: enemy.hp, shield: enemy.shield };
    hit(room, tower, enemy, 100);
    return { hp: before.hp - enemy.hp, shield: before.shield - enemy.shield };
  };
  const plain = { grunt: measure("grunt"), siege: measure("siege"), shooter: measure("shooter", { shield: 1000, maxShield: 1000 }) };
  server.serverKnowledge = { grunt: 160, siege: 160, shooter: 160 };
  assert.ok(Math.abs(measure("grunt").hp - plain.grunt.hp * 1.5) < 1e-6);
  assert.ok(Math.abs(measure("siege").hp - plain.siege.hp * 1.5) < 1e-6);
  const shielded = measure("shooter", { shield: 1000, maxShield: 1000 });
  assert.ok(plain.shooter.shield > 0 && plain.shooter.hp === 0, "kalkan hasari olculmedi");
  assert.ok(Math.abs(shielded.shield - plain.shooter.shield * 1.5) < 1e-6);
  // Kalkansiz Atici'nin canina giden hasar degismiyor.
  assert.ok(Math.abs(measure("shooter").hp - measure("grunt").hp / 1.5) < 1e-6);
});

test("Koşucu bilgisi yavaşlatmayı büyütüyor ama yavaşlatmayan kuleye yavaşlatma vermiyor", () => {
  const { room, server, towers: [tower], link } = setup("warrior-1");
  link(tower);
  const slowOf = (enemy) => room.getEnemySlowSpeedMultiplier(enemy, Date.now());
  const apply = (enemy, slowFraction) => room.applyEnemyStatusEffect(enemy, { type: "slow", magnitude: 0.52, durationMs: 2000, stacking: "refresh" }, Date.now(), { sourceTowerId: tower.id, slowFraction });
  const plain = spawn(room, tower, "runner");
  apply(plain, 0.3);
  assert.ok(Math.abs(slowOf(plain) - 0.7) < 1e-9);
  server.serverKnowledge = { runner: 160 };
  const known = spawn(room, tower, "runner");
  apply(known, 0.3);
  assert.ok(Math.abs(slowOf(known) - (1 - 0.45)) < 1e-9, `yavaslatma ${1 - slowOf(known)}`);
  // Tavan: kritikteki %90.
  const capped = spawn(room, tower, "runner");
  apply(capped, 0.8);
  assert.ok(Math.abs(slowOf(capped) - 0.1) < 1e-9);
  // Yavaslatmayan vurus yavaslatmiyor.
  const none = spawn(room, tower, "runner");
  apply(none, 0);
  assert.equal(slowOf(none), 1);
  // Baska ture islemiyor.
  const grunt = spawn(room, tower, "grunt");
  apply(grunt, 0.3);
  assert.ok(Math.abs(slowOf(grunt) - 0.7) < 1e-9);
});

test("Ezici bilgisi zırh kırmayı çarpıyor; zırh kırması olmayan kuleye zırh kırma vermiyor", () => {
  const { room, server, towers: [tower], link } = setup("warrior-1");
  link(tower);
  server.serverKnowledge = { brute: 160 };
  const brute = spawn(room, tower, "brute", { armor: 40 });
  room.applyArmorBreak(brute, 10, tower);
  assert.equal(brute.armor, 25);
  room.applyArmorBreak(brute, 0, tower);
  assert.equal(brute.armor, 25);
  hit(room, tower, brute, 1);
  assert.equal(brute.armor, 25, "vurus zirh kirdi");
  const grunt = spawn(room, tower, "grunt", { armor: 40 });
  room.applyArmorBreak(grunt, 10, tower);
  assert.equal(grunt.armor, 30);
});

test("çalışmayan Sunucu ne paylaşıyor ne bilgi veriyor ne de bilgi topluyor", () => {
  const { room, server, towers: [a, b], link } = setup("warrior-1", "warrior-4");
  link(a);
  link(b);
  server.serverKnowledge = { grunt: 160 };
  const ownA = room.getTowerOwnRange(a);
  server.offlineUntil = Date.now() + 60_000;
  assert.equal(room.getTowerRange(a), ownA);
  assert.equal(room.getTowerServerKnowledgeBonus(a, "grunt"), 0);
  const enemy = spawn(room, a, "grunt", { hp: 10, maxHp: 10 });
  hit(room, a, enemy, 1000);
  assert.deepEqual(server.serverKnowledge, { grunt: 160 });
});

test("eski bağ mekanikleri yok: kaçan düşmana patlama, dalga yaşı, olgunlaşma", () => {
  const { room, server, towers: [tower], link } = setup("warrior-1");
  link(tower);
  for (let wave = 0; wave < 12; wave += 1) room.advanceWaveGrowth();
  assert.equal(server.linkedTowerWaveAges, undefined);
  assert.equal(room.getSnapshot().towers.find((entry) => entry.id === tower.id).serverLinkWaveAge, undefined);
  assert.equal(typeof room.updateServerLinks, "undefined");
  assert.equal(typeof room.notifyServerLinkMatured, "undefined");
});
