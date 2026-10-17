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
