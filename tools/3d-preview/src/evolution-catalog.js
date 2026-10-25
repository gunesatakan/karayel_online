import { TOWER_ASSETS, ZENTAX_ASSETS } from './asset-catalog.js';

export const EVOLUTION_TIERS = [
  { id: 1, levels: '1–4', label: 'Steampunk', detail: 'Pirinç bağlantılar, bakır kaplama, boyalı metal ve mekanik enerji çekirdekleri.' },
  { id: 2, levels: '5–9', label: 'Geçiş', detail: 'Fırçalanmış çelik ve koyu metal zırh, süslerde kalan bakır ve pirinç, ilk camgöbeği enerji kanalları.' },
  { id: 3, levels: '10', label: 'İleri teknoloji', detail: 'Yarı mat koyu metal, keskin panel ayrımları, camgöbeği ve magenta enerji öğeleri.' },
];

export const ZENTAX_TIERS = [
  { id: 1, levels: '1–4', label: 'Tohum', detail: 'Kapalı, kalın kemik plakalar, kısa küt dikenler ve sönük tek enerji çekirdeği.' },
  { id: 2, levels: '5–9', label: 'Büyüme', detail: 'Açılmaya başlayan kitin paneller, uzayan dikenler ve belirginleşen enerji damarları.' },
  { id: 3, levels: '10', label: 'Tam evrim', detail: 'Katmanlı kemik kemerler, yanardöner kitin ve kuleye özgü parlak enerji rengi.' },
];

export function tiersFor(operator) {
  return operator === 'zentax' ? ZENTAX_TIERS : EVOLUTION_TIERS;
}

export function towerVariant(id, style = 'evolution', tier = 1) {
  const asset = [...TOWER_ASSETS, ...ZENTAX_ASSETS].find(a => a.id === id);
  if (!asset) throw new Error(`Unknown tower: ${id}`);
  if (style === 'evolution' || asset.operator === 'zentax') {
    const stage = tiersFor(asset.operator).find(t => t.id === Number(tier));
    if (!stage) throw new Error(`Unknown visual tier: ${tier}`);
    return { ...asset, key: `${id}:evolution-${tier}`, variant: `tier-${tier}`, tier: stage.id, quality: true,
      model: `game-assets/models/evolution/${id}-tier-${tier}.glb`,
      detail: asset.operator === 'zentax' ? `${asset.detail} ${stage.detail}` : stage.detail, stage };
  }
  const model = asset[`${style}Model`];
  return model ? { ...asset, key: `${id}:${style}`, model, variant: style, quality: true } : { ...asset, key: id, variant: 'draft' };
}
