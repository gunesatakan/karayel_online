// First art pass: AttackLord level 1–4 silhouettes, read against the real tower art.
export const TOWER_ASSETS = [
  { id: "warrior-1", name: "Takipçi", role: "Hasar ve işaretleme", extension: "png", mode: "projectile", range: 56, qualityModel: "game-assets/models/warrior-1-quality.glb", stylizedModel: "game-assets/models/warrior-1-stylized.glb", pastelModel: "game-assets/models/warrior-1-pastel.glb", muzzle: { length: 1.7, height: 1.86, offset: 0.25 }, detail: "Bakır çatı, yeşil döner gövde ve çift namlu." },
  { id: "warrior-2", name: "Sunucu", role: "Global destek", extension: "webp", mode: "idle", range: 844, muzzle: { length: 0.8, height: 2.15, offset: 0 }, detail: "İç içe metal halkalar, yükseltilmiş veri çekirdeği. Kendisi ateş etmez." },
  { id: "warrior-3", name: "İzolasyon Kulesi", role: "Alan kontrolü", extension: "png", mode: "aura", range: 52, muzzle: { length: 0.9, height: 1.85, offset: 0 }, detail: "Dört bakır bobin, radyal kollar ve turkuaz alan çekirdeği." },
  { id: "warrior-4", name: "Obsesyon Kulesi", role: "Tek hedef hasarı", extension: "webp", mode: "impact", range: 59, muzzle: { length: 1.6, height: 1.85, offset: 0 }, detail: "Mor zırh dilimleri, altın halka ve odak merceği." },
  { id: "warrior-5", name: "Debug Lazer", role: "Sürekli hasar", extension: "webp", mode: "beam", range: 67, muzzle: { length: 1.62, height: 1.86, offset: 0 }, detail: "Radyal mavi enerji tüpleri ve yeşil metal lazer başlığı." },
  { id: "warrior-6", name: "Ucube", role: "Geç oyun hasarı", extension: "webp", mode: "impact", range: 59, footprintSpan: 2, muzzle: { length: 1.65, height: 2.08, offset: 0 }, detail: "Dört hücreye oturan ağır yeşil gövde, bakır çatı, kalın namlu ve üç bobin." },
].map((asset) => ({ footprintSpan: 1, operator: "attacklord", ...asset, art: `game-assets/towers/tower-${asset.id}-levels-1-4.${asset.extension}`, model: `game-assets/models/${asset.id}.glb` }));

// ZentaX "organic technology": bone, chitin and one signature energy colour per tower. The game's
// zeynep-4/5 are retired; Abartı is an edge rail two cells long, not a cell tower.
export const ZENTAX_ASSETS = [
  { id: "zeynep-1", name: "Hiza Emri", role: "Delici fiziksel mermi", mode: "projectile", range: 75, detail: "Tek kemik mızrak namlu, omur halkaları ve magenta enerji kanalı." },
  { id: "zeynep-2", name: "Gösteri Kulesi", role: "Işık çizgisi", mode: "beam", range: 100, detail: "Dikey göz kristalinin çevresinde açan pembe kristal taç." },
  { id: "zeynep-3", name: "Taht Mührü", role: "Sentez bağlantısı", mode: "idle", range: 75, detail: "Üç kemik pençenin tuttuğu zümrüt küre ve fuşya bağlantı yuvaları." },
  { id: "zeynep-6", name: "Kin Kulesi", role: "Mesafeye bağlı yavaşlatma", mode: "aura", range: 56, detail: "Kavisli boyun üzerinde dişli, koyu kızıl boru ağız." },
  { id: "zeynep-7", name: "Saray Arşivi", role: "Aura kulesi", mode: "aura", range: 85, footprintSpan: 2, detail: "Dört hücreye oturan kemik kubbe, kehribar bal peteği ve taç kuleleri." },
  { id: "zeynep-8", name: "Abartı", role: "Pasif vuruş modülatörü", mode: "idle", range: 0, edgeCells: 2, art: "game-assets/towers/zentax-abarti-concept.png", detail: "Kare kenarına yerleşen iki hücrelik kemik ray ve mor zar." },
].map((asset) => ({ footprintSpan: 1, operator: "zentax", art: `game-assets/towers/tower-${asset.id}.webp`, model: `game-assets/models/evolution/${asset.id}-tier-3.glb`, muzzle: { length: 0.1, height: 1, offset: 0 }, ...asset }));

export const OPERATORS = [
  { id: "attacklord", name: "AttackLord", eyebrow: "KULE EVRİMİ / ATTACKLORD", title: "Buhardan enerjiye.", note: "6 kule · 3 görsel evre · Yarı mat metal ve ışıklı enerji çekirdekleri", towers: TOWER_ASSETS },
  { id: "zentax", name: "ZentaX", eyebrow: "KULE EVRİMİ / ZENTAX", title: "Tohumdan saraya.", note: "5 kule + Abartı rayı · 3 görsel evre · Kemik, kitin ve imza enerji renkleri", towers: ZENTAX_ASSETS },
];

export const STAGE_ASSETS = ["Taş Kuşatma", "Çelik Hat", "Sürü", "Düşüş", "Katlanma"].map((name, index) => ({
  id: index + 1, name, texture: `game-assets/terrain/stage-${index + 1}.jpg`,
}));
