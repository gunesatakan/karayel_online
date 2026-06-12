export type CharacterId = "zeynep" | "warrior" | "archer" | "mage" | "healer" | "tank" | "onur";
export type UpgradeId = "damage" | "fireRate" | "projectileSpeed" | "heal";
export type EnemyType = "grunt" | "brute" | "runner" | "shooter";
export type ProjectileKind = "arrow" | "bolt" | "orb" | "light" | "chain" | "enemy" | "tower";

export const GAME_WORLD_WIDTH = 390;
export const GAME_WORLD_HEIGHT = 844;
export const BATTLE_TOP = 86;
export const SHOP_TOP = 650;
export const SHOP_HEIGHT = GAME_WORLD_HEIGHT - SHOP_TOP;
export const PATH_WIDTH = 54;

export const MAP_PATH = [
  { x: 34, y: 104 },
  { x: 326, y: 104 },
  { x: 326, y: 244 },
  { x: 82, y: 244 },
  { x: 82, y: 392 },
  { x: 318, y: 392 },
  { x: 318, y: 540 },
  { x: 72, y: 540 },
  { x: 72, y: 694 },
  { x: 356, y: 694 },
  { x: 356, y: 812 }
] as const;

export type PlayerSnapshot = {
  id: string;
  name: string;
  characterId: CharacterId;
  goldSpent: number;
  towersBuilt: number;
  ultimateCharge: number;
  skillCooldowns: number[];
};

export type EnemySnapshot = {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
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
  level: number;
  range: number;
  color: number;
};

export type ProjectileSnapshot = {
  id: string;
  kind: ProjectileKind;
  source: "tower" | "enemy";
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
  towers: TowerSnapshot[];
  projectiles: ProjectileSnapshot[];
  team: TeamSnapshot;
};

export type TowerDefinition = {
  id: string;
  characterId: CharacterId;
  name: string;
  role: string;
  cost: number;
  upgradeCost: number;
  range: number;
  damage: number;
  fireIntervalMs: number;
  projectileSpeed: number;
  aoeRadius: number;
  slowMs: number;
  color: number;
};

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  cooldownMs: number;
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
  ultimate: string;
  towers: TowerDefinition[];
  skills: SkillDefinition[];
};

const makeTowers = (
  characterId: CharacterId,
  color: number,
  names: Array<[string, string]>,
  base: { cost: number; range: number; damage: number; fireIntervalMs: number; projectileSpeed: number; aoeRadius?: number; slowMs?: number }
): TowerDefinition[] => names.map(([name, role], index) => ({
  id: `${characterId}-${index + 1}`,
  characterId,
  name,
  role,
  cost: base.cost + index * 18,
  upgradeCost: Math.round((base.cost + index * 18) * 0.72),
  range: base.range + index * 5,
  damage: base.damage + index * 3,
  fireIntervalMs: Math.max(160, base.fireIntervalMs - index * 28),
  projectileSpeed: base.projectileSpeed + index * 18,
  aoeRadius: base.aoeRadius ?? 0,
  slowMs: base.slowMs ?? 0,
  color
}));

const makeSkills = (characterId: CharacterId, names: Array<[string, string, number]>): SkillDefinition[] =>
  names.map(([name, description, cooldownMs], index) => ({
    id: `${characterId}-skill-${index + 1}`,
    name,
    description,
    cooldownMs
  }));

const zeynepTowers = makeTowers("zeynep", 0xec4899, [
  ["Kurucu Isik", "Cok hizli tek hedef"],
  ["Pembe Firtina", "Seri hasar"],
  ["Taht Muhru", "Alan hasari"],
  ["Zirve Oku", "Uzun menzil"],
  ["Emir Kulesi", "Yavaslatma"],
  ["Zeynep Nexus", "En ust seviye hasar"]
], { cost: 55, range: 118, damage: 24, fireIntervalMs: 330, projectileSpeed: 440, aoeRadius: 16, slowMs: 160 });

const atakanTowers = makeTowers("warrior", 0x22c55e, [
  ["Ciliz Tas", "Ucuz baslangic"],
  ["Titrek Ok", "Dusuk hasar"],
  ["Yorgun Kule", "Yavas atis"],
  ["Ufak Kivilcim", "Kisa menzil"],
  ["Son Care", "Ekonomik savunma"],
  ["Atakan Bariyeri", "Zayif destek"]
], { cost: 24, range: 82, damage: 4, fireIntervalMs: 1180, projectileSpeed: 220 });

const melisTowers = makeTowers("archer", 0x38bdf8, [
  ["Cifte Ok", "Hizli atis"],
  ["Seri Yay", "Coklu hedef"],
  ["Ruzgar Oku", "Hizli mermi"],
  ["Keskin Hat", "Dengeli hasar"],
  ["Avci Gozu", "Uzun menzil"],
  ["Melis Salvosu", "Cok hizli kule"]
], { cost: 38, range: 108, damage: 8, fireIntervalMs: 430, projectileSpeed: 430 });

const baranselTowers = makeTowers("mage", 0xa78bfa, [
  ["Mor Patlama", "Alan hasari"],
  ["Rift Tas", "Buyu hasari"],
  ["Kozmik Halka", "Genis alan"],
  ["Enerji Topu", "Yavas ama sert"],
  ["Mana Kirilimi", "Zincir hasar"],
  ["Baransel Meteoru", "Yuksek AOE"]
], { cost: 48, range: 98, damage: 20, fireIntervalMs: 900, projectileSpeed: 280, aoeRadius: 42 });

const ulkuTowers = makeTowers("healer", 0xf9a8d4, [
  ["Sifa Nuru", "Destek hasari"],
  ["Pembe Kalkan", "Guvenli savunma"],
  ["Takim Isigi", "Dengeli destek"],
  ["Can Dalgasi", "Alan kontrolu"],
  ["Koruma Cemberi", "Yavaslatma"],
  ["Ulku Umudu", "Takim odakli kule"]
], { cost: 36, range: 102, damage: 9, fireIntervalMs: 690, projectileSpeed: 330, slowMs: 120 });

const omerTowers = makeTowers("tank", 0xfacc15, [
  ["Agir Zincir", "Yavaslatma"],
  ["Sari Duvar", "Savunma"],
  ["Kilit Kule", "Kontrol"],
  ["Capa Atisi", "Yuksek yavaslatma"],
  ["Kalkan Topu", "Dayanikli savunma"],
  ["Omer Hisari", "En guclu kontrol"]
], { cost: 42, range: 94, damage: 10, fireIntervalMs: 780, projectileSpeed: 280, slowMs: 720 });

const onurTowers = makeTowers("onur", 0x14b8a6, [
  ["Avci Nisan", "Tek hedef"],
  ["Net Vurus", "Kritik hasar"],
  ["Sessiz Ok", "Uzun menzil"],
  ["Odak Hatti", "Sert vurus"],
  ["Iz Surucu", "Hedef takibi"],
  ["Onur Keskinligi", "Elit tek hedef"]
], { cost: 44, range: 124, damage: 18, fireIntervalMs: 620, projectileSpeed: 390 });

export const towerCatalog: Record<CharacterId, TowerDefinition[]> = {
  zeynep: zeynepTowers,
  warrior: atakanTowers,
  archer: melisTowers,
  mage: baranselTowers,
  healer: ulkuTowers,
  tank: omerTowers,
  onur: onurTowers
};

const zeynepSkills = makeSkills("zeynep", [
  ["Kurucu Emri", "Takima altin kazandirir.", 12000],
  ["Taht Isigi", "Tum dusmanlara hasar ve kisa yavaslatma verir.", 18000],
  ["Mutlak Ustunluk", "Guclu alan hasari ve ek altin saglar.", 26000]
]);

const atakanSkills = makeSkills("warrior", [
  ["Ufak Destek", "Az miktarda altin kazandirir.", 14000],
  ["Ciliz Sarsinti", "Dusmanlara zayif alan hasari verir.", 20000],
  ["Son Gayret", "Altin ve ufak alan hasari saglar.", 28000]
]);

const melisSkills = makeSkills("archer", [
  ["Hizli Hazirlik", "Takima altin kazandirir.", 12000],
  ["Ok Serisi", "Yolda ondeki dusmanlari vurur.", 17000],
  ["Keskin Yaylim", "Daha fazla ondeki dusmana hasar verir.", 25000]
]);

const baranselSkills = makeSkills("mage", [
  ["Mana Toplama", "Takima altin kazandirir.", 13000],
  ["Mor Patlama", "Tum dusmanlara alan hasari verir.", 19000],
  ["Meteor Hazirligi", "Guclu global buyu hasari verir.", 28000]
]);

const ulkuSkills = makeSkills("healer", [
  ["Moral", "Takima altin kazandirir.", 12000],
  ["Sifa Dalgasi", "Takim canini artirir ve dusmanlari yavaslatir.", 20000],
  ["Koruma Ritmi", "Can ve altin destegi saglar.", 28000]
]);

const omerSkills = makeSkills("tank", [
  ["Savunma Duzeni", "Takima altin kazandirir.", 13000],
  ["Agir Kilit", "Dusmanlari yavaslatir ve hasar verir.", 21000],
  ["Hisar Darbesi", "Guclu yavaslatma ve alan hasari verir.", 30000]
]);

const onurSkills = makeSkills("onur", [
  ["Iz Surme", "Takima altin kazandirir.", 12000],
  ["Net Hedef", "En guclu dusmana agir hasar verir.", 18000],
  ["Keskin Bitiris", "En guclu dusmana cok agir hasar verir.", 27000]
]);

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
    passive: "Kurucu ustunlugu: Takimin kuleleri daha hizli tepki verir.",
    ultimate: "Kurucu Fermani: Ekrandaki tum dusmanlara buyuk hasar verir.",
    towers: zeynepTowers,
    skills: zeynepSkills
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
    passive: "Inat: Cok az da olsa ucuz kule kurar.",
    ultimate: "Panik Savunmasi: Kisa sureli zayif bir alan hasari.",
    towers: atakanTowers,
    skills: atakanSkills
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
    passive: "Hizli refleks: Kuleleri daha sik ates eder.",
    ultimate: "Ok Yagmuru: Yol uzerindeki dusmanlara seri hasar.",
    towers: melisTowers,
    skills: melisSkills
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
    passive: "Alan enerjisi: AOE kuleleri daha genis vurur.",
    ultimate: "Meteor: En kalabalik bolgeye patlama indirir.",
    towers: baranselTowers,
    skills: baranselSkills
  },
  {
    id: "healer",
    displayName: "Ülkü",
    role: "Destek",
    summary: "Takim canini ve savunma ritmini destekleyen sinif.",
    maxHp: 90,
    speed: 1,
    damage: 8,
    fireIntervalMs: 720,
    projectileSpeed: 330,
    passive: "Takim direnci: Ana can havuzu daha guvenli kalir.",
    ultimate: "Can Dalgasi: Takim canini yeniler ve dusmanlari yavaslatir.",
    towers: ulkuTowers,
    skills: ulkuSkills
  },
  {
    id: "tank",
    displayName: "Ömer",
    role: "Tank",
    summary: "Yavaslatma ve yol kontrolu odakli.",
    maxHp: 130,
    speed: 0.86,
    damage: 10,
    fireIntervalMs: 800,
    projectileSpeed: 280,
    passive: "Agir baski: Yavaslatma kuleleri daha uzun surer.",
    ultimate: "Kilit Alan: Dusmanlari kisa sure yavaslatir.",
    towers: omerTowers,
    skills: omerSkills
  },
  {
    id: "onur",
    displayName: "Onur",
    role: "Avci",
    summary: "Guvenilir tek hedef hasari ve uzun menzil.",
    maxHp: 110,
    speed: 1.04,
    damage: 16,
    fireIntervalMs: 560,
    projectileSpeed: 360,
    passive: "Hedef takibi: Kuleleri ilerideki dusmanlari onceliklendirir.",
    ultimate: "Keskin Emir: En guclu dusmana agir hasar.",
    towers: onurTowers,
    skills: onurSkills
  }
];

export const upgradeCosts: Record<UpgradeId, number> = {
  damage: 35,
  fireRate: 40,
  projectileSpeed: 30,
  heal: 45
};
