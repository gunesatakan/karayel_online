/**
 * Seviye/kademe toreni ve dokunsal yerlestirme.
 *
 * Seviye atlamak 0.4-0.6 sn'lik sessiz bir halkaydi; 5 ve 10 (oyunun en
 * pahali alimlari) ayirt edilmiyordu, kule yerlestirmek hic tepki vermiyordu.
 * Buradaki testler yeni sozleri kilitliyor:
 *
 * - Siradan seviye "SV N"; 5 ve 10'u gecmek "SV 5 · KADEME 2" ve kademe
 *   toreni. Ilk gorulus, ayni ya da dusen seviye tor degil.
 * - Toren yaklasik 1 sn: isik sutunu yukselip soner, 12 kiymik disaridan
 *   kuleye donerek akar, sonunda hicbir sey kalmaz. Hareket azaltmada sutun
 *   yukselmez, kiymik yok.
 * - Inis 150 ms, 1.25'ten 1'e Back.easeOut (Phaser'in egrisiyle ayni).
 * - Inis yalnizca sunucunun kabul ettigi yerlestirmede: reddedilen istek
 *   `tower:spawn` yollamiyor; tasima (Refactor) zaten cizili kuleyi indirmiyor.
 * - Kendi kademen butce doluyken de gorunur ve telefonu kisa titretir;
 *   takim arkadasininki kamerana dokunmaz. Tok ses yalnizca kendi kulende.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  FEEDBACK_KIND_RULES,
  FEEDBACK_LIMITS,
  FRESH_TOWER_SPAWN_TTL_MS,
  FeedbackGovernor,
  FreshTowerSpawns,
  TIER_CEREMONY_MS,
  TIER_CEREMONY_SHARDS,
  TIER_SHARD_END_RADIUS,
  TIER_SHARD_START_RADIUS,
  TOWER_LANDING_DUST_MS,
  TOWER_LANDING_FROM_SCALE,
  TOWER_LANDING_MS,
  TOWER_TIER_2_LEVEL,
  TOWER_TIER_3_LEVEL,
  getTierCeremonyPose,
  getTierShardOrbit,
  getTowerLandingScale,
  getTowerLevelCeremony,
  getTowerLevelExpCost,
  getTowerLevelGoldCost,
  getTowerTier,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const require = createRequire(import.meta.url);
const phaserBackOut = require("../node_modules/phaser/src/math/easing/back/Out.js");

test("siradan seviye 'SV N', 5 ve 10'u gecmek kademe toreni", () => {
  for (let level = 1; level < 10; level += 1) {
    const ceremony = getTowerLevelCeremony(level, level + 1);
    assert.ok(ceremony, `${level} -> ${level + 1}`);
    const crossed = level + 1 === TOWER_TIER_2_LEVEL || level + 1 === TOWER_TIER_3_LEVEL;
    assert.equal(ceremony.kind, crossed ? "tier" : "level", `${level} -> ${level + 1}`);
    assert.equal(ceremony.level, level + 1);
    assert.equal(ceremony.tier, getTowerTier(level + 1));
    assert.equal(ceremony.label, crossed ? `SV ${level + 1} · KADEME ${ceremony.tier}` : `SV ${level + 1}`);
    // Etiket yonetmenin etiket butcesiyle ayni anda bosalsin.
    assert.equal(ceremony.labelMs, FEEDBACK_KIND_RULES[ceremony.kind].visualMs);
  }
  assert.equal(getTowerLevelCeremony(4, 5).label, "SV 5 · KADEME 2");
  assert.equal(getTowerLevelCeremony(9, 10).label, "SV 10 · KADEME 3");
});

test("ilk gorulus, ayni ve dusen seviye tor degil; coklu atlama varilan seviyeyi soyler", () => {
  assert.equal(getTowerLevelCeremony(undefined, 3), undefined, "katilan oyuncunun kuleleri parlamaz");
  assert.equal(getTowerLevelCeremony(3, 3), undefined);
  assert.equal(getTowerLevelCeremony(6, 2), undefined, "yaratici modda geri alma tor degil");
  assert.equal(getTowerLevelCeremony(Number.NaN, 4), undefined);

  // Yaratici mod seviyeyi dogrudan yazabiliyor: tek tor, varilan seviye.
  const jump = getTowerLevelCeremony(1, 10);
  assert.equal(jump.kind, "tier");
  assert.equal(jump.label, "SV 10 · KADEME 3");
  assert.equal(getTowerLevelCeremony(3, 6).label, "SV 6 · KADEME 2");
  assert.equal(getTowerLevelCeremony(5, 9).kind, "level", "ayni kademede kalan atlama kademe kutlamaz");
});

test("kademe toreni yaklasik 1 sn: sutun yukselir ve soner, 12 kiymik iceri donerek akar", () => {
  assert.ok(TIER_CEREMONY_MS >= 900 && TIER_CEREMONY_MS <= 1100, `${TIER_CEREMONY_MS} ms`);
  assert.equal(TIER_CEREMONY_SHARDS, 12);

  const start = getTierCeremonyPose(0, false);
  assert.equal(start.columnHeight, 0, "sutun yerden baslar");
  assert.equal(start.columnAlpha, 0);
  assert.equal(getTierCeremonyPose(0.2, false).columnHeight, 1, "ilk beste birde tam boy");

  const end = getTierCeremonyPose(1, false);
  assert.equal(end.columnAlpha, 0, "sonunda sutun yok");
  assert.equal(end.shardAlpha, 0, "sonunda kiymik yok");

  let previousTravel = -1;
  let peakAlpha = 0;
  let fadingAlpha = Infinity;
  for (let step = 0; step <= 100; step += 1) {
    const pose = getTierCeremonyPose(step / 100, false);
    assert.ok(pose.shardTravel >= previousTravel, `kiymik geri gitmez (${step}%)`);
    previousTravel = pose.shardTravel;
    for (const value of [pose.columnHeight, pose.columnWidth, pose.columnAlpha, pose.shardTravel, pose.shardAlpha]) {
      assert.ok(value >= 0 && value <= 1, `poz 0-1 araliginda (${step}%)`);
    }
    peakAlpha = Math.max(peakAlpha, pose.columnAlpha);
    if (step >= 55) {
      assert.ok(pose.columnAlpha <= fadingAlpha + 1e-12, `sonerken yeniden parlamaz (${step}%)`);
      fadingAlpha = pose.columnAlpha;
    }
  }
  assert.equal(peakAlpha, 1);
  assert.equal(previousTravel, 1, "kiymiklar kuleye varir");

  // Kiymik yolu: disaridan kulenin kenarina, hepsi ayni yone donerek.
  assert.ok(TIER_SHARD_START_RADIUS > 1.5 && TIER_SHARD_END_RADIUS < 0.5);
  const angles = [];
  for (let index = 0; index < TIER_CEREMONY_SHARDS; index += 1) {
    const from = getTierShardOrbit(index, TIER_CEREMONY_SHARDS, 0);
    const to = getTierShardOrbit(index, TIER_CEREMONY_SHARDS, 1);
    assert.ok(Math.abs(from.radius - TIER_SHARD_START_RADIUS) < 1e-9);
    assert.ok(Math.abs(to.radius - TIER_SHARD_END_RADIUS) < 1e-9);
    assert.ok(to.angle > from.angle, "donerek akiyor");
    assert.ok(getTierShardOrbit(index, TIER_CEREMONY_SHARDS, 0.5).radius < from.radius, "iceri");
    angles.push(from.angle);
  }
  const spacing = (Math.PI * 2) / TIER_CEREMONY_SHARDS;
  for (let index = 1; index < angles.length; index += 1) {
    assert.ok(Math.abs(angles[index] - angles[index - 1] - spacing) < 1e-9, "cemberde esit aralikli");
  }
});

test("hareket azaltma: sutun yukselmez, kiymik yok, yine de soner", () => {
  for (let step = 0; step <= 100; step += 5) {
    const pose = getTierCeremonyPose(step / 100, true);
    assert.equal(pose.columnHeight, 1, "tam boyuyla beliriyor");
    assert.equal(pose.columnWidth, 1);
    assert.equal(pose.shardAlpha, 0, "kiymik yok");
  }
  assert.equal(getTierCeremonyPose(0.3, true).columnAlpha, 1, "bilgi kaliyor");
  assert.equal(getTierCeremonyPose(1, true).columnAlpha, 0);
});

test("inis 150 ms: 1.25'ten baslar, hafif basip 1'e oturur (Phaser Back.easeOut)", () => {
  assert.equal(TOWER_LANDING_MS, 150);
  assert.equal(TOWER_LANDING_FROM_SCALE, 1.25);
  assert.ok(TOWER_LANDING_DUST_MS > TOWER_LANDING_MS && TOWER_LANDING_DUST_MS <= 500, "toz basmadan biraz uzun");
  assert.equal(getTowerLandingScale(0), 1.25);
  assert.ok(Math.abs(getTowerLandingScale(TOWER_LANDING_MS) - 1) < 1e-12);
  assert.equal(getTowerLandingScale(TOWER_LANDING_MS * 3), 1, "inisten sonra olcek degismez");

  let lowest = Infinity;
  for (let elapsed = 0; elapsed <= TOWER_LANDING_MS; elapsed += 1) {
    const scale = getTowerLandingScale(elapsed);
    const expected = 1.25 + (1 - 1.25) * phaserBackOut(elapsed / TOWER_LANDING_MS);
    assert.ok(Math.abs(scale - expected) < 1e-9, `Phaser egrisiyle ayni (${elapsed} ms)`);
    assert.ok(scale <= 1.25 + 1e-12);
    lowest = Math.min(lowest, scale);
  }
  assert.ok(lowest < 1 && lowest > 0.95, `hafif basma: ${lowest}`);

  for (const elapsed of [0, 40, 90, 150]) {
    assert.equal(getTowerLandingScale(elapsed, true), 1, "hareket azaltmada basma yok");
  }
});

test("yerlestirme onayi tek kullanimlik, bayatlar ve sinirli", () => {
  const spawns = new FreshTowerSpawns();
  spawns.note("t1", 1000);
  assert.equal(spawns.take("t1", 1500), true, "oynatma gecikmesinden sonra iniyor");
  assert.equal(spawns.take("t1", 1510), false, "ayni kule ikinci kez inmez");
  assert.equal(spawns.take("yok", 1510), false);

  spawns.note("t2", 2000);
  assert.equal(spawns.take("t2", 2000 + FRESH_TOWER_SPAWN_TTL_MS + 1), false, "bayat onay inmez");

  spawns.note("t3", 3000);
  spawns.forget("t3");
  assert.equal(spawns.take("t3", 3001), false, "satilan kulenin onayi unutuluyor");

  const bounded = new FreshTowerSpawns(1000, 4);
  for (let index = 0; index < 10; index += 1) {
    bounded.note(`b${index}`, 100 + index);
  }
  assert.equal(bounded.size, 4);
  assert.equal(bounded.take("b0", 200), false, "en eski dustu");
  assert.equal(bounded.take("b9", 200), true);

  const aging = new FreshTowerSpawns(1000, 8);
  aging.note("old", 0);
  aging.note("new", 900);
  aging.note("later", 1500);
  assert.equal(aging.size, 2, "yeni onay bayatlari temizliyor");
});

test("kendi kademen butce doluyken de gorunur; takim arkadasininki kamerana dokunmaz", () => {
  const governor = new FeedbackGovernor();
  for (let index = 0; index < FEEDBACK_LIMITS.labels; index += 1) {
    governor.decide("level", { own: true, x: index * 100, y: 0 }, 0);
  }
  const own = governor.decide("tier", { own: true, x: 900, y: 0 }, 10);
  assert.equal(own.priority, 0);
  assert.equal(own.show, true, "P0 dusmez");
  assert.equal(own.recycle, true, "en eski etiketin yerini alir");
  assert.ok(own.shakePx > 0 && own.shakePx <= FEEDBACK_LIMITS.maxShakePx, `sarsinti ${own.shakePx}`);
  assert.ok(own.vibrateMs >= FEEDBACK_LIMITS.minVibrateMs && own.vibrateMs <= FEEDBACK_LIMITS.maxVibrateMs);

  const mate = new FeedbackGovernor().decide("tier", { own: false, x: 0, y: 0 }, 5000);
  assert.equal(mate.priority, 3);
  assert.equal(mate.shakePx, 0, "arkadasin kademesi kamerani sallamaz");
  assert.equal(mate.vibrateMs, 0);

  const still = new FeedbackGovernor({ reducedMotion: true }).decide("tier", { own: true }, 0);
  assert.equal(still.shakePx, 0, "hareket azaltmada sarsinti yok");
  assert.equal(still.show, true);

  const level = new FeedbackGovernor().decide("level", { own: true, x: 0, y: 0 }, 0);
  assert.equal(level.shakePx, 0, "siradan seviye sallamaz");
  assert.equal(level.vibrateMs, 0);

  // Tok ses yalnizca kendi kulende; kule her iki ekranda da iniyor.
  const placeGovernor = new FeedbackGovernor();
  assert.equal(placeGovernor.admitSound("place", true, 0).play, true);
  assert.equal(placeGovernor.admitSound("place", false, 1000).play, false);
  assert.equal(new FeedbackGovernor().decide("place", { own: false }, 0).show, true);
  assert.equal(FEEDBACK_KIND_RULES.place.shakePx, 0, "yerlestirme kamerayi oynatmaz");
});

test("inis yalnizca sunucunun kabul ettigi yerlestirmede; tasima yeniden indirmez", () => {
  const room = createRoom("warrior");
  const broadcasts = [];
  room.broadcast = (type, message) => broadcasts.push({ type, message });
  const client = { sessionId: "p1", send() {} };
  const definition = towerCatalog.warrior.find((entry) => entry.id === "warrior-1");
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot);

  // Istemcinin kurali: cizili olmayan kulenin onayi not ediliyor, ilk karede
  // (katilma) hicbir kule inmiyor, sonraki karelerde yeni kule bir kez iniyor.
  const rendered = new Set();
  const fresh = new FreshTowerSpawns();
  let primed = false;
  let now = 0;
  const spawnsOf = () => broadcasts.filter((entry) => entry.type === "tower:spawn");
  const deliver = () => {
    for (const { message } of spawnsOf()) {
      if (!rendered.has(message.id)) fresh.note(message.id, now);
    }
    broadcasts.length = 0;
  };
  const render = () => {
    const landed = [];
    for (const id of room.towers.keys()) {
      if (rendered.has(id)) continue;
      rendered.add(id);
      if (primed && fresh.take(id, now)) landed.push(id);
    }
    primed = true;
    return landed;
  };

  assert.deepEqual(render(), [], "bos ilk kare");
  room.placeTower(client, { ...spot, definitionId: definition.id });
  const placed = [...room.towers.keys()];
  assert.equal(placed.length, 1);
  assert.equal(spawnsOf().length, 1, "kabul edilen yerlestirme tek onay");
  assert.equal(spawnsOf()[0].message.id, placed[0]);
  deliver();
  now += 500;
  assert.deepEqual(render(), placed, "oynatmada belirince iniyor");
  assert.deepEqual(render(), [], "bir kez");

  // Dolu kareye ikinci istek: sunucu reddediyor, onay yok, inis yok.
  room.placeTower(client, { ...spot, definitionId: definition.id });
  assert.equal(spawnsOf().length, 0, "reddedilen yerlestirme onay yollamaz");
  const player = room.state.players.get("p1");
  player.gold = 0;
  const other = findBuildableSpot(room, definition.id);
  room.placeTower(client, { ...other, definitionId: definition.id });
  assert.equal(spawnsOf().length, 0, "altin yetmeyince onay yok");
  assert.equal(room.towers.size, 1);

  // Refactor kuleyi tasiyor ve ayni kimlikle yine `tower:spawn` yolluyor;
  // kule zaten cizili oldugu icin istemci onu not etmiyor.
  const target = findBuildableSpot(room, definition.id);
  assert.ok(target);
  assert.equal(room.refactorTower(client, { towerId: placed[0], x: target.x, y: target.y }), true);
  assert.equal(spawnsOf().length, 1);
  deliver();
  assert.equal(fresh.size, 0, "tasima yeni kule degil");
  assert.deepEqual(render(), []);
});

test("sunucunun yukseltmesi tek adim: her kademe gecisi 4->5 ya da 9->10 olarak gorunur", () => {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  const client = { sessionId: "p1", send() {} };
  const definition = towerCatalog.warrior.find((entry) => entry.id === "warrior-1");
  const spot = findBuildableSpot(room, definition.id);
  room.placeTower(client, { ...spot, definitionId: definition.id });
  const model = [...room.towers.values()][0];
  const player = room.state.players.get("p1");

  const seen = [];
  while (model.level < 10) {
    const before = model.level;
    player.experience = getTowerLevelExpCost(definition.cost, before);
    player.gold = getTowerLevelGoldCost(definition.cost, before);
    room.upgradeTower(client, { towerId: model.id });
    assert.equal(model.level, before + 1, "yukseltme tek adim");
    const ceremony = getTowerLevelCeremony(before, model.level);
    seen.push(ceremony.kind === "tier" ? ceremony.label : ceremony.kind);
  }
  assert.deepEqual(seen, ["level", "level", "level", "SV 5 · KADEME 2", "level", "level", "level", "level", "SV 10 · KADEME 3"]);
});

test("kaynak: yeni efektler halka havuzunda degil, onay tower:spawn'dan", async () => {
  const client = await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8");
  const body = (name) => {
    const start = client.indexOf(`private ${name}(`);
    assert.ok(start >= 0, `${name} yok`);
    const next = client.indexOf("\n  private ", start + 10);
    return client.slice(start, next < 0 ? undefined : next);
  };
  for (const name of ["playTowerLevelCeremony", "playTowerLanding"]) {
    const source = body(name);
    assert.ok(source.includes("emitTowerMoment("), `${name} CombatVfx tamponuna ciziyor`);
    assert.ok(!source.includes("spawnFlashRing("), `${name} 28 slotluk halka havuzuna girmiyor`);
    assert.ok(!source.includes("add.text("), `${name} efekt basina Text acmiyor`);
    assert.ok(source.includes("this.feedback?.emit("), `${name} yonetmenden geciyor`);
  }
  // Sunucu onayinin atimi (takma, onarim) da halka havuzuna girmiyor:
  // kalabalik dalgada havuz atis parlamalariyla dolu.
  const confirm = body("pulseConfirmedTower");
  assert.ok(confirm.includes("emitTowerMoment("), "onay halkasi CombatVfx tamponunda");
  assert.ok(!confirm.includes("spawnFlashRing("), "onay halkasi 28 slotluk havuza girmiyor");
  assert.ok(!confirm.includes("playTowerPulse("), "onay halkasi havuzu kullanan atimdan gecmiyor");
  assert.ok(/room\.onMessage\("tower:spawn",[\s\S]{0,400}freshTowerSpawns\.note\(/.test(client), "onay tower:spawn'dan not ediliyor");
});
