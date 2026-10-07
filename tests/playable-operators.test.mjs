/**
 * Oynanabilir operatorler: su an yalnizca AttackLord (warrior) ve ZentaX
 * (zeynep). Digerleri menude gorunuyor ama kilitli; sunucu da eski
 * istemcinin kilitli istegini reddetmek yerine AttackLord'a ceviriyor.
 *
 * Bu dosya test duzenegini (match-room-harness) ust duzeyde yuklemiyor:
 * duzenek listeyi butun kadroya aciyor, burada varsayilan liste sinaniyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import {
  PLAYABLE_CHARACTER_IDS,
  FALLBACK_PLAYABLE_CHARACTER_ID,
  characters,
  isPlayableCharacterId,
  resolvePlayableCharacterId
} from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

let roomCounter = 0;

function fakeClient(sessionId) {
  const client = {
    sessionId,
    ref: { bufferedAmount: 0 },
    sent: [],
    send(type, payload) { client.sent.push({ type, payload }); }
  };
  return client;
}

async function realRoom(options = { roomName: "Test", mapScale: 1 }) {
  const room = new MatchRoom();
  room.roomId = `oynanabilir-${roomCounter += 1}`;
  room.setSimulationInterval = () => {};
  room.broadcast = () => {};
  await room.onCreate(options);
  return room;
}

function cleanup(room) {
  MatchRoom.rooms.delete(room.roomId);
  MatchRoom.publicRooms.delete(room.roomId);
}

function joinClient(room, sessionId, options = {}) {
  const client = fakeClient(sessionId);
  room.clients.push(client);
  room.onJoin(client, { playerName: sessionId, ...options });
  return client;
}

function handlerOf(room, type) {
  const handler = room.onMessageHandlers[type];
  assert.ok(handler, `${type} kayitli degil`);
  return (client, payload) => handler.callback(client, payload);
}

/** console.debug'u yakalar; kayitlari dondurur. */
function captureDebug() {
  const original = console.debug;
  const lines = [];
  console.debug = (...args) => lines.push(args.join(" "));
  return { lines, restore: () => { console.debug = original; } };
}

const LOCKED_IDS = characters.map((character) => character.id).filter((id) => !PLAYABLE_CHARACTER_IDS.includes(id));

// ------------------------------------------------------------------ paylasilan liste

test("paylasilan liste: yalnizca AttackLord ve ZentaX oynanabilir", () => {
  assert.deepEqual([...PLAYABLE_CHARACTER_IDS].sort(), ["warrior", "zeynep"]);
  assert.equal(FALLBACK_PLAYABLE_CHARACTER_ID, "warrior");
  assert.equal(LOCKED_IDS.length, 5);
  for (const id of PLAYABLE_CHARACTER_IDS) assert.ok(characters.some((character) => character.id === id), `${id} kadroda yok`);
  for (const id of LOCKED_IDS) assert.equal(isPlayableCharacterId(id), false, id);
  assert.equal(isPlayableCharacterId(undefined), false);
  assert.equal(isPlayableCharacterId("constructor"), false);
});

test("resolvePlayableCharacterId: oynanabilir kendisi, digerleri yedege", () => {
  assert.equal(resolvePlayableCharacterId("zeynep"), "zeynep");
  assert.equal(resolvePlayableCharacterId("warrior"), "warrior");
  assert.equal(resolvePlayableCharacterId("onur"), "warrior");
  assert.equal(resolvePlayableCharacterId(undefined), "warrior");
  assert.equal(resolvePlayableCharacterId("archer", "zeynep"), "zeynep");
  // Yedek listede yoksa listenin ilki.
  assert.equal(resolvePlayableCharacterId("onur", "warrior", ["zeynep"]), "zeynep");
  assert.equal(resolvePlayableCharacterId("onur", "warrior", ["onur"]), "onur");
});

// ------------------------------------------------------------------ sunucu

test("sunucunun varsayilan listesi paylasilan liste", () => {
  assert.deepEqual([...MatchRoom.playableCharacterIds], [...PLAYABLE_CHARACTER_IDS]);
});

test("oda kurma/katilma: kilitli operator AttackLord'a cevriliyor, giris bozulmuyor", async () => {
  const debug = captureDebug();
  const room = await realRoom();
  try {
    joinClient(room, "kurucu", { characterId: "onur" });
    assert.equal(room.state.players.get("kurucu").characterId, "warrior");
    assert.ok(debug.lines.some((line) => line.includes("\"onur\"") && line.includes("warrior")), "hata ayiklama kaydi yok");
    // Ikinci oyuncu kilitliyi istiyor, AttackLord dolu: bos oynanabilir operator ZentaX.
    joinClient(room, "ikinci", { characterId: "archer" });
    assert.equal(room.state.players.get("ikinci").characterId, "zeynep");
    // Ikisi de dolu: yine oynanabilir (AttackLord ikinci kez), kilitli operatore dusulmuyor.
    joinClient(room, "ucuncu", { characterId: "mage" });
    assert.equal(room.state.players.get("ucuncu").characterId, "warrior");
    joinClient(room, "dorduncu", {});
    for (const player of room.state.players.values()) {
      assert.ok(PLAYABLE_CHARACTER_IDS.includes(player.characterId), `${player.name}: ${player.characterId}`);
    }
  } finally {
    debug.restore();
    cleanup(room);
  }
});

test("oynanabilir operator istegi oldugu gibi kaliyor ve kayit dusmuyor", async () => {
  const debug = captureDebug();
  const room = await realRoom();
  try {
    joinClient(room, "a", { characterId: "zeynep" });
    joinClient(room, "b", { characterId: "warrior" });
    assert.equal(room.state.players.get("a").characterId, "zeynep");
    assert.equal(room.state.players.get("b").characterId, "warrior");
    assert.deepEqual(debug.lines, []);
  } finally {
    debug.restore();
    cleanup(room);
  }
});

test("bilinmeyen ya da bozuk kimlik de AttackLord'a cevriliyor", async () => {
  const debug = captureDebug();
  const room = await realRoom();
  try {
    joinClient(room, "a", { characterId: "constructor" });
    assert.equal(room.state.players.get("a").characterId, "warrior");
    joinClient(room, "b", { characterId: 42 });
    assert.equal(room.state.players.get("b").characterId, "zeynep", "AttackLord dolu, bos oynanabilir ZentaX");
  } finally {
    debug.restore();
    cleanup(room);
  }
});

test("lobide karakter degisimi: kilitli istek AttackLord'a cevriliyor", async () => {
  const debug = captureDebug();
  const room = await realRoom();
  try {
    const a = joinClient(room, "a", { characterId: "zeynep" });
    handlerOf(room, "lobby:setCharacter")(a, { characterId: "onur" });
    assert.equal(room.state.players.get("a").characterId, "warrior");
    handlerOf(room, "lobby:setCharacter")(a, { characterId: "zeynep" });
    assert.equal(room.state.players.get("a").characterId, "zeynep");

    // AttackLord baskasindaysa kilitli istek (AttackLord'a cevrilen) "alinmis" hatasi veriyor; secim degismiyor.
    const b = joinClient(room, "b", { characterId: "warrior" });
    handlerOf(room, "lobby:setCharacter")(a, { characterId: "healer" });
    assert.equal(room.state.players.get("a").characterId, "zeynep");
    assert.ok(a.sent.some((message) => message.type === "lobby:error"), "hata gitmedi");
    assert.equal(room.state.players.get("b").characterId, "warrior");
    for (const id of LOCKED_IDS) {
      handlerOf(room, "lobby:setCharacter")(b, { characterId: id });
      assert.ok(PLAYABLE_CHARACTER_IDS.includes(room.state.players.get("b").characterId), id);
    }
  } finally {
    debug.restore();
    cleanup(room);
  }
});

test("liste testler icin degistirilebilir; duzenek butun kadroyu aciyor", async () => {
  const original = MatchRoom.playableCharacterIds;
  const room = await realRoom();
  try {
    MatchRoom.playableCharacterIds = characters.map((character) => character.id);
    joinClient(room, "a", { characterId: "onur" });
    assert.equal(room.state.players.get("a").characterId, "onur");
  } finally {
    MatchRoom.playableCharacterIds = original;
    cleanup(room);
  }
  // Duzenegi yuklemek listeyi butun karakterlere aciyor (mevcut testler bunun ustunde).
  try {
    await import("./helpers/match-room-harness.mjs");
    assert.deepEqual([...MatchRoom.playableCharacterIds].sort(), characters.map((character) => character.id).sort());
  } finally {
    MatchRoom.playableCharacterIds = original;
  }
});

// ------------------------------------------------------------------ istemci kilidi

const lock = await importWebModule("apps/web/src/operator-lock.ts");
const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");

test("istemci: varsayilan operator oynanabilir, kilitli kayit varsayilana dusuyor", () => {
  const fallback = lock.getDefaultOperator();
  assert.ok(PLAYABLE_CHARACTER_IDS.includes(fallback.id));
  assert.equal(fallback.id, characters.find((character) => PLAYABLE_CHARACTER_IDS.includes(character.id)).id, "kadronun ilk oynanabilir operatoru");
  for (const id of LOCKED_IDS) assert.equal(lock.resolvePlayableOperator(id).id, fallback.id, id);
  assert.equal(lock.resolvePlayableOperator("warrior").id, "warrior");
  assert.equal(lock.resolvePlayableOperator("zeynep").id, "zeynep");
  assert.equal(lock.resolvePlayableOperator(undefined).id, fallback.id);
  assert.equal(lock.resolvePlayableOperator("yok-boyle").id, fallback.id);
});

test("istemci: kilitli dugme aria-disabled, aciklama ve ipucu tasiyor; oynanabilir tasimiyor", () => {
  for (const id of PLAYABLE_CHARACTER_IDS) {
    assert.equal(lock.isPlayableOperator(id), true);
    assert.equal(lock.lockedOperatorAttributes(id), "");
    assert.equal(lock.renderOperatorLock(id), "");
  }
  for (const id of LOCKED_IDS) {
    assert.equal(lock.isPlayableOperator(id), false);
    const attributes = lock.lockedOperatorAttributes(id);
    assert.match(attributes, /aria-disabled="true"/);
    assert.match(attributes, new RegExp(`aria-describedby="${lock.OPERATOR_LOCKED_DESC_ID}"`));
    assert.match(attributes, /title="Geliştirme aşamasında"/);
    assert.match(attributes, /data-operator-locked/);
    const mark = lock.renderOperatorLock(id);
    assert.match(mark, /class="operator-lock"/);
    assert.match(mark, /aria-hidden="true"/);
    assert.match(mark, /<svg/);
  }
  assert.equal(lock.renderOperatorLockDescription(), `<span id="${lock.OPERATOR_LOCKED_DESC_ID}" hidden>Geliştirme aşamasında</span>`);
  const onur = characters.find((character) => character.id === "onur");
  assert.equal(lock.getLockedOperatorNote("onur"), `${onur.displayName} geliştirme aşamasında`);
  assert.equal(lock.getLockedOperatorNote(undefined), "Geliştirme aşamasında");
});

test("istemci: kilit metinleri iki dilde", () => {
  assert.equal(i18n.tr["menu.operator.locked"], "Geliştirme aşamasında");
  assert.equal(i18n.en["menu.operator.locked"], "In development");
  assert.match(i18n.tr["menu.operator.lockedNote"], /\{name\} geliştirme aşamasında/);
  assert.match(i18n.en["menu.operator.lockedNote"], /\{name\} is in development/);
});

test("menu: kadro, arsiv ve lobi secicisi kilidi ciziyor; kilitli secim reddediliyor", () => {
  const menu = read("apps/web/src/menu-ui.ts");
  // Uc secici de ortak nitelikleri ve kilit isaretini kullaniyor.
  const has = (pattern, label) => assert.ok(pattern.test(menu), label);
  has(/<button class="token [^\n]*is-operator-locked[^\n]*data-character-id="\$\{character\.id\}"\$\{lockedOperatorAttributes\(character\.id\)\}/, "kadro jetonu");
  has(/<button class="archive-card [^\n]*is-operator-locked[^\n]*data-character-id="\$\{character\.id\}"\$\{lockedOperatorAttributes\(character\.id\)\}/, "arsiv karti");
  has(/class="loadout-chip [^\n]*is-operator-locked[^\n]*"\n\s+data-lobby-character="\$\{character\.id\}"\$\{lockedOperatorAttributes\(character\.id\)\}/, "lobi secicisi");
  assert.equal((menu.match(/\$\{renderOperatorLock\(character\.id\)\}/g) ?? []).length, 3, "kilit isareti uc secicide");
  assert.match(menu, /\$\{renderOperatorLockDescription\(\)\}/);
  // Tiklama/dokunus: kilitliyse not gosterilip donuluyor, secim degismiyor.
  assert.match(menu, /if \(!isPlayableOperator\(character\.id\)\) \{\n\s+showLockedOperatorNote\(character\.id\);\n\s+return;\n\s+\}\n\s+selectedCharacter = character;/);
  assert.match(menu, /if \(!characterId \|\| !isPlayableOperator\(characterId\)\) \{\n\s+showLockedOperatorNote\(characterId\);\n\s+return;\n\s+\}\n\s+currentLobbyRoom\?\.send\("lobby:setCharacter"/);
  // Not bir canli bolge: ekran okuyucu da duyuyor.
  assert.match(menu, /operatorToast\.setAttribute\("role", "status"\)/);
  assert.match(menu, /operatorToast\.setAttribute\("aria-live", "polite"\)/);
});

test("menu: her mac baslatma yolu oynanabilir operatorle", () => {
  const menu = read("apps/web/src/menu-ui.ts");
  assert.match(menu, /let selectedCharacter = getDefaultOperator\(\);/);
  // Kosu raporunun Tekrar/Sonraki notu.
  assert.match(menu, /const character = resolvePlayableOperator\(quickStart\.characterId\);/);
  // Solo, Egitim, yaratici, harita: hepsi startGame'den; oda kurma ve katilma da ayni kapidan.
  const start = menu.slice(menu.indexOf("const startGame = "), menu.indexOf("const bindLobbyRoom"));
  assert.ok(/ensurePlayableSelection\(\);/.test(start), "startGame secimi denetlemiyor");
  assert.ok(/characterId: resolvePlayableOperator\(resume\.characterId\)\.id/.test(start), "geri donulen mac");
  assert.equal((menu.match(/characterId: ensurePlayableSelection\(\)/g) ?? []).length, 2, "oda kurma ve katilma");
  // Secimin dogrudan gittigi tek yer startGame, denetimden sonra.
  assert.equal((menu.match(/characterId: selectedCharacter\.id/g) ?? []).length, 1);
  assert.ok(start.indexOf("ensurePlayableSelection();") < start.indexOf("characterId: selectedCharacter.id"), "denetim baslatmadan sonra");
  // Kilitli operatorle kaydedilmis mac geri acilmiyor.
  assert.match(menu, /if \(storedMatch && !isPlayableCharacterId\(storedMatch\.characterId\)\) clearMatchReconnect\(storedMatch\.roomId\);/);
  // Sahne de kendi basina oynanabilire dusuyor.
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /this\.selectedCharacterId = resolvePlayableCharacterId\(data\.characterId, "zeynep"\);/);
});

test("stil: kilit sert ve sade; parilti, animasyon yok", () => {
  const css = read("apps/web/src/style.css");
  const start = css.indexOf("/* --- kilitli operator");
  assert.ok(start >= 0, "kilit bolumu yok");
  const section = css.slice(start, css.indexOf("/* --- commands", start));
  assert.match(section, /\.token\.is-operator-locked \.sigil \{[^}]*grayscale\(1\)/);
  assert.match(section, /\.operator-lock \{/);
  assert.match(section, /\.menu-toast\.is-visible \{/);
  assert.match(section, /cursor: not-allowed/);
  assert.doesNotMatch(section, /animation|@keyframes|text-shadow|drop-shadow|sparkle|glow/i);
});

test("menu: AttackLord ikonu ZentaX gibi muhur cercevesinde, detay ekrani da ayni muhurde", () => {
  const menu = read("apps/web/src/menu-ui.ts");
  assert.match(menu, /warrior: \{\n\s+src: assetUrl\("images\/attacklord-icon-256\.webp"\),\n\s+srcset: `\$\{assetUrl\("images\/attacklord-icon-128\.webp"\)\} 128w, \$\{assetUrl\("images\/attacklord-icon-256\.webp"\)\} 256w`/);
  assert.match(menu, /zeynep: \{ src: assetUrl\("images\/zeynep-puppet-hands\.png"\) \}/);
  assert.match(menu, /<section class="dossier-hero frame">\n\s+\$\{renderSigil\(character\.id, initials\(character\.displayName\)\)\}/);
});

test("co-op oda kapasitesi oynanabilir operator sayisi kadar: su an 2 kisi", async () => {
  const room = await realRoom();
  try {
    assert.equal(room.maxClients, PLAYABLE_CHARACTER_IDS.length);
    assert.equal(room.maxClients, 2);
  } finally {
    cleanup(room);
  }
});
