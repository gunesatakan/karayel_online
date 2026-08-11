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
  ultimate?: { charge: number; ready: boolean; choiceOpen: boolean; needsChoice: boolean };
  underworldMode?: { current: "approval" | "stress"; pullCount: number; canEdit: boolean };
  ammoLogistics?: { enabled: boolean; canEdit: boolean };
  standby?: { active: boolean; waking: boolean; canEdit: boolean };
  workerRevive?: { count: number; remainingSeconds: number; enabled: boolean; cost: number };
  upgrade?: { label: string; enabled: boolean };
  sell?: { label: string; enabled: boolean };
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
      for (const tower of state.towers ?? []) {
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

    if (state.workerRevive) {
      footer.append(makeActionButton(
        `İşçi${state.workerRevive.count > 1 ? ` x${state.workerRevive.count}` : ""} ${state.workerRevive.remainingSeconds}s / ${state.workerRevive.cost}g`,
        "game-controls__worker-revive",
        state.workerRevive.enabled,
        () => dispatch({ action: "reviveLogisticsWorker" })
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

export type HudState = {
  status: string;
  stats: string;
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
    status: "Sunucu kontrol ediliyor...", stats: "Gold 0  Can 100  Wave 1", ping: "-- ms", pingTone: "warn",
    continueVisible: false, continueWaiting: false, perfOpen: false, perfText: "", audioOpen: false, musicVolume: 0.5, voiceVolume: 0.5
  };

  const dispatch = (action: string, value?: number) => window.dispatchEvent(new CustomEvent("karayel:control-action", { detail: { action, value } }));
  const syncCanvasBounds = () => {
    const rect = game.canvas?.getBoundingClientRect();
    if (!rect) return;
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.width = `${rect.width}px`;
  };
  const render = (next: HudState) => {
    state = next;
    root.classList.remove("game-hud--hidden");
    root.innerHTML = `
      <div class="game-hud__brand"><strong>Karayel TD</strong><span>${state.status}</span><b>${state.stats}</b></div>
      <div class="game-hud__actions">
        <span class="game-hud__ping game-hud__ping--${state.pingTone}">${state.ping}</span>
        <button data-hud="perf" aria-label="Performans bilgisi">i</button>
        <button data-hud="audio">Ses</button>
        ${state.continueVisible ? `<button class="game-hud__continue" data-hud="continue" ${state.continueWaiting ? "disabled" : ""}>${state.continueWaiting ? "Bekleniyor" : "Devam"}</button>` : ""}
      </div>
      ${state.perfOpen ? `<section class="game-hud__popup game-hud__popup--perf"><button data-hud="perf">×</button><strong>Performans Profili</strong><pre>${state.perfText}</pre></section>` : ""}
      ${state.audioOpen ? `<section class="game-hud__popup game-hud__popup--audio"><button data-hud="audio">×</button><strong>Ses ayarları</strong><label>Müzik <input data-volume="music" type="range" min="0" max="1" step="0.01" value="${state.musicVolume}"></label><label>Seslendirme <input data-volume="voice" type="range" min="0" max="1" step="0.01" value="${state.voiceVolume}"></label></section>` : ""}
    `;
    root.querySelectorAll<HTMLElement>("[data-hud]").forEach((element) => element.addEventListener("pointerup", (event) => {
      event.stopPropagation();
      const action = element.dataset.hud;
      if (action === "continue") dispatch("continueWave");
      if (action === "perf") dispatch("togglePerfHud");
      if (action === "audio") dispatch("toggleAudioHud");
    }));
    root.querySelectorAll<HTMLInputElement>("[data-volume]").forEach((input) => input.addEventListener("input", () => {
      dispatch(input.dataset.volume === "music" ? "setMusicVolume" : "setVoiceVolume", Number(input.value));
    }));
  };

  game.events.on("game:hud-state", render);
  game.events.on("game:hud-hide", () => root.classList.add("game-hud--hidden"));
  window.addEventListener("resize", syncCanvasBounds);
  window.addEventListener("orientationchange", syncCanvasBounds);
  new ResizeObserver(syncCanvasBounds).observe(document.body);
  syncCanvasBounds();
}
