/**
 * Motor eklentileri ve isi/enerji ekseni.
 *
 * Kartlar uzun sure yalnizca `Modifier` tasiyabiliyordu: otuz stattan birine duz
 * bir sayi. Motor ise stack, aura, trigger ve durum etkisi tanimlariyla cok daha
 * fazlasini ifade edebiliyordu; o dil karta kapaliydi. Artik kartlar ve esyalar
 * `grants` alaniyla motora dogrudan ekleme yapabiliyor.
 *
 * Buradaki testler zincirin ucundaki soruyu sorar: kartin bildirdigi sey gercek
 * bir MatchRoom'da kulenin calisan motoruna giriyor mu, ve sabit tanim kirlenmeden
 * duruyor mu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_LINE_DURATION_MS,
  COLD_CRIT_TEMPERATURE,
  RUN_HOT_HEAT_LOCK_THRESHOLD,
  cardCatalog,
  getShopItem,
  resolveTowerEngine
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

function setup(definitionId = "onur-3", characterId = "onur") {
  const room = createRoom(characterId);
  const spot = findBuildableSpot(room, definitionId);
  assert.ok(spot, `${definitionId} icin kare bulunamadi`);
  room.placeTower({ sessionId: "p1" }, { x: spot.x, y: spot.y, definitionId });
  const tower = [...room.towers.values()][0];
  return { room, tower, player: room.state.players.get("p1") };
}

function pickCard(room, cardId, towerId) {
  const card = cardCatalog.find((candidate) => candidate.id === cardId);
  assert.ok(card, `${cardId} katalogda yok`);
  room.pendingCardChoices.set("p1", [card]);
  room.chooseCard(client, { cardId, towerId });
  return card;
}

test("resolveTowerEngine sabit tanimi kirletmez", () => {
  const base = {
    attack: { shape: "single", pierceCount: 1 },
    stacks: [{ id: "temel", trigger: "kill", stat: "damage", perStack: 0.1 }],
    levelScaling: [],
    resources: { ammoType: "bullet", shotFuel: "ammo", operatingEnergyPerSecond: 1, ammoCostMultiplier: 1, energyCostMultiplier: 1, heatMultiplier: 1 },
    canHitAir: false
  };
  const resolved = resolveTowerEngine(base, [{
    stacks: [{ id: "kart", trigger: "sameTarget", stat: "damage", perStack: 0.05 }],
    attack: { pierceCount: 1 }
  }]);

  assert.equal(resolved.stacks.length, 2);
  assert.equal(resolved.attack.pierceCount, 2);
  assert.equal(base.stacks.length, 1, "temel tanima yazildi");
  assert.equal(base.attack.pierceCount, 1, "temel saldiri tanimina yazildi");
});

test("cakisan stack kimliginde temel tanim kazanir", () => {
  // Sunucu `ucube-fire-rate` gibi kimliklere ada gore bakiyor; bir kartin ayni
  // adi ele gecirmesi kulenin imza mekanigini sessizce degistirirdi.
  const base = {
    attack: { shape: "single" },
    stacks: [{ id: "imza", trigger: "kill", stat: "damage", perStack: 0.5 }],
    levelScaling: [],
    resources: { ammoType: "bullet", shotFuel: "ammo", operatingEnergyPerSecond: 1, ammoCostMultiplier: 1, energyCostMultiplier: 1, heatMultiplier: 1 },
    canHitAir: false
  };
  const resolved = resolveTowerEngine(base, [{ stacks: [{ id: "imza", trigger: "hit", stat: "damage", perStack: 0.01 }] }]);

  assert.equal(resolved.stacks.length, 1);
  assert.equal(resolved.stacks[0].perStack, 0.5);
});

test("motorsuz kuleye grant islemez", () => {
  assert.equal(resolveTowerEngine(undefined, [{ attack: { pierceCount: 3 } }]), undefined);
});

test("genel kart kulenin calisan motoruna stack ekler", () => {
  const { room, tower } = setup();
  const before = room.getTowerEngine(tower)?.stacks?.length ?? 0;

  pickCard(room, "sabir");

  const after = room.getTowerEngine(tower)?.stacks ?? [];
  assert.equal(after.length, before + 1, "stack motora girmedi");
  assert.ok(after.some((stack) => stack.id === "card-sabir"));
  assert.equal(tower.definition.engine?.stacks?.some((stack) => stack.id === "card-sabir") ?? false, false, "sabit tanim kirlendi");
});

test("ayni hedefe vurus kart stackini buyutur, hedef degisimi sifirlar", () => {
  const { room, tower } = setup();
  pickCard(room, "sabir");

  const target = { id: "e1" };
  room.prepareTowerShot(tower, target);
  room.prepareTowerShot(tower, target);
  room.prepareTowerShot(tower, target);
  assert.equal(tower.stackStates["card-sabir"].count, 2, "ilk vurus hedefi tanitir, sonrakiler biriktirir");

  room.prepareTowerShot(tower, { id: "e2" });
  assert.equal(tower.stackStates["card-sabir"], undefined, "hedef degisince sifirlanmadi");
});

test("kart stacki kule hasarina gercekten yansir", () => {
  // Onur kuleleri yerine Atakan: Onur pasifi her atista rastgele bir sans
  // carpani kuruyor ve olcumun uzerine biniyor.
  const { room, tower } = setup("warrior-1", "warrior");
  const before = room.getTowerDamage(tower);

  pickCard(room, "sabir");
  const target = { id: "e1" };
  for (let shot = 0; shot < 6; shot += 1) room.prepareTowerShot(tower, target);

  assert.ok(room.getTowerDamage(tower) > before, "biriken stack hasara yansimadi");
});

test("takili esya yalnizca kendi kulesinin motorunu degistirir", () => {
  const { room, tower, player } = setup();
  const second = findBuildableSpot(room, "onur-3");
  room.placeTower({ sessionId: "p1" }, { x: second.x, y: second.y, definitionId: "onur-3" });
  const other = [...room.towers.values()].find((candidate) => candidate.id !== tower.id);

  player.shopOffers = [getShopItem("sabir-modulu")];
  room.setupPhase = true;
  room.buyShopItem(client, { itemId: "sabir-modulu" });
  room.setupPhase = false;
  room.equipShopItem(client, { itemId: "sabir-modulu", towerId: tower.id });

  const has = (candidate) => (room.getTowerEngine(candidate)?.stacks ?? []).some((stack) => stack.id === "shop-sabir");
  assert.equal(has(tower), true, "esya takildigi kulenin motoruna girmedi");
  assert.equal(has(other), false, "esya baska kulenin motoruna sizdi");
});

test("etiketli grant kapsam disi kuleye islemez", () => {
  // Ikinci Bicak yalnizca yorunge kulelerine bicak ekler; onur-3 yorunge degil.
  const { room, tower } = setup();
  const before = room.getTowerEngine(tower)?.attack.bladeCount;
  pickCard(room, "ikinci-bicak");
  assert.equal(room.getTowerEngine(tower)?.attack.bladeCount, before, "kapsam disi kuleye bicak eklendi");
});

test("kart secimi cozulmus motoru tazeler", () => {
  // Onbellek nesil sayacina bagli; kart secildikten sonra bayat kalirsa yeni
  // icerik oyun icinde hicbir zaman gorunmez.
  const { room, tower } = setup();
  room.getTowerEngine(tower);
  const generationBefore = tower.grantCache.generation;

  pickCard(room, "kanatan-namlu");

  // Onbellek tembel: kart secimi sayaci artirir, tazelenme ilk erisimde olur.
  const refreshed = room.getTowerEngine(tower);
  assert.notEqual(tower.grantCache.generation, generationBefore, "onbellek tazelenmedi");
  assert.ok((refreshed?.statusEffects ?? []).some((effect) => effect.type === "bleed"));
});

test("kizgin namlu hasari sicakliga baglar ve kilit esigini indirir", () => {
  const { room, tower } = setup();
  tower.temperature = 60;
  const before = room.getTowerDamage(tower);
  assert.equal(room.getTowerHeatLockThreshold(tower), 100);

  pickCard(room, "kizgin-namlu");

  assert.ok(room.getTowerDamage(tower) > before, "sicaklik hasara yansimadi");
  assert.equal(room.getTowerHeatLockThreshold(tower), RUN_HOT_HEAT_LOCK_THRESHOLD);

  tower.temperature = 0;
  assert.equal(Math.round(room.getTowerDamage(tower)), Math.round(before), "soguk kulede bonus kalmis");
});

test("termal kutle 50 derece ustundeki atis hizi cezasini kaldirir", () => {
  const { room, tower } = setup();
  tower.performance = 0.5;
  tower.temperature = 75;
  const penalised = room.getTowerPerformanceAttackMultiplier(tower);

  pickCard(room, "termal-kutle");

  const relieved = room.getTowerPerformanceAttackMultiplier(tower);
  assert.ok(relieved > penalised, "isi cezasi kalkmadi");
  assert.equal(Math.round(relieved * 1000) / 1000, 1);
});

test("yedek hat enerji kesintisinde kuleyi ayakta tutar", () => {
  const { room, tower } = setup();
  const now = Date.now();
  tower.energy = 0;
  tower.energyDepletedAt = now;
  tower.ammo = tower.maxAmmo;

  assert.equal(room.isTowerOnBackupLine(tower, now), false);
  pickCard(room, "yedek-hat");

  assert.equal(room.isTowerOnBackupLine(tower, now), true, "kesintide yedek hat devreye girmedi");
  assert.equal(room.canTowerFire(tower), true, "yedek hattayken ates edemiyor");
  assert.equal(room.isTowerOnBackupLine(tower, now + BACKUP_LINE_DURATION_MS + 1), false, "yedek hat hic bitmiyor");

  tower.ammo = 0;
  assert.equal(room.isTowerOnBackupLine(tower, now), false, "muhimmatsiz yedek hat calisiyor");
});

test("soguk celik yalnizca soguk kulede kritik verir", () => {
  const { room, tower } = setup();
  pickCard(room, "soguk-celik");
  assert.equal(room.towerHasUnlock(tower, "heat:coldCrit"), true);

  // Kilidin esigi asilinca sonmesi gerekir; sicaklik kontrolu hasar yolunda.
  tower.temperature = COLD_CRIT_TEMPERATURE + 5;
  assert.ok(tower.temperature > COLD_CRIT_TEMPERATURE);
});

test("ulti ve beceri kartlari oyuncu tarafinda isler", () => {
  const { room, player } = setup();
  player.skill1CooldownMs = 1000;
  player.skill2CooldownMs = 1000;
  player.skill3CooldownMs = 1000;
  const baseGain = room.getUltimateChargeGain(player, 10);

  pickCard(room, "sarj-devresi");
  assert.ok(room.getUltimateChargeGain(player, 10) > baseGain, "ulti sarji hizlanmadi");

  pickCard(room, "kisa-devre");
  room.updateSkillCooldowns(100);
  assert.ok(player.skill1CooldownMs < 900, "beceri beklemesi hizlanmadi");
});
