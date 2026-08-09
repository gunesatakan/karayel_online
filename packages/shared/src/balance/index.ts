export const FINAL_WAVE = 20;
export const BASE_WAVE_ENEMY_COUNT = 10;
export const ENEMY_COUNT_WAVE_MULTIPLIER = 1.11;
export const ENEMY_HP_WAVE_MULTIPLIER = 1.22;
export const ENEMY_HP_BALANCE_MULTIPLIER = 1.1;
export const ENEMY_REWARD_MULTIPLIER = 0.825;

export function getWaveEnemyCount(wave: number) {
  return Math.max(1, Math.round(BASE_WAVE_ENEMY_COUNT * ENEMY_COUNT_WAVE_MULTIPLIER ** Math.max(0, wave - 1)));
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
