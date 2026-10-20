/**
 * Kule panelinde Sunucu bilgisi (apps/web/src/tower-sheet.ts "Bilgi birikimi").
 *
 * Sahibin istegi (2026-10-20): Sunucu'nun bilgi biriktirmesi ve biriken
 * bilgiye gore verdigi artis panelde acikca, okunur gorunsun.
 * - Sunucu'nun panelinde bolum en ustte; bes turun hepsi bir cubuk (sifirlar
 *   dahil): tur -> etki, artis, bilgi sayisi, sonraki oldurmenin katacagi pay;
 *   ust sayilarda en yuksek bilgi ve bag sayisi; nasil toplandigi ve seviyenin
 *   agirligi notta.
 * - Bagli kulede bu kulenin aldigi artislar; kulenin yapmadigi etkiye giden
 *   artis "isliyor" diye gosterilmiyor (sunucuyla ayni kural).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const web = await importWebModule("tests/fixtures/tower-ammo-entry.ts");
const { buildTowerSheetModel, setLocaleForTest, installCatalogLocale } = web;
installCatalogLocale();
const shared = await import("../packages/shared/dist/index.js");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const entry = (type, kills, level = 1) => ({
  type,
  effect: shared.SERVER_KNOWLEDGE_EFFECTS[type],
  kills,
  bonus: shared.getServerKnowledgeBonus(kills, level),
  next: shared.getServerKnowledgeBonus(kills + 1, level),
  serverLevel: level
});
const sample = { grunt: 40, runner: 12, brute: 3 };
const serverKnowledge = (level = 1) => ({
  role: "server",
  level,
  weight: shared.getServerKnowledgeWeight(level),
  links: 1,
  linkLimit: shared.SERVER_LINK_LIMIT,
  entries: shared.SERVER_KNOWLEDGE_TYPES.map((type) => entry(type, sample[type] ?? 0, level))
});
const model = (definitionId, knowledge, stats) => buildTowerSheetModel({
  towerId: "t1", definitionId, characterId: "warrior", name: "x", level: 1, color: "#22c55e",
  live: { hp: 100, maxHp: 100 }, notes: [], knowledge, stats: stats ? { id: "t1", ...stats } : undefined
});

test("Sunucu paneli: bilgi bolumu en ustte, bes tur, artis/bilgi/sonraki oldurme; ust sayilarda en yuksek ve bag", () => {
  setLocaleForTest("tr");
  const sheet = model("warrior-2", serverKnowledge());
  const section = sheet.sections[0];
  assert.equal(section.id, "knowledge", "bolum en ustte");
  assert.equal(section.title, "Bilgi birikimi");
  assert.equal(section.summary, "en yüksek: Sürü → hasar +%20");
  assert.deepEqual(section.bars.map((bar) => bar.label), ["Koşucu → yavaşlatma", "Atıcı → kalkan hasarı", "Ezici → zırh kırma", "Sürü → hasar", "Kuşatma → hasar"]);
  const grunt = section.bars.find((bar) => bar.key === "kn:grunt");
  assert.equal(grunt.value, "+%20");
  assert.ok(Math.abs(grunt.ratio - 0.2) < 1e-9, "cubuk artisin kendisi");
  assert.equal(grunt.marker, 0.5, "+%50 nisan cizgisi");
  assert.match(grunt.markerLabel, /Bilgi Bankası/);
  assert.equal(grunt.tone, "ok", "en yuksek tur vurgulu");
  assert.match(grunt.sub, /^40 bilgi · sonraki öldürme \+%0,4 ekler$/);
  assert.match(section.bars.find((bar) => bar.key === "kn:siege").sub, /^henüz öldürme yok · ilk öldürme \+%0,6 verir$/);
  assert.ok(section.notes.some((note) => /son vurduğu her düşman/.test(note)));
  assert.ok(section.notes.some((note) => /Seviye 1: her öldürme ×1,00 sayılır/.test(note)));
  const figures = Object.fromEntries(sheet.figures.map((figure) => [figure.key, figure]));
  assert.equal(figures.kn.value, "+%20");
  assert.equal(figures.kn.sub, "Sürü → hasar");
  assert.equal(figures.links.value, "1/2");
  // Seviye agirligi: seviye 10'da ayni oldurme daha cok sayiliyor.
  const ten = model("warrior-2", serverKnowledge(10)).sections[0].bars.find((bar) => bar.key === "kn:grunt");
  assert.equal(ten.value, "+%33");
});

test("bos Sunucu: 'henuz bilgi yok', ust sayi +%0 ve alt satirsiz; Ingilizce de", () => {
  setLocaleForTest("tr");
  const empty = { ...serverKnowledge(), entries: shared.SERVER_KNOWLEDGE_TYPES.map((type) => entry(type, 0)) };
  const sheet = model("warrior-2", empty);
  assert.equal(sheet.sections[0].summary, "henüz bilgi yok");
  const figure = sheet.figures.find((item) => item.key === "kn");
  assert.equal(figure.value, "+%0");
  assert.equal(figure.sub, undefined);
  setLocaleForTest("en");
  const english = model("warrior-2", serverKnowledge());
  assert.equal(english.sections[0].title, "Knowledge");
  assert.equal(english.sections[0].summary, "top: Grunt → damage +20%");
  setLocaleForTest("tr");
});

test("bagli kule: aldigi artislar; yapmadigi etkiye giden artis 'islemiyor', en yuksek yalnizca isleyenlerden", () => {
  setLocaleForTest("tr");
  const linked = { role: "linked", entries: shared.SERVER_KNOWLEDGE_TYPES.map((type) => entry(type, sample[type] ?? 0)) };
  // Takipci: hasar veriyor, yavaslatmiyor, zirh kirmiyor.
  const plain = model("warrior-1", linked, { fe: [] }).sections.find((section) => section.id === "knowledge");
  assert.equal(plain.title, "Sunucu bilgisi");
  assert.equal(plain.summary, "en yüksek: Sürü → hasar +%20");
  assert.deepEqual(plain.bars.map((bar) => [bar.key, bar.value]), [["kn:grunt", "+%20"], ["kn:runner", "işlemiyor"], ["kn:brute", "işlemiyor"]], "isleyenler once");
  assert.equal(plain.bars[1].ratio, 0);
  assert.match(plain.bars[1].sub, /bu kulede yavaşlatma yok/);
  // Yavaslatan kulede Kosucu artisi isliyor.
  const slowing = model("warrior-1", linked, { fe: [["slow", 0.3]] }).sections.find((section) => section.id === "knowledge");
  assert.equal(slowing.bars.find((bar) => bar.key === "kn:runner").value, "+%7");
  // Blok gelmeden bilinmiyor: hepsi gosteriliyor.
  const pending = model("warrior-1", linked).sections.find((section) => section.id === "knowledge");
  assert.ok(pending.bars.every((bar) => bar.value.startsWith("+")));
});

test("sahne: panel girdisi Sunucu'nun kendisinden ve bagli kulede en bilgili Sunucu'dan", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /knowledge: this\.getTowerSheetKnowledge\(tower\),/);
  assert.match(scene, /entries: SERVER_KNOWLEDGE_TYPES\.map\(\(type\) => entry\(type, tower\.serverKnowledge\?\.\[type\] \?\? 0, tower\.level\)\)/);
  assert.match(scene, /if \(candidate\.bonus > best\.bonus\) best = candidate;/, "birden cok Sunucu: en bilgilisi (sunucudaki kural)");
});
