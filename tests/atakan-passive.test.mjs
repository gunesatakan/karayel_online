/**
 * Atakan'in yalnizlik pasifi.
 *
 * Menzil ve hasar ayni carpanla (x1,5) carpilir; atis hizi ekseni ayri bir
 * sabitte ve bugun 1 (atis hizi bonusu yok). Eskiden aralik da carpana
 * boluniyordu ve yalniz kule x2,25 DPS aliyordu; simdi x1,5.
 *
 * Testler sayiyi elle yazmiyor, sabitlerden okuyor -- ama iki eksenin **ayni**
 * sabitten geldigini ve atis araliginin degismedigini dogruluyor.
 *
 * Bilesik sonuc ayrica olculuyor: bir eksen sessizce degistirilirse DPS carpani
 * tutmaz ve test duser.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ATAKAN_ISOLATION_FIRE_RATE_MULTIPLIER, ATAKAN_ISOLATION_MULTIPLIER, getAtakanIsolationDpsMultiplier, getMapGridSize } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

const client = { sessionId: "p1", send() {} };

/** Atakan'in atis yapan kuleleri; Sunucu bilerek disarida. */
const ATIS_KULELERI = ["warrior-1", "warrior-4", "warrior-5", "warrior-6"];

function oda() {
  const room = createRoom("warrior");
  room.broadcast = () => {};
  room.clients = [client];
  return room;
}

function kur(room, definitionId) {
  const nokta = findBuildableSpot(room, definitionId);
  assert.ok(nokta, `${definitionId} icin yer bulunamadi`);
  room.placeTower(client, { x: nokta.x, y: nokta.y, definitionId });
  const kule = [...room.towers.values()].at(-1);
  assert.ok(kule, `${definitionId} kurulamadi`);
  return kule;
}

const oku = (room, kule) => ({
  carpan: room.getAtakanPassiveMultiplier(kule),
  menzil: room.getTowerRange(kule),
  hasar: room.getTowerDamage(kule),
  aralik: room.getTowerFireInterval(kule)
});

/**
 * Kulenin bitisigine bir yapi koyar ve gercekten kondugunu dogrular.
 *
 * Duvar kenara oturdugu icin yarim kare otelenir; kule tam kareye.
 */
function bitisigeKoy(room, kule, definitionId) {
  const gridSize = getMapGridSize(room.activeMap);
  const adim = definitionId === "wall-1" ? gridSize / 2 : gridSize;
  for (const [dx, dy] of [[adim, 0], [-adim, 0], [0, adim], [0, -adim]]) {
    const once = room.towers.size;
    room.placeTower(client, { x: kule.x + dx, y: kule.y + dy, definitionId });
    if (room.towers.size > once) return [...room.towers.values()].at(-1);
  }
  return undefined;
}

test("yalnızlık menzil ve hasarı aynı sayıdan alır, atış hızına dokunmaz", () => {
  for (const id of ATIS_KULELERI) {
    const room = oda();
    const kule = kur(room, id);
    const yalniz = oku(room, kule);
    assert.equal(yalniz.carpan, ATAKAN_ISOLATION_MULTIPLIER, `${id}: carpan`);

    assert.ok(bitisigeKoy(room, kule, "warrior-1"), `${id}: bitisige kule konulamadi`);
    const komsulu = oku(room, kule);
    assert.equal(komsulu.carpan, 1, `${id}: komsu varken pasif kapanmadi`);

    assert.ok(
      Math.abs(yalniz.menzil / komsulu.menzil - ATAKAN_ISOLATION_MULTIPLIER) < 1e-9,
      `${id}: menzil x${yalniz.menzil / komsulu.menzil}`
    );
    assert.ok(
      Math.abs(yalniz.hasar / komsulu.hasar - ATAKAN_ISOLATION_MULTIPLIER) < 1e-9,
      `${id}: hasar x${yalniz.hasar / komsulu.hasar}`
    );
    // Atis hizi bonusu yok: aralik ayni kaliyor.
    assert.equal(ATAKAN_ISOLATION_FIRE_RATE_MULTIPLIER, 1);
    assert.ok(
      Math.abs(yalniz.aralik / komsulu.aralik - 1) < 1e-9,
      `${id}: aralik x${yalniz.aralik / komsulu.aralik}`
    );
  }
});

test("bileşik kazanç x1,5 DPS: hasar çarpanı kadar", () => {
  // Hasar ve hiz carpimdan geciyor; hiz ekseni 1. Tek eksen sessizce
  // degisirse bu esitlik bozulur.
  const beklenen = ATAKAN_ISOLATION_MULTIPLIER * ATAKAN_ISOLATION_FIRE_RATE_MULTIPLIER;
  assert.equal(beklenen, 1.5);
  assert.equal(getAtakanIsolationDpsMultiplier(), beklenen);
  for (const id of ATIS_KULELERI) {
    const room = oda();
    const kule = kur(room, id);
    const yalniz = oku(room, kule);
    assert.ok(bitisigeKoy(room, kule, "warrior-1"), `${id}: bitisige kule konulamadi`);
    const komsulu = oku(room, kule);

    const dps = (yalniz.hasar / yalniz.aralik) / (komsulu.hasar / komsulu.aralik);
    assert.ok(Math.abs(dps - beklenen) < 1e-9, `${id}: DPS x${dps}, beklenen x${beklenen}`);
  }
});

test("duvarlar yalnızlığı bozmaz", () => {
  // Kullanicinin acikca koydugu kural. Duvar kule degil; kuleyi duvarla
  // cevrelemek pasifi kapatmaz. Kontrolu bir onceki test: gercek kule bozuyor.
  for (const id of ATIS_KULELERI) {
    const room = oda();
    const kule = kur(room, id);
    const once = oku(room, kule);
    assert.equal(once.carpan, ATAKAN_ISOLATION_MULTIPLIER, `${id}: kule bastan yalniz degil`);

    assert.ok(bitisigeKoy(room, kule, "wall-1"), `${id}: bitisige duvar orulemedi`);
    const sonra = oku(room, kule);
    assert.equal(sonra.carpan, ATAKAN_ISOLATION_MULTIPLIER, `${id}: duvar pasifi kapatti`);
    assert.equal(sonra.menzil, once.menzil, `${id}: duvar menzili degistirdi`);
    assert.equal(sonra.hasar, once.hasar, `${id}: duvar hasari degistirdi`);
    assert.equal(sonra.aralik, once.aralik, `${id}: duvar atis araligini degistirdi`);
  }
});

test("Sunucu pasifin tamamen dışında", () => {
  // Isi komsu kulelere baglanmak; yalnizlik odulu almasi kendi kitiyla celisirdi.
  const room = oda();
  const sunucu = kur(room, "warrior-2");
  assert.equal(room.isTowerIsolated(sunucu), true, "Sunucu bastan yalniz degil");
  assert.equal(room.getAtakanPassiveMultiplier(sunucu), 1, "Sunucu yalnizlik odulu aldi");
});

test("başka karakterin kulesi Atakan pasifini almaz", () => {
  const room = createRoom("zeynep");
  room.broadcast = () => {};
  room.clients = [client];
  const kule = kur(room, "zeynep-1");
  assert.equal(room.isTowerIsolated(kule), true, "kule bastan yalniz degil");
  assert.equal(room.getAtakanPassiveMultiplier(kule), 1, "Zeynep kulesi Atakan pasifi aldi");
});
