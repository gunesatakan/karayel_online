# Isolation Tower sprites

Generated with the built-in ImageGen tool. Three separate transparent sprites,
normalized with System.Drawing to a 450px visible diameter on a 512px canvas,
matching the existing tower art. Gameplay values are unchanged.

Saved assets:

- `apps/web/public/images/towers/tower-warrior-3-levels-1-4.png`
- `apps/web/public/images/towers/tower-warrior-3-levels-5-9.png`
- `apps/web/public/images/towers/tower-warrior-3-level-10.png`

The shared tiered-art registry supplies preloading, in-game upgrades, placement
previews and tower-sheet portraits: levels 1–4, 5–9, and 10 respectively.

## Generation prompts

Common prompt:

> Use case stylized-concept. Production sprite for Nexhold Isolation Tower, a non-attacking electromagnetic slowing field generator. Strict 90-degree top-down orthographic view, perfectly circular mechanical platform, no perspective, no visible side wall. Detailed hand-painted sci-fi metal matching a tower-defense game, legible at 55px. Center circular induction core surrounded by radial field coils and concentric segmented rings, NO guns or barrels. One centered complete tower, same circular footprint for every upgrade. Transparent background, no ground, no exterior glow, no text, no UI. Square image, circle occupies 88 percent of canvas.

Appended per tier:

- LEVEL 1: simple worn gunmetal and bronze base, four chunky copper coils, modest cyan induction core, sparse mechanical plating. Clearly basic functional machine.
- LEVEL 5: upgraded silver titanium base with violet core and six violet induction coils, double concentric segmented armored ring, sophisticated radial conductors. Strongly different purple/silver palette from basic copper/cyan tier.
- LEVEL 10: ultimate advanced titanium and dark obsidian base, eight articulated superconducting coils, brilliant ice-white cyan center within purple containment ring, three intricate concentric rings, broad silver armored radial sectors. Highest-tier complex silhouette while retaining circular footprint. Bright energy contained inside platform.
