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

type Mode = "grid" | "stress";

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
    this.createControls();
    this.buildScene();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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
    if (this.mode !== "grid") return;
    this.page = (this.page + delta + this.pageCount) % this.pageCount;
    this.buildScene();
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
    if (page) page.textContent = this.mode === "grid" ? `${this.page + 1} / ${this.pageCount}` : "—";
    set("slow", this.slow);
    set("pause", this.paused, this.paused ? "Oynat" : "Duraklat");
    set("mate", this.teammate);
    set("stress", this.mode === "stress");
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
