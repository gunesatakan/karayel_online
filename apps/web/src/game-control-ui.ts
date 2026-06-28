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
  upgrade?: { label: string; enabled: boolean };
  sell?: { label: string; enabled: boolean };
  selectedStats?: string[];
};

type ControlAction = {
  action: string;
  towerId?: string;
  slot?: number;
  tier?: ZeynepTier;
  mode?: "attack" | "repair";
  underworldMode?: "approval" | "stress";
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
    if (!state.visible) {
      root.replaceChildren();
      return;
    }

    root.replaceChildren();

    if (state.melisSpectrum) {
      root.append(makeMelisSpectrum(state.melisSpectrum));
    }

    const panel = document.createElement("section");
    panel.className = "game-controls__panel";

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
      if (state.underworldMode) {
        const modeRow = document.createElement("div");
        modeRow.className = "game-controls__underworld-mode";
        modeRow.append(
          makeUnderworldModeButton("Onay", "approval", state.underworldMode),
          makeUnderworldModeButton("Stres", "stress", state.underworldMode)
        );
        shop.append(modeRow);
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

    if (state.zeynepChain) {
      const chain = document.createElement("span");
      chain.className = `game-controls__chain${state.zeynepChain.ready ? " game-controls__chain--ready" : ""}`;
      chain.textContent = `Zincir ${state.zeynepChain.value}/2`;
      footer.append(chain);
    }

    if (state.showOrientationToggle) {
      footer.append(makeActionButton(state.orientation === "vertical" ? "Yon: Dikey" : "Yon: Yatay", "game-controls__orientation", true, () => dispatch({ action: "toggleAbartiOrientation" })));
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
    const approvalValue = Math.floor(spectrum.approval);
    const stressValue = Math.floor(spectrum.stress);
    const approvalPercent = Math.round((1 - spectrum.ratio) * 100);
    const stressPercent = Math.round(spectrum.ratio * 100);
    const stressDominanceRatio = approvalValue <= 0 ? (stressValue > 0 ? Infinity : 0) : stressValue / approvalValue;
    const evolutionTier = stressValue <= approvalValue
      ? 0
      : stressDominanceRatio >= 3
        ? 3
        : stressDominanceRatio >= 2
          ? 2
          : stressDominanceRatio >= 1.5
            ? 1
            : 0;

    const header = document.createElement("div");
    header.className = "melis-spectrum__header";

    const approval = document.createElement("span");
    approval.className = "melis-spectrum__side melis-spectrum__side--approval";
    approval.textContent = String(approvalValue);

    const stateLabel = document.createElement("strong");
    stateLabel.className = "melis-spectrum__state";
    stateLabel.textContent = `${approvalPercent}/${stressPercent}`;

    const stress = document.createElement("span");
    stress.className = "melis-spectrum__side melis-spectrum__side--stress";
    stress.textContent = String(stressValue);

    const evolution = document.createElement("span");
    evolution.className = `melis-spectrum__evolution melis-spectrum__evolution--${evolutionTier > 0 ? "ready" : "locked"}`;
    evolution.textContent = String(evolutionTier);

    header.append(approval, stateLabel, stress, evolution);

    const meter = document.createElement("div");
    meter.className = "melis-spectrum__meter";

    const marker = document.createElement("div");
    marker.className = "melis-spectrum__marker";
    meter.append(marker);

    shell.append(header, meter);
    return shell;
  };

  game.events.on("game:controls-state", render);
  window.addEventListener("resize", syncCanvasBounds);
  window.addEventListener("orientationchange", syncCanvasBounds);
  new ResizeObserver(syncCanvasBounds).observe(document.body);
  syncCanvasBounds();
}
