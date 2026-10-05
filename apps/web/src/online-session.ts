import { Client, Room } from "colyseus.js";

let sharedClient: Client | undefined;
let activeLobbyRoom: Room | undefined;

export function isSeatReservationExpiredError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.toLocaleLowerCase("en-US").includes("seat reservation expired");
}

const SEAT_RESERVATION_RETRY_DELAYS_MS = [600, 1800];

const delay = (ms: number) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

/**
 * Suresi dolmus koltuk rezervasyonunda yeniden dener.
 *
 * Rezervasyonun dolmasinin tipik sebebi sunucunun o an mesgul olmasi: uyuyan bir
 * Fly makinesi uyaniyor ya da deploy sirasinda makine degisiyor. Bu yuzden
 * denemeler arasinda beklemek sart -- eski surum aninda tekrar deniyordu ve
 * makine hala hazir olmadigi icin ayni pencereye ikinci kez carpiyordu.
 */
export async function retryExpiredSeatReservation<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= SEAT_RESERVATION_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSeatReservationExpiredError(error)) throw error;
      lastError = error;
      const wait = SEAT_RESERVATION_RETRY_DELAYS_MS[attempt];
      if (wait !== undefined) await delay(wait);
    }
  }
  throw lastError;
}

export function getSharedClient(serverUrl: string) {
  if (!sharedClient) {
    sharedClient = new Client(serverUrl);
  }

  return sharedClient;
}

export function setActiveLobbyRoom(room: Room | undefined) {
  activeLobbyRoom = room;
}

export function getActiveLobbyRoom() {
  return activeLobbyRoom;
}

export function clearActiveLobbyRoom(expectedRoomId?: string) {
  if (!activeLobbyRoom) {
    return;
  }

  if (!expectedRoomId || activeLobbyRoom.roomId === expectedRoomId) {
    activeLobbyRoom = undefined;
  }
}

/**
 * Suren macin yeniden baglanma kaydi.
 *
 * Sayfa yenilenince (ya da mobil tarayici sekmeyi oldurunce) bellekteki oda
 * ve yeniden baglanma anahtari kayboluyordu; geri donmenin tek yolu oda
 * listesiydi. Sunucu kopan oyuncunun yuvasini pencere boyunca ona ayiriyor,
 * yani anahtari olmayan oyuncu kendi yuvasina bu sure icinde donemiyordu.
 * Kayit sekmeye bagli (`sessionStorage`): ayni sekmede yeniden yuklemede
 * duruyor, baska sekmeye ya da cihaza tasinmiyor.
 */
export type MatchReconnectRecord = {
  roomId: string;
  token: string;
  /** Solo ve co-op kayitlari ayri anahtarlarda: sahne kipi buradan. */
  mode: "solo" | "online";
  characterId: string;
  mapScale: number;
  stage: number;
  savedAt: number;
};

const MATCH_RECONNECT_KEY = "karayel:match-reconnect";
/** Sunucu terk edilmis odayi bundan once kapatmiyor; daha eski kayit denenmiyor. */
const MATCH_RECONNECT_MAX_AGE_MS = 15 * 60 * 1000;

export function saveMatchReconnect(room: Room, info: Omit<MatchReconnectRecord, "roomId" | "token" | "savedAt">) {
  if (!room.reconnectionToken) return;
  const record: MatchReconnectRecord = { ...info, roomId: room.roomId, token: room.reconnectionToken, savedAt: Date.now() };
  try {
    window.sessionStorage.setItem(MATCH_RECONNECT_KEY, JSON.stringify(record));
  } catch {
    // Gizli pencere ya da kapali depolama: yeniden baglanma yalnizca listeden.
  }
}

export function loadMatchReconnect(): MatchReconnectRecord | undefined {
  try {
    const raw = window.sessionStorage.getItem(MATCH_RECONNECT_KEY);
    if (!raw) return undefined;
    const record = JSON.parse(raw) as Partial<MatchReconnectRecord>;
    if (typeof record.token !== "string" || typeof record.roomId !== "string" || typeof record.characterId !== "string"
      || (record.mode !== "solo" && record.mode !== "online") || typeof record.savedAt !== "number"
      || Date.now() - record.savedAt > MATCH_RECONNECT_MAX_AGE_MS) {
      clearMatchReconnect();
      return undefined;
    }
    return {
      roomId: record.roomId,
      token: record.token,
      mode: record.mode,
      characterId: record.characterId,
      mapScale: typeof record.mapScale === "number" ? record.mapScale : 1,
      stage: typeof record.stage === "number" ? record.stage : 1,
      savedAt: record.savedAt
    };
  } catch {
    return undefined;
  }
}

/** Kaydi siler; oda verilirse yalnizca o odanin kaydini. */
export function clearMatchReconnect(expectedRoomId?: string) {
  try {
    if (expectedRoomId) {
      const raw = window.sessionStorage.getItem(MATCH_RECONNECT_KEY);
      const record = raw ? JSON.parse(raw) as Partial<MatchReconnectRecord> : undefined;
      if (record?.roomId !== expectedRoomId) return;
    }
    window.sessionStorage.removeItem(MATCH_RECONNECT_KEY);
  } catch {
    // Depolama yoksa silinecek bir sey de yok.
  }
}

/**
 * Yeniden yuklemeden sonra suren maca donulen oda; sahne `create` yerine onu
 * kullaniyor. Kip kayittan: solo mac co-op rekoru olarak yazilmasin.
 */
let resumedMatch: { room: Room; mode: "solo" | "online" } | undefined;

export function setResumedMatch(room: Room, mode: "solo" | "online") {
  resumedMatch = { room, mode };
}

export function takeResumedMatch() {
  const match = resumedMatch;
  resumedMatch = undefined;
  return match;
}

/** Kayitli anahtarla odaya donmeyi dener; olmazsa kaydi silip `undefined` doner. */
export async function resumeSavedMatch(serverUrl: string, record: MatchReconnectRecord) {
  try {
    return await getSharedClient(serverUrl).reconnect(record.token);
  } catch {
    clearMatchReconnect(record.roomId);
    return undefined;
  }
}
