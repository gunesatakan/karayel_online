/**
 * Tohumlu dunya: sanal saat ve tohumlu `Math.random`.
 *
 * Gercek `MatchRoom` zamani `Date.now` / `performance.now`, zari
 * `Math.random` ile okuyor. Bir maci birebir tekrarlamak icin ucu de mac
 * suresince degistiriliyor ve sonunda geri yukleniyor (`withSeededWorld`).
 * Odanin kendi kodu degismiyor; yalnizca saat ve zar kaynagi.
 *
 * Saat her tick'te `advance(ms)` ile ilerliyor. Duvar saati beklenmiyor:
 * 20 dalgalik bir mac saniyeler icinde oynaniyor.
 */

export const WORLD_EPOCH_MS = 1_800_000_000_000;

/** Kucuk, hizli, 32 bit tohumlu uretec (bench-late-game ile ayni). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Oda zari ile bot zarinin ayni tohumdan ayri akislari. */
export function deriveSeed(seed, salt) {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * `fn(world)` suresince saat ve zar tohumlu; cikista (hata da olsa) eski
 * haline donuyor. Ic ice cagri desteklenmiyor: odalar sirayla kosuyor.
 */
export function withSeededWorld(seed, fn) {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  const originalPerformanceNow = performance.now;
  const world = { now: WORLD_EPOCH_MS, advance(ms) { world.now += ms; } };
  Math.random = mulberry32(deriveSeed(seed, 1));
  Date.now = () => Math.floor(world.now);
  performance.now = () => world.now - WORLD_EPOCH_MS;
  try {
    return fn(world);
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
    performance.now = originalPerformanceNow;
  }
}
