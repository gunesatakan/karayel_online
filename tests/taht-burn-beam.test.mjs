/**
 * Taht Muhru'nun iki Gosteri sentezinin vurdugu isin (`zeynep-3-burn`).
 *
 * Kalinlik gorselde yarida (isabet bandi ayni); renk kademeden: 1-4 mavi,
 * 5-9 lacivert, 10 koyu mor. Abarti'dan gecen isin koyulasmasini koruyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const { getTahtBurnBeamColor, TAHT_BURN_BEAM_TIER_COLORS, TAHT_BURN_BEAM_WIDTH_SCALE } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
const source = readFileSync(new URL("../apps/web/src/vfx/beam-renderer.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("kademe renkleri: mavi, lacivert, koyu mor", () => {
  assert.equal(getTahtBurnBeamColor({ color: 0x22d3ee }), TAHT_BURN_BEAM_TIER_COLORS[1]);
  assert.equal(getTahtBurnBeamColor({ tier: 2, color: 0x22d3ee }), TAHT_BURN_BEAM_TIER_COLORS[2]);
  assert.equal(getTahtBurnBeamColor({ tier: 3, color: 0x22d3ee }), TAHT_BURN_BEAM_TIER_COLORS[3]);
  const [blue, navy, purple] = [1, 2, 3].map((tier) => TAHT_BURN_BEAM_TIER_COLORS[tier]);
  const rgb = (c) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
  assert.ok(rgb(blue)[2] > rgb(blue)[0] && rgb(blue)[2] > rgb(blue)[1], "1. kademe mavi");
  assert.ok(rgb(navy)[2] > rgb(navy)[1] && Math.max(...rgb(navy)) < Math.max(...rgb(blue)), "2. kademe daha koyu lacivert");
  assert.ok(rgb(purple)[0] > rgb(purple)[1] && rgb(purple)[2] > rgb(purple)[1], "3. kademe mor");
});

test("Abarti koyulasmasi kademe rengine tasiniyor", () => {
  const darkened = getTahtBurnBeamColor({ tier: 2, color: 0x1aa3b8 });
  assert.ok(((darkened >> 8) & 0xff) < ((TAHT_BURN_BEAM_TIER_COLORS[2] >> 8) & 0xff), "koyulasma kayboldu");
});

test("isin gorselde yari kalinlikta ve kademe rengiyle ciziliyor", () => {
  assert.equal(TAHT_BURN_BEAM_WIDTH_SCALE, 0.5);
  assert.match(source, /beam\.definitionId === "zeynep-3-burn"\) \{\n[^\n]*\n\s+this\.drawShowcaseBeam\(\{ \.\.\.beam, width: beam\.width \* TAHT_BURN_BEAM_WIDTH_SCALE \}, grounded\(getTahtBurnBeamColor\(beam\)\)\);/);
});

const tiers = await importWebModule("apps/web/src/vfx/taht-tiers.ts");
const signatures = await importWebModule("apps/web/src/vfx/zeynep-signatures.ts");

test("Gosteri + Hiza isini: leylak, erguvan, kan kirmizisi; sekme sonrasi acik, Abarti koyu", () => {
  const { getTahtRayBeamColor, TAHT_RAY_TIER_COLORS } = tiers;
  assert.deepEqual([1, 2, 3].map((tier) => getTahtRayBeamColor({ tier, color: 0xe879f9 })), [0xe879f9, 0xa21caf, 0x9f1239]);
  assert.equal(TAHT_RAY_TIER_COLORS[3], 0x9f1239);
  const bounced = getTahtRayBeamColor({ tier: 2, color: 0xf0abfc });
  assert.ok((bounced & 0xff) > (0xa21caf & 0xff), "sekmeden sonraki parca acilmadi");
  const darkened = getTahtRayBeamColor({ tier: 3, color: 0xb55ec2 });
  assert.ok(((darkened >> 16) & 0xff) < 0x9f, "Abarti koyulasmasi kayboldu");
  assert.ok(getTahtRayBeamColor({ tier: 3, color: 0xbb85c4 }) !== getTahtRayBeamColor({ tier: 3, color: 0xb55ec2 }), "koyulasmis sekme parcasi ilk parcayla ayni");
});

test("Hiza + Hiza mizragi: bronz, celik, siyah-altin", () => {
  assert.deepEqual([1, 2, 3].map((tier) => tiers.getTahtDualLanceColor(tier)), [0xb87333, 0x8a9bb0, 0x2b2b2b]);
  assert.equal(signatures.getZeynepBodyColor("zeynep-3", 0, 2), 0x8a9bb0);
  assert.equal(signatures.getZeynepBodyColor("zeynep-3", 0, undefined), 0xb87333);
});

test("ek efektler kademeye bagli: cekirdek/kilif, sekme kivilcimi, uzun iz", () => {
  const signatureSource = readFileSync(new URL("../apps/web/src/vfx/zeynep-signatures.ts", import.meta.url), "utf8");
  const attackSource = readFileSync(new URL("../apps/web/src/vfx/attack-vfx.ts", import.meta.url), "utf8");
  assert.match(source, /this\.drawTahtRayCore\(beam, grounded\(rayColor\)\)/);
  assert.match(source, /if \(!g \|\| tier < 2\) return;/);
  assert.match(signatureSource, /if \(dual && tier >= 2\) drawDualLanceCore/);
  assert.match(signatureSource, /if \(event\.tier < 2 \|\| still \|\| !this\.options\.lod\.sparks\) return;/);
  assert.match(attackSource, /tier >= 3 \? 2 : tier >= 2 \? 1\.5 : 1/);
});

test("Gosteri + Hiza isininin ok basi 2/3; obur mizrak isini ayni", async () => {
  const { TAHT_RAY_HEAD_SCALE } = await importWebModule("apps/web/src/vfx/beam-renderer.ts");
  assert.equal(TAHT_RAY_HEAD_SCALE, 2 / 3);
  assert.match(source, /this\.drawMirrorSpear\(beam, rayColor, TAHT_RAY_HEAD_SCALE\);/);
  assert.match(source, /beam\.definitionId === "zeynep-3"\) \{\n\s+this\.drawMirrorSpear\(beam, color\);/);
  assert.match(source, /const tip = width \* 0\.85 \* headScale;/);
});
