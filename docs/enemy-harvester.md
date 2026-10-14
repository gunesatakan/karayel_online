# Enemy workers

Workers raid from both map edges starting at wave 3. Each wave adds an even pack
of `min(24, 6 + 2 * floor(wave / 3))` workers, split equally between left and right.
They use the same wave-scaled health and armor as a brute, with an additional shield
equal to their maximum health. Their movement and status effects use the normal
enemy combat pipeline.

Each worker gathers 4 units per second, up to a 20-unit quota, from finite iron,
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

All stages currently use the same six-limbed armored mining crawler. This is a
strict overhead sprite, not a humanoid or an isometric character. It uses a
transparent 512 × 512 canvas and the existing brute display-size calculation;
the painted body has padding consistent with the other enemy assets.

Saved asset: `apps/web/public/images/enemies/enemy-harvester.png`.
Generated using the built-in ImageGen tool, then resized with System.Drawing,
preserving alpha. The original generated image remains in Codex generated_images.

Final generation prompt:

> Use case: stylized-concept. Asset: single production game sprite for Nexhold enemy resource-stealing worker. Dark painted sci-fi fantasy style, textured gunmetal armored plates with small red hostile sensor accents and cool blue shield emitters, matching detailed dark tower-defense sprites. A low broad SIX-LEGGED scarab-like mechanical mining crawler, six short articulated radial legs, two compact mining pincers pointing DOWN toward bottom of image, stout central enclosed cargo hopper with iron and purple mineral pieces visible from above. STRICT orthographic TOP-DOWN 90 degree overhead view, only dorsal surfaces, absolutely no upright humanoid, no biped, no face portrait, no isometric or perspective side surfaces. One centered isolated whole unit, square composition, fills 85 percent canvas, all limbs inside margins. Clear bold silhouette legible at 45 pixels in game. No ground, no cast shadow, no floor, no text, no UI, no border. Genuinely transparent background. 1024 square.

Verification: `tests/harvester-enemies.test.mjs` exercises paired spawning,
durability, finite extraction, quota retreat, cargo recovery, exhaustion,
concurrent extraction, blocking structures, immobilization and snapshots.
