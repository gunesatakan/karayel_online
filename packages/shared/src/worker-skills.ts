import type { HirableWorkerRole } from "./logistics/index.js";

/** Kalici isci secimleri. Her rol kendi uc kademeli ikili agacina sahiptir. */
export type WorkerSkillId =
  | "energy-relay" | "local-capacitor" | "load-shedder" | "frequency-share" | "scenario-charge" | "emergency-bridge"
  | "crystal-reserve" | "crystal-resonance" | "crystal-trap" | "crystal-conduit" | "crystal-last-core" | "crystal-critical-resonance"
  | "ammo-refiner" | "ammo-emergency-refinery" | "ammo-cast-shell" | "ammo-recycling" | "ammo-black-box" | "ammo-wave-stock"
  | "ammo-special-payload" | "ammo-emergency-magazine" | "ammo-transfer-dock" | "ammo-lost-convoy" | "ammo-assault-convoy" | "ammo-evacuation-convoy"
  | "repair-bulwark" | "repair-thermal-welder" | "repair-fortification-seal" | "repair-emergency-rebuild" | "repair-nexus-watch" | "repair-breach-engineer";

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

export type WorkerSkillChoice = { id: WorkerSkillId; name: string; description: string };
export type WorkerSkillPair = readonly [WorkerSkillChoice, WorkerSkillChoice];
export type WorkerDevelopmentCell = {
  readonly tier: number;
  readonly options?: WorkerSkillPair;
};

/**
 * Isci gelisim agacinda kademe acma bedeli. Secim isciye degil oyuncunun
 * agacina yazilir; bu nedenle bir kez odendiginde ayni role ait tum hucreler
 * bu yetenegi kullanir.
 */
export const WORKER_DEVELOPMENT_XP_COSTS = [120, 280, 560] as const;
export const ENERGY_WORKER_SKILL_TIERS: readonly WorkerSkillPair[] = [
  [
    { id: "energy-relay", name: "Röle Mimarı", description: "Teslim edilen kule 8 sn boyunca komşu kulelere enerji kaynağı olur. Ağ menzili 1 kare." },
    { id: "local-capacitor", name: "Yerel Akücü", description: "Her teslimat kulede 18 enerjilik yerel akü bırakır. Ana hat kesilse de yalnızca bu kule çalışır." }
  ],
  [
    { id: "load-shedder", name: "Yük Kesici", description: "Enerji krizi başladığında düşük öncelikli kuleleri kapatır; seçili öncelikli kuleler enerji almayı sürdürür." },
    { id: "frequency-share", name: "Frekans Paylaştırıcı", description: "Enerjisi azalan kuleleri dönüşümlü çalıştırır; aynı anda daha az kule ateş eder ama hat daha geç çöker." }
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

/** 9 hucrelik gorunum: 3/6/9 secimleri mevcut gamechanger ciftleridir. */
export const WORKER_DEVELOPMENT_CELLS: Readonly<Record<HirableWorkerRole, readonly WorkerDevelopmentCell[]>> = Object.fromEntries(
  Object.entries(WORKER_SKILL_TIERS).map(([role, tiers]) => [role, Array.from({ length: 9 }, (_, tier) => ({
    tier,
    options: tier % 3 === 2 ? tiers[Math.floor(tier / 3)] : undefined
  }))])
) as unknown as Record<HirableWorkerRole, readonly WorkerDevelopmentCell[]>;

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
  return Object.values(WORKER_SKILL_TIERS).some((tiers) => tiers.some((pair) => pair.some((skill) => skill.id === value)));
}

export function isWorkerSkillForRole(role: HirableWorkerRole, value: unknown): value is WorkerSkillId {
  return WORKER_SKILL_TIERS[role].some((pair) => pair.some((skill) => skill.id === value));
}

export function isEnergyWorkerSkillId(value: unknown): value is EnergyWorkerSkillId {
  return isWorkerSkillForRole("energyTransport", value);
}

export function getWorkerSkill(id: WorkerSkillId) {
  return Object.values(WORKER_SKILL_TIERS).flat(1).flat().find((skill) => skill.id === id);
}

export function getEnergyWorkerSkill(id: EnergyWorkerSkillId) {
  return getWorkerSkill(id);
}
