import type { EditableMapData, MapScale } from "./map.js";
import type { EnemyRace, MovementKind } from "./combat.js";

export type CharacterId = "zeynep" | "warrior" | "archer" | "mage" | "healer" | "tank" | "onur";
export type UpgradeId = "damage" | "fireRate" | "projectileSpeed" | "heal";
export type EnemyType = "grunt" | "brute" | "runner" | "shooter";
export type ProjectileKind = "arrow" | "bolt" | "orb" | "light" | "chain" | "enemy" | "tower";
export type { DamageType, EnemyRace, HitType, MovementKind, StatusEffectId } from "./combat.js";
export { applyStatusResistance, calculateArmorDamageMultiplier, calculateDamageTaken, enemyCombatDefinitions, enemyRaceDefinitions, getEnemyCombatDefinition, getEnemyDamageResistances } from "./combat.js";

export const GAME_WORLD_WIDTH = 390;
export const GAME_WORLD_HEIGHT = 844;
export const BATTLE_TOP = 86;
export const SHOP_TOP = 650;
export const SHOP_HEIGHT = GAME_WORLD_HEIGHT - SHOP_TOP;
export const PATH_WIDTH = 54;
export const TOWER_GRID_SIZE = 34;
export const TOWER_BUILD_TOP = BATTLE_TOP;
export const TOWER_BUILD_BOTTOM = 698;

export const MAP_PATH = [
  { x: 34, y: 104 },
  { x: 326, y: 104 },
  { x: 326, y: 244 },
  { x: 82, y: 244 },
  { x: 82, y: 392 },
  { x: 318, y: 392 },
  { x: 318, y: 540 },
  { x: 72, y: 540 },
  { x: 72, y: 610 },
  { x: 356, y: 610 },
  { x: 356, y: 681 }
] as const;

export type PlayerSnapshot = {
  id: string;
  name: string;
  characterId: CharacterId;
  gold: number;
  goldSpent: number;
  towersBuilt: number;
  ultimateCharge: number;
  skillCooldowns: number[];
  reputation?: number;
  authorityChain?: number;
  authorityQuality?: number;
  approval?: number;
  stress?: number;
};

export type LobbyPlayerSnapshot = {
  id: string;
  name: string;
  characterId: CharacterId;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
};

export type LobbyStateSnapshot = {
  roomId: string;
  roomName: string;
  hostId: string;
  mapScale: MapScale;
  started: boolean;
  players: LobbyPlayerSnapshot[];
  maxPlayers: number;
};

export type RoomListingSnapshot = {
  roomId: string;
  roomName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  mapScale: MapScale;
  started: boolean;
};

export type EnemySnapshot = {
  id: string;
  type: EnemyType;
  race: EnemyRace;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  attack: number;
  healthRegenPerSecond: number;
  shield: number;
  maxShield: number;
  movementKind: MovementKind;
  pathDistance: number;
  pathId?: number;
  isTracked?: boolean;
  trackingStacks?: number;
  isFeared?: boolean;
  isArmorBroken?: boolean;
  isDominated?: boolean;
  isWhisperTurned?: boolean;
  curseLoad?: number;
  doubtStacks?: number;
  isHesitating?: boolean;
  isUnderworldLinked?: boolean;
  isUndead?: boolean;
};

export type TowerSnapshot = {
  id: string;
  ownerId: string;
  ownerName: string;
  characterId: CharacterId;
  definitionId: string;
  name: string;
  x: number;
  y: number;
  orientation?: "horizontal" | "vertical";
  /** Radians toward the current target. Only sent for towers that aim. */
  facing?: number;
  level: number;
  range: number;
  color: number;
  hp?: number;
  maxHp?: number;
  armor?: number;
  disabled?: boolean;
  status?: string;
  damageDealt?: number;
  currentDps?: number;
  melisEvolutionLevel?: number;
  isMelisFavorite?: boolean;
  melisUnderworldMode?: "approval" | "stress";
  melisUnderworldPullCount?: number;
  waveBonusLevel?: number;
  serverLinkWaveAge?: number;
  linkedTowerIds?: string[];
  zeynepFormationSize?: number;
  zeynepFormationLevel?: number;
};

export type ProjectileSnapshot = {
  id: string;
  kind: ProjectileKind;
  source: "tower" | "enemy";
  definitionId?: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
};

export type DroneSnapshot = {
  id: string;
  mode: "attack" | "repair";
  x: number;
  y: number;
};

export type BeamSnapshot = {
  id: string;
  definitionId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  scanX?: number;
  scanY?: number;
  width: number;
  color: number;
  overdrive?: boolean;
  ttlMs?: number;
};

export type DamageEventSnapshot = {
  id: string;
  x: number;
  y: number;
  amount: number;
};

export type KillEventSnapshot = {
  id: string;
  ownerId: string;
  enemyId: string;
  serverTime: number;
  streakTier?: "granted" | "unstoppable" | "rampage" | "legendary";
};

export type ZeynepCommandTier = "small" | "medium" | "big";

export type ZeynepCommandEffectSnapshot = {
  tier: ZeynepCommandTier;
  multiplier: number;
  remainingMs: number;
};

export type TeamSnapshot = {
  health: number;
  maxHealth: number;
  gold: number;
  wave: number;
  enemiesLeft: number;
  kills: number;
};

export type ServerPerfSnapshot = {
  tickMs: number;
  tickMaxMs: number;
  snapshotBytes: number;
  snapshotHz: number;
  sections: {
    spawnMs: number;
    towersMs: number;
    projectilesMs: number;
    enemiesMs: number;
    cooldownsMs: number;
    ultimatesMs: number;
    snapshotMs: number;
  };
  ops: {
    targetSearches: number;
    targetChecks: number;
    aoeChecks: number;
    chainChecks: number;
    damageEvents: number;
  };
};

export type GameSnapshot = {
  serverTime: number;
  hostId: string;
  map?: EditableMapData;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  towers: TowerSnapshot[];
  projectiles: ProjectileSnapshot[];
  drones: DroneSnapshot[];
  beams: BeamSnapshot[];
  damageEvents: DamageEventSnapshot[];
  killEvents: KillEventSnapshot[];
  zeynepCommands?: {
    haste?: ZeynepCommandEffectSnapshot;
    range?: ZeynepCommandEffectSnapshot;
    slow?: ZeynepCommandEffectSnapshot;
  };
  melisGothicNightmareActive?: boolean;
  team: TeamSnapshot;
  setupPhase?: boolean;
  setupReadyPlayerIds?: string[];
  perf?: ServerPerfSnapshot;
};

export { characters, towerCatalog } from "./characters/index.js";
export type { CharacterDefinition, SkillDefinition, TowerDefinition } from "./characters/index.js";
export { STATUS_EFFECTS } from "./statuses/index.js";
export {
  MAP_GRID_COLS,
  MAP_GRID_ROWS,
  MAP_STORAGE_KEY,
  DEFAULT_MAP_SCALE,
  MAX_MAP_SCALE,
  createDefaultEditableMap,
  createOpenArenaMap,
  getMapGridSize,
  getMapMetrics,
  getMapOrigin,
  getMapScale,
  findPathToNearestNexus,
  buildRuntimePaths,
  getMapPoints,
  getPointAlongRuntimePath,
  getTile,
  gridToWorld,
  isInsideMap,
  isWalkableTile,
  normalizeMapData,
  pathToWorldPoints,
  scaleEditableMap,
  setTile,
  worldToGrid,
  type EditableMapData,
  type GridPoint,
  type MapScale,
  type MapTileKind,
  type RuntimePath,
  type WorldPoint
} from "./map.js";

/**
 * Towers whose muzzle should turn toward what they are shooting.
 *
 * Kept as an explicit list rather than inferred from hitType: Kin Kulesi is an
 * aura tower but fires a directional cone, while Sunucu throws projectiles yet
 * is a global rack with no muzzle. Auras, passives and area curses never aim.
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
 * How many grid cells a tower covers per side. Saray Arsivi is a 2x2 vault, so
 * it snaps to a cell corner and occupies four tiles. Abarti is not a tile tower
 * at all and goes through the edge placement path instead.
 */
export function getTowerGridSpan(definitionId: string) {
  return definitionId === "zeynep-7" ? 2 : 1;
}

/**
 * Painted tower art reserves a margin around the disc so muzzles and spikes can
 * overhang without making the disc itself smaller. The disc is this fraction of
 * the frame, which lets the renderer size a sprite so its disc lands exactly on
 * the tile regardless of how much the art sticks out.
 */
export const TOWER_ART_DISC_RATIO = 0.7;

export const upgradeCosts: Record<UpgradeId, number> = {
  damage: 35,
  fireRate: 40,
  projectileSpeed: 30,
  heal: 45
};

const TOWER_UPGRADE_COST_RATIO = 0.72;

export function getTowerUpgradeCost(towerCost: number, currentLevel: number, towerId?: string) {
  if (towerId === "warrior-2") {
    return getServerTowerUpgradeCost(currentLevel);
  }
  if (towerId === "warrior-5") {
    return getDebugLaserUpgradeCost(towerCost, currentLevel);
  }
  if (towerId === "warrior-6") {
    return getUcubeUpgradeCost(towerCost, currentLevel);
  }
  if (towerId === "zeynep-7") {
    return getZeynepSynthesisAmplifierUpgradeCost(currentLevel);
  }

  return getDefaultTowerUpgradeCost(towerCost, currentLevel);
}

export function getTowerTotalInvestedGold(towerCost: number, currentLevel: number, towerId?: string) {
  const safeLevel = Math.min(Math.max(Math.round(currentLevel), 1), 10);
  let total = towerCost;
  for (let level = 1; level < safeLevel; level += 1) {
    total += getTowerUpgradeCost(towerCost, level, towerId);
  }
  return total;
}

export function getTowerSellRefund(towerCost: number, currentLevel: number, towerId?: string) {
  return Math.floor(getTowerTotalInvestedGold(towerCost, currentLevel, towerId) / 2);
}

function getDefaultTowerUpgradeCost(towerCost: number, currentLevel: number) {
  const targetLevel = currentLevel + 1;
  const discount =
    targetLevel === 2 ? 0.5 :
      targetLevel === 3 ? 0.7 :
        targetLevel === 4 ? 0.85 :
          1;

  return Math.round(towerCost * TOWER_UPGRADE_COST_RATIO * currentLevel * 1.35 * discount * 0.5);
}

function getServerTowerUpgradeCost(currentLevel: number) {
  if (currentLevel < 1 || currentLevel >= 10) {
    return 0;
  }

  return Math.round(20 + (currentLevel - 1) * ((200 - 20) / 8));
}

function getDebugLaserUpgradeCost(towerCost: number, currentLevel: number) {
  const lateCosts: Record<number, number> = {
    4: 113,
    5: 158,
    6: 203,
    7: 248,
    8: 293,
    9: 338
  };

  return lateCosts[currentLevel] ?? getDefaultTowerUpgradeCost(towerCost, currentLevel);
}

function getUcubeUpgradeCost(towerCost: number, currentLevel: number) {
  return Math.round(getDefaultTowerUpgradeCost(towerCost, currentLevel) * 0.6);
}

function getZeynepSynthesisAmplifierUpgradeCost(currentLevel: number) {
  const costs: Record<number, number> = {
    1: 300,
    2: 200,
    3: 100
  };

  if (currentLevel < 1 || currentLevel >= 10) {
    return 0;
  }

  return costs[currentLevel] ?? 100;
}
