import Phaser from "phaser";
import { getDeathBurstShape, towerCatalog, type BeamSnapshot, type ProjectileSnapshot } from "@karayel/shared";
import { configureHiDpiCamera } from "../rendering";
import { AttackVfx } from "../vfx/attack-vfx";
import { AtakanSignatureVfx, type SignatureFrame, type SignatureTower } from "../vfx/atakan-signatures";
import { BeamRenderer } from "../vfx/beam-renderer";
import { CombatVfx, getDeathMaterial, readTextureAccent, type DeathMaterial } from "../vfx/combat-vfx";
import { FlashPool, GlowStampPool } from "../vfx/flash-pool";
import { toTier } from "../vfx/kit";
import { VfxLod } from "../vfx/lod";
import {
  GALLERY_COURT_CELL,
  getGalleryDeathTexture,
  ScenarioCourtFeed,
  VfxScenario,
  createStressScenario,
  getCourtLanceMode,
  getGalleryRows,
  getScenarioColor,
  getScenarioIntervalMs,
  walkerPosition,
  type GalleryDeathCell,
  type GalleryRow,
  type ScenarioTower,
  type ScenarioWalker
} from "../vfx/vfx-scenario";
import { getVfxProfile, getVfxTier, type VfxCourtMechanic, type VfxDelivery, type VfxMechanic } from "../vfx/vfx-profiles";
import { ZeynepSignatureVfx, type CourtFrame } from "../vfx/zeynep-signatures";
import { FeedbackDirector } from "../feedback-director";
import { BeamHitTracker, HIT_VOICE_IDS, HIT_VOICE_LABELS, resolveHitVoice, type HitVoiceId } from "../hit-sounds";
import { GALLERY_KILL_CUES } from "../sfx-samples";
import { COUNTER_SURGE_KIND_CODES, COUNTER_SURGE_TRAVEL_CODES, type CounterSurgeKind, type CounterSurgeSnapshot, type CounterSurgeTravel } from "@karayel/shared";
import { AegisImpacts, COUNTER_SURGE_STYLES, createCounterSurgeBand, drawCounterSurge, getCounterSurgeBand } from "../vfx/counter-surge";
import { RACE_GALLERY_COLS, RACE_GALLERY_ROWS, RaceGalleryPage } from "../vfx/race-gallery";
import { LegendaryGalleryPage } from "../vfx/legendary-gallery";
import { MatchEndStage } from "../vfx/match-end-stage";
import { MATCH_END_COLD, MATCH_END_HUSK_TINT, MATCH_END_POWERED_DOWN_TINT } from "../vfx/match-end-vfx";
import { ATLAS_FINAL_LINE_SECONDS, type MatchEndKind, type MatchEndStructure } from "../match-end-sequence";

/**
 * VFX galerisi (`?vfx-gallery`): her saldiran kule, sv 1 / 5 / 10, yan yana.
 *
 * Sunucu yok; `VfxScenario` sunucunun gonderdigi mermi, isin ve olaylarin
 * aynisini deterministik olarak uretiyor ve oyunun kendi cizicilerine
 * (AttackVfx, BeamRenderer, FlashPool, GlowStampPool) besliyor -- GameScene'in
 * kullandigi siniflar, ayni katman derinlikleriyle. Lazer burada da kitin
 * ustunde ve oyundakiyle ayni.
 *
 * Kontroller (alt cubuk): sayfa, 0.25x yavas cekim, duraklat, takim arkadasi
 * (%70), yuk testi (20 kademe-3 kule, 60 dusman ve olcum katmani). Saat
 * sanal: yavas cekim ve duraklatma butun efektleri birlikte yavaslatiyor.
 * 375 px'lik telefonda satirlar sayfalara bolunuyor.
 *
 * Atakan satirlari kulenin durumunu da gosteriyor (AtakanSignatureVfx, oyunla
 * ayni sinif): Takipci isareti yuruyucunun uzerinde, Sunucu hucredeki yan
 * kuleye bagli, Izolasyon 3 sn yalniz (alan) 3 sn komsulu (atis ve ihlal),
 * Obsesyon yigini 13 atista 0 -> 10 yukselip hedef degisince kopuyor, Ucube
 * yigini sutuna gore 10 / 15 / 20 tavanina yukselip asiri isiniyor.
 *
 * Zeynep satirlari mekanigi gosteren sahnelerde (ZeynepSignatureVfx ve
 * ZeynepReceiptTracker, oyunla ayni siniflar): Hiza sira halindeki iki
 * dusmani deliyor, Gosteri hattaki uc dusmana spot isigi, Taht'in mizraklari
 * dizilim kipleriyle (cift Hiza, Kin, kopya) ve bozulan dizilimle, ayna isini
 * hucrenin kenarindan sekiyor, yanik izi yanip kapaniyor, Kin gosterisi
 * gercek 60 derecede, Kin dalgasi yakin/orta/uzak dusmani 1/2/3 seritle
 * damgaliyor, Abarti rayindan gecen atis nabiz atiyor.
 *
 * Olum satirlari (son sayfalar): her irk -- malzemesi: metal, kitin,
 * kristal, tas, kul -- siradan, kosucu ve agir dusmanla; mekanin ek satiri
 * nisanci, kusatma ve ucan dusman. Dusman her 2.2 sn'de olup yeniden
 * doguyor; olum oyundaki `CombatVfx` ile (ayni yer izi yuzeyi ve LOD).
 *
 * Vurus sesleri: ilk dokunus ses baglamini aciyor, sonra her temas oyundaki
 * gibi caliyor (ayni yonetmen, ayni butce). Bir hucreye dokunmak yalnizca o
 * kuleyi (o seviyede) dinletiyor, ayni hucreye ikinci dokunus herkesi geri
 * aciyor. "Ses" dugmesi galeride sesi kapatiyor; secici ve Sv 1 / 5 / 10
 * dugmeleri her vurus sesini -- hicbir kulenin kullanmadigi Bulasma dahil --
 * dogrudan caliyor. Seciciden oldurme portal sesleri de (kucuk, hava, agir,
 * sampiyon; her basista A ve D sirayla) dinlenebiliyor; onlarda seviye yok,
 * uc dugme de ayni boyu caliyor.
 *
 * "Karşı atak" kipi: alti karsi atak cesidi ve Metal Kalkan kesigi, sayfa
 * basina bir cesit, 12x18'lik kucuk bir haritada (oyundaki cizici, oyundaki
 * katman derinlikleri). Uyari ve gecis galeride kisaltilmis bir dongude;
 * yapilar on cizgi gecince cesidin renginde flaslaniyor, siperde atislar
 * on cizgide duruyor.
 *
 * "Irklar" kipi: alti irk mekanigi (Taslasma, kalkan atici, kazici, ruh
 * cekici, faz, katlanma), sayfa basina bir mekanik, ayni kucuk haritada ve
 * oyundaki cizicilerle (race-traits).
 *
 * "Maç sonu" kipi: yenilgi ve zafer sahneleri (match-end-stage, oyundaki
 * sinif) ornek bir haritada; sayfa 1 yenilgi, sayfa 2 zafer. ATLAS satirinin
 * suresi manifestteki bir satirdan (death-01, ending-03). Sahne bitince
 * raporun yeri kisa bir yaziyla isaretleniyor, sonra sahne yeniden oynuyor.
 * "Geç" cipi ve dokunus oyundaki gibi.
 */
const COLUMN_LEVELS = [1, 5, 10] as const;
/** Isinla vuran teslimler: sesleri isindan (oyundaki gibi), temas olayindan degil. */
const BEAM_SOUNDED_DELIVERIES: ReadonlySet<VfxDelivery> = new Set<VfxDelivery>(["laser", "showcase", "curse", "kin", "underworld"]);
const COLUMN_WIDTH = 130;
const HEADER = 40;
const FOOTER = 64;
const ROW_HEIGHT = 84;
/**
 * Galerideki dusmanin capi: oyundaki grunt'a (34 birim) yakin, hucreye sigan.
 * Takipci nisangahi ve kertikleri oyundaki boyda okunsun.
 */
const GALLERY_ENEMY_SIZE = 30;
/** Galerinin harita karesi: Izolasyon karantinasi ve Ucube gostergesi bununla. */
const GALLERY_CELL = 22;
/** Olum satirinin dongusu: dusman bu kadar yasiyor, sonra olup yeniden doguyor. */
const DEATH_CYCLE_MS = 2200;
const DEATH_AT_MS = 1300;
/** Galerinin dusman boylari (oyundaki oranlarla, grunt 30). */
const GALLERY_DEATH_SIZE: Record<GalleryDeathCell["type"], number> = { grunt: 30, runner: 35, shooter: 33, brute: 38, siege: 34 };
/** Takim arkadasinin olumu (GameScene `TEAMMATE_DEATH_BURST_INTENSITY`). */
const GALLERY_TEAMMATE_DEATH = 0.5;
/** Malzemenin satir etiketindeki tarifi. */
const DEATH_MATERIAL_LABELS: Record<DeathMaterial, string> = {
  metal: "metal: kıvılcım, çelik kırıntı, duman, yanık",
  chitin: "kitin: koyu parça, sıvı lekesi",
  crystal: "kristal: koyu kıymık, çatırtı",
  stone: "taş: parça, toz",
  ash: "kül: kor, koyu duman, yanık"
};

type DeathCellState = {
  sprite: Phaser.GameObjects.Image;
  texture: string;
  x: number;
  y: number;
  size: number;
  heavy: boolean;
  air: boolean;
  shards: number;
  durationMs: number;
  phase: number;
  accent: number;
};

/** Zeynep imzasinin satir etiketindeki adi. */
const COURT_LABELS: Record<VfxCourtMechanic, string> = {
  "pierce-line": "delme çizgisi",
  spotlight: "hat işareti",
  "formation-seal": "dizilim",
  brand: "Kin damgası",
  "crossing-pulse": "Abartı geçişi"
};
/** Taht mizrak sahnesinin kip yazisi. */
const LANCE_MODE_LABELS = { dual: "kip: çift Hiza", kin: "kip: Hiza + Kin", copy: "kip: kopya", broken: "dizilim bozuk" } as const;

/** Imzanin satir etiketindeki adi. */
const MECHANIC_LABELS: Record<VfxMechanic, string> = {
  "mark-reticle": "işaret nişangâhı",
  "uplink-column": "bağ + sütun",
  containment: "kapatma alanı",
  tether: "saplantı ipi",
  "stack-gauge": "yığın göstergesi"
};

type Mode = "grid" | "stress" | "surge" | "races" | "ending" | "legendary";

/** Karsi atak sayfalari: cesit, yon, serit ve galerideki dongu (ms). */
type SurgePage = { kind: CounterSurgeKind; travel: CounterSurgeTravel; lane: number; width: number; crossMs: number; label: string; cut?: boolean };
const SURGE_PAGES: readonly SurgePage[] = [
  { kind: "band", travel: "down", lane: 4, width: 3, crossMs: 6000, label: "band · plazma şeridi (32 sn)" },
  { kind: "lance", travel: "down", lane: 7, width: 1, crossMs: 2200, label: "lance · mızrak (9 sn)" },
  { kind: "wall", travel: "down", lane: 3, width: 6, crossMs: 11000, label: "wall · perde (60 sn)" },
  { kind: "sweep", travel: "left", lane: 7, width: 3, crossMs: 5200, label: "sweep · yandan süpürme (26 sn)" },
  { kind: "slash", travel: "downRight", lane: 0, width: 3, crossMs: 6000, label: "slash · çapraz kesme (30 sn)" },
  { kind: "aegis", travel: "down", lane: 3, width: 6, crossMs: 9000, label: "aegis · siper dalgası (grunt hızı)" },
  { kind: "sweep", travel: "right", lane: 7, width: 3, crossMs: 5200, label: "Metal Kalkan kesiği · süpürme", cut: true }
];
const SURGE_WARN_MS = 1600;
const SURGE_HOLD_MS = 700;
const SURGE_COLS = 12;
const SURGE_ROWS = 18;
/** Galeri haritasinin yapilari (sutun, satir). */
const SURGE_TOWERS: ReadonlyArray<readonly [number, number]> = [[4, 3], [5, 6], [8, 4], [2, 9], [6, 10], [9, 12], [3, 14], [7, 15], [10, 8], [1, 5], [5, 13], [8, 2]];
/** Mac sonu sayfasi: kuleler (sutun, satir), duvarlar (sutun, satir, yatay), dusmanlar ve nexus. */
const ENDING_TOWERS: ReadonlyArray<readonly [number, number]> = [[4, 3], [5, 6], [8, 4], [2, 9], [6, 10], [9, 12], [3, 14], [7, 14], [10, 8], [1, 5], [5, 12], [8, 2], [2, 12], [9, 15], [4, 8], [7, 7], [10, 3], [1, 15]];
const ENDING_WALLS: ReadonlyArray<readonly [number, number, boolean]> = [[3, 11, true], [4, 11, true], [7, 11, true], [8, 11, true], [5, 5, false], [6, 5, false]];
const ENDING_ENEMIES: ReadonlyArray<readonly [number, number]> = [[5.5, 1.5], [3.5, 4.5], [6.5, 8.5], [8.5, 13.5], [2.5, 7.5]];
const ENDING_NEXUS: readonly [number, number] = [6, 16.6];
/** Sahne bitince raporun yeri bu kadar gorunup sahne yeniden basliyor. */
const ENDING_REPORT_HOLD_MS = 1800;

export class VfxGalleryScene extends Phaser.Scene {
  private mode: Mode = "grid";
  private page = 0;
  private slow = false;
  private paused = false;
  private teammate = false;
  private now = 0;
  private lastFrameAt = 0;
  private scenario?: VfxScenario;
  private readonly towerOwn = new Map<string, boolean>();
  private readonly lod = new VfxLod();
  private attackVfx?: AttackVfx;
  private signatures?: AtakanSignatureVfx;
  /** Zeynep imzalari ve oyundaki turetme yolu (izleyici); oyunla ayni siniflar. */
  private court?: ZeynepSignatureVfx;
  private courtFeed?: ScenarioCourtFeed;
  private readonly courtFrame: CourtFrame = { enemies: [], now: 0, scale: 1, enemySize: () => GALLERY_ENEMY_SIZE };
  /** Abarti rayi ve ayna isininin duvari: sahnenin sabit cizimi. */
  private courtStage?: Phaser.GameObjects.Graphics;
  /** Taht mizrak satirinin kip yazilari (degisince yaziliyor). */
  private readonly lanceLabels: Phaser.GameObjects.Text[] = [];
  private lanceMode = "";
  /** Imza karesinin girdisi; karede yerinde yaziliyor. */
  private readonly signatureFrame: SignatureFrame = {
    towers: [],
    enemies: [],
    now: 0,
    scale: 1,
    cellSize: GALLERY_CELL,
    isOwn: (tower) => !this.teammate && tower.ownerId === undefined,
    enemySize: () => GALLERY_ENEMY_SIZE
  };
  /** Sunucu bagi ve Izolasyon komsusu: soluk yan kule sprite'lari, kimlikle. */
  private readonly anchorSprites = new Map<string, Phaser.GameObjects.Image>();
  private beamRenderer?: BeamRenderer;
  /** Olumler (oyundaki sinif): olum satirlari ve yer izleri. */
  private combatVfx?: CombatVfx;
  private deathCells: DeathCellState[] = [];
  private readonly deathAccents = new Map<string, number>();
  private flashPool?: FlashPool;
  private stamps?: GlowStampPool;
  private surfaces: Phaser.GameObjects.Graphics[] = [];
  private towerSprites: Phaser.GameObjects.Image[] = [];
  private walkerSprites: Phaser.GameObjects.Image[] = [];
  private walkerHitAt: number[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private readonly projectileSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly spritePool: Phaser.GameObjects.Image[] = [];
  private perfText?: Phaser.GameObjects.Text;
  private controls?: HTMLElement;
  private frameMsEma = 16.7;
  private vfxMsEma = 0;
  private feedback?: FeedbackDirector;
  private beamHitTracker?: BeamHitTracker;
  private muted = false;
  /** Yalnizca bu kulenin sesi (hucreye dokunuldu); yoksa herkes. */
  private soloTowerId?: string;
  private soloMarker?: Phaser.GameObjects.Graphics;
  private auditionVoice: string = HIT_VOICE_IDS[0];
  /** Galeri yuruyucularinin karedeki konumlari: alan isinlarinin sesi icin, yeniden kullaniliyor. */
  private readonly walkerSpots: Array<{ x: number; y: number }> = [];
  /** Karsi atak kipi: sayfa, yuzeyler ve oyundaki cizicinin girdileri. */
  private surgePage = 0;
  private surgeBoard?: Phaser.GameObjects.Graphics;
  private surgeFill?: Phaser.GameObjects.Graphics;
  private surgeEdge?: Phaser.GameObjects.Graphics;
  private surgeFlash?: Phaser.GameObjects.Graphics;
  private readonly surgeBand = createCounterSurgeBand();
  private readonly surgeImpacts = new AegisImpacts();
  private surgeImpactAt = 0;
  private surgeStatus?: Phaser.GameObjects.Text;
  private readonly surgeWire: CounterSurgeSnapshot = { id: 1, col: 0, w: 1, p: 0 };
  private surgeGrid = 24;
  /** Irklar kipi: sayfa ve sayfanin cizicisi (oyunun race-traits'i). */
  private racePage = 0;
  private raceGallery?: RaceGalleryPage;
  private raceStatus?: Phaser.GameObjects.Text;
  /** Efsanevi kipi: sekiz vurus etkisi tek sayfada; sayfalar normal, LOD 2, azaltilmis hareket. */
  private legendaryPage = 0;
  private legendaryGallery?: LegendaryGalleryPage;
  private legendaryStatus?: Phaser.GameObjects.Text;
  private readonly surgeOrigin = { x: 0, y: 0 };
  /** Mac sonu kipi: sayfa (0 yenilgi, 1 zafer), sahne ve sahnenin girdileri. */
  private endingPage = 0;
  private endingStage?: MatchEndStage;
  private endingWalls?: Phaser.GameObjects.Graphics;
  private endingStructures: MatchEndStructure[] = [];
  private readonly endingTowerSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly endingEnemySprites = new Map<string, Phaser.GameObjects.Image>();
  private endingReportAt?: number;
  private endingReportText?: Phaser.GameObjects.Text;
  private endingStatus?: Phaser.GameObjects.Text;

  constructor() {
    super("vfx-gallery");
  }

  create() {
    configureHiDpiCamera(this);
    this.cameras.main.setBackgroundColor("#000000");
    const beamGraphics = this.add.graphics().setDepth(10);
    const beamGlow = this.add.graphics().setDepth(10.05).setBlendMode(Phaser.BlendModes.ADD);
    const body = this.add.graphics().setDepth(10.9);
    const glow = this.add.graphics().setDepth(10.85).setBlendMode(Phaser.BlendModes.ADD);
    const events = this.add.graphics().setDepth(12.45);
    // Yer izleri (yanik, leke) dusmanlarin altinda: GameScene ile ayni derinlikler.
    const attackGround = this.add.graphics().setDepth(7.3);
    const deathGround = this.add.graphics().setDepth(7.35);
    const deaths = this.add.graphics().setDepth(11.7);
    // Atakan imzalari oyundaki derinliklerde (GameScene ile ayni).
    const signatureGround = this.add.graphics().setDepth(7.4);
    const signatureLinks = this.add.graphics().setDepth(10.4);
    const signatureGlow = this.add.graphics().setDepth(10.42).setBlendMode(Phaser.BlendModes.ADD);
    const signatureMarks = this.add.graphics().setDepth(13.2);
    // Zeynep imzalari oyundaki derinliklerde (GameScene ile ayni).
    const courtGround = this.add.graphics().setDepth(7.45);
    const courtLinks = this.add.graphics().setDepth(10.41);
    const courtGlow = this.add.graphics().setDepth(10.43).setBlendMode(Phaser.BlendModes.ADD);
    const courtMarks = this.add.graphics().setDepth(13.25);
    this.courtStage = this.add.graphics().setDepth(7.2);
    this.surfaces = [beamGraphics, beamGlow, body, glow, events, attackGround, deathGround, deaths, signatureGround, signatureLinks, signatureGlow, signatureMarks, courtGround, courtLinks, courtGlow, courtMarks];
    this.signatures = new AtakanSignatureVfx(signatureGround, signatureLinks, signatureGlow, signatureMarks, { lod: this.lod });
    this.court = new ZeynepSignatureVfx(courtGround, courtLinks, courtGlow, courtMarks, { lod: this.lod });
    this.courtFeed = new ScenarioCourtFeed(this.court, {
      gridSize: GALLERY_CELL,
      worldScale: GALLERY_CELL / 34,
      isOwnOwner: (ownerId) => !this.teammate && ownerId === undefined
    });
    this.flashPool = new FlashPool(this, 12.5);
    this.stamps = new GlowStampPool(this, 10.86);
    this.beamRenderer = new BeamRenderer(beamGraphics, beamGlow, this.lod);
    this.combatVfx = new CombatVfx(deaths, deathGround, this.lod);
    this.attackVfx = new AttackVfx(body, glow, events, this.flashPool, {
      lod: this.lod,
      stamps: this.stamps,
      ground: attackGround,
      // Galeride sarsinti yok: yan yana 40 kule kamerayi hic durdurmazdi.
      onHeavyImpact: undefined
    });
    this.perfText = this.add.text(6, HEADER + 2, "", { fontFamily: "monospace", fontSize: "9px", color: "#a7f3d0", backgroundColor: "#020617cc" })
      .setDepth(40)
      .setVisible(false);
    this.soloMarker = this.add.graphics().setDepth(13.5);
    // Karsi atak kipinin yuzeyleri: GameScene ile ayni derinlikler (dolgu dusmanlarin altinda, kenar kulelerin ustunde).
    this.surgeBoard = this.add.graphics().setDepth(7);
    this.surgeFill = this.add.graphics().setDepth(7.25);
    this.surgeEdge = this.add.graphics().setDepth(12.7);
    this.surgeFlash = this.add.graphics().setDepth(24);
    // Irklar kipinin yuzeyleri: zemin (catlak, katlanma isareti) dusmanin altinda, kalkan ve izler kulelerin ustunde.
    this.raceGallery = new RaceGalleryPage(this, this.add.graphics().setDepth(7), this.add.graphics().setDepth(7.3), this.add.graphics().setDepth(8.12), this.add.graphics().setDepth(12.75));
    // Efsanevi kipi: GameScene ile ayni derinlikler (cekim halkalari 7.38, digerleri 13.3).
    this.legendaryGallery = new LegendaryGalleryPage(this, this.add.graphics().setDepth(7), this.add.graphics().setDepth(13.3), this.add.graphics().setDepth(7.38), this.flashPool);
    // Mac sonu kipi: duvar govdeleri kulelerin seviyesinde; sahne oyundaki sinif.
    this.endingWalls = this.add.graphics().setDepth(11.9);
    // Galeri oyunun seviyelerini kullaniyor; biri sifirsa dinleme sayfasi
    // sessiz kalmasin diye varsayilan.
    this.feedback = new FeedbackDirector({
      sfxVolume: readGalleryVolume("karayel.sfxVolume", 0.6),
      hitVolume: readGalleryVolume("karayel.hitVolume", 0.5),
      vibration: false,
      getCamera: () => this.cameras.main
    });
    this.beamHitTracker = new BeamHitTracker((beam, voice, tick) => {
      if (!this.isAudible(beam.id)) return;
      this.feedback?.playHit(voice, beam.tier, this.isOwnKey(beam.id), beam.id, tick);
    });
    // Tuvalde parmagin kalkmasi: ses baglamini ac (iOS yalnizca dokunusun
    // icinde aciyor), izgarada hucreyi tek basina dinlet.
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      this.feedback?.unlockAudio();
      this.toggleSolo(pointer.worldX, pointer.worldY);
    });
    this.endingStage = new MatchEndStage(this, {
      flash: this.flashPool,
      lod: this.lod,
      reducedMotion: () => this.feedback?.reducedMotion ?? false,
      playSample: (cue, key) => {
        if (!this.muted) this.feedback?.playSampleCue(cue.family, cue.rate, cue.gain, key);
      },
      shake: (px, durationMs) => this.feedback?.shakeCamera({ own: true, priority: 0, px, durationMs })
    });
    this.createControls();
    this.buildScene();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.endingStage?.destroy();
      document.documentElement.style.removeProperty("--match-end-skip-bottom");
      this.controls?.remove();
      this.flashPool?.destroy();
      this.stamps?.destroy();
      this.feedback?.destroy();
      this.beamHitTracker?.clear();
      this.feedback = undefined;
    });
  }

  update(time: number, delta: number) {
    const step = this.paused ? 0 : delta * (this.slow ? 0.25 : 1);
    const since = this.now;
    this.now += step;
    const frameMs = this.lastFrameAt > 0 ? time - this.lastFrameAt : 16.7;
    this.lastFrameAt = time;
    if (this.mode === "surge") {
      this.renderSurgePage();
      return;
    }
    if (this.mode === "races") {
      this.raceStatus?.setText(this.raceGallery?.render(this.now) ?? "");
      return;
    }
    if (this.mode === "legendary") {
      this.legendaryStatus?.setText(this.legendaryGallery?.render(this.now) ?? "");
      this.flashPool?.update(this.now);
      return;
    }
    if (this.mode === "ending") {
      this.renderEndingPage();
      return;
    }
    const scenario = this.scenario;
    if (!scenario || !this.attackVfx || !this.beamRenderer) return;

    const start = performance.now();
    const frame = scenario.frame(this.now, step > 0 ? since : this.now);
    const ownOf = (key: string) => this.isOwnKey(key);
    for (const event of frame.events) {
      // Saray olaylari (Zeynep) imza besleyicisinde.
      if (event.type === "court") continue;
      const own = this.teammate ? false : event.own;
      const input = { x: event.x, y: event.y, angle: event.angle, definitionId: event.definitionId, tier: event.tier, own, key: event.key, bornAt: event.at };
      if (event.type === "anticipation") this.attackVfx.emitAnticipation(input);
      else if (event.type === "muzzle") this.attackVfx.emitMuzzle(input);
      else if (event.type === "contact") {
        this.attackVfx.emitImpact({ ...input, radius: event.radius });
        this.walkerHitAt[event.walker] = this.now;
        this.playContactSound(event.definitionId, event.tier, own, event.key);
      }
    }
    this.attackVfx.renderProjectiles(frame.projectiles, this.now, 1, (projectile) => ownOf(projectile.id));
    this.syncProjectileSprites(frame.projectiles);
    this.beamRenderer.render(frame.beams, { now: this.now, sceneNow: this.now, scale: 1, isOwn: (beam: BeamSnapshot) => ownOf(beam.id) });
    this.beamHitTracker?.update(frame.beams, this.now, this.collectWalkerSpots(scenario.walkers));
    this.attackVfx.render(this.now, 1);
    this.updateDeaths(step > 0 ? since : this.now);
    this.combatVfx?.render(this.now, 1);
    const signatureFrame = this.signatureFrame;
    signatureFrame.towers = frame.signatureTowers;
    signatureFrame.enemies = frame.signatureEnemies;
    signatureFrame.now = this.now;
    this.signatures?.render(signatureFrame);
    this.courtFeed?.feed(frame, this.now);
    const courtFrame = this.courtFrame;
    courtFrame.enemies = frame.signatureEnemies;
    courtFrame.now = this.now;
    this.court?.render(courtFrame);
    this.updateLanceLabels();
    this.flashPool?.update(this.now);
    const vfxMs = performance.now() - start;
    this.lod.note(vfxMs, frameMs, time);
    this.updateWalkers(scenario.walkers);
    this.syncAnchorSprites(frame.signatureTowers);
    this.updatePerf(vfxMs, frameMs, frame.projectiles.length, frame.beams.length);
  }

  /* ---------------------------------------------------------------- */

  private get worldHeight() {
    return this.cameras.main.height / this.cameras.main.zoom;
  }

  private get rowsPerPage() {
    return Math.max(2, Math.floor((this.worldHeight - HEADER - FOOTER) / ROW_HEIGHT));
  }

  private get pageCount() {
    return Math.max(1, Math.ceil(getGalleryRows().length / this.rowsPerPage));
  }

  private buildScene() {
    for (const sprite of [...this.towerSprites, ...this.walkerSprites]) sprite.destroy();
    for (const cell of this.deathCells) cell.sprite.destroy();
    this.deathCells = [];
    this.combatVfx?.clear();
    for (const label of this.labels) label.destroy();
    for (const sprite of this.projectileSprites.values()) sprite.destroy();
    this.projectileSprites.clear();
    this.towerSprites = [];
    this.walkerSprites = [];
    this.labels = [];
    this.attackVfx?.clear();
    this.signatures?.clear();
    this.court?.clear();
    this.courtFeed?.clear();
    this.courtStage?.clear();
    for (const label of this.lanceLabels) label.destroy();
    this.lanceLabels.length = 0;
    this.lanceMode = "";
    for (const sprite of this.anchorSprites.values()) sprite.destroy();
    this.anchorSprites.clear();
    this.beamHitTracker?.clear();
    this.soloTowerId = undefined;
    this.drawSoloMarker();
    for (const surface of [this.surgeBoard, this.surgeFill, this.surgeEdge, this.surgeFlash]) surface?.clear();
    this.surgeStatus = undefined;
    this.raceGallery?.clear();
    this.raceStatus = undefined;
    this.legendaryGallery?.clear();
    this.legendaryStatus = undefined;
    this.clearEndingPage();
    if (this.mode === "ending") {
      this.scenario = undefined;
      for (const surface of this.surfaces) surface.clear();
      this.lod.force(0);
      this.perfText?.setVisible(false);
      this.buildEndingPage();
      this.refreshControls();
      return;
    }
    if (this.mode === "races") {
      this.scenario = undefined;
      for (const surface of this.surfaces) surface.clear();
      this.lod.force(0);
      this.perfText?.setVisible(false);
      this.buildRacePage();
      this.refreshControls();
      return;
    }
    if (this.mode === "legendary") {
      this.scenario = undefined;
      for (const surface of this.surfaces) surface.clear();
      this.lod.force(0);
      this.perfText?.setVisible(false);
      this.buildLegendaryPage();
      this.refreshControls();
      return;
    }
    if (this.mode === "surge") {
      this.scenario = undefined;
      // Izgaranin isin ve imza yuzeyleri karede yeniden cizilmiyor: son kareleri kalmasin.
      for (const surface of this.surfaces) surface.clear();
      this.lod.force(0);
      this.perfText?.setVisible(false);
      this.buildSurgePage();
      this.refreshControls();
      return;
    }
    this.scenario = this.mode === "stress" ? createStressScenario(390, HEADER + 30, this.worldHeight - HEADER - FOOTER - 30) : this.createGridScenario();
    this.lod.force(this.mode === "stress" ? undefined : 0);
    this.towerOwn.clear();
    for (const tower of this.scenario.towers) this.towerOwn.set(tower.id, tower.own);
    this.perfText?.setVisible(this.mode === "stress");

    for (const tower of this.scenario.towers) {
      const key = this.textures.exists(`tower-${tower.definitionId}`) ? `tower-${tower.definitionId}` : "projectile-tower";
      const sprite = this.add.image(tower.x, tower.y, key).setDepth(12);
      sprite.setDisplaySize(30, 30);
      // Abarti kare kaplamiyor: govdesi sahnenin cizdigi ray.
      if (tower.court === "abarti") sprite.setVisible(false);
      this.towerSprites.push(sprite);
      if (this.mode === "grid") {
        this.labels.push(this.add.text(tower.x, tower.y + 17, `sv ${tower.level}`, { fontFamily: "Rajdhani, sans-serif", fontSize: "9px", color: tierCss(tower) })
          .setOrigin(0.5, 0)
          .setDepth(13));
      }
    }
    for (const walker of this.scenario.walkers) {
      const sprite = this.add.image(walker.cx, walker.cy, "enemy-grunt").setDepth(8);
      sprite.setDisplaySize(GALLERY_ENEMY_SIZE, GALLERY_ENEMY_SIZE);
      this.walkerSprites.push(sprite);
    }
    this.walkerHitAt = this.scenario.walkers.map(() => -Infinity);

    if (this.mode === "grid") {
      const rows = this.pageRows();
      rows.forEach((entry, row) => {
        if (entry.death) {
          this.buildDeathRow(entry, row);
          return;
        }
        const id = entry.definitionId;
        const definition = Object.values(towerCatalog).flat().find((tower) => tower.id === id);
        const y = HEADER + row * ROW_HEIGHT + 4;
        const voice = resolveHitVoice(id);
        const sound = voice ? ` · ses: ${HIT_VOICE_LABELS[voice]}` : "";
        const profile = getVfxProfile(id);
        const mechanic = profile.signature?.mechanic;
        const court = profile.court?.mechanic;
        const signature = mechanic ? ` · imza: ${MECHANIC_LABELS[mechanic]}` : court ? ` · imza: ${COURT_LABELS[court]}` : "";
        const variant = entry.label ? ` (${entry.label})` : "";
        this.labels.push(this.add.text(6, y, `${id} · ${definition?.name ?? ""}${variant}${signature}${sound}`, { fontFamily: "Rajdhani, sans-serif", fontSize: "10px", color: "#cbd5e1" }).setDepth(13));
        if (entry.court === "lances") {
          COLUMN_LEVELS.forEach((_, column) => {
            this.lanceLabels.push(this.add.text(column * COLUMN_WIDTH + 64, HEADER + row * ROW_HEIGHT + 70, "", { fontFamily: "Rajdhani, sans-serif", fontSize: "9px", color: "#f5d0fe" }).setDepth(13));
          });
        }
      });
      this.drawCourtStage();
      this.labels.push(this.add.text(4, 1, "Dokun: ses açılır · hücreye dokun: tek kule", { fontFamily: "Rajdhani, sans-serif", fontSize: "9px", color: "#94a3b8" }).setDepth(13));
      // Yalnizca olum satirlari olan sayfada sutunlar seviye degil, dusman tipi (hucre etiketinde).
      const towerRows = rows.some((entry) => !entry.death);
      COLUMN_LEVELS.forEach((level, column) => {
        if (!towerRows) return;
        this.labels.push(this.add.text(column * COLUMN_WIDTH + 65, 14, `Sv ${level}`, { fontFamily: "Rajdhani, sans-serif", fontSize: "13px", color: "#f8fafc", fontStyle: "bold" })
          .setOrigin(0.5, 0)
          .setDepth(13));
      });
    } else {
      this.labels.push(this.add.text(195, 12, "Yük testi · 20 kule (sv 10) · 60 düşman", { fontFamily: "Rajdhani, sans-serif", fontSize: "12px", color: "#f8fafc" }).setOrigin(0.5, 0).setDepth(13));
    }
    this.refreshControls();
  }

  /** Bu sayfanin satirlari (Zeynep'in Taht kipleri ve Abarti dahil). */
  private pageRows(): GalleryRow[] {
    const rows = getGalleryRows();
    const per = this.rowsPerPage;
    this.page = Math.min(this.page, this.pageCount - 1);
    return rows.slice(this.page * per, this.page * per + per);
  }

  /** Satir anahtarlari (`zeynep-3:ayna` gibi); kule kimligi `g-<anahtar>-<sv>`. */
  private pageIds() {
    return this.pageRows().map((row) => row.key);
  }

  /**
   * Sahnenin sabit cizimi: Abarti rayi (menekse cizgi, oyundaki kalinlikta) ve
   * ayna isininin sektigi hucre kenari (soluk cizgi).
   */
  private drawCourtStage() {
    const g = this.courtStage;
    if (!g || !this.scenario) return;
    g.clear();
    for (const tower of this.scenario.towers) {
      if (tower.court === "abarti") {
        const thickness = Math.max(5, GALLERY_CELL * 0.16);
        g.lineStyle(thickness * 1.6, 0x7c3aed, 0.25);
        g.lineBetween(tower.x, tower.y - GALLERY_CELL, tower.x, tower.y + GALLERY_CELL);
        g.lineStyle(Math.max(2, thickness * 0.42), 0xc4b5fd, 0.85);
        g.lineBetween(tower.x, tower.y - GALLERY_CELL, tower.x, tower.y + GALLERY_CELL);
      } else if (tower.court === "ray" && tower.bounds) {
        const { left, right, top, bottom } = tower.bounds;
        g.lineStyle(1, 0x64748b, 0.55);
        g.strokeRect(left, top, right - left, bottom - top);
      }
    }
  }

  /** Taht mizrak satirinin kip yazisi: dongu degisince bir kez yaziliyor. */
  private updateLanceLabels() {
    if (this.lanceLabels.length === 0) return;
    const mode = getCourtLanceMode(this.now);
    if (mode === this.lanceMode) return;
    this.lanceMode = mode;
    for (const label of this.lanceLabels) {
      label.setText(LANCE_MODE_LABELS[mode]);
      label.setColor(mode === "broken" ? "#fca5a5" : "#f5d0fe");
    }
  }

  /**
   * Satir basina bir kule tanimi, sutun basina bir seviye; her hucrede bir
   * yuruyucu. Zeynep sahneleri kendi duzeninde (`createCourtCell`).
   */
  private createGridScenario() {
    const towers: ScenarioTower[] = [];
    const walkers: ScenarioWalker[] = [];
    this.pageRows().forEach((entry, row) => {
      if (entry.death) return;
      const definitionId = entry.definitionId;
      const y = HEADER + row * ROW_HEIGHT + 48;
      COLUMN_LEVELS.forEach((level, column) => {
        const cellX = column * COLUMN_WIDTH;
        if (entry.court) {
          towers.push(createCourtCell(entry, level, cellX, y, HEADER + row * ROW_HEIGHT, row, column, walkers));
          return;
        }
        const walker = walkers.length;
        walkers.push({ id: `w-${definitionId}-${level}`, cx: cellX + 86, cy: y, rx: 22, ry: 13, periodMs: 3400, phase: row * 0.7 + column * 1.9 });
        const lineup = definitionId === "zeynep-2" ? spawnLineup(walkers, `${entry.key}-${level}`, cellX + 70, y, 3, row, column) : undefined;
        towers.push({
          id: `g-${entry.key}-${level}`,
          definitionId,
          level,
          x: cellX + 28,
          y,
          color: getScenarioColor(definitionId),
          own: true,
          // Gosteri: hattin ortasindaki dusmana nisan; hat uc dusmani da kesiyor.
          walker: lineup ? lineup[1] : walker,
          intervalMs: getScenarioIntervalMs(definitionId),
          // Izolasyon alani hucreye sigan boyda; Sunucu ve Izolasyon'un yan
          // kulesi hucrenin sag altinda (bag) ya da kulenin yaninda (komsu).
          displayRange: definitionId === "warrior-3" ? 34 : undefined,
          anchor: definitionId === "warrior-2" ? { x: cellX + 114, y: y + 22 } : definitionId === "warrior-3" ? { x: cellX + 28 + GALLERY_CELL, y } : undefined
        });
      });
    });
    return new VfxScenario(towers, walkers);
  }

  /* ---------------------------------------------------------------- */
  /* Olumler                                                            */
  /* ---------------------------------------------------------------- */

  /** Olum satiri: irkin malzemesi etikette, her sutunda bir dusman tipi. */
  private buildDeathRow(entry: GalleryRow, row: number) {
    const death = entry.death;
    if (!death) return;
    const top = HEADER + row * ROW_HEIGHT;
    const material = getDeathMaterial(getGalleryDeathTexture(death.race, "grunt"));
    this.labels.push(this.add.text(6, top + 4, `Ölüm · ${death.race} · ${DEATH_MATERIAL_LABELS[material]}`, { fontFamily: "Rajdhani, sans-serif", fontSize: "10px", color: "#cbd5e1" }).setDepth(13));
    death.cells.forEach((cell, column) => {
      const texture = getGalleryDeathTexture(death.race, cell.type);
      const key = this.textures.exists(texture) ? texture : "enemy-grunt";
      const x = column * COLUMN_WIDTH + 65;
      const y = top + 46;
      const size = GALLERY_DEATH_SIZE[cell.type] * (cell.air ? 1.28 : 1);
      const sprite = this.add.image(x, y, key).setDepth(cell.air ? 9 : 8);
      sprite.setDisplaySize(size, size);
      const shape = getDeathBurstShape(cell.type);
      this.deathCells.push({
        sprite,
        texture: key,
        x,
        y,
        size,
        heavy: shape.heavy,
        air: Boolean(cell.air),
        shards: shape.shards,
        durationMs: shape.durationMs,
        phase: (row * 3 + column) * 370,
        accent: this.getDeathAccent(key)
      });
      this.labels.push(this.add.text(x, top + 70, cell.label, { fontFamily: "Rajdhani, sans-serif", fontSize: "9px", color: "#94a3b8" }).setOrigin(0.5, 0).setDepth(13));
    });
  }

  /** Dokunun vurgusu (oyundaki gibi dokudan okunuyor); doku basina bir kez. */
  private getDeathAccent(texture: string) {
    let color = this.deathAccents.get(texture);
    if (color === undefined) {
      color = readTextureAccent(this.textures.exists(texture) ? this.textures.get(texture).getSourceImage() : undefined, 0xd6d3d1);
      this.deathAccents.set(texture, color);
    }
    return color;
  }

  /**
   * Olum dongusu: dusman `DEATH_AT_MS`'de son vurusu (beyaz flas) alip oluyor,
   * dongunun geri kalaninda yok, sonra yeniden doguyor. Olum ani zamanin saf
   * fonksiyonu: yavas cekim ve duraklatmada da ayni.
   */
  private updateDeaths(since: number) {
    for (const cell of this.deathCells) {
      const local = (this.now + cell.phase) % DEATH_CYCLE_MS;
      const alive = local < DEATH_AT_MS;
      cell.sprite.setVisible(alive);
      if (alive && local > DEATH_AT_MS - 50) cell.sprite.setTintFill(0xffffff);
      else if (cell.sprite.isTinted) cell.sprite.clearTint();
      const cycle = Math.floor((this.now + cell.phase) / DEATH_CYCLE_MS);
      const deathAt = cycle * DEATH_CYCLE_MS + DEATH_AT_MS - cell.phase;
      if (!(deathAt > since && deathAt <= this.now)) continue;
      this.combatVfx?.emitDeath({
        x: cell.x,
        y: cell.y,
        size: cell.size,
        color: cell.accent,
        shards: cell.shards,
        durationMs: cell.durationMs,
        intensity: this.teammate ? GALLERY_TEAMMATE_DEATH : 1,
        still: false,
        bornAt: deathAt,
        texture: cell.texture,
        heavy: cell.heavy,
        air: cell.air
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Vurus sesleri                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Temasin sesi. Isinla vuran kulelerin temasi galeride yalnizca cizim
   * icin: oyunda o kulelerin temas mesaji yok, sesleri isindan geliyor.
   */
  private playContactSound(definitionId: string, tier: number, own: boolean, key: string) {
    if (!this.isAudible(key)) return;
    if (BEAM_SOUNDED_DELIVERIES.has(getVfxProfile(definitionId).delivery)) return;
    const voice = resolveHitVoice(definitionId);
    if (voice) this.feedback?.playHit(voice, tier, own, key);
  }

  /** Mermi ya da isin kimliginden kulenin sahibi; arkadas kipi hepsini arkadasin sayar. */
  private isOwnKey(key: string) {
    if (this.teammate) return false;
    const towerId = /^(?:beam-|melis-curse-|melis-underworld-link-)?(.*?)(?:-[pb]\d+.*)?$/.exec(key)?.[1] ?? key;
    return this.towerOwn.get(towerId) ?? true;
  }

  /** Ses kapali degil ve (hucre secildiyse) olay o kulenin. */
  private isAudible(key: string) {
    if (this.muted) return false;
    return !this.soloTowerId || belongsToTower(key, this.soloTowerId);
  }

  /** Izgarada hucreye dokunus: o kuleyi tek basina dinlet; ayni hucre geri acar. */
  private toggleSolo(worldX: number, worldY: number) {
    if (this.mode !== "grid") return;
    const row = Math.floor((worldY - HEADER) / ROW_HEIGHT);
    const column = Math.floor(worldX / COLUMN_WIDTH);
    const ids = this.pageIds();
    if (row < 0 || row >= ids.length || column < 0 || column >= COLUMN_LEVELS.length) return;
    const towerId = `g-${ids[row]}-${COLUMN_LEVELS[column]}`;
    this.soloTowerId = this.soloTowerId === towerId ? undefined : towerId;
    this.drawSoloMarker();
  }

  private drawSoloMarker() {
    const marker = this.soloMarker;
    if (!marker) return;
    marker.clear();
    const towerId = this.soloTowerId;
    if (!towerId || this.mode !== "grid") return;
    this.pageIds().forEach((id, row) => {
      COLUMN_LEVELS.forEach((level, column) => {
        if (towerId !== `g-${id}-${level}`) return;
        marker.lineStyle(1, 0x38bdf8, 0.9);
        marker.strokeRect(column * COLUMN_WIDTH + 2, HEADER + row * ROW_HEIGHT + 2, COLUMN_WIDTH - 4, ROW_HEIGHT - 4);
      });
    });
  }

  /**
   * Secili sesi dogrudan cal: onizleme yolundan, yani sahnenin vurus
   * butcesinden bagimsiz. Dokunusun icinde; baglam aciliyorsa kisa bir an
   * sonra bir kez daha.
   */
  private audition(level: number) {
    const feedback = this.feedback;
    if (!feedback || this.muted) return;
    feedback.unlockAudio();
    const voice = this.auditionVoice;
    const own = !this.teammate;
    const kill = GALLERY_KILL_CUES.find((entry) => entry.id === voice);
    if (kill) {
      if (!feedback.previewKill(kill.cue, own)) {
        window.setTimeout(() => this.feedback?.previewKill(kill.cue, own), 160);
      }
      return;
    }
    const hitVoice = voice as HitVoiceId;
    if (!feedback.previewHit(hitVoice, levelToTier(level), own)) {
      window.setTimeout(() => this.feedback?.previewHit(hitVoice, levelToTier(level), own), 160);
    }
  }

  private collectWalkerSpots(walkers: readonly ScenarioWalker[]) {
    const spots = this.walkerSpots;
    spots.length = walkers.length;
    walkers.forEach((walker, index) => {
      const position = walkerPosition(walker, this.now);
      const spot = spots[index] ?? (spots[index] = { x: 0, y: 0 });
      spot.x = position.x;
      spot.y = position.y;
    });
    return spots;
  }

  private updateWalkers(walkers: readonly ScenarioWalker[]) {
    walkers.forEach((walker, index) => {
      const sprite = this.walkerSprites[index];
      if (!sprite) return;
      const position = walkerPosition(walker, this.now);
      sprite.setPosition(position.x, position.y);
      // Vurus flasi oyundakiyle ayni sure (50 ms), yavas cekimde de.
      const hit = this.now - (this.walkerHitAt[index] ?? -Infinity) < 50;
      if (hit) sprite.setTintFill(0xffffff);
      else if (sprite.isTinted) sprite.clearTint();
    });
  }

  /** Senaryonun yan kuleleri (bag ve komsu): soluk sprite, belirip kayboluyor. */
  private syncAnchorSprites(towers: readonly SignatureTower[]) {
    for (const sprite of this.anchorSprites.values()) sprite.setVisible(false);
    for (const tower of towers) {
      if (this.towerOwn.has(tower.id)) continue;
      let sprite = this.anchorSprites.get(tower.id);
      if (!sprite) {
        const key = this.textures.exists(`tower-${tower.definitionId}`) ? `tower-${tower.definitionId}` : "projectile-tower";
        sprite = this.add.image(tower.x, tower.y, key).setDepth(12).setAlpha(0.55);
        sprite.setDisplaySize(18, 18);
        this.anchorSprites.set(tower.id, sprite);
      }
      sprite.setVisible(true);
    }
  }

  /** Kendi cizilmis dokusu olan mermiler (Melis): oyundaki gibi profil boyunda sprite. */
  private syncProjectileSprites(projectiles: readonly ProjectileSnapshot[]) {
    const seen = new Set<string>();
    for (const projectile of projectiles) {
      const profile = getVfxProfile(projectile.definitionId);
      if (profile.silhouette !== "sprite") continue;
      seen.add(projectile.id);
      let sprite = this.projectileSprites.get(projectile.id);
      const textureKey = this.textures.exists(`projectile-${profile.id}`) ? `projectile-${profile.id}` : "projectile-tower";
      if (!sprite) {
        sprite = this.spritePool.pop() ?? this.add.image(0, 0, textureKey).setDepth(11.2);
        sprite.setTexture(textureKey).setVisible(true);
        this.projectileSprites.set(projectile.id, sprite);
      }
      const recipe = getVfxTier(profile, projectile.tier);
      sprite.setPosition(projectile.x, projectile.y).setDisplaySize(recipe.silhouette, recipe.silhouette);
      sprite.setRotation(Math.atan2(projectile.vy ?? 0, projectile.vx ?? 1));
      sprite.setTint(toTier(projectile.tier) >= 2 ? recipe.core : 0xffffff);
    }
    for (const [id, sprite] of this.projectileSprites) {
      if (seen.has(id)) continue;
      sprite.setVisible(false);
      this.spritePool.push(sprite);
      this.projectileSprites.delete(id);
    }
  }

  private updatePerf(vfxMs: number, frameMs: number, projectiles: number, beams: number) {
    if (this.mode !== "stress" || !this.perfText) return;
    this.frameMsEma += (frameMs - this.frameMsEma) * 0.05;
    this.vfxMsEma += (vfxMs - this.vfxMsEma) * 0.05;
    const commands = this.surfaces.reduce((sum, surface) => sum + (surface as unknown as { commandBuffer: unknown[] }).commandBuffer.length, 0);
    this.perfText.setText([
      `fps ${(1000 / Math.max(1, this.frameMsEma)).toFixed(0)}  vfx ${this.vfxMsEma.toFixed(2)} ms`,
      `LOD ${this.lod.level}  (kıvılcım ${this.lod.sparks ? "açık" : "kapalı"}, duman ${this.lod.smoke ? "açık" : "kapalı"}, yer izi ${this.lod.decals ? "açık" : "kapalı"}, iz ×${this.lod.trailScale})`,
      `mermi ${projectiles}  ışın ${beams}  olay ${this.attackVfx?.liveEvents ?? 0}`,
      `parlama ${this.flashPool?.live ?? 0}/64  damga ${this.stamps?.count ?? 0}  komut ${commands}`
    ]);
  }

  /* ---------------------------------------------------------------- */
  /* DOM denetimleri: telefonda parmakla basilacak boyutta, Turkce.     */
  /* ---------------------------------------------------------------- */

  private createControls() {
    const bar = document.createElement("div");
    bar.id = "vfx-gallery-controls";
    bar.style.cssText = [
      "position:fixed", "left:0", "right:0", "bottom:0", "z-index:50", "display:flex", "flex-wrap:wrap", "gap:6px",
      "justify-content:center", "padding:8px max(8px, env(safe-area-inset-left)) calc(8px + env(safe-area-inset-bottom))",
      "background:rgba(2,6,23,0.88)", "border-top:1px solid #1e293b", "font:600 13px Rajdhani, sans-serif"
    ].join(";");
    const button = (label: string, action: () => void, id: string) => {
      const element = document.createElement("button");
      element.type = "button";
      element.dataset.vfx = id;
      element.textContent = label;
      element.style.cssText = "min-width:44px;min-height:36px;padding:4px 10px;color:#f8fafc;background:#0f172a;border:1px solid #334155;border-radius:8px";
      element.addEventListener("click", () => {
        action();
        this.refreshControls();
      });
      bar.append(element);
      return element;
    };
    button("◀", () => this.changePage(-1), "prev");
    const pageLabel = document.createElement("span");
    pageLabel.dataset.vfx = "page";
    pageLabel.style.cssText = "align-self:center;color:#cbd5e1;min-width:52px;text-align:center";
    bar.append(pageLabel);
    button("▶", () => this.changePage(1), "next");
    button("0.25×", () => { this.slow = !this.slow; }, "slow");
    button("Duraklat", () => { this.paused = !this.paused; }, "pause");
    button("Arkadaş %70", () => { this.teammate = !this.teammate; }, "mate");
    button("Yük testi", () => {
      this.mode = this.mode === "stress" ? "grid" : "stress";
      this.buildScene();
    }, "stress");
    button("Karşı atak", () => {
      this.mode = this.mode === "surge" ? "grid" : "surge";
      this.buildScene();
    }, "surge");
    button("Irklar", () => {
      this.mode = this.mode === "races" ? "grid" : "races";
      this.buildScene();
    }, "races");
    button("Efsanevi", () => {
      this.mode = this.mode === "legendary" ? "grid" : "legendary";
      this.buildScene();
    }, "legendary");
    button("Maç sonu", () => {
      this.mode = this.mode === "ending" ? "grid" : "ending";
      this.buildScene();
    }, "ending");
    button("Ses açık", () => {
      this.muted = !this.muted;
      if (!this.muted) this.feedback?.unlockAudio();
    }, "mute");
    // Dogrudan dinleme: secili vurus sesi, sv 1 / 5 / 10.
    const select = document.createElement("select");
    select.dataset.vfx = "voice";
    select.setAttribute("aria-label", "Vuruş sesi");
    select.style.cssText = "min-height:36px;max-width:120px;padding:4px 6px;color:#f8fafc;background:#0f172a;border:1px solid #334155;border-radius:8px;font:inherit";
    for (const voice of HIT_VOICE_IDS) {
      const option = document.createElement("option");
      option.value = voice;
      option.textContent = HIT_VOICE_LABELS[voice];
      select.append(option);
    }
    for (const kill of GALLERY_KILL_CUES) {
      const option = document.createElement("option");
      option.value = kill.id;
      option.textContent = kill.label;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const value = select.value;
      this.auditionVoice = GALLERY_KILL_CUES.some((entry) => entry.id === value) || (HIT_VOICE_IDS as readonly string[]).includes(value)
        ? value
        : HIT_VOICE_IDS[0];
    });
    bar.append(select);
    for (const level of COLUMN_LEVELS) {
      button(`Sv ${level}`, () => this.audition(level), `audition-${level}`);
    }
    // Her dugme bir dokunus: ses baglami burada da aciliyor.
    bar.addEventListener("pointerup", () => this.feedback?.unlockAudio());
    document.body.append(bar);
    this.controls = bar;
  }

  private changePage(delta: number) {
    if (this.mode === "ending") {
      this.endingPage = (this.endingPage + delta + 2) % 2;
      this.buildScene();
      return;
    }
    if (this.mode === "races") {
      const count = this.raceGallery?.pageCount ?? 1;
      this.racePage = (this.racePage + delta + count) % count;
      this.buildScene();
      return;
    }
    if (this.mode === "legendary") {
      const count = this.legendaryGallery?.pageCount ?? 1;
      this.legendaryPage = (this.legendaryPage + delta + count) % count;
      this.buildScene();
      return;
    }
    if (this.mode === "surge") {
      this.surgePage = (this.surgePage + delta + SURGE_PAGES.length) % SURGE_PAGES.length;
      this.buildScene();
      return;
    }
    if (this.mode !== "grid") return;
    this.page = (this.page + delta + this.pageCount) % this.pageCount;
    this.buildScene();
  }

  /**
   * Karsi atak sayfasi: haritanin izgarasi, yapilar ve etiket. Harita
   * ekrana sigiyor (375 px'te hucre ~26 birim).
   */
  private buildSurgePage() {
    const page = SURGE_PAGES[this.surgePage];
    const width = this.cameras.main.width / this.cameras.main.zoom;
    const grid = Math.max(12, Math.floor(Math.min((width - 16) / SURGE_COLS, (this.worldHeight - HEADER - FOOTER - 8) / SURGE_ROWS)));
    this.surgeGrid = grid;
    this.surgeOrigin.x = Math.round((width - SURGE_COLS * grid) / 2);
    this.surgeOrigin.y = HEADER + 4;
    const board = this.surgeBoard;
    if (board) {
      const { x, y } = this.surgeOrigin;
      board.fillStyle(0x0b1220, 1);
      board.fillRect(x, y, SURGE_COLS * grid, SURGE_ROWS * grid);
      board.lineStyle(1, 0x1e293b, 0.9);
      for (let col = 0; col <= SURGE_COLS; col += 1) board.lineBetween(x + col * grid, y, x + col * grid, y + SURGE_ROWS * grid);
      for (let row = 0; row <= SURGE_ROWS; row += 1) board.lineBetween(x, y + row * grid, x + SURGE_COLS * grid, y + row * grid);
      // Dogum (ust) ve nexus (alt) kenarlari: satir boyanmiyor, yalnizca kenar.
      board.lineStyle(2, 0xb45454, 0.85);
      board.lineBetween(x, y, x + SURGE_COLS * grid, y);
      board.lineStyle(2, 0x4f9a6c, 0.85);
      board.lineBetween(x, y + SURGE_ROWS * grid, x + SURGE_COLS * grid, y + SURGE_ROWS * grid);
      for (const [col, row] of SURGE_TOWERS) {
        board.fillStyle(0x334155, 1);
        board.fillRect(x + col * grid + 3, y + row * grid + 3, grid - 6, grid - 6);
        board.lineStyle(1.5, 0x94a3b8, 0.9);
        board.strokeRect(x + col * grid + 3, y + row * grid + 3, grid - 6, grid - 6);
      }
      if (page.cut) {
        // Metal Kalkan: 5. sutunun sol kenarinda, 7-8,5. satirlar.
        board.lineStyle(4, 0x94a3b8, 1);
        board.lineBetween(x + 5 * grid, y + 7 * grid, x + 5 * grid, y + 8.5 * grid);
      }
    }
    this.labels.push(this.add.text(6, 6, page.label, { fontFamily: "Rajdhani, sans-serif", fontSize: "13px", color: "#f8fafc", fontStyle: "bold" }).setDepth(30));
    this.surgeStatus = this.add.text(6, 22, "", { fontFamily: "Rajdhani, sans-serif", fontSize: "11px", color: "#94a3b8" }).setDepth(30);
    this.labels.push(this.surgeStatus);
  }

  /** Irklar sayfasi: karsi atak sayfasiyla ayni harita olcusu (375 px'te hucre ~26 birim). */
  private buildRacePage() {
    const gallery = this.raceGallery;
    if (!gallery) return;
    const width = this.cameras.main.width / this.cameras.main.zoom;
    const grid = Math.max(12, Math.floor(Math.min((width - 16) / RACE_GALLERY_COLS, (this.worldHeight - HEADER - FOOTER - 8) / RACE_GALLERY_ROWS)));
    gallery.build(this.racePage, { x: Math.round((width - RACE_GALLERY_COLS * grid) / 2), y: HEADER + 4 }, grid);
    this.labels.push(this.add.text(6, 6, gallery.label, { fontFamily: "Rajdhani, sans-serif", fontSize: "13px", color: "#f8fafc", fontStyle: "bold" }).setDepth(30));
    this.raceStatus = this.add.text(6, 22, "", { fontFamily: "Rajdhani, sans-serif", fontSize: "11px", color: "#94a3b8" }).setDepth(30);
    this.labels.push(this.raceStatus);
  }

  /** Efsanevi sayfasi: sekiz etki ikiye dort hucrede, galerinin tum alani. */
  private buildLegendaryPage() {
    const gallery = this.legendaryGallery;
    if (!gallery) return;
    const width = this.cameras.main.width / this.cameras.main.zoom;
    gallery.build(this.legendaryPage, { x: 8, y: HEADER + 4, width: width - 16, height: this.worldHeight - HEADER - FOOTER - 8 });
    this.labels.push(this.add.text(6, 6, gallery.label, { fontFamily: "Rajdhani, sans-serif", fontSize: "13px", color: "#f8fafc", fontStyle: "bold" }).setDepth(30));
    this.legendaryStatus = this.add.text(6, 22, "", { fontFamily: "Rajdhani, sans-serif", fontSize: "11px", color: "#94a3b8" }).setDepth(30);
    this.labels.push(this.legendaryStatus);
  }

  /** Karsi atak sayfasinin karesi: dongudeki ilerleme, oyundaki cizici, yapi flaslari ve siper carpmalari. */
  private renderSurgePage() {
    const fill = this.surgeFill;
    const edge = this.surgeEdge;
    const flash = this.surgeFlash;
    if (!fill || !edge || !flash) return;
    const page = SURGE_PAGES[this.surgePage];
    const cycle = SURGE_WARN_MS + page.crossMs + SURGE_HOLD_MS;
    const t = this.now % cycle;
    const warn = t < SURGE_WARN_MS;
    const progress = warn ? 0 : Math.min(1, (t - SURGE_WARN_MS) / page.crossMs);
    const wire = this.surgeWire;
    wire.id = 1 + this.surgePage;
    wire.col = page.lane;
    wire.w = page.width;
    wire.p = progress;
    wire.warn = warn ? true : undefined;
    wire.k = COUNTER_SURGE_KIND_CODES[page.kind] || undefined;
    wire.d = COUNTER_SURGE_TRAVEL_CODES[page.travel] || undefined;
    // Kesik: kalkan 5. sutunda (sagdan giden seridin ilerlemesi 5/12), 7-8,5. satirlar.
    // Genislik ekseni yandan gelen seritte asagidan yukari: 7-8,5 satirlar dusuk kenardan 1,5-3.
    wire.cut = page.cut && progress >= 5 / SURGE_COLS ? [1.5, 3, Math.round((5 / SURGE_COLS) * 1000) / 1000] : undefined;
    const grid = this.surgeGrid;
    const band = getCounterSurgeBand(wire, this.surgeOrigin, grid, SURGE_COLS, SURGE_ROWS, this.surgeBand);
    fill.clear();
    edge.clear();
    flash.clear();
    const options = { now: this.now, reducedMotion: false, lod: this.lod.level };
    drawCounterSurge(fill, edge, band, grid, options);
    const style = COUNTER_SURGE_STYLES[page.kind];
    if (page.kind === "aegis") {
      if (!warn && this.now - this.surgeImpactAt > 380) {
        this.surgeImpactAt = this.now;
        this.surgeImpacts.add(wire.id, ((this.now / 380) * 1.37) % page.width, this.now);
      }
      this.surgeImpacts.draw(edge, band, grid, this.now, false);
    } else if (!warn) {
      // Yapi vurusu: on cizgi merkezi gectikten sonra ~420 ms cesidin renginde kare flas.
      const span = (band.length / page.crossMs) * 420;
      for (const [col, row] of SURGE_TOWERS) {
        const x = this.surgeOrigin.x + (col + 0.5) * grid;
        const y = this.surgeOrigin.y + (row + 0.5) * grid;
        const along = (x - band.baseX) * band.dirX + (y - band.baseY) * band.dirY;
        const across = (x - band.baseX) * band.axX + (y - band.baseY) * band.axY;
        const inside = band.diagonal ? across >= 0 && across <= band.width : across > 0 && across < band.width;
        const cutHere = band.segments?.find((segment) => segment.cut && across >= segment.from && across <= segment.to && along > segment.front);
        const age = band.front - along;
        if (!inside || cutHere || age < 0 || age > span) continue;
        const life = 1 - age / span;
        flash.fillStyle(style.body, 0.24 * life);
        flash.fillRect(x - grid / 2, y - grid / 2, grid, grid);
        flash.lineStyle(2, style.edge, 0.95 * life);
        flash.strokeRect(x - grid / 2, y - grid / 2, grid, grid);
      }
    }
    this.surgeStatus?.setText(warn ? "uyarı" : progress >= 1 ? "geçti" : `geçiş %${Math.round(progress * 100)}`);
  }

  /** Mac sonu sayfasinin haritasi: karsi atak sayfasiyla ayni olcu (375 px'te hucre ~26 birim). */
  private endingGrid() {
    const width = this.cameras.main.width / this.cameras.main.zoom;
    const grid = Math.max(12, Math.floor(Math.min((width - 16) / SURGE_COLS, (this.worldHeight - HEADER - FOOTER - 8) / SURGE_ROWS)));
    return { grid, x: Math.round((width - SURGE_COLS * grid) / 2), y: HEADER + 4 };
  }

  /**
   * Mac sonu sayfasi: harita, kuleler, duvarlar, nexus ve kalan dusmanlar;
   * sahne hemen basliyor. Satirin suresi manifestten (galeride ATLAS yok).
   */
  private buildEndingPage() {
    const stage = this.endingStage;
    const board = this.surgeBoard;
    if (!stage || !board) return;
    const kind: MatchEndKind = this.endingPage === 0 ? "defeat" : "victory";
    const { grid, x, y } = this.endingGrid();
    this.surgeGrid = grid;
    board.fillStyle(0x0b1220, 1);
    board.fillRect(x, y, SURGE_COLS * grid, SURGE_ROWS * grid);
    board.lineStyle(1, 0x1e293b, 0.9);
    for (let col = 0; col <= SURGE_COLS; col += 1) board.lineBetween(x + col * grid, y, x + col * grid, y + SURGE_ROWS * grid);
    for (let row = 0; row <= SURGE_ROWS; row += 1) board.lineBetween(x, y + row * grid, x + SURGE_COLS * grid, y + row * grid);
    board.lineStyle(2, 0xb45454, 0.85);
    board.lineBetween(x, y, x + SURGE_COLS * grid, y);
    board.lineStyle(2, 0x4f9a6c, 0.85);
    board.lineBetween(x, y + SURGE_ROWS * grid, x + SURGE_COLS * grid, y + SURGE_ROWS * grid);
    const nexus = { x: x + ENDING_NEXUS[0] * grid, y: y + ENDING_NEXUS[1] * grid };
    // Nexus: koyu govde, soguk kenar.
    board.fillStyle(0x111827, 1);
    board.fillCircle(nexus.x, nexus.y, grid * 0.95);
    board.lineStyle(2, MATCH_END_COLD, 0.9);
    board.strokeCircle(nexus.x, nexus.y, grid * 0.95);
    board.lineStyle(1, 0x94a3b8, 0.6);
    board.strokeCircle(nexus.x, nexus.y, grid * 0.55);

    const ids = [...new Set(getGalleryRows().map((row) => row.definitionId))];
    const structures: MatchEndStructure[] = [];
    ENDING_TOWERS.forEach(([col, row], index) => {
      const id = `end-t${index}`;
      const definitionId = ids[index % ids.length];
      const key = this.textures.exists(`tower-${definitionId}`) ? `tower-${definitionId}` : "projectile-tower";
      const px = x + (col + 0.5) * grid;
      const py = y + (row + 0.5) * grid;
      const sprite = this.add.image(px, py, key).setDepth(12).setDisplaySize(grid * 1.05, grid * 1.05);
      this.endingTowerSprites.set(id, sprite);
      structures.push({ id, x: px, y: py, size: grid });
    });
    ENDING_WALLS.forEach(([col, row, horizontal], index) => {
      const px = x + (col + (horizontal ? 0.5 : 0)) * grid;
      const py = y + (row + (horizontal ? 0 : 0.5)) * grid;
      structures.push({ id: `end-w${index}`, x: px, y: py, size: grid, wall: true });
    });
    this.endingStructures = structures;
    const enemies = ENDING_ENEMIES.map(([col, row], index) => {
      const id = `end-e${index}`;
      const ex = x + col * grid;
      const ey = y + row * grid;
      this.endingEnemySprites.set(id, this.add.image(ex, ey, "enemy-grunt").setDepth(8).setDisplaySize(grid * 0.95, grid * 0.95));
      return { id, x: ex, y: ey, size: grid * 0.95 };
    });
    const line = kind === "defeat" ? "audio/atlas/death/death-01.mp3" : "audio/atlas/ending/ending-03.mp3";
    const seconds = ATLAS_FINAL_LINE_SECONDS[line];
    const label = kind === "defeat" ? "Yenilgi · yapılar nexus'tan dışarı" : "Zafer · Sevkiyat kalkışı";
    this.labels.push(this.add.text(6, 6, label, { fontFamily: "Rajdhani, sans-serif", fontSize: "13px", color: "#f8fafc", fontStyle: "bold" }).setDepth(30));
    this.endingStatus = this.add.text(6, 22, "", { fontFamily: "Rajdhani, sans-serif", fontSize: "11px", color: "#94a3b8" }).setDepth(30);
    this.labels.push(this.endingStatus);
    this.endingReportText = this.add.text(x + (SURGE_COLS * grid) / 2, y + (SURGE_ROWS * grid) / 2, "KOŞU RAPORU", {
      fontFamily: "Rajdhani, sans-serif", fontSize: "18px", color: "#e2e8f0", fontStyle: "bold", backgroundColor: "#020617e6", padding: { x: 14, y: 8 }
    }).setOrigin(0.5).setDepth(40).setVisible(false);
    this.labels.push(this.endingReportText);
    // Gec cipi alt cubugun ustunde; cubuk katmanin ustunde kalsin.
    document.documentElement.style.setProperty("--match-end-skip-bottom", `${(this.controls?.offsetHeight || FOOTER) + 8}px`);
    if (this.controls) this.controls.style.zIndex = "90";
    this.endingReportAt = undefined;
    stage.play({
      kind,
      structures,
      nexus,
      nexusSize: grid * 2,
      enemies: kind === "victory" ? enemies : [],
      skyY: y - grid * 4,
      cameraEase: true,
      now: this.now,
      speak: () => seconds,
      openReport: () => {
        this.endingReportAt = this.now;
      }
    });
  }

  private clearEndingPage() {
    this.endingStage?.reset();
    for (const sprite of this.endingTowerSprites.values()) sprite.destroy();
    for (const sprite of this.endingEnemySprites.values()) sprite.destroy();
    this.endingTowerSprites.clear();
    this.endingEnemySprites.clear();
    this.endingStructures = [];
    this.endingWalls?.clear();
    this.endingReportAt = undefined;
    this.endingReportText = undefined;
    this.endingStatus = undefined;
    if (this.controls) this.controls.style.zIndex = "50";
  }

  /** Mac sonu sayfasinin karesi: sahne, yapilarin hali, duvarlar ve rapor yeri; bitince yeniden. */
  private renderEndingPage() {
    const stage = this.endingStage;
    if (!stage) return;
    stage.update(this.now);
    this.flashPool?.update(this.now);
    for (const [id, sprite] of this.endingTowerSprites) {
      const state = stage.structureState(id);
      sprite.setTint(state === "husk" ? MATCH_END_HUSK_TINT : state === "dim" ? MATCH_END_POWERED_DOWN_TINT : 0xffffff);
      sprite.setAlpha(state === "husk" ? 0.92 : state === "dim" ? 0.72 : 1);
    }
    for (const [id, sprite] of this.endingEnemySprites) sprite.setAlpha(stage.enemyAlpha(id));
    const walls = this.endingWalls;
    if (walls) {
      walls.clear();
      const grid = this.surgeGrid;
      ENDING_WALLS.forEach(([, , horizontal], index) => {
        const wall = this.endingStructures.find((entry) => entry.id === `end-w${index}`);
        const state = stage.structureState(`end-w${index}`);
        if (!wall || state === "husk") return;
        const half = grid / 2;
        const [x1, y1, x2, y2] = horizontal ? [wall.x - half, wall.y, wall.x + half, wall.y] : [wall.x, wall.y - half, wall.x, wall.y + half];
        walls.lineStyle(5, 0x1f2937, 1);
        walls.lineBetween(x1, y1, x2, y2);
        walls.lineStyle(2, state === "dim" ? MATCH_END_POWERED_DOWN_TINT : 0x94a3b8, 1);
        walls.lineBetween(x1, y1, x2, y2);
      });
    }
    const sequence = stage.current;
    const plan = sequence?.schedule;
    if (plan && sequence) {
      const elapsed = sequence.elapsed(this.now);
      this.endingStatus?.setText(`${(Math.min(elapsed, plan.reportAtMs) / 1000).toFixed(1)} / ${(plan.reportAtMs / 1000).toFixed(1)} sn · satır ${(plan.durationMs / 1000).toFixed(1)} sn · aralık ${plan.gapMs} ms · ${plan.steps.length - 1} adım`);
    }
    if (this.endingReportAt !== undefined) {
      this.endingReportText?.setVisible(true);
      if (this.now - this.endingReportAt >= ENDING_REPORT_HOLD_MS) this.buildScene();
    }
  }

  private refreshControls() {
    const bar = this.controls;
    if (!bar) return;
    const set = (id: string, active: boolean, label?: string) => {
      const element = bar.querySelector<HTMLElement>(`[data-vfx="${id}"]`);
      if (!element) return;
      if (label) element.textContent = label;
      element.style.background = active ? "#0e7490" : "#0f172a";
    };
    const page = bar.querySelector<HTMLElement>('[data-vfx="page"]');
    if (page) page.textContent = this.mode === "grid" ? `${this.page + 1} / ${this.pageCount}` : this.mode === "surge" ? `${this.surgePage + 1} / ${SURGE_PAGES.length}` : this.mode === "races" ? `${this.racePage + 1} / ${this.raceGallery?.pageCount ?? 1}` : this.mode === "ending" ? `${this.endingPage + 1} / 2` : this.mode === "legendary" ? `${this.legendaryPage + 1} / ${this.legendaryGallery?.pageCount ?? 1}` : "—";
    set("slow", this.slow);
    set("pause", this.paused, this.paused ? "Oynat" : "Duraklat");
    set("mate", this.teammate);
    set("stress", this.mode === "stress");
    set("surge", this.mode === "surge");
    set("races", this.mode === "races");
    set("ending", this.mode === "ending");
    set("legendary", this.mode === "legendary");
    set("mute", this.muted, this.muted ? "Sessiz" : "Ses açık");
  }
}

/**
 * Olay ya da isin kimligi bu galeri kulesinin mi. Kule kimligi kimligin
 * icinde bir tireyle (ya da sonla) bitmeli: "g-warrior-6-1" sv 10'un
 * "g-warrior-6-10-p3" kimligiyle eslesmemeli.
 */
function belongsToTower(key: string, towerId: string) {
  let index = key.indexOf(towerId);
  while (index >= 0) {
    const before = index === 0 ? "-" : key[index - 1];
    const after = key[index + towerId.length];
    if (before === "-" && (after === undefined || after === "-")) return true;
    index = key.indexOf(towerId, index + 1);
  }
  return false;
}

/**
 * Sira halinde dusmanlar: ayni periyot ve fazda, yalnizca dikey salinan,
 * yatay bir hatta (delinecek, Gosteri'nin hattinda yanacak). Indisleri doner.
 */
function spawnLineup(walkers: ScenarioWalker[], key: string, startX: number, y: number, count: number, row: number, column: number, spacing = 16) {
  const indices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    indices.push(walkers.length);
    walkers.push({ id: `w-${key}-${index}`, cx: startX + index * spacing, cy: y, rx: 0, ry: 11, periodMs: 3600, phase: row * 0.7 + column * 1.9 });
  }
  return indices;
}

/** Zeynep sahnesinin hucresi: kule, dusmanlar ve (gerekirse) yan yapilar. */
function createCourtCell(entry: GalleryRow, level: number, cellX: number, y: number, rowTop: number, row: number, column: number, walkers: ScenarioWalker[]): ScenarioTower {
  const key = `${entry.key}-${level}`;
  const base: ScenarioTower = {
    id: `g-${key}`,
    definitionId: entry.definitionId,
    level,
    x: cellX + 28,
    y,
    color: getScenarioColor(entry.definitionId),
    own: true,
    walker: 0,
    intervalMs: getScenarioIntervalMs(entry.definitionId),
    court: entry.court
  };
  switch (entry.court) {
    case "pierce": {
      const line = spawnLineup(walkers, key, cellX + 66, y, 3, row, column);
      return { ...base, walker: line[0], walkers: line, intervalMs: 1000 };
    }
    case "lances": {
      const first = walkers.length;
      walkers.push({ id: `w-${key}-0`, cx: cellX + 82, cy: y - 4, rx: 10, ry: 9, periodMs: 3400, phase: row + column });
      walkers.push({ id: `w-${key}-1`, cx: cellX + 100, cy: y + 14, rx: 8, ry: 6, periodMs: 3000, phase: row * 2 + column });
      return { ...base, walker: first, walkers: [first, first + 1], intervalMs: 1300 };
    }
    case "ray": {
      const first = walkers.length;
      walkers.push({ id: `w-${key}-0`, cx: cellX + 66, cy: y + 20, rx: 10, ry: 3, periodMs: 3200, phase: row + column });
      return { ...base, walker: first, walkers: [first], intervalMs: 1400, bounds: { left: cellX + 4, right: cellX + COLUMN_WIDTH - 4, top: rowTop + 16, bottom: rowTop + ROW_HEIGHT - 2 } };
    }
    case "burn": {
      const line = spawnLineup(walkers, key, cellX + 62, y, 3, row, column);
      return { ...base, walker: line[1], walkers: line, intervalMs: 4200 };
    }
    case "kin-showcase": {
      const first = walkers.length;
      walkers.push({ id: `w-${key}-0`, cx: cellX + 66, cy: y - 10, rx: 4, ry: 5, periodMs: 3000, phase: row + column });
      walkers.push({ id: `w-${key}-1`, cx: cellX + 84, cy: y + 4, rx: 4, ry: 6, periodMs: 3400, phase: row + column + 1 });
      walkers.push({ id: `w-${key}-2`, cx: cellX + 96, cy: y - 6, rx: 3, ry: 5, periodMs: 3800, phase: row + column + 2 });
      return { ...base, walker: first + 1, walkers: [first, first + 1, first + 2], intervalMs: 1600 };
    }
    case "kin": {
      // Yakin, orta, uzak: menzil 88 icinde ucte bir dilimler (1/2/3 serit).
      const line = spawnLineup(walkers, key, cellX + 28 + 22, y, 3, row, column, 26);
      return { ...base, walker: line[1], walkers: line, displayRange: 88 };
    }
    case "abarti": {
      const line = spawnLineup(walkers, key, cellX + 84, y, 2, row, column);
      return { ...base, x: cellX + 46, walker: line[0], walkers: line, intervalMs: 1100, anchor: { x: cellX + 14, y } };
    }
    default:
      return base;
  }
}

function levelToTier(level: number) {
  return level >= 10 ? 3 : level >= 5 ? 2 : 1;
}

/** Oyunun kayitli seviyesi; okunamazsa ya da sifirsa varsayilan. */
function readGalleryVolume(key: string, fallback: number) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.min(1, value) : fallback;
  } catch {
    return fallback;
  }
}

function tierCss(tower: ScenarioTower) {
  const tier = tower.level >= 10 ? 3 : tower.level >= 5 ? 2 : 1;
  const color = getVfxProfile(tower.definitionId, tower.color).ramp[tier - 1];
  return `#${color.toString(16).padStart(6, "0")}`;
}
