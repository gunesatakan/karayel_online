import type Phaser from "phaser";

type ZeynepTier = "small" | "medium" | "big";

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
  ultimate?: { charge: number; ready: boolean; choiceOpen: boolean; needsChoice: boolean };
  underworldMode?: { current: "approval" | "stress"; pullCount: number; canEdit: boolean };
  ammoLogistics?: { enabled: boolean; canEdit: boolean };
  standby?: { active: boolean; waking: boolean; canEdit: boolean };
  /** Isci alimi; rol alim aninda secilir, sonradan degismez. */
  workerHire?: {
    open: boolean;
    hired: number;
    cost: number;
    affordable: boolean;
    roles: Array<{ id: string; label: string; description: string; owned: number }>;
  };
  upgrade?: { label: string; enabled: boolean };
  sell?: { label: string; enabled: boolean };
  /** Hasarli yapiyi onarma; yikilan yapi onarilamaz, yeniden insa edilir. */
  repair?: { label: string; enabled: boolean };
  selectedStats?: string[];
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
};

type ControlAction = {
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

  const clearActiveTowerDrag = () => {
    activeTowerId = "";
    activePointerId = -1;
    window.removeEventListener("pointermove", handleTowerDragMove);
    window.removeEventListener("pointerup", handleTowerDragEnd);
    window.removeEventListener("pointercancel", handleTowerDragEnd);
  };

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

  const render = (state: ControlState) => {
    latestState = state;
    const key = JSON.stringify(state);
    if (key === latestKey) {
      return;
    }
    latestKey = key;
    root.classList.toggle("game-controls--hidden", !state.visible);
    root.classList.toggle("game-controls--tower-selected", Boolean(state.selectedStats));
    if (!state.visible) {
      root.replaceChildren();
      return;
    }

    root.replaceChildren();

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

    if (state.inventory?.open) {
      const drawer = document.createElement("section");
      drawer.className = "gold-shop inventory";
      const count = state.inventory.items.reduce((sum, entry) => sum + entry.count, 0);
      drawer.innerHTML = `<header><span>ENVANTER</span><strong>${count} eşya</strong></header>`
        + `<p>Bir eşyaya dokun, sonra takmak istediğin kuleyi seç. Takılan eşya sökülemez.</p>`
        + `<div class="gold-shop__offers"></div>`;
      const list = drawer.querySelector<HTMLElement>(".gold-shop__offers");
      if (state.inventory.items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "inventory__empty";
        empty.textContent = "Envanterin boş. Mağazadan aldığın eşyalar burada birikir.";
        list?.append(empty);
      }
      for (const item of state.inventory.items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `gold-shop__item gold-shop__item--${item.category}`;
        button.innerHTML = `<span>${item.category}</span><strong>${item.name}</strong><small>${item.description}</small>`
          + (item.count > 1 ? `<b>x${item.count}</b>` : "");
        button.addEventListener("pointerup", () => dispatch({ action: "selectInventoryItem", itemId: item.id }));
        list?.append(button);
      }
      const close = makeActionButton("Kapat", "gold-shop__close", true, () => dispatch({ action: "closeInventory" }));
      const actions = document.createElement("div");
      actions.className = "gold-shop__actions";
      actions.append(close);
      drawer.append(actions);
      root.append(drawer);
    }

    if (state.workerHire?.open) {
      const hire = state.workerHire;
      const drawer = document.createElement("section");
      drawer.className = "gold-shop inventory";
      drawer.innerHTML = `<header><span>İŞÇİ AL</span><strong>${hire.cost} altın</strong></header>`
        + `<p>İşçinin rolü alırken belirlenir ve sonradan değişmez. Alınan işçi: ${hire.hired}. Her alım sonrakini pahalılaştırır.</p>`
        + `<div class="gold-shop__offers"></div>`;
      const list = drawer.querySelector<HTMLElement>(".gold-shop__offers");
      for (const role of hire.roles) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gold-shop__item gold-shop__item--utility";
        button.disabled = !hire.affordable;
        button.innerHTML = `<span>rol</span><strong>${role.label}</strong><small>${role.description}</small>`
          + (role.owned > 0 ? `<b>x${role.owned}</b>` : "");
        button.addEventListener("pointerup", () => dispatch({ action: "hireWorker", role: role.id }));
        list?.append(button);
      }
      const actions = document.createElement("div");
      actions.className = "gold-shop__actions";
      actions.append(makeActionButton("Kapat", "gold-shop__close", true, () => dispatch({ action: "closeWorkerHire" })));
      drawer.append(actions);
      root.append(drawer);
    }

    if (state.melisSpectrum) {
      root.append(makeMelisSpectrum(state.melisSpectrum));
    }

    const panel = document.createElement("section");
    panel.className = `game-controls__panel${state.selectedStats ? " game-controls__panel--tower-selected" : ""}`;

    const skillRow = document.createElement("div");
    skillRow.className = "game-controls__skills";
    for (const skill of state.skills ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `game-controls__skill${state.zeynepChain?.ready && !skill.disabled ? " game-controls__skill--chain-ready" : ""}`;
      button.disabled = skill.disabled;
      button.textContent = skill.label;
      button.addEventListener("pointerup", () => dispatch({ action: "useSkill", slot: skill.slot }));
      skillRow.append(button);
    }

    const actionRow = document.createElement("div");
    actionRow.className = "game-controls__actions";
    if (state.ultimate?.choiceOpen && state.ultimate.needsChoice) {
      actionRow.append(
        makeActionButton("Saldiri", "game-controls__action--attack", true, () => dispatch({ action: "useUltimateMode", mode: "attack" })),
        makeActionButton("Tamir", "game-controls__action--repair", true, () => dispatch({ action: "useUltimateMode", mode: "repair" }))
      );
    } else if (state.zeynepTier) {
      actionRow.append(
        makeTierButton("Dusuk", "small", 10, state.zeynepTier.reputation, state.zeynepTier.chainReady),
        makeTierButton("Orta", "medium", 40, state.zeynepTier.reputation, state.zeynepTier.chainReady),
        makeTierButton("Yuksek", "big", 80, state.zeynepTier.reputation, state.zeynepTier.chainReady)
      );
    } else {
      actionRow.append(
        makeActionButton(`Ulti ${state.ultimate?.charge ?? 0}%`, "game-controls__action--ultimate", Boolean(state.ultimate?.ready), () => dispatch({ action: "useUltimate" })),
        makeActionButton(state.upgrade?.label ?? "Kule sec", "game-controls__action--upgrade", Boolean(state.upgrade?.enabled), () => dispatch({ action: "upgradeTower" })),
        makeActionButton(state.sell?.label ?? "Sat", "game-controls__action--sell", Boolean(state.sell?.enabled), () => dispatch({ action: "sellTower" }))
      );
      if (state.repair) {
        actionRow.append(
          makeActionButton(state.repair.label, "game-controls__action--repair", state.repair.enabled, () => dispatch({ action: "repairStructure" }))
        );
      }
    }

    const shop = document.createElement("div");
    shop.className = "game-controls__shop";
    if (state.selectedStats) {
      const stats = document.createElement("div");
      stats.className = "game-controls__stats";
      stats.textContent = state.selectedStats.join("  |  ");
      shop.append(stats);

      // Takili esyalar parametre barlarinin hemen altinda: oyuncu hangi kuleye
      // ne taktigini burada takip eder. Takilan esya sokulemedigi icin liste
      // salt okunur.
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
      shop.append(equipped);
      if (state.underworldMode) {
        const modeRow = document.createElement("div");
        modeRow.className = "game-controls__underworld-mode";
        modeRow.append(
          makeUnderworldModeButton("Onay", "approval", state.underworldMode),
          makeUnderworldModeButton("Stres", "stress", state.underworldMode)
        );
        shop.append(modeRow);
      }
      if (state.ammoLogistics) {
        const logisticsRow = document.createElement("div");
        logisticsRow.className = "game-controls__underworld-mode";
        logisticsRow.append(makeActionButton(
          state.ammoLogistics.enabled ? "Mühimmat Akışı: Açık" : "Mühimmat Akışı: Kapalı",
          "game-controls__underworld-mode-button",
          state.ammoLogistics.canEdit,
          () => dispatch({ action: "toggleAmmoLogistics" })
        ));
        shop.append(logisticsRow);
      }
      if (state.standby) {
        const standby = state.standby;
        shop.append(makeActionButton(
          standby.active ? "Kuleyi Ac" : standby.waking ? "Kule Isiniyor..." : "Beklemeye Al",
          "game-controls__underworld-mode-button",
          standby.canEdit && !standby.waking,
          () => dispatch({ action: "toggleTowerStandby" })
        ));
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
        shop.append(select);
      }
    } else {
      const towerGrid = document.createElement("div");
      towerGrid.className = "game-controls__tower-grid";
      const towerList = state.towers ?? [];
      // Dukkan alani iki satir yuksekliginde ve tasan satir kirpiliyor. Sutun
      // sayisini sabit yazmak, katologa bir yapi eklendigi anda son butonu
      // gorunmez yapiyor -- duvar eklenince tam olarak bu oldu. Sayiyi listeden
      // turetmek kurali dogrudan ifade eder: kac kule olursa olsun iki satir.
      towerGrid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.ceil(towerList.length / 2))}, minmax(0, 1fr))`;
      for (const tower of towerList) {
        towerGrid.append(makeTowerButton(tower));
      }
      shop.append(towerGrid);
    }

    const footer = document.createElement("div");
    footer.className = "game-controls__footer";
    const hint = document.createElement("span");
    hint.className = "game-controls__hint";
    hint.textContent = state.hint ?? "";
    footer.append(hint);

    if (state.inventory) {
      const inventory = state.inventory;
      const total = inventory.items.reduce((sum, entry) => sum + entry.count, 0);
      footer.append(inventory.pendingItemId
        ? makeActionButton("Takmayı iptal et", "game-controls__inventory-button", true, () => dispatch({ action: "cancelEquip" }))
        : makeActionButton(`Envanter ${total}`, "game-controls__inventory-button", true, () => dispatch({ action: inventory.open ? "closeInventory" : "openInventory" })));
    }

    if (state.zeynepChain) {
      const chain = document.createElement("span");
      chain.className = `game-controls__chain${state.zeynepChain.ready ? " game-controls__chain--ready" : ""}`;
      chain.textContent = `Zincir ${state.zeynepChain.value}/2`;
      footer.append(chain);
    }

    if (state.showOrientationToggle) {
      footer.append(makeActionButton(state.orientation === "vertical" ? "Yon: Dikey" : "Yon: Yatay", "game-controls__orientation", true, () => dispatch({ action: "toggleAbartiOrientation" })));
    }

    if (state.melisStance) {
      const stance = state.melisStance;
      const toStress = stance.current === "approval";
      const bedel = stance.evolutionCost !== undefined
        ? ` ${Math.floor(stance.stress)}/${stance.evolutionCost}`
        : " tamam";
      footer.append(makeActionButton(
        `Seri→${stance.current === "stress" ? "Stres" : "Onay"} | Evrim${bedel}`,
        "game-controls__melis-stance",
        true,
        () => dispatch({ action: "setMelisStance", stance: toStress ? "stress" : "approval" })
      ));
    }

    if (state.workerHire) {
      const hire = state.workerHire;
      footer.append(makeActionButton(
        `İşçi Al ${hire.cost}g`,
        "game-controls__worker-hire",
        true,
        () => dispatch({ action: hire.open ? "closeWorkerHire" : "openWorkerHire" })
      ));
    }

    panel.append(skillRow, actionRow, shop, footer);
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
      window.addEventListener("pointermove", handleTowerDragMove, { passive: false });
      window.addEventListener("pointerup", handleTowerDragEnd, { passive: false });
      window.addEventListener("pointercancel", handleTowerDragEnd, { passive: false });
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
  /** Karaktere ozel sayaclar. Bos gelirse hic cizilmez. */
  extras: Array<{ label: string; value: string }>;
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
  continueVisible: boolean;
  continueWaiting: boolean;
  perfOpen: boolean;
  perfText: string;
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
    status: "Sunucu kontrol ediliyor...", stats: EMPTY_HUD_STATS, ping: "-- ms", pingTone: "warn",
    continueVisible: false, continueWaiting: false, perfOpen: false, perfText: "", audioOpen: false, musicVolume: 0.5, voiceVolume: 0.5
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
      <div class="game-hud__actions">
        <button data-hud="perf" aria-label="Performans bilgisi">i</button>
        <button data-hud="audio" aria-label="Ses ayarları">♪</button>
        <button class="game-hud__continue" data-hud="continue" hidden>Devam</button>
      </div>
    </div>
    <div class="game-hud__strip" data-hud-strip></div>
    <p class="game-hud__status" data-hud-status hidden></p>
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
  }));

  /**
   * Ikincil serit.
   *
   * Bir donem bu serit tasinca yatay kayiyordu. Ortusmeyi cozuyordu ama daha
   * kotusunu uretti: Zeynep'te icerik gorunen alanin iki kati oldugu icin
   * itibar/zincir/kalite sagda tumden ekran disinda kaliyordu -- ki bunlar
   * ultinin kademesini belirleyen sayaclar, yani oyunun ortasinda gorulmesi
   * gereken seyler. Yatay kaydirma masaustunde zaten zahmetli, mobilde ise
   * gizli bir hareket; oyuncunun kaydirmayi denemesi beklenemez.
   *
   * Bu yuzden serit artik sariyor ve icerik sikistirildi: mühimmat uc ayri
   * rozet yerine tek rozette uc renkli sayi, enerji ise yazi yerine simge.
   * Karakter sayaclari one alindi cunku genel kaynaklardan daha belirleyiciler.
   */
  let lastStripKey = "";
  const renderStrip = (stats: HudStats, ping: string, pingTone: HudState["pingTone"]) => {
    const chips: string[] = [
      `<span class="game-hud__chip"><i>KALAN</i><b>${stats.enemiesLeft}</b></span>`,
      ...stats.extras.map((extra) => `<span class="game-hud__chip"><i>${escapeHudText(extra.label)}</i><b>${escapeHudText(extra.value)}</b></span>`),
      `<span class="game-hud__chip" title="Enerji"><i aria-hidden="true">⚡</i><b>${Math.floor(stats.energy)}/${Math.floor(stats.maxEnergy)}</b></span>`,
      `<span class="game-hud__chip game-hud__chip--ammo" title="Mermi · Aura · Güç">`
        + `<em class="is-bullet" aria-hidden="true">▪</em><b>${Math.floor(stats.ammo.bullet)}</b>`
        + `<em class="is-aura" aria-hidden="true">◈</em><b>${Math.floor(stats.ammo.auraCrystal)}</b>`
        + `<em class="is-power" aria-hidden="true">✦</em><b>${Math.floor(stats.ammo.powerCrystal)}</b>`
        + `</span>`,
      `<span class="game-hud__chip"><i>XP</i><b>${formatXp(stats.experience)}</b></span>`,
      `<span class="game-hud__chip game-hud__chip--ping game-hud__chip--${pingTone}" title="Gecikme"><i aria-hidden="true">●</i><b>${escapeHudText(ping)}</b></span>`
    ];
    const key = chips.join("");
    if (key === lastStripKey) return;
    lastStripKey = key;
    stripNode.innerHTML = key;
  };

  let lastPopupKey = "";
  const renderPopups = (next: HudState) => {
    const key = `${next.perfOpen ? `perf:${next.perfText}` : ""}|${next.audioOpen ? `audio:${next.musicVolume}:${next.voiceVolume}` : ""}`;
    if (key === lastPopupKey) return;
    lastPopupKey = key;
    popupsNode.innerHTML = `
      ${next.perfOpen ? `<section class="game-hud__popup game-hud__popup--perf"><button data-hud="perf">×</button><strong>Performans Profili</strong><pre>${escapeHudText(next.perfText)}</pre></section>` : ""}
      ${next.audioOpen ? `<section class="game-hud__popup game-hud__popup--audio"><button data-hud="audio">×</button><strong>Ses ayarları</strong><label>Müzik <input data-volume="music" type="range" min="0" max="1" step="0.01" value="${next.musicVolume}"></label><label>Seslendirme <input data-volume="voice" type="range" min="0" max="1" step="0.01" value="${next.voiceVolume}"></label></section>` : ""}
    `;
    popupsNode.querySelectorAll<HTMLElement>("[data-hud]").forEach((element) => element.addEventListener("pointerup", (event) => {
      event.stopPropagation();
      if (element.dataset.hud === "perf") dispatch("togglePerfHud");
      if (element.dataset.hud === "audio") dispatch("toggleAudioHud");
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

    renderStrip(state.stats, state.ping, state.pingTone);

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
