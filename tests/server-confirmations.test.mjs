/**
 * Sunucu onaylarinin karsiligi.
 *
 * Sunucu magaza alimini, esya takmayi, onarimi, ulti gucunu ve isci agaci
 * hucresini yapan oyuncuya onayliyordu ama istemcide bunlari dinleyen tek
 * satir yoktu: altin gidiyor, baska hicbir sey olmuyordu. Artik her onay
 * kart secimindeki gibi bir toast, bir yonetmen sesi ve kule varsa bir atim.
 *
 * Buradaki testlerin tuttugu sozler:
 * - Her onay yalnizca yapana gidiyor ve istemci her birini dinliyor.
 * - Toast dogruyu soyluyor: bedel gercekten odenen altin/XP, ulti carpani
 *   sunucunun ulti hasarindaki carpan, "N kulene takilabilir" sunucunun
 *   kabul edecegi takma sayisi, reddedilen esya gercekten envanterde.
 * - Onay sesi P1: kalabalik dalgada dusmez; takim arkadasina hic gitmez,
 *   kamerayi ve telefonu oynatmaz.
 * - Metinler 375 px'lik ekranda iki satirlik toast'a sigiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CONFIRMATION_INSTRUCTION_MS,
  CONFIRMATION_NOTICE_MS,
  FEEDBACK_KIND_RULES,
  FEEDBACK_LIMITS,
  FeedbackGovernor,
  HIRABLE_WORKER_ROLES,
  MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER,
  ULTIMATE_POWER_MAX_LEVEL,
  WORKER_DEVELOPMENT_CELLS,
  WORKER_DEVELOPMENT_XP_COSTS,
  WORKER_ROLE_LABELS,
  countEquippableTowers,
  getFeedbackPriority,
  getInventoryEquipCue,
  getInventoryEquipRejectedCue,
  getShopItem,
  getShopPurchaseCue,
  getStructureRepairCue,
  getUltimatePowerMultiplier,
  getUltimateUpgradeCue,
  getWorkerDevelopmentCue,
  isGlobalShopItem,
  shopCatalog,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const CONFIRMATIONS = [
  "shop:purchased",
  "inventory:equipped",
  "inventory:equip-rejected",
  "structure:repaired",
  "ultimate:upgraded",
  "worker:development-unlocked"
];
const CONFIRMATION_SFX = ["purchase", "equip", "repair", "upgrade"];

/**
 * Toast iki satirda kirpiliyor (`line-clamp: 2`). 375 px'te kutu ~335 px,
 * 13 px Rajdhani'de satir basina ~55 karakter; 90 karakter iki satirin
 * rahatca icinde, kirpilan son kelime yok.
 */
const NOTICE_MAX_CHARS = 90;

function recordingClient() {
  const sent = [];
  return { sessionId: "p1", sent, send(type, payload) { sent.push({ type, payload }); } };
}

/** Onur'un butun yapilari: farkli vurus ve eksenler, duvar ve tamir merkezi dahil. */
function roomWithTowers(characterId = "onur") {
  const room = createRoom(characterId);
  const quiet = { sessionId: "p1", send() {} };
  for (const definition of towerCatalog[characterId]) {
    const spot = findBuildableSpot(room, definition.id);
    if (spot) room.placeTower(quiet, { x: spot.x, y: spot.y, definitionId: definition.id });
  }
  const towers = [...room.towers.values()];
  assert.ok(towers.length >= 6, `yeterli yapi kurulamadi: ${towers.length}`);
  return { room, player: room.state.players.get("p1"), towers };
}

/** Magaza yalnizca kurulumda ve teklif listesindekini satar; test o on kosulu kuruyor. */
function buy(room, player, client, itemId) {
  player.shopOffers = [getShopItem(itemId)];
  const previous = room.setupPhase;
  room.setupPhase = true;
  room.buyShopItem(client, { itemId });
  room.setupPhase = previous;
}

/** Istemcinin gordugu profil: tanim katalogdan (GameScene `getLocalTowerProfiles`), yuvalar kuleden. */
function clientProfiles(characterId, towers) {
  return towers.map((tower) => ({
    definition: towerCatalog[characterId].find((entry) => entry.id === tower.definition.id),
    equippedItemIds: tower.equippedShopItemIds
  }));
}

test("her onay yalnizca yapana gidiyor ve istemci her birini dinliyor", async () => {
  // Eksik olan tam olarak buydu: sunucu yolluyor, istemcide dinleyen yok.
  const server = await readFile(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8");
  for (const name of CONFIRMATIONS) {
    assert.ok(server.includes(`client.send("${name}"`), `${name} sunucuda gonderilmiyor`);
    assert.ok(!server.includes(`broadcast("${name}"`), `${name} herkese yayiliyor; baskasinin ekrani ele gecer`);
    assert.ok(client.includes(`room.onMessage("${name}"`), `${name} istemcide dinlenmiyor`);
  }
});

test("onay sesleri: kendi dokunusun P1, takim arkadasina yok, sarsinti ve titresim yok", () => {
  for (const kind of CONFIRMATION_SFX) {
    const rule = FEEDBACK_KIND_RULES[kind];
    assert.ok(rule, `${kind} kurali yok`);
    assert.equal(getFeedbackPriority(kind, true), 1, `${kind} P1 olmali`);
    assert.equal(getFeedbackPriority(kind, false), 3);
    assert.equal(rule.channel, "none", "dunyada yeni gorsel acmiyor; toast ve kule atimi var olanlar");
    assert.ok(rule.soundMs > 0, `${kind} sessiz`);
    assert.equal(rule.teammateSound, false);
    assert.equal(rule.teammateVisual, false);
    assert.equal(rule.shakePx, 0, "harcama bir darbe degil");
    assert.equal(rule.vibrateMs, 0);
    assert.equal(new FeedbackGovernor().admitSound(kind, false, 0).play, false, "baskasinin alimi senin sesin degil");
  }
});

test("onay sesi kalabalik dalgada dusmez ama ust uste basmada seyrelir", () => {
  const governor = new FeedbackGovernor();
  // Alti ses birden: butce dolu.
  for (const kind of ["crit", "kill", "ultimateReady", "place", "cardPick", "level"]) {
    assert.equal(governor.admitSound(kind, true, 0).play, true, `${kind} calmali`);
  }
  assert.equal(governor.activeVoices(1), FEEDBACK_LIMITS.sounds);
  const repair = governor.admitSound("repair", true, 1);
  assert.equal(repair.play, true, "dokunusun cevabi dusmemeli");
  assert.equal(repair.steal, true, "en once bitecek ses yer acmali");
  assert.equal(governor.activeVoices(2), FEEDBACK_LIMITS.sounds, "butce asilmaz");

  const purchases = new FeedbackGovernor();
  assert.equal(purchases.admitSound("purchase", true, 0).play, true);
  assert.equal(purchases.admitSound("purchase", true, 60).play, false, "ayni tikirti ust uste binmez");
  assert.equal(purchases.admitSound("purchase", true, FEEDBACK_KIND_RULES.purchase.soundGapMs).play, true);
});

test("magaza: kule esyasi envantere gider, 'N kulene takilabilir' sunucunun kabul ettigi sayi", () => {
  let mixed = 0;
  for (const itemId of ["delici-uc", "atis-denetleyicisi", "zirh-plakasi", "madenci-eldiveni", "kritik-sistem"]) {
    const { room, player, towers } = roomWithTowers("onur");
    const client = recordingClient();
    // Bir kulenin yuvalari dolu: tavan da ayni kuralin parcasi.
    towers[0].equippedShopItemIds.push(...Array(MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER).fill("hassas-tetik"));

    const item = getShopItem(itemId);
    const count = countEquippableTowers(item, clientProfiles("onur", towers));
    const goldBefore = player.gold;
    buy(room, player, client, itemId);

    const purchased = client.sent.find((entry) => entry.type === "shop:purchased");
    assert.ok(purchased, `${itemId} onayi gelmedi`);
    assert.deepEqual(purchased.payload, { itemId, price: goldBefore - player.gold, toInventory: true }, "bedel gercekten odenen altin");
    const cue = getShopPurchaseCue(purchased.payload, { equippableTowers: count });
    assert.equal(cue.sfx, "purchase");
    assert.equal(cue.pulse, undefined, "envantere giren esya henuz hicbir kuleyi guclendirmedi");
    assert.equal(
      cue.text,
      count > 0
        ? `${item.name} envantere eklendi · ${count} kulene takılabilir`
        : `${item.name} envantere eklendi · şu an takılabileceği kulen yok`
    );

    // Sayinin sozu: sunucu tam olarak bu kadar kuleye takiyor.
    player.inventoryItemIds.push(...Array(towers.length).fill(itemId));
    let accepted = 0;
    for (const tower of towers) {
      const equipClient = recordingClient();
      room.equipShopItem(equipClient, { itemId, towerId: tower.id });
      if (equipClient.sent.some((entry) => entry.type === "inventory:equipped")) accepted += 1;
    }
    assert.equal(accepted, count, `${itemId}: toast ${count} dedi, sunucu ${accepted} kuleye takti`);
    if (count > 0 && count < towers.length) mixed += 1;
  }
  assert.ok(mixed >= 2, "ornek esyalar hem takilan hem takilamayan kule icermeli");
});

test("magaza: global esya 'alindi' der, bariyerin talimati onayin icinde kalir", () => {
  const { room, player } = roomWithTowers("onur");
  const client = recordingClient();
  buy(room, player, client, "nexus-kalkani");
  const shield = client.sent.find((entry) => entry.type === "shop:purchased");
  assert.equal(shield.payload.toInventory, undefined);
  const shieldCue = getShopPurchaseCue(shield.payload);
  assert.equal(shieldCue.text, "Nexus Kalkanı alındı");
  assert.equal(shieldCue.durationMs, CONFIRMATION_NOTICE_MS);

  const barrierClient = recordingClient();
  buy(room, player, barrierClient, "bariyer");
  // Sira onemli: talimat once geliyor, onay onu tek toast yerinde ezmemeli.
  assert.deepEqual(barrierClient.sent.map((entry) => entry.type), ["shop:placement-required", "shop:purchased"]);
  const barrierCue = getShopPurchaseCue(barrierClient.sent[1].payload, { placementPending: true });
  assert.equal(barrierCue.text, "Bariyer alındı · yerleştirmek için bir yol karesi seç");
  assert.equal(barrierCue.durationMs, CONFIRMATION_INSTRUCTION_MS);
});

test("takma: esya ve kule adi, guclu atim o kuleye; reddedilen esya envanterde kalir", () => {
  const { room, player, towers } = roomWithTowers("onur");
  const target = towers.find((tower) => tower.definition.id === "onur-3");
  player.inventoryItemIds.push("kritik-sistem", "zirh-plakasi");

  const client = recordingClient();
  room.equipShopItem(client, { itemId: "kritik-sistem", towerId: target.id });
  const equipped = client.sent.find((entry) => entry.type === "inventory:equipped");
  assert.deepEqual(equipped.payload, { itemId: "kritik-sistem", towerId: target.id });
  const cue = getInventoryEquipCue(equipped.payload, target.definition.name);
  assert.equal(cue.text, `Kritik Sistem takıldı · ${target.definition.name}`);
  assert.equal(cue.sfx, "equip");
  assert.deepEqual(cue.pulse, { towerId: target.id, style: "equip" });

  const rejectClient = recordingClient();
  room.equipShopItem(rejectClient, { itemId: "zirh-plakasi", towerId: target.id });
  const rejected = rejectClient.sent.find((entry) => entry.type === "inventory:equip-rejected");
  assert.equal(rejected.payload.reason, "incompatibleTower");
  assert.ok(player.inventoryItemIds.includes("zirh-plakasi"), "toast 'envanterde kaldi' diyor; gercekten kalmali");
  const rejectCue = getInventoryEquipRejectedCue(rejected.payload);
  assert.equal(rejectCue.text, "Zırh Plakası bu kuleye takılamaz · envanterde kaldı");
  assert.equal(rejectCue.sfx, undefined, "ret bir odul degil, ses yok");
  assert.equal(rejectCue.pulse, undefined);
  // Yaratici modda envanter yok: esya listeden dogrudan takiliyor.
  assert.equal(
    getInventoryEquipRejectedCue({ itemId: "zirh-plakasi", reason: "incompatibleTower" }, { creative: true }).text,
    "Zırh Plakası bu kuleye takılamaz",
    "yaratici modda 'envanterde kaldi' denmez"
  );
  assert.equal(
    getInventoryEquipRejectedCue({ itemId: "zirh-plakasi" }, { creative: true }).text,
    "Zırh Plakası takılamadı"
  );

  target.equippedShopItemIds.push(...Array(MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER).fill("hassas-tetik"));
  player.inventoryItemIds.push("kritik-sistem");
  const fullClient = recordingClient();
  room.equipShopItem(fullClient, { itemId: "kritik-sistem", towerId: target.id });
  const full = fullClient.sent.find((entry) => entry.type === "inventory:equip-rejected");
  assert.equal(full.payload.reason, "towerFull");
  assert.equal(getInventoryEquipRejectedCue(full.payload).text, `Bu kulede boş yuva yok · en fazla ${MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER} eşya`);
});

test("onarim: toast'taki bedel gercekten odenen altin, atim onarilan kuleye", () => {
  const { room, player, towers } = roomWithTowers("onur");
  const wall = towers.find((tower) => tower.definition.id === "wall-1");
  wall.hp = wall.maxHp * 0.25;
  const goldBefore = player.gold;
  const client = recordingClient();
  room.repairStructure(client, { towerId: wall.id });

  const repaired = client.sent.find((entry) => entry.type === "structure:repaired");
  assert.ok(repaired, "onarim onayi gelmedi");
  assert.equal(wall.hp, wall.maxHp);
  assert.equal(repaired.payload.towerId, wall.id);
  assert.equal(repaired.payload.cost, goldBefore - player.gold, "bedel odenen altin");
  const cue = getStructureRepairCue(repaired.payload, wall.definition.name);
  assert.equal(cue.text, `${wall.definition.name} onarıldı (${repaired.payload.cost}g)`);
  assert.equal(cue.sfx, "repair");
  assert.deepEqual(cue.pulse, { towerId: wall.id, style: "repair" });

  // Tam candaki yapi onarilmiyor; onay da gelmiyor, toast da acilmiyor.
  const again = recordingClient();
  room.repairStructure(again, { towerId: wall.id });
  assert.equal(again.sent.length, 0);
});

test("ulti gucu: toast'taki carpan sunucunun ulti hasarindaki carpan, perde kademeyle yukselir", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  const client = recordingClient();
  const cues = [];
  for (let index = 0; index < ULTIMATE_POWER_MAX_LEVEL; index += 1) {
    const goldBefore = player.gold;
    room.upgradeUltimatePower(client);
    const message = client.sent.at(-1);
    assert.equal(message.type, "ultimate:upgraded");
    assert.equal(message.payload.level, player.ultimatePower);
    assert.equal(message.payload.cost, goldBefore - player.gold);
    const cue = getUltimateUpgradeCue(message.payload);
    // Ulti hasari bu carpanla olceklenir (kart ve esya carpani yokken).
    assert.equal(room.getUltimatePowerMultiplierFor("p1"), getUltimatePowerMultiplier(player.ultimatePower));
    assert.equal(cue.text, `Ulti Gücü ×${room.getUltimatePowerMultiplierFor("p1")}! · kademe ${player.ultimatePower}/${ULTIMATE_POWER_MAX_LEVEL}`);
    assert.equal(cue.sfx, "upgrade");
    cues.push(cue);
  }
  assert.equal(cues[0].text, "Ulti Gücü ×2! · kademe 1/5");
  assert.deepEqual(cues.map((cue) => cue.step), [0, 1, 2, 3, 4], "her kademe bir basamak yukari");

  // Tavanda sunucu bir sey satmiyor, onay da yok.
  const sentBefore = client.sent.length;
  room.upgradeUltimatePower(client);
  assert.equal(client.sent.length, sentBefore);
});

test("isci agaci: hucre adi, rol ve harcanan XP; ust kademe daha yuksek perde", () => {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  const role = "repairer";
  const cells = WORKER_DEVELOPMENT_CELLS[role];
  const choices = cells.filter((cell) => cell.options).map((cell) => cell.options[0]);
  assert.equal(choices.length, WORKER_DEVELOPMENT_XP_COSTS.length);
  player.experience = WORKER_DEVELOPMENT_XP_COSTS.reduce((sum, cost) => sum + cost, 0);

  const client = recordingClient();
  const steps = [];
  for (const [tier, skill] of choices.entries()) {
    const experienceBefore = player.experience;
    room.unlockWorkerDevelopment(client, { role, skillId: skill.id });
    const message = client.sent.find((entry) => entry.type === "worker:development-unlocked" && entry.payload.skillId === skill.id);
    assert.ok(message, `${skill.id} onayi gelmedi`);
    assert.equal(message.payload.cost, experienceBefore - player.experience, "bedel harcanan XP");
    assert.equal(message.payload.cost, WORKER_DEVELOPMENT_XP_COSTS[tier]);
    const cue = getWorkerDevelopmentCue(message.payload);
    assert.equal(cue.text, `${WORKER_ROLE_LABELS[role]} · ${skill.name} açıldı (${message.payload.cost} XP)`);
    assert.equal(cue.sfx, "upgrade");
    assert.equal(cue.pulse, undefined, "isci bir kule degil");
    steps.push(cue.step);
  }
  // Perde uclu sira basina yukseliyor: yon, derinlestirme ve oyun degistirici ayni sirada.
  for (let index = 1; index < steps.length; index += 1) assert.ok(steps[index] >= steps[index - 1], `perde dusmemeli: ${steps.join(", ")}`);
  assert.ok(steps[0] < steps[3] && steps[3] < steps[6], `kademe perdesi yukselmeli: ${steps.join(", ")}`);
});

test("bilinmeyen ya da bozuk yuk toast acmaz", () => {
  assert.equal(getShopPurchaseCue({ itemId: "olmayan-esya" }), undefined);
  assert.equal(getShopPurchaseCue(undefined), undefined);
  assert.equal(getInventoryEquipCue({ towerId: "t1" }), undefined);
  assert.equal(getInventoryEquipRejectedCue({ reason: "towerFull" }), undefined);
  assert.equal(getStructureRepairCue({ cost: 20 }), undefined);
  assert.equal(getUltimateUpgradeCue({ level: 0 }), undefined);
  assert.equal(getUltimateUpgradeCue({}), undefined);
  assert.equal(getWorkerDevelopmentCue({ role: "hacker", skillId: "x" }), undefined);
  assert.equal(getWorkerDevelopmentCue({ role: "repairer", skillId: "olmayan-hucre" }), undefined);
  // Kule adi bilinmiyorsa (kule o an cizilmemis) metin yine dogru ve kisa.
  assert.equal(getInventoryEquipCue({ itemId: "kritik-sistem", towerId: "t1" }).text, "Kritik Sistem kuleye takıldı");
  assert.equal(getStructureRepairCue({ towerId: "t1", cost: 14 }).text, "Yapı onarıldı (14g)");
});

test("butun onay metinleri telefonda iki satirlik toast'a sigar", () => {
  const texts = [];
  const longestTowerName = Object.values(towerCatalog).flat().reduce((longest, tower) => tower.name.length > longest.length ? tower.name : longest, "");
  for (const item of shopCatalog) {
    if (isGlobalShopItem(item)) {
      texts.push(getShopPurchaseCue({ itemId: item.id }).text);
      texts.push(getShopPurchaseCue({ itemId: item.id }, { placementPending: true }).text);
    } else {
      texts.push(getShopPurchaseCue({ itemId: item.id, toInventory: true }, { equippableTowers: 0 }).text);
      texts.push(getShopPurchaseCue({ itemId: item.id, toInventory: true }, { equippableTowers: 12 }).text);
      texts.push(getInventoryEquipCue({ itemId: item.id, towerId: "t" }, longestTowerName).text);
      for (const reason of ["towerFull", "incompatibleTower", "notOwned"]) {
        texts.push(getInventoryEquipRejectedCue({ itemId: item.id, reason }).text);
      }
    }
  }
  texts.push(getStructureRepairCue({ towerId: "t", cost: 9999 }, longestTowerName).text);
  for (let level = 1; level <= ULTIMATE_POWER_MAX_LEVEL; level += 1) texts.push(getUltimateUpgradeCue({ level }).text);
  for (const role of HIRABLE_WORKER_ROLES) {
    for (const cell of WORKER_DEVELOPMENT_CELLS[role]) {
      for (const option of cell.options ?? []) {
        texts.push(getWorkerDevelopmentCue({ role, skillId: option.id, cost: 560 }).text);
      }
    }
  }
  for (const text of texts) {
    assert.ok(text.length <= NOTICE_MAX_CHARS, `toast iki satira sigmiyor (${text.length}): ${text}`);
  }
});
