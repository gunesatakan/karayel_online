import { Room } from "colyseus.js";
import type Phaser from "phaser";
import {
  characters,
  MAP_STORAGE_KEY,
  createDefaultEditableMap,
  STAGE_COUNT,
  WAVES_PER_STAGE,
  buildBadgeBoardView,
  buildCardArchiveView,
  buildCosmeticsView,
  createDefaultCosmetics,
  createEmptyCardArchive,
  createEmptyMasteryBook,
  getMasteryProgress,
  resolveCosmetics,
  selectCosmetic,
  formatArchiveProgress,
  formatStars,
  getArchiveProgress,
  getAirCheckpoints,
  getRunMapKey,
  getStage,
  getStageDamageProfile,
  isStageUnlocked,
  resolveQuickStartStage,
  stageCatalog,
  enemyCombatDefinitions,
  getEnemyDamageResistances,
  getTowerBuildCost,
  getTowerAttackRadius,
  getTowerDisplayStats,
  getTowerSlowDurationMs,
  getTowerHitSlowFraction,
  getCriticalSlowFraction,
  KIN_SLOW_FAR_FRACTION,
  getTowerLevelExpCost,
  getTile,
  normalizeMapData,
  scaleEditableMap,
  setTile,
  type ArchiveGroupView,
  type ArchiveKind,
  type ArchiveSectionView,
  type BadgeBook,
  type BadgeEntryView,
  type BadgeGroupView,
  type CardArchive,
  type CosmeticOptionView,
  type CosmeticSelection,
  type MasteryBook,
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
  type RecordBook,
  type StageRecord,
  type TowerDefinition
} from "@karayel/shared";
import { CHARACTER_CLASS_COLORS } from "./character-colors";
import { classTypeCodex, damageTypeCodex, hitTypeCodex } from "./codex";
import { getClearedStages, getDefaultStage } from "./stage-progress";
import { getRecordBook, getStageRecord } from "./run-records";
import { takeQuickStartIntent } from "./quick-start";
import { readCardArchive } from "./card-archive";
import { getCosmeticFacts, getOperatorMasteryPoints, isProgressStorageAvailable, readBadgeBook, readCosmeticSelection, readMasteryBook, saveCosmeticSelection } from "./progress-store";
import { gameServerUrl, getPlayerName, roomsUrl } from "./config";
import {
  getSharedClient,
  loadMatchReconnect,
  resumeSavedMatch,
  retryExpiredSeatReservation,
  setActiveLobbyRoom,
  setResumedMatch,
  takeResumedMatch,
  type MatchReconnectRecord
} from "./online-session";

type ViewName = "home" | "archive" | "detail" | "map" | "online" | "lobby" | "bestiary" | "cardArchive" | "badges";

/**
 * Nisanlar ekraninin ve menudeki ustalik/unvan satirlarinin bildigi her sey:
 * nisan ve ustalik defterleri, kozmetik secimi ve deponun durumu. Menu
 * acilista bir kez okuyor (sonuc ekranindan donus sayfayi yeniden yukluyor);
 * yalnizca kozmetik secimi menude degisiyor.
 */
type ProgressState = {
  badges: BadgeBook;
  mastery: MasteryBook;
  cosmetics: CosmeticSelection;
  available: boolean;
};

/**
 * Kart Arsivi ekraninin bildigi her sey: depodaki arsiv, deponun calisip
 * calismadigi ve acik sekme.
 */
type CardArchiveState = { archive: CardArchive; available: boolean; tab: ArchiveKind };

// The dossier used to be one long newline-joined string. Splitting it into
// typed blocks lets the panel show a readable brief, a stat table and an
// explained mechanic list instead of a wall of "Key: value" lines.
type DetailBlock =
  | { kind: "brief"; text: string }
  | { kind: "stats"; label: string; rows: Array<{ label: string; value: string; hint?: string }> }
  | { kind: "entries"; label: string; items: Array<{ title: string; text: string }> }
  | { kind: "steps"; label: string; items: string[] }
  | { kind: "note"; text: string };

type DetailItem = {
  key: string;
  title: string;
  label: string;
  type: "passive" | "ultimate" | "skill" | "tower";
  color: string;
  blocks: DetailBlock[];
};

type OnlineTab = "create" | "join";
type SavedMapRecord = {
  id: string;
  name: string;
  map: EditableMapData;
  savedAt: number;
};

const MAP_RECORDS_STORAGE_KEY = "karayel:custom-maps:v2";
const enemyRaceOrder: EnemyRace[] = ["meka", "spaceBug", "fourthDimensional", "holyGuardian", "fallen", "golem"];
const enemyTypeOrder: EnemyType[] = ["grunt", "brute", "runner", "shooter"];
const detailTypeLabels: Record<DetailItem["type"], string> = {
  passive: "Pasif",
  ultimate: "Ulti",
  skill: "Yetenek",
  tower: "Kule"
};

const enemyTypeLabels: Record<EnemyType, string> = {
  grunt: "Sürü",
  brute: "Ezici",
  runner: "Koşucu",
  shooter: "Atıcı",
  siege: "Kuşatma"
};

// Oyun ici takim toast'u da ayni rengi kullaniyor; tek kaynak orada.
const classColor = CHARACTER_CLASS_COLORS;

// Portraits that exist as real art; everyone else falls back to an engraved mark.
const characterArt: Partial<Record<CharacterId, string>> = {
  zeynep: "/images/zeynep-puppet-hands.png",
  archer: "/images/melis-creepy.png"
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
  siege: {
    name: "Kuşatma Koçu",
    title: "Yapı kırıcı kara hedefi",
    threat: "Yüksek",
    summary: "Duvarlara ve kulelere normalin 4 katı hasar verir ama canı en düşük düşmanlardan biridir. Duvar örerek her şeyi çözmeye çalışan savunmanın cezası; arkasına ateş gücü koymayan hat kuşatma karşısında erir."
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
  let onlineRoomRequestPending = false;
  let phaserReady = false;
  // The backdrop lives outside the render cycle: rebuilding it per view would
  // re-decode the splash and replay its fade on every navigation.
  root.innerHTML = renderBackdrop();
  const shellHost = document.createElement("div");
  shellHost.className = "menu-shell-host";
  root.append(shellHost);

  const splashArt = root.querySelector<HTMLImageElement>("[data-splash-art]");
  if (splashArt) {
    if (splashArt.complete) {
      splashArt.classList.add("is-loaded");
    } else {
      splashArt.addEventListener("load", () => splashArt.classList.add("is-loaded"), { once: true });
    }
  }

  const render = (view: ViewName) => {
    root.dataset.screen = view;
    shellHost.innerHTML = renderShell(
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
      lobbyError,
      withStageRecords(stageState),
      { ...cardArchive, tab: archiveTab },
      progressState
    );
    bindUi(view);
  };

  /**
   * Yaratici mod istegi.
   *
   * Sahneye tasiniyor, oradan odaya. Sunucu bayragi yalnizca dogrudan
   * baslatilan tek kisilik odada kabul ediyor, o yuzden online yol bunu
   * hicbir zaman goturmez.
   */
  let creativeRequested = false;
  /**
   * Secili asama ve tamamlananlar.
   *
   * Depo yalnizca acilista okunuyor ve bu yetiyor: zafer ekranindaki "Ana Menu"
   * dugmesi sayfayi bastan yukluyor, yani menu her donusunde ilerlemeyi zaten
   * yeniden okumus oluyor. Ayrica bir tazeleme yolu koymak, hicbir zaman
   * calismayan bir dal birakirdi.
   */
  let stageState = { cleared: getClearedStages(), selected: getDefaultStage() };
  /**
   * Rekorlar da yalnizca acilista okunuyor; sonuc ekranindan menuye donus
   * sayfayi bastan yukluyor.
   */
  const recordBook = getRecordBook();
  /**
   * Kart Arsivi de yalnizca acilista okunuyor: arsiv kart seciminde ve
   * magazada buyuyor, menuye donus de sayfayi bastan yukluyor.
   */
  const cardArchive = readCardArchive();
  let archiveTab: ArchiveKind = "cards";
  /** Nisan, ustalik ve kozmetik; acilista bir kez okunuyor. */
  const progressState: ProgressState = {
    badges: readBadgeBook(),
    mastery: readMasteryBook(),
    cosmetics: readCosmeticSelection(),
    available: isProgressStorageAvailable()
  };

  /**
   * Kosu raporunun "Tekrar" / "Sonraki aşama" niyeti.
   *
   * Rapor sayfayi yeniden yukluyor ve buraya ayni operator, asama, harita
   * olcegi ve kiple bir not birakiyor. Not okunur okunmaz siliniyor (bir
   * sonraki elle yenileme oyunu kendiliginden baslatmasin). Asama bu
   * tarayicida kilitliyse acik olan en yuksek asamaya dusuluyor: menu kilitli
   * asamayi secemez, not da secmemeli. Harita olcegi kayit anahtarinin parcasi;
   * tekrar ayni rekor satirina yazsin diye secili harita o olcege cevriliyor.
   */
  const quickStart = takeQuickStartIntent();
  if (quickStart) {
    const character = characters.find((candidate) => candidate.id === quickStart.characterId);
    if (character) {
      selectedCharacter = character;
      selectedDetail = getDetailItems(character)[0];
    }
    stageState = { ...stageState, selected: resolveQuickStartStage(quickStart, stageState.cleared) };
    if (selectedMap.scale !== quickStart.mapScale) selectedMap = scaleEditableMap(selectedMap, quickStart.mapScale);
    selectedMapScale = quickStart.mapScale;
    if (quickStart.mode === "online") onlineTab = "create";
  }

  /**
   * Asama tahtasinin rekorlari: secili operatorun **solo** kaydi, siradaki
   * solo kosunun oynanacagi harita olcegiyle. Sunucu haritayi olcekteki acik
   * arenaya ceviriyor, anahtar da ondan (`getRunMapKey`). Co-op ve baska
   * olcekteki kosular kendi anahtarinda; bu satira karismiyor.
   */
  const withStageRecords = (state: StageState): StageState => {
    const mapKey = getRunMapKey(selectedMap.scale);
    const records: Partial<Record<number, StageRecord>> = {};
    for (const stage of stageCatalog) {
      records[stage.id] = getStageRecord(recordBook, stage.id, selectedCharacter.id, 1, mapKey);
    }
    return { ...state, records, allRecords: recordBook };
  };

  const startGame = (mode: "solo" | "online" = "solo", resume?: MatchReconnectRecord) => {
    if (!phaserReady || onlineGameStarting) {
      return;
    }
    onlineGameStarting = true;
    root.classList.add("menu-root--hidden");
    gameRoot.classList.remove("game-root--hidden");
    game.scene.stop("preloader");
    // Yeniden yuklemeden donulen mac: operator, olcek ve asama kayittan; oda
    // sahneye `setResumedMatch` ile gidiyor.
    if (resume) {
      game.scene.start("game", {
        characterId: characters.find((character) => character.id === resume.characterId)?.id ?? selectedCharacter.id,
        mapData: scaleEditableMap(selectedMap, resume.mapScale as MapScale),
        creative: false,
        stage: resume.stage
      });
      return;
    }
    game.scene.start("game", {
      characterId: selectedCharacter.id,
      mapData: mode === "online" && currentLobbyState ? scaleEditableMap(selectedMap, currentLobbyState.mapScale) : selectedMap,
      creative: mode === "solo" && creativeRequested,
      // Online oyunda asama odanindir: katilan oyuncunun menudeki secimi
      // kurucununkinden farkli olabilir.
      stage: mode === "online" && currentLobbyState?.stage !== undefined ? currentLobbyState.stage : stageState.selected
    });
    creativeRequested = false;
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
    if (onlineRoomRequestPending) return;
    onlineRoomRequestPending = true;
    try {
      lobbyError = "";
      const roomNameInput = root.querySelector<HTMLInputElement>("[data-room-name-input]");
      const roomName = roomNameInput?.value.trim() || `${selectedCharacter.displayName} Odasi`;
      const client = getSharedClient(gameServerUrl);
      const room = await retryExpiredSeatReservation(() => client.create("match", {
        playerName: getPlayerName(),
        characterId: selectedCharacter.id,
        roomName,
        mapScale: selectedMapScale,
        mapData: selectedMap,
        // Asama gitmezse sunucu ilk asamaya dusuyor ve co-op zaferi hep 1.
        // asamayi isaretliyordu; kurucunun sectigi asama odanin asamasi.
        stage: stageState.selected
      }));
      bindLobbyRoom(room);
      render("lobby");
    } catch (error) {
      lobbyError = formatUiError(error, "Oda kurulurken hata olustu.");
      render("online");
    } finally {
      onlineRoomRequestPending = false;
    }
  };

  const joinRoom = async (roomId: string) => {
    if (onlineRoomRequestPending) return;
    onlineRoomRequestPending = true;
    try {
      lobbyError = "";
      const client = getSharedClient(gameServerUrl);
      const room = await retryExpiredSeatReservation(() => client.joinById(roomId, {
        playerName: getPlayerName(),
        characterId: selectedCharacter.id
      }));
      bindLobbyRoom(room);
      render("lobby");
    } catch (error) {
      lobbyError = formatUiError(error, "Odaya katilinamadi.");
      render("online");
    } finally {
      onlineRoomRequestPending = false;
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

    root.querySelectorAll<HTMLElement>("[data-archive-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.archiveTab;
        if (tab !== "cards" && tab !== "items") return;
        archiveTab = tab;
        render("cardArchive");
      });
    });

    // Kozmetik secimi: kilitli secim paylasilan kuralda reddediliyor
    // (`selectCosmetic` ayni nesneyi donduruyor), dugme de zaten kapali.
    const changeCosmetic = (change: Parameters<typeof selectCosmetic>[2]) => {
      const facts = getCosmeticFacts(progressState.mastery, progressState.badges);
      const next = selectCosmetic(progressState.cosmetics, facts, change);
      if (next === progressState.cosmetics) return;
      progressState.cosmetics = next;
      saveCosmeticSelection(next);
      render("badges");
    };
    root.querySelectorAll<HTMLElement>("[data-cosmetic-title]").forEach((button) => {
      button.addEventListener("click", () => changeCosmetic({ title: button.dataset.cosmeticTitle || null }));
    });
    root.querySelectorAll<HTMLElement>("[data-cosmetic-stamp]").forEach((button) => {
      button.addEventListener("click", () => changeCosmetic({ stamp: button.dataset.cosmeticStamp }));
    });
    root.querySelectorAll<HTMLElement>("[data-cosmetic-crown]").forEach((button) => {
      button.addEventListener("click", () => changeCosmetic({ crown: button.dataset.cosmeticCrown === "on" }));
    });

    root.querySelectorAll<HTMLElement>("[data-character-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const character = characters.find((candidate) => candidate.id === button.dataset.characterId);
        if (!character) {
          return;
        }
        selectedCharacter = character;
        selectedDetail = getDetailItems(character)[0];
        render(view);
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

    root.querySelectorAll<HTMLElement>("[data-stage-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.stageId);
        if (!isStageUnlocked(id, stageState.cleared)) return;
        stageState = { ...stageState, selected: id };
        render(view);
      });
    });

    root.querySelectorAll<HTMLElement>("[data-start-creative]").forEach((button) => {
      button.addEventListener("click", () => {
        creativeRequested = true;
        startGame("solo");
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
        const nextScale = parseMapScale(button.dataset.mapEditorScale);
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
        selectedMapScale = parseMapScale(button.dataset.mapScale);
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
  // Co-op grubu yeniden yuklemede bir arada tutulamiyor: co-op tekrari ayni
  // ayarlarla oda kurma ekraninda aciliyor. Solo ve yaratici hemen basliyor --
  // Phaser hazir oldugunda, normal "Başla" yoluyla (yukaridaki dinleyiciden
  // sonra kayitli, yani hazir bayragi o an acik).
  render(quickStart?.mode === "online" ? "online" : "home");

  // Yeniden yuklenen sekmede suren bir mac varsa once ona donmeyi dene.
  // Basarisizsa (pencere doldu, mac bitti) normal menu akisi suruyor. Oyuncu
  // bu arada kendisi bir oda kurduysa ya da oyuna girdiyse donulen oda birakiliyor.
  const savedMatch = quickStart ? undefined : loadMatchReconnect();
  if (savedMatch) {
    void resumeSavedMatch(gameServerUrl, savedMatch).then((room) => {
      if (!room) return;
      if (currentLobbyRoom || onlineGameStarting) {
        void room.leave(true);
        return;
      }
      setResumedMatch(room, savedMatch.mode);
      const launchResumed = () => {
        if (currentLobbyRoom || onlineGameStarting) {
          takeResumedMatch();
          void room.leave(true);
          return;
        }
        startGame(savedMatch.mode, savedMatch);
      };
      if (phaserReady) launchResumed();
      else window.addEventListener("karayel:phaser-ready", launchResumed, { once: true });
    });
  }

  if (quickStart && quickStart.mode !== "online") {
    // Oyuncu Phaser hazir olmadan menuye dokunursa kontrol onda: gec gelen
    // kendiliginden baslatma onun kurdugu bir lobi odasinin (sahne onu oyun
    // odasi sanardi), actigi arsivin ya da harita duzenleyicinin ustune
    // binmesin. Menuyu kilitlemek yerine iptal: hazir sinyali hic gelmezse
    // kilit kendi zaman asimini isterdi. Oda kuran her dokunus once buraya
    // ugradigi icin lobi yoluna ayrica kanca gerekmiyor.
    const cancel = () => window.removeEventListener("karayel:phaser-ready", launch);
    const launch = () => {
      root.removeEventListener("pointerdown", cancel, true);
      root.removeEventListener("keydown", cancel, true);
      creativeRequested = quickStart.mode === "creative";
      startGame("solo");
    };
    if (phaserReady) launch();
    else {
      window.addEventListener("karayel:phaser-ready", launch, { once: true });
      root.addEventListener("pointerdown", cancel, { capture: true, once: true });
      root.addEventListener("keydown", cancel, { capture: true, once: true });
    }
  }
}

/**
 * Asama tahtasi.
 *
 * Her asama kendi irkini ve o irkin zayif/direncli hasar tiplerini yaziyor,
 * cunku asamanin tamami tek bir irkla geciyor: oyuncu girmeden once neyle
 * karsilasacagini bilmeli ki dizilimi ona gore kursun. Zayiflik listesi elle
 * yazilmiyor, direnc tablosundan tureiyor -- metinle saha ayrilirsa oyuncuya
 * yalan soylenmis olur.
 */
function renderStageBoard(stageState: StageState) {
  const rows = stageCatalog.map((stage) => {
    const unlocked = isStageUnlocked(stage.id, stageState.cleared);
    const record = stageState.records?.[stage.id];
    const cleared = stageState.cleared.includes(stage.id);
    const profile = getStageDamageProfile(stage.id);
    const classes = [
      "stage",
      stage.id === stageState.selected ? "is-active" : "",
      unlocked ? "" : "is-locked",
      cleared ? "is-cleared" : ""
    ].filter(Boolean).join(" ");
    const detail = unlocked
      ? `${escapeHtml(stage.raceName)} · ${WAVES_PER_STAGE} tur`
      : "Önceki aşamayı tamamla";
    const profileLine = unlocked
      ? `<em>Zayıf: ${profile.weakTo.map((type) => damageTypeCodex[type].name).join(", ")} · Dirençli: ${profile.resistantTo.map((type) => damageTypeCodex[type].name).join(", ")}</em>`
      : "";
    return `
      <button class="${classes}" data-stage-id="${stage.id}"${unlocked ? "" : " disabled"}>
        <span class="stage__index">${stage.id}</span>
        <span class="stage__body">
          <strong>${escapeHtml(stage.name)}</strong>
          <small>${detail}</small>
          ${profileLine}
          ${unlocked ? renderStageRecord(record) : ""}
        </span>
        <span class="stage__mark">${cleared ? "✓" : unlocked ? "" : "🔒"}</span>
      </button>`;
  }).join("");

  return `
    <section class="stages" aria-label="Aşamalar">
      <p class="section-label">Aşamalar <b>${stageState.cleared.length}/${STAGE_COUNT}</b></p>
      <div class="stages__grid">${rows}</div>
    </section>`;
}

/**
 * Asama satirinin rekor seridi: 20 dalgalik cubuk en iyi dalgaya kadar dolu,
 * hava dalgalari (5/10/15/20) uzerinde kucuk isaretler; kayit varsa yaninda
 * "En iyi 13/20" ve yildizlar.
 *
 * Asama tek bir hep-ya-hic hedef olmaktan cikiyor: 13. dalgada biten kosu da
 * burada iz birakiyor. Hava dalgalari asamanin dogal kontrol noktalari;
 * gecilen isaret dolu. Hic oynanmamis asamada yalnizca cubuk ve isaretler var,
 * "rekor yok" gibi bir eksiklik yazilmiyor. Tek satir, 375 px'e sigiyor.
 */
function renderStageRecord(record: StageRecord | undefined) {
  const bestWave = record?.bestWave ?? 0;
  const checkpoints = getAirCheckpoints(record);
  const pips = checkpoints.map((checkpoint) => {
    const left = ((checkpoint.wave - 0.5) / WAVES_PER_STAGE) * 100;
    const label = `${checkpoint.wave}. dalga: ${checkpoint.mode === "all" ? "hava" : "karışık hava"}${checkpoint.passed ? " · geçildi" : ""}`;
    return `<i class="stage__pip stage__pip--${checkpoint.mode}${checkpoint.passed ? " is-passed" : ""}" style="left: ${left.toFixed(1)}%" title="${label}"></i>`;
  }).join("");
  const trackLabel = `${record ? `En iyi ${bestWave}/${WAVES_PER_STAGE}; ` : ""}hava dalgaları ${checkpoints.map((checkpoint) => checkpoint.wave).join(", ")}`;
  const fill = Math.min(100, Math.max(0, (bestWave / WAVES_PER_STAGE) * 100));
  return `
          <span class="stage__record">
            <span class="stage__track" role="img" aria-label="${trackLabel}"><b style="width: ${fill.toFixed(1)}%"></b>${pips}</span>
            ${record ? `<span class="stage__best">En iyi ${bestWave}/${WAVES_PER_STAGE}</span>
            <span class="stage__stars" aria-label="${record.bestStars} yıldız">${formatStars(record.bestStars)}</span>` : ""}
          </span>`;
}

function renderBackdrop() {
  return `
    <div class="menu-backdrop" aria-hidden="true">
      <img
        class="backdrop__art"
        data-splash-art
        src="/images/splash-siege.webp"
        srcset="/images/splash-siege-sm.webp 640w, /images/splash-siege.webp 1024w"
        sizes="100vw"
        alt=""
        fetchpriority="high"
        decoding="async"
      />
      <div class="backdrop__scrim"></div>
      <div class="backdrop__ember"></div>
      <div class="backdrop__scan"></div>
      <div class="backdrop__vignette"></div>
    </div>
  `;
}

function renderSigil(characterId: CharacterId, mark: string) {
  const art = characterArt[characterId];
  return `
    <span class="sigil" style="--accent: ${classColor[characterId]}">
      <svg class="sigil__frame" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <polygon class="sigil__hex" points="50,3 93,26.5 93,73.5 50,97 7,73.5 7,26.5" />
        <polygon class="sigil__hex sigil__hex--inner" points="50,13 84,32 84,68 50,87 16,68 16,32" />
        <circle class="sigil__ring" cx="50" cy="50" r="31" />
        <g class="sigil__nodes">
          <circle cx="50" cy="3.6" r="1.8" /><circle cx="92.4" cy="26.5" r="1.8" />
          <circle cx="92.4" cy="73.5" r="1.8" /><circle cx="50" cy="96.4" r="1.8" />
          <circle cx="7.6" cy="73.5" r="1.8" /><circle cx="7.6" cy="26.5" r="1.8" />
        </g>
      </svg>
      ${art
        ? `<img class="sigil__art" src="${art}" alt="" loading="lazy" decoding="async" />`
        : `<b class="sigil__mark">${escapeHtml(mark)}</b>`}
    </span>
  `;
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
  lobbyError = "",
  stageState: StageState = { cleared: [], selected: 1 },
  cardArchive: CardArchiveState = { archive: createEmptyCardArchive(), available: true, tab: "cards" },
  progress: ProgressState = { badges: {}, mastery: createEmptyMasteryBook(), cosmetics: createDefaultCosmetics(), available: true }
) {
  return `
    <main class="menu-shell">
      <section class="menu-stage">
        ${view === "home" ? renderHome(selectedCharacter, stageState, cardArchive.archive, progress) : ""}
        ${view === "archive" ? renderArchive(selectedCharacter, progress) : ""}
        ${view === "badges" ? renderBadges(progress, stageState, cardArchive.archive) : ""}
        ${view === "detail" ? renderDetail(selectedCharacter, selectedDetail) : ""}
        ${view === "bestiary" ? renderBestiary() : ""}
        ${view === "cardArchive" ? renderCardArchive(cardArchive) : ""}
        ${view === "map" ? renderMapEditor(selectedMap, selectedMapTool, mapSaveStatus, savedMaps, activeSavedMapId, selectedMapName) : ""}
        ${view === "online" ? renderOnline(selectedCharacter, onlineTab, roomListings, selectedMapScale, lobbyError, stageState.selected) : ""}
        ${view === "lobby" ? renderLobby(selectedCharacter, lobbyState, lobbySessionId, lobbyError, getSelectedTitle(progress)) : ""}
      </section>
    </main>
  `;
}

/**
 * Menunun asama hakkinda bildigi her sey; `renderHome` disaridan aliyor.
 * `records` secili operatorun solo rekorlari, asama kimligiyle.
 */
type StageState = {
  cleared: number[];
  selected: number;
  records?: Partial<Record<number, StageRecord>>;
  /** Butun rekor defteri; "Her Cephede" ilerlemesi icin (Nisanlar ekrani). */
  allRecords?: RecordBook;
};

function renderHome(selectedCharacter: CharacterDefinition, stageState: StageState, cardArchive: CardArchive, progress: ProgressState) {
  // Dugmede yalnizca kart sayaci ("64/137"); esyalar arsiv ekraninda.
  const cardProgress = formatArchiveProgress(getArchiveProgress(cardArchive, "cards"));
  const board = buildBadgeBoardView(progress.badges, {});
  const mastery = getMasteryProgress(getOperatorMasteryPoints(progress.mastery, progress.badges, selectedCharacter.id));
  const title = getSelectedTitle(progress);
  return `
    <div class="screen screen--home">
      <header class="brand">
        <p class="eyebrow"><i class="rule-dot"></i>Derin Uzay Savunma Ağı</p>
        <h1 class="brand__word">Karayel</h1>
        <div class="brand__rule"><i></i><b>Online</b><i></i></div>
      </header>

      <section class="hero frame" style="--accent: ${classColor[selectedCharacter.id]}">
        ${renderSigil(selectedCharacter.id, initials(selectedCharacter.displayName))}
        <div class="hero__copy">
          <p class="kicker">Seçili Operatör</p>
          <h2>${escapeHtml(selectedCharacter.displayName)}</h2>
          <p class="hero__role">${escapeHtml(selectedCharacter.role)}</p>
          <p class="hero__mastery"><b>Ustalık ${mastery.level}</b>${title ? `<span>${escapeHtml(title)}</span>` : ""}</p>
        </div>
        <button class="hero__cta" data-view="detail" aria-label="Operatör dosyasını aç">
          <i>›</i>
          Dosya
        </button>
        <dl class="hero__stats">
          <div><dt>Dayanım</dt><dd>${selectedCharacter.maxHp}</dd></div>
          <div><dt>Hasar</dt><dd>${selectedCharacter.damage}</dd></div>
          <div><dt>Kule</dt><dd>${selectedCharacter.towers.length}</dd></div>
        </dl>
      </section>

      <section class="roster" aria-label="Operatörler">
        <p class="section-label">Operatör Kadrosu <b>${characters.length}</b></p>
        <div class="roster__grid">
          ${characters.map((character) => `
            <button class="token ${character.id === selectedCharacter.id ? "is-active" : ""}" data-character-id="${character.id}" style="--accent: ${classColor[character.id]}">
              ${renderSigil(character.id, initials(character.displayName))}
              <span class="token__name">${escapeHtml(character.displayName)}</span>
            </button>
          `).join("")}
        </div>
      </section>

      ${renderStageBoard(stageState)}

      <footer class="home-actions">
        <button class="command command--hero" data-start-game>
          <span>Savaşa Gir</span>
          <small>${stageState.selected}. Aşama · ${escapeHtml(getStage(stageState.selected).name)}</small>
        </button>
        <div class="home-actions__grid">
          <button class="command command--ghost" data-start-creative>Yaratıcı</button>
          <button class="command command--ghost" data-view="online">Online</button>
          <button class="command command--ghost" data-view="archive">Operatör</button>
          <button class="command command--ghost" data-view="bestiary">Düşman</button>
          <button class="command command--ghost" data-view="map">Harita</button>
          <button class="command command--ghost command--count" data-view="cardArchive" aria-label="Kart Arşivi, ${cardProgress} kart görüldü">
            <span>Kart Arşivi</span>
            <small>${cardProgress}</small>
          </button>
          <button class="command command--ghost command--count command--wide" data-view="badges" aria-label="Nişanlar, ${board.earned}/${board.total} kazanıldı">
            <span>Nişanlar</span>
            <small>${board.earned}/${board.total}</small>
          </button>
        </div>
      </footer>

      <aside class="slate">
        <span class="slate__name">${escapeHtml(getPlayerName())}</span>
        <span class="slate__node"><i></i>Frankfurt Shard</span>
      </aside>
    </div>
  `;
}

function renderOnline(
  selectedCharacter: CharacterDefinition,
  onlineTab: OnlineTab,
  roomListings: RoomListingSnapshot[],
  selectedMapScale: MapScale,
  lobbyError: string,
  selectedStage: number
) {
  const stage = getStage(selectedStage);
  return `
    <div class="screen">
      <header class="screen-topbar detail-topbar">
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
        <section class="selected-dossier frame online-card" style="--accent: ${classColor[selectedCharacter.id]}">
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
              <button class="scale-chip ${selectedMapScale === 3 ? "is-active" : ""}" data-map-scale="3">3x</button>
              <button class="scale-chip ${selectedMapScale === 4 ? "is-active" : ""}" data-map-scale="4">4x</button>
            </div>
          </div>
          <p class="online-note">1x–4x seçenekleri aynı alandaki grid yoğunluğunu belirler; ölçek büyüdükçe kule kareleri küçülür.</p>
          <p class="online-note">Aşama: <b>${stage.id}. ${escapeHtml(stage.name)}</b> · ana ekranda seçilir; zafer bu aşamayı işaretler.</p>
          <button class="command command--primary" data-create-room>Odayı Kur</button>
        </section>
      ` : `
        <section class="online-room-list">
          <div class="online-list-head">
            <p class="kicker">Açık Odalar</p>
            <button class="command command--ghost command--small" data-refresh-rooms>Yenile</button>
          </div>
          ${roomListings.length > 0 ? roomListings.map((room) => `
            <button class="archive-card room-card" data-room-join-id="${room.roomId}" style="--accent: #22d3ee">
              <span class="archive-card__mark">${room.mapScale}x</span>
              <span class="archive-card__body">
                <strong>${escapeHtml(room.roomName)}</strong>
                <small>${escapeHtml(room.hostName)}${room.stage !== undefined ? ` · ${getStage(room.stage).id}. Aşama` : ""} · ${room.playerCount}/${room.maxPlayers} oyuncu · ${room.started ? "Devam ediyor" : "Lobi"}</small>
              </span>
            </button>
          `).join("") : `
            <div class="selected-dossier frame online-card">
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

function renderLobby(selectedCharacter: CharacterDefinition, lobbyState?: LobbyStateSnapshot, lobbySessionId = "", lobbyError = "", ownTitle?: string) {
  if (!lobbyState) {
    return `
      <div class="screen">
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
    <div class="screen" style="--accent: ${classColor[selectedCharacter.id]}">
      <header class="screen-topbar detail-topbar">
        <button class="icon-command" data-view="online" aria-label="Online">‹</button>
        <div>
          <p class="eyebrow">Room Lobby${lobbyState.stage !== undefined ? ` · ${getStage(lobbyState.stage).id}. Aşama` : ""}</p>
          <h1>${escapeHtml(lobbyState.roomName)}</h1>
        </div>
        <span class="status-pill">${lobbyState.mapScale}x Grid</span>
      </header>

      ${lobbyError ? `<p class="online-error">${escapeHtml(lobbyError)}</p>` : ""}

      <section class="selected-dossier frame online-card" style="--accent: ${classColor[selectedCharacter.id]}">
        <p class="kicker">Oyuncular</p>
        <h2>${lobbyState.players.filter((player) => player.ready).length}/${lobbyState.players.length} hazır</h2>
        <div class="lobby-player-list">
          ${lobbyState.players.map((player) => `
            <div class="lobby-player-row ${player.ready ? "is-ready" : ""}">
              <strong>${escapeHtml(player.name)}</strong>
              <span>${escapeHtml(characters.find((character) => character.id === player.characterId)?.displayName ?? player.characterId)}${player.id === lobbySessionId && ownTitle ? ` · ${escapeHtml(ownTitle)}` : ""}</span>
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

      <footer class="lobby-actions">
        <button class="command ${localPlayer?.ready ? "command--ghost" : "command--primary"}" data-lobby-ready>
          ${localPlayer?.ready ? "Hazır Değilim" : "Hazırım"}
        </button>
        ${localIsHost ? `
          <button class="command ${everyoneReady ? "command--primary" : "command--ghost"}" data-lobby-start>
            Oyunu Başlat
          </button>
        ` : `
          <p class="online-note">Kurucu herkes hazır olduğunda oyunu başlatır.</p>
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
    <div class="screen">
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

function renderArchive(selectedCharacter: CharacterDefinition, progress: ProgressState) {
  return `
    <div class="screen">
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
              ${renderMasteryMeter(getMasteryProgress(getOperatorMasteryPoints(progress.mastery, progress.badges, character.id)))}
            </span>
          </button>
        `).join("")}
      </section>

      <section class="selected-dossier frame" style="--accent: ${classColor[selectedCharacter.id]}">
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
    <div class="screen">
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
          // Menzil yalnizca menzilli dusmanda yaziliyor: sifir yazmak
          // "uzaktan vurur ama sifir kadar" gibi okunurdu.
          const attackRange = "attackRange" in definition ? definition.attackRange : 0;
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
                ${renderBestiaryStat("Saldırı", definition.attack)}
                ${attackRange ? renderBestiaryStat("Menzil", attackRange) : ""}
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

      <section class="selected-dossier frame">
        <p class="kicker">Irk Varyantları</p>
        <h2>Dalga kimlikleri</h2>
        <div class="bestiary-race-gallery">
          ${enemyRaceOrder.map((race) => `
            <article class="bestiary-race-row">
              <strong>${escapeHtml(formatEnemyRace(race))}</strong>
              <div>
                ${enemyTypeOrder.map((type) => `
                  <figure style="--enemy: ${enemyColor(type)}">
                    <img class="${getEnemyImageClass(race, type)}" src="${getEnemyImagePath(race, type)}" alt="" loading="lazy" />
                    <figcaption>${escapeHtml(enemyTypeLabels[type])}</figcaption>
                  </figure>
                `).join("")}
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="selected-dossier frame">
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

/**
 * Kart Arsivi: dusman arsivinin deseni, gorulen kartlar ve magaza esyalari.
 *
 * Gorulen satirda ad, nadirlik (esyada kategori), aciklama ve kartin kac
 * kosuda secildigi; gorulmemis olan yalnizca nadirligini soyleyen bir siluet.
 * Ad ve aciklama gorunum nesnesinde hic yok, yani HTML'e de sizamiyor.
 *
 * Tamamlanma bir sayac ve yuzde, bir hedef degil: %100 arsiv olcumde 75-125
 * kosu surdu ve hicbir sey acmiyor. Metin bunu acikca soyluyor.
 */
function renderCardArchive(state: CardArchiveState) {
  const view = buildCardArchiveView(state.archive);
  const section = state.tab === "items" ? view.items : view.cards;
  const empty = view.cards.seen === 0 && view.items.seen === 0;
  return `
    <div class="screen screen--card-archive">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="Ana menü">‹</button>
        <div>
          <p class="eyebrow">Keşif Kaydı</p>
          <h1>Kart Arşivi</h1>
        </div>
      </header>

      <section class="card-archive__summary selected-dossier frame">
        <div class="card-archive__meters">
          ${renderArchiveMeter(view.cards)}
          ${renderArchiveMeter(view.items)}
        </div>
        <p>${empty
          ? "Henüz bir şey görmedin: dalga ödülündeki kartlar ve kurulum mağazasındaki eşyalar görüldükçe buraya yazılır."
          : "Kart seçiminde ve altın mağazasında gördüğün her şey buraya yazılır."} Arşiv yalnızca bir kayıttır, güç vermez; yaratıcı mod sayılmaz.</p>
        ${state.available ? "" : `<p class="card-archive__warning">Bu tarayıcıda kayıt saklanamıyor; arşiv boş görünür.</p>`}
      </section>

      <div class="card-archive__tabs" role="tablist" aria-label="Arşiv bölümü">
        ${renderArchiveTab(view.cards, state.tab)}
        ${renderArchiveTab(view.items, state.tab)}
      </div>

      <section class="card-archive__groups" role="tabpanel" aria-label="${escapeHtml(section.label)}">
        ${section.groups.map((group) => renderArchiveGroup(section.kind, group)).join("")}
      </section>
    </div>
  `;
}

function renderArchiveMeter(section: ArchiveSectionView) {
  return `
    <div class="card-archive__meter">
      <p><span>${escapeHtml(section.label)}</span><b>${section.seen}/${section.total}</b><small>%${section.percent}</small></p>
      <i style="--fill: ${section.percent}%" aria-hidden="true"></i>
    </div>
  `;
}

function renderArchiveTab(section: ArchiveSectionView, active: ArchiveKind) {
  const selected = section.kind === active;
  return `
    <button class="card-archive__tab${selected ? " is-active" : ""}" type="button" role="tab" aria-selected="${selected}" data-archive-tab="${section.kind}">
      ${escapeHtml(section.label)} <b>${section.seen}/${section.total}</b>
    </button>
  `;
}

/** Bir nadirlik ya da kategori: once gorulenler, sonra siluetler. */
function renderArchiveGroup(kind: ArchiveKind, group: ArchiveGroupView) {
  const unit = kind === "cards" ? "kart" : "eşya";
  const locked = group.total - group.seen;
  const entries = group.entries.map((entry) => entry.seen
    ? `
      <article class="card-archive__entry">
        <header>
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(entry.tag)}</span>
        </header>
        <p>${escapeHtml(entry.description)}</p>
        ${entry.picks > 0 ? `<small>${entry.picks} koşuda seçildi</small>` : ""}
      </article>
    `
    : "").join("");
  // Siluetler tek bir resim gibi okunuyor: ekran okuyucu her birini tek tek
  // "Nadir" diye saymasin, grubun sayisini bir kez soylesin.
  const silhouettes = group.entries.map((entry) => entry.seen
    ? ""
    : `<span class="card-archive__silhouette"><b>?</b><small>${escapeHtml(entry.tag)}</small></span>`).join("");
  return `
    <section class="card-archive__group card-archive__group--${group.key}">
      <p class="section-label">${escapeHtml(group.label)} <b>${group.seen}/${group.total}</b></p>
      ${entries}
      ${locked > 0 ? `<div class="card-archive__locked" role="img" aria-label="${escapeHtml(`${group.label}: ${locked} ${unit} henüz görülmedi`)}">${silhouettes}</div>` : ""}
    </section>
  `;
}

/** Bu tarayicinin secili ve acilmis unvani; yoksa yok. Takim arkadasina gitmiyor. */
function getSelectedTitle(progress: ProgressState) {
  return resolveCosmetics(progress.cosmetics, getCosmeticFacts(progress.mastery, progress.badges)).title;
}

/** Ustalik cubugu: "Ustalık 3 · 140/200"; son seviyede "Ustalık 10 · tam". */
function renderMasteryMeter(mastery: ReturnType<typeof getMasteryProgress>) {
  const text = mastery.next === undefined ? `Ustalık ${mastery.level} · tam` : `Ustalık ${mastery.level} · ${mastery.points}/${mastery.next}`;
  return `
              <span class="mastery-meter" role="img" aria-label="${escapeHtml(text)}">
                <em>${escapeHtml(text)}</em>
                <i style="--fill: ${Math.round(mastery.ratio * 100)}%" aria-hidden="true"></i>
              </span>`;
}

/**
 * Nisanlar: Kart Arsivi'nin deseni. Kilitli nisan kosulunu yaziyor -- bir
 * hedef olarak okunsun -- ve anlamli oldugu yerde ilerlemesini ("4/7").
 * Ustte operator basina ustalik cubugu, altta gorunum (unvan, muhur, tac).
 * Hepsi kayit: hicbiri guc vermiyor, metin bunu acikca soyluyor.
 */
function renderBadges(progress: ProgressState, stageState: StageState, cardArchive: CardArchive) {
  const view = buildBadgeBoardView(progress.badges, { records: stageState.allRecords, archive: cardArchive });
  const facts = getCosmeticFacts(progress.mastery, progress.badges);
  const cosmetics = buildCosmeticsView(progress.cosmetics, facts);
  const noTitle = !cosmetics.titles.some((title) => title.selected);
  const percent = view.total > 0 ? Math.floor((view.earned / view.total) * 100) : 0;
  const operators = characters.map((character) => {
    const mastery = getMasteryProgress(getOperatorMasteryPoints(progress.mastery, progress.badges, character.id));
    return `
          <li class="mastery-row" style="--accent: ${classColor[character.id]}">
            <strong>${escapeHtml(character.displayName)}</strong>
            ${renderMasteryMeter(mastery)}
          </li>`;
  }).join("");
  return `
    <div class="screen screen--badges">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="Ana menü">‹</button>
        <div>
          <p class="eyebrow">Tanınma Kaydı</p>
          <h1>Nişanlar</h1>
        </div>
      </header>

      <section class="card-archive__summary selected-dossier frame">
        <div class="card-archive__meter">
          <p><span>Nişanlar</span><b>${view.earned}/${view.total}</b><small>%${percent}</small></p>
          <i style="--fill: ${percent}%" aria-hidden="true"></i>
        </div>
        <p>Her nişanın koşulu yazılı; kilitli olanlar hedef. Nişan ve ustalık yalnızca bir kayıttır, güç vermez; yaratıcı mod sayılmaz.</p>
        ${progress.available ? "" : `<p class="card-archive__warning">Bu tarayıcıda kayıt saklanamıyor; nişanlar boş görünür.</p>`}
      </section>

      <section class="badge-board__section">
        <p class="section-label">Operatör Ustalığı</p>
        <ul class="mastery-list">${operators}</ul>
        <p class="badge-board__hint">Ustalık temizlenen dalgalardan, ilk temizlemelerden, ilk ★★ ve ★★★'tan ve operatörün imza nişanlarından gelir; co-op'ta da aynı.</p>
      </section>

      <section class="card-archive__groups">
        ${view.groups.map(renderBadgeGroup).join("")}
      </section>

      <section class="badge-board__section">
        <p class="section-label">Görünüm</p>
        <p class="badge-board__hint">Yalnızca bu tarayıcıda görünür: unvan menüde, lobide ve seri afişinde; taç 10. seviye kulelerinde; mühür koşu raporunda.</p>
        <div class="cosmetic-group" role="group" aria-label="Unvan">
          <p class="cosmetic-group__label">Unvan</p>
          <div class="cosmetic-chips">
            <button type="button" class="cosmetic-chip${noTitle ? " is-active" : ""}" data-cosmetic-title="" aria-pressed="${noTitle}">Unvan yok</button>
            ${cosmetics.titles.map((title) => renderCosmeticChip(title, "title")).join("")}
          </div>
        </div>
        <div class="cosmetic-group" role="group" aria-label="Rapor mührü">
          <p class="cosmetic-group__label">Rapor mührü</p>
          <div class="cosmetic-chips">${cosmetics.stamps.map((stamp) => renderCosmeticChip(stamp, "stamp")).join("")}</div>
        </div>
        <div class="cosmetic-group" role="group" aria-label="Taç süsü">
          <p class="cosmetic-group__label">Taç süsü <small>${cosmetics.crown.unlocked ? "10. seviye kulelerinde" : escapeHtml(cosmetics.crown.condition)}</small></p>
          <div class="cosmetic-chips">
            <button type="button" class="cosmetic-chip${cosmetics.crown.on ? " is-active" : ""}" data-cosmetic-crown="on" aria-pressed="${cosmetics.crown.on}"${cosmetics.crown.unlocked ? "" : " disabled"}>Açık</button>
            <button type="button" class="cosmetic-chip${cosmetics.crown.on ? "" : " is-active"}" data-cosmetic-crown="off" aria-pressed="${!cosmetics.crown.on}"${cosmetics.crown.unlocked ? "" : " disabled"}>Kapalı</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

/** Kilitli secenek kapali ve kosulunu yaziyor; kurcalanan istek zaten reddediliyor. */
function renderCosmeticChip(option: CosmeticOptionView, kind: "title" | "stamp") {
  const attribute = kind === "title" ? `data-cosmetic-title="${escapeHtml(option.id)}"` : `data-cosmetic-stamp="${escapeHtml(option.id)}"`;
  if (!option.unlocked) {
    return `<button type="button" class="cosmetic-chip is-locked" ${attribute} disabled aria-label="${escapeHtml(`${option.label}, kilitli: ${option.condition}`)}"><b>${escapeHtml(option.label)}</b><small>${escapeHtml(option.condition)}</small></button>`;
  }
  return `<button type="button" class="cosmetic-chip${option.selected ? " is-active" : ""}" ${attribute} aria-pressed="${option.selected}">${escapeHtml(option.label)}</button>`;
}

function renderBadgeGroup(group: BadgeGroupView) {
  return `
    <section class="card-archive__group badge-group badge-group--${group.key}">
      <p class="section-label">${escapeHtml(group.label)} <b>${group.earned}/${group.total}</b></p>
      ${group.entries.map(renderBadgeEntry).join("")}
    </section>
  `;
}

/** Nisan satiri: kazanilan dolu elmas, kilitli bos elmas; renk tek isaret degil, etiket de yaziyor. */
function renderBadgeEntry(entry: BadgeEntryView) {
  const operator = entry.characterId ? characters.find((character) => character.id === entry.characterId)?.displayName : undefined;
  const tag = entry.earned ? "Kazanıldı" : entry.longTerm ? "Uzun vadeli" : operator ?? "Kilitli";
  const progress = entry.progress
    ? `<span class="badge-entry__progress" role="img" aria-label="İlerleme ${escapeHtml(entry.progress.text)}"><i style="--fill: ${entry.progress.percent}%"></i><small>${escapeHtml(entry.progress.text)}</small></span>`
    : "";
  return `
      <article class="card-archive__entry badge-entry${entry.earned ? " is-earned" : " is-locked"}">
        <header>
          <strong>${entry.earned ? "◈" : "◇"} ${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(tag)}</span>
        </header>
        <p>${escapeHtml(entry.condition)}</p>
        ${progress}
      </article>
  `;
}

function renderDetail(character: CharacterDefinition, selectedDetail: DetailItem) {
  const details = getDetailItems(character);
  return `
    <div class="screen" style="--accent: ${classColor[character.id]}">
      <header class="screen-topbar detail-topbar">
        <button class="icon-command" data-view="archive" aria-label="Arşive dön">‹</button>
        <div>
          <p class="eyebrow">Operator Dossier</p>
          <h1>${escapeHtml(character.displayName)}</h1>
        </div>
        <button class="command command--small command--primary" data-start-game>Başlat</button>
      </header>

      <section class="dossier-hero frame">
        <div class="sigil">${initials(character.displayName)}</div>
        <div class="dossier-copy">
          <strong>${escapeHtml(character.role)}</strong>
          <p>${escapeHtml(character.summary)}</p>
        </div>
      </section>

      <section class="loadout-grid">
        ${details.map((item) => `
          <button class="loadout-chip ${item.key === selectedDetail.key ? "is-active" : ""}" data-detail-key="${item.key}" style="--item: ${item.color}">
            <span>${detailTypeLabels[item.type]}</span>
            <strong>${escapeHtml(item.title)}</strong>
          </button>
        `).join("")}
      </section>

      <article class="intel-panel frame" style="--item: ${selectedDetail.color}; --accent: ${selectedDetail.color}">
        <span>${escapeHtml(selectedDetail.label)}</span>
        <h2>${escapeHtml(selectedDetail.title)}</h2>
        ${selectedDetail.blocks.map(renderDetailBlock).join("")}
      </article>
    </div>
  `;
}

function renderDetailBlock(block: DetailBlock): string {
  if (block.kind === "brief") {
    return `<p class="intel-brief">${escapeHtml(block.text)}</p>`;
  }

  if (block.kind === "note") {
    return `<p class="intel-note">${escapeHtml(block.text)}</p>`;
  }

  if (block.kind === "stats") {
    return `
      <section class="intel-block">
        <h3>${escapeHtml(block.label)}</h3>
        <dl class="intel-stats">
          ${block.rows.map((row) => `
            <div>
              <dt>${escapeHtml(row.label)}</dt>
              <dd>${escapeHtml(row.value)}</dd>
              ${row.hint ? `<small>${escapeHtml(row.hint)}</small>` : ""}
            </div>
          `).join("")}
        </dl>
      </section>
    `;
  }

  if (block.kind === "entries") {
    return `
      <section class="intel-block">
        <h3>${escapeHtml(block.label)}</h3>
        <ul class="intel-entries">
          ${block.items.map((item) => `
            <li>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.text)}</span>
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  return `
    <section class="intel-block">
      <h3>${escapeHtml(block.label)}</h3>
      <ol class="intel-steps">
        ${block.items.map((item) => `<li><span>${escapeHtml(item)}</span></li>`).join("")}
      </ol>
    </section>
  `;
}

function getDetailItems(character: CharacterDefinition): DetailItem[] {
  return [
    {
      key: "passive",
      title: splitTitle(character.passive).title ?? "Pasif",
      label: "Pasif",
      type: "passive",
      color: "#34d399",
      blocks: [{ kind: "brief", text: splitTitle(character.passive).body }]
    },
    {
      key: "ultimate",
      title: splitTitle(character.ultimate).title ?? "Ulti",
      label: "Ulti",
      type: "ultimate",
      color: "#facc15",
      blocks: [{ kind: "brief", text: splitTitle(character.ultimate).body }]
    },
    ...character.skills.map(skillToDetail),
    ...character.towers.map(towerToDetail)
  ];
}

// Passive and ultimate copy is written as "Ad: açıklama"; the name deserves to
// be the heading rather than sitting inside the paragraph.
function splitTitle(text: string): { title?: string; body: string } {
  const separator = text.indexOf(": ");
  if (separator < 0 || separator > 34) {
    return { body: text };
  }
  return { title: text.slice(0, separator), body: text.slice(separator + 2) };
}

function enemyColor(type: EnemyType) {
  return {
    grunt: "#ef4444",
    brute: "#b91c1c",
    runner: "#fb923c",
    shooter: "#f97316",
    siege: "#78716c"
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
  const variantClass = race === "spaceBug" && type === "brute"
    ? " enemy-game-sprite--space-bug-brute"
    : race === "fallen" && type === "brute"
      ? " enemy-game-sprite--fallen-brute"
      : "";
  return `enemy-game-sprite enemy-game-sprite--${type}${variantClass}`;
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
    label: "Yetenek",
    type: "skill",
    color: "#22d3ee",
    blocks: [
      { kind: "brief", text: skill.description },
      {
        kind: "stats",
        label: "Kullanım",
        rows: [{ label: "Bekleme", value: `${(skill.cooldownMs / 1000).toFixed(1)} sn` }]
      }
    ]
  };
}

/**
 * Vurus yavaslatmasinin gucu, sunucunun okudugu fonksiyondan.
 *
 * Izolasyon seviyeyle buyuyor (%10 -> %50), otekiler duz %52. Mesafeyle
 * degisen yavaslatma (Kin) kulenin dibinde %0, menzil ucunda %40.
 */
function formatSlowStrengthRow(tower: TowerDefinition) {
  const slow = tower.engine?.statusEffects?.find((effect) => effect.type === "slow");
  if (slow?.scaling === "distance") {
    return [{
      label: "Yavaşlatma gücü",
      value: `%0 → %${Math.round(KIN_SLOW_FAR_FRACTION * 100)} (uzaklıkla)`,
      hint: `Kulenin dibinde yavaşlatmaz, menzil ucunda %${Math.round(KIN_SLOW_FAR_FRACTION * 100)}. Buz Kırığı kritiğiyle 1,5 kat: en çok %${Math.round(getCriticalSlowFraction(KIN_SLOW_FAR_FRACTION) * 100)}.`
    }];
  }
  const level1 = getTowerHitSlowFraction(tower, 1);
  if (level1 === undefined) return [];
  const level10 = getTowerHitSlowFraction(tower, 10) ?? level1;
  const yuzde = (value: number) => `%${Math.round(value * 100)}`;
  const grows = Math.abs(level10 - level1) > 1e-9;
  return [{
    label: "Yavaşlatma gücü",
    value: grows ? `${yuzde(level1)} → ${yuzde(level10)}` : yuzde(level1),
    hint: grows
      ? `1. seviyeden 10. seviyeye, her seviyede eşit artar. Buz Kırığı kritiğiyle 1,5 kat: en çok ${yuzde(getCriticalSlowFraction(level10))}.`
      : `Düşman bu oranda yavaş yürür. Buz Kırığı kritiğiyle 1,5 kat: ${yuzde(getCriticalSlowFraction(level1))}.`
  }];
}

function towerToDetail(tower: TowerDefinition): DetailItem {
  const isPassiveTower = (tower.fireIntervalMs ?? 0) > 100000;
  const classType = tower.classType ?? "hybrid";
  const damageType = tower.damageType ?? "none";
  const hitType = tower.hitType ?? "impact";
  const blocks: DetailBlock[] = [{ kind: "brief", text: tower.description ?? tower.role }];

  // Every number below comes from the shared tower-stats module, which is the
  // same code the server runs. Reading the definition fields directly would
  // show the authored value rather than the one the match applies.
  const level1 = getTowerDisplayStats(tower, 1);
  const level10 = getTowerDisplayStats(tower, 10);

  blocks.push({
    kind: "stats",
    label: "Künye",
    rows: [
      { label: "Sınıf", value: classTypeCodex[classType]?.name ?? classType, hint: classTypeCodex[classType]?.text },
      { label: "Hasar türü", value: damageTypeCodex[damageType]?.name ?? damageType, hint: damageTypeCodex[damageType]?.text },
      { label: "Vuruş", value: hitTypeCodex[hitType]?.name ?? hitType, hint: hitTypeCodex[hitType]?.text },
      {
        label: "Menzil",
        value: level1.hasGlobalRange ? "Global" : `${level1.range.toFixed(0)} → ${level10.range.toFixed(0)}`,
        hint: level1.hasGlobalRange ? "Tüm haritayı görür." : "1. seviyeden 10. seviyeye."
      },
      ...(level1.minimumRange > 0
        ? [{ label: "Ölü bölge", value: `${level1.minimumRange.toFixed(0)}`, hint: "Bu mesafeden yakındaki hedefleri vuramaz." }]
        : []),
      ...(isPassiveTower
        ? []
        : [{
            label: "Atış aralığı",
            value: level1.hasFixedFireInterval
              ? `${(level1.realFireIntervalMs / 1000).toFixed(2)} sn (sabit)`
              : `${(level1.realFireIntervalMs / 1000).toFixed(2)} → ${(level10.realFireIntervalMs / 1000).toFixed(2)} sn`,
            hint: level1.hasFixedFireInterval
              ? "Bu kule atış hızı artışlarından etkilenmez."
              : "Gerçek saniye cinsinden, 1. seviyeden 10. seviyeye."
          }]),
      ...(tower.engine?.canHitAir !== undefined
        ? [{
            label: "Hava hedefi",
            value: tower.engine.canHitAir ? "Vurabilir" : "Vuramaz",
            hint: "Bazı dalgalarda düşmanların tamamı havacı gelir."
          }]
        : []),
      ...(getTowerAttackRadius(tower) > 0 ? [{ label: "Etki alanı", value: String(getTowerAttackRadius(tower)) }] : []),
      ...(getTowerSlowDurationMs(tower) > 0 ? [{ label: "Yavaşlatma", value: `${(getTowerSlowDurationMs(tower) / 1000).toFixed(2)} sn` }] : []),
      ...formatSlowStrengthRow(tower)
    ]
  });

  blocks.push({
    kind: "stats",
    label: "Ekonomi",
    rows: [
      { label: "Kuruluş", value: `${getTowerBuildCost(tower.cost)} altın` },
      { label: "2. seviye", value: `${getTowerLevelExpCost(tower.cost, 1)} XP` },
      { label: "3. seviye", value: `${getTowerLevelExpCost(tower.cost, 2)} XP` },
      { label: "4. seviye", value: `${getTowerLevelExpCost(tower.cost, 3)} XP` }
    ]
  });

  if (!isPassiveTower && tower.damage > 0) {
    blocks.push({
      kind: "stats",
      label: "Güç",
      rows: [
        { label: "1. seviye vuruş", value: level1.damage.toFixed(1) },
        { label: "10. seviye vuruş", value: level10.damage.toFixed(1) },
        { label: "1. seviye DPS", value: formatDps(tower, 1) },
        { label: "10. seviye DPS", value: formatDps(tower, 10), hint: "Gerçek saniye başına hasar. Evrim, işaret ve dizilim bonusları hariç." }
      ]
    });
  }

  const balanceNote = getTowerBalanceNote(tower.id);
  if (balanceNote) {
    blocks.push({ kind: "note", text: balanceNote });
  }

  const evolutionNotes = getTowerEvolutionArchiveNotes(tower);
  if (evolutionNotes.length > 0) {
    blocks.push({ kind: "steps", label: "Evrimler", items: evolutionNotes });
  }

  return {
    key: `tower-${tower.id}`,
    title: tower.name,
    label: tower.role,
    type: "tower",
    color: colorNumberToHex(tower.color),
    blocks
  };
}

function getTowerBalanceNote(towerId: string) {
  return {
    "warrior-2": "Uzun bağlantı ödülü: aynı kuleye 5 dalga bağlı kalırsa çarpma vuruşlu bağlı kule Sunucu seviyesine göre %12-30 ek hasar alır. 10 dalga bağlı kalırsa her vuruşa hedefin maksimum canının %0.1-0.5'i kadar ek hasar eklenir.",
    "warrior-4": "Çarpma vuruşlu olduğu için seviye ile atış hızı artmaz, DPS artışı hasara taşınır. Yaklaşık değerler: 6. seviye 850, 7. seviye 1200, 8. seviye 1500, 10. seviye 2000 DPS.",
    "warrior-5": "Gerçek atış aralığı 1. seviyede 0.20 sn, 5. seviyede 0.16 sn, 10. seviyede 0.12 sn. Overdrive 5. seviyede açılır; 10. seviyede zincir ışınına ek olarak iki ters dönen ışın. Overdrive ışınları da aynı aralıkla vurur; 10. seviyedeki iki ek ışın birer tam tur atar ve birden fazla ışının altında kalan düşman atış başına bir kez vurulur.",
    "warrior-6": "Dalga bonusları 2, 4, 6, 8, 10, 14 ve 16. tamamlanan dalgada açılır. Tam kurulumda (10. seviye, 16 dalga, 15 stack, 2 zincir) yaklaşık 4228 DPS'ye ulaşır."
  }[towerId];
}

function getTowerEvolutionArchiveNotes(tower: TowerDefinition) {
  const notes: Record<string, string[]> = {
    "archer-1": [
      "Ölüler Bağı'na bağlı bir düşman menziline girerse ona öncelik verir; zaten böyle bir hedefe vuruyorsa hedef değiştirmez.",
      "Aynı hedefe kilitlenen her ek Hedefçi için hasar 1.5 katına çıkar.",
      "Şüphe yüklü hedeflere vururken o hedefe özel atış hızı kazanır: 1 yükte %10, 2 yükte %20, 3 yükte %40."
    ],
    "archer-2": [
      "Düz vuruşuyla son vuruşu yaptığında da korku dalgasını tetikler.",
      "Korku dalgası kalkanlı bir hedefe denk gelirse kalkan katmanına iki kat hasar verir.",
      "Korku süresi 0.5 saniye artarak toplam 1 saniyeye çıkar."
    ],
    "archer-3": [
      "Lanet uygulama alanı genişler.",
      "Lanetli düşman öldüğünde altında 3 saniyelik lanet göleti bırakır; gölete giren düşmanlar bir kez lanet yükü alır.",
      "Gölet artık pasif değildir: üzerindeki düşmanlara 0.5 saniyede bir yeniden lanet uygular."
    ],
    "archer-4": [
      "Ölüler alemine çekilen hedefin bitişiğindeki düşmanlar 1 saniye korkar.",
      "Aynı anda kurabildiği bağ sayısı 2'ye çıkar.",
      "İnfaz edilen bir Uzak Atıcı, nexus tarafında ölü olarak dirilir ve kendi ırkına karşı savaşır."
    ],
    "archer-5": [
      "Komşu kulelerden depoladığı hasar oranı %4 artar.",
      "Patlamanın %25'i zırhı yok sayan gerçek hasara dönüşür.",
      "Patlama hedefi öldürürse tüm Melis kuleleri 2 saniye boyunca %20 atış hızı kazanır."
    ],
    "archer-6": [
      "Korku altındaki bir düşmanda duraksama tetiklenirse hedef 1 saniye taraf değiştirir ve kendi ırkına saldırır.",
      "Taraf değiştiren hedef fiziksel engel olur; arkadan gelen düşmanlar ilerlemek için onu öldürmek zorunda kalır.",
      "Taraf değiştiren hedefin canı %10'un altına inerse kalan canı kadar fiziksel patlama yapar."
    ]
  };

  return notes[tower.id] ?? [];
}

function formatDps(tower: TowerDefinition, level: number) {
  return getTowerDisplayStats(tower, level).dps.toFixed(1);
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

function parseMapScale(value: string | undefined): MapScale {
  const scale = Number(value);
  return scale === 2 || scale === 3 || scale === 4 ? scale : 1;
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
