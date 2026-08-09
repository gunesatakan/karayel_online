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
