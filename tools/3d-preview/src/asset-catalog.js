// First art pass: AttackLord level 1–4 silhouettes, read against the real tower art.
export const TOWER_ASSETS = [
  { id: "warrior-1", name: "Takipçi", role: "Hasar ve işaretleme", extension: "png", mode: "projectile", range: 56, qualityModel: "game-assets/models/warrior-1-quality.glb", muzzle: { length: 1.7, height: 1.86, offset: 0.25 }, detail: "Bakır çatı, yeşil döner gövde ve çift namlu." },
  { id: "warrior-2", name: "Sunucu", role: "Global destek", extension: "webp", mode: "idle", range: 844, muzzle: { length: 0.8, height: 2.15, offset: 0 }, detail: "İç içe metal halkalar, yükseltilmiş veri çekirdeği. Kendisi ateş etmez." },
  { id: "warrior-3", name: "İzolasyon Kulesi", role: "Alan kontrolü", extension: "png", mode: "aura", range: 52, muzzle: { length: 0.9, height: 1.85, offset: 0 }, detail: "Dört bakır bobin, radyal kollar ve turkuaz alan çekirdeği." },
  { id: "warrior-4", name: "Obsesyon Kulesi", role: "Tek hedef hasarı", extension: "webp", mode: "impact", range: 59, muzzle: { length: 1.6, height: 1.85, offset: 0 }, detail: "Mor zırh dilimleri, altın halka ve odak merceği." },
  { id: "warrior-5", name: "Debug Lazer", role: "Sürekli hasar", extension: "webp", mode: "beam", range: 67, muzzle: { length: 1.62, height: 1.86, offset: 0 }, detail: "Radyal mavi enerji tüpleri ve yeşil metal lazer başlığı." },
  { id: "warrior-6", name: "Ucube", role: "Geç oyun hasarı", extension: "webp", mode: "impact", range: 59, footprintSpan: 2, muzzle: { length: 1.65, height: 2.08, offset: 0 }, detail: "Dört hücreye oturan ağır yeşil gövde, bakır çatı, kalın namlu ve üç bobin." },
].map((asset) => ({ footprintSpan: 1, ...asset, art: `game-assets/towers/tower-${asset.id}-levels-1-4.${asset.extension}`, model: `game-assets/models/${asset.id}.glb` }));

export const STAGE_ASSETS = ["Taş Kuşatma", "Çelik Hat", "Sürü", "Düşüş", "Katlanma"].map((name, index) => ({
  id: index + 1, name, texture: `game-assets/terrain/stage-${index + 1}.jpg`,
}));
