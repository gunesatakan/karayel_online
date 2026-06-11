export type CharacterId = "karayel";

export const GAME_WORLD_WIDTH = 390;
export const GAME_WORLD_HEIGHT = 844;

export type PlayerSnapshot = {
  id: string;
  name: string;
  characterId: string;
  x: number;
  y: number;
};

export type CharacterDefinition = {
  id: CharacterId;
  displayName: string;
  maxHp: number;
  speed: number;
  abilities: string[];
};

export const characters: CharacterDefinition[] = [
  {
    id: "karayel",
    displayName: "Karayel",
    maxHp: 100,
    speed: 1,
    abilities: ["dash"]
  }
];
