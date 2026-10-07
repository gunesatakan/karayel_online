/**
 * AttackLord'un ucuncu becerisi: Execute (Sessiz Mod'un yerine).
 *
 * Oyuncu beceriye basip bir dusmana dokunuyor; sunucu o dusmani normal
 * oldurme yolundan infaz ediyor. Ezici (brute) ve sampiyon bagisik; olu,
 * hukmedilmis, olumsuz ya da cevrilmis hedef gecersiz. Iki red durumunda da
 * bekleme suresi harcanmiyor ve atana `skill:rejected` gidiyor. Tasan hasar
 * primi yok (yapay oldurme).
 *
 * Sessiz Mod tamamen gitti: `silent:*` mesaji, susturma ve 3x hizlanma yok.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATAKAN_EXECUTE_SLOT,
  ATAKAN_EXECUTE_SOURCE_ID,
  FEEDBACK_KIND_RULES,
  characters,
  getExecuteRejectText,
  isExecuteImmune,
  isExecuteTeamSide,
  pickExecuteTapTarget
} from "../packages/shared/dist/index.js";
import { MESSAGE_RULES, sanitizeMessagePayload } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const executeSkill = characters.find((character) => character.id === "warrior").skills[ATAKAN_EXECUTE_SLOT];

function makeClient(sessionId) {
  const client = { sessionId, sent: [], send(type, payload) { client.sent.push({ type, payload }); } };
  return client;
}

/** p1 AttackLord; `coop` ile p2 Zeynep. Yayinlar ve istemci mesajlari kaydediliyor. */
function executeRoom({ coop = false } = {}) {
  const room = createRoom("warrior");
  const p1 = room.state.players.get("p1");
  Object.assign(p1, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });
  const clients = [makeClient("p1")];
  if (coop) {
    room.state.players.set("p2", {
      ...p1, id: "p2", name: "Zeynep", characterId: "zeynep", slot: 1, gold: 0, experience: 0,
      skillCooldowns: [], runModifiers: [], ownedCardIds: [], ownedShopItemIds: [], inventoryItemIds: [], hiredWorkers: []
    });
    clients.push(makeClient("p2"));
  }
  const broadcasts = [];
  room.clients = clients;
  room.broadcast = (type, payload) => broadcasts.push({ type, payload });
  return { room, clients, broadcasts, player: p1 };
}

/** Yolun uzerinde, verilen ozelliklerde bir dusman. */
function spawn(room, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  Object.assign(enemy, {
    type: "grunt", movementKind: "ground", hp: 400, maxHp: 400, shield: 0, maxShield: 0, armor: 30, reward: 20,
    damageResistances: {}, hitTypeResistances: {}, statusResistances: {}, ...overrides
  });
  return enemy;
}

const cast = (room, client, enemyId) => room.useSkill(client, { slot: ATAKAN_EXECUTE_SLOT, enemyId });
const rejections = (client) => client.sent.filter((entry) => entry.type === "skill:rejected").map((entry) => entry.payload);

/** Ayni dusmani duz bir oldurmeyle (kulesiz kaynak) oldurunce gelen altin ve XP: "normal" odul. */
function baselineReward(overrides) {
  const { room, player } = executeRoom();
  const enemy = spawn(room, overrides);
  const gold = player.gold;
  const experience = player.experience;
  assert.equal(room.damageEnemy(enemy, enemy.hp + enemy.shield * 2 + enemy.maxHp, 0, "", "p1", "true"), true);
  return { gold: player.gold - gold, experience: player.experience - experience };
}

test("Execute yuva 3'te Sessiz Mod'un yerinde: ad, Turkce aciklama, 32 sn", () => {
  const names = characters.find((character) => character.id === "warrior").skills.map((skill) => skill.name);
  assert.deepEqual(names, ["Yönlendirme", "Refactor", "Execute"]);
  assert.equal(ATAKAN_EXECUTE_SLOT, 2);
  assert.equal(executeSkill.cooldownMs, 32000);
  assert.equal(executeSkill.description, "Seçtiğin tek bir düşmanı anında infaz eder. Ezicilere ve şampiyonlara etkisizdir; etkisiz ya da geçersiz hedefte bekleme süresi harcanmaz.");
  assert.equal(getExecuteRejectText("immune"), "Etkisiz");
  assert.equal(ATAKAN_EXECUTE_SOURCE_ID, "warrior-skill-execute");
});

test("bagisiklik: yalnizca ezici (brute) ve sampiyon; tur ne olursa olsun sampiyon", () => {
  assert.equal(isExecuteImmune({ type: "brute" }), true);
  for (const type of ["grunt", "runner", "shooter", "siege"]) {
    assert.equal(isExecuteImmune({ type }), false, type);
    assert.equal(isExecuteImmune({ type, champion: { replaced: 3 } }), true, `${type} sampiyon`);
  }
});

for (const [label, overrides] of [
  ["piyade (grunt)", { type: "grunt" }],
  ["kosucu (runner)", { type: "runner" }],
  ["nisanci (shooter)", { type: "shooter" }],
  ["kusatma (siege)", { type: "siege" }],
  ["ucan piyade", { type: "grunt", movementKind: "air" }],
  ["kalkanli zirhli nisanci", { type: "shooter", shield: 300, maxShield: 300, armor: 90 }],
  // Kalkan can + azami candan buyuk: kalkan yariya hasar aliyor, infaz yine oldurmeli.
  ["kalkani candan buyuk piyade", { type: "grunt", hp: 100, maxHp: 100, shield: 900, maxShield: 900 }]
]) {
  test(`Execute ${label} dusmani normal altin ve XP ile infaz ediyor`, () => {
    const expected = baselineReward(overrides);
    const { room, clients, broadcasts, player } = executeRoom();
    const enemy = spawn(room, overrides);
    const gold = player.gold;
    const experience = player.experience;
    const kills = room.kills;
    cast(room, clients[0], enemy.id);
    assert.equal(room.enemies.has(enemy.id), false, "dusman olmedi");
    assert.equal(room.kills, kills + 1);
    assert.ok(expected.gold > 0 && expected.experience > 0);
    assert.ok(Math.abs(player.gold - gold - expected.gold) < 1e-9, `altin ${player.gold - gold} != ${expected.gold}`);
    assert.ok(Math.abs(player.experience - experience - expected.experience) < 1e-9, "XP normal oldurmeyle ayni degil");
    assert.equal(player.skill3CooldownMs, executeSkill.cooldownMs, "bekleme suresi uygulanmadi");
    assert.deepEqual(rejections(clients[0]), []);
    const executed = broadcasts.filter((entry) => entry.type === "skill:execute");
    assert.equal(executed.length, 1);
    assert.equal(executed[0].payload.casterId, "p1");
    assert.equal(executed[0].payload.enemyId, enemy.id);
    assert.ok(Number.isFinite(executed[0].payload.x) && Number.isFinite(executed[0].payload.y));
    // Oldurme olayi atana yaziliyor (seri, asist, "+N" bu yoldan).
    const events = [...room.killEvents.values()].filter((event) => event.enemyId === enemy.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].ownerId, "p1");
  });
}

test("Execute ezici (brute) dusmanda etkisiz: dusman yasiyor, bekleme harcanmiyor", () => {
  const { room, clients, broadcasts, player } = executeRoom();
  const brute = spawn(room, { type: "brute" });
  const hp = brute.hp;
  cast(room, clients[0], brute.id);
  assert.equal(room.enemies.has(brute.id), true);
  assert.equal(brute.hp, hp, "eziciye hasar gitti");
  assert.equal(player.skill3CooldownMs, 0, "bekleme harcandi");
  assert.deepEqual(rejections(clients[0]), [{ slot: ATAKAN_EXECUTE_SLOT, reason: "immune" }]);
  assert.equal(broadcasts.filter((entry) => entry.type === "skill:execute").length, 0);
  // Ucan ezici da bagisik.
  const airBrute = spawn(room, { type: "brute", movementKind: "air" });
  cast(room, clients[0], airBrute.id);
  assert.equal(room.enemies.has(airBrute.id), true);
  assert.equal(player.skill3CooldownMs, 0);
});

test("Execute sampiyonda etkisiz (turu piyade olsa da); bekleme harcanmiyor", () => {
  const { room, clients, player } = executeRoom();
  room.wave = 8;
  room.planWaveSpawns(8);
  const plan = room.waveChampionPlan;
  assert.ok(plan, "8. dalgada sampiyon plani yok");
  room.spawnEnemy(plan);
  const champion = [...room.enemies.values()].at(-1);
  assert.ok(champion.champion);
  assert.notEqual(champion.type, "brute", "test turu ezici olmayan sampiyonu sinamali");
  const hp = champion.hp;
  cast(room, clients[0], champion.id);
  assert.equal(room.enemies.has(champion.id), true);
  assert.equal(champion.hp, hp);
  assert.equal(player.skill3CooldownMs, 0);
  assert.deepEqual(rejections(clients[0]), [{ slot: ATAKAN_EXECUTE_SLOT, reason: "immune" }]);
});

test("Execute olu, kayip, hukmedilmis, olumsuz ya da cevrilmis hedefi reddediyor; bekleme harcanmiyor", () => {
  const { room, clients, player } = executeRoom();
  const now = Date.now();
  const cases = [
    ["kimliksiz", undefined],
    ["olmayan kimlik", "yok-boyle-dusman"],
    ["cani bitmis", spawn(room, { hp: 0 }).id],
    ["hukmedilmis", spawn(room, { dominatedUntil: now + 60_000, dominatedOwnerId: "p2" }).id],
    ["olumsuz", spawn(room, { melisUndeadUntil: now + 60_000 }).id],
    ["cevrilmis", spawn(room, { melisWhisperTurnedUntil: now + 60_000 }).id]
  ];
  const killsBefore = room.kills;
  for (const [label, enemyId] of cases) {
    clients[0].sent = [];
    cast(room, clients[0], enemyId);
    assert.equal(player.skill3CooldownMs, 0, `${label}: bekleme harcandi`);
    assert.deepEqual(rejections(clients[0]), [{ slot: ATAKAN_EXECUTE_SLOT, reason: "invalid" }], label);
  }
  assert.equal(room.kills, killsBefore, "gecersiz hedef oldu");
  // Olen dusman da: once infaz, sonra ayni kimlik.
  const enemy = spawn(room);
  cast(room, clients[0], enemy.id);
  assert.equal(player.skill3CooldownMs, executeSkill.cooldownMs);
  player.skill3CooldownMs = 0;
  clients[0].sent = [];
  cast(room, clients[0], enemy.id);
  assert.equal(player.skill3CooldownMs, 0);
  assert.deepEqual(rejections(clients[0]), [{ slot: ATAKAN_EXECUTE_SLOT, reason: "invalid" }]);
});

test("bekleme suresi dolmadan ikinci infaz yok", () => {
  const { room, clients, player } = executeRoom();
  const first = spawn(room);
  const second = spawn(room);
  cast(room, clients[0], first.id);
  assert.equal(player.skill3CooldownMs, executeSkill.cooldownMs);
  cast(room, clients[0], second.id);
  assert.equal(room.enemies.has(second.id), true, "bekleme suresinde infaz edildi");
  // Bekleme oyun suresiyle akiyor; dolunca yeniden.
  room.updateSkillCooldowns(executeSkill.cooldownMs);
  assert.equal(player.skill3CooldownMs, 0);
  cast(room, clients[0], second.id);
  assert.equal(room.enemies.has(second.id), false);
});

test("Execute tasan hasar primi odemiyor (yapay oldurme)", () => {
  const { room, clients, player } = executeRoom();
  // Artik Enerji Toplayici'li kule: kaynagi o kule olsa bile infaz prim vermiyor.
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower(clients[0], { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const tower = [...room.towers.values()].at(-1);
  player.ownedShopItemIds.push("artik-enerji-toplayici");
  player.inventoryItemIds.push("artik-enerji-toplayici");
  room.equipShopItem(clients[0], { itemId: "artik-enerji-toplayici", towerId: tower.id });
  assert.ok(tower.equippedShopItemIds.includes("artik-enerji-toplayici"));
  room.towerCriticalRandom = () => 1;
  const kill = (sourceId) => {
    const enemy = spawn(room, { hp: 100, maxHp: 100 });
    const gold = player.gold;
    room.damageEnemy(enemy, 100 + 100 + 1, 0, sourceId, "p1", "true", 0, tower.level, tower.id);
    return player.gold - gold;
  };
  const withOverkill = kill(tower.definition.id);
  const executed = kill(ATAKAN_EXECUTE_SOURCE_ID);
  assert.ok(withOverkill > executed, "kule vurusunda tasan hasar primi yok; test bir sey sinamiyor");
  const exact = (() => {
    const enemy = spawn(room, { hp: 100, maxHp: 100 });
    const gold = player.gold;
    room.damageEnemy(enemy, 100, 0, tower.definition.id, "p1", "true", 0, tower.level, tower.id);
    return player.gold - gold;
  })();
  assert.ok(Math.abs(executed - exact) < 1e-9, "infaz tasan hasar primi verdi");

  // Becerinin kendisi: dev yapay hasara ragmen odul duz oldurmeyle ayni.
  const expected = baselineReward({ hp: 100, maxHp: 100 });
  const enemy = spawn(room, { hp: 100, maxHp: 100 });
  const gold = player.gold;
  cast(room, clients[0], enemy.id);
  assert.ok(Math.abs(player.gold - gold - expected.gold) < 1e-9);
});

test("co-op: infaz yalnizca atanin becerisi; oldurme atana yaziliyor, altin herkese", () => {
  const { room, clients, player } = executeRoom({ coop: true });
  const teammate = room.state.players.get("p2");
  const enemy = spawn(room);
  const teammateGold = teammate.gold;
  cast(room, clients[0], enemy.id);
  assert.equal(room.enemies.has(enemy.id), false);
  assert.equal(player.skill3CooldownMs, executeSkill.cooldownMs);
  assert.ok(!(teammate.skill3CooldownMs > 0), "takim arkadasinin bekleme suresi degisti");
  assert.ok(teammate.gold > teammateGold, "dusman altini paylasilmadi");
  const event = [...room.killEvents.values()].find((entry) => entry.enemyId === enemy.id);
  assert.equal(event.ownerId, "p1");
  assert.deepEqual(rejections(clients[1]), [], "takim arkadasina red gitti");

  // Takim arkadasinin (Zeynep) ucuncu becerisi bir infaz degil: kimlik verse de dusman olmuyor.
  const other = spawn(room);
  teammate.reputation = 1000;
  room.useSkill(clients[1], { slot: ATAKAN_EXECUTE_SLOT, enemyId: other.id });
  assert.equal(room.enemies.has(other.id), true);
});

test("mesaj kurali: useSkill enemyId tasiyor, kovasi var; red ve infaz istemcide dinleniyor", () => {
  const rule = MESSAGE_RULES.useSkill;
  assert.equal(rule.fields.enemyId, "string");
  assert.equal(rule.fields.slot, "number");
  assert.ok(rule.rate && rule.rate.burst > 0 && rule.rate.perSecond > 0, "useSkill kovasiz");
  assert.deepEqual(sanitizeMessagePayload({ slot: 2, enemyId: "e7", extra: 1 }, rule.fields), { slot: 2, enemyId: "e7" });
  assert.deepEqual(sanitizeMessagePayload({ slot: 2, enemyId: 7 }, rule.fields), { slot: 2 });

  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.ok(scene.includes(`onMessage("skill:execute"`));
  assert.ok(scene.includes(`onMessage("skill:rejected"`));
  assert.ok(/send\("useSkill", \{ slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy\.id \}\)/.test(scene), "istemci infaz istegini kimlikle yollamiyor");
  assert.ok(scene.includes(`"Bir düşmana dokun"`));
  assert.ok(scene.includes(`emit("execute"`), "infaz geri bildirimi yonetmenden gecmiyor");
  // Infaz sesi ve isareti: sert, kisa; takim arkadasinda sessiz.
  assert.equal(FEEDBACK_KIND_RULES.execute.teammateSound, false);
  assert.ok(FEEDBACK_KIND_RULES.execute.soundMs > 0 && FEEDBACK_KIND_RULES.execute.soundMs <= 400);
});

test("Sessiz Mod tamamen gitti: silent:* mesaji, susturma ve hizlanma yok", () => {
  assert.deepEqual(Object.keys(MESSAGE_RULES).filter((type) => type.startsWith("silent:")), []);
  const server = readSource("apps/server/src/rooms/MatchRoom.ts");
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  const hud = readSource("apps/web/src/game-control-ui.ts");
  const css = readSource("apps/web/src/style.css");
  const shared = readSource("packages/shared/src/feedback/team-signals.ts");
  for (const [name, source] of [["sunucu", server], ["sahne", scene], ["HUD", hud], ["paylasilan", shared]]) {
    assert.ok(!/silent:(mode|sync)/.test(source), `${name} hala silent:* mesaji tasiyor`);
    assert.ok(!/silentMode|SilentMode|SILENT_MODE|damageHasteUntil|isTowerSilenced/.test(source), `${name} hala Sessiz Mod kodu tasiyor`);
  }
  assert.ok(!css.includes("game-hud__silent"), "Sessiz Mod cipinin CSS'i duruyor");
  assert.ok(!hud.includes("data-hud-silent"), "Sessiz Mod cipi duruyor");
  assert.ok(!("silentMode" in FEEDBACK_KIND_RULES));

  // Davranis: becerinin (red de olsa) atilmasi kuleleri susturmuyor, hizlandirmiyor.
  const { room, clients } = executeRoom();
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower(clients[0], { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const tower = [...room.towers.values()].at(-1);
  const interval = room.getTowerRawFireInterval(tower);
  const enemy = spawn(room);
  cast(room, clients[0], enemy.id);
  assert.equal(room.enemies.has(enemy.id), false);
  // Ikinci atis bekleme suresine takilmasin: red yolu da sinanmali.
  room.state.players.get("p1").skill3CooldownMs = 0;
  clients[0].sent = [];
  cast(room, clients[0], undefined);
  assert.deepEqual(rejections(clients[0]), [{ slot: ATAKAN_EXECUTE_SLOT, reason: "invalid" }]);
  assert.equal(room.getTowerRawFireInterval(tower), interval, "beceri atis araligini degistirdi");
  assert.equal(room.silentModeUntil, undefined);
  assert.equal(room.damageHasteUntil, undefined);
});

test("dokunus takimin tarafindaki dusmani (hukmedilmis, olumsuz, cevrilmis) atliyor, arkasindaki dusmani seciyor", () => {
  assert.equal(isExecuteTeamSide({}), false);
  assert.equal(isExecuteTeamSide({ isDominated: true }), true);
  assert.equal(isExecuteTeamSide({ isUndead: true }), true);
  assert.equal(isExecuteTeamSide({ isWhisperTurned: true }), true);

  const enemy = (id, x, overrides = {}) => ({ id, x, y: 0, size: 20, type: "grunt", champion: false, teamSide: false, ...overrides });
  // Olumsuz dusman tam dokunulan yerde, asil hedefle temas halinde.
  const blocker = enemy("olumsuz", 0, { teamSide: true });
  const target = enemy("hedef", 8);
  assert.equal(pickExecuteTapTarget([blocker, target], 0, 0, 10)?.id, "hedef");
  assert.equal(pickExecuteTapTarget([enemy("hukmedilen", 0, { teamSide: true, type: "brute" })], 0, 0, 10), undefined, "yalnizca takim tarafi: bos zemin");
  // En yakin dusman; ezici de seciliyor ("Etkisiz" gosterilsin diye).
  assert.equal(pickExecuteTapTarget([enemy("uzak", 12), enemy("ezici", 3, { type: "brute" })], 0, 0, 10)?.id, "ezici");
  // Yaricap: max(minRadius, boy * 0.75).
  assert.equal(pickExecuteTapTarget([enemy("disarida", 16)], 0, 0, 10), undefined);
  assert.equal(pickExecuteTapTarget([enemy("buyuk", 16, { size: 24 })], 0, 0, 10)?.id, "buyuk");

  // Sahne takim tarafini her karede snapshot bayraklarindan yaziyor ve secimi paylasilan kurala birakiyor.
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.ok(scene.includes("mover.teamSide = isExecuteTeamSide(enemy);"));
  assert.ok(scene.includes("teamSide: Boolean(mover.teamSide)"));
  assert.ok(scene.includes("return pickExecuteTapTarget(candidates, x, y,"));
});

test("hedefleme kipi baska bir kip acilinca ve dalga bitince kapaniyor", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  const body = (signature) => {
    const start = scene.indexOf(signature);
    assert.ok(start >= 0, `${signature} yok`);
    return scene.slice(start, scene.indexOf("\n  }\n", start));
  };
  assert.match(body("private cancelExecuteTargeting()"), /this\.pendingAction = undefined;\s*this\.emitControlState\(\);/);
  assert.ok(body("private handleUltimateButton()").includes("this.cancelExecuteTargeting();"), "ulti");
  assert.ok(body("private startTowerDragAt(").includes("this.cancelExecuteTargeting();"), "kule surukleme");
  assert.ok(body("private watchWaveClear(").includes("this.cancelExecuteTargeting();"), "dalga sonu");
  assert.match(scene, /this\.pendingShopPlacement = message\.itemId;\s*this\.cancelExecuteTargeting\(\);/, "magaza yerlestirmesi");
});

test("isaretli hedefte infaz: oldurme normal, 'isaret' etki payi sisirilmiyor (Oluler Bagi'nin infazi da)", () => {
  const { room, clients, player } = executeRoom();
  const spot = findBuildableSpot(room, "warrior-1");
  room.placeTower(clients[0], { x: spot.x, y: spot.y, definitionId: "warrior-1" });
  const tracker = [...room.towers.values()].at(-1);
  const now = Date.now();
  const marked = (overrides = {}) => spawn(room, {
    activeMarkId: "tracking", activeMarkAdd: 0.5, activeMarkUntil: now + 60_000, trackingSourceTowerId: tracker.id, ...overrides
  });
  const expected = baselineReward({});

  // Takip isareti.
  const tracked = marked();
  let gold = player.gold;
  cast(room, clients[0], tracked.id);
  assert.equal(room.enemies.has(tracked.id), false);
  assert.ok(Math.abs(player.gold - gold - expected.gold) < 1e-9, "isaret odulu degistirdi");
  assert.equal(room.effectStats.get("mark") ?? 0, 0, "infaz isaret payina yazildi");

  // Yonlendirme alani (gudum isareti) icinde.
  player.skill3CooldownMs = 0;
  const guided = spawn(room);
  room.projectileGuidanceUntil = now + 60_000;
  room.projectileGuidanceX = guided.x;
  room.projectileGuidanceY = guided.y;
  gold = player.gold;
  cast(room, clients[0], guided.id);
  assert.equal(room.enemies.has(guided.id), false);
  assert.ok(Math.abs(player.gold - gold - expected.gold) < 1e-9);
  assert.equal(room.effectStats.get("mark") ?? 0, 0, "gudum isareti infazi isaret payina yazdi");

  // Oluler Bagi'nin infazi ayni kuraldan.
  const underworld = marked();
  room.damageEnemy(underworld, underworld.hp + underworld.shield + underworld.maxHp + 1, 0, "archer-4-underworld-execute", "p1", "true");
  assert.equal(room.enemies.has(underworld.id), false);
  assert.equal(room.effectStats.get("mark") ?? 0, 0);

  // Karsilastirma: gercek bir vurus isaret payini yaziyor (test bir sey sinasin).
  const real = marked({ hp: 1_000_000, maxHp: 1_000_000 });
  room.towerCriticalRandom = () => 1;
  // Kulesiz kaynak: Takipci'nin kendi vurusu kendi isaretinden pay almiyor.
  room.damageEnemy(real, 100, 0, "", "p1", "true");
  assert.ok((room.effectStats.get("mark") ?? 0) > 0, "isaretli gercek vurus isaret payi yazmadi");
});

test("infaz sesi kayitli ornek (Kenney), kisa ve seviyesi esik; sentez yalnizca yedek", async () => {
  const manifest = JSON.parse(readSource("apps/web/public/audio/sfx/manifest.json"));
  const entries = manifest.files.filter((entry) => entry.family === "execute");
  assert.ok(entries.length >= 2, "en az iki cesit");
  const { MAX_CUE_SECONDS } = await import("../tools/build-sfx.mjs");
  assert.ok(MAX_CUE_SECONDS <= 0.4);
  for (const entry of entries) {
    assert.equal(entry.cue, true);
    assert.ok(entry.durationMs <= 400, `${entry.file} ${entry.durationMs} ms`);
    assert.match(entry.source, /^impact\//, "Kenney Impact Sounds");
    assert.ok(entry.layers.every((layer) => /^impact\/impactMetal_light_/.test(layer)), "kilit tiki hafif metalden");
    assert.ok(entry.rmsDb <= -17 && entry.rmsDb >= -19.5, `${entry.file} yukseklik esitlenmemis (${entry.rmsDb})`);
  }
  const samples = readSource("apps/web/src/sfx-samples.ts");
  assert.match(samples, /execute: family\("execute", 2, /);
  const director = readSource("apps/web/src/feedback-director.ts");
  assert.match(director, /SFX_SAMPLE_FAMILY[^=]*= \{[^}]*execute: "execute"/, "yonetmen infazi ornekten calmiyor");
  assert.match(director, /\n  execute: \(\) => \[/, "ornek yokken sentez yedegi yok");
  assert.match(readSource("apps/web/public/audio/sfx/LICENSE.txt"), /Execute/);
});
