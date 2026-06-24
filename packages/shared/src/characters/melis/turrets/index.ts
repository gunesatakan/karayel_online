import type { TowerDefinition } from "../../common/types.js";

export const melisTowers: TowerDefinition[] = [
  {
    id: "archer-1",
    characterId: "archer",
    name: "Hedefci",
    role: "Menzilli takinti",
    description: "Bir hedef belirler ve hedef olene kadar ona odaklanir. Stres baskinken menzil siniri kalkar. Onayla favori kule olarak cok verimli hale gelir.",
    classType: "damage",
    damageType: "psychic",
    hitType: "projectile",
    mechanics: ["focus-lock", "stress-global-range", "favorite-approval-scaling"],
    cost: 72,
    upgradeCost: 52,
    range: 126,
    damage: 16,
    fireIntervalMs: 820,
    projectileSpeed: 520,
    aoeRadius: 0,
    slowMs: 0,
    color: 0x8b5cf6
  },
  {
    id: "archer-2",
    characterId: "archer",
    name: "Parlama",
    role: "Ofke patlamasi",
    description: "Hedefledigi dusmani menzilinden cikana kadar olduremezse ofke dalgasi salar ve temas edenlere korku uygular. Stres baskinken kendi alanindaki dost kuleleri 0.5 saniye durdurur.",
    classType: "damage",
    damageType: "psychic",
    hitType: "projectile",
    mechanics: ["rage-wave-on-escape", "fear", "stress-friendly-pause"],
    cost: 88,
    upgradeCost: 64,
    range: 118,
    damage: 22,
    fireIntervalMs: 950,
    projectileSpeed: 460,
    aoeRadius: 0,
    slowMs: 0,
    color: 0xdb2777
  }
];
