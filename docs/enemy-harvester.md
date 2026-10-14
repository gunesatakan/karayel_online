# Enemy workers

Workers raid from both map edges starting at wave 3. Each wave adds a pack
of `min(12, 3 + floor(wave / 3))` workers, alternating between left and right.
This is half the former count at every wave: 4 at wave 3, 5 at wave 6,
6 at wave 9, eventually capped at 12. Odd packs differ by one worker between sides.
They use the same wave-scaled health and armor as a brute, with an additional shield
equal to their maximum health. Their movement and status effects use the normal
enemy combat pipeline.

Each worker gathers 8 units per second, up to a 20-unit quota, from finite iron,
gunpowder, mystic or plasma deposits. Energy deposits are excluded. Empty deposits
are retargeted; if no materials remain, the worker retreats with its partial load.
Workers return to their entry position and leave without nexus damage or kill
rewards. Killing one restores its cargo to the original deposit(s), once, and
awards normal brute kill rewards. Towers and edge walls block their routes and can
be attacked. Navigation fields are shared across the pack and invalidated when
structures change.

The client displays the ordinary health/shield indicators and a small cargo bar,
amber while collecting and red while retreating. Remaining-enemy counts include
pending raiders. Formerly all-air waves are marked mixed because raiders are ground
units. The pack is additional to the existing champion and special-enemy budget.

## Sprite

Each race has a separately generated overhead, nonhumanoid worker sprite:

- `apps/web/public/images/enemies/enemy-meka-harvester.png`: mechanical mining crab.
- `apps/web/public/images/enemies/enemy-golem-harvester.png`: basalt stone scarab.
- `apps/web/public/images/enemies/enemy-spaceBug-harvester.png`: purple chitin beetle.
- `apps/web/public/images/enemies/enemy-fourthDimensional-harvester.png`: geometric crystal crawler.
- `apps/web/public/images/enemies/enemy-holyGuardian-harvester.png`: ivory/gold scarab.
- `apps/web/public/images/enemies/enemy-fallen-harvester.png`: corrupted obsidian arachnid.

All assets use transparent 512 × 512 canvases and the ordinary grunt display-size
calculation. Alpha bounds are normalized to a 450-pixel maximum extent so the
painted bodies have a consistent apparent size. The old generic sprite is retained
as an unused source asset. Client texture selection now uses the enemy's race.

Generated with the built-in ImageGen tool; resized with System.Drawing preserving
alpha. Each asset was generated separately with the common prompt plus its race
prompt below.

Common prompt:

> Use case stylized-concept. Nexhold production enemy worker sprite. ONE low squat nonhumanoid SIX-LEGGED resource harvesting creature with dorsal cargo receptacle and two small gathering mandibles pointing DOWN. Strict 90 degree orthographic overhead view showing back only, NO upright biped, NO human arms, NO isometric view. Dark detailed painted game art, strong readable silhouette at 45px. Whole body centered in square with generous consistent margin, transparent background, no ground, shadow, UI, text or frame.

Race prompts:

- meka: Mechanical mining crab, gunmetal plates, red seams and cyan shield coils, rectangular dorsal cargo bin containing ore, six compact hydraulic limbs.
- golem: Living basalt stone scarab, six chunky rock limbs, violet rune cracks, hollow stone bowl in dorsal shell carrying crystals; organic stone silhouette, no metal machinery.
- spaceBug: Biological alien harvester beetle, dark purple layered chitin, six hooked insect legs, green bioluminescent nodes, bulbous dorsal organic cargo sac with mineral fragments, mandibles. No machinery.
- fourthDimensional: Alien geometric crystal crawler, six floating faceted obsidian-violet limbs arranged radially, central polygonal cargo aperture holding suspended ore, purple dimensional seams. No humanoid torso.
- holyGuardian: Sacred white marble scarab automaton, six radial ivory-gold articulated limbs, gold inscriptions and warm light seams, open dorsal ivory reliquary holding minerals, broad shieldlike shell.
- fallen: Corrupted black bone and cracked obsidian mining arachnid, six hooked crawling legs, dull crimson and purple fissures, thorn-edged dorsal cargo cage with ore, small chains close to body. No humanoid.

Verification: `tests/harvester-enemies.test.mjs` exercises spawning, durability,
finite extraction, quota retreat, cargo recovery, exhaustion, concurrent extraction,
blocking structures, immobilization, snapshots and the halved count curve.
