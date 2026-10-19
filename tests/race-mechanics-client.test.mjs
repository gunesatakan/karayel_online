/**
 * Irk mekanikleri, istemci tarafi: telin okunmasi (eski sunucu ve bozuk
 * veri), cizimlerin sert dili (doygunluk siniri), ilk gorulme bildirimi,
 * kodeks ve bildirim metinleri (TR/EN) ve sahnenin baglantilari.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RACE_MECHANIC_IDS, RACE_TRAIT_CODES, getEnemyBodyScale, getSoulDrawerMultipliers } from "../packages/shared/dist/index.js";
import { createRecorder, importWebModule } from "./helpers/web-module.mjs";

const race = await importWebModule("apps/web/src/vfx/race-traits.ts");
const gallery = await importWebModule("apps/web/src/vfx/race-gallery.ts");
const { trScene, enScene } = await importWebModule("apps/web/src/locales/areas/scene.ts");
const { trMenu, enMenu } = await importWebModule("apps/web/src/locales/areas/menu.ts");

const channels = (color) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map((value) => value / 255);
function hsl(color) {
  const [r, g, b] = channels(color);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}
// tests/vfx-hard-language.test.mjs ile ayni olcu: pastel bant yok.
const grounded = (color) => {
  const { s, l } = hsl(color);
  if (l <= 0.22 || l >= 0.9) return true;
  if (l > 0.7) return s <= 0.35;
  return s <= 0.625;
};
const colorsOf = (...recorders) => recorders.flatMap((recorder) => recorder.calls
  .filter(([name]) => name === "lineStyle" || name === "fillStyle")
  .map(([name, a, b]) => (name === "lineStyle" ? b : a)));

test("tel okunuyor: alan yoksa nesne yok; bozuk ve bilinmeyen alanlar yok sayılıyor; yığınlar sınırlı", () => {
  assert.equal(race.readRaceTraitView({ id: "e1", x: 1 }), undefined);
  const view = race.readRaceTraitView({ rt: RACE_TRAIT_CODES.burrower, bu: [4, 9, 1234], ga: 999, ds: -3, ph: "yes", fj: [1, "x", 3] });
  assert.equal(view.trait, "burrower");
  assert.deepEqual(view.burrow, { col: 4, row: 9, emergeAt: 1234 });
  assert.equal(view.petrify, 200);
  assert.equal(view.drawer, 0);
  assert.equal(view.phased, false);
  assert.equal(view.fold, undefined);
  assert.equal(race.readRaceTraitView({ rt: 42 }).trait, undefined);
  const drawer = race.readRaceTraitView({ rt: RACE_TRAIT_CODES.drawer, ds: 4 });
  // Govdenin boyu paylasilan `getEnemyBodyScale`tan (sunucunun isabet govdesiyle
  // ayni fonksiyon); istemcinin okudugu yigin ona gidiyor.
  assert.equal(getEnemyBodyScale({ ds: drawer.drawer }), getSoulDrawerMultipliers(4).size);
  assert.equal(race.getRaceMaxHpScale(drawer), getSoulDrawerMultipliers(4).hp);
  assert.equal(getEnemyBodyScale({ ds: undefined }), 1);
});

test("mesaj temizliği: race:block ve race:soul bozuk veride düşüyor", () => {
  assert.deepEqual(race.sanitizeMekaBlockMessage({ id: 3, a: [0.5, 2, -1, "x", 0.25] }), { id: 3, a: [0.5, 0.25] });
  for (const raw of [undefined, null, 4, { id: "3", a: [0.5] }, { id: 3, a: [] }, { id: 3, a: "0.5" }]) {
    assert.equal(race.sanitizeMekaBlockMessage(raw), undefined);
  }
  assert.deepEqual(race.sanitizeSoulDrawMessage({ x: 1, y: 2, to: "e5", n: 99 }), { x: 1, y: 2, to: "e5", n: 10 });
  assert.equal(race.sanitizeSoulDrawMessage({ x: 1, y: 2, to: "" }), undefined);
  assert.equal(race.sanitizeSoulDrawMessage({ x: Number.NaN, y: 2, to: "e5" }), undefined);
  const out = [];
  race.readMekaShields([{ id: 1, x1: 0, y1: 0, x2: 1, y2: 1, ms: 100 }, { id: 2, x1: 0 }, null], out);
  assert.equal(out.length, 1);
  assert.equal(race.readMekaShields(undefined, out).length, 0);
});

test("zamanlama: çatlak çıkıştan 1,5 sn (oyun) önce başlıyor, katlanma uyarısı 0,8 sn önce", () => {
  const emergeAt = 100_000;
  const start = emergeAt - race.getBurrowTelegraphWallMs();
  assert.equal(race.getBurrowTelegraphProgress(emergeAt, start - 1), undefined);
  assert.equal(race.getBurrowTelegraphProgress(emergeAt, start), 0);
  assert.equal(race.getBurrowTelegraphProgress(emergeAt, emergeAt), 1);
  assert.equal(race.getFoldWarningProgress(1000, 1000), 1);
  assert.equal(race.getFoldWarningProgress(1000, 0), 0);
});

test("bildirim: mekanik başına maçta bir kez; görünen mekanik doğru seçiliyor", () => {
  const notices = new race.RaceMechanicNotices();
  assert.equal(notices.note("burrower"), true);
  assert.equal(notices.note("burrower"), false);
  assert.equal(notices.note("phaser"), true);
  notices.reset();
  assert.equal(notices.note("burrower"), true);
  const view = (fields) => race.readRaceTraitView(fields);
  assert.equal(race.getVisibleRaceMechanic(view({ ga: 3 })), "petrify");
  assert.equal(race.getVisibleRaceMechanic(view({ rt: 2, bu: [1, 1, 1] })), "burrower");
  assert.equal(race.getVisibleRaceMechanic(view({ rt: 4, ph: true })), "phaser");
  assert.equal(race.getVisibleRaceMechanic(view({ rt: 4 })), undefined, "fazda olmayan faz bildirildi");
  assert.equal(race.getVisibleRaceMechanic(view({ rt: 5, fj: [1, 1, 1] })), "folder");
  assert.equal(race.getVisibleRaceMechanic(view({ rt: 3 })), "drawer");
});

test("metinler: her mekaniğin bildirimi ve her ırkın kodeks satırı TR ve EN; Kazıcı bildirimi", () => {
  for (const id of RACE_MECHANIC_IDS) {
    const key = race.RACE_MECHANIC_NOTICE_KEYS[id];
    assert.ok(trScene[key]?.length > 10, `${key} TR yok`);
    assert.ok(enScene[key]?.length > 10, `${key} EN yok`);
  }
  assert.equal(trScene["scene.race.burrower"], "Kazıcı böcekler yer altından ilerliyor");
  assert.equal(enScene["scene.race.burrower"], "Burrowers tunnel under your maze");
  for (const name of ["golem", "meka", "spaceBug", "fallen", "fourthDimensional"]) {
    assert.ok(trMenu[`menu.bestiary.raceTrait.${name}`]?.length > 40, `${name} kodeks TR yok`);
    assert.ok(enMenu[`menu.bestiary.raceTrait.${name}`]?.length > 40, `${name} kodeks EN yok`);
  }
});

test("çizimler sert dilde: renkler yere indirilmiş, gecici efektler ve kalkan çizimi doygun değil", () => {
  for (const color of race.RACE_TRAIT_COLORS) assert.ok(grounded(color), `renk ${color.toString(16)} doygun`);
  const g = createRecorder();
  const options = { now: 1234, reducedMotion: false };
  race.drawPetrifyPlating(g, 10, 10, 30, 120, 7);
  race.drawBurrowFurrow(g, 10, 10, 30, 3, options);
  race.drawBurrowCracks(g, 10, 10, 26, 0.6, 9);
  race.drawSoulDrawerMark(g, 10, 10, 30, 7);
  race.drawPhaseGhost(g, 10, 10, 30, 5, options);
  race.drawFoldWarning(g, 10, 10, 26, 0.5);
  race.drawMekaShield(g, { id: 1, x1: 0, y1: 0, x2: 40, y2: 0, ms: 2000, ox: 20, oy: -40 }, 0.5, 26, options);
  race.drawMekaShield(g, { id: 1, x1: 0, y1: 0, x2: 40, y2: 0, ms: 2000 }, undefined, 26, options);
  const transients = new race.RaceTransientEffects();
  for (const kind of Object.values(race.RACE_TRANSIENT)) transients.add(kind, 5, 5, 0, 3, 4, "e1");
  transients.draw(g, 26, 100, { reducedMotion: false, resolve: () => ({ x: 30, y: 30 }) });
  const impacts = new race.MekaShieldImpacts();
  impacts.add({ x1: 0, y1: 0, x2: 40, y2: 0 }, 0.5, 0);
  impacts.draw(g, 26, 100, false);
  const colors = colorsOf(g);
  assert.ok(colors.length > 30);
  for (const color of colors) assert.ok(grounded(color), `cizim rengi ${color.toString(16)} doygun`);
  // Yigin buyudukce levhalar artiyor (Taslasma kalinlasiyor).
  const az = createRecorder();
  const cok = createRecorder();
  race.drawPetrifyPlating(az, 0, 0, 30, 10, 1);
  race.drawPetrifyPlating(cok, 0, 0, 30, 200, 1);
  assert.ok(cok.calls.length > az.calls.length);
  const yok = createRecorder();
  race.drawPetrifyPlating(yok, 0, 0, 30, 0, 1);
  assert.equal(yok.calls.length, 0);
});

test("galeri: Irklar kipi altı mekaniği gösteriyor", () => {
  assert.deepEqual(gallery.RACE_GALLERY_PAGES.map((page) => page.id), ["petrify", "thrower", "burrower", "drawer", "phaser", "folder"]);
});

test("sahne bağlantıları: mesajlar dinleniyor, ırk yüzeyi çiziliyor, gizli ve fazdaki düşman infaz dokunuşunda atlanıyor", async () => {
  const source = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(source, /room\.onMessage\("race:block"/);
  assert.match(source, /room\.onMessage\("race:soul"/);
  assert.match(source, /this\.renderRaceScene\(frame\.snapshot\.mshields, now\)/);
  assert.match(source, /this\.renderEnemyRaceTrait\(/);
  assert.match(source, /mover\.raceUntargetable\) continue;/);
  assert.match(source, /this\.raceNotices\.reset\(\)/);
  const menu = (await readFile(new URL("../apps/web/src/menu-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(menu, /menu\.bestiary\.raceTrait\./);
});
