export type CharacterId = "warrior" | "archer" | "mage" | "healer" | "tank";
export type UpgradeId = "damage" | "fireRate" | "projectileSpeed" | "heal";

export const GAME_WORLD_WIDTH = 390;
export const GAME_WORLD_HEIGHT = 844;
export const BATTLE_TOP = 86;
export const SHOP_TOP = 650;
export const SHOP_HEIGHT = GAME_WORLD_HEIGHT - SHOP_TOP;

export type PlayerSnapshot = {
  id: string;
  name: string;
  characterId: string;
  x: number;
  y: number;
  goldSpent: number;
  upgrades: {
    damage: number;
    fireRate: number;
    projectileSpeed: number;
  };
};

export type EnemySnapshot = {
  id: string;
  type: "grunt" | "brute" | "runner";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
};

export type ProjectileSnapshot = {
  id: string;
  kind: "arrow" | "bolt" | "orb" | "light" | "chain";
  x: number;
  y: number;
};

export type TeamSnapshot = {
  health: number;
  maxHealth: number;
  gold: number;
  wave: number;
  enemiesLeft: number;
  kills: number;
};

export type GameSnapshot = {
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  projectiles: ProjectileSnapshot[];
  team: TeamSnapshot;
};

export type CharacterDefinition = {
  id: CharacterId;
  displayName: string;
  role: string;
  summary: string;
  maxHp: number;
  speed: number;
  damage: number;
  fireIntervalMs: number;
  projectileSpeed: number;
  abilities: string[];
};

export const characters: CharacterDefinition[] = [
  {
    id: "warrior",
    displayName: "Savasci",
    role: "Dengeli",
    summary: "Standart atis hizi ve guvenilir hasar.",
    maxHp: 100,
    speed: 1,
    damage: 14,
    fireIntervalMs: 650,
    projectileSpeed: 320,
    abilities: ["Dengeli Atis"]
  },
  {
    id: "archer",
    displayName: "Okcu",
    role: "Hizli",
    summary: "Hizli atis, dusuk hasar, coklu hedef.",
    maxHp: 85,
    speed: 1.12,
    damage: 7,
    fireIntervalMs: 320,
    projectileSpeed: 420,
    abilities: ["Cift Ok"]
  },
  {
    id: "mage",
    displayName: "Buyucu",
    role: "AOE",
    summary: "Yavas ama alan hasari yuksek.",
    maxHp: 75,
    speed: 0.92,
    damage: 24,
    fireIntervalMs: 1100,
    projectileSpeed: 250,
    abilities: ["Patlayan Orb"]
  },
  {
    id: "healer",
    displayName: "Sifaci",
    role: "Destek",
    summary: "Takim canini yenileyen destek sinifi.",
    maxHp: 90,
    speed: 1,
    damage: 8,
    fireIntervalMs: 720,
    projectileSpeed: 330,
    abilities: ["Takim Sifasi"]
  },
  {
    id: "tank",
    displayName: "Koruyucu",
    role: "Tank",
    summary: "Yavaslatma ve yuksek dayanma odakli.",
    maxHp: 130,
    speed: 0.86,
    damage: 10,
    fireIntervalMs: 800,
    projectileSpeed: 280,
    abilities: ["Yavaslatan Zincir"]
  }
];

export const upgradeCosts: Record<UpgradeId, number> = {
  damage: 35,
  fireRate: 40,
  projectileSpeed: 30,
  heal: 45
};
