import type Phaser from "phaser";
import {
  characters,
  MAP_STORAGE_KEY,
  createDefaultEditableMap,
  getTowerUpgradeCost,
  getTile,
  normalizeMapData,
  setTile,
  type CharacterDefinition,
  type CharacterId,
  type EditableMapData,
  type MapTileKind,
  type SkillDefinition,
  type TowerDefinition
} from "@karayel/shared";
import { getPlayerName } from "./config";

type ViewName = "home" | "archive" | "detail" | "map";
type DetailItem = {
  key: string;
  title: string;
  label: string;
  type: "passive" | "ultimate" | "skill" | "tower";
  color: string;
  body: string;
};

const REAL_DPS_GAME_SPEED_MULTIPLIER = 0.8;

const classColor: Record<CharacterId, string> = {
  zeynep: "#ec4899",
  warrior: "#22c55e",
  archer: "#38bdf8",
  mage: "#a78bfa",
  healer: "#f9a8d4",
  tank: "#facc15",
  onur: "#14b8a6"
};

export function setupMenuUi(game: Phaser.Game) {
  const root = document.querySelector<HTMLDivElement>("#menu-root");
  const gameRoot = document.querySelector<HTMLDivElement>("#game");
  if (!root || !gameRoot) {
    return;
  }

  let selectedCharacter = characters[0];
  let selectedDetail = getDetailItems(selectedCharacter)[0];
  let selectedMap = loadStoredMap();
  let selectedMapTool: MapTileKind = "road";
  let phaserReady = false;

  const render = (view: ViewName) => {
    root.innerHTML = renderShell(view, selectedCharacter, selectedDetail, selectedMap, selectedMapTool);
    bindUi(view);
  };

  const startGame = () => {
    if (!phaserReady) {
      return;
    }
    root.classList.add("menu-root--hidden");
    gameRoot.classList.remove("game-root--hidden");
    game.scene.stop("preloader");
    game.scene.start("game", { characterId: selectedCharacter.id, mapData: selectedMap });
  };

  const bindUi = (view: ViewName) => {
    root.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
      button.addEventListener("click", () => render(button.dataset.view as ViewName));
    });

    root.querySelectorAll<HTMLElement>("[data-character-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const character = characters.find((candidate) => candidate.id === button.dataset.characterId);
        if (!character) {
          return;
        }
        selectedCharacter = character;
        selectedDetail = getDetailItems(character)[0];
        render(view === "home" ? "detail" : view);
      });
    });

    root.querySelectorAll<HTMLElement>("[data-detail-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const detail = getDetailItems(selectedCharacter).find((item) => item.key === button.dataset.detailKey);
        if (!detail) {
          return;
        }
        selectedDetail = detail;
        render("detail");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-start-game]").forEach((button) => {
      button.addEventListener("click", startGame);
    });

    root.querySelectorAll<HTMLElement>("[data-map-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedMapTool = button.dataset.mapTool as MapTileKind;
        render("map");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-map-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        const col = Number(button.dataset.col);
        const row = Number(button.dataset.row);
        if (Number.isNaN(col) || Number.isNaN(row)) {
          return;
        }
        const nextMap = normalizeMapData(selectedMap);
        if (selectedMapTool === "spawn") {
          replaceTileKind(nextMap, "spawn", "road");
        }
        if (selectedMapTool === "nexus") {
          replaceTileKind(nextMap, "nexus", "road");
        }
        setTile(nextMap, col, row, selectedMapTool);
        selectedMap = nextMap;
        saveStoredMap(selectedMap);
        render("map");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-map-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.mapAction;
        if (action === "reset") {
          selectedMap = createDefaultEditableMap();
          saveStoredMap(selectedMap);
        }
        if (action === "clear") {
          selectedMap = createDefaultEditableMap();
          selectedMap.tiles = selectedMap.tiles.map(() => "tower");
          saveStoredMap(selectedMap);
        }
        render("map");
      });
    });
  };

  gameRoot.classList.add("game-root--hidden");
  root.classList.add("menu-root--loading");
  window.addEventListener("karayel:phaser-ready", () => {
    phaserReady = true;
    root.classList.remove("menu-root--loading");
  }, { once: true });
  render("home");
}

function renderShell(view: ViewName, selectedCharacter: CharacterDefinition, selectedDetail: DetailItem, selectedMap = loadStoredMap(), selectedMapTool: MapTileKind = "road") {
  return `
    <main class="menu-shell" data-screen="${view}">
      <div class="menu-backdrop" aria-hidden="true">
        <div class="backdrop__horizon"></div>
        <div class="backdrop__gate"></div>
        <div class="backdrop__grid"></div>
        <div class="backdrop__noise"></div>
      </div>
      <section class="menu-stage">
        ${view === "home" ? renderHome(selectedCharacter) : ""}
        ${view === "archive" ? renderArchive(selectedCharacter) : ""}
        ${view === "detail" ? renderDetail(selectedCharacter, selectedDetail) : ""}
        ${view === "map" ? renderMapEditor(selectedMap, selectedMapTool) : ""}
      </section>
    </main>
  `;
}

function renderHome(selectedCharacter: CharacterDefinition) {
  return `
    <div class="home-screen">
      <header class="brand-lockup">
        <p class="eyebrow">KARAYEL ONLINE</p>
        <h1>Karayel</h1>
        <div class="brand-rule"><span></span><span></span><span></span></div>
      </header>

      <section class="operator-altar" style="--accent: ${classColor[selectedCharacter.id]}">
        <div class="operator-portrait">
          <span>${initials(selectedCharacter.displayName)}</span>
        </div>
        <div class="operator-copy">
          <p class="kicker">Seçili Operatör</p>
          <h2>${escapeHtml(selectedCharacter.displayName)}</h2>
          <p>${escapeHtml(selectedCharacter.role)}</p>
        </div>
        <div class="operator-stats">
          ${stat("HP", selectedCharacter.maxHp)}
          ${stat("DMG", selectedCharacter.damage)}
          ${stat("ATK", selectedCharacter.fireIntervalMs)}
        </div>
      </section>

      <section class="quick-roster" aria-label="Operatörler">
        ${characters.map((character) => `
          <button class="roster-token ${character.id === selectedCharacter.id ? "is-active" : ""}" data-character-id="${character.id}" style="--accent: ${classColor[character.id]}">
            <span>${initials(character.displayName)}</span>
          </button>
        `).join("")}
      </section>

      <footer class="home-actions">
        <button class="command command--primary" data-view="archive">Operatör Arşivi</button>
        <button class="command command--ghost" data-view="map">Harita Tasarla</button>
        <button class="command command--ghost" data-start-game>Başlat</button>
      </footer>

      <aside class="connection-slate">
        <span>${escapeHtml(getPlayerName())}</span>
        <strong>Frankfurt Shard</strong>
      </aside>
    </div>
  `;
}

function renderMapEditor(map: EditableMapData, selectedTool: MapTileKind) {
  const counts = getMapCounts(map);
  return `
    <div class="map-screen">
      <header class="screen-topbar detail-topbar">
        <button class="icon-command" data-view="home" aria-label="Ana menü">‹</button>
        <div>
          <p class="eyebrow">Map Forge</p>
          <h1>Harita Tasarla</h1>
        </div>
        <button class="command command--small" data-start-game>Başlat</button>
      </header>

      <section class="map-tools" aria-label="Harita araçları">
        ${renderTool("road", "Yol", selectedTool)}
        ${renderTool("tower", "Kule", selectedTool)}
        ${renderTool("spawn", "Spawn", selectedTool)}
        ${renderTool("nexus", "Nexus", selectedTool)}
        ${renderTool("empty", "Boş", selectedTool)}
      </section>

      <section class="map-editor-card">
        <div class="map-grid" style="--cols: ${map.cols}; --rows: ${map.rows}">
          ${map.tiles.map((tile, index) => {
            const col = index % map.cols;
            const row = Math.floor(index / map.cols);
            return `<button class="map-cell map-cell--${tile}" data-map-cell data-col="${col}" data-row="${row}" aria-label="${col},${row} ${tile}"></button>`;
          }).join("")}
        </div>
      </section>

      <section class="map-summary">
        <span>Spawn <strong>${counts.spawn}</strong></span>
        <span>Nexus <strong>${counts.nexus}</strong></span>
        <span>Yol <strong>${counts.road}</strong></span>
        <span>Kule <strong>${counts.tower}</strong></span>
      </section>

      <footer class="map-actions">
        <button class="command command--ghost" data-map-action="reset">Varsayılan</button>
        <button class="command command--ghost" data-map-action="clear">Temizle</button>
      </footer>
    </div>
  `;
}

function renderTool(tool: MapTileKind, label: string, selectedTool: MapTileKind) {
  return `<button class="map-tool map-tool--${tool} ${selectedTool === tool ? "is-active" : ""}" data-map-tool="${tool}">${label}</button>`;
}

function renderArchive(selectedCharacter: CharacterDefinition) {
  return `
    <div class="archive-screen">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="Ana menü">‹</button>
        <div>
          <p class="eyebrow">Operator Archive</p>
          <h1>Operatör Seçimi</h1>
        </div>
      </header>

      <section class="archive-list">
        ${characters.map((character) => `
          <button class="archive-card ${character.id === selectedCharacter.id ? "is-active" : ""}" data-character-id="${character.id}" style="--accent: ${classColor[character.id]}">
            <span class="archive-card__mark">${initials(character.displayName)}</span>
            <span class="archive-card__body">
              <strong>${escapeHtml(character.displayName)}</strong>
              <small>${escapeHtml(character.role)}</small>
            </span>
            <span class="archive-card__stats">${character.damage} DMG / ${character.fireIntervalMs} ATK</span>
          </button>
        `).join("")}
      </section>

      <section class="selected-dossier" style="--accent: ${classColor[selectedCharacter.id]}">
        <p class="kicker">Aktif Dosya</p>
        <h2>${escapeHtml(selectedCharacter.displayName)}</h2>
        <p>${escapeHtml(selectedCharacter.summary)}</p>
        <button class="command command--primary" data-view="detail">Dosyayı Aç</button>
      </section>
    </div>
  `;
}

function renderDetail(character: CharacterDefinition, selectedDetail: DetailItem) {
  const details = getDetailItems(character);
  return `
    <div class="detail-screen" style="--accent: ${classColor[character.id]}">
      <header class="screen-topbar detail-topbar">
        <button class="icon-command" data-view="archive" aria-label="Arşive dön">‹</button>
        <div>
          <p class="eyebrow">Operator Dossier</p>
          <h1>${escapeHtml(character.displayName)}</h1>
        </div>
        <button class="command command--small" data-start-game>Başlat</button>
      </header>

      <section class="dossier-hero">
        <div class="dossier-portrait"><span>${initials(character.displayName)}</span></div>
        <div class="dossier-copy">
          <strong>${escapeHtml(character.role)}</strong>
          <p>${escapeHtml(character.summary)}</p>
        </div>
      </section>

      <section class="stat-grid">
        ${stat("HP", character.maxHp)}
        ${stat("DMG", character.damage)}
        ${stat("ATK", `${character.fireIntervalMs}ms`)}
        ${stat("VEL", character.projectileSpeed)}
      </section>

      <section class="loadout-grid">
        ${details.map((item) => `
          <button class="loadout-chip ${item.key === selectedDetail.key ? "is-active" : ""}" data-detail-key="${item.key}" style="--item: ${item.color}">
            <span>${item.type}</span>
            <strong>${escapeHtml(item.title)}</strong>
          </button>
        `).join("")}
      </section>

      <article class="intel-panel" style="--item: ${selectedDetail.color}">
        <span>${selectedDetail.type.toUpperCase()} / ${escapeHtml(selectedDetail.label)}</span>
        <h2>${escapeHtml(selectedDetail.title)}</h2>
        <p>${escapeHtml(selectedDetail.body).replaceAll("\n", "<br />")}</p>
      </article>
    </div>
  `;
}

function getDetailItems(character: CharacterDefinition): DetailItem[] {
  return [
    {
      key: "passive",
      title: "Pasif",
      label: "Sabit Etki",
      type: "passive",
      color: "#34d399",
      body: character.passive
    },
    {
      key: "ultimate",
      title: "Ulti",
      label: "Kırılma Protokolü",
      type: "ultimate",
      color: "#facc15",
      body: character.ultimate
    },
    ...character.skills.map(skillToDetail),
    ...character.towers.map(towerToDetail)
  ];
}

function skillToDetail(skill: SkillDefinition): DetailItem {
  return {
    key: `skill-${skill.id}`,
    title: skill.name,
    label: `${Math.round(skill.cooldownMs / 1000)}s Cooldown`,
    type: "skill",
    color: "#22d3ee",
    body: `${skill.description}\nBekleme: ${(skill.cooldownMs / 1000).toFixed(1)} saniye`
  };
}

function towerToDetail(tower: TowerDefinition): DetailItem {
  const level1Damage = getTowerLevelDamage(tower, 1);
  const level1Interval = getTowerLevelInterval(tower, 1);
  const level10Damage = getTowerLevelDamage(tower, 10);
  const level10Interval = getTowerLevelInterval(tower, 10);
  const l1Dps = formatDps(level1Damage, level1Interval);
  const l10Dps = formatDps(level10Damage, level10Interval);
  const parts = [
    tower.description ?? tower.role,
    `Sınıf: ${tower.classType ?? "hybrid"} | Hasar: ${tower.damageType ?? "none"} | Vuruş: ${tower.hitType ?? "impact"}`,
    `Maliyet: ${tower.cost}g | L2/L3/L4: ${getTowerUpgradeCost(tower.upgradeCost, 1)}/${getTowerUpgradeCost(tower.upgradeCost, 2)}/${getTowerUpgradeCost(tower.upgradeCost, 3)}g`,
    `Menzil: ${tower.id === "warrior-2" ? "Global" : tower.range} | Mermi Hızı: ${tower.projectileSpeed}`,
    `L1 DPS: ${l1Dps} | L10 Baz DPS: ${l10Dps}`,
    `Mekanik: ${(tower.mechanics ?? []).join(", ") || "standart"}`
  ];
  if (tower.id === "warrior-2") {
    parts.push("Uzun link buff: Ayni kuleye 5 dalga bagli kalirsa impact/carpma vuruslu bagli kule +%20 hasar alir. 10 dalga bagli kalirsa bagli kulenin her vurusuna hedef max HP'sinin %1'i kadar ek hasar eklenir.");
  }
  if (tower.id === "warrior-4") {
    parts.push("Denge: Impact/carpma oldugu icin level ile saldiri hizi artmaz; DPS korunacak sekilde hasari agirlasir. Lv6 yaklasik 427 DPS, Lv10 yaklasik 1000 DPS. Lv3+ korku acar.");
  }
  if (tower.id === "warrior-5") {
    parts.push("Denge: Normal lazer gercek araligi Lv1 0.20sn, Lv5 0.16sn, Lv10 0.12sn. Overdrive bunun yarisidir: 0.10sn, 0.08sn, 0.06sn. DPS onceki dengeye yakin korunur.");
  }
  if (tower.id === "warrior-6") {
    parts.push("Denge: Impact/carpma oldugu icin level ile baz saldiri hizi artmaz; DPS korunacak sekilde hasari agirlasir. Aktif stack ritmi ayrica calisir. Lv10+6dalga+15stack+2chain yaklasik 2114 DPS.");
  }

  return {
    key: `tower-${tower.id}`,
    title: tower.name,
    label: tower.role,
    type: "tower",
    color: colorNumberToHex(tower.color),
    body: parts.join("\n")
  };
}

function stat(label: string, value: string | number) {
  return `<span class="stat"><small>${label}</small><strong>${value}</strong></span>`;
}

function formatDps(damage: number, intervalMs: number) {
  if (damage <= 0 || intervalMs <= 0) {
    return "0.0";
  }
  return ((damage / (intervalMs / 1000)) * REAL_DPS_GAME_SPEED_MULTIPLIER).toFixed(1);
}

function getTowerLevelDamage(tower: TowerDefinition, level: number) {
  let damage = tower.damage * (1 + (level - 1) * 0.42);

  if (tower.id === "warrior-4") {
    damage *= 1 + (level - 1) * 0.018;
  }

  if (tower.id === "warrior-5") {
    damage *= getDebugLaserDamageMultiplier(level);
  }

  if (tower.id === "warrior-6") {
    damage *= getUcubeGrowthDamageMultiplier(level);
  }

  if (tower.hitType === "impact") {
    damage *= getImpactLevelDamageCompensation(tower, level);
  }

  return damage;
}

function getTowerLevelInterval(tower: TowerDefinition, level: number) {
  if (tower.id === "warrior-5") {
    return getDebugLaserFireInterval(level, false);
  }

  if (tower.hitType === "impact") {
    return tower.fireIntervalMs;
  }

  const levelMultiplier = tower.id === "warrior-4" ? 1 - (level - 1) * 0.17 : 1 - (level - 1) * 0.1;
  return Math.max(80, tower.fireIntervalMs * levelMultiplier);
}

function getImpactLevelDamageCompensation(tower: TowerDefinition, level: number) {
  const levelMultiplier = tower.id === "warrior-4" ? 1 - (level - 1) * 0.17 : 1 - (level - 1) * 0.1;
  const previousInterval = Math.max(80, tower.fireIntervalMs * levelMultiplier);
  return tower.fireIntervalMs / Math.max(1, previousInterval);
}

function getDebugLaserDamageMultiplier(level: number) {
  const multipliers = [1.3333, 1.5904, 1.89, 2.2505, 2.432, 2.508, 2.5632, 2.5976, 2.6112, 2.604];
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}

function getDebugLaserFireInterval(level: number, overdrive: boolean) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  const normalRealMs = clampedLevel <= 5
    ? 200 - (clampedLevel - 1) * 10
    : 160 - (clampedLevel - 5) * 8;
  const realMs = overdrive ? normalRealMs / 2 : normalRealMs;
  return realMs * REAL_DPS_GAME_SPEED_MULTIPLIER;
}

function getUcubeGrowthDamageMultiplier(level: number) {
  const multipliers = [0.45, 0.4, 0.34, 0.34, 0.35, 0.42, 0.24, 0.25, 0.64, 1.05];
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function colorNumberToHex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function loadStoredMap() {
  try {
    const rawMap = localStorage.getItem(MAP_STORAGE_KEY);
    return rawMap ? normalizeMapData(JSON.parse(rawMap)) : createDefaultEditableMap();
  } catch {
    return createDefaultEditableMap();
  }
}

function saveStoredMap(map: EditableMapData) {
  localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(normalizeMapData(map)));
}

function replaceTileKind(map: EditableMapData, from: MapTileKind, to: MapTileKind) {
  map.tiles = map.tiles.map((tile) => tile === from ? to : tile);
}

function getMapCounts(map: EditableMapData) {
  return {
    spawn: map.tiles.filter((tile) => tile === "spawn").length,
    nexus: map.tiles.filter((tile) => tile === "nexus").length,
    road: map.tiles.filter((tile) => tile === "road").length,
    tower: map.tiles.filter((tile) => tile === "tower").length,
    empty: map.tiles.filter((tile) => tile === "empty").length
  };
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
