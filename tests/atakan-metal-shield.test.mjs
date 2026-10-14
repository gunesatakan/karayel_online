/**
 * AttackLord'un ikinci becerisi: Metal Kalkan (Refactor'un yerine).
 *
 * Yeni kullanim dili: sekmeden silahlandirma yok, oyuncu haritada basili
 * tutup surukluyor. Burasi uc seyi kilitliyor:
 *
 * - Jest (saf durum makinesi): esigin altinda hicbir sey, ustunde onizleme,
 *   azami boyda kirpma, geri donunce iptal, fare ve dokunmatik, baska bir
 *   eylem beklerken ve bekleme suresinde kapali.
 * - Sunucu: dogrulama ve red, 30 sn bekleme, 3 sn (oyun suresi) omur, yer
 *   dusmanlari gecemiyor ve dolasiyor, tam kapaliyken kalkana degil yapiya
 *   vuruyor, ucanlar ve isciler geciyor, kalkan kalkinca gezinme donuyor,
 *   avci ve yiyici de duruyor, karsi atagin yalnizca kalkana denk gelen
 *   kismi yutuluyor, yeni katilan kalkani goruyor.
 * - Refactor tamamen gitti.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATAKAN_SHIELD_SLOT,
  COUNTER_SURGE_CROSS_MS,
  COUNTER_SURGE_TELEGRAPH_MS,
  COUNTER_SURGE_WIDTH_COLUMNS,
  GAME_SPEED_MULTIPLIER,
  METAL_SHIELD_COOLDOWN_MS,
  METAL_SHIELD_DRAG_THRESHOLD_CELLS,
  METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX,
  METAL_SHIELD_DURATION_MS,
  addSurgeAbsorbedInterval,
  beginMetalShieldGesture,
  characters,
  clampMetalShieldSegment,
  decodeSurgeCuts,
  encodeSurgeCuts,
  endMetalShieldGesture,
  getMapGridSize,
  getMapOrigin,
  getMetalShieldDragThreshold,
  getMetalShieldMaxLength,
  getMetalShieldMinLength,
  getMetalShieldRejectText,
  getMetalShieldWallDurationMs,
  getSurgeFrontSegments,
  getSurgeObstacleContact,
  getVerticalSurgeBand,
  gridToWorld,
  isSparedFromSurge,
  moveMetalShieldGesture,
  segmentsTouch,
  worldToGrid
} from "../packages/shared/dist/index.js";
import { MESSAGE_RULES, sanitizeMessagePayload } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom } from "./helpers/match-room-harness.mjs";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const shieldSkill = characters.find((character) => character.id === "warrior").skills[ATAKAN_SHIELD_SLOT];
/** Oyun suresinin duvar saatindeki karsiligi (sunucunun `scaleGameDuration`i). */
const oyun = (ms) => ms / GAME_SPEED_MULTIPLIER;
const OMUR_MS = oyun(METAL_SHIELD_DURATION_MS);

function makeClient(sessionId = "p1") {
  const client = { sessionId, ref: { bufferedAmount: 0 }, sent: [], send(type, payload) { client.sent.push({ type, payload }); } };
  return client;
}

/** Acik 12x18 arena, p1 AttackLord. Yayinlar `room.sent`e yaziliyor. */
function oda(characterId = "warrior", stage = 2) {
  const room = createRoom(characterId);
  const client = makeClient();
  const sent = [];
  room.broadcast = (type, payload) => sent.push({ type, payload });
  room.clients = [client];
  room.mapScale = 1;
  room.configureArenaForScale();
  room.stage = stage;
  room.sent = sent;
  room.client = client;
  return room;
}

function sahteSaat(fn) {
  const gercek = Date.now;
  const saat = { now: 1_800_000_000_000 };
  Date.now = () => saat.now;
  try {
    return fn(saat);
  } finally {
    Date.now = gercek;
  }
}

const olcu = (room) => ({ grid: getMapGridSize(room.activeMap), origin: getMapOrigin(room.activeMap) });
/** Hucre koordinatindan (kesirli olabilir) dunya noktasi: (0,0) haritanin sol ust kosesi. */
function nokta(room, col, row) {
  const { grid, origin } = olcu(room);
  return { x: origin.x + col * grid, y: origin.y + row * grid };
}

/** Kalkani hucre koordinatlariyla (kose tabanli, kesirli) ceker. */
function kalkan(room, c1, r1, c2, r2, client = room.client) {
  const a = nokta(room, c1, r1);
  const b = nokta(room, c2, r2);
  room.useSkill(client, { slot: ATAKAN_SHIELD_SLOT, x: a.x, y: a.y, x2: b.x, y2: b.y });
  return room.metalShields.at(-1);
}

const redler = (client) => client.sent.filter((entry) => entry.type === "skill:rejected").map((entry) => entry.payload);

/**
 * Hucrenin ortasinda bir yer dusmani. Dogan dusmanin turu zarla geliyor;
 * hiz ve vurus burada sabitleniyor ki testler zardan bagimsiz olsun
 * (saniyede bir hucre, duvari kalkan omrunde yikamayacak kadar zayif vurus).
 */
function dusman(room, col, row, overrides = {}) {
  room.spawnEnemy();
  const enemy = [...room.enemies.values()].at(-1);
  const point = gridToWorld(col, row, room.activeMap);
  Object.assign(enemy, {
    type: "grunt", movementKind: "ground", x: point.x, y: point.y, hp: 1e9, maxHp: 1e9,
    navigator: undefined, navigatorStep: undefined, structureTargetId: undefined, special: undefined, champion: undefined,
    attackRange: 0, towerAttackCooldownMs: 0, attack: 8, speed: getMapGridSize(room.activeMap), abilities: [], ...overrides
  });
  return enemy;
}

function ozel(room, kind, col, row) {
  room.spawnEnemy(undefined, { kind, type: "grunt", healthMultiplier: 1, start: gridToWorld(col, row, room.activeMap) });
  const enemy = [...room.enemies.values()].at(-1);
  enemy.hp = enemy.maxHp = 1e9;
  return enemy;
}

function kur(room, definitionId, col, row) {
  const point = gridToWorld(col, row, room.activeMap);
  const before = room.towers.size;
  room.placeTower(room.client, { x: point.x, y: point.y, definitionId });
  assert.equal(room.towers.size, before + 1, `${definitionId} (${col},${row}) kurulamadi`);
  return [...room.towers.values()].at(-1);
}

function duvar(room, col, row, side) {
  const { grid, origin } = olcu(room);
  const point = {
    top: { x: origin.x + col * grid + grid / 2, y: origin.y + row * grid },
    bottom: { x: origin.x + col * grid + grid / 2, y: origin.y + (row + 1) * grid },
    left: { x: origin.x + col * grid, y: origin.y + row * grid + grid / 2 },
    right: { x: origin.x + (col + 1) * grid, y: origin.y + row * grid + grid / 2 }
  }[side];
  const before = room.towers.size;
  room.placeTower(room.client, { ...point, definitionId: "wall-1" });
  assert.equal(room.towers.size, before + 1, `duvar (${col},${row},${side}) orulemedi`);
  return [...room.towers.values()].at(-1);
}

/**
 * Dusman tikini `saniye` boyunca, duvar saatiyle birlikte surer. Her tikten
 * sonra `her` cagrilir; `true` donerse durur.
 */
function sur(room, saat, saniye, her = () => false, dt = 0.05) {
  for (let elapsed = 0; elapsed < saniye - 1e-9; elapsed += dt) {
    saat.now += dt * 1000;
    room.updateEnemies(dt);
    if (her()) return true;
  }
  return false;
}

/** Dusmanlarin her adiminin hicbir kalkani kesmedigini izler. */
function gecisBekcisi(room, enemies) {
  const last = new Map(enemies.map((enemy) => [enemy.id, { x: enemy.x, y: enemy.y }]));
  return () => {
    for (const enemy of enemies) {
      if (!room.enemies.has(enemy.id)) continue;
      const before = last.get(enemy.id);
      for (const shield of room.metalShields) {
        const moved = before.x !== enemy.x || before.y !== enemy.y;
        assert.ok(!moved || !segmentsTouch(before.x, before.y, enemy.x, enemy.y, shield.x1, shield.y1, shield.x2, shield.y2),
          `dusman ${enemy.id} kalkanin icinden gecti (${before.x},${before.y}) -> (${enemy.x},${enemy.y})`);
      }
      last.set(enemy.id, { x: enemy.x, y: enemy.y });
    }
    return false;
  };
}

// --- Metin ve sabitler --------------------------------------------------------------

test("Metal Kalkan yuva 1'de Refactor'un yerinde: ad, aciklama, 30 sn, 3 sn", () => {
  const names = characters.find((character) => character.id === "warrior").skills.map((skill) => skill.name);
  assert.deepEqual(names, ["Yönlendirme", "Metal Kalkan", "Execute"]);
  assert.equal(ATAKAN_SHIELD_SLOT, 1);
  assert.equal(shieldSkill.id, "warrior-skill-2");
  assert.equal(shieldSkill.cooldownMs, 30_000);
  assert.equal(METAL_SHIELD_COOLDOWN_MS, shieldSkill.cooldownMs);
  assert.equal(METAL_SHIELD_DURATION_MS, 3000);
  assert.equal(getMetalShieldWallDurationMs(), OMUR_MS);
  assert.equal(shieldSkill.description, "Haritada basılı tutup sürükleyerek 3 saniyeliğine yıkılmaz bir metal kalkan çeker. Yer düşmanları içinden geçemez; karşı atağın kalkana denk gelen kısmını durdurur. Bekleme süresi 30 sn.");
  // Azami boy karsi atak seridinin genisligi.
  assert.equal(getMetalShieldMaxLength(40), COUNTER_SURGE_WIDTH_COLUMNS * 40);
  assert.ok(getMetalShieldMinLength(40) < METAL_SHIELD_DRAG_THRESHOLD_CELLS * 40, "sunucunun alt siniri jest esiginden buyuk");
  assert.equal(getMetalShieldRejectText("short"), "Kalkan çok kısa");

  const en = readSource("apps/web/src/locales/catalog/en-units.ts");
  assert.match(en, /"warrior-skill-2": \{\s*name: "Metal Shield",\s*description: "Press and drag on the map to draw an indestructible metal shield for 3 seconds\. Ground enemies cannot pass through it; it stops the part of the Counter-surge that meets it\. Cooldown 30 s\."/);
});

test("Refactor tamamen gitti: sunucu, sahne, metinler, belgeler", () => {
  const server = readSource("apps/server/src/rooms/MatchRoom.ts");
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  const hud = readSource("apps/web/src/game-control-ui.ts");
  const locale = readSource("apps/web/src/locales/areas/scene.ts");
  const en = readSource("apps/web/src/locales/catalog/en-units.ts");
  const skills = readSource("packages/shared/src/characters/atakan/skills/index.ts");
  for (const [name, source] of [["sunucu", server], ["sahne", scene], ["HUD", hud], ["sahne metinleri", locale], ["EN katalog", en], ["beceri tablosu", skills]]) {
    assert.ok(!/refactor/i.test(source), `${name} hala Refactor tasiyor`);
  }
  assert.ok(!/###\s*2\.\s*Refactor/.test(readSource("docs/atakan.md")), "belge hala Refactor'u anlatiyor");
  assert.match(readSource("docs/atakan.md"), /### 2\. Metal Kalkan/);
  const room = createRoom("warrior");
  assert.equal(room.refactorTower, undefined);
});

// --- Jest ------------------------------------------------------------------------------

const GRID = 40;
const hazir = (overrides = {}) => ({ available: true, busy: false, cooldownSeconds: 0, inside: true, gridSize: GRID, worldPerScreenPx: 1, ...overrides });
const isaretci = (x, y, overrides = {}) => ({ pointerId: 1, pointerType: "touch", x, y, ...overrides });

test("jest: duz dokunus ve esigin altindaki titreme hicbir sey gostermez, hicbir sey cekmez", () => {
  const threshold = getMetalShieldDragThreshold(GRID, 1);
  assert.equal(threshold, METAL_SHIELD_DRAG_THRESHOLD_CELLS * GRID);
  let gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
  assert.ok(gesture);
  assert.equal(gesture.preview, undefined, "basista onizleme cikti");
  // Duz dokunus.
  let end = endMetalShieldGesture(gesture, isaretci(100, 100), hazir());
  assert.deepEqual([end.cast, end.consumed, end.gesture], [undefined, false, undefined]);
  // Kucuk titreme: esigin hemen alti, her yone.
  for (const [dx, dy] of [[threshold - 0.5, 0], [0, -(threshold - 0.5)], [(threshold - 0.5) / Math.SQRT2, (threshold - 0.5) / Math.SQRT2], [-3, 2]]) {
    gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
    const moved = moveMetalShieldGesture(gesture, isaretci(100 + dx, 100 + dy), hazir());
    assert.equal(moved.gesture.preview, undefined, `titreme (${dx},${dy}) onizleme acti`);
    end = endMetalShieldGesture(moved.gesture, isaretci(100 + dx, 100 + dy), hazir());
    assert.equal(end.cast, undefined);
    assert.equal(end.consumed, false, "titreme dokunusu yuttu");
  }
});

test("jest: esik ustunde onizleme basis noktasindan isaretciye, her acida; birakinca cekilir", () => {
  for (const [dx, dy] of [[60, 0], [0, 70], [-45, -45], [30, -55]]) {
    let gesture = beginMetalShieldGesture(undefined, isaretci(200, 300), hazir());
    ({ gesture } = moveMetalShieldGesture(gesture, isaretci(200 + dx, 300 + dy), hazir()));
    assert.deepEqual(gesture.preview, { x1: 200, y1: 300, x2: 200 + dx, y2: 300 + dy });
    const end = endMetalShieldGesture(gesture, isaretci(200 + dx, 300 + dy), hazir());
    assert.deepEqual(end.cast, { x1: 200, y1: 300, x2: 200 + dx, y2: 300 + dy });
    assert.equal(end.consumed, true, "kalkan cekildi ama birakis dokunus sayildi");
    assert.equal(end.gesture, undefined);
  }
  // Birakis noktasi son hareketten farkliysa birakis noktasi gecerli.
  let gesture = beginMetalShieldGesture(undefined, isaretci(0, 0), hazir());
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(50, 0), hazir()));
  assert.deepEqual(endMetalShieldGesture(gesture, isaretci(0, 80), hazir()).cast, { x1: 0, y1: 0, x2: 0, y2: 80 });
});

test("jest: ekran tabani: kucuk hucreli haritada esik en az 14 ekran pikseli", () => {
  // 10 birimlik hucre, piksel basina 1 dunya birimi: 0,6 hucre = 6 < 14.
  assert.equal(getMetalShieldDragThreshold(10, 1), METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX);
  assert.equal(getMetalShieldDragThreshold(10, 2), METAL_SHIELD_DRAG_THRESHOLD_SCREEN_PX * 2);
  assert.equal(getMetalShieldDragThreshold(40, 0.5), 24);
  const context = hazir({ gridSize: 10, worldPerScreenPx: 1 });
  let gesture = beginMetalShieldGesture(undefined, isaretci(0, 0), context);
  assert.equal(moveMetalShieldGesture(gesture, isaretci(10, 0), context).gesture.preview, undefined, "bir hucre ama 14 pikselin alti");
  assert.ok(moveMetalShieldGesture(gesture, isaretci(15, 0), context).gesture.preview);
});

test("jest: azami boy karsi atak seridinin genisligi; fazlasi yonu koruyup ucu kirpar", () => {
  const max = getMetalShieldMaxLength(GRID);
  let gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(100 + 600, 100 + 800), hazir()));
  const { x1, y1, x2, y2 } = gesture.preview;
  assert.ok(Math.abs(Math.hypot(x2 - x1, y2 - y1) - max) < 1e-9);
  assert.ok(Math.abs((x2 - x1) / max - 0.6) < 1e-9 && Math.abs((y2 - y1) / max - 0.8) < 1e-9, "yon bozuldu");
  const cast = endMetalShieldGesture(gesture, isaretci(700, 900), hazir()).cast;
  assert.ok(Math.abs(Math.hypot(cast.x2 - cast.x1, cast.y2 - cast.y1) - max) < 1e-9);
  // Tam sinirda ve altinda kirpma yok.
  assert.deepEqual(clampMetalShieldSegment(0, 0, max, 0, max), { x1: 0, y1: 0, x2: max, y2: 0, length: max });
  assert.equal(clampMetalShieldSegment(0, 0, 0, 0, max).length, 0);
});

test("jest: esigin icine donunce onizleme kalkar ve birakis hicbir sey yapmaz; yeniden cikinca geri gelir", () => {
  let gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(180, 100), hazir()));
  assert.ok(gesture.preview);
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(105, 102), hazir()));
  assert.equal(gesture.preview, undefined, "geri donunce onizleme kalmadi");
  const end = endMetalShieldGesture(gesture, isaretci(105, 102), hazir());
  assert.equal(end.cast, undefined, "iptal edilen jest kalkan cekti");
  assert.equal(end.consumed, true, "vazgecilen surukleme siradan dokunus gibi islendi");
  // Birakmadan yeniden uzaklasirsa onizleme geri gelir.
  gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(180, 100), hazir()));
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(101, 100), hazir()));
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(100, 170), hazir()));
  assert.deepEqual(gesture.preview, { x1: 100, y1: 100, x2: 100, y2: 170 });
});

test("jest: ikinci parmak, harita disi ve araya giren eylem iptal eder", () => {
  // Ikinci parmak.
  let gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(180, 100), hazir()));
  gesture = beginMetalShieldGesture(gesture, isaretci(300, 300, { pointerId: 2 }), hazir());
  assert.equal(gesture.dead, true);
  assert.equal(gesture.preview, undefined);
  // Olu jest hareketle dirilmez; ikinci parmagin birakisi onu bitirmez.
  assert.equal(moveMetalShieldGesture(gesture, isaretci(200, 100), hazir()).gesture.preview, undefined);
  const other = endMetalShieldGesture(gesture, isaretci(300, 300, { pointerId: 2 }), hazir());
  assert.equal(other.consumed, false);
  assert.equal(other.gesture, gesture, "ikinci parmagin birakisi jesti sildi");
  const end = endMetalShieldGesture(gesture, isaretci(200, 100), hazir());
  assert.deepEqual([end.cast, end.consumed], [undefined, true]);

  // Harita disina cikmak (geri donse de olu).
  gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(180, 100), hazir()));
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(900, 100), hazir({ inside: false })));
  assert.equal(gesture.dead, true);
  assert.equal(endMetalShieldGesture(gesture, isaretci(180, 100), hazir()).cast, undefined);
  // Harita disinda birakis.
  gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(180, 100), hazir()));
  assert.equal(endMetalShieldGesture(gesture, isaretci(180, 100), hazir({ inside: false })).cast, undefined);

  // Surukleme sirasinda baska bir eylem basladi (ornegin cekmeceden kule surukleme).
  gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), hazir());
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(180, 100), hazir()));
  ({ gesture } = moveMetalShieldGesture(gesture, isaretci(190, 100), hazir({ busy: true })));
  assert.equal(gesture.dead, true);
  assert.equal(endMetalShieldGesture(gesture, isaretci(190, 100), hazir()).cast, undefined);
});

test("jest: fare ve dokunmatik ayni kural; farede yalnizca ana tus", () => {
  for (const pointerType of ["mouse", "touch", "pen"]) {
    let gesture = beginMetalShieldGesture(undefined, isaretci(100, 100, { pointerType, button: 0 }), hazir());
    assert.ok(gesture, pointerType);
    assert.equal(moveMetalShieldGesture(gesture, isaretci(110, 100, { pointerType }), hazir()).gesture.preview, undefined, `${pointerType}: esik alti`);
    ({ gesture } = moveMetalShieldGesture(gesture, isaretci(170, 100, { pointerType }), hazir()));
    assert.deepEqual(endMetalShieldGesture(gesture, isaretci(170, 100, { pointerType }), hazir()).cast, { x1: 100, y1: 100, x2: 170, y2: 100 }, pointerType);
  }
  assert.equal(beginMetalShieldGesture(undefined, isaretci(100, 100, { pointerType: "mouse", button: 2 }), hazir()), undefined, "sag tus jest baslatti");
  assert.equal(beginMetalShieldGesture(undefined, isaretci(100, 100, { pointerType: "mouse", button: 1 }), hazir()), undefined, "orta tus jest baslatti");
});

test("jest: baska operator, baska bekleyen eylem ve harita disi basis jest baslatmaz", () => {
  assert.equal(beginMetalShieldGesture(undefined, isaretci(100, 100), hazir({ available: false })), undefined, "AttackLord degil");
  assert.equal(beginMetalShieldGesture(undefined, isaretci(100, 100), hazir({ busy: true })), undefined, "bekleyen eylem");
  assert.equal(beginMetalShieldGesture(undefined, isaretci(100, 100), hazir({ inside: false })), undefined, "harita disi");
  assert.equal(beginMetalShieldGesture(undefined, isaretci(Number.NaN, 100), hazir()), undefined, "bozuk nokta");
  // Jest yokken hareket ve birakis hicbir sey.
  assert.deepEqual(moveMetalShieldGesture(undefined, isaretci(300, 300), hazir()), { gesture: undefined });
  assert.deepEqual(endMetalShieldGesture(undefined, isaretci(300, 300), hazir()), { gesture: undefined, consumed: false });
});

test("jest: bekleme suresinde onizleme yok, cekme yok; bildirim jest basina bir kez ve dokunus eskisi gibi", () => {
  const beklemede = hazir({ cooldownSeconds: 12 });
  let gesture = beginMetalShieldGesture(undefined, isaretci(100, 100), beklemede);
  assert.equal(gesture.mode, "cooldown");
  // Duz dokunus: bildirim de yok.
  const tap = endMetalShieldGesture(gesture, isaretci(101, 100), beklemede);
  assert.deepEqual([tap.cast, tap.cooldownNotice, tap.consumed], [undefined, undefined, false]);
  // Surukleme: onizleme yok, kalan saniye bir kez.
  let moved = moveMetalShieldGesture(gesture, isaretci(170, 100), beklemede);
  assert.equal(moved.gesture.preview, undefined, "beklemede onizleme cikti");
  assert.equal(moved.cooldownNotice, 12);
  gesture = moved.gesture;
  for (const x of [180, 190, 240]) {
    moved = moveMetalShieldGesture(gesture, isaretci(x, 100), beklemede);
    assert.equal(moved.cooldownNotice, undefined, "bildirim yagdi");
    assert.equal(moved.gesture.preview, undefined);
    gesture = moved.gesture;
  }
  // Bekleme jestin ortasinda bitse de bu jest cekmez.
  const end = endMetalShieldGesture(gesture, isaretci(240, 100), hazir());
  assert.equal(end.cast, undefined);
  assert.equal(end.consumed, false, "beklemedeki surukleme dokunusu yuttu");
  // Kesirli kalan sure yukari yuvarlanir.
  gesture = beginMetalShieldGesture(undefined, isaretci(0, 0), hazir({ cooldownSeconds: 0.3 }));
  assert.equal(moveMetalShieldGesture(gesture, isaretci(80, 0), hazir({ cooldownSeconds: 0.3 })).cooldownNotice, 1);
});

// --- Sunucu: dogrulama ---------------------------------------------------------------

test("mesaj kurali: useSkill kalkanin ucunu (x2, y2) sayi olarak tasiyor", () => {
  const rule = MESSAGE_RULES.useSkill;
  assert.equal(rule.fields.x2, "number");
  assert.equal(rule.fields.y2, "number");
  assert.ok(rule.rate && rule.rate.burst > 0, "useSkill kovasiz");
  assert.deepEqual(sanitizeMessagePayload({ slot: 1, x: 1, y: 2, x2: 3, y2: 4, junk: true }, rule.fields), { slot: 1, x: 1, y: 2, x2: 3, y2: 4 });
  assert.deepEqual(sanitizeMessagePayload({ slot: 1, x: 1, y: 2, x2: Number.NaN, y2: "4" }, rule.fields), { slot: 1, x: 1, y: 2 });
});

test("gecerli kalkan: parca sahada, bekleme 30 sn, omur 3 sn oyun suresi", () => {
  sahteSaat((saat) => {
    const room = oda();
    const player = room.state.players.get("p1");
    const shield = kalkan(room, 4, 6, 6, 7);
    assert.ok(shield, "kalkan cekilmedi");
    assert.equal(room.metalShields.length, 1);
    assert.deepEqual(redler(room.client), []);
    const a = nokta(room, 4, 6);
    const b = nokta(room, 6, 7);
    assert.ok(Math.abs(shield.x1 - a.x) < 0.1 && Math.abs(shield.y1 - a.y) < 0.1 && Math.abs(shield.x2 - b.x) < 0.1 && Math.abs(shield.y2 - b.y) < 0.1);
    assert.equal(shield.ownerId, "p1");
    assert.equal(player.skill2CooldownMs, 30_000, "bekleme 30 sn degil");
    assert.equal(shield.expiresAt - saat.now, OMUR_MS, "omur oyun suresiyle olceklenmedi");
    assert.equal(OMUR_MS, 3750);
    // Cani yok, kule degil: hedef alinamaz, kirilamaz.
    assert.equal(shield.hp, undefined);
    assert.equal(room.towers.size, 0);

    // Omrun sonuna kadar duruyor, sonra kalkiyor.
    saat.now += OMUR_MS - 1;
    room.updateEnemies(0.016);
    assert.equal(room.metalShields.length, 1, "kalkan erken kalkti");
    saat.now += 2;
    room.updateEnemies(0.016);
    assert.equal(room.metalShields.length, 0, "kalkan 3 sn sonunda kalkmadi");
    // Bekleme oyun suresiyle akiyor: 30 sn sonra yeniden.
    assert.ok(player.skill2CooldownMs > 0);
    room.updateSkillCooldowns(30_000);
    assert.equal(player.skill2CooldownMs, 0);
    assert.ok(kalkan(room, 4, 6, 6, 7));
  });
});

test("red: harita disi, cok kisa, eksik nokta; bekleme harcanmiyor", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  const cases = [
    ["baslangic harita disi", [-0.5, 6, 2, 6], "bounds"],
    ["uc harita disi", [10, 6, 12.4, 6], "bounds"],
    ["alt kenarin disi", [4, 17, 4, 18.2], "bounds"],
    ["cok kisa", [4, 6, 4.2, 6], "short"],
    ["sifir boy", [4, 6, 4, 6], "short"]
  ];
  for (const [label, [c1, r1, c2, r2], reason] of cases) {
    room.client.sent = [];
    kalkan(room, c1, r1, c2, r2);
    assert.equal(room.metalShields.length, 0, `${label}: kalkan cekildi`);
    assert.deepEqual(redler(room.client), [{ slot: ATAKAN_SHIELD_SLOT, reason }], label);
    assert.equal(player.skill2CooldownMs, 0, `${label}: bekleme harcandi`);
  }
  for (const message of [{ slot: 1 }, { slot: 1, x: 100, y: 100 }, { slot: 1, x: 100, y: 100, x2: 150 }, { slot: 1, x2: 150, y2: 150 }]) {
    room.client.sent = [];
    room.useSkill(room.client, message);
    assert.equal(room.metalShields.length, 0);
    assert.deepEqual(redler(room.client), [{ slot: ATAKAN_SHIELD_SLOT, reason: "invalid" }]);
    assert.equal(player.skill2CooldownMs, 0);
  }
  // Tam alt sinir kabul ediliyor (jest esigi bunun ustunde).
  room.client.sent = [];
  assert.ok(kalkan(room, 4, 6, 4.5, 6), "yarim hucrelik kalkan reddedildi");
  assert.deepEqual(redler(room.client), []);
});

test("uzun gelen kalkan yonu koruyarak azami boya kirpiliyor", () => {
  const room = oda();
  const { grid } = olcu(room);
  const shield = kalkan(room, 2, 4, 10, 10);
  assert.ok(shield);
  const length = Math.hypot(shield.x2 - shield.x1, shield.y2 - shield.y1);
  assert.ok(Math.abs(length - COUNTER_SURGE_WIDTH_COLUMNS * grid) < 0.2, `boy ${length}`);
  assert.ok(Math.abs((shield.x2 - shield.x1) / length - 0.8) < 0.01 && Math.abs((shield.y2 - shield.y1) / length - 0.6) < 0.01, "yon bozuldu");
  const start = nokta(room, 2, 4);
  assert.ok(Math.abs(shield.x1 - start.x) < 0.1 && Math.abs(shield.y1 - start.y) < 0.1, "baslangic kaydi");
});

test("bekleme dolmadan ikinci kalkan yok; baska operatorun ikinci becerisi kalkan cekmez", () => {
  const room = oda();
  const player = room.state.players.get("p1");
  assert.ok(kalkan(room, 4, 6, 6, 6));
  room.client.sent = [];
  kalkan(room, 4, 9, 6, 9);
  assert.equal(room.metalShields.length, 1, "beklemede ikinci kalkan cekildi");
  assert.equal(player.skill2CooldownMs, 30_000);
  // Bekleme kartiyla kisalmis sayac da oyun suresiyle akiyor.
  room.updateSkillCooldowns(29_000);
  kalkan(room, 4, 9, 6, 9);
  assert.equal(room.metalShields.length, 1);
  room.updateSkillCooldowns(1_000);
  kalkan(room, 4, 9, 6, 9);
  assert.equal(room.metalShields.length, 2);

  for (const characterId of ["zeynep", "archer"]) {
    const other = oda(characterId);
    const otherPlayer = other.state.players.get("p1");
    otherPlayer.reputation = 1000;
    kalkan(other, 4, 6, 6, 6);
    assert.equal(other.metalShields.length, 0, `${characterId} kalkan cekti`);
    assert.deepEqual(redler(other.client), [], `${characterId}: kalkan reddi gitti`);
  }

  // Co-op: kalkan yalnizca atanin beklemesini harciyor.
  const coop = oda();
  const p1 = coop.state.players.get("p1");
  coop.state.players.set("p2", { ...p1, id: "p2", name: "Zeynep", characterId: "zeynep", slot: 1, skillCooldowns: [], runModifiers: [] });
  const p2Client = makeClient("p2");
  coop.clients.push(p2Client);
  assert.ok(kalkan(coop, 4, 6, 6, 6));
  assert.ok(!(coop.state.players.get("p2").skill2CooldownMs > 0), "takim arkadasinin beklemesi degisti");
  kalkan(coop, 4, 9, 6, 9, p2Client);
  assert.equal(coop.metalShields.length, 1, "Zeynep kalkan cekti");
});

test("mac bittikten sonra kalkan cekilmiyor ve sahadaki kalkiyor", () => {
  const room = oda();
  assert.ok(kalkan(room, 4, 6, 6, 6));
  room.finishMatch("victory");
  assert.equal(room.metalShields.length, 0);
  room.state.players.get("p1").skill2CooldownMs = 0;
  room.client.sent = [];
  kalkan(room, 4, 6, 6, 6);
  assert.equal(room.metalShields.length, 0);
  assert.deepEqual(redler(room.client), [{ slot: ATAKAN_SHIELD_SLOT, reason: "invalid" }]);
});

// --- Sunucu: gecis ---------------------------------------------------------------------

test("yer dusmani kalkandan gecemiyor ve etrafindan dolasiyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    const { grid, origin } = olcu(room);
    // Yatay kalkan: 4.-7. sutunlarin onunde, 6. satirin ust kenarinda.
    const enemies = [dusman(room, 5, 4), dusman(room, 4, 4), dusman(room, 6, 5), dusman(room, 5, 5, { speed: grid * 4 })];
    const shield = kalkan(room, 4, 6, 7, 6);
    const lineY = origin.y + 6 * grid;
    const bekci = gecisBekcisi(room, enemies);
    let dolasan = false;
    sur(room, saat, OMUR_MS / 1000 - 0.1, () => {
      bekci();
      assert.equal(room.metalShields.length, 1);
      for (const enemy of enemies) {
        // Kalkanin onundeki dusman, kalkanin x araliginda cizgiyi asamaz.
        if (enemy.x > shield.x1 && enemy.x < shield.x2) assert.ok(enemy.y < lineY, `dusman kalkanin arkasina gecti (y ${enemy.y})`);
        else if (enemy.y > lineY) dolasan = true;
      }
      return false;
    });
    assert.ok(dolasan, "hizli dusman kalkanin ucundan dolasip asagi inemedi");
    // Duran yok: herkes kalkanin bir ucuna dogru yuruyor.
    for (const enemy of enemies) {
      const start = enemy === enemies[0] ? 5.5 : enemy === enemies[1] ? 4.5 : enemy === enemies[2] ? 6.5 : 5.5;
      const moved = Math.abs(enemy.x - (origin.x + start * grid));
      assert.ok(moved > grid * 0.4 || enemy.y > lineY, `dusman kalkanin onunde bekledi (kayma ${moved})`);
    }
  });
});

test("egik kalkan da gecilmiyor: hucrenin icinden gecen parca, koseyi kesen yuruyus", () => {
  sahteSaat((saat) => {
    const room = oda();
    const { grid } = olcu(room);
    // Dusmanlar kalkanin ustunde, farkli sutun ve hucre ici konumlarda.
    const enemies = [];
    for (const [col, row, ox, oy] of [[4, 4, 0, 0], [5, 4, 0.3, -0.2], [6, 4, -0.35, 0.3], [5, 5, 0.1, 0.1], [7, 5, -0.2, 0], [4, 5, 0.4, 0.4], [6, 3, 0, 0.45]]) {
      const enemy = dusman(room, col, row, { speed: grid * 2.5 });
      enemy.x += ox * grid;
      enemy.y += oy * grid;
      enemies.push(enemy);
    }
    kalkan(room, 3.7, 5.2, 6.1, 7.0);
    const bekci = gecisBekcisi(room, enemies);
    sur(room, saat, OMUR_MS / 1000 - 0.1, bekci, 1 / 60);
    assert.equal(room.metalShields.length, 1);
    assert.equal(room.enemies.size, enemies.length, "dusman kayboldu");
  });
});

test("cizginin ustunde duran dusman bulundugu tarafa itiliyor", () => {
  const room = oda();
  const { grid } = olcu(room);
  const ustte = dusman(room, 5, 5);
  const altta = dusman(room, 6, 6);
  const uzak = dusman(room, 5, 3);
  const ucan = dusman(room, 4, 5, { movementKind: "air" });
  const line = nokta(room, 0, 6).y;
  ustte.y = line - 1;
  altta.y = line + 2;
  ucan.y = line - 1;
  const uzakY = uzak.y;
  kalkan(room, 4, 6, 7, 6);
  assert.ok(ustte.y < line - grid * 0.15, `usttteki dusman itilmedi (${line - ustte.y})`);
  assert.ok(altta.y > line + grid * 0.15, `alttaki dusman itilmedi (${altta.y - line})`);
  assert.equal(uzak.y, uzakY, "uzaktaki dusman itildi");
  assert.equal(ucan.y, line - 1, "ucan dusman itildi");
});

test("tam kapali dusman kalkana degil duvara vuruyor; kalkan kalkinca kirmayi birakip yuruyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    const { grid } = olcu(room);
    // (5,6) hucresi: sol, sag ve ust kenari duvar; alti acik.
    const walls = [duvar(room, 5, 6, "left"), duvar(room, 5, 6, "right"), duvar(room, 5, 6, "top")];
    const enemy = dusman(room, 5, 6);
    const lineY = nokta(room, 0, 7).y;
    // Alt kenari kalkan kapatiyor: dort yan da kapali.
    const shield = kalkan(room, 4.6, 7, 6.4, 7);
    assert.ok(shield);
    const bekci = gecisBekcisi(room, [enemy]);
    sur(room, saat, OMUR_MS / 1000 - 0.1, bekci);
    assert.ok(enemy.y < lineY, "dusman kalkani gecti");
    const hit = walls.filter((wall) => wall.hp < wall.maxHp);
    assert.ok(hit.length > 0, "kapali dusman hicbir duvara vurmadi");
    assert.ok(walls.some((wall) => wall.id === enemy.structureTargetId), "kirma hedefi duvar degil");
    assert.equal(room.towers.size, walls.length, "kalkan yapi listesine girdi");

    // Kalkan kalkti: kilit dusuyor, dusman asagi yuruyor, duvarlar artik hasar almiyor.
    sur(room, saat, 0.3);
    assert.equal(room.metalShields.length, 0);
    assert.equal(enemy.structureTargetId, undefined, "kalkan kalkti ama dusman hala duvari dovuyor");
    const hpAfter = walls.map((wall) => wall.hp);
    sur(room, saat, 3);
    assert.deepEqual(walls.map((wall) => wall.hp), hpAfter, "yol acildi ama duvar hasar almaya devam etti");
    assert.ok(enemy.y > lineY + grid * 0.5, "kalkan kalkinca dusman asagi inmedi");
  });
});

test("kalkanin arkasindaki yapi kirma adayi degil; ulasilabilen yapi yoksa dusman bekliyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    // (5,6) dort yandan duvarli; kalkan hucrenin icinde, alt duvarin hemen onunde.
    // Kirmanin ilk adayi hep onundeki (alttaki) duvar; kalkan onu aday olmaktan cikariyor.
    const left = duvar(room, 5, 6, "left");
    const right = duvar(room, 5, 6, "right");
    const top = duvar(room, 5, 6, "top");
    const bottom = duvar(room, 5, 6, "bottom");
    const enemy = dusman(room, 5, 6);
    const centre = gridToWorld(5, 6, room.activeMap);
    const { grid } = olcu(room);
    kalkan(room, 5.05, 6.8, 5.95, 6.8);
    assert.equal(room.metalShields.length, 1);
    // Alt duvar kalkanin arkasinda: dusmandan duvarin ortasina giden cizgi kalkani kesiyor.
    assert.ok(room.isShieldBlockingSegment(centre.x, centre.y, bottom.x, bottom.y));
    sur(room, saat, OMUR_MS / 1000 - 0.1);
    assert.equal(bottom.hp, bottom.maxHp, "dusman kalkanin arkasindaki duvara vurdu");
    assert.ok([left, right, top].some((wall) => wall.hp < wall.maxHp), "ulasilabilen duvara vurulmadi");
    assert.ok(enemy.y < centre.y + grid * 0.5);
  });

  sahteSaat((saat) => {
    // Hic yapi yok ama dort yan kapali: harita kosesi + capraz kalkan. Dusman bekliyor.
    const room = oda();
    const enemy = dusman(room, 0, 0);
    kalkan(room, 1.45, 0.02, 0.02, 1.45);
    const bekci = gecisBekcisi(room, [enemy]);
    sur(room, saat, OMUR_MS / 1000 - 0.1, () => {
      bekci();
      assert.deepEqual(worldToGrid(enemy.x, enemy.y, room.activeMap), { col: 0, row: 0 }, "dusman kalkanin kestigi koseden cikti");
      return false;
    });
    assert.ok(room.enemies.has(enemy.id));
    assert.equal(enemy.structureTargetId, undefined, "yapi yokken kirma hedefi secildi");
    // Kalkan kalkinca yuruyor.
    sur(room, saat, 2);
    assert.notDeepEqual(worldToGrid(enemy.x, enemy.y, room.activeMap), { col: 0, row: 0 }, "kalkan kalkti ama dusman hala bekliyor");
  });
});

test("ucan dusman ve isci kalkandan geciyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    const { grid } = olcu(room);
    const ucan = dusman(room, 5, 4, { movementKind: "air", speed: grid * 2 });
    const yuruyen = dusman(room, 6, 4, { speed: grid * 2 });
    const nexus = room.activePaths[0].points.at(-1);
    // Ucanin nexusa giden duz yolunu kesen genis kalkan.
    const shield = kalkan(room, 4, 6, 7, 6);
    assert.ok(segmentsTouch(ucan.x, ucan.y, nexus.x, nexus.y, shield.x1, shield.y1, shield.x2, shield.y2), "kalkan ucanin yolunda degil; test bir sey sinamiyor");
    const lineY = nokta(room, 0, 6).y;
    sur(room, saat, 2);
    assert.equal(room.metalShields.length, 1);
    assert.ok(ucan.y > lineY, "ucan dusman kalkanda durdu");
    assert.ok(yuruyen.y < lineY || yuruyen.x < shield.x1 || yuruyen.x > shield.x2, "yuruyen dusman kalkani gecti");

    // Isci: kalkanin iki yanindaki hucreler arasinda yuruyor.
    const from = gridToWorld(5, 5, room.activeMap);
    const to = gridToWorld(5, 7, room.activeMap);
    assert.ok(room.isShieldBlockingSegment(from.x, from.y, to.x, to.y), "kalkan iscinin yolunda degil");
    const worker = {
      id: "test-isci", ownerId: "p1", mode: "energyTransport", x: from.x, y: from.y, vx: 0, vy: 0, speed: 82,
      cargo: 0, capacity: 12, hp: 60, maxHp: 60, targetTowerId: "", logisticsPhase: "pickup"
    };
    let reached = false;
    for (let tick = 0; tick < 60 && !reached; tick += 1) reached = room.moveLogisticsWorker(worker, to.x, to.y, 0.05);
    assert.equal(room.metalShields.length, 1);
    assert.ok(reached, "isci kalkanin obur yanina varamadi");
    assert.ok(worker.y > lineY);
  });
});

test("kalkan kalkinca gezinme eski haline donuyor: gecisler acik, hafiza temiz, dusman duz iniyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    const { grid } = olcu(room);
    const above = { col: 5, row: 5 };
    assert.equal(room.isCellPassable(above, 5, 6), true);
    const enemy = dusman(room, 5, 4);
    kalkan(room, 4, 6, 7, 6);
    assert.equal(room.isCellPassable(above, 5, 6), false, "kalkan gecisi kapatmadi");
    assert.equal(room.isCellPassable({ col: 5, row: 6 }, 5, 5), false, "kalkan ters yonde gecisi kapatmadi");
    assert.equal(room.isCellPassable({ col: 3, row: 5 }, 3, 6), true, "kalkanin disindaki gecis kapandi");
    assert.equal(room.isCellPassable(above, 6, 5), true, "kalkana paralel gecis kapandi");
    // Hafizaya kalkan yuzunden bir seyler yazilsin.
    room.sealedCells.add("5:5");
    room.deadEndCells.add("5:5");
    sur(room, saat, OMUR_MS / 1000 - 0.2);
    assert.ok(enemy.shieldTouched, "kalkan dusmanin adimini kesmedi; test bir sey sinamiyor");
    sur(room, saat, 0.4);
    assert.equal(room.metalShields.length, 0);
    assert.equal(room.isCellPassable(above, 5, 6), true, "kalkan kalkti ama gecis kapali");
    assert.equal(room.sealedCells.size, 0, "kapali cikis hafizasi kaldi");
    assert.equal(room.deadEndCells.has("5:5"), false, "cikmaz sokak hafizasi kaldi");
    assert.equal(enemy.shieldTouched, undefined);
    // Dusman bulundugu sutunda dumduz asagi iniyor (olmayan duvari izlemiyor).
    const col = worldToGrid(enemy.x, enemy.y, room.activeMap).col;
    const y0 = enemy.y;
    sur(room, saat, 2, () => {
      assert.equal(worldToGrid(enemy.x, enemy.y, room.activeMap).col, col, "dusman kalkan kalktiktan sonra yana yurudu");
      return false;
    });
    assert.ok(enemy.y - y0 > enemy.speed * 2 * 0.9 - grid * 0.6, "dusman kalkan kalktiktan sonra tam hizla inmedi");
  });
});

test("kalkan ana kapi uyarisi (flow:shift) uretmiyor ve kule yerlesim indeksini eskitmiyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    room.updateEnemies(0.016);
    room.sent.length = 0;
    const cellIndex = room.getTowerCellIndex();
    assert.equal(room.towerCellIndexDirty, false);
    kalkan(room, 4, 6, 7, 6);
    assert.equal(room.towerCellIndexDirty, false, "kalkan hucre indeksini eskitti");
    assert.equal(room.mainGateDirty, false, "kalkan ana kapiyi eskitti");
    sur(room, saat, OMUR_MS / 1000 + 0.5);
    assert.equal(room.sent.filter((entry) => entry.type === "flow:shift").length, 0, "kalkan akis uyarisi yaydi");
    assert.equal(room.getTowerCellIndex(), cellIndex);
  });
});

test("kule avcisi ve enerji yiyici de kalkanda duruyor; yol alani kalkani dolasiyor", () => {
  for (const kind of ["hunter", "eater"]) {
    sahteSaat((saat) => {
      const room = oda(kind === "eater" ? "warrior" : "warrior", 3);
      const { grid } = olcu(room);
      // Hedef asagida: avci icin savas kulesi, yiyici icin reaktor.
      const hedef = kur(room, kind === "eater" ? "warrior-8" : "warrior-1", 5, 10);
      const enemy = ozel(room, kind, 5, 4);
      enemy.speed = grid * 2;
      assert.equal(enemy.special.kind, kind);
      const lineY = nokta(room, 0, 6).y;
      // Alan kalkandan once: (5,5)'ten sonraki adim (5,6).
      let field = room.getSpecialRouteField(kind);
      const cols = room.activeMap.cols;
      assert.equal(field.next[5 * cols + 5], 6 * cols + 5, `${kind}: test duzeni bozuk`);
      const shield = kalkan(room, 4, 6, 7, 6);
      field = room.getSpecialRouteField(kind);
      assert.notEqual(field.next[5 * cols + 5], 6 * cols + 5, `${kind}: yol alani kalkanin icinden geciyor`);
      assert.ok(Number.isFinite(field.cost[5 * cols + 5]), `${kind}: kalkan dolasilabilirken alan kapali`);
      const bekci = gecisBekcisi(room, [enemy]);
      let dolasti = false;
      sur(room, saat, OMUR_MS / 1000 - 0.1, () => {
        bekci();
        if (enemy.x > shield.x1 && enemy.x < shield.x2) assert.ok(enemy.y < lineY, `${kind} kalkani gecti`);
        else if (enemy.y > lineY) dolasti = true;
        return false;
      });
      assert.ok(dolasti, `${kind} kalkani dolasmadi`);
      assert.equal(hedef.hp > 0, true);
      // Kalkan kalkinca alan yeniden kuruluyor: yine duz yol.
      sur(room, saat, 0.3);
      assert.equal(room.metalShields.length, 0);
      assert.equal(room.getSpecialRouteField(kind).next[5 * cols + 5], 6 * cols + 5, `${kind}: kalkan kalkti ama alan eski`);
    });
  }
});

test("yol alani kalkani kirilacak engel saymiyor: kalkanla kapanan hedef ulasilamaz, duvarla kapanan kirilir", () => {
  const room = oda("warrior", 3);
  const cols = room.activeMap.cols;
  // Sol ust kose hucresi (0,0): tek cikislari saga ve asagi.
  kur(room, "warrior-1", 6, 10);
  const before = room.getSpecialRouteField("hunter");
  assert.ok(Number.isFinite(before.cost[0]));
  // Koseyi capraz kalkanla kes.
  kalkan(room, 1.45, 0.02, 0.02, 1.45);
  const field = room.getSpecialRouteField("hunter");
  assert.equal(field.cost[0], Number.POSITIVE_INFINITY, "kalkanla kapali kose alan icinde ulasilabilir gorunuyor");
  assert.ok(Number.isFinite(field.cost[1 * cols + 1]), "kalkanin disindaki hucre de kapandi");
  // Avci o kosedeyse ozel yolu yok; normal yola dusuyor ve hareket kapisi onu tutuyor.
  const avci = ozel(room, "hunter", 0, 0);
  assert.equal(room.findSpecialEnemyRoute(avci, "hunter"), undefined);
});

// --- Karsi atak ------------------------------------------------------------------------

const SURGE_UYARI_MS = oyun(COUNTER_SURGE_TELEGRAPH_MS);
const SURGE_GECIS_MS = oyun(COUNTER_SURGE_CROSS_MS);

/** Seridi kaldirir ve on cizgiyi verilen satira (kesirli) kadar ilerletir. */
function seridiIlerlet(room, saat, satir) {
  const rows = room.activeMap.rows;
  const hedef = room.counterSurge.launchAt + (satir / rows) * SURGE_GECIS_MS;
  while (saat.now < hedef) {
    saat.now = Math.min(hedef, saat.now + 50);
    room.updateEnemies(0.05);
  }
}

test("karşı atak: yalnızca kalkana denk gelen kısım yutuluyor; arkasındaki yapı korunuyor, gerisi vuruluyor", () => {
  sahteSaat((saat) => {
    const room = oda("warrior", 2);
    const rows = room.activeMap.rows;
    // Serit 4-6. sutunlar. Kalkan sol 1,25 sutunu kapatiyor (x: 4 -> 5,25), 6. satirin ust kenarinda.
    const ustKorunmasiz = kur(room, "warrior-1", 4, 2);
    const korunan = kur(room, "warrior-1", 4, 10);
    const korunanDuvar = duvar(room, 4, 13, "bottom");
    const ortadaki = kur(room, "warrior-1", 5, 10);
    const sagdaki = kur(room, "warrior-1", 6, 10);
    const disaridaki = kur(room, "warrior-1", 8, 10);
    room.startCounterSurge(4, 3, saat.now);
    const id = room.counterSurge.id;
    seridiIlerlet(room, saat, 5.4);
    assert.ok(ustKorunmasiz.hp < ustKorunmasiz.maxHp, "kalkandan once gecilen kule vurulmadi");
    assert.equal(room.getSnapshot().surges[0].cut, undefined, "kalkan yokken kesik var");

    const shield = kalkan(room, 4, 6, 5.25, 6);
    assert.ok(shield);
    assert.equal(room.counterSurge.absorbed.length, 0, "on cizgi kalkana varmadan yutuldu");
    // On cizgi kalkana variyor (kalkan hala sahada).
    seridiIlerlet(room, saat, 6.3);
    assert.equal(room.metalShields.length, 1, "kalkan on cizgi gelmeden kalkti; test bir sey sinamiyor");
    assert.equal(room.counterSurge.absorbed.length, 1);
    const [interval] = room.counterSurge.absorbed;
    assert.ok(Math.abs(interval.from - shield.x1) < 0.2 && Math.abs(interval.to - shield.x2) < 0.2, "yutulan aralik kalkanin x araligi degil");
    assert.ok(Math.abs(interval.progress - 6 / rows) < 0.002, `kesilme ilerlemesi ${interval.progress}`);
    // Tel: seridin sol kenarindan hucre cinsinden aralik ve kesildigi ilerleme.
    const wire = room.getSnapshot().surges[0];
    assert.deepEqual(wire.cut, [0, 1.25, Math.round((6 / rows) * 1000) / 1000]);
    assert.deepEqual({ id: wire.id, col: wire.col, w: wire.w }, { id, col: 4, w: 3 });
    assert.ok(wire.p > 6 / rows, "seridin geri kalani ilerlemiyor");
    // Kalkan harcanmadi: kendi omrunu yasiyor.
    assert.equal(room.metalShields.length, 1);

    // Serit haritayi bitiriyor.
    for (let t = 0; t < SURGE_GECIS_MS + 1000 && room.counterSurge; t += 50) {
      saat.now += 50;
      room.updateEnemies(0.05);
    }
    assert.equal(room.counterSurge, undefined);
    assert.equal(room.metalShields.length, 0);
    assert.equal(korunan.hp, korunan.maxHp, "yutulan kismin arkasindaki kule vuruldu");
    assert.equal(korunanDuvar.hp, korunanDuvar.maxHp, "yutulan kismin arkasindaki duvar vuruldu");
    assert.ok(ortadaki.hp < ortadaki.maxHp, "kapatilmayan orta sutundaki kule vurulmadi");
    assert.ok(sagdaki.hp < sagdaki.maxHp, "kapatilmayan sag sutundaki kule vurulmadi");
    assert.equal(disaridaki.hp, disaridaki.maxHp);
    const hits = room.sent.filter((entry) => entry.type === "surge:hit").flatMap((entry) => entry.payload.hits.map((hit) => hit.towerId));
    assert.ok(!hits.includes(korunan.id) && !hits.includes(korunanDuvar.id));
    assert.ok(hits.includes(ortadaki.id) && hits.includes(sagdaki.id) && hits.includes(ustKorunmasiz.id));
  });
});

test("karşı atak: şeridin tamamını kapatan kalkan hepsini durdurur; yarısını kapatan yarısını", () => {
  sahteSaat((saat) => {
    const room = oda("warrior", 2);
    const towers = [4, 5, 6].map((col) => kur(room, "warrior-1", col, 12));
    room.startCounterSurge(4, 3, saat.now);
    seridiIlerlet(room, saat, 7.5);
    // Seritten genis degil ama tam genisliginde: 4 -> 7.
    kalkan(room, 4, 8, 7, 8);
    seridiIlerlet(room, saat, 8.3);
    assert.deepEqual(room.getSnapshot().surges[0].cut.slice(0, 2), [0, 3]);
    for (let t = 0; t < SURGE_GECIS_MS && room.counterSurge; t += 50) {
      saat.now += 50;
      room.updateEnemies(0.05);
    }
    for (const tower of towers) assert.equal(tower.hp, tower.maxHp, "tam kapatilan seritte kule vuruldu");
  });

  sahteSaat((saat) => {
    const room = oda("warrior", 2);
    const sol = kur(room, "warrior-1", 4, 12);
    const sag = kur(room, "warrior-1", 6, 12);
    room.startCounterSurge(4, 3, saat.now);
    seridiIlerlet(room, saat, 7.5);
    // Seridin disina tasan egik kalkan: yalnizca seride denk gelen izdusumu sayilir (4 -> 5,5).
    kalkan(room, 2.7, 8.6, 5.5, 8.1);
    seridiIlerlet(room, saat, 9.2);
    const cut = room.getSnapshot().surges[0].cut;
    assert.equal(cut.length, 3);
    assert.deepEqual(cut.slice(0, 2), [0, 1.5], "yutulan parca kalkanin seritteki izdusumu degil");
    for (let t = 0; t < SURGE_GECIS_MS && room.counterSurge; t += 50) {
      saat.now += 50;
      room.updateEnemies(0.05);
    }
    assert.equal(sol.hp, sol.maxHp, "kapatilan yarinin arkasindaki kule vuruldu");
    assert.ok(sag.hp < sag.maxHp, "kapatilmayan yaridaki kule vurulmadi");
  });
});

test("karşı atak: kalkmış kalkan, şeridin arkasındaki kalkan ve uyarı evresi hiçbir şeyi durdurmaz", () => {
  sahteSaat((saat) => {
    const room = oda("warrior", 2);
    const kule = kur(room, "warrior-1", 5, 14);
    room.startCounterSurge(4, 3, saat.now);
    // Uyari evresinde cekilen kalkan (ust kenarda): serit kalkmadan omru bitiyor.
    kalkan(room, 4, 0.5, 7, 0.5);
    saat.now += SURGE_UYARI_MS - 10;
    room.updateEnemies(0.05);
    assert.equal(room.counterSurge.absorbed.length, 0, "uyari evresinde yutuldu");
    seridiIlerlet(room, saat, 3);
    assert.equal(room.metalShields.length, 0);
    assert.equal(room.counterSurge.absorbed.length, 0, "kalkmis kalkan seridi durdurdu");
    // Seridin arkasina (coktan gecilen yere) cekilen kalkan.
    room.state.players.get("p1").skill2CooldownMs = 0;
    kalkan(room, 4, 1.5, 7, 1.5);
    seridiIlerlet(room, saat, 4);
    assert.equal(room.counterSurge.absorbed.length, 0, "seridin arkasindaki kalkan seridi durdurdu");
    // Onune cekilen ama on cizgi gelmeden kalkan kalkan.
    saat.now += OMUR_MS + 10;
    room.updateEnemies(0.05);
    room.state.players.get("p1").skill2CooldownMs = 0;
    const front = room.getCounterSurgeProgress(room.counterSurge, saat.now) * room.activeMap.rows;
    kalkan(room, 4, front + 4, 7, front + 4);
    saat.now += OMUR_MS + 10;
    room.updateEnemies(0.05);
    assert.equal(room.metalShields.length, 0);
    for (let t = 0; t < SURGE_GECIS_MS && room.counterSurge; t += 50) {
      saat.now += 50;
      room.updateEnemies(0.05);
    }
    assert.equal(room.getSnapshot().surges, undefined);
    assert.ok(kule.hp < kule.maxHp, "hicbir kalkan seride degmedi ama kule korundu");
    // Seride paralel (dikey) kalkan da hicbir seyi kesmez.
    const band = getVerticalSurgeBand({ x: 0, y: 0 }, 40, 4, 3, 18);
    assert.equal(getSurgeObstacleContact(band, 200, 100, 200, 220, 0, 500), undefined);
  });
});

test("şerit yutulması yöne bağımsız: yandan ve çaprazdan gelen bantta da aynı hesap", () => {
  // Soldan saga ilerleyen serit: genislik ekseni y (isaretli), on cizgi dikey.
  const yan = { originX: 0, originY: 300, dirX: 1, dirY: 0, length: 480, width: 120 };
  // Dikey bir engel, seridin ust yarisinda (y 250..290), x = 200'de.
  assert.equal(getSurgeObstacleContact(yan, 200, 250, 200, 290, 0, 150), undefined, "on cizgi varmadan yutuldu");
  const contact = getSurgeObstacleContact(yan, 200, 250, 200, 290, 150, 205);
  assert.ok(contact);
  assert.ok(Math.abs(contact.along - 200) < 1e-9);
  const absorbed = [];
  assert.equal(addSurgeAbsorbedInterval(absorbed, contact.from, contact.to, contact.along / yan.length), true);
  // Engelin arkasinda (x > 200), ayni y araliginda: korunuyor.
  assert.equal(isSparedFromSurge(yan, absorbed, 320, 270), true);
  // Engelin onunde: korunmuyor (serit oraya vardi).
  assert.equal(isSparedFromSurge(yan, absorbed, 150, 270), false);
  // Seridin kapatilmayan yarisinda: korunmuyor.
  assert.equal(isSparedFromSurge(yan, absorbed, 320, 330), false);
  // Coktan gecilen engel hicbir seyi kesmez.
  assert.equal(getSurgeObstacleContact(yan, 100, 250, 100, 290, 150, 205), undefined);
  // Tel: genislik boyunca dusuk kenardan hucre cinsinden.
  const cut = encodeSurgeCuts(yan, absorbed, 40);
  assert.equal(cut.length, 3);
  assert.ok(Math.abs((cut[1] - cut[0]) - 1) < 1e-9, "40 birimlik engel 1 hucre genisliginde yutulmali");
  assert.equal(cut[2], Math.round((200 / 480) * 1000) / 1000);

  // Capraz serit (sag-asagi): engelin izdusumu genislik eksenine.
  const s = Math.SQRT1_2;
  const capraz = { originX: 0, originY: 0, dirX: s, dirY: s, length: 600, width: 200 };
  // On cizgiye paralel (yola dik) bir engel: yolun 300. biriminde, orta hattin bir yaninda.
  const mid = { x: 300 * s, y: 300 * s };
  const a = { x: mid.x + 10 * s, y: mid.y - 10 * s };
  const b = { x: mid.x + 80 * s, y: mid.y - 80 * s };
  const hit = getSurgeObstacleContact(capraz, a.x, a.y, b.x, b.y, 250, 301);
  assert.ok(hit);
  assert.ok(Math.abs(hit.to - hit.from - 70) < 1e-6, `izdusum genisligi ${hit.to - hit.from}`);
  const list = [];
  addSurgeAbsorbedInterval(list, hit.from, hit.to, hit.along / capraz.length);
  const arkada = { x: 400 * s + 40 * s, y: 400 * s - 40 * s };
  const obur = { x: 400 * s - 40 * s, y: 400 * s + 40 * s };
  assert.equal(isSparedFromSurge(capraz, list, arkada.x, arkada.y), true);
  assert.equal(isSparedFromSurge(capraz, list, obur.x, obur.y), false);

  // Cakisan ikinci aralik: once kesilen gecerli, yalnizca yeni kisim ekleniyor.
  const ranges = [];
  addSurgeAbsorbedInterval(ranges, 100, 160, 0.3);
  assert.equal(addSurgeAbsorbedInterval(ranges, 120, 200, 0.5), true);
  assert.deepEqual(ranges, [{ from: 100, to: 160, progress: 0.3 }, { from: 160, to: 200, progress: 0.5 }]);
  assert.equal(addSurgeAbsorbedInterval(ranges, 110, 150, 0.6), false, "tamamen yutulmus aralik yeniden eklendi");
});

test("tel kaydı ve dilimler: kesik dilim kesildiği ilerlemede duruyor, gerisi ilerliyor", () => {
  assert.deepEqual(decodeSurgeCuts([0, 1.25, 0.333], 3), [{ from: 0, to: 1.25, p: 0.333 }]);
  // Bozuk veri: eksik uclu, sayi olmayan, ters aralik, tasan aralik.
  assert.deepEqual(decodeSurgeCuts([2, 5, 0.4, "x", 1, 0.2, 1.5, 1, 0.3, 0.5], 3), [{ from: 2, to: 3, p: 0.4 }]);
  assert.deepEqual(decodeSurgeCuts(undefined, 3), []);
  assert.deepEqual(decodeSurgeCuts("cut", 3), []);
  const cuts = decodeSurgeCuts([0, 1.25, 0.333], 3);
  assert.deepEqual(getSurgeFrontSegments(3, 0.6, cuts), [
    { from: 0, to: 1.25, p: 0.333, cut: true },
    { from: 1.25, to: 3, p: 0.6, cut: false }
  ]);
  // Ara degerde on cizgi kesige henuz varmadiysa serit tek parca ilerliyor.
  assert.deepEqual(getSurgeFrontSegments(3, 0.3, cuts), [{ from: 0, to: 3, p: 0.3, cut: false }]);
  assert.deepEqual(getSurgeFrontSegments(3, 0.5, []), [{ from: 0, to: 3, p: 0.5, cut: false }]);
  // Ortadaki kesik: uc dilim.
  assert.deepEqual(getSurgeFrontSegments(3, 0.8, [{ from: 1, to: 2, p: 0.5 }]).map((segment) => [segment.from, segment.to, segment.cut]), [[0, 1, false], [1, 2, true], [2, 3, false]]);
});

// --- Ag ----------------------------------------------------------------------------------

test("kalkan snapshotta: yalnizca varken, kucuk kayit; yeni katilan ilk karede goruyor", () => {
  sahteSaat((saat) => {
    const room = oda();
    assert.ok(!("shields" in room.getSnapshot()), "kalkan yokken shields anahtari var");
    const shield = kalkan(room, 4, 6, 6, 7);
    let snapshot = room.getSnapshot();
    assert.deepEqual(snapshot.shields, [{ id: shield.id, x1: shield.x1, y1: shield.y1, x2: shield.x2, y2: shield.y2, ms: OMUR_MS }]);
    assert.ok(JSON.stringify(snapshot.shields).length < 90, "kalkan kaydi buyuk");
    saat.now += 1000;
    snapshot = room.getSnapshot();
    assert.equal(snapshot.shields[0].ms, OMUR_MS - 1000);

    // Delta kare: kalkan ust duzey alan, her karede tam gidiyor.
    const { wire } = room.applyWireDelta(room.getSnapshot());
    assert.deepEqual(wire.shields, snapshot.shields);
    // Mac ortasinda katilan / yeniden baglanan: ilk (tam) karede kalkan var.
    const frames = [];
    const late = { sessionId: "p2", ref: { bufferedAmount: 0 }, send(type, payload) { if (type === "snapshot") frames.push(payload); } };
    room.clients.push(late);
    assert.equal(room.sendSnapshotWithBackpressure(wire, room.getSnapshot()), true);
    assert.equal(frames.length, 1, "yeni katilan kare almadi");
    assert.deepEqual(frames[0].shields, snapshot.shields, "yeni katilan kalkani gormuyor");

    saat.now += OMUR_MS;
    room.updateEnemies(0.016);
    assert.ok(!("shields" in room.getSnapshot()), "kalkan kalkti ama telde");
  });
});

test("istemci: jest paylasilan kuraldan, istek baslangic ve ucla gidiyor; sekmede bilgi satiri", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  const hud = readSource("apps/web/src/game-control-ui.ts");
  const locale = readSource("apps/web/src/locales/areas/scene.ts");
  assert.ok(scene.includes("beginMetalShieldGesture(") && scene.includes("moveMetalShieldGesture(") && scene.includes("endMetalShieldGesture("), "sahne jesti paylasilan kuraldan okumuyor");
  assert.match(scene, /send\("useSkill", \{ slot: ATAKAN_SHIELD_SLOT, x: cast\.x1, y: cast\.y1, x2: cast\.x2, y2: cast\.y2 \}\)/, "istek baslangic ve ucla gitmiyor");
  // Sekmedeki dugme hedefleme silahlandirmiyor: yalnizca ipucu.
  assert.ok(scene.includes(`t("scene.skill.shieldHint")`));
  assert.ok(!/pendingAction = \{ type: "shield"/.test(scene), "kalkan bekleyen eylem olarak silahlaniyor");
  assert.ok(locale.includes(`"scene.skill.shieldHint": "Metal Kalkan: haritada basılı tutup sürükle"`));
  assert.ok(locale.includes(`"scene.skill.shieldHint": "Metal Shield: press and drag on the map"`));
  assert.ok(locale.includes(`"scene.skill.shieldCooldown": "Metal Kalkan {seconds} sn sonra hazır"`));
  assert.ok(hud.includes("game-controls__skill--gesture"), "sekmede bilgi satiri yok");
  // Iptal yollari: tuvalin pointercancel / yakalama kaybi jesti de kapatiyor.
  const abandon = scene.slice(scene.indexOf("private abandonMapGesture()"), scene.indexOf("private getCanvasRect()"));
  assert.ok(abandon.includes("this.cancelShieldGesture()"), "pointercancel kalkan jestini kapatmiyor");
});

// --- Istemci cizimi ----------------------------------------------------------------------

const channels = (color) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map((value) => value / 255);
/** tests/vfx-hard-language.test.mjs ile ayni olcu: pastel ve neon bant yok. */
function grounded(color) {
  const [r, g, b] = channels(color);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  if (l <= 0.22 || l >= 0.9) return true;
  if (l > 0.7) return s <= 0.35;
  return s <= 0.625;
}
const colorsOf = (...recorders) => recorders.flatMap((recorder) => recorder.calls
  .filter(([name]) => name === "lineStyle" || name === "fillStyle")
  .map(([name, a, b]) => (name === "lineStyle" ? b : a)));

test("kalkan cizimi sert dilde: top metali levha, soguk camgobegi kenar; acilis ve kapanis hizli ve dogrusal", async () => {
  const shieldVfx = await importWebModule("apps/web/src/vfx/metal-shield.ts");
  for (const color of [shieldVfx.METAL_SHIELD_PLATE_COLOR, shieldVfx.METAL_SHIELD_PLATE_LIGHT, shieldVfx.METAL_SHIELD_FRAME_COLOR, shieldVfx.METAL_SHIELD_EDGE_COLOR, shieldVfx.METAL_SHIELD_INVALID_COLOR, shieldVfx.METAL_SHIELD_INVALID_PLATE_COLOR]) {
    assert.ok(grounded(color), `sekerleme renk ${color.toString(16)}`);
  }
  // Camgobegi: mavi-yesil baskin, kirmizi dusuk.
  const [r, g, b] = channels(shieldVfx.METAL_SHIELD_EDGE_COLOR);
  assert.ok(b > r && g > r, "enerji kenari camgobegi degil");

  const total = getMetalShieldWallDurationMs();
  const extent = shieldVfx.getMetalShieldExtent;
  assert.equal(extent(total, total), 0, "ilk karede kapali");
  assert.equal(extent(total - shieldVfx.METAL_SHIELD_DEPLOY_MS / 2, total), 0.5, "acilis dogrusal degil");
  assert.equal(extent(total - shieldVfx.METAL_SHIELD_DEPLOY_MS, total), 1);
  assert.equal(extent(total / 2, total), 1, "omrun ortasinda tam acik");
  assert.equal(extent(shieldVfx.METAL_SHIELD_RETRACT_MS / 2, total), 0.5, "kapanis dogrusal degil");
  assert.equal(extent(0, total), 0);
  assert.ok(shieldVfx.METAL_SHIELD_DEPLOY_MS <= 200 && shieldVfx.METAL_SHIELD_RETRACT_MS <= 250, "acilis/kapanis yavas");
  // Tasma yok: hicbir anda 1'i gecmiyor (sekme/yay egrisi degil).
  for (let ms = 0; ms <= total; ms += 7) assert.ok(extent(ms, total) >= 0 && extent(ms, total) <= 1);

  const segment = { x1: 100, y1: 100, x2: 190, y2: 160 };
  const options = { now: 500, reducedMotion: false };
  const full = createRecorder();
  shieldVfx.drawMetalShield(full, segment, 34, 1, options);
  const half = createRecorder();
  shieldVfx.drawMetalShield(half, segment, 34, 0.5, options);
  const none = createRecorder();
  shieldVfx.drawMetalShield(none, segment, 34, 0, options);
  assert.equal(none.calls.length, 0, "kapali kalkan cizildi");
  assert.ok(half.calls.length > 0 && half.calls.length < full.calls.length, "yari acik kalkan daha az levha cizmeli");
  const preview = createRecorder();
  shieldVfx.drawMetalShieldPreview(preview, segment, 34, { maxed: true });
  const invalid = createRecorder();
  shieldVfx.drawMetalShieldPreview(invalid, segment, 34, { invalid: true });
  for (const color of colorsOf(full, half, preview, invalid)) assert.ok(grounded(color), `cizimde sekerleme renk ${color.toString(16)}`);
  assert.ok(colorsOf(full).includes(shieldVfx.METAL_SHIELD_PLATE_COLOR) && colorsOf(full).includes(shieldVfx.METAL_SHIELD_EDGE_COLOR));
  assert.ok(colorsOf(preview).includes(shieldVfx.METAL_SHIELD_EDGE_COLOR));
  assert.ok(colorsOf(invalid).includes(shieldVfx.METAL_SHIELD_INVALID_COLOR) && !colorsOf(invalid).includes(shieldVfx.METAL_SHIELD_EDGE_COLOR));
  // Cizim Graphics'i temizlemiyor; daire, yay ya da parilti yordami yok (duz kenarli levha).
  const names = new Set([...full.calls, ...preview.calls].map(([name]) => name));
  for (const name of ["clear", "fillCircle", "strokeCircle", "arc"]) assert.ok(!names.has(name), `${name} kullanildi`);
  for (const name of Object.keys(shieldVfx)) assert.ok(!/sparkle|glitter|glow|bounce|star/i.test(name), `sus yordami: ${name}`);
});

test("kalkan ara degeri: omur dogrusal, kalkan kalkan aralik boyunca kapaniyor, bozuk kayit atlaniyor", async () => {
  const shieldVfx = await importWebModule("apps/web/src/vfx/metal-shield.ts");
  const a = { id: 1, x1: 0, y1: 0, x2: 50, y2: 0, ms: 3000 };
  const b = { ...a, ms: 2940 };
  assert.equal(shieldVfx.interpolateMetalShields(undefined, undefined, 0.5), undefined);
  const next = [b];
  assert.equal(shieldVfx.interpolateMetalShields(undefined, next, 0.5), next, "yeni kalkan oldugu gibi");
  assert.deepEqual(shieldVfx.interpolateMetalShields([a], [b], 0.5), [{ ...a, ms: 2970 }]);
  assert.equal(b.ms, 2940, "kaynak kayit degisti");
  // Sonraki snapshotta yok: aralik boyunca sifira iniyor, sonunda kalkiyor.
  assert.deepEqual(shieldVfx.interpolateMetalShields([{ ...a, ms: 60 }], undefined, 0.5), [{ ...a, ms: 30 }]);
  assert.equal(shieldVfx.interpolateMetalShields([{ ...a, ms: 60 }], undefined, 1), undefined);
  // Ikinci bir kalkan (co-op) ve bozuk kayit.
  const c = { id: 2, x1: 5, y1: 5, x2: 9, y2: 9, ms: 100 };
  assert.deepEqual(shieldVfx.interpolateMetalShields([a], [b, c, { id: "x" }, null], 1), [b, c]);
  assert.equal(shieldVfx.isMetalShieldSnapshot({ id: 1, x1: 0, y1: 0, x2: 1, y2: Number.NaN, ms: 5 }), false);
});

test("serit cizimi: yutulan dilim kalkanda duruyor, gerisi on kenara kadar; kesik yokken eski cizim", async () => {
  const special = await importWebModule("apps/web/src/vfx/special-threats.ts");
  const origin = { x: 100, y: 40 };
  const grid = 32;
  const plain = special.getCounterSurgeBand({ col: 2, w: 3, p: 0.5 }, origin, grid, 12, 20);
  assert.equal(plain.segments, undefined, "kesik yokken dilim kuruldu");
  const band = special.getCounterSurgeBand({ col: 2, w: 3, p: 0.5, cut: [0, 1.5, 0.25] }, origin, grid, 12, 20);
  const top = 40;
  const height = 20 * grid;
  assert.deepEqual(band.segments, [
    { left: 100 + 2 * grid, right: 100 + 3.5 * grid, frontY: top + 0.25 * height, cut: true },
    { left: 100 + 3.5 * grid, right: 100 + 5 * grid, frontY: top + 0.5 * height, cut: false }
  ]);
  // Uyari evresinde kesik okunmuyor; bozuk kesik yok sayiliyor.
  assert.equal(special.getCounterSurgeBand({ col: 2, w: 3, p: 0, warn: true, cut: [0, 1.5, 0.25] }, origin, grid, 12, 20).segments, undefined);
  assert.equal(special.getCounterSurgeBand({ col: 2, w: 3, p: 0.5, cut: ["a", 1, 2] }, origin, grid, 12, 20).segments, undefined);
  // Ara deger kesigi tasiyor.
  const mid = special.interpolateCounterSurges([{ id: 1, col: 2, w: 3, p: 0.4 }], [{ id: 1, col: 2, w: 3, p: 0.5, cut: [0, 1.5, 0.45] }], 0.5);
  assert.deepEqual(mid[0].cut, [0, 1.5, 0.45]);

  const options = { now: 1234, reducedMotion: false };
  const fill = createRecorder();
  const edge = createRecorder();
  special.drawCounterSurge(fill, edge, band, grid, options);
  const rects = fill.calls.filter(([name]) => name === "fillRect").map(([, x, y, w, h]) => ({ x, y, w, h }));
  // Yutulan dilimin dolgusu kesilme noktasinda bitiyor; ilerleyen dilimin dolgusu on kenarda.
  const cutRect = rects.find((rect) => rect.x === 100 + 2 * grid && rect.y === top);
  const liveRect = rects.find((rect) => rect.x === 100 + 3.5 * grid && rect.y === top);
  assert.ok(cutRect && liveRect, "dilim dolgulari yok");
  assert.equal(cutRect.w, 1.5 * grid);
  assert.equal(cutRect.h, 0.25 * height, "yutulan dilim kalkanin otesine cizildi");
  assert.equal(liveRect.h, 0.5 * height);
  assert.ok(rects.every((rect) => !(rect.x < 100 + 3.5 * grid && rect.y + rect.h > top + 0.25 * height + 0.001)), "yutulan kismin arkasina dolgu tasti");
  // Beyaz-sicak yatay on cizgi yalnizca ilerleyen dilimde.
  const hot = [];
  let style;
  for (const [name, ...args] of edge.calls) {
    if (name === "lineStyle") style = args;
    if (name === "lineBetween" && style[1] === special.SURGE_EDGE_COLOR && args[1] === args[3]) hot.push(args);
  }
  assert.ok(hot.length > 0 && hot.every(([x1, y, x2]) => y === top + 0.5 * height && x1 >= 100 + 3.5 * grid && x2 <= 100 + 5 * grid), "durmus dilimde beyaz-sicak on cizgi var");
  for (const color of colorsOf(fill, edge)) assert.ok(grounded(color));
  const alphas = fill.calls.filter(([name]) => name === "fillStyle").map(([, , alpha]) => alpha);
  assert.ok(alphas.every((alpha) => alpha <= 0.2), "serit dolgusu opak");
});

test("geri bildirim: kalkanin sesi kayitli celik levha ornegi (yeni dosya yok), sentez yalnizca yedek", async () => {
  const { FEEDBACK_KIND_RULES } = await import("../packages/shared/dist/index.js");
  const rule = FEEDBACK_KIND_RULES.metalShield;
  assert.ok(rule && rule.soundMs > 0 && rule.soundMs <= 400);
  assert.equal(rule.shakePx, 0, "kalkan kamerayi sarsiyor");
  const director = readSource("apps/web/src/feedback-director.ts");
  assert.match(director, /SFX_SAMPLE_FAMILY[^=]*= \{[^}]*metalShield: "ball"/, "yonetmen kalkani ornekten calmiyor");
  assert.match(director, /\n  metalShield: \(\) => \[/, "ornek yokken sentez yedegi yok");
  const manifest = JSON.parse(readSource("apps/web/public/audio/sfx/manifest.json"));
  const entries = manifest.files.filter((entry) => entry.family === "ball");
  assert.ok(entries.length >= 2);
  for (const entry of entries) assert.match(entry.source, /^impact\/impactPlate_heavy_/, "celik levha darbesi degil");
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.ok(scene.includes(`emit("metalShield"`), "kalkanin sesi yonetmenden gecmiyor");
  assert.match(scene, /this\.renderMetalShields\(frame\.snapshot\.shields, now\);/);
  assert.match(scene, /shields: interpolateMetalShields\(previous\.shields, next\.shields, alpha\)/);
});
