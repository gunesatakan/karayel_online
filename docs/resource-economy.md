# Resource economy and worker assignment

Three player-facing professions: Gatherer, Carrier, Repairer. Existing role IDs remain accepted for old clients, but snapshots, hiring controls and the shared research screen show unified professions. The starting four workers are two gatherers and two carriers, initially assigned to energy and gunpowder/bullets.

## Production chains

- Energy crystal nodes -> gatherer -> energy reactor -> carrier -> buildings.
- Gunpowder -> gatherer -> warehouse -> assigned input carrier -> ammunition factory + energy -> bullets -> carrier -> compatible towers.
- Mystic essence from purple portals -> warehouse -> input carrier -> factory + energy -> aura/psychic ammunition.
- Power crystals from plasma deposits -> warehouse -> input carrier -> factory + energy -> power ammunition.
- Iron -> gatherer -> warehouse -> input carrier -> repair depot + energy -> repair parts -> repair worker -> damaged structure.

One ammunition costs one matching raw material and 0.25 energy. Each factory produces only its selected recipe, using its entire level-dependent production budget. Finished ammunition types have separate stock counters and share the factory capacity. Switching recipes preserves existing stock. Each raw material has its own level-dependent capacity. Psychic tower profiles use aura ammunition, including psychic projectile towers.

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

## Warehouse and production selection

Hammadde Deposu is a shared non-firing tower available to every operator (80 gold at the current global cost multiplier; base cost 40, max level 5). Per-material storage is 200/400/700/1100/1600 at levels 1–5. It holds gunpowder, mystic essence, power crystals and iron; energy continues through reactors. Its crate icon is a repository-native SVG.

Select an ammunition factory and use the Ammunition production buttons (Projectile, Psychic/Aura, Plasma). All three finished stock counters remain visible even at zero. Each factory remembers its own selection (default Projectile).

In Workers, select a Carrier, choose Production input (from warehouse), then click the factory to supply. The worker automatically collects that factory's currently required raw material from an owned reachable warehouse. The same assignment can supply iron to a repair depot. Finished ammunition delivery remains a separate assignment on the same Carrier profession, using the existing ammo-type options. Input carriers reserve available destination capacity; recipe changes or a destroyed destination return their cargo to a warehouse. Resource ownership is checked by the server.
