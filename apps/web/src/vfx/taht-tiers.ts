/**
 * Taht Muhru sentezlerinin kademe renkleri (kule seviyesi 1-4, 5-9, 10).
 *
 * Sunucu isinin taban rengini yolluyor; Abarti'dan gecen isinin rengi bunun
 * tekduze koyulasmis hali (`getAbartiDarkenedBeamColor`). Burada kademe rengi
 * seciliyor ve ayni koyulasma ona tasiniyor.
 */

import { groundHue } from "./kit";

type TierColors = Readonly<Record<1 | 2 | 3, number>>;

const toTier = (tier: number | undefined): 1 | 2 | 3 => (tier === 3 ? 3 : tier === 2 ? 2 : 1);

function scaleColor(color: number, factor: number) {
  const channel = (shift: number) => Math.round(((color >> shift) & 0xff) * factor);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function lighten(color: number, amount: number) {
  const channel = (shift: number) => {
    const value = (color >> shift) & 0xff;
    return Math.round(value + (255 - value) * amount);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Abarti'nin koyulastirma orani: sunucunun rengi / taban rengi (tek kanaldan). */
function darkenFactor(color: number, base: number, shift: number) {
  return Math.max(0.3, Math.min(1, ((color >> shift) & 0xff) / Math.max(1, (base >> shift) & 0xff)));
}

/* Iki Gosteri: yanik isini. ------------------------------------------ */

/** Gorselde yari kalinlik; sunucunun isabet bandi ayni. */
export const TAHT_BURN_BEAM_WIDTH_SCALE = 0.5;
/** Mavi, lacivert, koyu mor. */
export const TAHT_BURN_BEAM_TIER_COLORS: TierColors = { 1: 0x3a86d6, 2: 0x2f45a8, 3: 0x5b2a9e };
const TAHT_BURN_BASE_COLOR = 0x22d3ee;

export function getTahtBurnBeamColor(beam: { tier?: number; color: number }) {
  const color = TAHT_BURN_BEAM_TIER_COLORS[toTier(beam.tier)];
  if (beam.color === TAHT_BURN_BASE_COLOR) return color;
  return scaleColor(color, darkenFactor(beam.color, TAHT_BURN_BASE_COLOR, 8));
}

/* Gosteri + Hiza: seken karisik isin. --------------------------------- */

/** Leylak, erguvan, kan kirmizisi. */
export const TAHT_RAY_TIER_COLORS: TierColors = { 1: 0xe879f9, 2: 0xa21caf, 3: 0x9f1239 };
/** Sunucunun taban renkleri: ilk parca ve sekmeden sonrasi (biraz acik). */
const TAHT_RAY_FIRST_COLOR = 0xe879f9;
const TAHT_RAY_BOUNCED_COLOR = 0xf0abfc;
/** Sekmeden sonraki parca kademe renginin biraz acigi (ilk parcadan ayirt edilsin). */
const TAHT_RAY_BOUNCED_LIGHTEN = 0.18;

export function getTahtRayBeamColor(beam: { tier?: number; color: number }) {
  const tierColor = TAHT_RAY_TIER_COLORS[toTier(beam.tier)];
  // Koyulasma tekduze, kanal orani kaliyor: yesil/mavi ilk parcada 0,49,
  // sekmeden sonra 0,68. Koyulasma orani mavi kanaldan.
  const bounced = ((beam.color >> 8) & 0xff) > (beam.color & 0xff) * 0.58;
  const color = bounced ? lighten(tierColor, TAHT_RAY_BOUNCED_LIGHTEN) : tierColor;
  if (beam.color === TAHT_RAY_FIRST_COLOR || beam.color === TAHT_RAY_BOUNCED_COLOR) return color;
  return scaleColor(color, darkenFactor(beam.color, bounced ? TAHT_RAY_BOUNCED_COLOR : TAHT_RAY_FIRST_COLOR, 0));
}

/* Iki Hiza: cift delici mizrak. --------------------------------------- */

/** Bronz, celik, siyah (10. seviyede altin kenarla). */
export const TAHT_DUAL_LANCE_TIER_COLORS: TierColors = { 1: 0xb87333, 2: 0x8a9bb0, 3: 0x2b2b2b };
/** 10. seviyenin altin kenari ve izi (yere indirilmis: sekerleme sarisi degil). */
export const TAHT_DUAL_LANCE_GOLD = groundHue(0xd4a017);

export function getTahtDualLanceColor(tier: number | undefined) {
  return TAHT_DUAL_LANCE_TIER_COLORS[toTier(tier)];
}
