import {
  ARCHIVIST_CARD_TARGET,
  FINAL_WAVE,
  FULL_HEAL_WAVE_HP,
  LOCK_CROWD_HITS,
  MASTERY_TITLE_LEVELS,
  METEOR_KILLS,
  RUN_ROLE_TITLES,
  STAGE_COUNT,
  SYNERGY_SHARE_RUN_FLOOR,
  TOWER_TIER_2_LEVEL,
  TOWER_TIER_3_LEVEL,
  UNBROKEN_CLEAN_STREAK,
  WORKER_REPAIR_PER_SECOND,
  type AmmoType,
  type BadgeGroup,
  type CardRarity,
  type DamageType,
  type HirableWorkerRole,
  type HitType,
  type KillStreakTier,
  type RoleTitleKind,
  type ShopItemCategory,
  type StampStyleId,
  type TowerActivity,
  type TowerAttackShape,
  type TowerAxis,
  type UltimateResultKind,
  type WorkerSkillId
} from "@karayel/shared";
import type { CodexEntry } from "../../codex";

/**
 * Isci becerileri, roller, nisanlar, unvanlar, etiket haritalari ve kodeksin
 * Ingilizce metinleri (kimlige gore). Kaynak Turkce; sozluk docs/i18n-glossary.md.
 */

type NamedText = { name: string; description: string };

/**
 * Isci agacinin butun secenekleri, kimlige gore: bes rolun oyun degistirici
 * ciftleri (`*_WORKER_SKILL_TIERS`), yon/derinlestirme satirlari
 * (`WORKER_DEVELOPMENT_ROWS`) ve uzmanlik secimleri
 * (`WORKER_SPECIALIZATION_CHOICES`, kimlik rol adi). Kimlikler cakismiyor.
 */
export const enWorkerSkills: Readonly<Record<WorkerSkillId | HirableWorkerRole, NamedText>> = {
  // --- Enerji tasiyici: oyun degistiriciler (ENERGY_WORKER_SKILL_TIERS) ------
  "energy-relay": { name: "Relay Architect", description: "The supplied tower becomes an energy source for adjacent towers for 8 s. Grid range 1 tile." },
  "local-capacitor": { name: "Local Capacitor", description: "Each delivery leaves an 18-energy local battery in the tower. Even if the main line is cut, this tower alone keeps running." },
  "load-shedder": { name: "Load Shedder", description: "On delivery, if any of your towers is below 25% energy, towers with Low delivery priority hold fire for 5 s; they keep drawing running energy. Critical, Normal and the receiving tower never stop." },
  "frequency-share": { name: "Frequency Sharer", description: "On delivery, towers below 50% energy run in alternation for 6 s: they hold fire half the time; towers that fire on energy run dry later." },
  "scenario-charge": { name: "Scenario Charge", description: "The supplied tower primes its next special attack. A tower holds one charge at a time." },
  "emergency-bridge": { name: "Emergency Bridge", description: "A target tower out of energy runs on ammo alone for 4 s. The worker is locked to the line for that time." },

  // --- Kristal toplayici: oyun degistiriciler (CRYSTAL_WORKER_SKILL_TIERS) ---
  "crystal-reserve": { name: "Reserve Seal", description: "Each delivery to the reactor stores 12 hidden energy. When main energy runs out, up to 24 energy is released automatically." },
  "crystal-resonance": { name: "Resonance Pulse", description: "If a delivery fills the reactor, all allied towers lose 25% heat and one heat lock is cleared. Cooldown: 12 s." },
  "crystal-trap": { name: "Crystal Trap", description: "The first pickup per wave from each crystal node leaves an enemy slow field around the node for 5 s." },
  "crystal-conduit": { name: "Conductive Vein", description: "The wave's first reactor delivery opens a free energy line to the two nearest towers for 10 s." },
  "crystal-last-core": { name: "Last Core", description: "When the reactor empties, once per wave it grants 25 energy and halts energy consumption for 3 s." },
  "crystal-critical-resonance": { name: "Critical Resonance", description: "When the reactor empties, nearby enemies are slowed by 35% for 3 s and nearby towers are released from heat lock." },

  // --- Muhimmat toplayici: oyun degistiriciler (AMMO_COLLECTOR_WORKER_SKILL_TIERS)
  "ammo-refiner": { name: "Purifier", description: "The next ammo batch produced is 25% more effective against armor." },
  "ammo-emergency-refinery": { name: "Emergency Refinery", description: "When the factory runs out of energy, the first raw material delivery prepares an ammo batch without spending energy." },
  "ammo-cast-shell": { name: "Cast Shell", description: "Each raw material delivery gives the factory a temporary 20-damage shield. The shield caps at 40." },
  "ammo-recycling": { name: "Battle Recycling", description: "The first heavy enemy killed near the factory each wave drops 6 raw material." },
  "ammo-black-box": { name: "Black Box", description: "Once per wave the factory survives a lethal hit at 1 HP and shuts down for 5 s." },
  "ammo-wave-stock": { name: "Wave Stock", description: "At wave end, 30% of the factory's current raw material is added back to stock as a bonus." },

  // --- Muhimmat tasiyici: oyun degistiriciler (AMMO_TRANSPORT_WORKER_SKILL_TIERS)
  "ammo-special-payload": { name: "Special Ammo", description: "The supplied tower's next 6 shots use armor-piercing ammo." },
  "ammo-emergency-magazine": { name: "Emergency Magazine", description: "A tower out of ammo fires 3 free shots after delivery." },
  "ammo-transfer-dock": { name: "Transfer Dock", description: "If the target tower is full, the load is passed once to a nearby allied tower; the worker does not return to the factory empty-handed." },
  "ammo-lost-convoy": { name: "Lost Convoy", description: "If the worker dies while carrying a load, the load is credited back to the factory; the shipment is not lost entirely." },
  "ammo-assault-convoy": { name: "Assault Caravan", description: "If the same tower receives two deliveries within 20 s, salvo mode opens for 5 s; the fire interval shortens by 35%." },
  "ammo-evacuation-convoy": { name: "Evacuation Caravan", description: "A delivery to a tower below 35% HP reduces the next enemy hit by 50%." },

  // --- Tamirci: oyun degistiriciler (REPAIR_WORKER_SKILL_TIERS) --------------
  "repair-bulwark": { name: "Bulwark Master", description: "A tower under repair takes 30% less damage while the repair lasts." },
  "repair-thermal-welder": { name: "Thermal Welder", description: "A repaired tower cannot enter heat lock and cools 30% faster per second." },
  "repair-fortification-seal": { name: "Fortification Seal", description: "When the repair completes, the tower gains a barrier that absorbs 30 damage or lasts 10 s." },
  "repair-emergency-rebuild": { name: "Emergency Rebuild", description: "Once per wave, a destroyed structure can be rebuilt within 5 s at 20% HP." },
  "repair-nexus-watch": { name: "Nexus Watch", description: "When team HP drops below 40%, the repairer leaves the towers and repairs the nexus for 2 HP per second." },
  "repair-breach-engineer": { name: "Breach Engineer", description: "Saving a tower below 20% HP creates an enemy slow field around it for 5 s." },

  // --- Enerji tasiyici: yon / derinlestirme (WORKER_DEVELOPMENT_ROWS) --------
  "energy-high-voltage": { name: "High Voltage", description: "The receiving tower spends 25% less energy per shot for 8 s." },
  "energy-cooling-coil": { name: "Cooling Coil", description: "Delivery lowers the receiving tower's heat by 12°." },
  "energy-superconductor": { name: "Superconductor", description: "Upgrades High Voltage: the receiving tower spends 40% less energy per shot for 12 s." },
  "energy-cryo-coil": { name: "Cryo Coil", description: "Upgrades Cooling Coil: delivery lowers the tower's heat by 20° and releases its heat lock." },
  "energy-mark-guard": { name: "Mark Guard", description: "For 6 s the receiving tower does not consume the marks on enemies it hits." },
  "energy-target-lock": { name: "Target Lock", description: "For 6 s the receiving tower keeps its build-up even if it switches targets or has no target." },
  "energy-lasting-trace": { name: "Lasting Trace", description: "Upgrades Mark Guard: the receiving tower consumes no marks for 10 s." },
  "energy-fixation-lock": { name: "Fixation Lock", description: "Upgrades Target Lock: the receiving tower keeps its build-up for 10 s." },
  "energy-long-line": { name: "Long Line", description: "The receiving tower's range increases by 15% for 8 s." },
  "energy-full-tank": { name: "Full Tank", description: "For 10 s, the receiving tower deals 15% more damage while its energy is above 90%." },
  "energy-far-line": { name: "Far Line", description: "Upgrades Long Line: range increases by 25% for 12 s." },
  "energy-brimming-tank": { name: "Brimming Tank", description: "Upgrades Full Tank: 25% more damage for 10 s while energy is above 90%." },

  // --- Kristal toplayici: yon / derinlestirme -------------------------------
  "crystal-overload": { name: "Overload", description: "After each reactor delivery, your towers spend 15% less energy per shot for 6 s." },
  "crystal-heat-vent": { name: "Heat Vent", description: "Each reactor delivery lowers the heat of the 2 hottest towers by 15°." },
  "crystal-deep-overload": { name: "Deep Overload", description: "Upgrades Overload: 25% less energy per shot for 10 s after delivery." },
  "crystal-heat-purge": { name: "Heat Purge", description: "Upgrades Heat Vent: the 3 hottest towers cool by 20°." },
  "crystal-burst-reserve": { name: "Burst Reserve", description: "If a delivery fills the reactor, your towers fire without spending energy for 4 s. Cooldown: 20 s." },
  "crystal-steady-flow": { name: "Steady Flow", description: "After each reactor delivery, your towers spend no running energy for 10 s." },
  "crystal-burst-surge": { name: "Burst Surge", description: "Upgrades Burst Reserve: 6 s of energy-free fire, cooldown 15 s." },
  "crystal-steady-current": { name: "Steady Current", description: "Upgrades Steady Flow: no running energy is spent for 15 s." },
  "crystal-near-field": { name: "Near Field", description: "After each reactor delivery, towers within 2 tiles of the reactor deal 12% more damage for 8 s." },
  "crystal-far-link": { name: "Far Link", description: "Each reactor delivery sends 15 energy to the 2 towers farthest from the reactor." },
  "crystal-wide-field": { name: "Wide Field", description: "Upgrades Near Field: towers within 3 tiles deal 20% more damage for 8 s." },
  "crystal-far-grid": { name: "Far Grid", description: "Upgrades Far Link: 20 energy to the 3 farthest towers." },

  // --- Muhimmat toplayici: yon / derinlestirme ------------------------------
  "ammo-heavy-cast": { name: "Heavy Cast", description: "Each ammo batch delivered from the factory gives the tower's next 4 shots 20% more damage." },
  "ammo-light-cast": { name: "Light Cast", description: "A tower receiving ammo spends 25% less ammo per shot for 10 s." },
  "ammo-dense-cast": { name: "Dense Cast", description: "Upgrades Heavy Cast: the next 6 shots deal 30% more damage." },
  "ammo-feather-cast": { name: "Feather Cast", description: "Upgrades Light Cast: 40% less ammo per shot for 15 s." },
  "ammo-heat-sink-casing": { name: "Heat Sink Casing", description: "Shots from a tower receiving ammo generate 30% less heat for 10 s." },
  "ammo-piercing-core": { name: "Piercing Core", description: "Projectiles from a tower receiving ammo pierce 1 extra enemy for 10 s." },
  "ammo-cryo-casing": { name: "Cryo Casing", description: "Upgrades Heat Sink Casing: shots generate 45% less heat for 10 s." },
  "ammo-tungsten-core": { name: "Tungsten Core", description: "Upgrades Piercing Core: projectiles pierce 2 extra enemies for 10 s." },
  "ammo-armored-crate": { name: "Armored Crate", description: "A tower receiving ammo takes 20% less damage for 8 s." },
  "ammo-long-barrel": { name: "Long Barrel", description: "A tower receiving ammo has its range increased by 12% for 10 s." },
  "ammo-reinforced-crate": { name: "Reinforced Crate", description: "Upgrades Armored Crate: the tower takes 35% less damage for 8 s." },
  "ammo-rifled-barrel": { name: "Rifled Barrel", description: "Upgrades Long Barrel: range increases by 20% for 10 s." },

  // --- Muhimmat tasiyici: yon / derinlestirme -------------------------------
  "ammo-heat-jacket": { name: "Heat Jacket", description: "The receiving tower cools 40% faster for 8 s." },
  "ammo-fast-feed": { name: "Fast Feed", description: "The receiving tower fires 20% faster for 6 s." },
  "ammo-cryo-jacket": { name: "Cryo Jacket", description: "Upgrades Heat Jacket: the tower cools 70% faster for 12 s." },
  "ammo-belt-feed": { name: "Belt Feed", description: "Upgrades Fast Feed: the tower fires 30% faster for 8 s." },
  "ammo-trace-rounds": { name: "Trace Rounds", description: "The receiving tower's next 5 hits leave a 6 s Tracker mark on the target." },
  "ammo-concussion-rounds": { name: "Concussion Rounds", description: "The receiving tower's next 5 hits slow the enemy for 0.4 s." },
  "ammo-deep-trace": { name: "Deep Trace", description: "Upgrades Trace Rounds: the next 8 hits leave a 6 s Tracker mark." },
  "ammo-shock-rounds": { name: "Shock Rounds", description: "Upgrades Concussion Rounds: the next 8 hits slow the enemy for 0.6 s." },
  "ammo-shared-crate": { name: "Shared Crate", description: "Delivery leaves 2 ammo in each tower next to the target that uses the same ammo." },
  "ammo-lone-courier": { name: "Lone Courier", description: "A delivery to a tower with no towers on adjacent tiles makes it deal 15% more damage for 8 s." },
  "ammo-shared-depot": { name: "Shared Depot", description: "Upgrades Shared Crate: 4 ammo to each adjacent tower." },
  "ammo-lone-runner": { name: "Lone Runner", description: "Upgrades Lone Courier: 25% more damage for 12 s." },

  // --- Tamirci: yon / derinlestirme -----------------------------------------
  "repair-tune-up": { name: "Tune-Up", description: "A tower whose repair finishes spends 25% less energy per shot for 15 s." },
  "repair-coolant": { name: "Coolant", description: "A tower whose repair finishes has its heat reset and cools 30% faster for 15 s." },
  "repair-fine-tune": { name: "Fine Tune", description: "Upgrades Tune-Up: 40% less energy per shot for 20 s." },
  "repair-deep-coolant": { name: "Deep Coolant", description: "Upgrades Coolant: heat is reset and the tower cools 60% faster for 20 s." },
  "repair-armor-plating": { name: "Armor Plating", description: "A tower whose repair finishes takes 20% less damage for 12 s." },
  "repair-sight-tuning": { name: "Sight Tuning", description: "A tower whose repair finishes has its range increased by 15% for 12 s." },
  "repair-heavy-plating": { name: "Heavy Plating", description: "Upgrades Armor Plating: the tower takes 30% less damage for 12 s." },
  "repair-long-sight": { name: "Long Sight", description: "Upgrades Sight Tuning: range increases by 25% for 12 s." },
  "repair-spare-parts": { name: "Spare Parts", description: "A tower whose repair finishes refills ammo by 25% of its capacity." },
  "repair-battery-swap": { name: "Battery Swap", description: "A tower whose repair finishes refills energy by 25% of its capacity." },
  "repair-full-kit": { name: "Full Kit", description: "Upgrades Spare Parts: ammo refills by 50% of capacity." },
  "repair-full-charge": { name: "Full Charge", description: "Upgrades Battery Swap: energy refills by 50% of capacity." },

  // --- Uzmanlik secimleri (WORKER_SPECIALIZATION_CHOICES; kimlik rol adi) ----
  crystalCollector: { name: "Crystal Collector", description: "Manages the reactor's energy reserve and energy crises." },
  energyTransport: { name: "Energy Carrier", description: "Changes the energy grid's links and the towers' emergency operation." },
  ammoCollector: { name: "Ammo Collector", description: "Sets the ammo factory's quality, safety and battle recycling." },
  ammoTransport: { name: "Ammo Carrier", description: "Sets how ammo is distributed between towers and its assault windows." },
  repairer: { name: "Repairer", description: "Sets how repair protects towers, rebuilds them and defends the nexus." }
};

export const enWorkerRoleLabels: Readonly<Record<HirableWorkerRole, string>> = {
  crystalCollector: "Crystal Collector",
  energyTransport: "Energy Carrier",
  ammoCollector: "Ammo Collector",
  ammoTransport: "Ammo Carrier",
  repairer: "Repairer"
};

export const enWorkerRoleDescriptions: Readonly<Record<HirableWorkerRole, string>> = {
  crystalCollector: "Gathers raw energy from crystal nodes.",
  energyTransport: "Distributes collected energy to towers.",
  ammoCollector: "Gathers raw material from ammo nodes.",
  ammoTransport: "Carries produced ammo to towers.",
  repairer: `Repairs damaged structures without spending gold: ${WORKER_REPAIR_PER_SECOND} HP per second. Cannot revive a destroyed structure.`
};

/** Her Cephede nisaninin operator sayisi; kaynaktaki `OPERATOR_COUNT` disa acik degil. */
const OPERATOR_COUNT = 7;

/** Nisan kosullari kaynaktaki sabitlerle ayni bicimde kuruluyor. */
export const enBadges: Readonly<Record<string, { name: string; condition: string }>> = {
  // --- Savunma ---
  "hava-sahasi": { name: "Airspace", condition: "Clear wave 10 (all air) without a leak." },
  kesintisiz: { name: "Unbroken", condition: `Clear ${UNBROKEN_CLEAN_STREAK} waves in a row without a leak in one run.` },
  kusursuz: { name: "Flawless", condition: `Clear a stage with ${FINAL_WAVE}/${FINAL_WAVE} clean waves (★★★).` },
  kiyim: { name: "Carnage", condition: "Reach a RAMPAGE streak in one run (16 kills in 8 s)." },
  efsane: { name: "Legend", condition: "Reach a LEGENDARY streak in one run (22 kills in 11 s)." },
  "sampiyon-avcisi": { name: "Champion Hunter", condition: "Take down a champion (they appear from wave 6)." },
  "hizlanan-av": { name: "Quickening Hunt", condition: "Take down a champion faster than the previous one." },
  "kademe-2": { name: "Tier 2", condition: `Raise one of your towers to level ${TOWER_TIER_2_LEVEL} (TIER 2).` },
  "kademe-3": { name: "Tier 3", condition: `Raise one of your towers to level ${TOWER_TIER_3_LEVEL} (TIER 3).` },
  // --- Asamalar ---
  "ilk-zafer": { name: "First Victory", condition: "Clear stage 1." },
  "dogru-silah": { name: "Right Weapon", condition: "Have your top-damage tower of the run use the damage type the stage is weak to, and clear the stage." },
  "her-cephede": { name: "On Every Front", condition: `Clear stage 1 with all ${OPERATOR_COUNT} operators.` },
  "son-kale": { name: "Last Bastion", condition: `Clear stage ${STAGE_COUNT}.` },
  // --- Kesif ---
  arsivci: { name: "Archivist", condition: `See ${ARCHIVIST_CARD_TARGET} different cards in the Card Archive.` },
  // --- Operator imzalari ---
  "tam-dizilim": { name: "Full Formation", condition: "ZentaX: place three towers in a triangle (three corners of a 2×2 tile square) to form a trio formation." },
  "mukemmel-sutun": { name: "Perfect Column", condition: "ZentaX: drop the Column ultimate on the most crowded column (at least 3 enemies)." },
  "olgun-bag": { name: "Mature Link", condition: "AttackLord: keep a Server link alive for 10 waves." },
  "yalniz-kurt": {
    name: "Lone Wolf",
    condition: `AttackLord: have your isolation share pass ~${SYNERGY_SHARE_RUN_FLOOR.toLocaleString("en-US")} damage in one run (build towers with no neighbors).`
  },
  "tam-evrim": { name: "Full Evolution", condition: "DualiTemp: evolve a tower up to its 3rd evolution." },
  "sans-penceresi": { name: "Luck Window", condition: "Honour: fill up misfortune to open the luck window." },
  kasa: { name: "Vault", condition: "Honour: roll ×1.9 or higher on the die during the luck window." },
  "kilit-alan": { name: "Lock the Crowd", condition: `Zexceed: catch ${LOCK_CROWD_HITS} enemies at once with the Lock Field ultimate.` },
  "tam-dalga": {
    name: "No Wasted Wave",
    condition: `Boosty: have all ${FULL_HEAL_WAVE_HP} HP of Healing Wave return to the base (cast it while the base is missing at least ${FULL_HEAL_WAVE_HP} HP).`
  },
  "meteor-yagmuru": { name: "Meteor Shower", condition: `Bioside: kill ${METEOR_KILLS} enemies with a single meteor.` }
};

export const enBadgeGroupLabels: Readonly<Record<BadgeGroup, string>> = {
  defense: "Defense",
  stage: "Stages",
  explore: "Exploration",
  operator: "Operator signatures"
};

/**
 * Nisan unvanlari, `TITLE_CATALOG` kimligine gore (`b-<nisan>`). Ustalik
 * unvanlari (`m-<operator>-<seviye>`) `enMasteryTitle` ile kuruluyor.
 */
export const enTitles: Readonly<Record<string, string>> = {
  "b-hava-sahasi": "Air Warden",
  "b-kesintisiz": "Leakproof",
  "b-sampiyon-avcisi": "Champion Hunter",
  "b-dogru-silah": "Right Weapon",
  "b-her-cephede": "Seven Fronts",
  "b-son-kale": "Last Bastion",
  "b-arsivci": "Archivist",
  "b-kusursuz": "Flawless"
};

/** "ZentaX Kalfasi" -> "ZentaX Journeyman" (5), "ZentaX Ustasi" -> "ZentaX Master" (10). */
export const enMasteryTitle = (displayName: string, level: number): string =>
  `${displayName} ${level >= MASTERY_TITLE_LEVELS.master ? "Master" : "Journeyman"}`;

export const enStamps: Readonly<Record<StampStyleId, string>> = {
  klasik: "Classic",
  bronz: "Bronze seal",
  gumus: "Silver seal",
  altin: "Gold seal"
};

export const enArchiveRarityLabels: Readonly<Record<CardRarity, string>> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic"
};

export const enShopCategoryLabels: Readonly<Record<ShopItemCategory, string>> = {
  power: "Power",
  class: "Class",
  utility: "Utility",
  map: "Map",
  risk: "Risk"
};

export const enRoleTitleLabels: Readonly<Record<RoleTitleKind, string>> = {
  kills: "Butcher",
  assist: "Spotter",
  command: "Commander",
  repair: "Repairer",
  tower: "Tower Master"
};

export const enKillStreakTierLabels: Readonly<Record<KillStreakTier, string>> = {
  granted: "GRANTED",
  unstoppable: "UNSTOPPABLE",
  rampage: "RAMPAGE",
  legendary: "LEGENDARY"
};

export const enRunRoleTitles: Readonly<Record<keyof typeof RUN_ROLE_TITLES, string>> = {
  ...enRoleTitleLabels,
  level10: "Tower Master",
  streak: "Streak Master"
};

export const enUltimateResultLabels: Readonly<Record<UltimateResultKind, string>> = {
  column: "COLUMN",
  drones: "DRONES",
  repair: "REPAIR",
  meteor: "METEOR",
  lock: "LOCK FIELD",
  heal: "HEALING WAVE",
  sympathy: "SYMPATHY",
  nightmare: "GOTHIC NIGHTMARE",
  burst: "ULTIMATE"
};

export const enActivityLabels: Readonly<Record<TowerActivity, string>> = {
  cycle: "Attack cycle",
  target: "Awaiting target",
  ammo: "Awaiting ammo",
  energy: "Awaiting energy",
  heat: "Cooling",
  disabled: "Disabled / on standby",
  support: "Support cycle"
};

export const enChampionLabel = "CHAMPION";

// --- Kodeks (apps/web/src/codex.ts) -------------------------------------------

export const enClassTypeCodex: Readonly<Record<string, CodexEntry>> = {
  damage: { name: "Damage", text: "Its main job is killing enemies." },
  control: { name: "Control", text: "Slows, frightens and halts more than it damages." },
  support: { name: "Support", text: "Does not fire itself; empowers other towers." },
  hybrid: { name: "Hybrid", text: "Serves as both damage and support, depending on the situation." }
};

export const enDamageTypeCodex: Readonly<Record<DamageType, CodexEntry>> = {
  physical: { name: "Physical", text: "Golems are weak to it; Fourth Dimension natives resist it." },
  electric: { name: "Electric", text: "Mechs are weak to it; the Fallen resist it." },
  psychic: { name: "Psychic", text: "Fourth Dimension natives are weak to it; Mechs resist it." },
  fire: { name: "Fire", text: "Holy Guardians are weak to it; Space Bugs resist it." },
  light: { name: "Light", text: "The Fallen are weak to it; Holy Guardians resist it." },
  cellular: { name: "Cellular", text: "Space Bugs are weak to it; Golems resist it." },
  true: { name: "True", text: "Ignores armor and resistances entirely." },
  none: { name: "None", text: "Deals no damage; only applies effects." }
};

export const enHitTypeCodex: Readonly<Record<HitType, CodexEntry>> = {
  none: { name: "None", text: "Produces no attack or hit." },
  projectile: { name: "Projectile", text: "A shot that travels toward the target; loses time in flight." },
  impact: { name: "Impact", text: "Explosive hit. Level scales its damage, not its fire rate." },
  focus: { name: "Focus", text: "Channel or laser; frequent, small hits." },
  aura: { name: "Aura", text: "Area effect; usually does not pick targets." },
  contamination: { name: "Contamination", text: "An effect that spreads from enemy to enemy." },
  curse: { name: "Curse", text: "Deals no instant damage; builds up on the target." },
  wave: { name: "Wave", text: "An effect that spreads as it travels; makes contact along its path." },
  slash: { name: "Slash", text: "Contact hit from a spinning or swung blade." }
};

export const enTowerAxisLabels: Readonly<Record<TowerAxis, string>> = {
  dps: "Damage",
  cc: "Control",
  amplify: "Amplify",
  economy: "Economy",
  barricade: "Barricade"
};

export const enCardRarityLabels: Readonly<Record<CardRarity, string>> = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  epic: "epic"
};

export const enAttackShapeLabels: Readonly<Record<TowerAttackShape, string>> = {
  single: "Single target",
  line: "Line",
  cone: "Cone",
  circle: "Circle",
  beam: "Beam",
  orbit: "Orbit"
};

export const enAmmoTypeLabels: Readonly<Record<AmmoType, string>> = {
  bullet: "Bullet",
  auraCrystal: "Aura crystal",
  powerCrystal: "Power crystal"
};
