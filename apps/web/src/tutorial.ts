import type Phaser from "phaser";
import {
  AMMO_RECIPES,
  REPAIR_DEPOT_TOWER_ID,
  RESOURCE_NAMES,
  RESOURCE_NAMES_EN,
  WALL_TOWER_ID,
  towerCatalog,
  type AmmoType,
  type ResourceKind,
  type TransportProduct,
  type TutorialPrepareId,
  type TutorialProgressMessage
} from "@karayel/shared";
import { getLocale, onLocaleChange, t } from "./i18n";
import { formatTransportProduct } from "./worker-roster";

/**
 * Ogretici asamasi (Eğitim): butun mekanikleri sirayla gosteren adim motoru.
 *
 * Ana menudeki "Eğitim" ayri bir mac aciyor (`tutorial` bayrakli tek kisilik
 * oda, sabit operator ZentaX): nexus olmuyor, dusmanlar tek tuk ve cok yavas.
 * Her adimda ilgili dugme cerceveleniyor, yaninda kisa bir komuta metni
 * duruyor; oyuncu o isi yapinca sonraki adima geciliyor. Bilgi adimlarinda
 * ANLADIM, her adimda GEÇ var. Son adimdan sonra sunucuya `tutorial:complete`
 * gidiyor ve mac kisa bir zaferle kapaniyor (ilerleme yazilmiyor).
 *
 * "Yapildi" bilgisi sunucudan geliyor (`tutorial:progress`): sunucu izlenen
 * istegin gercekten is yapip yapmadigini olcuyor, reddedilen istek adimi
 * gecirmiyor. Sahne mesaji `game:tutorial-progress` olarak yayinliyor;
 * motorun istekleri (`prepare`, `continue`, `complete`) `game:tutorial-command`
 * ile sahneye gidiyor. Normal maclarda motor hic gorunmuyor.
 */

export const TUTORIAL_STEPS = [
  "tower",
  "wall",
  "settings",
  "energy",
  "workerTypes",
  "hire",
  "assign",
  "depot",
  "armory",
  "production",
  // Muhimmat zinciri: yatak -> toplayici -> depo -> tasiyici -> cephanelik -> tasiyici -> kule.
  "chain",
  "gatherer",
  "materials",
  "ammoCarrier",
  "delivery",
  "repairDepot",
  "repairer",
  "xpGold",
  "upgrade",
  "workerTree",
  "card",
  "shop",
  "skill",
  "ultimate"
] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

/** Yalnizca okunup ANLADIM ile gecilen bilgi adimlari. */
export const TUTORIAL_ACK_STEPS: readonly TutorialStepId[] = ["workerTypes", "chain", "xpGold", "delivery"];

/**
 * Birden fazla sayfali bilgi adimlari: tek metin 170 karaktere sigmiyor.
 * Son sayfadan once dugme İLERİ, son sayfada ANLADIM.
 */
export const TUTORIAL_PAGES: Readonly<Partial<Record<TutorialStepId, number>>> = { chain: 2, delivery: 2 };

export function getTutorialPageCount(id: TutorialStepId) {
  return TUTORIAL_PAGES[id] ?? 1;
}

/** Ilk kule kurulunca kurulum bitiyor (Devam): dusmanlar yavasca gelmeye basliyor. */
export const TUTORIAL_COMBAT_STEP: TutorialStepId = "tower";

/** Menudeki tek seferlik "Öğreticiyi oyna" kartinin cihazdaki kaydi. */
export const TUTORIAL_OFFER_STORAGE_KEY = "uzay_tutorial_offer_v1";

/** `page`: cok sayfali bilgi adiminda acik sayfa (yoksa 0). */
export type TutorialRun = { step: number; done: boolean; page?: number };

/**
 * Oyunun o anki hali (sahne snapshot'tan kuruyor, `tutorialFacts`). Hedefi
 * zaten saglanmis adim (depo onceden kurulmus, tamirci zaten var...) etkin
 * olur olmaz sessizce geciliyor: oyuncu ayni seyi ikinci kez yapmak zorunda
 * kalmiyor. Yalnizca eylemle anlasilan adimlar (ayar, uretim, kart, alim,
 * beceri, ulti) icin durum yok.
 */
export type TutorialFacts = {
  /** Oyuncunun ayakta duran yapilarinin tanim kimlikleri. */
  definitionIds: readonly string[];
  /** Seviyesi 1'in ustunde bir yapisi var mi. */
  upgraded: boolean;
  /** Alinmis isci sayisi. */
  hired: number;
  /** Elle atanmis isci sayisi. */
  manualAssignments: number;
  /** Onarim (tamirci) iscisi sayisi. */
  repairers: number;
  /** Isci agacinda acilmis gelistirme sayisi. */
  treeUnlocks: number;
  /** Oyuncunun cephaneliginin urettigi muhimmat (cephanelik yoksa yok). */
  production?: AmmoType;
  /** Oyuncunun iscileri: rol (sunucu modu), elle mi atandi ve isi. */
  workers?: readonly TutorialWorkerFact[];
  /** Elle atanmis bir cephane tasiyicisi bir kuleye teslimat yapti mi. */
  ammoDelivered?: boolean;
};

export type TutorialWorkerFact = {
  /** Sunucunun isci modu: "crystalCollector" (Toplama), "energyTransport" (Taşıma), "repairer". */
  mode: string;
  manual: boolean;
  /** Toplayicinin atandigi yatagin turu. */
  nodeKind?: ResourceKind;
  /** Tasiyicinin urunu. */
  product?: TransportProduct;
  /** Tasiyicinin atandigi binanin tanim kimligi. */
  sourceDefinitionId?: string;
};

/** Motorun girdisi: sunucunun olcumu, oyunun hali, ANLADIM ya da GEÇ. */
export type TutorialSignal =
  | { kind: "progress"; progress: TutorialProgressMessage }
  | { kind: "state"; facts: TutorialFacts }
  | { kind: "ack" }
  | { kind: "skip" };

export function createTutorialRun(): TutorialRun {
  return { step: 0, done: false };
}

/** Yeniden yuklemede kaldigi adim: oda kimligiyle birlikte (cihazda). */
export const TUTORIAL_RUN_STORAGE_KEY = "uzay_tutorial_run_v1";

/**
 * Kayitli adim ayni odanin kaydiysa oradan, degilse bastan. Menuden acilan
 * her ogretici yeni bir oda, yani hep 1. adimdan basliyor. Saf.
 */
export function restoreTutorialRun(saved: unknown, roomId: string | undefined): TutorialRun {
  if (!roomId || typeof saved !== "object" || saved === null) return createTutorialRun();
  const record = saved as { roomId?: unknown; step?: unknown };
  if (record.roomId !== roomId || !Number.isInteger(record.step)) return createTutorialRun();
  const step = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, record.step as number));
  return { step, done: false };
}

export type TutorialBuildKind = "tower" | "wall" | "energy" | "armory" | "depot" | "repairDepot";

const definitionById = new Map(Object.values(towerCatalog).flat().map((definition) => [definition.id, definition]));

/** Kurulan yapinin ogreticideki turu; bilinmeyen kimlik hasar kulesi sayiliyor. */
export function classifyTutorialBuild(definitionId: string): TutorialBuildKind {
  if (definitionId === WALL_TOWER_ID) return "wall";
  if (definitionId === REPAIR_DEPOT_TOWER_ID) return "repairDepot";
  if (definitionId === "warehouse-1") return "depot";
  const provider = definitionById.get(definitionId)?.resourceProvider;
  if (provider === "energy") return "energy";
  if (provider === "ammunition") return "armory";
  return "tower";
}

const BUILD_STEPS: Partial<Record<TutorialStepId, TutorialBuildKind>> = {
  tower: "tower",
  wall: "wall",
  energy: "energy",
  depot: "depot",
  armory: "armory",
  repairDepot: "repairDepot"
};

/** Sunucunun bu olcumu adimi tamamliyor mu. Saf. */
export function isTutorialStepCompletedBy(id: TutorialStepId, progress: TutorialProgressMessage): boolean {
  const build = BUILD_STEPS[id];
  if (build) {
    return progress.action === "build" && (progress.definitionIds ?? []).some((definitionId) => classifyTutorialBuild(definitionId) === build);
  }
  switch (id) {
    case "settings":
      return progress.action === "settings";
    case "hire":
      return progress.action === "hire" || progress.action === "specialize";
    case "assign":
      return progress.action === "assign";
    case "production":
      return progress.action === "production";
    case "repairer":
      // Onarim uzmani alindi ya da bir tamirci merkeze atandi; altinla onarim da gosteriyor.
      return progress.action === "repair"
        || ((progress.action === "hire" || progress.action === "specialize" || progress.action === "assign") && progress.role === "repairer");
    case "upgrade":
      return progress.action === "upgrade";
    case "workerTree":
      return progress.action === "workerTree";
    case "card":
      return progress.action === "card";
    case "shop":
      return progress.action === "shop";
    case "skill":
      return progress.action === "skill";
    case "ultimate":
      return progress.action === "ultimate";
    default:
      return false;
  }
}

/** Oyunun hali adimin hedefini zaten sagliyor mu. Saf. */
export function isTutorialStepSatisfied(id: TutorialStepId, facts: TutorialFacts): boolean {
  const build = BUILD_STEPS[id];
  if (build) return facts.definitionIds.some((definitionId) => classifyTutorialBuild(definitionId) === build);
  switch (id) {
    case "hire":
      return facts.hired > 0;
    case "assign":
      return facts.manualAssignments > 0;
    case "repairer":
      return facts.repairers > 0;
    case "upgrade":
      return facts.upgraded;
    case "workerTree":
      return facts.treeUnlocks > 0;
    case "gatherer": {
      const material = getTutorialMaterial(facts);
      return Boolean(facts.production) && (facts.workers ?? []).some((worker) => worker.mode === "crystalCollector" && worker.manual && worker.nodeKind === material);
    }
    case "materials":
      return (facts.workers ?? []).some((worker) => isArmoryCarrier(worker, "materials"));
    case "ammoCarrier":
      return Boolean(facts.production) && (facts.workers ?? []).some((worker) => isArmoryCarrier(worker, facts.production!));
    default:
      return false;
  }
}

/** Elle cephaneye (Cephane Divanı gibi) bu urunle atanmis tasiyici. */
function isArmoryCarrier(worker: TutorialWorkerFact, product: TransportProduct) {
  return worker.mode === "energyTransport" && worker.manual && worker.product === product
    && worker.sourceDefinitionId !== undefined && classifyTutorialBuild(worker.sourceDefinitionId) === "armory";
}

/** Cephaneligin uretimi; cephanelik yoksa (adim gecildi) varsayilan projektil. */
export function getTutorialProduction(facts: TutorialFacts | undefined): AmmoType {
  return facts?.production ?? "bullet";
}

/** Uretimin tarifindeki hammadde (projektil -> barut...). */
export function getTutorialMaterial(facts: TutorialFacts | undefined): ResourceKind {
  return AMMO_RECIPES[getTutorialProduction(facts)];
}

/**
 * Tasiyici adiminda bosta Taşıma iscisi yok mu. Bosta: elle bir ise atanmamis.
 * Elle enerjiye atanmis tasiyici yoksa otomatik enerji tasiyan biri enerjide
 * kalmali (onu alan oyuncu cephaneligi ve kuleleri enerjisiz birakir), o
 * bosta sayilmiyor. Bosta yoksa adim once isci aldiriyor (İşe Al cercevede).
 */
export function tutorialNeedsCarrierHire(id: TutorialStepId, facts: TutorialFacts | undefined) {
  if (id !== "materials" && id !== "ammoCarrier") return false;
  const carriers = (facts?.workers ?? []).filter((worker) => worker.mode === "energyTransport");
  const auto = carriers.filter((worker) => !worker.manual);
  const energyCovered = carriers.some((worker) => worker.manual && worker.product === "energy");
  const autoOnEnergy = auto.some((worker) => worker.product === undefined || worker.product === "energy");
  return auto.length - (!energyCovered && autoOnEnergy ? 1 : 0) <= 0;
}

/** Teslimat adiminin ANLADIM'i: ilk teslimat goruldu. */
export function isTutorialDeliveryReady(facts: TutorialFacts | undefined) {
  return facts?.ammoDelivered === true;
}

/** Adimi ilerletir. Saf: ayni girdi ayni cikti. */
export function advanceTutorial(run: TutorialRun, signal: TutorialSignal): TutorialRun {
  if (run.done) return run;
  const id = TUTORIAL_STEPS[run.step];
  const next = (): TutorialRun => ({ step: run.step + 1, done: run.step + 1 >= TUTORIAL_STEPS.length });
  if (!id) return { ...run, done: true };
  switch (signal.kind) {
    case "skip":
      return next();
    case "ack": {
      if (!TUTORIAL_ACK_STEPS.includes(id)) return run;
      const page = run.page ?? 0;
      return page + 1 < getTutorialPageCount(id) ? { ...run, page: page + 1 } : next();
    }
    case "progress":
      return isTutorialStepCompletedBy(id, signal.progress) ? next() : run;
    case "state":
      return isTutorialStepSatisfied(id, signal.facts) ? next() : run;
    default:
      return run;
  }
}

/** Adima girerken sunucudan istenen hazirlik; her adim en az kaynak tabani ister. */
export function getTutorialStepPrepare(id: TutorialStepId): TutorialPrepareId {
  switch (id) {
    case "card":
      return "cards";
    case "shop":
      return "shop";
    case "skill":
      return "skill";
    case "ultimate":
      return "ultimate";
    default:
      return "resources";
  }
}

/**
 * Adimin cercevelenecek hedefleri, derinden yuzeye: ekranda gorunen ilki
 * seciliyor. Cekmece kapaliysa baslatici, acik ama baska bolumdeyse bolum
 * dugmesi, dogru bolumdeyse asil dugme. Saticilar `game-control-ui.ts`te
 * (`data-launch`, `data-worker-tab`, sinif adlari).
 */
export const TUTORIAL_TARGETS: Readonly<Record<TutorialStepId, readonly string[]>> = {
  tower: [".game-controls__tower-grid", '[data-launch="towers"]'],
  wall: [".game-controls__tower-grid", '[data-launch="towers"]'],
  // Ayarlar kule panelinin "Ayarlar" bolumunde; kaydirilmadiysa panelin kendisi.
  settings: [".ts-section--controls", ".tower-sheet"],
  energy: [".game-controls__tower-grid", '[data-launch="towers"]'],
  workerTypes: ['[data-launch="worker"]'],
  hire: [".game-controls__worker-hire", '[data-worker-tab="hire"]', '[data-launch="worker"]'],
  assign: [".game-controls__drawer.worker-pick", ".worker-list", '[data-worker-tab="manage"]', '[data-launch="worker"]'],
  depot: [".game-controls__tower-grid", '[data-launch="towers"]'],
  armory: [".game-controls__tower-grid", '[data-launch="towers"]'],
  production: [".ts-section--controls", ".tower-sheet"],
  chain: ['[data-launch="worker"]'],
  // Toplayici: Yonetim'de Toplama satiri, sonra haritada yatak (secim seridi).
  gatherer: [".game-controls__drawer.worker-pick", ".worker-row--gatherer", '[data-worker-tab="manage"]', '[data-launch="worker"]'],
  // Tasiyici satirlarindan hangisinin bosta oldugu satirda yazmiyor: liste butun olarak.
  materials: ['[data-worker-product="materials"]:not(.is-active)', ".game-controls__drawer.worker-pick", ".worker-list", '[data-worker-tab="manage"]', '[data-launch="worker"]'],
  // Urune ozel dugme `getTutorialTargets`ta en basa ekleniyor.
  ammoCarrier: [".game-controls__drawer.worker-pick", ".worker-list", '[data-worker-tab="manage"]', '[data-launch="worker"]'],
  delivery: ['.ts-bar[data-key="ammo"]', ".ts-stock", ".tower-sheet"],
  repairDepot: [".game-controls__tower-grid", '[data-launch="towers"]'],
  repairer: [".game-controls__worker-hire", '[data-worker-tab="hire"]', '[data-launch="worker"]'],
  // Tecrube Detay panelinde; panel kapaliysa ust seritteki altin.
  xpGold: [".game-hud__chip--xp", ".game-hud__vital--gold"],
  upgrade: [".game-controls__action--upgrade", ".tower-sheet"],
  workerTree: [".worker-development__viewport", '[data-worker-tab="tree"]', '[data-launch="worker"]'],
  card: [],
  shop: [".gold-shop:not(.inventory) .gold-shop__actions"],
  skill: [".game-controls__skills", '[data-launch="skills"]'],
  ultimate: [".game-controls__action--ultimate", '[data-launch="skills"]']
};

/**
 * O anki hedef zinciri: tasiyici adiminda bosta tasiyici yoksa İşe Al;
 * cephane tasiyicisinda uretimin urun dugmesi en basta; teslimat geldiyse
 * once cephaneligin stok blogu.
 */
export function getTutorialTargets(id: TutorialStepId, facts: TutorialFacts | undefined): readonly string[] {
  if (tutorialNeedsCarrierHire(id, facts)) return TUTORIAL_TARGETS.hire;
  if (id === "ammoCarrier") return [`[data-worker-product="${getTutorialProduction(facts)}"]:not(.is-active)`, ...TUTORIAL_TARGETS.ammoCarrier];
  if (id === "delivery" && isTutorialDeliveryReady(facts)) return [".ts-stock", '.ts-bar[data-key="ammo"]', ".tower-sheet"];
  return TUTORIAL_TARGETS[id];
}

/** Ilk gorunen hedef; hicbiri yoksa yok. Saf (gorunurluk disaridan). */
export function pickTutorialTarget<T>(selectors: readonly string[], find: (selector: string) => T | undefined): { selector: string; element: T } | undefined {
  for (const selector of selectors) {
    const element = find(selector);
    if (element !== undefined) return { selector, element };
  }
  return undefined;
}

export type TutorialCopy = { title: string; body: string; ack?: string; reopen?: string };

/** Hammaddenin adi, secili dilde (kule panelinin stok blogu da boyle yaziyor). */
function materialName(kind: ResourceKind) {
  return (getLocale() === "tr" ? RESOURCE_NAMES : RESOURCE_NAMES_EN)[kind];
}

/**
 * Kutunun metni. `windowOpen`: kart ve magaza adiminda pencere ekranda mi;
 * kapaliysa kutu onu yeniden acan bir dugme gosteriyor. `context`: cok
 * sayfali adimin sayfasi ve muhimmat zinciri adimlarinin okudugu oyun hali
 * (uretilen muhimmat, hammaddesi, bosta tasiyici, ilk teslimat).
 */
export function getTutorialCopy(id: TutorialStepId, windowOpen = true, context: { page?: number; facts?: TutorialFacts } = {}): TutorialCopy {
  const facts = context.facts;
  // {ammo}: cephaneligin uretim secicisindeki ad; {product}: tasiyicinin urun dugmesindeki ad (ayni muhimmat).
  const params = { ammo: t(`controls.tower.production.${getTutorialProduction(facts)}`), product: formatTransportProduct(getTutorialProduction(facts)), material: materialName(getTutorialMaterial(facts)) };
  const page = Math.max(0, Math.min(getTutorialPageCount(id) - 1, context.page ?? 0));
  const copy: TutorialCopy = { title: t(`tutorial.${id}.title`), body: t(`tutorial.${id}.body`, params) };
  if (page === 1) copy.body = t(id === "delivery" ? "tutorial.delivery.body2" : "tutorial.chain.body2", params);
  if (tutorialNeedsCarrierHire(id, facts)) copy.body = t("tutorial.carrier.hire");
  if (TUTORIAL_ACK_STEPS.includes(id)) copy.ack = t(page + 1 < getTutorialPageCount(id) ? "tutorial.next" : "tutorial.ack");
  // Teslimat: ilk muhimmat kuleye varana dek bekleme metni, dugme yok (GEÇ var).
  if (id === "delivery" && !isTutorialDeliveryReady(facts)) {
    copy.body = t("tutorial.delivery.wait", params);
    delete copy.ack;
  }
  if ((id === "card" || id === "shop") && !windowOpen) copy.reopen = t(id === "card" ? "tutorial.card.reopen" : "tutorial.shop.reopen");
  return copy;
}

/** Kart adiminda kutunun ortmemesi gereken satir: Yenile dugmesi (kart perdesi, GameScene). */
export const TUTORIAL_CARD_AVOID_SELECTOR = ".card-draft__actions";

export type TutorialSpan = { top: number; bottom: number };

/**
 * Kutunun dikey yeri, kacinilacak satirlara gore.
 *
 * Sira: tercih edilen yer (alt kenar), kacinilan satirin hemen alti (sigarsa),
 * ekranin ust kenari. Hicbir aday ortusmesiz degilse en az ortusen. Saf:
 * testler ve kutu ayni fonksiyonu kullaniyor.
 */
export function pickTutorialBoxTop(options: { viewportHeight: number; boxHeight: number; preferred: number; avoid: readonly TutorialSpan[]; margin?: number }) {
  const margin = options.margin ?? 8;
  const { viewportHeight, boxHeight } = options;
  const clamp = (top: number) => Math.max(margin, Math.min(viewportHeight - boxHeight - margin, top));
  const avoid = options.avoid.filter((span) => span.bottom > span.top && span.bottom > 0 && span.top < viewportHeight);
  const overlap = (top: number) => avoid.reduce((sum, span) => sum + Math.max(0, Math.min(top + boxHeight, span.bottom + 6) - Math.max(top, span.top - 6)), 0);
  const candidates = [clamp(options.preferred)];
  for (const span of avoid) {
    if (span.bottom + 10 + boxHeight + margin <= viewportHeight) candidates.push(clamp(span.bottom + 10));
  }
  candidates.push(margin);
  let best = candidates[0];
  let bestOverlap = overlap(best);
  for (const top of candidates) {
    const value = overlap(top);
    if (value === 0) return top;
    if (value < bestOverlap) {
      best = top;
      bestOverlap = value;
    }
  }
  return best;
}

/**
 * Hic oynamamis oyuncu: asama acmamis, rekoru, arsivde karti/esyasi ve nisani
 * yok. Biri bile varsa oyuncu oyunu taniyor; teklif gosterilmiyor. Saf.
 */
export function isFreshPlayer(facts: { clearedStages: number; records: number; archiveEntries: number; badgesEarned: number }) {
  return facts.clearedStages === 0 && facts.records === 0 && facts.archiveEntries === 0 && facts.badgesEarned === 0;
}

/** Menudeki tek seferlik teklif: hic oynamamis oyuncuya, kapatilana dek. */
export function readTutorialOfferDismissed(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_OFFER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissTutorialOffer() {
  try {
    window.localStorage.setItem(TUTORIAL_OFFER_STORAGE_KEY, "1");
  } catch {
    // Depolama kapali (itch iframe'i, gizli pencere): teklif bu oturumda kalir.
  }
}

function readSavedTutorialRun(): unknown {
  try {
    const raw = window.localStorage.getItem(TUTORIAL_RUN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeSavedTutorialRun(roomId: string, run: TutorialRun) {
  try {
    if (run.done) window.localStorage.removeItem(TUTORIAL_RUN_STORAGE_KEY);
    else window.localStorage.setItem(TUTORIAL_RUN_STORAGE_KEY, JSON.stringify({ roomId, step: run.step }));
  } catch {
    // Depolama kapali: yeniden yuklemede ogretici 1. adimdan.
  }
}

/** Sahneye giden istek (`game:tutorial-command`). */
export type TutorialCommand =
  | { type: "prepare"; step: TutorialPrepareId }
  | { type: "continue" }
  | { type: "complete" }
  | { type: "closeShop" };

/**
 * Kart perdesi ya da magaza acikken, adim onlarin degilse kutu yine gorunuyor:
 * cerceve yok (hedef perdenin altinda), kutu alt kenarda ve perdenin dugme
 * satirini (Yenile / Mağazayı Kapat) ortmuyor. Saf.
 */
export function getTutorialOverlayAvoid(id: TutorialStepId, overlay: { cardOpen: boolean; shopOpen: boolean }): string | undefined {
  if (overlay.cardOpen && id !== "card") return TUTORIAL_CARD_AVOID_SELECTOR;
  if (overlay.shopOpen && id !== "shop") return TUTORIAL_SHOP_AVOID_SELECTOR;
  return undefined;
}

/** Magazanin Yenile / Mağazayı Kapat satiri. */
export const TUTORIAL_SHOP_AVOID_SELECTOR = ".gold-shop:not(.inventory) .gold-shop__actions";

type ControlsStateLike = {
  visible?: boolean;
  tutorial?: unknown;
  tutorialRoomId?: unknown;
  tutorialFacts?: TutorialFacts;
  goldShop?: unknown;
};

const TICK_MS = 250;
const DONE_BANNER_MS = 4200;

export function setupTutorial(game: Phaser.Game) {
  const root = document.createElement("div");
  root.id = "tutorial-root";
  root.className = "tutorial";
  root.hidden = true;
  root.innerHTML = `
    <div class="tutorial__frame" hidden></div>
    <section class="tutorial__box" role="dialog" aria-live="polite" hidden>
      <header class="tutorial__head">
        <span class="tutorial__tag"></span><span class="tutorial__count"></span>
        <button type="button" class="tutorial__skip"></button>
      </header>
      <strong class="tutorial__title"></strong>
      <p class="tutorial__body"></p>
      <div class="tutorial__actions" hidden>
        <button type="button" class="tutorial__ack"></button>
      </div>
    </section>`;
  document.body.append(root);

  const frame = root.querySelector<HTMLElement>(".tutorial__frame")!;
  const box = root.querySelector<HTMLElement>(".tutorial__box")!;
  const count = root.querySelector<HTMLElement>(".tutorial__count")!;
  const tag = root.querySelector<HTMLElement>(".tutorial__tag")!;
  const title = root.querySelector<HTMLElement>(".tutorial__title")!;
  const body = root.querySelector<HTMLElement>(".tutorial__body")!;
  const skip = root.querySelector<HTMLButtonElement>(".tutorial__skip")!;
  const ack = root.querySelector<HTMLButtonElement>(".tutorial__ack")!;
  const actions = root.querySelector<HTMLElement>(".tutorial__actions")!;

  let run = createTutorialRun();
  let controls: ControlsStateLike = { visible: false };
  let wasInMatch = false;
  let enteredStep = -1;
  let doneBannerUntil = 0;
  let renderedKey = "";
  let ackMode: "ack" | "reopen" | undefined;

  const command = (detail: TutorialCommand) => game.events.emit("game:tutorial-command", detail);
  const inTutorialMatch = () => Boolean(controls.visible) && controls.tutorial === true;

  const roomId = () => (typeof controls.tutorialRoomId === "string" ? controls.tutorialRoomId : undefined);

  /** Sinyali uygular; adim degistiyse true. Tikten cagrilinca yeniden tik yok. */
  const advance = (signal: TutorialSignal) => {
    if (!inTutorialMatch() || run.done) return false;
    const before = run;
    run = advanceTutorial(run, signal);
    if (run === before) return false;
    // Ayni adimda sonraki sayfa: yalnizca kutu yeniden yaziliyor.
    if (run.step === before.step) return run.page !== before.page && signal.kind === "ack";
    const leaving = TUTORIAL_STEPS[before.step];
    // Ilk kule: kurulum bitiyor, dusmanlar yavasca gelmeye basliyor.
    if (leaving === TUTORIAL_COMBAT_STEP) command({ type: "continue" });
    // Magaza adimi gecildi ama vitrin acik: kapaniyor, sonraki adimin kutusu ortulmesin.
    if (leaving === "shop" && controls.goldShop) command({ type: "closeShop" });
    const id = roomId();
    if (id) writeSavedTutorialRun(id, run);
    if (run.done) {
      doneBannerUntil = performance.now() + DONE_BANNER_MS;
      command({ type: "complete" });
    }
    return true;
  };

  const apply = (signal: TutorialSignal) => {
    if (advance(signal)) tick();
  };

  game.events.on("game:controls-state", (state: ControlsStateLike) => {
    controls = state ?? { visible: false };
  });
  game.events.on("game:tutorial-progress", (progress: TutorialProgressMessage) => {
    if (progress && typeof progress.action === "string") apply({ kind: "progress", progress });
  });

  skip.addEventListener("click", () => apply({ kind: "skip" }));
  ack.addEventListener("click", () => {
    if (ackMode === "reopen") {
      const id = TUTORIAL_STEPS[run.step];
      if (id) command({ type: "prepare", step: getTutorialStepPrepare(id) });
      return;
    }
    apply({ kind: "ack" });
  });

  const hide = () => {
    root.hidden = true;
    box.hidden = true;
    frame.hidden = true;
    renderedKey = "";
  };

  const measure = (element: Element | null | undefined) => {
    const bounds = element && element.getClientRects().length > 0 ? element.getBoundingClientRect() : undefined;
    return bounds && bounds.width > 0 && bounds.height > 0 ? bounds : undefined;
  };

  /** HUD'un alt kenari; ongoru satiri kokun disina tasiyor, o da sayiliyor. */
  const hudBottom = () => {
    let bottom = 0;
    for (const element of document.querySelectorAll("#game-hud-root, #game-hud-root .game-hud__forecast-line")) {
      bottom = Math.max(bottom, measure(element)?.bottom ?? 0);
    }
    return bottom || 64;
  };

  /**
   * Oge gercekten gorunuyor mu: ekranla ve kaydirilan her atasiyla kesisiyor.
   * Kule panelinin ayar satirlari kaydirilan govdenin altinda kalabiliyor;
   * orada olculebilir ama gorunmuyorlar, cerceve bos bir yere cizilirdi.
   */
  const isOnScreen = (element: HTMLElement) => {
    const rect = measure(element);
    if (!rect) return false;
    // Kapali <details> icindeki oge olculebiliyor ama ekranda yok (HUD'in Detay paneli).
    if (element.closest("details:not([open])") && !element.closest("summary")) return false;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    if (rect.bottom <= 0 || rect.top >= viewportHeight) return false;
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowY;
      if (overflow === "visible") continue;
      const clip = parent.getBoundingClientRect();
      if (rect.bottom <= clip.top || rect.top >= clip.bottom) return false;
    }
    return true;
  };

  const cardDraftOpen = () => Boolean(document.querySelector("#card-root.card-draft--visible"));

  /**
   * Adima gore cercevelenecek oge ve kutunun yeri.
   *
   * - Cekmece aciksa kutu cekmecenin tamamina yaslaniyor: icindeki dugmeye
   *   yaslaninca cekmecenin basligini ve kapatma dugmesini ortuyordu.
   * - HUD'daki hedefte kutu HUD'un ve ongoru satirinin altinda.
   * - Kart perdesi ekrani kapliyor: kutu alt kenarda, cerceve yok; Yenile
   *   satirini ortuyorsa ust kenara kaciyor (`avoid`).
   */
  const findTarget = (id: TutorialStepId): { element: HTMLElement | null; anchor?: HTMLElement | "hud" | "bottom"; avoid?: Element | null } => {
    if (id === "card") {
      // Cerceve yok, kutu alt kenarda; Yenile satirini ortmuyor.
      return { element: null, anchor: "bottom", avoid: document.querySelector(TUTORIAL_CARD_AVOID_SELECTOR) };
    }
    const picked = pickTutorialTarget(getTutorialTargets(id, controls.tutorialFacts), (selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element && isOnScreen(element) ? element : undefined;
    });
    const drawer = document.querySelector<HTMLElement>(".game-controls__drawer") ?? undefined;
    if (id === "xpGold" || id === "chain") return { element: picked?.element ?? null, anchor: "hud" };
    return { element: picked?.element ?? null, anchor: drawer && measure(drawer) ? drawer : undefined };
  };

  const place = (target: HTMLElement | null, anchor: HTMLElement | "hud" | "bottom" | undefined, avoid?: Element | null) => {
    const viewport = { width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight };
    const rect = anchor === "hud" || anchor === "bottom" ? undefined : measure(anchor) ?? measure(target);
    const framed = measure(target);
    if (framed) {
      frame.hidden = false;
      frame.style.transform = `translate(${Math.round(framed.left - 4)}px, ${Math.round(framed.top - 4)}px)`;
      frame.style.width = `${Math.round(framed.width + 8)}px`;
      frame.style.height = `${Math.round(framed.height + 8)}px`;
    } else {
      frame.hidden = true;
    }
    // Kutu hedefin bos kalan tarafinda.
    const boxHeight = box.offsetHeight || 120;
    let top: number;
    if (anchor === "bottom") {
      top = viewport.height - boxHeight - 12;
    } else if (!rect) {
      top = Math.min(hudBottom() + 10, viewport.height - boxHeight - 12);
    } else if (rect.top > viewport.height - rect.bottom) {
      top = Math.max(8, rect.top - boxHeight - 14);
    } else {
      top = Math.min(viewport.height - boxHeight - 8, rect.bottom + 14);
    }
    const avoidRect = avoid ? measure(avoid) : undefined;
    if (avoidRect) {
      top = pickTutorialBoxTop({ viewportHeight: viewport.height, boxHeight, preferred: top, avoid: [avoidRect] });
    }
    box.style.transform = `translateY(${Math.round(top)}px)`;
  };

  const render = (key: string, copy: TutorialCopy, stepNumber: number | undefined, target: HTMLElement | null, anchor?: HTMLElement | "hud" | "bottom", avoid?: Element | null) => {
    if (renderedKey !== key) {
      renderedKey = key;
      tag.textContent = t("tutorial.tag");
      count.textContent = stepNumber ? t("tutorial.count", { n: stepNumber, total: TUTORIAL_STEPS.length }) : t("tutorial.closed");
      skip.textContent = t("tutorial.skip");
      title.textContent = copy.title;
      body.textContent = copy.body;
      ackMode = copy.ack ? "ack" : copy.reopen ? "reopen" : undefined;
      actions.hidden = !ackMode;
      ack.textContent = copy.ack ?? copy.reopen ?? "";
      skip.hidden = stepNumber === undefined;
      root.hidden = false;
      box.hidden = false;
      // Kisa giris; hareket azaltmada CSS kapatiyor.
      box.classList.remove("tutorial__box--enter");
      void box.offsetWidth;
      box.classList.add("tutorial__box--enter");
    }
    place(target, anchor, avoid);
  };

  const tick = () => {
    const inMatch = inTutorialMatch();
    const now = performance.now();

    // Yeni ogretici maci: adim motoru bastan; ayni odaya donuste (yeniden
    // yukleme) kaldigi adimdan.
    if (inMatch && !wasInMatch) {
      run = restoreTutorialRun(readSavedTutorialRun(), roomId());
      enteredStep = -1;
      doneBannerUntil = 0;
      const id = roomId();
      if (id) writeSavedTutorialRun(id, run);
    }
    wasInMatch = inMatch;
    if (!inMatch) {
      hide();
      return;
    }

    if (run.done) {
      if (now < doneBannerUntil) {
        render("done", { title: t("tutorial.done.title"), body: t("tutorial.done.body") }, undefined, null, "hud");
      } else {
        hide();
      }
      return;
    }

    // Hedefi oyunun halinde zaten saglanan adimlar sessizce geciliyor (kutu
    // bir an bile cizilmiyor, hazirlik da istenmiyor).
    const facts = controls.tutorialFacts;
    if (facts) {
      for (let guard = 0; guard < TUTORIAL_STEPS.length && advance({ kind: "state", facts }); guard += 1) {
        // advance her turda bir adim geciyor.
      }
      if (run.done) {
        tick();
        return;
      }
    }

    const id = TUTORIAL_STEPS[run.step];
    // Adima giris: sunucudan hazirlik (kaynak tabani, kart eli, magaza, sarj).
    if (enteredStep !== run.step) {
      enteredStep = run.step;
      command({ type: "prepare", step: getTutorialStepPrepare(id) });
    }

    const cardOpen = cardDraftOpen();
    const shopOpen = Boolean(controls.goldShop);
    const windowOpen = id === "card" ? cardOpen : id === "shop" ? shopOpen : true;
    // Baska adimda perde acik (kart adimi gecildi, el hala secim bekliyor):
    // kutu kaybolmuyor, perdenin ustunde alt kenarda duruyor.
    const overlayAvoid = getTutorialOverlayAvoid(id, { cardOpen, shopOpen });
    const target = overlayAvoid
      ? { element: null, anchor: "bottom" as const, avoid: document.querySelector(overlayAvoid) }
      : findTarget(id);
    const copy = getTutorialCopy(id, windowOpen, { page: run.page, facts: controls.tutorialFacts });
    // Anahtar metinden: sayfa, bosta tasiyici ya da ilk teslimat degisince kutu yeniden yaziliyor.
    render(`${id}:${windowOpen}:${run.page ?? 0}:${copy.body}:${copy.ack ?? ""}`, copy, run.step + 1, target.element, target.anchor, target.avoid);
  };

  window.setInterval(tick, TICK_MS);
  onLocaleChange(() => {
    renderedKey = "";
    tick();
  });
  // Dokunus cekmece acip kapatiyor: kutu bir sonraki tiki beklemeden
  // yeni hedefe gecsin, eski metin yeni cekmecenin ustunde kalmasin.
  // Cekmece bir kare sonra yeniden kuruluyor; ikinci bakis cerceveyi yeni yerine oturtuyor.
  document.addEventListener("pointerup", () => {
    window.setTimeout(tick, 30);
    window.setTimeout(tick, 160);
  }, { passive: true });
}
