import type {
  EnemySnapshot,
  GameSnapshot,
  StaticEnemySnapshot,
  StaticTowerSnapshot,
  TowerSnapshot,
  WireGameSnapshot
} from "../index.js";

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
