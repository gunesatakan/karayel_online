import type Phaser from "phaser";
import { FINAL_WAVE, HIRABLE_WORKER_ROLES, WORKER_DEVELOPMENT_CELLS, WORKER_DEVELOPMENT_XP_COSTS, WORKER_ROLE_LABELS, cardCatalog, getCardRarity, isGlobalShopItem, shopCatalog } from "@karayel/shared";

type ZeynepTier = "small" | "medium" | "big";

/** Basili gorunumun en az ne kadar surdugu; altinda goz secmiyor. */
const BUTTON_PRESS_FLASH_MS = 140;

type ControlState = {
  visible: boolean;
  characterName?: string;
  hint?: string;
  selectedPlacedTowerId?: string;
  selectedTowerDefinitionId?: string;
  showOrientationToggle?: boolean;
  orientation?: "horizontal" | "vertical";
  towers?: Array<{ id: string; name: string; cost: number; color: string; selected: boolean }>;
  skills?: Array<{ slot: number; name: string; label: string; disabled: boolean }>;
  zeynepTier?: { slot: number; reputation: number; chainReady?: boolean };
  zeynepChain?: { value: number; ready: boolean };
  melisSpectrum?: { approval: number; stress: number; ratio: number; zone: "approval" | "balanced" | "stress"; intensity: number };
  /** Serilerin hangi tarafa yazilacagi ve siradaki evrimin bedeli. */
  melisStance?: { current: "approval" | "stress"; evolutionCost?: number; stress: number };
  ultimate?: {
    charge: number;
    ready: boolean;
    choiceOpen: boolean;
    needsChoice: boolean;
    /** Alinmis guc kademesi ve hasar carpani. */
    power: number;
    powerMultiplier: number;
    /** Siradaki kademenin bedeli; hepsi alinmissa yok. */
    upgradeCost?: number;
    canUpgrade: boolean;
  };
  underworldMode?: { current: "approval" | "stress"; pullCount: number; canEdit: boolean };
  ammoLogistics?: { enabled: boolean; canEdit: boolean };
  logisticsPriority?: { value: "critical" | "normal" | "low"; canEdit: boolean };
  defenseSummaryAvailable?: boolean;
  standby?: { active: boolean; waking: boolean; canEdit: boolean };
  /** Isci alimi; uzmanlik ilk secimde, kademe secimleri kalici belirlenir. */
  workerHire?: {
    open: boolean;
    hired: number;
    /** Normal iscinin bedeli. */
    cost: number;
    /** Gelismis iscinin bedeli; normalin uc kati. */
    advancedCost: number;
    /** Cekmecede su an secili kademe. */
    advanced: boolean;
    /** Secili kademe icin. */
    affordable: boolean;
    /** İşçinin uzmanlığı sonraki pencerede seçilecek. */
    generic?: boolean;
    roles: Array<{ id: string; label: string; description: string; owned: number; ownedAdvanced: number }>;
  };
  workerDevelopment?: {
    experience: number;
    selectedSkillIds: string[];
    open: boolean;
  };
  upgrade?: { label: string; enabled: boolean };
  sell?: { label: string; enabled: boolean };
  /** Hasarli yapiyi onarma; yikilan yapi onarilamaz, yeniden insa edilir. */
  repair?: { label: string; enabled: boolean };
  /** Performans kolu; kaynak binalarinda yok. Deger yuzde. */
  performance?: { percent: number; canEdit: boolean };
  /** Kapi yalnizca duvarda cikar: gecisi olmayan yapida kapi da yok. */
  gate?: { open: boolean; canEdit: boolean };
  /** Isci yol yasagi kipi; acikken haritaya basmak kareyi kapatir/acar. */
  workerBan?: { active: boolean; count: number };
  selectedStats?: string[];
  selectedInsight?: string;
  /** Secili kulenin kimligi; cekmece onceligi bunun degismesine bakiyor. */
  selectedTowerId?: string;
  /** Secili kuleye takili esyalar; parametre barlarinin hemen altinda listelenir. */
  equippedItems?: Array<{ id: string; name: string; description: string }>;
  equippedCapacity?: number;
  inventory?: {
    open: boolean;
    /** Bir esya secildiyse oyuncu simdi kule bekliyor demektir. */
    pendingItemId?: string;
    items: Array<{ id: string; name: string; description: string; category: string; count: number }>;
  };
  goldShop?: { gold: number; rerollPrice: number; offers: Array<{ id: string; name: string; description: string; price: number; category: string; affordable: boolean }> };
  targeting?: { current: string; modes: string[] };
  /**
   * Yaratici mod paneli.
   *
   * Katalogun kendisi burada, modulun icinde duruyor; durumdan yalnizca
   * hangilerinin acik oldugu geliyor. 74 kart ile 40 esyayi her cizimde
   * durumun icinde tasimanin bir anlami yok.
   */
  creative?: {
    wave: number;
    cardIds: string[];
    itemIds: string[];
    selectedTowerId?: string;
    selectedTowerLevel?: number;
    selectedTowerCardIds: string[];
    selectedTowerItemIds: string[];
  };
};

type ControlAction = {
  priority?: "critical" | "normal" | "low";
  action: string;
  role?: string;
  stance?: string;
  towerId?: string;
  slot?: number;
  tier?: ZeynepTier;
  mode?: "attack" | "repair";
  underworldMode?: "approval" | "stress";
  performance?: number;
  itemId?: string;
  targetingMode?: string;
  clientX?: number;
  clientY?: number;
  level?: number;
  cardId?: string;
  wave?: number;
  count?: number;
  on?: boolean;
  skillId?: string;
};

export function setupGameControlUi(game: Phaser.Game) {
  const root = document.createElement("div");
  root.id = "game-controls-root";
  root.className = "game-controls game-controls--hidden";
  document.body.append(root);

  let latestState: ControlState = { visible: false };
  let latestKey = "";
  let activeTowerId = "";
  let activePointerId = -1;

  const dispatch = (detail: ControlAction) => {
    window.dispatchEvent(new CustomEvent("karayel:control-action", { detail }));
  };

  const syncCanvasBounds = () => {
    const canvas = game.canvas;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.width = `${rect.width}px`;
    root.style.height = `${rect.height}px`;
    reportChrome(game, rect.height);
  };

  /**
   * Panelin yapisini belirleyen anahtar.
   *
   * Once butun durum oldugu gibi metne cevriliyordu ve o metin degisince panel
   * bastan kuruluyordu. Sorun, durumdaki sayilarin ekranda gorunenden cok daha
   * ince olmasi: secili kulenin cani, isisi, muhimmati her anlik goruntude
   * kimildiyor, ama ekranda ayni satir yaziyor. Panel gorunmeyen degisiklikler
   * icin surekli yikiliyordu.
   *
   * Anahtar artik yalnizca **yapiyi** tarif ediyor: hangi dugmeler var, ne
   * yaziyorlar, acik mi kapali mi. Canli sayilar anahtarin disinda kaliyor ve
   * yerinde guncelleniyor.
   */
  const buildStructureKey = (state: ControlState) => {
    return JSON.stringify(state, (fieldName, value) => {
      if (fieldName === "selectedInsight") return Boolean(value);
      if (fieldName === "selectedStats") {
        // Icerigi degil varligi onemli: bar satiri var mi, yok mu.
        return Array.isArray(value) ? value.length : value;
      }
      // Kesirli sayilar ekranda yuvarlanarak gosteriliyor; anahtarda tam
      // hallerini tutmak, gozle gorulmeyen bir oynamayi yeniden kurma
      // sebebine cevirirdi.
      return typeof value === "number" ? Math.round(value) : value;
    });
  };

  /** Yalnizca canli sayi satirini tazeler; panelin geri kalanina dokunmaz. */
  const syncLiveStats = () => {
    const insight = root.querySelector<HTMLElement>(".game-controls__insight");
    if (insight) insight.textContent = latestState.selectedInsight ?? "";
    const line = root.querySelector<HTMLElement>(".game-controls__stats");
    if (!line || !latestState?.selectedStats) {
      return;
    }
    const text = latestState.selectedStats.join("  |  ");
    if (line.textContent !== text) {
      line.textContent = text;
    }
  };

  // Panel uzerinde basili duran parmaklar. Bos oldugu anda bekleyen yeniden
  // kurma varsa hemen yapilir.
  const pressedPointers = new Set<number>();
  let rebuildDeferred = false;

  const releasePointer = (event: PointerEvent) => {
    if (!pressedPointers.delete(event.pointerId) || pressedPointers.size > 0) {
      return;
    }
    if (rebuildDeferred && latestState) {
      // Dokunusun kendisi once bitsin: `pointerup` dinleyicileri bu olayin
      // ardindan calisiyor, paneli simdi kurarsak yine ayni tuzaga duseriz.
      queueMicrotask(() => {
        if (rebuildDeferred && latestState && pressedPointers.size === 0) {
          latestKey = "";
          render(latestState);
        }
      });
    }
  };

  /**
   * Basilan dugmeyi kisa bir sure isaretler.
   *
   * `:active` tek basina yetmiyor: dugmeler islerini `pointerup` ile yapiyor ve
   * hizli bir dokunusta basili durum bir kareden az surup gozden kaciyor.
   * Oyuncunun bastigini anlamasinin baska bir yolu yok -- sonuc gecikirse ya da
   * dugme bir sey yapmiyorsa geri bildirim hic gelmiyor.
   */
  const markButtonPressed = (target: EventTarget | null) => {
    const button = target instanceof Element ? target.closest("button") : undefined;
    if (!button || button.disabled) {
      return;
    }
    button.classList.add("is-pressed");
    window.setTimeout(() => button.classList.remove("is-pressed"), BUTTON_PRESS_FLASH_MS);
  };

  root.addEventListener("pointerdown", (event: PointerEvent) => {
    pressedPointers.add(event.pointerId);
    markButtonPressed(event.target);
  });
  root.addEventListener("pointerup", releasePointer);
  root.addEventListener("pointercancel", releasePointer);
  window.addEventListener("pointerup", releasePointer);
  window.addEventListener("pointercancel", releasePointer);

  /** Bir onceki karede secili olan kule; secim degisimini yakalamak icin. */
  let lastSelectedTowerId: string | undefined;
  let lastChromeMeasureAt = 0;
  const scheduleChromeMeasure = () => {
    const now = performance.now();
    if (now - lastChromeMeasureAt < 400) {
      return;
    }
    lastChromeMeasureAt = now;
    queueMicrotask(syncCanvasBounds);
  };

  const clearActiveTowerDrag = () => {
    activeTowerId = "";
    activePointerId = -1;
    window.removeEventListener("pointermove", handleTowerDragMove);
    window.removeEventListener("pointerup", handleTowerDragEnd);
    window.removeEventListener("pointercancel", handleTowerDragEnd);
    window.removeEventListener("lostpointercapture", handleTowerDragLost);
  };

  /**
   * Surukleme parmagini kaybettiysek yerlestirmeyi iptal ettir.
   *
   * Sahne tarafinda surukleme yalnizca `towerDragEnd` ile kapaniyor ve o da
   * parmagin birakma olayina bagli. iOS uygulamayi arka plana aldiginda ya da
   * dokunusu kendi jestine devraldiginda o olay hic gelmiyor. Acik kalan
   * surukleme haritayi tumden kapatiyor: kule secilemiyor, ulti sutunu
   * secilemiyor, haritaya yapilan her dokunus dusuyor.
   *
   * `lostpointercapture` tarayicinin garantisi: parmak hangi sebeple elimizden
   * cikarsa ciksin geliyor. Normal birakmadan sonra da geliyor, ama o sirada
   * surukleme zaten kapanmis oluyor ve bu dal bos geciyor.
   */
  const handleTowerDragLost = () => {
    if (!activeTowerId) {
      return;
    }
    dispatch({ action: "towerDragCancel", towerId: activeTowerId });
    clearActiveTowerDrag();
  };

  window.addEventListener("blur", handleTowerDragLost);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      handleTowerDragLost();
    }
  });

  const handleTowerDragMove = (event: PointerEvent) => {
    if (!activeTowerId || event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    dispatch({ action: "towerDragMove", towerId: activeTowerId, clientX: event.clientX, clientY: event.clientY });
  };

  const handleTowerDragEnd = (event: PointerEvent) => {
    if (!activeTowerId || event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    dispatch({ action: "towerDragEnd", towerId: activeTowerId, clientX: event.clientX, clientY: event.clientY });
    clearActiveTowerDrag();
  };

  /**
   * Alt bar: tek satir uc dugme, uzerinde acilan bir cekmece.
   *
   * Panel bir donem her seyi ayni anda gosteriyordu -- beceriler, ulti, kule
   * izgarasi, envanter, isci alimi, ulti gucu ve secili kulenin butun ayarlari.
   * Dort satir ediyordu, yaklasik 136 piksel. Haritanin boyunu belirleyen tek
   * sey ust cubuk ile panelin geriye biraktigi piksel oldugu icin harita bunun
   * bedelini oduyordu: 393 piksellik bir ekranda 325 piksel kaliyordu.
   *
   * Icerik uc cekmeceye ayrildi ve yalnizca acilan gorunuyor. Kule secilince
   * kendi cekmecesi kendiliginden aciliyor, cunku oyuncu o an onunla ilgileniyor.
   * Satis dugmesi burada degil: haritada kulenin altinda zaten acilan panelin
   * icinde, yani kulenin oldugu yerde.
   */
  type DrawerId = "towers" | "skills" | "inventory" | "creative" | "workerDevelopment";
  let openDrawer: DrawerId | undefined;
  /** Yaratici cekmecenin acik sekmesi; cekmece kapansa da hatirlaniyor. */
  let creativeTab: "cards" | "items" | "wave" = "cards";

  const toggleDrawer = (next: DrawerId) => {
    openDrawer = openDrawer === next ? undefined : next;
    if (latestState) {
      latestKey = "";
      render(latestState);
    }
  };

  /** Cekmece kabugu: baslik satiri ve icerik. */
  const makeDrawer = (title: string, body: HTMLElement[], onClose: () => void) => {
    const drawer = document.createElement("div");
    drawer.className = "game-controls__drawer";
    const header = document.createElement("div");
    header.className = "game-controls__drawer-header";
    const label = document.createElement("span");
    label.textContent = title;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "game-controls__drawer-close";
    close.setAttribute("aria-label", "Kapat");
    close.textContent = "×";
    close.addEventListener("pointerup", onClose);
    header.append(label, close);
    drawer.append(header, ...body);
    return drawer;
  };

  /** Bir satirlik dugme grubu. */
  const makeRow = (children: HTMLElement[], className = "game-controls__row") => {
    const row = document.createElement("div");
    row.className = className;
    row.append(...children);
    return row;
  };

  const buildTowersDrawer = (state: ControlState) => {
    const grid = document.createElement("div");
    grid.className = "game-controls__tower-grid";
    for (const tower of state.towers ?? []) {
      grid.append(makeTowerButton(tower));
    }
    return [grid];
  };

  const buildSkillsDrawer = (state: ControlState) => {
    const body: HTMLElement[] = [];

    const skills = (state.skills ?? []).map((skill) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `game-controls__skill${state.zeynepChain?.ready && !skill.disabled ? " game-controls__skill--chain-ready" : ""}`;
      button.disabled = skill.disabled;
      button.textContent = skill.label;
      button.addEventListener("pointerup", () => dispatch({ action: "useSkill", slot: skill.slot }));
      return button;
    });
    if (skills.length > 0) {
      body.push(makeRow(skills, "game-controls__skills"));
    }

    // Ulti: kip secimi ya da Zeynep kademesi acikken onun yerini aliyor.
    if (state.ultimate?.choiceOpen && state.ultimate.needsChoice) {
      body.push(makeRow([
        makeActionButton("Saldiri", "game-controls__action--attack", true, () => dispatch({ action: "useUltimateMode", mode: "attack" })),
        makeActionButton("Tamir", "game-controls__action--repair", true, () => dispatch({ action: "useUltimateMode", mode: "repair" }))
      ]));
    } else if (state.zeynepTier) {
      body.push(makeRow([
        makeTierButton("Dusuk", "small", 10, state.zeynepTier.reputation, state.zeynepTier.chainReady),
        makeTierButton("Orta", "medium", 40, state.zeynepTier.reputation, state.zeynepTier.chainReady),
        makeTierButton("Yuksek", "big", 80, state.zeynepTier.reputation, state.zeynepTier.chainReady)
      ]));
    } else if (state.ultimate) {
      body.push(makeRow([
        makeActionButton(`Ulti ${state.ultimate.charge}%`, "game-controls__action--ultimate", state.ultimate.ready, () => dispatch({ action: "useUltimate" }))
      ]));
    }

    // Surekli gorunen gostergeler de burada: alt barin tek satir kalmasi icin
    // her biri bir cekmecede durmali.
    const indicators: HTMLElement[] = [];
    if (state.zeynepChain) {
      const chain = document.createElement("span");
      chain.className = `game-controls__chain${state.zeynepChain.ready ? " game-controls__chain--ready" : ""}`;
      chain.textContent = `Zincir ${state.zeynepChain.value}/2`;
      indicators.push(chain);
    }
    if (state.showOrientationToggle) {
      indicators.push(makeActionButton(
        state.orientation === "vertical" ? "Yon: Dikey" : "Yon: Yatay",
        "game-controls__orientation",
        true,
        () => dispatch({ action: "toggleAbartiOrientation" })
      ));
    }
    if (state.melisStance) {
      const stance = state.melisStance;
      const toStress = stance.current === "approval";
      const bedel = stance.evolutionCost !== undefined ? ` ${Math.floor(stance.stress)}/${stance.evolutionCost}` : " tamam";
      indicators.push(makeActionButton(
        `Seri→${stance.current === "stress" ? "Stres" : "Onay"} | Evrim${bedel}`,
        "game-controls__melis-stance",
        true,
        () => dispatch({ action: "setMelisStance", stance: toStress ? "stress" : "approval" })
      ));
    }
    if (indicators.length > 0) {
      body.push(makeRow(indicators));
    }
    if (state.melisSpectrum) {
      body.push(makeMelisSpectrum(state.melisSpectrum));
    }

    return body;
  };

  const buildWorkerDevelopmentDrawer = (state: ControlState) => {
    const development = state.workerDevelopment;
    if (!development) return [];
    const intro = document.createElement("p");
    intro.className = "worker-development__intro";
    intro.textContent = `Ortak işçi ağacı · ${Math.floor(development.experience)} XP. Açılan hücreler aynı uzmanlıktaki tüm işçilere uygulanır.`;
    const viewport = document.createElement("div");
    viewport.className = "worker-development__viewport";
    viewport.title = "Ağacı sürükleyerek gez";
    const canvas = document.createElement("div");
    canvas.className = "worker-development__tree";
    const origin = document.createElement("div");
    origin.className = "worker-development__origin";
    origin.innerHTML = "<span>İŞÇİ<br>AĞACI</span>";
    canvas.append(origin);
    for (const role of HIRABLE_WORKER_ROLES) {
      const section = document.createElement("section");
      section.className = `worker-development__role worker-development__role--${role}`;
      const heading = document.createElement("strong");
      heading.textContent = WORKER_ROLE_LABELS[role];
      section.append(heading);
      const path = document.createElement("div");
      path.className = "worker-development__path";
      WORKER_DEVELOPMENT_CELLS[role].forEach((cell, index) => {
        const row = document.createElement("div");
        row.className = `worker-development__cell${cell.options ? " worker-development__cell--choice" : " worker-development__cell--empty"}`;
        const marker = document.createElement("span");
        marker.className = "worker-development__marker";
        marker.textContent = String(index + 1);
        row.append(marker);
        if (!cell.options) {
          const fork = document.createElement("div");
          fork.className = "worker-development__fork worker-development__fork--empty";
          for (let branch = 0; branch < 2; branch += 1) {
            const empty = document.createElement("span");
            empty.className = "worker-development__empty-branch";
            empty.textContent = "boş";
            fork.append(empty);
          }
          row.append(fork);
        } else {
          const fork = document.createElement("div");
          fork.className = "worker-development__fork";
          cell.options.forEach((option) => {
            const selected = development.selectedSkillIds.includes(option.id);
            const button = makeActionButton(`${option.name}${selected ? " ✓" : ""}`, "game-controls__worker-development", !selected && development.experience >= WORKER_DEVELOPMENT_XP_COSTS[Math.floor(index / 3)], () => dispatch({ action: "unlockWorkerDevelopment", role, skillId: option.id }));
            button.title = `${option.description} · ${WORKER_DEVELOPMENT_XP_COSTS[Math.floor(index / 3)]} XP`;
            fork.append(button);
          });
          row.append(fork);
        }
        path.append(row);
      });
      section.append(path);
      canvas.append(section);
    }
    viewport.append(canvas);
    let dragX = 0;
    let dragY = 0;
    let startX = 0;
    let startY = 0;
    let dragging = false;
    const applyTransform = () => { canvas.style.transform = `translate(${dragX}px, ${dragY}px)`; };
    viewport.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      dragging = true;
      startX = event.clientX - dragX;
      startY = event.clientY - dragY;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("is-dragging");
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      dragX = event.clientX - startX;
      dragY = event.clientY - startY;
      applyTransform();
    });
    const release = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      viewport.releasePointerCapture?.(event.pointerId);
      viewport.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", release);
    viewport.addEventListener("pointercancel", release);
    const hint = document.createElement("small");
    hint.className = "worker-development__hint";
    hint.textContent = "Ağacı dokunup sürükleyerek gezebilirsin · 3 / 6 / 9 gamechanger hücreleri";
    return [intro, viewport, hint];
  };

  const buildInventoryDrawer = (state: ControlState) => {
    const body: HTMLElement[] = [];
    const items = state.inventory?.items ?? [];

    const list = document.createElement("div");
    list.className = "game-controls__inventory-list";
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inventory__empty";
      empty.textContent = "Envanterin boş. Mağazadan aldığın eşyalar burada birikir.";
      list.append(empty);
    }
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `gold-shop__item gold-shop__item--${item.category}`;
      button.innerHTML = `<span>${item.category}</span><strong>${item.name}</strong><small>${item.description}</small>`
        + (item.count > 1 ? `<b>x${item.count}</b>` : "");
      button.addEventListener("pointerup", () => dispatch({ action: "selectInventoryItem", itemId: item.id }));
      list.append(button);
    }
    body.push(list);

    const actions: HTMLElement[] = [];
    if (state.inventory?.pendingItemId) {
      actions.push(makeActionButton("Takmayı iptal et", "game-controls__inventory-button", true, () => dispatch({ action: "cancelEquip" })));
    }
    if (state.workerHire) {
      actions.push(makeActionButton(`İşçi Al ${state.workerHire.cost}g`, "game-controls__worker-hire", true, () => dispatch({ action: "openWorkerHire" })));
    }
    if (state.workerBan) {
      const ban = state.workerBan;
      actions.push(makeActionButton(
        ban.active ? "Yasak: kare seç" : `İşçi Yolu Yasakla${ban.count > 0 ? ` (${ban.count})` : ""}`,
        "game-controls__worker-ban",
        true,
        () => dispatch({ action: "toggleWorkerBanMode" })
      ));
    }
    // Ulti gucu: mevcut carpan ve siradaki bedel ayni dugmede. Oyuncunun
    // karsilastirdigi sey bu ikisi.
    if (state.ultimate) {
      const ulti = state.ultimate;
      actions.push(makeActionButton(
        ulti.upgradeCost === undefined
          ? `Ulti Gücü ×${ulti.powerMultiplier} (tam)`
          : `Ulti Gücü ×${ulti.powerMultiplier} → ×${ulti.powerMultiplier * 2} ${ulti.upgradeCost}g`,
        "game-controls__ultimate-power",
        ulti.canUpgrade,
        () => dispatch({ action: "upgradeUltimatePower" })
      ));
    }
    if (actions.length > 0) {
      body.push(makeRow(actions));
    }
    return body;
  };

  const buildTowerDrawer = (state: ControlState) => {
    const body: HTMLElement[] = [];

    // Yaratici modda seviye bir dugme dizisi: yukseltme yolu tek tek ilerliyor
    // ve bedel istiyor, burasi dogrudan yaziyor.
    if (state.creative && state.selectedPlacedTowerId) {
      const levels = document.createElement("div");
      levels.className = "creative__levels";
      for (let level = 1; level <= 10; level += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `creative__level${state.creative.selectedTowerLevel === level ? " creative__level--active" : ""}`;
        button.textContent = String(level);
        button.addEventListener("pointerup", () => dispatch({ action: "creativeLevel", level }));
        levels.append(button);
      }
      body.push(levels);
    }

    if (state.selectedInsight) {
      const insight = document.createElement("p");
      insight.className = "game-controls__insight";
      insight.style.cssText = "margin:0;padding:8px 10px;line-height:1.5;font-size:12px;color:#c9e6ee;white-space:normal;max-height:6em;overflow:auto;border-left:2px solid #4b91a6;background:#132532";
      insight.textContent = state.selectedInsight;
      body.push(insight);
    }
    const stats = document.createElement("div");
    stats.className = "game-controls__stats";
    stats.textContent = (state.selectedStats ?? []).join("  |  ");
    body.push(stats);

    // Takili esyalar: takilan esya sokulemedigi icin liste salt okunur.
    const equipped = document.createElement("div");
    equipped.className = "tower-items";
    const capacity = state.equippedCapacity ?? 0;
    const items = state.equippedItems ?? [];
    const header = document.createElement("span");
    header.className = "tower-items__header";
    header.textContent = capacity > 0 ? `Eşyalar ${items.length}/${capacity}` : "Eşyalar";
    equipped.append(header);
    if (items.length === 0) {
      const empty = document.createElement("span");
      empty.className = "tower-items__empty";
      empty.textContent = "Takılı eşya yok";
      equipped.append(empty);
    }
    for (const item of items) {
      const chip = document.createElement("span");
      chip.className = "tower-items__chip";
      chip.textContent = item.name;
      chip.title = item.description;
      equipped.append(chip);
    }
    body.push(equipped);

    // Satis haritadaki kule panelinde de duruyor ama tek yeri orasi
    // olamaz: cekmece tuvalin alt yarisini kapliyor ve haritanin alt
    // sirasindaki bir kulenin paneli tam onun altina dusuyor. Oyuncu
    // kuleyi seciyor, satis dugmesi hic gorunmuyordu.
    const actions: HTMLElement[] = [
      makeActionButton(state.upgrade?.label ?? "Yükselt", "game-controls__action--upgrade", Boolean(state.upgrade?.enabled), () => dispatch({ action: "upgradeTower" }))
    ];
    if (state.repair) {
      actions.push(makeActionButton(state.repair.label, "game-controls__action--repair", state.repair.enabled, () => dispatch({ action: "repairStructure" })));
    }
    if (state.sell) {
      actions.push(makeActionButton(state.sell.label, "game-controls__action--sell", state.sell.enabled, () => dispatch({ action: "sellTower" })));
    }
    body.push(makeRow(actions));

    if (state.performance) {
      body.push(makePerformanceSlider(state.performance));
    }

    if (state.underworldMode) {
      body.push(makeRow([
        makeUnderworldModeButton("Onay", "approval", state.underworldMode),
        makeUnderworldModeButton("Stres", "stress", state.underworldMode)
      ], "game-controls__underworld-mode"));
    }
    if (state.gate) {
      const gate = state.gate;
      body.push(makeRow([makeActionButton(
        gate.open ? "Kapıyı Ör" : "Kapı Yap",
        "game-controls__underworld-mode-button",
        gate.canEdit,
        () => dispatch({ action: "toggleWallGate" })
      )], "game-controls__underworld-mode"));
    }
    if (state.ammoLogistics) {
      body.push(makeRow([makeActionButton(
        state.ammoLogistics.enabled ? "Mühimmat Akışı: Açık" : "Mühimmat Akışı: Kapalı",
        "game-controls__underworld-mode-button",
        state.ammoLogistics.canEdit,
        () => dispatch({ action: "toggleAmmoLogistics" })
      )], "game-controls__underworld-mode"));
    }
    if (state.logisticsPriority) {
      const label = document.createElement("span");
      label.textContent = "Sevkiyat önceliği";
      label.className = "tower-items__header";
      body.push(label);
      const priority = state.logisticsPriority;
      body.push(makeRow((["critical", "normal", "low"] as const).map((value) => makeActionButton(
          `${priority.value === value ? "● " : ""}${{ critical: "Kritik", normal: "Normal", low: "Düşük" }[value]}`,
          "game-controls__underworld-mode-button", priority.canEdit,
          () => dispatch({ action: "setLogisticsPriority", priority: value })
      )), "game-controls__underworld-mode"));
    }
    if (state.standby) {
      const standby = state.standby;
      body.push(makeRow([makeActionButton(
        standby.active ? "Kuleyi Ac" : standby.waking ? "Kule Isiniyor..." : "Beklemeye Al",
        "game-controls__underworld-mode-button",
        standby.canEdit && !standby.waking,
        () => dispatch({ action: "toggleTowerStandby" })
      )], "game-controls__underworld-mode"));
    }
    if (state.targeting) {
      const select = document.createElement("select");
      select.className = "game-controls__targeting";
      for (const mode of state.targeting.modes) {
        const option = document.createElement("option");
        option.value = mode;
        option.textContent = ({ first: "İlk", strongest: "En güçlü", weakest: "En zayıf", closest: "En yakın", last: "Son", random: "Rastgele" } as Record<string, string>)[mode] ?? mode;
        option.selected = mode === state.targeting.current;
        select.append(option);
      }
      select.addEventListener("change", () => dispatch({ action: "setTargeting", targetingMode: select.value }));
      body.push(select);
    }

    return body;
  };

  /**
   * Yaratici mod cekmecesi.
   *
   * Kule koymak ve seviye vermek buraya girmiyor: ikisi de zaten var olan
   * akislarin icinde -- kule listesi normal yerinde duruyor ve bedelsiz
   * kanaldan gidiyor, seviye satiri da secili kulenin kendi cekmecesinde.
   * Burada yalnizca sahada karsiligi olmayan seyler var: kart, esya, dalga.
   */
  const buildCreativeDrawer = (state: ControlState) => {
    const creative = state.creative;
    if (!creative) return [];
    const body: HTMLElement[] = [];

    const makeTab = (label: string, id: typeof creativeTab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `creative__tab${creativeTab === id ? " creative__tab--active" : ""}`;
      button.textContent = label;
      button.addEventListener("pointerup", () => {
        creativeTab = id;
        latestKey = "";
        render(latestState);
      });
      return button;
    };
    const hedef = document.createElement("div");
    hedef.className = "creative__target";
    hedef.textContent = creative.selectedTowerId
      ? `Seçili kule: ${creative.selectedTowerId} · seviye ${creative.selectedTowerLevel ?? 1}`
      : "Kule seçili değil — hedefli kartlar ve kuleye takılan eşyalar kapalı";
    body.push(hedef);
    body.push(makeRow([makeTab("Kart", "cards"), makeTab("Eşya", "items"), makeTab("Dalga", "wave")], "creative__tabs"));

    const list = document.createElement("div");
    list.className = "creative__list";

    if (creativeTab === "cards") {
      const owned = new Map<string, number>();
      for (const id of creative.cardIds) owned.set(id, (owned.get(id) ?? 0) + 1);
      for (const card of cardCatalog) {
        const targeted = card.scope.kind === "targeted";
        const count = targeted
          ? creative.selectedTowerCardIds.filter((id) => id === card.id).length
          : owned.get(card.id) ?? 0;
        const needsTower = targeted && !creative.selectedTowerId;
        list.append(makeCreativeRow({
          name: card.name,
          detail: card.description,
          badge: targeted ? "kule" : getCardRarity(card),
          count,
          disabled: needsTower,
          disabledHint: "Önce bir kule seç",
          onToggle: (on) => dispatch({ action: "creativeCard", cardId: card.id, on })
        }));
      }
    } else if (creativeTab === "items") {
      const owned = new Map<string, number>();
      for (const id of creative.itemIds) owned.set(id, (owned.get(id) ?? 0) + 1);
      for (const item of shopCatalog) {
        const global = isGlobalShopItem(item);
        const count = global
          ? owned.get(item.id) ?? 0
          : creative.selectedTowerItemIds.filter((id) => id === item.id).length;
        const needsTower = !global && !creative.selectedTowerId;
        list.append(makeCreativeRow({
          name: item.name,
          detail: item.description,
          badge: global ? "genel" : "kule",
          count,
          disabled: needsTower,
          disabledHint: "Önce bir kule seç",
          onToggle: (on) => dispatch({ action: "creativeItem", itemId: item.id, on })
        }));
      }
    } else {
      const waves = document.createElement("div");
      waves.className = "creative__waves";
      for (let wave = 1; wave <= FINAL_WAVE; wave += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `creative__wave${creative.wave === wave ? " creative__wave--active" : ""}`;
        button.textContent = String(wave);
        button.addEventListener("pointerup", () => dispatch({ action: "creativeWave", wave }));
        waves.append(button);
      }
      list.append(waves);

      const spawn = document.createElement("div");
      spawn.className = "creative__spawn";
      for (const count of [1, 5, 10, 25]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "creative__spawn-button";
        button.textContent = `${count} düşman`;
        button.addEventListener("pointerup", () => dispatch({ action: "creativeSpawn", count }));
        spawn.append(button);
      }
      list.append(spawn);
    }

    body.push(list);
    return body;
  };

  /** Kart ve esya listelerinin ortak satiri: ad, aciklama ve iki dugme. */
  const makeCreativeRow = (options: {
    name: string;
    detail: string;
    badge: string;
    count: number;
    disabled: boolean;
    disabledHint: string;
    onToggle: (on: boolean) => void;
  }) => {
    const row = document.createElement("div");
    row.className = `creative__row${options.count > 0 ? " creative__row--owned" : ""}`;
    row.title = options.disabled ? options.disabledHint : options.detail;

    const text = document.createElement("span");
    text.className = "creative__row-text";
    const name = document.createElement("strong");
    name.textContent = options.count > 1 ? `${options.name} ×${options.count}` : options.name;
    const badge = document.createElement("small");
    badge.textContent = options.badge;
    text.append(name, badge);

    const makeStep = (label: string, on: boolean, enabled: boolean) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "creative__step";
      button.disabled = !enabled;
      button.textContent = label;
      button.addEventListener("pointerup", () => options.onToggle(on));
      return button;
    };

    const actions = document.createElement("div");
    actions.className = "creative__row-actions";
    actions.append(makeStep("−", false, !options.disabled && options.count > 0), makeStep("+", true, !options.disabled));

    row.append(text, actions);
    return row;
  };

  const buildLauncher = (state: ControlState) => {
    const makeLaunchButton = (label: string, id: DrawerId) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `game-controls__launch${openDrawer === id ? " game-controls__launch--open" : ""}`;
      button.textContent = label;
      button.addEventListener("pointerup", () => toggleDrawer(id));
      return button;
    };

    const total = (state.inventory?.items ?? []).reduce((sum, entry) => sum + entry.count, 0);
    const buttons = [
      makeLaunchButton("Kuleler", "towers"),
      makeLaunchButton("Beceriler", "skills"),
      makeLaunchButton("İşçi Ağacı", "workerDevelopment"),
      makeLaunchButton(`Envanter ${total}`, "inventory")
    ];
    if (state.creative) buttons.push(makeLaunchButton("Yaratıcı", "creative"));
    if (state.defenseSummaryAvailable) buttons.push(makeActionButton("Savunma Özeti", "game-controls__launch", true, () => dispatch({ action: "showDefenseSummary" })));
    return makeRow(buttons, "game-controls__launcher");
  };

  const render = (state: ControlState) => {
    // Yalnizca acilista bildirmek yetmiyordu: sahne o an daha dinlemeye
    // baslamamis oluyor, telefonda da resize hic gelmedigi icin kamera
    // varsayilan seritte cakili kaliyordu. Cizim sik oldugu icin olcum
    // kisitlanir -- getBoundingClientRect yerlesimi zorluyor.
    scheduleChromeMeasure();
    latestState = state;

    // Son yapilan kazanir.
    //
    // Yeni bir kule secmek acik cekmeceyi kapatiyor, boylece kuleye
    // dokunan oyuncu kule panelini goruyor. Bunun karsiliginda asagida
    // acik cekmece kule panelinin onune geciyor: kule secili while bir
    // cekmece acmak da isliyor. Ikisi olmadan Atakan'in Refaktor'u
    // yapilamiyordu -- beceri once kule secilmesini istiyor ama kule
    // secili oldugunda beceri cekmecesi hic acilamiyordu.
    if (state.selectedTowerId !== lastSelectedTowerId) {
      lastSelectedTowerId = state.selectedTowerId;
      if (state.selectedTowerId) openDrawer = undefined;
    }

    // Canli sayilar paneli yeniden kurmaz, yerinde yazilir.
    syncLiveStats();

    const key = `${buildStructureKey(state)}|${openDrawer ?? ""}`;
    if (key === latestKey) {
      return;
    }

    // Parmak panelin uzerindeyken yeniden kurmak dokunusu yutuyor.
    //
    // Dugmeler islerini `pointerup` ile yapiyor ve her yeniden kurma o
    // dugmeleri yok edip yenilerini yaratiyor. Basma ile birakma arasinda
    // panel bir kez bile yenilenirse `pointerup` artik var olmayan bir
    // elemana gidiyor ve dokunus hic olmamis sayiliyor. Insan basisi
    // 80-150 ms surerken panel saniyede onlarca kez yenilendigi icin bu
    // "ara sira" degil, cogu zaman oluyordu. Bekletmek guvenli: parmak
    // kalkar kalkmaz en guncel durumla kuruluyor.
    if (pressedPointers.size > 0) {
      rebuildDeferred = true;
      return;
    }

    rebuildDeferred = false;
    latestKey = key;
    root.classList.toggle("game-controls--hidden", !state.visible);
    root.classList.toggle("game-controls--tower-selected", Boolean(state.selectedStats));
    if (!state.visible) {
      root.replaceChildren();
      return;
    }

    root.replaceChildren();

    // Tam ekran cekmeceler kendi kapatma dugmeleriyle geliyor; alt barla
    // iliskileri yok.
    if (state.goldShop) {
      const drawer = document.createElement("section");
      drawer.className = "gold-shop";
      drawer.innerHTML = `<header><span>ALTIN MAĞAZASI</span><strong>${state.goldShop.gold}g</strong></header><p>Kurulumunu genişletmek için bir geliştirme seç.</p><div class="gold-shop__offers"></div>`;
      const offers = drawer.querySelector<HTMLElement>(".gold-shop__offers");
      for (const item of state.goldShop.offers) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `gold-shop__item gold-shop__item--${item.category}`;
        button.disabled = !item.affordable;
        button.innerHTML = `<span>${item.category}</span><strong>${item.name}</strong><small>${item.description}</small><b>${item.price}g</b>`;
        button.addEventListener("pointerup", () => dispatch({ action: "buyShopItem", itemId: item.id }));
        offers?.append(button);
      }
      const reroll = makeActionButton(`Yenile ${state.goldShop.rerollPrice}g`, "gold-shop__reroll", state.goldShop.gold >= state.goldShop.rerollPrice, () => dispatch({ action: "rerollShop" }));
      const close = makeActionButton("Mağazayı Kapat", "gold-shop__close", true, () => dispatch({ action: "closeShop" }));
      const actions = document.createElement("div");
      actions.className = "gold-shop__actions";
      actions.append(reroll, close);
      drawer.append(actions);
      root.append(drawer);
    }

    if (state.workerHire?.open) {
      const hire = state.workerHire;
      const drawer = document.createElement("section");
      drawer.className = "gold-shop inventory";
      drawer.innerHTML = `<header><span>İŞÇİ AL</span><strong>${hire.advanced ? hire.advancedCost : hire.cost} altın</strong></header>`
        + `<p>Tek tip işçi alırsın; uzmanlığını sonraki kalıcı seçimde belirlersin. Alınan işçi: ${hire.hired}. Kademe farketmez, her alım sonrakini pahalılaştırır.</p>`
        + `<div class="game-controls__underworld-mode game-controls__worker-tier"></div>`
        + `<div class="gold-shop__offers"></div>`;

      // Kademe secimi rollerin ustunde: once ne kadar harcanacagi, sonra ne
      // is yapacagi seciliyor.
      const tiers = drawer.querySelector<HTMLElement>(".game-controls__worker-tier");
      tiers?.append(
        makeWorkerTierButton(`Normal ${hire.cost}g`, false, hire),
        makeWorkerTierButton(`Gelişmiş ${hire.advancedCost}g`, true, hire)
      );

      const list = drawer.querySelector<HTMLElement>(".gold-shop__offers");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `gold-shop__item gold-shop__item--utility${hire.advanced ? " gold-shop__item--advanced-worker" : ""}`;
      button.disabled = !hire.affordable;
      button.innerHTML = `<span>${hire.advanced ? "gelişmiş" : "işçi"}</span><strong>Yeni işçi al</strong><small>İlk seçimde uzmanlık dalını seçersin; sonraki seçimler kalıcı gamechanger becerilerdir.</small>`;
      button.addEventListener("pointerup", () => dispatch({ action: "hireWorker" }));
      list?.append(button);
      const actions = document.createElement("div");
      actions.className = "gold-shop__actions";
      actions.append(makeActionButton("Kapat", "gold-shop__close", true, () => dispatch({ action: "closeWorkerHire" })));
      drawer.append(actions);
      root.append(drawer);
    }

    const panel = document.createElement("section");
    panel.className = `game-controls__panel${state.selectedStats ? " game-controls__panel--tower-selected" : ""}`;

    // Elle acilan cekmece, secimle kendiliginden gelen kule panelinin onune
    // geciyor. Yukaridaki "yeni secim cekmeceyi kapatir" kuralinin obur
    // yarisi: ikisi birlikte "son yapilan kazanir" demek. Tek yonlu
    // olsaydi kule secili hicbir cekmece acilamaz, ters yonlu olsaydi
    // kuleye dokunmak panelini getirmezdi.
    if (openDrawer === "creative" && state.creative) {
      panel.append(makeDrawer("Yaratıcı mod", buildCreativeDrawer(state), () => toggleDrawer("creative")));
    } else if (openDrawer === "towers") {
      panel.append(makeDrawer("Kuleler", buildTowersDrawer(state), () => toggleDrawer("towers")));
    } else if (openDrawer === "skills") {
      panel.append(makeDrawer("Beceriler", buildSkillsDrawer(state), () => toggleDrawer("skills")));
    } else if (openDrawer === "inventory") {
      panel.append(makeDrawer("Envanter", buildInventoryDrawer(state), () => toggleDrawer("inventory")));
    } else if (openDrawer === "workerDevelopment") {
      panel.append(makeDrawer("İşçi Gelişim Ağacı", buildWorkerDevelopmentDrawer(state), () => toggleDrawer("workerDevelopment")));
    } else if (state.selectedStats) {
      panel.append(makeDrawer("Seçili kule", buildTowerDrawer(state), () => dispatch({ action: "clearTowerSelection" })));
    }

    panel.append(buildLauncher(state));
    root.append(panel);
  };

  const makeActionButton = (label: string, className: string, enabled: boolean, onClick: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game-controls__action ${className}`;
    button.disabled = !enabled;
    button.textContent = label;
    button.addEventListener("pointerup", onClick);
    return button;
  };

  const makeTierButton = (label: string, tier: ZeynepTier, cost: number, reputation: number, chainReady = false) => {
    const button = makeActionButton(`${label} ${cost}I`, `game-controls__tier game-controls__tier--${tier}${chainReady && reputation >= cost ? " game-controls__tier--chain-ready" : ""}`, reputation >= cost, () => {
      dispatch({ action: "useZeynepTier", tier });
    });
    return button;
  };

  /**
   * Performans kolu.
   *
   * `input` olayinda yolluyor, `change` degil: haritadaki kol da
   * suruklenirken yolluyor ve isinin gercek zamanli tepki vermesi kolun
   * anlami. Panel surukleme boyunca yeniden kurulmuyor -- parmak
   * basiliyken yeniden kurma zaten erteleniyor.
   */
  const makePerformanceSlider = (performance: NonNullable<ControlState["performance"]>) => {
    const row = document.createElement("div");
    row.className = "game-controls__performance";
    const label = document.createElement("span");
    label.className = "game-controls__performance-label";
    label.textContent = `Performans %${performance.percent}`;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(performance.percent);
    slider.disabled = !performance.canEdit;
    slider.className = "game-controls__performance-slider";
    slider.addEventListener("input", () => {
      label.textContent = `Performans %${slider.value}`;
      dispatch({ action: "setTowerPerformance", performance: Number(slider.value) / 100 });
    });
    row.append(label, slider);
    return row;
  };

  const makeWorkerTierButton = (label: string, advanced: boolean, hire: NonNullable<ControlState["workerHire"]>) => {
    const button = makeActionButton(
      `${label}${hire.advanced === advanced ? " ✓" : ""}`,
      `game-controls__underworld-mode-button game-controls__worker-tier-button--${advanced ? "advanced" : "normal"}`,
      true,
      () => dispatch({ action: "setWorkerTier", on: advanced })
    );
    button.classList.toggle("is-active", hire.advanced === advanced);
    return button;
  };

  const makeUnderworldModeButton = (label: string, mode: "approval" | "stress", state: NonNullable<ControlState["underworldMode"]>) => {
    const button = makeActionButton(
      `${label}${state.current === mode ? " ✓" : ""}`,
      `game-controls__underworld-mode-button game-controls__underworld-mode-button--${mode}`,
      state.canEdit,
      () => dispatch({ action: "setUnderworldMode", underworldMode: mode })
    );
    button.classList.toggle("is-active", state.current === mode);
    return button;
  };

  const makeTowerButton = (tower: NonNullable<ControlState["towers"]>[number]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game-controls__tower${tower.selected ? " game-controls__tower--selected" : ""}`;
    button.style.setProperty("--tower-color", tower.color);
    button.innerHTML = `<span>${tower.name}</span><strong>${tower.cost}g</strong>`;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      clearActiveTowerDrag();
      activeTowerId = tower.id;
      activePointerId = event.pointerId;
      // Parmagi yakalamak, kaybedildiginde haber almanin tek guvenilir yolu:
      // panel yeniden kurulup dugme DOM'dan cikarsa ya da isletim sistemi
      // dokunusu devralirsa `lostpointercapture` yine de geliyor.
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Yakalama desteklenmiyorsa asagidaki pencere dinleyicileri yeterli.
      }
      window.addEventListener("pointermove", handleTowerDragMove, { passive: false });
      window.addEventListener("pointerup", handleTowerDragEnd, { passive: false });
      window.addEventListener("pointercancel", handleTowerDragEnd, { passive: false });
      window.addEventListener("lostpointercapture", handleTowerDragLost, { passive: false });
      dispatch({ action: "selectTower", towerId: tower.id });
      dispatch({ action: "towerDragStart", towerId: tower.id, clientX: event.clientX, clientY: event.clientY });
    });
    return button;
  };

  const makeMelisSpectrum = (spectrum: NonNullable<ControlState["melisSpectrum"]>) => {
    const shell = document.createElement("section");
    shell.className = `game-controls__melis-spectrum game-controls__melis-spectrum--${spectrum.zone}`;
    shell.style.setProperty("--stress-ratio", String(spectrum.ratio));
    const meter = document.createElement("div");
    meter.className = "melis-spectrum__meter";

    const marker = document.createElement("div");
    marker.className = "melis-spectrum__marker";
    meter.append(marker);

    shell.append(meter);
    return shell;
  };

  game.events.on("game:controls-state", render);
  window.addEventListener("resize", syncCanvasBounds);
  window.addEventListener("orientationchange", syncCanvasBounds);
  new ResizeObserver(syncCanvasBounds).observe(document.body);
  syncCanvasBounds();
}

/**
 * Ust bardaki sayilar.
 *
 * Eskiden tek bir hazir metindi ("Gold 0  Can 100  Wave 1  E 0/0  M 0 ..."):
 * on ikiye kadar deger ayni satira diziliyordu ve tuval 390 piksel genis oldugu
 * icin satir tasip marka yazisiyla ve ping ile ust uste biniyordu. Metin olarak
 * gelen bir seyi duzgun yerlestirmek mumkun degil -- neyin onemli oldugunu,
 * nerede kirilabilecegini, hangisinin gizlenebilecegini yerlesim bilemez. Bu
 * yuzden bar artik yapisal veri aliyor ve onceligi kendisi kuruyor.
 */
export type HudAmmoCounts = { bullet: number; auraCrystal: number; powerCrystal: number };

export type HudStats = {
  gold: number;
  experience: number;
  health: number;
  maxHealth: number;
  wave: number;
  enemiesLeft: number;
  energy: number;
  maxEnergy: number;
  ammo: HudAmmoCounts;
  /**
   * Karaktere ozel sayaclar. Bos gelirse hic cizilmez.
   *
   * Simge zorunlu: serit tek satir ve yazili etiketler ("İTİBAR", "KALİTE")
   * genisligin yarisini yiyordu. Ad yalnizca ipucunda duruyor.
   */
  extras: Array<{ label: string; icon: string; value: string }>;
};

export const EMPTY_HUD_STATS: HudStats = {
  gold: 0,
  experience: 0,
  health: 0,
  maxHealth: 0,
  wave: 1,
  enemiesLeft: 0,
  energy: 0,
  maxEnergy: 0,
  ammo: { bullet: 0, auraCrystal: 0, powerCrystal: 0 },
  extras: []
};

/**
 * HTML kaplamalarin tuvalin ne kadarini ortugunu sahneye bildirir.
 *
 * Kamera haritayi bu iki serit arasina sigdiriyor. Yukseklikler sabit degil:
 * stat seridi sarilinca ust cubuk uzuyor, iOS'ta tam ekran olmadigi icin tuval
 * kisaliyor ve ayni HTML tuvalin daha buyuk bir kismini ortuyor. Olculmedigi
 * surece harita cubugun altinda kaliyor.
 */
function reportChrome(game: Phaser.Game, canvasHeight: number) {
  if (canvasHeight <= 0) {
    return;
  }

  const hud = document.getElementById("game-hud-root");
  const panel = document.querySelector<HTMLElement>(".game-controls__panel");
  const hudHeight = hud && !hud.classList.contains("game-hud--hidden") ? hud.getBoundingClientRect().height : 0;
  // Yalnizca kapali barin yuksekligi olculur. Acilan cekmece kasten akisin
  // disinda duruyor: akista olsaydi buradan gecip kamerayi tetikler ve harita
  // her cekmece acilisinda kuculurdu.
  const panelHeight = panel ? panel.getBoundingClientRect().height : 0;

  game.events.emit("game:chrome", {
    topRatio: hudHeight / canvasHeight,
    bottomRatio: panelHeight / canvasHeight
  });
}

export type HudState = {
  status: string;
  stats: HudStats;
  ping: string;
  pingTone: "good" | "warn" | "bad";
  /** Rozete sigmayan tani ayrintisi; ipucunda durur. */
  pingDetail: string;
  continueVisible: boolean;
  continueWaiting: boolean;
  perfOpen: boolean;
  perfText: string;
  /** Istatistik paneli ve acik sekmesi. */
  statsOpen: boolean;
  statsTab: "damage" | "dps" | "effects";
  /** Kule satirlari; panelin ilk iki sekmesi ayni listeyi farkli siralar. */
  statsTowers: Array<{ id: string; name: string; level: number; damage: number; dps: number }>;
  /** Etki kalemleri: ad, deger ve degerin birimi. */
  statsEffects: Array<{ label: string; value: number; unit: "damage" | "seconds" }>;
  audioOpen: boolean;
  musicVolume: number;
  voiceVolume: number;
};

export function setupGameHudUi(game: Phaser.Game) {
  const root = document.createElement("header");
  root.id = "game-hud-root";
  root.className = "game-hud game-hud--hidden";
  document.body.append(root);

  let state: HudState = {
    status: "Sunucu kontrol ediliyor...", stats: EMPTY_HUD_STATS, ping: "-- ms", pingTone: "warn", pingDetail: "",
    continueVisible: false, continueWaiting: false, perfOpen: false, perfText: "", audioOpen: false, musicVolume: 0.5, voiceVolume: 0.5,
    statsOpen: false, statsTab: "damage", statsTowers: [], statsEffects: []
  };

  const dispatch = (action: string, value?: number) => window.dispatchEvent(new CustomEvent("karayel:control-action", { detail: { action, value } }));
  const syncCanvasBounds = () => {
    const rect = game.canvas?.getBoundingClientRect();
    if (!rect) return;
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.width = `${rect.width}px`;
    reportChrome(game, rect.height);
  };

  /**
   * Altin tam sayi olarak okunur, cunku oyuncu "su kuleyi alabilir miyim"
   * sorusunu tam sayiyla cevaplar. Ancak on binden sonra basamak sayisi bari
   * tasiracagi icin orada kisaltmaya geciyoruz.
   */
  const compactNumber = (value: number) => {
    const amount = Math.floor(Math.max(0, value));
    if (amount < 10_000) return String(amount);
    if (amount < 1_000_000) return `${(amount / 1000).toFixed(amount < 100_000 ? 1 : 0)}B`;
    return `${(amount / 1_000_000).toFixed(1)}M`;
  };

  const formatXp = (value: number) => {
    const rounded = Math.round(Math.max(0, value) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  // Yapi bir kez kuruluyor. Eskiden her altin degisiminde butun bar yeniden
  // yazilip dinleyiciler bastan baglaniyordu; altin dalga boyunca surekli
  // degistigi icin bu, saniyede onlarca kez DOM yikip yeniden kurmak demekti.
  root.innerHTML = `
    <div class="game-hud__row">
      <div class="game-hud__vitals">
        <span class="game-hud__vital game-hud__vital--gold" title="Altın"><i aria-hidden="true">◆</i><b data-hud-gold>0</b></span>
        <span class="game-hud__vital game-hud__vital--health" title="Üs canı"><i aria-hidden="true">♥</i><b data-hud-health>0</b></span>
        <span class="game-hud__vital game-hud__vital--wave" title="Dalga"><i aria-hidden="true">⚑</i><b data-hud-wave>1</b></span>
      </div>
      <p class="game-hud__status" data-hud-status hidden></p>
      <div class="game-hud__actions">
        <button data-hud="perf" aria-label="Performans bilgisi">i</button>
        <button data-hud="stats" aria-label="İstatistikler">▤</button>
        <button data-hud="audio" aria-label="Ses ayarları">♪</button>
        <button class="game-hud__continue" data-hud="continue" hidden>Devam</button>
      </div>
    </div>
    <div class="game-hud__strip" data-hud-strip></div>
    <div data-hud-popups></div>
  `;

  const goldNode = root.querySelector<HTMLElement>("[data-hud-gold]")!;
  const healthNode = root.querySelector<HTMLElement>("[data-hud-health]")!;
  const waveNode = root.querySelector<HTMLElement>("[data-hud-wave]")!;
  const stripNode = root.querySelector<HTMLElement>("[data-hud-strip]")!;
  const statusNode = root.querySelector<HTMLElement>("[data-hud-status]")!;
  const popupsNode = root.querySelector<HTMLElement>("[data-hud-popups]")!;
  const continueButton = root.querySelector<HTMLButtonElement>(".game-hud__continue")!;

  const setText = (node: HTMLElement, text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };

  root.querySelectorAll<HTMLElement>("[data-hud]").forEach((element) => element.addEventListener("pointerup", (event) => {
    event.stopPropagation();
    const action = element.dataset.hud;
    if (action === "continue") dispatch("continueWave");
    if (action === "perf") dispatch("togglePerfHud");
    if (action === "audio") dispatch("toggleAudioHud");
    if (action === "stats") dispatch("toggleStatsHud");
    if (action === "stats-damage") dispatch("setStatsTab", 0);
    if (action === "stats-dps") dispatch("setStatsTab", 1);
    if (action === "stats-effects") dispatch("setStatsTab", 2);
  }));

  /**
   * Ikincil serit: tek satir, yalnizca simge ve sayi.
   *
   * Serit bir donem sariyordu. Sarma bir gorunum tercihi degil, oyunun ortasinda
   * haritanin boyunu degistiren bir seydi: bir rozet birkac piksel buyudugunde
   * sarma noktasi kayiyor, cubuk bir satir uzuyor ve kamera haritayi yeniden
   * olcekliyordu. Ping saniyede bir degistigi icin bu surekli oluyordu.
   *
   * Cozum genisligi geri kazanmak. Yazili etiketler ("KALAN", "İTİBAR",
   * "KALİTE") seridin yarisini yiyordu; hepsi simgeye indi ve adlari ipucunda
   * duruyor. Kalan sekiz rozet tek satira siginca sarma ihtimali kalmiyor --
   * ve satir yine de dolarsa rozetler kirpiliyor, alt satir acilmiyor.
   */
  let lastStripKey = "";
  const renderStrip = (stats: HudStats, ping: string, pingTone: HudState["pingTone"], pingDetail: string) => {
    const chip = (icon: string, value: string, title: string, extraClass = "") =>
      `<span class="game-hud__chip ${extraClass}" title="${escapeHudText(title)}">`
        + `<i aria-hidden="true">${escapeHudText(icon)}</i><b>${escapeHudText(value)}</b></span>`;

    const chips: string[] = [
      chip("☠", String(stats.enemiesLeft), "Kalan düşman"),
      ...stats.extras.map((extra) => chip(extra.icon, extra.value, extra.label)),
      chip("⚡", `${Math.floor(stats.energy)}/${Math.floor(stats.maxEnergy)}`, "Enerji"),
      `<span class="game-hud__chip game-hud__chip--ammo" title="Mermi · Aura · Güç">`
        + `<em class="is-bullet" aria-hidden="true">▪</em><b>${Math.floor(stats.ammo.bullet)}</b>`
        + `<em class="is-aura" aria-hidden="true">◈</em><b>${Math.floor(stats.ammo.auraCrystal)}</b>`
        + `<em class="is-power" aria-hidden="true">✦</em><b>${Math.floor(stats.ammo.powerCrystal)}</b>`
        + `</span>`,
      chip("★", formatXp(stats.experience), "Deneyim"),
      chip("●", ping, pingDetail || "Gecikme", `game-hud__chip--ping game-hud__chip--${pingTone}`)
    ];
    const key = chips.join("");
    if (key === lastStripKey) return;
    lastStripKey = key;
    stripNode.innerHTML = key;
  };

  const formatStatValue = (value: number) => (value >= 10000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value)));

  /**
   * Istatistik panelinin govdesi.
   *
   * Ilk iki sekme ayni kule listesini iki ayri olcute gore siraliyor: toplam
   * hasar kosun tamamini, anlik DPS su ani anlatiyor. Ayri sorular -- dalga
   * boyunca hicbir sey yapmayan ama toplamda onde gorunen bir kule ancak
   * ikisini yan yana koyunca yakalaniyor.
   *
   * Ucuncu sekme etkileri gosteriyor, cunku sikayet tam oradaydi: kulenin
   * hasari zaten goruluyordu, kanamanin ya da yavaslatmanin ne is yaptigi
   * hicbir yerde yazmiyordu.
   */
  const renderStatsRows = (next: HudState) => {
    if (next.statsTab === "effects") {
      if (next.statsEffects.length === 0) {
        return "<p class=\"game-hud__stats-empty\">Henüz ölçülecek bir etki yok.</p>";
      }
      return next.statsEffects
        .map((entry) => {
          const value = entry.unit === "seconds" ? `${entry.value.toFixed(1)} sn` : formatStatValue(entry.value);
          return `<li><span class="game-hud__stats-name">${escapeHudText(entry.label)}</span><b>${escapeHudText(value)}</b></li>`;
        })
        .join("");
    }

    if (next.statsTowers.length === 0) {
      return "<p class=\"game-hud__stats-empty\">Sahada kule yok.</p>";
    }

    const byDps = next.statsTab === "dps";
    const rows = [...next.statsTowers].sort((a, b) => (byDps ? b.dps - a.dps : b.damage - a.damage));
    // Cubugun boyu en buyuge gore: sayilari tek tek okumadan siralamayi
    // gormek icin.
    const peak = Math.max(1, ...rows.map((tower) => (byDps ? tower.dps : tower.damage)));
    return rows
      .map((tower, index) => {
        const value = byDps ? tower.dps : tower.damage;
        const ratio = Math.max(0, Math.min(1, value / peak)) * 100;
        const shown = byDps ? value.toFixed(1) : formatStatValue(value);
        return `<li><span class="game-hud__stats-rank">${index + 1}</span>`
          + `<span class="game-hud__stats-name">${escapeHudText(tower.name)} <em>lv${tower.level}</em></span>`
          + `<span class="game-hud__stats-bar"><i style="width:${ratio.toFixed(1)}%"></i></span>`
          + `<b>${escapeHudText(shown)}</b></li>`;
      })
      .join("");
  };

  const renderStatsPopup = (next: HudState) => {
    if (!next.statsOpen) return "";
    const tab = (id: string, label: string, active: boolean) =>
      `<button data-hud="stats-${id}" class="${active ? "is-active" : ""}">${escapeHudText(label)}</button>`;
    return `<section class="game-hud__popup game-hud__popup--stats"><button data-hud="stats">×</button>`
      + `<strong>İstatistikler</strong>`
      + `<nav class="game-hud__stats-tabs">`
      + tab("damage", "Toplam hasar", next.statsTab === "damage")
      + tab("dps", "Anlık DPS", next.statsTab === "dps")
      + tab("effects", "Etkiler", next.statsTab === "effects")
      + `</nav><ul class="game-hud__stats-list">${renderStatsRows(next)}</ul></section>`;
  };

  let lastPopupKey = "";
  const renderPopups = (next: HudState) => {
    const statsKey = next.statsOpen
      ? `stats:${next.statsTab}:${next.statsTowers.map((t) => `${t.id}:${Math.round(t.damage)}:${t.dps.toFixed(1)}`).join(",")}`
        + `:${next.statsEffects.map((e) => `${e.label}:${e.value.toFixed(1)}`).join(",")}`
      : "";
    const key = `${next.perfOpen ? `perf:${next.perfText}` : ""}|${next.audioOpen ? `audio:${next.musicVolume}:${next.voiceVolume}` : ""}|${statsKey}`;
    if (key === lastPopupKey) return;
    lastPopupKey = key;
    popupsNode.innerHTML = `
      ${next.perfOpen ? `<section class="game-hud__popup game-hud__popup--perf"><button data-hud="perf">×</button><strong>Performans Profili</strong><pre>${escapeHudText(next.perfText)}</pre></section>` : ""}
      ${next.audioOpen ? `<section class="game-hud__popup game-hud__popup--audio"><button data-hud="audio">×</button><strong>Ses ayarları</strong><label>Müzik <input data-volume="music" type="range" min="0" max="1" step="0.01" value="${next.musicVolume}"></label><label>Seslendirme <input data-volume="voice" type="range" min="0" max="1" step="0.01" value="${next.voiceVolume}"></label></section>` : ""}
      ${renderStatsPopup(next)}
    `;
    popupsNode.querySelectorAll<HTMLElement>("[data-hud]").forEach((element) => element.addEventListener("pointerup", (event) => {
      event.stopPropagation();
      const action = element.dataset.hud;
      if (action === "perf") dispatch("togglePerfHud");
      if (action === "audio") dispatch("toggleAudioHud");
      if (action === "stats") dispatch("toggleStatsHud");
      if (action === "stats-damage") dispatch("setStatsTab", 0);
      if (action === "stats-dps") dispatch("setStatsTab", 1);
      if (action === "stats-effects") dispatch("setStatsTab", 2);
    }));
    popupsNode.querySelectorAll<HTMLInputElement>("[data-volume]").forEach((input) => input.addEventListener("input", () => {
      dispatch(input.dataset.volume === "music" ? "setMusicVolume" : "setVoiceVolume", Number(input.value));
    }));
  };

  const render = (next: HudState) => {
    state = next;
    setText(goldNode, compactNumber(state.stats.gold));
    setText(healthNode, `${Math.max(0, Math.round(state.stats.health))}`);
    setText(waveNode, `${state.stats.wave}`);
    // Can azaldikca renk isinir; sayiya bakmadan da fark edilmeli.
    const healthRatio = state.stats.maxHealth > 0 ? state.stats.health / state.stats.maxHealth : 1;
    root.dataset.health = healthRatio <= 0.25 ? "critical" : healthRatio <= 0.6 ? "low" : "ok";

    renderStrip(state.stats, state.ping, state.pingTone, state.pingDetail);

    // Durum satiri yalnizca soyleyecek bir sey varken yer kaplar.
    const status = state.status.trim();
    statusNode.hidden = status.length === 0;
    setText(statusNode, status);

    continueButton.hidden = !state.continueVisible;
    continueButton.disabled = state.continueWaiting;
    setText(continueButton, state.continueWaiting ? "Bekleniyor" : "Devam");

    renderPopups(state);
  };

  // Gorunurluk yalnizca sahneden gelen olaya bagli: kurulumda cizmek barin
  // menu ekraninin uzerinde belirmesine yol acardi.
  game.events.on("game:hud-state", (next: HudState) => {
    root.classList.remove("game-hud--hidden");
    render(next);
  });
  game.events.on("game:hud-hide", () => root.classList.add("game-hud--hidden"));
  window.addEventListener("resize", syncCanvasBounds);
  window.addEventListener("orientationchange", syncCanvasBounds);
  new ResizeObserver(syncCanvasBounds).observe(document.body);
  syncCanvasBounds();
  // Baslangic degerlerini gizliyken yaz: ilk olay geldiginde bar dolu acilsin.
  render(state);
}

/** Karakter sayaclari ve durum metni sunucudan geliyor; isaretleme olarak yorumlanmamali. */
function escapeHudText(value: string) {
  return value.replace(/[&<>"']/g, (character) => (
    character === "&" ? "&amp;"
      : character === "<" ? "&lt;"
      : character === ">" ? "&gt;"
      : character === "\"" ? "&quot;"
      : "&#39;"
  ));
}
