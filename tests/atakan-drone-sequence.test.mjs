/**
 * AttackLord ultisinin drone'lari birer birer cikiyor.
 *
 * Drone'lar ayni anda bedenin icinden cikinca ust uste biniyor ve tek drone
 * gibi gorunuyordu. Sahibinin istegi: cok hizli, sirayla. Buradaki sozler:
 * - ilki atis aninda, gerisi kule sirasiyla `ATAKAN_ULTIMATE_DRONE_LAUNCH_GAP_MS`
 *   (oyun ms, drone omruyle ayni saat) arayla; omur her drone'un kendi
 *   cikisindan; kulelerin yorgunlugu atis aninda;
 * - hedef cikis aninda seciliyor: hedef yoksa saldiri drone'u atlaniyor;
 * - karne butun drone'larin isabet ve olumlerini sayiyor ve son drone cikip
 *   dusmeden gitmiyor;
 * - sirasini bekleyen kule satilirsa drone'u cikmiyor; yeniden baglanan
 *   oyuncunun siradaki drone'lari yeni oturumun; mac bitince sira bosaliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ATAKAN_ULTIMATE_DRONE_LAUNCH_GAP_MS, SNAPSHOT_SEND_INTERVAL_MS } from "../apps/server/dist/rooms/MatchRoom.js";
import { GAME_SPEED_MULTIPLIER } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot, syncEnemyBodies } from "./helpers/match-room-harness.mjs";

const GAP = ATAKAN_ULTIMATE_DRONE_LAUNCH_GAP_MS;

/** Gonderilen mesajlari kaydeden istemciler ve yayin. */
function wire(room, sessionIds = ["p1"]) {
  const sent = new Map(sessionIds.map((id) => [id, []]));
  const clients = sessionIds.map((sessionId) => ({
    sessionId,
    send(type, payload) {
      sent.get(sessionId).push({ type, payload });
    }
  }));
  const broadcasts = [];
  room.clients = clients;
  room.broadcast = (type, payload, options) => broadcasts.push({ type, payload, options });
  const resultsFor = (sessionId) => sent.get(sessionId).filter((entry) => entry.type === "ultimate:result").map((entry) => entry.payload);
  return { clients, owner: clients[0], resultsFor, results: () => resultsFor("p1"), casts: () => broadcasts.filter((entry) => entry.type === "ultimate:cast") };
}

function atakanTowers(room, count) {
  const client = { sessionId: "p1", send() {} };
  const towers = [];
  for (let index = 0; index < count; index += 1) {
    const spot = findBuildableSpot(room, "warrior-1");
    assert.ok(spot, "Atakan kulesi icin yer yok");
    room.placeTower(client, { x: spot.x, y: spot.y, definitionId: "warrior-1" });
    towers.push([...room.towers.values()].at(-1));
  }
  return towers;
}

/** Dusman; verilen yerde. Drone baslangicta ustundeyse ilk adimda vuruyor. */
function enemyAt(room, x, y, hp = 30) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp, maxHp: hp, shield: 0, maxShield: 0, armor: 0, movementKind: "ground", damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  // Govde yeni konumda (uretimde tikin basinda): ulti ve dron govdeye vuruyor.
  syncEnemyBodies(room);
  return enemy;
}

const ultimateDrones = (room) => [...room.drones.values()].filter((drone) => drone.mode === "attack" || drone.mode === "repair");

test("saldiri dronlari once farkli dusmanlara, sonra dengeli dagilir; hedef kaybinda yeniden secer", () => {
  const room = createRoom("warrior");
  wire(room);
  const [tower] = atakanTowers(room, 1);
  const near = enemyAt(room, 400, 400, 10000);
  const far = enemyAt(room, 600, 600, 10000);
  const hidden = enemyAt(room, 1, 1, 10000);
  hidden.untargetable = true;
  const ids = Array.from({ length: 5 }, () => room.spawnAtakanDrone(tower, false, 1, { x: 0, y: 0 }));
  const drones = ids.map((id) => room.drones.get(id));
  assert.notEqual(drones[0].targetId, drones[1].targetId);
  const counts = [near, far].map((enemy) => drones.filter((d) => d.targetId === enemy.id).length);
  assert.equal(Math.abs(counts[0] - counts[1]), 1);
  assert.ok(drones.every((d) => d.targetId !== hidden.id));
  const before = drones.map((d) => d.targetId);
  room.updateDrones(0, 0);
  assert.deepEqual(drones.map((d) => d.targetId), before, "dengeli hedefler tikler arasinda sabit kalmali");
  room.enemies.delete(near.id);
  room.updateDrones(0, 0);
  assert.ok(drones.every((d) => d.targetId === far.id), "tek dusman kalinca paylasilmali");
  hidden.untargetable = false;
  room.updateDrones(0, 0);
  assert.ok(drones.some((d) => d.targetId === hidden.id), "yeni hedefe dagilim yapilmali");
});

function step(room, ms) {
  room.updateDrones(ms, ms / 1000);
  room.settleUltimateReports();
}

function flyAll(room, ms = 50, steps = 400) {
  for (let index = 0; index < steps && (room.pendingAtakanDrones.length > 0 || ultimateDrones(room).length > 0); index += 1) step(room, ms);
  room.settleUltimateReports();
}

function cast(room, io, mode = "attack") {
  room.state.players.get("p1").ultimateCharge = 100;
  room.useUltimate(io.owner, { mode });
}

test("aralik oyun suresi; duvar saatinde snapshot araligindan kisa degil", () => {
  assert.equal(GAP, 60);
  // 60 oyun ms = 75 duvar ms >= 60 ms'lik yayin: her karede en fazla bir yeni drone.
  assert.ok(GAP / GAME_SPEED_MULTIPLIER >= SNAPSHOT_SEND_INTERVAL_MS);
});

test("drone'lar kule sirasiyla aralikla cikiyor; ilki atis aninda, omur kendi cikisindan", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 3);
  // Uzak ve dayanikli hedef: drone'lar bu sure icinde inmiyor.
  enemyAt(room, towers[0].x, towers[0].y - 900, 1_000_000);
  cast(room, io);

  const seen = () => ultimateDrones(room);
  assert.equal(seen().length, 1, "ilk drone atis aninda");
  assert.deepEqual({ x: seen()[0].x, y: seen()[0].y }, { x: towers[0].x, y: towers[0].y }, "bedeni olmayan operatorde kuleden");
  assert.equal(room.pendingAtakanDrones.length, 2);
  // Yorgunluk atis aninda, siradaki kuleler dahil.
  for (const tower of towers) assert.ok(tower.offlineUntil > 0, "kule yorulmadi");

  const timeline = [];
  for (let elapsed = 20; elapsed <= 2 * GAP; elapsed += 20) {
    step(room, 20);
    timeline.push([elapsed, seen().length]);
  }
  assert.deepEqual(timeline, [[20, 1], [40, 1], [60, 2], [80, 2], [100, 2], [120, 3]]);

  const [first, second, third] = seen();
  assert.ok(Number(first.id.slice(1)) < Number(second.id.slice(1)) && Number(second.id.slice(1)) < Number(third.id.slice(1)), "kimlikler cikis sirasiyla");
  // Son cikan drone bu adimda cikti: kulesinin yerinde, omru tam.
  assert.deepEqual({ x: third.x, y: third.y }, { x: towers[2].x, y: towers[2].y });
  assert.equal(third.ttlMs, 8500);
  assert.equal(second.ttlMs, 8500 - GAP, "omur kendi cikisindan sayiliyor");
  assert.equal(first.ttlMs, 8500 - 2 * GAP);
  assert.equal(room.pendingAtakanDrones.length, 0);
  assert.equal(io.results().length, 0, "drone'lar havadayken karne gitmemeli");

  // Telde de birer birer.
  assert.equal(room.getSnapshot().drones.filter((drone) => drone.mode === "attack").length, 3);
});

test("karne butun drone'larin isabet ve olumlerini sayar; sonuncusu cikip dusmeden gitmez", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 3);
  const targets = towers.map((tower) => enemyAt(room, tower.x, tower.y));
  cast(room, io);

  // Ilk drone ilk adimda iniyor; ikisi hala sirada, karne bekliyor.
  step(room, GAP / 2);
  assert.equal(room.enemies.has(targets[0].id), false);
  assert.equal(io.results().length, 0);
  step(room, GAP / 2);
  assert.equal(io.results().length, 0, "ucuncu drone cikmadan karne gitmemeli");

  flyAll(room);
  assert.ok(targets.every((enemy) => !room.enemies.has(enemy.id)));
  assert.deepEqual(io.results(), [{ kind: "drones", hits: 3, kills: 3 }]);
  assert.equal(io.casts().length, 1);
  assert.equal(room.openUltimateReports.length, 0);
});

test("tamir drone'lari da sirayla cikiyor; karne hepsinin usse getirdigini sayiyor", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  atakanTowers(room, 3);
  room.teamHealth = 50;
  cast(room, io, "repair");

  assert.equal(ultimateDrones(room).length, 1);
  step(room, GAP);
  assert.equal(ultimateDrones(room).length, 2);
  step(room, GAP);
  assert.equal(ultimateDrones(room).length, 3);
  flyAll(room, 50, 1000);
  assert.equal(room.teamHealth, 59);
  assert.deepEqual(io.results(), [{ kind: "repair", hits: 0, kills: 0, heal: 9 }]);
});

test("sirasi gelince hedef yoksa saldiri drone'u atlaniyor; karne cikanlarla kapaniyor", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 2);
  const only = enemyAt(room, towers[0].x, towers[0].y);
  cast(room, io);

  // Ilk drone tek dusmani oldurdu; ikincinin sirasi geldiginde hedef yok.
  step(room, GAP);
  assert.equal(room.enemies.has(only.id), false);
  assert.equal(ultimateDrones(room).length, 0, "hedefsiz drone cikmamali");
  assert.equal(room.pendingAtakanDrones.length, 0);
  assert.deepEqual(io.results(), [{ kind: "drones", hits: 1, kills: 1 }]);
});

test("atista hedef yoksa ilk drone atlaniyor; siradaki cikis aninda dogan dusmani hedefliyor", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 2);
  cast(room, io);
  assert.equal(ultimateDrones(room).length, 0);
  assert.equal(io.results().length, 0, "siradaki drone beklenmeli");

  const late = enemyAt(room, towers[1].x, towers[1].y);
  flyAll(room);
  assert.equal(room.enemies.has(late.id), false);
  assert.deepEqual(io.results(), [{ kind: "drones", hits: 1, kills: 1 }]);

  // Hic kimse yoksa sira bosalinca "isabet yok".
  const empty = createRoom("warrior");
  const emptyIo = wire(empty);
  atakanTowers(empty, 2);
  cast(empty, emptyIo);
  flyAll(empty);
  assert.deepEqual(emptyIo.results(), [{ kind: "drones", hits: 0, kills: 0 }]);
});

test("sirasini bekleyen kule satilirsa drone'u cikmiyor; yikilan (enkaz) kule atistaki gibi veriyor", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 3);
  const targets = towers.map((tower) => enemyAt(room, tower.x, tower.y));
  cast(room, io);

  room.sellTower(io.owner, { towerId: towers[1].id });
  assert.equal(room.towers.has(towers[1].id), false);
  // Enkaz haritada kaliyor; atis aninda da drone veriyordu.
  towers[2].hp = 0;
  flyAll(room);

  assert.equal(room.enemies.has(targets[1].id), true, "satilan kulenin drone'u cikmamali");
  assert.equal(room.enemies.has(targets[2].id), false, "enkaz kulenin drone'u cikmali");
  assert.deepEqual(io.results(), [{ kind: "drones", hits: 2, kills: 2 }]);
});

test("yeniden baglanan oyuncunun siradaki drone'lari ve karnesi yeni oturumun", () => {
  const room = createRoom("warrior");
  const io = wire(room, ["p1", "p1-yeni"]);
  const towers = atakanTowers(room, 2);
  towers.forEach((tower) => enemyAt(room, tower.x, tower.y, 1_000_000));
  cast(room, io);

  room.transferPlayerSession("p1", "p1-yeni", room.state.players.get("p1"));
  step(room, GAP);
  const drones = ultimateDrones(room);
  assert.equal(drones.length, 1, "ilk drone indi, ikincisi cikti");
  assert.equal(drones[0].ownerId, "p1-yeni");
  flyAll(room);

  assert.equal(io.results().length, 0, "eski oturuma karne gitmemeli");
  assert.deepEqual(io.resultsFor("p1-yeni"), [{ kind: "drones", hits: 2, kills: 0 }]);
});

test("oyuncu odadan ciktiysa sira yine bosaliyor ve karne sessizce birakiliyor", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 2);
  towers.forEach((tower) => enemyAt(room, tower.x, tower.y));
  cast(room, io);

  room.state.players.delete("p1");
  flyAll(room);
  assert.equal(room.pendingAtakanDrones.length, 0);
  assert.equal(room.openUltimateReports.length, 0, "karne acik kalmamali");
  assert.equal(io.results().length, 0);
  assert.equal(io.casts().length, 0);
});

test("mac bitince sirasi gelmemis drone cikmiyor; karne havadakilerle kapaniyor", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 3);
  towers.forEach((tower) => enemyAt(room, tower.x, tower.y));
  cast(room, io);

  room.finishMatch("defeat");
  assert.equal(room.pendingAtakanDrones.length, 0);
  flyAll(room);
  assert.equal(ultimateDrones(room).length, 0);
  assert.deepEqual(io.results(), [{ kind: "drones", hits: 1, kills: 1 }]);
});

test("sira bitmeden yeniden atilan ulti ayri sira ve ayri karne", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 2);
  towers.forEach((tower) => enemyAt(room, tower.x, tower.y - 900, 1_000_000));
  cast(room, io);
  cast(room, io);

  assert.equal(ultimateDrones(room).length, 2, "iki atisin ilk drone'lari");
  assert.equal(room.pendingAtakanDrones.length, 2);
  step(room, GAP);
  assert.equal(ultimateDrones(room).length, 4);
  const [first, second] = room.openUltimateReports;
  assert.equal(first.droneIds.size, 2);
  assert.equal(second.droneIds.size, 2);
  assert.ok([...first.droneIds].every((id) => !second.droneIds.has(id)));
});

test("takilan tikte sirasi gelmis drone'lar birlikte cikmiyor: ulti basina tikte bir", () => {
  const room = createRoom("warrior");
  const io = wire(room);
  const towers = atakanTowers(room, 4);
  enemyAt(room, towers[0].x, towers[0].y - 900, 1_000_000);
  cast(room, io);
  assert.equal(ultimateDrones(room).length, 1);
  // Uc araligi birden asan tek uzun tik: kalan uc drone'un hepsinin sirasi geldi.
  step(room, 4 * GAP);
  assert.equal(ultimateDrones(room).length, 2, "uzun tikte birden fazla drone cikti");
  step(room, 16);
  assert.equal(ultimateDrones(room).length, 3);
  step(room, 16);
  assert.equal(ultimateDrones(room).length, 4);
  assert.equal(room.pendingAtakanDrones.length, 0);
});
