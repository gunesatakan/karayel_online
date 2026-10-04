import type { EditableMapData, MapScale } from "./map.js";
import { getMapWorldBounds } from "./map.js";
import type { EnemyRace, HitType, MovementKind } from "./combat.js";
import type { TowerTier } from "./tower-stats/index.js";
// getEnemyExp bu dosyada tanimli oldugu icin deger yeniden disa aktarmanin yaninda
// buraya da alinmali; re-export yalnizca disariya acar, iceride goruntu vermez.
import { ENEMY_EXP_MULTIPLIER, getStructureRepairCost } from "./balance/index.js";

export type CharacterId = "zeynep" | "warrior" | "archer" | "mage" | "healer" | "tank" | "onur";
export type UpgradeId = "damage" | "fireRate" | "projectileSpeed" | "heal";
export type EnemyType = "grunt" | "brute" | "runner" | "shooter" | "siege";
export type ProjectileKind = "arrow" | "bolt" | "orb" | "light" | "chain" | "enemy" | "tower";
export type { DamageType, EnemyRace, HitType, MovementKind, StatusEffectId } from "./combat.js";
export { SHIELD_DAMAGE_TAKEN_MULTIPLIER, applyStatusResistance, calculateArmorDamageMultiplier, calculateDamageTaken, enemyCombatDefinitions, enemyRaceDefinitions, getEnemyCombatDefinition, getEnemyDamageResistances, shapeEnemyResistance } from "./combat.js";

export const GAME_WORLD_WIDTH = 390;
export const GAME_WORLD_HEIGHT = 844;
export const BATTLE_TOP = 86;
export const SHOP_TOP = 650;
export const SHOP_HEIGHT = GAME_WORLD_HEIGHT - SHOP_TOP;
export const PATH_WIDTH = 54;
export const TOWER_GRID_SIZE = 34;
export const TOWER_BUILD_TOP = BATTLE_TOP;
export const TOWER_BUILD_BOTTOM = 698;

/**
 * Ucube'nin seviye secimleri.
 *
 * Digerlerinden farkli olarak Ucube kuruldugu haliyle kalmiyor: belirli
 * seviyelerde oyuncunun onune iki secenek cikiyor ve yalnizca biri aliniyor.
 * Sekiz ozellik dortlu kademeye bolundugu icin bir Ucube bunlarin ancak
 * yarisini tasiyabilir -- hangi yarisi, oyuncunun kurdugu duzene bagli.
 *
 * Eskiden bu sekiz ozellik dalga gectikce kendiliginden aciliyordu; secim
 * olmadigi icin de her Ucube ayni Ucube oluyordu.
 */
export type UcubePerkId =
  | "chain"
  | "pushback"
  | "damage-step"
  | "stacks-15"
  | "range-hull"
  | "endurance"
  | "damage-double"
  | "stacks-20";

export type UcubePerk = {
  id: UcubePerkId;
  name: string;
  description: string;
};

export type UcubePerkTier = {
  /** Secimin acildigi kule seviyesi. */
  level: number;
  options: [UcubePerk, UcubePerk];
};

export const UCUBE_PERK_TIERS: UcubePerkTier[] = [
  {
    level: 4,
    options: [
      { id: "chain", name: "Zincir", description: "Vurdugu hedefin arkasindaki dusmana da sicrar; sicrama hasari kule seviyesiyle buyur." },
      { id: "pushback", name: "Geri Itme", description: "Vurdugu dusmani yolda geri atar, boylece menzilde daha uzun kalir." }
    ]
  },
  {
    level: 6,
    options: [
      { id: "damage-step", name: "Kalibrasyon", description: "Hasar %20 artar." },
      { id: "stacks-15", name: "Genis Sarj", description: "Atis hizi yigin tavani 10'dan 15'e cikar." }
    ]
  },
  {
    level: 8,
    options: [
      { id: "range-hull", name: "Genis Govde", description: "Menzil iki katina cikar, azami can iki katina cikar ve can dolar." },
      { id: "endurance", name: "Sogukkanlilik", description: "20 saniyelik zorunlu kapanma kalkar ve yuksek seviyelerde ek hasar carpani kazanir." }
    ]
  },
  {
    level: 10,
    options: [
      { id: "damage-double", name: "Asiri Yuk", description: "Hasar iki katina cikar." },
      { id: "stacks-20", name: "Derin Sarj", description: "Atis hizi yigin tavani 20'ye cikar." }
    ]
  }
];

export const UCUBE_PERK_LEVELS = UCUBE_PERK_TIERS.map((tier) => tier.level);

export function getUcubePerkTier(level: number) {
  return UCUBE_PERK_TIERS.find((tier) => tier.level === level);
}

export function isUcubePerkOption(level: number, perkId: string) {
  return Boolean(getUcubePerkTier(level)?.options.some((option) => option.id === perkId));
}

export type MelisSpectrumZone = "approval" | "balanced" | "stress";

/** Melis'in serilerini hangi tarafa yazdigi; bari surdugu direksiyon. */
export type MelisStance = "approval" | "stress";

/**
 * Evrimin bedeli: stresten dusulen sabit puan.
 *
 * Eskiden esik bir orandi (stres/onay >= 1.5) ve onay hicbir zaman azalmadigi
 * icin payda buyudukce evrim erisilemez hale geliyordu -- iyi oynayan oyuncu 20
 * dalgada tek evrim goremiyordu. Sabit bedel stresi bir para birimine cevirir:
 * harcandiginda bar onaya dogru geri doner ve dongu kapanir.
 */
export const MELIS_EVOLUTION_STRESS_COSTS = [10, 16, 24];

export function getMelisEvolutionStressCost(evolutionLevel: number) {
  return MELIS_EVOLUTION_STRESS_COSTS[evolutionLevel - 1] ?? 0;
}

/**
 * Melis'in onay/stres bolgesi.
 *
 * Oyun icindeki her etki iki sayinin dogrudan karsilastirmasindan cikiyor:
 * stres onaydan buyukse stres etkileri, onay stresten buyukse onay etkileri,
 * esitse ikisi de degil. Gostergenin ayri bir esik kullanmasi oyuncuya yanlis
 * bilgi veriyordu -- oran 0.55'te ekranda "dengeli" yazarken butun stres
 * etkileri calisiyordu. Kural burada duruyor ki sunucu ile gosterge ayrisamasin.
 */
export function getMelisSpectrumZone(approval: number, stress: number): MelisSpectrumZone {
  if (stress > approval) return "stress";
  if (approval > stress) return "approval";
  return "balanced";
}

/**
 * Kulenin o anki ruh halinde ne yaptigi, oyuncunun okuyacagi halde.
 *
 * Onay/stres kule davranisini degistiriyor ama oyun icinde bunu soyleyen hicbir
 * sey yoktu: oyuncu yalnizca renkli bir cubuk goruyordu. Metinler kurallarla
 * ayni pakette duruyor cunku bu ikisi ayri yerlerde yasadiginda kacinilmaz
 * olarak ayrisiyorlar -- karakter ozeti tam da boyle, kaldirilan bir buff'i
 * anlatmaya devam etmisti.
 *
 * Yalnizca ruh haline gore degisen kuleler burada; digerleri icin satir yok.
 */
const MELIS_ZONE_EFFECTS: Record<string, Record<MelisSpectrumZone, string>> = {
  // Hedefci: onayda kilidi menzil disina tasiyabiliyor.
  "archer-1": {
    approval: "Kilit menzil dışında da korunur",
    balanced: "Kilit menzilden çıkınca kopar",
    stress: "Kilit menzilden çıkınca kopar"
  },
  // Parlama: streste kendi komsularini susturuyor.
  "archer-2": {
    approval: "Öfke dalgası dost kuleleri etkilemez",
    balanced: "Öfke dalgası dost kuleleri etkilemez",
    stress: "Öfke dalgası çevredeki dost kuleleri 0,5 sn durdurur"
  },
  // Lanet: sure tamamen ruh haline bagli, evrim bu sayiya dokunmuyor.
  "archer-3": {
    approval: "Lanet 7 sn kalır",
    balanced: "Lanet 5 sn kalır",
    stress: "Lanet 3 sn kalır"
  },
  // Kirik Ayna: hedef secimi ve olum patlamasi.
  "archer-5": {
    approval: "Çıkışa en yakın düşmanı hedefler",
    balanced: "Canı en yüksek düşmanı hedefler",
    stress: "Rastgele hedefler, öldürdüğünde patlama saçmaz"
  },
  // Fisilti: onayda suphe uzuyor, streste dusman toparlanip hizlaniyor.
  "archer-6": {
    approval: "Şüphe 2 sn daha uzun kalır",
    balanced: "Şüphe normal süresinde kalır",
    stress: "Duraksama bitince düşman 0,5 sn hızlanır"
  }
};

export function getMelisZoneEffectText(definitionId: string, zone: MelisSpectrumZone) {
  return MELIS_ZONE_EFFECTS[definitionId]?.[zone];
}

/** Ruh haline gore davranisi degisen Melis kuleleri. */
export function getMelisZoneAffectedTowerIds() {
  return Object.keys(MELIS_ZONE_EFFECTS);
}

export type ArenaCameraView = {
  fit: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Kameranin gostermesi gereken dunya dikdortgeni.
 *
 * `fit`, haritayi ekrana sigdirmak icin gereken olcek. Genislik kisiti her
 * haritaya isler: varsayilan arena 12 sutun x 34 px = 408 px, kameranin gordugu
 * serit ise 390 px. Sigdirma yapilmazsa harita iki yanindan 9'ar piksel
 * kirpilir; en soldaki karenin dis kenari ekranin disinda kalir.
 *
 * Harita yatayda ekranin ortasina, dikeyde ise ust cubuk ile kontrol paneli
 * arasindaki yerlesim seridinin ortasina oturur. Dikey yerlesim ekran kesrine
 * birakilirsa sigdirmadan artan pay tumuyle alta, harita ile kontrol panelinin
 * arasina bosluk olarak dusuyor -- uzun haritalarda ise harita cerceveyi asiyor.
 */
/**
 * Haritanin oturacagi serit.
 *
 * Ust cubuk ve kontrol paneli HTML; yukseklikleri iceriklerine ve cihaza gore
 * degisiyor -- stat seridi sarilinca ust cubuk uzuyor, iOS'ta tam ekran
 * olmadigi icin tuval kisaliyor ve ayni HTML tuvalin daha buyuk bir kismini
 * ortuyor. Serit sabit yazilirsa harita bu durumda cubugun altinda kaliyor.
 * Olculen degerler verilmediginde tasarim varsayilanlarina dusulur.
 */
export type ArenaChrome = {
  /** Ust cubugun tuval yuksekligine orani. */
  topRatio: number;
  /** Kontrol panelinin tuval yuksekligine orani. */
  bottomRatio: number;
};

export const DEFAULT_ARENA_CHROME: ArenaChrome = {
  topRatio: TOWER_BUILD_TOP / GAME_WORLD_HEIGHT,
  bottomRatio: (GAME_WORLD_HEIGHT - TOWER_BUILD_BOTTOM) / GAME_WORLD_HEIGHT
};

/**
 * Tuvalin dunya birimindeki olcusu.
 *
 * Genislik her cihazda ayni, yukseklik degil: tuval ekranin oranini aldigi icin
 * (yoksa iki yanda siyah bant kaliyor) yukseklik cihazdan cihaza degisiyor.
 * Sabit yazilirsa serit hesabi tuvalden baska bir seyi olcer.
 */
export type ArenaWorldSize = { width: number; height: number };

export const DEFAULT_ARENA_WORLD: ArenaWorldSize = { width: GAME_WORLD_WIDTH, height: GAME_WORLD_HEIGHT };

export function getArenaCameraView(
  map: EditableMapData,
  chrome: ArenaChrome = DEFAULT_ARENA_CHROME,
  world: ArenaWorldSize = DEFAULT_ARENA_WORLD
): ArenaCameraView {
  const bounds = getMapWorldBounds(map);
  const worldWidth = Math.max(1, world.width);
  const worldHeight = Math.max(1, world.height);
  // Serit, tuvalin HTML kaplamalardan arta kalan kismi.
  const topRatio = Math.min(0.45, Math.max(0, chrome.topRatio));
  const bottomRatio = Math.min(0.45, Math.max(0, chrome.bottomRatio));
  const bandTop = worldHeight * topRatio;
  const bandBottom = worldHeight * (1 - bottomRatio);
  const availableHeight = Math.max(1, bandBottom - bandTop);

  const fit = Math.min(1, worldWidth / bounds.width, availableHeight / bounds.height);
  const width = worldWidth / fit;
  const height = worldHeight / fit;
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  // Haritanin merkezinin oturmasi gereken ekran noktalari.
  const screenCenterX = worldWidth / 2;
  const screenCenterY = (bandTop + bandBottom) / 2;
  return {
    fit,
    left: centerX - screenCenterX / fit,
    top: centerY - screenCenterY / fit,
    width,
    height
  };
}

/**
 * Dokunmatik cihazlarda cizim olceginin tavani.
 *
 * Deger korunuyor: telefonlarda doldurma hizi darbogaz ve bu tavan bilerek
 * indirilmisti. Fare kullanan cihazlar bu tavana tabi degil.
 */
export const MAX_TOUCH_RENDER_SCALE = 2;

/** Fare kullanan cihazlarda tuvalin cihaz pikseli cinsinden en genis hali. */
export const MAX_RENDER_CANVAS_WIDTH = 2560;

/**
 * Tuvalin dunya birimi basina kac cihaz pikseli cizecegi.
 *
 * Deger bir donem `min(devicePixelRatio, 2)` sabitiydi. Bu sabit "cihaz
 * pikseli / CSS pikseli" oranini "cihaz pikseli / dunya birimi" yerine
 * koyuyordu. Telefonda ikisi ayni sey: gorunur alan ~390 CSS pikseli
 * genisliginde ve dunya da 390 birim. Masaustunde degil -- 1440 piksellik bir
 * pencerede ayni 390 birim dort kat genise yayiliyor, tuval 390 piksel kalip
 * 1440'a geriliyor ve goruntu bulaniyor.
 *
 * `finePointer` yalnizca fare ya da izleme yuzeyi olan cihazlarda dogru.
 * Telefon ve tabletler -- her iki yonde de -- eski hesabin **aynisini**
 * aliyor: ekrani birebir kaplamak oralarda cizim yukunu artirmak demek.
 */
export function getRenderScale(options: {
  hostWidth: number;
  devicePixelRatio: number;
  finePointer: boolean;
  worldWidth?: number;
  maxCanvasWidth?: number;
}) {
  const pixelRatio = Math.max(1, options.devicePixelRatio || 1);
  const touchScale = Math.min(pixelRatio, MAX_TOUCH_RENDER_SCALE);
  if (!options.finePointer) return touchScale;
  const worldWidth = Math.max(1, options.worldWidth ?? GAME_WORLD_WIDTH);
  const maxCanvasWidth = Math.max(worldWidth, options.maxCanvasWidth ?? MAX_RENDER_CANVAS_WIDTH);
  // Ekrani birebir kaplayan olcek: tuvalin cihaz pikseli sayisi ekranin cihaz
  // pikseli sayisina esitlenir. Asagi dogru asla eski degerin altina inmiyor.
  const coverScale = (Math.max(1, options.hostWidth) * pixelRatio) / worldWidth;
  return Math.min(Math.max(touchScale, coverScale), maxCanvasWidth / worldWidth);
}

export const MAP_PATH = [
  { x: 34, y: 104 },
  { x: 326, y: 104 },
  { x: 326, y: 244 },
  { x: 82, y: 244 },
  { x: 82, y: 392 },
  { x: 318, y: 392 },
  { x: 318, y: 540 },
  { x: 72, y: 540 },
  { x: 72, y: 610 },
  { x: 356, y: 610 },
  { x: 356, y: 681 }
] as const;

export type PlayerSnapshot = {
  id: string;
  name: string;
  characterId: CharacterId;
  /**
   * Odadaki sabit oyuncu yuvasi (0-3); 0 ise alan yok.
   *
   * Hasar olayi vuranin oturum kimligini degil bu yuvayi tasiyor: kimlik her
   * olayda 9-20 karakter olurdu, yuva tek hane. Yuva maci boyunca degismiyor,
   * yeniden baglanan oyuncu da ayni oyuncu kaydini ve yuvayi aliyor.
   */
  slot?: number;
  gold: number;
  goldSpent: number;
  experience: number;
  /** XP ile acilan, oyuncunun tum isci hucrelerine uygulanan global beceriler. */
  workerSkillIds?: import("./worker-skills.js").WorkerSkillId[];
  /**
   * Secilmis kartlar; yigilan kart her alimda bir kez yazilir. Hic kart
   * yoksa alan gonderilmez.
   *
   * Kartlar bir donem tele hic cikmiyordu ve oyuncu secim ekranindan sonra
   * ne sectigini bir daha goremiyordu. Hedefli kartlar da burada: sunucu
   * onlari hem kuleye hem oyuncuya yaziyor. Hangi kuleye bagli olduklari
   * kulenin `targetedCardIds` alaninda.
   */
  ownedCardIds?: string[];
  ownedShopItemIds?: string[];
  /** Alinmis ama henuz bir kuleye takilmamis esyalar. */
  inventoryItemIds?: string[];
  shopOffers?: import("./shop/index.js").ShopItem[];
  shopRerollPrice?: number;
  towersBuilt: number;
  /**
   * Oyuncunun su anki kule kontenjani, kapasite kartlari dahil.
   *
   * Istemci bunu kendi hesaplamiyor: kapasiteyi buyuten kartlar oyuncunun
   * `runModifiers` listesinde duruyor ve o liste tele hic cikmiyor. Istemci
   * elle yazilmis bir sayi tasidiginda sunucu sinirla ayrisiyordu -- sunucu
   * izin verirken onizleme yerlestirmeyi reddediyordu.
   */
  towerLimit: number;
  ultimateCharge: number;
  /** Altinla alinmis ulti gucu kademesi; hasar carpani buradan cikar. */
  ultimatePower?: number;
  skillCooldowns: number[];
  reputation?: number;
  authorityChain?: number;
  authorityQuality?: number;
  approval?: number;
  stress?: number;
  melisStance?: import("./index.js").MelisStance;
  /** Satin alinmis ek isciler; siradaki bedel bu sayidan cikar. */
  hiredWorkers?: Array<import("./logistics/index.js").HiredWorker>;
  /**
   * Oyuncunun iscilerine yasakladigi kareler; "col:row" bicminde.
   *
   * Oyuncu basina, cunku yasak bir yonlendirme tercihi: bir oyuncunun
   * hattini duzenlemesi otekinin iscilerini baglamamali.
   */
  workerBannedCells?: string[];
  /**
   * Isci alim bedelinin kart ve esya carpani; 1 ise yazilmaz.
   *
   * `towerLimit` ile ayni sebeple telde: carpani doguran `runModifiers`
   * listesi hic gonderilmiyor, yani istemci indirimi kendi bulamaz.
   * Bedelin kendisi degil carpan gonderiliyor cunku normal ve gelismis
   * kademe icin iki ayri sayi olurdu ve sayac her alimda degisiyor.
   */
  workerHireCostMultiplier?: number;
  /**
   * Kurulumda, siradaki dalgada ucan varken oyuncunun ayakta hicbir kulesi
   * havayi vuramiyorsa `true`; baska her durumda alan yok.
   *
   * Sunucu savasin hedef secerken sordugu soruyu soruyor: tanimdaki bayrak ya
   * da kart/esya kilidi. Istemci ayni kurali kendi yazsa bir kilit bir tarafta
   * acilip obur tarafta acilmayabilirdi. Takim arkadasinin kuleleri sayilmiyor:
   * uyari oyuncunun kendi kurulumu icin.
   */
  noAirDefense?: boolean;
};

export type LobbyPlayerSnapshot = {
  id: string;
  name: string;
  characterId: CharacterId;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
};

export type LobbyStateSnapshot = {
  roomId: string;
  roomName: string;
  hostId: string;
  mapScale: MapScale;
  started: boolean;
  players: LobbyPlayerSnapshot[];
  maxPlayers: number;
  /**
   * Odanin asamasi; kurucunun menude sectigi. Katilan oyuncu hangi irka
   * karsi oynayacagini lobide gormeli. Eski bir sunucu gondermeyebilir.
   */
  stage?: number;
};

export type RoomListingSnapshot = {
  roomId: string;
  roomName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  mapScale: MapScale;
  started: boolean;
  /** Odanin asamasi; katilmadan once gorulsun. */
  stage?: number;
};

export type EnemySnapshot = {
  id: string;
  type: EnemyType;
  race: EnemyRace;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  attack: number;
  healthRegenPerSecond: number;
  shield: number;
  maxShield: number;
  movementKind: MovementKind;
  pathDistance: number;
  pathId?: number;
  isTracked?: boolean;
  trackingStacks?: number;
  isFeared?: boolean;
  isArmorBroken?: boolean;
  isDominated?: boolean;
  isWhisperTurned?: boolean;
  curseLoad?: number;
  doubtStacks?: number;
  isHesitating?: boolean;
  isBleeding?: boolean;
  /** Sogutma Kanali yavaslatmasi altinda; ince bir kirag ciziliyor. */
  isChilled?: boolean;
  /** Derin Dondurma ile durdurulmus; kalin buz kabugu ciziliyor. */
  isFrozen?: boolean;
  isUnderworldLinked?: boolean;
  isUndead?: boolean;
  /**
   * Dalganin sampiyonu (`getWaveChampionPlan`): tac, buyuk govde, kalin can
   * cubugu. Normal dusmanda alan hic yok. Statik kayitta tasiniyor: dogumda
   * bir kez gidiyor, karelerde hic.
   */
  champion?: true;
};

export type StaticEnemySnapshot = Required<Pick<EnemySnapshot,
  "id" | "type" | "race" | "maxHp" | "attack" |
  "healthRegenPerSecond" | "maxShield" | "movementKind"
>> & Pick<EnemySnapshot, "pathId" | "champion">;
export type DynamicEnemySnapshot = Omit<EnemySnapshot, keyof StaticEnemySnapshot> & { id: string };

export type TowerSnapshot = {
  id: string;
  ownerId: string;
  ownerName: string;
  characterId: CharacterId;
  definitionId: string;
  name: string;
  x: number;
  y: number;
  orientation?: "horizontal" | "vertical";
  /**
   * Kule kurulurken odenen altin.
   *
   * Formulden yeniden hesaplanmiyor, odenen sayi tasiniyor: kurulum
   * icinde geri alinan kule tam olarak odenen kadar iade ediyor ve
   * bedava kurulan kule (yaratici mod) sifir iade ediyor. Tureterek
   * hesaplasaydik ikisi de yanlis olurdu.
   */
  buildGold?: number;
  /**
   * Onarim bedelinin kart ve esya carpani.
   *
   * Carpani doguran degistirici listesi tele hic cikmiyor, yani istemci
   * indirimi kendi bulamaz -- "Kaynak Makinesi" takili bir kulede sunucu
   * ucuza onariyor ama dugmede eski sayi duruyordu.
   *
   * 1 olsa bile yaziliyor: kule kayitlari delta ile gidiyor ve delta bir
   * alanin **silinmesini** ancak alan kayittan tumuyle cikinca
   * bildirebiliyor. Bazen yazip bazen atlamak, carpan 1'e dondugunde
   * istemcide eski degerin asili kalmasi demekti. Hep yazildiginda delta
   * degismeyen kareleri zaten atiyor, yani bedeli yok.
   */
  repairCostMultiplier?: number;
  /** Satis iadesinin kart ve esya carpani; onarimla ayni sebeple hep yazilir. */
  sellRefundMultiplier?: number;
  /**
   * Kulenin kuruldugu kurulum oturumu; dalga arasinda kurulmadiysa yok.
   *
   * Dalga numarasi degil ayri bir sayac, cunku onemli olan "hangi ara"
   * oldugu; yaratici mod kurulum evresini elle acip kapatabiliyor ve
   * dalga numarasi ayni kalabiliyor.
   */
  builtInSetupSession?: number;
  /**
   * Kulenin aurasi su an calisiyor mu.
   *
   * Izolasyon Kulesi'nin aurasi yalnizca kule yalnizken aciliyor ve bu
   * karar tamamen sunucuda. Istemci bilmeden ciziyor olsaydi ya hic
   * cizmezdi ya da kapaliyken de cizip yalan soylerdi.
   */
  auraActive?: boolean;
  /**
   * Kulenin aurasinin dusman hizina uyguladigi carpan.
   *
   * Izolasyon Kulesi'nin ne kadar yavaslattigi hicbir yerde yazmiyordu.
   * Seviyeyle ve kartlarla degistigi icin istemci kendi hesaplayamaz.
   */
  /**
   * Kulenin ritmi bir etki araligiysa, o araligin uzunlugu.
   *
   * Ayri bir alan cunku anlami ayri: saldiri hizi buna islemiyor ve panelde
   * bunu gormek, isabet etmeyen bir karti almamanin tek yolu.
   */
  effectIntervalMs?: number;
  auraSlowMultiplier?: number;
  /**
   * Kulenin vuruslarinin dusman hizina birakacagi carpan ve suresi.
   *
   * Durumun `magnitude` degeri degil, sahada gercekten olusan hiz. Ikisi
   * ayni sey degil: yavaslatma durumunun gucu hiza islemiyor, aktifse hiz
   * duz bir tavana iniyor. Panelde `magnitude` yazdigi surece kule
   * "-%100 yavaslatiyorum" diyordu, oysa yaptigi -%52'ydi.
   */
  slowSpeedMultiplier?: number;
  /** Mesafeyle degisen yavaslatmalarda uzaktaki deger; yoksa tek bir sayi. */
  slowSpeedMultiplierFar?: number;
  slowDurationMs?: number;
  /** Radians toward the current target. Only sent for towers that aim. */
  facing?: number;
  level: number;
  range: number;
  minimumRange?: number;
  color: number;
  hp?: number;
  maxHp?: number;
  armor?: number;
  disabled?: boolean;
  ammoType?: import("./characters/common/types.js").AmmoType;
  ammo?: number;
  maxAmmo?: number;
  energy?: number;
  maxEnergy?: number;
  shotFuel?: "ammo" | "energy";
  operatingEnergyPerSecond?: number;
  standby?: boolean;
  wakeRemainingMs?: number;
  energyState?: import("./tower-rules.js").TowerEnergyState;
  energyRelayUntil?: number;
  energyRelaySourceId?: string;
  energyLocalReserve?: number;
  energyBridgeUntil?: number;
  energyShedUntil?: number;
  energyFrequencyUntil?: number;
  energyScenarioCharge?: number;
  energyConduitUntil?: number;
  energyConduitSourceId?: string;
  energyFreeUntil?: number;
  crystalReserve?: number;
  crystalTrapUntil?: number;
  ammoFactoryShield?: number;
  ammoRefinerUntil?: number;
  ammoPayloadUntil?: number;
  ammoPayloadKind?: "refined" | "special";
  ammoEmergencyShots?: number;
  ammoAssaultUntil?: number;
  ammoEvacuationUntil?: number;
  repairFortificationUntil?: number;
  repairFortificationHp?: number;
  repairBreachUntil?: number;
  resourceProvider?: import("./characters/common/types.js").TowerResourceProvider;
  ammoLogisticsEnabled?: boolean;
  logisticsPriority?: import("./defense-insights.js").LogisticsPriority;
  insight?: string;
  /**
   * Duvara acilmis kapi.
   *
   * Isciler bu kenardan gecer, dusmanlar gecemez. Yalnizca duvarda anlamli:
   * kare kaplayan yapilarda gecis diye bir sey yok, yapinin kendisi var.
   */
  gate?: boolean;
  temperature?: number;
  /**
   * Isinin izin verdigi surekli tetikleme hizi, oyun saniyesi basina.
   *
   * Yalnizca isi baglayan kulede, yani sogutma tam hizi karsilayamiyorsa
   * geliyor; yoksa alan hic yok. Sunucu savasin kullandigi fonksiyonlarla
   * hesapliyor (atis isisi, sogutma, isisiz aralik): istemci kural yazsa
   * kartlar ve kol bir tarafta degisip obur tarafta degismezdi.
   */
  sustainedAttacksPerSecond?: number;
  misfortune?: number;
  luckyWindowRemainingMs?: number;
  lastLuckMultiplier?: number;
  bladeAngle?: number;
  bladeLength?: number;
  performance?: number;
  coolingRate?: number;
  rawAmmo?: number;
  maxRawAmmo?: number;
  status?: string;
  damageDealt?: number;
  currentDps?: number;
  melisEvolutionLevel?: number;
  isMelisFavorite?: boolean;
  melisUnderworldMode?: "approval" | "stress";
  melisUnderworldPullCount?: number;
  /** Ucube'nin sectigi seviye ozellikleri. */
  ucubePerks?: import("./index.js").UcubePerkId[];
  /** Secim bekleyen seviye; yalnizca kule sahibine anlamli. */
  ucubePendingLevel?: number;
  serverLinkWaveAge?: number;
  linkedTowerIds?: string[];
  zeynepFormationSize?: number;
  zeynepFormationLevel?: number;
  targetingMode?: import("./characters/common/types.js").TowerTargetingMode;
  /** Bu kuleye takili magaza esyalari; takilan esya sokulemez. */
  equippedShopItemIds?: string[];
  /** Bu kuleye baglanmis hedefli kartlar; yigilan kart her alimda bir kez. */
  targetedCardIds?: string[];
  /**
   * Kulenin acik davranis kilitleri, bit maskesi olarak. Sunucu cozup gonderir;
   * istemci ayni cozumlemeyi tekrar yazarsa iki taraf kacinilmaz olarak ayrisir.
   * Okumak icin `hasUnlockBit` veya `decodeUnlocks`.
   */
  unlockBits?: number;
};

export type StaticTowerSnapshot = Required<Pick<TowerSnapshot,
  "id" | "ownerId" | "ownerName" | "characterId" | "definitionId" |
  "name" | "x" | "y" | "color"
>> & Pick<TowerSnapshot,
  "orientation" | "ammoType" | "shotFuel" | "operatingEnergyPerSecond" |
  "resourceProvider" | "coolingRate" | "buildGold" | "builtInSetupSession"
>;
export type DynamicTowerSnapshot = Omit<TowerSnapshot, keyof StaticTowerSnapshot> & { id: string };

export type StaticSnapshot = {
  enemies: StaticEnemySnapshot[];
  towers: StaticTowerSnapshot[];
  /**
   * Sunucunun oynadigi arena.
   *
   * Harita `match:map` mesajiyla da gonderiliyor ama o mesaj `onJoin` icinde,
   * yani istemci odaya baglanmayi bekleyip dinleyicilerini takmadan once
   * cikiyor; kacirilirsa istemci menudeki haritayi cizmeye devam ediyor ve
   * sunucunun simule ettiginden bambaska bir tahtaya bakiyor. Tam anlik goruntu
   * istemcinin kendi istedigi an geldigi icin yaris barindirmaz.
   */
  map?: EditableMapData;
};

export type ProjectileSnapshot = {
  id: string;
  kind: ProjectileKind;
  source: "tower" | "enemy";
  definitionId?: string;
  hitType?: HitType;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /**
   * Atisi yapan kulenin gorsel kademesi. Kademe 1'de yazilmaz: snapshot zaten
   * karenin en pahali parcasi ve mermilerin cogunlugu kademe 1. Okuyan taraf
   * eksik alani 1 sayar.
   */
  tier?: TowerTier;
};

export type ProjectileSpawnSnapshot = ProjectileSnapshot & { spawnedAt: number };
export type ProjectileHitSnapshot = { id: string; x: number; y: number; tier?: TowerTier };
/** Every physical contact, including intermediate pierces; removal is a separate event. */
export type ProjectileContactSnapshot = ProjectileHitSnapshot & { definitionId: string; angle: number };

export type DroneSnapshot = {
  id: string;
  /**
   * "repair" Atakan ultisinin nexusa giden dronu; "repairer" ise sahada
   * yapi onaran isci. Ikisi ayri: biri bir kerelik bir yuk tasir, oteki
   * saniyede onarir.
   */
  mode: "attack" | "repair" | "repairer" | "crystalCollector" | "ammoCollector" | "energyTransport" | "ammoTransport";
  x: number;
  y: number;
  ownerId?: string;
  cargo?: number;
  capacity?: number;
  speed?: number;
  targetTowerId?: string;
  /** Yalnizca tamirci gercekten can onarirken gonderilir; yolculukta efekt yok. */
  repairing?: boolean;
  /** Gelismis isci: istemci onu ayirt edilebilir cizsin diye telde. */
  advanced?: boolean;
  /** Kalıcı işçi uzmanlık seçimleri; yalnızca sahibine gösterilir. */
  skillIds?: import("./worker-skills.js").WorkerSkillId[];
  /** Lojistik iscisinin cani. Savasci dronlarda yok. */
  hp?: number;
  maxHp?: number;
};

export type CrystalNodeSnapshot = {
  id: string;
  x: number;
  y: number;
};

export type AmmoNodeSnapshot = {
  id: string;
  x: number;
  y: number;
};

export type BeamSnapshot = {
  id: string;
  definitionId: string;
  /**
   * Isini yaratan kulenin gorsel kademesi; mermideki alanla ayni dil.
   *
   * Kademe 1 yazilmaz. Bir sure yalnizca mermilerde vardi ve isinla vuran
   * kuleler seviye atladikca hicbir sey degismiyordu -- Zeynep'in bes saldiri
   * kulesinin dordu bu yuzden hep ayni goruyordu.
   */
  tier?: import("./tower-stats/index.js").TowerTier;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  scanX?: number;
  scanY?: number;
  width: number;
  color: number;
  overdrive?: boolean;
  ttlMs?: number;
};

/**
 * Yuzen hasar sayisi.
 *
 * Tek harfli, istege bagli alanlar bilerek: olay 900 ms oyun zamani (0.8
 * hizla ~1.1 sn) yasiyor ve her snapshotta (60 ms'de bir) yeniden gidiyor,
 * yani bir olay telde ~19 kez. Varsayilan deger hic yazilmiyor -- `undefined`
 * bile yazilmiyor, cunku msgpack anahtari yine tasiyor.
 */
export type DamageEventSnapshot = {
  id: string;
  x: number;
  y: number;
  /**
   * Gercekten inen hasar (kalkan + can). Son vurusta dusmanin kalan cani
   * kadar: fazlasi hicbir seye inmedi, sayi sisirilmiyor.
   */
  amount: number;
  /** Kritik vurus; degilse alan yok. */
  c?: 1;
  /** Son vurus: dusman bu vurusla oldu; degilse alan yok. */
  k?: 1;
  /**
   * Vuranin oyuncu yuvasi (`PlayerSnapshot.slot`). 0. yuva yazilmiyor;
   * sahipsiz vurusta `DAMAGE_EVENT_NO_OWNER` (-1).
   */
  o?: number;
  /** Boyut kovasi (`getDamageSizeBucket`); 0 ise alan yok. */
  r?: 1 | 2;
  /**
   * Onur jackpot'u: kritik vurusta kulenin sans carpani
   * `ONUR_JACKPOT_MIN_LUCK`in ustundeyse carpanin on kati (1.9 -> 19);
   * degilse alan yok. Yalnizca kritikte ve nadir oldugu icin telde neredeyse
   * hic yer tutmuyor; istemci "JACKPOT ×1.9" damgasini buradan yaziyor.
   */
  j?: number;
};

export type KillEventSnapshot = {
  id: string;
  ownerId: string;
  enemyId: string;
  serverTime: number;
  streakTier?: import("./balance/index.js").KillStreakTier;
  /**
   * Oldurenin bu oldurmeden aldigi altin (kendi carpaniyla, tabana
   * yuvarli: gercekte kazanilandan fazlasini soylemesin); yoksa alan yok. Yalnizca oldurenin ekraninda dunyada "+N"
   * olarak cikiyor: odadaki herkes ayni payi aliyor ama takim arkadasinin
   * oldurmesi senin ekraninda pop yapmiyor, HUD sayiminda goruluyor.
   */
  g?: number;
  /**
   * Co-op asisti: oldurenden farkli oyuncularin katkisi, her biri
   * `yuva*4+tur` (`encodeKillAssists`). Asist yoksa (ve soloda hep) alan yok;
   * olay telde otuz kez gittigi icin tek kucuk tam sayi.
   */
  a?: number[];
};

export type ZeynepCommandTier = "small" | "medium" | "big";

export type ZeynepCommandEffectSnapshot = {
  tier: ZeynepCommandTier;
  multiplier: number;
  remainingMs: number;
};

export type TeamSnapshot = {
  health: number;
  maxHealth: number;
  gold: number;
  wave: number;
  /**
   * `wave` dalgasinin toplam dusman sayisi: sunucunun dogurmayi planladigi
   * kadar (`waveTarget`).
   *
   * Kurulumda `wave` siradaki dalga ve sayac onun icin kurulmus oluyor, yani
   * orada bu siradaki dalganin ongorusu. Dalga sirasinda ayni dalganin
   * toplami; kalani `enemiesLeft` soyluyor.
   */
  waveEnemyCount?: number;
  /** `wave` dalgasindaki ucanlar (`getWaveAirMode`); hic ucan yoksa alan yok. */
  waveAirMode?: Exclude<import("./balance/index.js").WaveAirMode, "none">;
  enemiesLeft: number;
  kills: number;
  energy: number;
  maxEnergy: number;
  ammunition: Record<import("./characters/common/types.js").AmmoType, number>;
  maxAmmunition: Record<import("./characters/common/types.js").AmmoType, number>;
};

export type ServerPerfSnapshot = {
  tickMs: number;
  tickMaxMs: number;
  snapshotBytes: number;
  snapshotHz: number;
  sections: {
    spawnMs: number;
    towersMs: number;
    projectilesMs: number;
    enemiesMs: number;
    cooldownsMs: number;
    ultimatesMs: number;
    snapshotMs: number;
  };
  ops: {
    targetSearches: number;
    targetChecks: number;
    aoeChecks: number;
    chainChecks: number;
    damageEvents: number;
  };
};

export type GameSnapshot = {
  serverTime: number;
  hostId: string;
  map?: EditableMapData;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  towers: TowerSnapshot[];
  projectiles: ProjectileSnapshot[];
  drones: DroneSnapshot[];
  crystalNodes: CrystalNodeSnapshot[];
  ammoNodes: AmmoNodeSnapshot[];
  beams: BeamSnapshot[];
  damageEvents: DamageEventSnapshot[];
  killEvents: KillEventSnapshot[];
  zeynepCommands?: {
    haste?: ZeynepCommandEffectSnapshot;
    range?: ZeynepCommandEffectSnapshot;
    slow?: ZeynepCommandEffectSnapshot;
  };
  melisGothicNightmareActive?: boolean;
  result?: "victory" | "defeat";
  team: TeamSnapshot;
  /**
   * Etkilerin o ana kadar yaptigi is.
   *
   * Oyuncunun sikayeti dogrudan buydu: kart ve esya aliyor ama karsiligini
   * goremiyor, para bosa gidiyormus gibi hissediyor. Anahtar etki adi,
   * deger ise ya toplam hasar ya da saniye -- hangisi oldugunu okuyan
   * taraf biliyor.
   *
   * Sifir olan kalem hic yazilmiyor: hic kanama olmayan bir kosuda
   * "Kanama 0" satiri gostermenin karsiligi yok.
   */
  effectStats?: Record<string, number>;
  setupPhase?: boolean;
  /** Su anki kurulum arasinin sayaci; kule iadesi bununla karsilastiriliyor. */
  setupSession?: number;
  setupReadyPlayerIds?: string[];
  /** Yaratici mod acik: istemci serbest kurulum panelini gosterir. */
  creative?: boolean;
  /** Odanin asamasi; dusman irki buradan cikiyor. */
  stage?: number;
  perf?: ServerPerfSnapshot;
};

export type WireGameSnapshot = Omit<GameSnapshot, "enemies" | "towers"> & {
  enemies: DynamicEnemySnapshot[];
  towers: DynamicTowerSnapshot[];
};

export {
  CLIENT_PROJECTILE_MAX_LIFETIME_MS,
  getLinearProjectilePosition,
  hydrateWireSnapshot,
  mergeDynamicEnemySnapshots,
  mergeDynamicTowerSnapshots,
  isClientProjectileExpired,
  pruneStaticSnapshotCache,
  SERVER_CLOCK_RESYNC_THRESHOLD_MS,
  SERVER_CLOCK_SMOOTHING,
  SnapshotPlaybackClock
} from "./snapshot/index.js";
export {
  DAMAGE_EVENT_NO_OWNER,
  DAMAGE_SIZE_BUCKET_RATIOS,
  FEEDBACK_KIND_RULES,
  FEEDBACK_LIMITS,
  FEEDBACK_MAX_PITCH_STEP,
  FeedbackGovernor,
  getDamageEventOwnerSlot,
  getDamageSizeBucket,
  getFeedbackPitchRatio,
  getFeedbackPriority
} from "./feedback/index.js";
export type {
  DamageSizeBucket,
  FeedbackChannel,
  FeedbackDecision,
  FeedbackInput,
  FeedbackKind,
  FeedbackKindRule,
  FeedbackPriority
} from "./feedback/index.js";
export {
  DEATH_BURST_SQUASH,
  DEATH_BURST_SQUASH_END,
  ENEMY_HIT_FLASH_GAP_MS,
  ENEMY_HIT_FLASH_MS,
  ENEMY_TRACE_CAPACITY,
  ENEMY_TRACE_TTL_MS,
  RecentEnemyTraces,
  getDeathBurstPose,
  getDeathBurstShape,
  getKillFeedbackWeight,
  isEnemyHitFlashActive,
  isHeavyEnemyType,
  pickAccentColor,
  shouldStartEnemyHitFlash,
  tintAccentColor
} from "./feedback/kill-confirm.js";
export type { DeathBurstPose, DeathBurstShape } from "./feedback/kill-confirm.js";
export {
  COIN_CARRY_MS,
  CountUpValue,
  GOLD_COUNT_UP_MS,
  GOLD_GAIN_LABEL_MS,
  UPGRADE_READY_FLASH_GAP_MS,
  UPGRADE_READY_MARKER_LIMIT,
  getLumpGoldGain,
  getUpgradeReadyTowerIds
} from "./feedback/resource-feel.js";
export type { UpgradeReadyTower, UpgradeReadyWallet } from "./feedback/resource-feel.js";
export {
  CARD_DEAL_STAGGER_MS,
  CARD_FLIP_FACE_UP_RATIO,
  CARD_FLIP_MS,
  CARD_PICKABLE_AFTER_MS,
  CARD_PICK_STAMP_MS,
  CARD_RARE_SHIMMER_MS,
  WAVE_CLEAR_LINE_STAGGER_MS,
  WAVE_CLEAR_STAMP_MS,
  WaveClearWatch,
  getCardDealTiming,
  getCardDraftTitle,
  getCardDraftWave,
  getCardRevealCues,
  getWaveClearStampText
} from "./feedback/wave-reward.js";
export type {
  CardDealTiming,
  CardRevealCue,
  WaveClearObservation,
  WaveClearStampLine,
  WaveClearStampText,
  WaveClearSummary
} from "./feedback/wave-reward.js";
export {
  COMBO_HEAT_MAX,
  COMBO_STALE_EVENT_MS,
  COMBO_VISIBLE_MIN,
  COMBO_WINDOW_SPAWN_INTERVALS,
  KillComboWatch,
  MULTI_KILL_LABEL_MS,
  MULTI_KILL_WINDOW_MS,
  STREAK_BANNER_HANDOFF_MS,
  STREAK_BANNER_MIN_VISIBLE_MS,
  STREAK_BANNER_QUEUE_LIMIT,
  STREAK_GLOW_FADE_IN_MS,
  STREAK_GLOW_FADE_OUT_MS,
  StreakBannerQueue,
  getComboHeat,
  getComboWindowMs,
  getKillStreakBuffRealMs,
  getKillStreakBuffText,
  getMultiKillLabel,
  getStreakBuffedTowerIds,
  getStreakGlowAlpha,
  getWaveSpawnIntervalRealMs,
  isStaleKillEvent
} from "./feedback/streak.js";
export type { ComboHudState, StreakBuffTower } from "./feedback/streak.js";
export {
  CONFIRMATION_INSTRUCTION_MS,
  CONFIRMATION_NOTICE_MS,
  countEquippableTowers,
  getInventoryEquipCue,
  getInventoryEquipRejectedCue,
  getShopPurchaseCue,
  getStructureRepairCue,
  getUltimateUpgradeCue,
  getWorkerDevelopmentCue
} from "./feedback/confirmations.js";
export type {
  ConfirmationPulseStyle,
  ConfirmationSfxKind,
  InventoryEquipRejectedMessage,
  InventoryEquippedMessage,
  ServerConfirmationCue,
  ShopPurchasedMessage,
  StructureRepairedMessage,
  UltimateUpgradedMessage,
  WorkerDevelopmentUnlockedMessage
} from "./feedback/confirmations.js";
export {
  FRESH_TOWER_SPAWN_CAPACITY,
  FRESH_TOWER_SPAWN_TTL_MS,
  FreshTowerSpawns,
  TIER_CEREMONY_MS,
  TIER_CEREMONY_SHARDS,
  TIER_COLUMN_HEIGHT_RATIO,
  TIER_SHARD_END_RADIUS,
  TIER_SHARD_START_RADIUS,
  TOWER_LANDING_DUST_MS,
  TOWER_LANDING_FROM_SCALE,
  TOWER_LANDING_MS,
  getTierCeremonyPose,
  getTierShardOrbit,
  getTowerLandingScale,
  getTowerLevelCeremony,
  getTowerLevelLabel
} from "./feedback/tower-ceremony.js";
export type { TierCeremonyPose, TowerLevelCeremony } from "./feedback/tower-ceremony.js";
export {
  ULTIMATE_CAST_ZOOM,
  ULTIMATE_CAST_ZOOM_MS,
  ULTIMATE_GOOD_AIM_RATIO,
  ULTIMATE_PERFECT_MIN_HITS,
  ULTIMATE_READY_CHARGE,
  ULTIMATE_READY_PULSE_MS,
  ULTIMATE_RESULT_LABELS,
  ULTIMATE_SHOCKWAVE_MS,
  ULTIMATE_STAMP_LAG_MS,
  ULTIMATE_STAMP_MS,
  UltimateReadyWatch,
  getBestUltimateColumnHits,
  getUltimateAimTier,
  getUltimateCastZoom,
  getUltimateColumnSpan,
  getUltimateResultKind,
  getUltimateShockwavePose,
  getUltimateStampText,
  getUltimateTeamChipText
} from "./feedback/ultimate.js";
export type {
  UltimateAimTier,
  UltimateCastMessage,
  UltimateResultKind,
  UltimateResultMessage,
  UltimateShockwavePose,
  UltimateStampText
} from "./feedback/ultimate.js";
export {
  SERVER_LINK_MATURITY_WAVES,
  SERVER_LINK_NOTICE_COOLDOWN_MS,
  SILENT_MODE_BURST_MULTIPLIER,
  SILENT_MODE_HASTE_GAME_MS,
  SILENT_MODE_PHASE_LABELS,
  SILENT_MODE_SILENCE_GAME_MS,
  formatSilentModeSeconds,
  getServerLinkJoinedText,
  getServerLinkMaturedText,
  getServerLinkMaturity,
  getSilentModeNoticeText,
  getSilentModePhase,
  getTurkishGenitive,
  toLocalSilentModeTimeline
} from "./feedback/team-signals.js";
export type {
  ServerLinkJoinedMessage,
  ServerLinkMaturedMessage,
  ServerLinkMaturityWave,
  SilentModeMessage,
  SilentModePhase,
  SilentModePhaseKind,
  SilentModeTimeline,
  TeamSignalText
} from "./feedback/team-signals.js";
export {
  COMBO_STAMP_GAP_MS,
  COMBO_STAMP_KINDS,
  COMBO_STAMP_LIFETIME_MS,
  COMBO_STAMP_MAX_LIVE,
  ComboStampGate,
  ComboStampThrottle,
  DEBUG_SWEEP_STAMP_MIN_KILLS,
  getComboStampText,
  getLuckyWindowSeconds,
  sanitizeComboStampMessage
} from "./feedback/combo-stamps.js";
export type { ComboStampKind, ComboStampMessage } from "./feedback/combo-stamps.js";
export {
  ASSIST_TOAST_PAIR_GAP_MS,
  AssistToastGate,
  KILL_ASSIST_KINDS,
  KILL_ASSIST_LIMIT,
  decodeKillAssists,
  encodeKillAssists,
  getKillAssistText,
  pickLocalKillAssist,
  resolveKillAssists
} from "./feedback/assists.js";
export type { KillAssist, KillAssistCandidate, KillAssistKind } from "./feedback/assists.js";
export {
  ROLE_TITLE_FLOORS,
  ROLE_TITLE_KILL_SHARE_FLOOR,
  ROLE_TITLE_LABELS,
  ROLE_TITLE_ORDER,
  getRoleTitleFloor,
  getWaveRoleFacts,
  pickRoleTitles
} from "./progress/role-titles.js";
export type { RoleTitleFacts, RoleTitleKind } from "./progress/role-titles.js";

export { WALL_EDGE_LENGTH, SHARED_STRUCTURE_IDS, REPAIR_DEPOT_TOWER_ID, isRepairDepotDefinition, repairDepotTower, countsAsTower, occupiesTowerSlot, getCharacterTowers, isSharedStructure, WALL_TOWER_ID, getStructureHealthMultiplier, isWallDefinition, wallTower, characters, towerCatalog, attachTowerEngine, deriveTowerResources, getTowerAttackRadius, getTowerModeDamageType, getTowerSlowDurationMs } from "./characters/index.js";
export {
  ONUR_JACKPOT_MIN_LUCK,
  ONUR_LUCKY_WINDOW_MS,
  ONUR_MISFORTUNE_MAX,
  getOnurMisfortuneContribution,
  resolveOnurGamblerShot
} from "./characters/onur/passive/index.js";
export { SpatialGrid, type SpatialPoint } from "./spatial/index.js";
export {
  STAGE_COUNT,
  WAVES_PER_STAGE,
  canRecordProgress,
  getHighestUnlockedStage,
  getStage,
  getStageDamageProfile,
  getStageRace,
  isStageUnlocked,
  shouldRecordStageClear,
  stageCatalog
} from "./stages/index.js";
export type { ProgressRecordSource, StageDefinition } from "./stages/index.js";
export {
  RUN_SUMMARY_VERSION,
  RUN_WAVE_HISTORY_LIMIT,
  RunLedger,
  createRunId,
  getKillStreakTierRank,
  getRunMapKey,
  isCleanWave
} from "./run-trace/index.js";
export type {
  MatchResultPayload,
  RunLeak,
  RunLedgerPlayer,
  RunLedgerTower,
  RunLevelMoment,
  RunPlayerSummary,
  RunStreakMoment,
  RunSummary,
  RunSummaryContext,
  RunTowerSummary,
  WaveRecord
} from "./run-trace/index.js";
export {
  AIR_CHECKPOINT_WAVES,
  EMPTY_STAGE_RECORD,
  MAX_RECORD_BOOK_ENTRIES,
  MAX_RECORD_PLAYER_COUNT,
  MAX_STAGE_STARS,
  RECORD_BOOK_VERSION,
  RUN_LOG_LIMIT,
  RUN_LOG_VERSION,
  THREE_STAR_CLEAN_WAVES,
  TWO_STAR_CLEAN_WAVES,
  appendRunLog,
  applyRunToBook,
  checkRunRecordable,
  computeStars,
  createRunLogEntry,
  describeRecordChange,
  formatStars,
  getAirCheckpoints,
  getNextStarCleanWaves,
  getRecordChangeParts,
  getRunReachedWave,
  getRunRecordKey,
  isRecordCharacterId,
  mergeRecord,
  nextGoal,
  parseRecordKey,
  recordKey,
  resolveRunCharacter,
  sanitizeRecordBook,
  sanitizeRunLog,
  sanitizeRunLogEntry,
  sanitizeStageRecord,
  serializeRecordBook,
  serializeRunLog
} from "./progress/records.js";
export type {
  AirCheckpoint,
  RecordBook,
  RecordImprovements,
  RecordKeyParts,
  RecordChangeParts,
  RecordMerge,
  RecordableRun,
  RunLogEntry,
  RunRecordGate,
  RunRecordLocal,
  RunRecordSkipReason,
  StageRecord,
  StageStars,
  StoredRecordBook,
  StoredRunLog
} from "./progress/records.js";
export {
  KILL_STREAK_TIER_LABELS,
  MatchResultLatch,
  QUICK_START_MAX_AGE_MS,
  QUICK_START_VERSION,
  RUN_REPORT_ACTIONABLE_AFTER_MS,
  RUN_REPORT_BADGE_DELAY_MS,
  RUN_ROLE_TITLES,
  buildPlayerLines,
  buildRunDeck,
  buildRunReportHero,
  buildRunReportView,
  buildWaveStrip,
  createQuickStartIntent,
  describeRunMvp,
  describeRunTotals,
  formatRunCount,
  getRunReportCues,
  getRunReportHeading,
  isFinaleClear,
  parseQuickStartIntent,
  pickBetterUltimate,
  pickRunMoment,
  planRunReportActions,
  resolveLocalRunSlot,
  resolveQuickStartStage,
  scoreUltimateMoment
} from "./progress/run-report.js";
export type {
  MatchResultStep,
  QuickStartIntent,
  QuickStartMode,
  RunDeck,
  RunDeckCard,
  RunMoment,
  RunMomentKind,
  RunPlayerLine,
  RunReportAction,
  RunReportActions,
  RunReportBadge,
  RunReportCue,
  RunReportHeading,
  RunReportHero,
  RunReportInput,
  RunReportTone,
  RunReportView,
  RunRoleTitleKind,
  RunUltimateMoment,
  RunWaveCell,
  RunWaveCellState
} from "./progress/run-report.js";
export {
  CLEAN_STREAK_MILESTONE_STEP,
  NEAR_MISS_HEALTH_RATIO,
  WaveReportTracker,
  buildWaveReportCard,
  formatSynergyShareText,
  isCleanStreakMilestone,
  pickWaveReportHighlight,
  pickWaveRoleTitle,
  sanitizeWaveRecord
} from "./progress/wave-report.js";
export type {
  WaveClearCapture,
  WaveReportCard,
  WaveReportCardInput,
  WaveReportChip,
  WaveReportChipKind,
  WaveReportHealth,
  WaveReportHighlight,
  WaveReportHighlightKind
} from "./progress/wave-report.js";
export {
  ARCHIVE_RARITY_LABELS,
  ARCHIVE_RUN_ID_LIMIT,
  ArchiveOfferLatch,
  CARD_ARCHIVE_VERSION,
  MAX_ARCHIVE_IDS,
  SHOP_CATEGORY_LABELS,
  buildCardArchiveView,
  createEmptyCardArchive,
  findUnseenArchiveIds,
  formatArchiveProgress,
  getArchivePercent,
  getArchiveProgress,
  getArchiveRun,
  markArchiveSeen,
  recordArchiveRun,
  sanitizeCardArchive,
  serializeCardArchive
} from "./progress/archive.js";
export type {
  ArchiveEntryView,
  ArchiveGroupView,
  ArchiveKind,
  ArchiveProgress,
  ArchiveRun,
  ArchiveSectionView,
  CardArchive,
  CardArchiveView,
  StoredCardArchive
} from "./progress/archive.js";
export type { CharacterDefinition, SkillDefinition, TowerDefinition } from "./characters/index.js";
export type {
  AmmoType,
  TowerAxis,
  TowerResourceProvider,
  TowerEngineConfig,
  TowerTargetingMode,
  TowerAttackShape,
  TowerStatusEffectType,
  TowerStatusEffectDefinition,
  TowerStackDefinition,
  TowerStackTrigger,
  TowerStackStat,
  TowerStackResetReason,
  TowerAuraDefinition,
  TowerAuraStat,
  TowerLevelScalingDefinition,
  TowerTriggerCondition,
  TowerTriggerDefinition,
  TowerTriggerEvent
} from "./characters/common/types.js";
export {
  TOWER_BASE_AMMO_COST,
  TOWER_BASE_ENERGY_COST,
  TOWER_BASE_DAMAGE_MULTIPLIER,
  TOWER_BASE_CRITICAL_CHANCE,
  TOWER_BASE_CRITICAL_DAMAGE_MULTIPLIER,
  FUEL_NORMALIZATION_INTERVAL_MS,
  FUEL_NORMALIZATION_EXPONENT,
  PASSIVE_TOWER_INTERVAL_THRESHOLD_MS,
  NON_FIRING_INTERVAL_MS,
  PASSIVE_AURA_TICK_INTERVAL_MS,
  AURA_REFRESH_DURATION_MULTIPLIER,
  ORBIT_BLADE_LENGTH_MAX_MULTIPLIER,
  ORBIT_CONTINUOUS_ENERGY_PER_SECOND,
  ORBIT_CONTINUOUS_HEAT_PER_SECOND,
  ENERGY_OUTAGE_TRACKING_DELAY_MS,
  ENERGY_OUTAGE_AURA_DELAY_MS,
  TOWER_OPERATING_ENERGY_BY_HIT_TYPE,
  getTowerFuelCostMultiplier,
  getTowerShotFuel,
  getTowerOperatingEnergyPerSecond,
  TOWER_HEAT_BY_HIT_TYPE,
  TOWER_HEAT_DAMAGE_TYPE_MULTIPLIER,
  TOWER_HEAT_BRAKE_TEMPERATURE,
  getTowerPerformanceHeatMultiplier,
  isTowerPerformanceIdle,
  getTowerPerformanceEnergyMultiplier,
  getTowerPerformanceFlameIntensity,
  calculateTowerShotHeat,
  getOrbitRotationSpeed,
  getOrbitBladeLength,
  calculateOrbitContinuousCosts,
  calculateTowerShotEnergy,
  calculateTowerAmmoCost,
  calculateTowerShotEnergyCost,
  getTowerShotFuelModifierMultiplier,
  calculateTowerOperatingEnergy,
  isOperationalTower,
  isPeriodicTowerAura,
  usesEffectInterval,
  calculateTowerEnergyPerSecond,
  shouldConsumeTowerOperatingEnergy,
  getTowerEnergyState,
  type TowerEnergyState,
  SLOW_STATUS_SPEED_MULTIPLIER,
  calculateTowerScaledBaseDamage,
  inferTowerAmmoType
} from "./tower-rules.js";
export {
  DEEP_FREEZE_COOLDOWN_MS,
  DEEP_FREEZE_DURATION_MS,
  DEEP_FREEZE_SPEED_THRESHOLD,
  STATUS_EFFECTS,
  applyTowerStatusEffect,
  getActiveStatusMagnitude,
  getTowerStatusOutcomes,
  isStatusEffectActive
} from "./statuses/index.js";
export type { ApplyStatusEffectOptions, StatusEffectRuntimeState } from "./statuses/index.js";
export { applyTowerStack, getTowerStackMultiplier, resetTowerStack } from "./stacks/index.js";
export type { ApplyTowerStackOptions, TowerStackRuntimeState } from "./stacks/index.js";
export {
  MAX_TARGETED_CARDS_PER_TOWER,
  DEFAULT_MODIFIER_CAPS,
  appendLegacyMultiplier,
  canAcceptTargetedCard,
  getModifierAdd,
  getModifierMultiplier,
  resolveModifierBreakdown
} from "./modifiers/index.js";
export type { Modifier, ModifierBreakdown, ModifierCaps, ModifierScope, ModifierStat, RunModifiers } from "./modifiers/index.js";
export {
  ALL_UNLOCKS,
  BACKUP_LINE_DURATION_MS,
  CARD_RARITY_WEIGHT,
  MAX_ENCODABLE_UNLOCKS,
  decodeUnlocks,
  encodeUnlocks,
  hasUnlockBit,
  COLD_CRIT_CHANCE,
  COLD_CRIT_TEMPERATURE,
  RUN_HOT_DAMAGE_PER_DEGREE,
  RUN_HOT_HEAT_LOCK_THRESHOLD,
  cardCatalog,
  canTowerHoldTargetedCard,
  cardAppliesToTower,
  cardReachesTower,
  drawCards,
  getCardDefinition,
  getCardRarity,
  getCardTowerReach,
  ownedCardAppliesToTower
} from "./cards/index.js";
export type { CardDefinition, CardRarity, CardScope, CardTowerProfile, CardTowerReach, Unlock } from "./cards/index.js";
export { NEUTRAL_ATTACK_MULTIPLIERS, isEmptyTowerGrant, resolveTowerAttackMultipliers, resolveTowerEngine } from "./grants/index.js";
export type { TowerAttackGrant, TowerAttackMultipliers, TowerGrant } from "./grants/index.js";
export {
  SHOP_OFFER_COUNT,
  SHOP_REROLL_BASE_PRICE,
  SHOP_REROLL_PRICE_STEP,
  DEFAULT_SHOP_PRICE_GROWTH,
  GLOBAL_SHOP_ITEM_IDS,
  MAX_EQUIPPED_SHOP_ITEMS_PER_TOWER,
  canEquipShopItem,
  isGlobalShopItem,
  shopItemAppliesToTower,
  getShopItemCount,
  getShopItemPrice,
  getShopRerollPrice,
  isShopItemAvailable,
  getShopItem,
  drawShopOffers,
  shopCatalog
} from "./shop/index.js";
export type { EquipShopItemFailure, ShopItem, ShopItemCategory, ShopItemTarget, ShopState, ShopUnlock } from "./shop/index.js";
export { applyEnemyMark, getMarkDamageMultiplier, isMarkOnlyChoice } from "./marks/index.js";
export type { ActiveMark } from "./marks/index.js";
export {
  TOWER_TURN_RATE_RADIANS_PER_SECOND,
  TOWER_FIRE_ALIGNMENT_TOLERANCE_RADIANS,
  TOWER_FIRE_ALIGNMENT_MIN_RADIANS,
  getTowerFireAlignmentTolerance,
  shouldRetainAimTargetLock,
  shortestAngleDelta,
  rotateTowerTowards,
  isTowerAligned
} from "./aiming/index.js";
export { LINEAR_BALLISTIC_HIT_TYPES, LINEAR_BALLISTIC_SPEED_MULTIPLIER, LINEAR_BALLISTIC_COLLISION_RADIUS, getBallisticMovementSpeed, getBallisticCollisionRadius, usesLinearBallistics, findFirstLinearCollision } from "./ballistics/index.js";
export type { BallisticCollisionBody } from "./ballistics/index.js";
export {
  RESOURCE_EXTRACTION_DURATION_MS,
  LOGISTICS_WORKER_CAPACITY,
  ENERGY_LOGISTICS_WORKER_CAPACITY,
  AMMO_LOGISTICS_WORKER_CAPACITY,
  AMMO_COLLECTOR_WORKER_CAPACITY,
  RESOURCE_PROVIDER_INITIAL_STOCK,
  AMMO_FACTORY_INITIAL_ENERGY,
  HIRABLE_WORKER_ROLES,
  WORKER_ROLE_LABELS,
  WORKER_ROLE_DESCRIPTIONS,
  WORKER_HIRE_BASE_COST,
  ADVANCED_WORKER_COST_MULTIPLIER,
  ADVANCED_WORKER_MULTIPLIER,
  WORKER_HIRE_COST_GROWTH,
  WORKER_MAX_HP,
  WORKER_REPAIR_PER_SECOND,
  WORKER_RESPAWN_MS,
  advanceResourceExtraction,
  canHireWorker,
  getWorkerHireCost,
  getWorkerHireCostWithModifiers,
  isHirableWorkerRole
} from "./logistics/index.js";
export type { HirableWorkerRole, HiredWorker } from "./logistics/index.js";
export {
  ENERGY_WORKER_SKILL_TIERS,
  CRYSTAL_WORKER_SKILL_TIERS,
  AMMO_COLLECTOR_WORKER_SKILL_TIERS,
  AMMO_TRANSPORT_WORKER_SKILL_TIERS,
  REPAIR_WORKER_SKILL_TIERS,
  WORKER_SKILL_TIERS,
  WORKER_SPECIALIZATION_CHOICES,
  WORKER_DEVELOPMENT_XP_COSTS,
  WORKER_DEVELOPMENT_CELLS,
  getWorkerSkillTiers,
  isWorkerSkillId,
  isWorkerSkillForRole,
  isEnergyWorkerSkillId,
  getWorkerSkill,
  getEnergyWorkerSkill
} from "./worker-skills.js";
export type {
  WorkerSkillId,
  EnergyWorkerSkillId,
  CrystalWorkerSkillId,
  AmmoCollectorWorkerSkillId,
  AmmoTransportWorkerSkillId,
  RepairWorkerSkillId,
  WorkerSkillChoice,
  WorkerSkillPair,
  WorkerDevelopmentTree,
  WorkerDevelopmentCell
} from "./worker-skills.js";
export {
  ZEYNEP_BURN_SYNTHESIS_RANGE_MULTIPLIER,
  ZEYNEP_RAY_SYNTHESIS_DAMAGE_MULTIPLIER,
  ZEYNEP_RAY_SYNTHESIS_LENGTH_CELLS,
  ULTIMATE_POWER_MAX_LEVEL,
  ULTIMATE_POWER_BASE_COST,
  ULTIMATE_POWER_COST_GROWTH,
  ULTIMATE_POWER_DAMAGE_STEP,
  getUltimatePowerMultiplier,
  getUltimatePowerUpgradeCost,
  canUpgradeUltimatePower,
  ATAKAN_ULTIMATE_DRONE_DAMAGE,
  ZEYNEP_COLUMN_ULTIMATE_DAMAGE,
  ZEYNEP_COLUMN_ULTIMATE_SLOW_MS,
  ZEYNEP_COLUMN_ULTIMATE_BEAM_MS,
  FINAL_WAVE,
  BASE_WAVE_ENEMY_COUNT,
  ENEMY_COUNT_WAVE_MULTIPLIER,
  ENEMY_HP_WAVE_MULTIPLIER,
  ENEMY_HP_BALANCE_MULTIPLIER,
  EARLY_WAVE_HP_RATIO,
  EARLY_WAVE_RAMP_EXPONENT,
  EARLY_WAVE_CONVERGENCE_WAVE,
  PLAYER_POWER_COMPENSATION,
  ENEMY_EXP_MULTIPLIER,
  ENEMY_REWARD_MULTIPLIER,
  REFERENCE_STRUCTURE_BREAK_DPS,
  ATAKAN_ISOLATION_MULTIPLIER,
  SIEGE_STRUCTURE_DAMAGE_MULTIPLIER,
  SIEGE_FIRST_WAVE,
  SIEGE_SPAWN_RATIO,
  getStructureRepairCost,
  STRUCTURE_REPAIR_COST_RATIO,
  STRUCTURE_BREACH_HEALTH_RATIO,
  getWaveEnemyCount,
  getArenaWaveEnemyCount,
  getWaveHpMultiplier,
  getWaveEnemyMaxHp,
  getWaveCompletionGold,
  getWaveAirMode,
  isFlyingWaveSpawn,
  HEAVY_WAVE_HP_STEP,
  getWaveHpStep,
  getHeavyWaveHpStep,
  formatWaveHpStep,
  ENEMY_MIX_SHOOTER_FROM,
  ENEMY_MIX_RUNNER_FROM,
  ENEMY_MIX_BRUTE_FROM,
  pickWaveEnemyType,
  getWaveEnemyTypeWeights,
  AIR_ENEMY_HEALTH_MULTIPLIER,
  ENEMY_LEAK_DAMAGE,
  HEAVY_ENEMY_LEAK_DAMAGE,
  getEnemyLeakDamage,
  PLAYER_TOWER_LIMIT,
  WAVE_SPAWN_INTERVAL_BASE_MS,
  WAVE_SPAWN_INTERVAL_STEP_MS,
  WAVE_SPAWN_INTERVAL_MIN_MS,
  getWaveSpawnIntervalMs,
  KILL_STREAK_RULES,
  KILL_STREAK_BUFF_DURATION_MS,
  KILL_STREAK_RETRIGGER_LOCK_MS,
  getKillStreakRule
} from "./balance/index.js";
export type { KillStreakRule, KillStreakTier, WaveAirMode } from "./balance/index.js";
export {
  CHAMPION_FIRST_WAVE,
  CHAMPION_HP_MULTIPLE,
  CHAMPION_MIN_REPLACED,
  CHAMPION_MAX_SHARE,
  CHAMPION_TYPE_ROTATION,
  CHAMPION_WAVE_POSITION,
  CHAMPION_LEAD_SHARE,
  CHAMPION_SPRITE_SCALE,
  CHAMPION_LABEL,
  getEnemyKillGold,
  getEnemyZeynepReputationGain,
  getEnemySpawnHealth,
  getEffectiveHp,
  getWaveSlotExpectation,
  hasWaveChampion,
  getWaveChampionType,
  getWaveChampionPlan,
  getWaveSpawnCount,
  splitChampionLeakDamage,
  sanitizeChampionDownMessage,
  formatChampionSeconds,
  getChampionDownText
} from "./balance/champion.js";
export type { WaveChampionPlan, WaveChampionOptions, ChampionDownMessage } from "./balance/champion.js";
export {
  GAME_SPEED_MULTIPLIER,
  GLOBAL_TOWER_RANGE_MULTIPLIER,
  TOWER_RANGE_PER_LEVEL,
  TOWER_MIN_FIRE_INTERVAL_MS,
  TOWER_TIER_2_LEVEL,
  TOWER_TIER_3_LEVEL,
  ZEYNEP_SHOWCASE_BASE_LENGTH,
  ZEYNEP_SHOWCASE_LENGTH_PER_LEVEL,
  getTowerTier,
  getDebugLaserDamageMultiplier,
  getDebugLaserFireInterval,
  getKinFireInterval,
  getObsessionDamageMultiplier,
  getTowerBaseLevelDamage,
  getTowerBaseLevelFireIntervalMs,
  getTowerBaseLevelMinimumRange,
  getTowerBaseLevelRange,
  getTowerDisplayStats,
  getTowerImpactDamageCompensation,
  getTowerLevelIntervalMultiplier,
  getTowerRealDps,
  getTowerRealFireIntervalMs,
  getTrackerFireInterval,
  getUcubeGrowthDamageMultiplier,
  getZeynepHizaDamageCompensation,
  getZeynepHizaFireInterval,
  getZeynepShowcaseBeamLength,
  hasGlobalTowerRange
} from "./tower-stats/index.js";
export type { TowerDisplayStats, TowerTier } from "./tower-stats/index.js";
export {
  SYMPATHY_BLEED_DURATION_MS,
  SYMPATHY_BLEED_MAX_HEALTH_RATIO_PER_SECOND,
  SYMPATHY_DURATION_MS,
  SYMPATHY_LINK_HALF_WIDTH,
  SYMPATHY_SLOW_MULTIPLIER,
  buildSympathyLinks,
  getDistanceToSegment,
  isTouchingSympathyLink,
  selectSympathyContacts
} from "./sympathy/index.js";
export type { SympathyContactTarget, SympathyLink, SympathyTower } from "./sympathy/index.js";
export { dispatchTowerTriggers } from "./triggers/index.js";
export type { DispatchTowerTriggerOptions, TowerTriggerDispatchResult, TriggerCooldowns } from "./triggers/index.js";
export { applyTowerAuraModifier, evaluateTowerAuras, getTowerAuraLevelMultiplier, isPointInsideTowerAura } from "./auras/index.js";
export type { TowerAuraModifiers, TowerAuraSource, TowerAuraTarget } from "./auras/index.js";
export { isTargetInsideAttackShape, selectAttackShapeTargets } from "./attacks/index.js";
export type { AttackShapeQuery, AttackShapeTarget } from "./attacks/index.js";
export { getOrbitRotationSpeedForInterval, getOrbitTargetHitCooldownMs, selectOrbitSweepContacts, selectOrbitSweepTargets } from "./attacks/orbit.js";
export type { OrbitSweepContact, OrbitSweepQuery } from "./attacks/orbit.js";
export { selectTowerTarget } from "./targeting/index.js";
export type { TowerTargetCandidate, TowerTargetingQuery } from "./targeting/index.js";
export { getEdgeSegments, getEdgeSegmentsCenter, isEdgeSegmentInsideBoard, getPlacementFootprint, hasOpenGridRoute, validateEdgePlacement, validateTowerPlacement } from "./placement/index.js";
export type { EdgeOrientation, EdgeSegment, PlacementBoard, PlacementCell, PlacementFailureReason, PlacementValidation } from "./placement/index.js";
export {
  MAP_GRID_COLS,
  MAP_GRID_ROWS,
  MAP_STORAGE_KEY,
  DEFAULT_MAP_SCALE,
  MAX_MAP_SCALE,
  createDefaultEditableMap,
  createOpenArenaMap,
  getMapGridSize,
  getMapMetrics,
  getMapOrigin,
  getMapWorldBounds,
  getMapScale,
  findPathToNearestNexus,
  buildRuntimePaths,
  getMapPoints,
  getPointAlongRuntimePath,
  getTile,
  gridToWorld,
  isInsideMap,
  isWalkableTile,
  normalizeMapData,
  pathToWorldPoints,
  scaleEditableMap,
  setTile,
  worldToGrid,
  type EditableMapData,
  type GridPoint,
  type MapScale,
  type MapTileKind,
  type RuntimePath,
  type WorldPoint
} from "./map.js";

/**
 * Towers whose muzzle should turn toward what they are shooting.
 *
 * Kept as an explicit list rather than inferred from hitType: Kin Kulesi is an
 * aura tower but fires a directional cone, while Sunucu throws projectiles yet
 * is a global rack with no muzzle. Auras, passives and area curses never aim.
 *
 * Taht Muhru was excluded while it was a socketed seal, but its art now carries
 * an explicit barrel on the right, and a muzzle that never turns reads worse
 * than one that does.
 */
const AIMING_TOWER_IDS = new Set<string>([
  "zeynep-1",
  "zeynep-2",
  "zeynep-3",
  "zeynep-6",
  "warrior-1",
  "warrior-4",
  "warrior-5",
  "warrior-6",
  "archer-1",
  "archer-2",
  "archer-4",
  "archer-5"
]);

export function towerAims(definitionId: string) {
  return AIMING_TOWER_IDS.has(definitionId);
}

/**
 * How many grid cells a tower covers per side. Saray Arsivi is a 2x2 vault, so
 * it snaps to a cell corner and occupies four tiles. Abarti is not a tile tower
 * at all and goes through the edge placement path instead.
 */
export function getTowerGridSpan(definitionId: string) {
  return definitionId === "zeynep-7" ? 2 : 1;
}

/**
 * Painted tower art reserves a margin around the disc so muzzles and spikes can
 * overhang without making the disc itself smaller. The disc is this fraction of
 * the frame, which lets the renderer size a sprite so its disc lands exactly on
 * the tile regardless of how much the art sticks out.
 */
export const TOWER_ART_DISC_RATIO = 0.7;

export const upgradeCosts: Record<UpgradeId, number> = {
  damage: 35,
  fireRate: 40,
  projectileSpeed: 30,
  heal: 45
};

const TOWER_BUILD_COST_MULTIPLIER = 2;

export function getTowerBuildCost(towerCost: number) {
  return Math.round(towerCost * TOWER_BUILD_COST_MULTIPLIER);
}

export function getTowerLevelExpCost(towerCost: number, currentLevel: number) {
  if (currentLevel < 1 || currentLevel >= 10) {
    return 0;
  }
  const safeLevel = Math.round(currentLevel);
  return getTowerBuildCost(towerCost) * safeLevel;
}

/**
 * Seviye atlamanin altin bedeli.
 *
 * Seviyelerin cogu yalnizca deneyim istiyor; altin iki esikte devreye giriyor.
 * Bu iki esik artik gercek birer karar noktasi: besinci seviye kulenin insa
 * bedelinin on kati, onuncu seviye kirk kati. Yani bir kuleyi sonuna kadar
 * goturmek, yenilerini kurmaktan cok daha pahali -- derinlesmek ile yayilmak
 * arasindaki secim buradan cikiyor.
 */
export function getTowerLevelGoldCost(towerCost: number, currentLevel: number) {
  const nextLevel = Math.round(currentLevel) + 1;
  if (nextLevel === 5) return getTowerBuildCost(towerCost) * 10;
  if (nextLevel === 10) return getTowerBuildCost(towerCost) * 40;
  return 0;
}

/**
 * Kule satisindan donecek altin ve bunun bir geri alim olup olmadigi.
 *
 * Satis kuralinin tamami burada: kurulum arasi geri alimi, iade carpani,
 * ve geri alimin carpandan muaf olusu. Once sunucu kendi hesabini yapiyor,
 * istemci de kendi kopyasini tasiyordu; ayni kural iki yerde durdugu
 * surece bir gun ayrisir, ve ayristigini kimse fark etmez cunku ikisi de
 * makul sayilar uretir.
 */
export function resolveTowerRefund(
  tower: {
    cost: number;
    level: number;
    definitionId?: string;
    buildGold?: number;
    builtInSetupSession?: number;
  },
  context: { setupPhase?: boolean; setupSession?: number; refundMultiplier?: number }
): { amount: number; undoable: boolean } {
  if (canRefundTowerPurchase(tower, context.setupPhase, context.setupSession)) {
    // Geri alima carpan **islemez**: isleseydi "Hurda Pazari" ile kur-sat
    // dongusu bedelin uzerine cikardi.
    return { amount: Math.max(0, Math.round(tower.buildGold ?? 0)), undoable: true };
  }
  return {
    amount: Math.floor(
      getTowerSellRefund(tower.cost, tower.level, tower.definitionId)
        * Math.max(0, context.refundMultiplier ?? 1)
    ),
    undoable: false
  };
}

export function getEnemyExp(wave: number, enemyType: EnemyType, movementKind: MovementKind = "ground") {
  const typeMultiplier: Record<EnemyType, number> = {
    grunt: 1,
    runner: 1,
    shooter: 1.6,
    brute: 2.5,
    siege: 1.4
  };
  const flyingMultiplier = movementKind === "air" ? 0.7 : 1;
  const base = (4 + Math.max(0, Math.round(wave))) * typeMultiplier[enemyType] * flyingMultiplier;
  return Math.round(base * ENEMY_EXP_MULTIPLIER * 100) / 100;
}

export function getTowerTotalInvestedGold(towerCost: number, currentLevel: number, towerId?: string) {
  void currentLevel;
  void towerId;
  return getTowerBuildCost(towerCost);
}

export function getTowerSellRefund(towerCost: number, currentLevel: number, towerId?: string) {
  return Math.floor(getTowerTotalInvestedGold(towerCost, currentLevel, towerId) / 2);
}

/**
 * Kule alimi geri alinabilir mi.
 *
 * Dalga arasinda kurulan kule, **ayni ara icinde** tam bedeliyle geri
 * verilebiliyor. Kurulum bir plan kurma ani; yanlis kareye birakilan bir
 * kulenin bedeli yarim altin olmamali. Dalga basladigi anda karar
 * baglaniyor: artik satis, alimin geri alinmasi degil, kayipla elden
 * cikarma.
 *
 * Onceki aradan kalan kule muaf: sayac esitligi tam da bunu tutuyor.
 */
/**
 * Kartlar ve esyalar isledikten sonra onarim bedeli.
 *
 * Iki taraf da bunu cagiriyor: sunucu tahsil ederken, arayuz dugmeye
 * yazarken. Ayri formuller yazmak, gorulen sayiyla odenen sayinin
 * ayrilmasi demekti -- gorulmeyen bir indirim oyuncu icin yoktur.
 */
export function getStructureRepairCostWithModifiers(
  buildCost: number,
  missingHealthRatio: number,
  costMultiplier = 1
) {
  return Math.ceil(getStructureRepairCost(buildCost, missingHealthRatio) * Math.max(0, costMultiplier));
}

export function canRefundTowerPurchase(
  tower: { builtInSetupSession?: number },
  setupPhase: boolean | undefined,
  setupSession: number | undefined
) {
  return Boolean(setupPhase)
    && tower.builtInSetupSession !== undefined
    && tower.builtInSetupSession === setupSession;
}

export {
  BLIND_DIRECTIONS,

  BLIND_PREFERRED_HEADING,
  createBlindNavigatorState,
  stepBlindNavigator
} from "./navigation/index.js";
export type { BlindHand, BlindHeading, BlindNavigatorState, BlindStepResult } from "./navigation/index.js";
export * from "./defense-insights.js";
export * from "./worker-skills.js";
export * from "./synergy/index.js";
