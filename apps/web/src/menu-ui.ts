import { Room } from "colyseus.js";
import type Phaser from "phaser";
import {
  characters,
  MAX_MAP_SCALE,
  MAP_STORAGE_KEY,
  createDefaultEditableMap,
  enemyCombatDefinitions,
  getEnemyDamageResistances,
  getTowerUpgradeCost,
  getTile,
  normalizeMapData,
  scaleEditableMap,
  setTile,
  type CharacterDefinition,
  type CharacterId,
  type EditableMapData,
  type EnemyRace,
  type EnemyType,
  type LobbyStateSnapshot,
  type MapScale,
  type MapTileKind,
  type RoomListingSnapshot,
  type SkillDefinition,
  type TowerDefinition
} from "@karayel/shared";
import { gameServerUrl, getPlayerName, roomsUrl } from "./config";
import { getSharedClient, setActiveLobbyRoom } from "./online-session";

type ViewName = "home" | "archive" | "detail" | "map" | "online" | "lobby" | "bestiary";
type DetailItem = {
  key: string;
  title: string;
  label: string;
  type: "passive" | "ultimate" | "skill" | "tower";
  color: string;
  body: string;
};

type OnlineTab = "create" | "join";
type SavedMapRecord = {
  id: string;
  name: string;
  map: EditableMapData;
  savedAt: number;
};

const REAL_DPS_GAME_SPEED_MULTIPLIER = 0.8;
const MAP_RECORDS_STORAGE_KEY = "karayel:custom-maps:v2";
const enemyRaceOrder: EnemyRace[] = ["meka", "spaceBug", "fourthDimensional", "holyGuardian", "fallen", "golem"];
const enemyTypeOrder: EnemyType[] = ["grunt", "brute", "runner", "shooter"];
const enemyTypeLabels: Record<EnemyType, string> = {
  grunt: "Sürü",
  brute: "Ezici",
  runner: "Koşucu",
  shooter: "Atıcı"
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

const enemyDossier: Record<EnemyType, {
  name: string;
  title: string;
  threat: string;
  summary: string;
}> = {
  grunt: {
    name: "Sürü Artığı",
    title: "Standart kara hedefi",
    threat: "Düşük",
    summary: "Dalgaların temel gövdesi. Özel savunması yoktur; sayıları arttıkça yolu tıkayıp kule hedeflerini dağıtır."
  },
  brute: {
    name: "Zırhlı Ezici",
    title: "Tank sınıfı kara hedefi",
    threat: "Yüksek",
    summary: "Yavaş ama dirençli ilerler. Zırhı, kalkanı ve yavaşlatma/korkuya direnci nedeniyle ham hasar testidir."
  },
  runner: {
    name: "Çatlak Koşucu",
    title: "Hızlı sızma hedefi",
    threat: "Orta",
    summary: "Düşük cana rağmen çok hızlıdır. Elektrik hasarına daha açık, slow etkilerine ise daha dirençlidir."
  },
  shooter: {
    name: "Uzak Atıcı",
    title: "Menzilli baskı hedefi",
    threat: "Orta",
    summary: "İlerlerken ateş edebilen varyanttır. Kalkanı ve can yenilemesiyle uzun çatışmalarda değer kazanır."
  }
};

export function setupMenuUi(game: Phaser.Game) {
  const root = document.querySelector<HTMLDivElement>("#menu-root");
  const gameRoot = document.querySelector<HTMLDivElement>("#game");
  if (!root || !gameRoot) {
    return;
  }

  let selectedCharacter = characters[0];
  let selectedDetail = getDetailItems(selectedCharacter)[0];
  let savedMaps = loadSavedMapRecords();
  let activeSavedMapId = savedMaps[0]?.id ?? "";
  let selectedMapName = savedMaps[0]?.name ?? "Harita 1";
  let selectedMap = savedMaps[0]?.map ?? loadStoredMap();
  let selectedMapTool: MapTileKind = "road";
  let selectedMapScale: MapScale = selectedMap.scale;
  let mapSaveStatus = savedMaps.length > 0 ? `"${selectedMapName}" yuklendi` : "Kayitli harita hazir";
  let onlineTab: OnlineTab = "create";
  let roomListings: RoomListingSnapshot[] = [];
  let currentLobbyRoom: Room | undefined;
  let currentLobbyState: LobbyStateSnapshot | undefined;
  let lobbyError = "";
  let onlineGameStarting = false;
  let phaserReady = false;

  const render = (view: ViewName) => {
    root.innerHTML = renderShell(
      view,
      selectedCharacter,
      selectedDetail,
      selectedMap,
      selectedMapTool,
      onlineTab,
      roomListings,
      currentLobbyState,
      currentLobbyRoom?.sessionId,
      selectedMapScale,
      mapSaveStatus,
      savedMaps,
      activeSavedMapId,
      selectedMapName,
      lobbyError
    );
    bindUi(view);
  };

  const startGame = (mode: "solo" | "online" = "solo") => {
    if (!phaserReady || onlineGameStarting) {
      return;
    }
    onlineGameStarting = true;
    root.classList.add("menu-root--hidden");
    gameRoot.classList.remove("game-root--hidden");
    game.scene.stop("preloader");
    game.scene.start("game", {
      characterId: selectedCharacter.id,
      mapData: mode === "online" && currentLobbyState ? scaleEditableMap(selectedMap, currentLobbyState.mapScale) : selectedMap
    });
  };

  const bindLobbyRoom = (room: Room) => {
    currentLobbyRoom = room;
    setActiveLobbyRoom(room);
    lobbyError = "";
    room.onMessage("lobby:state", (state: LobbyStateSnapshot) => {
      currentLobbyState = state;
      const localPlayer = state.players.find((player) => player.id === room.sessionId);
      if (localPlayer) {
        const character = characters.find((candidate) => candidate.id === localPlayer.characterId);
        if (character) {
          selectedCharacter = character;
          selectedDetail = getDetailItems(character)[0];
        }
      }
      if (state.started) {
        startGame("online");
        return;
      }
      render("lobby");
    });
    room.onMessage("lobby:error", (payload: { message?: string }) => {
      lobbyError = payload.message ?? "Oda islemi basarisiz.";
      render("lobby");
    });
    room.onMessage("lobby:started", () => {
      startGame("online");
    });
  };

  const refreshRoomListings = async () => {
    try {
      const response = await fetch(roomsUrl, {
        cache: "no-store",
        mode: "cors"
      });
      const payload = await response.json() as { rooms?: RoomListingSnapshot[] };
      roomListings = payload.rooms ?? [];
    } catch {
      roomListings = [];
      lobbyError = "Odalar alinamadi.";
    } finally {
      if (!currentLobbyRoom) {
        render("online");
      }
    }
  };

  const createRoom = async () => {
    try {
      lobbyError = "";
      const roomNameInput = root.querySelector<HTMLInputElement>("[data-room-name-input]");
      const roomName = roomNameInput?.value.trim() || `${selectedCharacter.displayName} Odasi`;
      const client = getSharedClient(gameServerUrl);
      const room = await client.create("match", {
        playerName: getPlayerName(),
        characterId: selectedCharacter.id,
        roomName,
        mapScale: selectedMapScale,
        mapData: selectedMap
      });
      bindLobbyRoom(room);
      render("lobby");
    } catch (error) {
      lobbyError = formatUiError(error, "Oda kurulurken hata olustu.");
      render("online");
    }
  };

  const joinRoom = async (roomId: string) => {
    try {
      lobbyError = "";
      const client = getSharedClient(gameServerUrl);
      const room = await client.joinById(roomId, {
        playerName: getPlayerName(),
        characterId: selectedCharacter.id
      });
      bindLobbyRoom(room);
      render("lobby");
    } catch (error) {
      lobbyError = formatUiError(error, "Odaya katilinamadi.");
      render("online");
    }
  };

  const bindUi = (view: ViewName) => {
    root.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextView = button.dataset.view as ViewName;
        if (nextView === "online") {
          void refreshRoomListings();
        }
        render(nextView);
      });
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
      button.addEventListener("click", () => startGame("solo"));
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
        mapSaveStatus = "Kaydedilmemis degisiklik var";
        render("map");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-load-map-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const record = savedMaps.find((candidate) => candidate.id === button.dataset.loadMapId);
        if (!record) {
          return;
        }
        activeSavedMapId = record.id;
        selectedMapName = record.name;
        selectedMap = normalizeMapData(record.map);
        selectedMapScale = selectedMap.scale;
        mapSaveStatus = `"${selectedMapName}" secildi`;
        render("map");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-map-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.mapAction;
        const nameInput = root.querySelector<HTMLInputElement>("[data-map-name-input]");
        selectedMapName = nameInput?.value.trim().slice(0, 28) || selectedMapName || `Harita ${savedMaps.length + 1}`;
        if (action === "new") {
          selectedMap = createDefaultEditableMap(selectedMapScale);
          activeSavedMapId = "";
          selectedMapName = `Harita ${savedMaps.length + 1}`;
          mapSaveStatus = "Yeni harita taslagi hazir";
        }
        if (action === "reset") {
          selectedMap = createDefaultEditableMap(selectedMap.scale);
          selectedMapScale = selectedMap.scale;
          mapSaveStatus = "Varsayilan harita taslagi hazir";
        }
        if (action === "clear") {
          selectedMap = createDefaultEditableMap(selectedMap.scale);
          selectedMap.tiles = selectedMap.tiles.map(() => "tower");
          selectedMapScale = selectedMap.scale;
          mapSaveStatus = "Bos harita hazir";
        }
        if (action === "save") {
          const saved = saveStoredMap(selectedMap, selectedMapName, activeSavedMapId);
          savedMaps = loadSavedMapRecords();
          activeSavedMapId = saved.id;
          selectedMapName = saved.name;
          selectedMap = saved.map;
          selectedMapScale = selectedMap.scale;
          mapSaveStatus = `"${selectedMapName}" kaydedildi`;
        }
        render("map");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-map-editor-scale]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextScale: MapScale = Number(button.dataset.mapEditorScale) === MAX_MAP_SCALE ? MAX_MAP_SCALE : 1;
        if (selectedMap.scale !== nextScale) {
          selectedMap = scaleEditableMap(selectedMap, nextScale);
          selectedMapScale = nextScale;
          mapSaveStatus = `${nextScale}x olcege cevrildi`;
        }
        render("map");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-online-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        onlineTab = (button.dataset.onlineTab as OnlineTab) || "create";
        if (onlineTab === "join") {
          void refreshRoomListings();
        }
        render("online");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-map-scale]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedMapScale = Number(button.dataset.mapScale) === MAX_MAP_SCALE ? MAX_MAP_SCALE : 1;
        render("online");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-create-room]").forEach((button) => {
      button.addEventListener("click", () => {
        void createRoom();
      });
    });

    root.querySelectorAll<HTMLElement>("[data-refresh-rooms]").forEach((button) => {
      button.addEventListener("click", () => {
        void refreshRoomListings();
      });
    });

    root.querySelectorAll<HTMLElement>("[data-room-join-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const roomId = button.dataset.roomJoinId;
        if (!roomId) {
          return;
        }
        void joinRoom(roomId);
      });
    });

    root.querySelectorAll<HTMLElement>("[data-lobby-character]").forEach((button) => {
      button.addEventListener("click", () => {
        const characterId = button.dataset.lobbyCharacter as CharacterId | undefined;
        currentLobbyRoom?.send("lobby:setCharacter", { characterId });
      });
    });

    root.querySelectorAll<HTMLElement>("[data-lobby-ready]").forEach((button) => {
      button.addEventListener("click", () => {
        const localPlayer = currentLobbyState?.players.find((player) => player.id === currentLobbyRoom?.sessionId);
        currentLobbyRoom?.send("lobby:setReady", { ready: !localPlayer?.ready });
      });
    });

    root.querySelectorAll<HTMLElement>("[data-lobby-start]").forEach((button) => {
      button.addEventListener("click", () => {
        currentLobbyRoom?.send("lobby:start");
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

function renderShell(
  view: ViewName,
  selectedCharacter: CharacterDefinition,
  selectedDetail: DetailItem,
  selectedMap = loadStoredMap(),
  selectedMapTool: MapTileKind = "road",
  onlineTab: OnlineTab = "create",
  roomListings: RoomListingSnapshot[] = [],
  lobbyState?: LobbyStateSnapshot,
  lobbySessionId?: string,
  selectedMapScale: MapScale = 1,
  mapSaveStatus = "",
  savedMaps: SavedMapRecord[] = [],
  activeSavedMapId = "",
  selectedMapName = "Harita 1",
  lobbyError = ""
) {
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
        ${view === "bestiary" ? renderBestiary() : ""}
        ${view === "map" ? renderMapEditor(selectedMap, selectedMapTool, mapSaveStatus, savedMaps, activeSavedMapId, selectedMapName) : ""}
        ${view === "online" ? renderOnline(selectedCharacter, onlineTab, roomListings, selectedMapScale, lobbyError) : ""}
        ${view === "lobby" ? renderLobby(selectedCharacter, lobbyState, lobbySessionId, lobbyError) : ""}
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
        <button class="command command--ghost" data-view="bestiary">Bestiary</button>
        <button class="command command--ghost" data-view="online">Online</button>
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

function renderOnline(
  selectedCharacter: CharacterDefinition,
  onlineTab: OnlineTab,
  roomListings: RoomListingSnapshot[],
  selectedMapScale: MapScale,
  lobbyError: string
) {
  return `
    <div class="archive-screen online-screen">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="Ana menü">‹</button>
        <div>
          <p class="eyebrow">Online Nexus</p>
          <h1>Oda Sistemi</h1>
        </div>
        <span class="status-pill">${escapeHtml(selectedCharacter.displayName)}</span>
      </header>

      <section class="online-tabs" aria-label="Online sekmeleri">
        <button class="command ${onlineTab === "create" ? "command--primary" : "command--ghost"}" data-online-tab="create">Oda Kur</button>
        <button class="command ${onlineTab === "join" ? "command--primary" : "command--ghost"}" data-online-tab="join">Odaya Katıl</button>
      </section>

      ${lobbyError ? `<p class="online-error">${escapeHtml(lobbyError)}</p>` : ""}

      ${onlineTab === "create" ? `
        <section class="selected-dossier online-card" style="--accent: ${classColor[selectedCharacter.id]}">
          <p class="kicker">Kurulum</p>
          <h2>Yeni Oda</h2>
          <label class="field-stack">
            <span>Oda adı</span>
            <input class="text-field" data-room-name-input value="${escapeHtml(`${selectedCharacter.displayName} Odasi`)}" maxlength="24" />
          </label>
          <div class="scale-picker">
            <span>Harita Ölçeği</span>
            <div class="scale-picker__buttons">
              <button class="scale-chip ${selectedMapScale === 1 ? "is-active" : ""}" data-map-scale="1">1x</button>
              <button class="scale-chip ${selectedMapScale === 2 ? "is-active" : ""}" data-map-scale="2">2x</button>
            </div>
          </div>
          <p class="online-note">2x seçildiğinde aynı ekrana iki kat kule karesi sığar; kuleler ve build alanları küçülür.</p>
          <button class="command command--primary" data-create-room>Odayı Kur</button>
        </section>
      ` : `
        <section class="archive-list online-room-list">
          <div class="online-list-head">
            <p class="kicker">Açık Odalar</p>
            <button class="command command--ghost command--small" data-refresh-rooms>Yenile</button>
          </div>
          ${roomListings.length > 0 ? roomListings.map((room) => `
            <button class="archive-card room-card" data-room-join-id="${room.roomId}" style="--accent: #22d3ee">
              <span class="archive-card__mark">${room.mapScale}x</span>
              <span class="archive-card__body">
                <strong>${escapeHtml(room.roomName)}</strong>
                <small>${escapeHtml(room.hostName)} · ${room.playerCount}/${room.maxPlayers} oyuncu · ${room.started ? "Devam ediyor" : "Lobi"}</small>
              </span>
            </button>
          `).join("") : `
            <div class="selected-dossier online-card">
              <p class="kicker">Bekleme</p>
              <h2>Şu an açık oda yok</h2>
              <p>Bir oda kurulduğunda bu listede görünecek.</p>
            </div>
          `}
        </section>
      `}
    </div>
  `;
}

function renderLobby(selectedCharacter: CharacterDefinition, lobbyState?: LobbyStateSnapshot, lobbySessionId = "", lobbyError = "") {
  if (!lobbyState) {
    return `
      <div class="archive-screen online-screen">
        <header class="screen-topbar">
          <button class="icon-command" data-view="online" aria-label="Online">‹</button>
          <div>
            <p class="eyebrow">Lobby</p>
            <h1>Oda bekleniyor</h1>
          </div>
        </header>
      </div>
    `;
  }

  const localPlayer = lobbyState.players.find((player) => player.id === lobbySessionId) ?? lobbyState.players[0];
  const localIsHost = lobbyState.hostId === localPlayer?.id;
  const everyoneReady = lobbyState.players.length > 0 && lobbyState.players.every((player) => player.ready);

  return `
    <div class="detail-screen lobby-screen" style="--accent: ${classColor[selectedCharacter.id]}">
      <header class="screen-topbar detail-topbar">
        <button class="icon-command" data-view="online" aria-label="Online">‹</button>
        <div>
          <p class="eyebrow">Room Lobby</p>
          <h1>${escapeHtml(lobbyState.roomName)}</h1>
        </div>
        <span class="status-pill">${lobbyState.mapScale}x Grid</span>
      </header>

      ${lobbyError ? `<p class="online-error">${escapeHtml(lobbyError)}</p>` : ""}

      <section class="selected-dossier online-card" style="--accent: ${classColor[selectedCharacter.id]}">
        <p class="kicker">Oyuncular</p>
        <h2>${lobbyState.players.length}/${lobbyState.maxPlayers} hazır bekliyor</h2>
        <div class="lobby-player-list">
          ${lobbyState.players.map((player) => `
            <div class="lobby-player-row ${player.ready ? "is-ready" : ""}">
              <strong>${escapeHtml(player.name)}</strong>
              <span>${escapeHtml(characters.find((character) => character.id === player.characterId)?.displayName ?? player.characterId)}</span>
              <small>${player.isHost ? "Kurucu" : player.ready ? "Hazir" : "Bekliyor"}</small>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="loadout-grid lobby-roster-grid">
        ${characters.map((character) => {
          const owner = lobbyState.players.find((player) => player.characterId === character.id);
          return `
            <button
              class="loadout-chip ${selectedCharacter.id === character.id ? "is-active" : ""} ${owner ? "is-locked" : ""}"
              data-lobby-character="${character.id}"
              style="--item: ${classColor[character.id]}"
            >
              <span>${owner ? escapeHtml(owner.name) : "Bos"}</span>
              <strong>${escapeHtml(character.displayName)}</strong>
            </button>
          `;
        }).join("")}
      </section>

      <footer class="home-actions lobby-actions">
        <button class="command ${localPlayer?.ready ? "command--primary" : "command--ghost"}" data-lobby-ready>
          ${localPlayer?.ready ? "Hazırım" : "Hazır Değilim"}
        </button>
        ${localIsHost ? `
          <button class="command ${everyoneReady ? "command--primary" : "command--ghost"}" data-lobby-start>
            Oyunu Başlat
          </button>
        ` : `
          <span class="online-note">Kurucu herkes hazır olduğunda oyunu başlatır.</span>
        `}
      </footer>
    </div>
  `;
}

function renderMapEditor(
  map: EditableMapData,
  selectedTool: MapTileKind,
  saveStatus: string,
  savedMaps: SavedMapRecord[],
  activeSavedMapId: string,
  selectedMapName: string
) {
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

      <section class="map-scale-panel">
        <div>
          <p class="kicker">Olcek</p>
          <strong>${map.scale}x Harita</strong>
        </div>
        <div class="scale-picker__buttons">
          <button class="scale-chip ${map.scale === 1 ? "is-active" : ""}" data-map-editor-scale="1">1x</button>
          <button class="scale-chip ${map.scale === 2 ? "is-active" : ""}" data-map-editor-scale="2">2x</button>
        </div>
      </section>

      <section class="map-records">
        <div class="map-records__head">
          <div>
            <p class="kicker">Kayıtlar</p>
            <strong>${savedMaps.length} harita</strong>
          </div>
          <button class="command command--ghost command--small" data-map-action="new">Yeni</button>
        </div>
        <label class="map-name-row">
          <span>Harita Adı</span>
          <input class="text-field" data-map-name-input value="${escapeHtml(selectedMapName)}" maxlength="28" />
        </label>
        <div class="map-record-list">
          ${savedMaps.length > 0 ? savedMaps.map((record) => `
            <button class="map-record ${record.id === activeSavedMapId ? "is-active" : ""}" data-load-map-id="${escapeHtml(record.id)}">
              <span>${escapeHtml(record.name)}</span>
              <small>${record.map.scale}x · ${record.map.cols}x${record.map.rows}</small>
            </button>
          `).join("") : `
            <div class="map-record map-record--empty">
              <span>Kayit yok</span>
              <small>Kaydet ile ilk haritani olustur</small>
            </div>
          `}
        </div>
      </section>

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

      <p class="map-save-status">${escapeHtml(saveStatus)}</p>

      <footer class="map-actions">
        <button class="command command--primary" data-map-action="save">Kaydet</button>
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

function renderBestiary() {
  const enemies = Object.entries(enemyCombatDefinitions) as Array<[EnemyType, typeof enemyCombatDefinitions[EnemyType]]>;
  return `
    <div class="archive-screen bestiary-screen">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="Ana menü">‹</button>
        <div>
          <p class="eyebrow">Threat Bestiary</p>
          <h1>Düşman Arşivi</h1>
        </div>
      </header>

      <section class="bestiary-grid">
        ${enemies.map(([type, definition]) => {
          const dossier = enemyDossier[type];
          const movementKind = definition.movementKind as string;
          const abilities = "abilities" in definition ? [...definition.abilities] : [];
          return `
            <article class="bestiary-card bestiary-card--${type}" style="--enemy: ${enemyColor(type)}">
              <div class="bestiary-card__visual" aria-hidden="true">
                <img class="${getEnemyImageClass(definition.race, type)}" src="${getEnemyImagePath(definition.race, type)}" alt="" />
              </div>
              <div class="bestiary-card__copy">
                <p class="kicker">${escapeHtml(dossier.title)}</p>
                <h2>${escapeHtml(dossier.name)}</h2>
                <p>${escapeHtml(dossier.summary)}</p>
              </div>
              <dl class="bestiary-stats">
                ${renderBestiaryStat("HP", definition.maxHp)}
                ${renderBestiaryStat("Zırh", definition.armor)}
                ${renderBestiaryStat("Kalkan", definition.shield)}
                ${renderBestiaryStat("Regen", `${definition.healthRegenPerSecond}/sn`)}
                ${renderBestiaryStat("Hız", definition.speed)}
                ${renderBestiaryStat("Altın", definition.reward)}
              </dl>
              <div class="bestiary-tags">
                <span>Irk: ${escapeHtml(formatEnemyRace(definition.race))}</span>
                <span>${movementKind === "air" ? "Havacı" : "Karacı"}</span>
                <span>Tehdit ${escapeHtml(dossier.threat)}</span>
                ${abilities.map((ability) => `<span>${escapeHtml(formatEnemyAbility(ability))}</span>`).join("")}
              </div>
              <div class="bestiary-notes">
                ${formatResistanceLine("Hasar", getEnemyDamageResistances(definition))}
                ${formatResistanceLine("Vuruş", definition.hitTypeResistances)}
                ${formatResistanceLine("Durum", definition.statusResistances)}
              </div>
            </article>
          `;
        }).join("")}
      </section>

      <section class="selected-dossier bestiary-note">
        <p class="kicker">Irk Varyantları</p>
        <h2>Dalga kimlikleri</h2>
        <div class="bestiary-race-gallery">
          ${enemyRaceOrder.map((race) => `
            <article class="bestiary-race-row">
              <strong>${escapeHtml(formatEnemyRace(race))}</strong>
              <div>
                ${enemyTypeOrder.map((type) => `
                  <figure>
                    <img class="${getEnemyImageClass(race, type)}" src="${getEnemyImagePath(race, type)}" alt="" />
                    <figcaption>${escapeHtml(enemyTypeLabels[type])}</figcaption>
                  </figure>
                `).join("")}
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="selected-dossier bestiary-note">
        <p class="kicker">Dalga Varyantı</p>
        <h2>Uçan dalgalar</h2>
        <p>Belirli dalgalarda düşmanlar havacı varyant olarak doğabilir. Havacılar yolu takip etmez, spawn noktasından nexusa en kısa hatla uçar ve mevcut can değerleri hava saldırısı dengesine göre düşürülür.</p>
      </section>
    </div>
  `;
}

function renderBestiaryStat(label: string, value: string | number) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(String(value))}</dd>
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

function enemyColor(type: EnemyType) {
  return {
    grunt: "#ef4444",
    brute: "#b91c1c",
    runner: "#fb923c",
    shooter: "#f97316"
  }[type];
}

function formatEnemyAbility(ability: string) {
  return {
    "heavy-body": "Ağır Gövde",
    fast: "Çok Hızlı",
    "ranged-shot": "Ateş Eder"
  }[ability] ?? ability;
}

function formatEnemyRace(race: string) {
  return {
    meka: "Meka",
    spaceBug: "Uzay böceği",
    fourthDimensional: "4. boyut yerlisi",
    holyGuardian: "Kutsal koruyucu",
    fallen: "Düşmüş",
    golem: "Golem"
  }[race] ?? race;
}

function getEnemyImagePath(race: EnemyRace, type: EnemyType) {
  return race === "meka" ? `/images/enemies/enemy-${type}.png` : `/images/enemies/enemy-${race}-${type}.png`;
}

function getEnemyImageClass(race: EnemyRace, type: EnemyType) {
  return `enemy-game-sprite enemy-game-sprite--${type}${race === "spaceBug" && type === "brute" ? " enemy-game-sprite--space-bug-brute" : ""}`;
}

function formatResistanceLine(label: string, resistances: Record<string, number> | undefined) {
  const entries = Object.entries(resistances ?? {});
  if (entries.length === 0) {
    return `<p><strong>${label}</strong><span>Özel direnç yok</span></p>`;
  }

  return `
    <p>
      <strong>${label}</strong>
      <span>${entries.map(([key, value]) => `${formatResistanceKey(key)} ${formatResistanceValue(value)}`).join(" · ")}</span>
    </p>
  `;
}

function formatResistanceKey(key: string) {
  return {
    physical: "Fiziksel",
    electric: "Elektrik",
    psychic: "Psişik",
    fire: "Ateş",
    light: "Işık",
    cellular: "Hücresel",
    projectile: "Mermi",
    impact: "Patlama",
    focus: "Odaklanma",
    aura: "Aura",
    contamination: "Kontaminasyon",
    slow: "Slow",
    fear: "Korku",
    tracking: "Takip"
  }[key] ?? key;
}

function formatResistanceValue(value: number) {
  const percent = Math.round(Math.abs(value) * 100);
  return value < 0 ? `+%${percent} zayıf` : `%${percent} direnç`;
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
    `Maliyet: ${tower.cost}g | L2/L3/L4: ${getTowerUpgradeCost(tower.cost, 1, tower.id)}/${getTowerUpgradeCost(tower.cost, 2, tower.id)}/${getTowerUpgradeCost(tower.cost, 3, tower.id)}g`,
    `Menzil: ${tower.id === "warrior-2" ? "Global" : tower.range} | Mermi Hızı: ${tower.projectileSpeed}`,
    `L1 DPS: ${l1Dps} | L10 Baz DPS: ${l10Dps}`,
    `Mekanik: ${(tower.mechanics ?? []).join(", ") || "standart"}`
  ];
  if (tower.id === "warrior-2") {
    parts.push("Uzun link buff: Ayni kuleye 5 dalga bagli kalirsa impact/carpma vuruslu bagli kule Sunucu leveline gore +%12-30 hasar alir. 10 dalga bagli kalirsa bagli kulenin her vurusuna Sunucu leveline gore hedef max HP'sinin %0.1-0.5'i kadar ek hasar eklenir.");
  }
  if (tower.id === "warrior-4") {
    parts.push("Denge: Impact/carpma oldugu icin level ile saldiri hizi artmaz; DPS hasara tasinir. Lv6 yaklasik 425 DPS, Lv7 yaklasik 600 DPS, Lv8 yaklasik 750 DPS, Lv10 yaklasik 1000 DPS.");
  }
  if (tower.id === "warrior-5") {
    parts.push("Denge: Normal lazer gercek araligi Lv1 0.20sn, Lv5 0.16sn, Lv10 0.12sn. Overdrive bunun yarisidir: 0.10sn, 0.08sn, 0.06sn. DPS onceki dengeye yakin korunur.");
  }
  if (tower.id === "warrior-6") {
    parts.push("Denge: Impact/carpma oldugu icin level ile baz saldiri hizi artmaz; DPS korunacak sekilde hasari agirlasir. Dalga bonuslari 2, 4, 6, 8, 10, 14 ve 16 tamamlanan dalgada acilir. Lv10+16dalga+15stack+2chain yaklasik 2114 DPS.");
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

function formatDps(damage: number, intervalMs: number) {
  if (damage <= 0 || intervalMs <= 0) {
    return "0.0";
  }
  return ((damage / (intervalMs / 1000)) * REAL_DPS_GAME_SPEED_MULTIPLIER).toFixed(1);
}

function getTowerLevelDamage(tower: TowerDefinition, level: number) {
  let damage = tower.damage * (1 + (level - 1) * 0.42);

  if (tower.id === "warrior-4") {
    damage *= getObsessionDamageMultiplier(level);
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

  if (tower.id === "warrior-1") {
    return getTrackerFireInterval(level);
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

function getObsessionDamageMultiplier(level: number) {
  const multipliers = [1, 1.018, 1.036, 1.054, 1.072, 1.085349, 0.94697, 1.05753, 1.144, 1.162];
  return multipliers[Math.min(Math.max(level, 1), 10) - 1] ?? 1;
}

function getDebugLaserDamageMultiplier(level: number) {
  const multipliers = [1.3333, 1.6976, 2.1449, 2.7057, 3.0879, 3.3535, 3.6001, 3.8235, 4.0196, 4.1841];
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

function getTrackerFireInterval(level: number) {
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  return 720 - ((clampedLevel - 1) / 9) * (720 - 333);
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

function loadSavedMapRecords(): SavedMapRecord[] {
  try {
    const rawRecords = localStorage.getItem(MAP_RECORDS_STORAGE_KEY);
    if (rawRecords) {
      const parsed = JSON.parse(rawRecords);
      if (Array.isArray(parsed)) {
        return parsed
          .map(normalizeSavedMapRecord)
          .filter((record): record is SavedMapRecord => Boolean(record))
          .sort((left, right) => right.savedAt - left.savedAt);
      }
    }

    const rawLegacyMap = localStorage.getItem(MAP_STORAGE_KEY);
    if (rawLegacyMap) {
      return [createSavedMapRecord(normalizeMapData(JSON.parse(rawLegacyMap)), "Kayitli Harita", "legacy-map")];
    }
  } catch {
    return [];
  }

  return [];
}

function saveStoredMap(map: EditableMapData, name: string, existingId = "") {
  const normalizedMap = normalizeMapData(map);
  const recordName = name.trim().slice(0, 28) || "Harita";
  const recordId = existingId || createMapRecordId();
  const record = createSavedMapRecord(normalizedMap, recordName, recordId);
  const records = loadSavedMapRecords().filter((candidate) => candidate.id !== recordId);
  records.unshift(record);
  localStorage.setItem(MAP_RECORDS_STORAGE_KEY, JSON.stringify(records));
  localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(normalizedMap));
  return record;
}

function createSavedMapRecord(map: EditableMapData, name: string, id = createMapRecordId()): SavedMapRecord {
  return {
    id,
    name: name.trim().slice(0, 28) || "Harita",
    map: normalizeMapData(map),
    savedAt: Date.now()
  };
}

function normalizeSavedMapRecord(value: unknown): SavedMapRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<SavedMapRecord>;
  try {
    return {
      id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : createMapRecordId(),
      name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 28) : "Harita",
      map: normalizeMapData(candidate.map),
      savedAt: typeof candidate.savedAt === "number" ? candidate.savedAt : 0
    };
  } catch {
    return undefined;
  }
}

function createMapRecordId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `map-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function formatUiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
