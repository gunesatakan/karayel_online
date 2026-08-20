import type {
  EnemySnapshot,
  GameSnapshot,
  StaticEnemySnapshot,
  StaticTowerSnapshot,
  TowerSnapshot,
  WireGameSnapshot,
  ProjectileSpawnSnapshot
} from "../index.js";

export const CLIENT_PROJECTILE_MAX_LIFETIME_MS = 10_000;

export function getLinearProjectilePosition(projectile: ProjectileSpawnSnapshot, serverTime: number) {
  const elapsedSeconds = Math.max(0, serverTime - projectile.spawnedAt) / 1000;
  return {
    x: projectile.x + (projectile.vx ?? 0) * elapsedSeconds,
    y: projectile.y + (projectile.vy ?? 0) * elapsedSeconds
  };
}

export function isClientProjectileExpired(projectile: ProjectileSpawnSnapshot, serverTime: number) {
  return serverTime - projectile.spawnedAt >= CLIENT_PROJECTILE_MAX_LIFETIME_MS;
}

export function hydrateWireSnapshot(
  snapshot: WireGameSnapshot,
  enemies: ReadonlyMap<string, StaticEnemySnapshot>,
  towers: ReadonlyMap<string, StaticTowerSnapshot>
): GameSnapshot | undefined {
  const hydratedEnemies: EnemySnapshot[] = [];
  for (const enemy of snapshot.enemies) {
    const staticData = enemies.get(enemy.id);
    if (!staticData) return undefined;
    hydratedEnemies.push({ ...staticData, ...enemy });
  }
  const hydratedTowers: TowerSnapshot[] = [];
  for (const tower of snapshot.towers) {
    const staticData = towers.get(tower.id);
    if (!staticData) return undefined;
    hydratedTowers.push({ ...staticData, ...tower });
  }
  return { ...snapshot, enemies: hydratedEnemies, towers: hydratedTowers };
}

export function pruneStaticSnapshotCache<T>(cache: Map<string, T>, activeIds: Iterable<string>) {
  const active = new Set(activeIds);
  for (const id of cache.keys()) {
    if (!active.has(id)) cache.delete(id);
  }
}

/** Buyuk sapmada saat yeniden kurulur: ilk snapshot, yeniden baglanma, uzun donma. */
export const SERVER_CLOCK_RESYNC_THRESHOLD_MS = 1000;
/** Paket basina duzeltme orani. ~30Hz'de zaman sabiti yaklasik 0.7 saniye. */
export const SERVER_CLOCK_SMOOTHING = 0.05;

/**
 * Sunucu snapshotlarini yerel zamana oturtan oynatma saati.
 *
 * Istemci bir donem "en son gelen snapshot"i demir olarak tutuyor ve oynatma
 * zamanini her pakette o paketin varis anina gore yeniden kuruyordu. Boylece her
 * paketin kendi ag jitteri dogrudan render saatine biniyordu: erken gelen paket
 * zamani ileri, gec gelen geri itiyordu. Bazi kareler zamanda geriye gittigi
 * icin dusmanlar yol uzerinde ileri geri mikro sicramalar yapiyordu.
 *
 * Fark artik tek tek paketlere gore ziplamak yerine yumusatiliyor. Gercek saat
 * kaymasi yavas oldugu icin bu yeterince hizli, jitter icinse fazlasiyla yavas.
 */
export class SnapshotPlaybackClock {
  private offset?: number;
  private lastTarget?: number;

  constructor(
    private readonly playbackDelayMs: number,
    private readonly smoothing = SERVER_CLOCK_SMOOTHING,
    private readonly resyncThresholdMs = SERVER_CLOCK_RESYNC_THRESHOLD_MS
  ) {}

  /** Gelen bir snapshotin sunucu zamanini ve yerel varis anini isler. */
  observe(serverTime: number, receivedAt: number) {
    const observed = serverTime - receivedAt;
    if (this.offset === undefined || Math.abs(observed - this.offset) > this.resyncThresholdMs) {
      this.offset = observed;
      this.lastTarget = undefined;
      return;
    }
    this.offset += (observed - this.offset) * this.smoothing;
  }

  isReady() {
    return this.offset !== undefined;
  }

  /**
   * Su an cizilmesi gereken sunucu zamani.
   *
   * Geriye gitmesi engelleniyor: yumusatma duzeltmeleri milisaniyenin altinda
   * kaldigi icin bu kelepce pratikte yalnizca saat yeniden kurulduktan sonra
   * devreye girer, ve zamani kisa sure sabit tutmak sicramaya gore cok daha az
   * fark edilir.
   */
  getTargetServerTime(now: number) {
    const target = now + (this.offset ?? 0) - this.playbackDelayMs;
    const safeTarget = this.lastTarget !== undefined && target < this.lastTarget ? this.lastTarget : target;
    this.lastTarget = safeTarget;
    return safeTarget;
  }
}
