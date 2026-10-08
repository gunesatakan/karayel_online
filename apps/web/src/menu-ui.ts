import { Room } from "colyseus.js";
import type Phaser from "phaser";
import {
  characters,
  MAP_STORAGE_KEY,
  createDefaultEditableMap,
  STAGE_COUNT,
  WAVES_PER_STAGE,
  COUNTER_SURGE_FIRST_WAVE,
  SPECIAL_ENEMIES_FIRST_STAGE,
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
  towerNeverAttacks,
  getTowerDisplayStats,
  getTowerSlowDurationMs,
  getTowerHitSlowFraction,
  getCriticalSlowFraction,
  KIN_SLOW_FAR_FRACTION,
  getTowerLevelExpCost,
  getTile,
  isPlayableCharacterId,
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
  CROWN_UNLOCK,
  STAMP_CATALOG,
  TITLE_CATALOG,
  getBadgeDefinition,
  getCardDefinition,
  type CosmeticUnlock,
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
import { readTelemetrySetting, setTelemetryEnabled } from "./telemetry";
import { getLocale, onLocaleChange, setLocale, t, tMaybe, type Locale, type MessageKey, type MessageParams } from "./i18n";
import {
  clearMatchReconnect,
  getSharedClient,
  isServerFullError,
  leaveRoomAndForget,
  loadMatchReconnect,
  resumeSavedMatch,
  retryExpiredSeatReservation,
  setActiveLobbyRoom,
  setResumedMatch,
  takeResumedMatch,
  withWireCaps,
  type MatchReconnectRecord
} from "./online-session";
import { assetUrl } from "./asset-url";
import { forwardStrayMenuWheel } from "./menu-scroll";
import { describeServerError, localizeServerText } from "./server-text";
import { resetTutorialProgress } from "./tutorial";
import { CREDIT_GROUPS, CREDITS_DEVELOPER, creditLinkLabel } from "./credits";
import { installMenuMusic, readMenuMusicMuted } from "./menu-music";
import {
  getDefaultOperator,
  getLockedOperatorNote,
  isPlayableOperator,
  lockedOperatorAttributes,
  renderOperatorLock,
  renderOperatorLockDescription,
  resolvePlayableOperator
} from "./operator-lock";

type ViewName = "home" | "archive" | "detail" | "map" | "online" | "lobby" | "bestiary" | "cardArchive" | "badges" | "credits";

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
/**
 * Ekranda kalan durum/hata satiri: metnin kendisi degil onu ureten
 * fonksiyon. Parametreler o anki degerleriyle donduruluyor, metin her
 * cizimde secili dilde kuruluyor.
 */
type UiText = () => string;
const noText: UiText = () => "";
const uiText = (key: MessageKey, params?: MessageParams): UiText => () => t(key, params);

// Etiketler cizim aninda sozlukten: dil degisince bir sonraki cizim yeni dilde.
const detailTypeLabel = (type: DetailItem["type"]) => t(`menu.detail.type.${type}`);
const enemyTypeLabel = (type: EnemyType) => t(`menu.enemy.type.${type}`);

// Oyun ici takim toast'u da ayni rengi kullaniyor; tek kaynak orada.
const classColor = CHARACTER_CLASS_COLORS;

// Portraits that exist as real art; everyone else falls back to an engraved mark.
// `srcset` yalnizca birden cok boyutu olan gorselde: muhur en fazla ~76 px,
// 1x ekranda 128'lik, yogun ekranda 256'lik dosya iniyor.
type CharacterArt = { src: string; srcset?: string };
const characterArt: Partial<Record<CharacterId, CharacterArt>> = {
  zeynep: { src: assetUrl("images/zeynep-puppet-hands.png") },
  archer: { src: assetUrl("images/melis-creepy.png") },
  warrior: {
    src: assetUrl("images/attacklord-icon-256.webp"),
    srcset: `${assetUrl("images/attacklord-icon-128.webp")} 128w, ${assetUrl("images/attacklord-icon-256.webp")} 256w`
  }
};


// Dusman dosyasi: tehdit seviyesi burada, metinler sozlukte (menu.enemy.<tur>.*).
const enemyThreat: Record<EnemyType, "low" | "medium" | "high"> = {
  grunt: "low",
  brute: "high",
  siege: "high",
  runner: "medium",
  shooter: "medium"
};

function enemyDossier(type: EnemyType) {
  return {
    name: t(`menu.enemy.${type}.name`),
    title: t(`menu.enemy.${type}.title`),
    threat: t(`menu.enemy.threat.${enemyThreat[type]}`),
    summary: t(`menu.enemy.${type}.summary`)
  };
}

export function setupMenuUi(game: Phaser.Game) {
  const root = document.querySelector<HTMLDivElement>("#menu-root");
  const gameRoot = document.querySelector<HTMLDivElement>("#game");
  if (!root || !gameRoot) {
    return;
  }

  let selectedCharacter = getDefaultOperator();
  let selectedDetail = getDetailItems(selectedCharacter)[0];
  let savedMaps = loadSavedMapRecords();
  let activeSavedMapId = savedMaps[0]?.id ?? "";
  let selectedMapName = savedMaps[0]?.name ?? t("menu.map.defaultName", { n: 1 });
  let selectedMap = savedMaps[0]?.map ?? loadStoredMap();
  let selectedMapTool: MapTileKind = "road";
  let selectedMapScale: MapScale = selectedMap.scale;
  // Durum ve hata satirlari metin degil metin ureten fonksiyon: dil degisince
  // yeniden cizim ayni durumu yeni dilde yaziyor. Sunucunun yolladigi hata
  // metni oldugu gibi kaliyor.
  let mapSaveStatus = savedMaps.length > 0
    ? uiText("menu.map.status.loaded", { name: selectedMapName })
    : uiText("menu.map.status.ready");
  let onlineTab: OnlineTab = "create";
  let roomListings: RoomListingSnapshot[] = [];
  let currentLobbyRoom: Room | undefined;
  let currentLobbyState: LobbyStateSnapshot | undefined;
  let lobbyError: UiText = noText;
  let onlineGameStarting = false;
  let onlineRoomRequestPending = false;
  let phaserReady = false;
  // Dil degisince yeniden cizilecek ekran.
  let currentView: ViewName = "home";
  // The backdrop lives outside the render cycle: rebuilding it per view would
  // re-decode the splash and replay its fade on every navigation.
  root.innerHTML = renderBackdrop();
  const shellHost = document.createElement("div");
  shellHost.className = "menu-shell-host";
  root.append(shellHost);
  // Masaustunde ortadaki sutunun disinda tekerlek/touchpad de ekrani kaydirsin.
  forwardStrayMenuWheel(shellHost);
  // Kilitli operatore dokunus notu: yeniden cizimin disinda, ekranlar arasi kaliyor.
  const operatorToast = document.createElement("p");
  operatorToast.className = "menu-toast";
  operatorToast.setAttribute("role", "status");
  operatorToast.setAttribute("aria-live", "polite");
  root.append(operatorToast);
  let operatorToastTimer: number | undefined;
  const showLockedOperatorNote = (characterId: string | undefined) => {
    operatorToast.textContent = getLockedOperatorNote(characterId);
    operatorToast.classList.add("is-visible");
    window.clearTimeout(operatorToastTimer);
    operatorToastTimer = window.setTimeout(() => operatorToast.classList.remove("is-visible"), 2400);
  };

  const splashArt = root.querySelector<HTMLImageElement>("[data-splash-art]");
  if (splashArt) {
    if (splashArt.complete) {
      splashArt.classList.add("is-loaded");
    } else {
      splashArt.addEventListener("load", () => splashArt.classList.add("is-loaded"), { once: true });
    }
  }

  const render = (view: ViewName) => {
    currentView = view;
    root.dataset.screen = view;
    // Secili dosya ogesi metinleriyle saklaniyor; anahtarindan yeniden
    // kuruluyor ki dil degisince eski dilde kalmasin.
    selectedDetail = getDetailItems(selectedCharacter).find((item) => item.key === selectedDetail.key) ?? getDetailItems(selectedCharacter)[0];
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
      mapSaveStatus(),
      savedMaps,
      activeSavedMapId,
      selectedMapName,
      lobbyError(),
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
    // Kilitli operatorle birakilmis not (eski surum) varsayilan operatore duser.
    const character = resolvePlayableOperator(quickStart.characterId);
    selectedCharacter = character;
    selectedDetail = getDetailItems(character)[0];
    stageState = { ...stageState, selected: resolveQuickStartStage(quickStart, stageState.cleared) };
    if (selectedMap.scale !== quickStart.mapScale) selectedMap = scaleEditableMap(selectedMap, quickStart.mapScale);
    selectedMapScale = quickStart.mapScale;
    if (quickStart.mode === "online") onlineTab = "create";
  }

  /**
   * Lobi muzigi (menu-music.ts): menu ve bekleme odasi boyunca, ilk
   * dokunustan sonra. Mac baslarken `startGame` susturuyor. Kosu raporunun
   * "Tekrar"i menuyu atlayip maca gidiyor; o yolda parca onden yuklenmiyor.
   */
  const menuMusic = installMenuMusic({ preload: !quickStart || quickStart.mode === "online" });

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

  /**
   * Maca giden operator her zaman oynanabilir: secim bir sekilde kilitli
   * operatorde kaldiysa varsayilana duser. Solo baslatma ve oda kurma/katilma
   * kimligi buradan aliyor.
   */
  const ensurePlayableSelection = () => {
    if (!isPlayableOperator(selectedCharacter.id)) {
      selectedCharacter = getDefaultOperator();
      selectedDetail = getDetailItems(selectedCharacter)[0];
    }
    return selectedCharacter.id;
  };

  const startGame = (mode: "solo" | "online" = "solo", resume?: MatchReconnectRecord) => {
    if (!phaserReady || onlineGameStarting) {
      return;
    }
    onlineGameStarting = true;
    // Her solo baslatma yolu (Savaşa Gir, Eğitim, yaratici, harita, Tekrar) buradan.
    ensurePlayableSelection();
    // Sahne devraliyor: lobi muzigi ~600 ms'de susup kaynagini birakiyor, mac muziksiz.
    menuMusic.stop();
    root.classList.add("menu-root--hidden");
    gameRoot.classList.remove("game-root--hidden");
    game.scene.stop("preloader");
    // Yeniden yuklemeden donulen mac: operator, olcek ve asama kayittan; oda
    // sahneye `setResumedMatch` ile gidiyor.
    if (resume) {
      game.scene.start("game", {
        characterId: resolvePlayableOperator(resume.characterId).id,
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
    lobbyError = noText;
    // Birakilan odanin gec gelen mesaji oyuncuyu lobiye geri cekmesin.
    room.onMessage("lobby:state", (state: LobbyStateSnapshot) => {
      if (currentLobbyRoom !== room) return;
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
    room.onMessage("lobby:error", (payload: { message?: string; key?: string }) => {
      if (currentLobbyRoom !== room) return;
      // Sunucunun metni Turkce; anahtari varsa secili dilde, yoksa yerel yedek.
      const message = payload.message;
      lobbyError = message ? () => localizeServerText(message, payload.key) ?? message : uiText("menu.online.error.lobby");
      render("lobby");
    });
    room.onMessage("lobby:started", () => {
      if (currentLobbyRoom !== room) return;
      startGame("online");
    });
  };

  /**
   * Bekleme odasindan ayrilma ("‹" / "Odadan ayrıl").
   *
   * Dugme eskiden yalnizca ekrani oda listesine ceviriyordu: oyuncu odada
   * kaliyor, lobi durumu gelince ekran lobiye geri donuyordu ve odadan
   * cikmanin bir yolu yoktu. Simdi izinli cikis (`leave(true)`): sunucu
   * oyuncuyu odadan siliyor, kurucuysa kurucu digerine geciyor. Etkin lobi
   * odasi ve yeniden baglanma kaydi siliniyor; ekran oda listesine donup
   * listeyi yeniliyor.
   */
  const leaveLobby = () => {
    const room = currentLobbyRoom;
    currentLobbyRoom = undefined;
    currentLobbyState = undefined;
    lobbyError = noText;
    void leaveRoomAndForget(room);
    render("online");
    void refreshRoomListings();
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
      lobbyError = uiText("menu.online.error.rooms");
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
      lobbyError = noText;
      const roomNameInput = root.querySelector<HTMLInputElement>("[data-room-name-input]");
      const roomName = roomNameInput?.value.trim() || t("menu.online.defaultRoomName", { name: selectedCharacter.displayName });
      const client = getSharedClient(gameServerUrl);
      const room = await retryExpiredSeatReservation(() => client.create("match", withWireCaps({
        playerName: getPlayerName(),
        characterId: ensurePlayableSelection(),
        roomName,
        mapScale: selectedMapScale,
        mapData: selectedMap,
        // Asama gitmezse sunucu ilk asamaya dusuyor ve co-op zaferi hep 1.
        // asamayi isaretliyordu; kurucunun sectigi asama odanin asamasi.
        stage: stageState.selected
      })));
      bindLobbyRoom(room);
      render("lobby");
    } catch (error) {
      // Dolu sunucu: oda kurulamadi ama listedeki odalara katilmak hala mumkun.
      // Sunucu dolu hatasi taninip yerel metinle yaziliyor (Turkcesi SERVER_FULL_MESSAGE ile ayni).
      lobbyError = isServerFullError(error) ? uiText("menu.online.serverFull") : formatUiError(error, "menu.online.error.create");
      render("online");
    } finally {
      onlineRoomRequestPending = false;
    }
  };

  const joinRoom = async (roomId: string) => {
    if (onlineRoomRequestPending) return;
    onlineRoomRequestPending = true;
    try {
      lobbyError = noText;
      const client = getSharedClient(gameServerUrl);
      const room = await retryExpiredSeatReservation(() => client.joinById(roomId, withWireCaps({
        playerName: getPlayerName(),
        characterId: ensurePlayableSelection()
      })));
      bindLobbyRoom(room);
      render("lobby");
    } catch (error) {
      lobbyError = formatUiError(error, "menu.online.error.join");
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
        // Kilitli operator secilmiyor; dokunus/tiklama notu gosteriyor (mobilde hover yok).
        if (!isPlayableOperator(character.id)) {
          showLockedOperatorNote(character.id);
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

    // Anonim telemetri tercihi: depoya yaziliyor, menu yeniden cizilmiyor.
    root.querySelectorAll<HTMLInputElement>("[data-telemetry-toggle]").forEach((input) => {
      input.addEventListener("change", () => setTelemetryEnabled(input.checked));
    });

    // Lobi muzigi dugmesi: kalici sessiz bayragi; menu yeniden cizilmiyor, dugme yerinde guncelleniyor.
    root.querySelectorAll<HTMLButtonElement>("[data-menu-music-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        menuMusic.setMuted(!menuMusic.isMuted());
        applyMusicToggleState(button, menuMusic.isMuted());
      });
    });

    // Dil secici: secim kaydediliyor, `onLocaleChange` dinleyicisi menuyu yeniden ciziyor.
    root.querySelectorAll<HTMLElement>("[data-locale]").forEach((button) => {
      button.addEventListener("click", () => {
        const locale = button.dataset.locale;
        if (locale === "tr" || locale === "en") setLocale(locale);
      });
    });

    root.querySelectorAll<HTMLElement>("[data-start-game]").forEach((button) => {
      button.addEventListener("click", () => {
        // Egitim: brifing ilerlemesi sifirlanip normal solo mac.
        if (button.hasAttribute("data-replay-tutorial")) resetTutorialProgress();
        startGame("solo");
      });
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
        mapSaveStatus = uiText("menu.map.status.unsaved");
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
        mapSaveStatus = uiText("menu.map.status.selected", { name: selectedMapName });
        render("map");
      });
    });

    root.querySelectorAll<HTMLElement>("[data-map-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.mapAction;
        const nameInput = root.querySelector<HTMLInputElement>("[data-map-name-input]");
        selectedMapName = nameInput?.value.trim().slice(0, 28) || selectedMapName || t("menu.map.defaultName", { n: savedMaps.length + 1 });
        if (action === "new") {
          selectedMap = createDefaultEditableMap(selectedMapScale);
          activeSavedMapId = "";
          selectedMapName = t("menu.map.defaultName", { n: savedMaps.length + 1 });
          mapSaveStatus = uiText("menu.map.status.new");
        }
        if (action === "reset") {
          selectedMap = createDefaultEditableMap(selectedMap.scale);
          selectedMapScale = selectedMap.scale;
          mapSaveStatus = uiText("menu.map.status.reset");
        }
        if (action === "clear") {
          selectedMap = createDefaultEditableMap(selectedMap.scale);
          selectedMap.tiles = selectedMap.tiles.map(() => "tower");
          selectedMapScale = selectedMap.scale;
          mapSaveStatus = uiText("menu.map.status.clear");
        }
        if (action === "save") {
          const saved = saveStoredMap(selectedMap, selectedMapName, activeSavedMapId);
          savedMaps = loadSavedMapRecords();
          activeSavedMapId = saved.id;
          selectedMapName = saved.name;
          selectedMap = saved.map;
          selectedMapScale = selectedMap.scale;
          mapSaveStatus = uiText("menu.map.status.saved", { name: selectedMapName });
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
          mapSaveStatus = uiText("menu.map.status.scaled", { scale: nextScale });
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
        if (!characterId || !isPlayableOperator(characterId)) {
          showLockedOperatorNote(characterId);
          return;
        }
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

    root.querySelectorAll<HTMLElement>("[data-lobby-leave]").forEach((button) => {
      button.addEventListener("click", leaveLobby);
    });
  };

  // Sayfa dili secili dilden: CSS buyuk harfi ("i" -> "İ"/"I") ona bakiyor.
  // Dil degisince acik ekran yeniden ciziliyor (setupMenuUi bir kez cagriliyor,
  // dinleyici de bir kez kuruluyor). Odak dil dugmesindeyse yenisine geciyor.
  document.documentElement.lang = getLocale();
  onLocaleChange((locale) => {
    const pickerFocused = document.activeElement instanceof HTMLElement && document.activeElement.hasAttribute("data-locale");
    render(currentView);
    if (pickerFocused) root.querySelector<HTMLElement>(`[data-locale="${locale}"]`)?.focus();
  });

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
  // Kilitli operatorle kaydedilmis mac (kilitten onceki surum) geri acilmiyor:
  // kayit siliniyor, menu normal aciliyor.
  const storedMatch = quickStart ? undefined : loadMatchReconnect();
  if (storedMatch && !isPlayableCharacterId(storedMatch.characterId)) clearMatchReconnect(storedMatch.roomId);
  const savedMatch = storedMatch && isPlayableCharacterId(storedMatch.characterId) ? storedMatch : undefined;
  if (savedMatch) {
    void resumeSavedMatch(gameServerUrl, savedMatch).then((room) => {
      if (!room) return;
      if (currentLobbyRoom || onlineGameStarting) {
        void room.leave(true);
        return;
      }
      setResumedMatch(room, savedMatch.mode, savedMatch.ownerSecret);
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
      ? t("menu.stage.detail", { race: escapeHtml(stage.raceName), waves: WAVES_PER_STAGE })
      : t("menu.stage.locked");
    const profileLine = unlocked
      ? `<em>${t("menu.stage.profile", {
        weak: profile.weakTo.map((type) => damageTypeCodex[type].name).join(", "),
        resistant: profile.resistantTo.map((type) => damageTypeCodex[type].name).join(", ")
      })}</em>`
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
    <section class="stages" aria-label="${t("menu.stage.title")}">
      <p class="section-label">${t("menu.stage.title")} <b>${stageState.cleared.length}/${STAGE_COUNT}</b></p>
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
    const mode = t(checkpoint.mode === "all" ? "menu.stage.pipAir" : "menu.stage.pipMixed");
    const label = `${t("menu.stage.pip", { wave: checkpoint.wave, mode })}${checkpoint.passed ? t("menu.stage.pipPassed") : ""}`;
    return `<i class="stage__pip stage__pip--${checkpoint.mode}${checkpoint.passed ? " is-passed" : ""}" style="left: ${left.toFixed(1)}%" title="${label}"></i>`;
  }).join("");
  const waves = checkpoints.map((checkpoint) => checkpoint.wave).join(", ");
  const trackLabel = record
    ? t("menu.stage.trackWithBest", { best: bestWave, total: WAVES_PER_STAGE, waves })
    : t("menu.stage.track", { waves });
  const fill = Math.min(100, Math.max(0, (bestWave / WAVES_PER_STAGE) * 100));
  return `
          <span class="stage__record">
            <span class="stage__track" role="img" aria-label="${trackLabel}"><b style="width: ${fill.toFixed(1)}%"></b>${pips}</span>
            ${record ? `<span class="stage__best">${t("menu.stage.best", { best: bestWave, total: WAVES_PER_STAGE })}</span>
            <span class="stage__stars" aria-label="${t("menu.stage.stars", { n: record.bestStars })}">${formatStars(record.bestStars)}</span>` : ""}
          </span>`;
}

function renderBackdrop() {
  return `
    <div class="menu-backdrop" aria-hidden="true">
      <img
        class="backdrop__art"
        data-splash-art
        src="${assetUrl("images/splash-siege.webp")}"
        srcset="${assetUrl("images/splash-siege-sm.webp")} 640w, ${assetUrl("images/splash-siege.webp")} 1024w"
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
        ? `<img class="sigil__art" src="${art.src}"${art.srcset ? ` srcset="${art.srcset}" sizes="76px"` : ""} alt="" loading="lazy" decoding="async" />`
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
  selectedMapName = t("menu.map.defaultName", { n: 1 }),
  lobbyError = "",
  stageState: StageState = { cleared: [], selected: 1 },
  cardArchive: CardArchiveState = { archive: createEmptyCardArchive(), available: true, tab: "cards" },
  progress: ProgressState = { badges: {}, mastery: createEmptyMasteryBook(), cosmetics: createDefaultCosmetics(), available: true }
) {
  return `
    <main class="menu-shell">
      ${renderOperatorLockDescription()}
      <section class="menu-stage">
        ${view === "home" ? renderHome(selectedCharacter, stageState, cardArchive.archive, progress) : ""}
        ${view === "archive" ? renderArchive(selectedCharacter, progress) : ""}
        ${view === "badges" ? renderBadges(progress, stageState, cardArchive.archive) : ""}
        ${view === "credits" ? renderCredits() : ""}
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
        <p class="eyebrow"><i class="rule-dot"></i>${t("menu.home.eyebrow")}</p>
        <h1 class="brand__word">Nexhold</h1>
        <div class="brand__rule" aria-hidden="true"><i></i><span class="rule-dot"></span><i></i></div>
      </header>

      <section class="hero frame" style="--accent: ${classColor[selectedCharacter.id]}">
        ${renderSigil(selectedCharacter.id, initials(selectedCharacter.displayName))}
        <div class="hero__copy">
          <p class="kicker">${t("menu.home.selectedOperator")}</p>
          <h2>${operatorNameHtml(selectedCharacter.displayName)}</h2>
          <p class="hero__role">${escapeHtml(selectedCharacter.role)}</p>
          <p class="hero__mastery"><b>${t("menu.home.mastery", { level: mastery.level })}</b>${title ? `<span>${escapeHtml(title)}</span>` : ""}</p>
        </div>
        <button class="hero__cta" data-view="detail" aria-label="${t("menu.home.dossierAria")}">
          <i>›</i>
          ${t("menu.home.dossier")}
        </button>
        <dl class="hero__stats">
          <div><dt>${t("menu.home.stat.hp")}</dt><dd>${selectedCharacter.maxHp}</dd></div>
          <div><dt>${t("menu.home.stat.damage")}</dt><dd>${selectedCharacter.damage}</dd></div>
          <div><dt>${t("menu.home.stat.towers")}</dt><dd>${selectedCharacter.towers.length}</dd></div>
        </dl>
      </section>

      <section class="roster" aria-label="${t("menu.home.rosterAria")}">
        <p class="section-label">${t("menu.home.roster")} <b>${characters.length}</b></p>
        <div class="roster__grid">
          ${characters.map((character) => `
            <button class="token ${character.id === selectedCharacter.id ? "is-active" : ""} ${isPlayableOperator(character.id) ? "" : "is-operator-locked"}" data-character-id="${character.id}"${lockedOperatorAttributes(character.id)} style="--accent: ${classColor[character.id]}">
              ${renderSigil(character.id, initials(character.displayName))}
              <span class="token__name">${operatorNameHtml(character.displayName)}</span>
              ${renderOperatorLock(character.id)}
            </button>
          `).join("")}
        </div>
      </section>

      ${renderStageBoard(stageState)}

      <footer class="home-actions">
        <button class="command command--hero" data-start-game>
          <span>${t("menu.home.deploy")}</span>
          <small>${t("menu.home.stageLine", { n: stageState.selected, name: escapeHtml(getStage(stageState.selected).name) })}</small>
        </button>
        <div class="home-actions__grid">
          <button class="command command--ghost" data-start-creative>${t("menu.home.creative")}</button>
          <button class="command command--ghost" data-view="online">Online</button>
          <button class="command command--ghost" data-view="archive">${t("menu.home.operator")}</button>
          <button class="command command--ghost" data-view="bestiary">${t("menu.home.enemies")}</button>
          <button class="command command--ghost" data-view="map">${t("menu.home.map")}</button>
          <button class="command command--ghost command--count" data-view="cardArchive" aria-label="${t("menu.home.cardArchiveAria", { progress: cardProgress })}">
            <span>${t("menu.home.cardArchive")}</span>
            <small>${cardProgress}</small>
          </button>
          <button class="command command--ghost" data-start-game data-replay-tutorial>${t("menu.home.tutorial")}</button>
          <button class="command command--ghost command--count" data-view="badges" aria-label="${t("menu.home.badgesAria", { earned: board.earned, total: board.total })}">
            <span>${t("menu.home.badges")}</span>
            <small>${board.earned}/${board.total}</small>
          </button>
          <button class="command command--ghost" data-view="credits">${t("credits.menuButton")}</button>
        </div>
      </footer>

      <aside class="slate">
        <span class="slate__name">${escapeHtml(getPlayerName())}</span>
        <label class="slate__privacy" title="${escapeHtml(t("menu.telemetry.note"))}">
          <input type="checkbox" data-telemetry-toggle aria-label="${escapeHtml(t("menu.telemetry.label"))}"${readTelemetrySetting() ? " checked" : ""} />${t("menu.home.telemetry")}
        </label>
        ${renderMusicToggle(readMenuMusicMuted())}
        ${renderLocalePicker()}
        <span class="slate__node"><i></i>Frankfurt Shard</span>
      </aside>
    </div>
  `;
}

/**
 * Lobi muzigi dugmesi: alt seritte dil seciciyle ayni ince cerceve, tek
 * hucre, nota isareti. Kapaliyken notanin ustunden capraz bir cizgi geciyor.
 * Ad sabit ("Lobi müziği"), durum `aria-pressed`te (acik = basili); `title`
 * durumu yaziyor.
 */
function renderMusicToggle(muted: boolean) {
  return `
        <button type="button" class="music-toggle${muted ? " is-muted" : ""}" data-menu-music-toggle aria-label="${escapeHtml(t("menu.music.label"))}" aria-pressed="${!muted}" title="${escapeHtml(t(muted ? "menu.music.off" : "menu.music.on"))}"><i aria-hidden="true">♪</i></button>`;
}

function applyMusicToggleState(button: HTMLElement, muted: boolean) {
  button.classList.toggle("is-muted", muted);
  button.setAttribute("aria-pressed", String(!muted));
  button.title = t(muted ? "menu.music.off" : "menu.music.on");
}

/**
 * Dil secici: alt seritte TR | EN. Gorunen etiket kisaltma, tam ad
 * `title`da ve kendi dilinde (`lang`) okunuyor; secili olan `aria-pressed`.
 * Grup `div`: `.slate span` kurali secicinin parcalarini esnetmesin.
 */
function renderLocalePicker() {
  const active = getLocale();
  const option = (locale: Locale, code: string) => `
          <button type="button" class="locale-picker__option${locale === active ? " is-active" : ""}" data-locale="${locale}" lang="${locale}" aria-pressed="${locale === active}" title="${t(`language.${locale}`)}">${code}</button>`;
  return `
        <div class="locale-picker" role="group" aria-label="${t("language.label")}">${option("tr", "TR")}${option("en", "EN")}
        </div>`;
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
        <button class="icon-command" data-view="home" aria-label="${t("menu.common.back")}">‹</button>
        <div>
          <p class="eyebrow">Online Nexus</p>
          <h1>${t("menu.online.title")}</h1>
        </div>
        <span class="status-pill">${operatorNameHtml(selectedCharacter.displayName)}</span>
      </header>

      <section class="online-tabs" aria-label="${t("menu.online.tabsAria")}">
        <button class="command ${onlineTab === "create" ? "command--primary" : "command--ghost"}" data-online-tab="create">${t("menu.online.create")}</button>
        <button class="command ${onlineTab === "join" ? "command--primary" : "command--ghost"}" data-online-tab="join">${t("menu.online.join")}</button>
      </section>

      ${lobbyError ? `<p class="online-error">${escapeHtml(lobbyError)}</p>` : ""}

      ${onlineTab === "create" ? `
        <section class="selected-dossier frame online-card" style="--accent: ${classColor[selectedCharacter.id]}">
          <p class="kicker">${t("menu.online.setup")}</p>
          <h2>${t("menu.online.newRoom")}</h2>
          <label class="field-stack">
            <span>${t("menu.online.roomName")}</span>
            <input class="text-field" data-room-name-input value="${escapeHtml(t("menu.online.defaultRoomName", { name: selectedCharacter.displayName }))}" maxlength="24" />
          </label>
          <div class="scale-picker">
            <span>${t("menu.online.mapScale")}</span>
            <div class="scale-picker__buttons">
              <button class="scale-chip ${selectedMapScale === 1 ? "is-active" : ""}" data-map-scale="1">1x</button>
              <button class="scale-chip ${selectedMapScale === 2 ? "is-active" : ""}" data-map-scale="2">2x</button>
              <button class="scale-chip ${selectedMapScale === 3 ? "is-active" : ""}" data-map-scale="3">3x</button>
              <button class="scale-chip ${selectedMapScale === 4 ? "is-active" : ""}" data-map-scale="4">4x</button>
            </div>
          </div>
          <p class="online-note">${t("menu.online.scaleNote")}</p>
          <p class="online-note">${t("menu.online.stageLabel")} <b>${stage.id}. ${escapeHtml(stage.name)}</b> · ${t("menu.online.stageHint")}</p>
          <button class="command command--primary" data-create-room>${t("menu.online.createSubmit")}</button>
        </section>
      ` : `
        <section class="online-room-list">
          <div class="online-list-head">
            <p class="kicker">${t("menu.online.openRooms")}</p>
            <button class="command command--ghost command--small" data-refresh-rooms>${t("menu.online.refresh")}</button>
          </div>
          ${roomListings.length > 0 ? roomListings.map((room) => `
            <button class="archive-card room-card" data-room-join-id="${room.roomId}" style="--accent: #22d3ee">
              <span class="archive-card__mark">${room.mapScale}x</span>
              <span class="archive-card__body">
                <strong>${escapeHtml(room.roomName)}</strong>
                <small>${escapeHtml(room.hostName)}${room.stage !== undefined ? ` · ${t("menu.common.stage", { n: getStage(room.stage).id })}` : ""} · ${t("menu.online.players", { count: room.playerCount, max: room.maxPlayers })} · ${t(room.started ? "menu.online.inProgress" : "menu.online.lobby")}</small>
              </span>
            </button>
          `).join("") : `
            <div class="selected-dossier frame online-card">
              <p class="kicker">${t("menu.online.waiting")}</p>
              <h2>${t("menu.online.noRooms")}</h2>
              <p>${t("menu.online.noRoomsHint")}</p>
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
          <button class="icon-command" data-lobby-leave aria-label="${t("menu.lobby.leave")}" title="${t("menu.lobby.leave")}">‹</button>
          <div>
            <p class="eyebrow">Lobby</p>
            <h1>${t("menu.lobby.waitingRoom")}</h1>
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
        <button class="icon-command" data-lobby-leave aria-label="${t("menu.lobby.leave")}" title="${t("menu.lobby.leave")}">‹</button>
        <div>
          <p class="eyebrow">Room Lobby${lobbyState.stage !== undefined ? ` · ${t("menu.common.stage", { n: getStage(lobbyState.stage).id })}` : ""}</p>
          <h1>${escapeHtml(lobbyState.roomName)}</h1>
        </div>
        <span class="status-pill">${lobbyState.mapScale}x Grid</span>
      </header>

      ${lobbyError ? `<p class="online-error">${escapeHtml(lobbyError)}</p>` : ""}

      <section class="selected-dossier frame online-card" style="--accent: ${classColor[selectedCharacter.id]}">
        <p class="kicker">${t("menu.lobby.players")}</p>
        <h2>${t("menu.lobby.readyCount", { ready: lobbyState.players.filter((player) => player.ready).length, total: lobbyState.players.length })}</h2>
        <div class="lobby-player-list">
          ${lobbyState.players.map((player) => `
            <div class="lobby-player-row ${player.ready ? "is-ready" : ""}">
              <strong>${escapeHtml(player.name)}</strong>
              <span>${operatorNameHtml(characters.find((character) => character.id === player.characterId)?.displayName ?? player.characterId)}${player.id === lobbySessionId && ownTitle ? ` · ${escapeHtml(ownTitle)}` : ""}</span>
              <small>${t(player.isHost ? "menu.lobby.host" : player.ready ? "menu.lobby.ready" : "menu.lobby.waiting")}</small>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="loadout-grid lobby-roster-grid">
        ${characters.map((character) => {
          const owner = lobbyState.players.find((player) => player.characterId === character.id);
          const playable = isPlayableOperator(character.id);
          return `
            <button
              class="loadout-chip ${selectedCharacter.id === character.id ? "is-active" : ""} ${owner ? "is-locked" : ""} ${playable ? "" : "is-operator-locked"}"
              data-lobby-character="${character.id}"${lockedOperatorAttributes(character.id)}
              style="--item: ${classColor[character.id]}"
            >
              <span>${owner ? escapeHtml(owner.name) : playable ? t("menu.lobby.freeSlot") : escapeHtml(t("menu.operator.locked"))}</span>
              <strong>${operatorNameHtml(character.displayName)}</strong>
              ${renderOperatorLock(character.id)}
            </button>
          `;
        }).join("")}
      </section>

      <footer class="lobby-actions">
        <button class="command ${localPlayer?.ready ? "command--ghost" : "command--primary"}" data-lobby-ready>
          ${t(localPlayer?.ready ? "menu.lobby.notReady" : "menu.lobby.setReady")}
        </button>
        ${localIsHost ? `
          <button class="command ${everyoneReady ? "command--primary" : "command--ghost"}" data-lobby-start>
            ${t("menu.lobby.start")}
          </button>
        ` : `
          <p class="online-note">${t("menu.lobby.hostNote")}</p>
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
        <button class="icon-command" data-view="home" aria-label="${t("menu.common.back")}">‹</button>
        <div>
          <p class="eyebrow">Map Forge</p>
          <h1>${t("menu.map.title")}</h1>
        </div>
        <button class="command command--small" data-start-game>${t("menu.common.start")}</button>
      </header>

      <section class="map-scale-panel">
        <div>
          <p class="kicker">${t("menu.map.scale")}</p>
          <strong>${t("menu.map.scaleValue", { scale: map.scale })}</strong>
        </div>
        <div class="scale-picker__buttons">
          <button class="scale-chip ${map.scale === 1 ? "is-active" : ""}" data-map-editor-scale="1">1x</button>
          <button class="scale-chip ${map.scale === 2 ? "is-active" : ""}" data-map-editor-scale="2">2x</button>
        </div>
      </section>

      <section class="map-records">
        <div class="map-records__head">
          <div>
            <p class="kicker">${t("menu.map.records")}</p>
            <strong>${t("menu.map.count", { n: savedMaps.length })}</strong>
          </div>
          <button class="command command--ghost command--small" data-map-action="new">${t("menu.map.new")}</button>
        </div>
        <label class="map-name-row">
          <span>${t("menu.map.name")}</span>
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
              <span>${t("menu.map.empty")}</span>
              <small>${t("menu.map.emptyHint")}</small>
            </div>
          `}
        </div>
      </section>

      <section class="map-tools" aria-label="${t("menu.map.toolsAria")}">
        ${renderTool("road", t("menu.map.tool.road"), selectedTool)}
        ${renderTool("tower", t("menu.map.tool.tower"), selectedTool)}
        ${renderTool("spawn", "Spawn", selectedTool)}
        ${renderTool("nexus", "Nexus", selectedTool)}
        ${renderTool("empty", t("menu.map.tool.empty"), selectedTool)}
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
        <span>${t("menu.map.tool.road")} <strong>${counts.road}</strong></span>
        <span>${t("menu.map.tool.tower")} <strong>${counts.tower}</strong></span>
      </section>

      <p class="map-save-status">${escapeHtml(saveStatus)}</p>

      <footer class="map-actions">
        <button class="command command--primary" data-map-action="save">${t("menu.map.save")}</button>
        <button class="command command--ghost" data-map-action="reset">${t("menu.map.reset")}</button>
        <button class="command command--ghost" data-map-action="clear">${t("menu.map.clear")}</button>
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
        <button class="icon-command" data-view="home" aria-label="${t("menu.common.back")}">‹</button>
        <div>
          <p class="eyebrow">Operator Archive</p>
          <h1>${t("menu.archive.title")}</h1>
        </div>
      </header>

      <section class="archive-list">
        ${characters.map((character) => `
          <button class="archive-card ${character.id === selectedCharacter.id ? "is-active" : ""} ${isPlayableOperator(character.id) ? "" : "is-operator-locked"}" data-character-id="${character.id}"${lockedOperatorAttributes(character.id)} style="--accent: ${classColor[character.id]}">
            <span class="archive-card__mark">${initials(character.displayName)}</span>
            <span class="archive-card__body">
              <strong>${operatorNameHtml(character.displayName)}</strong>
              <small>${isPlayableOperator(character.id) ? escapeHtml(character.role) : escapeHtml(t("menu.operator.locked"))}</small>
              ${renderMasteryMeter(getMasteryProgress(getOperatorMasteryPoints(progress.mastery, progress.badges, character.id)))}
            </span>
            ${renderOperatorLock(character.id)}
          </button>
        `).join("")}
      </section>

      <section class="selected-dossier frame" style="--accent: ${classColor[selectedCharacter.id]}">
        <p class="kicker">${t("menu.archive.active")}</p>
        <h2>${operatorNameHtml(selectedCharacter.displayName)}</h2>
        <p>${escapeHtml(selectedCharacter.summary)}</p>
        <button class="command command--primary" data-view="detail">${t("menu.archive.open")}</button>
      </section>
    </div>
  `;
}

function renderBestiary() {
  const enemies = Object.entries(enemyCombatDefinitions) as Array<[EnemyType, typeof enemyCombatDefinitions[EnemyType]]>;
  return `
    <div class="screen">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="${t("menu.common.back")}">‹</button>
        <div>
          <p class="eyebrow">Threat Bestiary</p>
          <h1>${t("menu.bestiary.title")}</h1>
        </div>
      </header>

      <section class="bestiary-grid">
        ${enemies.map(([type, definition]) => {
          const dossier = enemyDossier(type);
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
                ${renderBestiaryStat(t("menu.bestiary.armor"), definition.armor)}
                ${renderBestiaryStat(t("menu.bestiary.shield"), definition.shield)}
                ${renderBestiaryStat("Regen", t("menu.common.perSecond", { v: definition.healthRegenPerSecond }))}
                ${renderBestiaryStat(t("menu.bestiary.speed"), definition.speed)}
                ${renderBestiaryStat(t("menu.bestiary.attack"), definition.attack)}
                ${attackRange ? renderBestiaryStat(t("menu.bestiary.range"), attackRange) : ""}
                ${renderBestiaryStat(t("menu.bestiary.gold"), definition.reward)}
              </dl>
              <div class="bestiary-tags">
                <span>${escapeHtml(t("menu.bestiary.race", { race: formatEnemyRace(definition.race) }))}</span>
                <span>${t(movementKind === "air" ? "menu.bestiary.air" : "menu.bestiary.ground")}</span>
                <span>${escapeHtml(t("menu.bestiary.threat", { threat: dossier.threat }))}</span>
                ${abilities.map((ability) => `<span>${escapeHtml(formatEnemyAbility(ability))}</span>`).join("")}
              </div>
              <div class="bestiary-notes">
                ${formatResistanceLine(t("menu.bestiary.resist.damage"), getEnemyDamageResistances(definition))}
                ${formatResistanceLine(t("menu.bestiary.resist.hit"), definition.hitTypeResistances)}
                ${formatResistanceLine(t("menu.bestiary.resist.status"), definition.statusResistances)}
              </div>
            </article>
          `;
        }).join("")}
      </section>

      <section class="selected-dossier frame">
        <p class="kicker">${t("menu.bestiary.races")}</p>
        <h2>${t("menu.bestiary.racesTitle")}</h2>
        <div class="bestiary-race-gallery">
          ${enemyRaceOrder.map((race) => `
            <article class="bestiary-race-row">
              <strong>${escapeHtml(formatEnemyRace(race))}</strong>
              <div>
                ${enemyTypeOrder.map((type) => `
                  <figure style="--enemy: ${enemyColor(type)}">
                    <img class="${getEnemyImageClass(race, type)}" src="${getEnemyImagePath(race, type)}" alt="" loading="lazy" />
                    <figcaption>${escapeHtml(enemyTypeLabel(type))}</figcaption>
                  </figure>
                `).join("")}
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="selected-dossier frame">
        <p class="kicker">${t("menu.bestiary.waveVariant")}</p>
        <h2>${t("menu.bestiary.flyingTitle")}</h2>
        <p>${t("menu.bestiary.flyingText")}</p>
      </section>

      ${renderSpecialThreats()}
    </div>
  `;
}

/**
 * Ozel tehditler: kule avcisi, isitici, enerji yiyici ve karsi atak. Ortak
 * dusman tanimlarindan (enemyCombatDefinitions) gelmiyorlar, o yuzden ayri
 * kucuk bir liste. Gorsel oyundaki isaretin kendisi: koseli ayrac, kesik
 * halka, altigen, asagi bakan sivri oklar (sert, parlamasiz).
 */
const specialThreats = [
  { id: "hunter", threat: "high", color: "#c8473a", glyph: '<path d="M10 22V10h12M42 10h12v12M54 42v12H42M22 54H10V42M32 4v10" />' },
  { id: "heater", threat: "medium", color: "#c8743e", glyph: '<circle cx="32" cy="32" r="26" stroke-dasharray="6 6" stroke-width="1.5" /><path d="M32 18a14 14 0 0 1 12 7M44 39a14 14 0 0 1-12 7M20 39a14 14 0 0 1 0-14" />' },
  { id: "eater", threat: "medium", color: "#3fa7b5", glyph: '<path d="M50 32 41 47.6H23L14 32l9-15.6h18Z" /><path d="M41 32h18" stroke-width="1.5" /><path d="M48 30h4v4h-4z" fill="currentColor" />' },
  { id: "surge", threat: "high", color: "#d0603e", glyph: '<path d="M14 8h36M14 8v8M50 8v8M18 20l6 5 6-5M28 20l4 3 4-3M34 20l6 5 6-5" /><path d="M14 44h36" stroke-width="3" /><path d="M14 30h36" stroke-width="1" opacity=".5" />' }
] as const;

function renderSpecialThreats() {
  return `
      <section class="selected-dossier frame">
        <p class="kicker">${t("menu.bestiary.specialKicker")}</p>
        <h2>${t("menu.bestiary.specialTitle")}</h2>
        <p>${t("menu.bestiary.specialText")}</p>
      </section>

      <section class="bestiary-grid">
        ${specialThreats.map((entry) => `
          <article class="bestiary-card bestiary-card--special" style="--enemy: ${entry.color}">
            <div class="bestiary-card__visual" aria-hidden="true">
              <svg class="bestiary-special-glyph" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square">${entry.glyph}</svg>
            </div>
            <div class="bestiary-card__copy">
              <p class="kicker">${escapeHtml(t(`menu.enemy.${entry.id}.title`))}</p>
              <h2>${escapeHtml(t(`menu.enemy.${entry.id}.name`))}</h2>
              <p>${escapeHtml(t(`menu.enemy.${entry.id}.summary`))}</p>
            </div>
            <div class="bestiary-tags">
              <span>${escapeHtml(t("menu.bestiary.threat", { threat: t(`menu.enemy.threat.${entry.threat}`) }))}</span>
              <span>${escapeHtml(t("menu.bestiary.fromStage", { n: SPECIAL_ENEMIES_FIRST_STAGE }))}</span>
              ${entry.id === "surge" ? `<span>${escapeHtml(t("menu.bestiary.fromWave", { n: COUNTER_SURGE_FIRST_WAVE }))}</span>` : ""}
            </div>
          </article>
        `).join("")}
      </section>
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
  const built = buildCardArchiveView(state.archive);
  // Bolum adlari ("Kartlar"/"Eşyalar") paylasilan gorunumde Turkce sabit; dile gore burada.
  const view = {
    cards: { ...built.cards, label: t("menu.cardArchive.cards") },
    items: { ...built.items, label: t("menu.cardArchive.items") }
  };
  const section = state.tab === "items" ? view.items : view.cards;
  const empty = view.cards.seen === 0 && view.items.seen === 0;
  return `
    <div class="screen screen--card-archive">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="${t("menu.common.back")}">‹</button>
        <div>
          <p class="eyebrow">${t("menu.cardArchive.eyebrow")}</p>
          <h1>${t("menu.cardArchive.title")}</h1>
        </div>
      </header>

      <section class="card-archive__summary selected-dossier frame">
        <div class="card-archive__meters">
          ${renderArchiveMeter(view.cards)}
          ${renderArchiveMeter(view.items)}
        </div>
        <p>${t(empty ? "menu.cardArchive.empty" : "menu.cardArchive.seen")} ${t("menu.cardArchive.note")}</p>
        ${state.available ? "" : `<p class="card-archive__warning">${t("menu.cardArchive.noStorage")}</p>`}
      </section>

      <div class="card-archive__tabs" role="tablist" aria-label="${t("menu.cardArchive.tabsAria")}">
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
      <p><span>${escapeHtml(section.label)}</span><b>${section.seen}/${section.total}</b><small>${t("format.percent", { v: section.percent })}</small></p>
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
  const lockedKey = kind === "cards" ? "menu.cardArchive.lockedCards" : "menu.cardArchive.lockedItems";
  const locked = group.total - group.seen;
  const entries = group.entries.map((entry) => entry.seen
    ? `
      <article class="card-archive__entry">
        <header>
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(entry.tag)}</span>
        </header>
        <p>${escapeHtml(entry.description)}</p>
        ${entry.picks > 0 ? `<small>${t("menu.cardArchive.picked", { n: entry.picks })}</small>` : ""}
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
      ${locked > 0 ? `<div class="card-archive__locked" role="img" aria-label="${escapeHtml(t(lockedKey, { group: group.label, n: locked }))}">${silhouettes}</div>` : ""}
    </section>
  `;
}

/** Bu tarayicinin secili ve acilmis unvani; yoksa yok. Takim arkadasina gitmiyor. */
function getSelectedTitle(progress: ProgressState) {
  return resolveCosmetics(progress.cosmetics, getCosmeticFacts(progress.mastery, progress.badges)).title;
}

/** Ustalik cubugu: "Ustalık 3 · 140/200"; son seviyede "Ustalık 10 · tam". */
function renderMasteryMeter(mastery: ReturnType<typeof getMasteryProgress>) {
  const text = mastery.next === undefined
    ? t("menu.mastery.max", { level: mastery.level })
    : t("menu.mastery.progress", { level: mastery.level, points: mastery.points, next: mastery.next });
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
            <strong>${operatorNameHtml(character.displayName)}</strong>
            ${renderMasteryMeter(mastery)}
          </li>`;
  }).join("");
  return `
    <div class="screen screen--badges">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="${t("menu.common.back")}">‹</button>
        <div>
          <p class="eyebrow">${t("menu.badges.eyebrow")}</p>
          <h1>${t("menu.badges.title")}</h1>
        </div>
      </header>

      <section class="card-archive__summary selected-dossier frame">
        <div class="card-archive__meter">
          <p><span>${t("menu.badges.title")}</span><b>${view.earned}/${view.total}</b><small>${t("format.percent", { v: percent })}</small></p>
          <i style="--fill: ${percent}%" aria-hidden="true"></i>
        </div>
        <p>${t("menu.badges.summary")}</p>
        ${progress.available ? "" : `<p class="card-archive__warning">${t("menu.badges.noStorage")}</p>`}
      </section>

      <section class="badge-board__section">
        <p class="section-label">${t("menu.badges.mastery")}</p>
        <ul class="mastery-list">${operators}</ul>
        <p class="badge-board__hint">${t("menu.badges.masteryHint")}</p>
      </section>

      <section class="card-archive__groups">
        ${view.groups.map(renderBadgeGroup).join("")}
      </section>

      <section class="badge-board__section">
        <p class="section-label">${t("menu.badges.appearance")}</p>
        <p class="badge-board__hint">${t("menu.badges.appearanceHint")}</p>
        <div class="cosmetic-group" role="group" aria-label="${t("menu.badges.titleGroup")}">
          <p class="cosmetic-group__label">${t("menu.badges.titleGroup")}</p>
          <div class="cosmetic-chips">
            <button type="button" class="cosmetic-chip${noTitle ? " is-active" : ""}" data-cosmetic-title="" aria-pressed="${noTitle}">${t("menu.badges.noTitle")}</button>
            ${cosmetics.titles.map((title) => renderCosmeticChip(title, "title")).join("")}
          </div>
        </div>
        <div class="cosmetic-group" role="group" aria-label="${t("menu.badges.stamp")}">
          <p class="cosmetic-group__label">${t("menu.badges.stamp")}</p>
          <div class="cosmetic-chips">${cosmetics.stamps.map((stamp) => renderCosmeticChip(stamp, "stamp")).join("")}</div>
        </div>
        <div class="cosmetic-group" role="group" aria-label="${t("menu.badges.crown")}">
          <p class="cosmetic-group__label">${t("menu.badges.crown")} <small>${cosmetics.crown.unlocked ? t("menu.badges.crownWhere") : escapeHtml(describeUnlock(CROWN_UNLOCK, cosmetics.crown.condition))}</small></p>
          <div class="cosmetic-chips">
            <button type="button" class="cosmetic-chip${cosmetics.crown.on ? " is-active" : ""}" data-cosmetic-crown="on" aria-pressed="${cosmetics.crown.on}"${cosmetics.crown.unlocked ? "" : " disabled"}>${t("menu.badges.on")}</button>
            <button type="button" class="cosmetic-chip${cosmetics.crown.on ? "" : " is-active"}" data-cosmetic-crown="off" aria-pressed="${!cosmetics.crown.on}"${cosmetics.crown.unlocked ? "" : " disabled"}>${t("menu.badges.off")}</button>
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
    const unlock = kind === "title"
      ? TITLE_CATALOG.find((title) => title.id === option.id)?.unlock
      : STAMP_CATALOG.find((stamp) => stamp.id === option.id)?.unlock;
    const condition = describeUnlock(unlock, option.condition);
    return `<button type="button" class="cosmetic-chip is-locked" ${attribute} disabled aria-label="${escapeHtml(t("menu.badges.lockedAria", { label: option.label, condition }))}"><b>${escapeHtml(option.label)}</b><small>${escapeHtml(condition)}</small></button>`;
  }
  return `<button type="button" class="cosmetic-chip${option.selected ? " is-active" : ""}" ${attribute} aria-pressed="${option.selected}">${escapeHtml(option.label)}</button>`;
}

/**
 * Kilitli kozmetigin kosulu secili dilde. Paylasilan `describeCosmeticUnlock`
 * Turkce yaziyor; Turkce kalip burada da ayni, nisan ve operator adi
 * katalogdan (dile bakan okuyucu). Taninmayan kilitte paylasilan metin kaliyor.
 */
function describeUnlock(unlock: CosmeticUnlock | undefined, fallback: string) {
  if (!unlock) return fallback;
  if (unlock.kind === "badge") {
    const badge = getBadgeDefinition(unlock.badgeId);
    return badge ? t("menu.badges.unlock.badge", { badge: badge.name }) : fallback;
  }
  if (unlock.characterId) {
    const operator = characters.find((character) => character.id === unlock.characterId)?.displayName;
    return operator ? t("menu.badges.unlock.operator", { operator, level: unlock.level }) : fallback;
  }
  return t("menu.badges.unlock.any", { level: unlock.level });
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
  const tag = entry.earned ? t("menu.badges.earned") : entry.longTerm ? t("menu.badges.longTerm") : operator ?? t("menu.badges.locked");
  const progress = entry.progress
    ? `<span class="badge-entry__progress" role="img" aria-label="${escapeHtml(t("menu.badges.progressAria", { text: entry.progress.text }))}"><i style="--fill: ${entry.progress.percent}%"></i><small>${escapeHtml(entry.progress.text)}</small></span>`
    : "";
  return `
      <article class="card-archive__entry badge-entry${entry.earned ? " is-earned" : " is-locked"}">
        <header>
          <strong>${entry.earned ? "◈" : "◇"} ${escapeHtml(entry.name)}</strong>
          <span>${!entry.earned && !entry.longTerm && operator ? operatorNameHtml(operator) : escapeHtml(tag)}</span>
        </header>
        <p>${escapeHtml(entry.condition)}</p>
        ${progress}
      </article>
  `;
}

/**
 * Emegi gecenler: ucuncu taraf kaynaklar (apps/web/src/credits.ts; CREDITS.md
 * ile ayni liste). Eser adlari ve lisanslar cevrilmiyor; baglantilar yeni
 * sekmede (itch iframe'inden cikiyor).
 */
function renderCredits() {
  return `
    <div class="screen screen--credits">
      <header class="screen-topbar">
        <button class="icon-command" data-view="home" aria-label="${t("menu.common.back")}">‹</button>
        <div>
          <p class="eyebrow">${t("credits.eyebrow")}</p>
          <h1>${t("credits.title")}</h1>
        </div>
      </header>

      <section class="selected-dossier frame">
        <p class="kicker">${t("credits.game.label")}</p>
        <h2>Nexhold</h2>
        <p>${escapeHtml(t("credits.game.body", { developer: CREDITS_DEVELOPER }))}</p>
        <p>${escapeHtml(t("credits.intro"))}</p>
      </section>

      ${CREDIT_GROUPS.map((group) => `
        <section class="credits-group" aria-label="${escapeHtml(t(group.titleKey))}">
          <p class="section-label">${escapeHtml(t(group.titleKey))} <b>${group.sources.length}</b></p>
          <p class="credits-group__note">${escapeHtml(t(group.noteKey))}</p>
          <ul class="credits-list">
            ${group.sources.map((source) => `
              <li class="credits-entry">
                <strong>${escapeHtml(source.title)}</strong>
                <span class="credits-entry__author">${escapeHtml(source.author)}</span>
                <span class="credits-entry__license"><small>${t("credits.license")}</small>${escapeHtml(source.license)}</span>
                <a class="credits-entry__link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(t("credits.linkAria", { title: source.title }))}">${escapeHtml(creditLinkLabel(source.url))}</a>
              </li>`).join("")}
          </ul>
        </section>`).join("")}
    </div>
  `;
}

function renderDetail(character: CharacterDefinition, selectedDetail: DetailItem) {
  const details = getDetailItems(character);
  return `
    <div class="screen" style="--accent: ${classColor[character.id]}">
      <header class="screen-topbar detail-topbar">
        <button class="icon-command" data-view="archive" aria-label="${t("menu.detail.backAria")}">‹</button>
        <div>
          <p class="eyebrow">Operator Dossier</p>
          <h1>${operatorNameHtml(character.displayName)}</h1>
        </div>
        <button class="command command--small command--primary" data-start-game>${t("menu.common.start")}</button>
      </header>

      <section class="dossier-hero frame">
        ${renderSigil(character.id, initials(character.displayName))}
        <div class="dossier-copy">
          <strong>${escapeHtml(character.role)}</strong>
          <p>${escapeHtml(character.summary)}</p>
        </div>
      </section>

      <section class="loadout-grid">
        ${details.map((item) => `
          <button class="loadout-chip ${item.key === selectedDetail.key ? "is-active" : ""}" data-detail-key="${item.key}" style="--item: ${item.color}">
            <span>${detailTypeLabel(item.type)}</span>
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
      title: splitTitle(character.passive).title ?? detailTypeLabel("passive"),
      label: detailTypeLabel("passive"),
      type: "passive",
      color: "#34d399",
      blocks: [{ kind: "brief", text: splitTitle(character.passive).body }]
    },
    {
      key: "ultimate",
      title: splitTitle(character.ultimate).title ?? detailTypeLabel("ultimate"),
      label: detailTypeLabel("ultimate"),
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

// Yetenek, irk ve direnc adlari sozlukte; bilinmeyen kimlik oldugu gibi yaziliyor.
function formatEnemyAbility(ability: string) {
  return tMaybe(`menu.enemy.ability.${ability}`) ?? ability;
}

function formatEnemyRace(race: string) {
  return tMaybe(`menu.enemy.race.${race}`) ?? race;
}

function getEnemyImagePath(race: EnemyRace, type: EnemyType) {
  return race === "meka" ? assetUrl(`images/enemies/enemy-${type}.png`) : assetUrl(`images/enemies/enemy-${race}-${type}.png`);
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
    return `<p><strong>${label}</strong><span>${t("menu.bestiary.resist.none")}</span></p>`;
  }

  return `
    <p>
      <strong>${label}</strong>
      <span>${entries.map(([key, value]) => `${formatResistanceKey(key)} ${formatResistanceValue(value)}`).join(" · ")}</span>
    </p>
  `;
}

function formatResistanceKey(key: string) {
  return tMaybe(`menu.enemy.resist.${key}`) ?? key;
}

function formatResistanceValue(value: number) {
  const percent = Math.round(Math.abs(value) * 100);
  return t(value < 0 ? "menu.bestiary.resist.weak" : "menu.bestiary.resist.strong", { v: percent });
}

function skillToDetail(skill: SkillDefinition): DetailItem {
  return {
    key: `skill-${skill.id}`,
    title: skill.name,
    label: detailTypeLabel("skill"),
    type: "skill",
    color: "#22d3ee",
    blocks: [
      { kind: "brief", text: skill.description },
      {
        kind: "stats",
        label: t("menu.detail.usage"),
        rows: [{ label: t("menu.detail.cooldown"), value: t("menu.common.seconds", { v: (skill.cooldownMs / 1000).toFixed(1) }) }]
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
  // Yuzde isareti dile gore (TR "%40", EN "40%"); kart adi katalogdan.
  const yuzde = (value: number) => t("format.percent", { v: Math.round(value * 100) });
  const card = getCardDefinition("buz-kirigi")?.name ?? "Buz Kırığı";
  if (slow?.scaling === "distance") {
    return [{
      label: t("menu.tower.slowStrength"),
      value: t("menu.tower.slowByDistance", { from: yuzde(0), to: yuzde(KIN_SLOW_FAR_FRACTION) }),
      hint: t("menu.tower.slowByDistanceHint", { far: yuzde(KIN_SLOW_FAR_FRACTION), card, max: yuzde(getCriticalSlowFraction(KIN_SLOW_FAR_FRACTION)) })
    }];
  }
  const level1 = getTowerHitSlowFraction(tower, 1);
  if (level1 === undefined) return [];
  const level10 = getTowerHitSlowFraction(tower, 10) ?? level1;
  const grows = Math.abs(level10 - level1) > 1e-9;
  return [{
    label: t("menu.tower.slowStrength"),
    value: grows ? `${yuzde(level1)} → ${yuzde(level10)}` : yuzde(level1),
    hint: grows
      ? t("menu.tower.slowGrowsHint", { card, max: yuzde(getCriticalSlowFraction(level10)) })
      : t("menu.tower.slowFlatHint", { card, max: yuzde(getCriticalSlowFraction(level1)) })
  }];
}

function towerToDetail(tower: TowerDefinition): DetailItem {
  // Saldirmayan kule (Sunucu): atis araligi, alan, hasar ve vurus tipi satiri yok.
  const neverAttacks = towerNeverAttacks(tower);
  const isPassiveTower = neverAttacks || (tower.fireIntervalMs ?? 0) > 100000;
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
    label: t("menu.tower.profile"),
    rows: [
      { label: t("menu.tower.class"), value: classTypeCodex[classType]?.name ?? classType, hint: classTypeCodex[classType]?.text },
      ...(neverAttacks ? [] : [
        { label: t("menu.tower.damageType"), value: damageTypeCodex[damageType]?.name ?? damageType, hint: damageTypeCodex[damageType]?.text },
        { label: t("menu.tower.hitType"), value: hitTypeCodex[hitType]?.name ?? hitType, hint: hitTypeCodex[hitType]?.text }
      ]),
      {
        label: t("menu.tower.range"),
        value: level1.hasGlobalRange ? t("menu.tower.rangeGlobal") : `${level1.range.toFixed(0)} → ${level10.range.toFixed(0)}`,
        hint: t(level1.hasGlobalRange ? "menu.tower.rangeGlobalHint" : "menu.tower.levelSpan")
      },
      ...(level1.minimumRange > 0
        ? [{ label: t("menu.tower.deadZone"), value: `${level1.minimumRange.toFixed(0)}`, hint: t("menu.tower.deadZoneHint") }]
        : []),
      ...(isPassiveTower
        ? []
        : [{
            label: t("menu.tower.fireInterval"),
            value: level1.hasFixedFireInterval
              ? t("menu.tower.fireIntervalFixed", { v: (level1.realFireIntervalMs / 1000).toFixed(2) })
              : t("menu.common.secondsRange", { from: (level1.realFireIntervalMs / 1000).toFixed(2), to: (level10.realFireIntervalMs / 1000).toFixed(2) }),
            hint: t(level1.hasFixedFireInterval ? "menu.tower.fireIntervalFixedHint" : "menu.tower.fireIntervalHint")
          }]),
      ...(!neverAttacks && tower.engine?.canHitAir !== undefined
        ? [{
            label: t("menu.tower.air"),
            value: t(tower.engine.canHitAir ? "menu.tower.airYes" : "menu.tower.airNo"),
            hint: t("menu.tower.airHint")
          }]
        : []),
      ...(!neverAttacks && getTowerAttackRadius(tower) > 0 ? [{ label: t("menu.tower.area"), value: String(getTowerAttackRadius(tower)) }] : []),
      ...(getTowerSlowDurationMs(tower) > 0 ? [{ label: t("menu.tower.slow"), value: t("menu.common.seconds", { v: (getTowerSlowDurationMs(tower) / 1000).toFixed(2) }) }] : []),
      ...formatSlowStrengthRow(tower)
    ]
  });

  blocks.push({
    kind: "stats",
    label: t("menu.tower.economy"),
    rows: [
      { label: t("menu.tower.build"), value: t("menu.tower.gold", { v: getTowerBuildCost(tower.cost) }) },
      ...[2, 3, 4].map((level) => ({
        label: t("menu.common.level", { n: level }),
        value: t("menu.tower.xp", { v: getTowerLevelExpCost(tower.cost, level - 1) })
      }))
    ]
  });

  if (!isPassiveTower && tower.damage > 0) {
    blocks.push({
      kind: "stats",
      label: t("menu.tower.power"),
      rows: [
        { label: t("menu.tower.levelHit", { n: 1 }), value: level1.damage.toFixed(1) },
        { label: t("menu.tower.levelHit", { n: 10 }), value: level10.damage.toFixed(1) },
        { label: t("menu.tower.levelDps", { n: 1 }), value: formatDps(tower, 1) },
        { label: t("menu.tower.levelDps", { n: 10 }), value: formatDps(tower, 10), hint: t("menu.tower.dpsHint") }
      ]
    });
  }

  const balanceNote = tMaybe(`menu.tower.balance.${tower.id}`);
  if (balanceNote) {
    blocks.push({ kind: "note", text: balanceNote });
  }

  const evolutionNotes = getTowerEvolutionArchiveNotes(tower);
  if (evolutionNotes.length > 0) {
    blocks.push({ kind: "steps", label: t("menu.tower.evolutions"), items: evolutionNotes });
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

/**
 * Evrim adimlari (kule basina uc). Metinler sozlukte `menu.tower.evo.<kule>.<n>`;
 * sozlukte olmayan kulede liste bos, adim yazilmiyor.
 */
function getTowerEvolutionArchiveNotes(tower: TowerDefinition) {
  return [1, 2, 3]
    .map((step) => tMaybe(`menu.tower.evo.${tower.id}.${step}`))
    .filter((note): note is string => note !== undefined);
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
      return [createSavedMapRecord(normalizeMapData(JSON.parse(rawLegacyMap)), t("menu.map.legacyName"), "legacy-map")];
    }
  } catch {
    return [];
  }

  return [];
}

function saveStoredMap(map: EditableMapData, name: string, existingId = "") {
  const normalizedMap = normalizeMapData(map);
  const recordName = name.trim().slice(0, 28) || t("menu.map.fallbackName");
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
    name: name.trim().slice(0, 28) || t("menu.map.fallbackName"),
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
      name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 28) : t("menu.map.fallbackName"),
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

/**
 * Operator adi metin olarak. Adlar Ingilizce yazimli (DualiTemp, Bioside);
 * sayfa lang="tr" oldugu icin CSS uppercase "i"yi "İ" yapiyordu
 * (DUALİTEMP). lang="en" buyuk harfe cevirmeyi Ingilizce kuralla yapar.
 */
function operatorNameHtml(name: string) {
  return `<span lang="en">${escapeHtml(name)}</span>`;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Hatanin kendi metni (cogu sunucudan, Turkce) varsa o; yoksa yerel yedek.
 * Sunucunun bilinen redleri ("Oda dolu." gibi) secili dilde.
 */
function formatUiError(error: unknown, fallback: MessageKey): UiText {
  if (error instanceof Error && error.message.trim()) {
    return () => describeServerError(error);
  }

  return uiText(fallback);
}
