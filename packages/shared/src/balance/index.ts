export const FINAL_WAVE = 20;
export const BASE_WAVE_ENEMY_COUNT = 10;
export const ENEMY_COUNT_WAVE_MULTIPLIER = 1.11;
export const ENEMY_HP_WAVE_MULTIPLIER = 1.22;
export const ENEMY_HP_BALANCE_MULTIPLIER = 1.1 * 4 / 3;
export const ENEMY_REWARD_MULTIPLIER = 1;

export function getWaveEnemyCount(wave: number) {
  return Math.max(1, Math.round(BASE_WAVE_ENEMY_COUNT * ENEMY_COUNT_WAVE_MULTIPLIER ** Math.max(0, wave - 1)));
}

export function getArenaWaveEnemyCount(wave: number, mapScale: number, playerCount: number) {
  const safeMapScale = Math.max(1, Math.min(4, Math.round(mapScale)));
  const multiplayerMultiplier = 1 + Math.max(0, Math.round(playerCount) - 1) * 0.35;
  return Math.max(1, Math.round(getWaveEnemyCount(wave) * safeMapScale * multiplayerMultiplier));
}

export function getWaveHpMultiplier(wave: number) {
  return ENEMY_HP_WAVE_MULTIPLIER ** Math.max(0, wave - 1);
}

export function getWaveEnemyMaxHp(baseHp: number, wave: number, healthMultiplier = 1) {
  return Math.max(1, Math.round(baseHp * getWaveHpMultiplier(wave) * healthMultiplier * ENEMY_HP_BALANCE_MULTIPLIER));
}

export function getWaveCompletionGold(completedWave: number) {
  return 20 + (completedWave + 1) * 3;
}
