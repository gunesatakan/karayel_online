/**
 * Dalga sonu beklemesi.
 *
 * Dalga, dusman sayaci sifirlanir sifirlanmaz kapaniyordu: son dusman oldugu
 * kare ile kart secim ekraninin acildigi kare ayniydi. Oyuncu olumu goremeden
 * ekran ustune biniyordu -- mermi hala yolda olabiliyor, hasar yazisi ve olum
 * efekti oynuyor, ustelik istemci enterpolasyon tamponu kadar geriden ciziyor.
 *
 * Sure gercek saniye cinsinden olculuyor: oyuncunun bekledigi sure oyunun ic
 * hizindan bagimsiz olmali.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom } from "./helpers/match-room-harness.mjs";

const PAUSE_MS = 2000;

/** Date.now'u sabitler; aksi halde test gercek saatin hizina bagli kalirdi. */
function withClock(run) {
  const real = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  try {
    return run((ms) => { now += ms; });
  } finally {
    Date.now = real;
  }
}

/** Dalgasi tamamen dogmus ve son dusmani olmus bir oda. */
function createClearedRoom() {
  const room = createRoom("warrior");
  const player = room.state.players.get("p1");
  player.shopOffers = [];
  player.shopRerolls = 0;
  player.nexusShieldCharges = 0;
  room.waveSpawned = room.waveTarget;
  room.enemies.clear();
  return room;
}

test("dalga temizlendigi anda kart ekrani acilmaz", () => {
  withClock(() => {
    const room = createClearedRoom();
    const wave = room.wave;

    room.updateSpawning(16);

    assert.equal(room.wave, wave, "dalga son dusman olur olmaz ilerledi");
    assert.equal(room.setupPhase, false, "kart secim asamasi aninda acildi");
  });
});

test("bekleme dolmadan dalga ilerlemez", () => {
  withClock((advance) => {
    const room = createClearedRoom();
    const wave = room.wave;

    room.updateSpawning(16);
    advance(PAUSE_MS - 100);
    room.updateSpawning(16);

    assert.equal(room.wave, wave, "bekleme dolmadan dalga ilerledi");
    assert.equal(room.setupPhase, false, "bekleme dolmadan kart ekrani acildi");
  });
});

test("bekleme dolunca dalga ilerler ve kart secimi acilir", () => {
  withClock((advance) => {
    const room = createClearedRoom();
    const wave = room.wave;

    room.updateSpawning(16);
    advance(PAUSE_MS + 50);
    room.updateSpawning(16);

    assert.equal(room.wave, wave + 1, "bekleme dolduktan sonra dalga ilerlemedi");
    assert.equal(room.setupPhase, true, "kart secim asamasina gecilmedi");
  });
});

/**
 * Yarim kalmis bekleme tasinmamali.
 *
 * Dusman geri gelip tekrar temizlenirse sayac sifirdan baslamali; aksi halde
 * ikinci temizlenmede bekleme aninda dolmus sayilir ve gecikme hic yasanmaz.
 */
test("dusman yeniden ortaya cikarsa bekleme bastan baslar", () => {
  withClock((advance) => {
    const room = createClearedRoom();
    const wave = room.wave;

    room.updateSpawning(16);
    advance(PAUSE_MS - 100);

    // Dusman geri geldi: dalga artik temiz degil.
    room.enemies.set("e-geri", { id: "e-geri" });
    room.updateSpawning(16);
    room.enemies.clear();

    // Onceki beklemeyi tamamlayacak kadar zaman gecti, ama sayac sifirlandi.
    room.updateSpawning(16);
    advance(200);
    room.updateSpawning(16);

    assert.equal(room.wave, wave, "sayac sifirlanmadi, yarim bekleme tasindi");

    advance(PAUSE_MS);
    room.updateSpawning(16);
    assert.equal(room.wave, wave + 1, "sifirlanan sayac bir daha dolmadi");
  });
});
