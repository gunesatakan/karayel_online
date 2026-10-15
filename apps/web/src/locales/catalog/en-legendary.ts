import {
  BLAST_DAMAGE_SECONDS, BLAST_RADIUS_CELLS, CHAIN_DAMAGE_SECONDS, CHAIN_JUMPS, CHRONO_PAYBACK_RATIO, CHRONO_SCAR_MS,
  EXECUTE_THRESHOLD, FREEZE_CHAMPION_DURATION_MS, FREEZE_DURATION_MS, FREEZE_IMMUNITY_MS,
  GRAVITY_DURATION_MS, GRAVITY_RADIUS_CELLS, LEGENDARY_CARD_CHANCE, LEGENDARY_CARD_NAMES, LEGENDARY_EFFECTS, LEGENDARY_ITEM_CHANCE,
  LEGENDARY_ITEM_NAMES, LINK_DURATION_MS, LINK_SHARE, SHATTER_CHAMPION_MAX_HP_RATIO, SHATTER_FRACTURE_MS, SHATTER_MAX_HP_RATIO,
  type LegendaryEffect
} from "@karayel/shared";

/**
 * Efsanevi kart ve esyalarin Ingilizce metni. Turkce katalog gibi sayilar
 * `legendary` sabitlerinden yaziliyor: denge ayari iki dili birden tasiyor.
 * Cumle duzeni Turkceyle ayni: "ihtimal" basi + etkinin ne yaptigi.
 */
const num = (value: number) => String(Math.round(value * 100) / 100);
const percent = (ratio: number) => `${num(ratio * 100)}%`;
const seconds = (ms: number) => `${num(ms / 1000)} ${ms === 1000 ? "second" : "seconds"}`;

const enLegendaryNames: Readonly<Record<LegendaryEffect, { card: string; item: string }>> = {
  chain: { card: "Chain Lightning", item: "Lightning Coil" },
  blast: { card: "Impact Blast", item: "Explosive Core" },
  freeze: { card: "Freezing Strike", item: "Stasis Coil" },
  execute: { card: "Execution Protocol", item: "Executioner Module" },
  shatter: { card: "Death Shatter", item: "Fracture Core" },
  chrono: { card: "Chrono Scar", item: "Chrono Capacitor" },
  link: { card: "Damage Link", item: "Link Transmitter" },
  gravity: { card: "Gravity Anchor", item: "Graviton Core" }
};

/** Etkinin "ne yaptigi" yarisi; kart ve esya ayni cumle. */
export function describeLegendaryEffectEn(kind: LegendaryEffect) {
  switch (kind) {
    case "chain":
      return `the next hit arcs to ${CHAIN_JUMPS} nearby enemies; each arc deals ${num(CHAIN_DAMAGE_SECONDS)} ${Number(CHAIN_DAMAGE_SECONDS) === 1 ? "second" : "seconds"} of the tower's damage.`;
    case "blast":
      return `the next hit explodes around the target: enemies within ${num(BLAST_RADIUS_CELLS)} tiles take ${num(BLAST_DAMAGE_SECONDS)} seconds of the tower's damage.`;
    case "freeze":
      return `the next hit freezes the target for ${seconds(FREEZE_DURATION_MS)} (champions ${seconds(FREEZE_CHAMPION_DURATION_MS)}); the same enemy cannot be frozen by this effect again for ${seconds(FREEZE_IMMUNITY_MS)}.`;
    case "execute":
      return `the next hit marks the target for execution: on the first hit that drops its health below ${percent(EXECUTE_THRESHOLD)} the enemy is finished off (brutes, champions and hunters are immune).`;
    case "shatter":
      return `the next hit fractures the target for ${seconds(SHATTER_FRACTURE_MS)}: if it dies meanwhile, it sprays shrapnel around it for ${percent(SHATTER_MAX_HP_RATIO)} of its max health (${percent(SHATTER_CHAMPION_MAX_HP_RATIO)} for champions); enemies killed by the shrapnel shatter too.`;
    case "chrono":
      return `the next hit leaves a chrono scar on the target for ${seconds(CHRONO_SCAR_MS)}: when it ends, the enemy takes ${percent(CHRONO_PAYBACK_RATIO)} of all damage it took meanwhile once more.`;
    case "link":
      return `the next hit links the target to the nearest enemy for ${seconds(LINK_DURATION_MS)}: ${percent(LINK_SHARE)} of the damage either one takes passes to the other.`;
    case "gravity":
      return `the next hit turns the target into a gravity well for ${seconds(GRAVITY_DURATION_MS)}: enemies within ${num(GRAVITY_RADIUS_CELLS)} tiles are pulled toward it (except champions).`;
  }
}

function build(names: Readonly<Record<LegendaryEffect, readonly [string, ...unknown[]]>>, pick: "card" | "item", lead: string) {
  const entries: Record<string, { name: string; description: string }> = {};
  for (const kind of LEGENDARY_EFFECTS) {
    entries[names[kind][0]] = { name: enLegendaryNames[kind][pick], description: `${lead} ${describeLegendaryEffectEn(kind)}` };
  }
  return entries;
}

export const enLegendaryCards = build(
  LEGENDARY_CARD_NAMES,
  "card",
  `Damage-dealing towers have a ${percent(LEGENDARY_CARD_CHANCE)} chance for every second spent engaging an enemy that`
);

export const enLegendaryItems = build(
  LEGENDARY_ITEM_NAMES,
  "item",
  `The equipped tower has a ${percent(LEGENDARY_ITEM_CHANCE)} chance for every second spent engaging an enemy that`
);
