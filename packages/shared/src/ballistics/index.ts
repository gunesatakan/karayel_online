import type { HitType } from "../combat.js";
import { getProjectileReach, type ProjectileShape } from "../projectile-body/index.js";
import { getMovingBodyContact, writeMovingBodyContactPoint, type EnemyBody } from "../enemy-body/index.js";

export const LINEAR_BALLISTIC_HIT_TYPES: ReadonlySet<HitType> = new Set(["impact", "wave", "projectile"]);
// Successive balance passes reduce the live speed to two ninths of the
// original definition (1/2 * 2/3 * 2/3).
export const LINEAR_BALLISTIC_SPEED_MULTIPLIER = 2 / 9;
// Carpisma yaricapi artik vurus tipinden degil merminin cizilen govdesinden
// (`projectile-body`): eski 4 / 8 / 4 birimlik tablo cizimle ilgisizdi.

export function usesLinearBallistics(hitType: HitType) {
  return LINEAR_BALLISTIC_HIT_TYPES.has(hitType);
}

/**
 * Mermi hizi modifierinin bir sey degistirdigi atis yollari.
 *
 * `projectileSpeed` sunucuda dort yerde okunuyor: duz balistik mermi
 * (`spawnTowerProjectile`), Fisilti Korosu'nun mermisi
 * (`spawnSpecialProjectile`), Kin dalgasi ve Taht
 * Muhru'nun sentez mermileri ve isinlari. Isinlar (Debug Lazer, Gosteri
 * Kulesi), lanet patlamasi, yorunge bicaklari, auralar ve odak baglari
 * hicbir sey firlatmiyor; mermi hizi kartini onlara uydurmak oyuncuya olu
 * bir secenek gostermek olurdu.
 *
 * Vurus tipi yazilmamis eski kuleler sunucuda varsayilan "projectile" ile
 * ates ediyor, o yuzden burada da mermi atan sayiliyorlar.
 */
const NON_PROJECTILE_EXECUTORS: ReadonlySet<string> = new Set(["debug-laser", "showcase-beam", "curse-burst", "orbit"]);
const PROJECTILE_EXECUTORS: ReadonlySet<string> = new Set(["kin-wave", "synthesis", "whisper-chorus"]);

export function towerFiresProjectiles(tower: { id?: string; hitType?: HitType; resourceProvider?: unknown; engine?: { attack: { executor?: string } } }) {
  if (tower.resourceProvider || towerNeverAttacks(tower)) return false;
  const executor = tower.engine?.attack.executor;
  if (executor && NON_PROJECTILE_EXECUTORS.has(executor)) return false;
  if (executor && PROJECTILE_EXECUTORS.has(executor)) return true;
  return tower.hitType === undefined || tower.hitType === "projectile" || tower.hitType === "impact";
}

/**
 * Hic saldirmayan kuleler. Sunucu yalnizca bagliyor: bagli kulelere menzil,
 * soguma ve bilgi artisi (server-knowledge); kendisi ne ates ediyor ne vuruyor.
 * Tanimdaki vurus tipi kimligi icin (gorsel, codex rengi) kaliyor; savas ve
 * mermi kartlari, atis hizi satiri ona islemiyor.
 */
const NON_ATTACKING_TOWER_IDS: ReadonlySet<string> = new Set(["warrior-2"]);
export function towerNeverAttacks(tower: { id?: string }) {
  return !!tower.id && NON_ATTACKING_TOWER_IDS.has(tower.id);
}

export function getBallisticMovementSpeed(speed: number, hitType: HitType) {
  return usesLinearBallistics(hitType) ? speed * LINEAR_BALLISTIC_SPEED_MULTIPLIER : speed;
}

/**
 * Ucan merminin bu tikte gorunen govdeye ilk degdigi yol (dunya birimi,
 * 0..`travel`); degmiyorsa -1, tikin basinda zaten degiyorsa 0.
 *
 * Mermi `from`dan birim `u` yonunde `travel` kadar ilerliyor; sekli cizilen
 * govdesi (`ProjectileShape`: cizicinin dis bukey parcalari, disk), geriye
 * en fazla `min(ucus, kuyruk)` (`getProjectileReach`): kuyruk ancak ucmus
 * oldugu kadar ve cizildigi kadar vuruyor; namludan dogan merminin hicbir
 * yeri dogdugu noktanin gerisindekine degmiyor. Govde gorunen govdenin dis
 * bukey cokgeni (`enemy-body`, `getMovingBodyContact`). Tahsis yok: her
 * mermi x her aday x her tik.
 */
export function getProjectileBodyContact(
  fromX: number,
  fromY: number,
  ux: number,
  uy: number,
  travel: number,
  shape: ProjectileShape,
  flown: number,
  body: EnemyBody
) {
  return getMovingBodyContact(body, fromX, fromY, ux, uy, travel, shape, getProjectileReach(shape, flown));
}

/**
 * Temas noktasi, mermi `along` kadar ilerlemisken: gorunen govdenin kenarinda
 * ve merminin degdigi yerde (`writeMovingBodyContactPoint`); tikin basinda
 * zaten degen mermide merminin kendi boyunun icinde, merminin cizilen
 * govdesine en yakin kenar noktasi (alan hasarinin halkasi merminin
 * bulundugu yerde). Isabet basina bir kez; `out`a yaziyor.
 */
export function writeProjectileBodyContactPoint<T extends { x: number; y: number }>(
  fromX: number,
  fromY: number,
  ux: number,
  uy: number,
  along: number,
  shape: ProjectileShape,
  flown: number,
  body: EnemyBody,
  out: T
) {
  return writeMovingBodyContactPoint(body, fromX, fromY, ux, uy, along, shape, getProjectileReach(shape, flown), out);
}
