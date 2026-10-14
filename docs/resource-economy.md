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

Everything about workers lives in one bottom-bar drawer, **Worker** (TR "İşçi"), with three sections switched from its header row: **Manage** (assignment), **Hire** and **Tree** (the worker development tree). The last section used is remembered for the match; the default is Manage when the player has workers in the field, otherwise Hire. Hiring is no longer in Inventory and no longer opens a full-screen sheet: the tier buttons and the hire button sit in the Hire section. The earlier floating "Workers" panel is gone.

Manage lists the player's workers: profession, job, target, cargo and (for gatherers) the reserve left in the node. Targets are written in plain names, never internal ids: a resource kind with a per-kind ordinal ("Energy crystal 2", "Gunpowder deposit 1") or the localized building name. A worker that has not been assigned by hand shows "Automatic"; the server marks its default job with `autoAssigned` in the snapshot and sends a hand-made assignment without the flag, including one still queued behind cargo, so the choice is visible at once.

To assign: tap a worker, then tap a resource node (gatherer) or a building (carrier/repairer) on the map. While a target is awaited the drawer collapses to an instruction strip so the map stays visible and tappable: one line with the instruction and Cancel, plus a row of product buttons for carriers (raw material, energy, bullet, aura crystal, power crystal). After assigning or cancelling, the drawer returns to Manage; opening another drawer also cancels. A depleted node is refused with a short notice, on the client before the request and on the server in `assignWorker` (`worker:rejected`, text key `worker.nodeDepleted`); a building that does not fit the job is refused with a notice too. Existing cargo is delivered before a queued assignment takes effect. Assignments are owner-validated, persist through respawn and move with reconnection. Delivery priorities and blocked-route rerouting remain in force.

The roster is drawn by the bottom bar's own render pipeline (`game-control-ui.ts`; logic in `worker-roster.ts`). Rows are rebuilt only when their structure changes, and never while a finger is down on the panel; cargo and remaining amounts are written in place. Checked at a 375 x 812 viewport in Turkish and English: Manage with five workers 332px (the drawer is capped at min(54vh, 380px), other drawers at 300px), Hire 229px, gatherer strip 54px, carrier strip 101px; no horizontal overflow. Worker research has three columns and resource-specific extraction/capacity/speed choices.

## Generated artwork

Created using built-in ImageGen with transparent backgrounds; runtime PNGs are 128 x 128 with alpha transparency. Level 1 repair depot is bronze/gunmetal with teal lights and a wrench motif. Level 5 is a much larger titanium/silver workshop with violet lights and robotic arms. The level 5 sprite replaces the base sprite at maximum level.

Art direction used for individual generations: overhead orthographic strategy-game sprite, centered complete silhouette, readable broad forms at small scale, polished painted science-fiction materials, actual transparent background, no text, no ground tile, no watermark.

Subjects: (1) basic mechanical repair workshop with teal lighting and wrench emblem; (2) advanced titanium repair workshop with purple core and robotic repair arms; (3) dark iron ore outcrop with silver exposed veins; (4) mysterious violet portal entrance with stone/metal ring and purple energy interior; (5) gunpowder/sulfur mineral deposit with amber accents; (6) bright cyan energy crystal cluster; (7) contained red-orange plasma/power crystal deposit.

Assets: `apps/web/public/images/towers/tower-supply-repair.png`, `tower-supply-repair-level-5.png`, and `apps/web/public/images/resources/resource-{energy,gunpowder,mystic,plasma,iron}.png`.

Original generated images remain in the Codex generated-images directory for this chat. Runtime assets are included in Git; no runtime dependency on the image generation service.

## Node placement

The map always has the same seven nodes with the same ids and kinds: `crystal-1..3` (energy), `ammo-source-1` (gunpowder), `ammo-source-2` (mystic essence), `ammo-source-3` (power crystal) and `iron-1`. Their **positions are rolled once per match on the server**, when the arena is built at match start (`rollResourceLayout` in `MatchRoom.ts`), and never change during the match. Nodes are shared by the whole team at every map scale; there are no per-player or mirrored copies.

The rules live in a pure shared function, `placeResourceNodes` (`packages/shared/src/resource-layout.ts`):

- at least one cell away from every map edge;
- never on or next to a spawn cell or a nexus cell (in the arena: rows 2 to `rows - 3`, columns 1 to `cols - 2`);
- any two nodes at Chebyshev distance 3 or more (two free cells between them); a map too small for that relaxes to 2, and a map too small for 2 falls back to the old fixed layout after 24 attempts per spacing step;
- fair start: at least one energy crystal and the gunpowder deposit sit in the lower 60% of the rows;
- never under a standing structure, and never in a region workers cannot reach from the base.

Nodes do not block movement (enemies and workers walk over a node's cell) and do not change tower placement, so the spawn-to-nexus route check only runs if a caller declares that nodes block.

Randomness: one `Math.random()` draw per room gives `resourceLayoutSeed`; every placement roll comes from a separate generator derived from it (`createResourceLayoutRandom`), so spawn and special-enemy rolls are not shifted by the layout. A fixed `Math.random` seed gives the same layout and the same match.

Clients have no layout constants. Every snapshot (full and delta frames alike) carries `crystalNodes` and `ammoNodes` with world coordinates, so a reconnecting or late-joining client draws the same positions. Before the arena exists (lobby, bare test rooms) the old fixed ratio layout is used.

A map may pin positions with the optional `resourceNodes: [{ id, col, row }]` field of `EditableMapData`. Pinned nodes stay exactly where the map says (projected proportionally if the map's grid differs from the arena's) and the rest are rolled around them; a map that pins all seven consumes no randomness. The map editor does not write this field today.

Starting gatherers default to the node of their kind nearest to the base (distance to the nearest nexus cell, ties broken by distance to the worker's spawn cell) instead of the fixed `crystal-1` / `ammo-source-1`.

## Finite deposits

Each map resource node starts with 2,000 shared units. Extraction deducts only the loaded amount, clamps the last partial load to the reserve and never regenerates on a new wave or worker respawn. A new match starts with fresh reserves. Exhausted nodes remain visible at reduced opacity with a zero count; assigned gatherers deliver their remaining cargo and wait for reassignment. Node labels and the worker roster show the remaining amount. Resource sprites are 25% smaller than the original size (0.7125 of one cell).

## Warehouse and production selection

Hammadde Deposu is a shared non-firing tower available to every operator (80 gold at the current global cost multiplier; base cost 40, max level 5). Per-material storage is 200/400/700/1100/1600 at levels 1–5. It holds gunpowder, mystic essence, power crystals and iron; energy continues through reactors. Its crate icon is a repository-native SVG.

Select an ammunition factory and use the Ammunition production buttons (Projectile, Psychic/Aura, Plasma). All three finished stock counters remain visible even at zero. Each factory remembers its own selection (default Projectile).

In Worker › Manage, select a Carrier, choose Raw material, then tap the factory to supply. The worker automatically collects that factory's currently required raw material from an owned reachable warehouse. The same assignment can supply iron to a repair depot. Finished ammunition delivery remains a separate assignment on the same Carrier profession, using the existing ammo-type options. Input carriers reserve available destination capacity; recipe changes or a destroyed destination return their cargo to a warehouse. Resource ownership is checked by the server.
