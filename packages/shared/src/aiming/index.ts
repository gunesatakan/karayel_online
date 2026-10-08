import type { HitType } from "../combat.js";

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
 * Ates konisi: namlu hedefin bu kadar yakinina gelince tetik dusuyor, 20 derece.
 *
 * Bu bir isabet **sansi** degil. impact/wave/projectile mermileri namlunun
 * baktigi yone firlatiliyor, yani konideki sapma dogrudan merminin yoluna
 * geciyor -- iskalar oradan cikiyor. Obur vurus tiplerinde mermi hedefin
 * konumuna gidiyor, konu yalnizca ne zaman ates edilecegini belirliyor.
 */
export const TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS = Math.PI / 9;

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

/** Isabet bonusu koniyi daraltir: +%20 bonus 20 dereceyi 16 dereceye indirir. */
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

// Liste bir donem paylasilan paketin kok dosyasindaydi. Kart kapsami da
// (`aims`) ayni soruyu sordugu icin buraya tasindi: `cards` modulu kok
// dosyayi iceri alamaz, kok dosya zaten `cards`'i iceri aliyor.

/**
 * Towers whose muzzle should turn toward what they are shooting.
 *
 * Kept as an explicit list rather than inferred from hitType: Kin Kulesi is an
 * aura tower but fires a directional cone, while Sunucu is an impact-typed
 * global rack that never attacks and has no muzzle. Auras, passives and area curses never aim.
 *
 * Taht Muhru was excluded while it was a socketed seal, but its art now carries
 * an explicit barrel on the right, and a muzzle that never turns reads worse
 * than one that does.
 */
const AIMING_TOWER_IDS = new Set<string>([
  "zeynep-1",
  "zeynep-2",
  "zeynep-3",
  "zeynep-6",
  "warrior-1",
  "warrior-4",
  "warrior-5",
  "warrior-6",
  "archer-1",
  "archer-2",
  "archer-4",
  "archer-5"
]);

export function towerAims(definitionId: string) {
  return AIMING_TOWER_IDS.has(definitionId);
}

/**
 * Atisi namlunun baktigi yone giden kuleler: isabetin iska azalttigi yer.
 *
 * Nisan alan kulelerin hepsinde isabet ates konisini daraltiyor, ama koni
 * yalnizca namlu yonunde ucan mermide (carpma, mermi, dalga) bir sapmayi
 * kapatiyor. Obur nisan alan kulelerde isabet yalnizca tetigi geciktiriyor:
 * Debug Lazer bir odak kulesi, Gosteri Kulesi ise vurus tipi carpma olsa da
 * isinini en kalabalik hatta kendisi seciyor (`findBestZeynepShowcaseLine`)
 * ve namlunun yonune bakmiyor. Taht Muhru karma: mermi kipleri namlu
 * yonunde ucuyor, isin kipleri ucmuyor; kapsamda kaliyor.
 */
export function towerFiresAlongFacing(tower: { id?: string; hitType?: HitType; engine?: { attack: { executor?: string } } }) {
  if (!tower.id || !towerAims(tower.id)) return false;
  if (tower.engine?.attack.executor === "showcase-beam") return false;
  return tower.hitType === "impact" || tower.hitType === "projectile" || tower.hitType === "wave";
}
