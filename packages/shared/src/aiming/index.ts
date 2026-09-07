/**
 * Namlunun saniyede kac radyan dondugu: 1.2 rad/sn, yani ~69 derece. Tam ters
 * yone donmek 2,6 saniye suruyor.
 *
 * Nisan alan her kule ayni degerle basliyor -- kule tanimlarinda bunu ezen bir
 * alan yok, seviye de degistirmiyor. Deger kasten dar: hedefi takip etmek bir
 * bedel olmazsa kuleyi nereye baktigina gore degil yalnizca menzile gore
 * koyarsin ve yerlesim bir karar olmaktan cikar.
 */
export const TOWER_TURN_RATE_RADIANS_PER_SECOND = 1.2;

/**
 * Ates konisi: namlu hedefin bu kadar yakinina gelince tetik dusuyor, 12 derece.
 *
 * Bu bir isabet **sansi** degil. impact/wave/projectile mermileri namlunun
 * baktigi yone firlatiliyor, yani konideki sapma dogrudan merminin yoluna
 * geciyor -- iskalar oradan cikiyor. Obur vurus tiplerinde mermi hedefin
 * konumuna gidiyor, konu yalnizca ne zaman ates edilecegini belirliyor.
 */
export const TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS = Math.PI / 15;

/**
 * Koninin inebilecegi en dar aci.
 *
 * Isabet bonusu 1.0`a ulastiginda tolerans sifirlanirdi ve sifir tolerans
 * "hicbir zaman ates etmeyen kule" demek: rotateTowerTowards hedefe oturdugunda
 * bile normalizeAngle bir kayan nokta artigi birakiyor, |fark| <= 0 kosulu o
 * artikta takiliyor. Yigilabilir isabet kartlari toplami 1.0`in ustune
 * cikarabildigi icin bu artik ulasilabilir bir durum, taban olmadan kule
 * sessizce susardi.
 */
export const TOWER_FIRE_ALIGNMENT_MIN_RADIANS = 0.5 * Math.PI / 180;

/** Isabet bonusu koniyi daraltir: +%20 bonus 12 dereceyi 9,6 dereceye indirir. */
export function getTowerFireAlignmentTolerance(accuracyBonus = 0) {
  // Negatif bonus yok sayilir; koniyi genisletmek icin bir yol yok, o yuzden
  // hicbir karta "isabet -%X" yazilmamali -- yazilsa sessizce hicbir sey yapar.
  const bonus = Math.max(0, Math.min(1, accuracyBonus));
  return Math.max(TOWER_FIRE_ALIGNMENT_MIN_RADIANS, TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS * (1 - bonus));
}

export function shouldRetainAimTargetLock(options: {
  now: number;
  lockUntil: number;
  hasFired: boolean;
  targetIsValid: boolean;
}) {
  return options.targetIsValid && (!options.hasFired || options.now < options.lockUntil);
}

export function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function rotateTowerTowards(current: number, target: number, deltaSeconds: number, turnRate = TOWER_TURN_RATE_RADIANS_PER_SECOND) {
  const delta = shortestAngleDelta(current, target);
  const step = Math.min(Math.abs(delta), Math.max(0, turnRate * deltaSeconds));
  return normalizeAngle(current + Math.sign(delta) * step);
}

export function isTowerAligned(facing: number, targetAngle: number, tolerance = TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS) {
  return Math.abs(shortestAngleDelta(facing, targetAngle)) <= tolerance;
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
