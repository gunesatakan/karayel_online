import type { HirableWorkerRole } from "./logistics/index.js";

/** Kalici isci secimleri. Her rol kendi uc kademeli ikili agacina sahiptir. */
export type WorkerSkillId =
  | "energy-relay" | "local-capacitor" | "load-shedder" | "frequency-share" | "scenario-charge" | "emergency-bridge"
  | "crystal-reserve" | "crystal-resonance" | "crystal-trap" | "crystal-conduit" | "crystal-last-core" | "crystal-critical-resonance"
  | "ammo-refiner" | "ammo-emergency-refinery" | "ammo-cast-shell" | "ammo-recycling" | "ammo-black-box" | "ammo-wave-stock"
  | "ammo-special-payload" | "ammo-emergency-magazine" | "ammo-transfer-dock" | "ammo-lost-convoy" | "ammo-assault-convoy" | "ammo-evacuation-convoy"
  | "repair-bulwark" | "repair-thermal-welder" | "repair-fortification-seal" | "repair-emergency-rebuild" | "repair-nexus-watch" | "repair-breach-engineer"
  | WorkerDevelopmentSkillId;

/**
 * Agacin 1/2, 4/5, 7/8. hucreleri: yon secimi ve o yonun derinlestirmesi.
 * 3/6/9 eski oyun degistirici ciftler (`WORKER_SKILL_TIERS`).
 */
export type WorkerDevelopmentSkillId =
  | "energy-high-voltage" | "energy-superconductor" | "energy-cooling-coil" | "energy-cryo-coil"
  | "energy-mark-guard" | "energy-lasting-trace" | "energy-target-lock" | "energy-fixation-lock"
  | "energy-long-line" | "energy-far-line" | "energy-full-tank" | "energy-brimming-tank"
  | "crystal-overload" | "crystal-deep-overload" | "crystal-heat-vent" | "crystal-heat-purge"
  | "crystal-burst-reserve" | "crystal-burst-surge" | "crystal-steady-flow" | "crystal-steady-current"
  | "crystal-near-field" | "crystal-wide-field" | "crystal-far-link" | "crystal-far-grid"
  | "ammo-heavy-cast" | "ammo-dense-cast" | "ammo-light-cast" | "ammo-feather-cast"
  | "ammo-heat-sink-casing" | "ammo-cryo-casing" | "ammo-piercing-core" | "ammo-tungsten-core"
  | "ammo-armored-crate" | "ammo-reinforced-crate" | "ammo-long-barrel" | "ammo-rifled-barrel"
  | "ammo-heat-jacket" | "ammo-cryo-jacket" | "ammo-fast-feed" | "ammo-belt-feed"
  | "ammo-trace-rounds" | "ammo-deep-trace" | "ammo-concussion-rounds" | "ammo-shock-rounds"
  | "ammo-shared-crate" | "ammo-shared-depot" | "ammo-lone-courier" | "ammo-lone-runner"
  | "repair-tune-up" | "repair-fine-tune" | "repair-coolant" | "repair-deep-coolant"
  | "repair-armor-plating" | "repair-heavy-plating" | "repair-sight-tuning" | "repair-long-sight"
  | "repair-spare-parts" | "repair-full-kit" | "repair-battery-swap" | "repair-full-charge";

export type EnergyWorkerSkillId =
  | "energy-relay" | "local-capacitor"
  | "load-shedder" | "frequency-share"
  | "scenario-charge" | "emergency-bridge";
export type CrystalWorkerSkillId =
  | "crystal-reserve" | "crystal-resonance" | "crystal-trap" | "crystal-conduit" | "crystal-last-core" | "crystal-critical-resonance";
export type AmmoCollectorWorkerSkillId =
  | "ammo-refiner" | "ammo-emergency-refinery" | "ammo-cast-shell" | "ammo-recycling" | "ammo-black-box" | "ammo-wave-stock";
export type AmmoTransportWorkerSkillId =
  | "ammo-special-payload" | "ammo-emergency-magazine" | "ammo-transfer-dock" | "ammo-lost-convoy" | "ammo-assault-convoy" | "ammo-evacuation-convoy";
export type RepairWorkerSkillId =
  | "repair-bulwark" | "repair-thermal-welder" | "repair-fortification-seal" | "repair-emergency-rebuild" | "repair-nexus-watch" | "repair-breach-engineer";

/**
 * `requires`: derinlestirme secenegi yalnizca ustundeki yon secilmisse
 * acilir (1. hucrede A secen 2. hucrede A'nin guclusunu alir).
 */
export type WorkerSkillChoice = { id: WorkerSkillId; name: string; description: string; requires?: WorkerSkillId };
export type WorkerSkillPair = readonly [WorkerSkillChoice, WorkerSkillChoice];
export type WorkerDevelopmentCell = {
  readonly tier: number;
  readonly options?: WorkerSkillPair;
};

/**
 * Isci gelisim agacinda hucre basina acma bedeli (XP), hucre sirasiyla.
 * Secim isciye degil oyuncunun agacina yazilir; bu nedenle bir kez
 * odendiginde ayni role ait tum isciler bu yetenegi kullanir.
 *
 * 3/6/9. hucreler (oyun degistiriciler) eski bedellerini koruyor: 120, 280,
 * 560. Bir rolun tamami 2340 XP; XP kule seviyeleriyle ortak oldugu icin
 * agacin her dali bir kule seviyesinden vazgecmek demek.
 */
export const WORKER_DEVELOPMENT_XP_COSTS = [60, 90, 120, 160, 220, 280, 380, 470, 560] as const;

/**
 * Yuk Kesici ve Frekans Paylastirici esikleri.
 *
 * Ikisi bir donem her teslimatta sahibin butun kulelerine dokunuyordu: Yuk
 * Kesici kriz olsun olmasin teslim alan disindaki her kuleyi 5 sn susturuyor,
 * Frekans Paylastirici dolu kuleleri de donusumlu calistiriyordu. Metin "kriz",
 * "dusuk oncelik" ve "enerjisi azalan" diyordu; sayilar burada, metin de ayni
 * sayilari yaziyor -- biri degisirse oburu de degismeli.
 */
/** Sahibin herhangi bir savas kulesinin enerjisi bu oranin altindaysa kriz var. */
export const LOAD_SHEDDER_CRISIS_ENERGY_RATIO = 0.25;
export const LOAD_SHEDDER_DURATION_MS = 5_000;
/** Teslimat aninda enerjisi bu oranin altinda olan kuleler donusumlu calisir. */
export const FREQUENCY_SHARE_ENERGY_RATIO = 0.5;
export const FREQUENCY_SHARE_DURATION_MS = 6_000;

export const ENERGY_WORKER_SKILL_TIERS: readonly WorkerSkillPair[] = [
  [
    { id: "energy-relay", name: "Röle Mimarı", description: "Teslim edilen kule 8 sn boyunca komşu kulelere enerji kaynağı olur. Ağ menzili 1 kare." },
    { id: "local-capacitor", name: "Yerel Akücü", description: "Her teslimat kulede 18 enerjilik yerel akü bırakır. Ana hat kesilse de yalnızca bu kule çalışır." }
  ],
  [
    { id: "load-shedder", name: "Yük Kesici", description: "Teslimat anında kulelerinden birinin enerjisi %25'in altındaysa sevkiyat önceliği Düşük olan kuleler 5 sn ateş etmez; çalışma enerjisi harcamaya devam eder. Kritik, Normal ve teslimatı alan kule hiç durmaz." },
    { id: "frequency-share", name: "Frekans Paylaştırıcı", description: "Teslimat anında enerjisi %50'nin altında olan kuleler 6 sn dönüşümlü çalışır: zamanın yarısında ateş etmez; enerjiyle ateş eden kulelerin enerjisi daha geç biter." }
  ],
  [
    { id: "scenario-charge", name: "Senaryo Şarjı", description: "Teslim edilen kule bir sonraki özel saldırısını hazırlar. Bir kulede aynı anda tek şarj tutulur." },
    { id: "emergency-bridge", name: "Acil Köprü", description: "Enerjisi biten hedef kule 4 sn boyunca yalnızca mühimmat tüketerek çalışır. İşçi bu sürede hatta kilitlenir." }
  ]
];

export const CRYSTAL_WORKER_SKILL_TIERS: readonly WorkerSkillPair[] = [
  [
    { id: "crystal-reserve", name: "Rezerv Mührü", description: "Reaktöre yapılan her teslimat 12 gizli enerji depolar. Ana enerji bitince en fazla 24 enerji otomatik açılır." },
    { id: "crystal-resonance", name: "Rezonans Darbesi", description: "Teslimat reaktörü doldurursa tüm dost kulelerin ısısı %25 azalır ve bir ısı kilidi temizlenir. Bekleme: 12 sn." }
  ],
  [
    { id: "crystal-trap", name: "Kristal Tuzağı", description: "Her kristal düğümünden dalga başına ilk toplama, düğüm çevresinde 5 sn düşman yavaşlatma alanı bırakır." },
    { id: "crystal-conduit", name: "İletken Damar", description: "Dalganın ilk reaktör teslimatı, en yakın iki kuleye 10 sn ücretsiz enerji hattı açar." }
  ],
  [
    { id: "crystal-last-core", name: "Son Çekirdek", description: "Reaktör boşaldığında dalga başına bir kez 25 enerji verir ve 3 sn enerji tüketimini durdurur." },
    { id: "crystal-critical-resonance", name: "Kritik Rezonans", description: "Reaktör boşaldığında çevredeki düşmanları 3 sn %35 yavaşlatır ve yakın kulelerin ısı kilidini açar." }
  ]
];

export const AMMO_COLLECTOR_WORKER_SKILL_TIERS: readonly WorkerSkillPair[] = [
  [
    { id: "ammo-refiner", name: "Saflaştırıcı", description: "Sonraki üretilen mühimmat partisi zırha karşı %25 daha etkilidir." },
    { id: "ammo-emergency-refinery", name: "Acil Rafineri", description: "Fabrikanın enerjisi bittiğinde ilk hammadde teslimatı bir mühimmat partisini enerji harcamadan hazırlar." }
  ],
  [
    { id: "ammo-cast-shell", name: "Döküm Kabuğu", description: "Her hammadde teslimatı fabrikaya 20 hasarlık geçici kalkan verir. Kalkan en fazla 40 olur." },
    { id: "ammo-recycling", name: "Savaş Geri Dönüşümü", description: "Fabrika çevresinde dalga başına öldürülen ilk ağır düşman 6 hammadde bırakır." }
  ],
  [
    { id: "ammo-black-box", name: "Kara Kutu", description: "Fabrika dalga başına bir kez ölümcül darbeden 1 canla kurtulur ve 5 sn kapanır." },
    { id: "ammo-wave-stock", name: "Dalga Stoğu", description: "Dalga sonunda fabrikanın mevcut hammaddesinin %30'u bonus olarak yeniden stoğa eklenir." }
  ]
];

export const AMMO_TRANSPORT_WORKER_SKILL_TIERS: readonly WorkerSkillPair[] = [
  [
    { id: "ammo-special-payload", name: "Özel Mühimmat", description: "Teslim edilen kulenin sonraki 6 atışı zırh delici mühimmat kullanır." },
    { id: "ammo-emergency-magazine", name: "Acil Şarjör", description: "Mühimmatı bitmiş kule teslimat sonrası 3 ücretsiz atış yapar." }
  ],
  [
    { id: "ammo-transfer-dock", name: "Aktarma İskelesi", description: "Hedef kule doluysa yük yakındaki dost kuleye bir kez aktarılır; işçi fabrikaya boş dönmez." },
    { id: "ammo-lost-convoy", name: "Kayıp Konvoy", description: "İşçi taşıdığı yükle ölürse yük fabrikaya geri kaydedilir; sevkiyat tamamen kaybolmaz." }
  ],
  [
    { id: "ammo-assault-convoy", name: "Saldırı Kervanı", description: "Aynı kuleye 20 sn içinde iki teslimat yapılırsa 5 sn salvo modu açılır; atış aralığı %35 kısalır." },
    { id: "ammo-evacuation-convoy", name: "Tahliye Kervanı", description: "Canı %35'in altındaki kuleye teslimat, sonraki düşman darbesini %50 azaltır." }
  ]
];

export const REPAIR_WORKER_SKILL_TIERS: readonly WorkerSkillPair[] = [
  [
    { id: "repair-bulwark", name: "Siper Ustası", description: "Tamir edilen kule tamir sürerken %30 daha az hasar alır." },
    { id: "repair-thermal-welder", name: "Termal Kaynakçı", description: "Tamir edilen kule ısı kilidine giremez ve saniyede %30 daha hızlı soğur." }
  ],
  [
    { id: "repair-fortification-seal", name: "Tahkimat Mührü", description: "Tamir tamamlanınca kule 30 hasarlık veya 10 sn süreli bariyer kazanır." },
    { id: "repair-emergency-rebuild", name: "Acil Yeniden Kurulum", description: "Dalga başına bir kez yıkılmış bir yapı 5 sn içinde %20 canla yeniden kurulabilir." }
  ],
  [
    { id: "repair-nexus-watch", name: "Nexus Nöbeti", description: "Takım canı %40'ın altına inince tamirci kuleleri bırakıp nexus'u saniyede 2 can onarır." },
    { id: "repair-breach-engineer", name: "Gedik Mühendisi", description: "%20 canın altındaki bir kuleyi kurtardığında çevresinde 5 sn düşman yavaşlatma alanı oluşturur." }
  ]
];

export const WORKER_SKILL_TIERS: Readonly<Record<HirableWorkerRole, readonly WorkerSkillPair[]>> = {
  crystalCollector: CRYSTAL_WORKER_SKILL_TIERS,
  energyTransport: ENERGY_WORKER_SKILL_TIERS,
  ammoCollector: AMMO_COLLECTOR_WORKER_SKILL_TIERS,
  ammoTransport: AMMO_TRANSPORT_WORKER_SKILL_TIERS,
  repairer: REPAIR_WORKER_SKILL_TIERS
};

/**
 * Gelisim agacinin bir seceneginin sayilari. Metin ayni sayilari yaziyor
 * (tests/worker-development-tree.test.mjs ikisini karsilastiriyor); biri
 * degisirse oburu de degismeli.
 *
 * - `value` + `unit`: "%" kesir (0.25 = %25), "°" derece, "" duz sayi
 *   (enerji, mühimmat, delme).
 * - `durationMs`: etkinin suresi; duvar saati, oteki isci becerileriyle ayni.
 * - `shots`: atis/vurus sayisiyla biten etkiler.
 * - `count`: etkilenen kule sayisi; `radiusCells`: kare cinsinden yaricap.
 * - `cooldownMs`: ayni reaktorde iki tetik arasi.
 */
export type WorkerDevelopmentEffect = {
  readonly value?: number;
  readonly unit?: "%" | "°" | "";
  readonly durationMs?: number;
  readonly shots?: number;
  readonly count?: number;
  readonly radiusCells?: number;
  readonly cooldownMs?: number;
};

export const WORKER_DEVELOPMENT_EFFECTS: Readonly<Record<WorkerDevelopmentSkillId, WorkerDevelopmentEffect>> = {
  "energy-high-voltage": { value: 0.25, unit: "%", durationMs: 8_000 },
  "energy-superconductor": { value: 0.4, unit: "%", durationMs: 12_000 },
  "energy-cooling-coil": { value: 12, unit: "°" },
  "energy-cryo-coil": { value: 20, unit: "°" },
  "energy-mark-guard": { durationMs: 6_000 },
  "energy-lasting-trace": { durationMs: 10_000 },
  "energy-target-lock": { durationMs: 6_000 },
  "energy-fixation-lock": { durationMs: 10_000 },
  "energy-long-line": { value: 0.15, unit: "%", durationMs: 8_000 },
  "energy-far-line": { value: 0.25, unit: "%", durationMs: 12_000 },
  "energy-full-tank": { value: 0.15, unit: "%", durationMs: 10_000 },
  "energy-brimming-tank": { value: 0.25, unit: "%", durationMs: 10_000 },
  "crystal-overload": { value: 0.15, unit: "%", durationMs: 6_000 },
  "crystal-deep-overload": { value: 0.25, unit: "%", durationMs: 10_000 },
  "crystal-heat-vent": { value: 15, unit: "°", count: 2 },
  "crystal-heat-purge": { value: 20, unit: "°", count: 3 },
  "crystal-burst-reserve": { durationMs: 4_000, cooldownMs: 20_000 },
  "crystal-burst-surge": { durationMs: 6_000, cooldownMs: 15_000 },
  "crystal-steady-flow": { durationMs: 10_000 },
  "crystal-steady-current": { durationMs: 15_000 },
  "crystal-near-field": { value: 0.12, unit: "%", durationMs: 8_000, radiusCells: 2 },
  "crystal-wide-field": { value: 0.2, unit: "%", durationMs: 8_000, radiusCells: 3 },
  "crystal-far-link": { value: 15, unit: "", count: 2 },
  "crystal-far-grid": { value: 20, unit: "", count: 3 },
  "ammo-heavy-cast": { value: 0.2, unit: "%", shots: 4 },
  "ammo-dense-cast": { value: 0.3, unit: "%", shots: 6 },
  "ammo-light-cast": { value: 0.25, unit: "%", durationMs: 10_000 },
  "ammo-feather-cast": { value: 0.4, unit: "%", durationMs: 15_000 },
  "ammo-heat-sink-casing": { value: 0.3, unit: "%", durationMs: 10_000 },
  "ammo-cryo-casing": { value: 0.45, unit: "%", durationMs: 10_000 },
  "ammo-piercing-core": { value: 1, unit: "", durationMs: 10_000 },
  "ammo-tungsten-core": { value: 2, unit: "", durationMs: 10_000 },
  "ammo-armored-crate": { value: 0.2, unit: "%", durationMs: 8_000 },
  "ammo-reinforced-crate": { value: 0.35, unit: "%", durationMs: 8_000 },
  "ammo-long-barrel": { value: 0.12, unit: "%", durationMs: 10_000 },
  "ammo-rifled-barrel": { value: 0.2, unit: "%", durationMs: 10_000 },
  "ammo-heat-jacket": { value: 0.4, unit: "%", durationMs: 8_000 },
  "ammo-cryo-jacket": { value: 0.7, unit: "%", durationMs: 12_000 },
  "ammo-fast-feed": { value: 0.2, unit: "%", durationMs: 6_000 },
  "ammo-belt-feed": { value: 0.3, unit: "%", durationMs: 8_000 },
  "ammo-trace-rounds": { shots: 5, durationMs: 6_000 },
  "ammo-deep-trace": { shots: 8, durationMs: 6_000 },
  "ammo-concussion-rounds": { shots: 5, durationMs: 400 },
  "ammo-shock-rounds": { shots: 8, durationMs: 600 },
  "ammo-shared-crate": { value: 2, unit: "" },
  "ammo-shared-depot": { value: 4, unit: "" },
  "ammo-lone-courier": { value: 0.15, unit: "%", durationMs: 8_000 },
  "ammo-lone-runner": { value: 0.25, unit: "%", durationMs: 12_000 },
  "repair-tune-up": { value: 0.25, unit: "%", durationMs: 15_000 },
  "repair-fine-tune": { value: 0.4, unit: "%", durationMs: 20_000 },
  "repair-coolant": { value: 0.3, unit: "%", durationMs: 15_000 },
  "repair-deep-coolant": { value: 0.6, unit: "%", durationMs: 20_000 },
  "repair-armor-plating": { value: 0.2, unit: "%", durationMs: 12_000 },
  "repair-heavy-plating": { value: 0.3, unit: "%", durationMs: 12_000 },
  "repair-sight-tuning": { value: 0.15, unit: "%", durationMs: 12_000 },
  "repair-long-sight": { value: 0.25, unit: "%", durationMs: 12_000 },
  "repair-spare-parts": { value: 0.25, unit: "%" },
  "repair-full-kit": { value: 0.5, unit: "%" },
  "repair-battery-swap": { value: 0.25, unit: "%" },
  "repair-full-charge": { value: 0.5, unit: "%" }
};

/** Tam Depo / Tasan Depo: hasar bonusu bu enerji oraninin ustunde isler. */
export const WORKER_FULL_TANK_ENERGY_RATIO = 0.9;

type DevelopmentChoice = Omit<WorkerSkillChoice, "requires">;
type DevelopmentRow = readonly [WorkerSkillPair, WorkerSkillPair];

/**
 * Yon secimi ve derinlestirmesi. Derinlestirme ciftinin i. secenegi yon
 * ciftinin i. secenegini gerektiriyor: A secen A'nin guclusunu, B secen
 * B'ninkini alabiliyor.
 *
 * Secenekler hicbir kuleye, karaktere ya da kule tipine baglanmiyor:
 * etkiler evrensel, hangisinin hangi planla iyi gittigini oyuncu buluyor.
 */
function developmentRow(direction: readonly [DevelopmentChoice, DevelopmentChoice], deepening: readonly [DevelopmentChoice, DevelopmentChoice]): DevelopmentRow {
  return [
    [direction[0], direction[1]],
    [{ ...deepening[0], requires: direction[0].id }, { ...deepening[1], requires: direction[1].id }]
  ];
}

export const WORKER_DEVELOPMENT_ROWS: Readonly<Record<HirableWorkerRole, readonly [DevelopmentRow, DevelopmentRow, DevelopmentRow]>> = {
  energyTransport: [
    developmentRow(
      [
        { id: "energy-high-voltage", name: "Yüksek Gerilim", description: "Teslim alan kule 8 sn boyunca atış başına %25 daha az enerji harcar." },
        { id: "energy-cooling-coil", name: "Soğutma Bobini", description: "Teslimat, teslim alan kulenin ısısını 12° düşürür." }
      ],
      [
        { id: "energy-superconductor", name: "Süper İletken", description: "Yüksek Gerilim güçlenir: teslim alan kule 12 sn boyunca atış başına %40 daha az enerji harcar." },
        { id: "energy-cryo-coil", name: "Kriyo Bobini", description: "Soğutma Bobini güçlenir: teslimat kulenin ısısını 20° düşürür ve ısı kilidini açar." }
      ]
    ),
    developmentRow(
      [
        { id: "energy-mark-guard", name: "İşaret Koruma", description: "Teslim alan kule 6 sn boyunca vurduğu işaretli düşmanların işaret süresini baştan başlatır." },
        { id: "energy-target-lock", name: "Hedef Kilidi", description: "Teslim alan kule 6 sn boyunca hedef değiştirse ya da hedefsiz kalsa da birikimlerini korur." }
      ],
      [
        { id: "energy-lasting-trace", name: "Kalıcı İz", description: "İşaret Koruma güçlenir: teslim alan kule 10 sn boyunca vurduğu işaretli düşmanların işaret süresini baştan başlatır." },
        { id: "energy-fixation-lock", name: "Saplantı Kilidi", description: "Hedef Kilidi güçlenir: teslim alan kule 10 sn boyunca birikimlerini korur." }
      ]
    ),
    developmentRow(
      [
        { id: "energy-long-line", name: "Uzun Hat", description: "Teslim alan kulenin menzili 8 sn boyunca %15 artar." },
        { id: "energy-full-tank", name: "Tam Depo", description: "Teslim alan kule 10 sn boyunca, enerjisi %90'ın üstündeyken %15 fazla hasar verir." }
      ],
      [
        { id: "energy-far-line", name: "Uzak Hat", description: "Uzun Hat güçlenir: menzil 12 sn boyunca %25 artar." },
        { id: "energy-brimming-tank", name: "Taşan Depo", description: "Tam Depo güçlenir: enerjisi %90'ın üstündeyken 10 sn boyunca %25 fazla hasar." }
      ]
    )
  ],
  crystalCollector: [
    developmentRow(
      [
        { id: "crystal-overload", name: "Aşırı Yük", description: "Her reaktör teslimatından sonra kulelerin 6 sn boyunca atış başına %15 daha az enerji harcar." },
        { id: "crystal-heat-vent", name: "Isı Tahliyesi", description: "Her reaktör teslimatı en sıcak 2 kulenin ısısını 15° düşürür." }
      ],
      [
        { id: "crystal-deep-overload", name: "Derin Aşırı Yük", description: "Aşırı Yük güçlenir: teslimattan sonra 10 sn boyunca atış başına %25 daha az enerji." },
        { id: "crystal-heat-purge", name: "Isı Boşaltımı", description: "Isı Tahliyesi güçlenir: en sıcak 3 kule 20° soğur." }
      ]
    ),
    developmentRow(
      [
        { id: "crystal-burst-reserve", name: "Patlama Rezervi", description: "Teslimat reaktörü doldurursa kulelerin 4 sn boyunca enerji harcamadan ateş eder. Bekleme: 20 sn." },
        { id: "crystal-steady-flow", name: "Kararlı Akış", description: "Her reaktör teslimatından sonra kulelerin 10 sn boyunca çalışma enerjisi harcamaz." }
      ],
      [
        { id: "crystal-burst-surge", name: "Patlama Dalgası", description: "Patlama Rezervi güçlenir: 6 sn enerjisiz ateş, bekleme 15 sn." },
        { id: "crystal-steady-current", name: "Kararlı Akım", description: "Kararlı Akış güçlenir: çalışma enerjisi 15 sn boyunca harcanmaz." }
      ]
    ),
    developmentRow(
      [
        { id: "crystal-near-field", name: "Yakın Alan", description: "Her reaktör teslimatından sonra reaktörün 2 kare çevresindeki kuleler 8 sn boyunca %12 fazla hasar verir." },
        { id: "crystal-far-link", name: "Uzak İletim", description: "Her reaktör teslimatı, reaktöre en uzak 2 kuleye 15 enerji gönderir." }
      ],
      [
        { id: "crystal-wide-field", name: "Geniş Alan", description: "Yakın Alan güçlenir: 3 kare çevredeki kuleler 8 sn boyunca %20 fazla hasar verir." },
        { id: "crystal-far-grid", name: "Uzak Şebeke", description: "Uzak İletim güçlenir: en uzak 3 kuleye 20 enerji." }
      ]
    )
  ],
  ammoCollector: [
    developmentRow(
      [
        { id: "ammo-heavy-cast", name: "Ağır Döküm", description: "Fabrikadan teslim edilen her mühimmat partisi, kulenin sonraki 4 atışına %20 fazla hasar verir." },
        { id: "ammo-light-cast", name: "Hafif Döküm", description: "Mühimmat teslim alan kule 10 sn boyunca atış başına %25 daha az mühimmat harcar." }
      ],
      [
        { id: "ammo-dense-cast", name: "Yoğun Döküm", description: "Ağır Döküm güçlenir: sonraki 6 atış %30 fazla hasar verir." },
        { id: "ammo-feather-cast", name: "Tüy Döküm", description: "Hafif Döküm güçlenir: 15 sn boyunca atış başına %40 daha az mühimmat." }
      ]
    ),
    developmentRow(
      [
        { id: "ammo-heat-sink-casing", name: "Isı Emici Kovan", description: "Mühimmat teslim alan kulenin atışları 10 sn boyunca %30 daha az ısı üretir." },
        { id: "ammo-piercing-core", name: "Delici Çekirdek", description: "Mühimmat teslim alan kulenin mermileri 10 sn boyunca 1 düşmanı fazladan deler." }
      ],
      [
        { id: "ammo-cryo-casing", name: "Kriyo Kovan", description: "Isı Emici Kovan güçlenir: atışlar 10 sn boyunca %45 daha az ısı üretir." },
        { id: "ammo-tungsten-core", name: "Tungsten Çekirdek", description: "Delici Çekirdek güçlenir: mermiler 10 sn boyunca 2 düşmanı fazladan deler." }
      ]
    ),
    developmentRow(
      [
        { id: "ammo-armored-crate", name: "Zırhlı Kasa", description: "Mühimmat teslim alan kule 8 sn boyunca %20 daha az hasar alır." },
        { id: "ammo-long-barrel", name: "Uzun Namlu", description: "Mühimmat teslim alan kulenin menzili 10 sn boyunca %12 artar." }
      ],
      [
        { id: "ammo-reinforced-crate", name: "Takviyeli Kasa", description: "Zırhlı Kasa güçlenir: kule 8 sn boyunca %35 daha az hasar alır." },
        { id: "ammo-rifled-barrel", name: "Yivli Namlu", description: "Uzun Namlu güçlenir: menzil 10 sn boyunca %20 artar." }
      ]
    )
  ],
  ammoTransport: [
    developmentRow(
      [
        { id: "ammo-heat-jacket", name: "Isı Ceketi", description: "Teslim alan kule 8 sn boyunca %40 daha hızlı soğur." },
        { id: "ammo-fast-feed", name: "Hızlı Besleme", description: "Teslim alan kule 6 sn boyunca %20 daha hızlı ateş eder." }
      ],
      [
        { id: "ammo-cryo-jacket", name: "Kriyo Ceket", description: "Isı Ceketi güçlenir: kule 12 sn boyunca %70 daha hızlı soğur." },
        { id: "ammo-belt-feed", name: "Şerit Besleme", description: "Hızlı Besleme güçlenir: kule 8 sn boyunca %30 daha hızlı ateş eder." }
      ]
    ),
    developmentRow(
      [
        { id: "ammo-trace-rounds", name: "İz Mühimmatı", description: "Teslim alan kulenin sonraki 5 vuruşu hedefe 6 sn süren bir Takip işareti bırakır." },
        { id: "ammo-concussion-rounds", name: "Sarsıcı Mermi", description: "Teslim alan kulenin sonraki 5 vuruşu düşmanı 0,4 sn yavaşlatır." }
      ],
      [
        { id: "ammo-deep-trace", name: "Derin İz", description: "İz Mühimmatı güçlenir: sonraki 8 vuruş 6 sn süren Takip işareti bırakır." },
        { id: "ammo-shock-rounds", name: "Şok Mermisi", description: "Sarsıcı Mermi güçlenir: sonraki 8 vuruş düşmanı 0,6 sn yavaşlatır." }
      ]
    ),
    developmentRow(
      [
        { id: "ammo-shared-crate", name: "Paylaşılan Kasa", description: "Teslimat, hedefin yanındaki aynı mühimmatı kullanan her kuleye 2 mühimmat bırakır." },
        { id: "ammo-lone-courier", name: "Yalnız Kurye", description: "Komşu karelerinde kule olmayan kuleye teslimat, ona 8 sn boyunca %15 fazla hasar verdirir." }
      ],
      [
        { id: "ammo-shared-depot", name: "Paylaşılan Depo", description: "Paylaşılan Kasa güçlenir: yandaki her kuleye 4 mühimmat." },
        { id: "ammo-lone-runner", name: "Yalnız Koşucu", description: "Yalnız Kurye güçlenir: 12 sn boyunca %25 fazla hasar." }
      ]
    )
  ],
  repairer: [
    developmentRow(
      [
        { id: "repair-tune-up", name: "Ayar Bakımı", description: "Onarımı biten kule 15 sn boyunca atış başına %25 daha az enerji harcar." },
        { id: "repair-coolant", name: "Soğutma Sıvısı", description: "Onarımı biten kulenin ısısı sıfırlanır ve kule 15 sn boyunca %30 daha hızlı soğur." }
      ],
      [
        { id: "repair-fine-tune", name: "İnce Ayar", description: "Ayar Bakımı güçlenir: 20 sn boyunca atış başına %40 daha az enerji." },
        { id: "repair-deep-coolant", name: "Derin Soğutma", description: "Soğutma Sıvısı güçlenir: ısı sıfırlanır, kule 20 sn boyunca %60 daha hızlı soğur." }
      ]
    ),
    developmentRow(
      [
        { id: "repair-armor-plating", name: "Zırh Kaplama", description: "Onarımı biten kule 12 sn boyunca %20 daha az hasar alır." },
        { id: "repair-sight-tuning", name: "Nişan Ayarı", description: "Onarımı biten kulenin menzili 12 sn boyunca %15 artar." }
      ],
      [
        { id: "repair-heavy-plating", name: "Ağır Kaplama", description: "Zırh Kaplama güçlenir: kule 12 sn boyunca %30 daha az hasar alır." },
        { id: "repair-long-sight", name: "Uzun Nişan", description: "Nişan Ayarı güçlenir: menzil 12 sn boyunca %25 artar." }
      ]
    ),
    developmentRow(
      [
        { id: "repair-spare-parts", name: "Yedek Parça", description: "Onarımı biten kulenin mühimmatı deposunun %25'i kadar dolar." },
        { id: "repair-battery-swap", name: "Batarya Değişimi", description: "Onarımı biten kulenin enerjisi deposunun %25'i kadar dolar." }
      ],
      [
        { id: "repair-full-kit", name: "Tam Takım", description: "Yedek Parça güçlenir: mühimmat deponun %50'si kadar dolar." },
        { id: "repair-full-charge", name: "Tam Şarj", description: "Batarya Değişimi güçlenir: enerji deponun %50'si kadar dolar." }
      ]
    )
  ]
};

/**
 * Rol basina 9 hucre: her uclu sira yon, derinlestirme ve oyun degistirici.
 * Hucreler sirayla aciliyor; her hucreden tek secenek alinabiliyor.
 */
export const WORKER_DEVELOPMENT_CELLS: Readonly<Record<HirableWorkerRole, readonly WorkerDevelopmentCell[]>> = Object.fromEntries(
  Object.entries(WORKER_SKILL_TIERS).map(([role, tiers]) => {
    const rows = WORKER_DEVELOPMENT_ROWS[role as HirableWorkerRole];
    return [role, Array.from({ length: 9 }, (_, tier) => {
      const row = Math.floor(tier / 3);
      const column = tier % 3;
      return { tier, options: column === 2 ? tiers[row] : rows[row][column] };
    })];
  })
) as unknown as Record<HirableWorkerRole, readonly WorkerDevelopmentCell[]>;

/** Yon -> derinlestirmesi ("energy-high-voltage" -> "energy-superconductor"). */
export const WORKER_DEVELOPMENT_UPGRADES: Readonly<Partial<Record<WorkerSkillId, WorkerDevelopmentSkillId>>> = Object.fromEntries(
  Object.values(WORKER_DEVELOPMENT_ROWS).flatMap((rows) => rows.flatMap(([, deepening]) => deepening.map((option) => [option.requires, option.id])))
);

export function isWorkerDevelopmentSkillId(value: unknown): value is WorkerDevelopmentSkillId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(WORKER_DEVELOPMENT_EFFECTS, value);
}

/**
 * Sahibin bir yondeki etkisi: derinlestirmesini aldiysa onun sayilari, yalnizca
 * yonu aldiysa yonun sayilari, hicbiri yoksa `undefined`.
 */
export function resolveWorkerDevelopmentEffect(has: (skill: WorkerSkillId) => boolean, direction: WorkerDevelopmentSkillId): WorkerDevelopmentEffect | undefined {
  const upgrade = WORKER_DEVELOPMENT_UPGRADES[direction];
  if (upgrade && has(upgrade)) return WORKER_DEVELOPMENT_EFFECTS[upgrade];
  return has(direction) ? WORKER_DEVELOPMENT_EFFECTS[direction] : undefined;
}

export const WORKER_SPECIALIZATION_CHOICES = [
  { id: "crystalCollector" as const, name: "Kristal Toplayıcı", description: "Reaktörün enerji rezervini ve enerji krizlerini yönetir." },
  { id: "energyTransport" as const, name: "Enerji Taşıyıcı", description: "Enerji ağının bağlantılarını ve kulelerin acil çalışma durumunu değiştirir." },
  { id: "ammoCollector" as const, name: "Mühimmat Toplayıcı", description: "Mühimmat fabrikasının kalite, güvenlik ve savaş geri dönüşümünü belirler." },
  { id: "ammoTransport" as const, name: "Mühimmat Taşıyıcı", description: "Mühimmatın kuleler arasında nasıl dağıtıldığını ve saldırı pencerelerini belirler." },
  { id: "repairer" as const, name: "Tamirci", description: "Tamirin kuleyi koruma, yeniden kurma ve nexus savunma biçimini belirler." }
] as const;

export type WorkerDevelopmentTree = {
  role: HirableWorkerRole;
  tiers: readonly WorkerSkillPair[];
  selectedSkillIds: readonly WorkerSkillId[];
};

export function getWorkerSkillTiers(role: HirableWorkerRole) {
  return WORKER_SKILL_TIERS[role];
}

export function isWorkerSkillId(value: unknown): value is WorkerSkillId {
  return Object.values(WORKER_DEVELOPMENT_CELLS).some((cells) => cells.some((cell) => cell.options?.some((skill) => skill.id === value)));
}

/** Agactaki butun hucreler: oyun degistiriciler ve yon/derinlestirme secenekleri. */
export function isWorkerSkillForRole(role: HirableWorkerRole, value: unknown): value is WorkerSkillId {
  return WORKER_DEVELOPMENT_CELLS[role].some((cell) => cell.options?.some((skill) => skill.id === value));
}

/** Enerji tasiyicinin oyun degistiricileri (eski uc kademe). */
export function isEnergyWorkerSkillId(value: unknown): value is EnergyWorkerSkillId {
  return ENERGY_WORKER_SKILL_TIERS.some((pair) => pair.some((skill) => skill.id === value));
}

export function getWorkerSkill(id: WorkerSkillId) {
  for (const cells of Object.values(WORKER_DEVELOPMENT_CELLS)) {
    for (const cell of cells) {
      const skill = cell.options?.find((option) => option.id === id);
      if (skill) return skill;
    }
  }
  return undefined;
}

export function getEnergyWorkerSkill(id: EnergyWorkerSkillId) {
  return getWorkerSkill(id);
}
