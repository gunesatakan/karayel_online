# Resource economy and worker assignment

Three player-facing professions: Gatherer, Carrier, Repairer. Existing role IDs remain accepted for old clients, but snapshots, hiring controls and the shared research screen show unified professions. The starting four workers are two gatherers and two carriers, initially assigned to energy and gunpowder/bullets.

## Production chains

- Energy crystal nodes -> gatherer -> energy reactor -> carrier -> buildings.
- Gunpowder -> gatherer -> ammunition factory + energy -> bullets -> carrier -> compatible towers.
- Mystic essence from purple portals -> factory + energy -> aura/psychic ammunition.
- Power crystals from plasma deposits -> factory + energy -> power ammunition.
- Iron -> gatherer -> repair depot + energy -> repair parts -> repair worker -> damaged structure.

One ammunition costs one matching raw material and 0.25 energy. The factory divides its level-dependent production budget between available recipes; finished ammo shares its capacity. Each raw material has its own level-dependent capacity. Psychic tower profiles use aura ammunition, including psychic projectile towers.

One repair part costs one iron and one energy and restores at most 10 HP. Repairers load parts physically at a depot and return when empty. Emergency Rebuild also consumes depot parts. The depot caps at level 5: rates 0.5/1/1.75/3/5 parts per game second, storage 20/65/110/155/200 and health 1/1.25/1.5/1.75/2 times the base. Production and repair use game time.

## Controls

Open Workers, select a worker, then tap a resource node (gatherer) or a source building (carrier/repairer). Carriers choose energy or an ammo type before selecting the source. Existing cargo is delivered before a queued assignment takes effect. Assignments are owner-validated, persist through respawn and move with reconnection. Delivery priorities and blocked-route rerouting remain in force.

The roster scrolls within 26dvh and collapses into a small instruction strip during map selection. Checked at a 390 x 844 viewport: open roster height 281px; assignment strip 106px. Worker research has three columns and resource-specific extraction/capacity/speed choices.

## Generated artwork

Created using built-in ImageGen with transparent backgrounds; runtime PNGs are 128 x 128 with alpha transparency. Level 1 repair depot is bronze/gunmetal with teal lights and a wrench motif. Level 5 is a much larger titanium/silver workshop with violet lights and robotic arms. The level 5 sprite replaces the base sprite at maximum level.

Art direction used for individual generations: overhead orthographic strategy-game sprite, centered complete silhouette, readable broad forms at small scale, polished painted science-fiction materials, actual transparent background, no text, no ground tile, no watermark.

Subjects: (1) basic mechanical repair workshop with teal lighting and wrench emblem; (2) advanced titanium repair workshop with purple core and robotic repair arms; (3) dark iron ore outcrop with silver exposed veins; (4) mysterious violet portal entrance with stone/metal ring and purple energy interior; (5) gunpowder/sulfur mineral deposit with amber accents; (6) bright cyan energy crystal cluster; (7) contained red-orange plasma/power crystal deposit.

Assets: `apps/web/public/images/towers/tower-supply-repair.png`, `tower-supply-repair-level-5.png`, and `apps/web/public/images/resources/resource-{energy,gunpowder,mystic,plasma,iron}.png`.

Original generated images remain in the Codex generated-images directory for this chat. Runtime assets are included in Git; no runtime dependency on the image generation service.

## Finite deposits

Each map resource node starts with 2,000 shared units. Extraction deducts only the loaded amount, clamps the last partial load to the reserve and never regenerates on a new wave or worker respawn. A new match starts with fresh reserves. Exhausted nodes remain visible at reduced opacity with a zero count; assigned gatherers deliver their remaining cargo and wait for reassignment. Node labels and the worker roster show the remaining amount. Resource sprites are 25% smaller than the original size (0.7125 of one cell).
