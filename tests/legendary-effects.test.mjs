/**
 * Efsanevi vurus etkileri (packages/shared/src/legendary).
 *
 * Sahibin kurali: etkiler ihtimalle geliyor ve ihtimal vurus basina degil,
 * kulenin dusmanla temasta gecirdigi saniye basina sayiliyor; zar tutarsa
 * etki kulenin o dusmana bir sonraki vurusunda uygulaniyor. Buradaki testler
 * once temas saatini (hizli ve yavas kule ayni sikta tetikliyor, temas
 * kopunca zar yok, kurulu hak yalnizca sonraki vurusta), sonra sekiz etkinin
 * her birini gercek odada, sonra nadirligin cekilis ve vitrin agirligini
 * tutuyor. Sayilar sabitlerden okunuyor: denge ayari testi bozmasin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BLAST_DAMAGE_SECONDS,
  BLAST_RADIUS_CELLS,
  CARD_RARITY_ORDER,
  CARD_RARITY_WEIGHT,
  CHAIN_DAMAGE_SECONDS,
  CHAIN_JUMPS,
  CHAIN_RANGE_CELLS,
  CHRONO_PAYBACK_RATIO,
  CHRONO_SCAR_MS,
  EXECUTE_CHAMPION_THRESHOLD,
  EXECUTE_THRESHOLD,
  FREEZE_CHAMPION_DURATION_MS,
  FREEZE_DURATION_MS,
  FREEZE_IMMUNITY_MS,
  GAME_SPEED_MULTIPLIER,
  GRAVITY_DURATION_MS,
  GRAVITY_HOLD_CELLS,
  GRAVITY_PULL_CELLS_PER_SECOND,
  LEGENDARY_CARD_CHANCE,
  LEGENDARY_CARD_NAMES,
  LEGENDARY_CHANCE_CAP,
  LEGENDARY_CHANCE_STATS,
  LEGENDARY_EFFECTS,
  LEGENDARY_ITEM_CHANCE,
  LEGENDARY_ITEM_NAMES,
  LEGENDARY_MAX_ARMED,
  LINK_SHARE,
  SHATTER_CHAIN_FALLOFF,
  SHATTER_FRACTURE_MS,
  SHATTER_MAX_HP_RATIO,
  SHATTER_RADIUS_CELLS,
  SHOP_LEGENDARY_OFFER_WEIGHT,
  advanceLegendaryEngagement,
  cardCatalog,
  createLegendaryPairState,
  drawCards,
  drawShopOffers,
  getCardRarity,
  getEngageGapAllowanceMs,
  getMapGridSize,
  getModifierAdd,
  getShopItem,
  getShopItemOfferWeight,
  gridToWorld,
  isGlobalShopItem,
  shopCatalog,
  cardAppliesToTower,
  isShopItemAvailable,
  shopItemAppliesToTower,
  towerCatalog,
  worldToGrid,
  getBodyProjectionMin
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };
const near = (actual, expected, label = "", epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label} ${actual} != ${expected}`);
/** Oyun milisaniyesinin duvar saati karsiligi. */
const wall = (gameMs) => gameMs / GAME_SPEED_MULTIPLIER;

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

// ------------------------------------------------------------------ 1. Temas saati

test("temas saati: hizli ve yavas kule temas saniyesi basina ayni sayida zar atiyor", () => {
  const seconds = 100;
  const rollsFor = (intervalMs) => {
    const pair = createLegendaryPairState(0);
    const allowance = getEngageGapAllowanceMs(intervalMs);
    let rolls = 0;
    for (let t = intervalMs; t <= seconds * 1000; t += intervalMs) rolls += advanceLegendaryEngagement(pair, intervalMs, allowance, [0.5], () => 1);
    return rolls;
  };
  const fast = rollsFor(150);
  const slow = rollsFor(2350);
  const glacial = rollsFor(6000);
  assert.ok(fast >= seconds - 1 && fast <= seconds, `hizli kule ${fast} zar`);
  assert.ok(slow >= seconds - 3 && slow <= seconds, `yavas kule ${slow} zar`);
  assert.ok(glacial >= seconds - 6 && glacial <= seconds, `6 saniyelik kule ${glacial} zar`);
});

test("temas saati: saniye basina tetik sikligi atis hizindan bagimsiz", () => {
  const chance = 0.2;
  const seconds = 4000;
  const rateFor = (intervalMs, seed) => {
    const random = lcg(seed);
    const pair = createLegendaryPairState(0);
    const allowance = getEngageGapAllowanceMs(intervalMs);
    let applied = 0;
    for (let t = intervalMs; t <= seconds * 1000; t += intervalMs) {
      advanceLegendaryEngagement(pair, intervalMs, allowance, [chance], random);
      // Her vurus en fazla bir hak kullaniyor.
      if (pair.armed[0] > 0) { pair.armed[0] -= 1; applied += 1; }
    }
    return applied / seconds;
  };
  for (const [interval, seed] of [[120, 1], [700, 2], [2350, 3]]) {
    const rate = rateFor(interval, seed);
    assert.ok(Math.abs(rate - chance) < 0.02, `${interval} ms aralikli kule saniyede ${rate.toFixed(3)} tetik, beklenen ${chance}`);
  }
  assert.ok(LEGENDARY_MAX_ARMED >= 2, "yavas kule bir araliga iki zar sigdirabiliyor; ikinci hak kaybolmamali");
});

test("temas saati: temas kopunca zar atilmiyor ve saat sifirlaniyor", () => {
  const pair = createLegendaryPairState(0);
  const allowance = getEngageGapAllowanceMs(500);
  assert.equal(allowance, 1500);
  assert.equal(advanceLegendaryEngagement(pair, 900, allowance, [1], () => 0), 0, "ilk saniye dolmadan zar");
  assert.equal(pair.carryMs, 900);
  assert.equal(advanceLegendaryEngagement(pair, allowance + 1, allowance, [1], () => 0), 0, "kopan temasta zar");
  assert.equal(pair.carryMs, 0, "kopan temas saati sifirlamadi");
  assert.equal(pair.armed[0], 0);
  assert.equal(advanceLegendaryEngagement(pair, 1000, allowance, [1], () => 0), 1);
  assert.equal(pair.armed[0], 1);
});

// ------------------------------------------------------------------ Oda duzenegi

function oda() {
  const room = createRoom("warrior");
  // Olaylar tik sonunda tek yayinda gidiyor; testler tik surmedigi icin kuyruktan okuyor.
  room.procs = room.pendingLegendaryProcs;
  room.broadcast = () => {};
  room.setupPhase = false;
  room.towerCriticalRandom = () => 1;
  room.legendaryRandom = () => 1;
  return room;
}

/**
 * Varsayilan kule Obsesyon (tek hedef, isaretsiz): Takipci'nin takip isareti
 * baska kaynaklarin hasarini buyutup olcumleri bozardi.
 */
function kur(room, definitionId = "warrior-4") {
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin yer yok`);
  room.placeTower(client, { ...spot, definitionId });
  return [...room.towers.values()].at(-1);
}

function esyaTak(room, tower, itemId) {
  const player = room.state.players.get("p1");
  player.ownedShopItemIds.push(itemId);
  player.inventoryItemIds.push(itemId);
  room.equipShopItem(client, { itemId, towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes(itemId), `${itemId} takilamadi`);
}

function kartAl(room, cardId) {
  const card = cardCatalog.find((entry) => entry.id === cardId);
  room.pendingCardChoices.set("p1", [card]);
  room.chooseCard(client, { cardId });
  assert.ok(room.state.players.get("p1").ownedCardIds.includes(cardId), `${cardId} secilemedi`);
}

function dusman(room, x, y, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, { x, y, hp: 1e9, maxHp: 1e9, shield: 0, maxShield: 0, armor: 0, type: "grunt", movementKind: "ground",
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides });
  // Govde (gorunen govdenin cokgeni) verilen ture gore: dogumdaki rastgele tur degil.
  room.assignEnemyBody(enemy);
  room.enemySpatialGrid.rebuild(room.enemies.values());
  return enemy;
}

/** Sahte saat: testin sonunda geri aliniyor. */
function saat(t) {
  const real = Date.now;
  let clock = 1_900_000_000_000;
  Date.now = () => clock;
  t.after(() => { Date.now = real; });
  return {
    get now() { return clock; },
    /** Oyun milisaniyesi ilerlet. */
    ilerle(gameMs) { clock += wall(gameMs); }
  };
}

const itemFor = (kind) => LEGENDARY_ITEM_NAMES[kind][0];
const cardFor = (kind) => LEGENDARY_CARD_NAMES[kind][0];

/** Kulenin dogrudan vurusu. */
const vur = (room, tower, enemy, damage = 10) => room.damageEnemy(enemy, damage, 0, tower.definition.id, "p1", "true", 0, 1, tower.id, "projectile");

/** Bir saniyelik temas: iki vurus arasi tam bir oyun saniyesi; ikinci vurusta zar tutmus hak uygulaniyor. */
function temasla(room, tower, enemy, clock) {
  vur(room, tower, enemy);
  room.legendaryRandom = () => 0;
  clock.ilerle(1000);
  vur(room, tower, enemy);
  room.legendaryRandom = () => 1;
}

// ------------------------------------------------------------------ 2. Odada temas ve hak

test("kurulu hak yalnizca zarin tuttugu andan sonraki ilk vurusta uygulaniyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("chain"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  const side = dusman(room, tower.x + cell * 2, tower.y);
  room.legendaryRandom = () => 0;
  vur(room, tower, target);
  assert.equal(side.hp, 1e9, "ilk vurus saati yalnizca baslatmali");
  clock.ilerle(999);
  vur(room, tower, target);
  assert.equal(side.hp, 1e9, "tam saniye dolmadan zar atildi");
  clock.ilerle(1);
  vur(room, tower, target);
  assert.ok(side.hp < 1e9, "zar tutan saniyeden sonraki vurus zinciri tasimadi");
  const afterChain = side.hp;
  room.legendaryRandom = () => 1;
  clock.ilerle(450);
  vur(room, tower, target);
  assert.equal(side.hp, afterChain, "kullanilan hak ikinci vurusta yeniden uygulandi");
});

test("temas kopunca zar yok; efsanevisiz kulede kayit acilmiyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  const plain = kur(room);
  esyaTak(room, tower, itemFor("chain"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  const side = dusman(room, tower.x + cell * 2, tower.y);
  room.legendaryRandom = () => 0;
  vur(room, tower, target);
  // Pay kulenin surekli (isi sinirli) tetik araligindan.
  clock.ilerle(getEngageGapAllowanceMs(room.getTowerLegendaryRhythm(tower).intervalMs) + 50);
  vur(room, tower, target);
  assert.equal(side.hp, 1e9, "kopan temas zar atti");
  vur(room, plain, target);
  clock.ilerle(1000);
  vur(room, plain, target);
  assert.equal(target.legendary.pairs.has(plain.id), false, "efsanevisiz kule temas kaydi acti");
});

test("kart ve esya ayni kulede toplaniyor, tavanli; kart hasar veren butun kulelere isliyor", () => {
  const room = oda();
  const tower = kur(room);
  const index = LEGENDARY_EFFECTS.indexOf("blast");
  kartAl(room, cardFor("blast"));
  near(room.getTowerGrantState(tower).legendaryChances[index], LEGENDARY_CARD_CHANCE, "kart ihtimali");
  esyaTak(room, tower, itemFor("blast"));
  near(room.getTowerGrantState(tower).legendaryChances[index], Math.min(LEGENDARY_CHANCE_CAP, LEGENDARY_CARD_CHANCE + LEGENDARY_ITEM_CHANCE), "kart + esya");
  const block = room.getTowerStatsBlock(tower, "p1");
  const line = block.fe.find(([kind]) => kind === "lg:blast");
  assert.ok(line, "panelde efsanevi satir yok");
  near(line[1], Math.min(LEGENDARY_CHANCE_CAP, LEGENDARY_CARD_CHANCE + LEGENDARY_ITEM_CHANCE), "panel ihtimali", 1e-4);
  near(line[3], room.getTowerLegendaryPower(tower) * BLAST_DAMAGE_SECONDS, "panel patlama hasari", 0.1);
  for (const kind of LEGENDARY_EFFECTS) {
    assert.equal(getModifierAdd(getShopItem(itemFor(kind)).effects, LEGENDARY_CHANCE_STATS[kind]), LEGENDARY_ITEM_CHANCE, `${kind} esya ihtimali`);
    const card = cardCatalog.find((entry) => entry.id === cardFor(kind));
    assert.equal(getModifierAdd(card.effects, LEGENDARY_CHANCE_STATS[kind]), LEGENDARY_CARD_CHANCE, `${kind} kart ihtimali`);
  }
});

// ------------------------------------------------------------------ 3. Etkiler

test("Zincirleme Simsek: en fazla CHAIN_JUMPS dusmana zincir halinde, her biri kule saniyesi kadar", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("chain"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  const links = Array.from({ length: CHAIN_JUMPS + 1 }, (_, index) => dusman(room, tower.x + cell + cell * 1.5 * (index + 1), tower.y));
  const far = dusman(room, tower.x + cell, tower.y + cell * (CHAIN_RANGE_CELLS + 3));
  temasla(room, tower, target, clock);
  const power = room.getTowerLegendaryPower(tower);
  links.slice(0, CHAIN_JUMPS).forEach((enemy, index) => near(1e9 - enemy.hp, power * CHAIN_DAMAGE_SECONDS, `${index + 1}. halka`, 1e-3));
  assert.equal(links[CHAIN_JUMPS].hp, 1e9, "zincir sicrama sayisini asti");
  assert.equal(far.hp, 1e9, "menzil disina sicradi");
  const proc = room.procs.find((message) => message.k === "chain");
  assert.equal(proc.p.length, (CHAIN_JUMPS + 1) * 2, "zincirin halkalari istemciye gitmedi");
});

test("Vurusta Patlama: hedefin cevresindeki herkese (govdesi halkaya degen), yaricap disina degil; kritik atmiyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("blast"));
  const cell = getMapGridSize(room.activeMap);
  const radius = cell * BLAST_RADIUS_CELLS;
  const target = dusman(room, tower.x + cell, tower.y);
  const inside = dusman(room, tower.x + cell + cell * (BLAST_RADIUS_CELLS - 0.2), tower.y);
  // Alan hasari gorunen govdeye (sahibin karari, 2026-10): merkezi halkanin
  // disinda ama govdesinin yan kenari halkanin 1 birim icinde olan da
  // vuruluyor. Govdenin en uzak noktasi (`body.reach`) bile halkaya 0,3 kare
  // uzak olan vurulmuyor (eskiden merkezi 0,3 kare disarida olan).
  // Yon dondurulmemis doku (+y): govdenin halkaya bakan (sol) ucu cokgenin en soldaki noktasi.
  const edge = dusman(room, 0, tower.y);
  const leftReach = edge.body.x - getBodyProjectionMin(edge.body, 1, 0);
  edge.x = tower.x + cell + radius + leftReach - 1;
  assert.ok(edge.x - (tower.x + cell) > radius + 5, "kenardaki dusmanin merkezi halkanin disinda degil");
  const outside = dusman(room, 0, tower.y);
  outside.x = tower.x + cell + radius + outside.body.reach + cell * 0.3;
  room.enemySpatialGrid.rebuild(room.enemies.values());
  vur(room, tower, target);
  room.legendaryRandom = () => 0;
  room.towerCriticalRandom = () => 0;
  const before = target.hp;
  clock.ilerle(1000);
  vur(room, tower, target);
  const expected = room.getTowerLegendaryPower(tower) * BLAST_DAMAGE_SECONDS;
  near(1e9 - inside.hp, expected, "yaricap ici", 1e-3);
  near(1e9 - edge.hp, expected, "govdesi halkaya degen", 1e-3);
  assert.equal(outside.hp, 1e9, "yaricap disina vurdu");
  assert.ok(before - target.hp >= expected, "hedef patlamadan pay almadi");
});

test("Dondurma: cok kisa, sampiyonda daha kisa; bagisiklik zincirleme kilidi kesiyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("freeze"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  temasla(room, tower, target, clock);
  const freeze = target.statusEffects.freeze;
  assert.ok(freeze, "donma yok");
  near(freeze.expiresAt - clock.now, wall(FREEZE_DURATION_MS), "donma suresi", 1);
  assert.ok(FREEZE_DURATION_MS <= 600, "donma 'cok minimal' olmali");
  // Bagisiklik: her saniye zar tutsa da bagisiklik suresinde yeniden donmuyor.
  const frozenAt = clock.now;
  room.legendaryRandom = () => 0;
  let refrozenAt;
  for (let step = 0; step < 12 && refrozenAt === undefined; step += 1) {
    clock.ilerle(500);
    vur(room, tower, target);
    if (target.statusEffects.freeze.expiresAt > clock.now) refrozenAt = clock.now;
  }
  room.legendaryRandom = () => 1;
  assert.ok(refrozenAt !== undefined, "bagisiklik bitince bekleyen hak islemedi");
  assert.ok(refrozenAt - frozenAt >= wall(FREEZE_DURATION_MS + FREEZE_IMMUNITY_MS) - 1, "bagisiklik suresinde yeniden dondu");

  const champion = dusman(room, tower.x + cell, tower.y + cell);
  champion.champion = { type: "brute", gold: 50, exp: 5, reputation: 0, replaced: 1, leadSlots: 0, hpMultiple: 1, leakDamage: 1, spawnedAt: clock.now };
  temasla(room, tower, champion, clock);
  near(champion.statusEffects.freeze.expiresAt - clock.now, wall(FREEZE_CHAMPION_DURATION_MS), "sampiyon donmasi", 1);
  assert.ok(FREEZE_CHAMPION_DURATION_MS < FREEZE_DURATION_MS);
});

test("Infaz: esigin altinda bitiriyor, ustunde hak bekliyor; infaz bagisikligi (brute, sampiyon) korunuyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("execute"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y, { hp: 500, maxHp: 1000 });
  temasla(room, tower, target, clock);
  assert.ok(room.enemies.has(target.id), "esigin ustunde infaz etti");
  target.hp = 1000 * EXECUTE_THRESHOLD - 20;
  clock.ilerle(100);
  vur(room, tower, target, 1);
  assert.equal(room.enemies.has(target.id), false, "bekleyen hak esigin altinda bitirmedi");
  assert.ok(room.procs.some((message) => message.k === "execute"));

  // Atakan'in infaz bagisikligi (isExecuteImmune) burada da: bagisik dusman
  // canin %1'inde bile infaz edilmiyor.
  const champion = dusman(room, tower.x + cell, tower.y + cell, { hp: 500, maxHp: 1000 });
  champion.champion = { type: "grunt", gold: 50, exp: 5, reputation: 0, replaced: 1, leadSlots: 0, hpMultiple: 1, leakDamage: 1, spawnedAt: clock.now };
  const brute = dusman(room, tower.x + cell, tower.y - cell, { hp: 500, maxHp: 1000, type: "brute" });
  for (const immune of [champion, brute]) {
    temasla(room, tower, immune, clock);
    immune.hp = 10;
    clock.ilerle(100);
    vur(room, tower, immune, 1);
    assert.ok(room.enemies.has(immune.id), `${immune.type} infaz bagisikligina ragmen infaz edildi`);
  }
  assert.ok(EXECUTE_CHAMPION_THRESHOLD < EXECUTE_THRESHOLD);
});

test("Olum Parcalanmasi: catlakli olen dusman sarapnel saciyor; sarapnelin oldurdugu da zincirleniyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("shatter"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y, { hp: 1000, maxHp: 1000 });
  const weak = dusman(room, tower.x + cell * 2, tower.y, { hp: 50, maxHp: 400 });
  // Arkadaki dusman ilk sarapnelin halkasina govdesiyle de degmiyor (alan
  // hasari gorunen govdeye: govdenin en uzak noktasi `body.reach` bile 0,1 kare
  // disarida), zayif dusmaninkinin icinde. Eskiden 3. karedeydi; merkezi
  // halkanin disindaydi ama govdesi icindeydi.
  const back = dusman(room, 0, tower.y);
  back.x = target.x + cell * SHATTER_RADIUS_CELLS + back.body.reach + cell * 0.1;
  assert.ok(back.x - weak.x + back.body.reach < cell * SHATTER_RADIUS_CELLS, "arkadaki dusman ikinci halkanin disinda");
  room.enemySpatialGrid.rebuild(room.enemies.values());
  temasla(room, tower, target, clock);
  assert.ok(target.legendary.fractureUntil > clock.now, "catlak yok");
  near(target.legendary.fractureUntil - clock.now, wall(SHATTER_FRACTURE_MS), "catlak penceresi", 1);
  room.damageEnemy(target, 1e6, 0, "skill", "p1", "true");
  assert.equal(room.enemies.has(target.id), false);
  assert.equal(room.enemies.has(weak.id), false, "sarapnel zayif dusmani oldurmedi");
  // Zayif dusman sarapnelle oldu: kendi parcalanmasi halka 1.
  near(1e9 - back.hp, 400 * SHATTER_MAX_HP_RATIO * SHATTER_CHAIN_FALLOFF, "zincirin ikinci halkasi", 1e-6);
  assert.equal(room.procs.filter((message) => message.k === "shatter" && message.f === 1).length, 2);

  // Pencere biterse catlak parcalamiyor.
  const late = dusman(room, tower.x + cell, tower.y + cell * 4, { hp: 1000, maxHp: 1000 });
  const witness = dusman(room, tower.x + cell * 2, tower.y + cell * 4);
  temasla(room, tower, late, clock);
  clock.ilerle(SHATTER_FRACTURE_MS + 10);
  room.damageEnemy(late, 1e6, 0, "skill", "p1", "true");
  assert.equal(witness.hp, 1e9, "suresi dolan catlak parcaladi");
});

test("Kronal Iz: iz bitince izde alinan butun hasarin payi bir kez daha", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("chrono"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  temasla(room, tower, target, clock);
  assert.ok(target.legendary.chronoUntil > clock.now, "iz yok");
  const marked = target.hp;
  room.damageEnemy(target, 300, 0, "skill", "p1", "true");
  room.damageEnemy(target, 200, 0, "status:burn", "p1", "true");
  clock.ilerle(1000);
  room.damageEnemy(target, 100, 0, "ultimate", "p1", "true");
  const taken = marked - target.hp;
  near(taken, 600, "izde alinan hasar");
  clock.ilerle(CHRONO_SCAR_MS);
  room.updateLegendaryEffects(0.016, Date.now());
  near(marked - target.hp, taken * (1 + CHRONO_PAYBACK_RATIO), "geri odeme", 1e-3);
  room.updateLegendaryEffects(0.016, Date.now());
  near(marked - target.hp, taken * (1 + CHRONO_PAYBACK_RATIO), "geri odeme iki kez", 1e-3);
  assert.ok(room.procs.some((message) => message.k === "chrono" && message.f === 1));
});

test("Hasar Bagi: iki yonlu pay, geri yansima yok", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("link"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  const partner = dusman(room, tower.x + cell * 2, tower.y);
  const other = dusman(room, tower.x + cell * 6, tower.y);
  temasla(room, tower, target, clock);
  assert.equal(target.legendary.linkPartnerId, partner.id, "en yakin dusmana baglanmadi");
  assert.equal(partner.legendary.linkPartnerId, target.id);
  const t0 = target.hp;
  const p0 = partner.hp;
  room.damageEnemy(target, 100, 0, "skill", "p1", "true");
  near(t0 - target.hp, 100, "hedef");
  near(p0 - partner.hp, 100 * LINK_SHARE, "ortaga gecen");
  room.damageEnemy(partner, 100, 0, "skill", "p1", "true");
  near(t0 - target.hp, 100 + 100 * LINK_SHARE, "geri gecen");
  near(p0 - partner.hp, 100 * LINK_SHARE + 100, "yansima yok");
  assert.equal(other.hp, 1e9);
  // Bag bitince pay kesiliyor.
  clock.ilerle(5000);
  room.updateLegendaryEffects(0.016, Date.now());
  const p1 = partner.hp;
  room.damageEnemy(target, 100, 0, "skill", "p1", "true");
  assert.equal(partner.hp, p1, "suresi dolan bag hala aktariyor");
});

test("Kutle Cekim Capasi: yakindakileri sinirli hizla cekiyor, sampiyonu cekmiyor, yapinin icine sokmuyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("gravity"));
  const cell = getMapGridSize(room.activeMap);
  const towerCell = worldToGrid(tower.x, tower.y, room.activeMap);
  // Capa kulenin bir yaninda, cekilen obur yaninda: duz cizgi kulenin karesinden geciyor.
  const anchorPoint = gridToWorld(towerCell.col + 1, towerCell.row, room.activeMap);
  const blockedPoint = gridToWorld(towerCell.col - 1, towerCell.row, room.activeMap);
  const anchor = dusman(room, anchorPoint.x, anchorPoint.y);
  const blocked = dusman(room, blockedPoint.x, blockedPoint.y);
  const openPoint = gridToWorld(towerCell.col + 1, towerCell.row + 2, room.activeMap);
  const open = dusman(room, openPoint.x, openPoint.y);
  const champion = dusman(room, anchorPoint.x, anchorPoint.y - cell * 2);
  champion.champion = { type: "brute", gold: 50, exp: 5, reputation: 0, replaced: 1, leadSlots: 0, hpMultiple: 1, leakDamage: 1, spawnedAt: clock.now };
  const championStart = { x: champion.x, y: champion.y };
  temasla(room, tower, anchor, clock);
  assert.ok(anchor.legendary.gravityUntil > clock.now, "capa yok");
  const startDistance = Math.hypot(open.x - anchor.x, open.y - anchor.y);
  const step = 0.1;
  let pulledTotal = 0;
  for (let elapsed = 0; elapsed < GRAVITY_DURATION_MS / 1000 + 1; elapsed += step) {
    const before = Math.hypot(open.x - anchor.x, open.y - anchor.y);
    room.enemySpatialGrid.rebuild(room.enemies.values());
    room.updateLegendaryEffects(step, Date.now());
    const after = Math.hypot(open.x - anchor.x, open.y - anchor.y);
    assert.ok(before - after <= cell * GRAVITY_PULL_CELLS_PER_SECOND * step + 1e-6, "cekim hiz sinirini asti");
    pulledTotal += before - after;
    const blockedCell = worldToGrid(blocked.x, blocked.y, room.activeMap);
    assert.notDeepEqual(blockedCell, towerCell, "dusman yapinin karesine cekildi");
    assert.deepEqual(blockedCell, worldToGrid(blockedPoint.x, blockedPoint.y, room.activeMap), "kapali yondeki dusman karesinden cikti");
    clock.ilerle(step * 1000);
  }
  assert.ok(pulledTotal > cell * 0.5, `cekim hissedilmiyor: ${pulledTotal}`);
  assert.ok(pulledTotal <= cell * GRAVITY_PULL_CELLS_PER_SECOND * GRAVITY_DURATION_MS / 1000 + 1e-6, "cekim suresinden fazla cekti");
  assert.ok(Math.hypot(open.x - anchor.x, open.y - anchor.y) >= cell * GRAVITY_HOLD_CELLS - 1e-6, "capanin ustune bindi");
  assert.ok(startDistance > Math.hypot(open.x - anchor.x, open.y - anchor.y));
  assert.deepEqual({ x: champion.x, y: champion.y }, championStart, "sampiyon cekildi");
  assert.equal(anchor.legendary.gravityUntil, 0, "capa suresi bitmedi");
});

test("efsanevi etkilerin kendi hasari temas saymiyor ve yeniden tetiklemiyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("chain"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  const side = dusman(room, tower.x + cell * 2, tower.y);
  temasla(room, tower, target, clock);
  assert.ok(side.hp < 1e9);
  assert.equal(side.legendary?.pairs?.has(tower.id) ?? false, false, "zincirin vurusu temas kaydi acti");
});

// ------------------------------------------------------------------ 4. Nadirlik

test("efsanevi kartlar epigin ustunde ve cok seyrek", () => {
  assert.deepEqual(CARD_RARITY_ORDER, ["common", "uncommon", "rare", "epic", "legendary"]);
  assert.ok(CARD_RARITY_WEIGHT.legendary > 0 && CARD_RARITY_WEIGHT.legendary < CARD_RARITY_WEIGHT.epic / 2);
  const legendary = cardCatalog.filter((card) => getCardRarity(card) === "legendary");
  assert.equal(legendary.length, LEGENDARY_EFFECTS.length);
  for (const card of legendary) assert.equal(card.scope.kind, "tagged");
  const random = lcg(7);
  const hands = 6000;
  const towers = Object.values(towerCatalog).flat();
  let seen = 0;
  for (let index = 0; index < hands; index += 1) {
    const hand = drawCards({ preferredAxes: [], towers, ownedCardIds: [], random });
    seen += hand.filter((card) => getCardRarity(card) === "legendary").length;
  }
  const total = cardCatalog.reduce((sum, card) => sum + CARD_RARITY_WEIGHT[getCardRarity(card)]
    * (card.scope.kind === "tagged" && !towers.some((tower) => cardAppliesToTower(card, tower)) ? 0.15 : 1), 0);
  const perSlot = (legendary.length * CARD_RARITY_WEIGHT.legendary) / total;
  const share = seen / (hands * 3);
  assert.ok(share < 0.02, `efsanevi kart cok sik: ${share}`);
  assert.ok(Math.abs(share - perSlot) < perSlot * 0.5, `efsanevi payi ${share}, beklenen ~${perSlot}`);
});

test("esya nadirligi: eski esyalarin vitrin agirligi degismedi, efsanevi esyalar seyrek ve pahali", () => {
  for (const item of shopCatalog) {
    if (item.rarity === "legendary") {
      assert.equal(getShopItemOfferWeight(item), SHOP_LEGENDARY_OFFER_WEIGHT);
      assert.ok(item.price >= 300, `${item.id} pahali degil`);
      assert.ok(!isGlobalShopItem(item) && item.description.includes("Takıldığı"));
    } else {
      assert.equal(item.rarity, undefined);
      assert.equal(getShopItemOfferWeight(item), 1, `${item.id} agirligi degisti`);
    }
  }
  assert.ok(SHOP_LEGENDARY_OFFER_WEIGHT < 0.25);
  const random = lcg(11);
  const towers = Object.values(towerCatalog).flat();
  let legendary = 0;
  let offers = 0;
  for (let index = 0; index < 3000; index += 1) {
    const draw = drawShopOffers({ wave: 10, preferredAxes: [], towers, ownedItemIds: [], random });
    offers += draw.length;
    legendary += draw.filter((item) => item.rarity === "legendary").length;
  }
  const weightTotal = shopCatalog.filter((item) => isShopItemAvailable(item, 10, []))
    .reduce((sum, item) => sum + getShopItemOfferWeight(item)
      * (item.scope.kind === "tagged" && !towers.some((tower) => shopItemAppliesToTower(item, tower)) ? 0.15 : 1), 0);
  const expected = (LEGENDARY_EFFECTS.length * SHOP_LEGENDARY_OFFER_WEIGHT) / weightTotal;
  const share = legendary / offers;
  assert.ok(share < 0.02, `efsanevi esya cok sik: ${share}`);
  assert.ok(Math.abs(share - expected) < expected * 0.5, `efsanevi esya payi ${share}, beklenen ~${expected}`);
});

// ------------------------------------------------------------------ 5. Inceleme duzeltmeleri

test("cekim Metal Kalkan'i kesen kaymayi yapmiyor ve dusmani izgaranin disina itmiyor", () => {
  const room = oda();
  const cell = getMapGridSize(room.activeMap);
  const inside = gridToWorld(3, 3, room.activeMap);
  const enemy = dusman(room, inside.x, inside.y);
  // Kalkan her parcayi kesiyor: hicbir kayma yapilmamali (ayni hucre dahil).
  room.metalShields = [{}];
  room.isShieldBlockingSegment = () => true;
  assert.equal(room.displaceEnemyPathSafe(enemy, cell * 0.2, 0), false);
  assert.deepEqual([enemy.x, enemy.y], [inside.x, inside.y], "kalkanin icinden cekildi");
  room.metalShields = [];
  // Sol ust kosedeki hucreden disari dogru kayma reddediliyor.
  const corner = gridToWorld(0, 0, room.activeMap);
  enemy.x = corner.x;
  enemy.y = corner.y;
  assert.equal(room.displaceEnemyPathSafe(enemy, -cell, 0), false);
  assert.deepEqual([enemy.x, enemy.y], [corner.x, corner.y], "izgaranin disina itildi");
  enemy.movementKind = "air";
  assert.equal(room.displaceEnemyPathSafe(enemy, 0, -cell), false, "ucan dusman izgaranin disina itildi");
});

test("efsanevi olaylar tik sonunda tek yayinda gidiyor", () => {
  const room = createRoom("warrior");
  const sent = [];
  room.broadcast = (type, message) => sent.push([type, message]);
  room.broadcastLegendaryProc({ k: "blast", x: 1, y: 2, r: 3 });
  room.broadcastLegendaryProc({ k: "freeze", x: 1, y: 2, e: "e1", ms: 400 });
  assert.equal(sent.length, 0, "olay aninda yayinlandi");
  room.flushLegendaryProcs();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "legendary:procs");
  assert.equal(sent[0][1].length, 2);
  room.flushLegendaryProcs();
  assert.equal(sent.length, 1, "bos kuyruk yayinlandi");
});

test("efsanevi etki hedefi oldurdugunde damageEnemy oldu diyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("execute"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y, { hp: 100, maxHp: 1000 });
  vur(room, tower, target, 1);
  room.legendaryRandom = () => 0;
  clock.ilerle(1000);
  assert.equal(vur(room, tower, target, 1), true, "infaz edilen hedef canli sayildi");
  assert.equal(room.enemies.has(target.id), false);
});

test("efsanevi hasar isci vurus etkisi tasimiyor; oldurdugu dusmanin olum etkilerine sizmiyor", (t) => {
  const clock = saat(t);
  const room = oda();
  const tower = kur(room);
  esyaTak(room, tower, itemFor("chain"));
  const cell = getMapGridSize(room.activeMap);
  const target = dusman(room, tower.x + cell, tower.y);
  const victim = dusman(room, tower.x + cell * 2, tower.y, { hp: 1, maxHp: 1 });
  const bystander = dusman(room, tower.x + cell * 5, tower.y);
  const boosts = [];
  const realBoosts = room.applyWorkerHitBoosts.bind(room);
  room.applyWorkerHitBoosts = (towerId, enemy, now) => { boosts.push(enemy.id); return realBoosts(towerId, enemy, now); };
  // Zincirin oldurdugu dusmanin olum etkisi (burada elle: kulenin bir vurusu)
  // normal bir vurus: kritik atabiliyor.
  const realFinish = room.finishEnemyKill.bind(room);
  let deathHit;
  room.finishEnemyKill = (enemy, context) => {
    realFinish(enemy, context);
    if (enemy === victim) {
      room.towerCriticalRandom = () => 0;
      const before = bystander.hp;
      room.damageEnemy(bystander, 100, 0, tower.definition.id, "p1", "true", 0, 1, tower.id, "impact");
      deathHit = before - bystander.hp;
      room.towerCriticalRandom = () => 1;
    }
  };
  temasla(room, tower, target, clock);
  assert.equal(room.enemies.has(victim.id), false, "zincir kurbani oldurmedi");
  assert.equal(boosts.includes(victim.id), false, "zincir hasari isci vurus etkisini besledi");
  assert.ok(deathHit > 100, `olum etkisi kritik atamadi: ${deathHit}`);
});
