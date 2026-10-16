/**
 * Efekt LOD'unun yenileme tahmini.
 *
 * Gercek bir mac kaydinda (Android Chrome, DPR 3) FPS ortalamasi 58, kare
 * p95 17 ms iken LOD butun mac 4'te kaldi: yenileme araligi gorulen en kisa
 * kareden tahmin ediliyordu ve degisken yenilemeli ekranin arada verdigi
 * kisa kareler tahmini 8-11 ms'ye indiriyordu. Duzgun 60 FPS'lik her kare
 * "yavas" sayiliyordu. Tahmin artik son karelerin alt ceyregi.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { importWebModule } from "./helpers/web-module.mjs";

const { VfxLod, VFX_LOD_MAX } = await importWebModule("apps/web/src/vfx/lod.ts");

const run = (lod, frames, vfxMs = 0.5) => {
  let now = 0;
  for (const frame of frames) {
    now += frame;
    lod.note(vfxMs, frame, now);
  }
  return lod.level;
};

test("duzgun 60 FPS'te arada gelen kisa kareler LOD'u yukseltmiyor", () => {
  const lod = new VfxLod();
  const frames = [];
  for (let i = 0; i < 1800; i++) frames.push(i % 7 === 3 ? 9 : 16.7);
  assert.equal(run(lod, frames), 0);
});

test("120 Hz ekranda 60 FPS yavas sayilmiyor; 60 FPS'in altina dusus sayiliyor", () => {
  const lod = new VfxLod();
  run(lod, Array.from({ length: 240 }, () => 8.3));
  assert.equal(run(lod, Array.from({ length: 900 }, () => 16.7)), 0, "60 FPS hedef: efekt dusmemeli");
  assert.equal(run(lod, Array.from({ length: 120 }, () => 28)) > 0, true, "~36 FPS'e dusus efekt dusurmeli");
});

test("60 Hz telefonda uzun suren yavaslama hemen normal sayilmiyor", () => {
  const lod = new VfxLod();
  run(lod, Array.from({ length: 300 }, () => 16.7));
  assert.equal(run(lod, Array.from({ length: 300 }, () => 25)) > 0, true, "40 FPS'e dusus 5 sn icinde efekt dusurmeli");
});

test("30 Hz'e kilitli tarayicida her kare yavas sayilmiyor", () => {
  const lod = new VfxLod();
  assert.equal(run(lod, Array.from({ length: 900 }, () => 33.3)), 0);
});

test("efekt butcesi asilinca LOD yine yukseliyor", () => {
  const lod = new VfxLod();
  assert.equal(run(lod, Array.from({ length: 900 }, () => 16.7), 6), VFX_LOD_MAX);
});
