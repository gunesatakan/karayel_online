/**
 * Harita jestiyle beceri: becerinin sirasina sabit jest, her operatorde ayni.
 *
 *   - 1. beceri (yuva 0): basili tut (halka dolar), sonra surukle.
 *   - 2. beceri (yuva 1): duz surukle (AttackLord'da Metal Kalkan'in kendi makinesi).
 *   - 3. beceri (yuva 2): iki parmakla surukle; farede sag tusla.
 *   - ZentaX: kademe cekilen boydan (DUSUK / ORTA / YUKSEK), esigin altinda iptal.
 *
 * Burasi saf durum makinesini (siniflandirma, esikler, kademe, iptal, mesgul
 * kip), operator eslemesini, istemcinin baglantisini (kaynak duzeyinde) ve
 * kademe cubugunun sert renklerini kilitliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  METAL_SHIELD_DRAG_THRESHOLD_CELLS,
  SKILL_GESTURE_HIGH_CELLS,
  SKILL_GESTURE_HIGH_SCREEN_PX,
  SKILL_GESTURE_HOLD_MS,
  SKILL_GESTURE_HOLD_SLOP_SCREEN_PX,
  SKILL_GESTURE_MEDIUM_CELLS,
  SKILL_GESTURE_MEDIUM_SCREEN_PX,
  SKILL_GESTURE_MIN_SCREEN_PX,
  SKILL_GESTURE_SLOT,
  SKILL_GESTURE_TWO_FINGER_WINDOW_MS,
  WALL_LINE_DWELL_MS,
  ZEYNEP_COMMAND_TIER_COST,
  beginSkillGesture,
  dropSkillGesturePointer,
  endSkillGesture,
  getSkillGestureHoldProgress,
  getSkillGestureTargets,
  getSkillGestureThresholds,
  getSkillGestureTier,
  getSkillGestureTierLabel,
  moveSkillGesture,
  tickSkillGesture
} from "../packages/shared/dist/index.js";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const GRID = 40;
const slots = (overrides = []) => [0, 1, 2].map((slot) => ({ enabled: true, cooldownSeconds: 0, ...(overrides[slot] ?? {}) }));
const ctx = (overrides = {}) => ({ busy: false, inside: true, gridSize: GRID, worldPerScreenPx: 1, slots: slots(), ...overrides });
const touch = (x, y, pointerId = 1) => ({ pointerId, pointerType: "touch", x, y });
const T0 = 1000;

// --- Esikler ve kademe ------------------------------------------------------------

test("esikler: hucre cinsinden, ekran tabaniyla; sira min < orta < yuksek", () => {
  const plain = getSkillGestureThresholds(GRID, 1);
  assert.equal(plain.min, METAL_SHIELD_DRAG_THRESHOLD_CELLS * GRID, "esik Metal Kalkan esigiyle ayni degil");
  assert.equal(plain.medium, SKILL_GESTURE_MEDIUM_CELLS * GRID);
  assert.equal(plain.high, SKILL_GESTURE_HIGH_CELLS * GRID);
  assert.ok(plain.barMax > plain.high);
  // Kucuk hucre / uzak kamera: ekran tabani devreye giriyor.
  const tiny = getSkillGestureThresholds(4, 1);
  assert.equal(tiny.min, SKILL_GESTURE_MIN_SCREEN_PX);
  assert.equal(tiny.medium, SKILL_GESTURE_MEDIUM_SCREEN_PX);
  assert.equal(tiny.high, SKILL_GESTURE_HIGH_SCREEN_PX);
  for (const [grid, wpp] of [[40, 1], [4, 1], [34, 2.5], [60, 0.3], [0, 0], [40, Number.NaN]]) {
    const t = getSkillGestureThresholds(grid, wpp);
    assert.ok(t.min > 0 && t.min < t.medium && t.medium < t.high, `sira bozuk (${grid}, ${wpp})`);
  }
});

test("kademe: esigin altinda iptal, sonra DUSUK / ORTA / YUKSEK", () => {
  const t = getSkillGestureThresholds(GRID, 1);
  assert.equal(getSkillGestureTier(0, t), undefined);
  assert.equal(getSkillGestureTier(t.min - 0.01, t), undefined, "esigin alti iptal degil");
  assert.equal(getSkillGestureTier(t.min, t), "small");
  assert.equal(getSkillGestureTier(t.medium - 0.01, t), "small");
  assert.equal(getSkillGestureTier(t.medium, t), "medium");
  assert.equal(getSkillGestureTier(t.high - 0.01, t), "medium");
  assert.equal(getSkillGestureTier(t.high, t), "big");
  assert.equal(getSkillGestureTier(t.high * 5, t), "big");
  assert.equal(getSkillGestureTier(Number.NaN, t), undefined);
  assert.equal(getSkillGestureTierLabel("small"), "DÜŞÜK");
  assert.equal(getSkillGestureTierLabel("medium"), "ORTA");
  assert.equal(getSkillGestureTierLabel("big"), "YÜKSEK");
});

test("tutma suresi ve payi duvar cizgisinin halkasiyla ayni; jest -> yuva sabit", () => {
  assert.equal(SKILL_GESTURE_HOLD_MS, WALL_LINE_DWELL_MS);
  assert.equal(SKILL_GESTURE_HOLD_MS, 450);
  assert.equal(SKILL_GESTURE_HOLD_SLOP_SCREEN_PX, 8);
  assert.deepEqual({ ...SKILL_GESTURE_SLOT }, { hold: 0, drag: 1, two: 2 });
});

// --- Siniflandirma ------------------------------------------------------------------

test("dokunus: kimildamadan ya da pay icinde birakmak hicbir sey atmaz, dokunus yutulmaz", () => {
  let g = beginSkillGesture(undefined, touch(100, 100), T0, ctx());
  assert.equal(g.phase, "pending");
  let end = endSkillGesture(g, touch(100, 100), T0 + 80, ctx());
  assert.deepEqual([end.cast, end.consumed, end.gesture], [undefined, false, undefined]);
  // Pay icinde kucuk titreme.
  g = beginSkillGesture(undefined, touch(100, 100), T0, ctx());
  g = moveSkillGesture(g, touch(104, 103), T0 + 50, ctx());
  assert.equal(g.phase, "pending");
  end = endSkillGesture(g, touch(104, 103), T0 + 90, ctx());
  assert.equal(end.consumed, false);
  assert.equal(end.cast, undefined);
});

test("surukleme (2. beceri): tutma dolmadan kayan parmak; esik ustunde birakis atar", () => {
  let g = beginSkillGesture(undefined, touch(100, 100), T0, ctx());
  g = moveSkillGesture(g, touch(112, 100), T0 + 60, ctx());
  assert.equal(g.phase, "drag", "paydan cikan parmak surukleme degil");
  assert.equal(g.active, false, "esigin altinda onizleme acildi");
  g = moveSkillGesture(g, touch(100 + 3 * GRID, 100), T0 + 120, ctx());
  assert.equal(g.active, true);
  // Sonradan gecen zaman suruklemeyi tutmaya cevirmez.
  g = tickSkillGesture(g, T0 + 2000, ctx());
  assert.equal(g.phase, "drag");
  const end = endSkillGesture(g, touch(100 + 3 * GRID, 100), T0 + 2100, ctx());
  assert.equal(end.consumed, true);
  assert.deepEqual(end.cast, { slot: 1, kind: "drag", startX: 100, startY: 100, x: 100 + 3 * GRID, y: 100, length: 3 * GRID });
});

test("surukleme: esigi gecip geri donmek iptal (atmaz, dokunus da sayilmaz); hic gecmeyen dokunustur", () => {
  let g = beginSkillGesture(undefined, touch(100, 100), T0, ctx());
  g = moveSkillGesture(g, touch(100 + 2 * GRID, 100), T0 + 60, ctx());
  g = moveSkillGesture(g, touch(103, 100), T0 + 120, ctx());
  let end = endSkillGesture(g, touch(103, 100), T0 + 150, ctx());
  assert.deepEqual([end.cast, end.consumed], [undefined, true]);
  // Paydan cikti ama esigi (0,6 hucre = 24) hic gecmedi: siradan dokunus.
  g = beginSkillGesture(undefined, touch(100, 100), T0, ctx());
  g = moveSkillGesture(g, touch(115, 100), T0 + 60, ctx());
  end = endSkillGesture(g, touch(115, 100), T0 + 90, ctx());
  assert.deepEqual([end.cast, end.consumed], [undefined, false]);
});

test("basili tut + surukle (1. beceri): halka dolunca cizgi tutulan noktadan baslar", () => {
  let g = beginSkillGesture(undefined, touch(200, 300), T0, ctx());
  assert.equal(getSkillGestureHoldProgress(g, T0 + 50), undefined, "halka hemen cikti (her dokunusta yanip soner)");
  assert.ok(getSkillGestureHoldProgress(g, T0 + 225) > 0.4);
  g = moveSkillGesture(g, touch(204, 302), T0 + 200, ctx());
  g = tickSkillGesture(g, T0 + SKILL_GESTURE_HOLD_MS - 1, ctx());
  assert.equal(g.phase, "pending");
  g = tickSkillGesture(g, T0 + SKILL_GESTURE_HOLD_MS, ctx());
  assert.equal(g.phase, "hold");
  assert.equal(getSkillGestureHoldProgress(g, T0 + 600), 1);
  g = moveSkillGesture(g, touch(200, 300 - 4 * GRID), T0 + 700, ctx());
  assert.equal(g.active, true);
  const end = endSkillGesture(g, touch(200, 300 - 4 * GRID), T0 + 800, ctx());
  assert.equal(end.cast.slot, 0);
  assert.equal(end.cast.kind, "hold");
  assert.deepEqual([end.cast.startX, end.cast.startY, end.cast.x, end.cast.y], [200, 300, 200, 300 - 4 * GRID]);
  assert.equal(end.consumed, true);
});

test("basili tut: kare gelmeden harekette de sure sayilir; suruklemeden birakmak beceri atmaz, dokunus gibi isler", () => {
  let g = beginSkillGesture(undefined, touch(200, 300), T0, ctx());
  // Kare (tick) hic gelmedi; parmak sure dolduktan sonra kimildadi.
  g = moveSkillGesture(g, touch(200 + 3 * GRID, 300), T0 + SKILL_GESTURE_HOLD_MS + 10, ctx());
  assert.equal(g.phase, "hold");
  // Suruklemeden birakis.
  g = beginSkillGesture(undefined, touch(200, 300), T0, ctx());
  g = tickSkillGesture(g, T0 + 600, ctx());
  const end = endSkillGesture(g, touch(201, 300), T0 + 700, ctx());
  assert.deepEqual([end.cast, end.consumed], [undefined, false]);
});

test("1. becerinin jesti yoksa tutma asamasi hic yok; uzun basip surukleme 2. beceri", () => {
  const noHold = ctx({ slots: slots([{ enabled: false }]) });
  let g = beginSkillGesture(undefined, touch(0, 0), T0, noHold);
  g = tickSkillGesture(g, T0 + 900, noHold);
  assert.equal(g.phase, "pending", "jestsiz 1. beceride tutma asamasina gecti");
  g = moveSkillGesture(g, touch(2 * GRID, 0), T0 + 950, noHold);
  assert.equal(g.phase, "drag");
});

test("iki parmak (3. beceri): pencere icinde ikinci parmak; olcu orta noktadan, ikinci birakis yutulur", () => {
  let g = beginSkillGesture(undefined, touch(100, 100, 1), T0, ctx());
  g = beginSkillGesture(g, touch(140, 100, 2), T0 + 120, ctx());
  assert.equal(g.phase, "two");
  assert.deepEqual([g.startX, g.startY], [120, 100]);
  g = moveSkillGesture(g, touch(100, 100 + 4 * GRID, 1), T0 + 200, ctx());
  g = moveSkillGesture(g, touch(140, 100 + 4 * GRID, 2), T0 + 220, ctx());
  assert.deepEqual([g.endX, g.endY, g.active], [120, 100 + 4 * GRID, true]);
  // Tutma suresi iki parmagi tutmaya cevirmez.
  g = tickSkillGesture(g, T0 + 2000, ctx());
  assert.equal(g.phase, "two");
  const first = endSkillGesture(g, touch(140, 100 + 4 * GRID, 2), T0 + 300, ctx());
  assert.equal(first.consumed, true);
  assert.deepEqual(first.cast, { slot: 2, kind: "two", startX: 120, startY: 100, x: 120, y: 100 + 4 * GRID, length: 4 * GRID });
  assert.equal(first.gesture.phase, "dead");
  const second = endSkillGesture(first.gesture, touch(100, 100 + 4 * GRID, 1), T0 + 320, ctx());
  assert.deepEqual([second.cast, second.consumed, second.gesture], [undefined, true, undefined], "ikinci parmagin birakisi dokunus sayildi");
});

test("iki parmak: kimildamadan kalkan iki parmak hicbir sey atmaz ama dokunus da sayilmaz", () => {
  let g = beginSkillGesture(undefined, touch(100, 100, 1), T0, ctx());
  g = beginSkillGesture(g, touch(130, 100, 2), T0 + 40, ctx());
  const first = endSkillGesture(g, touch(130, 100, 2), T0 + 100, ctx());
  assert.deepEqual([first.cast, first.consumed], [undefined, true]);
  assert.equal(endSkillGesture(first.gesture, touch(100, 100, 1), T0 + 110, ctx()).consumed, true);
});

test("iki parmak: gec gelen ya da surukleme baslamisken gelen ikinci parmak jesti oldurur", () => {
  // Pencere disi.
  let g = beginSkillGesture(undefined, touch(100, 100, 1), T0, ctx());
  g = beginSkillGesture(g, touch(140, 100, 2), T0 + SKILL_GESTURE_TWO_FINGER_WINDOW_MS + 1, ctx());
  assert.equal(g.phase, "dead");
  let end = endSkillGesture(g, touch(140, 100, 2), T0 + 500, ctx());
  assert.deepEqual([end.cast, end.consumed], [undefined, true]);
  end = endSkillGesture(end.gesture, touch(100, 100, 1), T0 + 520, ctx());
  assert.deepEqual([end.cast, end.consumed, end.gesture], [undefined, true, undefined]);
  // Ilk parmak suruklemeye gecmisken.
  g = beginSkillGesture(undefined, touch(100, 100, 1), T0, ctx());
  g = moveSkillGesture(g, touch(100 + 2 * GRID, 100, 1), T0 + 60, ctx());
  g = beginSkillGesture(g, touch(300, 300, 2), T0 + 100, ctx());
  assert.equal(g.phase, "dead");
  assert.equal(endSkillGesture(g, touch(100 + 2 * GRID, 100, 1), T0 + 200, ctx()).cast, undefined);
  // 3. becerinin jesti yoksa ikinci parmak iki parmak jesti baslatmaz.
  const noTwo = ctx({ slots: slots([{}, {}, { enabled: false }]) });
  g = beginSkillGesture(undefined, touch(100, 100, 1), T0, noTwo);
  g = beginSkillGesture(g, touch(140, 100, 2), T0 + 50, noTwo);
  assert.equal(g.phase, "dead");
  // Ucuncu parmak iki parmak jestini oldurur.
  g = beginSkillGesture(undefined, touch(100, 100, 1), T0, ctx());
  g = beginSkillGesture(g, touch(140, 100, 2), T0 + 50, ctx());
  g = beginSkillGesture(g, touch(180, 100, 3), T0 + 80, ctx());
  assert.equal(g.phase, "dead");
});

test("fare: ana tus tutma/surukleme, sag tus 3. beceri, orta tus hicbir sey", () => {
  const mouse = (x, y, button) => ({ pointerId: 1, pointerType: "mouse", button, x, y });
  let g = beginSkillGesture(undefined, mouse(50, 50, 2), T0, ctx());
  assert.equal(g.phase, "two");
  g = moveSkillGesture(g, mouse(50 + 5 * GRID, 50, 2), T0 + 100, ctx());
  const end = endSkillGesture(g, mouse(50 + 5 * GRID, 50, 2), T0 + 150, ctx());
  assert.equal(end.cast.slot, 2);
  assert.equal(end.cast.length, 5 * GRID);
  assert.equal(beginSkillGesture(undefined, mouse(50, 50, 1), T0, ctx()), undefined);
  assert.equal(beginSkillGesture(undefined, mouse(50, 50, 0), T0, ctx()).phase, "pending");
  assert.equal(beginSkillGesture(undefined, mouse(50, 50, 2), T0, ctx({ slots: slots([{}, {}, { enabled: false }]) })), undefined);
});

// --- Mesgul kip, bekleme, harita disi ---------------------------------------------------

test("mesgul kipte (hedef secimi, yerlestirme, surukleme) jest hic baslamaz; araya giren kip jesti oldurur", () => {
  assert.equal(beginSkillGesture(undefined, touch(10, 10), T0, ctx({ busy: true })), undefined);
  assert.equal(beginSkillGesture(undefined, touch(10, 10), T0, ctx({ inside: false })), undefined);
  assert.equal(beginSkillGesture(undefined, touch(10, 10), T0, ctx({ slots: slots([{ enabled: false }, { enabled: false }, { enabled: false }]) })), undefined);
  // Surerken kip acildi.
  let g = beginSkillGesture(undefined, touch(10, 10), T0, ctx());
  g = moveSkillGesture(g, touch(10 + 3 * GRID, 10), T0 + 50, ctx());
  g = tickSkillGesture(g, T0 + 60, ctx({ busy: true }));
  assert.equal(g.phase, "dead");
  let end = endSkillGesture(g, touch(10 + 3 * GRID, 10), T0 + 90, ctx());
  assert.deepEqual([end.cast, end.consumed], [undefined, true]);
  // Harita disina tasan parmak.
  g = beginSkillGesture(undefined, touch(10, 10), T0, ctx());
  g = moveSkillGesture(g, touch(10 + 3 * GRID, 10), T0 + 50, ctx());
  g = moveSkillGesture(g, touch(-50, 10), T0 + 80, ctx({ inside: false }));
  assert.equal(g.phase, "dead");
  end = endSkillGesture(g, touch(-50, 10), T0 + 90, ctx());
  assert.equal(end.cast, undefined);
});

test("bekleme: esik gecilse de atmaz; birakis bekleme bildirimi verir ve dokunus sayilmaz", () => {
  const cooling = ctx({ slots: slots([{}, { cooldownSeconds: 4.2 }]) });
  let g = beginSkillGesture(undefined, touch(0, 0), T0, cooling);
  g = moveSkillGesture(g, touch(3 * GRID, 0), T0 + 50, cooling);
  assert.equal(g.active, true, "beklemede onizleme (soluk) yok");
  const end = endSkillGesture(g, touch(3 * GRID, 0), T0 + 100, cooling);
  assert.equal(end.cast, undefined);
  assert.equal(end.consumed, true);
  assert.deepEqual([end.cooldownSlot, end.cooldownSeconds], [1, 5]);
});

test("Metal Kalkan yuvasi 'external': surukleme siniflanir ama atis ve yutma Metal Kalkan'in", () => {
  const shield = ctx({ slots: slots([{}, { external: true }]) });
  let g = beginSkillGesture(undefined, touch(0, 0), T0, shield);
  g = moveSkillGesture(g, touch(3 * GRID, 0), T0 + 50, shield);
  assert.equal(g.phase, "drag");
  const end = endSkillGesture(g, touch(3 * GRID, 0), T0 + 90, shield);
  assert.deepEqual([end.cast, end.consumed], [undefined, false]);
});

test("dusen parmak (pointercancel): jest atmadan kapanir, kalan parmagin birakisi yutulur", () => {
  let g = beginSkillGesture(undefined, touch(0, 0, 1), T0, ctx());
  g = moveSkillGesture(g, touch(3 * GRID, 0, 1), T0 + 50, ctx());
  assert.equal(dropSkillGesturePointer(g, 1), undefined);
  assert.equal(dropSkillGesturePointer(g, 9), g, "baska parmagin dusmesi jesti etkiledi");
  g = beginSkillGesture(undefined, touch(0, 0, 1), T0, ctx());
  g = beginSkillGesture(g, touch(40, 0, 2), T0 + 30, ctx());
  g = dropSkillGesturePointer(g, 2);
  assert.equal(g.phase, "dead");
  assert.equal(endSkillGesture(g, touch(0, 0, 1), T0 + 90, ctx()).consumed, true);
});

// --- Operatorler ------------------------------------------------------------------------

test("operator eslemesi: AttackLord alan/kalkan/dusman, ZentaX uc kademe, Melis'in kule isteyeni jestsiz", () => {
  assert.deepEqual([...getSkillGestureTargets("warrior")], ["area", "shield", "enemy"]);
  assert.deepEqual([...getSkillGestureTargets("zeynep")], ["tier", "tier", "tier"]);
  assert.deepEqual([...getSkillGestureTargets("archer")], ["area", "none", "cast"]);
  assert.deepEqual([...getSkillGestureTargets("onur")], ["cast", "cast", "cast"]);
  assert.deepEqual([...getSkillGestureTargets(undefined)], ["none", "none", "none"]);
});

test("ZentaX kademe bedeli sunucuyla ayni sayi", () => {
  const server = readSource("apps/server/src/rooms/MatchRoom.ts");
  const read = (name) => Number(server.match(new RegExp(`const ${name} = (\\d+);`))?.[1]);
  assert.deepEqual({ ...ZEYNEP_COMMAND_TIER_COST }, {
    small: read("ZEYNEP_SMALL_COMMAND_COST"),
    medium: read("ZEYNEP_MEDIUM_COMMAND_COST"),
    big: read("ZEYNEP_BIG_COMMAND_COST")
  });
});

// --- Istemci baglantisi ------------------------------------------------------------------

test("istemci: jest paylasilan makineden, sekmedeki dugmeyle ayni useSkill mesajlariyla", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  for (const call of ["beginSkillGesture(", "moveSkillGesture(", "tickSkillGesture(", "endSkillGesture(", "dropSkillGesturePointer("]) {
    assert.ok(scene.includes(call), `sahne ${call} cagirmiyor`);
  }
  const cast = scene.slice(scene.indexOf("private castMapSkillGesture("), scene.indexOf("private showSkillGestureCooldownNotice("));
  assert.match(cast, /send\("useSkill", \{ slot: cast\.slot, x: point\.x, y: point\.y \}\)/, "alan becerisi noktayla gitmiyor");
  assert.match(cast, /send\("useSkill", \{ slot: ATAKAN_EXECUTE_SLOT, enemyId: enemy\.id \}\)/, "Execute dusmanla gitmiyor");
  assert.match(cast, /send\("useSkill", \{ slot: cast\.slot, commandTier: tier \}\)/, "ZentaX kademesi gitmiyor");
  assert.ok(cast.includes("this.findEnemyAt(cast.x, cast.y)"), "Execute birakis noktasindaki dusmani secmiyor");
  assert.ok(cast.includes("isExecuteImmune("), "bagisik hedefe istek gidiyor");
  assert.ok(cast.includes("ZEYNEP_COMMAND_TIER_COST[tier]") && cast.includes("gestureNoReputation"), "yetmeyen itibar kontrolu yok");
  // Basis, hareket ve birakis haritanin tek giris yolundan.
  const down = scene.slice(scene.indexOf("private handleMapPointerDown("), scene.indexOf("private describeTapOutcome("));
  assert.ok(down.indexOf("this.beginShieldGesture(") < down.indexOf("this.beginMapSkillGesture("), "beceri jesti kalkandan once basliyor");
  const move = scene.slice(scene.indexOf("private handleMapPointerMove("), scene.indexOf("private logTap("));
  assert.ok(move.includes("this.moveMapSkillGesture(pointer)"));
  // Birakista iki jest de durumunu kapatiyor; kalkan yutsa bile.
  const tap = scene.slice(scene.indexOf("private handleMapPointer(pointer"), scene.indexOf("private handleSkillButton("));
  const shieldAt = tap.indexOf("const shieldConsumed = this.finishShieldGesture(pointer);");
  const skillAt = tap.indexOf("const skillGestureConsumed = this.finishMapSkillGesture(pointer);");
  assert.ok(shieldAt >= 0 && skillAt > shieldAt, "birakis iki jeste de gitmiyor");
  assert.ok(skillAt < tap.indexOf("this.resolveWorkerPickTap(pointer)"), "jest birakisi dokunus dallarindan sonra");
  // Mesgul kip: kartin hedefi dahil.
  const blocked = scene.slice(scene.indexOf("private isShieldGestureBlocked()"), scene.indexOf("private isShieldPressOnControl("));
  for (const mode of ["pendingAction", "isGuidanceDragging", "draggedTowerDefinition", "workerPick", "pendingUltimateColumn", "pendingShopPlacement", "workerBanMode", "cardTargetPick"]) {
    assert.ok(blocked.includes(`this.${mode}`), `${mode} jesti kapatmiyor`);
  }
  // Iptal parmak bazinda; sag tus menusu kapali; kare basina tik.
  assert.ok(scene.includes("this.dropMapSkillGesturePointer(event.pointerId);"));
  assert.ok(scene.includes(`canvas.addEventListener("contextmenu", (event) => event.preventDefault());`));
  assert.ok(scene.includes("this.tickMapSkillGesture();"));
  // Sekmedeki dugmeler ve ZentaX kademe secici yerinde.
  assert.ok(scene.includes(`case "useZeynepTier":`) && scene.includes("this.showZeynepTierChoices(index, reputation);"));
});

test("sekme: her becerinin altinda haritadaki jesti; iki dilde", () => {
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  const hud = readSource("apps/web/src/game-control-ui.ts");
  const locale = readSource("apps/web/src/locales/areas/scene.ts");
  assert.ok(scene.includes("...(mapHint && !shieldGesture ? { mapHint } : {}),"));
  assert.ok(hud.includes("mapHint?: string;") && hud.includes("hint.textContent = skill.mapHint;"));
  for (const line of [
    `"scene.skill.mapHintHold": "Haritada: basılı tut + sürükle"`,
    `"scene.skill.mapHintDrag": "Haritada: sürükle"`,
    `"scene.skill.mapHintTwo": "Haritada: iki parmakla sürükle"`,
    `"scene.skill.mapHintHold": "On map: hold + drag"`,
    `"scene.skill.mapHintDrag": "On map: drag"`,
    `"scene.skill.mapHintTwo": "On map: two-finger drag"`,
    `"scene.skill.gestureTierCost": "{tier} · {cost} İtibar"`,
    `"scene.skill.gestureTierCost": "{tier} · {cost} Prestige"`
  ]) {
    assert.ok(locale.includes(line), `metin yok: ${line}`);
  }
});

// --- Cizim -------------------------------------------------------------------------------

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
const hue = (color) => {
  const [r, g, b] = channels(color);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

test("kademe cubugu: DUSUK camgobegi-mavi, ORTA kehribar, YUKSEK kizil-turuncu; hepsi yere indirilmis", async () => {
  const { SKILL_TIER_COLORS, SkillGestureView } = await importWebModule("apps/web/src/vfx/skill-gesture.ts");
  const h = { small: hue(SKILL_TIER_COLORS.small), medium: hue(SKILL_TIER_COLORS.medium), big: hue(SKILL_TIER_COLORS.big) };
  assert.ok(h.small >= 185 && h.small <= 215, `DUSUK mavi degil (${h.small})`);
  assert.ok(h.medium >= 30 && h.medium <= 48, `ORTA kehribar degil (${h.medium})`);
  assert.ok(h.big >= 8 && h.big <= 25, `YUKSEK kizil-turuncu degil (${h.big})`);
  const gfx = createRecorder();
  const scene = { add: { graphics: () => gfx, text: () => createRecorder() } };
  const view = new SkillGestureView(scene, 56);
  const thresholds = getSkillGestureThresholds(GRID, 1);
  for (const tier of [undefined, "small", "medium", "big"]) {
    for (const affordable of [true, false]) {
      for (const ready of [true, false]) {
        view.drawTierBar({ startX: 0, startY: 0, endX: 300, endY: 40, thresholds, tier, affordable, ready }, GRID);
      }
    }
  }
  view.drawHoldRing(10, 10, 0.5, 30, true);
  view.drawHoldRing(10, 10, 0.5, 30, false);
  view.drawTrace(0, 0, 100, 0, true, true, GRID);
  view.drawEnemyReticle(50, 50, 34, true, true);
  view.drawEnemyReticle(50, 50, 34, false, false);
  const colors = gfx.calls.filter(([name]) => name === "lineStyle" || name === "fillStyle").map(([name, a, b]) => (name === "lineStyle" ? b : a));
  assert.ok(colors.length > 20);
  for (const color of colors) {
    // Halka duvar cizgisinin turkuazi (ayni dil, ayni renk); gerisi yere indirilmis.
    if (color === 0x67e8f9) continue;
    assert.ok(grounded(color), `pastel/neon renk: #${color.toString(16)}`);
  }
  // Parilti yok: yalnizca cizgi, halka, dikdortgen.
  const methods = new Set(gfx.calls.map(([name]) => name));
  for (const banned of ["fillGradientStyle", "setBlendMode", "fillTriangle"]) assert.ok(!methods.has(banned), `${banned} kullaniliyor`);
});

test("kademe cubugu: yetmeyen bedelde uc kirmizi carpi; esigin altinda kademe rengi yok", async () => {
  const { SKILL_TIER_COLORS, SKILL_GESTURE_DENY_COLOR, SkillGestureView } = await importWebModule("apps/web/src/vfx/skill-gesture.ts");
  const thresholds = getSkillGestureThresholds(GRID, 1);
  const draw = (bar) => {
    const gfx = createRecorder();
    const view = new SkillGestureView({ add: { graphics: () => gfx, text: () => createRecorder() } }, 56);
    view.drawTierBar({ startX: 0, startY: 0, endX: 300, endY: 0, thresholds, affordable: true, ready: true, ...bar }, GRID);
    return gfx.calls.filter(([name]) => name === "lineStyle").map(([, , color]) => color);
  };
  assert.ok(draw({ tier: "big" }).includes(SKILL_TIER_COLORS.big));
  const denied = draw({ tier: "big", affordable: false });
  assert.ok(denied.includes(SKILL_GESTURE_DENY_COLOR), "yetmeyen bedelde carpi yok");
  assert.ok(!denied.includes(SKILL_TIER_COLORS.big), "yetmeyen bedel kademe renginde");
  const cancel = draw({ tier: undefined, endX: 10 });
  for (const color of Object.values(SKILL_TIER_COLORS)) assert.ok(!cancel.includes(color), "esigin altinda kademe rengi");
});
