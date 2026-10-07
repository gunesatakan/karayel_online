import type Phaser from "phaser";

/**
 * Ilk mac brifingi: alti adimlik canli yonlendirme.
 *
 * Oyuncu oynarken ilgili dugme cerceveleniyor, yaninda kisa bir komuta
 * metni duruyor; oyuncu o isi yapinca (kule kurdu, Devam'a basti, kart
 * secti...) sonraki adima geciliyor. Her kutuda ATLA var.
 *
 * Sahneye dokunmuyor: GameScene'in zaten yayinladigi durum olaylarini
 * (`game:controls-state`, `game:snapshot`) ve DOM'u okuyor. Anlik goruntu
 * bicimi degisebilir; yalnizca gereken alanlar savunmaci okunuyor.
 *
 * Ilerleme cihazda (`localStorage`); bitirilen ya da atlanan brifing bir daha
 * acilmiyor, yarim kalan bir sonraki macta kaldigi adimdan suruyor. Ana
 * menudeki "Eğitim" dugmesi ilerlemeyi sifirlayip maci baslatiyor.
 */

export const TUTORIAL_STEPS = ["tower", "wave", "logistics", "card", "shop", "workers"] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

export const TUTORIAL_STORAGE_KEY = "uzay_tutorial_v1";

export type TutorialProgress = { step: number; done: boolean };

/** Bir anda oyunda gorulenler; her tikte olaylardan ve DOM'dan toplanir. */
export type TutorialObservation = {
  inMatch: boolean;
  creative: boolean;
  setupPhase: boolean;
  ownTowers: number;
  cardDraftOpen: boolean;
  shopOpen: boolean;
  workersHired: number;
};

/**
 * Mac icindeki adim durumu. `seen*`: adimin bekledigi pencere bu adimdayken
 * acildi mi; kapanisi ancak acildiktan sonra "yapildi" sayiliyor.
 */
export type TutorialRun = {
  step: number;
  done: boolean;
  seenSetup: boolean;
  seenOpen: boolean;
  workersAtStep?: number;
};

export function createTutorialRun(progress: TutorialProgress): TutorialRun {
  // Dalga adiminda kalan brifing yeni macta kuleden baslar: kulesiz bir
  // haritada "Devam'a bas" demek yanlis, dalga adimi kule olmadan gizli.
  const step = progress.step <= TUTORIAL_STEPS.indexOf("wave") ? 0 : progress.step;
  return { step, done: progress.done, seenSetup: false, seenOpen: false };
}

function enterStep(run: TutorialRun, step: number): TutorialRun {
  return { step, done: step >= TUTORIAL_STEPS.length, seenSetup: false, seenOpen: false };
}

/**
 * Adimi ilerletir. Saf: ayni girdi ayni cikti. `acknowledged` kutudaki
 * ANLAŞILDI dugmesi (yalnizca dugmesi olan adimlarda anlamli).
 */
export function advanceTutorial(run: TutorialRun, seen: TutorialObservation, acknowledged = false): TutorialRun {
  if (run.done || !seen.inMatch || seen.creative) return run;
  const id = TUTORIAL_STEPS[run.step];
  const next = () => enterStep(run, run.step + 1);
  switch (id) {
    case "tower":
      return seen.ownTowers > 0 ? next() : run;
    case "wave":
      // Devam'a basilip dalga baslayinca. Kurulum hic gorulmeden (yeniden
      // baglanma, dalga ortasi) gelinirse de gecilir: Devam zaten basilmis.
      if (seen.setupPhase) return run.seenSetup ? run : { ...run, seenSetup: true };
      return next();
    case "logistics":
      // Bilgi adimi; okunmadan kart secimi acilirsa yerini ona birakir.
      return acknowledged || seen.cardDraftOpen || seen.shopOpen ? next() : run;
    case "card":
      if (seen.cardDraftOpen) return run.seenOpen ? run : { ...run, seenOpen: true };
      // Secim yapildi; ya da bu dalgada kart cikmadi ve magaza acildi, ya da
      // kurulum bitti (kart penceresi hic gelmedi).
      if (run.seenOpen || seen.shopOpen) return next();
      if (seen.setupPhase) return run.seenSetup ? run : { ...run, seenSetup: true };
      return run.seenSetup ? next() : run;
    case "shop":
      if (seen.shopOpen) return run.seenOpen ? run : { ...run, seenOpen: true };
      if (run.seenOpen) return next();
      if (seen.setupPhase) return run.seenSetup ? run : { ...run, seenSetup: true };
      return run.seenSetup ? next() : run;
    case "workers": {
      const baseline = run.workersAtStep ?? seen.workersHired;
      if (acknowledged || seen.workersHired > baseline) return next();
      return run.workersAtStep === undefined ? { ...run, workersAtStep: baseline } : run;
    }
    default:
      return { ...run, done: true };
  }
}

/** Adimin kutusu su an ekranda mi; degilse adim arka planda bekliyor. */
export function isTutorialStepVisible(run: TutorialRun, seen: TutorialObservation) {
  if (run.done || !seen.inMatch || seen.creative) return false;
  switch (TUTORIAL_STEPS[run.step]) {
    case "tower":
      return seen.setupPhase && !seen.cardDraftOpen && !seen.shopOpen;
    case "wave":
      return seen.setupPhase && !seen.cardDraftOpen && !seen.shopOpen && seen.ownTowers > 0;
    case "logistics":
      return !seen.setupPhase;
    case "card":
      return seen.cardDraftOpen;
    case "shop":
      return seen.shopOpen;
    case "workers":
      return !seen.cardDraftOpen && !seen.shopOpen;
    default:
      return false;
  }
}

/** Kutunun metni; `open` hedef cekmece acik mi (iki asamali adimlar). */
export function getTutorialCopy(id: TutorialStepId, open: boolean): { title: string; body: string; ack?: string } {
  switch (id) {
    case "tower":
      return open
        ? { title: "KONUŞLANMA", body: "Bir birimi basılı tut ve haritada boş bir kareye sürükle. Düşman rotasının yakını en iyi mevzi." }
        : { title: "KONUŞLANMA", body: "Savunma hattı açık. Kuleler'i aç." };
    case "wave":
      return { title: "TEMAS", body: "Hat hazır. Devam ile ilk dalgayı başlat. Ekipte herkes hazır olunca dalga girer." };
    case "logistics":
      return {
        title: "LOJİSTİK",
        body: "Kuleler ateş ettikçe ısınır; 50°C üstünde atış hızı düşer. Enerji ve mühimmat işçilerle taşınır, stok biterse kule susar. Üst şeritten izle.",
        ack: "ANLAŞILDI"
      };
    case "card":
      return { title: "TAKVİYE", body: "Dalga temizlendi. Komuta takviye sunuyor: bir kart seç. Hedefli kartlar seçtiğin kuleye işler." };
    case "shop":
      return { title: "İKMAL", body: "Altınla eşya al. Çoğu eşya envantere düşer; Envanter'den bir kuleye tak, kule başına en fazla 10. Bitince Mağazayı Kapat." };
    case "workers":
      return open
        ? { title: "İŞÇİLER", body: "İşçi Al ile bir işçi al ve uzmanlığını seç. Gelişim İşçi Ağacı'nda.", ack: "ANLAŞILDI" }
        : { title: "İŞÇİLER", body: "Envanter'i aç. İşçiler enerji ve mühimmatı kulelere taşır.", ack: "ANLAŞILDI" };
  }
}

export function readTutorialProgress(): TutorialProgress {
  try {
    const raw = window.localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return { step: 0, done: false };
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    const step = Number.isInteger(parsed.step) ? Math.max(0, Math.min(TUTORIAL_STEPS.length, parsed.step as number)) : 0;
    return { step, done: parsed.done === true || step >= TUTORIAL_STEPS.length };
  } catch {
    return { step: 0, done: false };
  }
}

function writeTutorialProgress(progress: TutorialProgress) {
  try {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Depolama kapali (itch iframe'i, gizli pencere): brifing bu oturumda kalir.
  }
}

/** Ana menudeki "Eğitim": brifing bir sonraki macta bastan. */
export function resetTutorialProgress() {
  writeTutorialProgress({ step: 0, done: false });
  window.dispatchEvent(new CustomEvent("karayel:tutorial-reset"));
}

type ControlsStateLike = {
  visible?: boolean;
  creative?: unknown;
  goldShop?: unknown;
  workerHire?: { hired?: number };
};

type SnapshotLike = {
  setupPhase?: boolean;
  towers?: ReadonlyArray<{ ownerId?: string }>;
};

const TICK_MS = 250;
/** Bilgi adimi dalga baslar baslamaz degil, ilk temastan sonra. */
const LOGISTICS_DELAY_MS = 2500;
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
        <button type="button" class="tutorial__skip">ATLA</button>
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

  let progress = readTutorialProgress();
  let run = createTutorialRun(progress);
  let controls: ControlsStateLike = { visible: false };
  let snapshot: SnapshotLike | undefined;
  let localId: string | undefined;
  let acknowledged = false;
  let stepShownAt = 0;
  let doneBannerUntil = 0;
  let renderedKey = "";
  let wasInMatch = false;

  game.events.on("game:controls-state", (state: ControlsStateLike) => {
    controls = state ?? { visible: false };
    // Mac bitti: onceki macin kuleleri yeni macta "kule kuruldu" sayilmasin.
    if (!controls.visible) snapshot = undefined;
  });
  game.events.on("game:snapshot", (next: SnapshotLike, sessionId?: string) => {
    snapshot = next;
    localId = sessionId;
  });
  window.addEventListener("karayel:tutorial-reset", () => {
    progress = readTutorialProgress();
    run = createTutorialRun(progress);
  });

  skip.addEventListener("click", () => {
    run = { ...run, done: true };
    save();
    hide();
  });
  ack.addEventListener("click", () => {
    acknowledged = true;
    tick();
  });

  const save = () => {
    progress = { step: Math.min(run.step, TUTORIAL_STEPS.length), done: run.done };
    writeTutorialProgress(progress);
  };

  const observe = (): TutorialObservation => {
    const towers = Array.isArray(snapshot?.towers) ? snapshot!.towers : [];
    return {
      inMatch: Boolean(controls.visible) && snapshot !== undefined,
      creative: Boolean(controls.creative),
      setupPhase: Boolean(snapshot?.setupPhase),
      ownTowers: localId ? towers.filter((tower) => tower?.ownerId === localId).length : 0,
      cardDraftOpen: Boolean(document.querySelector("#card-root.card-draft--visible")),
      shopOpen: Boolean(controls.goldShop),
      workersHired: Number(controls.workerHire?.hired) || 0
    };
  };

  const hide = () => {
    root.hidden = true;
    box.hidden = true;
    frame.hidden = true;
    renderedKey = "";
  };

  /**
   * Adima gore cercevelenecek oge ve kutunun yeri.
   *
   * - Cekmece aciksa kutu cekmecenin tamamina yaslaniyor: icindeki dugmeye
   *   yaslaninca cekmecenin basligini ve kapatma dugmesini ortuyordu.
   * - HUD'daki hedefte (Devam, kaynak seridi) kutu HUD'un ve ongoru satirinin
   *   altinda; hedefin hemen altinda seridi ortuyordu.
   * - Kart perdesi ekrani kapliyor, ust kismi karne ve ilk kart: kutu alt
   *   kenarda, cerceve yok. Magazada alt kenarda Mağazayı Kapat duruyor; kutu
   *   o satiri cerceveleyip ustune geciyor.
   */
  const findTarget = (id: TutorialStepId): { element: HTMLElement | null; anchor?: HTMLElement | "hud" | "bottom"; open: boolean } => {
    const launchOpen = (drawer: string) => document.querySelector<HTMLElement>(`[data-launch="${drawer}"].game-controls__launch--open`) !== null;
    const drawer = () => document.querySelector<HTMLElement>(".game-controls__drawer") ?? undefined;
    switch (id) {
      case "tower": {
        const open = launchOpen("towers");
        return { open, element: open ? drawer() ?? null : document.querySelector<HTMLElement>('[data-launch="towers"]') };
      }
      case "wave":
        return { open: false, element: document.querySelector<HTMLElement>(".game-hud__continue:not([hidden])"), anchor: "hud" };
      case "logistics":
        return { open: false, element: document.querySelector<HTMLElement>(".game-hud__strip"), anchor: "hud" };
      case "shop":
        // Yenile / Mağazayı Kapat satiri; kutu onun ustunde, son teklifin uzerinde.
        return { open: false, element: document.querySelector<HTMLElement>(".gold-shop:not(.inventory) .gold-shop__actions") };
      case "workers": {
        // Isci alma perdesi acildiysa "Yeni işçi al"; perde cekmecenin ustunde.
        const hire = document.querySelector<HTMLElement>(".gold-shop.inventory .gold-shop__item");
        if (hire) return { open: true, element: hire };
        const open = launchOpen("inventory");
        return {
          open,
          element: document.querySelector<HTMLElement>(open ? ".game-controls__worker-hire" : '[data-launch="inventory"]'),
          anchor: open ? drawer() : undefined
        };
      }
      default:
        return { open: false, element: null, anchor: "bottom" };
    }
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

  const place = (target: HTMLElement | null, anchor: HTMLElement | "hud" | "bottom" | undefined) => {
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
    box.style.transform = `translateY(${Math.round(top)}px)`;
  };

  const tick = () => {
    const seen = observe();
    const now = performance.now();

    // Yeni mac: adim ici bayraklar sifirdan, ilerleme kayittan.
    if (seen.inMatch && !wasInMatch) {
      run = createTutorialRun(progress);
      acknowledged = false;
    }
    wasInMatch = seen.inMatch;

    const before = run.step;
    const wasDone = run.done;
    run = advanceTutorial(run, seen, acknowledged);
    acknowledged = false;
    if (run.step !== before || run.done !== wasDone) {
      save();
      stepShownAt = 0;
      if (run.done && !wasDone) doneBannerUntil = now + DONE_BANNER_MS;
    }

    if (run.done) {
      if (now < doneBannerUntil && seen.inMatch) {
        render("done", { title: "BRİFİNG TAMAM", body: "Sektör senin, operatör. Brifing yeniden: ana menü › Eğitim." }, undefined, null, "hud");
      } else {
        hide();
      }
      return;
    }

    if (!isTutorialStepVisible(run, seen)) {
      stepShownAt = 0;
      hide();
      return;
    }
    if (stepShownAt === 0) stepShownAt = now;
    const id = TUTORIAL_STEPS[run.step];
    if (id === "logistics" && now - stepShownAt < LOGISTICS_DELAY_MS) {
      hide();
      return;
    }
    const target = findTarget(id);
    render(`${id}:${target.open}`, getTutorialCopy(id, target.open), run.step + 1, target.element, target.anchor);
  };

  const render = (key: string, copy: { title: string; body: string; ack?: string }, stepNumber: number | undefined, target: HTMLElement | null, anchor?: HTMLElement | "hud" | "bottom") => {
    if (renderedKey !== key) {
      renderedKey = key;
      tag.textContent = "KOMUTA //";
      count.textContent = stepNumber ? `BRİFİNG ${stepNumber}/${TUTORIAL_STEPS.length}` : "KAYIT KAPANDI";
      title.textContent = copy.title;
      body.textContent = copy.body;
      actions.hidden = !copy.ack;
      ack.textContent = copy.ack ?? "";
      skip.hidden = stepNumber === undefined;
      root.hidden = false;
      box.hidden = false;
      // Kisa giris; hareket azaltmada CSS kapatiyor.
      box.classList.remove("tutorial__box--enter");
      void box.offsetWidth;
      box.classList.add("tutorial__box--enter");
    }
    place(target, anchor);
  };

  window.setInterval(tick, TICK_MS);
  // Dokunus cekmece acip kapatiyor: kutu bir sonraki tiki beklemeden
  // yeni hedefe gecsin, eski metin yeni cekmecenin ustunde kalmasin.
  document.addEventListener("pointerup", () => window.setTimeout(tick, 30), { passive: true });
}
