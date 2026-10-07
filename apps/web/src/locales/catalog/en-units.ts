import {
  ISOLATION_SLOW_FRACTION_LEVEL_1,
  ISOLATION_SLOW_FRACTION_LEVEL_10,
  KIN_SLOW_FAR_FRACTION,
  getCriticalSlowFraction
} from "@karayel/shared";

/**
 * Kulelerin, operatorlerin, becerilerin ve asamalarin Ingilizce metinleri
 * (kimlige gore). Kaynak Turkce katalog; sozluk docs/i18n-glossary.md.
 */

// Ikmal yapilarinin aciklamalari uc karakterde birebir ayni; tek yerde tutuluyor.
const AMMO_SUPPLY_DESCRIPTION =
  "Consumes delivered energy and ammo raw material to produce ammo; the logistics worker carries the output to towers with delivery enabled.";
const ENERGY_SUPPLY_DESCRIPTION =
  "Stores crystals brought in by crystal workers as energy; the energy worker carries this energy to towers.";

export const enTowers: Readonly<Record<string, { name: string; role: string; description?: string }>> = {
  // ------------------------------------------------------------ AttackLord (warrior)
  "warrior-1": {
    name: "Tracker",
    role: "Damage and marking",
    description: "AttackLord's core tower that unlocks team damage. Deals balanced single-target damage and puts a Tracked mark on the enemy it hits. A marked enemy takes more damage not only from AttackLord but from every tower on the team, so it is meant to be built early to mark the front of the wave. Can also hit air targets."
  },
  "warrior-2": {
    name: "Server",
    role: "Global support",
    description: "Does not pick targets or fire on its own; it links to two towers and hits enemies that escape their range anywhere on the map with an electric orb. Its range is global, so it does not need to sit on the line. If it stays linked to the same tower for 5 waves, it adds bonus damage to that tower's impact hits; after 10 waves linked, it adds bonus damage equal to a percentage of the target's max health to every hit. Keeping the link intact is rewarded. Not affected by AttackLord's solitude passive."
  },
  "warrior-3": {
    name: "Isolation Tower",
    role: "Area control",
    description: `Deals no damage, only slows: ${Math.round(ISOLATION_SLOW_FRACTION_LEVEL_1 * 100)}% at level 1, rising evenly each level to ${Math.round(ISOLATION_SLOW_FRACTION_LEVEL_10 * 100)}% at level 10. With other towers nearby it slows targets one at a time; left fully alone, it stops firing and switches to a constant slow aura of the same strength. Designed to be built alone at the line's chokepoint.`
  },
  "warrior-4": {
    name: "Obsession Tower",
    role: "Single-target damage",
    description: "Each consecutive hit on the same enemy raises its damage by 20%; switching targets resets the buildup. So it does not pick targets at random: it prioritizes the toughest enemy. As an impact tower, it gains damage rather than fire rate as it levels up."
  },
  "warrior-5": {
    name: "Debug Laser",
    role: "Sustained damage",
    description: "A focus laser that hits very often for small amounts; weak alone, devastating alongside Tracker. Prioritizes Tracked enemies. Overdrive unlocks at level 5; at level 10, two counter-rotating beams join the chain beam. When it kills a marked enemy it enters overdrive for 2 seconds and becomes a beam reaching to the map edge: it aims at the nearest enemy, turns from there to the next nearest, and hits everyone it passes at normal fire rate. At level 10, two more beams emerge from the same direction alongside the chain beam, one sweeping a full turn clockwise and the other counterclockwise; an enemy under more than one beam is hit once per shot. It heats up under continuous fire: if it fills 10 seconds within a 20-second window, it overheats and goes quiet for 5 seconds. Cannot hit air targets."
  },
  "warrior-6": {
    name: "Ucube",
    role: "Late-game damage",
    description: "A late-game investment. Very expensive and does not pay for itself when built. As long as it stays on the field it evolves permanently every 2 completed waves, unlocking its final bonus at wave 16. It also gains fire rate stacks while firing nonstop; stacks reset if it is left without a target. Build it early and feed it; building it late wastes the investment. Can hit air targets."
  },
  "warrior-7": { name: "Ammo Depot", role: "Ammo supply", description: AMMO_SUPPLY_DESCRIPTION },
  "warrior-8": { name: "Energy Reactor", role: "Energy supply", description: ENERGY_SUPPLY_DESCRIPTION },

  // ------------------------------------------------------------ DualiTemp (archer)
  "archer-1": {
    name: "Seeker",
    role: "Locked single target",
    description: "Locks onto a target that enters its range and does not let go. While approval dominates, it keeps tracking even if the target leaves range; in balance or stress, the lock breaks when the target leaves range. The more Seekers locked onto the same target, the more their damage grows together, so they are built in pairs or threes."
  },
  "archer-2": {
    name: "Flare",
    role: "Rage burst",
    description: "If it fails to kill its target before the target leaves range, it flies into a rage and releases double area damage and a half-second fear wave around itself. So every target it fails to kill turns into an explosion. While stress dominates, the blast also halts allied towers in its area for half a second; powerful but uncontrolled."
  },
  "archer-3": {
    name: "Curse Tower",
    role: "Accumulating curse load",
    description: "Loads curse onto enemies in its area. Curse deals no direct damage and stacks without limit; when a cursed enemy dies, it releases psychic damage around itself equal to its stored load. So the real damage comes from the dying enemy, not the tower that kills it. Used to set up chain explosions in crowded waves."
  },
  "archer-4": {
    name: "Bond of the Dead",
    role: "Execute and soul bond",
    description: "Binds to an enemy and holds the bond until that enemy dies or reaches the nexus. When the target's health drops below the execute threshold, it drags it straight into the realm of the dead; the enemy dies regardless of remaining health. The longer the bond lasts, the higher the threshold, so the longer it holds a target, the earlier it executes it. Each enemy it drags grants DualiTemp approval or stress depending on mode."
  },
  "archer-5": {
    name: "Broken Mirror",
    role: "Delayed burst",
    description: "Deals almost no damage itself; it stores part of the damage dealt by DualiTemp towers within the 8 neighboring tiles. When its store is full, it releases the stored damage in one burst with a multiplier between 1.10 and 2.00 depending on level. So the stronger the towers around it, the bigger the blast. Picks targets by mood: in approval the enemy nearest the exit, in balance the highest-health enemy, in stress a random enemy."
  },
  "archer-6": {
    name: "Whisper Choir",
    role: "Area control and doubt",
    description: "Emits a wave that disrupts the enemy's decision-making. Loads Doubt onto every enemy it hits; each load applies a 10% slow, and an enemy with enough doubt briefly stalls and does not advance at all. Not a damage tower; built to hold the wave in place."
  },
  "archer-7": { name: "Shadow Armory", role: "Ammo supply", description: AMMO_SUPPLY_DESCRIPTION },
  "archer-8": { name: "Soul Reactor", role: "Energy supply", description: ENERGY_SUPPLY_DESCRIPTION },

  // ------------------------------------------------------------ ZentaX (zeynep)
  "zeynep-1": {
    name: "Alignment Order",
    role: "Piercing physical projectile",
    description: "ZentaX's core damage tower. Its projectile pierces the first enemy it hits, keeps traveling on the same line, deals full damage to a second enemy behind it, then vanishes. So it is built facing the straight stretches of the path, where enemies line up one behind another."
  },
  "zeynep-2": {
    name: "Spectacle Tower",
    role: "Light line",
    description: "Fires at very long intervals but is selective when it does: at the moment of firing it computes the line segment that crosses the most enemies and sets off a sudden light burst along it. It does not hit single targets; it hits the line the crowd forms. Weak against sparse waves, the strongest tower against packed ones."
  },
  "zeynep-3": {
    name: "Throne Seal",
    role: "Synthesis link",
    description: "Has no damage or hit type of its own; what it does depends on the towers beside it. In a valid triangle formation with two Alignment Orders, it fires a double piercing projectile. With two Spectacle Towers, it leaves an area that burns with light impacts. With one Alignment Order and one Spectacle Tower, it fires a piercing beam of mixed physical and light that ricochets off the map edge. The center of ZentaX's formation game."
  },
  "zeynep-6": {
    name: "Grudge Tower",
    role: "Distance-based slow",
    description: `Sends a slow-moving 60-degree cone wave at long intervals. The slow increases with distance from the tower: an enemy caught at its base is not slowed, one at the edge of range is slowed ${Math.round(KIN_SLOW_FAR_FRACTION * 100)}% (${Math.round(getCriticalSlowFraction(KIN_SLOW_FAR_FRACTION) * 100)}% with an Ice Shard crit), so the edge of its range is the real effect zone. Its slow does not stack; it is recalculated on each new wave contact.`
  },
  "zeynep-7": {
    name: "Palace Archive",
    role: "Synthesis amplifier",
    description: "Never fires and is useless on its own. Its job is to permanently strengthen Throne Seal synthesis combinations: at level 2 it adds +1 pierce to double Alignment synthesis, at level 3 +1 second to the burn duration of double Spectacle synthesis, and at level 6 +1 ricochet to the mixed synthesis beam. Expensive; worth it only with more than one Throne Seal on the field."
  },
  "zeynep-8": {
    name: "Hyperbole",
    role: "Passive hit modulator",
    description: "Does not take up a normal tower tile; it sits on tile edges, 2 lines long, and does not fire. It alters allied shots passing through it: extends the range of Spectacle light lines and deepens their color, adds armor break to Alignment projectiles, and if the mixed synthesis beam passes through, each enemy it pierces transfers more damage to the next. It strengthens the shot's path, not the tower, so it is built on the line of fire."
  },
  "zeynep-9": { name: "Ammo Council", role: "Ammo supply", description: AMMO_SUPPLY_DESCRIPTION },
  "zeynep-10": { name: "Energy Furnace", role: "Energy supply", description: ENERGY_SUPPLY_DESCRIPTION },

  // ------------------------------------------------------------ Honour (onur)
  "onur-1": {
    name: "Saw",
    role: "Spinning contact damage",
    description: "Two energy blades spin around it, slashing enemies they touch."
  },
  "onur-2": {
    name: "Jackpot",
    role: "Long-range sniper",
    description: "Fires slow but heavy projectiles; cannot hit nearby targets and gains crit chance against bleeding targets."
  },
  "onur-3": { name: "Silent Arrow", role: "Long range" },
  "onur-4": { name: "Focus Line", role: "Heavy hit" },
  "onur-5": { name: "Trail Hound", role: "Target tracking" },
  "onur-6": { name: "Honour's Edge", role: "Elite single target" },

  // ------------------------------------------------------------ Bioside (mage)
  "mage-1": { name: "Violet Burst", role: "Area damage" },
  "mage-2": { name: "Rift Stone", role: "Spell damage" },
  "mage-3": { name: "Cosmic Ring", role: "Wide area" },
  "mage-4": { name: "Energy Orb", role: "Slow but heavy" },
  "mage-5": { name: "Mana Fracture", role: "Chain damage" },
  "mage-6": { name: "Bioside Meteor", role: "High AOE" },

  // ------------------------------------------------------------ Zexceed (tank)
  "tank-1": { name: "Heavy Chain", role: "Slow" },
  "tank-2": { name: "Yellow Wall", role: "Defense" },
  "tank-3": { name: "Lock Tower", role: "Control" },
  "tank-4": { name: "Anchor Shot", role: "High slow" },
  "tank-5": { name: "Shield Cannon", role: "Durable defense" },
  "tank-6": { name: "Zexceed Bastion", role: "Strongest control" },

  // ------------------------------------------------------------ Boosty (healer)
  "healer-1": { name: "Healing Light", role: "Support damage" },
  "healer-2": { name: "Pink Shield", role: "Safe defense" },
  "healer-3": { name: "Team Light", role: "Balanced support" },
  "healer-4": { name: "Life Wave", role: "Area control" },
  "healer-5": { name: "Guard Ring", role: "Slow" },
  "healer-6": { name: "Boosty's Hope", role: "Team-focused tower" },

  // ------------------------------------------------------------ Ortak yapilar
  "wall-1": {
    name: "Wall",
    role: "Routing",
    description: "Does not take up a tile; it sits on the line between two tiles and closes that crossing. It turns horizontal if the edge it is brought to is horizontal, vertical if vertical. Enemies do not know the map: they walk toward the exit, and on hitting a wall they go around it looking for an open passage. If the line is walled off end to end, they stop circling and break the wall in front of them. Thickening raises its health and so how long it holds them. A destroyed wall does not come back on its own; repairing costs less than a full rebuild."
  },
  "repair-depot-1": {
    name: "Repair Depot",
    role: "Repairer base",
    description: "Does not fire. Base for Repairer workers: they return here and wait when idle. When a structure takes damage, the response starts from this depot — the Repairer first repairs the worst-off structure around the depot, and once nothing nearby needs repair it looks to the rest of the map. Upgrading widens the surrounding ring. A Repairer without a depot still works, but the player cannot decide where it runs."
  }
};

/**
 * `theme` kaynakta istege bagli: Honour, Bioside, Zexceed ve Boosty'de yok.
 * `displayName` cevrilmiyor (operator adlari degismez).
 */
export const enCharacters: Readonly<Record<string, { role: string; theme?: string; summary: string; passive: string; ultimate: string }>> = {
  zeynep: {
    role: "Command and Formation",
    theme: "An order game that issues commands with Prestige and strengthens towers through pair and triad formations.",
    summary: "Building towers is not the end of it; it runs the line with commands. It spends the Prestige gathered from kills on team-wide fire rate, range or slow, and the effects grow as it chains commands. When its towers stand in an exact pair or a triangle triad they get an extra buff; if an extra tower joins the group, the buff breaks.",
    passive: "Chain of Authority: ZentaX gathers Prestige from enemies it kills and issues commands with it. Chaining commands back to back raises Chain Quality, which increases both the strength and the duration of commands. In addition, towers in an exact pair or a triangle triad get a formation buff; the buff level is based on the lowest-level tower in the formation, and if a fourth tower joins the group the buff breaks.",
    ultimate: "Founder's Decree: A column of the map is chosen and the whole column is set alight with light from top to bottom; every enemy in it takes heavy damage and is briefly slowed. Damage does not scale with waves; to grow it you must upgrade ultimate power with gold. Even upgraded, only choosing the right column at the right moment wins: waiting for the moment the line piles up in that lane matters as much as the ultimate itself."
  },
  warrior: {
    role: "Modular Strategist",
    theme: "A synergy game built on isolating, marking and linking tower placements.",
    summary: "Its towers are not strong one by one; its power comes from placement. Its passive makes towers standing alone work more efficiently, enemies marked by Tracker take more damage from the whole team, and Server links two towers to hit whatever escapes their range. A well-built modular line multiplies raw power.",
    passive: "Solitary Productivity: If all eight tiles around it are empty, an AttackLord tower works far more efficiently: range x1.5, damage x1.5, fire interval x0.67 — x2.25 DPS in total. Solitude is measured by tower adjacency: any tower on an adjacent tile breaks it, regardless of whose tower it is or whether it is a Server. Walls do not break it; a wall is not a tower, and walling a tower in does not turn the passive off. Server itself does not get this bonus. Rewards spreading towers along the line instead of stacking them in one spot.",
    ultimate: "Full Automation: On press, choose Attack or Repair mode and the energy is spent at once. Every AttackLord tower launches a mini drone. In Attack mode the drone goes to the nearest enemy and deals 110 damage — enough to one-shot the toughest enemy of the first wave; a tower with no enemy in range launches no drone. In Repair mode each drone restores 3 health to the nexus. Damage does not scale with waves: to grow it you must upgrade ultimate power with gold, and each tier doubles the damage. In return, AttackLord's ultimate bar fills 3 times slower, and after the drones launch every AttackLord tower stays Exhausted for 3 seconds, meaning it cannot fire."
  },
  archer: {
    role: "Evolution Specialist",
    theme: "A pressure game that turns the balance of approval and stress into tower evolution.",
    summary: "At every moment it decides for itself whether to put the points earned from kill streaks toward approval or stress. Approval strengthens its first three towers, stress buys evolutions; since the leading side erodes every wave, settling on either one is impossible. A player who turns the bar at the right time reaches both strong towers and evolutions.",
    passive: "You're Super: DualiTemp earns points from consecutive kill streaks and chooses whether to put them toward approval or stress. Approval boosts the damage and fire rate of the first three favorite towers it builds; stress is the currency for buying evolutions with Lethal Stress. A wave passed without a streak adds stress, and at the end of every wave the leading side erodes a little: neither extreme is a parking spot.",
    ultimate: "Gothic Nightmare: The map's entrances and exits close for 9 seconds. No new enemies spawn, and enemies inside cannot reach the nexus. For the duration, DualiTemp towers switch to true damage that ignores armor and gain 50% damage and 25% fire rate. Used to clear a wave trapped on the field."
  },
  mage: {
    role: "AOE",
    summary: "Slow, but high area damage.",
    passive: "Field Energy: Not active yet. Bioside currently gets no passive bonus; its power comes entirely from its towers, skills and ultimate.",
    ultimate: "Meteor: Drops a blast on the most crowded area."
  },
  healer: {
    role: "Support",
    summary: "A class that supports team health and defensive rhythm.",
    passive: "Team Resilience: Not active yet. Boosty currently gets no passive bonus; its power comes entirely from its towers, skills and ultimate.",
    ultimate: "Life Wave: Restores team health and slows enemies."
  },
  tank: {
    role: "Tank",
    summary: "Focused on slow and path control.",
    passive: "Heavy Pressure: Not active yet. Zexceed currently gets no passive bonus; its power comes entirely from its towers, skills and ultimate.",
    ultimate: "Lock Zone: Briefly slows enemies."
  },
  onur: {
    role: "Gambler",
    summary: "Builds up misfortune to turn variable damage rolls into high-risk windows of opportunity.",
    passive: "Gambler's Dream: Attack towers hit for a random 0.5×–1.5×; when misfortune fills, the 0.95×–2.0× range opens for 10 seconds.",
    ultimate: "Sympathy: For 8 seconds, every tower on the field links to its nearest tower, forming a visible bond between them. Ground enemies touching a bond walk at half speed until they cross it, and each enemy takes a 3-second bleed, at most once. The web is recalculated constantly, so towers built during the ultimate join it too."
  }
};

export const enSkills: Readonly<Record<string, { name: string; description: string }>> = {
  // ------------------------------------------------------------ ZentaX
  "zeynep-skill-1": {
    name: "Speed Up",
    description: "A command that spends Prestige. Grants timed fire rate to every tower on the team. Can be issued at three tiers: small, medium and large; higher tiers raise both the Prestige cost and the effect. If it closes a chain, it grows stronger still by the Chain Quality."
  },
  "zeynep-skill-2": {
    name: "Hold the Ground",
    description: "A command that spends Prestige. Grants timed range to every tower on the team and widens the area the defense line covers. Three tiers; if it closes a chain, it grows stronger by the Chain Quality."
  },
  "zeynep-skill-3": {
    name: "Slow Them Down",
    description: "A command that spends Prestige. Applies a timed slow to every enemy on the map. Three tiers; if it closes a chain, it grows stronger by the Chain Quality. Used to buy time against a wave nearing the nexus."
  },

  // ------------------------------------------------------------ AttackLord
  "warrior-skill-1": {
    name: "Redirect",
    description: "Hold and drag to mark an area on the map. For 3 seconds, projectile towers ignore their range limit and fire at enemies in that area, and enemies in the area take 30% more damage. Used to plug a leak opening far from the line."
  },
  "warrior-skill-2": {
    name: "Refactor",
    description: "Moves the selected tower to another valid tile without losing gold. Its level and accumulated bonuses are kept; it fixes a bad placement instead of selling and rebuilding."
  },
  "warrior-skill-3": {
    name: "Execute",
    description: "Instantly executes a single enemy you choose. No effect on Crushers, champions and Tower Hunters; no cooldown is spent on an immune or invalid target."
  },

  // ------------------------------------------------------------ DualiTemp
  "archer-skill-1": {
    name: "Tyrant",
    description: "Pins a tank enemy in the chosen area in place and switches its side. For 7 seconds, the pinned enemy deals damage per second equal to 15% of its own max health to enemies around it. Used to break a crowded wave with its own tank."
  },
  "archer-skill-2": {
    name: "Lethal Stress",
    description: "Advances the selected DualiTemp tower to its next evolution and pays the cost in stress: evolution 1 costs 10, evolution 2 costs 16, evolution 3 costs 24 stress. The stress paid pushes the bar back toward approval, so every evolution spends the pressure you built up."
  },
  "archer-skill-3": {
    name: "Focus",
    description: "For 5 seconds, all DualiTemp towers lock onto the target they are currently hitting and their projectile speed rises to 3x. The tower that lands the last hit during this time gains 5x fire rate until Focus ends. Used to melt a single tough target."
  },

  // ------------------------------------------------------------ Bioside
  "mage-skill-1": { name: "Mana Harvest", description: "Earns gold for the team." },
  "mage-skill-2": { name: "Violet Burst", description: "Deals area damage to all enemies." },
  "mage-skill-3": { name: "Meteor Prep", description: "Deals strong global spell damage." },

  // ------------------------------------------------------------ Boosty
  "healer-skill-1": { name: "Morale", description: "Earns gold for the team." },
  "healer-skill-2": { name: "Healing Wave", description: "Raises team health and slows enemies." },
  "healer-skill-3": { name: "Guard Rhythm", description: "Provides health and gold support." },

  // ------------------------------------------------------------ Zexceed
  "tank-skill-1": { name: "Defensive Order", description: "Earns gold for the team." },
  "tank-skill-2": { name: "Heavy Lock", description: "Slows enemies and deals damage." },
  "tank-skill-3": { name: "Bastion Strike", description: "Applies a strong slow and deals area damage." },

  // ------------------------------------------------------------ Honour
  "onur-skill-1": { name: "Tracking", description: "Earns gold for the team." },
  "onur-skill-2": { name: "Clear Target", description: "Deals heavy damage to the strongest enemy." },
  "onur-skill-3": { name: "Sharp Finish", description: "Deals very heavy damage to the strongest enemy." }
};

export const enUcubePerks: Readonly<Record<string, { name: string; description: string }>> = {
  chain: { name: "Chain", description: "Also jumps to the enemy behind the target it hits; jump damage grows with tower level." },
  pushback: { name: "Knockback", description: "Knocks the enemy it hits back along the path, so it stays in range longer." },
  "damage-step": { name: "Calibration", description: "Damage increases by 20%." },
  "stacks-15": { name: "Wide Charge", description: "Fire rate stack cap rises from 10 to 15." },
  "range-hull": { name: "Wide Hull", description: "Range doubles, max health doubles and health refills." },
  endurance: { name: "Composure", description: "Removes the 20-second forced shutdown and gains an extra damage multiplier at high levels." },
  "damage-double": { name: "Overload", description: "Damage doubles." },
  "stacks-20": { name: "Deep Charge", description: "Fire rate stack cap rises to 20." }
};

export const enStages: Readonly<Record<number, { name: string; raceName: string; description: string }>> = {
  1: { name: "Stone Siege", raceName: "Golem", description: "Heavy and slow. Weak to physical damage, resistant to cellular." },
  2: { name: "Steel Line", raceName: "Mech", description: "A machine line. Weak to electric, resistant to psychic." },
  3: { name: "Swarm", raceName: "Space Bug", description: "Comes in crowds. Weak to cellular, resistant to fire." },
  4: { name: "The Fall", raceName: "The Fallen", description: "Corrupted guardians. Weak to light, resistant to electric." },
  5: { name: "Folding", raceName: "Fourth Dimension", description: "Absorbs physical damage. Only psychic truly works." }
};
