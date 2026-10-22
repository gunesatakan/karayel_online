/**
 * Once her hasarli yapiya bir tamirci; sonra tasinan parca ve eksik cana
 * gore yardim. Baska hedef yoksa parca fazlasi olsa bile ayni yapi paylasilir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { REPAIR_HP_PER_PART } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId) {
  const nokta = findBuildableSpot(room, definitionId);
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId });
  return [...room.towers.values()].at(-1);
}

/** `count` tamirci, her biri `parts` parcayla (her biri parts x 10 can onarir). */
function tamirciler(room, count, parts) {
  const player = room.state.players.get("p1");
  for (let index = 0; index < count; index += 1) player.hiredWorkers.push({ role: "repairer" });
  room.updateDrones(16, 0.016);
  const list = [...room.drones.values()].filter((drone) => drone.mode === "repairer");
  assert.equal(list.length, count);
  for (const drone of list) drone.cargo = parts;
  return list;
}

/** Tamircileri yapilardan uzakta tutup tek tik secim yaptirir (onarim olmadan). */
function sec(room, list) {
  for (const drone of list) {
    drone.x = 5;
    drone.y = 5;
  }
  room.updateDrones(16, 0.016);
  return list.map((drone) => drone.targetTowerId || "");
}

test("eksik canin gerektirdigi kadar tamirci gidiyor, fazlasi oteki yapiya", () => {
  const room = oda();
  const a = kur(room, "warrior-1");
  const b = kur(room, "warrior-1");
  // Her tamirci 20 parca = 200 can. A'nin eksigi 350 (iki tamirci), B'ninki 100 (bir).
  a.maxHp = 1000; a.hp = 650;
  b.maxHp = 1000; b.hp = 900;
  const list = tamirciler(room, 3, 20);
  assert.equal(20 * REPAIR_HP_PER_PART, 200);
  const targets = sec(room, list);
  assert.equal(targets.filter((id) => id === a.id).length, 2, `A'ya iki tamirci gitmeli: ${targets}`);
  assert.equal(targets.filter((id) => id === b.id).length, 1, `B'ye bir tamirci gitmeli: ${targets}`);
});

test("agir hasarli yapi iki isci istese bile once diger hasarli yapiya gidilir", () => {
  const room = oda();
  const a = kur(room, "warrior-1");
  const b = kur(room, "warrior-1");
  a.maxHp = 1000; a.hp = 100;
  b.maxHp = 1000; b.hp = 990;
  const list = tamirciler(room, 2, 20);
  const targets = sec(room, list);
  assert.deepEqual(new Set(targets), new Set([a.id, b.id]));
  assert.deepEqual(sec(room, list), targets, "yolda hedefler degismemeli");
});

test("butun yapilara isci gidiyorsa fazla tamirci ayni yapida yardim eder", () => {
  const room = oda();
  const a = kur(room, "warrior-1");
  const b = kur(room, "warrior-1");
  a.maxHp = 1000; a.hp = 650;
  b.maxHp = 1000; b.hp = 900;
  const list = tamirciler(room, 4, 20);
  const targets = sec(room, list);
  assert.equal(targets.filter((id) => id === a.id).length, 3);
  assert.equal(targets.filter((id) => id === b.id).length, 1);
  assert.equal(targets.filter((id) => id === "").length, 0, `fazla isci de yardim etmeli: ${targets}`);
});

test("tek hasarli yapida isciler paylasir; yeni hasarli yapida once gelen kalir digeri ayrilir", () => {
  const room = oda();
  const a = kur(room, "warrior-1");
  a.maxHp = 1000; a.hp = 650;
  const list = tamirciler(room, 3, 20);
  sec(room, list);
  const onA = list.filter((drone) => drone.targetTowerId === a.id);
  assert.equal(onA.length, 3);
  const first = onA.reduce((x, y) => ((x.repairLockedAt ?? 0) <= (y.repairLockedAt ?? 0) ? x : y));
  // Tek hedefte parca fazlasi olsa da isci bosta beklemez.
  a.hp = 850;
  sec(room, list);
  const still = list.filter((drone) => drone.targetTowerId === a.id);
  assert.equal(still.length, 3);
  const b = kur(room, "warrior-1");
  b.maxHp = 1000; b.hp = 950;
  sec(room, list);
  assert.equal(first.targetTowerId, a.id, "ilk gelen kilidini korumali");
  assert.ok(list.some((worker) => worker.targetTowerId === b.id), "yeni hasarli yapi sahipsiz kalmamali");
  b.hp = b.maxHp;
  // A agir hasar aldi: eksik 600, uc tamircinin yuku de yetmiyor; hepsi A'da.
  a.hp = 400;
  sec(room, list);
  assert.equal(list.filter((drone) => drone.targetTowerId === a.id).length, 3);
});
