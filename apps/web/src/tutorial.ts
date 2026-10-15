import type Phaser from "phaser";
import {
  REPAIR_DEPOT_TOWER_ID,
  WALL_TOWER_ID,
  towerCatalog,
  type TutorialPrepareId,
  type TutorialProgressMessage
} from "@karayel/shared";
import { onLocaleChange, t } from "./i18n";

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
export const TUTORIAL_ACK_STEPS: readonly TutorialStepId[] = ["workerTypes", "xpGold"];

/** Ilk kule kurulunca kurulum bitiyor (Devam): dusmanlar yavasca gelmeye basliyor. */
export const TUTORIAL_COMBAT_STEP: TutorialStepId = "tower";

/** Menudeki tek seferlik "Öğreticiyi oyna" kartinin cihazdaki kaydi. */
export const TUTORIAL_OFFER_STORAGE_KEY = "uzay_tutorial_offer_v1";

export type TutorialRun = { step: number; done: boolean };

/** Motorun girdisi: sunucunun olcumu, ANLADIM ya da GEÇ. */
export type TutorialSignal =
  | { kind: "progress"; progress: TutorialProgressMessage }
  | { kind: "ack" }
  | { kind: "skip" };

export function createTutorialRun(): TutorialRun {
  return { step: 0, done: false };
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

/** Adimi ilerletir. Saf: ayni girdi ayni cikti. */
export function advanceTutorial(run: TutorialRun, signal: TutorialSignal): TutorialRun {
  if (run.done) return run;
  const id = TUTORIAL_STEPS[run.step];
  const next = (): TutorialRun => ({ step: run.step + 1, done: run.step + 1 >= TUTORIAL_STEPS.length });
  if (!id) return { ...run, done: true };
  switch (signal.kind) {
    case "skip":
      return next();
    case "ack":
      return TUTORIAL_ACK_STEPS.includes(id) ? next() : run;
    case "progress":
      return isTutorialStepCompletedBy(id, signal.progress) ? next() : run;
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

/** Ilk gorunen hedef; hicbiri yoksa yok. Saf (gorunurluk disaridan). */
export function pickTutorialTarget<T>(selectors: readonly string[], find: (selector: string) => T | undefined): { selector: string; element: T } | undefined {
  for (const selector of selectors) {
    const element = find(selector);
    if (element !== undefined) return { selector, element };
  }
  return undefined;
}

export type TutorialCopy = { title: string; body: string; ack?: string; reopen?: string };

/**
 * Kutunun metni. `windowOpen`: kart ve magaza adiminda pencere ekranda mi;
 * kapaliysa kutu onu yeniden acan bir dugme gosteriyor.
 */
export function getTutorialCopy(id: TutorialStepId, windowOpen = true): TutorialCopy {
  const copy: TutorialCopy = { title: t(`tutorial.${id}.title`), body: t(`tutorial.${id}.body`) };
  if (TUTORIAL_ACK_STEPS.includes(id)) copy.ack = t("tutorial.ack");
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

/** Sahneye giden istek (`game:tutorial-command`). */
export type TutorialCommand =
  | { type: "prepare"; step: TutorialPrepareId }
  | { type: "continue" }
  | { type: "complete" };

type ControlsStateLike = {
  visible?: boolean;
  tutorial?: unknown;
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

  const apply = (signal: TutorialSignal) => {
    if (!inTutorialMatch() || run.done) return;
    const before = run;
    run = advanceTutorial(run, signal);
    if (run === before || run.step === before.step) return;
    // Ilk kule: kurulum bitiyor, dusmanlar yavasca gelmeye basliyor.
    if (TUTORIAL_STEPS[before.step] === TUTORIAL_COMBAT_STEP) command({ type: "continue" });
    if (run.done) {
      doneBannerUntil = performance.now() + DONE_BANNER_MS;
      command({ type: "complete" });
    }
    tick();
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
    const picked = pickTutorialTarget(TUTORIAL_TARGETS[id], (selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element && isOnScreen(element) ? element : undefined;
    });
    const drawer = document.querySelector<HTMLElement>(".game-controls__drawer") ?? undefined;
    if (id === "xpGold") return { element: picked?.element ?? null, anchor: "hud" };
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

    // Yeni ogretici maci: adim motoru bastan.
    if (inMatch && !wasInMatch) {
      run = createTutorialRun();
      enteredStep = -1;
      doneBannerUntil = 0;
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

    const id = TUTORIAL_STEPS[run.step];
    // Adima giris: sunucudan hazirlik (kaynak tabani, kart eli, magaza, sarj).
    if (enteredStep !== run.step) {
      enteredStep = run.step;
      command({ type: "prepare", step: getTutorialStepPrepare(id) });
    }

    // Kart ve magaza perdesi yalnizca kendi adiminda kutuyu gosteriyor.
    const cardOpen = cardDraftOpen();
    const shopOpen = Boolean(controls.goldShop);
    if ((cardOpen && id !== "card") || (shopOpen && id !== "shop")) {
      hide();
      return;
    }
    const windowOpen = id === "card" ? cardOpen : id === "shop" ? shopOpen : true;
    const target = findTarget(id);
    render(`${id}:${windowOpen}`, getTutorialCopy(id, windowOpen), run.step + 1, target.element, target.anchor, target.avoid);
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
