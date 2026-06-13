import type Phaser from "phaser";
import {
  characters,
  getTowerUpgradeCost,
  type CharacterDefinition,
  type CharacterId,
  type SkillDefinition,
  type TowerDefinition
} from "@karayel/shared";
import { getPlayerName } from "./config";

type ViewName = "home" | "archive" | "detail";
type DetailItem = {
  key: string;
  title: string;
  label: string;
  type: "passive" | "ultimate" | "skill" | "tower";
  color: string;
  body: string;
};

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
  let phaserReady = false;

  const render = (view: ViewName) => {
    root.innerHTML = renderShell(view, selectedCharacter, selectedDetail);
    bindUi(view);
  };

  const startGame = () => {
    if (!phaserReady) {
      return;
    }
    root.classList.add("menu-root--hidden");
    gameRoot.classList.remove("game-root--hidden");
    game.scene.stop("preloader");
    game.scene.start("game", { characterId: selectedCharacter.id });
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
  };

  gameRoot.classList.add("game-root--hidden");
  root.classList.add("menu-root--loading");
  window.addEventListener("karayel:phaser-ready", () => {
    phaserReady = true;
    root.classList.remove("menu-root--loading");
  }, { once: true });
  render("home");
}

function renderShell(view: ViewName, selectedCharacter: CharacterDefinition, selectedDetail: DetailItem) {
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
        <button class="command command--ghost" data-start-game>Başlat</button>
      </footer>

      <aside class="connection-slate">
        <span>${escapeHtml(getPlayerName())}</span>
        <strong>Frankfurt Shard</strong>
      </aside>
    </div>
  `;
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
  const level10Damage = tower.damage * (1 + (10 - 1) * 0.42);
  const level10Interval = Math.max(tower.id === "warrior-5" ? 50 : 80, tower.fireIntervalMs * (1 - (10 - 1) * 0.1));
  const l1Dps = formatDps(tower.damage, tower.fireIntervalMs);
  const l10Dps = formatDps(level10Damage, level10Interval);
  return {
    key: `tower-${tower.id}`,
    title: tower.name,
    label: tower.role,
    type: "tower",
    color: colorNumberToHex(tower.color),
    body: [
      tower.description ?? tower.role,
      `Sınıf: ${tower.classType ?? "hybrid"} | Hasar: ${tower.damageType ?? "none"} | Vuruş: ${tower.hitType ?? "impact"}`,
      `Maliyet: ${tower.cost}g | L2/L3/L4: ${getTowerUpgradeCost(tower.upgradeCost, 1)}/${getTowerUpgradeCost(tower.upgradeCost, 2)}/${getTowerUpgradeCost(tower.upgradeCost, 3)}g`,
      `Menzil: ${tower.id === "warrior-2" ? "Global" : tower.range} | Mermi Hızı: ${tower.projectileSpeed}`,
      `L1 DPS: ${l1Dps} | L10 Baz DPS: ${l10Dps}`,
      `Mekanik: ${(tower.mechanics ?? []).join(", ") || "standart"}`
    ].join("\n")
  };
}

function stat(label: string, value: string | number) {
  return `<span class="stat"><small>${label}</small><strong>${value}</strong></span>`;
}

function formatDps(damage: number, intervalMs: number) {
  if (damage <= 0 || intervalMs <= 0) {
    return "0.0";
  }
  return (damage / (intervalMs / 1000)).toFixed(1);
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

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
