export type CharacterId = "zeynep" | "warrior" | "archer" | "mage" | "healer" | "tank" | "onur";
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
  hp: number;
  maxHp: number;
  goldSpent: number;
  upgrades: {
    damage: number;
    fireRate: number;
    projectileSpeed: number;
  };
};

export type EnemySnapshot = {
  id: string;
  type: "grunt" | "brute" | "runner" | "shooter";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
};

export type ProjectileSnapshot = {
  id: string;
  kind: "arrow" | "bolt" | "orb" | "light" | "chain" | "enemy";
  source: "player" | "enemy";
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
  passive: string;
  skills: string[];
};

export const characters: CharacterDefinition[] = [
  {
    id: "zeynep",
    displayName: "Zeynep",
    role: "Kurucu",
    summary: "Tum karakterlerin, Atakan dahil, kurucusu. En guclu, en cevik ve en yuksek hasara sahip karakter.",
    maxHp: 160,
    speed: 1.35,
    damage: 34,
    fireIntervalMs: 240,
    projectileSpeed: 520,
    passive: "Kurucu ustunlugu.",
    skills: ["Beceri 1", "Beceri 2", "Beceri 3", "Beceri 4"]
  },
  {
    id: "warrior",
    displayName: "Atakan",
    role: "Ciliz",
    summary: "En yavas, en gucsuz ve en kirilgan karakter.",
    maxHp: 55,
    speed: 0.72,
    damage: 4,
    fireIntervalMs: 1150,
    projectileSpeed: 220,
    passive: "Hayatta kalmaya calisir.",
    skills: ["Beceri 1", "Beceri 2", "Beceri 3", "Beceri 4"]
  },
  {
    id: "archer",
    displayName: "Melis",
    role: "Hizli",
    summary: "Hizli atis, dusuk hasar, coklu hedef.",
    maxHp: 85,
    speed: 1.12,
    damage: 7,
    fireIntervalMs: 320,
    projectileSpeed: 420,
    passive: "Hizli refleks.",
    skills: ["Beceri 1", "Beceri 2", "Beceri 3", "Beceri 4"]
  },
  {
    id: "mage",
    displayName: "Baransel",
    role: "AOE",
    summary: "Yavas ama alan hasari yuksek.",
    maxHp: 75,
    speed: 0.92,
    damage: 24,
    fireIntervalMs: 1100,
    projectileSpeed: 250,
    passive: "Alan enerjisi biriktirir.",
    skills: ["Beceri 1", "Beceri 2", "Beceri 3", "Beceri 4"]
  },
  {
    id: "healer",
    displayName: "Ülkü",
    role: "Destek",
    summary: "Takim canini yenileyen destek sinifi.",
    maxHp: 90,
    speed: 1,
    damage: 8,
    fireIntervalMs: 720,
    projectileSpeed: 330,
    passive: "Takim direncini artirir.",
    skills: ["Beceri 1", "Beceri 2", "Beceri 3", "Beceri 4"]
  },
  {
    id: "tank",
    displayName: "Ömer",
    role: "Tank",
    summary: "Yavaslatma ve yuksek dayanma odakli.",
    maxHp: 130,
    speed: 0.86,
    damage: 10,
    fireIntervalMs: 800,
    projectileSpeed: 280,
    passive: "Aldigi hasari azaltir.",
    skills: ["Beceri 1", "Beceri 2", "Beceri 3", "Beceri 4"]
  },
  {
    id: "onur",
    displayName: "Onur",
    role: "Avci",
    summary: "Guvenilir hasar ve dengeli hareket kabiliyeti.",
    maxHp: 110,
    speed: 1.04,
    damage: 16,
    fireIntervalMs: 560,
    projectileSpeed: 360,
    passive: "Hedef takibi.",
    skills: ["Beceri 1", "Beceri 2", "Beceri 3", "Beceri 4"]
  }
];

export const upgradeCosts: Record<UpgradeId, number> = {
  damage: 35,
  fireRate: 40,
  projectileSpeed: 30,
  heal: 45
};
