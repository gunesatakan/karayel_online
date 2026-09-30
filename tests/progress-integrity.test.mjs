/**
 * Kalici kaydin butunlugu: asama ilerlemesi ve ileride gelecek rekor ile nisan.
 *
 * Iki delik vardi. Yaratici modda dalga ve kule elle ayarlanabildigi halde zafer
 * asamayi tamamlanmis isaretliyordu. Online oda kurulurken asama gitmedigi icin
 * sunucu ilk asamaya dusuyor, co-op zaferi hep 1. asamayi yaziyordu.
 *
 * Kayit tarayicida yaziliyor; buradaki testler yazmanin dayandigi iki seyi
 * tutuyor: ortak kapi (`canRecordProgress`) ve sunucunun o kapiya verdigi bilgi
 * (sonuc mesaji, lobi durumu, oda listesi, oda kurulusu).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STAGE_COUNT, canRecordProgress, getHighestUnlockedStage, shouldRecordStageClear } from "../packages/shared/dist/index.js";
import { MatchRoom } from "../apps/server/dist/rooms/MatchRoom.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

/** Yayinlari toplayan oda; sonuc mesajinin icerigine bakmak icin. */
function yayinDinleyenOda() {
  const room = createRoom("warrior");
  const yayinlar = [];
  room.broadcast = (type, payload) => yayinlar.push({ type, payload });
  room.clients = [];
  return { room, yayinlar };
}

test("yaratici kosu hicbir kayda yazamaz", () => {
  assert.equal(canRecordProgress({ creative: true, stage: 2 }), false);
  assert.equal(canRecordProgress({ creative: false, stage: 2 }), true);
  assert.equal(canRecordProgress({ stage: 2 }), true);
});

test("asamasi bilinmeyen sonuc yazilmaz", () => {
  // Menudeki secime dusmek yerine hic yazmamak: yanlis kayit geri alinamaz.
  for (const gecersiz of [undefined, 0, -1, 1.5, STAGE_COUNT + 1, Number.NaN]) {
    assert.equal(canRecordProgress({ stage: gecersiz }), false, `asama ${gecersiz} kabul edildi`);
  }
  assert.equal(canRecordProgress(undefined), false);
  for (let stage = 1; stage <= STAGE_COUNT; stage += 1) {
    assert.equal(canRecordProgress({ stage }), true, `${stage}. asama reddedildi`);
  }
});

test("zafer mesaji odanin asamasini tasiyor, normal odada yaratici bayragi yok", () => {
  const { room, yayinlar } = yayinDinleyenOda();
  room.stage = 3;

  room.finishMatch("victory");

  const mesaj = yayinlar.find((yayin) => yayin.type === "match:victory");
  assert.ok(mesaj, "zafer yayinlanmadi");
  assert.equal(mesaj.payload.stage, 3);
  // Varsayilan deger gonderilmiyor: kapali bayrak anahtar olarak da yok
  // (`creative: undefined` msgpack'te yine yaziliyor).
  assert.equal("creative" in mesaj.payload, false);
  assert.equal(canRecordProgress(mesaj.payload), true);
});

test("yaratici odanin sonuc mesaji kapidan gecemez", () => {
  const { room, yayinlar } = yayinDinleyenOda();
  room.creativeMode = true;
  room.stage = 2;

  room.finishMatch("victory");

  const mesaj = yayinlar.find((yayin) => yayin.type === "match:victory");
  assert.ok(mesaj, "zafer yayinlanmadi");
  assert.equal(mesaj.payload.creative, true);
  assert.equal(mesaj.payload.stage, 2);
  assert.equal(canRecordProgress(mesaj.payload), false);
});

test("lobi ve oda listesi odanin asamasini gosteriyor", () => {
  const { room } = yayinDinleyenOda();
  room.stage = 4;
  room.hostSessionId = "p1";

  assert.equal(room.getLobbyState().stage, 4);
  assert.equal(room.toRoomListing().stage, 4);
});

test("online oda istenen asamayla kuruluyor, yaratici bayragi lobiye sizmiyor", async () => {
  const room = new MatchRoom();
  // Gercek saat testi asili birakir; simulasyon burada gerekmiyor.
  room.setSimulationInterval = () => {};
  try {
    // Menunun online kurulus cagrisinin tasidigi alanlar: autoStart yok.
    await room.onCreate({ roomName: "Test Odasi", mapScale: 1, stage: 3, creative: true });
    assert.equal(room.stage, 3, "online oda secilen asamayla kurulmadi");
    assert.equal(room.creativeMode, false, "yaratici bayragi lobi yoluna sizdi");
    assert.equal(room.getLobbyState().stage, 3);
  } finally {
    MatchRoom.rooms.delete(room.roomId);
  }
});

test("asama gonderilmezse oda ilk asamaya duser", async () => {
  // Eski istemci ya da eksik veri: odanin kurulmasi engellenmemeli.
  const room = new MatchRoom();
  room.setSimulationInterval = () => {};
  try {
    await room.onCreate({ roomName: "Eski Istemci", mapScale: 1 });
    assert.equal(room.stage, 1);
  } finally {
    MatchRoom.rooms.delete(room.roomId);
  }
});

test("co-op: katilan oyuncu kendisinde kilitli asamayi kaydina yazamaz", () => {
  // Yalnizca 1. asamayi bitirmis oyuncu ev sahibinin 3. asamasini kazandi:
  // yazmak 4'u acar ve 2-3'u atlatirdi.
  assert.equal(shouldRecordStageClear(3, [1]), false);
  assert.equal(shouldRecordStageClear(3, [1, 2]), true, "zincir tamamsa yazilir");
  assert.equal(shouldRecordStageClear(1, []), true, "ilk asama hep acik");
  assert.equal(shouldRecordStageClear(4, [1]), false);
  // Atlamanin sonucu: yazilsaydi menu kilitli asamalarin (2-3) ustune acilirdi.
  assert.equal(getHighestUnlockedStage([1, 4]), 5);
  assert.equal(getHighestUnlockedStage([1]), 2);
});

test("kaynak: tarayici kaydi kilitli asamayi yazmadan once kapidan geciriyor", async () => {
  const source = await readFile(new URL("../apps/web/src/stage-progress.ts", import.meta.url), "utf8");
  const start = source.indexOf("export function markStageCleared(");
  const body = source.slice(start, source.indexOf("\nexport function", start + 10));
  const gate = body.indexOf("shouldRecordStageClear(stage, cleared)");
  assert.ok(gate >= 0, "markStageCleared kilit kapisini kullaniyor");
  assert.ok(gate < body.indexOf("localStorage.setItem("), "kapi yazmadan once");
});
