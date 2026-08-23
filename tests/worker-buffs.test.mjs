/**
 * Isci buff'lari.
 *
 * Isci statlari (toplama hizi, yurume hizi, tasima kapasitesi) once yalnizca
 * binaya takili esyalardan okunuyordu. Bu iki seyi birden bozuyordu: kart
 * katmani isciler icin tumden oluydu, ve bir binaya baglanmamis isci -- dugume
 * yururken, yuk toplarken -- hicbir buff gormuyordu. Testler her iki kaynagin da
 * isledigini ve buff'siz halin degismedigini sabitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cardCatalog, shopCatalog } from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

function card(id) {
  const found = cardCatalog.find((entry) => entry.id === id);
  assert.ok(found, `${id} karti katalogda yok`);
  return found;
}

function item(id) {
  const found = shopCatalog.find((entry) => entry.id === id);
  assert.ok(found, `${id} esyasi katalogda yok`);
  return found;
}

/** Bir binaya baglanmamis isci: kuresel buff'lar burada da islemeli. */
function loneWorker() {
  return { id: "w1", ownerId: "p1", mode: "crystalCollector", x: 20, y: 20, vx: 0, vy: 0, cargo: 0, capacity: 12, speed: 82, targetTowerId: "" };
}

function grantCard(room, id) {
  const player = room.state.players.get("p1");
  player.runModifiers.push(...card(id).effects);
}

test("isci kartlari katalogda ve isci statlarini tasiyor", () => {
  const stats = new Set(["workerGatherSpeed", "workerSpeed", "workerCapacity"]);
  const workerCards = cardCatalog.filter((entry) => entry.effects.some((effect) => stats.has(effect.stat)));
  assert.ok(workerCards.length >= 4, `isci karti sayisi az: ${workerCards.length}`);
  for (const entry of workerCards) {
    assert.equal(entry.scope.kind, "global", `${entry.id}: isci karti kuresel kapsamda olmali`);
    assert.match(entry.description, /\d/);
  }
});

test("isci esyalari katalogda", () => {
  const stats = new Set(["workerGatherSpeed", "workerSpeed", "workerCapacity"]);
  const workerItems = shopCatalog.filter((entry) => entry.effects.some((effect) => stats.has(effect.stat)));
  assert.ok(workerItems.length >= 4, `isci esyasi sayisi az: ${workerItems.length}`);
});

test("buff yokken carpanlar notr", () => {
  const room = createRoom("warrior");
  const worker = loneWorker();
  assert.equal(room.getWorkerGatherSpeedMultiplier(worker), 1);
  assert.equal(room.getWorkerCapacity(worker), 12);
});

test("toplama hizi karti binaya baglanmamis isciye de isler", () => {
  const room = createRoom("warrior");
  const worker = loneWorker();
  grantCard(room, "vardiya-duzeni");

  assert.ok(
    room.getWorkerGatherSpeedMultiplier(worker) > 1,
    "kart isciye islememis"
  );
});

test("kapasite karti tasima yukunu buyutur", () => {
  const room = createRoom("warrior");
  const worker = loneWorker();
  const oncesi = room.getWorkerCapacity(worker);
  grantCard(room, "sirt-kayisi");

  assert.ok(room.getWorkerCapacity(worker) > oncesi, "kapasite artmadi");
});

test("kartlar toplamsal birikir", () => {
  const room = createRoom("warrior");
  const worker = loneWorker();
  grantCard(room, "vardiya-duzeni");
  const tek = room.getWorkerGatherSpeedMultiplier(worker);
  grantCard(room, "lojistik-doktrini");
  const cift = room.getWorkerGatherSpeedMultiplier(worker);

  assert.ok(cift > tek, "ikinci kart etki etmemis");
  const beklenen = 1
    + card("vardiya-duzeni").effects.find((effect) => effect.stat === "workerGatherSpeed").add
    + card("lojistik-doktrini").effects.find((effect) => effect.stat === "workerGatherSpeed").add;
  assert.ok(Math.abs(cift - beklenen) < 1e-9, `carpan ${cift}, beklenen ${beklenen}`);
});

test("binaya takili esya yalnizca o binanin iscilerine isler", () => {
  const room = createRoom("warrior");
  const bina = {
    id: "t1",
    ownerId: "p1",
    hp: 100,
    definition: { resourceProvider: "energy" },
    runModifiers: item("madenci-eldiveni").effects
  };
  room.towers.set(bina.id, bina);

  const bagli = { ...loneWorker(), targetTowerId: "t1" };
  const bagimsiz = loneWorker();

  assert.ok(room.getWorkerGatherSpeedMultiplier(bagli) > 1, "binaya bagli isci esyayi gormuyor");
  assert.equal(room.getWorkerGatherSpeedMultiplier(bagimsiz), 1, "esya baska iscilere de islemis");
});

test("kuresel kart hem bagli hem bagimsiz isciye isler", () => {
  const room = createRoom("warrior");
  const bina = { id: "t1", ownerId: "p1", hp: 100, definition: { resourceProvider: "energy" }, runModifiers: [] };
  room.towers.set(bina.id, bina);
  grantCard(room, "celik-burun");

  const player = room.state.players.get("p1");
  const speedAdd = card("celik-burun").effects.find((effect) => effect.stat === "workerSpeed").add;
  assert.ok(speedAdd > 0);

  for (const worker of [{ ...loneWorker(), targetTowerId: "t1" }, loneWorker()]) {
    const modifiers = room.getWorkerModifiers(worker);
    assert.ok(
      modifiers.some((modifier) => modifier.stat === "workerSpeed"),
      "yurume hizi karti isciye ulasmiyor"
    );
  }
  assert.ok(player.runModifiers.length > 0);
});
